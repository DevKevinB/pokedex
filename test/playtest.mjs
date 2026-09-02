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
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://127.0.0.1:8321';
const HERE = new URL('.', import.meta.url).pathname;
const MODE = process.env.MODE === 'junior' ? 'junior' : 'normal';
const ONLY = process.env.SCRIPT || '';
const SLOW = process.env.SLOW === '1';
const REAL = process.env.REAL === '1';   // use the live sprite CDN
const PROFILE = process.env.SEED || 'early';   // fresh | early | mid | champion | hoarder
const VW = +(process.env.VW || 390), VH = +(process.env.VH || 844);
// One directory per distinct run shape. The profile is part of the identity:
// without it a champion run would overwrite the early run's evidence.
const OUT = join(HERE, 'playtest', MODE + (REAL ? '-real' : '')
  + (VW !== 390 ? `-${VW}x${VH}` : '') + (PROFILE !== 'early' ? `-${PROFILE}` : ''));
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

// ---- save profiles ----
// Until v20 there was exactly ONE seed here — 7 caught at Lv14 — so every run
// ever taken showed the same mid-early game. Whole regions of the product were
// therefore never seen by any harness: the first sixty seconds, the grind band,
// and everything v19.8 added behind the crown (Round 2, the evolution picker,
// the Hall of Fame). SEED= picks the save the run starts from.
// The REAL gym keys and trainer counts, read out of js/gymdata.js. Guessing
// these once already produced champion and mid saves whose gyms were not
// actually beaten — the game ignored the made-up keys entirely and the whole
// corpus would have been a fiction. 58 trainers across 12 stops.
const GYM_KEYS = [['rock', 5], ['water', 5], ['electric', 5], ['grass', 5],
                  ['psychic', 5], ['fighting', 5], ['ghost', 5], ['ice', 5],
                  ['fire', 5], ['dragon', 5], ['victory', 3], ['elite', 5]];

const beatenThrough = n => {
  const out = {};
  for (const [k, count] of GYM_KEYS.slice(0, n)) {
    for (let i = 0; i < count; i++) out[`${k}:${i}`] = true;
  }
  return out;
};

// A save whose gyms are beaten but whose badge list is empty is not a save the
// game can ever produce — seeded that way, the app correctly awards every badge
// at once on boot and stacks the celebration cards over whatever the player is
// doing. The profiles carry the badges their progress implies, so the corpus
// shows the real game rather than an artefact of how it was seeded.
const badgesFor = ({ gyms = 0, caught = 0, topLevel = 0, shinies = 0, champion = false }) => {
  const out = GYM_KEYS.slice(0, Math.min(gyms, 10)).map(([k]) => `gym-${k}`);
  if (gyms >= 12) out.push('gauntlet');
  if (champion) out.push('champion');
  if (caught >= 100) out.push('dex100');
  if (caught >= 300) out.push('dex300');
  if (caught >= 649) out.push('dex649');
  if (topLevel >= 60) out.push('lv60');
  if (shinies >= 1) out.push('shiny1');
  return out;
};

