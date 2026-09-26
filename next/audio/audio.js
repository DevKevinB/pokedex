// ============================================================
// SPROUT ROAD — audio: ONE AudioContext, three buses, synth sfx,
// real cries where the browser can play them, a made-up chirp
// where it can't. Ported from ../../js/audio.js.
//
// The game does NOT talk. No SpeechSynthesis, no TTS, ever.
// No haptics either (navigator.vibrate does nothing on iOS).
// ============================================================

let audioCtx = null;
let buses = null;                   // { music, sfx, cry }
const BUS_GAIN = { music: 0.35, sfx: 1.0, cry: 0.6 };
const MUTE_KEY = 'pokedexos_next_muted';
const CRY_BASE = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest';

let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* noop */ }

let everUnlocked = false;           // a real gesture has happened at least once

export function getCtx() {
  if (audioCtx) return audioCtx;
  try {
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    audioCtx = new AC();
    buses = {};
    for (const name of Object.keys(BUS_GAIN)) {
      const g = audioCtx.createGain();
      g.gain.value = muted ? 0 : BUS_GAIN[name];
      g.connect(audioCtx.destination);
      buses[name] = g;
    }
  } catch (e) {
    audioCtx = null; buses = null;
  }
  return audioCtx;
}

/** The GainNode a sound should connect to, or null if audio is unavailable. */
export function getBus(name = 'sfx') {
  return (getCtx() && buses) ? (buses[name] || buses.sfx) : null;
}

/** True only once the context exists AND is running. Never creates it. */
export function audioUnlocked() {
  return !!audioCtx && audioCtx.state === 'running';
}

export function resumeIfNeeded() {
  const ctx = getCtx();
  if (!ctx) return;
  // iOS hands a context back in 'interrupted' after a phone call; it never
  // clears on its own, so any non-running state gets a resume.
  if (ctx.state !== 'running') { try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* noop */ } }
}

/** Call on the first pointerdown (and it is safe on every one after).
 *  Creates/resumes the single AudioContext inside the user gesture. */
export function unlock() {
  try {
    // iOS: 'playback' so the ring/silent switch does not mute the game.
    if (typeof navigator !== 'undefined' && navigator.audioSession) {
      try { navigator.audioSession.type = 'playback'; } catch (e) { /* noop */ }
    }
    const ctx = getCtx();
    if (!ctx) return;
    resumeIfNeeded();
    if (!everUnlocked) {
      everUnlocked = true;
      // Older WebKit only unlocks once a buffer has actually been started
      // inside the gesture. One silent sample does it.
      try {
        const b = ctx.createBuffer(1, 1, 22050);
        const s = ctx.createBufferSource();
        s.buffer = b; s.connect(ctx.destination); s.start(0);
      } catch (e) { /* noop */ }
    }
  } catch (e) { /* never throws */ }
}

// Belt and braces: the integrator calls unlock() on the first pointerdown, but
// WebKit only counts some events as a gesture, so listen to all three. Each
// call is cheap and idempotent.
if (typeof document !== 'undefined') {
  for (const evt of ['pointerdown', 'touchend', 'click']) {
    document.addEventListener(evt, unlock, { capture: true, passive: true });
  }
}

// Backgrounded -> suspend (saves battery, stops the sequencer drifting);
// foregrounded -> resume, but only if a gesture already unlocked us.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!audioCtx) return;
    try {
      if (document.hidden) { const p = audioCtx.suspend(); if (p && p.catch) p.catch(() => {}); }
      else if (everUnlocked) resumeIfNeeded();
    } catch (e) { /* noop */ }
  });
}

// ---- mute: music + sfx + cries, persisted per DEVICE (never in the save) ----
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
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* noop */ }
  applyMuteToBuses();
  if (muted) stopAllAudio();
  return muted;
}

// ---- the one primitive: a note, on a bus, at a time ----
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

// A pitch glide (whoosh, sweep), same guards as tone().
function sweep(f0, f1, type, duration, vol, delayMs = 0) {
  const ctx = getCtx();
  const out = getBus('sfx');
  if (!ctx || !out || muted) return;
  try {
    const at = ctx.currentTime + delayMs / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + duration);
    gain.gain.setValueAtTime(vol, at);
    gain.gain.exponentialRampToValueAtTime(0.01, at + duration);
    osc.connect(gain); gain.connect(out);
    osc.start(at); osc.stop(at + duration);
  } catch (e) { /* noop */ }
}

// Notes are [freq, wave, seconds, volume, delayMs]. Delays are booked on the
// audio clock, so a busy main thread can't smear a chord.
function chord(notes) {
  const ctx = getCtx();
  if (!ctx || muted) return;
  const t0 = ctx.currentTime;
  for (const [f, w, d, v, at] of notes) tone(f, w, d, v, at ? t0 + at / 1000 : 0);
}

