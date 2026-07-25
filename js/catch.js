// ============================================================
// Pokédex OS — catch mechanic (ball drawer, RNG, animations)
// ============================================================

import { ITEM_SPRITE } from './config.js';
import { state, player, recordCatch } from './state.js';
import { sfx, stopAllAudio, triggerVibration } from './audio.js';
import { updateCatchUI } from './dex.js';

export function openBag() {
  if (state.isCatching || state.appMode === 'battle' || player().caught.includes(state.curId)) return;
  const drawer = document.getElementById('ball-drawer');
  if (drawer.classList.contains('open')) {
    drawer.classList.remove('open');
  } else {
    drawer.classList.add('open');
    triggerVibration();
  }
}

export function executeCatch(ballModifier, ballName) {
  if (state.isCatching) return;
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

    let isSuccess;
    if (ballName === 'master-ball') {
      isSuccess = true;
    } else {
      const baseRate = state.curSpeciesData?.capture_rate ?? 45;
      const catchProbability = (baseRate * ballModifier) / 255;
      isSuccess = Math.random() < catchProbability;
    }

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
    recordCatch(state.curId);
    updateCatchUI();
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
