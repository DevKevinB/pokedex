// ============================================================
// SPROUT ROAD — seeded randomness
// Randomness is injected everywhere (battle, garden, road) so a run can be
// replayed exactly: ?seed=N in the URL makes the whole session repeatable,
// which is what the headless playtest and ?fast=1&seed=1 smoke runs rely on.
// ============================================================

/**
 * mulberry32: small, fast, and well-distributed for game use. Always returns
 * a number in [0, 1) — never 1, unlike a raw LCG divided by its modulus.
 * Any seed is accepted: numbers are truncated, strings are hashed.
 */
export function seededRng(seed) {
  let a = typeof seed === 'string' ? hashSeed(seed) : (Math.floor(Math.abs(Number(seed))) || 0) >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over a string -> unsigned 32-bit seed ("MOSSY-714" style run codes). */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  const s = String(str == null ? '' : str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The seed from ?seed=N, or null when the URL carries none. */
export function seedFromUrl(search = (globalThis.location && globalThis.location.search) || '') {
  try {
    const raw = new URLSearchParams(search).get('seed');
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.floor(Math.abs(n)) : hashSeed(raw);
  } catch (e) { return null; }
}

/** ?seed=N -> a seeded generator, otherwise Math.random. */
export function rngFromUrl(search) {
  const seed = seedFromUrl(search);
  return seed == null ? Math.random : seededRng(seed);
}
