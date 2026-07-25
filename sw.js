// ============================================================
// Pokédex OS — service worker
// Strategy:
//   App shell (html/css/js): NETWORK-FIRST, cache fallback.
//     → new pushes reach installed iOS PWAs on next launch,
//       while the game still opens offline.
//   Sprites & PokeAPI: CACHE-FIRST, network fallback.
//     → static content, cache forever, saves bandwidth.
// Bump CACHE_VERSION on every release to purge old shells.
// ============================================================

const CACHE_VERSION = 'pokedexos-v17.1.0';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

const SHELL_FILES = [
  './',
  './index.html',
  './css/main.css', './css/gba.css',
  './js/main.js', './js/config.js', './js/state.js', './js/api.js',
  './js/audio.js', './js/dex.js', './js/catch.js', './js/battle.js', './js/pc.js',
  './js/music.js', './js/explore.js', './js/progression.js', './js/settings.js', './js/devtools.js',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  const isShell = url.origin === self.location.origin;
  const isStaticAsset = ['raw.githubusercontent.com', 'pokeapi.co', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname);

  if (isShell) {
    // network-first with cache fallback
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          const copy = resp.clone();
          caches.open(SHELL_CACHE).then(c => c.put(event.request, copy));
          return resp;
        })
        .catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
  } else if (isStaticAsset) {
    // cache-first with network fallback
    event.respondWith(
      caches.match(event.request).then(hit =>
        hit || fetch(event.request).then(resp => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(ASSET_CACHE).then(c => c.put(event.request, copy));
          }
          return resp;
        })
      )
    );
  }
});
