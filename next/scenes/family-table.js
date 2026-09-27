// ============================================================
// SPROUT ROAD — FAMILY TABLE (co-op, one screen).
//
// The reader (⚔ seat) battles exactly as on his Road: his team, his moves.
// The little one (🌱 seat) gets a big green strip along the bottom:
//   BERRY     heals the reader's active Pokemon by 20%. Then a new berry
//             grows back over 3 turns (sprout -> flower -> berry), shown as
//             a picture. Tapping it while it grows just wiggles it.
//   LEAF POT  fills by one leaf each turn in which he tapped ANYTHING on
//             his strip. When it is full, a TEAM-UP button appears on the
//             READER's side (he calls it): BULBA leaps in, a combined
//             Vine Whip lands (grass, 1.5x a normal hit, real damage), a
//             1-second radial green bloom inside the field (never a
//             full-screen flash), and both cries.
// The little one can only help: his taps never block, hurry or stall the
// reader's turn (they are kept away from wait()'s tap-to-hurry), and a
// berry tapped at full health is not used up.
//
// Opponent: the reader's next unbeaten Road trainer, or (Road finished) a
// random chapter trainer. A win is written to the reader's Road exactly as
// road.js does (chapters.applyWin) and gives the helper's BULBA +3 petals.
// A loss is a gentle rest card and still gives BULBA a petal: nothing on
// this screen ever tells the little one he failed.
//
// params: { battler: 1|2, helper: 1|2 }   (sanitised by together.seatsFrom)
// Exports makeStage() for versus.js: the field + event playback.
// ============================================================

import { h, clear, countUp } from '../ui/h.js';
import { spriteImg, ITEM } from '../ui/sprite.js';
import { unlock, sfx, cry } from '../audio/audio.js';
import * as music from '../audio/music.js';
import { wait } from '../core/pace.js';
import { rngFromUrl } from '../core/rng.js';
import { buildFighter, moveInfo, movesReady } from '../core/api.js';
import { createBattle } from '../battle/createBattle.js';
import { applyXp, moveSeed } from '../data/engine.js';
import { typeEmoji, typeColors, inkFor } from '../data/config.js';
import { CHAPTERS, nextTrainer, battleParams, applyWin, leaderIdx, isCleared } from '../data/chapters.js';
import { addPetals } from './garden-logic.js';
import { seatsFrom, teamSpec, bulbaIdOf, battleProfile } from './together.js';
import { moveButton, movePictures } from './battle.js';
import { evolveRoute } from '../core/evo.js';

export const BERRY_HEAL = 0.20;       // of the active mon's max HP
export const BERRY_TURNS = 3;         // turns for a new berry to grow
export const POT_SIZE = 3;            // leaves to fill the pot
export const TEAMUP_MULT = 1.5;       // vs a normal hit
export const WIN_PETALS = 3;
export const REST_PETALS = 1;

const play = (name, ...a) => { try { const f = sfx && sfx[name]; if (typeof f === 'function') f(...a); } catch (e) { /* silent */ } };
const safeCry = id => { try { cry(id); } catch (e) { /* silent */ } };
const moveLabel = name => String(name || '').replace(/-/g, ' ').toUpperCase();
const pct = (hp, max) => Math.max(0, Math.min(100, (hp / Math.max(1, max)) * 100));
const restart = (node, cls) => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };

/** The TEAM-UP move for a fighter: a grass Vine Whip 1.5x as strong as
 *  his best normal hit (never weaker than 1.5x a real Vine Whip), using
 *  whichever attack stat is higher. Pure. */
export function teamUpMove(f) {
  const best = Math.max(45, ...((f && f.moves) || []).map(m => Number(m && m.power) || 0));
  const special = !!f && (Number(f.spatk) || 0) > (Number(f.atk) || 0);
  return { name: 'vine-whip', type: 'grass', power: Math.round(best * TEAMUP_MULT), damage_class: special ? 'special' : 'physical', teamUp: true };
}

