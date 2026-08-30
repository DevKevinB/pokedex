// ============================================================
// Pokédex OS — battle engine v2
// Teams of 6, levels/XP, crits, STAB, switching, evolution,
// wild level scaling. Wild Pokémon are auto-caught on victory.
// ============================================================

import { MAX_POKEMON, getTypeMultiplier, typeColors, typeEmoji, inkFor, sleep, awaitOrTap, ITEM_SPRITE, PIXEL_SPRITE } from './config.js';
// All fight maths lives in engine.js and is unit-tested there. Nothing in this
// file should recompute damage, catch odds or XP by hand ever again.
import {
  computeStats, computeDamage, catchProbability, xpForKO,
  pickMove as enginePickMove, usableMoves, clampPower, shuffle, xpProgress,
  wildLevel as engineWildLevel
} from './engine.js';
import { getPokemon, getMove, getSpecies, getEvolution, nameOf } from './api.js';
import { state, player, recordCatch, ensureMon, ensureMonAtLeast, monLevel, addXp, evolveMon, persist, spendMasterBall, recordShiny, hasShiny, setNick, nickOf, playerName, recordChampion, championRecord } from './state.js';
import { sfx, triggerVibration, playBeep } from './audio.js';
import { loadPoke } from './dex.js';
import { openPC } from './pc.js';
import { GYMS, trainerKey } from './gymdata.js';
import { gymRun, clearGymRun, recordGymWin } from './gym.js';
import { activeHabitat, habitatEncounterLevel } from './explore.js';
import { askNickname, cancelNickname } from './nickname.js';
import { dialog } from './dialog.js';
import { spawnConfetti } from './catch.js';

export const battleState = {
  isSparkle: false,
  teamIds: [],
  activeIdx: 0,
  loaded: {},        // id → fighter (player side)
  wild: null,
  isBattling: false,
  busy: false,
  origin: 'arena',   // 'arena' | 'explore' | 'gym'
  canCatch: true,
  trainer: null,     // { gymKey, idx, def, enemyNum } during gym battles
  // Previously these three were created on the fly by whichever code path
  // happened to run first, and never reliably cleared. Declaring them here
  // means exitBattleMode() has one complete list to reset.
  versusActive: false,
  wildShiny: false,
  pendingEvolution: null,
  bankedCatch: null,
  // Monotonic battle id, bumped on every exit. Async work captures it and
  // bails if it no longer matches — see stale().
  epoch: 0
};

// An async step that resumes after the battle ended must not touch anything.
// Without this, tapping ESCAPE mid-turn leaves an orphaned attack in flight
// that lands on whatever battle starts next.
const stale = e => e !== battleState.epoch;

// ---- party XP share ----
// The KO'er earns full XP; everyone else on the team earns half for being
// there. Without this, 269 battles fund exactly ONE Pokémon and the other five
// sit at Lv5 forever — which is why the boys' "teams" were really just a lead
// with five passengers. Returns display lines for the victory screen.
const PARTY_XP_SHARE = 0.5;
function awardPartyXp(koerId, amount) {
  const lines = [];
  const team = battleState.teamIds.length ? battleState.teamIds : [koerId];
  team.forEach(id => {
    if (id == null) return;
    const share = id === koerId ? amount : Math.floor(amount * PARTY_XP_SHARE);
    if (share <= 0) return;
    const before = monLevel(id);
    const ups = addXp(id, share);
    if (ups > 0) {
      const f = battleState.loaded[id];
      const nm = (f?.name || nickOf(id) || `#${id}`).toUpperCase();
      lines.push(`${nm} grew from Lv${before} to Lv${monLevel(id)}!`);
    }
  });
  return lines;
}

const active = () => battleState.loaded[battleState.teamIds[battleState.activeIdx]];

// Is the current player ART, in a mode where his accommodations apply?
// The floor/ceiling values themselves live in engine.js.
function juniorActive() {
  try { return !!player().settings.junior && !battleState.versusActive; }
  catch (e) { return false; }
}

function logMsg(msg) { document.getElementById('battle-log').innerText = msg; }
const show = (id, on = true) => { document.getElementById(id).style.display = on ? 'flex' : 'none'; };

// computeStats now comes from engine.js (and includes spatk/spdef).

async function buildFighter(id, level, side) {
  const data = await getPokemon(id);
  const stats = computeStats(data, level);
  const sp = data.sprites;

  let captureRate = 45;
  if (side === 'wild') {
    try { captureRate = (await getSpecies(data.species_url))?.capture_rate ?? 45; }
    catch (e) { /* default stands */ }
  }

  // Fetch a few more than we need, THEN filter to real attacks. The old code
  // took 4 at random and defaulted every null power to 40, which is how
  // Hypnosis became a 40-power attack and Growl became a punch.
  const candidates = shuffle(data.moves).slice(0, 10);
  const fetched = await Promise.all(candidates.map(async m => {
    try {
      const d = await getMove(m.url);
      return { name: d.name.replace(/-/g, ' '), rawName: d.name, power: d.power, type: d.type, damage_class: d.damage_class };
    } catch (e) { return null; }
  }));
  const moves = usableMoves(fetched.filter(Boolean).map(m => ({ ...m, name: m.rawName })))
    .slice(0, 4)
    .map(m => ({
      name: m.name.replace(/-/g, ' '),
      power: clampPower(m.power),      // a 250-power nuke the AI would spam
      type: m.type,
      damage_class: m.damage_class
    }));
  if (moves.length === 0) moves.push({ name: 'tackle', power: 40, type: 'normal', damage_class: 'physical' });

  const sparkle = side === 'player' && battleState.isSparkle;
  return {
    id, level, moves, captureRate,
    name: data.name, types: data.types, base_experience: data.base_experience || 60,
    ...stats, hp: stats.maxHp,
    spriteBack: sparkle ? (sp.animated_back_shiny ?? sp.back_shiny ?? sp.back_default) : (sp.animated_back ?? sp.back_default ?? sp.front_default),
    spriteFront: sp.animated ?? sp.front_default ?? '',
    shinyFront: sp.animated_shiny ?? sp.front_shiny ?? null
  };
}

// ---- mode entry/exit ----
// THE single teardown authority. Every way out of a battle — escape, victory,
// defeat, network error, evolution finishing — comes through here, and here is
// the only place battle flags are reset. Anything added to battleState above
// must be reset below, or it leaks into the next battle.
export function exitBattleMode() {
  battleState.epoch++;              // invalidate every in-flight async step
  state.appMode = 'dex';
  battleState.isBattling = false;
  battleState.busy = false;
  battleState.loaded = {};
  battleState.wild = null;
  battleState.isSparkle = false;
  battleState.wildShiny = false;
  battleState.versusActive = false;
  battleState.pendingEvolution = null;
  battleState.bankedCatch = null;
  // Release anyone blocked on the pass-and-play handoff, or that promise
  // never settles and the versus flow hangs forever behind a hidden modal.
  if (passResolver) { const r = passResolver; passResolver = null; r(); }
  // Same hazard as passResolver: the Hall of Fame blocks on a tap with no
  // timeout, so teardown has to release it or the ceremony deadlocks the
  // victory path behind a hidden modal.
  if (hofResolver) { const r = hofResolver; hofResolver = null; r(); }
  // Settle any open nickname prompt PROPERLY. Hiding the modal directly left
  // its promise pending and its listeners attached — the next prompt's OK
  // then fired both, renaming the previously caught Pokémon too.
  cancelNickname();
  versus.sides = null; versus.order = []; versus.qi = 0;
  ['sparkle-modal', 'victory-modal', 'switch-modal', 'evo-modal', 'loading-modal',
   'pass-modal', 'ballpick-modal', 'hof-modal', 'nick-modal'].forEach(id => show(id, false));
  document.getElementById('battle-container').classList.remove('active');
  const from = battleState.origin;
  battleState.origin = 'arena';
  battleState.canCatch = true;
  battleState.trainer = null;
  document.dispatchEvent(new CustomEvent('battle-exited'));
  if (from === 'explore') {
    document.dispatchEvent(new CustomEvent('return-to-explore'));
  } else if (from === 'gym') {
    document.dispatchEvent(new CustomEvent('return-to-gym'));
  } else if (state.curId) {
    loadPoke(state.curId);
  }
}

