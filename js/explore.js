// ============================================================
// Pokédex OS — EXPLORE mode: habitats, rarity tiers, encounters
// Rarity roll: 1% legendary · 9% rare · 30% uncommon · 60% common
// ============================================================

import { state, player, persist } from './state.js';
import { sfx, triggerVibration, playBeep } from './audio.js';

// Gen-1 habitat pools. c=common u=uncommon r=rare L=legendary
export const HABITATS = [
  { key: 'forest', emoji: '🌲', name: 'VIRIDIAN FOREST', sub: 'BUG · GRASS · BIRD',
    c: [10, 13, 16, 19, 43, 69, 48], u: [11, 14, 17, 20, 44, 70, 25, 102, 46, 1], r: [12, 15, 18, 45, 71, 47, 103, 123, 127, 2], L: [] },
  { key: 'meadow', emoji: '🌾', name: 'TALL GRASS', sub: 'NORMAL · FAIRY',
    c: [19, 29, 32, 52, 54, 21], u: [30, 33, 53, 55, 83, 56, 39, 133, 22], r: [31, 34, 40, 57, 113, 143, 115], L: [151] },
  { key: 'ocean', emoji: '🌊', name: 'OCEAN & BEACH', sub: 'WATER · ICE',
    c: [72, 90, 98, 118, 120, 129], u: [73, 91, 99, 119, 121, 116, 86, 79, 7], r: [117, 130, 131, 87, 80, 134, 8, 9, 139], L: [144] },
  { key: 'volcano', emoji: '🔥', name: 'VOLCANO PATH', sub: 'FIRE',
    c: [58, 77, 4, 37], u: [59, 78, 5, 126, 136], r: [6, 38, 59], L: [146] },
  { key: 'powerplant', emoji: '⚡', name: 'POWER PLANT', sub: 'ELECTRIC · STEEL',
    c: [81, 100, 25], u: [82, 101, 26, 125], r: [135, 82, 137], L: [145] },
  { key: 'cave', emoji: '🕳️', name: 'DEEP CAVE', sub: 'ROCK · GROUND · FIGHT',
    c: [74, 50, 41, 27, 66], u: [75, 51, 42, 28, 95, 104, 67, 111], r: [76, 105, 112, 68, 106, 107, 138, 140, 142, 132], L: [150] },
  { key: 'tower', emoji: '👻', name: 'GHOST TOWER', sub: 'GHOST · PSYCHIC',
    c: [92, 41, 35, 96], u: [93, 42, 36, 64, 122, 97, 63], r: [94, 65, 124, 49], L: [] },
  { key: 'dragon', emoji: '🐉', name: "DRAGON'S DEN", sub: 'DRAGON · ULTRA RARE',
    c: [129, 116], u: [147, 117], r: [148, 130, 131], L: [149, 151] }
];

let currentHabitat = null;

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
  grid.innerHTML = HABITATS.map(h => `
    <div class="habitat-card" data-habitat="${h.key}">
      <span class="habitat-emoji">${h.emoji}</span>
      <span class="habitat-name">${h.name}</span>
      <small class="habitat-sub">${h.sub}</small>
    </div>`).join('');
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
    alert('You need to CATCH a Pokémon before exploring! Try the CATCH button first.');
    return;
  }
  currentHabitat = habitat;
  player().stats.explores = (player().stats.explores || 0) + 1;
  persist();

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
