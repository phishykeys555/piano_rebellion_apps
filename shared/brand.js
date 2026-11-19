/* CHMA app-suite access gate (2026-11-15; code changed 2026-11-18; code shown on the gate 2026-11-19, Derek). One studio code per quarter; only its SHA-256 lives here.
   A soft gate: it stops link-sharing and casual use, not a determined techie (public repo).
   To rotate each quarter: put the new code's sha256 (lowercase, trimmed) in GATE.hash, bump GATE.q, publish. */
(function(){
 var GATE={hash:'cc4e6ddd43692b4072bc164e645ceea2d471f89b4168fc7b1443e21d127652c2',q:'2026-Q4',form:'https://form.jotform.com/263181165308051'};
 var KEY='chmaGate';
 /* Evan's Fretboard tools stay open until the beta reaches Fretboard Revolution (embedded on his students' dashboards) */
 if(/\/(guitar-tuner|drum-machine|simple-metronome)\//.test(location.pathname))return; /* simple-metronome (2026-11-18): embedded on every song page, like the Modal Metronome */
 /* VIP waitlist apps (2026-11-19, Derek: "Take off pass word block for now"): open, no code. The waitlist email links straight to these.
    To lock them again, delete the next line. */
 if(/\/(note-sprint|rhythm-trainer|meter-master|ear-trainer)\//.test(location.pathname))return;
 try{if(localStorage.getItem(KEY)===GATE.hash)return}catch(e){}
 if(!(window.crypto&&crypto.subtle))return; /* never lock out a browser that cannot check the code */
 var de=document.documentElement;de.classList.add('chma-locked');
 var st=document.createElement('style');
 st.textContent='html.chma-locked body>*:not(#chma-gate){display:none!important}'+
 '#chma-gate{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;background:#0e1016;font-family:Inter,system-ui,-apple-system,sans-serif;color:#f4f5f7}'+
 '#chma-gate .g{width:100%;max-width:380px;text-align:center}'+
 '#chma-gate img{width:120px;height:auto;margin:0 auto 22px;display:block}'+
 '#chma-gate h1{font:700 1.35rem/1.25 Inter,system-ui,sans-serif;margin:0 0 8px;letter-spacing:-.01em}'+
 '#chma-gate p{margin:0 0 20px;color:#b9bcc6;font-size:.95rem;line-height:1.5}'+
 '#chma-gate input{width:100%;box-sizing:border-box;padding:14px 16px;border-radius:12px;border:1px solid #3a3e4a;background:#171a22;color:#fff;font-size:1.05rem;text-align:center;outline:none}'+
 '#chma-gate input:focus{border-color:#4a7fd1;box-shadow:0 0 0 3px rgba(74,127,209,.35)}'+
 '#chma-gate button{width:100%;margin-top:12px;padding:14px;border:0;box-shadow:none;border-radius:12px;background:#2f63b4;color:#fff;font:600 1rem Inter,system-ui,sans-serif;cursor:pointer}'+
 '#chma-gate .err{min-height:1.4em;margin:10px 0 0;color:#ff8a80;font-size:.9rem}'+
 '#chma-gate a{color:#9cc1ff;font-size:.9rem}'+
 '#chma-gate .code{margin:0 0 18px;padding:12px;border-radius:12px;background:#2f63b4;color:#fff}'+
 '#chma-gate .code b{display:block;font:800 2.6rem/1.05 Inter,system-ui,sans-serif;letter-spacing:.06em}'+
 '#chma-gate .code span{font-size:.9rem;font-weight:600}';
 (document.head||de).appendChild(st);
 var base=(document.currentScript&&document.currentScript.src||'').replace(/brand\.js.*$/,'');
 function sha(t){return crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)).then(function(b){return Array.from(new Uint8Array(b)).map(function(x){return x.toString(16).padStart(2,'0')}).join('')})}
 function show(){
  if(document.getElementById('chma-gate'))return;
  var d=document.createElement('div');d.id='chma-gate';d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.setAttribute('aria-labelledby','chma-gate-h');
  d.innerHTML='<form class="g" novalidate><img src="'+base+'chma-logo-dark.png" alt="Clarendon Hills Music Academy" width="120" height="59">'+
   '<h1 id="chma-gate-h">Piano Rebellion App Suite</h1><p>Enter your studio code to start training. You only need to do this once on this device.</p>'+
   '<div class="code"><span>Access code for all apps</span><b>chma</b></div>'+
   '<label for="chma-code" style="position:absolute;left:-9999px">Studio code</label>'+
   '<input id="chma-code" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Studio code">'+
   '<button type="submit">Unlock</button><p class="err" aria-live="polite"></p>'+
   '<a href="'+GATE.form+'" target="_blank" rel="noopener">Forgot the code? Request it here</a></form>';
  document.body.appendChild(d);
  var f=d.querySelector('form'),i=d.querySelector('input'),e=d.querySelector('.err');
  setTimeout(function(){try{i.focus()}catch(x){}},50);
  f.addEventListener('submit',function(ev){ev.preventDefault();
   sha(i.value.trim().toLowerCase()).then(function(h){
    if(h===GATE.hash){try{localStorage.setItem(KEY,h)}catch(x){}de.classList.remove('chma-locked');d.remove();}
    else{e.textContent='That code didn’t work. Check it and try again.';i.select();}
   });
  });
 }
 if(document.body)show();else document.addEventListener('DOMContentLoaded',show);
})();

/* CHMA brand header: <div data-chma-head data-ver="Rhythm Trainer · Version X"></div> becomes stripe + logo (links to the website) + version.
   Logo swaps for dark/light automatically. */
(function(){
 /* Studio fonts, loaded without blocking the page (media=print, then switched on when loaded) */
 try{if(!document.querySelector('link[data-chma-fonts]')){const l=document.createElement('link');l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap';l.media='print';l.dataset.chmaFonts='1';l.onload=function(){this.media='all'};document.head.appendChild(l)}}catch(e){}
 const SITE='https://clarendonhillsmusicacademy.com/';
 const base=(document.currentScript&&document.currentScript.src||'').replace(/brand\.js.*$/,'');
 function build(el){if(el.dataset.done)return;el.dataset.done=1;el.classList.add('chma-headwrap');
  el.innerHTML='<div class="chma-stripe"></div><div class="chma-head"><a class="chma-logo" href="'+SITE+'" target="_blank" rel="noopener" aria-label="Clarendon Hills Music Academy website"><picture><source srcset="'+base+'chma-logo-dark.png" media="(prefers-color-scheme: dark)"><img src="'+base+'chma-logo-light.png" alt="Clarendon Hills Music Academy" width="73" height="36"></picture></a><span class="chma-ver">'+(el.dataset.ver||((document.querySelector('.appver')||{}).textContent||'').replace(/^.*Version\s*/,'v'))+'</span></div>'}
 function run(){document.querySelectorAll('[data-chma-head]').forEach(build)}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();window.chmaHead=run})();

/* Beta (2026-11-19, Derek: "Don't share results, take that off all until we are out of beta"): every game's "Share result" button is hidden.
   To bring sharing back after beta, set CHMA_SHARE_RESULTS=true. */
(function(){var CHMA_SHARE_RESULTS=false;if(CHMA_SHARE_RESULTS)return;
 var st=document.createElement('style');st.textContent='#shareBtn,#shareB,#rShare{display:none!important}';(document.head||document.documentElement).appendChild(st)})();
