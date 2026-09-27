import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PLOTS, VISITORS, KINDS, plotKind, plotLook, ensureGardenState, addPetals, visitorsDue,
  meterFill, budReady, evolve, bulbSwell, stageId, findPlotNear, addPlot, growPlot,
  pickVisitor, recordCatch, giftsDue, BERRIES_PER_GIFT,
  LATE_VISITORS, lateVisitorAt, visitorPool,
} from '../scenes/garden-logic.js';
import {
  DECOR, ACCESSORIES, ALL_UNLOCKS, PETALS_PER_DECOR, PETALS_PER_ACCESSORY, decorInfo, accessoryInfo,
  unlockedDecor, unlockedAccessories, unlocksAt, unlocksBetween, decorAction, nearestDecor, freshDecorKinds,
} from '../data/decor.js';
import { isShortKey, MAX_DECOR, placeDecor, cleanDecor } from '../core/validate.js';

const fresh = () => ensureGardenState({ name: 'ART', profile: 'prereader' });

test('ensureGardenState fills defaults and never lowers', () => {
  const p = fresh();
  assert.deepEqual(p.bulba, { petals: 0, stage: 1, stayStone: false, visitors: [] });
  assert.deepEqual(p.garden, { plots: [], berries: 0 });
  const q = ensureGardenState({ bulba: { petals: 77, stage: 2, stayStone: true, visitors: [7] }, garden: { plots: [{ x: .5, y: .5, kind: 'oran', grown: 2 }], berries: 4 } });
  assert.equal(q.bulba.petals, 77); assert.equal(q.bulba.stage, 2); assert.equal(q.bulba.stayStone, true);
  assert.equal(q.garden.berries, 4); assert.equal(q.garden.plots.length, 1);
});

test('petals only go up', () => {
  const b = { petals: 5 };
  addPetals(b, 1); assert.equal(b.petals, 6);
  addPetals(b, -10); assert.equal(b.petals, 6);
  addPetals(b, NaN); assert.equal(b.petals, 6);
});

test('a visitor every 8 petals, meter wraps at 8', () => {
  assert.equal(visitorsDue(7, 8), 1);
  assert.equal(visitorsDue(8, 15), 0);
  assert.equal(visitorsDue(0, 17), 2);
  assert.equal(meterFill(0), 0); assert.equal(meterFill(7), 7); assert.equal(meterFill(8), 0); assert.equal(meterFill(13), 5);
});

test('bud glows at 50 and 150, not while the Everstone is on, and evolution is one-way', () => {
  const b = { petals: 49, stage: 1, stayStone: false };
  assert.equal(budReady(b), false);
  b.petals = 50; assert.equal(budReady(b), true);
  b.stayStone = true; assert.equal(budReady(b), false); assert.equal(evolve(b), false); assert.equal(b.stage, 1);
  b.stayStone = false; assert.equal(evolve(b), true); assert.equal(b.stage, 2);
  assert.equal(budReady(b), false);
  b.petals = 150; assert.equal(evolve(b), true); assert.equal(b.stage, 3);
  b.petals = 9999; assert.equal(budReady(b), false); assert.equal(evolve(b), false); assert.equal(b.stage, 3);
  assert.equal(bulbSwell(b), 1);
  assert.equal(bulbSwell({ petals: 25, stage: 1 }), 0.5);
  assert.equal(stageId(1), 1); assert.equal(stageId(3), 3); assert.equal(stageId(9), 3);
});

test('plots: kinds are stable, growth caps at bush, oldest recycles past 60', () => {
  assert.equal(plotKind(0.51, 0.52), plotKind(0.55, 0.58));
  assert.ok(KINDS.some(k => k.key === plotKind(0.1, 0.9)));
  const g = { plots: [] };
  const first = addPlot(g, 0.01, 0.01);
  for (let i = 1; i < MAX_PLOTS; i++) addPlot(g, (i % 10) / 10, Math.floor(i / 10) / 10);
  assert.equal(g.plots.length, MAX_PLOTS); assert.equal(g.plots[0], first);
  addPlot(g, 0.9, 0.9);
  assert.equal(g.plots.length, MAX_PLOTS); assert.notEqual(g.plots[0], first);
  const p = g.plots[g.plots.length - 1];
  assert.equal(plotLook(p.grown), 'sprout');
  let n = 0; while (growPlot(p)) n++;
  assert.equal(n, 4); assert.equal(plotLook(p.grown), 'bush');
  assert.equal(plotLook(2), 'flower');
});

