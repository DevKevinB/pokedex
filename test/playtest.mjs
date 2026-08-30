// ============================================================
// Pokédex OS — synthetic playtest
//
// The scene harness proves nothing FALLS OFF the screen. It says nothing
// about whether the game is pleasant to play. This one actually plays it —
// catches things, walks into habitats, fights trainers, mashes buttons — and
// records what a person would see, so a reviewer can look for the class of
// bug a geometry assertion can never find: a sprite that is the wrong colour,
// an emoji jammed against its own caption, a button that does nothing, a
// screen that sits there.
//
//   node test/playtest.mjs                 play everything, normal mode
//   MODE=junior node test/playtest.mjs     play as ART
//   SCRIPT=battle node test/playtest.mjs   one scenario
//   SLOW=1 ...                             real timings instead of ?fast=1
//
// Output: test/playtest/<mode>/<scenario>-NN-<label>.png plus report.json,
// which lists every console error, every dead tap, and a per-step record of
// what was on screen.
// ============================================================

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://127.0.0.1:8321';
const HERE = new URL('.', import.meta.url).pathname;
const MODE = process.env.MODE === 'junior' ? 'junior' : 'normal';
const ONLY = process.env.SCRIPT || '';
const SLOW = process.env.SLOW === '1';
const REAL = process.env.REAL === '1';   // use the live sprite CDN
const OUT = join(HERE, 'playtest', MODE + (REAL ? '-real' : ''));
mkdirSync(OUT, { recursive: true });

const SPRITE = readFileSync(join(HERE, 'fake-sprite.png'));
const NAMES = { 1: 'bulbasaur', 4: 'charmander', 6: 'charizard', 25: 'pikachu', 74: 'geodude', 95: 'onix', 133: 'eevee' };

// Fixtures deliberately give DIFFERENT types and stats per id, so a bug where
// every Pokemon renders identically is visible rather than hidden by fixtures.
const TYPES = ['electric', 'fire', 'water', 'grass', 'rock', 'psychic'];
const pokemonFixture = id => ({
  id, name: NAMES[id] || `mon-${id}`, height: 4 + (id % 9), weight: 60 + id,
  base_experience: 112,
  types: [{ slot: 1, type: { name: TYPES[id % TYPES.length], url: '' } }],
  abilities: [{ ability: { name: 'static' } }],
  stats: [
    { base_stat: 40 + (id % 40), stat: { name: 'hp' } }, { base_stat: 45 + (id % 30), stat: { name: 'attack' } },
    { base_stat: 40, stat: { name: 'defense' } }, { base_stat: 50, stat: { name: 'special-attack' } },
    { base_stat: 50, stat: { name: 'special-defense' } }, { base_stat: 60, stat: { name: 'speed' } },
  ],
  cries: { latest: `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg` },
  species: { url: `https://pokeapi.co/api/v2/pokemon-species/${id}/` },
  sprites: {
    front_default: 'https://raw.githubusercontent.com/s/f.png', front_shiny: 'https://raw.githubusercontent.com/s/fs.png',
    back_default: 'https://raw.githubusercontent.com/s/b.png', back_shiny: null,
    other: { 'official-artwork': { front_default: null, front_shiny: null } },
    versions: { 'generation-v': { 'black-white': { animated: {
      front_default: 'https://raw.githubusercontent.com/s/a.gif', front_shiny: null,
      back_default: 'https://raw.githubusercontent.com/s/ab.gif', back_shiny: null } } } },
  },
  moves: [84, 98, 85, 231].map(n => ({ move: { name: `m${n}`, url: `https://pokeapi.co/api/v2/move/${n}/` } })),
});
const speciesFixture = id => ({
  capture_rate: 190,
  genera: [{ genus: 'Test Pokémon', language: { name: 'en' } }],
  flavor_text_entries: [1, 2, 3].map(n => ({ flavor_text: `Entry ${n} for species ${id}.`, language: { name: 'en' } })),
  evolution_chain: { url: 'https://pokeapi.co/api/v2/evolution-chain/10/' },
  is_legendary: id === 150, is_mythical: false,
});
const evoFixture = { chain: { species: { name: 'pichu', url: 'https://x/pokemon-species/172/' },
  evolves_to: [{ species: { name: 'pikachu', url: 'https://x/pokemon-species/25/' }, evolves_to: [] }] } };
const moveFixture = url => {
  const map = { 84: ['thunder-shock', 40, 'electric', 'special'], 98: ['quick-attack', 40, 'normal', 'physical'],
                85: ['thunderbolt', 90, 'electric', 'special'], 231: ['iron-tail', 100, 'steel', 'physical'] };
  const id = url.match(/move\/(\d+)/)?.[1] || '84';
  const [name, power, type, cls] = map[id] || map['84'];
  return { name, power, type: { name: type }, damage_class: { name: cls } };
};

