// ============================================================
// SPROUT ROAD — PRO RULES (ROADMAP 5.4, "the grown-up layer")
//
// createProBattle(opts) has the SAME interface as createBattle(opts)
// (state, choose(action), foeIntent(), foeIntentMove()) and plays the same
// base events, plus richer ones:
//
//   {type:'status',  side, status:'brn'|'psn'|'par'|'slp'|'frz', what:'inflict'|'tick'|'cant'|'wake'|'thaw', dmg?, hpAfter?, tox?}
//   {type:'stage',   side, stat:'atk'|'def'|'spatk'|'spdef'|'spe'|'acc'|'eva', delta, value}   (delta 0 = already at the cap)
//   {type:'ability', side, ability}          (intimidate, levitate, sturdy, static, flame-body, ...)
//   {type:'miss',    side, move, reason:'miss'|'protected'|'failed'|'immune'}
//   {type:'protect', side, ok}
//   {type:'weather', weather:'rain'|'sun'|null}
//   {type:'hurt',    side, cause:'recoil', dmg, hpAfter}
//   {type:'heal',    side, index, amount, hpAfter}     (berries, heal moves, drain)
//   {type:'switch',  side:'me'|'foe', index}           (the foe can switch now)
//   {type:'move', ..., status:true}                     a status move (dmg 0, nothing to count up)
//
// What changes under Pro Rules: five status conditions, stat stages -6..+6,
// priority and real speed order, accuracy and evasion, ~15 curated
// abilities, rain and sun (so Swift Swim and Chlorophyll mean something), and
// NO 60% single-hit cap. createBattle itself is untouched: the kids' rules
// are exactly what they were.
//
// A prereader NEVER gets Pro Rules: createProBattle({profile:'prereader'})
// hands back a plain createBattle, so every Junior protection stays on.
//
// Everything random comes from the injected rng, in a fixed order, so one
// seed replays one fight exactly (Dad's Challenge seed codes rely on it).
// No module-level mutable state; every table below is frozen data.
// ============================================================

import { getTypeMultiplier } from '../data/config.js';
import {
  catchProbability, xpForKO, applyXp, pickMove, usableMoves,
  CRIT_CHANCE, CRIT_MULT, STAB_MULT, VARIANCE_MIN
} from '../data/engine.js';
import { createBattle, BALL_MODS, BERRY_HEAL, PHASE2_AT, PHASE2_HEAL, PHASE2_ATK } from './createBattle.js';

export const STATS = Object.freeze(['atk', 'def', 'spatk', 'spdef', 'spe', 'acc', 'eva']);
export const STAGE_MIN = -6, STAGE_MAX = 6;
export const STATUSES = Object.freeze(['brn', 'psn', 'par', 'slp', 'frz']);
export const PAR_SPEED = 0.25, PAR_SKIP = 0.25, THAW = 0.2, BURN_ATK = 0.5;
export const RESIDUAL = 1 / 8;           // burn and poison chip per turn
export const WEATHER_TURNS = 5;
export const CONTACT_CHANCE = 0.3;       // Static / Flame Body
export const PINCH = 1 / 3;              // Blaze / Torrent / Overgrow / Swarm

const freeze = o => Object.freeze(o);

// ---------------------------------------------------------------- priority
export const PRIORITY = freeze({
  'quick-attack': 1, 'aqua-jet': 1, 'mach-punch': 1, 'bullet-punch': 1, 'ice-shard': 1,
  'shadow-sneak': 1, 'vacuum-wave': 1, 'extreme-speed': 2, protect: 4, detect: 4
});

// Damaging moves under 100% accuracy (everything not listed never misses
// except through accuracy / evasion stages).
export const ACCURACY = freeze({
  thunder: 70, blizzard: 70, hurricane: 70, 'focus-blast': 70, 'fire-blast': 85, 'hydro-pump': 80,
  'stone-edge': 80, 'rock-slide': 90, 'rock-throw': 90, 'rock-tomb': 80, 'mega-punch': 85, 'mega-kick': 75,
  'dynamic-punch': 50, 'zap-cannon': 50, inferno: 50, 'cross-chop': 80, 'head-smash': 80, 'iron-tail': 75,
  megahorn: 85, 'aqua-tail': 90, crabhammer: 90, 'play-rough': 90, slam: 75, 'razor-leaf': 95, 'mud-shot': 95,
  'hyper-beam': 90, 'giga-impact': 90, 'fire-spin': 85, 'poison-fang': 100, 'sky-attack': 90, 'meteor-mash': 85,
  'hammer-arm': 90, 'rock-blast': 90, 'icicle-crash': 90, 'drill-run': 95, 'air-slash': 95, 'leaf-tornado': 90,
  'mud-bomb': 85, 'octazooka': 85, 'gunk-shot': 70, 'seed-flare': 85, 'draco-meteor': 90, overheat: 90,
  'leaf-storm': 90, 'power-whip': 85, 'dragon-rush': 75, 'horn-attack': 100
});

