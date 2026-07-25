// ============================================================
// Pokédex OS — ⚙️ Settings: player names, junior mode, sound,
// save export/import (code or file), all in one place.
// ============================================================

import { state, player, persist, playerName, setPlayerName, exportCode, importCode } from './state.js';
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
  try {
    importCode(code);
    alert('SAVE LOADED! Welcome back.');
    syncHeaderPlayerBtn();
    applyJuniorClass();
    refreshSettingsUI();
    updateCatchUI();
  } catch (e) {
    alert('ERROR: That save code was not recognized.');
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
  syncHeaderPlayerBtn();
  syncMusicBtn();
  applyJuniorClass();
}

export { applyJuniorClass, syncHeaderPlayerBtn, syncMusicBtn };
