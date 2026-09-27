// ============================================================
// SPROUT ROAD: wild habitats (wild builder).
//
// A PORT of the classic app's js/explore.js HABITATS and the generated
// js/habitatfill.js BACKFILL + FARAWAY (v18.10), so every one of the 649
// species still has a home. The id lists below are copied verbatim; do not
// hand-edit them, regenerate the classic file and re-copy instead.
//
// Pure data + pure logic, no DOM and no store import, so node --test loads
// it directly (next/test/wild.test.mjs). Randomness is always injected.
//
// CHAPTER -> HABITAT (by the chapter's TYPE, see HABITAT_FOR_TYPE):
//   rock -> cave        (PEBBLE HILLS, and VICTORY ROAD, also a rock chapter)
//   water -> ocean      (CASCADE BAY: the beach)
//   electric -> powerplant
//   grass -> forest
//   psychic -> meadow   (DREAM GARDENS: the fairy/normal meadow, so all eight
//                        classic habitats appear somewhere on the Road)
//   fighting -> cave    (KNUCKLE CANYON: the cave pool is ROCK/GROUND/FIGHT)
//   ghost -> tower
//   ice -> ocean        (the classic ocean pool is WATER/ICE)
//   fire -> volcano
//   dragon -> dragon    (SKY CLIFFS, and the ELITE chapter at the Big Tree)
// Anything unknown falls back to the meadow. FARAWAY LAND is not a chapter:
// it opens once the Champion chapter (the last one) has bloomed.
// ============================================================

import { CHAPTERS, isChapterDone, trainerLevel } from './chapters.js';
import { wildLevel } from './engine.js';

const BASE_HABITATS = [
  // The starter route sits just UNDER the Pokemon a new player actually has.
  // base 4 / spread 3 rolled Lv4-7 (mean 5.5) against the Lv5 that every fresh
  // catch is, on the first card of the map, and with engine.MAX_HIT_FRACTION
  // capping a Lv5 fight at a 2-3 turn race there is no room to recover from a
  // one-level deficit. base 3 / spread 1 is Lv3-4. Nothing else moves: badges
  // still add +2 each and the lead leash still scales the route for a returning
  // player, and habitatLevel() reads the same two numbers so "Lv~4" is honest.
  { key: 'forest', bg: 'grass', base: 3, spread: 1, emoji: '🌲', name: 'DEEP FOREST', sub: 'BUG · GRASS · BIRD',
    c: [10, 13, 16, 19, 43, 69, 48, 161, 163, 165, 265, 401, 504, 519],
    u: [11, 14, 17, 20, 44, 70, 25, 102, 46, 1, 152, 252, 387, 495, 511, 540],
    r: [12, 15, 18, 45, 71, 47, 103, 123, 127, 2, 212, 214, 469, 541, 3],
    L: [251] },
  { key: 'meadow', bg: 'grass', base: 3, spread: 3, emoji: '🌾', name: 'TALL GRASS', sub: 'NORMAL · FAIRY',
    c: [19, 29, 32, 52, 54, 21, 261, 263, 396, 506, 519],
    u: [30, 33, 53, 55, 83, 56, 39, 133, 22, 241, 300, 427, 507, 234],
    r: [31, 34, 40, 57, 113, 143, 115, 242, 463, 531, 108],
    L: [151] },
  { key: 'ocean', bg: 'water', base: 8, spread: 4, emoji: '🌊', name: 'OCEAN & BEACH', sub: 'WATER · ICE',
    c: [72, 90, 98, 118, 120, 129, 170, 183, 194, 320, 456, 550],
    u: [73, 91, 99, 119, 121, 116, 86, 79, 7, 171, 184, 195, 321, 457, 258, 393, 501],
    r: [117, 130, 131, 87, 80, 134, 8, 9, 139, 226, 230, 350, 365, 564],
    L: [144, 245, 249, 382] },
  { key: 'volcano', bg: 'fire', base: 16, spread: 5, emoji: '🔥', name: 'VOLCANO PATH', sub: 'FIRE',
    c: [58, 77, 4, 37, 155, 218, 228, 255, 390, 498, 513],
    u: [59, 78, 5, 126, 136, 156, 219, 229, 256, 391, 499, 514],
    r: [6, 38, 157, 257, 392, 500, 467, 555],
    L: [146, 244, 250, 383] },
  { key: 'powerplant', bg: 'electric', base: 12, spread: 4, emoji: '⚡', name: 'POWER PLANT', sub: 'ELECTRIC · STEEL',
    c: [81, 100, 25, 179, 309, 403, 522],
    u: [82, 101, 26, 125, 180, 310, 404, 523, 417, 311, 312, 599],
    r: [135, 181, 405, 466, 462, 600, 601],
    L: [145, 243, 644] },
  { key: 'cave', bg: 'rock', base: 20, spread: 5, emoji: '🕳️', name: 'DEEP CAVE', sub: 'ROCK · GROUND · FIGHT',
    c: [74, 50, 41, 27, 66, 293, 296, 524, 529, 532],
    u: [75, 51, 42, 28, 95, 104, 67, 111, 294, 297, 299, 525, 530, 533, 246],
    r: [76, 105, 112, 68, 106, 107, 138, 140, 142, 132, 247, 248, 476, 526, 534],
    L: [150, 486] },
  { key: 'tower', bg: 'ghost', base: 26, spread: 6, emoji: '👻', name: 'GHOST TOWER', sub: 'GHOST · PSYCHIC',
    c: [92, 41, 35, 96, 200, 353, 355, 425, 562, 607],
    u: [93, 42, 36, 64, 122, 97, 63, 354, 356, 426, 563, 608],
    r: [94, 65, 124, 49, 292, 477, 609, 429],
    L: [491] },
  { key: 'dragon', bg: 'rock', base: 34, spread: 7, emoji: '🐉', name: "DRAGON'S DEN", sub: 'DRAGON · ULTRA RARE',
    c: [129, 116, 333, 371, 443, 610],
    u: [147, 117, 334, 372, 444, 611],
    r: [148, 373, 445, 612, 130, 131],
    L: [149, 151, 384, 483, 487, 643] }
];

