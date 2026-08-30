// ============================================================
// Pokédex OS — bootstrap & event wiring
// ============================================================

import { APP_VERSION, PIXEL_SPRITE, initPace, typeColors } from './config.js';

// ?fast=1 clamps every battle wait to its floor (used by the test suite).
initPace();
import { state, loadSave, player, playerName, monLevel } from './state.js';
import { initAudio, stopAllAudio, playCryAudio, toggleMute, resumeIfNeeded, haptic, sfx } from './audio.js';
import { pet } from './fx.js';
import { loadPoke, nav, randomPoke, toggleShiny, toggleSheet, updateCatchUI } from './dex.js';
import { openBag, executeCatch } from './catch.js';
import { initBattleMode, exitBattleMode, wireExitChip, finalizeBattleSetup, onTeamConfirmed, maybeEvolveThenExit, startWildEncounter, startTrainerBattle, startVersusBattle, onPassReady, battleState, petTargetId } from './battle.js';
import { openPC, closePC, cancelTeamPick, onPCSearchInput } from './pc.js';
import { openExplore, closeExplore, reopenExplore } from './explore.js';
import { openGyms, backFromGym, reopenGyms } from './gym.js';
import { clearGymRun } from './gym.js';
import { initProgression, openTrainerCard, closeTrainerCard, dismissCelebration } from './progression.js';
import { initSettings, applyJuniorClass, syncMusicBtn } from './settings.js';
import { initDevTools } from './devtools.js';
import { playMusic, stopMusic, playFanfare } from './music.js';
import { playBeep } from './audio.js';

// ---- Boot ----
function startApp() {
  initAudio();
  // GB boot chime
  playBeep(1046.5, 'sine', 0.12, 0.15);
  setTimeout(() => playBeep(2093, 'sine', 0.4, 0.15), 130);
  document.getElementById('tap-msg').innerText = 'LOADING OS...';
  setTimeout(() => playMusic('dex'), 900);
  setTimeout(async () => {
    const boot = document.getElementById('boot-screen');
    boot.style.transform = 'translateY(-100%)';
    boot.style.opacity = '0';
    setTimeout(() => (boot.style.display = 'none'), 500);
    // Ask who's playing before anything loads, so the very first screen already
    // belongs to the right boy — including Junior Mode.
    const remembered = recallPlayer();
    if (remembered) { state.currentPlayer = remembered; applyPlayerChrome(); }
    else await showPlayerPicker();
    loadPoke(state.curId);
  }, 500);
}

function playCry() {
  if (state.isCatching || state.appMode === 'battle') return;
  stopAllAudio();
  playCryAudio();
}

// ---- Player toggle ----
// The active player is remembered on THIS DEVICE only, deliberately outside the
// synced save: an exported save carries both boys' collections, and whoever's
// turn it was on Dad's laptop is not a fact about the iPad.
const LAST_PLAYER_KEY = 'pokedexos_lastplayer';
function rememberPlayer(n) {
  try { localStorage.setItem(LAST_PLAYER_KEY, String(n)); } catch (e) { /* non-fatal */ }
}
function recallPlayer() {
  try {
    const n = parseInt(localStorage.getItem(LAST_PLAYER_KEY), 10);
    return (n === 1 || n === 2) ? n : null;
  } catch (e) { return null; }
}

// The LEAD chip. Kept in sync from every place that can change the lead:
// player switch, a catch, team edits in the PC, and evolution.
export function refreshLeadChip() {
  const img = document.getElementById('lead-sprite');
  const label = document.getElementById('lead-label');
  if (!img || !label) return;
  const p = player();
  const id = p.team[0] || p.caught[0];
  if (!id) { img.removeAttribute('src'); img.style.visibility = 'hidden'; label.innerText = 'LEAD'; return; }
  img.style.visibility = 'visible';
  img.src = PIXEL_SPRITE(id);
  label.innerText = `Lv${monLevel(id)}`;
}
document.addEventListener('game-progress', refreshLeadChip);
document.addEventListener('battle-exited', refreshLeadChip);
document.addEventListener('team-changed', refreshLeadChip);

