// ============================================================
// SPROUT ROAD: RIVAL THORN, the kid who thinks the drought is his
// fault. He waits on the path after each leader Gabe beats, shows a
// picture of his team, and offers a fight. Never a gate: Gabe can
// walk straight past him.
//
// Pure data + pure logic (no DOM, no store), so node --test can load it.
// His team is deterministic: the same save always shows the same team,
// and it "grows" with Gabe because every line evolves with level.
// ============================================================

import { typeChart } from './config.js';
import {
  CHAPTERS, isChapterDone, currentChapter,
  applyWin, applyGuardianWin, parseGuardianEnd, seedCount, readyToHatch
} from './chapters.js';

export const RIVAL_NAME = 'RIVAL THORN';

/** His partner, always on the team (the ace, sent out last). He thinks
 *  its fire dried the land up. */
export const RIVAL_PARTNER = { key: 'partner', type: 'fire', ids: [4, 5, 6] };

/** Hand-picked evolving lines, keyed by the ATTACKING type they bring.
 *  ids are [baby, middle, final]; some lines have two stages. No #1-3:
 *  the Bulbasaur line belongs to the boys. */
export const RIVAL_LINES = [
  { type: 'water',    ids: [7, 8, 9] },          // Squirtle
  { type: 'electric', ids: [172, 25, 26] },      // Pichu
  { type: 'ground',   ids: [328, 329, 330] },    // Trapinch
  { type: 'rock',     ids: [74, 75, 76] },       // Geodude
  { type: 'ice',      ids: [220, 221, 473] },    // Swinub
  { type: 'fighting', ids: [66, 67, 68] },       // Machop
  { type: 'flying',   ids: [16, 17, 18] },       // Pidgey
  { type: 'psychic',  ids: [63, 64, 65] },       // Abra
  { type: 'ghost',    ids: [92, 93, 94] },       // Gastly
  { type: 'dark',     ids: [633, 634, 635] },    // Deino
  { type: 'dragon',   ids: [147, 148, 149] },    // Dratini
  { type: 'bug',      ids: [123, 212] },         // Scyther
  { type: 'steel',    ids: [374, 375, 376] },    // Beldum
  { type: 'poison',   ids: [29, 30, 31] },       // Nidoran
  { type: 'grass',    ids: [152, 153, 154] }     // Chikorita
];

// When Gabe's lead has few weaknesses, the rest of the team comes from here.
const FILL_ORDER = ['water', 'electric', 'rock', 'flying', 'psychic', 'dragon', 'ground', 'ice', 'fighting', 'ghost', 'steel', 'dark', 'bug', 'poison', 'grass'];

/** Short lines (<= 6 words, uppercase), one per chapter gap. He blames
 *  himself at first, and slowly comes round. */
export const RIVAL_LINES_SAID = [
  'MY FIRE DRIED IT ALL UP.',
  'I HAVE TO FIX IT ALONE!',
  'STAY OUT OF MY WAY!',
  'THE RAIN LEFT BECAUSE OF ME.',
  'I TRAINED EVERY DAY. WATCH!',
  'WHY IS YOUR ROAD BLOOMING?',
  'MAYBE IT WASN\'T MY FIRE...',
  'SHOW ME HOW YOU DO IT!',
  'I WON\'T GIVE UP NOW!',
  'THE TREE IS SO CLOSE!',
  'ONE LAST BATTLE, FRIEND.'
];
/** What he says when Gabe beats him. */
export const RIVAL_LOSE_LINES = ['YOU\'RE STRONG...', 'NEXT TIME, FOR SURE!', 'OK. MAYBE IT\'S NOT ME.'];

/** How many he brings: 3 in chapters 0-3, 4 in 4-7, 6 from 8 on. */
export const rivalSize = i => (i <= 3 ? 3 : i <= 7 ? 4 : 6);

