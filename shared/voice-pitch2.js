/* CHMA Sing apps: shared voice engine. Version 2026-11-26.1 (was 2026-11-20.2)
   Used by Match Point, Hold Steady and Scale Climber.
   - Microphone in (raw: echo cancellation, noise suppression and auto gain off, same as Note Sprint), YIN pitch at 50 frames a second.
   - Median-of-5 smoothing, voiced/unvoiced gate by loudness (RMS) and YIN confidence.
   - Frames: {t, hz, midi (float, smoothed), rawMidi (this frame alone), note, cents (vs nearest note), rms, conf, voiced, ref}. t is in AudioContext seconds, so
     frames line up with the reference tones and clicks scheduled on the same clock. ref = a reference tone was sounding.
   - Reference sound: the sampled grand piano (see below; the old synth tone only while the samples load), with a low-note lift. Clicks: the plain click plus Rhythm Trainer's sounds.
   - Microphone picker (device list, remembered choice) in the standard microphone panel. hush() stops every scheduled sound.
   - "Use headphones" notice: every element with [data-vp-phones] shows while a reference tone plays with the mic on.
   - Voice types (one choice shared by all three apps), a pitch plot, and the standard microphone panel.
   Test hook: window.__vp. */
(function(){
'use strict';
const VER='2026-11-26.1';
const NAMES=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
const noteName=m=>{ m=Math.round(m); return NAMES[((m%12)+12)%12]+(Math.floor(m/12)-1) };
const pcName=m=>NAMES[((Math.round(m)%12)+12)%12];
const hz2midi=f=>69+12*Math.log2(f/440);
const midi2hz=m=>440*Math.pow(2,(m-69)/12);
const FLO=70, FHI=1100;                       // bass E2-ish to soprano C6-ish

/* ---------- FFT (radix 2, in place) ---------- */
const TB={};
function tables(N){ if(TB[N]) return TB[N]; const t={cs:new Float64Array(N>>1),sn:new Float64Array(N>>1),rv:new Uint32Array(N),re:new Float64Array(N),im:new Float64Array(N),re2:new Float64Array(N),im2:new Float64Array(N)};
  for(let i=0;i<N>>1;i++){ t.cs[i]=Math.cos(2*Math.PI*i/N); t.sn[i]=Math.sin(2*Math.PI*i/N) }
  const B=Math.round(Math.log2(N)); for(let i=0;i<N;i++){ let r=0; for(let k=0;k<B;k++) r|=((i>>k)&1)<<(B-1-k); t.rv[i]=r }
  return TB[N]=t }
function fft(re,im,N,inv,t){ const sg=inv?1:-1;
  for(let i=0;i<N;i++){ const j=t.rv[i]; if(j>i){ let x=re[i]; re[i]=re[j]; re[j]=x; x=im[i]; im[i]=im[j]; im[j]=x } }
  for(let s=2;s<=N;s<<=1){ const h=s>>1, st=N/s; for(let i=0;i<N;i+=s) for(let k=0;k<h;k++){ const c=t.cs[k*st], sn=sg*t.sn[k*st], a=i+k, b=a+h, xr=re[b]*c-im[b]*sn, xi=re[b]*sn+im[b]*c; re[b]=re[a]-xr; im[b]=im[a]-xi; re[a]+=xr; im[a]+=xi } } }

/* ---------- YIN (de Cheveigne & Kawahara 2002) ----------
   Difference function from one FFT cross-correlation, cumulative-mean-normalised difference, absolute threshold,
   walk to the bottom of the first dip, parabolic refinement. Returns {hz, conf, rms}; hz 0 = no pitch. */
function yin(buf,sr,o){ o=o||{}; const fLo=o.fLo||FLO, fHi=o.fHi||FHI, TH=o.th||0.15; const n=buf.length;
  let e=0; for(let i=0;i<n;i++) e+=buf[i]*buf[i]; const rms=Math.sqrt(e/n); if(rms<1e-5) return {hz:0,conf:0,rms};
  const maxLag=Math.min(Math.ceil(sr/fLo)+2,Math.floor(n/2)), minLag=Math.max(2,Math.floor(sr/fHi)-1), W=n-maxLag;
  let N=1; while(N<n) N<<=1; const t=tables(N), re=t.re, im=t.im, re2=t.re2, im2=t.im2;
  for(let i=0;i<N;i++){ re[i]=i<n?buf[i]:0; im[i]=0; re2[i]=i<W?buf[i]:0; im2[i]=0 }
  fft(re,im,N,false,t); fft(re2,im2,N,false,t);
  for(let k=0;k<N;k++){ const ar=re2[k], ai=im2[k], xr=re[k], xi=im[k]; re[k]=ar*xr+ai*xi; im[k]=ar*xi-ai*xr }   // conj(A) * X
  fft(re,im,N,true,t);                                                                                          // re[tau]*N = sum_{j<W} x[j] x[j+tau]
  const d=new Float64Array(maxLag+2), c=new Float64Array(maxLag+2);
  let e0=0; for(let j=0;j<W;j++) e0+=buf[j]*buf[j]; let et=e0;
  for(let tau=1;tau<=maxLag+1;tau++){ et+=buf[W+tau-1]*buf[W+tau-1]-buf[tau-1]*buf[tau-1]; d[tau]=Math.max(0,e0+et-2*re[tau]/N) }
  c[0]=1; let run=0; for(let tau=1;tau<=maxLag+1;tau++){ run+=d[tau]; c[tau]=run>0?d[tau]*tau/run:1 }
  let T=-1; for(let tau=minLag;tau<=maxLag;tau++) if(c[tau]<TH){ while(tau+1<=maxLag&&c[tau+1]<c[tau]) tau++; T=tau; break }
  if(T<0){ let mv=1; for(let tau=minLag;tau<=maxLag;tau++) if(c[tau]<mv){ mv=c[tau]; T=tau } if(T<0||mv>0.5) return {hz:0,conf:0,rms} }
  if(T<=minLag||T>=maxLag) return {hz:0,conf:0,rms};          // the true period is outside the range
  const x1=c[T-1], x2=c[T], x3=c[T+1], a=(x1+x3-2*x2)/2, b=(x3-x1)/2, Tf=a>0?T-b/(2*a):T;
  return {hz:sr/Tf, conf:Math.max(0,Math.min(1,1-x2)), rms} }

/* ---------- audio context, reference sound (sampled grand piano), clicks ----------
   2026-11-26.1: the reference is the Drum Machine's grand piano (the same files, ../drum-machine/keys/grand/, one velocity layer,
   a sample every minor third from A1 to E♭6, each shifted to the nearest note: C2-C6 and the drones below are covered). Until the
   samples are decoded the old synth tone plays. Low notes get an automatic lift (+3 dB at C3, +6 dB at C2) so they sound right on
   phone and laptop speakers without touching the volume slider; a limiter keeps the lift from clipping.
   Every tone and click is tracked, so hush() silences everything already scheduled (Stop never leaves a metronome running). */
let ctx=null, master=null, clickBus=null, limiter=null, toneUntil=0, phonesTimer=0;
function AC(){ if(!ctx){ ctx=new (window.AudioContext||window.webkitAudioContext)();
    limiter=ctx.createDynamicsCompressor(); limiter.threshold.value=-4; limiter.knee.value=0; limiter.ratio.value=20; limiter.attack.value=0.002; limiter.release.value=0.1; limiter.connect(ctx.destination);
    master=ctx.createGain(); master.gain.value=VP.volume(); master.connect(limiter);
    clickBus=ctx.createGain(); clickBus.gain.value=clickVolV; clickBus.connect(limiter); pianoDecode() }
  if(ctx.state!=='running') ctx.resume().catch(()=>{}); return ctx }
const live=new Set();   // {srcs, g, kind, t0, t1}: every scheduled sound, until it ends
function track(srcs,g,kind,t0,t1){ const e={srcs,g,kind,t0,t1}; live.add(e); const s=srcs[srcs.length-1]; s.onended=()=>live.delete(e); return e }
function hush(){ const a=ctx; if(!a) return; const t=a.currentTime;
  live.forEach(e=>{ try{ if(e.g){ e.g.gain.cancelScheduledValues(t); e.g.gain.setValueAtTime(e.g.gain.value,t); e.g.gain.linearRampToValueAtTime(0,t+0.015) } }catch(x){}
    e.srcs.forEach(s=>{ try{ s.stop(t+0.02) }catch(x){} }) });
  live.clear(); toneUntil=Math.min(toneUntil,t) }
function scheduled(kind){ const t=ctx?ctx.currentTime:0; let n=0; live.forEach(e=>{ if((!kind||e.kind===kind)&&e.t1>t) n++ }); return n }

const PDIR='../drum-machine/keys/grand/', PLAYER=11, PNOTES=[]; for(let n=33;n<=87;n+=3) PNOTES.push(n);
const SAL_TUNE=[10,13,11,-3,-9,-9,-11,-7,-4,0,-6,-3,-3,-6,-3,0,-4,-8,-8,-5,-7,-8,-12,-13,-12,-17,-17,-27,-38,-38]; // the samples' own tuning in cents (same table as the Drum Machine)
const ptune=n=>SAL_TUNE[(n-21)/3]||0, pRaw={}, pBuf={}; let pFetch=null, pDec=null, pErr=0;
// Cache API first (shared with the Drum Machine: the same files under the same names), then the network
async function cFetch(u){ try{ if(window.caches){ const c=await caches.open('mm-keys-v1'); const hit=await c.match(u); if(hit) return await hit.arrayBuffer(); const r=await fetch(u); if(!r.ok) throw new Error(r.status); try{ await c.put(u,r.clone()) }catch(e){} return await r.arrayBuffer() } }catch(e){}
  const r=await fetch(u); if(!r.ok) throw new Error('HTTP '+r.status); return await r.arrayBuffer() }
function pianoFetch(){ if(!pFetch) pFetch=Promise.all(PNOTES.map(n=>cFetch(new URL(PDIR+n+'_v'+PLAYER+'.mp3',location.href).href).then(ab=>{ pRaw[n]=ab }).catch(e=>{ pErr++; logErr('piano sample '+n+': '+(e&&e.message||e)) }))); return pFetch }
function peakN(b){ let m=1e-4; for(let c=0;c<b.numberOfChannels;c++){ const d=b.getChannelData(c); for(let i=0;i<d.length;i+=2){ const v=Math.abs(d[i]); if(v>m) m=v } } return 0.9/m }
function pianoDecode(){ if(pDec) return pDec; const a=ctx; if(!a) return Promise.resolve();
  pDec=pianoFetch().then(()=>Promise.all(PNOTES.map(n=>{ const ab=pRaw[n]; if(!ab) return null; pRaw[n]=null;
    return new Promise((res,rej)=>{ const p=a.decodeAudioData(ab,res,rej); if(p&&p.then) p.then(res,rej) }).then(b=>{ b._pk=peakN(b); pBuf[n]=b }).catch(()=>{ pErr++ }) }))); return pDec }
function pianoReady(ms){ AC(); return Promise.race([pianoDecode(),new Promise(r=>setTimeout(r,ms==null?3000:ms))]) }
const nearP=m=>PNOTES.reduce((p,c)=>Math.abs(c-m)<Math.abs(p-m)?c:p);
const lift=m=>Math.pow(2,Math.max(0,60-m)/24);   // automatic low-note boost: 1 at middle C and up, x1.41 at C3, x2 at C2
function tone(midi,dur,when,vol){ const a=AC(); when=Math.max(a.currentTime+0.02,when||a.currentTime+0.05); dur=dur||1; vol=vol==null?1:vol;
  const end=when+dur, n=nearP(midi), b=pBuf[n], rel=midi<48?0.2:midi<72?0.13:0.09;
  if(b){ const s=a.createBufferSource(), g=a.createGain(); s.buffer=b; s.playbackRate.value=Math.pow(2,((midi-n)*100+ptune(n))/1200);
    const pk=0.5*vol*lift(midi)*b._pk; g.gain.setValueAtTime(0,when); g.gain.linearRampToValueAtTime(pk,when+0.003); g.gain.setValueAtTime(pk,end); g.gain.setTargetAtTime(0,end,rel);
    const stopAt=Math.min(end+rel*8,when+b.duration/s.playbackRate.value+0.05); s.connect(g); g.connect(master); s.start(when); s.stop(stopAt); track([s],g,'tone',when,stopAt) }
  else{ // the samples are still loading: the old synth tone (sine + triangle + a soft 2nd partial)
    const f=midi2hz(midi), out=a.createGain(), lp=a.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=Math.min(6000,f*8); lp.Q.value=0.4;
    const pk=0.32*vol*lift(midi), g=out.gain; g.setValueAtTime(0.0001,when); g.exponentialRampToValueAtTime(pk,when+0.012);
    g.exponentialRampToValueAtTime(pk*0.55,when+0.35); g.setTargetAtTime(pk*0.35,when+0.35,Math.max(0.2,dur*0.6));
    g.setTargetAtTime(0.0001,Math.max(when+0.05,end-0.06),0.03); out.connect(lp); lp.connect(master); const os=[];
    [['sine',1,0.75],['triangle',1,0.35],['sine',2,0.12]].forEach(([ty,h,v])=>{ const o=a.createOscillator(), og=a.createGain(); o.type=ty; o.frequency.value=f*h; og.gain.value=v; o.connect(og); og.connect(out); o.start(when); o.stop(end+0.25); os.push(o) });
    track(os,out,'tone',when,end+0.25) }
  toneUntil=Math.max(toneUntil,end+0.15+rel);
  if(mic) phones(when,end);
  return end }

/* clicks: "Classic click" is the original filtered-noise click; the others are Rhythm Trainer's list (side stick, hi-hat and kick are the
   Drum Machine's samples from AVL Drumkits by Glen MacArthur, CC BY-SA 4.0; the cowbell and shaker are Simple Metronome's recordings, VCSL, CC0).
   The microphone is always listening while you sing, so the two ringing pitched sounds (cowbell, beep) play the classic click instead (mic-safe),
   and the woodblock picks a pitch at least 3 half steps from every note you sing (clickAvoid). */
const CLK={classic:{n:'Classic click'},
  cow:{n:'More cowbell',noNote:1,s:'@cowbell',sv:['','','-soft'],mix:1.25,p:[[1,1,0.16],[1.48,0.8,0.12],[2,0.1,0.06],[2.96,0.07,0.05]],b:[540,505,580,620,470,660]},
  wood:{n:'Woodblock',mix:0.6,p:[[1,1,0.04],[2.3,0.32,0.022],[3.9,0.1,0.012]],b:[880,820,950,1020,760]},
  clave:{n:'Clave',p:[[1,1,0.075],[1.62,0.1,0.03]],b:[2500,2350,2650,2220]},
  beep:{n:'Beep (electronic)',noNote:1,p:[[1,1,0.05,1],[3,0.12,0.05,1]],b:[1000,940,1060,880,1120]},
  rim:{n:'Side stick',s:'ss/stick_',sv:[3,5,2]}, hat:{n:'Hi-hat',s:'bb/hat_',sv:[3,5,2]}, kick:{n:'Kick on 1 + hi-hat (drummer)',s:'bp/kick_',sv:[3,5,2],mix:0.9}};
let clickKind='classic', clickVolV=0.8, clickAvoid=[];
const clickSafe=k=>!(CLK[k]&&CLK[k].noNote);
const clickPlayed=()=>CLK[clickKind]&&clickSafe(clickKind)?clickKind:'classic';
const SBUF={};
function sndPath(p){ return p[0]==='@'?'../simple-metronome/sounds/'+p.slice(1)+'.mp3':'../drum-machine/kits/'+p+'.mp3' }
function sndLoad(p){ if(SBUF[p]!==undefined) return; const a=AC(); SBUF[p]=null;
  fetch(sndPath(p)).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.arrayBuffer() }).then(b=>new Promise((res,rej)=>{ const x=a.decodeAudioData(b,res,rej); if(x&&x.then) x.then(res,rej) }))
    .then(buf=>{ buf._pk=peakN(buf); SBUF[p]=buf }).catch(e=>{ delete SBUF[p]; logErr('click sound '+p+': '+(e&&e.message||e)) }) }
