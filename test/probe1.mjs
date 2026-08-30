import { chromium } from 'playwright';
const BASE='http://127.0.0.1:8321';
const SEED = junior => ({version:2,players:{
 1:{name:junior?'ART':'GABE',caught:[1,4,6,25,74,95,133],team:[6,25,1,4,74,95],
    mons:Object.fromEntries([1,4,6,25,74,95,133].map(id=>[id,{level:14,xp:30}])),
    badges:[],shinies:[],nicks:{},items:{masterBalls:3},quests:{},gyms:{beaten:{}},
    settings:{junior},champion:null,stats:{catches:7,battlesWon:3,battlesLost:0,versusWins:0}},
 2:{name:'P2',caught:[1],team:[1],mons:{1:{level:5,xp:0}},badges:[],shinies:[],nicks:{},
    items:{masterBalls:1},quests:{},gyms:{beaten:{}},settings:{junior:false},champion:null,
    stats:{catches:1,battlesWon:0,battlesLost:0,versusWins:0}}}});
const b = await chromium.launch();
const ctx = await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block',deviceScaleFactor:2});
await ctx.route('https://fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
const p = await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR',e.message));
await p.addInitScript(s=>{localStorage.setItem('pokedexos_save_v2',JSON.stringify(s));localStorage.setItem('pokedexos_lastplayer','1');localStorage.setItem('pokedexos_muted','1');},SEED(true));
await p.goto(BASE+'/?fast=1',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(1200);
await p.evaluate(()=>document.getElementById('boot-screen')?.click());
await p.waitForTimeout(700);
await p.evaluate(()=>document.getElementById('whoplaying-modal')?.remove());
await p.waitForTimeout(1500);

// ---- PROBE A: dex name vs sprite src after fast flicking
const snap = () => p.evaluate(()=>({
  num: document.getElementById('poke-number')?.textContent,
  name: document.getElementById('poke-name')?.textContent,
  src: document.getElementById('poke-sprite')?.src,
  types: document.getElementById('poke-types')?.textContent,
}));
console.log('A0', JSON.stringify(await snap()));
for (let i=0;i<3;i++){ await p.click('#nav-next'); await p.waitForTimeout(700); }
console.log('A3 (after 3 slow next)', JSON.stringify(await snap()));
// fast flick
for (let i=0;i<6;i++){ await p.click('#nav-next'); await p.waitForTimeout(90); }
await p.waitForTimeout(1500);
console.log('A-fast (after 6 fast next + settle)', JSON.stringify(await snap()));

// ---- PROBE B: PC team row
await p.click('#pc-btn'); await p.waitForTimeout(2000);
console.log('B team', JSON.stringify(await p.evaluate(()=>{
  const row=document.querySelector('#pc-team, .pc-team, #pc-team-row');
  const cells=document.querySelectorAll('.team-slot, .pc-team .team-mon, #pc-team > *');
  return {rowId: row?.id, rowClass: row?.className, rowHTMLlen: row?.innerHTML.length,
    cellCount: cells.length,
    text: row? row.innerText.replace(/\n/g,'|').slice(0,200):null,
    scrollW: row?.scrollWidth, clientW: row?.clientWidth};
})));
await p.evaluate(()=>document.getElementById('close-pc-btn')?.click());
await p.waitForTimeout(600);
await b.close();
