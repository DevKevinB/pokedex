// node --test next/test/round2.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  R2_CHAMP, r2Key, r2Trainers, r2Ace, GIMMICKS, CHAPTER_GIMMICK, gimmickFor, gimmickInfo, makeGimmick,
  r2Unlocked, isR2Cleared, isR2ChapterDone, isR2ChapterOpen, isR2TrainerOpen, r2Current, r2Next,
  goldChapters, r2BattleParams, parseR2End, applyR2Win, r2Marks, r2Return,
  WEATHER_BOOST, CHARGE_MULT, BARRIER_MULT
} from '../data/round2.js';
import { CHAPTERS, chapterKey, leaderIdx } from '../data/chapters.js';
import { GYMS } from '../data/gymdata.js';
import { isClearedKey, cleanPlayer } from '../core/validate.js';
import { createBattle } from '../battle/createBattle.js';
import { seededRng } from '../data/engine.js';

const fresh = () => ({ badges: [], caught: [], shinies: [], team: [], mons: {}, gyms: { beaten: {} }, road: { chapter: 0, cleared: {}, bloomed: [], r2bloomed: [] } });
const champion = () => {
  const p = fresh();
  for (let i = 0; i < CHAPTERS.length; i++) {
    for (let j = 0; j <= leaderIdx(i); j++) p.road.cleared[chapterKey(i, j)] = true;
    p.road.bloomed.push(i);
  }
  return p;
};
const winR2Chapter = (p, i) => { for (let j = 0; j <= leaderIdx(i); j++) assert.ok(applyR2Win(p, 'round2:' + i + ':' + j)); };

// ---------------------------------------------------------------- data

test('the remix: Champion-level (80 -> 95 by chapter), same trainers, leader ace stays last, GYMS untouched', () => {
  const before = JSON.stringify(GYMS);
  for (let i = 0; i < CHAPTERS.length; i++) {
    const r2 = r2Trainers(i);
    assert.equal(r2.length, CHAPTERS[i].trainers.length);
    r2.forEach((t, j) => {
      const orig = CHAPTERS[i].trainers[j];
      assert.equal(t.name, orig.name);
      assert.deepEqual(t.team.map(m => m.id).sort(), orig.team.map(m => m.id).sort());
      t.team.forEach(m => {
        const o = orig.team.find(x => x.id === m.id);
        assert.ok(m.level >= Math.min(100, o.level + 15), 'never easier than +15');
        assert.ok(m.level <= 100);
      });
    });
    const all = r2.flatMap(t => t.team.map(m => m.level));
    assert.ok(Math.max(...all) >= 80, 'chapter ' + i + ' tops out at Champion level or more');
    assert.ok(Math.min(...all) >= 70, 'chapter ' + i + ' is no pushover after the Lv80 Champion (regression)');
    const L = leaderIdx(i);
    const lead = CHAPTERS[i].trainers[L].team;
    assert.equal(r2Ace(i).id, lead[lead.length - 1].id, 'ace is the leader\'s last mon');
    assert.equal(r2[L].team[r2[L].team.length - 1].id, r2Ace(i).id);
    if (lead.length > 2) assert.notDeepEqual(r2[L].team.map(m => m.id), lead.map(m => m.id), 'leader is remixed');
  }
  assert.equal(r2Ace(11).level, 95);            // Champion Rex Lv80 -> 95
  assert.equal(JSON.stringify(GYMS), before);
  assert.ok(Object.isFrozen(r2Trainers(0)));
});

test('twelve distinct gimmicks, one per chapter, with short uppercase words', () => {
  const keys = CHAPTERS.map((_, i) => gimmickFor(i));
  assert.equal(new Set(keys).size, 12);
  keys.forEach(k => {
    const g = gimmickInfo(k);
    assert.ok(g && g.icon && g.word);
    assert.equal(g.word, g.word.toUpperCase());
    assert.ok(g.word.split(/\s+/).length <= 6);
    assert.ok(makeGimmick(k), k);
  });
  assert.equal(CHAPTER_GIMMICK.water, 'rain');
  assert.equal(CHAPTER_GIMMICK.fire, 'sun');
  assert.equal(CHAPTER_GIMMICK.rock, 'sandstorm');
  assert.equal(Object.keys(GIMMICKS).length, 12);
  assert.equal(gimmickInfo('__proto__'), null);
  assert.equal(makeGimmick('nope'), null);
  assert.equal(gimmickFor(99), null);
});