function sndNeed(){ const k=clickPlayed(), S=CLK[k]; if(!S||!S.s) return []; const o=S.sv.map(v=>S.s+v); if(k==='kick') S.sv.forEach(v=>o.push('bb/hat_'+v)); return o }
function clickReady(ms){ const need=sndNeed(); need.forEach(sndLoad); const t0=performance.now();
  return new Promise(r=>{ const k=()=>{ if(need.every(p=>SBUF[p])||performance.now()-t0>(ms==null?3000:ms)) r(); else setTimeout(k,30) }; k() }) }
function clickBase(S){ const ok=f=>S.p.every(([r])=>[1,2].every(m=>{ const x=hz2midi(f*r*m); return clickAvoid.every(tg=>{ const d=Math.abs(((x-tg)%12+12)%12); return Math.min(d,12-d)>=1.5&&Math.abs(x-tg)>=3 }) }));
  return S.b.find(ok)||S.b[0] }
function click(when,accent){ const a=AC(); when=Math.max(a.currentTime+0.01,when||0); const k=clickPlayed(), S=CLK[k];
  if(k!=='classic'){ const G=(accent?0.7:0.5)*(accent?1.15:1);
    if(S.s){ const play=(path,gain)=>{ const buf=SBUF[path]; if(!buf) return false; const s=a.createBufferSource(), g=a.createGain(); s.buffer=buf; g.gain.value=gain*buf._pk; s.connect(g); g.connect(clickBus); s.start(when); track([s],g,'click',when,when+buf.duration); return true };
      let ok; if(k==='kick'){ ok=play('bb/hat_'+S.sv[accent?0:1],G*(accent?0.5:0.85)); if(accent) ok=play(S.s+S.sv[1],G*(S.mix||1))||ok }
      else ok=play(S.s+S.sv[accent?1:0],G*(S.mix||1));
      if(ok) return }
    else{ const f=clickBase(S), out=a.createGain(), os=[]; out.connect(clickBus); let t1=when;
      for(const [r,lv,dc,flat] of S.p){ const o=a.createOscillator(), g=a.createGain(), A=G*lv*1.6*(S.mix||1), e=flat?when+dc+0.012:when+0.0015+dc*4; o.type='sine'; o.frequency.setValueAtTime(f*r,when);
        g.gain.setValueAtTime(0.0001,when); g.gain.linearRampToValueAtTime(A,when+0.0015); if(flat){ g.gain.setValueAtTime(A,when+dc); g.gain.exponentialRampToValueAtTime(0.0001,e) } else g.gain.exponentialRampToValueAtTime(0.0001,e);
        o.connect(g); g.connect(out); o.start(when); o.stop(e+0.05); os.push(o); t1=Math.max(t1,e+0.05) }
      track(os,out,'click',when,t1); return } }
  const len=Math.floor(a.sampleRate*0.03), b=a.createBuffer(1,len,a.sampleRate), ch=b.getChannelData(0);
  for(let i=0;i<len;i++) ch[i]=(Math.random()*2-1)*Math.exp(-i/(len/6));
  const s=a.createBufferSource(), bp=a.createBiquadFilter(), g=a.createGain(); s.buffer=b; bp.type='bandpass'; bp.frequency.value=accent?3200:2400; bp.Q.value=0.9; g.gain.value=accent?0.9:0.55;
  s.connect(bp); bp.connect(g); g.connect(clickBus); s.start(when); track([s],g,'click',when,when+0.03) }
