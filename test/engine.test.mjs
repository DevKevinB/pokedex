// Pure-function tests for the battle engine. No browser, no network, no DOM.
//   node --test test/engine.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeStats, computeDamage, catchProbability, xpThreshold, xpForKO,
  applyXp, xpProgress, pickMove, usableMoves, clampPower, shuffle, wildLevel,
  MAX_HIT_FRACTION, JUNIOR_MIN_HIT, JUNIOR_MAX_TAKE
} from '../js/engine.js';

// A fixed rng so every assertion below is deterministic.
const rngOf = (...vals) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };
const noCrit = () => 0.99;   // above CRIT_CHANCE, and 99% variance roll

const mon = (over = {}) => ({
  level: 50, maxHp: 100, atk: 100, def: 100, spatk: 100, spdef: 100, speed: 100,
  types: [{ type: { name: 'normal' } }], base_experience: 100, ...over
});
const move = (over = {}) => ({ name: 'tackle', power: 40, type: 'normal', damage_class: 'physical', ...over });

test('computeStats exposes special stats', () => {
  const data = { stats: [
    { base_stat: 100, stat: { name: 'hp' } }, { base_stat: 50, stat: { name: 'attack' } },
    { base_stat: 60, stat: { name: 'defense' } }, { base_stat: 90, stat: { name: 'special-attack' } },
    { base_stat: 70, stat: { name: 'special-defense' } }, { base_stat: 40, stat: { name: 'speed' } }
  ] };
  const s = computeStats(data, 50);
  assert.equal(s.maxHp, 160);
  assert.equal(s.spatk, 95);
  assert.equal(s.spdef, 75);
  assert.ok(s.spatk > s.atk, 'a special attacker must out-hit its own physical stat');
});

test('special moves use spatk/spdef, not atk/def', () => {
  const glassCannon = mon({ atk: 10, spatk: 200 });
  const target = mon({ def: 200, spdef: 10 });
  const phys = computeDamage(glassCannon, target, move({ damage_class: 'physical' }), { rng: noCrit });
  const spec = computeDamage(glassCannon, target, move({ damage_class: 'special' }), { rng: noCrit });
  assert.ok(spec.damage > phys.damage * 10,
    `special should dwarf physical for this build (got ${spec.damage} vs ${phys.damage})`);
  assert.equal(spec.special, true);
});

test('immunity stays immune — no floor, no variance, no crit resurrects it', () => {
  const ghost = mon({ types: [{ type: { name: 'ghost' } }] });
  const r = computeDamage(mon(), ghost, move({ type: 'normal' }), { rng: () => 0, junior: 'attacker' });
  assert.equal(r.damage, 0);
  assert.equal(r.typeMult, 0);
});

test('no single hit can delete a full-health Pokémon', () => {
  const huge = mon({ level: 100, atk: 999, types: [{ type: { name: 'fighting' } }] });
  const frail = mon({ level: 5, maxHp: 20, def: 1, types: [{ type: { name: 'normal' } }] });
  const r = computeDamage(huge, frail, move({ type: 'fighting', power: 120 }), { rng: () => 0 });
  assert.ok(r.damage <= frail.maxHp * MAX_HIT_FRACTION + 0.001,
    `expected <= ${frail.maxHp * MAX_HIT_FRACTION}, got ${r.damage}`);
  assert.ok(r.damage > 0);
});

test('junior floor guarantees visible progress against a huge opponent', () => {
  const art = mon({ level: 8, atk: 20 });
  const champion = mon({ level: 80, maxHp: 300, def: 250 });
  const r = computeDamage(art, champion, move(), { rng: noCrit, junior: 'attacker' });
  assert.ok(r.damage >= champion.maxHp * JUNIOR_MIN_HIT - 0.001);
  // ~7 hits to win, not ~84.
  assert.ok(Math.ceil(champion.maxHp / r.damage) <= 7);
});

test('junior ceiling caps incoming damage', () => {
  const champion = mon({ level: 80, atk: 300 });
  const art = mon({ level: 8, maxHp: 40, def: 10 });
  const r = computeDamage(champion, art, move({ power: 120 }), { rng: () => 0, junior: 'defender' });
  assert.ok(r.damage <= art.maxHp * JUNIOR_MAX_TAKE + 0.001);
});

test('damage variance stays inside 85-100%', () => {
  const lo = computeDamage(mon(), mon(), move(), { rng: rngOf(0.99, 0) }).damage;   // no crit, min roll
  const hi = computeDamage(mon(), mon(), move(), { rng: rngOf(0.99, 1) }).damage;   // no crit, max roll
  assert.ok(lo < hi);
  assert.ok(lo / hi >= 0.84 && lo / hi <= 0.86, `ratio was ${lo / hi}`);
});

test('STAB and crit both apply and are reported', () => {
  // Control must be an attacker WITHOUT the move's type — a normal-type mon
  // using a normal move gets STAB too, which made the first version of this
  // test compare two identical values and pass for the wrong reason.
  const fireMon = mon({ types: [{ type: { name: 'fire' } }] });
  const normalMon = mon({ types: [{ type: { name: 'normal' } }] });
  const target = mon({ types: [{ type: { name: 'normal' } }] });

  const noStab = computeDamage(normalMon, target, move({ type: 'fire' }), { rng: noCrit });
  const withStab = computeDamage(fireMon, target, move({ type: 'fire' }), { rng: noCrit });
  assert.equal(noStab.stab, false);
  assert.equal(withStab.stab, true);
  assert.ok(Math.abs(withStab.damage / noStab.damage - 1.5) < 1e-9,
    `STAB should be exactly 1.5x (got ${withStab.damage / noStab.damage})`);

  const crit = computeDamage(mon(), mon(), move(), { rng: rngOf(0, 0.99) });
  assert.equal(crit.crit, true);
});

