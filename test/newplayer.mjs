// THROWAWAY new-player playtest. Delete when done.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://127.0.0.1:8321';
const HERE = new URL('.', import.meta.url).pathname;
const MODE = process.env.MODE === 'junior' ? 'junior' : 'normal';
const ONLY = process.env.SCRIPT || '';
const VW = parseInt(process.env.VW || '390', 10);
const VH = parseInt(process.env.VH || '844', 10);
const OUT = join(HERE, 'playtest', 'new-' + MODE + (VW === 375 ? '-375' : ''));
mkdirSync(OUT, { recursive: true });

async function mock(ctx) {
  await ctx.route('https://fonts.googleapis.com/**', r => r.continue());
}

const OBSERVE = `() => {
  const vis = el => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05;
  };
  const notes = [];
  for (const id of ['wild-sprite', 'player-sprite']) {
    const el = document.getElementById(id);
    if (!vis(el)) continue;
    const f = getComputedStyle(el).filter || '';
    const g = /grayscale\\(([\\d.]+)\\)/.exec(f);
    const fainted = el.classList.contains('fainted');
    if (g && parseFloat(g[1]) > 0.1 && !fainted) notes.push('GREYSCALE SPRITE not fainted: #' + id + ' filter=' + f);
  }
  const overlaps = [];
  for (const btn of document.querySelectorAll('button, .habitat-card, .set-row, .gym-card, .trainer-card, .pc-item')) {
    if (!vis(btn)) continue;
    const kids = [...btn.children].filter(vis);
    for (let i = 0; i < kids.length - 1; i++) {
      const a = kids[i].getBoundingClientRect(), b = kids[i + 1].getBoundingClientRect();
      const vertical = b.top >= a.bottom - 2;
      const gap = vertical ? b.top - a.bottom : b.left - a.right;
      if (gap < -1) overlaps.push({ el: btn.id || btn.className, gap: Math.round(gap), kind: 'OVERLAP' });
      else if (gap >= 0 && gap < 2 && !vertical) overlaps.push({ el: btn.id || btn.className, gap: Math.round(gap), kind: 'TOUCHING' });
    }
    const t = (btn.textContent || '').trim();
    if (/[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}][A-Za-z0-9]/u.test(t))
      overlaps.push({ el: btn.id || btn.className, kind: 'NO SPACE AFTER EMOJI', text: t.slice(0, 28) });
  }
  for (const o of overlaps.slice(0, 14))
    notes.push(o.kind + ': ' + o.el + (o.gap !== undefined ? ' gap=' + o.gap + 'px' : '') + (o.text ? ' "' + o.text + '"' : ''));
  for (const img of document.querySelectorAll('img')) {
    if (!vis(img)) continue;
    if (img.complete && img.naturalWidth === 0) notes.push('BROKEN IMAGE: ' + (img.id || img.className) + ' src=' + String(img.src).slice(-46));
  }
  for (const el of document.querySelectorAll('button, .card-title, .pkmn-name, .tile-name, .habitat-card span')) {
    if (!vis(el)) continue;
    if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible')
      notes.push('TEXT CLIPPED: ' + (el.id || el.className) + ' "' + (el.textContent || '').trim().slice(0, 24) + '"');
  }
  // off-screen elements
  for (const el of document.querySelectorAll('button, .modal-box, .habitat-card')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth + 1 || r.left < -1) notes.push('OFFSCREEN-X: ' + (el.id || el.className) + ' left=' + Math.round(r.left) + ' right=' + Math.round(r.right));
  }
  return {
    notes,
    screen: (() => {
      const bc = document.getElementById('battle-container');
      if (bc && bc.classList.contains('active')) return 'battle';
      for (const id of ['pc-modal', 'settings-modal', 'card-modal', 'victory-modal', 'dev-modal', 'sticker-modal', 'dlg-modal'])
        if (vis(document.getElementById(id))) return id;
      for (const id of ['explore-container', 'gym-container'])
        if (document.getElementById(id)?.getBoundingClientRect().top < 40) return id;
      return 'dex';
    })(),
    save: (() => { try { return localStorage.getItem('pokedexos_save_v2')?.slice(0, 120); } catch (e) { return 'ERR'; } })(),
    caught: (() => { try { const s = JSON.parse(localStorage.getItem('pokedexos_save_v2')); return s && s.players[1].caught.length; } catch (e) { return null; } })(),
    body: document.body.className,
    log: (document.getElementById('battle-log')?.innerText || '').trim().slice(0, 80),
    visibleText: document.body.innerText.replace(/\\n{2,}/g, '\\n').slice(0, 400),
  };
}`;

