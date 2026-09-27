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

// ---------------------------------------------------------------- Gabe's story
import {
  GUARDIAN_ID, HATCH_ID, HATCH_LEVEL, guardianLevel, guardianParams, guardianOpen, hasGuardian,
  parseGuardianEnd, applyGuardianWin, seedCount, readyToHatch, applyHatch,
  BERRY_KEY, berryCount, wrappedGifts, openGift, settleBerries, withBerries
} from '../data/chapters.js';
import {
  RIVAL_NAME, RIVAL_PARTNER, RIVAL_LINES, RIVAL_LINES_SAID, RIVAL_LOSE_LINES, rivalSize, stageAt,
  weaknesses, typeMult, topTeamLevel, rivalTeam, rivalSpot, rivalParams, parseRivalEnd, applyRivalResult
} from '../data/rival.js';
import { cleanPlayer } from '../core/validate.js';

const story = () => ({ ...fresh(), caught: [], team: [], mons: {}, shinies: [], items: {},
  road: { chapter: 0, cleared: {}, bloomed: [], seeds: 0, guardians: {}, hatched: false, rival: { wins: 0, losses: 0, last: -1 } } });

test('guardian: appears only on a bloomed chapter, fights at leader level + 2', () => {
  const p = story();
  assert.ok(!hasGuardian(p, 0));
  clearChapter(p, 0);
  assert.ok(hasGuardian(p, 0) && guardianOpen(p, 0));
  assert.equal(guardianLevel(0), trainerLevel(GYMS[0].trainers[leaderIdx(0)]) + 2);
  const bp = guardianParams(0);
  assert.deepEqual(bp.enemyTeam, [{ id: GUARDIAN_ID, level: guardianLevel(0) }]);
  assert.equal(bp.trainer.name, 'OLD VENUSAUR');
  assert.equal(bp.trainer.leader, true);
  assert.equal(bp.returnTo, 'road');
  assert.equal(bp.onEnd, 'guardian:0');
  assert.ok(bp.trainer.taunt.split(/\s+/).length <= 6);
  for (let i = 0; i < 12; i++) assert.ok(guardianLevel(i) <= 100);
});

test('guardian: classic-beaten chapters get one too', () => {
  const p = story();
  for (let j = 0; j < 5; j++) p.gyms.beaten[trainerKey('rock', j, 1)] = true;
  assert.ok(hasGuardian(p, 0));
});

test('guardian win: +1 seed once, marks guardians, never for an unbloomed chapter', () => {
  const p = story();
  assert.equal(applyGuardianWin(p, 'guardian:0'), null, 'chapter 0 not bloomed yet');
  clearChapter(p, 0);
  const r = applyGuardianWin(p, 'guardian:0');
  assert.deepEqual(r, { i: 0, seeds: 1, hatch: false });
  assert.equal(p.road.guardians[0], true);
  assert.equal(applyGuardianWin(p, 'guardian:0'), null, 'a second win gives nothing');
  assert.equal(seedCount(p), 1);
  assert.ok(!guardianOpen(p, 0));
  assert.equal(parseGuardianEnd('guardian:12'), -1);
  assert.equal(parseGuardianEnd('chapter:0:1'), -1);
  assert.equal(applyGuardianWin(p, 'chapter:0:4'), null);
});

test('third seed: readyToHatch; the result survives validate.cleanRoad', () => {
  const p = story();
  for (let i = 0; i < 3; i++) clearChapter(p, i);
  applyGuardianWin(p, 'guardian:0');
  applyGuardianWin(p, 'guardian:1');
  const r = applyGuardianWin(p, 'guardian:2');
  assert.equal(r.seeds, 3);
  assert.equal(r.hatch, true);
  assert.ok(readyToHatch(p));
  const clean = cleanPlayer(p);
  assert.equal(clean.road.seeds, 3);
  assert.deepEqual(Object.keys(clean.road.guardians).sort(), ['0', '1', '2']);
});

test('hatch: new Bulbasaur joins caught + team at Lv10; sets hatched; idempotent', () => {
  const p = story();
  p.caught = [25]; p.team = [25]; p.mons = { 25: { level: 30, xp: 5 } }; p.road.seeds = 3;
  const r = applyHatch(p);
  assert.deepEqual(r, { isNew: true, shiny: false, already: false });
  assert.ok(p.caught.includes(HATCH_ID));
  assert.deepEqual(p.team, [25, HATCH_ID]);
  assert.equal(p.mons[HATCH_ID].level, HATCH_LEVEL);
  assert.equal(p.road.hatched, true);
  assert.ok(!readyToHatch(p));
  const before = JSON.stringify(p);
  assert.equal(applyHatch(p).already, true);
  assert.equal(JSON.stringify(p), before);
  assert.equal(cleanPlayer(p).road.hatched, true);
});

