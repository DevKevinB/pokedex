// node --test next/test/pro.test.mjs — PRO RULES (battle/rules-pro.js) and DAD'S CHALLENGE helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProBattle, withStatusMoves, proDamage, expectedDamage, speedOf, stageMult, accStageMult,
  scoreMoves, matchup, abilityOf, STATUS_MOVES, PRIORITY, ABILITIES, STATUS_INFO, INTENT_INFO, proMove, intentKind
} from '../battle/rules-pro.js';
import { createBattle } from '../battle/createBattle.js';
import { MAX_HIT_FRACTION } from '../data/engine.js';
import { seededRng } from '../core/rng.js';
import {
  makeCode, parseCode, CODE_WORDS, leaderTeam, beatenLeaders, CHALLENGE_BONUS, codeFor, challengeRng
} from '../scenes/challenge.js';
import { CHAPTERS, leaderIdx, chapterKey } from '../data/chapters.js';

// ---------------------------------------------------------------- fixtures
let nextId = 900;                       // ids with no curated ability
const mon = (types, stats = {}, moves = [TACKLE], extra = {}) => ({
  id: extra.id ?? nextId++, level: extra.level ?? 50, name: 'MON', types,
  stats: { hp: 150, atk: 100, def: 100, spatk: 100, spdef: 100, spe: 100, ...stats },
  moves, ability: null, ...extra
});
const TACKLE = { name: 'tackle', type: 'normal', power: 40, damage_class: 'physical' };
const QUICK = { name: 'quick-attack', type: 'normal', power: 40, damage_class: 'physical' };
const ESPEED = { name: 'extreme-speed', type: 'normal', power: 80, damage_class: 'physical' };
const EQ = { name: 'earthquake', type: 'ground', power: 100, damage_class: 'physical' };
const FLAME = { name: 'flamethrower', type: 'fire', power: 90, damage_class: 'special' };
const EMBER = { name: 'ember', type: 'fire', power: 40, damage_class: 'special' };
const SURF = { name: 'surf', type: 'water', power: 90, damage_class: 'special' };
const THUNDER = { name: 'thunder', type: 'electric', power: 110, damage_class: 'special' };
const BIG = { name: 'mega-kick', type: 'normal', power: 120, damage_class: 'physical' };
const st = n => proMove(n);

const constRng = v => () => v;
/** An rng that returns the listed values in order, then `rest` forever. */
const seq = (vals, rest = 0.5) => { let i = 0; return () => (i < vals.length ? vals[i++] : rest); };

async function playOut(b, pick = () => ({ kind: 'move', index: 0 }), max = 500) {
  const all = [];
  for (let i = 0; i < max && !b.state.over; i++) all.push(...await b.choose(pick(b, i)));
  return all;
}

// ---------------------------------------------------------------- the kids' rules stay the kids' rules
test('a prereader never gets Pro Rules: createProBattle hands back createBattle', async () => {
  const b = createProBattle({
    myTeam: [mon(['grass'], { hp: 20, atk: 5, def: 5, spe: 5 })],
    enemyTeam: [mon(['fire'], { hp: 9999, atk: 500, spatk: 500, spe: 500 }, [FLAME, BIG])],
    profile: 'prereader', rng: seededRng(3), leader: true
  });
  assert.notEqual(b.pro, true);
  const ev = await playOut(b, () => ({ kind: 'move', index: 0 }), 300);
  assert.ok(!ev.some(e => e.type === 'faint' && e.side === 'me'), 'his mon never faints');
  assert.ok(!ev.some(e => ['status', 'stage', 'ability'].includes(e.type)));
});

test('createBattle keeps its 60% cap (default behaviour unchanged)', async () => {
  const b = createBattle({
    myTeam: [mon(['normal'], { atk: 999, spe: 999 }, [BIG])],
    enemyTeam: [mon(['normal'], { hp: 100, def: 5 })],
    rng: constRng(0.5)
  });
  const ev = await b.choose({ kind: 'move', index: 0 });
  const hit = ev.find(e => e.type === 'move' && e.side === 'me');
  assert.ok(hit.dmg <= 100 * MAX_HIT_FRACTION + 1);
});

test('Pro Rules have no 60% single-hit cap', async () => {
  const b = createProBattle({
    myTeam: [mon(['normal'], { atk: 999, spe: 999 }, [BIG])],
    enemyTeam: [mon(['normal'], { hp: 100, def: 5 }), mon(['normal'])],
    rng: constRng(0.5)
  });
  const ev = await b.choose({ kind: 'move', index: 0 });
  const hit = ev.find(e => e.type === 'move' && e.side === 'me');
  assert.equal(hit.dmg, 100);
  assert.ok(ev.some(e => e.type === 'faint' && e.side === 'foe'));
});

