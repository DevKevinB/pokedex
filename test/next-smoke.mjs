// Smoke test for SPROUT ROAD (/next/). Runs against the local static server
// on :8321 with PokeAPI and the sprite CDN fully mocked, and service workers
// blocked. Usage:  node test/next-smoke.mjs
//
// Guards carried over from test/smoke.mjs: the game never talks, never opens
// a native dialog, never logs a console error. New here: save v2 -> v3
// migration on a realistic save (v2 byte-identical afterwards), the garden
// and road loops, a full trainer battle, a no-innerHTML grep, the CSP meta,
// and a layout net at 375x667, 390x844 and 1024x1366 (iPad) with screenshots.
// Batch 2: guardians + seeds + the egg, the rival, Art's gifts as battle
// berries, the picture lock, Family Table, Couch Versus and the postcard.
// Batch 3: the Pokedex + team editor, tall grass, evolution, DAD'S CHALLENGE
// (Pro Rules + seed replay) and Art's Sticker Book.
// Batch 4 (post-Champion save): ROUND 2 (toggle, gimmick, shiny ace), THROUGH
// THE ROOTS (door, sanctum catch and loss), WILD CHAPTERS (unlock order, the
// validator) and the Garden's gift boxes, decorations and Bulba's accessories.
import { chromium } from 'playwright';
import { readFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NEXT = join(ROOT, 'next');
const SHOTS = join(ROOT, 'test', 'shots', 'next');
mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://127.0.0.1:8321/next/';
const Q = '?fast=1&seed=1';

let failures = 0, passes = 0;
function check(label, cond, extra) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra ? '  -> ' + extra : ''}`);
  if (cond) passes++; else failures++;
}

// ------------------------------------------------------------ static checks

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|mjs|html)$/.test(f)) out.push(p);
  }
  return out;
}
{
  const bad = [];
  const interp = /innerHTML\s*[+]?=\s*[`'"][^`'"]*\$\{/;
  const plusEq = /innerHTML\s*\+=/;
  const assignVar = /innerHTML\s*=\s*(?![`'"]\s*[`'"]|['"]['"])[A-Za-z_$(]/;
  for (const f of walk(NEXT)) {
    const src = readFileSync(f, 'utf8');
    src.split('\n').forEach((line, i) => {
      if (interp.test(line) || plusEq.test(line) || assignVar.test(line)) bad.push(`${f.slice(ROOT.length + 1)}:${i + 1}`);
    });
  }
  check('no innerHTML with interpolation or variables in next/', bad.length === 0, bad.join(', '));

  const speech = walk(NEXT).filter(f => /speechSynthesis|SpeechSynthesisUtterance/.test(readFileSync(f, 'utf8')));
  check('no speech synthesis anywhere in next/', speech.length === 0, speech.join(', '));

  const html = readFileSync(join(NEXT, 'index.html'), 'utf8');
  const m = html.match(/<meta[^>]+http-equiv="Content-Security-Policy"[^>]+content="([^"]+)"/i);
  check('CSP meta present', !!m);
  const csp = m ? m[1] : '';
  const dir = name => (csp.split(';').map(s => s.trim()).find(s => s.startsWith(name + ' ')) || '');
  check('CSP script-src has no unsafe-inline', !!dir('script-src') && !/unsafe-inline|unsafe-eval/.test(dir('script-src')));
  check('CSP style-src has no unsafe-inline', !!dir('style-src') && !/unsafe-inline/.test(dir('style-src')));
}

// ------------------------------------------------------------ mocks

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
// A real-size fake sprite (96x96) so scenes lay out as they would with art.
let SPRITE_PNG = TINY_PNG;
try { SPRITE_PNG = readFileSync(join(ROOT, 'test', 'fake-sprite.png')); } catch (e) { /* tiny fallback */ }

const NAMES = { 1: 'bulbasaur', 2: 'ivysaur', 3: 'venusaur', 25: 'pikachu', 6: 'charizard', 7: 'squirtle', 10: 'caterpie', 11: 'metapod', 12: 'butterfree' };
function pokemonFixture(id) {
  return {
    id, name: NAMES[id] || `mon-${id}`, height: 7, weight: 69, base_experience: 64,
    types: [{ slot: 1, type: { name: 'normal', url: '' } }],
    stats: [
      { base_stat: 45, stat: { name: 'hp' } }, { base_stat: 55, stat: { name: 'attack' } },
      { base_stat: 45, stat: { name: 'defense' } }, { base_stat: 55, stat: { name: 'special-attack' } },
      { base_stat: 50, stat: { name: 'special-defense' } }, { base_stat: 60, stat: { name: 'speed' } },
    ],
    sprites: { front_default: null },
    // thunder-wave: a status move only Pro Rules deal in (seedMoveset skips status moves).
    moves: ['tackle', 'quick-attack', 'body-slam', 'headbutt', 'growl', 'thunder-wave']
      .map(n => ({ move: { name: n, url: '' } })),
  };
}
// Only the Caterpie line has an evolution chain, so no other smoke battle
// can wander into the evolve screen.
const CATERPIE_CHAIN = 'https://pokeapi.co/api/v2/evolution-chain/4/';
const spUrl = id => `https://pokeapi.co/api/v2/pokemon-species/${id}/`;
const speciesFixture = id => ({ id, name: NAMES[id] || `mon-${id}`, capture_rate: 190, is_legendary: false,
  ...([10, 11, 12].includes(id) ? { evolution_chain: { url: CATERPIE_CHAIN } } : {}) });
const caterpieChain = () => ({ id: 4, chain: { species: { name: 'caterpie', url: spUrl(10) }, evolution_details: [], evolves_to: [
  { species: { name: 'metapod', url: spUrl(11) }, evolution_details: [{ min_level: 7 }], evolves_to: [
    { species: { name: 'butterfree', url: spUrl(12) }, evolution_details: [{ min_level: 10 }], evolves_to: [] }] }] } });

const OFFSITE = [];
async function mockRoutes(context) {
  await context.route('https://pokeapi.co/**', route => {
    const url = route.request().url();
    const s = url.match(/pokemon-species\/(\d+)/);
    const p = url.match(/\/pokemon\/(\d+)\/?$/);
    let body = null;
    if (/evolution-chain\/4\/?$/.test(url)) body = caterpieChain();
    else if (s) body = speciesFixture(+s[1]);
    else if (p) body = pokemonFixture(+p[1]);
    if (!body) return route.fulfill({ status: 404, body: 'Not Found', headers: { 'Access-Control-Allow-Origin': '*' } });
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
  });
  await context.route('https://raw.githubusercontent.com/**', route => {
    const url = route.request().url();
    // A cry that will not decode: audio.js must fall back to its synth chirp quietly.
    if (url.endsWith('.ogg')) return route.fulfill({ status: 200, contentType: 'audio/ogg', body: Buffer.from('OggS'), headers: { 'Access-Control-Allow-Origin': '*' } });
    return route.fulfill({ status: 200, contentType: url.endsWith('.gif') ? 'image/png' : 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: SPRITE_PNG });
  });
  // Network allowlist: self, pokeapi.co and the sprite host only.
  await context.route(u => !/^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|https:\/\/pokeapi\.co\/|https:\/\/raw\.githubusercontent\.com\/|data:|blob:)/.test(u.href), route => {
    OFFSITE.push(route.request().url());
    return route.abort();
  });
}

// ------------------------------------------------------------ fixtures

function richV2() {
  return {
    version: 2,
    players: {
      1: {
        name: 'GABE', caught: [1, 4, 6, 7, 25, 94, 130, 149, 150, 248, 445, 649],
        team: [6, 130, 25, 149, 94, 445],
        mons: { 6: { level: 72, xp: 310 }, 130: { level: 68, xp: 12 }, 25: { level: 55, xp: 0 }, 149: { level: 70, xp: 5 }, 94: { level: 61, xp: 44 }, 445: { level: 66, xp: 100 }, 1: { level: 5, xp: 0 } },
        badges: ['gym-rock', 'gym-water', 'first-catch'],
        shinies: [25, 130], nicks: { 6: 'BLAZE', 25: 'SPARKY' },
        favorites: [6, 25, 150], items: { masterBalls: 2 },
        quests: { day: 20120, allDone: false, list: [{ key: 'catch_fire', progress: 1, done: false }] },
        gyms: { beaten: { 'rock:0': true, 'rock:1': true, 'rock:2': true, 'rock:3': true, 'rock:4': true, 'water:0': true, 'water:1': true, 'water:2': true, 'water:3': true, 'water:4': true, 'elite:4': true, 'rock:0:r2': true }, round: 2 },
        settings: { junior: false, music: true },
        champion: { date: '2026-08-14', team: [6, 130, 25, 149, 94, 445], levels: { 6: 70, 130: 66 } },
        stats: { catches: 12, battlesWon: 58, battlesLost: 9, versusWins: 3 },
      },
      2: {
        name: 'ART', caught: [1, 7, 25, 133], team: [25, 1],
        mons: { 25: { level: 12, xp: 30 }, 1: { level: 9, xp: 2 }, 7: { level: 5, xp: 0 }, 133: { level: 6, xp: 1 } },
        badges: [], shinies: [133], nicks: { 25: 'PIKA' }, favorites: [133],
        items: { masterBalls: 0 }, quests: {}, gyms: { beaten: {} },
        settings: { junior: true }, champion: null,
        stats: { catches: 4, battlesWon: 7, battlesLost: 0, versusWins: 0 },
      },
    },
  };
}
const RICH_V2 = JSON.stringify(richV2());

// ------------------------------------------------------------ harness

const browser = await chromium.launch();

async function newPage(viewport, seed = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', hasTouch: false });
  await mockRoutes(context);
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push('pageerror: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') page.errors.push(msg.text() + (msg.location()?.url ? ' @' + msg.location().url : '')); });
  await page.addInitScript(seedData => {
    window.__SPOKE__ = false;
    try {
      if (window.speechSynthesis) {
        const orig = window.speechSynthesis.speak.bind(window.speechSynthesis);
        window.speechSynthesis.speak = function (...a) { window.__SPOKE__ = true; return orig(...a); };
      }
    } catch (e) { /* noop */ }
    window.__NATIVE_DIALOG__ = false;
    for (const fn of ['alert', 'confirm', 'prompt']) {
      window[fn] = function () { window.__NATIVE_DIALOG__ = true; return null; };
    }
    // Seed storage once per tab (reloads keep what the app wrote).
    if (!sessionStorage.getItem('__seeded')) {
      sessionStorage.setItem('__seeded', '1');
      for (const [k, v] of Object.entries(seedData)) localStorage.setItem(k, v);
    }
  }, seed);
  return { context, page };
}

async function finishPage(label, { context, page }) {
  const spoke = await page.evaluate(() => window.__SPOKE__).catch(() => false);
  const dialog = await page.evaluate(() => window.__NATIVE_DIALOG__).catch(() => false);
  check(`${label}: speechSynthesis never called`, spoke === false);
  check(`${label}: no native dialogs`, dialog === false);
  check(`${label}: no console errors`, page.errors.length === 0, page.errors.slice(0, 5).join(' | '));
  await context.close();
}

