// ============================================================
// Pokédex OS — progression: trainer card, badges, daily quests
// Badges award Master Balls. Completing all 3 daily quests
// awards one more. Professor Oak reacts to dex completion.
// ============================================================

import { MAX_POKEMON } from './config.js';
import { state, player, persist, addXp, playerName } from './state.js';
import { sfx, triggerVibration } from './audio.js';

// ---- Badges ----
export const BADGES = [
  { id: 'boulder', emoji: '🪨', name: 'BOULDER BADGE', desc: 'Catch 3 Pokémon',   check: p => p.caught.length >= 3 },
  { id: 'cascade', emoji: '💧', name: 'CASCADE BADGE', desc: 'Catch 10 Pokémon',  check: p => p.caught.length >= 10 },
  { id: 'thunder', emoji: '⚡', name: 'THUNDER BADGE', desc: 'Win 3 battles',     check: p => p.stats.battlesWon >= 3 },
  { id: 'rainbow', emoji: '🌈', name: 'RAINBOW BADGE', desc: 'Catch 25 Pokémon',  check: p => p.caught.length >= 25 },
  { id: 'soul',    emoji: '💗', name: 'SOUL BADGE',    desc: 'Win 10 battles',    check: p => p.stats.battlesWon >= 10 },
  { id: 'marsh',   emoji: '🌿', name: 'MARSH BADGE',   desc: 'Explore 15 times',  check: p => (p.stats.explores || 0) >= 15 },
  { id: 'volcano', emoji: '🔥', name: 'VOLCANO BADGE', desc: 'Catch 50 Pokémon',  check: p => p.caught.length >= 50 },
  { id: 'earth',   emoji: '🌍', name: 'EARTH BADGE',   desc: 'Raise one to Lv30', check: p => Object.values(p.mons).some(m => m.level >= 30) }
];

// ---- Daily quests ----
const QUEST_POOL = [
  { key: 'catch2', label: 'Catch 2 Pokémon', target: 2, kind: 'catch' },
  { key: 'catch4', label: 'Catch 4 Pokémon', target: 4, kind: 'catch' },
  { key: 'win1', label: 'Win a battle', target: 1, kind: 'win' },
  { key: 'win2', label: 'Win 2 battles', target: 2, kind: 'win' },
  { key: 'explore3', label: 'Go exploring 3 times', target: 3, kind: 'explore' },
  { key: 'water1', label: 'Catch a WATER type', target: 1, kind: 'catch_type', type: 'water' },
  { key: 'fire1', label: 'Catch a FIRE type', target: 1, kind: 'catch_type', type: 'fire' },
  { key: 'grass1', label: 'Catch a GRASS type', target: 1, kind: 'catch_type', type: 'grass' },
  { key: 'electric1', label: 'Catch an ELECTRIC type', target: 1, kind: 'catch_type', type: 'electric' },
  { key: 'bug1', label: 'Catch a BUG type', target: 1, kind: 'catch_type', type: 'bug' }
];

function todayNumber() { return Math.floor(Date.now() / 86400000); }

function pickDailyQuests() {
  // deterministic per day & player, no repeats
  let seed = todayNumber() * 7 + state.currentPlayer * 13;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pool = [...QUEST_POOL];
  const picks = [];
  while (picks.length < 3 && pool.length) {
    picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }
  return picks.map(q => ({ key: q.key, progress: 0, done: false }));
}

export function ensureDailyQuests() {
  const p = player();
  const day = todayNumber();
  if (!p.quests || p.quests.day !== day) {
    p.quests = { day, list: pickDailyQuests(), allDone: false };
    persist();
  }
  return p.quests;
}

function questDef(key) { return QUEST_POOL.find(q => q.key === key); }

// ---- celebration queue (badge/quest popups never overlap) ----
const celebrationQueue = [];
let celebrating = false;

function queueCelebration(emoji, title, subtitle) {
  celebrationQueue.push({ emoji, title, subtitle });
  if (!celebrating) nextCelebration();
}

function nextCelebration() {
  const item = celebrationQueue.shift();
  const modal = document.getElementById('badge-modal');
  if (!item) { celebrating = false; if (modal) modal.style.display = 'none'; return; }
  celebrating = true;
  document.getElementById('badge-emoji').innerText = item.emoji;
  document.getElementById('badge-title').innerText = item.title;
  document.getElementById('badge-sub').innerText = item.subtitle;
  modal.style.display = 'flex';
  sfx.catch();
  triggerVibration([80, 40, 80, 40, 160]);
}

export function dismissCelebration() { nextCelebration(); }

