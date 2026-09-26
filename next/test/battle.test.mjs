// node --test next/test/battle.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, BALL_MODS } from '../battle/createBattle.js';
import { seededRng, applyXp } from '../data/engine.js';

const mon = (id, level, types, stats, moves, extra = {}) => ({
  id, level, name: 'MON' + id, types,
  stats: { hp: 40, atk: 20, def: 20, spatk: 20, spdef: 20, spe: 20, ...stats },
  moves, ...extra
});
const TACKLE = { name: 'tackle', type: 'normal', power: 40, damage_class: 'physical' };
const EMBER = { name: 'ember', type: 'fire', power: 40, damage_class: 'special' };
const VINE = { name: 'vine-whip', type: 'grass', power: 45, damage_class: 'physical' };
const SURF = { name: 'surf', type: 'water', power: 90, damage_class: 'special' };
const LICK = { name: 'lick', type: 'ghost', power: 30, damage_class: 'physical' };

const weakMe = () => [mon(1, 5, ['grass'], { hp: 20, atk: 8, def: 8, spatk: 8, spdef: 8, spe: 5 }, [VINE, TACKLE])];
const strongFoes = () => [
  mon(6, 60, ['fire'], { hp: 200, atk: 150, def: 120, spatk: 150, spdef: 120, spe: 120 }, [EMBER, TACKLE]),
  mon(9, 60, ['water'], { hp: 200, atk: 150, def: 120, spatk: 150, spdef: 120, spe: 120 }, [SURF])
];

async function playOut(b, pick = () => ({ kind: 'move', index: 0 }), max = 2000) {
  const all = [];
  for (let i = 0; i < max && !b.state.over; i++) all.push(...await b.choose(pick(b, i)));
  return all;
}

const allFighters = b => [...b.state.me.team, ...b.state.foe.team];

test('prereader never faints over 500 random turns against an overwhelming team', async () => {
  let turns = 0;
  for (let seed = 1; turns < 500 || seed <= 5; seed++) {
    const rng = seededRng(seed);
    const b = createBattle({
      myTeam: [...weakMe(), mon(4, 3, ['fire'], { hp: 15, atk: 5, def: 5, spe: 3 }, [EMBER])],
      enemyTeam: [mon(150, 90, ['psychic'], { hp: 10000, atk: 300, def: 9999, spatk: 300, spdef: 9999, spe: 300 }, [SURF, EMBER, TACKLE])],
      profile: 'prereader', rng, wild: false, leader: true
    });
    const pickRng = seededRng(seed * 97);
    for (let t = 0; t < 500 && !b.state.over; t++) {
      const r = pickRng();
      const ev = r < 0.2 ? await b.choose({ kind: 'switch', index: b.state.me.active ? 0 : 1 })
        : await b.choose({ kind: 'move', index: Math.floor(pickRng() * 2) });
      assert.ok(!ev.some(e => e.type === 'faint' && e.side === 'me'), 'prereader mon fainted');
      assert.ok(!ev.some(e => e.type === 'end' && e.winner === 'foe'), 'prereader lost');
      for (const f of b.state.me.team) assert.ok(f.hp >= 1, 'hp floor');
      turns++;
    }
    assert.equal(b.state.winner, 'me');
  }
  assert.ok(turns >= 500);
});

test('prereader hits always do at least 15%, even into an immunity', async () => {
  const b = createBattle({
    myTeam: [mon(1, 5, ['normal'], { atk: 1, spe: 99 }, [TACKLE])],
    enemyTeam: [mon(92, 50, ['ghost'], { hp: 100, def: 500 }, [LICK])],
    profile: 'prereader', rng: seededRng(3)
  });
  const ev = await b.choose({ kind: 'move', index: 0 });
  const hit = ev.find(e => e.type === 'move' && e.side === 'me');
  assert.ok(hit.dmg >= 15, `dmg ${hit.dmg}`);
  const done = await playOut(b);
  assert.equal(b.state.winner, 'me');
  assert.ok(done.length > 0);
});

test('reader can lose; winner is foe and no xp is reported', async () => {
  const b = createBattle({ myTeam: weakMe(), enemyTeam: strongFoes(), profile: 'reader', rng: seededRng(5) });
  const ev = await playOut(b);
  assert.equal(b.state.winner, 'foe');
  const endEv = ev.find(e => e.type === 'end');
  assert.deepEqual(endEv.xp, []);
  assert.equal(ev.filter(e => e.type === 'end').length, 1);
});

