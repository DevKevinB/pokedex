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
  pickMove as enginePickMove, seedMoveset, moveSeed, seededRng, shuffle, xpProgress,
  wildLevel as engineWildLevel
} from './engine.js';
import { getPokemon, getMove, getSpecies, getEvolution, evolutionOptions, nameOf, getNameIndex, movesReady, moveStats } from './api.js';
import { state, player, recordCatch, ensureMon, ensureMonAtLeast, monLevel, addXp, evolveMon, persist, spendMasterBall, recordShiny, hasShiny, setNick, nickOf, playerName, recordChampion, championRecord } from './state.js';
import { sfx, triggerVibration, playBeep, haptic, playCryFor, isMuted, audioUnlocked } from './audio.js';
import { spawnMark as fxMark } from './fx.js';
import { loadPoke } from './dex.js';
import { openPC } from './pc.js';
import { GYMS, trainerKey, roundTrainers } from './gymdata.js';
import { gymRun, clearGymRun, recordGymWin } from './gym.js';
import { activeHabitat, activeTier, habitatEncounterLevel, habitatBackdrop, sparkleSpot } from './explore.js';
import { askNickname, cancelNickname } from './nickname.js';
import { dialog } from './dialog.js';
import { spawnConfetti } from './catch.js';
// v19.4: sprite life lives in fx.js now. spawnDamagePop / spawnParticles /
// spawnMark moved there unchanged except for how they find their host — see
// the note on sideOf() in fx.js.
import {
  lunge, hitStop, recall, sendout, puffAway, clearSpriteFx,
  spawnDamagePop, spawnParticles, spawnMark
} from './fx.js';

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
  pendingNick: null,   // a first catch waiting to be named AFTER the win card
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

// v19.5: the species id of the Pokemon on the field, or null when the board is
// busy, empty or fainted. battle.js owns the question "is it safe to touch the
// sprite right now" — main.js only wires the tap.
export function petTargetId() {
  const f = active();
  if (!battleState.isBattling || battleState.busy || !f || f.hp <= 0) return null;
  return f.id;
}

// Is the current player ART, in a mode where his accommodations apply?
// The floor/ceiling values themselves live in engine.js.
function juniorActive() {
  try { return !!player().settings.junior && !battleState.versusActive; }
  catch (e) { return false; }
}

function logMsg(msg) { document.getElementById('battle-log').innerText = msg; }
const show = (id, on = true) => { document.getElementById(id).style.display = on ? 'flex' : 'none'; };

// computeStats now comes from engine.js (and includes spatk/spdef).

// Resolves when the bitmap is decoded and in cache — or after `ms`, whichever
// is first. Never rejects: a missing sprite is a cosmetic problem, a hung
// battle opener is not.
const spriteReady = (url, ms = 2500) => new Promise(res => {
  if (!url) { res(); return; }
  const im = new Image();
  im.onload = im.onerror = res;
  im.src = url;
  setTimeout(res, ms);
});

