// Smoke test for SPROUT ROAD (/next/). Runs against the local static server
// on :8321 with PokeAPI and the sprite CDN fully mocked, and service workers
// blocked. Usage:  node test/next-smoke.mjs
//
// Guards carried over from test/smoke.mjs: the game never talks, never opens
// a native dialog, never logs a console error. New here: save v2 -> v3
// migration on a realistic save (v2 byte-identical afterwards), the garden
// and road loops, a full trainer battle, a no-innerHTML grep, the CSP meta,
// and a layout net at 375x667 and 390x844 with screenshots.
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
const SIZES = [{ width: 375, height: 667 }, { width: 390, height: 844 }];
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

check('no requests to hosts outside the allowlist', OFFSITE.length === 0, OFFSITE.slice(0, 3).join(', '));

await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
