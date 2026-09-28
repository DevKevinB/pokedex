// SPROUT ROAD: ART'S GARDEN. The most important screen in the product.
// A four-year-old pre-reader lives here with BULBA. Nothing on this screen is
// a word: meaning is picture, colour and motion. Nothing here can fail, and
// nothing here ever says so. Pure rules live in garden-logic.js (unit-tested).

import { h, clear } from '../ui/h.js';
import { spriteImg, spriteUrl, ITEM } from '../ui/sprite.js';
import * as audio from '../audio/audio.js';
import * as music from '../audio/music.js';
import { wait, PACE } from '../core/pace.js';
import { rngFromUrl } from '../core/rng.js';
import * as L from './garden-logic.js';
import * as DC from '../data/decor.js';
import { MAX_DECOR } from '../core/validate.js';

const NAP_AFTER = 20000;
const MAX_VISITORS_ON_SCREEN = 2;
const BALLS = ['poke-ball', 'great-ball', 'ultra-ball', 'master-ball'];
const E = {                                      // emoji pictures (never words)
  sprout: '\u{1F331}', home: '\u{1F3E0}', sign: '\u{1FAA7}', basket: '\u{1F9FA}',
  heart: '\u{1F497}', leaf: '\u{1F343}', zzz: '\u{1F4A4}', spark: '\u{2728}',
  gift: '\u{1F381}', drop: '\u{1F4A7}', sunflower: '\u{1F33B}',
};
// Per-player UI memory for the decor drawer (which unlocks were already
// announced with a gift box, which accessories he has tried on). A
// convenience only: it is NOT the save, holds nothing he owns, and losing it
// just means one more gift box / a little extra sparkle.
const SEEN_KEY = 'pokedexos_next_garden_seen';

const { sfx, cry, unlock } = audio;
// A cry nobody asked for (Bulba's hello, a visitor arriving) waits for the
// first real tap, so a page never makes the AudioContext before a gesture.
const heard = () => { try { return typeof audio.audioUnlocked !== 'function' || audio.audioUnlocked(); } catch (e) { return true; } };
function play(name, ...args) { try { const f = sfx && sfx[name]; if (typeof f === 'function') f(...args); } catch (e) { /* audio never breaks the garden */ } }
function playCry(id) { try { cry(id); } catch (e) { /* noop */ } }
function ambientCry(id) { if (heard()) playCry(id); }

