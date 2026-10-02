#!/usr/bin/env node
// ============================================================
// Claude Code hook — "black screen" guard (runs AFTER every edit)
//
// KEVIN: every time Claude changes a game file, this runs the import
// spell-checker (tools/check-imports.mjs, about 0.15 seconds). If one file now
// asks another for a function that does not exist — the mistake that turns the
// whole game into a black screen, and has nearly shipped three times — Claude
// is told immediately, with the file and line, and fixes it before moving on.
//
// It stays silent when everything is fine. It never blocks you, never touches
// a file, and only looks at the game's own code (classic/ and next/).
//
// Wired up in .claude/settings.json (PostToolUse). Remove it there to turn off.
// ============================================================

import { spawnSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

let input = {};
try {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
} catch { process.exit(0); }   // can't read the event: stay out of the way

const tool = input.tool_name || '';
const ti = input.tool_input || {};

// Is this a change to the game's JavaScript?
const isGameJs = p => {
  if (!p) return false;
  const rel = relative(ROOT, resolve(ROOT, p)).split('\\').join('/');
  return /^(classic|next)\/.*\.(m?js)$/.test(rel) && !/^next\/test\//.test(rel);
};

let relevant = false;
if (tool === 'Bash') {
  // Shell edits (sed -i, heredocs, mv, git checkout ...) can change modules too.
  // Cheap enough to just re-check whenever a command mentions game JS.
  relevant = /(classic|next)\/\S*\.m?js\b/.test(ti.command || '');
} else {
  relevant = isGameJs(ti.file_path || ti.notebook_path);
}
if (!relevant) process.exit(0);

const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'check-imports.mjs')], {
  cwd: ROOT, encoding: 'utf8', timeout: 20000,
});
if (r.status === 0) process.exit(0);

// Exit code 2 on PostToolUse hands stderr back to Claude as feedback.
process.stderr.write(
  'BLACK-SCREEN GUARD: tools/check-imports.mjs failed after this edit.\n' +
  'A module now imports a name that does not exist, so the game would not start.\n' +
  'Fix it before doing anything else:\n' +
  ((r.stderr || '') + (r.stdout || '')).trim() + '\n'
);
process.exit(2);
