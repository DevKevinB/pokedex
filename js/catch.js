// ============================================================
// Pokédex OS — catch mechanic (ball drawer, RNG, animations)
// ============================================================

import { ITEM_SPRITE } from './config.js';
import { catchProbability } from './engine.js';
import { state, player, recordCatch, ensureMon, spendMasterBall, setNick } from './state.js';
import { sfx, stopAllAudio, triggerVibration } from './audio.js';
import { updateCatchUI } from './dex.js';

export function openBag() {
  if (state.isCatching || state.appMode === 'battle' || player().caught.includes(state.curId)) return;
  const drawer = document.getElementById('ball-drawer');
  if (drawer.classList.contains('open')) {
    drawer.classList.remove('open');
  } else {
    const count = document.getElementById('mb-count');
    if (count) count.innerText = `x${player().items.masterBalls}`;
    drawer.classList.add('open');
    triggerVibration();
  }
}

// celebration confetti (extra generous in junior mode)
export function spawnConfetti(host, count = 24) {
  if (!host) return;
  const colors = ['#e84040', '#ffd040', '#38c060', '#4592c4', '#f366b9', '#fff'];
  for (let i = 0; i < count; i++) {
    const c = document.createElement('span');
    c.className = 'confetti-piece';
    c.style.background = colors[i % colors.length];
    c.style.left = `${10 + Math.random() * 80}%`;
    c.style.top = `${Math.random() * 20}%`;
    c.style.animationDelay = `${Math.random() * 0.4}s`;
    c.style.setProperty('--cx', `${(Math.random() - 0.5) * 120}px`);
    host.appendChild(c);
    setTimeout(() => c.remove(), 1900);
  }
}

export function executeCatch(ballModifier, ballName, forceSuccess = false) {
  if (state.isCatching) return;
  // Junior mode: every ball is a guaranteed catch, and Master Balls are
  // never consumed — but the drawer looks completely normal, so the
  // choice still feels like a real decision.
  const junior = player().settings.junior;
  if (ballName === 'master-ball' && !junior) {
    if (!spendMasterBall()) {
      const msg = document.getElementById('dex-catch-msg');
      msg.innerText = 'NO MASTER BALLS! EARN MORE WITH BADGES!';
      msg.style.color = '#ffcc00';
      msg.style.opacity = 1;
      sfx.break();
      setTimeout(() => { msg.style.opacity = 0; }, 2000);
      document.getElementById('ball-drawer').classList.remove('open');
      return;
    }
  }
  state.isCatching = true;
  document.getElementById('ball-drawer').classList.remove('open');
  stopAllAudio();

  const sprite = document.getElementById('poke-sprite');
  const ball = document.getElementById('dex-throw-ball');
  const msg = document.getElementById('dex-catch-msg');
  ball.src = ITEM_SPRITE(ballName);
  ball.style.opacity = 1;
  ball.style.transform = 'translateY(0px) scale(1)';

  setTimeout(() => {
    sprite.classList.add('sucked-in');
    sfx.suck();

    // Same formula as the battle screen (engine.catchProbability). These used
    // to be two different equations: the dex screen ignored HP and skipped the
    // clamps, so the same ball on the same species had different odds
    // depending on which screen you happened to throw it from.
    const isSuccess = forceSuccess || Math.random() < catchProbability({
      captureRate: state.curSpeciesData?.capture_rate ?? 45,
      ballMod: ballModifier,
      junior,
      master: ballName === 'master-ball'
    });

    const shakes = isSuccess ? 3 : Math.floor(Math.random() * 3) + 1;
    let shakeCount = 0;
    const shakeInterval = setInterval(() => {
      shakeCount++;
      ball.classList.remove('ball-shake');
      void ball.offsetWidth;
      ball.classList.add('ball-shake');
      sfx.shake();
      triggerVibration([50]);
      if (shakeCount >= shakes) {
        clearInterval(shakeInterval);
        setTimeout(() => finalizeDexCatch(isSuccess, ball, sprite, msg), 800);
      }
    }, 1000);
  }, 500);
}

function finalizeDexCatch(isSuccess, ball, sprite, msg) {
  ball.classList.remove('ball-shake');
  if (isSuccess) {
    sfx.catch();
    triggerVibration([100, 50, 100]);
    msg.innerText = 'GOTCHA!';
    msg.style.color = '#00ff00';
    msg.style.opacity = 1;
    spawnConfetti(document.querySelector('.visual-display'), player().settings.junior ? 48 : 24);
    const isNewCatch = recordCatch(state.curId);
    ensureMon(state.curId); // fresh catches start at Lv5
    updateCatchUI();
    if (isNewCatch && !player().settings.junior) {
      const capturedId = state.curId;
      const capturedName = (state.curData?.name || 'it').toUpperCase();
      setTimeout(() => {
        try {
          const nick = prompt(`Give ${capturedName} a nickname? (leave blank to skip)`);
          if (nick) setNick(capturedId, nick);
        } catch (e) { /* prompt unavailable */ }
      }, 2100);
    }
    document.dispatchEvent(new CustomEvent('game-progress', { detail: { kind: 'catch', types: state.curData?.types || [] } }));
    setTimeout(() => {
      ball.style.opacity = 0;
      ball.style.transform = 'translateY(-150px) scale(2)';
      msg.style.opacity = 0;
      sprite.classList.remove('sucked-in');
      state.isCatching = false;
    }, 2000);
  } else {
    sfx.break();
    triggerVibration([200]);
    ball.style.opacity = 0;
    ball.style.transform = 'translateY(-150px) scale(2)';
    sprite.classList.remove('sucked-in');
    msg.innerText = 'DARN! IT BROKE FREE!';
    msg.style.color = '#ff0000';
    msg.style.opacity = 1;
    setTimeout(() => { msg.style.opacity = 0; state.isCatching = false; }, 2000);
  }
}