// Secondary effects of damaging moves. chance in 0..1.
//   status:'brn'.. on the target, stages:{..} on the target, self:{..} on the user,
//   recoil / drain as a fraction of the damage dealt.
export const SECONDARY = freeze({
  ember: { chance: 0.1, status: 'brn' }, flamethrower: { chance: 0.1, status: 'brn' },
  'fire-blast': { chance: 0.1, status: 'brn' }, 'fire-punch': { chance: 0.1, status: 'brn' },
  'flame-wheel': { chance: 0.1, status: 'brn' }, 'lava-plume': { chance: 0.3, status: 'brn' },
  scald: { chance: 0.3, status: 'brn' }, 'heat-wave': { chance: 0.1, status: 'brn' },
  'blaze-kick': { chance: 0.1, status: 'brn' }, 'fire-fang': { chance: 0.1, status: 'brn' },
  'thunder-shock': { chance: 0.1, status: 'par' }, thunderbolt: { chance: 0.1, status: 'par' },
  thunder: { chance: 0.3, status: 'par' }, 'thunder-punch': { chance: 0.1, status: 'par' },
  spark: { chance: 0.3, status: 'par' }, discharge: { chance: 0.3, status: 'par' },
  'body-slam': { chance: 0.3, status: 'par' }, nuzzle: { chance: 1, status: 'par' },
  'thunder-fang': { chance: 0.1, status: 'par' }, 'zap-cannon': { chance: 1, status: 'par' },
  'powder-snow': { chance: 0.1, status: 'frz' }, 'ice-beam': { chance: 0.1, status: 'frz' },
  blizzard: { chance: 0.1, status: 'frz' }, 'ice-punch': { chance: 0.1, status: 'frz' },
  'ice-fang': { chance: 0.1, status: 'frz' },
  'poison-sting': { chance: 0.3, status: 'psn' }, sludge: { chance: 0.3, status: 'psn' },
  'sludge-bomb': { chance: 0.3, status: 'psn' }, 'poison-jab': { chance: 0.3, status: 'psn' },
  'gunk-shot': { chance: 0.3, status: 'psn' }, 'cross-poison': { chance: 0.1, status: 'psn' },
  smog: { chance: 0.4, status: 'psn' }, 'sludge-wave': { chance: 0.1, status: 'psn' },
  'poison-fang': { chance: 0.5, status: 'psn', tox: true },
  psychic: { chance: 0.1, stages: { spdef: -1 } }, 'shadow-ball': { chance: 0.2, stages: { spdef: -1 } },
  'bug-buzz': { chance: 0.1, stages: { spdef: -1 } }, 'energy-ball': { chance: 0.1, stages: { spdef: -1 } },
  'earth-power': { chance: 0.1, stages: { spdef: -1 } }, 'flash-cannon': { chance: 0.1, stages: { spdef: -1 } },
  'focus-blast': { chance: 0.1, stages: { spdef: -1 } }, acid: { chance: 0.1, stages: { spdef: -1 } },
  'acid-spray': { chance: 1, stages: { spdef: -2 } }, crunch: { chance: 0.2, stages: { def: -1 } },
  'iron-tail': { chance: 0.3, stages: { def: -1 } }, 'rock-smash': { chance: 0.5, stages: { def: -1 } },
  'aurora-beam': { chance: 0.1, stages: { atk: -1 } }, 'bubble-beam': { chance: 0.1, stages: { spe: -1 } },
  bubble: { chance: 0.1, stages: { spe: -1 } }, 'icy-wind': { chance: 1, stages: { spe: -1 } },
  'rock-tomb': { chance: 1, stages: { spe: -1 } }, 'mud-shot': { chance: 1, stages: { spe: -1 } },
  bulldoze: { chance: 1, stages: { spe: -1 } }, electroweb: { chance: 1, stages: { spe: -1 } },
  'mud-slap': { chance: 1, stages: { acc: -1 } }, 'mud-bomb': { chance: 0.3, stages: { acc: -1 } },
  octazooka: { chance: 0.5, stages: { acc: -1 } }, 'mist-ball': { chance: 0.5, stages: { spatk: -1 } },
  'metal-claw': { chance: 0.1, self: { atk: 1 } }, 'power-up-punch': { chance: 1, self: { atk: 1 } },
  'flame-charge': { chance: 1, self: { spe: 1 } }, 'charge-beam': { chance: 0.7, self: { spatk: 1 } },
  'ancient-power': { chance: 0.1, self: { atk: 1, def: 1, spatk: 1, spdef: 1, spe: 1 } },
  'silver-wind': { chance: 0.1, self: { atk: 1, def: 1, spatk: 1, spdef: 1, spe: 1 } },
  'close-combat': { chance: 1, self: { def: -1, spdef: -1 } }, superpower: { chance: 1, self: { atk: -1, def: -1 } },
  overheat: { chance: 1, self: { spatk: -2 } }, 'draco-meteor': { chance: 1, self: { spatk: -2 } },
  'leaf-storm': { chance: 1, self: { spatk: -2 } }, 'hammer-arm': { chance: 1, self: { spe: -1 } },
  'double-edge': { recoil: 1 / 3 }, 'flare-blitz': { recoil: 1 / 3, chance: 0.1, status: 'brn' },
  'brave-bird': { recoil: 1 / 3 }, 'wood-hammer': { recoil: 1 / 3 }, 'take-down': { recoil: 1 / 4 },
  'wild-charge': { recoil: 1 / 4 }, 'head-smash': { recoil: 1 / 2 }, submission: { recoil: 1 / 4 },
  'volt-tackle': { recoil: 1 / 3, chance: 0.1, status: 'par' },
  absorb: { drain: 0.5 }, 'mega-drain': { drain: 0.5 }, 'giga-drain': { drain: 0.5 }, 'drain-punch': { drain: 0.5 },
  'leech-life': { drain: 0.5 }, 'horn-leech': { drain: 0.5 }
});