const scene = page => page.evaluate(() => window.__scene);
async function waitScene(page, name, timeout = 8000) {
  await page.waitForFunction(n => window.__scene === n && document.querySelector('#app > section.scene[data-scene="' + n + '"]'), name, { timeout });
  await page.waitForTimeout(150);
}
const v3 = page => page.evaluate(() => JSON.parse(localStorage.getItem('pokedexos_save_v3') || 'null'));
async function tapCenter(page, sel) {
  const box = await page.locator(sel).first().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

// Layout net: visible buttons inside the viewport, text >= 8px.
async function layout(page) {
  return page.evaluate(() => {
    const W = innerWidth, H = innerHeight;
    const visible = el => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
        if (n.getAttribute('aria-hidden') === 'true') return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const inScroller = el => {
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const o = getComputedStyle(n).overflowY;
        if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return true;
        const ox = getComputedStyle(n).overflowX;
        if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth) return true;
      }
      return false;
    };
    const outside = [];
    for (const el of document.querySelectorAll('button, [role="button"]')) {
      if (!visible(el) || inScroller(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) {
        outside.push(`${el.className || el.tagName} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
      }
    }
    const tiny = [];
    for (const el of document.querySelectorAll('#app *, .oops *')) {
      const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (!hasText || !visible(el)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 8) tiny.push(`${el.className || el.tagName} ${fs}px`);
    }
    // A native append(null) prints the word "null": catch leaked junk words.
    const junk = [];
    const tw = document.createTreeWalker(document.getElementById('app') || document.body, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (/\b(null|undefined|NaN|\[object Object\])\b/.test(n.textContent) && n.parentElement && visible(n.parentElement)) junk.push(n.textContent.trim().slice(0, 40));
    }
    return { outside, tiny, junk };
  });
}
// Words a prereader would see: visible text, minus numbers, emoji,
// punctuation and the players' own names.
async function visibleWords(page, names) {
  return page.evaluate(names => {
    const out = [];
    const walker = document.createTreeWalker(document.getElementById('app'), NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent.trim();
      if (!t) continue;
      const el = n.parentElement;
      let vis = true;
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) { vis = false; break; }
      }
      if (!vis) continue;
      // Pokemon names are names too (the fixtures call unknown ones MON <id>).
      let rest = t.replace(/\bMON \d+\b/g, ' ');
      for (const nm of names) rest = rest.split(nm).join(' ');
      if (/[A-Za-z]{2,}/.test(rest)) out.push(t);
    }
    return out;
  }, names);
}
async function layoutCheck(page, label, size) {
  const r = await layout(page);
  check(`${label} ${size}: no button outside the viewport`, r.outside.length === 0, r.outside.slice(0, 4).join(' ; '));
  check(`${label} ${size}: all visible text >= 8px`, r.tiny.length === 0, r.tiny.slice(0, 4).join(' ; '));
  check(`${label} ${size}: no null/undefined/NaN on screen`, r.junk.length === 0, r.junk.slice(0, 4).join(' ; '));
}
async function shot(page, name) {
  await page.screenshot({ path: join(SHOTS, name + '.png') });
}

// Loop a battle: tap the first move (or OK on the result card) until we leave.
async function fightToEnd(page, returnTo, maxTurns = 80) {
  await page.waitForSelector('.bt[data-ready="1"]', { timeout: 10000 });
  for (let i = 0; i < maxTurns; i++) {
    if ((await scene(page)) !== 'battle') return true;
    const ok = page.locator('.bt-ok:visible');
    if (await ok.count()) { await ok.first().click({ force: true }).catch(() => {}); await page.waitForTimeout(120); continue; }
    // v20.1.2: after a faint Gabe picks who comes in (the team drawer).
    const pick = page.locator('.bt-drawer:not([hidden]) .bt-slot:not([disabled])');
    if (await pick.count() && !(await page.locator('.bt-moves button:not([disabled])').count())) { await pick.first().click({ force: true }).catch(() => {}); await page.waitForTimeout(120); continue; }
    const mv = page.locator('.bt-moves button:not([disabled]):visible');
    if (await mv.count()) { await mv.first().click({ force: true }).catch(() => {}); }
    await page.waitForTimeout(120);
  }
  return (await scene(page)) === returnTo;
}

const NAMES_OK = ['ART', 'GABE', ...Object.values(NAMES).map(n => n.toUpperCase())];
const SIZES = [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 1024, height: 1366 }];   // phone, phone, iPad
const sz = v => `${v.width}x${v.height}`;

// ============================================================ 1. empty boot
{
  const P = await newPage(SIZES[1]);
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  check('no save: boots to WHO\'S PLAYING', (await scene(page)) === 'who');
  check('no save: picker shows two cards', (await page.locator('.who-card').count()) === 2);
  check('no save: v2 key was not created', await page.evaluate(() => localStorage.getItem('pokedexos_save_v2') === null));
  // Grown-up gear: a quick tap does nothing, a 2s hold opens it.
  await page.locator('.who-gear').click();
  check('gear: a quick tap does not open grown-up panel', (await page.locator('.gu-panel').count()) === 0);
  const g = await page.locator('.who-gear').boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(2200);
  await page.mouse.up();
  check('gear: a 2s hold opens the grown-up panel', (await page.locator('.gu-panel').count()) === 1);
  await page.locator('.gu-profile[data-player="2"]').click();
  check('gear: player 2 toggled to prereader and saved',
    (await v3(page))?.players?.[2]?.profile === 'prereader');
  const mutedBefore = await page.evaluate(() => localStorage.getItem('sprout_muted') || localStorage.getItem('pokedexos_next_muted'));
  await page.locator('.gu-mute').click();
  check('gear: mute toggles', (await page.locator('.gu-mute').innerText()).includes('OFF'));
  await page.locator('.gu-mute').click();
  // v20.2.1: a grown-up can rename a player; markup is cleaned out, 12 max.
  await page.locator('.gu-rename[data-player="1"]').click();
  await page.locator('.gu-rename-input').fill('<b>Gabriel</b>!!xyz');
  await page.locator('.gu-rename-save').click();
  {
    const nm = (await v3(page))?.players?.[1]?.name;
    check('rename: player 1 renamed, cleaned and uppercased', nm === 'BGABRIEL/', JSON.stringify(nm));   // the box stops at 12 typed characters, then markup is stripped
    check('rename: the panel shows the new name', (await page.locator('.gu-rename[data-player="1"] .gu-name').innerText()).includes('GABRIEL'));
  }
  {
    const before = (await v3(page))?.players?.[2]?.name ?? '';
    await page.locator('.gu-rename[data-player="2"]').click();
    await page.locator('.gu-rename-input').fill('   ');
    await page.locator('.gu-rename-save').click();
    check('rename: an empty box keeps the old name', ((await v3(page))?.players?.[2]?.name ?? '') === before);
  }
  await page.locator('.gu-close').click();
  check('gear: DONE closes the panel', (await page.locator('.gu-panel').count()) === 0);
  check('rename: the WHO\'S PLAYING card shows the new name', (await page.locator('.who-card.p1').innerText()).includes('GABRIEL'));
  check('who: player 2 card shows the leaf', (await page.locator('.who-card.p2 .who-leaf').count()) === 1);
  void mutedBefore;
  await finishPage('empty boot', P);
}

// ============================================================ 2. rich v2 save
{
  const P = await newPage(SIZES[1], { pokedexos_save_v2: RICH_V2 });
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  const after = await page.evaluate(() => ({
    v2: localStorage.getItem('pokedexos_save_v2'),
    v3: localStorage.getItem('pokedexos_save_v3'),
    backups: Object.keys(localStorage).filter(k => k.startsWith('pokedexos_v2_backup_')).map(k => localStorage.getItem(k)),
  }));
  check('v2 save: v3 written at boot', !!after.v3);
  check('v2 save: v2 byte-identical', after.v2 === RICH_V2);
  check('v2 save: backup key written with the raw v2', after.backups.length === 1 && after.backups[0] === RICH_V2);
  const s3 = JSON.parse(after.v3 || '{}');
  const src = richV2();
  for (const n of [1, 2]) {
    const missing = src.players[n].caught.filter(id => !s3.players?.[n]?.caught?.includes(id));
    check(`v2 save: every caught id present in v3 for player ${n}`, missing.length === 0, missing.join(','));
  }
  check('v2 save: P2 is a prereader (from settings.junior)', s3.players?.[2]?.profile === 'prereader');
  check('v2 save: P1 is a reader', s3.players?.[1]?.profile === 'reader');
  check('v2 save: champion kept', s3.players?.[1]?.champion?.date === '2026-08-14');
  check('v2 save: shinies, nicks, badges kept',
    s3.players?.[1]?.shinies?.includes(130) && s3.players?.[1]?.nicks?.['6'] === 'BLAZE' && s3.players?.[1]?.badges?.includes('gym-rock'));
  check('v2 save: mon levels kept', s3.players?.[1]?.mons?.['6']?.level === 72);
  check('v2 save: gyms.beaten kept', !!s3.players?.[1]?.gyms?.beaten?.['water:4']);
  check('who: names shown', (await page.locator('.who-card.p1 .who-name').innerText()) === 'GABE' && (await page.locator('.who-card.p2 .who-name').innerText()) === 'ART');
  for (const v of SIZES) {
    await page.setViewportSize(v);
    await page.waitForTimeout(200);
    await layoutCheck(page, 'who', sz(v));
    await shot(page, `who-${sz(v)}`);
  }
  await page.setViewportSize(SIZES[1]);

  // ---- prereader -> garden
  await page.locator('.who-card.p2').click();
  await waitScene(page, 'garden');
  check('prereader: routes to the garden', (await scene(page)) === 'garden');
  check('prereader: body.calm is on', await page.evaluate(() => document.body.classList.contains('calm')));
  for (const v of SIZES) {
    await page.setViewportSize(v);
    await page.waitForTimeout(250);
    await layoutCheck(page, 'garden', sz(v));
    const words = await visibleWords(page, NAMES_OK);
    check(`garden ${sz(v)}: no words on Art's screen`, words.length === 0, words.slice(0, 5).join(' | '));
    await shot(page, `garden-${sz(v)}`);
  }
  await page.setViewportSize(SIZES[1]);

  const petals = () => page.evaluate(() => Number(document.querySelector('.gd').dataset.petals));
  const plots = () => page.locator('.gd-plot').count();
  const p0 = await petals(), n0 = await plots();
  const field = await page.locator('.gd-field').boundingBox();
  await page.mouse.click(field.x + field.width * 0.2, field.y + field.height * 0.85);
  await page.waitForTimeout(150);
  check('garden: tapping the ground grows a plot', (await plots()) === n0 + 1);
  check('garden: and adds a petal', (await petals()) === p0 + 1);

  // Keep tapping empty ground until a visitor walks in (one per 8 petals).
  const spots = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) spots.push([0.08 + i * 0.16, 0.55 + j * 0.15]);
  let k = 0;
  while ((await page.locator('.gd-visitor').count()) === 0 && k < 40) {
    const [fx, fy] = spots[k % spots.length];
    await page.mouse.click(field.x + field.width * fx, field.y + field.height * fy);
    await page.waitForTimeout(60);
    k++;
  }
  await page.waitForTimeout(1200);
  check('garden: a visitor arrives after enough taps', (await page.locator('.gd-visitor').count()) > 0);
  await shot(page, 'garden-visitor-390x844');
  const visitorId = Number(await page.locator('.gd-visitor').first().getAttribute('data-id'));
  const caughtBefore = (await page.evaluate(() => window.__caughtLen = null));
  void caughtBefore;
  await page.waitForSelector('.gd-ballbtn.show', { timeout: 4000 });
  await tapCenter(page, '.gd-ballbtn');
  await page.waitForTimeout(250);
  await shot(page, 'garden-drawer-390x844');
  const words = await visibleWords(page, NAMES_OK);
  check('garden drawer: no words (no catch odds)', words.length === 0, words.join(' | '));
  // Regression: the catch is on disk the instant the ball is thrown, before
  // any wobble, so leaving mid-animation can never lose it.
  const savedAtThrow = await page.evaluate(id => {
    const opt = document.querySelector('.gd-ball-opt');
    opt.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    const s = JSON.parse(localStorage.getItem('pokedexos_save_v3') || '{}');
    return !!(s.players && s.players[2].caught.includes(id));
  }, visitorId);
  check('garden: the catch is saved the moment the ball is thrown', savedAtThrow);
  await page.waitForFunction(id => {
    const s = JSON.parse(localStorage.getItem('pokedexos_save_v3') || '{}');
    return s.players && s.players[2].caught.includes(id) && s.players[2].bulba.visitors.includes(id);
  }, visitorId, { timeout: 8000 }).then(() => true, () => false).then(ok => check('garden: the ball catch succeeds and adds to caught', ok));
  await page.waitForTimeout(400);

  // ---- back to who, then reader -> road
  await tapCenter(page, '.gd-home');
  await waitScene(page, 'who');
  check('garden home button returns to WHO\'S PLAYING', (await scene(page)) === 'who');
  check('who: body.calm is off', await page.evaluate(() => !document.body.classList.contains('calm')));
  await page.locator('.who-card.p1').click();
  await waitScene(page, 'road');
  check('reader: routes to the road', (await scene(page)) === 'road');
  check('reader: body.calm is off', await page.evaluate(() => !document.body.classList.contains('calm')));
  await page.waitForTimeout(300);
  for (const v of SIZES) {
    await page.setViewportSize(v);
    await page.waitForTimeout(250);
    await layoutCheck(page, 'road', sz(v));
    await shot(page, `road-${sz(v)}`);
  }
  await page.setViewportSize(SIZES[1]);

  const next = await page.evaluate(() => window.__road && window.__road().next);
  check('road: knows the next trainer (classic gym wins carried over)', !!next && next.i === 2 && next.j === 0, JSON.stringify(next));
  await page.locator('.road-next').click({ force: true });
  await waitScene(page, 'battle');
  check('road: NEXT BATTLE starts a trainer battle', (await scene(page)) === 'battle');
  await page.waitForSelector('.bt[data-ready="1"]', { timeout: 10000 });
  await page.waitForTimeout(300);
  for (const v of SIZES) {
    await page.setViewportSize(v);
    await page.waitForTimeout(250);
    await layoutCheck(page, 'battle', sz(v));
    await shot(page, `battle-${sz(v)}`);
  }
  await page.setViewportSize(SIZES[1]);
  // Regression: the tap that hurries the end of a turn must not also press the
  // move button that comes back under the finger (a click with no new press).
  const ghost = await page.evaluate(async () => {
    const bt = document.querySelector('.bt');
    const idle = () => new Promise(res => {
      const t0 = Date.now();
      const tick = () => (!bt.classList.contains('busy') || Date.now() - t0 > 5000) ? res() : setTimeout(tick, 20);
      tick();
    });
    await idle();
    const mv = () => document.querySelector('.bt-moves button:not([disabled])');
    mv().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    mv().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    const started = bt.classList.contains('busy');
    await idle();
    if (!mv() || !document.querySelector('.bt-card[hidden]')) return { skipped: true, started };
    mv().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));   // leftover click, no press
    const ghostStarted = bt.classList.contains('busy');
    if (ghostStarted) return { started, ghostStarted };
    mv().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    mv().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));   // a real new tap
    const realStarted = bt.classList.contains('busy');
    return { started, ghostStarted, realStarted };
  });
  check('battle: a leftover click from a hurrying tap does not pick a move',
    ghost.skipped || (ghost.started && !ghost.ghostStarted && ghost.realStarted), JSON.stringify(ghost));
  check('battle: the Road theme is not playing in a battle', await page.evaluate(async () => {
    const m = await import('./audio/music.js');
    return m.currentTrack() !== 'road';
  }));
  const won = await fightToEnd(page, 'road');
  check('battle: tapping moves wins and returns to the road', won && (await scene(page)) === 'road');
  const s4 = await v3(page);
  const key = next ? `c${next.i}-t${next.j}` : 'none';
  check('road: marks the trainer cleared in the save', !!s4?.players?.[1]?.road?.cleared?.[key], key);
  await page.waitForTimeout(400);
  const next2 = await page.evaluate(() => window.__road && window.__road().next);
  check('road: the next trainer moved on', !!next2 && (next2.i !== next.i || next2.j !== next.j), JSON.stringify(next2));
  check('road: the battle win was counted', (s4?.players?.[1]?.stats?.battlesWon | 0) === 59);
  await shot(page, 'road-after-win-390x844');
  check('v2 save: still byte-identical after play', (await page.evaluate(() => localStorage.getItem('pokedexos_save_v2'))) === RICH_V2);
  await finishPage('rich save', P);
}

// ============================================================ 3. the bud
{
  // A v3 save with Art two petals short of the bud.
  const save = { version: 3, created: '2026-09-01', players: {
    1: { name: 'GABE', profile: 'reader', caught: [25], team: [25], mons: { 25: { level: 10, xp: 0 } } },
    2: { name: 'ART', profile: 'prereader', caught: [1], bulba: { petals: 48, stage: 1, stayStone: false, visitors: [] } },
  } };
  const P = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(save), pokedexos_next_lastplayer: '2' });
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  check('who: last player is highlighted', (await page.locator('.who-card.p2.who-last').count()) === 1);
  await page.locator('.who-card.p2').click();
  await waitScene(page, 'garden');
  const budVisible = () => page.locator('.gd-bud').isVisible();
  check('bud: hidden below 50 petals', !(await budVisible()));
  const field = await page.locator('.gd-field').boundingBox();
  // Tap bare ground only (a visitor walks in on arrival once he has 8+).
  for (let t = 0; t < 30 && (await page.evaluate(() => Number(document.querySelector('.gd').dataset.petals))) < 50; t++) {
    const px = field.x + field.width * (0.1 + (t % 5) * 0.2), py = field.y + field.height * (0.15 + Math.floor(t / 5) * 0.12);
    const onGround = await page.evaluate(([x, y]) => /gd-(field|grass|plots)/.test(document.elementFromPoint(x, y)?.className || ''), [px, py]);
    if (!onGround) continue;
    await page.mouse.click(px, py);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(300);
  const pet = await page.evaluate(() => Number(document.querySelector('.gd').dataset.petals));
  check('bud: petals reached 50', pet >= 50, String(pet));
  check('bud: the bud appears at 50 petals', await budVisible());
  await page.waitForTimeout(1500);
  const stageNow = await page.evaluate(() => document.querySelector('.gd-bulba').dataset.stage);
  check('bud: Bulba does NOT evolve on his own', stageNow === '1');
  check('bud: saved stage is still 1', (await v3(page))?.players?.[2]?.bulba?.stage === 1);
  await shot(page, 'garden-bud-375x667');
  await tapCenter(page, '.gd-bud');
  await page.waitForFunction(() => document.querySelector('.gd-bulba')?.dataset.stage === '2', null, { timeout: 10000 })
    .then(() => true, () => false).then(ok => check('bud: tapping the bud evolves Bulba', ok));
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('pokedexos_save_v3')).players[2].bulba.stage === 2, null, { timeout: 4000 })
    .then(() => true, () => false).then(ok => check('bud: stage 2 saved', ok));
  await shot(page, 'garden-evolved-375x667');
  await finishPage('bud', P);
}