function applyPlayerChrome() {
  document.getElementById('player-btn').innerText = playerName();
  refreshLeadChip();
  document.documentElement.style.setProperty('--p-primary', state.currentPlayer === 1 ? 'var(--p1)' : 'var(--p2)');
  document.documentElement.style.setProperty('--p-dark', state.currentPlayer === 1 ? 'var(--p1-dark)' : 'var(--p2-dark)');
  applyJuniorClass();
  updateCatchUI();
}

function setPlayer(n) {
  state.currentPlayer = n;
  rememberPlayer(n);
  // A half-finished gym run belongs to the boy who started it. Carrying its
  // endurance HP across a player switch handed one brother the other's damage.
  clearGymRun();
  applyPlayerChrome();
}

function togglePlayer() {
  if (state.isCatching || state.appMode === 'battle') return;
  haptic('select');
  setPlayer(state.currentPlayer === 1 ? 2 : 1);
}

// ---- WHO'S PLAYING? ----
// state.js used to hardcode currentPlayer = 1, so ART opening the app landed in
// GABE's profile with Junior Mode off — his brother's Pokémon, and a game he
// cannot read. Shown on first boot, and any time the remembered player is gone.
function showPlayerPicker() {
  return new Promise(resolve => {
    const modal = document.getElementById('whoplaying-modal');
    if (!modal) { resolve(); return; }
    const grid = document.getElementById('whoplaying-grid');
    const P = state.save.players;
    grid.innerHTML = [1, 2].map(n => {
      const lead = P[n].team[0] || P[n].caught[0] || (n === 1 ? 25 : 1);
      return `<div class="whoplaying-choice" data-player="${n}">
        <img src="${PIXEL_SPRITE(lead)}" alt="">
        <span>${playerName(n)}</span>
      </div>`;
    }).join('');
    grid.querySelectorAll('.whoplaying-choice').forEach(el =>
      el.addEventListener('click', () => {
        playBeep(1046.5, 'square', 0.12, 0.12);
        setPlayer(parseInt(el.dataset.player, 10));
        modal.style.display = 'none';
        resolve();
      }));
    modal.style.display = 'flex';
  });
}

