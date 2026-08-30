import { chromium } from 'playwright';
const BASE='http://127.0.0.1:8321';
const OUT='/tmp/claude-1000/-home-kevin-pokedex/c02990b7-8698-403c-8544-c2332c13aa8b/scratchpad/';
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
p.on('pageerror',e=>console.log('PAGEERROR',e.message));
await p.addInitScript(s=>{localStorage.setItem('pokedexos_save_v2',JSON.stringify(s));localStorage.setItem('pokedexos_lastplayer','1');localStorage.setItem('pokedexos_muted','1');},SEED);
await p.goto(BASE+'/?fast=1',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(1200);
await p.evaluate(()=>document.getElementById('boot-screen')?.click());
await p.waitForTimeout(700);
await p.evaluate(()=>document.getElementById('whoplaying-modal')?.remove());
await p.waitForTimeout(1500);
const snap = () => p.evaluate(()=>{
  const sp=document.getElementById('poke-sprite');
  return {id:document.getElementById('id-text').innerText, name:document.getElementById('poke-name').innerText,
    src:(sp.src.match(/(\d+)\.(gif|png)/)||[])[1], op:getComputedStyle(sp).opacity, filt:getComputedStyle(sp).filter,
    types:document.getElementById('types').innerText};
});
console.log('start', JSON.stringify(await snap()));
for (let i=1;i<=3;i++){
  await p.click('#nav-next');
  for (const t of [100,300,700,1200]) { await p.waitForTimeout(t===100?100:(t===300?200:(t===700?400:500)));
    console.log(`click${i} @${t}ms`, JSON.stringify(await snap())); }
}
await p.screenshot({path:OUT+'dexmismatch.png'});
console.log('final', JSON.stringify(await snap()));
await b.close();