async function buildFighter(id, level, side, owner = null) {
  const data = await getPokemon(id);
  const stats = computeStats(data, level);
  const sp = data.sprites;

  let captureRate = 45;
  if (side === 'wild') {
    try { captureRate = (await getSpecies(data.species_url))?.capture_rate ?? 45; }
    catch (e) { /* default stands */ }
  }

  // Movesets are BAKED and SEEDED, not fetched and reshuffled.
  //
  // Before: ten /move/ requests per send-out (a cold Champion fight was ~66
  // requests across ten mid-battle stalls) and a fresh shuffle every time, so
  // "my CHARIZARD knows FLAMETHROWER" could never be true.
  // Now: data/moves.json answers every lookup synchronously, and the seed
  // fixes the set — a boy's Pokémon keeps its moves for a whole 10-level
  // band, and a gym trainer's ONIX is the same ONIX on every rematch.
  await movesReady();
  const ownerNum = owner ?? (side === 'player' ? state.currentPlayer : 0);
  const seed = ownerNum ? moveSeed(ownerNum, id) : moveSeed(0, id, level);
  let moves = seedMoveset((data.moves || []).map(m => m.name), { seed, level, lookup: moveStats, types: data.types });
  if (!moves.length) {
    // No baked table (a first run offline, or data/moves.json missing): the
    // old network path still works — seeded now, so it is at least repeatable.
    const candidates = shuffle(data.moves || [], seededRng(seed)).slice(0, 10);
    const fetched = await Promise.all(candidates.map(async m => {
      try {
        const d = await getMove(m.url, m.name);
        return { name: d.name, power: d.power, type: d.type, damage_class: d.damage_class };
      } catch (e) { return null; }
    }));
    moves = seedMoveset(fetched.filter(Boolean), { seed, level, types: data.types });
  }
  moves = moves.map(m => ({ ...m, name: m.name.replace(/-/g, ' ') }));
  if (moves.length === 0) moves.push({ name: 'tackle', power: 40, type: 'normal', damage_class: 'physical' });

  const sparkle = side === 'player' && battleState.isSparkle;
  const spriteBack = sparkle ? (sp.animated_back_shiny ?? sp.back_shiny ?? sp.back_default) : (sp.animated_back ?? sp.back_default ?? sp.front_default);
  const spriteFront = sp.animated ?? sp.front_default ?? '';
  const shinyFront = sp.animated_shiny ?? sp.front_shiny ?? null;
  // v19.5.4: warm THIS fighter's bitmap before handing it out. setFighterSprite
  // already hides a sprite until it decodes, which turned "the wrong Pokemon"
  // into "an empty platform" — but on a slow CDN that platform stayed empty for
  // two seconds with all four move tiles live, and ART, who plays entirely by
  // picture, will tap a move at a blank field. buildFighter is the single funnel
  // every opener, trainer send-out, switch-in and versus side already awaits,
  // and it runs while the loading screen is still up, so the wait is free.
  // Only the side that is actually painted is warmed — one image, no extra
  // requests — and the cap means a dead CDN costs 2.5s, never a stuck screen.
  await spriteReady(side === 'player'
    ? spriteBack
    : (battleState.wildShiny && shinyFront) ? shinyFront : spriteFront);
  return {
    id, level, moves, captureRate,
    name: data.name, types: data.types, base_experience: data.base_experience || 60,
    ...stats, hp: stats.maxHp,
    spriteBack, spriteFront, shinyFront
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
  battleState.pendingNick = null;
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
  versus.sides = null; versus.order = []; versus.qi = 0; versus.matchLevel = null;
  // Nothing parked. A .recall left on a sprite is an INVISIBLE Pokémon in the
  // next fight (the keyframes end at opacity 0), and a win card left in the DOM
  // is the last fight's trophy sitting on top of this fight's result.
  // ...and nothing grey. .fainted is NOT in clearSpriteFx's one-shot list, so
  // teardown used to leave the last fight's corpse styling on the sprite and
  // rely on each renderer to remember to clear it. unfaintSprites() drops
  // .fainted from both sprites AND calls clearSpriteFx(), so this loses nothing.
  unfaintSprites();
  ['victory-hero', 'victory-xp'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.innerHTML = ''; el.classList.remove('lvup'); }
  });
  // v19.8: WHO WILL IT BECOME? blocks on a tap with no timeout, the same hazard
  // as passResolver and hofResolver above. Settling it as NOT YET (never as a
  // choice the child did not make) also takes its listeners back off, so the
  // next picker cannot fire two of them.
  if (evoPickResolver) { const r = evoPickResolver; evoPickResolver = null; r(); }
  ['sparkle-modal', 'victory-modal', 'switch-modal', 'evo-modal', 'evo-pick-modal', 'loading-modal',
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
  // ART cannot read the team picker's instructions or the sparkle question,
  // and he already has a team — two walls of text between the swords and a
  // fight. He goes straight in, down the SAME path the picker's START BATTLE
  // takes (finalizeBattleSetup hides #sparkle-modal itself). No new battle
  // entry point, and GABE's flow is untouched.
  if (player().settings.junior && player().team.length > 0) {
    finalizeBattleSetup(false);
    return;
  }
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
  battleState.teamIds = player().team.length ? [...player().team] : player().caught.slice(0, 6);
  battleState.activeIdx = 0;
  battleState.loaded = {};

  // Explore encounters take the HABITAT's level band (leashed to the lead in
  // engine.wildLevel). The Battle Arena has no habitat, so it stays keyed to
  // the lead — that's the one place "scaled to you" is the right answer.
  const leadLv = monLevel(battleState.teamIds[0]);
  const habitat = origin === 'explore' ? activeHabitat() : null;
  // v19.7 THE SPARKLE SPOT: one habitat glitters each day and shinies are five
  // times likelier inside it — 1 in 10 instead of 1 in 50. It reads the habitat
  // THIS fight came from rather than the module's last-visited one, so an arena
  // fight taken straight after an explore never inherits the bonus. Junior gets
  // exactly the same odds: a bonus is not an accommodation, and there is nothing
  // here to advertise.
  const glitters = !!habitat && habitat.key === sparkleSpot();
  battleState.wildShiny = Math.random() < (glitters ? 1 / 10 : 1 / 50);
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
    await preloadSprites(wild.spriteFront, lead.spriteBack);
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
export async function startTrainerBattle(gymKey, idx, round = 1) {
  const gym = GYMS.find(g => g.key === gymKey);
  // v19.8: ROUND 2 is the same trainer, +15 levels. roundTrainers() hands back
  // copies for round 2 and the ORIGINAL array for round 1, so gymdata.js is
  // never mutated and round 1 is bit-for-bit the fight it has always been.
  const def = roundTrainers(gym, round)[idx];
  if (!def) return;
  state.appMode = 'battle';
  show('loading-modal');

  battleState.isSparkle = false;
  battleState.wildShiny = false;
  battleState.origin = 'gym';
  battleState.canCatch = false;
  // Rematches (unlocked in v18.9) pay half XP — the circuit stays a training
  // ground without out-earning new challenges. The flag reads the ROUND'S OWN
  // key, so the first win against a ROUND 2 trainer is a brand-new challenge
  // and pays FULL XP even though round 1 was beaten months ago.
  battleState.trainer = {
    gymKey, idx, round, def, enemyNum: 0, kos: [], xpLines: [],
    rematch: !!player().gyms.beaten[trainerKey(gymKey, idx, round)]
  };
  battleState.teamIds = player().team.length ? [...player().team] : player().caught.slice(0, 6);
  battleState.activeIdx = 0;
  battleState.loaded = {};

  // endurance: same-gym runs carry HP (junior always fresh)
  const endurance = !player().settings.junior && gymRun.gymKey === gymKey;
  if (!endurance) { gymRun.gymKey = gymKey; gymRun.hp = {}; gymRun.max = {}; }

  try {
    const leadId = battleState.teamIds[0];
    const [lead, enemy] = await Promise.all([
      buildFighter(leadId, monLevel(leadId), 'player'),
      buildEnemy(def, 0)
    ]);
    if (endurance && gymRun.hp[leadId] != null) lead.hp = Math.min(lead.maxHp, gymRun.hp[leadId]);
    battleState.loaded[leadId] = lead;
    battleState.wild = enemy;
    await preloadSprites(enemy.spriteFront, lead.spriteBack);
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
  // v19.2: the sky/ground gradient lives on the ARENA, not on a full-height
  // overlay that also sat behind the controls panel. Painted there, its 46%
  // horizon was measured against a box that INCLUDED the panel, so on a 667px
  // phone the ground band collapsed to ~19px and both fighters floated.
  // Classes come off one at a time rather than by resetting className, so a
  // transient .crit-flash mid-swap is never wiped from under its own timeout.
  const arena = document.querySelector('.battle-arena');
  if (!arena) return;
  HABITAT_TYPES.forEach(k => arena.classList.remove(`bg-${k}`));
  // THE PLACE decides how the place looks. This used to read the wild
  // Pokémon's type, so walking into DEEP FOREST and meeting a water-type
  // painted an ocean underneath a chip that still said DEEP FOREST. The
  // type is only the fallback, for fights that happen nowhere in particular
  // (the dex arena and versus).
  const fromPlace = habitatBackdrop();
  const t = battleState.wild.types?.[0]?.type?.name || 'grass';
  const byType = HABITAT_TYPES.includes(t) ? t : (HABITAT_ALIAS[t] || 'grass');
  arena.classList.add(`bg-${fromPlace || byType}`);
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

// spawnDamagePop / spawnParticles moved to js/fx.js in v19.4, together with
// spawnMark. They used sprite.parentElement, which the new .sprite-bob wrapper
// would have changed out from under them; fx.js names .opponent-side /
// .player-side directly instead, so they land on exactly the element they
// always did.

// ---- the win card, picture first (v19.4) ----
// ART cannot read "GOTCHA!". The victory modal now opens on a picture of what
// he just got, a mark that pops, and a fat gold XP bar — all three before the
// first word. Every path that shows #victory-modal paints both halves, so a
// card can never be left over from the fight before.
function heroHtml(sprites, mark) {
  const many = sprites.length > 1;
  return `<div class="vh-row${many ? ' multi' : ''}">` +
    sprites.map(s => `<img class="vh-sprite" src="${s}" alt="" draggable="false">`).join('') +
    `</div>` + (mark ? `<div class="vh-mark" aria-hidden="true">${mark}</div>` : '');
}

function setVictoryHero(html) {
  const hero = document.getElementById('victory-hero');
  if (hero) hero.innerHTML = html;
}

// xp = { pctBefore, pctAfter, from, to, ups } or null for the paths with no XP
// (defeat, versus). Same forwards-only rule as the in-battle bar: on a level-up
// it fills to the end, flashes, then snaps with the transition switched off —
// it must never be seen sliding BACKWARDS at the most rewarding moment in the
// game.
function setVictoryXp(xp) {
  const strip = document.getElementById('victory-xp');
  if (!strip) return;
  strip.classList.remove('lvup');
  if (!xp) { strip.innerHTML = ''; return; }
  strip.innerHTML =
    `<div class="vx-bar"><div class="vx-fill" id="victory-xp-fill"></div></div>` +
    (xp.ups > 0 ? `<span class="vx-lv">LV ${xp.from} ▶ ${xp.to}</span>` : '');
  const fill = document.getElementById('victory-xp-fill');
  if (!fill) return;
  const e0 = battleState.epoch;
  fill.style.transition = 'none';
  fill.style.width = `${xp.pctBefore}%`;
  void fill.offsetWidth;
  fill.style.transition = '';
  // REVIEW FIX: every caller runs this BEFORE show('victory-modal'), so the
  // strip still has display:none and no box — and a CSS transition cannot
  // start on an element that has no box. A single rAF still lands before the
  // modal's first paint, so the browser would only ever resolve one width and
  // the bar would jump. A double rAF puts the target width a frame AFTER the
  // modal is shown, which is what makes it actually animate.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (stale(e0)) return;
    fill.style.width = xp.ups > 0 ? '100%' : `${xp.pctAfter}%`;
  }));
  if (xp.ups > 0) {
    setTimeout(() => {
      if (stale(e0)) return;      // a battle that already ended owns nothing
      strip.classList.add('lvup');
      sfx.levelUp();
      setTimeout(() => strip.classList.remove('lvup'), 640);
      fill.style.transition = 'none';
      fill.style.width = '0%';
      void fill.offsetWidth;
      fill.style.transition = '';
      fill.style.width = `${xp.pctAfter}%`;
    }, 620);
  }
}