// ---- Gestures ----
function wireGestures() {
  let touchStartX = 0, touchStartY = 0;
  const appBody = document.getElementById('app-body');

  // iOS Safari only runs :active styles on non-<button> elements once the
  // document itself carries a touch listener. Without this one empty line the
  // habitat cards, ball options, PC tiles, switch rows and spoils picks never
  // look pressed on the iPad — and a tap with no feedback is the single most
  // confusing thing you can hand a 4-year-old. Passive, so it costs nothing.
  document.addEventListener('touchstart', () => {}, { passive: true });

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
  // ---- v19.5: one tick for every tappable thing (ROADMAP §3.5) ----
  // Every button in the app already depresses 3px, and until now that was ALL
  // it did. A tap that also clicks and bumps is a tap a four-year-old is SURE
  // he made. One delegated PASSIVE capture listener covers every control in
  // the app, present and future — including the ones battle.js, pc.js and
  // explore.js build from strings long after this line has run.
  //
  // It is also the unlock: iOS will only start an AudioContext inside a real
  // gesture, and pointerdown is the earliest one we get.
  const TAPPABLE = 'button, .habitat-card, .pc-item, .ball-opt, .team-slot, ' +
                   '.spoils-pick, .switch-item, .whoplaying-choice';
  document.addEventListener('pointerdown', e => {
    resumeIfNeeded();
    const el = e.target instanceof Element ? e.target.closest(TAPPABLE) : null;
    if (!el || el.disabled || el.classList.contains('locked')) return;
    sfx.tick();
    haptic('tick');
  }, { passive: true, capture: true });

  // iOS parks a backgrounded AudioContext, and after a phone call hands it
  // back in state 'interrupted' — which never clears on its own. This app had
  // ZERO visibilitychange listeners, which is why one call could silence the
  // whole game until it was force-quit and relaunched.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeIfNeeded(); });
  window.addEventListener('pageshow', () => resumeIfNeeded());

  on('boot-screen', startApp);
  on('player-btn', togglePlayer);
  on('lead-btn', () => openPC('team'));
  on('pc-btn', () => openPC('dex'));
  on('battle-btn', initBattleMode);
  on('nav-prev', () => nav(-1));
  on('nav-next', () => nav(1));
  on('cry-btn', playCry);
  on('shiny-btn', toggleShiny);
  on('random-btn', randomPoke);
  on('catch-btn', openBag);
  on('data-btn', toggleSheet);
  on('sheet-handle', toggleSheet);
  // v19.2: the exit is not a plain click any more — two taps for GABE, a
  // 900ms hold for ART — so battle.js owns its wiring.
  wireExitChip();
  on('close-pc-btn', closePC);
  on('pc-cancel-btn', cancelTeamPick);
  on('variant-regular', () => finalizeBattleSetup(false));
  on('variant-sparkle', () => finalizeBattleSetup(true));
  on('variant-cancel', () => { document.getElementById('sparkle-modal').style.display = 'none'; exitBattleMode(); });
  on('victory-continue', maybeEvolveThenExit);
  on('switch-cancel', () => { document.getElementById('switch-modal').style.display = 'none'; });
  on('ballpick-cancel', () => { document.getElementById('ballpick-modal').style.display = 'none'; });
  document.getElementById('pc-search').addEventListener('input', onPCSearchInput);
  on('explore-btn', openExplore);
  on('explore-back-btn', closeExplore);
  on('gyms-btn', openGyms);
  on('gym-back-btn', backFromGym);

  // gym → battle bridges
  document.addEventListener('gym-challenge', e => startTrainerBattle(e.detail.gymKey, e.detail.idx));
  document.addEventListener('return-to-gym', reopenGyms);
  document.addEventListener('versus-start', startVersusBattle);
  on('pass-ready', onPassReady);
  on('card-btn', openTrainerCard);
  on('card-close', closeTrainerCard);
  on('badge-ok', dismissCelebration);

  // ---- v19.5: PET YOUR POKEMON ----
  // The sprite is the biggest thing on the dex screen and the one thing a
  // pre-reader is already touching. If you OWN it, touching it makes it hop,
  // squeak and pop hearts. If you don't, junior mode still opens the ball
  // drawer exactly as it did — nothing is taken away.
  on('poke-sprite', () => {
    if (state.isCatching || state.appMode !== 'dex') return;
    if (player().caught.includes(state.curId)) {
      pet(document.getElementById('poke-sprite'),
          document.getElementById('scanner-container'),
          state.curId);
    } else if (player().settings.junior) {
      openBag();
    }
  });

  // The same hook in a fight — but only between turns. petTargetId() returns
  // null while the board is busy or the Pokemon is down, so a pet can never
  // interrupt an attack that is already in flight.
  on('player-sprite', () => {
    const id = petTargetId();
    if (id != null) {
      pet(document.getElementById('player-sprite'),
          document.querySelector('.player-side'),
          id);
    }
  });

  // explore → battle bridges
  document.addEventListener('explore-encounter', e => startWildEncounter(e.detail.wildId));
  document.addEventListener('return-to-explore', reopenExplore);

  document.querySelectorAll('.ball-opt').forEach(el =>
    el.addEventListener('click', () => executeCatch(parseFloat(el.dataset.mod), el.dataset.ball)));

  document.getElementById('search').addEventListener('keydown', e => {
    if (e.key === 'Enter') loadPoke(e.target.value);
  });

  // pc.js → battle.js bridges (avoids circular imports)
  document.addEventListener('team-confirmed', onTeamConfirmed);
  document.addEventListener('pc-battle-cancelled', () => {
    if (state.appMode === 'battle' && !battleState.isBattling) exitBattleMode();
  });

  // Music reacts to battle lifecycle. playFanfare() was called with NO return
  // track, so once the four-second victory jingle finished the sequencer
  // stopped and never restarted: the arena went silent for the rest of the
  // session, through every remaining gym fight. Remember which arena theme was
  // playing and hand it back.
  let arenaTrack = 'battle';
  document.addEventListener('battle-started', e => {
    arenaTrack = e.detail?.origin === 'gym' ? 'gym' : 'battle';
    playMusic(arenaTrack);
  });
  document.addEventListener('battle-victory', () => playFanfare(arenaTrack));
  document.addEventListener('battle-exited', () => playMusic('dex'));

  // mute toggle (global: music + sfx + cries + speech)
  const musicBtn = document.getElementById('music-btn');
  if (musicBtn) {
    musicBtn.addEventListener('click', () => {
      toggleMute();
      syncMusicBtn();
    });
  }
}

