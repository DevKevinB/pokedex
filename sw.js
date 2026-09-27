// ============================================================
// Sprout Road: the DOORWAY service worker (scope: the site root)
//
// Until v19.15 this file was the classic app's worker. The classic app now
// lives in classic/ with its own worker, and Sprout Road in next/ with its
// own. A more specific scope always wins, so those two handle their own pages.
// This one answers ONLY the few doorway files below, network-first, so an
// installed home-screen icon still opens offline. Everything else passes
// straight through untouched.
// ============================================================

const DOOR_CACHE = 'doorway-v1';
const FILES = ['', 'index.html', 'doorway.js', 'doorway.css', 'manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(DOOR_CACHE)
      .then(c => c.addAll(FILES.map(f => './' + f)))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scope)) return;
  const rel = url.pathname.slice(scope.length);
  if (!FILES.includes(rel)) return;          // next/, classic/, fonts/ ...: not ours
  event.respondWith((async () => {
    try {
      const resp = await fetch(req, { cache: 'no-cache' });
      if (resp.ok && resp.type === 'basic') {
        const copy = resp.clone();
        caches.open(DOOR_CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return resp;
    } catch (e) {
      const hit = await caches.match(req, { ignoreSearch: true }) ||
        await caches.match('./index.html', { ignoreSearch: true });
      return hit || Response.error();
    }
  })());
});
