// Family Postcard: the pure half (model, strip, dates, share gating).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  postcardModel, stripFlowers, bloomedChapters, formatPostcardDate, playerList,
  spriteUrlsFor, POSTCARD_W, POSTCARD_H, MAX_STRIP_FLOWERS, BULBA_STAGE_IDS,
} from '../ui/postcard.js';
import { canShareFile, postcardFileName } from '../scenes/postcard.js';
import { freshPlayer } from '../core/validate.js';
import { CHAPTERS } from '../data/chapters.js';
import { SPRITE_BASE } from '../ui/sprite.js';

function gabe(extra = {}) {
  return Object.assign(freshPlayer(), {
    name: 'Gabe', profile: 'reader', caught: [6, 25], team: [6, 25], shinies: [6],
    badges: ['rock', 'water'], road: { chapter: 3, cleared: {}, bloomed: [0, 2] },
  }, extra);
}
function art(extra = {}) {
  return Object.assign(freshPlayer(), {
    name: 'Art', profile: 'prereader',
    bulba: { petals: 42, stage: 2, stayStone: false, visitors: [] },
    garden: { plots: [{ x: 0.3, y: 0.5, kind: 'pecha', grown: 4 }, { x: 0.7, y: 0.2, kind: 'oran', grown: 0 }], berries: 1 },
  }, extra);
}

test('size is a 4:5 portrait', () => {
  assert.equal(POSTCARD_W, 1080);
  assert.equal(POSTCARD_H, 1350);
});

test('dates print as DD MON YYYY; junk falls back to today', () => {
  assert.equal(formatPostcardDate('2026-09-26'), '26 SEP 2026');
  assert.equal(formatPostcardDate('2026-01-05'), '5 JAN 2026');
  assert.match(formatPostcardDate('2026-13-40'), /^\d{1,2} [A-Z]{3} \d{4}$/);
  assert.match(formatPostcardDate('<b>'), /^\d{1,2} [A-Z]{3} \d{4}$/);
  assert.match(formatPostcardDate(undefined), /^\d{1,2} [A-Z]{3} \d{4}$/);
});

test('playerList accepts arrays, {1,2} and junk', () => {
  assert.equal(playerList([gabe(), art()]).length, 2);
  assert.equal(playerList({ 1: gabe(), 2: art() }).length, 2);
  assert.equal(playerList({ 1: gabe() }).length, 1);
  assert.deepEqual(playerList(null), []);
  assert.deepEqual(playerList('x'), []);
});

test('prereader sits left as Bulba at his stage, reader right with his lead', () => {
  const m = postcardModel({ players: { 1: gabe(), 2: art() }, date: '2026-09-26' });
  assert.equal(m.seats.length, 2);
  assert.equal(m.seats[0].profile, 'prereader');
  assert.equal(m.seats[0].spriteId, BULBA_STAGE_IDS[1]);   // Ivysaur
  assert.equal(m.seats[0].name, 'Art');
  assert.equal(m.seats[1].spriteId, 6);
  assert.equal(m.seats[1].shiny, true);
  assert.equal(m.petals, 42);
  assert.equal(m.dateText, '26 SEP 2026');
  assert.equal(m.stampId, 1);
});

test('blooms: road.bloomed union badge keys, sorted, in range', () => {
  assert.deepEqual(bloomedChapters({ bloomed: [2, 0, 99, -1] }, ['water', 'nope']), [0, 1, 2]);
  assert.deepEqual(bloomedChapters(null, ['gym-fire', 'first-catch']), [8]);
  const m = postcardModel({ players: [gabe(), art()] });
  assert.deepEqual(m.blooms.map(b => b.idx), [0, 1, 2]);
  assert.equal(m.blooms[0].emoji, CHAPTERS[0].emoji);
  // explicit road overrides the reader's own road
  const m2 = postcardModel({ players: [gabe({ badges: [] }), art()], road: { bloomed: [5] } });
  assert.deepEqual(m2.blooms.map(b => b.idx), [5]);
});

test('strip: base flowers always, grown plots only, one per bloom, capped, deterministic', () => {
  const empty = stripFlowers(null, []);
  assert.ok(empty.length >= 6, 'garden starts alive');
  const s = stripFlowers(art().garden, [0, 3]);
  assert.equal(s.filter(f => f.from === 'garden').length, 1, 'sprout (grown 0) is not a flower yet');
  assert.equal(s.filter(f => f.from === 'bloom').length, 2);
  assert.equal(s.find(f => f.from === 'bloom' && f.chapter === 3).colour, CHAPTERS[3].palette.accent);
  assert.deepEqual(stripFlowers(art().garden, [0, 3]), s);
  for (const f of s) { assert.ok(f.x >= 0 && f.x <= 1); assert.ok(f.row === 0 || f.row === 1); }
  const many = { plots: Array.from({ length: 60 }, (_, i) => ({ x: i / 60, y: 0.5, kind: 'weird' + i, grown: 4 })) };
  const big = stripFlowers(many, CHAPTERS.map((_, i) => i));
  assert.ok(big.length <= MAX_STRIP_FLOWERS);
  assert.equal(big.filter(f => f.from === 'bloom').length, 12, 'blooms never dropped');
});

test('hostile input never throws and never yields markup-y names', () => {
  const m = postcardModel({
    players: [{ name: '<img src=x onerror=1>', profile: 'reader', team: ['__proto__'], bulba: { stage: 99 } }, 7, null],
    date: 'nope', garden: { plots: 'x' }, road: { bloomed: 'x' }, highlight: 'evil', number: -5,
  });
  assert.equal(m.seats.length, 1);
  assert.ok(!/[<>]/.test(m.seats[0].name));
  assert.equal(m.seats[0].spriteId, 25);
  assert.equal(m.number, null);
  assert.equal(m.petals, null, 'no prereader, no petal count');
  assert.equal(m.stampId, 1);
  assert.doesNotThrow(() => postcardModel());
  assert.deepEqual(postcardModel().seats, []);
});

test('two readers keep player order; highlight and number carried', () => {
  const m = postcardModel({ players: [gabe({ name: 'Dad', team: [150], caught: [150] }), gabe()], highlight: { id: 133 }, number: 12 });
  assert.equal(m.seats[0].name, 'Dad');
  assert.equal(m.seats[0].spriteId, 150);
  assert.equal(m.stampId, 133);
  assert.equal(m.number, 12);
});

test('every sprite comes from the one sprite host', () => {
  const urls = spriteUrlsFor(postcardModel({ players: [gabe(), art()] }));
  assert.ok(urls.length >= 2);
  for (const u of urls) assert.ok(u.startsWith(SPRITE_BASE + '/pokemon/'), u);
});

test('share gating and file name', () => {
  const f = { name: 'x.png' };
  assert.equal(canShareFile(null, f), false);
  assert.equal(canShareFile({ share() {} }, f), false, 'no canShare -> no share button');
  assert.equal(canShareFile({ share() {}, canShare: () => false }, f), false);
  assert.equal(canShareFile({ share() {}, canShare: () => { throw new Error('x'); } }, f), false);
  assert.equal(canShareFile({ share() {}, canShare: o => o.files.length === 1 }, f), true);
  assert.equal(canShareFile({ share() {}, canShare: () => true }, null), false);
  assert.equal(postcardFileName('2026-09-26'), 'sprout-road-postcard-2026-09-26.png');
  assert.match(postcardFileName('../../etc'), /^sprout-road-postcard-\d{4}-\d{2}-\d{2}\.png$/);
});
