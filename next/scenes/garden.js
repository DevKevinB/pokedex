// SPROUT ROAD: ART'S GARDEN. The most important screen in the product.
// A four-year-old pre-reader lives here with BULBA. Nothing on this screen is
// a word: meaning is picture, colour and motion. Nothing here can fail, and
// nothing here ever says so. Pure rules live in garden-logic.js (unit-tested).

import { h, clear } from '../ui/h.js';
import { spriteImg, ITEM } from '../ui/sprite.js';
import * as audio from '../audio/audio.js';
import * as music from '../audio/music.js';
import { wait, PACE } from '../core/pace.js';
import { rngFromUrl } from '../core/rng.js';
import * as L from './garden-logic.js';

const NAP_AFTER = 20000;
const MAX_VISITORS_ON_SCREEN = 2;
const BALLS = ['poke-ball', 'great-ball', 'ultra-ball', 'master-ball'];
const E = {                                      // emoji pictures (never words)
  sprout: '\u{1F331}', home: '\u{1F3E0}', sign: '\u{1FAA7}', basket: '\u{1F9FA}',
  heart: '\u{1F497}', leaf: '\u{1F343}', zzz: '\u{1F4A4}', spark: '\u{2728}',
};

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

  // ---- persistence: at most one store.commit() per second --------------
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
    if (since >= 1000) flush();
    else if (!commitT) {
      commitT = setTimeout(() => { timers.delete(commitT); commitT = null; flush(); }, 1000 - since);
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

  const berryNum = h('span', { class: 'gd-badge' });
  const basketBtn = btn('gd-basket', 'berries', () => toggleBerryMode(),
    h('span', { class: 'gd-emo' }, E.basket), h('img', { class: 'gd-basket-berry', attrs: { src: ITEM('oran-berry'), alt: '', draggable: 'false' } }), berryNum);
  const ballImg = h('img', { attrs: { src: ITEM('poke-ball'), alt: '', draggable: 'false' } });
  const ballBtn = btn('gd-ballbtn', 'ball', () => openDrawer(), ballImg);

  const plotsLayer = h('div', { class: 'gd-plots' });
  const actorsLayer = h('div', { class: 'gd-actors' });
  const field = h('div', { class: 'gd-field' }, h('div', { class: 'gd-grass' }), plotsLayer, actorsLayer);
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
    h('div', { class: 'gd-bottom' }, basketBtn, ballBtn),
    drawerShade, drawer);
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
  const stoneBtn = h('button', { class: 'gd-btn gd-stone', attrs: { type: 'button', 'aria-label': 'everstone' },
    on: { pointerdown: e => { e.stopPropagation(); e.preventDefault(); onAnyInput(); toggleStone(); } } },
    h('img', { attrs: { src: ITEM('everstone'), alt: '', draggable: 'false' } }));
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
    if (!wasReady && L.budReady(bulba)) play('bloom');
    save();
  }
  function trySpawnVisitor() {
    while (pendingVisitors > 0 && visitors.length < MAX_VISITORS_ON_SCREEN) { pendingVisitors--; spawnVisitor(); }
  }
  function spawnVisitor() {
    const id = L.pickVisitor(p.caught, visitors.map(v => v.id), rng);
    const a = makeActor(id, { cls: 'gd-visitor' });
    a.fed = false;
    const fromLeft = rng() < 0.5;
    const y = rand(0.35, 0.8);
    place(a, fromLeft ? -0.18 : 1.18, y);
    let tx = fromLeft ? rand(0.18, 0.4) : rand(0.6, 0.82);
    if (Math.abs(tx - B.x) < 0.15 && Math.abs(y - B.y) < 0.2) tx = fromLeft ? 0.15 : 0.85;
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
  function toggleBerryMode() { play('tap'); if (drawerOpen) closeDrawer(); setBerryMode(!berryMode); }

  // ---- the ball drawer: same look as battle, no odds, no counts ---------
  function markTarget(a) {
    visitors.forEach(v => v.el.classList.toggle('target', v === a));
  }
  function openDrawer() {
    play('tap');
    if (busy || !visitors.length) return;
    setBerryMode(false);
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
  function bulbaMove(x, y, opts) {
    if (busy === 'evolve') return;
    moveTo(B, Math.max(0.12, Math.min(0.88, x)), Math.max(0.12, Math.min(0.84, y)), opts);
    parallax();
    stoneSide();
  }
  function stoneSide() {
    const half = parseFloat(B.el.style.getPropertyValue('--half')) || 44;
    const tap = stoneBtn.offsetWidth || 60;
    B.el.classList.toggle('stone-right', B.x * fs().w < half + tap + 12);
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
  function toggleStone() {
    play('tap');
    if (busy === 'evolve' || bulba.stage >= 3) return;
    bulba.stayStone = !bulba.stayStone;
    updateBulbaLook();
    jump(B);
    save();
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
    closeDrawer(); setBerryMode(false);
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
    if (berryMode) setBerryMode(false);
    const f = fs();
    const px = e.clientX - f.left, py = e.clientY - f.top;
    if (f.w <= 0 || f.h <= 0) return;
    const x = L.clamp01(px / f.w), y = L.clamp01(py / f.h);
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
    // Bulba hops over to see (stopping just beside it)
    const side = spot.x >= B.x ? -1 : 1;
    bulbaMove(spot.x + side * 0.1, spot.y + 0.02);
  }
  function pickBerries(pl) {
    const now = Date.now();
    if ((bushRest.get(pl) || 0) > now) { const el = plotEls.get(pl); if (el) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } return; }
    bushRest.set(pl, now + 8000);
    renderPlot(pl, true);
    later(() => renderPlot(pl), 8100);
    garden.berries = (Number(garden.berries) || 0) + 1;
    const from = sceneXY(pl.x, pl.y), to = elCenter(basketBtn);
    const b = h('img', { class: 'gd-flying', attrs: { src: ITEM(L.kindInfo(pl.kind).berry), alt: '', draggable: 'false' }, style: { left: from.px + 'px', top: (from.py - 20) + 'px' } });
    fx.appendChild(b);
    const ms = dur(500);
    try {
      b.animate([{ transform: 'translate(-50%,-50%)' }, { transform: `translate(calc(-50% + ${to.px - from.px}px), calc(-50% + ${to.py - from.py + 20}px)) scale(.7)` }], { duration: ms, easing: 'ease-in', fill: 'forwards' });
    } catch (e) { /* noop */ }
    later(() => { b.remove(); play('petal'); updateBerries(); basketBtn.classList.remove('pop'); void basketBtn.offsetWidth; basketBtn.classList.add('pop'); }, ms);
    save();
  }
  listen(field, 'pointerdown', onFieldTap);
  listen(sky, 'pointerdown', e => {
    e.preventDefault(); onAnyInput(); play('tap');
    if (drawerOpen) return closeDrawer();
    const s = scene.getBoundingClientRect(); sparkle(e.clientX - s.left, e.clientY - s.top);
    if (busy !== 'evolve') jump(B);
  });

  // ---- idle life: bob (CSS), wander, sniff flowers, nap ----------------------
  function idleTick() {
    const now = Date.now();
    if (busy) return;
    if (!asleep && now - lastInput > NAP_AFTER) { sleep(); return; }
    if (asleep || now < nextIdleAt) return;
    nextIdleAt = now + rand(4500, 8000);
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
    bulbaMove(0.5, 0.58, { speed: 3, done: () => { ambientCry(L.stageId(bulba.stage)); jump(B); } });
  });
  if (bulba.petals >= L.PETALS_PER_VISITOR) { pendingVisitors++; later(trySpawnVisitor, 2600); }

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
