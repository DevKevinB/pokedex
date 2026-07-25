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

export function stopAllAudio() {
  try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (e) { /* noop */ }
  if (cryAudio) { cryAudio.pause(); cryAudio.currentTime = 0; }
  const btn = document.getElementById('voice-btn');
  if (btn) btn.innerHTML = '<span class="btn-icon">🎙️</span> VOICE';
}

export function speak(text, { pitch = 0.5, rate = 0.9, onstart, onend } = {}) {
  if (muted) return;
  try {
    if (!('speechSynthesis' in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.pitch = pitch; utter.rate = rate;
    if (onstart) utter.onstart = onstart;
    if (onend) { utter.onend = onend; utter.onerror = onend; }
    window.speechSynthesis.speak(utter);
  } catch (e) { /* noop */ }
}

export function isSpeaking() {
  try { return 'speechSynthesis' in window && window.speechSynthesis.speaking; } catch (e) { return false; }
}

export function triggerVibration(duration = 40) {
  try { if (navigator.vibrate) navigator.vibrate(duration); } catch (e) { /* noop */ }
}
