// SPROUT ROAD: ART'S STICKER BOOK.
// A picture-only book for a four-year-old. Big pages he swipes (or turns with
// the big arrows): Bulba's own cover page, then one habitat-coloured scene per
// place, where every Pokemon he has caught sits as a sticker, and last the
// family's postcards as little stamps. Tap a sticker: it bounces and cries.
// Hold a sticker: its name (the only word the book ever shows).
//
// Nothing here is a gap. A page only exists when it has stickers on it, and an
// uncaught Pokemon is never drawn at all: no silhouettes, no empty slots, no
// "3 of 649". The book is read-only: it never writes the save.
//
// Pure helpers (homeOf, stickerIds, bookPages, stickerTilt, stampModel,
// returnTarget) are exported for node --test.

import { h, clear } from '../ui/h.js';
import { spriteImg, ITEM } from '../ui/sprite.js';
import * as audio from '../audio/audio.js';
import * as music from '../audio/music.js';
import { getMon } from '../core/api.js';

export const MAX_ID = 649;
export const PER_PAGE = 12;          // stickers on one habitat page (4 x 3)
export const MAX_STAMPS = 24;        // stamps drawn on the postcard page; the number carries the rest
export const MAX_COVER_VISITORS = 8; // garden visitors peeking round Bulba on the cover
const LONG_PRESS_MS = 550;           // input detection, not a pacing wait
const SWIPE_PX = 48;
const NAME_SHOW_MS = 2400;

// Every species' home, one letter per dex id 1..649, generated from the
// classic EXPLORE pools (js/explore.js HABITATS + js/habitatfill.js BACKFILL,
// the first habitat in map order that lists the species; FARAWAY LAND only
// for what no other place holds; the 19 ids no pool lists live in the meadow).
// f forest, m meadow, o ocean, v volcano, p power plant, c cave, t tower,
// d dragon's den, r faraway land.
const HOME =
  'fffvvvooofffffffffffmmfffpccmmmmmmttvvmmccfffffftccmmmmmmvvoootttcccfffoocccvvoop' +
  'pmffooffootttcttooppffccccmffccmfmooooootftpvfmooocmopvmcococmopvdddcmffrvvvooofm' +
  'fffffffoopmmmfttpppfoomofffmmffoorrtotttmfpmcrmmofcfommvvmmooooopvvoccmmmmcopvmmp' +
  'vocccovffffvvvooomtmmfffffooofttffoomtroffcmmmcftccmccmcmmmpmprttppppffmffoooovvv' +
  'mtmcddftddmfttmooottccccoommttttftttmroooooooodddpprrrrrrovdrrffcvvvooomffmoffppp' +
  'ffccppfffffpooffoomttmmttmmtttppctmftdddmcrccftccfooomoopmcrpvfffocrmtctoprrrdrrc' +
  'drrrtrrrffrvvvooofmmmmttffvvoomtfffppcccttccmcccoooccffffffffmrotttvvfcctttttoocc' +
  'ffttmmtttmttoommrffpfpffooopppppppppptttttdddoooffpccdttppmffttvpdddvvrrrrrdprrrr' +
  'r';

