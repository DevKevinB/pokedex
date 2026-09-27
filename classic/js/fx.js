// ============================================================
// Pokédex OS — sprite life (v19.4)
// Everything that MOVES a battle sprite, or throws a picture over one.
//
// THE STRUCTURAL RULE this file depends on (ROADMAP §3.5):
//   .sprite-bob   the WRAPPER div  — owns the idle float loop
//   #*-sprite     the <img>        — owns every ONE-SHOT transform
// Before v19.4 the float lived on the <img>, and a CSS animation always beats
// a plain declaration for the same property — which is why the faint tip-over
// never rendered until v19.1 papered over it with `animation: none !important`.
// With the loop on the wrapper, a lunge, a recall and a tip-over can each own
// `transform` without fighting anyone. v19.1's guard STAYS: it is now what
// stops a half-played lunge from outranking the tip-over.
// ============================================================

import { awaitOrTap } from './config.js';
import { playBeep, triggerVibration, playCryFor, haptic } from './audio.js';

// Every one-shot class, in one list. Two `animation` declarations on one
// element do not stack — the later rule simply wins — so only ever one of
// these may be on a sprite at a time.
const ONE_SHOT = ['lunge', 'recall', 'sendout', 'puff-out', 'hit-anim'];

const spriteOf = role => document.getElementById(`${role}-sprite`);

// The HOST for a floating glyph is the SIDE, not the sprite's parent.
// spawnDamagePop and spawnParticles used `sprite.parentElement`, which WAS
// .opponent-side / .player-side until v19.4 wrapped the img in .sprite-bob.
// Naming the side makes all three spawners agree and makes the wrapper
// invisible to them — the element they get is byte-identical to before.
const sideOf = role =>
  document.querySelector(role === 'wild' ? '.opponent-side' : '.player-side')
  || document.querySelector('.battle-arena');

/** Strip every one-shot class. A .recall left on is an INVISIBLE Pokémon in
 *  the next fight — the animation's `both` fill parks it at opacity 0. */
export function clearSpriteFx(role) {
  (role ? [role] : ['player', 'wild'])
    .forEach(r => spriteOf(r)?.classList.remove(...ONE_SHOT));
}

// Play one class, wait exactly as long as its keyframes run, take it off.
// These are beats of ANIMATION timing, not reading pauses, so they are marked
// `beat` and awaitOrTap sleeps them plainly: none of them ever flashes the skip
// arrow at a child mid-lunge, and a tap can never cut a keyframe short. This
// used to be inferred from the duration being under floor+50, which also
// swallowed the battle's 300ms result lines; it is said out loud now.
async function oneShot(role, cls, ms) {
  const el = spriteOf(role);
  if (!el) return;
  el.classList.remove(...ONE_SHOT);
  void el.offsetWidth;
  el.classList.add(cls);
  await awaitOrTap(ms, { beat: true });
  el.classList.remove(cls);
}

/** The attacker leans into the blow, 22px toward the foe. */
export const lunge   = role => oneShot(role, 'lunge', 280);
/** Shrink into the ball. */
export const recall  = role => oneShot(role, 'recall', 280);
/** Pop out of it — overshoot, then settle. */
export const sendout = role => oneShot(role, 'sendout', 300);

/** It got away. A fading sprite and a puff of smoke, and not one word. */
export async function puffAway(role = 'wild') {
  spawnMark(role, '💨', 'fx-puff');
  await oneShot(role, 'puff-out', 300);
}

/** Freeze the world for 90ms so the hit LANDS instead of sliding past it.
 *  Pauses the bob loop on the WRAPPERS, which is the only reason this is
 *  possible without touching either sprite's own transform. */
export async function hitStop(ms = 90) {
  const bobs = [...document.querySelectorAll('.sprite-bob')];
  bobs.forEach(b => { b.style.animationPlayState = 'paused'; });
  await awaitOrTap(ms, { beat: true });   // animation timing, never a pause to skip
  bobs.forEach(b => { b.style.animationPlayState = ''; });
}

/** Wipe a sprite in from the left in six chunky columns. */
export function pxReveal(el) {
  if (!el) return;
  el.classList.remove('px-reveal');
  void el.offsetWidth;
  el.classList.add('px-reveal');
  setTimeout(() => el.classList.remove('px-reveal'), 420);
}