/** The fight for this family table: the reader's next Road trainer, but
 *  NEVER a chapter leader. A leader win blooms a chapter and grants a badge,
 *  and that milestone belongs to the reader on his own Road. When the leader
 *  is next (or the Road is done) it is a rematch of a cleared non-leader
 *  trainer instead. Pure (rng injected). */
export function pickOpponent(p, rng = Math.random) {
  const nt = nextTrainer(p);
  if (nt && nt.j !== leaderIdx(nt.i)) return battleParams(nt.i, nt.j);
  const upTo = nt ? nt.i : CHAPTERS.length - 1;
  const pool = [];
  for (let i = 0; i <= upTo; i++) {
    for (let j = 0; j < leaderIdx(i); j++) if (isCleared(p, i, j)) pool.push([i, j]);
  }
  if (!pool.length) for (let i = 0; i <= upTo; i++) for (let j = 0; j < leaderIdx(i); j++) pool.push([i, j]);
  const [i, j] = pool[Math.floor(rng() * pool.length) % pool.length];
  return battleParams(i, j);
}

// ---------------------------------------------------------------- the stage

/**
 * A battle field (foe top-right, mine bottom-left) and event playback.
 * opts: { calm, words (show move names), pause(ms) -> Promise<alive>, shinyOf(id), nickOf(side, id) }
 */
export function makeStage({ calm = false, words = true, pause, shinyOf = () => false, nickOf = () => null } = {}) {
  const ui = {};
  const cur = { me: null, foe: null };
  const hud = side => h('div', { class: `fs-hud fs-hud-${side}` },
    ui[side + 'Name'] = h('div', { class: 'fs-name' }),
    h('div', { class: 'fs-hp' }, ui[side + 'Fill'] = h('div', { class: 'fs-hp-fill' })));
  const spot = side => h('div', { class: `fs-spot fs-spot-${side}` },
    ui[side + 'Sprite'] = h('div', { class: 'fs-sprite-wrap' }),
    ui[side + 'Dmg'] = h('div', { class: 'fs-dmg-host' }));
  const field = h('div', { class: ['fs-field', { calm }] },
    hud('foe'), spot('foe'), spot('me'), hud('me'),
    ui.tag = h('div', { class: 'fs-tag', hidden: true }),
    ui.fx = h('div', { class: 'fs-fx', attrs: { 'aria-hidden': 'true' } }));

  function setHp(side, hp, animate = true) {
    const f = cur[side];
    if (!f) return;
    const p = pct(hp, f.maxHp);
    const fill = ui[side + 'Fill'];
    fill.classList.toggle('instant', !animate);
    fill.style.width = p + '%';
    fill.classList.toggle('mid', p <= 50 && p > 20);
    fill.classList.toggle('low', p <= 20);
  }

  function show(side, f) {
    cur[side] = f;
    const wrap = ui[side + 'Sprite'];
    wrap.classList.remove('faint', 'lunge', 'hit', 'hit-soft');
    clear(wrap).appendChild(spriteImg(f.id, { back: side === 'me', animated: true, shiny: !!shinyOf(side, f.id), class: `fs-sprite fs-sprite-${side}` }));
    restart(wrap, 'enter');
    clear(ui[side + 'Name']).append(
      h('span', { class: 'fs-mon' }, String(nickOf(side, f.id) || f.name || '').toUpperCase().slice(0, 12)),
      h('span', { class: 'fs-lv' }, words ? 'Lv' + f.level : String(f.level)));
    setHp(side, f.hp, false);
  }

  function floatNum(side, text, cls) {
    const node = h('div', { class: ['fs-dmg', cls] }, text);
    ui[side + 'Dmg'].appendChild(node);
    setTimeout(() => node.remove(), 1300);
    return node;
  }

  async function damage(side, e) {
    const cls = ['fs-dmg'];
    if (e.eff > 1) cls.push('super');
    else if (e.eff > 0 && e.eff < 1) cls.push('weak');
    else if (e.eff === 0) cls.push('none');
    if (e.crit) cls.push('crit');
    if (e.move && e.move.teamUp) cls.push('teamup');
    const num = h('span', { class: 'fs-dmg-num' }, '0');
    const node = h('div', { class: cls }, e.eff > 1 ? h('span', { class: 'fs-flame', attrs: { 'aria-hidden': 'true' } }, '🔥') : null, num);
    ui[side + 'Dmg'].appendChild(node);
    countUp(num, e.dmg, 400);
    if (e.crit && !calm) restart(node, 'kapow');
    setTimeout(() => node.remove(), 1300);
  }

  /** Play one createBattle event. Returns false if the scene went away. */
  async function playEvent(e, battle) {
    if (e.type === 'move') {
      const atk = e.side, def = e.side === 'me' ? 'foe' : 'me';
      const tc = typeColors[e.move.type] || typeColors.normal;
      clear(ui.tag).append(
        h('span', { class: 'fs-tag-ico', attrs: { 'aria-hidden': 'true' } }, typeEmoji[e.move.type] || typeEmoji.normal),
        words ? (e.move.teamUp ? 'TEAM-UP ' : '') + moveLabel(e.move.name) : null);
      ui.tag.className = `fs-tag fs-tag-${atk}`;
      ui.tag.style.setProperty('--tc', tc);
      ui.tag.style.setProperty('--ink', inkFor(tc));
      ui.tag.hidden = false;
      restart(ui[atk + 'Sprite'], 'lunge');
      try { sfx.type && sfx.type[e.move.type] && sfx.type[e.move.type](); } catch (err) { /* silent */ }
      if (!await pause(300)) return false;
      if (e.eff > 0) restart(ui[def + 'Sprite'], calm ? 'hit-soft' : 'hit');
      if (e.crit) play('crit'); else play('hit', e.eff);
      setHp(def, e.hpAfter);
      await damage(def, e);
      if (!await pause(650)) return false;
      ui.tag.hidden = true;
      return true;
    }
    if (e.type === 'phase2') {
      play('phase2');
      field.classList.add('phase2');
      if (!await pause(500)) return false;
      setHp('foe', e.hpAfter);
      return pause(600);
    }
    if (e.type === 'faint') {
      play('faint');
      restart(ui[e.side + 'Sprite'], 'faint');
      return pause(800);
    }
    if (e.type === 'send') {
      show(e.side, battle.state[e.side].team[e.index]);
      safeCry(cur[e.side].id);
      return pause(600);
    }
    return true;
  }

  return { field, ui, show, setHp, floatNum, playEvent, current: side => cur[side] };
}

