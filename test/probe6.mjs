import { chromium } from 'playwright';
const BASE='http://127.0.0.1:8321';
const OUT='/home/kevin/pokedex/test/playtest/art-probe/';
import {mkdirSync} from 'node:fs'; mkdirSync(OUT,{recursive:true});
const SEED={version:2,players:{
 1:{name:'ART',caught:[1,4,6,25,74,95,133],team:[6,25,1,4,74,95],
    mons:Object.fromEntries([1,4,6,25,74,95,133].map(id=>[id,{level:14,xp:30}])),
    badges:[],shinies:[],nicks:{},items:{masterBalls:3},quests:{},gyms:{beaten:{}},
    settings:{junior:true},champion:null,stats:{catches:7,battlesWon:3,battlesLost:0,versusWins:0}},
 2:{name:'P2',caught:[1],team:[1],mons:{1:{level:5,xp:0}},badges:[],shinies:[],nicks:{},
    items:{masterBalls:1},quests:{},gyms:{beaten:{}},settings:{junior:false},champion:null,
    stats:{catches:1,battlesWon:0,battlesLost:0,versusWins:0}}}};
const b = await chromium.launch();
const ctx = await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block',deviceScaleFactor:2});
await ctx.route('https://fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
const p = await ctx.newPage();
p.on('pageerror',e=>console.log('!! PAGEERROR',e.message));
p.on('console',m=>{if(m.type()==='error'&&!/404|Failed to load resource/.test(m.text()))console.log('!! CONSOLE',m.text().slice(0,200));});
await p.addInitScript(s=>{localStorage.setItem('pokedexos_save_v2',JSON.stringify(s));localStorage.setItem('pokedexos_lastplayer','1');localStorage.setItem('pokedexos_muted','1');},SEED);
await p.goto(BASE+'/?fast=1',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(1200);
await p.evaluate(()=>document.getElementById('boot-screen')?.click());
await p.waitForTimeout(800);
await p.evaluate(()=>document.getElementById('whoplaying-modal')?.remove());
await p.waitForTimeout(1800);

const overlays = () => p.evaluate(()=>[...document.querySelectorAll('div,section')].filter(e=>{
  const s=getComputedStyle(e); const r=e.getBoundingClientRect();
  return (s.position==='fixed'||s.position==='absolute') && +s.zIndex>=100 && s.display!=='none' && s.visibility!=='hidden' && +s.opacity>0.05 && r.width>100&&r.height>100;
}).map(e=>({id:e.id,cls:e.className.toString().slice(0,50),z:getComputedStyle(e).zIndex,
  rect:[Math.round(e.getBoundingClientRect().x),Math.round(e.getBoundingClientRect().y),Math.round(e.getBoundingClientRect().width),Math.round(e.getBoundingClientRect().height)]})));

// --- ART: open EXPLORE then immediately hit BACK
await p.click('#explore-btn'); await p.waitForTimeout(120);
await p.locator('#explore-back-btn').click({force:true}).catch(e=>console.log('back fail',e.message.split('\n')[0]));
await p.waitForTimeout(1200);
await p.screenshot({path:OUT+'explore-open-then-instant-back.png'});
console.log('EXPLORE instant-back screen:', JSON.stringify(await p.evaluate(()=>({
  dexTop:Math.round(document.getElementById('main-screen')?.getBoundingClientRect().top ?? -999),
  exploreTop:Math.round(document.getElementById('explore-container')?.getBoundingClientRect().top ?? -999),
  bodyCls:document.body.className}))));

// --- ART: start a fight, tap BACK during the intro
await p.click('#explore-btn');
await p.waitForFunction(()=>document.querySelectorAll('#habitat-grid .habitat-card').length>0,null,{timeout:20000});
await p.locator('#habitat-grid .habitat-card:not(.locked)').first().click();
await p.waitForFunction(()=>document.getElementById('battle-container')?.classList.contains('active'),null,{timeout:25000});
await p.waitForTimeout(200);
await p.locator('#battle-back-btn, #battle-exit, .battle-back').first().click({force:true,timeout:2000}).catch(e=>console.log('  no back btn:',e.message.split('\n')[0]));
await p.waitForTimeout(1000);
await p.screenshot({path:OUT+'back-during-battle-intro.png'});
console.log('AFTER BACK DURING INTRO overlays:', JSON.stringify(await overlays()));

// dismiss any dialog and fight to a win
for (let k=0;k<3;k++){ const d=p.locator('#dlg-cancel, #dlg-ok'); if(await d.count()&&await d.first().isVisible().catch(()=>0)){await d.first().click().catch(()=>{});await p.waitForTimeout(500);} }
for (let turn=0; turn<8; turn++){
  const t=p.locator('.move-btn.type-tile:not([disabled])');
  if(!(await t.count())) { await p.waitForTimeout(900); continue; }
  await t.first().click({force:true}).catch(()=>{});
  await p.waitForTimeout(1600);
  const ov=await overlays();
  if (ov.length>1){ await p.screenshot({path:OUT+`stacked-overlays-turn${turn}.png`}); console.log(`TURN ${turn} OVERLAYS`, JSON.stringify(ov)); }
  const done = await p.evaluate(()=>(document.getElementById('battle-log')?.innerText||'').includes('CATCHING')||document.getElementById('victory-modal')?.offsetParent!=null);
  if (done) break;
}
await p.waitForTimeout(3500);
await p.screenshot({path:OUT+'junior-after-win.png'});
console.log('AFTER WIN overlays:', JSON.stringify(await overlays()));
console.log('AFTER WIN visible text:', JSON.stringify(await p.evaluate(()=>document.body.innerText.replace(/\n+/g,'|').slice(0,400))));
await b.close();
