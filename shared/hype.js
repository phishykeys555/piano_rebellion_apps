/* CHMA hype music for round screens: original "get pumped" music synthesized live in Web Audio (no samples, no borrowed riffs).
   window.chmaHype = { play(ms, opts), stop(fadeMs), isPlaying(), endsAt, hitAt }
   play(ms, opts)  music builds for ms milliseconds and lands a final hit exactly at ms (when the round starts).
     opts.ctx      the app's AudioContext (reuse it: iOS unlocks a context on a tap). Without it the module makes its own.
     opts.round    1-5 (1 = calm build, higher = more layers, higher key)   opts.bonus  true for the bonus round (biggest)
     opts.enabled  false = do nothing (the app's music switch)
     opts.micSafe  true = the final hit lands early enough that every sound, tails included, is silent AT ms (mic modes).
   stop(fadeMs)    fades out (default 120 ms) and frees every node. Called on or after the final hit, it lets the hit's
                   short, gated tail finish (it is already scheduled to end by endsAt). Calling play() again stops the old music first.
   isPlaying()     true from play() until endsAt (including a pending iOS resume).
   endsAt          performance.now() time (ms) when the last sample is out of the speaker (output latency included); 0 if never played.
                   Mic modes: ignore mic input while isPlaying() and until endsAt + 150.
   hitAt           performance.now() time (ms) of the final hit as heard.
   No reverb or delay lines: the only tails are the notes' own envelopes, and a hard gate closes the bus at the end. */
