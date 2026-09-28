// ============================================================
// SPROUT ROAD — battle factory (DOM-free, unit-tested)
//
// One call makes one fight. Everything the fight knows lives inside the
// closure below: there is NO module-level mutable state, so two battles can
// never trample each other and a stale await can never touch a new fight.
// Every random number comes from the injected rng, so a seed replays a
// fight exactly.
//
// Prereader rules (never advertised anywhere): his Pokemon never faint (HP
// floors at 1 and incoming hits are capped), his own hits always land for a
// decent chunk, and every ball he throws catches.
// ============================================================

import {
  computeDamage, catchProbability, xpForKO, applyXp, pickMove, usableMoves,
  JUNIOR_MIN_HIT
} from '../data/engine.js';

export const BALL_MODS = { poke: 1, great: 1.5, ultra: 2, master: 255 };
export const PHASE2_AT = 0.5;       // leader's last mon at <= 50% HP
export const PHASE2_HEAL = 0.25;    // heals +25% maxHp
export const PHASE2_ATK = 1.25;     // and hits 1.25x harder
export const BERRY_HEAL = 0.3;      // an Oran Berry heals 30% of max HP by default

const TACKLE = { name: 'tackle', type: 'normal', power: 40, damage_class: 'physical' };

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const typeName = t => (typeof t === 'string' ? t : t && t.type && t.type.name) || null;

function normMoves(moves, moveLookup) {
  const resolved = (moves || []).map(m => {
    if (m && typeof m === 'object') return m;
    const d = moveLookup ? moveLookup(String(m || '').toLowerCase()) : null;
    return d ? { name: String(m).toLowerCase(), type: d.type, power: d.power, damage_class: d.damage_class } : null;
  }).filter(Boolean);
  const usable = usableMoves(resolved).map(m => ({
    name: m.name, type: m.type || 'normal', power: m.power, damage_class: m.damage_class || 'physical'
  }));
  return usable.length ? usable.slice(0, 4) : [{ ...TACKLE }];
}

// Accepts buildFighter's {stats:{hp,atk,def,spatk,spdef,spe}} and also
// engine.computeStats' {maxHp,...,speed}, so either builder shape works.
function makeFighter(src, moveLookup) {
  const s = src.stats || {};
  const level = Math.max(1, Math.round(num(src.level, 5)));
  const maxHp = Math.max(1, Math.round(num(s.hp, num(s.maxHp, num(src.maxHp, 10 + level * 2)))));
  const types = (src.types || []).map(typeName).filter(Boolean);
  return {
    ...src,
    level,
    types: types.length ? types : ['normal'],
    moves: normMoves(src.moves, moveLookup),
    maxHp,
    hp: maxHp,
    atk: Math.max(1, num(s.atk, 10)),
    def: Math.max(1, num(s.def, 10)),
    spatk: Math.max(1, num(s.spatk, num(s.atk, 10))),
    spdef: Math.max(1, num(s.spdef, num(s.def, 10))),
    spe: Math.max(1, num(s.spe, num(s.speed, 10))),
    atkMult: 1,
    fainted: false
  };
}

// The shape engine.computeDamage wants.
function engineView(f) {
  return {
    level: f.level, maxHp: f.maxHp,
    atk: f.atk * f.atkMult, spatk: f.spatk * f.atkMult,
    def: f.def, spdef: f.spdef,
    types: f.types.map(t => ({ type: { name: t } }))
  };
}

