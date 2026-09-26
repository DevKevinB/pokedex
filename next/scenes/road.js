// ============================================================
// SPROUT ROAD: GABE'S VERDANT ROAD
// A vertical winding road of 12 chapters climbing toward the
// Venusaur Tree. Cleared regions are back in colour, the current
// one pulses, the next two are grey silhouettes, the rest is fog.
// One big NEXT BATTLE button always goes straight to the fight.
// Progression rules live (pure, unit-tested) in data/chapters.js.
// ============================================================

import { h, svg, clear } from '../ui/h.js';
import { spriteImg } from '../ui/sprite.js';
import { sfx } from '../audio/audio.js';
import * as music from '../audio/music.js';
import { wait } from '../core/pace.js';
import {
  CHAPTERS, leaderIdx, isCleared, isChapterDone, isTrainerOpen, currentChapter,
  nextTrainer, chapterView, battleParams, applyWin, trainerLevel
} from '../data/chapters.js';

const N = CHAPTERS.length;
const STEP = 150;          // px between chapter stops
const TOP = 260;           // room above the last stop: horizon + fog
const BOTTOM = 230;        // room below the first stop
const WORLD_H = TOP + (N - 1) * STEP + BOTTOM;
// Hand-placed x positions (% of width) for a road that winds without
// ever putting a stop under the edge of a phone screen.
const XS = [50, 70, 64, 36, 27, 42, 68, 73, 55, 31, 38, 52];
const nodeY = i => TOP + (N - 1 - i) * STEP;
const TREE_ID = 3;         // Venusaur
const BULBA_ID = 1;

