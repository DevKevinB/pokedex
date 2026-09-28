// ============================================================
// SPROUT ROAD: WILD CHAPTERS (ROADMAP M7, "content an agent can keep writing").
// After the Champion, a signpost by the Tree leads to a second, smaller
// winding path of postgame chapters. Each chapter is plain DATA below and
// goes through data/validate-chapter.js at load: a bad one is skipped with a
// console warning, never a crash. Pure: no DOM, no store (node --test loads it).
//
// To add a chapter: append an object to AUTHORED with the next free idx
// (0..23, it names the save keys 'w<idx>-t<j>'), a unique key, and 5
// trainers with the LEADER last (leader: true). Run
//   node --test next/test/wild-chapters.test.mjs
// NEVER renumber or reorder an idx that has shipped: Gabe's progress is
// saved against it.
//
// Progress: road.cleared['w<idx>-t<j>'] = true and road.wildBloomed = [idx].
// A chapter opens when the Champion is beaten (first chapter) or when the
// previous chapter's leader is beaten. Play progress only, never a clock.
// ============================================================

import { loadChapters, WILD_CHAPTER_TRAINERS } from './validate-chapter.js';
import { CHAPTERS, currentChapter } from './chapters.js';

const T = (name, taunt, ids, level, leader = false) => {
  const t = { name, taunt, team: ids.map(id => ({ id, level })) };
  if (leader) t.leader = true;
  return t;
};

// Levels climb from 62 (just past Victory Road) to 85 (past the Champion's 80).
const AUTHORED = [
  {
    idx: 0, key: 'frost-peak', name: 'FROST PEAK', emoji: '🏔️', types: ['ice'],
    palette: { ground: '#9fd3e8', sky: '#f0fbff', accent: '#2f6f96' },
    flavour: 'SNOW THAT NEVER MELTS.',
    trainers: [
      T('SKIER NIKA', 'THE SNOW IS MY FRIEND!', [124, 225, 221], 62),
      T('CLIMBER BO', 'CAN YOU CLIMB THIS HIGH?', [87, 364, 614], 63),
      T('SKIER YUKI', 'BRRR! READY TO FREEZE?', [478, 584, 615], 64),
      T('CLIMBER HAL', 'THE PEAK IS MINE!', [461, 473, 91, 365], 65),
      T('LEADER FROSTINE', 'FEEL THE BIG CHILL!', [131, 460, 471, 362, 144], 68, true)
    ]
  },
  {
    idx: 1, key: 'coral-reef', name: 'CORAL REEF', emoji: '🐚', types: ['water'],
    palette: { ground: '#3fb8c4', sky: '#c9f4f2', accent: '#156f82' },
    flavour: 'BUBBLES, SHELLS AND BIG WAVES.',
    trainers: [
      T('SWIMMER MAYA', 'SPLASH! COME ON IN!', [222, 370, 119], 66),
      T('DIVER JUN', 'I SAW SOMETHING DEEP DOWN!', [367, 368, 369], 67),
      T('SWIMMER LEO', 'THE TIDE IS ON MY SIDE!', [121, 226, 594], 68),
      T('DIVER KAIA', 'HOLD YOUR BREATH!', [130, 272, 350, 593], 69),
      T('LEADER MARINA', 'THE WHOLE OCEAN IS MINE!', [9, 230, 260, 395, 382], 72, true)
    ]
  },
  {
    idx: 2, key: 'storm-cape', name: 'STORM CAPE', emoji: '⛈️', types: ['electric', 'water'],
    palette: { ground: '#6c8fb8', sky: '#e6ecf7', accent: '#2c3f73' },
    flavour: 'THUNDER ROLLS OVER THE SEA.',
    trainers: [
      T('SAILOR FINN', 'THE STORM IS COMING!', [171, 181, 596], 70),
      T('ENGINEER VOLT', 'FULL POWER, GO!', [82, 101, 479], 71),
      T('SAILOR RAE', 'LIGHTNING NEVER MISSES!', [135, 310, 604], 72),
      T('ENGINEER ZAP', 'MY HAIR IS STANDING UP!', [26, 466, 523, 587], 73),
      T('LEADER THUNDRA', 'HEAR THE THUNDER ROAR!', [462, 405, 642, 130, 145], 76, true)
    ]
  },
  {
    idx: 3, key: 'iron-works', name: 'IRON WORKS', emoji: '⚙️', types: ['steel'],
    palette: { ground: '#9aa3ad', sky: '#e9edf0', accent: '#4a5561' },
    flavour: 'GEARS CLANK ALL DAY LONG.',
    trainers: [
      T('WORKER GUS', 'CLANK CLANK! HARD HATS ON!', [208, 227, 306], 74),
      T('MECHANIC IDA', 'I FIX ANYTHING. EVEN YOU!', [376, 437, 601], 75),
      T('WORKER TOM', 'SOLID STEEL, SOLID TEAM!', [212, 448, 530], 76),
      T('MECHANIC NELL', 'TIGHTEN THOSE BOLTS!', [303, 476, 589, 632], 77),
      T('LEADER FORGE', 'NOTHING BENDS MY STEEL!', [625, 462, 379, 638, 483], 79, true)
    ]
  },
  {
    idx: 4, key: 'moonlit-grove', name: 'MOONLIT GROVE', emoji: '🌙', types: ['fairy', 'dark'],
    palette: { ground: '#7d5fb0', sky: '#e7dcf7', accent: '#3b2566' },
    flavour: 'FAIRY LIGHTS IN THE DARK.',
    trainers: [
      T('WITCH LUNA', 'TWINKLE TWINKLE, LET US PLAY!', [36, 40, 184], 77),
      T('PUNK KIT', 'THE NIGHT IS OUR TIME!', [197, 229, 359], 78),
      T('WITCH FAE', 'A LITTLE MAGIC FOR YOU!', [282, 468, 210], 79),
      T('PUNK DUSK', 'SHADOWS HIDE EVERYTHING!', [430, 510, 553, 302], 80),
      T('LEADER NOCTIS', 'SWEET DREAMS, CHALLENGER!', [122, 442, 571, 635, 491], 82, true)
    ]
  },
  {
    idx: 5, key: 'sky-pillar', name: 'SKY PILLAR', emoji: '🐉', types: ['flying', 'dragon'],
    palette: { ground: '#5f9fd8', sky: '#dff0ff', accent: '#24508a' },
    flavour: 'THE TOWER ABOVE THE CLOUDS.',
    trainers: [
      T('BIRD KEEPER ARI', 'UP, UP AND AWAY!', [18, 277, 521], 80),
      T('DRAGON TAMER KO', 'DRAGONS FLY HIGHER!', [334, 330, 621], 81),
      T('BIRD KEEPER SKY', 'FEEL THE WIND!', [142, 398, 628], 82),
      T('DRAGON TAMER MEI', 'MY DRAGONS NEVER SLEEP!', [149, 373, 445, 612], 83),
      T('LEADER AERIS', 'THE SKY BOWS TO ME!', [249, 250, 643, 644, 384], 85, true)
    ]
  }
];

