# Pokédex OS — project brief for Claude

Read this first. It is the fastest way to be useful in this repo without breaking
something a seven-year-old is emotionally invested in.

## Who this is for

Two brothers. Everything in this codebase serves them.

- **GABE, 7.** Reads well. Plays the full game: dex, catching, battles, the 58-trainer
  Gym Circuit, versus mode. He is the one chasing Champion.
- **ART, 4.** **Pre-reader.** Plays in **Junior Mode** (`player().settings.junior`).
  He cannot read the battle log, the move names, or any modal text. If a piece of
  information only exists as words, it does not exist for Art.

The owner is **Kevin** — the boys' dad. He is technically literate but **not a
developer**. Explain terminal commands and anything hard to undo. Never assume
familiarity with git, npm, or build tooling.

**The tiebreaker for every design argument is the boys' fun.** Not correctness,
not authenticity to the real games, not architectural purity. When two good
options conflict, pick the one that makes a 4- and a 7-year-old happier.

## The boys' devices

**Target: latest iPad Pro on the latest iOS**, plus a phone-class screen (Art
plays on a phone too). Consequences that decide real code:

- `dvh` is supported — the `vh` fallbacks are belt-and-braces, keep them but
  don't design around missing `dvh`.
- `navigator.share({files})` works, so a save file can go out via AirDrop.
- **375x667 is a hard requirement**, not a nicety. `npm run scenes` enforces it.
- **Safari does not play Ogg Vorbis, and PokeAPI serves cries as `.ogg` only.**
  Anything that plays a cry must feature-detect (`canPlayType('audio/ogg')`)
  and fall back, or it is a silent no-op nobody will ever report.

## Hard product rules

1. **The game does not talk.** No `SpeechSynthesis`, no TTS, no synthesised voice,
   anywhere, ever. This was removed in v18.3.0 and there is a permanent guard in
   `test/smoke.mjs` that fails the suite if `speechSynthesis.speak` is ever called.
   Meaning is carried by **picture, colour and motion**. Chiptune music, sound
   effects and real Pokémon cries from PokeAPI are fine and encouraged.
2. **Junior Mode never punishes.** Art's Pokémon do not faint, his balls do not
   miss, and the game never tells him he failed. Crucially, **it must never
   advertise these accommodations** — he still picks a ball from the drawer, the
   catch rates are simply hidden and always succeed. He should feel skilled.
3. **Never take something away from a child.** No timers on fleeing legendaries,
   no currency they can't afford, no daily streaks to break, no removing a
   Pokémon they already earned.
4. **Saves are sacred.** Two boys' entire collections live in one localStorage
   key. Any change touching `state.js` persistence needs extreme care — data loss
   here is a real-world crisis, not a bug report.

## Architecture

Vanilla JS **ES modules**, **zero build step**, static hosting on GitHub Pages.
There is no bundler, no transpiler, no framework. Files are served as authored.
Do not introduce a build step without asking Kevin — it would put a CI pipeline
in front of a non-developer's weekly push.

```
index.html      329  markup only, no logic — all behaviour lives in js/
css/main.css    161  layout primitives
css/gba.css     711  GBA theme, junior overrides, responsive breakpoints
js/config.js     65  MAX_POKEMON=649, APP_VERSION, type chart, type colours
js/state.js     210  save schema v2, players, mons, levels, XP, export/import
js/api.js       134  PokeAPI v2 + localStorage slim-projection cache
js/dex.js       203  the main Pokédex screen
js/catch.js     140  dex-screen catching + ball drawer
js/battle.js   1376  THE HOTSPOT — wild, gym and versus battles on one
                     mutable battleState singleton. Most bugs live here.
js/gym.js       154  gym screens, endurance HP, Poké Center
js/gymdata.js   135  58 hand-authored trainers across 12 stops, Lv8 → Lv80
js/pc.js        182  PC Box: collection, search, team management
js/explore.js   145  habitat exploration
js/progression.js 193 badges, quests, trainer card
js/settings.js  151  the gear menu: names, junior toggle, save/export
js/devtools.js  228  Parent Tools behind a PIN
js/audio.js      74  cries, beeps, mute. NO SPEECH.
js/music.js     114  procedural chiptune (square lead + triangle bass)
js/engine.js    198  DOM-free battle maths (unit-tested)
js/dialog.js    127  the in-world replacement for alert/confirm/prompt
js/nickname.js   56  the NAME ME prompt
js/habitatfill.js 57 generated: every species' home habitat
js/main.js      301  bootstrap and event wiring
tools/release.mjs    version bump + checks + the git commands to run
sw.js            72  service worker: network-first shell, cache-first assets
```