const monsAt = (ids, level) =>
  Object.fromEntries(ids.map(id => [id, { level, xp: 30 }]));

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const PROFILES = {
  // The first sixty seconds. Nothing caught, nothing unlocked, every empty
  // state on show — the screens a brand-new player meets and nobody tests.
  fresh: () => ({
    caught: [], team: [], mons: {}, badges: [], items: { masterBalls: 1 },
    gyms: { beaten: {} }, champion: null,
    stats: { catches: 0, battlesWon: 0, battlesLost: 0, versusWins: 0 },
  }),
  // The historical seed. Kept byte-identical so older runs stay comparable.
  early: () => ({
    caught: [1, 4, 6, 25, 74, 95, 133], team: [6, 25, 1, 4, 74, 95],
    mons: monsAt([1, 4, 6, 25, 74, 95, 133], 14),
    badges: [], items: { masterBalls: 3 }, gyms: { beaten: {} }, champion: null,
    stats: { catches: 7, battlesWon: 3, battlesLost: 0, versusWins: 0 },
  }),
  // The grind band: four stops in, a real team, the middle of the circuit.
  mid: () => {
    const caught = range(1, 60).concat(range(120, 180));
    return {
      caught, team: [6, 25, 9, 143, 130, 65],
      mons: monsAt(caught, 30),
      badges: badgesFor({ gyms: 4, caught: caught.length, topLevel: 30 }),
      items: { masterBalls: 2 }, gyms: { beaten: beatenThrough(4) },
      champion: null,
      stats: { catches: caught.length, battlesWon: 22, battlesLost: 3, versusWins: 1 },
    };
  },
  // After the crown. The ONLY profile that reaches Round 2, the evolution
  // picker and the Hall of Fame — all of v19.8, none of it ever playtested.
  champion: () => {
    const caught = range(1, 151).concat(range(250, 300));
    return {
      caught, team: [6, 25, 9, 143, 130, 149],
      mons: monsAt(caught, 62),
      badges: badgesFor({ gyms: 12, caught: caught.length, topLevel: 62, champion: true }),
      items: { masterBalls: 5 }, gyms: { beaten: beatenThrough(12) },
      champion: { date: '2026-08-30', team: [6, 25, 9, 143, 130, 149],
                  levels: { 6: 70, 25: 65, 9: 64, 143: 66, 130: 63, 149: 68 } },
      stats: { catches: caught.length, battlesWon: 58, battlesLost: 4, versusWins: 3 },
    };
  },
  // Scale, and the quota path. 600+ caught, a full box, long nicknames — the
  // shape that makes the API cache overflow and the PC box work for a living.
  hoarder: () => {
    const caught = range(1, 620);
    const nicks = {};
    for (const id of caught.slice(0, 40)) nicks[id] = 'LONGNAME' + (id % 10);
    return {
      caught, team: [6, 25, 9, 143, 130, 149],
      mons: monsAt(caught, 55), nicks,
      badges: badgesFor({ gyms: 8, caught: caught.length, topLevel: 55, shinies: 12 }),
      items: { masterBalls: 9 }, gyms: { beaten: beatenThrough(8) },
      champion: null,
      shinies: caught.slice(0, 12),
      stats: { catches: caught.length, battlesWon: 140, battlesLost: 11, versusWins: 6 },
    };
  },
};

const SEED = (junior, profile = 'early') => {
  const p = (PROFILES[profile] || PROFILES.early)();
  return {
    version: 2,
    players: {
      1: {
        name: junior ? 'ART' : 'GABE',
        shinies: [], nicks: {}, quests: {},
        ...p,
        settings: { junior },
      },
      2: { name: 'P2', caught: [1], team: [1], mons: { 1: { level: 5, xp: 0 } },
        badges: [], shinies: [], nicks: {}, items: { masterBalls: 1 },
        quests: {}, gyms: { beaten: {} }, settings: { junior: false }, champion: null,
        stats: { catches: 1, battlesWon: 0, battlesLost: 0, versusWins: 0 } },
    },
  };
};

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

// Return to the home screen from wherever we are, the way a player would: dismiss
// whatever is on top, then leave the battle/explore/gym screen. A phase that
// ends inside a fight leaves the toolbar behind the arena, and the next phase's
// tap then waits thirty seconds on a button it can never reach.
async function toHome(p) {
  for (let i = 0; i < 4; i++) {
    const closed = await p.evaluate(() => {
      const vis = el => el && getComputedStyle(el).display !== 'none';
      for (const id of ['sticker-modal', 'card-modal', 'pc-modal', 'badge-modal',
                        'victory-modal', 'switch-modal', 'ballpick-modal', 'settings-modal']) {
        const el = document.getElementById(id);
        if (vis(el)) { el.style.display = 'none'; return true; }
      }
      return false;
    });
    if (!closed) break;
    await p.waitForTimeout(200);
  }
  await p.evaluate(() => {
    document.getElementById('battle-container')?.classList.remove('active');
    for (const id of ['explore-container', 'gym-container']) {
      document.getElementById(id)?.classList.remove('active');
    }
  });
  await p.waitForTimeout(400);
}