// ---------------------------------------------------------------- status moves (~60, curated)
// kind: setup | debuff | status | heal | protect | weather
// target: self | foe.  acc: null = never misses.  t: its type (moves.json wins when present).
const S = (t, kind, target, extra = {}) => freeze({ t, kind, target, acc: null, ...extra });
export const STATUS_MOVES = freeze({
  // setup: raise my own stages
  'swords-dance': S('normal', 'setup', 'self', { stages: { atk: 2 } }),
  'dragon-dance': S('dragon', 'setup', 'self', { stages: { atk: 1, spe: 1 } }),
  'nasty-plot': S('dark', 'setup', 'self', { stages: { spatk: 2 } }),
  'calm-mind': S('psychic', 'setup', 'self', { stages: { spatk: 1, spdef: 1 } }),
  'bulk-up': S('fighting', 'setup', 'self', { stages: { atk: 1, def: 1 } }),
  agility: S('psychic', 'setup', 'self', { stages: { spe: 2 } }),
  'rock-polish': S('rock', 'setup', 'self', { stages: { spe: 2 } }),
  'iron-defense': S('steel', 'setup', 'self', { stages: { def: 2 } }),
  'acid-armor': S('poison', 'setup', 'self', { stages: { def: 2 } }),
  barrier: S('psychic', 'setup', 'self', { stages: { def: 2 } }),
  amnesia: S('psychic', 'setup', 'self', { stages: { spdef: 2 } }),
  growth: S('normal', 'setup', 'self', { stages: { atk: 1, spatk: 1 } }),
  'work-up': S('normal', 'setup', 'self', { stages: { atk: 1, spatk: 1 } }),
  howl: S('normal', 'setup', 'self', { stages: { atk: 1 } }),
  sharpen: S('normal', 'setup', 'self', { stages: { atk: 1 } }),
  meditate: S('psychic', 'setup', 'self', { stages: { atk: 1 } }),
  harden: S('normal', 'setup', 'self', { stages: { def: 1 } }),
  withdraw: S('water', 'setup', 'self', { stages: { def: 1 } }),
  'defense-curl': S('normal', 'setup', 'self', { stages: { def: 1 } }),
  'cosmic-power': S('psychic', 'setup', 'self', { stages: { def: 1, spdef: 1 } }),
  'cotton-guard': S('grass', 'setup', 'self', { stages: { def: 3 } }),
  'quiver-dance': S('bug', 'setup', 'self', { stages: { spatk: 1, spdef: 1, spe: 1 } }),
  coil: S('poison', 'setup', 'self', { stages: { atk: 1, def: 1, acc: 1 } }),
  'hone-claws': S('dark', 'setup', 'self', { stages: { atk: 1, acc: 1 } }),
  'shift-gear': S('steel', 'setup', 'self', { stages: { atk: 1, spe: 2 } }),
  'shell-smash': S('normal', 'setup', 'self', { stages: { atk: 2, spatk: 2, spe: 2, def: -1, spdef: -1 } }),
  'double-team': S('normal', 'setup', 'self', { stages: { eva: 1 } }),
  minimize: S('normal', 'setup', 'self', { stages: { eva: 2 } }),
  // debuff: lower the foe's stages
  growl: S('normal', 'debuff', 'foe', { acc: 100, stages: { atk: -1 } }),
  leer: S('normal', 'debuff', 'foe', { acc: 100, stages: { def: -1 } }),
  'tail-whip': S('normal', 'debuff', 'foe', { acc: 100, stages: { def: -1 } }),
  screech: S('normal', 'debuff', 'foe', { acc: 85, stages: { def: -2 } }),
  charm: S('fairy', 'debuff', 'foe', { acc: 100, stages: { atk: -2 } }),
  'feather-dance': S('flying', 'debuff', 'foe', { acc: 100, stages: { atk: -2 } }),
  'string-shot': S('bug', 'debuff', 'foe', { acc: 95, stages: { spe: -2 } }),
  'scary-face': S('normal', 'debuff', 'foe', { acc: 100, stages: { spe: -2 } }),
  'cotton-spore': S('grass', 'debuff', 'foe', { acc: 100, stages: { spe: -2 } }),
  'sand-attack': S('ground', 'debuff', 'foe', { acc: 100, stages: { acc: -1 } }),
  smokescreen: S('normal', 'debuff', 'foe', { acc: 100, stages: { acc: -1 } }),
  flash: S('normal', 'debuff', 'foe', { acc: 100, stages: { acc: -1 } }),
  kinesis: S('psychic', 'debuff', 'foe', { acc: 80, stages: { acc: -1 } }),
  'metal-sound': S('steel', 'debuff', 'foe', { acc: 85, stages: { spdef: -2 } }),
  'fake-tears': S('dark', 'debuff', 'foe', { acc: 100, stages: { spdef: -2 } }),
  tickle: S('normal', 'debuff', 'foe', { acc: 100, stages: { atk: -1, def: -1 } }),
  'sweet-scent': S('normal', 'debuff', 'foe', { acc: 100, stages: { eva: -1 } }),
  // status conditions
  'thunder-wave': S('electric', 'status', 'foe', { acc: 100, status: 'par', typed: true }),
  'stun-spore': S('grass', 'status', 'foe', { acc: 75, status: 'par' }),
  glare: S('normal', 'status', 'foe', { acc: 90, status: 'par' }),
  'sleep-powder': S('grass', 'status', 'foe', { acc: 75, status: 'slp' }),
  spore: S('grass', 'status', 'foe', { acc: 100, status: 'slp' }),
  hypnosis: S('psychic', 'status', 'foe', { acc: 60, status: 'slp' }),
  sing: S('normal', 'status', 'foe', { acc: 55, status: 'slp' }),
  'lovely-kiss': S('normal', 'status', 'foe', { acc: 75, status: 'slp' }),
  'grass-whistle': S('grass', 'status', 'foe', { acc: 55, status: 'slp' }),
  'dark-void': S('dark', 'status', 'foe', { acc: 80, status: 'slp' }),
  'poison-powder': S('poison', 'status', 'foe', { acc: 75, status: 'psn' }),
  'poison-gas': S('poison', 'status', 'foe', { acc: 90, status: 'psn' }),
  toxic: S('poison', 'status', 'foe', { acc: 90, status: 'psn', tox: true }),
  'will-o-wisp': S('fire', 'status', 'foe', { acc: 75, status: 'brn' }),
  // heals
  recover: S('normal', 'heal', 'self', { heal: 0.5 }),
  'soft-boiled': S('normal', 'heal', 'self', { heal: 0.5 }),
  'milk-drink': S('normal', 'heal', 'self', { heal: 0.5 }),
  'slack-off': S('normal', 'heal', 'self', { heal: 0.5 }),
  roost: S('flying', 'heal', 'self', { heal: 0.5 }),
  synthesis: S('grass', 'heal', 'self', { heal: 0.5 }),
  moonlight: S('fairy', 'heal', 'self', { heal: 0.5 }),
  'morning-sun': S('normal', 'heal', 'self', { heal: 0.5 }),
  rest: S('psychic', 'heal', 'self', { heal: 1, rest: true }),
  // protect
  protect: S('normal', 'protect', 'self', { protect: true }),
  detect: S('fighting', 'protect', 'self', { protect: true }),
  // weather
  'rain-dance': S('water', 'weather', 'self', { weather: 'rain' }),
  'sunny-day': S('fire', 'weather', 'self', { weather: 'sun' })
});

// ---------------------------------------------------------------- abilities (15, curated)
export const ABILITIES = freeze(['intimidate', 'levitate', 'blaze', 'torrent', 'overgrow', 'swarm', 'static',
  'flame-body', 'sturdy', 'swift-swim', 'chlorophyll', 'thick-fat', 'guts', 'technician', 'multiscale']);

const PINCH_TYPE = freeze({ blaze: 'fire', torrent: 'water', overgrow: 'grass', swarm: 'bug' });

const rng2 = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const ABILITY_IDS = {
  overgrow: [...rng2(1, 3), ...rng2(152, 154), ...rng2(252, 254), ...rng2(387, 389), ...rng2(495, 497)],
  blaze: [...rng2(4, 6), ...rng2(155, 157), ...rng2(255, 257), ...rng2(390, 392), ...rng2(498, 500)],
  torrent: [...rng2(7, 9), ...rng2(158, 160), ...rng2(258, 260), ...rng2(393, 395), ...rng2(501, 503)],
  swarm: [15, 165, 166, 214, 267, 269, 401, 402, 414, 540, 541, 542, 543, 544, 545],
  intimidate: [23, 24, 58, 59, 128, 130, 209, 210, 234, 237, 261, 262, 303, 373, 404, 405, 551, 552, 553, 559, 560],
  static: [25, 26, 125, 172, 179, 180, 181, 239, 309, 310, 587],
  levitate: [92, 93, 94, 109, 110, 200, 201, 329, 330, 337, 338, 343, 344, 355, 358, 380, 381, 429, 436, 437,
    479, 480, 481, 482, 488, 602, 603, 604, 615, 635],
  'flame-body': [126, 218, 219, 240, 467, 636, 637],
  sturdy: [74, 75, 76, 95, 185, 204, 205, 208, 213, 299, 304, 305, 306, 410, 411, 438, 524, 525, 526, 557, 558, 564, 565],
  'swift-swim': [116, 117, 118, 119, 129, 138, 139, 140, 141, 230, 270, 271, 272, 349, 367, 368, 369, 418, 419, 456, 457, 535, 536, 537],
  chlorophyll: [43, 44, 45, 69, 70, 71, 102, 103, 114, 187, 188, 189, 191, 192, 273, 274, 275, 357, 420, 465, 548, 549, 585, 586],
  'thick-fat': [143, 183, 184, 241, 296, 297, 325, 326, 363, 364, 365, 446],
  guts: [19, 20, 66, 67, 68, 217, 236, 276, 277, 532, 533, 534, 538],
  technician: [52, 53, 123, 212, 235, 424, 572, 573],
  multiscale: [149, 249]
};
export const SPECIES_ABILITY = freeze(Object.fromEntries(
  Object.entries(ABILITY_IDS).flatMap(([ab, ids]) => ids.map(id => [id, ab]))));

/** The curated ability of a species, or null. */
export function abilityOf(id) {
  return SPECIES_ABILITY[Number(id)] || null;
}