test('battle params: onEnd round2:i:j, gimmick only on the leader', () => {
  const bp = r2BattleParams(1, 0);
  assert.equal(bp.onEnd, 'round2:1:0');
  assert.equal(bp.gimmick, undefined);
  assert.equal(bp.trainer.leader, false);
  const lp = r2BattleParams(1, leaderIdx(1));
  assert.equal(lp.gimmick, 'rain');
  assert.equal(lp.trainer.leader, true);
  assert.equal(lp.returnTo, 'road');
  assert.equal(r2BattleParams(0, 9), null);
  assert.deepEqual(parseR2End('round2:11:4'), { i: 11, j: 4 });
  for (const bad of ['round2:12:0', 'round2:10:3', 'chapter:1:1', 'round2:1', null, 5, 'round2:01:0x']) assert.equal(parseR2End(bad), null, String(bad));
});

// ---------------------------------------------------------------- progress

test('Round 2 is locked until the Champion chapter is done', () => {
  const p = fresh();
  assert.equal(r2Unlocked(p), false);
  assert.equal(r2Next(p), null);
  assert.equal(isR2ChapterOpen(p, 0), false);
  assert.equal(applyR2Win(p, 'round2:0:0'), null, 'no win recorded while locked');
  assert.deepEqual(p.road.cleared, {});
  const c = champion();
  assert.equal(r2Unlocked(c), true);
  assert.deepEqual(r2Next(c), { i: 0, j: 0 });
  // the classic Champion counts too
  const k = fresh(); k.gyms.beaten['elite:4'] = true;
  assert.equal(r2Unlocked(k), true);
});

test('Round 2 climbs trainer by trainer and chapter by chapter', () => {
  const p = champion();
  assert.equal(isR2TrainerOpen(p, 0, 1), false);
  assert.equal(isR2ChapterOpen(p, 1), false);
  assert.equal(applyR2Win(p, 'round2:0:2'), null, 'a locked trainer cannot be won');
  const o = applyR2Win(p, 'round2:0:0');
  assert.deepEqual(o, { i: 0, j: 0, leader: false, bloom: false, ace: 0, newShiny: false });
  assert.equal(isR2TrainerOpen(p, 0, 1), true);
  assert.equal(isR2TrainerOpen(p, 0, 0), true, 'rematches stay open');
  winR2Chapter(p, 0);
  assert.equal(isR2ChapterDone(p, 0), true);
  assert.equal(isR2ChapterOpen(p, 1), true);
  assert.deepEqual(r2Next(p), { i: 1, j: 0 });
  assert.equal(r2Current(p), 1);
  assert.deepEqual(goldChapters(p), [0]);
  for (let i = 1; i < CHAPTERS.length; i++) winR2Chapter(p, i);
  assert.equal(r2Next(p), null);
  assert.equal(r2Current(p), CHAPTERS.length);
  assert.equal(goldChapters(p).length, 12);
  for (const k of Object.keys(p.road.cleared)) assert.ok(isClearedKey(k), k);
});

test('classic Round 2 wins count (read only)', () => {
  const p = champion();
  for (let j = 0; j <= 4; j++) p.gyms.beaten['rock:' + j + ':r2'] = true;
  assert.equal(isR2Cleared(p, 0, 4), true);
  assert.equal(isR2ChapterDone(p, 0), true);
  assert.deepEqual(r2Next(p), { i: 1, j: 0 });
  assert.equal(Object.keys(p.road.cleared).some(k => k.startsWith('r2-')), false);
});

