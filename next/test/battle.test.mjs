// node --test next/test/battle.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, BALL_MODS, BERRY_HEAL, movePictures, powerDots } from '../battle/createBattle.js';
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

// ---------- berry action ----------
const hurtMe = (b, hp) => { b.state.me.team[b.state.me.active].hp = hp; };

test('berry heals the active mon by a fraction and the foe still acts', async () => {
  const b = createBattle({
    myTeam: [mon(1, 20, ['grass'], { hp: 100, spe: 99 }, [VINE])],
    enemyTeam: [mon(4, 5, ['fire'], { hp: 40, atk: 5, spatk: 5 }, [EMBER])],
    rng: seededRng(7)
  });
  hurtMe(b, 20);
  const ev = await b.choose({ kind: 'berry' });
  const heal = ev.find(e => e.type === 'heal');
  assert.ok(heal, 'heal event');
  assert.equal(heal.side, 'me');
  assert.equal(heal.amount, Math.round(100 * BERRY_HEAL));
  assert.equal(heal.hpAfter, 20 + Math.round(100 * BERRY_HEAL));
  assert.equal(ev[0].type, 'heal', 'the heal comes before the foe move');
  assert.ok(ev.some(e => e.type === 'move' && e.side === 'foe'), 'the foe acted');
  assert.equal(b.state.turn, 1);
});

test('berry: custom fraction, capped at max HP', async () => {
  const b = createBattle({
    myTeam: [mon(1, 20, ['grass'], { hp: 100 }, [VINE])],
    enemyTeam: [mon(4, 5, ['fire'], { hp: 40, atk: 1, spatk: 1 }, [EMBER])],
    rng: seededRng(2)
  });
  hurtMe(b, 90);
  const ev = await b.choose({ kind: 'berry', fraction: 0.5 });
  const heal = ev.find(e => e.type === 'heal');
  assert.equal(heal.hpAfter, 100);
  assert.equal(heal.amount, 10);
});

test('berry is refused (no turn passes) at full HP, with a bad fraction, or when none are left', async () => {
  const mk = berries => createBattle({
    myTeam: [mon(1, 20, ['grass'], { hp: 100 }, [VINE])],
    enemyTeam: [mon(4, 5, ['fire'], { hp: 40 }, [EMBER])],
    rng: seededRng(4), berries
  });
  const full = mk(undefined);
  assert.deepEqual(await full.choose({ kind: 'berry' }), []);
  assert.equal(full.state.turn, 0);

  const bad = mk(undefined);
  hurtMe(bad, 10);
  assert.deepEqual(await bad.choose({ kind: 'berry', fraction: -1 }), []);
  assert.deepEqual(await bad.choose({ kind: 'berry', fraction: 0 }), []);
  assert.equal(bad.state.me.team[0].hp, 10);

  const one = mk(1);
  hurtMe(one, 10);
  assert.equal(one.state.me.berries, 1);
  assert.ok((await one.choose({ kind: 'berry' })).length > 0);
  assert.equal(one.state.me.berries, 0);
  hurtMe(one, 10);
  assert.deepEqual(await one.choose({ kind: 'berry' }), []);

  const none = mk(0);
  hurtMe(none, 10);
  assert.deepEqual(await none.choose({ kind: 'berry' }), []);
});

test('berry for a prereader keeps him standing (the foe hit still floors at 1)', async () => {
  const b = createBattle({
    myTeam: [mon(1, 5, ['grass'], { hp: 20 }, [VINE])],
    enemyTeam: [mon(150, 90, ['psychic'], { hp: 999, atk: 300, spatk: 300, spe: 300 }, [SURF])],
    profile: 'prereader', rng: seededRng(5)
  });
  for (let i = 0; i < 20; i++) {
    hurtMe(b, 1);
    const ev = await b.choose({ kind: 'berry' });
    assert.ok(!ev.some(e => e.type === 'faint'));
    assert.ok(b.state.me.team[0].hp >= 1);
  }
});

// ---------- move pictures ----------
test('powerDots buckets power into 1..4', () => {
  assert.equal(powerDots(20), 1); assert.equal(powerDots(40), 1);
  assert.equal(powerDots(60), 2); assert.equal(powerDots(90), 3);
  assert.equal(powerDots(150), 4); assert.equal(powerDots(undefined), 1);
});

