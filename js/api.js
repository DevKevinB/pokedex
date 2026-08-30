// ============================================================
// Pokédex OS — PokeAPI client with slim persistent cache
// Full API responses are big (100KB+ each) so we cache a slim
// projection of just the fields the game uses (~2-3KB each).
// 151 Pokémon ≈ 450KB — comfortably inside localStorage limits.
// ============================================================

const CACHE_KEY = 'pokedexos_apicache_v2';
let cache = {};
try { cache = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { cache = {}; }

function saveCache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); }
  catch (e) {
    // Storage full — drop move entries first, then everything.
    try {
      for (const k of Object.keys(cache)) if (k.startsWith('move:')) delete cache[k];
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (e2) { cache = {}; }
  }
}

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
  // flatten first path of the chain into [{name,id,min_level}...]
  const chain = [];
  let curr = d.chain;
  while (curr) {
    const sUrl = curr.species?.url;
    if (!sUrl) break;
    chain.push({
      name: curr.species.name,
      id: parseInt(sUrl.split('/').filter(Boolean).pop()),
      min_level: curr.evolution_details?.[0]?.min_level ?? null
    });
    curr = curr.evolves_to?.[0];
  }
  return { chain };
}

async function cached(key, url, slim) {
  if (cache[key]) return cache[key];
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

export const getEvolution = url => cached(`evo:${url}`, url, slimEvo);
