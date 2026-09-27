// ============================================================
// In-world nickname prompt.
//
// window.prompt() is SUPPRESSED in an installed iOS PWA: it returns null
// without throwing, so on the boys' actual iPad the nickname feature silently
// did nothing at all. On desktop it was worse than nothing — a blocking native
// box that froze the capture celebration mid-confetti.
// ============================================================
import { PIXEL_SPRITE } from './config.js';

// The active session's settle function. Battle teardown used to hide the
// modal directly, which left the promise pending and the button listeners
// attached — the NEXT prompt's OK then fired both handler sets, silently
// renaming the previously caught Pokémon as well. Teardown now settles
// through cancelNickname(), and askNickname self-heals any stale session.
let settleActive = null;

export function cancelNickname() {
  if (settleActive) settleActive(null);
}

export function askNickname(id, displayName) {
  return new Promise(resolve => {
    if (settleActive) settleActive(null);
    const modal = document.getElementById('nick-modal');
    const input = document.getElementById('nick-input');
    const ok = document.getElementById('nick-ok');
    const skip = document.getElementById('nick-skip');
    const sprite = document.getElementById('nick-sprite');
    const title = document.getElementById('nick-title');
    if (!modal || !input || !ok || !skip) { resolve(null); return; }

    if (sprite) sprite.src = PIXEL_SPRITE(id);
    if (title) title.innerText = `NAME ${String(displayName || '').toUpperCase()}?`;
    input.value = '';
    modal.style.display = 'flex';
    setTimeout(() => { try { input.focus(); } catch (e) {} }, 60);

    const done = value => {
      settleActive = null;
      modal.style.display = 'none';
      ok.removeEventListener('click', onOk);
      skip.removeEventListener('click', onSkip);
      input.removeEventListener('keydown', onKey);
      resolve(value);
    };
    settleActive = done;
    const onOk = () => done(input.value.trim() || null);
    const onSkip = () => done(null);
    const onKey = e => { if (e.key === 'Enter') onOk(); if (e.key === 'Escape') onSkip(); };

    ok.addEventListener('click', onOk);
    skip.addEventListener('click', onSkip);
    input.addEventListener('keydown', onKey);
  });
}
