// node --test next/test/wild.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HABITATS, FARAWAY, FARAWAY_KEY, HABITAT_FOR_TYPE, habitatKeyForType, habitatForChapter, habitatByKey,
  farawayOpen, wildPlaces, parsePlace, placeOpen, rollEncounter, rollShiny, SHINY_ODDS, wildBand,
  encounterLevel, leadLevelOf, rollWild, wildOnEnd, parseWildEnd
} from '../data/habitats.js';
import { CHAPTERS, chapterKey, leaderIdx } from '../data/chapters.js';
import { seededRng } from '../core/rng.js';
import { trainerKey } from '../data/gymdata.js';
import {
  slimChain, optionsFrom, evolutionOptions, evolutionsDue, evolveRoute, evolveMonIn,
  EVO_DEFAULT_LEVEL, _resetEvoCache
} from '../core/evo.js';

const fresh = () => ({
  profile: 'reader', caught: [], team: [], mons: {}, shinies: [], nicks: {}, favorites: [],
  badges: [], gyms: { beaten: {} }, road: { chapter: 0, cleared: {}, bloomed: [] }, champion: null
});
const bloom = (p, i) => { for (let j = 0; j <= leaderIdx(i); j++) p.road.cleared[chapterKey(i, j)] = true; p.road.bloomed.push(i); };

// ------------------------------------------------------------ habitats

test('habitat mapping: every chapter type maps to a real habitat, documented pairs hold', () => {
  const expected = { rock: 'cave', water: 'ocean', electric: 'powerplant', grass: 'forest', psychic: 'meadow',
    fighting: 'cave', ghost: 'tower', ice: 'ocean', fire: 'volcano', dragon: 'dragon' };
  assert.deepEqual({ ...HABITAT_FOR_TYPE }, expected);
  CHAPTERS.forEach((ch, i) => {
    const hab = habitatForChapter(i);
    assert.ok(hab, 'chapter ' + i + ' has a habitat');
    assert.equal(hab.key, expected[ch.type]);
    assert.notEqual(hab.key, FARAWAY_KEY, 'no chapter maps to FARAWAY');
  });
  assert.equal(habitatKeyForType('nonsense'), 'meadow');
  assert.equal(habitatKeyForType('__proto__'), 'meadow');
  assert.equal(habitatForChapter(99), null);
  // All eight classic habitats show up somewhere on the Road.
  const used = new Set(CHAPTERS.map((_, i) => habitatForChapter(i).key));
  assert.equal(used.size, 8);
});

test('habitat pools: classic port + backfill merged, ids valid, FARAWAY is last and champion-only', () => {
  assert.equal(HABITATS.length, 9);
  assert.equal(HABITATS[8].key, FARAWAY_KEY);
  assert.equal(HABITATS[8].championOnly, true);
  assert.equal(habitatByKey(FARAWAY_KEY).L.length, FARAWAY.L.length);
  const all = new Set();
  for (const hb of HABITATS) {
    for (const k of ['c', 'u', 'r', 'L']) {
      assert.ok(Array.isArray(hb[k]));
      for (const id of hb[k]) { assert.ok(Number.isInteger(id) && id >= 1 && id <= 649, hb.key + ' ' + id); all.add(id); }
    }
    assert.ok(hb.c.length > 0, hb.key + ' has a common pool');
  }
  // backfill merged: 60 forest (a backfill-only id) lives in ocean; 23 (ekans) in forest
  assert.ok(habitatByKey('ocean').c.includes(60));
  assert.ok(habitatByKey('forest').c.includes(23));
  assert.ok(all.size >= 620, 'nearly every species has a home: ' + all.size);
});