const beep = (f, w, d, v = 0.1) => { tone(f, w, d, v); };

export const sfx = {
  /** A button being a button. Quiet: it plays on every tap. */
  tap:       () => beep(880, 'square', 0.03, 0.05),
  /** Something sprouts in the Garden: a soft rising pop. */
  grow:      () => chord([[392, 'triangle', 0.08, 0.14], [587, 'triangle', 0.12, 0.12, 60]]),
  /** A petal lands on Bulba's bulb: a tiny high twinkle. */
  petal:     () => chord([[1319, 'sine', 0.07, 0.08], [1760, 'sine', 0.10, 0.06, 50]]),
  /** A hit. eff: 0 (no effect) | 0.25/0.5 (weak) | 1 | 2/4 (super). */
  hit:       (eff = 1) => {
    const e = Number(eff);
    if (e === 0) chord([[140, 'triangle', 0.08, 0.08]]);
    else if (e < 1) chord([[180, 'square', 0.06, 0.12]]);
    else if (e > 1) chord([[400, 'square', 0.10, 0.26], [300, 'sawtooth', 0.14, 0.22, 60], [520, 'square', 0.12, 0.2, 120]]);
    else chord([[200, 'sawtooth', 0.10, 0.26]]);
  },
  crit:      () => chord([[1200, 'square', 0.05, 0.16], [600, 'sawtooth', 0.14, 0.24, 40]]),
  faint:     () => chord([[392, 'square', 0.10, 0.18], [294, 'square', 0.12, 0.16, 90], [196, 'square', 0.30, 0.16, 190]]),
  ballThrow: () => sweep(300, 900, 'sine', 0.22, 0.12),
  shake:     () => beep(150, 'square', 0.1, 0.2),
  caught:    () => chord([[600, 'sine', 0.1, 0.12], [800, 'sine', 0.3, 0.12, 100], [1200, 'triangle', 0.3, 0.10, 220]]),
  win:       () => chord([[523, 'square', 0.1, 0.16], [659, 'square', 0.1, 0.16, 100], [784, 'square', 0.1, 0.16, 200], [1047, 'square', 0.3, 0.18, 300]]),
  levelUp:   () => chord([[523, 'square', 0.12, 0.22], [659, 'square', 0.12, 0.22, 90], [784, 'square', 0.12, 0.22, 180], [1047, 'square', 0.34, 0.26, 270]]),
  /** A region comes back into colour: a long green arpeggio. */
  bloom:     () => chord([
    [392, 'triangle', 0.16, 0.14], [494, 'triangle', 0.16, 0.14, 120], [587, 'triangle', 0.16, 0.14, 240],
    [784, 'triangle', 0.18, 0.14, 360], [988, 'sine', 0.22, 0.12, 480], [1175, 'sine', 0.5, 0.12, 600]]),
  /** Bulba evolves: rising shimmer, then the landing chord. */
  evolve:    () => {
    for (let i = 0; i < 8; i++) sweep(300 + i * 90, 600 + i * 140, 'sine', 0.12, 0.08, i * 110);
    chord([[523, 'square', 0.4, 0.14, 950], [659, 'square', 0.4, 0.12, 950], [784, 'square', 0.5, 0.14, 950]]);
  },
  /** A leader gets serious: a low rumble falling away. */
  phase2:    () => { sweep(220, 70, 'sawtooth', 0.6, 0.18); chord([[110, 'square', 0.25, 0.14, 300], [82, 'square', 0.4, 0.14, 550]]); },
  /** Soft "not yet" -- NOT a fail buzz. For a pre-reader poking something locked. */
  notYet:    () => chord([[392, 'sine', 0.10, 0.10], [294, 'sine', 0.16, 0.09, 90]]),
  /** Damage count-up tick. step rises in pitch; calm caps it at 6 semitones. */
  count:     (step = 0, calm = false) => {
    const s = Math.max(0, Math.min(calm ? 6 : 14, Math.trunc(step) || 0));
    beep(523 * Math.pow(2, s / 12), 'square', 0.035, calm ? 0.05 : 0.07);
  }
};

// One voice per type, so the move says which move it was without words.
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
  dark:     () => chord([[150, 'triangle', 0.16, 0.16], [100, 'triangle', 0.20, 0.14, 90]]),
  fairy:    () => chord([[880, 'sine', 0.07, 0.11], [1320, 'sine', 0.09, 0.09, 60], [1760, 'sine', 0.11, 0.07, 120]])
};