test('leader phase 2 fires exactly once, only on the last mon, heals and powers up', async () => {
  for (let seed = 1; seed <= 40; seed++) {
    const foes = [
      mon(10, 20, ['bug'], { hp: 60 }, [TACKLE]),
      mon(11, 22, ['rock'], { hp: 90, atk: 30 }, [TACKLE])
    ];
    const me = [mon(9, 50, ['water'], { hp: 300, atk: 90, spatk: 90, def: 80, spdef: 80, spe: 60 }, [SURF, TACKLE])];
    const b = createBattle({ myTeam: me, enemyTeam: foes, profile: 'reader', rng: seededRng(seed), leader: true });
    const ev = await playOut(b, (bb, i) => ({ kind: 'move', index: i % 2 }));
    const p2 = ev.filter(e => e.type === 'phase2');
    assert.equal(p2.length, 1, `seed ${seed}: phase2 count ${p2.length}`);
    // it happened while the ace (index 1) was out
    const idx = ev.indexOf(p2[0]);
    assert.ok(ev.slice(0, idx).some(e => e.type === 'send' && e.side === 'foe' && e.index === 1));
    assert.equal(b.state.phase, 2);
    assert.equal(b.state.foe.team[1].atkMult, 1.25);
    assert.equal(b.state.winner, 'me');
  }
});

test('phase 2 heals +25% of max hp', async () => {
  const ace = mon(11, 20, ['rock'], { hp: 100 }, [TACKLE]);
  const b = createBattle({
    myTeam: [mon(9, 40, ['water'], { hp: 999, spatk: 60, spe: 99 }, [SURF])],
    enemyTeam: [ace], profile: 'reader', rng: seededRng(8), leader: true
  });
  let ev = [];
  while (!ev.some(e => e.type === 'phase2')) ev = await b.choose({ kind: 'move', index: 0 });
  const hit = ev.find(e => e.type === 'move' && e.side === 'me');
  const p2 = ev.find(e => e.type === 'phase2');
  const maxHp = b.state.foe.team[0].maxHp;
  assert.ok(hit.hpAfter >= 1 && hit.hpAfter <= maxHp * 0.5);
  assert.equal(p2.hpAfter, Math.min(maxHp, hit.hpAfter + Math.round(maxHp * 0.25)));
});

test('non-leader trainers and wild battles never enter phase 2', async () => {
  const b = createBattle({
    myTeam: [mon(9, 50, ['water'], { hp: 300, spatk: 90, spe: 60 }, [SURF])],
    enemyTeam: [mon(11, 22, ['rock'], { hp: 90 }, [TACKLE])], profile: 'reader', rng: seededRng(2), leader: false
  });
  const ev = await playOut(b);
  assert.equal(ev.filter(e => e.type === 'phase2').length, 0);
});

test('no NaN or out-of-range hp, even with junk stats', async () => {
  for (let seed = 1; seed <= 30; seed++) {
    const junk = { id: 7, level: 'x', types: [], stats: { hp: NaN, atk: undefined }, moves: [] };
    const junk2 = { id: 8, level: 12, types: [{ type: { name: 'fire' } }], stats: { maxHp: 30, speed: 12 }, moves: ['ember', 'growl'] };
    const lookup = n => ({ ember: { type: 'fire', power: 40, damage_class: 'special' }, growl: { type: 'normal', power: null, damage_class: 'status' } })[n] || null;
    const b = createBattle({
      myTeam: [junk, mon(1, 5, ['grass'], {}, [VINE])], enemyTeam: [junk2, mon(2, 7, ['grass'], {}, [VINE])],
      profile: seed % 2 ? 'reader' : 'prereader', rng: seededRng(seed), moveLookup: lookup, leader: true
    });
    assert.equal(b.state.foe.team[0].moves.length, 1, 'status move filtered');
    const ev = await playOut(b, (bb, i) => ({ kind: i % 3 === 2 ? 'switch' : 'move', index: i % 2 }));
    for (const e of ev) {
      if ('dmg' in e) assert.ok(Number.isFinite(e.dmg) && e.dmg >= 0);
      if ('hpAfter' in e) assert.ok(Number.isFinite(e.hpAfter));
    }
    for (const f of allFighters(b)) {
      assert.ok(Number.isFinite(f.hp) && f.hp >= 0 && f.hp <= f.maxHp, `hp ${f.hp}/${f.maxHp}`);
    }
    assert.ok(b.state.over);
  }
});

