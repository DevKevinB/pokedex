// ============================================================
// SPROUT ROAD: THE EGG. Gabe's third Old Venusaur seed hatches his
// OWN Bulbasaur. The egg wobbles three times, cracks, and Bulbasaur
// pops out with its cry and a leaf burst. One soft glow, no strobe
// (well under 3 flashes a second). Nothing moves on to the next
// thing until Gabe taps the big button.
//
// Scene contract: mount(root, ctx) -> unmount(). Works as a routed
// scene (ctx.go('hatch')) and as an overlay inside the Road, which
// hands it a ctx whose go() just closes the overlay.
//
// The save changes happen FIRST (applyHatch + commit), so closing the
// app mid-ceremony can never lose the Bulbasaur.
// ============================================================

import { h } from '../ui/h.js';
import { spriteImg } from '../ui/sprite.js';
import { sfx, cry } from '../audio/audio.js';
import { wait } from '../core/pace.js';
import { applyHatch, readyToHatch, isHatched, HATCH_ID, HATCH_LEVEL } from '../data/chapters.js';

const play = (name, ...a) => { try { if (sfx && typeof sfx[name] === 'function') sfx[name](...a); } catch (e) { /* never break over a sound */ } };
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function mount(root, ctx) {
  const store = ctx.store;
  const p = store.player();
  const pre = p.profile === 'prereader';
  const ac = new AbortController();
  let alive = true;

  // The egg is earned: three Old Venusaur seeds. Arriving here any other way
  // (a stale link, a test hook, a double navigation) hatches nothing.
  if (!readyToHatch(p) && !isHatched(p)) {
    queueMicrotask(() => ctx.go('road'));
    return () => { alive = false; ac.abort(); };
  }

  const res = applyHatch(p);
  if (!res.already) { try { store.commit(); } catch (e) { console.warn('hatch: commit failed', e); } }
  const shiny = !!res.shiny;

  // --- the stage ----------------------------------------------------------
  const glow = h('div', { class: 'hatch-glow', attrs: { 'aria-hidden': 'true' } });
  const egg = h('div', { class: 'hatch-egg', attrs: { 'aria-hidden': 'true' } },
    h('span', { class: 'egg-spot s1' }), h('span', { class: 'egg-spot s2' }), h('span', { class: 'egg-spot s3' }),
    h('span', { class: 'egg-crack' }),
    h('span', { class: 'egg-half top' }), h('span', { class: 'egg-half bottom' }));
  const mon = h('div', { class: ['hatch-mon', shiny && 'is-shiny'] },
    spriteImg(HATCH_ID, { animated: true, shiny, class: 'hatch-sprite' }));
  const leaves = h('div', { class: 'hatch-leaves', attrs: { 'aria-hidden': 'true' } });
  const nest = h('div', { class: 'hatch-nest', attrs: { 'aria-hidden': 'true' } });
  const stage = h('div', { class: 'hatch-stage' }, glow, nest, egg, mon, leaves);

  const caption = h('div', { class: 'hatch-caption', hidden: true });
  const okBtn = h('button', {
    class: 'hatch-ok', type: 'button', hidden: true, attrs: { 'aria-label': 'OK' },
    on: { click: () => { play('tap'); done(); } }
  }, pre ? '▶︎' : 'YAY! ▶︎');

  const scene = h('div', { class: ['hatch', pre && 'hatch-pre', shiny && 'hatch-shiny'], dataset: { scene: 'hatch', phase: 'egg' } },
    h('div', { class: 'hatch-seeds', attrs: { 'aria-hidden': 'true' } },
      h('span', { class: 'seed-pip is-full' }), h('span', { class: 'seed-pip is-full' }), h('span', { class: 'seed-pip is-full' })),
    stage, caption, okBtn);
  root.appendChild(scene);

  let finished = false;
  function done() {
    if (finished) return;
    finished = true;
    ctx.go('road', { hatched: true });
  }

  const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  const phase = s => { scene.dataset.phase = s; };

  function burst() {
    if (reduceMotion()) return;
    const colours = ['#5cb85c', '#8fe07a', '#2e7d32', '#b8f28a'];
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2;
      const dist = 80 + (k % 4) * 22;
      leaves.append(h('span', {
        class: 'hatch-leaf',
        style: {
          '--dx': Math.round(Math.cos(ang) * dist) + 'px',
          '--dy': Math.round(Math.sin(ang) * dist - 30) + 'px',
          '--rot': (k * 53 % 360) + 'deg',
          '--delay': (k % 4) * 60 + 'ms',
          '--leaf': colours[k % colours.length]
        }
      }));
    }
  }

  async function run() {
    const sig = { signal: ac.signal };
    if (!res.already) {
      await wait(600, sig); if (!alive) return;
      for (let k = 0; k < 3; k++) {
        restart(egg, 'wobble');
        play('shake');
        await wait(750, sig); if (!alive) return;
      }
      phase('crack');
      egg.classList.add('cracked');
      play('crit');
      await wait(600, sig); if (!alive) return;
    }
    // Out it comes: one soft glow (the only flash in the ceremony).
    phase('out');
    egg.classList.add('open');
    glow.classList.add('go');
    mon.classList.add('out');
    burst();
    cry(HATCH_ID);
    play('caught');
    await wait(900, sig); if (!alive) return;

    phase('done');
    if (!pre) {
      caption.append(
        h('div', { class: 'hatch-title' }, shiny ? 'A SHINY BULBASAUR!' : 'BULBASAUR HATCHED!'),
        h('div', { class: 'hatch-sub' }, 'YOUR OWN PARTNER! LV ' + Math.max(HATCH_LEVEL, levelOf())));
      caption.hidden = false;
    }
    okBtn.hidden = false;
  }
  const levelOf = () => { const m = p.mons && p.mons[HATCH_ID]; return (m && m.level) || HATCH_LEVEL; };

  run();

  try { window.__hatch = () => ({ scene: 'hatch', phase: scene.dataset.phase, shiny, isNew: res.isNew }); } catch (e) { /* not a browser */ }

  return function unmount() {
    alive = false;
    ac.abort();
    try { delete window.__hatch; } catch (e) { /* ignore */ }
    scene.remove();
  };
}
