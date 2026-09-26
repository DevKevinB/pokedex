// ============================================================
// SPROUT ROAD — chiptune music (procedural, Web Audio).
// Square lead + triangle bass step sequencer, no audio files.
// Ported from ../../js/music.js; borrows audio.js's ONE context
// and its MUSIC bus. New here: garden/road/rest tracks, and a
// per-track gain so a scene can let the music wind down.
// ============================================================

import { isMuted, getCtx, getBus, resumeIfNeeded } from './audio.js';

let ctx = null;
let out = null;          // the shared music bus
let current = null;      // { name, track, stepDur, steps, step, nextTime, timer, endTimer, gain }
let fanfareTimer = null;

const N = {};
(() => {
  const names = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
  for (let oct = 1; oct <= 6; oct++) {
    names.forEach((n, i) => { N[`${n}${oct}`] = 440 * Math.pow(2, (oct * 12 + i - 57) / 12); });
  }
})();
const _ = null; // rest

// [lead(square), bass(triangle)], 8th-note steps. Volumes are pre-bus
// (the music bus sits at 0.35).
const TRACKS = {
  dex: {
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
  },
  // Art's Garden: slow, pentatonic, nothing sharp. Quieter lead.
  garden: {
    bpm: 88, loop: true, leadVol: 0.060, bassVol: 0.110,
    lead: [N.C5, _, N.E5, _, N.G4, _, _, _, N.A4, _, N.G4, _, N.E4, _, _, _,
           N.D4, _, N.E4, _, N.G4, _, N.A4, _, N.G4, _, _, _, _, _, _, _],
    bass: [N.C2, _, _, _, N.G2, _, _, _, N.A2, _, _, _, N.E2, _, _, _,
           N.F2, _, _, _, N.C2, _, _, _, N.G2, _, _, _, N.C2, _, _, _]
  },
  // Gabe's Verdant Road: a walking adventure theme.
  road: {
    bpm: 120, loop: true, leadVol: 0.080, bassVol: 0.129,
    lead: [N.G4, _, N.A4, N.B4, N.D5, _, N.B4, _, N.C5, _, N.B4, N.A4, N.G4, _, _, _,
           N.E4, _, N.G4, N.A4, N.B4, _, N.A4, _, N.G4, _, N.Fs4, _, N.G4, _, _, _],
    bass: [N.G2, _, N.D2, _, N.G2, _, N.D2, _, N.C2, _, N.G2, _, N.C2, _, N.D2, _,
           N.E2, _, N.B1, _, N.E2, _, N.B1, _, N.C2, _, N.D2, _, N.G2, _, N.D2, _]
  },
  // The campfire: very slow, low, sparse. Scenes fade it with stopMusic({fadeMs}).
  rest: {
    bpm: 66, loop: true, leadVol: 0.050, bassVol: 0.100,
    lead: [N.E4, _, _, _, N.G4, _, _, _, N.D4, _, _, _, _, _, _, _,
           N.C4, _, _, _, N.E4, _, _, _, N.G3, _, _, _, _, _, _, _],
    bass: [N.C2, _, _, _, _, _, _, _, N.G1, _, _, _, _, _, _, _,
           N.A1, _, _, _, _, _, _, _, N.C2, _, _, _, _, _, _, _]
  }
};

export const TRACK_NAMES = Object.keys(TRACKS);

function ensureCtx() {
  ctx = getCtx();
  out = getBus('music');
  if (!ctx || !out) return false;
  resumeIfNeeded();
  return true;
}

function blip(dest, freq, type, vol, dur, when) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(vol, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(when);
    osc.stop(when + dur);
  } catch (e) { /* noop */ }
}

// 25ms lookahead scheduler: the timer only asks "what falls due in the next
// 120ms?" and books it against the audio clock, so a busy main thread can't
// make the beat limp.
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;

export function playMusic(name) {
  try {
    if (!TRACKS[name]) return;
    if (current?.name === name && !current.fading) return;
    stopMusic();
    if (!ensureCtx()) return;

    const t = TRACKS[name];
    const stepDur = 60 / t.bpm / 2;
    const steps = t.lead.length;
    const gain = ctx.createGain();
    gain.gain.value = 1;
    gain.connect(out);
    const c = current = {
      name, track: t, stepDur, steps, gain, fading: false,
      step: 0, nextTime: ctx.currentTime + 0.06, timer: null, endTimer: null
    };

    const pump = () => {
      if (current !== c || !ctx) return;
      // Back from a lock screen: don't dump every missed note at once.
      if (c.nextTime < ctx.currentTime - 0.25) c.nextTime = ctx.currentTime + 0.06;
      while (c.nextTime < ctx.currentTime + SCHEDULE_AHEAD) {
        if (!t.loop && c.step >= steps) {
          clearInterval(c.timer);
          c.timer = null;
          c.endTimer = setTimeout(
            () => { if (current === c) stopMusic(); },
            Math.max(0, (c.nextTime - ctx.currentTime) * 1000 + 400));
          return;
        }
        if (!isMuted()) {
          const lead = t.lead[c.step % steps];
          const bass = t.bass[c.step % steps];
          if (lead) blip(c.gain, lead, 'square', t.leadVol, stepDur * 0.9, c.nextTime);
          if (bass) blip(c.gain, bass, 'triangle', t.bassVol, stepDur * 1.6, c.nextTime);
        }
        c.nextTime += stepDur;
        c.step++;
      }
    };

    c.timer = setInterval(pump, LOOKAHEAD_MS);
    pump();
  } catch (e) { /* music must never break a scene */ }
}

/** Stop the current track. { fadeMs } lets it wind down (the Rest scene). */
export function stopMusic({ fadeMs = 0 } = {}) {
  clearTimeout(fanfareTimer); fanfareTimer = null;
  const c = current;
  if (!c) return;
  current = null;
  clearTimeout(c.endTimer);
  const kill = () => {
    clearInterval(c.timer);
    try { c.gain.disconnect(); } catch (e) { /* noop */ }
  };
  if (fadeMs > 0 && ctx) {
    // Keep booking notes while the gain ramps down, then cut.
    current = c; c.fading = true;
    try {
      const now = ctx.currentTime;
      c.gain.gain.cancelScheduledValues(now);
      c.gain.gain.setValueAtTime(c.gain.gain.value, now);
      c.gain.gain.linearRampToValueAtTime(0.0001, now + fadeMs / 1000);
    } catch (e) { /* noop */ }
    c.endTimer = setTimeout(() => { if (current === c) current = null; kill(); }, fadeMs + 50);
    return;
  }
  kill();
}

/** The name of the track playing now, or null. */
export function currentTrack() { return current && !current.fading ? current.name : null; }

/** One-shot victory fanfare, then (optionally) resume a theme. */
export function playFanfare(thenTrack) {
  stopMusic();
  playMusic('victory');
  if (thenTrack) {
    const dur = (TRACKS.victory.lead.length * (60 / TRACKS.victory.bpm / 2) + 0.6) * 1000;
    fanfareTimer = setTimeout(() => { fanfareTimer = null; if (!current) playMusic(thenTrack); }, dur);
  }
}