async function mock(ctx) {
  await ctx.route('https://pokeapi.co/**', route => {
    // REAL=1 is a genuine playthrough: real API, real sprites, real names.
    // Fixtures are for determinism; this mode is for finding the bugs a
    // fixture hides.
    if (REAL) return route.continue();
    const u = route.request().url();
    let body;
    if (u.includes('pokemon-species')) body = speciesFixture(parseInt(u.match(/species\/(\d+)/)?.[1] || '25'));
    else if (u.includes('evolution-chain')) body = evoFixture;
    else if (u.includes('/move/')) body = moveFixture(u);
    else body = pokemonFixture(parseInt(u.match(/pokemon\/(\d+)/)?.[1] || '25'));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await ctx.route('https://raw.githubusercontent.com/**', r => {
    // cries are .ogg and Safari cannot play them; here they simply 404 so the
    // fallback path is the one under test
    if (r.request().url().endsWith('.ogg')) return r.fulfill({ status: 404, body: '' });
    // REAL=1 lets the actual sprite CDN through. A placeholder sprite hides
    // every bug that is ABOUT COLOUR — a greyscale filter leaking onto a live
    // sprite is invisible when every sprite is the same flat yellow square.
    if (REAL) return r.continue();
    return r.fulfill({ status: 200, contentType: 'image/png', body: SPRITE });
  });
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
}

const SEED = junior => ({
  version: 2,
  players: {
    1: { name: junior ? 'ART' : 'GABE',
      caught: [1, 4, 6, 25, 74, 95, 133], team: [6, 25, 1, 4, 74, 95],
      mons: Object.fromEntries([1, 4, 6, 25, 74, 95, 133].map(id => [id, { level: 14, xp: 30 }])),
      badges: [], shinies: [], nicks: {}, items: { masterBalls: 3 },
      quests: {}, gyms: { beaten: {} }, settings: { junior }, champion: null,
      stats: { catches: 7, battlesWon: 3, battlesLost: 0, versusWins: 0 } },
    2: { name: 'P2', caught: [1], team: [1], mons: { 1: { level: 5, xp: 0 } },
      badges: [], shinies: [], nicks: {}, items: { masterBalls: 1 },
      quests: {}, gyms: { beaten: {} }, settings: { junior: false }, champion: null,
      stats: { catches: 1, battlesWon: 0, battlesLost: 0, versusWins: 0 } },
  },
});

// ---- what a person would notice, measured ----
// Everything here answers "would this look wrong to Kevin?", which is the
// class of bug the geometry harness is blind to.
const OBSERVE = `() => {
  const vis = el => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05;
  };
  const notes = [];

  // 1. a battle sprite that is drained of colour when it should not be
  for (const id of ['wild-sprite', 'player-sprite']) {
    const el = document.getElementById(id);
    if (!vis(el)) continue;
    const f = getComputedStyle(el).filter || '';
    const g = /grayscale\\(([\\d.]+)\\)/.exec(f);
    const fainted = el.classList.contains('fainted');
    if (g && parseFloat(g[1]) > 0.1 && !fainted)
      notes.push('GREYSCALE SPRITE that is not fainted: #' + id + ' filter=' + f);
    if (fainted) notes.push('note: #' + id + ' is fainted (expected grey)');
  }

  // 2. an emoji jammed against its own caption, or overlapping it
  const overlaps = [];
  for (const btn of document.querySelectorAll('button, .habitat-card, .set-row')) {
    if (!vis(btn)) continue;
    const kids = [...btn.children].filter(vis);
    for (let i = 0; i < kids.length - 1; i++) {
      const a = kids[i].getBoundingClientRect(), b = kids[i + 1].getBoundingClientRect();
      const vertical = b.top >= a.bottom - 2;
      const gap = vertical ? b.top - a.bottom : b.left - a.right;
      if (gap < -1) overlaps.push({ el: btn.id || btn.className, gap: Math.round(gap), kind: 'OVERLAP' });
      else if (gap >= 0 && gap < 2 && !vertical) overlaps.push({ el: btn.id || btn.className, gap: Math.round(gap), kind: 'TOUCHING' });
    }
    // text sitting immediately after an emoji with no space at all
    const t = (btn.textContent || '').trim();
    if (/[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}][A-Za-z0-9]/u.test(t))
      overlaps.push({ el: btn.id || btn.className, kind: 'NO SPACE AFTER EMOJI', text: t.slice(0, 28) });
  }
  for (const o of overlaps.slice(0, 12))
    notes.push(o.kind + ': ' + o.el + (o.gap !== undefined ? ' gap=' + o.gap + 'px' : '') + (o.text ? ' "' + o.text + '"' : ''));

  // 3. a sprite that never loaded, or loaded as a 1x1
  for (const img of document.querySelectorAll('img')) {
    if (!vis(img)) continue;
    if (img.complete && img.naturalWidth === 0)
      notes.push('BROKEN IMAGE: ' + (img.id || img.className) + ' src=' + String(img.src).slice(-40));
  }

  // 4. text that overflows its own box
  for (const el of document.querySelectorAll('button, .card-title, .pkmn-name, .tile-name, .habitat-card span')) {
    if (!vis(el)) continue;
    if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible')
      notes.push('TEXT CLIPPED: ' + (el.id || el.className) + ' "' + (el.textContent || '').trim().slice(0, 24) + '"');
  }

  return {
    notes,
    screen: (() => {
      const bc = document.getElementById('battle-container');
      if (bc && bc.classList.contains('active')) return 'battle';
      for (const id of ['pc-modal', 'settings-modal', 'card-modal', 'victory-modal', 'dev-modal', 'sticker-modal'])
        if (vis(document.getElementById(id))) return id;
      for (const id of ['explore-container', 'gym-container'])
        if (document.getElementById(id)?.getBoundingClientRect().top < 40) return id;
      return 'dex';
    })(),
    log: (document.getElementById('battle-log')?.innerText || '').trim().slice(0, 60),
  };
}`;

// ---- the scenarios: things the boys actually do ----
const SCRIPTS = {
  async dex(p, step) {
    await step('opened the dex');
    for (let i = 0; i < 3; i++) { await p.click('#nav-next'); await p.waitForTimeout(700); }
    await step('flicked forward three Pokemon');
    await p.click('#poke-sprite'); await p.waitForTimeout(600);
    await step('poked the Pokemon');
    await p.click('#shiny-btn'); await p.waitForTimeout(700);
    await step('toggled shiny');
    await p.click('#cry-btn'); await p.waitForTimeout(600);
    await step('pressed CRY');
    await p.click('#random-btn').catch(() => {}); await p.waitForTimeout(900);
    await step('pressed random');
  },
  async catching(p, step) {
    await p.click('#nav-next'); await p.waitForTimeout(900);   // an uncaught one
    await step('found an uncaught Pokemon');
    await p.click('#catch-btn'); await p.waitForTimeout(700);
    await step('opened the ball drawer');
    await p.locator('.ball-opt').first().click(); await p.waitForTimeout(2600);
    await step('threw a ball');
  },
  async battle(p, step) {
    await p.click('#explore-btn');
    await p.waitForFunction(() => document.querySelectorAll('#habitat-grid .habitat-card').length > 0, null, { timeout: 15000 });
    await step('opened the map');
    await p.locator('#habitat-grid .habitat-card:not(.locked)').first().click();
    await p.waitForFunction(() => document.getElementById('battle-container')?.classList.contains('active'), null, { timeout: 25000 });
    await p.waitForTimeout(1500);
    await step('a wild Pokemon appeared');           // <-- greyscale reported here
    for (let turn = 0; turn < 4; turn++) {
      const tiles = p.locator('.move-btn.type-tile:not([disabled])');
      if (!(await tiles.count())) break;
      await tiles.first().click();
      await p.waitForTimeout(SLOW ? 3200 : 1400);
      await step(`attacked (turn ${turn + 1})`);
      if (await p.locator('#victory-modal').isVisible().catch(() => false)) { await step('the fight ended'); break; }
    }
    if (await p.locator('#ball-btn').isVisible().catch(() => false)) {
      await p.click('#ball-btn'); await p.waitForTimeout(900);
      await step('pressed BALL');
    }
  },
  async gym(p, step) {
    await p.click('#gyms-btn');
    await p.waitForFunction(() => document.querySelectorAll('#gym-body .gym-card').length > 0, null, { timeout: 15000 });
    await step('opened the gym circuit');
    await p.locator('#gym-body .gym-card').first().click(); await p.waitForTimeout(1400);
    await step('opened a gym');
    const t = p.locator('.trainer-card:not(.locked)').first();
    if (await t.count()) {
      await t.click(); await p.waitForTimeout(1200);
      const ok = p.locator('#dlg-ok');
      if (await ok.isVisible().catch(() => false)) await ok.click();
      await p.waitForFunction(() => document.getElementById('battle-container')?.classList.contains('active'), null, { timeout: 25000 }).catch(() => {});
      await p.waitForTimeout(1600);
      await step('started a trainer fight');
      for (let turn = 0; turn < 6; turn++) {
        const tiles = p.locator('.move-btn.type-tile:not([disabled])');
        if (!(await tiles.count())) break;
        await tiles.first().click();
        await p.waitForTimeout(SLOW ? 3200 : 1500);
        if (turn % 2 === 1) await step(`trainer fight turn ${turn + 1}`);
        if (await p.locator('#victory-modal').isVisible().catch(() => false)) { await step('won the trainer fight'); break; }
      }
    }
  },
  async collection(p, step) {
    await p.click('#pc-btn'); await p.waitForTimeout(1600);
    await step('opened the PC box');
    await p.locator('.pc-item').nth(3).click().catch(() => {}); await p.waitForTimeout(800);
    await step('tapped a Pokemon in the box');
    await p.click('#close-pc-btn').catch(() => {}); await p.waitForTimeout(600);
    await p.click('#card-btn'); await p.waitForTimeout(1200);
    await step('opened the trainer card');
  },
  // A four-year-old with a fast finger. Nothing here should ever produce an
  // error overlay or a screen with no way out.
  async mash(p, step) {
    const targets = ['#catch-btn', '#nav-next', '#nav-prev', '#pc-btn', '#close-pc-btn',
                     '#explore-btn', '#explore-back-btn', '#gyms-btn', '#gym-back-btn',
                     '#card-btn', '#card-close', '#poke-sprite', '#shiny-btn'];
    for (let i = 0; i < 40; i++) {
      const sel = targets[(i * 7 + 3) % targets.length];
      const el = p.locator(sel).first();
      if (await el.isVisible().catch(() => false)) await el.click({ timeout: 1500 }).catch(() => {});
      await p.waitForTimeout(110);
      if (i % 13 === 12) await step(`mashing (${i + 1} taps)`);
    }
    await p.waitForTimeout(1200);
    await step('after the mashing stopped');
  },
};

// ---- run ----
const report = { mode: MODE, version: null, scenarios: {}, consoleErrors: [], deadTaps: [] };
const browser = await chromium.launch();

for (const [name, fn] of Object.entries(SCRIPTS)) {
  if (ONLY && name !== ONLY) continue;
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, serviceWorkers: 'block', deviceScaleFactor: 2,
  });
  await mock(ctx);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(`${name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errs.push(`${name} console: ${m.text().slice(0, 200)}`); });

  await page.addInitScript(save => {
    try {
      localStorage.setItem('pokedexos_save_v2', JSON.stringify(save));
      localStorage.setItem('pokedexos_lastplayer', '1');
      localStorage.setItem('pokedexos_muted', '1');
    } catch (e) {}
  }, SEED(MODE === 'junior'));

  await page.goto(`${BASE}/${SLOW ? '' : '?fast=1'}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  report.version = await page.locator('#boot-version').textContent().catch(() => null);
  await page.evaluate(() => document.getElementById('boot-screen')?.click());
  await page.waitForTimeout(700);
  await page.evaluate(() => document.getElementById('whoplaying-modal')?.remove());
  await page.waitForTimeout(1400);

  const steps = [];
  let n = 0;
  const step = async label => {
    n++;
    const slug = `${name}-${String(n).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 34)}`;
    await page.screenshot({ path: join(OUT, `${slug}.png`) });
    const obs = await page.evaluate(new Function('return ' + OBSERVE)());
    steps.push({ label, shot: `${slug}.png`, ...obs });
    if (obs.notes.length) console.log(`  [${MODE}/${name}] ${label}\n      ` + obs.notes.join('\n      '));
  };

  try { await fn(page, step); }
  catch (e) { steps.push({ label: 'SCENARIO ABORTED', error: e.message.split('\n')[0] }); console.log(`  [${MODE}/${name}] ABORTED: ${e.message.split('\n')[0]}`); }

  report.scenarios[name] = steps;
  report.consoleErrors.push(...errs);
  await ctx.close();
}
await browser.close();

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
const noteCount = Object.values(report.scenarios).flat().reduce((a, s) => a + (s.notes?.length || 0), 0);
console.log(`\n${MODE}: ${Object.keys(report.scenarios).length} scenarios, ${noteCount} observations, ${report.consoleErrors.length} console/page errors`);
console.log(`screens: test/playtest/${MODE}/   report: test/playtest/${MODE}/report.json`);
if (report.consoleErrors.length) report.consoleErrors.slice(0, 10).forEach(e => console.log('  ERROR ' + e));
