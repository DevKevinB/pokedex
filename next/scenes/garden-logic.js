// SPROUT ROAD: Art's Garden, pure logic (no DOM, unit-tested).
// Everything here takes plain data and returns plain data, so the rules that
// matter most to a four-year-old (petals only go up, plots recycle oldest
// first, visitors arrive every 8 petals) are provable in node --test.

export const MAX_PLOTS = 60;
export const PETALS_PER_VISITOR = 8;
export const EVOLVE_AT = { 1: 50, 2: 150 };        // stage -> petals needed to reach stage+1
export const STAGE_IDS = [1, 2, 3];                 // Bulbasaur, Ivysaur, Venusaur
export const MAX_GROWN = 4;                         // 0-1 sprout, 2-3 flower, 4 berry bush
export const BERRIES_PER_GIFT = 10;                 // every 10 berries he picks sends 1 gift to the Road

// Flower look + the berry its bush carries. Keys are what the save stores.
export const KINDS = [
  { key: 'oran',   flower: '\u{1F337}', berry: 'oran-berry' },   // tulip
  { key: 'pecha',  flower: '\u{1F338}', berry: 'pecha-berry' },  // blossom
  { key: 'sitrus', flower: '\u{1F33C}', berry: 'sitrus-berry' }, // daisy
  { key: 'cheri',  flower: '\u{1F33B}', berry: 'cheri-berry' },  // sunflower
  { key: 'razz',   flower: '\u{1F33A}', berry: 'razz-berry' },   // hibiscus
  { key: 'rawst',  flower: '\u{1F339}', berry: 'rawst-berry' },  // rose
];
const KIND_BY_KEY = Object.fromEntries(KINDS.map(k => [k.key, k]));
export function kindInfo(key) { return KIND_BY_KEY[key] || KINDS[0]; }

// Hand-picked, gentle grass / bug / fairy / water friends (all <= 649, so the
// gen-5 animated sprite exists). Never a legendary, never anything scary.
export const VISITORS = [
  152, 252, 387, 495,          // Chikorita, Treecko, Turtwig, Snivy
  7, 158, 258, 393, 501,       // Squirtle, Totodile, Mudkip, Piplup, Oshawott
  43, 69, 187, 191, 270, 273, 285, 406, 420, 546, 548, // Oddish .. Petilil
  10, 165, 265, 412, 415, 540, // Caterpie, Ledyba, Wurmple, Burmy, Combee, Sewaddle
  35, 39, 173, 174, 175, 183, 298, // Clefairy, Jigglypuff, Cleffa, Igglybuff, Togepi, Marill, Azurill
  54, 60, 194, 422,            // Psyduck, Poliwag, Wooper, Shellos
];

export const clamp01 = v => Math.max(0, Math.min(1, Number(v) || 0));

/** Stable kind for a spot on the ground: a little hash of a 10x10 grid cell. */
export function plotKind(x, y) {
  const xi = Math.floor(clamp01(x) * 10), yi = Math.floor(clamp01(y) * 10);
  const hsh = (Math.imul(xi + 7, 73856093) ^ Math.imul(yi + 3, 19349663)) >>> 0;
  return KINDS[hsh % KINDS.length].key;
}

export function plotLook(grown) {
  const g = Math.max(0, Math.min(MAX_GROWN, grown | 0));
  return g >= MAX_GROWN ? 'bush' : g >= 2 ? 'flower' : 'sprout';
}

/** Fill in any missing garden/bulba fields. Only ever ADDS; never lowers. */
export function ensureGardenState(p) {
  if (!p.bulba || typeof p.bulba !== 'object') p.bulba = {};
  const b = p.bulba;
  if (!Number.isFinite(b.petals) || b.petals < 0) b.petals = Math.max(0, Number(b.petals) || 0);
  if (![1, 2, 3].includes(b.stage)) b.stage = Math.min(3, Math.max(1, Math.floor(Number(b.stage) || 1)));
  if (typeof b.stayStone !== 'boolean') b.stayStone = false;
  if (!Array.isArray(b.visitors)) b.visitors = [];
  if (!p.garden || typeof p.garden !== 'object') p.garden = {};
  const g = p.garden;
  if (!Array.isArray(g.plots)) g.plots = [];
  if (!Number.isFinite(g.berries) || g.berries < 0) g.berries = 0;
  if (!Array.isArray(p.caught)) p.caught = [];
  if (!p.mons || typeof p.mons !== 'object') p.mons = {};
  if (!p.stats || typeof p.stats !== 'object') p.stats = {};
  return p;
}

