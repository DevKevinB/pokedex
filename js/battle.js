// ============================================================
// Pokédex OS — battle engine v2
// Teams of 6, levels/XP, crits, STAB, switching, evolution,
// wild level scaling. Wild Pokémon are auto-caught on victory.
// ============================================================

import { MAX_POKEMON, getTypeMultiplier, typeColors, sleep, ITEM_SPRITE, PIXEL_SPRITE } from './config.js';
import { getPokemon, getMove, getSpecies, getEvolution } from './api.js';
import { state, player, recordCatch, ensureMon, monLevel, addXp, evolveMon, persist, spendMasterBall, recordShiny, hasShiny, setNick, nickOf, playerName } from './state.js';
import { sfx, triggerVibration, playBeep } from './audio.js';
import { loadPoke } from './dex.js';
import { openPC } from './pc.js';
import { GYMS } from './gymdata.js';
import { gymRun, clearGymRun, recordGymWin } from './gym.js';

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

const active = () => battleState.loaded[battleState.teamIds[battleState.activeIdx]];

// ---- Junior Mode combat floor ----
// ART has to be able to WIN a fight, not merely survive one. Without an
// outgoing floor a Lv8 starter needs ~84 turns to drop a Lv80 gym ace while
// sitting pinned at 1 HP — which reads to a 4-year-old as "the game is broken".
// The floor guarantees visible progress; the ceiling keeps his own HP bar
// draining gracefully instead of bottoming out on the first hit.
// None of this is ever shown or announced, and none of it applies in VS.
const JUNIOR_MIN_HIT = 0.15;   // outgoing: >= 15% of the target's max HP
const JUNIOR_MAX_TAKE = 0.40;  // incoming: <= 40% of his own max HP per hit
function juniorActive() {
  try { return !!player().settings.junior && !battleState.versusActive; }
  catch (e) { return false; }
}

function logMsg(msg) { document.getElementById('battle-log').innerText = msg; }
const show = (id, on = true) => { document.getElementById(id).style.display = on ? 'flex' : 'none'; };

// ---- stat math ----
function computeStats(data, level) {
  const base = n => data.stats.find(s => s.stat.name === n)?.base_stat || 50;
  return {
    maxHp: Math.floor((base('hp') * 2 * level) / 100 + level + 10),
    atk: Math.floor((base('attack') * 2 * level) / 100 + 5),
    def: Math.floor((base('defense') * 2 * level) / 100 + 5),
    speed: Math.floor((base('speed') * 2 * level) / 100 + 5)
  };
}

async function buildFighter(id, level, side) {
  const data = await getPokemon(id);
  const stats = computeStats(data, level);
  const sp = data.sprites;

  let captureRate = 45;
  if (side === 'wild') {
    try { captureRate = (await getSpecies(data.species_url))?.capture_rate ?? 45; }
    catch (e) { /* default stands */ }
  }

  let validMoves = data.moves.filter(m => !['swords-dance', 'growl', 'tail-whip', 'splash'].includes(m.name));
  validMoves.sort(() => 0.5 - Math.random());
  validMoves = validMoves.slice(0, 4);
  const moves = await Promise.all(validMoves.map(async m => {
    try {
      const mData = await getMove(m.url);
      return { name: mData.name.replace(/-/g, ' '), power: mData.power || 40, type: mData.type };
    } catch (e) { return { name: 'tackle', power: 40, type: 'normal' }; }
  }));
  if (moves.length === 0) moves.push({ name: 'tackle', power: 40, type: 'normal' });

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
  versus.sides = null; versus.order = []; versus.qi = 0;
  ['sparkle-modal', 'victory-modal', 'switch-modal', 'evo-modal', 'loading-modal',
   'pass-modal', 'ballpick-modal'].forEach(id => show(id, false));
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
    alert('You need to CATCH a Pokémon before you can battle!');
    return;
  }
  state.appMode = 'battle';
  openPC('team');
}

