import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PLOTS, VISITORS, KINDS, plotKind, plotLook, ensureGardenState, addPetals, visitorsDue,
  meterFill, budReady, evolve, bulbSwell, stageId, findPlotNear, addPlot, growPlot,
  pickVisitor, recordCatch, giftsDue, BERRIES_PER_GIFT,
} from '../scenes/garden-logic.js';

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
