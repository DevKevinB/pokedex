// ============================================================
// Pokédex OS — battle engine
// ============================================================

import { MAX_POKEMON, getTypeMultiplier, typeColors, sleep, ITEM_SPRITE } from './config.js';
import { getPokemon, getMove } from './api.js';
import { state, player, recordCatch } from './state.js';
import { sfx, triggerVibration, playBeep } from './audio.js';
import { loadPoke } from './dex.js';
import { openPC } from './pc.js';

export const battleState = {
  isSparkle: false,
  player: { id: null, name: '', hp: 100, maxHp: 100, speed: 50, atk: 50, def: 50, types: [], moves: [], sprite: '' },
  wild:   { id: null, name: '', hp: 100, maxHp: 100, speed: 50, atk: 50, def: 50, types: [], moves: [], sprite: '' },
  isBattling: false
};

function logMsg(msg) { document.getElementById('battle-log').innerText = msg; }

export function exitBattleMode() {
  state.appMode = 'dex';
  battleState.isBattling = false;
  document.getElementById('sparkle-modal').style.display = 'none';
  document.getElementById('battle-container').classList.remove('active');
  document.dispatchEvent(new CustomEvent('battle-exited'));
  if (state.curId) loadPoke(state.curId);
}

export function initBattleMode() {
  if (player().caught.length === 0) {
    alert('You need to CATCH a Pokémon before you can battle!');
    return;
  }
  state.appMode = 'battle';
  openPC('battle');
}

export function selectFighter(id) {
  battleState.player.id = id;
  document.getElementById('sparkle-modal').style.display = 'flex';
}

export async function finalizeBattleSetup(sparkle) {
  document.getElementById('sparkle-modal').style.display = 'none';
  document.getElementById('loading-modal').style.display = 'flex';
  battleState.isSparkle = sparkle;
  battleState.wild.id = Math.floor(Math.random() * MAX_POKEMON) + 1;

  try {
    await Promise.all([
      loadFighterData('player', battleState.player.id),
      loadFighterData('wild', battleState.wild.id)
    ]);
    document.getElementById('loading-modal').style.display = 'none';
    startBattleUI();
  } catch (e) {
    document.getElementById('loading-modal').style.display = 'none';
    alert('Error loading battle data. Network issue?');
    exitBattleMode();
  }
}

async function loadFighterData(target, id) {
  const data = await getPokemon(id);
  const obj = battleState[target];
  obj.name = data.name;
  obj.types = data.types;

  const stat = n => data.stats.find(s => s.stat.name === n)?.base_stat || 50;
  obj.maxHp = Math.floor((stat('hp') * 2 * 50) / 100 + 50 + 10);
  obj.hp = obj.maxHp;
  obj.speed = stat('speed');
  obj.atk = stat('attack');
  obj.def = stat('defense');

  const sp = data.sprites;
  if (target === 'player') {
    obj.sprite = battleState.isSparkle
      ? (sp.animated_back_shiny ?? sp.back_shiny ?? sp.back_default)
      : (sp.animated_back ?? sp.back_default ?? '');
  } else {
    obj.sprite = sp.animated ?? sp.front_default ?? '';
  }

  let validMoves = data.moves.filter(m => !['swords-dance', 'growl', 'tail-whip', 'splash'].includes(m.name));
  validMoves.sort(() => 0.5 - Math.random());
  validMoves = validMoves.slice(0, 4);

  const movePromises = validMoves.map(async m => {
    try {
      const mData = await getMove(m.url);
      return { name: mData.name.replace('-', ' '), power: mData.power || 40, type: mData.type };
    } catch (e) {
      return { name: 'Tackle', power: 40, type: 'normal' };
    }
  });

  obj.moves = await Promise.all(movePromises);
  if (obj.moves.length === 0) obj.moves.push({ name: 'Tackle', power: 40, type: 'normal' });
}

// ---- battle FX helpers ----
const HABITAT_TYPES = ['grass', 'water', 'fire', 'electric', 'rock', 'ghost', 'psychic', 'ice'];
const HABITAT_ALIAS = { bug: 'grass', poison: 'grass', flying: 'grass', ground: 'rock', fighting: 'rock', steel: 'rock', dark: 'ghost', dragon: 'water', fairy: 'psychic', normal: 'grass' };

function setBattleBackdrop() {
  const overlay = document.querySelector('.battle-bg-overlay');
  if (!overlay) return;
  overlay.className = 'battle-bg-overlay';
  const t = battleState.wild.types?.[0]?.type?.name || 'grass';
  const habitat = HABITAT_TYPES.includes(t) ? t : (HABITAT_ALIAS[t] || 'grass');
  overlay.classList.add(`bg-${habitat}`);
}

function screenShake() {
  const view = document.querySelector('.battle-view');
  if (!view) return;
  view.classList.remove('shake');
  void view.offsetWidth;
  view.classList.add('shake');
  setTimeout(() => view.classList.remove('shake'), 450);
}

function spawnDamagePop(defenderRole, dmg, typeMult) {
  const sprite = document.getElementById(`${defenderRole}-sprite`);
  const host = sprite?.parentElement;
  if (!host) return;
  const pop = document.createElement('span');
  pop.className = 'dmg-pop' + (typeMult > 1 ? ' super' : typeMult < 1 ? ' weak' : '');
  pop.innerText = `-${Math.max(1, Math.floor(dmg))}`;
  pop.style.left = `${20 + Math.random() * 40}%`;
  pop.style.top = '10%';
  host.appendChild(pop);
  setTimeout(() => pop.remove(), 950);
}

