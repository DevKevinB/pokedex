// throwaway: high-frequency filmstrip of animations at REAL speed
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const BASE='http://127.0.0.1:8321';
const HERE=new URL('.',import.meta.url).pathname;
const MODE=process.env.MODE==='junior'?'junior':'normal';
const OUT=join(HERE,'film',process.env.TAG||'x'); mkdirSync(OUT,{recursive:true});
const SEED = junior => ({version:2,players:{
 1:{name:junior?'ART':'GABE',caught:[1,4,6,25,74,95,133],team:[6,25,1,4,74,95],
   mons:Object.fromEntries([1,4,6,25,74,95,133].map(id=>[id,{level:14,xp:30}])),
   badges:[],shinies:[],nicks:{},items:{masterBalls:3},quests:{},gyms:{beaten:{}},
   settings:{junior},champion:null,stats:{catches:7,battlesWon:3,battlesLost:0,versusWins:0}},
 2:{name:'P2',caught:[1],team:[1],mons:{1:{level:5,xp:0}},badges:[],shinies:[],nicks:{},
   items:{masterBalls:1},quests:{},gyms:{beaten:{}},settings:{junior:false},champion:null,
   stats:{catches:1,battlesWon:0,battlesLost:0,versusWins:0}}}});

const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',deviceScaleFactor:1});
await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
const page=await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
page.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text().slice(0,160));});
await page.addInitScript(save=>{try{localStorage.setItem('pokedexos_save_v2',JSON.stringify(save));
 localStorage.setItem('pokedexos_lastplayer','1');localStorage.setItem('pokedexos_muted','1');}catch(e){}},SEED(MODE==='junior'));
await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(1200);
await page.evaluate(()=>document.getElementById('boot-screen')?.click());
await page.waitForTimeout(700);
await page.evaluate(()=>document.getElementById('whoplaying-modal')?.remove());
await page.waitForTimeout(1200);

const probe = `() => {
  const g = id => document.getElementById(id);
  const s = el => el ? getComputedStyle(el) : null;
  const info = id => { const el=g(id); if(!el) return null; const c=s(el); const r=el.getBoundingClientRect();
    return {cls:el.className, filter:c.filter, opacity:c.opacity, transform:c.transform,
      anim:c.animationName, src:String(el.src||'').split('/').pop(), rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]};};
  return { wild:info('wild-sprite'), player:info('player-sprite'),
    log:(g('battle-log')?.innerText||'').trim(),
    wildBar:g('wild-hp-bar')?.style.width, wildGhost:g('wild-hp-ghost')?.style.width,
    plBar:g('player-hp-bar')?.style.width, plGhost:g('player-hp-ghost')?.style.width,
    plHpText:(g('player-hp-text')?.innerText||'').trim(),
    title:(g('battle-title')?.innerText||'').trim(),
    fx:[...document.querySelectorAll('.fx-float,.dmg-float,[class*=float]')].map(e=>e.className+':'+e.textContent.trim()).slice(0,4),
  };
}`;
let n=0;
const film = async (label, ms, every=120) => {
  const t0=Date.now(); const frames=[];
  while(Date.now()-t0 < ms){
    n++;
    const p=join(OUT,`${String(n).padStart(3,'0')}-${label}-${String(Date.now()-t0).padStart(4,'0')}ms.png`);
    await page.screenshot({path:p});
    frames.push({t:Date.now()-t0, file:p.split('/').pop(), ...await page.evaluate(new Function('return '+probe)())});
    await page.waitForTimeout(every);
  }
  writeFileSync(join(OUT,label+'.json'),JSON.stringify(frames,null,1));
  console.log('--- '+label);
  for(const f of frames) console.log(f.t+'ms w='+JSON.stringify(f.wild)+' bar='+f.wildBar+'/'+f.wildGhost+' plbar='+f.plBar+'/'+f.plGhost+' hp='+f.plHpText+' log="'+f.log+'"');
};
globalThis.film=film; globalThis.page=page;

const script = process.env.WHAT||'battle';
try{
if(script==='battle'){
  await page.click('#explore-btn');
  await page.waitForFunction(()=>document.querySelectorAll('#habitat-grid .habitat-card').length>0,null,{timeout:20000});
  await page.waitForTimeout(600);
  const card = page.locator('#habitat-grid .habitat-card:not(.locked)').first();
  await card.click();
  await film('intro', 4200, 130);        // transition + wild appears
  const tiles=page.locator('.move-btn.type-tile:not([disabled])');
  await tiles.first().click();
  await film('attack1', 6500, 150);
  await tiles.first().click().catch(()=>{});
  await film('attack2', 6500, 150);
}
if(script==='catch'){
  await page.click('#explore-btn');
  await page.waitForFunction(()=>document.querySelectorAll('#habitat-grid .habitat-card').length>0,null,{timeout:20000});
  await page.locator('#habitat-grid .habitat-card:not(.locked)').first().click();
  await page.waitForFunction(()=>document.getElementById('battle-container')?.classList.contains('active'),null,{timeout:25000});
  await page.waitForTimeout(2500);
  await page.click('#ball-btn'); await page.waitForTimeout(500);
  await page.screenshot({path:join(OUT,'000-ballpick.png')});
  await page.locator('.ball-opt,.ballpick-opt,[data-ball]').first().click();
  await film('throw', 12000, 160);
}
if(script==='dexcatch'){
  await page.click('#nav-next'); await page.waitForTimeout(1500);
  await page.click('#catch-btn'); await page.waitForTimeout(900);
  await page.screenshot({path:join(OUT,'000-drawer.png')});
  await page.locator('.ball-opt').first().click();
  await film('dexthrow', 9000, 140);
}
}catch(e){console.log('ABORT '+e.message.split('\n')[0]);}
console.log('ERRORS:', errs.slice(0,12));
await browser.close();