export function initBattleMode() {
  if (player().caught.length === 0) {
    dialog({ icon: '🔴', title: 'CATCH ONE FIRST!', text: 'You need a Pokémon to battle.' });
    return;
  }
  state.appMode = 'battle';
  openPC('team');
}

// team picked in PC → sparkle question (earned via shiny ownership)
export function onTeamConfirmed() {
  // Sparkle used to demand the shiny of your EXACT current lead species — a
  // 1-in-50 encounter on one specific Pokémon out of 649. That is not a
  // feature with a hard unlock, it is a feature that never unlocks. Owning
  // ANY shiny now turns it on, and the bonus is 1.5x rather than a
  // fight-trivialising 2.0x.
  const unlocked = player().shinies.length > 0;
  const btn = document.getElementById('variant-sparkle');
  btn.disabled = !unlocked;
  btn.innerText = unlocked ? '✨ SPARKLE ✨' : '🔒 SPARKLE — CATCH A SHINY!';
  document.getElementById('sparkle-hint').innerText = unlocked
    ? 'Sparkle variants deal 150% damage in battle!'
    : `Catch ANY ✨SHINY✨ in the wild (about 1 in 50 encounters) to unlock Sparkle power forever!`;
  show('sparkle-modal');
}

async function launchBattle(wildId, { sparkle = false, origin = 'arena' } = {}) {
  show('loading-modal');
  battleState.isSparkle = sparkle;
  battleState.origin = origin;
  battleState.wildShiny = Math.random() < 1 / 50; // ✨ shiny hunting
  battleState.teamIds = player().team.length ? [...player().team] : player().caught.slice(0, 6);
  battleState.activeIdx = 0;
  battleState.loaded = {};

  // Explore encounters take the HABITAT's level band (leashed to the lead in
  // engine.wildLevel). The Battle Arena has no habitat, so it stays keyed to
  // the lead — that's the one place "scaled to you" is the right answer.
  const leadLv = monLevel(battleState.teamIds[0]);
  const habitat = origin === 'explore' ? activeHabitat() : null;
  const wildLv = habitat
    ? habitatEncounterLevel(habitat)
    : engineWildLevel({ base: Math.max(2, leadLv - 2), spread: 4, badges: 0, leadLevel: leadLv, junior: juniorActive() });

  try {
    const leadId = battleState.teamIds[0];
    const [lead, wild] = await Promise.all([
      buildFighter(leadId, monLevel(leadId), 'player'),
      buildFighter(wildId, wildLv, 'wild')
    ]);
    battleState.loaded[leadId] = lead;
    battleState.wild = wild;
    if (battleState.wildShiny) {
      wild.shiny = true;
      wild.spriteFront = wild.shinyFront || wild.spriteFront;
    }
    show('loading-modal', false);
    startBattleUI();
    if (wild.shiny) {
      logMsg(`✨ WOW! A SHINY ${wild.name.toUpperCase()} APPEARED!! ✨`);
      sfx.catch();
      triggerVibration([80, 40, 80, 40, 160]);
    }
  } catch (e) {
    show('loading-modal', false);
    dialog({ icon: '📡', title: 'NETWORK HICCUP', text: 'The battle could not load. Try again!' });
    exitBattleMode();
  }
}

export async function finalizeBattleSetup(sparkle) {
  show('sparkle-modal', false);
  const wildId = Math.floor(Math.random() * MAX_POKEMON) + 1;
  await launchBattle(wildId, { sparkle, origin: 'arena' });
}

// EXPLORE mode encounters: saved team, no picker, no sparkle friction
export async function startWildEncounter(wildId) {
  state.appMode = 'battle';
  battleState.canCatch = true;
  battleState.trainer = null;
  await launchBattle(wildId, { sparkle: false, origin: 'explore' });
}

// ---- GYM trainer battles ----
export async function startTrainerBattle(gymKey, idx) {
  const gym = GYMS.find(g => g.key === gymKey);
  const def = gym?.trainers[idx];
  if (!def) return;
  state.appMode = 'battle';
  show('loading-modal');

  battleState.isSparkle = false;
  battleState.wildShiny = false;
  battleState.origin = 'gym';
  battleState.canCatch = false;
  // Rematches (unlocked in v18.9) pay half XP — the circuit stays a training
  // ground without out-earning new challenges.
  battleState.trainer = {
    gymKey, idx, def, enemyNum: 0, kos: [], xpLines: [],
    rematch: !!player().gyms.beaten[trainerKey(gymKey, idx)]
  };
  battleState.teamIds = player().team.length ? [...player().team] : player().caught.slice(0, 6);
  battleState.activeIdx = 0;
  battleState.loaded = {};

  // endurance: same-gym runs carry HP (junior always fresh)
  const endurance = !player().settings.junior && gymRun.gymKey === gymKey;
  if (!endurance) { gymRun.gymKey = gymKey; gymRun.hp = {}; }

  try {
    const leadId = battleState.teamIds[0];
    const [lead, enemy] = await Promise.all([
      buildFighter(leadId, monLevel(leadId), 'player'),
      buildEnemy(def, 0)
    ]);
    if (endurance && gymRun.hp[leadId] != null) lead.hp = Math.min(lead.maxHp, gymRun.hp[leadId]);
    battleState.loaded[leadId] = lead;
    battleState.wild = enemy;
    show('loading-modal', false);
    startBattleUI();
    logMsg(`${def.name}: "${def.taunt}"`);
  } catch (e) {
    show('loading-modal', false);
    dialog({ icon: '📡', title: 'NETWORK HICCUP', text: 'The battle could not load. Try again!' });
    exitBattleMode();
  }
}

async function buildEnemy(def, num) {
  const spec = def.team[num];
  const enemy = await buildFighter(spec.id, spec.level, 'wild');
  enemy.trainerOwned = true;
  return enemy;
}

// ---- battle FX ----
const HABITAT_TYPES = ['grass', 'water', 'fire', 'electric', 'rock', 'ghost', 'psychic', 'ice'];
const HABITAT_ALIAS = { bug: 'grass', poison: 'grass', flying: 'grass', ground: 'rock', fighting: 'rock', steel: 'rock', dark: 'ghost', dragon: 'water', fairy: 'psychic', normal: 'grass' };

function setBattleBackdrop() {
  const overlay = document.querySelector('.battle-bg-overlay');
  if (!overlay) return;
  overlay.className = 'battle-bg-overlay';
  const t = battleState.wild.types?.[0]?.type?.name || 'grass';
  overlay.classList.add(`bg-${HABITAT_TYPES.includes(t) ? t : (HABITAT_ALIAS[t] || 'grass')}`);
}

// A super-effective hit should FEEL different from an ordinary one, not just
// read differently. 'hard' is the super-effective / crit shake.
function screenShake(strength = 'normal') {
  const view = document.querySelector('.battle-view');
  if (!view) return;
  const cls = strength === 'hard' ? 'shake-hard' : 'shake';
  view.classList.remove('shake', 'shake-hard');
  void view.offsetWidth;
  view.classList.add(cls);
  setTimeout(() => view.classList.remove(cls), 450);
}