test('a Round 2 leader win: gold bloom once, the ace as a SHINY, never removes anything', () => {
  const p = champion();
  const ace = r2Ace(1);
  p.caught = [7]; p.team = [7]; p.mons = { 7: { level: 50, xp: 3 } };
  winR2Chapter(p, 0);
  for (let j = 0; j < leaderIdx(1); j++) applyR2Win(p, 'round2:1:' + j);
  const o = applyR2Win(p, 'round2:1:' + leaderIdx(1));
  assert.equal(o.leader, true);
  assert.equal(o.bloom, true);
  assert.equal(o.ace, ace.id);
  assert.equal(o.newShiny, true);
  assert.deepEqual(p.road.r2bloomed, [0, 1]);
  assert.ok(p.caught.includes(ace.id));
  assert.ok(p.shinies.includes(ace.id));
  assert.deepEqual(p.mons[ace.id], { level: ace.level, xp: 0 });
  assert.ok(p.team.includes(ace.id));
  assert.ok(p.caught.includes(7) && p.team[0] === 7);
  // rematch: no second bloom, no second shiny, nothing lowered
  p.mons[ace.id].level = 100;
  const again = applyR2Win(p, 'round2:1:' + leaderIdx(1));
  assert.equal(again.bloom, false);
  assert.equal(again.newShiny, false);
  assert.equal(p.mons[ace.id].level, 100);
  assert.equal(p.shinies.filter(x => x === ace.id).length, 1);
  assert.deepEqual(r2Marks(o), { bloom: true, shiny: true });
  assert.deepEqual(r2Marks(null), { bloom: false, shiny: false });
});

test('an ace he already owns just turns shiny (level kept, team untouched)', () => {
  const p = champion();
  const ace = r2Ace(0);
  p.caught = [ace.id]; p.team = [ace.id]; p.mons = { [ace.id]: { level: 12, xp: 5 } };
  winR2Chapter(p, 0);
  assert.ok(p.shinies.includes(ace.id));
  assert.deepEqual(p.mons[ace.id], { level: 12, xp: 5 });
  assert.deepEqual(p.team, [ace.id]);
});

test('r2Return: re-applies idempotently and rebuilds the celebration from marks', () => {
  const p = champion();
  for (let j = 0; j < leaderIdx(0); j++) applyR2Win(p, 'round2:0:' + j);
  const onEnd = 'round2:0:' + leaderIdx(0);
  const early = applyR2Win(p, onEnd);
  const back = r2Return(p, onEnd, 'win', r2Marks(early));
  assert.equal(back.bloom, true);
  assert.equal(back.newShiny, true);
  assert.equal(r2Return(p, onEnd, 'lose', r2Marks(early)), null);
  // the early write was lost: r2Return repairs it
  const q = champion();
  for (let j = 0; j < leaderIdx(0); j++) applyR2Win(q, 'round2:0:' + j);
  const rep = r2Return(q, onEnd, 'win', null);
  assert.equal(rep.bloom, true);
  assert.deepEqual(q.road.r2bloomed, [0]);
});

test('Round 2 progress survives validate.cleanPlayer', () => {
  const p = champion();
  winR2Chapter(p, 0);
  applyR2Win(p, 'round2:1:0');
  const c = cleanPlayer({ name: 'GABE', profile: 'reader', ...p });
  assert.equal(c.road.cleared['r2-c0-t4'], true);
  assert.equal(c.road.cleared['r2-c1-t0'], true);
  assert.deepEqual(c.road.r2bloomed, [0]);
  assert.deepEqual(goldChapters(c), [0]);
  assert.deepEqual(r2Next(c), { i: 1, j: 1 });
  assert.equal(r2Key(3, 4), 'r2-c3-t4');
  assert.equal(R2_CHAMP, 11);
});

// ---------------------------------------------------------------- createBattle gimmick hook

const mon = (id, level, types, stats, moves) => ({
  id, level, name: 'MON' + id, types,
  stats: { hp: 200, atk: 40, def: 40, spatk: 40, spdef: 40, spe: 40, ...stats }, moves
});
const TACKLE = { name: 'tackle', type: 'normal', power: 40, damage_class: 'physical' };
const SURF = { name: 'surf', type: 'water', power: 90, damage_class: 'special' };
const EMBER = { name: 'ember', type: 'fire', power: 40, damage_class: 'special' };
const SPARK = { name: 'spark', type: 'electric', power: 65, damage_class: 'physical' };

