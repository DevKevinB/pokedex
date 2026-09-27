// ============================================================
// SPROUT ROAD: GABE'S VERDANT ROAD
// A vertical winding road of 12 chapters climbing toward the
// Venusaur Tree. Cleared regions are back in colour, the current
// one pulses, the next two are grey silhouettes, the rest is fog.
// One big NEXT BATTLE button always goes straight to the fight.
// Progression rules live (pure, unit-tested) in data/chapters.js.
// ============================================================

import { h, svg, clear } from '../ui/h.js';
import { spriteImg, ITEM } from '../ui/sprite.js';
import { sfx, cry } from '../audio/audio.js';
import * as music from '../audio/music.js';
import { wait } from '../core/pace.js';
import { getMon, cachedMon } from '../core/api.js';
import {
  CHAPTERS, leaderIdx, isCleared, isChapterDone, isTrainerOpen, currentChapter,
  nextTrainer, chapterView, battleParams, trainerLevel,
  GUARDIAN_ID, GUARDIAN_NAME, HATCH_SEEDS, hasGuardian, guardianBeaten, guardianLevel,
  guardianParams, seedCount, isHatched, readyToHatch,
  BERRY_KEY, berryCount, wrappedGifts, openGift, settleBerries, withBerries
} from '../data/chapters.js';
import {
  RIVAL_NAME, RIVAL_LOSE_LINES, rivalSpot, rivalParams, rivalTeam, rivalLine, roadReturn
} from '../data/rival.js';
import { leadOf } from './together.js';
// ==== round2 BEGIN (import) ====
import {
  R2_CHAMP, r2Unlocked, r2Trainers, r2Ace, r2Next, r2Current, isR2Cleared, isR2ChapterOpen,
  isR2ChapterDone, isR2TrainerOpen, r2BattleParams, gimmickFor, gimmickInfo, goldChapters, r2Return
} from '../data/round2.js';
// ==== round2 END (import) ====

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

// Gifts waiting when we sent Gabe into a battle. The battle takes one gift
// per berry eaten, so the difference on the way back is what he ate. Lives
// across the road -> battle -> road round trip (module state, not the save).
let sentGifts = -1;

