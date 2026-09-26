# SPROUT ROAD: the v20 pitch and execution plan

*Studio lead's final plan for Pokédex OS. Written for Kevin: plain language, but specific.*
*Baseline: v19.12.0 at commit ca08eed. All file:line references are to that commit.*


> **KEVIN'S RULINGS (2026-09-26), which override anything below:**
> 1. Save v3 is **approved**. 2. **One garden each.** 3. **Leave the art as it is.** Same PokeAPI sprite source, and no change to the GitHub repo or its settings. 4. Nothing else will ever be published on devkevinb.github.io. 5. **No real playtest.** M1 is cut, and no milestone waits on one.
> **Pace:** "way faster than 2 weeks". Milestones ship back to back, Claude runs the loop, and Kevin is asked only about critical decisions or dangerous actions.

---

## 1. The pitch, in one paragraph

**Working title: SPROUT ROAD.**

This is the only Pokémon game where a 4-year-old and an 8-year-old play in the same battle, on the same screen. Art's partner Bulbasaur, **BULBA**, follows him everywhere, makes things grow wherever he taps, gains petals that never go away, and evolves only when Art decides to. Gabe walks a real road of 12 chapters toward a giant Venusaur Tree on the horizon. Every gym he wins brings a withered region back to life, and a rival waits at each turn. Dad sits in on the couch, either as Art's helper or as Gabe's toughest opponent. It is free and loads instantly on the iPad and phone the family already has. It collects no data and has no ads, no accounts and no streaks. It never talks: meaning comes from picture, colour, motion and real Pokémon cries.

**Honest framing.** "Winning the business from Game Freak" is our creative bar, not a commercial plan. The game uses PokeAPI fan sprites (README.md:108: "a non-commercial, educational fan project"), so it stays a **private family build** (Decision 3).

---

## 2. Why the current app won't win (evidence)

| Problem | Evidence | Why it loses |
|---|---|---|
| The home screen is a utility menu, not a place | `dex-375x667-normal.png`: 11+ equal-weight buttons (CRY, SHINY, RNDM, DATA, OWNED, CARD, EXPLORE, GYMS, plus PC/BTL/gear) | No destination and no "what do I do next". It reads like a tool, not a Pokémon game |
| Battles are flat | `battle-wild-375x667-normal.png`: two sprites, bars, four moves, one log line. No damage numbers, no status effects, no turn order | Gabe's verdict: "if my battles stay as boring as now, I'm going back." The adult tester would have it solved in three runs |
| Progress is a list of padlocks | `gyms-375x667-normal.png`: 12 locked tiles plus "0/58". `gym-trainers-*`: five near-identical grey cards | It leads with how much is locked, and there is no journey |
| Art is a guest in a reader's game | `battle-wild-375x667-junior.png` still shows "WILD MON-520 APPEARED!". The junior home screen has 13+ targets, most of them words | CLAUDE.md: "If it only exists as words, it does not exist for Art" |
| No Bulbasaur anywhere | `grep -ri bulba js/` finds nothing | Art's current obsession has no presence in the game |
| Daily quests work like a streak | progression.js:84-210 `ensureDailyQuests` swaps out `p.quests` when the day changes, throwing away half-done progress | Rule 3, "never take something away" |
| The code can't carry a world | battle.js is 2,138 lines on one mutable `battleState` (battle.js:35-58), kept correct by `epoch`/`stale()` (battle.js:62,190). A second singleton `gymRun` (gym.js:22). 61 innerHTML sites, 2,302 lines of gba.css, 31 sub-8px fonts, no scene or entity model | Every feature risks a race, and a map or following Bulbasaur has nowhere to live |
| The safety net is failing now | 12 `*-FLOWFAIL.png` files in test/shots (battle-wild, gym-trainers, card) | We can't rebuild on a harness that is already red |
| **We have never heard from the boys** | CHANGELOG has no quote from Gabe or Art. Every signal comes from synthetic playtests and the council | The biggest hole in this plan. Section 8 puts real sessions on the schedule first |

---

## 3. What we learned

### Market trends (top 5)