function phones(when,end){ const a=AC(), on=()=>document.querySelectorAll('[data-vp-phones]').forEach(e=>e.hidden=false);
  setTimeout(on,Math.max(0,(when-a.currentTime)*1000)); clearTimeout(phonesTimer);
  phonesTimer=setTimeout(()=>document.querySelectorAll('[data-vp-phones]').forEach(e=>e.hidden=true),Math.max(0,(end-a.currentTime)*1000)+4000) }
/* the last errors, for "Copy log" */
const errs=[];
function logErr(t){ errs.push(new Date().toTimeString().slice(0,8)+' '+String(t).slice(0,300)); if(errs.length>12) errs.shift() }
try{ window.addEventListener('error',e=>logErr((e.message||'error')+(e.filename?' @ '+e.filename.split('/').slice(-2).join('/')+':'+e.lineno:''))); window.addEventListener('unhandledrejection',e=>logErr('promise: '+((e.reason&&e.reason.message)||e.reason))) }catch(e){}
setTimeout(pianoFetch,300);   // fetch the piano early (no audio needed for that); it is decoded once the first tap makes the audio context
/* ---------- microphone ---------- */
let mic=null, listeners=[], hist=[], unv=0, last=null, fakeOsc=null, frameN=0;
const inFrame=(()=>{ try{ return window.self!==window.top }catch(e){ return true } })();
function policyBlocked(){ try{ const p=document.permissionsPolicy||document.featurePolicy; return !!(p&&p.allowsFeature&&!p.allowsFeature('microphone')) }catch(e){ return false } }
const store={get(k,d){ try{ const v=localStorage.getItem(k); return v==null?d:v }catch(e){ return d } }, set(k,v){ try{ localStorage.setItem(k,v) }catch(e){} }};
function gate(){ return 0.02*Math.pow(0.08,VP.sens()/100) }   // sensitivity 0..100 -> RMS gate 0.02 .. 0.0016
async function start(o){ o=o||{}; if(mic) return mic; const a=AC(); const resumed=a.resume().catch(()=>{});   // inside the tap, before any await (iOS)
  let stream=null, src;
  if(o.fake){ fakeOsc=a.createOscillator(); fakeOsc.type=o.fake==='sine'?'sine':'sawtooth'; const fg=a.createGain(); fg.gain.value=0; fakeOsc.connect(fg); fakeOsc.start(); src=fg; src._fg=fg }
  else{ if(inFrame&&policyBlocked()){ const e=new Error('blocked'); e.name='FrameBlocked'; throw e }
    if(!window.isSecureContext||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){ const e=new Error('nomic'); e.name='NoMediaDevices'; throw e }
    try{ if(navigator.audioSession) navigator.audioSession.type='play-and-record' }catch(e){}
    const c={echoCancellation:false,noiseSuppression:false,autoGainControl:false}; if(o.deviceId) c.deviceId={exact:o.deviceId};
    try{ stream=await navigator.mediaDevices.getUserMedia({audio:c}) }
    catch(e){ if(o.deviceId&&e&&/Overconstrained|NotFound/.test(e.name)) stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}}); else throw e }   // that mic was unplugged: use the default one
    src=a.createMediaStreamSource(stream) }
  await Promise.race([resumed,new Promise(r=>setTimeout(r,1500))]);
  const an=a.createAnalyser(); an.fftSize=a.sampleRate>50000?4096:2048; an.smoothingTimeConstant=0; const mute=a.createGain(); mute.gain.value=0;
  src.connect(an); an.connect(mute); mute.connect(a.destination);                   // Safari/iOS only run nodes that reach the output
  mic={stream,src,an,mute,buf:new Float32Array(an.fftSize),fake:!!o.fake};
  hist=[]; unv=0; mic.timer=setInterval(tick,20);
  if(stream) stream.getAudioTracks().forEach(t=>t.addEventListener('ended',()=>{ stop(); emit('lost') }));
  emit('start'); return mic }
