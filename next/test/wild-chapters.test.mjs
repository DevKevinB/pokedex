// node --test next/test/wild-chapters.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateChapter, loadChapters, freezeChapter, WILD_CHAPTER_TRAINERS, TYPES, MAX_NAME, MAX_LINE
} from '../data/validate-chapter.js';
import {
  WILD_AUTHORED, WILD_CHAPTERS, WILD_LEADER, wildKey, wildByIdx, wildPos, wildUnlocked,
  isWildCleared, isWildBloomed, isWildOpen, isWildTrainerOpen, currentWild, nextWildTrainer,
  wildView, wildBattleParams, parseWildEnd, applyWildWin, wildTrainerLevel
} from '../data/wild-chapters.js';
import { CHAPTERS, chapterKey, leaderIdx } from '../data/chapters.js';
import { WILD_COUNT, WILD_TRAINERS, isClearedKey, cleanPlayer } from '../core/validate.js';

// ---------- the validator ----------

const good = () => ({
  idx: 7, key: 'test-land', name: 'TEST LAND', emoji: '🌵', types: ['ground', 'rock'],
  palette: { ground: '#aa8844', sky: '#fff0cc', accent: '#553311' },
  flavour: 'A DRY AND DUSTY PLACE.',
  trainers: [
    { name: 'HIKER A', taunt: 'ROCKS!', team: [{ id: 74, level: 60 }] },
    { name: 'HIKER B', taunt: 'MORE ROCKS!', team: [{ id: 75, level: 61 }, { id: 76, level: 61 }] },
    { name: 'HIKER C', taunt: 'BIG ROCKS!', team: [{ id: 95, level: 62 }] },
    { name: 'HIKER D', taunt: 'HUGE ROCKS!', team: [{ id: 111, level: 63 }] },
    { name: 'LEADER E', taunt: 'THE BIGGEST ROCK!', leader: true,
      team: [{ id: 1, level: 99 }, { id: 2, level: 99 }, { id: 3, level: 99 }, { id: 4, level: 99 }, { id: 5, level: 99 }, { id: 649, level: 100 }] }
  ]
});
const bad = (mut, why) => {
  const c = good();
  mut(c);
  const r = validateChapter(c);
  assert.equal(r.ok, false, 'should fail: ' + why);
  assert.ok(r.errors.length > 0, why);
  return r;
};

test('validator: a well-formed chapter passes with no errors', () => {
  assert.deepEqual(validateChapter(good()), { ok: true, errors: [] });
});

test('validator: the save can hold every trainer key', () => {
  assert.ok(WILD_CHAPTER_TRAINERS <= WILD_TRAINERS);
  assert.equal(WILD_CHAPTER_TRAINERS, 5);
});

test('validator: non-objects never throw', () => {
  for (const v of [null, undefined, 0, 1, 'x', true, [], [good()], () => 1, new Date(), new Map(), Object.create({ a: 1 })]) {
    const r = validateChapter(v);
    assert.equal(r.ok, false, String(v));
  }
});

test('validator: a throwing getter or a cyclic object comes back as ok:false', () => {
  const c = good();
  Object.defineProperty(c, 'name', { get() { throw new Error('boom'); }, enumerable: true });
  assert.equal(validateChapter(c).ok, false);
  const d = good();
  d.trainers[0].team[0].self = d;
  assert.equal(validateChapter(d).ok, false);
  const px = new Proxy(good(), { get() { throw new Error('trap'); } });
  assert.equal(validateChapter(px).ok, false);
});

