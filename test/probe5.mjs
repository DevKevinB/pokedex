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

const st = () => p.evaluate(()=>{
  const w=document.getElementById('wild-hp-fill')||document.querySelector('.hp-box-wild .hp-fill');
  const ph=document.querySelector('.hp-box-player .hp-fill');
  return {log:(document.getElementById('battle-log')?.innerText||'').trim().slice(0,60),
    wildHp:w?w.style.width:null, myHp:ph?ph.style.width:null,
    tiles:[...document.querySelectorAll('.move-btn.type-tile')].map(t=>({d:t.disabled,eff:t.dataset.eff,type:t.dataset.type})),
    busy: document.getElementById('battle-container')?.className};
});

await p.click('#explore-btn');
await p.waitForFunction(()=>document.querySelectorAll('#habitat-grid .habitat-card').length>0,null,{timeout:20000});
await p.locator('#habitat-grid .habitat-card:not(.locked)').first().click();
await p.waitForFunction(()=>document.getElementById('battle-container')?.classList.contains('active'),null,{timeout:25000});
await p.waitForTimeout(1800);
console.log('BATTLE START', JSON.stringify(await st()));

// ART: mash the SAME move tile 6 times fast
const tile = p.locator('.move-btn.type-tile').first();
for (let i=0;i<6;i++){ await tile.click({force:true,timeout:2000}).catch(e=>console.log('  click fail',i)); await p.waitForTimeout(120); }
await p.waitForTimeout(500);
await p.screenshot({path:OUT+'mash-move-6x-immediately.png'});
console.log('AFTER 6x SAME TILE', JSON.stringify(await st()));
await p.waitForTimeout(4000);
await p.screenshot({path:OUT+'mash-move-6x-settled.png'});
console.log('SETTLED', JSON.stringify(await st()));

// ART: tap two different tiles at the same instant
const tiles = p.locator('.move-btn.type-tile');
const n = await tiles.count();
if (n>1){
  await Promise.all([tiles.nth(0).click({force:true}).catch(()=>{}), tiles.nth(1).click({force:true}).catch(()=>{})]);
  await p.waitForTimeout(600);
  await p.screenshot({path:OUT+'two-tiles-at-once.png'});
  console.log('TWO AT ONCE', JSON.stringify(await st()));
  await p.waitForTimeout(4000);
  console.log('TWO AT ONCE settled', JSON.stringify(await st()));
}

// ART: mash BALL
for (let i=0;i<4;i++){ await p.locator('#ball-btn').click({force:true,timeout:1500}).catch(()=>{}); await p.waitForTimeout(150); }
await p.waitForTimeout(400);
await p.screenshot({path:OUT+'ball-mashed-4x.png'});
console.log('BALL MASHED', JSON.stringify(await p.evaluate(()=>({
  overlays:[...document.querySelectorAll('.dlg-overlay, #ball-modal, .modal-overlay')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.id||e.className),
  html:(document.querySelector('#ball-modal, .dlg-overlay')?.innerText||'').replace(/\n/g,'|').slice(0,200)}))));
await b.close();