function spawnParticles(defenderRole, color) {
  const sprite = document.getElementById(`${defenderRole}-sprite`);
  const host = sprite?.parentElement;
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

function startBattleUI() {
  document.getElementById('battle-container').classList.add('active');
  battleState.isBattling = true;
  setBattleBackdrop();
  document.dispatchEvent(new CustomEvent('battle-started'));

  document.getElementById('player-name').innerHTML = `${battleState.player.name} <span class="lvl">Lv50</span>`;
  document.getElementById('player-sprite').src = battleState.player.sprite;
  updateHP('player');

  document.getElementById('wild-name').innerHTML = `WILD ${battleState.wild.name} <span class="lvl">Lv50</span>`;
  document.getElementById('wild-sprite').src = battleState.wild.sprite;
  updateHP('wild');

  const movesEl = document.getElementById('battle-moves');
  movesEl.innerHTML = battleState.player.moves.map((m, i) =>
    `<button class="move-btn" data-move="${i}">${m.name}<span class="type-badge" style="background:${typeColors[m.type] || '#777'}">${m.type}</span></button>`
  ).join('');
  movesEl.querySelectorAll('.move-btn').forEach(btn =>
    btn.addEventListener('click', () => executeTurn(parseInt(btn.dataset.move))));

  logMsg(`WILD ${battleState.wild.name.toUpperCase()} APPEARED!`);
  enableMoves(true);
}

function updateHP(target) {
  const obj = battleState[target];
  const pct = Math.max(0, (obj.hp / obj.maxHp) * 100);
  const bar = document.getElementById(`${target}-hp-bar`);
  bar.style.width = `${pct}%`;
  bar.style.background = pct < 20 ? '#f44336' : pct < 50 ? '#ffeb3b' : '#4caf50';
  if (target === 'player') document.getElementById('player-hp-text').innerText = `${Math.max(0, Math.floor(obj.hp))}/${obj.maxHp}`;
}

function enableMoves(enabled) {
  document.querySelectorAll('.move-btn').forEach(btn => (btn.disabled = !enabled));
}

async function executeTurn(playerMoveIdx) {
  if (!battleState.isBattling) return;
  enableMoves(false);
  const playerMove = battleState.player.moves[playerMoveIdx];
  const wildMove = battleState.wild.moves[Math.floor(Math.random() * battleState.wild.moves.length)];
  const playerGoesFirst = battleState.player.speed >= battleState.wild.speed;

  if (playerGoesFirst) {
    await performAttack('player', 'wild', playerMove);
    if (battleState.wild.hp > 0) await performAttack('wild', 'player', wildMove);
  } else {
    await performAttack('wild', 'player', wildMove);
    if (battleState.player.hp > 0) await performAttack('player', 'wild', playerMove);
  }
  checkWinCondition();
}

async function performAttack(attackerRole, defenderRole, move) {
  const attacker = battleState[attackerRole];
  const defender = battleState[defenderRole];
  logMsg(`${attacker.name.toUpperCase()} used ${move.name.toUpperCase()}!`);
  await sleep(1000);

  let damage = (((2 * 50 / 5 + 2) * move.power * (attacker.atk / defender.def)) / 50) + 2;
  const typeMult = getTypeMultiplier(move.type, defender.types);
  damage *= typeMult;
  if (attackerRole === 'player' && battleState.isSparkle) damage *= 2.0;

  defender.hp -= damage;
  updateHP(defenderRole);
  const defSprite = document.getElementById(`${defenderRole}-sprite`);
  defSprite.classList.add('hit-anim');
  setTimeout(() => defSprite.classList.remove('hit-anim'), 300);
  triggerVibration([50]);
  spawnDamagePop(defenderRole, damage, typeMult);
  spawnParticles(defenderRole, (typeColors[move.type] || '#ffffff'));
  if (typeMult > 1) screenShake();

  if (typeMult > 1) { sfx.superHit(); logMsg("It's super effective!"); await sleep(1000); }
  else if (typeMult < 1 && typeMult > 0) { sfx.hit(); logMsg("It's not very effective..."); await sleep(1000); }
  else if (typeMult === 0) { logMsg('It had no effect!'); await sleep(1000); }
  else { sfx.hit(); }
  await sleep(500);
}

async function checkWinCondition() {
  if (battleState.wild.hp <= 0) {
    battleState.isBattling = false;
    logMsg(`${battleState.wild.name.toUpperCase()} FAINTED!`);
    document.dispatchEvent(new CustomEvent('battle-victory'));
    triggerVibration([100, 100, 100]);

    await sleep(1500);
    logMsg(`AUTO-CATCHING ${battleState.wild.name.toUpperCase()}...`);

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

    recordCatch(battleState.wild.id);

    await sleep(2000);
    msg.style.opacity = 0;
    ball.style.opacity = 0;
    ball.style.transform = 'translateY(-150px) scale(2)';
    sprite.classList.remove('sucked-in');

    alert('VICTORY! Pokémon was added to your PC Box.');
    exitBattleMode();
  } else if (battleState.player.hp <= 0) {
    battleState.isBattling = false;
    logMsg('YOUR POKÉMON FAINTED...');
    triggerVibration([500]);
    await sleep(2000);
    alert('DEFEAT! The wild Pokémon got away...');
    exitBattleMode();
  } else {
    logMsg(`What will ${battleState.player.name.toUpperCase()} do?`);
    enableMoves(true);
  }
}
