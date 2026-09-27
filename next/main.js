// ============================================================
// SPROUT ROAD — boot and the scene router.
//
// main.js statically imports only the small, well-tested core. Scenes load
// on demand with import(), so one broken scene file shows the friendly
// OH NO card instead of a black screen for the whole app.
//
// Scene contract: mod.mount(section, { go, store, params }) -> unmount().
// Scenes: who, garden, road, battle, rest, hatch, together, family-table,
// versus, lock, postcard, dex, team, wild, evolve, challenge, book
// (see ARCHITECTURE.md).
// ============================================================

import { initPace, PACE } from './core/pace.js';
import { store } from './core/store.js';
import { unlock } from './audio/audio.js';

initPace();

const app = document.getElementById('app');
const SCENES = {
  who: () => import('./scenes/who.js'),
  garden: () => import('./scenes/garden.js'),
  road: () => import('./scenes/road.js'),
  battle: () => import('./scenes/battle.js'),
  rest: () => import('./scenes/rest.js'),
  // batch 2
  hatch: () => import('./scenes/hatch.js'),
  together: () => import('./scenes/together.js'),
  'family-table': () => import('./scenes/family-table.js'),
  versus: () => import('./scenes/versus.js'),
  lock: () => import('./scenes/lock.js'),
  postcard: () => import('./scenes/postcard.js'),
  // batch 3
  dex: () => import('./scenes/dex.js'),
  team: () => import('./scenes/team.js'),
  wild: () => import('./scenes/wild.js'),
  evolve: () => import('./scenes/evolve.js'),
  challenge: () => import('./scenes/challenge.js'),
  book: () => import('./scenes/book.js'),
};
// Scenes that belong to both boys at once (PLAY TOGETHER): never calm-gated
// on whoever was picked last, and never redirected by profile.
// DAD'S CHALLENGE is a grown-up's screen, whoever was picked last.
const SHARED = new Set(['who', 'together', 'family-table', 'versus', 'lock', 'challenge']);

// ---------------------------------------------------------------- error net
// A child never sees a stack trace. One icon-led card, one big ⟳ button.
// Built with bare DOM calls so it still works if ui/h.js is the broken file.

let oopsShown = false;
function showOops(err) {
  try { console.error('SPROUT ROAD:', err); } catch (e) { /* ignore */ }
  if (oopsShown) return;
  oopsShown = true;
  try {
    const el = (tag, cls, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };
    const card = el('div', 'oops-card');
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-label', 'OH NO');
    const pic = el('div', 'oops-pic', '🌱');
    pic.setAttribute('aria-hidden', 'true');
    const btn = el('button', 'oops-btn', '⟳');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'TRY AGAIN');
    btn.addEventListener('click', () => { try { location.reload(); } catch (e) { /* ignore */ } });
    card.append(pic, el('div', 'oops-title', 'OH NO!'), btn);
    const wrap = el('div', 'oops');
    wrap.append(card);
    document.body.appendChild(wrap);
  } catch (e) { /* nothing else we can do */ }
}

// Rejections that are noise, not breakage: an <audio>.play() the browser
// refused, or a fetch we aborted on purpose.
const BENIGN = /NotAllowedError|AbortError|NotSupportedError|The play\(\) request/;
window.addEventListener('error', ev => {
  // Resource load errors (a sprite 404) bubble here without ev.error; the
  // sprite fallback chain already handles those.
  if (!ev || (!ev.error && !ev.message)) return;
  showOops(ev.error || ev.message);
});
window.addEventListener('unhandledrejection', ev => {
  const r = ev && ev.reason;
  const s = String((r && (r.name + ' ' + r.message)) || r || '');
  if (BENIGN.test(s)) { try { console.warn('SPROUT ROAD (ignored):', s); } catch (e) { /* ignore */ } return; }
  showOops(r);
});

// ---------------------------------------------------------------- save toast
// Icons only (it may be Art's screen): a floppy and a warning sign. The
// grown-up gear on WHO'S PLAYING is where a grown-up can act on it.
let toastEl = null;
function saveToast() {
  if (toastEl) return;
  toastEl = document.createElement('div');
  toastEl.className = 'save-toast';
  toastEl.setAttribute('role', 'status');
  toastEl.setAttribute('aria-label', 'SAVE PROBLEM');
  toastEl.textContent = '💾⚠️';
  document.body.appendChild(toastEl);
  setTimeout(() => { try { toastEl.remove(); } catch (e) { /* ignore */ } toastEl = null; }, 6000);
}

// ---------------------------------------------------------------- router

let current = null;   // { name, unmount, section }
let navToken = 0;

function isPrereader() {
  try { return store.player().profile === 'prereader'; } catch (e) { return false; }
}

// Each boy lands in his own world (who.js routes prereader -> garden,
// reader -> road). The garden is Art's alone; a prereader may still walk
// the Road from his signpost, which then shows pictures only.
function resolveScene(name) {
  if (!SCENES[name]) return 'who';
  if (name === 'garden' && !isPrereader()) return 'road';
  // The egg is the reader's story: a prereader never hatches anything.
  if (name === 'hatch' && isPrereader()) return 'garden';
  return name;
}

function applyCalm(name) {
  document.body.classList.toggle('calm', !SHARED.has(name) && isPrereader());
}

async function go(name, params = {}) {
  const token = ++navToken;
  params = params && typeof params === 'object' ? params : {};
  const target = resolveScene(name);
  let mod;
  try {
    mod = await SCENES[target]();
  } catch (e) { showOops(e); return; }
  if (token !== navToken) return;          // a newer go() won the race

  if (current) {
    const old = current;
    current = null;
    try { if (typeof old.unmount === 'function') old.unmount(); } catch (e) { console.error('unmount failed:', old.name, e); }
  }
  while (app.firstChild) app.removeChild(app.firstChild);

  applyCalm(target);
  const section = document.createElement('section');
  section.className = 'scene scene-enter';
  section.dataset.scene = target;
  app.appendChild(section);
  document.body.dataset.scene = target;

  let unmount = null;
  try {
    unmount = mod.mount(section, { go, store, params });
  } catch (e) { showOops(e); }
  if (token !== navToken) {                // the scene navigated during mount
    return;
  }
  current = { name: target, unmount, section };
}

// Test / debugging hook: which scene is showing.
Object.defineProperty(window, '__scene', { configurable: true, get: () => (current ? current.name : null) });
// The smoke suite (always ?fast=1) may jump straight to a scene.
if (PACE.fast) window.__go = go;

// ---------------------------------------------------------------- boot

function boot() {
  try {
    store.init();
  } catch (e) { showOops(e); return; }

  const info = store.loadInfo();
  if (info.quarantinedKey || info.blocked) saveToast();
  store.on('saveFailed', saveToast);
  // Migrated from the classic save (or merged new classic progress in):
  // write v3 now. save.js copies the raw v2 to its backup key first.
  if (info.source === 'v2' || info.source === 'v1' || info.mergedV2) {
    try { store.commit(); } catch (e) { console.warn('first commit failed', e); }
  }

  // First real touch: wake the audio graph (audio.js also listens itself).
  const first = () => { try { unlock(); } catch (e) { /* ignore */ } };
  document.addEventListener('pointerdown', first, { once: true, capture: true });

  // Ask the browser not to evict the save (a no-op where unsupported).
  try { Promise.resolve(store.requestPersistence()).catch(() => {}); } catch (e) { /* ignore */ }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(err => console.warn('sw:', err));
  }

  // Siblings share one iPad: always start at WHO'S PLAYING.
  go('who');
}

boot();