test('validator: chapter fields are checked strictly', () => {
  bad(c => { delete c.idx; }, 'missing idx');
  bad(c => { c.idx = -1; }, 'negative idx');
  bad(c => { c.idx = WILD_COUNT; }, 'idx past the save key space');
  bad(c => { c.idx = 1.5; }, 'fractional idx');
  bad(c => { c.idx = '3'; }, 'string idx');
  bad(c => { c.key = 'Bad Key'; }, 'key with spaces');
  bad(c => { c.key = 'x'; }, 'key too short');
  bad(c => { c.key = 'a'.repeat(25); }, 'key too long');
  bad(c => { c.key = '__proto__'; }, 'poisoned key');
  bad(c => { c.name = 'lower case'; }, 'lowercase name');
  bad(c => { c.name = ''; }, 'empty name');
  bad(c => { c.name = 'A'.repeat(MAX_NAME + 1); }, 'long name');
  bad(c => { c.name = '<IMG SRC=X>'; }, 'markup in name');
  bad(c => { c.name = ' PADDED'; }, 'leading space');
  bad(c => { c.name = 'TWO  SPACES'; }, 'double space');
  bad(c => { c.emoji = ''; }, 'empty emoji');
  bad(c => { c.emoji = 'AB'; }, 'ascii emoji');
  bad(c => { c.emoji = '🌵🌵🌵🌵🌵'; }, 'emoji too long');
  bad(c => { c.types = []; }, 'no types');
  bad(c => { c.types = ['fire', 'water', 'grass']; }, 'three types');
  bad(c => { c.types = ['lava']; }, 'unknown type');
  bad(c => { c.types = ['fire', 'fire']; }, 'repeated type');
  bad(c => { c.types = 'fire'; }, 'types not an array');
  bad(c => { c.palette = null; }, 'no palette');
  bad(c => { c.palette.sky = 'blue'; }, 'named colour');
  bad(c => { c.palette.accent = '#abc'; }, 'short hex');
  bad(c => { delete c.palette.ground; }, 'missing ground');
  bad(c => { c.palette.extra = '#000000'; }, 'extra palette key');
  bad(c => { c.flavour = 'ONE TWO THREE FOUR FIVE SIX SEVEN'; }, 'flavour over 6 words');
  bad(c => { c.flavour = 'A'.repeat(MAX_LINE + 1); }, 'flavour too long');
  bad(c => { c.flavour = 42; }, 'flavour not a string');
  bad(c => { c.region = 'X'; }, 'unknown chapter key');
  bad(c => { Object.defineProperty(c, '__proto__', { value: 1, enumerable: true }); }, 'own __proto__ key');
  assert.ok(TYPES.includes('fairy') && TYPES.length === 18);
});

test('validator: exactly 5 trainers, the leader last and only last', () => {
  bad(c => { c.trainers.pop(); }, 'four trainers');
  bad(c => { c.trainers.push(c.trainers[0]); }, 'six trainers');
  bad(c => { c.trainers = {}; }, 'trainers not an array');
  bad(c => { delete c.trainers[4].leader; }, 'no leader');
  bad(c => { c.trainers[4].leader = 'yes'; }, 'leader not true');
  bad(c => { c.trainers[2].leader = true; }, 'leader in the middle');
  bad(c => { c.trainers[0].leader = false; }, 'leader key on a non-leader, even false');
  bad(c => { c.trainers[1] = null; }, 'null trainer');
  bad(c => { c.trainers[1].extra = 1; }, 'extra trainer key');
});

test('validator: trainer text is short, safe and uppercase', () => {
  bad(c => { c.trainers[0].name = 'hiker'; }, 'lowercase trainer');
  bad(c => { c.trainers[0].name = 'A'.repeat(MAX_NAME + 1); }, 'long trainer name');
  bad(c => { c.trainers[0].taunt = 'ONE TWO THREE FOUR FIVE SIX SEVEN'; }, 'taunt over 6 words');
  bad(c => { c.trainers[0].taunt = '<B>HI</B>'; }, 'markup taunt');
  bad(c => { c.trainers[0].taunt = ''; }, 'empty taunt');
  bad(c => { delete c.trainers[0].taunt; }, 'missing taunt');
});

test('validator: teams hold 1..6 real Pokemon at levels 1..100, no repeats', () => {
  bad(c => { c.trainers[0].team = []; }, 'empty team');
  bad(c => { c.trainers[4].team.push({ id: 6, level: 5 }); }, 'seven mons');
  bad(c => { c.trainers[0].team[0].id = 0; }, 'id 0');
  bad(c => { c.trainers[0].team[0].id = 650; }, 'Gen 6 id');
  bad(c => { c.trainers[0].team[0].id = 25.5; }, 'fractional id');
  bad(c => { c.trainers[0].team[0].id = '25'; }, 'string id');
  bad(c => { c.trainers[0].team[0].level = 0; }, 'level 0');
  bad(c => { c.trainers[0].team[0].level = 101; }, 'level 101');
  bad(c => { c.trainers[0].team[0].level = NaN; }, 'NaN level');
  bad(c => { c.trainers[1].team[1].id = 75; }, 'same species twice');
  bad(c => { c.trainers[0].team[0].shiny = true; }, 'extra mon key');
  bad(c => { c.trainers[0].team[0] = 74; }, 'bare id');
});

