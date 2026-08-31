// ============================================================
// Pokédex OS — EXPLORE mode: habitats, rarity tiers, encounters
// Rarity roll: 1% legendary · 9% rare · 30% uncommon · 60% common
// ============================================================

import { PIXEL_SPRITE, todayNumber } from './config.js';
import { state, player, persist, monLevel } from './state.js';
import { wildLevel } from './engine.js';
import { sfx, triggerVibration, playBeep } from './audio.js';
import { dialog } from './dialog.js';
import { BACKFILL, FARAWAY } from './habitatfill.js';

// Gen-1 habitat pools. c=common u=uncommon r=rare L=legendary
//
// `base`/`spread` give each habitat its OWN difficulty, rising with badges.
// Before this, every wild Pokémon was scaled to your lead (lead*0.8..1.2), so
// the world had no shape at all: week 4 of play was mathematically identical
// to day 2, and no habitat was ever safer or scarier than any other.
// engine.wildLevel() leashes the result to the lead so a habitat can still
// never become an unwinnable wall for ART.
export const HABITATS = [
  // The starter route sits just UNDER the Pokemon a new player actually has.
  // base 4 / spread 3 rolled Lv4-7 (mean 5.5) against the Lv5 that every fresh
  // catch is, on the first card of the map, and with engine.MAX_HIT_FRACTION
  // capping a Lv5 fight at a 2-3 turn race there is no room to recover from a
  // one-level deficit. base 3 / spread 1 is Lv3-4. Nothing else moves: badges
  // still add +2 each and the lead leash still scales the route for a returning
  // player, and habitatLevel() reads the same two numbers so "Lv~4" is honest.
  { key: 'forest', bg: 'grass', base: 3, spread: 1, emoji: '🌲', name: 'DEEP FOREST', sub: 'BUG · GRASS · BIRD',
    c: [10, 13, 16, 19, 43, 69, 48, 161, 163, 165, 265, 401, 504, 519],
    u: [11, 14, 17, 20, 44, 70, 25, 102, 46, 1, 152, 252, 387, 495, 511, 540],
    r: [12, 15, 18, 45, 71, 47, 103, 123, 127, 2, 212, 214, 469, 541, 3],
    L: [251] },
  { key: 'meadow', bg: 'grass', base: 3, spread: 3, emoji: '🌾', name: 'TALL GRASS', sub: 'NORMAL · FAIRY',
    c: [19, 29, 32, 52, 54, 21, 261, 263, 396, 506, 519],
    u: [30, 33, 53, 55, 83, 56, 39, 133, 22, 241, 300, 427, 507, 234],
    r: [31, 34, 40, 57, 113, 143, 115, 242, 463, 531, 108],
    L: [151] },
  { key: 'ocean', bg: 'water', base: 8, spread: 4, emoji: '🌊', name: 'OCEAN & BEACH', sub: 'WATER · ICE',
    c: [72, 90, 98, 118, 120, 129, 170, 183, 194, 320, 456, 550],
    u: [73, 91, 99, 119, 121, 116, 86, 79, 7, 171, 184, 195, 321, 457, 258, 393, 501],
    r: [117, 130, 131, 87, 80, 134, 8, 9, 139, 226, 230, 350, 365, 564],
    L: [144, 245, 249, 382] },
  { key: 'volcano', bg: 'fire', base: 16, spread: 5, emoji: '🔥', name: 'VOLCANO PATH', sub: 'FIRE',
    c: [58, 77, 4, 37, 155, 218, 228, 255, 390, 498, 513],
    u: [59, 78, 5, 126, 136, 156, 219, 229, 256, 391, 499, 514],
    r: [6, 38, 157, 257, 392, 500, 467, 555],
    L: [146, 244, 250, 383] },
  { key: 'powerplant', bg: 'electric', base: 12, spread: 4, emoji: '⚡', name: 'POWER PLANT', sub: 'ELECTRIC · STEEL',
    c: [81, 100, 25, 179, 309, 403, 522],
    u: [82, 101, 26, 125, 180, 310, 404, 523, 417, 311, 312, 599],
    r: [135, 181, 405, 466, 462, 600, 601],
    L: [145, 243, 644] },
  { key: 'cave', bg: 'rock', base: 20, spread: 5, emoji: '🕳️', name: 'DEEP CAVE', sub: 'ROCK · GROUND · FIGHT',
    c: [74, 50, 41, 27, 66, 293, 296, 524, 529, 532],
    u: [75, 51, 42, 28, 95, 104, 67, 111, 294, 297, 299, 525, 530, 533, 246],
    r: [76, 105, 112, 68, 106, 107, 138, 140, 142, 132, 247, 248, 476, 526, 534],
    L: [150, 486] },
  { key: 'tower', bg: 'ghost', base: 26, spread: 6, emoji: '👻', name: 'GHOST TOWER', sub: 'GHOST · PSYCHIC',
    c: [92, 41, 35, 96, 200, 353, 355, 425, 562, 607],
    u: [93, 42, 36, 64, 122, 97, 63, 354, 356, 426, 563, 608],
    r: [94, 65, 124, 49, 292, 477, 609, 429],
    L: [491] },
  { key: 'dragon', bg: 'rock', base: 34, spread: 7, emoji: '🐉', name: "DRAGON'S DEN", sub: 'DRAGON · ULTRA RARE',
    c: [129, 116, 333, 371, 443, 610],
    u: [147, 117, 334, 372, 444, 611],
    r: [148, 373, 445, 612, 130, 131],
    L: [149, 151, 384, 483, 487, 643] }
];