// ============================================================ 4. prereader battle + rest
{
  // Art on the road via a direct battle: never loses, no words on controls.
  const save = { version: 3, created: '2026-09-01', players: {
    1: { name: 'GABE', profile: 'reader', caught: [25], team: [25], mons: { 25: { level: 30, xp: 0 } } },
    2: { name: 'ART', profile: 'prereader', caught: [1], team: [], bulba: { petals: 3, stage: 1, stayStone: false, visitors: [] } },
  } };
  const P = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(save) });
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  // Gabe with a thin save: the first road battle, then the rest scene shot.
  await page.locator('.who-card.p1').click();
  await waitScene(page, 'road');
  await page.locator('.road-next').click({ force: true });
  await waitScene(page, 'battle');
  const won = await fightToEnd(page, 'road', 120);
  check('fresh reader: first battle finishes back on the road', won);
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  await page.locator('.who-card.p2').click();
  await waitScene(page, 'garden');
  await tapCenter(page, '.gd-road');
  await waitScene(page, 'road');
  check('garden signpost opens the road', (await scene(page)) === 'road');
  check('prereader road: body.calm stays on', await page.evaluate(() => document.body.classList.contains('calm')));
  for (const v of SIZES) {
    await page.setViewportSize(v);
    await page.waitForTimeout(250);
    await layoutCheck(page, 'prereader road', sz(v));
    const w = await visibleWords(page, NAMES_OK);
    check(`prereader road ${sz(v)}: no words`, w.length === 0, w.slice(0, 5).join(' | '));
    await shot(page, `road-prereader-${sz(v)}`);
  }
  await page.setViewportSize(SIZES[0]);
  await page.locator('.road-next').click({ force: true });
  await waitScene(page, 'battle');
  await page.waitForSelector('.bt[data-ready="1"]', { timeout: 10000 });
  await page.waitForTimeout(300);
  for (const v of SIZES) {
    await page.setViewportSize(v);
    await page.waitForTimeout(250);
    await layoutCheck(page, 'prereader battle', sz(v));
    const w = await visibleWords(page, NAMES_OK);
    check(`prereader battle ${sz(v)}: no words`, w.length === 0, w.slice(0, 5).join(' | '));
    await shot(page, `battle-prereader-${sz(v)}`);
  }
  await page.setViewportSize(SIZES[0]);
  const artWon = await fightToEnd(page, 'road', 150);
  check('prereader battle: Art wins and returns to the road', artWon);
  const s5 = await v3(page);
  check('prereader battle: Art never lost', (s5?.players?.[2]?.stats?.battlesLost | 0) === 0);

  // The rest scene, for both boys (reached straight through the test hook).
  for (const n of [2, 1]) {
    await page.evaluate(n => { localStorage.setItem('pokedexos_next_lastplayer', String(n)); }, n);
    await page.evaluate(() => window.__go('who'));
    await waitScene(page, 'who');
    await page.locator(`.who-card.p${n}`).click();
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__go('rest', { chapter: 0 }));
    await waitScene(page, 'rest');
    const who = n === 2 ? 'prereader' : 'reader';
    for (const v of SIZES) {
      await page.setViewportSize(v);
      await page.waitForTimeout(250);
      await layoutCheck(page, `rest (${who})`, sz(v));
      if (n === 2) {
        const w = await visibleWords(page, NAMES_OK);
        check(`rest (prereader) ${sz(v)}: no words`, w.length === 0, w.slice(0, 5).join(' | '));
      }
      await shot(page, `rest-${who}-${sz(v)}`);
    }
    await page.setViewportSize(SIZES[0]);
    if (n === 2) {
      // Art's own way to the FAMILY POSTCARD: icons only, no words.
      await page.locator('.rest-postcard').click();
      await waitScene(page, 'postcard');
      await page.waitForSelector('.pc-img:not([hidden])', { timeout: 15000 }).catch(() => {});
      check('postcard (prereader): the card is drawn', await page.locator('.pc-img').isVisible());
      await fitAll(page, 'postcard (prereader)', { words: true, shotName: 'postcard-prereader' });
      await page.locator('.pc-back').click();
      await waitScene(page, 'rest');
    }
  }
  await finishPage('prereader + fresh reader', P);
}

// ============================================================ 5. error net
{
  const P = await newPage(SIZES[0]);
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  await page.evaluate(() => setTimeout(() => { throw new Error('boom test'); }, 0));
  await page.waitForSelector('.oops', { timeout: 3000 }).catch(() => {});
  check('error net: OH NO card shown', await page.locator('.oops-card').isVisible());
  check('error net: no stack trace shown', !(await page.locator('.oops').innerText()).includes('boom'));
  check('error net: has a big retry button', (await page.locator('.oops-btn').innerText()).includes('⟳'));
  await layoutCheck(page, 'oops', sz(SIZES[0]));
  await shot(page, 'oops-375x667');
  page.errors = page.errors.filter(e => !/boom test|SPROUT ROAD/.test(e));
  await finishPage('error net', P);
}

// ============================================================ batch 2 helpers

// Every trainer of chapters [0, upTo) cleared, plus `extra` keys.
function clearedThrough(upTo, extra = []) {
  const out = {};
  const counts = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  for (let i = 0; i < upTo; i++) for (let j = 0; j < counts[i]; j++) out[`c${i}-t${j}`] = true;
  for (const k of extra) out[k] = true;
  return out;
}
async function fitAll(page, label, { words = false, shotName = null, wait = 250 } = {}) {
  for (const v of SIZES) {
    await page.setViewportSize(v);
    await page.waitForTimeout(wait);
    await layoutCheck(page, label, sz(v));
    if (words) {
      const w = await visibleWords(page, NAMES_OK);
      check(`${label} ${sz(v)}: no words`, w.length === 0, w.slice(0, 5).join(' | '));
    }
    if (shotName) await shot(page, `${shotName}-${sz(v)}`);
  }
  await page.setViewportSize(SIZES[0]);
  await page.waitForTimeout(150);
}
const road = page => page.evaluate(() => window.__road && window.__road());
const clickEl = (page, sel) => page.evaluate(s => { const el = document.querySelector(s); if (el) el.click(); return !!el; }, sel);

// ============================================================ 6. Gabe's story: leader -> rest -> postcard, rival, guardian -> seed -> hatch
{
  const save = { version: 3, created: '2026-09-01', players: {
    1: { name: 'GABE', profile: 'reader', caught: [25, 6], team: [25, 6], mons: { 25: { level: 100, xp: 0 }, 6: { level: 100, xp: 0 } },
      road: { chapter: 2, cleared: clearedThrough(2, ['c2-t0', 'c2-t1', 'c2-t2', 'c2-t3']), bloomed: [0, 1], seeds: 2, guardians: { 1: true }, hatched: false, rival: { wins: 1, losses: 0, last: 1 } } },
    2: { name: 'ART', profile: 'prereader', caught: [1], bulba: { petals: 3, stage: 1, stayStone: false, visitors: [] } },
  } };
  const P = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(save) });
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  await page.locator('.who-card.p1').click();
  await waitScene(page, 'road');
  let r = await road(page);
  check('story: no rival before the leader falls (he stepped aside last gap)', r && r.rival === -1, JSON.stringify(r && r.rival));
  check('story: the next fight is chapter 3\'s leader', r && r.next && r.next.i === 2 && r.next.j === 4, JSON.stringify(r && r.next));
  check('story: seeds carried in the save', r && r.seeds === 2);
  // The egg is earned. Jumping straight to the hatch scene with 2 seeds must
  // bounce back to the road and give nothing.
  await page.evaluate(() => window.__go('hatch'));
  await waitScene(page, 'road', 8000).catch(() => {});
  check('hatch: no egg without three seeds', (await scene(page)) === 'road' &&
    await page.evaluate(() => JSON.parse(localStorage.getItem('pokedexos_save_v3')).players[1].road.hatched !== true));
  await page.locator('.road-next').click({ force: true });
  await waitScene(page, 'battle');
  await fightToEnd(page, 'road', 120);
  await waitScene(page, 'rest', 20000).catch(() => {});
  check('story: a leader win blooms the chapter and ends at the campfire', (await scene(page)) === 'rest');
  check('rest: has a postcard button', (await page.locator('.rest-postcard').count()) === 1);
  await fitAll(page, 'rest (after leader)', { shotName: 'rest-postcard' });
  // Postcard entry point #1: the campfire. BACK comes home to the same fire.
  await page.locator('.rest-postcard').click();
  await waitScene(page, 'postcard');
  await page.waitForSelector('.pc-img:not([hidden])', { timeout: 15000 }).catch(() => {});
  check('rest -> postcard: the card is drawn', await page.locator('.pc-img').isVisible());
  await page.locator('.pc-back').click();
  await waitScene(page, 'rest');
  check('postcard BACK returns to the same campfire (chapter kept)', (await page.locator('.rest-badge').count()) === 1);
  check('postcard: counted once in the family save', ((await v3(page))?.family?.postcards | 0) === 1);
  await page.locator('.rest-go').click();
  await waitScene(page, 'road');
  await page.waitForTimeout(400);
  r = await road(page);
  check('rival: appears after a leader win (between chapters 3 and 4)', r && r.rival === 2, JSON.stringify(r && r.rival));
  check('rival: his token is on the map', (await page.locator('.road-rival').count()) === 1);
  await clickEl(page, '.road-rival');
  await page.waitForSelector('.rival-card', { timeout: 4000 }).catch(() => {});
  check('rival: tapping him shows his team card', await page.locator('.rival-card').isVisible());
  await fitAll(page, 'rival card', { shotName: 'rival-card' });
  await page.locator('.rival-past').click();
  await page.waitForTimeout(200);
  check('rival: WALK PAST closes the card', (await page.locator('.rival-card').count()) === 0);
  const nextFree = await page.evaluate(() => {
    const b = document.querySelector('.road-next');
    if (!b) return false;
    const rc = b.getBoundingClientRect();
    const hit = document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
    return !!hit && (hit === b || b.contains(hit));
  });
  check('rival: skippable, NEXT BATTLE is not blocked', nextFree);
  r = await road(page);
  check('rival: skipping him never costs anything (seeds unchanged)', r && r.seeds === 2);

  // The Old Venusaur of chapter 1 -> the third seed -> the egg hatches.
  check('guardian: chapter 1\'s Old Venusaur is on the map', (await page.locator('.road-guardian[data-guardian="0"]').count()) === 1);
  await clickEl(page, '.road-guardian[data-guardian="0"]');
  await waitScene(page, 'battle');
  await fightToEnd(page, 'road', 120);
  await waitScene(page, 'road');
  await page.waitForFunction(() => window.__hatch && window.__hatch().phase === 'done', null, { timeout: 15000 })
    .then(() => true, () => false).then(ok => check('seed: the third seed hatches the egg', ok));
  const s6 = await v3(page);
  const g = s6?.players?.[1];
  check('guardian win -> seed (3 seeds, guardian 0 beaten)', g?.road?.seeds === 3 && !!g?.road?.guardians?.['0'], JSON.stringify(g?.road));
  check('hatch: Bulbasaur added to caught', g?.caught?.includes(1));
  check('hatch: Bulbasaur joins the team (room for it)', g?.team?.includes(1));
  check('hatch: marked hatched in the save', g?.road?.hatched === true);
  await fitAll(page, 'hatch', { shotName: 'hatch' });
  await page.locator('.hatch-ok').click();
  await page.waitForTimeout(300);
  check('hatch: OK closes the ceremony back to the Road', (await scene(page)) === 'road' && (await page.locator('.hatch').count()) === 0);
  // The egg is also a real route now.
  await page.evaluate(() => window.__go('hatch'));
  await waitScene(page, 'hatch');
  check('hatch: routed scene renders (no second Bulbasaur)', ((await v3(page))?.players?.[1]?.caught || []).filter(x => x === 1).length === 1);
  await page.waitForSelector('.hatch-ok:not([hidden])', { timeout: 8000 }).catch(() => {});
  await page.locator('.hatch-ok').click();
  await waitScene(page, 'road');
  check('v3 save: v2 key never created by story play', await page.evaluate(() => localStorage.getItem('pokedexos_save_v2') === null));
  await finishPage('gabe story', P);
}

// ============================================================ 7. Art's berries -> gift on Gabe's Road -> a battle berry
{
  const save = { version: 3, created: '2026-09-01', players: {
    1: { name: 'GABE', profile: 'reader', caught: [25], team: [25], mons: { 25: { level: 7, xp: 0 } } },
    2: { name: 'ART', profile: 'prereader', caught: [1], bulba: { petals: 3, stage: 1, stayStone: false, visitors: [] },
      garden: { plots: [{ x: 0.5, y: 0.72, kind: 'oran', grown: 4 }], berries: 9 } },
  }, gifts: { toReader: 0 } };
  const P = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(save) });
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  await page.locator('.who-card.p2').click();
  await waitScene(page, 'garden');
  await page.waitForSelector('.gd-plot.bush', { timeout: 5000 });
  await tapCenter(page, '.gd-plot.bush');
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('pokedexos_save_v3') || '{}').gifts || {}).toReader === 1, null, { timeout: 6000 })
    .then(() => true, () => false).then(ok => check('gift: Art\'s 10th berry sends a gift', ok));
  check('gift: Art keeps every berry he grew', (await v3(page))?.players?.[2]?.garden?.berries === 10);
  await page.waitForTimeout(800);
  const w7 = await visibleWords(page, NAMES_OK);
  check('gift: no words on Art\'s screen while it flies', w7.length === 0, w7.join(' | '));
  await tapCenter(page, '.gd-home');
  await waitScene(page, 'who');
  await page.locator('.who-card.p1').click();
  await waitScene(page, 'road');
  check('gift: a leaf-stamped box waits on Gabe\'s Road', (await page.locator('.road-gift').count()) === 1);
  await shot(page, 'road-gift-375x667');
  await clickEl(page, '.road-gift');
  await page.waitForTimeout(300);
  let r = await road(page);
  check('gift: unwrapping puts an Oran Berry in his pouch', r && r.berries === 1 && r.gifts === 1, JSON.stringify(r && { b: r.berries, g: r.gifts }));
  await page.waitForTimeout(1600);
  await page.locator('.road-next').click({ force: true });
  await waitScene(page, 'battle');
  await page.waitForSelector('.bt[data-ready="1"]', { timeout: 10000 });
  check('berry: the battle offers his berry (x1)', (await page.locator('.bt-act-berry').count()) === 1 && (await page.locator('.bt-berry-n').innerText()) === 'x1');
  check('berry: disabled at full health', await page.locator('.bt-act-berry').isDisabled());
  let ate = false;
  for (let t = 0; t < 12 && !ate && (await scene(page)) === 'battle'; t++) {
    await page.waitForFunction(() => { const b = document.querySelector('.bt'); return !b || !b.classList.contains('busy'); }, null, { timeout: 8000 }).catch(() => {});
    if ((await page.locator('.bt-card:not([hidden])').count())) break;
    const berry = page.locator('.bt-act-berry:not([disabled])');
    if (await berry.count()) { await berry.click({ force: true }); ate = true; break; }
    // v20.1.2: after a faint Gabe picks who comes in (the team drawer).
    const pick = page.locator('.bt-drawer:not([hidden]) .bt-slot:not([disabled])');
    if (await pick.count() && !(await page.locator('.bt-moves button:not([disabled])').count())) { await pick.first().click({ force: true }).catch(() => {}); await page.waitForTimeout(120); continue; }
    const mv = page.locator('.bt-moves button:not([disabled]):visible');
    if (await mv.count()) await mv.first().click({ force: true });
    await page.waitForTimeout(150);
  }
  check('berry: he could eat it once hurt', ate);
  await page.waitForTimeout(400);
  check('berry: eating it used up Art\'s gift', ((await v3(page))?.gifts?.toReader | 0) === 0);
  await fightToEnd(page, 'road', 150);
  await waitScene(page, 'road').catch(() => {});
  await page.waitForTimeout(400);
  r = await road(page);
  check('berry: back on the Road, the pouch is empty and no box waits', r && r.berries === 0 && r.gifts === 0 && (await page.locator('.road-gift').count()) === 0, JSON.stringify(r && { b: r.berries, g: r.gifts }));
  await finishPage('gifts', P);
}

