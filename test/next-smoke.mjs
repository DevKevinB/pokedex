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

const NAMES = { 1: 'bulbasaur', 2: 'ivysaur', 3: 'venusaur', 25: 'pikachu', 6: 'charizard', 7: 'squirtle' };
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
    moves: ['tackle', 'quick-attack', 'body-slam', 'headbutt', 'growl']
      .map(n => ({ move: { name: n, url: '' } })),
  };
}
const speciesFixture = id => ({ id, name: NAMES[id] || `mon-${id}`, capture_rate: 190, is_legendary: false });

const OFFSITE = [];
async function mockRoutes(context) {
  await context.route('https://pokeapi.co/**', route => {
    const url = route.request().url();
    const s = url.match(/pokemon-species\/(\d+)/);
    const p = url.match(/\/pokemon\/(\d+)\/?$/);
    let body = null;
    if (s) body = speciesFixture(+s[1]);
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
    return { outside, tiny };
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
  await page.locator('.gu-close').click();
  check('gear: DONE closes the panel', (await page.locator('.gu-panel').count()) === 0);
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

// ============================================================ 12. offline shell + manifest
{
  const sw = readFileSync(join(NEXT, 'sw.js'), 'utf8');
  const missing = ['hatch', 'together', 'family-table', 'versus', 'lock', 'postcard']
    .filter(n => !sw.includes(`'./scenes/${n}.js'`));
  check('sw: every new scene is in the offline list', missing.length === 0, missing.join(','));
  check('sw: cache bumped to alpha.2', sw.includes("'sprout-20.0.0-alpha.2'"));
  const man = JSON.parse(readFileSync(join(NEXT, 'manifest.webmanifest'), 'utf8'));
  check('manifest: Sprout Road, own scope, standalone portrait',
    man.name === 'Sprout Road' && man.start_url === './' && man.scope === './' && man.display === 'standalone' && man.orientation === 'portrait');
  check('index.html points at next/manifest.webmanifest', /<link rel="manifest" href="manifest\.webmanifest">/.test(readFileSync(join(NEXT, 'index.html'), 'utf8')));
}

check('no requests to hosts outside the allowlist', OFFSITE.length === 0, OFFSITE.slice(0, 3).join(', '));

await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
