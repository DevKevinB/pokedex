// ============================================================
// SPROUT ROAD — the PICTURE LOCK.
//
// A reader can put a picture lock on his card (set by a grown-up in the
// gear panel): three Pokemon, in order, like a PIN. Here he sees nine
// pictures (his three plus six others, shuffled) and taps his three.
// Right: his save opens. Wrong: the grid gives a gentle shake and the dots
// empty again. No counter, no lockout, no words for failure.
//
// Two ways in, one UI:
//   openLock(host, { store, player, onOpen, onCancel }) -> close()
//       an overlay (who.js uses this, so the lock never depends on a route)
//   mount(root, ctx)   the scene contract; params { player }, opens to the
//       player's home (road / garden), ⌂ goes back to who.
// ============================================================

import { h, clear } from '../ui/h.js';
import { spriteImg } from '../ui/sprite.js';
import { sfx, cry } from '../audio/audio.js';
import { wait } from '../core/pace.js';
import { rngFromUrl } from '../core/rng.js';

export const GRID = 9;
const MAX_ID = 649;
const play = name => { try { const f = sfx && sfx[name]; if (typeof f === 'function') f(); } catch (e) { /* silent */ } };
const isId = n => Number.isInteger(n) && n >= 1 && n <= MAX_ID;

function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Nine distinct ids: every picture in the lock plus decoys (his own
 *  catches first, so the grid looks like HIS Pokemon), shuffled. Pure. */
export function lockGrid(lockPics, caught = [], rng = Math.random) {
  const out = [...new Set((lockPics || []).filter(isId))];
  const pool = shuffle([...new Set((caught || []).filter(isId))].filter(id => !out.includes(id)), rng);
  while (out.length < GRID && pool.length) out.push(pool.pop());
  let guard = 0;
  while (out.length < GRID && guard++ < 5000) {
    const id = 1 + Math.floor(rng() * MAX_ID);
    if (!out.includes(id)) out.push(id);
  }
  return shuffle(out, rng);
}

/** The lock UI inside `host`. Returns close(). */
export function openLock(host, { store, player, onOpen, onCancel } = {}) {
  const n = Number(player) === 2 ? 2 : 1;
  const p = store.save.players[n];
  const lock = p && p.lock;
  let rng;
  try { rng = rngFromUrl(); } catch (e) { rng = Math.random; }
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  let alive = true;
  let entered = [];
  let checking = false;

  const name = ((p && p.name) || '').trim().toUpperCase() || 'PLAYER ' + n;
  const dots = h('div', { class: 'lk-dots', attrs: { 'aria-hidden': 'true' } });
  const grid = h('div', { class: 'lk-grid' });
  const el = h('div', { class: 'lk', attrs: { role: 'dialog', 'aria-label': name } },
    h('div', { class: 'lk-top' },
      h('button', {
        class: 'lk-back', type: 'button', attrs: { 'aria-label': 'BACK' },
        on: { click: () => { play('tap'); close(); if (onCancel) onCancel(); } }
      }, '⌂'),
      h('div', { class: 'lk-name' }, h('span', { class: 'lk-key', attrs: { 'aria-hidden': 'true' } }, '🔒'), name)),
    dots,
    grid);
  host.appendChild(el);

  function drawDots() {
    clear(dots);
    for (let i = 0; i < 3; i++) {
      const id = entered[i];
      dots.appendChild(h('span', { class: ['lk-dot', { on: id != null }] },
        id != null ? spriteImg(id, { class: 'lk-dot-sprite' }) : null));
    }
  }

  function drawGrid() {
    clear(grid);
    const ids = lockGrid(lock ? lock.pics : [], p ? p.caught : [], rng);
    for (const id of ids) {
      grid.appendChild(h('button', {
        class: 'lk-pic', type: 'button', dataset: { id },
        on: { click: e => tap(id, e.currentTarget) }
      }, spriteImg(id, { class: 'lk-sprite' })));
    }
  }

  async function tap(id, btn) {
    if (!alive || checking) return;
    play('tap');
    entered.push(id);
    btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
    drawDots();
    if (entered.length < 3) return;
    checking = true;
    if (store.lockOpens(n, entered)) {
      el.classList.add('open');
      play('caught');
      try { cry(entered[0]); } catch (e) { /* ignore */ }
      await wait(450, { signal: ac && ac.signal });
      if (!alive) return;
      close();
      if (onOpen) onOpen();
      return;
    }
    // Not his three: a soft shake, and the dots go back to empty.
    grid.classList.remove('shake'); void grid.offsetWidth; grid.classList.add('shake');
    await wait(420, { signal: ac && ac.signal, skippable: false });
    if (!alive) return;
    grid.classList.remove('shake');
    entered = [];
    drawDots();
    checking = false;
  }

  function close() {
    if (!alive) return;
    alive = false;
    if (ac) ac.abort();
    el.remove();
  }

  drawDots();
  drawGrid();
  return close;
}

/** Scene contract. params: { player } */
export function mount(root, ctx) {
  const { store } = ctx;
  const n = Number(ctx.params && ctx.params.player) === 2 ? 2 : 1;
  const p = store.save.players[n];
  const home = () => ctx.go(p && p.profile === 'prereader' ? 'garden' : 'road');
  // No lock (or a prereader): nothing to open.
  if (!p || !p.lock || p.profile === 'prereader') {
    store.setPlayer(n);
    const t = setTimeout(home, 0);
    return () => clearTimeout(t);
  }
  root.classList.add('lock-scene');
  const close = openLock(root, {
    store, player: n,
    onOpen: () => { store.setPlayer(n); home(); },
    onCancel: () => ctx.go('who'),
  });
  return function unmount() { close(); };
}
