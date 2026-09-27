// ============================================================
// SPROUT ROAD: FARAWAY LAND'S SANCTUMS (roots builder)
// Pure data + rules for THROUGH THE ROOTS (ROADMAP 5.2 Thread B postgame).
//
// After the Champion chapter blooms, a door glows in the Venusaur Tree's
// roots. Through it lie eight legendary shrines. Each shrine holds one to
// three legendaries; each legendary is its own sanctum key in
// road.roots.sanctums (e.g. 'articuno'). Beat or catch one and it rests
// in its shrine for good. Lose or run: it simply waits. No timers, no
// fleeing, no penalty.
//
// When every legendary in the eight shrines is resting, the FOREST shrine
// appears in the middle: Celebi, the forest guardian, with Art's Bulba.
//
// Every legendary here is ALSO still catchable in FARAWAY LAND's tall
// grass if data/habitats.js lists it there (see inGrass()).
// DOM-free: unit-tested in test/roots.test.mjs.
// ============================================================

import { FARAWAY, farawayOpen } from './habitats.js';
import { addSanctum, cleanRoots } from '../core/validate.js';

export const SANCTUM_LEVEL = 70;          // the first shrine; each one after is +1
export const FINALE_LEVEL = 80;
export const BULBA_LINE = [1, 2, 3];      // Bulba's stage 1..3 -> Bulbasaur / Ivysaur / Venusaur

const mon = (key, id, name) => Object.freeze({ key, id, name });

/** The eight shrines, in the order they sit in the grid (3x3, the finale in the middle). */
export const SHRINES = Object.freeze([
  { key: 'sky', name: 'SKY SHRINE', emoji: '\u{1FAB6}', palette: { a: '#8fd3ff', b: '#27466e' },
    mons: [mon('articuno', 144, 'ARTICUNO'), mon('zapdos', 145, 'ZAPDOS'), mon('moltres', 146, 'MOLTRES')] },
  { key: 'beasts', name: 'BEAST SHRINE', emoji: '\u{1F43E}', palette: { a: '#ffb36b', b: '#5a2e1a' },
    mons: [mon('raikou', 243, 'RAIKOU'), mon('entei', 244, 'ENTEI'), mon('suicune', 245, 'SUICUNE')] },
  { key: 'lakes', name: 'LAKE SHRINE', emoji: '\u{1F4A7}', palette: { a: '#9fe8ff', b: '#1f4f63' },
    mons: [mon('uxie', 480, 'UXIE'), mon('mesprit', 481, 'MESPRIT'), mon('azelf', 482, 'AZELF')] },
  { key: 'stones', name: 'STONE SHRINE', emoji: '\u{1FAA8}', palette: { a: '#e0c9a0', b: '#4a3f33' },
    mons: [mon('regirock', 377, 'REGIROCK'), mon('regice', 378, 'REGICE'), mon('registeel', 379, 'REGISTEEL')] },
  { key: 'dream', name: 'DREAM SHRINE', emoji: '\u{1F52E}', palette: { a: '#ffb8e6', b: '#4d2a5c' },
    mons: [mon('mew', 151, 'MEW'), mon('mewtwo', 150, 'MEWTWO')] },
  { key: 'bells', name: 'BELL SHRINE', emoji: '\u{1F514}', palette: { a: '#ffe27a', b: '#5c4415' },
    mons: [mon('lugia', 249, 'LUGIA'), mon('hooh', 250, 'HO-OH')] },
  { key: 'storm', name: 'STORM SHRINE', emoji: '\u{1F30A}', palette: { a: '#7fe0b0', b: '#1d4a3c' },
    mons: [mon('kyogre', 382, 'KYOGRE'), mon('groudon', 383, 'GROUDON'), mon('rayquaza', 384, 'RAYQUAZA')] },
  { key: 'stars', name: 'STAR SHRINE', emoji: '\u{1F30C}', palette: { a: '#b9a8ff', b: '#231c4d' },
    mons: [mon('dialga', 483, 'DIALGA'), mon('palkia', 484, 'PALKIA'), mon('giratina', 487, 'GIRATINA')] }
].map((s, i) => Object.freeze({ ...s, level: SANCTUM_LEVEL + i, finale: false, mons: Object.freeze(s.mons) })));

/** The grand finale: the forest guardian, only once every other legendary rests. */
export const FINALE = Object.freeze({
  key: 'forest', name: 'FOREST SHRINE', emoji: '\u{1F343}', palette: { a: '#b6f28a', b: '#1f4a22' },
  level: FINALE_LEVEL, finale: true,
  mons: Object.freeze([mon('celebi', 251, 'CELEBI')])
});

