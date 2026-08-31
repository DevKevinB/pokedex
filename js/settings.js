// ============================================================
// Pokédex OS — ⚙️ Settings: player names, junior mode, sound,
// save export/import (code or file), all in one place.
// ============================================================

import { state, player, persist, playerName, setPlayerName, exportCode, importCode, hasPreviousSave, restorePreviousSave } from './state.js';
import { isMuted, toggleMute, triggerVibration, hapticsOn, toggleHaptics } from './audio.js';
import { updateCatchUI } from './dex.js';
import { dialog } from './dialog.js';
import { requirePin } from './devtools.js';

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
  // Device-local, NOT in the save: an exported save must not carry the iPad's
  // buzz setting onto a phone that buzzes differently.
  const buzz = document.getElementById('set-haptics');
  if (buzz) { buzz.innerText = hapticsOn() ? 'ON' : 'OFF'; buzz.classList.toggle('on', hapticsOn()); }
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
    navigator.clipboard.writeText(code).then(
      () => dialog({ icon: '💾', title: 'CODE COPIED!', text: 'Paste it on another device to move your game.' }),
      () => dialog({ icon: '💾', title: 'COPY THIS CODE', text: 'Select it all, then copy.', input: true, value: code, ok: 'DONE' })
    );
  } else {
    dialog({ icon: '💾', title: 'COPY THIS CODE', text: 'Select it all, then copy.', input: true, value: code, ok: 'DONE' });
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
      dialog({ icon: '⚠️', title: 'SAVE LOADED — HEADS UP', text:
        `Before: ${before} Pokémon\nNow: ${after} Pokémon\n\n` +
        `That code has FEWER Pokémon than you had. If this is wrong, tap ↩️ UNDO IMPORT right now to put it back.` });
    } else {
      dialog({ icon: '💾', title: 'SAVE LOADED!', text: `${after} Pokémon across both trainers.` });
    }
  } catch (e) {
    const why = !String(code || '').trim()
      ? 'The box was empty — nothing was pasted.\n\nNothing was changed.'
      : e && e.message === 'EMPTY_SAVE'
      ? 'That code is empty — it has no Pokémon in it.\n\nNothing was changed.'
      : 'That save code was not recognized.\n\nNothing was changed.';
    dialog({ icon: '❌', title: 'NOT LOADED', text: why });
  }
}

// The reversible half of the import fence. Swaps back to the snapshot taken
// immediately before the last import — and is itself undoable, because the
// swap keeps the replaced save in the same slot.
async function undoImport() {
  if (!(await requirePin())) return;
  if (!hasPreviousSave()) { dialog({ icon: '↩️', title: 'NOTHING TO UNDO', text: 'No import has been made on this device.' }); return; }
  const now = state.save.players[1].caught.length + state.save.players[2].caught.length;
  const go = await dialog({ icon: '↩️', title: 'UNDO THE LAST IMPORT?', text:
    `Right now you have ${now} Pokémon. This swaps back to the save from just before the last import.`,
    ok: 'UNDO IT', cancel: 'KEEP THIS', danger: true });
  if (!go) return;
  try {
    restorePreviousSave();
    syncHeaderPlayerBtn();
    applyJuniorClass();
    refreshSettingsUI();
    updateCatchUI();
    const after = state.save.players[1].caught.length + state.save.players[2].caught.length;
    dialog({ icon: '↩️', title: 'RESTORED', text: `You now have ${after} Pokémon. Tap UNDO again to swap back.` });
  } catch (e) {
    dialog({ icon: '❌', title: 'COULD NOT RESTORE', text: 'The backup could not be read. Nothing was changed.' });
  }
}

// Importing a save can overwrite BOTH boys' collections, so it sits behind
// the parent PIN — until v18.8 the reversible Parent Tools were locked while
// this irreversible pair was one tap from the gear icon.
async function pasteSaveCode() {
  if (!(await requirePin())) return;
  const code = await dialog({ icon: '📋', title: 'PASTE SAVE CODE', text: 'This replaces the save for BOTH trainers.', input: true, placeholder: 'PASTE HERE', ok: 'LOAD', cancel: 'CANCEL' });
  // Only CANCEL resolves null. An empty or all-spaces box resolves '' — falsy —
  // so LOAD on an empty box used to take the same do-nothing path as CANCEL and
  // close in silence, which is exactly the moment (a paste that failed on iOS) a
  // parent needs to be told. importCode('') throws before snapshotBeforeRisk(),
  // so the save is untouched and applyImportedCode says so.
  if (code !== null) applyImportedCode(code);
}

async function uploadSaveFile() {
  if (!(await requirePin())) return;
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
        dialog({ icon: '❌', title: 'NOT LOADED', text: 'Could not read that save file. Nothing was changed.' });
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// v19.6 — the gear is HOLD-TO-OPEN in junior.
// It is the one control on ART's screen that can turn his own mode off, wipe
// a save or rename his brother, and it sits 44px from the Pokemon he taps all
// day. GABE keeps the plain tap; the hold gate exists only while the active
// profile is junior, and it is checked live so switching player switches the
// gate with it. Same 1200ms and same .holding affordance as PARENT TOOLS.
function wireSettingsButton() {
  const btn = document.getElementById('settings-btn');
  if (!btn) return;
  const HOLD_MS = 1200;
  let timer = null;
  const junior = () => player().settings.junior;

  const start = () => {
    if (!junior()) return;
    clearTimeout(timer);              // a second finger must not orphan the first timer
    btn.classList.add('holding');
    timer = setTimeout(() => { btn.classList.remove('holding'); openSettings(); }, HOLD_MS);
  };
  const cancel = () => { clearTimeout(timer); btn.classList.remove('holding'); };

  btn.addEventListener('pointerdown', start);
  btn.addEventListener('pointerup', cancel);
  btn.addEventListener('pointerleave', cancel);
  btn.addEventListener('pointercancel', cancel);
  // The click that follows a completed hold must not re-open anything, so in
  // junior the click path does nothing at all.
  btn.addEventListener('click', () => { if (!junior()) openSettings(); });
}

export function initSettings() {
  const on = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);
  wireSettingsButton();
  on('settings-close', closeSettings);
  on('set-p1-junior', () => toggleJuniorFor(1));
  on('set-p2-junior', () => toggleJuniorFor(2));
  on('set-sound', toggleSound);
  on('set-haptics', () => { toggleHaptics(); refreshToggles(); });
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
