// Song Dissector: split any song into parts on this device.
// Two models, both Demucs v4 by Meta (code MIT), run with ONNX Runtime Web in Web Workers (split-worker.js):
//   detailed: htdemucs_6s, 6 parts (drums, bass, vocals, guitar, piano, other), 60 MB
//   classic:  htdemucs,    4 parts (drums, bass, vocals, other), 88 MB; its drums, bass and vocals are a little cleaner
// The song is never uploaded. A model downloads once and is kept with the Cache API;
// finished splits are kept in IndexedDB, keyed by a fingerprint of the file, so the same MP3 comes back split at once.
// How the parts play: the player plays the record itself and subtracts the parts you turn down
// ("rest" = record - the split parts), so Full band is the original file, sample for sample.

const BASE = new URL('./', import.meta.url).href;
const RUNTIME = [BASE + 'vendor/ort/ort-wasm-simd-threaded.wasm'], RUNTIME_BYTES = 14848852;
// sources: the model's output order. parts: what the player gets (everything else is "rest" = record - parts).
// id is part of every stored split's key, so splits from the two models never collide.
export const MODELS = {
  detailed: { key: 'detailed', id: 'htdemucs_6s-5c90dfd2-v1', name: 'Detailed', count: 6, cost: 0.6,
    graph: BASE + 'models/htdemucs_6s/htdemucs_6s.onnx',
    weights: [BASE + 'models/htdemucs_6s/htdemucs_6s.f16.0.bin', BASE + 'models/htdemucs_6s/htdemucs_6s.f16.1.bin'],
    sources: ['drums', 'bass', 'other', 'vocals', 'guitar', 'piano'], parts: ['drums', 'bass', 'vocals', 'guitar', 'piano'],
    bytes: 5077360 + 47185920 + 7566336 },
  classic: { key: 'classic', id: 'htdemucs-955717e8-v1', name: 'Classic', count: 4, cost: 1,
    graph: BASE + 'models/htdemucs/htdemucs.onnx',
    weights: [BASE + 'models/htdemucs/htdemucs.f16.0.bin', BASE + 'models/htdemucs/htdemucs.f16.1.bin'],
    sources: ['drums', 'bass', 'other', 'vocals'], parts: ['drums', 'bass', 'vocals'],
    bytes: 6504422 + 47185920 + 36705280 },
};
export const DEFAULT_MODEL = 'detailed';
const PICK = 'songdissector:model';
export function chosenModel() { let k = null; try { k = localStorage.getItem(PICK) } catch (e) {} return MODELS[k] || MODELS[DEFAULT_MODEL] }
export function chooseModel(k) { try { if (MODELS[k]) localStorage.setItem(PICK, k) } catch (e) {} }
export const MODEL = MODELS[DEFAULT_MODEL]; // kept for older callers
const CACHE = 'song-dissector-models-v1', DB = 'song-dissector-splits', STORE = 'splits';
const SR = 44100, SEG = 343980, STRIDE = Math.floor(0.75 * SEG);
const ORDER = ['drums', 'bass', 'vocals', 'guitar', 'piano']; // the player's row order
const MB = b => Math.round(b / 1048576);
const nParts = r => r && r.stems ? Object.keys(r.stems).length : 3;

// ---------- device ----------
export function device() {
  const ua = navigator.userAgent || '', cores = navigator.hardwareConcurrency || 2, mem = navigator.deviceMemory || 0;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // one worker holds one copy of the model and peaks at about 2.5 GB while it runs (4 parts; measured), the 6-part model less; one core is left for the audio
  let workers = mobile ? 1 : Math.max(1, Math.min(4, cores - 2, mem ? Math.floor(mem / 3) : 2));
  const weak = mobile || (mem && mem < 4) || cores < 4;
  const secPerSeg = mobile ? 45 : cores >= 8 ? 12 : 20; // per worker, one 7.8 s piece of the 4-part model (measured: 22-26 s on a busy 2.1 GHz server core)
  return { cores, mem, mobile, workers, weak, secPerSeg, coi: !!self.crossOriginIsolated, ok: typeof Worker === 'function' && typeof WebAssembly === 'object' };
}
export const segments = sec => Math.max(1, Math.ceil(sec * SR / STRIDE));
// cost: time per piece relative to the 4-part model (the 6-part model has no 512-channel bottleneck layers)
export function estimateSec(sec, dev = device(), model = chosenModel()) { return Math.ceil(segments(sec) / dev.workers) * dev.secPerSeg * model.cost + 15 }