// ---------------------------------------------------------------- UI data (pure; the view draws these)
export const STATUS_INFO = freeze({
  brn: freeze({ icon: '♨️', label: 'BRN', color: '#f08030' }),
  psn: freeze({ icon: '\u{1F9EA}', label: 'PSN', color: '#a040a0' }),
  par: freeze({ icon: '\u{1F4AB}', label: 'PAR', color: '#d8b020' }),
  slp: freeze({ icon: '\u{1F4A4}', label: 'SLP', color: '#8890a8' }),
  frz: freeze({ icon: '\u{1F9CA}', label: 'FRZ', color: '#58c8e0' })
});
export const STAT_LABEL = freeze({ atk: 'ATK', def: 'DEF', spatk: 'SPA', spdef: 'SPD', spe: 'SPE', acc: 'ACC', eva: 'EVA' });
export const INTENT_INFO = freeze({
  attack: freeze({ icon: '⚔️', label: 'ATTACK' }),
  setup: freeze({ icon: '\u{1F4AA}', label: 'POWER UP' }),
  debuff: freeze({ icon: '⬇️', label: 'WEAKEN' }),
  status: freeze({ icon: '\u{1F300}', label: 'TRICK' }),
  heal: freeze({ icon: '\u{1F49A}', label: 'HEAL' }),
  protect: freeze({ icon: '\u{1F6E1}️', label: 'GUARD' }),
  weather: freeze({ icon: '\u{1F326}️', label: 'WEATHER' }),
  switch: freeze({ icon: '\u{1F504}', label: 'SWITCH' })
});
export const abilityLabel = a => String(a || '').replace(/-/g, ' ').toUpperCase();

// ---------------------------------------------------------------- move helpers

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const typeName = t => (typeof t === 'string' ? t : t && t.type && t.type.name) || null;
const TACKLE = freeze({ name: 'tackle', type: 'normal', power: 40, damage_class: 'physical' });

export const isStatusMove = m => !!m && m.damage_class === 'status';
export const moveMeta = m => (m && isStatusMove(m) ? STATUS_MOVES[m.name] || null : null);
export const priorityOf = m => (m && PRIORITY[m.name]) || 0;
export const accuracyOf = m => {
  if (!m) return 100;
  const meta = moveMeta(m);
  if (meta) return meta.acc;
  return ACCURACY[m.name] ?? 100;
};

/** A curated status move as a move object: {name, type, power:null, damage_class:'status'}. */
export function proMove(name, lookup = null) {
  const key = String(name || '').toLowerCase();
  const meta = STATUS_MOVES[key];
  if (!meta) return null;
  const d = lookup ? lookup(key) : null;
  return { name: key, type: (d && d.type) || meta.t, power: null, damage_class: 'status' };
}

// Damaging moves go through engine.usableMoves (no nukes, no fake-power
// status moves); curated status moves are kept. Unknown status moves drop.
function normMoves(moves, moveLookup) {
  const resolved = (moves || []).map(m => {
    if (m && typeof m === 'object') return m;
    const key = String(m || '').toLowerCase();
    if (STATUS_MOVES[key]) return proMove(key, moveLookup);
    const d = moveLookup ? moveLookup(key) : null;
    return d ? { name: key, type: d.type, power: d.power, damage_class: d.damage_class } : null;
  }).filter(Boolean);
  const out = [];
  for (const m of resolved) {
    if (out.length >= 4) break;
    if (m.damage_class === 'status') {
      if (STATUS_MOVES[m.name]) out.push({ name: m.name, type: m.type || STATUS_MOVES[m.name].t, power: null, damage_class: 'status' });
    } else if (usableMoves([m]).length) {
      out.push({ name: m.name, type: m.type || 'normal', power: m.power, damage_class: m.damage_class || 'physical' });
    }
  }
  return out.some(m => m.damage_class !== 'status') ? out : [...out.slice(0, 3), { ...TACKLE }];
}

// What a status move is worth to a fighter's moveset, most wanted first.
const WANT = ['spore', 'sleep-powder', 'dragon-dance', 'swords-dance', 'nasty-plot', 'quiver-dance', 'calm-mind',
  'thunder-wave', 'will-o-wisp', 'toxic', 'shell-smash', 'bulk-up', 'shift-gear', 'hypnosis', 'stun-spore',
  'recover', 'roost', 'slack-off', 'soft-boiled', 'synthesis', 'rest', 'agility', 'rock-polish', 'protect'];

/**
 * Pure: give a built fighter (buildFighter's output) up to `max` curated
 * status moves from its learnset `moveNames`, so Pro fights have setup and
 * status to play with. The first move (the STAB one) is never replaced; the
 * weakest other attack is. Deterministic: `rng` breaks ties only.
 * Returns a NEW fighter; the input is not mutated.
 */
export function withStatusMoves(fighter, moveNames, { rng = Math.random, max = 1, lookup = null } = {}) {
  if (!fighter || !Array.isArray(fighter.moves)) return fighter;
  const learn = new Set((moveNames || []).map(n => String(n).toLowerCase()));
  const known = new Set(fighter.moves.map(m => m.name));
  const ranked = WANT.filter(n => learn.has(n) && !known.has(n));
  const rest = Object.keys(STATUS_MOVES).filter(n => learn.has(n) && !known.has(n) && !WANT.includes(n)
    && STATUS_MOVES[n].kind !== 'debuff');
  const pool = ranked.slice(0, 3);
  if (!pool.length && rest.length) pool.push(rest[Math.floor(rng() * rest.length)]);
  const moves = fighter.moves.map(m => ({ ...m }));
  for (let k = 0; k < max && pool.length; k++) {
    const pick = pool.splice(k === 0 && pool.length > 1 ? Math.floor(rng() * Math.min(2, pool.length)) : 0, 1)[0];
    const mv = proMove(pick, lookup);
    if (!mv) continue;
    if (moves.length < 4) { moves.push(mv); continue; }
    let weakest = -1;
    for (let i = 1; i < moves.length; i++) {
      if (moves[i].damage_class === 'status') continue;
      if (weakest < 0 || num(moves[i].power, 0) < num(moves[weakest].power, 0)) weakest = i;
    }
    if (weakest > 0) moves[weakest] = mv;
  }
  return { ...fighter, moves };
}

// ---------------------------------------------------------------- stat maths (pure)

export const stageMult = s => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));
export const accStageMult = s => (s >= 0 ? (3 + s) / 3 : 3 / (3 - s));
const clampStage = s => Math.max(STAGE_MIN, Math.min(STAGE_MAX, s));
const tview = f => f.types.map(t => ({ type: { name: t } }));

/** Effective speed: stages, paralysis, Swift Swim in rain, Chlorophyll in sun. */
export function speedOf(f, weather = null) {
  let s = f.spe * stageMult(f.stages.spe);
  if (f.status === 'par') s *= PAR_SPEED;
  if (f.ability === 'swift-swim' && weather === 'rain') s *= 2;
  if (f.ability === 'chlorophyll' && weather === 'sun') s *= 2;
  return s;
}

/** Type multiplier with Levitate folded in. */
export function typeMultOf(move, def) {
  if (move.type === 'ground' && def.ability === 'levitate') return 0;
  return getTypeMultiplier(move.type, tview(def));
}

/**
 * The Pro damage formula, pure. No 60% cap, no junior floor.
 * opts: { weather, crit:bool, roll:0.85..1 }. Returns { damage (float), typeMult }.
 */
