// ============================================================
// Pokédex OS — catch mechanic (ball drawer, RNG, animations)
// ============================================================

import { ITEM_SPRITE } from './config.js';
import { catchProbability } from './engine.js';
import { askNickname } from './nickname.js';
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
  const colors = ['var(--red)', 'var(--gold)', 'var(--green)', 'var(--blue)', 'var(--type-psychic)', '#fff'];
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
    // ONE THING AT A TIME (v19.5.2): the Pokémon comes BACK on the same frame
    // as GOTCHA! and the confetti. It used to stay scaled to nothing for two
    // more seconds, so the whole celebration went off over an EMPTY box — and
    // an empty box is not "less" information for a pre-reader, it is none. The
    // ball leaves on the same frame instead of hovering over him for 2s.
    sprite.classList.remove('sucked-in');
    ball.style.opacity = 0;
    ball.style.transform = 'translateY(-150px) scale(2)';
    msg.innerText = 'GOTCHA!';
    msg.style.color = '#00ff00';
    msg.style.opacity = 1;
    spawnConfetti(document.querySelector('.visual-display'), player().settings.junior ? 48 : 24);
    const isNewCatch = recordCatch(state.curId);
    ensureMon(state.curId); // fresh catches start at Lv5
    updateCatchUI();
    // The naming box is a FOLLOW-UP, not a co-star. It now opens in the same
    // tick the GOTCHA! ceremony ends, so it can never land on the confetti —
    // and there is no longer a 100ms gap for a quest card to beat it there.
    const pendingNick = (isNewCatch && !player().settings.junior)
      ? { id: state.curId, name: (state.curData?.name || 'it').toUpperCase() }
      : null;
    document.dispatchEvent(new CustomEvent('game-progress', { detail: { kind: 'catch', types: state.curData?.types || [] } }));
    setTimeout(() => {
      msg.style.opacity = 0;
      state.isCatching = false;
      if (pendingNick) askNickname(pendingNick.id, pendingNick.name).then(nick => { if (nick) setNick(pendingNick.id, nick); });
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
