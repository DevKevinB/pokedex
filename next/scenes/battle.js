// ============================================================
// SPROUT ROAD — the battle screen.
//
// A thin DOM stage over battle/createBattle.js. The factory decides
// everything; this file only plays its events back as pictures, colour,
// motion and sound, then writes the result into the save.
//
// Foe top-right, mine bottom-left (back sprite). Move buttons are coloured
// by type and carry the type's picture, so a pre-reader can fight with the
// words removed (and for him they ARE removed). Nothing here tells him his
// Pokemon can't faint or that his balls always catch: the ball drawer looks
// the same, the numbers are just hidden.
// ============================================================

import { h, clear } from '../ui/h.js';
import { spriteImg, ITEM } from '../ui/sprite.js';
import { unlock, sfx, cry } from '../audio/audio.js';
import * as music from '../audio/music.js';
import { wait } from '../core/pace.js';
import { rngFromUrl } from '../core/rng.js';
import { buildFighter, moveInfo, movesReady } from '../core/api.js';
import { createBattle, BALL_MODS, BERRY_HEAL, movePictures, powerDots } from '../battle/createBattle.js';
import { applyXp, xpProgress, moveSeed, catchProbability } from '../data/engine.js';
import { typeEmoji, typeColors, inkFor } from '../data/config.js';
import { evolveRoute } from '../core/evo.js';
import { settleRoadEnd, roadMarks } from '../data/rival.js';
import { makeGimmick, applyR2Win, r2Marks } from '../data/round2.js';   // round2
import { bulbaIdOf } from './together.js';

const BALLS = [
  { key: 'poke', item: 'poke-ball', label: 'POKE' },
  { key: 'great', item: 'great-ball', label: 'GREAT' },
  { key: 'ultra', item: 'ultra-ball', label: 'ULTRA' },
  { key: 'master', item: 'master-ball', label: 'MASTER' }
];

const moveLabel = name => String(name || '').replace(/-/g, ' ').toUpperCase();
const pct = (hp, max) => Math.max(0, Math.min(100, (hp / Math.max(1, max)) * 100));
// Element.append() would turn a null child into the text "null"; this skips it.
const put = (el, ...kids) => { el.append(...kids.flat().filter(k => k != null && k !== false)); return el; };
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- battle view exports (see ARCHITECTURE.md "Battle view exports") ----------
export { movePictures, powerDots };
export const BERRY_ITEM = 'oran-berry';

/** The big move picture: shape glyph + 1..4 power dots + a small type badge. No words. */
export function movePicture(pic) {
  const tc = typeColors[pic.type] || typeColors.normal;
  return h('span', { class: ['bt-pic', `bt-pic-${pic.shape}`], style: { '--tc': tc }, attrs: { 'aria-hidden': 'true' } },
    h('span', { class: 'bt-pic-glyph' }, pic.glyph),
    h('span', { class: 'bt-pic-type' }, typeEmoji[pic.type] || typeEmoji.normal),
    h('span', { class: 'bt-pic-dots' }, Array.from({ length: 4 }, (_, i) => h('span', { class: ['bt-dot', { on: i < pic.dots }] }))));
}

/**
 * One move button, as the battle screen draws it. `pic` is that move's entry
 * from movePictures(moves) (pass it so same-type moves stay distinct).
 * opts: { reader:bool, onClick(e) }
 */
export function moveButton(move, pic, { reader = true, onClick = null } = {}) {
  const bg = typeColors[move.type] || typeColors.normal;
  return h('button', {
    class: ['bt-move', `t-${move.type}`, { 'bt-move-pic': !reader }],
    type: 'button',
    style: { '--tc': bg, '--ink': inkFor(bg) },
    attrs: { 'aria-label': moveLabel(move.name) },
    on: onClick ? { click: onClick } : {}
  },
  reader ? h('span', { class: 'bt-move-emoji', attrs: { 'aria-hidden': 'true' } }, typeEmoji[move.type] || typeEmoji.normal) : movePicture(pic),
  reader ? h('span', { class: 'bt-move-name' }, moveLabel(move.name)) : null);
}

/** HP percentage 0..100 for a bar. */
export const hpPercent = (hp, max) => pct(hp, max);