test('rollEncounter uses the classic weights', () => {
  const hab = habitatByKey('forest');
  assert.equal(rollEncounter(hab, () => 0.005).tier, 'legendary');
  assert.equal(rollEncounter(hab, () => 0.05).tier, 'rare');
  assert.equal(rollEncounter(hab, () => 0.2).tier, 'uncommon');
  assert.equal(rollEncounter(hab, () => 0.9).tier, 'common');
  const rng = seededRng(7);
  const n = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
  for (let i = 0; i < 20000; i++) {
    const e = rollEncounter(hab, rng);
    n[e.tier]++;
    assert.ok([...hab.c, ...hab.u, ...hab.r, ...hab.L].includes(e.id));
  }
  assert.ok(n.common > 11000 && n.common < 13000, JSON.stringify(n));
  assert.ok(n.legendary > 100 && n.legendary < 330, JSON.stringify(n));
  // a habitat with no legendaries falls through to a real pool
  const noL = { ...hab, L: [] };
  assert.notEqual(rollEncounter(noL, () => 0.001).tier, 'legendary');
});

test('shiny odds are 1 in 64', () => {
  assert.equal(SHINY_ODDS, 64);
  assert.equal(rollShiny(() => 0.0155), true);
  assert.equal(rollShiny(() => 0.0157), false);
  const rng = seededRng(3);
  let s = 0;
  for (let i = 0; i < 64000; i++) if (rollShiny(rng)) s++;
  assert.ok(s > 800 && s < 1200, String(s));
});

test('levels: region band leashed to the lead (engine.wildLevel)', () => {
  assert.deepEqual(wildBand(0), { base: 5, spread: 5 });
  assert.equal(wildBand(FARAWAY_KEY).base, 50);
  for (let i = 1; i < CHAPTERS.length; i++) assert.ok(wildBand(i).base > wildBand(i - 1).base, 'bands rise');
  // a fresh Lv5 team in chapter 0: never above lead + 8
  for (let k = 0; k < 50; k++) {
    const lv = encounterLevel(0, 5, { rng: () => k / 50 });
    assert.ok(lv >= 2 && lv <= 10, String(lv));
  }
  // a Lv40 lead back in chapter 0: leashed up to lead - 5
  assert.equal(encounterLevel(0, 40, { rng: () => 0 }), 35);
  // a Lv12 lead in chapter 9: capped at lead + 8
  assert.equal(encounterLevel(9, 12, { rng: () => 0.99 }), 20);
  const p = fresh(); p.caught = [25]; p.team = [25]; p.mons = { 25: { level: 17, xp: 0 } };
  assert.equal(leadLevelOf(p), 17);
  assert.equal(leadLevelOf(fresh()), 5);
  // a prereader's lead is his BULBA, never a caught Pokemon from the box
  const art = fresh(); art.profile = 'prereader'; art.bulba = { stage: 2 }; art.caught = [25]; art.team = [25];
  art.mons = { 25: { level: 30, xp: 0 }, 2: { level: 9, xp: 0 } };
  assert.equal(leadLevelOf(art), 9);
});

test('places: only bloomed chapters have grass; FARAWAY after the Champion chapter', () => {
  const p = fresh();
  assert.deepEqual(wildPlaces(p).map(x => x.place), [FARAWAY_KEY]);
  assert.equal(wildPlaces(p)[0].open, false);
  assert.equal(placeOpen(p, 0), false);
  bloom(p, 0); bloom(p, 1);
  assert.deepEqual(wildPlaces(p).filter(x => x.open).map(x => x.place), [0, 1]);
  assert.equal(placeOpen(p, 1), true);
  assert.equal(placeOpen(p, 2), false);
  assert.equal(farawayOpen(p), false);
  for (let i = 2; i < CHAPTERS.length; i++) bloom(p, i);
  assert.equal(farawayOpen(p), true);
  assert.equal(placeOpen(p, FARAWAY_KEY), true);
  // classic Champion counts too
  const q = fresh(); q.champion = { date: '2026-01-01' };
  assert.equal(farawayOpen(q), true);
  // classic gym progress blooms a region
  const r = fresh();
  for (let j = 0; j <= leaderIdx(2); j++) r.gyms.beaten[trainerKey(CHAPTERS[2].key, j, 1)] = true;
  assert.equal(placeOpen(r, 2), true);
  assert.equal(farawayOpen(null), false);
});

