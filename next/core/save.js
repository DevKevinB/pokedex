// ============================================================
// SPROUT ROAD — save storage (the only module that touches the save keys).
//
//   pokedexos_save_v3            the live save (this module writes it)
//   pokedexos_save_v2            the classic save: READ ONLY, FOREVER
//   pokedexos_v2_backup_<date>   one-time raw copy of v2, before the first v3 write
//   pokedexos_save_v3_prev       one-deep undo, taken before an import/restore
//   pokedexos_save_v3_corrupt_*  an unreadable v3, parked instead of overwritten
//   pokedex_caught_p1 / _p2      v15 legacy lists, read once if nothing newer exists
//
// Fences ported from ../js/state.js: quarantine instead of discard, a quota
// retry that sheds disposable caches first, a snapshot before any import,
// and a code that is parsed and checked BEFORE anything is overwritten.
// New here: a CRC32 on export codes, and a petal high-water mark — Bulba's
// petals and stage can never go down on disk, whatever the in-memory save
// says, through import, restore, merge or bug.
// ============================================================

import { cleanSave, cleanPlayer, freshSave, isObj, hasProgress, today, cleanFamily, cleanGifts, cleanChallenge, unionDecor, cleanAccessory, withRollbackMirror } from './validate.js';
import { fromV2, mergeV2, applyV1, isV2Save } from './migrate.js';
import { DECOR } from '../data/decor.js';

const DECOR_KINDS = DECOR.map(d => d.key);

export const KEYS = {
  v3: 'pokedexos_save_v3',
  v2: 'pokedexos_save_v2',
  v2Backup: 'pokedexos_v2_backup_',
  prev: 'pokedexos_save_v3_prev',
  corrupt: 'pokedexos_save_v3_corrupt_',
  // Fingerprint (crc32) of the classic save as it was last merged in. Kept in
  // its own key, outside the save shape, so no schema change is involved.
  v2seen: 'pokedexos_v2_seen',
  v1: { 1: 'pokedex_caught_p1', 2: 'pokedex_caught_p2' },
};
const DISPOSABLE_PREFIXES = ['pokedexos_apicache'];
const MAX_CODE_CHARS = 2_000_000;
const CODE_PREFIX = 'SR3.';

const LS = () => { try { return globalThis.localStorage || null; } catch (e) { return null; } };
const get = k => { try { const s = LS(); return s ? s.getItem(k) : null; } catch (e) { return null; } };
const keys = () => { try { const s = LS(); return s ? Object.keys(s) : []; } catch (e) { return []; } };

// ---------------------------------------------------------------- load

let info = { source: 'fresh', quarantinedKey: null, blocked: false, mergedV2: false };
let backupDone = false;
// Highest petals / stage ever loaded or written, per player. persist() raises
// the save to these before writing, so the counter can only go up.
const hwm = { 1: { petals: 0, stage: 1 }, 2: { petals: 0, stage: 1 } };

/** How the last load() went: {source:'v3'|'v2'|'v1'|'fresh', quarantinedKey, blocked, mergedV2}. */
export const getLoadInfo = () => ({ ...info });

function noteHwm(save) {
  for (const n of [1, 2]) {
    const b = save && save.players && save.players[n] && save.players[n].bulba;
    if (!b) continue;
    hwm[n].petals = Math.max(hwm[n].petals, Number(b.petals) || 0);
    hwm[n].stage = Math.max(hwm[n].stage, Number(b.stage) || 1);
  }
}

function raiseToHwm(save) {
  for (const n of [1, 2]) {
    const p = save && save.players && save.players[n];
    if (!p) continue;
    if (!isObj(p.bulba)) p.bulba = cleanPlayer({}).bulba;
    if (!(p.bulba.petals >= hwm[n].petals)) p.bulba.petals = hwm[n].petals;
    if (!(p.bulba.stage >= hwm[n].stage)) p.bulba.stage = hwm[n].stage;
  }
}

// FENCE: never silently discard a save we could not read. Park the raw text
// under its own key. If even that fails, writing is BLOCKED for the session,
// because the next write would destroy the only copy.
function quarantine(rawText) {
  const key = KEYS.corrupt + Date.now();
  try {
    LS().setItem(key, rawText);
    info.quarantinedKey = key;
    return true;
  } catch (e) {
    info.blocked = true;
    return false;
  }
}

function parse(text) {
  if (text == null) return null;
  try { return JSON.parse(text); } catch (e) { return undefined; }   // undefined = unreadable
}

/**
 * Load the save. v3 exists -> validate -> merge classic v2 progress in.
 * No v3 -> migrate from v2, else from the v15 keys, else a fresh save.
 * Never writes the v2 key. May write a quarantine key; writes nothing else.
 */
let pendingV2Seen = null;

