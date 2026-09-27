// ============================================================
// SPROUT ROAD: ROUND 2 (the idea of classic v19.8, remade for the Road)
//
// Once the Champion chapter (index 11) has bloomed, the Road grows a ROUND 2
// toggle. In Round 2 every chapter's trainers come back remixed and lifted to
// Champion-level (Lv~75-80 in chapter 0 up to Lv95; see R2_TOP_*), and every LEADER brings a signature
// GIMMICK that switches on in phase 2 (rain, sun, sandstorm, a charge...).
// Beating a Round 2 leader re-blooms the region in gold and hands Gabe that
// leader's ace as a SHINY.
//
// Pure data + pure logic: no DOM, no store import (node --test loads it).
// Progress lives in the Save v3 batch-4 fields: road.cleared 'r2-c<i>-t<j>'
// and road.r2bloomed. Classic Round 2 wins ('rock:0:r2' in gyms.beaten) count
// too, read-only, like chapters.isCleared does for round 1.
// No clock, no date, no timer: everything opens by play progress only.
// ============================================================

import { GYMS, roundTrainers, trainerKey } from './gymdata.js';
import { CHAPTERS, leaderIdx, isChapterDone } from './chapters.js';

export const R2_ROUND = 2;
export const R2_CHAMP = 11;                // the Champion chapter unlocks Round 2
export const r2Key = (i, j) => 'r2-c' + i + '-t' + j;

// ------------------------------------------------------------
// The remix. Levels: roundTrainers(gym, 2) (+15), then lifted per chapter (lift, below).
// A trainer's team is also shuffled into a new order so the fight feels
// different: a leader keeps the ACE LAST (it is the phase-2 mon and the shiny
// reward) and rotates the rest; everyone else sends their team in reverse.
// Built once from constant module data; never mutated afterwards.
// ------------------------------------------------------------
function remix(t, leader) {
  const team = t.team.map(m => ({ id: m.id, level: m.level }));
  if (team.length < 2) return { ...t, team };
  if (leader) {
    const ace = team[team.length - 1];
    const rest = team.slice(0, -1);
    return { ...t, team: [...rest.slice(1), rest[0], ace] };
  }
  return { ...t, team: team.slice().reverse() };
}

// Levels. Round 2 opens only after the Lv80 Champion, so Gabe's team is
// already ~Lv80: a flat +15 on Round 1 (Lv23 in chapter 0) would be one-hit
// KOs and the gimmicks would never be felt. Instead each chapter is lifted so
// its strongest mon sits on a gentle climb from R2_TOP_FIRST (chapter 0) to
// R2_TOP_LAST (the Champion), keeping the chapter's own level spread. Never
// below roundTrainers(g, 2) (+15), never above 100.
export const R2_TOP_FIRST = 80, R2_TOP_LAST = 95;
export const r2Top = i => Math.round(R2_TOP_FIRST + (R2_TOP_LAST - R2_TOP_FIRST) * i / Math.max(1, GYMS.length - 1));
function lift(trainers, i) {
  const top = Math.max(0, ...trainers.flatMap(t => t.team.map(m => m.level)));
  const up = Math.max(0, r2Top(i) - top);
  return trainers.map(t => ({ ...t, team: t.team.map(m => ({ ...m, level: Math.min(100, m.level + up) })) }));
}

const R2_TRAINERS = GYMS.map((g, i) => Object.freeze(
  lift(roundTrainers(g, R2_ROUND), i).map((t, j) => Object.freeze(remix(t, j === g.trainers.length - 1)))));

/** Chapter i's Round 2 roster (frozen copies; GYMS is never touched). */
export const r2Trainers = i => R2_TRAINERS[i] || [];

/** The ace (last mon) of chapter i's Round 2 leader: {id, level} | null. */
export function r2Ace(i) {
  const t = r2Trainers(i)[leaderIdx(i)];
  return t ? t.team[t.team.length - 1] : null;
}

