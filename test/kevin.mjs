// THROWAWAY parent-lens driver. Delete after use.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://127.0.0.1:8321';
const HERE = new URL('.', import.meta.url).pathname;
const OUT = join(HERE, 'kevin');
mkdirSync(OUT, { recursive: true });
const SPRITE = readFileSync(join(HERE, 'fake-sprite.png'));
const REAL = process.env.REAL === '1';

const SEED = {
  version: 2,
  players: {
    1: { name: 'GABE', caught: [1, 4, 6, 25, 74, 95, 133], team: [6, 25, 1, 4, 74, 95],
      mons: Object.fromEntries([1, 4, 6, 25, 74, 95, 133].map(id => [id, { level: 14, xp: 30 }])),
      badges: ['boulder'], shinies: [], nicks: {}, items: { masterBalls: 3 }, quests: {},
      gyms: { beaten: {} }, settings: { junior: false }, champion: null,
      stats: { catches: 7, battlesWon: 3, battlesLost: 0, versusWins: 0 } },
    2: { name: 'ART', caught: [1, 25], team: [25, 1], mons: { 1: { level: 5, xp: 0 }, 25: { level: 9, xp: 0 } },
      badges: [], shinies: [], nicks: {}, items: { masterBalls: 1 }, quests: {},
      gyms: { beaten: {} }, settings: { junior: true }, champion: null,
      stats: { catches: 2, battlesWon: 0, battlesLost: 0, versusWins: 0 } },
  },
};

async function mock(ctx) {
  await ctx.route('https://pokeapi.co/**', r => REAL ? r.continue() : r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.route('https://raw.githubusercontent.com/**', r => {
    if (r.request().url().endsWith('.ogg')) return r.fulfill({ status: 404, body: '' });
    return REAL ? r.continue() : r.fulfill({ status: 200, contentType: 'image/png', body: SPRITE });
  });
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
}

const notes = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', deviceScaleFactor: 2, acceptDownloads: true });
await mock(ctx);
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 200)); });
await page.addInitScript(save => {
  try {
    localStorage.setItem('pokedexos_save_v2', JSON.stringify(save));
    localStorage.setItem('pokedexos_lastplayer', '1');
    localStorage.setItem('pokedexos_muted', '1');
  } catch (e) {}
}, SEED);

