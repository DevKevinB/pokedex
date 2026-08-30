import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decode, stats } from './_png.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const OUT = join(HERE, 'chase'); mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:8321';
const JUNIOR = process.env.MODE === 'junior';
const N = parseInt(process.env.N || '5');
const DSF = 2;

const SEED = {
  version: 2,
  players: {
    1: { name: JUNIOR?'ART':'GABE', caught: [1,4,6,25,74,95,133], team: [6,25,1,4,74,95],
      mons: Object.fromEntries([1,4,6,25,74,95,133].map(id=>[id,{level:40,xp:30}])),
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
  const r = el.getBoundingClientRect();
  return { cls: el.className, filter: cs.filter, opacity: cs.opacity, anim: cs.animationName,
           src: el.getAttribute('src')||'', nw: el.naturalWidth, nh: el.naturalHeight,
           name: (document.getElementById('wild-name')?.innerText||'').trim().replace(/\\n/g,' '),
           rect: {x:r.x,y:r.y,w:r.width,h:r.height},
           log: (document.getElementById('battle-log')?.innerText||'').trim().slice(0,40) };
}`;

function crop(png, rect) {
  const x0=Math.max(0,Math.floor(rect.x*DSF)), y0=Math.max(0,Math.floor(rect.y*DSF));
  const w=Math.min(png.w-x0,Math.ceil(rect.w*DSF)), h=Math.min(png.h-y0,Math.ceil(rect.h*DSF));
  const ch=png.ch, out=Buffer.alloc(w*h*ch);
  for(let y=0;y<h;y++) png.data.copy(out, y*w*ch, ((y0+y)*png.w+x0)*ch, ((y0+y)*png.w+x0+w)*ch);
  return { w,h,ch,ct:png.ct,pal:png.pal,data:out };
}

const browser = await chromium.launch();
const rows = [];
for (let i=0;i<N;i++) {
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, serviceWorkers:'block', deviceScaleFactor:DSF });
  await ctx.route('https://fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  const page = await ctx.newPage();
  page.on('pageerror', e=>console.log('PAGEERROR', e.message));
  await page.addInitScript(s=>{ try{ localStorage.setItem('pokedexos_save_v2', JSON.stringify(s));
    localStorage.setItem('pokedexos_lastplayer','1'); localStorage.setItem('pokedexos_muted','1'); }catch(e){} }, SEED);
  await page.goto(BASE+'/', {waitUntil:'domcontentloaded'});
  await page.waitForTimeout(1100);
  await page.evaluate(()=>document.getElementById('boot-screen')?.click());
  await page.waitForTimeout(700);
  await page.evaluate(()=>document.getElementById('whoplaying-modal')?.remove());
  await page.waitForTimeout(1000);
  await page.click('#explore-btn');
  await page.waitForFunction(()=>document.querySelectorAll('#habitat-grid .habitat-card:not(.locked)').length>0,null,{timeout:20000});
  const cards = await page.locator('#habitat-grid .habitat-card:not(.locked)').count();
  await page.locator('#habitat-grid .habitat-card:not(.locked)').nth(i % cards).click();
  await page.waitForFunction(()=>document.getElementById('battle-container')?.classList.contains('active'),null,{timeout:30000});

  const samples = [];
  const sample = async (tag) => {
    const p = await page.evaluate(new Function('return '+probe)());
    const buf = await page.screenshot();
    const png = decode(buf);
    const s = stats(crop(png, p.rect));
    writeFileSync(join(OUT, `r${i}-${tag}.png`), buf);
    samples.push({tag, ...p, px:s});
    console.log(`r${i} ${tag.padEnd(12)} ${p.name.padEnd(26)} sat=${String(s.meanSat).padEnd(7)} op=${p.opacity} filter=${p.filter.slice(0,40)} cls="${p.cls}" nw=${p.nw} src=${p.src.split('/').slice(-3).join('/')}`);
  };
  await sample('t0');
  await page.waitForTimeout(400); await sample('t400');
  await page.waitForTimeout(1000); await sample('t1400');
  await page.waitForTimeout(1500); await sample('t2900');
  const tiles = page.locator('.move-btn.type-tile:not([disabled])');
  if (await tiles.count()) {
    await tiles.first().click();
    await page.waitForTimeout(1200); await sample('hit+1200');
    await page.waitForTimeout(1800); await sample('hit+3000');
  }
  rows.push({run:i, samples});
  await ctx.close();
}
writeFileSync(join(OUT,'chase.json'), JSON.stringify(rows,null,1));
await browser.close();