test('findPlotNear works in pixel space', () => {
  const plots = [{ x: 0.5, y: 0.5 }, { x: 0.1, y: 0.1 }];
  assert.equal(findPlotNear(plots, 200, 200, 400, 400, 30), 0);
  assert.equal(findPlotNear(plots, 300, 300, 400, 400, 30), -1);
});

test('pickVisitor prefers uncaught and skips on-screen', () => {
  const caughtAllButOne = VISITORS.slice(1);
  assert.equal(pickVisitor(caughtAllButOne, [], () => 0.99), VISITORS[0]);
  const v = pickVisitor(VISITORS, [VISITORS[0]], () => 0);
  assert.notEqual(v, VISITORS[0]);
  assert.ok(VISITORS.every(id => id >= 1 && id <= 649));
  assert.ok(!VISITORS.includes(1) && !VISITORS.includes(2) && !VISITORS.includes(3));
});

test('recordCatch adds at level 5 and never lowers an existing mon', () => {
  const p = fresh();
  recordCatch(p, 152);
  assert.deepEqual(p.caught, [152]); assert.deepEqual(p.mons[152], { level: 5, xp: 0 });
  assert.deepEqual(p.bulba.visitors, [152]); assert.equal(p.stats.catches, 1);
  p.mons[152] = { level: 30, xp: 10 };
  recordCatch(p, 152);
  assert.deepEqual(p.caught, [152]); assert.equal(p.mons[152].level, 30); assert.equal(p.stats.catches, 2);
});

test('giftsDue: one gift per 10 berries, lifetime milestones, never negative', () => {
  assert.equal(BERRIES_PER_GIFT, 10);
  assert.equal(giftsDue(0, 9), 0);
  assert.equal(giftsDue(9, 10), 1);
  assert.equal(giftsDue(10, 11), 0);
  assert.equal(giftsDue(19, 20), 1);
  assert.equal(giftsDue(5, 35), 3);
  assert.equal(giftsDue(20, 10), 0);
  assert.equal(giftsDue(NaN, 10), 1);
  assert.equal(giftsDue(-5, 'x'), 0);
  let n = 0;
  for (let b = 0; b < 100; b++) n += giftsDue(b, b + 1);
  assert.equal(n, 10);
});

// ---- batch 4: Art's trickle (decorations, accessories, late visitors) ------