test('same interface as createBattle', () => {
  const b = createProBattle({ myTeam: [mon(['normal'])], enemyTeam: [mon(['normal'])], rng: seededRng(1) });
  for (const k of ['state', 'choose', 'foeIntent', 'foeIntentMove', 'wild', 'leader', 'profile']) assert.ok(k in b, k);
  assert.equal(b.pro, true);
  assert.equal(typeof b.foeIntentAction, 'function');
  assert.deepEqual(Object.keys(b.state.me), ['active', 'team', 'berries']);
  assert.equal(b.state.over, false);
  assert.equal(b.state.me.team[0].hp, b.state.me.team[0].maxHp);
  assert.throws(() => createProBattle({ myTeam: [], enemyTeam: [mon(['normal'])] }));
});

// ---------------------------------------------------------------- determinism
test('one seed replays one fight exactly; another seed differs', async () => {
  const run = async seed => {
    const b = createProBattle({
      myTeam: [mon(['fire'], {}, [FLAME, st('will-o-wisp'), TACKLE], { id: 4 }), mon(['water'], {}, [SURF, st('thunder-wave')], { id: 7 })],
      enemyTeam: [mon(['grass'], {}, [TACKLE, st('sleep-powder')], { id: 1 }), mon(['electric'], {}, [THUNDER, QUICK], { id: 25 })],
      rng: seededRng(seed), leader: true
    });
    return JSON.stringify(await playOut(b, (bb, i) => ({ kind: 'move', index: i % bb.state.me.team[bb.state.me.active].moves.length })));
  };
  assert.equal(await run(714), await run(714));
  const others = await Promise.all([1, 2, 3, 4, 5].map(run));
  assert.ok(others.some(o => o !== others[0]) || others[0] !== await run(714));
});

// ---------------------------------------------------------------- stat stages
test('stage maths', () => {
  assert.equal(stageMult(0), 1); assert.equal(stageMult(2), 2); assert.equal(stageMult(6), 4);
  assert.equal(stageMult(-2), 0.5); assert.equal(stageMult(-6), 0.25);
  assert.equal(accStageMult(0), 1); assert.equal(accStageMult(3), 2); assert.equal(accStageMult(-3), 0.5);
});

test('swords dance: +2 per use, capped at +6, then it fails', async () => {
  const b = createProBattle({
    myTeam: [mon(['normal'], { spe: 200, hp: 9999 }, [st('swords-dance'), TACKLE])],
    enemyTeam: [mon(['normal'], { hp: 9999, atk: 1 }, [TACKLE])],
    rng: constRng(0.5), ai: 'basic'
  });
  const all = [];
  for (let i = 0; i < 4; i++) all.push(...await b.choose({ kind: 'move', index: 0 }));
  const stages = all.filter(e => e.type === 'stage' && e.side === 'me');
  assert.deepEqual(stages.map(e => e.value), [2, 4, 6]);
  assert.ok(all.some(e => e.type === 'miss' && e.side === 'me' && e.reason === 'failed'));
  assert.equal(b.state.me.team[0].stages.atk, 6);
  // +6 attack really hits harder
  const f = b.state.me.team[0];
  const t = b.state.foe.team[0];
  const hi = proDamage(f, t, TACKLE).damage;
  const lo = proDamage({ ...f, stages: { ...f.stages, atk: 0 } }, t, TACKLE).damage;
  assert.ok(hi > lo * 3);
});

test('growl lowers the foe; stages reset on switch', async () => {
  const b = createProBattle({
    myTeam: [mon(['normal'], { spe: 200 }, [st('growl')]), mon(['normal'])],
    enemyTeam: [mon(['normal'], { hp: 9999 }, [TACKLE])],
    rng: constRng(0.5), ai: 'basic'
  });
  const ev = await b.choose({ kind: 'move', index: 0 });
  assert.ok(ev.some(e => e.type === 'stage' && e.side === 'foe' && e.stat === 'atk' && e.delta === -1));
  await b.choose({ kind: 'move', index: 0 });
  assert.equal(b.state.foe.team[0].stages.atk, -2);
  b.state.me.team[0].stages.spe = 3;
  await b.choose({ kind: 'switch', index: 1 });
  assert.equal(b.state.me.team[0].stages.spe, 0);
});