// switch microphones (the picker): the old one closes quietly (no "stop" event, so a round keeps going), the new one opens
async function switchMic(id){ if(!mic||mic.fake) return; const old=mic; clearInterval(old.timer); try{ old.stream.getTracks().forEach(t=>t.stop()) }catch(e){} try{ old.mute.disconnect(); old.an.disconnect() }catch(e){}
  mic=null; try{ await start({deviceId:id}) }catch(e){ logErr('switch microphone: '+(e&&e.name)); emit('stop'); throw e } }
function micLabel(){ try{ return mic&&mic.stream?mic.stream.getAudioTracks()[0].label||'(no name)':mic&&mic.fake?'test signal':'off' }catch(e){ return '?' } }
function stop(){ if(!mic) return; clearInterval(mic.timer); try{ if(mic.stream) mic.stream.getTracks().forEach(t=>t.stop()) }catch(e){} try{ mic.mute.disconnect(); mic.an.disconnect() }catch(e){}
  if(fakeOsc){ try{ fakeOsc.stop() }catch(e){} fakeOsc=null } mic=null; try{ if(navigator.audioSession) navigator.audioSession.type='playback' }catch(e){} emit('stop') }
const sysEv={};
function emit(k){ (sysEv[k]||[]).forEach(f=>{ try{ f() }catch(e){} }) }
function median(a){ const s=a.slice().sort((x,y)=>x-y), n=s.length; return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2 }
function tick(){ if(!mic) return; const a=ctx; mic.an.getFloatTimeDomainData(mic.buf); const n=mic.buf.length;
  const r=yin(mic.buf,a.sampleRate); frameN++;
  const t=a.currentTime-(n/2)/a.sampleRate;
  const okHz=r.hz>=FLO*0.97&&r.hz<=FHI*1.03, voiced=okHz&&r.rms>=gate()&&r.conf>=0.8;
  let midi=null;
  if(voiced){ const m=hz2midi(r.hz); unv=0;
    // a jump of more than a 4th from the running median restarts the median (a real new note), single-frame octave slips are voted out
    if(hist.length&&Math.abs(m-median(hist))>5&&hist.length<3) hist=[];
    hist.push(m); if(hist.length>5) hist.shift(); if(hist.length>=3) midi=median(hist) }
  else if(++unv>2) hist=[];
  // a smoothed pitch speaks for the middle of its median window: date it there (about 20-40 ms earlier), so onsets aren't graded late
  const tf=midi!=null?t-(hist.length-1)/2*0.02:t;
  const f={t:tf,hz:midi!=null?midi2hz(midi):0,raw:r.hz,rawMidi:midi!=null?hz2midi(r.hz):null,midi,note:midi!=null?noteName(midi):'',cents:midi!=null?Math.round((midi-Math.round(midi))*100):0,
    rms:r.rms,conf:r.conf,voiced:midi!=null,ref:t<toneUntil,n:frameN};
  last=f; listeners.forEach(fn=>{ try{ fn(f) }catch(e){ console.error(e) } }) }
