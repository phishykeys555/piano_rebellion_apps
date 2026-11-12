# Song Dissector: third-party code and model files

Everything here runs in the browser. No song is ever uploaded.

## SignalsmithStretch.mjs
Signalsmith Stretch 1.3.2, MIT, Geraint Luff (signalsmith-audio.co.uk).
Patched for Song Dissector: `setStems`/`setGains` mix parts inside the worklet.

## ort/ (ONNX Runtime Web 1.31.1)
`ort.wasm.min.mjs`, `ort-wasm-simd-threaded.mjs`, `ort-wasm-simd-threaded.wasm`. These come unchanged from the npm package
`onnxruntime-web@1.31.1`, `dist/`. License: MIT, Copyright (c) Microsoft Corporation.
Only the WebAssembly (CPU) build is shipped. The splitter does not use WebGPU.

| file | bytes | sha256 |
|---|---|---|
| ort.wasm.min.mjs | 53725 | c21d9c326d453a4a61398270c804d5979e118540597cb0c07f7b3d64e6098234 |
| ort-wasm-simd-threaded.mjs | 24738 | 30ed0b5cd1182ede931fea448afb567d4dc705ec957af09f108a2be5f770dac3 |
| ort-wasm-simd-threaded.wasm | 14848852 | 4b884c203b0fa48d057be3332c65513ff85aa3c5bddd6946acc0fab7ecda001d |

## ../models/htdemucs/ (Demucs v4 "htdemucs", 4 parts: drums, bass, other, vocals)
- **Code:** Demucs, https://github.com/adefossez/demucs (commit 829d218), MIT, Copyright (c) Meta Platforms, Inc. and affiliates.
- **Weights:** the official release `adefossez/HTDemucs` on Hugging Face, file `955717e8.safetensors`
  (revision cbc8a9b, sha256 d9fa1413…6dd). The weights were released as float16 and are shipped here as float16, so nothing is lost.
- **Weights license: unclear.** The Demucs README says: "The license of the weights is not clear: MusDB contains some data
  that were only usable for research purpose. I sadly cannot help granting a license, both coming from Meta custom data, or
  from the original MusDB data." The Hugging Face repo states no license. The 4-part htdemucs model was trained on MUSDB18-HQ plus Meta's
  internal songs. (Not used: the 6-part model, trained only on Meta's internal data, which the README says is likely CC BY-NC.)
  Every widely used separation model has this same MUSDB issue. Open-Unmix's UMX-L weights are CC BY-NC-SA 4.0.
- **What was built:** `tools/export_htdemucs.py` exports the network without its STFT/iSTFT to ONNX (opset 17). The spectrogram
  is computed in `split-worker.js`, matching `htdemucs.py` `_spec` / `_mask` / `_ispec`. The script then moves every weight into a
  float16 blob, cut into two pieces under 50 MB. The worker expands the blob to float32 and passes it to ONNX Runtime as external data
  (`htdemucs.weights`). The script reproduces these files byte for byte from the official weights.

| file | bytes | sha256 |
|---|---|---|
| htdemucs.onnx (graph, no weights) | 6504422 | ebac9b861a8078a6c660c8a0d3b350ffa3e58783cf4dc4df7fb389713a11e431 |
| htdemucs.f16.0.bin | 47185920 | b8e7921b29562f993ce8f273b829f4d53917606ea5db21d5fb8abfd473b9b182 |
| htdemucs.f16.1.bin | 36705280 | fc3445f4e67508b107710719f7dde58667cd0d9c20b7daa0518f27b86f885163 |

Checks: the ONNX graph against PyTorch on a 7.8 s piece agrees to within 1.7e-4 (max abs). In the browser, after the JS STFT/iSTFT,
the result is 66 dB SNR against PyTorch `HTDemucs.forward`. A whole clip comes out within 49 dB (drums) of `demucs.apply.apply_model(shifts=0, overlap=0.25)`.

## Hosting
All files are served by GitHub Pages from this repo, on the same origin as the page. That means no CORS and no third-party CDN,
and it works inside the Notion embed. The first split downloads about 100 MB: model 88 MB plus runtime 15 MB. The model is then kept in the
Cache API (`song-dissector-models-v1`), and finished splits are kept in IndexedDB (`song-dissector-splits`).
No COOP/COEP headers are needed: each Web Worker runs its own single-threaded copy of the model.