const BACKFILL = {
  forest: { c: [23, 84, 88, 109, 114, 167, 187, 193, 204, 266, 268, 273, 276, 285, 316, 331, 406, 412, 415, 420, 451, 543, 546, 568, 585, 588, 590, 616, 627],
      u: [24, 85, 89, 110, 153, 164, 166, 168, 176, 188, 192, 253, 267, 269, 277, 284, 291, 313, 314, 317, 336, 357, 388, 397, 402, 413, 414, 416, 421, 441, 455, 496, 512, 520, 544, 547, 556, 569, 586, 591, 617, 628],
      r: [169, 182, 189, 254, 398, 407, 468, 470, 521, 542, 545],
      L: [] },
  meadow: { c: [137, 173, 174, 175, 190, 209, 216, 235, 287, 298, 399, 431, 446, 572],
      u: [128, 162, 206, 210, 217, 264, 288, 301, 327, 335, 351, 352, 424, 428, 432, 440, 505, 573, 626],
      r: [233, 289, 295, 474, 508],
      L: [] },
  ocean: { c: [60, 158, 211, 215, 223, 238, 270, 278, 283, 318, 341, 349, 363, 366, 418, 422, 458, 515, 535, 580, 592, 613],
      u: [61, 141, 159, 199, 222, 224, 225, 259, 271, 279, 319, 340, 342, 364, 367, 368, 369, 370, 394, 400, 419, 423, 460, 461, 478, 502, 516, 536, 565, 581, 593, 594, 614],
      r: [62, 160, 186, 260, 272, 395, 471, 503, 537, 615],
      L: [] },
  volcano: { c: [240, 322, 554, 636],
      u: [323, 324, 631],
      r: [637],
      L: [] },
  powerplant: { c: [172, 239, 374, 410, 436, 595, 597, 602, 624],
      u: [205, 227, 303, 305, 375, 411, 437, 479, 587, 589, 596, 598, 603, 618, 625, 632],
      r: [604],
      L: [] },
  cave: { c: [207, 231, 290, 328, 345, 347, 408, 438, 447, 449, 453, 557, 566, 619],
      u: [213, 232, 237, 286, 346, 348, 409, 454, 472, 538, 539, 558, 567, 620],
      r: [389, 450, 464],
      L: [] },
  tower: { c: [177, 198, 281, 307, 343, 360, 433, 434, 439, 509, 527, 551, 559, 570, 574, 605, 622, 629],
      u: [178, 201, 202, 262, 274, 308, 326, 332, 337, 338, 344, 358, 359, 430, 435, 442, 452, 510, 518, 528, 552, 560, 561, 571, 575, 578, 606, 623, 630],
      r: [275, 475, 553, 576, 579],
      L: [] },
  dragon: { c: [633],
      u: [329, 621, 634],
      r: [330, 635],
      L: [] }
};

