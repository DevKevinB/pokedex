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
next/scenes/rest.js        campfire rest scene after a chapter (+ 📮 postcard)  [road]
next/scenes/hatch.js       the egg ceremony (route AND a Road overlay)          [road]
next/data/rival.js         Rival Thorn: team, placement, results                [road]
next/scenes/together.js    PLAY TOGETHER seats + mode pick                      [together]
next/scenes/family-table.js co-op battle; exports makeStage() for versus        [together]
next/scenes/versus.js      Couch Versus (reader vs DAD, curtain between picks)  [together]
next/scenes/lock.js        picture lock (overlay via openLock, or a route)      [together]
next/scenes/postcard.js    FAMILY POSTCARD scene                                [postcard]
next/ui/postcard.js        makePostcard() -> PNG Blob (canvas, CORS sprites)    [postcard]
next/scenes/dex.js         the Pokédex grid + detail card + NAME ME keypad      [dex]
next/scenes/dex-logic.js   pure: names, search, nicknames, favourites, team rules [dex]
next/scenes/team.js        the team editor (slot 1 = LEAD)                      [dex]
next/scenes/wild.js        TALL GRASS in bloomed regions (+ FARAWAY LAND)       [wild]
next/data/habitats.js      habitats, chapter->habitat, encounter rolls          [wild]
next/core/evo.js           evolution chains (memory-cached), evolveRoute, evolveMonIn [wild]
next/scenes/evolve.js      the evolve screen (EVOLVE / WAIT, branch picker)     [wild]
next/battle/rules-pro.js   createProBattle: Pro Rules (status, stages, abilities) [pro]
next/scenes/challenge.js   DAD'S CHALLENGE: Pro rematches with seed codes       [pro]
next/scenes/book.js        Art's Sticker Book (read-only, no words)             [book]
next/data/round2.js        ROUND 2: remixed rosters, leader gimmicks, shiny aces  [round2]
next/data/wild-chapters.js WILD CHAPTERS: 6 postgame chapters + progress rules    [wildch]
next/data/validate-chapter.js strict chapter validator; loadChapters skips bad ones [wildch]
next/data/sanctums.js      THROUGH THE ROOTS: shrines, 23 legendaries, rules      [roots]
next/scenes/roots.js       the roots under the Tree: tunnel, shrine grid, sanctums [roots]
next/data/decor.js         Art's decorations (1 per 10 petals) + accessories (1 per 25) [garden]
next/manifest.webmanifest  'Sprout Road' PWA manifest, scope ./                 [integrator]
next/test/*.test.mjs       node --test unit tests (pure modules)                [each owner]
test/next-smoke.mjs        playwright smoke for /next/                          [integrator]
```

## Scene contract

Every scene module exports **`mount(root, ctx)`**, which returns an
**`unmount()`** function. `root` is an empty `<section>` the router owns.
`ctx = { go(sceneName, params), store, params }`. Scene names are `who`,
`garden`, `road`, `battle`, `rest`, `hatch`, `together`, `family-table`,
`versus`, `lock`, `postcard`, and (batch 3) `dex`, `team`, `wild`, `evolve`,
`challenge`, `book`, and (batch 4) `roots`. An unknown name goes to `who`; `garden` for a
reader goes to `road`; `hatch` for a prereader goes to `garden`. A scene must
clean up all of its timers, listeners and rAF in `unmount`.
`body.calm` follows the current player's profile, except on the shared scenes
(`who`, `together`, `family-table`, `versus`, `lock`, `challenge`), which are never calm-gated.

Batch 2 params:
- `together` / `family-table`: `{ battler:1|2, helper:1|2 }` (sanitised by `together.seatsFrom`). `versus`: `{ battler }`.
- `lock`: `{ player }` (who.js normally uses the `openLock()` overlay instead).
- `hatch`: none. The Road also plays it as an overlay when `readyToHatch(p)`; its OK goes to `road`.
- `postcard`: `{ returnTo, returnParams?, highlight? }`. BACK calls `go(returnTo, returnParams)`; only integer
  `chapter`/`battler`/`helper` survive in `returnParams`. Entry points: the rest scene's 📮 button
  (`returnTo:'rest'`, `returnParams:{chapter}`) and the ▶ on the Family Table / Couch Versus result card
  (`returnTo:'together'`, `returnParams:{battler, helper}`).

Batch 3 params and entry points:
- `dex` / `team`: `{ returnTo?, returnParams? }` (only a plain scene name survives; default `garden` for a
  prereader, `road` for a reader). Entry: the Road header 📖 (dex) and lead-sprite (team) buttons; the dex
  top bar's TEAM button goes to `team` with `{returnTo:'dex', returnParams:{returnTo}}`.
- `wild`: `{ place:<chapterIdx>|'faraway' }` walks into that grass; `{}` is the picker; back from battle it
  gets `{ result, onEnd:'wild:<place>:<id>:<0|1>' }`. Entry: the TALL GRASS button on a bloomed chapter screen.
  Its battles pass `shiny:true` for a shiny encounter (the battle view shows the foe shiny).
- `evolve`: `{ queue:[{id, options:[{id,name}]}], returnTo, returnParams, player?:1|2 }`. Reached only through
  `core/evo.js evolveRoute()`. `returnParams` keeps primitives plus one nested level (`cleanReturnParams`).
  **A prereader never reaches it** (`evolutionsDue` returns `[]` for him; Bulba's bud is his evolution).
- `challenge`: `{ battler?, returnTo?:'who'|'together'|'versus', returnParams?, code? }`. Entry: the grown-up
  panel's 🏆 DAD'S CHALLENGE (`returnTo:'who'`) and the 🏆 PRO button on Couch Versus's DAD'S TEAM panel.
- `book`: `{ returnTo? }` (garden, road, who or together; default garden). Entry: the 📖 button in the Garden.
  Read-only: it never writes the save.

**After a battle** (`scenes/battle.js` finish, and the Family Table result card): the ids that levelled up go
through `evolveRoute(player, ids, returnTo, {result, onEnd})`, started as the win card opens and capped at 4s.
When something can evolve the route is `['evolve', {queue, returnTo, returnParams}]`, and the evolve screen
then calls `go(returnTo, returnParams)`, so the Road and the grass still get `result` and `onEnd`. A
`params.coop` ride-along (and a flee) always returns directly. The Family Table passes `player: battler`.

Batch 4 params, entry points and end codes (integrator wiring):
- `roots`: `{ view?:'sanctums' }` (default: the one-tap tunnel). Entry: the glowing door in the Venusaur Tree's
  roots on the Road (shown once the Champion chapter has bloomed or the player is a classic Champion; entering calls
  `store.openRoots()`). Not in `SHARED`, so it follows the player's calm setting. Its 🌿 goes to
  `wild` with `{place:'faraway', home:'roots'}`; `home:'roots'` makes the grass's BACK return under the Tree.
- The post-Champion Road carries three things, each in its own spot so none covers another on 375x667:
  the roots door at the Tree's base (the scrolling world), the 🪧 WILD signpost across the road from Old
  Venusaur (opens the Wild Chapters path layer, which hides the bottom bar), and the ⚔️2 ROUND 2 toggle at the
  left of the bottom bar (readers only; a prereader gets no toggle). A smoke check asserts they never overlap.
- End codes, all saved by `scenes/battle.js` in the battle's OWN commit (so a closed app on the win card or the
  evolve screen loses nothing), then re-applied idempotently by the scene the battle returns to:
  - `'round2:<i>:<j>'` (returnTo `road`): `round2.applyR2Win`; marks ride back as `roundTwo:{bloom, shiny}`.
  - `'wild:<i>:<j>'` (two parts, returnTo `road`): `wild-chapters.applyWildWin` on a win; marks
    `wildWon:{idx, j, bloom}`. The tall grass's own four-part `'wild:<place>:<id>:<0|1>'` (returnTo `wild`) is a
    different code and is never touched by this.
  - `'sanctum:<key>'` (returnTo `roots`): `sanctums.applySanctumEnd` on a win or a catch; marks
    `sanctumWon:{key, fresh, finale}`. A loss or a run changes nothing.
  battle.js loads `wild-chapters.js` / `sanctums.js` lazily (`import()`), like the Road does, so a broken data
  file only skips the early save. All mark keys are letters only, so `evolve.cleanReturnParams` keeps them;
  `roots` is in evolve's allowed `returnTo` set.

Battle end codes (`params.onEnd`) handled by the Road: `'chapter:<i>:<j>'`, `'guardian:<i>'`
(Old Venusaur, a win gives a seed) and `'rival:<i>'` (Rival Thorn, win or lose recorded).
Every Road battle carries `params.berries` = Gabe's unwrapped Oran Berries (`chapters.withBerries`).

`battle` params: `{ enemyTeam:[{id,level}], trainer:{name,taunt,leader:bool}|null, wild:bool, returnTo:'road'|'garden', onEnd:'chapter:<i>:<t>'|null, berries?:number, coop?:object }`.
`berries` (optional, readers only): Oran Berries the caller offers from Art's gifts. The BERRY button shows `min(berries, store.giftCount())`
and each berry eaten calls `store.takeGift()`. `coop` (optional): hooks, see "Battle view exports".
Batch 4 extras (optional): `gimmick:<key>` (a ROUND 2 leader's phase-2 gimmick, `round2.makeGimmick`, ignored for coop),
`legendary:true` (a sanctum fight; informational, the view does not change), `shiny:true` (the foe shows shiny).
When a battle ends it calls `ctx.go(params.returnTo, { result:'win'|'lose'|'caught'|'fled', onEnd })`.

## Store (`core/store.js`)

```js
export const store = {
  save,            // the v3 save object (below)
  current,         // 1 | 2 : active player number
  player(),        // -> save.players[current]
  on(evt, fn) -> off, emit(evt, data),
  commit(),        // persist() + emit('change')
  addGift(n), takeGift(), giftCount(), addPostcard(date), addVersusWin(w),
  setLock(n, pics), lockOpens(n, pics),   // see "Save v3" below
  placeDecor(kind,x,y,n?), moveDecor(i,x,y,n?), setAccessory(key,n?), openRoots(n?), addSanctum(key,n?),  // batch 4
};
```

## Save v3 (`core/save.js`, key `pokedexos_save_v3`)

**`pokedexos_save_v2` is only ever READ. Never write, remove or rename it.**

```js
{ version: 3, created: 'YYYY-MM-DD',
  players: { 1: Player, 2: Player },
  family: { postcards:0..99999, lastPostcard:'YYYY-MM-DD'|null, versus:{ gabe:0..99999, dad:0..99999 },  // shared
            challenge:{ wins:[{ code:'MOSSY-714', who:'dad'|'reader', date:'YYYY-MM-DD' }] (<=50) } },   // batch 3
  gifts:  { toReader:0..99 } }   // berries Art grew, waiting on the reader's Road as leaf-stamped gifts
Player = {
  name, profile: 'reader'|'prereader',          // from v2 settings.junior
  caught:[ids], team:[ids<=6], mons:{id:{level,xp}}, shinies:[ids], nicks:{id:str},
  favorites:[ids], items:{masterBalls}, badges:[str], gyms:{beaten:{key:true}},
  champion:null|{date,team,levels}, stats:{catches,battlesWon,battlesLost,versusWins,explores},
  bulba:{ petals:0, stage:1, stayStone:false, visitors:[ids],   // stage 1..3 = Bulbasaur/Ivysaur/Venusaur
         accessory:null|key },                                    // batch 4: the cosmetic he wears (safe key <=24)
  garden:{ plots:[{x,y,kind,grown}] (<=60), berries:0,
           decor:[{ kind:key<=24, x:0..1, y:0..1 }] (<=40) },     // batch 4: Art's placed decorations
  road:{ chapter:0, cleared:{ 'c<i>-t<j>' | 'r2-c<i>-t<j>' | 'w<i>-t<j>': true }, bloomed:[chapterIdx],
         r2bloomed:[chapterIdx],        // batch 4: ROUND 2 leaders beaten (0..11)
         wildBloomed:[wildIdx],         // batch 4: Wild Chapters bloomed (0..23)
         roots:{ opened:false, sanctums:{ <key>: true } },   // batch 4: Through the Roots postgame
         seeds:0..99,                  // Old Venusaur seeds earned
         guardians:{ <chapterIdx>: true },   // which Old Venusaur guardians he beat (keys '0'..'11')
         hatched:false,                // his own Bulbasaur has hatched (only a real `true` counts)
         rival:{ wins:0, losses:0, last:-1 } },   // last = chapterIdx of the last rival fight, -1 = none
  lock: null | { pics:[id,id,id] },  // picture-lock on this card: EXACTLY 3 dex ids, order matters, repeats allowed
  legacy:{}                                      // unknown v2 keys, verbatim, NEVER rendered
}
```

**New fields (batch 2), all optional on disk.** An older v3 save without them
loads with the defaults above (`freshRoad()`, `lock:null`, `freshFamily()`,
`freshGifts()`); nothing needs a version bump.
- Every counter clamps (`seeds` and `gifts.toReader` to 0..99, the rest to
  0..99999); junk, negatives, NaN and poisoned keys are cleaned, never thrown.
  A lock that is not exactly 3 valid ids becomes `null` (a mangled lock opens;
  it never traps a boy outside his own card).
- **Why gifts are on the save root:** they cross players (Art's Garden adds,
  the reader's Road takes), and player numbers are not fixed to boys. The
  root counter means neither scene has to find "the other player".
- Migration only DEFAULTS these (`fromV2`) or carries them through
  untouched (`mergeV2`, `applyV1`). A v2 player carrying `lock`/`road`
  lookalikes goes to `legacy{}` as usual. `mergeRoad` keeps every v3-only
  Road field from v3.
- Import (`importCode`) **ratchets `family` and `gifts`**: postcards and
  versus tallies take the max of current vs code, the newest `lastPostcard`
  wins, and `gifts.toReader` takes the max. A classic v2 code (no family)
  can never erase them. Per-player Road fields follow the code, like the
  rest of the player.
- Petals / stage and caught rules are unchanged.

**Batch 3 field: `family.challenge.wins`** (DAD'S CHALLENGE ribbons). Optional on disk; an older save loads
with `{wins:[]}`. `cleanChallenge` keeps only `code` matching `/^[A-Z]{2,10}-\d{3}$/`, `who` of `dad|reader`
and a real date; one entry per code+who (earliest date), oldest first, the newest 50 kept. `mergeV2` carries it
through untouched (via `cleanFamily`); an import keeps BOTH sides' wins (union by code+who), like the other
`family` ratchets. Helpers: `V.addChallengeWin(save, code, who, date?)` -> wins | null,
`store.addChallengeWin(code, who, date?)` (commits only on a valid win), `store.challengeWins()`.
Nothing else in batch 3 added a save field: evolution uses `caught`/`mons`/`nicks`/`shinies`/`favorites`/`team`
(`evolveMonIn` never removes the old id), the Pokédex writes `nicks`/`favorites`, the team editor `team`,
and the grass `stats.explores` plus `caught`/`shinies`.

**Batch 4 fields (ROUND 2, Wild Chapters, Through the Roots, Garden decor).** All optional on disk; an older
save loads with `r2bloomed:[]`, `wildBloomed:[]`, `roots:{opened:false, sanctums:{}}`, `decor:[]`,
`accessory:null`. No version bump.
- `road.cleared` keys (`V.isClearedKey(k)`): `c<i>-t<j>` (i 0..11, as before), `r2-c<i>-t<j>` (ROUND 2 remix,
  i 0..11, j 0..99, no leading zeros) and `w<i>-t<j>` (Wild Chapter i 0..23, trainer j 0..5). Anything else,
  and any falsy value, is dropped. `r2bloomed` holds 0..11, `wildBloomed` 0..23 (deduped, sorted).
- `road.roots`: `opened` is only a real `true`; `sanctums` keeps up to 64 short safe keys (`V.isShortKey`:
  `[A-Za-z0-9_:.-]`, <=24 chars, never `__proto__`/`constructor`/`prototype`) with a truthy value, stored as `true`.
- `garden.decor`: kind is a short safe key; x/y must be numbers (or numeric strings) and are clamped to 0..1 and
  rounded to 4 places; junk entries are dropped; the first 40 are kept. `bulba.accessory` is a short safe key or null.
- **Decorations are Art's and are never removed** by anything but Art moving one (there is no remove helper).
  `mergeV2` carries `garden`/`bulba` through untouched. `importCode` and `restorePrevious` UNION the current
  decor with the incoming one BY COUNT PER KIND (`V.unionDecor(current, incoming, kinds)`): every current
  decoration stays exactly where it is; per kind, only the copies the incoming save has BEYOND what the current
  one holds join (same-spot matches by `V.decorKey` are used up first), so a decoration Art moved since the code
  was made is never doubled. A kind the current garden lacks joins while room lasts; an extra copy joins only
  while the room reserved for kinds not yet placed stays free (the `decorAction` reserve rule; save.js passes
  `DECOR` keys), up to 40 (a full garden keeps all of its own). `accessory`: the incoming save's wins when it has
  one, otherwise the current one stays. Every other batch-4 Road field follows the code, like the rest of the player.
- A garden with decor counts as progress (`V.hasProgress`).

**Rollback safety (batch 4 fixer).** v20.0.0 keeps unknown TOP-LEVEL player keys in `legacy{}` but drops unknown
NESTED ones, so it would erase every batch-4 field on its first save. Two guards:
- **The b4 mirror.** `persist`, `snapshot` and every export code write `V.withRollbackMirror(save)`: each player
  also carries `b4: {cleared:[r2-/w- keys], r2bloomed, wildBloomed, roots, decor, accessory}` (`V.mirrorOf`). An
  old build parks it as `legacy.b4`; `cleanPlayer` absorbs `b4` and `legacy.b4` back as a union that never lowers
  anything (cleared keys set, blooms unioned, `roots.opened` OR, sanctums unioned, decor by count, accessory only
  if none) and then drops the mirror (it is never stored in memory or parked).
- **Nested parking.** Unknown keys inside `road`, `garden`, `bulba` go to `legacy.v3road` / `legacy.v3garden` /
  `legacy.v3bulba` (newer value wins, never deleted), and unknown `road.cleared` keys to `legacy.v3cleared`
  (<=512). A LATER build must read these back when it adds a nested field.
- Even so: **do not roll /next/ back below this version.** A rollback to v20.0.0 is only safe because of the mirror.

**ROUND 2 levels.** `data/round2.js` lifts every chapter so its top mon sits on `r2Top(i)` = 80 (chapter 0) ->
95 (Champion), keeping the chapter's own spread, never below Round 1 +15, never above 100 (it opens after the
Lv80 Champion). Keys, teams, gimmicks and shiny aces are unchanged.

Helpers (pure, `core/validate.js`, on ONE player object; clamp, never throw):
```js
export const WILD_COUNT = 24, WILD_TRAINERS = 6, MAX_DECOR = 40, MAX_SANCTUMS = 64, DECOR_MATCH_PLACES = 2
export function isClearedKey(k); export const isShortKey = k => ...
export function freshRoots(); export function cleanRoots(raw); export function cleanAccessory(v)
export function cleanDecorItem(d); export function cleanDecor(raw); export const decorKey = d => 'kind@x,y'
export function unionDecor(keep, add, kinds?) // -> keep (all of it) + add's extra copies per kind, reserve kept, <= 40
export const MIRROR_KEY = 'b4'; export function mirrorOf(player); export function withRollbackMirror(save)
export function placeDecor(player, kind, x, y)  // -> {kind,x,y} | null (bad input, or already 40)
export function moveDecor(player, i, x, y)      // -> {kind,x,y} | null (bad index/input; nothing changed)
export function setAccessory(player, key|null)  // -> stored accessory (junk changes nothing)
export function openRoots(player)               // -> true; the door never closes again
export function addSanctum(player, key)         // -> true when stored
```
Store wrappers (commit only when something changed; `n` = 1|2, default the active player):
`store.placeDecor(kind, x, y, n?)`, `store.moveDecor(i, x, y, n?)`, `store.setAccessory(key|null, n?)`,
`store.openRoots(n?)`, `store.addSanctum(key, n?)`. Scenes may still write `road.cleared[...]`,
`road.r2bloomed` / `road.wildBloomed` directly on `store.player()` and `commit()`; validation cleans them on load.

Helpers (pure, in `core/validate.js`; mutate the given save, clamp, never throw):

```js
export const MAX_SEEDS = 99, MAX_GIFTS = 99, LOCK_PICS = 3, MAX_FAMILY_COUNT = 99999
export function freshRoad(); export function freshFamily(); export function freshGifts()
export function cleanLock(raw)     // -> {pics:[3 ids]} | null
export function cleanFamily(raw); export function cleanGifts(raw)
export function addGift(save, n = 1)      // -> new toReader count (<= 99)
export function takeGift(save)            // -> true when one was taken (never below 0)
export function addPostcard(save, date = today())   // -> new postcard count; sets lastPostcard
export function addVersusWin(save, 'gabe'|'dad')    // -> {gabe, dad} | null for any other winner
export function lockOpens(player, pics)   // -> true if pics match the lock (always true with no lock)
```

Store wrappers (each calls the helper on `store.save`, then `commit()`):
`store.addGift(n=1)`, `store.takeGift()` (commits only when one was taken),
`store.giftCount()`, `store.addPostcard(date?)`, `store.addVersusWin(w)`,
`store.setLock(n, pics|null)` (invalid pics change nothing; returns the
stored lock), `store.lockOpens(n, pics)`.
Oran Berries: unwrapping a gift on the Road moves it into `player.items.oranBerries`
(a pouch counter, always <= `gifts.toReader`; no schema change, `items` keeps safe counter keys).
The gift itself stays on the save root until the berry is eaten in battle.
Who calls them: the Garden calls `store.addGift(n)` each time `garden.berries`
(a lifetime count that only goes up) crosses a multiple of 10
(`garden-logic.giftsDue`, `BERRIES_PER_GIFT = 10`); the battle's BERRY
button calls `store.takeGift()` once per berry eaten.

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
export function createBattle({ myTeam, enemyTeam, profile, rng, moveLookup, wild, leader, berries = Infinity })
// myTeam/enemyTeam: [{ id, level, name, types:[..], stats:{hp,atk,def,spatk,spdef,spe}, moves:[{name,type,power,damage_class}] }]
// returns battle = {
//   state: { me:{active, team:[{...,hp,maxHp}]}, foe:{...}, turn, over:false, winner:null, phase:1 },
//   async choose({ kind:'move', index } | { kind:'switch', index } | { kind:'ball', ball:'poke'|'great'|'ultra'|'master' }
//                | { kind:'berry', fraction = BERRY_HEAL (0.3) }) -> events[],
//   foeIntent()   // the move index the foe will use next (committed before the player acts)
// }
// events: [{type:'move', side, move, dmg, crit, eff, hpAfter} | {type:'faint', side} | {type:'phase2', side}
//          | {type:'catch', shakes, success} | {type:'heal', side:'me', index, amount, hpAfter} | {type:'end', winner}]
```

**Berry:** heals my active mon by `fraction` of maxHp (at least 1, capped at
maxHp) and **is a turn**: the foe's committed move then lands. It returns `[]`
and passes no turn when the mon is already full, the fraction is not > 0, or
`berries` (the factory's own limit, `state.me.berries`) is used up. The scene
gates the gift count; the factory default is unlimited, so a coop caller can
heal without spending gifts.

Also exported (pure): `BERRY_HEAL = 0.3`, `powerDots(power) -> 1..4`
(≤40, ≤65, ≤90, more), and `movePictures(moves) -> [{glyph, dots, type,
shape:'physical'|'special'}]`: a shape per move (fist, bang, paw, pin,
boomerang, foot, tooth / swirl, beam, bubbles, dizzy, rainbow, tornado,
puff), picked from the move name and damage class, never a type emoji or a
star, and **never the same glyph twice for one type in one moveset**.

Use `engine.computeDamage` / `catchProbability` / `applyXp`. For a
prereader: enemy damage is capped by `JUNIOR_MAX_TAKE` and HP floors at 1
(no faint), and his own hits get `JUNIOR_MIN_HIT`. Balls always succeed.
**Leader phase 2:** at ≤50% HP on the leader's LAST mon, emit `phase2`
once, heal it +25% maxHp, and raise its attack by 1.25×. A new object is
made per fight, with **no module-level mutable state**.

## Battle view exports (`scenes/battle.js`)

For other scenes (family-table) that want the battle's look without copying
it. All are named exports next to `mount`:

```js
export { movePictures, powerDots }            // re-exported from battle/createBattle.js
export const BERRY_ITEM = 'oran-berry'        // ITEM(BERRY_ITEM) is the berry picture
export function movePicture(pic)              // <span.bt-pic>: big glyph, small type badge, 4 power dots. No words, aria-hidden.
export function moveButton(move, pic, { reader = true, onClick = null })
                                              // <button.bt-move>: reader = type emoji + NAME; prereader = movePicture(pic) only
export const hpPercent = (hp, max) => 0..100
```

`params.coop` hooks (all optional; each is wrapped in try/catch, so a
throwing hook never breaks the fight):

```js
coop = {
  onReady(api),               // the fight is on screen and the controls are live
  onEvents(events, api),      // right after battle.choose() returned (before playback)
  onTurn(api),                // playback finished and the controls are live again
  onEnd(endEvent, api),       // before the result card; the scene still writes the result and calls ctx.go
  actions(api) -> Node | Node[] | null,   // extra buttons appended to the action row on every render
}
api = { battle, busy, act(action) -> Promise, refresh(), root }
// api.act goes down the same path as the buttons (ignored while busy or over).
// api.act({ kind:'berry', fraction }) heals WITHOUT spending a gift; only the
// BERRY button (action.gift === true) calls store.takeGift().
```

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