// ---------------------------------------------------------------- the scene

export function mount(root, ctx) {
  const { store } = ctx;
  const save = store.save;
  const seats = seatsFrom(save, ctx.params || {});
  const R = () => store.save.players[seats.battler];
  const A = () => store.save.players[seats.helper];
  let rng;
  try { rng = rngFromUrl(); } catch (e) { rng = Math.random; }
  const opp = pickOpponent(R(), rng);
  const bulbaId = bulbaIdOf(A());

  let alive = true;
  let busy = true;
  let battle = null;
  let done = false;
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const pause = async ms => { await wait(ms, { signal: ac && ac.signal }); return alive; };

  // helper state
  let berry = BERRY_TURNS;          // 0..3, 3 = ripe
  let pot = 0;                      // 0..POT_SIZE
  let tappedThisTurn = false;
  let pendingHeal = false;

  const stage = makeStage({
    calm: true,                      // the little one is on screen
    words: battleProfile(save, seats.battler) !== 'prereader',   // both prereaders: no words
    pause,
    shinyOf: (side, id) => side === 'me' && (R().shinies || []).includes(id),
    nickOf: (side, id) => (side === 'me' ? (R().nicks || {})[id] : null),
  });
  const ui = {};
  const bulbaLeap = h('div', { class: 'ft-leap', hidden: true, attrs: { 'aria-hidden': 'true' } }, spriteImg(bulbaId, { animated: true, class: 'ft-leap-sprite' }));
  const bloom = h('div', { class: 'ft-bloom', hidden: true, attrs: { 'aria-hidden': 'true' } });
  stage.field.append(bulbaLeap, bloom);

  const el = h('div', { class: 'ft', dataset: { scene: 'family-table' } },
    h('button', {
      class: 'ft-home', type: 'button', attrs: { 'aria-label': 'HOME' },
      on: { click: () => { play('tap'); leave('who'); } }
    }, '⌂'),
    ui.banner = h('div', { class: 'ft-banner', hidden: true }),
    stage.field,
    h('div', { class: 'ft-gabe' },
      ui.teamup = h('button', {
        class: 'ft-teamup', type: 'button', hidden: true, attrs: { 'aria-label': 'TEAM-UP' },
        on: { click: () => act({ teamUp: true }) }
      }, spriteImg(bulbaId, { class: 'ft-teamup-sprite' }), h('span', { class: 'ft-teamup-words' }, 'TEAM-UP!'), h('span', { attrs: { 'aria-hidden': 'true' } }, '🌿')),
      ui.moves = h('div', { class: 'ft-moves' })),
    ui.art = h('div', { class: 'ft-art' },
      ui.berry = h('button', { class: 'ft-berry', type: 'button', attrs: { 'aria-label': 'BERRY' }, on: { click: useBerry } }),
      ui.bulba = h('div', { class: 'ft-bulba', attrs: { 'aria-hidden': 'true' } }, spriteImg(bulbaId, { animated: true, class: 'ft-bulba-sprite' })),
      ui.pot = h('div', { class: 'ft-pot', attrs: { role: 'img', 'aria-label': 'LEAF POT' } })),
    ui.card = h('div', { class: 'ft-card', hidden: true }),
    ui.loading = h('div', { class: 'ft-loading' }, h('img', { class: 'ft-loading-ball', src: ITEM('poke-ball'), alt: '', draggable: false })));
  root.appendChild(el);
  try { music.playMusic(opp.trainer && opp.trainer.leader ? 'gym' : 'battle'); } catch (e) { /* bonus */ }

  // The little one's taps: counted for the pot, and kept away from wait()'s
  // document-level tap-to-hurry, so he can never rush or stall a turn.
  // (click still fires on his buttons: only pointerdown is stopped.)
  const artDown = e => {
    const t = e.target;
    if (!t || typeof t.closest !== 'function' || !t.closest('.ft-art')) return;
    e.stopPropagation();
    try { unlock(); } catch (err) { /* ignore */ }
    if (!alive || done) return;
    tappedThisTurn = true;
    sparkle(e);
    restart(ui.bulba, 'hop');
    drawPot();
  };
  window.addEventListener('pointerdown', artDown, true);

  function sparkle(e) {
    const r = ui.art.getBoundingClientRect();
    const s = h('span', { class: 'ft-sparkle', attrs: { 'aria-hidden': 'true' } }, '🍃');
    s.style.left = Math.round((e.clientX || r.left + r.width / 2) - r.left) + 'px';
    s.style.top = Math.round((e.clientY || r.top + r.height / 2) - r.top) + 'px';
    ui.art.appendChild(s);
    setTimeout(() => s.remove(), 700);
  }

  // ---------- the little one's strip ----------
  function drawBerry() {
    const ripe = berry >= BERRY_TURNS;
    ui.berry.classList.toggle('ripe', ripe);
    ui.berry.dataset.stage = String(berry);
    clear(ui.berry).append(ripe
      ? h('img', { class: 'ft-berry-img', src: ITEM('oran-berry'), alt: '', draggable: false })
      : h('span', { class: 'ft-berry-grow', attrs: { 'aria-hidden': 'true' } }, berry <= 0 ? '🌱' : berry === 1 ? '🌿' : '🌷'));
  }

  function drawPot() {
    clear(ui.pot).append(
      h('span', { class: 'ft-pot-leaves' },
        Array.from({ length: POT_SIZE }, (_, i) => h('span', { class: ['ft-leaf', { on: i < pot, next: i === pot && tappedThisTurn }] }, '🍃'))),
      h('span', { class: 'ft-pot-base', attrs: { 'aria-hidden': 'true' } }, '🪴'));
    ui.pot.classList.toggle('full', pot >= POT_SIZE);
    ui.pot.dataset.fill = String(pot);
  }

  function useBerry() {
    if (!alive || done || !battle) { restart(ui.berry, 'wiggle'); return; }
    if (berry < BERRY_TURNS) { restart(ui.berry, 'wiggle'); play('grow'); return; }
    const me = battle.state.me.team[battle.state.me.active];
    if (!me || me.fainted || battle.state.over) { restart(ui.berry, 'wiggle'); return; }
    if (me.hp >= me.maxHp) {
      // Already full: a happy sparkle, and the berry stays for later.
      restart(ui.berry, 'wiggle');
      stage.floatNum('me', '❤', 'heart');
      play('petal');
      return;
    }
    berry = 0;
    drawBerry();
    play('grow');
    const fly = h('img', { class: 'ft-berry-fly', src: ITEM('oran-berry'), alt: '', draggable: false });
    stage.field.appendChild(fly);
    setTimeout(() => fly.remove(), 900);
    if (busy) pendingHeal = true; else heal();
  }

  function heal() {
    pendingHeal = false;
    if (!battle || battle.state.over) return;
    const me = battle.state.me.team[battle.state.me.active];
    if (!me || me.fainted) return;
    const add = Math.max(1, Math.ceil(me.maxHp * BERRY_HEAL));
    const before = me.hp;
    me.hp = Math.min(me.maxHp, me.hp + add);
    if (stage.current('me') === me) stage.setHp('me', me.hp);
    stage.floatNum('me', '+' + (me.hp - before), 'heal');
    play('levelUp');
  }

  function endOfTurn() {
    if (tappedThisTurn && pot < POT_SIZE) pot++;
    tappedThisTurn = false;
    if (berry < BERRY_TURNS) berry++;
    drawBerry();
    drawPot();
    if (pot >= POT_SIZE) { play('bloom'); restart(ui.pot, 'glow'); }
  }

  // ---------- the reader's side ----------
  function renderMoves() {
    clear(ui.moves);
    if (!battle) return;
    const f = battle.state.me.team[battle.state.me.active];
    // The battle view's own move button (scenes/battle.js), so a move looks
    // the same at the family table as on the Road.
    const pics = movePictures(f.moves);
    f.moves.forEach((m, i) => {
      const b = moveButton(m, pics[i], { reader: battleProfile(store.save, seats.battler) !== 'prereader', onClick: () => act({ index: i }) });
      b.classList.add('ft-move');
      b.disabled = busy;
      ui.moves.appendChild(b);
    });
    ui.teamup.hidden = pot < POT_SIZE || !!battle.state.over;
    ui.teamup.disabled = busy;
    if (!ui.teamup.hidden && !busy) restart(ui.teamup, 'pop');
  }

  function setBusy(b) {
    busy = b;
    el.classList.toggle('busy', b);
    renderMoves();
  }

  async function act({ index = 0, teamUp = false }) {
    if (busy || !battle || battle.state.over || !alive) return;
    if (teamUp && pot < POT_SIZE) return;
    play('tap');
    setBusy(true);
    const me = battle.state.me.team[battle.state.me.active];
    let events;
    if (teamUp) {
      pot = 0;
      drawPot();
      ui.teamup.hidden = true;
      if (!await teamUpIntro(me)) return;
      const saved = me.moves;
      me.moves = [teamUpMove(me)];
      try { events = await battle.choose({ kind: 'move', index: 0 }); }
      finally { me.moves = saved; }
      // If the reader's Pokemon went down before it could act, the pot is
      // given back: a TEAM-UP is never wasted.
      if (!events.some(e => e.type === 'move' && e.side === 'me')) pot = POT_SIZE;
    } else {
      events = await battle.choose({ kind: 'move', index });
    }
    let endEv = null;
    for (const e of events) {
      if (!alive) return;
      if (e.type === 'end') { endEv = e; continue; }
      if (!await stage.playEvent(e, battle)) return;
    }
    if (teamUp) { bulbaLeap.classList.add('home'); await pause(250); bulbaLeap.hidden = true; bulbaLeap.classList.remove('home', 'leap'); }
    if (!alive) return;
    if (endEv) { await finish(endEv); return; }
    endOfTurn();
    if (pendingHeal) heal();
    setBusy(false);
  }

  async function teamUpIntro(me) {
    // BULBA leaps in beside the reader's Pokemon; a green bloom opens inside
    // the field (1s, radial, never full-screen); both cries.
    bulbaLeap.hidden = false;
    restart(bulbaLeap, 'leap');
    safeCry(bulbaId);
    if (!await pause(350)) return false;
    safeCry(me.id);
    bloom.hidden = false;
    restart(bloom, 'open');
    play('bloom');
    if (!await pause(1000)) return false;
    bloom.hidden = true;
    return true;
  }

  // ---------- the result ----------
  function applyResult(ev) {
    const r = R(), a = A();
    const win = ev.winner === 'me';
    r.stats = r.stats || {};
    r.mons = r.mons || {};
    let road = null;
    const levelled = [];
    if (win) {
      road = applyWin(r, opp.onEnd);
      r.stats.battlesWon = (r.stats.battlesWon | 0) + 1;
      for (const x of ev.xp || []) {
        const f = battle.state.me.team.find(m => m.id === x.id);
        const had = r.mons[x.id] || { level: f ? f.level : 5, xp: 0 };
        const res = applyXp({ level: had.level ?? 5, xp: had.xp ?? 0 }, x.gained);
        r.mons[x.id] = { ...had, level: res.level, xp: res.xp };
        if (res.ups > 0) levelled.push(x.id);
      }
    } else {
      r.stats.battlesLost = (r.stats.battlesLost | 0) + 1;
    }
    const petals = win ? WIN_PETALS : REST_PETALS;
    if (a && a.bulba && typeof a.bulba === 'object') addPetals(a.bulba, petals);
    try { store.commit(); } catch (e) { /* the store reports its own failures */ }
    return { win, petals, road, levelled };
  }

  async function finish(ev) {
    done = true;
    const res = applyResult(ev);
    // The battler's Pokemon that levelled up may evolve (core/evo.js; never
    // for a prereader). Started now, while the card plays; whichever card
    // button he taps goes through the evolve screen first.
    evoRoute = res.levelled.length ? evolveRoute(R(), res.levelled, '_', {}).catch(() => null) : null;
    if (res.win) play('win');
    await pause(300);
    if (!alive) return;
    const r = R();
    const leadId = (battle.state.me.team[battle.state.me.active] || battle.state.me.team[0]).id;
    const ch = res.road && res.road.bloom ? CHAPTERS[res.road.i] : null;
    const petals = h('div', { class: 'ft-card-petals', attrs: { 'aria-hidden': 'true' } },
      Array.from({ length: res.petals }, (_, i) => h('span', { class: 'ft-petal', style: { '--i': i } }, '🌸')));
    let cardAt = Infinity;
    const guard = fn => e => { if (!e || e.detail === 0 || performance.now() - cardAt > 250) fn(); };
    clear(ui.card).append(h('div', { class: ['ft-card-box', res.win ? 'win' : 'camp'] },
      res.win ? h('div', { class: 'ft-stars', attrs: { 'aria-hidden': 'true' } }, [0, 1, 2].map(i => h('span', { class: 'ft-star', style: { '--i': i } }, '⭐'))) : h('div', { class: 'ft-stars', attrs: { 'aria-hidden': 'true' } }, '🏕️'),
      h('div', { class: 'ft-card-pair' },
        spriteImg(leadId, { animated: true, shiny: (r.shinies || []).includes(leadId), class: 'ft-card-sprite' }),
        h('span', { class: 'ft-card-heart', attrs: { 'aria-hidden': 'true' } }, '❤'),
        spriteImg(bulbaId, { animated: true, class: 'ft-card-sprite' })),
      ch ? h('div', { class: 'ft-card-badge', attrs: { 'aria-hidden': 'true' } }, ch.emoji) : null,
      petals,
      h('div', { class: 'ft-card-actions' },
        h('button', { class: 'ft-card-btn ft-card-home', type: 'button', attrs: { 'aria-label': 'HOME' }, on: { click: guard(() => { play('tap'); leave('who'); }) } }, '⌂'),
        h('button', {
          class: 'ft-card-btn ft-card-go', type: 'button', attrs: { 'aria-label': 'NEXT' },
          on: { click: guard(() => { play('tap'); leave('postcard', { returnTo: 'together', returnParams: { battler: seats.battler, helper: seats.helper }, highlight: leadId, from: 'family-table', result: res.win ? 'win' : 'rest' }); }) }
        }, '\u25B6\uFE0E'))));
    ui.card.hidden = false;
    cardAt = performance.now();
    restart(ui.card, 'open');
    safeCry(bulbaId);
    for (const p of petals.children) { if (!await pause(260)) return; p.classList.add('on'); play('petal'); }
  }

  let evoRoute = null;
  async function leave(name, params) {
    if (!alive) return;
    alive = false;
    let next = null;
    try { next = evoRoute ? await evoRoute : null; } catch (e) { next = null; }
    if (Array.isArray(next) && next[0] === 'evolve') {
      ctx.go('evolve', { queue: next[1].queue, player: seats.battler, returnTo: name, returnParams: params || {} });
      return;
    }
    ctx.go(name, params || {});
  }

  // ---------- boot ----------
  async function boot() {
    drawBerry();
    drawPot();
    try {
      try { await movesReady; } catch (e) { /* buildFighter copes */ }
      const mine = teamSpec(R());
      const [myTeam, enemyTeam] = await Promise.all([
        Promise.all(mine.map(m => buildFighter(m.id, m.level, { seed: moveSeed(seats.battler, m.id) }))),
        Promise.all(opp.enemyTeam.map(m => buildFighter(m.id, m.level, { seed: moveSeed(9, m.id, m.level) })))
      ]);
      if (!alive) return;
      const r = R();
      myTeam.forEach(f => { f.xp = (r.mons && r.mons[f.id] && r.mons[f.id].xp) || 0; });
      battle = createBattle({
        myTeam, enemyTeam, profile: battleProfile(store.save, seats.battler), rng, moveLookup: moveInfo,
        wild: false, leader: !!(opp.trainer && opp.trainer.leader)
      });
    } catch (err) {
      if (!alive) return;
      console.warn('family table: could not start', err);
      clear(ui.loading).append(h('button', {
        class: 'ft-card-btn', type: 'button', attrs: { 'aria-label': 'BACK' },
        on: { click: () => leave('together', seats) }
      }, '\u25C0\uFE0E'));
      return;
    }
    ui.loading.remove();
    stage.show('foe', battle.state.foe.team[0]);
    stage.show('me', battle.state.me.team[0]);
    el.dataset.ready = '1';
    if (opp.trainer && opp.trainer.name) {
      clear(ui.banner).append(
        h('div', { class: 'ft-banner-name' }, String(opp.trainer.name).toUpperCase()),
        opp.trainer.taunt ? h('div', { class: 'ft-banner-taunt' }, String(opp.trainer.taunt).toUpperCase()) : null);
      ui.banner.hidden = false;
    }
    safeCry(battle.state.foe.team[0].id);
    if (!await pause(1200)) return;
    ui.banner.hidden = true;
    safeCry(battle.state.me.team[0].id);
    setBusy(false);
    if (pendingHeal) heal();
  }

  boot();

  return function unmount() {
    alive = false;
    if (ac) ac.abort();
    window.removeEventListener('pointerdown', artDown, true);
    try { music.stopMusic(); } catch (e) { /* ignore */ }
    clear(root);
  };
}
