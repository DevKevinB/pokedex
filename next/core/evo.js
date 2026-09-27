// ============================================================
// SPROUT ROAD: evolution data + the pure evolve helper (wild builder).
//
// A port of the classic js/api.js evolutionOptions (v19.8 "THE FAN": every
// branch of a chain, so Eevee has all of its evolutions) and of
// js/state.js evolveMon, reworked so the old Pokemon is NEVER removed.
//
// Data: /pokemon-species/{id} -> evolution_chain.url -> /evolution-chain/{n}.
// core/api.js keeps a slim record without the chain url, so this file does
// its own two fetches and caches both in memory for the session (a chain is
// a few hundred bytes; nothing here touches the save or IndexedDB).
// Every failure reads as "no evolution today": never thrown at a child.
// ============================================================

import { displayName, MAX_ID } from './api.js';

const API = 'https://pokeapi.co/api/v2';
const CHAIN_RE = /^https:\/\/pokeapi\.co\/api\/v2\/evolution-chain\/\d{1,5}\/?$/;
const FETCH_TIMEOUT = 8000;

/** Stone and trade lines (and friendship ones) happen at Lv30, as in the
 *  classic app: there are no stones and no trading, and a child must never
 *  need an item he cannot find. */
export const EVO_DEFAULT_LEVEL = 30;

/** Art's partner line. A prereader's Bulbasaur family evolves ONLY through
 *  his Bulba's bud in the Garden, never through a battle level-up. */
export const BULBA_LINE = Object.freeze([1, 2, 3]);

const validId = n => Number.isInteger(n) && n >= 1 && n <= MAX_ID;

async function defaultFetchJson(url) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), FETCH_TIMEOUT) : null;
  try {
    const res = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
    if (!res.ok) throw new Error('API_ERROR ' + res.status);
    return await res.json();
  } finally { if (t) clearTimeout(t); }
}

/**
 * Raw /evolution-chain JSON -> a FLAT list [{id, name, from, minLevel}],
 * depth-first so a parent always precedes its children. `from` is the
 * parent's id (null at the root). Self-loops and junk are skipped.
 */
export function slimChain(json) {
  const out = [];
  const seen = new Set();
  const walk = (node, from, depth) => {
    if (!node || typeof node !== 'object' || depth > 8) return;
    const url = node.species && typeof node.species.url === 'string' ? node.species.url : '';
    const m = /\/pokemon-species\/(\d{1,5})\/?$/.exec(url);
    const id = m ? Number(m[1]) : NaN;
    if (!Number.isInteger(id) || id < 1 || seen.has(id)) return;
    seen.add(id);
    const d = Array.isArray(node.evolution_details) ? node.evolution_details[0] : null;
    const ml = d && Number.isInteger(d.min_level) && d.min_level > 0 ? Math.min(100, d.min_level) : null;
    out.push({ id, name: displayName(node.species.name), from, minLevel: ml });
    for (const next of Array.isArray(node.evolves_to) ? node.evolves_to : []) walk(next, id, depth + 1);
  };
  walk(json && json.chain, null, 0);
  return out;
}

/** What `id` can become at `level`, from a slim chain: [{id, name, minLevel}]. */
export function optionsFrom(chain, id, level) {
  const me = Number(id);
  const lv = Number(level);
  return (Array.isArray(chain) ? chain : [])
    .filter(c => c.from === me && validId(c.id) && c.id !== me && lv >= (c.minLevel ?? EVO_DEFAULT_LEVEL))
    .map(c => ({ id: c.id, name: c.name, minLevel: c.minLevel }));
}

const speciesChainUrl = new Map();   // id -> chain url | null
const chains = new Map();            // chain url -> Promise<slim chain>

/** Test-only: forget the memory caches. */
export function _resetEvoCache() { speciesChainUrl.clear(); chains.clear(); }

/** The slim chain of a species (memory-cached). Rejects on a network error. */
export async function chainOf(id, { fetchJson = defaultFetchJson } = {}) {
  const n = Number(id);
  if (!validId(n)) return [];
  let url = speciesChainUrl.get(n);
  if (url === undefined) {
    const sp = await fetchJson(`${API}/pokemon-species/${n}`);
    const raw = sp && sp.evolution_chain && sp.evolution_chain.url;
    url = typeof raw === 'string' && CHAIN_RE.test(raw) ? raw : null;
    speciesChainUrl.set(n, url);
  }
  if (!url) return [];
  if (!chains.has(url)) {
    const job = fetchJson(url).then(slimChain);
    chains.set(url, job);
    job.catch(() => chains.delete(url));   // a failure is retried next time
  }
  return chains.get(url);
}

/** Every evolution `id` can take RIGHT NOW at `level`. [] when none, out of
 *  range, or the data could not be fetched (never rejects). */
