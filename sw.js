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

const CACHE_VERSION = 'pokedexos-v19.4.0';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
// DELIBERATELY version-independent. Sprites never change, and at a weekly
// release cadence a versioned asset cache is emptied every single push — which
// is why, in practice, the boys re-downloaded every sprite after every update.
const ASSET_CACHE = 'pokedexos-assets';

const SHELL_FILES = [
  './',
  './index.html',
  './css/main.css', './css/gba.css',
  './js/main.js', './js/config.js', './js/state.js', './js/api.js', './js/engine.js',
  './js/audio.js', './js/dex.js', './js/catch.js', './js/battle.js', './js/fx.js', './js/pc.js',
  './js/music.js', './js/explore.js', './js/progression.js', './js/settings.js', './js/devtools.js', './js/gym.js', './js/gymdata.js', './js/nickname.js', './js/dialog.js', './js/habitatfill.js',
  './data/moves.json',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    // Purge only OLD SHELL caches. The asset cache is intentionally spared.
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k.endsWith('-shell') && k !== SHELL_CACHE)
        .map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  const isShell = url.origin === self.location.origin;
  // pokeapi.co is NOT cached here. api.js already keeps its own slim
  // localStorage projection; caching the full JSON as well doubled the storage
  // for the same data — on the device where a full quota breaks saving.
  const isStaticAsset = ['raw.githubusercontent.com', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname);

  if (isShell) {
    // Network-first with cache fallback, but never wait forever: on a flaky
    // hotel wifi the old version would hang on a white screen instead of
    // opening from cache. 2.5s, then serve what we have.
    event.respondWith((async () => {
      const cached = await caches.match(event.request, { ignoreSearch: true });
      try {
        const resp = await Promise.race([
          fetch(event.request),
          new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 2500))
        ]);
        // Only cache real successes — a 404 or a redirect stored as the app
        // shell bricks the install until someone clears site data.
        if (resp && resp.ok && resp.status === 200 && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(SHELL_CACHE).then(c => c.put(event.request, copy));
        }
        return resp;
      } catch (e) {
        if (cached) return cached;
        return fetch(event.request);   // last resort: let the network error surface
      }
    })());
  } else if (isStaticAsset) {
    // cache-first with network fallback
    event.respondWith(
      caches.match(event.request).then(hit =>
        hit || fetch(event.request).then(resp => {
          // Sprites come from a cross-origin CDN, so responses are OPAQUE:
          // status is 0 and ok is false even on success. The old `resp.ok`
          // check meant not one sprite was ever cached, in the entire life of
          // the app. This is the single biggest bandwidth fix in the release.
          if (resp && (resp.ok || resp.type === 'opaque')) {
            const copy = resp.clone();
            caches.open(ASSET_CACHE).then(c => c.put(event.request, copy));
          }
          return resp;
        })
      )
    );
  }
});
