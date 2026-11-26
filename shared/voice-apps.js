/* CHMA Sing apps (Match Point, Hold Steady, Scale Climber): shared build-out. Version 2026-11-26.1
   One copy for all three apps (student feedback, beta tester requests):
   - Saved on this device only (localStorage, each app's own prefix mp- / hs- / sc-; new keys only):
       <p>top-<voice>-<level>  best result per level and voice type   {r: rank number, s: text, d: date}
       <p>hist                 the last 10 rounds                      [{d: ISO date, lv: "L2 Full range", s: main score, v: voice}]
       <p>streak               practice days in a row                  {last: "YYYY-MM-DD", n}
       <p>loop, <p>withme, <p>drone, <p>music   the Settings switches
   - Keyboard: Space = Start/Stop, H = "Hear it", Enter on the results = "Next level", Esc = "Back".
   - "Share result" (shared/share.js), round music on the results (shared/hype.js, stops before the microphone is graded again),
     "Copy log" (browser, microphone, sample rate, last errors), prefers-reduced-motion.
   Nothing here leaves the device except what the person shares or copies themselves. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const reduced=()=>{ try{ return matchMedia('(prefers-reduced-motion: reduce)').matches }catch(e){ return false } };
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const day=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const yday=()=>{ const d=new Date(); return day(new Date(d.getFullYear(),d.getMonth(),d.getDate()-1)) };

function make(o){   // o = {app, slug, prefix, ver}
  const P=o.prefix, A={};
  const st={get(k,d){ try{ const v=localStorage.getItem(P+k); return v==null?d:JSON.parse(v) }catch(e){ return d } }, set(k,v){ try{ localStorage.setItem(P+k,JSON.stringify(v)) }catch(e){} }, del(k){ try{ localStorage.removeItem(P+k) }catch(e){} }};
  A.store=st;
  A.smooth=()=>reduced()?'auto':'smooth';

  /* ---------- Settings switches, saved per app ---------- */
  A.toggle=function(id,key,def,cb){ const el=$(id); if(!el) return ()=>!!def; el.checked=!!st.get(key,def); el.addEventListener('change',()=>{ st.set(key,el.checked); cb&&cb(el.checked) }); return ()=>el.checked };

  /* ---------- bests, history, streak ---------- */
  A.streak=function(){ const s=st.get('streak',null); return s&&(s.last===day(new Date())||s.last===yday())?s.n:0 };
  function practiced(){ const s=st.get('streak',null), t=day(new Date()); if(s&&s.last===t) return s.n; const n=s&&s.last===yday()?s.n+1:1; st.set('streak',{last:t,n}); return n }
  A.best=(voice,lv)=>voice?st.get('top-'+voice+'-'+lv,null):null;
  // r = {voice (id), vname, lv (id), lvName, rank (higher = better), s (main score text), aid (true = a practice aid was on: no best)}
  A.record=function(r){ const h=st.get('hist',[]); h.unshift({d:new Date().toISOString(),lv:r.lvName,s:r.s,v:r.vname}); st.set('hist',h.slice(0,10)); practiced();
    let isNew=false; if(!r.aid&&r.rank!=null&&isFinite(r.rank)){ const k='top-'+r.voice+'-'+r.lv, b=st.get(k,null); if(!b||r.rank>b.r){ isNew=!!b||r.rank>0; st.set(k,{r:r.rank,s:r.s,d:new Date().toISOString()}) } }
    A.drawHist(); return isNew };
  A.bestLine=function(voice,lv,lvName){ const el=$('bestLine'); if(!el) return; const b=A.best(voice&&voice.id,lv), n=A.streak(); if(!voice){ el.hidden=true; return } el.hidden=false;
    el.innerHTML=(b?'Best on '+esc(lvName)+' ('+esc(voice.name)+'): <b>'+esc(b.s)+'</b>':'No best yet on '+esc(lvName)+' ('+esc(voice.name)+')')+(n?' · Practice streak: <b>'+n+(n===1?' day':' days')+'</b>':'') };
  A.drawHist=function(){ const el=$('hist'); if(!el) return; const h=st.get('hist',[]);
    el.innerHTML=h.length?h.map(x=>{ const d=new Date(x.d); return '<li><span>'+esc(d.toLocaleDateString([], {month:'short',day:'numeric'})+' '+d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}))+'</span><span>'+esc(x.lv)+(x.v?' · '+esc(x.v):'')+'</span><b>'+esc(x.s)+'</b></li>' }).join(''):'<li class="none">No rounds yet on this device.</li>';
    const c=$('histClear'); if(c) c.disabled=!h.length };
  const hc=$('histClear'); if(hc) hc.addEventListener('click',()=>{ st.del('hist'); A.drawHist(); A.onClear&&A.onClear() });

  /* ---------- results: Share, New best ---------- */
  A.shareText='';
  const sb=$('shareBtn'); if(sb) sb.addEventListener('click',()=>{ try{ if(window.chmaShare) chmaShare.share({app:o.slug,text:A.shareText}) }catch(e){ VP.logErr('share: '+(e&&e.message)) } });
  A.newBest=function(on){ const el=$('rNew'); if(el){ el.hidden=!on; el.classList.toggle('pop',!!on&&!reduced()) } };

  /* ---------- round music on the results (shared/hype.js) ---------- */
  const music=A.toggle('hypeOn','music',true,v=>{ if(!v) A.hypeStop() });
  A.hypePlay=function(round){ try{ if(window.chmaHype&&music()){ const a=VP.ctx(); chmaHype.play(4200,{ctx:a,round:round||2,enabled:true,micSafe:true}) } }catch(e){} };
  A.hypeStop=function(){ try{ window.chmaHype&&chmaHype.stop(120) }catch(e){} };
  A.hypeWait=function(){ try{ if(!window.chmaHype) return 0; const w=chmaHype.endsAt+250-performance.now(); return chmaHype.isPlaying()?Math.max(w,10):Math.max(0,w) }catch(e){ return 0 } };
  // before a round: stop the music and wait until it is out of the speaker (plus 250 ms), so the microphone never grades it
  A.quiet=async function(){ A.hypeStop(); const t0=performance.now(); let w; while((w=A.hypeWait())>0&&performance.now()-t0<2500) await new Promise(r=>setTimeout(r,Math.min(w,100))) };

  /* ---------- keyboard ---------- */
  A.keys=function(k){ document.addEventListener('keydown',e=>{ if(e.ctrlKey||e.metaKey||e.altKey) return; const box=$('chmaShareBox'); if(box&&!box.hidden) return;
    let t=e.target; if(box&&t&&box.contains(t)) t=document.body;   // focus left behind in the closed share box
    const tg=t&&t.tagName;
    if(tg==='INPUT'||tg==='SELECT'||tg==='TEXTAREA'||(t&&t.isContentEditable)) return;
    const res=$('results')&&!$('results').hidden;
    if(e.key==='Escape'){ if(res){ e.preventDefault(); A.hypeStop(); k.back() } return }
    if(e.key==='Enter'){ if(res&&tg!=='BUTTON'&&tg!=='A'&&tg!=='SUMMARY'){ const n=$('rNext'); if(n&&!n.hidden){ e.preventDefault(); n.click() } } return }
    if(e.code==='Space'||e.key===' '){ if((tg==='BUTTON'&&t.id!=='go')||tg==='SUMMARY'||tg==='A') return; e.preventDefault(); if(!e.repeat) k.go(); return }
    if(e.key==='h'||e.key==='H'){ if(e.repeat) return; e.preventDefault(); k.hear() } }) };

  /* ---------- Copy log ---------- */
  A.extra=()=>[];
  async function copy(t){ try{ const pp=document.permissionsPolicy||document.featurePolicy, blocked=pp&&pp.allowsFeature&&!pp.allowsFeature('clipboard-write');
      if(!blocked&&navigator.clipboard&&window.isSecureContext){ await navigator.clipboard.writeText(t); return true } }catch(e){}
    try{ const ta=document.createElement('textarea'); ta.value=t; ta.setAttribute('readonly',''); ta.style.cssText='position:fixed;top:0;left:0;opacity:0'; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0,t.length); const ok=document.execCommand('copy'); ta.remove(); return ok }catch(e){ return false } }
  A.logText=function(){ let a=null; try{ a=VP.ctx() }catch(e){} const pi=VP.piano();
    return [o.app+' · Version '+o.ver, 'Page: '+location.pathname, 'Browser: '+navigator.userAgent, 'Microphone: '+VP.micLabel(),
      'Sample rate: '+(a?a.sampleRate+' Hz · audio '+a.state+' · output delay '+Math.round(VP.latency()*1000)+' ms':'?'),
      'Piano samples: '+pi.loaded+' of '+pi.total+' loaded'+(pi.failed?' ('+pi.failed+' failed)':''),
      'Mic sensitivity: '+VP.sens()+' · Volume: '+Math.round(VP.volume()*100)+'%', 'Reduced motion: '+(reduced()?'on':'off')]
      .concat(A.extra()).concat(['Last errors:']).concat(VP.errors().length?VP.errors().map(x=>'  '+x):['  none']).join('\n') };
  const lb=$('logCopy'); if(lb) lb.addEventListener('click',async()=>{ const t=A.logText(), ok=await copy(t), s=$('logStat'), pre=$('logOut');
    if(s) s.textContent=ok?'Copied. Paste it in a message to your Instructor.':'Copy didn\'t work here. Press and hold the text below to copy it.';
    if(pre){ pre.textContent=t; pre.hidden=ok } });
  A.drawHist();
  return A }
window.VA={make,reduced};
})();
