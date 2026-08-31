// ============================================================
// Pokédex OS — audio engine: ONE graph, cries, sfx, haptics
// Procedural Web Audio only. The game NEVER talks — see the
// no-speech note further down and the guard in test/smoke.mjs.
// ============================================================

import { cachedPokemon } from './api.js';

// ---- ONE AudioContext for the whole app (ROADMAP §4 v19.5) ----
// music.js used to build a SECOND context. Two contexts means two hardware
// clocks, two things iOS can suspend independently, and no single place to
// balance the mix — which is why a chiptune bassline could bury a hit. Now
// there is one ctx, three buses, and every module borrows them.
let audioCtx = null;
let buses = null;                 // { music, sfx, cry }
const BUS_GAIN = { music: 0.35, sfx: 1.0, cry: 0.6 };

export function getCtx() {
  if (audioCtx) return audioCtx;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    buses = {};
    for (const name of Object.keys(BUS_GAIN)) {
      const g = audioCtx.createGain();
      g.gain.value = muted ? 0 : BUS_GAIN[name];
      g.connect(audioCtx.destination);
      buses[name] = g;
    }
  } catch (e) {
    console.warn('Audio Context blocked.');
    audioCtx = null; buses = null;
  }
  return audioCtx;
}

/** The GainNode a sound should connect to, or null if audio is unavailable. */
export function getBus(name = 'sfx') {
  return (getCtx() && buses) ? (buses[name] || buses.sfx) : null;
}

// iOS parks a backgrounded context in 'suspended', and hands it back after a
// phone call in 'interrupted' — a state that never clears on its own. This app
// had ZERO visibilitychange listeners, which is why one call silenced the game
// until it was force-quit and relaunched.
/** True only once the AudioContext EXISTS and is actually running — i.e. the
    app has had a real user gesture. Anything that makes a sound nobody asked
    for (the v19.7 dex auto-cry) checks this first, so a page that has never
    been touched stays silent. It deliberately does not call getCtx(): asking
    the question must never be what creates the context. */
export function audioUnlocked() {
  return !!audioCtx && audioCtx.state === 'running';
}

export function resumeIfNeeded() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) { /* noop */ } }
}

// ---- global mute: silences music, sfx and cries ----
let muted = false;
try { muted = localStorage.getItem('pokedexos_muted') === '1'; } catch (e) { /* noop */ }

// The sequencer books notes up to 120ms ahead, so a per-note `muted` check
// alone would let a tail of music play after the mute. Pulling the buses to
// zero silences what is already scheduled, immediately.
function applyMuteToBuses() {
  if (!audioCtx || !buses) return;
  const t = audioCtx.currentTime;
  for (const name of Object.keys(BUS_GAIN)) {
    try { buses[name].gain.setTargetAtTime(muted ? 0 : BUS_GAIN[name], t, 0.01); } catch (e) { /* noop */ }
  }
}

export function isMuted() { return muted; }

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('pokedexos_muted', muted ? '1' : '0'); } catch (e) { /* noop */ }
  applyMuteToBuses();
  if (muted) stopAllAudio();
  return muted;
}

// ---- device-local HAPTICS switch ----
// Follows the pokedexos_muted pattern exactly, and for the same reason: this
// is a fact about the DEVICE — Kevin's laptop cannot buzz at all — not about a
// player. It must never enter the save, or an exported save would carry the
// iPad's buzz setting onto the phone. Default ON: a missing key means ON.
let haptics = true;
try { haptics = localStorage.getItem('pokedexos_haptics') !== '0'; } catch (e) { /* noop */ }

export function hapticsOn() { return haptics; }

export function toggleHaptics() {
  haptics = !haptics;
  try { localStorage.setItem('pokedexos_haptics', haptics ? '1' : '0'); } catch (e) { /* noop */ }
  if (haptics) triggerVibration(15);   // confirm the switch in its own language
  return haptics;
}

// ---- the haptic vocabulary (ROADMAP §3.5) ----
// One buzz shape per EVENT, so a hit and a catch never feel the same. ART
// cannot read "SUPER EFFECTIVE"; he can feel the difference between one thump
// and three. Values are navigator.vibrate patterns in ms (on, off, on, ...).
export const HAPTIC = {
  tick:     [8],
  select:   [15],
  hit:      [30],
  superHit: [30, 20, 50],
  weakHit:  [12],
  catch:    [100, 50, 100],
  levelUp:  [40, 30, 40, 30, 120],
  faint:    [200],
  denied:   [10, 30, 10]
};

