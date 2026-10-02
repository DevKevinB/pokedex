# Pokédex OS — project brief for Claude

Read this first. It is the fastest way to be useful in this repo without breaking
something an eight-year-old is emotionally invested in.

## Who this is for

Two brothers. Everything in this codebase serves them.

- **GABE, 8.** Reads well. Plays the full game: the Verdant Road (12 chapters on the
  58-trainer circuit), rival, guardians, tall grass, dex, versus. He is chasing Champion.
- **ART, 4.** **Pre-reader.** Plays as profile `prereader` in Sprout Road
  (`settings.junior` in the classic app). He is REALLY into Bulbasaur: BULBA is his partner.
  He cannot read the battle log, the move names, or any modal text. If a piece of
  information only exists as words, it does not exist for Art.

The owner is **Kevin** — the boys' dad. He is technically literate but **not a
developer**. Explain terminal commands and anything hard to undo. Never assume
familiarity with git, npm, or build tooling.

**The tiebreaker for every design argument is the boys' fun.** Not correctness,
not authenticity to the real games, not architectural purity. When two good
options conflict, pick the one that makes a 4- and an 8-year-old happier.

## The boys' devices

**Target: latest iPad Pro on the latest iOS**, plus a phone-class screen (Art
plays on a phone too). Consequences that decide real code:

- `dvh` is supported — the `vh` fallbacks are belt-and-braces, keep them but
  don't design around missing `dvh`.
- `navigator.share({files})` works, so a save file can go out via AirDrop.
- **375x667 is a hard requirement**, not a nicety. `test/next-smoke.mjs` enforces
  it for Sprout Road and `npm run scenes` for classic.
- **Safari does not play Ogg Vorbis, and PokeAPI serves cries as `.ogg` only.**
  Anything that plays a cry must feature-detect (`canPlayType('audio/ogg')`)
  and fall back, or it is a silent no-op nobody will ever report.

## Hard product rules

1. **The game does not talk.** No `SpeechSynthesis`, no TTS, no synthesised voice,
   anywhere, ever. This was removed in v18.3.0 and there are permanent guards in
   `test/smoke.mjs` and `test/next-smoke.mjs` that fail the suite if
   `speechSynthesis` is ever used.
   Meaning is carried by **picture, colour and motion**. Chiptune music, sound
   effects and real Pokémon cries from PokeAPI are fine and encouraged.
2. **Junior Mode never punishes.** Art's Pokémon do not faint, his balls do not
   miss, and the game never tells him he failed. Crucially, **it must never
   advertise these accommodations** — he still picks a ball from the drawer, the
   catch rates are simply hidden and always succeed. He should feel skilled.
3. **Never take something away from a child.** No timers on fleeing legendaries,
   no currency they can't afford, no daily streaks to break, no removing a
   Pokémon they already earned.
4. **Saves are sacred.** Two boys' entire collections live in localStorage. Any
   change touching persistence (`next/core/save.js`, `migrate.js`, `validate.js`,
   or `classic/js/state.js`) needs extreme care — data loss here is a real-world
   crisis, not a bug report.

## v20 LAYOUT: READ THIS FIRST (switchover 2026-09-27)

The site root is now a **doorway** (`index.html`, `doorway.js`, `doorway.css`,
`sw.js`) that forwards to **Sprout Road in `next/`**, the clean rewrite. Its
binding contract is **`next/ARCHITECTURE.md`**, and the plan and Kevin's
rulings are in **`ROADMAP-v20.md`**. The classic app moved unchanged to
**`classic/`**. Saves: Sprout Road writes `pokedexos_save_v3` and only ever READS
`pokedexos_save_v2`, merging it in whenever the classic app changes it.

## Architecture

Vanilla JS **ES modules**, **zero build step**, static hosting on GitHub Pages.
There is no bundler, no transpiler, no framework. Files are served as authored.
Do not introduce a build step without asking Kevin — it would put a CI pipeline
in front of a non-developer's weekly push.