// ============================================================ 8. picture lock
{
  const save = { version: 3, created: '2026-09-01', players: {
    1: { name: 'GABE', profile: 'reader', caught: [25, 6, 7, 1, 4], team: [25], mons: { 25: { level: 10, xp: 0 } }, lock: { pics: [25, 6, 7] } },
    2: { name: 'ART', profile: 'prereader', caught: [1], bulba: { petals: 3, stage: 1, stayStone: false, visitors: [] } },
  } };
  const P = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(save) });
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  await page.locator('.who-card.p1').click();
  await page.waitForSelector('.lk', { timeout: 4000 }).catch(() => {});
  check('lock: a locked card shows the picture lock', await page.locator('.lk').isVisible());
  check('lock: nine pictures, his three among them', (await page.locator('.lk-pic').count()) === 9 &&
    (await page.locator('.lk-pic[data-id="25"], .lk-pic[data-id="6"], .lk-pic[data-id="7"]').count()) === 3);
  await fitAll(page, 'lock', { shotName: 'lock' });
  for (const id of [6, 25, 7]) { await page.locator(`.lk-pic[data-id="${id}"]`).click(); await page.waitForTimeout(60); }
  await page.waitForTimeout(700);
  check('lock: the wrong order does not open', (await scene(page)) === 'who' && (await page.locator('.lk').count()) === 1);
  check('lock: the dots empty again after a miss', (await page.locator('.lk-dot.on').count()) === 0);
  check('lock: nothing written on a miss', (await v3(page))?.players?.[1]?.lock?.pics?.join() === '25,6,7');
  for (const id of [25, 6, 7]) { await page.locator(`.lk-pic[data-id="${id}"]`).click(); await page.waitForTimeout(60); }
  await waitScene(page, 'road').catch(() => {});
  check('lock: the right order opens his Road', (await scene(page)) === 'road');
  await page.evaluate(() => window.__go('who'));
  await waitScene(page, 'who');
  await page.locator('.who-card.p2').click();
  await waitScene(page, 'garden').catch(() => {});
  check('lock: Art is never locked out', (await scene(page)) === 'garden');

  // PLAY TOGETHER: Art never takes the battle seat, and Gabe's lock guards it.
  await page.evaluate(() => window.__go('together'));
  await waitScene(page, 'together');
  check('together: swap hidden when it would seat Art to battle',
    await page.locator('.tg-swap').evaluate(el => getComputedStyle(el).visibility === 'hidden'));
  await page.locator('.tg-swap').click({ force: true });
  check('together: swap cannot put Art in the battle seat', (await page.locator('.tg-seat-battle[data-player="1"]').count()) === 1);
  check('together: seat params never seat a prereader over a reader',
    await page.evaluate(async () => { const m = await import('./scenes/together.js'); const s = m.seatsFrom(JSON.parse(localStorage.getItem('pokedexos_save_v3')), { battler: 2, helper: 1 }); return s.battler === 1 && s.helper === 2; }));
  await page.locator('.tg-table').click();
  await page.waitForSelector('.lk', { timeout: 4000 }).catch(() => {});
  check('together: a locked battler must open his lock first', (await page.locator('.lk').count()) === 1 && (await scene(page)) === 'together');
  for (const id of [25, 6, 7]) { await page.locator(`.lk-pic[data-id="${id}"]`).click(); await page.waitForTimeout(60); }
  await waitScene(page, 'family-table').catch(() => {});
  check('together: the right pictures open FAMILY TABLE', (await scene(page)) === 'family-table');

  // Grown-up panel: it never shows the combination, and a locked card's
  // profile / lock need a grown-up sum first.
  await page.evaluate(() => window.__go('who'));
  await waitScene(page, 'who');
  const gb = await page.locator('.who-gear').boundingBox();
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await page.mouse.down(); await page.waitForTimeout(2200); await page.mouse.up();
  check('gear: the lock\'s pictures are not shown', (await page.locator('.gu-panel .gu-lock-sprite').count()) === 0);
  await page.locator('.gu-profile[data-player="1"]').click();
  check('gear: a locked card\'s profile needs a grown-up check', (await page.locator('.gu-check-q').count()) === 1 &&
    (await v3(page))?.players?.[1]?.profile === 'reader');
  const [qa, qb] = await page.locator('.gu-check-q').evaluate(el => [Number(el.dataset.a), Number(el.dataset.b)]);
  for (const d of String(qa * qb)) await page.locator(`.gu-check-key[data-key="${d}"]`).click();
  check('gear: the right answer flips the profile', (await v3(page))?.players?.[1]?.profile === 'prereader');
  await finishPage('picture lock', P);
}

// ============================================================ 7b. a gift survives leaving mid-flight
{
  const save = { version: 3, created: '2026-09-01', players: {
    1: { name: 'GABE', profile: 'reader', caught: [25], team: [25], mons: { 25: { level: 7, xp: 0 } } },
    2: { name: 'ART', profile: 'prereader', caught: [1], bulba: { petals: 3, stage: 1, stayStone: false, visitors: [] },
      garden: { plots: [{ x: 0.5, y: 0.72, kind: 'oran', grown: 4 }], berries: 19 } },
  }, gifts: { toReader: 0 } };
  const P = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(save) });
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  await page.locator('.who-card.p2').click();
  await waitScene(page, 'garden');
  await page.waitForSelector('.gd-plot.bush', { timeout: 5000 });
  await tapCenter(page, '.gd-plot.bush');
  await page.evaluate(() => window.__go('who'));     // leave at once, before the box has flown
  await waitScene(page, 'who');
  const sv = await v3(page);
  check('gift: leaving mid-flight still keeps Art\'s gift', (sv?.gifts?.toReader | 0) === 1 && sv?.players?.[2]?.garden?.berries === 20,
    JSON.stringify({ g: sv?.gifts, b: sv?.players?.[2]?.garden?.berries }));
  await finishPage('gift mid-flight', P);
}

// ============================================================ 9-11. PLAY TOGETHER: family table, couch versus, postcard
{
  const save = { version: 3, created: '2026-09-01', players: {
    1: { name: 'GABE', profile: 'reader', caught: [25, 6, 7], team: [25, 6, 7], mons: { 25: { level: 12, xp: 0 }, 6: { level: 12, xp: 0 }, 7: { level: 12, xp: 0 } },
      road: { chapter: 1, cleared: clearedThrough(1), bloomed: [0] } },
    2: { name: 'ART', profile: 'prereader', caught: [1], bulba: { petals: 5, stage: 1, stayStone: false, visitors: [] } },
  } };
  const P = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(save) });
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  check('together: PLAY TOGETHER card on WHO\'S PLAYING', (await page.locator('.who-together').count()) === 1);
  await page.locator('.who-together').click();
  await waitScene(page, 'together');
  check('together: routes to the seats screen', (await scene(page)) === 'together');
  check('together: the reader sits in the battle seat', (await page.locator('.tg-seat-battle[data-player="1"]').count()) === 1);
  await fitAll(page, 'together', { shotName: 'together' });

  // ---- 9. FAMILY TABLE
  await page.locator('.tg-table').click();
  await waitScene(page, 'family-table');
  await page.waitForSelector('.ft[data-ready="1"]', { timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector('.ft').classList.contains('busy'), null, { timeout: 8000 });
  check('table: TEAM-UP hidden while the pot is empty', await page.locator('.ft-teamup').isHidden());
  check('table: moves use the battle view\'s button', (await page.locator('.ft-moves .bt-move.ft-move').count()) > 0);
  await fitAll(page, 'family table', { shotName: 'family-table' });
  // Record every damage number (side, class, final value) as it leaves.
  await page.evaluate(() => {
    window.__dmg = [];
    const seen = new WeakSet();
    const read = n => {
      if (seen.has(n)) return; seen.add(n);
      const v = parseInt((n.querySelector('.fs-dmg-num') || n).textContent.replace(/[^0-9]/g, ''), 10);
      window.__dmg.push({ foe: !!n.closest('.fs-spot-foe'), cls: n.className, v: Number.isFinite(v) ? v : 0 });
    };
    new MutationObserver(ms => {
      for (const m of ms) for (const n of m.addedNodes) {
        if (n.nodeType === 1 && n.classList.contains('fs-dmg')) setTimeout(() => read(n), 700);
      }
    }).observe(document.querySelector('.fs-field'), { childList: true, subtree: true });
  });
  const idle = () => page.waitForFunction(() => { const f = document.querySelector('.ft'); return !f || !f.classList.contains('busy') || !document.querySelector('.ft-card[hidden]'); }, null, { timeout: 10000 }).catch(() => {});
  const hpMe = () => page.evaluate(() => parseFloat(document.querySelector('.fs-hud-me .fs-hp-fill').style.width) || 0);
  const artTap = async () => { await tapCenter(page, '.ft-bulba'); await page.waitForTimeout(60); };
  let healed = null;
  for (let t = 0; t < 3; t++) {
    if (await page.locator('.ft-card:not([hidden])').count()) break;
    await artTap();
    await page.locator('.ft-move:not([disabled])').first().click({ force: true });
    await page.waitForTimeout(100);
    await idle();
    if (healed === null) {
      const before = await hpMe();
      if (before < 100 && before > 0) {
        await page.locator('.ft-berry').click();
        await page.waitForTimeout(200);
        const after = await hpMe();
        healed = { before, after };
      }
    }
  }
  check('table: Art\'s berry heals Gabe\'s Pokemon', !!healed && healed.after > healed.before, JSON.stringify(healed));
  check('table: the leaf pot fills from Art\'s taps', (await page.locator('.ft-pot').getAttribute('data-fill')) === '3');
  const teamupShown = (await page.locator('.ft-gabe .ft-teamup').isVisible());
  check('table: TEAM-UP appears on Gabe\'s side when the pot is full', teamupShown);
  await fitAll(page, 'family table teamup', { shotName: 'family-table-teamup' });
  if (teamupShown) {
    await page.locator('.ft-teamup').click();
    await page.waitForTimeout(200);
    await idle();
    await page.waitForTimeout(900);
    const dmg = await page.evaluate(() => window.__dmg);
    const tu = dmg.filter(d => d.foe && /teamup/.test(d.cls));
    const normal = dmg.filter(d => d.foe && !/teamup|heal|heart/.test(d.cls)).map(d => d.v);
    const bonus = await page.evaluate(async () => {
      const m = await import('./scenes/family-table.js');
      const mv = m.teamUpMove({ moves: [{ power: 40 }, { power: 85 }], atk: 10, spatk: 5 });
      return mv.type === 'grass' && mv.power > 85 && mv.teamUp === true;
    });
    check('table: TEAM-UP lands a real hit on the foe', tu.length === 1 && tu[0].v > 0, JSON.stringify(dmg));
    check('table: TEAM-UP deals bonus damage', bonus && tu.length === 1 && (normal.length === 0 || tu[0].v > Math.max(...normal) || tu[0].v >= Math.min(...normal) * 1.2), JSON.stringify({ tu, normal }));
    check('table: the pot empties after a TEAM-UP', (await page.locator('.ft-pot').getAttribute('data-fill')) === '0');
  }
  const petalsBefore = (await v3(page))?.players?.[2]?.bulba?.petals | 0;
  for (let t = 0; t < 120; t++) {
    if (await page.locator('.ft-card:not([hidden])').count()) break;
    const mv = page.locator('.ft-move:not([disabled])');
    if (await mv.count()) await mv.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(120);
  }
  check('table: the fight ends on a result card', await page.locator('.ft-card').isVisible());
  await page.waitForTimeout(1200);
  const s9 = await v3(page);
  const won9 = await page.locator('.ft-card-box.win').count();
  check('table: Art\'s BULBA gets petals either way', (s9?.players?.[2]?.bulba?.petals | 0) > petalsBefore);
  if (won9) check('table: a win clears the trainer on Gabe\'s Road', !!s9?.players?.[1]?.road?.cleared?.['c1-t0']);
  await fitAll(page, 'family table card', { shotName: 'family-table-card' });

  // ---- 11. POSTCARD (entry point #2: the end of the family table)
  await page.evaluate(() => {
    window.__shared = null;
    navigator.canShare = () => true;
    navigator.share = d => { window.__shared = { n: d.files.length, type: d.files[0].type, size: d.files[0].size, name: d.files[0].name }; return Promise.resolve(); };
  });
  await page.locator('.ft-card-go').click();
  await waitScene(page, 'postcard');
  await page.waitForSelector('.pc-img:not([hidden])', { timeout: 15000 }).catch(() => {});
  check('postcard: family table ▶ opens the postcard', await page.locator('.pc-img').isVisible());
  const blob = await page.evaluate(async () => {
    const m = await import('./ui/postcard.js');
    const { store } = await import('./core/store.js');
    const b = await m.makePostcard({ players: store.save.players, date: '2026-09-26', highlight: 25, number: 7 });
    const head = new Uint8Array(await b.slice(0, 8).arrayBuffer());
    return { type: b.type, size: b.size, sig: Array.from(head.slice(1, 4)).map(c => String.fromCharCode(c)).join('') };
  });
  check('postcard: makePostcard returns a PNG blob', blob.type === 'image/png' && blob.sig === 'PNG' && blob.size > 5000, JSON.stringify(blob));
  check('postcard: SHARE shows when canShare says yes', await page.locator('.pc-share').isVisible());
  await page.locator('.pc-share').click();
  await page.waitForTimeout(200);
  const shared = await page.evaluate(() => window.__shared);
  check('postcard: SHARE calls navigator.share with the PNG file', !!shared && shared.n === 1 && shared.type === 'image/png' && shared.size > 0 && /\.png$/.test(shared.name), JSON.stringify(shared));
  await fitAll(page, 'postcard', { shotName: 'postcard' });
  await page.locator('.pc-back').click();
  await waitScene(page, 'together');
  check('postcard: BACK returns to PLAY TOGETHER', (await scene(page)) === 'together');

  // ---- 10. COUCH VERSUS
  await page.locator('.tg-versus').click();
  await waitScene(page, 'versus');
  await page.waitForSelector('.vs-dad', { timeout: 5000 });
  await fitAll(page, 'versus setup', { shotName: 'versus-setup' });
  await page.waitForTimeout(300);
  await page.locator('.vs-dad-random').click();
  await page.waitForTimeout(300);
  await page.locator('.vs-dad-go').click();
  await page.waitForSelector('.vs-curtain[data-side="me"]', { timeout: 10000 }).catch(() => {});
  check('versus: a curtain before Gabe\'s pick', await page.locator('.vs-curtain[data-side="me"]').isVisible());
  check('versus: no moves visible behind the curtain', (await page.locator('.vs-move').count()) === 0);
  await fitAll(page, 'versus curtain', { shotName: 'versus-curtain' });
  const hpOf = side => page.evaluate(s => parseFloat(document.querySelector(`.fs-hud-${s} .fs-hp-fill`).style.width) || 0, side);
  let round1 = null, rounds = 0, curtainBetween = true;
  for (; rounds < 80; rounds++) {
    if (await page.locator('.vs-win').count()) break;
    await page.waitForTimeout(250);
    await page.waitForSelector('.vs-curtain[data-side="me"], .vs-win', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(300);
    if (await page.locator('.vs-win').count()) break;
    const hp0 = { me: await hpOf('me'), foe: await hpOf('foe') };
    // Each new screen ignores a tap in its first 250ms (ghost-click guard),
    // so the test taps at a human pace.
    await page.locator('.vs-pass').click();
    await page.waitForTimeout(300);
    await page.locator('.vs-move').first().click();
    await page.waitForTimeout(300);
    const between = (await page.locator('.vs-curtain[data-side="foe"]').isVisible()) && (await page.locator('.vs-move').count()) === 0;
    curtainBetween = curtainBetween && between;
    if (rounds === 0) await fitAll(page, 'versus curtain (dad)', { shotName: 'versus-curtain-dad' });
    await page.waitForTimeout(300);
    await page.locator('.vs-pass').click();
    await page.waitForTimeout(300);
    if (rounds === 0) await fitAll(page, 'versus pick', { shotName: 'versus-pick' });
    await page.locator('.vs-move').first().click();
    await page.waitForSelector('.vs-curtain[data-side="me"], .vs-win', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(300);
    if (rounds === 0) round1 = { before: hp0, after: { me: await hpOf('me'), foe: await hpOf('foe') }, over: (await page.locator('.vs-win').count()) > 0 };
  }
  check('versus: the curtain comes down between the two picks', curtainBetween);
  check('versus: both picks resolve (both sides hit in round 1)', !!round1 && (round1.over || (round1.after.me < round1.before.me && round1.after.foe < round1.before.foe)), JSON.stringify(round1));
  check('versus: a winner is crowned', (await page.locator('.vs-win').count()) === 1, 'rounds ' + rounds);
  const tally = (await v3(page))?.family?.versus || {};
  check('versus: the tally is saved', ((tally.gabe | 0) + (tally.dad | 0)) === 1, JSON.stringify(tally));
  await fitAll(page, 'versus win', { shotName: 'versus-win' });
  await page.locator('.vs-win-btn[aria-label="HOME"]').click();
  await waitScene(page, 'who');
  await finishPage('play together', P);
}

// ============================================================ batch 3 helpers
// A trail of every scene shown, so a test can prove one was NEVER visited.
async function startTrail(page) {
  await page.evaluate(() => {
    window.__trail = [];
    clearInterval(window.__trailT);
    window.__trailT = setInterval(() => { const s = window.__scene; if (s && window.__trail[window.__trail.length - 1] !== s) window.__trail.push(s); }, 30);
  });
}
const trail = page => page.evaluate(() => window.__trail || []);
const b3Save = () => ({ version: 3, created: '2026-09-01', players: {
  1: { name: 'GABE', profile: 'reader', caught: [1, 4, 6, 7, 10, 25, 133, 150], team: [6, 25, 133],
    mons: { 6: { level: 60, xp: 0 }, 25: { level: 58, xp: 0 }, 133: { level: 55, xp: 0 }, 10: { level: 6, xp: 84 } },
    favorites: [1, 4, 6, 7, 25, 133], shinies: [25], nicks: { 6: 'BLAZE' }, items: { masterBalls: 3 },
    road: { chapter: 1, cleared: clearedThrough(1), bloomed: [0] } },
  2: { name: 'ART', profile: 'prereader', caught: [1, 7, 10, 16, 19, 25, 133, 129, 74], team: [10],
    mons: { 10: { level: 6, xp: 84 } }, shinies: [133], nicks: { 25: 'PIKA' },
    bulba: { petals: 14, stage: 1, stayStone: false, visitors: [16, 19] } },
}, family: { postcards: 2, lastPostcard: '2026-09-20', versus: { gabe: 1, dad: 1 } } });

// ============================================================ 13. Pokedex + team editor
{
  const P = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(b3Save()) });
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  await page.locator('.who-card.p1').click();
  await waitScene(page, 'road');
  check('road: header has the Pokédex and team buttons', (await page.locator('.road-dex').count()) === 1 && (await page.locator('.road-team .road-tool-sprite').count()) === 1);
  await fitAll(page, 'road (batch 3 header)', { shotName: 'b3-road' });
  await page.locator('.road-dex').click();
  await waitScene(page, 'dex');
  check('dex: the grid holds all 649', (await page.locator('.dex-cell').count()) === 649);
  check('dex: caught ones are lit', (await page.locator('.dex-cell.is-caught').count()) === 8);
  await fitAll(page, 'dex grid', { shotName: 'b3-dex' });
  await page.locator('.dex-cell[data-id="25"]').click();
  await page.waitForSelector('.dex-card', { timeout: 5000 });
  check('dex: the detail card opens', await page.locator('.dex-card.is-caught').isVisible());
  await fitAll(page, 'dex card', { shotName: 'b3-dex-card' });
  // NAME ME: the keypad only types A-Z and space, and caps at 12.
  await page.locator('.dex-nameme').click();
  await page.waitForSelector('.dex-kp', { timeout: 5000 });
  await fitAll(page, 'dex keypad', { shotName: 'b3-dex-keypad' });
  await page.locator('.dex-kp-clr').click();
  await page.keyboard.type('sp<a>&rky"99 thunderbolt');
  await page.locator('.dex-kp-ok').click();
  const nick = (await v3(page))?.players?.[1]?.nicks?.[25];
  check('dex: nickname saved, cleaned and capped at 12', typeof nick === 'string' && /^[A-Z ]{1,12}$/.test(nick) && nick.startsWith('SPARKY'), JSON.stringify(nick));
  await page.locator('.dex-close').click();
  // Favourites: six stars is the cap; a seventh offers a swap, never a "no".
  await page.locator('.dex-cell[data-id="150"]').click();
  await page.waitForSelector('.dex-card', { timeout: 5000 });
  await page.locator('.dex-fav').click();
  check('dex: a 7th star shows the swap row', await page.locator('.dex-favswap:not([hidden])').isVisible());
  check('dex: the cap holds at 6', ((await v3(page))?.players?.[1]?.favorites || []).length === 6);
  await page.locator('.dex-favswap-b').first().click({ force: true });
  const favs = (await v3(page))?.players?.[1]?.favorites || [];
  check('dex: a swap moves a star (still 6)', favs.length === 6 && favs.includes(150) && !favs.includes(1), JSON.stringify(favs));
  await page.locator('.dex-close').click();
  // Team editor: tap two filled slots to swap them; that changes the LEAD.
  await page.locator('.dex-teambtn').click();
  await waitScene(page, 'team');
  await fitAll(page, 'team editor', { shotName: 'b3-team' });
  await page.locator('.team-slot[data-slot="0"]').click();
  await page.locator('.team-slot[data-slot="1"]').click();
  const team = (await v3(page))?.players?.[1]?.team || [];
  check('team: swapping slots 1 and 2 changes the lead', team[0] === 25 && team[1] === 6, JSON.stringify(team));
  await page.locator('.team-back').click();
  await waitScene(page, 'dex');
  await page.locator('.dex-back').click();
  await waitScene(page, 'road');
  check('dex: BACK returns to the road', (await scene(page)) === 'road');
  // Art's Pokedex: pictures and numbers only.
  await page.evaluate(() => { localStorage.setItem('pokedexos_next_lastplayer', '2'); window.__go('who'); });
  await waitScene(page, 'who');
  await page.locator('.who-card.p2').click();
  await waitScene(page, 'garden');
  await page.evaluate(() => window.__go('dex', { returnTo: 'garden' }));
  await waitScene(page, 'dex');
  await fitAll(page, 'dex (prereader)', { words: true, shotName: 'b3-dex-pre' });
  await page.locator('.dex-cell.is-caught').first().click();
  await page.waitForSelector('.dex-card', { timeout: 5000 });
  await fitAll(page, 'dex card (prereader)', { words: true, shotName: 'b3-dex-card-pre' });
  check('dex (prereader): only his own Pokemon, never a silhouette', (await page.locator('.dex-cell.is-shadow').count()) === 0 && (await page.locator('.dex-cell.is-caught').count()) > 0);
  // Fixer: Art's BULBA is never drafted out. His save has team [10] (Caterpie),
  // but Bulba still leads his fights; the Road header has no team editor for
  // him, and its book opens his Sticker Book.
  await page.evaluate(() => window.__go('road'));
  await waitScene(page, 'road');
  check('road (prereader): no team editor button', !(await page.locator('.road-team').isVisible()));
  await page.locator('.road-dex').click();
  await waitScene(page, 'book');
  check('road (prereader): the book button opens his Sticker Book', (await scene(page)) === 'book');
  await page.evaluate(() => window.__go('battle', { enemyTeam: [{ id: 16, level: 3 }], returnTo: 'garden' }));
  await page.waitForSelector('.bt[data-ready="1"] .bt-sprite-me', { timeout: 10000 });
  const artLead = await page.locator('.bt-sprite-me').first().getAttribute('src');
  check('battle (prereader): BULBA leads even with a team of his own', /\/back\/1\.(gif|png)$/.test(artLead || ''), artLead);
  await finishPage('dex + team', P);
}