/** The authored data exactly as written (for the unit test). */
export const WILD_AUTHORED = AUTHORED;

/** Every chapter that passed validation, sorted by idx, deep-frozen. */
export const WILD_CHAPTERS = loadChapters(AUTHORED, msg => { try { console.warn(msg); } catch (e) { /* ignore */ } });

export const WILD_LEADER = WILD_CHAPTER_TRAINERS - 1;
export const wildKey = (idx, j) => 'w' + idx + '-t' + j;

/** The chapter with this save idx, or null. */
export const wildByIdx = idx => WILD_CHAPTERS.find(c => c.idx === idx) || null;
/** Where a save idx sits on the path (0 = first), or -1. */
export const wildPos = idx => WILD_CHAPTERS.findIndex(c => c.idx === idx);
export const wildTrainerLevel = t => t.team.reduce((a, m) => Math.max(a, m.level), 0);

const roadOf = p => (p && p.road && typeof p.road === 'object') ? p.road : {};
const clearedOf = p => (roadOf(p).cleared && typeof roadOf(p).cleared === 'object') ? roadOf(p).cleared : {};
const bloomedOf = p => Array.isArray(roadOf(p).wildBloomed) ? roadOf(p).wildBloomed : [];

/** The signpost stands once the Champion has fallen. */
export const wildUnlocked = p => currentChapter(p) >= CHAPTERS.length;

export function isWildCleared(p, idx, j) {
  if (!wildByIdx(idx) || !Number.isInteger(j) || j < 0 || j > WILD_LEADER) return false;
  return !!clearedOf(p)[wildKey(idx, j)];
}