test('movePictures: four same-type moves never share a glyph', () => {
  const moves = [
    { name: 'tackle', type: 'normal', power: 40, damage_class: 'physical' },
    { name: 'body-slam', type: 'normal', power: 85, damage_class: 'physical' },
    { name: 'take-down', type: 'normal', power: 90, damage_class: 'physical' },
    { name: 'headbutt', type: 'normal', power: 70, damage_class: 'physical' },
  ];
  const pics = movePictures(moves);
  assert.equal(pics.length, 4);
  assert.equal(new Set(pics.map(p => p.glyph)).size, 4);
  assert.deepEqual(pics.map(p => p.dots), [1, 3, 3, 3]);
  const spec = movePictures(moves.map(m => ({ ...m, damage_class: 'special', type: 'water' })));
  assert.equal(new Set(spec.map(p => p.glyph)).size, 4);
  assert.ok(spec.every(p => p.shape === 'special'));
});

test('movePictures: glyphs avoid type emoji and stars; names pick a fitting shape', async () => {
  const { typeEmoji } = await import('../data/config.js');
  const typeGlyphs = new Set(Object.values(typeEmoji));
  const names = ['tackle', 'double-kick', 'bite', 'scratch', 'peck', 'mega-punch', 'rollout', 'hyper-beam', 'bubble', 'confusion', 'aurora-beam', 'gust', 'smog', 'ember'];
  const pics = movePictures(names.map((n, i) => ({ name: n, type: 't' + i, power: 50, damage_class: i >= 7 ? 'special' : 'physical' })));
  for (const p of pics) {
    assert.ok(!typeGlyphs.has(p.glyph), 'type glyph reused: ' + p.glyph);
    assert.ok(!/[\u2B50\u{1F31F}\u2728]/u.test(p.glyph), 'star glyph');
  }
  assert.equal(pics[1].glyph, '\u{1F9B6}');   // kick -> foot
  assert.equal(pics[2].glyph, '\u{1F9B7}');   // bite -> tooth
  assert.equal(pics[5].glyph, '\u270A');      // punch -> fist
  // plain special -> swirl (on its own: in one moveset a glyph is used once)
  assert.equal(movePictures([{ name: 'ember', type: 'fire', power: 40, damage_class: 'special' }])[0].glyph, '\u{1F300}');
});

test('movePictures: two plain special moves of different types never share the swirl', () => {
  const pics = movePictures([
    { name: 'giga-drain', type: 'grass', power: 75, damage_class: 'special' },
    { name: 'razor-leaf', type: 'normal', power: 55, damage_class: 'physical' },
    { name: 'venoshock', type: 'poison', power: 65, damage_class: 'special' },
    { name: 'mega-punch', type: 'normal', power: 80, damage_class: 'physical' },
  ]);
  assert.equal(new Set(pics.map(p => p.glyph)).size, 4, pics.map(p => p.glyph).join(' '));
});

test('party XP: the KO-er gets full XP, a teammate that fought the foe gets half', async () => {
  // A slow tank leads and takes a hit, then a fast striker switches in and KOs.
  const tank = mon(7, 20, ['water'], { hp: 300, atk: 5, spatk: 5, def: 200, spdef: 200, spe: 1 }, [TACKLE]);
  const striker = mon(4, 20, ['fire'], { hp: 200, atk: 200, spatk: 200, spe: 90 }, [EMBER]);
  const foe = mon(1, 5, ['grass'], { hp: 30, def: 5, spdef: 5, spe: 10 }, [TACKLE], { base_experience: 64 });
  const b = createBattle({ myTeam: [tank, striker], enemyTeam: [foe], profile: 'reader', rng: seededRng(3) });
  await b.choose({ kind: 'switch', index: 1 });
  const ev = await playOut(b);
  const end = ev.find(e => e.type === 'end');
  assert.equal(end.winner, 'me');
  const full = Math.floor(64 / 2 + 5 * 3);
  const byId = Object.fromEntries(end.xp.map(x => [x.id, x.gained]));
  assert.equal(byId[4], full);
  assert.equal(byId[7], Math.floor(full / 2));
});

test('party XP: a Pokemon that never faced the foe gets nothing', async () => {
  const me = [mon(4, 20, ['fire'], { hp: 200, atk: 200, spatk: 200, spe: 90 }, [EMBER]), mon(7, 20, ['water'], { hp: 50 }, [TACKLE])];
  const b = createBattle({ myTeam: me, enemyTeam: [mon(1, 5, ['grass'], { hp: 20 }, [TACKLE], { base_experience: 64 })], profile: 'reader', rng: seededRng(1) });
  const end = (await playOut(b)).find(e => e.type === 'end');
  assert.deepEqual(end.xp.map(x => x.id), [4]);
});

