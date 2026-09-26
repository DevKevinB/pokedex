// ============================================================
// SPROUT ROAD — sprites. Same PokeAPI sprite repo as the classic
// app (Kevin's ruling: the art stays as it is). Loaded in CORS
// mode so a canvas (Road, Postcard) can draw them untainted and
// the service worker can cache real, non-opaque responses. If a CORS
// load fails, the same URL is retried once without CORS before falling back.
// ============================================================

import { h } from './h.js';

export const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites';

export const ITEM = name => `${SPRITE_BASE}/items/${name}.png`;

// Gen 5 (Black/White) animated sprites stop at 649.
const ANIMATED_MAX = 649;

// A Pokeball, inline, so the fallback itself can never fail to load.
export const FALLBACK_SPRITE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<circle cx="32" cy="32" r="28" fill="#f8f8e8" stroke="#24243a" stroke-width="4"/>' +
  '<path d="M4 32a28 28 0 0 1 56 0z" fill="#e84040" stroke="#24243a" stroke-width="4"/>' +
  '<line x1="4" y1="32" x2="60" y2="32" stroke="#24243a" stroke-width="5"/>' +
  '<circle cx="32" cy="32" r="9" fill="#f8f8e8" stroke="#24243a" stroke-width="5"/>' +
  '</svg>');

function cleanId(id) {
  const n = Math.trunc(Number(id));
  return Number.isFinite(n) && n >= 1 && n <= 20000 ? n : 0;
}

/** URL for a species sprite. animated -> gen5 black-white animated gif (ids <= 649;
 *  higher ids quietly get the static png). An invalid id gets the pokeball. */
export function spriteUrl(id, { shiny = false, back = false, animated = false } = {}) {
  const n = cleanId(id);
  if (!n) return FALLBACK_SPRITE;
  const path = `${back ? 'back/' : ''}${shiny ? 'shiny/' : ''}${n}`;
  if (animated && n <= ANIMATED_MAX) {
    return `${SPRITE_BASE}/pokemon/versions/generation-v/black-white/animated/${path}.gif`;
  }
  return `${SPRITE_BASE}/pokemon/${path}.png`;
}

/** <img class="sprite" alt="" draggable=false>. On error an animated sprite
 *  first falls back to the static png, then to the inline pokeball.
 *  Extra opts: class (string|array), alt, lazy (bool), cors (default true). */
export function spriteImg(id, opts = {}) {
  const { shiny = false, back = false, animated = false } = opts;
  const img = h('img', {
    class: ['sprite', opts.class],
    attrs: { alt: opts.alt || '', draggable: 'false', decoding: 'async' },
    dataset: { id: cleanId(id) || '' }
  });
  img.draggable = false;
  if (opts.cors !== false) img.crossOrigin = 'anonymous';
  if (opts.lazy) img.loading = 'lazy';
  const chain = [spriteUrl(id, { shiny, back, animated })];
  if (animated) chain.push(spriteUrl(id, { shiny, back }));
  if (shiny) chain.push(spriteUrl(id, { back }));   // a missing shiny still shows the Pokemon
  chain.push(FALLBACK_SPRITE);
  const urls = [...new Set(chain)];
  let i = 0;
  img.addEventListener('error', () => {
    // A CORS load can fail where a plain one works: on a first visit the
    // classic app's root service worker may answer with an OPAQUE response it
    // cached, which the browser refuses for a crossorigin <img>. Try the same
    // picture once without CORS before giving up on it.
    if (img.crossOrigin !== null && img.crossOrigin !== undefined && !String(urls[i]).startsWith('data:')) {
      img.removeAttribute('crossorigin');
      img.src = urls[i];
      return;
    }
    i++;
    if (i < urls.length) {
      if (urls[i] === FALLBACK_SPRITE) img.classList.add('sprite-fallback');
      img.src = urls[i];
    }
  });
  if (urls[0] === FALLBACK_SPRITE) img.classList.add('sprite-fallback');
  img.src = urls[0];
  return img;
}
