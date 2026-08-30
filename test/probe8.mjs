import { chromium } from 'playwright';
const BASE='http://127.0.0.1:8321';
const OUT='/home/kevin/pokedex/test/playtest/art-probe/';
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
await p.addInitScript(s=>{localStorage.setItem('pokedexos_save_v2',JSON.stringify(s));localStorage.setItem('pokedexos_lastplayer','1');localStorage.setItem('pokedexos_muted','1');},SEED);
await p.goto(BASE+'/?fast=1',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(1200);
await p.evaluate(()=>document.getElementById('boot-screen')?.click());
await p.waitForTimeout(800);
await p.evaluate(()=>document.getElementById('whoplaying-modal')?.remove());
await p.waitForTimeout(1800);
await p.click('#nav-next'); await p.waitForTimeout(2500);
await p.click('#catch-btn'); await p.waitForTimeout(900);
await p.locator('.ball-opt').first().click();
const snap=()=>p.evaluate(()=>{const s=document.getElementById('poke-sprite');const r=s.getBoundingClientRect();
  return {cls:s.className,tr:getComputedStyle(s).transform,op:getComputedStyle(s).opacity,w:Math.round(r.width),h:Math.round(r.height),src:(s.src.match(/(\d+)\.(gif|png)|poke-ball/)||[])[0]};});
for (let i=0;i<20;i++){ await p.waitForTimeout(500); console.log(`+${(i+1)*500}ms`, JSON.stringify(await snap())); }
await p.screenshot({path:OUT+'dex-catch-t10s-after-gotcha.png'});
// dismiss quest modal and look again
await p.locator('button:has-text("AWESOME")').click({timeout:2000}).catch(()=>{});
await p.waitForTimeout(1500);
await p.screenshot({path:OUT+'dex-catch-after-dismiss.png'});
console.log('after dismiss', JSON.stringify(await snap()));
await b.close();
