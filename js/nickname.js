// ============================================================
// In-world nickname prompt.
//
// window.prompt() is SUPPRESSED in an installed iOS PWA: it returns null
// without throwing, so on the boys' actual iPad the nickname feature silently
// did nothing at all. On desktop it was worse than nothing — a blocking native
// box that froze the capture celebration mid-confetti.
// ============================================================
import { PIXEL_SPRITE } from './config.js';

export function askNickname(id, displayName) {
  return new Promise(resolve => {
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
      modal.style.display = 'none';
      ok.removeEventListener('click', onOk);
      skip.removeEventListener('click', onSkip);
      input.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onOk = () => done(input.value.trim() || null);
    const onSkip = () => done(null);
    const onKey = e => { if (e.key === 'Enter') onOk(); if (e.key === 'Escape') onSkip(); };

    ok.addEventListener('click', onOk);
    skip.addEventListener('click', onSkip);
    input.addEventListener('keydown', onKey);
  });
}
