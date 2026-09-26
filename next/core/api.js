// ============================================================
// SPROUT ROAD — PokeAPI client.
//
// getMon(id) fetches /pokemon/{id} and /pokemon-species/{id} (for
// capture_rate) and keeps a SLIM projection: the full responses are 100KB+
// and the game uses a few hundred bytes of them. Cache layers:
//   1. an in-memory Map (this session)
//   2. IndexedDB 'sproutroad-api' (across sessions) — NOT localStorage, so
//      the cache can never crowd the boys' save out of its 5MB box.
// If IndexedDB is missing or broken (private mode, old WebKit bugs), the
// memory Map alone carries on; nothing here ever throws because of storage.
//
// Moves come from ../data/moves.json (baked, same-origin), so every move
// lookup is synchronous once `movesReady` has resolved.
// ============================================================

import { computeStats, seedMoveset, moveSeed } from '../data/engine.js';

export const MAX_ID = 649;
const API = 'https://pokeapi.co/api/v2';
const DB_NAME = 'sproutroad-api';
const DB_STORE = 'mons';
const RECORD_VERSION = 1;
const FETCH_TIMEOUT = 8000;

const mem = new Map();          // id -> slim record
const inflight = new Map();     // id -> Promise<slim record>

// ---------------------------------------------------------------- fetch

async function fetchJson(url, timeoutMs = FETCH_TIMEOUT) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
    if (!res.ok) throw new Error('API_ERROR ' + res.status);
    return await res.json();
  } finally {
    if (t) clearTimeout(t);
  }
}

// ---------------------------------------------------------------- IndexedDB

let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    try {
      const idb = globalThis.indexedDB;
      if (!idb) { resolve(null); return; }
      const req = idb.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        try { if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE); }
        catch (e) { /* resolved as null by onerror */ }
      };
      req.onsuccess = () => {
        const db = req.result;
        // Another tab upgrading must not wedge this one.
        db.onversionchange = () => { try { db.close(); } catch (e) { /* ignore */ } dbPromise = Promise.resolve(null); };
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch (e) { resolve(null); }
  });
  return dbPromise;
}

async function idbGet(id) {
  const db = await openDb();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

async function idbPut(id, rec) {
  const db = await openDb();
  if (!db) return false;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(rec, id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch (e) { resolve(false); }
  });
}

/** Drop the persistent API cache (disposable). Memory stays warm. */
export async function clearApiCache() {
  const db = await openDb();
  if (!db) return false;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) { resolve(false); }
  });
}

// ---------------------------------------------------------------- projection

const SPECIAL_NAMES = {
  'nidoran-f': 'NIDORAN♀', 'nidoran-m': 'NIDORAN♂', 'mr-mime': 'MR. MIME', 'mime-jr': 'MIME JR.',
  farfetchd: "FARFETCH'D", 'ho-oh': 'HO-OH', 'porygon-z': 'PORYGON-Z',
};
export function displayName(apiName) {
  const n = String(apiName || '').toLowerCase();
  if (SPECIAL_NAMES[n]) return SPECIAL_NAMES[n];
  return n.replace(/[^a-z0-9-]/g, '').replace(/-/g, ' ').toUpperCase().slice(0, 20);
}

const STAT_MAP = { hp: 'hp', attack: 'atk', defense: 'def', 'special-attack': 'spatk', 'special-defense': 'spdef', speed: 'spe' };
const TYPE_RE = /^[a-z]{2,10}$/;
const MOVE_RE = /^[a-z0-9-]{1,40}$/;

/** Raw /pokemon + /pokemon-species JSON -> the slim, validated record. */
export function slimMon(id, p, species) {
  const baseStats = { hp: 50, atk: 50, def: 50, spatk: 50, spdef: 50, spe: 50 };
  for (const s of (p && Array.isArray(p.stats) ? p.stats : [])) {
    const k = STAT_MAP[s && s.stat && s.stat.name];
    const v = Math.floor(Number(s && s.base_stat));
    if (k && Number.isFinite(v)) baseStats[k] = Math.max(1, Math.min(255, v));
  }
  const types = (p && Array.isArray(p.types) ? p.types : [])
    .slice().sort((a, b) => (a && a.slot || 0) - (b && b.slot || 0))
    .map(t => t && t.type && t.type.name).filter(t => typeof t === 'string' && TYPE_RE.test(t)).slice(0, 2);
  const moveNames = [...new Set((p && Array.isArray(p.moves) ? p.moves : [])
    .map(m => m && m.move && m.move.name).filter(n => typeof n === 'string' && MOVE_RE.test(n)))].slice(0, 400);
  const cr = Math.floor(Number(species && species.capture_rate));
  const bx = Math.floor(Number(p && p.base_experience));
  return {
    v: RECORD_VERSION,
    id,
    name: displayName((species && species.name) || (p && p.name) || ''),
    types: types.length ? types : ['normal'],
    baseStats,
    moveNames,
    captureRate: Number.isFinite(cr) ? Math.max(1, Math.min(255, cr)) : 45,
    baseExp: Number.isFinite(bx) && bx > 0 ? Math.min(bx, 1000) : 60,
  };
}

const copy = rec => ({ ...rec, types: [...rec.types], baseStats: { ...rec.baseStats }, moveNames: [...rec.moveNames] });