test('catching always succeeds for a prereader, with every ball', async () => {
  for (let seed = 1; seed <= 200; seed++) {
    for (const ball of ['poke', 'great', 'ultra', 'master']) {
      const b = createBattle({
        myTeam: weakMe(), enemyTeam: [mon(150, 70, ['psychic'], { hp: 300 }, [SURF], { captureRate: 3 })],
        profile: 'prereader', rng: seededRng(seed), wild: true
      });
      const ev = await b.choose({ kind: 'ball', ball });
      const c = ev.find(e => e.type === 'catch');
      assert.equal(c.success, true);
      assert.equal(c.shakes, 3);
      const end = ev.find(e => e.type === 'end');
      assert.equal(end.winner, 'me');
      assert.equal(end.caught, true);
      assert.equal(end.caughtId, 150);
      assert.ok(b.state.over);
    }
  }
});

test('reader catch: master always works, hard catches can fail with 0-2 shakes, then the foe acts', async () => {
  let fails = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const make = () => createBattle({
      myTeam: weakMe(), enemyTeam: [mon(150, 70, ['psychic'], { hp: 300 }, [SURF], { captureRate: 3 })],
      profile: 'reader', rng: seededRng(seed), wild: true
    });
    const m = await make().choose({ kind: 'ball', ball: 'master' });
    assert.equal(m.find(e => e.type === 'catch').success, true);
    const ev = await make().choose({ kind: 'ball', ball: 'poke' });
    const c = ev.find(e => e.type === 'catch');
    assert.ok(c.shakes >= 0 && c.shakes <= 3);
    if (!c.success) {
      fails++;
      assert.ok(c.shakes <= 2);
      assert.ok(ev.some(e => e.type === 'move' && e.side === 'foe'));
    }
  }
  assert.ok(fails > 80, `expected mostly fails at captureRate 3, got ${fails}`);
});

test('balls do nothing in trainer battles', async () => {
  const b = createBattle({ myTeam: weakMe(), enemyTeam: strongFoes(), profile: 'prereader', rng: seededRng(1), wild: false });
  assert.deepEqual(await b.choose({ kind: 'ball', ball: 'master' }), []);
  assert.equal(b.state.over, false);
  assert.ok(BALL_MODS.master > BALL_MODS.ultra);
});

test('determinism: same seed, same choices, same events', async () => {
  const run = async seed => {
    const b = createBattle({
      myTeam: [mon(4, 20, ['fire'], { hp: 60, spe: 30 }, [EMBER, TACKLE]), mon(7, 18, ['water'], { hp: 55 }, [SURF])],
      enemyTeam: [mon(1, 19, ['grass'], { hp: 58, spe: 25 }, [VINE, TACKLE]), mon(25, 21, ['electric'], { hp: 50, spe: 60 }, [TACKLE])],
      profile: 'reader', rng: seededRng(seed), leader: true
    });
    return JSON.stringify(await playOut(b, (bb, i) => (i === 2 ? { kind: 'switch', index: 1 } : { kind: 'move', index: i % 2 })));
  };
  assert.equal(await run(42), await run(42));
  assert.notEqual(await run(42), await run(43));
});

test('speed decides order', async () => {
  const fast = mon(1, 10, ['normal'], { spe: 200, hp: 300 }, [TACKLE]);
  const slow = mon(2, 10, ['normal'], { spe: 1, hp: 300 }, [TACKLE]);
  let b = createBattle({ myTeam: [fast], enemyTeam: [slow], rng: seededRng(1) });
  let ev = await b.choose({ kind: 'move', index: 0 });
  assert.equal(ev.filter(e => e.type === 'move')[0].side, 'me');
  b = createBattle({ myTeam: [mon(2, 10, ['normal'], { spe: 1, hp: 300 }, [TACKLE])], enemyTeam: [mon(1, 10, ['normal'], { spe: 200, hp: 300 }, [TACKLE])], rng: seededRng(1) });
  ev = await b.choose({ kind: 'move', index: 0 });
  assert.equal(ev.filter(e => e.type === 'move')[0].side, 'foe');
});