// ---------------------------------------------------------------- priority and speed
test('priority beats speed; extreme speed beats quick attack; ties are seeded', async () => {
  const b = createProBattle({
    myTeam: [mon(['normal'], { spe: 10 }, [QUICK])],
    enemyTeam: [mon(['normal'], { spe: 300 }, [TACKLE])],
    rng: constRng(0.5), ai: 'basic'
  });
  let ev = await b.choose({ kind: 'move', index: 0 });
  assert.equal(ev.find(e => e.type === 'move').side, 'me');

  const c = createProBattle({
    myTeam: [mon(['normal'], { spe: 300 }, [QUICK])],
    enemyTeam: [mon(['normal'], { spe: 10 }, [ESPEED])],
    rng: constRng(0.5), ai: 'basic'
  });
  ev = await c.choose({ kind: 'move', index: 0 });
  assert.equal(ev.find(e => e.type === 'move').side, 'foe');
  assert.equal(PRIORITY['extreme-speed'], 2);
  assert.equal(PRIORITY.protect, 4);
});

test('protect blocks, and a second one in a row usually fails (1/3)', async () => {
  const b = createProBattle({
    myTeam: [mon(['normal'], { spe: 10 }, [st('protect'), TACKLE])],
    enemyTeam: [mon(['normal'], { spe: 300, hp: 9999 }, [TACKLE])],
    rng: constRng(0.9), ai: 'basic'
  });
  let ev = await b.choose({ kind: 'move', index: 0 });
  assert.ok(ev.some(e => e.type === 'protect' && e.side === 'me' && e.ok));
  assert.ok(ev.some(e => e.type === 'miss' && e.side === 'foe' && e.reason === 'protected'));
  assert.equal(b.state.me.team[0].hp, b.state.me.team[0].maxHp);
  ev = await b.choose({ kind: 'move', index: 0 });       // 0.9 >= 1/3: fails
  assert.ok(ev.some(e => e.type === 'protect' && e.side === 'me' && !e.ok));
  assert.ok(b.state.me.team[0].hp < b.state.me.team[0].maxHp);
  ev = await b.choose({ kind: 'move', index: 0 });       // the chain reset: works again
  assert.ok(ev.some(e => e.type === 'protect' && e.ok));
});

// ---------------------------------------------------------------- accuracy
test('accuracy and evasion', async () => {
  const b = createProBattle({
    myTeam: [mon(['electric'], { spe: 300 }, [THUNDER])],
    enemyTeam: [mon(['normal'], { hp: 9999 }, [TACKLE])],
    rng: constRng(0.75), ai: 'basic'
  });
  const ev = await b.choose({ kind: 'move', index: 0 });          // 70% move, roll .75 -> miss
  assert.ok(ev.some(e => e.type === 'miss' && e.side === 'me' && e.reason === 'miss'));
  // TACKLE never misses without stages, but sand-attack makes it miss
  const c = createProBattle({
    myTeam: [mon(['normal'], { spe: 300 }, [st('sand-attack')])],
    enemyTeam: [mon(['normal'], { hp: 9999 }, [TACKLE])],
    rng: constRng(0.8), ai: 'basic'
  });
  const e1 = await c.choose({ kind: 'move', index: 0 });          // I move first: acc -1 = .75 hit chance, roll .8 -> miss
  assert.equal(c.state.foe.team[0].stages.acc, -1);
  assert.ok(e1.some(e => e.type === 'miss' && e.side === 'foe'));
  const d = createProBattle({
    myTeam: [mon(['normal'], { spe: 300 }, [st('harden')])],
    enemyTeam: [mon(['normal'], { hp: 9999 }, [TACKLE])], rng: constRng(0.8), ai: 'basic'
  });
  assert.ok((await d.choose({ kind: 'move', index: 0 })).some(e => e.type === 'move' && e.side === 'foe'), 'full accuracy without the drop');
});

// ---------------------------------------------------------------- the five statuses
test('paralysis: speed quartered; ground and electric are immune to thunder wave', async () => {
  const b = createProBattle({
    myTeam: [mon(['normal'], { spe: 300 }, [st('thunder-wave')])],
    enemyTeam: [mon(['normal'], { spe: 200, hp: 9999 }, [TACKLE])],
    rng: constRng(0.5), ai: 'basic'
  });
  const ev = await b.choose({ kind: 'move', index: 0 });
  assert.ok(ev.some(e => e.type === 'status' && e.side === 'foe' && e.status === 'par' && e.what === 'inflict'));
  assert.equal(speedOf(b.state.foe.team[0]), 50);
  for (const types of [['ground'], ['electric']]) {
    const c = createProBattle({
      myTeam: [mon(['normal'], { spe: 300 }, [st('thunder-wave')])],
      enemyTeam: [mon(types, { hp: 9999 }, [TACKLE])], rng: constRng(0.5), ai: 'basic'
    });
    const e2 = await c.choose({ kind: 'move', index: 0 });
    assert.ok(e2.some(e => e.type === 'miss' && e.reason === 'immune'), types[0]);
    assert.equal(c.state.foe.team[0].status, null);
  }
});