/** Buzz by NAME. Unknown names are silently ignored, never a thrown error. */
export function haptic(name) {
  const pattern = HAPTIC[name];
  if (pattern) triggerVibration(pattern);
}

export function initAudio() {
  getCtx();
  resumeIfNeeded();
}

// The one primitive under every sound in the game: a note, on a bus, at a
// time. `when` is a ctx.currentTime value (0 = now), which is what lets the
// sequencer and the synthesised cry book notes ahead of the main thread.
function tone(freq, type, duration, vol, when = 0, busName = 'sfx') {
  const ctx = getCtx();
  const out = getBus(busName);
  if (!ctx || !out || muted) return null;
  try {
    const at = when || ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    gain.gain.setValueAtTime(vol, at);
    gain.gain.exponentialRampToValueAtTime(0.01, at + duration);
    osc.connect(gain);
    gain.connect(out);
    osc.start(at);
    osc.stop(at + duration);
    return osc;
  } catch (e) { return null; }
}

export function playBeep(freq, type, duration, vol = 0.1) {
  tone(freq, type, duration, vol);
}

export const sfx = {
  shake:    () => playBeep(150, 'square', 0.1, 0.2),
  catch:    () => { playBeep(600, 'sine', 0.1); setTimeout(() => playBeep(800, 'sine', 0.3), 100); },
  break:    () => playBeep(100, 'sawtooth', 0.4, 0.3),
  hit:      () => playBeep(200, 'sawtooth', 0.1, 0.3),
  superHit: () => playBeep(400, 'square', 0.15, 0.3),
  suck:     () => playBeep(400, 'sine', 0.3),
  // The sound of a button being a button. Short and quiet on purpose: it
  // plays on EVERY tap in the app, so it has to sit under the music rather
  // than on top of it.
  tick:     () => playBeep(880, 'square', 0.03, 0.05)
};

// ---- one sound per type ----
// Every attack in the game made the same noise, so the only thing that said
// WHICH move you used was the log line — words, which ART cannot read. These
// give each type its own voice out of the same square/saw/sine beeps the rest
// of the game already uses: fire crackles down, water sweeps up, electric
// buzzes, rock thuds. No files, no library, no dependency, and nothing spoken.
// It is the picture on the button again, in the one channel that still works
// while your eyes are on the Pokémon instead of the buttons.
//
// A note is [frequency, waveform, seconds, volume, delay-ms]. playBeep already
// refuses to sound when muted or before the context is unlocked, and the
// delayed notes re-check on the way through, so a mid-sequence mute is silent.
const chord = notes => notes.forEach(([f, w, d, v, at]) => {
  if (at) setTimeout(() => playBeep(f, w, d, v), at);
  else playBeep(f, w, d, v);
});

sfx.type = {
  normal:   () => chord([[220, 'square', 0.07, 0.14], [170, 'square', 0.09, 0.12, 55]]),
  fighting: () => chord([[170, 'square', 0.08, 0.18], [110, 'square', 0.12, 0.16, 70]]),
  flying:   () => chord([[880, 'sine', 0.05, 0.10], [1180, 'sine', 0.06, 0.09, 45], [1480, 'sine', 0.07, 0.07, 90]]),
  poison:   () => chord([[300, 'sawtooth', 0.10, 0.11], [240, 'sawtooth', 0.12, 0.10, 70], [190, 'sawtooth', 0.16, 0.08, 140]]),
  ground:   () => chord([[95, 'sawtooth', 0.16, 0.20], [70, 'sawtooth', 0.20, 0.16, 60]]),
  rock:     () => chord([[130, 'square', 0.08, 0.20], [85, 'sawtooth', 0.16, 0.16, 50]]),
  bug:      () => chord([[760, 'square', 0.03, 0.09], [960, 'square', 0.03, 0.09, 45], [760, 'square', 0.04, 0.08, 90]]),
  ghost:    () => chord([[520, 'sine', 0.14, 0.11], [380, 'sine', 0.18, 0.09, 90], [300, 'sine', 0.22, 0.07, 180]]),
  steel:    () => chord([[1600, 'square', 0.04, 0.10], [1200, 'square', 0.12, 0.08, 50]]),
  fire:     () => chord([[210, 'sawtooth', 0.07, 0.16], [170, 'sawtooth', 0.06, 0.14, 55], [135, 'sawtooth', 0.10, 0.12, 110]]),
  water:    () => chord([[380, 'sine', 0.06, 0.13], [520, 'sine', 0.06, 0.12, 45], [700, 'sine', 0.10, 0.10, 90]]),
  grass:    () => chord([[520, 'triangle', 0.09, 0.15], [660, 'triangle', 0.12, 0.12, 70]]),
  electric: () => chord([[1400, 'square', 0.04, 0.10], [980, 'square', 0.04, 0.10, 40], [1400, 'square', 0.05, 0.09, 80]]),
  psychic:  () => chord([[700, 'sine', 0.12, 0.11], [1050, 'sine', 0.14, 0.09, 80], [1400, 'sine', 0.16, 0.07, 160]]),
  ice:      () => chord([[1320, 'sine', 0.06, 0.10], [1760, 'sine', 0.08, 0.08, 50], [2200, 'sine', 0.10, 0.06, 100]]),
  dragon:   () => chord([[200, 'sawtooth', 0.14, 0.18], [260, 'sawtooth', 0.16, 0.15, 90]]),
  // (levelUp / faint are attached below this object — chord() is declared
  //  between `sfx` and here, so they cannot live in the literal above.)
  dark:     () => chord([[150, 'triangle', 0.16, 0.16], [100, 'triangle', 0.20, 0.14, 90]]),
  fairy:    () => chord([[880, 'sine', 0.07, 0.11], [1320, 'sine', 0.09, 0.09, 60], [1760, 'sine', 0.11, 0.07, 120]])
};

