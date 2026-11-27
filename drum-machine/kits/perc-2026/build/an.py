import sys,os,numpy as np,soundfile as sf,subprocess,io
def load(p):
    try:
        x,sr=sf.read(p,always_2d=True,dtype='float64')
    except Exception:
        r=subprocess.run(['ffmpeg','-v','error','-i',p,'-f','wav','-acodec','pcm_f32le','-'],capture_output=True)
        x,sr=sf.read(io.BytesIO(r.stdout),always_2d=True,dtype='float64')
    return x,sr
def stats(p):
    x,sr=load(p); m=x.mean(1); pk=np.abs(x).max()+1e-12
    env=np.abs(x).max(1); on=np.argmax(env>pk*0.1)/sr
    # effective length: last sample above -50 dB rel peak
    idx=np.nonzero(env>pk*10**(-50/20))[0]; end=idx[-1]/sr if len(idx) else 0
    n=min(len(m),int(sr*0.5)); seg=m[int(on*sr):int(on*sr)+n]
    if len(seg)<64: seg=m
    sp=np.abs(np.fft.rfft(seg*np.hanning(len(seg)))); fr=np.fft.rfftfreq(len(seg),1/sr); cen=(sp*fr).sum()/(sp.sum()+1e-12)
    rms=np.sqrt((seg**2).mean())
    return dict(sr=sr,ch=x.shape[1],dur=len(x)/sr,pk=20*np.log10(pk),rms=20*np.log10(rms+1e-12),on=on,end=end,cen=cen)
if __name__=='__main__':
    for p in sys.argv[1:]:
        try:
            s=stats(p); print(f"{os.path.basename(p)[:44]:44s} sr{s['sr']} ch{s['ch']} dur{s['dur']:6.2f} pk{s['pk']:6.1f} rms{s['rms']:6.1f} on{s['on']*1000:7.1f}ms end{s['end']:5.2f} cen{s['cen']:6.0f}")
        except Exception as e: print(p,'ERR',e)
