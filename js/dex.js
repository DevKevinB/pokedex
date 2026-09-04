// ============================================================
// Pokédex OS — main dex screen: load, display, evolutions, gallery
// ============================================================

import { MAX_POKEMON, typeColors, typeEmoji, inkFor, ITEM_SPRITE, PIXEL_SPRITE } from './config.js';
import { getPokemon, getSpecies, getEvolution } from './api.js';
import { state, player } from './state.js';
import { stopAllAudio, setCry, haptic, isMuted, audioUnlocked, playCryAudio } from './audio.js';
import { pxReveal } from './fx.js';
import { habitatsOf, openExploreAt } from './explore.js';

let galleryTimer = null;
let typeTimer = null;

// ---- v19.7: the entry CYCLES ----
// api.js has been caching SIX flavor texts per species since it shipped and
// only the first was ever shown. Tap the entry for the next one; a row of dots
// says how many there are and which one you are on. It wraps forever — nothing
// is ever used up. (The data sheet is hidden in Junior Mode, so this is GABE's
// feature and costs ART nothing.)
let flavorTexts = [];
let flavorIdx = 0;

function renderFlavor() {
  typeText(document.getElementById('desc'), flavorTexts[flavorIdx] || 'No data.');
  const dots = document.getElementById('desc-dots');
  if (!dots) return;
  dots.innerHTML = flavorTexts.length > 1
    ? flavorTexts.map((_, i) => `<i class="${i === flavorIdx ? 'on' : ''}"></i>`).join('')
    : '';
}

/** Tap the Pokédex entry for the next cached text. */
export function cycleFlavor() {
  if (state.isCatching || state.appMode === 'battle') return;
  if (flavorTexts.length < 2) return;
  flavorIdx = (flavorIdx + 1) % flavorTexts.length;
  renderFlavor();
  haptic('select');
}

// v19.7: the dex ANSWERS. When a scan finishes, the Pokémon says its name in
// its own voice — the real cry where the browser can decode one, the
// synthesised chiptune cry on Safari, both already built in audio.js. This is
// a SOUND EFFECT and never speech. Gated three ways so it can never surprise
// anyone: only on the dex screen, only when sound is on, and only once the
// AudioContext is actually running (i.e. after a real tap). emitCry()'s own
// 400ms floor is what stops a mashed ◀▶ from stacking cries.
function maybeAutoCry(forId) {
  if (state.curId !== forId) return;
  if (state.appMode !== 'dex' || state.isCatching) return;
  if (isMuted() || !audioUnlocked()) return;
  playCryAudio();
}

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
// PHOTOSENSITIVITY: the wipe is a full-screen black sweep and loadPoke() fires
// one on every dex navigation, so holding down the arrows strobed the whole
// screen at tap speed — inside the 3-49Hz band the seizure guidelines warn
// about, on the screen a bored child is most likely to drum on. One wipe per
// 700ms (1.4Hz) is the ceiling. Extra taps still load their Pokemon; they just
// do not each get their own flash.
const WIPE_MIN_GAP_MS = 700;
let lastWipeAt = 0;

export function screenWipe() {
  const w = document.getElementById('screen-wipe');
  if (!w) return;
  const now = Date.now();
  if (now - lastWipeAt < WIPE_MIN_GAP_MS) return;
  lastWipeAt = now;
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
  // v19.5.4: this used to be a bare 600ms wall clock. The caption is painted
  // the instant the JSON resolves (0ms on a species already in the cache — the
  // boys' normal case), and an <img> keeps showing its LAST decoded frame while
  // a new src is in flight, so the timer uncovered SANDSHREW under the words
  // NO. 0028 SANDSLASH, with CATCH live on it. For ART the picture IS the name.
  // 600ms is now a MINIMUM: the reveal also waits for the bitmap to decode, and
  // a later tap's navigation cancels this one's reveal instead of racing it.
  const spEl = document.getElementById('poke-sprite');
  const forId = state.curId;
  const decoded = (spEl.complete && spEl.naturalWidth > 0)
    ? Promise.resolve()
    : new Promise(res => {
        // One controller, so whichever of load/error fires tears down BOTH
        // listeners and the timer. #poke-sprite is a single long-lived
        // element and the dex is navigated hundreds of times a session, so a
        // listener left behind per navigation is a real leak.
        const ac = new AbortController();
        let t;
        const fin = () => { ac.abort(); clearTimeout(t); res(); };
        spEl.addEventListener('load', fin, { signal: ac.signal });
        spEl.addEventListener('error', fin, { signal: ac.signal });
        t = setTimeout(fin, 2500);   // a dead sprite URL must never hide the dex
      });
  Promise.all([decoded, new Promise(res => setTimeout(res, 600))]).then(() => {
    if (state.curId !== forId) return;   // a later tap owns the screen now
    setScanning(false);
    spEl.style.opacity = 1;
    pxReveal(spEl);   // six chunky columns, not a cross-fade
    maybeAutoCry(forId);
  });
}