function spawnDamagePop(defenderRole, dmg, typeMult, crit) {
  const host = document.getElementById(`${defenderRole}-sprite`)?.parentElement;
  if (!host) return;
  const pop = document.createElement('span');
  pop.className = 'dmg-pop' + (crit || typeMult > 1 ? ' super' : typeMult < 1 ? ' weak' : '');
  pop.innerText = `-${Math.max(1, Math.floor(dmg))}`;
  pop.style.left = `${15 + Math.random() * 50}%`;
  pop.style.top = `${Math.random() * 20}%`;
  host.appendChild(pop);
  setTimeout(() => pop.remove(), 950);
}

function spawnParticles(defenderRole, color) {
  const host = document.getElementById(`${defenderRole}-sprite`)?.parentElement;
  if (!host) return;
  for (let i = 0; i < 8; i++) {
    const p = document.createElement('span');
    p.className = 'fx-particle';
    p.style.background = color;
    p.style.left = '50%';
    p.style.top = '40%';
    const ang = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 40 + Math.random() * 40;
    p.style.setProperty('--fx-x', `${Math.cos(ang) * dist}px`);
    p.style.setProperty('--fx-y', `${Math.sin(ang) * dist}px`);
    host.appendChild(p);
    setTimeout(() => p.remove(), 650);
  }
}

// ---- UI ----
function renderActive() {
  const f = active();
  unfaintSprites();
  document.getElementById('player-name').innerHTML = `${nickOf(f.id) || f.name} <span class="lvl">Lv${f.level}</span>`;
  document.getElementById('player-sprite').src = f.spriteBack;
  xpBarMark = null;   // a fresh send-out PAINTS the bar, it never tweens it
  updateHP('player');
  // Move tiles lead with the TYPE, not the name. A pre-reader picks a move by
  // recognising fire vs water vs lightning; the name is a caption for GABE.
  // This is the difference between ART choosing and ART mashing.
  document.getElementById('battle-moves').innerHTML =
    f.moves.map((m, i) => {
      const bg = typeColors[m.type] || '#777';
      return `<button class="move-btn type-tile" data-move="${i}" data-type="${m.type}"
        style="background:${bg}; color:${inkFor(bg)}">
        <span class="move-emoji">${typeEmoji[m.type] || '⭐'}</span>
        <span class="move-name">${m.name}</span>
      </button>`;
    }).join('') +
    (battleState.canCatch !== false ? `<button class="move-btn aux-btn ball-btn" id="ball-btn">🔴 BALL</button>` : '') +
    `<button class="move-btn aux-btn" id="switch-btn">🔄 SWITCH</button>
     <button class="move-btn aux-btn run-wide" id="run-btn">🏃 RUN</button>`;
  document.querySelectorAll('.move-btn[data-move]').forEach(btn =>
    btn.addEventListener('click', () => executeTurn(parseInt(btn.dataset.move))));
  document.getElementById('switch-btn').addEventListener('click', () => openSwitchModal(false));
  document.getElementById('ball-btn')?.addEventListener('click', openBallPick);
  document.getElementById('run-btn').addEventListener('click', exitBattleMode);
}

function startBattleUI() {
  document.getElementById('battle-container').classList.add('active');
  battleState.isBattling = true;
  battleState.busy = false;
  setBattleBackdrop();
  document.dispatchEvent(new CustomEvent('battle-started', { detail: { origin: battleState.origin } }));

  renderActive();
  renderEnemy();
  const t = battleState.trainer;
  document.getElementById('battle-title').innerText = t ? t.def.name : 'BATTLE ARENA';
  if (!t) logMsg(`WILD ${battleState.wild.name.toUpperCase()} APPEARED!`);
  enableMoves(true);
}

function renderEnemy() {
  document.getElementById('wild-sprite')?.classList.remove('fainted');
  const w = battleState.wild;
  const t = battleState.trainer;
  const label = t ? `${w.name} <span class="lvl">Lv${w.level} · ${t.enemyNum + 1}/${t.def.team.length}</span>`
                  : `${w.shiny ? '✨ SHINY ' : 'WILD '}${w.name} <span class="lvl">Lv${w.level}</span>`;
  document.getElementById('wild-name').innerHTML = label;
  document.getElementById('wild-sprite').src = w.spriteFront;
  updateHP('wild');
}

function updateHP(target) {
  const obj = target === 'wild' ? battleState.wild : active();
  if (!obj) return;
  const pct = Math.max(0, (obj.hp / obj.maxHp) * 100);
  const bar = document.getElementById(`${target}-hp-bar`);
  bar.style.width = `${pct}%`;
  // One HP green everywhere (--green). The low/mid colours become --red and
  // --gold in a later sprint; changing them now would change the picture.
  bar.style.background = pct < 20 ? '#f44336' : pct < 50 ? '#ffeb3b' : 'var(--green)';
  bar.classList.toggle('critical', pct > 0 && pct < 20);
  if (target === 'player') {
    document.getElementById('player-hp-text').innerText = `${Math.max(0, Math.floor(obj.hp))}/${obj.maxHp}`;
    updateXpBar();
  }
}

// The XP bar must never tween BACKWARDS. addXp() subtracts the threshold on a
// level-up, so mon.xp wraps from "nearly full" to a small remainder and the
// gold sliver slid from 95% down to 4% — which reads, at the single most
// rewarding moment in the game, as "you LOST your progress". A level-up now
// fills the bar to the end, snaps to empty with the transition switched off,
// then grows into the remainder. Forwards only, always.
let xpBarMark = null;   // { id, level } the bar was last painted for

function updateXpBar() {
  const bar = document.getElementById('player-xp-bar');
  if (!bar) return;
  const f = active();
  if (!f) return;
  const mon = player().mons[f.id] || { level: f.level, xp: 0 };
  const pct = Math.round(xpProgress(mon) * 100);
  const levelled = !!xpBarMark && xpBarMark.id === f.id && mon.level > xpBarMark.level;
  xpBarMark = { id: f.id, level: mon.level };
  if (!levelled) { bar.style.width = `${pct}%`; return; }

  const e0 = battleState.epoch;
  bar.style.width = '100%';
  setTimeout(() => {
    if (stale(e0)) return;         // a battle that already ended owns nothing
    bar.style.transition = 'none';
    bar.style.width = '0%';
    void bar.offsetWidth;          // commit the empty state before easing back
    bar.style.transition = '';
    bar.style.width = `${pct}%`;
  }, 460);   // just past the 0.45s .xp-fill width transition in gba.css
}

function enableMoves(enabled) {
  document.querySelectorAll('.move-btn').forEach(btn => (btn.disabled = !enabled));
  // ESCAPE follows the move buttons. Leaving it live mid-turn is how a tap
  // during an animation tore a battle down from underneath its own async work.
  const esc = document.getElementById('escape-btn');
  if (esc) { esc.disabled = !enabled; esc.style.opacity = enabled ? '' : '0.45'; }
}

// ---- switching ----
function openSwitchModal(forced) {
  const list = document.getElementById('switch-list');
  const options = battleState.teamIds
    .map((id, idx) => ({ id, idx }))
    .filter(o => o.idx !== battleState.activeIdx)
    .filter(o => !battleState.loaded[o.id] || battleState.loaded[o.id].hp > 0);

  if (options.length === 0) { if (!forced) logMsg('NO ONE ELSE CAN FIGHT!'); return; }

  list.innerHTML = options.map(o => {
    const f = battleState.loaded[o.id];
    const hpTxt = f ? `${Math.max(0, Math.floor(f.hp))}/${f.maxHp} HP` : 'READY';
    return `<div class="switch-item" data-idx="${o.idx}">
      <img src="${PIXEL_SPRITE(o.id)}">
      <div class="switch-meta"><span>#${o.id.toString().padStart(3, '0')} Lv${monLevel(o.id)}</span><small>${hpTxt}</small></div>
    </div>`;
  }).join('');
  list.querySelectorAll('.switch-item').forEach(el =>
    el.addEventListener('click', () => doSwitch(parseInt(el.dataset.idx), forced)));
  document.getElementById('switch-cancel').style.display = forced ? 'none' : 'block';
  show('switch-modal');
}