// The XP percentages either side of an award. Must be read BEFORE addXp runs —
// player().mons[id] is a live object and awardPartyXp mutates it in place.
function xpPct(id) {
  const m = player().mons[id];
  return m ? Math.round(xpProgress({ level: m.level, xp: m.xp }) * 100) : 0;
}

// ---- UI ----

// ---- effectiveness, as a picture on the button ----
// getTypeMultiplier has been imported into this file since v18 and never once
// called. The chart it holds is the only piece of strategy a four-year-old can
// actually play — "the gold one hurts more" — but only if it is on the tile
// BEFORE the tap, as a shape and a colour, instead of a sentence in the log
// afterwards that he cannot read.
//
// This stays ON in junior mode. It is a picture, not a word; it never disables
// a button, never says no, and never removes a choice — it only ever points at
// a better one. ART can still tap whatever he likes and it still works.
const EFF_GLYPH = { super: '⏫', weak: '⏬', immune: '✖', even: '' };

function effOf(moveType, defTypes) {
  // defTypes lets versus mode ask "what does this do to the OTHER side?".
  // Every existing caller passes nothing and still reads the wild slot.
  const types = defTypes || battleState.wild?.types;
  if (!Array.isArray(types) || !types.length) return 'even';
  const mult = getTypeMultiplier(moveType, types);
  return mult === 0 ? 'immune' : mult > 1 ? 'super' : mult < 1 ? 'weak' : 'even';
}

// ---- the move tile, v2 — ONE renderer, every battle mode ----
// This markup used to live inline inside renderActive(), so versus mode still
// emitted the pre-v2 text-only buttons and ART could not play his brother at
// all. Wild, gym and versus all come out of here now; there is no second copy.
// Three FIXED rows, in this order. v1 put a colour emoji and the move name in
// one flex line, so the emoji drew straight over the words and neither read;
// and two normal-type moves came out as two identical grey stars, which is a
// board a pre-reader cannot play at all.
//   1. picture — the type, in a box of its own so nothing can overdraw it
//   2. caption — 8px UPPERCASE for GABE, hidden for ART
//   3. dots    — how big the hit is: ceil(power / 40), out of three
// Plus a corner mark for what it will do to THIS enemy, and a stripe on the
// second tile of a repeated type so no two tiles are ever twins.
// `attr` is the data-* the click wiring looks for: 'move' or 'vmove'.
function moveTilesHtml(moves, attr, defTypes) {
  return moves.map((m, i) => {
    const bg = typeColors[m.type] || '#777';
    const dots = Math.max(1, Math.min(3, Math.ceil((m.power || 40) / 40)));
    const dup = moves.some((o, j) => j < i && o.type === m.type);
    const eff = effOf(m.type, defTypes);
    const caption = String(m.name || '').replace(/-/g, ' ').toUpperCase();
    const pips = [1, 2, 3].map(n => `<i${n > dots ? ' class="off"' : ''}></i>`).join('');
    // background-COLOR, not the background shorthand: the shorthand would
    // wipe the stripe that tells two same-type moves apart.
    return `<button class="move-btn type-tile" data-${attr}="${i}" data-type="${m.type}"
      data-eff="${eff}"${dup ? ' data-dup="1"' : ''}
      style="background-color:${bg}; color:${inkFor(bg)}">
      <span class="tile-ico" aria-hidden="true">${typeEmoji[m.type] || typeEmoji.normal}</span>
      <span class="tile-name">${caption}</span>
      <span class="tile-dots" aria-hidden="true">${pips}</span>
      <span class="tile-eff" aria-hidden="true">${EFF_GLYPH[eff]}</span>
    </button>`;
  }).join('');
}

// A trainer's NEXT Pokémon changes every answer on the board, and only
// renderEnemy() runs when one is sent out — so the tiles are re-marked there
// as well as when they are built. Versus mode uses data-vmove and is untouched.
function refreshMoveEff() {
  const f = active();
  if (!f) return;
  document.querySelectorAll('.move-btn[data-move]').forEach(btn => {
    const m = f.moves[parseInt(btn.dataset.move)];
    if (!m) return;
    const eff = effOf(m.type);
    btn.dataset.eff = eff;
    const mark = btn.querySelector('.tile-eff');
    if (mark) mark.textContent = EFF_GLYPH[eff];
  });
}

// An <img> keeps painting its LAST decoded frame until the replacement
// arrives, so a bare `src =` assignment left the previous fighter standing on
// the platform under the new one's name and HP bar. Worse, renderEnemy clears
// .fainted first, so the Pokémon that had just fainted stood back up, in full
// colour, and played the next one's send-out animation. Hiding the element
// while the new bitmap decodes turns "the wrong Pokémon" into "an empty
// platform for a moment", which is strictly better and self-corrects.
function setFighterSprite(el, url) {
  if (!el || !url || el.getAttribute('src') === url) return;
  el.style.visibility = 'hidden';
  el.src = url;
  const show = () => { el.style.visibility = ''; };
  Promise.resolve(el.decode ? el.decode() : null).then(show, show);
  // A dead CDN must never leave a child staring at an empty platform.
  setTimeout(show, 2500);
}

// Curtain up only once the actors are on stage. buildFighter awaits the JSON,
// but the sprite download does not start until renderActive/renderEnemy assign
// img.src — which happens AFTER the loading modal is gone and AFTER the move
// tiles go live. On a first sighting a whole turn could be played against an
// empty platform. Warm the two bitmaps first, capped so a dead CDN can never
// block a fight (a plain timer, not awaitOrTap: this is a network cap, not a
// beat the child is watching, and the loading modal is up in front of it).
function preloadSprites(...urls) {
  const list = urls.filter(Boolean);
  if (!list.length) return Promise.resolve();
  return Promise.race([
    Promise.all(list.map(src => new Promise(done => {
      const im = new Image();
      im.onload = im.onerror = done;
      im.src = src;
    }))),
    new Promise(done => setTimeout(done, 1500))
  ]);
}

function renderActive() {
  const f = active();
  unfaintSprites();
  document.getElementById('player-name').innerHTML = `${nickOf(f.id) || f.name} <span class="lvl">Lv${f.level}</span>`;
  setFighterSprite(document.getElementById('player-sprite'), f.spriteBack);
  xpBarMark = null;   // a fresh send-out PAINTS the bar, it never tweens it
  updateHP('player');
  // Move tiles lead with the TYPE, not the name. A pre-reader picks a move by
  // recognising fire vs water vs lightning; the name is a caption for GABE.
  // This is the difference between ART choosing and ART mashing.
  // The markup itself is moveTilesHtml(), shared with versus mode.
  document.getElementById('battle-moves').innerHTML =
    moveTilesHtml(f.moves, 'move') +
    // ONE hero row, no RUN. BALL is the biggest thing on the screen because
    // catching is ART's whole game; SWITCH is a chip wearing the next
    // teammate's face. RUN is gone: it duplicated the exit chip, it was the
    // widest control and the closest to the thumb, and one bump ended a fight
    // and threw away the wild Pokemon a child was chasing.
    `<div class="hero-row">` +
      (battleState.canCatch !== false
        ? `<button class="move-btn hero-btn" id="ball-btn" aria-label="THROW A BALL">` +
          `<img class="hero-ico" src="${ITEM_SPRITE('poke-ball')}" alt="" draggable="false"><span>BALL</span></button>`
        : '') +
      switchChipHtml() +
    `</div>`;
  document.querySelectorAll('.move-btn[data-move]').forEach(btn =>
    btn.addEventListener('click', () => executeTurn(parseInt(btn.dataset.move))));
  document.getElementById('switch-btn').addEventListener('click', () => openSwitchModal(false));
  document.getElementById('ball-btn')?.addEventListener('click', openBallPick);
}