function updateUISafe() {
  const d = state.curData, s = state.curSpeciesData;
  try {
    // v19.7: is_legendary / is_mythical have been sitting in the species cache
    // since api.js:70 with ZERO consumers. A gold ribbon and a gold glow are the
    // two ways to say "this one is special" without a sentence. The ribbon is
    // pinned inside .img-container and adds no height, because .identity's 81px
    // is load-bearing in the junior 375x667 height contract.
    const legend = s?.is_mythical ? '★ MYTHICAL' : s?.is_legendary ? '★ LEGENDARY' : '';
    const ribbon = document.getElementById('dex-ribbon');
    if (ribbon) { ribbon.textContent = legend; ribbon.style.display = legend ? 'block' : 'none'; }

    const typeColor = typeColors[d.types?.[0]?.type?.name] || '#777';
    const glowColor = legend ? '#ffd040' : typeColor;
    document.getElementById('bg-glow').style.background = `radial-gradient(circle, ${glowColor}66 0%, transparent 70%)`;
    document.getElementById('app-body').style.setProperty('--type-glow', `${typeColor}42`);
    document.getElementById('id-text').innerText = `NO. ${d.id.toString().padStart(4, '0')}`;
    document.getElementById('poke-name').innerText = d.name;
    document.getElementById('poke-name').style.fontSize = d.name.length > 12 ? '24px' : '32px';
    document.getElementById('ht').innerText = `${(d.height || 0) / 10}m`;
    document.getElementById('wt').innerText = `${(d.weight || 0) / 10}kg`;
    document.getElementById('base-exp').innerText = d.base_experience || '--';
    document.getElementById('genus').innerText = s?.genus || 'Unknown';

    flavorTexts = (s?.flavor_texts || []).filter(t => t && t.trim());
    if (!flavorTexts.length) flavorTexts = ['No data.'];
    flavorIdx = 0;
    renderFlavor();

    // B-010: this chip used to be the bare word POISON on a purple pill with
    // no colour of its own, so it inherited body{color:white} — white on
    // electric #eed535 measures about 1.5:1, which is unreadable for anyone
    // and invisible for ART, who cannot read the word either way. Two fixes,
    // both using helpers that already existed and were already used together
    // in battle.js for the move tiles:
    //   typeEmoji — the SAME glyph he already knows from the battle buttons,
    //               so the chip means something to him without the word
    //   inkFor    — picks black or white by MEASURING contrast against this
    //               chip's own background, rather than assuming white
    // The word stays for GABE, who reads it. Nothing is taken away.
    const typeTags = (d.types || []).map(t => {
      // Whitelisted against typeColors, which IS the closed 18-key table of real
      // types, so nothing from the network reaches an HTML attribute or a text
      // node unless it is one of eighteen known words. Same boundary-sanitising
      // shape state.js uses for player names.
      const name = typeColors[t.type?.name] ? t.type.name : 'normal';
      const bg = typeColors[name];
      // .tags is a flex container, so whitespace between these spans never
      // becomes a flex item -- ordinary indentation is safe here.
      return `<span class="tag" data-type="${name}" style="background:${bg}; color:${inkFor(bg)};">
        <span class="tag-ico" aria-hidden="true">${typeEmoji[name]}</span>
        <span class="tag-name">${name}</span>
      </span>`;
    }).join('');
    // WHERE DOES IT LIVE? A picture of the place, beside the pictures of its
    // types, that opens the map ON that place. It ADDS a route and takes
    // nothing away: the EXPLORE tile is untouched and nothing on the dex is
    // gated behind having tapped this.
    const home = (habitatsOf(d.id).find(h => !h.championOnly || player().champion) || habitatsOf(d.id)[0]);
    const homeChip = home
      ? `<button type="button" class="tag habitat-chip" data-habitat="${home.key}" title="${home.name}" aria-label="${home.name}">${home.emoji}</button>`
      : '';
    const typesEl = document.getElementById('types');
    typesEl.innerHTML = typeTags + homeChip;
    typesEl.querySelector('.habitat-chip')?.addEventListener('click', e => {
      e.stopPropagation();
      haptic('select');
      openExploreAt(home.key);
    });
    document.getElementById('abilities').innerHTML = (d.abilities || [])
      .map(a => a.ability?.name?.replace('-', ' ')).join('<br>');

    const maxStat = 255;
    document.getElementById('stats-area').innerHTML = (d.stats || []).map(st => {
      // Six three-letter labels (ROADMAP §3.7). At the 8px floor 'DEFENSE'
      // no longer fits the 50px column in Press Start 2P, and the rule is
      // shorten-or-remove, never shrink.
      const SHORT = { HP: 'HP', ATTACK: 'ATK', DEFENSE: 'DEF',
                      'SPECIAL-ATTACK': 'SPA', 'SPECIAL-DEFENSE': 'SPD', SPEED: 'SPE' };
      const rawName = st.stat?.name?.toUpperCase() || 'STAT';
      const statName = SHORT[rawName] || rawName.replace('SPECIAL-', 'SP. ');
      const percent = ((st.base_stat || 0) / maxStat) * 100;
      // Tokens, not hexes (ROADMAP §3.1). The stepped fill comes from the
      // .stat-bar-fill transition, shared with the battle HP bar.
      const barColor = st.base_stat > 90 ? 'var(--green)' : st.base_stat > 50 ? 'var(--gold)' : 'var(--red)';
      return `<div class="stat-row"><div class="stat-name">${statName}</div><div class="stat-val">${st.base_stat || 0}</div><div class="stat-bar-bg"><div class="stat-bar-fill" style="width: ${percent}%; background: ${barColor}"></div></div></div>`;
    }).join('');

    // The slim record travels with the URL: on Safari, where the .ogg cannot
    // play at all, audio.js builds this species' cry out of its stats instead.
    setCry(d.cries?.latest, d);
  } catch (e) { console.error('UI Update Failed', e); }
}

