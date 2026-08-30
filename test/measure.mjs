// THROWAWAY measurement pass. Delete when done.
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
if (JR) {
  await page.click('#settings-btn'); await page.waitForTimeout(700);
  await page.click('#set-p1-junior'); await page.waitForTimeout(500);
  await page.click('#settings-close'); await page.waitForTimeout(1200);
}
const label = `${VW}x${VH} ${JR ? 'junior' : 'normal'}`;

// --- 1. catch-msg vs identity block ---
const c = await page.evaluate(() => {
  const m = document.getElementById('dex-catch-msg');
  m.style.opacity = 1; m.textContent = 'DARN! IT BROKE FREE!';
  const r = m.getBoundingClientRect();
  const id = document.getElementById('poke-id').getBoundingClientRect();
  const nm = document.getElementById('poke-name').getBoundingClientRect();
  const cs = getComputedStyle(m);
  const out = { msg: [r.top, r.bottom, r.left, r.right].map(Math.round), id: [id.top, id.bottom].map(Math.round),
    name: [nm.top, nm.bottom].map(Math.round), top: cs.top, fontSize: cs.fontSize, pos: cs.position };
  m.style.opacity = 0;
  return out;
});
console.log(`[${label}] CATCH MSG`, JSON.stringify(c));

// --- 2. explore habitat cards ---
await page.click('#explore-btn'); await page.waitForTimeout(2500);
const hab = await page.evaluate(() => document.querySelectorAll('#habitat-grid .habitat-card').length ? [...document.querySelectorAll('#habitat-grid .habitat-card')].map(card => {
  const kids = [...card.children];
  const rows = kids.map(k => { const r = k.getBoundingClientRect(); return { cls: k.className, txt: k.textContent.trim().slice(0, 24), top: Math.round(r.top), bot: Math.round(r.bottom), h: Math.round(r.height), fs: getComputedStyle(k).fontSize, lh: getComputedStyle(k).lineHeight, sh: k.scrollHeight, ch: k.clientHeight }; });
  const bad = [];
  for (let i = 0; i < rows.length - 1; i++) if (rows[i + 1].top < rows[i].bot - 1) bad.push(`${rows[i].txt} / ${rows[i + 1].txt} overlap ${rows[i].bot - rows[i + 1].top}px`);
  const cr = card.getBoundingClientRect();
  const last = rows[rows.length - 1];
  if (last.bot > cr.bottom + 1) bad.push(`last row spills ${Math.round(last.bot - cr.bottom)}px past card bottom`);
  for (const r of rows) if (r.sh > r.ch + 1) bad.push(`${r.txt} clipped (scrollH ${r.sh} > clientH ${r.ch})`);
  return { name: card.textContent.trim().replace(/\s+/g, ' ').slice(0, 40), rows: rows.map(r => `${r.txt}|${r.fs}/${r.lh}|top${r.top}-${r.bot}`), bad };
}) : []);
for (const h of hab) if (h.bad.length) console.log(`[${label}] HABITAT "${h.name}"`, h.bad, h.rows);
await page.click('#explore-back-btn'); await page.waitForTimeout(900);

// --- 3. gym cards ---
await page.click('#gyms-btn'); await page.waitForTimeout(2500);
const gym = await page.evaluate(() => [...document.querySelectorAll('#gym-grid .gym-card')].map(card => {
  const kids = [...card.children];
  const rows = kids.map(k => { const r = k.getBoundingClientRect(); return { txt: k.textContent.trim().slice(0, 26), top: Math.round(r.top), bot: Math.round(r.bottom), fs: getComputedStyle(k).fontSize, lh: getComputedStyle(k).lineHeight, sh: k.scrollHeight, ch: k.clientHeight }; });
  const bad = [];
  for (let i = 0; i < rows.length - 1; i++) if (rows[i + 1].top < rows[i].bot - 1) bad.push(`"${rows[i].txt}" / "${rows[i + 1].txt}" overlap ${rows[i].bot - rows[i + 1].top}px`);
  const cr = card.getBoundingClientRect();
  const last = rows[rows.length - 1];
  if (last.bot > cr.bottom + 1) bad.push(`"${last.txt}" spills ${Math.round(last.bot - cr.bottom)}px past card bottom`);
  for (const r of rows) if (r.sh > r.ch + 1) bad.push(`"${r.txt}" CLIPPED scrollH ${r.sh} clientH ${r.ch} (fs ${r.fs} lh ${r.lh})`);
  return { name: card.textContent.trim().replace(/\s+/g, ' ').slice(0, 40), rows: rows.map(r => `${r.txt}|${r.fs}/${r.lh}|${r.top}-${r.bot}`), bad };
}));
for (const g of gym) if (g.bad.length) console.log(`[${label}] GYM "${g.name}"`, g.bad, g.rows);
await page.click('#gym-back-btn'); await page.waitForTimeout(900);

// --- 4. ball drawer ---
await page.click('#catch-btn'); await page.waitForTimeout(900);
const balls = await page.evaluate(() => {
  const d = document.getElementById('ball-drawer');
  const dr = d.getBoundingClientRect();
  return { drawer: [Math.round(dr.left), Math.round(dr.right), Math.round(dr.top), Math.round(dr.bottom)], vw: innerWidth,
    opts: [...d.querySelectorAll('.ball-opt')].map(o => {
      const r = o.getBoundingClientRect();
      const spans = [...o.querySelectorAll('span,small')].map(s => { const sr = s.getBoundingClientRect(); return { t: s.textContent, l: Math.round(sr.left), r: Math.round(sr.right), fs: getComputedStyle(s).fontSize, ow: s.offsetWidth, sw: s.scrollWidth }; });
      return { box: [Math.round(r.left), Math.round(r.right)], spans };
    }) };
});
console.log(`[${label}] BALL DRAWER`, JSON.stringify(balls, null, 1));
await page.screenshot({ path: `/home/kevin/pokedex/test/playtest/measure-balls-${VW}-${JR ? 'junior' : 'normal'}.png` });

// --- 5. every visible font size under 8px, plus tofu-risk glyphs ---
const small = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    const kids = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
    if (!kids.length) continue;
    const fs = parseFloat(s.fontSize);
    if (fs < 8) out.push({ sel: el.id || el.className, fs: s.fontSize, txt: el.textContent.trim().slice(0, 26) });
  }
  return out;
});
console.log(`[${label}] SUB-8PX`, JSON.stringify(small));
await browser.close();
