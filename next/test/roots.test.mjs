// node --test next/test/roots.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SHRINES, FINALE, ALL_SHRINES, LEGENDS, SANCTUM_LEVEL, FINALE_LEVEL, legendByKey, shrineByKey,
  doorOpen, rootsOpened, isResting, shrineDone, shrineCount, finaleOpen, allDone, visibleShrines, canChallenge,
  progress, inGrass, sanctumOnEnd, parseSanctumEnd, sanctumParams, applySanctumEnd, artBulbaId
} from '../data/sanctums.js';
import { CHAPTERS, chapterKey, leaderIdx } from '../data/chapters.js';
import { FARAWAY } from '../data/habitats.js';
import { isShortKey, cleanPlayer, openRoots, MAX_SANCTUMS } from '../core/validate.js';

const fresh = () => ({
  profile: 'reader', caught: [], team: [], mons: {}, shinies: [], nicks: {}, favorites: [],
  badges: [], gyms: { beaten: {} }, champion: null,
  road: { chapter: 0, cleared: {}, bloomed: [], roots: { opened: false, sanctums: {} } }
});
const champ = () => {
  const p = fresh();
  CHAPTERS.forEach((_, i) => { for (let j = 0; j <= leaderIdx(i); j++) p.road.cleared[chapterKey(i, j)] = true; p.road.bloomed.push(i); });
  return p;
};
const restAll = (p, except = []) => SHRINES.forEach(s => s.mons.forEach(m => { if (!except.includes(m.key)) p.road.roots.sanctums[m.key] = true; }));

test('shrines: eight plus the forest finale, 23 legendaries, unique safe keys and ids', () => {
  assert.equal(SHRINES.length, 8);
  assert.equal(ALL_SHRINES.length, 9);
  assert.equal(ALL_SHRINES[8], FINALE);
  assert.equal(LEGENDS.length, 23);
  const keys = LEGENDS.map(l => l.key);
  const ids = LEGENDS.map(l => l.id);
  assert.equal(new Set(keys).size, keys.length, 'keys unique');
  assert.equal(new Set(ids).size, ids.length, 'ids unique');
  assert.ok(keys.length <= MAX_SANCTUMS);
  for (const l of LEGENDS) {
    assert.ok(isShortKey(l.key), l.key + ' is a short safe key');
    assert.ok(Number.isInteger(l.id) && l.id >= 1 && l.id <= 649);
    assert.ok(l.level >= 70 && l.level <= 100, 'Lv70+');
    assert.equal(legendByKey(l.key), l);
    assert.ok(/^[A-Z-]+$/.test(l.name), 'uppercase name ' + l.name);
  }
  for (const s of ALL_SHRINES) {
    assert.ok(s.mons.length >= 1 && s.mons.length <= 3);
    assert.ok(s.name.split(' ').length <= 6);
    assert.equal(shrineByKey(s.key), s);
  }
  assert.equal(SHRINES[0].level, SANCTUM_LEVEL);
  assert.equal(FINALE.level, FINALE_LEVEL);
  assert.deepEqual(FINALE.mons.map(m => m.id), [251], 'Celebi is the forest guardian');
  assert.ok(Object.isFrozen(SHRINES) && Object.isFrozen(SHRINES[0].mons) && Object.isFrozen(LEGENDS[0]));
  assert.equal(legendByKey('__proto__'), null);
  assert.equal(shrineByKey('nope'), null);
});

test('the door: only after the Champion chapter blooms (FARAWAY rule)', () => {
  assert.equal(doorOpen(null), false);
  assert.equal(doorOpen(fresh()), false);
  const almost = champ();
  almost.road.bloomed = almost.road.bloomed.filter(i => i !== CHAPTERS.length - 1);
  delete almost.road.cleared[chapterKey(CHAPTERS.length - 1, leaderIdx(CHAPTERS.length - 1))];
  assert.equal(doorOpen(almost), false);
  assert.equal(doorOpen(champ()), true);
  const classic = fresh(); classic.champion = { date: '2026-01-01', team: [], levels: [] };
  assert.equal(doorOpen(classic), true, 'a classic Champion is let in too');
  const p = champ();
  assert.equal(rootsOpened(p), false);
  openRoots(p);
  assert.equal(rootsOpened(p), true);
  assert.equal(rootsOpened({}), false, 'no road at all: closed, no throw');
});

test('battle params: one Lv70+ wild legendary, returns to roots, onEnd sanctum:<key>', () => {
  const bp = sanctumParams('mewtwo');
  assert.deepEqual(bp, {
    enemyTeam: [{ id: 150, level: legendByKey('mewtwo').level }], trainer: null,
    wild: true, legendary: true, postgame: true, returnTo: 'roots', onEnd: 'sanctum:mewtwo'
  });
  assert.equal(sanctumParams('pikachu'), null);
  assert.equal(sanctumOnEnd('lugia'), 'sanctum:lugia');
  assert.equal(parseSanctumEnd('sanctum:lugia'), 'lugia');
  for (const bad of ['sanctum:', 'sanctum:__proto__', 'sanctum:toString', 'chapter:1:2', 'wild:faraway:150:0', null, 5, {}]) {
    assert.equal(parseSanctumEnd(bad), null, String(bad));
  }
});