// v18.10: home the 336 orphans. Every species the hand-curated pools and gym
// rosters missed is merged into its type's habitat, and FARAWAY LAND — the
// champion-gated postgame safari holding every remaining legendary — joins
// the map as a 9th region.
HABITATS.forEach(h => {
  const extra = BACKFILL[h.key];
  if (!extra) return;
  ['c', 'u', 'r', 'L'].forEach(k =>
    extra[k].forEach(id => { if (!h[k].includes(id)) h[k].push(id); }));
});
// FARAWAY LAND comes from the generated file, so its backdrop is set here
// rather than in the data: the champion's safari gets the psychic scene.
HABITATS.push({ bg: 'psychic', ...FARAWAY });

let currentHabitat = null;

const leadLevel = () => {
  const p = player();
  const id = p.team[0] || p.caught[0];
  return id ? monLevel(id) : 5;
};

// LEADER wins only (the ':4' keys — ten gym Leaders plus Champion Rex), a
// 0-11 scale. Counting all 58 per-trainer keys fed engine.wildLevel up to
// +116 levels of "badge" inflation, pinning every habitat at the leash cap —
// which flattened the per-habitat difficulty design back into uniform
// lead-scaling and made the difficulty pips identical everywhere.
const badgeCount = () => Object.keys(player().gyms?.beaten || {}).filter(k => k.endsWith(':4')).length;

/** Mid-band level for a habitat, for display on the cards. */
export function habitatLevel(h) {
  return wildLevel({
    base: h.base ?? 5, spread: h.spread ?? 3, badges: badgeCount(),
    leadLevel: leadLevel(), junior: !!player().settings.junior, rng: () => 0.5
  });
}

/** The actual rolled level for an encounter in this habitat. */
export function habitatEncounterLevel(h) {
  return wildLevel({
    base: h.base ?? 5, spread: h.spread ?? 3, badges: badgeCount(),
    leadLevel: leadLevel(), junior: !!player().settings.junior
  });
}

/** Where the current encounter came from, so the battle can level it. */
export const activeHabitat = () => currentHabitat;

// The arena used to pick its scene from the WILD POKEMON'S TYPE, so meeting a
// water-type in DEEP FOREST painted an ocean while the chip overhead still
// said DEEP FOREST. The place you walked into decides how the place looks.
export const habitatBackdrop = () => HABITATS.find(h => h.key === currentHabitat)?.bg || null;

// ---- v19.7: THE SPARKLE SPOT ----
// One habitat glitters each day and shinies are five times likelier in it.
// That is ALL it is. It is not a gate (every habitat stays open), not a
// countdown (nothing on screen runs down), and nothing ever runs out — the
// card that glitters today simply stops glittering tomorrow while another one
// starts. Junior Mode gets exactly the same odds: a bonus is not an
// accommodation, so there is nothing here to hide and nothing to advertise.
// Same seeded LCG as progression.pickDailyQuests(), on the same LOCAL day, and
// keyed to the player so the brothers can have different lucky places.
export function sparkleSpot() {
  let seed = (todayNumber() * 3 + state.currentPlayer * 13) & 0x7fffffff;
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  // Only places this player can actually walk into. Drawn from all nine, the
  // spot could land on FARAWAY LAND before the crown and nothing would glitter
  // all day — an invisible bonus is the same as no bonus.
  const pool = HABITATS.filter(h => !h.championOnly || player().champion);
  const i = Math.floor((seed / 0x80000000) * pool.length);
  return pool[i]?.key || pool[0].key;
}

