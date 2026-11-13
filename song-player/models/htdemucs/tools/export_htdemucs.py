# Rebuilds song-player/models/htdemucs from the official Demucs v4 weights. See song-player/vendor/README.md.
# Usage: python export_htdemucs.py <demucs repo checkout> <weights .safetensors> <out dir> [name]
#   4 parts:  ... 955717e8.safetensors ../ htdemucs      (adefossez/HTDemucs)
#   6 parts:  ... 5c90dfd2.safetensors ../../htdemucs_6s htdemucs_6s   (adefossez/HTDemucs-6s)
# Needs: torch (CPU), onnx, onnxruntime, safetensors, einops, pyyaml.
import sys, torch, math
sys.path.insert(0, sys.argv[1])
NAME = sys.argv[4] if len(sys.argv) > 4 else 'htdemucs'
from demucs.hf import load_safetensors_model
from einops import rearrange
m = load_safetensors_model(sys.argv[2]).float().eval()
print(type(m), m.segment, m.samplerate, m.sources, m.nfft, m.hop_length, m.cac, m.wiener_iters)

class Core(torch.nn.Module):
    def __init__(s, m): super().__init__(); s.m = m
    def forward(s, mix, mag):
        self = s.m
        x = mag
        B, C, Fq, T = x.shape
        mean = x.mean(dim=(1, 2, 3), keepdim=True)
        std = x.std(dim=(1, 2, 3), keepdim=True)
        x = (x - mean) / (1e-5 + std)
        xt = mix
        meant = xt.mean(dim=(1, 2), keepdim=True)
        stdt = xt.std(dim=(1, 2), keepdim=True)
        xt = (xt - meant) / (1e-5 + stdt)
        saved = []; saved_t = []; lengths = []; lengths_t = []
        for idx, encode in enumerate(self.encoder):
            lengths.append(x.shape[-1])
            inject = None
            if idx < len(self.tencoder):
                lengths_t.append(xt.shape[-1])
                tenc = self.tencoder[idx]
                xt = tenc(xt)
                if not tenc.empty: saved_t.append(xt)
                else: inject = xt
            x = encode(x, inject)
            if idx == 0 and self.freq_emb is not None:
                frs = torch.arange(x.shape[-2], device=x.device)
                emb = self.freq_emb(frs).t()[None, :, :, None].expand_as(x)
                x = x + self.freq_emb_scale * emb
            saved.append(x)
        if self.crosstransformer:
            if self.bottom_channels:
                b, c, f, t = x.shape
                x = rearrange(x, "b c f t-> b c (f t)")
                x = self.channel_upsampler(x)
                x = rearrange(x, "b c (f t)-> b c f t", f=f)
                xt = self.channel_upsampler_t(xt)
            x, xt = self.crosstransformer(x, xt)
            if self.bottom_channels:
                x = rearrange(x, "b c f t-> b c (f t)")
                x = self.channel_downsampler(x)
                x = rearrange(x, "b c (f t)-> b c f t", f=f)
                xt = self.channel_downsampler_t(xt)
        for idx, decode in enumerate(self.decoder):
            skip = saved.pop(-1)
            x, pre = decode(x, skip, lengths.pop(-1))
            offset = self.depth - len(self.tdecoder)
            if idx >= offset:
                tdec = self.tdecoder[idx - offset]
                length_t = lengths_t.pop(-1)
                if tdec.empty:
                    pre = pre[:, :, 0]
                    xt, _ = tdec(pre, None, length_t)
                else:
                    skip = saved_t.pop(-1)
                    xt, _ = tdec(xt, skip, length_t)
        S = len(self.sources)
        x = x.view(B, S, -1, Fq, T)
        x = x * std[:, None] + mean[:, None]
        L = mix.shape[-1]
        xt = xt.view(B, S, -1, L)
        xt = xt * stdt[:, None] + meant[:, None]
        return x, xt

core = Core(m).eval()
L = int(m.segment * m.samplerate)
mix = torch.randn(1, 2, L) * 0.1
z = m._spec(mix); mag = m._magnitude(z)
print('L', L, 'mag', mag.shape)
with torch.no_grad():
    ref = m(mix)
    x, xt = core(mix, mag)
    out = xt + m._ispec(m._mask(z, x), L)
print('core vs full maxdiff', (out - ref).abs().max().item())
torch.onnx.export(core, (mix, mag), sys.argv[3] + '/' + NAME + '_core.onnx', input_names=['mix','mag'], output_names=['x','xt'], opset_version=17, do_constant_folding=True, dynamo=False)
print('exported')

# ---- pack: float16 weights (lossless: htdemucs was released as float16) in <50 MB chunks, graph references them as external data
import onnx, numpy as np, sys, os
from onnx import numpy_helper, TensorProto
m = onnx.load(sys.argv[3] + '/' + NAME + '_core.onnx')
out = sys.argv[3]
f16 = []; off = 0; inl = 0; nex = 0
for init in m.graph.initializer:
    a = numpy_helper.to_array(init)
    if a.dtype == np.float32 and a.size >= 256 and np.array_equal(a.astype(np.float16).astype(np.float32), a):
        b = a.astype(np.float16).tobytes()
        nbytes = a.size * 4
        init.ClearField('raw_data'); init.ClearField('float_data')
        init.data_location = TensorProto.EXTERNAL
        del init.external_data[:]
        for k, v in (('location', 'htdemucs.weights'), ('offset', str(off)), ('length', str(nbytes))):
            e = init.external_data.add(); e.key = k; e.value = v
        f16.append(b); off += nbytes; nex += 1
    else:
        inl += a.size * a.itemsize
blob = b''.join(f16)
onnx.save(m, out + '/' + NAME + '.onnx')
print('external tensors', nex, 'fp32 bytes', off, 'fp16 blob', len(blob), 'inline bytes', inl, 'graph file', os.path.getsize(out + '/' + NAME + '.onnx'))
# split into chunks under 50 MB
CH = 45 * 1024 * 1024
parts = [blob[i:i+CH] for i in range(0, len(blob), CH)]
for i, p in enumerate(parts):
    open(f'{out}/{NAME}.f16.{i}.bin', 'wb').write(p)
print('chunks', [len(p) for p in parts])