```
index.html, doorway.js, doorway.css, sw.js
            the doorway: forwards to next/
next/       SPROUT ROAD (active). Full file map + owners: next/ARCHITECTURE.md
            core/   save v3, migrate, validate, store, api, pace, rng, evo
            scenes/ who, garden, road, battle, dex, team, together, versus, ...
            battle/ createBattle.js (no DOM), rules-pro.js
            ui/h.js build DOM with h(); never interpolate values into innerHTML
                    (a test greps for it)
            audio/  cries with ogg->synth fallback, chiptune
            data/   chapters, gymdata, rival, engine, moves.json
classic/    the v19 app, kept running for old saves (map below)
tools/      release.mjs, check-imports.mjs, bake-moves.mjs,
            forum-*.mjs (backlog ranking: node tools/forum-rank.mjs)
test/       classic + doorway + next smoke suites (next unit tests: next/test/)
```

Classic app, all under `classic/`:

```
index.html          markup only, no logic — all behaviour lives in js/
css/main.css        layout primitives
css/gba.css         GBA theme, junior overrides, responsive breakpoints
js/config.js        MAX_POKEMON=649, APP_VERSION, type chart, awaitOrTap()
js/state.js         save schema v2, players, mons, levels, XP, export/import
js/api.js           PokeAPI v2 + localStorage slim-projection cache
js/dex.js           the main Pokédex screen
js/catch.js         dex-screen catching + ball drawer
js/battle.js        THE HOTSPOT (~2100 lines) — wild, gym and versus battles
                    on one mutable battleState singleton. Most bugs live here.
js/gym.js           gym screens, endurance HP, Poké Center
js/gymdata.js       58 hand-authored trainers across 12 stops, Lv8 → Lv80
js/pc.js            PC Box: collection, search, team management
js/explore.js       habitat exploration
js/progression.js   badges, quests, trainer card
js/settings.js      the gear menu: names, junior toggle, save/export
js/devtools.js      Parent Tools behind a PIN
js/audio.js         cries, beeps, mute. NO SPEECH.
js/music.js         procedural chiptune (square lead + triangle bass)
js/engine.js        DOM-free battle maths (unit-tested)
js/fx.js            sprite life: battle sprite motion and overlays
js/dialog.js        the in-world replacement for alert/confirm/prompt
js/nickname.js      the NAME ME prompt
js/habitatfill.js   generated: every species' home habitat
js/main.js          bootstrap and event wiring
sw.js               service worker: network-first shell, cache-first assets
```

**Save schemas.** Classic: `localStorage['pokedexos_save_v2']` → `{version,
players: {1, 2}}`. Each player: `{name, caught, team, mons, badges, shinies,
nicks, items, quests, gyms, settings, stats}`; `state.js` migrates legacy v1 keys
on load. Sprout Road: `pokedexos_save_v3` (`next/core/save.js`); v2→v3 lives in
`next/core/migrate.js`, and every loaded player passes through
`next/core/validate.js`. Never write a save shape that older code can't read
without checking the migration path.

## Working in this repo

**Release ritual — do all of it, in order:**

1. Make the change.
2. Run `node tools/release.mjs <version> "<title>"` (add `--dry-run` to preview).
   Never bump versions by hand: a stale number means the boys get a stale cached
   app. It bumps `classic/js/config.js` (`APP_VERSION`), `classic/sw.js`
   (`CACHE_VERSION`), the `?v=` strings in `classic/index.html`, `package.json`
   AND `next/sw.js` (`NEXT_CACHE`); refuses to start if they already disagree;
   checks `next/sw.js` lists every Sprout Road module for offline play; adds a
   CHANGELOG stub; runs `npm test`; and prints the git commands to run.
3. Fill in the `CHANGELOG.md` stub, written **for Kevin, not for engineers** —
   describe what the kids will notice.
