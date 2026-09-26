// ============================================================
// SPROUT ROAD — PLAY TOGETHER (ROADMAP 5.1, row 3)
//
// Pick seats, then one wordless choice:
//   FAMILY TABLE  both partners at one table: the reader battles, the
//                 little one helps (Art heals, Gabe battles, Dad takes
//                 either seat).
//   COUCH VERSUS  two Pokemon facing, a ⚔ between: the reader against DAD,
//                 hidden picks behind a Bulbasaur curtain.
//
// Seats: the ⚔ seat is whose team battles, the 🌱 seat is whose BULBA
// helps. ⇄ swaps them. Player numbers are never assumed to be boys: the
// first reader defaults to the ⚔ seat.
//
// The small pure helpers below are shared with family-table.js and
// versus.js (same owner).
// ============================================================

import { h, clear } from '../ui/h.js';
import { spriteImg } from '../ui/sprite.js';
import { sfx } from '../audio/audio.js';
import { stageId } from './garden-logic.js';
import { openLock } from './lock.js';

export const BULBA_ID = 1;
const play = name => { try { const f = sfx && sfx[name]; if (typeof f === 'function') f(); } catch (e) { /* silent */ } };

// ---------------------------------------------------------------- helpers

const other = n => (n === 1 ? 2 : 1);
const okN = n => (Number(n) === 2 ? 2 : Number(n) === 1 ? 1 : 0);

/** Name to show for player n (never empty). */
export function nameOf(save, n) {
  const p = save && save.players && save.players[n];
  return ((p && p.name) || '').trim().toUpperCase() || 'PLAYER ' + n;
}

/** Default seats: {battler, helper}. The first reader battles. */
export function defaultSeats(save) {
  const ps = (save && save.players) || {};
  const reader = [1, 2].find(n => ps[n] && ps[n].profile !== 'prereader') || 1;
  return { battler: reader, helper: other(reader) };
}

const isPre = (save, n) => {
  const p = save && save.players && save.players[n];
  return !!p && p.profile === 'prereader';
};

/** True if these seats may swap: a prereader never takes the ⚔ seat while
 *  a reader is there to battle (hard rule 2: Junior Mode never punishes). */
export function canSwap(save, seats) {
  return !(isPre(save, seats.helper) && !isPre(save, seats.battler));
}

/** Sanitise seat params from the router. A prereader is never put in the ⚔
 *  seat over a reader, whatever the params say. */
export function seatsFrom(save, params) {
  const b = okN(params && params.battler);
  const hp = okN(params && params.helper);
  let s;
  if (b && hp && b !== hp) s = { battler: b, helper: hp };
  else if (b) s = { battler: b, helper: other(b) };
  else return defaultSeats(save);
  if (isPre(save, s.battler) && !isPre(save, s.helper)) s = { battler: s.helper, helper: s.battler };
  return s;
}

/** Battle profile for the ⚔ seat: only when both players are prereaders can
 *  one battle, and then with every Junior protection on. */
export function battleProfile(save, n) {
  return isPre(save, n) ? 'prereader' : 'reader';
}

/** True if the ⚔-seat player's card carries a picture lock (readers only). */
export function seatLocked(save, n) {
  const p = save && save.players && save.players[n];
  return !!p && p.profile !== 'prereader' && !!(p.lock && Array.isArray(p.lock.pics) && p.lock.pics.length);
}

/** The species id of a player's BULBA (Bulbasaur / Ivysaur / Venusaur). */
export function bulbaIdOf(p) {
  return stageId((p && p.bulba && p.bulba.stage) || 1);
}

/** A player's lead sprite: a prereader shows his BULBA. */
export function leadOf(p) {
  if (!p) return { id: BULBA_ID, shiny: false };
  if (p.profile === 'prereader') return { id: bulbaIdOf(p), shiny: false };
  const id = (Array.isArray(p.team) && p.team[0]) || (Array.isArray(p.caught) && p.caught[0]) || BULBA_ID;
  return { id, shiny: Array.isArray(p.shinies) && p.shinies.includes(id) };
}

const lvlOf = (p, id) => {
  const m = p && p.mons && p.mons[id];
  const n = Math.round(Number(m && m.level));
  return Number.isFinite(n) ? Math.max(1, Math.min(100, n)) : 5;
};

/** [{id, level}] for a player's battle team (up to 6), never empty. */
export function teamSpec(p) {
  let ids = (p && Array.isArray(p.team) ? p.team : []).filter(n => Number.isInteger(n) && n >= 1 && n <= 649).slice(0, 6);
  if (!ids.length) {
    const c = p && Array.isArray(p.caught) ? p.caught.filter(n => Number.isInteger(n) && n >= 1 && n <= 649) : [];
    ids = [c[0] || bulbaIdOf(p)];
  }
  return ids.map(id => ({ id, level: lvlOf(p, id) }));
}

