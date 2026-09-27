// SPROUT ROAD: Art's garden decorations and Bulba's accessories (pure data +
// pure helpers, no DOM, unit-tested in test/garden.test.mjs).
//
// ART'S TRICKLE (ROADMAP 5.2 Thread A, M7): something new for Art that depends
// only on his own play, never on a clock. Petals only ever go up, so an unlock
// can never be lost:
//   - one new DECORATION every 10 petals (30 of them, then the garden is full
//     of things and the visitors keep coming);
//   - one new BULBA ACCESSORY every 25 petals (8 of them).
// Keys are what the save stores (garden.decor[].kind, bulba.accessory): short
// safe keys (validate.isShortKey). NEVER rename or reorder a key: a save that
// holds it would show nothing for it.
//
// `look` says how garden.js draws the thing (no words anywhere):
//   emoji: [..]   one big emoji per entry, side by side
//   parts: n      n empty <i> children the CSS draws (.gd-dc-<key> i:nth-child)
//   item: 'name'  a PokeAPI item sprite (ITEM(name)) on top of the parts/emoji
// `react` is what Bulba does when he visits it (garden.js animates each):
//   sit | swing | splash | sniff | hop | hug | dig | watch

export const PETALS_PER_DECOR = 10;
export const PETALS_PER_ACCESSORY = 25;

const D = (key, react, look, extra = {}) => ({ key, react, look, ...extra });

// Unlock order = list order: DECOR[i] opens at (i + 1) * 10 petals.
const DECOR_LIST = [
  D('sunflowers', 'sniff',  { emoji: ['\u{1F33B}', '\u{1F33B}', '\u{1F33B}'] }),
  D('pond',       'sit',    { parts: 3 }, { wide: true }),
  D('stones',     'hop',    { parts: 3 }, { wide: true }),
  D('swing',      'swing',  { parts: 3 }, { tall: true }),
  D('mushrooms',  'sniff',  { emoji: ['\u{1F344}', '\u{1F344}', '\u{1F344}'] }),
  D('blanket',    'sit',    { parts: 1, emoji: ['\u{1F34E}'] }, { wide: true }),
  D('birdbath',   'splash', { parts: 3 }),
  D('berrytree',  'sniff',  { parts: 2, item: 'oran-berry' }, { tall: true }),
  D('house',      'hug',    { parts: 4 }),
  D('kite',       'watch',  { parts: 1, emoji: ['\u{1FA81}'] }, { tall: true }),
  D('bench',      'sit',    { parts: 3 }),
  D('lanterns',   'watch',  { emoji: ['\u{1F3EE}', '\u{1F3EE}'] }),
  D('sandpit',    'dig',    { parts: 1, emoji: ['\u{1FAA3}'] }, { wide: true }),
  D('rainbow',    'hop',    { parts: 1 }, { wide: true }),
  D('hedgeheart', 'hug',    { parts: 3 }),
  D('tulips',     'sniff',  { emoji: ['\u{1F337}', '\u{1F337}', '\u{1F337}'] }),
  D('pinwheel',   'watch',  { parts: 2 }, { tall: true }),
  D('balloons',   'hop',    { emoji: ['\u{1F388}', '\u{1F388}'] }),
  D('fountain',   'splash', { emoji: ['\u{26F2}'] }),
  D('tent',       'sit',    { emoji: ['\u{26FA}'] }),
  D('log',        'sit',    { emoji: ['\u{1FAB5}'] }),
  D('shells',     'sniff',  { emoji: ['\u{1F41A}', '\u{1F41A}'] }),
  D('pokedoll',   'hug',    { item: 'poke-doll' }),
  D('strawberry', 'sniff',  { emoji: ['\u{1F353}', '\u{1F353}', '\u{1F353}'] }),
  D('chime',      'watch',  { emoji: ['\u{1F390}'] }),
  D('cake',       'hug',    { emoji: ['\u{1F382}'] }),
  D('bubbles',    'hop',    { emoji: ['\u{1FAE7}'] }),
  D('icecream',   'hug',    { emoji: ['\u{1F366}'] }),
  D('carousel',   'hop',    { emoji: ['\u{1F3A0}'] }),
  D('castle',     'hug',    { emoji: ['\u{1F3F0}'] }),
];
export const DECOR = Object.freeze(DECOR_LIST.map((d, i) => Object.freeze({ ...d, at: (i + 1) * PETALS_PER_DECOR })));

