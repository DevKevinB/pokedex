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
export const MAX_SEEDS = 99;        // road.seeds (Old Venusaur seeds)
export const MAX_GIFTS = 99;        // save.gifts.toReader (Art's leaf-stamped berries)
export const LOCK_PICS = 3;         // player.lock.pics length
export const MAX_FAMILY_COUNT = 99999; // family.postcards and each family.versus tally
export const MAX_CHALLENGE_WINS = 50;  // family.challenge.wins (newest kept)
export const CHALLENGE_CODE_RE = /^[A-Z]{2,10}-\d{3}$/;   // DAD'S CHALLENGE seed code, e.g. MOSSY-714
export const CHALLENGE_WHO = ['dad', 'reader'];
export const WILD_COUNT = 24;          // Wild Chapters: road keys 'w<i>-t<j>', i 0..23
export const WILD_TRAINERS = 6;        //   ... j 0..5
export const MAX_DECOR = 40;           // garden.decor (Art's placed decorations)
export const MAX_SANCTUMS = 64;        // road.roots.sanctums keys
/** A short game-written id (a safe key of <=24 chars): decor kinds, accessories, sanctum ids. */
export const isShortKey = k => isSafeKey(k) && k.length <= 24;

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
    bulba: { petals: 0, stage: 1, stayStone: false, visitors: [], accessory: null },
    garden: { plots: [], berries: 0, decor: [] },
    road: freshRoad(),
    lock: null,
    legacy: {},
  };
}

export function freshRoad() {
  return {
    chapter: 0, cleared: {}, bloomed: [],
    seeds: 0, guardians: {}, hatched: false,
    rival: { wins: 0, losses: 0, last: -1 },
    r2bloomed: [], wildBloomed: [],
    roots: freshRoots(),
  };
}

/** Through the Roots (postgame): the door, and which sanctums he has visited. */
export function freshRoots() {
  return { opened: false, sanctums: {} };
}

/** Save-root fields shared by both players (the family, and gifts that cross from Art to Gabe). */
export function freshFamily() {
  return { postcards: 0, lastPostcard: null, versus: { gabe: 0, dad: 0 }, challenge: { wins: [] } };
}
export function freshGifts() {
  return { toReader: 0 };
}

export function freshSave(created = today()) {
  return {
    version: 3, created,
    players: { 1: freshPlayer(), 2: freshPlayer() },
    family: freshFamily(),
    gifts: freshGifts(),
  };
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
    accessory: cleanAccessory(b.accessory),
  };
}

/** bulba.accessory: null, or a short safe key (the cosmetic he wears). */
export function cleanAccessory(v) {
  return isShortKey(v) ? v : null;
}