export function load() {
  info = { source: 'fresh', quarantinedKey: null, blocked: false, mergedV2: false };
  const v3Text = get(KEYS.v3);
  const v2Text = get(KEYS.v2);
  const v2 = parse(v2Text);
  const v2ok = isV2Save(v2);

  let save = null;
  if (v3Text != null) {
    const raw = parse(v3Text);
    save = raw === undefined ? null : cleanSave(raw);
    if (!save) quarantine(v3Text);
    else info.source = 'v3';
  }
  // The classic save is merged in only when it has CHANGED since the last
  // merge. mergeV2 is union-only, so re-merging an unchanged classic save on
  // every boot would resurrect a favourite star Gabe removed or a nickname he
  // cleared here, forever, because after the switchover nothing edits v2.
  // The fingerprint is recorded only after a successful v3 write (persist),
  // so a failed write means the merge simply runs again next boot.
  const v2print = v2ok ? crc32(v2Text) : null;
  pendingV2Seen = v2print;
  if (save) {
    if (v2ok && get(KEYS.v2seen) !== v2print) { save = mergeV2(save, v2); info.mergedV2 = true; }
  } else if (v2ok) {
    save = fromV2(v2);
    info.source = 'v2';
  } else {
    save = freshSave();
    const p1 = parse(get(KEYS.v1[1]));
    const p2 = parse(get(KEYS.v1[2]));
    if ((Array.isArray(p1) && p1.length) || (Array.isArray(p2) && p2.length)) {
      save = applyV1(save, { p1: Array.isArray(p1) ? p1 : null, p2: Array.isArray(p2) ? p2 : null });
      info.source = 'v1';
    }
  }
  // A quarantined v3 must not lower Bulba when we rebuild from v2: its
  // petals are part of the high-water mark too, when they can be read at all.
  if (info.quarantinedKey) {
    try { const r = JSON.parse(v3Text); if (isObj(r) && isObj(r.players)) noteHwm({ players: { 1: cleanPlayer(r.players[1]), 2: cleanPlayer(r.players[2]) } }); } catch (e) { /* unreadable */ }
  }
  noteHwm(save);
  raiseToHwm(save);
  return save;
}

// ---------------------------------------------------------------- persist

// Before the very first v3 write on a device, the raw classic save is copied
// to pokedexos_v2_backup_<date> — once, only if no backup key exists yet.
function ensureV2Backup() {
  if (backupDone) return;
  try {
    if (keys().some(k => k.startsWith(KEYS.v2Backup))) { backupDone = true; return; }
    const raw = get(KEYS.v2);
    if (raw == null) { backupDone = true; return; }
    LS().setItem(KEYS.v2Backup + today(), raw);
    backupDone = true;
  } catch (e) { /* retried on the next persist; v2 itself is never touched */ }
}

function shedDisposable() {
  for (const k of keys()) {
    if (DISPOSABLE_PREFIXES.some(p => k.startsWith(p))) { try { LS().removeItem(k); } catch (e) { /* ignore */ } }
  }
}

/**
 * Write the save. Returns true on success. On a quota error the disposable
 * API caches are dropped and the write is retried once; false means the
 * caller (store.commit) must raise 'saveFailed'. Petals/stage are raised to
 * their high-water mark first, in memory too, so screen and disk agree.
 */
export function persist(save) {
  if (info.blocked || !save || !isObj(save.players)) return false;
  const s = LS();
  if (!s) return false;
  raiseToHwm(save);
  ensureV2Backup();
  let json;
  // withRollbackMirror: the on-disk copy also carries each player's b4 mirror,
  // so an older build that drops nested batch-4 fields still keeps them.
  try { json = JSON.stringify(withRollbackMirror(save)); } catch (e) { return false; }
  try {
    s.setItem(KEYS.v3, json);
  } catch (e) {
    shedDisposable();
    try { s.setItem(KEYS.v3, json); } catch (e2) { return false; }
  }
  noteHwm(save);
  if (pendingV2Seen) { try { s.setItem(KEYS.v2seen, pendingV2Seen); pendingV2Seen = null; } catch (e) { /* merge again next boot: harmless */ } }
  return true;
}

