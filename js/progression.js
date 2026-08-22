// ============================================================
// Pokédex OS — progression: trainer card, badges, daily quests
// Badges award Master Balls. Completing all 3 daily quests
// awards one more. Professor Oak reacts to dex completion.
// ============================================================

import { MAX_POKEMON } from './config.js';
import { state, player, persist, addXp, playerName } from './state.js';
import { sfx, triggerVibration } from './audio.js';
import { GYMS, trainerKey } from './gymdata.js';

// ---- Badges (rebased in v18.9 onto the Gym Circuit) ----
// The old 8 activity badges were all exhausted by gym win 23 of 58, and five
// of them fired off gym spoils rather than deliberate play. Badges now read
// straight from gyms.beaten — one per Leader — plus a late tier that outlasts
// the circuit. `progress` returns [current, target] for the visible pips.
const leaderIdxOf = g => g.trainers.length - 1;
const GYM_BADGES = GYMS.slice(0, 10).map(g => {
  const li = leaderIdxOf(g);
  const leader = g.trainers[li].name.replace('LEADER ', '');
  return {
    id: `gym-${g.key}`, emoji: g.emoji, name: `${leader} BADGE`,
    desc: `Beat ${g.trainers[li].name}`,
    check: p => !!p.gyms?.beaten?.[trainerKey(g.key, li)],
    progress: p => [p.gyms?.beaten?.[trainerKey(g.key, li)] ? 1 : 0, 1]
  };
});
// 11th circuit badge: the gauntlet — Victory Road + the Elite Four (Champion
// Rex himself is the late-tier crown, not a badge).
const GAUNTLET = [
  ...GYMS.find(g => g.key === 'victory').trainers.map((_, i) => trainerKey('victory', i)),
  ...GYMS.find(g => g.key === 'elite').trainers.slice(0, -1).map((_, i) => trainerKey('elite', i))
];
const gauntletDone = p => GAUNTLET.filter(k => p.gyms?.beaten?.[k]).length;

export const BADGES = [
  ...GYM_BADGES,
  { id: 'gauntlet', emoji: '🏔️', name: 'VICTORY BADGE', desc: 'Beat Victory Road & the Elite 4',
    check: p => gauntletDone(p) === GAUNTLET.length, progress: p => [gauntletDone(p), GAUNTLET.length] },
  { id: 'dex100', emoji: '📕', name: 'COLLECTOR BADGE', desc: 'Catch 100 Pokémon',
    check: p => p.caught.length >= 100, progress: p => [Math.min(p.caught.length, 100), 100] },
  { id: 'dex300', emoji: '📗', name: 'CURATOR BADGE', desc: 'Catch 300 Pokémon',
    check: p => p.caught.length >= 300, progress: p => [Math.min(p.caught.length, 300), 300] },
  { id: 'dex649', emoji: '📘', name: 'PROFESSOR BADGE', desc: `Catch all ${MAX_POKEMON}!`,
    check: p => p.caught.length >= MAX_POKEMON, progress: p => [p.caught.length, MAX_POKEMON] },
  { id: 'shiny1', emoji: '✨', name: 'SPARKLE BADGE', desc: 'Catch your first shiny',
    check: p => (p.shinies || []).length >= 1, progress: p => [Math.min((p.shinies || []).length, 1), 1] },
  { id: 'lv60', emoji: '🚀', name: 'EXPERT BADGE', desc: 'Raise one to Lv60',
    check: p => Object.values(p.mons).some(m => m.level >= 60),
    progress: p => [Math.min(Object.values(p.mons).reduce((a, m) => Math.max(a, m.level), 0), 60), 60] },
  { id: 'champion', emoji: '👑', name: 'CHAMPION BADGE', desc: 'Become the Champion',
    check: p => !!p.champion, progress: p => [p.champion ? 1 : 0, 1] }
];

// The retired activity badges. Never awarded any more, but NEVER taken away:
// one already earned keeps its place in the badge case with a ★.
const LEGACY_BADGES = [
  { id: 'boulder', emoji: '🪨', name: 'BOULDER BADGE', desc: 'Caught 3 Pokémon' },
  { id: 'cascade', emoji: '💧', name: 'CASCADE BADGE', desc: 'Caught 10 Pokémon' },
  { id: 'thunder', emoji: '⚡', name: 'THUNDER BADGE', desc: 'Won 3 battles' },
  { id: 'rainbow', emoji: '🌈', name: 'RAINBOW BADGE', desc: 'Caught 25 Pokémon' },
  { id: 'soul',    emoji: '💗', name: 'SOUL BADGE',    desc: 'Won 10 battles' },
  { id: 'marsh',   emoji: '🌿', name: 'MARSH BADGE',   desc: 'Explored 15 times' },
  { id: 'volcano', emoji: '🔥', name: 'VOLCANO BADGE', desc: 'Caught 50 Pokémon' },
  { id: 'earth',   emoji: '🌍', name: 'EARTH BADGE',   desc: 'Raised one to Lv30' }
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

function todayNumber() {
  // LOCAL days, not UTC. floor(Date.now()/86400000) rolled the quest board
  // at 8pm in Ohio — a dinnertime progress wipe, every single day.
  const now = new Date();
  return Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / 86400000);
}

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

  // The crown is permanent once earned — it is the only thing on this card
  // that can never be lost, which is rather the point of it.
  const champ = p.champion;
  document.getElementById('card-title').innerHTML =
    `TRAINER CARD — ${playerName()}` +
    (champ ? ` <span class="champ-crown" title="Champion ${champ.date}">👑</span>` : '');
  document.getElementById('card-dex-pct').innerText = `${p.caught.length}/${MAX_POKEMON} (${pct}%)`;
  document.getElementById('card-dex-fill').style.width = `${pct}%`;

  // desc + live progress are VISIBLE now, not hover-only title= text — the
  // boys play on a tablet, where hover does not exist.
  const badgeTile = (b, earned, extraClass = '') => {
    const [cur, target] = earned || !b.progress ? [1, 1] : b.progress(p);
    return `<div class="card-badge ${earned ? 'earned' : ''} ${extraClass}">
       <span>${b.emoji}</span><small>${b.name.replace(' BADGE', '')}</small>
       <em>${b.desc}</em>
       ${earned ? '' : `<span class="badge-prog">${cur}/${target}</span>`}
     </div>`;
  };
  const legacyEarned = LEGACY_BADGES.filter(b => p.badges.includes(b.id));
  document.getElementById('card-badges').innerHTML =
    BADGES.map(b => badgeTile(b, p.badges.includes(b.id))).join('') +
    legacyEarned.map(b => badgeTile(b, true, 'legacy')).join('');

  const maxLv = Object.values(p.mons).reduce((a, m) => Math.max(a, m.level), 0) || '--';
  document.getElementById('card-stats').innerHTML = `
    <div>CAUGHT <strong>${p.caught.length}</strong></div>
    <div>BATTLES WON <strong>${p.stats.battlesWon}</strong></div>
    <div>EXPLORES <strong>${p.stats.explores || 0}</strong></div>
    <div>TOP LEVEL <strong>${maxLv}</strong></div>
    <div>MASTER BALLS <strong>x${p.items.masterBalls}</strong></div>
    <div>BADGES <strong>${BADGES.filter(b => p.badges.includes(b.id)).length + legacyEarned.length}/${BADGES.length + legacyEarned.length}</strong></div>
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
