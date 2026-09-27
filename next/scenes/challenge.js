// ============================================================
// SPROUT ROAD — DAD'S CHALLENGE (ROADMAP 5.1 row 4, 5.4)
//
// A grown-up (or Gabe, after he has seen Dad do it) rematches any chapter
// leader the family has already beaten, under PRO RULES
// (battle/rules-pro.js): +10 levels, status, stat stages, priority,
// abilities, no 60% cap, and a foe that thinks (best expected damage,
// setup and status when they pay, switches out of bad matchups). The foe's
// next action is shown as an icon before you pick.
//
// Every fight has a SEED CODE like MOSSY-714: the word is the chapter, the
// number the dice. The same code on the same team is the same fight, so Dad
// can text "try MOSSY-714" and Gabe gets exactly the fight Dad had.
//
// Saves are sacred: the ONLY thing this scene writes is a win ribbon, through
// store.addChallengeWin(code, 'dad'|'reader') into the shared
// save.family.challenge.wins (validated, capped at 50, merged on import).
// No XP, no stats, no Pokemon: a Pro fight never changes a team.
//
// params: { battler?:1|2 (whose team), returnTo?:'who'|'together'|'versus', returnParams?, code? }
// ============================================================

import { h, clear } from '../ui/h.js';
import { spriteImg, ITEM } from '../ui/sprite.js';
import { sfx, cry } from '../audio/audio.js';
import * as music from '../audio/music.js';
import { wait } from '../core/pace.js';
import { seededRng, hashSeed, seedFromUrl } from '../core/rng.js';
import { buildFighter, getMon, moveInfo, movesReady } from '../core/api.js';
import { moveSeed } from '../data/engine.js';
import { typeEmoji, typeColors, inkFor } from '../data/config.js';
import { CHAPTERS, leaderIdx, isChapterDone } from '../data/chapters.js';
import {
  createProBattle, withStatusMoves, moveMeta, STATUS_INFO, STAT_LABEL, INTENT_INFO, abilityLabel
} from '../battle/rules-pro.js';
import { seatsFrom, teamSpec, nameOf } from './together.js';
import { makeStage } from './family-table.js';
import { moveButton, movePictures } from './battle.js';

export const CHALLENGE_BONUS = 10;          // leader levels +10 (never past 100)

// One word per chapter, so a code says which leader it is.
const WORD_BY_KEY = {
  rock: 'PEBBLY', water: 'SPLASHY', electric: 'ZAPPY', grass: 'MOSSY', psychic: 'DREAMY', fighting: 'PUNCHY',
  ghost: 'SPOOKY', ice: 'FROSTY', fire: 'TOASTY', dragon: 'SCALY', victory: 'BRAVE', elite: 'CROWN'
};
export const CODE_WORDS = Object.freeze(CHAPTERS.map((c, i) => WORD_BY_KEY[c.key] || 'LEAF' + i));

/** Wins this session (also persisted via store.addChallengeWin): [{code, who:'DAD'|<reader name>, chapter}] */
export const SESSION_WINS = [];

// ---------------------------------------------------------------- pure helpers

/** (chapter, 0..999) -> 'MOSSY-714'. */
export function makeCode(chapter, n) {
  const w = CODE_WORDS[chapter];
  if (!w) return null;
  const k = Math.max(0, Math.min(999, Math.floor(Math.abs(Number(n) || 0))));
  return w + '-' + String(k).padStart(3, '0');
}

/** Forgiving: 'mossy 714', 'MOSSY714', ' Mossy-0714 ' -> {chapter, n}; anything else -> null. */
export function parseCode(raw) {
  if (raw == null) return null;
  const s = String(raw).toUpperCase().replace(/[\s_-]+/g, '');
  const m = /^([A-Z]{2,10})(\d{1,4})$/.exec(s);
  if (!m) return null;
  const chapter = CODE_WORDS.indexOf(m[1]);
  const n = Number(m[2]);
  if (chapter < 0 || !(n >= 0 && n <= 999)) return null;
  return { chapter, n };
}

