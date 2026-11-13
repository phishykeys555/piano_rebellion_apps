// Studio rule check (LOCKED 2026-11-13): every chord numeral, every style × key, counts from the PARENT MAJOR KEY.
// Run: serve the repo root on :8765, then `NODE_PATH=$(npm root -g) node riff-says/tests/numerals.js`
const {chromium}=require('playwright');
const BASE=process.env.BASE||'http://localhost:8765/riff-says/';
(async()=>{
  const b=await chromium.launch(), p=await b.newPage(), errs=[];
  p.on('pageerror',e=>errs.push(e.message));
  await p.goto(BASE); await p.waitForFunction(()=>window.RiffSays&&window.RiffSays.numeralAudit);
  const r=await p.evaluate(()=>{ const R=window.RiffSays, a=R.numeralAudit();
    const spot={funkA:R.progText('funk',R.makeKey('funk','A')),funkD:R.progText('funk',R.makeKey('funk','D')),funkFs:R.progText('funk',R.makeKey('funk','F♯')),
      bluesA:R.progText('blues',R.makeKey('blues','A')),rockA:R.progText('rock',R.makeKey('rock','A')),jazzC:R.progText('jazz',R.makeKey('jazz','C')),
      jazzBb:R.progText('jazz',R.makeKey('jazz','B♭')),popC:R.progText('pop',R.makeKey('pop','C')),latinC:R.progText('latin',R.makeKey('latin','C')),
      parentFunkA:R.parentKey('funk',R.makeKey('funk','A')).name};
    // the audit must catch the old mode-relative labels
    const S=R.STYLES.funk, old=S.chords; S.chords=[['i7',0,0,'m7'],['IV7',5,3,'7']]; const bad=R.numeralAudit().errors.length; S.chords=old;
    return {...a,spot,bad} });
  const want={funkA:'ii7 – V7 · Am7 – D7',funkD:'ii7 – V7 · Dm7 – G7',funkFs:'ii7 – V7 · F♯m7 – B7',bluesA:'V7 · A7',rockA:'vi5 · A5',jazzC:'V7 · C7',jazzBb:'V7 · B♭7',
    popC:'I – V – vi – IV · C – G – Am – F',latinC:'I – V7 · C – G7',parentFunkA:'G'};
  let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++ };
  ok(r.errors.length===0&&r.checked>0,`numeralAudit: ${r.checked} chord labels, ${r.errors.length} errors ${r.errors.join(' | ')}`);
  ok(r.bad>0,`audit catches the old i7 – IV7 labels (${r.bad} errors flagged)`);
  for(const k in want) ok(r.spot[k]===want[k],`${k}: ${r.spot[k]}`);
  ok(errs.length===0,'no page errors '+errs.join(' | '));
  await b.close(); process.exit(fail?1:0) })();
