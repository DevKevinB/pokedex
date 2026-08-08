// ============================================================
// Pokédex OS — ⚙️ Settings: player names, junior mode, sound,
// save export/import (code or file), all in one place.
// ============================================================

import { state, player, persist, playerName, setPlayerName, exportCode, importCode, hasPreviousSave, restorePreviousSave } from './state.js';
import { isMuted, toggleMute, triggerVibration } from './audio.js';
import { updateCatchUI } from './dex.js';

function applyJuniorClass() {
  document.body.classList.toggle('junior', player().settings.junior);
}

function syncHeaderPlayerBtn() {
  document.getElementById('player-btn').innerText = playerName();
}

function syncMusicBtn() {
  const btn = document.getElementById('music-btn');
  if (btn) btn.innerText = isMuted() ? '🔇' : '🔊';
}

// toggle labels only — never touches the name inputs, so typed-but-unsaved
// names survive toggling junior mode or sound
export function refreshToggles() {
  document.getElementById('set-p1-junior').innerText = state.save.players[1].settings.junior ? 'ON' : 'OFF';
  document.getElementById('set-p1-junior').classList.toggle('on', state.save.players[1].settings.junior);
  document.getElementById('set-p2-junior').innerText = state.save.players[2].settings.junior ? 'ON' : 'OFF';
  document.getElementById('set-p2-junior').classList.toggle('on', state.save.players[2].settings.junior);
  document.getElementById('set-sound').innerText = isMuted() ? 'OFF' : 'ON';
  document.getElementById('set-sound').classList.toggle('on', !isMuted());
}

export function refreshSettingsUI() {
  document.getElementById('set-p1-name').value = state.save.players[1].name || '';
  document.getElementById('set-p2-name').value = state.save.players[2].name || '';
  refreshToggles();
}

export function openSettings() {
  if (state.isCatching || state.appMode === 'battle') return;
  refreshSettingsUI();
  document.getElementById('settings-modal').style.display = 'flex';
}

export function closeSettings() {
  // persist names on close
  setPlayerName(1, document.getElementById('set-p1-name').value);
  setPlayerName(2, document.getElementById('set-p2-name').value);
  syncHeaderPlayerBtn();
  document.getElementById('settings-modal').style.display = 'none';
}

function toggleJuniorFor(n) {
  state.save.players[n].settings.junior = !state.save.players[n].settings.junior;
  persist();
  applyJuniorClass();
  refreshToggles();
  triggerVibration();
}

function toggleSound() {
  toggleMute();
  syncMusicBtn();
  refreshToggles();
}

// ---- save data ----
function copySaveCode() {
  const code = exportCode();
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(code).then(() => alert('SAVE CODE COPIED! Paste it on another device to transfer your game.'));
  } else {
    prompt('COPY THIS SAVE CODE:', code);
  }
}

function downloadSaveFile() {
  const payload = {
    pokedexOS: true,
    exported: new Date().toISOString(),
    players: { 1: playerName(1), 2: playerName(2) },
    code: exportCode()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pokedex-save-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function applyImportedCode(code) {
  const before = state.save.players[1].caught.length + state.save.players[2].caught.length;
  try {
    importCode(code);
    const after = state.save.players[1].caught.length + state.save.players[2].caught.length;
    syncHeaderPlayerBtn();
    applyJuniorClass();
    refreshSettingsUI();
    updateCatchUI();
    // Tell the truth about what just happened. The old code said "Welcome back"
    // no matter what — including when the import had just emptied both boxes.
    if (after < before) {
      alert(`SAVE LOADED, BUT HEADS UP:\n\nBefore: ${before} Pokémon\nNow: ${after} Pokémon\n\n` +
            `That code has FEWER Pokémon than you had. If this is wrong, tap ↩️ UNDO IMPORT ` +
            `in Settings right now to put it back.`);
    } else {
      alert(`SAVE LOADED! ${after} Pokémon across both trainers.`);
    }
  } catch (e) {
    const why = e && e.message === 'EMPTY_SAVE'
      ? 'That code is empty — it has no Pokémon in it.\n\nNothing was changed.'
      : 'That save code was not recognized.\n\nNothing was changed.';
    alert('ERROR: ' + why);
  }
}

// The reversible half of the import fence. Swaps back to the snapshot taken
// immediately before the last import — and is itself undoable, because the
// swap keeps the replaced save in the same slot.
function undoImport() {
  if (!hasPreviousSave()) { alert('Nothing to undo — no import has been made on this device.'); return; }
  const now = state.save.players[1].caught.length + state.save.players[2].caught.length;
  if (!confirm(`UNDO THE LAST IMPORT?\n\nRight now you have ${now} Pokémon. ` +
               `This swaps back to the save from just before the last import.`)) return;
  try {
    restorePreviousSave();
    syncHeaderPlayerBtn();
    applyJuniorClass();
    refreshSettingsUI();
    updateCatchUI();
    const after = state.save.players[1].caught.length + state.save.players[2].caught.length;
    alert(`RESTORED. You now have ${after} Pokémon. Tap UNDO again to swap back.`);
  } catch (e) {
    alert('ERROR: The backup could not be read. Nothing was changed.');
  }
}

function pasteSaveCode() {
  const code = prompt('PASTE YOUR SAVE CODE HERE:');
  if (code) applyImportedCode(code);
}

function uploadSaveFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json,.txt';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result.toString().trim();
        // accept either our JSON file or a raw base64 code
        const code = text.startsWith('{') ? (JSON.parse(text).code || '') : text;
        if (!code) throw new Error('NO_CODE');
        applyImportedCode(code);
      } catch (e) {
        alert('ERROR: Could not read that save file.');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

export function initSettings() {
  const on = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);
  on('settings-btn', openSettings);
  on('settings-close', closeSettings);
  on('set-p1-junior', () => toggleJuniorFor(1));
  on('set-p2-junior', () => toggleJuniorFor(2));
  on('set-sound', toggleSound);
  on('set-export-copy', copySaveCode);
  on('set-export-file', downloadSaveFile);
  on('set-import-paste', pasteSaveCode);
  on('set-import-file', uploadSaveFile);
  on('set-undo-import', undoImport);
  syncHeaderPlayerBtn();
  syncMusicBtn();
  applyJuniorClass();
}

export { applyJuniorClass, syncHeaderPlayerBtn, syncMusicBtn };