// slot: where it sits on Bulba (garden.js positions each slot per stage).
const A = (key, slot, look) => ({ key, slot, look });
const ACC_LIST = [
  A('crown',    'head',  { emoji: ['\u{1F33C}', '\u{1F338}', '\u{1F33C}'] }),
  A('bow',      'head',  { emoji: ['\u{1F380}'] }),
  A('leafhat',  'head',  { parts: 2 }),
  A('scarf',    'neck',  { emoji: ['\u{1F9E3}'] }),
  A('shades',   'face',  { emoji: ['\u{1F576}\u{FE0F}'] }),
  A('partyhat', 'head',  { parts: 2 }),
  A('star',     'chest', { emoji: ['\u{2B50}'] }),
  A('backpack', 'back',  { emoji: ['\u{1F392}'] }),
];
export const ACCESSORIES = Object.freeze(ACC_LIST.map((a, i) => Object.freeze({ ...a, at: (i + 1) * PETALS_PER_ACCESSORY })));

const DECOR_BY_KEY = new Map(DECOR.map(d => [d.key, d]));
const ACC_BY_KEY = new Map(ACCESSORIES.map(a => [a.key, a]));
/** The decoration for a stored kind, or null (an unknown kind from a newer save: drawn as nothing, never dropped). */
export const decorInfo = key => DECOR_BY_KEY.get(key) || null;
export const accessoryInfo = key => ACC_BY_KEY.get(key) || null;

const pet = n => Math.max(0, Math.floor(Number(n) || 0));
export const unlockedDecor = petals => DECOR.filter(d => d.at <= pet(petals));
export const unlockedAccessories = petals => ACCESSORIES.filter(a => a.at <= pet(petals));

/**
 * Every unlock, in the order they happen: by petal count, a decoration before
 * an accessory on a tie. -> [{type:'decor'|'acc', key, at}]
 */
export const ALL_UNLOCKS = Object.freeze([
  ...DECOR.map(d => ({ type: 'decor', key: d.key, at: d.at })),
  ...ACCESSORIES.map(a => ({ type: 'acc', key: a.key, at: a.at })),
].sort((a, b) => a.at - b.at || (a.type === b.type ? 0 : a.type === 'decor' ? -1 : 1)).map(Object.freeze));

/** Unlocks reached at `petals` (a prefix of ALL_UNLOCKS). */
export const unlocksAt = petals => ALL_UNLOCKS.filter(u => u.at <= pet(petals));
/** Unlocks crossed going from `before` to `after` petals (none if it went down). */
export function unlocksBetween(before, after) {
  const b = pet(before), a = pet(after);
  return ALL_UNLOCKS.filter(u => u.at > b && u.at <= a);
}

/**
 * What placing `kind` should do, so every kind always has room. The save holds
 * at most `max` decorations and none is ever removed, so duplicates may only
 * use the spare room left after one slot is kept for every kind he has not put
 * down yet (including ones not unlocked). When a duplicate has no room, the
 * oldest one of that kind hops to the new spot instead: he still sees his
 * thing land where he tapped, and nothing is taken away.
 * -> {op:'place'} | {op:'move', i} | {op:'none'}
 */
export function decorAction(decor, kind, max = 40, kinds = DECOR.map(d => d.key)) {
  const list = Array.isArray(decor) ? decor : [];
  const placed = new Set(list.map(d => d && d.kind));
  const firstOf = list.findIndex(d => d && d.kind === kind);
  if (list.length >= max) return firstOf >= 0 ? { op: 'move', i: firstOf } : { op: 'none' };
  if (!placed.has(kind)) return { op: 'place' };
  const reserve = kinds.filter(k => !placed.has(k)).length;
  return (max - list.length - reserve) > 0 ? { op: 'place' } : { op: 'move', i: firstOf };
}

/** Index of the decoration nearest (x, y) in PIXEL space within `radius` px, or -1. */
export function nearestDecor(decor, px, py, w, hgt, radius) {
  let best = -1, bestD = radius * radius;
  (Array.isArray(decor) ? decor : []).forEach((d, i) => {
    if (!d) return;
    const dx = d.x * w - px, dy = d.y * hgt - py;
    const dd = dx * dx + dy * dy;
    if (dd <= bestD) { bestD = dd; best = i; }
  });
  return best;
}

/** Kinds he has unlocked but never put down yet (they wiggle in the drawer). */
export function freshDecorKinds(petals, decor) {
  const placed = new Set((Array.isArray(decor) ? decor : []).map(d => d && d.kind));
  return unlockedDecor(petals).map(d => d.key).filter(k => !placed.has(k));
}
