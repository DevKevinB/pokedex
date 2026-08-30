// ============================================================
// Pokédex OS — scene harness
//
// smoke.mjs proves the game's LOGIC works. Nothing proved its LAYOUT works,
// and layout is exactly where this app has hurt the boys: Junior Mode has
// slid off the bottom of the screen twice without a single test noticing.
//
// This walks the real app to each screen, at both phone sizes, in both modes,
// and asserts things that must never be false — no button off the screen, the
// Pokéball always reachable in a fight, no text under 8px. It also stores the
// position of key elements so an accidental shove of 12px+ shows up as a
// failure instead of a surprise on the iPad.
//
//   python3 -m http.server 8321 &
//   node test/scenes.mjs                  run everything
//   SCENE=battle-wild node test/scenes.mjs   run one scene
//   UPDATE_BASELINE=1 node test/scenes.mjs   accept the current positions
// ============================================================

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://127.0.0.1:8321';
const HERE = new URL('.', import.meta.url).pathname;
const SHOTS = join(HERE, 'shots');
const BASELINE = join(HERE, 'baseline');
const UPDATE = process.env.UPDATE_BASELINE === '1';
const UPDATE_KNOWN = process.env.UPDATE_KNOWN === '1';
const KNOWN_FILE = join(HERE, 'known-issues.json');
const ONLY = process.env.SCENE || '';
const DRIFT = 12;               // px a box may move before we call it a regression
const FLOOR_PX = 8;             // CLAUDE.md's typography floor

mkdirSync(SHOTS, { recursive: true });
mkdirSync(BASELINE, { recursive: true });

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },   // the boys' iPhone-class size
  { name: '375x667', width: 375, height: 667 },   // the smallest phone we support
];

// ---- fixtures: no network, ever ----------------------------------------
const SPRITE = readFileSync(join(HERE, 'fake-sprite.png'));
const NAMES = { 1: 'bulbasaur', 4: 'charmander', 6: 'charizard', 25: 'pikachu', 74: 'geodude', 95: 'onix' };

const pokemonFixture = id => ({
  id, name: NAMES[id] || `mon-${id}`, height: 4, weight: 60, base_experience: 112,
  types: [{ slot: 1, type: { name: 'electric', url: '' } }],
  abilities: [{ ability: { name: 'static' } }, { ability: { name: 'lightning-rod' } }],
  stats: [
    { base_stat: 45, stat: { name: 'hp' } }, { base_stat: 55, stat: { name: 'attack' } },
    { base_stat: 40, stat: { name: 'defense' } }, { base_stat: 50, stat: { name: 'special-attack' } },
    { base_stat: 50, stat: { name: 'special-defense' } }, { base_stat: 90, stat: { name: 'speed' } },
  ],
  cries: { latest: null },
  species: { url: `https://pokeapi.co/api/v2/pokemon-species/${id}/` },
  sprites: {
    front_default: 'https://raw.githubusercontent.com/s/f.png', front_shiny: null,
    back_default: 'https://raw.githubusercontent.com/s/b.png', back_shiny: null,
    other: { 'official-artwork': { front_default: null, front_shiny: null } },
    versions: { 'generation-v': { 'black-white': { animated: {
      front_default: 'https://raw.githubusercontent.com/s/a.gif', front_shiny: null,
      back_default: 'https://raw.githubusercontent.com/s/ab.gif', back_shiny: null } } } },
  },
  moves: [
    { move: { name: 'thunder-shock', url: 'https://pokeapi.co/api/v2/move/84/' } },
    { move: { name: 'quick-attack', url: 'https://pokeapi.co/api/v2/move/98/' } },
    { move: { name: 'thunderbolt', url: 'https://pokeapi.co/api/v2/move/85/' } },
    { move: { name: 'iron-tail', url: 'https://pokeapi.co/api/v2/move/231/' } },
  ],
});
const speciesFixture = () => ({
  capture_rate: 190,
  genera: [{ genus: 'Mouse Pokémon', language: { name: 'en' } }],
  flavor_text_entries: [{ flavor_text: 'A short entry used by the layout harness.', language: { name: 'en' } }],
  evolution_chain: { url: 'https://pokeapi.co/api/v2/evolution-chain/10/' },
  is_legendary: false, is_mythical: false,
});
const evoFixture = { chain: { species: { name: 'pichu', url: 'https://x/pokemon-species/172/' },
  evolves_to: [{ species: { name: 'pikachu', url: 'https://x/pokemon-species/25/' }, evolves_to: [] }] } };
