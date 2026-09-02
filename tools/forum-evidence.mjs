#!/usr/bin/env node
// ============================================================
// Pokédex OS — evidence baker
//
// KEVIN: this turns a pile of playtest screenshots into a numbered list of
// things that were actually observed, so that when a reviewer says "this is
// broken" they have to point at a specific picture rather than an opinion.
//
//   node tools/forum-evidence.mjs
//
// Reads every test/playtest/*/report.json and writes:
//   forum/evidence.json   every step of every run, with a stable id (E-0001…)
//   forum/seeded.json     threads the MACHINE already found, pre-filed as T-001…
//
// The seeded threads matter: without them, twenty-four reviewers would each
// "discover" the same console error and the genuinely subjective findings would
// be crowded out. Anything the machine can see is filed before anyone looks.
// ============================================================

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = join(ROOT, 'test', 'playtest');
const OUT = join(ROOT, 'forum');
mkdirSync(OUT, { recursive: true });

const pad = (n, w = 4) => String(n).padStart(w, '0');

// Ids must be stable across bakes or every thread's citations rot. Sorting the
// inputs is the whole mechanism: same corpus in, same ids out.
const runDirs = existsSync(RUNS)
  ? readdirSync(RUNS).filter(d => existsSync(join(RUNS, d, 'report.json'))).sort()
  : [];

const evidence = [];
const seeded = [];
let e = 0, t = 0;

const fileOf = run => join(RUNS, run, 'report.json');

for (const run of runDirs) {
  let rep;
  try { rep = JSON.parse(readFileSync(fileOf(run), 'utf8')); }
  catch { continue; }

  // The run's own identity, parsed back out of the directory name the harness
  // built, so evidence can be sliced by mode / size / save profile.
  const mode = run.startsWith('junior') ? 'junior' : 'normal';
  const real = run.includes('-real');
  const vw = /(\d+)x(\d+)/.exec(run)?.[1] ?? '390';
  const seed = ['fresh', 'mid', 'champion', 'hoarder'].find(p => run.endsWith('-' + p)) ?? 'early';

  for (const [scenario, steps] of Object.entries(rep.scenarios || {})) {
    for (const [i, s] of steps.entries()) {
      const id = 'E-' + pad(++e);
      evidence.push({
        id, run, mode, real, vw: +vw, seed, scenario, step: i,
        label: s.label ?? '', shot: s.shot ?? null,
        screen: s.screen ?? null, log: s.log ?? '',
        notes: s.notes ?? [], error: s.error ?? null,
      });

      // --- machine-found defects become threads before any persona sees them
      for (const note of s.notes ?? []) {
        seeded.push({
          id: 'T-' + pad(++t, 3), source: 'machine',
          title: note.split(':')[0].slice(0, 60).trim(),
          body: note,
          evidence: [id],
          kind: 'issue',
          severity: /OFF-SCREEN|UNREACHABLE|BROKEN IMAGE|GREYSCALE/.test(note) ? 'major' : 'minor',
          helps: mode === 'junior' ? 'art' : 'both',
          confidence: 'observed',
          scenario, run, seed,
        });
      }
      if (s.error) {
        seeded.push({
          id: 'T-' + pad(++t, 3), source: 'machine',
          title: `${scenario} could not be played through`,
          body: `The scenario aborted: ${s.error}`,
          evidence: [id], kind: 'issue', severity: 'major',
          helps: mode === 'junior' ? 'art' : 'both', confidence: 'observed',
          scenario, run, seed,
        });
      }
    }
  }

  // Console and page errors are per-run, not per-step. A pageerror is the
  // dead-screen class and is never "minor".
  for (const err of rep.consoleErrors ?? []) {
    // The .ogg cries 404 by design in the harness (Safari plays no Ogg, so the
    // fallback is what is under test). Not a defect; do not file it.
    if (/404/.test(err) && /\.ogg|cries/.test(err)) continue;
    const blocker = !/console:/.test(err);
    seeded.push({
      id: 'T-' + pad(++t, 3), source: 'machine',
      title: blocker ? 'A script error was thrown while playing' : 'A resource failed to load while playing',
      body: err.slice(0, 300),
      evidence: [], kind: 'issue',
      severity: blocker ? 'blocker' : 'minor',
      helps: 'both', confidence: 'observed', run, seed,
    });
  }
}

writeFileSync(join(OUT, 'evidence.json'), JSON.stringify(evidence, null, 1));
writeFileSync(join(OUT, 'seeded.json'), JSON.stringify(seeded, null, 1));

const byRun = {};
for (const ev of evidence) byRun[ev.run] = (byRun[ev.run] || 0) + 1;

console.log(`evidence:  ${evidence.length} steps across ${runDirs.length} runs`);
console.log(`seeded:    ${seeded.length} machine-found threads`
  + ` (${seeded.filter(s => s.severity === 'blocker').length} blocker,`
  + ` ${seeded.filter(s => s.severity === 'major').length} major)`);
console.log('\nby run:');
for (const [r, n] of Object.entries(byRun).sort()) console.log(`  ${String(n).padStart(4)}  ${r}`);
console.log(`\nwrote forum/evidence.json and forum/seeded.json`);
