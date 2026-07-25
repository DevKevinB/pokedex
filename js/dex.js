// ============================================================
// Pokédex OS — main dex screen: load, display, evolutions, gallery
// ============================================================

import { MAX_POKEMON, typeColors, ITEM_SPRITE, PIXEL_SPRITE } from './config.js';
import { getPokemon, getSpecies, getEvolution } from './api.js';
import { state, player } from './state.js';
import { stopAllAudio, setCry, triggerVibration, speak } from './audio.js';

let galleryTimer = null;
let typeTimer = null;

// GBA-style typewriter text
export function typeText(el, text, speed = 16) {
  clearInterval(typeTimer);
  el.classList.add('typing');
  el.innerText = '';
  let i = 0;
  typeTimer = setInterval(() => {
    i += 2; // two chars per tick keeps long entries snappy
    el.innerText = text.slice(0, i);
    if (i >= text.length) {
      clearInterval(typeTimer);
      el.innerText = text;
      el.classList.remove('typing');
    }
  }, speed);
}

// screen-wipe transition
export function screenWipe() {
  const w = document.getElementById('screen-wipe');
  if (!w) return;
  w.classList.remove('wipe');
  void w.offsetWidth;
  w.classList.add('wipe');
  setTimeout(() => w.classList.remove('wipe'), 500);
}

export function setScanning(active) {
  const scanner = document.getElementById('scanner-container');
  if (scanner) scanner.classList.toggle('scanning', active);
  ['red', 'yellow', 'green'].forEach(c => {
    const el = document.getElementById(`led-${c}`);
    if (el) el.classList.toggle('blink', active);
  });
}

export function updateCatchUI() {
  const btn = document.getElementById('catch-btn');
  const icon = document.getElementById('caught-icon');
  if (player().caught.includes(state.curId)) {
    btn.innerHTML = '<span class="btn-icon">✔️</span> OWNED';
    btn.classList.add('owned');
    icon.style.display = 'inline-block';
  } else {
    btn.innerHTML = '<span class="btn-icon">🔴</span> CATCH';
    btn.classList.remove('owned');
    icon.style.display = 'none';
  }
}

export async function loadPoke(idOrName) {
  if (!idOrName || state.isCatching || state.appMode === 'battle') return;
  stopAllAudio();
  clearInterval(galleryTimer);
  screenWipe();
  setScanning(true);
  document.getElementById('search').blur();
  document.getElementById('poke-sprite').style.opacity = 0;

  try {
    const searchTarget = idOrName.toString().toLowerCase().trim().replace(/\s+/g, '-');
    const data = await getPokemon(searchTarget);
    if (data.id > MAX_POKEMON) throw new Error('GEN_RANGE');

    state.curData = data;
    state.curId = data.id;
    state.curSpeciesData = data.species_url ? await getSpecies(data.species_url) : null;

    updateUISafe();
    loadEvolutionsSafe(state.curSpeciesData?.evolution_chain_url);
    setupGallerySafe();
    updateCatchUI();
  } catch (e) {
    console.error('Master Fetch Error:', e);
    setScanning(false);
    if (e.message === 'GEN_RANGE') {
      document.getElementById('poke-name').innerText = 'NOT FOUND YET';
      document.getElementById('desc').innerText = 'This OS covers Pokémon #1–#649 (Generations 1–5).';
    } else {
      document.getElementById('poke-name').innerText = 'ERROR / TIMEOUT';
      document.getElementById('desc').innerText = 'API Server issue or Pokémon not found. Try again.';
    }
    document.getElementById('id-text').innerText = '#---';
    document.getElementById('types').innerHTML = '';
    document.getElementById('stats-area').innerHTML = '';
    document.getElementById('poke-sprite').src = ITEM_SPRITE('poke-ball');
    document.getElementById('bg-glow').style.background = 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%)';
  }
  setTimeout(() => {
    setScanning(false);
    document.getElementById('poke-sprite').style.opacity = 1;
  }, 600);
}