function startBattleUI() {
  document.getElementById('battle-container').classList.add('active');
  battleState.isBattling = true;
  battleState.busy = false;
  setBattleBackdrop();
  // Warm the names so SWITCH can say SPARKY, not #025. The index is cold on a
  // straight boot -> EXPLORE -> battle path; gym.js already does exactly this.
  getNameIndex();
  document.dispatchEvent(new CustomEvent('battle-started', { detail: { origin: battleState.origin } }));

  renderActive();
  renderEnemy();
  const t = battleState.trainer;
  // Every habitat encounter used to be titled "BATTLE ARENA" — the one place
  // it never was. The chip names where you actually are, led by a glyph.
  const hab = battleState.origin === 'explore' ? activeHabitat() : null;
  document.getElementById('battle-title').innerText =
    t ? t.def.name : hab ? `${hab.emoji} ${hab.name}` : '⚔️ BATTLE ARENA';
  if (!t) logMsg(`WILD ${battleState.wild.name.toUpperCase()} APPEARED!`);
  // ART cannot read "WILD PIDGEY APPEARED!". The cry is the only channel that
  // tells him WHO turned up. Wild encounters only -- a gym trainer's line-up is
  // GABE's screen and six cries in a row would be noise, not information.
  if (!t) cryForWild();
  enableMoves(true);
}

// The three gates dex.js:49-52 uses for its auto-cry, in one place: sound on,
// and an AudioContext that a real tap has already unlocked. emitCry's own
// CRY_MIN_GAP_MS floor (audio.js:263) is what stops a fast catch stacking two.
// Deliberately does NOT touch setCry: pc.js hands that module global back after
// a sticker close-up (pc.js:449-454), and stealing it here would leave the home
// CRY button playing the wrong voice.
function cryForWild() {
  const w = battleState.wild;
  if (!w || isMuted() || !audioUnlocked()) return;
  playCryFor(w.id);
}

function renderEnemy() {
  // Fire-and-forget: renderEnemy is synchronous and every caller already waits
  // longer than the 300ms send-out, so this needs no await and no new async.
  clearSpriteFx('wild');
  document.getElementById('wild-sprite')?.classList.remove('fainted');
  const w = battleState.wild;
  const t = battleState.trainer;
  const label = t ? `${w.name} <span class="lvl">Lv${w.level} · ${t.enemyNum + 1}/${t.def.team.length}</span>`
                  : `${w.shiny ? '✨ SHINY ' : 'WILD '}${w.name} <span class="lvl">Lv${w.level}</span>`;
  document.getElementById('wild-name').innerHTML = label;
  setFighterSprite(document.getElementById('wild-sprite'), w.spriteFront);
  updateHP('wild');
  sendout('wild');
  // A new enemy is a new type chart. Re-mark the tiles here or the gold outline
  // keeps pointing at the Pokémon that already fainted.
  refreshMoveEff();
}

function updateHP(target) {
  const obj = target === 'wild' ? battleState.wild : active();
  if (!obj) return;
  const pct = Math.max(0, (obj.hp / obj.maxHp) * 100);
  const bar = document.getElementById(`${target}-hp-bar`);
  const ghost = document.getElementById(`${target}-hp-ghost`);
  // WHO is standing here has to be known BEFORE the fill is written. .hp-fill
  // carries `transition: width 0.5s steps(8, end)` unconditionally, so a fresh
  // send-out animated up from whatever the previous occupant of this slot left
  // behind — 0% after a faint. The ghost snapped to full instantly while the
  // green bar climbed 0 -> 100% in eight visible steps inside it: exactly the
  // game's HEALING vocabulary, played on a Pokemon that has taken no damage.
  // A new fighter is not a heal, so the fill SNAPS, just as the ghost does.
  const who = `${obj.name}|${obj.maxHp}`;
  const sameFighter = ghost ? ghost.dataset.mon === who : false;
  if (!sameFighter) bar.style.transition = 'none';
  bar.style.width = `${pct}%`;
  if (!sameFighter) { void bar.offsetWidth; bar.style.transition = ''; }
  // The colour SNAPS at the thresholds instead of fading through it, so "I am
  // in trouble" is one frame rather than half a second of muddy in-between.
  // The hexes are gone: green / gold / red are tokens now (ROADMAP §3.1), and
  // they live in gba.css against these three data-hp values.
  bar.dataset.hp = pct < 20 ? 'low' : pct < 50 ? 'mid' : 'ok';
  bar.classList.toggle('critical', pct > 0 && pct < 20);
  // The GHOST is the point of this sprint. It holds the OLD width for 300ms
  // and then slides down to meet the bar, so the size of the chunk a hit took
  // is a thing you SEE rather than a number you read. It only ever lags
  // DOWNWARD — a heal or a fresh send-out snaps it forward with no transition,
  // or being healed would look exactly like being hurt.
  // REVIEW FIX: updateHP is ALSO the paint path for a fresh send-out
  // (renderActive, renderVersusSide), not just for taking a hit. Switching a
  // damaged team-mate in used to paint the OUTGOING Pokémon's higher bar as
  // the ghost and drain it — a hit that never happened, which is the one
  // signal ART reads. So the bar identifies who it is showing and snaps
  // whenever that changes. Detected here rather than passed in by each caller,
  // because a call site that forgets the flag is exactly how this bug got in.
  // (who / sameFighter are computed above, with the fill write.)
  if (ghost) ghost.dataset.mon = who;
  if (ghost) {
    const was = parseFloat(ghost.style.width);
    const lag = sameFighter && Number.isFinite(was) && was > pct;
    if (!lag) ghost.style.transition = 'none';
    ghost.style.width = `${pct}%`;
    if (!lag) { void ghost.offsetWidth; ghost.style.transition = ''; }
  }
  if (target === 'player') {
    countHp(document.getElementById('player-hp-text'),
            Math.max(0, Math.floor(obj.hp)), obj.maxHp, !sameFighter);
    updateXpBar();
  }
}

// A number that jumps is a fact; a number that runs down is an event, and an
// event is something a four-year-old reads without reading. ~450ms on rAF.
// One token, so a second hit CANCELS the first count instead of two loops
// fighting over the same text node. Reduced Motion gets the answer straight
// away — the value is information, the counting is only emphasis.
let hpCountToken = 0;
const REDUCED_MOTION = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (e) { return false; }
};
function countHp(el, to, max, snap = false) {
  if (!el) return;
  const token = ++hpCountToken;
  const from = parseInt(String(el.innerText).split('/')[0], 10);
  // `snap` is a new fighter: the number on screen belongs to whoever was out
  // before, so ticking down from it would count through a stranger's HP.
  if (snap || !Number.isFinite(from) || from === to || REDUCED_MOTION()) {
    el.innerText = `${to}/${max}`;
    return;
  }
  const t0 = performance.now();
  const step = now => {
    if (token !== hpCountToken) return;   // a newer count owns the element
    const k = Math.min(1, (now - t0) / 450);
    el.innerText = `${Math.round(from + (to - from) * k)}/${max}`;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
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
    // ---- the burst (v19.4) ----
    // Levelling up was one line of text in a log ART cannot read. It is now
    // three channels at once, none of them a word: the HP box flashes gold at
    // 3x brightness, a LV 13 mark rises over the player through the same
    // spawnMark that carries ⏫ and ✳, and a four-note square chord climbs.
    const box = document.querySelector('.hp-box-player');
    if (box) {
      box.classList.remove('lvup');
      void box.offsetWidth;
      box.classList.add('lvup');
      setTimeout(() => box.classList.remove('lvup'), 640);
    }
    spawnMark('player', `LV ${mon.level}`, 'fx-lvup');
    sfx.levelUp();
    triggerVibration([40, 30, 40, 30, 120]);
    bar.style.transition = 'none';
    bar.style.width = '0%';
    void bar.offsetWidth;          // commit the empty state before easing back
    bar.style.transition = '';
    bar.style.width = `${pct}%`;
  }, 460);   // just past the 0.45s .xp-fill width transition in gba.css
}

