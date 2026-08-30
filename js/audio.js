// ============================================================
// Pokédex OS — audio engine (procedural Web Audio + cries + TTS)
// ============================================================

let audioCtx = null;
let cryAudio = null;

// ---- global mute: silences music, sfx, cries, AND speech ----
let muted = false;
try { muted = localStorage.getItem('pokedexos_muted') === '1'; } catch (e) { /* noop */ }

export function isMuted() { return muted; }

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('pokedexos_muted', muted ? '1' : '0'); } catch (e) { /* noop */ }
  if (muted) stopAllAudio();
  return muted;
}

export function initAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { console.warn('Audio Context blocked.'); }
}

export function playBeep(freq, type, duration, vol = 0.1) {
  if (!audioCtx || muted) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) { /* noop */ }
}

export const sfx = {
  shake:    () => playBeep(150, 'square', 0.1, 0.2),
  catch:    () => { playBeep(600, 'sine', 0.1); setTimeout(() => playBeep(800, 'sine', 0.3), 100); },
  break:    () => playBeep(100, 'sawtooth', 0.4, 0.3),
  hit:      () => playBeep(200, 'sawtooth', 0.1, 0.3),
  superHit: () => playBeep(400, 'square', 0.15, 0.3),
  suck:     () => playBeep(400, 'sine', 0.3)
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
  dark:     () => chord([[150, 'triangle', 0.16, 0.16], [100, 'triangle', 0.20, 0.14, 90]]),
  fairy:    () => chord([[880, 'sine', 0.07, 0.11], [1320, 'sine', 0.09, 0.09, 60], [1760, 'sine', 0.11, 0.07, 120]])
};

export function setCry(url) {
  cryAudio = url ? new Audio(url) : null;
}

export function playCryAudio() {
  if (muted) return;
  if (cryAudio) {
    cryAudio.volume = 0.5;
    cryAudio.play().catch(() => console.warn('Audio Blocked'));
  }
}

// NOTE: Pokedex OS never uses speech synthesis. The game does not talk.
// Meaning is carried by picture, colour and motion - never by a synthesised
// voice. Do not reintroduce SpeechSynthesis here or anywhere else.
export function stopAllAudio() {
  if (cryAudio) { cryAudio.pause(); cryAudio.currentTime = 0; }
}

export function triggerVibration(duration = 40) {
  try { if (navigator.vibrate) navigator.vibrate(duration); } catch (e) { /* noop */ }
}
