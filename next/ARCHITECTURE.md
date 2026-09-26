# SPROUT ROAD (`/next/`): architecture contract, v20.0-alpha

This is the contract every builder codes against. If you need something that
is not here, add it to your own module. Never guess another module's export.
Plan and rulings: `../ROADMAP-v20.md`. Hard rules: `../CLAUDE.md`.

## Ground rules (non-negotiable)

- Vanilla ES modules. **No build step and no dependencies.** Every import is
  relative and ends in `.js`, and every name imported must exist as a named
  export. A missing export is a SyntaxError, which means a black screen.
- **No `innerHTML` with interpolated values anywhere in `next/`.** Build DOM
  with `h()` from `ui/h.js`, which sets text via `textContent`. A test greps
  for this.
- **No speech.** No `speechSynthesis` and no TTS.
- **Kid-facing words** are short, uppercase and ≤6 words. **Prereader scenes
  show no words** except names and numbers. Meaning comes from pictures, colour
  and motion.
- **Prereader never loses.** His mons never faint and his balls always catch.
  The UI never mentions either.
- Every wait longer than 250ms goes through `wait(ms)` from `core/pace.js`, so
  a tap hurries it and `?fast=1` skips it.
- Sizes: **375x667 and 390x844 must fit** with no scrolling on the main scenes.
  Prereader tap targets are ≥60px and text is ≥8px. Honour safe areas.