function enableMoves(enabled) {
  document.querySelectorAll('.move-btn').forEach(btn => (btn.disabled = !enabled));
  // The turn is over — the tile you tapped stops being lit.
  if (enabled) document.querySelectorAll('.move-btn.chosen').forEach(btn => btn.classList.remove('chosen'));
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
    // A gym run carries damage between trainers, but only the LEAD is `loaded`
    // at the start of a fight, so every bench member fell through to a green
    // "READY" — including ones the run is holding at a handful of HP. This is
    // the same condition doSwitch() already uses to re-apply carried HP.
    const carried = (battleState.origin === 'gym' && !player().settings.junior
      && gymRun.gymKey === battleState.trainer?.gymKey) ? gymRun.hp[o.id] : null;
    const cur = f ? Math.max(0, Math.floor(f.hp)) : (carried != null ? carried : null);
    const max = f ? f.maxHp : (gymRun.max?.[o.id] ?? null);
    const hpTxt = cur == null ? 'READY' : (max ? `${cur}/${max} HP` : `${cur} HP`);
    // At or under a third, it is one hit from fainting: it stops being green.
    const low = cur != null && max ? cur / max <= 1 / 3 : false;
    // The NAME, not the dex number. "#095" is a lookup a 7-year-old has to do
    // in his head mid-fight; ONIX is the thing he actually knows. nameOf()
    // falls back to "#095" when the name index has not loaded, which is
    // exactly what this row used to show, so it can never get worse.
    const label = `${String(nickOf(o.id) || f?.name || nameOf(o.id)).toUpperCase()} Lv${monLevel(o.id)}`;
    return `<div class="switch-item" data-idx="${o.idx}">
      <img src="${PIXEL_SPRITE(o.id)}">
      <div class="switch-meta"><span>${label}</span><small${low ? ' data-hp="low"' : ''}>${hpTxt}</small></div>
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
  // v19.4: the two 800ms text pauses are gone. One Pokémon shrinks into the
  // ball and the next pops out of it — the same beat, made of pictures, and
  // half a second shorter. Both lines stay for GABE; ART never read either.
  if (!forced) { logMsg(`COME BACK, ${old.name.toUpperCase()}!`); await recall('player'); }
  if (stale(e0)) return;
  renderActive();
  logMsg(`GO, ${active().name.toUpperCase()}!`);
  await sendout('player');
  if (stale(e0)) return;
  await awaitOrTap(500);
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
  // Show the choice on the board, not only in the log: the tile ART tapped
  // stays lit for the whole turn, so he can see the game heard him. Cleared in
  // enableMoves(true) when it is his go again.
  document.querySelectorAll('.move-btn.chosen').forEach(b => b.classList.remove('chosen'));
  document.querySelector(`.move-btn[data-move="${playerMoveIdx}"]`)?.classList.add('chosen');
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
  await awaitOrTap(450);
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

  // The attacker leans in, the world freezes for 90ms, and THEN the blow
  // lands. The hit-stop is the whole difference between two sprites sliding
  // past each other and one of them being HIT.
  await lunge(attackerRole);
  if (stale(e)) return;

  // Junior mode: player Pokémon can never faint (not in VS — fair fight!)
  if (defenderRole === 'player' && juniorActive()) {
    defender.hp = Math.max(1, defender.hp - damage * 0.5);
  } else {
    defender.hp -= damage;
  }
  await hitStop(90);
  if (stale(e)) return;
  updateHP(defenderRole);
  // The buzz moved into impactFx, which is the only function that knows
  // whether the hit was super, weak or nothing at all. One buzz for every hit
  // told ART the same thing every time, which is to say nothing.
  // Each type now SOUNDS like itself — the same information the tile's picture
  // carries, in the one channel that still works while your eyes are on the
  // sprite. Immunity stays silent here: nothing happened, so nothing may sound
  // like it did.
  if (typeMult > 0) sfx.type[move.type]?.();
  impactFx(defenderRole, { damage, typeMult, crit, moveType: move.type });

  // The text line stays for GABE, but it is no longer the ONLY channel — the
  // chevron, the shake and the number above already said it.
  // The lines stay for GABE. They are just no longer a reading pause for ART,
  // who has already had the chevron, the shake, the ghost bar and the number.
  const POST = juniorActive() ? 250 : 300;
  if (crit) { logMsg('A CRITICAL HIT!'); await awaitOrTap(POST); }
  if (typeMult > 1) { logMsg("It's super effective!"); await awaitOrTap(POST); }
  else if (typeMult < 1 && typeMult > 0) { logMsg("It's not very effective..."); await awaitOrTap(POST); }
  else if (typeMult === 0) { logMsg('It had no effect!'); await awaitOrTap(POST); }
  await awaitOrTap(300);
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
    haptic('superHit');
  } else if (kind === 'weak') {
    spawnMark(defenderRole, '⏬', 'fx-weak');
    sfx.hit();
    haptic('weakHit');
  } else {
    sfx.hit();
    haptic('hit');
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
// Fainting is shown before it is said: grey out, tip over, and now a falling
// three-note chord. Clear the one-shot classes first — a lunge still on the
// sprite is another `animation` declaration competing with the tip-over.
function faintSprite(role) {
  clearSpriteFx(role);
  document.getElementById(`${role}-sprite`)?.classList.add('fainted');
  sfx.faint();
}
function unfaintSprites() {
  ['player', 'wild'].forEach(r =>
    document.getElementById(`${r}-sprite`)?.classList.remove('fainted'));
  // ...and nothing parked at opacity 0 from an interrupted recall.
  clearSpriteFx();
}

// ---- v19.2: the SWITCH chip and the one way out ----
// The chip wears the face of whoever comes next. "SWITCH" is six letters ART
// cannot read; a picture of Squirtle is not. Same filter openSwitchModal uses,
// so the chip can never show someone who cannot fight.
function nextTeammateId() {
  const id = battleState.teamIds.find((tid, idx) =>
    idx !== battleState.activeIdx && (!battleState.loaded[tid] || battleState.loaded[tid].hp > 0));
  return id == null ? null : id;
}

function switchChipHtml() {
  const wide = battleState.canCatch === false;   // no BALL vs a trainer: SWITCH takes the row
  const mate = nextTeammateId();
  const face = mate != null
    ? `<img class="hero-ico" src="${PIXEL_SPRITE(mate)}" alt="" draggable="false">`
    : `<span class="hero-glyph">🔄</span>`;
  return `<button class="move-btn hero-btn${wide ? ' switch-wide' : ''}" id="switch-btn" aria-label="SWITCH POKEMON">` +
         `${face}${wide ? '<span>SWITCH</span>' : ''}</button>`;
}

// Leaving a fight is deliberately hard to do by accident, because doing it by
// accident costs a child the Pokemon he was chasing:
//   GABE  tap once to arm (the chip goes red for 2s), tap again to leave
//   ART   hold 900ms while a bar fills — the same gesture as PARENT TOOLS
// Nothing on screen names either mode; the chip just behaves the way that
// child's hands work. Wired once, from main.js.
let exitArmTimer = null;
function disarmExit(chip) {
  clearTimeout(exitArmTimer);
  exitArmTimer = null;
  chip.classList.remove('armed', 'holding');
}

export function wireExitChip() {
  const chip = document.getElementById('escape-btn');
  if (!chip) return;
  let holdTimer = null, held = false;
  // The BODY class is the skin the child is actually looking at, so the
  // gesture always matches the screen. (In versus both boys share one device
  // and one exit; whoever's profile is loaded sets the class.)
  const isJunior = () => document.body.classList.contains('junior');

  chip.addEventListener('click', () => {
    if (isJunior()) {
      // ART leaves by HOLDING, not by tapping — that is deliberate, so a
      // mashing four-year-old cannot lose the Pokémon he was chasing. But a
      // tap used to do nothing whatsoever once his finger lifted, and a
      // control that answers a pre-reader with nothing teaches him it is
      // broken. Replay the fill bar with his finger out of the way: it shows
      // him the gesture instead of telling him.
      chip.classList.remove('holding');
      void chip.offsetWidth;
      chip.classList.add('holding');
      sfx.shake();
      haptic('denied');
      clearTimeout(exitArmTimer);
      exitArmTimer = setTimeout(() => chip.classList.remove('holding'), 950);
      return;
    }
    if (chip.classList.contains('armed')) { disarmExit(chip); exitBattleMode(); return; }
    chip.classList.add('armed');
    sfx.shake();
    haptic('select');
    clearTimeout(exitArmTimer);
    exitArmTimer = setTimeout(() => disarmExit(chip), 2000);
  });

  chip.addEventListener('pointerdown', e => {
    if (!isJunior()) return;
    e.preventDefault();
    clearTimeout(holdTimer);                   // a second finger must not orphan the first timer
    held = false;
    chip.classList.add('holding');
    holdTimer = setTimeout(() => { held = true; disarmExit(chip); exitBattleMode(); }, 900);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
    chip.addEventListener(ev, () => { clearTimeout(holdTimer); if (!held) chip.classList.remove('holding'); }));

  // Never leave the chip armed or half-filled for the NEXT fight.
  document.addEventListener('battle-exited', () => disarmExit(chip));
}

// spawnMark moved to js/fx.js in v19.4, unchanged. It already found its host by
// naming .opponent-side / .player-side, which is why the .sprite-bob wrapper
// does not affect it at all — and why the other two spawners now do the same.

async function checkFaints() {
  if (!battleState.wild || !active()) return;
  if (battleState.wild.hp <= 0) {
    if (battleState.trainer) { await handleEnemyDown(); } else { await handleVictory(); }
    return;
  }
  if (active().hp <= 0) {
    faintSprite('player');
    logMsg(`${active().name.toUpperCase()} FAINTED!`);
    haptic('faint');
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
        // Junior hides #victory-lines, so without a hero this box would be
        // EMPTY for ART — one button and nothing else. 💫 and his own lead, not
        // a cross: this never says "you failed", it says "that's enough for now".
        setVictoryHero(heroHtml([PIXEL_SPRITE(battleState.teamIds[battleState.activeIdx])], '💫'));
        setVictoryXp(null);
        document.getElementById('victory-lines').innerHTML =
          `<p>💫 DEFEAT...</p><p>${battleState.trainer.def.name} was too strong this time.</p><p>Your team was rushed to the Poké Center and fully healed. Train up and try again!</p>`;
        show('victory-modal');
        battleState.pendingEvolution = null;
      } else {
        // "IT GOT AWAY" without a single word. ART could not read the modal,
        // and GABE never needed three sentences to learn the fight is over: the
        // wild Pokémon fades out on a puff of smoke and the screen leaves. The
        // dialog described a heal that exitBattleMode already performs by
        // dropping battleState.loaded — no state changes here.
        logMsg('💨');
        const eAway = battleState.epoch;
        await awaitOrTap(600);
        if (stale(eAway)) return;
        await puffAway('wild');
        if (stale(eAway)) return;
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
  // Read the bar position BEFORE the award — player().mons[id] is a live
  // object and awardPartyXp mutates it in place.
  const pctBefore = xpPct(f.id);
  const levelLines = awardPartyXp(f.id, gained);
  const ups = monLevel(f.id) - before;
  // The spoils screen shows the LAST KO's progress. On `t`, which is
  // battleState.trainer — never persisted, so no schema surface.
  t.xpCard = { pctBefore, pctAfter: xpPct(f.id), from: before, to: monLevel(f.id), ups };
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
  // v19.8 quest kinds. Both ride the win that just happened rather than adding
  // a new place a win can be recorded.
  if (t.rematch) document.dispatchEvent(new CustomEvent('game-progress', { detail: { kind: 'rematch' } }));
  if ((t.round || 1) > 1) document.dispatchEvent(new CustomEvent('game-progress', { detail: { kind: 'round2win' } }));
  document.dispatchEvent(new CustomEvent('battle-victory'));
  logMsg(`YOU DEFEATED ${t.def.name}!`);

  // save endurance HP for the rest of this gym run
  if (!player().settings.junior) {
    // Bank the survivors' damage; drop the fallen. `Math.max(1, ...)` was a
    // "never store 0" guard, but a fainted fighter IS 0, so it was banked as 1
    // and handed back at 1 HP for the rest of the run — every win left GABE's
    // team more fragile than the last, and the switch menu still called them
    // READY. Endurance still bites (survivors keep their damage); a child is
    // just never handed a Pokémon that is already one hit from fainting.
    Object.values(battleState.loaded).forEach(pf => {
      // maxHp travels with the damage so the SWITCH menu can say "12/45 HP"
      // and colour a hurt bench member. In memory only; no save shape changes.
      if (pf.hp > 0) { gymRun.hp[pf.id] = Math.floor(pf.hp); gymRun.max[pf.id] = pf.maxHp; }
      else { delete gymRun.hp[pf.id]; delete gymRun.max[pf.id]; }
    });
  }

  // the spoils: their WHOLE team joins your box, at the trainer's level
  t.def.team.forEach(m => {
    recordCatch(m.id);
    ensureMonAtLeast(m.id, m.level);
    // 'gymCatch', not 'catch': a trainer win must never auto-complete a
    // "Catch N Pokémon" quest with no ball thrown.
    document.dispatchEvent(new CustomEvent('game-progress', { detail: { kind: 'gymCatch', types: [] } }));
  });

  const circuitDone = recordGymWin(t.gymKey, t.idx, t.round || 1);
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
  // The roster IS the hero: it is already a row of sprites and it is already
  // tappable, so it leads the card instead of being duplicated above it. It
  // has to move out of #victory-lines — body.junior hides that half, and
  // leaving the ceremony there would take it away from ART entirely.
  setVictoryHero(
    `<div class="vh-mark" aria-hidden="true">🏆</div>` +
    `<div id="spoils-grid">${grid}</div>` +
    // HIKER CARL is the ONLY one-Pokemon trainer of the 58 — and the first
    // fight every child has, so "PICK YOUR FAVORITE!" over a single Geodude
    // was the first victory card in the game. The node itself must stay:
    // pickSpoilsFavorite() looks it up by id and rewrites it after a pick.
    `<p id="spoils-hint">⭐ ${t.def.team.length > 1 ? 'PICK YOUR FAVORITE!' : 'TAP TO SEE IT!'}</p>`);
  setVictoryXp(t.xpCard || null);
  document.getElementById('victory-lines').innerHTML =
    `<p>🏆 ${t.def.name} DEFEATED!</p>` +
    `<p>You caught their whole team:</p>` +
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
  // 'fainted' comes off WITH 'sucked-in'. An auto-caught Pokémon used to pop
  // back out of the ball grey, tipped over at 55% opacity, and sit there as a
  // little corpse until the win card covered it — the reward for winning was a
  // picture of a dead animal. The spoils path already clears it by hand.
  // NEVER delete this line: 'sucked-in' is not in the fx.js ONE_SHOT list, so
  // leaving it on makes the NEXT wild Pokémon invisible.
  sprite.classList.remove('sucked-in', 'fainted');
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
  // v19.7: the FIRST shiny either boy ever catches gets its own ceremony. It is
  // announced BEFORE the 'catch' event on purpose, so it takes its turn in
  // progression.js's celebration queue AHEAD of the SPARKLE badge this same
  // catch is about to earn — the picture first, then the badge. The queue is
  // what stops either of them landing on top of the victory card.
  if (newShiny && player().shinies.length === 1) {
    document.dispatchEvent(new CustomEvent('first-shiny', {
      detail: { id: w.id, sprite: w.spriteFront || w.shinyFront || null }
    }));
  }
  // v19.8: the quest board can now ask for a habitat, a rarity, a level or a
  // shiny, so the catch event carries them. habitatKey and tier are reported
  // ONLY for an explore encounter: explore.js holds the last habitat it walked
  // into for as long as the app is open, and an arena or dex catch did not
  // happen there.
  const fromExplore = battleState.origin === 'explore';
  document.dispatchEvent(new CustomEvent('game-progress', { detail: {
    kind: 'catch', types: w.types || [], level: w.level, shiny: !!w.shiny,
    habitatKey: fromExplore ? (activeHabitat()?.key || null) : null,
    tier: fromExplore ? activeTier() : null
  } }));

  // Nickname: in-world, and now genuinely AFTER the celebration instead of on
  // top of it. This comment has been aspirational since v18.6 — #nick-modal
  // (z-2500) actually opened BEFORE the victory card (z-2000) and buried it,
  // so a boy met NAME ME? on a black screen before he ever saw what he caught.
  // Stashed here, asked by maybeEvolveThenExit(). Junior is never interrupted.
  battleState.pendingNick = (newCatch && !player().settings.junior) ? { id: w.id, name: w.name } : null;

  const gained = xpForKO(w);
  const before = monLevel(f.id);
  const pctBefore = xpPct(f.id);   // read before awardPartyXp mutates the mon
  const levelLines = awardPartyXp(f.id, gained);
  const after = monLevel(f.id);
  const ups = after - before;
  const pctAfter = xpPct(f.id);

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
  setVictoryHero(heroHtml([PIXEL_SPRITE(w.id)], newShiny ? '✨' : newCatch ? '⭐' : '✅'));
  setVictoryXp({ pctBefore, pctAfter, from: before, to: after, ups });
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
  // B-031: three of these four rows used to carry the IDENTICAL caption
  // "BETTER WHEN WEAKENED", so the one thing GABE is choosing between was the
  // one thing the words refused to tell him. The dex drawer two taps away
  // already ranks them (index.html:99-104); this is the same ladder, carried
  // across so both drawers say the same thing.
  const BALLS = [
    { mod: 1, name: 'poke-ball', label: 'POKÉBALL', rate: '1x RATE' },
    { mod: 1.5, name: 'great-ball', label: 'GREAT BALL', rate: '1.5x RATE' },
    { mod: 2, name: 'ultra-ball', label: 'ULTRA BALL', rate: '2x RATE' },
    { mod: 99, name: 'master-ball', label: 'MASTER BALL', rate: '100% CATCH' }
  ];
  list.innerHTML = BALLS.map(b => {
    const isMaster = b.name === 'master-ball';
    const disabled = isMaster && !junior && mb < 1;
    const count = isMaster && !junior ? ` x${mb}` : '';
    return `<div class="switch-item ballpick ${disabled ? 'disabled' : ''}" data-mod="${b.mod}" data-ball="${b.name}">
      <img src="${ITEM_SPRITE(b.name)}">
      <div class="switch-meta"><span>${b.label}${count}</span>${junior ? '' : `<small>${b.rate}</small>`}</div>
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
    // ...and again on the catch, so the thing he just won says its own name.
    cryForWild();
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
      // v19.8 THE EVOLUTION FAN. api.evolutionOptions() returns EVERY branch
      // this species can take at this level (Eevee has eight), already filtered
      // to #1-649 and already applying the Lv30 default for the stone and trade
      // lines. One candidate evolves straight away, exactly as before; more
      // than one asks the child.
      const options = await evolutionOptions(pending.id, pending.level);
      if (options.length === 1) await playEvolution(pending, options[0]);
      else if (options.length > 1) {
        const pick = await askEvolutionChoice(pending, options);
        // NOT YET is a real answer and it costs nothing: the question comes
        // back on the next level-up, for ever. Rule 3 — the choice is his, and
        // it is never taken away.
        if (pick) await playEvolution(pending, pick);
      }
    } catch (e) { /* evolution is a bonus — never block exit on it */ }
  }
  // Last in the queue: the win card, then the evolution, then the naming box.
  // Asked AFTER teardown on purpose — exitBattleMode() settles any open prompt
  // (it would cancel this one), and awaiting it before teardown would hold the
  // dead battle screen up behind the box. Read it first: teardown clears it.
  const pendingNick = battleState.pendingNick;
  exitBattleMode();
  if (pendingNick) askNickname(pendingNick.id, pendingNick.name).then(nick => { if (nick) setNick(pendingNick.id, nick); });
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
  text.innerText = `${String(fromMon.name).toUpperCase()} evolved into ${toMon.name.toUpperCase()}!`;
  // v19.8: the 'evolve' quest kind. Dispatched while #evo-modal is still up, so
  // progression.js's celebration queue HOLDS the quest card until the ceremony
  // finishes instead of stacking a second scrim on top of it.
  document.dispatchEvent(new CustomEvent('game-progress', { detail: { kind: 'evolve', from: fromMon.id, to: toMon.id } }));
  await awaitOrTap(2600);
  show('evo-modal', false);
}

