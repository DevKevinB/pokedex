---
name: ship
description: Release the current Pokédex OS changes to the boys — version bump via release.mjs, Kevin-language CHANGELOG, full test suite, real screenshots as Gabe AND Art at both phone sizes, reviewer agents, then commit, push, and report the commit SHA. Only Kevin starts this.
disable-model-invocation: true
argument-hint: "[version] [\"TITLE\"]  (both optional; Claude proposes them)"
---

# /ship — get it onto the boys' iPad, safely

Kevin typed `/ship`. That IS his go-ahead to commit and push to `origin/main`
once every gate below is green. It is not permission to skip a gate. If a gate
fails, stop, fix or report, and never push a red build.

Arguments (optional): `$ARGUMENTS`. Normally a version like `20.3.0` and a
title in quotes. If either is missing, propose them yourself (see step 2) and
carry on. Don't stop to ask unless the change is ambiguous.

Talk to Kevin in plain words throughout. He is not a developer. Every few
steps, one short line on where you are ("Tests passed. Looking at Art's
screens now.").

## Gate 0: know what you are shipping

1. `git fetch -q origin && git status -sb`. If local is **behind** origin,
   stop and tell Kevin: another session or device pushed. Fast-forward only if
   the working tree is clean and he agrees.
2. A second Claude session can share this checkout. List exactly which files
   changed (`git status --porcelain`, `git diff --stat`) and make sure every one
   belongs to this change. Anything unexplained gets left out and named in the
   final report. **Never `git add -A` or `git add .`.**
3. If nothing changed, say so and stop.
4. Summarise the change in one sentence for yourself. You will need it for the
   CHANGELOG, the version choice, and the reviewers.

## Gate 1: the version

Read the current version from `package.json`. Choose:
- **patch** (20.2.1 → 20.2.2): a fix only; the boys would not call it new.
- **minor** (20.2.1 → 20.3.0): something either boy will notice or play with.
- **major**: only if Kevin said so.

The title is 1–4 words, uppercase, kid-flavoured, in the style of
`git log --oneline -8` (e.g. `NAME TAGS`, `THE GEAR WORKS`).

Dry run first, then the real thing (release.mjs runs `npm test` itself):

```bash
node tools/release.mjs <version> "<TITLE>" --dry-run
npm run serve >/dev/null 2>&1 &        # browser suites need :8321; harmless if already up
node tools/release.mjs <version> "<TITLE>"
```

If release.mjs says the version anchors **already disagree**, do not hand-edit
blindly. Show Kevin which file says what and fix only the stray one.

If `npm test` fails inside release.mjs, the versions are already bumped. That
is fine. Fix the cause and rerun `npm test` until it is fully green. Paste the
final summary lines, not the whole log.

## Gate 2: the CHANGELOG, in Kevin's language

release.mjs inserted a stub at the top of `CHANGELOG.md`. Replace it, matching
the entries below it:

```markdown
## [20.3.0] - TITLE

### What the boys will notice

**Art**
- ...what Art sees, hears or can now do. Concrete: "Bulba waves when you tap him".

**Gabe**
- ...

### What Kevin will notice
- ...only if there's something for the grown-up (gear panel, saves, setup).
```

Rules: no file names, no function names, no "refactor". Only include a boy's
section if it affects him. A pure fix reads "X used to …; now it …". If the change
is invisible to everyone, write one honest line saying so.

## Gate 3: look at it, as both boys

`npm test` just wrote fresh Sprout Road screenshots to `test/shots/next/`
(`<scene>-375x667.png`, `-390x844.png`, `-1024x1366.png`; Art's prereader
variants usually carry `-pre`). For **every scene this change touches**:

1. Open the **375x667** and **390x844** shots with the Read tool and actually
   look: is anything cut off, overlapping, unreadably small, or showing
   `undefined`/`NaN`? Check the 1024x1366 iPad shot too if the layout changed.
2. Look at **Art's version** of the same scene. Is anything he needs only shown
   as words?
3. If a touched screen has no shot, write a throwaway tour script **inside the
   repo** at `test/_ship_tour.mjs` (gitignored by `test/_*`; scripts outside
   the repo can't import playwright). Seed `localStorage.pokedexos_save_v3`
   via `addInitScript` the way `test/next-smoke.mjs` does, `goto
   http://127.0.0.1:8321/next/?fast=1`, tap `.who-card.p1` (Gabe) or
   `.who-card.p2` (Art), then screenshot. Delete the script when done.
4. Classic-only change? `npm run scenes` and look in `test/shots/` instead.

If emoji render as empty boxes, the headless font is missing: copy
`NotoColorEmoji.ttf` into `~/.fonts` and run `fc-cache -f`. Don't mistake that
for a game bug.

## Gate 4: independent reviewers (in parallel)

Launch in **one message** so they run together:

- **`art-advocate`**: always, for anything a player can see or hear. Give it
  the one-sentence summary, the changed files, and the screenshot paths you
  looked at.
- **`save-guardian`**: whenever the diff touches `next/core/save.js`,
  `migrate.js`, `validate.js`, `store.js`, `classic/js/state.js`, or anything
  that reads or writes `localStorage`.
- For a large battle or engine change, also launch a general code reviewer
  (`feature-dev:code-reviewer`) on the diff.

Treat their findings as claims to verify, not orders. For each one: confirm it
in the code. Fix it if it's real, and say why if it isn't. A confirmed
**BLOCKER** means no push: fix it, re-run `npm test`, and re-check the affected
screenshot.

## Gate 5: commit and push

```bash
git status --porcelain                      # one last look: anything new or unexpected?
git add <each file by name>                 # include CHANGELOG.md and the version files
git commit -F - <<'EOF'
v<version> <TITLE>: <one line a parent would understand>

<2-5 short lines: what changed and why, for Kevin>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
git push origin main
git log --oneline -1 && git status -sb      # must show "## main...origin/main" with nothing ahead
```

Use the attribution line from the current session's system reminder if it
gives a specific model name.

If the push is rejected because origin moved, **do not force-push.** Fetch,
show Kevin what arrived, and rebase only if it's clean and obviously unrelated.

## Gate 6: report to Kevin

Short and plain:

```
SHIPPED v20.3.0 "TITLE"   commit abc1234 → GitHub
• What the boys will notice: <1–2 lines>
• Tests: all passed (N checks)
• Looked at: <scenes> as Gabe and Art, phone + small phone
• Reviewers: art-advocate ✓, save-guardian ✓ (or what they found and how it was fixed)
• The iPad picks it up next time the game is opened with internet
  (close it fully and reopen if it doesn't show).
```

Name anything left out on purpose (e.g. a file from another session).