test('decor: 30 decorations every 10 petals, 8 accessories every 25, all safe unique keys', () => {
  assert.equal(DECOR.length, 30); assert.equal(ACCESSORIES.length, 8);
  assert.equal(PETALS_PER_DECOR, 10); assert.equal(PETALS_PER_ACCESSORY, 25);
  DECOR.forEach((d, i) => assert.equal(d.at, (i + 1) * 10));
  ACCESSORIES.forEach((a, i) => assert.equal(a.at, (i + 1) * 25));
  const keys = [...DECOR, ...ACCESSORIES].map(x => x.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.ok(isShortKey(k), k);
  const reacts = new Set(['sit', 'swing', 'splash', 'sniff', 'hop', 'hug', 'dig', 'watch']);
  for (const d of DECOR) {
    assert.ok(reacts.has(d.react), d.key);
    assert.ok((d.look.emoji && d.look.emoji.length) || d.look.parts > 0 || d.look.item, d.key);
  }
  for (const a of ACCESSORIES) assert.ok(['head', 'face', 'neck', 'chest', 'back'].includes(a.slot));
  // the spec's favourites are all there
  for (const k of ['pond', 'swing', 'sunflowers', 'mushrooms', 'house', 'rainbow', 'stones', 'blanket', 'lanterns', 'berrytree', 'bench', 'kite', 'sandpit', 'birdbath', 'hedgeheart']) assert.ok(decorInfo(k), k);
  for (const k of ['crown', 'bow', 'leafhat', 'scarf', 'shades', 'partyhat', 'star', 'backpack']) assert.ok(accessoryInfo(k), k);
  assert.equal(decorInfo('nope'), null); assert.equal(accessoryInfo('__proto__'), null);
});

test('decor: unlocks depend on petals only and never go backwards', () => {
  assert.equal(unlockedDecor(0).length, 0); assert.equal(unlockedDecor(9).length, 0);
  assert.equal(unlockedDecor(10).length, 1); assert.equal(unlockedDecor(10)[0].key, 'sunflowers');
  assert.equal(unlockedDecor(299).length, 29); assert.equal(unlockedDecor(300).length, 30); assert.equal(unlockedDecor(1e6).length, 30);
  assert.equal(unlockedAccessories(24).length, 0); assert.equal(unlockedAccessories(25).length, 1); assert.equal(unlockedAccessories(200).length, 8);
  assert.equal(unlockedDecor(NaN).length, 0); assert.equal(unlockedDecor(-5).length, 0);
  let prev = 0;
  for (let p = 0; p <= 320; p++) { const n = unlocksAt(p).length; assert.ok(n >= prev); prev = n; }
  assert.equal(ALL_UNLOCKS.length, 38);
  for (let i = 1; i < ALL_UNLOCKS.length; i++) assert.ok(ALL_UNLOCKS[i].at >= ALL_UNLOCKS[i - 1].at);
  // 50 petals: the pond-era decoration comes before the bow
  const at50 = ALL_UNLOCKS.filter(u => u.at === 50).map(u => u.type);
  assert.deepEqual(at50, ['decor', 'acc']);
  assert.deepEqual(unlocksBetween(9, 10).map(u => u.key), ['sunflowers']);
  assert.deepEqual(unlocksBetween(49, 50).map(u => u.key), ['mushrooms', 'bow']);
  assert.equal(unlocksBetween(10, 19).length, 0);
  assert.equal(unlocksBetween(50, 10).length, 0);
  let crossed = 0;
  for (let p = 0; p < 400; p++) crossed += unlocksBetween(p, p + 1).length;
  assert.equal(crossed, 38);
  // a prefix: unlocksAt(p) === ALL_UNLOCKS.slice(0, n)
  assert.deepEqual(unlocksAt(125), ALL_UNLOCKS.slice(0, unlocksAt(125).length));
});

test('decorAction: every kind always has room, duplicates never overflow, nothing is removed', () => {
  const kinds = DECOR.map(d => d.key);
  assert.deepEqual(decorAction([], 'pond'), { op: 'place' });
  // 10 spare slots for duplicates, then the oldest of that kind hops instead
  const decor = [];
  for (let n = 0; n < 10; n++) { assert.equal(decorAction(decor, 'pond', MAX_DECOR, kinds).op, 'place'); decor.push({ kind: 'pond', x: n / 20, y: 0.5 }); }
  assert.deepEqual(decorAction(decor, 'pond', MAX_DECOR, kinds), { op: 'place' });   // the 11th pond: one pond slot is its own
  decor.push({ kind: 'pond', x: 0.9, y: 0.5 });
  assert.deepEqual(decorAction(decor, 'pond', MAX_DECOR, kinds), { op: 'move', i: 0 });
  // but every other kind can still go down, all the way to 40
  for (const k of kinds.filter(k => k !== 'pond')) { assert.equal(decorAction(decor, k, MAX_DECOR, kinds).op, 'place', k); decor.push({ kind: k, x: 0.5, y: 0.5 }); }
  assert.equal(decor.length, MAX_DECOR);
  assert.deepEqual(decorAction(decor, 'swing', MAX_DECOR, kinds), { op: 'move', i: decor.findIndex(d => d.kind === 'swing') });
  // a full garden of unknown kinds (from an import) never throws
  const junk = Array.from({ length: 40 }, () => ({ kind: 'mystery', x: 0.1, y: 0.1 }));
  assert.deepEqual(decorAction(junk, 'pond'), { op: 'none' });
  assert.deepEqual(decorAction(null, 'pond'), { op: 'place' });
});

test('decorAction + validate.placeDecor: a garden played to the end keeps every decoration', () => {
  const p = { garden: { plots: [], berries: 0, decor: [] }, bulba: {} };
  for (let t = 0; t < 200; t++) {
    const kind = DECOR[t % 7].key;             // he loves the first few
    const act = decorAction(p.garden.decor, kind, MAX_DECOR);
    if (act.op === 'place') assert.ok(placeDecor(p, kind, (t % 10) / 10, 0.5));
  }
  const before = p.garden.decor.length;
  for (const d of DECOR) {
    const act = decorAction(p.garden.decor, d.key, MAX_DECOR);
    assert.notEqual(act.op, 'none', d.key);
    if (act.op === 'place') assert.ok(placeDecor(p, d.key, 0.3, 0.6), d.key);
  }
  assert.ok(p.garden.decor.length >= before);
  assert.ok(p.garden.decor.length <= MAX_DECOR);
  for (const d of DECOR) assert.ok(p.garden.decor.some(x => x.kind === d.key), d.key);
  assert.deepEqual(cleanDecor(p.garden.decor), p.garden.decor);
});

test('nearestDecor and freshDecorKinds', () => {
  const decor = [{ kind: 'pond', x: 0.5, y: 0.5 }, { kind: 'swing', x: 0.1, y: 0.1 }];
  assert.equal(nearestDecor(decor, 200, 200, 400, 400, 30), 0);
  assert.equal(nearestDecor(decor, 45, 45, 400, 400, 30), 1);
  assert.equal(nearestDecor(decor, 300, 300, 400, 400, 30), -1);
  assert.equal(nearestDecor(null, 1, 1, 1, 1, 1), -1);
  assert.deepEqual(freshDecorKinds(9, []), []);
  assert.deepEqual(freshDecorKinds(30, [{ kind: 'pond', x: 0, y: 0 }]), ['sunflowers', 'stones']);
  assert.deepEqual(freshDecorKinds(20, decor), ['sunflowers']);
});

test('late visitors: 20 new friends as petals grow, all gentle and new', () => {
  assert.equal(LATE_VISITORS.length, 20);
  const all = [...VISITORS, ...LATE_VISITORS];
  assert.equal(new Set(all).size, all.length);
  assert.ok(LATE_VISITORS.every(id => Number.isInteger(id) && id >= 1 && id <= 649));
  const legendary = [144, 145, 146, 150, 151, 243, 244, 245, 249, 250, 251, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386, 480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493, 494, 638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649];
  assert.ok(!LATE_VISITORS.some(id => legendary.includes(id)));
  assert.deepEqual(visitorPool(0), VISITORS);
  assert.deepEqual(visitorPool(lateVisitorAt(0) - 1), VISITORS);
  assert.equal(visitorPool(lateVisitorAt(0)).length, VISITORS.length + 1);
  assert.equal(visitorPool(lateVisitorAt(19)).length, VISITORS.length + 20);
  assert.equal(visitorPool(1e9).length, VISITORS.length + 20);
  // a late friend he hasn't met comes first; one on screen never repeats
  assert.equal(pickVisitor([], [], () => 0.5, lateVisitorAt(0)), LATE_VISITORS[0]);
  assert.notEqual(pickVisitor([], [LATE_VISITORS[0]], () => 0, lateVisitorAt(0)), LATE_VISITORS[0]);
  assert.equal(pickVisitor([LATE_VISITORS[0]], [], () => 0, lateVisitorAt(1)), LATE_VISITORS[1]);
  // no petals argument: exactly the old behaviour
  for (let i = 0; i < 50; i++) assert.ok(VISITORS.includes(pickVisitor([], [], Math.random)));
  // everyone met: still somebody (never nobody)
  assert.ok(all.includes(pickVisitor(all, [], () => 0.3, 1e9)));
});