// ------------------------------------------------------------
// Move pictures (pure; the battle screen draws them). A pre-reader sees no
// move names, and four moves of one type used to look identical. Each move
// now gets a big SHAPE (what the move does: a fist, a kick, a bite, a swirl,
// a beam...), coloured by its type, plus 1-4 power dots. Within one moveset
// no two buttons of the same type ever share a shape.
// Glyphs avoid every type emoji (config.typeEmoji) and every star (a star
// means "reward" elsewhere in the game).
// ------------------------------------------------------------
const PHYS_SHAPES = [                 // first = the plain default; body-part shapes last
  ['\u270A', /punch|fist|hammer|arm|jab/],                               // raised fist
  ['\u{1F4A5}', /tackle|slam|body|rush|take-down|headbutt|charge|ram|crash|smash|press|bash/], // bang
  ['\u{1F43E}', /scratch|claw|slash|cut|fury|swipe|scrape/],             // paw prints
  ['\u{1F4CC}', /peck|horn|drill|sting|pin|spike|needle/],               // pin
  ['\u{1FA83}', /throw|toss|boomerang|return|rollout|roll/],             // boomerang
  ['\u{1F9B6}', /kick|stomp|foot|trample|step/],                         // foot
  ['\u{1F9B7}', /bite|fang|crunch|chomp|jaw/],                           // tooth
];
const SPEC_SHAPES = [
  ['\u{1F300}', null],                                                   // swirl (default)
  ['\u{1F506}', /beam|ray|flash|blast|cannon|gun|shot/],                // bright sun
  ['\u{1FAE7}', /bubble|surf|spray|splash|wave|mist|foam/],             // bubbles
  ['\u{1F4AB}', /confus|psy|dream|hypno|mind|dizzy/],                   // dizzy
  ['\u{1F308}', /aurora|rainbow|prism|signal|color/],                   // rainbow
  ['\u{1F32A}\uFE0F', /wind|gust|twister|storm|air|hurricane|tornado/], // tornado
  ['\u{1F4A8}', /breath|puff|smog|powder|spore|dust/],                  // puff
];

/** Power dots for a move: 1 (weak) .. 4 (huge). */
export function powerDots(power) {
  const p = num(power, 0);
  return p <= 40 ? 1 : p <= 65 ? 2 : p <= 90 ? 3 : 4;
}

/**
 * [{ glyph, dots, type, shape:'physical'|'special' }] for a moveset, same
 * order. No two moves in one moveset share a glyph (a later one takes the
 * next free glyph of its own class, then of the other class).
 */
export function movePictures(moves) {
  // One set for the whole moveset: a grass move and a poison move that both
  // fall back to the swirl used to share it, told apart only by colour.
  const taken = new Set();
  return (moves || []).map(m => {
    const name = String((m && m.name) || '').toLowerCase();
    const type = (m && m.type) || 'normal';
    const special = m && m.damage_class === 'special';
    const own = special ? SPEC_SHAPES : PHYS_SHAPES;
    const rest = special ? PHYS_SHAPES : SPEC_SHAPES;
    const match = own.find(([, re]) => re && re.test(name));
    const order = [match, ...own, ...rest].filter(Boolean).map(([g]) => g);
    const glyph = order.find(g => !taken.has(g)) || order[0];
    taken.add(glyph);
    return { glyph, dots: powerDots(m && m.power), type, shape: special ? 'special' : 'physical' };
  });
}

