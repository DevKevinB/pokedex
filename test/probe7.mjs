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
await p.addInitScript(s=>{localStorage.setItem('pokedexos_save_v2',JSON.stringify(s));localStorage.setItem('pokedexos_lastplayer','1');localStorage.setItem('pokedexos_muted','1');},SEED);
await p.goto(BASE+'/?fast=1',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(1200);
await p.evaluate(()=>document.getElementById('boot-screen')?.click());
await p.waitForTimeout(800);
await p.evaluate(()=>document.getElementById('whoplaying-modal')?.remove());
await p.waitForTimeout(1800);

// --- ART throws a ball on the DEX at an uncaught Pokemon (junior = always works)
await p.click('#nav-next'); await p.waitForTimeout(2200);   // 26 Raichu, uncaught
const before = await p.evaluate(()=>JSON.parse(localStorage.getItem('pokedexos_save_v2')).players[1].items.masterBalls);
await p.click('#catch-btn'); await p.waitForTimeout(900);
await p.screenshot({path:OUT+'dex-ball-drawer.png'});
console.log('DRAWER text:', JSON.stringify(await p.evaluate(()=>document.getElementById('ball-drawer')?.innerText.replace(/\n/g,' | '))));
await p.locator('.ball-opt').first().click(); 
for (const t of [400,900,1500,2200,3200,4500,6000]) {
  await p.waitForTimeout(t===400?400:500);
  await p.screenshot({path:OUT+`dex-catch-t${t}.png`});
  console.log(`catch +${t}ms`, JSON.stringify(await p.evaluate(()=>({
    msg:document.getElementById('dex-catch-msg')?.innerText, msgVis:getComputedStyle(document.getElementById('dex-catch-msg')).opacity,
    spriteOp:getComputedStyle(document.getElementById('poke-sprite')).opacity,
    modals:[...document.querySelectorAll('.overlay-screen,#nick-modal')].filter(e=>e.offsetParent!==null).map(e=>e.id),
    body:document.body.innerText.replace(/\n+/g,'|').slice(0,120)}))));
}
console.log('masterBalls before/after:', before, await p.evaluate(()=>JSON.parse(localStorage.getItem('pokedexos_save_v2')).players[1].items.masterBalls));
await b.close();
