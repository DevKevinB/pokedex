// ============================================================
// Pokédex OS — in-world dialogs and the 4-digit PIN pad.
//
// window.alert / confirm / prompt are SUPPRESSED in an installed iOS PWA:
// they return null/undefined without throwing, so on the boys' actual iPad
// any flow that ran through them silently dead-ended. Everything here renders
// on the existing overlay system instead, icon-led for the pre-reader.
// ============================================================
import { PIXEL_SPRITE } from './config.js';

// Dialogs queue: if two fire at once, the second waits its turn instead of
// clobbering the first one's buttons.
let queue = Promise.resolve();

// dialog({ icon, sprite, title, text, input, value, placeholder, ok, cancel, danger })
//   without input:  resolves true (OK) / false (CANCEL; always true if no cancel)
//   with input:     resolves the typed string (OK) / null (CANCEL)
export function dialog(opts) {
  const run = () => showDialog(opts);
  const p = queue.then(run, run);
  queue = p.then(() => {}, () => {});
  return p;
}

function showDialog({ icon, sprite, title = '', text = '', input = false, value = '', placeholder = '', ok = 'OK', cancel = null, danger = false }) {
  return new Promise(resolve => {
    const modal = document.getElementById('dlg-modal');
    const iconEl = document.getElementById('dlg-icon');
    const spriteEl = document.getElementById('dlg-sprite');
    const titleEl = document.getElementById('dlg-title');
    const textEl = document.getElementById('dlg-text');
    const inputEl = document.getElementById('dlg-input');
    const okBtn = document.getElementById('dlg-ok');
    const cancelBtn = document.getElementById('dlg-cancel');
    if (!modal || !okBtn) { resolve(input ? null : true); return; }

    iconEl.style.display = icon ? 'block' : 'none';
    iconEl.innerText = icon || '';
    spriteEl.style.display = sprite ? 'inline-block' : 'none';
    if (sprite) spriteEl.src = PIXEL_SPRITE(sprite);
    titleEl.innerText = title;
    textEl.style.display = text ? 'block' : 'none';
    textEl.innerText = text;
    inputEl.style.display = input ? 'block' : 'none';
    inputEl.value = value;
    inputEl.placeholder = placeholder;
    okBtn.innerText = ok;
    okBtn.classList.toggle('btn-danger', !!danger);
    okBtn.classList.toggle('btn-reg', !danger);
    cancelBtn.style.display = cancel ? 'block' : 'none';
    cancelBtn.innerText = cancel || 'CANCEL';
    modal.style.display = 'flex';
    if (input) setTimeout(() => { try { inputEl.focus(); inputEl.select(); } catch (e) {} }, 60);

    const done = val => {
      modal.style.display = 'none';
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      inputEl.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const onOk = () => done(input ? inputEl.value.trim() : true);
    const onCancel = () => done(input ? null : false);
    const onKey = e => { if (e.key === 'Enter') onOk(); if (e.key === 'Escape' && cancel) onCancel(); };

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    inputEl.addEventListener('keydown', onKey);
  });
}

// pinPad({ title, sub, verify }) — the in-app keypad. Resolves the 4-digit
// string (once `verify`, if given, accepts it) or null on ✖. A rejected entry
// shakes the dots and clears; the pad stays open for another try.
export function pinPad({ title = '🔒 GROWN-UPS ONLY', sub = 'ENTER PIN', verify = null } = {}) {
  return new Promise(resolve => {
    const modal = document.getElementById('pin-modal');
    const keys = document.getElementById('pin-keys');
    const dotsBox = document.getElementById('pin-dots');
    if (!modal || !keys || !dotsBox) { resolve(null); return; }
    const dots = dotsBox.querySelectorAll('span');

    document.getElementById('pin-title').innerText = title;
    document.getElementById('pin-sub').innerText = sub;
    let entry = '';
    const paint = () => dots.forEach((d, i) => d.classList.toggle('filled', i < entry.length));
    paint();
    modal.style.display = 'flex';

    const done = val => {
      modal.style.display = 'none';
      keys.removeEventListener('click', onKey);
      resolve(val);
    };
    const reject = () => {
      entry = '';
      dotsBox.classList.add('pin-wrong');
      setTimeout(() => { dotsBox.classList.remove('pin-wrong'); paint(); }, 450);
    };
    const onKey = e => {
      const k = e.target.closest('button')?.dataset.k;
      if (!k) return;
      if (k === 'cancel') { done(null); return; }
      if (k === 'back') { entry = entry.slice(0, -1); paint(); return; }
      if (entry.length >= 4) return;
      entry += k;
      paint();
      if (entry.length === 4) {
        const v = entry;
        setTimeout(() => {
          if (verify && !verify(v)) reject();
          else done(v);
        }, 180);
      }
    };
    keys.addEventListener('click', onKey);
  });
}