// ---------- model download (once, Cache API) ----------
async function cacheOpen() { try { return self.caches ? await caches.open(CACHE) : null } catch (e) { return null } }
export async function modelCached(model = chosenModel()) {
  const c = await cacheOpen(); if (!c) return false;
  for (const u of [model.graph, ...model.weights]) if (!(await c.match(u))) return false;
  return true;
}
export async function runtimeCached() { const c = await cacheOpen(); return !!(c && await c.match(RUNTIME[0])) }
export async function downloadBytes(model = chosenModel()) { return model.bytes + (await runtimeCached() ? 0 : RUNTIME_BYTES) }
export async function downloadModel(onBytes, signal, model = chosenModel()) {
  const c = await cacheOpen(), urls = [model.graph, ...model.weights, ...RUNTIME];
  let got = 0;
  for (const u of urls) {
    if (c && await c.match(u)) { got += (await (await c.match(u)).blob()).size; onBytes(got); continue }
    let r; try { r = await fetch(u, { signal }) } catch (e) { if (signal && signal.aborted) throw Object.assign(new Error('canceled'), { canceled: true }); throw Object.assign(new Error('The splitter didn’t download. Check your connection and try again.'), { user: true }) }
    if (!r.ok) throw Object.assign(new Error('The splitter didn’t download (HTTP ' + r.status + '). Check your connection and try again.'), { user: true });
    const rd = r.body.getReader(), chunks = [];
    for (;;) { let x; try { x = await rd.read() } catch (e) { if (signal && signal.aborted) throw Object.assign(new Error('canceled'), { canceled: true }); throw Object.assign(new Error('The download stopped. Check your connection and try again.'), { user: true }) } const { done, value } = x; if (done) break; chunks.push(value); got += value.length; onBytes(got) }
    if (c) { try { await c.put(u, new Response(new Blob(chunks), { headers: { 'content-type': r.headers.get('content-type') || 'application/octet-stream' } })) } catch (e) { /* storage full: the browser's own cache still helps */ } }
  }
}
export async function forgetModel() { try { if (self.caches) await caches.delete(CACHE) } catch (e) {} }

// ---------- audio helpers ----------
export async function decode44(blob) { // the record at the model's rate (44.1 kHz), as the export path decodes it
  const ab = await blob.arrayBuffer(), dc = new OfflineAudioContext(1, 1, SR);
  const d = await new Promise((res, rej) => { const q = dc.decodeAudioData(ab, res, rej); if (q && q.then) q.then(res, rej) });
  const l = d.getChannelData(0), r = d.numberOfChannels > 1 ? d.getChannelData(1) : l;
  return [new Float32Array(l), r === l ? new Float32Array(l) : new Float32Array(r)];
}
const half = v => { v = Math.round(v * 16384); return v > 32767 ? 32767 : v < -32768 ? -32768 : v }; // half scale: parts play with boost 2
export function toHalf16(f) { const o = new Int16Array(f.length); for (let i = 0; i < f.length; i++) o[i] = half(f[i]); return o }
export function wav(ch) { // 16-bit stereo WAV at 44.1 kHz
  const n = ch[0].length, h = new DataView(new ArrayBuffer(44)), d = new Int16Array(n * 2);
  for (let i = 0; i < n; i++) { d[2 * i] = ch[0][i]; d[2 * i + 1] = ch[1][i] }
  const s = (o, t) => { for (let i = 0; i < 4; i++) h.setUint8(o + i, t.charCodeAt(i)) };
  s(0, 'RIFF'); h.setUint32(4, 36 + n * 4, true); s(8, 'WAVE'); s(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 2, true);
  h.setUint32(24, SR, true); h.setUint32(28, SR * 4, true); h.setUint16(32, 4, true); h.setUint16(34, 16, true); s(36, 'data'); h.setUint32(40, n * 4, true);
  return new Blob([h.buffer, d.buffer], { type: 'audio/wav' });
}
// the player's track list: the record first (rest = record - parts), then the parts, all on the same 44.1 kHz grid
// list.model says which splitter made it ('detailed' | 'classic')
export function partList(mix16, stems, modelKey) {
  const l = [{ k: 'mix', src: wav(mix16), boost: 2 }].concat(ORDER.filter(k => stems[k]).map(k => ({ k, src: wav(stems[k]), boost: 2 })));
  l.model = modelKey || (stems.guitar ? 'detailed' : 'classic'); return l;
}

