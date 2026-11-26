/* Piano Strobe Tuner - audio worklet. Version 2026-11-26.1 (built from the Guitar Revolution Strobe Tuner engine).
   Runs on every input sample:
   1. Heterodyne strobe: mix the input with a reference phasor at the target frequency
      (bands: 1st, 2nd and 4th harmonic), low-pass I and Q, phase = atan2(Q, I).
      The phase turns at the beat frequency: still when in tune, + when sharp, - when flat.
      The reading is the fundamental. When the fundamental is strong (middle and treble) it is read
      straight from the 1st band. When it is weak (the low bass strings, where almost all the sound
      sits in the upper partials) it comes from the 2nd and 4th bands, corrected for string stiffness
      (inharmonicity: piano partials run sharp, h*f1*(1 + B(h^2-1)/2)).
   2. Pitch finder, two halves:
      low:  anti-alias, decimate to ~12 kHz, YIN from 25 Hz (A0 is 27.5 Hz) to 1400 Hz, with an octave
            guard that favours the longest clean period (a weak fundamental never makes A0 read as A1);
      high: YIN on the full-rate signal from 850 Hz to 4700 Hz (C8 is 4186 Hz).
      High wins only when it is clean and the low answer has no sound of its own (a sub-period).
   Nothing is stored beyond a few seconds of numbers in memory; no audio leaves the device. */
'use strict';
const TAU = Math.PI * 2;
const HARM = [1, 2, 4];

