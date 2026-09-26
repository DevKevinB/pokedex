// ============================================================
// SPROUT ROAD: the FAMILY POSTCARD scene.
//
// Draws the card (ui/postcard.js), shows it, and offers two big buttons:
//   SHARE  navigator.share({files:[File]}) when navigator.canShare({files})
//          says yes. The File is built BEFORE the tap: Safari drops the
//          user activation if share() comes after an await.
//   SAVE   opens the PNG in a new tab through an object URL, so a grown-up
//          can long-press it to save (iOS standalone has no download
//          attribute). If the tab is blocked, the card opens full-screen
//          here instead; the <img> itself is long-pressable too.
// A finished card counts once per visit: store.addPostcard(date).
// Params: { returnTo, returnParams?, highlight? }  (scene to go back to;
// default 'who'. returnParams keeps only integer chapter/battler/helper).
// For a prereader on screen: icons only, no words.
// ============================================================

import { h, clear } from '../ui/h.js';
import { makePostcard } from '../ui/postcard.js';
import { sfx } from '../audio/audio.js';
import { today } from '../core/validate.js';

const play = name => { try { if (sfx && typeof sfx[name] === 'function') sfx[name](); } catch (e) { /* silent */ } };

/** Share support, decided before any tap. Pure over the navigator it is given. */
export function canShareFile(nav, file) {
  try {
    return !!(nav && file && typeof nav.share === 'function' && typeof nav.canShare === 'function' &&
      nav.canShare({ files: [file] }));
  } catch (e) { return false; }
}

/** 'sprout-road-postcard-2026-09-26.png' */
export function postcardFileName(date) {
  const d = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today();
  return `sprout-road-postcard-${d}.png`;
}

export function mount(root, ctx) {
  const params = ctx.params || {};
  const returnTo = typeof params.returnTo === 'string' && params.returnTo ? params.returnTo : 'who';
  // Params for the way back (the rest scene's chapter, the together seats).
  const RETURN_KEYS = ['chapter', 'battler', 'helper'];
  const returnParams = {};
  const rp = params.returnParams && typeof params.returnParams === 'object' ? params.returnParams : {};
  for (const k of RETURN_KEYS) if (Number.isInteger(rp[k])) returnParams[k] = rp[k];
  let pre = false;
  try { pre = ctx.store.player().profile === 'prereader'; } catch (e) { pre = false; }
  const save = ctx.store.save;
  const date = today();

  let alive = true;
  let url = null;          // object URL of the finished PNG (revoked on unmount)
  let file = null;         // File built once, before any tap
  let counted = false;
  const label = (icon, word) => (pre ? icon : icon + ' ' + word);

  const img = h('img', {
    class: 'pc-img', alt: 'FAMILY POSTCARD',
    attrs: { draggable: 'false' }, hidden: true,
  });
  const loading = h('div', { class: 'pc-loading', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'pc-ball' }));
  const retry = h('button', {
    class: 'pc-btn pc-retry', type: 'button', hidden: true,
    attrs: { 'aria-label': 'TRY AGAIN' },
    on: { click: () => { play('tap'); build(); } },
  }, '⟳');
  const frame = h('div', { class: 'pc-frame' }, loading, img, retry);

  const shareBtn = h('button', {
    class: 'pc-btn pc-share', type: 'button', hidden: true, disabled: true,
    attrs: { 'aria-label': 'SHARE' },
    on: { click: onShare },
  }, label('\u{1F4E4}', 'SHARE'));
  const saveBtn = h('button', {
    class: 'pc-btn pc-save', type: 'button', disabled: true,
    attrs: { 'aria-label': 'SAVE' },
    on: { click: onSave },
  }, label('\u{1F4BE}', 'SAVE'));
  const back = h('button', {
    class: 'pc-back', type: 'button', attrs: { 'aria-label': 'BACK' },
    on: { click: () => { play('tap'); ctx.go(returnTo, returnParams); } },
  }, '◀︎');

  const zoomImg = h('img', { class: 'pc-zoom-img', alt: 'FAMILY POSTCARD', attrs: { draggable: 'false' } });
  const zoom = h('div', {
    class: 'pc-zoom', hidden: true, attrs: { role: 'dialog', 'aria-label': 'FAMILY POSTCARD' },
    on: { click: ev => { if (ev.target === zoom || ev.target === zoomClose) zoom.hidden = true; } },
  }, zoomImg);
  const zoomClose = h('button', { class: 'pc-zoom-close', type: 'button', attrs: { 'aria-label': 'CLOSE' } }, '✕');
  zoom.appendChild(zoomClose);

  const scene = h('div', { class: ['pc', pre && 'pc-pre'], dataset: { scene: 'postcard' } },
    h('div', { class: 'pc-top' }, back, pre ? null : h('div', { class: 'pc-title' }, 'FAMILY POSTCARD')),
    frame,
    h('div', { class: 'pc-actions' }, shareBtn, saveBtn),
    zoom);
  root.appendChild(scene);

  function onShare() {
    if (!file) return;
    play('tap');
    // No await before share(): the tap's user activation must still be live.
    let p;
    try { p = navigator.share({ files: [file] }); } catch (e) { p = Promise.reject(e); }
    Promise.resolve(p).catch(err => {
      if (err && err.name === 'AbortError') return;    // the grown-up changed his mind
      try { console.warn('postcard share failed:', err); } catch (e) { /* ignore */ }
    });
  }

  function onSave() {
    if (!url) return;
    play('tap');
    let w = null;
    try { w = window.open(url, '_blank'); } catch (e) { w = null; }
    if (!w) {                        // blocked: show it big here to long-press
      zoomImg.src = url;
      zoom.hidden = false;
    }
  }

  async function build() {
    retry.hidden = true;
    loading.hidden = false;
    try {
      const fam = save && save.family ? save.family : {};
      const blob = await makePostcard({
        players: save.players,
        date,
        highlight: params.highlight,
        number: (Number(fam.postcards) || 0) + (counted ? 0 : 1),
      });
      if (!alive) return;
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      try { file = new File([blob], postcardFileName(date), { type: 'image/png' }); } catch (e) { file = null; }
      img.src = url;
      img.hidden = false;
      loading.hidden = true;
      saveBtn.disabled = false;
      const can = canShareFile(globalThis.navigator, file);
      shareBtn.hidden = !can;
      shareBtn.disabled = !can;
      scene.classList.toggle('pc-noshare', !can);
      if (!counted) {
        counted = true;
        try { ctx.store.addPostcard(date); } catch (e) { console.warn('postcard count failed', e); }
      }
      play('bloom');
    } catch (e) {
      if (!alive) return;
      try { console.warn('postcard failed:', e); } catch (e2) { /* ignore */ }
      loading.hidden = true;
      retry.hidden = false;
    }
  }
  build();

  return function unmount() {
    alive = false;
    if (url) { try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } url = null; }
    file = null;
    clear(scene);
    scene.remove();
  };
}