// ---- Global failure net ----
// There were ZERO global handlers in this app. Any unhandled error left the
// game frozen mid-animation with no way out except force-quitting — which, to
// a 7-year-old, is indistinguishable from having broken it himself.
function installFailureNet() {
  let shown = false;
  const bail = (why) => {
    console.error('Caught by the failure net:', why);
    if (shown) return;
    shown = true;
    try { exitBattleMode(); } catch (e) { /* already torn down */ }
    const el = document.getElementById('oops-modal');
    if (el) el.style.display = 'flex';
  };
  window.addEventListener('error', e => bail(e?.message || e));
  window.addEventListener('unhandledrejection', e => bail(e?.reason || 'promise'));
  document.getElementById('oops-ok')?.addEventListener('click', () => {
    document.getElementById('oops-modal').style.display = 'none';
    shown = false;
  });

  // One delegated handler for every sprite in the app, present and future.
  // raw.githubusercontent rate-limits, and a 429 renders as a broken-image
  // glyph — which is what a child would be asked to battle against.
  document.addEventListener('error', e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.dataset.fellBack === '1') return;
    img.dataset.fellBack = '1';
    img.src = FALLBACK_SPRITE;
  }, true);
}

// A Pokéball, inline, so the fallback itself can never fail to load.
const FALLBACK_SPRITE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
     <circle cx="32" cy="32" r="28" fill="#f8f8e8" stroke="#24243a" stroke-width="4"/>
     <path d="M4 32a28 28 0 0 1 56 0z" fill="#e84040" stroke="#24243a" stroke-width="4"/>
     <line x1="4" y1="32" x2="60" y2="32" stroke="#24243a" stroke-width="5"/>
     <circle cx="32" cy="32" r="9" fill="#f8f8e8" stroke="#24243a" stroke-width="5"/>
   </svg>`);

// ---- Service worker (network-first shell: fixes stale iOS PWA installs) ----
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW registration failed', e));
  }
}

// ---- Design tokens ----
// The 18 type colours are data (config.js) but the stylesheet wants them as
// CSS variables. Publish them once, at boot, on the root element, so a rule
// can say `background: var(--type-fire)` instead of carrying its own hex and
// the two copies drifting apart.
function applyTypeTokens() {
  const root = document.documentElement;
  for (const [type, hex] of Object.entries(typeColors)) {
    root.style.setProperty(`--type-${type}`, hex);
  }
}

// ---- Init ----
applyTypeTokens();
loadSave();
initProgression();
wireUI();
initSettings();
initDevTools();
wireGestures();
installFailureNet();
registerSW();
// ---- which version am I actually playing? ----
// Kevin pushes from more than one machine and the service worker can serve a
// cached shell, so "is the new one live?" was previously unanswerable without
// a console. It is now on the boot screen for two seconds and permanently in
// Settings, both read from the single APP_VERSION constant.
(() => {
  const stamp = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  stamp('boot-version', `v${APP_VERSION}`);
  stamp('set-version', `v${APP_VERSION}`);
})();

console.log(`Pokédex OS v${APP_VERSION} ready.`);
