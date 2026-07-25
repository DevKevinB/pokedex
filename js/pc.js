// ============================================================
// Pokédex OS — Bill's PC Box, team picker, save export/import
// ============================================================

import { MAX_POKEMON, PIXEL_SPRITE } from './config.js';
import { state, player, exportCode, importCode, monLevel, setTeam } from './state.js';
import { loadPoke, updateCatchUI } from './dex.js';

let pcContext = 'dex';
let teamPick = [];

export function openPC(context = 'dex') {
  if (state.isCatching) return;
  pcContext = context;
  const grid = document.getElementById('pc-grid');
  const closeBtn = document.getElementById('close-pc-btn');
  document.getElementById('pc-title').innerText = `P${state.currentPlayer}'S PC BOX`;

  const cancelBtn = document.getElementById('pc-cancel-btn');
  if (context === 'team') {
    teamPick = player().team.filter(id => player().caught.includes(id));
    if (teamPick.length === 0) teamPick = player().caught.slice(0, 6);
    document.getElementById('save-controls').style.display = 'none';
    closeBtn.innerText = '⚔️ START BATTLE';
    cancelBtn.style.display = 'block';
    updateTeamInstruction();
  } else {
    document.getElementById('pc-instruction').innerText = '';
    document.getElementById('save-controls').style.display = 'grid';
    closeBtn.innerText = 'CANCEL / CLOSE PC';
    cancelBtn.style.display = 'none';
  }

  const activeCaught = player().caught;
  let html = '';
  for (let i = 1; i <= MAX_POKEMON; i++) {
    const caught = activeCaught.includes(i);
    if (!caught && context !== 'dex') continue;
    const lvl = caught ? `<em class="pc-lvl">Lv${monLevel(i)}</em>` : '';
    const picked = context === 'team' && teamPick.includes(i) ? ' picked' : '';
    html += `<div class="pc-item${caught ? '' : ' uncaught'}${picked}" data-pc-id="${i}">
      <img src="${PIXEL_SPRITE(i)}" loading="lazy">
      <span>#${i.toString().padStart(3, '0')}</span>${lvl}
    </div>`;
  }
  grid.innerHTML = html;
  grid.querySelectorAll('.pc-item').forEach(el =>
    el.addEventListener('click', () => handlePCSelect(parseInt(el.dataset.pcId), el)));
  document.getElementById('pc-modal').style.display = 'flex';
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

// Called when the user backs out of team picking via gestures elsewhere.
export function cancelTeamPick() {
  if (pcContext === 'team') {
    pcContext = 'dex';
    document.getElementById('pc-modal').style.display = 'none';
    document.dispatchEvent(new CustomEvent('pc-battle-cancelled'));
  }
}

export function exportSave() {
  const saveString = exportCode();
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(saveString).then(() => alert('SAVE CODE COPIED!'));
  } else {
    prompt('COPY THIS SAVE CODE:', saveString);
  }
}

export function importSave() {
  const code = prompt('PASTE YOUR SAVE CODE HERE:');
  if (!code) return;
  try {
    importCode(code);
    alert('SAVE IMPORTED!');
    openPC('dex');
    updateCatchUI();
  } catch (e) {
    alert('ERROR: INVALID CODE.');
  }
}
