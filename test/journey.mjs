// THROWAWAY: a brand-new player's first hour. Delete when done.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const BASE = 'http://127.0.0.1:8321';
const MODE = process.env.MODE === 'junior' ? 'junior' : 'normal';
const VW = parseInt(process.env.VW || '390', 10);
const VH = parseInt(process.env.VH || '844', 10);
const OUT = join('/home/kevin/pokedex/test/playtest', 'journey-' + MODE + (VW === 375 ? '-375' : ''));
mkdirSync(OUT, { recursive: true });

const OBSERVE = `() => {
  const vis = el => { if (!el) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05; };
  const notes = [];
  for (const id of ['wild-sprite', 'player-sprite']) {
    const el = document.getElementById(id); if (!vis(el)) continue;
    const cs = getComputedStyle(el); const f = cs.filter || '';
    notes.push('#' + id + ' filter=' + f + ' opacity=' + cs.opacity + ' class="' + el.className + '" complete=' + el.complete + ' nw=' + el.naturalWidth + ' src=' + String(el.src).slice(-34));
  }
  const overlaps = [];
  for (const btn of document.querySelectorAll('button, .habitat-card, .set-row, .move-btn, .trainer-card, .pc-item, .ball-opt, [class*=btn]')) {
    if (!vis(btn)) continue;
    const kids = [...btn.children].filter(vis);
    for (let i = 0; i < kids.length - 1; i++) {
      const a = kids[i].getBoundingClientRect(), b = kids[i + 1].getBoundingClientRect();
      const vertical = b.top >= a.bottom - 2;
      const gap = vertical ? b.top - a.bottom : b.left - a.right;
      if (gap < -1) overlaps.push(\`OVERLAP \${btn.id||btn.className} \${Math.round(gap)}px "\${btn.textContent.trim().slice(0,22)}"\`);
      else if (gap >= 0 && gap < 2 && !vertical) overlaps.push(\`TOUCHING \${btn.id||btn.className} \${Math.round(gap)}px "\${btn.textContent.trim().slice(0,22)}"\`);
    }
    const t = (btn.textContent || '').trim();
    if (/[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}][A-Za-z0-9]/u.test(t)) overlaps.push('NO SPACE AFTER EMOJI: ' + t.slice(0, 30));
  }
  notes.push(...overlaps.slice(0, 10));
  for (const img of document.querySelectorAll('img')) { if (!vis(img)) continue;
    if (img.complete && img.naturalWidth === 0) notes.push('BROKEN IMAGE: ' + (img.id || img.className) + ' src=' + String(img.src).slice(-40)); }
  for (const el of document.querySelectorAll('button, .move-btn, .habitat-card span, .hp-name, .pkmn-name')) { if (!vis(el)) continue;
    if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible') notes.push('TEXT CLIPPED: ' + (el.id||el.className) + ' "' + el.textContent.trim().slice(0,24) + '"'); }
  for (const el of document.querySelectorAll('button, .modal-box, .move-btn')) { if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth + 1 || r.left < -1) notes.push('OFFSCREEN-X: ' + (el.id||el.className) + ' ' + Math.round(r.left) + '..' + Math.round(r.right)); }
  return { notes, log: (document.getElementById('battle-log')?.innerText||'').trim().slice(0,90),
    caught: (()=>{try{return JSON.parse(localStorage.getItem('pokedexos_save_v2')).players[1].caught.length}catch(e){return null}})(),
    body: document.body.className };
}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, serviceWorkers: 'block', deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 180)); });
await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('pokedexos_muted', '1'); } catch (e) {} });
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1300);
let n = 0; const steps = [];
const step = async label => {
  n++;
  const slug = `${String(n).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`;
  await page.screenshot({ path: join(OUT, slug + '.png') });
  const o = await page.evaluate(new Function('return ' + OBSERVE)());
  steps.push({ label, shot: slug + '.png', ...o });
  console.log(`\n[${n}] ${label}  (caught=${o.caught}, log="${o.log}")`);
  o.notes.forEach(x => console.log('    ' + x));
};
const dismiss = async () => {
  for (let i = 0; i < 5; i++) {
    const b = page.locator('#dlg-ok:visible, #quest-ok:visible, #nick-skip:visible, #victory-ok:visible, .btn-large:visible').first();
    if (await b.count() && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(800); }
    else break;
  }
};

await page.evaluate(() => document.getElementById('boot-screen')?.click());
await page.waitForTimeout(900);
await page.locator('.whoplaying-choice').first().click();
await page.waitForTimeout(2200);
if (MODE === 'junior') {
  await page.click('#settings-btn'); await page.waitForTimeout(800);
  await page.click('#set-p1-junior'); await page.waitForTimeout(500);
  await page.click('#settings-close'); await page.waitForTimeout(1400);
}
await step('fresh dex');

// first catch
await page.click('#catch-btn'); await page.waitForTimeout(900);
await page.locator('.ball-opt').first().click();
await page.waitForTimeout(5000);
await step('first ball thrown');
await dismiss();
await page.waitForTimeout(1200);
await step('after dismissing whatever popped up');

// keep throwing until we own one
for (let i = 0; i < 6; i++) {
  const owned = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('pokedexos_save_v2')).players[1].caught.length; } catch (e) { return 0; } });
  if (owned > 0) break;
  await page.click('#catch-btn').catch(() => {}); await page.waitForTimeout(700);
  await page.locator('.ball-opt').first().click().catch(() => {}); await page.waitForTimeout(5000);
  await dismiss();
}
await step('now I own a Pokemon');

// first explore
await page.click('#explore-btn'); await page.waitForTimeout(2600);
await step('the map with one Pokemon');
await page.locator('#habitat-grid .habitat-card:not(.locked)').first().click();
await page.waitForFunction(() => document.getElementById('battle-container')?.classList.contains('active'), null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1200);
await step('wild Pokemon appeared (t+1.2s)');
await page.waitForTimeout(2500);
await step('wild Pokemon (t+3.7s)');
for (let turn = 0; turn < 5; turn++) {
  const tiles = page.locator('.move-btn.type-tile:not([disabled])');
  if (!(await tiles.count())) break;
  await tiles.first().click();
  await page.waitForTimeout(600);
  await step(`mid-attack turn ${turn + 1}`);
  await page.waitForTimeout(2600);
  await step(`after attack turn ${turn + 1}`);
  if (await page.locator('#victory-modal').isVisible().catch(() => false)) { await step('battle over'); break; }
}
const ball = page.locator('#ball-btn');
if (await ball.isVisible().catch(() => false)) { await ball.click(); await page.waitForTimeout(1000); await step('opened the ball menu in battle'); }
await page.waitForTimeout(300);
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ steps, errs }, null, 1));
console.log('\nERRORS:', errs.length); errs.slice(0, 15).forEach(e => console.log('  ' + e));
await browser.close();
