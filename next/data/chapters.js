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
