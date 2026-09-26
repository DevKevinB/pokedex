// ============================================================
// SPROUT ROAD — pacing
// Every wait longer than 250ms in the game goes through wait(): a tap on the
// screen hurries it (a 7-year-old should never sit through a pause he has
// already read), and ?fast=1 collapses it so the test suite runs quickly.
// ============================================================

export const PACE = { fast: false };

/** Reads ?fast=1 from the URL. Safe to call more than once, and in node. */
export function initPace(search = (globalThis.location && globalThis.location.search) || '') {
  try { PACE.fast = new URLSearchParams(search).get('fast') === '1'; }
  catch (e) { PACE.fast = false; }
  return PACE;
}

/**
 * Resolves after `ms`, or early on any pointerdown anywhere, or at once-ish
 * when PACE.fast is on. Never rejects.
 *
 * opts.signal     an AbortSignal: aborting resolves the wait (scene unmount)
 * opts.skippable  false = a tap does NOT hurry this one (default true)
 *
 * Every listener and timer is removed when it settles, whichever way.
 */
export function wait(ms, { signal = null, skippable = true } = {}) {
  return new Promise(resolve => {
    let done = false;
    let timer = null;
    const doc = globalThis.document;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (doc && skippable) doc.removeEventListener('pointerdown', finish, true);
      if (signal) signal.removeEventListener('abort', finish);
      resolve();
    };
    if (signal && signal.aborted) { finish(); return; }
    const n = Number(ms);
    const delay = PACE.fast ? 0 : (Number.isFinite(n) && n > 0 ? n : 0);
    timer = setTimeout(finish, delay);
    if (doc && skippable) doc.addEventListener('pointerdown', finish, true);
    if (signal) signal.addEventListener('abort', finish);
  });
}