async function doSwitch(newIdx, forced) {
  const e0 = battleState.epoch;
  show('switch-modal', false);
  enableMoves(false);
  const id = battleState.teamIds[newIdx];
  if (!battleState.loaded[id]) {
    show('loading-modal');
    try {
      const f = await buildFighter(id, monLevel(id), 'player');
      if (stale(e0)) return;   // battle ended while the sprite was loading
      if (battleState.origin === 'gym' && !player().settings.junior && gymRun.gymKey === battleState.trainer?.gymKey && gymRun.hp[id] != null) {
        f.hp = Math.min(f.maxHp, gymRun.hp[id]);
      }
      battleState.loaded[id] = f;
    } catch (e) {
      show('loading-modal', false);
      logMsg('COULD NOT SWITCH. TRY AGAIN!');
      enableMoves(true);
      return;
    }
    show('loading-modal', false);
  }
  const old = active();
  // Commit the opponent's punish move BEFORE the swap resolves. Picking it
  // afterwards means the AI already knows what you switched to, so every
  // switch is answered by a fully-informed super-effective hit — the opposite
  // of how the real games work, and it teaches GABE that switching is a trap.
  const punish = (!forced && battleState.wild.hp > 0) ? pickEnemyMove() : null;
  battleState.activeIdx = newIdx;
  if (!forced) { logMsg(`COME BACK, ${old.name.toUpperCase()}!`); await awaitOrTap(800); }
  if (stale(e0)) return;
  renderActive();
  logMsg(`GO, ${active().name.toUpperCase()}!`);
  await awaitOrTap(800);
  if (stale(e0)) return;

  if (punish) {
    // switching costs the turn — the opponent gets a free hit
    await performAttack('wild', 'player', punish);
    if (stale(e0)) return;
    await checkFaints();
    if (stale(e0)) return;
  } else {
    logMsg(`What will ${active().name.toUpperCase()} do?`);
  }
  enableMoves(true);
}

// ---- turns ----
function pickEnemyMove() {
  // Trainers think — but never against ART. Gated on MODE, not just on
  // `trainer`: the old check let the smart AI loose in junior gym battles.
  return enginePickMove(battleState.wild.moves, active(), {
    smart: !!battleState.trainer && !juniorActive()
  });
}

async function executeTurn(playerMoveIdx) {
  if (!battleState.isBattling || battleState.busy) return;
  const e = battleState.epoch;
  battleState.busy = true;
  enableMoves(false);
  try {
    const f = active();
    const playerMove = f.moves[playerMoveIdx];
    const wildMove = pickEnemyMove();
    const playerGoesFirst = f.speed >= battleState.wild.speed;

    if (playerGoesFirst) {
      await performAttack('player', 'wild', playerMove);
      if (stale(e)) return;
      if (battleState.wild.hp > 0) await performAttack('wild', 'player', wildMove);
    } else {
      await performAttack('wild', 'player', wildMove);
      if (stale(e)) return;
      if (active().hp > 0) await performAttack('player', 'wild', playerMove);
    }
    if (stale(e)) return;
    await checkFaints();
  } finally {
    // Always release the lock, even if a fetch threw mid-turn. Leaving busy
    // stuck true silently bricks every move button for the rest of the battle.
    if (!stale(e)) battleState.busy = false;
  }
}

async function performAttack(attackerRole, defenderRole, move) {
  const e = battleState.epoch;
  const attacker = attackerRole === 'wild' ? battleState.wild : active();
  const defender = defenderRole === 'wild' ? battleState.wild : active();
  if (!attacker || !defender) return;
  logMsg(`${attacker.name.toUpperCase()} used ${move.name.toUpperCase()}!`);
  await awaitOrTap(900);
  // Bail before touching HP if the battle ended during that pause.
  if (stale(e)) return;

  // One call, one formula, unit-tested in test/engine.test.mjs.
  const junior = juniorActive()
    ? (attackerRole === 'player' ? 'attacker' : defenderRole === 'player' ? 'defender' : null)
    : null;
  const { damage, typeMult, crit } = computeDamage(attacker, defender, move, {
    junior,
    sparkle: attackerRole === 'player' && battleState.isSparkle
  });

  // Junior mode: player Pokémon can never faint (not in VS — fair fight!)
  if (defenderRole === 'player' && juniorActive()) {
    defender.hp = Math.max(1, defender.hp - damage * 0.5);
  } else {
    defender.hp -= damage;
  }
  updateHP(defenderRole);
  triggerVibration([50]);
  impactFx(defenderRole, { damage, typeMult, crit, moveType: move.type });

  // The text line stays for GABE, but it is no longer the ONLY channel — the
  // chevron, the shake and the number above already said it.
  if (crit) { logMsg('A CRITICAL HIT!'); await awaitOrTap(750); }
  if (typeMult > 1) { logMsg("It's super effective!"); await awaitOrTap(750); }
  else if (typeMult < 1 && typeMult > 0) { logMsg("It's not very effective..."); await awaitOrTap(750); }
  else if (typeMult === 0) { logMsg('It had no effect!'); await awaitOrTap(750); }
  await sleep(350);
}

// ---- the visual grammar ----
// One place that decides what a hit LOOKS like. Before this, 100% of the
// battle narrative was text and half the audience is pre-literate: colour,
// motion and size are the channel a 4-year-old already reads fluently.
//   super-effective → red ⏫, hard shake, oversized number
//   not very        → grey ⏬, muted thud, small number
//   immune          → grey ✖, no particles, no number
//   crit            → white flash-frame + starburst
function impactFx(defenderRole, { damage, typeMult, crit, moveType }) {
  const sprite = document.getElementById(`${defenderRole}-sprite`);
  const arena = document.querySelector('.battle-arena');

  if (typeMult === 0) {
    // Immune must look like NOTHING happened. The old code popped a "-1" with
    // full particles while the log said "no effect", which taught the exact
    // opposite of the lesson type advantage is supposed to teach.
    spawnMark(defenderRole, '✖', 'fx-immune');
    sfx.hit();
    return;
  }

  if (sprite) {
    sprite.classList.remove('hit-anim');
    void sprite.offsetWidth;
    sprite.classList.add('hit-anim');
    setTimeout(() => sprite.classList.remove('hit-anim'), 320);
  }

  const kind = typeMult > 1 ? 'super' : typeMult < 1 ? 'weak' : 'normal';
  spawnDamagePop(defenderRole, damage, typeMult, crit);
  spawnParticles(defenderRole, typeColors[moveType] || '#ffffff');

  if (kind === 'super') {
    spawnMark(defenderRole, '⏫', 'fx-super');
    screenShake('hard');
    sfx.superHit();
  } else if (kind === 'weak') {
    spawnMark(defenderRole, '⏬', 'fx-weak');
    sfx.hit();
  } else {
    sfx.hit();
  }

  if (crit) {
    if (arena) {
      arena.classList.remove('crit-flash');
      void arena.offsetWidth;
      arena.classList.add('crit-flash');
      setTimeout(() => arena.classList.remove('crit-flash'), 260);
    }
    spawnMark(defenderRole, '✳', 'fx-crit');
    screenShake('hard');
    sfx.superHit();
  }
}

// Fainting is shown before it is said: grey out and tip over.
function faintSprite(role) {
  document.getElementById(`${role}-sprite`)?.classList.add('fainted');
}
function unfaintSprites() {
  ['player', 'wild'].forEach(r =>
    document.getElementById(`${r}-sprite`)?.classList.remove('fainted'));
}