(function(){
 'use strict';
 var cur=null, last=null, own=null, noiseBufs=typeof WeakMap==='function'?new WeakMap():null;
 var TAIL=0.22, LEVEL=0.18, CDLY=0.006;   /* LEVEL sets the -16 dBFS-ish peak after the compressor (checked by offline render); CDLY = the compressor's look-ahead delay */
 var SCALE=[0,2,4,5,7,9,11];
 function pnow(){ return (window.performance&&performance.now)?performance.now():Date.now() }
 function isOffline(ctx){ return typeof ctx.startRendering==='function' }
 function ownCtx(){ try{ if(!own){ var C=window.AudioContext||window.webkitAudioContext; if(!C) return null; own=new C() } return own }catch(e){ return null } }
 function noise(ctx){ var b=noiseBufs&&noiseBufs.get(ctx); if(b) return b; var n=Math.floor(ctx.sampleRate*2); b=ctx.createBuffer(1,n,ctx.sampleRate); var d=b.getChannelData(0), s=12345;
   for(var i=0;i<n;i++){ s=(s*1103515245+12345)&0x7fffffff; d[i]=s/0x3fffffff-1 } if(noiseBufs) noiseBufs.set(ctx,b); return b }
 function triad(deg){ var o=[]; for(var j=0;j<3;j++){ var i=deg+2*j; o.push(SCALE[i%7]+12*Math.floor(i/7)) } return o }

 function build(s,ms,opts){
  var ctx=s.ctx, off=isOffline(ctx), t0=ctx.currentTime, lat=off?0:Math.min(0.25,Math.max(0,ctx.outputLatency||ctx.baseLatency||0));
  /* T = ctx time heard at ms. Default: the hit is heard at ms (scheduled CDLY early for the compressor). micSafe: the gate closes so the last sample is heard at ms. */
  var T=t0+ms/1000-lat, hit=opts.micSafe?T-TAIL-CDLY:T-CDLY, end=hit+TAIL+CDLY;
  var A=hit-(t0+0.06); if(A<1) return false;
  var lvl=opts.bonus?6:Math.max(1,Math.min(5,(opts.round|0)||1)), I=[0,.3,.5,.62,.75,.88,1][lvl], key=[0,0,2,3,5,7,8][lvl];
  /* tempo 120-128 BPM; whole bars when they fit, otherwise whole beats counted back from the hit */
  var bpm=124, best=9; for(var N=1;N<=8;N++){ var b=240*N/A; if(b>=120&&b<=128&&Math.abs(b-124)<best){ best=Math.abs(b-124); bpm=b } }
  var beat=60/bpm, st=beat/4, n=Math.floor(A/beat+1e-6)*4;
  var src=s.src;
  /* buses: drums + music -> compressor -> level -> gate -> out */
  var comp=ctx.createDynamicsCompressor(); comp.threshold.value=-14; comp.knee.value=8; comp.ratio.value=4; comp.attack.value=0.002; comp.release.value=0.12;
  var lev=ctx.createGain(); lev.gain.value=LEVEL; var gate=ctx.createGain(); gate.gain.setValueAtTime(1,t0); gate.gain.setValueAtTime(1,end-0.06); gate.gain.linearRampToValueAtTime(0,end);
  comp.connect(lev); lev.connect(gate); gate.connect(ctx.destination); s.gate=gate; s.nodes.push(comp,lev,gate);
  var bus=ctx.createGain(); bus.connect(comp);   /* the build: the whole mix swells into the hit */
  bus.gain.setValueAtTime(0.3+0.2*I,t0); bus.gain.linearRampToValueAtTime(0.85,hit-st*2); bus.gain.setValueAtTime(1,hit); s.nodes.push(bus);
  var NB=noise(ctx);
  function env(g,t,pk,a,d){ g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002,pk),t+a); g.gain.exponentialRampToValueAtTime(0.0001,t+a+d) }
  function fin(x,t,len){ x.start(t); x.stop(Math.min(t+len,end)+0.01); src.push(x) }
  function osc(type,f){ var o=ctx.createOscillator(); o.type=type; o.frequency.value=f; return o }
  function nsrc(){ var b=ctx.createBufferSource(); b.buffer=NB; b.loop=true; b.loopStart=Math.random()*1.5; return b }
  function mtof(m){ return 440*Math.pow(2,(m-69)/12) }
  function kick(t,v){ var o=osc('sine',150), g=ctx.createGain(); o.frequency.setValueAtTime(160,t); o.frequency.exponentialRampToValueAtTime(48,t+0.11); env(g,t,0.9*v,0.003,0.24); o.connect(g); g.connect(bus); fin(o,t,0.3) }
  function clap(t,v){ var x=nsrc(), f=ctx.createBiquadFilter(), g=ctx.createGain(); f.type='bandpass'; f.frequency.value=1600; f.Q.value=0.9;
   g.gain.setValueAtTime(0.0001,t); [0,0.011,0.022].forEach(function(d){ g.gain.setValueAtTime(0.42*v,t+d); g.gain.exponentialRampToValueAtTime(0.06*v,t+d+0.009) }); g.gain.exponentialRampToValueAtTime(0.0001,t+0.16);
   x.connect(f); f.connect(g); g.connect(bus); fin(x,t,0.18) }
  function snare(t,v){ var x=nsrc(), f=ctx.createBiquadFilter(), g=ctx.createGain(), o=osc('triangle',196), og=ctx.createGain(); f.type='bandpass'; f.frequency.value=2200; f.Q.value=0.7;
   env(g,t,0.32*v,0.002,0.09); env(og,t,0.18*v,0.002,0.06); x.connect(f); f.connect(g); g.connect(bus); o.connect(og); og.connect(bus); fin(x,t,0.12); fin(o,t,0.1) }
  function hat(t,v,open){ var x=nsrc(), f=ctx.createBiquadFilter(), g=ctx.createGain(); f.type='highpass'; f.frequency.value=7500; env(g,t,0.16*v,0.001,open?0.16:0.035); x.connect(f); f.connect(g); g.connect(bus); fin(x,t,open?0.2:0.06) }
  function bass(t,m,v,cut,len){ var o=osc('sawtooth',mtof(m)), o2=osc('square',mtof(m)/2), f=ctx.createBiquadFilter(), g=ctx.createGain(); f.type='lowpass'; f.frequency.value=cut; f.Q.value=3;
   env(g,t,0.2*v,0.004,len); var g2=ctx.createGain(); g2.gain.value=0.5; o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(bus); fin(o,t,len+0.05); fin(o2,t,len+0.05) }
  function pluck(t,m,v,cut){ var o=osc('square',mtof(m)), f=ctx.createBiquadFilter(), g=ctx.createGain(); f.type='lowpass'; f.frequency.setValueAtTime(cut,t); f.frequency.exponentialRampToValueAtTime(Math.max(300,cut*0.35),t+0.1); f.Q.value=5;
   env(g,t,0.075*v,0.003,0.11); o.connect(f); f.connect(g); g.connect(bus); fin(o,t,0.15) }
  function stab(t,ms_,v,cut,len){ var f=ctx.createBiquadFilter(), g=ctx.createGain(); f.type='lowpass'; f.frequency.value=cut; f.Q.value=1.5; env(g,t,0.05*v,0.004,len); f.connect(g); g.connect(bus);
   ms_.forEach(function(m){ [-7,7].forEach(function(dt){ var o=osc('sawtooth',mtof(m)); o.detune.value=dt; o.connect(f); fin(o,t,len+0.05) }) }) }
  function riser(a,b,v,pitch){ var x=nsrc(), f=ctx.createBiquadFilter(), g=ctx.createGain(); f.type='bandpass'; f.Q.value=2.2; f.frequency.setValueAtTime(350,a); f.frequency.exponentialRampToValueAtTime(7500,b);
   g.gain.setValueAtTime(0.0001,a); g.gain.exponentialRampToValueAtTime(0.3*v,b-0.01); g.gain.linearRampToValueAtTime(0.0001,b); x.connect(f); f.connect(g); g.connect(bus); x.start(a); x.stop(b+0.01); src.push(x);
   if(pitch){ var o=osc('sawtooth',110), pf=ctx.createBiquadFilter(), pg=ctx.createGain(); o.frequency.setValueAtTime(mtof(45+key),a); o.frequency.exponentialRampToValueAtTime(mtof(81+key),b); pf.type='lowpass'; pf.frequency.value=3000;
    pg.gain.setValueAtTime(0.0001,a); pg.gain.exponentialRampToValueAtTime(0.05*v,b-0.01); pg.gain.linearRampToValueAtTime(0.0001,b); o.connect(pf); pf.connect(pg); pg.connect(bus); o.start(a); o.stop(b+0.01); src.push(o) } }

  /* harmony, counted back from the hit: ... vi | ii | IV | V (sus4 on beats 3-4) || I.  Rounds 4+ lift the key a step for the last bar. */
  var BACK=[4,3,1,5], lift=lvl>=6?2:lvl>=4?1:0;
  function chordAt(k){ var bar=Math.ceil(-k/16), pos=((k%16)+16)%16, deg=BACK[(bar-1)%4], tones=triad(deg), sh=key+(bar===1?lift:0);
   if(bar===1&&pos>=8) tones=[7,12,14];   /* Vsus4: the pull into the hit */
   return {tones:tones, root:SCALE[deg], sh:sh} }
  function steps(k0,k1){ for(var k=k0;k<k1;k++){
   var t=hit+k*st, p=(k+n)/n, pos=((k%16)+16)%16, bar=Math.ceil(-k/16), e=0.55+0.45*p, c=chordAt(k), lastBar=bar===1;
   if(k>=-1) continue;   /* one 16th of air before the hit (the riser carries it) */
   /* kick: four on the floor; round 1 waits, round 2 starts half-time */
   var kOn=pos%4===0 && !(lvl===1&&p<0.4) && !(lvl===2&&p<0.35&&pos%8!==0);
   if(kOn) kick(t,0.8+0.2*e);
   /* clap on 2 and 4 once things get going; the last bar is a snare roll that speeds up */
   var rollBars=lvl>=4?2:1, inRoll=lvl===1?k>=-8:bar<=rollBars;
   if(inRoll){ var every=lvl===1?2:bar===2?(pos<8?4:2):(pos<8&&lvl<4?2:1), rp=lvl===1?(k+8)/8:(k+16*rollBars)/(16*rollBars); if(pos%every===0) snare(t,0.3+0.7*Math.pow(rp,1.5)) }
   else if((pos===4||pos===12)&&(lvl>=3||p>=0.3)) clap(t,e);
   /* hats: offbeat 8ths, 16ths when it heats up */
   if(pos%4===2) hat(t,e,lvl>=5&&pos===14&&!lastBar); else if(lvl>=3&&p>0.5&&pos%2===1) hat(t,0.5*e,false);
   /* bass: driving 8ths on the root, octave pop at the end of each bar */
   if(pos%2===0&&!(lvl===1&&p<0.25)){ var bm=36+((c.root+c.sh)%12)+(pos===14?12:0); bass(t,bm,e*(pos%4===0?1:0.8),260+1400*p*(0.6+0.4*I),st*1.7) }
   /* arpeggio: 8ths early in round 1, 16ths everywhere else; the filter opens as the energy climbs */
   var PAT=[0,1,2,3,2,1,0,1,2,3,4,3,2,1,2,3], ext=c.tones.concat([c.tones[0]+12,c.tones[1]+12]);
   if(pos%2===0||!(lvl===1&&p<0.5)) pluck(t,60+c.sh+ext[PAT[pos]],e,700+5200*Math.pow(p,1.4)*(0.55+0.45*I));
   /* chord stabs on the offbeats from round 3 up */
   if(lvl>=3&&p>0.35&&(pos===6||pos===10||pos===14)) stab(t,c.tones.map(function(x){return 60+c.sh+x}),e,1800+2600*p,0.12);
  } }
  /* notes go out in short batches (about 1 s ahead) so play() never blocks the splash animation; offline renders get them all at once */
  var kNext=-n;
  function pump(){ if(s.dead) return; var lim=ctx.currentTime+1.0, k1=kNext; while(k1<0&&hit+k1*st<lim) k1++;
   var k0=kNext; while(k0<k1&&hit+k0*st<ctx.currentTime+0.005&&!off) k0++;   /* a stalled tab skips notes that are already late */
   if(k0<k1) steps(k0,k1); kNext=k1; if(kNext<0) s.pump=setTimeout(pump,250) }
  if(off) steps(-n,0); else pump();
  /* riser into the hit */
  var rl=Math.min((lvl>=4?2:1)*16*st,0.65*A); riser(hit-rl,hit,0.5+0.5*I,lvl>=4);
  /* final hit: kick + crash + full tonic chord, all inside the gate */
  var hk=key+lift; kick(hit,1.15);
  (function(){ var x=nsrc(), f=ctx.createBiquadFilter(), g=ctx.createGain(); f.type='highpass'; f.frequency.value=3500; env(g,hit,0.32,0.002,TAIL); x.connect(f); f.connect(g); g.connect(bus); fin(x,hit,TAIL+0.02) })();
  stab(hit,[48+hk,55+hk,60+hk,64+hk,67+hk,72+hk],1.3,5000,TAIL);
  bass(hit,36+(hk%12),1.1,1200,TAIL);
  s.hitCtx=hit; s.endCtx=end; s.t0=t0; s.lat=lat;
  var pn=pnow(); s.hitAt=pn+(hit+CDLY-t0+lat)*1000; s.endsAt=pn+(end-t0+lat)*1000;
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
  var s={ctx:ctx,src:[],nodes:[],lat:0,endsAt:pnow()+ms+400,hitAt:0}; cur=last=s;
  try{
   if(!isOffline(ctx)&&ctx.state!=='running'){   /* locked or suspended context: start once it runs, on the same deadline */
    s.pending=true; var t0=pnow(); ctx.resume().then(function(){ if(s.cancel||cur!==s) return; s.pending=false; var left=ms-(pnow()-t0); if(!(left>=1500&&build(s,left,opts))){ cur=null; s.endsAt=pnow() } }).catch(function(){ if(cur===s){ cur=null; s.endsAt=pnow() } });
    return true }
   if(!build(s,ms,opts)){ cur=null; s.endsAt=pnow(); free(s); return false } return true
  }catch(e){ try{ free(s) }catch(e2){} cur=null; s.endsAt=pnow(); return false } }

 var api={ play:play, stop:stop, isPlaying:function(){ return !!last&&pnow()<last.endsAt } };
 Object.defineProperty(api,'endsAt',{get:function(){ return last?last.endsAt:0 }});
 Object.defineProperty(api,'hitAt',{get:function(){ return last?last.hitAt:0 }});
 Object.defineProperty(api,'_cur',{get:function(){ return cur }});   /* test hook */
 try{ document.addEventListener('visibilitychange',function(){ if(document.hidden) stop(60) }) }catch(e){}
 window.chmaHype=api;
})();