4. All of `npm test` must pass (release.mjs runs it; rerun after any fix).
5. For anything visual, take a screenshot at **375×667** (small iPhone) and at
   **390×844**, as **both** Gabe and Art (`prereader` profile; Junior mode in
   classic), and actually look at it. Junior Mode has overflowed off-screen
   twice; the tests do not catch everything.

**Running the tests:**

```bash
npm run setup                    # first time only: playwright + chromium
npm run serve &                  # every browser suite expects a server on :8321
npm test                         # import check, engine, classic smoke, next unit,
                                 # next smoke (+ layout net), doorway
npm run test:next                # Sprout Road only: the faster loop
npm run scenes                   # CLASSIC layout harness only
```

The suites **fully mock PokeAPI and the sprite CDN**, so they run with no network
access to those hosts. If you add a feature that fetches something new, add a
route mock for it or the suite will hang.

**Layout nets.** Sprout Road's lives inside `test/next-smoke.mjs`, at 375x667,
390x844 and 1024x1366 (iPad), with screenshots. Classic's is `test/scenes.mjs`:
it walks `/classic` to every screen at 375x667 and 390x844 in both modes and
fails if a button leaves the screen, the Pokeball becomes unreachable in a
fight, or any visible text drops below 8px. Known-but-scheduled classic bugs
live in `test/known-issues.json` so only NEW breakage fails; delete entries as
fixes land. `npm run scenes:update` re-records. Screenshots land in
`test/shots/` — actually look at them.

**Claude automations (`.claude/`).** Two hooks run by themselves:
`hooks/check-imports-after-edit.mjs` re-runs the import checker after any edit
to game JS and reports a broken import at once (fix it before moving on), and
`hooks/guard-save-files.mjs` makes Kevin approve any write to the four save
files. `/ship` (`skills/ship/`) is the whole release ritual; only Kevin starts
it. Reviewers in `agents/`: **`art-advocate`** for anything a player sees or
hears, **`save-guardian`** for anything touching saves or localStorage. Use
them before pushing.

## Conventions

- Kid-facing text is **short, uppercase, and ≤6 words** where possible, and should
  lead with a sprite or an icon. The pixel font is unreadable in long sentences.
  Prereader scenes show no words except names and numbers.
- 8px is the **minimum** font size. Several styles still violate this; don't add more.
- **Waits:** Sprout Road routes every wait over 250ms through `wait()` from
  `next/core/pace.js`; classic routes every battle wait through `awaitOrTap()`
  from `classic/js/config.js`. Never a bare `sleep()`, so a tap can hurry it and
  `?fast=1` can run the suite quickly.
- Prefer the existing overlay/modal system over `alert()`, `confirm()` and
  `prompt()`. Native dialogs are suppressed in iOS standalone PWA mode — they
  return `null` instead of throwing, which fails silently.
- `classic/js/battle.js` (~2100 lines) has a mutable singleton and three battle
  modes sharing it. Read the surrounding function before editing. Async races
  here are the single most common source of real bugs.

## Where the plan lives

- **`ROADMAP-v20.md`** — the current plan and Kevin's 2026-09-26 rulings. Start
  here before proposing work.
- `ROADMAP.md` / `ROADMAP-v19.md` — the finished v19 arc, history only.
- **`COUNCIL-REPORT.md`** — 50 expert audits and 8 debate panels behind the v19
  roadmap. Note the ruling banner at the top: every narration recommendation in
  it is dead.
- **`CHANGELOG.md`** — what shipped, in Kevin's language.

## Ask before you

- Add a build step, a bundler, or a CI pipeline.
- Change either save schema (v2 or v3).
- Rewrite `classic/js/battle.js` wholesale (the roadmap deliberately chose
  targeted guards plus an `engine.js` extraction over a kernel rewrite).
- Add a dependency. There are currently zero runtime dependencies. Keep it that way.