function lpCoefs(fc, sr) {               // RBJ biquad low-pass, Q = 0.7071
  const w = TAU * fc / sr, c = Math.cos(w), s = Math.sin(w), al = s / (2 * 0.7071);
  const a0 = 1 + al;
  return [(1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, -2 * c / a0, (1 - al) / a0];
}

// one YIN analyser over a ring buffer
function makeYin(rate, W, fLo, fHi, RN) {
  const maxLag = Math.ceil(rate / fLo), minLag = Math.max(2, Math.floor(rate / fHi));
  return { rate, W, minLag, maxLag, RN, ring: new Float32Array(RN), rw: 0, filled: 0,
    frame: new Float32Array(W + maxLag + 2), dif: new Float32Array(maxLag + 2), cm: new Float32Array(maxLag + 2) };
}

class PianoStrobe extends AudioWorkletProcessor {
  constructor() {
    super();
    const sr = sampleRate;
    this.sr = sr;
    // --- pitch finder: low half (decimated) ---
    this.D = Math.max(1, Math.round(sr / 12000));
    this.dsr = sr / this.D;
    this.aa = lpCoefs(Math.min(2600, this.dsr * 0.42), sr);
    this.z = new Float64Array(4);          // two cascaded biquads (DF2T), 2 states each
    this.dcount = 0;
    this.lo = makeYin(this.dsr, 1024, 25, 1400, 4096);
    this.hop = 512; this.sinceHop = 0;
    // --- pitch finder: high half (full rate) ---
    this.hi = makeYin(sr, 1024, 850, 4700, 2048);
    // --- strobe demodulator ---
    this.target = 0; this.ph = 0; this.dph = 0; this.ab = new Float64Array(3);
    this.st = new Float64Array(3 * 2 * 3); // band x (I,Q) x 3 one-pole stages
    this.unw = new Float64Array(3); this.prev = new Float64Array(3); this.mag = new Float64Array(3);
    this.started = false;
    const H = Math.ceil(sr / 128 * 1.2);
    this.H = H; this.hist = [new Float64Array(H), new Float64Array(H), new Float64Array(H)];
    this.hw = 0; this.hn = 0;
    this.winBlocks = Math.round(0.6 * sr / 128);
    this.blk = 0; this.hold = 0; this.settle = 0; this.glitches = 0; this.jump = 0.15;
    this.slopeBlk = new Float64Array(3);
    // --- level / onset ---
    // presence: smoothed level vs an adaptive floor (steady hum / fan noise is the floor, not a note)
    this.slow = 0; this.present = false; this.quiet = 0; this.onsetBlk = -1e9;
    this.gate = 0.0005;                     // about -66 dBFS: a phone on the music desk still counts
    this.ms = 0; this.lvl = 0; this.floor = 0.05; this.rise = Math.pow(10, 1 / 20 / (sr / 128)); // floor creeps up 1 dB/s
    this.fr = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.target !== undefined) this.setTarget(m.target);
      if (m.gate !== undefined) this.gate = m.gate;
      if (m.stop) this.dead = true;                            // tuner switched off: let this node go
    };
  }

  setTarget(f) {
    if (!(f > 0)) { this.target = 0; return; }
    if (Math.abs(f - this.target) < 1e-9) return;
    this.target = f;
    this.dph = TAU * f / this.sr;
    // band b passes beats up to about +-60 cents of harmonic HARM[b] (never past a quarter of the sample rate)
    for (let b = 0; b < 3; b++) this.ab[b] = 1 - Math.exp(-TAU * Math.min(220, Math.max(2.5, HARM[b] * f / 24)) / this.sr);
    const fc = Math.max(2.5, f / 24);
    this.st.fill(0); this.started = false;
    this.hn = 0;
    this.settle = Math.ceil(4 / (TAU * fc) * this.sr / 128);
    this.hold = this.settle + Math.ceil(0.03 * this.sr / 128);   // let the filters settle
  }

  yin(Y) {
    const W = Y.W, L = Y.maxLag, x = Y.frame, N = W + L + 1, RN = Y.RN;
    let r = (Y.rw - N + RN) % RN;
    for (let i = 0; i < N; i++) { x[i] = Y.ring[r]; r = (r + 1) % RN; }
    const d = Y.dif, cm = Y.cm;
    for (let tau = 1; tau <= L; tau++) {
      let s = 0;
      for (let j = 0; j < W; j++) { const v = x[j] - x[j + tau]; s += v * v; }
      d[tau] = s;
    }
    cm[0] = 1; let run = 0;
    for (let tau = 1; tau <= L; tau++) { run += d[tau]; cm[tau] = run > 0 ? d[tau] * tau / run : 1; }
    let gmin = 1e9;
    for (let t = Y.minLag; t < L; t++) if (cm[t] < cm[t - 1] && cm[t] <= cm[t + 1] && cm[t] < gmin) gmin = cm[t];
    if (gmin > 0.4) return null;
    // octave guard: smallest lag whose dip is nearly as deep as the deepest one
    const tol = 0.03 + 0.25 * gmin;
    let best = -1;
    for (let t = Y.minLag; t < L; t++) {
      if (cm[t] < cm[t - 1] && cm[t] <= cm[t + 1] && cm[t] <= gmin + tol) { best = t; break; }
    }
    if (best < 0) return null;
    // piano bass: the fundamental is weak and odd partials are quiet, so half the true period can look
    // nearly as clean as the true one. If twice this lag is a clearly cleaner period, that is the note.
    const b2 = best * 2;
    if (b2 + 2 < L && cm[best] > 0.1 && Y.rate / best < 130) {   // bass only (below about C3)
      let m2 = 9, t2 = -1;
      for (let t = b2 - 2; t <= b2 + 2; t++) if (cm[t] < m2) { m2 = cm[t]; t2 = t; }
      if (t2 > 0 && m2 < cm[best] * 0.55 && m2 < 0.2 && cm[t2] <= cm[t2 - 1] && cm[t2] <= cm[t2 + 1]) best = t2;
    }
    const a = cm[best - 1], b = cm[best], c = cm[best + 1];
    const den = a - 2 * b + c;
    const tp = best + (den > 0 ? 0.5 * (a - c) / den : 0);
    return { f0: Y.rate / tp, q: b };
  }

  // share of the sound in the high frame that sits at frequency f (Hann-windowed DFT)
  share(f) {
    const Y = this.hi, x = Y.frame, N = Y.W, w0 = TAU * f / Y.rate;
    let re = 0, im = 0, sw = 0, sw2 = 0, pt = 0;
    for (let i = 0; i < N; i++) { const w = 0.5 - 0.5 * Math.cos(TAU * i / (N - 1)), v = w * x[i];
      re += v * Math.cos(w0 * i); im -= v * Math.sin(w0 * i); sw += w; sw2 += w * w; pt += v * v; }
    const p = (re * re + im * im) / (sw * sw / 4) / 2;
    return pt > 0 ? Math.min(1, p / (pt / sw2)) : 0;
  }

  pitch() {
    const lo = this.yin(this.lo);
    const hi = this.hi.filled >= this.hi.W + this.hi.maxLag + 2 ? this.yin(this.hi) : null;
    // above 1000 Hz the low half may be hearing a sub-period of a treble note: trust it only with a clean high answer
    if (!hi || hi.q > 0.2) return lo && lo.f0 < 1000 ? Object.assign(lo, { src: 'lo' }) : null;
    if (!lo) return hi.f0 >= 1000 ? Object.assign(hi, { src: 'hi' }) : null;
    const r = hi.f0 / lo.f0, k = Math.round(r);
    if (k < 1 || k > 8 || Math.abs(r - k) / r > 0.03) return lo.f0 < 1000 ? Object.assign(lo, { src: 'lo' }) : null;
    if (k === 1) return Object.assign(hi, { src: 'hi' });
    // the low half found a common sub-period (C8 read as C6, F#7 as B5). Its own partials that are not
    // also partials of the high answer must carry sound, or it is not a real note.
    let s = 0;
    for (let h = 1; h <= 3; h++) if (h % k) s += this.share(lo.f0 * h);
    return s < 0.05 ? Object.assign(hi, { src: 'hi' }) : Object.assign(lo, { src: 'lo' });
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
      beats[b] = slope / TAU;                               // Hz at this harmonic
      this.slopeBlk[b] = slope * dt;
    }
    // per band: offset of the fundamental, in Hz. Stiff strings put partial h at about
    // h*f1*(1 + K'(h^2-1)), so d_h = beat_h/h = d_1 + K(h^2-1). K comes from the 2nd vs 4th band.
    const mg = this.mag, mx = Math.max(mg[0], mg[1], mg[2]), d = [beats[0], beats[1] / 2, beats[2] / 4];
    const use = [mg[0] > 0.06 * mx, mg[1] > 0.06 * mx, mg[2] > 0.06 * mx];
    const kc = f => f / this.target * 1731.234;        // Hz at the fundamental -> cents
    // strong fundamental (middle and treble): read it straight, no model needed
    if (use[0] && mg[0] >= 0.2 * mx) return { df: d[0], beats, n, via: 1 };
    let K = 0;
    if (use[1] && use[2]) {
      const k = (d[2] - d[1]) / 12, c = kc(k);        // 866*B cents per (h^2-1); piano strings: B up to about 0.01
      if (c > -0.3 && c < 9) K = Math.max(0, k);
      else use[2] = false;                             // 4th-harmonic band disagrees: something else rings there
    }
    let num = 0, wsum = 0;
    for (let b = 0; b < 3; b++) {
      if (!use[b]) continue;
      const h = HARM[b], w = mg[b] * mg[b] * h;
      num += w * (d[b] - K * (h * h - 1)); wsum += w;
    }
    return { df: wsum > 0 ? num / wsum : 0, beats, n, via: 2 };
  }

  process(inputs, outputs) {
    if (this.dead) return false;
    const inp = inputs[0] && inputs[0][0];
    if (!inp) return true;
    const n = inp.length, aa = this.aa, z = this.z, LO = this.lo, HI = this.hi;
    let ss = 0;
    // phasor at block start (exact), rotated per sample
    let c = Math.cos(this.ph), s = Math.sin(this.ph);
    const cd = Math.cos(this.dph), sd = Math.sin(this.dph), a0 = this.ab[0], a1 = this.ab[1], a2 = this.ab[2], st = this.st, on = this.target > 0;
    for (let i = 0; i < n; i++) {
      const x = inp[i];
      ss += x * x;
      HI.ring[HI.rw] = x; HI.rw = (HI.rw + 1) % HI.RN; if (HI.filled < HI.RN) HI.filled++;
      // anti-alias + decimate for the low YIN
      let y = aa[0] * x + z[0]; z[0] = aa[1] * x - aa[3] * y + z[1]; z[1] = aa[2] * x - aa[4] * y;
      let y2 = aa[0] * y + z[2]; z[2] = aa[1] * y - aa[3] * y2 + z[3]; z[3] = aa[2] * y - aa[4] * y2;
      if (++this.dcount >= this.D) {
        this.dcount = 0;
        LO.ring[LO.rw] = y2; LO.rw = (LO.rw + 1) % LO.RN;
        if (LO.filled < LO.RN) LO.filled++;
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
    // level, presence and onset (a fresh key strike restarts the measurement window)
    const rms = Math.sqrt(ss / n);
    this.ms += (ss / n - this.ms) * Math.min(1, 128 / (0.04 * this.sr));   // ~40 ms level, smooth even for A0
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
      // share of the sound that sits in this note's fundamental + 2nd + 4th harmonic bands (a sinusoid
      // of amplitude A gives |I+jQ| = A/2, power A^2/2 = 2|I+jQ|^2)
      this.fr = this.ms > 0 ? Math.min(1, 2 * (this.mag[0] * this.mag[0] + this.mag[1] * this.mag[1] + this.mag[2] * this.mag[2]) / this.ms) : 0;
      if (this.hold > 0) this.hold--;
      else if (this.present && this.mag[0] + this.mag[1] + this.mag[2] > thr * 0.05) {
        const H = this.H;
        // glitch guard: a dropped or repeated stretch of input makes the phase step. Compare the
        // last 24 blocks of the strongest band with its fitted slope; restart on a jump.
        if (this.hn >= 48) {
          const i24 = (this.hw - 24 + H) % H, b = sb;
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
    if (this.sinceHop >= this.hop && LO.filled >= LO.W + LO.maxLag + 2) {
      this.sinceHop = 0;
      if (this.present) {
        const r = this.pitch();
        if (r) this.port.postMessage({ type: 'p', f0: r.f0, q: r.q, src: r.src, lvl: L, since: (this.blk - this.onsetBlk) * 128 / this.sr });
      }
    }
    if ((this.blk & 3) === 0) {
      const g = on ? this.regress() : null;
      this.port.postMessage({
        type: 's', t: currentTime, tgt: this.target, ph: [this.unw[0], this.unw[1], this.unw[2]],
        mag: [this.mag[0], this.mag[1], this.mag[2]], df: g ? g.df : null, beats: g ? g.beats : null, via: g ? g.via : 0,
        n: g ? g.n : 0, gl: this.glitches, lvl: L, thr, fr: this.fr, present: this.present, since: (this.blk - this.onsetBlk) * 128 / this.sr
      });
    }
    const out = outputs[0] && outputs[0][0]; if (out) out.fill(0);
    return true;
  }
}
registerProcessor('piano-strobe', PianoStrobe);
