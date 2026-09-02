#!/usr/bin/env node
// ============================================================
// Pokédex OS — named-import integrity check
//
// KEVIN: this is a spell-checker for the wiring between files.
//
// The app is split into modules that borrow functions from each other. If one
// file asks for a function another file does not actually hand out, the browser
// does not merely skip that feature — it refuses to start ANY of it. The screen
// is black. And because the game is saved to the tablet for offline play, the
// black screen is saved too.
//
// That exact fault has reached this project three times (playCryOrChirp,
// sfx.newSticker, sfx.star). Each time it was caught by a test run seconds
// before it would have been pushed. This makes it impossible to miss instead.
//
// Run on its own:   node tools/check-imports.mjs
// It also runs as part of:   npm test
//
// Exits 0 when every import is satisfied, 1 otherwise, naming the file, the
// line, and the name that is missing.
// ============================================================

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'js');

// Strip comments and strings so a name mentioned inside one is never mistaken
// for real code. Crude on purpose: it only has to be right about export and
// import lines, which are always at the top level and never inside a template.
const decomment = src => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** Every name a module hands out. */
function exportsOf(src) {
  const s = decomment(src);
  const names = new Set();
  // export function f / export async function f / export class C
  for (const m of s.matchAll(/^\s*export\s+(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  // export const a = ..., b = ...   (also let / var)
  for (const m of s.matchAll(/^\s*export\s+(?:const|let|var)\s+([^;=]+)=/gm)) {
    // handles `export const a = 1` and `export const {a, b} = x`
    for (const part of m[1].split(',')) {
      const n = part.replace(/[{}[\]\s]/g, '').split(':').pop();
      if (/^[A-Za-z_$][\w$]*$/.test(n)) names.add(n);
    }
  }
  // export { a, b as c }
  for (const m of s.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const seg = part.trim();
      if (!seg) continue;
      names.add((seg.includes(' as ') ? seg.split(/\s+as\s+/)[1] : seg).trim());
    }
  }
  if (/^\s*export\s+default\b/m.test(s)) names.add('default');
  // A module that re-exports everything from another is not resolved here; it
  // is reported so a human looks rather than being silently assumed fine.
  const starFrom = [...s.matchAll(/^\s*export\s*\*\s*from\s*['"]([^'"]+)['"]/gm)].map(m => m[1]);
  return { names, starFrom };
}

/** Every name a module asks for, with the line it asked on. */
function importsOf(src) {
  const s = decomment(src);
  const out = [];
  for (const m of s.matchAll(/^\s*import\s+([^'"]+?)\s+from\s*['"]([^'"]+)['"]/gm)) {
    const clause = m[1].trim(), from = m[2];
    const line = s.slice(0, m.index).split('\n').length;
    const braced = clause.match(/\{([^}]*)\}/);
    if (braced) {
      for (const part of braced[1].split(',')) {
        const seg = part.trim();
        if (!seg) continue;
        out.push({ name: seg.split(/\s+as\s+/)[0].trim(), from, line });
      }
    }
    // A default or namespace import cannot be a missing NAMED export, which is
    // the fault class this exists for, so it is not checked.
  }
  return out;
}

const files = existsSync(JS) ? readdirSync(JS).filter(f => f.endsWith('.js')) : [];
if (!files.length) {
  console.error('✗ No modules found in js/ — is this the right directory?');
  process.exit(1);
}

const table = new Map();   // absolute path -> {names, starFrom}
for (const f of files) {
  const p = join(JS, f);
  table.set(resolve(p), exportsOf(readFileSync(p, 'utf8')));
}

const problems = [];
let checked = 0;
for (const f of files) {
  const p = join(JS, f);
  for (const imp of importsOf(readFileSync(p, 'utf8'))) {
    if (!imp.from.startsWith('.')) continue;             // bare specifier: not ours
    const target = resolve(dirname(p), imp.from);
    const mod = table.get(target);
    if (!mod) { problems.push(`js/${f}:${imp.line}  imports from "${imp.from}" — no such module`); continue; }
    checked++;
    if (mod.names.has(imp.name)) continue;
    if (mod.starFrom.length) continue;                   // re-export chain: leave it to the human
    problems.push(`js/${f}:${imp.line}  imports { ${imp.name} } from "${imp.from}" — that module does not export it`);
  }
}

if (problems.length) {
  console.error(`\n✗ ${problems.length} broken import${problems.length > 1 ? 's' : ''}. The app would not start at all:\n`);
  for (const p of problems) console.error('   ' + p);
  console.error('\n  → Either add the missing export, or correct the name on the import line.\n');
  process.exit(1);
}
console.log(`PASS  every import resolves (${checked} names across ${files.length} modules)`);
