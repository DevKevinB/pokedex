// ============================================================
// Pokédex OS — PokeAPI client with slim persistent cache
// Full API responses are big (100KB+ each) so we cache a slim
// projection of just the fields the game uses. A species still
// costs ~8-9KB (the moves list is most of it) and is stored twice,
// under its name AND its id — so all 649 uncapped would be many
// megabytes. localStorage is ONE ~5MB box shared with the boys'
// save, so the cache is kept inside a hard budget below.
// ============================================================

import { MAX_POKEMON } from './config.js';

const CACHE_KEY = 'pokedexos_apicache_v2';

// THE BUDGET. A cache miss costs one request; a lost save costs a
// collection. So the cache is never allowed to grow into the save's room:
// it is capped on BOTH rows and bytes, and the oldest rows go first.
// ~320 rows is roughly 160 species (name key + id key each).
export const CACHE_LIMITS = { entries: 320, bytes: 1200000 };
// The 649-name index powers search everywhere and costs a whole request to
// rebuild, so it is never the row we throw away.
const CACHE_PINNED = new Set(['nameindex']);

let cache = {};
try { cache = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { cache = {}; }

/** Drop oldest-first until the cache fits inside BOTH budgets.
    Insertion order IS eviction order: these are all string keys, so the
    object keeps the order they were added, and JSON.parse preserves that
    order across a reload. Returns true if anything was dropped. */
function trimCache() {
  const keys = Object.keys(cache);
  const size = {};
  let bytes = 2;                       // the enclosing {}
  for (const k of keys) {
    let n = k.length + 4;              // "key": and the comma
    try { n += JSON.stringify(cache[k]).length; } catch (e) { /* unmeasurable */ }
    size[k] = n;
    bytes += n;
  }
  let count = keys.length, dropped = false;
  for (const k of keys) {
    if (count <= CACHE_LIMITS.entries && bytes <= CACHE_LIMITS.bytes) break;
    if (CACHE_PINNED.has(k)) continue;
    delete cache[k];
    bytes -= size[k];
    count--;
    dropped = true;
  }
  return dropped;
}

function saveCache() {
  // One stringify on the happy path. Once the cache is warm it sits just under
  // the limit, so most writes do pay the extra measuring pass and a second
  // stringify — measured at ~22ms per fetch at the cap, against ~47ms and
  // climbing for the old uncapped path, so it is still the cheaper half.
  let json = JSON.stringify(cache);
  if (json.length > CACHE_LIMITS.bytes || Object.keys(cache).length > CACHE_LIMITS.entries) {
    trimCache();
    json = JSON.stringify(cache);
  }
  try { localStorage.setItem(CACHE_KEY, json); return; }
  catch (e) { /* storage full anyway — fall through */ }
  // Drop the move entries first: they are the cheapest to refetch.
  try {
    for (const k of Object.keys(cache)) if (k.startsWith('move:')) delete cache[k];
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    return;
  } catch (e2) { /* still full — fall through */ }
  // Last resort. This used to empty the MEMORY copy only, leaving the fat
  // blob sitting on the tablet for ever with nothing left that could shrink
  // it — squeezing the one thing that cannot be refetched. Clear both.
  cache = {};
  try { localStorage.removeItem(CACHE_KEY); } catch (e3) { /* nothing else to try */ }
}

// A blob written by an older, uncapped build is cut down to size at boot.
if (trimCache()) saveCache();

export const apiFetch = async (url, timeoutMs = 8000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    if (!response.ok) throw new Error('API_ERROR');
    return await response.json();
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
};

// ---- Slim projections ----

function slimPokemon(d) {
  return {
    id: d.id, name: d.name,
    height: d.height, weight: d.weight, base_experience: d.base_experience,
    types: d.types, abilities: d.abilities, stats: d.stats,
    cries: { latest: d.cries?.latest || null },
    species_url: d.species?.url || null,
    sprites: {
      front_default: d.sprites?.front_default || null,
      front_shiny: d.sprites?.front_shiny || null,
      back_default: d.sprites?.back_default || null,
      back_shiny: d.sprites?.back_shiny || null,
      official: d.sprites?.other?.['official-artwork']?.front_default || null,
      official_shiny: d.sprites?.other?.['official-artwork']?.front_shiny || null,
      animated: d.sprites?.versions?.['generation-v']?.['black-white']?.animated?.front_default || null,
      animated_shiny: d.sprites?.versions?.['generation-v']?.['black-white']?.animated?.front_shiny || null,
      animated_back: d.sprites?.versions?.['generation-v']?.['black-white']?.animated?.back_default || null,
      animated_back_shiny: d.sprites?.versions?.['generation-v']?.['black-white']?.animated?.back_shiny || null
    },
    // enough move info to pick battle moves without a refetch each time
    moves: (d.moves || []).map(m => ({ name: m.move?.name, url: m.move?.url }))
  };
}

function slimSpecies(d) {
  const en = arr => (arr || []).filter(x => x.language?.name === 'en');
  return {
    capture_rate: d.capture_rate,
    genus: en(d.genera)[0]?.genus || 'Unknown',
    flavor_texts: en(d.flavor_text_entries).slice(0, 6).map(f => f.flavor_text.replace(/[\n\f]/g, ' ')),
    evolution_chain_url: d.evolution_chain?.url || null,
    is_legendary: !!d.is_legendary, is_mythical: !!d.is_mythical
  };
}

function slimMove(d) {
  return { name: d.name, power: d.power, type: d.type?.name || 'normal', damage_class: d.damage_class?.name || 'physical' };
}

function slimEvo(d) {
  // v19.8 THE FAN. This used to follow evolves_to[0] and nothing else, so a
  // chain that BRANCHES kept exactly one branch: Eevee had eight evolutions
  // and the app knew about Vaporeon. Now every branch is walked into one FLAT
  // list of { name, id, min_level, from } — flat because every consumer asks
  // the same question ("what can THIS id become?") and a flat list answers it
  // with a filter instead of a tree walk. `from` is the parent's id, null at
  // the root. Depth-first, so a parent always precedes its children.
  const chain = [];
  const seen = new Set();
  const walk = (node, fromId) => {
    const sUrl = node?.species?.url;
    if (!sUrl) return;
    const id = parseInt(sUrl.split('/').filter(Boolean).pop());
    // A malformed chain that pointed back at itself would spin for ever here,
    // and this runs on the dex screen the boys sit on longest.
    if (!Number.isInteger(id) || seen.has(id)) return;
    seen.add(id);
    chain.push({
      name: node.species.name, id, from: fromId,
      min_level: node.evolution_details?.[0]?.min_level ?? null
    });
    (node.evolves_to || []).forEach(next => walk(next, id));
  };
  walk(d.chain, null);
  return { chain };
}

async function cached(key, url, slim) {
  // A hit moves the row to the back of the queue, in memory only. Eviction is
  // insertion-ordered, so without this the OLDEST rows go first — and the
  // oldest rows are the boys' own team, fetched at boot and re-read at every
  // battle. A long dex browse would evict exactly the six Pokémon they are
  // about to fight with, and a tablet that had gone offline could then no
  // longer load its own team. No extra write: the next real save persists it.
  if (cache[key]) {
    const v = cache[key];
    delete cache[key];
    cache[key] = v;
    return v;
  }
  const data = slim(await apiFetch(url));
  cache[key] = data;
  saveCache();
  return data;
}

// ---- 649-name index: one request, cached forever ----
// nameIndex[id] = 'pikachu'. Powers PC search, parent tools picker,
// gym rosters — anywhere we need a name without a full fetch.
let nameIndexPromise = null;
export function getNameIndex() {
  if (cache['nameindex']) return Promise.resolve(cache['nameindex']);
  if (!nameIndexPromise) {
    nameIndexPromise = apiFetch('https://pokeapi.co/api/v2/pokemon?limit=649')
      .then(d => {
        const idx = [''];
        (d.results || []).forEach(r => idx.push(r.name));
        cache['nameindex'] = idx;
        saveCache();
        return idx;
      })
      .catch(() => { nameIndexPromise = null; return null; });
  }
  return nameIndexPromise;
}

// synchronous best-effort lookup once the index is warm
export function nameOf(id) {
  return cache['nameindex']?.[id] || `#${String(id).padStart(3, '0')}`;
}

export const getPokemon = idOrName =>
  cached(`pkmn:${idOrName}`.toLowerCase(), `https://pokeapi.co/api/v2/pokemon/${idOrName}`, slimPokemon)
    .then(d => { if (!cache[`pkmn:${d.id}`]) { cache[`pkmn:${d.id}`] = d; saveCache(); } return d; });

export const getSpecies = url => cached(`spec:${url}`, url, slimSpecies);

/** The slim record for a species IF it is already cached — never a request.
    audio.js needs a Pokemon's stats and size to synthesise its cry, and a pet
    tap must be instant: a fetch here would make petting a network operation. */
export function cachedPokemon(id) {
  return cache[`pkmn:${id}`.toLowerCase()] || null;
}

// ---- the baked move table (data/moves.json) ----
// Every Gen 1-5 move, committed by `node tools/bake-moves.mjs`. It is DATA in
// git, not a build step — the file is served exactly as authored.
// Before it, building one fighter cost ten /move/ requests, so a cold
// Champion fight was ~66 requests spread over ten mid-battle stalls. Now it
// is one small same-origin file, precached by the service worker, and every
// lookup is SYNCHRONOUS — which is also what makes seeded movesets possible.
const MOVES_URL = new URL('../data/moves.json', import.meta.url).href;
let moveTable = null;
let moveTablePromise = null;
let moveTableTried = 0;

/** Resolves once the table is loaded (or has failed). Cheap to await twice. */
export function movesReady() {
  if (moveTable) return Promise.resolve(moveTable);
  // On failure, retry at most once a minute: without the guard a missing file
  // would mean a fresh 404 on every single send-out.
  if (!moveTablePromise && Date.now() - moveTableTried > 60000) {
    moveTableTried = Date.now();
    moveTablePromise = apiFetch(MOVES_URL, 6000)
      .then(d => { moveTable = (d && typeof d === 'object') ? d : {}; return moveTable; })
      // A miss is survivable: getMove still falls back to the network below.
      .catch(() => { moveTablePromise = null; return null; });
  }
  return moveTablePromise || Promise.resolve(null);
}
// Warm it at boot, so the first fight of the day never waits on it.
movesReady();

/** Move stats for a NAME, synchronously, or null if the table has no entry. */
export function moveStats(name) {
  const key = String(name || '').toLowerCase();
  const e = moveTable && moveTable[key];
  return e ? { name: key, power: typeof e.p === 'number' ? e.p : null, type: e.t || 'normal', damage_class: e.c || 'status' } : null;
}

// Returns the baked entry SYNCHRONOUSLY when we have one; otherwise the old
// network + slim-cache path, unchanged. `await` works on both.
export function getMove(url, name) {
  return moveStats(name || url) || cached(`move:${url}`, url, slimMove);
}

// NOTE the `evo2:` prefix. The v19.7-and-earlier `evo:` entries hold a
// single-branch list with no `from` field; reading one as a fan would quietly
// hide every branch on a device that had already cached the chain.
export const getEvolution = url => cached(`evo2:${url}`, url, slimEvo);

/** The default level for a line the API gates on a STONE or a TRADE.
    There are no stones in this game and there is no trading, and a child must
    never need an item he cannot find — so those lines have always simply
    happened at Lv30, and they still do. */
export const EVO_DEFAULT_LEVEL = 30;

/**
 * Every evolution this species can become RIGHT NOW, at `level`.
 * Returns [] for anything that cannot evolve, is already final, is out of
 * range (#1-649) or is not high enough yet. Never throws for a missing chain;
 * a network failure still rejects and every caller treats that as "not today".
 */
export async function evolutionOptions(id, level) {
  const me = Number(id);
  const data = await getPokemon(me);
  const species = data.species_url ? await getSpecies(data.species_url) : null;
  if (!species?.evolution_chain_url) return [];
  const { chain } = await getEvolution(species.evolution_chain_url);
  return (chain || []).filter(c =>
    c.from === me && c.id <= MAX_POKEMON &&
    Number(level) >= (c.min_level ?? EVO_DEFAULT_LEVEL));
}
