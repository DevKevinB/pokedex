// ============================================================
// SPROUT ROAD: EVOLUTION (wild builder). Port of the classic
// playEvolution / askEvolutionChoice (js/battle.js v19.8).
//
// Reached from the battle's return route (core/evo.js evolveRoute):
//   params = { queue:[{id, options:[{id,name}]}], returnTo, returnParams, player? }
//   (a single { id, options, returnTo, returnParams } works too)
//   player (1|2, optional): whose Pokemon evolve. The Family Table passes
//   its battler seat, which need not be store.current. Default: store.player().
//   A PREREADER never reaches this screen (core/evo.js evolutionsDue); if
//   one is sent here anyway, the queue is empty and he goes straight on.
// When the queue is done: ctx.go(returnTo, returnParams).
//
// A READER chooses: EVOLVE, or WAIT (an Everstone). A branching line shows
// every option as a picture to tap. WAIT costs nothing: the question comes
// back at the next level-up.
// A PREREADER never chooses and never reads: his Pokemon simply evolve
// with a gentle glow (his Bulbasaur line never comes here at all; his Bulba
// has his own bud in the Garden). No words on his screen.
// The one save write is core/evo.js evolveMonIn(): the new Pokemon is added
// and the old one is never taken away.
// ============================================================

import { h, clear } from '../ui/h.js';
import { spriteImg, ITEM } from '../ui/sprite.js';
import { sfx, cry } from '../audio/audio.js';
import { wait } from '../core/pace.js';
import { cachedMon, getMon, MAX_ID } from '../core/api.js';
import { evolveMonIn } from '../core/evo.js';

const RETURNS = new Set(['road', 'wild', 'garden', 'rest', 'who', 'together', 'family-table', 'versus', 'postcard', 'dex', 'team', 'roots']);
const KEY_RE = /^[a-zA-Z]{1,20}$/;
const isPrim = v => v == null || ['string', 'number', 'boolean'].includes(typeof v);
/** Plain params to hand back: primitives, plus ONE level of nested primitives
 *  (the postcard's own returnParams {battler, helper}). Exported for tests. */
export function cleanReturnParams(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw).slice(0, 20)) {
    if (!KEY_RE.test(k)) continue;
    if (isPrim(v)) out[k] = v;
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = {};
      for (const [k2, v2] of Object.entries(v).slice(0, 20)) if (KEY_RE.test(k2) && isPrim(v2)) inner[k2] = v2;
      out[k] = inner;
    }
  }
  return out;
}
const validId = n => Number.isInteger(n) && n >= 1 && n <= MAX_ID;
const play = (name, ...a) => { try { if (sfx && typeof sfx[name] === 'function') sfx[name](...a); } catch (e) { /* silent */ } };
const upper = s => String(s || '').toUpperCase().slice(0, 20);

/** Sanitise the queue the battle handed us against the live player. Exported for tests. */
export function cleanQueue(params, p) {
  const raw = Array.isArray(params && params.queue) ? params.queue
    : (params && params.id != null ? [{ id: params.id, options: params.options }] : []);
  const owned = new Set(Array.isArray(p && p.caught) ? p.caught : []);
  const out = [];
  if (p && p.profile === 'prereader') return out;   // Art is never asked
  for (const item of raw.slice(0, 6)) {
    const id = Math.floor(Number(item && item.id));
    if (!validId(id) || !owned.has(id)) continue;
    if (out.some(q => q.id === id)) continue;
    const options = [];
    for (const o of Array.isArray(item.options) ? item.options.slice(0, 9) : []) {
      const oid = Math.floor(Number(o && o.id));
      if (!validId(oid) || oid === id || options.some(x => x.id === oid)) continue;
      options.push({ id: oid, name: typeof (o && o.name) === 'string' ? upper(o.name) : '' });
    }
    if (options.length) out.push({ id, options });
  }
  return out;
}

