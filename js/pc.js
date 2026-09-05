// ============================================================
// Pokédex OS — Bill's PC Box: gen tabs + ALL view, name search,
// TEAM strip with tap-to-promote lead, team picker for battles
// ============================================================

import { GENERATIONS, MAX_POKEMON, PIXEL_SPRITE, typeColors, typeEmoji } from './config.js';
import { getNameIndex, nameOf, getPokemon, evolutionOptions } from './api.js';
import { state, player, playerName, monLevel, setTeam, setLead, nickOf,
         isFavorite, toggleFavorite, MAX_FAVORITES } from './state.js';
import { loadPoke } from './dex.js';
import { triggerVibration, setCry, stopAllAudio, playCryAudio, sfx, haptic } from './audio.js';

let pcContext = 'dex';
let teamPick = [];
let currentGen = 1; // 1–5 or 'all'

// ============================================================
// v19.6 THE STICKER BOOK
// Same screen, same data, a second STRUCTURE (ROADMAP §3.8). ART cannot read a
// name, a number or a level, so in JUNIOR the collection view of the PC
// becomes a paper album of sprites: colour for what he owns, grey shadows for
// what he does not. `juniorBook` is the ONLY switch, and it is false for every
// other context and every non-junior profile — GABE's CRT is untouched.
// ============================================================
let juniorBook = false;
let stickerId = 0;
let freshStickers = [];
let seenStickers = new Set();
let holdWired = false;
let suppressNextSelect = false;

// WHICH STICKERS HAVE ALREADY POPPED — device-local, and deliberately NOT in
// the save. It is a per-device animation nicety: putting it in the save would
// grow the one localStorage key that holds both boys' entire collections, and
// would carry "already seen" across an AirDrop to a device that never showed
// the pop. Every access is wrapped — a failure here must never be fatal.
const SEEN_KEY = n => `pokedexos_stickers_seen_p${n}`;
function loadSeen(n) {
  try {
    const a = JSON.parse(localStorage.getItem(SEEN_KEY(n)));
    return new Set(Array.isArray(a) ? a.filter(x => Number.isInteger(x)) : []);
  } catch (e) { return new Set(); }   // private mode / corrupt: it pops again, harmless
}
function saveSeen(n, set) {
  try { localStorage.setItem(SEEN_KEY(n), JSON.stringify([...set])); }
  catch (e) { /* out of space: the pop repeats. Never fatal, and never the save. */ }
}

// The five generations wear their starter. "G3 47/135" is four facts ART
// cannot read; a Treecko is one he can.
const STARTER_OF = { 1: 1, 2: 152, 3: 252, 4: 387, 5: 495 };

export function openPC(context = 'dex') {
  if (state.isCatching) return;
  pcContext = context;
  // Only ART, and only the collection view. The team picker keeps the CRT for
  // both boys until v19.7 rebuilds it. The class lives on #pc-modal, not on
  // <body>, so a stale one can only ever affect a hidden modal.
  juniorBook = !!player().settings.junior && context === 'dex';
  const modal = document.getElementById('pc-modal');
  modal.classList.toggle('sticker-book', juniorBook);
  if (juniorBook) seenStickers = loadSeen(state.currentPlayer);
  const closeBtn = document.getElementById('close-pc-btn');
  document.getElementById('pc-title').innerText = `${playerName()}'S PC BOX`;
  document.getElementById('pc-search').value = '';

  const cancelBtn = document.getElementById('pc-cancel-btn');
  if (context === 'team') {
    teamPick = player().team.filter(id => player().caught.includes(id));
    if (teamPick.length === 0) teamPick = player().caught.slice(0, 6);
    closeBtn.innerText = '⚔️ START BATTLE';
    cancelBtn.style.display = 'block';
    updateTeamInstruction();
  } else {
    document.getElementById('pc-instruction').innerText = '';
    // A pre-reader cannot find the way out of a screen labelled CLOSE PC.
    closeBtn.innerText = juniorBook ? '🔙' : 'CLOSE PC';
    cancelBtn.style.display = 'none';
  }

  // warm the name index, then re-render so names + search appear
  // Not inside the sticker book. The book renders no names and has no search,
  // so this second render buys ART nothing — and it lands in a MICROTASK,
  // before the browser has painted once, replacing every .sticker-new element
  // the pop animation is attached to. commitFreshStickers() has already
  // written those ids to the seen key, so the pop would be destroyed one frame
  // in and could never fire again: the chime would play over a page where
  // nothing moved. The pop IS the reward for catching something new.
  getNameIndex().then(idx => { if (idx && !juniorBook) renderGrid(); });

  renderFavShelf();
  renderTeamStrip();
  renderGenTabs();
  renderGrid();
  renderEvolveRow();
  wireTileHold();
  modal.style.display = 'flex';
}