// ---- the scenarios: things the boys actually do ----
const SAT = [];
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
    await toHome(p);
    await p.click('#explore-btn');
    await p.waitForFunction(() => document.querySelectorAll('#habitat-grid .habitat-card').length > 0, null, { timeout: 15000 });
    await step('opened the map');
    await p.locator('#habitat-grid .habitat-card:not(.locked)').first().click();
    await p.waitForFunction(() => document.getElementById('battle-container')?.classList.contains('active'), null, { timeout: 25000 });
    await p.waitForTimeout(1500);
    await step('a wild Pokemon appeared');           // <-- greyscale reported here
    for (let turn = 0; turn < 4; turn++) {
      if (await p.locator('#victory-modal').isVisible().catch(() => false)) { await step('the fight ended'); break; }
      const tiles = p.locator('.move-btn.type-tile:not([disabled])');
      if (!(await tiles.count())) break;
      await tiles.first().click({ timeout: 8000 }).catch(() => {});
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
    await toHome(p);
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
    // In Junior the tap opens the sticker close-up OVER the book, so the book's
    // own close button is unreachable until this one is dismissed.
    await p.locator('#sticker-close').click({ timeout: 4000 }).catch(() => {});
    await p.waitForTimeout(400);
    await p.click('#close-pc-btn').catch(() => {}); await p.waitForTimeout(600);
    // v19.6 re-homed CARD for ART: his route is a chip inside the sticker book,
    // and #card-btn is hidden in Junior. Take whichever door this mode has.
    const cardBtn = p.locator('#card-btn');
    if (await cardBtn.isVisible().catch(() => false)) {
      await cardBtn.click();
    } else {
      await p.click('#pc-btn'); await p.waitForTimeout(1200);
      await p.locator('#pc-card-chip').click({ timeout: 15000 }).catch(() => {});
    }
    await p.waitForTimeout(1200);
    await step('opened the trainer card');
  },

  // ============================================================
  // GABE ON A SATURDAY — one long unbroken session.
  // Catch a few, run a whole gym stop trainer-after-trainer, switch mid
  // fight, faint someone, heal, rearrange the team in the PC, fight again.
  // The point is ACCUMULATION: state that is fine once and wrong the
  // fifth time.
  // ============================================================
  async saturday(p, step) {
    const dump = async tag => {
      const d = await p.evaluate(() => {
        const g = id => document.getElementById(id);
        const txt = id => (g(id)?.innerText || '').trim();
        const w = id => g(id)?.style.width || '';
        const sp = id => { const e = g(id); return e ? { src: String(e.src).split('/').pop(), cls: e.className, filter: getComputedStyle(e).filter, op: getComputedStyle(e).opacity, tr: getComputedStyle(e).transform } : null; };
        let save = null;
        try { save = JSON.parse(localStorage.getItem('pokedexos_save_v2')); } catch (e) {}
        const P = save?.players?.[1];
        const vis = el => { if (!el) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05; };
        return {
          playerName: txt('player-name'), playerHp: txt('player-hp-text'),
          playerBar: w('player-hp-bar'), playerGhost: w('player-hp-ghost'),
          xpBar: w('player-xp-bar'),
          wildName: txt('wild-name'), wildBar: w('wild-hp-bar'), wildGhost: w('wild-hp-ghost'),
          log: txt('battle-log'), title: txt('battle-title'),
          pSprite: sp('player-sprite'), wSprite: sp('wild-sprite'),
          moves: [...document.querySelectorAll('#battle-moves .move-btn')].map(b => ({ t: b.innerText.replace(/\s+/g,' ').trim().slice(0,22), dis: b.disabled, eff: b.dataset.eff })),
          openModals: ['victory-modal','switch-modal','pc-modal','dlg-modal','ballpick-modal','evo-modal','nick-modal','sparkle-modal','loading-modal','hof-modal','oops-modal','badge-modal','card-modal','settings-modal'].filter(id => vis(g(id))),
          battleActive: !!g('battle-container')?.classList.contains('active'),
          gymActive: !!g('gym-container')?.classList.contains('active'),
          team: P?.team, mons: P?.mons, beaten: Object.keys(P?.gyms?.beaten || {}),
          stats: P?.stats, caught: P?.caught?.length,
        };
      });
      SAT.push({ tag, ...d });
      return d;
    };

    const fight = async (label, maxTurns = 12, opts = {}) => {
      for (let turn = 0; turn < maxTurns; turn++) {
        if (await p.locator('#switch-modal').isVisible().catch(() => false)) {
          const it = p.locator('#switch-modal .switch-item').first();
          if (await it.count()) { await it.click(); await p.waitForTimeout(2200); await step(`${label} forced switch`); }
          else break;
        }
        if (await p.locator('#victory-modal').isVisible().catch(() => false)) break;
        if (opts.switchOn === turn) {
          await p.click('#switch-btn').catch(() => {});
          await p.waitForTimeout(700);
          await step(`${label} switch menu`);
          const it = p.locator('#switch-modal .switch-item').first();
          if (await it.count()) { await it.click(); await p.waitForTimeout(2400); }
          await dump(`${label}-after-switch`);
          await step(`${label} after switching in`);
          continue;
        }
        let tiles = p.locator('.move-btn.type-tile:not([disabled])');
        if (!(await tiles.count())) {
          // The moves went dead. Either a modal is coming, or the fight is
          // over, or the buttons simply stopped responding — wait it out and
          // say which, because "nothing happens" is the worst outcome.
          let woke = false;
          for (let w = 0; w < 12; w++) {
            await p.waitForTimeout(700);
            if (await p.locator('#switch-modal').isVisible().catch(() => false)) { woke = true; break; }
            if (await p.locator('#victory-modal').isVisible().catch(() => false)) { woke = true; break; }
            if (await p.locator('#badge-modal, #nick-modal, #dlg-modal').first().isVisible().catch(() => false)) { woke = true; break; }
            if (await tiles.count()) { woke = true; break; }
          }
          if (!woke) { await step(`${label} MOVES WENT DEAD, nothing came back`); break; }
          if (!(await tiles.count())) continue;
        }
        await tiles.nth(turn % Math.min(4, await tiles.count())).click().catch(() => {});
        await p.waitForTimeout(SLOW ? 3400 : 1700);
        await dump(`${label}-t${turn + 1}`);
        if (turn % 3 === 2) await step(`${label} turn ${turn + 1}`);
        if (await p.locator('#victory-modal').isVisible().catch(() => false)) break;
        if (!(await p.locator('#battle-container.active').count())) break;
      }
      await p.waitForTimeout(900);
      const d = await dump(`${label}-end`);
      await step(`${label} ended`);
      return d;
    };

    const clearModals = async () => {
      // Dismiss the TOP-MOST modal first. A lower one cannot be tapped through
      // the one covering it — which is exactly what a child would discover.
      const LAYERS = [
        ['#badge-modal', '#badge-ok', 1300],
        ['#nick-modal', '#nick-skip', 1000],
        ['#dlg-modal', '#dlg-ok', 1000],
        ['#oops-modal', '#oops-ok', 1000],
        ['#sparkle-modal', '#sparkle-modal', 1000],
        ['#victory-modal', '#victory-continue', 1700],
      ];
      for (let i = 0; i < 14; i++) {
        let did = false;
        for (const [modal, btn, wait] of LAYERS) {
          if (await p.locator(modal).isVisible().catch(() => false)) {
            const before = await p.locator(modal).isVisible().catch(() => false);
            await p.click(btn, { timeout: 4000 }).catch(async () => {
              await step(`STUCK: ${modal} would not dismiss`);
            });
            await p.waitForTimeout(wait);
            const after = await p.locator(modal).isVisible().catch(() => false);
            if (before && after) await step(`STILL OPEN after tapping ${btn}`);
            did = true; break;
          }
        }
        if (!did) break;
      }
    };

    // ---- 1. catch a few on the dex screen ----
    for (let c = 0; c < 3; c++) {
      await step(`catch ${c + 1}: before NEXT`);
      await p.click('#nav-next', { timeout: 8000 }).catch(async e => { await step(`catch ${c + 1}: NEXT DEAD`); });
      await p.waitForTimeout(1100);
      await step(`catch ${c + 1}: on a new Pokemon`);
      await p.click('#catch-btn', { timeout: 8000 }).catch(async e => { await step(`catch ${c + 1}: CATCH DEAD`); });
      await p.waitForTimeout(800);
      await step(`catch ${c + 1}: ball drawer`);
      await p.locator('.ball-opt').first().click({ timeout: 8000 }).catch(() => {});
      await p.waitForTimeout(7000);
      await step(`catch ${c + 1}: after the throw`);
      await clearModals();
      await p.waitForTimeout(600);
      await step(`catch ${c + 1}: modals cleared`);
    }
    await dump('after-3-catches');
    await step('after three catches');

    // ---- 2. one wild fight from the map ----
    await toHome(p);
    await p.click('#explore-btn');
    await p.waitForTimeout(1200);
    await step('tapped EXPLORE');
    await p.waitForFunction(() => document.querySelectorAll('#habitat-grid .habitat-card').length > 0, null, { timeout: 20000 })
      .catch(async () => { await step('EXPLORE NEVER OPENED'); await p.click('#explore-btn').catch(()=>{}); await p.waitForTimeout(2500); await step('tapped EXPLORE again'); });
    await p.locator('#habitat-grid .habitat-card:not(.locked)').first().click();
    await p.waitForFunction(() => document.getElementById('battle-container')?.classList.contains('active'), null, { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(1800);
    await dump('wild-start');
    await step('wild fight begins');
    await fight('wild', 8);
    await clearModals();
    await p.waitForTimeout(1200);
    await dump('back-from-wild');
    await step('back on the dex after the wild fight');
    if (await p.locator('#explore-container.active').count()) { await p.click('#explore-back-btn').catch(() => {}); await p.waitForTimeout(700); }

    // ---- 3. a whole gym stop, trainer after trainer ----
    await toHome(p);
    await p.click('#gyms-btn');
    await p.waitForFunction(() => document.querySelectorAll('#gym-body .gym-card').length > 0, null, { timeout: 20000 });
    await p.locator('#gym-body .gym-card:not(.locked)').first().click();
    await p.waitForTimeout(1400);
    await step('the first gym stop');

    for (let t = 0; t < 5; t++) {
      const card = p.locator('.trainer-card:not(.locked):not(.beaten)').first();
      if (!(await card.count())) { await step(`no unlocked trainer left at #${t}`); break; }
      await card.click(); await p.waitForTimeout(1400);
      await clearModals();
      await p.waitForFunction(() => document.getElementById('battle-container')?.classList.contains('active'), null, { timeout: 30000 }).catch(() => {});
      await p.waitForTimeout(1800);
      await dump(`trainer${t}-start`);
      await step(`trainer ${t + 1} appears`);
      await fight(`trainer${t}`, 16, { switchOn: t === 1 ? 1 : -1 });
      await clearModals();
      await p.waitForTimeout(1500);
      await dump(`trainer${t}-back`);
      await step(`back at the gym after trainer ${t + 1}`);
      if (!(await p.locator('#gym-container.active').count())) {
        await step(`NOT BACK AT THE GYM after trainer ${t + 1}`);
        await p.click('#gyms-btn').catch(() => {});
        await p.waitForTimeout(1200);
        await p.locator('#gym-body .gym-card:not(.locked)').first().click().catch(() => {});
        await p.waitForTimeout(1200);
      }
    }

    // ---- 4. Poké Center ----
    await p.click('#gym-back-btn').catch(() => {}); await p.waitForTimeout(900);
    await step('gym list before healing');
    await p.click('#poke-center-btn').catch(() => {}); await p.waitForTimeout(1600);
    await dump('after-heal');
    await step('after the Poke Center');

    // ---- 5. PC: rearrange the team ----
    await p.click('#gym-back-btn').catch(() => {}); await p.waitForTimeout(800);
    await toHome(p);
    await p.click('#pc-btn'); await p.waitForTimeout(2000);
    await dump('pc-open');
    await step('PC box open');
    const strip = p.locator('#team-strip > *');
    const n = await strip.count();
    if (n > 1) { await strip.nth(0).click().catch(() => {}); await p.waitForTimeout(700); await step('tapped team slot 1'); }
    await p.locator('.pc-item').nth(2).click().catch(() => {}); await p.waitForTimeout(900);
    await step('tapped a box Pokemon');
    await clearModals();
    await p.locator('.pc-item').nth(5).click().catch(() => {}); await p.waitForTimeout(900);
    await step('tapped another box Pokemon');
    await clearModals();
    await dump('pc-after-fiddling');
    await p.click('#close-pc-btn').catch(() => {}); await p.waitForTimeout(900);
    await step('closed the PC');

    // ---- 6. fight again after all of that ----
    await toHome(p);
    await p.click('#gyms-btn'); await p.waitForTimeout(1400);
    await p.locator('#gym-body .gym-card:not(.locked)').first().click().catch(() => {});
    await p.waitForTimeout(1400);
    const card2 = p.locator('.trainer-card:not(.locked)').first();
    if (await card2.count()) {
      await card2.click(); await p.waitForTimeout(1400);
      await clearModals();
      await p.waitForTimeout(2000);
      await dump('final-fight-start');
      await step('the last fight of the session');
      await fight('final', 10);
      await clearModals();
    }
    await p.waitForTimeout(1200);
    await dump('end-of-session');
    await step('end of the session');
  },

  // ---- ART's lens: he cannot read a word, so the PICTURE is the whole UI ----
  // Each of these watches the sprite, not the text, and screenshots the moments
  // where the picture is missing, stale, or contradicts the caption.
  async artdex(p, step) {
    // Tap ▶ and watch the gap between the caption changing and the picture
    // catching up. Art navigates by the picture alone.
    for (let tap = 0; tap < 3; tap++) {
      await p.click('#nav-next');
      for (const wait of [400, 400, 400, 500]) {
        await p.waitForTimeout(wait);
        const s = await p.evaluate(() => {
          const sp = document.getElementById('poke-sprite');
          return { id: document.getElementById('id-text').innerText,
                   src: (sp.src.match(/(\d+)\.(gif|png)/) || [])[1],
                   op: +getComputedStyle(sp).opacity, nw: sp.naturalWidth };
        });
        // the picture is gone, or it is not the one the caption names
        if (s.op < 0.5 || s.nw === 0 || (s.src && !s.id.includes(s.src.padStart(4, '0'))))
          await step(`tap ${tap + 1}: caption ${s.id} picture=${s.src} op=${s.op.toFixed(2)}`);
      }
    }
    await step('dex settled');
  },
  async artcatch(p, step) {
    await p.click('#nav-next'); await p.waitForTimeout(2400);
    await p.click('#catch-btn'); await p.waitForTimeout(900);
    await step('ball drawer open');
    await p.locator('.ball-opt').first().click();
    for (let i = 0; i < 16; i++) {
      await p.waitForTimeout(500);
      const s = await p.evaluate(() => {
        const sp = document.getElementById('poke-sprite');
        return { w: Math.round(sp.getBoundingClientRect().width), cls: sp.className,
                 msg: document.getElementById('dex-catch-msg')?.innerText };
      });
      if (i % 4 === 3 || s.msg === 'GOTCHA!') await step(`catch +${(i + 1) * 500}ms picture=${s.w}px ${s.msg}`);
      if (s.msg === 'GOTCHA!') { await p.waitForTimeout(700); await step('one second after GOTCHA'); break; }
    }
  },
  async artexit(p, step) {
    // The exit chip is the one way out of a fight. In junior mode a TAP is a
    // no-op by design — this records what Art actually sees when he taps it.
    await p.click('#battle-btn');
    await p.waitForFunction(() => document.getElementById('battle-container')?.classList.contains('active'), null, { timeout: 25000 });
    await p.waitForTimeout(300);
    await step('battle opened — is anyone on the field yet?');
    await p.waitForTimeout(2200);
    const box = await p.locator('#escape-btn').boundingBox();
    for (let i = 0; i < 3; i++) {
      await p.mouse.move(box.x + 22, box.y + 22);
      await p.mouse.down(); await p.waitForTimeout(60); await p.mouse.up();
      await p.waitForTimeout(400);
    }
    await step('after three taps on the BACK chip');
    console.log('  still in battle after 3 taps: ' +
      await p.evaluate(() => document.getElementById('battle-container').classList.contains('active')));
    await p.mouse.down(); await p.waitForTimeout(1200); await p.mouse.up();
    await p.waitForTimeout(1200);
    await step('after holding the BACK chip for 1.2s');
  },
  // The three controls a long session keeps bumping into: the PC team strip,
  // the ball drawer and the switch menu. Screenshot each one on its own so a
  // reviewer can look at the CANCEL button and count the team slots.
  async spotcheck(p, step) {
    // Kevin's "spacing between emojis and text": measure the painted gap
    // between an emoji and the character straight after it, everywhere.
    await p.click('#card-btn'); await p.waitForTimeout(1800);
    await p.evaluate(() => { const b = document.querySelector('#card-modal .card-box'); if (b) b.scrollTop = b.scrollHeight; });
    await p.waitForTimeout(700);
    await step('trainer card, scrolled to the stats');
    console.log('  EMOJI GAPS', JSON.stringify(await p.evaluate(() => {
      const RE = /([\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}\u{2600}-\u{27BF}]\uFE0F?)([A-Za-z0-9])/u;
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const out = []; let n;
      while ((n = w.nextNode())) {
        const m = RE.exec(n.nodeValue || ''); if (!m) continue;
        const host = n.parentElement; if (!host) continue;
        const r = host.getBoundingClientRect(); if (!r.width || getComputedStyle(host).display === 'none') continue;
        const a = document.createRange(); a.setStart(n, m.index); a.setEnd(n, m.index + m[1].length);
        const b = document.createRange(); b.setStart(n, m.index + m[1].length); b.setEnd(n, m.index + m[0].length);
        out.push({ where: host.id || host.className || host.tagName, text: (n.nodeValue || '').trim().slice(0, 24),
                   gapPx: Math.round(b.getBoundingClientRect().left - a.getBoundingClientRect().right),
                   fontSize: getComputedStyle(host).fontSize });
      }
      return out;
    })));
    await p.click('#card-close').catch(() => {}); await p.waitForTimeout(800);

    await p.click('#pc-btn'); await p.waitForTimeout(2400);
    await step('PC box: the TEAM strip');
    const strip = await p.evaluate(() => {
      const s = document.getElementById('team-strip'); const sr = s.getBoundingClientRect();
      return { scrollWidth: s.scrollWidth, clientWidth: s.clientWidth,
        slots: [...s.querySelectorAll('.team-slot')].map(k => { const r = k.getBoundingClientRect();
          return { right: Math.round(r.right), hidden: r.left > sr.right - 2, clipped: r.right > sr.right + 1 }; }),
        team: JSON.parse(localStorage.getItem('pokedexos_save_v2')).players['1'].team };
    });
    console.log('  TEAM STRIP', JSON.stringify(strip));
    await p.locator('#team-strip').screenshot({ path: join(OUT, 'spot-team-strip.png') }).catch(() => {});
    await p.click('#close-pc-btn').catch(() => {}); await p.waitForTimeout(800);

    // a wild fight: the BALL drawer and the SWITCH menu, one at a time
    await toHome(p);
    await p.click('#explore-btn');
    await p.waitForFunction(() => document.querySelectorAll('#habitat-grid .habitat-card').length > 0, null, { timeout: 20000 });
    await p.locator('#habitat-grid .habitat-card:not(.locked)').first().click();
    await p.waitForFunction(() => document.getElementById('battle-container')?.classList.contains('active'), null, { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(2200);
    await p.click('#ball-btn').catch(() => {}); await p.waitForTimeout(1200);
    await step('the BALL drawer');
    console.log('  BALLPICK CANCEL', JSON.stringify(await p.evaluate(() => {
      const c = document.getElementById('ballpick-cancel'); const s = getComputedStyle(c);
      const l = document.getElementById('ballpick-list');
      return { background: s.backgroundColor, color: s.color, listScrollH: l.scrollHeight, listClientH: l.clientHeight };
    })));
    await p.click('#ballpick-cancel').catch(() => {}); await p.waitForTimeout(900);
    await p.click('#switch-btn').catch(() => {}); await p.waitForTimeout(1200);
    await step('the SWITCH menu');
    console.log('  SWITCH CANCEL', JSON.stringify(await p.evaluate(() => {
      const c = document.getElementById('switch-cancel'); const s = getComputedStyle(c);
      const l = document.getElementById('switch-list');
      return { background: s.backgroundColor, color: s.color, listScrollH: l.scrollHeight, listClientH: l.clientHeight,
               itemsRendered: l.querySelectorAll('.switch-item').length };
    })));
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
    viewport: { width: VW, height: VH }, serviceWorkers: 'block', deviceScaleFactor: 2,
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
  }, SEED(MODE === 'junior', PROFILE));

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
  catch (e) {
    // Photograph the abort. A scenario that stops with only a timeout message
    // is undiagnosable later — and this harness is read by people who were not
    // in the room. The shot plus the visible-modal list almost always says why.
    const slug = `${name}-ABORT`;
    await page.screenshot({ path: join(OUT, `${slug}.png`) }).catch(() => {});
    const ctx = await page.evaluate(() => ({
      open: [...document.querySelectorAll('.overlay-screen, #pc-modal')]
        .filter(o => getComputedStyle(o).display !== 'none').map(o => o.id || o.className),
      screen: document.getElementById('battle-container')?.classList.contains('active') ? 'battle' : 'other',
    })).catch(() => ({}));
    steps.push({
      label: 'SCENARIO ABORTED', error: e.message.split('\n')[0],
      shot: `${slug}.png`, openModals: ctx.open ?? [], screen: ctx.screen ?? null,
    });
    console.log(`  [${MODE}/${name}] ABORTED: ${e.message.split('\n')[0]}`
      + (ctx.open?.length ? `  (open: ${ctx.open.join(', ')})` : ''));
  }

  report.scenarios[name] = steps;
  report.consoleErrors.push(...errs);
  await ctx.close();
}
await browser.close();

writeFileSync(join(OUT, 'sat.json'), JSON.stringify(SAT, null, 1));
// MERGE, never overwrite. Runs are launched one SCRIPT at a time so a failure
// in one scenario cannot take the others down with it — but they share an
// output directory per (mode, size, profile), so a plain write would leave only
// the last scenario's evidence and silently discard the rest.
{
  const rp = join(OUT, 'report.json');
  let merged = report;
  if (existsSync(rp)) {
    try {
      const prev = JSON.parse(readFileSync(rp, 'utf8'));
      merged = {
        ...prev, ...report,
        scenarios: { ...(prev.scenarios || {}), ...(report.scenarios || {}) },
        consoleErrors: [...new Set([...(prev.consoleErrors || []), ...(report.consoleErrors || [])])],
      };
    } catch (e) { /* unreadable previous report — this run replaces it */ }
  }
  writeFileSync(rp, JSON.stringify(merged, null, 1));
}
const noteCount = Object.values(report.scenarios).flat().reduce((a, s) => a + (s.notes?.length || 0), 0);
console.log(`\n${MODE}: ${Object.keys(report.scenarios).length} scenarios, ${noteCount} observations, ${report.consoleErrors.length} console/page errors`);
console.log(`screens: test/playtest/${MODE}/   report: test/playtest/${MODE}/report.json`);
if (report.consoleErrors.length) report.consoleErrors.slice(0, 10).forEach(e => console.log('  ERROR ' + e));