export function proDamage(att, def, move, { weather = null, crit = false, roll = 1 } = {}) {
  const typeMult = typeMultOf(move, def);
  if (typeMult === 0) return { damage: 0, typeMult };
  const special = move.damage_class === 'special';
  let power = num(move.power, 40) || 40;
  if (att.ability === 'technician' && power <= 60) power *= 1.5;
  const pinch = PINCH_TYPE[att.ability];
  if (pinch && pinch === move.type && att.hp <= att.maxHp * PINCH) power *= 1.5;

  let aStage = special ? att.stages.spatk : att.stages.atk;
  let dStage = special ? def.stages.spdef : def.stages.def;
  if (crit) { aStage = Math.max(0, aStage); dStage = Math.min(0, dStage); }
  let A = (special ? att.spatk : att.atk) * stageMult(aStage) * (att.atkMult || 1);
  const D = Math.max(1, (special ? def.spdef : def.def) * stageMult(dStage));
  const guts = att.ability === 'guts' && !!att.status;
  if (guts && !special) A *= 1.5;

  let dmg = (((2 * att.level / 5 + 2) * power * (A / D)) / 50) + 2;
  if (weather === 'rain') dmg *= move.type === 'water' ? 1.5 : move.type === 'fire' ? 0.5 : 1;
  if (weather === 'sun') dmg *= move.type === 'fire' ? 1.5 : move.type === 'water' ? 0.5 : 1;
  if (crit) dmg *= CRIT_MULT;
  dmg *= roll;
  if (att.types.includes(move.type)) dmg *= STAB_MULT;
  dmg *= typeMult;
  if (att.status === 'brn' && !special && !guts) dmg *= BURN_ATK;
  if (def.ability === 'thick-fat' && (move.type === 'fire' || move.type === 'ice')) dmg *= 0.5;
  if (def.ability === 'multiscale' && def.hp >= def.maxHp) dmg *= 0.5;
  return { damage: dmg, typeMult };
}

/** Mean damage a move is expected to do, accuracy included. For the AI. */
export function expectedDamage(att, def, move, weather = null) {
  if (!move || isStatusMove(move)) return 0;
  const { damage, typeMult } = proDamage(att, def, move, { weather, roll: (1 + VARIANCE_MIN) / 2 });
  if (!typeMult) return 0;
  const acc = accuracyOf(move);
  const hit = acc == null ? 1 : Math.min(1, (acc / 100) * accStageMult(att.stages.acc - def.stages.eva));
  return damage * (1 + CRIT_CHANCE * (CRIT_MULT - 1)) * hit;
}

// Accepts buildFighter's {stats:{...}} and engine.computeStats' {maxHp,...,speed}.
function makeFighter(src, moveLookup) {
  const s = src.stats || {};
  const level = Math.max(1, Math.round(num(src.level, 5)));
  const maxHp = Math.max(1, Math.round(num(s.hp, num(s.maxHp, num(src.maxHp, 10 + level * 2)))));
  const types = (src.types || []).map(typeName).filter(Boolean);
  const ability = src.ability === null ? null
    : (ABILITIES.includes(src.ability) ? src.ability : abilityOf(src.id));
  return {
    ...src,
    level,
    types: types.length ? types : ['normal'],
    moves: normMoves(src.moves, moveLookup),
    maxHp,
    hp: maxHp,
    atk: Math.max(1, num(s.atk, 10)),
    def: Math.max(1, num(s.def, 10)),
    spatk: Math.max(1, num(s.spatk, num(s.atk, 10))),
    spdef: Math.max(1, num(s.spdef, num(s.def, 10))),
    spe: Math.max(1, num(s.spe, num(s.speed, 10))),
    atkMult: 1,
    fainted: false,
    ability,
    status: null,          // 'brn'|'psn'|'par'|'slp'|'frz'
    sleep: 0,              // turns of sleep left
    tox: 0,                // 0 = plain poison; n>0 = badly poisoned, n/16 next tick
    stages: { atk: 0, def: 0, spatk: 0, spdef: 0, spe: 0, acc: 0, eva: 0 },
    protectChain: 0,
    protecting: false
  };
}

// ---------------------------------------------------------------- the smarter AI (pure)

const hpFrac = f => f.hp / Math.max(1, f.maxHp);
const bestExp = (att, def, weather) => att.moves.reduce((a, m) => Math.max(a, expectedDamage(att, def, m, weather)), 0);

function statusImmune(target, status, move) {
  if (!target || target.status) return true;
  const types = target.types;
  if (status === 'brn' && types.includes('fire')) return true;
  if (status === 'psn' && (types.includes('poison') || types.includes('steel'))) return true;
  if (status === 'par' && types.includes('electric')) return true;
  if (status === 'frz' && types.includes('ice')) return true;
  if (move && STATUS_MOVES[move.name] && STATUS_MOVES[move.name].typed && typeMultOf(move, target) === 0) return true;
  if (move && move.type === 'grass' && move.damage_class === 'status' && types.includes('grass') && /powder|spore/.test(move.name)) return true;
  return false;
}

/**
 * Score every move of `f` against `t` (higher = better). Pure.
 * Kills first (priority kills highest), then sleep / paralysis / burn when
 * they matter, setup when safe, heals when low, then raw expected damage.
 */
export function scoreMoves(f, t, { weather = null, faster = true } = {}) {
  const threat = bestExp(t, f, weather);            // what the target does to me next
  const inDanger = threat >= f.hp;
  return f.moves.map(m => {
    const meta = moveMeta(m);
    if (!meta) {
      const exp = expectedDamage(f, t, m, weather);
      if (exp <= 0) return 0;
      if (exp >= t.hp) return 100 + (priorityOf(m) > 0 && !faster ? 30 : 0) + (accuracyOf(m) || 100) / 10;
      return (exp / t.hp) * 90;
    }
    const acc = meta.acc == null ? 1 : meta.acc / 100;
    switch (meta.kind) {
      case 'setup': {
        if (inDanger || hpFrac(f) < 0.6) return 0;
        const up = Object.entries(meta.stages).filter(([k, d]) => d > 0 && f.stages[k] < 2).length;
        return up ? 32 + 6 * up : 3;
      }
      case 'debuff': {
        const down = Object.entries(meta.stages).filter(([k]) => t.stages[k] > -2).length;
        return down && !inDanger ? 12 * acc : 1;
      }
      case 'status': {
        if (statusImmune(t, meta.status, m)) return 0;
        const base = meta.status === 'slp' ? 65
          : meta.status === 'par' ? (speedOf(t, weather) > speedOf(f, weather) ? 55 : 30)
            : meta.status === 'brn' ? (t.atk > t.spatk ? 50 : 22)
              : hpFrac(t) > 0.6 ? 35 : 15;
        return inDanger ? base * acc * 0.4 : base * acc;
      }
      case 'heal': return hpFrac(f) < 0.45 && threat < f.maxHp * 0.5 + f.hp ? 60 : 0;
      case 'protect': return f.protectChain ? 0 : ((t.status === 'psn' || t.status === 'brn') ? 22 : 2);
      case 'weather': {
        const want = meta.weather === 'rain'
          ? (f.ability === 'swift-swim' || f.types.includes('water'))
          : (f.ability === 'chlorophyll' || f.types.includes('fire'));
        return want && weather !== meta.weather && !inDanger ? 28 : 0;
      }
      default: return 0;
    }
  });
}