// ---------------------------------------------------------------- codes

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC32 (IEEE) of a string's UTF-8 bytes, as 8 lowercase hex digits. */
export function crc32(str) {
  const bytes = new TextEncoder().encode(String(str));
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return ((c ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, '0');
}

function bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export const toB64url = str => bytesToB64(new TextEncoder().encode(str)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function fromB64any(b64) {
  let s = String(b64).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

/** v3 save -> 'SR3.<base64url JSON>.<crc32 hex>'. Pure. */
export function encodeSave(save) {
  const json = JSON.stringify({ v: 3, save: withRollbackMirror(save) });
  return CODE_PREFIX + toB64url(json) + '.' + crc32(json);
}

function codeError(code) { const e = new Error(code); e.code = code; return e; }

/**
 * Any save code this game has ever produced -> { kind, data }. Pure; throws
 * Error('BAD_CODE' | 'CRC_MISMATCH' | 'TOO_BIG' | 'EMPTY_SAVE') and nothing
 * else. Accepts: v3 'SR3.' codes (CRC checked), classic v2 base64 codes
 * {v:2, save}, v1 {p1,p2} codes, and the classic SAVE FILE JSON wrapper
 * {pokedexOS:true, code}.
 */
export function decodeCode(code, depth = 0) {
  if (typeof code !== 'string') throw codeError('BAD_CODE');
  const text = code.trim();
  if (!text) throw codeError('BAD_CODE');
  if (text.length > MAX_CODE_CHARS) throw codeError('TOO_BIG');

  let obj;
  if (text.startsWith(CODE_PREFIX)) {
    const body = text.slice(CODE_PREFIX.length).replace(/\s+/g, '');
    const dot = body.lastIndexOf('.');
    if (dot < 0) throw codeError('BAD_CODE');
    let json;
    try { json = fromB64any(body.slice(0, dot)); } catch (e) { throw codeError('BAD_CODE'); }
    if (crc32(json) !== body.slice(dot + 1).toLowerCase()) throw codeError('CRC_MISMATCH');
    try { obj = JSON.parse(json); } catch (e) { throw codeError('BAD_CODE'); }
  } else if (text.startsWith('{')) {
    try { obj = JSON.parse(text); } catch (e) { throw codeError('BAD_CODE'); }
    // The classic SAVE FILE: {pokedexOS:true, code:'...'}
    if (isObj(obj) && typeof obj.code === 'string' && depth < 1) return decodeCode(obj.code, depth + 1);
  } else {
    try { obj = JSON.parse(fromB64any(text)); } catch (e) { throw codeError('BAD_CODE'); }
  }
  if (!isObj(obj)) throw codeError('BAD_CODE');

  if (obj.v === 3) {
    const save = cleanSave(isObj(obj.save) ? obj.save : null);
    if (!save || ![1, 2].some(n => isObj(obj.save.players[n]) && (Array.isArray(obj.save.players[n].caught) || hasProgress(obj.save.players[n])))) {
      throw codeError('EMPTY_SAVE');
    }
    return { kind: 'v3', data: save };
  }
  if (obj.v === 2 && isObj(obj.save) && isObj(obj.save.players)) {
    // `{"v":2,"save":{"players":{}}}` must not wipe both boys: a real v2 code
    // carries at least one player with a caught list.
    const ps = obj.save.players;
    if (![1, 2].some(n => isObj(ps[n]) && Array.isArray(ps[n].caught))) throw codeError('EMPTY_SAVE');
    return { kind: 'v2', data: fromV2({ ...obj.save, version: 2 }) };
  }
  if (Array.isArray(obj.p1) || Array.isArray(obj.p2)) {
    return { kind: 'v1', data: { p1: Array.isArray(obj.p1) ? obj.p1 : null, p2: Array.isArray(obj.p2) ? obj.p2 : null } };
  }
  throw codeError('BAD_CODE');
}

/** The current save as a pasteable code. */
export function exportCode(save) { return encodeSave(save); }

// Petals only go up, including through import: the incoming Bulba can raise
// the current one but never lower it, and his visitors are a union.
function keepBulba(next, current) {
  for (const n of [1, 2]) {
    const a = current && current.players && current.players[n] && current.players[n].bulba;
    const b = next.players[n].bulba;
    if (!a) continue;
    b.petals = Math.max(b.petals, a.petals || 0);
    b.stage = Math.max(b.stage, a.stage || 1);
    b.visitors = [...new Set([...(a.visitors || []), ...b.visitors])].sort((x, y) => x - y);
  }
  return next;
}

// Art's garden decorations are his: an import (or a restore) can ADD
// decorations but never remove one. Every decoration in the current save
// stays exactly where Art put it; the incoming ones join BY COUNT PER KIND
// (only the copies the code has beyond what the garden already holds, so a
// decoration he moved since the code was made is never doubled), keeping
// room free for every kind he has not put down yet, up to MAX_DECOR. Bulba's accessory follows the incoming save when it has one,
// and otherwise stays what he is wearing now.
function keepDecor(next, current) {
  for (const n of [1, 2]) {
    const cp = current && current.players && current.players[n];
    const np = next && next.players && next.players[n];
    if (!isObj(cp) || !isObj(np)) continue;
    if (!isObj(np.garden)) np.garden = cleanPlayer({}).garden;
    np.garden.decor = unionDecor(isObj(cp.garden) ? cp.garden.decor : [], np.garden.decor, DECOR_KINDS);
    if (!isObj(np.bulba)) np.bulba = cleanPlayer({}).bulba;
    if (!cleanAccessory(np.bulba.accessory)) np.bulba.accessory = cleanAccessory(isObj(cp.bulba) ? cp.bulba.accessory : null);
  }
  return next;
}

// The save-root family{} and gifts{} belong to the whole household, not to
// whoever made the code. An import (often an older code, or a classic v2 code
// that has no family at all) can raise them but never lower them: postcards
// and versus tallies take the max, the newest postcard date wins, and waiting
// gifts take the max (a gift re-appearing is a bonus; one vanishing is not).
// DAD'S CHALLENGE wins are a union by code+who (newest 50 kept).
function keepShared(next, current) {
  const a = cleanFamily(current && current.family);
  const b = cleanFamily(next.family);
  next.family = {
    postcards: Math.max(a.postcards, b.postcards),
    lastPostcard: [a.lastPostcard, b.lastPostcard].filter(Boolean).sort().pop() || null,
    versus: { gabe: Math.max(a.versus.gabe, b.versus.gabe), dad: Math.max(a.versus.dad, b.versus.dad) },
    // DAD'S CHALLENGE ribbons: both sides' wins, one per code+who.
    challenge: cleanChallenge({ wins: [...a.challenge.wins, ...b.challenge.wins] }),
  };
  next.gifts = { toReader: Math.max(cleanGifts(current && current.gifts).toReader, cleanGifts(next.gifts).toReader) };
  return next;
}

/** One-deep undo slot. Returns true when the snapshot was written. */
export function snapshot(save) {
  let json;
  try { json = JSON.stringify(withRollbackMirror(save)); } catch (e) { return false; }
  try { LS().setItem(KEYS.prev, json); return true; } catch (e) { /* try once more below */ }
  shedDisposable();
  try { LS().setItem(KEYS.prev, json); return true; } catch (e) { return false; }
}

/**
 * Import a code over `currentSave`. The code is decoded and validated FIRST
 * (a typo costs nothing, not even the undo slot), then the current save is
 * snapshotted to pokedexos_save_v3_prev, then the new save is written.
 * Returns the new save. Throws the decodeCode errors, 'SNAPSHOT_FAILED' or 'SAVE_FAILED'.
 *   v3 code -> replaces the save (Bulba, garden decor, family{} and gifts{} ratcheted)
 *   v2 code -> fromV2, replaces the save (Bulba, garden decor, family{} and gifts{} ratcheted)
 *   v1 code -> caught ids unioned into the current save
 */
export function importCode(code, currentSave) {
  const { kind, data } = decodeCode(code);
  const current = cleanSave(currentSave) || freshSave();
  let next;
  if (kind === 'v1') next = applyV1(current, data);
  else next = keepShared(keepDecor(keepBulba(data, current), current), current);
  // No undo slot, no import: an overwrite that cannot be taken back is
  // exactly the loss this whole module exists to prevent.
  if (!snapshot(currentSave || current)) throw codeError('SNAPSHOT_FAILED');
  if (!persist(next)) throw codeError('SAVE_FAILED');
  return next;
}

export function hasPrevious() { return get(KEYS.prev) != null; }

/** Swap the current save with the undo slot, so RESTORE is itself undoable. */
export function restorePrevious(currentSave) {
  const prev = parse(get(KEYS.prev));
  let save = prev ? (cleanSave(prev) || (isV2Save(prev) ? fromV2(prev) : null)) : null;
  if (!save) throw codeError('NO_SNAPSHOT');
  // Decorations Art placed since the snapshot stay in his garden.
  save = keepDecor(save, cleanSave(currentSave));
  const cur = JSON.stringify(currentSave);
  if (!persist(save)) throw codeError('SAVE_FAILED');
  try { LS().setItem(KEYS.prev, cur); } catch (e) { /* non-fatal */ }
  return save;
}

/** Parent Tools "use old save": rebuild from the untouched classic save. */
export function rereadV2() {
  const v2 = parse(get(KEYS.v2));
  return isV2Save(v2) ? fromV2(v2) : null;
}

/** Ask the browser not to evict our storage (best effort, never throws). */
export async function requestPersistence() {
  try {
    const st = globalThis.navigator && globalThis.navigator.storage;
    if (st && st.persist && !(await st.persisted())) return await st.persist();
    return true;
  } catch (e) { return false; }
}

/** Test-only: forget module state between node tests. */
export function _resetForTests() {
  info = { source: 'fresh', quarantinedKey: null, blocked: false, mergedV2: false };
  backupDone = false;
  pendingV2Seen = null;
  for (const n of [1, 2]) hwm[n] = { petals: 0, stage: 1 };
}