// ------------------------------------------------------------
// GIMMICKS: one per chapter, keyed by the chapter's gym key (Victory Road is
// a rock chapter and the Elite Four a dragon one, so each gets its own).
// icon = the picture, word = Gabe's short line (<= 6 words, UPPERCASE),
// overlay = the weather drawn over the battle field (or null).
// ------------------------------------------------------------
export const GIMMICKS = Object.freeze({
  sandstorm: { icon: '\u{1F3DC}️', word: 'SANDSTORM!', overlay: 'sand' },
  rain:      { icon: '\u{1F327}️', word: 'RAIN!', overlay: 'rain' },
  charge:    { icon: '\u{1F50B}', word: 'CHARGED UP!', overlay: null },
  leech:     { icon: '\u{1F331}', word: 'LEECH SEED!', overlay: 'leech' },
  barrier:   { icon: '\u{1F6E1}️', word: 'BARRIER UP!', overlay: 'barrier' },
  bulk:      { icon: '\u{1F4AA}', word: 'BULK UP!', overlay: null },
  vanish:    { icon: '\u{1F32B}️', word: 'IT VANISHED!', overlay: 'mist' },
  hail:      { icon: '\u{1F328}️', word: 'HAIL!', overlay: 'hail' },
  sun:       { icon: '☀️', word: 'SUNNY DAY!', overlay: 'sun' },
  roar:      { icon: '\u{1F4E2}', word: 'MIGHTY ROAR!', overlay: null },
  tailwind:  { icon: '\u{1F32C}️', word: 'TAILWIND!', overlay: 'wind' },
  crown:     { icon: '\u{1F451}', word: 'CHAMPION POWER!', overlay: 'sun' }
});

/** Chapter gym key -> gimmick key. */
export const CHAPTER_GIMMICK = Object.freeze({
  rock: 'sandstorm', water: 'rain', electric: 'charge', grass: 'leech',
  psychic: 'barrier', fighting: 'bulk', ghost: 'vanish', ice: 'hail',
  fire: 'sun', dragon: 'roar', victory: 'tailwind', elite: 'crown'
});

export const gimmickFor = i => (CHAPTERS[i] ? CHAPTER_GIMMICK[CHAPTERS[i].key] || null : null);
export const gimmickInfo = key => (Object.prototype.hasOwnProperty.call(GIMMICKS, key) ? { key, ...GIMMICKS[key] } : null);

// Tuning (exported for the tests).
export const WEATHER_BOOST = 1.5, WEATHER_DAMP = 0.5;
export const CHIP = 1 / 16, LEECH = 1 / 12;
export const CHARGE_MULT = 2, BARRIER_MULT = 0.5, BULK_MULT = 0.7;
export const ROAR_ATK = 1.3, CROWN_ATK = 1.2, TAILWIND_SPE = 2, TAILWIND_HIT = 1.2;

const hasType = (f, list) => !!f && Array.isArray(f.types) && f.types.some(t => list.includes(t));
const weather = (up, down) => g => {
  if (g.phase !== 2 || !g.move) return 1;
  if (g.move.type === up) return WEATHER_BOOST;
  if (g.move.type === down) return WEATHER_DAMP;
  return 1;
};
const chipBoth = immune => g => {
  if (g.phase !== 2) return;
  for (const side of ['foe', 'me']) if (!hasType(g[side], immune)) g.chip(side, CHIP);
};

/**
 * A fresh gimmick for ONE fight (its own closure state), shaped for
 * createBattle's opts.gimmick hook. Unknown key -> null (a plain leader).
 * Everything switches on in phase 2 only.
 */
