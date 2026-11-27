#!/usr/bin/env python3
"""Build drum-machine/kits/perc-2026 from the source libraries. Usage: build.py <spec.py> <out_dir>"""
import sys,os,glob,json,subprocess,io,math,re
import numpy as np, soundfile as sf
from scipy.signal import resample_poly
SR=44100
rng=np.random.default_rng(20261127)
def load(p):
    try: x,sr=sf.read(p,always_2d=True,dtype='float64')
    except Exception:
        r=subprocess.run(['ffmpeg','-v','error','-i',p,'-f','wav','-acodec','pcm_f32le','-'],capture_output=True)
        x,sr=sf.read(io.BytesIO(r.stdout),always_2d=True,dtype='float64')
    if sr!=SR:
        g=math.gcd(sr,SR); x=resample_poly(x,SR//g,sr//g,axis=0)
    if x.shape[1]==1: x=np.repeat(x,2,axis=1)
    x=x[:,:2]-x[:,:2].mean(0)
    return x
def env(x,ms=4.0):
    m=np.abs(x).max(1); w=max(1,int(SR*ms/1000)); return np.sqrt(np.convolve(m**2,np.ones(w)/w,'same'))
def energy_db(x): return 10*np.log10((x**2).sum()/SR/2+1e-20)
def cen(x):
    m=x.mean(1)[:int(SR*0.12)]
    if len(m)<256: m=np.pad(m,(0,256-len(m)))
    sp=np.abs(np.fft.rfft(m*np.hanning(len(m)))); fr=np.fft.rfftfreq(len(m),1/SR); return float((sp*fr).sum()/(sp.sum()+1e-12))
def f0(x,lo=100,hi=3000):
    """the three strongest spectral peaks (Hz) of the first 350 ms, strongest first"""
    m=x.mean(1)[int(SR*0.01):int(SR*0.35)]
    if len(m)<2048: m=np.pad(m,(0,2048-len(m)))
    n=1<<int(np.ceil(np.log2(len(m)))+1); sp=np.abs(np.fft.rfft(m*np.hanning(len(m)),n)); fr=np.fft.rfftfreq(n,1/SR)
    k=np.nonzero((fr>=lo)&(fr<=hi))[0]; s=sp[k]; pk=[]
    w=max(1,int(25/(fr[1]-fr[0])))
    for i in range(w,len(s)-w):
        if s[i]==s[i-w:i+w+1].max(): pk.append((s[i],fr[k][i]))
    pk.sort(reverse=True)
    return [round(float(f)) for a,f in pk[:3] if a>=pk[0][0]*0.25]
def prep(x,mode,lead_ms,max_len,tail_db,ref_peak):
    """returns trimmed audio whose anchor sits exactly lead_ms after the start"""
    a=np.abs(x).max(1); pk=a.max()
    if mode=='onset':
        anchor=int(np.argmax(a>=0.1*pk)); fin=0.0007
    else:
        anchor=int(env(x).argmax()); fin=0.003
    lead=int(round(lead_ms*SR/1000)); st=anchor-lead
    if st<0: x=np.vstack([np.zeros((-st,2)),x]); st=0
    x=x[st:].copy()
    e=env(x,2.0); thr=max(ref_peak*10**(tail_db/20), 0)
    idx=np.nonzero(e>thr)[0]; end=min(len(x),(idx[-1] if len(idx) else len(x))+int(0.004*SR),int(max_len*SR))
    end=max(end,lead+int(0.03*SR)); x=x[:end]
    if len(x)<end: x=np.vstack([x,np.zeros((end-len(x),2))])
    nf=int(fin*SR); 
    if nf>0: x[:nf]*=(np.sin(np.linspace(0,np.pi/2,nf))**2)[:,None]
    fo=int(min(0.15,max(0.008,0.2*(len(x)/SR-lead_ms/1000)))*SR); fo=min(fo,len(x)-lead-1) if len(x)-lead-1>8 else 8
    x[-fo:]*=(np.cos(np.linspace(0,np.pi/2,fo))**2)[:,None]
    return x
def raw_lead(x):
    e=env(x); ip=int(e.argmax()); a=np.nonzero(e>0.03*e.max())[0]; return (ip-a[0])/SR*1000
def main():
    spec_path,out=sys.argv[1],sys.argv[2]
    ns={}; exec(open(spec_path).read(),ns); INST=ns['INST']; META=ns['META']
    os.makedirs(out,exist_ok=True)
    for f in glob.glob(out+'/*.mp3'): os.remove(f)
    tmp=out+'/_wav'; os.makedirs(tmp,exist_ok=True)
    drums={}; nfiles=0; secs=0.0; qa=[]
    for iname,inst in INST.items():
        d=dict(name=inst['name'],gm=inst.get('gm',[]),source=inst['source'],main_articulation=inst.get('main',list(inst['arts'].keys())[0]),articulations={})
        for k in('choke_group','note','pan'): 
            if k in inst: d[k]=inst[k]
        art_lv={}
        for aname,art in inst['arts'].items():
            mode=art.get('anchor','onset'); max_len=art.get('max_len',1.2); tail_db=art.get('tail_db',-60)
            # collect layers
            if 'layers' in art: groups=[sum((sorted(glob.glob(g)) for g in (L if isinstance(L,list) else [L])),[]) for L in art['layers']]
            else:
                fl=sum((sorted(glob.glob(g)) for g in art['files']),[]); 
                fl=[f for f in fl if os.path.getsize(f)>1500]
                xs=[(energy_db(load(f)),f) for f in fl]; xs.sort()
                if 'pick' in art: xs=art['pick'](xs)
                nl=art.get('n_layers',1); rr=art.get('rr',4)
                parts=np.array_split(np.arange(len(xs)),nl); groups=[]
                for p in parts:
                    g=[xs[i] for i in p]
                    if len(g)>rr:  # keep the rr takes closest to the layer median
                        med=np.median([e for e,_ in g]); g=sorted(sorted(g,key=lambda t:abs(t[0]-med))[:rr])
                    groups.append([f for _,f in g])
            assert all(groups),(iname,aname,[len(g) for g in groups])
            data=[[load(f) for f in g] for g in groups]
            if mode=='peak':
                leads=[raw_lead(x) for g in data for x in g]; lead_ms=float(min(art.get('max_lead',60.0),round(np.median(leads))))
            else: lead_ms=1.5
            ref_peak=max(np.abs(x).max() for g in data for x in g)
            proc=[[prep(x,mode,lead_ms,max_len,tail_db,ref_peak) for x in g] for g in data]
            # levels
            en=[[energy_db(x) for x in g] for g in proc]; lv=[float(np.median(e)) for e in en]
            order=np.argsort(lv); proc=[proc[i] for i in order]; en=[en[i] for i in order]; lv=[lv[i] for i in order]; groups=[groups[i] for i in order]
            nat=[l-lv[-1] for l in lv]; rngdb=-nat[0]
            maxr=art.get('max_range',24.0)
            stored=[n*(maxr/rngdb) if rngdb>maxr else n for n in nat]
            layers=[]
            # gains: layer shift + RR clamp
            gains=[]
            for li,g in enumerate(proc):
                gl=[]
                for ri,x in enumerate(g):
                    dev=en[li][ri]-lv[li]; adj=-(dev-np.clip(dev,-1.5,1.5))
                    gl.append(stored[li]-nat[li]+adj)
                gains.append(gl)
            pk=max(np.abs(x).max()*10**(gains[li][ri]/20) for li,g in enumerate(proc) for ri,x in enumerate(g) if li==len(proc)-1)
            pk_all=max(np.abs(x).max()*10**(gains[li][ri]/20) for li,g in enumerate(proc) for ri,x in enumerate(g))
            target=10**(art.get('peak_db',-1.0)/20); G=20*np.log10(target/max(pk,pk_all))
            art_lv[aname]=lv[-1]  # recorded energy of the loudest layer
            nl=len(proc)
            # velocity splits by stored level (geometric), softest centred near 26 if >1 layers
            cents=[127*10**((s)/40) for s in stored] if nl>1 else [127]
            if nl>1:
                lo=cents[0]; cents=[26+(c-lo)*(127-26)/(127-lo) for c in cents]
            for li,g in enumerate(proc):
                files=[]; cs=[]; es=[]; ps=[]
                for ri,x in enumerate(g):
                    y=x*10**((gains[li][ri]+G)/20)
                    y=y+(rng.random(y.shape)-rng.random(y.shape))/32768.0
                    assert np.abs(y).max()<0.999,(iname,aname)
                    fn=f"{iname}_{aname}_{li+1}_{ri+1}"
                    sf.write(f"{tmp}/{fn}.wav",y,SR,subtype='PCM_16')
                    subprocess.run(['ffmpeg','-v','error','-y','-i',f"{tmp}/{fn}.wav",'-c:a','libmp3lame','-q:a','4','-joint_stereo','1',f"{out}/{fn}.mp3"],check=True)
                    files.append(fn+'.mp3'); cs.append(cen(y)); es.append(energy_db(y)); ps.append(20*np.log10(np.abs(y).max())); nfiles+=1; secs+=len(y)/SR
                    qa.append(dict(file=fn+'.mp3',inst=iname,art=aname,layer=li+1,rr=ri+1,mode=mode,lead_ms=lead_ms,src=os.path.basename(groups[li][ri])))
                vlo=1 if li==0 else int(round(math.sqrt(cents[li-1]*cents[li])))+1
                vhi=127 if li==nl-1 else int(round(math.sqrt(cents[li]*cents[li+1])))
                layers.append(dict(layer=li+1,vel_lo=vlo,vel_hi=vhi,natural_rel_db=round(nat[li],2),stored_rel_db=round(stored[li],2),gain_trim_db=round(nat[li]-stored[li],2),energy_db=round(float(np.median(es)),1),peak_db=round(float(max(ps)),2),centroid_hz=int(round(float(np.median(cs)))),files=files,sources=[os.path.basename(f) for f in groups[li]]))
            ad=dict(anchor=mode,lead_ms=lead_ms,layers=layers,round_robins=max(len(l['files']) for l in layers),max_len_s=round(max(len(x) for g in proc for x in g)/SR,3))
            if art.get('tonal'): ad['partials_hz']=f0(proc[-1][0])
            for k in('note','role','hand','choke','source'): 
                if k in art: ad[k]=art[k]
            d['articulations'][aname]=ad
        main=d['main_articulation']
        for aname in d['articulations']: d['articulations'][aname]['art_rel_db']=round(art_lv[aname]-art_lv[main],2)
        # reorder keys a little
        drums[iname]=d; print(iname,{a:[len(l['files']) for l in v['layers']] for a,v in d['articulations'].items()},flush=True)
    size=sum(os.path.getsize(f) for f in glob.glob(out+'/*.mp3'))
    META['format'].update(files=nfiles,bytes=size,seconds=round(secs,1),decoded_mb=round(secs*SR*2*4/1e6,1))
    META['drums']=drums
    json.dump(META,open(out+'/manifest.json','w'),indent=1,ensure_ascii=False)
    json.dump(qa,open(out+'/_qa_index.json','w'))
    print('files',nfiles,'bytes',size,'seconds',round(secs,1))
main()