/** How well `c` stands against `t`: what it deals minus what it takes (fractions of HP). */
export function matchup(c, t, weather = null) {
  const deal = Math.min(1, bestExp(c, t, weather) / Math.max(1, t.hp));
  const take = Math.min(1, bestExp(t, c, weather) / Math.max(1, c.hp));
  return deal - 0.8 * take;
}

/** Icon kind for an intent: 'attack'|'setup'|'debuff'|'status'|'heal'|'protect'|'weather'|'switch'. */
export function intentKind(intent, fighter) {
  if (!intent) return 'attack';
  if (intent.kind === 'switch') return 'switch';
  const m = fighter && fighter.moves[intent.index];
  const meta = moveMeta(m);
  return meta ? meta.kind : 'attack';
}

// ---------------------------------------------------------------- the factory

/**
 * Same options as createBattle, plus:
 *   ai: 'pro' (default for trainers) | 'basic' (createBattle's picker) | 'random'
 * Returns createBattle's interface plus:
 *   pro: true, foeIntentAction() -> {kind:'move'|'switch', index, icon},
 *   openingEvents: events from the send-out (Intimidate), already applied,
 *   choose(action, { foe }) — `foe` (optional {kind:'move'|'switch', index})
 *     overrides the committed intent for this turn (for pass-and-play).
 */