// ---- WHO WILL IT BECOME? (v19.8) ----
// Sprite tiles, one per branch, and NOT YET. ART taps a picture: the question
// and the captions are for GABE and CSS hides them in Junior Mode, because a
// modal whose only content is words does not exist for a pre-reader.
// Resolves with the chosen option, or null for NOT YET.
let evoPickResolver = null;
function askEvolutionChoice(fromMon, options) {
  const modal = document.getElementById('evo-pick-modal');
  const grid = document.getElementById('evo-pick-grid');
  const later = document.getElementById('evo-pick-later');
  // If the markup is somehow missing, evolve rather than swallow the level-up.
  if (!modal || !grid || !later) return Promise.resolve(options[0] || null);
  const fromImg = document.getElementById('evo-pick-from');
  if (fromImg) fromImg.src = PIXEL_SPRITE(fromMon.id);
  const title = document.getElementById('evo-pick-title');
  if (title) title.innerText = `WHO WILL ${String(fromMon.name).toUpperCase()} BECOME?`;
  grid.innerHTML = options.map(o =>
    `<button class="evo-pick" data-evo-id="${o.id}" title="${o.name}">
       <img src="${PIXEL_SPRITE(o.id)}" alt=""><small>${o.name.toUpperCase().replace(/-/g, ' ')}</small>
     </button>`).join('');
  show('evo-pick-modal');
  sfx.levelUp();
  triggerVibration([40, 30, 40]);
  return new Promise(resolve => {
    let done = false;
    const finish = pick => {
      if (done) return;
      done = true;
      evoPickResolver = null;
      grid.removeEventListener('click', onPick);
      later.removeEventListener('click', onLater);
      show('evo-pick-modal', false);
      resolve(pick);
    };
    function onPick(ev) {
      const btn = ev.target.closest('.evo-pick');
      if (!btn) return;
      triggerVibration(40);
      finish(options.find(o => o.id === parseInt(btn.dataset.evoId, 10)) || null);
    }
    function onLater() { triggerVibration(20); finish(null); }
    grid.addEventListener('click', onPick);
    later.addEventListener('click', onLater);
    // exitBattleMode() calls this to settle a picker left open by a teardown.
    evoPickResolver = () => finish(null);
  });
}