const SCRIPTS = {
  // Very first launch: boot screen, who's playing, empty dex.
  firstboot: async (p, step, ctl) => {
    await step('boot screen, before tapping');
    await p.evaluate(() => document.getElementById('boot-screen')?.click());
    await p.waitForTimeout(1200);
    await step('after TAP TO START — who is playing');
    const choice = p.locator('.whoplaying-choice').first();
    if (await choice.count()) { await choice.click(); }
    await p.waitForTimeout(2500);
    await step('landed on the dex with nothing caught');
    await p.click('#lead-btn').catch(() => {});
    await p.waitForTimeout(1500);
    await step('tapped LEAD with no Pokemon');
    const sb = p.locator('#close-pc-btn').first();
    if (await sb.count() && await sb.isVisible().catch(() => false)) {
      await sb.click().catch(() => {});
      await p.waitForTimeout(2000);
      await step('pressed the big green button with an empty box');
    }
    await p.evaluate(() => document.querySelectorAll('.overlay-screen, #pc-modal').forEach(m => { m.style.display = 'none'; }));
    await p.waitForTimeout(600);
    await p.click('#settings-btn', { force: true }); await p.waitForTimeout(1000);
    await step('settings — is the version here');
    await p.click('#settings-close').catch(() => {});
    await p.waitForTimeout(600);
    await step('back on the dex');
  },
  pctap: async (p, step) => {
    await p.click('#pc-btn'); await p.waitForTimeout(2000);
    await step('PC box, nothing owned');
    await p.locator('.pc-item').nth(2).click().catch(() => {});
    await p.waitForTimeout(1500);
    await step('tapped an uncaught Pokemon in my own PC box');
    await p.evaluate(() => document.querySelectorAll('.overlay-screen, #pc-modal').forEach(m => m.style.display = 'none'));
    await p.waitForTimeout(400);
  },
  versus: async (p, step) => {
    await p.click('#gyms-btn'); await p.waitForTimeout(2000);
    const v = p.locator('#vs-btn').first();
    if (await v.count()) { await v.click().catch(() => {}); await p.waitForTimeout(2500); await step('tapped P1 VS P2 with two empty teams'); }
    else await step('no versus button found');
    await p.evaluate(() => document.querySelectorAll('.overlay-screen').forEach(m => m.style.display = 'none'));
    await p.waitForTimeout(400);
    const h = p.locator('#poke-center-btn').first();
    if (await h.isVisible().catch(() => false)) { await h.click(); await p.waitForTimeout(1800); await step('healed an empty team at the Poke Center'); }
  },
  emptypc: async (p, step) => {
    await p.click('#pc-btn'); await p.waitForTimeout(1600);
    await step('PC box with zero Pokemon');
    await p.click('#close-pc-btn').catch(() => {});
    await p.waitForTimeout(500);
    await p.click('#card-btn'); await p.waitForTimeout(1500);
    await step('trainer card with no badges');
    await p.click('#card-close').catch(() => {});
    await p.waitForTimeout(500);
  },
  emptybattle: async (p, step) => {
    await p.click('#battle-btn'); await p.waitForTimeout(2000);
    await step('pressed BTL with no team');
    await p.evaluate(() => document.querySelectorAll('.overlay-screen').forEach(m => m.style.display = 'none'));
    await p.waitForTimeout(500);
  },
  emptygym: async (p, step) => {
    await p.click('#gyms-btn');
    await p.waitForTimeout(2500);
    await step('gym circuit with no badges');
    const c = p.locator('#gym-body .gym-card').first();
    if (await c.count()) { await c.click(); await p.waitForTimeout(1600); await step('opened first gym stop'); }
    const t = p.locator('.trainer-card:not(.locked)').first();
    if (await t.count()) {
      await t.click(); await p.waitForTimeout(1800);
      await step('tapped a trainer with an EMPTY TEAM');
      const ok = p.locator('#dlg-ok');
      if (await ok.isVisible().catch(() => false)) { await ok.click(); await p.waitForTimeout(2500); await step('after confirming'); }
    }
    await p.evaluate(() => document.querySelectorAll('.overlay-screen').forEach(m => m.style.display = 'none'));
    await p.waitForTimeout(400);
  },
  emptyexplore: async (p, step) => {
    await p.click('#explore-btn');
    await p.waitForTimeout(3000);
    await step('the map, nothing caught yet');
    const card = p.locator('#habitat-grid .habitat-card').first();
    if (await card.count()) {
      await card.click();
      await p.waitForTimeout(6000);
      await step('walked into a habitat with no team');
      const tiles = p.locator('.move-btn.type-tile:not([disabled])');
      if (await tiles.count()) { await tiles.first().click(); await p.waitForTimeout(3000); await step('attacked once'); }
      await p.evaluate(() => document.querySelectorAll('.overlay-screen').forEach(m => m.style.display = 'none'));
    }
  },
  // A new player's actual first move: catch something on the dex.
  firstcatch: async (p, step) => {
    await p.waitForTimeout(1500);
    await step('dex, Pokemon #1, not caught');
    await p.click('#catch-btn'); await p.waitForTimeout(1000);
    await step('ball drawer — what can a new player afford');
    await p.locator('.ball-opt').first().click();
    await p.waitForTimeout(4500);
    await step('threw the very first ball');
    await p.waitForTimeout(3000);
    await step('after the throw settled');
  },
};

