// SPROUT ROAD core tests: node --test next/test/core.test.mjs
// Covers validate, migrate, save (with a mock localStorage), store, rng,
// pace and api (with a stubbed fetch). No network, no browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ------------------------------------------------------------ mock storage
// Items are own enumerable properties so Object.keys(localStorage) works as
// it does in a browser. A v2 write of ANY kind fails the test outright.
class MockStorage {
  constructor({ quota = Infinity, failKeys = [] } = {}) {
    Object.defineProperty(this, '_q', { value: { quota, failKeys, writes: [] }, enumerable: false });
  }
  getItem(k) { return Object.hasOwn(this, k) ? this[k] : null; }
  setItem(k, v) {
    if (k === 'pokedexos_save_v2') throw new Error('TEST GUARD: pokedexos_save_v2 was written');
    if (this._q.failKeys.some(p => k.startsWith(p))) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    const size = Object.keys(this).reduce((a, key) => a + (key === k ? 0 : key.length + this[key].length), 0) + k.length + String(v).length;
    if (size > this._q.quota) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    this._q.writes.push(k);
    this[k] = String(v);
  }
  removeItem(k) {
    if (k === 'pokedexos_save_v2') throw new Error('TEST GUARD: pokedexos_save_v2 was removed');
    delete this[k];
  }
  get length() { return Object.keys(this).length; }
  key(i) { return Object.keys(this)[i] ?? null; }
}
const freshLS = opts => (globalThis.localStorage = new MockStorage(opts));
freshLS();

// ------------------------------------------------------------ stub fetch (before api.js loads)
const HERE = fileURLToPath(new URL('.', import.meta.url));
const MOVES = JSON.parse(readFileSync(HERE + '../data/moves.json', 'utf8'));
const fetchLog = [];
function pokemonFixture(id) {
  return {
    id, name: id === 1 ? 'bulbasaur' : id === 122 ? 'mr-mime' : 'pokemon' + id, base_experience: 64,
    types: [{ slot: 2, type: { name: 'poison' } }, { slot: 1, type: { name: 'grass' } }],
    stats: [
      { stat: { name: 'hp' }, base_stat: 45 }, { stat: { name: 'attack' }, base_stat: 49 },
      { stat: { name: 'defense' }, base_stat: 49 }, { stat: { name: 'special-attack' }, base_stat: 65 },
      { stat: { name: 'special-defense' }, base_stat: 65 }, { stat: { name: 'speed' }, base_stat: 45 },
    ],
    moves: ['vine-whip', 'tackle', 'razor-leaf', 'growl', 'sludge-bomb', 'solar-beam', 'body-slam', '<script>', 'take-down', 'seed-bomb']
      .map(n => ({ move: { name: n, url: 'x' } })),
  };
}
globalThis.fetch = async (url) => {
  const u = String(url);
  fetchLog.push(u);
  const ok = body => ({ ok: true, status: 200, json: async () => body });
  if (u.endsWith('/data/moves.json')) return ok(MOVES);
  let m = /\/pokemon\/(\d+)$/.exec(u);
  if (m) return ok(pokemonFixture(Number(m[1])));
  m = /\/pokemon-species\/(\d+)$/.exec(u);
  if (m) return ok({ name: Number(m[1]) === 122 ? 'mr-mime' : (Number(m[1]) === 1 ? 'bulbasaur' : 'pokemon' + m[1]), capture_rate: 45 });
  return { ok: false, status: 404, json: async () => ({}) };
};

const V = await import('../core/validate.js');
const M = await import('../core/migrate.js');
const S = await import('../core/save.js');
const { store } = await import('../core/store.js');
const R = await import('../core/rng.js');
const P = await import('../core/pace.js');
const A = await import('../core/api.js');

// ------------------------------------------------------------ fixtures

// A realistic classic save: GABE deep into the circuit (Champion, round 2
// started), ART in Junior Mode with a small box. Includes every v2 field,
// quests, settings, extra gyms fields and an unknown future key.
function v2Fixture() {
  return {
    version: 2,
    players: {
      1: {
        name: "GABE'S", caught: [1, 4, 6, 7, 25, 94, 130, 149, 150, 248, 445, 649],
        team: [6, 130, 25, 149, 94, 445],
        mons: { 6: { level: 72, xp: 310 }, 130: { level: 68, xp: 12 }, 25: { level: 55, xp: 0 }, 149: { level: 70, xp: 5 }, 94: { level: 61, xp: 44 }, 445: { level: 66, xp: 100 }, 1: { level: 5, xp: 0 } },
        badges: ['gym-rock', 'gym-water', 'gym-electric', 'first-catch'],
        shinies: [25, 130], nicks: { 6: 'BLAZE', 25: "SPARKY'S" },
        favorites: [6, 25, 150], items: { masterBalls: 2, potions: 3 },
        quests: { day: 20120, allDone: false, list: [{ key: 'catch_fire', progress: 1, done: false }] },
        gyms: { beaten: { 'rock:0': true, 'rock:1': true, 'rock:2': true, 'rock:3': true, 'rock:4': true, 'water:0': true, 'water:4': true, 'elite:4': true, 'rock:0:r2': true }, round: 2 },
        settings: { junior: false, music: true },
        champion: { date: '2026-08-14', team: [6, 130, 25, 149, 94, 445], levels: { 6: 70, 130: 66 } },
        stats: { catches: 12, battlesWon: 58, battlesLost: 9, versusWins: 3 },
        futureThing: { a: [1, 2, 3], b: 'kept' },
      },
      2: {
        name: 'ART', caught: [1, 7, 25, 133], team: [25, 1],
        mons: { 25: { level: 12, xp: 30 }, 1: { level: 9, xp: 2 }, 7: { level: 5, xp: 0 }, 133: { level: 6, xp: 1 } },
        badges: [], shinies: [133], nicks: { 25: 'PIKA' }, favorites: [133],
        items: { masterBalls: 0 }, quests: {}, gyms: { beaten: {} },
        settings: { junior: true }, champion: null,
        stats: { catches: 4, battlesWon: 7, battlesLost: 0, versusWins: 0 },
      },
    },
  };
}

const clone = o => JSON.parse(JSON.stringify(o));
function deepFreeze(o) { if (o && typeof o === 'object') { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; }
function reset(opts) { S._resetForTests(); store.save = null; return freshLS(opts); }
// Every string reachable in a player, except inside legacy{} (verbatim by contract, never rendered).
function strings(o, out = [], path = '') {
  if (typeof o === 'string') out.push([path, o]);
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (k !== 'legacy') { out.push([path + '#key', k]); strings(v, out, path + '.' + k); } }
  return out;
}

// ============================================================ validate

test('freshPlayer carries every v3 field from the contract', () => {
  const p = V.freshPlayer();
  for (const k of ['name', 'profile', 'caught', 'team', 'mons', 'shinies', 'nicks', 'favorites', 'items', 'badges', 'gyms', 'champion', 'stats', 'bulba', 'garden', 'road', 'lock', 'legacy']) {
    assert.ok(Object.hasOwn(p, k), k);
  }
  assert.deepEqual(p.bulba, { petals: 0, stage: 1, stayStone: false, visitors: [], accessory: null });
  assert.deepEqual(p.garden, { plots: [], berries: 0, decor: [] });
  assert.deepEqual(p.road, { chapter: 0, cleared: {}, bloomed: [], seeds: 0, guardians: {}, hatched: false, rival: { wins: 0, losses: 0, last: -1 }, r2bloomed: [], wildBloomed: [], roots: { opened: false, sanctums: {} } });
  assert.equal(p.lock, null);
  assert.deepEqual(V.freshSave('2026-01-01').family, { postcards: 0, lastPostcard: null, versus: { gabe: 0, dad: 0 }, challenge: { wins: [] } });
  assert.deepEqual(V.freshSave('2026-01-01').gifts, { toReader: 0 });
  assert.deepEqual(Object.keys(p.stats).sort(), ['battlesLost', 'battlesWon', 'catches', 'explores', 'versusWins']);
});

test('cleanPlayer is idempotent on a migrated real-shaped player', () => {
  const p = M.fromV2(v2Fixture()).players[1];
  assert.deepEqual(V.cleanPlayer(p), p);
  assert.deepEqual(V.cleanPlayer(V.cleanPlayer(clone(p))), p);
});