test('paralysis can stop a move (25%)', async () => {
  const b = createProBattle({
    myTeam: [mon(['normal'], { spe: 300, hp: 9999 }, [TACKLE])],
    enemyTeam: [mon(['normal'], { hp: 9999 }, [TACKLE])], rng: constRng(0.1), ai: 'basic'
  });
  b.state.foe.team[0].status = 'par';
  const ev = await b.choose({ kind: 'move', index: 0 });
  assert.ok(ev.some(e => e.type === 'status' && e.side === 'foe' && e.what === 'cant'));
  assert.ok(!ev.some(e => e.type === 'move' && e.side === 'foe'));
});

test('burn halves physical damage and ticks 1/8; fire types cannot be burned; Guts ignores it', async () => {
  const att = mon(['normal'], {}, [TACKLE]);
  const b = createProBattle({ myTeam: [att], enemyTeam: [mon(['normal'], { hp: 800 })], rng: constRng(0.5) });
  const me = b.state.me.team[0], foe = b.state.foe.team[0];
  const clean = proDamage(me, foe, TACKLE).damage;
  me.status = 'brn';
  assert.ok(Math.abs(proDamage(me, foe, TACKLE).damage - clean / 2) < 1e-9);
  assert.ok(Math.abs(proDamage(me, foe, FLAME).damage - proDamage({ ...me, status: null }, foe, FLAME).damage) < 1e-9, 'special untouched');
  const gutsy = { ...me, ability: 'guts' };
  assert.ok(proDamage(gutsy, foe, TACKLE).damage > clean * 1.4);

  const c = createProBattle({
    myTeam: [mon(['normal'], { spe: 300, hp: 9999 }, [st('will-o-wisp')])],
    enemyTeam: [mon(['normal'], { hp: 160 }, [st('growl')])], rng: constRng(0.5), ai: 'basic'
  });
  const ev = await c.choose({ kind: 'move', index: 0 });
  const tick = ev.find(e => e.type === 'status' && e.what === 'tick');
  assert.equal(tick.dmg, 20);
  assert.equal(c.state.foe.team[0].hp, 140);
  const d = createProBattle({
    myTeam: [mon(['normal'], { spe: 300 }, [st('will-o-wisp')])],
    enemyTeam: [mon(['fire'], { hp: 9999 }, [TACKLE])], rng: constRng(0.5), ai: 'basic'
  });
  await d.choose({ kind: 'move', index: 0 });
  assert.equal(d.state.foe.team[0].status, null);
});

test('toxic escalates 1/16, 2/16, 3/16; steel and poison are immune', async () => {
  const b = createProBattle({
    myTeam: [mon(['normal'], { spe: 300, hp: 9999 }, [st('toxic'), st('harden')])],
    enemyTeam: [mon(['normal'], { hp: 160 }, [st('growl')])], rng: constRng(0.5), ai: 'basic'
  });
  const ticks = [];
  for (const i of [0, 1, 1]) ticks.push(...(await b.choose({ kind: 'move', index: i })).filter(e => e.what === 'tick'));
  assert.deepEqual(ticks.map(t => t.dmg), [10, 20, 30]);
  for (const types of [['steel'], ['poison']]) {
    const c = createProBattle({ myTeam: [mon(['normal'], { spe: 300 }, [st('toxic')])], enemyTeam: [mon(types, { hp: 999 })], rng: constRng(0.5), ai: 'basic' });
    await c.choose({ kind: 'move', index: 0 });
    assert.equal(c.state.foe.team[0].status, null, types[0]);
  }
});

test('sleep skips 1-3 turns, then it wakes and acts', async () => {
  const b = createProBattle({
    myTeam: [mon(['normal'], { spe: 300, hp: 9999 }, [st('spore'), st('harden')])],
    enemyTeam: [mon(['normal'], { hp: 9999 }, [TACKLE])], rng: constRng(0.99), ai: 'basic'
  });
  const all = [];
  all.push(...await b.choose({ kind: 'move', index: 0 }));
  assert.equal(b.state.foe.team[0].status, 'slp');
  for (let i = 0; i < 5; i++) all.push(...await b.choose({ kind: 'move', index: 1 }));
  const cant = all.filter(e => e.type === 'status' && e.side === 'foe' && e.what === 'cant').length;
  assert.equal(cant, 3);                    // rng .99 -> the longest sleep
  assert.ok(all.some(e => e.type === 'status' && e.what === 'wake'));
  assert.ok(all.some(e => e.type === 'move' && e.side === 'foe'));
});