export const FARAWAY = {
  key: 'faraway', base: 50, spread: 8, emoji: '🌈', name: 'FARAWAY LAND',
  sub: 'THE CHAMPION\'S SAFARI', championOnly: true,
  c: [12, 15, 38, 40, 55, 59, 73, 78, 80, 82, 85, 87, 89, 91, 97, 99, 101, 103, 110, 112, 115, 121, 122, 125, 126, 127, 128, 130, 131, 134, 135, 136, 139, 141, 142, 143, 171, 178, 184, 196, 197, 199, 205, 208, 212, 213, 214, 217, 224, 226, 227, 229, 232, 233, 234, 241, 267, 269, 286, 291, 297, 310, 317, 319, 321, 323, 324, 326, 332, 334, 335, 336, 337, 338, 340, 342, 344, 346, 348, 350, 357, 359, 362, 367, 368, 369, 409, 411, 416, 419, 423, 424, 426, 428, 429, 430, 435, 437, 442, 448, 450, 452, 454, 457, 460, 461, 463, 465, 469, 470, 471, 472, 476, 478, 512, 514, 516, 518, 523, 530, 538, 539, 547, 549, 550, 555, 556, 558, 560, 561, 563, 565, 567, 569, 571, 573, 581, 586, 589, 591, 593, 594, 596, 598, 606, 614, 615, 617, 618, 620, 621, 623, 625, 626, 628, 630, 631, 632],
  u: [3, 9, 18, 26, 31, 34, 36, 45, 62, 65, 68, 71, 76, 94, 154, 160, 181, 182, 186, 189, 254, 257, 272, 275, 282, 295, 306, 330, 365, 389, 395, 398, 405, 407, 473, 475, 477, 497, 500, 503, 508, 521, 526, 534, 537, 542, 545, 553, 576, 579, 601, 604, 609],
  r: [6, 113, 149, 157, 169, 230, 242, 248, 260, 289, 373, 376, 392, 445, 462, 464, 466, 467, 468, 474, 531, 584, 612, 635, 637],
  L: [377, 378, 379, 380, 381, 385, 386, 480, 481, 482, 484, 485, 488, 489, 490, 492, 493, 494, 638, 639, 640, 641, 642, 645, 646, 647, 648, 649]
};

// Merge the backfill into the hand-curated pools (same as the classic app),
// then append FARAWAY LAND with the psychic backdrop.
BASE_HABITATS.forEach(h => {
  const extra = BACKFILL[h.key];
  if (!extra) return;
  ['c', 'u', 'r', 'L'].forEach(k => extra[k].forEach(id => { if (!h[k].includes(id)) h[k].push(id); }));
});

export { BACKFILL };
export const HABITATS = [...BASE_HABITATS, { bg: 'psychic', ...FARAWAY }];
export const FARAWAY_KEY = 'faraway';

export const HABITAT_FOR_TYPE = Object.freeze({
  rock: 'cave', water: 'ocean', electric: 'powerplant', grass: 'forest', psychic: 'meadow',
  fighting: 'cave', ghost: 'tower', ice: 'ocean', fire: 'volcano', dragon: 'dragon'
});
export const DEFAULT_HABITAT = 'meadow';

/** The habitat object for a key, or null. */
export const habitatByKey = key => HABITATS.find(h => h.key === key) || null;

/** Habitat key for a chapter type ('rock' -> 'cave'); unknown -> 'meadow'. */
export function habitatKeyForType(type) {
  return Object.hasOwn(HABITAT_FOR_TYPE, type) ? HABITAT_FOR_TYPE[type] : DEFAULT_HABITAT;
}

/** The habitat of chapter i (by index), or null for a bad index. */
export function habitatForChapter(i) {
  const ch = CHAPTERS[i];
  return ch ? habitatByKey(habitatKeyForType(ch.type)) : null;
}

// ---------------------------------------------------------------- places

export const CHAMPION_CHAPTER = CHAPTERS.length - 1;

/** A chapter has tall grass once it has bloomed (Road or classic progress). */
export const grassOpen = (p, i) => !!CHAPTERS[i] && isChapterDone(p, i);

/** FARAWAY LAND: only after the Champion chapter has bloomed (or he is the
 *  classic Champion already). */
export function farawayOpen(p) {
  if (!p) return false;
  const bloomed = p.road && Array.isArray(p.road.bloomed) && p.road.bloomed.includes(CHAMPION_CHAPTER);
  return bloomed || isChapterDone(p, CHAMPION_CHAPTER) || !!p.champion;
}

/** 'wild' place id: a chapter index (0..11) or 'faraway'. */
export function parsePlace(v) {
  if (v === FARAWAY_KEY) return FARAWAY_KEY;
  const n = typeof v === 'string' && /^\d{1,2}$/.test(v) ? Number(v) : v;
  return Number.isInteger(n) && CHAPTERS[n] ? n : null;
}

/** Habitat for a place (chapter index or 'faraway'). */
export const habitatForPlace = place => place === FARAWAY_KEY ? habitatByKey(FARAWAY_KEY) : habitatForChapter(place);

/** Can this player walk into this place right now? */
export const placeOpen = (p, place) => place === FARAWAY_KEY ? farawayOpen(p) : (place != null && grassOpen(p, place));

/** Every place with grass for this player, in Road order, FARAWAY last
 *  (always listed, with open:false until it opens: a prize with a door). */
