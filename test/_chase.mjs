import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decode, stats } from './_png.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const OUT = join(HERE, 'chase'); mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:8321';
const JUNIOR = process.env.MODE === 'junior';

const SEED = {
  version: 2,
  players: {
    1: { name: JUNIOR?'ART':'GABE', caught: [1,4,6,25,74,95,133], team: [6,25,1,4,74,95],
      mons: Object.fromEntries([1,4,6,25,74,95,133].map(id=>[id,{level:14,xp:30}])),
      badges: [], shinies: [], nicks: {}, items: { masterBalls: 3 },
      quests: {}, gyms: { beaten: {} }, settings: { junior: JUNIOR }, champion: null,
      stats: { catches:7, battlesWon:3, battlesLost:0, versusWins:0 } },
    2: { name:'P2', caught:[1], team:[1], mons:{1:{level:5,xp:0}}, badges:[], shinies:[], nicks:{},
      items:{masterBalls:1}, quests:{}, gyms:{beaten:{}}, settings:{junior:false}, champion:null,
      stats:{catches:1,battlesWon:0,battlesLost:0,versusWins:0} },
  },
};

const probe = `() => {
  const el = document.getElementById('wild-sprite');
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { cls: el.className, filter: cs.filter, opacity: cs.opacity, transform: cs.transform,
           anim: cs.animationName, visibility: cs.visibility,
           src: el.getAttribute('src'), curSrc: el.currentSrc,
           nw: el.naturalWidth, nh: el.naturalHeight, complete: el.complete,
           parentFilter: getComputedStyle(el.parentElement).filter,
           rect: (r=>({x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}))(el.getBoundingClientRect()),
           log: (document.getElementById('battle-log')?.innerText||'').trim().slice(0,50) };
}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport:{width:390,height:844}, serviceWorkers:'block', deviceScaleFactor:2 });
await ctx.route('https://fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
const netLog = [];
ctx.on('response', r => { const u=r.url(); if (/githubusercontent|pokeapi/.test(u)) netLog.push(r.status()+' '+u); });
const page = await ctx.newPage();
page.on('pageerror', e=>console.log('PAGEERROR', e.message));
await page.addInitScript(s=>{ try{ localStorage.setItem('pokedexos_save_v2', JSON.stringify(s));
  localStorage.setItem('pokedexos_lastplayer','1'); localStorage.setItem('pokedexos_muted','1'); }catch(e){} }, SEED);
await page.goto(BASE + '/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1200);
await page.evaluate(()=>document.getElementById('boot-screen')?.click());
await page.waitForTimeout(800);
await page.evaluate(()=>document.getElementById('whoplaying-modal')?.remove());
await page.waitForTimeout(1200);

const shot = async (tag) => {
  try { const b = await page.locator('#wild-sprite').screenshot({ timeout: 5000, animations: 'allow', caret: 'initial' });
    writeFileSync(join(OUT, tag + '.png'), b);
    const s = stats(decode(b)); return s; } catch(e){ return {err:e.message.split('\n')[0]}; }
};

const results = [];
for (let battle = 0; battle < 3; battle++) {
  // get to a habitat battle
  await page.click('#explore-btn');
  await page.waitForFunction(()=>document.querySelectorAll('#habitat-grid .habitat-card:not(.locked)').length>0, null, {timeout:20000});
  console.log('\n=== BATTLE '+battle+' ===');
  await page.locator('#habitat-grid .habitat-card:not(.locked)').nth(battle % 3).click();
  await page.waitForFunction(()=>document.getElementById('battle-container')?.classList.contains('active'), null, {timeout:30000});
  const t0 = Date.now();
  const series = [];
  for (let i=0;i<26;i++) {
    const p = await page.evaluate(new Function('return '+probe)());
    const ms = Date.now()-t0;
    let s = null;
    if ([0,1,2,4,8,16,25].includes(i)) s = await shot(`b${battle}-appear-${String(i).padStart(2,'0')}`);
    series.push({ ms, ...p, px: s });
    console.log(`  A ${String(ms).padStart(5)}ms cls="${p&&p.cls}" filter=${p&&p.filter} op=${p&&p.opacity} anim=${p&&p.anim} nw=${p&&p.nw} px=${s?JSON.stringify(s):''}`);
    await page.waitForTimeout(150);
  }
  await page.screenshot({ path: join(OUT, `b${battle}-full-appear.png`) });
  // attack
  const tiles = page.locator('.move-btn.type-tile:not([disabled])');
  const after = [];
  if (await tiles.count()) {
    await tiles.first().click();
    const t1 = Date.now();
    for (let i=0;i<20;i++) {
      const p = await page.evaluate(new Function('return '+probe)());
      let s=null; if ([0,2,5,10,19].includes(i)) s = await shot(`b${battle}-hit-${String(i).padStart(2,'0')}`);
      after.push({ ms: Date.now()-t1, ...p, px: s });
      console.log(`  H ${String(Date.now()-t1).padStart(5)}ms cls="${p&&p.cls}" filter=${p&&p.filter} op=${p&&p.opacity} anim=${p&&p.anim} nw=${p&&p.nw} px=${s?JSON.stringify(s):''}`);
      await page.waitForTimeout(200);
    }
  }
  await page.screenshot({ path: join(OUT, `b${battle}-full-afterhit.png`) });
  results.push({ battle, series, after });
  // finish/flee out of battle: mash attack until victory or run back
  for (let k=0;k<10;k++){
    if (await page.locator('#victory-modal').isVisible().catch(()=>false)) break;
    const t = page.locator('.move-btn.type-tile:not([disabled])');
    if (await t.count()) { await t.first().click().catch(()=>{}); await page.waitForTimeout(1500); }
    else await page.waitForTimeout(600);
  }
  await page.screenshot({ path: join(OUT, `b${battle}-full-end.png`) });
  // dismiss whatever modal, return to dex
  await page.evaluate(()=>{ document.querySelectorAll('#victory-modal button, #dlg-ok, .modal-close, #badge-modal button, #sticker-modal button, .overlay-screen button').forEach(b=>b.click&&b.click()); });
  await page.waitForTimeout(900);
  await page.evaluate(()=>{ document.querySelectorAll('.overlay-screen').forEach(o=>{ if(o.id!=='battle-container') o.classList.remove('active','visible'); o.style.display='none'; }); });
  await page.waitForTimeout(1500);
  await page.evaluate(()=>{ document.getElementById('battle-back-btn')?.click(); document.getElementById('explore-back-btn')?.click(); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, `b${battle}-full-back.png`) });
}
writeFileSync(join(OUT,'chase.json'), JSON.stringify({results, netLog}, null, 1));
for (const r of results) {
  console.log(`\n=== SUMMARY BATTLE ${r.battle} appear ===`);
  for (const s of r.series) if (s) console.log(`  ${String(s.ms).padStart(5)}ms cls="${s.cls}" filter=${s.filter} op=${s.opacity} anim=${s.anim} nw=${s.nw} sat=${s.px?JSON.stringify(s.px):''} src=${String(s.src).slice(-34)}`);
  console.log(`--- after hit ---`);
  for (const s of r.after) if (s) console.log(`  ${String(s.ms).padStart(5)}ms cls="${s.cls}" filter=${s.filter} op=${s.opacity} anim=${s.anim} nw=${s.nw} sat=${s.px?JSON.stringify(s.px):''}`);
}
console.log('\nNET:'); netLog.slice(0,40).forEach(l=>console.log(' ',l));
await browser.close();
