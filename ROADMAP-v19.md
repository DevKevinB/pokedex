# Pokédex OS v19 — Producer's Plan

*For Kevin. Written so you can read it top to bottom; the engineering detail is in the sprint tables and the design spec so whoever builds it (you and Claude) has line numbers to go to.*

# 1. State of the app (5 bullets, honest)

- **The game is real and the floor is solid.** 649 species all reachable, 58-trainer circuit with a Hall of Fame, saves fenced (quarantine, undo, PIN-gated import), no speech, no native dialogs, ~160 browser checks plus 18 engine unit tests. The v18.4–v18.11 work (epoch teardown, engine.js extraction, junior damage floor/ceiling) is what makes everything below safe to attempt.
- **Junior Mode is a Pokédex-screen feature, not a game-wide one.** Of twelve junior screenshots, only the dex (bigger arrows, hidden search) and the battle move tiles differ from Gabe's. PC Box (5px names, a search box that summons the keyboard), Trainer Card (5–8px text encyclopedia), gym hub, trainer list, settings and the team picker are pixel-identical to normal mode. Art gets nothing from CARD and nothing from the PC beyond colour-vs-grey.
- **The battle screen — the most-played screen — physically overflows a 375×667 phone.** Measured: the controls panel ends at 774px (junior) / 690px (normal) on a 667px viewport, so BALL and RUN are off-screen for Art and RUN is half-clipped for Gabe. On 390×844 it fits, but RUN is the widest button under a thumb with no confirm, move captions draw on top of their emoji, and two normal-type moves render as identical grey stars.  No script has ever screenshotted the arena automatically, so there is no machine baseline of it.
- **Several shipped features are silently broken.** The v18.10 habitat difficulty pips have no CSS rule and render white-on-cream (invisible in both modes, confirmed in `junior-07-explore.png`). The v18.6 faint tip-over never renders because the float animation owns `transform`. The XP bar tweens *backwards* on level-up. `playFanfare()` is called with no return track so the arena goes silent after every win. A player name with an apostrophe becomes `ART&amp;#39;S` after two reloads. The dex scanner references an undefined keyframe.
- **The tests protect logic, not layout or Junior battles.** `smoke.mjs` toggles junior off before any battle (line 643), so rule 2 ("never punishes") is guarded in battle only by engine unit tests. No script asserts geometry, and CLAUDE.md records two junior overflows the suite missed. `battle.js` is 1376 lines (CLAUDE.md says 979) with 30 raw `await sleep()` calls and no tap-to-skip; `package.json`'s `shots` script points at a file that does not exist.

# 2. GUI review — the verdict

The bones are right: cream dialog boxes with ink borders and hard shadows, pixel sprites, type-coloured tiles, chiptune. What reads as amateur is the lack of *discipline around* those bones. Grouped:

**A. Five screens, five unrelated skins.**
`normal-00-boot.png` is DMG olive; `normal-02-dex.png` is navy starfield + cream; `normal-05-pc.png` / `junior-05-pc.png` is a neon-green CRT; `normal-07b-habitat-encounter.png` is flat cyan sky over a green strip; `normal-08-gyms.png` has a pink gradient heal bar, a red/blue split-gradient VS bar and loose gold drop-shadowed text, all on one screen. `css/gba.css:8-17` defines seven tokens; ~90 hard-coded hex values are scattered through gba.css and another ~15 through JS (`catch.js:28`, `dex.js:131`, `battle.js:432`). The dex HP green is `#4caf50`, the battle HP green is `#38c060`.

**B. One pixel font stretched from 5px to 32px, doing every job, in mixed casing.**
31 declarations sit below the 8px floor CLAUDE.md sets: PC names 5px (`gba.css:597`), badge captions 5px (`:427`), team-strip label 5px (`:610`), settings rows 7px (`:487`), trainer taunts 7px (`:701`), move captions 7px (`:797`). Move names arrive lowercase from PokeAPI ("tera blast", "skull bash" in `junior-07b`), the data sheet mixes "Abilities" / "Base Exp" title case with uppercase labels, and victory/defeat text is 3–5 lowercase sentences at 9px.

**C. Seven button treatments, no spacing scale, glossy emoji beside crisp pixels.**
On `normal-09-settings.png` three shadow offsets sit side by side (0 2px / 0 3px / 0 4px). The header (`normal-02-dex.png`) is a 45px glossy blue lens with a soft glow, three anti-aliased LEDs, and four cream buttons of four widths — leftover "modern iOS" hardware from main.css under a pixel costume. Paddings in use: 2,3,4,5,6,7,8,10,12,14,15,16,18,20,30.

**D. The battle arena is an original dark-iOS layout wearing cream.**
`junior-07b-habitat-encounter.png`: the wild is pinned to the top-right with ~150px of empty sky under it; Skorupi's claw hides behind the 195px HP box; the platform is an invisible alpha blur; Charizard floats on a thin grass strip because the horizon is painted at 45% of a container that *includes the controls*; the 🔥 glyph overdraws "fire punch"; "tera blast" and "skull bash" are identical grey ⭐ tiles; BALL (Art's whole game) is half the width of RUN.

**E. Progress is told in numbers and sentences a pre-reader cannot use.**
`normal-08-gyms.png`: one active card, ten identical grey lock cards each repeating "BEAT THE PREVIOUS GYM", Victory Road and Elite pushed off-screen. `junior-06-trainer-card.png` = `normal-06-trainer-card.png`: 17 greyed emoji with 5px captions and 3-line descriptions, '0/1' under each, a 2% sliver in a bar. `junior-07-explore.png`: the only difficulty signal is invisible.

**F. Nothing moves except the hit grammar.**
All 16 modals and the PC box appear via `display:flex` with no entrance. Victory, badge and evolution arrive as instant text boxes. Switching is two 800ms text pauses with an instant sprite swap. The dex blinks every 4 seconds swapping to non-pixel official art. Panels animate `top` (layout) on full-viewport fixed layers.

**G. Mobile finishing is unfinished.**
No `-webkit-touch-callout` (long-press on Pikachu opens the iOS share sheet), no keyboard hints on any input (iOS autocorrects "onix" → "onyx" on Enter and the lookup 404s), `100dvh` with no `vh` fallback, the closed ball drawer's `-120px` magic number leaks above the home indicator on notched phones, the data-sheet handle sits inside the iOS swipe-up zone, the battle pads the bottom inset twice, the victory modal has no height cap (an Elite win can push CONTINUE off-screen), landscape is unusable.

# 3. GUI redesign spec — a design system

**Principle: one handheld console, one skin.** A navy *night* shell holds *paper* panels outlined in ink with one hard shadow. Every screen — boot, PC, gym hub, battle HUD — is built from that pair. Accents are a fixed set applied to fills, never to text on navy. The pixel font stays, uppercase, ≥8px. Motion is chunky and few. Junior is a second *structure*, not a bigger font.

Introduce tokens **additively** (new `:root` vars alongside existing hex values, then migrate rule-by-rule per sprint). Do not drop the `!important` cascade in one commit — CLAUDE.md is right that layout is the untested surface.

## 3.1 Colour tokens (`css/gba.css` `:root`, replacing lines 8-17)

```css
:root {
  /* night surfaces (shell) */
  --night:        #16162a;   /* app background, was --px-shell */
  --night-2:      #23233f;   /* raised night panels (HP-box track, xp track) */
  --night-3:      #0b0b1a;   /* deepest gradient stop */
  /* paper surfaces (panels) */
  --paper:        #f8f8e8;   /* was --px-cream */
  --paper-2:      #e0d8b0;   /* shading, disabled fills, bar tracks */
  --paper-3:      #fffef2;   /* inner panel white */
  /* ink */
  --ink:          #24243a;   /* borders, text on paper */
  --ink-2:        #706848;   /* secondary text on paper */
  --ink-3:        #a02020;   /* section titles / danger text on paper */
  /* accents (fills only) */
  --red:   #e84040;  --red-2:   #c02828;
  --green: #38c060;  --green-2: #2e8048;
  --gold:  #ffd040;  --gold-2:  #b8952a;
  --blue:  #4592c4;
  --pink:  #f8b0c8;
  /* per player */
  --p1: #d32f2f;  --p1-dark: #b71c1c;
  --p2: #1976d2;  --p2-dark: #0d47a1;
  /* runtime-swapped (main.js:84) */
  --p-primary: var(--p1);  --p-dark: var(--p1-dark);
  /* shadows */
  --sh-text:  2px 2px 0 var(--ink);
  --sh-panel: 3px 3px 0 rgba(0,0,0,.45);
  --sh-btn:   0 3px 0 var(--ink);
}
```

Type colours: set the 18 `--type-<name>` vars once on `documentElement` from `config.js typeColors` in `main.js` boot, and expose `--type-glow` (current) as an alias. Keep `config.inkFor()` for chip text contrast.

One HP green everywhere: `--green`. Retire `#4caf50` (`dex.js:131`, `main.css:131`) and `#ff4444`/`#c03028`/`#ff4d4d` in favour of `--red` / `--red-2`.

Dark/light: the app is single-theme by design (a console). No `prefers-color-scheme` branch. Paper panels are the "light" surface; night is the "dark". Both are always on screen.

## 3.2 Typography