// team picked in PC → sparkle question (earned via shiny ownership)
export function onTeamConfirmed() {
  const leadId = player().team[0] || player().caught[0];
  const unlocked = hasShiny(leadId);
  const btn = document.getElementById('variant-sparkle');
  btn.disabled = !unlocked;
  btn.innerText = unlocked ? '✨ SPARKLE ✨' : '🔒 SPARKLE — CATCH A SHINY!';
  document.getElementById('sparkle-hint').innerText = unlocked
    ? 'Sparkle variants deal 200% damage in battle!'
    : `Catch your lead Pokémon's ✨SHINY✨ in the wild (1-in-50 encounters) to unlock Sparkle power!`;
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

  const leadLevel = monLevel(battleState.teamIds[0]);
  const wildLevel = Math.max(2, Math.min(100, Math.round(leadLevel * (0.8 + Math.random() * 0.4))));

  try {
    const leadId = battleState.teamIds[0];
    const [lead, wild] = await Promise.all([
      buildFighter(leadId, monLevel(leadId), 'player'),
      buildFighter(wildId, wildLevel, 'wild')
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
    alert('Error loading battle data. Network issue?');
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
  battleState.trainer = { gymKey, idx, def, enemyNum: 0, kos: [], xpLines: [] };
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
    alert('Error loading battle data. Network issue?');
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

function screenShake() {
  const view = document.querySelector('.battle-view');
  if (!view) return;
  view.classList.remove('shake');
  void view.offsetWidth;
  view.classList.add('shake');
  setTimeout(() => view.classList.remove('shake'), 450);
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
  document.getElementById('player-name').innerHTML = `${nickOf(f.id) || f.name} <span class="lvl">Lv${f.level}</span>`;
  document.getElementById('player-sprite').src = f.spriteBack;
  updateHP('player');
  document.getElementById('battle-moves').innerHTML =
    f.moves.map((m, i) =>
      `<button class="move-btn" data-move="${i}">${m.name}<span class="type-badge" style="background:${typeColors[m.type] || '#777'}">${m.type}</span></button>`
    ).join('') +
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
  const pct = Math.max(0, (obj.hp / obj.maxHp) * 100);
  const bar = document.getElementById(`${target}-hp-bar`);
  bar.style.width = `${pct}%`;
  bar.style.background = pct < 20 ? '#f44336' : pct < 50 ? '#ffeb3b' : '#38c060';
  if (target === 'player') document.getElementById('player-hp-text').innerText = `${Math.max(0, Math.floor(obj.hp))}/${obj.maxHp}`;
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
  if (!forced) { logMsg(`COME BACK, ${old.name.toUpperCase()}!`); await sleep(800); }
  if (stale(e0)) return;
  renderActive();
  logMsg(`GO, ${active().name.toUpperCase()}!`);
  await sleep(800);
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
  const w = battleState.wild;
  const target = active();
  // Trainers think — but never against ART. This is gated on MODE, not just on
  // `trainer`: the old check let the smart AI loose in junior gym battles, so a
  // gym ace could chain super-effective hits on a 4-year-old.
  if (battleState.trainer && !juniorActive() && Math.random() < 0.7) {
    // trainers think: pick the highest-multiplier (then highest-power) move
    return [...w.moves].sort((a, b) => {
      const ma = getTypeMultiplier(a.type, target.types), mb = getTypeMultiplier(b.type, target.types);
      return (mb - ma) || ((b.power || 0) - (a.power || 0));
    })[0];
  }
  return w.moves[Math.floor(Math.random() * w.moves.length)];
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
  await sleep(900);
  // Bail before touching HP if the battle ended during that pause.
  if (stale(e)) return;

  let damage = (((2 * attacker.level / 5 + 2) * move.power * (attacker.atk / defender.def)) / 50) + 2;
  const typeMult = getTypeMultiplier(move.type, defender.types);
  damage *= typeMult;
  // STAB
  if (attacker.types.some(t => t.type?.name === move.type)) damage *= 1.5;
  // Crit: 1 in 16
  const crit = Math.random() < 1 / 16 && typeMult > 0;
  if (crit) damage *= 1.5;
  if (attackerRole === 'player' && battleState.isSparkle) damage *= 2.0;

  // Junior Mode floor and ceiling. Immune hits stay immune — the floor must
  // never resurrect a 0x matchup, or type advantage stops meaning anything.
  if (juniorActive()) {
    if (attackerRole === 'player' && typeMult > 0) {
      damage = Math.max(damage, defender.maxHp * JUNIOR_MIN_HIT);
    }
    if (defenderRole === 'player') {
      damage = Math.min(damage, defender.maxHp * JUNIOR_MAX_TAKE);
    }
  }

  // Junior mode: player Pokémon can never faint (not in VS — fair fight!)
  if (defenderRole === 'player' && juniorActive()) {
    defender.hp = Math.max(1, defender.hp - damage * 0.5);
  } else {
    defender.hp -= damage;
  }
  updateHP(defenderRole);
  const defSprite = document.getElementById(`${defenderRole}-sprite`);
  defSprite.classList.add('hit-anim');
  setTimeout(() => defSprite.classList.remove('hit-anim'), 300);
  triggerVibration([50]);
  spawnDamagePop(defenderRole, damage, typeMult, crit);
  spawnParticles(defenderRole, (typeColors[move.type] || '#ffffff'));
  if (typeMult > 1 || crit) screenShake();

  if (crit) { sfx.superHit(); logMsg('A CRITICAL HIT!'); await sleep(900); }
  if (typeMult > 1) { sfx.superHit(); logMsg("It's super effective!"); await sleep(900); }
  else if (typeMult < 1 && typeMult > 0) { sfx.hit(); logMsg("It's not very effective..."); await sleep(900); }
  else if (typeMult === 0) { logMsg('It had no effect!'); await sleep(900); }
  else if (!crit) { sfx.hit(); }
  await sleep(400);
}

async function checkFaints() {
  if (!battleState.wild || !active()) return;
  if (battleState.wild.hp <= 0) {
    if (battleState.trainer) { await handleEnemyDown(); } else { await handleVictory(); }
    return;
  }
  if (active().hp <= 0) {
    logMsg(`${active().name.toUpperCase()} FAINTED!`);
    triggerVibration([500]);
    await sleep(1200);
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
        await sleep(1600);
        document.getElementById('victory-lines').innerHTML =
          `<p>💫 DEFEAT...</p><p>${battleState.trainer.def.name} was too strong this time.</p><p>Your team was rushed to the Poké Center and fully healed. Train up and try again!</p>`;
        show('victory-modal');
        battleState.pendingEvolution = null;
      } else {
        logMsg('YOUR TEAM IS OUT OF FIGHTERS...');
        await sleep(1600);
        alert('DEFEAT! The wild Pokémon got away. Your team is healed up for next time!');
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
  logMsg(`${w.name.toUpperCase()} FAINTED!`);
  triggerVibration([100, 100, 100]);

  // XP per KO
  const gained = Math.floor((w.base_experience || 60) / 2 + w.level * 3);
  const before = monLevel(f.id);
  const ups = addXp(f.id, gained);
  if (ups > 0) t.xpLines.push(`${f.name.toUpperCase()} grew to Lv${monLevel(f.id)}!`);
  t.lastXpMon = { id: f.id, name: f.name, level: monLevel(f.id), ups };
  // Queue the evolution. Gym wins are the game's biggest XP source, and until
  // now they could never trigger an evolution at all — nothing set this, and
  // the victory modal explicitly nulled it out. Keep the LAST mon that gained
  // a level across the whole trainer fight.
  if (ups > 0) battleState.pendingEvolution = { id: f.id, name: f.name, level: monLevel(f.id) };
  t.kos.push(w.id);
  await sleep(1300);
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
      alert('Network hiccup — the gym battle ended safely.');
      exitBattleMode();
      return;
    }
    show('loading-modal', false);
    renderEnemy();
    logMsg(`${t.def.name} SENT OUT ${battleState.wild.name.toUpperCase()}!`);
    await sleep(1100);
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

  // the spoils: their WHOLE team joins your box
  const caughtNames = [];
  t.def.team.forEach(m => {
    const isNew = recordCatch(m.id);
    ensureMon(m.id, m.level);
    document.dispatchEvent(new CustomEvent('game-progress', { detail: { kind: 'catch', types: [] } }));
    caughtNames.push(`${isNew ? '🆕 ' : ''}#${String(m.id).padStart(3, '0')} Lv${m.level}`);
  });

  const circuitDone = recordGymWin(t.gymKey, t.idx);
  await sleep(1500);
  if (stale(e0)) return;   // spoils are already banked; just don't paint a dead screen

  const lines = [
    `🏆 ${t.def.name} DEFEATED!`,
    `You caught their whole team:`,
    caughtNames.join(' · '),
    ...t.xpLines
  ];
  if (circuitDone) lines.push('👑 YOU BEAT THE ENTIRE GYM CIRCUIT! YOU ARE THE CHAMPION!');
  document.getElementById('victory-lines').innerHTML = lines.map(l => `<p>${l}</p>`).join('');
  show('victory-modal');
  // NOTE: pendingEvolution is deliberately NOT cleared here — it is consumed by
  // maybeEvolveThenExit() when the modal is dismissed. Clearing it at this point
  // is exactly what made evolution impossible from a gym win, the game's single
  // biggest source of XP. (Defeat and VS paths below still clear it; correct.)
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
  await sleep(1400);
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

  // nickname (skippable; junior mode never interrupts)
  if (newCatch && !player().settings.junior) {
    try {
      const nick = prompt(`Give ${w.name.toUpperCase()} a nickname? (leave blank to skip)`);
      if (nick) setNick(w.id, nick);
    } catch (e) { /* prompt unavailable — skip */ }
  }

  const gained = Math.floor((w.base_experience || 60) / 2 + w.level * 3);
  const before = monLevel(f.id);
  const ups = addXp(f.id, gained);
  const after = monLevel(f.id);

  const shownName = nickOf(w.id) || w.name.toUpperCase();
  const lines = [
    headline,
    newShiny ? `✨ SHINY ${w.name.toUpperCase()} joins your Box — its sparkle power is yours forever!` :
      newCatch ? `${shownName} was added to your PC Box!` : `${w.name.toUpperCase()} was caught (already in your Box).`,
    `${f.name.toUpperCase()} gained ${gained} XP!`
  ];
  if (ups > 0) lines.push(`${f.name.toUpperCase()} grew from Lv${before} to Lv${after}!`);
  document.getElementById('victory-lines').innerHTML = lines.map(l => `<p>${l}</p>`).join('');
  show('victory-modal');
  battleState.pendingEvolution = ups > 0 ? { id: f.id, level: after, name: f.name } : null;
}

// ---- ball throwing: weaken it, then catch it ----
function catchChance(ballMod, ballName) {
  if (player().settings.junior) return 1;
  if (ballName === 'master-ball') return 1;
  const w = battleState.wild;
  const hpFactor = (3 * w.maxHp - 2 * Math.max(0, w.hp)) / (3 * w.maxHp); // 1/3 at full HP → 1 near zero
  const p = hpFactor * ((w.captureRate ?? 45) / 255) * ballMod;
  return Math.max(0.03, Math.min(0.95, p));
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
    await sleep(950);
    if (stale(e0)) return;
  }
  ball.classList.remove('ball-shake');

  if (success) {
    battleState.isBattling = false;
    sfx.catch();
    triggerVibration([100, 50, 100]);
    document.getElementById('battle-catch-msg').style.opacity = 1;
    document.dispatchEvent(new CustomEvent('battle-victory'));
    await sleep(1400);
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
  await sleep(1100);
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
  logMsg(`${w.name.toUpperCase()} FAINTED!`);
  document.dispatchEvent(new CustomEvent('battle-victory'));
  triggerVibration([100, 100, 100]);
  await sleep(1400);
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
  await sleep(1200);
  img.className = 'evolving';
  for (let i = 0; i < 6; i++) { playBeep(300 + i * 120, 'square', 0.12, 0.12); await sleep(320); }
  img.src = PIXEL_SPRITE(toMon.id);
  img.className = 'evolved';
  sfx.catch();
  triggerVibration([100, 60, 100, 60, 200]);
  evolveMon(fromMon.id, toMon.id);
  text.innerText = `${fromMon.name.toUpperCase()} evolved into ${toMon.name.toUpperCase()}!`;
  await sleep(2600);
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
}

function waitForPass(n) {
  document.getElementById('pass-name').innerText = `PASS TO ${playerName(n)}!`;
  show('pass-modal');
  return new Promise(res => { passResolver = res; });
}

export async function startVersusBattle() {
  const P = state.save.players;
  if (!P[1].caught.length || !P[2].caught.length) {
    alert('Both players need at least 1 Pokémon before a VS battle!');
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
    await sleep(1200);
    await versusRound();
  } catch (e) {
    show('loading-modal', false);
    alert('Error loading battle data. Network issue?');
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
    await sleep(1300);
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
    await sleep(1100);
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