/**
 * One species' data. Resolves to
 *   { id, name (UPPERCASE display), types:[..], baseStats:{hp,atk,def,spatk,spdef,spe},
 *     moveNames:[..], captureRate, baseExp }
 * Rejects (Error 'BAD_ID' or a network error) only when nothing is cached.
 * Each caller gets its own copy, so a scene mutating a record cannot
 * poison the cache for the next fight.
 */
export async function getMon(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1 || n > MAX_ID) throw new Error('BAD_ID');
  if (mem.has(n)) return copy(mem.get(n));
  if (!inflight.has(n)) {
    const job = (async () => {
      const cached = await idbGet(n);
      if (cached && cached.v === RECORD_VERSION && cached.id === n) { mem.set(n, cached); return cached; }
      const [p, species] = await Promise.all([
        fetchJson(`${API}/pokemon/${n}`),
        // capture_rate only: a species failure costs the default 45, not the fight.
        fetchJson(`${API}/pokemon-species/${n}`).catch(() => null),
      ]);
      const rec = slimMon(n, p, species);
      mem.set(n, rec);
      // A record missing its species data is not persisted, so the real
      // capture rate is fetched next session.
      if (species) idbPut(n, rec);
      return rec;
    })();
    inflight.set(n, job);
    job.then(() => inflight.delete(n), () => inflight.delete(n));
  }
  return copy(await inflight.get(n));
}

/** Synchronous best-effort: the record if this session already has it. */
export function cachedMon(id) {
  const rec = mem.get(Number(id));
  return rec ? copy(rec) : null;
}

// ---------------------------------------------------------------- moves

const MOVES_URL = new URL('../data/moves.json', import.meta.url).href;
let moveTable = null;
let movesPromise = null;

/** (Re)load moves.json. Resolves true when the table is loaded. Never rejects. */
export function loadMoves() {
  if (moveTable) return Promise.resolve(true);
  if (!movesPromise) {
    movesPromise = fetchJson(MOVES_URL, 10000)
      .then(d => { moveTable = d && typeof d === 'object' ? d : null; return !!moveTable; })
      .catch(() => false)
      .then(ok => { if (!ok) movesPromise = null; return ok; });
  }
  return movesPromise;
}

/** Resolves (true/false) once the first moves.json load has settled. Never rejects. */
export const movesReady = loadMoves();

/** 'vine-whip' | 'VINE WHIP' -> {name:'vine-whip', type, power, damage_class} | null. */
export function moveInfo(name) {
  if (!moveTable) return null;
  const key = String(name || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (!key || !Object.hasOwn(moveTable, key)) return null;
  const e = moveTable[key];
  if (!e || typeof e !== 'object') return null;
  return {
    name: key,
    type: typeof e.t === 'string' ? e.t : 'normal',
    power: typeof e.p === 'number' ? e.p : null,
    damage_class: typeof e.c === 'string' ? e.c : 'status',
  };
}

// ---------------------------------------------------------------- fighters

const TACKLE = { name: 'tackle', type: 'normal', power: 40, damage_class: 'physical' };
const label = n => String(n).replace(/-/g, ' ').toUpperCase();

/**
 * A battle-ready fighter as createBattle expects:
 *   { id, level, name, types:[..], stats:{hp,atk,def,spatk,spdef,spe},
 *     moves:[{name,type,power,damage_class,label}], captureRate, baseExp }
 * `seed` fixes the moveset (same seed, same four moves, every device). The
 * default seed depends on species and level, so a trainer's ONIX is the same
 * ONIX on every rematch. For a boy's own Pokemon pass a per-player seed,
 * e.g. moveSeed(playerNumber, id) from data/engine.js.
 */
export async function buildFighter(id, level, { seed } = {}) {
  const mon = await getMon(id);
  await movesReady;
  if (!moveTable) await loadMoves();          // one retry if the first load failed
  const lv = Math.max(1, Math.min(100, Math.floor(Number(level)) || 5));
  const shim = {
    stats: [['hp', 'hp'], ['attack', 'atk'], ['defense', 'def'], ['special-attack', 'spatk'],
      ['special-defense', 'spdef'], ['speed', 'spe']].map(([name, k]) => ({ stat: { name }, base_stat: mon.baseStats[k] })),
  };
  const s = computeStats(shim, lv);
  const moveSeedValue = Number.isFinite(Number(seed)) ? Number(seed) : moveSeed(0, mon.id, lv);
  let moves = seedMoveset(mon.moveNames, { seed: moveSeedValue, level: lv, lookup: moveInfo, types: mon.types });
  if (!moves.length) moves = [{ ...TACKLE }];
  return {
    id: mon.id,
    level: lv,
    name: mon.name,
    types: [...mon.types],
    stats: { hp: s.maxHp, atk: s.atk, def: s.def, spatk: s.spatk, spdef: s.spdef, spe: s.speed },
    moves: moves.map(m => ({ name: m.name, type: m.type, power: m.power, damage_class: m.damage_class, label: label(m.name) })),
    captureRate: mon.captureRate,
    baseExp: mon.baseExp,
    base_experience: mon.baseExp,     // the key engine.xpForKO reads
  };
}

/** Test-only: forget the in-memory caches. */
export function _resetForTests() { mem.clear(); inflight.clear(); }