/** Every habitat whose pools contain this species. Read-only — the dex chip
    uses it to say "it lives here", and it never gates or hides anything. */
export function habitatsOf(id) {
  const n = Number(id);
  return HABITATS.filter(h => ['c', 'u', 'r', 'L'].some(k => (h[k] || []).includes(n)));
}

// Three little residents peeking out of the scene. Deterministic per habitat —
// a place whose animals reshuffle on every render is a different place every
// time you look at it — and drawn from the COMMON pool, so what peeks out is
// genuinely what he is most likely to meet in there.
function peekersFor(h) {
  const pool = h.c || [];
  const want = Math.min(3, pool.length);
  let seed = 7;
  for (let i = 0; i < h.key.length; i++) seed = (seed * 31 + h.key.charCodeAt(i)) & 0x7fffffff;
  const out = [];
  for (let tries = 0; tries < 24 && out.length < want; tries++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const id = pool[Math.floor((seed / 0x80000000) * pool.length)];
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

// The dex habitat chip routes here. It OPENS the map with that place lit up
// and scrolled into view; it does not walk in for you. A chip tap on the dex
// must never drop a seven-year-old into a fight he did not ask for.
export function openExploreAt(key) {
  openExplore();
  if (state.appMode !== 'explore') return;   // catching, or already in a fight
  const card = document.querySelector(`#habitat-grid .habitat-card[data-habitat="${key}"]`);
  if (!card) return;
  card.classList.add('card-focus');
  try { card.scrollIntoView({ block: 'center' }); } catch (e) { /* older engines */ }
  setTimeout(() => card.classList.remove('card-focus'), 2400);
}

export function openExplore() {
  if (state.isCatching || state.appMode === 'battle') return;
  state.appMode = 'explore';
  renderHabitats();
  document.getElementById('explore-container').classList.add('active');
  document.getElementById('encounter-scene').style.display = 'none';
  document.getElementById('habitat-grid').style.display = 'grid';
}

export function closeExplore() {
  state.appMode = 'dex';
  document.getElementById('explore-container').classList.remove('active');
}

function renderHabitats() {
  const grid = document.getElementById('habitat-grid');
  const lead = leadLevel();
  const junior = !!player().settings.junior;
  const glitterKey = sparkleSpot();
  grid.innerHTML = HABITATS.map(h => {
    // Three pips relative to YOUR lead. Information, never a lock — every
    // habitat stays open, because telling a 4-year-old "not yet" is worse
    // than letting him wander somewhere hard and come back. The one
    // exception is FARAWAY LAND, which is a PRIZE with a door, not a wall:
    // it opens the day this player becomes Champion.
    const locked = h.championOnly && !player().champion;
    const expected = habitatLevel(h);
    // What can a difficulty pip MEAN for ART? In Junior Mode his Pokemon cannot
    // faint (battle.js clamps his HP above zero; engine.js caps incoming damage
    // at JUNIOR_MAX_TAKE) and there is no other loss condition in a wild fight —
    // so "tough" is not a thing that can happen to him. A red square is the one
    // signal a four-year-old reads perfectly, and it says DO NOT GO HERE: on a
    // brand-new junior save six of eight cards were red and none were green, a
    // forbidden world built out of a danger that does not exist. Uniform green
    // says only "all of these are fine", which in Junior Mode is simply true —
    // and it advertises nothing, because a green board is not an accommodation,
    // it is a map. The band is NOT deleted: the Lv~N caption Kevin reads over
    // Art's shoulder lives in the same <small>, and the card height must match.
    const pips = junior ? 1
      : expected > lead + 4 ? 3 : expected > lead - 2 ? 2 : 1;
    // v19.7: the same three bands now ALSO paint the .card-band stripe, which
    // is the one difficulty signal that survives across the whole card grammar.
    const band = pips === 3 ? 'var(--red)' : pips === 2 ? 'var(--gold)' : 'var(--green)';
    const glitters = !locked && h.key === glitterKey;
    // ART gets the place itself: the habitat's own sky (its `bg`, the same one
    // the arena paints when he walks in) with three residents bobbing in it.
    // GABE keeps two columns, the type line and the 8px Lv~N caption.
    const scene = junior
      ? `<div class="scene-bg bg-${h.bg || 'grass'}"></div>
         <div class="peekers">${peekersFor(h).map(id =>
            `<img class="peeker" src="${PIXEL_SPRITE(id)}" alt="" draggable="false">`).join('')}</div>`
      : '';
    // A LOCKED place is a greyscale scene with a padlock and a crown — no
    // sentence. The card still takes the tap and still explains itself in a
    // dialog, so nothing was taken away; the words just stopped being the only
    // way to know what this card is.
    return `
    <div class="card habitat-card ${locked ? 'locked' : ''} ${glitters ? 'sparkle-spot' : ''}" data-habitat="${h.key}" title="${h.name}">
      <div class="hab-inner">
        <span class="card-band" style="--band:${band}"></span>
        ${scene}
        <span class="card-art habitat-emoji">${h.emoji}</span>
        <div class="card-plate">
          <span class="card-title habitat-name">${h.name}</span>
          ${locked ? '' : `<small class="habitat-sub">${h.sub}</small>`}
          ${locked ? '' : `<small class="habitat-diff" data-pips="${pips}"><i></i><i></i><i></i>Lv~${expected}</small>`}
        </div>
        ${glitters ? '<span class="sparkle-chip" aria-hidden="true">✨</span>' : ''}
        ${locked ? '<span class="card-ribbon">👑</span><span class="card-lock">🔒</span>' : ''}
      </div>
    </div>`;
  }).join('');
  grid.querySelectorAll('.habitat-card').forEach(el =>
    el.addEventListener('click', () => enterHabitat(el.dataset.habitat)));
}

function rollEncounter(habitat) {
  const roll = Math.random();
  let pool, tier;
  if (roll < 0.01 && habitat.L.length) { pool = habitat.L; tier = 'legendary'; }
  else if (roll < 0.10 && habitat.r.length) { pool = habitat.r; tier = 'rare'; }
  else if (roll < 0.40 && habitat.u.length) { pool = habitat.u; tier = 'uncommon'; }
  else { pool = habitat.c; tier = 'common'; }
  return { id: pool[Math.floor(Math.random() * pool.length)], tier };
}

async function enterHabitat(key) {
  const habitat = HABITATS.find(h => h.key === key);
  if (!habitat) return;
  if (player().caught.length === 0) {
    dialog({ icon: '🔴', title: 'CATCH ONE FIRST!', text: 'Tap CATCH on the Pokédex, then come explore.' });
    return;
  }
  if (habitat.championOnly && !player().champion) {
    dialog({ icon: '👑', title: 'CHAMPIONS ONLY!', text: 'Beat the whole Gym Circuit to open FARAWAY LAND.' });
    return;
  }
  currentHabitat = habitat;
  player().stats.explores = (player().stats.explores || 0) + 1;
  persist();
  document.dispatchEvent(new CustomEvent('game-progress', { detail: { kind: 'explore' } }));

  const { id, tier } = rollEncounter(habitat);

  // rustle scene
  document.getElementById('habitat-grid').style.display = 'none';
  const scene = document.getElementById('encounter-scene');
  scene.style.display = 'flex';
  const rustle = document.getElementById('rustle-art');
  const text = document.getElementById('encounter-text');
  rustle.innerText = habitat.emoji;
  rustle.className = 'rustling';
  text.innerText = `You explore the ${habitat.name.toLowerCase()}...`;

  for (let i = 0; i < 3; i++) {
    playBeep(180 + i * 40, 'triangle', 0.08, 0.08);
    triggerVibration(30);
    await new Promise(r => setTimeout(r, 550));
  }

  rustle.className = 'alert';
  rustle.innerText = '❗';
  if (tier === 'legendary') {
    text.innerText = '💥 A LEGENDARY POKÉMON!! 💥';
    sfx.superHit();
    triggerVibration([100, 60, 100, 60, 200]);
  } else if (tier === 'rare') {
    text.innerText = '✨ Something RARE rustles... ✨';
    sfx.catch();
    triggerVibration([80, 40, 80]);
  } else {
    text.innerText = 'Something rustles nearby!';
    sfx.shake();
    triggerVibration(60);
  }
  await new Promise(r => setTimeout(r, 1200));

  document.getElementById('explore-container').classList.remove('active');
  document.dispatchEvent(new CustomEvent('explore-encounter', { detail: { wildId: id, tier } }));
}

// battle exit routes back here when the encounter came from exploring
export function reopenExplore() {
  openExplore();
}