// Map order (the classic EXPLORE map), each with its scene: sky, ground and a
// few emoji props. Colour carries the place; nothing is written.
export const HABITATS = [
  { key: 'forest',     code: 'f', sky: '#b8e6a8', ground: '#4f9a3c', props: ['\u{1F332}', '\u{1F333}', '\u{1F344}'] },
  { key: 'meadow',     code: 'm', sky: '#bfe6ff', ground: '#9bd45a', props: ['\u{1F33C}', '\u{1F33E}', '\u{1F33B}'] },
  { key: 'ocean',      code: 'o', sky: '#a8dcff', ground: '#3d8fd0', props: ['\u{1F30A}', '\u{1F41A}', '\u{2600}\u{FE0F}'] },
  { key: 'volcano',    code: 'v', sky: '#ffc48a', ground: '#b8502a', props: ['\u{1F30B}', '\u{1F525}', '\u{1FAA8}'] },
  { key: 'powerplant', code: 'p', sky: '#fff2a0', ground: '#a8a8b8', props: ['\u{26A1}', '\u{1F50B}', '\u{1F4A1}'] },
  { key: 'cave',       code: 'c', sky: '#8a7a68', ground: '#6a5238', props: ['\u{1FAA8}', '\u{1F48E}', '\u{1F987}'] },
  { key: 'tower',      code: 't', sky: '#5a4a8a', ground: '#3e3266', props: ['\u{1F319}', '\u{2B50}', '\u{1F56F}\u{FE0F}'] },
  { key: 'dragon',     code: 'd', sky: '#9ad8d0', ground: '#3a7a6a', props: ['\u{26F0}\u{FE0F}', '\u{2601}\u{FE0F}', '\u{1F48E}'] },
  { key: 'faraway',    code: 'r', sky: '#ffd6f0', ground: '#9a7ad8', props: ['\u{1F308}', '\u{2728}', '\u{2601}\u{FE0F}'] },
];
const BY_CODE = Object.fromEntries(HABITATS.map(x => [x.code, x]));
const BY_KEY = Object.fromEntries(HABITATS.map(x => [x.key, x]));
export const habitatInfo = key => BY_KEY[key] || BY_KEY.meadow;

// where the loose petals drift on the cover (% of the page), hand-scattered
const FLOAT_SPOTS = [[10, 20], [78, 24], [30, 15], [62, 17], [18, 34], [88, 40], [44, 24], [6, 52], [70, 30], [24, 60], [92, 58], [52, 12]];

/** Grid shape for a page with n stickers, so a small page is not half empty. */
export function gridClass(n) { return n <= 1 ? 'n1' : n <= 2 ? 'n2' : n <= 4 ? 'n4' : n <= 6 ? 'n6' : n <= 9 ? 'n9' : 'n12'; }

const E = { stamp: '\u{1F4EE}', leaf: '\u{1F343}', spark: '\u{2728}', petal: '\u{1F338}' };

// ---------------------------------------------------------------- pure

const cleanId = v => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= MAX_ID ? n : 0;
};

/** The habitat key a species lives in ('meadow' for anything unknown). */
export function homeOf(id) {
  const n = cleanId(id);
  if (!n) return 'meadow';
  return (BY_CODE[HOME[n - 1]] || BY_KEY.meadow).key;
}

/** Caught ids as stickers: valid dex ids only, each once, in catch order. */
export function stickerIds(player) {
  const out = [], seen = new Set();
  const list = player && Array.isArray(player.caught) ? player.caught : [];
  for (const v of list) {
    const n = cleanId(v);
    if (n && !seen.has(n)) { seen.add(n); out.push(n); }
  }
  return out;
}

/** Postcard page model: how many stamps to draw, and the true count. */
export function stampModel(count, max = MAX_STAMPS) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return { count: n, stamps: Math.min(n, max) };
}

/**
 * The book's pages, in order:
 *   { kind:'cover' }                                   always first
 *   { kind:'habitat', habitat, ids:[..<=perPage], part }   only places with stickers
 *   { kind:'post', count, stamps }                     last, only when a postcard exists
 * An empty place never gets a page, so nothing ever looks missing.
 */
export function bookPages(player, family, { perPage = PER_PAGE } = {}) {
  const per = Math.max(1, Math.floor(Number(perPage) || PER_PAGE));
  const pages = [{ kind: 'cover' }];
  const byHome = new Map(HABITATS.map(x => [x.key, []]));
  for (const id of stickerIds(player)) byHome.get(homeOf(id)).push(id);
  for (const hab of HABITATS) {
    const ids = byHome.get(hab.key);
    for (let i = 0, part = 0; i < ids.length; i += per, part++) {
      pages.push({ kind: 'habitat', habitat: hab.key, ids: ids.slice(i, i + per), part });
    }
  }
  const post = stampModel(family && family.postcards);
  if (post.count > 0) pages.push({ kind: 'post', count: post.count, stamps: post.stamps });
  return pages;
}