test('loadChapters: bad or duplicate chapters are skipped, never thrown', () => {
  const warns = [];
  const a = good();
  const b = good(); b.idx = 2; b.key = 'other-land';
  const dupIdx = good(); dupIdx.key = 'third-land';
  const dupKey = good(); dupKey.idx = 9;
  const broken = good(); broken.trainers.pop();
  const out = loadChapters([a, broken, null, b, dupIdx, dupKey], m => warns.push(m));
  assert.deepEqual(out.map(c => c.idx), [2, 7], 'sorted by idx, good ones only');
  assert.equal(warns.length, 4);
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out[0].trainers[0].team[0]));
  assert.deepEqual(loadChapters('nope'), []);
  assert.deepEqual(loadChapters(null), []);
  assert.doesNotThrow(() => loadChapters([good()], () => { throw new Error('warn broke'); }));
  // Freezing copies: the source can change without touching the loaded data.
  a.trainers[0].team[0].level = 1;
  assert.equal(out[1].trainers[0].team[0].level, 60);
  assert.equal(freezeChapter(good()).trainers[4].leader, true);
});

// ---------- the authored chapters ----------

test('all 6 authored chapters pass the validator', () => {
  assert.equal(WILD_AUTHORED.length, 6);
  for (const c of WILD_AUTHORED) assert.deepEqual(validateChapter(c), { ok: true, errors: [] }, c.name);
  assert.equal(WILD_CHAPTERS.length, 6);
  assert.deepEqual(WILD_CHAPTERS.map(c => c.idx), [0, 1, 2, 3, 4, 5]);
  assert.equal(new Set(WILD_CHAPTERS.map(c => c.key)).size, 6);
});

test('authored chapters: levels 60..85, rising chapter by chapter, leader the toughest', () => {
  let prevMax = 0;
  for (const c of WILD_CHAPTERS) {
    const lv = c.trainers.map(wildTrainerLevel);
    for (const l of lv) assert.ok(l >= 60 && l <= 85, c.name + ' ' + l);
    for (let j = 1; j < lv.length; j++) assert.ok(lv[j] >= lv[j - 1], c.name + ' trainers climb');
    assert.equal(Math.max(...lv), lv[WILD_LEADER]);
    assert.ok(lv[WILD_LEADER] > prevMax, c.name + ' leader beats the last chapter');
    prevMax = lv[WILD_LEADER];
    assert.ok(c.trainers[WILD_LEADER].leader);
    assert.match(c.trainers[WILD_LEADER].name, /^LEADER /);
  }
  assert.equal(prevMax, 85);
});

test('every wild key fits the save validator', () => {
  for (const c of WILD_CHAPTERS) for (let j = 0; j <= WILD_LEADER; j++) assert.ok(isClearedKey(wildKey(c.idx, j)), wildKey(c.idx, j));
});

// ---------- progression ----------

const fresh = () => ({ badges: [], gyms: { beaten: {} }, road: { chapter: 0, cleared: {}, bloomed: [], wildBloomed: [] } });
const champion = () => {
  const p = fresh();
  for (let i = 0; i < CHAPTERS.length; i++) for (let j = 0; j <= leaderIdx(i); j++) p.road.cleared[chapterKey(i, j)] = true;
  return p;
};

test('locked until the Champion falls: no signpost, nothing open', () => {
  const p = fresh();
  assert.equal(wildUnlocked(p), false);
  assert.equal(isWildOpen(p, 0), false);
  assert.equal(nextWildTrainer(p), null);
  assert.equal(isWildTrainerOpen(p, 0, 0), false);
  assert.equal(wildView(p, 0), 'fog');
  // Beating everything but the Champion is still not enough.
  const q = champion();
  delete q.road.cleared[chapterKey(CHAPTERS.length - 1, leaderIdx(CHAPTERS.length - 1))];
  assert.equal(wildUnlocked(q), false);
});

test('after the Champion: chapter 1 opens, trainers go in order, the next two show grey', () => {
  const p = champion();
  assert.equal(wildUnlocked(p), true);
  assert.equal(isWildOpen(p, 0), true);
  assert.equal(isWildOpen(p, 1), false);
  assert.deepEqual(nextWildTrainer(p), { idx: 0, j: 0 });
  assert.equal(isWildTrainerOpen(p, 0, 0), true);
  assert.equal(isWildTrainerOpen(p, 0, 1), false);
  assert.deepEqual(WILD_CHAPTERS.map((_, k) => wildView(p, k)), ['current', 'soon', 'soon', 'fog', 'fog', 'fog']);
});

