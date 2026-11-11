/* Guitar Revolution Strobe Tuner - audio worklet.
   Runs on every input sample:
   1. Heterodyne strobe: mix the input with a reference phasor at the target frequency
      (bands: 1st, 2nd and 4th harmonic), low-pass I and Q, phase = atan2(Q, I).
      The phase turns at the beat frequency: still when in tune, + when sharp, - when flat.
      Each band's low-pass is as narrow as the +-40 cent capture range allows (keeps hum and
      neighbouring strings out). The reading is the lowest partial: the 2nd/4th harmonic beats
      are corrected for string stiffness (inharmonicity, partials run slightly sharp), and a band
      that disagrees with the others (another string ringing into it) is dropped.
   2. Pitch finder: anti-alias, decimate to ~12 kHz, YIN with parabolic interpolation and
      an octave guard (weak fundamentals on low strings).
   Nothing is stored beyond a few seconds of numbers in memory; no audio leaves the device. */
'use strict';
const TAU = Math.PI * 2;
const HARM = [1, 2, 4];

function lpCoefs(fc, sr) {               // RBJ biquad low-pass, Q = 0.7071
  const w = TAU * fc / sr, c = Math.cos(w), s = Math.sin(w), al = s / (2 * 0.7071);
  const a0 = 1 + al;
  return [(1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, -2 * c / a0, (1 - al) / a0];
}

class StrobeTuner extends AudioWorkletProcessor {
  constructor() {
    super();
    const sr = sampleRate;
    this.sr = sr;
    // --- pitch finder (decimated YIN) ---
    this.D = Math.max(1, Math.round(sr / 12000));
    this.dsr = sr / this.D;
    this.aa = lpCoefs(Math.min(2600, this.dsr * 0.42), sr);
    this.z = new Float64Array(4);          // two cascaded biquads (DF2T), 2 states each
    this.dcount = 0;
    this.RN = 4096; this.ring = new Float32Array(this.RN); this.rw = 0; this.filled = 0;
    this.W = 1024; this.hop = 512; this.sinceHop = 0;
    this.minLag = Math.max(2, Math.floor(this.dsr / 1400));
    this.maxLag = Math.ceil(this.dsr / 60);
    this.frame = new Float32Array(this.W + this.maxLag + 2);
    this.dif = new Float32Array(this.maxLag + 2);
    this.cm = new Float32Array(this.maxLag + 2);
    // --- strobe demodulator ---
    this.strings = [];
    this.target = 0; this.ph = 0; this.dph = 0; this.ab = new Float64Array(3);
    this.st = new Float64Array(3 * 2 * 3); // band x (I,Q) x 3 one-pole stages
    this.unw = new Float64Array(3); this.prev = new Float64Array(3); this.mag = new Float64Array(3);
    this.started = false;
    const H = Math.ceil(sr / 128 * 1.2);
    this.H = H; this.hist = [new Float64Array(H), new Float64Array(H), new Float64Array(H)];
    this.hmag = new Float64Array(H);
    this.hw = 0; this.hn = 0;
    this.winBlocks = Math.round(0.6 * sr / 128);
    this.blk = 0; this.hold = 0; this.settle = 0; this.glitches = 0; this.jump = 0.15;
    this.slopeBlk = new Float64Array(3);
    // --- level / onset ---
    // presence: smoothed level vs an adaptive floor (steady hum / fan noise is the floor, not a note)
    this.slow = 0; this.present = false; this.quiet = 0; this.onsetBlk = -1e9;
    this.gate = 0.0005;                     // about -66 dBFS: a phone on a stand 1 m away still counts
    this.ms = 0; this.lvl = 0; this.floor = 0.05; this.rise = Math.pow(10, 1 / 20 / (sr / 128)); // floor creeps up 1 dB/s
    this.fr = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.target !== undefined) this.setTarget(m.target);
      if (m.gate !== undefined) this.gate = m.gate;
      if (m.strings !== undefined) this.strings = m.strings;   // the tuning's string frequencies
    };
  }

  setTarget(f) {
    if (!(f > 0)) { this.target = 0; return; }
    if (Math.abs(f - this.target) < 1e-9) return;
    this.target = f;
    this.dph = TAU * f / this.sr;
    // band b passes beats up to about +-60 cents of harmonic HARM[b]
    for (let b = 0; b < 3; b++) this.ab[b] = 1 - Math.exp(-TAU * Math.min(220, Math.max(2.5, HARM[b] * f / 24)) / this.sr);
    const fc = Math.max(2.5, f / 24);
    this.st.fill(0); this.started = false;
    this.hn = 0;
    this.settle = Math.ceil(4 / (TAU * fc) * this.sr / 128);
    this.hold = this.settle + Math.ceil(0.03 * this.sr / 128);   // let the filters settle
  }

  yin() {
    const W = this.W, L = this.maxLag, x = this.frame, N = W + L + 1, RN = this.RN;
    let r = (this.rw - N + RN) % RN;
    for (let i = 0; i < N; i++) { x[i] = this.ring[r]; r = (r + 1) % RN; }
    const d = this.dif, cm = this.cm;
    for (let tau = 1; tau <= L; tau++) {
      let s = 0;
      for (let j = 0; j < W; j++) { const v = x[j] - x[j + tau]; s += v * v; }
      d[tau] = s;
    }
    cm[0] = 1; let run = 0;
    for (let tau = 1; tau <= L; tau++) { run += d[tau]; cm[tau] = run > 0 ? d[tau] * tau / run : 1; }
    // local minima below 0.4
    let gmin = 1e9;
    for (let t = this.minLag; t < L; t++) if (cm[t] < cm[t - 1] && cm[t] <= cm[t + 1] && cm[t] < gmin) gmin = cm[t];
    if (gmin > 0.4) return null;
    // octave guard: smallest lag whose dip is nearly as deep as the deepest one
    const tol = 0.03 + 0.25 * gmin;
    let best = -1;
    for (let t = this.minLag; t < L; t++) {
      if (cm[t] < cm[t - 1] && cm[t] <= cm[t + 1] && cm[t] <= gmin + tol) { best = t; break; }
    }
    if (best < 0) return null;
    const a = cm[best - 1], b = cm[best], c = cm[best + 1];
    const den = a - 2 * b + c;
    const tp = best + (den > 0 ? 0.5 * (a - c) / den : 0);
    // how periodic the sound is at each string's own period (low = that string is sounding). Lets the
    // page catch a common sub-period: B3 + E4 ringing together repeat every E2 period.
    const sc = this.strings.map(f => { const lg = this.dsr / f; let mn = 9;
      for (let t = Math.floor(lg) - 1; t <= Math.ceil(lg) + 1; t++) if (t >= 1 && t <= L) mn = Math.min(mn, cm[t]);
      return mn; });
    // share of the sound at f0 and 2*f0 (Hann-windowed DFT). A real low string has energy there;
    // a common sub-period of two higher strings does not.
    const f0 = this.dsr / tp;
    let sw = 0, sw2 = 0, pt = 0, p12 = 0;
    for (let h = 1; h <= 2; h++) {
      const w0 = TAU * f0 * h / this.dsr; let re = 0, im = 0;
      for (let i = 0; i < N; i++) { const w = 0.5 - 0.5 * Math.cos(TAU * i / (N - 1)), v = w * x[i];
        re += v * Math.cos(w0 * i); im -= v * Math.sin(w0 * i);
        if (h === 1) { sw += w; sw2 += w * w; pt += v * v; } }
      p12 += (re * re + im * im) / (sw * sw / 4) / 2;
    }
    const low = pt > 0 ? Math.min(1, p12 / (pt / sw2)) : 0;
    return { f0, q: b, sc, low };
  }

  regress() {   // least-squares phase slope per band over the recent window -> beat in Hz
    const n = Math.min(this.hn, this.winBlocks);
    if (n < 8) return null;
    const H = this.H, dt = 128 / this.sr;
    let sx = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sx += i; sxx += i * i; }
    const den = n * sxx - sx * sx;
    const beats = [0, 0, 0];
    for (let b = 0; b < 3; b++) {
      const h = this.hist[b];
      let sy = 0, sxy = 0, i0 = (this.hw - n + H) % H;
      const y0 = h[i0];
      for (let i = 0; i < n; i++) { const y = h[(i0 + i) % H] - y0; sy += y; sxy += i * y; }
      const slope = (n * sxy - sx * sy) / den / dt;         // rad/s
      const beat = slope / TAU;                             // Hz at this harmonic
      beats[b] = beat; this.slopeBlk[b] = slope * dt;
    }
    // per band: offset of the lowest partial, in Hz. Stiff strings put partial h at
    // h*f1*(1 + K'(h^2-1)), so d_h = beat_h/h = d_1 + K(h^2-1). K comes from the 2nd vs 4th band.
    const mg = this.mag, mx = Math.max(mg[0], mg[1], mg[2]), d = [beats[0], beats[1] / 2, beats[2] / 4];
    const use = [mg[0] > 0.06 * mx, mg[1] > 0.06 * mx, mg[2] > 0.06 * mx];
    let K = 0;
    const kc = f => f / this.target * 1731.234;        // Hz at the fundamental -> cents
    if (use[1] && use[2]) {
      const k = (d[2] - d[1]) / 12, c = kc(k);        // 866*B cents per (h^2-1); real strings: B 0 .. 4e-4
      if (c > -0.12 && c < 0.45) K = Math.max(0, Math.min(0.35 / 1731.234 * this.target, k));
      else use[2] = false;                             // 4th-harmonic band disagrees: something else rings there
    }
    if (use[0] && (use[1] || use[2])) {                // fundamental vs the rest (after the stiffness fix)
      const b = use[1] ? 1 : 2, h = HARM[b];
      if (Math.abs(kc(d[0] - (d[b] - K * (h * h - 1)))) > 3 && mg[b] > mg[0]) use[0] = false;
    }
    let num = 0, wsum = 0;
    for (let b = 0; b < 3; b++) {
      if (!use[b]) continue;
      const h = HARM[b], w = mg[b] * mg[b] * h;
      num += w * (d[b] - K * (h * h - 1)); wsum += w;
    }
    return { df: wsum > 0 ? num / wsum : 0, beats, n };
  }

  process(inputs, outputs) {
    const inp = inputs[0] && inputs[0][0];
    if (!inp) return true;
    const n = inp.length, aa = this.aa, z = this.z;
    let ss = 0;
    // phasor at block start (exact), rotated per sample
    let c = Math.cos(this.ph), s = Math.sin(this.ph);
    const cd = Math.cos(this.dph), sd = Math.sin(this.dph), a0 = this.ab[0], a1 = this.ab[1], a2 = this.ab[2], st = this.st, on = this.target > 0;
    for (let i = 0; i < n; i++) {
      const x = inp[i];
      ss += x * x;
      // anti-alias + decimate for YIN
      let y = aa[0] * x + z[0]; z[0] = aa[1] * x - aa[3] * y + z[1]; z[1] = aa[2] * x - aa[4] * y;
      let y2 = aa[0] * y + z[2]; z[2] = aa[1] * y - aa[3] * y2 + z[3]; z[3] = aa[2] * y - aa[4] * y2;
      if (++this.dcount >= this.D) {
        this.dcount = 0;
        this.ring[this.rw] = y2; this.rw = (this.rw + 1) % this.RN;
        if (this.filled < this.RN) this.filled++;
        this.sinceHop++;
      }
      if (on) {
        const c2 = c * c - s * s, s2 = 2 * c * s, c4 = c2 * c2 - s2 * s2, s4 = 2 * c2 * s2;
        // band 0 (fundamental), 1 (2nd), 2 (4th); I = x cos, Q = -x sin; 3 one-pole stages each
        let u, k, a = a0;
        u = x * c;   k = 0;  st[k] += a * (u - st[k]); st[k + 1] += a * (st[k] - st[k + 1]); st[k + 2] += a * (st[k + 1] - st[k + 2]);
        u = -x * s;  k = 3;  st[k] += a * (u - st[k]); st[k + 1] += a * (st[k] - st[k + 1]); st[k + 2] += a * (st[k + 1] - st[k + 2]);
        a = a1;
        u = x * c2;  k = 6;  st[k] += a * (u - st[k]); st[k + 1] += a * (st[k] - st[k + 1]); st[k + 2] += a * (st[k + 1] - st[k + 2]);
        u = -x * s2; k = 9;  st[k] += a * (u - st[k]); st[k + 1] += a * (st[k] - st[k + 1]); st[k + 2] += a * (st[k + 1] - st[k + 2]);
        a = a2;
        u = x * c4;  k = 12; st[k] += a * (u - st[k]); st[k + 1] += a * (st[k] - st[k + 1]); st[k + 2] += a * (st[k + 1] - st[k + 2]);
        u = -x * s4; k = 15; st[k] += a * (u - st[k]); st[k + 1] += a * (st[k] - st[k + 1]); st[k + 2] += a * (st[k + 1] - st[k + 2]);
        const nc = c * cd - s * sd; s = s * cd + c * sd; c = nc;
      }
    }
    if (on) { this.ph = (this.ph + this.dph * n) % TAU; }
    this.blk++;
    // level, presence and onset (a fresh pluck restarts the measurement window)
    const rms = Math.sqrt(ss / n);
    this.ms += (ss / n - this.ms) * Math.min(1, 128 / (0.04 * this.sr));   // ~40 ms level, smooth even for low E
    const L = this.lvl = Math.sqrt(this.ms);
    if (L < this.floor) this.floor += (L - this.floor) * 0.05; else this.floor *= this.rise;
    const thr = this.thr = Math.max(this.gate, 2.5 * this.floor);
    let onset = false;
    if (rms > thr && rms > 1.8 * this.slow + 0.6 * thr) onset = true;
    this.slow += (rms - this.slow) * (rms > this.slow ? 0.02 : 0.004);
    if (L > thr) { this.present = true; this.quiet = 0; }
    else if (++this.quiet > 0.25 * this.sr / 128) this.present = false;
    if (onset) {
      this.onsetBlk = this.blk; this.hn = 0;
      this.hold = Math.max(this.hold, Math.ceil(0.06 * this.sr / 128));
    }
    // strobe phases
    if (on) {
      let sb = 0;
      for (let b = 0; b < 3; b++) {
        const I = st[b * 6 + 2], Q = st[b * 6 + 5];
        const p = Math.atan2(Q, I);
        this.mag[b] = Math.hypot(I, Q);
        if (!this.started) { this.prev[b] = p; }
        let dp = p - this.prev[b];
        if (dp > Math.PI) dp -= TAU; else if (dp < -Math.PI) dp += TAU;
        this.unw[b] += dp; this.prev[b] = p; 
        if (this.mag[b] > this.mag[sb]) sb = b;
      }
      this.started = true;
      // share of the sound that sits in this string's fundamental + 2nd harmonic bands (a sinusoid
      // of amplitude A gives |I+jQ| = A/2, power A^2/2 = 2|I+jQ|^2)
      this.fr = this.ms > 0 ? Math.min(1, 2 * (this.mag[0] * this.mag[0] + this.mag[1] * this.mag[1]) / this.ms) : 0;
      if (this.hold > 0) this.hold--;
      else if (this.present && this.mag[0] + this.mag[1] + this.mag[2] > thr * 0.05) {
        const H = this.H;
        // glitch guard: a dropped or repeated stretch of input makes the phase step. Compare the
        // last 24 blocks of the strongest band with its fitted slope; restart on a jump.
        if (this.hn >= 48) {
          const i24 = (this.hw - 24 + H) % H, b = sb;      // the strongest band: least noisy, and a dropout hits every band
          const dev = Math.abs(this.unw[b] - this.hist[b][i24] - 24 * this.slopeBlk[b]);
          if (dev > this.jump) { this.hn = 0; this.hold = Math.max(this.hold, this.settle); this.glitches++; }
        }
        if (this.hold === 0) {
          for (let b = 0; b < 3; b++) this.hist[b][this.hw] = this.unw[b];
          this.hw = (this.hw + 1) % H; if (this.hn < H) this.hn++;
        }
      } else if (!this.present) this.hn = 0;
    }
    // pitch finder, only while there is sound
    if (this.sinceHop >= this.hop && this.filled >= this.W + this.maxLag + 2) {
      this.sinceHop = 0;
      if (this.present) {
        const r = this.yin();
        if (r) this.port.postMessage({ type: 'p', f0: r.f0, q: r.q, sc: r.sc, low: r.low, lvl: L, since: (this.blk - this.onsetBlk) * 128 / this.sr });
      }
    }
    if ((this.blk & 3) === 0) {
      const g = on ? this.regress() : null;
      this.port.postMessage({
        type: 's', t: currentTime, tgt: this.target, ph: [this.unw[0], this.unw[1], this.unw[2]],
        mag: [this.mag[0], this.mag[1], this.mag[2]], df: g ? g.df : null, beats: g ? g.beats : null,
        n: g ? g.n : 0, gl: this.glitches, lvl: L, thr, fr: this.fr, present: this.present, since: (this.blk - this.onsetBlk) * 128 / this.sr
      });
    }
    const out = outputs[0] && outputs[0][0]; if (out) out.fill(0);
    return true;
  }
}
registerProcessor('strobe-tuner', StrobeTuner);
