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
p.on('console',m=>{if(m.type()==='error'&&!/404/.test(m.text()))console.log('!! CONSOLE',m.text().slice(0,160));});
await p.addInitScript(s=>{localStorage.setItem('pokedexos_save_v2',JSON.stringify(s));localStorage.setItem('pokedexos_lastplayer','1');localStorage.setItem('pokedexos_muted','1');},SEED);
await p.goto(BASE+'/',{waitUntil:'domcontentloaded'});   // SLOW: no ?fast=1
await p.waitForTimeout(1500);
await p.evaluate(()=>document.getElementById('boot-screen')?.click());
await p.waitForTimeout(900);
await p.evaluate(()=>document.getElementById('whoplaying-modal')?.remove());
await p.waitForTimeout(2000);

await p.click('#explore-btn');
await p.waitForFunction(()=>document.querySelectorAll('#habitat-grid .habitat-card').length>0,null,{timeout:20000});
const t0=Date.now();
await p.locator('#habitat-grid .habitat-card:not(.locked)').first().click();
// sample the wild sprite from the instant the battle screen exists
const seen=new Set();
for (let i=0;i<70;i++){
  const s = await p.evaluate(()=>{
    const bc=document.getElementById('battle-container');
    const w=document.getElementById('wild-sprite'), pl=document.getElementById('player-sprite');
    const cs=e=>e?{f:getComputedStyle(e).filter,o:+getComputedStyle(e).opacity,cls:e.className,nw:e.naturalWidth,vis:getComputedStyle(e).visibility}:null;
    return {active:bc?.classList.contains('active'),w:cs(w),p:cs(pl),
      log:(document.getElementById('battle-log')?.innerText||'').trim().slice(0,40)};
  });
  const dt=Date.now()-t0;
  if (s.active){
    const key=`${s.w?.f}|${s.w?.o.toFixed(2)}|${s.w?.cls}|${s.w?.nw}`;
    if(!seen.has(key)){ seen.add(key); console.log(`+${dt}ms WILD filter=${s.w?.f} op=${s.w?.o.toFixed(2)} cls="${s.w?.cls}" natW=${s.w?.nw} log="${s.log}"`);
      await p.screenshot({path:OUT+`wild-${String(dt).padStart(5,'0')}ms.png`}); }
  }
  await p.waitForTimeout(140);
}
console.log('--- player sprite state ---');
console.log(JSON.stringify(await p.evaluate(()=>{const e=document.getElementById('player-sprite');return{f:getComputedStyle(e).filter,o:getComputedStyle(e).opacity,cls:e.className,nw:e.naturalWidth};})));
await b.close();