// ============================================================
// v19.8 — READY TO EVOLVE
// awardPartyXp has levelled the WHOLE team since teams shipped, but only the
// KO'er's evolution was ever queued: five team members could sit twenty levels
// past their evolution for ever with nothing in the game ever mentioning it.
// The row is one picture button per ready Pokémon — sprite ▶ sprite — so it
// needs no reading, and it does not exist at all when nothing is ready.
// Six lookups, all served from the api cache for anything the boys have
// actually played with; offline it silently renders nothing.
// ============================================================
let evoToken = 0;
async function renderEvolveRow() {
  const row = document.getElementById('pc-evolve');
  if (!row) return;
  // Clear FIRST: a stale row from the previous player is worse than no row.
  row.innerHTML = '';
  const token = ++evoToken;
  if (pcContext !== 'dex') return;
  const p = player();
  const team = p.team.filter(id => p.caught.includes(id));
  const ready = [];
  for (const id of team) {
    try {
      const opts = await evolutionOptions(id, monLevel(id));
      if (token !== evoToken) return;          // he switched player or closed it
      // Only offer what he does not already own. Evolving into something
      // already in the box is not a discovery, and the row would never clear.
      const next = opts.filter(o => !p.caught.includes(o.id));
      if (next.length) ready.push({ id, next });
    } catch (e) { /* offline or uncached: no row, and never an error on screen */ }
  }
  if (token !== evoToken || !ready.length) return;
  row.innerHTML = '<span class="evo-ready-label">⬆️ READY TO EVOLVE</span>' + ready.map(r =>
    `<button class="evo-ready" data-evo-from="${r.id}" title="${nameOf(r.id)} can evolve" aria-label="EVOLVE">
       <img src="${PIXEL_SPRITE(r.id)}" alt="">
       <span class="evo-ready-arrow" aria-hidden="true">▶</span>
       ${r.next.length > 1
          ? '<span class="evo-ready-many" aria-hidden="true">❓</span>'
          : `<img src="${PIXEL_SPRITE(r.next[0].id)}" alt="">`}
     </button>`).join('');
  row.querySelectorAll('.evo-ready').forEach(el =>
    el.addEventListener('click', () => {
      triggerVibration(30);
      // battle.js owns the ceremony and battle.js already imports this module,
      // so the request travels as an event rather than a circular import.
      document.dispatchEvent(new CustomEvent('evolve-request', { detail: { id: parseInt(el.dataset.evoFrom, 10) } }));
    }));
}

/** Repaint the open box. A no-op when the PC is not on screen. */
export function refreshPC() {
  const modal = document.getElementById('pc-modal');
  if (!modal || modal.style.display !== 'flex') return;
  renderFavShelf();
  renderTeamStrip();
  renderGenTabs();
  renderGrid();
  renderEvolveRow();
}

// ---- TEAM strip: current party in order; tap a member to make it lead ----
function renderTeamStrip() {
  const strip = document.getElementById('team-strip');
  if (pcContext !== 'dex') { strip.style.display = 'none'; return; }
  const team = player().team.filter(id => player().caught.includes(id));
  if (team.length === 0) { strip.style.display = 'none'; return; }

  strip.style.display = 'flex';
  // 'TAP = LEAD' at the 8px floor is the same width the 5px caption used to
  // be, so the team strip still shows the same number of sprites.
  strip.innerHTML = `<span class="team-strip-label">TEAM<small>TAP = LEAD</small></span>` +
    team.map((id, i) => `
      <div class="team-slot ${i === 0 ? 'lead' : ''}" data-team-id="${id}" title="${nameOf(id)} — tap to make it your lead">
        ${i === 0 ? '<em>★</em>' : ''}
        <img src="${PIXEL_SPRITE(id)}">
        <small>Lv${monLevel(id)}</small>
      </div>`).join('');

  strip.querySelectorAll('.team-slot').forEach(el =>
    el.addEventListener('click', () => {
      setLead(parseInt(el.dataset.teamId));
      document.dispatchEvent(new CustomEvent('team-changed'));
      triggerVibration(30);
      renderTeamStrip();
    }));
}

// ---- gen tabs (+ ALL) ----
function caughtInGen(g) {
  return player().caught.filter(id => id >= g.from && id <= g.to).length;
}

