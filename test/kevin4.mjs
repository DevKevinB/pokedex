// THROWAWAY driver #4 — 375x667 parent screens + versus victory modal. Delete after use.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://127.0.0.1:8321';
const HERE = new URL('.', import.meta.url).pathname;
const OUT = join(HERE, 'kevin4');
mkdirSync(OUT, { recursive: true });
const SPRITE = readFileSync(join(HERE, 'fake-sprite.png'));
const REAL = process.env.REAL === '1';
const W = parseInt(process.env.W || '375'), H = parseInt(process.env.H || '667');
const MODE = process.env.MODE || 'normal';

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
await page.addInitScript(save => {
  try {
    localStorage.setItem('pokedexos_save_v2', JSON.stringify(save));
    localStorage.setItem('pokedexos_lastplayer', '1');
    localStorage.setItem('pokedexos_muted', '1');
    localStorage.setItem('pokedexos_devpin', '1234');
  } catch (e) {}
}, SEED(MODE === 'junior'));

let n = 0;
const shot = async label => {
  n++;
  const f = `${MODE}-${W}x${H}-${String(n).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.png`;
  await page.screenshot({ path: join(OUT, f) });
  console.log('  shot ' + f); return f;
};
const boot = async () => {
  await page.goto(`${BASE}/?fast=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.getElementById('boot-screen')?.click());
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById('whoplaying-modal')?.remove());
  await page.waitForTimeout(1400);
};
const typePin = async (pin = '1234') => { for (const d of pin) await page.click(`#pin-keys button[data-k="${d}"]`); await page.waitForTimeout(400); };

await boot();

// ---- settings + parent tools at 375x667 ----
await page.click('#settings-btn'); await page.waitForTimeout(600);
await shot('settings');
const offscreen = await page.evaluate(() => {
  const bad = [];
  for (const el of document.querySelectorAll('#settings-modal button, #settings-modal input')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1 || r.top < -1)
      bad.push({ id: el.id, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] });
  }
  return { bad, vw: innerWidth, vh: innerHeight };
});
console.log('SETTINGS off-screen controls at 375x667:', JSON.stringify(offscreen));
await page.evaluate(() => { const b = document.querySelector('#settings-modal .modal-box'); b.scrollTop = b.scrollHeight; });
await page.waitForTimeout(400);
await shot('settings-bottom');

await page.hover('#dev-open-btn'); await page.mouse.down(); await page.waitForTimeout(1500); await page.mouse.up();
await page.waitForTimeout(600);
if (await page.locator('#pin-modal').isVisible()) await typePin('1234');
await page.waitForTimeout(800);
await shot('parent-tools-375');
await page.evaluate(() => { const b = document.querySelector('#dev-modal .modal-box'); b.scrollTop = b.scrollHeight; });
await page.waitForTimeout(400);
await shot('parent-tools-375-bottom');
// add a Pokemon by name through the UI
await page.fill('#dev-add-name', 'squirtle');
await page.waitForTimeout(1200);
await shot('parent-tools-suggestions');
await page.click('#dev-add-btn'); await page.waitForTimeout(1500);
console.log('ADD status:', await page.locator('#dev-status').innerText(), '| count', await page.locator('#dev-count').innerText());
await shot('parent-tools-after-add');
// a bogus name
await page.fill('#dev-add-name', 'kevin');
await page.click('#dev-add-btn'); await page.waitForTimeout(2500);
console.log('BOGUS ADD status:', await page.locator('#dev-status').innerText());
await shot('parent-tools-bogus-name');
await page.click('#dev-close'); await page.waitForTimeout(700);
await shot('after-DONE-in-parent-tools');
console.log('after DONE, settings-modal display =', await page.evaluate(() => getComputedStyle(document.getElementById('settings-modal')).display));
await page.click('#settings-btn'); await page.waitForTimeout(600);

// ---- empty paste, watched closely ----
await page.click('#set-import-paste'); await page.waitForTimeout(600);
if (await page.locator('#pin-modal').isVisible()) await typePin('1234');
await page.waitForTimeout(700);
await shot('paste-empty-before');
await page.click('#dlg-ok'); await page.waitForTimeout(1500);
await shot('paste-empty-after');
console.log('EMPTY PASTE — any dialog on screen?', await page.evaluate(() => {
  const ids = ['dlg-modal', 'pin-modal'];
  return ids.map(i => ({ i, d: getComputedStyle(document.getElementById(i)).display }));
}));

// ---- versus victory modal, settled ----
await page.click('#settings-close').catch(()=>{}); await page.waitForTimeout(400);
await page.click('#gyms-btn'); await page.waitForSelector('#vs-btn', { timeout: 15000 });
await page.click('#vs-btn');
await page.waitForFunction(() => document.getElementById('battle-container')?.classList.contains('active'), null, { timeout: 30000 }).catch(()=>{});
await page.waitForTimeout(2000);
if (await page.locator('#pass-modal').isVisible().catch(()=>false)) { await page.click('#pass-ready'); await page.waitForTimeout(1200); }
await shot('versus-375-board');
for (let t = 0; t < 30; t++) {
  const b = page.locator('#battle-moves button[data-vmove]');
  if (!(await b.count())) break;
  await b.first().click({ timeout: 3000 }).catch(()=>{});
  await page.waitForTimeout(1300);
  if (await page.locator('#pass-modal').isVisible().catch(()=>false)) { await page.click('#pass-ready'); await page.waitForTimeout(1000); }
  if (await page.locator('#victory-modal').isVisible().catch(()=>false)) {
    await page.waitForTimeout(2500);
    await shot(`versus-victory-settled`);
    console.log('VICTORY MODAL TEXT:', JSON.stringify(await page.locator('#victory-modal').innerText()));
    console.log('VICTORY MODAL HTML head:', (await page.locator('#victory-modal').innerHTML()).slice(0, 600));
    break;
  }
}
await shot('versus-375-final');
console.log('\nERRORS', errs.length); errs.slice(0, 20).forEach(e => console.log('  ', e));
await ctx.close(); await browser.close();
