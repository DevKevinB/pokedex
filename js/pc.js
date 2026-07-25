// ============================================================
// Pokédex OS — Bill's PC Box with generation tabs, team picker
// ============================================================

import { GENERATIONS, PIXEL_SPRITE } from './config.js';
import { state, player, playerName, monLevel, setTeam } from './state.js';
import { loadPoke } from './dex.js';

let pcContext = 'dex';
let teamPick = [];
let currentGen = 1;

export function openPC(context = 'dex') {
  if (state.isCatching) return;
  pcContext = context;
  const closeBtn = document.getElementById('close-pc-btn');
  document.getElementById('pc-title').innerText = `${playerName()}'S PC BOX`;

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

  renderGenTabs();
  renderGrid();
  document.getElementById('pc-modal').style.display = 'flex';
}

function caughtInGen(g) {
  return player().caught.filter(id => id >= g.from && id <= g.to).length;
}

function renderGenTabs() {
  const tabs = document.getElementById('gen-tabs');
  tabs.innerHTML = GENERATIONS.map(g =>
    `<button class="gen-tab ${g.key === currentGen ? 'active' : ''}" data-gen="${g.key}" title="Generation ${g.key}: #${g.from}–#${g.to}">
       ${g.label}<small>${caughtInGen(g)}/${g.to - g.from + 1}</small>
     </button>`).join('');
  tabs.querySelectorAll('.gen-tab').forEach(el =>
    el.addEventListener('click', () => { currentGen = parseInt(el.dataset.gen); renderGenTabs(); renderGrid(); }));
}

function renderGrid() {
  const grid = document.getElementById('pc-grid');
  const g = GENERATIONS.find(x => x.key === currentGen);
  const activeCaught = player().caught;
  let html = '';
  for (let i = g.from; i <= g.to; i++) {
    const caught = activeCaught.includes(i);
    if (!caught && pcContext !== 'dex') continue;
    const lvl = caught ? `<em class="pc-lvl">Lv${monLevel(i)}</em>` : '';
    const picked = pcContext === 'team' && teamPick.includes(i) ? ' picked' : '';
    html += `<div class="pc-item${caught ? '' : ' uncaught'}${picked}" data-pc-id="${i}">
      <img src="${PIXEL_SPRITE(i)}" loading="lazy">
      <span>#${i.toString().padStart(3, '0')}</span>${lvl}
    </div>`;
  }
  grid.innerHTML = html || '<div class="pc-empty">NOTHING CAUGHT IN THIS GENERATION YET — GO EXPLORE!</div>';
  grid.querySelectorAll('.pc-item').forEach(el =>
    el.addEventListener('click', () => handlePCSelect(parseInt(el.dataset.pcId), el)));
}

function updateTeamInstruction() {
  document.getElementById('pc-instruction').innerText =
    `PICK YOUR TEAM — ${teamPick.length}/6 SELECTED`;
}

function handlePCSelect(id, el) {
  if (pcContext === 'dex') {
    document.getElementById('pc-modal').style.display = 'none';
    loadPoke(id);
  } else if (pcContext === 'team') {
    if (teamPick.includes(id)) {
      teamPick = teamPick.filter(t => t !== id);
      el.classList.remove('picked');
    } else if (teamPick.length < 6) {
      teamPick.push(id);
      el.classList.add('picked');
    }
    updateTeamInstruction();
  }
}

export function closePC() {
  if (pcContext === 'team') {
    if (teamPick.length === 0) {
      document.getElementById('pc-instruction').innerText = 'PICK AT LEAST 1 POKÉMON!';
      return;
    }
    setTeam(teamPick);
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