export function mount(root, ctx) {
  const params = ctx.params || {};
  const store = ctx.store;
  const returnTo = params.returnTo || 'road';
  const onEnd = params.onEnd ?? null;
  const wild = !!params.wild;
  const trainer = params.trainer || null;
  // params.coop: optional hooks so another scene (family-table) can ride on
  // this battle view. Every hook is optional and wrapped; a throwing hook
  // never breaks the fight.
  const coop = params.coop && typeof params.coop === 'object' ? params.coop : null;
  const hook = (name, ...args) => {
    const fn = coop && coop[name];
    if (typeof fn !== 'function') return undefined;
    try { return fn(...args); } catch (e) { console.warn('battle: coop.' + name + ' failed', e); return undefined; }
  };

  const p0 = store.player();
  const reader = p0.profile !== 'prereader';
  // Oran Berries from Art's leaf-stamped gifts. Readers only; never more
  // than the gifts actually waiting on the save.
  const giftsNow = () => { try { return store.giftCount ? store.giftCount() | 0 : 0; } catch (e) { return 0; } };
  let berries = reader ? Math.max(0, Math.min(Math.floor(Number(params.berries) || 0), giftsNow())) : 0;
  const calm = !reader || document.body.classList.contains('calm');

  let alive = true;
  let busy = true;
  let battle = null;
  let applied = false;
  // batch 4 (integrator): Wild Chapter ('wild:<i>:<j>', back to the Road)
  // and sanctum ('sanctum:<key>') results are saved in the battle's OWN
  // commit too, so a closed app on the win card or the evolve screen never
  // loses one. The data modules load lazily (as the Road loads them), so a
  // broken data file can only skip the early save, never break the fight.
  // The Road / roots scenes re-apply on return (both helpers are idempotent)
  // and celebrate from the marks handed back (letters-only keys: evolve.js).
  const earlyMod = coop || typeof onEnd !== 'string' ? null
    : /^wild:\d+:\d$/.test(onEnd) && returnTo === 'road' ? import('../data/wild-chapters.js').catch(() => null)
    : onEnd.startsWith('sanctum:') ? import('../data/sanctums.js').catch(() => null)
    : null;
  let earlyApplied = null;  // {key:'wildWon'|'sanctumWon', marks}
  let roadApplied = null;   // {bloom, seed, rival} when applyResult already saved a Road result
  const rafs = new Set();
  const shown = { me: 0, foe: 0 };      // which fighter each side is DISPLAYING
  const hpShown = { me: [], foe: [] };  // what the HP bars currently show

  // ---------- skeleton ----------
  const ui = {};
  const hud = side => h('div', { class: `bt-hud bt-hud-${side}` },
    ui[side + 'Name'] = h('div', { class: 'bt-name' }),
    h('div', { class: 'bt-hp' }, ui[side + 'Fill'] = h('div', { class: 'bt-hp-fill' })),
    ui[side + 'Nums'] = reader && side === 'me' ? h('div', { class: 'bt-hp-nums' }) : null
  );
  const spot = side => h('div', { class: `bt-spot bt-spot-${side}` },
    side === 'foe' ? (ui.intent = h('div', { class: 'bt-intent', hidden: true, attrs: { 'aria-hidden': 'true' } })) : null,
    ui[side + 'Sprite'] = h('div', { class: 'bt-sprite-wrap' }),
    ui[side + 'Dmg'] = h('div', { class: 'bt-dmg-host' })
  );

  const el = h('div', { class: ['bt', { calm, pre: !reader, wild }] },
    h('div', { class: 'bt-field' },
      hud('foe'), spot('foe'), spot('me'), hud('me'),
      ui.tag = h('div', { class: 'bt-tag', hidden: true }),
      ui.banner = h('div', { class: 'bt-banner', hidden: true })
    ),
    h('div', { class: 'bt-controls' },
      ui.moves = h('div', { class: 'bt-moves' }),
      ui.actions = h('div', { class: 'bt-actions' })
    ),
    ui.drawer = h('div', { class: 'bt-drawer', hidden: true }),
    ui.card = h('div', { class: 'bt-card', hidden: true }),
    ui.loading = h('div', { class: 'bt-loading' }, h('img', { class: 'bt-loading-ball', src: ITEM('poke-ball'), alt: '', draggable: false }))
  );
  root.appendChild(el);
  const onDown = () => unlock();
  el.addEventListener('pointerdown', onDown);
  // A tap that HURRIES the end of a turn must not also press the button that
  // appears under the finger when the controls come back. Remember when each
  // press began; a click whose press began before the controls (or the result
  // card) were ready is that same tap's leftover, and is ignored.
  // Keyboard / synthetic clicks (detail 0) have no press and always count.
  let pressAt = -Infinity, armedAt = -Infinity;
  const now = () => (globalThis.performance ? performance.now() : Date.now());
  const onPress = () => { pressAt = now(); };
  el.addEventListener('pointerdown', onPress, true);
  const fresh = (e, since) => !e || e.detail === 0 || pressAt >= since;
  const guarded = fn => e => { if (fresh(e, armedAt)) fn(e); };
  try { music.playMusic(trainer && trainer.leader ? 'gym' : 'battle'); } catch (e) { /* music is a bonus */ }

  // ---------- helpers ----------
  // A pre-reader sees the number alone: 'Lv' is a word.
  const lvText = n => (reader ? 'Lv' : '') + n;
  const fighter = side => battle.state[side].team[shown[side]];
  const pause = async ms => { await wait(ms); return alive; };
  const frame = fn => { const id = requestAnimationFrame(t => { rafs.delete(id); fn(t); }); rafs.add(id); };

  function restart(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;          // reflow so the animation plays again
    node.classList.add(cls);
  }

  function setHp(side, hp, animate = true) {
    const f = fighter(side);
    hpShown[side][shown[side]] = hp;
    const p = pct(hp, f.maxHp);
    const fill = ui[side + 'Fill'];
    fill.classList.toggle('instant', !animate);
    fill.style.width = p + '%';
    fill.classList.toggle('mid', p <= 50 && p > 20);
    fill.classList.toggle('low', p <= 20);
    if (ui[side + 'Nums']) ui[side + 'Nums'].textContent = `${Math.max(0, Math.round(hp))}/${f.maxHp}`;
  }

  function showFighter(side, idx) {
    shown[side] = idx;
    const f = fighter(side);
    // A shiny wild encounter (params.shiny, from the tall grass) glitters in the fight too.
    const shiny = side === 'me' ? (store.player().shinies || []).includes(f.id) : (wild && params.shiny === true && idx === 0);
    ui[side + 'Sprite'].classList.remove('faint', 'absorbed', 'leave', 'lunge', 'hit', 'hit-soft');
    clear(ui[side + 'Sprite']);
    const img = spriteImg(f.id, { back: side === 'me', animated: true, shiny, class: `bt-sprite bt-sprite-${side}` });
    if (side === 'foe' && battle.state.phase === 2 && idx === battle.state.foe.team.length - 1) img.classList.add('phase2');
    ui[side + 'Sprite'].appendChild(img);
    restart(ui[side + 'Sprite'], 'enter');
    const nick = side === 'me' ? (store.player().nicks || {})[f.id] : null;
    put(clear(ui[side + 'Name']),
      h('span', { class: 'bt-mon' }, String(nick || f.name || '').toUpperCase().slice(0, 12)),
      reader ? h('span', { class: 'bt-lv' }, 'Lv' + f.level) : null
    );
    const hp = hpShown[side][idx] ?? f.maxHp;
    setHp(side, hp, false);
    if (side === 'me') renderMoves();
  }

  function renderIntent() {
    if (!reader || !battle || battle.state.over) { ui.intent.hidden = true; return; }
    const mv = battle.foeIntentMove();
    clear(ui.intent).append(typeEmoji[mv.type] || typeEmoji.normal);
    ui.intent.style.setProperty('--tc', typeColors[mv.type] || typeColors.normal);
    ui.intent.hidden = false;
    restart(ui.intent, 'pop');
  }

  function renderMoves() {
    clear(ui.moves);
    const f = fighter('me');
    const pics = movePictures(f.moves);
    f.moves.forEach((m, i) => {
      ui.moves.appendChild(moveButton(m, pics[i], { reader, onClick: guarded(() => act({ kind: 'move', index: i })) }));
    });
  }

  function renderActions() {
    clear(ui.actions);
    const team = battle.state.me.team;
    const canSwitch = team.filter((f, i) => !f.fainted && i !== shown.me).length > 0;
    put(ui.actions,
      team.length > 1 ? h('button', {
        class: 'bt-act bt-act-switch', type: 'button', disabled: !canSwitch,
        attrs: { 'aria-label': 'SWITCH' }, on: { click: guarded(openTeam) }
      },
      h('span', { class: 'bt-team-mini', attrs: { 'aria-hidden': 'true' } },
        team.slice(0, 3).map(f => spriteImg(f.id, { class: ['bt-mini', { out: f.fainted }] }))),
      reader ? h('span', { class: 'bt-act-label' }, 'SWITCH') : null) : null,
      wild ? h('button', {
        class: 'bt-act bt-act-ball', type: 'button', attrs: { 'aria-label': 'BALL' }, on: { click: guarded(openBalls) }
      }, h('img', { class: 'bt-ball-icon', src: ITEM('poke-ball'), alt: '', draggable: false }),
      reader ? h('span', { class: 'bt-act-label' }, 'BALL') : null) : null,
      reader && berries > 0 ? h('button', {
        class: 'bt-act bt-act-berry', type: 'button',
        disabled: (() => { const f = fighter('me'); return !f || f.hp >= f.maxHp; })(),
        attrs: { 'aria-label': 'BERRY' },
        on: { click: guarded(() => act({ kind: 'berry', fraction: BERRY_HEAL, gift: true })) }
      }, h('img', { class: 'bt-berry-icon', src: ITEM(BERRY_ITEM), alt: '', draggable: false }),
      h('span', { class: 'bt-act-label' }, 'BERRY'),
      h('span', { class: 'bt-berry-n' }, 'x' + berries)) : null,
      hook('actions', coopApi),
      wild && reader ? h('button', {
        class: 'bt-act bt-act-run', type: 'button', attrs: { 'aria-label': 'RUN' },
        on: { click: guarded(() => act({ kind: 'run' })) }
      }, h('span', { attrs: { 'aria-hidden': 'true' } }, '🏃'), h('span', { class: 'bt-act-label' }, 'RUN')) : null
    );
  }

  function setControls(on) {
    el.classList.toggle('busy', !on);
    for (const b of el.querySelectorAll('.bt-controls button')) {
      if (!on) { b.dataset.wasDisabled = b.disabled ? '1' : ''; b.disabled = true; }
    }
    if (on) { armedAt = now(); renderActions(); renderMoves(); }
  }

  // ---------- drawers ----------
  function closeDrawer() { ui.drawer.hidden = true; clear(ui.drawer); }
  function drawer(...items) {
    clear(ui.drawer).append(
      h('div', { class: 'bt-drawer-row' }, ...items),
      h('button', { class: 'bt-drawer-x', type: 'button', attrs: { 'aria-label': 'BACK' }, on: { click: () => { sfx.tap(); closeDrawer(); } } }, '✖')
    );
    ui.drawer.hidden = false;
    restart(ui.drawer, 'open');
  }

  function openTeam() {
    if (busy) return;
    sfx.tap();
    drawer(...battle.state.me.team.map((f, i) => {
      const out = f.fainted || i === shown.me;
      return h('button', {
        class: ['bt-slot', { out: f.fainted, current: i === shown.me }], type: 'button', disabled: out,
        attrs: { 'aria-label': String(f.name || '') },
        on: { click: () => act({ kind: 'switch', index: i }) }
      }, spriteImg(f.id, { class: 'bt-slot-sprite', shiny: (store.player().shinies || []).includes(f.id) }),
      h('span', { class: 'bt-slot-hp' }, h('span', { class: ['bt-slot-hp-fill', { low: f.hp / f.maxHp <= 0.2 }], style: { width: pct(f.hp, f.maxHp) + '%' } })));
    }));
  }

  function openBalls() {
    if (busy) return;
    sfx.tap();
    const p = store.player();
    const masters = (p.items && p.items.masterBalls) | 0;
    const foe = fighter('foe');
    drawer(...BALLS.map(b => {
      const locked = reader && b.key === 'master' && masters < 1;
      let odds = null;
      if (reader) {
        odds = b.key === 'master' ? 'x' + masters
          : Math.round(100 * catchProbability({ captureRate: foe.captureRate ?? 45, ballMod: BALL_MODS[b.key], hp: foe.hp, maxHp: foe.maxHp })) + '%';
      }
      return h('button', {
        class: ['bt-ballbtn', `ball-${b.key}`, { locked }], type: 'button', disabled: locked,
        attrs: { 'aria-label': b.label },
        on: { click: () => throwBall(b.key) }
      }, h('img', { class: 'bt-ball-img', src: ITEM(b.item), alt: '', draggable: false }),
      odds ? h('span', { class: 'bt-odds' }, odds) : null);
    }));
  }

  function throwBall(key) {
    if (busy) return;
    if (reader && key === 'master') {
      const p = store.player();
      p.items = p.items || {};
      if ((p.items.masterBalls | 0) < 1) return;
      p.items.masterBalls = (p.items.masterBalls | 0) - 1;
      store.commit();
    }
    act({ kind: 'ball', ball: key });
  }

  // ---------- juice ----------
  function countUp(node, to, ms = 400) {
    return new Promise(resolve => {
      if (to <= 0 || reduceMotion()) { node.textContent = String(Math.max(0, to)); resolve(); return; }
      const t0 = performance.now();
      const dur = Math.min(400, ms);
      let lastStep = -1;
      const step = now => {
        if (!alive) return resolve();
        const k = Math.min(1, (now - t0) / dur);
        node.textContent = String(Math.round(to * k));
        const s = Math.floor(k * 8);
        if (s !== lastStep) { lastStep = s; sfx.count?.(s, calm); }
        if (k < 1) frame(step); else resolve();
      };
      frame(step);
    });
  }

  async function damageNumber(side, e) {
    const cls = ['bt-dmg'];
    if (e.eff > 1) cls.push('super');
    else if (e.eff > 0 && e.eff < 1) cls.push('weak');
    else if (e.eff === 0) cls.push('none');
    if (e.crit) cls.push('crit');
    const num = h('span', { class: 'bt-dmg-num' }, '0');
    const node = h('div', { class: cls }, e.eff > 1 ? h('span', { class: 'bt-flame', attrs: { 'aria-hidden': 'true' } }, '🔥') : null, num);
    ui[side + 'Dmg'].appendChild(node);
    await countUp(num, e.dmg, 400);
    if (e.crit && !calm) restart(node, 'punch');
    setTimeout(() => node.remove(), 1200);
  }

  // ---------- event playback ----------
  async function play(e) {
    if (e.type === 'gimmick') { await r2PlayGimmick(e); return; }   // round2
    if (e.type === 'move') {
      const atk = e.side, def = e.side === 'me' ? 'foe' : 'me';
      if (reader) {
        ui.tag.textContent = moveLabel(e.move.name);
        ui.tag.className = `bt-tag bt-tag-${atk}`;
        ui.tag.style.setProperty('--tc', typeColors[e.move.type] || typeColors.normal);
        ui.tag.style.setProperty('--ink', inkFor(typeColors[e.move.type] || typeColors.normal));
        ui.tag.hidden = false;
      }
      restart(ui[atk + 'Sprite'], 'lunge');
      sfx.type?.[e.move.type]?.();
      if (!await pause(300)) return;
      if (e.eff > 0) restart(ui[def + 'Sprite'], calm ? 'hit-soft' : 'hit');
      if (e.crit) sfx.crit(); else sfx.hit(e.eff);
      setHp(def, e.hpAfter);
      await damageNumber(def, e);
      if (!await pause(450)) return;
      ui.tag.hidden = true;
      return;
    }
    if (e.type === 'heal') {
      sfx.petal?.();
      const host = ui[e.side + 'Sprite'].parentNode;
      const glow = h('div', { class: 'bt-heal', attrs: { 'aria-hidden': 'true' } },
        h('img', { class: 'bt-heal-berry', src: ITEM(BERRY_ITEM), alt: '', draggable: false }),
        ['🍃', '💚', '🍃'].map((c, i) => h('span', { style: { '--i': i } }, c)));
      host.appendChild(glow);
      restart(ui[e.side + 'Sprite'], 'healed');
      setHp(e.side, e.hpAfter);
      if (!await pause(700)) return;
      glow.remove();
      return;
    }
    if (e.type === 'phase2') {
      sfx.phase2();
      const img = ui.foeSprite.querySelector('.bt-sprite');
      if (img) img.classList.add('phase2');
      el.classList.add('phase2');
      if (!await pause(500)) return;
      setHp('foe', e.hpAfter);
      await pause(700);
      return;
    }
    if (e.type === 'faint') {
      sfx.faint();
      restart(ui[e.side + 'Sprite'], 'faint');
      await pause(800);
      return;
    }
    if (e.type === 'send' || e.type === 'switch') {
      if (e.type === 'switch') { restart(ui.meSprite, 'leave'); if (!await pause(260)) return; }
      showFighter(e.side, e.index);
      cry(fighter(e.side).id);
      if (e.side === 'foe') renderIntent();
      await pause(600);
      return;
    }
    if (e.type === 'catch') {
      await playCatch(e);
    }
  }

  async function playCatch(e) {
    const ballKey = BALLS.find(b => b.key === e.ball)?.item || 'poke-ball';
    const ball = h('img', { class: 'bt-thrown', src: ITEM(ballKey), alt: '', draggable: false });
    ui.foeSprite.parentNode.appendChild(ball);
    sfx.ballThrow();
    restart(ball, 'fly');
    if (!await pause(450)) return;
    ui.foeSprite.classList.add('absorbed');
    restart(ball, 'land');
    if (!await pause(400)) return;
    for (let i = 0; i < e.shakes; i++) {
      sfx.shake();
      restart(ball, i % 2 ? 'wobble-r' : 'wobble-l');
      if (!await pause(650)) return;
    }
    if (e.success) {
      sfx.caught();
      ball.classList.add('caught');
      ui.foeSprite.parentNode.appendChild(h('div', { class: 'bt-burst', attrs: { 'aria-hidden': 'true' } },
        ['🍃', '✨', '🍃', '✨', '🍃', '✨'].map((c, i) => h('span', { style: { '--i': i } }, c))));
      if (!await pause(900)) return;
    } else {
      ball.classList.add('pop');
      ui.foeSprite.classList.remove('absorbed');
      restart(ui.foeSprite, 'enter');
      if (!await pause(400)) return;
      ball.remove();
    }
  }

  async function act(action) {
    if (busy || !battle || battle.state.over || !alive) return;
    busy = true;
    sfx.tap();
    closeDrawer();
    setControls(false);
    ui.intent.hidden = true;
    const events = await battle.choose(action);
    if (!events.length) { busy = false; setControls(true); renderIntent(); return; }
    if (action.kind === 'berry' && action.gift) {
      // The berry was eaten: open one of Art's gifts for real.
      berries = Math.max(0, berries - 1);
      try { store.takeGift(); } catch (e) { /* the store reports its own save failures */ }
    }
    hook('onEvents', events, coopApi);
    let endEv = null;
    for (const e of events) {
      if (!alive) return;
      if (e.type === 'end') { endEv = e; continue; }
      await play(e);
    }
    if (!alive) return;
    if (endEv) { hook('onEnd', endEv, coopApi); await finish(endEv); return; }
    busy = false;
    setControls(true);
    renderIntent();
    hook('onTurn', coopApi);
  }

  // What params.coop hooks receive. act() is the same path the buttons use.
  const coopApi = {
    get battle() { return battle; },
    get busy() { return busy; },
    act: action => act(action),
    refresh: () => { if (battle && !busy) { renderActions(); renderMoves(); } },
    root: el,
  };

  // ==== round2 BEGIN ====
  // A ROUND 2 leader's gimmick (data/round2.js): an icon badge by the foe's
  // HUD plus a weather overlay over the field. Pictures carry it; Gabe also
  // gets one short word. Calm keeps the overlay still (see style.css).
  const r2Gimmick = trainer && trainer.leader && !coop && typeof params.gimmick === 'string'
    ? makeGimmick(params.gimmick) : null;
  let r2Applied = null;     // {bloom, shiny} when applyResult saved a Round 2 win
  let r2Badge = null, r2Weather = null;
  function r2Ensure() {
    if (!r2Gimmick) return false;
    const field = el.querySelector('.bt-field');
    if (!r2Weather && field) {
      r2Weather = h('div', { class: ['bt-r2-weather', r2Gimmick.overlay && 'w-' + r2Gimmick.overlay], attrs: { 'aria-hidden': 'true' } },
        Array.from({ length: 14 }, (_, i) => h('span', { class: 'bt-r2-drop', style: { '--i': i } })));
      field.insertBefore(r2Weather, field.firstChild);
    }
    if (!r2Badge && field) {
      r2Badge = h('div', { class: 'bt-r2-badge', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'bt-r2-ico' }, r2Gimmick.icon));
      field.appendChild(r2Badge);
    }
    return !!(r2Badge && r2Weather);
  }
  async function r2PlayGimmick(e) {
    if (!r2Ensure()) return;
    if (e.kind === 'start') {
      sfx.phase2?.();
      el.classList.add('r2-on');
      r2Badge.classList.add('on');
      if (r2Gimmick.overlay) r2Weather.classList.add('on');
      restart(r2Badge, 'pop');
      put(clear(ui.banner), h('div', { class: 'bt-banner-name bt-r2-banner' },
        h('span', { class: 'bt-r2-banner-ico', attrs: { 'aria-hidden': 'true' } }, r2Gimmick.icon),
        reader ? r2Gimmick.word : null));
      ui.banner.hidden = false;
      restart(ui.banner, 'open');
      if (!await pause(900)) return;
      ui.banner.hidden = true;
      return;
    }
    if (e.kind === 'chip' || e.kind === 'heal') {
      restart(r2Badge, 'pop');
      if (e.side && shown[e.side] === battle.state[e.side].active) {
        if (e.kind === 'chip') {
          restart(ui[e.side + 'Sprite'], calm ? 'hit-soft' : 'hit');
          setHp(e.side, e.hpAfter);
          await damageNumber(e.side, { dmg: e.amount, eff: 1, crit: false });
        } else {
          restart(ui[e.side + 'Sprite'], 'healed');
          setHp(e.side, e.hpAfter);
        }
      }
      await pause(350);
      return;
    }
    if (e.kind === 'charge') { r2Badge.classList.add('charged'); restart(r2Badge, 'pop'); sfx.type?.electric?.(); await pause(350); return; }
    if (e.kind === 'spend') { r2Badge.classList.remove('charged'); restart(r2Badge, 'pop'); return; }
    if (e.kind === 'break') { r2Badge.classList.add('spent'); r2Weather.classList.add('broken'); restart(r2Badge, 'pop'); return; }
    if (e.kind === 'hide') { ui.foeSprite.classList.add('r2-vanish'); restart(r2Badge, 'pop'); await pause(500); return; }
    if (e.kind === 'show') { ui.foeSprite.classList.remove('r2-vanish'); await pause(300); return; }
    if (e.kind === 'miss') { restart(r2Badge, 'pop'); return; }
    if (e.kind === 'boost') { restart(r2Badge, 'pop'); restart(ui[(e.side || 'foe') + 'Sprite'], 'lunge'); await pause(400); }
  }
  // ==== round2 END ====

  // ---------- the result ----------
  function applyResult(ev, result, early = null) {
    if (applied) return null;
    applied = true;
    const p = store.player();
    p.mons = p.mons || {};
    p.stats = p.stats || {};
    p.caught = p.caught || [];
    p.team = p.team || [];
    const rows = [];
    for (const x of ev.xp || []) {
      const f = battle.state.me.team.find(m => m.id === x.id);
      const cur = p.mons[x.id] || { level: f ? f.level : 5, xp: 0 };
      const before = { level: cur.level ?? 5, xp: cur.xp ?? 0 };
      const r = applyXp(before, x.gained);
      p.mons[x.id] = { ...cur, level: r.level, xp: r.xp };
      rows.push({ id: x.id, before, after: { level: r.level, xp: r.xp }, ups: r.ups });
    }
    const bump = k => { p.stats[k] = (p.stats[k] | 0) + 1; };
    if (result === 'win') bump('battlesWon');
    if (result === 'lose') bump('battlesLost');
    if (result === 'caught') {
      bump('catches');
      const foe = battle.state.foe.team[battle.state.foe.active];
      const id = ev.caughtId ?? foe.id;
      if (!p.caught.includes(id)) p.caught.push(id);
      const had = p.mons[id];
      if (!had || (had.level ?? 0) < foe.level) p.mons[id] = { ...(had || {}), level: foe.level, xp: had && had.level === foe.level ? had.xp : 0 };
      if (p.team.length < 6 && !p.team.includes(id)) p.team.push(id);
      // A shiny from the tall grass is saved in the SAME commit as the catch,
      // so a closed app on the win card never leaves it a plain one.
      if (wild && params.shiny === true) {
        if (!Array.isArray(p.shinies)) p.shinies = [];
        if (!p.shinies.includes(id)) p.shinies.push(id);
      }
    }
    // A Road win (trainer, leader, Old Venusaur, rival) is saved NOW too, not
    // only when road.js mounts: the evolve screen can sit in between, and the
    // app can close there. road.js re-applies (idempotent) and celebrates
    // from these marks. A coop ride-along settles its own road.
    if (!coop && typeof onEnd === 'string' && (result === 'win' || result === 'lose')) {
      try {
        const o = settleRoadEnd(p, onEnd, result);
        if (o.outcome || o.gOutcome || o.rOutcome) roadApplied = roadMarks(o);
      } catch (e) { console.warn('battle: road result not applied early', e); }
    }
    // round2: a ROUND 2 win (and a leader's shiny ace) is saved in this same commit.
    if (!coop && typeof onEnd === 'string' && result === 'win' && onEnd.startsWith('round2:')) {
      try { const o = applyR2Win(p, onEnd); if (o) r2Applied = r2Marks(o); }
      catch (e) { console.warn('battle: round 2 result not applied early', e); }
    }
    if (early && typeof onEnd === 'string') {
      try {
        if (typeof early.applyWildWin === 'function' && result === 'win') {
          const o = early.applyWildWin(p, onEnd);
          if (o) earlyApplied = { key: 'wildWon', marks: { idx: o.idx, j: o.j, bloom: !!o.bloom } };
        } else if (typeof early.applySanctumEnd === 'function') {
          const o = early.applySanctumEnd(p, onEnd, result);
          if (o) earlyApplied = { key: 'sanctumWon', marks: { key: o.key, fresh: !!o.fresh, finale: !!o.finale } };
        }
      } catch (e) { console.warn('battle: batch 4 result not applied early', e); }
    }
    try { store.commit(); } catch (e) { /* the store reports its own save failures */ }
    return rows;
  }

  async function finish(ev) {
    const result = ev.fled ? 'fled' : ev.caught ? 'caught' : ev.winner === 'me' ? 'win' : 'lose';
    let early = null;
    if (earlyMod) { try { early = await earlyMod; } catch (e) { early = null; } }
    const rows = applyResult(ev, result, early) || [];
    // Something that levelled up may evolve: core/evo.js decides (never for a
    // prereader, never for a coop ride-along) and gives up after 4s. It starts
    // NOW, while the win card plays, so the ▶ tap rarely waits on it.
    const levelled = rows.filter(r => r.ups > 0).map(r => r.id);
    const back = roadApplied ? { result, onEnd, applied: roadApplied } : { result, onEnd };
    if (r2Applied) back.roundTwo = r2Applied;   // round2 (letters only: evolve keeps [a-zA-Z] keys)
    if (earlyApplied) back[earlyApplied.key] = earlyApplied.marks;   // batch 4: wildWon / sanctumWon
    const route = coop || !levelled.length || result === 'fled' ? null
      : evolveRoute(store.player(), levelled, returnTo, back).catch(() => null);
    let ok = null;
    const leave = async () => {
      if (!alive) return;
      sfx.tap();
      alive = false;
      // Still asking PokeAPI about evolutions: the ▶ answers at once anyway.
      if (ok) { ok.disabled = true; ok.classList.add('bt-ok-wait'); }
      let next = null;
      try { next = route ? await route : null; } catch (e) { next = null; }
      if (Array.isArray(next) && next[0] === 'evolve') ctx.go('evolve', next[1]);
      else ctx.go(returnTo, back);
    };
    if (result === 'fled') { leave(); return; }
    if (result !== 'lose') sfx.win();
    await pause(result === 'lose' ? 400 : 250);
    if (!alive) return;

    const stars = result === 'lose' ? [] : [0, 1, 2].map(i => h('span', { class: 'bt-star', style: { '--i': i } }, '⭐'));
    const hero = result === 'caught'
      ? h('div', { class: 'bt-card-hero caught' }, spriteImg(ev.caughtId ?? fighter('foe').id, { animated: true, shiny: wild && params.shiny === true, class: 'bt-card-sprite' }), h('img', { class: 'bt-card-ball', src: ITEM('poke-ball'), alt: '' }))
      : result === 'lose'
        ? h('div', { class: 'bt-card-hero lose' }, spriteImg(battle.state.me.team[0].id, { class: 'bt-card-sprite' }), h('span', { class: 'bt-zzz' }, '💤'))
        : null;
    const xpRows = rows.map(r => {
      const fill = h('span', { class: 'bt-xp-fill', style: { width: (xpProgress(r.before) * 100) + '%' } });
      const lv = h('span', { class: 'bt-xp-lv' }, lvText(r.before.level));
      return { r, fill, lv, node: h('div', { class: 'bt-xp-row' }, spriteImg(r.id, { class: 'bt-xp-sprite' }), lv, h('span', { class: 'bt-xp-bar' }, fill)) };
    });
    let cardAt = Infinity;
    ok = h('button', { class: 'bt-ok', type: 'button', attrs: { 'aria-label': 'OK' }, on: { click: e => { if (fresh(e, cardAt)) leave(); } } }, '▶');
    clear(ui.card).append(h('div', { class: ['bt-card-box', result] },
      stars.length ? h('div', { class: 'bt-stars' }, stars) : null,
      hero,
      trainer && result === 'win' && reader ? h('div', { class: 'bt-card-words' }, 'YOU WON!') : null,
      result === 'lose' && reader ? h('div', { class: 'bt-card-words' }, 'TRY AGAIN!') : null,
      xpRows.length ? h('div', { class: 'bt-xp' }, xpRows.map(x => x.node)) : null,
      ok));
    ui.card.hidden = false;
    cardAt = now();
    restart(ui.card, 'open');
    if (result === 'caught') cry(ev.caughtId ?? fighter('foe').id);

    // Fill the XP bars; each level-up fills to the end, ticks the level, and goes again.
    for (const x of xpRows) {
      if (!await pause(300)) return;
      let level = x.r.before.level;
      for (let u = 0; u < x.r.ups; u++) {
        x.fill.style.width = '100%';
        if (!await pause(450)) return;
        level++;
        x.lv.textContent = lvText(level);
        restart(x.lv, 'ding');
        sfx.levelUp();
        x.fill.classList.add('instant');
        x.fill.style.width = '0%';
        void x.fill.offsetWidth;
        x.fill.classList.remove('instant');
      }
      x.fill.style.width = (xpProgress(x.r.after) * 100) + '%';
    }
  }

  // ---------- boot ----------
  function teamSpec() {
    const p = store.player();
    const lvl = id => Math.max(1, Math.min(100, (p.mons && p.mons[id] && p.mons[id].level) || 5));
    if (Array.isArray(params.myTeam) && params.myTeam.length) {
      return params.myTeam.slice(0, 6).map(m => ({ id: m.id, level: m.level || lvl(m.id) }));
    }
    let ids = (p.team || []).filter(n => Number.isInteger(n) && n > 0).slice(0, 6);
    if (!ids.length) {
      ids = reader ? [(p.caught || [])[0] || 1] : [bulbaIdOf(p)];
    } else if (!reader) {
      // Art's BULBA is never drafted out: he always leads, whatever else
      // joined the team (a wild catch, an old team from the classic app).
      const b = bulbaIdOf(p);
      ids = [b, ...ids.filter(id => id !== b)].slice(0, 6);
    }
    return ids.map(id => ({ id, level: lvl(id) }));
  }

  async function boot() {
    try {
      try { await movesReady; } catch (e) { /* buildFighter copes */ }
      const mine = teamSpec();
      const enemy = (params.enemyTeam || []).slice(0, 6);
      if (!enemy.length) throw new Error('no enemy team');
      const [myTeam, enemyTeam] = await Promise.all([
        Promise.all(mine.map(m => buildFighter(m.id, m.level, { seed: moveSeed(store.current, m.id) }))),
        Promise.all(enemy.map(m => buildFighter(m.id, m.level, { seed: moveSeed(9, m.id, m.level) })))
      ]);
      if (!alive) return;
      const p = store.player();
      myTeam.forEach(f => { f.xp = (p.mons && p.mons[f.id] && p.mons[f.id].xp) || 0; });
      battle = createBattle({
        myTeam, enemyTeam,
        profile: reader ? 'reader' : 'prereader',
        rng: rngFromUrl(),
        moveLookup: moveInfo,
        wild,
        leader: !!(trainer && trainer.leader),
        gimmick: r2Gimmick                        // round2: null unless a ROUND 2 leader
      });
    } catch (err) {
      if (!alive) return;
      console.warn('battle: could not start', err);
      clear(ui.loading).append(h('button', {
        class: 'bt-ok', type: 'button', attrs: { 'aria-label': 'BACK' },
        on: { click: () => { alive = false; ctx.go(returnTo, { result: 'fled', onEnd }); } }
      }, '◀'));
      return;
    }
    ui.loading.remove();
    showFighter('foe', 0);
    showFighter('me', 0);
    renderActions();
    setControls(false);
    el.dataset.ready = '1';

    if (trainer && reader && (trainer.name || trainer.taunt)) {
      put(clear(ui.banner),
        trainer.name ? h('div', { class: 'bt-banner-name' }, String(trainer.name).toUpperCase()) : null,
        trainer.taunt ? h('div', { class: 'bt-banner-taunt' }, String(trainer.taunt).toUpperCase()) : null);
      ui.banner.hidden = false;
      restart(ui.banner, 'open');
    }
    cry(fighter('foe').id);
    if (!await pause(trainer && reader ? 1400 : 700)) return;
    ui.banner.hidden = true;
    cry(fighter('me').id);
    busy = false;
    setControls(true);
    renderIntent();
    hook('onReady', coopApi);
  }

  boot();

  return function unmount() {
    alive = false;
    for (const id of rafs) cancelAnimationFrame(id);
    rafs.clear();
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointerdown', onPress, true);
    try { music.stopMusic(); } catch (e) { /* ignore */ }
    clear(root);
  };
}
