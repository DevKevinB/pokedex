#!/usr/bin/env node
// ============================================================
// Pokédex OS — release helper
//
// The version number has to be identical in FOUR places or the boys get a
// half-updated app: the browser keeps the old cached files and mixes them with
// new ones. Getting that wrong has been the most common release mistake, so
// this script does it for you and then checks its own work.
//
//   node tools/release.mjs 19.0.0 "The Safety Net"
//   node tools/release.mjs 19.0.0 "The Safety Net" --dry-run   (change nothing)
//   node tools/release.mjs 19.0.0 "The Safety Net" --skip-tests
//
// It never touches git. It prints the git commands for you to run at the end.
// ============================================================

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = f => join(ROOT, f);

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const SKIP_TESTS = args.includes('--skip-tests');
const positional = args.filter(a => !a.startsWith('--'));
const [version, title] = positional;

const say = m => console.log(m);
const die = (what, how) => {
  console.error(`\n✗ ${what}`);
  if (how) console.error(`  → ${how}`);
  process.exit(1);
};

// ---- 1. check the inputs ------------------------------------------------
if (!version || !title) {
  die('Missing the version number or the title.',
      'Run it like this:  node tools/release.mjs 19.0.0 "The Safety Net"');
}
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  die(`"${version}" is not a version number.`,
      'Use three numbers separated by dots, with no "v" in front — for example 19.0.0');
}

const configSrc = readFileSync(p('js/config.js'), 'utf8');
const currentMatch = configSrc.match(/export const APP_VERSION = '([^']+)'/);
if (!currentMatch) {
  die('Could not find APP_VERSION in js/config.js.',
      'The line should look like:  export const APP_VERSION = \'18.11.0\';');
}
const current = currentMatch[1];

// The four places must ALREADY agree before we touch anything. They drifted
// once: an edit bumped three of them and package.json was left a version
// behind, and because this script trusted js/config.js alone it saw "already
// done" and said nothing. A version triple that disagrees is exactly the
// failure this script exists to prevent, so it is now checked on the way IN
// as well as on the way out.
{
  const seen = {
    'sw.js': readFileSync(p('sw.js'), 'utf8').match(/CACHE_VERSION = 'pokedexos-v([^']+)'/)?.[1],
    'package.json': JSON.parse(readFileSync(p('package.json'), 'utf8')).version,
  };
  const htmlV = [...readFileSync(p('index.html'), 'utf8').matchAll(/\?v=([\d.]+)/g)].map(m => m[1]);
  const bad = Object.entries(seen).filter(([, v]) => v !== current)
    .concat(htmlV.every(v => v === current) ? [] : [['index.html', htmlV.join(', ')]]);
  if (bad.length) {
    die(`The version is not the same everywhere right now: js/config.js says ${current}, but ${bad.map(([f, v]) => `${f} says ${v}`).join(' and ')}.`,
        `Set them all to ${current} by hand first, then run this again. All four must agree before a release can start.`);
  }
}

const rank = v => v.split('.').map(Number);
const isNewer = (a, b) => {
  const [x, y, z] = rank(a), [i, j, k] = rank(b);
  return x !== i ? x > i : y !== j ? y > j : z > k;
};
if (!isNewer(version, current)) {
  die(`${version} is not newer than the current version (${current}).`,
      `Pick a higher number, for example ${rank(current)[0]}.${rank(current)[1]}.${rank(current)[2] + 1}`);
}

say(`\nPokédex OS release  ${current}  →  ${version}   "${title}"`);
if (DRY) say('DRY RUN — nothing will be written.\n');
else say('');

// ---- 2. rewrite the version in all four places --------------------------
// Each edit is anchored to the exact surrounding text, never a blind
// search-and-replace, so a stray "18.11.0" elsewhere can't be clobbered.
const edits = [];
const planEdit = (file, find, replace, expected) => {
  const src = readFileSync(p(file), 'utf8');
  const hits = src.split(find).length - 1;
  if (hits !== expected) {
    die(`Expected ${expected} place(s) to update in ${file} but found ${hits}.`,
        `Open ${file} and check it still contains: ${find}`);
  }
  edits.push({ file, src, out: src.split(find).join(replace), hits });
};

planEdit('js/config.js',
  `export const APP_VERSION = '${current}'`,
  `export const APP_VERSION = '${version}'`, 1);
planEdit('sw.js',
  `const CACHE_VERSION = 'pokedexos-v${current}'`,
  `const CACHE_VERSION = 'pokedexos-v${version}'`, 1);
planEdit('index.html', `?v=${current}`, `?v=${version}`, 3);
planEdit('package.json', `"version": "${current}"`, `"version": "${version}"`, 1);