// ---- EVOLVE from the PC (v19.8) ----
// awardPartyXp has levelled the WHOLE team since teams shipped, but only the
// KO'er's evolution was ever queued — so five team members could sit twenty
// levels past their evolution for ever with nothing in the game mentioning it.
// main.js bridges the PC's 'evolve-request' to here: pc.js must not import
// battle.js, because battle.js already imports pc.js and that is a cycle.
// #evo-modal is a global overlay, not part of the battle screen, so this runs
// happily with no fight in progress and touches no battleState.
export async function runEvolutionFor(id) {
  if (state.appMode === 'battle' || state.isCatching) return;
  try {
    const level = monLevel(id);
    const options = await evolutionOptions(id, level);
  // Both awaits below are unbounded (a network call, then a child's tap), so
  // ownership is re-checked after each: a picker that resolves into a fight
  // that has already started would evolve a Pokemon mid-battle.
  if (state.appMode === 'battle' || state.isCatching) return;
    if (!options.length) return;
    const data = await getPokemon(id);
    const from = { id, level, name: nickOf(id) || data.name || nameOf(id) };
    const pick = options.length === 1 ? options[0] : await askEvolutionChoice(from, options);
    if (pick) (state.appMode === 'battle' || state.isCatching) ? null : await playEvolution(from, pick);
  } catch (e) { /* a bonus, never a failure a child has to be shown */ }
}