// ============================================================ 14. tall grass -> wild battle -> catch
{
  const P = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(b3Save()) });
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  await page.locator('.who-card.p1').click();
  await waitScene(page, 'road');
  await page.locator('.road-node[data-chapter="0"]').click({ force: true });
  await page.waitForSelector('.chapter-grass', { timeout: 5000 });
  check('road: a bloomed chapter shows TALL GRASS', await page.locator('.chapter-grass').isVisible());
  await fitAll(page, 'chapter with tall grass', { shotName: 'b3-chapter-grass' });
  await page.locator('.chapter-grass').click();
  await waitScene(page, 'wild');
  check('wild: straight into chapter 1\'s grass', await page.locator('.wild[data-view="grass"][data-place="0"]').count() === 1);
  await fitAll(page, 'wild grass', { shotName: 'b3-wild' });
  const hot = await page.locator('.wild').getAttribute('data-hot');
  const enc = await page.locator('.wild').getAttribute('data-encounter');
  const encId = Number(String(enc).split(':')[0]);
  const caughtBefore = (await v3(page))?.players?.[1]?.caught || [];
  await page.locator(`.wild-tuft[data-i="${hot}"]`).click();
  await waitScene(page, 'battle', 10000);
  await page.waitForSelector('.bt[data-ready="1"]', { timeout: 10000 });
  check('wild: the battle is a wild one (a ball button)', (await page.locator('.bt-act-ball').count()) === 1);
  await page.locator('.bt-act-ball').click();
  await page.locator('.bt-ballbtn.ball-master').click();
  for (let i = 0; i < 40 && (await scene(page)) === 'battle'; i++) {
    const ok = page.locator('.bt-ok:visible');
    if (await ok.count()) await ok.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(150);
  }
  await waitScene(page, 'wild', 10000).catch(() => {});
  const after = await v3(page);
  check('wild: back in the grass after the catch', (await scene(page)) === 'wild');
  check('wild: the catch is added to caught', (after?.players?.[1]?.caught || []).includes(encId), `${enc} ${JSON.stringify(caughtBefore)}`);
  check('wild: explores counted', (after?.players?.[1]?.stats?.explores | 0) >= 1);
  await fitAll(page, 'wild (after catch)', { shotName: 'b3-wild-after' });
  await page.evaluate(() => window.__go('wild'));
  await waitScene(page, 'wild');
  await fitAll(page, 'wild picker', { shotName: 'b3-wild-picker' });
  await finishPage('wild', P);
}

// ============================================================ 15. evolution (reader asks; WAIT keeps it; Art never sees it)
{
  const P = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(b3Save()) });
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  await page.locator('.who-card.p1').click();
  await waitScene(page, 'road');
  const fight = () => page.evaluate(() => window.__go('battle', { enemyTeam: [{ id: 19, level: 2 }], trainer: null, wild: true, returnTo: 'wild', onEnd: 'wild:0:19:0', myTeam: [{ id: 10 }] }));
  await fight();
  await waitScene(page, 'battle');
  await fightToEnd(page, 'evolve', 80);
  await waitScene(page, 'evolve', 10000).catch(() => {});
  check('evolve: a Pokemon at its level gets the evolve screen', (await scene(page)) === 'evolve' && (await page.locator('.evo-stage[data-step="ask"][data-id="10"]').count()) === 1);
  await fitAll(page, 'evolve (ask)', { shotName: 'b3-evolve-ask' });
  await page.locator('.evo-wait').click();
  await waitScene(page, 'wild', 10000).catch(() => {});
  let sv = await v3(page);
  check('evolve: WAIT keeps it as it is and goes back', (await scene(page)) === 'wild' && !(sv?.players?.[1]?.caught || []).includes(11) && sv?.players?.[1]?.mons?.[10]?.level === 7);
  // The question comes back: EVOLVE this time (straight through the route).
  await page.evaluate(() => window.__go('evolve', { queue: [{ id: 10, options: [{ id: 11, name: 'metapod' }] }], returnTo: 'road' }));
  await waitScene(page, 'evolve');
  await page.locator('.evo-go').click();
  await page.waitForSelector('.evo-stage[data-step="evolving"]', { timeout: 5000 });
  await fitAll(page, 'evolve (glow)', { shotName: 'b3-evolve-glow' });
  await page.waitForSelector('.evo-ok', { timeout: 10000 });
  sv = await v3(page);
  const g = sv?.players?.[1] || {};
  check('evolve: EVOLVE adds the new one and keeps the old one in caught', (g.caught || []).includes(10) && (g.caught || []).includes(11), JSON.stringify(g.caught));
  check('evolve: the new one carries the level', (g.mons?.[11]?.level | 0) >= 7);
  await page.locator('.evo-ok').click();
  await waitScene(page, 'road');
  // Art: his Caterpie levels up too, but he never meets the evolve screen.
  await page.evaluate(() => { localStorage.setItem('pokedexos_next_lastplayer', '2'); window.__go('who'); });
  await waitScene(page, 'who');
  await page.locator('.who-card.p2').click();
  await waitScene(page, 'garden');
  await startTrail(page);
  await page.evaluate(() => window.__go('battle', { enemyTeam: [{ id: 19, level: 2 }], trainer: null, wild: true, returnTo: 'garden', onEnd: null, myTeam: [{ id: 10 }] }));
  await waitScene(page, 'battle');
  await fightToEnd(page, 'garden', 80);
  await waitScene(page, 'garden', 10000).catch(() => {});
  await page.evaluate(() => window.__go('evolve', { queue: [{ id: 10, options: [{ id: 11 }] }], returnTo: 'garden' }));
  await page.waitForTimeout(600);
  const art = (await v3(page))?.players?.[2] || {};
  const t = await trail(page);
  check('evolve: a prereader never sees the evolve screen', !t.includes('evolve') && (await scene(page)) === 'garden', JSON.stringify(t));
  check('evolve: Art\'s Caterpie did level up (and did not change)', (art.mons?.[10]?.level | 0) >= 7 && !(art.caught || []).includes(11));
  await finishPage('evolve', P);
}

// ============================================================ 16. DAD'S CHALLENGE: Pro Rules + seed replay
{
  const P = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(b3Save()) });
  const { page } = P;
  const tap = async sel => { await page.waitForTimeout(300); await page.locator(sel).first().click(); };
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  const g = await page.locator('.who-gear').boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(2200);
  await page.mouse.up();
  await page.locator('.gu-challenge').click();
  await waitScene(page, 'challenge');
  check('challenge: the grown-up panel opens DAD\'S CHALLENGE', (await scene(page)) === 'challenge');
  check('challenge: never calm-gated', await page.evaluate(() => !document.body.classList.contains('calm')));
  check('challenge: only beaten leaders are open', (await page.locator('.ch-leader:not(.locked)').count()) === 1);
  await fitAll(page, 'challenge picker', { shotName: 'b3-challenge-pick' });
  await tap('.ch-leader[data-chapter="0"]');
  await page.waitForSelector('.ch-code', { timeout: 5000 });
  const code = (await page.locator('.ch-code').innerText()).trim();
  check('challenge: a seed code like MOSSY-714', /^[A-Z]{2,10}-\d{3}$/.test(code), code);
  await fitAll(page, 'challenge preview', { shotName: 'b3-challenge-preview' });

  // Play N turns with a fixed script, recording what the screen shows after each.
  async function playScript(first) {
    await page.waitForSelector('.ch[data-ready="1"] .ch-moves .bt-move:not([disabled])', { timeout: 20000 });
    const log = [];
    let status = false;
    for (let k = 0; k < 5; k++) {
      if (await page.locator('.ch-card').count()) break;
      const st = page.locator('.ch-moves .ch-move-status:not([disabled])');
      const mv = k === 0 && await st.count() ? st.first() : page.locator('.ch-moves .bt-move:not([disabled])').first();
      await page.waitForTimeout(300);   // a tap within 250ms of a new screen is ignored by design
      await mv.click();
      await page.waitForFunction(() => document.querySelector('.ch-card') || document.querySelector('.ch-moves .bt-move:not([disabled])'), null, { timeout: 20000 });
      await page.waitForTimeout(100);
      const snap = await page.evaluate(() => ({
        hp: [...document.querySelectorAll('.ch .fs-hp-fill')].map(e => e.style.width),
        mons: [...document.querySelectorAll('.ch .fs-mon')].map(e => e.textContent),
        st: [...document.querySelectorAll('.ch .ch-chip-st')].map(e => e.dataset.status),
        stage: [...document.querySelectorAll('.ch .ch-chip-stage')].map(e => e.dataset.stat + e.textContent),
        intent: (document.querySelector('.ch-intent') || {}).dataset?.intent || null,
      }));
      if (snap.st.length) status = true;
      log.push(snap);
      if (k === 0 && first) await fitAll(page, 'challenge fight', { shotName: 'b3-challenge-fight' });
    }
    return { log, status };
  }
  // v20.1.2: no default player. FIGHT waits until a grown-up picks who plays.
  check('challenge: FIGHT waits for a PLAYER pick (no default DAD)',
    await page.locator('.ch-fight').isDisabled() && (await page.locator('.ch-pre .ch-chip.on').count()) === 0);
  await tap('.ch-pre .ch-chip[data-who="dad"]');
  check('challenge: picking DAD arms FIGHT', !(await page.locator('.ch-fight').isDisabled()));
  await tap('.ch-fight');
  const a = await playScript(true);
  // Back out, then type the same code in.
  if (await page.locator('.ch-card').count()) await tap('.ch-card-back');
  else await tap('.ch-home');
  await page.waitForSelector('.ch-seed-in', { timeout: 5000 });
  await page.locator('.ch-seed-in').fill(code.toLowerCase().replace('-', ' '));
  await tap('.ch-seed-go');
  await page.waitForSelector('.ch-fight', { timeout: 5000 });
  check('challenge: a typed code opens the same code', (await page.locator('.ch-code').innerText()).trim() === code);
  await tap('.ch-fight');
  const b = await playScript(false);
  check('challenge: a status effect lands under Pro Rules', a.status, JSON.stringify(a.log[0]));
  const firstDiff = a.log.findIndex((x, k) => JSON.stringify(x) !== JSON.stringify(b.log[k]));
  check('challenge: the same seed code replays identically (' + a.log.length + ' turns)', a.log.length > 1 && a.log.length === b.log.length && firstDiff < 0,
    `turn ${firstDiff}: ${JSON.stringify(a.log[firstDiff])} vs ${JSON.stringify(b.log[firstDiff])}`);
  // Finish the fight (give up is two taps) and see the card.
  if (!(await page.locator('.ch-card').count())) {
    await tap('.ch-act-quit');
    await tap('.ch-act-quit');
  }
  await page.waitForSelector('.ch-card', { timeout: 10000 });
  await fitAll(page, 'challenge card', { shotName: 'b3-challenge-card' });
  // A won fight writes a ribbon to family.challenge; win one to check.
  await tap('.ch-card-back');
  await tap('.ch-leader[data-chapter="0"]');
  await tap('.ch-fight');
  await page.waitForSelector('.ch[data-ready="1"] .ch-moves .bt-move:not([disabled])', { timeout: 20000 });
  for (let k = 0; k < 60 && !(await page.locator('.ch-card').count()); k++) {
    const mv = page.locator('.ch-moves .bt-move:not(.ch-move-status):not([disabled])');
    if (await mv.count()) await mv.first().click().catch(() => {});
    else { const sw = page.locator('.ch-team-pick button:not([disabled])'); if (await sw.count()) await sw.first().click().catch(() => {}); }
    await page.waitForTimeout(150);
  }
  const won = (await page.locator('.ch-card[data-result="win"]').count()) === 1;
  const wins = (await v3(page))?.family?.challenge?.wins || [];
  check('challenge: a win is saved as a ribbon (family.challenge)', won && (wins.length === 1 && wins[0].who === 'dad' && /^[A-Z]{2,10}-\d{3}$/.test(wins[0].code)), JSON.stringify({ won, wins }));
  check('challenge: the Pro fight wrote no XP', JSON.stringify((await v3(page))?.players?.[1]?.mons) === JSON.stringify(b3SaveMons()));
  await tap('.ch-card-back');
  await tap('.ch-back');
  await waitScene(page, 'who');
  await finishPage('challenge', P);
}