test('freeze: stuck until a 20% thaw (or a fire move); ice types never freeze', async () => {
  const b = createProBattle({
    myTeam: [mon(['normal'], { spe: 300, hp: 9999 }, [st('harden')])],
    enemyTeam: [mon(['normal'], { hp: 9999 }, [TACKLE])], rng: seq([], 0.5), ai: 'basic'
  });
  b.state.foe.team[0].status = 'frz';
  let ev = await b.choose({ kind: 'move', index: 0 });
  assert.ok(ev.some(e => e.what === 'cant' && e.status === 'frz'));
  const c = createProBattle({
    myTeam: [mon(['normal'], { spe: 300, hp: 9999 }, [st('harden')])],
    enemyTeam: [mon(['normal'], { hp: 9999 }, [TACKLE])], rng: constRng(0.1), ai: 'basic'
  });
  c.state.foe.team[0].status = 'frz';
  ev = await c.choose({ kind: 'move', index: 0 });
  assert.ok(ev.some(e => e.what === 'thaw'));
  assert.ok(ev.some(e => e.type === 'move' && e.side === 'foe'));
  // ice-beam's 10% freeze never lands on an ice type
  const d = createProBattle({
    myTeam: [mon(['normal'], { spe: 300 }, [{ name: 'ice-beam', type: 'ice', power: 90, damage_class: 'special' }])],
    enemyTeam: [mon(['ice'], { hp: 9999 }, [TACKLE])], rng: constRng(0.01), ai: 'basic'
  });
  await d.choose({ kind: 'move', index: 0 });
  assert.equal(d.state.foe.team[0].status, null);
});

test('one status at a time', async () => {
  const b = createProBattle({
    myTeam: [mon(['normal'], { spe: 300 }, [st('thunder-wave'), st('will-o-wisp')])],
    enemyTeam: [mon(['normal'], { hp: 9999 }, [st('growl')])], rng: constRng(0.5), ai: 'basic'
  });
  await b.choose({ kind: 'move', index: 0 });
  const ev = await b.choose({ kind: 'move', index: 1 });
  assert.equal(b.state.foe.team[0].status, 'par');
  assert.ok(ev.some(e => e.type === 'miss' && e.reason === 'failed'));
});

// ---------------------------------------------------------------- abilities
test('the curated abilities', async () => {
  assert.equal(ABILITIES.length, 15);
  assert.equal(abilityOf(130), 'intimidate');
  assert.equal(abilityOf(94), 'levitate');
  assert.equal(abilityOf(1), 'overgrow');
  assert.equal(abilityOf(149), 'multiscale');
  assert.equal(abilityOf(9999), null);
  const base = () => ({ ...mon(['normal']), hp: 150, maxHp: 150, atk: 100, def: 100, spatk: 100, spdef: 100, spe: 100, status: null, stages: { atk: 0, def: 0, spatk: 0, spdef: 0, spe: 0, acc: 0, eva: 0 }, atkMult: 1 });
  const a = base(), d = base();
  // Levitate
  assert.equal(proDamage(a, { ...d, ability: 'levitate' }, EQ).typeMult, 0);
  // Thick Fat
  assert.ok(Math.abs(proDamage(a, { ...d, ability: 'thick-fat' }, FLAME).damage * 2 - proDamage(a, d, FLAME).damage) < 1e-9);
  // Multiscale only at full HP
  assert.ok(proDamage(a, { ...d, ability: 'multiscale' }, TACKLE).damage < proDamage(a, d, TACKLE).damage);
  assert.equal(proDamage(a, { ...d, ability: 'multiscale', hp: 149 }, TACKLE).damage, proDamage(a, d, TACKLE).damage);
  // Technician
  assert.ok(proDamage({ ...a, ability: 'technician' }, d, TACKLE).damage > proDamage(a, d, TACKLE).damage);
  assert.equal(proDamage({ ...a, ability: 'technician' }, d, BIG).damage, proDamage(a, d, BIG).damage);
  // Blaze at 1/3 HP
  const fa = { ...a, types: ['fire'], ability: 'blaze' };
  assert.ok(proDamage({ ...fa, hp: 40 }, d, EMBER).damage > proDamage(fa, d, EMBER).damage * 1.4);
  // Swift Swim / Chlorophyll
  assert.equal(speedOf({ ...a, ability: 'swift-swim' }, 'rain'), 200);
  assert.equal(speedOf({ ...a, ability: 'chlorophyll' }, 'sun'), 200);
  assert.equal(speedOf({ ...a, ability: 'chlorophyll' }, 'rain'), 100);
});