export function mount(root, ctx) {
  const { store } = ctx;
  const p = L.ensureGardenState(store.player());
  const bulba = p.bulba, garden = p.garden;
  const rng = (() => { try { return rngFromUrl(); } catch (e) { return Math.random; } })();
  const rand = (a, b) => a + rng() * (b - a);
  const dur = ms => (PACE.fast ? Math.min(ms, 30) : ms);

  let alive = true;
  const abort = (typeof AbortController === 'function') ? new AbortController() : null;
  const pause = ms => wait(ms, { signal: abort ? abort.signal : null });
  const timers = new Set();
  const later = (fn, ms) => {
    const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, dur(ms));
    timers.add(t); return t;
  };
  const cancel = t => { if (t) { clearTimeout(t); timers.delete(t); } };
  const intervals = [];
  const offs = [];
  const listen = (el, evt, fn, opts) => { el.addEventListener(evt, fn, opts); offs.push(() => el.removeEventListener(evt, fn, opts)); };

  // ---- persistence: at most one store.commit() per 250ms ----------------
  const COMMIT_EVERY = 250;
  let lastCommit = 0, commitT = null, dirty = false;
  function flush() {
    cancel(commitT); commitT = null;
    if (!dirty) return;
    dirty = false; lastCommit = Date.now();
    try { store.commit(); } catch (e) { /* store emits saveFailed itself */ }
  }
  function save() {
    dirty = true;
    const since = Date.now() - lastCommit;
    if (since >= COMMIT_EVERY) flush();
    else if (!commitT) {
      commitT = setTimeout(() => { timers.delete(commitT); commitT = null; flush(); }, COMMIT_EVERY - since);
      timers.add(commitT);
    }
  }

  // iOS may freeze or kill a backgrounded PWA before a pending commit fires.
  listen(window, 'pagehide', () => flush());
  listen(document, 'visibilitychange', () => { if (document.hidden) flush(); });

  // ---- calm is the default for a pre-reader -----------------------------
  let addedCalm = false;
  if (p.profile === 'prereader' && !document.body.classList.contains('calm')) {
    document.body.classList.add('calm'); addedCalm = true;
  }

  // ---- DOM ---------------------------------------------------------------
  const btn = (cls, label, on, ...kids) => h('button', {
    class: 'gd-btn ' + cls, attrs: { type: 'button', 'aria-label': label },
    on: { pointerdown: e => { e.stopPropagation(); e.preventDefault(); onAnyInput(); on(e); } },
  }, ...kids);

  const meterSlots = Array.from({ length: L.PETALS_PER_VISITOR }, () => h('span', { class: 'gd-slot' }));
  const countNum = h('span', { class: 'gd-count-num' });
  const meter = h('div', { class: 'gd-meter', attrs: { role: 'img', 'aria-label': 'petals' } },
    h('div', { class: 'gd-slots' }, meterSlots),
    h('div', { class: 'gd-count' }, h('span', { class: 'gd-petal-ico' }), countNum));

  const homeBtn = btn('gd-home', 'home', () => { play('tap'); flush(); ctx.go('who'); }, h('span', { class: 'gd-emo' }, E.home));
  const roadBtn = btn('gd-road', 'road', () => { play('tap'); flush(); ctx.go('road', { peek: true, from: 'garden' }); }, h('span', { class: 'gd-emo' }, E.sign));
  // His Sticker Book (batch 3): every Pokemon he caught, as stickers.
  const bookBtn = btn('gd-book', 'book', () => { play('tap'); flush(); ctx.go('book', { returnTo: 'garden' }); }, h('span', { class: 'gd-emo' }, '\u{1F4D6}'));

  const berryNum = h('span', { class: 'gd-badge' });
  const basketBtn = btn('gd-basket', 'berries', () => toggleBerryMode(),
    h('span', { class: 'gd-emo' }, E.basket), h('img', { class: 'gd-basket-berry', attrs: { src: ITEM('oran-berry'), alt: '', draggable: 'false' } }), berryNum);
  const ballImg = h('img', { attrs: { src: ITEM('poke-ball'), alt: '', draggable: 'false' } });
  const ballBtn = btn('gd-ballbtn', 'ball', () => openDrawer(), ballImg);

  // Art's decorations (batch 4): a basket-with-sparkle button, a picture-only
  // strip of what he has unlocked, and the things he put down on the ground.
  const heldSlot = h('span', { class: 'gd-dbtn-held' });
  const decorBtn = btn('gd-dbtn', 'decorations', () => tapDecorBtn(),
    h('span', { class: 'gd-emo' }, E.basket), h('span', { class: 'gd-dbtn-flower' }, E.sunflower),
    h('span', { class: 'gd-dbtn-spark' }, E.spark), heldSlot);
  const dRowDecor = h('div', { class: 'gd-drow' });
  const dRowAcc = h('div', { class: 'gd-drow gd-drow-acc' });
  const dsheet = h('div', { class: 'gd-dsheet', attrs: { 'aria-hidden': 'true' } }, dRowDecor, dRowAcc);
  const dshade = h('div', { class: 'gd-dshade', on: { pointerdown: e => { e.stopPropagation(); e.preventDefault(); onAnyInput(); play('tap'); closeDecor(); } } });
  const decorLayer = h('div', { class: 'gd-decor' });
  const giftLayer = h('div', { class: 'gd-giftlayer' });

  let bottomBar = null;
  const plotsLayer = h('div', { class: 'gd-plots' });
  const actorsLayer = h('div', { class: 'gd-actors' });
  const field = h('div', { class: 'gd-field' }, h('div', { class: 'gd-grass' }), plotsLayer, decorLayer, actorsLayer, giftLayer);
  const hillsFar = h('div', { class: 'gd-hills gd-far' });
  const hillsNear = h('div', { class: 'gd-hills gd-near' });
  const sky = h('div', { class: 'gd-sky' },
    h('div', { class: 'gd-sun' }),
    h('div', { class: 'gd-cloud c1' }), h('div', { class: 'gd-cloud c2' }), h('div', { class: 'gd-cloud c3' }));
  const fx = h('div', { class: 'gd-fx' });

  const drawerBalls = BALLS.map(name => h('button', {
    class: 'gd-ball-opt', attrs: { type: 'button', 'aria-label': 'ball' }, dataset: { ball: name },
    on: { pointerdown: e => { e.stopPropagation(); e.preventDefault(); onAnyInput(); pickBall(name); } },
  }, h('img', { attrs: { src: ITEM(name), alt: '', draggable: 'false' } })));
  const drawer = h('div', { class: 'gd-drawer', attrs: { 'aria-hidden': 'true' } }, drawerBalls);
  const drawerShade = h('div', { class: 'gd-shade', on: { pointerdown: e => { e.stopPropagation(); onAnyInput(); play('tap'); closeDrawer(); } } });

  const scene = h('div', { class: 'gd' },
    sky, hillsFar, hillsNear, field, fx,
    h('div', { class: 'gd-top' }, homeBtn, meter, roadBtn),
    (bottomBar = h('div', { class: 'gd-bottom' }, basketBtn, bookBtn, decorBtn, ballBtn)),
    drawerShade, drawer, dshade, dsheet);
  root.classList.add('garden-scene');
  root.appendChild(scene);

  // ---- geometry --------------------------------------------------------
  function fs() { const r = field.getBoundingClientRect(); return { w: r.width, h: r.height, left: r.left, top: r.top }; }
  function sceneXY(x, y) {           // field fraction -> px inside .gd (for fx)
    const f = fs(), s = scene.getBoundingClientRect();
    return { px: f.left - s.left + x * f.w, py: f.top - s.top + y * f.h };
  }
  function elCenter(el) {
    const r = el.getBoundingClientRect(), s = scene.getBoundingClientRect();
    return { px: r.left - s.left + r.width / 2, py: r.top - s.top + r.height / 2 };
  }

  // ---- actors: Bulba, the baby, visitors --------------------------------
  function sizeImg(img, scale) {
    const apply = () => {
      if (!img.naturalWidth) return;
      img.style.width = `calc(${img.naturalWidth}px * var(--gd-scale) * ${scale})`;
      const a = img.closest('.gd-actor');
      if (a) a.style.setProperty('--half', Math.round(img.offsetWidth / 2) + 'px');
    };
    img.addEventListener('load', apply);
    if (img.complete) apply();
  }
  function makeActor(id, { scale = 1, cls = '' } = {}) {
    const img = spriteImg(id, { animated: true });
    img.classList.add('gd-img');
    sizeImg(img, scale);
    const faceEl = h('div', { class: 'gd-face' }, img);
    const hop = h('div', { class: 'gd-hop' }, faceEl);
    const body = h('div', { class: 'gd-body' }, hop);
    const el = h('div', { class: 'gd-actor ' + cls, dataset: { id: String(id) } }, body);
    actorsLayer.appendChild(el);
    return { id, el, body, hop, faceEl, img, x: 0.5, y: 0.5, face: -1, moveT: null };
  }
  function place(a, x, y, ms = 0) {
    a.x = x; a.y = y;
    const { w, h: fh } = fs();
    a.el.style.transition = ms ? `transform ${ms}ms cubic-bezier(.45,.05,.55,.95)` : 'none';
    a.el.style.transform = `translate3d(${(x * w).toFixed(1)}px, ${(y * fh).toFixed(1)}px, 0)`;
    a.el.style.zIndex = String(10 + Math.round(y * 100));
  }
  function setFace(a, dir) { a.face = dir; a.faceEl.style.transform = dir > 0 ? 'scaleX(-1)' : ''; }
  function moveTo(a, x, y, { speed = 2.4, min = 260, max = 950, done } = {}) {
    const { w, h: fh } = fs();
    const dist = Math.hypot((x - a.x) * w, (y - a.y) * fh);
    if (a === B) endReact();
    if (Math.abs(x - a.x) > 0.01) setFace(a, x > a.x ? 1 : -1);
    const ms = dur(Math.max(min, Math.min(max, dist * speed)));
    a.el.classList.add('moving');
    place(a, x, y, ms);
    cancel(a.moveT);
    a.moveT = later(() => { a.el.classList.remove('moving'); if (done) done(); }, ms);
    return ms;
  }
  function jump(a) {
    a.hop.classList.remove('jump'); void a.hop.offsetWidth; a.hop.classList.add('jump');
    later(() => a.hop.classList.remove('jump'), 600);
  }

  // BULBA
  const B = makeActor(L.stageId(bulba.stage), { cls: 'gd-bulba' });
  const bud = h('div', { class: 'gd-bud', attrs: { role: 'button', 'aria-label': 'bud' },
    on: { pointerdown: e => { e.stopPropagation(); e.preventDefault(); onAnyInput(); tapBud(); } } }, h('span', { class: 'gd-bud-dot' }));
  const zzz = h('div', { class: 'gd-zzz' }, E.zzz);
  const stoneOn = h('img', { class: 'gd-stone-on', attrs: { src: ITEM('everstone'), alt: '', draggable: 'false' } });
  // The Everstone switches ON only after a hold (a ring fills round it), so
  // a stray tap next to Bulba, or on a visitor it happens to sit by, never
  // quietly stops him evolving. Switching it OFF is a single tap.
  const stoneRing = h('span', { class: 'gd-stone-ring', attrs: { 'aria-hidden': 'true' } });
  const stoneBtn = h('button', { class: 'gd-btn gd-stone', attrs: { type: 'button', 'aria-label': 'everstone' },
    on: {
      pointerdown: e => { e.stopPropagation(); e.preventDefault(); onAnyInput(); stoneDown(e); },
      pointerup: e => { e.stopPropagation(); stoneUp(); },
      pointercancel: () => stoneUp(),
      contextmenu: e => e.preventDefault(),
    } },
    stoneRing, h('img', { attrs: { src: ITEM('everstone'), alt: '', draggable: 'false' } }));
  // What Bulba is wearing (batch 4). Inside .gd-face, so it turns with him.
  const accEl = h('div', { class: 'gd-acc', attrs: { 'aria-hidden': 'true' } });
  B.faceEl.appendChild(accEl);
  B.body.append(bud, zzz, stoneOn);
  B.el.appendChild(stoneBtn);
  listen(B.body, 'pointerdown', e => { e.stopPropagation(); e.preventDefault(); onAnyInput(); tapBulba(); });

  let baby = null;
  const visitors = [];      // { ...actor, fed }
  let pendingVisitors = 0;
  let focusVisitor = null;
  let berryMode = false;
  let drawerOpen = false;
  let busy = null;          // null | 'catch' | 'evolve'
  let asleep = false;
  let lastInput = Date.now();
  let nextIdleAt = Date.now() + 4000;
  const bushRest = new WeakMap();   // plot -> time its berries are back

  // ---- rendering ---------------------------------------------------------
  const plotEls = new Map();        // plot object -> element
  function plotContent(pl) {
    const look = L.plotLook(pl.grown), k = L.kindInfo(pl.kind);
    if (look === 'sprout') return h('span', { class: 'gd-emo' }, E.sprout);
    if (look === 'flower') return h('span', { class: 'gd-emo' }, k.flower);
    const resting = (bushRest.get(pl) || 0) > Date.now();
    return h('div', { class: 'gd-bush' + (resting ? ' picked' : '') },
      h('img', { class: 'gd-berry b1', attrs: { src: ITEM(k.berry), alt: '', draggable: 'false' } }),
      h('img', { class: 'gd-berry b2', attrs: { src: ITEM(k.berry), alt: '', draggable: 'false' } }));
  }
  function renderPlot(pl, pop = false) {
    let el = plotEls.get(pl);
    if (!el) {
      el = h('div', { class: 'gd-plot' });
      plotEls.set(pl, el); plotsLayer.appendChild(el);
    }
    el.className = `gd-plot g${Math.min(L.MAX_GROWN, pl.grown | 0)} ${L.plotLook(pl.grown)}`;
    el.style.left = (pl.x * 100) + '%';
    el.style.top = (pl.y * 100) + '%';
    el.style.zIndex = String(10 + Math.round(pl.y * 100));
    clear(el); el.appendChild(plotContent(pl));
    if (pop) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  }
  function renderAllPlots() {
    const live = new Set(garden.plots);
    for (const [pl, el] of plotEls) if (!live.has(pl)) { el.remove(); plotEls.delete(pl); }
    garden.plots.forEach(pl => renderPlot(pl));
  }
  function updateMeter(burst = false) {
    const fill = L.meterFill(bulba.petals);
    meterSlots.forEach((s, i) => s.classList.toggle('lit', i < fill));
    countNum.textContent = String(bulba.petals);
    if (burst) { meter.classList.remove('burst'); void meter.offsetWidth; meter.classList.add('burst'); }
  }
  function updateBerries() { berryNum.textContent = String(garden.berries); berryNum.hidden = !(garden.berries > 0); }
  function updateBulbaLook() {
    B.el.dataset.stage = String(bulba.stage);
    B.el.style.setProperty('--swell', (1 + L.bulbSwell(bulba) * 0.06).toFixed(3));
    const ready = L.budReady(bulba);
    B.el.classList.toggle('bud-ready', ready);
    bud.hidden = !ready;
    stoneBtn.hidden = bulba.stage >= 3;
    stoneBtn.classList.toggle('on', !!bulba.stayStone);
    stoneOn.hidden = !bulba.stayStone || bulba.stage >= 3;
    stoneSide();
  }
  function updateBallBtn() {
    const any = visitors.length > 0;
    ballBtn.classList.toggle('show', any);
    ballBtn.setAttribute('aria-hidden', any ? 'false' : 'true');
  }

  // ---- fx ----------------------------------------------------------------
  function fxEl(cls, px, py, text, life = 1200) {
    const el = h('div', { class: 'gd-p ' + cls, style: { left: px + 'px', top: py + 'px' } }, text || null);
    fx.appendChild(el);
    later(() => el.remove(), life);
    return el;
  }
  function petalPuff(x, y) { const { px, py } = sceneXY(x, y); fxEl('gd-float-petal', px, py - 30); }
  function hearts(a) {
    const { px, py } = sceneXY(a.x, a.y);
    for (let i = 0; i < 3; i++) { const el = fxEl('gd-heart', px + (i - 1) * 22, py - 70, E.heart, 1400); el.style.animationDelay = (i * 120) + 'ms'; }
  }
  function leafBurst(px, py) {
    const n = document.body.classList.contains('calm') ? 7 : 12;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2, r = rand(55, 95);
      const el = fxEl('gd-leaf', px, py, E.leaf, 1100);
      el.style.setProperty('--dx', (Math.cos(ang) * r).toFixed(0) + 'px');
      el.style.setProperty('--dy', (Math.sin(ang) * r).toFixed(0) + 'px');
    }
  }
  function petalStorm() {
    const s = scene.getBoundingClientRect();
    for (let i = 0; i < 26; i++) {
      const el = fxEl('gd-storm', rand(0, s.width), -20, null, 4200);
      el.style.animationDelay = rand(0, 1400).toFixed(0) + 'ms';
      el.style.animationDuration = rand(2200, 3000).toFixed(0) + 'ms';
      el.style.setProperty('--drift', rand(-60, 60).toFixed(0) + 'px');
    }
  }
  function sparkle(px, py) { fxEl('gd-spark', px, py, E.spark, 800); }

  // ---- petals and visitors ------------------------------------------------
  function gainPetals(n, x, y) {
    const before = bulba.petals;
    const wasReady = L.budReady(bulba);
    L.addPetals(bulba, n);
    const due = L.visitorsDue(before, bulba.petals);
    updateMeter(due > 0);
    if (x != null) petalPuff(x, y);
    for (let i = 0; i < due; i++) pendingVisitors++;
    if (due) later(trySpawnVisitor, 900);
    updateBulbaLook();
    if (!wasReady && L.budReady(bulba)) { play('bloom'); later(lookAtBud, 1600); }
    const ups = DC.unlocksBetween(before, bulba.petals);
    if (ups.length) { giftQueue.push(...ups); later(dropGift, 1300); }
    updateDecorBtn();
    save();
  }
  function trySpawnVisitor() {
    while (pendingVisitors > 0 && visitors.length < MAX_VISITORS_ON_SCREEN) { pendingVisitors--; spawnVisitor(); }
  }
  function spawnVisitor() {
    const id = L.pickVisitor(p.caught, visitors.map(v => v.id), rng, bulba.petals);
    const a = makeActor(id, { cls: 'gd-visitor' });
    a.fed = false;
    const fromLeft = rng() < 0.5;
    const y = rand(0.35, 0.8);
    place(a, fromLeft ? -0.18 : 1.18, y);
    let tx = fromLeft ? rand(0.18, 0.4) : rand(0.6, 0.82);
    // Keep clear of Bulba AND of the Everstone beside him (about 0.2 of the
    // width to one side), so a tap on a visitor never lands on the stone.
    const stoneX = B.x + (B.el.classList.contains('stone-right') ? 0.21 : -0.21);
    const nearB = Math.abs(y - B.y) < 0.2 && (Math.abs(tx - B.x) < 0.15 || Math.abs(tx - stoneX) < 0.15);
    if (nearB) tx = fromLeft ? 0.15 : 0.85;
    visitors.push(a);
    listen(a.body, 'pointerdown', e => { e.stopPropagation(); e.preventDefault(); onAnyInput(); tapVisitor(a); });
    requestAnimationFrame(() => { if (!alive) return; moveTo(a, tx, y, { speed: 5, min: 1400, max: 2600, done: () => { ambientCry(id); jump(a); } }); });
    updateBallBtn();
  }
  function removeVisitor(a) {
    const i = visitors.indexOf(a);
    if (i >= 0) visitors.splice(i, 1);
    if (focusVisitor === a) focusVisitor = null;
    a.el.remove();
    updateBallBtn();
  }
  function tapVisitor(a) {
    play('tap');
    if (busy === 'catch') return;
    focusVisitor = a;
    if (berryMode) return feed(a);
    if (drawerOpen) { markTarget(a); return; }
    playCry(a.id); jump(a);
  }
  function feed(a) {
    setBerryMode(false);
    const from = elCenter(basketBtn), to = sceneXY(a.x, a.y);
    const b = h('img', { class: 'gd-flying', attrs: { src: ITEM('oran-berry'), alt: '', draggable: 'false' }, style: { left: from.px + 'px', top: from.py + 'px' } });
    fx.appendChild(b);
    const ms = dur(450);
    try {
      b.animate([
        { transform: 'translate(-50%,-50%)' },
        { transform: `translate(calc(-50% + ${(to.px - from.px) / 2}px), calc(-50% + ${(to.py - 60 - from.py) / 2 - 60}px))` },
        { transform: `translate(calc(-50% + ${to.px - from.px}px), calc(-50% + ${to.py - 50 - from.py}px)) scale(.6)` },
      ], { duration: ms, easing: 'ease-out', fill: 'forwards' });
    } catch (e) { /* old WebKit: berry just vanishes */ }
    later(() => {
      b.remove(); play('petal'); hearts(a); jump(a); playCry(a.id);
      a.fed = true; a.el.classList.add('fed');
      gainPetals(1, a.x, a.y);
    }, ms);
  }

  // ---- berry basket -----------------------------------------------------
  function setBerryMode(on) {
    berryMode = on;
    basketBtn.classList.toggle('on', on);
    scene.classList.toggle('berry-mode', on);
  }
  function toggleBerryMode() { play('tap'); if (drawerOpen) closeDrawer(); if (decorOpen) closeDecor(); dropHeld(); setBerryMode(!berryMode); }

  // ---- the ball drawer: same look as battle, no odds, no counts ---------
  function markTarget(a) {
    visitors.forEach(v => v.el.classList.toggle('target', v === a));
  }
  function openDrawer() {
    play('tap');
    if (busy || !visitors.length) return;
    setBerryMode(false); if (decorOpen) closeDecor(); dropHeld();
    if (!focusVisitor || !visitors.includes(focusVisitor)) focusVisitor = visitors[0];
    markTarget(focusVisitor);
    drawerOpen = true;
    drawer.classList.add('open'); drawerShade.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
  }
  function closeDrawer() {
    drawerOpen = false;
    drawer.classList.remove('open'); drawerShade.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    markTarget(null);
  }
  function pickBall(name) {
    play('tap');
    const target = focusVisitor && visitors.includes(focusVisitor) ? focusVisitor : visitors[0];
    closeDrawer();
    if (!target || busy) return;
    throwBall(name, target);
  }
  async function throwBall(name, a) {
    busy = 'catch';
    // It always works, so the catch is written the moment the ball leaves his
    // hand. Leaving mid-wobble (home, signpost, app closed) never loses it.
    L.recordCatch(p, a.id);
    save(); flush();
    ballImg.src = ITEM(name);
    const from = elCenter(ballBtn), to = sceneXY(a.x, a.y);
    const ball = h('img', { class: 'gd-flying gd-thrown', attrs: { src: ITEM(name), alt: '', draggable: 'false' }, style: { left: from.px + 'px', top: from.py + 'px' } });
    fx.appendChild(ball);
    play('ballThrow');
    const dx = to.px - from.px, dy = to.py - 36 - from.py;
    let anim = null;
    try {
      anim = ball.animate([
        { transform: 'translate(-50%,-50%) rotate(0deg)' },
        { transform: `translate(calc(-50% + ${dx / 2}px), calc(-50% + ${dy / 2 - 110}px)) rotate(360deg)` },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(720deg)` },
      ], { duration: dur(560), easing: 'ease-out', fill: 'forwards' });
    } catch (e) { /* noop */ }
    await pause(560);
    if (!alive) return;
    try { if (anim) anim.finish(); } catch (e) { /* noop */ }
    ball.style.left = to.px + 'px'; ball.style.top = (to.py - 36) + 'px';
    if (anim) { try { anim.cancel(); } catch (e) { /* noop */ } }
    ball.style.transform = 'translate(-50%,-50%)';
    a.el.classList.add('absorbed');
    // drop to the ground, then three wobbles
    await pause(420);
    if (!alive) return;
    ball.classList.add('landed');
    for (let i = 0; i < 3; i++) {
      await pause(520);
      if (!alive) return;
      ball.classList.remove('wobble'); void ball.offsetWidth; ball.classList.add('wobble');
      play('shake');
    }
    await pause(620);
    if (!alive) return;
    // it always works (and nothing ever says so)
    play('caught');
    playCry(a.id);
    const at = elCenter(ball);
    leafBurst(at.px, at.py);
    ball.classList.add('caught');
    removeVisitor(a);
    later(() => { ball.classList.add('gone'); later(() => ball.remove(), 500); }, 1100);
    if (!asleep) jump(B);
    busy = null;
    later(trySpawnVisitor, 2500);
  }

  // ---- BULBA ---------------------------------------------------------------
  let stonePref = null;      // 'right' | 'left' | null: keep the Everstone off a decoration he is playing by
  function bulbaMove(x, y, opts) {
    if (busy === 'evolve') return 0;
    stonePref = null;
    const ms = moveTo(B, Math.max(0.12, Math.min(0.88, x)), Math.max(0.12, Math.min(0.84, y)), opts);
    parallax();
    stoneSide();
    return ms;
  }
  function stoneSide() {
    const half = parseFloat(B.el.style.getPropertyValue('--half')) || 44;
    const tap = stoneBtn.offsetWidth || 60;
    const edge = B.x * fs().w < half + tap + 12;
    B.el.classList.toggle('stone-right', edge || stonePref === 'right');
  }
  function parallax() {
    const off = (B.x - 0.5);
    hillsFar.style.transform = `translateX(${(-off * 14).toFixed(1)}px)`;
    hillsNear.style.transform = `translateX(${(-off * 30).toFixed(1)}px)`;
  }
  function tapBulba() {
    play('tap');
    if (busy === 'evolve') return;
    playCry(L.stageId(bulba.stage));
    jump(B);
    hearts(B);
  }
  const STONE_HOLD_MS = 1500;
  let stoneT = null;
  function stoneDown(e) {
    if (busy === 'evolve' || bulba.stage >= 3) return;
    if (bulba.stayStone) { toggleStone(); return; }            // OFF: one tap
    try { if (e && e.pointerId != null) stoneBtn.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
    cancel(stoneT);
    stoneBtn.classList.add('holding');
    // A real-time hold even under ?fast=1: it is a grown-up-style gesture.
    stoneT = setTimeout(() => {
      timers.delete(stoneT); stoneT = null; stoneBtn.classList.remove('holding');
      if (alive && !bulba.stayStone) toggleStone();
    }, STONE_HOLD_MS);
    timers.add(stoneT);
  }
  function stoneUp() {
    if (!stoneT) return;
    cancel(stoneT); stoneT = null;
    stoneBtn.classList.remove('holding');
    play('tap'); jump(B);                                       // a tap just says hello
  }
  function toggleStone() {
    play('tap');
    if (busy === 'evolve' || bulba.stage >= 3) return;
    bulba.stayStone = !bulba.stayStone;
    updateBulbaLook();
    jump(B);
    save();
    if (L.budReady(bulba)) later(lookAtBud, 400);
  }
  // The bud is glowing: Bulba stops, peeks up at it and wiggles, and the bud
  // twinkles, so Art's eye goes to it. No words; slow and calm-safe.
  function lookAtBud() {
    if (asleep || busy || !L.budReady(bulba)) return;
    cancel(B.moveT); B.el.classList.remove('moving');
    B.hop.classList.remove('jump', 'sniff', 'lookbud'); void B.hop.offsetWidth;
    B.hop.classList.add('lookbud');
    bud.classList.remove('peeked'); void bud.offsetWidth; bud.classList.add('peeked');
    later(() => { B.hop.classList.remove('lookbud'); bud.classList.remove('peeked'); }, 1800);
  }
  function sleep() {
    if (asleep || busy) return;
    asleep = true;
    B.el.classList.add('asleep');
  }
  function wakeUp() {
    if (!asleep) return;
    asleep = false;
    B.el.classList.remove('asleep');
    jump(B);
  }
  function onAnyInput() {
    try { unlock(); } catch (e) { /* noop */ }
    startMusic();
    lastInput = Date.now();
    nextIdleAt = lastInput + rand(4000, 7000);
    if (asleep) wakeUp();
  }
  async function tapBud() {
    play('tap');
    if (busy || !L.budReady(bulba)) return;
    busy = 'evolve';
    closeDrawer(); setBerryMode(false); closeDecor(); dropHeld();
    cancel(B.moveT); B.el.classList.remove('moving');
    play('evolve');
    B.el.classList.add('evolving');                  // slow, gentle glow (<1 pulse/s)
    await pause(1400);
    if (!alive) return;
    B.el.classList.add('silhouette');
    petalStorm();
    await pause(2200);
    if (!alive) return;
    const hadBaby = bulba.stage >= 2;
    L.evolve(bulba);
    save(); flush();                                 // something he keeps: to disk now
    const id = L.stageId(bulba.stage);
    // A fresh <img>, so the new stage gets its OWN fallback chain (gif -> png
    // -> pokeball). Changing src on the old one would fall back to the old
    // stage's png if the new gif failed.
    const grown = spriteImg(id, { animated: true });
    grown.classList.add('gd-img');
    sizeImg(grown, 1);
    B.faceEl.replaceChild(grown, B.img);
    B.img = grown;
    B.el.dataset.id = String(id);
    B.el.classList.remove('silhouette');
    B.el.classList.add('bloomed');
    play('bloom');
    playCry(id);
    await pause(1200);
    if (!alive) return;
    B.el.classList.remove('evolving', 'bloomed');
    updateBulbaLook();
    busy = null;
    if (!hadBaby && bulba.stage >= 2) later(spawnBaby, 800);
  }

  // The small one is never gone: after the first evolution a baby Bulbasaur
  // lives in the garden for good.
  function spawnBaby() {
    if (baby || bulba.stage < 2) return;
    baby = makeActor(1, { scale: 0.75, cls: 'gd-baby' });
    listen(baby.body, 'pointerdown', e => { e.stopPropagation(); e.preventDefault(); onAnyInput(); play('tap'); playCry(1); jump(baby); });
    place(baby, B.x < 0.5 ? 0.72 : 0.28, 0.7);
    setFace(baby, B.x < 0.5 ? -1 : 1);
  }

  // ---- the ground: tap to grow ----------------------------------------------
  function onFieldTap(e) {
    e.preventDefault();
    onAnyInput();
    play('tap');
    if (drawerOpen) { closeDrawer(); return; }
    if (decorOpen) { closeDecor(); return; }
    if (berryMode) setBerryMode(false);
    // A second finger while the first still holds a decoration: moving or
    // placing now would rebuild the decor layer under that finger.
    if (drag) return;
    const f = fs();
    const px = e.clientX - f.left, py = e.clientY - f.top;
    if (f.w <= 0 || f.h <= 0) return;
    const x = L.clamp01(px / f.w), y = L.clamp01(py / f.h);
    if (held) { putHeld(x, y); return; }
    if (sel != null) { moveSelected(x, y); return; }
    if (y < 0.05) { sparkle(px + f.left - scene.getBoundingClientRect().left, py + f.top - scene.getBoundingClientRect().top); return; }
    const near = L.findPlotNear(garden.plots, px, py, f.w, f.h, Math.max(30, f.w * 0.07));
    let spot;
    if (near >= 0) {
      spot = garden.plots[near];
      if (L.growPlot(spot)) {
        play('grow'); renderPlot(spot, true); gainPetals(1, spot.x, spot.y);
      } else pickBerries(spot);
    } else {
      spot = L.addPlot(garden, x, Math.max(0.06, Math.min(0.97, y)));
      renderAllPlots(); renderPlot(spot, true);
      play('grow'); gainPetals(1, spot.x, spot.y);
    }
    // Bulba hops over to see (stopping just beside it); if one of Art's
    // decorations is right there, he plays with it when he arrives.
    const side = spot.x >= B.x ? -1 : 1;
    const ms = bulbaMove(spot.x + side * 0.1, spot.y + 0.02);
    const nd = DC.nearestDecor(garden.decor, px, py, f.w, f.h, Math.max(50, f.w * 0.12));
    if (nd >= 0 && ms) { cancel(reactT); reactT = later(() => doReact(nd), ms + 60); }
  }
  function pickBerries(pl) {
    const now = Date.now();
    if ((bushRest.get(pl) || 0) > now) { const el = plotEls.get(pl); if (el) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } return; }
    bushRest.set(pl, now + 8000);
    renderPlot(pl, true);
    later(() => renderPlot(pl), 8100);
    const beforeBerries = Number(garden.berries) || 0;
    garden.berries = beforeBerries + 1;
    const gifts = L.giftsDue(beforeBerries, garden.berries);
    // The gift lands on disk in the SAME commit as the berry that earned it:
    // an unmount or app-kill during the flying-box animation must not lose it.
    if (gifts > 0) { try { if (store.addGift) store.addGift(gifts); } catch (e) { /* a gift is a bonus; never breaks the garden */ } }
    const from = sceneXY(pl.x, pl.y), to = elCenter(basketBtn);
    const b = h('img', { class: 'gd-flying', attrs: { src: ITEM(L.kindInfo(pl.kind).berry), alt: '', draggable: 'false' }, style: { left: from.px + 'px', top: (from.py - 20) + 'px' } });
    fx.appendChild(b);
    const ms = dur(500);
    try {
      b.animate([{ transform: 'translate(-50%,-50%)' }, { transform: `translate(calc(-50% + ${to.px - from.px}px), calc(-50% + ${to.py - from.py + 20}px)) scale(.7)` }], { duration: ms, easing: 'ease-in', fill: 'forwards' });
    } catch (e) { /* noop */ }
    later(() => {
      b.remove(); play('petal'); updateBerries(); basketBtn.classList.remove('pop'); void basketBtn.offsetWidth; basketBtn.classList.add('pop');
      if (gifts > 0) sendGift(from, gifts);
    }, ms);
    save();
  }

  // ---- gifts for the Road: every 10 berries, a leaf-stamped box flies off to
  // the signpost. It is Art SENDING something: nothing of his goes down.
  // Purely visual: the gift itself was already stored by pickBerries.
  function sendGift(from, n) {
    const to = elCenter(roadBtn);
    const box = h('div', { class: 'gd-gift', attrs: { 'aria-hidden': 'true' }, style: { left: from.px + 'px', top: (from.py - 30) + 'px' } },
      h('span', { class: 'gd-gift-box' }, E.gift), h('span', { class: 'gd-gift-leaf' }, E.leaf));
    fx.appendChild(box);
    const ms = dur(1300);
    const dx = to.px - from.px, dy = to.py - (from.py - 30);
    try {
      box.animate([
        { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 1, offset: 0.18 },
        { transform: `translate(calc(-50% + ${dx / 2}px), calc(-50% + ${dy / 2 - 90}px)) scale(1) rotate(-12deg)`, offset: 0.55 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.5) rotate(8deg)`, opacity: 1, offset: 0.9 },
        { transform: `translate(calc(-50% + ${dx + 40}px), calc(-50% + ${dy - 30}px)) scale(.2)`, opacity: 0 },
      ], { duration: ms, easing: 'ease-in-out', fill: 'forwards' });
    } catch (e) { /* old WebKit: the box just vanishes */ }
    if (!asleep && busy !== 'evolve') { jump(B); hearts(B); }
    play('bloom');
    later(() => {
      box.remove();
      play('petal');
      roadBtn.classList.remove('gifted'); void roadBtn.offsetWidth; roadBtn.classList.add('gifted');
      later(() => roadBtn.classList.remove('gifted'), 900);
    }, ms);
  }
  listen(field, 'pointerdown', onFieldTap);
  listen(sky, 'pointerdown', e => {
    e.preventDefault(); onAnyInput(); play('tap');
    if (drawerOpen) return closeDrawer();
    const s = scene.getBoundingClientRect(); sparkle(e.clientX - s.left, e.clientY - s.top);
    if (busy !== 'evolve') jump(B);
  });

  // ==== ART'S DECORATIONS (batch 4) =========================================
  // Unlocks come from petals only (data/decor.js): one decoration every 10,
  // one accessory for Bulba every 25. Nothing here is on a clock. He can put
  // things down and move them; there is no way to remove one (no bin, and a
  // decoration dragged off the edge snaps back home).
  if (!Array.isArray(garden.decor)) garden.decor = [];
  // The scene is overflow:hidden but can still be scrolled by focus or
  // scrollIntoView; a scrolled garden would put every tap in the wrong spot.
  const unscroll = el => { if (el.scrollTop || el.scrollLeft) { el.scrollTop = 0; el.scrollLeft = 0; } };
  listen(scene, 'scroll', () => unscroll(scene));
  listen(field, 'scroll', () => unscroll(field));
  listen(root, 'scroll', () => unscroll(root));
  let decorOpen = false;
  let held = null;          // a decoration kind in his hand, waiting for a tap on the ground
  let sel = null;           // index of a placed decoration picked up by a tap (tap-then-tap move)
  let drag = null;          // { i, el, pid, sx, sy, moved }
  let reactT = null;
  let giftEl = null, giftOpening = false;
  const giftQueue = [];

  // ---- the per-player "seen" memory (not the save; see SEEN_KEY) ----------
  const seenPlayer = String(store.current === 2 ? 2 : 1);
  function readSeen() {                 // undefined: storage unusable; null: nothing yet
    try {
      const all = JSON.parse(globalThis.localStorage.getItem(SEEN_KEY) || 'null');
      const r = all && typeof all === 'object' ? all[seenPlayer] : null;
      return r && typeof r === 'object' ? r : null;
    } catch (e) { return undefined; }
  }
  function writeSeen() {
    try {
      let all = null;
      try { all = JSON.parse(globalThis.localStorage.getItem(SEEN_KEY) || 'null'); } catch (e) { all = null; }
      if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
      all[seenPlayer] = { ann: seen.ann, worn: seen.worn.slice(0, 16) };
      globalThis.localStorage.setItem(SEEN_KEY, JSON.stringify(all));
    } catch (e) { /* a convenience only */ }
  }
  const unlockedNow = DC.unlocksAt(bulba.petals).length;
  const seenRaw = readSeen();
  const seen = { ann: unlockedNow, worn: [] };
  if (seenRaw) {
    const a = Math.floor(Number(seenRaw.ann));
    seen.ann = Number.isFinite(a) ? Math.max(0, Math.min(unlockedNow, a)) : Math.max(0, unlockedNow - 1);
    seen.worn = Array.isArray(seenRaw.worn) ? seenRaw.worn.filter(k => DC.accessoryInfo(k)) : [];
  } else if (seenRaw === null) {
    seen.ann = Math.max(0, unlockedNow - 1);    // first visit with unlocks waiting: one box, for the newest
  }
  // Waiting announcements from petals earned away from the garden (the
  // Family Table gives petals too). At most one box on arrival; anything
  // older is simply already in his drawer.
  {
    const pending = DC.unlocksAt(bulba.petals).slice(seen.ann);
    if (pending.length > 1) { seen.ann += pending.length - 1; writeSeen(); }
    if (pending.length) giftQueue.push(pending[pending.length - 1]);
  }

  // ---- drawing: every decoration and accessory is a picture ---------------
  function artFor(info, base) {
    const look = info.look || {};
    const kids = [];
    for (let i = 0; i < (look.parts | 0); i++) kids.push(h('i'));
    if (look.item) kids.push(h('img', { class: 'gd-art-item', attrs: { src: ITEM(look.item), alt: '', draggable: 'false' } }));
    for (const em of (look.emoji || [])) kids.push(h('span', { class: 'gd-art-emo' }, em));
    return h('div', { class: `${base} ${base}-${info.key}` }, kids);
  }
  const decorArt = info => artFor(info, 'gd-dc-art');
  const accArt = info => artFor(info, 'gd-acc-art');

  function renderDecor(popIdx = -1) {
    // The lifted element is about to be replaced: a drag cannot outlive it
    // (its pointer capture goes with it and endDrag would never run).
    drag = null;
    clear(decorLayer);
    garden.decor.forEach((d, i) => {
      const info = DC.decorInfo(d.kind);
      if (!info) return;              // a kind from a newer game: kept in the save, just not drawn
      const el = h('div', {
        class: 'gd-dc' + (info.wide ? ' wide' : '') + (info.tall ? ' tall' : '') + (sel === i ? ' sel' : '') + (i === popIdx ? ' pop' : ''),
        attrs: { role: 'button', 'aria-label': 'decoration' }, dataset: { i: String(i), kind: d.kind },
      }, decorArt(info));
      const y = Math.min(d.y, decorMaxY());      // drawn above the buttons; the save keeps its own y
      el.style.left = (d.x * 100) + '%';
      el.style.top = (y * 100) + '%';
      el.style.zIndex = String(10 + Math.round(y * 100));
      decorLayer.appendChild(el);
    });
    scene.dataset.decor = String(garden.decor.length);
  }
  const decorElAt = i => decorLayer.querySelector(`.gd-dc[data-i="${Number(i)}"]`);

  function updateAccessory() {
    clear(accEl);
    const info = DC.accessoryInfo(bulba.accessory);
    accEl.className = 'gd-acc' + (info ? ' slot-' + info.slot : '');
    if (info) accEl.appendChild(accArt(info));
  }

  // ---- the decor button and its picture strip ------------------------------
  function isFreshAcc(key) { return !seen.worn.includes(key) && bulba.accessory !== key; }
  function updateDecorBtn() {
    const any = DC.unlocksAt(bulba.petals).length > 0;
    const revealed = seen.ann > 0 || !giftQueue.length;
    decorBtn.hidden = !(any && revealed);
    const fresh = DC.freshDecorKinds(bulba.petals, garden.decor).length > 0
      || DC.unlockedAccessories(bulba.petals).some(a => isFreshAcc(a.key));
    decorBtn.classList.toggle('fresh', fresh && !held);
    decorBtn.classList.toggle('holding', !!held);
    clear(heldSlot);
    const hi = held && DC.decorInfo(held);
    if (hi) heldSlot.appendChild(decorArt(hi));
    scene.classList.toggle('decor-mode', !!held);
  }
  function stripItem(art, fresh, on, cls) {
    return h('button', {
      class: 'gd-dopt ' + cls + (fresh ? ' fresh' : ''), attrs: { type: 'button', 'aria-label': 'item' },
      // pointerdown: no focus (focus would scroll the overflow-hidden scene on
      // iOS); the tap itself is a click, so a sideways swipe still scrolls the strip.
      on: { pointerdown: e => { e.stopPropagation(); e.preventDefault(); }, click: e => { e.stopPropagation(); onAnyInput(); on(); } },
    }, art, fresh ? h('span', { class: 'gd-dopt-spark', attrs: { 'aria-hidden': 'true' } }, E.spark) : null);
  }
  function renderStrip() {
    clear(dRowDecor); clear(dRowAcc);
    const fresh = new Set(DC.freshDecorKinds(bulba.petals, garden.decor));
    // Newest first, and anything he has never used at the very front.
    const dec = DC.unlockedDecor(bulba.petals).slice().reverse();
    dec.sort((a, b) => (fresh.has(b.key) ? 1 : 0) - (fresh.has(a.key) ? 1 : 0));
    for (const d of dec) dRowDecor.appendChild(stripItem(decorArt(d), fresh.has(d.key), () => pickDecor(d.key), 'dec'));
    const acc = DC.unlockedAccessories(bulba.petals).slice().reverse();
    acc.sort((a, b) => (isFreshAcc(b.key) ? 1 : 0) - (isFreshAcc(a.key) ? 1 : 0));
    dRowAcc.hidden = !acc.length;
    if (acc.length) {
      dRowAcc.appendChild(h('span', { class: 'gd-drow-lead', attrs: { 'aria-hidden': 'true' } },
        h('img', { attrs: { src: spriteUrl(L.stageId(bulba.stage)), alt: '', draggable: 'false' } })));
      for (const a of acc) {
        const b = stripItem(accArt(a), isFreshAcc(a.key), () => pickAccessory(a.key), 'acc');
        if (bulba.accessory === a.key) b.classList.add('worn');
        dRowAcc.appendChild(b);
      }
    }
    dRowDecor.scrollLeft = 0; dRowAcc.scrollLeft = 0;
  }
  function tapDecorBtn() {
    play('tap');
    if (busy === 'evolve') return;
    if (decorOpen) { closeDecor(); return; }
    if (held) { dropHeld(); }
    openDecor();
  }
  function openDecor() {
    if (busy === 'evolve') return;
    closeDrawer(); setBerryMode(false); deselect();
    renderStrip();
    decorOpen = true;
    dsheet.classList.add('open'); dshade.classList.add('open');
    dsheet.setAttribute('aria-hidden', 'false');
  }
  function closeDecor() {
    decorOpen = false;
    dsheet.classList.remove('open'); dshade.classList.remove('open');
    dsheet.setAttribute('aria-hidden', 'true');
  }
  function pickDecor(key) {
    play('tap');
    held = key;
    closeDecor();
    updateDecorBtn();
    jump(B);
  }
  function dropHeld() { if (!held) return; held = null; updateDecorBtn(); }
  function pickAccessory(key) {
    const next = bulba.accessory === key ? null : key;     // tap the one he wears to take it off
    try { store.setAccessory(next); } catch (e) { /* never breaks the garden */ }
    if (next && !seen.worn.includes(next)) { seen.worn.push(next); writeSeen(); }
    updateAccessory(); updateDecorBtn(); renderStrip();
    play(next ? 'petal' : 'tap');
    if (!asleep) { jump(B); if (next) hearts(B); }
    const c = elCenter(B.body); sparkle(c.px, c.py - 40);
  }

  // ---- putting things down, moving them -------------------------------------
  const fitX = x => Math.max(0.04, Math.min(0.96, x));
  // A decoration's foot stays above the bottom buttons (on a phone they
  // cover the lowest part of the field), so nothing he puts down hides.
  function decorMaxY() {
    try {
      const f = fs(), b = bottomBar && bottomBar.getBoundingClientRect();
      if (!b || !f.h || !b.height) return 0.97;
      return Math.max(0.5, Math.min(0.97, (b.top + 8 - f.top) / f.h));
    } catch (e) { return 0.97; }
  }
  const fitY = y => Math.max(0.08, Math.min(decorMaxY(), y));
  function putHeld(x, y) {
    const kind = held;
    dropHeld();
    x = fitX(x); y = fitY(y);
    const act = DC.decorAction(garden.decor, kind, MAX_DECOR);
    let idx = -1;
    try {
      if (act.op === 'place') { if (store.placeDecor(kind, x, y)) idx = garden.decor.length - 1; }
      else if (act.op === 'move') { if (store.moveDecor(act.i, x, y)) idx = act.i; }
    } catch (e) { /* never breaks the garden */ }
    const { px, py } = sceneXY(x, y);
    if (idx < 0) { sparkle(px, py - 20); return; }
    renderDecor(idx);
    play('grow'); leafBurst(px, py - 20);
    updateDecorBtn();
    visitDecor(idx);
  }
  function deselect() {
    if (sel == null) return;
    const el = decorElAt(sel); if (el) el.classList.remove('sel');
    sel = null;
  }
  function moveSelected(x, y) {
    const i = sel;
    deselect();
    let ok = null;
    try { ok = store.moveDecor(i, fitX(x), fitY(y)); } catch (e) { ok = null; }
    if (!ok) return;
    renderDecor(i);
    play('grow');
    visitDecor(i);
  }
  function fieldFrac(e) {
    const f = fs();
    return { x: (e.clientX - f.left) / (f.w || 1), y: (e.clientY - f.top) / (f.h || 1), f };
  }
  listen(decorLayer, 'pointerdown', e => {
    const el = e.target && e.target.closest ? e.target.closest('.gd-dc') : null;
    if (!el) return;
    e.stopPropagation(); e.preventDefault(); onAnyInput();
    if (busy === 'evolve' || drag) return;
    if (drawerOpen) { closeDrawer(); return; }
    if (held) { const q = fieldFrac(e); putHeld(q.x, q.y); return; }   // put it down right here
    const i = Number(el.dataset.i);
    if (!garden.decor[i]) return;
    drag = { i, el, pid: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    el.classList.add('lift');
  });
  listen(decorLayer, 'pointermove', e => {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 10) return;
    if (!drag.moved) { drag.moved = true; deselect(); drag.el.classList.add('dragging'); }
    const q = fieldFrac(e);
    const yb = q.y + 18 / (q.f.h || 1);           // his finger holds the middle; the base sits just below
    drag.el.style.left = (q.x * 100) + '%';
    drag.el.style.top = (yb * 100) + '%';
    drag.el.style.zIndex = '130';
    drag.el.classList.toggle('off', q.x < 0 || q.x > 1 || yb < 0.03 || yb > 1.02);
  });
  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.pid) return;
    const { i, el, moved } = drag;
    drag = null;
    el.classList.remove('lift', 'dragging', 'off');
    try { el.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
    const d = garden.decor[i];
    if (!d) { renderDecor(); return; }
    if (!moved) {                               // a tap: pick it up (tap the ground to move it), and Bulba comes to play
      if (cancelled) return;
      play('tap');
      if (sel === i) { deselect(); return; }
      deselect();
      sel = i; el.classList.add('sel');
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
      visitDecor(i);
      return;
    }
    const q = fieldFrac(e);
    const yb = q.y + 18 / (q.f.h || 1);
    if (cancelled || q.x < 0 || q.x > 1 || yb < 0.03 || yb > 1.02) {
      // off the edge: it hops back home. Nothing is ever lost.
      el.classList.add('snap');
      el.style.left = (d.x * 100) + '%'; el.style.top = (d.y * 100) + '%';
      el.style.zIndex = String(10 + Math.round(d.y * 100));
      later(() => { if (el.isConnected) el.classList.remove('snap'); }, 450);
      play('tap');
      return;
    }
    let ok = null;
    try { ok = store.moveDecor(i, fitX(q.x), fitY(yb)); } catch (err) { ok = null; }
    renderDecor(ok ? i : -1);
    if (ok) { play('grow'); visitDecor(i); }
  }
  listen(decorLayer, 'pointerup', e => endDrag(e, false));
  listen(decorLayer, 'pointercancel', e => endDrag(e, true));
  // Safety net: if capture is lost (the element was detached, the OS took the
  // touch), the drag still ends, so decorations never stop answering taps.
  listen(decorLayer, 'lostpointercapture', e => { if (drag && e.pointerId === drag.pid) endDrag(e, true); });
  listen(window, 'pointerup', e => { if (drag && e.pointerId === drag.pid) endDrag(e, true); });
  listen(window, 'pointercancel', e => { if (drag && e.pointerId === drag.pid) endDrag(e, true); });

  // ---- Bulba plays with Art's things ------------------------------------------
  const REACTS = ['r-sit', 'r-swing', 'r-splash', 'r-hop', 'r-hug', 'r-dig', 'r-watch', 'sniff'];
  function endReact() {
    cancel(reactT); reactT = null;
    if (B && B.hop) B.hop.classList.remove(...REACTS);
    if (B && B.el) B.el.classList.remove('on-swing');
    decorLayer.querySelectorAll('.gd-dc.play').forEach(el => el.classList.remove('play'));
  }
  function visitDecor(i) {
    const d = garden.decor[i], info = d && DC.decorInfo(d.kind);
    if (!info || busy === 'evolve' || asleep) return;
    let tx, ty;
    if (info.react === 'swing') { tx = d.x; ty = d.y + 0.005; }
    else { [tx, ty] = besideDecor(i); }
    const ms = bulbaMove(tx, ty, { speed: 3 });
    stonePref = tx > d.x ? 'right' : 'left'; stoneSide();
    reactT = later(() => doReact(i), (ms || 0) + 60);
  }
  // A spot right next to decoration i where Bulba does not cover it (so Art
  // can still grab it): half of Bulba + half of the thing, in pixels.
  function besideDecor(i) {
    const d = garden.decor[i];
    const f = fs();
    const el = decorElAt(i);
    const half = parseFloat(B.el.style.getPropertyValue('--half')) || 44;
    const dw = el ? el.offsetWidth / 2 : 40;
    const off = (half + dw + 6) / (f.w || 1);
    const side = d.x >= B.x ? -1 : 1;
    let tx = d.x + side * off;
    if (tx < 0.12 || tx > 0.88) tx = d.x - side * off;
    return [tx, d.y + 0.01];
  }
  function doReact(i) {
    const d = garden.decor[i], info = d && DC.decorInfo(d.kind);
    if (!info || asleep || busy) return;
    endReact();
    if (info.react !== 'swing') setFace(B, d.x > B.x ? 1 : -1);
    const el = decorElAt(i);
    if (el) { el.classList.remove('play'); void el.offsetWidth; el.classList.add('play'); }
    const r = info.react === 'sniff' ? 'sniff' : 'r-' + info.react;
    B.hop.classList.remove(r); void B.hop.offsetWidth; B.hop.classList.add(r);
    if (info.react === 'swing') B.el.classList.add('on-swing');
    const at = sceneXY(d.x, d.y);
    if (info.react === 'splash') {
      for (let k = 0; k < 4; k++) {
        const p2 = fxEl('gd-drop', at.px + (k - 1.5) * 16, at.py - 50, E.drop, 1100);
        p2.style.animationDelay = (k * 110) + 'ms';
      }
      play('petal');
    } else if (info.react === 'hug') { hearts(B); }
    else if (info.react === 'dig') {
      for (let k = 0; k < 5; k++) { const p2 = fxEl('gd-dust', at.px + rand(-30, 30), at.py - rand(4, 20), null, 900); p2.style.animationDelay = (k * 90) + 'ms'; }
    } else if (info.react === 'watch') { sparkle(at.px, at.py - 70); }
    if (rng() < 0.35) ambientCry(L.stageId(bulba.stage));
    reactT = later(() => {
      B.hop.classList.remove(r); B.el.classList.remove('on-swing'); if (el) el.classList.remove('play');
      if (info.react === 'swing' && !asleep && !busy && garden.decor[i]) {
        const [tx, ty] = besideDecor(i); bulbaMove(tx, ty, { speed: 3 });
        stonePref = tx > garden.decor[i].x ? 'right' : 'left'; stoneSide();
      }   // hop off, so the swing is his to grab again
    }, info.react === 'swing' ? 2600 : 2000);
  }

  // ---- a new unlock: a gift box drops from the sky; tap it to open --------
  function dropGift() {
    if (!alive || giftEl || !giftQueue.length) return;
    if (busy === 'evolve') { later(dropGift, 2500); return; }
    const x = rng() < 0.5 ? rand(0.12, 0.3) : rand(0.7, 0.88);
    const y = rand(0.1, 0.2);
    giftOpening = false;
    giftEl = h('button', {
      class: 'gd-gbox', attrs: { type: 'button', 'aria-label': 'gift' },
      on: { pointerdown: e => { e.stopPropagation(); e.preventDefault(); onAnyInput(); openGift(); } },
    }, h('span', { class: 'gd-gbox-emo' }, E.gift), h('span', { class: 'gd-gbox-leaf' }, E.leaf));
    giftEl.style.left = (x * 100) + '%';
    giftEl.style.top = (y * 100) + '%';
    giftEl.dataset.x = String(x); giftEl.dataset.y = String(y);
    giftLayer.appendChild(giftEl);
    later(() => {
      if (!giftEl) return;
      giftEl.classList.add('landed');
      play('caught');                           // the jingle
      const at = sceneXY(x, y); sparkle(at.px, at.py - 30);
      if (!asleep && busy !== 'evolve') { const side = x >= B.x ? -1 : 1; bulbaMove(x + side * 0.12, y + 0.03, { speed: 3, done: () => jump(B) }); }
    }, 750);
  }
  function openGift() {
    if (!giftEl || giftOpening) return;
    giftOpening = true;
    const box = giftEl;
    const u = giftQueue.shift();
    const idx = u ? DC.ALL_UNLOCKS.findIndex(a => a.type === u.type && a.key === u.key) : -1;
    if (idx >= 0 && idx + 1 > seen.ann) { seen.ann = idx + 1; writeSeen(); }
    play('bloom');
    box.classList.add('open');
    const at = sceneXY(Number(box.dataset.x), Number(box.dataset.y));
    leafBurst(at.px, at.py - 20);
    const info = u && (u.type === 'acc' ? DC.accessoryInfo(u.key) : DC.decorInfo(u.key));
    decorBtn.hidden = false;
    let fly = null;
    if (info) {
      fly = h('div', { class: 'gd-gfly', style: { left: at.px + 'px', top: (at.py - 30) + 'px' } }, u.type === 'acc' ? accArt(info) : decorArt(info));
      fx.appendChild(fly);
    }
    later(() => {
      box.remove(); if (giftEl === box) giftEl = null;
      if (!fly) { updateDecorBtn(); later(dropGift, 1200); return; }
      const to = elCenter(decorBtn);
      const ms = dur(700);
      try {
        fly.animate([
          { transform: 'translate(-50%,-50%) scale(1.3)' },
          { transform: `translate(calc(-50% + ${(to.px - at.px) / 2}px), calc(-50% + ${(to.py - at.py) / 2 - 80}px)) scale(1)` },
          { transform: `translate(calc(-50% + ${to.px - at.px}px), calc(-50% + ${to.py - at.py + 30}px)) scale(.4)` },
        ], { duration: ms, easing: 'ease-in-out', fill: 'forwards' });
      } catch (e) { /* old WebKit: it just vanishes */ }
      later(() => {
        fly.remove();
        play('petal');
        updateDecorBtn();
        decorBtn.classList.remove('pop'); void decorBtn.offsetWidth; decorBtn.classList.add('pop');
        later(dropGift, 1200);
      }, ms);
    }, 900);
  }

  // ---- idle life: bob (CSS), wander, sniff flowers, nap ----------------------
  function idleTick() {
    const now = Date.now();
    if (busy) return;
    if (!asleep && now - lastInput > NAP_AFTER) { sleep(); return; }
    if (asleep || now < nextIdleAt) return;
    nextIdleAt = now + rand(4500, 8000);
    if (L.budReady(bulba) && rng() < 0.5) { lookAtBud(); return; }
    if (garden.decor.length && drag == null && rng() < 0.4) {
      visitDecor(Math.floor(rng() * garden.decor.length));
      if (baby && rng() < 0.6) moveTo(baby, rand(0.15, 0.85), rand(0.45, 0.8), { speed: 3.2 });
      return;
    }
    const flowers = garden.plots.filter(pl => L.plotLook(pl.grown) !== 'sprout');
    if (flowers.length && rng() < 0.55) {
      const fl = flowers[Math.floor(rng() * flowers.length)];
      const side = fl.x >= B.x ? -1 : 1;
      const ms = moveTo(B, Math.max(0.12, Math.min(0.88, fl.x + side * 0.09)), Math.max(0.12, Math.min(0.84, fl.y + 0.02)), { speed: 3 });
      parallax(); stoneSide();
      setFace(B, side < 0 ? 1 : -1);
      later(() => { if (asleep || busy) return; B.hop.classList.add('sniff'); later(() => B.hop.classList.remove('sniff'), 1400); }, ms + 50);
    } else {
      bulbaMove(B.x + rand(-0.15, 0.15), B.y + rand(-0.08, 0.08), { speed: 3 });
    }
    if (baby && rng() < 0.6) moveTo(baby, rand(0.15, 0.85), rand(0.45, 0.8), { speed: 3.2 });
    visitors.forEach(v => { if (rng() < 0.3 && !v.el.classList.contains('absorbed')) { jump(v); } });
  }
  intervals.push(setInterval(() => { if (alive) idleTick(); }, 1000));

  // ---- layout: re-place actors when the screen changes -----------------------
  function relayout() {
    [B, baby, ...visitors].forEach(a => { if (a) place(a, a.x, a.y, 0); });
  }
  let ro = null;
  try { ro = new ResizeObserver(() => { if (alive) relayout(); }); ro.observe(field); } catch (e) { listen(window, 'resize', relayout); }

  // ---- music: the garden's own gentle tune (after the first tap) ------------
  let musicOn = false;
  function startMusic() {
    if (musicOn || !alive || !heard()) return;
    musicOn = true;
    try { music.playMusic('garden'); } catch (e) { /* music is a bonus */ }
  }
  startMusic();

  // ---- first paint -----------------------------------------------------------
  renderAllPlots();
  renderDecor(); updateAccessory(); updateDecorBtn();
  if (giftQueue.length) later(dropGift, 1800);
  updateMeter(); updateBerries(); updateBallBtn();
  place(B, 0.86, 0.9);
  setFace(B, -1);
  updateBulbaLook();
  parallax();
  if (bulba.stage >= 2) spawnBaby();
  // Bulba runs up to say hello
  requestAnimationFrame(() => {
    if (!alive) return;
    relayout();
    if (!drag) renderDecor();       // now the field has a size: clamp above the buttons
    bulbaMove(0.5, 0.58, { speed: 3, done: () => { ambientCry(L.stageId(bulba.stage)); jump(B); } });
  });
  // On purpose: every visit to the garden brings a friend once he has a few
  // petals, even if he just came back. It never takes anything away, and a
  // four-year-old coming home to a visitor is the point (Kevin's fun rule).
  if (bulba.petals >= L.PETALS_PER_VISITOR) { pendingVisitors++; later(trySpawnVisitor, 2600); }
  if (L.budReady(bulba)) later(lookAtBud, 3200);

  // test/debug hook: DOM-only, read-only numbers
  scene.dataset.petals = String(bulba.petals);
  const offChange = store.on ? store.on('change', () => { scene.dataset.petals = String(bulba.petals); }) : null;

  return function unmount() {
    flush();
    alive = false;
    try { music.stopMusic(); } catch (e) { /* ignore */ }
    if (abort) abort.abort();
    for (const t of timers) clearTimeout(t);
    timers.clear();
    intervals.forEach(clearInterval);
    offs.forEach(f => f());
    if (ro) ro.disconnect();
    if (typeof offChange === 'function') offChange();
    if (addedCalm) document.body.classList.remove('calm');
    root.classList.remove('garden-scene');
    clear(root);
  };
}
