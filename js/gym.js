// ============================================================
// Pokédex OS — Gym Circuit screen & run state
// Sequential unlock: beat a trainer to open the next; beat a
// gym's leader to open the next gym. HP persists across a gym's
// trainers (endurance) until you visit the Poké Center or lose.
// Junior mode is exempt — always full HP.
// ============================================================

import { PIXEL_SPRITE } from './config.js';
import { GYMS, trainerKey, TOTAL_TRAINERS } from './gymdata.js';
import { state, player, persist, playerName } from './state.js';
import { nameOf, getNameIndex } from './api.js';
import { sfx, triggerVibration, playBeep } from './audio.js';
import { dialog } from './dialog.js';

let openGymKey = null;

// endurance: in-memory HP carryover for the current gym run
export const gymRun = { gymKey: null, hp: {} };

export function clearGymRun() {
  gymRun.gymKey = null;
  gymRun.hp = {};
}

export function pokeCenterHeal(silent = false) {
  clearGymRun();
  if (!silent) {
    // little healing jingle
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playBeep(f, 'sine', 0.18, 0.12), i * 140));
    triggerVibration([40, 30, 40]);
    const el = document.getElementById('gym-center-msg');
    if (el) {
      el.innerText = '💗 YOUR TEAM IS FULLY HEALED!';
      el.style.opacity = 1;
      setTimeout(() => { el.style.opacity = 0; }, 2200);
    }
  }
}

function beatenCount(gym) {
  return gym.trainers.filter((_, i) => player().gyms.beaten[trainerKey(gym.key, i)]).length;
}

function gymUnlocked(gymIdx) {
  if (gymIdx === 0) return true;
  const prev = GYMS[gymIdx - 1];
  return beatenCount(prev) === prev.trainers.length;
}

function trainerUnlocked(gym, idx) {
  if (idx === 0) return true;
  return !!player().gyms.beaten[trainerKey(gym.key, idx - 1)];
}

export function totalBeaten() {
  return GYMS.reduce((a, g) => a + beatenCount(g), 0);
}

// ---- screens ----
export function openGyms() {
  if (state.isCatching || state.appMode === 'battle') return;
  state.appMode = 'gym';
  openGymKey = null;
  renderGymList();
  document.getElementById('gym-container').classList.add('active');
}

export function closeGyms() {
  state.appMode = 'dex';
  document.getElementById('gym-container').classList.remove('active');
}

export function backFromGym() {
  if (openGymKey) { openGymKey = null; renderGymList(); }
  else closeGyms();
}

function renderGymList() {
  document.getElementById('gym-title').innerText = 'GYM CIRCUIT';
  const body = document.getElementById('gym-body');
  const done = totalBeaten();
  body.innerHTML = `
    <div class="gym-progress">TRAINERS DEFEATED: ${done}/${TOTAL_TRAINERS}</div>
    <button class="poke-center-btn" id="poke-center-btn" title="Fully heal your team">💗 POKÉ CENTER — HEAL TEAM</button>
    <button class="vs-btn" id="vs-btn" title="Pass-and-play battle: each player uses their own team">🆚 ${playerName(1)} VS ${playerName(2)}</button>
    <div class="gym-center-msg" id="gym-center-msg"></div>
    <div id="gym-grid">` +
    GYMS.map((g, gi) => {
      const unlocked = gymUnlocked(gi);
      const beaten = beatenCount(g);
      const complete = beaten === g.trainers.length;
      return `<div class="habitat-card gym-card ${unlocked ? '' : 'locked'} ${complete ? 'complete' : ''}" data-gym="${g.key}">
        <span class="habitat-emoji">${unlocked ? g.emoji : '🔒'}</span>
        <span class="habitat-name">${g.name}</span>
        <small class="habitat-sub">${unlocked ? `${beaten}/${g.trainers.length} BEATEN${complete ? ' ✓' : ''}` : 'BEAT THE PREVIOUS GYM'}</small>
      </div>`;
    }).join('') + '</div>';

  document.getElementById('poke-center-btn').addEventListener('click', () => pokeCenterHeal());
  document.getElementById('vs-btn').addEventListener('click', () =>
    document.dispatchEvent(new CustomEvent('versus-start')));
  body.querySelectorAll('.gym-card:not(.locked)').forEach(el =>
    el.addEventListener('click', () => { openGymKey = el.dataset.gym; renderTrainerList(); }));
}

function renderTrainerList() {
  const gym = GYMS.find(g => g.key === openGymKey);
  if (!gym) return;
  document.getElementById('gym-title').innerText = gym.name;
  getNameIndex(); // warm names for rosters
  const body = document.getElementById('gym-body');

  body.innerHTML = `<div class="gym-progress">${gym.emoji} ${beatenCount(gym)}/${gym.trainers.length} DEFEATED — WIN TO CATCH THEIR TEAM!</div>` +
    gym.trainers.map((t, i) => {
      const beaten = !!player().gyms.beaten[trainerKey(gym.key, i)];
      const unlocked = trainerUnlocked(gym, i);
      const lvl = t.team[0].level;
      const roster = t.team.map(m => `<img src="${PIXEL_SPRITE(m.id)}" title="${nameOf(m.id)} Lv${m.level}">`).join('');
      return `<div class="trainer-card ${beaten ? 'beaten' : ''} ${unlocked ? '' : 'locked'}" data-idx="${i}">
        <div class="trainer-head">
          <span class="trainer-name">${beaten ? '✅ ' : unlocked ? '' : '🔒 '}${t.name}</span>
          <span class="trainer-lvl">Lv${lvl}</span>
        </div>
        <div class="trainer-taunt">"${t.taunt}"</div>
        <div class="trainer-roster">${roster}</div>
        ${unlocked ? (beaten ? '<div class="trainer-cta rematch">🔁 REMATCH — HALF XP</div>' : '<div class="trainer-cta">⚔️ TAP TO BATTLE</div>') : ''}
      </div>`;
    }).join('');

  // Beaten trainers are re-fightable (v18.9). They were dead behind this
  // selector's :not(.beaten) — 58 hand-authored trainers, each playable once.
  body.querySelectorAll('.trainer-card:not(.locked)').forEach(el =>
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx);
      if (player().caught.length === 0) { dialog({ icon: '🔴', title: 'CATCH ONE FIRST!', text: 'You need a Pokémon to battle.' }); return; }
      sfx.superHit();
      triggerVibration(60);
      document.getElementById('gym-container').classList.remove('active');
      document.dispatchEvent(new CustomEvent('gym-challenge', { detail: { gymKey: gym.key, idx } }));
    }));
}

// return here after a gym battle
export function reopenGyms() {
  state.appMode = 'gym';
  document.getElementById('gym-container').classList.add('active');
  if (openGymKey) renderTrainerList();
  else renderGymList();
}

// record a win; returns true if this completed the whole circuit
export function recordGymWin(gymKey, idx) {
  player().gyms.beaten[trainerKey(gymKey, idx)] = true;
  persist();
  return totalBeaten() === TOTAL_TRAINERS;
}
