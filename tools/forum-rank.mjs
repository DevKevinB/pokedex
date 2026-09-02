#!/usr/bin/env node
// ============================================================
// Pokédex OS — backlog ranking
//
// KEVIN: this decides what gets built next. It reads the backlog and the forum
// threads and prints them in order, most-worth-doing first.
//
//   node tools/forum-rank.mjs            the ranked list
//   node tools/forum-rank.mjs --json     the same thing as data
//   node tools/forum-rank.mjs --top 5
//
// The score is computed fresh every time and never stored. That is deliberate:
// the backlog is an append-only ledger, so re-ranking it after new evidence
// arrives is just running this again, and nothing has to be rewritten.
//
// score = votes × severity × audience × rule ÷ effort
//
//   votes     how many DIFFERENT reviewers ran into it, dampened by log2 so a
//             pile-on cannot bury everything else
//   severity  blocker 8 · major 4 · minor 2 · polish 1
//   audience  ART 1.6 · both 1.4 · GABE 1.2 · Kevin 1.0
//   rule      ×3 if it touches one of the four hard rules in CLAUDE.md
//   effort    1–3 ticks
//
// ART is weighted highest on purpose. He is four and cannot read, so he cannot
// report anything: Gabe says "this is broken", Art just quietly stops playing.
// The 1.6 stands in for feedback that will never arrive, not favouritism.
// ============================================================

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const F = join(ROOT, 'forum');

const SEVERITY = { blocker: 8, major: 4, minor: 2, polish: 1, none: 1 };
const AUDIENCE = { art: 1.6, both: 1.4, gabe: 1.2, kevin: 1.0 };

const readJsonl = f => existsSync(f)
  ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  : [];
const readJson = (f, d) => existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d;

// An append-only ledger: later revs of the same id supersede earlier ones, and
// nothing is ever deleted, so history stays inspectable.
function latest(rows) {
  const by = new Map();
  for (const r of rows) {
    const cur = by.get(r.id);
    if (!cur || (r.rev ?? 0) >= (cur.rev ?? 0)) by.set(r.id, r);
  }
  return [...by.values()];
}

const backlog = latest(readJsonl(join(F, 'backlog.jsonl')));
const ticks = readJsonl(join(F, 'ticks.jsonl'));
const threads = readJson(join(F, 'threads.json'), []).concat(readJson(join(F, 'seeded.json'), []));
const merges = readJson(join(F, 'merges.json'), []);

// A merged duplicate still counts as a vote — that is the whole point of
// recording merges instead of deleting them. Three reviewers independently
// hitting one thing is a stronger signal than one reviewer saying it loudly.
const canonical = new Map();
for (const m of merges) for (const d of m.duplicates || []) canonical.set(d, m.canonical);
const threadById = new Map(threads.map(t => [t.id, t]));

const statusOf = id => {
  const evs = ticks.filter(t => t.item === id);
  if (!evs.length) return 'queued';
  const last = evs[evs.length - 1];
  if (last.event === 'shipped') return 'shipped';
  if (last.event === 'parked' || last.event === 'vetoed') return 'parked';
  if (last.event === 'picked' || last.event === 'built') return 'in-flight';
  return last.event;
};

function score(item) {
  // Distinct PERSONAS, not distinct threads: one reviewer filing three related
  // complaints must not outweigh three reviewers filing one each.
  const people = new Set();
  for (const tid of item.threads || []) {
    const t = threadById.get(canonical.get(tid) || tid) || threadById.get(tid);
    if (t?.persona) people.add(t.persona);
    else if (t) people.add('machine');
  }
  const votes = 1 + 0.5 * Math.log2(1 + people.size);
  const sev = SEVERITY[item.severity] ?? 1;
  const aud = AUDIENCE[item.helps] ?? 1;
  const rule = (item.rule_risk || []).length ? 3 : 1;
  const effort = Math.min(3, Math.max(1, item.effort || 1));
  return {
    score: (votes * sev * aud * rule) / effort,
    voters: people.size, votes, sev, aud, rule, effort,
  };
}

const rows = backlog.map(item => ({ ...item, ...score(item), status: statusOf(item.id) }));

// Two post-score overrides. A blocker or a hard-rule risk is not allowed to sit
// behind a pile of cheap polish just because the polish had more votes.
rows.sort((a, b) => {
  const band = r => (r.severity === 'blocker' || (r.rule_risk || []).length ? 0 : 1);
  return band(a) - band(b) || b.score - a.score;
});

const open = rows.filter(r => r.status === 'queued' || r.status === 'in-flight');

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ranked: rows, open }, null, 1));
  process.exit(0);
}

const topArg = process.argv.indexOf('--top');
const limit = topArg > -1 ? +process.argv[topArg + 1] : rows.length;

if (!rows.length) {
  console.log('The backlog is empty. Run the forum first, then tools/forum-plan.mjs.');
  process.exit(0);
}

const W = { art: 'ART', both: 'BOTH', gabe: 'GABE', kevin: 'DAD' };
console.log(`\n  #   score  who   sev      eff  votes  status      title`);
console.log('  ' + '─'.repeat(86));
rows.slice(0, limit).forEach((r, i) => {
  console.log(
    '  ' + String(i + 1).padStart(2) +
    String(r.score.toFixed(1)).padStart(8) +
    '  ' + (W[r.helps] || '?').padEnd(5) +
    ' ' + (r.severity || '').padEnd(8) +
    ' ' + String(r.effort).padEnd(4) +
    ' ' + String(r.voters).padEnd(6) +
    ' ' + r.status.padEnd(11) +
    ' ' + (r.title || '').slice(0, 60));
});

const shipped = rows.filter(r => r.status === 'shipped').length;
const parked = rows.filter(r => r.status === 'parked').length;
console.log(`\n  ${rows.length} items · ${open.length} open · ${shipped} shipped · ${parked} parked`);

// The counter that keeps thirty autonomous releases honest.
const sinceArt = (() => {
  const ships = ticks.filter(t => t.event === 'shipped');
  let n = 0;
  for (let i = ships.length - 1; i >= 0; i--) {
    const it = backlog.find(b => b.id === ships[i].item);
    if (it?.helps === 'art') return n;
    n++;
  }
  return ships.length;
})();
console.log(`  ticks since an ART item shipped: ${sinceArt}${sinceArt >= 4 ? '   ← the next pick should serve Art' : ''}\n`);
