// THROWAWAY parent-lens driver #2. Delete after use.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://127.0.0.1:8321';
const HERE = new URL('.', import.meta.url).pathname;
const OUT = join(HERE, 'kevin2');
mkdirSync(OUT, { recursive: true });
const SPRITE = readFileSync(join(HERE, 'fake-sprite.png'));
const REAL = process.env.REAL === '1';
const W = parseInt(process.env.W || '390'), H = parseInt(process.env.H || '844');

const SEED = junior => ({
  version: 2,
  players: {
    1: { name: 'GABE', caught: [1, 4, 6, 25, 74, 95, 133], team: [6, 25, 1, 4, 74, 95],
      mons: Object.fromEntries([1, 4, 6, 25, 74, 95, 133].map(id => [id, { level: 14, xp: 30 }])),
      badges: ['boulder'], shinies: [], nicks: {}, items: { masterBalls: 3 }, quests: {},
      gyms: { beaten: {} }, settings: { junior }, champion: null,
      stats: { catches: 7, battlesWon: 3, battlesLost: 0, versusWins: 0 } },
    2: { name: 'ART', caught: [1, 25], team: [25, 1], mons: { 1: { level: 5, xp: 0 }, 25: { level: 9, xp: 0 } },
      badges: [], shinies: [], nicks: {}, items: { masterBalls: 1 }, quests: {},
      gyms: { beaten: {} }, settings: { junior: true }, champion: null,
      stats: { catches: 2, battlesWon: 0, battlesLost: 0, versusWins: 0 } },
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
const ctx = await browser.newContext({ viewport: { width: W, height: H }, serviceWorkers: 'block', deviceScaleFactor: 2, acceptDownloads: true });
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
}, SEED(process.env.MODE === 'junior'));

let n = 0;
const shot = async label => {
  n++;
  const f = `${W}x${H}-${String(n).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.png`;
  await page.screenshot({ path: join(OUT, f) });
  console.log('  shot ' + f);
};
const boot = async () => {
  await page.goto(`${BASE}/?fast=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.getElementById('boot-screen')?.click());
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById('whoplaying-modal')?.remove());
  await page.waitForTimeout(1200);
};
const typePin = async (pin = '1234') => { for (const d of pin) await page.click(`#pin-keys button[data-k="${d}"]`); await page.waitForTimeout(400); };

await boot();

// ============ A. the ⓘ VERSION glyph & emoji-gap forensics ============
await page.click('#settings-btn'); await page.waitForTimeout(600);
const glyphs = await page.evaluate(() => {
  const out = [];
  const probe = txt => {
    const s = document.createElement('span');
    s.style.cssText = 'position:absolute;visibility:hidden;font-family:"Press Start 2P",monospace;font-size:20px;white-space:pre';
    s.textContent = txt; document.body.appendChild(s);
    const w = s.getBoundingClientRect().width; s.remove(); return Math.round(w * 10) / 10;
  };
  for (const t of ['ⓘ', '📳', '💾', '📋', '📂', '↩️', '🔧', 'M', ' ', '�'])
    out.push({ ch: t, code: [...t].map(c => 'U+' + c.codePointAt(0).toString(16)).join(' '), width: probe(t) });
  return out;
});
console.log('GLYPH WIDTHS (20px Press Start 2P):'); glyphs.forEach(g => console.log('   ', JSON.stringify(g)));
await page.screenshot({ path: join(OUT, `${W}x${H}-00-settings-full.png`) });
const verRow = await page.locator('#set-version').locator('xpath=..');
await verRow.screenshot({ path: join(OUT, `${W}x${H}-00-version-row.png`) });
const buzzRow = await page.locator('#set-haptics').locator('xpath=..');
await buzzRow.screenshot({ path: join(OUT, `${W}x${H}-00-buzz-row.png`) });
await page.locator('.set-grid').screenshot({ path: join(OUT, `${W}x${H}-00-save-buttons.png`) });

// ============ B. Parent Tools: is 🔑 CHANGE PIN reachable? ============
await page.hover('#dev-open-btn'); await page.mouse.down(); await page.waitForTimeout(1500); await page.mouse.up();
await page.waitForTimeout(600);
if (await page.locator('#pin-modal').isVisible()) await typePin('1234');
await page.waitForTimeout(800);
await shot('parent-tools-top');
const pinBtnState = await page.evaluate(() => {
  const b = document.getElementById('dev-change-pin');
  const r = b.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const top = document.elementFromPoint(cx, cy);
  return { rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
           viewportH: innerHeight, topElementAtCentre: top ? (top.id || top.className || top.tagName) : null,
           covered: top !== b && !b.contains(top) };
});
console.log('CHANGE PIN before scroll:', JSON.stringify(pinBtnState));
await page.evaluate(() => { const m = document.querySelector('#dev-modal .modal-box'); m.scrollTop = m.scrollHeight; });
await page.waitForTimeout(500);
await shot('parent-tools-scrolled-bottom');
const pinBtnState2 = await page.evaluate(() => {
  const b = document.getElementById('dev-change-pin');
  const r = b.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const top = document.elementFromPoint(cx, cy);
  return { rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
           topElementAtCentre: top ? (top.id || top.className || top.tagName) : null,
           covered: top !== b && !b.contains(top),
           dateVisible: document.getElementById('dev-pin-date').getBoundingClientRect().bottom <= innerHeight };
});
console.log('CHANGE PIN after scrolling to bottom:', JSON.stringify(pinBtnState2));

// what covers the dev-pin-date line
const dateProbe = await page.evaluate(() => {
  const d = document.getElementById('dev-pin-date');
  const r = d.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + 20, r.top + r.height / 2);
  return { text: d.innerText, rect: { y: Math.round(r.y), h: Math.round(r.height) }, topEl: top ? (top.id || top.className) : null };
});
console.log('PIN DATE line:', JSON.stringify(dateProbe));

// ============ C. Parent Tools: remove a Pokemon (destructive) ============
await page.evaluate(() => { const m = document.querySelector('#dev-modal .modal-box'); m.scrollTop = 0; });
await page.waitForTimeout(300);
await page.locator('.dev-row[data-id="133"] .dev-mini.danger').click();
await page.waitForTimeout(700);
await shot('remove-confirm');
console.log('REMOVE dlg:', await page.locator('#dlg-title').innerText().catch(()=>''), '|', await page.locator('#dlg-text').innerText().catch(()=>''));
await page.click('#dlg-ok'); await page.waitForTimeout(700);
console.log('after remove, count=', await page.locator('#dev-count').innerText(), 'status=', await page.locator('#dev-status').innerText());
console.log('undo available?', await page.evaluate(async()=>{const m=await import('./js/state.js');return m.hasPreviousSave();}));
await shot('after-remove');

// level to 100 then check the number input clamp
await page.fill('.dev-row[data-id="1"] .dev-lvl', '999');
await page.locator('.dev-row[data-id="1"] .dev-lvl').press('Enter');
await page.waitForTimeout(500);
console.log('level after typing 999:', await page.locator('.dev-row[data-id="1"] .dev-lvl').inputValue(), 'status', await page.locator('#dev-status').innerText());
await page.fill('.dev-row[data-id="1"] .dev-lvl', '-5');
await page.locator('.dev-row[data-id="1"] .dev-lvl').press('Enter');
await page.waitForTimeout(500);
console.log('level after typing -5:', await page.locator('.dev-row[data-id="1"] .dev-lvl').inputValue(), 'status', await page.locator('#dev-status').innerText());
await shot('dev-level-clamp');
await page.click('#dev-close'); await page.waitForTimeout(500);

// ============ D. player-name round trip through save/reload ============
await page.click('#settings-btn'); await page.waitForTimeout(400);
await page.fill('#set-p1-name', "GABE'S");
await page.click('#settings-close'); await page.waitForTimeout(500);
console.log('name in save right after typing:', await page.evaluate(async()=>{const m=await import('./js/state.js');return m.state.save.players[1].name;}));
console.log('header shows:', await page.locator('#player-btn').innerText());
await shot('name-typed');
for (let i = 1; i <= 3; i++) {
  await boot();
  const nm = await page.evaluate(async()=>{const m=await import('./js/state.js');return m.state.save.players[1].name;});
  console.log(`reload #${i}: stored name = ${JSON.stringify(nm)}  header = ${JSON.stringify(await page.locator('#player-btn').innerText())}`);
  await shot(`name-after-reload-${i}`);
}
await page.click('#settings-btn'); await page.waitForTimeout(400);
console.log('settings name field now:', JSON.stringify(await page.locator('#set-p1-name').inputValue()));
await shot('name-in-settings-after-reloads');
await page.click('#card-close').catch(()=>{});
await page.click('#settings-close'); await page.waitForTimeout(400);

// ============ E. trainer card ============
await page.click('#card-btn'); await page.waitForTimeout(1200);
await shot('trainer-card');
console.log('card title HTML:', await page.locator('#card-title').innerHTML());
console.log('card dex:', await page.locator('#card-dex-pct').innerText());
console.log('card oak:', await page.locator('#card-oak').innerText());
await page.click('#card-close').catch(()=>{});

// ============ F. LOAD FILE with a rubbish file ============
writeFileSync(join(OUT, 'rubbish.json'), 'this is my shopping list, not a save');
writeFileSync(join(OUT, 'nocode.json'), JSON.stringify({ pokedexOS: true, players: { 1: 'GABE' } }));
for (const f of ['rubbish.json', 'nocode.json']) {
  await page.click('#settings-btn').catch(()=>{}); await page.waitForTimeout(400);
  const chooser = page.waitForEvent('filechooser', { timeout: 8000 });
  await page.click('#set-import-file'); await page.waitForTimeout(500);
  if (await page.locator('#pin-modal').isVisible()) await typePin('1234');
  const fc = await chooser.catch(() => null);
  if (!fc) { console.log('NO FILE CHOOSER for', f); continue; }
  await fc.setFiles(join(OUT, f));
  await page.waitForTimeout(1000);
  await shot('loadfile-' + f);
  console.log('LOAD FILE', f, '->', await page.locator('#dlg-title').innerText().catch(()=>'(no dialog)'), '|', await page.locator('#dlg-text').innerText().catch(()=>''));
  await page.click('#dlg-ok').catch(()=>{}); await page.waitForTimeout(400);
  console.log('   caught still', await page.evaluate(async()=>{const m=await import('./js/state.js');return m.state.save.players[1].caught.length;}));
  await page.click('#settings-close').catch(()=>{}); await page.waitForTimeout(300);
}

console.log('\nERRORS', errs.length); errs.slice(0, 20).forEach(e => console.log('  ', e));
await ctx.close(); await browser.close();