function errText(e,app){ const n=e&&e.name;
  if(n==='FrameBlocked') return {text:'This page sits inside another page (like Notion) that can\'t share the microphone. Open full screen, then tap "Turn on the microphone".',open:true};
  if(n==='NoMediaDevices') return {text:'This browser can\'t reach the microphone here. Open '+app+' in Safari or Chrome.'+(inFrame?' Or open it full screen:':''),open:inFrame};
  if(n==='NotAllowedError'||n==='SecurityError'||n==='PermissionDeniedError') return inFrame?
    {text:'The page this sits inside (like Notion) may be blocking the microphone. Open full screen and allow it there.',open:true}:
    {text:app+' needs to hear you sing. Tap "Allow" when your device asks about the microphone. Tapped "Don\'t Allow" before? Turn the microphone on for this site in your browser settings (iPhone/iPad Safari: "aA" in the address bar, then "Website Settings", then "Microphone"), then tap the button again.',open:false};
  if(n==='NotFoundError'||n==='OverconstrainedError') return {text:'No microphone found. Plug one in or use a phone or tablet, then tap the button again.',open:false};
  if(n==='NotReadableError'||n==='AbortError') return {text:'Another app is using the microphone. Close it (or end the call), then tap the button again.',open:false};
  return {text:'The microphone didn\'t start. Reload the page and tap the button again.'+(inFrame?' Or open '+app+' full screen:':''),open:inFrame} }