test('hatch: full team -> no team change; higher level is kept', () => {
  const p = story();
  p.caught = [4, 7, 25, 16, 19, 10]; p.team = [4, 7, 25, 16, 19, 10];
  applyHatch(p);
  assert.equal(p.team.length, 6);
  assert.ok(!p.team.includes(HATCH_ID));
  const q = story();
  q.caught = [HATCH_ID]; q.mons = { [HATCH_ID]: { level: 40, xp: 12 } };
  applyHatch(q);
  assert.deepEqual(q.mons[HATCH_ID], { level: 40, xp: 12 });
});

test('hatch: already owned -> his becomes shiny (once); already shiny stays shiny', () => {
  const p = story();
  p.caught = [HATCH_ID]; p.team = [HATCH_ID]; p.mons = { [HATCH_ID]: { level: 5, xp: 0 } };
  const r = applyHatch(p);
  assert.deepEqual(r, { isNew: false, shiny: true, already: false });
  assert.deepEqual(p.shinies, [HATCH_ID]);
  assert.equal(p.mons[HATCH_ID].level, HATCH_LEVEL);
  assert.deepEqual(p.team, [HATCH_ID], 'no duplicate');
  const q = story();
  q.caught = [HATCH_ID]; q.shinies = [HATCH_ID];
  assert.equal(applyHatch(q).shiny, true);
  assert.deepEqual(q.shinies, [HATCH_ID]);
});

test('rival: size by chapter, grows by level, partner is the ace', () => {
  assert.deepEqual([0, 3, 4, 7, 8, 10].map(rivalSize), [3, 3, 4, 4, 6, 6]);
  assert.equal(stageAt(RIVAL_PARTNER, 5), 4);
  assert.equal(stageAt(RIVAL_PARTNER, 20), 5);
  assert.equal(stageAt(RIVAL_PARTNER, 40), 6);
  assert.equal(stageAt({ ids: [123, 212] }, 60), 212, 'two-stage lines cap');
  const p = story();
  p.team = [25]; p.mons = { 25: { level: 20 } };
  assert.equal(topTeamLevel(p), 20);
  const t = rivalTeam(p, 0, ['electric']);
  assert.equal(t.length, 3);
  assert.equal(t[t.length - 1].id, 5, 'Charmeleon at Lv20');
  assert.equal(t[t.length - 1].level, 20);
  assert.ok(t.every(m => m.level <= 20 && m.level >= 3));
  assert.equal(t[0].id, 329, 'ground (Vibrava) covers an electric lead');
  assert.equal(rivalTeam(p, 5, []).length, 4);
  assert.equal(rivalTeam(p, 9, []).length, 6);
  const ids = rivalTeam(p, 9, ['grass', 'poison']).map(m => m.id);
  assert.equal(new Set(ids).size, 6, 'no duplicates');
  assert.ok(!ids.some(id => id >= 1 && id <= 3), 'never the Bulbasaur line');
});

test('rival: team covers the lead\'s weaknesses and is deterministic', () => {
  assert.deepEqual(weaknesses(['water']), ['electric', 'grass']);
  assert.equal(typeMult('ground', ['flying']), 0);
  const p = story(); p.team = [7]; p.mons = { 7: { level: 12 } };
  const a = rivalTeam(p, 2, ['water']);
  assert.deepEqual(a, rivalTeam(p, 2, ['water']));
  const lines = a.slice(0, -1).map(m => RIVAL_LINES.find(l => l.ids.includes(m.id)).type);
  assert.deepEqual(lines, ['electric', 'grass']);
  assert.equal(topTeamLevel({}), 5, 'no team -> Lv5');
  assert.deepEqual(rivalTeam({}, 0, null).length, 3, 'junk input is fine');
});

test('rival: words are short and uppercase', () => {
  for (const s of [...RIVAL_LINES_SAID, ...RIVAL_LOSE_LINES, RIVAL_NAME]) {
    assert.equal(s, s.toUpperCase());
    assert.ok(s.split(/\s+/).length <= 6, s);
  }
});

