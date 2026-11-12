/* CHMA hype music for round screens: original "get pumped" music synthesized live in Web Audio (no samples, no borrowed riffs).
   Version 2026-11-12.1: nine original songs, a different one every round (shuffled per session, no repeat until all have played).
   window.chmaHype = { play(ms, opts), stop(fadeMs), isPlaying(), endsAt, hitAt, songs, song }
   play(ms, opts)  music builds for ms milliseconds and lands a final hit exactly at ms (when the round starts).
     opts.ctx      the app's AudioContext (reuse it: iOS unlocks a context on a tap). Without it the module makes its own.
     opts.round    1-5 (1 = calm build, higher = more layers, filters open)   opts.bonus  true for the bonus round (the epic song)
     opts.enabled  false = do nothing (the app's music switch)
     opts.micSafe  true = the final hit lands early enough that every sound, tails included, is silent AT ms (mic modes).
     opts.song     optional song id or index (tests/previews); default = next song from the session shuffle.
   stop(fadeMs)    fades out (default 120 ms) and frees every node. Called on or after the final hit, it lets the hit's
                   short, gated tail finish (it is already scheduled to end by endsAt). Calling play() again stops the old music first.
   isPlaying()     true from play() until endsAt (including a pending iOS resume).
   endsAt          performance.now() time (ms) when the last sample is out of the speaker (output latency included); 0 if never played.
                   Mic modes: ignore mic input while isPlaying() and until endsAt + 150.
   hitAt           performance.now() time (ms) of the final hit as heard.
   songs           the song ids; song = id of the song last started.
   No reverb or delay lines: the only tails are the notes' own envelopes, and a hard gate closes the bus at the end. */