/* ---------- voice types: one choice shared by all three apps ----------
   lo..hi = the full range this app uses (MIDI); l1 = the tonic of the comfortable 5-note range (do-re-mi-fa-sol). */
const VOICES=[
  {id:'bass',name:'Bass',lo:40,hi:62,l1:45},       // E2-D4, comfy A2-E3
  {id:'baritone',name:'Baritone',lo:43,hi:65,l1:48},// G2-F4, comfy C3-G3
  {id:'tenor',name:'Tenor',lo:48,hi:69,l1:53},     // C3-A4, comfy F3-C4
  {id:'alto',name:'Alto',lo:53,hi:74,l1:57},       // F3-D5, comfy A3-E4
  {id:'mezzo',name:'Mezzo',lo:57,hi:77,l1:60},     // A3-F5, comfy C4-G4
  {id:'soprano',name:'Soprano',lo:60,hi:81,l1:65}];// C4-A5, comfy F4-C5
const VKEY='chma-voice-type', MKEY='chma-voice-mic';

/* ---------- pitch plot: time across, pitch up; targets are bands, the voice is a line ----------
   cents mode: y is cents from one target (gridlines every 25 cents). */
function plot(cv){ const P={span:4,nowX:0.72,lo:57,hi:67,targets:[],pts:[],cents:null,now:0};
  function col(v,d){ const s=getComputedStyle(cv).getPropertyValue(v).trim(); return s||d }
  P.draw=function(){ const dpr=window.devicePixelRatio||1, w=cv.clientWidth, h=cv.clientHeight; if(!w||!h) return;
    if(cv.width!==Math.round(w*dpr)||cv.height!==Math.round(h*dpr)){ cv.width=Math.round(w*dpr); cv.height=Math.round(h*dpr) }
    const g=cv.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,w,h);
    const C={bg:col('--c-lcd','#0a0b0d'),grid:'rgba(154,163,178,.18)',lab:'#9aa3b2',led:col('--c-led','#ff7a2e'),ok:col('--c-ok','#33d17a'),band:'#4a7dff',now:'rgba(236,238,242,.5)'};
    g.fillStyle=C.bg; g.fillRect(0,0,w,h);
    const L=P.cents!=null?46:40, t0=P.now-P.span*P.nowX, x=t=>L+(t-t0)/P.span*(w-L), lo=P.lo, hi=P.hi, y=m=>h-6-(m-lo)/(hi-lo)*(h-12);
    g.font='600 11px '+(col('--f-num','monospace')); g.textBaseline='middle';
    if(P.cents!=null){ const step=(hi-lo)>2.2?50:25; for(let c=Math.ceil((lo-P.cents)*100/step)*step;c<=(hi-P.cents)*100;c+=step){ const yy=y(P.cents+c/100);
        g.strokeStyle=c===0?'rgba(236,238,242,.35)':C.grid; g.lineWidth=1; g.beginPath(); g.moveTo(L,yy); g.lineTo(w,yy); g.stroke(); g.fillStyle=C.lab; g.fillText(c===0?'0¢':(c>0?'+':'−')+Math.abs(c),4,yy) } }
    else{ const every=(hi-lo)>14?2:1; for(let m=Math.ceil(lo);m<=hi;m++){ const yy=y(m); g.strokeStyle=C.grid; g.lineWidth=1; g.beginPath(); g.moveTo(L,yy); g.lineTo(w,yy); g.stroke();
        if((m-Math.ceil(lo))%every===0){ g.fillStyle=C.lab; g.fillText(noteName(m),4,yy) } } }
    P.targets.forEach(T=>{ const a=x(T.t0), b=x(T.t1); if(b<L||a>w) return; const tol=(T.tol||25)/100; g.globalAlpha=T.state==='done'?0.18:0.32; g.fillStyle=T.color||C.band;
      g.fillRect(Math.max(L,a),y(T.midi+tol),Math.min(w,b)-Math.max(L,a),Math.max(2,y(T.midi-tol)-y(T.midi+tol))); g.globalAlpha=1;
      g.strokeStyle=T.color||C.band; g.lineWidth=2; g.beginPath(); g.moveTo(Math.max(L,a),y(T.midi)); g.lineTo(Math.min(w,b),y(T.midi)); g.stroke();
      if(T.label&&a>=L-2){ g.fillStyle=C.lab; g.fillText(T.label,a+3,y(T.midi+tol)-8) } });
    g.lineWidth=3; g.lineCap='round'; g.lineJoin='round'; let prev=null;
    for(const p of P.pts){ if(p.t<t0-0.2) { prev=null; continue } if(p.m==null||p.m<lo-1||p.m>hi+1){ prev=null; continue }
      if(prev&&p.t-prev.t<0.12){ g.strokeStyle=p.ok?C.ok:C.led; g.beginPath(); g.moveTo(x(prev.t),y(Math.max(lo,Math.min(hi,prev.m)))); g.lineTo(x(p.t),y(Math.max(lo,Math.min(hi,p.m)))); g.stroke() }
      prev=p }
    const nx=x(P.now); g.strokeStyle=C.now; g.lineWidth=1; g.setLineDash([3,4]); g.beginPath(); g.moveTo(nx,0); g.lineTo(nx,h); g.stroke(); g.setLineDash([]);
    const lp=P.pts[P.pts.length-1]; if(lp&&lp.m!=null&&P.now-lp.t<0.15&&lp.m>=lo&&lp.m<=hi){ g.fillStyle=lp.ok?C.ok:C.led; g.beginPath(); g.arc(x(lp.t),y(lp.m),5,0,7); g.fill() } };
  P.trim=function(){ const t0=P.now-P.span*P.nowX-0.5; while(P.pts.length&&P.pts[0].t<t0) P.pts.shift() };
  try{ new ResizeObserver(()=>P.draw()).observe(cv) }catch(e){}
  return P }

