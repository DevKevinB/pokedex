// ============================================================
// SPROUT ROAD: THE POKEDEX.
// A fast grid of all 649: caught ones in colour, the rest as dark
// silhouettes. Generation tabs are pictures (each wears its starter).
// A reader can search by name or number; a prereader gets no search,
// no words, just pictures, with his own Pokemon first.
//
// Tap a Pokemon for its card: big animated sprite, a CRY button, a SHINY
// toggle (only when he owns the shiny), type chips, level + XP bar, the
// favourite star (six at most) and, for a reader, NAME ME with an in-app
// letter keypad (never the iOS keyboard; cleaned like core cleanName).
//
// Pure rules: ./dex-logic.js (unit-tested in test/dex.test.mjs).
// Params: { returnTo?, returnParams? }. BACK calls go(returnTo, returnParams).
// ============================================================

import { h, clear } from '../ui/h.js';
import { spriteImg, ITEM } from '../ui/sprite.js';
import * as audio from '../audio/audio.js';
import { getMon } from '../core/api.js';
import { typeEmoji } from '../data/config.js';
import * as L from './dex-logic.js';

const TYPES = new Set(Object.keys(typeEmoji));
const E = { back: '◀︎', next: '▶︎', close: '✕', cry: '\u{1F50A}', shiny: '✨',
  star: '★', starOff: '☆', pencil: '✏️', team: '\u{1F465}', del: '⌫' };

function play(name) { try { const f = audio.sfx && audio.sfx[name]; if (typeof f === 'function') f(); } catch (e) { /* silent */ } }

/** Only a plain scene name (and one level of it) survives as a return address. */
export function returnOf(params, prereader) {
  const to = L.safeReturn(params, prereader);
  const rp = params && params.returnParams;
  const back = rp && typeof rp.returnTo === 'string' && /^[a-z][a-z-]{1,19}$/.test(rp.returnTo) ? { returnTo: rp.returnTo } : {};
  return { to, params: back };
}

/**
 * Lazy sprites for a scrolling grid: each cell gets its <img> only when it
 * comes near the viewport, so 649 cells cost 649 empty buttons, not 649
 * downloads. -> { watch(cell), reset(), stop() }. make(cell) builds the img.
 */
export function lazySprites(scroller, make) {
  let io = null;
  const fill = cell => { if (!cell.dataset.filled) { cell.dataset.filled = '1'; try { make(cell); } catch (e) { /* one bad cell */ } } };
  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver(entries => {
      for (const en of entries) if (en.isIntersecting) { io.unobserve(en.target); fill(en.target); }
    }, { root: scroller, rootMargin: '240px 0px' });
  }
  return {
    watch(cell) { if (io) io.observe(cell); else fill(cell); },
    reset() { if (io) io.disconnect(); },
    stop() { if (io) io.disconnect(); io = null; },
  };
}

/** A type chip: the emoji for everyone, the word too for a reader. */
export function typeChip(type, reader) {
  const t = TYPES.has(type) ? type : 'normal';
  return h('span', { class: 'type-chip dex-chip', dataset: { type: t }, attrs: reader ? {} : { 'aria-label': t } },
    h('span', { class: 'emoji', attrs: { 'aria-hidden': 'true' } }, typeEmoji[t]),
    reader ? h('span', { class: 'dex-chip-word' }, t.toUpperCase()) : null);
}