// ============================================================ 17b. challenge: BACK in the middle of a turn
// Real pacing (no ?fast=1), so the turn is still playing when BACK is tapped.
// The old turn loop must stop: no OH NO, no ribbon for a fight never won.
{
  const P = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(b3Save()) });
  const { page } = P;
  const tap = async sel => { await page.waitForTimeout(300); await page.locator(sel).first().click(); };
  await page.goto(BASE + '?seed=1', { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  const g = await page.locator('.who-gear').boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(2200);
  await page.mouse.up();
  await page.locator('.gu-challenge').click();
  await waitScene(page, 'challenge');
  let midTurn = 0;
  for (let round = 0; round < 3; round++) {
    await tap('.ch-leader[data-chapter="0"]');
    if (await page.locator('.ch-fight').isDisabled()) await tap('.ch-pre .ch-chip[data-who="dad"]');
    await tap('.ch-fight');
    await page.waitForSelector('.ch[data-ready="1"] .ch-moves .bt-move:not([disabled])', { timeout: 20000 });
    await tap('.ch-moves .bt-move:not(.ch-move-status):not([disabled])');
    await page.waitForTimeout(320 + round * 250);
    if (await page.locator('.ch-moves .bt-move[disabled]').count()) midTurn++;
    await page.locator('.ch-home').first().click();
    await page.waitForSelector('.ch-seed-in', { timeout: 5000 });
    await page.waitForTimeout(3500);   // let the old turn's waits run out
  }
  check('challenge: BACK was tapped while a turn was playing', midTurn > 0, String(midTurn));
  check('challenge: BACK mid-turn never ends on OH NO', !(await page.locator('.oops-card').count()) && (await scene(page)) === 'challenge');
  check('challenge: BACK mid-turn writes no ribbon', ((await v3(page))?.family?.challenge?.wins || []).length === 0);
  await finishPage('challenge back mid-turn', P);
}
function b3SaveMons() {
  // What cleanMons makes of b3Save().players[1].mons (keys as strings, same order)
  return JSON.parse(JSON.stringify(b3Save().players[1].mons));
}

// ============================================================ 17. Art's Sticker Book
{
  const P = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(b3Save()) });
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  await page.locator('.who-card.p2').click();
  await waitScene(page, 'garden');
  check('garden: has a book button', (await page.locator('.gd-book').count()) === 1);
  await fitAll(page, 'garden (book button)', { words: true, shotName: 'b3-garden' });
  const before = await page.evaluate(() => localStorage.getItem('pokedexos_save_v3'));
  await tapCenter(page, '.gd-book');
  await waitScene(page, 'book');
  check('book: calm-gated like the garden', await page.evaluate(() => document.body.classList.contains('calm')));
  await fitAll(page, 'book cover', { words: true, shotName: 'b3-book-cover' });
  const pages = Number(await page.locator('.bk').getAttribute('data-pages'));
  // Swipe left once: page 2.
  const vb = await page.locator('.bk-view').boundingBox();
  await page.mouse.move(vb.x + vb.width * 0.8, vb.y + vb.height / 2);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(vb.x + vb.width * 0.8 - k * 25, vb.y + vb.height / 2);
  await page.mouse.up();
  await page.waitForTimeout(300);
  check('book: a swipe turns the page', (await page.locator('.bk').getAttribute('data-page')) === '1');
  await fitAll(page, 'book page', { words: true, shotName: 'b3-book-page' });
  for (let k = 1; k < pages; k++) { await page.locator('.bk-next').click(); await page.waitForTimeout(80); }
  const stickers = await page.locator('.bk-page[data-kind="habitat"] .bk-sticker').count();
  const caught = new Set(b3Save().players[2].caught).size;
  check('book: one sticker per caught Pokemon', stickers === caught, `${stickers} vs ${caught}`);
  if ((await page.locator('.bk').getAttribute('data-kind')) === 'post') await fitAll(page, 'book postcards', { words: true, shotName: 'b3-book-post' });
  const words = await visibleWords(page, NAMES_OK);
  check('book: no words anywhere in the book', words.length === 0, words.slice(0, 4).join(' | '));
  await page.locator('.bk-back').click();
  await waitScene(page, 'garden');
  check('book: never writes the save', (await page.evaluate(() => localStorage.getItem('pokedexos_save_v3'))) === before);
  await finishPage('book', P);
}

// ============================================================ 18. versus menu -> challenge -> back
{
  const P = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(b3Save()) });
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  await page.evaluate(() => window.__go('versus', { battler: 1 }));
  await waitScene(page, 'versus');
  await page.waitForSelector('.vs-challenge', { timeout: 5000 });
  await fitAll(page, 'versus setup (challenge button)', { shotName: 'b3-versus-setup' });
  await page.locator('.vs-challenge').click();
  await waitScene(page, 'challenge');
  await page.waitForTimeout(300);
  await page.locator('.ch-back').click();
  await waitScene(page, 'versus');
  check('versus: DAD\'S CHALLENGE and back', (await scene(page)) === 'versus');
  await finishPage('versus -> challenge', P);
}

// ============================================================ v20.1.1: the gear on a real touch screen
// On the iPad the grown-up panel opened under the finger, and LIFTING that
// finger landed a click on the backdrop, which closed it instantly. Mouse
// tests could never see it. This drives real touch events through CDP, with
// the small wobble a real thumb makes.
{
  const context = await browser.newContext({ viewport: { width: 834, height: 1194 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  await mockRoutes(context);
  const page = await context.newPage();
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  const cdp = await context.newCDPSession(page);
  const g = await page.locator('.who-gear').boundingBox();
  const pt = { x: g.x + g.width / 2, y: g.y + g.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
  await page.waitForTimeout(120);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
  check('gear (touch): a quick tap shows the HOLD hint and no panel',
    await page.locator('.who-gear-hint').isVisible() && (await page.locator('.gu-panel').count()) === 0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(250);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pt.x + (i % 2 ? 3 : -3), y: pt.y + 2 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(500);
  check('gear (touch): the panel stays open after the finger lifts', (await page.locator('.gu-panel').count()) === 1);
  await context.close();
}

// ============================================================ batch 4 helpers
// A Gabe who has beaten the Champion: every Road chapter cleared and bloomed.
const ALL12 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const champSave = ({ level = 100, road = {}, gabe = {}, art = {} } = {}) => ({ version: 3, created: '2026-09-01', players: {
  1: { name: 'GABE', profile: 'reader', caught: [1, 6, 25, 133], team: [6, 25, 133],
    mons: { 6: { level, xp: 0 }, 25: { level, xp: 0 }, 133: { level, xp: 0 } }, items: { masterBalls: 3 },
    ...gabe,
    road: { chapter: 11, cleared: clearedThrough(12), bloomed: ALL12.slice(), hatched: true, seeds: 0, ...road } },
  2: { name: 'ART', profile: 'prereader', caught: [1], bulba: { petals: 3, stage: 1, stayStone: false, visitors: [] }, ...art },
} });
// Fight until we leave the battle, noting whether the ROUND 2 gimmick badge ever lit up.
// onWinCard(page) runs once, on the result card, before its ▶ is tapped.
async function fightWatching(page, maxTurns = 120, { ball = null, onWinCard = null } = {}) {
  await page.waitForSelector('.bt[data-ready="1"]', { timeout: 10000 });
  let badge = false, threw = false;
  for (let i = 0; i < maxTurns; i++) {
    if ((await scene(page)) !== 'battle') break;
    badge = badge || (await page.locator('.bt-r2-badge.on').count()) > 0;
    const ok = page.locator('.bt-ok:visible');
    if (await ok.count()) {
      if (onWinCard) { const f = onWinCard; onWinCard = null; await f(page); }
      await ok.first().click({ force: true }).catch(() => {}); await page.waitForTimeout(120); continue;
    }
    if (ball && !threw && (await page.locator('.bt-act-ball:not([disabled])').count())) {
      await page.locator('.bt-act-ball').click({ force: true }).catch(() => {});
      await page.waitForTimeout(150);
      if (await page.locator(`.bt-ballbtn.ball-${ball}:visible`).count()) {
        await page.locator(`.bt-ballbtn.ball-${ball}`).click({ force: true }).catch(() => {});
        threw = true;
      }
      await page.waitForTimeout(150);
      continue;
    }
    // v20.1.2: after a faint Gabe picks who comes in (the team drawer).
    const pick = page.locator('.bt-drawer:not([hidden]) .bt-slot:not([disabled])');
    if (await pick.count() && !(await page.locator('.bt-moves button:not([disabled])').count())) { await pick.first().click({ force: true }).catch(() => {}); await page.waitForTimeout(120); continue; }
    const mv = page.locator('.bt-moves button:not([disabled]):visible');
    if (await mv.count()) await mv.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(120);
  }
  return { badge, threw };
}
const PRE_CHAMP = () => {   // everything up to (not including) the Champion's leader
  const c = clearedThrough(11, ['c11-t0', 'c11-t1', 'c11-t2', 'c11-t3']);
  return { cleared: c, bloomed: ALL12.slice(0, 11), chapter: 11 };
};

// ============================================================ 19. ROUND 2
{
  // Before the Champion: no toggle, no signpost, no door.
  const P0 = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(champSave({ road: PRE_CHAMP() })) });
  await P0.page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(P0.page, 'who');
  await P0.page.locator('.who-card.p1').click();
  await waitScene(P0.page, 'road');
  await P0.page.waitForTimeout(600);
  check('round2: no toggle before the Champion', (await P0.page.locator('.r2-toggle').count()) === 0);
  check('wildch: no signpost before the Champion', (await P0.page.locator('.wildch-sign').count()) === 0);
  check('roots: no door before the Champion', (await P0.page.locator('.road-roots-door').count()) === 0);
  await finishPage('post-champion (before)', P0);

  const save = champSave({ level: 100, road: { cleared: clearedThrough(12, ['r2-c0-t0', 'r2-c0-t1', 'r2-c0-t2', 'r2-c0-t3']) } });
  const P = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(save) });
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  await page.locator('.who-card.p1').click();
  await waitScene(page, 'road');
  await page.waitForSelector('.wildch-sign', { timeout: 5000 }).catch(() => {});
  check('round2: toggle appears after the Champion', await page.locator('.r2-toggle').isVisible());
  check('post-champion: the roots door, the WILD signpost and the toggle all show',
    (await page.locator('.road-roots-door').count()) === 1 && (await page.locator('.wildch-sign').count()) === 1);
  // The three post-Champion things never sit on top of each other.
  const overlaps = await page.evaluate(() => {
    const els = ['.road-roots-door', '.wildch-sign', '.r2-toggle', '.road-next'].map(s => [s, document.querySelector(s)]).filter(([, e]) => e);
    const out = [];
    for (let a = 0; a < els.length; a++) for (let b = a + 1; b < els.length; b++) {
      const r1 = els[a][1].getBoundingClientRect(), r2 = els[b][1].getBoundingClientRect();
      if (r1.left < r2.right - 2 && r2.left < r1.right - 2 && r1.top < r2.bottom - 2 && r2.top < r1.bottom - 2) out.push(els[a][0] + ' x ' + els[b][0]);
    }
    return out;
  });
  check('post-champion: door, signpost and toggle never overlap', overlaps.length === 0, overlaps.join(', '));
  await fitAll(page, 'post-champion road', { shotName: 'b4-road-postgame' });
  await page.locator('.r2-toggle').click();
  await page.waitForTimeout(250);
  check('round2: toggle turns Round 2 on', (await page.evaluate(() => window.__round2().on)) === true);
  await fitAll(page, 'round2 road', { shotName: 'b4-road-r2' });
  await page.locator('.road-node[data-chapter="0"]').click({ force: true });
  await page.waitForSelector('.r2-chapter:not([hidden])', { timeout: 5000 });
  check('round2: the leader card shows its gimmick', (await page.locator('.r2-card.is-leader .r2-gimmick').count()) === 1);
  check('round2: the leader card shows the shiny prize', (await page.locator('.r2-card.is-leader .r2-prize').count()) === 1);
  await fitAll(page, 'round2 chapter', { shotName: 'b4-r2-chapter' });
  await page.locator('.r2-card.is-leader').click();
  await waitScene(page, 'battle', 10000);
  const fought = await fightWatching(page);
  await waitScene(page, 'road', 10000).catch(() => {});
  check('round2: the leader\'s gimmick shows in the fight', fought.badge);
  await page.waitForSelector('.r2-shiny', { timeout: 10000 }).catch(() => {});
  check('round2: a leader win brings the shiny ace home', await page.locator('.r2-shiny').isVisible());
  await fitAll(page, 'round2 shiny card', { shotName: 'b4-r2-shiny' });
  const s1 = (await v3(page))?.players?.[1] || {};
  check('round2: the win is saved', s1.road?.cleared?.['r2-c0-t4'] === true && (s1.road?.r2bloomed || []).includes(0), JSON.stringify(s1.road?.r2bloomed));
  check('round2: the ace is caught AND shiny', (s1.caught || []).includes(76) && (s1.shinies || []).includes(76));
  await page.locator('.r2-shiny-ok').click();
  await page.waitForTimeout(300);
  check('round2: Round 2 stays on after the fight', (await page.evaluate(() => window.__round2().on)) === true);
  await finishPage('round2', P);
}

// ============================================================ 20. THROUGH THE ROOTS
{
  const save = champSave({ level: 100 });
  const P = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(save) });
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  await page.locator('.who-card.p1').click();
  await waitScene(page, 'road');
  await page.waitForSelector('.road-roots-door', { timeout: 5000 });
  await page.locator('.road-roots-door').click({ force: true });
  await waitScene(page, 'roots');
  check('roots: the Tree\'s door opens the roots scene', (await scene(page)) === 'roots');
  check('roots: stepping in opens the door for good', (await v3(page))?.players?.[1]?.road?.roots?.opened === true);
  await fitAll(page, 'roots tunnel', { shotName: 'b4-roots-tunnel' });
  await page.locator('.rt-light').click();
  await page.waitForSelector('.rt-grid', { timeout: 5000 });
  check('roots: 8 shrines under the Tree', (await page.locator('.rt-shrine').count()) === 8);
  await fitAll(page, 'roots grid', { shotName: 'b4-roots-grid' });
  await page.locator('.rt-shrine[data-shrine="sky"]').click();
  await page.waitForSelector('.rt-ped[data-legend="articuno"]', { timeout: 5000 });
  await fitAll(page, 'roots shrine', { shotName: 'b4-roots-shrine' });
  await page.locator('.rt-ped[data-legend="articuno"]').click();
  await waitScene(page, 'battle', 10000);
  let onCard = null;
  const f = await fightWatching(page, 60, { ball: 'master', onWinCard: async pg => { onCard = (await v3(pg))?.players?.[1]?.road?.roots?.sanctums || null; } });
  check('roots: the sanctum is saved already on the result card (app may close there)', !!onCard && onCard.articuno === true, JSON.stringify(onCard));
  check('roots: a ball is thrown at the legendary', f.threw);
  await waitScene(page, 'roots', 10000).catch(() => {});
  check('roots: back under the Tree after the sanctum battle', (await scene(page)) === 'roots');
  const r1 = (await v3(page))?.players?.[1] || {};
  check('roots: the catch marks the sanctum', r1.road?.roots?.sanctums?.articuno === true && (r1.caught || []).includes(144), JSON.stringify(r1.road?.roots));
  await page.waitForTimeout(600);
  await fitAll(page, 'roots after catch', { shotName: 'b4-roots-after' });
  await finishPage('roots (catch)', P);

  // A loss changes nothing: the legendary just waits.
  const weak = champSave({ level: 2, road: { roots: { opened: true, sanctums: {} } } });
  const Q2 = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(weak) });
  await Q2.page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(Q2.page, 'who');
  await Q2.page.locator('.who-card.p1').click();
  await waitScene(Q2.page, 'road');
  await Q2.page.evaluate(() => window.__go('roots', { view: 'sanctums' }));
  await waitScene(Q2.page, 'roots');
  await Q2.page.waitForSelector('.rt-grid', { timeout: 5000 });
  await Q2.page.locator('.rt-shrine[data-shrine="sky"]').click();
  await Q2.page.locator('.rt-ped[data-legend="zapdos"]').click();
  await waitScene(Q2.page, 'battle', 10000);
  const before = (await v3(Q2.page))?.players?.[1]?.road?.roots;
  await fightWatching(Q2.page, 80);
  await waitScene(Q2.page, 'roots', 10000).catch(() => {});
  const after = (await v3(Q2.page))?.players?.[1] || {};
  check('roots: after a loss, back under the Tree', (await scene(Q2.page)) === 'roots');
  check('roots: a loss changes nothing (the sanctum waits)', JSON.stringify(after.road?.roots) === JSON.stringify(before) && !after.road?.roots?.sanctums?.zapdos, JSON.stringify(after.road?.roots));
  check('roots: after a loss the legendary can be fought again', (await Q2.page.locator('.rt-ped[data-legend="zapdos"].is-waiting').count()) === 1);
  await finishPage('roots (loss)', Q2);
}