// The book's tabs: five starter sprites and 📖 for everything, no counts and
// no labels. Nothing here renders a text node, so the 8px floor cannot be hit.
function renderStickerTabs(tabs) {
  tabs.innerHTML = GENERATIONS.map(g =>
    `<button class="gen-tab sticker-tab ${g.key === currentGen ? 'active' : ''}" data-gen="${g.key}" aria-label="GEN ${g.key}">
       <img src="${PIXEL_SPRITE(STARTER_OF[g.key])}" alt="">
     </button>`).join('') +
    `<button class="gen-tab sticker-tab ${currentGen === 'all' ? 'active' : ''}" data-gen="all" aria-label="EVERY STICKER">
       <span class="sticker-tab-all">📖</span>
     </button>`;
  tabs.querySelectorAll('.gen-tab').forEach(el =>
    el.addEventListener('click', () => {
      currentGen = el.dataset.gen === 'all' ? 'all' : parseInt(el.dataset.gen);
      renderGenTabs();
      renderGrid();
      triggerVibration(15);
    }));
}

function renderGenTabs() {
  const tabs = document.getElementById('gen-tabs');
  if (juniorBook) { renderStickerTabs(tabs); return; }
  tabs.innerHTML =
    GENERATIONS.map(g =>
      `<button class="gen-tab ${g.key === currentGen ? 'active' : ''}" data-gen="${g.key}" title="Generation ${g.key}: #${g.from}–#${g.to}">
         ${g.label}<small>${caughtInGen(g)}/${g.to - g.from + 1}</small>
       </button>`).join('') +
    `<button class="gen-tab ${currentGen === 'all' ? 'active' : ''}" data-gen="all" title="Every Pokémon in one scroll">
       ALL<small>${player().caught.length}/${MAX_POKEMON}</small>
     </button>`;
  tabs.querySelectorAll('.gen-tab').forEach(el =>
    el.addEventListener('click', () => {
      currentGen = el.dataset.gen === 'all' ? 'all' : parseInt(el.dataset.gen);
      renderGenTabs();
      renderGrid();
    }));
}

// ---- grid ----
function matchesSearch(id, q) {
  if (!q) return true;
  if (String(id).includes(q) || String(id).padStart(3, '0').includes(q)) return true;
  const name = nameOf(id);
  return name && name.includes(q);
}

function itemHtml(id, caught) {
  const lvl = caught ? `<em class="pc-lvl">Lv${monLevel(id)}</em>` : '';
  const picked = pcContext === 'team' && teamPick.includes(id) ? ' picked' : '';
  const order = pcContext === 'team' && teamPick.includes(id) ? `<b class="pc-order">${teamPick.indexOf(id) + 1}</b>` : '';
  const nick = caught ? nickOf(id) : null;
  const nm = nick || nameOf(id);
  const nameLine = nm.startsWith('#') ? '' : `<i class="pc-name${nick ? ' nicked' : ''}">${nm}</i>`;
  const shiny = caught && player().shinies.includes(id) ? '<b class="pc-shiny">✨</b>' : '';
  // v19.6: the favourite star goes BOTTOM-right. Top-left is already the
  // team-pick order badge and top-right is the shiny sparkle, so the third
  // mark takes the fourth corner instead of stacking on a taken one.
  const fav = caught && isFavorite(id) ? '<b class="pc-fav">★</b>' : '';
  return `<div class="pc-item${caught ? '' : ' uncaught'}${picked}" data-pc-id="${id}">
    ${order}${shiny}${fav}<img src="${PIXEL_SPRITE(id)}" loading="lazy">
    <span>#${id.toString().padStart(3, '0')}</span>${nameLine}${lvl}
  </div>`;
}

// A sticker is a sprite and nothing else — no id, no name, no level, no text
// node anywhere in it. Uncaught ones are dimmed grey shadows, never blanks:
// a shadow says "this one exists and you can still get it".
function stickerHtml(id, caught) {
  const fresh = caught && !seenStickers.has(id);
  if (fresh) freshStickers.push(id);
  return `<div class="pc-item sticker${caught ? '' : ' uncaught'}${fresh ? ' sticker-new' : ''}" data-pc-id="${id}">
    <img src="${PIXEL_SPRITE(id)}" loading="lazy" alt="">${caught && isFavorite(id) ? '<b class="pc-fav">★</b>' : ''}
  </div>`;
}

// A sticker pops ONCE. Marking happens straight after the render that showed
// it, which is the moment he is looking at it.
function commitFreshStickers() {
  if (!juniorBook || !freshStickers.length) return;
  freshStickers.forEach(id => seenStickers.add(id));
  saveSeen(state.currentPlayer, seenStickers);
  sfx.newSticker();
  freshStickers = [];
}