test('Intimidate on the way in, Sturdy survives, Static paralyses on contact', async () => {
  const b = createProBattle({
    myTeam: [mon(['normal'], {}, [TACKLE], { id: 130, ability: undefined })],
    enemyTeam: [mon(['normal'], { hp: 9999 })], rng: constRng(0.5)
  });
  assert.equal(b.state.me.team[0].ability, 'intimidate');
  assert.ok(b.openingEvents.some(e => e.type === 'ability' && e.ability === 'intimidate'));
  assert.equal(b.state.foe.team[0].stages.atk, -1);

  const c = createProBattle({
    myTeam: [mon(['normal'], { atk: 999, spe: 300 }, [BIG])],
    enemyTeam: [mon(['rock'], { hp: 100, def: 5 }, [TACKLE], { ability: 'sturdy' }), mon(['normal'])], rng: constRng(0.5)
  });
  let ev = await c.choose({ kind: 'move', index: 0 });
  assert.ok(ev.some(e => e.type === 'ability' && e.ability === 'sturdy'));
  assert.equal(c.state.foe.team[0].hp, 1);

  const d = createProBattle({
    myTeam: [mon(['normal'], { spe: 300, hp: 9999 }, [TACKLE])],
    enemyTeam: [mon(['electric'], { hp: 9999 }, [st('harden')], { ability: 'static' })], rng: constRng(0.2), ai: 'basic'
  });
  ev = await d.choose({ kind: 'move', index: 0 });
  assert.ok(ev.some(e => e.type === 'ability' && e.ability === 'static'));
  assert.equal(d.state.me.team[0].status, 'par');
});

test('rain dance: 5 turns of weather, water hits harder', async () => {
  const b = createProBattle({
    myTeam: [mon(['water'], { spe: 300, hp: 9999 }, [st('rain-dance'), SURF])],
    enemyTeam: [mon(['normal'], { hp: 9999 }, [st('harden')])], rng: constRng(0.5), ai: 'basic'
  });
  const all = [...await b.choose({ kind: 'move', index: 0 })];
  assert.equal(b.state.weather, 'rain');
  for (let i = 0; i < 5; i++) all.push(...await b.choose({ kind: 'move', index: 1 }));
  assert.equal(b.state.weather, null);
  assert.deepEqual(all.filter(e => e.type === 'weather').map(e => e.weather), ['rain', null]);
});

// ---------------------------------------------------------------- heals, recoil, drain
test('recover heals half; recoil and drain', async () => {
  const b = createProBattle({
    myTeam: [mon(['normal'], { spe: 300, hp: 200 }, [st('recover'), { name: 'double-edge', type: 'normal', power: 120, damage_class: 'physical' }, { name: 'giga-drain', type: 'grass', power: 75, damage_class: 'special' }])],
    enemyTeam: [mon(['normal'], { hp: 9999 }, [st('harden')])], rng: constRng(0.5), ai: 'basic'
  });
  const me = b.state.me.team[0];
  me.hp = 50;
  let ev = await b.choose({ kind: 'move', index: 0 });
  assert.ok(ev.some(e => e.type === 'heal' && e.side === 'me' && e.amount === 100 && e.hpAfter === 150));
  ev = await b.choose({ kind: 'move', index: 1 });
  const hit = ev.find(e => e.type === 'move' && e.side === 'me');
  const rec = ev.find(e => e.type === 'hurt');
  assert.equal(rec.dmg, Math.round(hit.dmg / 3));
  ev = await b.choose({ kind: 'move', index: 2 });
  assert.ok(ev.some(e => e.type === 'heal' && e.side === 'me'));
});