test('foe intent is committed before the player acts and is what the foe uses', async () => {
  for (let seed = 1; seed <= 50; seed++) {
    const b = createBattle({
      myTeam: [mon(1, 30, ['grass'], { hp: 500 }, [VINE])],
      enemyTeam: [mon(6, 30, ['fire'], { hp: 500 }, [EMBER, TACKLE, SURF])],
      profile: 'reader', rng: seededRng(seed)
    });
    for (let t = 0; t < 5 && !b.state.over; t++) {
      const i = b.foeIntent();
      const want = b.state.foe.team[b.state.foe.active].moves[i].name;
      const ev = await b.choose({ kind: 'move', index: 0 });
      const used = ev.find(e => e.type === 'move' && e.side === 'foe');
      if (used) assert.equal(used.move.name, want);
    }
  }
});

test('switching: newcomer takes the committed hit; invalid switches are ignored', async () => {
  const b = createBattle({
    myTeam: [mon(1, 10, ['grass'], { hp: 100 }, [VINE]), mon(7, 10, ['water'], { hp: 100 }, [SURF])],
    enemyTeam: [mon(6, 10, ['fire'], { hp: 100 }, [EMBER])], rng: seededRng(4)
  });
  assert.deepEqual(await b.choose({ kind: 'switch', index: 0 }), []);
  assert.deepEqual(await b.choose({ kind: 'switch', index: 9 }), []);
  const ev = await b.choose({ kind: 'switch', index: 1 });
  assert.equal(ev[0].type, 'switch');
  assert.equal(b.state.me.active, 1);
  const hit = ev.find(e => e.type === 'move' && e.side === 'foe');
  assert.equal(hit.eff, 0.5);  // ember into water
  assert.equal(b.state.me.team[1].hp, hit.hpAfter);
});

test('reader fainted mon is replaced by the next one alive', async () => {
  const b = createBattle({ myTeam: [...weakMe(), ...weakMe().map(m => ({ ...m, id: 2 }))], enemyTeam: strongFoes(), profile: 'reader', rng: seededRng(9) });
  const ev = await playOut(b);
  assert.ok(ev.some(e => e.type === 'send' && e.side === 'me' && e.index === 1));
});

test('xp is reported per mon in the end event using engine.applyXp', async () => {
  const me = [mon(4, 20, ['fire'], { hp: 200, atk: 80, spatk: 80, spe: 90 }, [EMBER], { xp: 200 })];
  const foes = [mon(1, 5, ['grass'], { hp: 20 }, [TACKLE], { base_experience: 64 }), mon(2, 6, ['grass'], { hp: 20 }, [TACKLE])];
  const b = createBattle({ myTeam: me, enemyTeam: foes, profile: 'reader', rng: seededRng(1) });
  const ev = await playOut(b);
  const end = ev.find(e => e.type === 'end');
  assert.equal(end.winner, 'me');
  assert.equal(end.xp.length, 1);
  const gained = Math.floor(64 / 2 + 5 * 3) + Math.floor(60 / 2 + 6 * 3);
  assert.deepEqual(end.xp[0], { id: 4, gained, levelsUp: applyXp({ level: 20, xp: 200 }, gained).ups });
  assert.ok(end.xp[0].levelsUp >= 1);
});

test('wild run ends with fled; trainer run is ignored; finished battles ignore input', async () => {
  const w = createBattle({ myTeam: weakMe(), enemyTeam: strongFoes().slice(0, 1), rng: seededRng(1), wild: true });
  const ev = await w.choose({ kind: 'run' });
  assert.deepEqual(ev, [{ type: 'end', winner: null, fled: true, xp: [] }]);
  assert.deepEqual(await w.choose({ kind: 'move', index: 0 }), []);
  const t = createBattle({ myTeam: weakMe(), enemyTeam: strongFoes(), rng: seededRng(1) });
  assert.deepEqual(await t.choose({ kind: 'run' }), []);
});

test('two battles share nothing', async () => {
  const a = createBattle({ myTeam: weakMe(), enemyTeam: strongFoes(), rng: seededRng(1), leader: true });
  const b = createBattle({ myTeam: weakMe(), enemyTeam: strongFoes(), rng: seededRng(1), leader: true });
  await playOut(a);
  assert.equal(b.state.turn, 0);
  assert.equal(b.state.over, false);
  assert.equal(b.state.me.team[0].hp, b.state.me.team[0].maxHp);
});
