// node --test next/test/dex.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as L from '../scenes/dex-logic.js';
import { cleanName, cleanPlayer } from '../core/validate.js';

const player = (o = {}) => ({ caught: [], team: [], mons: {}, shinies: [], nicks: {}, favorites: [], ...o });

test('649 names, in dex order, with the display quirks', () => {
  assert.equal(L.API_NAMES.length, 650);
  assert.equal(L.nameOf(1), 'BULBASAUR');
  assert.equal(L.nameOf(25), 'PIKACHU');
  assert.equal(L.nameOf(29), 'NIDORAN♀');
  assert.equal(L.nameOf(122), 'MR. MIME');
  assert.equal(L.nameOf(250), 'HO-OH');
  assert.equal(L.nameOf(649), 'GENESECT');
  assert.equal(L.nameOf(0), '#000');
  assert.equal(L.numOf(7), '#007');
});

test('search by name or number', () => {
  assert.deepEqual(L.searchIds('25').slice(0, 1), [25]);
  assert.deepEqual(L.searchIds('#025').slice(0, 1), [25]);
  assert.ok(L.searchIds('1').includes(151));
  assert.deepEqual(L.searchIds('pikachu'), [25]);
  assert.deepEqual(L.searchIds('PIKA'), [25]);
  assert.deepEqual(L.searchIds('mr mime'), [122]);
  assert.ok(L.searchIds('saur').includes(1) && L.searchIds('saur').includes(3));
  assert.equal(L.searchIds('mew')[0], 151, 'exact match first');
  assert.deepEqual(L.searchIds(''), []);
  assert.deepEqual(L.searchIds('<script>'), L.searchIds('script'));
  assert.deepEqual(L.searchIds('999'), []);
});

test('grid ids: generations, search, prereader caught-first', () => {
  assert.equal(L.gridIds().length, 649);
  const g2 = L.gridIds({ gen: 2 });
  assert.equal(g2[0], 152); assert.equal(g2.at(-1), 251);
  assert.deepEqual(L.gridIds({ query: 'pikachu' }), [25]);
  const pre = L.gridIds({ gen: 1, caught: [7, 150, 400], prereader: true, query: 'pikachu' });
  assert.deepEqual(pre, [7, 150], 'a prereader never searches, and sees only what he owns (no silhouettes)');
  assert.deepEqual(L.gridIds({ gen: 2, caught: [7], prereader: true }), [], 'nothing owned: empty, never shadows');
  assert.equal(L.genCount(1, [1, 2, 152]), 2);
  assert.equal(L.genCount(0, [1, 2, 152]), 3);
  assert.equal(L.genOf(495), 5);
  assert.equal(L.GENS.length, 6);
});

test('level info and shown name', () => {
  const p = player({ caught: [4], mons: { 4: { level: 12, xp: 0 } }, nicks: { 4: 'CHAR' } });
  assert.equal(L.levelInfo(p, 4).level, 12);
  assert.equal(L.levelInfo(p, 7).level, 5);
  assert.ok(L.levelInfo(p, 4).frac >= 0 && L.levelInfo(p, 4).frac <= 1);
  assert.equal(L.shownName(p, 4), 'CHAR');
  assert.equal(L.shownName(p, 7), 'SQUIRTLE');
});

test('nickname: keypad and cleaning (like cleanName, max 12, the classic limit)', () => {
  assert.equal(L.NICK_MAX, 12);
  let d = '';
  for (const k of [' ', 'S', 'P', ' ', ' ', 'A', 'R', 'K', 'Y', 'Z', 'Z', 'Z', 'Q', 'Q', 'W', 'W']) d = L.typeKey(d, k);
  assert.equal(d, 'SP ARKYZZZQQ');
  assert.equal(d.length, 12);
  assert.equal(L.typeKey(d, 'DEL'), 'SP ARKYZZZQ');
  assert.equal(L.typeKey(d, 'CLR'), '');
  assert.equal(L.typeKey('AB', '<'), 'AB');
  assert.equal(L.typeKey('AB', 'a'), 'AB');
  for (const s of ['<b>HI</b>', 'A&amp;B', '  SPARKY  ', 'X'.repeat(40), '\u0000BAD', 42]) {
    const n = L.cleanNick(s);
    assert.ok(n.length <= 12);
    assert.equal(n, cleanName(s).slice(0, 12).trim());
  }
  const p = player({ caught: [25] });
  assert.equal(L.setNick(p, 25, 'SPARKY'), 'SPARKY');
  assert.equal(p.nicks[25], 'SPARKY');
  assert.equal(L.setNick(p, 25, 'PIKACHU'), '', 'the species name clears it');
  assert.equal(p.nicks[25], undefined);
  assert.equal(L.setNick(p, 26, 'NOPE'), '', 'only an owned mon');
  assert.equal(p.nicks[26], undefined);
  L.setNick(p, 25, 'ZAP');
  assert.equal(cleanPlayer(p).nicks[25], 'ZAP', 'survives validate');
});

