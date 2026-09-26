// ============================================================
// SPROUT ROAD: Gabe's Verdant Road. 12 chapters built on GYMS.
// Pure data + pure progression logic. No DOM, no store import, so
// node --test can load it directly (see next/test/road.test.mjs).
// ============================================================

import { GYMS, trainerKey } from './gymdata.js';

// Hand-authored per chapter (keyed by gym key, because VICTORY ROAD is a rock
// chapter and the ELITE FOUR a dragon chapter, and each deserves its own look).
// ground = the land colour of the restored region, sky = the air above it,
// accent = the node ring, the path and the petals of its bloom.
const PALETTES = {
  rock:     { ground: '#b08a5a', sky: '#f3d9a4', accent: '#7a5230' },
  water:    { ground: '#4fa3d9', sky: '#bfe6ff', accent: '#1d5f9c' },
  electric: { ground: '#e8c93a', sky: '#fff4b0', accent: '#a07c00' },
  grass:    { ground: '#5cb85c', sky: '#d4f5c0', accent: '#2e7d32' },
  psychic:  { ground: '#d86fb0', sky: '#fbd3ec', accent: '#8e2f6f' },
  fighting: { ground: '#c8663e', sky: '#f7cdb4', accent: '#8a3a1c' },
  ghost:    { ground: '#7a62b8', sky: '#d6cbf2', accent: '#43307a' },
  ice:      { ground: '#8fd6e6', sky: '#e8fbff', accent: '#3a8fa8' },
  fire:     { ground: '#e8663a', sky: '#ffd2a8', accent: '#a8321a' },
  dragon:   { ground: '#5a6fd8', sky: '#cfd7ff', accent: '#2a3a98' },
  victory:  { ground: '#8c9a6a', sky: '#e4ecc8', accent: '#4f5a32' },
  elite:    { ground: '#d8b440', sky: '#fff0bf', accent: '#8a6a10' }
};

// Where each chapter happens, for Gabe (a reader). Short and UPPERCASE.
const REGIONS = {
  rock:     { region: 'PEBBLE HILLS',   drought: 'THE HILLS TURNED TO DUST.' },
  water:    { region: 'CASCADE BAY',    drought: 'THE RIVER RAN DRY.' },
  electric: { region: 'SPARK PLAINS',   drought: 'NO RAIN, NO STORMS.' },
  grass:    { region: 'MEADOW VALE',    drought: 'THE FLOWERS ALL WILTED.' },
  psychic:  { region: 'DREAM GARDENS',  drought: 'EVEN THE DREAMS DRIED UP.' },
  fighting: { region: 'KNUCKLE CANYON', drought: 'THE CANYON CRACKED OPEN.' },
  ghost:    { region: 'MISTY WOODS',    drought: 'THE MIST WENT AWAY.' },
  ice:      { region: 'FROSTY PEAKS',   drought: 'THE SNOW MELTED TO NOTHING.' },
  fire:     { region: 'EMBER FIELDS',   drought: 'TOO HOT. NOTHING GROWS.' },
  dragon:   { region: 'SKY CLIFFS',     drought: 'THE WIND STOPPED BLOWING.' },
  victory:  { region: 'VICTORY ROAD',   drought: 'THE LAST PATH IS DRY.' },
  elite:    { region: 'THE BIG TREE',   drought: 'THE TREE IS THIRSTY.' }
};

export const CHAPTERS = GYMS.map((g, i) => ({
  idx: i,
  key: g.key,
  name: g.name,
  type: g.type,
  emoji: g.emoji,
  palette: PALETTES[g.key] || PALETTES.grass,
  region: (REGIONS[g.key] || {}).region || g.name,
  drought: (REGIONS[g.key] || {}).drought || 'THE LAND IS DRY.',
  trainers: g.trainers
}));

export const chapterKey = (i, j) => 'c' + i + '-t' + j;

/** The leader is the LAST trainer of a chapter (index 4 in the ten gyms,
 *  index 2 on Victory Road, the Champion in the Elite chapter). */
export const leaderIdx = i => (CHAPTERS[i] ? CHAPTERS[i].trainers.length - 1 : -1);