const play = name => { try { if (sfx && typeof sfx[name] === 'function') sfx[name](); } catch (e) { /* never break a scene over a sound */ } };
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function mount(root, ctx) {
  const store = ctx.store;
  const params = ctx.params || {};
  const player = () => store.player();
  const ac = new AbortController();
  let alive = true;

  // --- a Road win coming back from battle ------------------------------
  let outcome = null, gOutcome = null, rOutcome = null, dirty = false;
  // battle.js already saved it (params.applied); roadReturn re-applies the
  // idempotent parts and rebuilds the celebration without double counting.
  if (params.onEnd && (params.result === 'win' || params.result === 'lose')) {
    ({ outcome, gOutcome, rOutcome } = roadReturn(player(), params.onEnd, params.result, params.applied));
    if (outcome || gOutcome || rOutcome) dirty = true;
  }
  // Berries eaten in that battle leave the pouch (the battle already took
  // their gifts). The pouch is also re-clamped to the gifts waiting.
  if (player().profile !== 'prereader') {
    const gifts = store.giftCount();
    const p = player();
    const was = p.items && p.items[BERRY_KEY];
    const now = settleBerries(p, sentGifts >= 0 ? sentGifts : gifts, gifts);
    if (was != null && was !== now) dirty = true;
  }
  sentGifts = -1;
  if (dirty) { try { store.commit(); } catch (e) { console.warn('road: commit failed', e); } }
  let blooming = outcome && outcome.bloom ? outcome.i : -1;

  // --- skeleton ---------------------------------------------------------
  // A prereader may peek at the Road from his garden's signpost: same map,
  // but pictures only (words hidden here and by .road-pre in style.css).
  // Gabe's story (guardians, seeds, the rival, Art's gifts) is for a reader.
  const pre = player().profile === 'prereader';
  const story = !pre;
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
  const pouch = h('div', { class: 'road-pouch', hidden: true });
  // Batch 3: his Pokédex and his team, one tap from the Road (pictures only:
  // a book, and his lead Pokemon's face).
  const dexBtn = h('button', {
    class: 'road-tool road-dex', type: 'button', attrs: { 'aria-label': 'POKÉDEX' },
    // A prereader's book is his Sticker Book: only what he caught, never a
    // wall of silhouettes.
    on: { click: () => { play('tap'); ctx.go(pre ? 'book' : 'dex', { returnTo: 'road' }); } }
  }, h('span', { class: 'road-tool-emoji', attrs: { 'aria-hidden': 'true' } }, '📖'));
  // His BULBA always leads a prereader's fights, so there is no team to edit.
  const teamBtn = h('button', {
    class: 'road-tool road-team', type: 'button', attrs: { 'aria-label': 'TEAM' }, hidden: pre,
    on: { click: () => { play('tap'); ctx.go('team', { returnTo: 'road' }); } }
  });
  const topbar = h('div', { class: 'road-top' }, homeBtn, title, pouch, dexBtn, teamBtn);
  const nextBtn = h('button', { class: 'road-next', type: 'button', on: { click: onNext } });
  const bottombar = h('div', { class: 'road-bottom' }, nextBtn);
  const chapterLayer = h('div', { class: 'road-chapter', hidden: true });
  const rivalLayer = h('div', { class: 'rival-layer', hidden: true });
  scene.append(horizon, scroller, topbar, chapterLayer, bottombar, rivalLayer);
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
    drawPouch();
    drawTeamBtn();
  }

  function drawTeamBtn() {
    const p = player();
    // A prereader's lead is his BULBA (battle.js puts him first).
    const lead = pre ? leadOf(p).id : ((Array.isArray(p.team) && p.team[0]) || (Array.isArray(p.caught) && p.caught[0]) || 0);
    const shiny = !pre && (p.shinies || []).includes(lead);
    clear(teamBtn);
    if (lead) teamBtn.append(spriteImg(lead, { class: 'road-tool-sprite', shiny }));
    else teamBtn.append(h('img', { class: 'road-tool-ball', src: ITEM('poke-ball'), attrs: { alt: '' } }));
  }

  // Seeds (and Oran Berries) in the header, as pictures plus a number.
  function drawPouch() {
    clear(pouch);
    if (!story) { pouch.hidden = true; return; }
    const p = player();
    const seeds = seedCount(p);
    const berries = berryCount(p, store.giftCount());
    if (!seeds && !berries && !isHatched(p)) { pouch.hidden = true; return; }
    pouch.hidden = false;
    const seedBox = h('span', { class: 'pouch-seeds', attrs: { 'aria-label': 'SEEDS ' + seeds } });
    if (seeds <= HATCH_SEEDS && !isHatched(p)) {
      for (let k = 0; k < HATCH_SEEDS; k++) seedBox.append(h('span', { class: ['seed-pip', k < seeds && 'is-full'] }));
    } else {
      seedBox.append(h('span', { class: 'seed-pip is-full' }), h('span', { class: 'pouch-num' }, '\u00D7' + seeds));
    }
    pouch.append(seedBox);
    if (berries) {
      pouch.append(h('span', { class: 'pouch-berries', attrs: { 'aria-label': 'BERRIES ' + berries } },
        h('img', { class: 'pouch-berry', src: ITEM('oran-berry'), attrs: { alt: '' } }),
        h('span', { class: 'pouch-num' }, '\u00D7' + berries)));
    }
  }

  // Every battle from the Road carries Gabe's berries (params.berries).
  function goBattle(bp) {
    const out = story ? withBerries(player(), store.giftCount(), bp) : bp;
    sentGifts = story ? store.giftCount() : -1;
    ctx.go('battle', out);
  }

  function onNext() {
    play('tap');
    const nt = nextTrainer(player());
    if (nt) goBattle(battleParams(nt.i, nt.j));
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

    const spot = story && blooming < 0 ? rivalSpot(p) : -1;
    for (let i = 0; i < N; i++) {
      const v = view(i);
      if (v === 'fog') continue;
      world.append(regionPatch(i, v), ...chapterNode(i, v, i === cur && i !== blooming, spot >= 0 && i === spot + 1));
    }
    if (story) {
      for (let i = 0; i < N; i++) {
        if (view(i) === 'done' && i !== blooming && hasGuardian(p, i)) world.append(guardianNode(i));
      }
      if (spot >= 0) world.append(rivalNode(spot));
      if (blooming < 0 && wrappedGifts(p, store.giftCount()) > 0) world.append(giftNode(Math.min(cur, N - 1)));
    }
    if (blooming < 0) { const door = rootsDoor(p); if (door) world.append(door); }   // roots: the Tree's door

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

  // ==== roots BEGIN ====
  // THROUGH THE ROOTS (scenes/roots.js): once the Champion chapter has
  // bloomed, a door glows in the Venusaur Tree's roots. Same rule as
  // data/sanctums.js doorOpen (FARAWAY LAND's). It rides in the scrolling
  // world, placed under the horizon Tree's roots as laid out at the top.
  function rootsDoor(p) {
    const road = (p && p.road) || {};
    const open = isChapterDone(p, N - 1) || !!p.champion
      || (Array.isArray(road.bloomed) && road.bloomed.includes(N - 1));
    if (!open) return null;
    const seen = !!(road.roots && road.roots.opened === true);
    const tw = tree.offsetWidth || 230;
    let y = Math.round(Math.max(120, Math.min(TOP + STEP * 1.5, (horizon.offsetTop || 22) + tw * 0.8)));
    if (Math.abs(y - nodeY(N - 1)) < 80) y = nodeY(N - 1) - 80;   // never on top of THE BIG TREE stop
    return h('button', {
      class: ['road-roots-door', seen ? 'is-seen' : 'is-new'], type: 'button',
      attrs: { 'aria-label': 'THE ROOTS' }, style: { top: y + 'px' },
      on: { click: () => { play('tap'); ctx.go('roots'); } }
    },
    h('span', { class: 'roots-door-glow', attrs: { 'aria-hidden': 'true' } }),
    h('span', { class: 'roots-door-arch', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'roots-door-light' })));
  }
  // ==== roots END ====

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

  function chapterNode(i, v, isCurrent, labelAbove) {
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
      wrap.push(h('div', { class: ['road-label', 'is-current', labelAbove && 'label-above'], style: placed(i) },
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

  // --- Gabe's story on the map: guardians, the rival, Art's gifts --------------
  // Beside a stop, on the side away from the middle of the road.
  const sideOf = i => (XS[i] >= 50 ? -1 : 1);
  const beside = (i, px, flip = false) => {
    const s = sideOf(i) * (flip ? -1 : 1);
    return 'calc(' + XS[i] + '% ' + (s < 0 ? '- ' : '+ ') + px + 'px)';
  };

  function guardianNode(i) {
    const ch = CHAPTERS[i];
    const beaten = guardianBeaten(player(), i);
    return h('button', {
      class: ['road-guardian', beaten ? 'is-beaten' : 'is-open'],
      type: 'button',
      dataset: { guardian: i },
      attrs: { 'aria-label': beaten ? GUARDIAN_NAME + ' ASLEEP' : GUARDIAN_NAME },
      style: { left: beside(i, 118), top: (nodeY(i) - 6) + 'px', ...paletteVars(ch) },
      on: { click: () => onGuardian(i) }
    },
    h('span', { class: 'guardian-moss', attrs: { 'aria-hidden': 'true' } }),
    spriteImg(GUARDIAN_ID, { class: 'guardian-sprite', lazy: true }),
    beaten
      ? h('span', { class: 'guardian-zzz', attrs: { 'aria-hidden': 'true' } }, 'Z')
      : h('span', { class: 'guardian-seed', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'seed-pip is-full' })),
    h('span', { class: 'guardian-lv' }, 'LV ' + guardianLevel(i)));
  }

  function onGuardian(i) {
    play('tap');
    if (guardianBeaten(player(), i)) {
      // Already won: he just rumbles hello. Nothing to take away, nothing to lose.
      try { cry(GUARDIAN_ID); } catch (e) { /* silent */ }
      const n = world.querySelector('.road-guardian[data-guardian="' + i + '"]');
      if (n) { n.classList.remove('hello'); void n.offsetWidth; n.classList.add('hello'); }
      return;
    }
    goBattle(guardianParams(i));
  }

  // The rival stands on the road between chapter i and i + 1.
  function rivalPos(i) {
    return { left: ((XS[i] + XS[i + 1]) / 2) + '%', top: ((nodeY(i) + nodeY(i + 1)) / 2 + 4) + 'px' };
  }

  // His lead's types decide the rival's team (he brings what beats it).
  let leadTypes = [];
  function leadId() {
    const p = player();
    const t = Array.isArray(p.team) ? p.team : [];
    return Number(t[0]) || 0;
  }
  function loadLeadTypes() {
    const id = leadId();
    if (!id) return;
    const c = cachedMon(id);
    if (c) { leadTypes = c.types || []; return; }
    getMon(id).then(m => {
      if (!alive || !m) return;
      leadTypes = m.types || [];
      if (!rivalLayer.hidden && rivalOpenAt >= 0) openRival(rivalOpenAt);
    }).catch(() => { /* the rival brings his default team */ });
  }

  function rivalNode(i) {
    const team = rivalTeam(player(), i, leadTypes);
    const ace = team[team.length - 1];
    return h('button', {
      class: 'road-rival', type: 'button', dataset: { rival: i },
      attrs: { 'aria-label': RIVAL_NAME },
      style: rivalPos(i),
      on: { click: () => { play('tap'); openRival(i); } }
    },
    h('span', { class: 'rival-face', attrs: { 'aria-hidden': 'true' } }, '\u{1F624}'),
    spriteImg(ace.id, { class: 'rival-ace', lazy: true }),
    h('span', { class: 'rival-bang', attrs: { 'aria-hidden': 'true' } }, '!'));
  }

  // The taunt: a picture of his team plus one short line. Fight or walk past.
  let rivalOpenAt = -1;
  function openRival(i) {
    rivalOpenAt = i;
    const team = rivalTeam(player(), i, leadTypes);
    clear(rivalLayer);
    const fight = h('button', {
      class: 'rival-fight', type: 'button',
      on: { click: () => { play('tap'); goBattle(rivalParams(player(), i, leadTypes)); } }
    }, 'BATTLE! ', h('span', { class: 'rival-fight-ico', attrs: { 'aria-hidden': 'true' } }, '\u2694\uFE0F'));
    const past = h('button', {
      class: 'rival-past', type: 'button',
      on: { click: () => { play('tap'); closeRival(); } }
    }, 'WALK PAST \u25B6\uFE0E');
    rivalLayer.append(h('div', { class: 'rival-card', attrs: { role: 'dialog', 'aria-label': RIVAL_NAME } },
      h('div', { class: 'rival-head' },
        h('span', { class: 'rival-face big', attrs: { 'aria-hidden': 'true' } }, '\u{1F624}'),
        h('div', { class: 'rival-words' },
          h('div', { class: 'rival-name' }, RIVAL_NAME),
          h('div', { class: 'rival-line' }, rivalLine(i)))),
      h('div', { class: ['rival-team', 'n' + team.length] },
        team.map(m => h('span', { class: 'rival-mon' },
          spriteImg(m.id, { class: 'rival-mon-sprite' }),
          h('span', { class: 'rival-mon-lv' }, 'LV ' + m.level)))),
      h('div', { class: 'rival-actions' }, past, fight)));
    rivalLayer.hidden = false;
    scene.classList.add('rival-open');
  }
  function closeRival() {
    rivalOpenAt = -1;
    rivalLayer.hidden = true;
    clear(rivalLayer);
    scene.classList.remove('rival-open');
  }

  function giftNode(i) {
    return h('button', {
      class: 'road-gift', type: 'button',
      attrs: { 'aria-label': 'GIFT' },
      style: { left: beside(i, 108, hasGuardian(player(), i)), top: (nodeY(i) - 4) + 'px' },
      on: { click: onGift }
    },
    h('span', { class: 'gift-lid', attrs: { 'aria-hidden': 'true' } }),
    h('span', { class: 'gift-box', attrs: { 'aria-hidden': 'true' } }),
    h('span', { class: 'gift-stamp', attrs: { 'aria-hidden': 'true' } }, '\u{1F343}'),
    wrappedGifts(player(), store.giftCount()) > 1 ? h('span', { class: 'gift-count' }, String(wrappedGifts(player(), store.giftCount()))) : null);
  }

  let giftBusy = false;
  async function onGift(ev) {
    if (giftBusy) return;
    const box = ev && ev.currentTarget;
    const p = player();
    if (!openGift(p, store.giftCount())) { drawWorld(); return; }
    giftBusy = true;
    try { store.commit(); } catch (e) { console.warn('road: commit failed', e); }
    play('caught');
    if (box) {
      box.classList.add('is-opening');
      box.append(h('span', { class: 'gift-sparkle', attrs: { 'aria-hidden': 'true' } },
        h('span', { class: 'sp a' }), h('span', { class: 'sp b' }), h('span', { class: 'sp c' }), h('span', { class: 'sp d' })),
      h('span', { class: 'gift-berry' },
        h('img', { src: ITEM('oran-berry'), attrs: { alt: '' } }),
        h('span', { class: 'gift-berry-words' }, 'ORAN BERRY!')));
    }
    drawPouch();
    await wait(1400, { signal: ac.signal });
    giftBusy = false;
    if (!alive) return;
    drawWorld();
  }

  // A seed from an Old Venusaur floats up into the pouch.
  async function seedMoment(i) {
    scrollToChapter(i, false);
    const g = world.querySelector('.road-guardian[data-guardian="' + i + '"]');
    if (g) g.append(h('span', { class: 'seed-pop', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'seed-pip is-full' })));
    play('petal');
    pouch.classList.remove('pulse'); void pouch.offsetWidth; pouch.classList.add('pulse');
    await wait(1200, { signal: ac.signal });
  }

  // The rival steps aside after Gabe beats him.
  async function rivalBye(i) {
    const team = rivalTeam(player(), i, leadTypes);
    const toast = h('div', { class: 'rival-toast' },
      h('span', { class: 'rival-face', attrs: { 'aria-hidden': 'true' } }, '\u{1F624}'),
      spriteImg(team[team.length - 1].id, { class: 'rival-ace' }),
      h('span', { class: 'rival-toast-line' }, RIVAL_LOSE_LINES[i % RIVAL_LOSE_LINES.length]));
    scene.append(toast);
    await wait(2200, { signal: ac.signal });
    toast.remove();
  }

  // Three seeds: the egg hatches, right here on the Road.
  let hatchUnmount = null;
  async function runHatch() {
    if (hatchUnmount || !alive) return;
    let mod;
    try { mod = await import('./hatch.js'); } catch (e) { console.warn('road: hatch failed to load', e); return; }
    if (!alive || hatchUnmount) return;
    closeChapter(); closeRival();
    const host = h('section', { class: 'road-hatch-host' });
    scene.append(host);
    const close = () => {
      const u = hatchUnmount;
      hatchUnmount = null;
      try { if (typeof u === 'function') u(); } catch (e) { /* ignore */ }
      host.remove();
      if (!alive) return;
      refreshChrome();
      drawWorld();
    };
    hatchUnmount = () => {};
    try {
      hatchUnmount = mod.mount(host, { store, params: {}, go: () => close() }) || (() => {});
    } catch (e) { console.warn('road: hatch failed', e); close(); }
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

    // A bloomed region grows tall grass: wild Pokemon from its habitat.
    const grass = done ? h('button', {
      class: 'chapter-grass', type: 'button', dataset: { place: i }, attrs: { 'aria-label': 'TALL GRASS' },
      on: { click: () => { play('tap'); ctx.go('wild', { place: i }); } }
    },
    h('span', { class: 'chapter-grass-emoji', attrs: { 'aria-hidden': 'true' } }, '🌿'),
    pre ? null : h('span', { class: 'chapter-grass-words' }, 'TALL GRASS'),
    h('span', { class: 'chapter-grass-go', attrs: { 'aria-hidden': 'true' } }, '\u25B6\uFE0E')) : null;
    const path = h('div', { class: 'chapter-path' });
    const L = leaderIdx(i);
    for (let j = 0; j <= L; j++) path.append(trainerCard(p, i, j, L, j === justWon));
    if (story && hasGuardian(p, i)) path.append(guardianCard(i));
    chapterLayer.append(...[head, grass, h('div', { class: 'chapter-scroll' }, path)].filter(Boolean));
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
      on: { click: () => { if (!open) return; play('tap'); goBattle(battleParams(i, j)); } }
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

  function guardianCard(i) {
    const beaten = guardianBeaten(player(), i);
    return h('button', {
      class: ['trainer-card', 'guardian-card', beaten ? 'is-beaten' : 'is-next', i % 2 ? 'side-l' : 'side-r'],
      type: 'button', dataset: { guardian: i },
      on: { click: () => onGuardian(i) }
    },
    h('span', { class: 'card-sprite' }, spriteImg(GUARDIAN_ID)),
    h('span', { class: 'card-text' },
      h('span', { class: 'card-name' }, GUARDIAN_NAME),
      h('span', { class: 'card-level' }, 'LV ' + guardianLevel(i))),
    beaten ? h('span', { class: 'card-tick', attrs: { 'aria-label': 'BEATEN' } }, '\u2713')
      : h('span', { class: 'card-go guardian-go', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'seed-pip is-full' })));
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
  // ==== wildch BEGIN ====
  // WILD CHAPTERS (data/wild-chapters.js): after the Champion, a signpost by
  // the Tree opens a second, smaller winding path of postgame chapters. It is
  // loaded lazily, so a broken chapter file can never take the Road down.
  // Battles are the normal trainer flow; their onEnd 'wild:<i>:<j>' is
  // applied here (the Road's own settle ignores it). Owner: wildch builder.
  (function wildch() {
    let W = null, wBloom = -1, wBusy = false, wAt = -1, sign = null;
    const XW = [50, 30, 66, 36, 70, 46], WSTEP = 112, WPAD = 76;
    const wy = (k, M) => WPAD + (M - 1 - k) * WSTEP;
    const say = (cls, text) => (pre ? null : h('span', { class: [cls, 'wildch-words'] }, text));
    const layer = h('div', { class: 'road-chapter wildch-layer', hidden: true });
    scene.append(layer);
    const pal = (el, c) => { for (const [k, v] of Object.entries(paletteVars(c))) el.style.setProperty(k, v); };
    const wview = k => {
      if (wBloom < 0) return W.wildView(player(), k);
      return k < wBloom ? 'done' : k === wBloom ? 'current' : k <= wBloom + 2 ? 'soon' : 'fog';
    };
    function shut() { wAt = -1; layer.hidden = true; clear(layer); scene.classList.remove('wildch-open'); drawSign(); }
    function show(cls, c) {
      clear(layer); layer.className = 'road-chapter wildch-layer ' + cls; pal(layer, c);
      layer.hidden = false; scene.classList.add('wildch-open');
    }
    function head(emoji, name, sub, onBack) {
      return h('div', { class: 'chapter-head' },
        h('button', { class: 'chapter-back', type: 'button', attrs: { 'aria-label': 'BACK' },
          on: { click: () => { if (wBusy) return; play('tap'); onBack(); } } }, '◀︎'),
        h('div', { class: 'chapter-titles' },
          h('div', { class: 'chapter-name' }, h('span', { class: 'chapter-emoji' }, emoji), pre ? null : name),
          pre ? null : h('div', { class: 'chapter-sub' }, sub)));
    }
    function nextBar() {
      const nt = W.nextWildTrainer(player());
      if (!nt || wBusy) return null;
      return h('div', { class: 'road-bottom wildch-bottom' }, h('button', {
        class: 'road-next wildch-next', type: 'button',
        on: { click: () => { play('tap'); goBattle(W.wildBattleParams(nt.idx, nt.j)); } }
      }, h('span', { class: 'road-next-label' }, pre ? '⚔️ ▶︎' : 'NEXT BATTLE ▶︎')));
    }
    function drawPath() {
      wAt = -1;
      const p = player(), CH = W.WILD_CHAPTERS, M = CH.length;
      const cur = wBloom >= 0 ? wBloom : W.currentWild(p);
      const c = CH[Math.min(cur, M - 1)];
      show('is-done wildch-path', c);
      const map = h('div', { class: 'wildch-map', style: { height: (2 * WPAD + (M - 1) * WSTEP) + 'px' } });
      const lines = svg('svg', { class: 'road-svg', attrs: { viewBox: '0 0 100 ' + (2 * WPAD + (M - 1) * WSTEP), preserveAspectRatio: 'none', 'aria-hidden': 'true' } });
      lines.append(svg('path', { class: 'road-seg seg-done', attrs: { d: `M ${XW[0]} ${2 * WPAD + (M - 1) * WSTEP} L ${XW[0]} ${wy(0, M)}` } }));
      for (let k = 0; k < M - 1; k++) {
        const v2 = wview(k + 1);
        if (v2 === 'fog') break;
        const xa = XW[k % 6], ya = wy(k, M), xb = XW[(k + 1) % 6], yb = wy(k + 1, M), ym = (ya + yb) / 2;
        lines.append(svg('path', { class: ['road-seg', wview(k) === 'done' && v2 !== 'soon' ? 'seg-done' : 'seg-ahead'],
          attrs: { d: `M ${xa} ${ya} C ${xa} ${ym}, ${xb} ${ym}, ${xb} ${yb}` } }));
      }
      map.append(lines);
      if (cur + 2 < M - 1) map.append(h('div', { class: 'road-fog', attrs: { 'aria-hidden': 'true' },
        style: { height: Math.max(0, wy(cur + 2, M) - WSTEP * 0.45) + 'px' } }, h('div', { class: 'fog-cloud c1' }), h('div', { class: 'fog-cloud c2' })));
      CH.forEach((ch, k) => {
        const v = wview(k);
        if (v === 'fog') return;
        const at = { left: XW[k % 6] + '%', top: wy(k, M) + 'px' };
        const patch = h('div', { class: ['road-region', 'wildch-region', 'is-' + v], dataset: { wild: k }, attrs: { 'aria-hidden': 'true' }, style: { ...at, ...paletteVars(ch) } },
          h('div', { class: 'region-dry' }), h('div', { class: 'region-lush' }));
        if (v === 'done' || k === wBloom) {
          const t = ch.trainers[W.WILD_LEADER].team;
          [t[0].id, t[t.length - 1].id].forEach((id, n) => patch.lastChild.append(spriteImg(id, { class: ['region-mon', 'm' + n], lazy: true })));
        }
        const node = h('button', {
          class: ['road-node', 'wildch-node', 'is-' + v, v === 'current' && k !== wBloom && 'is-current'], type: 'button',
          dataset: { wild: k }, attrs: { 'aria-label': v === 'soon' ? 'LOCKED' : ch.name }, style: { ...at, ...paletteVars(ch) },
          on: { click: () => {
            if (wBusy) return;
            play('tap');
            if (v === 'soon') { node.classList.remove('nope'); void node.offsetWidth; node.classList.add('nope'); return; }
            drawChapter(ch.idx);
          } }
        }, h('span', { class: 'node-emoji' }, ch.emoji), v === 'done' ? h('span', { class: 'node-tick' }, '★') : null);
        map.append(patch, node);
        if (v !== 'soon' && !pre) map.append(h('div', { class: ['road-label', 'wildch-label', 'is-' + v], style: at }, h('div', { class: 'label-name' }, ch.name)));
      });
      const box = h('div', { class: 'chapter-scroll wildch-scroll' }, map);
      layer.append(head('\u{1FAA7}', 'WILD CHAPTERS', cur >= M ? 'ALL BACK IN BLOOM!' : c.flavour, shut), box, nextBar());
      requestAnimationFrame(() => { box.scrollTop = Math.max(0, wy(Math.min(cur, M - 1), M) - box.clientHeight * 0.5); });
    }
    function drawChapter(idx, justWon = -1) {
      const p = player(), c = W.wildByIdx(idx);
      if (!c) { drawPath(); return; }
      wAt = idx;
      const done = W.isWildBloomed(p, idx);
      show(done ? 'is-done' : 'is-dry', c);
      const path = h('div', { class: 'chapter-path' });
      const nt = W.nextWildTrainer(p);
      c.trainers.forEach((t, j) => {
        const beaten = W.isWildCleared(p, idx, j), open = W.isWildTrainerOpen(p, idx, j), leader = j === W.WILD_LEADER;
        const isNext = !!nt && nt.idx === idx && nt.j === j;
        path.append(h('button', {
          class: ['trainer-card', leader && 'is-leader', beaten && 'is-beaten', !open && 'is-locked', isNext && 'is-next', j === justWon && 'just-won', j % 2 ? 'side-r' : 'side-l'],
          type: 'button', disabled: !open, dataset: { wildTrainer: j },
          on: { click: () => { if (!open) return; play('tap'); goBattle(W.wildBattleParams(idx, j)); } }
        },
        leader ? h('span', { class: 'card-crown', attrs: { 'aria-hidden': 'true' } }, '\u{1F451}') : null,
        h('span', { class: 'card-sprite' }, spriteImg(t.team[0].id, { class: !open ? 'is-shadow' : '' })),
        h('span', { class: 'card-text' }, h('span', { class: 'card-name' }, t.name), h('span', { class: 'card-level' }, 'LV ' + W.wildTrainerLevel(t))),
        beaten ? h('span', { class: 'card-tick', attrs: { 'aria-label': 'BEATEN' } }, '✓')
          : open ? h('span', { class: 'card-go', attrs: { 'aria-hidden': 'true' } }, '▶︎') : null));
      });
      layer.append(head(c.emoji, c.name, done ? 'BACK IN BLOOM!' : c.flavour, drawPath), h('div', { class: 'chapter-scroll' }, path), nextBar());
    }
    // The same bloom as a Road chapter: the region sweeps into colour, petals
    // burst, its Pokemon hop home, then the badge. Every wait is tappable.
    async function wildBloom(k) {
      const c = W.WILD_CHAPTERS[k];
      wBloom = k; wBusy = true;
      drawPath();
      scene.classList.add('is-blooming');
      const catcher = h('div', { class: 'bloom-catcher', attrs: { 'aria-hidden': 'true' } });
      scene.append(catcher);
      await wait(400, { signal: ac.signal });
      if (!alive) return;
      play('bloom');
      const map = layer.querySelector('.wildch-map');
      layer.querySelectorAll(`[data-wild="${k}"]`).forEach(el => el.classList.add('bloom-go'));
      const petals = h('div', { class: 'bloom-petals', style: { left: XW[k % 6] + '%', top: wy(k, W.WILD_CHAPTERS.length) + 'px' } });
      if (!reduceMotion()) {
        const colours = [c.palette.ground, c.palette.accent, '#ff9ecb', '#fff4a8', '#8fe07a'];
        for (let n = 0; n < 22; n++) {
          const ang = (n / 22) * Math.PI * 2 + (n % 3) * 0.3, dist = 80 + (n % 5) * 22;
          petals.append(h('span', { class: 'petal', style: {
            '--dx': Math.round(Math.cos(ang) * dist) + 'px', '--dy': Math.round(Math.sin(ang) * dist - 40) + 'px',
            '--rot': (n * 47 % 360) + 'deg', '--delay': (n % 6) * 90 + 'ms', '--petal': colours[n % colours.length] } }));
        }
      }
      if (map) map.append(petals);
      await wait(3000, { signal: ac.signal });
      if (!alive) return;
      wBloom = -1;
      drawPath();
      const badge = h('div', { class: 'bloom-badge' },
        h('div', { class: 'bloom-badge-icon' }, c.emoji), h('div', { class: 'bloom-badge-text' }, 'BACK IN BLOOM!'));
      scene.append(badge);
      play('win');
      await wait(1800, { signal: ac.signal });
      if (!alive) return;
      badge.remove(); catcher.remove();
      scene.classList.remove('is-blooming');
      wBusy = false;
      drawPath();
    }
    function drawSign() {
      if (sign) { sign.remove(); sign = null; }
      if (!W || blooming >= 0 || !W.wildUnlocked(player()) || !W.WILD_CHAPTERS.length) return;
      const nt = W.nextWildTrainer(player());
      const c = W.WILD_CHAPTERS[Math.min(W.currentWild(player()), W.WILD_CHAPTERS.length - 1)];
      sign = h('button', {
        // Across the road from the Old Venusaur (beside()), a little above the Champion's stop.
        class: ['wildch-sign', nt && 'is-new'], type: 'button',
        attrs: { 'aria-label': 'WILD CHAPTERS' }, style: { left: beside(N - 1, 128, true), top: (nodeY(N - 1) - 78) + 'px' },
        on: { click: () => { if (wBusy) return; play('tap'); closeChapter(); drawPath(); } }
      },
      h('span', { class: 'wildch-sign-post', attrs: { 'aria-hidden': 'true' } }, '\u{1FAA7}'),
      h('span', { class: 'wildch-sign-next', attrs: { 'aria-hidden': 'true' } }, c.emoji),
      say('wildch-sign-words', 'WILD'));
      scroller.append(sign);
    }
    import('../data/wild-chapters.js').then(mod => {
      if (!alive) return;
      W = mod;
      const e = W.parseWildEnd(params.onEnd);
      if (e && (params.result === 'win' || params.result === 'lose')) {
        const o = params.result === 'win' ? W.applyWildWin(player(), params.onEnd) : null;
        if (o) { try { store.commit(); } catch (err) { console.warn('road: commit failed', err); } }
        // battle.js already saved this win (params.wildWon): its first-time bloom still plays here.
        const ww = params.wildWon && typeof params.wildWon === 'object' ? params.wildWon : null;
        if (o && ww && ww.idx === o.idx && ww.j === o.j && ww.bloom === true) o.bloom = o.leader;
        if (o && o.bloom && o.pos >= 0) wildBloom(o.pos);
        else drawChapter(e.idx, o ? o.j : -1);
      }
      drawSign();
      try { window.__wildch = () => ({ open: !layer.hidden, at: wAt, blooming: wBloom, next: W.nextWildTrainer(player()),
        views: W.WILD_CHAPTERS.map((_, k) => W.wildView(player(), k)), sign: !!sign }); } catch (err) { /* not a browser */ }
    }).catch(err => console.warn('road: wild chapters failed to load', err));
    ac.signal.addEventListener('abort', () => { try { delete window.__wildch; } catch (err) { /* ignore */ } });
  })();
  // ==== wildch END ====
  const cur = currentChapter(player());
  if (story) loadLeadTypes();
  requestAnimationFrame(async () => {
    if (!alive) return;
    if (blooming >= 0) { bloom(blooming); return; }
    if (gOutcome) {
      await seedMoment(gOutcome.i);
      if (!alive) return;
    } else if (rOutcome && rOutcome.result === 'win') {
      scrollToChapter(rOutcome.i + 1, false);
      await rivalBye(rOutcome.i);
      if (!alive) return;
    } else {
      scrollToChapter(outcome ? outcome.i : cur, false);
      if (outcome && !outcome.leader) openChapter(outcome.i, outcome.j);
    }
    // Enough seeds and no Bulbasaur yet (just now, or a ceremony that was
    // interrupted): the egg hatches.
    if (story && readyToHatch(player())) runHatch();
  });

  round2Road({ ctx, store, params, scene, scroller, world, bottombar, signal: ac.signal, pre, goBattle, closeChapter, scrollToChapter, placed, paletteVars, play });   // round2

  // Test hook, in the spirit of window.__scene: what is on the map right now.
  const debug = () => ({
    scene: 'road', current: currentChapter(player()), next: nextTrainer(player()), openChapter: openIdx,
    views: CHAPTERS.map((_, k) => chapterView(player(), k)), blooming,
    seeds: seedCount(player()), hatched: isHatched(player()), rival: story ? rivalSpot(player()) : -1,
    gifts: store.giftCount(), berries: berryCount(player(), store.giftCount())
  });
  try { window.__road = debug; } catch (e) { /* not a browser */ }

  return function unmount() {
    alive = false;
    ac.abort();
    try { if (typeof hatchUnmount === 'function') hatchUnmount(); } catch (e) { /* ignore */ }
    hatchUnmount = null;
    // The Road theme belongs to the Road: never leak it into a battle, WHO'S
    // PLAYING or Art's garden.
    try { if (typeof music.stopMusic === 'function') music.stopMusic(); } catch (e) { /* ignore */ }
    try { if (window.__road === debug) delete window.__road; } catch (e) { /* ignore */ }
    scene.remove();
  };
}

// ==== round2 BEGIN ====
// ROUND 2 on the Road (data/round2.js has the rules). After the Champion
// chapter blooms, a reader gets a toggle in the bottom bar: two crossed swords
// with a gold '2'. With it on, NEXT BATTLE becomes the Round 2 button, a tap
// on a chapter stop opens that chapter's remixed Round 2 roster, and every
// leader brings a phase-2 GIMMICK. A Round 2 leader win re-blooms the region
// in gold (scene[data-r2gold] + CSS) and brings its ace home as a SHINY.
// Everything is additive: the Round 1 map, NEXT BATTLE and chapter screen are
// untouched while the toggle is off. A prereader never sees any of it.
const r2Mode = { 1: false, 2: false };   // per player; lives across road -> battle -> road

function round2Road({ ctx, store, params, scene, scroller, world, bottombar, signal, pre, goBattle, closeChapter, scrollToChapter, placed, paletteVars, play }) {
  if (pre) return;
  const player = () => store.player();
  const who = () => (store.current === 2 ? 2 : 1);
  const alive = () => !signal.aborted;

  // A Round 2 battle coming back: battle.js already saved it (params.roundTwo);
  // re-apply (idempotent) and rebuild the celebration from the marks.
  let won = null;
  if (typeof params.onEnd === 'string' && params.onEnd.startsWith('round2:')) {
    r2Mode[who()] = true;
    try {
      won = r2Return(player(), params.onEnd, params.result, params.roundTwo);
      if (won) store.commit();
    } catch (e) { console.warn('road: round 2 result not applied', e); }
  }
  const markGold = () => { scene.dataset.r2gold = goldChapters(player()).join(' '); };
  markGold();
  if (!r2Unlocked(player())) { r2Mode[who()] = false; return; }

  const toggle = h('button', {
    class: 'r2-toggle', type: 'button', attrs: { 'aria-label': 'ROUND 2' },
    on: { click: () => { play('tap'); r2Mode[who()] = !r2Mode[who()]; closePanel(); closeChapter(); sync(); } }
  },
  h('span', { class: 'r2-swords', attrs: { 'aria-hidden': 'true' } }, '⚔️'),
  h('span', { class: 'r2-two', attrs: { 'aria-hidden': 'true' } }, '2'));
  const nextR2 = h('button', { class: 'r2-next', type: 'button', on: { click: onNextR2 } });
  bottombar.prepend(toggle);
  bottombar.append(nextR2);
  const panel = h('div', { class: 'road-chapter r2-chapter is-done', hidden: true });
  scene.append(panel);

  function sync() {
    const on = r2Mode[who()];
    const p = player();
    scene.classList.toggle('r2-on', on);
    toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    const cur = r2Current(p);
    if (on && cur < CHAPTERS.length) scene.dataset.r2cur = String(cur); else delete scene.dataset.r2cur;
    clear(nextR2);
    const nt = r2Next(p);
    nextR2.classList.toggle('is-done', !nt);
    nextR2.append(h('span', { class: 'r2-next-ico', attrs: { 'aria-hidden': 'true' } }, '⚔️'),
      nt ? 'ROUND 2 ▶︎' : 'REMATCH ▶︎');
    markGold();
  }

  function onNextR2() {
    play('tap');
    const nt = r2Next(player());
    if (nt) goBattle(r2BattleParams(nt.i, nt.j));
    else openPanel(R2_CHAMP);
  }

  // With Round 2 on, a tap on a chapter stop opens its Round 2 roster.
  scroller.addEventListener('click', ev => {
    if (!r2Mode[who()]) return;
    const node = ev.target && ev.target.closest && ev.target.closest('.road-node[data-chapter]');
    if (!node || !world.contains(node) || node.classList.contains('wildch-node')) return;
    ev.stopPropagation();
    ev.preventDefault();
    const i = Number(node.dataset.chapter);
    play('tap');
    if (isR2ChapterOpen(player(), i)) { closeChapter(); openPanel(i); return; }
    node.classList.remove('nope'); void node.offsetWidth; node.classList.add('nope');
  }, { capture: true, signal });

  function closePanel() {
    panel.hidden = true;
    clear(panel);
    scene.classList.remove('chapter-open', 'r2-panel-open');
  }

  function openPanel(i, justWon = -1) {
    const ch = CHAPTERS[i];
    if (!ch) return;
    const p = player();
    clear(panel);
    for (const [k, val] of Object.entries(paletteVars(ch))) panel.style.setProperty(k, val);
    const back = h('button', {
      class: 'chapter-back', type: 'button', attrs: { 'aria-label': 'BACK' },
      on: { click: () => { play('tap'); closePanel(); } }
    }, '◀︎');
    const head = h('div', { class: 'chapter-head' }, back,
      h('div', { class: 'chapter-titles' },
        h('div', { class: 'chapter-name' }, h('span', { class: 'chapter-emoji' }, ch.emoji), ch.region),
        h('div', { class: 'chapter-sub r2-sub' },
          h('span', { attrs: { 'aria-hidden': 'true' } }, '⚔️ '),
          isR2ChapterDone(p, i) ? 'ROUND 2: GOLDEN!' : 'ROUND 2')));
    const path = h('div', { class: 'chapter-path' });
    const L = leaderIdx(i);
    const nt = r2Next(p);
    r2Trainers(i).forEach((t, j) => path.append(card(p, i, j, t, j === L, !!nt && nt.i === i && nt.j === j, j === justWon)));
    panel.append(head, h('div', { class: 'chapter-scroll' }, path));
    panel.hidden = false;
    scene.classList.add('chapter-open', 'r2-panel-open');
  }

  function card(p, i, j, t, leader, isNext, justWon) {
    const beaten = isR2Cleared(p, i, j);
    const open = isR2TrainerOpen(p, i, j);
    const g = leader ? gimmickInfo(gimmickFor(i)) : null;
    const ace = leader ? r2Ace(i) : null;
    return h('button', {
      class: ['trainer-card', 'r2-card', leader && 'is-leader', beaten && 'is-beaten', !open && 'is-locked',
        isNext && 'is-next', justWon && 'just-won', j % 2 ? 'side-r' : 'side-l'],
      type: 'button', disabled: !open, dataset: { r2trainer: j },
      on: { click: () => { if (!open) return; play('tap'); goBattle(r2BattleParams(i, j)); } }
    },
    leader ? h('span', { class: 'card-crown', attrs: { 'aria-hidden': 'true' } }, '\u{1F451}') : null,
    h('span', { class: 'card-sprite' }, spriteImg(t.team[0].id, { class: !open ? 'is-shadow' : '' })),
    h('span', { class: 'card-text' },
      h('span', { class: 'card-name' }, t.name),
      h('span', { class: 'card-level' }, 'LV ' + trainerLevel(t))),
    g ? h('span', { class: 'r2-gimmick', attrs: { 'aria-hidden': 'true' } }, g.icon) : null,
    ace ? h('span', { class: 'r2-prize', attrs: { 'aria-hidden': 'true' } },
      spriteImg(ace.id, { class: 'r2-prize-sprite', shiny: true, lazy: true }), h('span', { class: 'r2-prize-spark' }, '✨')) : null,
    beaten ? h('span', { class: 'card-tick', attrs: { 'aria-label': 'BEATEN' } }, '✓')
      : open ? h('span', { class: 'card-go', attrs: { 'aria-hidden': 'true' } }, '▶︎') : null);
  }

  // The golden re-bloom, then the shiny ace comes home. Tap skips (wait()).
  async function goldBloom(i) {
    const ch = CHAPTERS[i];
    scene.classList.add('is-blooming');
    const catcher = h('div', { class: 'bloom-catcher', attrs: { 'aria-hidden': 'true' } });
    scene.append(catcher);
    scrollToChapter(i, false);
    delete scene.dataset.r2gold;          // the moment BEFORE: not gold yet
    await wait(300, { signal });
    if (!alive()) return;
    play('bloom');
    const patch = world.querySelector('.road-region[data-chapter="' + i + '"]');
    if (patch) patch.classList.add('r2-bloom-go');
    const petals = h('div', { class: 'bloom-petals r2-petals', style: placed(i) });
    const golds = ['#ffd23f', '#ffe98a', '#f0b000', '#fff4c0', ch.palette.accent];
    for (let k = 0; k < 20; k++) {
      const ang = (k / 20) * Math.PI * 2;
      const dist = 80 + (k % 4) * 28;
      petals.append(h('span', {
        class: 'petal',
        style: {
          '--dx': Math.round(Math.cos(ang) * dist) + 'px', '--dy': Math.round(Math.sin(ang) * dist - 40) + 'px',
          '--rot': (k * 53 % 360) + 'deg', '--delay': (k % 5) * 80 + 'ms', '--petal': golds[k % golds.length]
        }
      }));
    }
    world.append(petals);
    await wait(2400, { signal });
    petals.remove();
    markGold();
    catcher.remove();
    scene.classList.remove('is-blooming');
  }

  async function shinyHome(aceId) {
    if (!aceId || !alive()) return;
    const layer = h('div', { class: 'r2-shiny', attrs: { role: 'dialog', 'aria-label': 'SHINY' } });
    const ok = h('button', { class: 'r2-shiny-ok', type: 'button', attrs: { 'aria-label': 'OK' } }, '▶︎');
    layer.append(h('div', { class: 'r2-shiny-card' },
      h('div', { class: 'r2-shiny-stage' },
        h('span', { class: 'r2-shiny-spark s1', attrs: { 'aria-hidden': 'true' } }, '✨'),
        spriteImg(aceId, { class: 'r2-shiny-sprite', shiny: true, animated: true }),
        h('span', { class: 'r2-shiny-spark s2', attrs: { 'aria-hidden': 'true' } }, '✨')),
      h('div', { class: 'r2-shiny-words' }, 'A SHINY JOINED YOU!'),
      ok));
    scene.append(layer);
    play('caught');
    try { cry(aceId); } catch (e) { /* silent */ }
    await new Promise(res => {
      ok.addEventListener('click', res, { once: true });
      signal.addEventListener('abort', res, { once: true });
    });
    play('tap');
    layer.remove();
  }

  sync();
  if (won) {
    requestAnimationFrame(async () => {
      if (!alive()) return;
      if (won.bloom) await goldBloom(won.i);
      if (!alive()) return;
      if (won.leader && won.newShiny) await shinyHome(won.ace);
      if (!alive()) return;
      sync();
      if (!won.leader) { scrollToChapter(won.i, false); openPanel(won.i, won.j); }
    });
  }

  // Test hook alongside window.__road.
  try {
    window.__round2 = () => ({ on: r2Mode[who()], unlocked: r2Unlocked(player()), next: r2Next(player()),
      current: r2Current(player()), gold: goldChapters(player()), panel: !panel.hidden });
    signal.addEventListener('abort', () => { try { delete window.__round2; } catch (e) { /* ignore */ } }, { once: true });
  } catch (e) { /* not a browser */ }
}
// ==== round2 END ====
