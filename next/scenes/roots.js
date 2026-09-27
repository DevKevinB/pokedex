// ============================================================
// SPROUT ROAD: THROUGH THE ROOTS (roots builder)
// ROADMAP 5.2 Thread B postgame. After the Champion chapter blooms, a door
// glows in the Venusaur Tree's roots on the Road. Behind it:
//
//   tunnel    a dark, cozy root tunnel: warm glowing mushrooms, fireflies,
//             calm music, and a rainbow light at the far end.
//   sanctums  FARAWAY LAND's eight legendary shrines (data/sanctums.js),
//             3x3 with the FOREST shrine (Celebi) growing in the middle
//             once every other legendary rests.
//   shrine    one shrine up close: a pedestal per legendary. A shadow on a
//             pedestal can be challenged; a coloured one is resting.
//
// Tapping a shadow plays a short reveal (silhouette -> colour, its cry, one
// soft glow: well under 3 flashes a second) and then a legendary battle:
//   ctx.go('battle', {enemyTeam:[{id, level}], wild:true, legendary:true,
//                     returnTo:'roots', onEnd:'sanctum:<key>'})
// A legendary never flees and there is no timer. Win or catch: it rests
// in its shrine for good (road.roots.sanctums[key]). Lose or run: it just
// waits. A resting legendary he beat but did not catch can be met again.
//
// Params: {} (the tunnel) | { view:'sanctums' } | back from battle:
//         { result, onEnd:'sanctum:<key>' }
// ============================================================

import { h, clear } from '../ui/h.js';
import { spriteImg, ITEM } from '../ui/sprite.js';
import { sfx, cry } from '../audio/audio.js';
import * as music from '../audio/music.js';
import { wait } from '../core/pace.js';
import { withBerries, settleBerries } from '../data/chapters.js';
import {
  SHRINES, FINALE, shrineByKey, legendByKey, doorOpen, rootsOpened, isResting, shrineDone, shrineCount,
  finaleOpen, progress, canChallenge, parseSanctumEnd, sanctumParams, applySanctumEnd, artBulbaId, inGrass
} from '../data/sanctums.js';

// Gifts waiting when we sent Gabe into a sanctum battle (the Road's trick):
// the difference on the way back is the berries he ate.
let sentGifts = -1;

const play = (name, ...a) => { try { if (sfx && typeof sfx[name] === 'function') sfx[name](...a); } catch (e) { /* a sound never breaks a scene */ } };
const hush = fn => { try { fn(); } catch (e) { /* never break a scene over a sound */ } };
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const hidden = { attrs: { 'aria-hidden': 'true' } };