// ---- progress handling ----
function checkBadges() {
  const p = player();
  for (const b of BADGES) {
    if (!p.badges.includes(b.id) && b.check(p)) {
      p.badges.push(b.id);
      p.items.masterBalls++;
      persist();
      queueCelebration(b.emoji, `${b.name} EARNED!`, `${b.desc} — COMPLETE!\n+1 MASTER BALL!`);
    }
  }
}

function bumpQuests(kind, types = []) {
  const quests = ensureDailyQuests();
  let changed = false;
  for (const q of quests.list) {
    if (q.done) continue;
    const def = questDef(q.key);
    if (!def) continue;
    const hit =
      (def.kind === kind) &&
      (def.kind !== 'catch_type' || types.some(t => (t.type?.name || t) === def.type));
    if (def.kind === 'catch_type' && kind === 'catch' && types.some(t => (t.type?.name || t) === def.type)) {
      q.progress++;
      changed = true;
    } else if (hit) {
      q.progress++;
      changed = true;
    }
    if (q.progress >= def.target && !q.done) {
      q.done = true;
      const lead = player().team[0] || player().caught[0];
      if (lead) addXp(lead, 30);
      queueCelebration('⭐', 'QUEST COMPLETE!', `${def.label} — done!\n+30 XP to your lead Pokémon!`);
    }
  }
  if (!quests.allDone && quests.list.every(q => q.done)) {
    quests.allDone = true;
    player().items.masterBalls++;
    queueCelebration('🏆', 'ALL QUESTS DONE!', 'Daily sweep!\n+1 MASTER BALL!');
  }
  if (changed) persist();
}

export function onProgress(kind, detail = {}) {
  bumpQuests(kind, detail.types || []);
  checkBadges();
  persist();
}

// ---- trainer card ----
export function openTrainerCard() {
  if (state.isCatching || state.appMode === 'battle') return;
  const p = player();
  const quests = ensureDailyQuests();
  const pct = Math.round((p.caught.length / MAX_POKEMON) * 100);

  document.getElementById('card-title').innerText = `TRAINER CARD — ${playerName()}`;
  document.getElementById('card-dex-pct').innerText = `${p.caught.length}/${MAX_POKEMON} (${pct}%)`;
  document.getElementById('card-dex-fill').style.width = `${pct}%`;

  document.getElementById('card-badges').innerHTML = BADGES.map(b =>
    `<div class="card-badge ${p.badges.includes(b.id) ? 'earned' : ''}" title="${b.desc}">
       <span>${b.emoji}</span><small>${b.name.replace(' BADGE', '')}</small>
     </div>`).join('');

  const maxLv = Object.values(p.mons).reduce((a, m) => Math.max(a, m.level), 0) || '--';
  document.getElementById('card-stats').innerHTML = `
    <div>CAUGHT <strong>${p.caught.length}</strong></div>
    <div>BATTLES WON <strong>${p.stats.battlesWon}</strong></div>
    <div>EXPLORES <strong>${p.stats.explores || 0}</strong></div>
    <div>TOP LEVEL <strong>${maxLv}</strong></div>
    <div>MASTER BALLS <strong>x${p.items.masterBalls}</strong></div>
    <div>BADGES <strong>${p.badges.length}/8</strong></div>
    <div>VS WINS <strong>${p.stats.versusWins || 0}</strong></div>
    <div>SHINIES <strong>✨${(p.shinies || []).length}</strong></div>`;

  document.getElementById('card-quests').innerHTML = quests.list.map(q => {
    const def = questDef(q.key);
    return `<div class="card-quest ${q.done ? 'done' : ''}">
      <span>${q.done ? '✅' : '▫️'} ${def.label}</span>
      <small>${Math.min(q.progress, def.target)}/${def.target}</small>
    </div>`;
  }).join('');

  const oak =
    pct >= 100 ? 'Incredible! You are a true POKÉMON MASTER! There is nothing left to teach you!' :
    pct >= 75 ? 'Astonishing progress! The professors in Pallet Town are talking about you!' :
    pct >= 50 ? 'Half the Pokédex complete! Your dedication reminds me of a young trainer I once knew...' :
    pct >= 25 ? 'A quarter of the way! Keep exploring — rare Pokémon hide in unusual places!' :
    pct >= 10 ? 'Good start! Remember: explore different habitats to find different Pokémon!' :
    'Your journey is just beginning! Go catch some Pokémon and fill that Pokédex!';
  document.getElementById('card-oak').innerText = `"${oak}" — PROF. OAK`;

  document.getElementById('card-modal').style.display = 'flex';
}

export function closeTrainerCard() {
  document.getElementById('card-modal').style.display = 'none';
}

// listen for game events
export function initProgression() {
  ensureDailyQuests();
  document.addEventListener('game-progress', e => onProgress(e.detail.kind, e.detail));
}
