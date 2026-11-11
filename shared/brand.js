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