- **Font: Press Start 2P for everything.** The council rejected a two-font system; the pixel face is the identity and Gabe reads it fine at ≥10px. Set it **once** on `body` and delete the ~70 per-rule `font-family` declarations (any element missing one currently falls back to SF Pro, which is how `.habitat-diff` ended up in the wrong font). Self-host it (`fonts/press-start-2p.woff2`, `font-display: swap`) so it never falls back to Courier offline.
- **Scale (tokens):** `--t-xs: 8px` captions, dots, tab counts · `--t-sm: 10px` body, labels, buttons · `--t-md: 13px` section titles, modal h2 · `--t-lg: 20px` screen title, Pokémon name · `--t-xl: 26px` junior Pokémon name. Nothing else. Emoji-only sizes (24/28/38/44/56) are separate and never carry text.
- **Floor: 8px, enforced by a smoke check** that walks every visible text node's computed `font-size`. Where a label no longer fits at 8px, **remove the label**, do not shrink it (PC tile name → tap to reveal; team-strip caption → ★ only; settings rows stack label over control).
- **Casing:** `text-transform: uppercase` on `body`; exceptions are inputs and flavor text (which get `text-transform:none` and a 3-line cap ≈110 chars). Move names uppercased at render with hyphens → spaces.
- **Kid-facing copy:** ≤6 words per line (CLAUDE.md), always preceded by a sprite or glyph. Line-height 1.6 at `--t-sm`, 1.3 for titles. Letter-spacing 0 below 13px.

## 3.3 Spacing

`--s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px; --s6: 32px`. Screen gutter = `--s4` (header, toolbar, explore-body, arena, modal padding). Tile gaps = `--s2`, card gaps = `--s3`, section spacing = `--s5`. Delete the individual margin values as rules are migrated.

## 3.4 Components

**Button (`.btn`)** — one primitive, three variants, one press motion:
```css
.btn { font: var(--t-sm)/1 var(--pixel-font); text-transform: uppercase;
  border: 3px solid var(--ink); border-radius: 3px; box-shadow: var(--sh-btn);
  padding: 12px 10px; min-height: 44px; background: var(--paper); color: var(--ink); }
.btn:active { transform: translateY(3px); box-shadow: none; }
.btn--fill  { background: var(--btn-color, var(--red)); color: var(--btn-ink, #fff); }
.btn--ghost { background: transparent; border-width: 2px; box-shadow: none; }
.btn[disabled] { opacity: .45; }
```
Map `.header-btn .tool-btn .nav-btn .move-btn .aux-btn .btn-large .set-action .set-toggle .close-pc-btn .poke-center-btn .vs-btn .gen-tab` onto it over the sprints. HEAL = `--fill` red with a heart, VS = `--fill` with `linear-gradient(90deg, var(--p1) 50%, var(--p2) 50%)`, CLOSE PC = `--fill` green, CANCEL = `--ghost`. **Every tap target ≥44×44** (header buttons are 28–30px today).

**Card (`.card`)** — paper, 3px ink, `--sh-panel`, with named slots: `.card-art` (emoji 44px or sprite), `.card-title` (`--t-sm`), `.card-meta` (a row of pictograms, never a sentence), `.card-band` (6px top stripe: green/amber/red difficulty or type colour), `.card-dots` (filled/outline 8px squares for progress), `.card-ribbon` (gold DONE corner), `.card-lock` (ink-outline square with lock; the art stays recognisable at `grayscale(1) brightness(.6)`, never a flat grey slab).

**HP / XP bars** — `.bar` (10px tall, `--paper-2` track, 2px ink border) containing `.bar-ghost` (paper, `transition: width .6s ease-out .3s`) behind `.bar-fill` (`transition: width .5s steps(8)`; colour snaps at 50%/20% thresholds green→gold→red, no fade). XP bar: 7px, gold fill on `--night-2`. HP text counts down over 450ms via rAF. HP box: `.hp-box-player { border-left: 6px solid var(--p-primary) }` so "mine" is a colour; both boxes get a `.team-dots` row in trainer/versus fights.

**Modal** — `.overlay-screen` (fixed, `height: var(--vv-h, 100dvh)`, `rgba(4,4,16,.92)`, `animation: fadeIn .15s both`) containing `.modal-box` (paper, 4px ink, radius 6, inset paper-2 bevel, 6px hard shadow, `max-height: calc(100dvh - 40px - env(safe-area-inset-top) - env(safe-area-inset-bottom)); overflow-y: auto; overscroll-behavior: contain; animation: boxIn .18s steps(3) both`). The last `.btn` child is `position: sticky; bottom: 0` so CONTINUE / CLOSE is always thumb-height. Reward modals (victory, badge, evo) use `boxPop .3s cubic-bezier(.2,1.5,.4,1)`. Z-index bands stay as they are but move from inline styles into the stylesheet; break the three ties (card/nick 2500, settings/whoplaying 2600, dev/oops 2700 — oops must win).

**Header** — one 56px row: player chip left (34px lead sprite with a 3px `--p-primary` border + name; tap = switch player; replaces the glossy lens and LED markup at `index.html:31-35`), three 44×44 buttons right (sound, PC, settings). BTL stays a header button for Gabe (it works); in junior it becomes a 44px icon tile. No inline `#ffcc00`. The 3px player-colour underline stays.

**Bottom nav — decision: no.** Both kid-lens judges and the code map say the toolbar tiles (EXPLORE, GYMS, CATCH) are already the boys' muscle memory and the dex bottom is the most fragile layout in the app. Instead: (a) one token `--sheet-peek` (90px normal / 54px junior) drives the data-sheet offset, the toolbar reserve and the handle height (today four unlinked numbers at `main.css:77`, `gba.css:80,452,454`); (b) in junior the collapsed sheet is `display:none` and the toolbar becomes a 2-column grid of 72–88px picture tiles; (c) the ball drawer moves to `transform: translateY(100%)` + `visibility` (no `-120px`).

## 3.5 Motion language — "8-bit snap"