export function makeGimmick(key) {
  const info = gimmickInfo(key);
  if (!info) return null;
  const base = { key, icon: info.icon, word: info.word, overlay: info.overlay, onPhase2: g => g.note('start') };
  switch (key) {
    case 'sandstorm': return { ...base, onTurnStart: chipBoth(['rock', 'ground', 'steel']) };
    case 'hail': return { ...base, onTurnStart: chipBoth(['ice']) };
    case 'rain': return { ...base, onDamage: weather('water', 'fire') };
    case 'sun': return { ...base, onDamage: weather('fire', 'water') };
    case 'crown': return {
      ...base,
      onPhase2: g => { g.note('start'); g.boost('foe', CROWN_ATK); },
      onDamage: weather('fire', 'water')
    };
    case 'roar': return { ...base, onPhase2: g => { g.note('start'); g.boost('foe', ROAR_ATK); } };
    case 'tailwind': return {
      ...base,
      onPhase2: g => { g.note('start'); g.boost('foe', TAILWIND_SPE, 'spe'); },
      onDamage: g => (g.phase === 2 && g.side === 'foe' ? TAILWIND_HIT : 1)
    };
    case 'bulk': return {
      ...base,
      onDamage: g => (g.phase === 2 && g.side === 'me' && g.move && g.move.damage_class !== 'special' ? BULK_MULT : 1)
    };
    case 'leech': return {
      ...base,
      onTurnStart: g => {
        if (g.phase !== 2) return;
        const took = g.chip('me', LEECH);
        if (took) g.heal('foe', took);
      }
    };
    case 'charge': {
      let charged = false, rest = 0;
      return {
        ...base,
        onPhase2: g => { charged = true; g.note('start'); g.note('charge'); },
        onTurnStart: g => {
          if (g.phase !== 2 || charged) return;
          if (rest > 0) { rest--; return; }
          charged = true;
          g.note('charge');
        },
        onDamage: g => {
          if (g.phase !== 2 || !charged || g.side !== 'foe' || !g.move || g.move.type !== 'electric') return 1;
          charged = false;
          rest = 1;               // one quiet turn before it charges again
          g.note('spend');
          return CHARGE_MULT;
        }
      };
    }
    case 'barrier': {
      let up = false;
      return {
        ...base,
        onPhase2: g => { up = true; g.note('start'); },
        onDamage: g => {
          if (g.phase !== 2 || !up || g.side !== 'me' || !(g.dmg > 0)) return 1;
          up = false;
          g.note('break');
          return BARRIER_MULT;
        }
      };
    }
    case 'vanish': {
      let pending = false, hidden = false;
      return {
        ...base,
        onPhase2: g => { pending = true; g.note('start'); },
        onTurnStart: g => {
          if (hidden) { hidden = false; g.note('show'); }
          if (pending && g.phase === 2) { pending = false; hidden = true; g.note('hide'); }
        },
        onDamage: g => {
          if (!hidden || g.side !== 'me') return 1;
          g.note('miss');
          return 0;
        }
      };
    }
    default: return null;
  }
}

// ------------------------------------------------------------
// Progress
// ------------------------------------------------------------
const roadOf = p => (p && p.road && typeof p.road === 'object' ? p.road : {});
const clearedOf = p => (roadOf(p).cleared && typeof roadOf(p).cleared === 'object' ? roadOf(p).cleared : {});
const beatenOf = p => (p && p.gyms && p.gyms.beaten && typeof p.gyms.beaten === 'object' ? p.gyms.beaten : {});
const r2BloomedOf = p => (Array.isArray(roadOf(p).r2bloomed) ? roadOf(p).r2bloomed : []);

/** ROUND 2 is open once the Champion chapter is done (Road or classic). */
export const r2Unlocked = p => !!p && isChapterDone(p, R2_CHAMP);

/** Round 2 trainer beaten on the Road, or in the classic Round 2 ('rock:0:r2'). */
export function isR2Cleared(p, i, j) {
  const ch = CHAPTERS[i];
  if (!ch || !Number.isInteger(j) || j < 0 || j > leaderIdx(i)) return false;
  return !!clearedOf(p)[r2Key(i, j)] || !!beatenOf(p)[trainerKey(ch.key, j, R2_ROUND)];
}

export const isR2ChapterDone = (p, i) => isR2Cleared(p, i, leaderIdx(i)) || r2BloomedOf(p).includes(i);

export function isR2ChapterOpen(p, i) {
  if (!CHAPTERS[i] || !r2Unlocked(p)) return false;
  return i === 0 || isR2ChapterDone(p, i - 1);
}

/** Beaten Round 2 trainers stay open for rematches. */
export function isR2TrainerOpen(p, i, j) {
  if (!isR2ChapterOpen(p, i)) return false;
  if (!Number.isInteger(j) || j < 0 || j > leaderIdx(i)) return false;
  return j === 0 || isR2Cleared(p, i, j) || isR2Cleared(p, i, j - 1);
}

/** First Round 2 chapter whose leader is not beaten; CHAPTERS.length when all are. */
export function r2Current(p) {
  for (let i = 0; i < CHAPTERS.length; i++) if (!isR2ChapterDone(p, i)) return i;
  return CHAPTERS.length;
}

/** The next unbeaten Round 2 trainer {i, j}, or null (locked, or all done). */
export function r2Next(p) {
  if (!r2Unlocked(p)) return null;
  const i = r2Current(p);
  if (i >= CHAPTERS.length) return null;
  for (let j = 0; j <= leaderIdx(i); j++) if (!isR2Cleared(p, i, j)) return { i, j };
  return null;
}