// ---- v19.4: two events that used to be a sentence ----
// A level-up said "PIKACHU grew from Lv12 to Lv13!" in a log ART cannot read.
// A rising four-note square chord says the same thing to both boys at once.
// The faint gets the mirror of it: three notes going down.
sfx.levelUp = () => chord([
  [523, 'square', 0.12, 0.22],
  [659, 'square', 0.12, 0.22, 90],
  [784, 'square', 0.12, 0.22, 180],
  [1047, 'square', 0.34, 0.26, 270]
]);
// v19.6, the sticker book. A new sticker gets a bright two-note pop — it is
// the ONLY thing in the book that says "this one is new, you did that", since
// ART cannot read the name under it. The star is a softer single chime so
// putting one on the shelf feels like a choice rather than an achievement.
sfx.newSticker = () => chord([
  [784, 'square', 0.07, 0.11],
  [1175, 'square', 0.10, 0.11, 80]
]);
sfx.star = () => chord([
  [988, 'triangle', 0.09, 0.10],
  [1319, 'triangle', 0.12, 0.09, 70]
]);

sfx.faint = () => chord([
  [392, 'square', 0.10, 0.18],
  [294, 'square', 0.12, 0.16, 90],
  [196, 'square', 0.30, 0.16, 190]
]);

// ============================================================
// CRIES — the real one where it can play, a made-up one where it can't
// ============================================================
// PokeAPI serves cries as .ogg ONLY, and Safari plays no Ogg Vorbis. So on
// the boys' iPad — the only device that matters — every CRY tap since the
// button shipped has been a silent no-op: api.js kept the URL, the <audio>
// element rejected, and playCryAudio() swallowed the rejection into a
// console.warn nobody was ever going to read.
//
// Fix: feature-detect, and when Ogg is unplayable BUILD a cry out of the same
// square/triangle beeps the rest of the game already uses.
//
// This is a SOUND EFFECT, not a voice. It says nothing, spells nothing and
// synthesises no speech. The no-speech rule (and the smoke guard) is about
// SpeechSynthesis and it stays absolute — see the note at the end of the file.
//
// NOTE: never route the <audio> cry through the AudioContext with a
// MediaElementSource. The files are cross-origin with no CORS headers, so the
// graph would be tainted and output silence — the exact bug we are fixing.
let cryAudio = null;      // the preloaded element for the dex's current subject
let playingCry = null;    // whatever element is actually sounding right now
let cryUrl = null;
let cryMeta = null;
let liveCryOscs = [];
let lastCryAt = 0;
const CRY_MIN_GAP_MS = 400;   // pet taps arrive faster than a cry can finish

let oggOk = null;
function canPlayOgg() {
  if (oggOk !== null) return oggOk;
  try {
    const probe = document.createElement('audio');
    const r = probe.canPlayType('audio/ogg; codecs="vorbis"') || probe.canPlayType('audio/ogg');
    oggOk = r === 'probably' || r === 'maybe';
  } catch (e) { oggOk = false; }
  return oggOk;
}

