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

export function createBattle({ myTeam, enemyTeam, profile = 'reader', rng = Math.random, moveLookup = null, wild = false, leader = false } = {}) {
  if (!Array.isArray(myTeam) || !myTeam.length) throw new Error('createBattle: myTeam is empty');
  if (!Array.isArray(enemyTeam) || !enemyTeam.length) throw new Error('createBattle: enemyTeam is empty');

  const junior = profile === 'prereader';
  const smartFoe = !wild && !junior;

  const state = {
    me: { active: 0, team: myTeam.map(m => makeFighter(m, moveLookup)) },
    foe: { active: 0, team: enemyTeam.map(m => makeFighter(m, moveLookup)) },
    turn: 0, over: false, winner: null, phase: 1
  };

  let phase2Done = false;
  let intent = 0;
  let busy = false;
  const xpById = new Map();

  const active = side => state[side].team[state[side].active];
  const other = side => (side === 'me' ? 'foe' : 'me');
  const aliveIdx = side => state[side].team.map((f, i) => (f.fainted ? -1 : i)).filter(i => i >= 0);

  function commitIntent() {
    const f = active('foe');
    const target = engineView(active('me'));
    const mv = pickMove(f.moves, target, { smart: smartFoe, rng });
    const i = f.moves.indexOf(mv);
    intent = i >= 0 ? i : 0;
  }

  function addXp(defeated) {
    const me = active('me');
    const gained = xpForKO({ base_experience: defeated.base_experience ?? defeated.baseExperience, level: defeated.level });
    xpById.set(me.id, (xpById.get(me.id) || 0) + gained);
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
    if (junior && side === 'me') {
      // His hits always count, even into an immunity: a stalemate is a loss
      // he can feel. The eff reported stays honest for the reader UI only.
      dmg = Math.max(dmg, Math.ceil(defF.maxHp * JUNIOR_MIN_HIT));
      if (eff === 0) eff = 1;
    }

    let hpAfter = defF.hp - dmg;
    if (junior && defSide === 'me') hpAfter = Math.max(1, hpAfter);

    // The leader's ace never skips its big moment: a hit that would take it
    // from above half straight to zero leaves it on 1 so phase 2 can fire.
    const triggerPhase2 = defSide === 'foe' && isAce() && !phase2Done && hpAfter <= defF.maxHp * PHASE2_AT;
    if (triggerPhase2) hpAfter = Math.max(1, hpAfter);

    hpAfter = Math.max(0, Math.min(defF.maxHp, Math.round(hpAfter)));
    dmg = defF.hp - hpAfter;
    defF.hp = hpAfter;
    events.push({ type: 'move', side, move: { ...move }, dmg, crit: !!res.crit, eff, hpAfter });

    if (triggerPhase2) {
      phase2Done = true;
      state.phase = 2;
      defF.hp = Math.min(defF.maxHp, defF.hp + Math.round(defF.maxHp * PHASE2_HEAL));
      defF.atkMult = PHASE2_ATK;
      events.push({ type: 'phase2', side: 'foe', hpAfter: defF.hp });
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
    state[side].active = next[0];
    events.push({ type: 'send', side, index: next[0] });
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
    foeTurn(events);                 // the foe's committed move lands on the newcomer
    return finishTurn(events);
  }

  function doBall(ball) {
    if (!wild) return [];
    const mod = BALL_MODS[ball];
    if (!mod) return [];
    const foe = active('foe');
    const p = catchProbability({
      captureRate: num(foe.captureRate, 45), ballMod: mod,
      hp: foe.hp, maxHp: foe.maxHp, junior, master: ball === 'master'
    });
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
        if (action.kind === 'move') return doMove(action.index | 0);
        if (action.kind === 'switch') return doSwitch(action.index);
        if (action.kind === 'ball') return doBall(action.ball);
        if (action.kind === 'run') return doRun();
        return [];
      } finally {
        busy = false;
      }
    },
    foeIntent() { return intent; },
    foeIntentMove() { const f = active('foe'); return f.moves[intent] || f.moves[0]; }
  };
}
