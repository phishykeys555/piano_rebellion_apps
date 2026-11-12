// Song Dissector part splitter: one Web Worker = one copy of the htdemucs model (Demucs v4, 4 parts).
// The song never leaves the device: the model runs here with ONNX Runtime Web (WebAssembly, CPU).
// The model file holds the network without its STFT, so the spectrogram in and out is done here,
// matching demucs/htdemucs.py (_spec, _magnitude, _mask, _ispec) step for step.
import * as ort from './vendor/ort/ort.wasm.min.mjs';

const N = 4096, H = 1024, L = 343980, FR = 2048, T = 336, NF = T + 4; // 7.8 s segment at 44.1 kHz
const PADL = 1536, PADR = PADL + Math.ceil(L / H) * H - L, M = L + PADL + PADR; // demucs's own reflect pad
let session = null, dsp = 0;

// ---------- radix-2 complex FFT, size 4096 ----------
const LOG = 12, rev = new Uint16Array(N), cosT = new Float64Array(N / 2), sinT = new Float64Array(N / 2), win = new Float64Array(N);
for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < LOG; b++) r |= ((i >> b) & 1) << (LOG - 1 - b); rev[i] = r; win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N) }
for (let i = 0; i < N / 2; i++) { cosT[i] = Math.cos(2 * Math.PI * i / N); sinT[i] = -Math.sin(2 * Math.PI * i / N) }
function fft(re, im, inv) { // in place
  for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t } }
  const sg = inv ? -1 : 1;
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, step = N / size;
    for (let s = 0; s < N; s += size) for (let k = 0, w = 0; k < half; k++, w += step) {
      const a = s + k, b = a + half, c = cosT[w], d = sg * sinT[w];
      const xr = re[b] * c - im[b] * d, xi = re[b] * d + im[b] * c;
      re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
    }
  }
}
const refl = (i, n) => i < 0 ? -i : i >= n ? 2 * (n - 1) - i : i;

// spectrogram of both channels at once (L + iR trick): returns the model's `mag` input [1,4,2048,336]
function spec(l, r) {
  const mag = new Float32Array(4 * FR * T), re = new Float64Array(N), im = new Float64Array(N), sc = 1 / Math.sqrt(N);
  for (let t = 0; t < T; t++) {
    const f0 = (t + 2) * H - N / 2; // frame t+2 of torch.stft(center=True) over the demucs-padded signal
    for (let n = 0; n < N; n++) { const j = refl(f0 + n, M) - PADL, k = refl(j, L); re[n] = l[k] * win[n]; im[n] = r[k] * win[n] }
    fft(re, im, false);
    for (let f = 0; f < FR; f++) {
      const g = f === 0 ? 0 : N - f;
      const ar = 0.5 * (re[f] + re[g]), ai = 0.5 * (im[f] - im[g]); // left
      const br = 0.5 * (im[f] + im[g]), bi = -0.5 * (re[f] - re[g]); // right
      const o = f * T + t;
      mag[o] = ar * sc; mag[FR * T + o] = ai * sc; mag[2 * FR * T + o] = br * sc; mag[3 * FR * T + o] = bi * sc;
    }
  }
  return mag;
}

// inverse: x [1,4,4,2048,336] (complex-as-channels) -> 4 sources x 2 channels, added to the time branch xt
let env = null;
function ispecAdd(x, xt, s, out) { // out: [Float32Array L, Float32Array L] for source s
  if (!env) { // window-square envelope of torch.istft over all 340 frames (zero frames included)
    env = new Float64Array((NF - 1) * H + N);
    for (let t = 0; t < NF; t++) for (let n = 0; n < N; n++) env[t * H + n] += win[n] * win[n];
  }
  const ola = [new Float64Array(L), new Float64Array(L)], re = new Float64Array(N), im = new Float64Array(N), isc = 1 / Math.sqrt(N); // normalized istft: x sqrt(N), irfft: / N
  const base = (s * 4) * FR * T, off = N / 2 + PADL; // istft output trims n_fft/2, then demucs trims `pad`
  for (let t = 0; t < T; t++) {
    re.fill(0); im.fill(0);
    for (let f = 0; f < FR; f++) { // Z = Zl + i Zr with Hermitian halves, one inverse FFT gives both channels
      const o = f * T + t, lr = x[base + o], rr = x[base + 2 * FR * T + o];
      const li = f ? x[base + FR * T + o] : 0, ri = f ? x[base + 3 * FR * T + o] : 0; // irfft ignores the DC bin's imaginary part
      re[f] += lr - ri; im[f] += li + rr;
      if (f > 0) { const g = N - f; re[g] += lr + ri; im[g] += -li + rr }
    }
    fft(re, im, true);
    const st = (t + 2) * H - off;
    for (let n = 0; n < N; n++) { const k = st + n; if (k < 0 || k >= L) continue; const w = win[n] * isc; ola[0][k] += re[n] * w; ola[1][k] += im[n] * w }
  }
  for (let c = 0; c < 2; c++) { const o = out[c], q = ola[c], tb = xt.subarray((s * 2 + c) * L, (s * 2 + c + 1) * L); for (let k = 0; k < L; k++) o[k] = q[k] / env[k + off] + tb[k] }
}

