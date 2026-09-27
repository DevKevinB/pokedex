// ============================================================
// Pokédex OS — battle engine (pure)
//
// Every number that decides what happens in a fight lives here, and NOTHING
// in this file touches the DOM, localStorage, the network or the clock. That
// is the whole point: it can be tested by `node --test test/engine.test.mjs`
// in about a second, so a change to the damage formula stops being a scary
// change made blind inside a 1000-line UI file.
//
// Randomness is injected, never called directly, so tests are deterministic.
// ============================================================

import { getTypeMultiplier } from './config.js';

export const DEFAULT_LEVEL = 5;
export const MAX_LEVEL = 100;

// ---- stats ----
// Includes special attack/defence, which the game fetched from the API and
// then ignored — every move resolved against physical stats, which quietly
// gutted Alakazam, Gengar and most gym aces. Exactly the Pokémon a 7-year-old
// picks because they look coolest.
export function computeStats(data, level) {
  const base = n => data.stats.find(s => s.stat.name === n)?.base_stat || 50;
  return {
    maxHp: Math.floor((base('hp') * 2 * level) / 100 + level + 10),
    atk: Math.floor((base('attack') * 2 * level) / 100 + 5),
    def: Math.floor((base('defense') * 2 * level) / 100 + 5),
    spatk: Math.floor((base('special-attack') * 2 * level) / 100 + 5),
    spdef: Math.floor((base('special-defense') * 2 * level) / 100 + 5),
    speed: Math.floor((base('speed') * 2 * level) / 100 + 5)
  };
}

// ---- damage ----
export const CRIT_CHANCE = 1 / 16;
export const CRIT_MULT = 1.5;
export const STAB_MULT = 1.5;
export const SPARKLE_MULT = 1.5;        // was 2.0 — see the Sparkle rescope
export const VARIANCE_MIN = 0.85;       // real games roll 85-100%
export const MAX_HIT_FRACTION = 0.60;   // no single hit deletes a full-health mon
export const JUNIOR_MIN_HIT = 0.15;
export const JUNIOR_MAX_TAKE = 0.40;

/**
 * The one damage formula. Returns everything the UI needs to narrate the hit,
 * so callers never recompute any part of it.
 *
 * opts.rng      () => [0,1)  — injected for determinism
 * opts.junior   'attacker' | 'defender' | null
 */
export function computeDamage(attacker, defender, move, opts = {}) {
  const rng = opts.rng || Math.random;
  const typeMult = getTypeMultiplier(move.type, defender.types);

  // Physical moves use atk/def, special moves use spatk/spdef. Falls back to
  // the physical stats so a fighter built before this existed still works.
  const special = move.damage_class === 'special';
  const atk = (special ? attacker.spatk : attacker.atk) ?? attacker.atk;
  const def = (special ? defender.spdef : defender.def) ?? defender.def;

  let damage = (((2 * attacker.level / 5 + 2) * (move.power || 40) * (atk / def)) / 50) + 2;
  damage *= typeMult;

  const stab = attacker.types?.some(t => t.type?.name === move.type);
  if (stab) damage *= STAB_MULT;

  const crit = typeMult > 0 && rng() < CRIT_CHANCE;
  if (crit) damage *= CRIT_MULT;

  if (opts.sparkle) damage *= SPARKLE_MULT;

  // Variance last, so it never turns a 0x into a hit.
  if (typeMult > 0) damage *= VARIANCE_MIN + rng() * (1 - VARIANCE_MIN);

  // Ceiling: losing a Pokémon to a single unseen hit is the least fun thing
  // that can happen in a fight, especially to a child who picked that one.
  if (typeMult > 0) damage = Math.min(damage, defender.maxHp * MAX_HIT_FRACTION);

  // Junior Mode floor and ceiling. Never advertised, never in VS, and never
  // able to resurrect an immune matchup.
  if (opts.junior === 'attacker' && typeMult > 0) {
    damage = Math.max(damage, defender.maxHp * JUNIOR_MIN_HIT);
  }
  if (opts.junior === 'defender') {
    damage = Math.min(damage, defender.maxHp * JUNIOR_MAX_TAKE);
  }

  if (typeMult === 0) damage = 0;
  return { damage, typeMult, crit, stab, special };
}

