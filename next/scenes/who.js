// ============================================================
// SPROUT ROAD — WHO'S PLAYING?
// Two giant cards: each boy's lead Pokemon (for a prereader, his BULBA with
// a leaf badge) and his name. A tap picks the player and routes him home:
// prereader -> garden, reader -> road.
//
// The small gear in the corner is for grown-ups: it only opens after a
// 2-second hold, and it is the ONLY place a profile (reader/prereader)
// can change. Mute lives there too.
// ============================================================

import { h, clear } from '../ui/h.js';
import { spriteImg } from '../ui/sprite.js';
import { sfx, isMuted, toggleMute } from '../audio/audio.js';
import { stageId } from './garden-logic.js';

const HOLD_MS = 2000;
const play = name => { try { const f = sfx && sfx[name]; if (typeof f === 'function') f(); } catch (e) { /* silent */ } };

function leadOf(p) {
  if (p.profile === 'prereader') return { id: stageId((p.bulba && p.bulba.stage) || 1), shiny: false };
  const id = (p.team && p.team[0]) || (p.caught && p.caught[0]) || 1;
  return { id, shiny: Array.isArray(p.shinies) && p.shinies.includes(id) };
}

export function mount(root, ctx) {
  const { store } = ctx;
  const timers = new Set();
  const offs = [];
  let overlay = null;

  const title = h('h1', { class: 'who-title' }, "WHO'S PLAYING?");
  const cards = h('div', { class: 'who-cards' });
  const gear = h('button', {
    class: 'corner-chip who-gear', type: 'button',
    attrs: { 'aria-label': 'GROWN-UPS: HOLD' },
  }, h('span', { class: 'who-gear-ico' }, '⚙'), h('span', { class: 'who-gear-ring' }));
  const scene = h('div', { class: 'who' }, title, cards, gear);
  root.classList.add('who-scene');
  root.appendChild(scene);

  function drawCards() {
    clear(cards);
    const last = store.lastPlayer();
    for (const n of [1, 2]) {
      const p = store.save.players[n];
      const lead = leadOf(p);
      const pre = p.profile === 'prereader';
      const name = (p.name || '').trim() || 'PLAYER ' + n;
      const card = h('button', {
        class: ['who-card', 'p' + n, n === last ? 'who-last' : '', pre ? 'who-pre' : ''],
        type: 'button',
        dataset: { player: n, profile: p.profile },
        attrs: { 'aria-label': name },
        on: { click: () => pick(n) },
      },
      spriteImg(lead.id, { animated: true, shiny: lead.shiny, class: 'who-sprite' }),
      pre ? h('span', { class: 'who-leaf', attrs: { 'aria-hidden': 'true' } }, '🍃') : null,
      h('span', { class: 'who-name' }, name));
      cards.appendChild(card);
    }
  }

  function pick(n) {
    play('tap');
    store.setPlayer(n);
    const p = store.player();
    ctx.go(p.profile === 'prereader' ? 'garden' : 'road');
  }

  // ---- the grown-up gear: hold for 2 seconds ---------------------------
  let holdT = null;
  const cancelHold = () => {
    if (holdT) { clearTimeout(holdT); timers.delete(holdT); holdT = null; }
    gear.classList.remove('holding');
  };
  const startHold = e => {
    e.preventDefault();
    cancelHold();
    gear.classList.add('holding');
    holdT = setTimeout(() => { timers.delete(holdT); holdT = null; gear.classList.remove('holding'); openGrownUps(); }, HOLD_MS);
    timers.add(holdT);
  };
  gear.addEventListener('pointerdown', startHold);
  for (const evt of ['pointerup', 'pointerleave', 'pointercancel']) gear.addEventListener(evt, cancelHold);
  gear.addEventListener('contextmenu', e => e.preventDefault());

  function openGrownUps() {
    if (overlay) return;
    play('tap');
    const rows = h('div', { class: 'gu-rows' });
    const muteBtn = h('button', { class: 'btn gu-mute', type: 'button', on: { click: () => { toggleMute(); drawPanel(); } } });
    const close = h('button', { class: 'btn btn-primary gu-close', type: 'button', on: { click: closeGrownUps } }, 'DONE');

    function drawPanel() {
      clear(rows);
      for (const n of [1, 2]) {
        const p = store.save.players[n];
        const name = (p.name || '').trim() || 'PLAYER ' + n;
        const pre = p.profile === 'prereader';
        rows.appendChild(h('div', { class: 'gu-row' },
          h('span', { class: 'gu-name' }, name),
          h('button', {
            class: ['btn', 'gu-profile', pre ? 'is-pre' : 'is-reader'], type: 'button',
            dataset: { player: n },
            on: {
              click: () => {
                p.profile = pre ? 'reader' : 'prereader';
                store.commit();
                drawPanel();
                drawCards();
              }
            },
          }, pre ? '🌱 LITTLE ONE' : '📖 READER')));
      }
      clear(muteBtn);
      muteBtn.append(isMuted() ? '🔇 SOUND OFF' : '🔊 SOUND ON');
    }
    drawPanel();

    overlay = h('div', { class: 'overlay gu-overlay', on: { click: e => { if (e.target === overlay) closeGrownUps(); } } },
      h('div', { class: 'panel gu-panel', attrs: { role: 'dialog', 'aria-label': 'GROWN-UPS' } },
        h('h2', { class: 'dialog-title' }, 'GROWN-UPS'),
        rows,
        h('div', { class: 'dialog-actions' }, muteBtn, close),
        // The classic game stays one tap away until the cutover. Same site,
        // same saves: anything caught there shows up here on the next visit.
        h('a', { class: 'btn gu-classic', attrs: { href: '../' } }, '📟 OLD POKÉDEX')));
    scene.appendChild(overlay);
  }

  function closeGrownUps() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
  }

  drawCards();
  offs.push(store.on('change', () => { if (!overlay) drawCards(); }));

  return function unmount() {
    for (const t of timers) clearTimeout(t);
    timers.clear();
    for (const off of offs) { try { off(); } catch (e) { /* ignore */ } }
    closeGrownUps();
  };
}