test('win or catch: it rests for good; lose or run: it just waits', () => {
  const p = champ();
  assert.equal(applySanctumEnd(p, 'sanctum:zapdos', 'lose'), null);
  assert.equal(applySanctumEnd(p, 'sanctum:zapdos', 'fled'), null);
  assert.equal(isResting(p, 'zapdos'), false);
  assert.deepEqual(applySanctumEnd(p, 'sanctum:zapdos', 'caught'), { key: 'zapdos', fresh: true, finale: false });
  assert.equal(isResting(p, 'zapdos'), true);
  assert.deepEqual(applySanctumEnd(p, 'sanctum:zapdos', 'win'), { key: 'zapdos', fresh: false, finale: false });
  // a later loss never un-rests it
  applySanctumEnd(p, 'sanctum:zapdos', 'lose');
  assert.equal(isResting(p, 'zapdos'), true);
  assert.equal(applySanctumEnd(p, 'garbage', 'win'), null);
  assert.equal(applySanctumEnd(null, 'sanctum:zapdos', 'win'), null);
  // survives the save validator
  const clean = cleanPlayer(JSON.parse(JSON.stringify(p)));
  assert.equal(clean.road.roots.sanctums.zapdos, true);
  assert.equal(isResting(clean, 'zapdos'), true);
});

test('Celebi: hidden until every other legendary rests, then the finale', () => {
  const p = champ();
  assert.equal(finaleOpen(p), false);
  assert.equal(visibleShrines(p).length, 8);
  assert.equal(canChallenge(p, 'celebi'), false);
  assert.equal(canChallenge(p, 'articuno'), true);
  assert.equal(canChallenge(fresh(), 'articuno'), false, 'no door, no sanctum');
  restAll(p, ['giratina']);
  assert.equal(finaleOpen(p), false);
  assert.equal(shrineDone(p, 'stars'), false);
  assert.equal(shrineCount(p, shrineByKey('stars')), 2);
  assert.deepEqual(progress(p), { resting: 21, total: 22 });
  const out = applySanctumEnd(p, 'sanctum:giratina', 'win');
  assert.deepEqual(out, { key: 'giratina', fresh: true, finale: true });
  assert.equal(finaleOpen(p), true);
  assert.equal(visibleShrines(p).length, 9);
  assert.equal(canChallenge(p, 'celebi'), true);
  assert.deepEqual(progress(p), { resting: 22, total: 23 });
  assert.equal(allDone(p), false);
  // a sanctum the finale does not need changes nothing about it
  assert.equal(applySanctumEnd(p, 'sanctum:giratina', 'win').finale, false);
  assert.deepEqual(applySanctumEnd(p, 'sanctum:celebi', 'caught'), { key: 'celebi', fresh: true, finale: false });
  assert.equal(allDone(p), true);
});

test("Art's Bulba for the finale: the prereader's stage (Venusaur at 3)", () => {
  const save = { players: { 1: { profile: 'reader', bulba: { stage: 1 } }, 2: { profile: 'prereader', bulba: { stage: 3 } } } };
  assert.equal(artBulbaId(save, 1), 3);
  assert.equal(artBulbaId(save, 2), 3, 'Art himself playing: his own Bulba');
  save.players[2].bulba.stage = 2;
  assert.equal(artBulbaId(save, 1), 2);
  // no prereader: the other player's Bulba
  const two = { players: { 1: { profile: 'reader', bulba: { stage: 1 } }, 2: { profile: 'reader', bulba: { stage: 3 } } } };
  assert.equal(artBulbaId(two, 1), 3);
  assert.equal(artBulbaId(two, 2), 1);
  for (const junk of [null, {}, { players: {} }, { players: { 2: { profile: 'prereader', bulba: { stage: 9 } } } }]) {
    assert.equal(artBulbaId(junk, 1), 1, 'Bulbasaur when unknown');
  }
});

test('FARAWAY grass keeps its legendaries; the sanctums add to it, never replace it', () => {
  assert.ok(FARAWAY.L.length > 0);
  // the lake trio and Regis are in the grass AND have shrines
  for (const id of [377, 378, 379, 480, 481, 482]) assert.equal(inGrass(id), true, 'grass has ' + id);
  assert.equal(inGrass(251), false);
  // nothing in this module mutates FARAWAY
  assert.ok(FARAWAY.L.includes(385));
});

test('scene source: no innerHTML, no speech, every wait via wait()', () => {
  for (const f of ['../scenes/roots.js', '../data/sanctums.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!/innerHTML/.test(src), f + ' has no innerHTML');
    const talk = new RegExp(['spee', 'chSynthesis|Spee', 'chSynthesis'].join(''));   // spelled in pieces: the smoke grep
    assert.ok(!talk.test(src), f + ' has no speech');
    assert.ok(!/setTimeout|setInterval|Date\.now|new Date/.test(src), f + ' has no timers or clocks');
  }
});
