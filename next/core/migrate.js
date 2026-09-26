// ============================================================
// SPROUT ROAD — migration from the classic app (PURE: no storage).
//
//   fromV2(v2save)     -> v3 save      (first boot on a device with a classic save)
//   mergeV2(v3, v2)    -> v3 save      (EVERY boot: classic progress flows in)
//   applyV1(v3, {p1,p2}) -> v3 save    (the very old v15 keys / v1 import codes)
//
// SAVES ARE SACRED. Nothing here reads or writes localStorage, and nothing
// here mutates its inputs. mergeV2 is UNION ONLY: it never removes an id, a
// badge, a beaten trainer or a level, and it never touches Bulba or the
// Garden (Art's partner exists only in v3; the classic app cannot lower him).
// The same goes for the v3-only Road fields (seeds, guardians, hatched,
// rival), the picture-lock, and the save-root family{} and gifts{}: migration
// only ever DEFAULTS them (fromV2) or carries them through untouched (merge).
//
// Every v2 player field maps across: caught, team, mons, badges, shinies,
// nicks, favorites, items, gyms.beaten, champion, stats. settings.junior
// becomes profile. Everything else the classic save carried (quests,
// settings, extra gyms fields, anything unknown) is kept VERBATIM in
// legacy{} — kept, never rendered, never deleted.
// ============================================================

import {
  isObj, cleanPlayer, freshPlayer, freshSave, cleanIds, cleanBeaten, today,
  cleanFamily, cleanGifts, freshFamily, freshGifts,
  MAX_TEAM, MAX_FAVORITES, CHAPTER_COUNT,
} from './validate.js';

/** The v2 player fields that map onto v3 fields. Everything else -> legacy. */
export const V2_MAPPED = new Set([
  'name', 'caught', 'team', 'mons', 'badges', 'shinies', 'nicks', 'favorites',
  'items', 'gyms', 'champion', 'stats',
]);

// The classic Gym Circuit, in chapter order, and each gym's trainer count.
// data/chapters.js builds CHAPTERS = GYMS.map(...) from the same list in the
// same order, so classic key `${gym}:${j}` is chapter i, trainer j. It is
// written out here (not imported) so migration stays a pure, dependency-free
// module that can never be broken by a data file.
export const GYM_ORDER = [
  ['rock', 5], ['water', 5], ['electric', 5], ['grass', 5], ['psychic', 5], ['fighting', 5],
  ['ghost', 5], ['ice', 5], ['fire', 5], ['dragon', 5], ['victory', 3], ['elite', 5],
];

/**
 * Road progress implied by classic round-1 gym wins. A boy who beat BOULDER
 * GYM in the classic app finds chapter 1 already cleared and bloomed on the
 * Verdant Road — the game never makes him re-earn what he already won.
 */
export function roadFromBeaten(beaten) {
  const b = isObj(beaten) ? beaten : {};
  const cleared = {};
  const bloomed = [];
  GYM_ORDER.forEach(([key, n], i) => {
    for (let j = 0; j < n; j++) if (b[`${key}:${j}`]) cleared[`c${i}-t${j}`] = true;
    if (b[`${key}:${n - 1}`]) bloomed.push(i);
  });
  let chapter = 0;
  while (chapter < CHAPTER_COUNT && bloomed.includes(chapter)) chapter++;
  return { chapter, cleared, bloomed };
}

// The classic app knows chapters, trainers and blooms only. Every v3-only
// Road field (seeds, guardians, hatched, rival) is taken from v3 untouched.
function mergeRoad(a, b) {
  return {
    ...a,
    chapter: Math.max(a.chapter || 0, b.chapter || 0),
    cleared: { ...b.cleared, ...a.cleared },
    bloomed: [...new Set([...(a.bloomed || []), ...(b.bloomed || [])])].sort((x, y) => x - y),
  };
}

/** One classic v2 player -> one clean v3 player. */
export function playerFromV2(raw) {
  if (!isObj(raw)) return freshPlayer();
  const legacy = {};
  for (const k of Object.keys(raw)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (!V2_MAPPED.has(k)) legacy[k] = raw[k];     // quests, settings, unknowns
  }
  const gyms = isObj(raw.gyms) ? raw.gyms : {};
  const gymExtras = {};
  for (const k of Object.keys(gyms)) if (k !== 'beaten' && k !== '__proto__') gymExtras[k] = gyms[k];
  if (Object.keys(gymExtras).length) legacy.gyms = gymExtras;

  const beaten = cleanBeaten(gyms.beaten);
  const settings = isObj(raw.settings) ? raw.settings : {};
  return cleanPlayer({
    name: raw.name,
    profile: settings.junior ? 'prereader' : 'reader',
    caught: raw.caught,
    team: raw.team,
    mons: raw.mons,
    shinies: raw.shinies,
    nicks: raw.nicks,
    favorites: raw.favorites,
    items: raw.items,
    badges: raw.badges,
    gyms: { beaten },
    champion: raw.champion,
    stats: raw.stats,
    road: roadFromBeaten(beaten),
    legacy,
  });
}