async function getBytes(url) {
  let r = null;
  try { if (self.caches) { const c = await caches.open('song-dissector-models-v1'); r = await c.match(url) } } catch (e) {}
  if (!r) { r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url) }
  return new Uint8Array(await r.arrayBuffer());
}

async function init(m) {
  ort.env.wasm.wasmPaths = m.wasmBase;
  ort.env.wasm.numThreads = m.threads || 1;
  ort.env.wasm.proxy = false;
  const graph = await getBytes(m.graph);
  // the weights ship as float16 (they were trained and released as float16, so this is lossless) and run as float32
  let parts = [];
  for (const u of m.weights) parts.push(await getBytes(u));
  const n16 = parts.reduce((a, p) => a + p.length, 0) / 2, w32 = new Float32Array(n16);
  { let o = 0; const tmp = new Float32Array(1), tmpU = new Uint32Array(tmp.buffer);
    const tbl = new Float32Array(65536); for (let h = 0; h < 65536; h++) { const sgn = h >> 15, e = (h >> 10) & 31, f = h & 1023; let v;
      if (e === 0) v = f * Math.pow(2, -24); else if (e === 31) v = f ? NaN : Infinity; else v = (1 + f / 1024) * Math.pow(2, e - 15); tbl[h] = sgn ? -v : v }
    for (const p of parts) { const u = new Uint16Array(p.buffer, p.byteOffset, p.length / 2); for (let i = 0; i < u.length; i++) w32[o++] = tbl[u[i]] } }
  parts = null;
  session = await ort.InferenceSession.create(graph, {
    executionProviders: ['wasm'], graphOptimizationLevel: 'all',
    externalData: [{ path: 'htdemucs.weights', data: new Uint8Array(w32.buffer) }],
  });
}

async function run(mix) { // mix: Float32Array(2*L), left then right
  const l = mix.subarray(0, L), r = mix.subarray(L);
  let t0 = performance.now();
  const mag = spec(l, r);
  dsp = performance.now() - t0;
  const res = await session.run({ mix: new ort.Tensor('float32', mix, [1, 2, L]), mag: new ort.Tensor('float32', mag, [1, 4, FR, T]) });
  const x = res.x.data, xt = res.xt.data;
  const out = new Float32Array(8 * L);
  t0 = performance.now();
  for (let s = 0; s < 4; s++) ispecAdd(x, xt, s, [out.subarray((s * 2) * L, (s * 2 + 1) * L), out.subarray((s * 2 + 1) * L, (s * 2 + 2) * L)]);
  dsp += performance.now() - t0;
  try { res.x.dispose(); res.xt.dispose() } catch (e) {}
  return out;
}

self.onmessage = async e => {
  const m = e.data;
  try {
    if (m.type === 'init') { const t0 = performance.now(); await init(m); self.postMessage({ type: 'ready', ms: performance.now() - t0 }) }
    else if (m.type === 'run') { const t0 = performance.now(); const out = await run(m.mix); self.postMessage({ type: 'done', job: m.job, out, ms: performance.now() - t0, dsp }, [out.buffer]) }
  } catch (err) {
    const s = String(err && (err.message || err)), oom = err instanceof RangeError || /memory|alloc|Aborted|OOM/i.test(s);
    self.postMessage({ type: 'error', job: m.job, oom, message: s });
  }
};
