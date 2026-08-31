// ============================================================
// Pokédex OS — progression: trainer card, badges, daily quests
// Badges award Master Balls. Completing all 3 daily quests
// awards one more. Professor Oak reacts to dex completion.
// ============================================================

import { MAX_POKEMON, todayNumber } from './config.js';
import { state, player, persist, addXp, playerName } from './state.js';
import { sfx, triggerVibration, playBeep } from './audio.js';
import { spawnConfetti } from './catch.js';
import { spawnMark } from './fx.js';
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

// v19.8 THE CHAMPION CIRCUIT. All 58 again, +15 levels, under round-2 keys
// (`gym:idx:r2`). Round 1's keys are untouched by design, so nothing already
// earned can move — and gyms.beaten is a free-form map that state.js hydrates
// without validating a single key, so this adds NO save-schema surface.
const ROUND2_KEYS = GYMS.flatMap(g => g.trainers.map((_, i) => trainerKey(g.key, i, 2)));
const round2Done = p => ROUND2_KEYS.filter(k => p.gyms?.beaten?.[k]).length;

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
    check: p => !!p.champion, progress: p => [p.champion ? 1 : 0, 1] },
  // The last thing in the game. Deliberately NOT another 👑 — the champion
  // coin is already a crown, and two identical coins side by side is one
  // picture saying two different things to a boy who reads by picture.
  { id: 'round2', emoji: '🏅', name: 'MASTER BADGE', desc: 'Beat all 58 in ROUND 2',
    check: p => round2Done(p) === ROUND2_KEYS.length,
    progress: p => [round2Done(p), ROUND2_KEYS.length] }
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
// v19.8: the pool went from TEN to thirty-one. Three of the same ten came
// round again and again, and "Catch 2 Pokémon" had stopped being a quest.
//
// A def is { key, label, target, kind } plus an OPTIONAL match(detail).
// That is the whole rule. 'catch_type' is gone as a kind — those five quests
// are ordinary 'catch' quests with a match(), and they keep their original
// KEYS so a board already sitting in a save still resolves this afternoon.
// `easy` marks the ones any child can finish on any day.
const hasType = (d, t) => (d.types || []).some(x => (x.type?.name || x) === t);
const catchType = (key, label, type) =>
  ({ key, label, target: 1, kind: 'catch', match: d => hasType(d, type) });
// habitatKey rides the catch event, and battle.js sets it ONLY for an explore
// encounter — so these are "go to that place and catch something there".
const catchIn = (key, label, habitatKey) =>
  ({ key, label, target: 1, kind: 'catch', match: d => d.habitatKey === habitatKey });

const QUEST_POOL = [
  { key: 'catch2', label: 'Catch 2 Pokémon', target: 2, kind: 'catch', easy: true },
  { key: 'catch4', label: 'Catch 4 Pokémon', target: 4, kind: 'catch', easy: true },
  { key: 'win1', label: 'Win a battle', target: 1, kind: 'win', easy: true },
  { key: 'win2', label: 'Win 2 battles', target: 2, kind: 'win', easy: true },
  { key: 'explore3', label: 'Go exploring 3 times', target: 3, kind: 'explore', easy: true },
  // --- type hunts (the five originals keep their keys) ---
  catchType('water1', 'Catch a WATER type', 'water'),
  catchType('fire1', 'Catch a FIRE type', 'fire'),
  catchType('grass1', 'Catch a GRASS type', 'grass'),
  catchType('electric1', 'Catch an ELECTRIC type', 'electric'),
  catchType('bug1', 'Catch a BUG type', 'bug'),
  catchType('rock1', 'Catch a ROCK type', 'rock'),
  catchType('ground1', 'Catch a GROUND type', 'ground'),
  catchType('psychic1', 'Catch a PSYCHIC type', 'psychic'),
  catchType('ghost1', 'Catch a GHOST type', 'ghost'),
  catchType('ice1', 'Catch an ICE type', 'ice'),
  catchType('dragon1', 'Catch a DRAGON type', 'dragon'),
  catchType('flying1', 'Catch a FLYING type', 'flying'),
  catchType('poison1', 'Catch a POISON type', 'poison'),
  // --- habitat hunts (FARAWAY LAND is champion-only and stays out of the
  //     pool: a slot nobody can reach is a dead slot on the board) ---
  catchIn('hforest', 'Catch one in DEEP FOREST', 'forest'),
  catchIn('hmeadow', 'Catch one in TALL GRASS', 'meadow'),
  catchIn('hocean', 'Catch one in the OCEAN', 'ocean'),
  catchIn('hvolcano', 'Catch one on VOLCANO PATH', 'volcano'),
  catchIn('hpower', 'Catch one at the POWER PLANT', 'powerplant'),
  catchIn('hcave', 'Catch one in the DEEP CAVE', 'cave'),
  catchIn('htower', 'Catch one in GHOST TOWER', 'tower'),
  catchIn('hdragon', "Catch one in DRAGON'S DEN", 'dragon'),
  // --- the rest ---
  { key: 'evolve1', label: 'Evolve a Pokémon', target: 1, kind: 'evolve' },
  { key: 'vs1', label: 'Win a brother battle', target: 1, kind: 'versus' },
  { key: 'rematch1', label: 'Rematch a gym trainer', target: 1, kind: 'rematch' },
  { key: 'rare1', label: 'Catch something RARE', target: 1, kind: 'catch',
    match: d => d.tier === 'rare' || d.tier === 'legendary' },
  { key: 'lv40catch', label: 'Catch one at Lv40+', target: 1, kind: 'catch',
    match: d => (d.level || 0) >= 40 }
];

