// ============================================================
// Pokédex OS — shared constants & type math
// ============================================================

export const MAX_POKEMON = 649; // Gens 1–5 — the animated pixel sprite era
export const APP_VERSION = '19.8.3';

// generation ranges for PC Box tabs
export const GENERATIONS = [
  { key: 1, label: 'G1', from: 1, to: 151 },
  { key: 2, label: 'G2', from: 152, to: 251 },
  { key: 3, label: 'G3', from: 252, to: 386 },
  { key: 4, label: 'G4', from: 387, to: 493 },
  { key: 5, label: 'G5', from: 494, to: 649 }
];

// SPRITE PINNING — deliberately still on `master`, and here is why.
// Pointing a child's game at someone else's moving branch is a real risk: an
// upstream reorg would replace every sprite in the app with a broken-image
// glyph, on a Saturday, with no warning. The fix is to pin to a tag or commit
// SHA. But an unverifiable pin is WORSE than the risk — a ref that doesn't
// exist breaks all 649 sprites immediately and with certainty, and this
// sandbox cannot reach github.com to confirm one.
//
// TO PIN IT (one line, ~2 minutes): open
//   https://github.com/PokeAPI/sprites/commits/master
// copy the full 40-character SHA of the latest commit, and swap `master` for
// it below. Then hard-relaunch the game and check a sprite loads.
//
// Until then the mitigation is live and covers the real failure mode: the
// delegated image error handler in main.js swaps any sprite that fails to load
// — 404, rate limit, offline — for an inline Pokéball, so the game degrades to
// a placeholder instead of a broken-image icon.
export const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites';
export const ITEM_SPRITE = name => `${SPRITE_BASE}/items/${name}.png`;
export const PIXEL_SPRITE = id => `${SPRITE_BASE}/pokemon/${id}.png`;

export const typeColors = {
  fire: '#fd7d24', water: '#4592c4', grass: '#9bcc50', electric: '#eed535',
  ice: '#51c4e7', fighting: '#d56723', poison: '#b97fc9', ground: '#ab9842',
  flying: '#3dc7ef', psychic: '#f366b9', bug: '#729f3f', rock: '#a38c21',
  ghost: '#7b62a3', dragon: '#f16e57', dark: '#707070', steel: '#9eb7b8',
  fairy: '#fdb9e9', normal: '#a4acaf'
};

// w = weak to (takes 2x FROM), r = resists, i = immune
export const typeChart = {
  normal:   { w: ['fighting'], r: [], i: ['ghost'] },
  fire:     { w: ['water', 'ground', 'rock'], r: ['fire', 'grass', 'ice', 'bug', 'fairy'], i: [] },
  water:    { w: ['electric', 'grass'], r: ['fire', 'water', 'ice', 'steel'], i: [] },
  grass:    { w: ['fire', 'ice', 'poison', 'flying', 'bug'], r: ['water', 'electric', 'grass', 'ground'], i: [] },
  electric: { w: ['ground'], r: ['electric', 'flying', 'steel'], i: [] },
  ice:      { w: ['fire', 'fighting', 'rock', 'steel'], r: ['ice'], i: [] },
  fighting: { w: ['flying', 'psychic', 'fairy'], r: ['bug', 'rock', 'dark'], i: [] },
  poison:   { w: ['ground', 'psychic'], r: ['grass', 'fighting', 'poison', 'bug', 'fairy'], i: [] },
  ground:   { w: ['water', 'grass', 'ice'], r: ['poison', 'rock'], i: ['electric'] },
  flying:   { w: ['electric', 'ice', 'rock'], r: ['grass', 'fighting', 'bug'], i: ['ground'] },
  psychic:  { w: ['bug', 'ghost', 'dark'], r: ['fighting', 'psychic'], i: [] },
  bug:      { w: ['fire', 'flying', 'rock'], r: ['grass', 'fighting', 'ground'], i: [] },
  rock:     { w: ['water', 'grass', 'fighting', 'ground', 'steel'], r: ['normal', 'fire', 'poison', 'flying'], i: [] },
  ghost:    { w: ['ghost', 'dark'], r: ['poison', 'bug'], i: ['normal', 'fighting'] },
  dragon:   { w: ['ice', 'dragon', 'fairy'], r: ['fire', 'water', 'electric', 'grass'], i: [] },
  steel:    { w: ['fire', 'fighting', 'ground'], r: ['normal', 'grass', 'ice', 'flying', 'psychic', 'bug', 'rock', 'dragon', 'steel', 'fairy'], i: ['poison'] },
  dark:     { w: ['fighting', 'bug', 'fairy'], r: ['ghost', 'dark'], i: ['psychic'] },
  fairy:    { w: ['poison', 'steel'], r: ['fighting', 'bug', 'dark'], i: ['dragon'] }
};

export function getTypeMultiplier(attackType, defenderTypes) {
  let multiplier = 1;
  if (!typeChart[attackType]) return 1;
  defenderTypes.forEach(t => {
    const defData = typeChart[t.type?.name];
    if (defData) {
      if (defData.w.includes(attackType)) multiplier *= 2.0;
      if (defData.r.includes(attackType)) multiplier *= 0.5;
      if (defData.i.includes(attackType)) multiplier *= 0;
    }
  });
  return multiplier;
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- the day, as the boys live it ----
// Moved here from progression.js in v19.7. The Sparkle Spot has to seed itself
// on the same LOCAL day the quest board rolls on, and putting the helper in
// this leaf module (config.js imports nothing) is what lets explore.js use it
// without importing progression.js — which would have closed a
// progression -> catch -> dex -> explore -> progression loop, and a cycle in
// the module graph is exactly the class of bug that ends in a black screen.
// Same function, same reason it exists:
// LOCAL days, not UTC. floor(Date.now()/86400000) rolled the quest board at
// 8pm in Ohio — a dinnertime progress wipe, every single day.
export function todayNumber() {
  const now = new Date();
  return Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / 86400000);
}