const play = name => { try { if (sfx && typeof sfx[name] === 'function') sfx[name](); } catch (e) { /* never break a scene over a sound */ } };
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function mount(root, ctx) {
  const store = ctx.store;
  const params = ctx.params || {};
  const player = () => store.player();
  const ac = new AbortController();
  let alive = true;

  // --- a Road win coming back from battle ------------------------------
  let outcome = null;
  if (params.result === 'win' && params.onEnd) {
    outcome = applyWin(player(), params.onEnd);
    if (outcome) { try { store.commit(); } catch (e) { console.warn('road: commit failed', e); } }
  }
  let blooming = outcome && outcome.bloom ? outcome.i : -1;

  // --- skeleton ---------------------------------------------------------
  // A prereader may peek at the Road from his garden's signpost: same map,
  // but pictures only (words hidden here and by .road-pre in style.css).
  const pre = player().profile === 'prereader';
  const scene = h('div', { class: ['road', pre && 'road-pre'], dataset: { scene: 'road' } });
  const tree = spriteImg(TREE_ID, { class: 'road-tree' });
  const horizon = h('div', { class: 'road-horizon', attrs: { 'aria-hidden': 'true' } }, tree);
  const world = h('div', { class: 'road-world', style: { height: WORLD_H + 'px' } });
  const scroller = h('div', { class: 'road-scroll' }, world);
  const title = h('div', { class: 'road-title' });
  const homeBtn = h('button', {
    class: 'road-home', type: 'button', attrs: { 'aria-label': 'HOME' },
    on: { click: () => { play('tap'); ctx.go('who'); } }
  }, '⌂');
  const topbar = h('div', { class: 'road-top' }, homeBtn, title);
  const nextBtn = h('button', { class: 'road-next', type: 'button', on: { click: onNext } });
  const bottombar = h('div', { class: 'road-bottom' }, nextBtn);
  const chapterLayer = h('div', { class: 'road-chapter', hidden: true });
  scene.append(horizon, scroller, topbar, chapterLayer, bottombar);
  root.appendChild(scene);

  function refreshChrome() {
    const p = player();
    const cur = blooming >= 0 ? blooming : currentChapter(p);
    const done = cur >= N;
    tree.classList.toggle('tree-alive', done && blooming !== N - 1);
    clear(title);
    const ch = CHAPTERS[Math.min(cur, N - 1)];
    title.append(h('span', { class: 'road-title-emoji' }, done ? '🏆' : ch.emoji));
    if (!pre) title.append(done ? 'THE TREE IS SAVED!' : ch.region);
    clear(nextBtn);
    if (nextTrainer(p)) {
      nextBtn.append(h('span', { class: 'road-next-label' }, pre ? '⚔️ \u25B6\uFE0E' : 'NEXT BATTLE \u25B6\uFE0E'));
      nextBtn.classList.remove('is-done');
    } else {
      nextBtn.append(h('span', { class: 'road-next-label' }, pre ? '🏆 \u25B6\uFE0E' : '🏆 REMATCH \u25B6\uFE0E'));
      nextBtn.classList.add('is-done');
    }
  }

  function onNext() {
    play('tap');
    const nt = nextTrainer(player());
    if (nt) ctx.go('battle', battleParams(nt.i, nt.j));
    else openChapter(N - 1);
  }

  // --- the map -----------------------------------------------------------
  function drawWorld() {
    clear(world);
    const p = player();
    // While a bloom plays, the map still shows the moment BEFORE the win:
    // the blooming chapter is the dry current one and the next ones wait as
    // silhouettes, so the redraw afterwards reveals the new current chapter.
    const cur = blooming >= 0 ? blooming : currentChapter(p);
    const view = i => {
      if (blooming < 0) return chapterView(p, i);
      if (i < blooming) return 'done';
      if (i === blooming) return 'current';
      return i <= blooming + 2 ? 'soon' : 'fog';
    };

    const map = svg('svg', {
      class: 'road-svg',
      attrs: { viewBox: `0 0 100 ${WORLD_H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' }
    });
    // Start stub from the bottom edge to the first stop.
    const x0 = XS[0], y0 = nodeY(0);
    map.append(svg('path', {
      class: 'road-seg seg-done',
      attrs: { d: `M ${x0} ${WORLD_H} L ${x0} ${y0}` }
    }));
    for (let i = 0; i < N - 1; i++) {
      const v2 = view(i + 1);
      if (v2 === 'fog') break;
      const xa = XS[i], ya = nodeY(i), xb = XS[i + 1], yb = nodeY(i + 1), ym = (ya + yb) / 2;
      const walked = view(i) === 'done' && v2 !== 'soon';
      map.append(svg('path', {
        class: ['road-seg', walked ? 'seg-done' : 'seg-ahead'],
        attrs: { d: `M ${xa} ${ya} C ${xa} ${ym}, ${xb} ${ym}, ${xb} ${yb}` }
      }));
    }
    world.append(map);

    for (let i = 0; i < N; i++) {
      const v = view(i);
      if (v === 'fog') continue;
      world.append(regionPatch(i, v), ...chapterNode(i, v, i === cur && i !== blooming));
    }

    // Fog over everything beyond the next two chapters.
    const frontier = Math.min(cur + 2, N - 1);
    if (frontier < N - 1) {
      const fogBottom = nodeY(frontier) - STEP * 0.45;
      world.append(h('div', {
        class: 'road-fog', attrs: { 'aria-hidden': 'true' },
        style: { height: Math.max(0, fogBottom) + 'px' }
      }, h('div', { class: 'fog-cloud c1' }), h('div', { class: 'fog-cloud c2' }), h('div', { class: 'fog-cloud c3' })));
    }
  }

  function placed(i, extra = {}) {
    return { left: XS[i] + '%', top: nodeY(i) + 'px', ...extra };
  }

  function paletteVars(ch) {
    return { '--ground': ch.palette.ground, '--sky': ch.palette.sky, '--accent': ch.palette.accent };
  }

  function regionPatch(i, v) {
    const ch = CHAPTERS[i];
    const patch = h('div', {
      class: ['road-region', 'is-' + v],
      dataset: { chapter: i },
      attrs: { 'aria-hidden': 'true' },
      style: { ...placed(i), ...paletteVars(ch) }
    });
    const dry = h('div', { class: 'region-dry' });
    const lush = h('div', { class: 'region-lush' });
    patch.append(dry, lush);
    if (v === 'done' || i === blooming) {
      // The chapter's Pokemon, home again.
      const lead = ch.trainers[leaderIdx(i)].team;
      const ids = [lead[0].id, lead[lead.length - 1].id];
      ids.forEach((id, k) => lush.append(spriteImg(id, { class: ['region-mon', 'm' + k], lazy: true })));
    }
    return patch;
  }

  function chapterNode(i, v, isCurrent) {
    const ch = CHAPTERS[i];
    const btn = h('button', {
      class: ['road-node', 'is-' + v, isCurrent && 'is-current'],
      type: 'button',
      dataset: { chapter: i },
      attrs: { 'aria-label': v === 'soon' ? 'LOCKED' : ch.region },
      style: { ...placed(i), ...paletteVars(ch) },
      on: { click: () => onNode(i, v) }
    }, h('span', { class: 'node-emoji' }, ch.emoji));
    if (v === 'done') btn.append(h('span', { class: 'node-tick' }, '★'));
    const wrap = [btn];
    if (v === 'current') {
      wrap.push(h('div', { class: 'road-label is-current', style: placed(i) },
        h('div', { class: 'label-name' }, ch.region),
        i === blooming ? null : h('div', { class: 'label-drought' }, ch.drought)));
    } else if (v === 'done') {
      wrap.push(h('div', { class: 'road-label is-done', style: placed(i) },
        h('div', { class: 'label-name' }, ch.region)));
    }
    return wrap;
  }

  function onNode(i, v) {
    if (v === 'soon') {
      play('tap');
      const n = world.querySelector(`.road-node[data-chapter="${i}"]`);
      if (n) { n.classList.remove('nope'); void n.offsetWidth; n.classList.add('nope'); }
      return;
    }
    play('tap');
    openChapter(i);
  }

  function scrollToChapter(i, smooth) {
    const target = nodeY(Math.min(i, N - 1)) - scroller.clientHeight * 0.55;
    const top = Math.max(0, Math.min(WORLD_H - scroller.clientHeight, target));
    try { scroller.scrollTo({ top, behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' }); }
    catch (e) { scroller.scrollTop = top; }
  }

  // --- the chapter screen -------------------------------------------------
  let openIdx = -1;
  function openChapter(i, justWon = -1) {
    const p = player();
    const ch = CHAPTERS[i];
    openIdx = i;
    clear(chapterLayer);
    const done = isChapterDone(p, i);
    chapterLayer.className = 'road-chapter' + (done ? ' is-done' : ' is-dry');
    for (const [k, val] of Object.entries(paletteVars(ch))) chapterLayer.style.setProperty(k, val);

    const back = h('button', {
      class: 'chapter-back', type: 'button', attrs: { 'aria-label': 'BACK' },
      on: { click: () => { play('tap'); closeChapter(); } }
    }, '\u25C0\uFE0E');
    const head = h('div', { class: 'chapter-head' }, back,
      h('div', { class: 'chapter-titles' },
        h('div', { class: 'chapter-name' }, h('span', { class: 'chapter-emoji' }, ch.emoji), pre ? null : ch.region),
        h('div', { class: 'chapter-sub' }, done ? 'BACK IN BLOOM!' : ch.drought)));

    const path = h('div', { class: 'chapter-path' });
    const L = leaderIdx(i);
    for (let j = 0; j <= L; j++) path.append(trainerCard(p, i, j, L, j === justWon));
    chapterLayer.append(head, h('div', { class: 'chapter-scroll' }, path));
    chapterLayer.hidden = false;
    scene.classList.add('chapter-open');
  }

  function trainerCard(p, i, j, L, justWon) {
    const t = CHAPTERS[i].trainers[j];
    const beaten = isCleared(p, i, j);
    const open = isTrainerOpen(p, i, j);
    const leader = j === L;
    const nt = nextTrainer(p);
    const isNext = !!nt && nt.i === i && nt.j === j;
    const card = h('button', {
      class: ['trainer-card', leader && 'is-leader', beaten && 'is-beaten', !open && 'is-locked',
        isNext && 'is-next', justWon && 'just-won', j % 2 ? 'side-r' : 'side-l'],
      type: 'button',
      disabled: !open,
      dataset: { trainer: j },
      on: { click: () => { if (!open) return; play('tap'); ctx.go('battle', battleParams(i, j)); } }
    },
    leader ? h('span', { class: 'card-crown', attrs: { 'aria-hidden': 'true' } }, '👑') : null,
    h('span', { class: 'card-sprite' }, spriteImg(t.team[0].id, { class: !open ? 'is-shadow' : '' })),
    h('span', { class: 'card-text' },
      h('span', { class: 'card-name' }, t.name),
      h('span', { class: 'card-level' }, 'LV ' + trainerLevel(t))),
    beaten ? h('span', { class: 'card-tick', attrs: { 'aria-label': 'BEATEN' } }, '✓')
      : open ? h('span', { class: 'card-go', attrs: { 'aria-hidden': 'true' } }, '\u25B6\uFE0E') : null);
    return card;
  }

  function closeChapter() {
    openIdx = -1;
    chapterLayer.hidden = true;
    clear(chapterLayer);
    scene.classList.remove('chapter-open');
  }

  // --- the BLOOM ------------------------------------------------------------
  async function bloom(i) {
    const ch = CHAPTERS[i];
    scene.classList.add('is-blooming');
    const catcher = h('div', { class: 'bloom-catcher', attrs: { 'aria-hidden': 'true' } });
    scene.append(catcher);
    scrollToChapter(i, false);
    const patch = world.querySelector(`.road-region[data-chapter="${i}"]`);
    const node = world.querySelector(`.road-node[data-chapter="${i}"]`);
    await wait(400, { signal: ac.signal });
    if (!alive) return;

    play('bloom');
    if (patch) patch.classList.add('bloom-go');
    if (node) node.classList.add('bloom-go');
    if (i === N - 1) tree.classList.add('tree-bloom');
    const petals = h('div', { class: 'bloom-petals', style: placed(i) });
    if (!reduceMotion()) {
      const colours = [ch.palette.ground, ch.palette.accent, '#ff9ecb', '#fff4a8', '#8fe07a'];
      for (let k = 0; k < 22; k++) {
        const ang = (k / 22) * Math.PI * 2 + (k % 3) * 0.3;
        const dist = 90 + (k % 5) * 26;
        petals.append(h('span', {
          class: 'petal',
          style: {
            '--dx': Math.round(Math.cos(ang) * dist) + 'px',
            '--dy': Math.round(Math.sin(ang) * dist - 40) + 'px',
            '--rot': (k * 47 % 360) + 'deg',
            '--delay': (k % 6) * 90 + 'ms',
            '--petal': colours[k % colours.length]
          }
        }));
      }
    }
    world.append(petals);
    await wait(3000, { signal: ac.signal });
    if (!alive) return;

    // Land in the final state whether the sweep finished or was skipped.
    blooming = -1;
    drawWorld();          // redraws chapter i as 'done', petals and all swept away
    refreshChrome();
    const badge = h('div', { class: 'bloom-badge' },
      h('div', { class: 'bloom-badge-icon' }, ch.emoji),
      h('div', { class: 'bloom-badge-text' }, i === N - 1 ? 'THE TREE IS SAVED!' : 'BADGE WON!'));
    scene.append(badge);
    play('win');
    await wait(1800, { signal: ac.signal });
    if (!alive) return;
    ctx.go('rest', { chapter: i });
  }

  // --- go ---------------------------------------------------------------------
  try { if (typeof music.playMusic === 'function' && (music.TRACK_NAMES || []).includes('road')) music.playMusic('road'); }
  catch (e) { /* music is a bonus */ }
  refreshChrome();
  drawWorld();
  const cur = currentChapter(player());
  requestAnimationFrame(() => {
    if (!alive) return;
    if (blooming >= 0) { bloom(blooming); return; }
    scrollToChapter(outcome ? outcome.i : cur, false);
    if (outcome && !outcome.leader) openChapter(outcome.i, outcome.j);
  });

  // Test hook, in the spirit of window.__scene: what is on the map right now.
  const debug = () => ({
    scene: 'road', current: currentChapter(player()), next: nextTrainer(player()), openChapter: openIdx,
    views: CHAPTERS.map((_, k) => chapterView(player(), k)), blooming
  });
  try { window.__road = debug; } catch (e) { /* not a browser */ }

  return function unmount() {
    alive = false;
    ac.abort();
    // The Road theme belongs to the Road: never leak it into a battle, WHO'S
    // PLAYING or Art's garden.
    try { if (typeof music.stopMusic === 'function') music.stopMusic(); } catch (e) { /* ignore */ }
    try { if (window.__road === debug) delete window.__road; } catch (e) { /* ignore */ }
    scene.remove();
  };
}