// ---- the three spawners, moved out of battle.js ----

export function spawnDamagePop(defenderRole, dmg, typeMult, crit) {
  const host = sideOf(defenderRole);
  if (!host) return;
  const pop = document.createElement('span');
  pop.className = 'dmg-pop' + (crit || typeMult > 1 ? ' super' : typeMult < 1 ? ' weak' : '');
  pop.innerText = `-${Math.max(1, Math.floor(dmg))}`;
  pop.style.left = `${15 + Math.random() * 50}%`;
  pop.style.top = `${Math.random() * 20}%`;
  host.appendChild(pop);
  setTimeout(() => pop.remove(), 950);
}

export function spawnParticles(defenderRole, color) {
  const host = sideOf(defenderRole);
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

// A single glyph that floats over the defender — the wordless half of the
// effectiveness message, and now the carrier for LV 13 too.
// v19.5 generalised this. Passed a ROLE string ('wild' / 'player') it behaves
// exactly as v19.4 did and prefixes `impact-mark`; passed an ELEMENT it uses
// the class string as given, which is what the pet hearts need. Merging the
// two spawners rather than letting v19.5 replace this file is deliberate:
// v19.5 originally shipped fx.js as a NEW file with a different export set,
// which would have left battle.js importing names that no longer existed —
// a missing named export is a module-graph SyntaxError, so main.js would
// never evaluate and the boys would get a dead black screen, offline copy
// included.
export function spawnMark(hostOrRole, glyph, cls, { dx = 0, delay = 0, life = 900 } = {}) {
  const byRole = typeof hostOrRole === 'string';
  const host = byRole ? sideOf(hostOrRole) : hostOrRole;
  if (!host) return null;
  const el = document.createElement('div');
  el.className = byRole ? `impact-mark ${cls}` : (cls || '');
  el.textContent = glyph;
  el.setAttribute('aria-hidden', 'true');
  if (dx) el.style.setProperty('--dx', `${dx}px`);
  if (delay) el.style.animationDelay = `${delay}ms`;
  host.appendChild(el);
  setTimeout(() => el.remove(), life + delay);
  return el;
}

// ---- PET YOUR POKEMON (ROADMAP §4 v19.5) ----
// The one interaction in the whole game with no goal, no reward and no way to
// fail: it is what a four-year-old does with a toy before he plays with it.
// Five taps inside 1.2s is a deliberate secret — it costs nothing to miss, and
// it is exactly the kind of thing a seven-year-old tells his brother about.
const PET_COMBO_MS = 1200;
const PET_COMBO_TAPS = 5;
let petTaps = [];
const petTimers = new WeakMap();

/**
 * @param sprite the <img> to animate
 * @param host   a position:relative ancestor the hearts float out of
 * @param id     species id, for the cry
 */
export function pet(sprite, host, id) {
  if (!sprite) return;

  const now = Date.now();
  petTaps = petTaps.filter(t => now - t < PET_COMBO_MS);
  petTaps.push(now);
  const spin = petTaps.length >= PET_COMBO_TAPS;
  if (spin) petTaps = [];

  // Restart the animation cleanly on a fast re-tap, or the fifth tap would
  // land on a sprite already mid-hop and nothing visible would happen.
  const cls = spin ? 'pet-spin' : 'pet-hop';
  sprite.classList.remove('pet-hop', 'pet-spin');
  void sprite.offsetWidth;
  sprite.classList.add(cls);
  clearTimeout(petTimers.get(sprite));
  petTimers.set(sprite, setTimeout(() => sprite.classList.remove(cls), spin ? 580 : 380));

  const hearts = spin ? 12 : 3;
  const spread = spin ? 150 : 64;
  for (let i = 0; i < hearts; i++) {
    spawnMark(host, '💗', 'pet-heart', {
      dx: Math.round((i / Math.max(1, hearts - 1) - 0.5) * spread),
      delay: i * (spin ? 45 : 90)
    });
  }

  if (spin) {
    // A rising three-note flourish: the reward for finding the secret.
    [659, 880, 1175].forEach((f, i) =>
      setTimeout(() => playBeep(f, 'square', 0.10, 0.09), i * 90));
    haptic('levelUp');
  } else {
    triggerVibration(20);
    playCryFor(id);   // throttled to one cry per 400ms inside audio.js
  }
}

