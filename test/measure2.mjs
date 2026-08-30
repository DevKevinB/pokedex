// THROWAWAY. Delete when done.
import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:8321';
const VW = parseInt(process.env.VW || '390', 10);
const VH = parseInt(process.env.VH || '844', 10);
const JR = process.env.MODE === 'junior';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, serviceWorkers: 'block', deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('pokedexos_muted', '1'); } catch (e) {} });
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
await page.evaluate(() => document.getElementById('boot-screen')?.click());
await page.waitForTimeout(800);
await page.locator('.whoplaying-choice').first().click();
await page.waitForTimeout(1800);
if (JR) { await page.click('#settings-btn'); await page.waitForTimeout(700); await page.click('#set-p1-junior'); await page.waitForTimeout(500); await page.click('#settings-close'); await page.waitForTimeout(1200); }
const label = `${VW}x${VH} ${JR ? 'junior' : 'normal'}`;

const LINES = `sel => {
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    const rects = [...el.getClientRects()];
    const range = document.createRange(); range.selectNodeContents(el);
    const lines = [...range.getClientRects()].map(x => ({ t: +x.top.toFixed(1), b: +x.bottom.toFixed(1), l: +x.left.toFixed(1), r: +x.right.toFixed(1) }));
    const cs = getComputedStyle(el);
    const parent = el.parentElement.getBoundingClientRect();
    const next = el.nextElementSibling ? el.nextElementSibling.getBoundingClientRect() : null;
    out.push({ txt: el.textContent.trim().replace(/\\s+/g,' ').slice(0,32), fs: cs.fontSize, lh: cs.lineHeight,
      box: [+r.top.toFixed(1), +r.bottom.toFixed(1)], lines,
      spillPastParent: +(lines.length ? Math.max(0, lines[lines.length-1].b - parent.bottom + parseFloat(getComputedStyle(el.parentElement).paddingBottom)) : 0).toFixed(1),
      overNext: next && lines.length ? +(lines[lines.length-1].b - next.top).toFixed(1) : null,
      overBox: lines.length ? +(lines[lines.length-1].b - r.bottom).toFixed(1) : 0 });
  }
  return out;
}`;

await page.click('#explore-btn'); await page.waitForTimeout(2500);
console.log(`\n=== [${label}] HABITAT SUBS ===`);
console.log(JSON.stringify(await page.evaluate(new Function('return ' + LINES)(), '.habitat-sub'), null, 0));
console.log(`\n=== [${label}] HABITAT NAMES ===`);
console.log(JSON.stringify(await page.evaluate(new Function('return ' + LINES)(), '#habitat-grid .habitat-name'), null, 0));
await page.click('#explore-back-btn'); await page.waitForTimeout(900);

await page.click('#gyms-btn'); await page.waitForTimeout(2500);
console.log(`\n=== [${label}] GYM SUBS ===`);
console.log(JSON.stringify(await page.evaluate(new Function('return ' + LINES)(), '#gym-grid .habitat-sub'), null, 0));
await browser.close();