- Sprites and cries load from `https://raw.githubusercontent.com/PokeAPI/...`
  exactly as the classic app does (Kevin's ruling: art stays as it is).
  PokeAPI data comes from `https://pokeapi.co`. There are no other hosts.

## Files and owners

```
next/index.html            shell: CSP meta, <main id="app">, one <script type=module src="main.js">
next/main.js               boot: load save, pick player, route scenes           [integrator]
next/style.css             all styles, GBA palette, CSS vars                    [shell]
next/sw.js                 scope /next/, network-first shell, cache-first sprites [shell]
next/core/pace.js          wait(ms), PACE {fast}, initPace()                    [core]
next/core/rng.js           seededRng(seed) -> () => [0,1), rngFromUrl()         [core]
next/core/save.js          v3 load/persist/export/import + v2 merge             [core]
next/core/migrate.js       pure: fromV2(v2save) -> v3; mergeV2(v3, v2) -> v3     [core]
next/core/validate.js      pure: cleanPlayer(raw) -> safe player                [core]
next/core/store.js         state singleton + tiny event bus                     [core]
next/core/api.js           PokeAPI fetch + IndexedDB-or-memory cache            [core]
next/ui/h.js               h(tag, props, ...children), clear(el), $(sel)        [shell]
next/ui/sprite.js          spriteImg(id, {shiny, back, animated}) -> <img>, SPRITE urls [shell]
next/audio/audio.js        unlock, sfx.*, cry(id) with ogg->synth fallback, mute [shell]
next/audio/music.js        ported chiptune (copy ../js/music.js, adapt imports)  [shell]
next/data/engine.js        COPY of ../js/engine.js (unchanged API)              [battle]
next/data/gymdata.js       COPY of ../js/gymdata.js                             [road]
next/data/chapters.js      12 chapters built on GYMS (see below)                [road]
next/data/moves.json       COPY of ../data/moves.json                           [battle]
next/battle/createBattle.js factory, no DOM                                     [battle]
next/scenes/battle.js      battle screen UI over createBattle                   [battle]
next/scenes/who.js         WHO'S PLAYING picker                                 [integrator]
next/scenes/garden.js      Art's Garden + BULBA                                 [garden]
next/scenes/road.js        Gabe's Verdant Road map + chapter screen             [road]
next/scenes/rest.js        campfire rest scene after a chapter                  [road]
next/test/*.test.mjs       node --test unit tests (pure modules)                [each owner]
test/next-smoke.mjs        playwright smoke for /next/                          [integrator]
```

## Scene contract

Every scene module exports **`mount(root, ctx)`**, which returns an
**`unmount()`** function. `root` is an empty `<section>` the router owns.
`ctx = { go(sceneName, params), store, params }`. Scene names are `who`,
`garden`, `road`, `battle`, `rest`. A scene must clean up all of its timers,
listeners and rAF in `unmount`.

`battle` params: `{ enemyTeam:[{id,level}], trainer:{name,taunt,leader:bool}|null, wild:bool, returnTo:'road'|'garden', onEnd:'chapter:<i>:<t>'|null }`.
When a battle ends it calls `ctx.go(params.returnTo, { result:'win'|'lose'|'caught'|'fled', onEnd })`.

## Store (`core/store.js`)

```js
export const store = {
  save,            // the v3 save object (below)
  current,         // 1 | 2 : active player number
  player(),        // -> save.players[current]
  on(evt, fn) -> off, emit(evt, data),
  commit(),        // persist() + emit('change')
};
```

## Save v3 (`core/save.js`, key `pokedexos_save_v3`)

**`pokedexos_save_v2` is only ever READ. Never write, remove or rename it.**

```js
{ version: 3, created: 'YYYY-MM-DD',
  players: { 1: Player, 2: Player } }
Player = {
  name, profile: 'reader'|'prereader',          // from v2 settings.junior
  caught:[ids], team:[ids<=6], mons:{id:{level,xp}}, shinies:[ids], nicks:{id:str},
  favorites:[ids], items:{masterBalls}, badges:[str], gyms:{beaten:{key:true}},
  champion:null|{date,team,levels}, stats:{catches,battlesWon,battlesLost,versusWins,explores},
  bulba:{ petals:0, stage:1, stayStone:false, visitors:[ids] },   // stage 1..3 = Bulbasaur/Ivysaur/Venusaur
  garden:{ plots:[{x,y,kind,grown}] (<=60), berries:0 },
  road:{ chapter:0, cleared:{ 'c<i>-t<j>': true }, bloomed:[chapterIdx] },
  legacy:{}                                      // unknown v2 keys, verbatim, NEVER rendered
}
```

- `load()`: v3 exists → validate it → **`mergeV2(v3, v2)`** if v2 exists
  (additive, see below) → return. No v3 → `fromV2(v2)` or fresh.
  **Before the first v3 write, copy the raw v2 string to
  `pokedexos_v2_backup_<date>`** (only when no backup key exists yet).
- `mergeV2` runs on every boot, so progress made in the classic app shows
  up here. It is **union only and never removes anything**:
  - caught, shinies, favorites and badges: set union.
  - mons: take whichever has the higher level, then the higher xp.
  - gyms.beaten: union. stats and items: max per key. nicks: v3 wins, else v2.
  - champion: keep v3's, else v2's. profile: keep v3's (it only changes via the grown-up toggle).
- `persist()`: JSON to `pokedexos_save_v3`, in try/catch. On a quota error,
  drop the API cache and retry once, then emit `'saveFailed'`.
- `exportCode()` / `importCode(code)`: base64url JSON plus a CRC32. Import
  goes through `validate.cleanPlayer`, and `importCode` accepts v2 codes too
  (pass them through `fromV2`). Before an import overwrites anything, snapshot
  the current v3 into `pokedexos_save_v3_prev`.
- **Petals only go up.** Neither validate nor merge may ever lower
  `bulba.petals` or `bulba.stage`.

## Player identity

In v2, player 1 is usually Gabe and player 2 is Art, but do not hardcode
that. The picker shows both players' names plus their lead sprite (for a
prereader, Bulbasaur's sprite with a leaf badge). The last choice lives in
`localStorage['pokedexos_next_lastplayer']`. Route: prereader → `garden`,
reader → `road`.

## Battle factory (`battle/createBattle.js`, DOM-free and unit-tested)

```js
export function createBattle({ myTeam, enemyTeam, profile, rng, moveLookup, wild, leader })
// myTeam/enemyTeam: [{ id, level, name, types:[..], stats:{hp,atk,def,spatk,spdef,spe}, moves:[{name,type,power,damage_class}] }]
// returns battle = {
//   state: { me:{active, team:[{...,hp,maxHp}]}, foe:{...}, turn, over:false, winner:null, phase:1 },
//   async choose({ kind:'move', index } | { kind:'switch', index } | { kind:'ball', ball:'poke'|'great'|'ultra'|'master' }) -> events[],
//   foeIntent()   // the move index the foe will use next (committed before the player acts)
// }
// events: [{type:'move', side, move, dmg, crit, eff, hpAfter} | {type:'faint', side} | {type:'phase2', side}
//          | {type:'catch', shakes, success} | {type:'end', winner}]
```

Use `engine.computeDamage` / `catchProbability` / `applyXp`. For a
prereader: enemy damage is capped by `JUNIOR_MAX_TAKE` and HP floors at 1
(no faint), and his own hits get `JUNIOR_MIN_HIT`. Balls always succeed.
**Leader phase 2:** at ≤50% HP on the leader's LAST mon, emit `phase2`
once, heal it +25% maxHp, and raise its attack by 1.25×. A new object is
made per fight, with **no module-level mutable state**.

## Chapters (`data/chapters.js`)

`export const CHAPTERS = GYMS.map((g, i) => ({ idx:i, key:g.key, name:g.name, type:g.type, emoji:g.emoji, palette:{ ground, sky, accent }, trainers: g.trainers }))`
Hand-author a palette per type. `chapterKey(i,j) = 'c'+i+'-t'+j`. Chapter
`i` is open when `i === 0` or chapter `i-1`'s leader is cleared. Clearing
the leader adds `i` to `road.bloomed` and adds the gym badge key `g.key`
to `badges` if it is missing.

## Visual language

GBA palette, pixel font `Press Start 2P` from `../fonts/`, and
`image-rendering: pixelated` on sprites. Juice:
- **Damage count-up:** numbers tick up from 0 over ≤400ms. Super-effective
  hits turn orange with a flame glyph, crits get a scale punch.
- **Calm** (the default for a prereader): no screen shake, no scale punch,
  no full-screen flash anywhere. Never more than 3 flashes per second.
- Everything animated respects `prefers-reduced-motion`.

## Shared helper signatures (owners MUST export exactly these; everyone else may rely on them)

```js
// ui/h.js
export function h(tag, props = {}, ...children)  // props: {class, style:{...}, attrs:{...}, on:{click:fn,...}, dataset:{...}, text}
                                                 // children: string|number (-> text node) | Node | array | null/false (skipped)
export function clear(el)
export const $ = (sel, root = document) => root.querySelector(sel)
// ui/sprite.js
export const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites'
export function spriteUrl(id, { shiny=false, back=false, animated=false } = {})   // animated -> gen5 black-white animated gif
export function spriteImg(id, opts = {})    // <img class="sprite" alt="" draggable=false>, falls back to a pokeball data-URI on error
export const ITEM = name => `${SPRITE_BASE}/items/${name}.png`
// audio/audio.js
export function unlock()                   // call on first pointerdown; resumes the single AudioContext
export const sfx = { tap(), grow(), petal(), hit(eff /*0.5|1|2*/), crit(), faint(), ballThrow(), shake(), caught(), win(), levelUp(), bloom(), evolve(), phase2() }
export function cry(id)                    // canPlayType('audio/ogg') ? PokeAPI latest ogg : synth chirp. Never throws.
export function isMuted(); export function toggleMute()
// core/api.js
export async function getMon(id)  // -> { id, name (UPPERCASE display), types:[..], baseStats:{hp,atk,def,spatk,spdef,spe}, moveNames:[..], captureRate }
export function moveInfo(name)    // from data/moves.json (sync after ready) -> {name,type,power,damage_class} | null
export const movesReady           // Promise resolving when moves.json is loaded
export async function buildFighter(id, level, { seed }) // -> fighter object as createBattle expects (uses engine.computeStats + seedMoveset)
// core/pace.js
export const PACE = { fast:false }; export function initPace(); export function wait(ms)  // resolves early on any pointerdown; instantly-ish when fast
// core/rng.js
export function seededRng(seed); export function rngFromUrl()  // ?seed=N -> seeded, else Math.random
```
Tests may load the app with `?fast=1&seed=1`. The smoke suite mocks
pokeapi.co and raw.githubusercontent.com, so don't add hosts.