function renderGrid() {
  const grid = document.getElementById('pc-grid');
  const q = document.getElementById('pc-search').value.trim().toLowerCase();
  const activeCaught = player().caught;

  // an active search looks across ALL generations
  let from = 1, to = MAX_POKEMON;
  if (!q && currentGen !== 'all') {
    const g = GENERATIONS.find(x => x.key === currentGen);
    from = g.from; to = g.to;
  }

  let html = '';
  freshStickers = [];
  for (let i = from; i <= to; i++) {
    if (!matchesSearch(i, q)) continue;
    const caught = activeCaught.includes(i);
    if (!caught && pcContext !== 'dex') continue;
    html += juniorBook ? stickerHtml(i, caught) : itemHtml(i, caught);
  }
  if (html) {
    grid.innerHTML = html;
  } else {
    grid.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'pc-empty';
    if (juniorBook) {
      // Unreachable in practice (the book always renders all 649 slots and
      // has no search) but a sentence must never be the fallback for ART.
      empty.innerHTML = '<span class="pc-empty-glyph">📖</span>';
    } else {
      empty.textContent = q
        ? `NO MATCHES FOR "${q.toUpperCase()}"`
        : 'NOTHING CAUGHT HERE YET — GO EXPLORE!';
    }
    grid.appendChild(empty);
  }
  grid.querySelectorAll('.pc-item').forEach(el =>
    el.addEventListener('click', () => handlePCSelect(parseInt(el.dataset.pcId), el)));
  commitFreshStickers();
}

export function onPCSearchInput() {
  renderGrid();
}

function updateTeamInstruction() {
  document.getElementById('pc-instruction').innerText =
    `PICK YOUR TEAM IN ORDER — ${teamPick.length}/6 (1st = LEAD)`;
}

function handlePCSelect(id, el) {
  // The click that follows a completed tap-and-hold is not a tap.
  if (suppressNextSelect) return;
  if (juniorBook) { openSticker(id, el); return; }
  if (pcContext === 'dex') {
    document.getElementById('pc-modal').style.display = 'none';
    loadPoke(id);
  } else if (pcContext === 'team') {
    if (teamPick.includes(id)) {
      teamPick = teamPick.filter(t => t !== id);
    } else if (teamPick.length < 6) {
      teamPick.push(id);
    }
    updateTeamInstruction();
    renderGrid(); // re-render to refresh order badges
  }
}

export function closePC() {
  if (pcContext === 'team') {
    if (teamPick.length === 0) {
      document.getElementById('pc-instruction').innerText = 'PICK AT LEAST 1 POKÉMON!';
      return;
    }
    setTeam(teamPick);
    document.dispatchEvent(new CustomEvent('team-changed'));
    document.getElementById('pc-modal').style.display = 'none';
    document.dispatchEvent(new CustomEvent('team-confirmed'));
    return;
  }
  document.getElementById('pc-modal').style.display = 'none';
}

export function cancelTeamPick() {
  if (pcContext === 'team') {
    pcContext = 'dex';
    document.getElementById('pc-modal').style.display = 'none';
    document.dispatchEvent(new CustomEvent('pc-battle-cancelled'));
  }
}

// ============================================================
// v19.6 — the shelf, the close-up, and tap-and-hold
// ============================================================

// Six slots, always six, dashed when empty. An empty slot is an invitation;
// a shelf that grows and shrinks is a puzzle.
function renderFavShelf() {
  const shelf = document.getElementById('fav-shelf');
  if (!shelf) return;
  if (!juniorBook) { shelf.innerHTML = ''; return; }
  const p = player();
  const favs = (p.favorites || []).filter(id => p.caught.includes(id));
  shelf.innerHTML = Array.from({ length: MAX_FAVORITES }, (_, i) => {
    const id = favs[i];
    return id
      ? `<div class="fav-slot filled" data-fav-id="${id}"><img src="${PIXEL_SPRITE(id)}" alt=""></div>`
      : '<div class="fav-slot"></div>';
  }).join('');
  shelf.querySelectorAll('.fav-slot.filled').forEach(el =>
    el.addEventListener('click', () => openSticker(parseInt(el.dataset.favId, 10))));
}

// A full shelf WOBBLES. It never says no, it never posts a message, and it
// never quietly evicts the favourite he picked first.
function wobble(el) {
  if (!el) return;
  el.classList.remove('wobble');
  void el.offsetWidth;                 // restart the animation
  el.classList.add('wobble');
  setTimeout(() => el.classList.remove('wobble'), 500);
  triggerVibration(15);
}