// v19.8 THE CHAMPION TIER. A FOURTH slot, only once the crown is won, paying a
// MASTER BALL instead of XP. It is ADDED to the board, never swapped in: the
// three ordinary quests stay exactly as they were, so becoming Champion can
// only ever give a boy more to do, never less.
const HARD_POOL = [
  { key: 'hshiny', label: 'Catch a SHINY Pokémon', target: 1, kind: 'catch',
    match: d => !!d.shiny, reward: 'ball' },
  { key: 'hround2', label: 'Win a ROUND 2 battle', target: 1, kind: 'round2win', reward: 'ball' },
  { key: 'hevolve2', label: 'Evolve 2 Pokémon', target: 2, kind: 'evolve', reward: 'ball' }
];

const ALL_QUESTS = [...QUEST_POOL, ...HARD_POOL];

// todayNumber() moved to config.js in v19.7 (see the note there): the Sparkle
// Spot seeds on the same local day this board does, and config.js is the only
// place both modules can read it from without closing an import cycle. Same
// function, same local-midnight roll, imported at the top of this file.

function pickDailyQuests() {
  // deterministic per day & player, no repeats
  let seed = todayNumber() * 7 + state.currentPlayer * 13;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const easy = QUEST_POOL.filter(q => q.easy);
  const rest = QUEST_POOL.filter(q => !q.easy);
  const picks = [];
  // Thirty-one quests drawn blind could ask a four-year-old for a DRAGON, a
  // RARE and a brother battle on the same morning. A board he cannot finish is
  // not a challenge, it is a wall — and there is no way for him to read why.
  // So the board always opens with something anyone can do, and ART's opens
  // with two. This is a weighting, not an accommodation: nothing on screen
  // says it, and the quests themselves are the same quests.
  const easyCount = player().settings?.junior ? 2 : 1;
  while (picks.length < easyCount && easy.length) {
    picks.push(easy.splice(Math.floor(rand() * easy.length), 1)[0]);
  }
  while (picks.length < 3 && rest.length) {
    picks.push(rest.splice(Math.floor(rand() * rest.length), 1)[0]);
  }
  // The CHAMPION TIER — a fourth slot that pays a Master Ball. Day-keyed like
  // everything else here, so a boy who wins the crown at teatime meets it
  // tomorrow morning rather than having the board change under his hands.
  if (player().champion && HARD_POOL.length) {
    picks.push(HARD_POOL[Math.floor(rand() * HARD_POOL.length)]);
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

function questDef(key) { return ALL_QUESTS.find(q => q.key === key); }

// ---- celebration queue (badge/quest popups never overlap) ----
const celebrationQueue = [];
let celebrating = false;
let celebrationPump = null;

// ONE THING AT A TIME (v19.5.2). #badge-modal is text-only and pinned at
// z-3500, so it used to open straight on top of the victory card — the PICTURE
// reward, and the only half of a win ART can read — while the gold XP bar
// finished filling where nobody could see it. And every .overlay-screen paints
// its own 0.9 scrim, so two of them stacked are 99% black and three are 99.9%:
// this can never be fixed by shuffling z-indexes, only by taking turns.
// The queue holds. Nothing is ever dropped, and nothing is ever silently
// swallowed — it plays as soon as the screen in front of it is free.
const CEREMONY_MODALS = ['victory-modal', 'nick-modal', 'evo-modal', 'evo-pick-modal', 'hof-modal', 'sparkle-modal', 'pass-modal'];
function ceremonyBusy() {
  // A fight owns the screen until it is over: the 'win'/'catch' events fire a
  // beat BEFORE show('victory-modal'), so watching the modals alone is late.
  if (state.appMode === 'battle') return true;
  // ...and the dex GOTCHA! ceremony owns it until its naming box is answered.
  if (state.isCatching) return true;
  return CEREMONY_MODALS.some(id => {
    const el = document.getElementById(id);
    return el && getComputedStyle(el).display !== 'none';
  });
}

// Come back for a held queue the moment the screen frees up. One timer at a
// time, it only exists while something is actually waiting its turn, and it is
// short on purpose: the card must follow the ceremony it was waiting for
// closely enough to read as the NEXT thing, not as a surprise later on.
function pumpCelebrations() {
  if (celebrationPump) return;
  celebrationPump = setTimeout(() => { celebrationPump = null; nextCelebration(); }, 150);
}

function queueCelebration(emoji, title, subtitle, extra = {}) {
  celebrationQueue.push({ emoji, title, subtitle, ...extra });
  if (!celebrating) nextCelebration();
}

// v19.7 — THE FIRST SHINY.
// It rides the EXISTING queue instead of opening a modal of its own. Two
// .overlay-screens stacked are 99% black (see the note above this section),
// and a fight still owns the screen for seconds after the catch is banked —
// so this waits its turn exactly like a badge does, and the SPARKLE badge the
// same catch earns falls in behind it rather than on top of it.
export function queueShinyCeremony({ id = null, sprite = null } = {}) {
  queueCelebration('✨', '✨ SHINY! ✨', '', { sprite, shiny: true, id });
}

function nextCelebration() {
  const modal = document.getElementById('badge-modal');
  if (celebrationQueue.length && ceremonyBusy()) {
    if (modal) modal.style.display = 'none';
    celebrating = true;          // held: nothing may re-enter and stack a timer
    pumpCelebrations();
    return;
  }
  const item = celebrationQueue.shift();
  if (!item) { celebrating = false; if (modal) modal.style.display = 'none'; return; }
  celebrating = true;
  const box = modal.querySelector('.badge-box');
  const spriteEl = document.getElementById('badge-sprite');
  const emojiEl = document.getElementById('badge-emoji');
  // A ceremony with a SPRITE shows the Pokémon instead of a glyph. Every badge
  // and quest card keeps the glyph, so nothing that shipped before changes.
  if (spriteEl) {
    if (item.sprite) { spriteEl.src = item.sprite; spriteEl.style.display = 'block'; }
    else { spriteEl.style.display = 'none'; spriteEl.removeAttribute('src'); }
  }
  if (emojiEl) {
    emojiEl.style.display = item.sprite ? 'none' : '';
    emojiEl.innerText = item.emoji;
  }
  document.getElementById('badge-title').innerText = item.title;
  document.getElementById('badge-sub').innerText = item.subtitle;
  modal.style.display = 'flex';
  if (box) box.classList.toggle('shiny-ceremony', !!item.shiny);
  if (item.shiny) {
    sfx.catch();
    spawnConfetti(box, 48);
    [-64, 0, 64].forEach((dx, i) =>
      spawnMark(box, '✨', 'shiny-spark', { dx, delay: i * 130, life: 1300 }));
    // the four-note rising chord — the same shape as the Poké Center jingle,
    // built from playBeep because there is no sfx.levelUp entry in audio.js
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => playBeep(f, 'square', 0.18, 0.11), i * 130));
    triggerVibration([100, 50, 100, 50, 200]);
  } else {
    sfx.catch();
    triggerVibration([80, 40, 80, 40, 160]);
  }
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

function bumpQuests(kind, detail = {}) {
  const quests = ensureDailyQuests();
  let changed = false;
  for (const q of quests.list) {
    if (q.done) continue;
    const def = questDef(q.key);
    if (!def || def.kind !== kind) continue;
    // ONE rule: the kind matches and an optional match(detail) agrees.
    // What was here before had a `hit` expression whose catch_type clause
    // could never be true — def.kind === kind cannot hold when def.kind is
    // 'catch_type' and kind is 'catch' — so a dead branch sat beside the live
    // one and every future reader had to work out which was which.
    // A def's match() sees untrusted-shaped event detail; a throw in here must
    // never take checkBadges down with it.
    let ok = true;
    try { ok = !def.match || !!def.match(detail); } catch (e) { ok = false; }
    if (!ok) continue;
    q.progress++;
    changed = true;
    if (q.progress >= def.target) {
      q.done = true;
      if (def.reward === 'ball') {
        player().items.masterBalls++;
        queueCelebration('👑', 'CHAMPION QUEST!', `${def.label} — done!\n+1 MASTER BALL!`);
      } else {
        const lead = player().team[0] || player().caught[0];
        if (lead) addXp(lead, 30);
        queueCelebration('⭐', 'QUEST COMPLETE!', `${def.label} — done!\n+30 XP to your lead Pokémon!`);
      }
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
  bumpQuests(kind, detail);
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
    <div>SHINIES <strong>✨ ${(p.shinies || []).length}</strong></div>`;

  document.getElementById('card-quests').innerHTML = quests.list.map(q => {
    const def = questDef(q.key);
    return `<div class="card-quest ${q.done ? 'done' : ''}">
      <span>${q.done ? '✅' : '🔲'} ${def.label}</span>
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
  // battle.js announces the first shiny as an EVENT rather than importing this
  // module, which keeps battle -> progression out of the import graph entirely.
  document.addEventListener('first-shiny', e => queueShinyCeremony(e.detail || {}));
}