// ---- catching ----
// ONE catch formula. There used to be two: the dex screen ignored HP entirely
// while the battle screen scaled by it, so the same ball on the same species
// had different odds depending on which screen you threw it from.
export function catchProbability({ captureRate = 45, ballMod = 1, hp = null, maxHp = null, junior = false, master = false }) {
  if (junior || master) return 1;
  // No HP context (dex screen) = treat as a full-health wild Pokémon.
  const hpFactor = (hp != null && maxHp)
    ? (3 * maxHp - 2 * Math.max(0, hp)) / (3 * maxHp)   // 1/3 at full → 1 near zero
    : 1 / 3;
  const p = hpFactor * (captureRate / 255) * ballMod;
  return Math.max(0.03, Math.min(0.95, p));
}

// ---- growth ----
export function xpThreshold(level) { return 25 + level * 10; }

export function xpForKO(defeated) {
  return Math.floor((defeated.base_experience || 60) / 2 + defeated.level * 3);
}

/** Pure level-up maths. Returns the new {level, xp, ups} without mutating. */
export function applyXp(mon, amount) {
  let { level, xp } = { level: mon.level ?? DEFAULT_LEVEL, xp: mon.xp ?? 0 };
  xp += amount;
  let ups = 0;
  while (level < MAX_LEVEL && xp >= xpThreshold(level)) {
    xp -= xpThreshold(level);
    level++;
    ups++;
  }
  if (level >= MAX_LEVEL) { level = MAX_LEVEL; xp = 0; }
  return { level, xp, ups };
}

/** Fraction of the way to the next level, for the XP bar. */
export function xpProgress(mon) {
  const level = mon?.level ?? DEFAULT_LEVEL;
  if (level >= MAX_LEVEL) return 1;
  return Math.max(0, Math.min(1, (mon?.xp ?? 0) / xpThreshold(level)));
}

// ---- opponent AI ----
/**
 * smart = trainers pick the best move 70% of the time.
 * Junior Mode passes smart:false — a gym ace chaining super-effective hits on
 * a 4-year-old is not a difficulty curve, it's a wall.
 */
export function pickMove(moves, target, { smart = false, rng = Math.random } = {}) {
  if (!moves || !moves.length) return { name: 'tackle', power: 40, type: 'normal', damage_class: 'physical' };
  if (smart && rng() < 0.7) {
    return [...moves].sort((a, b) => {
      const ma = getTypeMultiplier(a.type, target.types), mb = getTypeMultiplier(b.type, target.types);
      return (mb - ma) || ((b.power || 0) - (a.power || 0));
    })[0];
  }
  return moves[Math.floor(rng() * moves.length)];
}

// ---- moveset hygiene ----
export const MAX_MOVE_POWER = 120;
const BANNED_MOVES = new Set(['explosion', 'self-destruct', 'selfdestruct', 'memento', 'healing-wish', 'lunar-dance', 'final-gambit']);

/** Unbiased shuffle. `sort(() => 0.5 - Math.random())` is not one. */
export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Keeps only moves that actually damage. Status moves used to arrive with
 * power `null`, get defaulted to 40, and be presented as attacks — Hypnosis
 * was a 40-power hit. Nukes are excluded because the AI will find them and
 * spam them deterministically.
 */
export function usableMoves(moves) {
  return (moves || []).filter(m => {
    if (!m) return false;
    if (BANNED_MOVES.has(m.name)) return false;
    if (m.damage_class === 'status') return false;
    return typeof m.power === 'number' && m.power > 0;
  });
}

export function clampPower(power) {
  return Math.min(MAX_MOVE_POWER, Math.max(10, power || 40));
}

// ---- deterministic movesets ----
// Movesets used to be re-rolled from a fresh shuffle on every send-out, so no
// Pokémon in the game ever "knew" anything. These functions make a moveset a
// FACT about a Pokémon instead of a dice roll.

/**
 * The same LCG as pickDailyQuests() in progression.js — glibc's constants,
 * masked to 31 bits. It is not a strong generator; it is a REPEATABLE one,
 * which is the entire point: the same seed must produce the same four moves
 * on every device, forever.
 */
