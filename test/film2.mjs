import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const BASE='http://127.0.0.1:8321';
const HERE=new URL('.',import.meta.url).pathname;
const MODE=process.env.MODE==='junior'?'junior':'normal';
const OUT=join(HERE,'film',process.env.TAG||'y'); mkdirSync(OUT,{recursive:true});
const SEED = junior => ({version:2,players:{
 1:{name:junior?'ART':'GABE',caught:[1,4,6,25,74,95,133],team:[6,25,1,4,74,95],
   mons:Object.fromEntries([1,4,6,25,74,95,133].map(id=>[id,{level:14,xp:30}])),
   badges:[],shinies:[],nicks:{},items:{masterBalls:3},quests:{winBattle:true,catchOne:true,exploreOne:true},gyms:{beaten:{}},
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
const probe=`() => {
 const vis=el=>{if(!el)return false;const r=el.getBoundingClientRect();const s=getComputedStyle(el);
  return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity>0.02;};
 const bc=document.getElementById('battle-container');
 return {battleActive:bc?.classList.contains('active'), bcT:bc?getComputedStyle(bc).transform:null,
  visibleOverlays:[...document.querySelectorAll('body > div, body > section')].filter(vis).map(e=>e.id||e.className).slice(0,14),
  topEl:(()=>{const e=document.elementFromPoint(195,60);return e?(e.id||e.className||e.tagName):null;})(),
  bodyBg:getComputedStyle(document.body).backgroundColor};
}`;
let n=0;
const shot=async(l)=>{n++;const f=`${String(n).padStart(3,'0')}-${l}.png`;await page.screenshot({path:join(OUT,f)});
 const p=await page.evaluate(new Function('return '+probe)());console.log(f,JSON.stringify(p));};
try{
 await page.click('#explore-btn');
 await page.waitForFunction(()=>document.querySelectorAll('#habitat-grid .habitat-card').length>0,null,{timeout:20000});
 await page.waitForTimeout(500);
 await page.locator('#habitat-grid .habitat-card:not(.locked)').first().click();
 await page.waitForFunction(()=>document.getElementById('battle-container')?.classList.contains('active'),null,{timeout:25000});
 await page.waitForTimeout(2000);
 // hammer attacks until victory modal
 for(let i=0;i<10;i++){
   const t=page.locator('.move-btn.type-tile:not([disabled])');
   if(!(await t.count())) break;
   await t.first().click().catch(()=>{});
   await page.waitForTimeout(3500);
   const anyModal = await page.evaluate(()=>['victory-modal','badge-modal','nick-modal','sticker-modal'].some(id=>{
     const e=document.getElementById(id); if(!e) return false; const r=e.getBoundingClientRect();
     return r.width>0 && getComputedStyle(e).display!=='none' && +getComputedStyle(e).opacity>0.02;}));
   if(anyModal) break;
 }
 await page.waitForFunction(()=>['victory-modal','badge-modal','nick-modal','sticker-modal'].some(id=>{
     const e=document.getElementById(id); if(!e) return false; const r=e.getBoundingClientRect();
     return r.width>0 && getComputedStyle(e).display!=='none' && +getComputedStyle(e).opacity>0.02;}),null,{timeout:30000}).catch(()=>console.log('no modal ever'));
 await page.waitForTimeout(600);
 await shot('after-fight');
 // step through every modal
 for(let i=0;i<8;i++){
   const btns = await page.locator('button:visible').evaluateAll(els=>els.map(e=>({id:e.id,t:e.textContent.trim().slice(0,20)})));
   console.log('  buttons:',JSON.stringify(btns));
   const b = page.locator('#badge-ok:visible, #victory-continue:visible, #nick-skip:visible, #dlg-ok:visible').first();
   if(!(await b.count())) break;
   const bid = await b.getAttribute('id'); console.log('  clicking', bid);
   await b.click({force:true}).catch(e=>console.log('  clickfail',e.message.split('\n')[0]));
   await page.waitForTimeout(300); await shot(`modal-step-${i}-t300`);
   await page.waitForTimeout(900); await shot(`modal-step-${i}-t1200`);
 }
}catch(e){console.log('ABORT '+e.message.split('\n')[0]);}
console.log('ERRORS:',errs.slice(0,10));
await browser.close();
