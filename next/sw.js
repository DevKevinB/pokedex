// ============================================================
// SPROUT ROAD — service worker, scope ./ (= /next/).
//   Shell (same origin): NETWORK-FIRST with {cache:'no-cache'},
//     cache fallback so the game still opens offline.
//   Sprites + cries (raw.githubusercontent.com): CACHE-FIRST in
//     'sprout-assets', LRU-capped at ~800 entries.
//   pokeapi.co: not touched (core/api.js caches in IndexedDB).
// It only ever creates or deletes caches whose name starts with
// 'sprout-'. The classic app's caches ('pokedexos-*') belong to
// the root sw.js and are never touched from here.
// ============================================================

const NEXT_CACHE = 'sprout-20.2.1';
const ASSET_CACHE = 'sprout-assets';
const ASSET_MAX = 800;
const SHELL_TIMEOUT_MS = 2500;

// Best effort: a missing file is skipped, never fails the install.
const SHELL_FILES = [
  './', './index.html', './style.css', './main.js',
  './core/pace.js', './core/rng.js', './core/save.js', './core/migrate.js',
  './core/validate.js', './core/store.js', './core/api.js',
  './ui/h.js', './ui/sprite.js',
  './audio/audio.js', './audio/music.js',
  './data/engine.js', './data/config.js', './data/gymdata.js', './data/chapters.js', './data/moves.json',
  './battle/createBattle.js',
  './scenes/battle.js', './scenes/who.js', './scenes/garden.js', './scenes/garden-logic.js', './scenes/road.js', './scenes/rest.js',
  './scenes/hatch.js', './scenes/together.js', './scenes/family-table.js', './scenes/versus.js', './scenes/lock.js',
  './scenes/postcard.js', './ui/postcard.js', './data/rival.js',
  './scenes/dex.js', './scenes/dex-logic.js', './scenes/team.js', './scenes/wild.js', './scenes/evolve.js',
  './scenes/challenge.js', './scenes/book.js', './battle/rules-pro.js', './core/evo.js', './data/habitats.js',
  // batch 4
  './data/round2.js', './data/wild-chapters.js', './data/validate-chapter.js', './data/sanctums.js',
  './data/decor.js', './scenes/roots.js',
  '../fonts/press-start-2p-latin.woff2', '../fonts/press-start-2p-latin-ext.woff2',
  './manifest.webmanifest'
];

const cacheableShell = r => !!r && r.ok && r.status === 200 && r.type === 'basic';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(NEXT_CACHE);
    await Promise.allSettled([...new Set(SHELL_FILES)].map(async f => {
      const req = new Request(f, { cache: 'no-cache' });
      const resp = await fetch(req);
      if (cacheableShell(resp)) await cache.put(new Request(f), resp);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k.startsWith('sprout-') && k !== NEXT_CACHE && k !== ASSET_CACHE)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// ---- shell: network-first (no-cache), bounded wait, cache fallback ----
async function shellFetch(event) {
  const req = event.request;
  const cache = await caches.open(NEXT_CACHE);
  // ES modules are never raced against the clock: a slow new store.js plus a
  // fast new main.js must not become "new main.js + OLD store.js" (a missing
  // named export fails the whole module graph: a blank screen). A script
  // falls back to the cache only when the network actually fails (offline).
  const isScript = req.destination === 'script' || /\.m?js$/.test(new URL(req.url).pathname);
  try {
    const net = fetch(req, { cache: 'no-cache' });
    const resp = isScript ? await net : await Promise.race([
      net,
      new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), SHELL_TIMEOUT_MS))
    ]);
    if (cacheableShell(resp)) {
      const copy = resp.clone();
      event.waitUntil(cache.put(req, copy).catch(() => {}));
    }
    return resp;
  } catch (e) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const page = await cache.match('./index.html') || await cache.match('./');
      if (page) return page;
    }
    return fetch(req);    // last resort: let the real network error surface
  }
}

// ---- assets: cache-first with an LRU cap ----
// Cache.keys() is in insertion order, and put() re-inserts, so re-putting a
// hit moves it to the back: the front of the list is least recently used.
let trimming = null;
async function trimAssets() {
  if (trimming) return trimming;
  trimming = (async () => {
    try {
      const cache = await caches.open(ASSET_CACHE);
      const keys = await cache.keys();
      const extra = keys.length - ASSET_MAX;
      if (extra > 0) {
        // Trim a little further than needed so we don't trim on every put.
        const n = Math.min(keys.length, extra + 40);
        for (let i = 0; i < n; i++) await cache.delete(keys[i]);
      }
    } catch (e) { /* noop */ } finally { trimming = null; }
  })();
  return trimming;
}

const touched = new Map();   // url -> last re-put time, so a hot sprite isn't rewritten every frame
async function assetFetch(event) {
  const req = event.request;
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(req);
  if (hit) {
    const now = Date.now();
    if (now - (touched.get(req.url) || 0) > 60000) {
      touched.set(req.url, now);
      if (touched.size > 2000) touched.clear();
      event.waitUntil(cache.put(req, hit.clone()).catch(() => {}));
    }
    return hit;
  }
  const resp = await fetch(req);
  // Only real 200s. Opaque responses (a no-CORS <img>/<audio>) are skipped:
  // browsers pad their quota cost by megabytes each, and 800 of those would
  // crowd out the boys' save.
  if (resp && resp.ok && resp.status === 200 && resp.type !== 'opaque') {
    const copy = resp.clone();
    event.waitUntil(cache.put(req, copy).then(trimAssets).catch(() => {}));
  }
  return resp;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  if (url.origin === self.location.origin) {
    event.respondWith(shellFetch(event));
    return;
  }
  if (url.hostname === 'raw.githubusercontent.com') {
    // <audio> sends Range requests; a cached full 200 answering a Range
    // request breaks media playback on Safari. Let those go straight through.
    if (req.headers.has('range')) return;
    event.respondWith(assetFetch(event));
  }
  // Everything else (pokeapi.co) goes to the network untouched.
});