// ---------------------------------------------------------------- the smarter AI
test('AI: takes the KO, reaches for sleep when it cannot, and sets up when safe', () => {
  const f = createProBattle({
    myTeam: [mon(['normal'], { hp: 30 })],
    enemyTeam: [mon(['normal'], {}, [st('spore'), TACKLE])], rng: constRng(0.5)
  });
  assert.equal(f.foeIntentAction().index, 1, 'KO beats a sleep move');
  assert.equal(f.foeIntentAction().icon, 'attack');

  const g = createProBattle({
    myTeam: [mon(['normal'], { hp: 9999, def: 300 })],
    enemyTeam: [mon(['normal'], {}, [TACKLE, st('spore')])], rng: constRng(0.5)
  });
  assert.equal(g.foeIntent(), 1);
  assert.equal(g.foeIntentAction().icon, 'status');

  const h = createProBattle({
    myTeam: [mon(['normal'], { hp: 9999, def: 300, atk: 5, spatk: 5 }, [TACKLE])],
    enemyTeam: [mon(['normal'], {}, [TACKLE, st('swords-dance')])], rng: constRng(0.5)
  });
  assert.equal(h.foeIntentAction().icon, 'setup');
  const s = scoreMoves(h.state.foe.team[0], h.state.me.team[0]);
  assert.ok(s[1] > s[0]);
});

test('AI: switches out of a bad matchup to a better one', () => {
  const b = createProBattle({
    myTeam: [mon(['water'], { spatk: 200, spe: 300 }, [SURF])],
    enemyTeam: [
      mon(['fire'], { hp: 120 }, [EMBER]),
      mon(['grass'], { hp: 200, spdef: 200 }, [{ name: 'energy-ball', type: 'grass', power: 90, damage_class: 'special' }])
    ],
    rng: constRng(0.5)
  });
  const a = b.foeIntentAction();
  assert.equal(a.kind, 'switch');
  assert.equal(a.index, 1);
  assert.equal(a.icon, 'switch');
  assert.ok(matchup(b.state.foe.team[1], b.state.me.team[0]) > matchup(b.state.foe.team[0], b.state.me.team[0]));
});

test('the committed intent is what happens, and the foe switch lands before my move', async () => {
  const b = createProBattle({
    myTeam: [mon(['water'], { spatk: 200, spe: 300 }, [SURF])],
    enemyTeam: [mon(['fire'], { hp: 120 }, [EMBER]), mon(['grass'], { hp: 200, spdef: 200 }, [TACKLE])],
    rng: constRng(0.5)
  });
  const ev = await b.choose({ kind: 'move', index: 0 });
  assert.equal(ev[0].type, 'switch');
  assert.equal(ev[0].side, 'foe');
  assert.equal(b.state.foe.active, 1);
});

test('choose(action, {foe}) overrides the intent (pass-and-play)', async () => {
  const b = createProBattle({
    myTeam: [mon(['normal'], { spe: 1, hp: 9999 }, [TACKLE])],
    enemyTeam: [mon(['normal'], { spe: 300, hp: 9999 }, [TACKLE, st('growl')])], rng: constRng(0.5)
  });
  const ev = await b.choose({ kind: 'move', index: 0 }, { foe: { kind: 'move', index: 1 } });
  assert.equal(ev.find(e => e.type === 'move' && e.side === 'foe').move.name, 'growl');
});

test('leader phase 2 still fires under Pro Rules', async () => {
  const b = createProBattle({
    myTeam: [mon(['normal'], { atk: 400, spe: 300, hp: 9999 }, [TACKLE])],
    enemyTeam: [mon(['normal'], { hp: 300 }, [TACKLE])], rng: constRng(0.5), leader: true
  });
  const ev = await playOut(b);
  assert.equal(ev.filter(e => e.type === 'phase2').length, 1);
  assert.equal(b.state.winner, 'me');
});

test('random seeded fights always end, HP stays in range, no NaN', async () => {
  const pool = Object.keys(STATUS_MOVES);
  for (let seed = 1; seed <= 40; seed++) {
    const r = seededRng(seed);
    const pickSt = () => st(pool[Math.floor(r() * pool.length)]);
    const types = ['fire', 'water', 'grass', 'electric', 'ground', 'ice', 'steel', 'poison', 'normal'];
    const rand = () => mon([types[Math.floor(r() * types.length)]], { hp: 60 + Math.floor(r() * 200), atk: 30 + r() * 150, spe: 20 + r() * 200 },
      [FLAME, SURF, pickSt(), QUICK], { id: 1 + Math.floor(r() * 649), ability: undefined });
    const b = createProBattle({ myTeam: [rand(), rand(), rand()], enemyTeam: [rand(), rand(), rand()], rng: seededRng(seed * 7), leader: seed % 2 === 0 });
    const ev = await playOut(b, (bb, i) => (i % 5 === 4 ? { kind: 'switch', index: (bb.state.me.active + 1) % 3 } : { kind: 'move', index: i % 4 }), 800);
    assert.ok(b.state.over, 'seed ' + seed + ' ended');
    for (const e of ev) if ('hpAfter' in e) assert.ok(Number.isFinite(e.hpAfter) && e.hpAfter >= 0, JSON.stringify(e));
    for (const f of [...b.state.me.team, ...b.state.foe.team]) {
      assert.ok(f.hp >= 0 && f.hp <= f.maxHp);
      for (const k of Object.keys(f.stages)) assert.ok(f.stages[k] >= -6 && f.stages[k] <= 6);
    }
  }
});

