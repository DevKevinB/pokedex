import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decode, stats } from './_png.mjs';
const HERE = new URL('.', import.meta.url).pathname;
const OUT = join(HERE, 'chase'); mkdirSync(OUT, { recursive: true });
const BASE='http://127.0.0.1:8321'; const DSF=2;
const JUNIOR = process.env.MODE==='junior';
const SEED = { version:2, players:{
  1:{ name:JUNIOR?'ART':'GABE', caught:[1,4,6,25,74,95,133], team:[6,25,1,4,74,95],
      mons:Object.fromEntries([1,4,6,25,74,95,133].map(id=>[id,{level:60,xp:30}])),
      badges:[], shinies:[], nicks:{}, items:{masterBalls:3}, quests:{}, gyms:{beaten:{}},
      settings:{junior:JUNIOR}, champion:null, stats:{catches:7,battlesWon:3,battlesLost:0,versusWins:0}},
  2:{ name:'P2', caught:[1], team:[1], mons:{1:{level:5,xp:0}}, badges:[], shinies:[], nicks:{},
      items:{masterBalls:1}, quests:{}, gyms:{beaten:{}}, settings:{junior:false}, champion:null,
      stats:{catches:1,battlesWon:0,battlesLost:0,versusWins:0}} } };
const probe = `() => {
  const g = id => document.getElementById(id);
  const info = el => { if(!el) return null; const cs=getComputedStyle(el); const r=el.getBoundingClientRect();
    return {cls:el.className, filter:cs.filter, opacity:cs.opacity, anim:cs.animationName,
            src:(el.getAttribute('src')||'').split('/').slice(-3).join('/'), nw:el.naturalWidth,
            rect:{x:r.x,y:r.y,w:r.width,h:r.height}}; };
  return { wild: info(g('wild-sprite')), player: info(g('player-sprite')),
    wname:(g('wild-name')?.innerText||'').replace(/\\n/g,' ').trim(),
    pname:(g('player-name')?.innerText||'').replace(/\\n/g,' ').trim(),
    log:(g('battle-log')?.innerText||'').trim().slice(0,44) };
}`;
function crop(png,rect){const x0=Math.max(0,Math.floor(rect.x*DSF)),y0=Math.max(0,Math.floor(rect.y*DSF));
  const w=Math.min(png.w-x0,Math.ceil(rect.w*DSF)),h=Math.min(png.h-y0,Math.ceil(rect.h*DSF));
  if(w<=0||h<=0) return {w:1,h:1,ch:png.ch,ct:png.ct,pal:png.pal,data:Buffer.alloc(png.ch)};
  const ch=png.ch,out=Buffer.alloc(w*h*ch);
  for(let y=0;y<h;y++) png.data.copy(out,y*w*ch,((y0+y)*png.w+x0)*ch,((y0+y)*png.w+x0+w)*ch);
  return {w,h,ch,ct:png.ct,pal:png.pal,data:out};}
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',deviceScaleFactor:DSF});
await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
const page=await ctx.newPage();
page.on('pageerror',e=>console.log('PAGEERROR',e.message));
await page.addInitScript(s=>{try{localStorage.setItem('pokedexos_save_v2',JSON.stringify(s));
  localStorage.setItem('pokedexos_lastplayer','1');localStorage.setItem('pokedexos_muted','1');}catch(e){}},SEED);
await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(1100);
await page.evaluate(()=>document.getElementById('boot-screen')?.click());
await page.waitForTimeout(700);
await page.evaluate(()=>document.getElementById('whoplaying-modal')?.remove());
await page.waitForTimeout(1000);
let n=0;
const sample=async tag=>{
  const p=await page.evaluate(new Function('return '+probe)());
  const buf=await page.screenshot(); const png=decode(buf);
  const ws=p.wild?stats(crop(png,p.wild.rect)):null, ps=p.player?stats(crop(png,p.player.rect)):null;
  const f=join(OUT,`g${String(++n).padStart(2,'0')}-${tag}.png`); writeFileSync(f,buf);
  console.log(`${String(n).padStart(2)} ${tag.padEnd(18)} | W ${String(p.wname).padEnd(22)} sat=${ws&&ws.meanSat} cls="${p.wild&&p.wild.cls}" f=${(p.wild&&p.wild.filter||'').slice(0,26)} | P ${String(p.pname).padEnd(20)} sat=${ps&&ps.meanSat} cls="${p.player&&p.player.cls}" | ${p.log}`);
};
await page.click('#gyms-btn');
await page.waitForFunction(()=>document.querySelectorAll('#gym-body .gym-card').length>0,null,{timeout:20000});
await page.locator('#gym-body .gym-card').first().click();
await page.waitForTimeout(1500);
await page.screenshot({path:join(OUT,'gym-trainer-list.png')});
await page.locator('.trainer-card:not(.locked)').first().click();
await page.waitForTimeout(1200);
const ok=page.locator('#dlg-ok'); if(await ok.isVisible().catch(()=>false)) await ok.click();
await page.waitForFunction(()=>document.getElementById('battle-container')?.classList.contains('active'),null,{timeout:25000});
await page.waitForTimeout(1400);
await sample('enemy1-appears');
for(let t=0;t<14;t++){
  const tiles=page.locator('.move-btn.type-tile:not([disabled])');
  if(!(await tiles.count())) break;
  await tiles.first().click();
  await page.waitForTimeout(2000);
  await sample('after-turn'+(t+1));
  if(await page.locator('#victory-modal').isVisible().catch(()=>false)){ await sample('victory'); break; }
}
await page.screenshot({path:join(OUT,'gym-end.png')});
await browser.close();