export function createProBattle(opts = {}) {
  const { myTeam, enemyTeam, profile = 'reader', rng = Math.random, moveLookup = null, wild = false, leader = false, berries = Infinity } = opts;
  // The pre-reader never plays Pro Rules. Every Junior protection stays on.
  if (profile === 'prereader') return createBattle(opts);
  if (!Array.isArray(myTeam) || !myTeam.length) throw new Error('createProBattle: myTeam is empty');
  if (!Array.isArray(enemyTeam) || !enemyTeam.length) throw new Error('createProBattle: enemyTeam is empty');
  const ai = opts.ai || (wild ? 'random' : 'pro');

  const state = {
    me: { active: 0, team: myTeam.map(m => makeFighter(m, moveLookup)) },
    foe: { active: 0, team: enemyTeam.map(m => makeFighter(m, moveLookup)) },
    turn: 0, over: false, winner: null, phase: 1,
    weather: null, weatherTurns: 0, rules: 'pro'
  };

  let berriesLeft = typeof berries === 'number' && berries >= 0 ? (Number.isFinite(berries) ? Math.floor(berries) : Infinity) : Infinity;
  state.me.berries = berriesLeft;
  let phase2Done = false;
  let intent = { kind: 'move', index: 0 };
  let busy = false;
  let foeSwitchCool = 0;
  const xpById = new Map();

  const active = side => state[side].team[state[side].active];
  const other = side => (side === 'me' ? 'foe' : 'me');
  const aliveIdx = side => state[side].team.map((f, i) => (f.fainted ? -1 : i)).filter(i => i >= 0);
  const isAce = () => leader && state.foe.active === state.foe.team.length - 1;

  // ---------- intent ----------
  function commitIntent() {
    const f = active('foe'), t = active('me');
    if (ai === 'random') { intent = { kind: 'move', index: Math.floor(rng() * f.moves.length) }; return; }
    if (ai === 'basic') {
      const mv = pickMove(f.moves.filter(m => !isStatusMove(m)), { types: tview(t) }, { smart: true, rng });
      const i = f.moves.indexOf(mv);
      intent = { kind: 'move', index: i >= 0 ? i : 0 };
      return;
    }
    const w = state.weather;
    const faster = speedOf(f, w) >= speedOf(t, w);
    const scores = scoreMoves(f, t, { weather: w, faster });
    // A little seeded noise so two equal options are not always the same one.
    const noisy = scores.map(s => s + (s > 0 ? rng() * 4 : 0));
    let best = 0;
    for (let i = 1; i < noisy.length; i++) if (noisy[i] > noisy[best]) best = i;

    // Switch on a bad matchup: I barely scratch it and it is about to flatten me.
    if (foeSwitchCool <= 0 && scores[best] < 100) {
      const here = matchup(f, t, w);
      const threat = bestExp(t, f, w) / Math.max(1, f.hp);
      if (threat >= 0.6 && bestExp(f, t, w) / Math.max(1, t.hp) < 0.3) {
        let pick = -1, pickScore = here + 0.3;
        state.foe.team.forEach((c, i) => {
          if (c.fainted || i === state.foe.active) return;
          const s = matchup(c, t, w);
          if (s > pickScore) { pickScore = s; pick = i; }
        });
        if (pick >= 0) { intent = { kind: 'switch', index: pick }; return; }
      }
    }
    intent = { kind: 'move', index: best };
  }

  function addXp(defeated) {
    const me = active('me');
    const gained = xpForKO({ base_experience: defeated.base_experience ?? defeated.baseExperience, level: defeated.level });
    xpById.set(me.id, (xpById.get(me.id) || 0) + gained);
  }
  function xpReport() {
    const out = [];
    for (const [id, gained] of xpById) {
      const f = state.me.team.find(m => m.id === id);
      const res = applyXp({ level: f ? f.level : 5, xp: f ? num(f.xp, 0) : 0 }, gained);
      out.push({ id, gained, levelsUp: res.ups });
    }
    return out;
  }
  function end(events, winner, extra = {}) {
    if (state.over) return;
    state.over = true;
    state.winner = winner;
    events.push({ type: 'end', winner, ...extra, xp: winner === 'me' ? xpReport() : [] });
  }

  // ---------- stages / status ----------
  function applyStages(side, stages, events) {
    const f = active(side);
    for (const [stat, d] of Object.entries(stages || {})) {
      if (!STATS.includes(stat) || !d) continue;
      const before = f.stages[stat];
      f.stages[stat] = clampStage(before + d);
      events.push({ type: 'stage', side, stat, delta: f.stages[stat] - before, value: f.stages[stat] });
    }
  }

  function inflict(side, status, events, { tox = false, move = null } = {}) {
    const f = active(side);
    if (f.fainted || statusImmune(f, status, move)) return false;
    f.status = status;
    if (status === 'slp') f.sleep = 2 + Math.floor(rng() * 3);   // skips 1..3 turns, then wakes and acts
    if (status === 'psn') f.tox = tox ? 1 : 0;
    events.push({ type: 'status', side, status, what: 'inflict', ...(status === 'psn' && tox ? { tox: true } : {}) });
    return true;
  }

  function onEntry(side, events) {
    const f = active(side);
    f.protectChain = 0;
    if (f.ability === 'intimidate') {
      const t = active(other(side));
      if (t && !t.fainted) {
        events.push({ type: 'ability', side, ability: 'intimidate' });
        applyStages(other(side), { atk: -1 }, events);
      }
    }
  }

  function leaveField(f) {
    for (const k of STATS) f.stages[k] = 0;
    if (f.tox) f.tox = 1;
    f.protectChain = 0;
    f.protecting = false;
  }

  // ---------- faints ----------
  function faint(side, events) {
    const f = active(side);
    if (f.fainted) return;
    f.hp = 0;
    f.fainted = true;
    events.push({ type: 'faint', side });
    if (side === 'foe') addXp(f);
    const next = aliveIdx(side);
    if (!next.length) { end(events, other(side)); return; }
    leaveField(f);
    state[side].active = next[0];
    events.push({ type: 'send', side, index: next[0] });
    onEntry(side, events);
  }

  // ---------- one move ----------
  function useMove(side, move, events) {
    const u = active(side), tSide = other(side), t = active(tSide);
    const meta = moveMeta(move);

    // Status before acting.
    if (u.status === 'slp') {
      u.sleep--;
      if (u.sleep > 0) { events.push({ type: 'status', side, status: 'slp', what: 'cant' }); return; }
      u.status = null; u.sleep = 0;
      events.push({ type: 'status', side, status: 'slp', what: 'wake' });
    } else if (u.status === 'frz') {
      if ((move.type === 'fire' && !meta) || rng() < THAW) {
        u.status = null;
        events.push({ type: 'status', side, status: 'frz', what: 'thaw' });
      } else { events.push({ type: 'status', side, status: 'frz', what: 'cant' }); return; }
    } else if (u.status === 'par' && rng() < PAR_SKIP) {
      events.push({ type: 'status', side, status: 'par', what: 'cant' });
      return;
    }

    if (meta && meta.protect) {
      const chance = 1 / Math.pow(3, u.protectChain);
      const ok = chance >= 1 || rng() < chance;
      events.push({ type: 'move', side, move: { ...move }, dmg: 0, crit: false, eff: 1, hpAfter: u.hp, status: true });
      if (ok) { u.protecting = true; u.protectChain++; } else { u.protectChain = 0; }
      events.push({ type: 'protect', side, ok });
      return;
    }

    const targetsFoe = !meta || meta.target === 'foe';
    if (targetsFoe && t.protecting) {
      events.push({ type: 'miss', side, move: { ...move }, reason: 'protected' });
      return;
    }
    if (targetsFoe) {
      const acc = accuracyOf(move);
      if (acc != null) {
        const p = (acc / 100) * accStageMult(clampStage(u.stages.acc - t.stages.eva));
        if (p < 1 && rng() >= p) { events.push({ type: 'miss', side, move: { ...move }, reason: 'miss' }); return; }
      }
    }

    if (meta) { statusMove(side, move, meta, events); return; }

    // ----- damage -----
    const typeMult = typeMultOf(move, t);
    if (typeMult === 0 && move.type === 'ground' && t.ability === 'levitate') {
      events.push({ type: 'ability', side: tSide, ability: 'levitate' });
    }
    const crit = typeMult > 0 && rng() < CRIT_CHANCE;
    const roll = typeMult > 0 ? VARIANCE_MIN + rng() * (1 - VARIANCE_MIN) : 1;
    const res = proDamage(u, t, move, { weather: state.weather, crit, roll });
    let dmg = typeMult > 0 ? Math.max(1, Math.floor(res.damage)) : 0;
    let hpAfter = t.hp - dmg;
    let sturdy = false;
    if (t.ability === 'sturdy' && t.hp >= t.maxHp && hpAfter <= 0) { hpAfter = 1; sturdy = true; }
    const triggerPhase2 = tSide === 'foe' && isAce() && !phase2Done && hpAfter <= t.maxHp * PHASE2_AT;
    if (triggerPhase2) hpAfter = Math.max(1, hpAfter);
    hpAfter = Math.max(0, Math.min(t.maxHp, Math.round(hpAfter)));
    dmg = t.hp - hpAfter;
    t.hp = hpAfter;
    events.push({ type: 'move', side, move: { ...move }, dmg, crit, eff: typeMult, hpAfter });
    if (sturdy) events.push({ type: 'ability', side: tSide, ability: 'sturdy' });

    if (triggerPhase2) {
      phase2Done = true;
      state.phase = 2;
      t.hp = Math.min(t.maxHp, t.hp + Math.round(t.maxHp * PHASE2_HEAL));
      t.atkMult = PHASE2_ATK;
      events.push({ type: 'phase2', side: 'foe', hpAfter: t.hp });
    }
    if (typeMult === 0) return;

    // A fire hit thaws a frozen target.
    if (t.hp > 0 && t.status === 'frz' && move.type === 'fire') {
      t.status = null;
      events.push({ type: 'status', side: tSide, status: 'frz', what: 'thaw' });
    }

    const sec = SECONDARY[move.name];
    if (sec) {
      if (sec.drain && dmg > 0 && u.hp < u.maxHp) {
        const amount = Math.min(u.maxHp - u.hp, Math.max(1, Math.floor(dmg * sec.drain)));
        u.hp += amount;
        events.push({ type: 'heal', side, index: state[side].active, amount, hpAfter: u.hp });
      }
      const fires = sec.chance != null && (sec.chance >= 1 || rng() < sec.chance);
      if (fires) {
        if (sec.status && t.hp > 0) inflict(tSide, sec.status, events, { tox: !!sec.tox });
        if (sec.stages && t.hp > 0) applyStages(tSide, sec.stages, events);
        if (sec.self) applyStages(side, sec.self, events);
      }
      if (sec.recoil && dmg > 0) {
        const r = Math.max(1, Math.round(dmg * sec.recoil));
        u.hp = Math.max(0, u.hp - r);
        events.push({ type: 'hurt', side, cause: 'recoil', dmg: r, hpAfter: u.hp });
      }
    }

    // Contact abilities (physical moves count as contact).
    if (move.damage_class === 'physical' && u.hp > 0 && !u.status &&
        (t.ability === 'static' || t.ability === 'flame-body') && rng() < CONTACT_CHANCE) {
      const st = t.ability === 'static' ? 'par' : 'brn';
      if (!statusImmune(u, st)) {
        events.push({ type: 'ability', side: tSide, ability: t.ability });
        inflict(side, st, events);
      }
    }

    if (t.hp <= 0) faint(tSide, events);
    if (!state.over && u.hp <= 0 && active(side) === u) faint(side, events);
  }

  function statusMove(side, move, meta, events) {
    const u = active(side), tSide = other(side), t = active(tSide);
    const onSelf = meta.target === 'self';
    events.push({ type: 'move', side, move: { ...move }, dmg: 0, crit: false, eff: 1, hpAfter: onSelf ? u.hp : t.hp, status: true });
    if (meta.stages) {
      const who = onSelf ? side : tSide;
      const f = active(who);
      const moves = Object.entries(meta.stages).some(([k, d]) => clampStage(f.stages[k] + d) !== f.stages[k]);
      if (!moves) { events.push({ type: 'miss', side, move: { ...move }, reason: 'failed' }); return; }
      applyStages(who, meta.stages, events);
      return;
    }
    if (meta.status) {
      if (!inflict(tSide, meta.status, events, { tox: !!meta.tox, move })) {
        events.push({ type: 'miss', side, move: { ...move }, reason: statusImmune(t, meta.status, move) && !t.status ? 'immune' : 'failed' });
      }
      return;
    }
    if (meta.heal) {
      if (u.hp >= u.maxHp) { events.push({ type: 'miss', side, move: { ...move }, reason: 'failed' }); return; }
      const amount = Math.min(u.maxHp - u.hp, Math.max(1, Math.round(u.maxHp * meta.heal)));
      u.hp += amount;
      events.push({ type: 'heal', side, index: state[side].active, amount, hpAfter: u.hp });
      if (meta.rest) {
        u.status = 'slp'; u.sleep = 3; u.tox = 0;        // sleeps through two turns, acts on the third
        events.push({ type: 'status', side, status: 'slp', what: 'inflict' });
      }
      return;
    }
    if (meta.weather) {
      if (state.weather === meta.weather) { events.push({ type: 'miss', side, move: { ...move }, reason: 'failed' }); return; }
      state.weather = meta.weather;
      state.weatherTurns = WEATHER_TURNS;
      events.push({ type: 'weather', weather: meta.weather });
    }
  }

  // ---------- end of turn ----------
  function residual(events) {
    if (state.weather && --state.weatherTurns <= 0) {
      state.weather = null;
      state.weatherTurns = 0;
      events.push({ type: 'weather', weather: null });
    }
    for (const side of ['me', 'foe']) {
      if (state.over) return;
      const f = active(side);
      if (f.fainted || f.hp <= 0) continue;
      if (f.status === 'brn' || f.status === 'psn') {
        const frac = f.status === 'psn' && f.tox ? Math.min(15, f.tox) / 16 : RESIDUAL;
        if (f.status === 'psn' && f.tox) f.tox++;
        const dmg = Math.max(1, Math.floor(f.maxHp * frac));
        f.hp = Math.max(0, f.hp - dmg);
        events.push({ type: 'status', side, status: f.status, what: 'tick', dmg, hpAfter: f.hp });
        if (f.hp <= 0) faint(side, events);
      }
    }
  }

  function finishTurn(events) {
    for (const side of ['me', 'foe']) for (const f of state[side].team) f.protecting = false;
    if (foeSwitchCool > 0) foeSwitchCool--;
    if (!state.over) commitIntent();
    state.turn++;
    return events;
  }

  function doSwitch(side, index, events) {
    const t = state[side].team;
    if (!Number.isInteger(index) || !t[index] || t[index].fainted || index === state[side].active) return false;
    leaveField(active(side));
    state[side].active = index;
    events.push({ type: 'switch', side, index });
    onEntry(side, events);
    return true;
  }

  // Protect's chain only survives while the same fighter keeps protecting.
  function resetChainsExcept(usedProtect) {
    for (const side of ['me', 'foe']) {
      const f = active(side);
      if (!usedProtect[side]) f.protectChain = 0;
    }
  }

  function turn(action, override) {
    const events = [];
    const me = active('me');
    let foeAct = override && (override.kind === 'move' || override.kind === 'switch') ? override : intent;
    const foe = active('foe');
    if (foeAct.kind === 'move' && !foe.moves[foeAct.index | 0]) foeAct = { kind: 'move', index: 0 };

    // 1. The player's non-move action.
    if (action.kind === 'switch') {
      if (!doSwitch('me', action.index, events)) return [];
    } else if (action.kind === 'ball') {
      if (!wild) return [];
      const mod = BALL_MODS[action.ball];
      if (!mod) return [];
      const p = catchProbability({ captureRate: num(foe.captureRate, 45), ballMod: mod, hp: foe.hp, maxHp: foe.maxHp, master: action.ball === 'master' });
      const success = p >= 1 || rng() < p;
      let shakes = 3;
      if (!success) { const per = Math.cbrt(p); shakes = 0; while (shakes < 2 && rng() < per) shakes++; }
      events.push({ type: 'catch', ball: action.ball, shakes, success });
      if (success) { addXp(foe); end(events, 'me', { caught: true, caughtId: foe.id }); return finishTurn(events); }
    } else if (action.kind === 'berry') {
      const fr = num(action.fraction, BERRY_HEAL);
      if (!(fr > 0) || berriesLeft < 1 || me.fainted || me.hp >= me.maxHp) return [];
      const heal = Math.max(1, Math.round(me.maxHp * Math.min(1, fr)));
      const hpAfter = Math.min(me.maxHp, me.hp + heal);
      events.push({ type: 'heal', side: 'me', index: state.me.active, amount: hpAfter - me.hp, hpAfter });
      me.hp = hpAfter;
      berriesLeft--;
      state.me.berries = berriesLeft;
    } else if (action.kind === 'run') {
      if (!wild) return [];
      end(events, null, { fled: true });
      return finishTurn(events);
    } else if (action.kind !== 'move') return [];

    // 2. The foe's switch.
    if (foeAct.kind === 'switch') {
      if (doSwitch('foe', foeAct.index, events)) foeSwitchCool = 2;
      else foeAct = { kind: 'move', index: 0 };
    }

    // 3. Moves, by priority then speed.
    const queue = [];
    if (action.kind === 'move') {
      const f = active('me');
      queue.push({ side: 'me', f, move: f.moves[action.index | 0] || f.moves[0] });
    }
    if (foeAct.kind === 'move') {
      const f = active('foe');
      queue.push({ side: 'foe', f, move: f.moves[foeAct.index | 0] || f.moves[0] });
    }
    if (queue.length === 2) {
      const [a, b] = queue;
      const pa = priorityOf(a.move), pb = priorityOf(b.move);
      const sa = speedOf(a.f, state.weather), sb = speedOf(b.f, state.weather);
      const bFirst = pb > pa || (pb === pa && (sb > sa || (sb === sa && rng() < 0.5)));
      if (bFirst) queue.reverse();
    }
    const usedProtect = { me: false, foe: false };
    for (const q of queue) {
      if (state.over) break;
      if (active(q.side) !== q.f || q.f.fainted) continue;   // it fainted, or a new one came in
      if (moveMeta(q.move) && moveMeta(q.move).protect) usedProtect[q.side] = true;
      useMove(q.side, q.move, events);
    }
    resetChainsExcept(usedProtect);

    // 4. Weather and poison / burn.
    if (!state.over) residual(events);
    return finishTurn(events);
  }

  const openingEvents = [];
  onEntry('me', openingEvents);
  onEntry('foe', openingEvents);
  commitIntent();

  return {
    state,
    wild: !!wild,
    leader: !!leader,
    profile,
    pro: true,
    openingEvents,
    async choose(action = {}, { foe = null } = {}) {
      if (state.over || busy) return [];
      busy = true;
      try { return turn(action || {}, foe); }
      finally { busy = false; }
    },
    foeIntent() { return intent.kind === 'move' ? intent.index : 0; },
    foeIntentMove() { const f = active('foe'); return f.moves[intent.kind === 'move' ? intent.index : 0] || f.moves[0]; },
    foeIntentAction() {
      const f = active('foe');
      const kind = intentKind(intent, f);
      return { kind: intent.kind, index: intent.index, icon: kind, move: intent.kind === 'move' ? { ...(f.moves[intent.index] || f.moves[0]) } : null };
    }
  };
}