async function playOut(b, max = 400) {
  const all = [];
  for (let i = 0; i < max && !b.state.over; i++) all.push(...await b.choose({ kind: 'move', index: 0 }));
  return all;
}

test('no gimmick = the exact same fight as before (backwards compatible)', async () => {
  const mk = gimmick => createBattle({
    myTeam: [mon(1, 30, ['grass'], {}, [TACKLE])], enemyTeam: [mon(2, 30, ['normal'], {}, [TACKLE])],
    rng: seededRng(7), leader: true, ...(gimmick === undefined ? {} : { gimmick })
  });
  const a = await playOut(mk(undefined));
  const b = await playOut(mk(null));
  const c = await playOut(mk('rain'));             // a string is not a hook: ignored
  assert.deepEqual(b, a);
  assert.deepEqual(c, a);
  assert.equal(mk(undefined).state.gimmick, null);
});

test('gimmicks sleep until phase 2, then rain boosts water and damps fire', async () => {
  const seen = [];
  const g = makeGimmick('rain');
  const spy = { ...g, onDamage: x => { const m = g.onDamage(x); seen.push({ phase: x.phase, type: x.move.type, m }); return m; } };
  const b = createBattle({
    myTeam: [mon(1, 50, ['water'], { spatk: 60 }, [SURF, EMBER])],
    enemyTeam: [mon(9, 50, ['normal'], { hp: 400 }, [TACKLE])],
    rng: seededRng(3), leader: true, gimmick: spy
  });
  assert.equal(b.state.gimmick, 'rain');
  const ev = await playOut(b);
  assert.ok(ev.some(e => e.type === 'phase2'));
  assert.ok(ev.some(e => e.type === 'gimmick' && e.key === 'rain' && e.kind === 'start'));
  assert.ok(seen.filter(s => s.phase === 1).every(s => s.m === 1), 'nothing before phase 2');
  assert.ok(seen.some(s => s.phase === 2 && s.type === 'water' && s.m === WEATHER_BOOST));
  assert.equal(g.onDamage({ phase: 2, move: EMBER }), 0.5);
  assert.equal(makeGimmick('sun').onDamage({ phase: 2, move: SURF }), 0.5);
});

test('sandstorm chips non-rock mons each turn but never lands the final blow', async () => {
  const b = createBattle({
    myTeam: [mon(1, 40, ['grass'], { hp: 2000, atk: 200, def: 400, spdef: 400 }, [TACKLE])],
    enemyTeam: [mon(74, 40, ['rock', 'ground'], { hp: 500, atk: 1 }, [TACKLE])],
    rng: seededRng(1), leader: true, gimmick: makeGimmick('sandstorm')
  });
  const ev = await playOut(b, 600);
  const chips = ev.filter(e => e.type === 'gimmick' && e.kind === 'chip');
  assert.ok(chips.length > 0, 'the storm blew');
  assert.ok(chips.every(e => e.side === 'me'), 'rock/ground is immune');
  assert.ok(chips.every(e => e.hpAfter >= 1));
});

test('a prereader never faints, whatever the gimmick', async () => {
  for (const key of Object.keys(GIMMICKS)) {
    const b = createBattle({
      myTeam: [mon(1, 5, ['grass'], { hp: 20, atk: 8, def: 8, spatk: 8, spdef: 8, spe: 5 }, [TACKLE])],
      enemyTeam: [mon(150, 90, ['psychic'], { hp: 300, atk: 300, spatk: 300, spe: 300 }, [SPARK, SURF, TACKLE])],
      profile: 'prereader', rng: seededRng(11), leader: true, gimmick: makeGimmick(key)
    });
    const ev = await playOut(b, 500);
    assert.ok(!ev.some(e => e.type === 'faint' && e.side === 'me'), key);
    assert.ok(b.state.me.team.every(f => f.hp >= 1), key);
  }
});

