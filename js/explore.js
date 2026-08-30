// ============================================================
// Pokédex OS — EXPLORE mode: habitats, rarity tiers, encounters
// Rarity roll: 1% legendary · 9% rare · 30% uncommon · 60% common
// ============================================================

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
  { key: 'forest', base: 4, spread: 3, emoji: '🌲', name: 'DEEP FOREST', sub: 'BUG · GRASS · BIRD',
    c: [10, 13, 16, 19, 43, 69, 48, 161, 163, 165, 265, 401, 504, 519],
    u: [11, 14, 17, 20, 44, 70, 25, 102, 46, 1, 152, 252, 387, 495, 511, 540],
    r: [12, 15, 18, 45, 71, 47, 103, 123, 127, 2, 212, 214, 469, 541, 3],
    L: [251] },
  { key: 'meadow', base: 3, spread: 3, emoji: '🌾', name: 'TALL GRASS', sub: 'NORMAL · FAIRY',
    c: [19, 29, 32, 52, 54, 21, 261, 263, 396, 506, 519],
    u: [30, 33, 53, 55, 83, 56, 39, 133, 22, 241, 300, 427, 507, 234],
    r: [31, 34, 40, 57, 113, 143, 115, 242, 463, 531, 108],
    L: [151] },
  { key: 'ocean', base: 8, spread: 4, emoji: '🌊', name: 'OCEAN & BEACH', sub: 'WATER · ICE',
    c: [72, 90, 98, 118, 120, 129, 170, 183, 194, 320, 456, 550],
    u: [73, 91, 99, 119, 121, 116, 86, 79, 7, 171, 184, 195, 321, 457, 258, 393, 501],
    r: [117, 130, 131, 87, 80, 134, 8, 9, 139, 226, 230, 350, 365, 564],
    L: [144, 245, 249, 382] },
  { key: 'volcano', base: 16, spread: 5, emoji: '🔥', name: 'VOLCANO PATH', sub: 'FIRE',
    c: [58, 77, 4, 37, 155, 218, 228, 255, 390, 498, 513],
    u: [59, 78, 5, 126, 136, 156, 219, 229, 256, 391, 499, 514],
    r: [6, 38, 157, 257, 392, 500, 467, 555],
    L: [146, 244, 250, 383] },
  { key: 'powerplant', base: 12, spread: 4, emoji: '⚡', name: 'POWER PLANT', sub: 'ELECTRIC · STEEL',
    c: [81, 100, 25, 179, 309, 403, 522],
    u: [82, 101, 26, 125, 180, 310, 404, 523, 417, 311, 312, 599],
    r: [135, 181, 405, 466, 462, 600, 601],
    L: [145, 243, 644] },
  { key: 'cave', base: 20, spread: 5, emoji: '🕳️', name: 'DEEP CAVE', sub: 'ROCK · GROUND · FIGHT',
    c: [74, 50, 41, 27, 66, 293, 296, 524, 529, 532],
    u: [75, 51, 42, 28, 95, 104, 67, 111, 294, 297, 299, 525, 530, 533, 246],
    r: [76, 105, 112, 68, 106, 107, 138, 140, 142, 132, 247, 248, 476, 526, 534],
    L: [150, 486] },
  { key: 'tower', base: 26, spread: 6, emoji: '👻', name: 'GHOST TOWER', sub: 'GHOST · PSYCHIC',
    c: [92, 41, 35, 96, 200, 353, 355, 425, 562, 607],
    u: [93, 42, 36, 64, 122, 97, 63, 354, 356, 426, 563, 608],
    r: [94, 65, 124, 49, 292, 477, 609, 429],
    L: [491] },
  { key: 'dragon', base: 34, spread: 7, emoji: '🐉', name: "DRAGON'S DEN", sub: 'DRAGON · ULTRA RARE',
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
HABITATS.push(FARAWAY);

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
  grid.innerHTML = HABITATS.map(h => {
    // Three pips relative to YOUR lead. Information, never a lock — every
    // habitat stays open, because telling a 4-year-old "not yet" is worse
    // than letting him wander somewhere hard and come back. The one
    // exception is FARAWAY LAND, which is a PRIZE with a door, not a wall:
    // it opens the day this player becomes Champion.
    const locked = h.championOnly && !player().champion;
    const expected = habitatLevel(h);
    const pips = expected > lead + 4 ? 3 : expected > lead - 2 ? 2 : 1;
    return `
    <div class="habitat-card ${locked ? 'locked' : ''}" data-habitat="${h.key}">
      <span class="habitat-emoji">${locked ? '🔒' : h.emoji}</span>
      <span class="habitat-name">${h.name}</span>
      <small class="habitat-sub">${locked ? '👑 BECOME CHAMPION!' : h.sub}</small>
      ${locked ? '' : `<small class="habitat-diff" data-pips="${pips}"><i></i><i></i><i></i>Lv~${expected}</small>`}
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
