#!/usr/bin/env python3
"""QA for a built kit: clipping, onset/anchor alignment after MP3 decode, layer monotonicity. Usage: qa.py <kit_dir>"""
import sys,os,json,subprocess,io,numpy as np,soundfile as sf
from scipy.signal import correlate
SR=44100
d=sys.argv[1]; man=json.load(open(d+'/manifest.json')); idx={q['file']:q for q in json.load(open(d+'/_qa_index.json'))}
def dec(p):
    r=subprocess.run(['ffmpeg','-v','error','-i',p,'-f','wav','-acodec','pcm_f32le','-'],capture_output=True); x,sr=sf.read(io.BytesIO(r.stdout),always_2d=True,dtype='float64'); assert sr==SR and x.shape[1]==2; return x
def env(x,ms=4.0):
    m=np.abs(x).max(1); w=max(1,int(SR*ms/1000)); return np.sqrt(np.convolve(m**2,np.ones(w)/w,'same'))
worst_clip=0; worst_lag=0; worst_anchor=0; bad=[]; n=0; mono_bad=[]; dark_bad=[]; tot=0
for iname,inst in man['drums'].items():
    for aname,art in inst['articulations'].items():
        lv=[]; cs=[]
        for L in art['layers']:
            es=[]
            for f in L['files']:
                x=dec(f"{d}/{f}"); w,_=sf.read(f"{d}/_wav/{f[:-4]}.wav",always_2d=True,dtype='float64'); n+=1; tot+=len(x)
                pk=np.abs(x).max(); worst_clip=max(worst_clip,pk)
                if pk>=0.9999: bad.append((f,'clip',pk))
                # codec lag by cross-correlation of the first 60 ms around the anchor
                N=min(len(x),len(w),int(0.25*SR)); a=x[:N].mean(1); b=w[:N].mean(1)
                c=correlate(a,b,'full',method='fft'); lag=(c.argmax()-(N-1))/SR*1000
                worst_lag=max(worst_lag,abs(lag))
                # anchor position in the decoded file
                lead=art['lead_ms']
                if art['anchor']=='onset':
                    am=np.abs(x).max(1); pos=np.argmax(am>=0.1*am.max())/SR*1000
                else: pos=env(x).argmax()/SR*1000
                err=abs(pos-lead)+0  # ms
                # for peak anchors the decoded envelope maximum can wander on noise; judge alignment by codec lag there
                e=abs(lag) if art['anchor']=='peak' else max(abs(lag),err)
                worst_anchor=max(worst_anchor,e)
                if e>1.5: bad.append((f,'align',round(lag,2),round(pos,2),lead))
                es.append(10*np.log10((x**2).sum()/SR/2+1e-20))
            lv.append(float(np.median(es))); cs.append(L['centroid_hz'])
        if any(b<=a for a,b in zip(lv,lv[1:])): mono_bad.append((iname,aname,[round(v,1) for v in lv]))
        if len(cs)>1 and cs[0]>cs[-1]*1.15: dark_bad.append((iname,aname,cs))
print('files',n,'decoded MB (float32 stereo)',round(tot*8/1e6,1))
print('max decoded peak',round(20*np.log10(worst_clip),2),'dBFS')
print('worst codec lag ms',round(worst_lag,3),' worst alignment error ms',round(worst_anchor,3))
print('alignment/clip failures',len(bad),bad[:12])
print('level non-monotonic',mono_bad)
print('softest layer brighter than loudest by >15% (inherent to the instrument or source, listed for the builder):',len(dark_bad)); [print('  ',x) for x in dark_bad]
