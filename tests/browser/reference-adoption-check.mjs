const { chromium } = await import(process.env.APEX_BITE_PLAYWRIGHT_MODULE ?? 'playwright');
import { writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const out = process.env.APEX_BITE_ADOPTION_EVIDENCE ?? 'docs/iteration-4-adoption';
const base = process.env.APEX_BITE_TEST_URL ?? 'http://127.0.0.1:5192'; mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}); const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`${base}/tests/browser/reference-search.html`);await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('#result').textContent.startsWith('PASS'));const search=await page.locator('#result').textContent();
 await page.goto(`${base}/tests/browser/racing-guidance.html`); await page.waitForFunction(()=>window.guidanceReview);
 const results=[];
 for(const camera of ['Helmet Cam','Chase Cam'])for(const scenario of ['fast','slow']){
 const data=await page.evaluate(({camera,scenario})=>{const h=window.guidanceReview;h.view(camera);h.scenario(scenario);const {snapshot:s}=h.read();const near=s.racingLine.points.filter(p=>(p.distanceMeters-s.kart.lapDistanceMeters+s.circuit.totalLengthMeters)%s.circuit.totalLengthMeters<20);return {camera,scenario,seconds:s.racingLine.benchmarkLapSeconds,speed:s.kart.speedKph,contacts:s.kart.barrierContactCount,action:s.racingLine.guidance.action,red:near.filter(p=>p.liveCue==='Red').length,points:s.racingLine.points.map(p=>p.position)};},{camera,scenario});
 assert.equal(data.seconds,38.225);assert.equal(data.contacts,0);assert.equal(data.action,scenario==='fast'?'Brake':'Coast');assert(scenario==='fast'?data.red>0:data.red===0);await page.waitForTimeout(150);await page.screenshot({path:`${out}/${camera==='Helmet Cam'?'helmet':'chase'}-${scenario}.png`});results.push(data);
 }
 assert.deepEqual(results[0].points,results[1].points);
 const modes=await page.evaluate(()=>{const h=window.guidanceReview;return ['Full','Corners Only','Off'].map(mode=>{h.mode(mode);return h.read().snapshot.racingLine.displayMode;});});assert.deepEqual(modes,['Full','Corners Only','Off']);assert.deepEqual(errors,[]);
 writeFileSync(`${out}/browser-evidence.json`,JSON.stringify({browser:await browser.version(),search,modes,results:results.map(({points,...row})=>row),errors},null,2)+'\n');console.log(JSON.stringify({results:results.map(({points,...row})=>row),modes,errors}));
} finally {await browser.close();}