export async function evolutionOptions(id, level, opts = {}) {
  try { return optionsFrom(await chainOf(id, opts), id, level); }
  catch (e) { return []; }
}

/**
 * After a battle: which of these (levelled-up) ids can evolve now?
 * -> [{id, options:[{id, name, minLevel}]}], in the order given.
 * Skips ids the player does not own. A PREREADER is never asked (integrator
 * ruling, batch 3): his Pokemon stay the ones he knows, and his one
 * evolution story is Bulba's bud, which he taps himself. Never rejects.
 */
export async function evolutionsDue(p, ids, opts = {}) {
  if (!p || p.profile === 'prereader') return [];
  const owned = new Set(Array.isArray(p.caught) ? p.caught : []);
  const pre = p.profile === 'prereader';
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(Number))]
    .filter(id => validId(id) && owned.has(id) && !(pre && BULBA_LINE.includes(id)));
  // All at once (not one after another), so a big win with six level-ups
  // still fits evolveRoute's 4s. Order is kept.
  const found = await Promise.all(list.map(async id => {
    const m = p.mons && p.mons[id];
    const level = m && Number.isFinite(Number(m.level)) ? Number(m.level) : 5;
    return { id, options: await evolutionOptions(id, level, opts) };
  }));
  return found.filter(x => x.options.length);
}

/**
 * THE ROUTE AFTER A BATTLE. Battle calls this instead of ctx.go(returnTo, next):
 *
 *   const [scene, prm] = await evolveRoute(store.player(), levelledIds, returnTo, { result, onEnd });
 *   ctx.go(scene, prm);
 *
 * -> ['evolve', {queue, returnTo, returnParams}] when something can evolve,
 *    else [returnTo, returnParams]. Gives up (plain return) after timeoutMs,
 *    so a slow network never holds a child on the win card.
 */
export async function evolveRoute(p, ids, returnTo, returnParams = {}, { timeoutMs = 4000, ...opts } = {}) {
  const plain = [returnTo, returnParams];
  if (!Array.isArray(ids) || !ids.length) return plain;
  let timer = null;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); });
  try {
    const due = await Promise.race([evolutionsDue(p, ids, opts), timeout]);
    if (!due || !due.length) return plain;
    return ['evolve', { queue: due, returnTo, returnParams }];
  } catch (e) {
    return plain;
  } finally { clearTimeout(timer); }
}

/**
 * THE ONE WRITE. Pure: mutates the given player, caller commits.
 * Moves the Pokemon's growth and identity from oldId to newId:
 *  - caught: newId is ADDED; oldId is never removed (never take something away).
 *  - mons[newId] = the better of mons[newId] and mons[oldId] (level, then xp);
 *    mons[oldId] is left exactly as it was.
 *  - nick moves to newId (unless newId already has one, then both stay).
 *  - shiny: newId joins shinies if oldId was shiny; oldId stays on the shelf.
 *  - favorites and the team slot: newId takes oldId's place in order (if
 *    newId is already there, oldId's entry is dropped rather than doubled).
 * -> {from, to, level} | null when nothing could be done (bad ids, not owned).
 */
export function evolveMonIn(p, oldId, newId) {
  const a = Number(oldId), b = Number(newId);
  if (!p || !validId(a) || !validId(b) || a === b) return null;
  if (!Array.isArray(p.caught) || !p.caught.includes(a)) return null;

  if (!p.caught.includes(b)) p.caught.push(b);

  if (!p.mons || typeof p.mons !== 'object') p.mons = {};
  const from = p.mons[a] && typeof p.mons[a] === 'object' ? p.mons[a] : { level: 5, xp: 0 };
  const lvl = m => Number(m && m.level) || 0;
  const xp = m => Number(m && m.xp) || 0;
  const had = p.mons[b];
  if (!had || lvl(from) > lvl(had) || (lvl(from) === lvl(had) && xp(from) > xp(had))) {
    p.mons[b] = { ...(had || {}), level: lvl(from) || 5, xp: xp(from) };
  }

  if (p.nicks && typeof p.nicks === 'object' && Object.hasOwn(p.nicks, a) && !Object.hasOwn(p.nicks, b)) {
    p.nicks[b] = p.nicks[a];
    delete p.nicks[a];
  }

  if (Array.isArray(p.shinies) && p.shinies.includes(a) && !p.shinies.includes(b)) p.shinies.push(b);

  const takeSlot = key => {
    const arr = p[key];
    if (!Array.isArray(arr)) return;
    const i = arr.indexOf(a);
    if (i < 0) return;
    if (arr.includes(b)) arr.splice(i, 1);
    else arr[i] = b;
  };
  takeSlot('favorites');
  takeSlot('team');

  return { from: a, to: b, level: p.mons[b].level };
}
