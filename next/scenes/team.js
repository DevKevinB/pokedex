// ============================================================
// SPROUT ROAD: THE TEAM EDITOR.
// Six slots across the top (slot 1 is the LEAD and wears a crown), his
// box of caught Pokemon below. Tap a slot, then a Pokemon, to put it
// there. Tap two filled slots to swap them (that is how the LEAD
// changes). A picked slot shows a take-back button, except on the last
// team member: a team is never empty. With no slot picked, a Pokemon
// goes into the first empty slot. Every change writes player().team
// and commits at once.
//
// Pure rules: ./dex-logic.js (placeInTeam / swapSlots / removeFromTeam).
// Params: { returnTo?, returnParams? }.
// ============================================================

import { h, clear } from '../ui/h.js';
import { spriteImg, ITEM } from '../ui/sprite.js';
import * as audio from '../audio/audio.js';
import * as L from './dex-logic.js';
import { lazySprites, returnOf } from './dex.js';

const E = { back: '◀︎', crown: '\u{1F451}', out: '✕', book: '\u{1F4D6}' };

function play(name) { try { const f = audio.sfx && audio.sfx[name]; if (typeof f === 'function') f(); } catch (e) { /* silent */ } }

export function mount(root, ctx) {
  const { store } = ctx;
  const p = store.player();
  const pre = p.profile === 'prereader';
  const ret = returnOf(ctx.params || {}, pre);
  const timers = new Set();
  let alive = true;
  let picked = -1;          // selected slot, -1 = none
  let query = '';
  let searchT = 0;

  // A team member he no longer owns can never stay (validate does the same).
  const team = () => L.cleanTeam(p.team, p.caught);
  const write = t => {
    const before = JSON.stringify(p.team || []);
    p.team = t;
    if (JSON.stringify(t) !== before) store.commit();
  };
  // Tidy a stale team once, on the way in (never empties a real one).
  { const t = team(); if (JSON.stringify(t) !== JSON.stringify(p.team || [])) write(t); }

  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms); timers.add(t); return t; };
  const bump = (el, cls) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

  // ---------------------------------------------------------- top
  const back = h('button', {
    class: ['btn', 'btn-icon', 'team-back', pre && 'tap-xl'], type: 'button', attrs: { 'aria-label': 'BACK' },
    on: { click: () => { play('tap'); ctx.go(ret.to, ret.params); } },
  }, E.back);
  const top = h('div', { class: 'topbar team-top' },
    back,
    pre ? h('span', { class: 'team-top-ico emoji', attrs: { 'aria-hidden': 'true' } }, E.crown)
      : h('span', { class: 'topbar-title' }, 'MY TEAM'),
    h('span', { class: 'team-top-pad' }));

  // ---------------------------------------------------------- slots
  const slotsEl = h('div', { class: 'team-slots' });
  const outBtn = h('button', {
    class: ['btn', 'team-out', pre && 'tap-xl'], type: 'button', attrs: { 'aria-label': 'TO BOX' }, hidden: true,
    on: { click: () => {
      if (!L.canRemove(team(), picked)) return;
      play('tap');
      write(L.removeFromTeam(team(), picked, p.caught));
      picked = -1;
      drawSlots(); drawBoxMarks();
    } },
  }, h('span', { attrs: { 'aria-hidden': 'true' } }, E.out), pre ? null : 'TO BOX');
  const hint = pre ? null : h('div', { class: 'team-hint' });

  function drawSlots() {
    const t = team();
    clear(slotsEl);
    for (let i = 0; i < L.MAX_TEAM; i++) {
      const id = t[i];
      const li = id ? L.levelInfo(p, id) : null;
      slotsEl.appendChild(h('button', {
        class: ['team-slot', id ? 'is-full' : 'is-empty', i === 0 && 'is-lead', i === picked && 'is-picked'],
        type: 'button', dataset: { slot: i, id: id || '' },
        attrs: { 'aria-label': (i === 0 ? 'LEAD ' : 'SLOT ' + (i + 1) + ' ') + (id && !pre ? L.shownName(p, id) : ''), 'aria-pressed': String(i === picked) },
        on: { click: () => tapSlot(i) },
      },
      i === 0 ? h('span', { class: 'team-crown emoji', attrs: { 'aria-hidden': 'true' } }, E.crown) : null,
      id ? spriteImg(id, { class: 'team-slot-spr', shiny: L.ownsShiny(p, id) })
        : h('img', { class: 'sprite team-slot-ball', attrs: { src: ITEM('poke-ball'), alt: '', draggable: 'false' } }),
      id && !pre ? h('span', { class: 'team-slot-lv' }, 'LV' + li.level) : null));
    }
    outBtn.hidden = !L.canRemove(t, picked);
    if (hint) hint.textContent = picked >= 0 ? 'NOW TAP A POKÉMON' : (t.length < L.MAX_TEAM ? 'TAP ONE TO ADD' : 'TAP A SLOT FIRST');
  }

  function tapSlot(i) {
    const t = team();
    if (picked === i) { picked = -1; play('tap'); drawSlots(); return; }
    if (picked >= 0 && picked < t.length && i < t.length) {
      // two filled slots: swap them (how the LEAD changes)
      write(L.swapSlots(t, picked, i, p.caught));
      const a = picked; picked = -1;
      play('petal');
      drawSlots(); drawBoxMarks();
      bump(slotsEl.children[a], 'hop'); bump(slotsEl.children[i], 'hop');
      return;
    }
    // an empty slot always means "the next free one"
    picked = i < t.length ? i : t.length;
    play('tap');
    drawSlots();
  }

  function tapMon(id, cell) {
    const t = team();
    let slot = picked;
    if (slot < 0) {
      if (t.includes(id)) { bump(slotsEl.children[t.indexOf(id)], 'hop'); play('tap'); return; }
      if (t.length >= L.MAX_TEAM) {           // full and no slot picked: point at the slots
        play('tap');
        bump(slotsEl, 'team-nudge');
        return;
      }
      slot = t.length;
    }
    if (slot >= t.length && t.includes(id)) {   // already on the team: show where
      picked = -1; play('tap'); drawSlots(); bump(slotsEl.children[t.indexOf(id)], 'hop'); return;
    }
    const nt = L.placeInTeam(t, slot, id, p.caught);
    write(nt);
    picked = -1;
    play('petal');
    try { audio.cry(id); } catch (e) { /* never */ }
    drawSlots(); drawBoxMarks();
    const at = nt.indexOf(id);
    if (at >= 0) bump(slotsEl.children[at], 'pop-in');
    bump(cell, 'hop');
  }

  // ---------------------------------------------------------- box
  const grid = h('div', { class: 'team-box', attrs: { role: 'list' } });
  const empty = h('div', { class: 'team-empty', hidden: true },
    h('img', { class: 'sprite team-empty-ball', attrs: { src: ITEM('poke-ball'), alt: '', draggable: 'false' } }));
  const scroller = h('div', { class: 'team-scroll' }, grid, empty);
  const lazy = lazySprites(scroller, cell => {
    const id = Number(cell.dataset.id);
    cell.prepend(spriteImg(id, { class: 'team-box-spr', shiny: L.ownsShiny(p, id) }));
  });

  let search = null;
  const searchRow = pre ? null : h('div', { class: 'dex-search team-search' },
    search = h('input', {
      class: 'dex-search-in', type: 'search',
      attrs: { placeholder: 'NAME OR #', 'aria-label': 'SEARCH', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '20', enterkeyhint: 'search' },
      on: {
        input: () => { clearTimeout(searchT); timers.delete(searchT); searchT = later(() => { query = search.value; drawBox(); }, 140); },
        keydown: e => { if (e.key === 'Enter') search.blur(); },
      },
    }));

  function drawBox() {
    lazy.reset();
    clear(grid);
    let ids = L.boxIds(p);
    if (!pre && String(query).trim()) { const hit = new Set(L.searchIds(query)); ids = ids.filter(id => hit.has(id)); }
    const cells = ids.map(id => h('button', {
      class: ['team-cell', L.isFav(p, id) && 'is-fav'], type: 'button', dataset: { id },
      attrs: { role: 'listitem', 'aria-label': pre ? String(id) : L.shownName(p, id) },
      on: { click: e => tapMon(id, e.currentTarget) },
    },
    pre ? null : h('span', { class: 'team-cell-lv' }, String(L.levelInfo(p, id).level)),
    h('span', { class: 'team-cell-on', attrs: { 'aria-hidden': 'true' } })));
    cells.forEach(c => grid.appendChild(c));
    cells.forEach(c => lazy.watch(c));
    empty.hidden = cells.length > 0;
    drawBoxMarks();
  }

  function drawBoxMarks() {
    const t = team();
    for (const c of grid.children) {
      const at = t.indexOf(Number(c.dataset.id));
      c.classList.toggle('is-on-team', at >= 0);
      const mark = c.querySelector('.team-cell-on');
      if (mark) mark.textContent = at === 0 ? E.crown : (at > 0 ? String(at + 1) : '');
    }
  }

  // ---------------------------------------------------------- assemble
  const scene = h('div', { class: ['team', pre && 'team-pre'], dataset: { scene: 'team' } },
    top,
    h('div', { class: 'team-slotwrap' }, slotsEl, h('div', { class: 'team-under' }, hint, outBtn)),
    searchRow,
    scroller);
  root.appendChild(scene);
  drawSlots();
  drawBox();

  return function unmount() {
    alive = false;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    lazy.stop();
    scene.remove();
  };
}