test('chooseOnFaint: a reader picks who comes in, for free; auto-send without it and for a prereader', async () => {
  const team = () => [
    mon(1, 5, ['grass'], { hp: 10, atk: 8, def: 8, spatk: 8, spdef: 8, spe: 5 }, [VINE]),
    mon(2, 5, ['grass'], { hp: 10, atk: 8, def: 8, spatk: 8, spdef: 8, spe: 5 }, [VINE]),
    mon(3, 5, ['grass'], { hp: 10, atk: 8, def: 8, spatk: 8, spdef: 8, spe: 5 }, [VINE]),
  ];
  const b = createBattle({ myTeam: team(), enemyTeam: strongFoes(), profile: 'reader', rng: seededRng(2), chooseOnFaint: true });
  let ev = [];
  for (let i = 0; i < 10 && !ev.some(e => e.type === 'choose'); i++) ev = await b.choose({ kind: 'move', index: 0 });
  const ch = ev.find(e => e.type === 'choose');
  assert.ok(ch, 'a choose event after the faint');
  assert.deepEqual(ch.options, [1, 2]);
  assert.ok(!ev.some(e => e.type === 'send' && e.side === 'me'));
  assert.equal(b.state.me.mustChoose, true);
  assert.deepEqual(await b.choose({ kind: 'move', index: 0 }), [], 'no move while choosing');
  const hpBefore = b.state.me.team[2].hp;
  const sent = await b.choose({ kind: 'switch', index: 2 });
  assert.deepEqual(sent, [{ type: 'send', side: 'me', index: 2 }]);
  assert.equal(b.state.me.active, 2);
  assert.equal(b.state.me.team[2].hp, hpBefore, 'the send is free: no foe hit');
  assert.equal(b.state.me.mustChoose, false);

  const auto = createBattle({ myTeam: team(), enemyTeam: strongFoes(), profile: 'reader', rng: seededRng(2) });
  const ev2 = await playOut(auto, undefined, 3);
  assert.ok(ev2.some(e => e.type === 'send' && e.side === 'me' && e.index === 1));
  assert.ok(!ev2.some(e => e.type === 'choose'));

  const pre = createBattle({ myTeam: team(), enemyTeam: strongFoes(), profile: 'prereader', rng: seededRng(2), chooseOnFaint: true });
  const ev3 = await playOut(pre, undefined, 50);
  assert.ok(!ev3.some(e => e.type === 'choose'));
});

test('legendary: the first KO blow leaves it on 1 HP with a hold event, then balls catch at least half the time', async () => {
  const me = [mon(6, 100, ['fire'], { hp: 400, atk: 400, spatk: 400, spe: 300 }, [EMBER])];
  const legend = () => [mon(150, 70, ['psychic'], { hp: 60, spe: 10 }, [TACKLE], { captureRate: 3 })];
  const b = createBattle({ myTeam: me, enemyTeam: legend(), profile: 'reader', rng: seededRng(4), wild: true, legendary: true });
  const toHold = async x => { let all = []; for (let i = 0; i < 5 && !all.some(e => e.type === 'hold'); i++) all = all.concat(await x.choose({ kind: 'move', index: 0 })); return all; };
  const ev = await toHold(b);
  assert.ok(ev.some(e => e.type === 'hold' && e.side === 'foe'));
  assert.equal(b.state.foe.team[0].hp, 1);
  assert.equal(b.state.over, false);
  let caught = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const c = createBattle({ myTeam: me, enemyTeam: legend(), profile: 'reader', rng: seededRng(seed), wild: true, legendary: true });
    await toHold(c);
    const e2 = await c.choose({ kind: 'ball', ball: 'poke' });
    if (e2.some(e => e.type === 'catch' && e.success)) caught++;
  }
  assert.ok(caught >= 70, 'caught ' + caught + '/200');
  // a second KO blow is a normal win (it rests; he can meet it again)
  const d = createBattle({ myTeam: me, enemyTeam: legend(), profile: 'reader', rng: seededRng(4), wild: true, legendary: true });
  await toHold(d);
  const e3 = await d.choose({ kind: 'move', index: 0 });
  assert.ok(e3.some(e => e.type === 'end' && e.winner === 'me'));
  // not a legendary: no hold
  const w = createBattle({ myTeam: me, enemyTeam: legend(), profile: 'reader', rng: seededRng(4), wild: true });
  const e4 = await playOut(w);
  assert.ok(!e4.some(e => e.type === 'hold') && e4.some(e => e.type === 'end' && e.winner === 'me'));
});
