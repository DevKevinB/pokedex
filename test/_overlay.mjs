import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decode, stats } from './_png.mjs';
const HERE=new URL('.',import.meta.url).pathname, OUT=join(HERE,'chase'); mkdirSync(OUT,{recursive:true});
const BASE='http://127.0.0.1:8321', DSF=2;
const SEED={version:2,players:{
 1:{name:'GABE',caught:[1,4,6,25,74,95,133],team:[6,25,1,4,74,95],
    mons:Object.fromEntries([1,4,6,25,74,95,133].map(id=>[id,{level:60,xp:30}])),
    badges:[],shinies:[],nicks:{},items:{masterBalls:3},quests:{},gyms:{beaten:{}},
    settings:{junior:false},champion:null,stats:{catches:7,battlesWon:3,battlesLost:0,versusWins:0}},
 2:{name:'P2',caught:[1],team:[1],mons:{1:{level:5,xp:0}},badges:[],shinies:[],nicks:{},
    items:{masterBalls:1},quests:{},gyms:{beaten:{}},settings:{junior:false},champion:null,
    stats:{catches:1,battlesWon:0,battlesLost:0,versusWins:0}}}};
const OVL=`() => {
  const out=[]; const W=innerWidth,H=innerHeight;
  for (const el of document.querySelectorAll('*')) {
    const cs=getComputedStyle(el); const r=el.getBoundingClientRect();
    if (r.width < W*0.6 || r.height < H*0.3) continue;
    if (cs.display==='none'||cs.visibility==='hidden') continue;
    const op=+cs.opacity;
    const bg=cs.backgroundColor, bi=cs.backgroundImage;
    const hasBg = (bg && bg!=='rgba(0, 0, 0, 0)') || (bi && bi!=='none');
    if (!hasBg && cs.filter==='none' && op===1) continue;
    out.push({tag:el.tagName, id:el.id, cls:String(el.className).slice(0,50), op, bg, bi:String(bi).slice(0,60),
              filter:cs.filter, z:cs.zIndex, pos:cs.position, mix:cs.mixBlendMode,
              r:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]});
  }
  // pseudo elements on the arena
  const ar=document.querySelector('.battle-arena');
  const af = ar? getComputedStyle(ar,'::after') : null;
  const bf = ar? getComputedStyle(ar,'::before') : null;
  return {out, arenaCls: ar?ar.className:null,
    after: af?{content:af.content,bg:af.backgroundColor,op:af.opacity,anim:af.animationName,z:af.zIndex,inset:af.inset}:null,
    before: bf?{content:bf.content,bg:bf.backgroundColor,bi:String(bf.backgroundImage).slice(0,80),op:bf.opacity,anim:bf.animationName,z:bf.zIndex}:null,
    bodyCls: document.body.className,
    log:(document.getElementById('battle-log')?.innerText||'').trim().slice(0,44)};
}`;
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',deviceScaleFactor:DSF});
await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
const page=await ctx.newPage();
await page.addInitScript(s=>{try{localStorage.setItem('pokedexos_save_v2',JSON.stringify(s));
 localStorage.setItem('pokedexos_lastplayer','1');localStorage.setItem('pokedexos_muted','1');}catch(e){}},SEED);
await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(1100);
await page.evaluate(()=>document.getElementById('boot-screen')?.click());
await page.waitForTimeout(700);
await page.evaluate(()=>document.getElementById('whoplaying-modal')?.remove());
await page.waitForTimeout(1000);
await page.click('#gyms-btn');
await page.waitForFunction(()=>document.querySelectorAll('#gym-body .gym-card').length>0,null,{timeout:20000});
await page.locator('#gym-body .gym-card').first().click();
await page.waitForTimeout(1500);
await page.locator('.trainer-card:not(.locked)').first().click();
await page.waitForTimeout(1000);
const ok=page.locator('#dlg-ok'); if(await ok.isVisible().catch(()=>false)) await ok.click();
await page.waitForFunction(()=>document.getElementById('battle-container')?.classList.contains('active'),null,{timeout:25000});
let n=0;
const t0=Date.now();
const tick=async()=>{
  const buf=await page.screenshot(); const png=decode(buf);
  const s=stats(png);
  const o=await page.evaluate(new Function('return '+OVL)());
  const f=`o${String(++n).padStart(3,'0')}`;
  writeFileSync(join(OUT,f+'.png'),buf);
  console.log(`${f} ${String(Date.now()-t0).padStart(6)}ms pageSat=${s.meanSat} arena="${o.arenaCls}" after{bg=${o.after&&o.after.bg} op=${o.after&&o.after.op} anim=${o.after&&o.after.anim}} log="${o.log}"`);
  for(const e of o.out) console.log(`     ${e.tag}#${e.id}.${e.cls} op=${e.op} z=${e.z} pos=${e.pos} bg=${e.bg} filter=${e.filter} bi=${e.bi} r=${e.r}`);
};
await page.waitForTimeout(1500);
await tick();
for(let t=0;t<3;t++){
  const tiles=page.locator('.move-btn.type-tile:not([disabled])');
  if(!(await tiles.count())) { await page.waitForTimeout(800); continue; }
  await tiles.first().click();
  for(let k=0;k<9;k++){ await page.waitForTimeout(350); await tick(); }
}
await browser.close();
