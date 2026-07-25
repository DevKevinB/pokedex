// ============================================================
// Pokédex OS — battle engine v2
// Teams of 6, levels/XP, crits, STAB, switching, evolution,
// wild level scaling. Wild Pokémon are auto-caught on victory.
// ============================================================

import { MAX_POKEMON, getTypeMultiplier, typeColors, sleep, ITEM_SPRITE, PIXEL_SPRITE } from './config.js';
import { getPokemon, getMove, getSpecies, getEvolution } from './api.js';
import { state, player, recordCatch, ensureMon, monLevel, addXp, evolveMon, persist } from './state.js';
import { sfx, triggerVibration, playBeep } from './audio.js';
import { loadPoke } from './dex.js';
import { openPC } from './pc.js';

export const battleState = {
  isSparkle: false,
  teamIds: [],
  activeIdx: 0,
  loaded: {},        // id → fighter (player side)
  wild: null,
  isBattling: false,
  busy: false,
  origin: 'arena'    // 'arena' | 'explore'
};

const active = () => battleState.loaded[battleState.teamIds[battleState.activeIdx]];

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
    id, level, moves,
    name: data.name, types: data.types, base_experience: data.base_experience || 60,
    ...stats, hp: stats.maxHp,
    spriteBack: sparkle ? (sp.animated_back_shiny ?? sp.back_shiny ?? sp.back_default) : (sp.animated_back ?? sp.back_default ?? sp.front_default),
    spriteFront: sp.animated ?? sp.front_default ?? ''
  };
}

