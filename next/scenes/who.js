// ============================================================
// SPROUT ROAD — WHO'S PLAYING?
// Two giant cards: each boy's lead Pokemon (for a prereader, his BULBA with
// a leaf badge) and his name. A tap picks the player and routes him home:
// prereader -> garden, reader -> road.
//
// A third, wide card below them is PLAY TOGETHER (both leads side by side
// and a heart): it goes to scenes/together.js.
//
// PICTURE LOCK: a reader whose save has `lock` set must tap his three
// pictures (scenes/lock.js, shown as an overlay here so it never depends on
// a route) before his card opens. A prereader is never locked.
//
// The small gear in the corner is for grown-ups: it only opens after a
// 2-second hold, and it is the ONLY place a profile (reader/prereader)
// can change, or a picture lock be set or cleared. Mute lives there too.
// ============================================================

import { h, clear } from '../ui/h.js';
import { spriteImg } from '../ui/sprite.js';
import { sfx, isMuted, toggleMute } from '../audio/audio.js';
import { stageId } from './garden-logic.js';
import { openLock } from './lock.js';

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
  const together = h('button', {
    class: 'who-together', type: 'button',
    attrs: { 'aria-label': 'PLAY TOGETHER' },
    on: { click: () => { play('tap'); ctx.go('together'); } },
  });
  const scene = h('div', { class: 'who' }, title, cards, together, gear);
  let closeLock = null;
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
    clear(together).append(
      h('span', { class: 'who-tg-pics', attrs: { 'aria-hidden': 'true' } },
        smallLead(store.save.players[1]),
        h('span', { class: 'who-tg-heart' }, '❤'),
        smallLead(store.save.players[2])),
      h('span', { class: 'who-tg-words' }, 'PLAY TOGETHER'));
  }

  function smallLead(p) {
    const lead = leadOf(p);
    return spriteImg(lead.id, { shiny: lead.shiny, class: 'who-tg-sprite' });
  }

  const locked = p => p.profile !== 'prereader' && !!(p.lock && Array.isArray(p.lock.pics) && p.lock.pics.length);

  function pick(n) {
    play('tap');
    const p0 = store.save.players[n];
    if (locked(p0)) {
      if (closeLock) return;
      closeLock = openLock(scene, {
        store, player: n,
        onOpen: () => { closeLock = null; enter(n); },
        onCancel: () => { closeLock = null; },
      });
      return;
    }
    enter(n);
  }

  function enter(n) {
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
  // A quick tap does nothing on purpose (the boys tap everything), but a
  // grown-up who taps needs to know why: show a small HOLD hint.
  let downAt = 0;
  const hint = h('span', { class: 'who-gear-hint', hidden: true, attrs: { 'aria-hidden': 'true' } }, 'HOLD ⚙');
  let hintT = null;
  const showHint = () => {
    hint.hidden = false;
    if (hintT) { clearTimeout(hintT); timers.delete(hintT); }
    hintT = setTimeout(() => { timers.delete(hintT); hintT = null; hint.hidden = true; }, 1600);
    timers.add(hintT);
  };
  scene.appendChild(hint);
  gear.addEventListener('pointerup', () => { if (downAt && performance.now() - downAt < 600) showHint(); downAt = 0; });
  const startHold = e => {
    e.preventDefault();
    cancelHold();
    downAt = performance.now();
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
                // A locked card's profile is part of the lock: flipping it to
                // LITTLE ONE would open the card, so a grown-up check first.
                guarded(n, () => {
                  const q = store.save.players[n];
                  q.profile = q.profile === 'prereader' ? 'reader' : 'prereader';
                  store.commit();
                  drawPanel();
                  drawCards();
                });
              }
            },
          }, pre ? '🌱 LITTLE ONE' : '📖 READER')));
        if (!pre) {
          rows.appendChild(h('div', { class: 'gu-row gu-lock-row', dataset: { player: n } },
            h('span', { class: 'gu-lock-now' },
              // Never show the combination here: the panel only needs a hold.
              h('span', { class: 'gu-lock-off' }, p.lock ? '🔒' : '🔓')),
            h('button', {
              class: 'btn gu-lock', type: 'button', dataset: { player: n },
              on: { click: () => { play('tap'); guarded(n, () => openLockPicker(n)); } },
            }, '🔒 SET PICTURE LOCK')));
        }
      }
      clear(muteBtn);
      muteBtn.append(isMuted() ? '🔇 SOUND OFF' : '🔊 SOUND ON');
    }
    // ---- grown-up check: changing or clearing a lock, or flipping a
    // locked card's profile, needs a sum a pre-reader can't do. The panel
    // itself only needs a hold, so it must not be a way past the lock.
    function guarded(n, fn) {
      const p = store.save.players[n];
      if (!(p && p.lock)) { fn(); return; }
      play('tap');
      const a = 3 + Math.floor(Math.random() * 7), b = 3 + Math.floor(Math.random() * 7);
      let typed = '';
      const shown = h('span', { class: 'gu-check-ans' }, '?');
      const draw = () => { clear(shown); shown.append(typed || '?'); };
      const key = d => h('button', {
        class: 'btn gu-check-key', type: 'button', dataset: { key: String(d) },
        on: {
          click: () => {
            play('tap');
            if (typed.length >= 2) typed = '';
            typed += String(d);
            draw();
            if (typed.length === String(a * b).length) {
              if (Number(typed) === a * b) { fn(); return; }
              typed = ''; draw();
            }
          }
        },
      }, String(d));
      clear(rows).append(
        h('div', { class: 'gu-lock-head' }, '🔒 GROWN-UPS'),
        h('div', { class: 'gu-check-q', dataset: { a: String(a), b: String(b) } }, a + ' × ' + b + ' = ', shown),
        h('div', { class: 'gu-check-keys' }, [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(key)),
        h('div', { class: 'gu-lock-actions' },
          h('button', { class: 'btn gu-lock-back', type: 'button', on: { click: () => { play('tap'); drawPanel(); } } }, '\u25C0\uFE0E BACK')));
    }

    // ---- SET PICTURE LOCK: a grown-up taps 3 pictures in order ----------
    function openLockPicker(n) {
      const p = store.save.players[n];
      const picks = [];
      const name = (p.name || '').trim() || 'PLAYER ' + n;
      const slots = h('div', { class: 'gu-lock-slots' });
      const saveBtn = h('button', {
        class: 'btn btn-go gu-lock-save', type: 'button', disabled: true,
        on: { click: () => { if (picks.length !== 3) return; play('tap'); store.setLock(n, picks.slice()); drawPanel(); drawCards(); } },
      }, 'SAVE');
      const grid = h('div', { class: 'gu-lock-grid' });
      const seen = new Set();
      const pool = [...(p.team || []), ...(p.caught || []), 1, 4, 7, 25, 133, 152, 155, 158, 39, 52, 54, 143]
        .filter(id => Number.isInteger(id) && id >= 1 && id <= 649 && !seen.has(id) && seen.add(id)).slice(0, 36);
      function drawSlots() {
        clear(slots);
        for (let i = 0; i < 3; i++) {
          slots.appendChild(h('span', { class: ['gu-lock-slot', { on: picks[i] != null }] },
            picks[i] != null ? spriteImg(picks[i], { class: 'gu-lock-sprite' }) : String(i + 1)));
        }
        saveBtn.disabled = picks.length !== 3;
      }
      for (const id of pool) {
        grid.appendChild(h('button', {
          class: 'gu-lock-pic', type: 'button', dataset: { id },
          on: { click: () => { if (picks.length >= 3) return; play('tap'); picks.push(id); drawSlots(); } },
        }, spriteImg(id, { class: 'gu-lock-sprite', lazy: true })));
      }
      drawSlots();
      clear(rows).append(
        h('div', { class: 'gu-lock-head' }, '🔒 ' + name.toUpperCase()),
        h('div', { class: 'gu-lock-help' }, 'TAP 3 PICTURES IN ORDER'),
        slots,
        grid,
        h('div', { class: 'gu-lock-actions' },
          h('button', { class: 'btn gu-lock-redo', type: 'button', on: { click: () => { play('tap'); picks.length = 0; drawSlots(); } } }, '⟲ REDO'),
          p.lock ? h('button', {
            class: 'btn btn-danger gu-lock-clear', type: 'button',
            on: { click: () => { play('tap'); store.setLock(n, null); drawPanel(); drawCards(); } },
          }, '🔓 NO LOCK') : null,
          saveBtn,
          h('button', { class: 'btn gu-lock-back', type: 'button', on: { click: () => { play('tap'); drawPanel(); } } }, '\u25C0\uFE0E BACK')));
    }

    drawPanel();

    // Close on a tap on the dark backdrop, but ONLY a tap that also STARTED
    // there. The panel opens while the grown-up's finger is still on the gear,
    // and lifting that finger lands a click on this backdrop; before v20.1.1
    // that click closed the panel the instant it opened.
    let downOnBackdrop = false;
    overlay = h('div', { class: 'overlay gu-overlay', on: {
      pointerdown: e => { downOnBackdrop = e.target === overlay; },
      click: e => { if (e.target === overlay && downOnBackdrop) closeGrownUps(); downOnBackdrop = false; },
    } },
      h('div', { class: 'panel gu-panel', attrs: { role: 'dialog', 'aria-label': 'GROWN-UPS' } },
        h('h2', { class: 'dialog-title' }, 'GROWN-UPS'),
        rows,
        // Batch 3: the grown-up's own game (Pro Rules rematches, seed codes).
        h('button', {
          class: 'btn gu-challenge', type: 'button',
          on: { click: () => { play('tap'); closeGrownUps(); ctx.go('challenge', { returnTo: 'who' }); } },
        }, "🏆 DAD'S CHALLENGE"),
        h('div', { class: 'dialog-actions' }, muteBtn, close),
        // The classic game stays one tap away until the cutover. Same site,
        // same saves: anything caught there shows up here on the next visit.
        h('a', { class: 'btn gu-classic', attrs: { href: '../classic/' } }, '📟 OLD POKÉDEX')));
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
    if (closeLock) { try { closeLock(); } catch (e) { /* ignore */ } closeLock = null; }
    closeGrownUps();
  };
}