/** Which stage of a line shows at a level. The rival grows with Gabe. */
export function stageAt(line, level) {
  const s = level < 16 ? 0 : level < 32 ? 1 : 2;
  return line.ids[Math.min(s, line.ids.length - 1)];
}

/** Damage multiplier of an attacking type against a list of type names. */
export function typeMult(atk, defTypes) {
  let m = 1;
  for (const t of Array.isArray(defTypes) ? defTypes : []) {
    const d = typeChart[t];
    if (!d) continue;
    if (d.w.includes(atk)) m *= 2;
    if (d.r.includes(atk)) m *= 0.5;
    if (d.i.includes(atk)) m *= 0;
  }
  return m;
}

/** Attacking types that hit these defending types super-effectively, best first. */
export function weaknesses(defTypes) {
  const out = [];
  for (const atk of Object.keys(typeChart)) {
    const m = typeMult(atk, defTypes);
    if (m > 1) out.push({ atk, m });
  }
  // Stable: by multiplier, then by the fill order, so the team never flickers.
  const rank = t => { const k = FILL_ORDER.indexOf(t); return k < 0 ? 99 : k; };
  out.sort((a, b) => b.m - a.m || rank(a.atk) - rank(b.atk));
  return out.map(x => x.atk);
}

/** Gabe's top team level (the highest level among his team, else 5). */
export function topTeamLevel(p) {
  const team = p && Array.isArray(p.team) ? p.team : [];
  const mons = (p && p.mons && typeof p.mons === 'object') ? p.mons : {};
  let top = 0;
  for (const id of team) {
    const lv = Number(mons[id] && mons[id].level);
    if (Number.isFinite(lv) && lv > top) top = lv;
  }
  return Math.max(3, Math.min(100, Math.round(top || 5)));
}

/**
 * The rival's team at chapter gap i.
 * leadTypes: type names of Gabe's lead (e.g. ['grass', 'poison']); [] is fine.
 * -> [{id, level}], partner LAST (the ace), levels scaled to Gabe.
 */
export function rivalTeam(p, i, leadTypes = []) {
  const size = rivalSize(i);
  const top = topTeamLevel(p);
  const picked = [];
  const used = new Set();
  const take = type => {
    if (used.has(type)) return;
    const line = RIVAL_LINES.find(l => l.type === type);
    if (!line) return;
    used.add(type);
    picked.push(line);
  };
  for (const t of weaknesses(leadTypes)) { if (picked.length >= size - 1) break; take(t); }
  for (const t of FILL_ORDER) { if (picked.length >= size - 1) break; take(t); }
  const lines = [...picked.slice(0, size - 1), RIVAL_PARTNER];
  // Ace at Gabe's top level, the others a little below it.
  return lines.map((line, k) => {
    const level = Math.max(3, Math.min(100, top - (lines.length - 1 - k)));
    return { id: stageAt(line, level), level };
  });
}

/** Where the rival stands: the gap after the last chapter Gabe finished
 *  (between chapter i and i+1), or -1 when he is not on the Road.
 *  He leaves a gap once Gabe beats him there (road.rival.last >= i). */
export function rivalSpot(p) {
  const cur = currentChapter(p);
  const i = cur - 1;
  if (i < 0 || i >= CHAPTERS.length - 1 || !isChapterDone(p, i)) return -1;
  const rv = (p && p.road && p.road.rival) || {};
  const last = Number.isInteger(rv.last) ? rv.last : -1;
  return last >= i ? -1 : i;
}

export const rivalLine = i => RIVAL_LINES_SAID[Math.max(0, Math.min(RIVAL_LINES_SAID.length - 1, i))];

export function rivalParams(p, i, leadTypes = []) {
  return {
    enemyTeam: rivalTeam(p, i, leadTypes),
    trainer: { name: RIVAL_NAME, taunt: rivalLine(i), leader: false },
    wild: false,
    returnTo: 'road',
    onEnd: 'rival:' + i
  };
}