// A single glyph that floats over the defender — the wordless half of the
// effectiveness message.
function spawnMark(defenderRole, glyph, cls) {
  const host = document.querySelector(defenderRole === 'wild' ? '.opponent-side' : '.player-side')
            || document.querySelector('.battle-arena');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `impact-mark ${cls}`;
  el.textContent = glyph;
  host.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

async function checkFaints() {
  if (!battleState.wild || !active()) return;
  if (battleState.wild.hp <= 0) {
    if (battleState.trainer) { await handleEnemyDown(); } else { await handleVictory(); }
    return;
  }
  if (active().hp <= 0) {
    faintSprite('player');
    logMsg(`${active().name.toUpperCase()} FAINTED!`);
    triggerVibration([500]);
    await awaitOrTap(1200);
    const anyAlive = battleState.teamIds.some((id, idx) =>
      idx !== battleState.activeIdx && (!battleState.loaded[id] || battleState.loaded[id].hp > 0));
    if (anyAlive) {
      openSwitchModal(true);
    } else {
      battleState.isBattling = false;
      player().stats.battlesLost++; persist();
      if (battleState.trainer) {
        logMsg(`${battleState.trainer.def.name} WINS THIS TIME...`);
        clearGymRun(); // free Poké Center visit after a loss
        await awaitOrTap(1600);
        document.getElementById('victory-lines').innerHTML =
          `<p>💫 DEFEAT...</p><p>${battleState.trainer.def.name} was too strong this time.</p><p>Your team was rushed to the Poké Center and fully healed. Train up and try again!</p>`;
        show('victory-modal');
        battleState.pendingEvolution = null;
      } else {
        logMsg('YOUR TEAM IS OUT OF FIGHTERS...');
        await awaitOrTap(1600);
        await dialog({ icon: '💨', title: 'IT GOT AWAY!', text: 'Your team is healed and ready to go again.' });
        exitBattleMode();
      }
    }
    return;
  }
  logMsg(`What will ${active().name.toUpperCase()} do?`);
  enableMoves(true);
}

// ---- gym: one enemy down; next up, or the whole trainer folds ----
async function handleEnemyDown() {
  const e0 = battleState.epoch;
  const t = battleState.trainer;
  const w = battleState.wild;
  const f = active();
  if (!t || !w || !f) return;
  faintSprite('wild');
  logMsg(`${w.name.toUpperCase()} FAINTED!`);
  triggerVibration([100, 100, 100]);

  // XP per KO (rematches pay half)
  const gained = t.rematch ? Math.max(1, Math.floor(xpForKO(w) / 2)) : xpForKO(w);
  const before = monLevel(f.id);
  const levelLines = awardPartyXp(f.id, gained);
  const ups = monLevel(f.id) - before;
  levelLines.forEach(l => t.xpLines.push(l));
  t.lastXpMon = { id: f.id, name: f.name, level: monLevel(f.id), ups };
  // Queue the evolution. Gym wins are the game's biggest XP source, and until
  // now they could never trigger an evolution at all — nothing set this, and
  // the victory modal explicitly nulled it out. Keep the LAST mon that gained
  // a level across the whole trainer fight.
  if (ups > 0) battleState.pendingEvolution = { id: f.id, name: f.name, level: monLevel(f.id) };
  updateXpBar();   // run the level-up fill NOW, while the KO is still on screen
  t.kos.push(w.id);
  await awaitOrTap(1300);
  if (stale(e0)) return;

  if (t.enemyNum + 1 < t.def.team.length) {
    t.enemyNum++;
    show('loading-modal');
    try {
      const next = await buildEnemy(t.def, t.enemyNum);
      if (stale(e0)) return;   // don't send out a Pokémon into a dead battle
      battleState.wild = next;
    } catch (e) {
      show('loading-modal', false);
      dialog({ icon: '📡', title: 'NETWORK HICCUP', text: 'The gym battle ended safely.' });
      exitBattleMode();
      return;
    }
    show('loading-modal', false);
    renderEnemy();
    logMsg(`${t.def.name} SENT OUT ${battleState.wild.name.toUpperCase()}!`);
    await awaitOrTap(1100);
    if (stale(e0)) return;
    logMsg(`What will ${active().name.toUpperCase()} do?`);
    enableMoves(true);
    battleState.busy = false;
    return;
  }

  // trainer defeated!
  battleState.isBattling = false;
  player().stats.battlesWon++; persist();
  document.dispatchEvent(new CustomEvent('game-progress', { detail: { kind: 'win' } }));
  document.dispatchEvent(new CustomEvent('battle-victory'));
  logMsg(`YOU DEFEATED ${t.def.name}!`);

  // save endurance HP for the rest of this gym run
  if (!player().settings.junior) {
    Object.values(battleState.loaded).forEach(pf => { gymRun.hp[pf.id] = Math.max(1, Math.floor(pf.hp)); });
  }

  // the spoils: their WHOLE team joins your box, at the trainer's level
  t.def.team.forEach(m => {
    recordCatch(m.id);
    ensureMonAtLeast(m.id, m.level);
    // 'gymCatch', not 'catch': a trainer win must never auto-complete a
    // "Catch N Pokémon" quest with no ball thrown.
    document.dispatchEvent(new CustomEvent('game-progress', { detail: { kind: 'gymCatch', types: [] } }));
  });

  const circuitDone = recordGymWin(t.gymKey, t.idx);
  // Fire AFTER recordGymWin: circuit badges read gyms.beaten, and the earlier
  // 'win'/'gymCatch' dispatches run while it is still stale — without this the
  // leader badge and its Master Ball only arrived on the NEXT unrelated event.
  document.dispatchEvent(new CustomEvent('game-progress', { detail: { kind: 'gymwin' } }));
  await awaitOrTap(1500);
  if (stale(e0)) return;   // spoils are already banked; just don't paint a dead screen

  // The spoils CEREMONY: the beaten roster as tappable sprites. Picking a
  // favorite plays the full capture animation and takes a team slot — but
  // the whole team is awarded either way, and CONTINUE never requires a pick.
  const grid = t.def.team.map(m =>
    `<button class="spoils-pick" data-id="${m.id}" data-level="${m.level}" title="${nameOf(m.id) || ''}">
       <img src="${PIXEL_SPRITE(m.id)}" alt="${nameOf(m.id) || ''}"><small>Lv${m.level}</small>
     </button>`).join('');
  document.getElementById('victory-lines').innerHTML =
    `<p>🏆 ${t.def.name} DEFEATED!</p>` +
    `<p>You caught their whole team:</p>` +
    `<div id="spoils-grid">${grid}</div>` +
    `<p id="spoils-hint">⭐ PICK YOUR FAVORITE!</p>` +
    t.xpLines.map(l => `<p>${l}</p>`).join('');
  document.getElementById('spoils-grid').addEventListener('click', ev => {
    const btn = ev.target.closest('.spoils-pick');
    if (!btn || stale(e0)) return;
    pickSpoilsFavorite(parseInt(btn.dataset.id), btn, e0);
  });
  show('victory-modal');

  // Becoming Champion is the biggest thing that happens in this game. It used
  // to be one <p> appended to the list above, sitting beside "#006 Lv53".
  // With rematches unlocked, circuitDone is true on EVERY win once all 58 are
  // beaten — so the Hall of Fame replays only for the first-ever completion,
  // or when Champion Rex himself is beaten again.
  if (circuitDone) {
    const firstTime = !championRecord();
    recordChampion(battleState.teamIds.filter(Boolean));
    const beatRexAgain = t.gymKey === 'elite' && t.idx === GYMS[GYMS.length - 1].trainers.length - 1;
    if (firstTime || beatRexAgain) {
      await playHallOfFame();
      if (stale(e0)) return;
    }
    // The CHAMPION badge reads p.champion, so its event fires here — after
    // recordChampion, and after the ceremony rather than on top of it.
    document.dispatchEvent(new CustomEvent('game-progress', { detail: { kind: 'gymwin' } }));
  }
  // NOTE: pendingEvolution is deliberately NOT cleared here — it is consumed by
  // maybeEvolveThenExit() when the modal is dismissed. Clearing it at this point
  // is exactly what made evolution impossible from a gym win, the game's single
  // biggest source of XP. (Defeat and VS paths below still clear it; correct.)
}

// ---- spoils ceremony: tap a beaten trainer's Pokémon to make it a favorite ----
// Plays the full capture animation on the battle stage and gives it a team
// slot. One pick per victory; the rest of the roster is already banked.
async function pickSpoilsFavorite(id, btn, e0) {
  const grid = document.getElementById('spoils-grid');
  if (!grid || grid.classList.contains('picked')) return;
  grid.classList.add('picked');
  btn.classList.add('chosen');

  // Bank the team slot at DECISION time, before the ~3s animation — the same
  // fence catches got in v18.4, so a teardown mid-animation can't eat a slot
  // the child watched being promised. And a FULL team is never touched: the
  // favorite is already banked in the box, and silently benching the 6th
  // member a boy arranged himself would be taking something away.
  const team = player().team;
  let slotLine;
  if (team.includes(id)) slotLine = '⭐ ON YOUR TEAM!';
  else if (team.length < 6) { team.push(id); persist(); slotLine = '⭐ IT JOINED YOUR TEAM!'; }
  else slotLine = '⭐ SAFE IN YOUR BOX!';

  const sprite = document.getElementById('wild-sprite');
  sprite.classList.remove('fainted');
  sprite.src = PIXEL_SPRITE(id);
  sprite.style.opacity = 1;
  show('victory-modal', false);
  await playCaptureAnimation('poke-ball');
  if (stale(e0)) return;
  sfx.catch();

  // Sprite-led confirmation — the words are for GABE, the picture is for ART.
  const hint = document.getElementById('spoils-hint');
  if (hint) hint.innerHTML = `<img class="spoils-hint-img" src="${PIXEL_SPRITE(id)}" alt=""> ${slotLine}`;
  show('victory-modal');
}

// ---- shared capture conclusion (KO'd or balled) ----
async function playCaptureAnimation(ballName = 'poke-ball') {
  const sprite = document.getElementById('wild-sprite');
  const ball = document.getElementById('battle-throw-ball');
  const msg = document.getElementById('battle-catch-msg');
  ball.src = ITEM_SPRITE(ballName);
  ball.style.opacity = 1;
  ball.style.transform = 'translateY(0px) scale(1)';
  await sleep(500);
  sprite.classList.add('sucked-in');
  playBeep(400, 'sine', 0.3);
  await sleep(500);
  sfx.catch();
  triggerVibration([100, 50, 100]);
  msg.style.opacity = 1;
  await awaitOrTap(1400);
  msg.style.opacity = 0;
  ball.style.opacity = 0;
  ball.style.transform = 'translateY(-150px) scale(2)';
  sprite.classList.remove('sucked-in');
}

// FENCE: bank a catch the moment it is DECIDED, not five seconds later when the
// animation finishes. A tablet that sleeps mid-throw used to lose the Pokémon
// entirely — the worst possible bug, because the child watched it succeed.
// Idempotent: whoever calls it first wins, later callers get the same answer.
function bankCatch(w) {
  if (!w) return { wasNew: false, newShiny: false };
  if (battleState.bankedCatch && battleState.bankedCatch.id === w.id) return battleState.bankedCatch;
  const wasNew = recordCatch(w.id);
  ensureMon(w.id, w.level);
  const newShiny = w.shiny ? recordShiny(w.id) : false;
  battleState.bankedCatch = { id: w.id, wasNew, newShiny };
  return battleState.bankedCatch;
}

function concludeCapture(headline) {
  const w = battleState.wild;
  const f = active();
  const { wasNew: newCatch, newShiny } = bankCatch(w);
  document.dispatchEvent(new CustomEvent('game-progress', { detail: { kind: 'catch', types: w.types || [] } }));

  // Nickname: in-world, non-blocking, and AFTER the celebration rather than
  // on top of it. Junior mode is never interrupted — ART cannot type.
  if (newCatch && !player().settings.junior) {
    askNickname(w.id, w.name).then(nick => { if (nick) setNick(w.id, nick); });
  }

  const gained = xpForKO(w);
  const before = monLevel(f.id);
  const levelLines = awardPartyXp(f.id, gained);
  const after = monLevel(f.id);
  const ups = after - before;

  const shownName = nickOf(w.id) || w.name.toUpperCase();
  const teamSize = battleState.teamIds.filter(Boolean).length;
  const lines = [
    headline,
    newShiny ? `✨ SHINY ${w.name.toUpperCase()} joins your Box — its sparkle power is yours forever!` :
      newCatch ? `${shownName} was added to your PC Box!` : `${w.name.toUpperCase()} was caught (already in your Box).`,
    teamSize > 1
      ? `${f.name.toUpperCase()} gained ${gained} XP — the rest of the team got ${Math.floor(gained * PARTY_XP_SHARE)} each!`
      : `${f.name.toUpperCase()} gained ${gained} XP!`
  ];
  levelLines.forEach(l => lines.push(l));
  document.getElementById('victory-lines').innerHTML = lines.map(l => `<p>${l}</p>`).join('');
  show('victory-modal');
  battleState.pendingEvolution = ups > 0 ? { id: f.id, level: after, name: f.name } : null;
}

// ---- ball throwing: weaken it, then catch it ----
function catchChance(ballMod, ballName) {
  const w = battleState.wild;
  return catchProbability({
    captureRate: w.captureRate ?? 45,
    ballMod, hp: w.hp, maxHp: w.maxHp,
    junior: player().settings.junior,
    master: ballName === 'master-ball'
  });
}

function openBallPick() {
  if (!battleState.isBattling || battleState.busy) return;
  const list = document.getElementById('ballpick-list');
  const mb = player().items.masterBalls;
  const junior = player().settings.junior;
  const BALLS = [
    { mod: 1, name: 'poke-ball', label: 'POKÉBALL' },
    { mod: 1.5, name: 'great-ball', label: 'GREAT BALL' },
    { mod: 2, name: 'ultra-ball', label: 'ULTRA BALL' },
    { mod: 99, name: 'master-ball', label: 'MASTER BALL' }
  ];
  list.innerHTML = BALLS.map(b => {
    const isMaster = b.name === 'master-ball';
    const disabled = isMaster && !junior && mb < 1;
    const count = isMaster && !junior ? ` x${mb}` : '';
    return `<div class="switch-item ballpick ${disabled ? 'disabled' : ''}" data-mod="${b.mod}" data-ball="${b.name}">
      <img src="${ITEM_SPRITE(b.name)}">
      <div class="switch-meta"><span>${b.label}${count}</span><small>${isMaster ? 'NEVER FAILS' : 'BETTER WHEN WEAKENED'}</small></div>
    </div>`;
  }).join('');
  list.querySelectorAll('.ballpick:not(.disabled)').forEach(el =>
    el.addEventListener('click', () => {
      show('ballpick-modal', false);
      executeBallThrow(parseFloat(el.dataset.mod), el.dataset.ball);
    }));
  show('ballpick-modal');
}

async function executeBallThrow(ballMod, ballName) {
  if (!battleState.isBattling || battleState.busy) return;
  const e0 = battleState.epoch;
  battleState.busy = true;
  enableMoves(false);
  const junior = player().settings.junior;

  if (ballName === 'master-ball' && !junior) {
    if (!spendMasterBall()) { logMsg('NO MASTER BALLS LEFT!'); battleState.busy = false; enableMoves(true); return; }
  }

  const w = battleState.wild;
  const success = Math.random() < catchChance(ballMod, ballName);
  // Banked here, at the decision, not after the ~5s of shake animation below.
  if (success) bankCatch(w);
  logMsg(`YOU THREW A ${ballName.replace('-', ' ').toUpperCase()}!`);

  const sprite = document.getElementById('wild-sprite');
  const ball = document.getElementById('battle-throw-ball');
  ball.src = ITEM_SPRITE(ballName);
  ball.style.opacity = 1;
  ball.style.transform = 'translateY(0px) scale(1)';
  await sleep(600);
  if (stale(e0)) return;
  sprite.classList.add('sucked-in');
  playBeep(400, 'sine', 0.3);
  await sleep(400);
  if (stale(e0)) return;

  const shakes = success ? 3 : 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < shakes; i++) {
    ball.classList.remove('ball-shake');
    void ball.offsetWidth;
    ball.classList.add('ball-shake');
    sfx.shake();
    triggerVibration([50]);
    await awaitOrTap(950);
    if (stale(e0)) return;
  }
  ball.classList.remove('ball-shake');

  if (success) {
    battleState.isBattling = false;
    sfx.catch();
    triggerVibration([100, 50, 100]);
    document.getElementById('battle-catch-msg').style.opacity = 1;
    document.dispatchEvent(new CustomEvent('battle-victory'));
    await awaitOrTap(1400);
    if (stale(e0)) return;
    document.getElementById('battle-catch-msg').style.opacity = 0;
    ball.style.opacity = 0;
    ball.style.transform = 'translateY(-150px) scale(2)';
    sprite.classList.remove('sucked-in');
    battleState.busy = false;
    concludeCapture('🔴 GOTCHA!');
    return;
  }

  // broke free — the wild gets a free swing
  sfx.break();
  triggerVibration([200]);
  ball.style.opacity = 0;
  ball.style.transform = 'translateY(-150px) scale(2)';
  sprite.classList.remove('sucked-in');
  logMsg('OH NO! IT BROKE FREE!');
  await awaitOrTap(1100);
  if (stale(e0)) return;
  if (battleState.wild.hp > 0 && active().hp > 0) {
    await performAttack('wild', 'player', pickEnemyMove());
    if (stale(e0)) return;
  }
  battleState.busy = false;
  await checkFaints();
}