for (const e of edits) say(`  ${DRY ? 'would update' : 'updated'}  ${e.file}  (${e.hits} place${e.hits > 1 ? 's' : ''})`);
if (!DRY) for (const e of edits) writeFileSync(p(e.file), e.out);

// ---- 3. confirm all four now agree --------------------------------------
if (!DRY) {
  const found = {
    'js/config.js': readFileSync(p('js/config.js'), 'utf8').match(/APP_VERSION = '([^']+)'/)?.[1],
    'sw.js': readFileSync(p('sw.js'), 'utf8').match(/CACHE_VERSION = 'pokedexos-v([^']+)'/)?.[1],
    'package.json': JSON.parse(readFileSync(p('package.json'), 'utf8')).version,
  };
  const html = readFileSync(p('index.html'), 'utf8');
  const htmlVersions = [...html.matchAll(/\?v=([\d.]+)/g)].map(m => m[1]);
  const disagree = Object.entries(found).filter(([, v]) => v !== version)
    .concat(htmlVersions.every(v => v === version) ? [] : [['index.html', htmlVersions.join(', ')]]);
  if (disagree.length) {
    die(`The version does not match everywhere: ${disagree.map(([f, v]) => `${f}=${v}`).join(', ')}`,
        'Fix those by hand, then run this script again.');
  }
  say(`\n  ✓ all four places now say ${version}`);
}

// ---- 4. the service worker must list every file -------------------------
// A file missing from SHELL_FILES means the boys get a stale copy of it when
// the tablet is offline — the hardest kind of bug to notice or explain.
const swSrc = readFileSync(p('sw.js'), 'utf8');
const shellBlock = swSrc.match(/const SHELL_FILES = \[([\s\S]*?)\]/)?.[1] ?? '';
const listed = new Set([...shellBlock.matchAll(/'([^']+)'/g)].map(m => m[1].replace(/^\.\//, '').split('?')[0]));
const onDisk = [];
for (const dir of ['js', 'data', 'fonts']) {
  if (!existsSync(p(dir))) continue;
  for (const f of readdirSync(p(dir))) if (!f.startsWith('.')) onDisk.push(`${dir}/${f}`);
}
const missing = onDisk.filter(f => !listed.has(f));
if (missing.length) {
  say(`\n  ⚠ WARNING — these files are not listed in SHELL_FILES in sw.js:`);
  for (const f of missing) say(`      ${f}`);
  say('    Offline, the boys would get a stale copy of them. Add them to that list.');
} else {
  say(`  ✓ sw.js lists all ${onDisk.length} app files`);
}

// ---- 5. start the changelog entry ---------------------------------------
const CHANGELOG_STUB = `## [${version}] - ${title.toUpperCase()}

<!-- Kevin: describe what the boys will NOTICE, not what changed in the code.
     Delete this comment when you're done. -->

### Added
-

### Fixed
-

`;
const clPath = p('CHANGELOG.md');
const cl = readFileSync(clPath, 'utf8');
if (cl.includes(`## [${version}]`)) {
  say(`\n  · CHANGELOG.md already has a ${version} entry — left alone`);
} else {
  const anchor = cl.indexOf('## [');
  if (anchor === -1) die('Could not find any "## [" entry in CHANGELOG.md.', 'Add the entry by hand.');
  if (!DRY) writeFileSync(clPath, cl.slice(0, anchor) + CHANGELOG_STUB + cl.slice(anchor));
  say(`\n  ${DRY ? 'would add' : 'added'}  CHANGELOG.md entry for ${version} — fill it in before pushing`);
}

// ---- 6. run the tests ---------------------------------------------------
if (SKIP_TESTS) {
  say('\n  · tests skipped (--skip-tests)');
} else if (DRY) {
  say('\n  · tests not run (--dry-run)');
} else {
  say('\nRunning the test suite (this needs a server on port 8321)...\n');
  const r = spawnSync('npm', ['test'], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    die('The tests did not pass, so this release is not ready.',
        'Read the failures above. The version numbers have already been bumped; fix the problem and run "npm test" again.');
  }
  say('\n  ✓ all tests passed');
}

// ---- 7. tell Kevin what to do next --------------------------------------
if (DRY) {
  say('\nDry run finished. Nothing was written.\n');
  process.exit(0);
}
say(`
────────────────────────────────────────────────────────
Version ${version} is ready. Two things left:

1. Open CHANGELOG.md and write the ${version} entry — say what
   Gabe and Art will notice, in your own words.

2. Then run these three commands, one at a time:

   git add -A
       (gathers up every file you changed)

   git commit -m "v${version} ${title}"
       (saves them together with that message)

   git push
       (sends it to GitHub — the boys get it next time
        they open the app)

If something goes wrong after you push, tell Claude the
version number and it can undo that one commit.
────────────────────────────────────────────────────────
`);