export function mount(root, ctx) {
  const store = ctx.store;
  const params = ctx.params || {};
  const player = () => store.player();
  const pre = player().profile === 'prereader';
  const ac = new AbortController();
  let alive = true;
  let busy = false;

  // The door only exists after the Champion chapter blooms.
  if (!doorOpen(player())) {
    Promise.resolve().then(() => { if (alive) ctx.go('road'); });
    return () => { alive = false; };
  }

  // Stepping through opens the door for good (it never closes again).
  const firstVisit = !rootsOpened(player());
  hush(() => store.openRoots());

  // ---------------------------------------------------------- back from battle
  const backKey = parseSanctumEnd(params.onEnd);
  let celebrate = null;
  if (backKey) {
    const p = player();
    let dirty = false;
    if (!pre && sentGifts >= 0) {
      try { settleBerries(p, sentGifts, store.giftCount()); dirty = true; } catch (e) { /* the pouch self-clamps */ }
    }
    sentGifts = -1;
    const out = applySanctumEnd(p, params.onEnd, params.result);
    if (out) dirty = true;
    if (dirty) { try { store.commit(); } catch (e) { /* the store reports its own failures */ } }
    // battle.js already saved it (params.sanctumWon): the first-time reveal still plays.
    const sw = params.sanctumWon && typeof params.sanctumWon === 'object' && params.sanctumWon.key === backKey ? params.sanctumWon : {};
    celebrate = { key: backKey, result: params.result,
      fresh: !!((out && out.fresh) || (out && sw.fresh === true)), finale: !!((out && out.finale) || (out && sw.finale === true)) };
  }

  // ---------------------------------------------------------- skeleton
  const scene = h('div', { class: ['roots', pre && 'roots-pre'], dataset: { scene: 'roots' } });
  const ambient = h('div', { class: 'rt-ambient', ...hidden });
  const body = h('div', { class: 'rt-body' });
  const layer = h('div', { class: 'rt-layer', hidden: true });
  scene.append(ambient, body, layer);
  root.appendChild(scene);
  drawAmbient();

  let view = '';
  let openShrineKey = null;

  try { if (typeof music.playMusic === 'function' && (music.TRACK_NAMES || []).includes('rest')) music.playMusic('rest'); }
  catch (e) { /* music is a bonus */ }

  // Fireflies and roots behind every view.
  function drawAmbient() {
    clear(ambient);
    const roots = h('div', { class: 'rt-roots' });
    for (let k = 0; k < 7; k++) roots.append(h('span', { class: 'rt-root r' + k }));
    const flies = h('div', { class: 'rt-flies' });
    for (let k = 0; k < 12; k++) {
      flies.append(h('span', {
        class: 'rt-fly',
        style: {
          left: ((k * 37 + 11) % 92 + 4) + '%', top: ((k * 53 + 7) % 80 + 8) + '%',
          '--d': (5 + (k % 4) * 1.3) + 's', '--delay': (-(k * 0.9)) + 's',
          '--dx': ((k % 2 ? 1 : -1) * (14 + (k % 3) * 8)) + 'px', '--dy': (-(10 + (k % 5) * 7)) + 'px'
        }
      }));
    }
    ambient.append(roots, flies);
  }

  function backBtn(onClick, label = 'BACK') {
    return h('button', {
      class: 'rt-back', type: 'button', attrs: { 'aria-label': label },
      on: { click: () => { if (busy) return; play('tap'); onClick(); } }
    }, '◀︎');
  }

  function leadId() {
    const p = player();
    const t = Array.isArray(p.team) ? p.team : [];
    return Number(t[0]) || (Array.isArray(p.caught) && Number(p.caught[0])) || 1;
  }

  // ---------------------------------------------------------- the tunnel
  function renderTunnel() {
    view = 'tunnel';
    closeLayer();
    clear(body);
    scene.dataset.view = 'tunnel';
    const shrooms = h('div', { class: 'rt-shrooms', ...hidden });
    const spots = [[8, 78, 1], [20, 88, 0], [74, 82, 1], [88, 72, 0], [14, 58, 0], [84, 52, 1], [30, 94, 1], [64, 92, 0]];
    spots.forEach(([x, y, big], k) => shrooms.append(h('span', {
      class: ['rt-shroom', big ? 'big' : 'small'], style: { left: x + '%', top: y + '%', '--delay': (k * 0.7) + 's' }
    }, h('span', { class: 'rt-cap' }), h('span', { class: 'rt-stem' }))));
    const walker = spriteImg(leadId(), { class: 'rt-walker' });
    const go = h('button', {
      class: 'rt-light', type: 'button', attrs: { 'aria-label': 'FARAWAY LAND' },
      on: { click: walkThrough }
    },
    h('span', { class: 'rt-light-glow', ...hidden }),
    h('span', { class: 'rt-light-emoji', ...hidden }, '\u{1F308}'),
    pre ? null : h('span', { class: 'rt-light-words' }, 'FARAWAY LAND'),
    h('span', { class: 'rt-light-go', ...hidden }, '▶︎'));
    body.append(
      h('div', { class: 'rt-top' },
        backBtn(() => ctx.go('road')),
        h('div', { class: 'rt-title' }, h('span', { class: 'rt-title-emoji', ...hidden }, '\u{1F333}'), pre ? null : 'THE ROOTS')),
      h('div', { class: 'rt-tunnel' }, shrooms, go, h('div', { class: 'rt-walk' }, walker)));
    if (firstVisit) { play('bloom'); go.classList.add('is-new'); }
  }

  async function walkThrough() {
    if (busy || !alive) return;
    busy = true;
    play('tap');
    scene.classList.add('is-walking');
    await wait(reduceMotion() ? 200 : 900, { signal: ac.signal });
    scene.classList.remove('is-walking');
    busy = false;
    if (!alive) return;
    renderSanctums();
  }

  // ---------------------------------------------------------- the sanctums
  function renderSanctums() {
    view = 'sanctums';
    clear(body);
    scene.dataset.view = 'sanctums';
    const p = player();
    const pr = progress(p);
    const grass = h('button', {
      class: 'rt-grass', type: 'button', attrs: { 'aria-label': 'TALL GRASS' },
      on: { click: () => { if (busy) return; play('tap'); ctx.go('wild', { place: 'faraway', home: 'roots' }); } }
    }, h('span', { class: 'rt-grass-emoji', ...hidden }, '\u{1F33F}'));
    const grid = h('div', { class: 'rt-grid' });
    const slots = [...SHRINES.slice(0, 4), 'middle', ...SHRINES.slice(4)];
    for (const s of slots) grid.append(s === 'middle' ? middleSlot() : shrineCard(s));
    body.append(
      h('div', { class: 'rt-top' },
        backBtn(() => ctx.go('road')),
        h('div', { class: 'rt-title' }, h('span', { class: 'rt-title-emoji', ...hidden }, '\u{1F308}'), pre ? null : 'FARAWAY LAND'),
        pre ? null : h('span', { class: 'rt-count', attrs: { 'aria-label': pr.resting + ' / ' + pr.total } }, pr.resting + '/' + pr.total),
        grass),
      grid);
  }

  function silhouette(m, resting, cls = '') {
    return spriteImg(m.id, { class: ['rt-mon', cls, resting ? 'is-resting' : 'is-shadow'] });
  }

  function shrineCard(s) {
    const p = player();
    const done = shrineDone(p, s);
    const n = shrineCount(p, s);
    const card = h('button', {
      class: ['rt-shrine', done && 'is-done', 'n' + s.mons.length], type: 'button',
      dataset: { shrine: s.key }, attrs: { 'aria-label': s.name },
      style: { '--a': s.palette.a, '--b': s.palette.b },
      on: { click: () => { if (busy) return; play('tap'); openShrine(s.key); } }
    },
    h('span', { class: 'rt-shrine-emoji', ...hidden }, s.emoji),
    pre ? null : h('span', { class: 'rt-shrine-name' }, s.name.replace(' SHRINE', '')),
    h('span', { class: 'rt-shrine-mons', ...hidden }, s.mons.map(m => silhouette(m, isResting(p, m.key)))),
    h('span', { class: 'rt-pips', ...hidden }, s.mons.map((m, k) => h('span', { class: ['rt-pip', k < n && 'is-full'] }))),
    done ? h('span', { class: 'rt-shrine-star', ...hidden }, '★') : null);
    return card;
  }

  // The middle of the grid: a quiet knot of roots until every other
  // legendary rests; then the FOREST shrine grows there.
  function middleSlot() {
    const p = player();
    if (!finaleOpen(p)) return h('div', { class: 'rt-knot', ...hidden }, h('span', { class: 'rt-knot-seed' }));
    const done = shrineDone(p, FINALE);
    const bulba = artBulbaId(store.save, store.current);
    return h('button', {
      class: ['rt-shrine', 'rt-finale', done && 'is-done', celebrate && celebrate.finale && 'is-new'], type: 'button',
      dataset: { shrine: FINALE.key }, attrs: { 'aria-label': FINALE.name },
      style: { '--a': FINALE.palette.a, '--b': FINALE.palette.b },
      on: { click: () => { if (busy) return; play('tap'); openShrine(FINALE.key); } }
    },
    h('span', { class: 'rt-shrine-emoji', ...hidden }, FINALE.emoji),
    pre ? null : h('span', { class: 'rt-shrine-name' }, FINALE.name.replace(' SHRINE', '')),
    h('span', { class: 'rt-shrine-mons', ...hidden },
      silhouette(FINALE.mons[0], done),
      spriteImg(bulba, { class: 'rt-mon rt-bulba' })),
    done ? h('span', { class: 'rt-shrine-star', ...hidden }, '★') : null);
  }

  // ---------------------------------------------------------- one shrine
  function openShrine(key, just = null) {
    const s = shrineByKey(key);
    if (!s) return;
    if (s.finale && !finaleOpen(player())) return;
    openShrineKey = key;
    const p = player();
    clear(layer);
    layer.className = 'rt-layer rt-shrine-view' + (s.finale ? ' is-finale' : '');
    layer.style.setProperty('--a', s.palette.a);
    layer.style.setProperty('--b', s.palette.b);
    const peds = h('div', { class: ['rt-peds', 'n' + s.mons.length] });
    s.mons.forEach(m => peds.append(pedestal(p, s, m, just === m.key)));
    if (s.finale) {
      // Celebi with Art's Bulba: the forest guardian and his partner, together.
      const bulba = artBulbaId(store.save, store.current);
      peds.append(h('div', { class: ['rt-friend', shrineDone(p, s) && 'is-together'], ...hidden },
        h('span', { class: 'rt-friend-heart' }, '\u{1F343}'),
        spriteImg(bulba, { class: 'rt-friend-sprite' }),
        h('span', { class: 'rt-ped-stone' }),
        // spacers so his stone lines up with Celebi's (LV + name below it)
        h('span', { class: 'rt-ped-lv rt-spacer' }, 'LV'),
        pre ? null : h('span', { class: 'rt-ped-name rt-spacer' }, 'A')));
    }
    layer.append(h('div', { class: 'rt-shrine-panel', attrs: { role: 'dialog', 'aria-label': s.name } },
      h('div', { class: 'rt-top' },
        backBtn(closeLayer),
        h('div', { class: 'rt-title' }, h('span', { class: 'rt-title-emoji', ...hidden }, s.emoji), pre ? null : s.name)),
      peds));
    layer.hidden = false;
    scene.classList.add('layer-open');
  }

  function pedestal(p, s, m, justRested) {
    const resting = isResting(p, m.key);
    const caught = Array.isArray(p.caught) && p.caught.includes(m.id);
    const again = resting && !caught;          // beaten, not caught: he may meet it again
    const btn = h('button', {
      class: ['rt-ped', resting ? 'is-resting' : 'is-waiting', caught && 'is-caught', again && 'is-again', justRested && 'just-rested'],
      type: 'button', dataset: { legend: m.key },
      attrs: { 'aria-label': resting ? m.name : '???' },
      on: { click: () => onPedestal(m.key) }
    },
    silhouette(m, resting, 'rt-ped-sprite'),
    resting ? h('span', { class: 'rt-zzz', ...hidden }, 'z') : null,
    h('span', { class: 'rt-ped-stone', ...hidden }),
    h('span', { class: 'rt-ped-lv' }, 'LV ' + s.level),
    pre ? null : h('span', { class: 'rt-ped-name' }, resting ? m.name : '???'),
    caught ? h('img', { class: 'rt-ped-ball', src: ITEM('poke-ball'), attrs: { alt: '' } }) : null,
    !resting || again ? h('span', { class: 'rt-ped-go', ...hidden }, '▶︎') : null);
    return btn;
  }

  function onPedestal(key) {
    if (busy || !alive) return;
    const p = player();
    const l = legendByKey(key);
    if (!l) return;
    const caught = Array.isArray(p.caught) && p.caught.includes(l.id);
    if (isResting(p, key) && caught) {
      // Resting and his: a sleepy hello, nothing else.
      play('tap');
      hush(() => cry(l.id));
      const n = layer.querySelector('.rt-ped[data-legend="' + key + '"]');
      if (n) { n.classList.remove('hello'); void n.offsetWidth; n.classList.add('hello'); }
      return;
    }
    if (!canChallenge(p, key)) return;
    reveal(key);
  }

  function closeLayer() {
    openShrineKey = null;
    layer.hidden = true;
    clear(layer);
    scene.classList.remove('layer-open');
  }

  // ---------------------------------------------------------- the reveal
  // Silhouette -> colour, its cry, one soft glow. Then the battle.
  async function reveal(key) {
    const l = legendByKey(key);
    const s = shrineByKey(l.shrine);
    busy = true;
    play('tap');
    const sprite = spriteImg(l.id, { class: 'rt-reveal-sprite' });
    const box = h('div', { class: 'rt-reveal', style: { '--a': s.palette.a, '--b': s.palette.b }, attrs: { role: 'dialog', 'aria-label': l.name } },
      h('span', { class: 'rt-reveal-ring', ...hidden }),
      sprite,
      pre ? null : h('div', { class: 'rt-reveal-name' }, l.name),
      h('div', { class: 'rt-reveal-lv' }, 'LV ' + l.level));
    scene.append(box);
    await wait(700, { signal: ac.signal });
    if (!alive) return;
    box.classList.add('is-lit');
    play('phase2');
    hush(() => cry(l.id));
    await wait(1500, { signal: ac.signal });
    if (!alive) return;
    goBattle(key);
  }

  function goBattle(key) {
    const bp = sanctumParams(key);
    if (!bp) { busy = false; return; }
    const out = pre ? bp : withBerries(player(), store.giftCount(), bp);
    sentGifts = pre ? -1 : store.giftCount();
    ctx.go('battle', out);
  }

  // ---------------------------------------------------------- celebrations
  async function welcomeBack(c) {
    const l = legendByKey(c.key);
    renderSanctums();
    openShrine(l.shrine, c.fresh ? c.key : null);
    if (!c.fresh) return;
    busy = true;
    play('win');
    await wait(1600, { signal: ac.signal });
    busy = false;
    if (!alive) return;
    if (c.key === FINALE.mons[0].key) { await forestFinale(); return; }
    if (c.finale) {
      // Every legendary rests: the forest shrine grows in the middle.
      closeLayer();
      renderSanctums();
      play('bloom');
      const mid = body.querySelector('.rt-finale');
      if (mid) mid.classList.add('is-new');
    }
  }

  // Celebi and Art's Bulba, together in the forest shrine.
  async function forestFinale() {
    if (!alive) return;
    busy = true;
    const bulba = artBulbaId(store.save, store.current);
    const leaves = h('div', { class: 'rt-leaves', ...hidden });
    if (!reduceMotion()) {
      for (let k = 0; k < 16; k++) {
        leaves.append(h('span', { class: 'rt-leaf', style: { left: ((k * 29 + 5) % 94 + 3) + '%', '--delay': (k * 0.35) + 's', '--d': (4 + (k % 3)) + 's' } }, '\u{1F343}'));
      }
    }
    const ok = h('button', {
      class: 'rt-ok', type: 'button', attrs: { 'aria-label': 'OK' },
      on: { click: () => { if (!alive) return; play('tap'); card.remove(); busy = false; renderSanctums(); openShrine(FINALE.key); } }
    }, '▶︎');
    const card = h('div', { class: 'rt-forest', attrs: { role: 'dialog', 'aria-label': FINALE.name } },
      leaves,
      h('div', { class: 'rt-forest-pair' },
        spriteImg(FINALE.mons[0].id, { class: 'rt-forest-celebi', animated: true }),
        h('span', { class: 'rt-forest-heart', ...hidden }, '\u{1F49A}'),
        spriteImg(bulba, { class: 'rt-forest-bulba', animated: true })),
      pre ? null : h('div', { class: 'rt-forest-words' }, 'FOREST FRIENDS!'),
      ok);
    scene.append(card);
    play('evolve');
    hush(() => cry(FINALE.mons[0].id));
    await wait(900, { signal: ac.signal });
    if (!alive) return;
    hush(() => cry(bulba));
  }

  // ---------------------------------------------------------- go
  if (celebrate) {
    welcomeBack(celebrate);
  } else if (params.view === 'sanctums') {
    renderSanctums();
  } else {
    renderTunnel();
  }

  // Test hook, like window.__road.
  const debug = () => {
    const p = player();
    return {
      scene: 'roots', view, shrine: openShrineKey, busy, opened: rootsOpened(p), finale: finaleOpen(p),
      progress: progress(p), resting: Object.keys((p.road && p.road.roots && p.road.roots.sanctums) || {}),
      inGrass: SHRINES.flatMap(s => s.mons).filter(m => inGrass(m.id)).map(m => m.key)
    };
  };
  try { window.__roots = debug; } catch (e) { /* not a browser */ }

  return function unmount() {
    alive = false;
    ac.abort();
    try { if (typeof music.stopMusic === 'function') music.stopMusic(); } catch (e) { /* ignore */ }
    try { if (window.__roots === debug) delete window.__roots; } catch (e) { /* ignore */ }
    scene.remove();
  };
}