function syncStickerFav() {
  const btn = document.getElementById('sticker-fav');
  if (!btn) return;
  const on = isFavorite(stickerId);
  btn.textContent = on ? '★' : '☆';
  btn.classList.toggle('on', on);
}

// Tap a sticker you own: a big sprite, its types as coloured picture chips,
// and its voice.
async function openSticker(id, el) {
  if (el && el.classList.contains('uncaught')) {
    // B-036. This was a 320ms 5px shake in steps(3) — over before a four-year-
    // old had finished taking his finger off the glass, which is why it read as
    // a dead button rather than an answer. A pre-reader's entire vocabulary for
    // "tell me about this" is poking the picture, so the poke has to answer.
    // It now LIFTS and lets the shadow peek at its real colours for a beat
    // before settling back: not a refusal, a promise. Nothing is taken away and
    // nothing says he failed — there is no red, no buzz, and no words.
    el.classList.remove('tease');
    void el.offsetWidth;                 // restart the animation on a fast re-tap
    el.classList.add('tease');
    haptic('select');
    sfx.notYet();
    setTimeout(() => el.classList.remove('tease'), 900);
    return;
  }
  const modal = document.getElementById('sticker-modal');
  if (!modal) return;
  stickerId = id;
  document.getElementById('sticker-sprite').src = PIXEL_SPRITE(id);
  document.getElementById('sticker-types').innerHTML = '';
  syncStickerFav();
  modal.style.display = 'flex';
  triggerVibration(20);
  stopAllAudio();
  try {
    const d = await getPokemon(id);
    if (stickerId !== id) return;      // he tapped another sticker while this loaded
    document.getElementById('sticker-types').innerHTML = (d.types || []).map(t => {
      const n = t.type?.name || 'normal';
      return `<span class="sticker-type" style="background:${typeColors[n] || '#777'}">${typeEmoji[n] || '❔'}</span>`;
    }).join('');
    setCry(d.cries?.latest);
    playCryAudio(id);
  } catch (e) {
    // Offline and uncached: the sticker still shows and it still makes a
    // sound. Silence is the one outcome ART would read as "broken".
    setCry(null);
    playCryAudio(id);
  }
}

export function closeSticker() {
  const modal = document.getElementById('sticker-modal');
  if (modal) modal.style.display = 'none';
  stopAllAudio();
  // setCry writes ONE module-global that dex.js also owns. Without handing it
  // back, the home screen's CRY chip played the last STICKER's cry instead of
  // the Pokémon on screen — and to a pre-reader the sound IS the identity, so
  // a Pikachu making a Metapod noise is simply the app being broken, with no
  // words available to report it.
  if (state.curData) setCry(state.curData.cries?.latest, state.curData);
  stickerId = 0;
}

export function toggleStickerFav() {
  if (!stickerId) return;
  const r = toggleFavorite(stickerId);
  if (r === 'full') {
    // The shelf is behind this modal, so wobble the star he actually pressed
    // AND the shelf he will see when he closes it.
    wobble(document.getElementById('sticker-fav'));
    wobble(document.getElementById('fav-shelf'));
    return;
  }
  if (r === 'unowned') return;
  syncStickerFav();
  renderFavShelf();
  renderGrid();
  triggerVibration(30);
  sfx.star();
}

// GABE's route to the same shelf: press and hold a tile you own. Delegated
// ONCE on the grid — 649 per-tile pointer listeners would be a real cost on a
// phone — and never armed inside the book or the team picker.
function wireTileHold() {
  if (holdWired) return;
  const grid = document.getElementById('pc-grid');
  if (!grid) return;
  holdWired = true;
  let timer = null;
  const clear = () => { clearTimeout(timer); timer = null; };
  grid.addEventListener('pointerdown', e => {
    if (juniorBook || pcContext !== 'dex') return;
    const tile = e.target.closest('.pc-item');
    if (!tile || tile.classList.contains('uncaught')) return;
    const id = parseInt(tile.dataset.pcId, 10);
    clear();
    timer = setTimeout(() => {
      timer = null;
      // The hold re-renders the grid, so the click that would have consumed
      // this flag may never arrive. It clears itself on a timer instead.
      suppressNextSelect = true;
      setTimeout(() => { suppressNextSelect = false; }, 400);
      const r = toggleFavorite(id);
      if (r === 'full') { wobble(tile); return; }
      if (r === 'unowned') return;
      triggerVibration(30);
      sfx.star();
      renderGrid();
    }, 600);
  }, { passive: true });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
    grid.addEventListener(ev, clear, { passive: true });
  }
}