const playableCry = url => !!url && (!/\.ogg(\?|#|$)/i.test(url) || canPlayOgg());

/** Remember the cry for the species now on screen. `meta` is the slim record
    from api.js — it is what the synthesised fallback is built out of. */
export function setCry(url, meta = null) {
  cryMeta = meta || null;
  cryUrl = playableCry(url) ? url : null;
  // Don't even fetch a file this browser can never decode.
  cryAudio = cryUrl ? new Audio(cryUrl) : null;
}

// ---- the synthesised cry ----
// Deterministic, and that is the whole point: a Pokemon whose voice changed
// between taps would be a DIFFERENT Pokemon to a four-year-old. Everything is
// derived from data already cached — the id picks the notes, the base stats
// and the size pick the register and the shape. Two to four notes, square or
// triangle, under 400ms: a GBA cry, not a sample.
const CRY_SCALE = [0, 2, 3, 5, 7, 8, 10, 12];

function statOf(meta, name, dflt) {
  const s = (meta?.stats || []).find(x => x?.stat?.name === name);
  return typeof s?.base_stat === 'number' ? s.base_stat : dflt;
}

export function synthCry(meta) {
  const ctx = getCtx();
  if (!ctx || muted) return;
  const id     = Math.max(1, Math.trunc(meta?.id) || 1);
  const atk    = statOf(meta, 'attack', 60);
  const spd    = statOf(meta, 'speed', 60);
  const weight = meta?.weight || 300;    // hectograms
  const height = meta?.height || 10;     // decimetres
  // Big heavy things growl low; small light things squeak high.
  const bulk  = Math.min(1, (Math.min(weight, 6000) / 6000 + Math.min(height, 40) / 40) / 2);
  const root  = 200 + ((id * 7) % 24) * 12;              // 200..476 Hz, id-specific
  const base  = root * (1 - 0.45 * bulk);
  const notes = 2 + (id % 3);                            // 2..4 notes
  const step  = 0.10 - Math.min(1, spd / 160) * 0.045;   // fast movers chatter
  const wave  = atk <= 55 ? 'triangle' : 'square';       // soft things are softer
  const dir   = (id % 2) ? 1 : -1;                       // half rise, half fall
  const t0    = ctx.currentTime + 0.01;
  liveCryOscs = [];
  for (let i = 0; i < notes; i++) {
    const semis = dir * CRY_SCALE[(id + i * 3) % CRY_SCALE.length];
    const f = Math.max(90, Math.min(2000, base * Math.pow(2, semis / 12)));
    const osc = tone(f, i === notes - 1 ? 'triangle' : wave,
                     step * 1.7, 0.20 - i * 0.02, t0 + i * step, 'cry');
    if (osc) liveCryOscs.push(osc);
  }
}

function emitCry(url, meta) {
  if (muted) return;
  const now = Date.now();
  if (now - lastCryAt < CRY_MIN_GAP_MS) return;   // pet taps outrun the cry
  lastCryAt = now;
  if (!url) { synthCry(meta); return; }
  const el = (url === cryUrl && cryAudio) ? cryAudio : new Audio(url);
  playingCry = el;
  let fellBack = false;
  // A format this browser CLAIMS to play can still 404 or time out. Falling
  // back here is what stops that from being another silent no-op.
  const fallback = () => { if (!fellBack) { fellBack = true; synthCry(meta); } };
  try {
    el.volume = 0.6;
    el.currentTime = 0;
    el.addEventListener('error', fallback, { once: true });
    const p = el.play();
    if (p && p.catch) p.catch(fallback);
  } catch (e) { fallback(); }
}

/** The cry for whatever setCry() last stored — the dex CRY button. */
export function playCryAudio() {
  emitCry(cryUrl, cryMeta);
}

/** The cry for ANY species, straight from the API cache. Used by the pet tap,
    which fires on the dex and in a fight and must never wait on a request. */
export function playCryFor(idOrMeta) {
  const meta = (idOrMeta && typeof idOrMeta === 'object')
    ? idOrMeta
    : (cachedPokemon(idOrMeta) || { id: idOrMeta });
  const url = playableCry(meta?.cries?.latest) ? meta.cries.latest : null;
  emitCry(url, meta);
}

// NOTE: Pokedex OS never uses speech synthesis. The game does not talk.
// Meaning is carried by picture, colour and motion - never by a synthesised
// voice. Do not reintroduce SpeechSynthesis here or anywhere else.
export function stopAllAudio() {
  for (const el of [cryAudio, playingCry]) {
    if (el) { try { el.pause(); el.currentTime = 0; } catch (e) { /* noop */ } }
  }
  playingCry = null;
  liveCryOscs.forEach(o => { try { o.stop(); } catch (e) { /* noop */ } });
  liveCryOscs = [];
}

export function triggerVibration(duration = 40) {
  if (!haptics) return;   // one gate, so every existing call site obeys the switch
  try { if (navigator.vibrate) navigator.vibrate(duration); } catch (e) { /* noop */ }
}
