// THROWAWAY driver #3 — versus mode, trainer card scroll, name round-trip,
// v1-import aftermath. Delete after use.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://127.0.0.1:8321';
const HERE = new URL('.', import.meta.url).pathname;
const OUT = join(HERE, 'kevin3');
mkdirSync(OUT, { recursive: true });
const SPRITE = readFileSync(join(HERE, 'fake-sprite.png'));
const REAL = process.env.REAL === '1';
const W = parseInt(process.env.W || '390'), H = parseInt(process.env.H || '844');
const MODE = process.env.MODE || 'normal';
const ONLY = process.env.ONLY || '';

const SEED = junior => ({
  version: 2,
  players: {
    1: { name: 'GABE', caught: [1, 4, 6, 25, 74, 95, 133], team: [6, 25, 1],
      mons: Object.fromEntries([1, 4, 6, 25, 74, 95, 133].map(id => [id, { level: 12, xp: 30 }])),
      badges: ['boulder'], shinies: [], nicks: {}, items: { masterBalls: 3 }, quests: {},
      gyms: { beaten: {} }, settings: { junior }, champion: null,
      stats: { catches: 7, battlesWon: 3, battlesLost: 0, versusWins: 0 } },
    2: { name: 'ART', caught: [1, 4, 25, 133], team: [25, 4, 133],
      mons: { 1: { level: 5, xp: 0 }, 4: { level: 40, xp: 0 }, 25: { level: 40, xp: 0 }, 133: { level: 40, xp: 0 } },
      badges: [], shinies: [], nicks: {}, items: { masterBalls: 1 }, quests: {},
      gyms: { beaten: {} }, settings: { junior: true }, champion: null,
      stats: { catches: 4, battlesWon: 0, battlesLost: 0, versusWins: 0 } },
  },
});

async function mock(ctx) {
  await ctx.route('https://pokeapi.co/**', r => REAL ? r.continue() : r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.route('https://raw.githubusercontent.com/**', r => {
    if (r.request().url().endsWith('.ogg')) return r.fulfill({ status: 404, body: '' });
    return REAL ? r.continue() : r.fulfill({ status: 200, contentType: 'image/png', body: SPRITE });
  });
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, serviceWorkers: 'block', deviceScaleFactor: 2 });
await mock(ctx);
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push('CONSOLE: ' + m.text().slice(0, 200)); });
let seeding = true;
await page.addInitScript(save => {
  try {
    if (!localStorage.getItem('__seeded')) {
      localStorage.setItem('pokedexos_save_v2', JSON.stringify(save));
      localStorage.setItem('pokedexos_lastplayer', '1');
      localStorage.setItem('pokedexos_muted', '1');
      localStorage.setItem('pokedexos_devpin', '1234');
      localStorage.setItem('__seeded', '1');
    }
  } catch (e) {}
}, SEED(MODE === 'junior'));