/* ---------- standard microphone panel ----------
   ids: <prefix>Btn (button), Open (full-screen link), Stat (status line), Lvl (level bar fill), Sens (sensitivity range, optional). */
function micPanel(app,ids){ const $=id=>document.getElementById(id), btn=$(ids.btn), open=$(ids.open), stat=$(ids.stat), lvl=ids.lvl&&$(ids.lvl);
  const idle=ids.idle||'Tap the button, then tap "Allow" when your device asks.';
  function help(t,o){ stat.textContent=t; open.hidden=!o; if(o) open.href=location.href.split('#')[0] }
  function set(on){ btn.textContent=on?'Microphone on':'Turn on the microphone'; btn.disabled=!!on; btn.classList.toggle('on',!!on) }
  if(inFrame&&policyBlocked()) help('This page sits inside another page (like Notion) that can\'t share the microphone. Open full screen, then tap "Turn on the microphone".',true); else stat.textContent=idle;
  let busy=false;
  async function go(){ if(mic) return true; if(busy) return false; busy=true; btn.disabled=true; btn.textContent='Waiting for the microphone…';
    const slow=setTimeout(()=>{ if(busy) help('Still waiting for the microphone. Tap "Allow" if your device is asking.'+(inFrame?' No question showed up? Open full screen:':''),inFrame) },9000);
    try{ await start(VP.fakeMode?{fake:VP.fakeMode}:{deviceId:store.get(MKEY,'')||undefined}); clearTimeout(slow); busy=false; set(true); open.hidden=true; stat.textContent=ids.on||'Listening. Sing any note: the level bar should move.'; fill(); return true }
    catch(e){ clearTimeout(slow); busy=false; set(false); logErr('microphone: '+(e&&e.name||e)); const m=errText(e,app); help(m.text,m.open); return false } }
  btn.addEventListener('click',go);
  // the microphone picker (Note Sprint's): the device list and the Level meter show once the mic is on; the choice is remembered on this device
  const ctl=ids.ctl&&$(ids.ctl), sel=ids.sel&&$(ids.sel);
  async function fill(){ if(!ctl) return; ctl.hidden=false; if(!sel||!mic||!mic.stream) return;
    try{ const devs=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput'), cur=mic.stream.getAudioTracks()[0].getSettings().deviceId;
      sel.innerHTML=devs.map((d,i)=>`<option value="${d.deviceId}">${(d.label||('Microphone '+(i+1))).replace(/[<>&"]/g,'')}</option>`).join(''); if(cur) sel.value=cur }catch(e){} }
  if(sel) sel.addEventListener('change',async e=>{ const id=e.target.value; store.set(MKEY,id); try{ await switchMic(id); stat.textContent=ids.on||'Listening.'; fill() }catch(x){ const m=errText(x,app); help(m.text,m.open) } });
  on('stop',()=>{ set(false); if(ctl) ctl.hidden=true }); on('lost',()=>{ stat.textContent='The microphone stopped (screen locked or another app took it). Tap the button to turn it back on.' });
  if(lvl) listen(f=>{ lvl.style.width=Math.min(100,Math.sqrt(f.rms/0.2)*100)+'%'; lvl.classList.toggle('v',f.voiced) });
  const sens=ids.sens&&$(ids.sens); if(sens){ sens.value=VP.sens(); sens.addEventListener('input',()=>VP.sens(+sens.value)) }
  // the volume sliders (Settings "Tone volume" and the one by "Hear it") are one setting: the piano's volume
  const vols=[ids.vol,ids.vol2].map(i=>i&&$(i)).filter(Boolean); vols.forEach(v=>{ v.value=Math.round(VP.volume()*100); v.addEventListener('input',()=>{ VP.volume(+v.value/100); vols.forEach(w=>{ if(w!==v) w.value=v.value }) }) });
  return {go,help} }