| # | Trend | What it means for us | Source |
|---|---|---|---|
| 1 | Restoring a world is now a Pokémon pillar. Pokopia (cozy rebuild-the-world) sold 5M+ in about 4 months and is the franchise's highest-rated game. Bulbasaur is its gardener | The Grove restoration loop and Bulbasaur's **GROW** verb | nintendolife.com (Pokopia 5M); hardcoregamer.com review |
| 2 | Parents play with their kids. 82% of gaming parents do; 73% of kids aged 5–7 want a parent to join | Same-device play together is the headline, not versus as an afterthought | theesa.com 2025 study; gamesbeat.com |
| 3 | Battles are getting faster and easier to read (Legends Z-A, Pokémon Champions on iOS since June 2026) | Damage count-up, type-coloured moves, visible intent. Versus has to feel like a real duel | gamespot.com Z-A review; pokemon.com Champions |
| 4 | Short, gentle sessions (Pokémon Sleep 30M+, Pokémon Friends for kids) | 2–5 minute sessions that leave something to show. No streaks or timed events | pokemonsleep.net; wikipedia Pokémon Friends |
| 5 | Children's privacy rules got stricter (COPPA amendments; compliance due 22 Apr 2026) | "We collect nothing" is our strongest story, backed by a CSP and a network-allowlist test | federalregister.gov 2025-05904; davispolk.com |

### Indie lessons (top 5)