export function mount(root, ctx) {
  const { store } = ctx;
  const p = store.player();
  const pre = p.profile === 'prereader';
  const ret = returnOf(ctx.params || {}, pre);
  const timers = new Set();
  let alive = true;
  let gen = 0;
  let query = '';
  let shown = [];          // ids in the grid right now (for ◀ ▶ on the card)
  let card = null;         // the open detail overlay
  let cardToken = 0;

  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms); timers.add(t); return t; };

  // ---------------------------------------------------------- top bar
  const back = h('button', {
    class: ['btn', 'btn-icon', 'dex-back', pre && 'tap-xl'], type: 'button', attrs: { 'aria-label': 'BACK' },
    on: { click: () => { play('tap'); ctx.go(ret.to, ret.params); } },
  }, E.back);
  const countEl = h('span', { class: 'dex-count' });
  const teamBtn = h('button', {
    class: ['btn', 'dex-teambtn', pre ? 'btn-icon tap-xl' : null], type: 'button', attrs: { 'aria-label': 'TEAM' },
    on: { click: () => { play('tap'); ctx.go('team', { returnTo: 'dex', returnParams: { returnTo: ret.to } }); } },
  }, h('span', { class: 'emoji', attrs: { 'aria-hidden': 'true' } }, E.team), pre ? null : 'TEAM');
  const top = h('div', { class: 'topbar dex-top' },
    back,
    pre ? h('span', { class: 'dex-top-ball' }, h('img', { class: 'dex-ball-ico', attrs: { src: ITEM('poke-ball'), alt: '', draggable: 'false' } }))
      : h('div', { class: 'dex-title' }, h('span', { class: 'topbar-title' }, 'POKÉDEX'), countEl),
    teamBtn);

  // ---------------------------------------------------------- tabs
  const tabs = h('div', { class: 'dex-tabs', attrs: { role: 'tablist' } });
  const tabBtns = L.GENS.map(g => {
    const pic = g.pic
      ? spriteImg(g.pic, { class: 'dex-tab-spr', lazy: false })
      : h('img', { class: 'sprite dex-tab-spr dex-tab-ball', attrs: { src: ITEM('poke-ball'), alt: '', draggable: 'false' } });
    const n = h('span', { class: 'dex-tab-n' });
    const b = h('button', {
      class: 'dex-tab', type: 'button', dataset: { gen: g.key },
      attrs: { role: 'tab', 'aria-label': g.key ? 'GEN ' + g.key : 'ALL' },
      on: { click: () => { play('tap'); gen = g.key; if (search) { search.value = ''; query = ''; } render(); } },
    }, pic, pre ? null : n);
    b._n = n;
    tabs.appendChild(b);
    return b;
  });

  // ---------------------------------------------------------- search (reader only)
  let search = null;
  let searchT = 0;
  const searchRow = pre ? null : h('div', { class: 'dex-search' },
    search = h('input', {
      class: 'dex-search-in', type: 'search',
      attrs: { placeholder: 'NAME OR #', 'aria-label': 'SEARCH', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '20', enterkeyhint: 'search' },
      on: {
        input: () => {
          clearTimeout(searchT); timers.delete(searchT);
          searchT = later(() => { query = search.value; render(); }, 140);
        },
        keydown: e => { if (e.key === 'Enter') { search.blur(); } },
      },
    }));

  // ---------------------------------------------------------- grid
  const grid = h('div', { class: 'dex-grid', attrs: { role: 'list' } });
  const empty = h('div', { class: 'dex-empty', hidden: true }, pre
    ? h('img', { class: 'sprite dex-ball-ico', attrs: { src: ITEM('poke-ball'), alt: '', draggable: 'false' } })
    : h('span', { class: 'emoji' }, '❓'));
  const scroller = h('div', { class: 'dex-scroll' }, grid, empty);
  const lazy = lazySprites(scroller, cell => {
    const id = Number(cell.dataset.id);
    cell.prepend(spriteImg(id, { class: 'dex-spr', shiny: false }));
  });

  function cellFor(id) {
    const own = L.owns(p, id);
    return h('button', {
      class: ['dex-cell', own ? 'is-caught' : 'is-shadow', L.isFav(p, id) && 'is-fav', L.ownsShiny(p, id) && 'has-shiny'],
      type: 'button', dataset: { id },
      attrs: { role: 'listitem', 'aria-label': pre ? String(id) : (own ? L.shownName(p, id) : L.numOf(id)) },
      on: { click: () => { play('tap'); openCard(id); } },
    },
    pre ? null : h('span', { class: 'dex-num' }, L.numOf(id)),
    L.isFav(p, id) ? h('span', { class: 'dex-badge dex-badge-fav', attrs: { 'aria-hidden': 'true' } }, E.star) : null);
  }

  function render() {
    lazy.reset();
    clear(grid);
    shown = L.gridIds({ gen, query, caught: p.caught, prereader: pre });
    const frag = document.createDocumentFragment();
    const cells = shown.map(cellFor);
    cells.forEach(c => frag.appendChild(c));
    grid.appendChild(frag);
    cells.forEach(c => lazy.watch(c));
    empty.hidden = shown.length > 0;
    scroller.scrollTop = 0;
    const searching = !pre && String(query).trim();
    tabBtns.forEach((b, i) => {
      const on = !searching && L.GENS[i].key === gen;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      if (b._n) b._n.textContent = String(L.genCount(L.GENS[i].key, p.caught));
    });
    countEl.textContent = (p.caught || []).length + '/' + L.MAX_ID;
  }

  /** Redraw one cell in place (after a star or a name change). */
  function refreshCell(id) {
    const old = grid.querySelector('.dex-cell[data-id="' + id + '"]');
    if (!old) return;
    const neu = cellFor(id);
    old.replaceWith(neu);
    lazy.watch(neu);
  }

  // ---------------------------------------------------------- detail card
  function closeCard() {
    cardToken++;
    if (card) { card.remove(); card = null; }
  }

  function openCard(id, { quiet = false } = {}) {
    closeCard();
    const my = ++cardToken;
    const own = L.owns(p, id);
    let shiny = false;
    let meta = null;

    const spr = h('div', { class: ['dex-big', !own && 'is-shadow'] });
    const drawSprite = () => {
      clear(spr);
      spr.appendChild(spriteImg(id, { class: 'dex-big-spr', animated: true, shiny }));
    };
    drawSprite();

    const chips = h('div', { class: 'dex-chips' });
    getMon(id).then(rec => {
      if (my !== cardToken || !alive) return;
      meta = rec;
      clear(chips);
      (rec.types || []).forEach(t => chips.appendChild(typeChip(t, !pre)));
    }).catch(() => { /* no chips offline; the card still works */ });

    const doCry = () => { try { audio.cry(id, meta); } catch (e) { /* never */ } spr.classList.remove('hop'); void spr.offsetWidth; spr.classList.add('hop'); };

    // name block (reader); the prereader sees the nickname only if he has one
    const nameEl = h('div', { class: 'dex-name' });
    const drawName = () => {
      clear(nameEl);
      const nick = own && p.nicks && p.nicks[id];
      if (pre) { if (nick) nameEl.appendChild(h('span', { class: 'dex-nick' }, nick)); return; }
      // native append() would print a null as the word "null": filter it.
      nameEl.append(...[
        h('span', { class: 'dex-num-big' }, L.numOf(id)),
        h('span', { class: 'dex-nick' }, own ? L.shownName(p, id) : L.nameOf(id)),
        nick ? h('span', { class: 'dex-species' }, L.nameOf(id)) : null].filter(Boolean));
    };
    drawName();

    // level + xp
    let lvl = null;
    if (own) {
      const li = L.levelInfo(p, id);
      const bar = h('div', { class: 'dex-xp' }, h('div', { class: 'dex-xp-fill' }));
      bar.style.setProperty('--xp', String(li.frac));
      lvl = h('div', { class: 'dex-lvl', attrs: { 'aria-label': 'LV ' + li.level } },
        h('span', { class: 'dex-lvl-n' }, (pre ? '' : 'LV ') + li.level), bar);
    }

    // action buttons
    const acts = h('div', { class: 'dex-acts' });
    const cryBtn = h('button', { class: 'btn dex-act dex-cry', type: 'button', attrs: { 'aria-label': 'CRY' }, on: { click: doCry } },
      h('span', { class: 'emoji', attrs: { 'aria-hidden': 'true' } }, E.cry));
    acts.appendChild(cryBtn);

    if (L.ownsShiny(p, id)) {
      const sBtn = h('button', {
        class: 'btn dex-act dex-shiny', type: 'button', attrs: { 'aria-label': 'SHINY', 'aria-pressed': 'false' },
        on: { click: () => {
          play('tap'); shiny = !shiny;
          sBtn.classList.toggle('is-on', shiny); sBtn.setAttribute('aria-pressed', String(shiny));
          drawSprite(); spr.classList.remove('pop-in'); void spr.offsetWidth; spr.classList.add('pop-in');
        } },
      }, h('span', { class: 'emoji', attrs: { 'aria-hidden': 'true' } }, E.shiny));
      acts.appendChild(sBtn);
    }

    const favRow = h('div', { class: 'dex-favswap', hidden: true });
    if (own) {
      const fBtn = h('button', { class: 'btn dex-act dex-fav', type: 'button', attrs: { 'aria-label': 'FAVOURITE' } });
      const drawFav = () => {
        const on = L.isFav(p, id);
        fBtn.classList.toggle('is-on', on);
        fBtn.setAttribute('aria-pressed', String(on));
        fBtn.textContent = on ? E.star : E.starOff;
      };
      drawFav();
      fBtn.addEventListener('click', () => {
        const r = L.toggleFav(p, id);
        if (r === 'full') { showSwap(); return; }
        play(r === 'on' ? 'petal' : 'tap');
        favRow.hidden = true;
        store.commit();
        drawFav(); refreshCell(id);
        if (r === 'on') { fBtn.classList.remove('pop-in'); void fBtn.offsetWidth; fBtn.classList.add('pop-in'); }
      });
      // Six stars already: show them; tapping one moves its star here.
      const showSwap = () => {
        play('tap');
        clear(favRow);
        if (!pre) favRow.appendChild(h('div', { class: 'dex-favswap-t' }, 'SWAP A STAR?'));
        const row = h('div', { class: 'dex-favswap-row' });
        for (const fid of p.favorites.slice()) {
          row.appendChild(h('button', {
            class: 'dex-favswap-b', type: 'button', attrs: { 'aria-label': pre ? String(fid) : L.shownName(p, fid) },
            on: { click: () => {
              if (L.swapFav(p, fid, id)) { play('petal'); store.commit(); refreshCell(fid); refreshCell(id); }
              favRow.hidden = true; drawFav();
            } },
          }, spriteImg(fid, { class: 'dex-favswap-spr', shiny: L.ownsShiny(p, fid) }),
          h('span', { class: 'dex-badge dex-badge-fav', attrs: { 'aria-hidden': 'true' } }, E.star)));
        }
        favRow.appendChild(row);
        favRow.hidden = false;
      };
      acts.appendChild(fBtn);
    }

    if (own && !pre) {
      acts.appendChild(h('button', {
        class: 'btn dex-act dex-nameme', type: 'button',
        on: { click: () => { play('tap'); openKeypad(id, () => { drawName(); refreshCell(id); }); } },
      }, 'NAME ME'));
    }

    const close = h('button', {
      class: ['btn', 'btn-icon', 'dex-close', pre && 'tap-xl'], type: 'button', attrs: { 'aria-label': 'CLOSE' },
      on: { click: () => { play('tap'); closeCard(); } },
    }, E.close);
    const i = shown.indexOf(id);
    const step = d => {
      if (!shown.length) return;
      const k = ((i < 0 ? 0 : i) + d + shown.length) % shown.length;
      play('tap'); openCard(shown[k]);
    };
    const prev = h('button', { class: ['btn', 'btn-icon', 'dex-step', pre && 'tap-xl'], type: 'button', attrs: { 'aria-label': 'PREVIOUS' }, on: { click: () => step(-1) } }, E.back);
    const next = h('button', { class: ['btn', 'btn-icon', 'dex-step', pre && 'tap-xl'], type: 'button', attrs: { 'aria-label': 'NEXT' }, on: { click: () => step(1) } }, E.next);

    const panel = h('div', { class: ['panel', 'dex-card', own ? 'is-caught' : 'is-shadow'], attrs: { role: 'dialog', 'aria-modal': 'true' } },
      h('div', { class: 'dex-card-top' }, close),
      h('div', { class: 'dex-card-stage' }, prev, spr, next),
      nameEl, chips, lvl, acts, favRow);
    card = h('div', {
      class: ['overlay', 'dex-overlay', pre && 'dex-pre'],
      on: { click: e => { if (e.target === card) { play('tap'); closeCard(); } } },
    }, panel);
    root.querySelector('.dex').appendChild(card);
    if (own && !quiet) later(doCry, 120);
  }

  // ---------------------------------------------------------- NAME ME keypad (reader)
  function openKeypad(id, done) {
    let draft = (p.nicks && p.nicks[id]) || '';
    draft = L.cleanNick(draft);
    const out = h('div', { class: 'dex-kp-out' });
    const drawOut = () => {
      clear(out);
      out.append(h('span', { class: 'dex-kp-text' }, draft), h('span', { class: 'dex-kp-caret' }, draft.length < L.NICK_MAX ? '_' : ''));
      out.appendChild(h('span', { class: 'dex-kp-left' }, String(L.NICK_MAX - draft.length)));
    };
    drawOut();
    const key = k => { const nx = L.typeKey(draft, k); if (nx !== draft) { play('tap'); draft = nx; drawOut(); } };
    const keys = h('div', { class: 'dex-kp-keys' },
      L.KEYPAD.map(k => h('button', {
        class: ['dex-kp-key', k === ' ' && 'dex-kp-space'], type: 'button',
        attrs: { 'aria-label': k === ' ' ? 'SPACE' : k }, on: { click: () => key(k) },
      }, k === ' ' ? '␣' : k)),
      h('button', { class: 'dex-kp-key dex-kp-del', type: 'button', attrs: { 'aria-label': 'DELETE' }, on: { click: () => key('DEL') } }, 'DEL'));
    let ov = null;
    const shut = () => { if (ov) { ov.remove(); ov = null; } document.removeEventListener('keydown', onKey, true); };
    const ok = () => {
      L.setNick(p, id, draft);
      store.commit();
      play('levelUp');
      shut(); done();
    };
    const onKey = e => {
      if (!ov) return;
      if (e.key === 'Enter') { e.preventDefault(); ok(); }
      else if (e.key === 'Escape') { e.preventDefault(); shut(); }
      else if (e.key === 'Backspace') { e.preventDefault(); key('DEL'); }
      else if (e.key && e.key.length === 1) { const k = e.key.toUpperCase(); if (L.KEYPAD.includes(k)) { e.preventDefault(); key(k); } }
    };
    document.addEventListener('keydown', onKey, true);
    kpShut = shut;
    ov = h('div', { class: 'overlay dex-kp-overlay' },
      h('div', { class: 'panel dex-kp', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'NAME ME' } },
        h('div', { class: 'dex-kp-head' },
          spriteImg(id, { class: 'dex-kp-spr' }),
          h('div', { class: 'dex-kp-title' }, 'NAME ME')),
        out, keys,
        h('div', { class: 'dex-kp-acts' },
          h('button', { class: 'btn dex-kp-clr', type: 'button', on: { click: () => key('CLR') } }, 'CLEAR'),
          h('button', { class: 'btn dex-kp-cancel', type: 'button', on: { click: () => { play('tap'); shut(); } } }, 'BACK'),
          h('button', { class: 'btn btn-go dex-kp-ok', type: 'button', on: { click: ok } }, 'OK'))));
    root.querySelector('.dex').appendChild(ov);
  }
  let kpShut = null;

  // ---------------------------------------------------------- assemble
  const scene = h('div', { class: ['dex', pre && 'dex-pre'], dataset: { scene: 'dex' } },
    top, tabs, searchRow, scroller);
  root.appendChild(scene);
  render();

  return function unmount() {
    alive = false;
    cardToken++;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    lazy.stop();
    if (kpShut) kpShut();
    scene.remove();
  };
}
