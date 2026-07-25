// ============================================================
// Pokédex OS — Bill's PC Box, save export/import
// ============================================================

import { MAX_POKEMON, PIXEL_SPRITE } from './config.js';
import { state, player, exportCode, importCode } from './state.js';
import { loadPoke, updateCatchUI } from './dex.js';

let pcContext = 'dex';

export function openPC(context = 'dex') {
  if (state.isCatching) return;
  pcContext = context;
  const grid = document.getElementById('pc-grid');
  document.getElementById('pc-title').innerText = `P${state.currentPlayer}'S PC BOX`;

  if (context === 'battle') {
    document.getElementById('pc-instruction').innerText = 'SELECT YOUR FIGHTER';
    document.getElementById('save-controls').style.display = 'none';
  } else {
    document.getElementById('pc-instruction').innerText = '';
    document.getElementById('save-controls').style.display = 'grid';
  }

  const activeCaught = player().caught;
  let html = '';
  for (let i = 1; i <= MAX_POKEMON; i++) {
    if (activeCaught.includes(i)) {
      html += `<div class="pc-item" data-pc-id="${i}"><img src="${PIXEL_SPRITE(i)}" loading="lazy"><span>#${i.toString().padStart(3, '0')}</span></div>`;
    } else if (context === 'dex') {
      html += `<div class="pc-item uncaught" data-pc-id="${i}"><img src="${PIXEL_SPRITE(i)}" loading="lazy"><span>#${i.toString().padStart(3, '0')}</span></div>`;
    }
  }
  grid.innerHTML = html;
  grid.querySelectorAll('.pc-item').forEach(el =>
    el.addEventListener('click', () => handlePCSelect(parseInt(el.dataset.pcId))));
  document.getElementById('pc-modal').style.display = 'flex';
}

export function closePC() {
  document.getElementById('pc-modal').style.display = 'none';
  if (pcContext === 'battle') {
    // battle.js owns the exit path; avoid circular import by dispatching
    document.dispatchEvent(new CustomEvent('pc-battle-cancelled'));
  }
}

function handlePCSelect(id) {
  document.getElementById('pc-modal').style.display = 'none';
  if (pcContext === 'dex') {
    loadPoke(id);
  } else if (pcContext === 'battle') {
    document.dispatchEvent(new CustomEvent('pc-fighter-selected', { detail: { id } }));
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