/** A fresh code for a chapter. */
export const codeFor = (chapter, rng = Math.random) => makeCode(chapter, Math.floor(rng() * 1000));

/** The fight's rng for a code (canonical, so 'mossy 714' == 'MOSSY-714'). */
export function challengeRng(code) {
  const p = parseCode(code);
  return seededRng(hashSeed('PRO:' + (p ? makeCode(p.chapter, p.n) : String(code))));
}

/** The leader's team for chapter i at +10 levels: [{id, level}]. */
export function leaderTeam(i) {
  const ch = CHAPTERS[i];
  if (!ch) return [];
  return ch.trainers[leaderIdx(i)].team.map(m => ({ id: m.id, level: Math.min(100, m.level + CHALLENGE_BONUS) }));
}

/** Chapter indices whose leader is beaten: by player n, or by anyone when n is omitted. */
export function beatenLeaders(save, n = null) {
  const ps = (save && save.players) || {};
  const who = n ? [ps[n]] : [ps[1], ps[2]];
  return CHAPTERS.map((c, i) => i).filter(i => who.some(p => p && isChapterDone(p, i)));
}

// ---------------------------------------------------------------- scene

const RETURNS = new Set(['who', 'together', 'versus']);
const play = (name, ...a) => { try { const f = sfx && sfx[name]; if (typeof f === 'function') f(...a); } catch (e) { /* silent */ } };
const safeCry = id => { try { cry(id); } catch (e) { /* silent */ } };
const moveLabel = name => String(name || '').replace(/-/g, ' ').toUpperCase();
const restart = (node, cls) => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };
const cleanParams = p => {
  const out = {};
  for (const k of ['battler', 'helper', 'chapter']) if (p && Number.isInteger(p[k])) out[k] = p[k];
  return out;
};