export function createBattle({ myTeam, enemyTeam, profile = 'reader', rng = Math.random, moveLookup = null, wild = false, leader = false, berries = Infinity, gimmick = null, chooseOnFaint = false, legendary = false } = {}) {
  if (!Array.isArray(myTeam) || !myTeam.length) throw new Error('createBattle: myTeam is empty');
  if (!Array.isArray(enemyTeam) || !enemyTeam.length) throw new Error('createBattle: enemyTeam is empty');

  const junior = profile === 'prereader';
  const smartFoe = !wild && !junior;

  const state = {
    me: { active: 0, team: myTeam.map(m => makeFighter(m, moveLookup)) },
    foe: { active: 0, team: enemyTeam.map(m => makeFighter(m, moveLookup)) },
    turn: 0, over: false, winner: null, phase: 1
  };

  let berriesLeft = typeof berries === 'number' && berries >= 0 ? (Number.isFinite(berries) ? Math.floor(berries) : Infinity) : Infinity;
  state.me.berries = berriesLeft;
  let phase2Done = false;
  let intent = 0;
  let busy = false;
  const xpById = new Map();
  // chooseOnFaint (a reader's own screen only): when his Pokemon faints and
  // more than one is left, he picks who comes in (state.me.mustChoose) and
  // that send is free. A prereader, and every other caller, keeps auto-send.
  const letChoose = !!chooseOnFaint && !junior;
  state.me.mustChoose = false;
  // legendary (a wild sanctum fight): the first blow that would knock it out
  // leaves it on 1 HP instead ('hold' event) and balls then catch at least
  // half the time, so beating it is his chance to catch it, not the end.
  const legend = !!legendary && !!wild;
  let held = false;
  const HELD_CATCH = 0.5;

  const active = side => state[side].team[state[side].active];

  // Party XP: every Pokemon of mine that stood in against the current foe.
  const fought = new Set();
  const markFought = () => { const m = active('me'); if (m && !m.fainted) fought.add(m.id); };
  markFought();

  // ==== round2 gimmick hook BEGIN ====
  // opts.gimmick (optional, ROUND 2 leaders; data/round2.js makeGimmick):
  //   { key, onPhase2(g), onTurnStart(g), onDamage(g) -> damage multiplier }
  // Every callback is optional and wrapped: a throwing gimmick never breaks the
  // fight. Gimmick chip/drain never takes anyone below 1 HP (weather never lands
  // the final blow), and the prereader rules still run AFTER any multiplier.
  // Events: { type:'gimmick', key, kind, side?, amount?, hpAfter?, stat? }.
  const gm = gimmick && typeof gimmick === 'object' ? gimmick : null;
  state.gimmick = gm && typeof gm.key === 'string' ? gm.key : null;
  function gCall(name, events, extra = {}) {
    const fn = gm && gm[name];
    if (typeof fn !== 'function') return undefined;
    const key = state.gimmick;
    const note = (kind, data = {}) => { events.push({ ...data, type: 'gimmick', key, kind: String(kind) }); };
    const hpMove = (side, amount, kind) => {
      const f = active(side);
      const n = Math.max(0, Math.round(num(amount, 0)));
      if (!f || f.fainted || !n) return 0;
      const hpAfter = kind === 'heal' ? Math.min(f.maxHp, f.hp + n) : Math.max(1, f.hp - n);
      const moved = Math.abs(f.hp - hpAfter);
      if (!moved) return 0;
      f.hp = hpAfter;
      note(kind, { side, amount: moved, hpAfter });
      return moved;
    };
    const g = {
      key, phase: state.phase, turn: state.turn, state, rng, junior, isAce: isAce(),
      me: active('me'), foe: active('foe'),
      note,
      chip: (side, fraction) => { const f = active(side); return f ? hpMove(side, Math.max(1, f.maxHp * Math.min(0.5, Math.max(0, num(fraction, 0)))), 'chip') : 0; },
      heal: (side, amount) => hpMove(side, amount, 'heal'),
      boost: (side, mult, stat = 'atk') => {
        const f = active(side);
        const m = num(mult, 1);
        if (!f || !(m > 0)) return;
        if (stat === 'spe') f.spe = Math.max(1, Math.round(f.spe * Math.min(4, m)));
        else f.atkMult = Math.min(3, f.atkMult * m);
        note('boost', { side, stat: stat === 'spe' ? 'spe' : 'atk' });
      },
      ...extra
    };
    try { return fn(g); } catch (e) { return undefined; }
  }
  const gTurnStart = events => { if (gm && !state.over) gCall('onTurnStart', events); };
  function gDamage(side, move, atkF, defF, dmg, eff, events) {
    if (!gm) return dmg;
    const m = num(gCall('onDamage', events, { side, move, attacker: atkF, defender: defF, dmg, eff }), 1);
    const mult = Math.max(0, Math.min(4, m));
    if (mult === 1) return dmg;
    const out = Math.round(dmg * mult);
    return mult > 0 && eff > 0 ? Math.max(1, out) : out;
  }
  // ==== round2 gimmick hook END ====
  const other = side => (side === 'me' ? 'foe' : 'me');
  const aliveIdx = side => state[side].team.map((f, i) => (f.fainted ? -1 : i)).filter(i => i >= 0);

  function commitIntent() {
    const f = active('foe');
    const target = engineView(active('me'));
    const mv = pickMove(f.moves, target, { smart: smartFoe, rng });
    const i = f.moves.indexOf(mv);
    intent = i >= 0 ? i : 0;
  }

  // The one that lands the KO (or the catch) gets full XP; every other
  // Pokemon that fought this foe and is still standing gets half.
  function addXp(defeated) {
    const me = active('me');
    const gained = xpForKO({ base_experience: defeated.base_experience ?? defeated.baseExperience, level: defeated.level });
    const give = (id, n) => xpById.set(id, (xpById.get(id) || 0) + n);
    give(me.id, gained);
    const half = Math.max(1, Math.floor(gained / 2));
    for (const id of fought) {
      if (id === me.id) continue;
      const f = state.me.team.find(m => m.id === id);
      if (f && !f.fainted) give(id, half);
    }
  }

  function xpReport() {
    const out = [];
    for (const [id, gained] of xpById) {
      const f = state.me.team.find(m => m.id === id);
      const res = applyXp({ level: f ? f.level : 5, xp: f ? num(f.xp, 0) : 0 }, gained);
      out.push({ id, gained, levelsUp: res.ups });
    }
    return out;
  }

  function end(events, winner, extra = {}) {
    state.over = true;
    state.winner = winner;
    events.push({ type: 'end', winner, ...extra, xp: winner === 'me' ? xpReport() : [] });
  }

  const isAce = () => leader && state.foe.active === state.foe.team.length - 1;

  // One attack. Returns true if the defender fainted.
  function attack(side, move, events) {
    const atkF = active(side), defSide = other(side), defF = active(defSide);
    const res = computeDamage(engineView(atkF), engineView(defF), move, {
      rng,
      junior: junior ? (side === 'me' ? 'attacker' : 'defender') : null
    });
    let eff = res.typeMult;
    let dmg = Math.max(0, Math.round(num(res.damage, 0)));
    if (eff > 0) dmg = Math.max(1, dmg);
    dmg = gDamage(side, move, atkF, defF, dmg, eff, events);   // round2 gimmick hook
    if (junior && side === 'me') {
      // His hits always count, even into an immunity: a stalemate is a loss
      // he can feel. The eff reported stays honest for the reader UI only.
      dmg = Math.max(dmg, Math.ceil(defF.maxHp * JUNIOR_MIN_HIT));
      if (eff === 0) eff = 1;
    }

    let hpAfter = defF.hp - dmg;
    if (junior && defSide === 'me') hpAfter = Math.max(1, hpAfter);

    let holdNow = false;
    if (legend && defSide === 'foe' && !held && hpAfter <= 0) { hpAfter = 1; held = true; holdNow = true; }

    // The leader's ace never skips its big moment: a hit that would take it
    // from above half straight to zero leaves it on 1 so phase 2 can fire.
    const triggerPhase2 = defSide === 'foe' && isAce() && !phase2Done && hpAfter <= defF.maxHp * PHASE2_AT;
    if (triggerPhase2) hpAfter = Math.max(1, hpAfter);

    hpAfter = Math.max(0, Math.min(defF.maxHp, Math.round(hpAfter)));
    dmg = defF.hp - hpAfter;
    defF.hp = hpAfter;
    events.push({ type: 'move', side, move: { ...move }, dmg, crit: !!res.crit, eff, hpAfter });
    if (holdNow) events.push({ type: 'hold', side: 'foe' });

    if (triggerPhase2) {
      phase2Done = true;
      state.phase = 2;
      defF.hp = Math.min(defF.maxHp, defF.hp + Math.round(defF.maxHp * PHASE2_HEAL));
      defF.atkMult = PHASE2_ATK;
      events.push({ type: 'phase2', side: 'foe', hpAfter: defF.hp });
      if (gm) gCall('onPhase2', events);                        // round2 gimmick hook
    }

    if (defF.hp <= 0) {
      defF.hp = 0;
      defF.fainted = true;
      events.push({ type: 'faint', side: defSide });
      if (defSide === 'foe') addXp(defF);
      return true;
    }
    return false;
  }

  // After a faint: send the next one or end the fight.
  function afterFaint(side, events) {
    const next = aliveIdx(side);
    if (!next.length) {
      end(events, other(side));
      return;
    }
    if (side === 'me' && letChoose && next.length > 1) {
      state.me.mustChoose = true;
      events.push({ type: 'choose', side, options: next });
      return;
    }
    state[side].active = next[0];
    events.push({ type: 'send', side, index: next[0] });
    if (side === 'foe') fought.clear();
    markFought();
  }

  // His pick after a faint: the newcomer comes in for free (no foe turn).
  function doSend(index) {
    const t = state.me.team;
    if (!Number.isInteger(index) || !t[index] || t[index].fainted) return [];
    state.me.mustChoose = false;
    state.me.active = index;
    markFought();
    const events = [{ type: 'send', side: 'me', index }];
    commitIntent();
    return events;
  }

  function foeTurn(events) {
    const f = active('foe');
    const mv = f.moves[intent] || f.moves[0];
    if (attack('foe', mv, events)) afterFaint('me', events);
  }

  function finishTurn(events) {
    if (!state.over) commitIntent();
    state.turn++;
    return events;
  }

  function doMove(index) {
    const events = [];
    gTurnStart(events);                                         // round2 gimmick hook
    const me = active('me');
    const myMove = me.moves[index] || me.moves[0];
    const foe = active('foe');
    const meFirst = me.spe > foe.spe || (me.spe === foe.spe && (junior || rng() < 0.5));

    if (meFirst) {
      if (attack('me', myMove, events)) { afterFaint('foe', events); return finishTurn(events); }
      foeTurn(events);
    } else {
      foeTurn(events);
      if (state.over) return finishTurn(events);
      // If my mon fainted and a new one came in, the new one does not act.
      if (events.some(e => e.type === 'faint' && e.side === 'me')) return finishTurn(events);
      if (attack('me', myMove, events)) afterFaint('foe', events);
    }
    return finishTurn(events);
  }

  function doSwitch(index) {
    const t = state.me.team;
    if (!Number.isInteger(index) || !t[index] || t[index].fainted || index === state.me.active) return [];
    const events = [{ type: 'switch', side: 'me', index }];
    state.me.active = index;
    markFought();
    gTurnStart(events);                                         // round2 gimmick hook
    foeTurn(events);                 // the foe's committed move lands on the newcomer
    return finishTurn(events);
  }

  function doBall(ball) {
    if (!wild) return [];
    const mod = BALL_MODS[ball];
    if (!mod) return [];
    const foe = active('foe');
    let p = catchProbability({
      captureRate: num(foe.captureRate, 45), ballMod: mod,
      hp: foe.hp, maxHp: foe.maxHp, junior, master: ball === 'master'
    });
    if (legend && held && foe.hp <= 1) p = Math.max(p, HELD_CATCH);
    const roll = rng();
    const success = p >= 1 || roll < p;
    let shakes = 3;
    if (!success) {
      const per = Math.cbrt(p);
      shakes = 0;
      while (shakes < 2 && rng() < per) shakes++;
    }
    const events = [{ type: 'catch', ball, shakes, success }];
    if (success) {
      addXp(foe);
      end(events, 'me', { caught: true, caughtId: foe.id });
      return finishTurn(events);
    }
    foeTurn(events);
    return finishTurn(events);
  }

  // A berry is a turn: the active mon heals, then the foe's committed move
  // lands. Nothing happens (and no turn passes) when it is already full, when
  // no berries are left, or for a bad fraction, so a berry is never wasted.
  function doBerry(fraction) {
    const f = num(fraction, BERRY_HEAL);
    if (!(f > 0) || berriesLeft < 1) return [];
    const me = active('me');
    if (me.fainted || me.hp >= me.maxHp) return [];
    const heal = Math.max(1, Math.round(me.maxHp * Math.min(1, f)));
    const hpAfter = Math.min(me.maxHp, me.hp + heal);
    const events = [{ type: 'heal', side: 'me', index: state.me.active, amount: hpAfter - me.hp, hpAfter }];
    me.hp = hpAfter;
    berriesLeft--;
    state.me.berries = berriesLeft;
    gTurnStart(events);                                         // round2 gimmick hook
    foeTurn(events);
    return finishTurn(events);
  }

  function doRun() {
    if (!wild) return [];
    const events = [];
    end(events, null, { fled: true });
    return finishTurn(events);
  }

  commitIntent();

  return {
    state,
    wild: !!wild,
    leader: !!leader,
    profile,
    async choose(action = {}) {
      if (state.over || busy) return [];
      busy = true;
      try {
        if (state.me.mustChoose) return action.kind === 'switch' ? doSend(action.index) : [];
        if (action.kind === 'move') return doMove(action.index | 0);
        if (action.kind === 'switch') return doSwitch(action.index);
        if (action.kind === 'ball') return doBall(action.ball);
        if (action.kind === 'run') return doRun();
        if (action.kind === 'berry') return doBerry(action.fraction);
        return [];
      } finally {
        busy = false;
      }
    },
    foeIntent() { return intent; },
    foeIntentMove() { const f = active('foe'); return f.moves[intent] || f.moves[0]; }
  };
}