function updateUISafe() {
  const d = state.curData, s = state.curSpeciesData;
  try {
    const typeColor = typeColors[d.types?.[0]?.type?.name] || '#777';
    document.getElementById('bg-glow').style.background = `radial-gradient(circle, ${typeColor}66 0%, transparent 70%)`;
    document.getElementById('app-body').style.setProperty('--type-glow', `${typeColor}42`);
    document.getElementById('id-text').innerText = `NO. ${d.id.toString().padStart(4, '0')}`;
    document.getElementById('poke-name').innerText = d.name;
    document.getElementById('poke-name').style.fontSize = d.name.length > 12 ? '24px' : '32px';
    document.getElementById('ht').innerText = `${(d.height || 0) / 10}m`;
    document.getElementById('wt').innerText = `${(d.weight || 0) / 10}kg`;
    document.getElementById('base-exp').innerText = d.base_experience || '--';
    document.getElementById('genus').innerText = s?.genus || 'Unknown';
    typeText(document.getElementById('desc'), s?.flavor_texts?.[0] || 'No data.');

    document.getElementById('types').innerHTML = (d.types || [])
      .map(t => `<span class="tag" style="background:${typeColors[t.type?.name] || '#777'};">${t.type?.name}</span>`).join('');
    document.getElementById('abilities').innerHTML = (d.abilities || [])
      .map(a => a.ability?.name?.replace('-', ' ')).join('<br>');

    const maxStat = 255;
    document.getElementById('stats-area').innerHTML = (d.stats || []).map(st => {
      const statName = st.stat?.name?.toUpperCase().replace('SPECIAL-', 'SP. ') || 'STAT';
      const percent = ((st.base_stat || 0) / maxStat) * 100;
      const barColor = st.base_stat > 90 ? '#4caf50' : st.base_stat > 50 ? '#ffeb3b' : '#f44336';
      return `<div class="stat-row"><div class="stat-name">${statName}</div><div class="stat-val">${st.base_stat || 0}</div><div class="stat-bar-bg"><div class="stat-bar-fill" style="width: ${percent}%; background: ${barColor}"></div></div></div>`;
    }).join('');

    setCry(d.cries?.latest);

    // Junior mode: say the name out loud — no reading required
    if (player().settings.junior) speak(d.name, { pitch: 1.1, rate: 0.85 });
  } catch (e) { console.error('UI Update Failed', e); }
}

async function loadEvolutionsSafe(url) {
  const evoBox = document.getElementById('evo-chain');
  evoBox.innerHTML = '<span style="color:#777; font-size:10px;">ANALYZING DNA...</span>';
  if (!url) { evoBox.innerHTML = '<span style="color:#777; font-size:10px;">NO DATA</span>'; return; }
  try {
    const { chain } = await getEvolution(url);
    const gen1 = chain.filter(p => p.id <= MAX_POKEMON);
    evoBox.innerHTML = gen1.map((poke, index) =>
      `${index > 0 ? '<div class="evo-arrow">▶</div>' : ''}<div class="evo-item" data-evo-id="${poke.id}"><img src="${PIXEL_SPRITE(poke.id)}"><span>${poke.name}</span></div>`
    ).join('');
    evoBox.querySelectorAll('.evo-item').forEach(el =>
      el.addEventListener('click', () => loadPoke(parseInt(el.dataset.evoId))));
  } catch (e) {
    evoBox.innerHTML = '<span style="color:#777; font-size:10px;">DNA ERROR</span>';
  }
}

function setupGallerySafe() {
  clearInterval(galleryTimer);
  const sp = state.curData.sprites;
  // GBA edition: animated pixel sprite leads, official artwork as second frame
  let imgs = state.isShiny
    ? [sp.animated_shiny || sp.front_shiny, sp.official_shiny].filter(i => i)
    : [sp.animated || sp.front_default, sp.official].filter(i => i);
  if (imgs.length === 0) imgs = [ITEM_SPRITE('poke-ball')];

  let idx = 0;
  document.getElementById('poke-sprite').src = imgs[idx];
  if (imgs.length > 1) {
    galleryTimer = setInterval(() => {
      idx = (idx + 1) % imgs.length;
      const el = document.getElementById('poke-sprite');
      el.style.transform = 'scale(0.95)';
      el.style.opacity = 0.5;
      setTimeout(() => { el.src = imgs[idx]; el.style.transform = 'scale(1)'; el.style.opacity = 1; }, 200);
    }, 4000);
  }
}

export function toggleShiny() {
  if (!state.isCatching && state.appMode === 'dex' && state.curData) {
    state.isShiny = !state.isShiny;
    setupGallerySafe();
    triggerVibration();
  }
}

export function randomPoke() {
  if (!state.isCatching && state.appMode === 'dex') loadPoke(Math.floor(Math.random() * MAX_POKEMON) + 1);
  triggerVibration();
}

export function nav(amt) {
  if (state.isCatching || state.appMode === 'battle') return;
  state.curId += amt;
  if (state.curId < 1) state.curId = MAX_POKEMON;
  if (state.curId > MAX_POKEMON) state.curId = 1;
  loadPoke(state.curId);
  triggerVibration();
}

export function toggleSheet() {
  if (state.isCatching || state.appMode === 'battle') return;
  document.getElementById('data-sheet').classList.toggle('open');
}
