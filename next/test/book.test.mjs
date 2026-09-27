// ART'S STICKER BOOK: the pure helpers in scenes/book.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  homeOf, stickerIds, bookPages, stickerTilt, stampModel, returnTarget,
  HABITATS, PER_PAGE, MAX_STAMPS, MAX_ID,
} from '../scenes/book.js';

const KEYS = new Set(HABITATS.map(h => h.key));

test('every dex id 1..649 has a known home; junk goes to the meadow', () => {
  for (let id = 1; id <= MAX_ID; id++) assert.ok(KEYS.has(homeOf(id)), 'id ' + id);
  assert.equal(homeOf(1), 'forest');       // Bulbasaur
  assert.equal(homeOf(7), 'ocean');        // Squirtle
  assert.equal(homeOf(4), 'volcano');      // Charmander
  assert.equal(homeOf(25), 'forest');      // Pikachu (Viridian Forest)
  assert.equal(homeOf(81), 'powerplant');  // Magnemite
  assert.equal(homeOf(150), 'cave');       // Mewtwo, in the classic DEEP CAVE
  for (const junk of [0, -1, 650, 1.5, 'x', null, undefined, NaN, '__proto__']) assert.equal(homeOf(junk), 'meadow');
});

test('stickerIds: valid ids once each, in catch order', () => {
  assert.deepEqual(stickerIds({ caught: [25, '7', 25, 0, 999, 'x', null, 1.5, 7, 1] }), [25, 7, 1]);
  assert.deepEqual(stickerIds({}), []);
  assert.deepEqual(stickerIds(null), []);
  assert.deepEqual(stickerIds({ caught: 'nope' }), []);
});

test('bookPages: cover first, only places with stickers, postcard page last', () => {
  const pages = bookPages({ caught: [7, 1, 81, 8] }, { postcards: 3 });
  assert.equal(pages[0].kind, 'cover');
  const habs = pages.filter(p => p.kind === 'habitat');
  assert.deepEqual(habs.map(p => p.habitat), ['forest', 'ocean', 'powerplant']);   // map order
  assert.deepEqual(habs.find(p => p.habitat === 'ocean').ids, [7, 8]);
  assert.ok(habs.every(p => p.ids.length > 0), 'no empty page, ever');
  const last = pages[pages.length - 1];
  assert.deepEqual(last, { kind: 'post', count: 3, stamps: 3 });
});

test('bookPages: nothing caught and no postcards is just the cover', () => {
  assert.deepEqual(bookPages({ caught: [] }, { postcards: 0 }), [{ kind: 'cover' }]);
  assert.deepEqual(bookPages(undefined, undefined), [{ kind: 'cover' }]);
  assert.deepEqual(bookPages({ caught: [1] }, { postcards: -5 }).map(p => p.kind), ['cover', 'habitat']);
});

test('bookPages: a crowded place spills onto more pages, every sticker once', () => {
  const all = Array.from({ length: MAX_ID }, (_, i) => i + 1);
  const pages = bookPages({ caught: all }, {});
  const seen = pages.flatMap(p => p.ids || []);
  assert.equal(seen.length, MAX_ID);
  assert.equal(new Set(seen).size, MAX_ID);
  for (const p of pages) if (p.kind === 'habitat') assert.ok(p.ids.length >= 1 && p.ids.length <= PER_PAGE);
  const forest = pages.filter(p => p.habitat === 'forest');
  assert.deepEqual(forest.map(p => p.part), forest.map((_, i) => i));
});

test('stampModel caps the drawn stamps, keeps the true count', () => {
  assert.deepEqual(stampModel(5), { count: 5, stamps: 5 });
  assert.deepEqual(stampModel(500), { count: 500, stamps: MAX_STAMPS });
  assert.deepEqual(stampModel('junk'), { count: 0, stamps: 0 });
  assert.deepEqual(stampModel(-3), { count: 0, stamps: 0 });
});

test('stickerTilt is stable per species and gentle', () => {
  assert.deepEqual(stickerTilt(25), stickerTilt(25));
  for (let id = 1; id <= MAX_ID; id += 7) {
    const t = stickerTilt(id);
    assert.ok(Math.abs(t.rot) <= 8 && Math.abs(t.dx) <= 8 && Math.abs(t.dy) <= 7, JSON.stringify(t));
  }
});

test('returnTarget only goes to known scenes', () => {
  assert.equal(returnTarget({ returnTo: 'garden' }), 'garden');
  assert.equal(returnTarget({ returnTo: 'road' }), 'road');
  assert.equal(returnTarget({ returnTo: 'javascript:alert(1)' }), 'garden');
  assert.equal(returnTarget(null), 'garden');
  assert.equal(returnTarget({}), 'garden');
});

test('gridClass: a small page gets a small grid', async () => {
  const { gridClass } = await import('../scenes/book.js');
  assert.deepEqual([1, 4, 5, 6, 7, 9, 10, 12].map(gridClass), ['n1', 'n4', 'n6', 'n6', 'n9', 'n9', 'n12', 'n12']);
});