/** Chapters re-bloomed in gold (sorted, unique, 0..11). */
export function goldChapters(p) {
  const out = [];
  for (let i = 0; i < CHAPTERS.length; i++) if (isR2ChapterDone(p, i)) out.push(i);
  return out;
}

export function r2BattleParams(i, j) {
  const t = r2Trainers(i)[j];
  if (!t) return null;
  const leader = j === leaderIdx(i);
  const out = {
    enemyTeam: t.team.map(m => ({ id: m.id, level: m.level })),
    trainer: { name: t.name, taunt: t.taunt, leader },
    wild: false,
    returnTo: 'road',
    onEnd: 'round2:' + i + ':' + j
  };
  if (leader && gimmickFor(i)) out.gimmick = gimmickFor(i);
  return out;
}

/** 'round2:3:4' -> {i:3, j:4}; anything malformed -> null. */
export function parseR2End(s) {
  const m = /^round2:(\d{1,2}):(\d{1,2})$/.exec(typeof s === 'string' ? s : '');
  if (!m) return null;
  const i = +m[1], j = +m[2];
  if (!CHAPTERS[i] || j > leaderIdx(i)) return null;
  return { i, j };
}

function ensureRoad(p) {
  if (!p.road || typeof p.road !== 'object') p.road = {};
  const r = p.road;
  if (!r.cleared || typeof r.cleared !== 'object') r.cleared = {};
  if (!Array.isArray(r.r2bloomed)) r.r2bloomed = [];
  return r;
}

/** Give the ace as a shiny: caught + shinies (+ mons at its level if new, + team if room). Never lowers anything. */
function giveShinyAce(p, ace) {
  if (!Array.isArray(p.caught)) p.caught = [];
  if (!Array.isArray(p.shinies)) p.shinies = [];
  if (!Array.isArray(p.team)) p.team = [];
  if (!p.mons || typeof p.mons !== 'object') p.mons = {};
  const newCatch = !p.caught.includes(ace.id);
  const newShiny = !p.shinies.includes(ace.id);
  if (newCatch) p.caught.push(ace.id);
  if (newShiny) p.shinies.push(ace.id);
  const m = p.mons[ace.id];
  if (!m || typeof m !== 'object') p.mons[ace.id] = { level: ace.level, xp: 0 };
  if (newCatch && p.team.length < 6 && !p.team.includes(ace.id)) p.team.push(ace.id);
  return { newCatch, newShiny };
}

/**
 * Record a Round 2 WIN. Mutates the player (caller commits). Idempotent.
 * Needs Round 2 to be unlocked and that trainer to be open.
 * -> null, or {i, j, leader, bloom, ace, newShiny}; bloom is true only the
 * first time that leader falls (road.r2bloomed is already written by then).
 * Every leader win (re)confirms the shiny ace; nothing is ever removed.
 */
export function applyR2Win(p, onEnd) {
  const at = parseR2End(onEnd);
  if (!at || !p || !isR2TrainerOpen(p, at.i, at.j)) return null;
  const { i, j } = at;
  const r = ensureRoad(p);
  r.cleared[r2Key(i, j)] = true;
  const leader = j === leaderIdx(i);
  let bloom = false, ace = 0, newShiny = false;
  if (leader) {
    if (!r.r2bloomed.includes(i)) {
      r.r2bloomed.push(i);
      r.r2bloomed.sort((a, b) => a - b);
      bloom = true;
    }
    const a = r2Ace(i);
    if (a) { ace = a.id; newShiny = giveShinyAce(p, a).newShiny; }
  }
  return { i, j, leader, bloom, ace, newShiny };
}

/** Plain primitives for route params: what the battle's early apply changed. */
export const r2Marks = o => ({ bloom: !!(o && o.bloom), shiny: !!(o && o.newShiny) });

/**
 * road.js on the way back. Re-applies the win (a no-op normally, a repair if
 * the early write was lost) and rebuilds the celebration from the marks.
 * -> null or the applyR2Win shape.
 */
export function r2Return(p, onEnd, result, marks) {
  if (result !== 'win') return null;
  const o = applyR2Win(p, onEnd);
  if (!o) return null;
  const m = marks && typeof marks === 'object' && !Array.isArray(marks) ? marks : null;
  if (m && m.bloom === true) o.bloom = true;
  if (m && m.shiny === true) o.newShiny = true;
  return o;
}
