// ============================================================
// Pokédex OS — PokeAPI client with slim persistent cache
// Full API responses are big (100KB+ each) so we cache a slim
// projection of just the fields the game uses (~2-3KB each).
// 151 Pokémon ≈ 450KB — comfortably inside localStorage limits.
// ============================================================

const CACHE_KEY = 'pokedexos_apicache_v1';
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
  // flatten first path of the chain into [{name,id}...]
  const chain = [];
  let curr = d.chain;
  while (curr) {
    const sUrl = curr.species?.url;
    if (!sUrl) break;
    chain.push({ name: curr.species.name, id: parseInt(sUrl.split('/').filter(Boolean).pop()) });
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

export const getPokemon = idOrName =>
  cached(`pkmn:${idOrName}`.toLowerCase(), `https://pokeapi.co/api/v2/pokemon/${idOrName}`, slimPokemon)
    .then(d => { if (!cache[`pkmn:${d.id}`]) { cache[`pkmn:${d.id}`] = d; saveCache(); } return d; });

export const getSpecies = url => cached(`spec:${url}`, url, slimSpecies);
export const getMove = url => cached(`move:${url}`, url, slimMove);
export const getEvolution = url => cached(`evo:${url}`, url, slimEvo);
