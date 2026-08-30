import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const HERE=new URL('.',import.meta.url).pathname, OUT=join(HERE,'chase'); mkdirSync(OUT,{recursive:true});
const BASE='http://127.0.0.1:8321';
const SEED={version:2,players:{
 1:{name:'GABE',caught:[1,4,6,25,74,95,133],team:[6,25,1,4,74,95],
    mons:Object.fromEntries([1,4,6,25,74,95,133].map(id=>[id,{level:14,xp:30}])),
    badges:[],shinies:[],nicks:{},items:{masterBalls:3},quests:{},gyms:{beaten:{}},
    settings:{junior:false},champion:null,stats:{catches:7,battlesWon:3,battlesLost:0,versusWins:0}},
 2:{name:'P2',caught:[1],team:[1],mons:{1:{level:5,xp:0}},badges:[],shinies:[],nicks:{},
    items:{masterBalls:1},quests:{},gyms:{beaten:{}},settings:{junior:false},champion:null,
    stats:{catches:1,battlesWon:0,battlesLost:0,versusWins:0}}}};
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',deviceScaleFactor:2});
await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
const page=await ctx.newPage();
const fails=[];
page.on('response',r=>{ if(r.status()>=400) fails.push(r.status()+' '+r.url()); });
page.on('requestfailed',r=>fails.push('FAIL '+r.url()));
await page.addInitScript(s=>{try{localStorage.setItem('pokedexos_save_v2',JSON.stringify(s));
 localStorage.setItem('pokedexos_lastplayer','1');localStorage.setItem('pokedexos_muted','1');}catch(e){}},SEED);
await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(1200);
await page.evaluate(()=>document.getElementById('boot-screen')?.click());
await page.waitForTimeout(700);
await page.evaluate(()=>document.getElementById('whoplaying-modal')?.remove());
await page.waitForTimeout(1500);
const P=`() => { const s=document.getElementById('poke-sprite'); const cs=getComputedStyle(s);
  return { name:document.getElementById('poke-name').innerText, id:document.getElementById('id-text').innerText,
    src:(s.getAttribute('src')||'').split('/').slice(-2).join('/'), nw:s.naturalWidth, complete:s.complete,
    op:cs.opacity, anim:cs.animationName }; }`;
for(let k=0;k<6;k++){
  await page.click('#nav-next');
  const t0=Date.now();
  for(let i=0;i<12;i++){
    const p=await page.evaluate(new Function('return '+P)());
    console.log(`nav${k} +${String(Date.now()-t0).padStart(4)}ms ${p.id} ${p.name.padEnd(12)} op=${p.op} nw=${p.nw} complete=${p.complete} src=${p.src}`);
    if(i===4||i===11) await page.screenshot({path:join(OUT,`dex-nav${k}-${i}.png`)});
    await page.waitForTimeout(150);
  }
  console.log('');
}
console.log('FAILED REQUESTS:'); fails.forEach(f=>console.log('  '+f));
await browser.close();