// ---- victory: XP, level ups, evolution, auto-catch on faint ----
async function handleVictory() {
  const e0 = battleState.epoch;
  battleState.isBattling = false;
  const w = battleState.wild;
  if (!w) return;
  // Auto-catch-on-KO is already earned the instant it faints — bank it before
  // the capture animation, same reasoning as the ball throw.
  bankCatch(w);
  faintSprite('wild');
  logMsg(`${w.name.toUpperCase()} FAINTED!`);
  document.dispatchEvent(new CustomEvent('battle-victory'));
  triggerVibration([100, 100, 100]);
  await awaitOrTap(1400);
  if (stale(e0)) return;

  logMsg(`CATCHING ${w.name.toUpperCase()}...`);
  await playCaptureAnimation();
  if (stale(e0)) return;
  player().stats.battlesWon++; persist();
  document.dispatchEvent(new CustomEvent('game-progress', { detail: { kind: 'win' } }));
  concludeCapture('⭐ VICTORY! ⭐');
}

export async function maybeEvolveThenExit() {
  show('victory-modal', false);
  const pending = battleState.pendingEvolution;
  battleState.pendingEvolution = null;
  if (pending) {
    try {
      const data = await getPokemon(pending.id);
      const species = data.species_url ? await getSpecies(data.species_url) : null;
      if (species?.evolution_chain_url) {
        const { chain } = await getEvolution(species.evolution_chain_url);
        const i = chain.findIndex(c => c.id === pending.id);
        const next = i >= 0 ? chain[i + 1] : null;
        const threshold = next ? (next.min_level ?? 30) : null; // stone/trade evolutions simplified to Lv30
        if (next && next.id <= MAX_POKEMON && pending.level >= threshold) {
          await playEvolution(pending, next);
        }
      }
    } catch (e) { /* evolution is a bonus — never block exit on it */ }
  }
  exitBattleMode();
}

