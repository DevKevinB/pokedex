#!/usr/bin/env node
// ============================================================
// Claude Code hook — "saves are sacred" guard (runs BEFORE an edit)
//
// KEVIN: Gabe's and Art's whole collections depend on four files. Before
// Claude changes any of them, this stops and asks YOU first — even when you
// have told Claude to work on its own. You will see a yes/no prompt with the
// file name and a reminder of what is at stake. Saying no is always safe.
//
// Reading these files is never interrupted; only changing them is.
//
// Wired up in .claude/settings.json (PreToolUse). Remove it there to turn off.
// ============================================================

import { relative, resolve } from 'node:path';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// The files that read, convert, or clean a saved game.
const SAVE_FILES = {
  'next/core/save.js':     'Sprout Road save v3: load, persist, export, import',
  'next/core/migrate.js':  'turns an old classic (v2) save into a Sprout Road (v3) save',
  'next/core/validate.js': 'cleans every player loaded from a save; a bug here can drop Pokemon',
  'classic/js/state.js':   'the classic app save (v2), still read by Sprout Road',
};

let input = {};
try {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
} catch { process.exit(0); }

const tool = input.tool_name || '';
const ti = input.tool_input || {};
const rel = p => relative(ROOT, resolve(ROOT, p)).split('\\').join('/');

let hits = [];
if (tool === 'Bash') {
  const cmd = ti.command || '';
  // Only commands that could WRITE one of the files: a redirect or tee INTO it,
  // or sed -i / perl -i / mv / cp / rm / truncate / git checkout|restore in the
  // same command. Plain cat, grep, sed -n and `2>/dev/null` all pass untouched.
  const editsInPlace = /(\bsed\b[^|;&]*\s-i|\bperl\b[^|;&]*\s-[a-z]*i|\bmv\b|\bcp\b|\brm\b|\btruncate\b|\bgit\s+(checkout|restore)\b)/.test(cmd);
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  hits = Object.keys(SAVE_FILES).filter(f => {
    const tail = f.split('/').slice(-2).join('/');          // e.g. core/save.js
    if (!cmd.includes(tail)) return false;
    const redirectInto = new RegExp(`(>>?|\\btee\\b(\\s+-a)?)\\s*["']?\\S*${esc(tail)}`).test(cmd);
    return redirectInto || editsInPlace;
  });
} else {
  const p = ti.file_path || ti.notebook_path;
  if (p && SAVE_FILES[rel(p)]) hits = [rel(p)];
}
if (!hits.length) process.exit(0);

const why = hits.map(f => `  • ${f}: ${SAVE_FILES[f]}`).join('\n');
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'ask',
    permissionDecisionReason:
      `SAVE FILE: this change touches the code that holds Gabe's and Art's collections.\n${why}\n` +
      `Approve only if you expected a save change. Claude should run npm test and the save-guardian review after it.`,
  },
}));
process.exit(0);