test('withStatusMoves: keeps slot 1, swaps the weakest, deterministic, no mutation', () => {
  const f = { id: 1, moves: [{ name: 'vine-whip', type: 'grass', power: 45, damage_class: 'physical' }, TACKLE, BIG, FLAME] };
  const a = withStatusMoves(f, ['sleep-powder', 'growl', 'swords-dance'], { rng: seededRng(1) });
  const b = withStatusMoves(f, ['sleep-powder', 'growl', 'swords-dance'], { rng: seededRng(1) });
  assert.deepEqual(a, b);
  assert.equal(a.moves[0].name, 'vine-whip');
  assert.equal(a.moves.length, 4);
  assert.ok(!a.moves.some(m => m.name === 'tackle'), 'the weakest attack went');
  assert.ok(a.moves.some(m => m.damage_class === 'status'));
  assert.equal(f.moves[1].name, 'tackle');
  assert.deepEqual(withStatusMoves(f, ['splash']).moves, f.moves);
  assert.equal(expectedDamage(mon(['normal']), mon(['normal']), st('growl')), 0);
  assert.equal(intentKind({ kind: 'switch', index: 1 }, null), 'switch');
  for (const k of ['brn', 'psn', 'par', 'slp', 'frz']) assert.ok(STATUS_INFO[k].label);
  for (const k of ['attack', 'setup', 'debuff', 'status', 'heal', 'protect', 'weather', 'switch']) assert.ok(INTENT_INFO[k].icon);
});

// ---------------------------------------------------------------- DAD'S CHALLENGE helpers
test('seed codes: WORD-NNN, one word per chapter, round-trip, forgiving input', () => {
  assert.equal(CODE_WORDS.length, CHAPTERS.length);
  assert.equal(new Set(CODE_WORDS).size, CODE_WORDS.length);
  const grass = CHAPTERS.findIndex(c => c.key === 'grass');
  assert.equal(makeCode(grass, 714), 'MOSSY-714');
  assert.equal(makeCode(0, 7), CODE_WORDS[0] + '-007');
  for (const s of ['MOSSY-714', 'mossy 714', ' Mossy714 ', 'mossy-0714']) assert.deepEqual(parseCode(s), { chapter: grass, n: 714 }, s);
  for (const s of ['', 'MOSSY', 'MOSSY-1000', 'NOPE-123', null, 'MOSSY--12x', '<b>-1']) assert.equal(parseCode(s), null, String(s));
  for (let i = 0; i < CHAPTERS.length; i++) assert.deepEqual(parseCode(makeCode(i, 123)), { chapter: i, n: 123 });
  assert.equal(codeFor(grass, seededRng(5)), codeFor(grass, seededRng(5)));
  assert.match(codeFor(grass, seededRng(5)), /^MOSSY-\d{3}$/);
  const a = challengeRng('MOSSY-714'), b = challengeRng('mossy 714');
  assert.equal(a(), b());
});

test('leader rematch team: +10 levels (max 100); only beaten leaders count', () => {
  for (let i = 0; i < CHAPTERS.length; i++) {
    const src = CHAPTERS[i].trainers[leaderIdx(i)].team;
    const t = leaderTeam(i);
    assert.equal(t.length, src.length);
    t.forEach((m, k) => { assert.equal(m.id, src[k].id); assert.equal(m.level, Math.min(100, src[k].level + CHALLENGE_BONUS)); });
  }
  assert.equal(CHALLENGE_BONUS, 10);
  const players = {
    1: { profile: 'reader', road: { cleared: { [chapterKey(0, leaderIdx(0))]: true } }, gyms: { beaten: {} } },
    2: { profile: 'prereader', road: { cleared: {} }, gyms: { beaten: { 'water:4': true } } }
  };
  assert.deepEqual(beatenLeaders({ players }), [0, 1]);
  assert.deepEqual(beatenLeaders({ players }, 1), [0]);
  assert.deepEqual(beatenLeaders({}), []);
  assert.deepEqual(leaderTeam(99), []);
});
