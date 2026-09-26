// node --test next/test/road.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAPTERS, chapterKey, leaderIdx, isCleared, isChapterDone, isChapterOpen,
  isTrainerOpen, currentChapter, nextTrainer, chapterView, battleParams,
  parseOnEnd, applyWin, trainerLevel
} from '../data/chapters.js';
import { GYMS, trainerKey } from '../data/gymdata.js';

const fresh = () => ({ badges: [], gyms: { beaten: {} }, road: { chapter: 0, cleared: {}, bloomed: [] } });
const clearChapter = (p, i) => { for (let j = 0; j <= leaderIdx(i); j++) p.road.cleared[chapterKey(i, j)] = true; };

test('12 chapters, one per gym, each with a palette and a drought line', () => {
  assert.equal(CHAPTERS.length, 12);
  CHAPTERS.forEach((c, i) => {
    assert.equal(c.idx, i);
    assert.equal(c.key, GYMS[i].key);
    assert.equal(c.trainers, GYMS[i].trainers);
    for (const k of ['ground', 'sky', 'accent']) assert.match(c.palette[k], /^#[0-9a-f]{6}$/);
    assert.ok(c.drought && c.drought === c.drought.toUpperCase());
    assert.ok(c.drought.split(/\s+/).length <= 6, c.drought);
  });
  assert.equal(new Set(CHAPTERS.map(c => c.palette.ground)).size, 12, 'palettes are distinct');
});

test('chapterKey shape and leader index', () => {
  assert.equal(chapterKey(3, 4), 'c3-t4');
  assert.equal(leaderIdx(0), 4);
  assert.equal(leaderIdx(10), 2);   // Victory Road has 3 trainers
  assert.equal(leaderIdx(11), 4);   // the Champion
  assert.equal(leaderIdx(99), -1);
});

test('fresh player: chapter 0 open, the rest closed, next = c0 t0', () => {
  const p = fresh();
  assert.ok(isChapterOpen(p, 0));
  for (let i = 1; i < 12; i++) assert.ok(!isChapterOpen(p, i));
  assert.equal(currentChapter(p), 0);
  assert.deepEqual(nextTrainer(p), { i: 0, j: 0 });
  assert.ok(isTrainerOpen(p, 0, 0));
  assert.ok(!isTrainerOpen(p, 0, 1));
  assert.ok(!isTrainerOpen(p, 1, 0));
});

test('a missing road / gyms object does not throw', () => {
  assert.equal(currentChapter({}), 0);
  assert.deepEqual(nextTrainer(null), { i: 0, j: 0 });
  assert.ok(!isCleared(undefined, 0, 0));
});

test('trainers open one after another; beaten ones stay open for rematches', () => {
  const p = fresh();
  p.road.cleared[chapterKey(0, 0)] = true;
  assert.ok(isTrainerOpen(p, 0, 0));
  assert.ok(isTrainerOpen(p, 0, 1));
  assert.ok(!isTrainerOpen(p, 0, 2));
  assert.deepEqual(nextTrainer(p), { i: 0, j: 1 });
});

test('chapter i opens only when chapter i-1 leader is cleared', () => {
  const p = fresh();
  for (let j = 0; j < 4; j++) p.road.cleared[chapterKey(0, j)] = true;
  assert.ok(!isChapterOpen(p, 1));
  assert.deepEqual(nextTrainer(p), { i: 0, j: 4 });
  p.road.cleared[chapterKey(0, 4)] = true;
  assert.ok(isChapterDone(p, 0));
  assert.ok(isChapterOpen(p, 1));
  assert.equal(currentChapter(p), 1);
  assert.deepEqual(nextTrainer(p), { i: 1, j: 0 });
});

test('map view: done / current / two soon / fog', () => {
  const p = fresh();
  clearChapter(p, 0); clearChapter(p, 1);
  assert.deepEqual(CHAPTERS.map((_, i) => chapterView(p, i)),
    ['done', 'done', 'current', 'soon', 'soon', 'fog', 'fog', 'fog', 'fog', 'fog', 'fog', 'fog']);
});

test('whole road done: next is null, current is 12', () => {
  const p = fresh();
  for (let i = 0; i < 12; i++) clearChapter(p, i);
  assert.equal(currentChapter(p), 12);
  assert.equal(nextTrainer(p), null);
  assert.ok(CHAPTERS.every((_, i) => chapterView(p, i) === 'done'));
});

test('classic gyms.beaten counts as cleared and is never written back', () => {
  const p = fresh();
  for (let j = 0; j < 5; j++) p.gyms.beaten[trainerKey('rock', j, 1)] = true;
  p.gyms.beaten[trainerKey('water', 0, 1)] = true;
  p.gyms.beaten[trainerKey('water', 1, 2)] = true;   // round 2 must NOT count
  const before = JSON.stringify(p);
  assert.ok(isChapterDone(p, 0));
  assert.equal(currentChapter(p), 1);
  assert.deepEqual(nextTrainer(p), { i: 1, j: 1 });
  assert.equal(JSON.stringify(p), before, 'derivation is read-only');
});

test('classic Champion clears the Elite chapter', () => {
  const p = fresh();
  GYMS.forEach(g => g.trainers.forEach((_, j) => { p.gyms.beaten[trainerKey(g.key, j, 1)] = true; }));
  assert.equal(nextTrainer(p), null);
});

test('parseOnEnd accepts only real chapter/trainer pairs', () => {
  assert.deepEqual(parseOnEnd('chapter:3:4'), { i: 3, j: 4 });
  assert.equal(parseOnEnd('chapter:10:3'), null);   // VR has only 0..2
  assert.equal(parseOnEnd('chapter:12:0'), null);
  assert.equal(parseOnEnd('chapter:-1:0'), null);
  assert.equal(parseOnEnd(null), null);
  assert.equal(parseOnEnd('garden'), null);
});

test('battleParams matches the scene contract', () => {
  const bp = battleParams(0, 4);
  assert.equal(bp.returnTo, 'road');
  assert.equal(bp.wild, false);
  assert.equal(bp.onEnd, 'chapter:0:4');
  assert.equal(bp.trainer.leader, true);
  assert.equal(bp.trainer.name, GYMS[0].trainers[4].name);
  assert.deepEqual(bp.enemyTeam, GYMS[0].trainers[4].team);
  assert.notEqual(bp.enemyTeam, GYMS[0].trainers[4].team, 'a copy, not module data');
  assert.equal(battleParams(10, 2).trainer.leader, true);
  assert.equal(battleParams(0, 3).trainer.leader, false);
});

test('applyWin: trainer win marks cleared, no bloom', () => {
  const p = fresh();
  const r = applyWin(p, 'chapter:0:0');
  assert.deepEqual(r, { i: 0, j: 0, leader: false, bloom: false });
  assert.equal(p.road.cleared['c0-t0'], true);
  assert.deepEqual(p.road.bloomed, []);
  assert.deepEqual(p.badges, []);
  assert.deepEqual(p.gyms.beaten, {}, 'never writes classic keys');
});

test('applyWin: leader win blooms once, adds badge once, advances chapter', () => {
  const p = fresh();
  for (let j = 0; j < 4; j++) applyWin(p, 'chapter:0:' + j);
  const r = applyWin(p, 'chapter:0:4');
  assert.equal(r.bloom, true);
  assert.deepEqual(p.road.bloomed, [0]);
  assert.deepEqual(p.badges, ['rock']);
  assert.equal(p.road.chapter, 1);
  const again = applyWin(p, 'chapter:0:4');
  assert.equal(again.bloom, false, 'rematch never re-blooms');
  assert.deepEqual(p.badges, ['rock']);
  assert.deepEqual(p.road.bloomed, [0]);
});

test('applyWin keeps a classic badge and creates missing road fields', () => {
  const p = { badges: ['rock'] };
  const r = applyWin(p, 'chapter:0:4');
  assert.equal(r.bloom, true);
  assert.deepEqual(p.badges, ['rock']);
  assert.ok(p.road.cleared['c0-t4']);
  assert.equal(applyWin(p, 'nope'), null);
});

test('trainerLevel is the highest level on the team', () => {
  assert.equal(trainerLevel({ team: [{ id: 1, level: 5 }, { id: 2, level: 9 }] }), 9);
});