export function mount(root, ctx) {
  const { store } = ctx;
  const params = ctx.params || {};
  const seats = seatsFrom(store.save, params);
  const teamN = seats.battler;
  const R = () => store.save.players[teamN];
  const readerName = nameOf(store.save, teamN);
  const returnTo = RETURNS.has(params.returnTo) ? params.returnTo : 'who';
  const returnParams = cleanParams(params.returnParams || (returnTo === 'who' ? {} : seats));
  // New codes: ?seed=N makes them repeatable for tests; otherwise real dice.
  let dice;
  try { const s = seedFromUrl(); dice = s == null ? Math.random : seededRng(s); } catch (e) { dice = Math.random; }

  let alive = true;
  let battle = null;
  let busy = true;
  let code = null;
  let player = 'dad';                // who is holding the device: 'dad' | 'kid'
  let giveUpArmed = false;
  const timers = new Set();
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const pause = async ms => { await wait(ms, { signal: ac && ac.signal }); return alive; };
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };

  const ui = {};
  const el = h('div', { class: 'ch', dataset: { scene: 'challenge' } },
    ui.main = h('div', { class: 'ch-main' }),
    ui.layer = h('div', { class: 'ch-layer', hidden: true }));
  root.appendChild(el);

  let shownAt = 0;
  const fresh = e => !e || e.detail === 0 || performance.now() - shownAt > 250;
  const guard = fn => e => { if (fresh(e)) fn(e); };
  const btn = (cls, label, fn, kids, extra = {}) => h('button', {
    class: cls, type: 'button', attrs: { 'aria-label': label }, on: { click: guard(e => { play('tap'); fn(e); }) }, ...extra
  }, kids);

  function layer(...kids) {
    clear(ui.layer).append(...kids.flat().filter(Boolean));
    ui.layer.hidden = false;
    shownAt = performance.now();
    restart(ui.layer, 'open');
  }
  function hideLayer() { ui.layer.hidden = true; clear(ui.layer); ui.layer.className = 'ch-layer'; }

  function leave() {
    if (!alive) return;
    alive = false;
    ctx.go(returnTo, returnParams);
  }

  const who = () => (player === 'dad' ? 'DAD' : readerName);
  // Saved ribbons (family.challenge.wins), shown with the reader's name.
  const savedWins = () => { try { return store.challengeWins(); } catch (e) { return []; } };
  const ribbonWho = w => (w.who === 'dad' ? 'DAD' : readerName);

  // ---------------------------------------------------------- the pick screen
  function pickScreen(msg = null) {
    battle = null;
    fightGen++;               // any turn still playing belongs to a fight that is over
    busy = true;
    try { music.stopMusic(); } catch (e) { /* ignore */ }
    hideLayer();
    const beaten = new Set(beatenLeaders(store.save));
    const team = teamSpec(R());

    const seedIn = h('input', {
      class: 'ch-seed-in', type: 'text',
      attrs: { placeholder: 'SEED CODE', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'aria-label': 'SEED CODE', maxlength: '14', enterkeyhint: 'go' },
      on: { keydown: e => { if (e.key === 'Enter') trySeed(); } }
    });
    const seedRow = h('div', { class: 'ch-seed' }, seedIn, btn('btn btn-go ch-seed-go', 'PLAY CODE', trySeed, '▶︎'));
    function trySeed() {
      const p = parseCode(seedIn.value);
      if (!p || !beaten.has(p.chapter)) {
        seedRow.classList.add('bad');
        restart(seedRow, 'shake');
        later(() => seedRow.classList.remove('bad'), 900);
        return;
      }
      preview(p.chapter, makeCode(p.chapter, p.n));
    }

    const grid = h('div', { class: 'ch-grid' }, CHAPTERS.map((c, i) => {
      const open = beaten.has(i);
      const t = leaderTeam(i);
      const ace = t[t.length - 1];
      return h('button', {
        class: ['ch-leader', { locked: !open }], type: 'button', disabled: !open,
        dataset: { chapter: i },
        style: { '--acc': c.palette.accent, '--gnd': c.palette.ground },
        attrs: { 'aria-label': open ? c.trainers[leaderIdx(i)].name : 'LOCKED' },
        on: { click: guard(() => { play('tap'); preview(i, codeFor(i, dice)); }) }
      },
      h('span', { class: 'ch-leader-emo', attrs: { 'aria-hidden': 'true' } }, c.emoji),
      open ? spriteImg(ace.id, { class: 'ch-leader-sprite', lazy: true }) : h('span', { class: 'ch-lock', attrs: { 'aria-hidden': 'true' } }, '🔒'),
      h('span', { class: 'ch-leader-lv' }, 'Lv' + ace.level));
    }));

    const chips = h('div', { class: 'ch-who' },
      h('span', { class: 'ch-who-label' }, 'PLAYER'),
      ['dad', 'kid'].map(k => h('button', {
        class: ['ch-chip', { on: player === k }], type: 'button', dataset: { who: k },
        on: { click: guard(() => { play('tap'); player = k; pickScreen(); }) }
      }, k === 'dad' ? 'DAD' : readerName)));

    const wins = savedWins().slice(-3).reverse().map(w => ({ code: w.code, who: ribbonWho(w) }));
    clear(ui.main).append(h('div', { class: 'ch-pick' },
      h('div', { class: 'ch-top' },
        btn('ch-back', 'BACK', leave, '◀︎'),
        h('h2', { class: 'ch-title' }, "DAD'S CHALLENGE"),
        h('span', { class: 'ch-pro', attrs: { 'aria-hidden': 'true' } }, 'PRO')),
      chips,
      h('div', { class: 'ch-team' },
        h('span', { class: 'ch-who-label' }, 'TEAM'),
        team.map(m => spriteImg(m.id, { class: 'ch-team-sprite', lazy: true, shiny: (R().shinies || []).includes(m.id) }))),
      beaten.size ? grid : h('div', { class: 'ch-none' }, h('span', { attrs: { 'aria-hidden': 'true' } }, '🔒'), 'BEAT A LEADER FIRST'),
      seedRow,
      msg ? h('div', { class: 'ch-msg' }, msg) : null,
      wins.length ? h('div', { class: 'ch-wins' }, wins.map(w => h('span', { class: 'ch-ribbon' }, '🎗️ ' + w.who + ' ' + w.code))) : null));
    shownAt = performance.now();
  }

  // ---------------------------------------------------------- preview
  function preview(i, theCode) {
    const c = CHAPTERS[i];
    const t = leaderTeam(i);
    const codeEl = h('div', { class: 'ch-code' }, theCode);
    let cur = theCode;
    layer(h('div', { class: 'ch-pre panel', attrs: { role: 'dialog', 'aria-label': c.trainers[leaderIdx(i)].name } },
      h('div', { class: 'ch-pre-name' }, c.emoji + ' ' + c.trainers[leaderIdx(i)].name),
      h('div', { class: 'ch-pre-team' }, t.map(m => h('span', { class: 'ch-pre-mon' },
        spriteImg(m.id, { class: 'ch-pre-sprite' }), h('span', { class: 'ch-pre-lv' }, 'Lv' + m.level)))),
      h('div', { class: 'ch-pre-rules' }, 'PRO RULES · +' + CHALLENGE_BONUS + ' LEVELS'),
      h('div', { class: 'ch-code-row' },
        codeEl,
        btn('btn ch-reroll', 'NEW CODE', () => { cur = codeFor(i, dice); codeEl.textContent = cur; restart(codeEl, 'pop'); }, h('span', { class: 'ch-emo', attrs: { 'aria-hidden': 'true' } }, '🎲'))),
      h('div', { class: 'ch-pre-actions' },
        btn('btn ch-pre-back', 'BACK', () => hideLayer(), '◀︎'),
        btn('btn btn-go ch-fight', 'FIGHT', () => start(cur), 'FIGHT ▶︎'))));
  }

  // ---------------------------------------------------------- the fight
  let stage = null;
  // Bumped whenever a fight is left or replaced. A turn (act), the opening
  // events and the card check it after every wait, so BACK mid-turn can
  // never let an old loop touch a null or a newer battle.
  let fightGen = 0;
  async function start(theCode) {
    const p = parseCode(theCode);
    if (!p) return;
    const gen = ++fightGen;
    code = makeCode(p.chapter, p.n);
    const chapter = p.chapter;
    layer(h('div', { class: 'ch-loading' }, h('img', { class: 'ch-loading-ball', src: ITEM('poke-ball'), alt: '', draggable: false })));
    try {
      try { await movesReady; } catch (e) { /* buildFighter copes */ }
      const mine = teamSpec(R());
      const foes = leaderTeam(chapter);
      const [myRaw, foeRaw] = await Promise.all([
        Promise.all(mine.map(m => buildFighter(m.id, m.level, { seed: moveSeed(teamN, m.id) }))),
        Promise.all(foes.map(m => buildFighter(m.id, m.level, { seed: moveSeed(9, m.id, m.level) })))
      ]);
      const learn = async f => { try { return (await getMon(f.id)).moveNames; } catch (e) { return []; } };
      const [myNames, foeNames] = await Promise.all([Promise.all(myRaw.map(learn)), Promise.all(foeRaw.map(learn))]);
      if (!alive || gen !== fightGen) return;
      // Status moves are dealt in a fixed order from the code, so a code is one fight.
      const mrng = seededRng(hashSeed('MOVES:' + code));
      const myTeam = myRaw.map((f, k) => withStatusMoves(f, myNames[k], { rng: mrng, lookup: moveInfo }));
      const enemyTeam = foeRaw.map((f, k) => withStatusMoves(f, foeNames[k], { rng: mrng, lookup: moveInfo }));
      battle = createProBattle({
        myTeam, enemyTeam, profile: 'reader', rng: challengeRng(code), moveLookup: moveInfo,
        wild: false, leader: true, berries: 0
      });
    } catch (err) {
      if (!alive || gen !== fightGen) return;
      console.warn('challenge: could not start', err);
      layer(h('div', { class: 'ch-loading' }, btn('btn', 'BACK', () => pickScreen(), '◀︎')));
      return;
    }
    hideLayer();
    buildFight(chapter);
    try { music.playMusic('gym'); } catch (e) { /* bonus */ }
    stage.show('foe', battle.state.foe.team[0]);
    stage.show('me', battle.state.me.team[0]);
    drawChips();
    el.dataset.ready = '1';
    const c = CHAPTERS[chapter];
    ui.banner.hidden = false;
    clear(ui.banner).append(h('div', { class: 'ch-banner-name' }, c.trainers[leaderIdx(chapter)].name), h('div', { class: 'ch-banner-code' }, code));
    restart(ui.banner, 'open');
    safeCry(battle.state.foe.team[0].id);
    if (!await pause(1200) || gen !== fightGen) return;
    ui.banner.hidden = true;
    for (const e of battle.openingEvents) { if (!await playEvent(e) || gen !== fightGen) return; }
    busy = false;
    renderControls();
    renderIntent();
  }

  function buildFight(chapter) {
    stage = makeStage({
      calm: false, words: true, pause,
      shinyOf: (side, id) => side === 'me' && (R().shinies || []).includes(id),
      nickOf: (side, id) => (side === 'me' ? (R().nicks || {})[id] : null)
    });
    const c = CHAPTERS[chapter];
    stage.field.classList.add('ch-field');
    stage.field.append(
      ui.chipsFoe = h('div', { class: 'ch-chips ch-chips-foe' }),
      ui.chipsMe = h('div', { class: 'ch-chips ch-chips-me' }),
      ui.intent = h('div', { class: 'ch-intent', hidden: true }),
      ui.weather = h('div', { class: 'ch-weather', hidden: true, attrs: { 'aria-hidden': 'true' } }),
      ui.pop = h('div', { class: 'ch-pop-host', attrs: { 'aria-hidden': 'true' } }),
      ui.banner = h('div', { class: 'ch-banner', hidden: true }),
      h('div', { class: 'ch-codetag' }, code));
    stage.field.style.setProperty('--acc', c.palette.accent);
    clear(ui.main).append(h('div', { class: 'ch-fight-wrap' },
      btn('ch-home', 'BACK', () => pickScreen(), '◀︎'),
      stage.field,
      ui.controls = h('div', { class: 'ch-controls' },
        ui.moves = h('div', { class: 'ch-moves' }),
        ui.actions = h('div', { class: 'ch-actions' }))));
  }

  const active = side => battle.state[side].team[battle.state[side].active];

  function chipsFor(f) {
    const out = [];
    if (f.status) {
      const s = STATUS_INFO[f.status];
      out.push(h('span', { class: 'ch-chip-st', style: { '--sc': s.color }, dataset: { status: f.status } }, s.label));
    }
    for (const k of Object.keys(STAT_LABEL)) {
      const v = f.stages[k];
      if (v) out.push(h('span', { class: ['ch-chip-stage', v > 0 ? 'up' : 'down'], dataset: { stat: k } }, STAT_LABEL[k] + (v > 0 ? '+' : '') + v));
    }
    if (f.ability) out.push(h('span', { class: 'ch-chip-ab' }, abilityLabel(f.ability)));
    return out;
  }
  function drawChips() {
    if (!battle) return;
    clear(ui.chipsFoe).append(...chipsFor(stage.current('foe') || active('foe')));
    clear(ui.chipsMe).append(...chipsFor(stage.current('me') || active('me')));
    const w = battle.state.weather;
    ui.weather.hidden = !w;
    clear(ui.weather).append(w === 'rain' ? '🌧️' : w === 'sun' ? '☀️' : '');
    stage.field.classList.toggle('ch-rain', w === 'rain');
    stage.field.classList.toggle('ch-sun', w === 'sun');
  }

  function renderIntent() {
    if (!battle || battle.state.over) { ui.intent.hidden = true; return; }
    const a = battle.foeIntentAction();
    const info = INTENT_INFO[a.icon] || INTENT_INFO.attack;
    const kids = [h('span', { class: 'ch-intent-ico' }, info.icon)];
    if (a.kind === 'switch') {
      const next = battle.state.foe.team[a.index];
      if (next) kids.push(spriteImg(next.id, { class: 'ch-intent-sprite' }));
    } else if (a.move) {
      const meta = moveMeta(a.move);
      if (meta && meta.status) kids.push(h('span', { class: 'ch-intent-sub' }, STATUS_INFO[meta.status].icon));
      else kids.push(h('span', { class: 'ch-intent-sub' }, typeEmoji[a.move.type] || typeEmoji.normal));
    }
    kids.push(h('span', { class: 'ch-intent-label' }, info.label));
    clear(ui.intent).append(...kids);
    ui.intent.dataset.intent = a.icon;
    const tc = a.move ? (typeColors[a.move.type] || typeColors.normal) : '#f8f8e8';
    ui.intent.style.setProperty('--tc', tc);
    ui.intent.hidden = false;
    restart(ui.intent, 'pop');
  }

  function renderControls() {
    clear(ui.moves);
    clear(ui.actions);
    if (!battle) return;
    const f = active('me');
    const pics = movePictures(f.moves);
    f.moves.forEach((m, i) => {
      const b = moveButton(m, pics[i], { reader: true, onClick: guard(() => act({ kind: 'move', index: i })) });
      if (m.damage_class === 'status') b.classList.add('ch-move-status');
      b.disabled = busy;
      ui.moves.appendChild(b);
    });
    const team = battle.state.me.team;
    const canSwitch = team.some((x, i) => !x.fainted && i !== battle.state.me.active);
    ui.actions.append(
      h('button', {
        class: 'ch-act ch-act-switch', type: 'button', disabled: busy || !canSwitch, attrs: { 'aria-label': 'SWITCH' },
        on: { click: guard(() => { play('tap'); openTeam(); }) }
      }, h('span', { class: 'ch-mini', attrs: { 'aria-hidden': 'true' } }, team.slice(0, 3).map(x => spriteImg(x.id, { class: ['ch-mini-sprite', { out: x.fainted }] }))), 'SWITCH'),
      ui.giveUp = h('button', {
        class: ['ch-act', 'ch-act-quit', { armed: giveUpArmed }], type: 'button', disabled: busy, attrs: { 'aria-label': 'GIVE UP' },
        on: { click: guard(() => { play('tap'); giveUp(); }) }
      }, h('span', { class: 'ch-emo', attrs: { 'aria-hidden': 'true' } }, '🏳️'), giveUpArmed ? 'SURE?' : null));
  }

  function giveUp() {
    if (busy || !battle || battle.state.over) return;
    if (!giveUpArmed) {
      giveUpArmed = true;
      renderControls();
      later(() => { giveUpArmed = false; if (alive && battle && !busy) renderControls(); }, 3000);
      return;
    }
    giveUpArmed = false;
    busy = true;
    finish({ type: 'end', winner: 'foe', gaveUp: true });
  }

  function openTeam() {
    if (busy) return;
    const cur = battle.state.me.active;
    layer(h('div', { class: 'ch-team-pick panel' },
      h('div', { class: 'ch-team-row' }, battle.state.me.team.map((f, i) => {
        const out = f.fainted || i === cur;
        return h('button', {
          class: ['ch-slot', { out: f.fainted, current: i === cur }], type: 'button', disabled: out,
          attrs: { 'aria-label': String(f.name || '') },
          on: { click: guard(() => { play('tap'); hideLayer(); act({ kind: 'switch', index: i }); }) }
        }, spriteImg(f.id, { class: 'ch-slot-sprite', shiny: (R().shinies || []).includes(f.id) }),
        h('span', { class: 'ch-slot-hp' }, h('span', { class: ['ch-slot-hp-fill', { low: f.hp / f.maxHp <= 0.2 }], style: { width: Math.round(100 * f.hp / f.maxHp) + '%' } })),
        f.status ? h('span', { class: 'ch-slot-st' }, STATUS_INFO[f.status].label) : null);
      })),
      btn('btn ch-team-x', 'BACK', () => hideLayer(), '◀︎')));
  }

  async function act(action) {
    if (busy || !battle || battle.state.over || !alive) return;
    const gen = fightGen;
    const live = () => alive && gen === fightGen && !!battle;
    busy = true;
    giveUpArmed = false;
    play('tap');
    renderControls();
    ui.intent.hidden = true;
    const events = await battle.choose(action);
    if (!live()) return;
    if (!events.length) { busy = false; renderControls(); renderIntent(); return; }
    let endEv = null;
    for (const e of events) {
      if (!live()) return;
      if (e.type === 'end') { endEv = e; continue; }
      if (!await playEvent(e)) return;
    }
    if (!live()) return;
    if (endEv) { finish(endEv); return; }
    busy = false;
    renderControls();
    renderIntent();
  }

  // ---------------------------------------------------------- event playback
  function pop(side, text, cls = '') {
    const node = h('div', { class: ['ch-pop', 'ch-pop-' + side, cls] }, text);
    ui.pop.appendChild(node);
    later(() => node.remove(), 1400);
  }
  function tag(side, move) {
    const tc = typeColors[move.type] || typeColors.normal;
    clear(stage.ui.tag).append(
      h('span', { class: 'fs-tag-ico', attrs: { 'aria-hidden': 'true' } }, typeEmoji[move.type] || typeEmoji.normal),
      moveLabel(move.name));
    stage.ui.tag.className = `fs-tag fs-tag-${side}`;
    stage.ui.tag.style.setProperty('--tc', tc);
    stage.ui.tag.style.setProperty('--ink', inkFor(tc));
    stage.ui.tag.hidden = false;
  }
  const sprite = side => stage.ui[side + 'Sprite'];

  async function playEvent(e) {
    const gen = fightGen;
    const b = battle;
    if (!b) return false;
    let ok = true;
    switch (e.type) {
      case 'move':
        if (e.status) {
          tag(e.side, e.move);
          restart(sprite(e.side), 'lunge');
          ok = await pause(650);
          stage.ui.tag.hidden = true;
        } else {
          ok = await stage.playEvent(e, b);
        }
        break;
      case 'miss': {
        tag(e.side, e.move);
        restart(sprite(e.side), 'lunge');
        const target = e.reason === 'failed' ? e.side : (e.side === 'me' ? 'foe' : 'me');
        pop(target, e.reason === 'protected' ? '🛡️ BLOCKED' : e.reason === 'immune' ? 'NO EFFECT' : e.reason === 'failed' ? 'FAILED' : 'MISS', 'miss');
        ok = await pause(750);
        stage.ui.tag.hidden = true;
        break;
      }
      case 'status': {
        const s = STATUS_INFO[e.status];
        if (e.what === 'tick') { stage.setHp(e.side, e.hpAfter); pop(e.side, s.icon + ' -' + e.dmg, 'hurt'); }
        else if (e.what === 'inflict') { pop(e.side, s.icon + ' ' + s.label, 'st'); play('hit', 1); }
        else if (e.what === 'cant') { restart(sprite(e.side), 'hit-soft'); pop(e.side, s.icon, 'st'); }
        else pop(e.side, e.what === 'wake' ? '☀️ UP!' : '💧 THAW', 'st');
        drawChips();
        ok = await pause(650);
        break;
      }
      case 'stage':
        pop(e.side, STAT_LABEL[e.stat] + (e.delta > 0 ? ' ▲' : e.delta < 0 ? ' ▼' : ' MAX') + (Math.abs(e.delta) > 1 ? Math.abs(e.delta) : ''), e.delta >= 0 ? 'up' : 'down');
        drawChips();
        ok = await pause(500);
        break;
      case 'ability':
        pop(e.side, '✨ ' + abilityLabel(e.ability), 'ab');
        ok = await pause(700);
        break;
      case 'protect':
        pop(e.side, e.ok ? '🛡️' : 'FAILED', e.ok ? 'st' : 'miss');
        ok = await pause(450);
        break;
      case 'weather':
        drawChips();
        ok = await pause(500);
        break;
      case 'heal':
        stage.setHp(e.side, e.hpAfter);
        pop(e.side, '+' + e.amount, 'heal');
        ok = await pause(550);
        break;
      case 'hurt':
        stage.setHp(e.side, e.hpAfter);
        pop(e.side, '-' + e.dmg, 'hurt');
        ok = await pause(500);
        break;
      case 'switch':
        restart(sprite(e.side), 'faint');
        if (!await pause(260) || gen !== fightGen) return false;
        stage.show(e.side, b.state[e.side].team[e.index]);
        safeCry(b.state[e.side].team[e.index].id);
        drawChips();
        ok = await pause(550);
        break;
      default:
        ok = await stage.playEvent(e, b);
        if (e.type === 'send' && gen === fightGen) drawChips();
    }
    return ok && alive && gen === fightGen;
  }

  // ---------------------------------------------------------- the card
  function finish(ev) {
    if (!battle) return;      // the fight was left: no card, no ribbon
    busy = true;
    const won = ev.winner === 'me';
    const whoName = who();
    const chapter = parseCode(code).chapter;
    let beatDad = false;
    if (won) {
      beatDad = player === 'kid' && (SESSION_WINS.some(w => w.code === code && w.who === 'DAD')
        || savedWins().some(w => w.code === code && w.who === 'dad'));
      if (!SESSION_WINS.some(w => w.code === code && w.who === whoName)) SESSION_WINS.push({ code, who: whoName, chapter });
      if (SESSION_WINS.length > 50) SESSION_WINS.shift();
      try { store.addChallengeWin(code, player === 'dad' ? 'dad' : 'reader'); } catch (e) { /* a ribbon never breaks the card */ }
      play('win');
    }
    try { music.stopMusic(); } catch (e) { /* ignore */ }
    const shareText = 'TRY ' + code + " IN DAD'S CHALLENGE";
    const sendLabel = h('span', {}, '📤 SEND');
    const send = btn('btn ch-send', 'SEND CODE', async () => {
      try {
        if (navigator.share) { await navigator.share({ text: shareText }); return; }
        if (navigator.clipboard) { await navigator.clipboard.writeText(code); clear(sendLabel).append('✓ COPIED'); }
      } catch (e) { /* the grown-up cancelled */ }
    }, sendLabel);
    const hero = won ? (battle.state.me.team.find(f => !f.fainted) || battle.state.me.team[0]) : battle.state.foe.team[battle.state.foe.active];
    layer(h('div', { class: ['ch-card', 'panel', won ? 'win' : 'lose'], dataset: { result: won ? 'win' : 'lose' } },
      won ? h('div', { class: 'ch-card-crown', attrs: { 'aria-hidden': 'true' } }, '🏆') : null,
      spriteImg(hero.id, { animated: true, class: 'ch-card-sprite' }),
      h('div', { class: 'ch-card-words' }, won ? whoName + ' WINS!' : 'SO CLOSE!'),
      won ? h('div', { class: 'ch-ribbon big' }, '🎗️ ' + (beatDad ? 'BEAT DAD!' : whoName + ' BEAT ' + code)) : null,
      h('div', { class: 'ch-card-code' }, code),
      h('div', { class: 'ch-card-sub' }, won ? (player === 'dad' ? 'TEXT ' + readerName + ': TRY ' + code : 'NOW DARE DAD!') : CHAPTERS[chapter].trainers[leaderIdx(chapter)].name),
      h('div', { class: 'ch-card-actions' },
        btn('btn ch-card-back', 'BACK', () => pickScreen(), '◀︎'),
        btn('btn ch-again', 'SAME CODE', () => start(code), h('span', { class: 'ch-emo', attrs: { 'aria-hidden': 'true' } }, '🔁')),
        btn('btn ch-new', 'NEW CODE', () => start(codeFor(chapter, dice)), h('span', { class: 'ch-emo', attrs: { 'aria-hidden': 'true' } }, '🎲')),
        send)));
    ui.layer.classList.add('ch-layer-card');
    safeCry(hero.id);
  }

  // ---------------------------------------------------------- boot
  const startCode = parseCode(params.code);
  pickScreen();
  if (startCode && beatenLeaders(store.save).includes(startCode.chapter)) preview(startCode.chapter, makeCode(startCode.chapter, startCode.n));

  return function unmount() {
    alive = false;
    if (ac) ac.abort();
    for (const t of timers) clearTimeout(t);
    timers.clear();
    try { music.stopMusic(); } catch (e) { /* ignore */ }
    clear(root);
  };
}