test('ONE catch formula — HP scaling, clamps, and the junior/master shortcuts', () => {
  assert.equal(catchProbability({ junior: true, captureRate: 3 }), 1);
  assert.equal(catchProbability({ master: true, captureRate: 3 }), 1);

  const full = catchProbability({ captureRate: 190, ballMod: 1, hp: 100, maxHp: 100 });
  const nearly = catchProbability({ captureRate: 190, ballMod: 1, hp: 1, maxHp: 100 });
  assert.ok(nearly > full, 'weakening a Pokémon must improve the odds');

  // The dex screen has no HP context and must behave like a full-health target.
  const dex = catchProbability({ captureRate: 190, ballMod: 1 });
  assert.ok(Math.abs(dex - full) < 1e-9, 'dex and battle screens must agree');

  assert.ok(catchProbability({ captureRate: 3, ballMod: 1, hp: 100, maxHp: 100 }) >= 0.03);
  assert.ok(catchProbability({ captureRate: 255, ballMod: 99, hp: 1, maxHp: 100 }) <= 0.95);
});

test('xp thresholds, KO award and level-up loop', () => {
  assert.equal(xpThreshold(5), 75);
  assert.equal(xpForKO({ base_experience: 100, level: 10 }), 80);

  const r = applyXp({ level: 5, xp: 0 }, 75);
  assert.equal(r.level, 6);
  assert.equal(r.ups, 1);

  const multi = applyXp({ level: 5, xp: 0 }, 1000);
  assert.ok(multi.ups > 1, 'a big award should grant several levels at once');

  const capped = applyXp({ level: 100, xp: 0 }, 99999);
  assert.equal(capped.level, 100);
  assert.equal(capped.ups, 0);
});

test('xpProgress is a clean 0..1 for the XP bar', () => {
  assert.equal(xpProgress({ level: 5, xp: 0 }), 0);
  assert.ok(Math.abs(xpProgress({ level: 5, xp: 37.5 }) - 0.5) < 1e-9);
  assert.equal(xpProgress({ level: 100, xp: 0 }), 1);
});

test('smart AI picks super-effective; junior AI does not', () => {
  const water = { name: 'surf', power: 40, type: 'water', damage_class: 'special' };
  const tackle = move();
  const fireTarget = mon({ types: [{ type: { name: 'fire' } }] });
  const smart = pickMove([tackle, water], fireTarget, { smart: true, rng: () => 0 });
  assert.equal(smart.name, 'surf');
  const dumb = pickMove([tackle, water], fireTarget, { smart: false, rng: () => 0 });
  assert.equal(dumb.name, 'tackle', 'junior opponents must not target weaknesses');
});

test('usableMoves drops status moves, null power and nukes', () => {
  const kept = usableMoves([
    { name: 'hypnosis', power: null, damage_class: 'status' },
    { name: 'growl', power: null, damage_class: 'status' },
    { name: 'explosion', power: 250, damage_class: 'physical' },
    { name: 'ember', power: 40, damage_class: 'special' }
  ]);
  assert.deepEqual(kept.map(m => m.name), ['ember']);
});

test('clampPower keeps a 250-power nuke off the board', () => {
  assert.equal(clampPower(250), 120);
  assert.equal(clampPower(40), 40);
  assert.equal(clampPower(null), 40);
});

test('shuffle keeps every element exactly once', () => {
  const src = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffle(src, rngOf(0.1, 0.9, 0.4, 0.2, 0.7, 0.3, 0.6));
  assert.equal(out.length, src.length);
  assert.deepEqual([...out].sort((a, b) => a - b), src);
  assert.deepEqual(src, [1, 2, 3, 4, 5, 6, 7, 8], 'must not mutate the input');
});

test('wild levels follow the habitat band but stay leashed to the lead', () => {
  // A high-level habitat must not become a wall for a low-level junior player.
  const lvl = wildLevel({ base: 40, spread: 5, badges: 4, leadLevel: 8, junior: true, rng: () => 0.99 });
  assert.ok(lvl <= 8 + 5, `junior leash breached: ${lvl}`);

  // And a low-level habitat still gives a high-level player something to hit.
  const floor = wildLevel({ base: 2, spread: 1, badges: 0, leadLevel: 60, junior: false, rng: () => 0 });
  assert.ok(floor >= 60 - 5, `non-junior floor breached: ${floor}`);

  // Badges raise the band — checked with a lead level where the band is what
  // binds, not the leash. (With a Lv50 lead both ends clamp to the floor and
  // the comparison is meaningless, which is how the first version of this
  // test managed to fail while the code was correct.)
  const early = wildLevel({ base: 5, spread: 0, badges: 0, leadLevel: 8, rng: () => 0 });
  const late = wildLevel({ base: 5, spread: 0, badges: 3, leadLevel: 8, rng: () => 0 });
  assert.equal(early, 5, `expected the raw band, got ${early}`);
  assert.equal(late, 11, `expected band + 3 badges * 2, got ${late}`);
  assert.ok(late > early);
});