**Save schema:** `localStorage['pokedexos_save_v2']` → `{version, players: {1, 2}}`.
Each player: `{name, caught, team, mons, badges, shinies, nicks, items, quests,
gyms, settings, stats}`. `state.js` migrates legacy v1 keys on load. Never write
a save shape that older code can't read without checking the migration path.

## Working in this repo

**Release ritual — do all of it, in order:**

1. Make the change.
2. Bump the version in **three** places or the boys will get a stale cached app:
   `js/config.js` (`APP_VERSION`), `sw.js` (`CACHE_VERSION`), and the three
   `?v=` query strings in `index.html`.
3. Add a `CHANGELOG.md` entry written **for Kevin, not for engineers** — describe
   what the kids will notice.
4. Run the smoke suite (below). All checks must pass.
5. For anything visual, take a screenshot at **375×667** (small iPhone) and at
   **390×844**, in **both** normal and Junior mode, and actually look at it.
   Junior Mode has overflowed off-screen twice; the tests do not catch layout.

**Running the tests:**

```bash
npm install                      # first time only — installs playwright
python3 -m http.server 8321 &    # the suite expects a server on :8321
node test/smoke.mjs              # ~165 checks, exits non-zero on failure
npm run scenes                   # layout harness: 15 screens x 2 sizes x 2 modes
```

The suite **fully mocks PokeAPI and the sprite CDN**, so it runs with no network
access to those hosts. If you add a feature that fetches something new, add a
route mock for it or the suite will hang.

**`test/scenes.mjs` is the layout net.** It walks the real app to every screen at
375x667 and 390x844 in both modes and fails if a button leaves the screen, the
Pokeball becomes unreachable in a fight, or any visible text drops below 8px.
Known-but-scheduled bugs live in `test/known-issues.json` so only NEW breakage
fails; delete entries as fixes land. `UPDATE_KNOWN=1 UPDATE_BASELINE=1 npm run
scenes` re-records. Screenshots land in `test/shots/` — actually look at them.

Every battle wait must go through `awaitOrTap()` from config.js, never `sleep()`,
so a tap can hurry it and `?fast=1` can run the suite quickly.

## Conventions

- Kid-facing text is **short, uppercase, and ≤6 words** where possible, and should
  lead with a sprite or an icon. The pixel font is unreadable in long sentences.
- 8px is the **minimum** font size. Several styles still violate this; don't add more.
- Prefer the existing overlay/modal system over `alert()`, `confirm()` and
  `prompt()`. Native dialogs are suppressed in iOS standalone PWA mode — they
  return `null` instead of throwing, which fails silently.
- `battle.js` is a 979-line file with a mutable singleton and three battle modes
  sharing it. Read the surrounding function before editing. Async races here are
  the single most common source of real bugs.

## Where the plan lives

- **`ROADMAP.md`** — the authoritative 4-week plan. Start here before proposing work.
- **`COUNCIL-REPORT.md`** — 50 expert audits and 8 debate panels behind the roadmap.
  Note the ruling banner at the top: every narration recommendation in it is dead.
- **`CHANGELOG.md`** — what shipped, in Kevin's language.

## Ask before you

- Add a build step, a bundler, or a CI pipeline.
- Change the save schema.
- Rewrite `battle.js` wholesale (the roadmap deliberately chose targeted guards
  plus an `engine.js` extraction over a kernel rewrite).
- Add a dependency. There are currently zero runtime dependencies. Keep it that way.