let n = 0;
const shot = async label => {
  n++;
  const f = `${String(n).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.png`;
  await page.screenshot({ path: join(OUT, f) });
  console.log(`  shot ${f}`);
  return f;
};
const boot = async () => {
  await page.goto(`${BASE}/?fast=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.getElementById('boot-screen')?.click());
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById('whoplaying-modal')?.remove());
  await page.waitForTimeout(1200);
};
const typePin = async (pin = '1234') => {
  for (const d of pin) await page.click(`#pin-keys button[data-k="${d}"]`);
  await page.waitForTimeout(400);
};

await boot();

// ---------- 1. Settings screen ----------
await page.click('#settings-btn'); await page.waitForTimeout(600);
await shot('settings-open');
console.log('VERSION READOUT:', await page.locator('#set-version').innerText());
console.log('BOOT VERSION:', await page.locator('#boot-version').innerText().catch(() => '?'));

// measure the emoji/text gap Kevin complained about, on the save buttons
const gaps = await page.evaluate(() => {
  const out = [];
  for (const b of document.querySelectorAll('#settings-modal button, #settings-modal .set-row span')) {
    const r = b.getBoundingClientRect();
    if (!r.width) continue;
    const cs = getComputedStyle(b);
    out.push({ id: b.id || b.className, text: JSON.stringify(b.textContent), w: Math.round(r.width), sw: b.scrollWidth, cw: b.clientWidth, ls: cs.letterSpacing, ws: cs.wordSpacing, font: cs.fontFamily.split(',')[0] });
  }
  return out;
});
console.log('SETTINGS TEXT METRICS:'); gaps.forEach(g => console.log('   ', JSON.stringify(g)));

// ---------- 2. COPY CODE ----------
await page.click('#set-export-copy'); await page.waitForTimeout(700);
await shot('copy-code');
console.log('after COPY CODE, dlg title=', await page.locator('#dlg-title').innerText().catch(() => 'none'), 'visible=', await page.locator('#dlg-modal').isVisible());
const code = await page.evaluate(() => document.getElementById('dlg-input')?.value || null);
console.log('CODE len:', code ? code.length : 'not shown in dialog');
if (await page.locator('#dlg-ok').isVisible()) { await page.click('#dlg-ok'); await page.waitForTimeout(400); }

// grab the real code from the page module state instead
const realCode = await page.evaluate(async () => {
  const m = await import('./js/state.js');
  return m.exportCode();
});
console.log('real export code length', realCode.length);

// ---------- 3. SAVE FILE ----------
const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
await page.click('#set-export-file');
const d = await dl;
console.log('DOWNLOAD:', d ? d.suggestedFilename() : 'NO DOWNLOAD EVENT');
if (d) { const p = join(OUT, 'save.json'); await d.saveAs(p); console.log('saved', p, readFileSync(p, 'utf8').slice(0, 120)); }
await page.waitForTimeout(500);
await shot('after-save-file');

// ---------- 4. PASTE CODE — PIN gate, first use ----------
await page.click('#set-import-paste'); await page.waitForTimeout(700);
await shot('pin-first-use');
console.log('pin modal visible', await page.locator('#pin-modal').isVisible(), 'title', await page.locator('#pin-title').innerText().catch(()=>''), 'sub', await page.locator('#pin-sub').innerText().catch(()=>''));
await typePin('1234');
await shot('pin-confirm');
console.log('sub now', await page.locator('#pin-sub').innerText().catch(()=>''));
await typePin('9999');           // deliberate mismatch
await page.waitForTimeout(700);
await shot('pin-mismatch');
console.log('after mismatch: pin visible', await page.locator('#pin-modal').isVisible(), 'sub', await page.locator('#pin-sub').innerText().catch(()=>''));
await typePin('1234');
await page.waitForTimeout(800);
await shot('paste-dialog');
console.log('paste dlg visible', await page.locator('#dlg-modal').isVisible(), await page.locator('#dlg-title').innerText().catch(()=>''));

// 4a. EMPTY code
await page.fill('#dlg-input', '');
await page.click('#dlg-ok'); await page.waitForTimeout(800);
await shot('empty-code-result');
console.log('EMPTY: dlg visible?', await page.locator('#dlg-modal').isVisible(), 'title', await page.locator('#dlg-title').innerText().catch(()=>''));
if (await page.locator('#dlg-modal').isVisible()) { await page.click('#dlg-ok'); await page.waitForTimeout(400); }

// 4b. RUBBISH
await page.click('#set-import-paste'); await page.waitForTimeout(600);
if (await page.locator('#pin-modal').isVisible()) await typePin('1234');
await page.waitForTimeout(600);
await page.fill('#dlg-input', 'hello kevin this is not a save');
await page.click('#dlg-ok'); await page.waitForTimeout(900);
await shot('rubbish-code-result');
console.log('RUBBISH:', await page.locator('#dlg-title').innerText().catch(()=>''), '|', await page.locator('#dlg-text').innerText().catch(()=>''));
await page.click('#dlg-ok'); await page.waitForTimeout(400);
console.log('caught after rubbish', await page.evaluate(async()=>{const m=await import('./js/state.js');return [m.state.save.players[1].caught.length,m.state.save.players[2].caught.length];}));

// 4c. TRUNCATED (chop the tail off a real code)
await page.click('#set-import-paste'); await page.waitForTimeout(600);
if (await page.locator('#pin-modal').isVisible()) await typePin('1234');
await page.waitForTimeout(600);
await page.fill('#dlg-input', realCode.slice(0, Math.floor(realCode.length * 0.6)));
await page.click('#dlg-ok'); await page.waitForTimeout(900);
await shot('truncated-code-result');
console.log('TRUNCATED:', await page.locator('#dlg-title').innerText().catch(()=>''), '|', await page.locator('#dlg-text').innerText().catch(()=>''));
await page.click('#dlg-ok'); await page.waitForTimeout(400);
console.log('caught after truncated', await page.evaluate(async()=>{const m=await import('./js/state.js');return [m.state.save.players[1].caught.length,m.state.save.players[2].caught.length];}));

// 4d. A LEGACY v1 CODE (the documented "old game" path)
const v1code = await page.evaluate(() => btoa(JSON.stringify({ p1: [1, 4, 7], p2: [25] })));
await page.click('#set-import-paste'); await page.waitForTimeout(600);
if (await page.locator('#pin-modal').isVisible()) await typePin('1234');
await page.waitForTimeout(600);
await page.fill('#dlg-input', v1code);
await page.click('#dlg-ok'); await page.waitForTimeout(1000);
await shot('v1-code-result');
console.log('V1:', await page.locator('#dlg-title').innerText().catch(()=>''), '|', await page.locator('#dlg-text').innerText().catch(()=>''));
await page.click('#dlg-ok'); await page.waitForTimeout(400);
console.log('state after v1 import', await page.evaluate(async()=>{const m=await import('./js/state.js');const p=m.state.save.players[1];return {caught:p.caught,team:p.team,mons:Object.keys(p.mons),name:p.name,p2:m.state.save.players[2].caught, p2team:m.state.save.players[2].team, p2junior:m.state.save.players[2].settings.junior};}));

// ---------- 5. UNDO IMPORT ----------
await page.click('#set-undo-import'); await page.waitForTimeout(700);
if (await page.locator('#pin-modal').isVisible()) await typePin('1234');
await page.waitForTimeout(800);
await shot('undo-confirm');
console.log('UNDO dlg:', await page.locator('#dlg-title').innerText().catch(()=>''), '|', await page.locator('#dlg-text').innerText().catch(()=>''));
await page.click('#dlg-ok'); await page.waitForTimeout(900);
await shot('undo-result');
console.log('UNDO result:', await page.locator('#dlg-title').innerText().catch(()=>''), '|', await page.locator('#dlg-text').innerText().catch(()=>''));
await page.click('#dlg-ok').catch(()=>{}); await page.waitForTimeout(400);
console.log('state after undo', await page.evaluate(async()=>{const m=await import('./js/state.js');const p=m.state.save.players[1];return {caught:p.caught.length,team:p.team,p2:m.state.save.players[2].caught.length};}));

// ---------- 6. PARENT TOOLS ----------
await page.hover('#dev-open-btn');
await page.mouse.down();
await page.waitForTimeout(1500);
await page.mouse.up();
await page.waitForTimeout(700);
await shot('parent-tools-pin');
if (await page.locator('#pin-modal').isVisible()) { await typePin('1234'); await page.waitForTimeout(800); }
await shot('parent-tools');
console.log('dev modal visible', await page.locator('#dev-modal').isVisible(), 'count', await page.locator('#dev-count').innerText().catch(()=>''), 'pindate', await page.locator('#dev-pin-date').innerText().catch(()=>''));
console.log('target buttons', await page.locator('#dev-target-1').innerText(), '/', await page.locator('#dev-target-2').innerText());

writeFileSync(join(OUT, 'errors.json'), JSON.stringify(errs, null, 1));
console.log('\nERRORS:', errs.length); errs.slice(0, 20).forEach(e => console.log('  ', e));
await ctx.close();
await browser.close();