function listen(fn){ listeners.push(fn); return ()=>{ listeners=listeners.filter(f=>f!==fn) } }
function on(k,fn){ (sysEv[k]=sysEv[k]||[]).push(fn) }

/* voice-type picker: buttons into container; calls back with the voice object.
   Once a voice is chosen the six buttons fold into one line ("Tenor · C3–A4 · Change") so the practice card sits higher on a phone. */
function voicePicker(el,cb){ const cur=VP.voice(); el.innerHTML='';
  const sum=document.createElement('div'); sum.className='vsum'; const grid=document.createElement('div'); grid.className='vgrid';
  function fold(v){ if(!v){ sum.hidden=true; grid.hidden=false; return } sum.hidden=false; grid.hidden=true;
    sum.innerHTML='<span><b>'+v.name+'</b> · '+noteName(v.lo)+'–'+noteName(v.hi)+'</span><button type="button" class="ghost vchg">Change</button>';
    sum.querySelector('button').addEventListener('click',()=>{ sum.hidden=true; grid.hidden=false; const b=grid.querySelector('[aria-pressed="true"]')||grid.querySelector('button'); try{ b.focus() }catch(e){} }) }
  VOICES.forEach(v=>{ const b=document.createElement('button'); b.type='button'; b.className='vbtn'; b.dataset.v=v.id; b.setAttribute('aria-pressed',cur&&cur.id===v.id?'true':'false');
    b.innerHTML='<b>'+v.name+'</b><span>'+noteName(v.lo)+'–'+noteName(v.hi)+'</span>';
    b.addEventListener('click',()=>{ VP.voice(v.id); grid.querySelectorAll('.vbtn').forEach(x=>x.setAttribute('aria-pressed',x===b?'true':'false')); fold(v); cb&&cb(v) }); grid.appendChild(b) });
  el.appendChild(sum); el.appendChild(grid); fold(cur);
  return cur }

document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&ctx&&ctx.state!=='running') ctx.resume().catch(()=>{}) });

const VP={VER,NAMES,noteName,pcName,hz2midi,midi2hz,yin,tone,click,start,stop,listen,on,errText,micPanel,voicePicker,plot,median,VOICES,inFrame,policyBlocked,
  hush,scheduled,pianoReady,clickReady,switchMic,micLabel,logErr,errors:()=>errs.slice(),CLICKS:CLK,clickSafe,
  piano:()=>({loaded:Object.keys(pBuf).length,total:PNOTES.length,failed:pErr}),
  clickKind(k){ if(k!=null&&CLK[k]){ clickKind=k; sndNeed().forEach(sndLoad) } return clickKind },
  clickVol(v){ if(v!=null){ clickVolV=v; if(clickBus) clickBus.gain.value=v } return clickVolV },
  clickAvoid(list){ clickAvoid=list||[] },
  ctx:AC, now:()=>AC().currentTime, latency:()=>{ const a=AC(); return (a.baseLatency||0)+(a.outputLatency||0) }, isOn:()=>!!mic, last:()=>last, fakeMode:null,
  voice(id){ if(id){ store.set(VKEY,id); return VOICES.find(v=>v.id===id) } const s=store.get(VKEY,''); return VOICES.find(v=>v.id===s)||null },
  sens(v){ if(v!=null){ store.set('chma-voice-sens',String(v)); return v } const s=+store.get('chma-voice-sens',60); return isFinite(s)?Math.max(0,Math.min(100,s)):60 },
  volume(v){ if(v!=null){ store.set('chma-voice-vol',String(v)); if(master) master.gain.value=v; return v } const s=+store.get('chma-voice-vol',0.8); return isFinite(s)?s:0.8 },
  /* tests: sing a fake voice into the engine (sawtooth). hz 0/null = silence */
  fake(hz,when){ if(!fakeOsc||!mic) return false; const a=ctx, t=when||a.currentTime; if(hz){ fakeOsc.frequency.setValueAtTime(hz,t); mic.src._fg.gain.setValueAtTime(0.3,t) } else mic.src._fg.gain.setValueAtTime(0,t); return true },
  fakeAt(list){ list.forEach(([t,hz])=>VP.fake(hz,t)) }};
window.VP=VP; window.__vp=VP;
})();