// ---- the pacing seam ----
// Every wait in a battle goes through awaitOrTap() instead of sleep(), for two
// reasons. GABE sat through ~43 seconds of unskippable dead air in a three-
// Pokémon gym fight, and the test suite had no way to run a battle quickly.
//
// Two rules protect ART. A tap can only ever hurry a wait ALONG, never skip it
// entirely: nothing resolves faster than PACE.floor, so a ceremony can't flash
// past a four-year-old who happened to have a finger down. And the skip is
// advertised with a blinking arrow — a pre-reader will never discover an
// invisible affordance, so without the arrow the feature does not exist for him.
export const PACE = { fast: false, floor: 250 };

// ?fast=1 (or a sticky localStorage flag) clamps every wait to the floor.
// Used by the test suite; harmless if a curious seven-year-old finds it.
export function initPace() {
  try {
    const q = new URLSearchParams(location.search).get('fast');
    if (q === '1') PACE.fast = true;
    else if (q === '0') { PACE.fast = false; localStorage.removeItem('pokedexos_fast'); }
    else if (localStorage.getItem('pokedexos_fast') === '1') PACE.fast = true;
    if (q === '1') localStorage.setItem('pokedexos_fast', '1');
  } catch (e) { /* private mode / storage blocked — pacing just stays normal */ }
  return PACE.fast;
}

function skipArrow(host = null) {
  // The arrow has to live where the wait is. Off the battle screen (the dex
  // ball throw) #battle-log does not exist, and an unadvertised skip does not
  // exist for a pre-reader — so a caller may name its own host.
  const log = host || document.getElementById('battle-log');
  if (!log) return null;
  const a = document.createElement('span');
  a.className = 'skip-arrow';
  a.setAttribute('aria-hidden', 'true');
  a.textContent = '▼';
  log.appendChild(a);
  return a;
}

// Resolves after ms, OR early on a tap once the floor has elapsed.
export function awaitOrTap(ms, { floor = PACE.floor, target = null, beat = false } = {}) {
  const total = PACE.fast ? Math.min(ms, floor) : ms;
  // A beat of ANIMATION timing is not a reading pause: it gets no arrow and can
  // never be tapped through. fx.js marks its one-shots with `beat` explicitly.
  //
  // v19.5.4: that used to be INFERRED from the duration — `total <= floor + 50`
  // — which also swallowed every 300ms RESULT beat ("A CRITICAL HIT!", "IT'S
  // SUPER EFFECTIVE!", "IT'S NOT VERY EFFECTIVE...", "IT HAD NO EFFECT!") into
  // a plain sleep with no arrow and no way to tap through at all, on exactly
  // the lines a seven-year-old most wants to move past. The flag now says what
  // the duration was only guessing at. ?fast=1 still clamps every wait to the
  // floor, so the suite keeps taking the cheap path.
  if (beat || total <= floor + 50) return sleep(total);
  return new Promise(resolve => {
    const el = target || document.getElementById('battle-container') || document.body;
    // The arrow is created UP FRONT, not when the tap arms at `floor`. It used
    // to be on screen for 450 - 250 = 200ms of a 450ms beat while the message
    // stayed up another 350ms, which reads as a glitch rather than as an
    // invitation to tap. Tap ACCEPTANCE still waits for `armed`, so nothing
    // resolves faster than PACE.floor and ART cannot flash past a ceremony —
    // only the advertisement moved earlier.
    let done = false, armed = false;
    const arrow = skipArrow(target);
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer); clearTimeout(armTimer);
      el.removeEventListener('pointerdown', onTap);
      if (arrow) arrow.remove();
      resolve();
    };
    const onTap = () => { if (armed) finish(); };
    const timer = setTimeout(finish, total);
    const armTimer = setTimeout(() => {
      if (done) return;
      armed = true;
      el.addEventListener('pointerdown', onTap);
    }, floor);
  });
}

// ---- the visual language of a type ----
// ART cannot read "THUNDER SHOCK". He can read a lightning bolt instantly.
// Every type gets a picture so a move button works with the words removed.
export const typeEmoji = {
  fire: '🔥', water: '💧', grass: '🌿', electric: '⚡', ice: '❄️',
  fighting: '🥊', poison: '☠️', ground: '⛰️', flying: '🪶', psychic: '🔮',
  bug: '🐛', rock: '🪨', ghost: '👻', dragon: '🐉', dark: '🌑',
  // NORMAL is a FIST, not a star. A star means "reward" everywhere else in the
  // game — quest complete, joined your team, VICTORY — so a star on an attack
  // button read as "the special one" to a four-year-old, and he picked it every
  // time. A fist is the only glyph on the board that means "hit it".
  steel: '⚙️', fairy: '🧚', normal: '👊'
};

const INK_DARK = '#1a1a2a';
const INK_LIGHT = '#ffffff';

/** WCAG relative luminance of a hex colour. */
export function luminance(hex) {
  const h = String(hex || '#777777').replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const ch = i => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
}

const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

// Pick black or white ink for a coloured chip by measuring BOTH options and
// taking the more readable one. The old code hardcoded white, which put white
// on the ground type at ~1.4:1 — effectively invisible.
//
// Note: don't do this with a luminance threshold picked by eye. My first
// attempt used L > 0.45, which still handed ground white ink at 2.9:1 when
// black would have given 7.3:1. Measuring is cheap; guessing is wrong.
export function inkFor(hex) {
  const L = luminance(hex);
  return contrast(L, luminance(INK_DARK)) >= contrast(L, luminance(INK_LIGHT))
    ? INK_DARK : INK_LIGHT;
}