/** A sticker's slight hand-placed wonk, stable per species (degrees / % of its cell). */
export function stickerTilt(id) {
  let s = (cleanId(id) || 1) * 2654435761 >>> 0;
  const r = () => { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return (s % 1000) / 1000; };
  return { rot: Math.round((r() - 0.5) * 16), dx: Math.round((r() - 0.5) * 16), dy: Math.round((r() - 0.5) * 14) };
}

/** Where BACK goes. Only known scenes; anything else goes to the garden. */
export function returnTarget(params) {
  const t = params && typeof params === 'object' ? params.returnTo : null;
  return ['garden', 'road', 'who', 'together'].includes(t) ? t : 'garden';
}

// ---------------------------------------------------------------- scene

function play(name) { try { const f = audio.sfx && audio.sfx[name]; if (typeof f === 'function') f(); } catch (e) { /* audio never breaks the book */ } }
function playCry(id) { try { audio.cry(id); } catch (e) { /* noop */ } }
const heard = () => { try { return typeof audio.audioUnlocked !== 'function' || audio.audioUnlocked(); } catch (e) { return true; } };

export function mount(root, ctx) {
  const { store } = ctx;
  const params = (ctx && ctx.params) || {};
  const p = store.player() || {};
  const family = (store.save && store.save.family) || {};
  const bulba = p.bulba && typeof p.bulba === 'object' ? p.bulba : {};
  const stage = [1, 2, 3].includes(bulba.stage) ? bulba.stage : 1;
  const petals = Math.max(0, Math.floor(Number(bulba.petals) || 0));
  const shinies = new Set((Array.isArray(p.shinies) ? p.shinies : []).map(Number));
  const nicks = p.nicks && typeof p.nicks === 'object' ? p.nicks : {};
  const pages = bookPages(p, family);

  let alive = true;
  let idx = 0;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms); timers.add(t); return t; };
  const cancel = t => { if (t) { clearTimeout(t); timers.delete(t); } };
  const offs = [];
  const listen = (el, evt, fn, opts) => { el.addEventListener(evt, fn, opts); offs.push(() => el.removeEventListener(evt, fn, opts)); };

  // ---- music: the garden's gentle tune carries on, after a first tap ----
  let musicOn = false;
  function startMusic() {
    if (musicOn || !alive || !heard()) return;
    musicOn = true;
    try { music.playMusic('garden'); } catch (e) { /* music is a bonus */ }
  }
  function firstTouch() { try { audio.unlock(); } catch (e) { /* noop */ } startMusic(); }

  // ---- chrome: back (Bulba's face), arrows, page dots --------------------
  const backImg = spriteImg(stage, { class: 'bk-back-img' });
  const backBtn = h('button', {
    class: 'bk-btn bk-back', attrs: { type: 'button', 'aria-label': 'back' },
    on: { click: () => { play('tap'); ctx.go(returnTarget(params), {}); } },
  }, backImg);
  const prevBtn = h('button', { class: 'bk-btn bk-arrow bk-prev', attrs: { type: 'button', 'aria-label': 'previous page' },
    on: { click: () => turn(-1) } }, h('span', { class: 'bk-arrow-glyph', attrs: { 'aria-hidden': 'true' } }, '◀'));
  const nextBtn = h('button', { class: 'bk-btn bk-arrow bk-next', attrs: { type: 'button', 'aria-label': 'next page' },
    on: { click: () => turn(1) } }, h('span', { class: 'bk-arrow-glyph', attrs: { 'aria-hidden': 'true' } }, '▶'));
  const dots = pages.map(pg => h('span', { class: 'bk-dot bk-dot-' + (pg.kind === 'habitat' ? pg.habitat : pg.kind) }));
  const dotRow = h('div', { class: 'bk-dots', attrs: { 'aria-hidden': 'true' } }, dots);

  // ---- pages: built lazily when they come within one page of view -------
  const pageEls = pages.map((pg, i) => h('div', {
    class: 'bk-page bk-page-' + (pg.kind === 'habitat' ? pg.habitat : pg.kind),
    dataset: { page: String(i), kind: pg.kind },
    attrs: { 'aria-hidden': 'true' },
  }));
  const built = new Set();
  const track = h('div', { class: 'bk-track' }, pageEls);
  const viewport = h('div', { class: 'bk-view' }, track);
  const book = h('div', { class: 'bk' },
    viewport,
    h('div', { class: 'bk-top' }, backBtn),
    h('div', { class: 'bk-bottom' }, prevBtn, dotRow, nextBtn));
  root.classList.add('book-scene');
  root.appendChild(book);

  function sticker(id, { size = '', tilt = true } = {}) {
    const t = tilt ? stickerTilt(id) : { rot: 0, dx: 0, dy: 0 };
    const shiny = shinies.has(id);
    const img = spriteImg(id, { shiny, class: 'bk-img', lazy: false });
    const inner = h('div', { class: 'bk-sticker-in' }, img, shiny ? h('span', { class: 'bk-shine', attrs: { 'aria-hidden': 'true' } }, E.spark) : null);
    const el = h('div', {
      class: 'bk-sticker' + (size ? ' ' + size : '') + (shiny ? ' shiny' : ''),
      dataset: { id: String(id) },
      attrs: { role: 'button', 'aria-label': 'sticker' },
    }, inner);
    el.style.setProperty('--rot', t.rot + 'deg');
    el.style.setProperty('--dx', t.dx + '%');
    el.style.setProperty('--dy', t.dy + '%');
    return el;
  }

  function props(hab) {
    return h('div', { class: 'bk-props', attrs: { 'aria-hidden': 'true' } },
      hab.props.map((e, i) => h('span', { class: 'bk-prop bk-prop-' + i }, e)));
  }

  function buildCover(el) {
    const kids = [];
    // the history of his partner: every stage he has been, smallest first,
    // so the little one is always there. Only stages reached are drawn.
    for (let s = 1; s <= stage; s++) {
      const big = s === stage;
      const img = spriteImg(s, { animated: big, class: 'bk-img' });
      kids.push(h('div', { class: 'bk-bulba' + (big ? ' now' : ' was'), dataset: { id: String(s) }, attrs: { role: 'button', 'aria-label': 'bulba' } },
        h('div', { class: 'bk-sticker-in' }, img)));
    }
    const petalsRow = h('div', { class: 'bk-petals', attrs: { role: 'img', 'aria-label': 'petals' } },
      h('span', { class: 'bk-petal-ico' }), h('span', { class: 'bk-num' }, String(petals)));
    const stone = bulba.stayStone && stage < 3
      ? h('img', { class: 'bk-stone', attrs: { src: ITEM('everstone'), alt: '', draggable: 'false' } }) : null;
    const vis = (Array.isArray(bulba.visitors) ? bulba.visitors : []).map(cleanId).filter(Boolean);
    const recent = [...new Set(vis)].slice(-MAX_COVER_VISITORS);
    const ring = h('div', { class: 'bk-visitors' }, recent.map((id, i) => {
      const s = sticker(id, { size: 'small' });
      s.style.setProperty('--i', String(i));
      return s;
    }));
    const floaters = h('div', { class: 'bk-floaters', attrs: { 'aria-hidden': 'true' } },
      Array.from({ length: Math.min(12, petals) }, (_, i) => {
        const f = h('span', { class: 'bk-floater' });
        f.style.setProperty('--i', String(i));
        const [fx, fy] = FLOAT_SPOTS[i % FLOAT_SPOTS.length];
        f.style.setProperty('--fx', fx + '%');
        f.style.setProperty('--fy', fy + '%');
        return f;
      }));
    el.append(
      h('div', { class: 'bk-scene bk-cover' },
        h('div', { class: 'bk-sky' }), h('div', { class: 'bk-ground' }),
        floaters,
        h('div', { class: 'bk-cover-top' }, petalsRow),
        h('div', { class: 'bk-family' }, kids, stone),
        ring));
  }

  function buildHabitat(el, pg) {
    const hab = habitatInfo(pg.habitat);
    const scene = h('div', { class: 'bk-scene bk-hab' },
      h('div', { class: 'bk-sky' }), h('div', { class: 'bk-ground' }), props(hab),
      h('div', { class: 'bk-grid ' + gridClass(pg.ids.length) }, pg.ids.map(id => sticker(id))));
    scene.style.setProperty('--hab-sky', hab.sky);
    scene.style.setProperty('--hab-ground', hab.ground);
    el.appendChild(scene);
  }

  function buildPost(el, pg) {
    const stamps = Array.from({ length: pg.stamps }, (_, i) => {
      const t = stickerTilt(i + 1);
      const s = h('div', { class: 'bk-stamp' }, h('span', { class: 'bk-stamp-leaf' }, E.leaf));
      s.style.setProperty('--rot', t.rot + 'deg');
      return s;
    });
    el.appendChild(h('div', { class: 'bk-scene bk-post' },
      h('div', { class: 'bk-sky' }), h('div', { class: 'bk-ground' }),
      h('div', { class: 'bk-post-head', attrs: { role: 'img', 'aria-label': 'postcards' } },
        h('span', { class: 'bk-post-ico' }, E.stamp), h('span', { class: 'bk-num' }, String(pg.count))),
      h('div', { class: 'bk-stamps' }, stamps)));
  }

  function build(i) {
    if (i < 0 || i >= pages.length || built.has(i)) return;
    built.add(i);
    const pg = pages[i], el = pageEls[i];
    try {
      if (pg.kind === 'cover') buildCover(el);
      else if (pg.kind === 'habitat') buildHabitat(el, pg);
      else if (pg.kind === 'post') buildPost(el, pg);
    } catch (e) { /* one broken page never breaks the book */ }
  }

  // ---- turning pages -----------------------------------------------------
  function show(i, { animate = true } = {}) {
    idx = Math.max(0, Math.min(pages.length - 1, i));
    build(idx - 1); build(idx); build(idx + 1);
    track.style.transition = animate ? '' : 'none';
    track.style.transform = `translate3d(${-idx * 100}%, 0, 0)`;
    pageEls.forEach((el, j) => el.setAttribute('aria-hidden', j === idx ? 'false' : 'true'));
    dots.forEach((d, j) => d.classList.toggle('on', j === idx));
    prevBtn.classList.toggle('off', idx === 0);
    nextBtn.classList.toggle('off', idx === pages.length - 1);
    book.dataset.page = String(idx);
    book.dataset.pages = String(pages.length);
    book.dataset.kind = pages[idx].kind;
  }
  function turn(dir) {
    firstTouch();
    hideName();
    const to = idx + dir;
    if (to < 0 || to >= pages.length) { nudge(dir); return; }
    play('tap');
    show(to);
  }
  // At either end the page just leans and springs back: never a "no".
  function nudge(dir) {
    book.classList.remove('lean-l', 'lean-r'); void book.offsetWidth;
    book.classList.add(dir < 0 ? 'lean-l' : 'lean-r');
    later(() => book.classList.remove('lean-l', 'lean-r'), 400);
  }

  // ---- stickers: tap = bounce + cry; hold = name --------------------------
  let nameEl = null, nameT = null;
  function hideName() { cancel(nameT); nameT = null; if (nameEl) { nameEl.remove(); nameEl = null; } }
  function showName(el, id) {
    hideName();
    const bubble = h('div', { class: 'bk-name', attrs: { 'aria-hidden': 'false' } });
    el.appendChild(bubble);
    nameEl = bubble;
    nameT = later(hideName, NAME_SHOW_MS);
    const nick = typeof nicks[id] === 'string' ? nicks[id].trim() : '';
    const put = text => { bubble.textContent = text.slice(0, 14).toUpperCase(); fitBubble(bubble); };
    if (nick) { put(nick); return; }
    Promise.resolve().then(() => getMon(id)).then(m => {
      if (alive && nameEl === bubble && m && typeof m.name === 'string') put(m.name);
    }).catch(() => { if (nameEl === bubble) hideName(); });
  }
  // keep the name bubble on screen when the sticker sits by an edge
  function fitBubble(bubble) {
    try {
      const r = bubble.getBoundingClientRect(), vw = document.documentElement.clientWidth || innerWidth;
      const shift = r.right > vw - 6 ? vw - 6 - r.right : r.left < 6 ? 6 - r.left : 0;
      if (shift) bubble.style.setProperty('--nudge', Math.round(shift) + 'px');
    } catch (e) { /* cosmetic */ }
  }
  function bounce(el) {
    const inner = el.querySelector('.bk-sticker-in') || el;
    inner.classList.remove('bounce'); void inner.offsetWidth; inner.classList.add('bounce');
  }
  function tapSticker(el) {
    const id = cleanId(el.dataset.id);
    if (!id) return;
    hideName();
    bounce(el);
    playCry(id);
  }

  // ---- pointer: one handler decides drag vs tap vs hold -------------------
  let drag = null;   // { id, x, y, dx, moving, target, held, holdT }
  function stickerFrom(target) {
    const el = target && target.closest ? target.closest('.bk-sticker, .bk-bulba') : null;
    return el && viewport.contains(el) ? el : null;
  }
  function onDown(e) {
    firstTouch();
    if (drag || (e.button != null && e.button > 0)) return;
    const target = stickerFrom(e.target);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, moving: false, target, held: false, holdT: null };
    try { viewport.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    if (target) {
      const d = drag;
      d.holdT = later(() => {
        if (drag !== d || d.moving) return;
        d.held = true;
        bounce(target);
        showName(target, cleanId(target.dataset.id));
      }, LONG_PRESS_MS);
    }
  }
  function onMove(e) {
    const d = drag;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moving && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      d.moving = true; cancel(d.holdT); hideName();
      track.style.transition = 'none';
    }
    if (!d.moving) return;
    const atEnd = (idx === 0 && dx > 0) || (idx === pages.length - 1 && dx < 0);
    d.dx = atEnd ? dx / 3 : dx;
    const w = viewport.clientWidth || 1;
    track.style.transform = `translate3d(calc(${-idx * 100}% + ${(d.dx).toFixed(1)}px), 0, 0)`;
    if (Math.abs(d.dx) > w * 0.25) build(idx + (d.dx < 0 ? 1 : -1));
  }
  function onUp(e) {
    const d = drag;
    if (!d || e.pointerId !== d.id) return;
    drag = null;
    cancel(d.holdT);
    try { viewport.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
    if (d.moving) {
      track.style.transition = '';
      if (d.dx <= -SWIPE_PX && idx < pages.length - 1) { play('tap'); show(idx + 1); }
      else if (d.dx >= SWIPE_PX && idx > 0) { play('tap'); show(idx - 1); }
      else show(idx);
      return;
    }
    if (e.type === 'pointerup' && d.target && !d.held) tapSticker(d.target);
  }
  listen(viewport, 'pointerdown', onDown);
  listen(viewport, 'pointermove', onMove);
  listen(viewport, 'pointerup', onUp);
  listen(viewport, 'pointercancel', onUp);
  listen(viewport, 'lostpointercapture', e => { if (drag && e.pointerId === drag.id) onUp({ type: 'pointercancel', pointerId: e.pointerId }); });
  listen(viewport, 'contextmenu', e => e.preventDefault());
  // Dad's keyboard on the iPad
  listen(document, 'keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); turn(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); turn(-1); }
  });
  listen(book, 'pointerdown', firstTouch);

  // a one-page book (nothing caught yet, no postcards) is just Bulba: no arrows to nowhere
  if (pages.length === 1) { prevBtn.hidden = true; nextBtn.hidden = true; dotRow.hidden = true; }
  show(0, { animate: false });
  startMusic();

  return function unmount() {
    alive = false;
    hideName();
    for (const t of timers) clearTimeout(t);
    timers.clear();
    offs.forEach(f => f());
    try { music.stopMusic(); } catch (e) { /* ignore */ }
    root.classList.remove('book-scene');
    clear(root);
  };
}
