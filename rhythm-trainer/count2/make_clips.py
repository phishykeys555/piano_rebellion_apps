#!/usr/bin/env python3
"""Rhythm Trainer counting voice, v2 (2026-11-25). Renders each counting word once with a neural voice
(Kokoro, Apache-2.0, offline), cuts it out of a spoken carrier, trims the start and the tail, levels it,
and measures the vowel-onset lead. Needs: kokoro-onnx, soundfile, numpy, scipy."""
import json, sys, numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt, resample_poly
from kokoro_onnx import Kokoro
K=Kokoro("kokoro-v1.0.onnx","voices-v1.0.bin")
VOICES={"warm_f":"af_heart","warm_m":"am_michael","bright":"af_bella"}
# text spoken for each clip (respelled where the voice mispronounces a bare syllable)
ALT={"ee":["ee","eee","E"],"uh":["uh","ah","a"],"trip":["trip","tri"],"let":["let","lit"]}
WORDS={"one":"one","two":"two","three":"three","four":"four","five":"five","six":"six","seven":"seven","eight":"eight","nine":"nine","ten":"ten","eleven":"eleven","twelve":"twelve",
       "and":"and","ee":"ee","uh":"uh","trip":"trip","let":"let","rest":"rest"}
TAIL={"six":0.075}  # words whose last consonant is part of the word keep a short tail
SR=24000
def env(x,ms=5):
    n=int(SR*ms/1000); k=np.ones(n)/n; return np.sqrt(np.convolve(x*x,k,mode="same")+1e-12)
def lowband(x): return sosfilt(butter(4,1200,"low",fs=SR,output="sos"),x)
def segments(x):
    e=env(x,5); thr=e.max()*10**(-42/20); on=e>thr; segs=[]; i=0; n=len(x)
    while i<n:
        if on[i]:
            j=i
            while j<n and (on[j] or (j+int(SR*0.09)<n and on[j:j+int(SR*0.09)].any())): j+=1
            segs.append((i,j)); i=j
        else: i+=1
    return segs

from faster_whisper import WhisperModel
WM=WhisperModel("tiny.en",device="cpu",compute_type="int8")
def _words(s):
    a=resample_poly(s,2,3).astype(np.float32)  # 24k -> 16k
    seg,_=WM.transcribe(a,beam_size=1,word_timestamps=True,language="en",condition_on_previous_text=False)
    return [(w.word.strip().lower(),w.start,w.end) for sg in seg for w in sg.words]
def render(word,voice,speed):
    # each word is spoken on its own (a carrier phrase bled the neighbouring word into the cut); trimming happens in process()
    txt=ALT.get(word,[WORDS[word]])[0]
    s,_=K.create(txt,voice=voice,speed=speed,lang="en-us"); return np.asarray(s,dtype=np.float64)
def process(word,x):
    lb=lowband(x); le=env(lb,6); pk=le.max()
    v=np.where(le>pk*10**(-30/20))[0]; vstart,vend=v[0],v[-1]
    allenv=env(x,4); a=np.where(allenv>allenv.max()*10**(-38/20))[0][0]
    a=max(0,a-int(SR*0.004)); end=vend+int(SR*TAIL.get(word,0.0))+int(SR*0.01); end=min(len(x),end)
    y=x[a:end].copy()
    fi=int(SR*0.004); fo=int(SR*(0.03 if word in TAIL else 0.02)); fo=min(fo,len(y)//2)
    y[:fi]*=np.linspace(0,1,fi); y[-fo:]*=np.linspace(1,0,fo)
    # lead = seconds from clip start to the vowel onset (voiced energy reaches 35% of its peak)
    le2=env(lowband(y),5); lead=float(np.where(le2>le2.max()*0.35)[0][0]/SR)
    # level: RMS of the active part to -20 dBFS, then cap the peak at -1 dBFS
    act=y[np.abs(y)>np.abs(y).max()*0.05]; g=10**(-20/20)/max(np.sqrt(np.mean(act**2)),1e-6); y=y*g
    if np.abs(y).max()>0.89: y=y*0.89/np.abs(y).max()
    return y.astype(np.float32),lead
if __name__=="__main__":
    out=sys.argv[1]; lead={}
    import os
    for vk,v in VOICES.items():
        os.makedirs(f"{out}/{vk}",exist_ok=True); lead[vk]={}
        for w in WORDS:
            for sfx,speed in (("",1.0),("_s",1.4)):
                x=render(w,v,speed)
                if x is None: print("FAILED",vk,w,sfx); continue
                y,ld=process(w,x); sf.write(f"{out}/{vk}/{w}{sfx}.wav",y,SR,subtype="PCM_16")
                lead[vk][w+sfx]={"lead":round(ld,4),"dur":round(len(y)/SR,4)}
    json.dump(lead,open(f"{out}/leads.json","w"),indent=0)
    print("done")