// ---------- fingerprint + stored splits (IndexedDB) ----------
export async function fingerprint(blob, name, model = chosenModel()) {
  const head = await blob.slice(0, 1048576).arrayBuffer();
  let h = '';
  try { h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', head))].map(b => b.toString(16).padStart(2, '0')).join('') }
  catch (e) { let a = 2166136261; const u = new Uint8Array(head); for (let i = 0; i < u.length; i++) { a ^= u[i]; a = Math.imul(a, 16777619) >>> 0 } h = 'fnv' + a.toString(16) }
  return model.id + '|' + name + '|' + blob.size + '|' + h;
}
function db() {
  return new Promise((res, rej) => {
    let r; try { r = indexedDB.open(DB, 1) } catch (e) { return rej(e) }
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked'));
  });
}
const tx = (d, mode, f) => new Promise((res, rej) => { const t = d.transaction(STORE, mode), s = t.objectStore(STORE); let out; const q = f(s); if (q) q.onsuccess = () => { out = q.result }; t.oncomplete = () => res(out); t.onerror = t.onabort = () => rej(t.error) });
export async function loadStored(fp) { try { const d = await db(); const v = await tx(d, 'readonly', s => s.get(fp)); d.close(); return v || null } catch (e) { return null } }
export async function store(fp, rec) {
  try {
    const need = nParts(rec) * 4 * rec.len;
    if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); if (e.quota && e.quota - e.usage < need * 1.2) return false }
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist() } catch (e) {}
    const d = await db(); await tx(d, 'readwrite', s => s.put(rec, fp)); d.close(); return true;
  } catch (e) { return false }
}
export async function storedInfo() {
  try { const d = await db(); const all = await tx(d, 'readonly', s => s.getAll()); d.close(); return { count: all.length, bytes: all.reduce((a, r) => a + nParts(r) * 4 * (r.len || 0), 0) } }
  catch (e) { return { count: 0, bytes: 0 } }
}
export async function clearStored() { try { const d = await db(); await tx(d, 'readwrite', s => s.clear()); d.close() } catch (e) {} }