// garden.decor: Art's placed decorations, x/y as fractions of the garden.
const DECOR_PLACES = 4;                 // stored precision
export const DECOR_MATCH_PLACES = 2;    // union key precision (1% of the garden)
const unit = n => Math.round(Math.max(0, Math.min(1, n)) * 10 ** DECOR_PLACES) / 10 ** DECOR_PLACES;
export function cleanDecorItem(d) {
  if (!isObj(d) || !isShortKey(d.kind)) return null;
  if (typeof d.x !== 'number' && typeof d.x !== 'string') return null;
  if (typeof d.y !== 'number' && typeof d.y !== 'string') return null;
  const x = Number(d.x), y = Number(d.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { kind: d.kind, x: unit(x), y: unit(y) };
}
export function cleanDecor(raw) {
  const out = [];
  for (const d of arr(raw)) {
    if (out.length >= MAX_DECOR) break;
    const c = cleanDecorItem(d);
    if (c) out.push(c);
  }
  return out;
}
/** The identity used to union decorations across saves: kind + rounded position. */
export const decorKey = d => `${d.kind}@${d.x.toFixed(DECOR_MATCH_PLACES)},${d.y.toFixed(DECOR_MATCH_PLACES)}`;
/**
 * Union two decor lists BY COUNT PER KIND. Every entry in `keep` survives
 * exactly as it is (Art's current garden is never trimmed). For each kind,
 * `add` contributes only as many entries as it holds BEYOND what `keep`
 * already has of that kind, so a decoration Art has since moved is never
 * counted twice (an old code sees it at its old spot). Among a kind's
 * incoming entries, ones already matching a current entry (kind + position
 * rounded to DECOR_MATCH_PLACES, `decorKey`) are the "same" ones and are
 * skipped first. The first entry of a kind `keep` lacks joins while room
 * lasts; an extra copy of a kind joins only while the room reserved for the
 * `kinds` not yet placed stays free (the same reserve rule as
 * data/decor.js decorAction), so every kind always has room. <= MAX_DECOR.
 */
export function unionDecor(keep, add, kinds = []) {
  const out = cleanDecor(keep);
  const have = new Map();
  for (const d of out) have.set(d.kind, (have.get(d.kind) || 0) + 1);
  const curKeys = new Map();
  for (const d of out) { const k = decorKey(d); curKeys.set(k, (curKeys.get(k) || 0) + 1); }
  // Group the incoming ones by kind, same-spot matches first (they are "used up" first).
  const byKind = new Map();
  for (const d of cleanDecor(add)) {
    if (!byKind.has(d.kind)) byKind.set(d.kind, { same: 0, rest: [] });
    const g = byKind.get(d.kind), k = decorKey(d);
    if (curKeys.get(k) > 0) { curKeys.set(k, curKeys.get(k) - 1); g.same++; } else g.rest.push(d);
  }
  const kindList = Array.isArray(kinds) ? kinds : [];
  const known = k => !kindList.length || kindList.includes(k);
  const firsts = [], extras = [];
  for (const [kind, g] of byKind) {
    const surplus = g.same + g.rest.length - (have.get(kind) || 0);
    const joins = g.rest.slice(0, Math.max(0, surplus));
    joins.forEach((d, i) => ((i === 0 && !have.has(kind) && known(kind)) ? firsts : extras).push(d));
  }
  const placed = new Set(out.map(d => d.kind));
  for (const d of firsts) {
    if (out.length >= MAX_DECOR) break;
    out.push(d); placed.add(d.kind);
  }
  for (const d of extras) {
    const reserve = kindList.filter(k => !placed.has(k)).length;
    if (MAX_DECOR - out.length - reserve <= 0) break;
    out.push(d);
  }
  return out;
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
  return { plots, berries: count(g.berries), decor: cleanDecor(g.decor) };
}

const CLEARED_KEY = /^c(\d{1,2})-t(\d{1,2})$/;
const R2_KEY = /^r2-c(0|[1-9]\d?)-t(0|[1-9]\d?)$/;     // ROUND 2 remix: chapter i, trainer j
const WILD_KEY = /^w(0|[1-9]\d?)-t(\d)$/;              // Wild Chapter i (0..23), trainer j (0..5)
/** True for a legal road.cleared key: 'c<i>-t<j>', 'r2-c<i>-t<j>' or 'w<i>-t<j>'. */
export function isClearedKey(k) {
  if (typeof k !== 'string') return false;
  let m = CLEARED_KEY.exec(k);
  if (m) return Number(m[1]) < CHAPTER_COUNT;
  m = R2_KEY.exec(k);
  if (m) return Number(m[1]) < CHAPTER_COUNT;
  m = WILD_KEY.exec(k);
  if (m) return Number(m[1]) < WILD_COUNT && Number(m[2]) < WILD_TRAINERS;
  return false;
}
const idxList = (raw, n) => [...new Set(arr(raw).map(toId)
  .filter(i => Number.isInteger(i) && i >= 0 && i < n))].sort((a, b) => a - b);

export function cleanRoots(raw) {
  const r = isObj(raw) ? raw : {};
  const sanctums = {};
  let n = 0;
  for (const [k, v] of entries(r.sanctums)) {
    if (n >= MAX_SANCTUMS) break;
    if (v && isShortKey(k)) { sanctums[k] = true; n++; }
  }
  return { opened: r.opened === true, sanctums };
}

export function cleanRoad(raw) {
  const r = isObj(raw) ? raw : {};
  const cleared = {};
  for (const [k, v] of entries(r.cleared)) {
    if (v && isClearedKey(k)) cleared[k] = true;
  }
  const bloomed = idxList(r.bloomed, CHAPTER_COUNT);
  const guardians = {};
  for (const [k, v] of entries(r.guardians)) {
    const i = toId(k);
    if (v && Number.isInteger(i) && i >= 0 && i < CHAPTER_COUNT) guardians[i] = true;
  }
  const rv = isObj(r.rival) ? r.rival : {};
  return {
    chapter: clampInt(r.chapter, 0, CHAPTER_COUNT, 0) || 0,
    cleared,
    bloomed,
    seeds: clampInt(r.seeds, 0, MAX_SEEDS, 0) || 0,
    guardians,
    hatched: r.hatched === true,
    rival: {
      wins: clampInt(rv.wins, 0, MAX_FAMILY_COUNT, 0) || 0,
      losses: clampInt(rv.losses, 0, MAX_FAMILY_COUNT, 0) || 0,
      last: clampInt(rv.last, -1, CHAPTER_COUNT - 1, -1),
    },
    r2bloomed: idxList(r.r2bloomed, CHAPTER_COUNT),
    wildBloomed: idxList(r.wildBloomed, WILD_COUNT),
    roots: cleanRoots(r.roots),
  };
}

/**
 * Picture-lock: null, or exactly LOCK_PICS dex ids in order (repeats allowed,
 * like a PIN). Anything else is null — a mangled lock opens, it never traps
 * a boy outside his own card.
 */
export function cleanLock(raw) {
  if (!isObj(raw) || !Array.isArray(raw.pics) || raw.pics.length !== LOCK_PICS) return null;
  const pics = raw.pics.map(toId);
  return pics.every(isDexId) ? { pics } : null;
}

/**
 * family.challenge: DAD'S CHALLENGE wins, [{code:'MOSSY-714', who:'dad'|'reader', date}].
 * One entry per code+who (the earliest date wins), oldest first, the newest
 * MAX_CHALLENGE_WINS kept. Junk entries are dropped, never thrown.
 */
export function cleanChallenge(raw) {
  const c = isObj(raw) ? raw : {};
  const byKey = new Map();
  for (const w of arr(c.wins)) {
    if (!isObj(w)) continue;
    const code = typeof w.code === 'string' ? w.code : '';
    if (!CHALLENGE_CODE_RE.test(code) || !CHALLENGE_WHO.includes(w.who) || !isDate(w.date)) continue;
    const key = code + '|' + w.who;
    const had = byKey.get(key);
    if (!had || w.date < had.date) byKey.set(key, { code, who: w.who, date: w.date });
  }
  const wins = [...byKey.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { wins: wins.slice(-MAX_CHALLENGE_WINS) };
}

/** save.family: shared postcards, couch-versus tallies and DAD'S CHALLENGE wins. */
export function cleanFamily(raw) {
  const f = isObj(raw) ? raw : {};
  const vs = isObj(f.versus) ? f.versus : {};
  const c = v => clampInt(v, 0, MAX_FAMILY_COUNT, 0) || 0;
  return {
    postcards: c(f.postcards),
    lastPostcard: isDate(f.lastPostcard) ? f.lastPostcard : null,
    versus: { gabe: c(vs.gabe), dad: c(vs.dad) },
    challenge: cleanChallenge(f.challenge),
  };
}

/** save.gifts: berries Art grew, waiting on a reader's Road. */
export function cleanGifts(raw) {
  const g = isObj(raw) ? raw : {};
  return { toReader: clampInt(g.toReader, 0, MAX_GIFTS, 0) || 0 };
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

// ---------------------------------------------------------------- rollback safety
//
// NESTED PARKING. cleanRoad / cleanGarden / cleanBulba only keep the fields
// this build knows. So that a LATER build's new nested fields survive a
// rollback to this one, their unknown keys are parked (bounded, JSON-safe)
// in legacy.v3road / legacy.v3garden / legacy.v3bulba, and unknown
// road.cleared keys in legacy.v3cleared. A newer value replaces an older
// parked one; parked keys are never deleted. A later build reads them back.
//
// THE B4 MIRROR. v20.0.0 (live before batch 4) keeps unknown TOP-LEVEL
// player keys in legacy{} word for word but drops unknown nested ones. So
// every write (persist, and every export code) also carries player.b4, a
// copy of the batch-4 fields. An old build parks it as legacy.b4; this
// build absorbs b4 / legacy.b4 back on load as a union that never lowers
// anything (cleared keys, blooms, roots, decor by count, accessory if none).
export const MIRROR_KEY = 'b4';
const NESTED_PARK = [['road', 'v3road', () => freshRoad()], ['garden', 'v3garden', () => freshPlayer().garden], ['bulba', 'v3bulba', () => freshPlayer().bulba]];
const MAX_PARKED_CLEARED = 512;
function parkNested(legacy, raw) {
  for (const [field, slot, fresh] of NESTED_PARK) {
    const src = raw[field];
    if (!isObj(src)) continue;
    const known = new Set(Object.keys(fresh()));
    const extras = {};
    for (const [k, v] of entries(src)) if (!known.has(k)) extras[k] = v;
    if (!Object.keys(extras).length) continue;
    const had = isObj(legacy[slot]) ? legacy[slot] : {};
    const merged = cleanLegacy({ [slot]: { ...had, ...extras } })[slot];
    if (merged !== undefined) legacy[slot] = merged;
  }
  const cl = isObj(raw.road) ? raw.road.cleared : null;
  if (isObj(cl)) {
    const had = isObj(legacy.v3cleared) ? { ...legacy.v3cleared } : {};
    let n = Object.keys(had).length, added = false;
    for (const [k, v] of entries(cl)) {
      if (n >= MAX_PARKED_CLEARED) break;
      if (!v || isClearedKey(k) || !isSafeKey(k) || had[k] === true) continue;
      had[k] = true; n++; added = true;
    }
    if (added) legacy.v3cleared = had;
  }
}

/** player -> its batch-4 mirror {cleared:[r2/w keys], r2bloomed, wildBloomed, roots, decor, accessory}. */
export function mirrorOf(player) {
  const p = isObj(player) ? player : {};
  const road = isObj(p.road) ? p.road : {};
  const cleared = Object.keys(isObj(road.cleared) ? road.cleared : {})
    .filter(k => road.cleared[k] && isClearedKey(k) && !CLEARED_KEY.test(k));
  const r = cleanRoad(road);
  return {
    cleared,
    r2bloomed: r.r2bloomed,
    wildBloomed: r.wildBloomed,
    roots: r.roots,
    decor: cleanDecor(isObj(p.garden) ? p.garden.decor : null),
    accessory: cleanAccessory(isObj(p.bulba) ? p.bulba.accessory : null),
  };
}

/** A copy of `save` for writing to disk or a code: every player also carries its b4 mirror. */
export function withRollbackMirror(save) {
  if (!isObj(save) || !isObj(save.players)) return save;
  const players = { ...save.players };
  for (const n of [1, 2]) if (isObj(players[n])) players[n] = { ...players[n], [MIRROR_KEY]: mirrorOf(players[n]) };
  return { ...save, players };
}

function absorbMirror(p, m) {
  if (!isObj(m)) return;
  for (const k of arr(m.cleared)) if (isClearedKey(k)) p.road.cleared[k] = true;
  p.road.r2bloomed = idxList([...p.road.r2bloomed, ...arr(m.r2bloomed)], CHAPTER_COUNT);
  p.road.wildBloomed = idxList([...p.road.wildBloomed, ...arr(m.wildBloomed)], WILD_COUNT);
  const roots = cleanRoots(m.roots);
  if (roots.opened) p.road.roots.opened = true;
  for (const k of Object.keys(roots.sanctums)) {
    if (Object.keys(p.road.roots.sanctums).length >= MAX_SANCTUMS) break;
    p.road.roots.sanctums[k] = true;
  }
  p.garden.decor = unionDecor(p.garden.decor, m.decor);
  if (!p.bulba.accessory) p.bulba.accessory = cleanAccessory(m.accessory);
}

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
  // Our own rollback mirror (see withRollbackMirror) is absorbed below, never parked.
  const mirrors = [raw[MIRROR_KEY], legacy[MIRROR_KEY]];
  delete legacy[MIRROR_KEY];
  const extras = {};
  for (const [k, v] of entries(raw)) if (!V3_KEYS.has(k) && k !== MIRROR_KEY && !Object.hasOwn(legacy, k)) extras[k] = v;
  Object.assign(legacy, cleanLegacy(extras));
  parkNested(legacy, raw);

  const out = {
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
    lock: cleanLock(raw.lock),
    legacy,
  };
  for (const m of mirrors) absorbMirror(out, m);
  return out;
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
    family: cleanFamily(raw.family),
    gifts: cleanGifts(raw.gifts),
  };
}

// ---------------------------------------------------------------- shared-state helpers
// Pure mutators on a (clean) v3 save. They clamp, never throw, and return the
// new value. store.js wraps each one with a commit().

/** Art grew a gift for the reader's Road. Returns the new count (capped at MAX_GIFTS). */
export function addGift(save, n = 1) {
  if (!isObj(save)) return 0;
  const g = cleanGifts(save.gifts);
  g.toReader = Math.min(MAX_GIFTS, g.toReader + (clampInt(n, 0, MAX_GIFTS, 0) || 0));
  save.gifts = g;
  return g.toReader;
}

/** The reader opens one gift. Returns true when there was one to open. */
export function takeGift(save) {
  if (!isObj(save)) return false;
  const g = cleanGifts(save.gifts);
  const had = g.toReader > 0;
  if (had) g.toReader -= 1;
  save.gifts = g;
  return had;
}

/** A Family Postcard was made on `date` (YYYY-MM-DD). Returns the new count. */
export function addPostcard(save, date = today()) {
  if (!isObj(save)) return 0;
  const f = cleanFamily(save.family);
  f.postcards = Math.min(MAX_FAMILY_COUNT, f.postcards + 1);
  if (isDate(date)) f.lastPostcard = date;
  save.family = f;
  return f.postcards;
}

/** Couch Versus result: winner 'gabe' | 'dad'. Returns the new tally, or null for an unknown winner. */
export function addVersusWin(save, winner) {
  if (!isObj(save) || (winner !== 'gabe' && winner !== 'dad')) return null;
  const f = cleanFamily(save.family);
  f.versus[winner] = Math.min(MAX_FAMILY_COUNT, f.versus[winner] + 1);
  save.family = f;
  return { ...f.versus };
}

/**
 * DAD'S CHALLENGE: `who` ('dad' | 'reader') beat seed `code` on `date`.
 * Returns the stored wins, or null when the code/who is not valid. A repeat
 * win of the same code by the same side changes nothing (it is still a win).
 */
export function addChallengeWin(save, code, who, date = today()) {
  if (!isObj(save) || typeof code !== 'string' || !CHALLENGE_CODE_RE.test(code) || !CHALLENGE_WHO.includes(who)) return null;
  const f = cleanFamily(save.family);
  f.challenge = cleanChallenge({ wins: [...f.challenge.wins, { code, who, date: isDate(date) ? date : today() }] });
  save.family = f;
  return f.challenge.wins.map(w => ({ ...w }));
}

/** True when `pics` opens `player`'s picture-lock (always true when there is no lock). */
export function lockOpens(player, pics) {
  const lock = isObj(player) ? cleanLock(player.lock) : null;
  if (!lock) return true;
  if (!Array.isArray(pics) || pics.length !== LOCK_PICS) return false;
  return lock.pics.every((id, i) => toId(pics[i]) === id);
}

// ---------------------------------------------------------------- per-player helpers (batch 4)
// Pure mutators on ONE player object (a live store.player()). Clamp, never throw.

/**
 * Art puts a decoration down. -> the stored {kind,x,y}, or null when the kind
 * is not a safe key, x/y are not numbers, or the garden already holds MAX_DECOR.
 */
export function placeDecor(player, kind, x, y) {
  if (!isObj(player)) return null;
  const d = cleanDecorItem({ kind, x, y });
  if (!d || typeof x !== 'number' || typeof y !== 'number') return null;
  const g = isObj(player.garden) ? player.garden : (player.garden = { plots: [], berries: 0 });
  const decor = cleanDecor(g.decor);
  if (decor.length >= MAX_DECOR) return null;
  decor.push(d);
  g.decor = decor;
  return { ...d };
}

/** Art drags decoration `i` somewhere else. -> the moved {kind,x,y}, or null (nothing changed). */
export function moveDecor(player, i, x, y) {
  if (!isObj(player) || !isObj(player.garden) || typeof x !== 'number' || typeof y !== 'number') return null;
  const decor = cleanDecor(player.garden.decor);
  if (!Number.isInteger(i) || i < 0 || i >= decor.length) return null;
  const d = cleanDecorItem({ kind: decor[i].kind, x, y });
  if (!d) return null;
  decor[i] = d;
  player.garden.decor = decor;
  return { ...d };
}

/** What Bulba wears: a short safe key, or null for nothing. -> the stored value (junk changes nothing). */
export function setAccessory(player, key) {
  if (!isObj(player)) return null;
  const b = isObj(player.bulba) ? player.bulba : (player.bulba = cleanBulba({}));
  if (key !== null && !isShortKey(key)) return cleanAccessory(b.accessory);
  b.accessory = key;
  return key;
}

function roadOf(player) {
  if (!isObj(player.road)) player.road = freshRoad();
  return player.road;
}

/** Through the Roots: the door is open (it never closes again). -> true. */
export function openRoots(player) {
  if (!isObj(player)) return false;
  const road = roadOf(player);
  road.roots = cleanRoots(road.roots);
  road.roots.opened = true;
  return true;
}

/** Through the Roots: sanctum `key` visited. -> true when stored (a bad key or a full list changes nothing). */
export function addSanctum(player, key) {
  if (!isObj(player) || !isShortKey(key)) return false;
  const road = roadOf(player);
  const roots = cleanRoots(road.roots);
  if (!roots.sanctums[key] && Object.keys(roots.sanctums).length >= MAX_SANCTUMS) { road.roots = roots; return false; }
  roots.sanctums[key] = true;
  road.roots = roots;
  return true;
}

/** True when a player carries any progress worth protecting. */
export function hasProgress(p) {
  if (!isObj(p)) return false;
  return (Array.isArray(p.caught) && p.caught.length > 0)
    || (isObj(p.bulba) && count(p.bulba.petals) > 0)
    || (isObj(p.gyms) && isObj(p.gyms.beaten) && Object.keys(p.gyms.beaten).length > 0)
    || (isObj(p.road) && isObj(p.road.cleared) && Object.keys(p.road.cleared).length > 0)
    || (isObj(p.garden) && Array.isArray(p.garden.decor) && p.garden.decor.length > 0);
}