const report = { mode: MODE, vw: VW, scenarios: {}, consoleErrors: [] };
const browser = await chromium.launch();

for (const [name, fn] of Object.entries(SCRIPTS)) {
  if (ONLY && name !== ONLY) continue;
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, serviceWorkers: 'block', deviceScaleFactor: 2 });
  await mock(ctx);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(`${name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errs.push(`${name} console: ${m.text().slice(0, 200)}`); });

  // BRAND NEW PLAYER: no save at all, only mute so the run is quiet.
  await page.addInitScript(junior => {
    try {
      localStorage.clear();
      localStorage.setItem('pokedexos_muted', '1');
      if (junior) localStorage.setItem('__forceJunior', '1');
    } catch (e) {}
  }, MODE === 'junior');

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const steps = [];
  let n = 0;
  const step = async label => {
    n++;
    const slug = `${name}-${String(n).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`;
    await page.screenshot({ path: join(OUT, `${slug}.png`) });
    const obs = await page.evaluate(new Function('return ' + OBSERVE)());
    steps.push({ label, shot: `${slug}.png`, ...obs });
    if (obs.notes.length) console.log(`  [${MODE}/${name}] ${label}\n      ` + obs.notes.join('\n      '));
  };

  if (name !== 'firstboot') {
    // get past boot + picker like any player would, then (junior) flip the toggle
    await page.evaluate(() => document.getElementById('boot-screen')?.click());
    await page.waitForTimeout(1000);
    const choice = page.locator('.whoplaying-choice').first();
    if (await choice.count()) await choice.click();
    await page.waitForTimeout(2000);
    if (MODE === 'junior') {
      await page.click('#settings-btn'); await page.waitForTimeout(900);
      const jr = page.locator('#set-p1-junior').first();
      if (await jr.count()) await jr.click().catch(() => {});
      await page.waitForTimeout(900);
      await page.click('#settings-close').catch(() => {});
      await page.evaluate(() => document.querySelectorAll('.overlay-screen').forEach(m => m.style.display = 'none'));
      await page.waitForTimeout(1200);
      const isJ = await page.evaluate(() => document.body.className);
      console.log('  junior body class:', isJ);
    }
  }

  try { await fn(page, step); }
  catch (e) { steps.push({ label: 'ABORTED', error: e.message.split('\n')[0] }); console.log(`  [${MODE}/${name}] ABORTED: ${e.message.split('\n')[0]}`); }

  report.scenarios[name] = steps;
  report.consoleErrors.push(...errs);
  await ctx.close();
}
await browser.close();
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
console.log(`\n${MODE}: done -> ${OUT}`);
report.consoleErrors.slice(0, 20).forEach(e => console.log('  ERROR ' + e));