Transform/opacity/filter only, `steps(3..8)`, 120–450ms; the spring `cubic-bezier(.2,1.5,.4,1)` reserved for rewards. Three tiers, each with picture + sound + haptic:
- **TICK** — every tappable thing depresses 3px (exists), plays an 880Hz 30ms tick, buzzes 8ms; the chosen move tile stays lit gold while the turn plays.
- **HIT** — attacker `.lunge` (.28s steps(3), 22px toward the foe), 90ms hit-stop (pause both sprite wrappers' `animation-play-state`), then the existing shake tiers, ghost bar lagging 300ms, HP number counting, damage pop + glyph, type-colour edge vignette (single 200ms frame, never strobing).
- **CEREMONY** — anticipation / snap / afterglow: ball arcs and wobbles (`ballThrow .55s steps(8)`), sprite goes white and pops back, gold XP flash with a `LV 13` mark, confetti, 4-note rising chord, modal springs in.
Structural rule: `float` lives on a `.sprite-bob` wrapper div, never on the `<img>`, so one-shot classes (`.fainted`, `.lunge`, `.recall`, `.sendout`, `.hit-anim`) own `transform`. Panels slide with `translateY` + `will-change`, park with `visibility:hidden`. `screenWipe` throttled to one per 700ms (3Hz photosensitivity band; comment it). No 4-second gallery blink (drop official art from the dex gallery). Every wait in battle goes through `awaitOrTap(ms)` with a 250ms floor. The reduced-motion block covers all new keyframes.

## 3.6 Iconography — decision

**Keep emoji as the icon system; do not build a 16px SVG icon set.** Emoji is Art's language (`config.typeEmoji` is the one picture-per-type vocabulary the whole battle grammar depends on), it renders in colour on the iPad without any asset work, and two judges rejected the SVG set as engineer busywork. Discipline instead:
1. Every emoji sits in an explicit box: `.ico { display:inline-grid; place-items:center; height:1.25em; line-height:1.25em }` so a colour glyph can never overdraw a caption (the cause of the tile overlap).
2. Fix the misleading glyphs: CRY `💥` → `🔊`; normal-type `⭐` → `👊` (a star reads as "special" to a 4-year-old); RNDM `🎲` stays.
3. **Where a real pixel-art icon is wanted, use PokeAPI item sprites** (already cached and cache-first in the SW): `poke-ball` for BALL and the boot bouncer, `great-ball/ultra-ball/master-ball` in the drawer, `rare-candy` for level-up, badge item sprites on the trainer card, `egg` if the egg ever ships. They are already pixel art and cost zero authoring.
4. The app icon (home screen) is the one hand-authored asset: a 64×64 pixel Pokédex SVG rendered to PNGs (see §6).

## 3.7 Screen-by-screen

**Dex** — header per §3.4; hero text uses `--sh-text` only (today three offsets); glow becomes a two-stop radial clipped by `mask: radial-gradient(circle,#000 55%,transparent 70%)`; plinth is an ink-outlined ellipse, no blur. Stat labels `HP ATK DEF SPA SPD SPE` at 8px single line, bars filled with the Pokémon's type colour (drop the traffic-light thresholds). Legendary/mythical ribbon chip above the name (data already cached at `api.js:70`). Scanner keyframe defined. Data sheet peeks via `--sheet-peek`; the handle is a 44pt tab that clears the home-indicator strip. Swipe handling: ignore touches that start inside `.sheet-content`.

**PC Box** — Gabe keeps the CRT (judges: it has personality and Art calls it "the computer"), but tokenised: tile 88px min, `.pc-name` 8px or hidden on ALL/G tabs, gen tabs one line `G1 16/151` at 8px, delegated click, `content-visibility:auto`. Selection = number badge + gold border only (drop the redundant ★ `::after`). Picker footer: START `--fill` green, CANCEL `--ghost`, instruction shrinks to a `6/6 PICKED` pill. Junior gets the Sticker Book (§3.8).

**Explore** — `.card` grammar: full-width scene cards in junior (habitat gradient backdrop, 56px emoji, three bobbing "peeker" sprites from the common pool), 2-col in normal; `.card-band` green/amber/red replaces the invisible pips; `Lv~9` text only for Gabe. Encounter scene: wild appears as a `brightness(0)` silhouette that pops to colour; ❗ framed cream/gold/rainbow by tier; tap to skip; `#encounter-text` hidden in junior.

**Gyms** — hub: one large active-gym card (leader's lead-mon sprite + five dot squares), then a horizontal progress path of 12 badge nodes (earned colour / current pulsing outline / locked ink outline) so Elite and Champion are visible without scrolling; `0/58` inside a paper pill with a bar. Trainer rows lead with a 48px lead-mon sprite and a status pictogram (glove/lock/check), roster in colour when open, taunt 8px one line hidden in junior, the blinking text becomes a red BATTLE `.btn--fill` with a nudging chevron. Poké Center bar shows team sprites tinted red when hurt and greys out when nobody is.

**Battle** — three-row shell: floating 44px exit chip top-left + habitat/trainer chip top-right (no 61px header bar), arena `flex:1 1 0; min-height:0` as a 2-row grid (wild HP box left / enemy on far platform right; player on near platform left / player HP box right, `align-items:end`), controls `flex:0 0 auto; max-height:52dvh`. Sprites `clamp(96px,17dvh,150px)` wild and `clamp(110px,22dvh,200px)` player with `margin-bottom:-14px` under the text panel (FireRed). Opaque pixel platforms with a dither texture; backdrop gradients move onto `.battle-arena` (sky / far ground / near ground) keeping the `.bg-*` class names. Controls: 40px picture strip log (actor sprite → type glyph → target; sentence beside it for Gabe, hidden for Art; tap to skip), 2×2 type tiles (icon row / uppercase 8–9px caption / ●●○ power dots / ⏫ gold corner badge when super-effective), then one hero row: full-width red BALL with the poke-ball sprite (recoloured from catch chance for Gabe only) and a 44px SWITCH chip showing the next team member; **no RUN row**. Exit: two-tap arm (chip turns red, 2s) for Gabe, hold-to-run 900ms with a filling bar for Art.

**Trainer Card** — badges as 48px coins in three labelled rows (LEADERS / COLLECTION / SPECIAL), leader coins carry a 24px sprite of that leader's lead mon, description on tap-to-flip, mini bar instead of `16/100`, dex bar as a 6-segment meter so 2% lights one segment, sticky CLOSE. Junior: the Poster (§3.8).

**Settings** — rows stacked (label over control), toggles 40px, actions on the `.btn` primitive, tooltips at `index.html:316/318` corrected (they still say "spoken names"). Junior: only SOUND and HAPTICS visible; names, junior toggles and save actions behind a hold-to-open PARENT tile (`requirePin` unchanged; the council rejected PIN-gating the toggle, not the entry).

**Boot / Who's Playing** — boot on `--night` with the logo in a paper box, a bouncing poke-ball sprite, `A GAME FOR GABE & ART` + `v19.x` instead of the fake copyright. Picker tiles: paper cards with a 6px `--p1`/`--p2` top stripe, 96px lead, a 6-sprite team strip, 👑 if champion.

## 3.8 Junior Mode differences (structure, not font size)

| Screen | Normal (Gabe) | Junior (Art) |
|---|---|---|
| Dex | toolbar 4-col, data sheet peeks | sheet hidden; 2-col 72–88px picture tiles: CATCH×2 / EXPLORE, GYMS / PLAY, STICKERS; sprite ≥140px guaranteed; tap owned sprite = pet; gear hold-to-open; vertical swipe disabled |
| PC | CRT grid, names, search | Sticker Book: paper, 88px sprite-only stickers, silhouettes for uncaught, no search, gen tabs = starter sprites, new-catch peel-pop, tap = big sprite + cry |
| Battle | captions, catch-chance BALL colour, two-tap exit | icon-only tiles + dots + ⏫, hero BALL uncoloured, hold-to-run, log strip pictures only, one-tap into a fight (skip picker + sparkle modal when a team exists) |
| Victory | sprite + mark + XP strip + sentences | sprite + mark + XP strip only; CONTINUE is a 56px ▶ |
| Explore | 2-col cards, Lv text, sentences | full-width scene cards, band colour only, silhouette-pop encounter, tap to skip |
| Gyms | text rows + BATTLE button | same layout, taunts hidden, rosters 48px colour |
| Card | coins + flip text | Poster: 160px buddy, favourites shelf, coins with ✓, 6-segment meter, sticky ✖, no quests/stats |
| Settings | full | SOUND / HAPTICS + hold-to-open PARENT |

Never show or hint the always-catch / no-faint accommodations (rule 2). Ball drawer in junior: four equal balls on coloured plinths, no rate text.

# 4. Feature plan — ordered sprints

Cadence: one tagged release every 2–3 days, each pushable the same day, `main` always green, rollback = `git revert` + release script. Every sprint ends with the release ritual (three-place version bump, CHANGELOG in your words, `npm test`, screenshots at 375×667 and 390×844 in both modes). Schema changes are flagged **ASK KEVIN** and gated on §7.

---

### v19.0 — "The Safety Net"
**Kids notice:** Gabe can tap to hurry every battle line; Art sees a blinking ▼ that means "tapping works". Everything else is invisible to them and is what makes the rest of this plan safe.

| Feature | What / why | Files | Effort / risk |
|---|---|---|---|
| `awaitOrTap` pacing seam + `?fast=1` | Add `awaitOrTap(ms, {floor:250})` to `config.js` (Promise.race of `sleep` vs one-shot `pointerdown` on `.battle-view`). Replace all 30 `await sleep(` in `battle.js` (performAttack 572/597-601, doSwitch 509/513, checkFaints 692-710, handleEnemyDown 745/764/798, capture 887-894, ball throw 1010-1053, victory 1076, evolution 1116-1125, versus 1199/1270/1298), keeping every `stale(e)` check. `window.__PACE__` from `?fast=1` / `localStorage pokedexos_fast` clamps waits to the floor. Blinking `.skip-arrow` in `#battle-log` while a wait is pending. Roadmap W3 item; removes ~43s dead air per gym fight; halves the suite. | `js/config.js`, `js/battle.js`, `css/gba.css`, `test/smoke.mjs` | M / medium (battle.js, but mechanical) |
| Scenes harness with geometry invariants | One `test/scenes.mjs` replacing the seven `v18*shots.mjs`: named scenes (boot, whoplaying, dex, dex-uncaught+drawer, sheet, explore, encounter, wild-battle, gym-battle, spoils, victory, pc, picker, card, settings, dev, hof) driving the **real** flow (arena = `#close-pc-btn` → `#sparkle-modal` → `#variant-regular` → `#battle-container.active`), × [390×844, 375×667] × [normal, junior] under `?fast=1`, fixtures in `test/fixtures.mjs`. Asserts: no `button/.modal-box/.habitat-card` bottom/right outside the viewport; `#ball-btn`/exit chip visible; `.hp-box-wild` does not intersect `#wild-sprite`; no visible text < 8px. Bounding boxes of ~40 selectors saved to `test/baseline/*.json`, fail on >12px drift (`UPDATE_BASELINE=1` to accept). PNGs to `test/shots/` (gitignored) for the human look. Wire `npm run shots`. | `test/scenes.mjs`, `test/fixtures.mjs`, `test/baseline/`, `package.json`, `.gitignore`, `CLAUDE.md` | M / low |
| Junior-never-punishes suite + release script | New smoke section with junior ON: six turns vs a Lv80 mock asserting `active().hp >= 1` and the min-hit floor; four ball throws with `Math.random=0.99` all catch and `items.masterBalls` untouched; a gym trainer never reaches DEFEAT; `.ball-count` hidden; no visible text contains "junior"/"easy". `tools/release.mjs <version> "<title>"` rewrites `config.js APP_VERSION`, `sw.js CACHE_VERSION`, three `?v=` in `index.html`, `package.json`, verifies they agree, checks `SHELL_FILES` covers `ls js/` (+data/, fonts/), stubs a CHANGELOG heading, runs `npm test`, prints the exact git commands in plain English. Smoke check asserting the version triple matches. | `test/smoke.mjs`, `tools/release.mjs`, `test/smoke.mjs`, `ROADMAP.md`, `CLAUDE.md` (fix the file table: battle.js 1376, add engine/dialog/nickname/habitatfill, smoke ~160) | S / low |

**Tests to add:** listed above (fast-mode turn waits 4200→900ms; END MATCH during performAttack under fast mode produces no pageerror — this also pins the known versus crash before v19.9 fixes it). **Screenshots:** the harness itself now produces the arena set that was missing; eyeball the four arena PNGs once.

---

### v19.1 — "One Console"
**Kids notice:** Every label in the PC and on the card is readable; the difficulty dots on the map finally show up; boxes pop in with a snap; nothing jumps when the keyboard opens; a long press on Pikachu no longer opens the phone's share menu.

| Feature | What / why | Files | Effort / risk |
|---|---|---|---|
| Design tokens (additive) + 8px sweep + `.btn` primitive | Add the §3.1 token sheet, `--t-*` and `--s*` scales, `--sh-*`; set `font-family` and `text-transform: uppercase` once on `body`. Migrate only: header buttons, `.btn-large`, settings, PC footer, the ~30 hex sites in the families `#a02020/#706848/#fffef2/#ffd040` (find-and-replace to `var()`, colours unchanged so nothing visibly shifts). Sweep all 31 sub-8px declarations to 8px; where a label no longer fits, remove it per §3.2. Delete dead main.css rules (`:28,61,64-65,142,153-155,159`) and the stray `</style>` at `main.css:164`. Set the 18 `--type-*` vars at boot. **Do not** remove `!important` flags yet. | `css/gba.css`, `css/main.css`, `js/main.js`, `js/config.js`, `js/catch.js`, `js/dex.js`, `js/battle.js` | M / low (harness catches drift) |
| Layout contract + iOS finishing | `--sheet-peek` token replacing the four unlinked numbers; drawer to `transform`+`visibility` (kills the `-120px` leak); handle 44pt clearing the home-indicator strip; swipe handler ignores touches starting in `.sheet-content`; remove double bottom padding on `.battle-controls` (`main.css:133`) and the dead remote SVG (`main.css:111`); `vh` fallback before every `dvh`; `-webkit-touch-callout:none`, `-webkit-user-drag:none`, `draggable=false` on the three big sprites; keyboard hints on all 8 inputs (`autocorrect=off`, `autocapitalize=characters` for names, `enterkeyhint`, `inputmode=numeric` on the level field); `overscroll-behavior: contain` on all 7 scroll regions; `visualViewport` → `--vv-h`; one passive `touchstart` on `document` so `:active` fires on div cards; landscape query (stage + toolbar side by side; desktop frame gated on `min-height:600px`); `.modal-box` max-height + sticky last button. | `css/main.css`, `css/gba.css`, `index.html`, `js/main.js` | M / low |
| Motion foundation + visible-bug fixes | `fadeIn` / `boxIn` / `boxPop` entrances (CSS-only, restart on leaving `display:none`); panels animate `transform` not `top`; `@keyframes scan` defined; `screenWipe` throttled 700ms with the photosensitivity comment; `.habitat-diff` CSS (8px pixel font, `--ink-2`, three 8px ink squares coloured green/amber/red by `data-pips`); `.fainted { animation: none !important }` as the interim fix for the tip-over; new keyframes added to the reduced-motion block. | `css/gba.css`, `css/main.css`, `js/dex.js`, `js/explore.js` | S / low |

**Tests:** the 8px floor check; geometry baselines regenerated with `UPDATE_BASELINE=1` and reviewed; a smoke check that mashing `#nav-next` 10× in 1s yields ≤2 wipes. **Screenshots:** all 17 scenes both sizes both modes; specifically compare `explore` (pips now visible) and `settings` (labels at 8px stacked).

---

### v19.2 — "The Arena"
**Kids notice:** The battle looks like a Game Boy fight — the wild Pokémon stands on a platform, Charizard is big up front — and on Dad's phone Art can actually see the Pokéball button. Bumping RUN can't end a fight any more. Art taps the swords and is straight into a battle.

| Feature | What / why | Files | Effort / risk |
|---|---|---|---|
| Battle arena rebuild (fits 375×667 in junior) | Per §3.7 Battle: three-row shell, 2-row grid arena, `clamp()` sprites, opaque platforms, backdrop moved onto `.battle-arena`, floating exit + habitat chip (fixes "BATTLE ARENA" title on habitat fights, `battle.js:409`), HP boxes 9/8/8px with `--p-primary` stripe, 7px gold XP bar, `.team-dots` in trainer/versus, `#player-sprite` wrapped in `.fighter-wrap` so `spawnDamagePop` can't land on the HP box. Touches `renderActive`, `renderEnemy`, `setBattleBackdrop`, `spawnDamagePop` only. | `css/main.css`, `css/gba.css`, `index.html`, `js/battle.js` | L / medium |
| Hero BALL, no RUN row, safe exit | Remove the RUN row (`battle.js:391`, `gba.css:623`). BALL becomes the full-width hero row with `ITEM_SPRITE('poke-ball')` at 28px, recoloured green/amber/red from `catchChance` (`battle.js:950`) **non-junior only**; SWITCH is a 44px chip with the next alive team member's sprite; in gym/versus SWITCH takes the row. Exit chip: two-tap arm (2s, turns red) for normal mode; junior uses the `holdFill` pattern (`devtools.js:159-188`, `gba.css:533-538`) at 900ms. Ball-pick modal: 64px ball sprites on coloured plinths, no rate text in junior. | `js/battle.js`, `js/main.js`, `css/gba.css` | M / low |
| Junior one-tap fight | In `initBattleMode` (`main.js`), when `player().settings.junior && player().team.length > 0`, skip `openPC('team')` and `#sparkle-modal` and call `finalizeBattleSetup(false)` directly (reusing the existing `team-confirmed` path, no new battle entry code); otherwise open the picker as today. Gabe's flow unchanged. | `js/main.js` | S / low |

**Tests:** `#ball-btn` and `.hp-box-player` bottoms ≤ `innerHeight` at 375×667 both modes; exit chip does not exit on a single tap during a wild battle in either mode; junior BTL tap lands in `#battle-container.active` without `#pc-modal` opening. **Screenshots:** wild-battle and gym-battle scenes at both sizes, both modes — the first real arena baseline; check the platform/horizon by eye.

---

### v19.3 — "Pick the Gold One"
**Kids notice:** Art can tell his four attacks apart (no more twin grey stars), the dots say which one is big, and a gold arrow says which one will really hurt this enemy. Every attack sounds different. Fights start instantly and Gabe's Charizard knows the same four moves every time.

| Feature | What / why | Files | Effort / risk |
|---|---|---|---|
| Move tiles v2 + colour & sound | Tile = 3-row grid (icon box 28px / caption 8px uppercase, hidden in junior / `●●○` from `Math.ceil(power/40)`), gap 6px. Normal-type glyph → 👊; `buildFighter` prefers four distinct types when the 10-move sample allows; second same-type tile gets a `--tile-shade` lightening. `data-eff` from `getTypeMultiplier(m.type, battleState.wild.types)` (imported, unused today): super = 3px gold outline + ⏫ corner, weak = faded ⏬, immune = greyscale .6; stays on in junior (it is a picture). `.chosen` state set in `executeTurn`, cleared in `enableMoves(true)`. Aux buttons: explicit `.aux-icon` 22px (28px junior) + 9px text, replacing the 7px accident at `gba.css:336`. `sfx.type[t]()` per-type sounds built from `playBeep` (fire crackle, water sweep, electric buzz, rock thud…), played in `performAttack` before `impactFx`; `impactFx(type)` paints a single 200ms `box-shadow: inset 0 0 60px <type>` frame. Log strip becomes the 40px picture strip (actor sprite → glyph → target; text hidden in junior). | `js/battle.js`, `js/config.js`, `js/audio.js`, `css/gba.css` | M / low (render-only; `pickMove`/`computeDamage` untouched) |
| `data/moves.json` bake + seeded movesets | `tools/bake-moves.mjs` (plain node fetch, run by hand a few times a year) commits `data/moves.json` (`{name:{p,t,c}}`, ~22KB, Gen 1-5 moves) — a committed data file, not a build step. `api.getMove` returns the JSON entry synchronously, network fallback kept; `slimPokemon.moves` drops `url` (halves the biggest cache entry). `engine.seedMoveset(names,{seed,rng})`: seeded LCG (same pattern as `pickDailyQuests`) over `usableMoves`, seed = hash(player, monId, floor(level/10)) so a set is stable per 10-level band; wild/trainer mons seed on (id, level) so Rocko's Onix is the same Onix each rematch. No schema — movesets are derived. Add to `SHELL_FILES`. | `tools/bake-moves.mjs`, `data/moves.json`, `js/api.js`, `js/engine.js`, `js/battle.js`, `sw.js` | M / low |

**Tests:** engine tests (same seed ⇒ same moves; adjacent band ⇒ ≤1 change); smoke: in junior battle the 4 tiles have no visible caption and exactly one `data-eff` value per tile; the `/move/` route mock becomes a fallback-only guard; `buildFighter` makes zero network calls for moves with the JSON present. **Screenshots:** wild-battle both modes — check no emoji/caption overlap and the ⏫ badge.

---

### v19.4 — "Level Up!"
**Kids notice:** When a Pokémon gets hit you see exactly how much it hurt as the bar drains in ticks. Levelling up is a gold flash, a `LV 13` pop and a happy jingle instead of a sentence. After a fight the box opens on a big picture of what you caught with a big ✅. Pokémon lunge when they attack, pop out of the ball when switched in, and actually keel over when they faint.

| Feature | What / why | Files | Effort / risk |
|---|---|---|---|
| Living bars + LEVEL UP burst | `.bar-ghost` behind each `.hp-fill` (`index.html:147,159`); `updateHP` sets fill then ghost; stepped fill, threshold colour snap, HP number rAF countdown. Fix the backwards XP bar: in `awardPartyXp` compare `monLevel` before/after for the active mon; on level-up → bar to 100%, wait 450ms, `.lvup` flash (3× brightness, steps(2)), `spawnMark('player','LV '+n,'fx-lvup')`, `sfx.levelUp` (523/659/784/1047 Hz square, 90ms apart), then `transition:none` → new % → reflow → restore. `sfx.faint` from `faintSprite`. Fix the silent arena: track `currentTheme` in `main.js` and call `playFanfare(currentTheme)`. Dex stat bars and card dex bar reuse the stepped fill. | `js/battle.js`, `js/audio.js`, `js/main.js`, `index.html`, `css/gba.css`, `css/main.css`, `js/dex.js` | M / low |
| Wordless win card | `concludeCapture` (`battle.js:915-947`) and the gym branch (`808-819`) build `#victory-hero` first: 96px sprite (or the beaten roster row), a 48px ✅/⭐ with `boxPop`, an XP strip (fat gold bar old%→100%, flash, snap to new%, `LV 12 ▶ 13` chip per level). Sentences kept for Gabe below a divider (capped at 6 uppercase words per line), hidden under `body.junior`. "IT GOT AWAY" → sprite fading with 💨, no words. CONTINUE is a 56px ▶ tile in junior. Spoils ceremony gets the ✅ and the same XP strip. | `js/battle.js`, `index.html`, `css/gba.css` | M / low |
| Sprite life | Wrap both battle sprites in `.sprite-bob` (float lives there). New `js/fx.js` exporting `lunge`, `hitStop`, `recall`, `sendout`, `pxReveal` plus `spawnParticles`/`spawnMark` moved out of `battle.js`. `.lunge` at the top of `performAttack`, 90ms hit-stop before `impactFx`, `.recall`/`.sendout` in `doSwitch` and `renderEnemy` replacing the two 800ms text sleeps with one `awaitOrTap(500)`. Rewrite `flashHit` to transform+filter (no `margin-left`). Pre-impact wait 900→450ms, post-impact text pauses 750→300ms (250 junior). Dex: drop `official`/`official_shiny` from the gallery so the 4s blink never starts; sprite reveal via `pxReveal` (clip-path, .35s steps(6)). Add `fx.js` to `SHELL_FILES`. | `js/fx.js`, `js/battle.js`, `js/dex.js`, `index.html`, `css/main.css`, `css/gba.css`, `sw.js` | M / medium (timing changes in the hotspot; every wait already epoch-guarded) |

**Tests:** XP bar width is monotonic non-decreasing across a level-up (sample width during the tween); `.fainted` sprite computed transform contains a rotation; `#victory-hero img` exists after a wild win; junior victory modal has no visible text node > 6 words; `AudioContext` fanfare followed by theme resume (spy on `playMusic`). **Screenshots:** victory scene both modes; wild-battle mid-hit frame (harness can pause at the hit-stop under `?fast=1`).

---

### v19.5 — "It Talks Back"
**Kids notice:** Poke Pikachu and it hops, squeaks its real cry and hearts pop out; poke it five times fast for a spin. Every button clicks and buzzes under your finger. Music comes back after a phone call and the hits are audible over the tune.

| Feature | What / why | Files | Effort / risk |
|---|---|---|---|
| Pet your Pokémon | On the dex, tapping `#poke-sprite` for an **owned** species = pet (unowned keeps junior tap-to-open-bag, `main.js:207-209`): `.pet-hop` (.35s steps(4) squash-stretch), 3 pink ♥ via `spawnMark`, `triggerVibration(20)`, `playCryAudio()` debounced 400ms (council-approved form; the cry is already loaded by `dex.js:135`). Fifth tap within 1.2s → `.pet-spin`, 12 hearts, 3-note rising beep. Same hook on `#player-sprite` in battle when `!battleState.busy`. Works for Gabe too. | `js/main.js`, `js/dex.js`, `js/battle.js`, `js/fx.js`, `css/gba.css` | S / low |
| Haptic + tick vocabulary | `HAPTIC` table in `audio.js` (tick [8], select [15], hit [30], superHit [30,20,50], weakHit [12], catch [100,50,100], levelUp [40,30,40,30,120], faint [200], denied [10,30,10]) + `sfx.tick` (880Hz square 30ms vol .05). One delegated passive `pointerdown` in `wireUI` for `button, .habitat-card, .pc-item, .ball-opt, .team-slot, .spoils-pick, .switch-item, .whoplaying-choice`. Replace the nine ad-hoc vibrate calls; wire hit/superHit/weakHit into `impactFx`. Device-local HAPTICS toggle beside SOUND (`pokedexos_haptics`, follows the `pokedexos_muted` pattern, not in the save). Fold the six hand-rolled jingles (`main.js:25-26,124; gym.js:30; explore.js:187; battle.js:1118,1356-1364`) into named `sfx` entries. | `js/audio.js`, `js/main.js`, `js/battle.js`, `js/catch.js`, `js/progression.js`, `js/settings.js`, `js/gym.js`, `js/explore.js`, `index.html` | S / low |
| One audio graph | `audio.js` owns the single `AudioContext` and exports `getCtx()` + three `GainNode` buses (music .35, sfx 1.0, cry .6); `music.js` drops its own context. `resumeIfNeeded()` on every pointerdown and on `visibilitychange` (iOS reports `interrupted` after a call). Sequencer → 25ms lookahead scheduler on `ctx.currentTime` so confetti cannot drift the beat. | `js/audio.js`, `js/music.js`, `js/main.js` | M / medium (must be verified on the actual iPad) |

**Tests:** init-script wraps `AudioContext` and asserts exactly one instance across the run; tapping the owned dex sprite adds `.pet-hop` and does not open `#ball-drawer`; the no-speech guard untouched. **Screenshots:** dex during a pet tap (hearts visible) in junior.

---

### v19.6 — "Art's Book"
**Kids notice:** Art's home screen is Pikachu, two huge arrows and six big picture tiles — the blank cream bar at the bottom is gone and Pikachu is bigger. The green computer becomes a sticker book: colour stickers he has caught, grey shadows he hasn't, a satisfying pop for new ones, tap a sticker and it says its cry. *(If approved: a gold star puts up to six favourites on a shelf.)*

| Feature | What / why | Files | Effort / risk |
|---|---|---|---|
| Big-tile junior home | Under `body.junior`: `.bottom-sheet { display:none }`, toolbar reserve = safe-area only, 2-col grid of 72–88px tiles with 36px pictograms and one-word captions: [CATCH/OWNED ×2], [EXPLORE, GYMS], [PLAY 🔍 (placeholder → v19.11), STICKERS 📖]; CRY/SHINY/RNDM fold into the pet tap and a 44px 🎲 header chip; SHINY becomes a visible ✨ chip (no gestures — council ruling). Header per §3.4; gear becomes hold-to-open 1200ms in junior. Guard the vertical swipe (`main.js:156-157`) with `if (player().settings.junior) return`. `@media (max-height:720px)` compacts junior tiles so `#poke-sprite` never drops below 140px (it is 103px today at 375×667, smaller than normal mode). CARD keeps a route: the STICKERS book carries a 📸 tile to the poster (v19.11). | `css/gba.css`, `css/main.css`, `index.html`, `js/main.js`, `js/dex.js`, `js/settings.js` | S / medium (this is exactly where junior overflowed twice — harness required) |
| Sticker Book (junior PC) | In `openPC` when junior && `context==='dex'`: paper background, `.pc-search` hidden, gen tabs = starter sprites (1, 152, 252, 387, 495) + 📖 ALL with no counts, 88px sprite-only tiles, uncaught = `grayscale(1) brightness(.35)`, caught = white sticker square with a curled-corner `::after`. New-sticker pop: device-local `pokedexos_stickers_seen_p<n>` set (try/catch, not in the save); unseen caught ids get `.sticker-new` (spring scale from 0 + 6 confetti). Tap a caught sticker → `#sticker-modal` (160px sprite, 32px type emoji chips, ⭐ if favourites approved) and `setCry(d.cries.latest)` + `playCryAudio()`. Team strip: sprites only, bouncing ★ on the lead. Team-picker context in junior: search hidden, six dashed slots at the top filling with sprites, 12-word instruction replaced by a `6/6` pill. Gabe's PC untouched. | `js/pc.js`, `index.html`, `css/gba.css`, `test/scenes.mjs` | M / low |
| **ASK KEVIN** — Favourites shelf | Additive per-player `favorites: []` (≤6 caught ids). Follow the 8-step checklist: default in `freshPlayer()` (`state.js:33-51`), validated branch in `hydratePlayer()` (`cleanIds` ∩ caught, `slice(0,6)`), exported `toggleFavorite(id)` ending in `persist()`, smoke check reading the save key, CHANGELOG line saying it is additive, version stays 2. UI: ⭐ on the sticker modal (junior) and tap-hold on PC tiles (normal); full shelf = gentle wobble, never a message. `.fav-shelf` (6 slots, 56px sprites, dashed empties) at the top of the sticker book and under each name in the Who's Playing picker. Ships only if §7 Q3 is yes; otherwise the shelf shows the team. | `js/state.js`, `js/pc.js`, `js/main.js`, `css/gba.css`, `test/smoke.mjs`, `CHANGELOG.md` | M / medium (schema) |

**Tests:** junior dex at 375×667: `#poke-sprite` height ≥140, toolbar bottom ≤ `innerHeight`, `#data-sheet` not opened by an 80px vertical drag; junior PC has no `.pc-search`, no `.pc-name`, every tile ≥88px; `favorites` round-trips through export/import and is dropped for an uncaught id. **Screenshots:** junior dex, junior PC, junior picker at both sizes — look at them; this sprint is the layout risk.

---

### v19.7 — "The Map"
**Kids notice:** EXPLORE opens a colourful map with little Pokémon peeking out of each place and a green, orange or red border that says easy or hard. The Gym Circuit shows the whole journey as a row of badges. Mewtwo's page gets a gold LEGENDARY ribbon and it roars by itself. One place a day glitters — shinies are five times more likely there — and the first shiny either boy catches gets its own confetti screen.

| Feature | What / why | Files | Effort / risk |
|---|---|---|---|
| Picture world map + card grammar | `.card` component per §3.4. Explore: full-width scene cards in junior (habitat gradient via `data-habitat` reusing the `.bg-*` gradients, 56px emoji, three bobbing 40px peekers from `h.c`), 2-col with the band + 8px `Lv~9` for Gabe; FARAWAY locked = greyscale scene + 48px 🔒, no sentence. Encounter scene: silhouette-pop wild, tier-framed ❗ (cream/gold/rainbow), 0/3/6 confetti, `#encounter-text` hidden in junior, tap to skip via `awaitOrTap`. Gym hub: large active card + 12-node progress path + paper pill with bar; trainer rows with 48px lead sprite, status pictogram, red BATTLE `.btn--fill` + chevron nudge, taunt 8px hidden in junior, Poké Center bar with team sprites tinted when hurt. Export the habitat→bg mapping from `config.js` so `battle.js` and `explore.js` share it (three places today). | `js/explore.js`, `js/gym.js`, `js/config.js`, `css/gba.css`, `index.html` | M / low |
| Living dex entries | Gold `.dex-ribbon` (★ LEGENDARY / ★ MYTHICAL) from cached `is_legendary`/`is_mythical` (`api.js:70`, zero consumers today) + gold `#bg-glow`; flavor cycling on tap of `#desc` through the 6 cached texts with a 1-6 dot row; auto-cry after `loadPoke` debounced 400ms, gated on audio unlocked + unmuted + `canPlayType('audio/ogg')` (council's exact condition); habitat chips next to the type tags from a static `habitatsOf(id)` map, tap → open explore on that habitat. | `js/dex.js`, `js/explore.js`, `js/audio.js`, `css/gba.css`, `index.html` | S / low |
| Sparkle Spot + first-shiny ceremony | `sparkleSpot()` = habitat index seeded by `todayNumber()*3 + currentPlayer`; that card gets an animated ✨ chip and a gold border; `battle.js:211` shiny roll reads `activeHabitat()`: 1/10 there vs 1/50 elsewhere (junior identical — a bonus, never a gate). Dex honesty: the SHINY toggle stays visual, but a dex catch while `isShiny` is on of an already-owned species runs a shiny-hunt throw at the same odds (in junior the ball always catches; the sprite is shiny only on the roll; nothing is worded). First `recordShiny` → modal with the 96px shiny sprite, ✨ marks, 48 confetti, 4-note chord; SPARKLE badge fires after. No schema. | `js/explore.js`, `js/battle.js`, `js/catch.js`, `js/state.js`, `index.html`, `css/gba.css` | S / low |

**Tests:** `#habitat-grid` still 9 cards; every `.habitat-card` has a `.card-band` with a computed colour ≠ white; species fixture with `is_legendary:true` for 150 renders the ribbon; pinned `Math.random=0.011` inside the sparkle habitat sets the shiny flag and opens the ceremony on the first one; gym hub renders 12 path nodes. **Screenshots:** explore, encounter, gyms, gym-confirm, dex (legendary) both modes.

---

### v19.8 — "Round 2"
**Kids notice:** After the crown, a gold ROUND 2 tab appears: all 58 trainers come back 15 levels stronger with a MASTER BADGE at the end. Eevee's page finally shows all eight evolutions, and when Eevee levels up Gabe *picks* who it becomes. The daily quests stop repeating "catch 2 Pokémon".

| Feature | What / why | Files | Effort / risk |
|---|---|---|---|
| Round 2 — Champion Circuit (+15) | `gymdata.js`: `roundTrainers(gym, round)` (level `min(100, lv + 15*(round-1))`, Rex Lv95), `trainerKey(gymKey, idx, round=1)` → `key:idx` for round 1 (existing keys untouched), `key:idx:r2` for round 2 (the `':4'` suffix test in `explore.js:88` keeps ignoring r2 so wild levels don't spike). `gym.js`: `.round-tab` chip row shown only when `isChampion()`; unlock/beaten counts take `round`; the rematch flag reads the round key so first r2 wins pay **full** XP. `battle.js`: `trainer.round` threaded through `startTrainerBattle`/`recordGymWin`; spoils `ensureMonAtLeast` at the +15 level; Hall of Fame replays when Rex r2 falls. Badge `round2` 👑 MASTER BADGE. Gold border on r2 cards. No schema (`gyms.beaten` is a free-form map). | `js/gymdata.js`, `js/gym.js`, `js/battle.js`, `js/progression.js`, `css/gba.css` | M / low |
| Evolution fan | `api.js slimEvo` walks every `evolves_to` branch into a flat `{name,id,min_level,from}` list under a new `evo2:` prefix. Dex evo box renders branches as rows under their parent. `maybeEvolveThenExit`: candidates where `from === current`; 1 → existing `playEvolution`; >1 → `#evo-pick-modal` "WHO WILL EEVEE BECOME?" with 72px sprite tiles (junior: tap any tile, no text; NOT YET = ask again next level-up). PC: a mon whose level ≥ any branch's `min_level` and whose evolution isn't owned shows an EVOLVE button (fixes `awardPartyXp` silently skipping five team members). Stone/trade lines keep the Lv30 default — **no stones, no time-of-day gates**. | `js/api.js`, `js/dex.js`, `js/battle.js`, `js/pc.js`, `index.html`, `css/gba.css` | M / low |
| Quest pool 10 → 30 + champion tier | 20 new `QUEST_POOL` defs (evolve1 — new kind `'evolve'` from `playEvolution`; vs1; rematch1; 8 habitat catches via `detail.habitatKey`; rare1 via `detail.tier` — finally consumed; lv40catch; 8 more type quests). `bumpQuests` matches `def.kind` + optional `def.match(detail)` and loses its dead duplicate branch. When `p.champion`, a 4th HARD slot (shiny1, round2win, evolve2) pays a Master Ball. Board stays day-keyed as today. | `js/progression.js`, `js/battle.js`, `js/explore.js`, `js/catch.js` | S / low |

**Tests:** `recordGymWin('elite',4,2)` fires the MASTER badge; r2 first win pays full XP and a repeat pays half; Eevee-shaped evo fixture renders 3 branches in the dex and opens the picker on level-up; quest fixture with `detail.habitatKey` completes a habitat quest; badge tile count assertion updated (17 → 18). **Screenshots:** gyms hub with the ROUND 2 tab (seed champion), dex on Eevee, evo-pick modal, card quests.

---

### v19.9 — "Pass the Tablet"
**Kids notice:** When it's the other brother's turn the whole screen turns his colour and shows his Pokémon. Brother battles get the big picture tiles, an EVEN switch stops Gabe's Lv60 team flattening Art's, and END MATCH needs two taps. A new WHO'S THAT POKÉMON? game: a black shape, three choices, stars for both, no loser. The start-up picker shows each boy's colour, team and crown.

| Feature | What / why | Files | Effort / risk |
|---|---|---|---|
| Hand-off card + Who's Playing tiles | Extract `waitForPass`/`onPassReady` (`battle.js:1140-1152`) into `js/pass.js` exporting `passTo(n, {sprite, hint})`: full-bleed backdrop tinted `--p1`/`--p2`, 128px lead sprite, name at 13px, one giant ✋ READY tile (≥88px), two-note beep + vibration; `exitBattleMode` keeps releasing it. Picker tiles (`main.js:110-131`): 6px colour stripe, 96px lead, six 28px team sprites, 👑 if champion, badge count as coins; in junior the P1/P2 chip tap shows the picker instead of silently flipping (the chip is text Art can't read). Add `pass.js` to `SHELL_FILES`. | `js/pass.js`, `js/battle.js`, `js/main.js`, `index.html`, `css/gba.css`, `sw.js` | S / low |
| Versus 2.0 | `renderVersusMoves` (`battle.js:1224-1229`) uses the v19.3 tile renderer (export `renderMoveTiles(fighter, onPick, {junior})`). FAIR FIGHT toggle on the VS tile, default ON when either profile is junior: both sides built at `max(maxLevel(P1 team), maxLevel(P2 team))` — levels only go up, saves untouched; ⚖️ chip in the title. END MATCH two-step (arm → SURE? 2s) and the same for `#escape-btn` while `versusActive`. `stale(e)` guards in `versusRound`/`executeVersusMove`/`versusNextMon` (the documented unhandled-rejection crash). Match-over sprite-first: winner 128px + ⭐, loser with 💪, big REMATCH tile. Pure `fairLevel()` in `engine.js`. | `js/battle.js`, `js/engine.js`, `js/gym.js`, `css/gba.css` | M / medium |
| WHO'S THAT POKÉMON? quiz | `js/quiz.js` from a ❓ tile beside VS on the gym hub: 6 rounds alternating via `passTo`; species from the family union (fallback: any cached `pkmn:*` id, so it works offline); 160px `brightness(0)` silhouette + three 96px colour choices (same-gen decoys); tap → un-blacks over .3s steps(3), cry via `setCry`/`playCryAudio`; correct = ⭐ + confetti, wrong = the right one bounces and the round still awards 🔵 — never "WRONG". Names under choices in normal mode only. End: both star rows, no winner banner, PLAY AGAIN. Nothing persisted. | `js/quiz.js`, `js/pass.js`, `css/gba.css`, `index.html`, `sw.js` | M / low |

**Tests:** END MATCH during `performAttack` under fast mode → no pageerror, `#oops-modal` hidden (the v19.0 pin now passes green); versus renders `.move-btn.type-tile`; FAIR FIGHT builds both sides at the same level and neither save's `mons` changes; quiz round: 3 choice tiles exist and a tap resolves. **Screenshots:** whoplaying, pass card, versus arena, quiz — both sizes, junior.

---

### v19.10 — "Gifts & Saves"
**Kids notice:** Gabe can hand Art any Pokémon he owns — pass the tablet, Art taps the present, confetti — and Gabe keeps his too. ART'S name stops turning into gibberish. Dad can AirDrop the save file to himself from the iPad. The scary red SHOW A GROWN-UP screen never appears just because the tablet has looked at a lot of Pokémon.

| Feature | What / why | Files | Effort / risk |
|---|---|---|---|
| Gift a Pokémon (copy, never trade — schema-free variant) | `state.js`: refactor `recordCatch`/`ensureMon`/`setNick` into explicit `recordCatchFor(n,…)`/`ensureMonFor(n,…)`/`setNickFor(n,…)` that take the player number and **never touch `state.currentPlayer`** (no swap helper — judges flagged that as the cross-child crash path); current-player wrappers keep their names. Flow (`js/gift.js`): in dex-context PC (non-junior), a 🎁 corner button on tiles the other boy lacks → sprite dialog "GIVE PIKACHU TO ART?" → `passTo(other)` → receiver sees the sprite bounce in with ✅/✖ tiles → `recordCatchFor` + `ensureMonFor` at the giver's level + copy nick if none + `stats.giftsGiven++` (giver; stats shallow-merge) + `game-progress 'gift'` + full confetti. Receiver's team untouched. No limits, no currency. Trainer card row GIFTS GIVEN. | `js/state.js`, `js/gift.js`, `js/pc.js`, `js/progression.js`, `sw.js` | M / medium (writes to the other save — through explicit accessors, one `persist()`) |
| **ASK KEVIN** — Save survival kit | `navigator.storage?.persist?.()` on boot, result shown in Parent Tools. Export payload gains `exported`, `counts`, CRC32; import verifies the CRC → `TRUNCATED_CODE` → sprite-led "CODE CUT OFF, COPY AGAIN"; old codes still import. `downloadSaveFile` tries `navigator.canShare({files})` (Files/AirDrop/Mail) before the blob anchor; Parent Tools shows LAST BACKUP: N DAYS AGO from a device-local key. Fix `cleanName` non-idempotence: store raw trimmed names, escape only at render via one `esc()`; `hydratePlayer` decodes already-escaped legacy names once. Clamp `items.masterBalls` ≥0 integer; validate `badges` against known ids. `SHELL_FILES` covers the new modules. | `js/state.js`, `js/settings.js`, `js/devtools.js`, `js/config.js`, `js/main.js`, `CHANGELOG.md` | M / medium (state.js) |
| Storage budget + offline completeness | `slimPokemon` keeps move names only, drops `official*` URLs, caps flavor texts at 3; `CACHE_KEY` → `_v3`; LRU eviction of 50 least-touched `pkmn:` entries before wiping; `persist()`'s eviction also calls `api.dropInMemoryCache()` so the banner can't refill; `saveCache` debounced 150ms. `api.isCached(id)` + throttled `warm(ids)`; explore filters pools to cached ids when offline (📡 chip, information not a lock); gym hub warms the current stop's roster; dex stays put with a 📡 silhouette instead of the failure net. Self-host Press Start 2P (`fonts/`, `@font-face`), drop the Google Fonts link and hosts from `sw.js:54`. Cache/save sizes in Parent Tools. | `js/api.js`, `js/state.js`, `js/explore.js`, `js/gym.js`, `js/dex.js`, `sw.js`, `css/gba.css`, `fonts/`, `index.html`, `js/devtools.js` | M / low |

**Tests:** gift 25 P1→P2: P2 caught includes 25, P1 still has it, `state.currentPlayer` unchanged throughout; a name with an apostrophe survives two reloads; a truncated code leaves the save and `PREV_KEY` untouched; near-quota init script → `persist()` succeeds and the banner never appears; block pokeapi routes mid-run → explore still yields an encounter and the dex does not open `#oops-modal`; smoke no longer needs Google Fonts egress. **Screenshots:** gift dialog and receive screen in junior; settings/Parent Tools.

---

### v19.11 — "Buddy"
**Kids notice:** Art's lead Pokémon walks with him — it stands in the corner of the map and the gym hall, runs into the grass when he explores, cheers when he wins. A 🔍 PLAY tile: five Pokémon hide in the grass, tap the matching one, confetti and its cry. CARD becomes a poster with his buddy huge in the middle, his badges as shiny coins and his team bouncing — something to show Gabe and Dad.

| Feature | What / why | Files | Effort / risk |
|---|---|---|---|
| Buddy follows you | `js/buddy.js`: one `#buddy` (fixed bottom-left, 64px, z490) from `team[0] || caught[0]` using the cached animated BW gif (`api.js:53`, no consumer today) with `PIXEL_SPRITE` fallback; shown on explore and gym, hidden on dex (LEAD chip already) and in battle; slides away while any overlay is open (called from the open/close helpers). Tap = pet. Choreography: `.buddy-run` on `enterHabitat`, `.buddy-cheer` on `battle-victory`, `.buddy-sparkle` on heal. Junior by default; one CSS line enables it for Gabe (§7 Q6). | `js/buddy.js`, `js/explore.js`, `js/gym.js`, `js/main.js`, `css/gba.css`, `sw.js` | M / low |
| FIND IT! mini-game | `js/findit.js` + `#findit-modal`: 5 distinct ids from `caught` (padded from the current habitat's common pool), shown in colour 1.5s then silhouetted on a 2×3 grid of 96px tiles, target 120px at the top; correct = brightness ramp, `sfx.catch`, cry, 24 confetti, +10 XP to the lead via `addXp`; wrong = `.wobble` + `sfx.shake`, nothing else, no counter, no timer, no fail; after 5 rounds a ⭐ screen with the five sprites bouncing. Decoys get harder silently (same type). Entry: the PLAY tile from v19.6 (Gabe reaches it from the explore header). All sprites already SW-cached, so it works offline. | `js/findit.js`, `index.html`, `css/gba.css`, `js/main.js`, `sw.js` | M / low |
| My Poster (junior trainer card) | `openTrainerCard` junior branch renders `#card-poster`: 160px lead (gif if cached) on a `--p-primary` backdrop, name at 20px as the only text, favourites shelf (or team strip), badges as 48px coins (ink-outlined, gym colour + ✓ when earned, 24px leader lead-mon sprite on leader coins from `gymdata.js`), 6-segment dex meter, no quests/stats/Oak. Tap a coin/sprite → cry or 1320Hz ding. Sticky 56px ✖ top-right. 📸 SHOW mode: tapping the background hides the close and enlarges everything for 10s. Gabe's card: coins in three labelled rows, tap-to-flip descriptions, mini bars, 8px captions (§3.7). | `js/progression.js`, `index.html`, `css/gba.css`, `js/gymdata.js` (read-only) | M / low |

**Tests:** `#buddy` visible on explore in junior and hidden when `#settings-modal` opens; one FIND IT round completes and the lead's xp increases by 10; junior card renders `.coin` tiles and no `.card-quest`; normal card renders 3 row labels. **Screenshots:** explore with buddy, findit board, junior poster, normal card — both sizes.

---

*Optional v19.12 "Pairs & Tower" if the cadence holds:* MATCH PAIRS (shares the PLAY chooser and reward code with FIND IT, S/low) and BATTLE TOWER streak ladder with pick-one spoils (L/medium — the council's v20 pick-one trial; needs the synthetic-trainer `opts.def` seam from `startTrainerBattle`). Both are judge-approved "keep warm", not rejected.

# 5. Rejected / deferred

**Rejected (rule violation, cross-child save write, or rollback hazard):**
- **Gen 6-8 expansion to #905** — older hydrate filters ids >649, so any rollback silently deletes the boys' Gen-6 catches; MAX_ID lives in three places; council named "more generations" a month-two non-goal.
- **Regional forms** — depends on the above; a fifth schema field; form ids fall outside every `isDexId` filter.
- **FIND IT ▶ seen-gate routing on the dex** — takes away Gabe's instant CATCH from any dex page (rule 3); Safety & Trust panel rejected seen-gates. The habitat chip gives the "where does it live" hint without removing anything.
- **Evolution stones + night-only evolutions** — gates evolutions Gabe gets free today (Lv30 rule), adds `items.stones`, and a clock the boys don't control. The branching chain + picker ships without them (v19.8).
- **Legend Board's "IT NEEDS A REST" non-catch** — breaks "I won, so I got it" on the most exciting encounter with no guaranteed throw.
- **Tag Team / Tag Battle / Brother Rescue** — puts Art's no-faint shield inside Gabe's fight (advertises the accommodation to the one person who'll notice, rule 2), makes every gym unlosable, and needs owner-aware junior gates plus cross-save writes mid-animation on the mutable singleton.
- **`forPlayer(n)` currentPlayer-swap helper / Family badges via swap** — if anything throws between swap and restore, `player()` points at the wrong boy for every later `persist()`. v19.10 uses explicit `*For(n)` accessors instead.
- **Rivalry board (side-by-side star rows)** — adjacent rows are a leaderboard whatever the copy says; each boy's stars stay on his own card.
- **SHOW DAD canvas + share** — tainted-canvas workarounds and iOS file-share flakiness Kevin cannot debug; the Poster + a manual screenshot gives the same fridge photo.
- **Bottom nav rewrite (Polish #4)** — rearchitects navigation across ten files to replace tiles the boys already know; the junior big-tile home gets the Pikachu-bigger win without it.
- **16px inline-SVG icon set (Polish #3 half)** — engineer busywork; emoji is Art's language; item sprites cover the pixel-icon need.
- **Monolithic token sheet (Polish #1 as one commit)** — sliced into v19.1 (additive) and per-sprint migrations instead.
- **Removing the CRT PC / global scanlines for Gabe** — the green computer has personality and Art calls it his computer; Art gets the sticker book instead.
- **Feature-flag switchboard** — per-device flags let Kevin's phone, the iPad and the suite run three different apps; short branches + `git revert` already give rollback.
- **Fishing's 1.5s reaction window** — a timer by another name for Gabe; if fishing ships, the hook waits for the tap.
- **Sparkle Swarm with a depleting counter** — a ✨ card that stops sparkling is something visibly running out (Sparkle Spot rotates daily instead).
- **Two-finger / long-press shiny toggle** — council rejected gesture rewrites; a visible chip.
- **Day/night as a requirement** — boosts and a ☀️/🌙 chip are fine later; never a gate.
- Already-dead ideas re-confirmed: TTS/narration, currency, streaks, flee timers, level caps, accuracy/PP/status, kernel rewrite, CI/build step, PIN hashing.

**Deferred (good, later, mostly month three):**
- **Moveset picker + NEW MOVE** (`mons[id].moves` schema) — after `moves.json` exists it becomes a 4-name array; bundle the schema ask.
- **Abilities** — stateful ones (sturdy/intimidate/speed-boost) wait for the versus/ceremony extraction; pure damage modifiers could return as engine-only maths.
- **Rival Jax, Battle Tower, Legend Board with a guaranteed third throw, Roaming legendary with footprints** — keep warm; Tower is the council's pick-one-spoils trial.
- **Mystery Egg** (council-endorsed, `egg` schema), **SEEN + Habitat Log** (`seen` schema), **Fossils**, **Fishing** (tap-to-hook form) — after the save has a share-sheet backup story (v19.10).
- **Family Dex, TOGETHER hub, Name-it-for-your-brother, Trophy Room** — read-only and cheap; slot in after v19.11 if the brothers' week lands well.
- **Battle phase guard + `js/versus.js`/`js/ceremony.js` extraction** — the right next engineering step once the arena work settles; not needed to ship the v19 sprints above.
- **Loading skeletons / empty states, app icon + splash PNGs** — §6 covers the icon; skeletons ride along with whichever sprint touches `loadPoke` next.
- **Pairs mini-game** — v19.12 candidate.

# 6. Tools & skills Kevin should set up first

1. **Test environment on this machine (ready).** Node v20, Playwright Chromium and the smoke suite all work here — 159 checks passed today. Push access to GitHub over SSH is confirmed. **The `gh` CLI is not installed**, so pull requests, releases and issues have to be done by plain `git` (tags + push) or in the browser; `sudo apt install gh` (or the GitHub CLI installer) would let Claude open PRs and GitHub Releases for you. PokeAPI is reachable from here, so the move-bake script (v19.3) will work.
2. **Colour emoji font — done today.** Headless Chromium had no emoji face (every icon rendered as a box). Noto Color Emoji is now installed for your user (`~/.fonts`), so screenshots show 🔥/⭐ roughly as the iPad does. Note in `test/scenes.mjs` that Apple Color Emoji is taller — the explicit icon box in §3.6 is what makes the layout font-independent.
3. **The boys' actual devices, recorded.** Write the iPad model and iOS version (Settings → General → About) into `CLAUDE.md`. It decides whether `dvh` works (iOS ≥15.4), whether `navigator.share` with files works (iOS ≥15), and whether `.ogg` cries play. Test on the iPad within an hour of every push, and once on an iPhone (375×667 class) for the arena sprint.
4. **Safari Web Inspector from a Mac** (if there is one): Settings → Safari → Advanced → Web Inspector on the iPad, then Develop menu on the Mac. This is the only way to see console errors from the installed PWA. If there is no Mac, the `#oops-modal` failure net is the fallback — keep it.
5. **Self-hosted font:** download `press-start-2p` (OFL) as `.woff2` — `curl` the URL Google Fonts serves for the `@font-face` (open `https://fonts.googleapis.com/css2?family=Press+Start+2P` in a browser, copy the `fonts.gstatic.com` URL) into `fonts/press-start-2p.woff2`. One-time, ~30KB, commit it.
6. **App icon pipeline with zero new tools:** author `icons/icon.svg` (64×64 pixel Pokédex), then `test/make-icons.mjs` renders it with the installed Playwright Chromium at 180/192/512 (+512 maskable with padding) and writes PNGs — no ImageMagick needed. Point `apple-touch-icon` and the manifest at them; set `background_color`/`theme_color` to `#16162a`; update the manifest description from "original 151".
7. **Git habits for the cadence:** `git tag v19.x` on every release (the release script prints the commands); a branch for anything longer than a day; rollback = `git revert <sha>` then run the release script for the next patch version. Never edit the save key by hand; the Parent Tools export is the backup.
8. **A one-line "watch Art play" ritual:** after v19.2 and v19.6, sit beside Art for one unaided gym battle and one sticker-book session and write three bullets in `ROADMAP.md`. Roadmap Risk #4 asked for this and it never happened; it is the only test for "understood with zero words".

# 7. Questions for Kevin

1. **What iPad (model + iOS version) do the boys use, and does Art ever play on your phone?** — Default: assume iOS 16+ and yes to phones, so 375×667 fits are a hard requirement (v19.2) and `vh` fallbacks ship anyway.
2. **Schema: may we add `favorites: []` (≤6 ids, additive, v19.6)?** Later asks would be `egg`, `seen`, `mons[id].moves`. — Default: yes to `favorites` now, decide the other three after v19.10's backup story lands.
3. **May we edit `state.js` for the save survival kit (apostrophe fix, CRC on export, share-sheet backup, clamps) in v19.10?** No version bump, additive only. — Default: yes; the apostrophe bug corrupts a child's own name today.
4. **Battle exit for Gabe: two-tap arm or hold-to-run like Art?** — Default: two-tap for Gabe (faster, still can't mis-tap), hold for Art.
5. **Keep the green CRT PC for Gabe, or reskin it to paper like everything else?** — Default: keep it for Gabe (tokenised, 8px labels), sticker book for Art.
6. **Should Gabe also get the buddy companion and the pet tap?** — Default: pet tap yes (both), buddy junior-only with a one-line CSS switch you can flip.
7. **Versus: is FAIR FIGHT (level-equalising) on by default whenever either profile is junior, and does Art actually play VS?** — Default: on when either is junior; if Art never plays VS, v19.9's quiz is the brothers' game and Versus 2.0 shrinks to the crash fix + two-tap quit.
8. **Cadence: can you push and test on the iPad every 2–3 days for ~6 weeks, or should sprints be batched into weekly releases?** — Default: 2–3 days; if not, pair sprints (0+1, 2+3, 4+5…) but never ship v19.2 without v19.0's harness.
9. **Sound: is the iPad usually muted when they play?** — Default: assume often muted, so every ceremony must read with sound off (it does, by design), and the HAPTICS toggle is mostly for the phone.
10. **Junior gear: hold-to-open (1200ms) or leave it as it is?** — Default: hold-to-open; Art can currently flip his own junior toggle in one tap from the settings screen.