// ============================================================ 21. WILD CHAPTERS
{
  // Leader of Wild Chapter 1 is up next.
  // v20.1.2: postgame foes rise toward his team's level, so he brings a full team.
  const six = [6, 25, 133, 1, 4, 7];
  const save = champSave({ level: 100, road: { cleared: clearedThrough(12, ['w0-t0', 'w0-t1', 'w0-t2', 'w0-t3']) },
    gabe: { caught: six, team: six, mons: Object.fromEntries(six.map(id => [id, { level: 100, xp: 0 }])) } });
  const P = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(save) });
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  await page.locator('.who-card.p1').click();
  await waitScene(page, 'road');
  await page.waitForSelector('.wildch-sign', { timeout: 5000 });
  const w0 = await page.evaluate(() => window.__wildch());
  check('wildch: chapter 1 is open after the Champion', w0.views[0] === 'current', JSON.stringify(w0.views));
  check('wildch: chapter 2 waits for chapter 1\'s leader', w0.views[1] !== 'current' && w0.views[1] !== 'done');
  // The validator skips a bad chapter and keeps the good one, without throwing.
  const vr = await page.evaluate(async () => {
    const V = await import('./data/validate-chapter.js');
    const W = await import('./data/wild-chapters.js');
    const warns = [];
    let out = null, threw = false;
    try { out = V.loadChapters([{ idx: 'x', trainers: 'nope' }, null, 42, W.WILD_AUTHORED[0]], m => warns.push(m)); } catch (e) { threw = true; }
    return { threw, n: out ? out.length : -1, warns: warns.length, key: out && out[0] && out[0].key };
  });
  check('wildch: a bad chapter object is skipped without crashing', !vr.threw && vr.n === 1 && vr.warns === 3, JSON.stringify(vr));
  const kept = await page.evaluate(async () => {
    const E = await import('./scenes/evolve.js');
    const back = [
      { result: 'win', onEnd: 'round2:0:4', roundTwo: { bloom: true, shiny: true } },
      { result: 'win', onEnd: 'wild:0:4', wildWon: { idx: 0, j: 4, bloom: true } },
      { result: 'caught', onEnd: 'sanctum:articuno', sanctumWon: { key: 'articuno', fresh: true, finale: false } },
    ];
    return back.map(b => JSON.stringify(E.cleanReturnParams(b)) === JSON.stringify(b));
  });
  check('evolve: cleanReturnParams keeps the round2:, wild: and sanctum: results', kept.every(Boolean), JSON.stringify(kept));
  await page.locator('.wildch-sign').click({ force: true });
  await page.waitForSelector('.wildch-path', { timeout: 5000 });
  await fitAll(page, 'wild chapters path', { shotName: 'b4-wild-path' });
  await page.locator('.wildch-node[data-wild="0"]').click({ force: true });
  await page.waitForSelector('[data-wild-trainer="4"]', { timeout: 5000 });
  await fitAll(page, 'wild chapter', { shotName: 'b4-wild-chapter' });
  await page.locator('[data-wild-trainer="4"]').click({ force: true });
  await waitScene(page, 'battle', 10000);
  let onCard = null;
  await fightWatching(page, 120, { onWinCard: async pg => { onCard = (await v3(pg))?.players?.[1]?.road || null; } });
  check('wildch: the win is saved already on the result card (app may close there)', !!onCard && onCard.cleared?.['w0-t4'] === true && (onCard.wildBloomed || []).includes(0));
  await waitScene(page, 'road', 10000).catch(() => {});
  const s = (await v3(page))?.players?.[1] || {};
  check('wildch: the leader win is saved', s.road?.cleared?.['w0-t4'] === true && (s.road?.wildBloomed || []).includes(0), JSON.stringify(s.road?.wildBloomed));
  await page.waitForFunction(() => window.__wildch && window.__wildch().blooming < 0, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300);
  const w1 = await page.evaluate(() => window.__wildch());
  check('wildch: chapter 2 opens after chapter 1\'s leader', w1.views[0] === 'done' && w1.views[1] === 'current', JSON.stringify(w1.views));
  await fitAll(page, 'wild path after bloom', { shotName: 'b4-wild-bloomed' });
  await finishPage('wild chapters', P);
}

// ============================================================ 22. GARDEN: gifts, decorations, accessories
{
  const save = champSave({ art: { bulba: { petals: 9, stage: 1, stayStone: false, visitors: [] } } });
  const P = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(save), pokedexos_next_lastplayer: '2' });
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  await page.locator('.who-card.p2').click();
  await waitScene(page, 'garden');
  await page.waitForTimeout(400);
  check('garden: no gift box below 10 petals', (await page.locator('.gd-gbox').count()) === 0);
  check('garden: no decor button below 10 petals', !(await page.locator('.gd-dbtn').isVisible()));
  const field = await page.locator('.gd-field').boundingBox();
  const petals = () => page.evaluate(() => Number(document.querySelector('.gd').dataset.petals));
  async function tapGround(target) {
    for (let t = 0; t < 60 && (await petals()) < target; t++) {
      const px = field.x + field.width * (0.1 + (t % 5) * 0.2), py = field.y + field.height * (0.35 + (Math.floor(t / 5) % 4) * 0.12);
      const onGround = await page.evaluate(([x, y]) => /gd-(field|grass|plots)/.test(document.elementFromPoint(x, y)?.className || ''), [px, py]);
      if (!onGround) continue;
      await page.mouse.click(px, py);
      await page.waitForTimeout(80);
    }
  }
  // A spot of bare ground (Bulba and his visitors wander about).
  async function bareSpot(cands) {
    for (const [fx, fy] of cands) {
      const px = field.x + field.width * fx, py = field.y + field.height * fy;
      if (await page.evaluate(([x, y]) => /gd-(field|grass|plots)/.test(document.elementFromPoint(x, y)?.className || ''), [px, py])) return { px, py };
    }
    return { px: field.x + field.width * cands[0][0], py: field.y + field.height * cands[0][1] };
  }
  const LEFT = [[0.3, 0.55], [0.2, 0.6], [0.35, 0.45], [0.25, 0.7], [0.15, 0.5], [0.4, 0.62]];
  const RIGHT = [[0.7, 0.7], [0.75, 0.6], [0.65, 0.78], [0.8, 0.5], [0.6, 0.65]];
  await tapGround(10);
  await page.waitForSelector('.gd-gbox', { timeout: 8000 }).catch(() => {});
  check('garden: a gift box drops at 10 petals', (await page.locator('.gd-gbox').count()) === 1, 'petals ' + (await petals()));
  await page.waitForTimeout(900);
  await fitAll(page, 'garden gift box', { words: true, shotName: 'b4-garden-gift' });
  await page.locator('.gd-gbox').dispatchEvent('pointerdown');
  await page.waitForTimeout(2500);
  check('garden: opening the box shows the decor button', await page.locator('.gd-dbtn').isVisible());
  await page.locator('.gd-dbtn').click();
  await page.waitForTimeout(500);
  await fitAll(page, 'garden decor drawer', { words: true, shotName: 'b4-garden-drawer' });
  await page.locator('.gd-dopt.dec').first().click();
  await page.waitForTimeout(300);
  const spot1 = await bareSpot(LEFT);
  await page.mouse.click(spot1.px, spot1.py);
  await page.waitForTimeout(600);
  const d1 = (await v3(page))?.players?.[2]?.garden?.decor || [];
  check('garden: the drawer places a decoration', d1.length === 1 && (await page.locator('.gd-dc').count()) === 1, JSON.stringify(d1));
  await page.reload({ waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  await page.locator('.who-card.p2').click();
  await waitScene(page, 'garden');
  await page.waitForTimeout(400);
  check('garden: the decoration is still there after a reload', (await page.locator('.gd-dc').count()) === 1);
  // Move it (drag), then drag it off the edge: it snaps back and is never removed.
  const dc = await page.locator('.gd-dc').first().boundingBox();
  const drag = async (x, y) => {
    await page.mouse.move(dc.x + dc.width / 2, dc.y + dc.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);
  };
  const spot2 = await bareSpot(RIGHT);
  await drag(spot2.px, spot2.py);
  const d2 = (await v3(page))?.players?.[2]?.garden?.decor || [];
  check('garden: a decoration can be moved', d2.length === 1 && Math.abs(d2[0].x - d1[0].x) > 0.1, JSON.stringify(d2));
  const dc2 = await page.locator('.gd-dc').first().boundingBox();
  await page.mouse.move(dc2.x + dc2.width / 2, dc2.y + dc2.height / 2);
  await page.mouse.down();
  await page.mouse.move(-40, field.y + 20, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const d3 = (await v3(page))?.players?.[2]?.garden?.decor || [];
  check('garden: a decoration is never removed (dragged off the edge)', d3.length === 1 && (await page.locator('.gd-dc').count()) === 1, JSON.stringify(d3));
  // Two fingers (regression): select it, hold it with one finger, tap the grass
  // with another, lift the first finger over the grass. The drag must end, so
  // the decoration can still be dragged afterwards.
  {
    const far = await bareSpot(LEFT);
    await page.evaluate(([fx, fy]) => {
      const dc = document.querySelector('.gd-dc'), fieldEl = document.querySelector('.gd-field');
      const r = dc.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const fire = (el, type, pointerId, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId, clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: pointerId === 7 }));
      fire(dc, 'pointerdown', 7, cx, cy); fire(dc, 'pointerup', 7, cx, cy);           // tap: selected
      fire(dc, 'pointerdown', 9, cx, cy);                                               // finger 1 holds it
      fire(fieldEl, 'pointerdown', 10, fx, fy); fire(fieldEl, 'pointerup', 10, fx, fy); // finger 2 taps the grass
      fire(document.body, 'pointerup', 9, fx, fy);                                      // finger 1 lifts over the grass
    }, [far.px, far.py]);
    await page.waitForTimeout(500);
    const before = (await v3(page))?.players?.[2]?.garden?.decor || [];
    const b = await page.locator('.gd-dc').first().boundingBox();
    const to = await bareSpot(before[0] && before[0].x > 0.5 ? LEFT : RIGHT);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.px, to.py, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    const after = (await v3(page))?.players?.[2]?.garden?.decor || [];
    check('garden: a two-finger hold never leaves decorations stuck', after.length === 1 && before.length === 1 && Math.abs(after[0].x - before[0].x) > 0.1, JSON.stringify([before, after]));
  }
  // Bulba's things arrive at 25 petals.
  await tapGround(25);
  for (let k = 0; k < 4; k++) {
    await page.waitForSelector('.gd-gbox', { timeout: 4000 }).catch(() => {});
    if (!(await page.locator('.gd-gbox').count())) break;
    await page.waitForTimeout(900);
    await page.locator('.gd-gbox').dispatchEvent('pointerdown');
    await page.waitForTimeout(2500);
  }
  await page.locator('.gd-dbtn').click();
  await page.waitForTimeout(500);
  check('garden: an accessory is in the drawer at 25 petals', (await page.locator('.gd-dopt.acc').count()) >= 1, 'petals ' + (await petals()));
  await page.locator('.gd-dopt.acc').first().click();
  await page.waitForTimeout(600);
  const acc = (await v3(page))?.players?.[2]?.bulba?.accessory;
  check('garden: Bulba wears an accessory (saved)', typeof acc === 'string' && acc.length > 0, String(acc));
  check('garden: the accessory shows on Bulba', /slot-/.test(await page.locator('.gd-acc').getAttribute('class') || ''));
  await page.mouse.click(field.x + field.width * 0.5, field.y + field.height * 0.3);
  await page.waitForTimeout(400);
  await fitAll(page, 'garden with decor', { words: true, shotName: 'b4-garden-decor' });
  await finishPage('garden decor', P);
}

