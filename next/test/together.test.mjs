// Pure helpers behind PLAY TOGETHER, FAMILY TABLE, COUCH VERSUS and the PICTURE LOCK.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSeats, seatsFrom, teamSpec, topLevel, bulbaIdOf, nameOf, canSwap, battleProfile, seatLocked } from '../scenes/together.js';
import { teamUpMove, pickOpponent, TEAMUP_MULT } from '../scenes/family-table.js';
import { searchSpecies, speciesName, SPECIES } from '../scenes/versus.js';
import { lockGrid, GRID } from '../scenes/lock.js';
import { seededRng } from '../core/rng.js';
import { freshSave } from '../core/validate.js';
import { CHAPTERS, leaderIdx } from '../data/chapters.js';

function save() {
  const s = freshSave('2026-09-26');
  s.players[1].name = 'GABE'; s.players[1].profile = 'reader';
  s.players[2].name = 'ART'; s.players[2].profile = 'prereader';
  return s;
}

test('seats: the first reader battles, whichever player number he is', () => {
  const s = save();
  assert.deepEqual(defaultSeats(s), { battler: 1, helper: 2 });
  s.players[1].profile = 'prereader'; s.players[2].profile = 'reader';
  assert.deepEqual(defaultSeats(s), { battler: 2, helper: 1 });
  // player 1 is now the prereader: he is never seated to battle over a reader
  assert.deepEqual(seatsFrom(s, { battler: 1, helper: 2 }), { battler: 2, helper: 1 });
  assert.deepEqual(seatsFrom(s, { battler: 2 }), { battler: 2, helper: 1 });
  assert.deepEqual(seatsFrom(s, { battler: 1, helper: 1 }), { battler: 2, helper: 1 });
  assert.deepEqual(seatsFrom(s, { battler: 2, helper: 1 }), { battler: 2, helper: 1 });
  assert.deepEqual(seatsFrom(s, { battler: '__proto__' }), { battler: 2, helper: 1 });
  assert.equal(nameOf(s, 2), 'ART');
  s.players[1].name = '  '; assert.equal(nameOf(s, 1), 'PLAYER 1');
});

test('seats: a prereader never takes the battle seat from a reader (hard rule 2)', () => {
  const s = save();                               // 1 = GABE reader, 2 = ART prereader
  assert.equal(canSwap(s, { battler: 1, helper: 2 }), false);
  assert.deepEqual(seatsFrom(s, { battler: 2, helper: 1 }), { battler: 1, helper: 2 });
  assert.deepEqual(seatsFrom(s, { battler: 2 }), { battler: 1, helper: 2 });
  assert.equal(battleProfile(s, 1), 'reader');
  s.players[2].profile = 'reader';                // Dad on player 2: swapping is fine
  assert.equal(canSwap(s, { battler: 1, helper: 2 }), true);
  assert.deepEqual(seatsFrom(s, { battler: 2, helper: 1 }), { battler: 2, helper: 1 });
  s.players[1].profile = 'prereader'; s.players[2].profile = 'prereader';
  assert.equal(battleProfile(s, 1), 'prereader'); // two little ones: Junior rules
  assert.equal(seatLocked(s, 1), false);
  s.players[1].profile = 'reader'; s.players[1].lock = { pics: [25, 6, 7] };
  assert.equal(seatLocked(s, 1), true);
});

test('teamSpec / topLevel: never empty, levels clamped', () => {
  const p = save().players[1];
  assert.deepEqual(teamSpec(p), [{ id: 1, level: 5 }]);
  p.team = [6, 25, 9999, 'x']; p.mons = { 6: { level: 72 }, 25: { level: 500 } };
  assert.deepEqual(teamSpec(p), [{ id: 6, level: 72 }, { id: 25, level: 100 }]);
  assert.equal(topLevel(p), 100);
  assert.equal(bulbaIdOf({ bulba: { stage: 3 } }), 3);
  assert.equal(bulbaIdOf({}), 1);
});

test('TEAM-UP: grass Vine Whip at 1.5x his best hit, never below 1.5x a real Vine Whip', () => {
  const m = teamUpMove({ atk: 50, spatk: 90, moves: [{ power: 80 }, { power: 40 }] });
  assert.deepEqual(m, { name: 'vine-whip', type: 'grass', power: Math.round(80 * TEAMUP_MULT), damage_class: 'special', teamUp: true });
  assert.equal(teamUpMove({ atk: 90, spatk: 10, moves: [{ power: null }] }).power, Math.round(45 * TEAMUP_MULT));
  assert.equal(teamUpMove({ atk: 90, spatk: 10, moves: [] }).damage_class, 'physical');
});

test('opponent: next unbeaten Road trainer, else a random real chapter trainer', () => {
  const p = save().players[1];
  const o = pickOpponent(p, seededRng(1));
  assert.equal(o.onEnd, 'chapter:0:0');
  p.road.cleared = {};
  CHAPTERS.forEach((c, i) => c.trainers.forEach((_, j) => { p.road.cleared['c' + i + '-t' + j] = true; }));
  for (let k = 0; k < 30; k++) {
    const r = pickOpponent(p, seededRng(k));
    assert.match(r.onEnd, /^chapter:\d+:\d+$/);
    assert.ok(r.enemyTeam.length >= 1);
  }
});

test('opponent: never a chapter leader (his leader win belongs on his Road)', () => {
  const p = save().players[1];
  p.road.cleared = {};
  for (let j = 0; j < leaderIdx(0); j++) p.road.cleared['c0-t' + j] = true;   // only the leader is left
  for (let k = 0; k < 30; k++) {
    const o = pickOpponent(p, seededRng(k));
    assert.equal(o.trainer.leader, false, o.onEnd);
    assert.match(o.onEnd, /^chapter:0:\d+$/);
  }
  CHAPTERS.forEach((c, i) => c.trainers.forEach((_, j) => { p.road.cleared['c' + i + '-t' + j] = true; }));
  for (let k = 0; k < 30; k++) assert.equal(pickOpponent(p, seededRng(k)).trainer.leader, false);
});

test('versus search: names, parts of names and dex numbers', () => {
  assert.equal(SPECIES.length, 649);
  assert.equal(SPECIES[0], 'bulbasaur');
  assert.equal(SPECIES[648], 'genesect');
  assert.equal(searchSpecies('pika')[0], 25);
  assert.equal(searchSpecies('PIKA CHU')[0], 25);
  assert.deepEqual(searchSpecies('150'), [150]);
  assert.deepEqual(searchSpecies('0'), []);
  assert.deepEqual(searchSpecies('650'), []);
  assert.ok(searchSpecies('saur').includes(1) && searchSpecies('saur').includes(3));
  assert.equal(searchSpecies('').length, 12);
  assert.equal(speciesName(122), 'MR MIME');
  assert.equal(speciesName(0), '');
});

test('picture lock grid: 9 distinct pictures, always including his three', () => {
  for (let k = 0; k < 50; k++) {
    const pics = [25, 25, 6];
    const g = lockGrid(pics, [1, 4, 7, 25], seededRng(k));
    assert.equal(g.length, GRID);
    assert.equal(new Set(g).size, GRID);
    for (const id of pics) assert.ok(g.includes(id));
    for (const id of g) assert.ok(Number.isInteger(id) && id >= 1 && id <= 649);
  }
  // his own catches are preferred as decoys
  const g = lockGrid([1, 2, 3], [10, 11, 12, 13, 14, 15], seededRng(3));
  for (const id of [10, 11, 12, 13, 14, 15]) assert.ok(g.includes(id));
});