/** Bloomed: in wildBloomed, or its leader is cleared (either one is enough). */
export const isWildBloomed = (p, idx) => !!wildByIdx(idx) && (bloomedOf(p).includes(idx) || isWildCleared(p, idx, WILD_LEADER));

/** Chapter at path position k opens with the Champion (k = 0) or the leader before it. */
export function isWildOpen(p, k) {
  const c = WILD_CHAPTERS[k];
  if (!c || !wildUnlocked(p)) return false;
  return k === 0 || isWildBloomed(p, WILD_CHAPTERS[k - 1].idx);
}

/** Beaten trainers stay open for rematches; the next one waits for the one before. */
export function isWildTrainerOpen(p, idx, j) {
  const k = wildPos(idx);
  if (k < 0 || !isWildOpen(p, k) || !Number.isInteger(j) || j < 0 || j > WILD_LEADER) return false;
  return j === 0 || isWildCleared(p, idx, j) || isWildCleared(p, idx, j - 1);
}

/** Path position of the first chapter not yet bloomed; WILD_CHAPTERS.length when all are. */
export function currentWild(p) {
  for (let k = 0; k < WILD_CHAPTERS.length; k++) if (!isWildBloomed(p, WILD_CHAPTERS[k].idx)) return k;
  return WILD_CHAPTERS.length;
}

/** The next unbeaten wild trainer {idx, j}, or null (locked, or all done). */
export function nextWildTrainer(p) {
  if (!wildUnlocked(p)) return null;
  const k = currentWild(p);
  const c = WILD_CHAPTERS[k];
  if (!c) return null;
  for (let j = 0; j <= WILD_LEADER; j++) if (!isWildCleared(p, c.idx, j)) return { idx: c.idx, j };
  return null;
}

/** 'done' | 'current' | 'soon' (the next two, grey) | 'fog' (hidden). */
export function wildView(p, k) {
  if (!WILD_CHAPTERS[k]) return 'fog';
  if (isWildBloomed(p, WILD_CHAPTERS[k].idx)) return 'done';
  const cur = currentWild(p);
  if (k === cur && wildUnlocked(p)) return 'current';
  if (k > cur && k <= cur + 2) return 'soon';
  return k < cur ? 'done' : 'fog';
}

/** Battle params for the normal trainer battle flow. */
export function wildBattleParams(idx, j) {
  const c = wildByIdx(idx);
  const t = c && c.trainers[j];
  if (!t) return null;
  return {
    enemyTeam: t.team.map(m => ({ id: m.id, level: m.level })),
    trainer: { name: t.name, taunt: t.taunt, leader: j === WILD_LEADER },
    wild: false,
    postgame: true,                 // battle.js lifts foes toward a strong team's level
    returnTo: 'road',
    onEnd: 'wild:' + idx + ':' + j
  };
}

/** 'wild:3:4' -> {idx:3, j:4}; anything else (including the tall grass's
 *  four-part 'wild:<place>:<id>:<shiny>') -> null. */
export function parseWildEnd(s) {
  const m = /^wild:(0|[1-9]\d?):(\d)$/.exec(typeof s === 'string' ? s : '');
  if (!m) return null;
  const idx = +m[1], j = +m[2];
  if (!wildByIdx(idx) || j > WILD_LEADER) return null;
  return { idx, j };
}

/**
 * Record a Wild Chapter win. Mutates the player (caller commits). Idempotent:
 * a second call changes nothing and never re-blooms. -> null for a bad
 * onEnd, else {idx, j, pos, leader, bloom}. bloom is true only the first time
 * the leader falls, and wildBloomed already holds idx when it returns.
 * Only ever ADDS: nothing is un-cleared or un-bloomed.
 */
export function applyWildWin(p, onEnd) {
  const e = parseWildEnd(onEnd);
  if (!e || !p || typeof p !== 'object') return null;
  if (!p.road || typeof p.road !== 'object') p.road = {};
  const r = p.road;
  if (!r.cleared || typeof r.cleared !== 'object') r.cleared = {};
  if (!Array.isArray(r.wildBloomed)) r.wildBloomed = [];
  r.cleared[wildKey(e.idx, e.j)] = true;
  const leader = e.j === WILD_LEADER;
  let bloom = false;
  if (leader && !r.wildBloomed.includes(e.idx)) {
    r.wildBloomed.push(e.idx);
    r.wildBloomed.sort((a, b) => a - b);
    bloom = true;
  }
  return { idx: e.idx, j: e.j, pos: wildPos(e.idx), leader, bloom };
}