// Every sfx call is wrapped so a sound can never throw into game code.
for (const k of Object.keys(sfx)) {
  if (typeof sfx[k] === 'function') { const f = sfx[k]; sfx[k] = (...a) => { try { f(...a); } catch (e) { /* noop */ } }; }
}
for (const k of Object.keys(sfx.type)) {
  const f = sfx.type[k]; sfx.type[k] = () => { try { f(); } catch (e) { /* noop */ } };
}

// ============================================================
// CRIES — the real one where it can play, a made-up one where it can't.
// PokeAPI serves cries as .ogg ONLY and Safari plays no Ogg Vorbis, so
// feature-detect and fall back to a synth chirp (a sound effect, not a
// voice). Never route the <audio> through the AudioContext: the files are
// cross-origin without CORS, so the graph would output silence.
// ============================================================
let playingCry = null;
let liveCryOscs = [];
let lastCryAt = 0;
const CRY_MIN_GAP_MS = 400;          // pet taps arrive faster than a cry can finish

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

const CRY_SCALE = [0, 2, 3, 5, 7, 8, 10, 12];

// meta (optional): { baseStats:{atk,spe}, weight, height } or a classic
// PokeAPI record with stats[]. Deterministic by id: the same Pokemon always
// has the same voice.
function statOf(meta, short, long, dflt) {
  const b = meta?.baseStats?.[short];
  if (typeof b === 'number') return b;
  const s = (meta?.stats || []).find(x => x?.stat?.name === long);
  return typeof s?.base_stat === 'number' ? s.base_stat : dflt;
}

export function synthCry(meta) {
  const ctx = getCtx();
  if (!ctx || muted) return;
  const id     = Math.max(1, Math.trunc(meta?.id) || 1);
  const atk    = statOf(meta, 'atk', 'attack', 60);
  const spd    = statOf(meta, 'spe', 'speed', 60);
  const weight = meta?.weight || 300;
  const height = meta?.height || 10;
  const bulk  = Math.min(1, (Math.min(weight, 6000) / 6000 + Math.min(height, 40) / 40) / 2);
  const root  = 200 + ((id * 7) % 24) * 12;
  const base  = root * (1 - 0.45 * bulk);
  const notes = 2 + (id % 3);
  const step  = 0.10 - Math.min(1, spd / 160) * 0.045;
  const wave  = atk <= 55 ? 'triangle' : 'square';
  const dir   = (id % 2) ? 1 : -1;
  const t0    = ctx.currentTime + 0.01;
  liveCryOscs = [];
  for (let i = 0; i < notes; i++) {
    const semis = dir * CRY_SCALE[(id + i * 3) % CRY_SCALE.length];
    const f = Math.max(90, Math.min(2000, base * Math.pow(2, semis / 12)));
    const osc = tone(f, i === notes - 1 ? 'triangle' : wave, step * 1.7, 0.20 - i * 0.02, t0 + i * step, 'cry');
    if (osc) liveCryOscs.push(osc);
  }
}

// Counts cries that actually sounded (past mute and the 400ms floor), so the
// smoke suite can assert "once per encounter" and "zero on mute".
let cryCount = 0;
export const criesEmitted = () => cryCount;

/** Play a species' cry. Real .ogg where this browser can play Ogg, else a
 *  synth chirp. Optional meta shapes the chirp. Never throws. */
export function cry(id, meta = null) {
  try {
    const n = Math.trunc(Number(id));
    if (!(n >= 1 && n <= 20000) || muted) return;
    const now = Date.now();
    if (now - lastCryAt < CRY_MIN_GAP_MS) return;
    lastCryAt = now;
    cryCount++;
    const m = Object.assign({}, meta || {}, { id: n });
    if (!canPlayOgg()) { synthCry(m); return; }
    const el = new Audio(`${CRY_BASE}/${n}.ogg`);
    playingCry = el;
    let fellBack = false;
    // A format the browser CLAIMS to play can still 404 or time out.
    const fallback = () => { if (!fellBack) { fellBack = true; synthCry(m); } };
    try {
      el.volume = 0.6;
      el.addEventListener('error', fallback, { once: true });
      const p = el.play();
      if (p && p.catch) p.catch(fallback);
    } catch (e) { fallback(); }
  } catch (e) { /* never throws */ }
}

/** Silence any cry mid-flight (used by mute and scene changes). */
export function stopAllAudio() {
  if (playingCry) { try { playingCry.pause(); playingCry.currentTime = 0; } catch (e) { /* noop */ } }
  playingCry = null;
  liveCryOscs.forEach(o => { try { o.stop(); } catch (e) { /* noop */ } });
  liveCryOscs = [];
}

// NOTE: SPROUT ROAD never uses speech synthesis. The game does not talk.
// Meaning is carried by picture, colour and motion.