// ---- mode entry/exit ----
export function exitBattleMode() {
  state.appMode = 'dex';
  battleState.isBattling = false;
  battleState.loaded = {};
  ['sparkle-modal', 'victory-modal', 'switch-modal', 'evo-modal', 'loading-modal'].forEach(id => show(id, false));
  document.getElementById('battle-container').classList.remove('active');
  const cameFromExplore = battleState.origin === 'explore';
  battleState.origin = 'arena';
  document.dispatchEvent(new CustomEvent('battle-exited'));
  if (cameFromExplore) {
    document.dispatchEvent(new CustomEvent('return-to-explore'));
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

// team picked in PC → sparkle question
export function onTeamConfirmed() {
  show('sparkle-modal');
}

async function launchBattle(wildId, { sparkle = false, origin = 'arena' } = {}) {
  show('loading-modal');
  battleState.isSparkle = sparkle;
  battleState.origin = origin;
  battleState.teamIds = player().team.length ? [...player().team] : player().caught.slice(0, 6);
  battleState.activeIdx = 0;
  battleState.loaded = {};

  const avgLevel = Math.round(battleState.teamIds.reduce((a, id) => a + monLevel(id), 0) / battleState.teamIds.length);
  const wildLevel = Math.max(3, Math.min(60, avgLevel + (Math.floor(Math.random() * 5) - 2)));

  try {
    const leadId = battleState.teamIds[0];
    const [lead, wild] = await Promise.all([
      buildFighter(leadId, monLevel(leadId), 'player'),
      buildFighter(wildId, wildLevel, 'wild')
    ]);
    battleState.loaded[leadId] = lead;
    battleState.wild = wild;
    show('loading-modal', false);
    startBattleUI();
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
  await launchBattle(wildId, { sparkle: false, origin: 'explore' });
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
  document.getElementById('player-name').innerHTML = `${f.name} <span class="lvl">Lv${f.level}</span>`;
  document.getElementById('player-sprite').src = f.spriteBack;
  updateHP('player');
  document.getElementById('battle-moves').innerHTML =
    f.moves.map((m, i) =>
      `<button class="move-btn" data-move="${i}">${m.name}<span class="type-badge" style="background:${typeColors[m.type] || '#777'}">${m.type}</span></button>`
    ).join('') +
    `<button class="move-btn aux-btn" id="switch-btn">🔄 SWITCH</button>
     <button class="move-btn aux-btn" id="run-btn">🏃 RUN</button>`;
  document.querySelectorAll('.move-btn[data-move]').forEach(btn =>
    btn.addEventListener('click', () => executeTurn(parseInt(btn.dataset.move))));
  document.getElementById('switch-btn').addEventListener('click', () => openSwitchModal(false));
  document.getElementById('run-btn').addEventListener('click', exitBattleMode);
}

function startBattleUI() {
  document.getElementById('battle-container').classList.add('active');
  battleState.isBattling = true;
  battleState.busy = false;
  setBattleBackdrop();
  document.dispatchEvent(new CustomEvent('battle-started'));

  renderActive();
  const w = battleState.wild;
  document.getElementById('wild-name').innerHTML = `WILD ${w.name} <span class="lvl">Lv${w.level}</span>`;
  document.getElementById('wild-sprite').src = w.spriteFront;
  updateHP('wild');

  logMsg(`WILD ${w.name.toUpperCase()} APPEARED!`);
  enableMoves(true);
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
  show('switch-modal', false);
  enableMoves(false);
  const id = battleState.teamIds[newIdx];
  if (!battleState.loaded[id]) {
    show('loading-modal');
    try {
      battleState.loaded[id] = await buildFighter(id, monLevel(id), 'player');
    } catch (e) {
      show('loading-modal', false);
      logMsg('COULD NOT SWITCH. TRY AGAIN!');
      enableMoves(true);
      return;
    }
    show('loading-modal', false);
  }
  const old = active();
  battleState.activeIdx = newIdx;
  if (!forced) { logMsg(`COME BACK, ${old.name.toUpperCase()}!`); await sleep(800); }
  renderActive();
  logMsg(`GO, ${active().name.toUpperCase()}!`);
  await sleep(800);

  if (!forced && battleState.wild.hp > 0) {
    // switching costs the turn — wild gets a free hit
    const wildMove = battleState.wild.moves[Math.floor(Math.random() * battleState.wild.moves.length)];
    await performAttack('wild', 'player', wildMove);
    await checkFaints();
  } else {
    logMsg(`What will ${active().name.toUpperCase()} do?`);
  }
  enableMoves(true);
}

// ---- turns ----
async function executeTurn(playerMoveIdx) {
  if (!battleState.isBattling || battleState.busy) return;
  battleState.busy = true;
  enableMoves(false);
  const f = active();
  const playerMove = f.moves[playerMoveIdx];
  const wildMove = battleState.wild.moves[Math.floor(Math.random() * battleState.wild.moves.length)];
  const playerGoesFirst = f.speed >= battleState.wild.speed;

  if (playerGoesFirst) {
    await performAttack('player', 'wild', playerMove);
    if (battleState.wild.hp > 0) await performAttack('wild', 'player', wildMove);
  } else {
    await performAttack('wild', 'player', wildMove);
    if (active().hp > 0) await performAttack('player', 'wild', playerMove);
  }
  battleState.busy = false;
  await checkFaints();
}

async function performAttack(attackerRole, defenderRole, move) {
  const attacker = attackerRole === 'wild' ? battleState.wild : active();
  const defender = defenderRole === 'wild' ? battleState.wild : active();
  logMsg(`${attacker.name.toUpperCase()} used ${move.name.toUpperCase()}!`);
  await sleep(900);

  let damage = (((2 * attacker.level / 5 + 2) * move.power * (attacker.atk / defender.def)) / 50) + 2;
  const typeMult = getTypeMultiplier(move.type, defender.types);
  damage *= typeMult;
  // STAB
  if (attacker.types.some(t => t.type?.name === move.type)) damage *= 1.5;
  // Crit: 1 in 16
  const crit = Math.random() < 1 / 16 && typeMult > 0;
  if (crit) damage *= 1.5;
  if (attackerRole === 'player' && battleState.isSparkle) damage *= 2.0;

  defender.hp -= damage;
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
  if (battleState.wild.hp <= 0) { await handleVictory(); return; }
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
      logMsg('YOUR TEAM IS OUT OF FIGHTERS...');
      await sleep(1600);
      player().stats.battlesLost++; persist();
      alert('DEFEAT! The wild Pokémon got away. Your team is healed up for next time!');
      exitBattleMode();
    }
    return;
  }
  logMsg(`What will ${active().name.toUpperCase()} do?`);
  enableMoves(true);
}

// ---- victory: XP, level ups, evolution, auto-catch ----
async function handleVictory() {
  battleState.isBattling = false;
  const w = battleState.wild;
  const f = active();
  logMsg(`${w.name.toUpperCase()} FAINTED!`);
  document.dispatchEvent(new CustomEvent('battle-victory'));
  triggerVibration([100, 100, 100]);
  await sleep(1400);

  // auto-catch animation
  logMsg(`CATCHING ${w.name.toUpperCase()}...`);
  const sprite = document.getElementById('wild-sprite');
  const ball = document.getElementById('battle-throw-ball');
  const msg = document.getElementById('battle-catch-msg');
  ball.style.opacity = 1;
  ball.style.transform = 'translateY(0px) scale(1)';
  await sleep(500);
  sprite.classList.add('sucked-in');
  playBeep(400, 'sine', 0.3);
  await sleep(500);
  sfx.catch();
  triggerVibration([100, 50, 100]);
  msg.style.opacity = 1;
  const newCatch = recordCatch(w.id);
  ensureMon(w.id, w.level);
  player().stats.battlesWon++; persist();
  document.dispatchEvent(new CustomEvent('game-progress', { detail: { kind: 'win' } }));
  document.dispatchEvent(new CustomEvent('game-progress', { detail: { kind: 'catch', types: w.types || [] } }));
  await sleep(1400);
  msg.style.opacity = 0;
  ball.style.opacity = 0;
  ball.style.transform = 'translateY(-150px) scale(2)';
  sprite.classList.remove('sucked-in');

  // XP + level ups
  const gained = Math.floor((w.base_experience || 60) / 2 + w.level * 3);
  const before = monLevel(f.id);
  const ups = addXp(f.id, gained);
  const after = monLevel(f.id);

  const lines = [
    `⭐ VICTORY! ⭐`,
    newCatch ? `${w.name.toUpperCase()} was added to your PC Box!` : `${w.name.toUpperCase()} was caught (already in your Box).`,
    `${f.name.toUpperCase()} gained ${gained} XP!`
  ];
  if (ups > 0) lines.push(`${f.name.toUpperCase()} grew from Lv${before} to Lv${after}!`);

  document.getElementById('victory-lines').innerHTML = lines.map(l => `<p>${l}</p>`).join('');
  show('victory-modal');

  // evolution check happens when the player taps CONTINUE (wired in main.js → maybeEvolveThenExit)
  battleState.pendingEvolution = ups > 0 ? { id: f.id, level: after, name: f.name } : null;
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

// legacy export kept for the sparkle modal buttons
export function selectFighter() { /* replaced by team flow in v16.1 */ }
