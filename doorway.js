// Sprout Road doorway (v20 switchover).
// The home-screen icon the boys already have opens this address. It forwards
// to the new game at next/, keeping any ?query (e.g. ?fast=1 in tests).
// The small service worker here keeps the doorway itself available offline,
// so the icon still opens with no signal; next/ has its own worker.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
location.replace('next/' + location.search);