/** Petals only go up. Returns the new total. */
export function addPetals(bulba, n = 1) {
  const add = Math.max(0, Math.floor(Number(n) || 0));
  bulba.petals = Math.max(0, Math.floor(Number(bulba.petals) || 0)) + add;
  return bulba.petals;
}

/** How many new visitors crossing from `before` to `after` petals earns. */
export function visitorsDue(before, after) {
  return Math.max(0, Math.floor(after / PETALS_PER_VISITOR) - Math.floor(before / PETALS_PER_VISITOR));
}

/** The picture meter: how many of the 8 petal slots are lit right now. */
export function meterFill(petals) {
  return Math.max(0, Math.floor(petals)) % PETALS_PER_VISITOR;
}

/** Is the bud ready and glowing? (not while the Everstone is on) */
export function budReady(bulba) {
  const need = EVOLVE_AT[bulba.stage];
  return !!need && !bulba.stayStone && bulba.petals >= need;
}

/** 0..1: how far the bulb has swelled toward the next stage. */
export function bulbSwell(bulba) {
  const need = EVOLVE_AT[bulba.stage];
  if (!need) return 1;
  const from = bulba.stage === 2 ? EVOLVE_AT[1] : 0;
  return clamp01((bulba.petals - from) / (need - from));
}

/** One-way: stage 1 -> 2 -> 3. Returns true if it evolved. */
export function evolve(bulba) {
  if (!budReady(bulba)) return false;
  bulba.stage = Math.min(3, bulba.stage + 1);
  return true;
}

export function stageId(stage) { return STAGE_IDS[Math.min(3, Math.max(1, stage | 0)) - 1]; }

/** Nearest plot to (x,y) in PIXEL space, within `radius` px, or -1. */
export function findPlotNear(plots, px, py, w, hgt, radius) {
  let best = -1, bestD = radius * radius;
  plots.forEach((p, i) => {
    const dx = p.x * w - px, dy = p.y * hgt - py;
    const d = dx * dx + dy * dy;
    if (d <= bestD) { bestD = d; best = i; }
  });
  return best;
}

/** Plant at a fractional spot. Oldest plot recycles past MAX_PLOTS. Returns the new plot. */
export function addPlot(garden, x, y) {
  const plot = { x: +clamp01(x).toFixed(3), y: +clamp01(y).toFixed(3), kind: plotKind(x, y), grown: 0 };
  garden.plots.push(plot);
  while (garden.plots.length > MAX_PLOTS) garden.plots.shift();
  return plot;
}

/** Grow a plot one step. Returns true if it changed (a bush is fully grown). */
export function growPlot(plot) {
  if ((plot.grown | 0) >= MAX_GROWN) return false;
  plot.grown = (plot.grown | 0) + 1;
  return true;
}

/** A visitor for the garden: prefers species he hasn't caught, never one already on screen. */
export function pickVisitor(caught, onScreen = [], rng = Math.random) {
  const have = new Set((caught || []).map(Number));
  const busy = new Set(onScreen.map(Number));
  const fresh = VISITORS.filter(id => !have.has(id) && !busy.has(id));
  const pool = fresh.length ? fresh : VISITORS.filter(id => !busy.has(id));
  if (!pool.length) return VISITORS[0];
  return pool[Math.floor(rng() * pool.length) % pool.length];
}

/** Record a garden catch: caught, level-5 mon (never lowers an existing one), visitors, stats. */
export function recordCatch(p, id) {
  id = Number(id);
  if (!p.caught.includes(id)) p.caught.push(id);
  const m = p.mons[id];
  if (!m || typeof m !== 'object') p.mons[id] = { level: 5, xp: 0 };
  if (!p.bulba.visitors.includes(id)) p.bulba.visitors.push(id);
  p.stats.catches = (Number(p.stats.catches) || 0) + 1;
  return p;
}

/**
 * Gifts earned crossing from `before` to `after` berries picked (every
 * BERRIES_PER_GIFT). garden.berries only ever goes up, so this is a lifetime
 * milestone count: nothing is ever taken from Art to make a gift.
 */
export function giftsDue(before, after) {
  const b = Math.max(0, Math.floor(Number(before) || 0));
  const a = Math.max(0, Math.floor(Number(after) || 0));
  return Math.max(0, Math.floor(a / BERRIES_PER_GIFT) - Math.floor(b / BERRIES_PER_GIFT));
}
