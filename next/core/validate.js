// ============================================================
// SPROUT ROAD — save validation (PURE: no storage, no DOM, no clock
// except the one `today()` helper used for defaults).
//
// Every save that enters the game passes through cleanPlayer / cleanSave:
// the one on disk, one migrated from the classic app, and one pasted in as
// an import code. An import code is untrusted input, so this is the ONE
// boundary where junk is turned into a shape the rest of the app can trust.
//
// Ported protections from ../js/state.js (hydratePlayer, cleanIds,
// cleanName, validChampion, countMap, cleanGyms), plus:
//   * __proto__ / constructor / prototype keys can never be assigned;
//   * every input array and object is size-capped BEFORE it is walked;
//   * petals and stage are clamped only to their legal range — validation
//     never lowers a legal value (petals only go up; see save.js).
// ============================================================

export const MAX_ID = 649;
export const MAX_TEAM = 6;
export const MAX_FAVORITES = 6;
export const MAX_PLOTS = 60;
export const MAX_LEVEL = 100;
export const DEFAULT_LEVEL = 5;
export const CHAPTER_COUNT = 12;
export const PROFILES = ['reader', 'prereader'];

// Input caps. Real saves are far below these (649 species, 58 trainers); a
// payload above them is hostile or corrupt, and walking it would stall boot.
const MAX_ARRAY_IN = 5000;
const MAX_KEYS_IN = 5000;
const MAX_COUNT = 1e9;

const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
export const isDexId = n => Number.isInteger(n) && n >= 1 && n <= MAX_ID;

/** A key the game wrote itself ('rock:0', 'gym-rock', 'c3-t4'). */
export const isSafeKey = k => typeof k === 'string' && !BAD_KEYS.has(k) && /^[A-Za-z0-9_:.-]{1,64}$/.test(k);

/** Own entries of a plain object, capped, never including a poisoned key. */
function entries(o) {
  if (!isObj(o)) return [];
  const out = [];
  for (const k of Object.keys(o)) {
    if (out.length >= MAX_KEYS_IN) break;
    if (BAD_KEYS.has(k)) continue;
    out.push([k, o[k]]);
  }
  return out;
}

const arr = a => (Array.isArray(a) ? a.slice(0, MAX_ARRAY_IN) : []);

/** Dex ids: numbers (or numeric strings) 1..649, de-duplicated, sorted. */
export const cleanIds = a => [...new Set(arr(a).map(toId).filter(isDexId))].sort((x, y) => x - y);

/** Same, WITHOUT sorting — team order is meaningful (team[0] is the lead). */
export const cleanOrderedIds = a => [...new Set(arr(a).map(toId).filter(isDexId))];

function toId(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^\d{1,4}$/.test(v.trim())) return Number(v.trim());
  return NaN;
}

/** A non-negative integer counter, capped. Anything else is 0. */
export const count = v => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_COUNT) : 0;
};

const clampInt = (v, lo, hi, dflt) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};