const roadOf = p => (p && p.road) || {};
const clearedOf = p => (roadOf(p).cleared && typeof roadOf(p).cleared === 'object') ? roadOf(p).cleared : {};
const beatenOf = p => (p && p.gyms && p.gyms.beaten && typeof p.gyms.beaten === 'object') ? p.gyms.beaten : {};

/** Cleared on the Road, OR beaten in the classic Gym Circuit (round 1).
 *  Classic progress is derived here and never written back. */
export function isCleared(p, i, j) {
  const ch = CHAPTERS[i];
  if (!ch || j < 0 || j >= ch.trainers.length) return false;
  return !!clearedOf(p)[chapterKey(i, j)] || !!beatenOf(p)[trainerKey(ch.key, j, 1)];
}

export const isChapterDone = (p, i) => isCleared(p, i, leaderIdx(i));

export function isChapterOpen(p, i) {
  if (!CHAPTERS[i]) return false;
  return i === 0 || isChapterDone(p, i - 1);
}

/** A trainer is open when its chapter is open and the one before it is
 *  cleared. Beaten trainers stay open, so Gabe can always have a rematch. */
export function isTrainerOpen(p, i, j) {
  if (!isChapterOpen(p, i)) return false;
  if (j < 0 || j > leaderIdx(i)) return false;
  return j === 0 || isCleared(p, i, j) || isCleared(p, i, j - 1);
}

/** The chapter Gabe is on: the first one whose leader is not beaten.
 *  Returns CHAPTERS.length once the Champion has fallen. */
export function currentChapter(p) {
  for (let i = 0; i < CHAPTERS.length; i++) if (!isChapterDone(p, i)) return i;
  return CHAPTERS.length;
}

/** The next unbeaten trainer: {i, j} or null when the whole Road is done. */
export function nextTrainer(p) {
  const i = currentChapter(p);
  if (i >= CHAPTERS.length) return null;
  for (let j = 0; j <= leaderIdx(i); j++) if (!isCleared(p, i, j)) return { i, j };
  return null;
}

/** How a chapter looks on the map: 'done' (full colour), 'current' (pulsing),
 *  'soon' (one of the next two: grey silhouette), 'fog' (hidden). */
export function chapterView(p, i) {
  const cur = currentChapter(p);
  if (i < cur || isChapterDone(p, i)) return 'done';
  if (i === cur) return 'current';
  if (i <= cur + 2) return 'soon';
  return 'fog';
}

export function battleParams(i, j) {
  const t = CHAPTERS[i].trainers[j];
  return {
    enemyTeam: t.team.map(m => ({ id: m.id, level: m.level })),
    trainer: { name: t.name, taunt: t.taunt, leader: j === leaderIdx(i) },
    wild: false,
    returnTo: 'road',
    onEnd: 'chapter:' + i + ':' + j
  };
}

/** 'chapter:3:4' -> {i:3, j:4}; anything malformed -> null. */
export function parseOnEnd(s) {
  const m = /^chapter:(\d{1,2}):(\d{1,2})$/.exec(typeof s === 'string' ? s : '');
  if (!m) return null;
  const i = +m[1], j = +m[2];
  if (!CHAPTERS[i] || j > leaderIdx(i)) return null;
  return { i, j };
}

function ensureRoad(p) {
  if (!p.road || typeof p.road !== 'object') p.road = {};
  const r = p.road;
  if (!r.cleared || typeof r.cleared !== 'object') r.cleared = {};
  if (!Array.isArray(r.bloomed)) r.bloomed = [];
  if (typeof r.chapter !== 'number') r.chapter = 0;
  return r;
}

/**
 * Record a Road win. Mutates the player (caller commits). Idempotent: a
 * second call with the same onEnd changes nothing and never re-blooms.
 * Returns null for a bad onEnd, else {i, j, leader, bloom}. When bloom is
 * true the chapter has ALREADY been added to road.bloomed and its badge
 * granted, so the save is right even if the animation never finishes.
 */