test('rival: stands after the last beaten leader, optional, steps aside on a win', () => {
  const p = story();
  assert.equal(rivalSpot(p), -1, 'no leader beaten yet');
  clearChapter(p, 0);
  assert.equal(rivalSpot(p), 0);
  assert.deepEqual(nextTrainer(p), { i: 1, j: 0 }, 'never a gate');
  const bp = rivalParams(p, 0, []);
  assert.equal(bp.onEnd, 'rival:0');
  assert.equal(bp.trainer.name, RIVAL_NAME);
  assert.equal(bp.trainer.leader, false);
  assert.equal(bp.returnTo, 'road');
  assert.deepEqual(applyRivalResult(p, 'rival:0', 'lose'), { i: 0, result: 'lose' });
  assert.equal(p.road.rival.losses, 1);
  assert.equal(rivalSpot(p), 0, 'still there after a loss: try again any time');
  assert.equal(applyRivalResult(p, 'rival:0', 'fled'), null);
  assert.deepEqual(applyRivalResult(p, 'rival:0', 'win'), { i: 0, result: 'win' });
  assert.deepEqual(p.road.rival, { wins: 1, losses: 1, last: 0 });
  assert.equal(rivalSpot(p), -1);
  assert.equal(applyRivalResult(p, 'rival:0', 'win'), null, 'stale win counts nothing');
  clearChapter(p, 1);
  assert.equal(rivalSpot(p), 1, 'back after the next leader');
  for (let i = 2; i < 12; i++) clearChapter(p, i);
  assert.equal(rivalSpot(p), -1, 'no gap after the last chapter');
  assert.equal(parseRivalEnd('rival:11'), -1);
  assert.equal(parseRivalEnd('guardian:1'), -1);
  assert.equal(cleanPlayer(p).road.rival.last, 0);
});

test('gifts: unwrap into the pouch, pouch never exceeds gifts, eaten berries leave', () => {
  const p = story();
  assert.equal(berryCount(p, 2), 0);
  assert.equal(wrappedGifts(p, 2), 2);
  assert.ok(openGift(p, 2));
  assert.equal(p.items[BERRY_KEY], 1);
  assert.equal(wrappedGifts(p, 2), 1);
  assert.ok(openGift(p, 2));
  assert.ok(!openGift(p, 2), 'nothing left to unwrap');
  assert.equal(withBerries(p, 2, battleParams(0, 0)).berries, 2);
  assert.equal(withBerries(p, 2, battleParams(0, 0)).onEnd, 'chapter:0:0');
  // the battle ate one (store.takeGift: 2 -> 1)
  assert.equal(settleBerries(p, 2, 1), 1);
  // pouch is clamped to gifts waiting (e.g. another scene took gifts)
  p.items[BERRY_KEY] = 9;
  assert.equal(berryCount(p, 1), 1);
  assert.equal(settleBerries(p, 1, 1), 1);
  assert.equal(settleBerries(p, 1, 0), 0);
  assert.equal(berryCount({}, 5), 0);
  assert.equal(openGift(null, 3), false);
  // the pouch survives validation (items keeps safe counter keys)
  p.items[BERRY_KEY] = 3;
  assert.equal(cleanPlayer(p).items[BERRY_KEY], 3);
});

// Fixer, batch 3: battle.js saves a Road result BEFORE the evolve screen;
// road.js then re-applies it without counting anything twice.
import { settleRoadEnd, roadMarks, roadReturn } from '../data/rival.js';

test('a Road win saved early by the battle: re-applied safely, still celebrated', () => {
  const p = fresh();
  for (let j = 0; j < leaderIdx(0); j++) p.road.cleared[chapterKey(0, j)] = true;
  const onEnd = 'chapter:0:' + leaderIdx(0);
  const o = settleRoadEnd(p, onEnd, 'win');
  const marks = roadMarks(o);
  assert.deepEqual(marks, { bloom: true, seed: false, rival: '' });
  assert.ok(isChapterDone(p, 0) && p.road.bloomed.includes(0), 'saved before road.js ever mounts');
  const back = roadReturn(p, onEnd, 'win', marks);
  assert.equal(back.outcome.bloom, true, 'the bloom still plays on the Road');
  assert.equal(p.road.bloomed.filter(i => i === 0).length, 1);
  // no marks at all (older route): the plain apply, still idempotent
  assert.equal(roadReturn(p, onEnd, 'win').outcome.bloom, false);
});

test('an early Old Venusaur win keeps its seed moment; a rival loss is counted once', () => {
  const p = fresh();
  clearChapter(p, 0); p.road.bloomed = [0];
  const g = settleRoadEnd(p, 'guardian:0', 'win');
  assert.equal(p.road.seeds, 1);
  const gb = roadReturn(p, 'guardian:0', 'win', roadMarks(g));
  assert.equal(gb.gOutcome.i, 0, 'seed moment still plays');
  assert.equal(p.road.seeds, 1, 'no second seed');
  const r = settleRoadEnd(p, 'rival:0', 'lose');
  assert.equal(p.road.rival.losses, 1);
  const rb = roadReturn(p, 'rival:0', 'lose', roadMarks(r));
  assert.equal(p.road.rival.losses, 1, 'the road does not count the loss again');
  assert.deepEqual(rb.rOutcome, { i: 0, result: 'lose' });
});