// Names and nicknames. Decode entities an older classic build may have
// stored (bounded, so a ratcheted name cannot loop), then STRIP < > & " so
// nothing left can open a tag or break an attribute, even though next/
// renders only through textContent. The apostrophe in GABE'S survives.
const decodeEntities = s => {
  let out = String(s == null ? '' : s);
  for (let i = 0; i < 4 && /&(amp|lt|gt|quot|#39);/.test(out); i++) {
    out = out.replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }
  return out;
};
export const cleanName = s => {
  if (s == null || (typeof s !== 'string' && typeof s !== 'number')) return '';
  return decodeEntities(String(s).slice(0, 200))
    // eslint-disable-next-line no-control-regex
    .replace(/[<>&"`\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
};

export function today(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// ---------------------------------------------------------------- defaults

export function freshPlayer() {
  return {
    name: '',
    profile: 'reader',
    caught: [], team: [], mons: {}, shinies: [], nicks: {}, favorites: [],
    items: { masterBalls: 1 },
    badges: [],
    gyms: { beaten: {} },
    champion: null,
    stats: { catches: 0, battlesWon: 0, battlesLost: 0, versusWins: 0, explores: 0 },
    bulba: { petals: 0, stage: 1, stayStone: false, visitors: [] },
    garden: { plots: [], berries: 0 },
    road: { chapter: 0, cleared: {}, bloomed: [] },
    legacy: {},
  };
}

export function freshSave(created = today()) {
  return { version: 3, created, players: { 1: freshPlayer(), 2: freshPlayer() } };
}

// ---------------------------------------------------------------- pieces

export function cleanMons(raw) {
  const mons = {};
  for (const [k, v] of entries(raw)) {
    const id = toId(k);
    if (!isDexId(id) || !isObj(v)) continue;
    mons[id] = {
      level: clampInt(v.level, 1, MAX_LEVEL, DEFAULT_LEVEL) || DEFAULT_LEVEL,
      xp: count(v.xp),
    };
  }
  return mons;
}

export function cleanNicks(raw) {
  const nicks = {};
  for (const [k, v] of entries(raw)) {
    const id = toId(k);
    if (!isDexId(id)) continue;
    const n = cleanName(v);
    if (n) nicks[id] = n;
  }
  return nicks;
}

/** Counters: base keys always present, extra safe keys kept, values numbers only. */
export function countMap(base, raw) {
  const out = { ...base };
  for (const [k, v] of entries(raw)) if (isSafeKey(k)) out[k] = count(v);
  return out;
}

export function cleanBadges(raw) {
  return [...new Set(arr(raw).filter(isSafeKey))];
}

export function cleanBeaten(raw) {
  const beaten = {};
  for (const [k, v] of entries(raw)) if (isSafeKey(k) && v) beaten[k] = true;
  return beaten;
}

export function cleanChampion(c) {
  if (!isObj(c) || !isDate(c.date)) return null;
  const team = cleanOrderedIds(c.team).slice(0, MAX_TEAM);
  if (!team.length) return null;
  const levels = {};
  for (const [k, v] of entries(c.levels)) {
    const id = toId(k);
    if (isDexId(id)) levels[id] = clampInt(v, 1, MAX_LEVEL, 1) || 1;
  }
  return { date: c.date, team, levels };
}

export function cleanBulba(raw) {
  const b = isObj(raw) ? raw : {};
  // Petals: any legal non-negative integer is kept as-is (never lowered).
  const p = Math.floor(Number(b.petals));
  const petals = Number.isFinite(p) && p > 0 ? Math.min(p, Number.MAX_SAFE_INTEGER) : 0;
  return {
    petals,
    stage: clampInt(b.stage, 1, 3, 1) || 1,
    stayStone: b.stayStone === true,
    visitors: cleanIds(b.visitors),
  };
}

const GROWN_MAX = 100;
function cleanPlot(p) {
  if (!isObj(p)) return null;
  const x = Number(p.x), y = Number(p.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const kind = typeof p.kind === 'string' && isSafeKey(p.kind) && p.kind.length <= 24 ? p.kind : null;
  if (!kind) return null;
  const clampCoord = n => Math.max(-10000, Math.min(10000, Math.round(n * 1000) / 1000));
  let grown;
  if (typeof p.grown === 'boolean') grown = p.grown;
  else grown = clampInt(p.grown, 0, GROWN_MAX, 0);
  return { x: clampCoord(x), y: clampCoord(y), kind, grown };
}

export function cleanGarden(raw) {
  const g = isObj(raw) ? raw : {};
  const plots = [];
  for (const p of arr(g.plots)) {
    if (plots.length >= MAX_PLOTS) break;
    const c = cleanPlot(p);
    if (c) plots.push(c);
  }
  return { plots, berries: count(g.berries) };
}

const CLEARED_KEY = /^c(\d{1,2})-t(\d{1,2})$/;
export function cleanRoad(raw) {
  const r = isObj(raw) ? raw : {};
  const cleared = {};
  for (const [k, v] of entries(r.cleared)) {
    const m = CLEARED_KEY.exec(k);
    if (m && v && Number(m[1]) < CHAPTER_COUNT) cleared[k] = true;
  }
  const bloomed = [...new Set(arr(r.bloomed).map(toId)
    .filter(n => Number.isInteger(n) && n >= 0 && n < CHAPTER_COUNT))].sort((a, b) => a - b);
  return { chapter: clampInt(r.chapter, 0, CHAPTER_COUNT, 0) || 0, cleared, bloomed };
}

// legacy{}: stored VERBATIM (it is never rendered), but made JSON-safe and
// bounded: no poisoned keys, no cycles, no functions, and a depth/size cap so
// a hostile import cannot park megabytes in the save.
const LEGACY_DEPTH = 8;
const LEGACY_MAX_BYTES = 64 * 1024;
function legacyValue(v, depth) {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (depth >= LEGACY_DEPTH || typeof v !== 'object') return undefined;
  if (Array.isArray(v)) {
    return v.slice(0, 2000).map(x => { const c = legacyValue(x, depth + 1); return c === undefined ? null : c; });
  }
  const out = {};
  for (const [k, x] of entries(v)) {
    const c = legacyValue(x, depth + 1);
    if (c !== undefined) out[k] = c;
  }
  return out;
}
export function cleanLegacy(raw) {
  const out = {};
  for (const [k, v] of entries(raw)) {
    const c = legacyValue(v, 1);
    if (c === undefined) continue;
    let size = 0;
    try { size = JSON.stringify(c).length; } catch (e) { continue; }
    if (size > LEGACY_MAX_BYTES) continue;
    out[k] = c;
  }
  return out;
}

// ---------------------------------------------------------------- player

/** The v3 fields cleanPlayer understands. Anything else goes to legacy{}. */
export const V3_KEYS = new Set(Object.keys(freshPlayer()));

/**
 * raw (anything) -> a safe v3 Player. Never throws. Unknown top-level keys
 * are not dropped: they move into legacy{} (existing legacy entries win).
 */
export function cleanPlayer(raw) {
  const base = freshPlayer();
  if (!isObj(raw)) return base;

  const caught = cleanIds(raw.caught);
  const owned = new Set(caught);
  const items = countMap(base.items, raw.items);
  if (!isObj(raw.items) || !('masterBalls' in raw.items)) items.masterBalls = base.items.masterBalls;

  const legacy = cleanLegacy(raw.legacy);
  const extras = {};
  for (const [k, v] of entries(raw)) if (!V3_KEYS.has(k) && !Object.hasOwn(legacy, k)) extras[k] = v;
  Object.assign(legacy, cleanLegacy(extras));

  return {
    name: cleanName(raw.name),
    profile: PROFILES.includes(raw.profile) ? raw.profile : 'reader',
    caught,
    // A team member you don't own is a guaranteed crash on battle start.
    team: cleanOrderedIds(raw.team).filter(id => owned.has(id)).slice(0, MAX_TEAM),
    mons: cleanMons(raw.mons),
    shinies: cleanIds(raw.shinies),
    nicks: cleanNicks(raw.nicks),
    favorites: cleanOrderedIds(raw.favorites).filter(id => owned.has(id)).slice(0, MAX_FAVORITES),
    items,
    badges: cleanBadges(raw.badges),
    gyms: { beaten: cleanBeaten(isObj(raw.gyms) ? raw.gyms.beaten : null) },
    champion: cleanChampion(raw.champion),
    stats: countMap(base.stats, raw.stats),
    bulba: cleanBulba(raw.bulba),
    garden: cleanGarden(raw.garden),
    road: cleanRoad(raw.road),
    legacy,
  };
}

/** raw (anything) -> a safe v3 save, or null when it is not a v3 save at all. */
export function cleanSave(raw) {
  if (!isObj(raw) || raw.version !== 3 || !isObj(raw.players)) return null;
  const ps = raw.players;
  if (!isObj(ps[1]) && !isObj(ps[2])) return null;
  return {
    version: 3,
    created: isDate(raw.created) ? raw.created : today(),
    players: { 1: cleanPlayer(ps[1]), 2: cleanPlayer(ps[2]) },
  };
}

/** True when a player carries any progress worth protecting. */
export function hasProgress(p) {
  if (!isObj(p)) return false;
  return (Array.isArray(p.caught) && p.caught.length > 0)
    || (isObj(p.bulba) && count(p.bulba.petals) > 0)
    || (isObj(p.gyms) && isObj(p.gyms.beaten) && Object.keys(p.gyms.beaten).length > 0)
    || (isObj(p.road) && isObj(p.road.cleared) && Object.keys(p.road.cleared).length > 0);
}