test('parsePlace / onEnd round trip', () => {
  assert.equal(parsePlace(3), 3);
  assert.equal(parsePlace('3'), 3);
  assert.equal(parsePlace('faraway'), FARAWAY_KEY);
  assert.equal(parsePlace(12), null);
  assert.equal(parsePlace('x'), null);
  assert.equal(parsePlace(1.5), null);
  assert.equal(wildOnEnd(3, 74, true), 'wild:3:74:1');
  assert.deepEqual(parseWildEnd('wild:3:74:1'), { place: 3, id: 74, shiny: true });
  assert.deepEqual(parseWildEnd(wildOnEnd(FARAWAY_KEY, 649, false)), { place: FARAWAY_KEY, id: 649, shiny: false });
  for (const bad of [null, '', 'wild:13:5:0', 'wild:3:0:0', 'wild:3:650:0', 'wild:3:5:2', 'chapter:1:2', 'wild:3:5:1x'])
    assert.equal(parseWildEnd(bad), null, String(bad));
});

test('rollWild: a whole encounter from the right pools', () => {
  const p = fresh(); bloom(p, 0); p.caught = [1]; p.team = [1]; p.mons = { 1: { level: 12, xp: 0 } };
  const rng = seededRng(11);
  const cave = habitatByKey('cave');
  const pool = new Set([...cave.c, ...cave.u, ...cave.r, ...cave.L]);
  for (let i = 0; i < 200; i++) {
    const e = rollWild(0, p, rng);
    assert.ok(pool.has(e.id));
    assert.ok(e.level >= 7 && e.level <= 20, String(e.level));
    assert.equal(typeof e.shiny, 'boolean');
  }
  assert.equal(rollWild(null, p, rng), null);
});

// ------------------------------------------------------------ evolution data

const chainOfUrl = n => `https://pokeapi.co/api/v2/pokemon-species/${n}/`;
const EEVEE_CHAIN = {
  chain: {
    species: { name: 'eevee', url: chainOfUrl(133) }, evolution_details: [],
    evolves_to: [
      { species: { name: 'vaporeon', url: chainOfUrl(134) }, evolution_details: [{ min_level: null, trigger: { name: 'use-item' } }], evolves_to: [] },
      { species: { name: 'jolteon', url: chainOfUrl(135) }, evolution_details: [{ min_level: null }], evolves_to: [] },
      { species: { name: 'sylveon', url: chainOfUrl(700) }, evolution_details: [{ min_level: null }], evolves_to: [] }
    ]
  }
};
const CHARM_CHAIN = {
  chain: {
    species: { name: 'charmander', url: chainOfUrl(4) }, evolution_details: [],
    evolves_to: [{
      species: { name: 'charmeleon', url: chainOfUrl(5) }, evolution_details: [{ min_level: 16 }],
      evolves_to: [{ species: { name: 'charizard', url: chainOfUrl(6) }, evolution_details: [{ min_level: 36 }], evolves_to: [] }]
    }]
  }
};

test('slimChain walks every branch, flat, parent first', () => {
  const c = slimChain(CHARM_CHAIN);
  assert.deepEqual(c.map(x => [x.id, x.from, x.minLevel]), [[4, null, null], [5, 4, 16], [6, 5, 36]]);
  assert.equal(c[1].name, 'CHARMELEON');
  const e = slimChain(EEVEE_CHAIN);
  assert.deepEqual(e.map(x => x.id), [133, 134, 135, 700]);
  // a self-loop cannot spin
  const loop = { chain: { species: { name: 'x', url: chainOfUrl(10) }, evolves_to: [{ species: { name: 'x', url: chainOfUrl(10) }, evolves_to: [] }] } };
  assert.equal(slimChain(loop).length, 1);
  assert.deepEqual(slimChain(null), []);
});

test('optionsFrom: level gates, Lv30 default for stones/trades, no ids past 649', () => {
  const c = slimChain(CHARM_CHAIN);
  assert.deepEqual(optionsFrom(c, 4, 15), []);
  assert.deepEqual(optionsFrom(c, 4, 16).map(o => o.id), [5]);
  assert.deepEqual(optionsFrom(c, 5, 40).map(o => o.id), [6]);
  assert.deepEqual(optionsFrom(c, 6, 100), []);
  const e = slimChain(EEVEE_CHAIN);
  assert.deepEqual(optionsFrom(e, 133, EVO_DEFAULT_LEVEL - 1), []);
  assert.deepEqual(optionsFrom(e, 133, EVO_DEFAULT_LEVEL).map(o => o.id), [134, 135]);
});