// ============================================================ v20.1.2 fixer regressions
// A touch page (CDP touch works only with hasTouch) with a seeded save.
async function touchPage(viewport, seed = {}) {
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  await mockRoutes(context);
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push('pageerror: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') page.errors.push(msg.text()); });
  await page.addInitScript(seedData => {
    if (!sessionStorage.getItem('__seeded')) {
      sessionStorage.setItem('__seeded', '1');
      for (const [k, v] of Object.entries(seedData)) localStorage.setItem(k, v);
    }
  }, seed);
  const cdp = await context.newCDPSession(page);
  const touch = async (pt, ms, wobble = 0) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
    const steps = Math.max(1, Math.round(ms / 200));
    for (let i = 0; i < steps; i++) {
      await page.waitForTimeout(ms / steps);
      if (wobble) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pt.x + (i % 2 ? wobble : -wobble), y: pt.y + 1 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  return { context, page, cdp, touch };
}

// ---- the Everstone: a tap never switches it on; a hold does; a tap switches it off
{
  const save = champSave({ art: { bulba: { petals: 52, stage: 1, stayStone: false, visitors: [] } } });
  const T = await touchPage({ width: 834, height: 1194 }, { pokedexos_save_v3: JSON.stringify(save), pokedexos_next_lastplayer: '2' });
  const { page, touch } = T;
  await page.goto(BASE + '?seed=1', { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  await page.locator('.who-card.p2').click();
  await waitScene(page, 'garden');
  await page.waitForTimeout(1600);                       // Bulba runs up to say hello
  const stonePt = async () => {
    const b = await page.locator('.gd-stone').boundingBox();
    const pt = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const onStone = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.gd-stone'), [pt.x, pt.y]);
    return { pt, onStone };
  };
  const stay = async () => (await v3(page))?.players?.[2]?.bulba?.stayStone;
  check('everstone: the bud glows at 52 petals', await page.locator('.gd-bud').isVisible());
  let s0 = await stonePt();
  check('everstone: the stone is reachable (nothing on top)', s0.onStone);
  await touch(s0.pt, 120);
  await page.waitForTimeout(600);
  check('everstone (touch): a quick tap does NOT switch it on', (await stay()) === false && await page.locator('.gd-bud').isVisible(), String(await stay()));
  s0 = await stonePt();
  await touch(s0.pt, 1900, 2);
  await page.waitForTimeout(600);
  check('everstone (touch): a 1.5s hold switches it on (saved, bud hides)', (await stay()) === true && !(await page.locator('.gd-bud').isVisible()), String(await stay()));
  s0 = await stonePt();
  await touch(s0.pt, 120);
  await page.waitForTimeout(800);
  check('everstone (touch): one tap switches it off and the bud comes straight back',
    (await stay()) === false && await page.locator('.gd-bud').isVisible(), String(await stay()));
  check('everstone: no console errors', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  await T.context.close();
}

// ---- the gear: a finger that drifts off the small button during the hold still opens it
{
  const T = await touchPage({ width: 375, height: 667 });
  const { page, cdp } = T;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  const g = await page.locator('.who-gear').boundingBox();
  const pt = { x: g.x + g.width / 2, y: g.y + g.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
  for (let i = 0; i < 9; i++) {
    await page.waitForTimeout(260);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pt.x - 30, y: pt.y + 30 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(500);
  check('gear (touch): a hold that drifts 30px off the gear still opens the panel', (await page.locator('.gu-panel').count()) === 1);
  await T.context.close();
}

// ---- GROWN-UPS: SAVE CODE, LOAD CODE (two taps), UNDO LOAD
{
  const P = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(champSave()) });
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  const g = await page.locator('.who-gear').boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down(); await page.waitForTimeout(2300); await page.mouse.up();
  await page.waitForSelector('.gu-panel', { timeout: 3000 });
  await page.locator('.gu-save').click();
  const code = await page.locator('.gu-code').inputValue();
  check('save code: the panel shows a real save code', /^SR3\./.test(code), code.slice(0, 12));
  await fitAll(page, 'grown-ups save code', { shotName: 'fix-save-code' });
  // change the live save, then bring the code back
  await page.locator('.gu-lock-back').click();
  await page.locator('.gu-profile[data-player="2"]').click();
  check('save code: (setup) ART flipped to READER', (await v3(page))?.players?.[2]?.profile === 'reader');
  await page.locator('.gu-save').click();
  await page.locator('.gu-load').click();
  await page.locator('.gu-code-in').fill('NOT A CODE');
  await page.locator('.gu-load-go').click();
  await page.locator('.gu-load-go').click();
  check('load code: a bad code says so and changes nothing',
    /NOT RIGHT/.test(await page.locator('.gu-save-note').innerText()) && (await v3(page))?.players?.[2]?.profile === 'reader');
  await page.locator('.gu-code-in').fill(code);
  await page.locator('.gu-load-go').click();
  check('load code: the first tap only asks', (await v3(page))?.players?.[2]?.profile === 'reader');
  await page.locator('.gu-load-go').click();
  await page.waitForTimeout(200);
  check('load code: the second tap loads it (ART is LITTLE ONE again)', (await v3(page))?.players?.[2]?.profile === 'prereader');
  check('load code: the cards follow the loaded save', (await page.locator('.who-card.p2.who-pre').count()) === 1);
  await page.locator('.gu-undo-load').click();
  await page.waitForTimeout(200);
  check('undo load: puts the save from before the load back', (await v3(page))?.players?.[2]?.profile === 'reader');
  check('undo load: Gabe\'s collection is intact throughout', ((await v3(page))?.players?.[1]?.caught || []).length === 4);
  await finishPage('grown-ups save code', P);
}

// ---- the times-table check shakes on a wrong answer
{
  const save = champSave({ gabe: { lock: { pics: [6, 25, 133] } } });
  const P = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(save) });
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  const g = await page.locator('.who-gear').boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down(); await page.waitForTimeout(2300); await page.mouse.up();
  await page.waitForSelector('.gu-panel', { timeout: 3000 });
  await page.locator('.gu-profile[data-player="1"]').click();
  const { a, b } = await page.locator('.gu-check-q').evaluate(el => ({ a: +el.dataset.a, b: +el.dataset.b }));
  const right = String(a * b);
  const wrong = right.slice(0, -1) + String((Number(right.slice(-1)) + 1) % 10);
  for (const d of wrong) await page.locator(`.gu-check-key[data-key="${d}"]`).click();
  check('grown-up check: a wrong answer shakes', (await page.locator('.gu-check-q.shake').count()) === 1);
  await finishPage('grown-up check shake', P);
}

// ---- NAME ME: OK with nothing typed never cuts a classic 12-letter name
{
  const save = champSave({ gabe: { nicks: { 25: "MISTER ZAP'S" } } });
  const P = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(save), pokedexos_next_lastplayer: '1' });
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  await page.locator('.who-card.p1').click();
  await waitScene(page, 'road');
  await page.evaluate(() => window.__go('dex', { returnTo: 'road' }));
  await waitScene(page, 'dex');
  await page.locator('.dex-cell[data-id="25"]').click();
  await page.waitForSelector('.dex-nameme', { timeout: 5000 });
  await page.locator('.dex-nameme').click();
  await page.locator('.dex-kp-ok').click();
  await page.waitForTimeout(200);
  check('NAME ME: OK with no typing keeps "MISTER ZAP\'S" whole', (await v3(page))?.players?.[1]?.nicks?.[25] === "MISTER ZAP'S", JSON.stringify((await v3(page))?.players?.[1]?.nicks));
  await page.locator('.dex-close').click().catch(() => {});
  await finishPage('NAME ME keeps a classic name', P);
}

// ---- battle: Master Ball not lost mid-throw; shiny sparkle; card ball; stars; choose after faint; legendary hold; postgame lift
{
  const save = champSave({ gabe: { items: { masterBalls: 5 } } });
  const P = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(save), pokedexos_next_lastplayer: '1' });
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  await page.locator('.who-card.p1').click();
  await waitScene(page, 'road');
  const wildFight = extra => page.evaluate(x => window.__go('battle', { enemyTeam: [{ id: 19, level: 5 }], trainer: null, wild: true, returnTo: 'road', onEnd: null, ...x }), extra);
  await wildFight({});
  await page.waitForSelector('.bt[data-ready="1"] .bt-act-ball:not([disabled])', { timeout: 10000 });
  await page.evaluate(async () => { const m = await import('/next/core/pace.js'); m.PACE.fast = false; });
  await page.locator('.bt-act-ball').click();
  await page.locator('.bt-ballbtn.ball-master').click();
  await page.waitForTimeout(300);
  check('master ball: not taken while the ball is still in the air', (await v3(page))?.players?.[1]?.items?.masterBalls === 5);
  await page.reload({ waitUntil: 'networkidle' });
  const after = (await v3(page))?.players?.[1];
  check('master ball: closing the app mid-throw keeps the ball (5 balls, no half catch)',
    after?.items?.masterBalls === 5 && !after?.caught?.includes(19), JSON.stringify({ m: after?.items, c: after?.caught }));
  await waitScene(page, 'who');
  await page.locator('.who-card.p1').click();
  await waitScene(page, 'road');
  await wildFight({ shiny: true });
  await page.waitForSelector('.bt[data-ready="1"] .bt-act-ball:not([disabled])', { timeout: 10000 });
  check('shiny: the wild shiny sparkles in the fight', (await page.locator('.bt-sprite-foe.is-shiny').count()) === 1 && (await page.locator('.bt-spot-foe .bt-shiny').count()) === 1);
  await page.locator('.bt-act-ball').click();
  await page.locator('.bt-ballbtn.ball-master').click();
  await page.waitForSelector('.bt-card-hero.caught', { timeout: 10000 });
  check('catch card: shows the Master Ball that caught it', /master-ball/.test(await page.locator('.bt-card-ball').getAttribute('src') || ''));
  check('catch card: a shiny catch wears a ✨ badge', (await page.locator('.bt-card-hero.is-shiny .bt-card-shiny').count()) === 1);
  check('catch card: a win with nobody fainted is 3 stars', (await page.locator('.bt-star').count()) === 3);
  const caughtNow = (await v3(page))?.players?.[1];
  check('master ball: taken in the same save as the catch', caughtNow?.items?.masterBalls === 4 && caughtNow?.caught?.includes(19), JSON.stringify(caughtNow?.items));
  await page.locator('.bt-ok').click({ force: true });
  await waitScene(page, 'road');

  // choose after a faint: a weak team against a strong foe
  await page.evaluate(() => window.__go('battle', { enemyTeam: [{ id: 6, level: 100 }], trainer: { name: 'ACE', leader: false }, wild: false, returnTo: 'road', onEnd: null,
    myTeam: [{ id: 25, level: 2 }, { id: 133, level: 2 }, { id: 6, level: 2 }] }));
  await page.waitForSelector('.bt[data-ready="1"] .bt-moves button:not([disabled])', { timeout: 10000 });
  let chose = false;
  for (let i = 0; i < 12 && !chose; i++) {
    if (await page.locator('.bt-drawer:not([hidden]) .bt-slot:not([disabled])').count()) { chose = true; break; }
    const mv = page.locator('.bt-moves button:not([disabled])');
    if (await mv.count()) await mv.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(250);
  }
  check('faint: the team picker opens for Gabe to choose who comes in', chose);
  check('faint: moves wait while he chooses', (await page.locator('.bt-moves button:not([disabled])').count()) === 0);
  await page.locator('.bt-drawer .bt-slot:not([disabled])').last().click();
  await page.waitForTimeout(600);
  const meSrc = await page.locator('.bt-sprite-me').first().getAttribute('src');
  check('faint: the one he picked comes in', /\/back\/6\.(gif|png)$/.test(meSrc || ''), meSrc);
  await page.evaluate(() => window.__go('road'));
  await waitScene(page, 'road');

  // a legendary: postgame level lift, then it sways on 1 HP and the ball glows
  await page.evaluate(() => window.__go('battle', { enemyTeam: [{ id: 150, level: 70 }], trainer: null, wild: true, legendary: true, postgame: true, returnTo: 'road', onEnd: null }));
  await page.waitForSelector('.bt[data-ready="1"] .bt-moves button:not([disabled])', { timeout: 10000 });
  const foeLv = await page.evaluate(() => document.querySelector('.bt-hud-foe')?.textContent || '');
  const gp = (await v3(page))?.players?.[1] || {};
  const avgLv = Math.round(gp.team.reduce((a, id) => a + (gp.mons[id]?.level || 5), 0) / gp.team.length);
  check('postgame: a Lv70 shrine legendary rises to his team\'s average level', avgLv > 70 && foeLv.includes('Lv' + avgLv), foeLv + ' vs avg ' + avgLv);
  let glow = false;
  for (let i = 0; i < 40 && !glow; i++) {
    if ((await scene(page)) !== 'battle' || (await page.locator('.bt-ok:visible').count())) break;
    glow = (await page.locator('.bt-act-ball.bt-act-glow').count()) > 0;
    if (glow) break;
    const slot = page.locator('.bt-drawer:not([hidden]) .bt-slot:not([disabled])');
    if (await slot.count()) { await slot.first().click({ force: true }).catch(() => {}); await page.waitForTimeout(300); continue; }
    const mv = page.locator('.bt-moves button:not([disabled])');
    if (await mv.count()) await mv.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(250);
  }
  check('legendary: beaten down, it stays on 1 HP and the ball button glows (catch it!)', glow);
  check('legendary: the fight is still on after the knockout blow', (await scene(page)) === 'battle' && !(await page.locator('.bt-ok:visible').count()));
  await finishPage('battle fixes', P);
}

// ---- Art's road peek: the house goes back to his garden
{
  const P = await newPage(SIZES[0], { pokedexos_save_v3: JSON.stringify(champSave()), pokedexos_next_lastplayer: '2' });
  const { page } = P;
  await page.goto(BASE + Q, { waitUntil: 'networkidle' });
  await waitScene(page, 'who');
  await page.locator('.who-card.p2').click();
  await waitScene(page, 'garden');
  await page.locator('.gd-road').dispatchEvent('pointerdown');
  await waitScene(page, 'road');
  const hb = await page.locator('.road-home').boundingBox();
  check('road peek: Art\'s house button is prereader-sized (>= 60px)', hb && hb.width >= 60 && hb.height >= 60, JSON.stringify(hb));
  await page.locator('.road-home').click();
  await waitScene(page, 'garden');
  check('road peek: ⌂ goes back to his garden, not WHO\'S PLAYING', (await scene(page)) === 'garden');
  await finishPage('road peek home', P);
}

// ============================================================ 12. offline shell + manifest
{
  const sw = readFileSync(join(NEXT, 'sw.js'), 'utf8');
  const missing = ['hatch', 'together', 'family-table', 'versus', 'lock', 'postcard', 'dex', 'team', 'wild', 'evolve', 'challenge', 'book', 'roots']
    .filter(n => !sw.includes(`'./scenes/${n}.js'`));
  check('sw: every new scene is in the offline list', missing.length === 0, missing.join(','));
  // Same rule tools/release.mjs enforces: every module under next/ (not tests) is listed.
  const walkMods = (dir, rel) => readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? (d.name === 'test' ? [] : walkMods(join(dir, d.name), `${rel}${d.name}/`))
      : d.name.endsWith('.js') && !(rel === '' && d.name === 'sw.js') ? [`${rel}${d.name}`] : []);
  const unlisted = walkMods(NEXT, '').filter(f => !sw.includes(`'./${f}'`));
  check('sw: every Sprout Road module is in the offline list', unlisted.length === 0, unlisted.join(','));
  check('sw: has a sprout- cache name (release.mjs bumps it)', /const NEXT_CACHE = 'sprout-[0-9A-Za-z.-]+'/.test(sw));
  const man = JSON.parse(readFileSync(join(NEXT, 'manifest.webmanifest'), 'utf8'));
  check('manifest: Sprout Road, own scope, standalone portrait',
    man.name === 'Sprout Road' && man.start_url === './' && man.scope === './' && man.display === 'standalone' && man.orientation === 'portrait');
  check('index.html points at next/manifest.webmanifest', /<link rel="manifest" href="manifest\.webmanifest">/.test(readFileSync(join(NEXT, 'index.html'), 'utf8')));
}

check('no requests to hosts outside the allowlist', OFFSITE.length === 0, OFFSITE.slice(0, 3).join(', '));

await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
