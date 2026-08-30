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
// Every duration here is <= 300ms on purpose: awaitOrTap() treats anything at
// or under floor+50 as a beat of animation timing and sleeps it plainly, so
// none of these ever flashes the skip arrow at a child.
async function oneShot(role, cls, ms) {
  const el = spriteOf(role);
  if (!el) return;
  el.classList.remove(...ONE_SHOT);
  void el.offsetWidth;
  el.classList.add(cls);
  await awaitOrTap(ms);
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
  await awaitOrTap(ms);
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
export function spawnMark(defenderRole, glyph, cls) {
  const host = sideOf(defenderRole);
  if (!host) return;
  const el = document.createElement('div');
  el.className = `impact-mark ${cls}`;
  el.textContent = glyph;
  host.appendChild(el);
  setTimeout(() => el.remove(), 900);
}