test('hostile: markup in every string and counter comes out clean', () => {
  const X = '<img src=x onerror=alert(1)>"&';
  const raw = {
    name: X, profile: X, caught: [X, 25, '<b>'], team: [X, 25], mons: { 25: { level: X, xp: X }, [X]: { level: 5 } },
    shinies: [X], nicks: { 25: X, [X]: 'A' }, favorites: [X, 25], items: { masterBalls: X, [X]: 3, potions: X },
    badges: [X, 'gym-rock', '<svg>'], gyms: { beaten: { [X]: true, 'rock:0': X } },
    champion: { date: X, team: [25] }, stats: { catches: X, battlesWon: '<b>9</b>', [X]: 1 },
    bulba: { petals: X, stage: X, stayStone: X, visitors: [X, 1] },
    garden: { plots: [{ x: X, y: 1, kind: 'flower', grown: 1 }, { x: 1, y: 2, kind: X, grown: 1 }, { x: 3, y: 4, kind: 'berry', grown: X }], berries: X },
    road: { chapter: X, cleared: { [X]: true, 'c0-t0': true }, bloomed: [X, 0] },
  };
  const p = V.cleanPlayer(JSON.parse(JSON.stringify(raw)));
  for (const [path, s] of strings(p)) assert.ok(!/[<>"&]/.test(s), `markup survived at ${path}: ${s}`);
  assert.ok(p.name.length <= 12);
  assert.equal(p.profile, 'reader');
  assert.deepEqual(p.caught, [25]);
  assert.deepEqual(p.team, [25]);
  assert.deepEqual(p.mons, { 25: { level: 5, xp: 0 } });
  assert.equal(p.items.masterBalls, 0);
  assert.equal(p.items.potions, 0);
  assert.deepEqual(p.badges, ['gym-rock']);
  assert.deepEqual(p.gyms.beaten, { 'rock:0': true });
  assert.equal(p.champion, null);
  assert.equal(p.stats.catches, 0);
  assert.equal(p.stats.battlesWon, 0);
  assert.deepEqual(p.bulba, { petals: 0, stage: 1, stayStone: false, visitors: [1], accessory: null });
  assert.deepEqual(p.garden.plots, [{ x: 3, y: 4, kind: 'berry', grown: 0 }]);
  assert.equal(p.garden.berries, 0);
  assert.deepEqual(p.road, { ...V.freshRoad(), cleared: { 'c0-t0': true }, bloomed: [0] });
  for (const v of Object.values(p.stats)) assert.equal(typeof v, 'number');
  for (const v of Object.values(p.items)) assert.equal(typeof v, 'number');
});

test('hostile: __proto__ / constructor keys never pollute and never survive', () => {
  const json = `{"name":"A","caught":[1],"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":2}},
    "mons":{"__proto__":{"level":99}},"nicks":{"__proto__":"X"},"stats":{"__proto__":5,"catches":2},
    "items":{"__proto__":{"polluted":3}},"gyms":{"beaten":{"__proto__":true}},
    "road":{"cleared":{"__proto__":true}},"legacy":{"__proto__":{"polluted":4},"ok":{"__proto__":{"polluted":5},"v":1}}}`;
  const p = V.cleanPlayer(JSON.parse(json));
  assert.equal(({}).polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
  for (const o of [p, p.mons, p.nicks, p.stats, p.items, p.gyms.beaten, p.road.cleared, p.legacy, p.legacy.ok]) {
    assert.equal(Object.getPrototypeOf(o), Object.prototype);
    assert.equal(o.polluted, undefined);
    assert.ok(!Object.hasOwn(o, '__proto__'));
    assert.ok(!Object.hasOwn(o, 'constructor'));
  }
  assert.equal(p.stats.catches, 2);
  assert.deepEqual(p.legacy.ok, { v: 1 });
});

test('hostile: ids out of range and wrong types are dropped', () => {
  const bad = [0, -1, 650, 1.5, NaN, null, 'abc', '1e3', 1e308, true, {}, [], '25', 649, 1];
  const p = V.cleanPlayer({ caught: bad, shinies: bad, team: bad, favorites: bad, bulba: { visitors: bad }, mons: { 0: { level: 5 }, 650: { level: 5 }, '-1': { level: 5 }, 1.5: { level: 1 }, 649: { level: 500, xp: -9 } } });
  assert.deepEqual(p.caught, [1, 25, 649]);
  assert.deepEqual(p.shinies, [1, 25, 649]);
  assert.deepEqual(p.team, [25, 649, 1]);
  assert.deepEqual(p.bulba.visitors, [1, 25, 649]);
  assert.deepEqual(p.mons, { 649: { level: 100, xp: 0 } });
});

test('hostile: huge arrays and objects are bounded and fast', () => {
  const big = Array.from({ length: 1_000_000 }, (_, i) => (i % 700) + 1);
  const mons = {}; for (let i = 0; i < 200_000; i++) mons['k' + i] = { level: 5 };
  const plots = Array.from({ length: 100_000 }, (_, i) => ({ x: i, y: i, kind: 'flower', grown: true }));
  const t0 = Date.now();
  const p = V.cleanPlayer({ caught: big, team: big, favorites: big, mons, badges: big.map(String), garden: { plots }, legacy: { huge: 'x'.repeat(200_000), fine: 'y' } });
  assert.ok(Date.now() - t0 < 2000, 'took too long');
  assert.ok(p.caught.length <= 649);
  assert.equal(p.team.length, 6);
  assert.equal(p.favorites.length, 6);
  assert.equal(p.garden.plots.length, V.MAX_PLOTS);
  assert.ok(!('huge' in p.legacy), 'oversized legacy entry is refused');
  assert.equal(p.legacy.fine, 'y');
});

test('team and favorites must be owned; team order is kept', () => {
  const p = V.cleanPlayer({ caught: [3, 1, 2], team: [3, 9, 1], favorites: [2, 9] });
  assert.deepEqual(p.team, [3, 1]);
  assert.deepEqual(p.favorites, [2]);
});

test('petals: validation never lowers a legal value', () => {
  for (const n of [0, 1, 7, 12345, 99_999_999, 5_000_000_000]) {
    assert.equal(V.cleanPlayer({ bulba: { petals: n } }).bulba.petals, n);
  }
  assert.equal(V.cleanPlayer({ bulba: { stage: 3 } }).bulba.stage, 3);
  assert.equal(V.cleanPlayer({ bulba: { stage: 9 } }).bulba.stage, 3);
  assert.equal(V.cleanPlayer({ bulba: { petals: -4 } }).bulba.petals, 0);
});

test('cleanSave refuses non-v3 shapes', () => {
  assert.equal(V.cleanSave(null), null);
  assert.equal(V.cleanSave({ version: 2, players: { 1: {} } }), null);
  assert.equal(V.cleanSave({ version: 3, players: {} }), null);
  assert.equal(V.cleanSave({ version: 3, players: { 1: {} } }).players[2].profile, 'reader');
});

// ============================================================ migrate

test('fromV2 preserves every v2 field, player by player', () => {
  const v2 = v2Fixture();
  const v3 = M.fromV2(deepFreeze(clone(v2)), '2026-09-26');
  assert.equal(v3.version, 3);
  assert.equal(v3.created, '2026-09-26');
  for (const n of [1, 2]) {
    const a = v2.players[n], b = v3.players[n];
    assert.equal(b.name, a.name, 'name');
    assert.deepEqual(b.caught, [...a.caught].sort((x, y) => x - y), 'caught');
    assert.deepEqual(b.team, a.team, 'team order');
    for (const [id, m] of Object.entries(a.mons)) assert.deepEqual(b.mons[id], m, 'mons ' + id);
    assert.deepEqual(b.shinies, a.shinies, 'shinies');
    assert.deepEqual(b.nicks, a.nicks, 'nicks');
    assert.deepEqual(b.badges, a.badges, 'badges');
    assert.deepEqual(b.gyms.beaten, a.gyms.beaten, 'gyms.beaten');
    assert.deepEqual(b.champion, a.champion, 'champion');
    for (const [k, v] of Object.entries(a.stats)) assert.equal(b.stats[k], v, 'stats ' + k);
    for (const [k, v] of Object.entries(a.items)) assert.equal(b.items[k], v, 'items ' + k);
    assert.deepEqual(b.favorites, a.favorites.filter(id => a.caught.includes(id)), 'favorites');
    assert.deepEqual(b.legacy.quests, a.quests, 'quests kept in legacy');
    assert.deepEqual(b.legacy.settings, a.settings, 'settings kept in legacy');
    assert.deepEqual(b.bulba, V.freshPlayer().bulba);
  }
  assert.equal(v3.players[1].profile, 'reader');
  assert.equal(v3.players[2].profile, 'prereader');
  assert.deepEqual(v3.players[1].legacy.futureThing, { a: [1, 2, 3], b: 'kept' });
  assert.deepEqual(v3.players[1].legacy.gyms, { round: 2 });
  assert.equal(v3.players[1].stats.explores, 0);
});

test('fromV2 carries classic gym wins onto the Road', () => {
  const p = M.fromV2(v2Fixture()).players[1];
  assert.deepEqual(p.road.bloomed, [0, 1, 11]);
  assert.equal(p.road.chapter, 2);
  assert.ok(p.road.cleared['c0-t4'] && p.road.cleared['c1-t0'] && p.road.cleared['c11-t4']);
  assert.ok(!p.road.cleared['c1-t1']);
  assert.equal(Object.keys(p.road.cleared).length, 8, 'round-2 keys are not road progress');
});

test('fromV2: v3-only keys smuggled into a v2 save go to legacy, not to Bulba', () => {
  const v2 = v2Fixture();
  v2.players[2].bulba = { petals: 999999, stage: 3 };
  v2.players[2].profile = 'reader';
  const p = M.fromV2(v2).players[2];
  assert.equal(p.bulba.petals, 0);
  assert.equal(p.profile, 'prereader');
  assert.deepEqual(p.legacy.bulba, { petals: 999999, stage: 3 });
});

test('fromV2 of junk gives a fresh save', () => {
  for (const junk of [null, 5, 'x', {}, { version: 2 }, { version: 2, players: {} }, { version: 1, players: { 1: {} } }]) {
    const s = M.fromV2(junk);
    assert.equal(s.version, 3);
    assert.deepEqual(s.players[1], V.freshPlayer());
  }
});

test('mergeV2: union of everything, v3-only data untouched', () => {
  const v3 = M.fromV2({ version: 2, players: { 1: { name: 'G', caught: [1, 2, 3], team: [3, 1], mons: { 1: { level: 40, xp: 5 }, 2: { level: 10, xp: 50 } }, nicks: { 1: 'BULBY' }, badges: ['gym-rock'], stats: { battlesWon: 100 }, items: { masterBalls: 0 }, gyms: { beaten: { 'rock:0': true } } }, 2: { caught: [9] } } });
  v3.players[1].bulba = { petals: 50, stage: 2, stayStone: true, visitors: [4], accessory: null };
  v3.players[1].garden = { plots: [{ x: 1, y: 1, kind: 'flower', grown: true }], berries: 3 };
  v3.players[1].road.cleared['c0-t1'] = true;
  const v2 = { version: 2, players: { 1: { name: 'OTHER', caught: [2, 5], team: [5], mons: { 1: { level: 30, xp: 99 }, 2: { level: 10, xp: 60 }, 5: { level: 7, xp: 0 } }, nicks: { 1: 'NOPE', 5: 'FIVE' }, badges: ['gym-water'], stats: { battlesWon: 3, catches: 40 }, items: { masterBalls: 2 }, gyms: { beaten: { 'water:0': true } }, champion: { date: '2026-01-01', team: [5] }, settings: { junior: true } } } };
  const before = clone(v3);
  const out = M.mergeV2(deepFreeze(v3), deepFreeze(v2));
  const p = out.players[1];
  assert.deepEqual(clone(v3), before, 'input not mutated');
  assert.equal(p.name, 'G');
  assert.equal(p.profile, 'reader', 'profile stays v3');
  assert.deepEqual(p.caught, [1, 2, 3, 5]);
  assert.deepEqual(p.team, [3, 1], 'v3 team kept');
  assert.deepEqual(p.mons[1], { level: 40, xp: 5 }, 'higher level wins');
  assert.deepEqual(p.mons[2], { level: 10, xp: 60 }, 'same level: higher xp wins');
  assert.deepEqual(p.mons[5], { level: 7, xp: 0 });
  assert.deepEqual(p.nicks, { 1: 'BULBY', 5: 'FIVE' });
  assert.deepEqual(p.badges, ['gym-rock', 'gym-water']);
  assert.equal(p.stats.battlesWon, 100);
  assert.equal(p.stats.catches, 40);
  assert.equal(p.items.masterBalls, 2);
  assert.deepEqual(p.gyms.beaten, { 'rock:0': true, 'water:0': true });
  assert.deepEqual(p.champion, { date: '2026-01-01', team: [5], levels: {} });
  assert.ok(p.road.cleared['c0-t1'] && p.road.cleared['c0-t0'] && p.road.cleared['c1-t0']);
  assert.deepEqual(p.bulba, { petals: 50, stage: 2, stayStone: true, visitors: [4], accessory: null });
  assert.equal(p.garden.berries, 3);
  assert.deepEqual(out.players[2].caught, [9], 'player 2 untouched when v2 has none');
});

test('mergeV2 never removes: randomized property check', () => {
  const rng = R.seededRng(42);
  const ids = n => Array.from({ length: n }, () => 1 + Math.floor(rng() * 649));
  for (let round = 0; round < 150; round++) {
    const mk = () => {
      const caught = ids(Math.floor(rng() * 40));
      const mons = {}; for (const id of caught) mons[id] = { level: 1 + Math.floor(rng() * 100), xp: Math.floor(rng() * 500) };
      const beaten = {}; for (const g of ['rock', 'water', 'fire']) if (rng() < 0.5) beaten[g + ':' + Math.floor(rng() * 5)] = true;
      return { caught, mons, shinies: ids(3), badges: ['b' + Math.floor(rng() * 5)], gyms: { beaten }, stats: { catches: Math.floor(rng() * 90) }, nicks: rng() < 0.5 ? { [caught[0] || 1]: 'N' + round } : {} };
    };
    const v3 = M.fromV2({ version: 2, players: { 1: mk(), 2: mk() } });
    v3.players[2].bulba.petals = Math.floor(rng() * 1000);
    const v2 = { version: 2, players: { 1: mk(), 2: mk() } };
    const out = M.mergeV2(v3, v2);
    for (const n of [1, 2]) {
      const a = v3.players[n], b = M.playerFromV2(v2.players[n]), o = out.players[n];
      for (const id of [...a.caught, ...b.caught]) assert.ok(o.caught.includes(id), 'caught lost');
      for (const id of [...a.shinies, ...b.shinies]) assert.ok(o.shinies.includes(id), 'shiny lost');
      for (const k of [...a.badges, ...b.badges]) assert.ok(o.badges.includes(k), 'badge lost');
      for (const k of Object.keys({ ...a.gyms.beaten, ...b.gyms.beaten })) assert.ok(o.gyms.beaten[k], 'beaten lost');
      for (const k of Object.keys({ ...a.road.cleared, ...b.road.cleared })) assert.ok(o.road.cleared[k], 'road lost');
      for (const [id, m] of Object.entries(a.mons)) assert.ok(o.mons[id].level >= m.level, 'v3 level lowered');
      for (const [id, m] of Object.entries(b.mons)) assert.ok(o.mons[id].level >= m.level, 'v2 level lowered');
      for (const [id, nk] of Object.entries(a.nicks)) assert.equal(o.nicks[id], nk, 'v3 nick lost');
      for (const [k, v] of Object.entries(a.stats)) assert.ok(o.stats[k] >= v);
      assert.deepEqual(o.bulba, a.bulba, 'bulba touched');
    }
    assert.deepEqual(M.mergeV2(out, v2), out, 'merge is idempotent');
  }
});

test('mergeV2 with a missing or junk v2 leaves v3 as it was', () => {
  const v3 = M.fromV2(v2Fixture());
  v3.players[2].bulba.petals = 77;
  for (const junk of [null, undefined, 'x', {}, { version: 3, players: { 1: {} } }]) {
    assert.deepEqual(M.mergeV2(v3, junk), v3);
  }
});

test('applyV1 unions bare caught lists, never replaces', () => {
  const v3 = M.fromV2({ version: 2, players: { 1: { caught: [1, 2] } } });
  const out = M.applyV1(v3, { p1: [2, 3, 999, 'x'], p2: [7] });
  assert.deepEqual(out.players[1].caught, [1, 2, 3]);
  assert.deepEqual(out.players[2].caught, [7]);
  assert.equal(out.players[2].stats.catches, 1);
});

// ============================================================ save

test('load: v2 only -> migrated; v2 key is never written; one backup', () => {
  const ls = reset();
  const raw = JSON.stringify(v2Fixture());
  ls.pokedexos_save_v2 = raw;               // seeded directly (the guard blocks setItem)
  const save = S.load();
  assert.equal(S.getLoadInfo().source, 'v2');
  assert.equal(save.players[1].name, "GABE'S");
  assert.ok(S.persist(save));
  assert.ok(S.persist(save));
  assert.equal(ls.pokedexos_save_v2, raw, 'v2 byte-identical');
  const backups = Object.keys(ls).filter(k => k.startsWith('pokedexos_v2_backup_'));
  assert.equal(backups.length, 1);
  assert.equal(ls[backups[0]], raw);
  assert.match(backups[0], /^pokedexos_v2_backup_\d{4}-\d{2}-\d{2}$/);
  assert.equal(ls._q.writes.filter(k => k.startsWith('pokedexos_v2_backup_')).length, 1);
  // A later session never makes a second backup.
  S._resetForTests();
  S.load();
  S.persist(save);
  assert.equal(Object.keys(ls).filter(k => k.startsWith('pokedexos_v2_backup_')).length, 1);
});

test('load: v3 + v2 -> classic progress merges in on every boot', () => {
  const ls = reset();
  ls.pokedexos_save_v2 = JSON.stringify(v2Fixture());
  const v3 = M.fromV2(v2Fixture());
  v3.players[1].caught = v3.players[1].caught.filter(id => id !== 649);
  v3.players[2].bulba.petals = 30;
  ls.pokedexos_save_v3 = JSON.stringify(v3);
  const save = S.load();
  assert.equal(S.getLoadInfo().source, 'v3');
  assert.ok(S.getLoadInfo().mergedV2);
  assert.ok(save.players[1].caught.includes(649));
  assert.equal(save.players[2].bulba.petals, 30);
});

test('load: unreadable v3 is quarantined, not overwritten, and v2 rescues', () => {
  const ls = reset();
  ls.pokedexos_save_v2 = JSON.stringify(v2Fixture());
  ls.pokedexos_save_v3 = '{"version":3,"players":{"1":{"cau';
  const save = S.load();
  const info = S.getLoadInfo();
  assert.ok(info.quarantinedKey);
  assert.equal(ls[info.quarantinedKey], '{"version":3,"players":{"1":{"cau');
  assert.equal(info.source, 'v2');
  assert.equal(save.players[1].caught.length, 12);
  assert.ok(S.persist(save));
});

test('load: if quarantine itself fails, writing is blocked', () => {
  const ls = reset({ failKeys: ['pokedexos_save_v3_corrupt_'] });
  ls.pokedexos_save_v3 = 'not json';
  const save = S.load();
  assert.ok(S.getLoadInfo().blocked);
  assert.equal(S.persist(save), false);
  assert.equal(ls.pokedexos_save_v3, 'not json');
});

test('load: v15 legacy keys when nothing newer exists', () => {
  const ls = reset();
  ls.pokedex_caught_p1 = '[1,4,7,4]';
  ls.pokedex_caught_p2 = '[25]';
  const save = S.load();
  assert.equal(S.getLoadInfo().source, 'v1');
  assert.deepEqual(save.players[1].caught, [1, 4, 7]);
  assert.deepEqual(save.players[2].caught, [25]);
});

test('persist: quota error sheds the API cache and retries once', () => {
  const ls = reset({ quota: 4000 });
  ls.pokedexos_apicache_v2 = 'x'.repeat(3500);
  const save = V.freshSave();
  assert.ok(S.persist(save));
  assert.equal(ls.pokedexos_apicache_v2, undefined);
  assert.ok(ls.pokedexos_save_v3);
});

test('persist: returns false when the disk is truly full', () => {
  reset({ quota: 10 });
  assert.equal(S.persist(V.freshSave()), false);
});

test('petals only go up: persist ratchets a lowered in-memory value', () => {
  const ls = reset();
  const save = V.freshSave();
  save.players[2].bulba.petals = 40;
  save.players[2].bulba.stage = 2;
  S.persist(save);
  save.players[2].bulba.petals = 3;               // a bug somewhere
  save.players[2].bulba.stage = 1;
  S.persist(save);
  assert.equal(save.players[2].bulba.petals, 40, 'memory raised too');
  assert.equal(JSON.parse(ls.pokedexos_save_v3).players[2].bulba.petals, 40);
  assert.equal(JSON.parse(ls.pokedexos_save_v3).players[2].bulba.stage, 2);
  save.players[2].bulba.petals = 41;
  S.persist(save);
  assert.equal(JSON.parse(ls.pokedexos_save_v3).players[2].bulba.petals, 41);
});

test('codes: export -> import round-trip is exact', () => {
  reset();
  const save = M.fromV2(v2Fixture());
  save.players[2].bulba = { petals: 12, stage: 2, stayStone: true, visitors: [4, 7], accessory: 'flower-crown' };
  save.players[2].garden = { plots: [{ x: 1.5, y: 2, kind: 'flower', grown: 3 }], berries: 4, decor: [{ kind: 'pond', x: 0.25, y: 0.5 }] };
  save.players[1].road.cleared['r2-c3-t1'] = true;
  save.players[1].road.cleared['w23-t5'] = true;
  save.players[1].road.r2bloomed = [3];
  save.players[1].road.wildBloomed = [0, 23];
  save.players[1].road.roots = { opened: true, sanctums: { 'deep-well': true } };
  const code = S.exportCode(save);
  assert.match(code, /^SR3\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/);
  const back = S.importCode(code, V.freshSave());
  assert.deepEqual(back, save);
  // Unicode names survive the base64 trip.
  const u = V.freshSave(); u.players[1].name = 'ÉLODIE ★';
  assert.equal(S.decodeCode(S.exportCode(u)).data.players[1].name, 'ÉLODIE ★');
  // Whitespace / line breaks from a paste are tolerated.
  assert.deepEqual(S.decodeCode(code.slice(0, 20) + '\n  ' + code.slice(20)).data, save);
});

test('codes: a corrupted code is refused before anything is written', () => {
  const ls = reset();
  const code = S.exportCode(M.fromV2(v2Fixture()));
  const i = 30;
  const bad = code.slice(0, i) + (code[i] === 'A' ? 'B' : 'A') + code.slice(i + 1);
  assert.throws(() => S.importCode(bad, V.freshSave()), /CRC_MISMATCH|BAD_CODE/);
  for (const junk of ['', '   ', 'hello', 'SR3.abc', '{"v":9}', btoa('[1,2,3]'), 42, null]) {
    assert.throws(() => S.importCode(junk, V.freshSave()));
  }
  assert.equal(ls._q.writes.length, 0, 'no key written by a failed import');
});

test('codes: classic v2 export codes are accepted via fromV2', () => {
  reset();
  const classic = btoa(unescape(encodeURIComponent(JSON.stringify({ v: 2, save: v2Fixture() }))));
  const cur = V.freshSave();
  cur.players[2].bulba.petals = 9;
  const out = S.importCode(classic, cur);
  assert.deepEqual(out.players[1].caught, M.fromV2(v2Fixture()).players[1].caught);
  assert.equal(out.players[2].profile, 'prereader');
  assert.equal(out.players[2].bulba.petals, 9, 'Bulba survives a v2 import');
  // Classic SAVE FILE wrapper.
  const file = JSON.stringify({ pokedexOS: true, exported: 'x', code: classic });
  assert.equal(S.decodeCode(file).kind, 'v2');
});

test('codes: an empty v2 code cannot wipe both boys', () => {
  reset();
  const empty = btoa(JSON.stringify({ v: 2, save: { players: {} } }));
  assert.throws(() => S.importCode(empty, V.freshSave()), /EMPTY_SAVE/);
  const noCaught = btoa(JSON.stringify({ v: 2, save: { players: { 1: { name: 'X' } } } }));
  assert.throws(() => S.importCode(noCaught, V.freshSave()), /EMPTY_SAVE/);
  const emptyCaught = btoa(JSON.stringify({ v: 2, save: { players: { 1: { name: 'X', caught: [] }, 2: { caught: [] } } } }));
  assert.throws(() => S.importCode(emptyCaught, V.freshSave()), /EMPTY_SAVE/);
});

test('codes: v1 {p1,p2} codes union into the current save', () => {
  reset();
  const cur = M.fromV2({ version: 2, players: { 1: { caught: [1, 2] } } });
  const out = S.importCode(btoa(JSON.stringify({ p1: [2, 3], p2: [4] })), cur);
  assert.deepEqual(out.players[1].caught, [1, 2, 3]);
  assert.deepEqual(out.players[2].caught, [4]);
});

test('codes: hostile v3 code comes out clean', () => {
  reset();
  const evil = { v: 3, save: { version: 3, players: { 1: { name: '<script>x</script>', caught: [1, 99999, '<b>'], stats: { battlesWon: '<img onerror=1>' }, nicks: { 1: '"><svg>' } } } } };
  const json = JSON.stringify(evil);
  const code = 'SR3.' + S.toB64url(json) + '.' + S.crc32(json);
  const out = S.importCode(code, V.freshSave());
  for (const [path, s] of strings(out.players[1])) assert.ok(!/[<>"]/.test(s), path + ': ' + s);
  assert.deepEqual(out.players[1].caught, [1]);
  assert.equal(out.players[1].stats.battlesWon, 0);
});

test('import petals ratchet: an older code cannot lower Bulba', () => {
  reset();
  const old = V.freshSave(); old.players[2].bulba = { petals: 5, stage: 1, stayStone: false, visitors: [1] };
  const cur = V.freshSave(); cur.players[2].bulba = { petals: 80, stage: 3, stayStone: true, visitors: [7] };
  const out = S.importCode(S.exportCode(old), cur);
  assert.equal(out.players[2].bulba.petals, 80);
  assert.equal(out.players[2].bulba.stage, 3);
  assert.deepEqual(out.players[2].bulba.visitors, [1, 7]);
});

test('import snapshots _prev first; restore swaps and is itself undoable', () => {
  const ls = reset();
  const a = M.fromV2(v2Fixture());
  S.persist(a);
  const b = V.freshSave(); b.players[1].caught = [150];
  const out = S.importCode(S.exportCode(b), a);
  assert.deepEqual(JSON.parse(ls.pokedexos_save_v3_prev), V.withRollbackMirror(a));
  assert.deepEqual(V.cleanSave(JSON.parse(ls.pokedexos_save_v3_prev)), V.cleanSave(a), 'the mirror reads back as the same save');
  assert.ok(S.hasPrevious());
  const restored = S.restorePrevious(out);
  assert.deepEqual(restored.players[1].caught, a.players[1].caught);
  assert.deepEqual(JSON.parse(ls.pokedexos_save_v3_prev).players[1].caught, [150]);
});

test('import refuses to proceed without an undo slot', () => {
  reset({ failKeys: ['pokedexos_save_v3_prev'] });
  assert.throws(() => S.importCode(S.exportCode(V.freshSave()), M.fromV2(v2Fixture())), /SNAPSHOT_FAILED/);
});

test('crc32 matches the IEEE reference value', () => {
  assert.equal(S.crc32('123456789'), 'cbf43926');
  assert.equal(S.crc32(''), '00000000');
});

// ============================================================ store

test('store: lazy load, commit emits change, saveFailed on a full disk', () => {
  const ls = reset();
  ls.pokedexos_save_v2 = JSON.stringify(v2Fixture());
  ls.pokedexos_next_lastplayer = '2';
  assert.equal(store.current, 2);
  assert.equal(store.player().name, 'ART');
  const seen = [];
  const off = store.on('change', () => seen.push('change'));
  const off2 = store.on('saveFailed', d => seen.push('failed:' + d.reason));
  store.player().bulba.petals += 1;
  assert.ok(store.commit());
  assert.equal(JSON.parse(ls.pokedexos_save_v3).players[2].bulba.petals, 1);
  ls._q.quota = 10;
  assert.equal(store.commit(), false);
  assert.deepEqual(seen, ['change', 'failed:quota', 'change']);
  off(); off2();
  store.commit();
  assert.equal(seen.length, 3, 'off() unsubscribes');
  ls._q.quota = Infinity;
  store.setPlayer(1);
  assert.equal(ls.pokedexos_next_lastplayer, '1');
  assert.equal(store.player().name, "GABE'S");
});

test('store: a throwing listener does not break the bus', () => {
  reset();
  let got = 0;
  const offA = store.on('x', () => { throw new Error('boom'); });
  const offB = store.on('x', () => { got++; });
  const err = console.error; console.error = () => {};
  store.emit('x');
  console.error = err;
  assert.equal(got, 1);
  offA(); offB();
});

// ============================================================ rng & pace

test('rng: seeded streams repeat, stay in [0,1), and read ?seed=', () => {
  const a = R.seededRng(7), b = R.seededRng(7);
  for (let i = 0; i < 1000; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
  assert.notEqual(R.seededRng(1)(), R.seededRng(2)());
  assert.equal(R.rngFromUrl(''), Math.random);
  assert.equal(R.rngFromUrl('?seed=5')(), R.seededRng(5)());
  assert.equal(R.rngFromUrl('?seed=MOSSY-714')(), R.seededRng(R.hashSeed('MOSSY-714'))());
});

test('pace: wait resolves, fast mode collapses it, abort resolves it', async () => {
  P.initPace('?fast=1');
  assert.equal(P.PACE.fast, true);
  let t = Date.now(); await P.wait(5000); assert.ok(Date.now() - t < 200);
  P.initPace('');
  assert.equal(P.PACE.fast, false);
  t = Date.now(); await P.wait(30); assert.ok(Date.now() - t >= 25);
  const ac = new AbortController();
  t = Date.now(); const w = P.wait(5000, { signal: ac.signal }); ac.abort(); await w; assert.ok(Date.now() - t < 200);
});

test('pace: a pointerdown hurries the wait, and the listener is removed', async () => {
  const listeners = new Set();
  globalThis.document = {
    addEventListener: (t, fn) => { if (t === 'pointerdown') listeners.add(fn); },
    removeEventListener: (t, fn) => { listeners.delete(fn); },
  };
  try {
    P.initPace('');
    const t = Date.now();
    const w = P.wait(5000);
    assert.equal(listeners.size, 1);
    for (const fn of [...listeners]) fn();
    await w;
    assert.ok(Date.now() - t < 200);
    assert.equal(listeners.size, 0);
    await P.wait(1);
    assert.equal(listeners.size, 0);
  } finally { delete globalThis.document; }
});

// ============================================================ api

test('api: moves load and look up synchronously', async () => {
  assert.equal(await A.movesReady, true);
  assert.deepEqual(A.moveInfo('vine-whip'), { name: 'vine-whip', type: 'grass', power: MOVES['vine-whip'].p, damage_class: MOVES['vine-whip'].c });
  assert.equal(A.moveInfo('VINE WHIP').name, 'vine-whip');
  assert.equal(A.moveInfo('not-a-move'), null);
  assert.equal(A.moveInfo('__proto__'), null);
  assert.equal(A.moveInfo('constructor'), null);
});

test('api: getMon projects, validates and caches (memory, no IDB in node)', async () => {
  A._resetForTests();
  fetchLog.length = 0;
  const m = await A.getMon(1);
  assert.deepEqual(Object.keys(m).sort(), ['baseExp', 'baseStats', 'captureRate', 'id', 'moveNames', 'name', 'types', 'v'].sort());
  assert.equal(m.name, 'BULBASAUR');
  assert.deepEqual(m.types, ['grass', 'poison'], 'slot order');
  assert.deepEqual(m.baseStats, { hp: 45, atk: 49, def: 49, spatk: 65, spdef: 65, spe: 45 });
  assert.equal(m.captureRate, 45);
  assert.ok(!m.moveNames.includes('<script>'));
  const n = fetchLog.length;
  m.types.push('fire');                       // mutating a copy must not poison the cache
  const again = await A.getMon(1);
  assert.equal(fetchLog.length, n, 'served from memory');
  assert.deepEqual(again.types, ['grass', 'poison']);
  await Promise.all([A.getMon(2), A.getMon(2), A.getMon(2)]);
  assert.equal(fetchLog.filter(u => u.endsWith('/pokemon/2')).length, 1, 'in-flight requests are shared');
  assert.equal((await A.getMon(122)).name, 'MR. MIME');
  for (const bad of [0, 650, -1, 1.5, 'x', null]) await assert.rejects(A.getMon(bad), /BAD_ID/);
});

test('api: buildFighter is deterministic per seed and battle-shaped', async () => {
  const f1 = await A.buildFighter(1, 20, { seed: 1234 });
  const f2 = await A.buildFighter(1, 20, { seed: 1234 });
  assert.deepEqual(f1, f2);
  assert.equal(f1.id, 1);
  assert.equal(f1.level, 20);
  assert.equal(f1.name, 'BULBASAUR');
  assert.deepEqual(f1.types, ['grass', 'poison']);
  assert.deepEqual(Object.keys(f1.stats).sort(), ['atk', 'def', 'hp', 'spatk', 'spdef', 'spe']);
  assert.ok(f1.stats.hp > 20);
  assert.ok(f1.moves.length >= 1 && f1.moves.length <= 4);
  for (const mv of f1.moves) {
    assert.ok(mv.power > 0 && mv.type && mv.damage_class !== 'status', JSON.stringify(mv));
    assert.equal(mv.label, mv.name.replace(/-/g, ' ').toUpperCase());
  }
  assert.equal(f1.moves[0].type, 'grass', 'STAB move leads');
  const lv = await A.buildFighter(1, 999);
  assert.equal(lv.level, 100);
});

test('api: buildFighter output drives createBattle when it is present', async () => {
  let createBattle;
  try { ({ createBattle } = await import('../battle/createBattle.js')); } catch (e) { return; }
  const me = await A.buildFighter(1, 10, { seed: 1 });
  const foe = await A.buildFighter(4, 10);
  const b = createBattle({ myTeam: [me], enemyTeam: [foe], profile: 'reader', rng: R.seededRng(3), moveLookup: A.moveInfo });
  const ev = await b.choose({ kind: 'move', index: 0 });
  assert.ok(Array.isArray(ev) && ev.length > 0);
});

// ============================================================ Road v3 fields, picture-lock, family, gifts

test('road: seeds, guardians, hatched and rival are kept when legal', () => {
  const road = { chapter: 3, cleared: { 'c0-t0': true }, bloomed: [0, 1], seeds: 7, guardians: { 0: true, 2: true }, hatched: true, rival: { wins: 4, losses: 2, last: 2 }, r2bloomed: [], wildBloomed: [], roots: { opened: false, sanctums: {} } };
  const p = V.cleanPlayer({ road });
  assert.deepEqual(p.road, road);
  assert.deepEqual(V.cleanPlayer(clone(p)), p, 'idempotent');
});

test('road: hostile seeds / guardians / hatched / rival are clamped or cleaned', () => {
  const json = `{"road":{"seeds":500,"guardians":{"0":true,"3":1,"11":"yes","12":true,"-1":true,"x":true,"5":false,"__proto__":{"polluted":1},"constructor":true},"hatched":"true","rival":{"wins":-4,"losses":"<b>9</b>","last":99}}}`;
  const p = V.cleanPlayer(JSON.parse(json));
  assert.equal(p.road.seeds, 99);
  assert.deepEqual(p.road.guardians, { 0: true, 3: true, 11: true });
  assert.equal(Object.getPrototypeOf(p.road.guardians), Object.prototype);
  assert.equal(({}).polluted, undefined);
  assert.equal(p.road.hatched, false, 'only a real true hatches');
  assert.deepEqual(p.road.rival, { wins: 0, losses: 0, last: 11 });
  for (const [seeds, want] of [[-3, 0], ['x', 0], [2.7, 2], [null, 0], [Infinity, 0], ['42', 42]]) {
    assert.equal(V.cleanPlayer({ road: { seeds } }).road.seeds, want, String(seeds));
  }
  for (const [last, want] of [[-5, -1], [-1, -1], [0, 0], ['x', -1], [null, 0], [11, 11], [12, 11]]) {
    assert.equal(V.cleanPlayer({ road: { rival: { last } } }).road.rival.last, want, String(last));
  }
  assert.deepEqual(V.cleanPlayer({ road: { rival: 'x', guardians: [1, 2] } }).road.rival, { wins: 0, losses: 0, last: -1 });
  assert.equal(V.cleanPlayer({ road: { rival: { wins: 1e12 } } }).road.rival.wins, V.MAX_FAMILY_COUNT);
});

test('lock: exactly three valid dex ids, or null', () => {
  assert.deepEqual(V.cleanLock({ pics: [1, 25, 25] }), { pics: [1, 25, 25] }, 'repeats allowed, order kept');
  assert.deepEqual(V.cleanLock({ pics: ['4', 7, 649] }), { pics: [4, 7, 649] });
  for (const bad of [null, undefined, 'x', [1, 2, 3], {}, { pics: [1, 2] }, { pics: [1, 2, 3, 4] }, { pics: [0, 1, 2] },
    { pics: [1, 2, 650] }, { pics: [1, 2, '<b>'] }, { pics: [1, 2, 2.5] }, { pics: 'abc' }]) {
    assert.equal(V.cleanLock(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(V.cleanPlayer({ lock: { pics: [1, 4, 7], extra: '<x>' } }).lock, { pics: [1, 4, 7] });
  assert.equal(V.cleanPlayer({ lock: { pics: [1, 4] } }).lock, null);
  const p = V.cleanPlayer({ lock: { pics: [1, 4, 7] } });
  assert.ok(V.lockOpens(p, [1, 4, 7]));
  assert.ok(V.lockOpens(p, ['1', '4', '7']));
  assert.ok(!V.lockOpens(p, [1, 7, 4]));
  assert.ok(!V.lockOpens(p, [1, 4]));
  assert.ok(!V.lockOpens(p, null));
  assert.ok(V.lockOpens(V.freshPlayer(), []), 'no lock -> always open');
});

test('family and gifts live on the save root and are cleaned', () => {
  const json = `{"version":3,"created":"2026-01-01","players":{"1":{"caught":[1]},"2":{}},
    "family":{"postcards":1e12,"lastPostcard":"<b>","versus":{"gabe":-2,"dad":"7","art":9,"__proto__":{"polluted":1}},"extra":1},
    "gifts":{"toReader":500,"toArt":3}}`;
  const s = V.cleanSave(JSON.parse(json));
  assert.deepEqual(s.family, { postcards: V.MAX_FAMILY_COUNT, lastPostcard: null, versus: { gabe: 0, dad: 7 }, challenge: { wins: [] } });
  assert.deepEqual(s.gifts, { toReader: 99 });
  assert.equal(({}).polluted, undefined);
  const missing = V.cleanSave({ version: 3, players: { 1: {} } });
  assert.deepEqual(missing.family, V.freshFamily(), 'an older v3 save gets defaults');
  assert.deepEqual(missing.gifts, V.freshGifts());
  for (const [v, want] of [[-1, 0], ['x', 0], [3.9, 3], [99, 99], [100, 99]]) assert.equal(V.cleanGifts({ toReader: v }).toReader, want);
  const good = { version: 3, created: '2026-01-01', players: { 1: V.freshPlayer(), 2: V.freshPlayer() },
    family: { postcards: 3, lastPostcard: '2026-09-20', versus: { gabe: 5, dad: 4 }, challenge: { wins: [{ code: 'MOSSY-714', who: 'dad', date: '2026-09-20' }] } }, gifts: { toReader: 2 } };
  assert.deepEqual(V.cleanSave(clone(good)), good, 'legal values kept exactly');
});

test('fromV2 defaults every new field; v2 lookalike keys go to legacy', () => {
  const v2 = v2Fixture();
  v2.players[1].lock = { pics: [1, 2, 3] };
  v2.players[1].road = { seeds: 50, hatched: true };
  v2.family = { postcards: 9 };
  const s = M.fromV2(v2);
  assert.deepEqual(s.family, V.freshFamily());
  assert.deepEqual(s.gifts, V.freshGifts());
  assert.equal(s.players[1].lock, null);
  assert.equal(s.players[1].road.seeds, 0);
  assert.equal(s.players[1].road.hatched, false);
  assert.deepEqual(s.players[1].road.rival, { wins: 0, losses: 0, last: -1 });
  assert.deepEqual(s.players[1].legacy.lock, { pics: [1, 2, 3] });
  assert.deepEqual(s.players[1].legacy.road, { seeds: 50, hatched: true });
});

test('mergeV2 / applyV1 carry the new fields through untouched', () => {
  const v3 = M.fromV2(v2Fixture());
  v3.players[1].road = { ...v3.players[1].road, seeds: 3, guardians: { 0: true }, hatched: true, rival: { wins: 2, losses: 1, last: 0 } };
  v3.players[1].lock = { pics: [1, 25, 6] };
  v3.family = { postcards: 4, lastPostcard: '2026-09-01', versus: { gabe: 3, dad: 5 }, challenge: { wins: [{ code: 'ZAPPY-001', who: 'reader', date: '2026-09-02' }] } };
  v3.gifts = { toReader: 6 };
  const before = clone(v3);
  const v2 = v2Fixture();
  v2.players[1].gyms.beaten['fire:4'] = true;          // classic progress that DOES change the road
  v2.players[1].lock = null; v2.players[1].road = { seeds: 0, hatched: false };
  const out = M.mergeV2(deepFreeze(v3), deepFreeze(v2));
  assert.deepEqual(clone(v3), before, 'input not mutated');
  const r = out.players[1].road;
  assert.equal(r.seeds, 3); assert.deepEqual(r.guardians, { 0: true }); assert.equal(r.hatched, true);
  assert.deepEqual(r.rival, { wins: 2, losses: 1, last: 0 });
  assert.ok(r.bloomed.includes(8), 'classic fire gym still blooms chapter 8');
  assert.deepEqual(out.players[1].lock, { pics: [1, 25, 6] });
  assert.deepEqual(out.family, before.family);
  assert.deepEqual(out.gifts, before.gifts);
  assert.deepEqual(M.mergeV2(out, v2), out, 'idempotent');
  for (const junk of [null, 'x', {}]) {
    const o = M.mergeV2(before, junk);
    assert.deepEqual(o.family, before.family); assert.deepEqual(o.gifts, before.gifts);
    assert.deepEqual(o.players[1].road, before.players[1].road);
  }
  const v1 = M.applyV1(before, { p1: [151] });
  assert.deepEqual(v1.family, before.family); assert.deepEqual(v1.gifts, before.gifts);
  assert.deepEqual(v1.players[1].lock, before.players[1].lock);
  assert.equal(v1.players[1].road.seeds, 3);
});

test('helpers: addGift / takeGift / addPostcard / addVersusWin clamp and never throw', () => {
  const s = V.freshSave('2026-01-01');
  assert.equal(V.addGift(s), 1);
  assert.equal(V.addGift(s, 5), 6);
  assert.equal(V.addGift(s, 1000), 99, 'capped');
  assert.equal(V.addGift(s, -5), 99, 'a negative add is a no-op');
  s.gifts.toReader = 1;
  assert.equal(V.takeGift(s), true);
  assert.equal(s.gifts.toReader, 0);
  assert.equal(V.takeGift(s), false, 'nothing to open');
  assert.equal(s.gifts.toReader, 0, 'never negative');
  delete s.gifts; assert.equal(V.addGift(s), 1, 'works on an older save with no gifts{}');
  assert.equal(V.addPostcard(s, '2026-09-26'), 1);
  assert.equal(s.family.lastPostcard, '2026-09-26');
  assert.equal(V.addPostcard(s, 'junk'), 2);
  assert.equal(s.family.lastPostcard, '2026-09-26', 'a junk date is ignored');
  assert.deepEqual(V.addVersusWin(s, 'gabe'), { gabe: 1, dad: 0 });
  assert.deepEqual(V.addVersusWin(s, 'dad'), { gabe: 1, dad: 1 });
  assert.equal(V.addVersusWin(s, '__proto__'), null);
  assert.deepEqual(s.family.versus, { gabe: 1, dad: 1 });
  for (const junk of [null, 5, 'x']) {
    assert.equal(V.addGift(junk), 0); assert.equal(V.takeGift(junk), false);
    assert.equal(V.addPostcard(junk), 0); assert.equal(V.addVersusWin(junk, 'gabe'), null);
  }
});

test('codes: new fields round-trip; an import can raise family/gifts but never lower them', () => {
  reset();
  const save = M.fromV2(v2Fixture());
  save.players[1].road.seeds = 5; save.players[1].road.guardians = { 1: true }; save.players[1].road.hatched = true;
  save.players[1].road.rival = { wins: 1, losses: 3, last: 1 };
  save.players[1].lock = { pics: [6, 6, 25] };
  save.family = { postcards: 2, lastPostcard: '2026-08-01', versus: { gabe: 1, dad: 2 }, challenge: { wins: [{ code: 'MOSSY-714', who: 'dad', date: '2026-08-01' }] } };
  save.gifts = { toReader: 3 };
  assert.deepEqual(S.importCode(S.exportCode(save), V.freshSave()), save, 'exact round trip');

  const cur = clone(save);
  cur.family = { postcards: 9, lastPostcard: '2026-09-20', versus: { gabe: 0, dad: 8 }, challenge: { wins: [{ code: 'MOSSY-714', who: 'reader', date: '2026-09-20' }] } };
  cur.gifts = { toReader: 1 };
  const out = S.importCode(S.exportCode(save), cur);
  assert.deepEqual(out.family, { postcards: 9, lastPostcard: '2026-09-20', versus: { gabe: 1, dad: 8 },
    challenge: { wins: [{ code: 'MOSSY-714', who: 'dad', date: '2026-08-01' }, { code: 'MOSSY-714', who: 'reader', date: '2026-09-20' }] } },
    'challenge wins from both sides are kept');
  assert.deepEqual(out.gifts, { toReader: 3 });
  const classic = btoa(unescape(encodeURIComponent(JSON.stringify({ v: 2, save: v2Fixture() }))));
  const out2 = S.importCode(classic, cur);
  assert.deepEqual(out2.family, cur.family, 'a classic code has no family and cannot erase ours');
  assert.deepEqual(out2.gifts, cur.gifts);
});

test('store: gift, postcard, versus and lock helpers commit to disk', () => {
  const ls = reset();
  ls.pokedexos_save_v2 = JSON.stringify(v2Fixture());
  const disk = () => JSON.parse(ls.pokedexos_save_v3);
  assert.equal(store.giftCount(), 0);
  assert.equal(store.addGift(), 1);
  assert.equal(disk().gifts.toReader, 1);
  assert.equal(store.takeGift(), true);
  assert.equal(store.takeGift(), false);
  assert.equal(disk().gifts.toReader, 0);
  assert.equal(store.addPostcard('2026-09-26'), 1);
  assert.deepEqual(disk().family.lastPostcard, '2026-09-26');
  assert.deepEqual(store.addVersusWin('dad'), { gabe: 0, dad: 1 });
  assert.equal(store.addVersusWin('art'), null);
  assert.deepEqual(store.setLock(1, [1, 4, 7]), { pics: [1, 4, 7] });
  assert.deepEqual(store.setLock(1, [1, 4]), { pics: [1, 4, 7] }, 'a bad lock changes nothing');
  assert.deepEqual(disk().players[1].lock, { pics: [1, 4, 7] });
  assert.ok(store.lockOpens(1, [1, 4, 7]));
  assert.ok(!store.lockOpens(1, [7, 4, 1]));
  assert.ok(store.lockOpens(2, []), 'player 2 has no lock');
  assert.equal(store.setLock(1, null), null);
  assert.equal(disk().players[1].lock, null);
  // A reboot (v3 + v2 merge) keeps all of it.
  store.addGift(2); store.addPostcard('2026-09-27');
  S._resetForTests(); store.save = null;
  assert.equal(store.giftCount(), 2);
  assert.equal(store.save.family.postcards, 2);
  assert.deepEqual(store.save.family.versus, { gabe: 0, dad: 1 });
});

// ============================================================ batch 3: DAD'S CHALLENGE wins (family.challenge)
test('challenge wins: validated, de-duplicated, capped, never thrown', () => {
  const junk = { wins: [
    { code: 'MOSSY-714', who: 'dad', date: '2026-09-02' },
    { code: 'MOSSY-714', who: 'dad', date: '2026-09-01' },        // same code+who: earliest date kept
    { code: 'mossy-714', who: 'dad', date: '2026-09-01' },        // not canonical
    { code: 'MOSSY-7140', who: 'dad', date: '2026-09-01' },
    { code: '<img>-123', who: 'dad', date: '2026-09-01' },
    { code: 'ZAPPY-003', who: 'art', date: '2026-09-01' },        // unknown side
    { code: 'ZAPPY-003', who: 'reader', date: 'yesterday' },      // bad date
    { code: 'ZAPPY-003', who: 'reader', date: '2026-08-30' },
    null, 5, 'x', { __proto__: { code: 'X' } },
  ] };
  assert.deepEqual(V.cleanChallenge(junk).wins, [
    { code: 'ZAPPY-003', who: 'reader', date: '2026-08-30' },
    { code: 'MOSSY-714', who: 'dad', date: '2026-09-01' },
  ]);
  for (const j of [null, 1, 'x', [], { wins: 'x' }, { wins: { 0: 1 } }]) assert.deepEqual(V.cleanChallenge(j), { wins: [] });
  const many = { wins: Array.from({ length: 80 }, (_, i) => ({ code: 'MOSSY-' + String(i).padStart(3, '0'), who: 'dad', date: '2026-09-' + String(1 + (i % 28)).padStart(2, '0') })) };
  const kept = V.cleanChallenge(many).wins;
  assert.equal(kept.length, V.MAX_CHALLENGE_WINS);
  assert.equal(kept[kept.length - 1].date, '2026-09-28', 'the newest are kept');
});

test('challenge wins: addChallengeWin + store wrapper; carried by mergeV2', () => {
  const s = V.freshSave('2026-01-01');
  assert.deepEqual(V.addChallengeWin(s, 'MOSSY-714', 'dad', '2026-09-01'), [{ code: 'MOSSY-714', who: 'dad', date: '2026-09-01' }]);
  assert.equal(V.addChallengeWin(s, 'MOSSY-714', 'dad', '2026-09-05').length, 1, 'a repeat win is not doubled');
  assert.equal(V.addChallengeWin(s, 'MOSSY-714', 'reader', '2026-09-05').length, 2);
  assert.equal(V.addChallengeWin(s, 'bad', 'dad'), null);
  assert.equal(V.addChallengeWin(s, 'MOSSY-714', '__proto__'), null);
  for (const j of [null, 5, 'x']) assert.equal(V.addChallengeWin(j, 'MOSSY-714', 'dad'), null);
  delete s.family;
  assert.equal(V.addChallengeWin(s, 'SCALY-100', 'dad').length, 1, 'works on an older save with no family{}');
  const v3 = M.fromV2(v2Fixture());
  V.addChallengeWin(v3, 'PEBBLY-001', 'reader', '2026-09-03');
  const out = M.mergeV2(v3, v2Fixture());
  assert.deepEqual(out.family.challenge.wins, [{ code: 'PEBBLY-001', who: 'reader', date: '2026-09-03' }]);
  reset();
  assert.equal(store.addChallengeWin('nope', 'dad'), null);
  assert.equal(store.addChallengeWin('CROWN-042', 'dad').length, 1);
  assert.deepEqual(store.challengeWins().map(w => w.code), ['CROWN-042']);
});

// ---- the classic save is merged only when it changes ----
// mergeV2 is union-only. Re-merging an UNCHANGED classic save on every boot
// resurrected a favourite removed here, because after the switchover nothing
// edits v2 any more.
test('save: an unchanged classic save is not re-merged (a removed favourite stays removed)', () => {
  const ls = reset();
  const v2 = v2Fixture();
  v2.players[1].favorites = [v2.players[1].caught[0]];
  ls.pokedexos_save_v2 = JSON.stringify(v2);   // seeded directly: the guard forbids setItem on v2
  let save = S.load();
  assert.ok(S.persist(save));
  const fav = v2.players[1].caught[0];
  assert.ok(save.players[1].favorites.includes(fav));
  save.players[1].favorites = [];
  assert.ok(S.persist(save));
  S._resetForTests();
  save = S.load();
  assert.deepEqual(save.players[1].favorites, [], 'the removed star must not come back');
  assert.equal(S.getLoadInfo().mergedV2, false);
  // ...but new progress in the classic app still arrives.
  v2.players[1].caught.push(151);
  ls.pokedexos_save_v2 = JSON.stringify(v2);   // seeded directly: the guard forbids setItem on v2
  S._resetForTests();
  save = S.load();
  assert.ok(save.players[1].caught.includes(151), 'a new classic catch merges in');
  assert.equal(S.getLoadInfo().mergedV2, true);
  // and v2 itself is still never written
  assert.equal(ls.getItem(S.KEYS.v2), JSON.stringify(v2));
});

test('save: a CHANGED classic save still does not bring back a removed star or a cleared nickname', () => {
  const ls = reset();
  const v2 = v2Fixture();
  const [a, b] = v2.players[1].caught;
  v2.players[1].favorites = [a, b];
  v2.players[1].nicks = { [a]: 'DRAGGY', [b]: 'KEEPME' };
  ls.pokedexos_save_v2 = JSON.stringify(v2);
  let save = S.load();
  assert.ok(S.persist(save));
  assert.ok(save.players[1].favorites.includes(a) && save.players[1].nicks[a] === 'DRAGGY');
  save.players[1].favorites = save.players[1].favorites.filter(id => id !== a);
  delete save.players[1].nicks[a];
  assert.ok(S.persist(save));
  // a classic catch changes v2 (new fingerprint): the merge runs again...
  v2.players[1].caught.push(151);
  v2.players[1].favorites.push(151);
  v2.players[1].nicks[151] = 'MEWMEW';
  ls.pokedexos_save_v2 = JSON.stringify(v2);
  S._resetForTests();
  save = S.load();
  assert.equal(S.getLoadInfo().mergedV2, true);
  assert.ok(save.players[1].caught.includes(151));
  assert.ok(!save.players[1].favorites.includes(a), 'the removed star stays removed');
  assert.equal(save.players[1].nicks[a], undefined, 'the cleared nickname stays cleared');
  assert.ok(save.players[1].favorites.includes(b) && save.players[1].nicks[b] === 'KEEPME');
  // ...and what is NEW in the classic app still comes across
  assert.ok(save.players[1].favorites.includes(151), 'a new classic star arrives');
  assert.equal(save.players[1].nicks[151], 'MEWMEW', 'a new classic nickname arrives');
});

test('save: before v20.1.2 recorded marks, the first classic backup stands in', () => {
  const ls = reset();
  const v2 = v2Fixture();
  const [a] = v2.players[1].caught;
  v2.players[1].favorites = [a];
  ls.pokedexos_save_v2 = JSON.stringify(v2);
  let save = S.load();
  assert.ok(S.persist(save));
  save.players[1].favorites = [];
  assert.ok(S.persist(save));
  ls.removeItem(S.KEYS.v2marks);                 // a device that ran v20.1.1
  v2.players[1].caught.push(151);
  ls.pokedexos_save_v2 = JSON.stringify(v2);
  S._resetForTests();
  save = S.load();
  assert.ok(!save.players[1].favorites.includes(a), 'the backup knew the star: not new, not resurrected');
});

test('save: a failed write leaves the classic save un-fingerprinted so the merge retries', () => {
  const ls = reset();
  ls.pokedexos_save_v2 = JSON.stringify(v2Fixture());
  S.load();
  assert.equal(ls.getItem(S.KEYS.v2seen), null, 'nothing recorded until a v3 write succeeds');
});

// ------------------------------------------------------------ batch 4: ROUND 2, Wild Chapters, Roots, decor, accessory

test('road: ROUND 2 and Wild Chapter cleared keys, r2bloomed, wildBloomed, roots', () => {
  const road = {
    cleared: {
      'c0-t0': true, 'r2-c0-t0': true, 'r2-c11-t4': true, 'w0-t0': true, 'w23-t5': true,
      // rejected:
      'r2-c12-t0': true, 'r2-c01-t0': true, 'w24-t0': true, 'w0-t6': true, 'w01-t0': true, 'w3-t10': true,
      'r2-c0-t0 ': true, 'x0-t0': true, 'r2-w0-t0': true, 'c12-t0': true, 'w5-t1': false, 'r2-c2-t2': 0,
    },
    r2bloomed: [11, '3', 3, 12, -1, 'x', 1.5, null],
    wildBloomed: [23, 0, 24, '7', '<b>', 7],
    roots: { opened: true, sanctums: { 'deep-well': true, 'moss_cave': 1, 'no': false, '<svg>': true, ['a'.repeat(25)]: true, 'a:b': true } },
  };
  const r = V.cleanRoad(JSON.parse(JSON.stringify(road)));
  assert.deepEqual(Object.keys(r.cleared).sort(), ['c0-t0', 'r2-c0-t0', 'r2-c11-t4', 'w0-t0', 'w23-t5']);
  assert.deepEqual(r.r2bloomed, [3, 11]);
  assert.deepEqual(r.wildBloomed, [0, 7, 23]);
  assert.deepEqual(r.roots, { opened: true, sanctums: { 'deep-well': true, moss_cave: true, 'a:b': true } });
  assert.deepEqual(V.cleanRoad(clone(r)), r, 'idempotent');
  assert.ok(V.isClearedKey('w12-t3') && V.isClearedKey('r2-c5-t0') && !V.isClearedKey('__proto__'));
});

test('road: hostile roots are cleaned, never thrown', () => {
  for (const roots of [null, 7, 'open', [], { opened: 'true' }, { opened: 1, sanctums: [1, 2] }, { sanctums: 'x' }]) {
    assert.deepEqual(V.cleanRoad({ roots }).roots, { opened: false, sanctums: {} });
  }
  const many = {};
  for (let i = 0; i < 200; i++) many['s' + i] = true;
  assert.equal(Object.keys(V.cleanRoad({ roots: { sanctums: many } }).roots.sanctums).length, V.MAX_SANCTUMS);
  const poisoned = JSON.parse('{"sanctums":{"__proto__":true,"constructor":true,"ok":true}}');
  const out = V.cleanRoad({ roots: poisoned }).roots;
  assert.deepEqual(Object.keys(out.sanctums), ['ok']);
  assert.equal(({}).polluted, undefined);
});

test('garden.decor: clamped, capped at 40, junk dropped; accessory is null or a safe key', () => {
  const X = '<img src=x>';
  const g = V.cleanGarden({ decor: [
    { kind: 'pond', x: 0.5, y: 0.25 }, { kind: 'rock', x: -3, y: 9 }, { kind: 'bench', x: '0.1', y: 0.123456 },
    { kind: X, x: 0.1, y: 0.1 }, { kind: 'a'.repeat(25), x: 0, y: 0 }, { kind: 'lamp', x: NaN, y: 0 },
    { kind: 'lamp', x: null, y: 0 }, { kind: 'lamp', x: {}, y: 0 }, { kind: '__proto__', x: 0, y: 0 }, null, 'pond', [1, 2],
  ] });
  assert.deepEqual(g.decor, [{ kind: 'pond', x: 0.5, y: 0.25 }, { kind: 'rock', x: 0, y: 1 }, { kind: 'bench', x: 0.1, y: 0.1235 }]);
  const lots = Array.from({ length: 100 }, (_, i) => ({ kind: 'flag', x: i / 100, y: 0 }));
  const capped = V.cleanGarden({ decor: lots }).decor;
  assert.equal(capped.length, V.MAX_DECOR);
  assert.deepEqual(capped[0], { kind: 'flag', x: 0, y: 0 }, 'the first 40 are kept');
  assert.deepEqual(V.cleanGarden({ decor: 'lots' }).decor, []);
  for (const bad of [X, 42, true, {}, 'a'.repeat(25), '__proto__', '']) assert.equal(V.cleanBulba({ accessory: bad }).accessory, null);
  assert.equal(V.cleanBulba({ accessory: 'flower-crown' }).accessory, 'flower-crown');
  const p = V.cleanPlayer({ garden: { decor: [{ kind: 'pond', x: 0.5, y: 0.5 }] }, bulba: { accessory: 'bow' } });
  assert.deepEqual(V.cleanPlayer(clone(p)), p, 'idempotent');
  assert.ok(V.hasProgress(p), 'a garden with decor is worth protecting');
});

test('decor helpers: placeDecor / moveDecor / setAccessory clamp and never remove', () => {
  const p = V.freshPlayer();
  assert.deepEqual(V.placeDecor(p, 'pond', 0.3, 0.7), { kind: 'pond', x: 0.3, y: 0.7 });
  assert.deepEqual(V.placeDecor(p, 'rock', 2, -1), { kind: 'rock', x: 1, y: 0 }, 'clamped into the garden');
  for (const [k, x, y] of [['<b>', 0, 0], ['pond', NaN, 0], ['pond', '0.5', 0.5], [null, 0, 0]]) assert.equal(V.placeDecor(p, k, x, y), null);
  assert.equal(p.garden.decor.length, 2);
  assert.deepEqual(V.moveDecor(p, 0, 0.9, 0.1), { kind: 'pond', x: 0.9, y: 0.1 });
  assert.deepEqual(p.garden.decor[0], { kind: 'pond', x: 0.9, y: 0.1 });
  for (const i of [-1, 2, 1.5, '0', null]) assert.equal(V.moveDecor(p, i, 0.5, 0.5), null);
  assert.equal(V.moveDecor(p, 0, Infinity, 0.5), null);
  assert.equal(p.garden.decor.length, 2, 'nothing removed');
  while (p.garden.decor.length < V.MAX_DECOR) V.placeDecor(p, 'flag', 0.5, 0.5);
  assert.equal(V.placeDecor(p, 'flag', 0.5, 0.5), null, 'full garden: nothing placed, nothing pushed out');
  assert.deepEqual(p.garden.decor[0], { kind: 'pond', x: 0.9, y: 0.1 });
  assert.equal(V.setAccessory(p, 'bow'), 'bow');
  assert.equal(V.setAccessory(p, '<svg>'), 'bow', 'junk changes nothing');
  assert.equal(V.setAccessory(p, null), null);
  assert.equal(p.bulba.accessory, null);
  assert.equal(V.placeDecor(null, 'pond', 0, 0), null);
  assert.equal(V.setAccessory(undefined, 'bow'), null);
  const q = V.freshPlayer();
  assert.equal(V.openRoots(q), true);
  assert.equal(V.addSanctum(q, 'deep-well'), true);
  assert.equal(V.addSanctum(q, '<x>'), false);
  assert.deepEqual(q.road.roots, { opened: true, sanctums: { 'deep-well': true } });
});

test('unionDecor keeps every current decoration and adds only the extra copies per kind', () => {
  const cur = [{ kind: 'pond', x: 0.5, y: 0.5 }, { kind: 'pond', x: 0.5, y: 0.5 }, { kind: 'rock', x: 0.1, y: 0.1 }];
  const inc = [{ kind: 'pond', x: 0.5004, y: 0.4999 }, { kind: 'rock', x: 0.2, y: 0.1 }, { kind: 'bench', x: 0.1, y: 0.1 }];
  // The rock at 0.2 is the same rock, moved since: never doubled.
  assert.deepEqual(V.unionDecor(cur, inc), [...cur, { kind: 'bench', x: 0.1, y: 0.1 }]);
  const two = [{ kind: 'rock', x: 0.7, y: 0.7 }, { kind: 'rock', x: 0.1, y: 0.1 }];
  assert.deepEqual(V.unionDecor(cur, two), [...cur, { kind: 'rock', x: 0.7, y: 0.7 }], 'a real extra copy joins, the matching one does not');
  const full = Array.from({ length: 40 }, (_, i) => ({ kind: 'flag', x: i / 40, y: 0 }));
  assert.deepEqual(V.unionDecor(full, [{ kind: 'pond', x: 0, y: 0 }]), V.cleanDecor(full), 'a full garden keeps all of its own');
});

test('mergeV2 / fromV2: new road and garden fields default and carry through untouched', () => {
  const fresh = M.fromV2(v2Fixture()).players[1];
  assert.deepEqual(fresh.road.roots, { opened: false, sanctums: {} });
  assert.deepEqual(fresh.road.r2bloomed, []);
  assert.deepEqual(fresh.garden.decor, []);
  assert.equal(fresh.bulba.accessory, null);
  const v3 = M.fromV2(v2Fixture());
  const p = v3.players[1];
  Object.assign(p.road, { r2bloomed: [0, 4], wildBloomed: [9], roots: { opened: true, sanctums: { heart: true } } });
  p.road.cleared['r2-c4-t2'] = true; p.road.cleared['w9-t5'] = true;
  p.garden.decor = [{ kind: 'pond', x: 0.2, y: 0.8 }];
  p.bulba.accessory = 'bow';
  const before = clone(v3);
  const out = M.mergeV2(deepFreeze(v3), v2Fixture()).players[1];
  assert.deepEqual(clone(v3), before);
  assert.deepEqual(out.road.r2bloomed, [0, 4]);
  assert.deepEqual(out.road.wildBloomed, [9]);
  assert.deepEqual(out.road.roots, { opened: true, sanctums: { heart: true } });
  assert.ok(out.road.cleared['r2-c4-t2'] && out.road.cleared['w9-t5']);
  assert.deepEqual(out.garden.decor, [{ kind: 'pond', x: 0.2, y: 0.8 }]);
  assert.equal(out.bulba.accessory, 'bow');
  const noV2 = M.mergeV2(before, null).players[1];
  assert.deepEqual(noV2.garden.decor, [{ kind: 'pond', x: 0.2, y: 0.8 }]);
  assert.deepEqual(M.applyV1(before, { p1: [1] }).players[1].road.roots, before.players[1].road.roots);
  // An older v3 save with none of these fields loads with the defaults.
  const old = clone(before);
  delete old.players[1].road.roots; delete old.players[1].road.r2bloomed; delete old.players[1].garden.decor; delete old.players[1].bulba.accessory;
  const o = V.cleanSave(old).players[1];
  assert.deepEqual([o.road.roots, o.road.r2bloomed, o.garden.decor, o.bulba.accessory], [{ opened: false, sanctums: {} }, [], [], null]);
});

test('import: decorations are never removed; the incoming ones join; accessory stays when the code has none', () => {
  reset();
  const cur = V.freshSave();
  cur.players[2].garden.decor = [{ kind: 'pond', x: 0.5, y: 0.5 }, { kind: 'rock', x: 0.1, y: 0.9 }];
  cur.players[2].bulba.accessory = 'bow';
  const older = V.freshSave();
  older.players[2].garden.decor = [{ kind: 'pond', x: 0.5001, y: 0.5 }, { kind: 'bench', x: 0.3, y: 0.3 }];
  older.players[1].caught = [1];
  const out = S.importCode(S.exportCode(older), cur);
  assert.deepEqual(out.players[2].garden.decor, [{ kind: 'pond', x: 0.5, y: 0.5 }, { kind: 'rock', x: 0.1, y: 0.9 }, { kind: 'bench', x: 0.3, y: 0.3 }]);
  assert.equal(out.players[2].bulba.accessory, 'bow');
  // A classic v2 code (no garden at all) cannot erase them either.
  const classic = btoa(unescape(encodeURIComponent(JSON.stringify({ v: 2, save: v2Fixture() }))));
  assert.equal(S.importCode(classic, out).players[2].garden.decor.length, 3);
  // A code wearing something else wins the accessory (it is a costume, not a loss).
  const other = V.freshSave(); other.players[2].bulba.accessory = 'hat'; other.players[1].caught = [1];
  assert.equal(S.importCode(S.exportCode(other), out).players[2].bulba.accessory, 'hat');
});

test('import after Art moved every decoration: no copies, and a new kind still has room (regression)', async () => {
  reset();
  const D = await import('../data/decor.js');
  const kinds = D.DECOR.map(d => d.key);
  const old = V.freshSave(); old.players[1].caught = [1];
  old.players[2].garden.decor = kinds.slice(0, 25).map((k, i) => ({ kind: k, x: i / 30, y: 0.1 }));
  const code = S.exportCode(old);
  const cur = clone(old);
  cur.players[2].garden.decor = kinds.slice(0, 25).map((k, i) => ({ kind: k, x: i / 30, y: 0.9 }));   // all moved
  const out = S.importCode(code, cur);
  assert.equal(out.players[2].garden.decor.length, 25, 'nothing doubled');
  assert.deepEqual(D.decorAction(out.players[2].garden.decor, kinds[26], V.MAX_DECOR), { op: 'place' });
  // RESTORE takes the same path.
  const back = S.restorePrevious(out);
  assert.equal(back.players[2].garden.decor.length, 25);
  // Extra copies from a code never eat the room kept for kinds not placed yet.
  const dupes = V.freshSave(); dupes.players[1].caught = [1];
  dupes.players[2].garden.decor = Array.from({ length: 40 }, (_, i) => ({ kind: kinds[0], x: i / 40, y: 0.5 }));
  const cur2 = V.freshSave(); cur2.players[2].garden.decor = [{ kind: kinds[0], x: 0.5, y: 0.5 }];
  const merged = S.importCode(S.exportCode(dupes), cur2).players[2].garden.decor;
  assert.equal(merged.length, V.MAX_DECOR - (kinds.length - 1), 'room left for the 29 kinds not placed yet');
  for (const k of kinds.slice(1)) assert.notEqual(D.decorAction(merged, k, V.MAX_DECOR).op, 'none');
});

test('rollback safety: unknown nested fields are parked in legacy, not dropped', () => {
  const p = V.cleanPlayer({
    road: { chapter: 2, cleared: { 'c0-t0': true, 'x9-t1': true }, futureThing: { a: 1 } },
    garden: { decor: [], newPatch: [1, 2] },
    bulba: { petals: 5, hat2: 'cap' },
  });
  assert.deepEqual(p.legacy.v3road, { futureThing: { a: 1 } });
  assert.deepEqual(p.legacy.v3garden, { newPatch: [1, 2] });
  assert.deepEqual(p.legacy.v3bulba, { hat2: 'cap' });
  assert.deepEqual(p.legacy.v3cleared, { 'x9-t1': true });
  assert.equal(p.road.cleared['x9-t1'], undefined);
  const again = V.cleanPlayer(p);
  assert.deepEqual(again.legacy, p.legacy, 'parking is stable');
});

test('rollback safety: the b4 mirror survives a v20.0.0-style strip and is absorbed back (regression)', () => {
  const ls = reset();
  const save = V.freshSave();
  const g = save.players[1];
  g.road.cleared = { 'c0-t0': true, 'r2-c3-t1': true, 'w5-t2': true };
  g.road.r2bloomed = [3]; g.road.wildBloomed = [5];
  g.road.roots = { opened: true, sanctums: { 'deep-well': true } };
  const a = save.players[2];
  a.garden.decor = [{ kind: 'pond', x: 0.2, y: 0.3 }];
  a.bulba.accessory = 'bow';
  assert.ok(S.persist(save));
  const disk = JSON.parse(ls.pokedexos_save_v3);
  assert.ok(disk.players[1].b4 && disk.players[1].b4.cleared.includes('r2-c3-t1'), 'disk carries the mirror');
  // What v20.0.0 does: nested batch-4 fields dropped, the unknown top-level b4 parked in legacy.
  const strip = p => ({
    ...p, legacy: { ...p.legacy, b4: p.b4 }, b4: undefined,
    road: { chapter: p.road.chapter, cleared: { 'c0-t0': true }, bloomed: [], seeds: 0, guardians: {}, hatched: false, rival: p.road.rival },
    garden: { plots: [], berries: 0 },
    bulba: { petals: p.bulba.petals, stage: p.bulba.stage, stayStone: false, visitors: [] },
  });
  const old = { ...disk, players: { 1: strip(disk.players[1]), 2: strip(disk.players[2]) } };
  const back = V.cleanSave(JSON.parse(JSON.stringify(old)));
  assert.deepEqual(back.players[1].road.cleared, { 'c0-t0': true, 'r2-c3-t1': true, 'w5-t2': true });
  assert.deepEqual([back.players[1].road.r2bloomed, back.players[1].road.wildBloomed], [[3], [5]]);
  assert.deepEqual(back.players[1].road.roots, { opened: true, sanctums: { 'deep-well': true } });
  assert.deepEqual(back.players[2].garden.decor, [{ kind: 'pond', x: 0.2, y: 0.3 }]);
  assert.equal(back.players[2].bulba.accessory, 'bow');
  assert.equal(back.players[1].legacy.b4, undefined, 'the absorbed mirror is not kept twice');
  assert.equal(back.players[1].b4, undefined);
  // An export code carries it too (the AirDrop-to-an-old-phone path).
  const code = S.decodeCode(S.exportCode(save));
  assert.deepEqual(code.data.players[1].road.r2bloomed, [3]);
});

test('restore: decorations placed after the snapshot stay in the garden', () => {
  reset();
  const before = V.freshSave(); before.players[1].caught = [1];
  const code = V.freshSave(); code.players[1].caught = [4];
  const imported = S.importCode(S.exportCode(code), before);
  imported.players[2].garden.decor = [{ kind: 'pond', x: 0.4, y: 0.4 }];
  const restored = S.restorePrevious(imported);
  assert.deepEqual(restored.players[1].caught, [1]);
  assert.deepEqual(restored.players[2].garden.decor, [{ kind: 'pond', x: 0.4, y: 0.4 }]);
});

test('store: placeDecor / moveDecor / setAccessory / openRoots / addSanctum commit to disk', () => {
  const ls = reset();
  const disk = () => JSON.parse(ls.pokedexos_save_v3);
  store.setPlayer(2);
  assert.deepEqual(store.placeDecor('pond', 0.25, 0.75), { kind: 'pond', x: 0.25, y: 0.75 });
  assert.deepEqual(disk().players[2].garden.decor, [{ kind: 'pond', x: 0.25, y: 0.75 }]);
  const writes = ls._q.writes.length;
  assert.equal(store.placeDecor('<b>', 0, 0), null);
  assert.equal(store.moveDecor(5, 0, 0), null);
  assert.equal(store.setAccessory('<b>'), null);
  assert.equal(ls._q.writes.length, writes, 'junk writes nothing');
  assert.deepEqual(store.moveDecor(0, 0.5, 0.5), { kind: 'pond', x: 0.5, y: 0.5 });
  assert.equal(store.setAccessory('bow'), 'bow');
  assert.equal(disk().players[2].bulba.accessory, 'bow');
  assert.deepEqual(disk().players[2].garden.decor, [{ kind: 'pond', x: 0.5, y: 0.5 }]);
  assert.equal(store.openRoots(1), true);
  assert.equal(store.addSanctum('deep-well', 1), true);
  assert.deepEqual(disk().players[1].road.roots, { opened: true, sanctums: { 'deep-well': true } });
  assert.deepEqual(disk().players[2].road.roots, { opened: false, sanctums: {} });
  store.setPlayer(1);
});