export function wildPlaces(p) {
  const out = [];
  CHAPTERS.forEach((ch, i) => {
    if (grassOpen(p, i)) out.push({ place: i, chapter: ch, habitat: habitatForChapter(i), open: true });
  });
  out.push({ place: FARAWAY_KEY, chapter: null, habitat: habitatByKey(FARAWAY_KEY), open: farawayOpen(p) });
  return out;
}

// ---------------------------------------------------------------- encounters

export const SHINY_ODDS = 64;          // 1 in 64, a sparkle in the grass
// Classic rarity roll: 1% legendary, 9% rare, 30% uncommon, 60% common.
export const TIER_CUTS = Object.freeze({ legendary: 0.01, rare: 0.10, uncommon: 0.40 });

const pick = (pool, rng) => pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];

/** -> {id, tier:'common'|'uncommon'|'rare'|'legendary'} (classic weights). */
export function rollEncounter(habitat, rng = Math.random) {
  const roll = rng();
  let pool, tier;
  if (roll < TIER_CUTS.legendary && habitat.L.length) { pool = habitat.L; tier = 'legendary'; }
  else if (roll < TIER_CUTS.rare && habitat.r.length) { pool = habitat.r; tier = 'rare'; }
  else if (roll < TIER_CUTS.uncommon && habitat.u.length) { pool = habitat.u; tier = 'uncommon'; }
  else { pool = habitat.c; tier = 'common'; }
  return { id: pick(pool, rng), tier };
}

export const rollShiny = (rng = Math.random) => rng() < 1 / SHINY_ODDS;

/**
 * The level band of a place. A chapter region's grass sits just under that
 * chapter's first trainer (the classic habitat bases were tuned for a flat
 * map; on the Road the region itself says how far along you are), keeping
 * the habitat's own spread. FARAWAY keeps its classic 50 + 8.
 */
export function wildBand(place) {
  if (place === FARAWAY_KEY) return { base: FARAWAY.base, spread: FARAWAY.spread };
  const ch = CHAPTERS[place];
  const h = habitatForChapter(place);
  if (!ch || !h) return { base: 5, spread: 3 };
  return { base: Math.max(3, trainerLevel(ch.trainers[0]) - 3), spread: h.spread ?? 3 };
}

/** Rolled level: the place's band, leashed to the lead by engine.wildLevel
 *  (badges 0: the band already rises chapter by chapter). */
export function encounterLevel(place, leadLevel, { junior = false, rng = Math.random } = {}) {
  const { base, spread } = wildBand(place);
  const lead = Math.max(1, Math.min(100, Math.floor(Number(leadLevel)) || 5));
  return wildLevel({ base, spread, badges: 0, leadLevel: lead, junior, rng });
}

/** Lead level of a player's team (team[0], else first caught; 5 if none; a prereader's BULBA). */
export function leadLevelOf(p) {
  // A prereader's lead is always his BULBA (stage 1..3 = #1..#3; battle.js puts him first).
  const bulba = p && p.profile === 'prereader' ? Math.min(3, Math.max(1, (p.bulba && p.bulba.stage) | 0 || 1)) : 0;
  const id = bulba || (p && Array.isArray(p.team) && p.team[0]) || (p && Array.isArray(p.caught) && p.caught[0]);
  const m = id && p.mons && p.mons[id];
  const lv = m ? Math.floor(Number(m.level)) : 5;
  return Number.isFinite(lv) && lv > 0 ? Math.min(100, lv) : 5;
}

/** One whole wild encounter: {id, tier, level, shiny}. */
export function rollWild(place, p, rng = Math.random) {
  const habitat = habitatForPlace(place);
  if (!habitat) return null;
  const { id, tier } = rollEncounter(habitat, rng);
  const level = encounterLevel(place, leadLevelOf(p), { junior: !!(p && p.profile === 'prereader'), rng });
  return { id, tier, level, shiny: rollShiny(rng) };
}

// ---------------------------------------------------------------- the battle round trip

/**
 * battle.js hands params.onEnd back untouched in ctx.go(returnTo, {result, onEnd}),
 * so the encounter rides on it: 'wild:<place>:<id>:<0|1 shiny>'.
 */
export const wildOnEnd = (place, id, shiny) => `wild:${place}:${Math.floor(Number(id))}:${shiny ? 1 : 0}`;

/** 'wild:3:74:1' -> {place:3, id:74, shiny:true}; anything else -> null. */
export function parseWildEnd(s) {
  const m = /^wild:(\d{1,2}|faraway):(\d{1,3}):([01])$/.exec(typeof s === 'string' ? s : '');
  if (!m) return null;
  const place = parsePlace(m[1]);
  const id = Number(m[2]);
  if (place == null || id < 1 || id > 649) return null;
  return { place, id, shiny: m[3] === '1' };
}
