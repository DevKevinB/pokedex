// ============================================================
// Pokédex OS — bootstrap & event wiring
// ============================================================

import { APP_VERSION } from './config.js';
import { state, loadSave } from './state.js';
import { initAudio, stopAllAudio, playCryAudio, speak, isSpeaking, triggerVibration } from './audio.js';
import { loadPoke, nav, randomPoke, toggleShiny, toggleSheet, updateCatchUI } from './dex.js';
import { openBag, executeCatch } from './catch.js';
import { initBattleMode, exitBattleMode, finalizeBattleSetup, selectFighter, battleState } from './battle.js';
import { openPC, closePC, exportSave, importSave } from './pc.js';
import { playMusic, stopMusic, toggleMute, isMuted, playFanfare } from './music.js';
import { playBeep } from './audio.js';

// ---- Boot ----
function startApp() {
  initAudio();
  // GB boot chime
  playBeep(1046.5, 'sine', 0.12, 0.15);
  setTimeout(() => playBeep(2093, 'sine', 0.4, 0.15), 130);
  document.getElementById('tap-msg').innerText = 'LOADING OS...';
  setTimeout(() => playMusic('dex'), 900);
  setTimeout(() => {
    const boot = document.getElementById('boot-screen');
    boot.style.transform = 'translateY(-100%)';
    boot.style.opacity = '0';
    setTimeout(() => (boot.style.display = 'none'), 500);
    loadPoke(state.curId);
  }, 500);
}

// ---- Voice ----
function toggleVoice() {
  if (!state.curData || state.isCatching || state.appMode === 'battle') return;
  if (isSpeaking()) { stopAllAudio(); return; }
  stopAllAudio();
  setTimeout(() => {
    const btn = document.getElementById('voice-btn');
    speak(`${state.curData.name}. ${document.getElementById('desc').innerText}`, {
      onstart: () => { btn.innerHTML = '<span class="btn-icon">🛑</span> STOP'; },
      onend: () => { btn.innerHTML = '<span class="btn-icon">🎙️</span> VOICE'; }
    });
  }, 50);
}

function playCry() {
  if (state.isCatching || state.appMode === 'battle') return;
  stopAllAudio();
  playCryAudio();
}

// ---- Player toggle ----
function togglePlayer() {
  if (state.isCatching || state.appMode === 'battle') return;
  state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
  triggerVibration();
  document.getElementById('player-btn').innerText = `P${state.currentPlayer}`;
  document.documentElement.style.setProperty('--p-primary', state.currentPlayer === 1 ? '#d32f2f' : '#1976D2');
  document.documentElement.style.setProperty('--p-dark', state.currentPlayer === 1 ? '#b71c1c' : '#0D47A1');
  updateCatchUI();
}

// ---- Gestures ----
function wireGestures() {
  let touchStartX = 0, touchStartY = 0;
  const appBody = document.getElementById('app-body');

  appBody.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  appBody.addEventListener('touchmove', e => {
    if (state.isCatching || state.appMode === 'battle') return;
    const diffX = e.changedTouches[0].screenX - touchStartX;
    const diffY = e.changedTouches[0].screenY - touchStartY;
    if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) e.preventDefault();
  }, { passive: false });

  appBody.addEventListener('touchend', e => {
    if (state.isCatching || state.appMode === 'battle') return;
    const diffX = e.changedTouches[0].screenX - touchStartX;
    const diffY = e.changedTouches[0].screenY - touchStartY;
    if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX < 0) nav(1); else nav(-1);
    } else if (Math.abs(diffY) > 80 && Math.abs(diffY) > Math.abs(diffX)) {
      document.getElementById('data-sheet').classList.toggle('open', diffY < 0);
    }
  }, { passive: true });
}

// ---- Wiring ----
function on(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}

function wireUI() {
  on('boot-screen', startApp);
  on('player-btn', togglePlayer);
  on('pc-btn', () => openPC('dex'));
  on('battle-btn', initBattleMode);
  on('nav-prev', () => nav(-1));
  on('nav-next', () => nav(1));
  on('cry-btn', playCry);
  on('voice-btn', toggleVoice);
  on('shiny-btn', toggleShiny);
  on('random-btn', randomPoke);
  on('catch-btn', openBag);
  on('data-btn', toggleSheet);
  on('sheet-handle', toggleSheet);
  on('escape-btn', exitBattleMode);
  on('export-btn', exportSave);
  on('import-btn', importSave);
  on('close-pc-btn', closePC);
  on('variant-regular', () => finalizeBattleSetup(false));
  on('variant-sparkle', () => finalizeBattleSetup(true));
  on('variant-cancel', () => { document.getElementById('sparkle-modal').style.display = 'none'; });

  document.querySelectorAll('.ball-opt').forEach(el =>
    el.addEventListener('click', () => executeCatch(parseFloat(el.dataset.mod), el.dataset.ball)));

  document.getElementById('search').addEventListener('keydown', e => {
    if (e.key === 'Enter') loadPoke(e.target.value);
  });

  // pc.js → battle.js bridges (avoids circular imports)
  document.addEventListener('pc-fighter-selected', e => selectFighter(e.detail.id));
  document.addEventListener('pc-battle-cancelled', () => {
    if (state.appMode === 'battle' && !battleState.isBattling) exitBattleMode();
  });

  // music reacts to battle lifecycle
  document.addEventListener('battle-started', () => playMusic('battle'));
  document.addEventListener('battle-victory', () => playFanfare());
  document.addEventListener('battle-exited', () => playMusic('dex'));

  // mute toggle
  const musicBtn = document.getElementById('music-btn');
  if (musicBtn) {
    musicBtn.innerText = isMuted() ? '🔇' : '🔊';
    musicBtn.addEventListener('click', () => {
      musicBtn.innerText = toggleMute() ? '🔇' : '🔊';
    });
  }
}

// ---- Service worker (network-first shell: fixes stale iOS PWA installs) ----
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW registration failed', e));
  }
}

// ---- Init ----
loadSave();
wireUI();
wireGestures();
registerSW();
console.log(`Pokédex OS v${APP_VERSION} ready.`);
