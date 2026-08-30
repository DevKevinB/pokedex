#!/usr/bin/env node
// ============================================================
// Pokédex OS — tools/bake-moves.mjs
//
// KEVIN, READ THIS BIT.
//
// This is NOT part of the game and it is NOT a build step. It is a little
// errand-runner you run BY HAND on your computer, maybe once or twice a year.
// It asks pokeapi.co about every move from Gens 1-5 and writes what it learns
// into `data/moves.json`. That file is then committed to git like any other
// file in the repo, and the game just reads it. Nothing is compiled, nothing
// is generated at release time, and the boys' tablet never runs this.
//
// To run it, in the project folder:
//
//     node tools/bake-moves.mjs
//
// It takes about a minute and tells you what it did. If your internet drops
// halfway through it writes NOTHING and you simply run it again — it can
// never leave the game with half a file.
//
// WHY IT EXISTS:
// The game used to ask PokeAPI about ten moves every single time a Pokémon
// was sent out — roughly 66 requests for one Champion fight, each one a pause
// in the middle of a battle. Now every answer is already in the app, which
// also means a Pokémon can keep the same four moves forever.
//
// WHAT IT DOES NOT DO: it does not judge moves. EXPLOSION and HYPNOSIS are
// written down like everything else; deciding what a Pokémon is allowed to
// use is js/engine.js's job (usableMoves / clampPower), not this script's.
// ============================================================

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const API = 'https://pokeapi.co/api/v2';
const MAX_MOVE_ID = 559;          // 559 = FUSION BOLT, the last Gen 5 move.
const GENS = new Set(['generation-i', 'generation-ii', 'generation-iii', 'generation-iv', 'generation-v']);
const BATCH = 8;                  // polite: 8 requests in flight, never a stampede
const PAUSE_MS = 120;             // a breath between batches
const RETRIES = 3;
const TIMEOUT_MS = 15000;

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'data', 'moves.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const idFromUrl = u => Number(String(u).split('/').filter(Boolean).pop());

async function getJson(url, label) {
  let last;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      last = e;
      if (attempt < RETRIES) {
        console.log(`\n  … ${label} did not answer (${e.message}) — trying again`);
        await sleep(600 * attempt);
      }
    }
  }
  throw new Error(`gave up on ${label}: ${last && last.message}`);
}

async function main() {
  console.log('Asking pokeapi.co for the list of moves…');
  const index = await getJson(`${API}/move?limit=2000`, 'the move list');
  const wanted = (index.results || []).filter(r => {
    const id = idFromUrl(r.url);
    return Number.isFinite(id) && id >= 1 && id <= MAX_MOVE_ID;
  });
  if (wanted.length < 500) {
    throw new Error(`only ${wanted.length} moves came back for Gens 1-5 — that looks wrong, so nothing was written`);
  }
  console.log(`Found ${wanted.length} moves in Gens 1-5. Fetching each one…`);

  const table = {};
  let skipped = 0;
  for (let i = 0; i < wanted.length; i += BATCH) {
    const rows = await Promise.all(wanted.slice(i, i + BATCH).map(r => getJson(r.url, r.name)));
    for (const d of rows) {
      if (!d || !d.name) { skipped++; continue; }
      if (d.generation && d.generation.name && !GENS.has(d.generation.name)) { skipped++; continue; }
      table[d.name] = {
        p: typeof d.power === 'number' ? d.power : null,
        t: (d.type && d.type.name) || 'normal',
        c: (d.damage_class && d.damage_class.name) || 'status'
      };
    }
    process.stdout.write(`\r  ${Math.min(i + BATCH, wanted.length)} / ${wanted.length}`);
    await sleep(PAUSE_MS);
  }
  process.stdout.write('\n');

  // ---- sanity checks. If any of these fail the answer was junk, so we keep
  // the file we already have rather than shipping a broken one. ----
  const names = Object.keys(table).sort();
  const must = [
    ['thunderbolt', m => m.t === 'electric' && m.p > 0],
    ['tackle', m => m.t === 'normal' && m.p > 0],
    ['hypnosis', m => m.c === 'status' && m.p === null],
    ['explosion', m => m.p > 120]
  ];
  for (const [name, ok] of must) {
    if (!table[name] || !ok(table[name])) throw new Error(`${name.toUpperCase()} came back wrong — nothing was written`);
  }
  if (names.length < 500) throw new Error(`only ${names.length} moves survived — nothing was written`);

  // ---- never quietly take a move away ----
  if (existsSync(OUT)) {
    let before = {};
    try { before = JSON.parse(readFileSync(OUT, 'utf8')); } catch (e) { before = {}; }
    const gone = Object.keys(before).filter(n => !table[n]);
    if (gone.length) {
      console.log(`\n  ⚠ ${gone.length} move(s) are in the old file but not the new one:`);
      console.log(`      ${gone.slice(0, 8).join(', ')}${gone.length > 8 ? '…' : ''}`);
      console.log('    A Pokémon that knows one of those would quietly forget it.');
      console.log('    Look at `git diff data/moves.json` before you commit.');
    }
  }

  // One move per line: still ordinary JSON, but a diff you can actually read.
  const body = names.map(n => `  ${JSON.stringify(n)}: ${JSON.stringify(table[n])}`).join(',\n');
  const json = `{\n${body}\n}\n`;

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, json);

  const kb = (Buffer.byteLength(json) / 1024).toFixed(1);
  console.log(`\n✓ Wrote ${names.length} moves (${kb} KB) to data/moves.json`);
  if (skipped) console.log(`  (${skipped} were outside Gens 1-5 and left out)`);
  console.log('\nNext:');
  console.log('  1. npm test');
  console.log('  2. commit data/moves.json along with the release.');
}

main().catch(e => {
  console.error(`\n✗ ${e.message}`);
  console.error('  Nothing was written — data/moves.json is exactly as it was.');
  console.error('  This is almost always the internet, not you. Try again later.');
  process.exitCode = 1;
});
