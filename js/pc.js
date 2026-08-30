// ============================================================
// Pokédex OS — Bill's PC Box: gen tabs + ALL view, name search,
// TEAM strip with tap-to-promote lead, team picker for battles
// ============================================================

import { GENERATIONS, MAX_POKEMON, PIXEL_SPRITE } from './config.js';
import { getNameIndex, nameOf } from './api.js';
import { state, player, playerName, monLevel, setTeam, setLead, nickOf } from './state.js';
import { loadPoke } from './dex.js';
import { triggerVibration } from './audio.js';

let pcContext = 'dex';
let teamPick = [];
let currentGen = 1; // 1–5 or 'all'

export function openPC(context = 'dex') {
  if (state.isCatching) return;
  pcContext = context;
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
    closeBtn.innerText = 'CLOSE PC';
    cancelBtn.style.display = 'none';
  }

  // warm the name index, then re-render so names + search appear
  getNameIndex().then(idx => { if (idx) { renderGrid(); } });

  renderTeamStrip();
  renderGenTabs();
  renderGrid();
  document.getElementById('pc-modal').style.display = 'flex';
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

function renderGenTabs() {
  const tabs = document.getElementById('gen-tabs');
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
  return `<div class="pc-item${caught ? '' : ' uncaught'}${picked}" data-pc-id="${id}">
    ${order}${shiny}<img src="${PIXEL_SPRITE(id)}" loading="lazy">
    <span>#${id.toString().padStart(3, '0')}</span>${nameLine}${lvl}
  </div>`;
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
  for (let i = from; i <= to; i++) {
    if (!matchesSearch(i, q)) continue;
    const caught = activeCaught.includes(i);
    if (!caught && pcContext !== 'dex') continue;
    html += itemHtml(i, caught);
  }
  if (html) {
    grid.innerHTML = html;
  } else {
    grid.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'pc-empty';
    empty.textContent = q
      ? `NO MATCHES FOR "${q.toUpperCase()}"`
      : 'NOTHING CAUGHT HERE YET — GO EXPLORE!';
    grid.appendChild(empty);
  }
  grid.querySelectorAll('.pc-item').forEach(el =>
    el.addEventListener('click', () => handlePCSelect(parseInt(el.dataset.pcId), el)));
}

export function onPCSearchInput() {
  renderGrid();
}

function updateTeamInstruction() {
  document.getElementById('pc-instruction').innerText =
    `PICK YOUR TEAM IN ORDER — ${teamPick.length}/6 (1st = LEAD)`;
}

function handlePCSelect(id, el) {
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