export const ALL_SHRINES = Object.freeze([...SHRINES, FINALE]);
/** Every legendary (finale last): [{key, id, name, shrine, level}] */
export const LEGENDS = Object.freeze(ALL_SHRINES.flatMap(s => s.mons.map(m => Object.freeze({ ...m, shrine: s.key, level: s.level }))));

export const legendByKey = key => LEGENDS.find(l => l.key === key) || null;
export const shrineByKey = key => ALL_SHRINES.find(s => s.key === key) || null;

// ---------------------------------------------------------------- progress

const rootsOf = p => cleanRoots(p && p.road && p.road.roots);

/** The glowing door: open once the Champion chapter has bloomed (FARAWAY LAND's own rule). */
export const doorOpen = p => !!p && farawayOpen(p);
/** Has he stepped through the door before? */
export const rootsOpened = p => rootsOf(p).opened === true;
/** Is this legendary resting in its shrine? */
export const isResting = (p, key) => !!legendByKey(key) && rootsOf(p).sanctums[key] === true;
/** Every legendary in this shrine rests. */
export const shrineDone = (p, shrine) => {
  const s = typeof shrine === 'string' ? shrineByKey(shrine) : shrine;
  return !!s && s.mons.every(m => isResting(p, m.key));
};
/** How many legendaries of this shrine rest. */
export const shrineCount = (p, s) => s.mons.filter(m => isResting(p, m.key)).length;
/** The forest shrine appears when all eight shrines are done. */
export const finaleOpen = p => SHRINES.every(s => shrineDone(p, s));
/** Everything, Celebi included. */
export const allDone = p => finaleOpen(p) && shrineDone(p, FINALE);
/** Shrines that show right now: the eight, plus the forest once it opens. */
export const visibleShrines = p => (finaleOpen(p) ? ALL_SHRINES : SHRINES);
/** A legendary he can challenge right now (the finale only once it appears). */
export const canChallenge = (p, key) => {
  const l = legendByKey(key);
  if (!l || !doorOpen(p)) return false;
  return l.shrine === FINALE.key ? finaleOpen(p) : true;
};
/** -> {resting, total} over what is visible now. */
export function progress(p) {
  const shown = visibleShrines(p).flatMap(s => s.mons);
  return { resting: shown.filter(m => isResting(p, m.key)).length, total: shown.length };
}

/** Still catchable in FARAWAY LAND's tall grass too? */
export const inGrass = id => Array.isArray(FARAWAY.L) && FARAWAY.L.includes(id);

// ---------------------------------------------------------------- battles

export const SANCTUM_PREFIX = 'sanctum:';
export const sanctumOnEnd = key => SANCTUM_PREFIX + key;

/** 'sanctum:<key>' -> the legend's key, or null. */
export function parseSanctumEnd(s) {
  if (typeof s !== 'string' || !s.startsWith(SANCTUM_PREFIX)) return null;
  const key = s.slice(SANCTUM_PREFIX.length);
  return legendByKey(key) ? key : null;
}

/** Battle params for one legendary (the caller adds berries). null for an unknown key. */
export function sanctumParams(key) {
  const l = legendByKey(key);
  if (!l) return null;
  return {
    enemyTeam: [{ id: l.id, level: l.level }],
    trainer: null,
    wild: true,
    legendary: true,
    returnTo: 'roots',
    onEnd: sanctumOnEnd(key)
  };
}

/**
 * Back from a sanctum battle. A win or a catch lays the legendary to rest
 * (mutates p; the caller commits). A loss or a run changes nothing: the
 * legendary just waits. -> {key, fresh, finale} | null
 *   fresh:  it was not resting before
 *   finale: this rest just made the forest shrine appear
 */
export function applySanctumEnd(p, onEnd, result) {
  const key = parseSanctumEnd(onEnd);
  if (!key || !p || (result !== 'win' && result !== 'caught')) return null;
  const was = isResting(p, key);
  const finaleBefore = finaleOpen(p);
  if (!addSanctum(p, key)) return null;
  return { key, fresh: !was, finale: !finaleBefore && finaleOpen(p) };
}

// ---------------------------------------------------------------- Art's Bulba

/**
 * Art's BULBA for the finale: the prereader's partner (the other player
 * first, then the current one), else the other player's. Stage 3 is
 * Venusaur. -> dex id 1..3 (Bulbasaur when nothing is known).
 */
export function artBulbaId(save, current) {
  const players = (save && save.players) || {};
  const other = Number(current) === 2 ? 1 : 2;
  const order = [other, Number(current) === 2 ? 2 : 1];
  const pick = order.map(n => players[n]).find(q => q && q.profile === 'prereader') || players[other];
  const stage = Number(pick && pick.bulba && pick.bulba.stage);
  return BULBA_LINE[Number.isInteger(stage) && stage >= 1 && stage <= 3 ? stage - 1 : 0];
}