/** 'rival:3' -> 3; anything else -> -1. */
export function parseRivalEnd(s) {
  const m = /^rival:(\d{1,2})$/.exec(typeof s === 'string' ? s : '');
  if (!m) return -1;
  const i = +m[1];
  return i >= 0 && i < CHAPTERS.length - 1 ? i : -1;
}

/**
 * Record a rival fight. Mutates the player (caller commits).
 * win  -> wins+1, last = i (he steps aside for this gap).
 * lose -> losses+1; he stays, so Gabe can try again whenever he likes.
 * Anything else (fled) changes nothing. A win at a gap already settled
 * (a stale onEnd) counts nothing. -> {i, result} | null.
 */
export function applyRivalResult(p, onEnd, result) {
  const i = parseRivalEnd(onEnd);
  if (i < 0 || !p || (result !== 'win' && result !== 'lose')) return null;
  if (!p.road || typeof p.road !== 'object') p.road = {};
  const r = p.road;
  if (!r.rival || typeof r.rival !== 'object') r.rival = { wins: 0, losses: 0, last: -1 };
  const rv = r.rival;
  const n = v => (Number.isInteger(v) && v >= 0 ? v : 0);
  rv.wins = n(rv.wins); rv.losses = n(rv.losses);
  if (!Number.isInteger(rv.last)) rv.last = -1;
  if (result === 'win') {
    if (rv.last >= i) return null;
    rv.wins = Math.min(99999, rv.wins + 1);
    rv.last = i;
  } else {
    rv.losses = Math.min(99999, rv.losses + 1);
  }
  return { i, result };
}

// ============================================================
// A ROAD RESULT, SAVED EARLY (batch 3 fixer)
// battle.js saves a Road win/lose in the same commit as the XP, because the
// evolve screen can sit between the battle and road.js. road.js then calls
// roadReturn() with the marks the battle handed back: the save is re-applied
// (idempotent) and the celebration (bloom, seed, rival bye) still plays.
// ============================================================

/** Apply every Road outcome of one battle. Mutates p (caller commits). */
export function settleRoadEnd(p, onEnd, result) {
  let outcome = null, gOutcome = null, rOutcome = null;
  if (result === 'win' && onEnd) {
    outcome = applyWin(p, onEnd);
    gOutcome = applyGuardianWin(p, onEnd);
  }
  if (onEnd && (result === 'win' || result === 'lose')) rOutcome = applyRivalResult(p, onEnd, result);
  return { outcome, gOutcome, rOutcome };
}

/** Plain primitives for route params: what the early apply changed. */
export const roadMarks = o => ({
  bloom: !!(o && o.outcome && o.outcome.bloom),
  seed: !!(o && o.gOutcome),
  rival: o && o.rOutcome ? o.rOutcome.result : ''
});

/**
 * road.js on the way back from a battle. With no marks (an older route, or
 * the battle could not apply early) this is settleRoadEnd. With marks, the
 * win is re-applied (a no-op normally, a repair if the early write was lost)
 * and the outcomes are rebuilt from the marks so the celebration still plays;
 * the rival is NOT counted twice.
 */
export function roadReturn(p, onEnd, result, applied) {
  const early = applied && typeof applied === 'object' && !Array.isArray(applied) ? applied : null;
  if (!early) return settleRoadEnd(p, onEnd, result);
  let outcome = null, gOutcome = null, rOutcome = null;
  if (result === 'win' && onEnd) {
    outcome = applyWin(p, onEnd);
    if (outcome && early.bloom === true) outcome = { ...outcome, bloom: true };
    gOutcome = applyGuardianWin(p, onEnd);
    if (!gOutcome && early.seed === true) {
      const i = parseGuardianEnd(onEnd);
      if (i >= 0) gOutcome = { i, seeds: seedCount(p), hatch: readyToHatch(p) };
    }
  }
  const ri = parseRivalEnd(onEnd);
  if (ri >= 0 && early.rival === result && (result === 'win' || result === 'lose')) rOutcome = { i: ri, result };
  return { outcome, gOutcome, rOutcome };
}