export function applyWin(p, onEnd) {
  const at = parseOnEnd(onEnd);
  if (!at || !p) return null;
  const { i, j } = at;
  const r = ensureRoad(p);
  r.cleared[chapterKey(i, j)] = true;
  const leader = j === leaderIdx(i);
  let bloom = false;
  if (leader && !r.bloomed.includes(i)) {
    r.bloomed.push(i);
    if (!Array.isArray(p.badges)) p.badges = [];
    if (!p.badges.includes(CHAPTERS[i].key)) p.badges.push(CHAPTERS[i].key);
    bloom = true;
  }
  r.chapter = Math.min(currentChapter(p), CHAPTERS.length - 1);
  return { i, j, leader, bloom };
}

/** Lead level of a trainer card (the highest level on their team). */
export const trainerLevel = t => t.team.reduce((a, m) => Math.max(a, m.level), 0);

// ============================================================
// OLD VENUSAUR GUARDIANS (ROADMAP 5.2 Thread B)
// Every bloomed chapter has one. Beat it once for a seed; the third
// seed hatches Gabe's own Bulbasaur (scenes/hatch.js).
// ============================================================

export const GUARDIAN_ID = 3;          // Venusaur
export const GUARDIAN_NAME = 'OLD VENUSAUR';
export const HATCH_SEEDS = 3;          // seeds needed to hatch
export const HATCH_ID = 1;             // Bulbasaur
export const HATCH_LEVEL = 10;
const MAX_SEEDS = 99;                  // matches core/validate.js MAX_SEEDS

const GUARDIAN_TAUNTS = ['SHOW ME YOUR STRENGTH.', 'EARN MY SEED, YOUNG ONE.', 'ONLY THE BRAVE GROW.'];

/** Level of chapter i's Old Venusaur: the leader's top level + 2. */
export const guardianLevel = i => Math.min(100, trainerLevel(CHAPTERS[i].trainers[leaderIdx(i)]) + 2);

export const guardianBeaten = (p, i) => !!(roadOf(p).guardians && roadOf(p).guardians[i]);

/** Present on the map once chapter i has bloomed (Road or classic). */
export const hasGuardian = (p, i) => !!CHAPTERS[i] && isChapterDone(p, i);

/** Can Gabe challenge it now? (bloomed, and not beaten yet) */
export const guardianOpen = (p, i) => hasGuardian(p, i) && !guardianBeaten(p, i);

export function guardianParams(i) {
  return {
    enemyTeam: [{ id: GUARDIAN_ID, level: guardianLevel(i) }],
    trainer: { name: GUARDIAN_NAME, taunt: GUARDIAN_TAUNTS[i % GUARDIAN_TAUNTS.length], leader: true },
    wild: false,
    returnTo: 'road',
    onEnd: 'guardian:' + i
  };
}

/** 'guardian:3' -> 3; anything else -> -1. */
export function parseGuardianEnd(s) {
  const m = /^guardian:(\d{1,2})$/.exec(typeof s === 'string' ? s : '');
  if (!m) return -1;
  const i = +m[1];
  return CHAPTERS[i] ? i : -1;
}

/** Seeds Gabe holds (0..99). */
export function seedCount(p) {
  const n = Number(roadOf(p).seeds);
  return Number.isInteger(n) && n > 0 ? Math.min(MAX_SEEDS, n) : 0;
}

export const isHatched = p => roadOf(p).hatched === true;

/** Time for the egg ceremony: enough seeds, not hatched yet. */
export const readyToHatch = p => seedCount(p) >= HATCH_SEEDS && !isHatched(p);

/**
 * Record an Old Venusaur win. Mutates the player (caller commits).
 * Idempotent: a second win over the same guardian gives nothing.
 * -> null for a bad/unearned onEnd, else {i, seeds, hatch}.
 */
export function applyGuardianWin(p, onEnd) {
  const i = parseGuardianEnd(onEnd);
  if (i < 0 || !p || !hasGuardian(p, i)) return null;
  const r = ensureRoad(p);
  if (!r.guardians || typeof r.guardians !== 'object' || Array.isArray(r.guardians)) r.guardians = {};
  if (r.guardians[i]) return null;
  r.guardians[i] = true;
  r.seeds = Math.min(MAX_SEEDS, seedCount(p) + 1);
  return { i, seeds: r.seeds, hatch: readyToHatch(p) };
}

