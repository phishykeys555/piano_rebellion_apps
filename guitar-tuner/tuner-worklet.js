/* Guitar Revolution Strobe Tuner - audio worklet.
   Runs on every input sample:
   1. Heterodyne strobe: mix the input with a reference phasor at the target frequency
      (bands: 1st, 2nd and 4th harmonic), low-pass I and Q, phase = atan2(Q, I).
      The phase turns at the beat frequency: still when in tune, + when sharp, - when flat.
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
    this.target = 0; this.ph = 0; this.dph = 0; this.a = 0;
    this.st = new Float64Array(3 * 2 * 3); // band x (I,Q) x 3 one-pole stages
    this.unw = new Float64Array(3); this.prev = new Float64Array(3); this.mag = new Float64Array(3);
    this.started = false;
    const H = Math.ceil(sr / 128 * 1.2);
    this.H = H; this.hist = [new Float64Array(H), new Float64Array(H), new Float64Array(H)];
    this.hmag = new Float64Array(H);
    this.hw = 0; this.hn = 0;
    this.winBlocks = Math.round(0.6 * sr / 128);
    this.blk = 0; this.hold = 0;
    // --- level / onset ---
    this.slow = 0; this.present = false; this.quiet = 0; this.onsetBlk = -1e9;
    this.gate = 0.0025;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.target !== undefined) this.setTarget(m.target);
      if (m.gate !== undefined) this.gate = m.gate;
    };
  }

  setTarget(f) {
    if (!(f > 0)) { this.target = 0; return; }
    if (Math.abs(f - this.target) < 1e-9) return;
    this.target = f;
    this.dph = TAU * f / this.sr;
    const fc = Math.min(200, Math.max(4, f / 8));
    this.a = 1 - Math.exp(-TAU * fc / this.sr);
    this.st.fill(0); this.started = false;
    this.hn = 0;
    this.hold = Math.ceil((4 / (TAU * fc) + 0.03) * this.sr / 128);   // let the filters settle
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
    return { f0: this.dsr / tp, q: b };
  }

  regress() {   // least-squares phase slope per band over the recent window -> beat in Hz
    const n = Math.min(this.hn, this.winBlocks);
    if (n < 8) return null;
    const H = this.H, dt = 128 / this.sr;
    let sx = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sx += i; sxx += i * i; }
    const den = n * sxx - sx * sx;
    let num = 0, wsum = 0; const beats = [0, 0, 0];
    for (let b = 0; b < 3; b++) {
      const h = this.hist[b];
      let sy = 0, sxy = 0, i0 = (this.hw - n + H) % H;
      const y0 = h[i0];
      for (let i = 0; i < n; i++) { const y = h[(i0 + i) % H] - y0; sy += y; sxy += i * y; }
      const slope = (n * sxy - sx * sy) / den / dt;         // rad/s
      const beat = slope / TAU;                             // Hz at this harmonic
      beats[b] = beat;
      const w = this.mag[b] * this.mag[b];
      num += w * beat / HARM[b]; wsum += w;
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
    const cd = Math.cos(this.dph), sd = Math.sin(this.dph), a = this.a, st = this.st, on = this.target > 0;
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
        let u, k;
        u = x * c;   k = 0;  st[k] += a * (u - st[k]); st[k + 1] += a * (st[k] - st[k + 1]); st[k + 2] += a * (st[k + 1] - st[k + 2]);
        u = -x * s;  k = 3;  st[k] += a * (u - st[k]); st[k + 1] += a * (st[k] - st[k + 1]); st[k + 2] += a * (st[k + 1] - st[k + 2]);
        u = x * c2;  k = 6;  st[k] += a * (u - st[k]); st[k + 1] += a * (st[k] - st[k + 1]); st[k + 2] += a * (st[k + 1] - st[k + 2]);
        u = -x * s2; k = 9;  st[k] += a * (u - st[k]); st[k + 1] += a * (st[k] - st[k + 1]); st[k + 2] += a * (st[k + 1] - st[k + 2]);
        u = x * c4;  k = 12; st[k] += a * (u - st[k]); st[k + 1] += a * (st[k] - st[k + 1]); st[k + 2] += a * (st[k + 1] - st[k + 2]);
        u = -x * s4; k = 15; st[k] += a * (u - st[k]); st[k + 1] += a * (st[k] - st[k + 1]); st[k + 2] += a * (st[k + 1] - st[k + 2]);
        const nc = c * cd - s * sd; s = s * cd + c * sd; c = nc;
      }
    }
    if (on) { this.ph = (this.ph + this.dph * n) % TAU; }
    this.blk++;
    // level, presence and onset (a fresh pluck restarts the measurement window)
    const rms = Math.sqrt(ss / n);
    let onset = false;
    if (rms > this.gate && rms > 1.8 * this.slow + 0.001) onset = true;
    this.slow += (rms - this.slow) * (rms > this.slow ? 0.02 : 0.004);
    if (rms > this.gate) { this.present = true; this.quiet = 0; }
    else if (++this.quiet > 0.25 * this.sr / 128) this.present = false;
    if (onset) {
      this.onsetBlk = this.blk; this.hn = 0;
      this.hold = Math.max(this.hold, Math.ceil(0.06 * this.sr / 128));
    }
    // strobe phases
    if (on) {
      for (let b = 0; b < 3; b++) {
        const I = st[b * 6 + 2], Q = st[b * 6 + 5];
        const p = Math.atan2(Q, I);
        this.mag[b] = Math.hypot(I, Q);
        if (!this.started) { this.prev[b] = p; }
        let dp = p - this.prev[b];
        if (dp > Math.PI) dp -= TAU; else if (dp < -Math.PI) dp += TAU;
        this.unw[b] += dp; this.prev[b] = p;
      }
      this.started = true;
      if (this.hold > 0) this.hold--;
      else if (this.present && this.mag[0] + this.mag[1] + this.mag[2] > this.gate * 0.05) {
        const H = this.H;
        for (let b = 0; b < 3; b++) this.hist[b][this.hw] = this.unw[b];
        this.hw = (this.hw + 1) % H; if (this.hn < H) this.hn++;
      } else if (!this.present) this.hn = 0;
    }
    // pitch finder, only while there is sound
    if (this.sinceHop >= this.hop && this.filled >= this.W + this.maxLag + 2) {
      this.sinceHop = 0;
      if (this.present) {
        const r = this.yin();
        if (r) this.port.postMessage({ type: 'p', f0: r.f0, q: r.q, lvl: rms });
      }
    }
    if ((this.blk & 3) === 0) {
      const g = on ? this.regress() : null;
      this.port.postMessage({
        type: 's', t: currentTime, tgt: this.target, ph: [this.unw[0], this.unw[1], this.unw[2]],
        mag: [this.mag[0], this.mag[1], this.mag[2]], df: g ? g.df : null, beats: g ? g.beats : null,
        n: g ? g.n : 0, lvl: rms, present: this.present, since: (this.blk - this.onsetBlk) * 128 / this.sr
      });
    }
    const out = outputs[0] && outputs[0][0]; if (out) out.fill(0);
    return true;
  }
}
registerProcessor('strobe-tuner', StrobeTuner);
