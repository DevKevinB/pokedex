// ============================================================
// Pokédex OS — Gym Circuit screen & run state
// Sequential unlock: beat a trainer to open the next; beat a
// gym's leader to open the next gym. HP persists across a gym's
// trainers (endurance) until you visit the Poké Center or lose.
// Junior mode is exempt — always full HP.
// ============================================================

import { PIXEL_SPRITE } from './config.js';
import { GYMS, trainerKey, TOTAL_TRAINERS, roundTrainers } from './gymdata.js';
import { state, player, persist, playerName, isChampion } from './state.js';
import { nameOf, getNameIndex } from './api.js';
import { sfx, triggerVibration, playBeep, haptic } from './audio.js';
import { dialog } from './dialog.js';

let openGymKey = null;
// v19.8: which ROUND the hub is showing. Never persisted — the only thing the
// save ever learns about round 2 is the extra keys in gyms.beaten.
let currentRound = 1;

// endurance: in-memory HP carryover for the current gym run
export const gymRun = { gymKey: null, hp: {}, max: {} };

export function clearGymRun() {
  gymRun.gymKey = null;
  gymRun.hp = {};
  gymRun.max = {};
}

export function pokeCenterHeal(silent = false) {
  clearGymRun();
  // Nothing to heal is not a success. Both neighbours on this screen already
  // refuse honestly (NEED TWO TEAMS! / CATCH ONE FIRST!); this was the odd
  // unguarded button. The guard lives inside !silent on purpose —
  // pokeCenterHeal(true) is the post-battle/reset call and stays a no-op.
  if (!silent && !player().caught.length) {
    haptic('denied');
    dialog({ icon: '🔴', title: 'CATCH ONE FIRST!', text: 'You have no team to heal yet.' });
    return;
  }
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

// v19.8: every one of these now asks "in WHICH round?". The default is 1, so
// any caller that does not care sees exactly the behaviour it saw before, and
// round 1's ladder is unchanged down to the key.
function beatenCount(gym, round = 1) {
  return gym.trainers.filter((_, i) => player().gyms.beaten[trainerKey(gym.key, i, round)]).length;
}

function gymUnlocked(gymIdx, round = 1) {
  if (gymIdx === 0) return true;
  const prev = GYMS[gymIdx - 1];
  return beatenCount(prev, round) === prev.trainers.length;
}

function trainerUnlocked(gym, idx, round = 1) {
  if (idx === 0) return true;
  return !!player().gyms.beaten[trainerKey(gym.key, idx - 1, round)];
}

export function totalBeaten(round = 1) {
  return GYMS.reduce((a, g) => a + beatenCount(g, round), 0);
}

// ---- screens ----
export function openGyms() {
  if (state.isCatching || state.appMode === 'battle') return;
  state.appMode = 'gym';
  openGymKey = null;
  // The round is module state and the two boys share this module. If the
  // player who just opened the hub is not a champion there is no ROUND 2 for
  // him, so the board goes back to 1 rather than showing him a tab row he
  // cannot see and a ladder he cannot have.
  if (!isChampion()) currentRound = 1;
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
  // The round is derived at the READ, never trusted from module state: a
  // player switch while the hub is open would otherwise leave the other
  // brother looking at a ROUND 2 board he has not earned.
  const round = isChampion() ? currentRound : 1;
  const r2 = round === 2;
  document.getElementById('gym-title').innerText = r2 ? 'CHAMPION CIRCUIT' : 'GYM CIRCUIT';
  const body = document.getElementById('gym-body');
  const done = totalBeaten(round);
  // The ROUND tabs exist ONLY for a champion. A locked tab before the crown is
  // a wall with a label on it, and the label is the half ART cannot read.
  // After the crown it is the reward: gold, and it says 👑.
  const tabs = isChampion() ? `
    <div class="round-tabs">
      <button class="round-tab ${r2 ? '' : 'active'}" data-round="1"><span class="btn-glyph">⚔️</span>ROUND 1</button>
      <button class="round-tab r2 ${r2 ? 'active' : ''}" data-round="2"><span class="btn-glyph">👑</span>ROUND 2</button>
    </div>` : '';
  // THE ACTIVE STOP: the first gym that is open and not yet finished. Once the
  // whole circuit is done it parks on the last stop rather than disappearing —
  // nothing a child has earned ever leaves the screen.
  let activeIdx = GYMS.findIndex((g, i) => gymUnlocked(i, round) && beatenCount(g, round) < g.trainers.length);
  if (activeIdx < 0) activeIdx = GYMS.length - 1;
  const hero = GYMS[activeIdx];
  const heroLeader = hero.trainers[hero.trainers.length - 1];
  const heroBeaten = beatenCount(hero, round);
  const heroDots = hero.trainers.map((_, i) => `<i class="${i < heroBeaten ? 'on' : ''}"></i>`).join('');

  // The hub used to be ONE active card and ten identical grey lock cards each
  // repeating "BEAT THE PREVIOUS GYM", with Victory Road and the Elite Four
  // pushed off the bottom of the screen. It is now the card you are on, then
  // the whole journey as twelve badge nodes — all twelve on screen at 375px,
  // so the end of the road is a thing GABE can see from the beginning of it.
  body.innerHTML = tabs + `
    <div class="gym-progress">TRAINERS DEFEATED: ${done}/${TOTAL_TRAINERS}</div>
    <div class="card gym-hero ${r2 ? 'round2' : ''}" data-gym="${hero.key}">
      <span class="card-band" style="--band: var(--gold)"></span>
      <img class="gym-hero-lead" src="${PIXEL_SPRITE(heroLeader.team[0].id)}" alt="" draggable="false">
      <div class="gym-hero-txt">
        <span class="card-title">${hero.emoji} ${hero.name}</span>
        <span class="card-dots">${heroDots}</span>
      </div>
      <span class="gym-hero-go" aria-hidden="true">⚔️</span>
    </div>
    <div id="gym-grid">` +
    GYMS.map((g, gi) => {
      const unlocked = gymUnlocked(gi, round);
      const beaten = beatenCount(g, round);
      const complete = beaten === g.trainers.length;
      return `<div class="card gym-card ${r2 ? 'round2' : ''} ${unlocked ? '' : 'locked'} ${complete ? 'complete' : ''} ${gi === activeIdx ? 'current' : ''}" data-gym="${g.key}" title="${g.name}">
        <span class="gym-node-art" aria-hidden="true">${g.emoji}</span>
        ${complete ? '<span class="card-ribbon">✅</span>' : ''}
        ${unlocked ? '' : '<span class="card-lock">🔒</span>'}
      </div>`;
    }).join('') + `</div>
    <button class="poke-center-btn" id="poke-center-btn" title="Fully heal your team">💗 POKÉ CENTER — HEAL TEAM</button>
    <button class="vs-btn" id="vs-btn" title="Pass-and-play battle: each player uses their own team">🆚 ${playerName(1)} VS ${playerName(2)}</button>
    <div class="gym-center-msg" id="gym-center-msg"></div>`;

  document.getElementById('poke-center-btn').addEventListener('click', () => pokeCenterHeal());
  document.getElementById('vs-btn').addEventListener('click', () =>
    document.dispatchEvent(new CustomEvent('versus-start')));
  body.querySelector('.gym-hero')?.addEventListener('click', () => {
    openGymKey = hero.key; renderTrainerList();
  });
  body.querySelectorAll('.gym-card:not(.locked)').forEach(el =>
    el.addEventListener('click', () => { openGymKey = el.dataset.gym; renderTrainerList(); }));
  // The ROUND tabs. Only a champion ever sees them, and the gate is re-checked
  // on the way in as well as on the way out, because currentRound is module
  // state both brothers share.
  body.querySelectorAll('.round-tab').forEach(el =>
    el.addEventListener('click', () => {
      if (!isChampion()) return;
      currentRound = parseInt(el.dataset.round, 10) === 2 ? 2 : 1;
      renderGymList();
    }));
}

function renderTrainerList() {
  const round = isChampion() ? currentRound : 1;   // fail closed, as above
  const r2 = round === 2;
  const gym = GYMS.find(g => g.key === openGymKey);
  if (!gym) return;
  // The SAME 58 trainers, +15 levels. roundTrainers() copies for round 2 and
  // hands back the original array for round 1, so GYMS itself never moves.
  const list = roundTrainers(gym, round);
  document.getElementById('gym-title').innerText = r2 ? `👑 ${gym.name}` : gym.name;
  getNameIndex(); // warm names for rosters
  const body = document.getElementById('gym-body');

  body.innerHTML = `<div class="gym-progress">${gym.emoji} ${beatenCount(gym, round)}/${gym.trainers.length} DEFEATED — WIN TO CATCH THEIR TEAM!</div>` +
    list.map((t, i) => {
      const beaten = !!player().gyms.beaten[trainerKey(gym.key, i, round)];
      const unlocked = trainerUnlocked(gym, i, round);
      const lvl = t.team[0].level;
      const roster = t.team.map(m => `<img src="${PIXEL_SPRITE(m.id)}" title="${nameOf(m.id)} Lv${m.level}">`).join('');
      // ONE PICTURE says which of the three states a row is in — a check for
      // done, crossed swords for open, a padlock for later — and the row now
      // LEADS with the trainer's first Pokémon at 48px, so ART can tell one
      // row from another without a single word.
      const status = beaten ? '✅' : unlocked ? '⚔️' : '🔒';
      const band = beaten ? 'var(--green)' : unlocked ? 'var(--red)' : 'var(--paper-2)';
      // The blinking sentence becomes a real button with a nudging chevron. It
      // KEEPS the words "TAP TO BATTLE" / "REMATCH — HALF XP": they are three
      // words GABE already reads here, and the smoke suite reads them too.
      const cta = !unlocked ? ''
        : beaten
          ? '<button type="button" class="btn-battle rematch">🔁 REMATCH — HALF XP <span class="chev">›</span></button>'
          : '<button type="button" class="btn-battle">⚔️ TAP TO BATTLE <span class="chev">›</span></button>';
      return `<div class="card trainer-card ${r2 ? 'round2' : ''} ${beaten ? 'beaten' : ''} ${unlocked ? '' : 'locked'}" data-idx="${i}">
        <span class="card-band" style="--band:${band}"></span>
        <div class="trainer-row">
          <img class="trainer-lead" src="${PIXEL_SPRITE(t.team[0].id)}" alt="" draggable="false">
          <div class="trainer-col">
            <div class="trainer-head">
              <span class="trainer-name">${t.name}</span>
              <span class="trainer-lvl">Lv${lvl}</span>
            </div>
            <div class="trainer-roster">${roster}</div>
          </div>
          <span class="trainer-status" aria-hidden="true">${status}</span>
        </div>
        <div class="trainer-taunt">"${t.taunt}"</div>
        ${cta}
      </div>`;
    }).join('');

  // Beaten trainers are re-fightable (v18.9). They were dead behind this
  // selector's :not(.beaten) — 58 hand-authored trainers, each playable once.
  body.querySelectorAll('.trainer-card:not(.locked)').forEach(el =>
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx);
      // ART cannot read the dialog. A refusal has to be audible in his own
      // language, or a tap that does nothing just looks broken.
      if (player().caught.length === 0) { haptic('denied'); dialog({ icon: '🔴', title: 'CATCH ONE FIRST!', text: 'You need a Pokémon to battle.' }); return; }
      sfx.superHit();
      triggerVibration(60);
      document.getElementById('gym-container').classList.remove('active');
      document.dispatchEvent(new CustomEvent('gym-challenge', { detail: { gymKey: gym.key, idx, round } }));
    }));
}

// return here after a gym battle
export function reopenGyms() {
  state.appMode = 'gym';
  document.getElementById('gym-container').classList.add('active');
  if (openGymKey) renderTrainerList();
  else renderGymList();
}

// record a win; returns true if this completed the whole circuit FOR THAT ROUND
export function recordGymWin(gymKey, idx, round = 1) {
  player().gyms.beaten[trainerKey(gymKey, idx, round)] = true;
  persist();
  return totalBeaten(round) === TOTAL_TRAINERS;
}