test('favourites: six at most, owned only, swap keeps the slot', () => {
  const p = player({ caught: [1, 2, 3, 4, 5, 6, 7, 8] });
  assert.equal(L.toggleFav(p, 99), 'no');
  for (const id of [1, 2, 3, 4, 5, 6]) assert.equal(L.toggleFav(p, id), 'on');
  assert.equal(L.toggleFav(p, 7), 'full');
  assert.equal(p.favorites.length, 6);
  assert.ok(L.swapFav(p, 3, 7));
  assert.deepEqual(p.favorites, [1, 2, 7, 4, 5, 6]);
  assert.equal(L.swapFav(p, 3, 8), false, 'out must be a favourite');
  assert.equal(L.swapFav(p, 1, 7), false, 'already a favourite');
  assert.equal(L.toggleFav(p, 7), 'off');
  assert.equal(p.favorites.length, 5);
  assert.deepEqual(cleanPlayer(p).favorites, p.favorites);
});

test('team: place, swap, remove; never empty, never unowned, never > 6', () => {
  const caught = [1, 4, 7, 25, 133, 150, 151];
  let t = [];
  t = L.placeInTeam(t, 0, 25, caught);
  assert.deepEqual(t, [25]);
  t = L.placeInTeam(t, 5, 4, caught);             // empty slot -> packed at the end
  assert.deepEqual(t, [25, 4]);
  t = L.placeInTeam(t, 1, 999, caught);
  assert.deepEqual(t, [25, 4], 'unowned refused');
  t = L.placeInTeam(t, 0, 4, caught);             // already on team -> swap
  assert.deepEqual(t, [4, 25]);
  t = L.placeInTeam(t, 3, 4, caught);             // already on team, empty slot: nothing
  assert.deepEqual(t, [4, 25]);
  t = L.placeInTeam(t, 1, 7, caught);             // replace
  assert.deepEqual(t, [4, 7]);
  for (const id of [1, 25, 133, 150, 151]) t = L.placeInTeam(t, t.length, id, caught);
  assert.equal(t.length, 6);
  assert.deepEqual(L.swapSlots(t, 0, 5, caught)[0], t[5]);
  assert.deepEqual(L.swapSlots(t, 0, 9, caught), t);
  let r = t;
  for (let i = 0; i < 10; i++) r = L.removeFromTeam(r, 0, caught);
  assert.equal(r.length, 1, 'the last member stays');
  assert.equal(L.canRemove(r, 0), false);
  assert.equal(L.canRemove(t, 0), true);
  assert.deepEqual(L.cleanTeam([1, 1, 999, 4, 7, 25, 133, 150, 151], caught), [1, 4, 7, 25, 133, 150]);
});

test('box order: favourites first, then dex order', () => {
  const p = player({ caught: [150, 1, 25, 4], favorites: [25, 150] });
  assert.deepEqual(L.boxIds(p), [25, 150, 1, 4]);
});

test('return address is a plain scene name, else home by profile', () => {
  assert.equal(L.safeReturn({ returnTo: 'garden' }, false), 'garden');
  assert.equal(L.safeReturn({ returnTo: 'javascript:x' }, false), 'road');
  assert.equal(L.safeReturn({}, true), 'garden');
  assert.equal(L.safeReturn(null, false), 'road');
});

test('the scenes build DOM only through h(): no markup strings, no speech', () => {
  for (const f of ['../scenes/dex.js', '../scenes/team.js', '../scenes/dex-logic.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!new RegExp(['inner', 'outer', 'insertAdjacent'].map(w => w + 'HTML').join('|')).test(src), f);
    assert.ok(!new RegExp('speech' + 'Synthesis', 'i').test(src), f);
    assert.ok(!/setTimeout\([^)]*,\s*([3-9]\d\d|\d{4,})\)/.test(src), f + ': long waits go through wait()');
  }
});

test('search: his own nicknames are found first', () => {
  const ids = L.searchIds('blaze', { 6: 'BLAZE', 25: 'SPARKY' });
  assert.equal(ids[0], 6);
  assert.deepEqual(L.searchIds('spark', { 25: 'SPARKY' }).slice(0, 1), [25]);
  assert.deepEqual(L.gridIds({ query: 'blaze', caught: [6], nicks: { 6: 'BLAZE' } }).slice(0, 1), [6]);
  assert.deepEqual(L.searchIds('blaze'), [], 'no nicks: species names only');
});

test('nickname: an 11-12 letter classic name fits', () => {
  assert.equal(L.cleanNick("MISTER ZAP'S").length <= 12, true);
  assert.equal(L.cleanNick('THUNDERBOLTS'), 'THUNDERBOLTS');
});