test('a throwing gimmick never breaks the fight', async () => {
  const boom = () => { throw new Error('boom'); };
  const b = createBattle({
    myTeam: [mon(1, 30, ['grass'], {}, [TACKLE])], enemyTeam: [mon(2, 30, ['normal'], {}, [TACKLE])],
    rng: seededRng(2), leader: true, gimmick: { key: 'x', onPhase2: boom, onTurnStart: boom, onDamage: boom }
  });
  await playOut(b);
  assert.equal(b.state.over, true);
});

test('barrier halves the first hit only; charge doubles one electric move; vanish dodges one turn', () => {
  const events = [];
  const api = extra => ({ phase: 2, note: (kind) => events.push(kind), ...extra });
  const bar = makeGimmick('barrier');
  bar.onPhase2(api());
  assert.equal(bar.onDamage(api({ side: 'me', dmg: 30, move: TACKLE })), BARRIER_MULT);
  assert.equal(bar.onDamage(api({ side: 'me', dmg: 30, move: TACKLE })), 1);

  const ch = makeGimmick('charge');
  ch.onPhase2(api());
  assert.equal(ch.onDamage(api({ side: 'me', move: SPARK })), 1, 'only the foe is charged');
  assert.equal(ch.onDamage(api({ side: 'foe', move: TACKLE })), 1, 'only electric moves');
  assert.equal(ch.onDamage(api({ side: 'foe', move: SPARK })), CHARGE_MULT);
  assert.equal(ch.onDamage(api({ side: 'foe', move: SPARK })), 1, 'spent');
  ch.onTurnStart(api());       // one quiet turn
  assert.equal(ch.onDamage(api({ side: 'foe', move: SPARK })), 1);
  ch.onTurnStart(api());       // charged again
  assert.equal(ch.onDamage(api({ side: 'foe', move: SPARK })), CHARGE_MULT);

  const v = makeGimmick('vanish');
  v.onPhase2(api());
  v.onTurnStart(api());
  assert.equal(v.onDamage(api({ side: 'me', move: TACKLE })), 0);
  assert.equal(v.onDamage(api({ side: 'foe', move: TACKLE })), 1);
  v.onTurnStart(api());
  assert.equal(v.onDamage(api({ side: 'me', move: TACKLE })), 1, 'back after one turn');
  assert.ok(events.includes('hide') && events.includes('show') && events.includes('break') && events.includes('spend'));
});

test('roar, crown and tailwind boost the foe in phase 2 through the factory', async () => {
  for (const key of ['roar', 'crown', 'tailwind']) {
    const b = createBattle({
      myTeam: [mon(1, 50, ['grass'], { atk: 80 }, [TACKLE])],
      enemyTeam: [mon(2, 50, ['normal'], { hp: 300, spe: 10 }, [TACKLE])],
      rng: seededRng(5), leader: true, gimmick: makeGimmick(key)
    });
    const ev = await playOut(b, 800);
    assert.ok(ev.some(e => e.type === 'gimmick' && e.kind === 'boost'), key);
  }
  const lb = createBattle({
    myTeam: [mon(1, 50, ['water'], { atk: 60, def: 300, spdef: 300 }, [TACKLE])],
    enemyTeam: [mon(3, 50, ['grass'], { hp: 400 }, [TACKLE])],
    rng: seededRng(9), leader: true, gimmick: makeGimmick('leech')
  });
  const lev = await playOut(lb, 800);
  const chips = lev.filter(e => e.type === 'gimmick' && e.kind === 'chip');
  const heals = lev.filter(e => e.type === 'gimmick' && e.kind === 'heal');
  assert.ok(chips.length > 0 && chips.every(e => e.side === 'me'));
  assert.ok(heals.every(e => e.side === 'foe'));
});

test('the Round 2 marks survive the evolve screen\'s return-param cleaning', async () => {
  const { cleanReturnParams } = await import('../scenes/evolve.js');
  const back = cleanReturnParams({ result: 'win', onEnd: 'round2:0:4', roundTwo: r2Marks({ bloom: true, newShiny: true }) });
  assert.deepEqual(back.roundTwo, { bloom: true, shiny: true });
  assert.equal(back.onEnd, 'round2:0:4');
});
