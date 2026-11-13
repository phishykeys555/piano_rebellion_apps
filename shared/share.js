/* CHMA share helper (2026-11-13). One share flow for every game.
   chmaShare.share({app:"fab-fours", text:"Fab Fours · Daily #3\n🎹🎹🎹🎹\nSolved"})
   Appends the short play link + "Clarendon Hills Music Academy · chmusicacademy.com", then:
   1. the phone share sheet (touch devices; blocked inside some embeds, falls through),
   2. the clipboard (checked against the page's permissions policy),
   3. an on-screen box with the text selected and a Copy button (always works, even in Notion embeds). */
(function(){
  const SITE="chmusicacademy.com";
  const LINKS={hub:"https://is.gd/chmagames","fab-fours":"https://is.gd/chmafabfours","note-sprint":"https://is.gd/chmanotesprint",
    "key-finder":"https://is.gd/chmakeyfinder","rhythm-trainer":"https://is.gd/chmarhythm","riff-says":"https://is.gd/chmariff",
    "meter-master":"https://is.gd/chmametermaster","symbol-memory":"https://is.gd/chmasymbols","ear-trainer":"https://is.gd/chmaeartrainer",
    "trivia":"https://is.gd/chmatrivia","drum-machine":"https://is.gd/chmametronome","song-player":"https://is.gd/chmadissector",
    "hanon-player":"https://is.gd/chmahanon","guitar-tuner":"https://is.gd/chmatuner"};
  function link(app){return LINKS[app]||LINKS.hub}
  function compose(o){const lead=o.playLine||"Play free:";return (o.text?o.text.replace(/\s+$/,"")+"\n\n":"")+lead+" "+link(o.app)+"\nClarendon Hills Music Academy · "+SITE}
  async function copy(t){
    try{const pp=document.permissionsPolicy||document.featurePolicy;const blocked=pp&&pp.allowsFeature&&!pp.allowsFeature("clipboard-write");
      if(!blocked&&navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(t);return true}}catch(e){}
    try{const ta=document.createElement("textarea");ta.value=t;ta.setAttribute("readonly","");ta.style.cssText="position:fixed;top:0;left:0;opacity:0";document.body.appendChild(ta);ta.focus();ta.select();ta.setSelectionRange(0,t.length);const ok=document.execCommand("copy");ta.remove();return ok}catch(e){return false}
  }
  let box=null;
  function showBox(t,ok){
    if(!box){box=document.createElement("div");box.id="chmaShareBox";box.setAttribute("role","dialog");box.setAttribute("aria-label","Share your result");
      box.innerHTML='<div class="csb-card"><div class="csb-h"><b>Share your result</b><button class="csb-x" aria-label="Close">&times;</button></div><p class="csb-s"></p><textarea readonly rows="8" aria-label="Your result to copy"></textarea><div class="csb-r"><button class="csb-c">Copy</button><button class="csb-d">Done</button></div></div>';
      const st=document.createElement("style");st.textContent='#chmaShareBox{position:fixed;inset:0;z-index:99999;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.5);padding:12px;padding-bottom:max(12px,env(safe-area-inset-bottom))}#chmaShareBox[hidden]{display:none}#chmaShareBox .csb-card{width:min(520px,100%);background:var(--c-panel,#16171b);color:var(--c-ink,#eceef2);border-radius:18px;padding:14px;box-shadow:0 18px 40px rgba(0,0,0,.45);font-family:var(--f-body,system-ui,sans-serif)}#chmaShareBox .csb-h{display:flex;justify-content:space-between;align-items:center;font-size:16px}#chmaShareBox .csb-x{background:none;border:0;color:inherit;font-size:26px;line-height:1;cursor:pointer;min-width:44px;min-height:44px}#chmaShareBox .csb-s{margin:2px 0 8px;font-size:13px;color:var(--c-mut,#9aa3b2)}#chmaShareBox textarea{width:100%;box-sizing:border-box;font:13px/1.4 var(--f-num,ui-monospace,Menlo,monospace);background:var(--c-panel2,#1d1f24);color:inherit;border:1px solid var(--c-line,#2c2f36);border-radius:10px;padding:8px;resize:none;-webkit-user-select:text;user-select:text}#chmaShareBox .csb-r{display:flex;gap:8px;margin-top:8px}#chmaShareBox .csb-r button{flex:1;min-height:44px;border-radius:12px;border:0;font:600 15px var(--f-body,system-ui);cursor:pointer}#chmaShareBox .csb-c{background:var(--c-act,#ff6a1a);color:var(--c-act-ink,#121212)}#chmaShareBox .csb-d{background:var(--c-key,#24262c);color:inherit}';
      document.head.appendChild(st);document.body.appendChild(box);
      const close=()=>{box.hidden=true};box.querySelector(".csb-x").onclick=close;box.querySelector(".csb-d").onclick=close;box.addEventListener("click",e=>{if(e.target===box)close()});
      document.addEventListener("keydown",e=>{if(e.key==="Escape"&&box&&!box.hidden)close()});
      box.querySelector(".csb-c").onclick=async()=>{const b=box.querySelector(".csb-c");const ok2=await copy(box.querySelector("textarea").value);b.textContent=ok2?"Copied":"Press and hold the text to copy";setTimeout(()=>b.textContent="Copy",1800)};}
    const ta=box.querySelector("textarea");ta.value=t;box.querySelector(".csb-s").textContent=ok?"Copied. Paste it in a text or post. Or copy it again below.":"Copy this and paste it in a text or post.";
    box.hidden=false;setTimeout(()=>{try{ta.focus({preventScroll:true});ta.select();ta.setSelectionRange(0,t.length);ta.scrollTop=0}catch(e){}},30);
  }
  async function share(o){
    const t=compose(o||{});window.__lastShare=t;
    if(navigator.share&&matchMedia("(pointer:coarse)").matches){try{await navigator.share({text:t});return "shared"}catch(e){if(e&&e.name==="AbortError")return "cancelled"}}
    const ok=await copy(t);showBox(t,ok);return ok?"copied":"box";
  }
  window.chmaShare={share,compose,link,LINKS,SITE};
})();