export function seededRng(seed) {
  let s = Math.floor(Math.abs(Number(seed) || 0)) % 0x7fffffff;
  if (s === 0) s = 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

/** Mixes small integers (player, species id, level…) into one 31-bit seed. */
export function moveSeed(...parts) {
  let h = 5381;
  for (const p of parts) h = ((h * 33) + ((Math.floor(Number(p)) || 0) * 7919)) & 0x7fffffff;
  return h;
}

/** A moveset is re-rolled at most once every this many levels. */
export const LEVEL_BAND = 10;

// Distinct types first: four attacks in four colours are four DIFFERENT
// buttons to a 4-year-old who cannot read their names.
function typeSpread(list) {
  const seen = new Set(), first = [], rest = [];
  for (const m of list) {
    if (seen.has(m.type)) rest.push(m); else { seen.add(m.type); first.push(m); }
  }
  return first.concat(rest);
}

// A CHARIZARD with no fire move is a broken promise, and now it would be a
// PERMANENT one. Slot 1 goes to a move of the Pokémon's own primary type when
// the pool has one (its secondary type otherwise) — which is also the move
// that gets the STAB bonus, so the obvious-looking button is the strong one.
function stabFirst(list, types) {
  const names = (types || []).map(t => (typeof t === 'string' ? t : t && t.type && t.type.name)).filter(Boolean);
  for (const t of names) {
    const i = list.findIndex(m => m.type === t);
    if (i > 0) return [list[i], ...list.slice(0, i), ...list.slice(i + 1)];
    if (i === 0) return list;
  }
  return list;
}

/**
 * Four moves that stay the same until the Pokémon grows.
 *
 * `moves` may be move NAMES (resolved through `lookup`, normally api.moveStats
 * reading the baked data/moves.json) or already-resolved move objects.
 *
 * Three slots are fixed for the life of the Pokémon; the fourth is re-rolled
 * once per `band` levels, so levelling can bring a new attack without ever
 * rewriting a moveset a child has learned. Adjacent bands differ by at most
 * one move.
 *
 * Returns [] when nothing usable resolved, so the caller can fall back.
 */
export function seedMoveset(moves, { seed = 0, level = 0, lookup = null, types = null, limit = 4, band = LEVEL_BAND } = {}) {
  const resolved = (moves || []).map(m => {
    if (m && typeof m === 'object') return m;
    const name = String(m || '').toLowerCase();
    const d = name && lookup ? lookup(name) : null;
    return d ? { name, power: d.power ?? d.p ?? null, type: d.type ?? d.t ?? 'normal', damage_class: d.damage_class ?? d.c ?? 'status' } : null;
  }).filter(Boolean);

  const pool = usableMoves(resolved).map(m => ({
    name: m.name, power: clampPower(m.power), type: m.type, damage_class: m.damage_class
  }));
  if (!pool.length) return [];

  const ordered = stabFirst(typeSpread(shuffle(pool, seededRng(seed))), types);
  const core = ordered.slice(0, Math.max(1, limit - 1));
  if (pool.length <= core.length) return core;

  const rest = ordered.filter(m => !core.includes(m));
  const bandIdx = Math.max(0, Math.floor((Number(level) || 0) / (band || LEVEL_BAND)));
  const grown = rest[Math.floor(seededRng(moveSeed(seed, bandIdx))() * rest.length)] || rest[0];
  return core.concat([grown]).slice(0, limit);
}

// ---- wild level bands ----
/**
 * Wild levels used to be lead*(0.8+rand*0.4) everywhere, which is why week 4
 * of play is mathematically identical to day 2: the world always scales to
 * you, so nothing is ever hard and nothing is ever safe. Habitats now have
 * their own base band that rises with badges — but leashed to the lead so a
 * habitat can never become an unwinnable wall for ART.
 */
export function wildLevel({ base = 5, spread = 3, badges = 0, leadLevel = 5, junior = false, rng = Math.random }) {
  const banded = base + badges * 2 + Math.floor(rng() * (spread + 1));
  const lo = junior ? leadLevel - 3 : leadLevel - 5;
  const hi = junior ? leadLevel + 5 : leadLevel + 8;
  return Math.max(2, Math.min(MAX_LEVEL, Math.round(Math.max(lo, Math.min(hi, banded)))));
}
