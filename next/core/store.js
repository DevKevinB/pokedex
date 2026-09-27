// ============================================================
// SPROUT ROAD — the state singleton and a tiny event bus.
//
// store.save is the v3 save; it loads lazily on first touch, so a scene can
// never see an unloaded store. Nothing is written until commit(). Events:
//   'change'      after every commit (data: the save)
//   'saveFailed'  a commit could not reach disk (data: {reason})
//   'player'      the active player changed (data: 1 | 2)
//   'loaded'      after init()/reload (data: getLoadInfo())
// ============================================================

import * as saveMod from './save.js';
import * as V from './validate.js';

const LAST_PLAYER_KEY = 'pokedexos_next_lastplayer';
const listeners = new Map();
let _save = null;
let _current = 1;

function readLastPlayer() {
  try {
    const n = Number(globalThis.localStorage && globalThis.localStorage.getItem(LAST_PLAYER_KEY));
    return n === 2 ? 2 : 1;
  } catch (e) { return 1; }
}

function init() {
  _save = saveMod.load();
  _current = readLastPlayer();
  emit('loaded', saveMod.getLoadInfo());
  return _save;
}

function on(evt, fn) {
  if (typeof fn !== 'function') return () => {};
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => { const s = listeners.get(evt); if (s) s.delete(fn); };
}

function emit(evt, data) {
  const s = listeners.get(evt);
  if (!s) return;
  for (const fn of [...s]) {
    try { fn(data); } catch (e) { console.error('store listener failed:', evt, e); }
  }
}

function commit() {
  const ok = saveMod.persist(store.save);
  if (!ok) emit('saveFailed', { reason: saveMod.getLoadInfo().blocked ? 'quarantine' : 'quota' });
  emit('change', store.save);
  return ok;
}

const playerN = n => (n === 1 || n === 2 ? store.save.players[n] : store.player());

export const store = {
  get save() { return _save || init(); },
  set save(v) { _save = v; },
  get current() { if (!_save) init(); return _current; },
  set current(n) { store.setPlayer(n); },

  /** The active player's object (a live reference into store.save). */
  player() { return store.save.players[store.current]; },

  /** Switch player and remember the choice for next boot. */
  setPlayer(n) {
    if (!_save) init();
    const next = Number(n) === 2 ? 2 : 1;
    _current = next;
    try { globalThis.localStorage.setItem(LAST_PLAYER_KEY, String(next)); } catch (e) { /* not fatal */ }
    emit('player', next);
  },

  /** Last chosen player from localStorage (1 when none). */
  lastPlayer: readLastPlayer,

  on, emit, commit,

  /** (Re)load from disk. main.js may call it at boot; otherwise it runs lazily. */
  init,
  loadInfo() { if (!_save) init(); return saveMod.getLoadInfo(); },

  exportCode() { return saveMod.exportCode(store.save); },
  /** Throws on a bad code; on success replaces store.save and emits 'change'. */
  importCode(code) {
    _save = saveMod.importCode(code, store.save);
    emit('change', _save);
    return _save;
  },
  hasPrevious: saveMod.hasPrevious,
  restorePrevious() {
    _save = saveMod.restorePrevious(store.save);
    emit('change', _save);
    return _save;
  },
  requestPersistence: saveMod.requestPersistence,

  // Shared-state helpers: each mutates store.save through the pure helper in
  // validate.js (clamped, never throws) and then commit()s.
  /** Art grew a leaf-stamped gift for the reader's Road. -> new count (<= 99). */
  addGift(n = 1) { const v = V.addGift(store.save, n); commit(); return v; },
  /** The reader opens one gift. -> true when there was one. Commits only when one was taken. */
  takeGift() { const ok = V.takeGift(store.save); if (ok) commit(); return ok; },
  /** Gifts waiting on the reader's Road. */
  giftCount() { return V.cleanGifts(store.save.gifts).toReader; },
  /** A Family Postcard was made today. -> new postcard count. */
  addPostcard(date) { const v = V.addPostcard(store.save, date); commit(); return v; },
  /** Couch Versus: 'gabe' | 'dad' won. -> {gabe, dad} or null for anything else. */
  addVersusWin(winner) { const v = V.addVersusWin(store.save, winner); if (v) commit(); return v; },
  /** DAD'S CHALLENGE: 'dad' | 'reader' beat seed `code` (e.g. 'MOSSY-714'). -> the wins, or null (nothing written) for a bad code/who. */
  addChallengeWin(code, who, date) { const v = V.addChallengeWin(store.save, code, who, date); if (v) commit(); return v; },
  /** DAD'S CHALLENGE wins, oldest first: [{code, who, date}]. */
  challengeWins() { return V.cleanChallenge(store.save.family && store.save.family.challenge).wins; },
  /** Set (exactly 3 dex ids) or clear (null) player n's picture-lock. Invalid pics change nothing. -> the stored lock. */
  setLock(n, pics) {
    const p = store.save.players[Number(n) === 2 ? 2 : 1];
    const next = pics == null ? null : V.cleanLock({ pics });
    if (pics != null && !next) return p.lock || null;
    p.lock = next;
    commit();
    return p.lock;
  },
  // Batch 4 per-player helpers. `n` defaults to the active player.
  /** Art places a decoration (x, y are 0..1 fractions of the garden). -> {kind,x,y} or null (bad input / full at 40; nothing written). */
  placeDecor(kind, x, y, n) { const v = V.placeDecor(playerN(n), kind, x, y); if (v) commit(); return v; },
  /** Art moves decoration `i`. -> {kind,x,y} or null (nothing written). There is no remove. */
  moveDecor(i, x, y, n) { const v = V.moveDecor(playerN(n), i, x, y); if (v) commit(); return v; },
  /** Bulba wears `key` (a short safe key) or nothing (null). -> the stored accessory; junk changes nothing. */
  setAccessory(key, n) {
    const p = playerN(n);
    const before = p.bulba && p.bulba.accessory;
    const v = V.setAccessory(p, key);
    if (v !== before) commit();
    return v;
  },
  /** Through the Roots: open the door for good. */
  openRoots(n) {
    const p = playerN(n);
    const was = !!(p.road && p.road.roots && p.road.roots.opened === true);
    const ok = V.openRoots(p);
    if (ok && !was) commit();
    return ok;
  },
  /** Through the Roots: sanctum `key` visited. -> true when stored. */
  addSanctum(key, n) { const ok = V.addSanctum(playerN(n), key); if (ok) commit(); return ok; },

  /** Does `pics` open player n's picture-lock? (true when he has none) */
  lockOpens(n, pics) { return V.lockOpens(store.save.players[Number(n) === 2 ? 2 : 1], pics); },
};