async function playEvolution(fromMon, toMon) {
  const img = document.getElementById('evo-sprite');
  const text = document.getElementById('evo-text');
  img.src = PIXEL_SPRITE(fromMon.id);
  img.className = '';
  text.innerText = `What? ${fromMon.name.toUpperCase()} is evolving!`;
  show('evo-modal');
  await awaitOrTap(1200);
  img.className = 'evolving';
  for (let i = 0; i < 6; i++) { playBeep(300 + i * 120, 'square', 0.12, 0.12); await sleep(320); }
  img.src = PIXEL_SPRITE(toMon.id);
  img.className = 'evolved';
  sfx.catch();
  triggerVibration([100, 60, 100, 60, 200]);
  evolveMon(fromMon.id, toMon.id);
  text.innerText = `${fromMon.name.toUpperCase()} evolved into ${toMon.name.toUpperCase()}!`;
  await awaitOrTap(2600);
  show('evo-modal', false);
}

// ============================================================
// VERSUS MODE — P1 vs P2, pass-and-play on one device
// Side 1 = bottom (back sprite), Side 2 = top (front sprite).
// No catching, no junior shield, no XP — pure bragging rights.
// ============================================================
const versus = { sides: null, order: [], qi: 0 };

const pLevel = (n, id) => state.save.players[n].mons[id]?.level ?? 5;
const sideActive = n => n === 1 ? active() : battleState.wild;

let passResolver = null;
export function onPassReady() {
  show('pass-modal', false);
  if (passResolver) { const r = passResolver; passResolver = null; r(); }
  // Same hazard as passResolver: the Hall of Fame blocks on a tap with no
  // timeout, so teardown has to release it or the ceremony deadlocks the
  // victory path behind a hidden modal.
  if (hofResolver) { const r = hofResolver; hofResolver = null; r(); }
}

function waitForPass(n) {
  document.getElementById('pass-name').innerText = `PASS TO ${playerName(n)}!`;
  show('pass-modal');
  return new Promise(res => { passResolver = res; });
}

export async function startVersusBattle() {
  const P = state.save.players;
  if (!P[1].caught.length || !P[2].caught.length) {
    dialog({ icon: '🎮', title: 'NEED TWO TEAMS!', text: 'Both players need a Pokémon first.' });
    return;
  }
  state.appMode = 'battle';
  document.getElementById('gym-container').classList.remove('active');
  show('loading-modal');

  battleState.isSparkle = false;
  battleState.wildShiny = false;
  battleState.canCatch = false;
  battleState.trainer = null;
  battleState.origin = 'gym';       // exits back to the gym screen
  battleState.versusActive = true;

  const ids1 = P[1].team.length ? [...P[1].team] : P[1].caught.slice(0, 6);
  const ids2 = P[2].team.length ? [...P[2].team] : P[2].caught.slice(0, 6);
  versus.sides = { 1: { ids: ids1, loaded: {}, activeIdx: 0 }, 2: { ids: ids2, loaded: {}, activeIdx: 0 } };

  try {
    const [f1, f2] = await Promise.all([
      buildFighter(ids1[0], pLevel(1, ids1[0]), 'player'),
      buildFighter(ids2[0], pLevel(2, ids2[0]), 'wild')
    ]);
    versus.sides[1].loaded[ids1[0]] = f1;
    versus.sides[2].loaded[ids2[0]] = f2;
    // map side 1 onto the engine's player slot, side 2 onto the wild slot
    battleState.teamIds = ids1;
    battleState.activeIdx = 0;
    battleState.loaded = versus.sides[1].loaded;
    battleState.wild = f2;

    show('loading-modal', false);
    document.getElementById('battle-container').classList.add('active');
    battleState.isBattling = true;
    battleState.busy = false;
    setBattleBackdrop();
    document.dispatchEvent(new CustomEvent('battle-started', { detail: { origin: 'gym' } }));
    document.getElementById('battle-title').innerText = `${playerName(1)} VS ${playerName(2)}`;
    renderVersusSide(1);
    renderVersusSide(2);
    logMsg(`${playerName(1)} VS ${playerName(2)} — LET'S GO!`);
    await awaitOrTap(1200);
    await versusRound();
  } catch (e) {
    show('loading-modal', false);
    dialog({ icon: '📡', title: 'NETWORK HICCUP', text: 'The battle could not load. Try again!' });
    battleState.versusActive = false;
    exitBattleMode();
  }
}