/**
 * Hatch Gabe's own Bulbasaur. Mutates the player (caller commits).
 * New: adds #1 to caught, level max(existing, 10), team if room.
 * Already owned: same, and his becomes shiny if it isn't yet.
 * Sets road.hatched. Safe to call twice (the second call is a no-op).
 * -> {isNew, shiny, already} ; already=true when it had hatched before.
 */
export function applyHatch(p) {
  if (!p) return { isNew: false, shiny: false, already: true };
  const r = ensureRoad(p);
  const shinies = Array.isArray(p.shinies) ? p.shinies : (p.shinies = []);
  if (r.hatched === true) return { isNew: false, shiny: shinies.includes(HATCH_ID), already: true };
  if (!Array.isArray(p.caught)) p.caught = [];
  if (!Array.isArray(p.team)) p.team = [];
  if (!p.mons || typeof p.mons !== 'object') p.mons = {};
  const had = p.caught.includes(HATCH_ID);
  if (!had) p.caught.push(HATCH_ID);
  const m = p.mons[HATCH_ID];
  const lv = m && Number.isFinite(Number(m.level)) ? Number(m.level) : 0;
  if (lv < HATCH_LEVEL) p.mons[HATCH_ID] = { ...(m || {}), level: HATCH_LEVEL, xp: 0 };
  if (p.team.length < 6 && !p.team.includes(HATCH_ID)) p.team.push(HATCH_ID);
  let shiny = shinies.includes(HATCH_ID);
  if (had && !shiny) { shinies.push(HATCH_ID); shiny = true; }
  r.hatched = true;
  return { isNew: !had, shiny, already: false };
}

// ============================================================
// GIFTS FROM ART -> ORAN BERRIES
// Art's garden adds leaf-stamped gifts (save.gifts.toReader). A gift stays
// on the save until its berry is EATEN: the battle scene caps its berry
// button at the gifts waiting and calls store.takeGift() per berry eaten.
// Unwrapping on the Road only moves a gift into Gabe's pouch: the pouch
// count lives in player.items[BERRY_KEY] (items keeps any safe counter key
// through validate + merge) and is always <= the gifts waiting.
//   wrapped boxes on the Road = gifts - berries
//   params.berries to battle  = berries (unwrapped, uneaten)
// ============================================================

export const BERRY_KEY = 'oranBerries';

const nat = v => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };

/** Unwrapped, uneaten Oran Berries in Gabe's pouch (never more than gifts waiting). */
export function berryCount(p, gifts) {
  return Math.min(nat(p && p.items && p.items[BERRY_KEY]), nat(gifts));
}

/** Leaf-stamped boxes still wrapped on the Road. */
export const wrappedGifts = (p, gifts) => nat(gifts) - berryCount(p, gifts);

function setBerries(p, n) {
  if (!p.items || typeof p.items !== 'object') p.items = {};
  p.items[BERRY_KEY] = nat(n);
  return p.items[BERRY_KEY];
}

/** Unwrap one gift into the pouch. Mutates; caller commits. -> true when one was opened. */
export function openGift(p, gifts) {
  if (!p || wrappedGifts(p, gifts) < 1) return false;
  setBerries(p, berryCount(p, gifts) + 1);
  return true;
}

/**
 * After a battle: berries the battle ate came out of the gifts (gifts went
 * from `before` to `after`), so they leave the pouch too. Always re-clamps
 * the pouch to the gifts waiting. Mutates; -> the new pouch count.
 */
export function settleBerries(p, before, after) {
  if (!p) return 0;
  const eaten = Math.max(0, nat(before) - nat(after));
  const had = berryCount(p, before);
  return setBerries(p, Math.min(nat(after), Math.max(0, had - eaten)));
}

/** Any Road battle params + the berries Gabe carries into it. */
export const withBerries = (p, gifts, params) => ({ ...params, berries: berryCount(p, gifts) });