function fakeFetch(map, calls = []) {
  return async url => { calls.push(url); if (!(url in map)) throw new Error('404 ' + url); return map[url]; };
}
const SP = n => `https://pokeapi.co/api/v2/pokemon-species/${n}`;
const CH = n => `https://pokeapi.co/api/v2/evolution-chain/${n}/`;

test('evolutionOptions fetches species -> chain once, caches, and never rejects', async () => {
  _resetEvoCache();
  const calls = [];
  const fetchJson = fakeFetch({
    [SP(4)]: { evolution_chain: { url: CH(2) } }, [SP(5)]: { evolution_chain: { url: CH(2) } },
    [CH(2)]: CHARM_CHAIN, [SP(7)]: { evolution_chain: { url: 'https://evil.example/x' } }
  }, calls);
  assert.deepEqual((await evolutionOptions(4, 16, { fetchJson })).map(o => o.id), [5]);
  assert.deepEqual((await evolutionOptions(5, 36, { fetchJson })).map(o => o.id), [6]);
  assert.equal(calls.filter(u => u === CH(2)).length, 1, 'chain fetched once');
  assert.deepEqual(await evolutionOptions(7, 50, { fetchJson }), [], 'foreign chain url refused');
  assert.deepEqual(await evolutionOptions(99, 50, { fetchJson }), [], 'network error -> []');
  assert.deepEqual(await evolutionOptions(0, 50, { fetchJson }), []);
});

test('evolutionsDue skips unowned ids; a prereader is never asked (integrator ruling)', async () => {
  _resetEvoCache();
  const BULB = { chain: { species: { name: 'bulbasaur', url: chainOfUrl(1) }, evolves_to: [{ species: { name: 'ivysaur', url: chainOfUrl(2) }, evolution_details: [{ min_level: 16 }], evolves_to: [] }] } };
  const fetchJson = fakeFetch({
    [SP(1)]: { evolution_chain: { url: CH(1) } }, [CH(1)]: BULB,
    [SP(4)]: { evolution_chain: { url: CH(2) } }, [CH(2)]: CHARM_CHAIN
  });
  const p = fresh(); p.caught = [1, 4]; p.mons = { 1: { level: 20, xp: 0 }, 4: { level: 20, xp: 0 } };
  assert.deepEqual((await evolutionsDue(p, [1, 4, 5], { fetchJson })).map(d => d.id), [1, 4]);
  p.profile = 'prereader';
  assert.deepEqual(await evolutionsDue(p, [1, 4], { fetchJson }), [], 'Art never meets the evolve screen');
  assert.deepEqual(await evolveRoute(p, [4], 'garden', { result: 'win' }, { fetchJson }), ['garden', { result: 'win' }]);
  p.profile = 'reader';
  const [scene, prm] = await evolveRoute(p, [4], 'wild', { result: 'win', onEnd: 'wild:0:4:0' }, { fetchJson });
  assert.equal(scene, 'evolve');
  assert.equal(prm.returnTo, 'wild');
  assert.deepEqual(prm.returnParams, { result: 'win', onEnd: 'wild:0:4:0' });
  assert.deepEqual(prm.queue.map(q => [q.id, q.options.map(o => o.id)]), [[4, [5]]]);
  assert.deepEqual(await evolveRoute(p, [], 'road', { result: 'lose' }), ['road', { result: 'lose' }]);
  // a hung network never holds the child: plain route after the timeout
  const never = () => new Promise(() => {});
  _resetEvoCache();
  const t0 = Date.now();
  assert.deepEqual(await evolveRoute(p, [4], 'road', { a: 1 }, { fetchJson: never, timeoutMs: 30 }), ['road', { a: 1 }]);
  assert.ok(Date.now() - t0 < 1000);
});

// ------------------------------------------------------------ the one write