| # | Lesson | Our version | Source |
|---|---|---|---|
| 1 | **Juice in proportion to the moment** (Balatro): scores step forward, pitch rises, big hands catch fire | Damage count-up that scales with the hit. Ordinary hits stay under 400ms | blakecrosley.com Balatro guide; TouchArcade LocalThunk interview |
| 2 | **Co-Star for the youngest** (Mario Galaxy): Miyamoto took away player 2's ability to hurt the run | Art can help but never hurt: berry heal and a perfect-throw assist. No stun | Iwata Asks: Galaxy vol. 4 |
| 3 | **Landmarks, not locked doors** (A Short Hike) | The Venusaur Tree is always on the horizon, and opened barriers become shortcuts | GDC Vault Short Hike postmortem |
| 4 | **Tell the story with objects** (Unpacking) | Chapter lore as optional one-tap objects in the region. It never gates a gym | gamedeveloper.com Unpacking |
| 5 | **Build only what makes you different; borrow the rest** (a warning from Temtem's scope) | We borrow sprites, cries and engine.js, and write only family co-op plus the Grove. No servers | openmon.io comparison |

**We reject:** loot boxes and "one more spin" loops (The Conversation on Vampire Survivors), engine scope creep, and co-op where one player can hurt another. For partner verbs we cite franchise precedents (the Let's Go partner, Pokopia), not Palworld, whose maker is in patent litigation with The Pokémon Company.

---

## 4. The synthetic player panel

Eight agent personas reviewed the first draft. **None of them is a real child.** They pressure-test the design; they don't replace the boys (see M1).

| Persona | Score /10 | Verdict | The one thing they changed |
|---|---|---|---|
| **Gabe, 8** | 7 | "Kind of yes, but if battles stay boring, I'm going back." | **Battles come first.** Count-up, leader boss phases, a **rival**, and a picture-lock on his profile that Art can't get past |
| **Art, 4** (observer's account) | 9 | Yes. Bulba following him "is the whole product" | **The Garden is Art's home screen**, every tap answers within 200ms, and Bulba can never be drafted, lent out or lost |
| **Kevin, dad** | 7 | Loves Family Table; fears "a blank app on Saturday" | **Strangler rollout at `/next/`** with one-tap "go back". Grown-up controls move behind the PIN, plus a gentle wind-down |
| **Competitive and indie veteran** | 5 | "A roguelite costume over a formula." Solved by run 3 | **A separate "Pro Rules" ruleset** in engine.js (status, stat stages, speed and priority, committed intent), used only by adult and opt-in profiles |
| **Paediatric OT and parent** | 6.5 | Conditional: adds overstimulation, no stopping points | **Calm profile + flash budget test + Rest scenes** at the end of each chapter. No "who did more" colours |
| **Game Freak executive** | 6 | "Second meeting, not signing": scope, ripped sprites, canon | **Evolution stays one-way.** Art controls *when*, through an Everstone-style "stay small" choice. The Expedition roguelite is cut. An explicit IP stance |
| **Cozy-collector designer** | 6.5 | Right bets; "three games, no artist" | **Cut to Grove + Road + Bulba**, with a vertical slice first, chapters as JSON, a 12-week pacing curve, and a trickle of new things for Art that doesn't depend on Gabe |
| **iOS Safari PWA engineer** | 6 | Buildable, but Postcard, cries and haptics fail silently on iPad | **CORS sprite pipeline, the iOS audio contract, no haptic promises**, `storage.persist()`, and a canvas-aware layout net |

**Average: 6.6.** The biggest gains came from cutting scope and making Art's input help-only.

---

## 5. The game

### 5.1 Core loops

| Player | Loop (2–15 min) | What he has to show for it |
|---|---|---|
| **Gabe** (profile: `reader`) | Home → **one tap to NEXT BATTLE** on the Road → trainer fight with count-up juice → leader boss phase → badge → region bloom → returning Pokémon to catch → a stronger team for the next chapter | A badge, a region back in colour, new catches, and his shiny shelf |
| **Art** (profile: `prereader`) | Open the app → Bulba runs up and cries → tap Bulba, tap anywhere, and something grows → feed visiting Pokémon a berry (tap berry, tap Pokémon) → catch with the same ball drawer (100% success, still hidden) → Bulba gains petals | A fuller garden, more petals, new visitors |
| **Kevin with the boys** | **PLAY TOGETHER** button on home → pick seats → **Family Table** (Art heals, Gabe battles, Dad takes either seat) or **Couch Versus** (hidden picks behind a Bulbasaur curtain) → Rest scene | A dated **Family Postcard** |
| **Kevin alone** (profile: `adult`) | **Dad's Challenge**: hard rematches of any beaten leader under Pro Rules, with intent icons and a seeded run he can text Gabe ("try MOSSY-714") | A BEAT-DAD / BEAT-GABE ribbon on the card |

### 5.2 Bulbasaur, in two threads

**Thread A: Art's partner BULBA (his alone, and sacred)**

| Feature | Rule |
|---|---|
| Follows him | Hops behind Art's marker on every map screen, sniffs flowers, naps when left alone |
| Affection | Petals on the bulb. The counter **only goes up**, including through export, import and migration |
| Growth | The bulb swells as petals build up. When he's ready a bud glows, and **nothing happens until Art taps it** |
| Evolution | One-way, as in canon. A tappable **Everstone pebble** lets Art "stay small" as long as he likes. After evolving, a baby Bulbasaur visits the Garden forever, so the small one is never "gone" |
| GROW verb | Art's taps make grass, flowers, berry bushes and vine bridges in his Garden |
| Never | Drafted, traded, fainted, released, reset, or moved into anyone else's save |
| Gifts to Gabe | A berry or leaf that Art grew turns up on Gabe's Road wrapped with Bulba's leaf stamp. It is a **bonus, never a gate** |

**Thread B: Gabe's story, "The Verdant Road"**

- The problem is a **drought**. The face of it is a **rival**, a kid who thinks the drought is his fault. He appears between chapters, taunts with a picture of his team, and his levels scale with Gabe's.
- Each of the 12 chapter leaders guards a **seed**. The Champion fight is at the foot of the Venusaur Tree, whose silhouette is visible from chapter 1. Winning makes the whole map bloom.
- **Gabe's own Bulbasaur line:** an "Old Venusaur" guards each restored region. Beating it earns seeds, and the third seed hatches Gabe's *own* Bulbasaur. He has a Grass-type to cut vines solo, so **he never waits on Art**.
- Postgame: through the roots to FARAWAY LAND (kept), ROUND 2 remixed teams, and a final rival rematch.

### 5.3 World

| Element | Design |
|---|---|
| Map | One overworld, 12 regions along one winding road. **Only the next two chapters show**, and the Tree is always on the horizon. No "0/58" |
| Art pipeline (no artist needed) | One pixel tileset **palette-swapped** per region. Blooms are done with colour sweeps, particles and sprites, not bespoke illustration |
| Chapter = one JSON entry | `{region, palette, trainers:[gymdata refs], leaderGimmick, barrierVerb, returningSpecies[3], loreObjects[3]}`. An agent can write one, and it goes through the same validator as a save |
| Barriers | Vines (Grass), streams (Water) and dark caves (Fire). Each one opened becomes a shortcut |
| Groves | **Each boy has his own.** Gabe's regions bloom on his Road, and Art's Garden starts **alive**, never withered. Only the shared Family Postcard combines them, in one blended family green, so there is no territory scoreboard |
| Species | `habitatfill.js` puts all 649 in their home regions |
| Stopping points | Every chapter ends at a **Rest scene**: campfire, Bulba asleep, dusk palette, music winds down. Nothing auto-advances |

### 5.4 Grown-up depth (choices, not grind)

- **Pro Rules** (Dad's Challenge, Couch Versus, and Gabe after Champion as an opt-in badge): 5 status effects, stat stages, speed and priority, accuracy, a curated list of about 30 abilities, and **the 60% single-hit cap removed**. The cap stays for kids' profiles.
- **Committed intent:** the enemy's next action is decided before you act and shown as an icon. Leaders have learnable multi-turn scripts.
- **Move choice:** rematches reward TMs, so Dad builds movesets instead of getting a seeded one.
- **Seeds and deterministic replay**, with a run log stored in the save. No leaderboard.
- Couch Versus supports **Doubles** from M5.

### 5.5 Juice moments (all silent-switch-safe, no haptics)

| Moment | Normal | Calm profile (default when Art is on screen) |
|---|---|---|
| **Count-up** | Rising notes; super-effective catches fire; crits punch. Ordinary hits under 400ms | No punch, pitch capped |
| **Three-wobble catch** | Heartbeat per shake, leaf burst, real cry (m4a on iPad) | Softer burst |
| **Region bloom** | 3-second colour sweep, Pokémon hop home. **Tap to skip** | Art pokes flowers as they pop |
| **Bulba's bud** | Slow glow, silhouette, petal storm | Same |
| **TEAM-UP** (Gabe calls it when Art's leaf-pot is full) | Bulba leaps in; combined Vine Whip with **real bonus damage**; 1-second radial green bloom, **no full-screen flash** | Slower ease |

Every animation over 500ms goes through `awaitOrTap()` and can be skipped with a tap.

---

## 6. Architecture of the rewrite

**Clean rewrite, strangler delivery.** Every module is rewritten from scratch, but the new app ships at **`/next/`** in the same repo, on the same Pages source and the same origin, next to the current app. The GitHub Pages settings do not change. The new app becomes the default only after both boys have played it for a week, and the old one stays at `/classic/` behind a one-tap "go back".

### 6.1 Module map (vanilla ES modules, zero build, zero dependencies)

```
next/
  index.html        shell + meta CSP + import map (the ONE version string) + modulepreload
  core/  store.js  save.js  migrate.js  validate.js  rng.js  input.js  profile.js  net.js
  engine/ engine.js (ported from js/engine.js, 18 tests carry over)  rules-pro.js  ai-intent.js
  battle/ createBattle.js   <- factory: fresh instance per fight, no singleton, no epoch/stale()
  scenes/ garden.js (DOM/CSS)  road.js (canvas)  battle.js (DOM stage + canvas fx)
          family-table.js  couch-versus.js  rest.js  postcard.js
  ui/     h.js (textContent-only DOM builder)  dialog.js  drawer.js  pinpad.js
  audio/  audio.js (single AudioContext, cries, synth fallback)  music.js (ported)
  data/   gymdata.js  habitatfill.js  moves.json (carried as-is)  chapters.json
  fonts/  PressStart2P.woff2 (self-hosted, OFL)
  sw.js
```

| Decision | Why |
|---|---|
| `profile.js` (`reader`/`prereader`/`adult`) | Replaces ~50 scattered `settings.junior` branches |
| `createBattle(mode, profiles)` | Removes the whole class of race bugs that the `battleState` + `epoch` design (battle.js:35-62) exists to guard against |
| Import map carries the version | One line for release.mjs to bump, which ends `?v=` drift between modules |

### 6.2 Rendering

- **Hybrid.** Art's Garden is **DOM/CSS** (real, testable hit targets; one small petal canvas). The Road and battle effects use **one Canvas 2D** layer at a fixed logical resolution with `image-rendering: pixelated`, **DPR capped at 2** (full DPR on an iPad Pro is about 22MB per buffer), at most one offscreen canvas, and the loop **paused on `visibilitychange`/`pagehide`**.
- **Context loss:** on `contextlost` the battle falls back to a plain DOM stage and never blanks mid-fight.
- **Canvas is testable:** a `window.__scene` debug registry exposes entity bounds, so scenes.mjs can check on-screen and 2cm-target rules against canvas entities.
- **Touch hygiene:** `touch-action:none`, `setPointerCapture` per seat zone, safe-area insets, nothing on the home-indicator strip.

### 6.3 State: save v3 and lossless migration (**needs Kevin's approval, Decision 1**)

| Rule | Detail |
|---|---|
| New key | `pokedexos_save_v3`. **`pokedexos_save_v2` is never written again** and stays as a permanent read-only fallback |
| Pure migration | `migrate(v1 \| v2) → v3`, no side effects. Covers v1 keys, the `{p1,p2}` import, v2 CRC export codes, `_prev` undo and `_corrupt_*` quarantine |
| What v3 adds | `profile` (from `settings.junior`), `bulba {petals, bloom, stage, stayStone, visitors[]}`, `road {chapter, regions[], rival}`, `grove`, `wishes[]` (the never-expiring replacement for `quests`), `runs[]`, `lock {face}` |
| Nothing is lost | Every v2 field maps across: `caught, team, mons, badges, shinies, nicks, favorites, items, gyms.beaten, champion, stats`. Unknown keys (hydratePlayer spreads `...raw`, state.js:142) go into **`legacy{}`, stored verbatim but never rendered**. They are kept, not deleted |
| Proof | Round-trip tests on fixtures **plus a real copy of both boys' saves** (kept out of the repo): every caught id, level, shiny, nick, badge and champion record survives |
| Backups | Before the first v3 write, the app auto-exports a v2 backup file. release.mjs refuses to ship a migration change unless the fixture test passes |
| Rollback | `/classic/` still reads v2, which is untouched. Parent Tools → "use old save" re-reads v2 |
| Storage | The API cache moves to **IndexedDB** so it can never crowd out the save (today persist() has to wipe apicache to fit, state.js ~300-307, api.js:7). Call `navigator.storage.persist()` once installed. A picture-led nudge helps Kevin Add to Home Screen, which avoids Safari's 7-day storage wipe |

### 6.4 Audio

- One `AudioContext`, resumed on the first `pointerdown`. `navigator.audioSession.type='playback'` where supported, so the silent switch doesn't mute the game.
- Cries: `canPlayType('audio/ogg')` → PokeAPI .ogg. Otherwise an **m4a** for the Bulbasaur line and the starters (under the IP stance, fetched from a pinned source, not committed; see Decision 3), and otherwise the existing synth chirp.
- The speech guard carries over into the new smoke suite: any `speechSynthesis.speak` call fails the build.
- **No haptics anywhere.** `navigator.vibrate` (audio.js:390) does nothing on iOS, so every "haptic" becomes a visual squash.

### 6.5 Offline and service worker

- A new `next/sw.js` scoped to `/next/`. Shell is network-first with version-keyed caches, and only `resp.ok && type==='basic'` responses are cached.
- Sprites are fetched **in CORS mode with `crossOrigin='anonymous'`** into a **new** cache with an **LRU cap of about 800 entries**. The old opaque `pokedexos-assets` cache (sw.js:90-99) is purged. Without this the Postcard throws SecurityError on existing installs only.
- The Postcard blob is built **before** the share tap (a `share()` call after an `await` loses user activation on Safari). It shares a PNG file, never a URL.
- The root `sw.js` stays live, so installed home-screen apps keep working.

### 6.6 Testing

| Net | What it guards |
|---|---|
| `engine.test.mjs` + new `rules-pro`, `migrate`, `validate` fuzz tests | Maths, migration round-trip, and hostile save payloads |
| `smoke.mjs` (rewritten against the new DOM; mock layer and speech guard kept) | Flows, plus a **network allowlist**: any host outside self, pokeapi.co and the pinned sprite host fails |
| `scenes.mjs` + `__scene` hooks | 375x667 and 390x844 (plus iPad), both profiles. Nothing off-screen, ≥8px text, **targets ≥60px on the phone and ≥76px on the iPad in prereader scenes** (converted from NN/G's 2cm guidance), and **no visible words in prereader scenes** except names and numbers |
| Flash-budget test | ≤3 flashes/s, no full-screen luminance flips, no saturated red, `ease` not `steps()` |
| `playtest.mjs` with `?seed=` + `?fast=1` | Deterministic headless replays of whole chapters |
| Manual WebKit pass on the live URL each milestone | Catches CORS/opaque, audio and share problems that the mocks hide |

---

## 7. Security and privacy by design

### 7.1 The rules

1. **No `innerHTML` with interpolated values.** Every dynamic string goes through `h()` with `textContent`. A grep gate in `npm test` enforces it.
2. **Strict meta CSP**: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://raw.githubusercontent.com data: blob:; connect-src 'self' https://pokeapi.co https://raw.githubusercontent.com; media-src 'self' https://raw.githubusercontent.com blob:; object-src 'none'; base-uri 'none'; form-action 'none'`. A test fails on any `unsafe-*`. Known limits: a meta CSP doesn't cover `sw.js`, and `frame-ancestors` is ignored in meta.
3. **One validator for every save that comes in** (localStorage, paste, file, AirDrop, and agent-written chapter JSON). It uses an allowlist, checks types, clamps numbers, and puts unknown keys in `legacy{}` where they are never rendered.
4. **PokeAPI data is untrusted**; third parties are pinned to a SHA; fonts are self-hosted.
5. **Zero data leaves the device** beyond the allowlisted fetches. No analytics, crash reporting or accounts.
6. **The parent gate protects against children only.** That is the written threat model. No secrets in the bundle, a 5-attempt lockout, gated actions fail closed, and the Junior toggle, paste, import and reset **all sit behind the PIN**, not only a hold gesture (settings.js:45-78,151,175,186).

### 7.2 Fixes for current holes (shipped in v19.13 before any rewrite work)

| Severity | Hole | Where | Fix |
|---|---|---|---|
| HIGH | Stored XSS through an imported save: `stats`/`items` spread through unchecked and rendered with innerHTML | state.js:142-147,148-149,164 → progression.js:430,433,434 | Clamp them to numbers in hydratePlayer, and escape on the card |
| HIGH | No CSP | index.html:1-15 | Add the meta CSP (§7.1.2) |
| HIGH | Project notes are publicly served: `docs/forum*.json`, and `docs/project-status.html` names the boys | `_config.yml` | Add `docs/`, `ROADMAP-v19.md`, `CODESPACES.md` and others to the exclude list. Add a release check that fails on any published file that isn't on the allowlist |
| LOW (by design) | PIN reset code 7391 is public on github.com. Walking it lets you set a new PIN, so it is a real way in, but only for someone who reads the repo | README.md:53, devtools.js:247 | Accepted threat model ("two children who will not view-source"). Revisit only if the repo stays public and the boys start reading GitHub |
| HIGH (future) | The shared `devkevinb.github.io` origin exposes the saves and PIN to any other Pages site Kevin publishes | Pages config | Written rule: publish nothing else on this account's Pages, **or** a custom domain (Decision 4) |
| MED | PokeAPI text in innerHTML | battle.js:633,1958,1962 | Text-only rendering |
| MED | Sprites from a moving `master` branch, cached as opaque responses forever | config.js:34, sw.js:90-99 | Pin to a SHA, CORS mode, LRU cap |
| MED | Google Fonts sends each device's IP to Google | index.html:11-13 | Self-host Press Start 2P |
| MED | `git add -A` in the release script | release.mjs:207-213 | Stage files by name, and list them in plain English |
| LOW | Plaintext PIN, no lockout | devtools.js:215, dialog.js:133-136 | 5-try lockout. Plaintext is fine under the stated threat model |
| LOW | No lockfile | .gitignore:3 | Commit `package-lock.json` (dev-only Playwright) |
| LOW | SECURITY.md is the unedited template | SECURITY.md | Rewrite it as a one-page "we collect nothing" data statement |

### 7.3 GitHub, Pages and process controls

Claude walks Kevin through each setting once, with screenshots. **None of them blocks his own push.**

- Branch protection on `main`: **block force-push and deletion only**, with no required reviews or checks.
- Secret scanning, push protection and Dependabot alerts: on.
- `.claude/settings.json` stays allowlist-only. Agent reports are data, never config. (During this research a subagent's security report tripped the harness's instruction-shaped-text filter; it was treated as a finding, not acted on.)
- A pre-release publish-allowlist check, plus a by-hand `npm run live-check` WebKit pass on the live URL. No CI.

---

## 8. The aggressive roadmap

**Cadence:** a release every 2–3 days, agent-driven, and Kevin runs one command per release. **Every release gate:** smoke green, scenes green at 375x667 and 390x844 in both profiles, the flash-budget test, the network allowlist, screenshots actually looked at, and a CHANGELOG entry written for Kevin.

| Milestone | Days | What ships | What the boys notice | Gate to move on | Cut line if late |
|---|---|---|---|---|---|
| **M0 Safety patch** (v19.13, current app) | 1–4 | Every fix in §7.2, FLOWFAIL harness repaired, `storage.persist()`, Calm toggle, **Bulba says hi** on Art's launch (a quick win in the old app) | Art: "BULBA!" when he opens the app. Gabe: nothing breaks | 0 FLOWFAIL, allowlist test green, **both saves exported** | Bulba greeting slips a release; security fixes never do |
| **M1 Boys playtest #1** | 5–7 | Paper map + clickable Garden prototype. Claude writes Kevin a 20-minute script | Two short sessions | **Real quotes recorded** in `playtests/` (local, not published). Go/no-go on Garden-as-home and TEAM-UP | None. This gate is mandatory |
| **M2 Vertical slice at `/next/`** (v20.0-alpha) | 8–16 | `core/`, `h()`, profiles, `createBattle`, Garden with Bulba following and petals, **Chapter 1 (Boulder, 4 trainers + leader phase)**, one region bloom, count-up, v3 migration **reading v2 read-only** | Art: his Bulba follows him and things grow. Gabe: numbers that catch fire, and a boss that changes mid-fight | Second playtest. Migration round-trip passes on real saves | Leader phase can drop to a plain leader |
| **M3 The Road** (v20.1–20.3) | 17–30 | Chapters 2–12 as JSON, rival, Old Venusaur + Gabe's own Bulbasaur, Rest scenes, shiny shelf, picture-lock | Gabe: a journey to the Tree, a rival, his shinies on pedestals | Each chapter passes scenes + a seeded playtest replay | Leader gimmicks for chapters 9–12 reuse templates |
| **M4 Play Together** (v20.4–20.5) | 31–40 | Family Table: **berry-heal Co-Star first**, then TEAM-UP (Gabe calls it), Couch Versus with the Bulbasaur curtain, Family Postcard (CORS-safe) | "I helped!" (Art). Dad and Gabe duel for real | Real-WebKit `toBlob` test green. Session 3 with the whole family | TEAM-UP ships only if berry-heal tested well |
| **M5 Grown-up layer** (v20.6) | 41–48 | Pro Rules engine, committed intent, Dad's Challenge, seeds + replay, TMs, Doubles | Dad has his own game. Gabe sees a "Pro Rules" badge to chase | Engine unit tests ≥40 | Doubles and abilities past the first 15 |
| **M6 Cutover** (v20.7) | 49–56 | `/next/` becomes the default after **7 days of both boys playing it**. The old app moves to `/classic/` with one-tap back | The new app just opens | Zero save incidents during the week, and Kevin signs off | Stay on `/next/` longer. There is no deadline |
| **M7 Long tail** | weeks 9–12+ | ROUND 2 remixes, Faraway via the roots, Wild Chapters (agent-written JSON), Bulba's affection milestones trickle visitors to Art | Something new each week, never on a timer | Pacing check against the curve below | Anything |

**12-week pacing curve:** Gabe reaches roughly 2–3 chapters a week, so Champion lands around weeks 5–6. After that come Pro Rules, ROUND 2 and Faraway in weeks 6–9, and Wild Chapters with shiny Bulba-line hunts in weeks 9–12. Art gets a new visitor or garden item for every 10 petals, independent of Gabe.

---

## 9. Risks, red-team mitigations, and what we cut

| Risk (red team) | Mitigation |
|---|---|
| **Scope collapse** | v1 = Road + Garden + Bulba. Everything else behind a playtest gate |
| **Save loss at cutover** | v2 never written; tested pure migration; `legacy{}`; backup first; `/classic/`; `persist()` |
| **iOS breaks the headline moments** | CORS sprites, m4a cries, `audioSession`, no haptics, DPR cap, real-device check |
| **Kevin can't ship it** | No Pages setting change; one command; protection never blocks his push |
| **Art overstimulated or sidelined** | Calm default, flash-budget test, live Garden, turn-taking not a strip |
| **Sibling conflict** | Help-only Co-Star, bonus-not-gate, separate Groves, picture-lock, Gabe calls TEAM-UP |
| **Content burn-out** | Chapter JSON, rival, Art's trickle, M7 plan |
| **The boys don't like it** | Real sessions at M1 and M2, while pivoting is still cheap |
| **Screen-time creep** | Rest scenes, parent wind-down (no countdown), local Play Report for Kevin |

**What we deliberately cut**

| Cut | Why |
|---|---|
| Expedition roguelite | Second engine; "solved by run 3". Dad's Challenge replaces it |
| Rotated Tabletop Versus | iOS can't lock orientation; they sit on a couch |
| Hand-drawn overworld | No artist; palette swaps instead |
| Nap-bed de-evolution | Breaks canon; Everstone + baby visitor instead |
| "Sleepy" stun, coloured territory map | Start fights; scoreboard between brothers |
| Daily quests | A streak in disguise; Grove Wishes instead |
| Gen 10 silhouette, invented canon, Palworld cite | IP and embargo risk |
| Haptics | Don't exist on iOS |
| Franchise art committed to the repo | Redistribution; pinned hotlinks instead |

---

## 10. Decisions Kevin must make (5)

| # | Decision | Our recommendation |
|---|---|---|
| 1 | **Approve save schema v3** (a new key, v2 never touched, auto-backup first, round-trip tested on a copy of the boys' real saves) | **Yes.** It is the only way to hold Bulba, the Road and wishes without risking v2 |
| 2 | **One Grove or one each?** | **One each**, joined only on the Family Postcard in a shared family green |
| 3 | **IP stance**: stay a private family build that hotlinks pinned fan sprites (repo stays public but ships no franchise art), **or** make the repo private (GitHub Pages on a private repo needs a paid plan) | **Private family build, pinned hotlinks, no committed franchise art.** Decide whether the repo itself should go private |
| 4 | **Dedicate the Pages origin**: promise to publish nothing else on `devkevinb.github.io`, or buy a custom domain (about $12/yr, a one-time guided DNS setup) | **Promise for now.** Custom domain only if you ever want a second site |
| 5 | **Run the M1 playtest this weekend** with the script we provide (20 min with Gabe, 10 with Art, paper map first) | **Yes. Nothing past M2 gets built without it** |