/** True when `v2` looks like a classic save: {version:2, players:{1|2}}. */
export function isV2Save(v2) {
  return isObj(v2) && v2.version === 2 && isObj(v2.players) && (isObj(v2.players[1]) || isObj(v2.players[2]));
}

/** A classic v2 save -> a v3 save. Anything unrecognised -> a fresh save. */
export function fromV2(v2, created = today()) {
  if (!isV2Save(v2)) return freshSave(created);
  return {
    version: 3, created,
    players: { 1: playerFromV2(v2.players[1]), 2: playerFromV2(v2.players[2]) },
    family: freshFamily(),
    gifts: freshGifts(),
  };
}

// Save-root fields (family, gifts) exist only in v3. The classic app has no
// such thing, so every merge carries them through exactly as v3 had them.
const rootOf = base => ({ family: cleanFamily(base.family), gifts: cleanGifts(base.gifts) });

const union = (a, b) => [...new Set([...(a || []), ...(b || [])])];
const unionIds = (a, b) => union(a, b).sort((x, y) => x - y);

function maxMap(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) out[k] = Math.max(out[k] || 0, v || 0);
  return out;
}

function mergeMons(a, b) {
  const out = { ...a };
  for (const [id, m] of Object.entries(b || {})) {
    const cur = out[id];
    if (!cur || m.level > cur.level || (m.level === cur.level && m.xp > cur.xp)) out[id] = { ...m };
  }
  return out;
}

/** Union-merge one classic player into one v3 player. Never removes anything. */
export function mergePlayer(v3p, v2raw) {
  const a = cleanPlayer(v3p);
  if (!isObj(v2raw)) return a;
  const b = playerFromV2(v2raw);
  const caught = unionIds(a.caught, b.caught);
  const owned = new Set(caught);
  const legacy = { ...b.legacy, ...a.legacy };
  return cleanPlayer({
    ...a,
    name: a.name || b.name,
    profile: a.profile,                            // only the grown-up toggle changes it
    caught,
    team: (a.team.length ? a.team : b.team).filter(id => owned.has(id)).slice(0, MAX_TEAM),
    mons: mergeMons(a.mons, b.mons),
    shinies: unionIds(a.shinies, b.shinies),
    nicks: { ...b.nicks, ...a.nicks },              // v3 wins, else v2
    favorites: union(a.favorites, b.favorites).filter(id => owned.has(id)).slice(0, MAX_FAVORITES),
    items: maxMap(a.items, b.items),
    badges: union(a.badges, b.badges),
    gyms: { beaten: { ...b.gyms.beaten, ...a.gyms.beaten } },
    champion: a.champion || b.champion,
    stats: maxMap(a.stats, b.stats),
    road: mergeRoad(a.road, b.road),
    bulba: a.bulba,                                  // v3 only: never touched by the classic app
    garden: a.garden,
    legacy,
  });
}

/**
 * Pull classic progress into a v3 save. Union only: every id, level, badge,
 * beaten trainer, nick and champion record already in v3 survives. A v2 value
 * that is not a classic save leaves v3 exactly as it was (cleaned).
 */
export function mergeV2(v3, v2) {
  const base = isObj(v3) && isObj(v3.players) ? v3 : freshSave();
  const created = typeof base.created === 'string' ? base.created : today();
  if (!isV2Save(v2)) {
    return { version: 3, created, players: { 1: cleanPlayer(base.players[1]), 2: cleanPlayer(base.players[2]) }, ...rootOf(base) };
  }
  return {
    version: 3, created,
    players: {
      1: mergePlayer(base.players[1], v2.players[1]),
      2: mergePlayer(base.players[2], v2.players[2]),
    },
    ...rootOf(base),
  };
}

/**
 * The oldest format of all: bare caught lists, {p1:[ids], p2:[ids]} (the v15
 * localStorage keys, and v1 import codes). Union into `v3`, never replace.
 */
export function applyV1(v3, { p1 = null, p2 = null } = {}) {
  const base = isObj(v3) && isObj(v3.players) ? v3 : freshSave();
  const add = (p, list) => {
    const cp = cleanPlayer(p);
    if (!Array.isArray(list)) return cp;
    const caught = unionIds(cp.caught, cleanIds(list));
    return cleanPlayer({ ...cp, caught, stats: { ...cp.stats, catches: Math.max(cp.stats.catches, caught.length) } });
  };
  return {
    version: 3,
    created: typeof base.created === 'string' ? base.created : today(),
    players: { 1: add(base.players[1], p1), 2: add(base.players[2], p2) },
    ...rootOf(base),
  };
}