let n = 0;
const shot = async label => {
  n++;
  const f = `${MODE}-${W}x${H}-${String(n).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.png`;
  await page.screenshot({ path: join(OUT, f) });
  console.log('  shot ' + f);
  return f;
};
const spriteFx = () => page.evaluate(() => {
  const out = {};
  for (const id of ['wild-sprite', 'player-sprite']) {
    const el = document.getElementById(id);
    if (!el) continue;
    const cs = getComputedStyle(el);
    out[id] = { cls: el.className, filter: cs.filter, transform: cs.transform, opacity: cs.opacity, src: String(el.src).slice(-24) };
  }
  return out;
});
const boot = async () => {
  await page.goto(`${BASE}/?fast=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.getElementById('boot-screen')?.click());
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById('whoplaying-modal')?.remove());
  await page.waitForTimeout(1400);
};

await boot();

// ================= 1. VERSUS MODE =================
if (!ONLY || ONLY === 'versus') {
  await page.click('#gyms-btn');
  await page.waitForSelector('#vs-btn', { timeout: 15000 });
  await shot('gym-screen-with-vs-button');
  await page.click('#vs-btn');
  await page.waitForFunction(() => document.getElementById('battle-container')?.classList.contains('active'), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot('versus-pass-gate');
  if (await page.locator('#pass-modal').isVisible().catch(()=>false)) { await page.click('#pass-ready'); await page.waitForTimeout(1500); }
  await shot('versus-start');
  console.log('VERSUS sprite fx at start:', JSON.stringify(await spriteFx()));
  console.log('VERSUS move buttons:', await page.evaluate(() =>
    [...document.querySelectorAll('#battle-moves button')].map(b => ({ cls: b.className, text: b.innerText.replace(/\n/g, '|') }))));

  for (let turn = 0; turn < 26; turn++) {
    const btns = page.locator('#battle-moves button[data-vmove]');
    const c = await btns.count();
    if (!c) break;
    await btns.first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1400);
    if (await page.locator('#pass-modal').isVisible().catch(()=>false)) { await page.click('#pass-ready'); await page.waitForTimeout(1200); }
    const fx = await spriteFx();
    const fainted = Object.entries(fx).filter(([, v]) => /fainted/.test(v.cls));
    if (fainted.length) {
      console.log(`VERSUS turn ${turn + 1}: FAINTED CLASS PRESENT ->`, JSON.stringify(fx));
      await shot(`versus-turn${turn + 1}-fainted-class`);
      // keep going a few turns: does the NEXT Pokemon inherit it?
      for (let k = 0; k < 4; k++) {
        const b2 = page.locator('#battle-moves button[data-vmove]');
        if (!(await b2.count())) break;
        await b2.first().click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(1500);
        if (await page.locator('#pass-modal').isVisible().catch(()=>false)) { await page.click('#pass-ready'); await page.waitForTimeout(1200); }
        const fx2 = await spriteFx();
        console.log(`  +${k + 1} turn later:`, JSON.stringify(fx2));
        await shot(`versus-after-faint-${k + 1}`);
      }
      break;
    }
    if (await page.locator('#victory-modal').isVisible().catch(() => false)) {
      console.log('VERSUS ended at turn', turn + 1, JSON.stringify(fx));
      await shot('versus-ended');
      break;
    }
  }
  console.log('final versus fx:', JSON.stringify(await spriteFx()));
  await shot('versus-final');
  await page.evaluate(() => document.getElementById('vs-quit-btn')?.click());
  await page.waitForTimeout(1200);
}

// ================= 2. TRAINER CARD, scrolled =================
if (!ONLY || ONLY === 'card') {
  await boot();
  await page.click('#card-btn'); await page.waitForTimeout(1400);
  await shot('card-top');
  const geom = await page.evaluate(() => {
    const box = document.querySelector('#card-modal .modal-box');
    return { scrollH: box.scrollHeight, clientH: box.clientHeight, canScroll: box.scrollHeight > box.clientHeight };
  });
  console.log('CARD box geometry:', JSON.stringify(geom));
  await page.evaluate(() => { const b = document.querySelector('#card-modal .modal-box'); b.scrollTop = b.scrollHeight; });
  await page.waitForTimeout(500);
  await shot('card-bottom');
  console.log('quests html:', (await page.locator('#card-quests').innerText()).replace(/\n/g, ' | '));
  console.log('stats html:', (await page.locator('#card-stats').innerText()).replace(/\n/g, ' | '));
  const covered = await page.evaluate(() => {
    const res = [];
    for (const sel of ['#card-quests', '#card-stats', '#card-oak']) {
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + Math.min(10, r.height / 2);
      const top = document.elementFromPoint(cx, cy);
      res.push({ sel, y: Math.round(r.y), h: Math.round(r.height), topEl: top ? (top.id || top.className) : null });
    }
    return res;
  });
  console.log('CARD sections after scroll:', JSON.stringify(covered));
  await page.click('#card-close');
}

// ================= 3. NAME ROUND TRIP (no reseed) =================
if (!ONLY || ONLY === 'name') {
  await page.click('#settings-btn'); await page.waitForTimeout(500);
  await page.fill('#set-p1-name', "GABE'S");
  await page.click('#settings-close'); await page.waitForTimeout(500);
  console.log('typed name -> save:', await page.evaluate(async () => (await import('./js/state.js')).state.save.players[1].name));
  console.log('typed name -> header:', await page.locator('#player-btn').innerText());
  await shot('name-typed');
  for (let i = 1; i <= 3; i++) {
    await boot();
    console.log(`reload ${i}: save=${JSON.stringify(await page.evaluate(async () => (await import('./js/state.js')).state.save.players[1].name))} header=${JSON.stringify(await page.locator('#player-btn').innerText())}`);
    await shot(`name-reload-${i}`);
  }
  await page.click('#settings-btn'); await page.waitForTimeout(400);
  await shot('name-settings-after-reloads');
  console.log('settings field:', JSON.stringify(await page.locator('#set-p1-name').inputValue()));
  await page.click('#card-btn').catch(() => {});
  await page.waitForTimeout(300);
  await page.click('#settings-close').catch(() => {});
  await page.waitForTimeout(300);
  await page.click('#card-btn'); await page.waitForTimeout(900);
  await shot('name-on-card');
  console.log('card title:', await page.locator('#card-title').innerText());
  await page.click('#card-close');
}

// ================= 4. v1 IMPORT then try to fight =================
if (!ONLY || ONLY === 'v1') {
  await page.evaluate(async () => {
    const m = await import('./js/state.js');
    m.importCode(btoa(JSON.stringify({ p1: [1, 4, 7] })));
  });
  console.log('after v1 import:', await page.evaluate(async () => {
    const m = await import('./js/state.js');
    const p = m.state.save.players[1];
    return { caught: p.caught, team: p.team };
  }));
  await page.click('#battle-btn').catch(() => {});
  await page.waitForTimeout(4000);
  await shot('v1-then-battle');
  console.log('screen after BTL:', await page.evaluate(() => ({
    battle: document.getElementById('battle-container')?.classList.contains('active'),
    dlg: document.getElementById('dlg-modal')?.style.display,
    dlgTitle: document.getElementById('dlg-title')?.innerText,
    dlgText: document.getElementById('dlg-text')?.innerText,
    playerName: document.getElementById('player-name')?.innerText,
  })));
  console.log('errors so far:', errs.length, errs.slice(-3));
}

console.log('\nERRORS', errs.length); errs.slice(0, 20).forEach(e => console.log('  ', e));
await ctx.close(); await browser.close();
