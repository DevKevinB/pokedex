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
await p.addInitScript(s=>{localStorage.setItem('pokedexos_save_v2',JSON.stringify(s));localStorage.setItem('pokedexos_lastplayer','1');localStorage.setItem('pokedexos_muted','1');},SEED);
await p.goto(BASE+'/?fast=1',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(1200);
await p.evaluate(()=>document.getElementById('boot-screen')?.click());
await p.waitForTimeout(700);
await p.evaluate(()=>document.getElementById('whoplaying-modal')?.remove());
await p.waitForTimeout(2000);
// warm: go to 25.. then tap next repeatedly like a kid: 3 taps 600ms apart
for (let k=0;k<3;k++){
  const t0=Date.now();
  await p.click('#nav-next');
  for (let i=0;i<10;i++){
    await p.waitForTimeout(200);
    const s = await p.evaluate(()=>{const sp=document.getElementById('poke-sprite');
      return {id:document.getElementById('id-text').innerText,name:document.getElementById('poke-name').innerText,
        src:(sp.src.match(/(\d+)\.(gif|png)/)||[])[1],op:+getComputedStyle(sp).opacity, cw:sp.naturalWidth};});
    const dt=Date.now()-t0;
    console.log(`tap${k+1} +${dt}ms id=${s.id} name=${s.name} src=${s.src} op=${s.op.toFixed(2)} natW=${s.cw}`);
    if (k===2 && (dt>500 && dt<1600)) await p.screenshot({path:OUT+`dexlag-tap3-${dt}ms.png`});
  }
}
await b.close();