export function mount(root, ctx) {
  const store = ctx.store;
  const params = ctx.params || {};
  const n = Number(params.player);
  const p = (n === 1 || n === 2) && store.save.players[n] ? store.save.players[n] : store.player();
  const pre = p.profile === 'prereader';
  const calm = pre || document.body.classList.contains('calm');
  const ac = new AbortController();
  let alive = true;

  const returnTo = RETURNS.has(params.returnTo) ? params.returnTo : (pre ? 'garden' : 'road');
  const returnParams = cleanReturnParams(params.returnParams);
  const queue = cleanQueue(params, p);

  const scene = h('div', { class: ['evo', { 'evo-pre': pre, calm }], dataset: { scene: 'evolve' } },
    h('div', { class: 'evo-rays', attrs: { 'aria-hidden': 'true' } }));
  const stage = h('div', { class: 'evo-stage' });
  scene.append(stage);
  root.appendChild(scene);

  const done = () => { if (!alive) return; alive = false; ctx.go(returnTo, returnParams); };

  if (!queue.length) { Promise.resolve().then(done); }
  else next(0);

  function nameOf(id) {
    const nick = p.nicks && typeof p.nicks === 'object' && typeof p.nicks[id] === 'string' ? p.nicks[id] : '';
    if (nick) return upper(nick);
    const c = cachedMon(id);
    return c ? upper(c.name) : '';
  }
  // Fill in a species name that was not cached yet (never blocks anything).
  function fillName(el, id, fmt) {
    if (!el) return;
    const n = nameOf(id);
    el.textContent = fmt(n);
    if (n) return;
    getMon(id).then(m => { if (alive && m) el.textContent = fmt(upper(m.name)); }).catch(() => {});
  }

  function next(i) {
    if (!alive) return;
    if (i >= queue.length) { done(); return; }
    const item = queue[i];
    if (pre) { evolve(item, item.options[0], i); return; }
    ask(item, i);
  }

  // ---------------------------------------------------------- the question (readers)
  function ask(item, i) {
    clear(stage);
    stage.dataset.step = 'ask';
    stage.dataset.id = String(item.id);
    const shiny = (p.shinies || []).includes(item.id);
    const title = h('div', { class: 'evo-title' });
    fillName(title, item.id, n => (n ? n + ' ' : '') + 'WANTS TO EVOLVE!');
    const branch = item.options.length > 1;
    const optionBtns = item.options.map(o => h('button', {
      class: 'evo-option', type: 'button', dataset: { evo: String(o.id) },
      attrs: { 'aria-label': o.name || 'EVOLVE' },
      on: { click: () => { if (!alive) return; play('tap'); evolve(item, o, i); } }
    },
    h('span', { class: 'evo-option-art' }, spriteImg(o.id, { class: 'evo-option-sprite' })),
    o.name ? h('span', { class: 'evo-option-name' }, o.name) : null));
    const wait_ = h('button', {
      class: 'evo-btn evo-wait', type: 'button', dataset: { act: 'wait' },
      on: { click: () => { if (!alive) return; play('tap'); stay(item, i); } }
    }, h('img', { class: 'evo-stone', src: ITEM('everstone'), alt: '', attrs: { draggable: 'false' } }), 'WAIT');
    const go = branch ? null : h('button', {
      class: 'evo-btn evo-go', type: 'button', dataset: { act: 'evolve' },
      on: { click: () => { if (!alive) return; play('tap'); evolve(item, item.options[0], i); } }
    }, '✨ EVOLVE');
    stage.append(...[
      h('div', { class: 'evo-from' }, spriteImg(item.id, { class: 'evo-from-sprite', shiny, animated: true })),
      title,
      branch ? h('div', { class: 'evo-sub' }, 'WHO WILL IT BECOME?') : null,
      h('div', { class: ['evo-options', { branch }] }, optionBtns),
      h('div', { class: 'evo-actions' }, wait_, go)].filter(Boolean));
    play('levelUp');
    cry(item.id);
  }

  // WAIT: the Everstone. Nothing changes; asked again next level-up.
  async function stay(item, i) {
    clear(stage);
    stage.dataset.step = 'wait';
    const shiny = (p.shinies || []).includes(item.id);
    stage.append(
      h('div', { class: 'evo-from evo-stay' },
        spriteImg(item.id, { class: 'evo-from-sprite', shiny, animated: true }),
        h('img', { class: 'evo-stone big', src: ITEM('everstone'), alt: '', attrs: { draggable: 'false' } })),
      h('div', { class: 'evo-title' }, 'OK! MAYBE LATER.'));
    await wait(900, { signal: ac.signal });
    next(i + 1);
  }

  // ---------------------------------------------------------- the glow
  async function evolve(item, opt, i) {
    if (!alive) return;
    // Save FIRST: whatever happens to the animation, the evolution is his.
    const shiny = (p.shinies || []).includes(item.id);
    // Names before the write: a nickname moves to the new Pokemon.
    let oldName = nameOf(item.id);
    if (!oldName) getMon(item.id).then(m => { if (m) oldName = upper(m.name); }).catch(() => {});
    const words = pre ? null : h('div', { class: 'evo-title' });
    if (words) fillName(words, item.id, n => 'WHAT? ' + (n || 'IT') + ' IS EVOLVING!');
    const res = evolveMonIn(p, item.id, opt.id);
    if (res) { try { store.commit(); } catch (e) { /* store reports its own failures */ } }

    clear(stage);
    stage.dataset.step = 'evolving';
    stage.dataset.to = String(opt.id);
    const from = spriteImg(item.id, { class: 'evo-glow-sprite old', shiny });
    const to = spriteImg(opt.id, { class: 'evo-glow-sprite new', shiny });
    const glow = h('div', { class: 'evo-glow' }, h('span', { class: 'evo-halo', attrs: { 'aria-hidden': 'true' } }), from, to);
    stage.append(...[glow, words].filter(Boolean));
    await wait(pre ? 600 : 900, { signal: ac.signal });
    if (!alive) return;
    glow.classList.add('is-evolving');
    play('evolve');
    await wait(pre ? 2600 : 2200, { signal: ac.signal });
    if (!alive) return;
    glow.classList.remove('is-evolving');
    glow.classList.add('is-done');
    cry(opt.id);
    if (!pre) play('levelUp');
    if (words) {
      const newName = opt.name || '';
      words.textContent = (oldName && newName) ? oldName + ' BECAME ' + newName + '!' : 'IT EVOLVED!';
    }
    const burst = h('div', { class: 'evo-burst', attrs: { 'aria-hidden': 'true' } },
      Array.from({ length: 8 }, (_, k) => h('span', { style: { '--k': k } }, pre ? '🍃' : '✨')));
    glow.append(burst);
    await wait(500, { signal: ac.signal });
    if (!alive) return;
    const ok = h('button', {
      class: 'evo-btn evo-ok', type: 'button', attrs: { 'aria-label': 'OK' },
      on: { click: () => { if (!alive) return; play('tap'); next(i + 1); } }
    }, '▶');
    stage.append(h('div', { class: 'evo-actions' }, ok));
  }

  return function unmount() {
    alive = false;
    ac.abort();
    scene.remove();
  };
}