// ============================================================
// VERSUS MODE — P1 vs P2, pass-and-play on one device
// Side 1 = bottom (back sprite), Side 2 = top (front sprite).
// No catching, no junior shield, no XP — pure bragging rights.
// ============================================================
const versus = { sides: null, order: [], qi: 0, matchLevel: null };

// ---- the match level, and why it goes UP ----
// Versus is the one mode the brothers play together, and it was the one place
// Junior Mode's promise broke: ART's Lv9 Pikachu met GABE's Lv62 Charizard and
// was deleted on turn one. juniorActive() returns false here on purpose (see
// the header above), and re-enabling the shield would be worse — a shield GABE
// can feel is an accommodation that announces itself, which is the same rule
// read from the other side.
//
// So both sides fight at ONE level: the stronger team's top. Levelling the
// match DOWN to ART's Lv9 was the obvious move and is the wrong one — it would
// take GABE's Charizard, the thing he spent weeks raising, and shrink it in
// front of his little brother. Rule 3 says never take something away from a
// child, and that is exactly what he would see. Lifting ART up instead costs
// nobody anything: GABE's own numbers are untouched, both boys get a real
// fight, and the only number that changed is one ART cannot read.
//
// Nothing here is written to a save. matchLevel is set when a match starts and
// cleared by every teardown path, so a wild battle can never inherit it.
const topLevelOf = n => {
  const P = state.save.players[n];
  const ids = P.team.length ? P.team : P.caught.slice(0, 6);
  return ids.reduce((hi, id) => Math.max(hi, P.mons[id]?.level ?? 5), 5);
};

const pLevel = (n, id) => {
  const raw = state.save.players[n].mons[id]?.level ?? 5;
  return versus.matchLevel ?? raw;
};
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

  // Set BEFORE the first pLevel call, so both fighters and every later
  // send-out (versusNextMon) read the same match level.
  versus.matchLevel = Math.max(topLevelOf(1), topLevelOf(2));

  try {
    const [f1, f2] = await Promise.all([
      buildFighter(ids1[0], pLevel(1, ids1[0]), 'player', 1),
      buildFighter(ids2[0], pLevel(2, ids2[0]), 'wild', 2)
    ]);
    versus.sides[1].loaded[ids1[0]] = f1;
    versus.sides[2].loaded[ids2[0]] = f2;
    // map side 1 onto the engine's player slot, side 2 onto the wild slot
    battleState.teamIds = ids1;
    battleState.activeIdx = 0;
    battleState.loaded = versus.sides[1].loaded;
    battleState.wild = f2;

    await preloadSprites(f2.spriteFront, f1.spriteBack);
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
  // .fainted is not cleared by exitBattleMode, so a Pokémon that fainted in
  // the LAST fight walked into a versus match grey and tipped over on a full
  // green HP bar. This is the greyscale Kevin reported.
  unfaintSprites();
  const owner = state.save.players[n];
  const nick = owner.nicks[f.id];
  if (n === 1) {
    document.getElementById('player-name').innerHTML = `${nick || f.name} <span class="lvl">Lv${f.level} · ${playerName(1)}</span>`;
    setFighterSprite(document.getElementById('player-sprite'), f.spriteBack);
    updateHP('player');
  } else {
    document.getElementById('wild-name').innerHTML = `${nick || f.name} <span class="lvl">Lv${f.level} · ${playerName(2)}</span>`;
    setFighterSprite(document.getElementById('wild-sprite'), f.spriteFront);
    updateHP('wild');
  }
}

function renderVersusMoves(n) {
  const f = sideActive(n);
  const grid = document.getElementById('battle-moves');
  // The SAME board GABE and ART get in a wild or gym fight — picture, power
  // dots and the effectiveness mark — read against whoever is on the OTHER
  // side of the device. Versus was the one mode still on the pre-v19.3
  // text-only buttons, which locked ART out of playing his brother.
  // The panel arithmetic is unchanged: four tiles plus one 56px full-width
  // button is the same stack as four tiles plus the 56px hero row, i.e.
  // 4 + 51 + 10 + 56 + 8 + 56 + 8 + 56 + 10 = 259px normal, and
  // 4 + 51 + 10 + 67 + 8 + 67 + 8 + 62 + 10 = 287px junior at 375x667,
  // both inside .battle-controls' 52dvh (347px) cap.
  grid.innerHTML =
    moveTilesHtml(f.moves, 'vmove', sideActive(n === 1 ? 2 : 1)?.types) +
    `<button class="move-btn aux-btn run-wide" id="vs-quit-btn">🏳️ END MATCH</button>`;
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
      try { side.loaded[id] = await buildFighter(id, pLevel(n, id), n === 1 ? 'player' : 'wild', n); }
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
  versus.matchLevel = null;
  state.save.players[winnerSide].stats.versusWins = (state.save.players[winnerSide].stats.versusWins || 0) + 1;
  persist();
  // v19.8: the 'versus' quest kind. progression.js writes to player(), which is
  // state.currentPlayer, and versus does NOT swap it — so without this guard
  // P1's "win a brother battle" would complete when P2 won.
  if (winnerSide === state.currentPlayer) {
    document.dispatchEvent(new CustomEvent('game-progress', { detail: { kind: 'versus' } }));
  }
  document.dispatchEvent(new CustomEvent('battle-victory'));
  setVictoryHero(heroHtml([PIXEL_SPRITE(sideActive(winnerSide).id)], '🏆'));
  setVictoryXp(null);   // VS awards no XP — an empty strip, not a stale one
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