test('evolveMonIn moves growth and identity, never removes the old one', () => {
  const p = fresh();
  p.caught = [4, 25]; p.team = [25, 4]; p.favorites = [4]; p.shinies = [4];
  p.mons = { 4: { level: 16, xp: 12 }, 25: { level: 9, xp: 0 } };
  p.nicks = { 4: 'SPARKY' };
  const r = evolveMonIn(p, 4, 5);
  assert.deepEqual(r, { from: 4, to: 5, level: 16 });
  assert.ok(p.caught.includes(4), 'old kept');
  assert.ok(p.caught.includes(5), 'new added');
  assert.deepEqual(p.mons[5], { level: 16, xp: 12 });
  assert.deepEqual(p.mons[4], { level: 16, xp: 12 }, 'old growth untouched');
  assert.equal(p.nicks[5], 'SPARKY');
  assert.ok(!Object.hasOwn(p.nicks, 4), 'nick moved');
  assert.deepEqual(p.shinies.sort(), [4, 5], 'shiny shelf only grows');
  assert.deepEqual(p.favorites, [5]);
  assert.deepEqual(p.team, [25, 5], 'same team slot');
});

test('evolveMonIn: an already-owned target keeps the better growth and no doubles', () => {
  const p = fresh();
  p.caught = [4, 5]; p.team = [4, 5]; p.favorites = [5, 4];
  p.mons = { 4: { level: 16, xp: 0 }, 5: { level: 30, xp: 5 } };
  p.nicks = { 4: 'A', 5: 'B' };
  evolveMonIn(p, 4, 5);
  assert.deepEqual(p.mons[5], { level: 30, xp: 5 }, 'never lowered');
  assert.deepEqual(p.team, [5]);
  assert.deepEqual(p.favorites, [5]);
  assert.deepEqual(p.nicks, { 4: 'A', 5: 'B' }, 'both nicks stay');
  assert.deepEqual(p.caught, [4, 5]);
  // a higher old level lifts the new one
  const q = fresh(); q.caught = [4, 5]; q.mons = { 4: { level: 40, xp: 1 }, 5: { level: 20, xp: 0 } };
  evolveMonIn(q, 4, 5);
  assert.deepEqual(q.mons[5], { level: 40, xp: 1 });
});

test('evolveMonIn refuses junk and unowned Pokemon without touching the save', () => {
  const p = fresh(); p.caught = [4]; p.mons = { 4: { level: 16, xp: 0 } };
  const snap = JSON.stringify(p);
  assert.equal(evolveMonIn(p, 7, 8), null);
  assert.equal(evolveMonIn(p, 4, 4), null);
  assert.equal(evolveMonIn(p, 4, 700), null);
  assert.equal(evolveMonIn(p, '4x', 5), null);
  assert.equal(evolveMonIn(null, 4, 5), null);
  assert.equal(JSON.stringify(p), snap);
  // missing arrays are tolerated
  const q = { caught: [4] };
  assert.deepEqual(evolveMonIn(q, 4, 5), { from: 4, to: 5, level: 5 });
  assert.deepEqual(q.caught, [4, 5]);
});

// ---- integrator (batch 3): the evolve scene's input guards
test('evolve scene: cleanQueue never asks a prereader; return params keep one nested level', async () => {
  const { cleanQueue, cleanReturnParams } = await import('../scenes/evolve.js');
  const p = { profile: 'reader', caught: [4, 133] };
  const q = { queue: [{ id: 4, options: [{ id: 5, name: 'charmeleon' }] }, { id: 999, options: [{ id: 5 }] }, { id: 133, options: [{ id: 134 }, { id: 134 }, { id: 'x' }] }] };
  assert.deepEqual(cleanQueue(q, p), [{ id: 4, options: [{ id: 5, name: 'CHARMELEON' }] }, { id: 133, options: [{ id: 134, name: '' }] }]);
  assert.deepEqual(cleanQueue(q, { ...p, profile: 'prereader' }), []);
  assert.deepEqual(cleanReturnParams({ returnTo: 'together', returnParams: { battler: 1, helper: 2, x: { deep: 1 } }, highlight: 4, 'bad key': 1, list: [1] }),
    { returnTo: 'together', returnParams: { battler: 1, helper: 2 }, highlight: 4 });
  assert.deepEqual(cleanReturnParams(null), {});
});
