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
};
