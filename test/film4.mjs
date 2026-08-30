import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const BASE='http://127.0.0.1:8321';
const HERE=new URL('.',import.meta.url).pathname;
const MODE=process.env.MODE==='junior'?'junior':'normal';
const OUT=join(HERE,'film',process.env.TAG||'z'); mkdirSync(OUT,{recursive:true});
const SEED = junior => ({version:2,players:{
 1:{name:junior?'ART':'GABE',caught:[1,4,6,25,74,95,133],team:[6,25,1,4,74,95],
   mons:Object.fromEntries([1,4,6,25,74,95,133].map(id=>[id,{level:30,xp:30}])),
   badges:[],shinies:[],nicks:{},items:{masterBalls:3},quests:{},gyms:{beaten:{'rock:0':true}},
   settings:{junior},champion:null,stats:{catches:7,battlesWon:3,battlesLost:0,versusWins:0}},
 2:{name:'P2',caught:[1],team:[1],mons:{1:{level:5,xp:0}},badges:[],shinies:[],nicks:{},
   items:{masterBalls:1},quests:{},gyms:{beaten:{}},settings:{junior:false},champion:null,
   stats:{catches:1,battlesWon:0,battlesLost:0,versusWins:0}}}});
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',deviceScaleFactor:1});
await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
const page=await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
page.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text().slice(0,160));});
await page.addInitScript(save=>{try{localStorage.setItem('pokedexos_save_v2',JSON.stringify(save));
 localStorage.setItem('pokedexos_lastplayer','1');localStorage.setItem('pokedexos_muted','1');}catch(e){}},SEED(MODE==='junior'));
await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(1200);
await page.evaluate(()=>document.getElementById('boot-screen')?.click());
await page.waitForTimeout(700);
await page.evaluate(()=>document.getElementById('whoplaying-modal')?.remove());
await page.waitForTimeout(1200);
const probe=`() => {
 const g=id=>document.getElementById(id);
 const info=id=>{const el=g(id);if(!el)return null;const c=getComputedStyle(el);const r=el.getBoundingClientRect();
  return {cls:el.className,f:c.filter.slice(0,34),op:c.opacity,anim:c.animationName,
   src:String(el.src||'').split('/').pop(),nw:el.naturalWidth,cw:el.complete,r:[Math.round(r.y),Math.round(r.width)]};};
 const bar=g('wild-hp-bar'), gh=g('wild-hp-ghost');
 return {wild:info('wild-sprite'),player:info('player-sprite'),
  wildName:(g('wild-name')?.innerText||'').trim(),
  wBar:bar?getComputedStyle(bar).width:null, wGhost:gh?getComputedStyle(gh).width:null,
  log:(g('battle-log')?.innerText||'').trim().replace(/\\n/g,' / '),
  title:(g('battle-title')?.innerText||'').trim()};
}`;
let n=0;
const film=async(label,ms,every=130)=>{const t0=Date.now();const fr=[];
 while(Date.now()-t0<ms){n++;const f=`${String(n).padStart(3,'0')}-${label}-${String(Date.now()-t0).padStart(4,'0')}ms.png`;
  await page.screenshot({path:join(OUT,f)});
  const p=await page.evaluate(new Function('return '+probe)());fr.push({t:Date.now()-t0,f,...p});
  await page.waitForTimeout(every);}
 writeFileSync(join(OUT,label+'.json'),JSON.stringify(fr,null,1));
 console.log('--- '+label);
 for(const x of fr) console.log(`${x.t}ms ${x.f} name="${x.wildName}" wild=${JSON.stringify(x.wild)} bar=${x.wBar}/${x.wGhost} log="${x.log}"`);
};
try{
 await page.click('#gyms-btn');
 await page.waitForFunction(()=>document.querySelectorAll('#gym-body .gym-card').length>0,null,{timeout:20000});
 await page.locator('#gym-body .gym-card').first().click(); await page.waitForTimeout(1500);
 await page.locator('.trainer-card:not(.locked)').nth(1).click(); await page.waitForTimeout(1200);
 const ok=page.locator('#dlg-ok'); if(await ok.isVisible().catch(()=>false)) await ok.click();
 await page.waitForFunction(()=>document.getElementById('battle-container')?.classList.contains('active'),null,{timeout:25000});
 await page.waitForTimeout(2200);
 for(let turn=0; turn<10; turn++){
   const t=page.locator('.move-btn.type-tile:not([disabled])');
   if(!(await t.count())) { console.log('no tiles at turn',turn); await page.waitForTimeout(2500); continue; }
   await t.first().click().catch(()=>{});
   await film('turn'+turn, 9000, 100);
   const done=await page.evaluate(()=>['victory-modal','badge-modal','nick-modal'].some(id=>{
     const e=document.getElementById(id); if(!e)return false; const r=e.getBoundingClientRect();
     return r.width>0&&getComputedStyle(e).display!=='none'&&+getComputedStyle(e).opacity>0.02;}));
   if(done){console.log('MODAL UP at turn',turn); await page.screenshot({path:join(OUT,'zz-endmodal.png')}); break;}
 }
}catch(e){console.log('ABORT '+e.message.split('\n')[0]);}
console.log('ERRORS:',errs.slice(0,10));
await browser.close();
