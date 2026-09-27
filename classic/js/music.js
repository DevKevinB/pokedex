// ============================================================
// Pokédex OS — chiptune music engine (procedural, Web Audio)
// Square lead + triangle bass step sequencer. No audio files.
// ============================================================

import { isMuted, getCtx, getBus, resumeIfNeeded } from './audio.js';

// v19.5: this file no longer owns a context. audio.js does, and hands out the
// MUSIC bus — which is also where the music/sfx balance now lives.
let ctx = null;
let out = null;          // the shared music GainNode
let current = null;      // { name, track, stepDur, steps, step, nextTime, timer, endTimer }

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
    // v19.5: volumes scaled x2.857 because the notes now pass through the
    // shared MUSIC bus at 0.35. 0.080 x 0.35 = 0.028 — the level the boys
    // hear is UNCHANGED; the bus is simply now the one place to change it.
    bpm: 104, loop: true, leadVol: 0.080, bassVol: 0.129,
    lead: [N.E4, _, N.G4, _, N.B4, _, N.G4, _, N.A4, _, N.Fs4, _, N.D4, _, _, _,
           N.E4, _, N.G4, _, N.B4, _, N.D5, _, N.C5, _, N.B4, _, N.G4, _, _, _],
    bass: [N.E2, _, _, _, N.E2, _, _, _, N.D2, _, _, _, N.D2, _, _, _,
           N.C2, _, _, _, N.C2, _, _, _, N.G2, _, N.B2, _, N.G2, _, _, _]
  },
  battle: {
    bpm: 152, loop: true, leadVol: 0.086, bassVol: 0.143,
    lead: [N.E4, N.E4, _, N.E4, N.G4, _, N.A4, _, N.B4, _, N.A4, N.G4, N.E4, _, N.D4, _,
           N.E4, N.E4, _, N.E4, N.G4, _, N.A4, _, N.C5, _, N.B4, N.A4, N.B4, _, _, _],
    bass: [N.E2, _, N.E2, N.E2, _, N.E2, N.E2, _, N.G2, _, N.G2, N.G2, _, N.G2, N.A2, _,
           N.E2, _, N.E2, N.E2, _, N.E2, N.E2, _, N.C2, _, N.C2, N.C2, N.B1, _, N.B1, _]
  },
  gym: {
    bpm: 168, loop: true, leadVol: 0.091, bassVol: 0.149,
    lead: [N.A4, _, N.A4, N.C5, N.B4, _, N.E4, _, N.A4, _, N.C5, N.E5, N.D5, N.C5, N.B4, _,
           N.G4, _, N.G4, N.B4, N.A4, _, N.E4, _, N.F4, N.G4, N.A4, N.B4, N.C5, _, N.E5, _],
    bass: [N.A2, _, N.A2, N.A2, _, N.A2, N.E2, _, N.A2, _, N.A2, N.A2, _, N.A2, N.G2, _,
           N.F2, _, N.F2, N.F2, _, N.F2, N.C2, _, N.E2, _, N.E2, N.E2, N.E2, _, N.E2, _]
  },
  victory: {
    bpm: 132, loop: false, leadVol: 0.100, bassVol: 0.143,
    lead: [N.G4, _, N.C5, _, N.E5, _, N.G5, N.G5, N.E5, _, N.G5, _, _, _, _, _],
    bass: [N.C2, _, N.C2, _, N.C3, _, N.C2, _, N.G2, _, N.C3, _, _, _, _, _]
  }
};

function ensureCtx() {
  ctx = getCtx();
  out = getBus('music');
  if (!ctx || !out) return false;
  resumeIfNeeded();
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
  gain.connect(out);
  osc.start(when);
  osc.stop(when + dur);
}

// ---- 25ms lookahead scheduler (ROADMAP §4 v19.5) ----
// The old sequencer fired one setInterval tick per 8th note and played that
// note "now". setInterval is a best-effort timer: a confetti burst, a sprite
// decode or an iOS scroll pushed a tick late and the beat visibly limped.
// Now the timer only ever asks "what falls due in the next 120ms?" and books
// those notes against ctx.currentTime — a hardware clock that nothing on the
// main thread can drag.
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;   // seconds of music kept booked in advance

export function playMusic(name) {
  if (!TRACKS[name]) return;
  if (current?.name === name) return;
  stopMusic();
  if (!ensureCtx()) return;

  const t = TRACKS[name];
  const stepDur = 60 / t.bpm / 2; // 8th notes
  const steps = t.lead.length;
  const c = current = {
    name, track: t, stepDur, steps,
    step: 0, nextTime: ctx.currentTime + 0.06, timer: null, endTimer: null
  };

  const pump = () => {
    if (current !== c || !ctx) return;
    // Coming back from a lock screen or a phone call, ctx.currentTime has run
    // on while the throttled timer slept. Without this resync the scheduler
    // would dump every missed note at once — a burst of noise on resume.
    if (c.nextTime < ctx.currentTime - 0.25) c.nextTime = ctx.currentTime + 0.06;

    while (c.nextTime < ctx.currentTime + SCHEDULE_AHEAD) {
      if (!t.loop && c.step >= steps) {
        // A one-shot track is over once its last note is BOOKED, but it must
        // be allowed to ring before `current` is cleared, or playFanfare()
        // would restart the arena theme over the top of its own last chord.
        clearInterval(c.timer);
        c.timer = null;
        c.endTimer = setTimeout(
          () => { if (current === c) stopMusic(); },
          Math.max(0, (c.nextTime - ctx.currentTime) * 1000 + 400));
        return;
      }
      if (!isMuted()) {                 // stay in rhythm, emit nothing
        const lead = t.lead[c.step % steps];
        const bass = t.bass[c.step % steps];
        if (lead) blip(lead, 'square', t.leadVol, stepDur * 0.9, c.nextTime);
        if (bass) blip(bass, 'triangle', t.bassVol, stepDur * 1.6, c.nextTime);
      }
      c.nextTime += stepDur;
      c.step++;
    }
  };

  c.timer = setInterval(pump, LOOKAHEAD_MS);
  pump();
}

export function stopMusic() {
  if (current) {
    clearInterval(current.timer);
    clearTimeout(current.endTimer);
    current = null;
  }
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