// ---------- the split ----------
// ch: [Float32Array left, right] at 44.1 kHz. Resolves to {drums, bass, vocals[, guitar, piano][, other]}: each [Int16Array L, R] at half scale.
// Same cut-up as demucs.apply.apply_model(split=True, overlap=0.25, shifts=0): 7.8 s pieces, triangle cross-fades.
export function split(ch, { onProgress = () => {}, signal, workers: want, keepOther = false, model = chosenModel() } = {}) {
  return new Promise((resolve, reject) => {
    const len = ch[0].length, offs = []; for (let o = 0; o < len; o += STRIDE) offs.push(o);
    const keep = keepOther ? [...model.parts, 'other'] : model.parts, SRC_IDX = {}; model.sources.forEach((k, i) => SRC_IDX[k] = i);
    const acc = {}; keep.forEach(k => acc[k] = [new Int16Array(len), new Int16Array(len)]);
    const H2 = SEG / 2, wt = new Float32Array(SEG); for (let i = 0; i < SEG; i++) wt[i] = (i < H2 ? i + 1 : SEG - i) / H2;
    const sum = new Float32Array(len); for (const o of offs) { const cl = Math.min(SEG, len - o); for (let k = 0; k < cl; k++) sum[o + k] += wt[k] }
    const dev = device(), n = Math.max(1, Math.min(want || dev.workers, offs.length));
    const pool = [], queue = offs.map((_, i) => i); let done = 0, over = false, msSum = 0, msN = 0, t0 = performance.now(), firstOom = null;
    const finish = (err, val) => { if (over) return; over = true; pool.forEach(w => { try { w.terminate() } catch (e) {} }); pool.length = 0; if (signal) signal.removeEventListener('abort', onAbort); err ? reject(err) : resolve(val) };
    const onAbort = () => finish(Object.assign(new Error('canceled'), { canceled: true }));
    if (signal) { if (signal.aborted) return onAbort(); signal.addEventListener('abort', onAbort) }
    const oomErr = () => Object.assign(new Error('This device ran out of memory while splitting. Close other tabs and try again, or split on a laptop or desktop.'), { user: true, oom: true });
    const input = j => { const o = offs[j], cl = Math.min(SEG, len - o), d = SEG - cl, st = o - Math.floor(d / 2), m = new Float32Array(2 * SEG);
      for (let c = 0; c < 2; c++) { const a = Math.max(0, -st), b = Math.min(SEG, len - st); if (b > a) m.set(ch[c].subarray(st + a, st + b), c * SEG + a) } return m };
    const add = (j, out) => { const o = offs[j], cl = Math.min(SEG, len - o), d0 = Math.floor((SEG - cl) / 2);
      for (const k of keep) { const s = SRC_IDX[k]; for (let c = 0; c < 2; c++) { const src = out.subarray((s * 2 + c) * SEG + d0, (s * 2 + c) * SEG + d0 + cl), dst = acc[k][c];
        for (let i = 0; i < cl; i++) { const v = dst[o + i] + half(src[i] * wt[i] / sum[o + i]); dst[o + i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v } } } };
    const next = w => { if (over) return; if (!queue.length) { if (!pool.some(x => x.busy)) finish(null, acc); return }
      const j = queue.shift(); w.busy = j + 1; const m = input(j); w.postMessage({ type: 'run', job: j, mix: m }, [m.buffer]) };
    const lost = (w, oom, msg) => { // a worker failed: give its piece to the others; with none left, stop with a clear message
      const i = pool.indexOf(w); if (i >= 0) pool.splice(i, 1); try { w.terminate() } catch (e) {}
      if (w.busy) queue.unshift(w.busy - 1); w.busy = 0;
      if (!pool.length) finish(oom || firstOom ? oomErr() : Object.assign(new Error('The splitter stopped: ' + (msg || 'unknown error')), { user: true }));
      else pool.filter(x => !x.busy).forEach(next) };
    const report = () => { const left = offs.length - done, per = msN ? msSum / msN / 1000 : dev.secPerSeg; onProgress({ done, total: offs.length, workers: pool.length, eta: Math.ceil(left / Math.max(1, pool.length)) * per, elapsed: (performance.now() - t0) / 1000 }) };
    // workers start one after another: each one's model setup is the memory peak, so a phone stops at one instead of crashing
    const spawn = k => {
      if (over || k >= n) return;
      let w; try { w = new Worker(BASE + 'split-worker.js', { type: 'module' }) } catch (e) { if (!pool.length) finish(Object.assign(new Error('This browser can’t run the splitter.'), { user: true })); return }
      w.busy = 0; w.ready = false;
      w.onmessage = e => { const m = e.data; if (over) return;
        if (m.type === 'ready') { w.ready = true; pool.push(w); report(); next(w); spawn(k + 1) }
        else if (m.type === 'done') { w.busy = 0; add(m.job, m.out); done++; msSum += m.ms; msN++; report(); next(w) }
        else if (m.type === 'error') { if (!w.ready) { firstOom = firstOom || m.oom; try { w.terminate() } catch (x) {} if (!pool.length) finish(m.oom ? oomErr() : Object.assign(new Error('The splitter didn’t start: ' + m.message), { user: true })) } else lost(w, m.oom, m.message) } };
      w.onerror = e => { e.preventDefault && e.preventDefault(); if (over) return; const oom = /memory/i.test(e.message || '');
        if (!w.ready) { try { w.terminate() } catch (x) {} if (!pool.length) finish(oom ? oomErr() : Object.assign(new Error('The splitter didn’t start. Reload the page and try again.'), { user: true })) } else lost(w, true, e.message) };
      w.postMessage({ type: 'init', wasmBase: BASE + 'vendor/ort/', graph: model.graph, weights: model.weights, threads: 1, cache: CACHE });
    };
    report(); spawn(0);
  });
}

// ---------- stored split on load ----------
// A song with no parts: if this exact file was split before, it comes back split (no model, no wait).
// A URL song is fetched here once and handed on as a Blob, so the player doesn't download it twice.
export async function withStored(list, name, status = () => {}) {
  if (!list || list.length !== 1 || list[0].k !== 'mix') return list;
  let blob = list[0].src;
  if (typeof blob === 'string') { const r = await fetch(blob); if (!r.ok) throw new Error('HTTP ' + r.status); blob = await r.blob() }
  const one = [{ ...list[0], src: blob }];
  try { // the 6-part split wins when this file was split both ways
    let rec = null, mk = null;
    for (const m of [MODELS.detailed, MODELS.classic]) { rec = await loadStored(await fingerprint(blob, name, m)); if (rec) { mk = m.key; break } }
    if (!rec) return one;
    status('Opening the parts you split before…');
    const mix = await decode44(blob); if (mix[0].length !== rec.len) return one;
    return partList([toHalf16(mix[0]), toHalf16(mix[1])], rec.stems, mk);
  } catch (e) { return one }
}

// ---------- the panel ----------
// h: {$, inFrame, ready(), parts(), kind() -> 'detailed'|'classic'|null (which splitter made the loaded parts), dur(),
//     source() -> {src: File|Blob|url, name}, useParts(list), fullUrl() -> string|null, auto}
const PICK_TXT = {
  detailed: ['Detailed · 6 parts', 'Drums, bass, vocals, guitar, piano, and other (horns, strings, synths)'],
  classic: ['Classic · 4 parts', 'Drums, bass, vocals, and everything else. Slightly cleaner drums and vocals'],
};
export function attachUI(h) {
  const $ = h.$, box = $('splitBox'), btn = $('splitBtn'), hint = $('splitHint'), row = btn.parentElement, ask = $('splitAsk'), info = $('splitInfo'), go = $('splitGo'), no = $('splitNo'), full = $('splitFull');
  const run = $('splitRun'), bar = $('splitBar'), st = $('splitSt'), cancel = $('splitCancel'), sto = $('splitStore'), stoTxt = $('splitStoreTxt'), clr = $('splitClear'), pick = $('splitPick');
  let job = null, msg = '', auto = !!h.auto, sel = chosenModel().key;
  const kind = () => (h.kind ? h.kind() : null);
  const mins = s => s < 90 ? 'about a minute' : 'about ' + Math.round(s / 60) + ' min';
  async function showStore() { const i = await storedInfo(); sto.hidden = !i.count; stoTxt.textContent = 'Split songs kept on this device: ' + i.count + ' (' + MB(i.bytes) + ' MB).' }
  // the two choices, with what each one downloads (or that it is already here)
  const opts = {};
  for (const k of ['detailed', 'classic']) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pickopt'; b.setAttribute('role', 'radio'); b.dataset.m = k;
    b.innerHTML = '<b></b><span class="pd"></span><span class="ps"></span>';
    b.querySelector('b').textContent = PICK_TXT[k][0]; b.querySelector('.pd').textContent = PICK_TXT[k][1];
    b.onclick = () => { sel = k; chooseModel(k); paint(); describe() };
    pick.appendChild(b); opts[k] = b;
  }
  function paint() { for (const k in opts) { const on = k === sel; opts[k].classList.toggle('on', on); opts[k].setAttribute('aria-checked', on ? 'true' : 'false'); opts[k].tabIndex = on ? 0 : -1 } }
  pick.onkeydown = e => { if (!/Arrow/.test(e.key)) return; e.preventDefault(); sel = sel === 'detailed' ? 'classic' : 'detailed'; chooseModel(sel); paint(); describe(); opts[sel].focus() };
  async function sizes() { for (const k in opts) { const m = MODELS[k]; opts[k].querySelector('.ps').textContent = (await modelCached(m)) ? 'On this device' : 'Downloads ' + MB(await downloadBytes(m)) + ' MB once' } }
  function refresh() {
    const again = kind() === 'classic', can = h.ready() && (h.parts() < 2 || again);
    box.hidden = !(can || job || msg);
    row.hidden = !can || !!job; if (!job) run.hidden = !msg;
    btn.textContent = again ? '✂ Split again into 6 parts' : '✂ Split into parts';
    hint.textContent = again ? 'Adds guitar and piano to the parts.' : 'Drums, bass, vocals, guitar, piano and the rest, made on this device.';
    if (!can) ask.hidden = true;
    if (can && auto) { auto = false; open() }
  }
  async function describe() {
    const m = MODELS[sel], d = device(), sec = h.dur(), est = estimateSec(sec, d, m), cached = await modelCached(m), dl = MB(await downloadBytes(m));
    let t = 'Nothing is uploaded: the split happens right here. ';
    t += cached ? 'This splitter is already on this device. ' : 'First time only: downloads ' + dl + ' MB, kept for next time. ';
    t += 'Then ' + mins(est) + ' on this device. The song keeps playing while it works.';
    if (!d.ok) t = 'This browser can’t split songs. Use Chrome, Edge, Firefox or Safari on a laptop or desktop.';
    else if (d.weak) t = 'Splitting works best on a laptop or desktop: this ' + (d.mobile ? 'phone or tablet' : 'device') + ' would take ' + mins(est * (d.mobile ? 1 : 1.5)) + ' and may run out of memory. ' + (cached ? '' : 'It downloads ' + dl + ' MB first. ') + 'You can still try.';
    if (h.inFrame && d.ok) t += ' Inside Notion, splitting can run slowly or stop: full screen works best.';
    info.textContent = t; go.hidden = !d.ok; go.textContent = d.weak ? 'Split anyway' : 'Start splitting';
  }
  async function open() {
    if (job) return; msg = ''; run.hidden = true;
    if (kind() === 'classic') sel = 'detailed';
    pick.hidden = kind() === 'classic'; paint(); sizes(); await describe();
    const fu = h.inFrame ? h.fullUrl() : null; full.hidden = !h.inFrame; if (h.inFrame) { full.href = fu || location.origin + location.pathname; full.textContent = fu ? '↗ Split full screen' : '↗ Open full screen, then load your MP3 there' }
    ask.hidden = false; row.hidden = true;
  }
  async function start() {
    ask.hidden = true; row.hidden = true; run.hidden = false; cancel.hidden = false; msg = '';
    const ac = new AbortController(), me = job = { ac }, model = MODELS[sel]; bar.value = 0; let wl = null;
    const say = t => { if (job === me) st.textContent = t };
    try {
      try { if (navigator.wakeLock) wl = await navigator.wakeLock.request('screen') } catch (e) {}
      const s = h.source(); if (!s) throw Object.assign(new Error('Load a song first.'), { user: true });
      if (!(await modelCached(model))) { const tot = await downloadBytes(model); say('Downloading the splitter…'); await downloadModel(b => { bar.value = Math.round(150 * Math.min(1, b / tot)); say('Downloading the splitter… ' + MB(b) + ' of ' + MB(tot) + ' MB') }, ac.signal, model) }
      if (ac.signal.aborted) throw Object.assign(new Error('canceled'), { canceled: true });
      say('Reading the song…');
      let blob = s.src; if (typeof blob === 'string') { const r = await fetch(blob, { signal: ac.signal }); if (!r.ok) throw Object.assign(new Error('The song didn’t download. Check your connection.'), { user: true }); blob = await r.blob() }
      const fp = await fingerprint(blob, s.name, model), mix = await decode44(blob);
      say('Starting the splitter…');
      const stems = await split(mix, { model, signal: ac.signal, onProgress: p => { bar.value = 150 + Math.round(850 * p.done / p.total);
        say(p.done ? 'Splitting into ' + model.count + ' parts… ' + Math.round(100 * p.done / p.total) + '% · ' + (p.eta > 5 ? mins(p.eta) + ' left' : 'almost done') : 'Splitting… getting ready (' + (p.workers || 1) + ' at work)') } });
      const rec = { name: s.name, len: mix[0].length, sr: SR, created: Date.now(), model: model.id, stems };
      const kept = await store(fp, rec);
      if (job !== me) return;
      say('Loading the parts…'); bar.value = 1000;
      const list = partList([toHalf16(mix[0]), toHalf16(mix[1])], stems, model.key);
      job = null; cancel.hidden = true;
      await h.useParts(list);
      msg = model.count + ' parts ready.' + (kept ? ' Kept on this device: this song opens split next time.' : ' (Not enough storage to keep them for next time.)');
      st.textContent = msg; showStore();
    } catch (e) {
      if (job !== me && !(e && e.canceled)) return;
      msg = e && e.canceled ? 'Split canceled.' : e && e.user ? e.message : 'Splitting failed: ' + (e && e.message || e);
      if (!(e && (e.user || e.canceled))) console.error(e);
      st.textContent = msg; cancel.hidden = true; job = null;
    } finally { try { if (wl) wl.release() } catch (e) {} if (job === me) job = null; refresh() }
  }
  btn.onclick = open; go.onclick = start; no.onclick = () => { ask.hidden = true; refresh() };
  cancel.onclick = () => { if (job) job.ac.abort() };
  clr.onclick = async () => { await clearStored(); await showStore(); stoTxt.textContent = 'Stored splits cleared.'; sto.hidden = false; clr.hidden = true; setTimeout(() => { clr.hidden = false; showStore() }, 2500) };
  paint(); showStore(); refresh();
  return { refresh, cancel: () => { if (job) job.ac.abort(); msg = ''; run.hidden = true; refresh() }, busy: () => !!job };
}