(function(){
 'use strict';
 var cur=null, last=null, own=null, WM=typeof WeakMap==='function', noiseBufs=WM?new WeakMap():null, curves=WM?new WeakMap():null;
 var TAIL=0.22, LEVEL=0.18, CDLY=0.006;   /* LEVEL sets the -16 dBFS-ish peak after the compressor (checked by offline render); CDLY = the compressor's look-ahead delay */
 var QU={M:[0,4,7],m:[0,3,7],'5':[0,7,12],M7:[0,4,7,11],m7:[0,3,7,10],'7':[0,4,7,10],'9':[0,4,7,10,14],m9:[0,3,7,10,14],M9:[0,4,7,11,14],
  sus4:[0,5,7],'6':[0,4,7,9],'69':[0,4,7,9,14],madd9:[0,3,7,14]};
 /* songs: tempo, swing, key, the last four bars before the hit in time order (a pair = two chords in that bar), the hit chord, level trim.
    The engine counts bars back from the hit, so the last bar always pulls into the hit chord. */
 var SONGS=[
  {id:'lofi',      bpm:86,  swing:0.60, key:5, prog:[[5,'M7'],[4,'m7'],[9,'m7'],[[2,'m7'],[7,'9']]],   hitq:[0,'M9'],  trim:1.25},
  {id:'funk',      bpm:104, swing:0.56, key:4, prog:[[0,'m7'],[5,'9'],[0,'m7'],[[8,'7'],[10,'7']]],     hitq:[0,'9'],   trim:1.3},
  {id:'rock',      bpm:160, swing:0.50, key:4, prog:[[0,'5'],[7,'5'],[9,'5'],[[5,'5'],[7,'5']]],         hitq:[0,'5'],   trim:1.15},
  {id:'house',     bpm:124, swing:0.50, key:9, prog:[[0,'m9'],[5,'m9'],[0,'m9'],[[8,'M7'],[10,'6']]],   hitq:[0,'m9'],  trim:1.0},
  {id:'trap',      bpm:140, swing:0.50, key:5, prog:[[0,'m'],[8,'M'],[0,'m'],[[10,'M'],[7,'M']]],       hitq:[0,'m'],   trim:1.0},
  {id:'dnb',       bpm:172, swing:0.50, key:7, prog:[[0,'m'],[8,'M'],[3,'M'],[[10,'M'],[10,'sus4']]],   hitq:[0,'madd9'],trim:1.0},
  {id:'synthwave', bpm:108, swing:0.50, key:2, prog:[[8,'M'],[10,'M'],[0,'m'],[[8,'M'],[10,'sus4']]],   hitq:[0,'madd9'],trim:1.0},
  {id:'samba',     bpm:100, swing:0.53, key:7, prog:[[0,'M7'],[9,'7'],[2,'m7'],[7,'7']],                hitq:[0,'69'],  trim:1.4},
  {id:'epic',      bpm:92,  swing:0.50, key:0, prog:[[0,'m'],[8,'M'],[3,'M'],[[10,'M'],[7,'M']]],       hitq:[0,'M'],   trim:1.0}
 ];
 var EPIC=8, bag=[], lastSong=-1;
 /* the session shuffle: every regular round gets the next song from a shuffled bag; never the same song twice in a row; the bonus is always the epic one */
 function pick(opts){
  if(opts.song!=null){ for(var i=0;i<SONGS.length;i++) if(SONGS[i].id===opts.song||i===opts.song) return i }
  if(opts.bonus) return EPIC;
  if(!bag.length){ for(var j=0;j<EPIC;j++) bag.push(j); for(var a=bag.length-1;a>0;a--){ var b=Math.floor(Math.random()*(a+1)), x=bag[a]; bag[a]=bag[b]; bag[b]=x }
   if(bag[bag.length-1]===lastSong){ var y=bag[0]; bag[0]=bag[bag.length-1]; bag[bag.length-1]=y } }
  lastSong=bag.pop(); return lastSong }
 function pnow(){ return (window.performance&&performance.now)?performance.now():Date.now() }
 function isOffline(ctx){ return typeof ctx.startRendering==='function' }
 function ownCtx(){ try{ if(!own){ var C=window.AudioContext||window.webkitAudioContext; if(!C) return null; own=new C() } return own }catch(e){ return null } }
 function noise(ctx){ var b=noiseBufs&&noiseBufs.get(ctx); if(b) return b; var n=Math.floor(ctx.sampleRate*2); b=ctx.createBuffer(1,n,ctx.sampleRate); var d=b.getChannelData(0), s=12345;
   for(var i=0;i<n;i++){ s=(s*1103515245+12345)&0x7fffffff; d[i]=s/0x3fffffff-1 } if(noiseBufs) noiseBufs.set(ctx,b); return b }
 function curve(ctx,amt){ var m=curves&&curves.get(ctx); if(!m){ m={}; if(curves) curves.set(ctx,m) } if(m[amt]) return m[amt];
   var N=1024, c=new Float32Array(N); for(var i=0;i<N;i++){ var x=i*2/(N-1)-1; c[i]=(1+amt)*x/(1+amt*Math.abs(x)) } m[amt]=c; return c }
 function mtof(m){ return 440*Math.pow(2,(m-69)/12) }
 function motif(list){ var o={}; list.forEach(function(x){ o[x[0]]=x }); return o }

 function build(s,ms,opts){
  var ctx=s.ctx, off=isOffline(ctx), pn=pnow(), t0=ctx.currentTime, lat=off?0:Math.min(0.25,Math.max(0,ctx.outputLatency||ctx.baseLatency||0));
  /* T = ctx time heard at ms. Default: the hit is heard at ms (scheduled CDLY early for the compressor). micSafe: the gate closes so the last sample is heard at ms. */
  var T=t0+ms/1000-lat, hit=opts.micSafe?T-TAIL-CDLY:T-CDLY, end=hit+TAIL+CDLY;
  var A=hit-(t0+0.06); if(A<1) return false;
  var S=SONGS[s.song], lvl=opts.bonus?6:Math.max(1,Math.min(5,(opts.round|0)||1)), I=[0,.3,.5,.62,.75,.88,1][lvl], key=S.key;
  /* tempo within 5% of the song's own; whole bars when they fit, otherwise whole beats counted back from the hit */
  var bpm=S.bpm, best=1e9; for(var N=1;N<=16;N++){ var b=240*N/A; if(b>=S.bpm*0.95&&b<=S.bpm*1.05&&Math.abs(b-S.bpm)<best){ best=Math.abs(b-S.bpm); bpm=b } }
  var beat=60/bpm, st=beat/4, n=Math.floor(A/beat+1e-6)*4, sw=((S.swing||0.5)-0.5)*2*st;
  var src=s.src, P=0;
  /* buses: drums + music -> compressor -> level -> gate -> out */
  var comp=ctx.createDynamicsCompressor(); comp.threshold.value=-14; comp.knee.value=8; comp.ratio.value=4; comp.attack.value=0.002; comp.release.value=0.12;
  var lev=ctx.createGain(); lev.gain.value=LEVEL; var gate=ctx.createGain(); gate.gain.setValueAtTime(1,t0); gate.gain.setValueAtTime(1,end-0.06); gate.gain.linearRampToValueAtTime(0,end);
  comp.connect(lev); lev.connect(gate); gate.connect(ctx.destination); s.gate=gate; s.nodes.push(comp,lev,gate);
  var bus=ctx.createGain(); bus.connect(comp);   /* the build: the whole mix swells into the hit */
  bus.gain.setValueAtTime((0.3+0.2*I)*S.trim,t0); bus.gain.linearRampToValueAtTime(0.85*S.trim,hit-st*2); bus.gain.setValueAtTime(S.trim,hit); s.nodes.push(bus);
  var NB=noise(ctx);
  function has(x){ return P+0.22*(lvl-1)>=x }   /* layer switch: a layer at x comes in when the build reaches it (later rounds start further in) */

  /* ---------- the kit (every voice is a few nodes with its own short envelope) ---------- */
  function env(g,t,pk,a,d){ g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002,pk),t+a); g.gain.exponentialRampToValueAtTime(0.0001,t+a+d) }
  function fin(x,t,len){ x.start(t); x.stop(Math.min(t+len,end)+0.01); src.push(x) }
  function osc(type,f){ var o=ctx.createOscillator(); o.type=type; o.frequency.value=f; return o }
  function nsrc(){ var b=ctx.createBufferSource(); b.buffer=NB; b.loop=true; b.loopStart=Math.random()*1.5; return b }
  function flt(type,f,q){ var x=ctx.createBiquadFilter(); x.type=type; x.frequency.value=f; if(q!=null) x.Q.value=q; return x }
  function G(dest){ var g=ctx.createGain(); g.connect(dest||bus); return g }
  function persist(x){ s.nodes.push(x); return x }
  function shaper(amt,post,cut,dest){ var w=persist(ctx.createWaveShaper()); w.curve=curve(ctx,amt); w.oversample='2x'; var f=persist(flt('lowpass',cut,0.7)), g=persist(ctx.createGain()); g.gain.value=post; w.connect(f); f.connect(g); g.connect(dest||bus); return w }
  function kick(t,v,f0,f1,dec){ var o=osc('sine',f0||160), g=G(); o.frequency.setValueAtTime(f0||160,t); o.frequency.exponentialRampToValueAtTime(f1||48,t+0.11); env(g,t,0.9*v,0.003,dec||0.24); o.connect(g); fin(o,t,(dec||0.24)+0.06) }
  function clap(t,v){ var x=nsrc(), f=flt('bandpass',1600,0.9), g=G();
   g.gain.setValueAtTime(0.0001,t); [0,0.011,0.022].forEach(function(d){ g.gain.setValueAtTime(0.42*v,t+d); g.gain.exponentialRampToValueAtTime(0.06*v,t+d+0.009) }); g.gain.exponentialRampToValueAtTime(0.0001,t+0.16);
   x.connect(f); f.connect(g); fin(x,t,0.18) }
  function snare(t,v,fq,dec,tone){ var x=nsrc(), f=flt('bandpass',fq||2200,0.7), g=G(), o=osc('triangle',tone||196), og=G(); dec=dec||0.09;
   env(g,t,0.32*v,0.002,dec); env(og,t,0.18*v,0.002,0.06); x.connect(f); f.connect(g); o.connect(og); fin(x,t,dec+0.03); fin(o,t,0.1) }
  function gsnare(t,v){ var x=nsrc(), f=flt('bandpass',1500,0.5), g=G(), o=osc('triangle',180), og=G();   /* the big 80s snare: held, then cut (a gate, not a reverb) */
   g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.34*v,t+0.002); g.gain.linearRampToValueAtTime(0.2*v,t+0.17); g.gain.linearRampToValueAtTime(0.0001,t+0.19);
   env(og,t,0.2*v,0.002,0.07); x.connect(f); f.connect(g); o.connect(og); fin(x,t,0.2); fin(o,t,0.1) }
  function hat(t,v,open,hp){ var x=nsrc(), f=flt('highpass',hp||7500), g=G(); env(g,t,0.16*v,0.001,open?0.16:0.035); x.connect(f); f.connect(g); fin(x,t,open?0.2:0.06) }
  function shaker(t,v){ var x=nsrc(), f=flt('bandpass',6200,1.2), g=G(); env(g,t,0.14*v,0.006,0.045); x.connect(f); f.connect(g); fin(x,t,0.07) }
  function rim(t,fq,v,dec){ var o=osc('triangle',fq), g=G(); env(g,t,0.2*v,0.001,dec||0.035); o.connect(g); fin(o,t,(dec||0.035)+0.02) }
  function tom(t,m,v,dec){ var o=osc('sine',mtof(m)), g=G(); o.frequency.setValueAtTime(mtof(m)*1.6,t); o.frequency.exponentialRampToValueAtTime(mtof(m),t+0.07); env(g,t,0.55*v,0.002,dec||0.18); o.connect(g); fin(o,t,(dec||0.18)+0.03) }
  function bell(t,fq,v){ var o=osc('square',fq), f=flt('bandpass',fq*1.5,6), g=G(); env(g,t,0.16*v,0.001,0.09); o.connect(f); f.connect(g); fin(o,t,0.11) }
  function crash(t,v,len){ var x=nsrc(), f=flt('highpass',3500), g=G(); env(g,t,v,0.002,len); x.connect(f); f.connect(g); fin(x,t,len+0.02) }
  function bassSaw(t,m,v,cut,len){ var o=osc('sawtooth',mtof(m)), o2=osc('square',mtof(m)/2), f=flt('lowpass',cut,3), g=G(), g2=ctx.createGain(); g2.gain.value=0.5;
   env(g,t,0.2*v,0.004,len); o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); fin(o,t,len+0.05); fin(o2,t,len+0.05) }
  function bassTri(t,m,v,len){ var o=osc('triangle',mtof(m)), g=G(); env(g,t,0.42*v,0.006,len); o.connect(g); fin(o,t,len+0.04) }
  function slap(t,m,v,len,pop){ var o=osc('square',mtof(m)), f=flt('lowpass',pop?4200:2200,pop?6:4), g=G(); f.frequency.setValueAtTime(pop?4200:2200,t); f.frequency.exponentialRampToValueAtTime(380,t+(pop?0.09:0.14));
   env(g,t,(pop?0.15:0.2)*v,0.002,len); o.connect(f); f.connect(g); fin(o,t,len+0.04) }
  function reese(t,m,v,c0,c1,len){ var f=flt('lowpass',c0,2.5), g=G(); f.frequency.setValueAtTime(c0,t); f.frequency.linearRampToValueAtTime(c1,t+len);
   g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.17*v,t+0.01); g.gain.setValueAtTime(0.17*v,t+len*0.8); g.gain.exponentialRampToValueAtTime(0.0001,t+len); f.connect(g);
   [-14,14].forEach(function(d){ var o=osc('sawtooth',mtof(m)); o.detune.value=d; o.connect(f); fin(o,t,len+0.02) }) }
  function k808(t,m,v,len,to,toAt,dest){ var o=osc('sine',mtof(m)), g=G(dest); o.frequency.setValueAtTime(mtof(m)*2.4,t); o.frequency.exponentialRampToValueAtTime(mtof(m),t+0.035);
   if(to!=null){ o.frequency.setValueAtTime(mtof(m),toAt); o.frequency.exponentialRampToValueAtTime(mtof(to),toAt+0.09) }
   g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.7*v,t+0.003); g.gain.exponentialRampToValueAtTime(0.35*v,t+len*0.75); g.gain.exponentialRampToValueAtTime(0.0001,t+len); o.connect(g); fin(o,t,len+0.02) }
  function pluck(t,m,v,cut,type,dec){ var o=osc(type||'square',mtof(m)), f=flt('lowpass',cut,5), g=G(); f.frequency.setValueAtTime(cut,t); f.frequency.exponentialRampToValueAtTime(Math.max(300,cut*0.35),t+0.1);
   env(g,t,0.075*v,0.003,dec||0.11); o.connect(f); f.connect(g); fin(o,t,(dec||0.11)+0.04) }
  function chord(t,ms_,type,v,cut,a,len,det,dest){ var f=flt('lowpass',cut,1.2), g=G(dest); env(g,t,v,a,len); f.connect(g);   /* one filter + one envelope per chord; det = detuned pair */
   ms_.forEach(function(m){ (det?[-det,det]:[0]).forEach(function(dt){ var o=osc(type,mtof(m)); if(dt) o.detune.value=dt; o.connect(f); fin(o,t,a+len+0.03) }) }); return f }
  function stab(t,ms_,v,cut,len){ chord(t,ms_,'sawtooth',0.05*v,cut,0.004,len,7) }
  function ep(t,ms_,v,len){ var g=G(); env(g,t,0.06*v,0.004,len); ms_.forEach(function(m){ var o=osc('sine',mtof(m)); o.connect(g); fin(o,t,len+0.03) });
   var b=osc('triangle',mtof(ms_[ms_.length-1]+12)), bg=G(); env(bg,t,0.02*v,0.002,0.12); b.connect(bg); fin(b,t,0.15) }
  function clav(t,ms_,v){ var f=flt('bandpass',1300,1.6), h=flt('highpass',500), g=G(); f.frequency.setValueAtTime(2600,t); f.frequency.exponentialRampToValueAtTime(900,t+0.06); env(g,t,0.16*v,0.001,0.075);
   f.connect(h); h.connect(g); ms_.forEach(function(m){ var o=osc('square',mtof(m)); o.connect(f); fin(o,t,0.1) }) }
  function pad(t,ms_,v,len,cut,att,dest){ var f=flt('lowpass',cut,0.8), g=G(dest); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(v,t+att); g.gain.setValueAtTime(v,t+Math.max(att,len-0.08)); g.gain.exponentialRampToValueAtTime(0.0001,t+len);
   f.connect(g); ms_.forEach(function(m){ var o=osc('sawtooth',mtof(m)); o.connect(f); fin(o,t,len+0.02) }); return f }
  function lead(t,m,v,len,type,cut,det,from){ var f=flt('lowpass',cut,2), g=G(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(v,t+0.012); g.gain.setValueAtTime(v,t+len*0.7); g.gain.exponentialRampToValueAtTime(0.0001,t+len);
   f.connect(g); (det?[-det,det]:[0]).forEach(function(d){ var o=osc(type,mtof(m)); if(from!=null){ o.frequency.setValueAtTime(mtof(from),t); o.frequency.exponentialRampToValueAtTime(mtof(m),t+0.06) } if(d) o.detune.value=d; o.connect(f); fin(o,t,len+0.02) }) }
  function vbell(t,m,v,dec){ var o=osc('sine',mtof(m)), o2=osc('sine',mtof(m)*3.01), g=G(), g2=G(); env(g,t,0.1*v,0.002,dec); env(g2,t,0.035*v,0.001,dec*0.3); o.connect(g); o2.connect(g2); fin(o,t,dec+0.03); fin(o2,t,dec*0.3+0.03) }
  function brass(t,ms_,v,len,c0,c1){ var f=chord(t,ms_,'sawtooth',v,c0,0.05,len,6); f.frequency.setValueAtTime(c0,t); f.frequency.exponentialRampToValueAtTime(c1,t+Math.min(len,0.25)) }
  function whistle(t,v,len,fq){ var o=osc('sine',fq), g=G(); for(var x=0;x<len;x+=0.03) o.frequency.setValueAtTime(fq*(Math.round(x/0.03)%2?1.06:1),t+x); env(g,t,0.06*v,0.008,len); o.connect(g); fin(o,t,len+0.03) }
  function riser(a,b,v,pitch){ var x=nsrc(), f=flt('bandpass',350,2.2), g=G(); f.frequency.setValueAtTime(350,a); f.frequency.exponentialRampToValueAtTime(7500,b);
   g.gain.setValueAtTime(0.0001,a); g.gain.exponentialRampToValueAtTime(0.3*v,b-0.01); g.gain.linearRampToValueAtTime(0.0001,b); x.connect(f); f.connect(g); x.start(a); x.stop(b+0.01); src.push(x);
   if(pitch){ var o=osc('sawtooth',110), pf=flt('lowpass',3000), pg=G(); o.frequency.setValueAtTime(mtof(45+key),a); o.frequency.exponentialRampToValueAtTime(mtof(81+key),b);
    pg.gain.setValueAtTime(0.0001,a); pg.gain.exponentialRampToValueAtTime(0.05*v,b-0.01); pg.gain.linearRampToValueAtTime(0.0001,b); o.connect(pf); pf.connect(pg); o.start(a); o.stop(b+0.01); src.push(o) } }

  /* ---------- harmony ---------- */
  function chordAt(k){ var bar=Math.ceil(-k/16), pos=((k%16)+16)%16, e=S.prog[3-((bar-1)%4)]; if(Array.isArray(e[0])) e=pos<8?e[0]:e[1]; return {r:e[0], q:QU[e[1]]} }
  function rootIn(r,lo){ var m=key+r; while(m<lo) m+=12; while(m>=lo+12) m-=12; return m }   /* the root inside [lo, lo+12) */
  function voice(c,lo){ var m=rootIn(c.r,lo); return c.q.map(function(x){ return m+x }) }
  var HC={r:S.hitq[0], q:QU[S.hitq[1]]};
  function tone(c,i,lo){ var v=voice(c,lo); return v[i%v.length]+12*Math.floor(i/v.length) }

  /* ---------- the songs: step(k,t,pos,bar,p,e,c) runs once per 16th; fill() and hit() land the ending ---------- */
  var D=[lofi,funk,rock,house,trap,dnb,synthwave,samba,epic][s.song]();
  function lofi(){ var M=motif([[2,12,2],[4,9,2],[7,7,1],[8,9,5],[18,7,2],[20,4,2],[22,2,3],[26,0,4]]), base=72+key-12;
   var vin=nsrc(), vf=flt('highpass',2500), vg=G(); vg.gain.value=0.012+0.006*I; vin.connect(vf); vf.connect(vg); vin.start(t0); vin.stop(hit); src.push(vin);   /* vinyl hiss */
   return { step:function(k,t,pos,bar,p,e,c){ var q=((k%32)+32)%32, fillBar=bar===1;
    if((pos===0||pos===7||(pos===10&&has(0.3)))&&!(fillBar&&pos===10)) kick(t,0.85*e,120,45,0.3);
    if(pos===4||pos===12) snare(t,0.75+0.25*e,1700,0.14,180); else if(has(0.8)&&(pos===15||pos===9)) snare(t,0.18,1700,0.05,180);
    if(fillBar&&lvl>=2&&(pos===13||pos===14)) snare(t,0.4+0.15*(pos-12),1800,0.08,190);
    if(pos%2===0) hat(t,(pos%4===0?0.7:0.45)*e,false,6000); else if(has(0.6)) hat(t,0.22*e,false,6000);
    if(pos===14&&has(0.5)) rim(t,1800,0.6*e);
    if(pos===0||(pos===6&&has(0.25))) ep(t,voice(c,57).slice(0,4),e*(pos===0?1:0.7),pos===0?st*5.5:st*3);
    if(pos===0||pos===10) bassTri(t,rootIn(c.r,36),e,st*(pos===0?5:3)); else if(pos===14&&has(0.4)) bassTri(t,rootIn(c.r,36)+7,0.7*e,st*1.5);
    var m=M[q]; if(m&&has(0.55)) vbell(t,base+m[1],e,0.5+m[2]*st*0.5) },
    fill:function(){ riser(hit-Math.min(12*st,0.6*A),hit,0.6+0.4*I,lvl>=4); bus.gain.linearRampToValueAtTime(1.2*S.trim,hit-st) }   /* lo-fi lays back, so its last bar leans in harder */,
    hit:function(){ kick(hit,1.1,120,45,TAIL); crash(hit,0.22,TAIL); ep(hit,voice(HC,53),1.4,TAIL); stab(hit,voice(HC,60).slice(0,4),0.8,2600,TAIL); bassTri(hit,rootIn(0,36),1.2,TAIL) } } }
  function funk(){ var M=motif([[3,7,1],[6,10,1],[10,12,2],[14,10,1],[19,12,1],[22,12,1],[26,14,2],[29,17,1]]), base=72+key-12, BL={0:[0,0,2],3:[12,1,1],6:[0,0,1],7:[0,2,1],10:[10,0,1],11:[12,1,1],14:[7,0,1]};
   return { step:function(k,t,pos,bar,p,e,c){ var q=((k%32)+32)%32, fillBar=bar===1;
    if(pos===0||pos===10||(pos===7&&has(0.3))) kick(t,0.9*e,150,46,0.2);
    if(pos===4||pos===12) snare(t,0.9*e,2400,0.1,210); else if(has(0.5)&&(pos===7||pos===9||pos===15)) snare(t,0.14,2600,0.04,220);
    if(fillBar&&lvl>=2&&pos>=8&&pos%2===0) tom(t,[57,55,52,48][(pos-8)/2|0]+key%5,0.8*e,0.14);
    if(has(0.2)) hat(t,(pos%2===0?0.7:0.35)*e,pos===14&&has(0.85)&&!fillBar,8500); else if(pos%2===0) hat(t,0.6*e,false,8500);
    var b=BL[pos]; if(b&&has(0.12)){ var r=rootIn(c.r,38); if(b[1]===2) rim(t,320,0.5*e,0.02); else slap(t,r+b[0],e,st*b[2]*1.2,b[1]===1) }
    if([0,2,3,6,8,10,11,14].indexOf(pos)>=0&&!(pos===0&&!has(0.4))){ var v=voice(c,62); clav(t,pos%4===3?[v[1],v[2]]:[v[0],v[2]],e) }
    if(has(0.6)&&(pos===6||pos===14)) brass(t,voice(c,62).slice(1,4),0.035*e,0.14,1200,2600);
    var m=M[q]; if(m&&has(0.9)) lead(t,base+m[1],0.045*e,st*m[2]*1.3,'sawtooth',2400,8) },
    fill:function(){ riser(hit-Math.min(8*st,0.6*A),hit,0.4+0.4*I,lvl>=4) },
    hit:function(){ kick(hit,1.15); crash(hit,0.3,TAIL); brass(hit,voice(HC,55),0.05,TAIL,1500,4500); clav(hit,voice(HC,64).slice(1,4),1.2); slap(hit,rootIn(0,38),1.2,TAIL,false) } } }
  function rock(){ var M=motif([[0,16,4],[4,19,4],[8,16,4],[12,12,4],[16,13,4],[20,16,4],[24,15,4],[28,18,4]]), base=72+key-12, gtr=shaper(30,0.11,3800);
   return { step:function(k,t,pos,bar,p,e,c){ var q=((k%32)+32)%32, fillBar=bar===1&&lvl>=2, punk=has(0.65);
    if(fillBar&&pos>=8){ if(pos%2===0||lvl>=4) tom(t,[60,57,55,52,50,48,45,43][pos-8]+key%3,0.9*e,0.12); if(pos===8) kick(t,e) }
    else if(punk){ if(pos%4===0) kick(t,0.95*e,170,50,0.18); if(pos%4===2) snare(t,0.8*e,2500,0.08,220); if(pos%2===0) hat(t,(pos%4===0?0.9:0.5)*e,pos%8===0,5200) }
    else { if(pos===0||pos===6||pos===8||(pos===10&&has(0.35))) kick(t,0.9*e,170,50,0.2); if(pos===4||pos===12) snare(t,0.85*e,2400,0.1,210); if(pos%2===0) hat(t,0.6*e,false,7000) }
    if(pos%2===0&&has(0.05)){ var r=rootIn(c.r,40), open=has(0.75)&&pos%8===0; var g=G(gtr); env(g,t,0.5*e,0.003,open?st*3.5:st*0.9);
     [r,r+7,r+12].forEach(function(m){ var o=osc('sawtooth',mtof(m)); o.connect(g); fin(o,t,(open?st*3.5:st*0.9)+0.03) }) }
    if(pos%2===0&&has(0.15)) bassSaw(t,rootIn(c.r,28)+12,0.8*e,500+900*I,st*1.6);
    var m=M[q]; if(m&&has(1.0)) lead(t,base+m[1],0.04*e,st*m[2]*0.95,'square',2600,10) },
    fill:function(){ riser(hit-Math.min(8*st,0.5*A),hit,0.3+0.3*I,false) },
    hit:function(){ kick(hit,1.2,170,50); crash(hit,0.36,TAIL); var r=rootIn(0,40), g=G(gtr); env(g,hit,0.7,0.003,TAIL); [r,r+7,r+12,r+19].forEach(function(m){ var o=osc('sawtooth',mtof(m)); o.connect(g); fin(o,hit,TAIL+0.02) });
     bassSaw(hit,rootIn(0,28)+12,1.1,1400,TAIL); snare(hit,0.6,2400,0.15,210) } } }
  function house(){ var M=motif([[2,12,2],[6,10,2],[10,7,2],[14,10,2],[18,12,2],[22,15,2],[26,14,2],[30,14,2]]), base=72+key-12, duck=persist(G()); duck.gain.value=1;
   return { step:function(k,t,pos,bar,p,e,c){ var q=((k%32)+32)%32, inRoll=bar<=(lvl>=4?2:1)&&lvl>=2;
    if(pos%4===0){ if(!(lvl===1&&p<0.4)) kick(t,0.8+0.2*e); duck.gain.setValueAtTime(0.25,t); duck.gain.linearRampToValueAtTime(1,t+beat*0.6) }
    if(inRoll){ var every=bar===2?(pos<8?4:2):(pos<8&&lvl<4?2:1); if(pos%every===0) snare(t,0.3+0.7*Math.pow((k+16*(lvl>=4?2:1))/(16*(lvl>=4?2:1)),1.5)) }
    else if((pos===4||pos===12)&&has(0.3)) clap(t,e);
    if(pos%4===2) hat(t,0.8*e,has(0.4),8000); if(has(0.55)&&pos%4!==2) shaker(t,(pos%2?0.5:0.8)*e);
    if(pos%4===2&&has(0.15)) bassSaw(t,rootIn(c.r,33)+12,e,300+1500*p*(0.6+0.4*I),st*1.5);
    if(pos===0&&has(0.1)) pad(t,voice(c,57).slice(0,4),0.05*e,beat*4,600+2500*p*(0.5+0.5*I),beat*0.5,duck);
    if((pos===3||pos===6||pos===10)&&has(0.45)) chord(t,voice(c,60).slice(0,4),'square',0.03*e,1400+2400*p,0.003,0.12,0);
    var m=M[q]; if(m&&has(0.85)) lead(t,base+m[1],0.04*e,st*m[2]*0.9,'square',3000,0) },
    fill:function(){ riser(hit-Math.min((lvl>=4?2:1)*16*st,0.65*A),hit,0.5+0.5*I,lvl>=4) },
    hit:function(){ kick(hit,1.15); crash(hit,0.32,TAIL); stab(hit,voice(HC,48),1.3,5000,TAIL); bassSaw(hit,rootIn(0,36),1.1,1200,TAIL) } } }
  function trap(){ var M=motif([[0,12,2],[3,15,2],[6,19,2],[10,15,2],[12,12,2],[14,7,2],[16,8,3],[19,12,3],[22,15,2],[24,14,6]]), base=72+key, sat=shaper(4,0.2,6000), BL={0:6,7:3,10:4,14:2};
   return { step:function(k,t,pos,bar,p,e,c){ var q=((k%32)+32)%32, lastBeat=bar===1&&pos>=12;
    var bl=BL[pos]; if(bl&&has(0.12)&&!(bar===1&&pos===14)){ var r=rootIn(c.r,36), slide=pos===10&&bar%2===0; k808(t,r,e,st*bl,slide?r+12:null,t+st*2.5,sat) }
    if(pos===0&&!has(0.12)) kick(t,0.8*e);
    if(pos===8&&has(0.2)){ clap(t,e); snare(t,0.6*e,2000,0.12,190) }
    var roll=bar%2===0?(pos===12||pos===13?2:0):(pos===6||pos===7?3:0);
    if(lastBeat&&lvl>=2){ var nn=pos===14?4:pos===13?3:2; for(var i=0;i<nn;i++) hat(t+i*st/nn,(0.35+0.5*(pos-12)/3+0.1*i/nn)*e,false,8000) }
    else if(roll&&has(0.4)){ for(var j=0;j<roll;j++) hat(t+j*st/roll,(0.45+0.15*j)*e,false,8000) }
    else if(pos%2===0) hat(t,(pos%4===0?0.75:0.5)*e,pos===14&&has(0.7),8000);
    if(pos===0&&has(0.6)) pad(t,voice(c,53).slice(0,3),0.03*e,beat*4,700+600*I,beat,null);
    var m=M[q]; if(m&&has(0.3)) vbell(t,base+m[1],0.9*e,0.25+m[2]*st*0.4) },
    fill:function(){ riser(hit-Math.min(8*st,0.5*A),hit,0.2+0.3*I,false); k808(hit-4*st,rootIn(HC.r,36)-5,0.5,4*st-0.01,rootIn(HC.r,36),hit-st*2,sat) },
    hit:function(){ k808(hit,rootIn(0,36),1.3,TAIL,null,0,sat); kick(hit,1.1,150,45); clap(hit,1.2); crash(hit,0.28,TAIL); voice(HC,72).forEach(function(m){ vbell(hit,m,1.2,TAIL) }); stab(hit,voice(HC,60),0.9,3000,TAIL) } } }
  function dnb(){ var M=motif([[0,7,3],[3,10,3],[6,7,2],[8,3,3],[11,2,3],[16,3,3],[19,7,3],[22,8,2],[24,5,3],[27,10,4]]), base=72+key;
   return { step:function(k,t,pos,bar,p,e,c){ var q=((k%32)+32)%32, alt=bar%2===0, fillBar=bar===1&&lvl>=2;
    if(fillBar&&pos>=8){ snare(t,(0.35+0.55*(pos-8)/6)*e,2000+250*(pos-8),0.07,220+20*(pos-8)); if(pos===8) kick(t,e,170,50,0.18) }
    else { if(pos===0||pos===10||(alt&&pos===2&&has(0.4))) kick(t,0.95*e,170,50,0.18);
     if(pos===4||pos===12) snare(t,0.95*e,2300,0.1,230); else if(has(0.5)&&(pos===7||pos===15||(alt&&pos===9))) snare(t,0.16,2600,0.035,240) }
    if(pos%2===0) hat(t,(pos%4===2?0.8:0.5)*e,pos===6&&has(0.8),9000); else if(has(0.75)) hat(t,0.25*e,false,9500);
    if((pos===0||pos===8)&&has(0.12)){ var r=rootIn(c.r,31); reese(t,r+12,e,250+400*I,700+2200*p*(0.5+0.5*I),st*7.6) }
    if(pos===0&&has(0.25)) chord(t,voice(c,60).slice(0,3),'triangle',0.035*e,2000,beat,beat*3,0);
    if((pos===3||pos===6)&&has(0.6)) stab(t,voice(c,62).slice(0,3),0.9*e,2200+2400*p,0.1);
    var m=M[q]; if(m&&has(0.95)) lead(t,base+m[1],0.035*e,st*m[2]*0.9,'square',3200,6) },
    fill:function(){ riser(hit-Math.min(16*st,0.6*A),hit,0.45+0.5*I,lvl>=3) },
    hit:function(){ kick(hit,1.2,170,50); crash(hit,0.34,TAIL); snare(hit,0.7,2300,0.15,230); stab(hit,voice(HC,55),1.3,4500,TAIL); reese(hit,rootIn(0,31)+12,1.2,1800,600,TAIL) } } }
  function synthwave(){ var M=motif([[0,15,6],[6,12,2],[8,10,4],[12,12,4],[16,17,6],[22,15,2],[24,17,4],[28,19,4]]), base=72+key;
   return { step:function(k,t,pos,bar,p,e,c){ var q=((k%32)+32)%32, fillBar=bar===1&&lvl>=2;
    if(fillBar&&pos>=8){ if(pos%2===0) tom(t,[55,52,48,45][(pos-8)/2|0]+key,e,0.2); if(pos===8) kick(t,e,140,44,0.3) }
    else { if(pos===0||pos===8||(pos===6&&has(0.5))) kick(t,0.95*e,140,44,0.3); if(pos===4||pos===12) gsnare(t,0.8+0.2*e) }
    if(has(0.2)||pos%2===0) hat(t,(pos%2===0?0.55:0.3)*e,false,9000);
    if(pos%2===0&&has(0.05)){ var r=rootIn(c.r,33)+(pos%4===2?12:0); bassSaw(t,r+12,0.95*e,400+1600*p*(0.5+0.5*I),st*1.7) }
    if(has(0.3)){ var PAT=[0,1,2,3,4,3,2,1]; pluck(t,tone(c,PAT[pos%8],62),0.9*e,1200+3800*p*(0.5+0.5*I),'square',0.12) }
    if(pos===0&&has(0.45)) pad(t,voice(c,55),0.035*e,beat*4,900+1600*I,beat*0.7,null);
    var m=M[q]; if(m&&has(0.7)) lead(t,base+m[1],0.04*e,st*m[2]*0.95,'sawtooth',2800,12) },
    fill:function(){ riser(hit-Math.min(8*st,0.6*A),hit,0.35+0.4*I,lvl>=4) },
    hit:function(){ kick(hit,1.15,140,44); gsnare(hit,1.1); crash(hit,0.26,TAIL); stab(hit,voice(HC,55),1.3,4000,TAIL); bassSaw(hit,rootIn(0,33)+12,1.1,1500,TAIL); lead(hit,base+12+7,0.05,TAIL,'sawtooth',3000,12) } } }
  function samba(){ var M=motif([[2,12,1],[3,16,2],[6,14,2],[8,12,3],[11,9,2],[14,7,2],[18,16,3],[21,19,3],[24,21,3],[27,19,2],[30,23,2]]), base=72+key-12,
    TAM=[0,2,3,5,6,8,10,11,13,14], AGO={0:1,3:0,6:1,8:1,10:0,12:1,14:0}, CAV=[0,3,6,8,11,14];
   return { step:function(k,t,pos,bar,p,e,c){ var q=((k%32)+32)%32, fillBar=bar===1&&lvl>=2;
    if(pos===4||pos===12) tom(t,40+key%5,(0.85+0.15*e),0.3); else if(pos===0||pos===8) tom(t,45+key%5,0.45*e,0.16);
    if(pos===0||pos===8) kick(t,0.5*e,110,50,0.15);
    if(fillBar&&pos>=8){ rim(t,pos%2?700:900,(0.5+0.5*(pos-8)/6)*e,0.05); if(pos%2===0) snare(t,(0.4+0.4*(pos-8)/6)*e,2600,0.06,240) }
    else { if(has(0.3)) snare(t,(pos%4===0?0.35:pos%4===3?0.28:0.12)*e,3000,0.04,260); if(has(0.5)&&TAM.indexOf(pos)>=0) rim(t,1250,(pos%4===0?0.7:0.45)*e,0.03) }
    shaker(t,(pos%4===2?0.8:0.45)*e);
    if(has(0.65)&&AGO[pos]!=null) bell(t,AGO[pos]?880:660,e);
    if(CAV.indexOf(pos)>=0&&has(0.15)) chord(t,voice(c,60).slice(0,4),'triangle',0.07*e,2600+1400*I,0.003,0.1,0);   /* cavaquinho chop */
    if(pos===0||pos===6||pos===8||pos===14){ var r=rootIn(c.r,36); bassTri(t,pos===6||(pos===14&&has(0.4))?r+7:r,e,st*(pos===14?1.5:2.5)) }
    var m=M[q]; if(m&&has(0.9)) lead(t,base+m[1],0.05*e,st*m[2]*0.9,'triangle',4000,0) },
    fill:function(){ riser(hit-Math.min(8*st,0.6*A),hit,0.3+0.3*I,false); if(A>2.2){ [7.5,6.5,5].forEach(function(b,i){ var tt=hit-b*st*2; if(tt>t0+0.1) whistle(tt,0.9,st*(i===2?3:1.2),2700) }) } },
    hit:function(){ tom(hit,40+key%5,1.2,TAIL); kick(hit,1.0,110,50); crash(hit,0.28,TAIL); voice(HC,60).forEach(function(m,i){ pluck(hit+i*0.005,m,1.2,4000,'triangle',TAIL) }); stab(hit,voice(HC,55),0.9,3200,TAIL); bassTri(hit,rootIn(0,36),1.3,TAIL) } } }
  function epic(){ var M=motif([[0,0,3],[3,7,1],[4,12,8],[12,15,4],[16,12,3],[19,15,1],[20,20,6],[26,14,2],[28,19,4]]), base=60+key;
   return { step:function(k,t,pos,bar,p,e,c){ var q=((k%32)+32)%32, fillBar=bar===1;
    if(fillBar&&pos>=4){ var nn=pos>=12?2:1; for(var i=0;i<nn;i++) tom(t+i*st/nn,rootIn(0,36),(0.4+0.6*(pos-4)/11)*e,0.12) }
    else { if(pos===0||pos===6||pos===10) { tom(t,rootIn(0,36),e,0.32); kick(t,0.8*e,120,40,0.3) } if(pos===4||pos===12) { tom(t,rootIn(0,36)+7,0.8*e,0.2); snare(t,0.6*e,1400,0.16,150) }
     if(has(0.5)&&(pos===14||pos===15)) tom(t,rootIn(0,36)+12,0.5*e,0.12) }
    if(has(0.1)){ var PAT=[0,2,1,2]; pluck(t,tone(c,PAT[pos%4],48),0.9*e,900+2600*p,'sawtooth',0.12) }   /* strings ostinato */
    if(pos===0) chord(t,voice(c,55),'triangle',0.035*e,1800,beat,beat*3.6,5);   /* choir */
    if(pos===0&&has(0.4)) brass(t,voice(c,48).slice(0,3),0.03*e,beat*3.5,500,1500+1500*p);
    if(pos%4===0) hat(t,0.4*e,false,9000);
    var m=M[q]; if(m&&has(0.6)) lead(t,base+m[1],0.045*e,st*m[2]*0.95,'sawtooth',1800+1400*p,7) },
    fill:function(){ riser(hit-Math.min(16*st,0.65*A),hit,1,true) },
    hit:function(){ tom(hit,rootIn(0,36),1.3,TAIL); kick(hit,1.2,120,40); crash(hit,0.36,TAIL); brass(hit,voice(HC,48).concat([rootIn(0,60)+12]),0.06,TAIL,2000,5000); stab(hit,voice(HC,60),1.2,5000,TAIL); bassSaw(hit,rootIn(0,36),1.1,1200,TAIL) } } }

  function steps(k0,k1){ for(var k=k0;k<k1;k++){
   if(k>=-1) continue;   /* one 16th of air before the hit (the riser carries it) */
   var t=hit+k*st+(k&1?sw:0), p=(k+n)/n, pos=((k%16)+16)%16, bar=Math.ceil(-k/16); P=p;
   D.step(k,t,pos,bar,p,0.55+0.45*p,chordAt(k)) } }
  /* notes go out in short batches (about 1 s ahead) so play() never blocks the splash animation; offline renders get them all at once */
  var kNext=-n;
  function pump(){ if(s.dead) return; var lim=ctx.currentTime+1.0, k1=kNext; while(k1<0&&hit+k1*st<lim) k1++;
   var k0=kNext; while(k0<k1&&hit+k0*st<ctx.currentTime+0.005&&!off) k0++;   /* a stalled tab skips notes that are already late */
   if(k0<k1) steps(k0,k1); kNext=k1; if(kNext<0) s.pump=setTimeout(pump,250) }
  if(off) steps(-n,0); else pump();
  P=1; D.fill(); D.hit();   /* the riser or fill into the hit, then the final hit: all inside the gate */
  s.hitCtx=hit; s.endCtx=end; s.t0=t0; s.lat=lat;
  s.hitAt=pn+(hit+CDLY-t0+lat)*1000; s.endsAt=pn+(end-t0+lat)*1000;
  if(!off) s.timer=setTimeout(function(){ free(s) },(end-t0+lat)*1000+150);
  return true }

 function free(s){ if(s.freed) return; s.freed=true; s.dead=true; clearTimeout(s.timer); clearTimeout(s.pump); s.src.forEach(function(x){ try{ x.stop() }catch(e){} try{ x.disconnect() }catch(e){} }); s.nodes.forEach(function(x){ try{ x.disconnect() }catch(e){} }); s.src.length=0; s.nodes.length=0; if(cur===s) cur=null }

 function stop(fadeMs){ var s=cur; if(!s) return; cur=null;
  if(s.pending){ s.cancel=true; s.endsAt=pnow(); return }
  var ctx=s.ctx, t=ctx.currentTime;
  if(t>=s.hitCtx-0.06) return;   /* the final hit is playing: its gate already closes at endsAt, and free() runs then */
  var f=Math.max(0,fadeMs==null?120:+fadeMs||0)/1000, te=t+f, g=s.gate.gain;
  try{ if(g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else { g.cancelScheduledValues(t); g.setValueAtTime(g.value,t) } }catch(e){ try{ g.cancelScheduledValues(t) }catch(e2){} }
  if(f>0) g.linearRampToValueAtTime(0,te); else g.setValueAtTime(0,t);
  s.dead=true; clearTimeout(s.pump); s.src.forEach(function(x){ try{ x.stop(te+0.01) }catch(e){} });
  s.endsAt=pnow()+(te-t+s.lat)*1000; s.hitAt=0; clearTimeout(s.timer);
  if(isOffline(ctx)) return; s.timer=setTimeout(function(){ free(s) },(te-t+s.lat)*1000+60) }

 function play(ms,opts){ opts=opts||{}; stop(60); if(opts.enabled===false) return false; ms=+ms; if(!(ms>=1500)) return false;
  var ctx=opts.ctx||ownCtx(); if(!ctx) return false;
  var s={ctx:ctx,src:[],nodes:[],lat:0,endsAt:pnow()+ms+400,hitAt:0,song:pick(opts)}; cur=last=s;
  try{
   if(!isOffline(ctx)&&ctx.state!=='running'){   /* locked or suspended context: start once it runs, on the same deadline */
    s.pending=true; var t0=pnow(); ctx.resume().then(function(){ if(s.cancel||cur!==s) return; s.pending=false; var left=ms-(pnow()-t0); if(!(left>=1500&&build(s,left,opts))){ cur=null; s.endsAt=pnow() } }).catch(function(){ if(cur===s){ cur=null; s.endsAt=pnow() } });
    return true }
   if(!build(s,ms,opts)){ cur=null; s.endsAt=pnow(); free(s); return false } return true
  }catch(e){ try{ free(s) }catch(e2){} cur=null; s.endsAt=pnow(); return false } }

 var api={ play:play, stop:stop, isPlaying:function(){ return !!last&&pnow()<last.endsAt }, songs:SONGS.map(function(x){ return x.id }) };
 Object.defineProperty(api,'endsAt',{get:function(){ return last?last.endsAt:0 }});
 Object.defineProperty(api,'hitAt',{get:function(){ return last?last.hitAt:0 }});
 Object.defineProperty(api,'song',{get:function(){ return last?SONGS[last.song].id:'' }});
 Object.defineProperty(api,'_cur',{get:function(){ return cur }});   /* test hook */
 try{ document.addEventListener('visibilitychange',function(){ if(document.hidden) stop(60) }) }catch(e){}
 window.chmaHype=api;
})();