/** The highest level on a player's battle team. */
export function topLevel(p) {
  return teamSpec(p).reduce((a, m) => Math.max(a, m.level), 1);
}

// ---------------------------------------------------------------- scene

export function mount(root, ctx) {
  const { store } = ctx;
  const save = store.save;
  let seats = seatsFrom(save, ctx.params || {});

  const seatRow = h('div', { class: 'tg-seats' });
  const scene = h('div', { class: 'tg', dataset: { scene: 'together' } },
    h('div', { class: 'tg-top' },
      h('button', {
        class: 'tg-home', type: 'button', attrs: { 'aria-label': 'HOME' },
        on: { click: () => { play('tap'); ctx.go('who'); } }
      }, '⌂'),
      h('div', { class: 'tg-title', attrs: { 'aria-hidden': 'true' } }, '❤')),
    seatRow,
    h('div', { class: 'tg-modes' },
      h('button', {
        class: 'tg-mode tg-table', type: 'button', attrs: { 'aria-label': 'FAMILY TABLE' },
        on: { click: () => { play('tap'); goLocked('family-table', { ...seats }); } }
      },
      h('span', { class: 'tg-pair' },
        leadPic(seats.battler, 'tg-mode-sprite'),
        leadPic(seats.helper, 'tg-mode-sprite')),
      h('span', { class: 'tg-tableboard', attrs: { 'aria-hidden': 'true' } },
        h('span', { class: 'tg-tabletop' }), h('span', { class: 'tg-leg l' }), h('span', { class: 'tg-leg r' }))),
      h('button', {
        class: 'tg-mode tg-versus', type: 'button', attrs: { 'aria-label': 'COUCH VERSUS' },
        on: { click: () => { play('tap'); goLocked('versus', { battler: seats.battler }); } }
      },
      h('span', { class: 'tg-pair tg-facing' },
        leadPic(seats.battler, 'tg-mode-sprite'),
        h('span', { class: 'tg-swords', attrs: { 'aria-hidden': 'true' } }, '⚔'),
        spriteImg(BULBA_ID, { class: ['tg-mode-sprite', 'tg-face-left'] })))));
  root.appendChild(scene);

  // The ⚔ seat plays on (and writes to) that player's save, so his picture
  // lock guards it here exactly as it guards his WHO card.
  let closeLock = null;
  function goLocked(name, params) {
    if (!seatLocked(save, seats.battler)) { ctx.go(name, params); return; }
    if (closeLock) return;
    closeLock = openLock(scene, {
      store, player: seats.battler,
      onOpen: () => { closeLock = null; ctx.go(name, params); },
      onCancel: () => { closeLock = null; },
    });
  }

  function leadPic(n, cls) {
    const lead = leadOf(save.players[n]);
    return spriteImg(lead.id, { animated: true, shiny: lead.shiny, class: cls });
  }

  function seat(n, icon, cls) {
    return h('div', { class: ['tg-seat', cls], dataset: { player: n } },
      h('span', { class: 'tg-seat-icon', attrs: { 'aria-hidden': 'true' } }, icon),
      leadPic(n, 'tg-seat-sprite'),
      h('span', { class: 'tg-seat-name' }, nameOf(save, n)));
  }

  function drawSeats() {
    clear(seatRow).append(
      seat(seats.battler, '⚔', 'tg-seat-battle'),
      h('button', {
        class: 'tg-swap', type: 'button', attrs: { 'aria-label': 'SWAP' },
        // Hidden (not removed) so the seats keep their places.
        style: { visibility: canSwap(save, seats) ? 'visible' : 'hidden' },
        on: {
          click: () => {
            if (!canSwap(save, seats)) return;
            play('tap');
            seats = { battler: seats.helper, helper: seats.battler };
            drawSeats();
            redrawModes();
          }
        }
      }, '⇄'),
      seat(seats.helper, '🌱', 'tg-seat-help'));
  }

  function redrawModes() {
    const pair = scene.querySelector('.tg-table .tg-pair');
    if (pair) clear(pair).append(leadPic(seats.battler, 'tg-mode-sprite'), leadPic(seats.helper, 'tg-mode-sprite'));
    const face = scene.querySelector('.tg-versus .tg-pair');
    if (face && face.firstChild) face.replaceChild(leadPic(seats.battler, 'tg-mode-sprite'), face.firstChild);
  }

  drawSeats();

  return function unmount() {
    if (closeLock) { try { closeLock(); } catch (e) { /* ignore */ } closeLock = null; }
    scene.remove();
  };
}