test('applyWildWin: marks cleared, blooms once on the leader, opens the next chapter', () => {
  const p = champion();
  for (let j = 0; j < WILD_LEADER; j++) {
    const o = applyWildWin(p, 'wild:0:' + j);
    assert.deepEqual(o, { idx: 0, j, pos: 0, leader: false, bloom: false });
    assert.equal(isWildTrainerOpen(p, 0, j + 1), true);
  }
  assert.equal(isWildOpen(p, 1), false);
  const o = applyWildWin(p, 'wild:0:' + WILD_LEADER);
  assert.equal(o.bloom, true);
  assert.equal(o.leader, true);
  assert.deepEqual(p.road.wildBloomed, [0]);
  assert.equal(isWildBloomed(p, 0), true);
  assert.equal(isWildOpen(p, 1), true);
  assert.equal(currentWild(p), 1);
  assert.deepEqual(nextWildTrainer(p), { idx: 1, j: 0 });
  // A second return with the same onEnd never re-blooms.
  const again = applyWildWin(p, 'wild:0:' + WILD_LEADER);
  assert.equal(again.bloom, false);
  assert.deepEqual(p.road.wildBloomed, [0]);
  // Rematches of a beaten trainer stay open.
  assert.equal(isWildTrainerOpen(p, 0, 0), true);
  assert.deepEqual(WILD_CHAPTERS.map((_, k) => wildView(p, k)), ['done', 'current', 'soon', 'soon', 'fog', 'fog']);
});

test('bloom survives either field on its own (never taken away)', () => {
  const p = champion();
  p.road.wildBloomed = [0];
  assert.equal(isWildBloomed(p, 0), true);
  assert.equal(isWildOpen(p, 1), true);
  const q = champion();
  q.road.cleared[wildKey(0, WILD_LEADER)] = true;
  assert.equal(isWildBloomed(q, 0), true);
  // Applying a win after a leader already cleared by key still records the bloom list.
  const o = applyWildWin(q, 'wild:0:' + WILD_LEADER);
  assert.deepEqual(q.road.wildBloomed, [0]);
  assert.equal(o.bloom, true);
});

test('all six done: nothing next, every view done', () => {
  const p = champion();
  for (const c of WILD_CHAPTERS) for (let j = 0; j <= WILD_LEADER; j++) applyWildWin(p, 'wild:' + c.idx + ':' + j);
  assert.equal(currentWild(p), WILD_CHAPTERS.length);
  assert.equal(nextWildTrainer(p), null);
  assert.ok(WILD_CHAPTERS.every((_, k) => wildView(p, k) === 'done'));
  assert.deepEqual(p.road.wildBloomed, [0, 1, 2, 3, 4, 5]);
});

test('parseWildEnd / applyWildWin refuse junk and the tall grass codes', () => {
  for (const s of ['wild:0:5', 'wild:6:0', 'wild:01:0', 'wild:-1:0', 'wild:0:0:1', 'wild:faraway:25:0',
    'chapter:0:0', 'wild:0', '', null, 42, 'wild:0:0 ', 'WILD:0:0']) {
    assert.equal(parseWildEnd(s), null, String(s));
  }
  const p = champion();
  const before = JSON.stringify(p);
  assert.equal(applyWildWin(p, 'wild:3:1:0'), null);
  assert.equal(applyWildWin(p, 'rival:0'), null);
  assert.equal(applyWildWin(null, 'wild:0:0'), null);
  assert.equal(JSON.stringify(p), before);
  // A player without a road object gets one.
  const bare = {};
  assert.ok(applyWildWin(bare, 'wild:0:0'));
  assert.equal(bare.road.cleared['w0-t0'], true);
});

test('battle params use the normal trainer flow and a wild:<i>:<j> onEnd', () => {
  const bp = wildBattleParams(2, WILD_LEADER);
  assert.equal(bp.returnTo, 'road');
  assert.equal(bp.onEnd, 'wild:2:' + WILD_LEADER);
  assert.equal(bp.wild, false);
  assert.equal(bp.trainer.leader, true);
  assert.equal(bp.postgame, true, 'battle.js lifts postgame foes toward a strong team');
  assert.deepEqual(bp.enemyTeam, wildByIdx(2).trainers[WILD_LEADER].team.map(m => ({ ...m })));
  assert.equal(wildBattleParams(2, 0).trainer.leader, false);
  assert.equal(wildBattleParams(99, 0), null);
  assert.equal(wildBattleParams(0, 9), null);
  assert.deepEqual(parseWildEnd(bp.onEnd), { idx: 2, j: WILD_LEADER });
  assert.equal(wildPos(2), 2);
  assert.equal(isWildCleared(fresh(), 99, 0), false);
});

test('wild progress survives the save validator (cleanPlayer)', () => {
  const p = champion();
  applyWildWin(p, 'wild:0:' + WILD_LEADER);
  applyWildWin(p, 'wild:1:0');
  const c = cleanPlayer(JSON.parse(JSON.stringify({ name: 'GABE', profile: 'reader', ...p })));
  assert.equal(c.road.cleared['w0-t4'], true);
  assert.equal(c.road.cleared['w1-t0'], true);
  assert.deepEqual(c.road.wildBloomed, [0]);
  assert.equal(isWildOpen(c, 1), true);
});
