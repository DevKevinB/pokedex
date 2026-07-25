// ============================================================
// Pokédex OS — chiptune music engine (procedural, Web Audio)
// Square lead + triangle bass step sequencer. No audio files.
// ============================================================

import { isMuted } from './audio.js';

let ctx = null;
let masterGain = null;
let current = null;      // { name, timer, step }

const N = {}; // note name → frequency
(() => {
  const names = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
  for (let oct = 1; oct <= 6; oct++) {
    names.forEach((n, i) => { N[`${n}${oct}`] = 440 * Math.pow(2, (oct * 12 + i - 57) / 12); });
  }
})();
const _ = null; // rest

// ---- Tracks: [lead(square), bass(triangle)] arrays, 8th-note steps ----
const TRACKS = {
  dex: {
    bpm: 104, loop: true, leadVol: 0.028, bassVol: 0.045,
    lead: [N.E4, _, N.G4, _, N.B4, _, N.G4, _, N.A4, _, N.Fs4, _, N.D4, _, _, _,
           N.E4, _, N.G4, _, N.B4, _, N.D5, _, N.C5, _, N.B4, _, N.G4, _, _, _],
    bass: [N.E2, _, _, _, N.E2, _, _, _, N.D2, _, _, _, N.D2, _, _, _,
           N.C2, _, _, _, N.C2, _, _, _, N.G2, _, N.B2, _, N.G2, _, _, _]
  },
  battle: {
    bpm: 152, loop: true, leadVol: 0.03, bassVol: 0.05,
    lead: [N.E4, N.E4, _, N.E4, N.G4, _, N.A4, _, N.B4, _, N.A4, N.G4, N.E4, _, N.D4, _,
           N.E4, N.E4, _, N.E4, N.G4, _, N.A4, _, N.C5, _, N.B4, N.A4, N.B4, _, _, _],
    bass: [N.E2, _, N.E2, N.E2, _, N.E2, N.E2, _, N.G2, _, N.G2, N.G2, _, N.G2, N.A2, _,
           N.E2, _, N.E2, N.E2, _, N.E2, N.E2, _, N.C2, _, N.C2, N.C2, N.B1, _, N.B1, _]
  },
  victory: {
    bpm: 132, loop: false, leadVol: 0.035, bassVol: 0.05,
    lead: [N.G4, _, N.C5, _, N.E5, _, N.G5, N.G5, N.E5, _, N.G5, _, _, _, _, _],
    bass: [N.C2, _, N.C2, _, N.C3, _, N.C2, _, N.G2, _, N.C3, _, _, _, _, _]
  }
};

function ensureCtx() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 1;
      masterGain.connect(ctx.destination);
    } catch (e) { return false; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return true;
}

function blip(freq, type, vol, dur, when) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  gain.gain.setValueAtTime(vol, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(when);
  osc.stop(when + dur);
}

export function playMusic(name) {
  if (!TRACKS[name]) return;
  if (current?.name === name) return;
  stopMusic();
  if (!ensureCtx()) return;

  const t = TRACKS[name];
  const stepDur = 60 / t.bpm / 2; // 8th notes
  const steps = t.lead.length;
  let step = 0;

  const timer = setInterval(() => {
    if (isMuted()) { step++; return; }  // stay in rhythm, emit nothing
    const when = ctx.currentTime + 0.03;
    const lead = t.lead[step % steps];
    const bass = t.bass[step % steps];
    if (lead) blip(lead, 'square', t.leadVol, stepDur * 0.9, when);
    if (bass) blip(bass, 'triangle', t.bassVol, stepDur * 1.6, when);
    step++;
    if (!t.loop && step >= steps) stopMusic();
  }, stepDur * 1000);

  current = { name, timer, step };
}

export function stopMusic() {
  if (current) { clearInterval(current.timer); current = null; }
}

// one-shot fanfare then resume a theme
export function playFanfare(thenTrack) {
  stopMusic();
  playMusic('victory');
  if (thenTrack) {
    const dur = (TRACKS.victory.lead.length * (60 / TRACKS.victory.bpm / 2) + 0.6) * 1000;
    setTimeout(() => { if (!current) playMusic(thenTrack); }, dur);
  }
}