async function loadEvolutionsSafe(url) {
  const evoBox = document.getElementById('evo-chain');
  evoBox.innerHTML = '<span class="evo-msg">ANALYZING DNA...</span>';
  if (!url) { evoBox.innerHTML = '<span class="evo-msg">NO DATA</span>'; return; }
  try {
    const { chain } = await getEvolution(url);
    const ok = (chain || []).filter(p => p.id <= MAX_POKEMON);
    // v19.8: a chain is a FAN, not a line. Each STAGE is one row, and a stage
    // with eight children (Eevee) wraps inside its own row instead of losing
    // seven of them. A root is anything with no parent, or whose parent got
    // filtered out for being outside #1-649.
    const rows = [];
    const placed = new Set();
    let stage = ok.filter(p => p.from == null || !ok.some(q => q.id === p.from));
    // The bound is a guard, not a limit: no real line is six stages deep, and
    // it means a cyclic chain can never hang the dex screen.
    while (stage.length && rows.length < 6) {
      stage.forEach(p => placed.add(p.id));
      rows.push(stage);
      const ids = new Set(stage.map(p => p.id));
      stage = ok.filter(p => ids.has(p.from) && !placed.has(p.id));
    }
    evoBox.innerHTML = rows.map((row, i) =>
      `${i > 0 ? '<div class="evo-arrow">▼</div>' : ''}<div class="evo-row">` +
      row.map(poke =>
        `<div class="evo-item${poke.id === state.curId ? ' current' : ''}" data-evo-id="${poke.id}"><img src="${PIXEL_SPRITE(poke.id)}"><span>${poke.name}</span></div>`
      ).join('') + '</div>').join('');
    evoBox.querySelectorAll('.evo-item').forEach(el =>
      el.addEventListener('click', () => loadPoke(parseInt(el.dataset.evoId))));
  } catch (e) {
    evoBox.innerHTML = '<span class="evo-msg">DNA ERROR</span>';
  }
}

function setupGallerySafe() {
  clearInterval(galleryTimer);
  const sp = state.curData.sprites;
  // GBA edition: animated pixel sprite leads, official artwork as second frame
  // v19.4: official artwork is gone from the gallery, so the 4-second blink
  // never starts — a sprite that changes on its own every four seconds is
  // motion nobody asked for, on the screen the boys sit on longest. With one
  // image the interval below is never created at all.
  let imgs = state.isShiny
    ? [sp.animated_shiny || sp.front_shiny].filter(i => i)
    : [sp.animated || sp.front_default].filter(i => i);
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
    haptic('select');
  }
}

export function randomPoke() {
  if (!state.isCatching && state.appMode === 'dex') loadPoke(Math.floor(Math.random() * MAX_POKEMON) + 1);
  haptic('select');
}

export function nav(amt) {
  if (state.isCatching || state.appMode === 'battle') return;
  state.curId += amt;
  if (state.curId < 1) state.curId = MAX_POKEMON;
  if (state.curId > MAX_POKEMON) state.curId = 1;
  loadPoke(state.curId);
  haptic('select');   // nav() is also reached by SWIPE, which the tap listener never sees
}

export function toggleSheet() {
  if (state.isCatching || state.appMode === 'battle') return;
  // v19.6: hidden entirely in JUNIOR. #data-btn and the handle are both
  // unreachable there, but the rule lives here so it cannot be reintroduced
  // by a future caller.
  if (player().settings.junior) return;
  document.getElementById('data-sheet').classList.toggle('open');
}