const moveFixture = url => {
  const map = { 84: ['thunder-shock', 40, 'electric'], 98: ['quick-attack', 40, 'normal'],
                85: ['thunderbolt', 90, 'electric'], 231: ['iron-tail', 100, 'steel'] };
  const id = url.match(/move\/(\d+)/)?.[1] || '84';
  const [name, power, type] = map[id] || map['84'];
  return { name, power, type: { name: type }, damage_class: { name: 'special' } };
};

async function mock(ctx) {
  await ctx.route('https://pokeapi.co/**', route => {
    const url = route.request().url();
    let body;
    if (url.includes('pokemon-species')) body = speciesFixture();
    else if (url.includes('evolution-chain')) body = evoFixture;
    else if (url.includes('/move/')) body = moveFixture(url);
    else body = pokemonFixture(parseInt(url.match(/pokemon\/(\d+)/)?.[1] || '25'));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await ctx.route('https://raw.githubusercontent.com/**', r =>
    r.fulfill({ status: 200, contentType: 'image/png', body: SPRITE }));
  await ctx.route('https://fonts.googleapis.com/**', r =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
}

// A save with a real team, so screens have something to render.
const SEED = junior => ({
  version: 2,
  players: {
    1: {
      name: junior ? 'ART' : 'GABE',
      caught: [1, 4, 6, 25, 74, 95],
      team: [6, 25, 1, 4, 74, 95],
      mons: Object.fromEntries([1, 4, 6, 25, 74, 95].map(id => [id, { level: 12, xp: 20 }])),
      badges: [], shinies: [], nicks: {}, items: { masterBalls: 3 },
      quests: {}, gyms: { beaten: {} }, settings: { junior },
      champion: null,
      stats: { catches: 6, battlesWon: 2, battlesLost: 0, versusWins: 0 },
    },
    2: {
      name: 'P2', caught: [1], team: [1], mons: { 1: { level: 5, xp: 0 } },
      badges: [], shinies: [], nicks: {}, items: { masterBalls: 1 },
      quests: {}, gyms: { beaten: {} }, settings: { junior: false },
      champion: null, stats: { catches: 1, battlesWon: 0, battlesLost: 0, versusWins: 0 },
    },
  },
});

// ---- scenes -------------------------------------------------------------
// Each scene walks the REAL UI. `battle: true` turns on the fight-specific
// invariants. `skipJunior` is for controls Junior Mode deliberately hides.
const SCENES = [
  { name: 'dex', boxes: ['#poke-sprite', '#poke-name', '.toolbar', '#catch-btn'],
    async go(p) { /* the landing screen */ } },

  { name: 'dex-drawer', boxes: ['#ball-drawer', '#catch-btn'],
    async go(p) { await p.click('#catch-btn'); await p.waitForTimeout(500); } },

  { name: 'data-sheet', skipJunior: true, boxes: ['#data-sheet', '#sheet-handle'],
    async go(p) { await p.click('#data-btn'); await p.waitForTimeout(900); } },

  { name: 'pc', boxes: ['#pc-modal', '#close-pc-btn'],
    async go(p) { await p.click('#pc-btn'); await p.waitForTimeout(1200); } },

  { name: 'card', boxes: ['#card-modal .modal-box', '#card-close'],
    async go(p) { await p.click('#card-btn'); await p.waitForTimeout(900); } },

  { name: 'explore', boxes: ['#habitat-grid', '#explore-back-btn'],
    async go(p) { await p.click('#explore-btn'); await p.waitForTimeout(1200); } },

  { name: 'gyms', boxes: ['#gym-body', '#gym-back-btn'],
    async go(p) { await p.click('#gyms-btn'); await p.waitForTimeout(1200); } },

  { name: 'gym-trainers', boxes: ['#gym-back-btn'],
    async go(p) {
      await p.click('#gyms-btn'); await p.waitForTimeout(1000);
      await p.waitForFunction(() => document.querySelectorAll('#gym-body .gym-card').length > 0,
        null, { timeout: 15000 });
      await p.locator('#gym-body .gym-card').first().click({ timeout: 15000 });
      await p.waitForTimeout(1200);
    } },

  { name: 'settings', boxes: ['#settings-modal .modal-box', '#settings-close'],
    async go(p) { await p.click('#settings-btn'); await p.waitForTimeout(700); } },

  { name: 'battle-wild', battle: true, boxes: ['.battle-controls', '#ball-btn', '.moves-grid'],
    async go(p) {
      // The habitat route: the way most fights actually start for both boys.
      await p.click('#explore-btn');
      await p.waitForFunction(
        () => document.querySelectorAll('#habitat-grid .habitat-card').length > 0,
        null, { timeout: 15000 });
      await p.waitForTimeout(600);
      await p.locator('#habitat-grid .habitat-card:not(.locked)').first().click({ timeout: 15000 });
      await p.waitForFunction(() => document.getElementById('battle-container')?.classList.contains('active'),
        null, { timeout: 25000 });
      await p.waitForTimeout(1800);
    } },
];

// ---- the invariants -----------------------------------------------------
// Everything here is measured in the page, so a failure names a real element
// with real numbers rather than "it looked wrong".
const INVARIANTS = `(opts) => {
  const { isBattle, floorPx } = opts;
  const vw = window.innerWidth, vh = window.innerHeight;
  const fails = [];
  // Only ever judge the screen the boys are actually looking at. The app keeps
  // every other screen in the DOM, parked off-canvas, and a parked screen's
  // buttons are "off-screen" by design — measuring those is how a harness
  // cries wolf until nobody reads it any more.
  const onTop = () => {
    const stacked = [...document.querySelectorAll('.overlay-screen, #pc-modal, #ball-drawer')]
      .filter(o => {
        const s = getComputedStyle(o);
        const r = o.getBoundingClientRect();
        // A panel parked entirely below the fold (the closed ball drawer) is
        // hidden by position, not by display — it is not the screen on top.
        return s.display !== 'none' && s.visibility !== 'hidden' &&
               parseFloat(s.opacity) > 0.05 && r.width > 0 && r.height > 0 &&
               r.bottom > 0 && r.top < window.innerHeight - 8;
      });
    if (stacked.length) {
      return stacked.sort((a, b) =>
        (parseInt(getComputedStyle(a).zIndex) || 0) - (parseInt(getComputedStyle(b).zIndex) || 0)
      ).pop();
    }
    const bc = document.getElementById('battle-container');
    if (bc && bc.classList.contains('active')) return bc;
    for (const id of ['explore-container', 'gym-container']) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top < window.innerHeight * 0.5) return el;
    }
    return document.getElementById('app-body') || document.body;
  };
  const root = onTop();
  const inRoot = el => root.contains(el);

  const vis = el => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0.05;
  };
  const name = el => {
    const id = el.id ? '#' + el.id : '';
    const cls = (el.className && el.className.toString().trim().split(/\\s+/)[0]) || '';
    return el.tagName.toLowerCase() + id + (cls ? '.' + cls : '') +
      ' "' + (el.textContent || '').trim().slice(0, 24) + '"';
  };

  // 1. nothing tappable may sit outside the screen
  for (const el of root.querySelectorAll('button, .modal-box, .habitat-card, .pc-item, .ball-opt')) {
    if (!vis(el) || !inRoot(el)) continue;
    // Skip anything inside a container parked wholly off the bottom (a closed
    // drawer). Its own scene opens it, and that is where it gets judged.
    let parked = false;
    for (let a = el; a && a !== root; a = a.parentElement) {
      if (a.getBoundingClientRect().top >= vh - 4) { parked = true; break; }
    }
    if (parked) continue;
    // An item below the fold of a list you can scroll is reachable, so it is
    // not a bug. Only complain when nothing between the element and the page
    // scrolls on that axis — that is when a finger truly cannot get there.
    let sc = el.parentElement, scrollsY = false, scrollsX = false;
    while (sc && sc !== document.documentElement) {
      const cs = getComputedStyle(sc);
      if (/(auto|scroll)/.test(cs.overflowY) && sc.scrollHeight > sc.clientHeight + 4) scrollsY = true;
      if (/(auto|scroll)/.test(cs.overflowX) && sc.scrollWidth > sc.clientWidth + 4) scrollsX = true;
      sc = sc.parentElement;
    }
    if (document.documentElement.scrollHeight > window.innerHeight + 4) scrollsY = true;
    const r = el.getBoundingClientRect();
    if (!scrollsY && r.bottom > vh + 1) fails.push('OFF-SCREEN BOTTOM by ' + Math.round(r.bottom - vh) + 'px: ' + name(el));
    else if (!scrollsX && r.right > vw + 1) fails.push('OFF-SCREEN RIGHT by ' + Math.round(r.right - vw) + 'px: ' + name(el));
  }

  // 2. in a fight, the ball and the way out must both be reachable
  if (isBattle) {
    for (const sel of ['#ball-btn', '#escape-btn']) {
      const el = document.querySelector(sel);
      if (!el) { fails.push('MISSING in battle: ' + sel); continue; }
      if (!vis(el)) { fails.push('NOT VISIBLE in battle: ' + sel); continue; }
      const r = el.getBoundingClientRect();
      if (r.bottom > vh + 1 || r.top < -1 || r.right > vw + 1)
        fails.push('UNREACHABLE in battle: ' + sel + ' at top ' + Math.round(r.top) + ' bottom ' + Math.round(r.bottom) + ' (viewport ' + vh + ')');
    }
    // 3. the wild HP box must not cover the wild Pokémon
    const hp = document.querySelector('.hp-box-wild, #wild-hp-box, .battle-hud-wild');
    const sp = document.querySelector('#wild-sprite');
    if (hp && sp && vis(hp) && vis(sp)) {
      const a = hp.getBoundingClientRect(), b = sp.getBoundingClientRect();
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 8 && oy > 8) fails.push('HP BOX COVERS THE WILD SPRITE by ' + Math.round(ox) + 'x' + Math.round(oy) + 'px');
    }
  }

  // 4. the 8px typography floor
  const seen = new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const t = (n.textContent || '').trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el || !vis(el)) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < floorPx - 0.01) {
      const cls = (el.className && el.className.toString().trim().split(/\\s+/).join('.')) || '';
      const rule = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '');
      const key = rule + '|' + size;
      if (!seen.has(key)) {
        seen.add(key);
        fails.push('TEXT BELOW ' + floorPx + 'px (' + size + 'px): ' + rule);
      }
    }
  }
  return fails.map(f => f + '   [screen: ' + (root.id ? '#' + root.id : root.tagName.toLowerCase()) + ']');
}`;

const measure = `(sels) => {
  const out = {};
  for (const s of sels) {
    const el = document.querySelector(s);
    if (!el) { out[s] = null; continue; }
    const r = el.getBoundingClientRect();
    out[s] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }
  return out;
}`;

// ---- runner -------------------------------------------------------------
async function openApp(ctx, junior) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.__errors = errors;
  // Seed the save BEFORE the app boots, so no mid-flow reload is ever needed
  // (reloading mid-flow trips the app's global error net and fakes a bug).
  await page.addInitScript(save => {
    try {
      localStorage.setItem('pokedexos_save_v2', JSON.stringify(save));
      localStorage.setItem('pokedexos_lastplayer', '1');
      localStorage.setItem('pokedexos_muted', '1');
    } catch (e) {}
  }, SEED(junior));
  await page.goto(`${BASE}/?fast=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.getElementById('boot-screen')?.click());
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById('whoplaying-modal')?.remove());
  await page.waitForFunction(
    () => !/^\s*$|LOADING/.test(document.getElementById('poke-name')?.innerText || ''),
    null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(900);
  return page;
}

// Known issues: real bugs that are already scheduled for a named release.
// They are listed, never hidden, so the harness can act as a gate against NEW
// breakage today instead of sitting red until every old bug is fixed. Delete
// entries as the fixes land; UPDATE_KNOWN=1 rewrites the file.
const known = existsSync(KNOWN_FILE) && !UPDATE_KNOWN
  ? JSON.parse(readFileSync(KNOWN_FILE, 'utf8')) : {};
const knownSeen = {};
const results = { pass: 0, fail: 0, drift: 0, knownCount: 0, failures: [] };

const browser = await chromium.launch();
for (const scene of SCENES) {
  if (ONLY && scene.name !== ONLY) continue;
  for (const vp of VIEWPORTS) {
    for (const junior of [false, true]) {
      const mode = junior ? 'junior' : 'normal';
      const id = `${scene.name}-${vp.name}-${mode}`;
      if (scene.skipJunior && junior) continue;

      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        serviceWorkers: 'block', deviceScaleFactor: 1,
      });
      await mock(ctx);
      let page;
      try {
        page = await openApp(ctx, junior);
        await scene.go(page);
        await page.waitForTimeout(400);
      } catch (e) {
        results.fail++;
        results.failures.push({ id, kind: 'FLOW', lines: [`could not reach the scene: ${e.message.split('\n')[0]}`] });
        if (page) await page.screenshot({ path: join(SHOTS, `${id}-FLOWFAIL.png`) }).catch(() => {});
        await ctx.close();
        continue;
      }

      await page.screenshot({ path: join(SHOTS, `${id}.png`) });

      const fails = await page.evaluate(
        new Function('return ' + INVARIANTS)(),
        { isBattle: !!scene.battle, floorPx: FLOOR_PX });

      // baselines
      const boxes = await page.evaluate(new Function('return ' + measure)(), scene.boxes || []);
      const bfile = join(BASELINE, `${id}.json`);
      const driftLines = [];
      if (UPDATE || !existsSync(bfile)) {
        writeFileSync(bfile, JSON.stringify(boxes, null, 1));
      } else {
        const prev = JSON.parse(readFileSync(bfile, 'utf8'));
        for (const [sel, now] of Object.entries(boxes)) {
          const was = prev[sel];
          if (!was && !now) continue;
          if (!was || !now) { driftLines.push(`${sel}: ${was ? 'disappeared' : 'appeared'}`); continue; }
          for (const k of ['x', 'y', 'w', 'h']) {
            if (Math.abs(was[k] - now[k]) > DRIFT)
              driftLines.push(`${sel}.${k} moved ${was[k]} → ${now[k]}`);
          }
        }
      }

      const errs = page.__errors.filter(e => !/favicon/i.test(e));
      const lines = [...fails, ...errs.map(e => `PAGE ERROR: ${e}`)];
      if (driftLines.length) { results.drift++; lines.push(...driftLines.map(d => `MOVED: ${d}`)); }

      knownSeen[id] = lines;
      const kn = known[id] || [];
      const fresh = lines.filter(l => !kn.includes(l));
      results.knownCount += lines.length - fresh.length;
      if (fresh.length) { results.fail++; results.failures.push({ id, kind: fails.length ? 'LAYOUT' : 'DRIFT', lines: fresh }); }
      else results.pass++;

      await ctx.close();
    }
  }
}
await browser.close();

if (UPDATE_KNOWN) {
  // Merge, never replace: running one scene with SCENE=... must not delete the
  // recorded issues for every other scene.
  const out = ONLY && existsSync(KNOWN_FILE) ? JSON.parse(readFileSync(KNOWN_FILE, 'utf8')) : {};
  for (const [id, lines] of Object.entries(knownSeen)) {
    if (lines.length) out[id] = lines; else delete out[id];
  }
  writeFileSync(KNOWN_FILE, JSON.stringify(out, null, 1));
  console.log(`\nwrote test/known-issues.json (${Object.values(out).flat().length} known issues)`);
}

// ---- report -------------------------------------------------------------
const total = results.pass + results.fail;
console.log(`\n${'='.repeat(64)}`);
if (results.failures.length) {
  for (const f of results.failures) {
    console.log(`\n✗ ${f.id}  [${f.kind}]`);
    for (const l of f.lines) console.log(`    ${l}`);
  }
  console.log(`\n${'='.repeat(64)}`);
}
console.log(`${total} scene runs — ${results.pass} passed, ${results.fail} failed`);
if (results.knownCount) {
  const ids = Object.keys(known).length;
  console.log(`${results.knownCount} known issue(s) across ${ids} scene run(s) tolerated — see test/known-issues.json`);
  console.log('  (these are real bugs already scheduled; delete entries as fixes land)');
}
console.log(`screenshots: test/shots/   baselines: test/baseline/`);
if (UPDATE) console.log('baselines were REWRITTEN (UPDATE_BASELINE=1)');
console.log('');
process.exit(results.fail ? 1 : 0);