function renderVersusSide(n) {
  const f = sideActive(n);
  const owner = state.save.players[n];
  const nick = owner.nicks[f.id];
  if (n === 1) {
    document.getElementById('player-name').innerHTML = `${nick || f.name} <span class="lvl">Lv${f.level} · ${playerName(1)}</span>`;
    document.getElementById('player-sprite').src = f.spriteBack;
    updateHP('player');
  } else {
    document.getElementById('wild-name').innerHTML = `${nick || f.name} <span class="lvl">Lv${f.level} · ${playerName(2)}</span>`;
    document.getElementById('wild-sprite').src = f.spriteFront;
    updateHP('wild');
  }
}

function renderVersusMoves(n) {
  const f = sideActive(n);
  const grid = document.getElementById('battle-moves');
  grid.innerHTML = f.moves.map((m, i) =>
    `<button class="move-btn" data-vmove="${i}">${m.name}<span class="type-badge" style="background:${typeColors[m.type] || '#777'}">${m.type}</span></button>`
  ).join('') + `<button class="move-btn aux-btn run-wide" id="vs-quit-btn">🏳️ END MATCH</button>`;
  grid.querySelectorAll('[data-vmove]').forEach(btn =>
    btn.addEventListener('click', () => executeVersusMove(n, parseInt(btn.dataset.vmove)), { once: true }));
  document.getElementById('vs-quit-btn').addEventListener('click', () => {
    battleState.versusActive = false;
    exitBattleMode();
  });
}

async function versusRound() {
  if (!battleState.isBattling) return;
  const s1 = sideActive(1), s2 = sideActive(2);
  versus.order = s1.speed >= s2.speed ? [1, 2] : [2, 1];
  versus.qi = 0;
  await versusNextTurn();
}

async function versusNextTurn() {
  if (!battleState.isBattling) return;
  if (versus.qi >= versus.order.length) { await versusRound(); return; }
  const n = versus.order[versus.qi];
  await waitForPass(n);
  logMsg(`${playerName(n)} — PICK A MOVE!`);
  renderVersusMoves(n);
  enableMoves(true);
}

async function executeVersusMove(n, moveIdx) {
  if (!battleState.isBattling || battleState.busy) return;
  battleState.busy = true;
  enableMoves(false);
  const move = sideActive(n).moves[moveIdx];
  await performAttack(n === 1 ? 'player' : 'wild', n === 1 ? 'wild' : 'player', move);
  battleState.busy = false;

  const defSide = n === 1 ? 2 : 1;
  const def = sideActive(defSide);
  if (def.hp <= 0) {
    const owner = state.save.players[defSide];
    logMsg(`${owner.nicks[def.id] || def.name.toUpperCase()} FAINTED!`);
    triggerVibration([300]);
    await awaitOrTap(1300);
    const replaced = await versusNextMon(defSide);
    if (!replaced) { await versusMatchOver(n); return; }
    await versusRound(); // fresh round after a KO swap
    return;
  }
  versus.qi++;
  await versusNextTurn();
}

async function versusNextMon(n) {
  const side = versus.sides[n];
  for (let i = 0; i < side.ids.length; i++) {
    const id = side.ids[i];
    if (side.loaded[id] && side.loaded[id].hp <= 0) continue;
    if (i === side.activeIdx) continue;
    if (!side.loaded[id]) {
      show('loading-modal');
      try { side.loaded[id] = await buildFighter(id, pLevel(n, id), n === 1 ? 'player' : 'wild'); }
      catch (e) { show('loading-modal', false); continue; }
      show('loading-modal', false);
    }
    if (side.loaded[id].hp <= 0) continue;
    side.activeIdx = i;
    if (n === 1) { battleState.activeIdx = i; }
    else { battleState.wild = side.loaded[id]; }
    renderVersusSide(n);
    logMsg(`${playerName(n)} SENT OUT ${side.loaded[id].name.toUpperCase()}!`);
    await awaitOrTap(1100);
    return true;
  }
  return false;
}

async function versusMatchOver(winnerSide) {
  battleState.isBattling = false;
  battleState.versusActive = false;
  state.save.players[winnerSide].stats.versusWins = (state.save.players[winnerSide].stats.versusWins || 0) + 1;
  persist();
  document.dispatchEvent(new CustomEvent('battle-victory'));
  document.getElementById('victory-lines').innerHTML = [
    `🏆 ${playerName(winnerSide)} WINS THE BATTLE!`,
    `${playerName(winnerSide === 1 ? 2 : 1)} fought hard — rematch anytime!`,
    `(VS wins are tracked on the Trainer Card.)`
  ].map(l => `<p>${l}</p>`).join('');
  show('victory-modal');
  battleState.pendingEvolution = null;
}

// legacy export kept for the sparkle modal buttons
export function selectFighter() { /* replaced by team flow in v16.1 */ }

// ---- HALL OF FAME ----
// Six sprites march on one at a time, each with its own rising beep, then the
// date locks in. Resolves when the child taps CONTINUE — there is no timeout,
// because this is the one screen in the game nobody should be rushed off.
let hofResolver = null;
async function playHallOfFame() {
  const rec = championRecord();
  const modal = document.getElementById('hof-modal');
  const teamEl = document.getElementById('hof-team');
  const closeBtn = document.getElementById('hof-close');
  if (!rec || !modal || !teamEl) return;

  document.getElementById('hof-trainer').innerText = `${playerName()} — CHAMPION`;
  document.getElementById('hof-date').innerText = `ENTERED ${rec.date}`;
  closeBtn.style.display = 'none';

  // Build every slot up front but hold them invisible; the march is what
  // reveals them, one at a time.
  teamEl.innerHTML = rec.team.map(id => {
    const nick = nickOf(id) || `#${String(id).padStart(3, '0')}`;
    return `<div class="hof-slot" data-id="${id}">
      <img src="${PIXEL_SPRITE(id)}" alt="">
      <small>${String(nick).toUpperCase()}</small>
      <span class="hof-lv">Lv${rec.levels[id] ?? monLevel(id)}</span>
    </div>`;
  }).join('');

  show('hof-modal');
  sfx.catch();

  const slots = [...teamEl.querySelectorAll('.hof-slot')];
  for (let i = 0; i < slots.length; i++) {
    slots[i].classList.add('marched');
    // Rising scale — each team member is a step further up the fanfare.
    playBeep(392 + i * 76, 'square', 0.22, 0.28);
    triggerVibration([40]);
    await sleep(560);
  }

  spawnConfetti(document.getElementById('hof-inner'), 64);
  // Closing four-note flourish on top of the confetti.
  [523, 659, 784, 1047].forEach((f, i) =>
    setTimeout(() => playBeep(f, 'square', i === 3 ? 0.75 : 0.2, 0.3), i * 190));

  closeBtn.style.display = 'block';
  await new Promise(resolve => {
    hofResolver = resolve;
    const done = () => {
      closeBtn.removeEventListener('click', done);
      show('hof-modal', false);
      if (hofResolver) { hofResolver = null; resolve(); }
    };
    closeBtn.addEventListener('click', done);
  });
}
