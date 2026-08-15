# Changelog

All notable changes to the Pokédex OS project will be documented in this file.

## [18.9.0] - REOPEN THE GYM

The Gym Circuit is the biggest thing ever built in this game — 58 hand-made
trainers — and it had three quiet problems: winning sometimes paid less than
the screen claimed, a beaten trainer could never be fought again, and the badge
case had nothing to do with any of it.

### Added
- **The spoils ceremony.** Beating a trainer now shows their team as big
  tappable sprites. Tap your favorite and it gets the full capture animation —
  ball, shake, "CAUGHT!" — and a spot on your battle team, marked with a ⭐.
  The whole team still joins your PC Box either way; the pick is pure ceremony,
  and skipping it costs nothing.
- **Rematches!** Beaten trainers now show 🔁 REMATCH and can be fought again
  for half XP. All 58 trainers were one-shot — beaten once, dead forever
  behind a checkmark. Beating Champion Rex again replays the whole Hall of
  Fame ceremony (the recorded "first became Champion" date never changes).
- **A badge case worth opening.** Badges are now earned by beating Gym
  Leaders — ROCKO BADGE, MARINA BADGE, one per Leader, plus a VICTORY BADGE
  for the Victory Road + Elite Four gauntlet — with a late tier that outlasts
  the circuit: 100 / 300 / all-649 caught, first shiny, a Lv60, and Champion.
  17 badges total, each still worth a Master Ball, and every badge now shows
  its goal and live progress right on the card (it used to be hover-only text,
  on a tablet with no hover). The old 8 badges retired — but any already
  earned stay in the case with a ★. Nothing is ever taken away.

### Fixed
- **Gym prizes are honest now.** "You caught their whole team: #095 Lv40"
  sometimes lied: if you already owned that Pokémon at a lower level, nothing
  happened at all — 24 of the game's 164 gym awards hit this. An award now
  raises an owned Pokémon to the promised level (it never lowers one).
- **Gym wins no longer auto-complete "Catch N Pokémon" quests.** A trainer win
  was counted as up to six "catches" with no ball thrown.
- **Daily quests stop resetting at dinnertime.** The quest board rolled over
  on the world clock (UTC), which in Ohio is 8pm — so evening progress was
  wiped mid-play, every day. It now rolls at local midnight. (One-time effect
  of the fix: the current day's board reshuffles once after updating.)

### Testing
- 144 browser checks plus 18 engine unit tests. New ones cover the ceremony (tap a spoil → it joins the team),
  rematch availability, the level-raise honesty rule, leader badges firing
  from gym wins, and gym spoils leaving catch quests alone.

## [18.8.0] - THE PARENT GATE

The lock and the door finally match. Until now the *reversible* thing (Parent
Tools) was locked behind a PIN, while the *irreversible* things (PASTE CODE and
LOAD FILE, which can replace both boys' entire collections) were one tap from
the gear icon with no lock at all. And on the iPad the PIN never even appeared —
installed home-screen apps silently swallow the browser's built-in pop-ups, so
Parent Tools were unreachable on the boys' actual device.

### Added
- **A real PIN pad.** Parent Tools now asks for its 4-digit PIN on a big
  in-game keypad — dots fill in as you type, a wrong PIN shakes and clears.
  Works everywhere, including the installed iPad app.
- **PASTE CODE, LOAD FILE and UNDO IMPORT now ask for the PIN first.** These
  are the only buttons in the game that can replace a save, so they sit behind
  the same gate as Parent Tools.
- **🔑 CHANGE PIN** inside Parent Tools.
- **If you ever forget the PIN:** on a computer, open the game in Chrome,
  press F12, click "Console", type
  `localStorage.removeItem('pokedexos_devpin')` and press Enter. The next
  visit to Parent Tools asks you to set a fresh PIN. (Your PIN is only stored
  on that one device — each device sets its own.)

### Fixed
- **The gate now fails SHUT.** If anything went wrong while checking the PIN,
  the old code let you through. Now it keeps the door closed.
- **No more grey system pop-ups, anywhere.** All two dozen remaining browser
  pop-ups (wrong-PIN warnings, "catch a Pokémon first!", network hiccups,
  save-loaded notices, the defeat message...) are now proper in-game screens
  with a big icon — which matters twice: the browser ones were invisible on
  the installed iPad app, and unreadable for ART anyway.

### Testing
- The suite now instruments the browser's alert/confirm/prompt before the game
  boots and fails if any of them ever fires — the same permanent-guard
  treatment the speech ban got in v18.3.
- New checks: the PIN pad appears in-game, a wrong PIN keeps the gate shut,
  the right PIN opens it, and PASTE CODE demands the PIN before showing the
  paste box.
- Screenshots of the PIN pad and the new dialogs at 375×667 and 390×844, in
  normal and Junior mode — everything fits on screen.

## [18.7.0] - THE HALL OF FAME

The game finally has an ending, and it remembers it.

### Added
- **The Hall of Fame.** Beating all eleven gyms now opens a fullscreen ceremony: the crown, then all six of the team marching on one at a time with a rising beep each, confetti, and a four-note fanfare. There's no timer on it — this is the one screen in the game nobody should be hurried off.
- **The save remembers.** A Champion record is written the first time the circuit is completed, holding the date, the exact six who did it, and their levels. It is written *once* — finishing again later never overwrites the day it first happened.
- **A crown that stays.** 👑 sits permanently on the trainer card, with the date on hover. It is the only thing on that card that can never be lost.

### Fixed
- **A test that had been green by luck for two releases.** The browser suite asserted wild Pokémon spawn within ±20% of your lead's level — but v18.5 deliberately replaced that with the additive habitat leash (lead−3 to lead+5 for Art, lead−5 to lead+8 otherwise). The old check failed about half the time depending on how much the lead had levelled mid-run. The engine was right the whole time; the test was asserting a rule the game no longer had.

### Notes
- This adds one field to the save file. It's additive — older versions of the app read the new save without complaint, and a Champion record arriving from a pasted import code is validated like everything else, because malformed data should never reach the proudest screen in the game.

### Testing
- 134 browser checks and 18 engine unit tests, four consecutive clean runs.
- The habitat leash is now covered exhaustively in the unit tests — every combination of junior mode, lead level, badge count and dice roll — instead of sampled once through a random battle.
- Hall of Fame rendered and inspected at 375×667 and 390×844; three text styles I'd written below the project's 8px floor were raised.

## [18.6.0] - SHOW, DON'T TELL

Week 3, and the one aimed squarely at Art. Until now roughly all of the battle narrative was text, which means half the audience was playing a game that never told them anything.

### Added
- **Move buttons are pictures now.** Each move is a big type-coloured tile with its type symbol — 🔥 💧 ⚡ 🌿 — and the move name demoted to a caption underneath. Junior Mode makes the symbol much larger still. This is the difference between Art *choosing* a move and Art mashing a button.
- **A visual grammar for what just happened.** Effectiveness stopped being a sentence and became a sensation: super-effective is a big red ⏫, a hard screen shake and an oversized damage number; not-very-effective is a small grey ⏬ and a muted thud; a critical hit is a single white flash and a starburst; and an immune hit is a grey ✖ with no particles and no number at all. One shared `impactFx()` drives all of it. The text line stays for Gabe.
- **Icon-led status.** A fainted Pokémon greys out and tips over instead of only being reported in a line of text, and a health bar under 20% pulses.

### Fixed
- **Nicknames work on the iPad at all.** They were asked via a native `prompt()`, which an installed iOS app **suppresses** — it returns nothing, without error. So on the boys' actual device the nickname feature has silently done nothing this entire time. On a laptop it was merely bad: a blocking grey box that froze the capture celebration mid-confetti. It's now an in-world panel with the Pokémon's sprite, a text field, and a SKIP button.
- **Immune hits look immune.** They used to pop a "-1" with full particles while the log said "no effect" — teaching the exact opposite of the lesson type advantage is meant to teach.
- **Type labels are readable.** Ink is now chosen by measuring contrast rather than always using white. White on the ground type was about 1.4:1, effectively invisible. Every one of the 18 type colours now clears the WCAG AA standard, worst case 4.73:1.

### Testing
- 127 browser checks and 16 engine unit tests, three consecutive clean runs.
- New assertions that the wordless channel actually exists: every type has a picture, and every type chip is measured for real contrast — because if this silently regresses, nothing replaces it for Art.

## [18.5.0] - THE TEAM AND THE WORLD

Week 2 of the council roadmap: growth you can feel, a world with its own shape, and every number in the game finally under test.

### Added
- **A real team.** Every Pokémon on your team now earns XP from every fight — full XP for the one that lands the knockout, half for everyone else. Before this, 269 battles funded exactly *one* Pokémon and the other five sat at Lv5 forever, so a "team" was really a lead with five passengers.
- **An XP bar** under the health bar in battle. There was no XP readout anywhere in the game, so how close you were to levelling up — the number a child cares most about — was invisible.
- **LEAD chip in the toolbar.** Your lead Pokémon decides how tough wild Pokémon are and who fights first, and nothing on screen ever said which one it was. Now it's always visible with its level, and tapping it opens the team picker.
- **Your first catch automatically becomes your lead.** Until now the team started empty and the game fell back to whichever Pokémon had the lowest Pokédex number — meaning the difficulty of the entire game was set by an invisible accident.
- **Habitats have their own difficulty.** Deep Forest is gentle, Dragon's Den is not, and every habitat gets harder as you earn badges. Each card shows difficulty pips and an expected level. Wild levels used to scale to your lead everywhere, which is why week four of play was mathematically identical to day two. Junior Mode keeps a tighter leash so a habitat can never become a wall for Art.

### Fixed
- **Special attackers work.** Every move in the game resolved against physical attack and defence, so Alakazam, Gengar and most gym aces hit like normal Pokémon — exactly the ones a 7-year-old picks because they look coolest. Special moves now use special stats.
- **No single hit can delete a full-health Pokémon** any more. Losing a favourite to one unseen attack is the least fun thing that can happen in a fight.
- **Damage now varies 85–100%** per hit, like the real games, so identical attacks stop feeling like a calculator.
- **Status moves are no longer attacks.** Hypnosis was being presented as a 40-power hit because moves with no attack power were silently defaulted. Self-destruct and friends are also off the board — the opponent AI would find them and spam them.
- **Sparkle is unlockable.** It required the shiny of your *exact current lead species* — a 1-in-50 encounter on one specific Pokémon out of 649, which in practice meant it never unlocked. Any shiny now unlocks it permanently, and the bonus is 150% rather than a fight-trivialising 200%.
- **One catch formula.** The dex screen and the battle screen ran different equations, so the same ball on the same Pokémon had different odds depending on which screen you threw it from.
- **Switching players no longer carries gym damage** from one brother's run into the other's.

### Under the hood
- **New `js/engine.js`.** Every number that decides what happens in a fight — damage, catch odds, XP, level-ups, opponent move choice, wild levels — now lives in one file that touches no screen and no network, with **16 unit tests** that run in under a second (`npm run test:engine`). This is what makes the next few weeks safe to build: changing a formula stops being a change made blind inside a thousand-line file.

### Testing
- 121 browser checks plus 16 engine unit tests. `npm test` runs both.
- Three test assumptions had to be corrected because the game got better: a one-hit-kill versus match now plays out over real turns, and two assertions that quietly depended on the old damage maths were rewritten to assert the actual invariant.

## [18.4.0] - THE FLOOR

Week 1 of the council roadmap: nothing breaks, nothing gets lost, and ART can finally win a fight.

### Fixed — the two that changed the game
- **ART can win now.** In Junior Mode his attacks always take off at least 15% of the opponent's health, so a Lv8 starter beats a Lv80 gym ace in about seven hits instead of eighty-four. Incoming hits are capped so his health bar drains gracefully instead of bottoming out on the first swing — he still can't faint. Gym trainers also stop playing smart against him: they picked super-effective moves 70% of the time even in Junior Mode. **None of this is shown or announced.**
- **Pokémon evolve from gym wins again.** They never could — the game's biggest source of XP was the one place evolution was switched off, by a single line that cleared it right before the victory screen. GABE should see evolutions start firing almost immediately.

### Fixed — nothing breaks
- **One way out of a battle.** Escape, victory, defeat and network errors now all tear down through the same code, and every battle carries an id that invalidates work still in flight. Previously one ESCAPE tap during a versus match silently switched off ART's no-faint protection for the rest of the session, and an interrupted turn could land its damage on the *next* battle.
- **ESCAPE is disabled mid-turn**, so it can't fire during an animation.
- **Switching is no longer a trap.** The opponent commits its punishing move before it can see what you switched to. It was choosing afterwards, with full knowledge — a guaranteed super-effective hit every time.
- **A global safety net.** Any unhandled error now shows a friendly "OH NO — something went wobbly" screen and safely exits the battle, instead of freezing mid-animation. There were no error handlers at all before this.
- **Sprites that fail to load** fall back to a drawn Pokéball instead of a broken-image icon.

### Fixed — nothing gets lost
- **A save code that would have wiped both boys is now refused.** A valid-looking but empty code used to erase everything and report "SAVE LOADED! Welcome back."
- **↩️ UNDO IMPORT** in Settings puts back the save from just before the last import. Import now also tells you honestly if the code you loaded has *fewer* Pokémon than you had.
- **Catches are banked the moment they're decided**, not five seconds later when the animation ends. A tablet that went to sleep mid-throw used to lose the Pokémon entirely.
- **A save that can't be written** (tablet out of storage) now clears the sprite cache, retries, and only then stops the game with a full-screen "SHOW A GROWN-UP" message. It used to fail silently.
- **A save that can't be read** is kept aside instead of being overwritten, so it can be recovered.
- Imported data is now validated item by item: bad Pokémon numbers dropped, impossible levels clamped, names escaped, and team order preserved.

### Added
- **WHO'S PLAYING?** on first launch — two big sprites, tap yours. The app always opened as P1, so ART landed in GABE's profile with Junior Mode off. Your choice is remembered per device, and switching players no longer carries one brother's gym damage into the other's run.

### Changed
- **Photosensitivity.** The header LEDs flashed at 3.3 times a second and the evolution animation inverted the whole sprite black-to-white at 2.9 times a second — both inside the range seizure guidelines warn about, the second one firing at the most exciting moment in the game. Both are now slow pulses. The app also respects the iPad's "Reduce Motion" setting.
- **Sprites and fonts are cached properly.** Because of one wrong check, not a single sprite had ever been cached in the life of the app; the cache was also being wiped on every release. The app shell now also gives up on a slow network after 2.5 seconds and opens from cache instead of hanging on a white screen.

### Testing
- 121 checks passing, including new regressions for the empty-save wipe, import validation, undo, and battle teardown.
- Fixed two tests that had been failing at random: one assumed the Boulder Badge celebration always appeared before a daily-quest celebration, the other assumed the lead Pokémon was always Lv5.

## [18.3.0] - THE GAME DOESN'T TALK

### Removed
- **All speech synthesis, permanently.** The VOICE button is gone, Junior Mode no longer reads Pokemon names out loud, and speak() / isSpeaking() are deleted from the audio engine. Product decision: Pokedex OS carries meaning through picture, colour and motion - never a synthesised voice. Chiptune music, sound effects and real Pokemon cries are untouched.

### Changed
- **Toolbar reflow.** With VOICE gone the 4-column grid was left with a hole, so the buttons were rebalanced into a clean 3x4: CRY / SHINY / RNDM / DATA, then CATCH and CARD and EXPLORE and GYMS as full-width pairs. CARD is now double-width - a bigger target on a small screen. Junior Mode gets the same treatment with CRY taking the freed slot.

### Testing
- New permanent guard in the smoke suite: speechSynthesis.speak is instrumented before boot and asserted never to fire across the entire run, plus a check that #voice-btn does not exist. If anyone ever reintroduces TTS, the tests fail.

## [18.2.0] - SHINIES, SHOWDOWNS & NICKNAMES

### Added
- **✨ Shiny hunting:** roughly 1-in-50 wild encounters is SHINY — special announcement, shiny sprite, and a permanent ✨ badge in your PC Box. **Sparkle power is now earned:** the 200%-damage Sparkle option unlocks only when you've caught your lead Pokémon's shiny. (Existing free Sparkle is retired — go hunt!)
- **🆚 Versus mode:** P1 vs P2 pass-and-play on one device, launched from the Gym screen. Each player uses their own real team, "PASS TO GABE" handoffs between turns, auto-send on faints, and the winner's VS WINS count lands on their Trainer Card. Junior's no-faint shield is off in VS — fair fights only.
- **Nicknames:** new catches ask for an optional nickname (skippable, never in Junior mode). Nicknames show in gold on PC tiles and in battle.
- **Parent Tools hardening:** hold-to-open now leads to a **4-digit PIN** (set on first use), and the add box shows **live name suggestions with sprites** — type "char", tap Charizard, done.
- Trainer Card now tracks VS WINS and SHINIES.

## [18.1.0] - THE GYM CIRCUIT

### Added
- **🏟️ GYMS button — 58 simulated trainers** in a fixed ladder from Lv8 to Lv80: ten themed gyms (Boulder, Cascade, Thunder, Meadow, Mindbend, Knuckle, Phantom, Glacier, Inferno, Dragon — 4 trainers + a Leader each), then Victory Road, the Elite Four, and the Champion. Every trainer has a name, a taunt, and a themed roster.
- **Win a battle, catch their whole team.** Every Pokémon a defeated trainer owned joins your PC Box at its trainer level.
- **Sequential unlocks:** beat a trainer to open the next; beat a Leader to open the next gym. Blocked? Go train in the wild and come back.
- **Trainers fight smart:** gym trainers prefer super-effective moves 70% of the time, and send out their next Pokémon when one falls (with the classic "sent out" beat).
- **Gym endurance + 💗 Poké Center:** your team's HP carries across a gym's trainers. The Poké Center button (free, with a healing jingle) fully restores the team; losing a gym battle rushes you there automatically. Junior mode always fights at full HP.
- **New gym battle theme** on the chiptune engine, and a progress tracker (trainers defeated / 58).

## [18.0.0] - TRAINER'S JOURNEY, PART 1

### Added
- **Battle-to-catch!** Wild battles now have a 🔴 BALL button. Weaken a Pokémon first — the lower its HP, the better your odds (real capture math: species rate × ball power × health). Miss and it breaks free and hits back. Knocking it out still catches it, so nobody loses a catch for hitting too hard. Junior mode throws never miss.
- **PC Box search + ALL view:** search any name or number (powered by a cached index of all 649 names — searching works across every generation at once), plus an ALL tab that scrolls the whole box. Names now show on every PC tile.
- **TEAM strip** at the top of the PC: your party in order — tap any member to make it your lead. Team picker now shows pick order (1st = lead).
- Wild Pokémon now spawn **within ±20% of your lead's level** — swap your lead to tune the difficulty.

## [17.1.0] - PARENT TOOLS & LAYOUT FIXES

### Added
- **🔧 Parent Tools** (Settings → hold "PARENT TOOLS" for a second): add **any** Pokémon to either player's box by name or number, set its level 1–100, bump levels ±5, or remove one. Levels drive real battle power — a Lv80 Pokémon has ~146 HP versus ~18 at Lv5, with attack, defense and speed scaling to match.
- The hold-to-open gate keeps curious kids from stumbling into it by accident.

### Changed
- **Junior mode keeps the ball drawer.** All four balls appear and behave normally — but in Junior mode every one of them is a guaranteed catch, and Master Balls are never used up. Nothing on screen gives it away, so the choice still feels like a real decision.

### Fixed
- **Junior mode now fits on screen.** The sprite area flexes to whatever space is left instead of being pinned at 45% height, so the EXPLORE button can never be pushed under the data sheet — verified on tall and short phones alike.
- **Header no longer overflows on narrow phones** (the BTL button was being clipped): the status LEDs and lens shrink or hide below 430px, and Junior mode no longer inflates the header.
- Pokémon sprites scale up to fill the display area again instead of rendering at their tiny native size.
- The dex number no longer tucks under the header divider.
- Parent Tools rows and inputs no longer overflow their panel on phone widths.

## [17.0.0] - NATIONAL DEX & SETTINGS UPDATE

### Added
- **649 Pokémon!** The dex now spans Generations 1–5 (Kanto through Unova) — every one with animated pixel sprites. Search, catch, battle, and evolve across all of them.
- **Generation tabs in the PC Box** (G1–G5) with per-gen caught counters, so 649 slots stay browsable.
- **⚙️ Settings screen** housing everything in one place: player names, Junior Mode per player, sound, and save data.
- **Player names:** name P1 and P2 (they show in the header, PC Box, and Trainer Card).
- **Save to file / load from file:** in addition to copy-paste codes, you can now download your save as a file and load it back — easy backups and transfers.
- **Tooltips everywhere:** hover any button on desktop to see what it does.
- Expanded habitats: all 8 explore zones now spawn Pokémon from five generations, with new legendaries hidden in them (Lugia, Ho-Oh, the legendary beasts, Kyogre, Groudon, Rayquaza, Dialga, Giratina, Darkrai, Reshiram, Zekrom...).

### Changed
- **New night-sky background** with faint pixel stars and a soft glow tinted by the current Pokémon's type — the diagonal stripes are gone.
- **Desktop console frame:** on large screens the game now renders as a centered handheld-style column instead of stretching edge to edge.
- Fixed the dex number crowding the Pokémon's name.

### Fixed
- **Sound toggle now actually silences everything** — music, sound effects, cries, and speech (it previously only muted music).
- Emoji icons now render in color on desktop browsers.
- Junior Mode is easy to find (Settings), and typed player names no longer vanish when flipping other settings.

## [16.4.0] - JUNIOR MODE (Phase 5)

### Added
- **🧒 Junior Mode** — a per-player toggle on the Trainer Card, built for the youngest trainers:
  - Giant buttons everywhere; the search box and reading-heavy panels hide away.
  - Pokémon names are **spoken aloud** automatically when they appear — zero reading required.
  - **Tap the Pokémon itself to catch it** — no ball drawer, and the catch always succeeds (after the full 3-shake suspense, of course).
  - **Battles can't be lost:** your Pokémon never drops below 1 HP.
  - Confetti. So much confetti.
- Junior mode is saved per player — P1 can play the full game while P2 stays in junior mode.

## [16.3.0] - TRAINER PROGRESSION (Phase 4)

### Added
- **Trainer Card** (🎖️ in the header): Pokédex completion bar, badge case, today's quests, lifetime stats, and Professor Oak commentary that changes as your dex fills up.
- **8 Gym Badges**, each earned by a real milestone (first 3 catches, 3 battle wins, 15 explores, raising a Pokémon to Lv30...). **Every badge awards +1 Master Ball** — this is how you earn more.
- **Daily Quests:** 3 rotating quests per day per player ("Catch a WATER type", "Win 2 battles", "Go exploring 3 times"). Each completed quest gives your lead Pokémon +30 XP; sweeping all 3 in one day earns a bonus Master Ball.
- **Celebration pop-ups** with fanfare and haptics when a badge or quest lands.

## [16.2.0] - EXPLORE KANTO (Phase 3)

### Added
- **EXPLORE KANTO button** on the main screen — pick from 8 habitats: Viridian Forest, Tall Grass, Ocean & Beach, Volcano Path, Power Plant, Deep Cave, Ghost Tower, and Dragon's Den.
- **Rarity tiers:** every walk rolls 60% common / 30% uncommon / 9% rare / **1% legendary**. Articuno haunts the ocean, Zapdos the power plant, Moltres the volcano, Mewtwo the deep cave, and Mew... is out there somewhere.
- **Encounter scenes:** rustling grass, escalating suspense, and a special legendary fanfare when you hit the 1%.
- Encounters flow straight into battle with your saved team (no picker friction) — win to catch, then land right back in the wild for another run.

## [16.1.0] - BATTLE OVERHAUL (Phase 2)

### Added
- **Teams of 6:** The BTL button now opens a team picker — choose up to 6 from your PC Box (your lineup is remembered). Starred picks, level badges on every PC slot.
- **Levels & XP:** Every caught Pokémon has a level (new catches start at Lv5; battle catches join at the wild's level). Winning battles grants XP with a fast, kid-friendly curve; level-ups happen right on the victory screen.
- **Evolution!** Level past an evolution threshold and the classic flashing evolution cutscene plays — "What? PIKACHU is evolving!" Evolved forms join the box and take their spot on your team.
- **In-battle switching:** SWITCH and RUN buttons in the move grid. Switching costs your turn (the wild Pokémon gets a free hit). When a fighter faints, you pick the next one.
- **Real damage math:** Damage now scales with level, STAB (same-type attack bonus, 1.5x), and critical hits (1/16 chance, 1.5x, screen shake).
- **Wild scaling:** Wild Pokémon spawn near your team's average level, so battles stay fair as you grow.
- **Victory screen:** XP gained, level-ups, and catch results presented GBA-style.

### Changed
- **Master Balls are now scarce:** each player starts with exactly 1 (shown as x1 in the ball drawer). More are earned via badges in the upcoming progression update. Choose wisely — Mewtwo isn't going to catch itself.
- Teams are fully healed after every battle — no potion micromanagement for small trainers.

## [16.0.0] - GAME BOY EDITION (Foundation + Visual Overhaul)

### Changed — Architecture (Phase 0)
- **Modular codebase:** Split the single 860-line `index.html` into `index.html` + `css/` + `js/` ES modules. Still zero build steps — GitHub Pages serves it exactly as before.
- **API cache:** Every PokeAPI response is slimmed to just the fields the game uses and cached in `localStorage`. Previously-viewed Pokémon now load instantly and survive flaky WiFi.
- **Versioned save system (v2):** Saves migrate automatically from the old `pokedex_caught_p1/p2` keys — no catches lost. The new schema has room for teams, levels/XP, badges, items, and quests (coming in later phases).
- **Service worker + manifest:** Network-first app shell means pushed updates reach installed iPhone/iPad home-screen apps on next launch — no more delete-and-re-add. Sprites, API data, and fonts cache offline.

### Added — GBA Visual Overhaul (Phase 1)
- **Retro pixel styling throughout:** Press Start 2P pixel font, cream GBA dialog boxes with pixel borders and drop shadows, subtle CRT scanlines, stepped screen-wipe transition between Pokémon.
- **Animated pixel sprites:** The Pokédex and battles now use the animated Gen-V battle sprites (they idle, breathe, and bounce), rendered crisp with `image-rendering: pixelated`.
- **Typewriter text:** Pokédex entries type themselves out with a blinking ▼ cursor, GBA style.
- **Battle scene overhaul:** Habitat backdrops keyed to the wild Pokémon's type, fighter platforms, GBA HP boxes, damage number pop-ups, per-type particle bursts, and screen shake on super-effective hits.
- **Chiptune soundtrack:** Procedural Web Audio music engine — Pokédex theme, battle theme, and victory fanfare. Square lead + triangle bass, no audio files. Mute toggle in the header (remembered between sessions).
- **Bill's PC = CRT terminal:** The PC Box is now a green-phosphor CRT terminal, scanlines and all.
- **Game Boy boot chime** on the startup screen.

## [7.0.0] - Save System & Audio OS Update
### Added
- **Save Data Management:** Added Export/Import functionality in the PC Box using base64 encoded strings to transfer saves between devices (e.g., Phone to iPad).
- **Smart Audio Controller:** Added a global audio kill-switch. Navigating to a new Pokémon or hitting the Random button now instantly stops any currently playing audio.
- **Dynamic Voice UI:** The "VOICE" button now physically transforms into a "🛑 STOP" button during playback, allowing users to pause the Pokédex reading.

## [6.0.0] - Lore & Multiplayer Update
### Added
- **Multiplayer Mode (P1/P2):** Added a player toggle in the header. Switching players swaps the entire OS theme (Red for P1, Blue for P2) and utilizes a separate save file for catches.
- **Interactive Evolution Tree:** Added a visual evolution chain in the Data Sheet. Users can tap any Pokémon in the chain to instantly load its data.
- **Retro Boot Sequence:** Added a GameBoy-style startup screen with authentic audio. (This also bypasses iOS/Safari autoplay restrictions for the Pokémon Cries).
### Changed
- Refactored PC Box to separate Caught (full color) and Uncaught (greyed out) Pokémon arrays.

## [5.0.0] - PC Box Edition
### Added
- **Bill's PC Box:** A dedicated modal to view all captured Pokémon in a dynamic grid.
- **Lazy Loading:** Implemented native HTML5 `loading="lazy"` on PC Box images to prevent browser RAM crashes when loading hundreds of sprites.
- **Auto-Sorting:** Catch arrays automatically sort by National Dex ID to keep collections organized.

## [4.0.0] - Gesture & Catch Update
### Added
- **Catch System:** Added a "CATCH" button that saves the Pokémon ID to the device's `localStorage`. Adds a Pokéball icon next to the name when owned.
- **Swipe Controls:** Implemented horizontal swiping to navigate Prev/Next and vertical swiping to open/close the Data Sheet.
- **Haptic Feedback:** Bound the device vibration motor to buttons and gestures for tactile response.
- **Laser Scanner:** Added a CSS-animated holographic scan line when fetching API data.
### Fixed
- Fixed an API crash caused by trailing spaces in search queries (added string sanitization).
- Fixed a massive memory leak where the Shiny toggle would stack `setInterval` timers, causing the gallery to strobe.
- Fixed silent audio failure by falling back to Text-to-Speech if the `.ogg` file is missing.

## [3.0.0] - UX Edition
### Added
- **Bottom Sheet Architecture:** Replaced the static text box with a modern, swipeable bottom drawer for deep lore and stats.
- **Visual Stat Bars:** Converted raw integer stats into color-coded progress bars.
### Changed
- Swapped viewport height from `vh` to `dvh` to fix Safari's bottom address bar cutting off the UI.
- Moved all primary controls into the "Thumb Zone" for better mobile ergonomics.
- Removed the Trading Card view feature (decluttered UI).

## [1.0.0] - [2.0.0] - Initial Builds
- Initial flat UI and subsequent skeuomorphic redesign.
- Basic PokeAPI integration (fetching sprites, name, height, weight).

# 📱 Pokédex OS - Ultimate Web App

A high-performance, single-page Pokédex application built with Vanilla JS, CSS3, and HTML5. Designed specifically for mobile browsers (PWA-ready) with zero external dependencies.

## ✨ Core Features
* **Advanced Data Fetching:** Integrates with PokeAPI to pull real-time stats, abilities, lore (flavor text), and dynamic evolution chains.
* **Interactive Catch Mechanic:** Features a mathematical RNG catch system using Pokéballs, Great Balls, and Ultra Balls. Includes CSS-driven shrink/shake animations and dynamically generated 8-bit sound synthesis via the Web Audio API.
* **Persistent Multiplayer Saves:** Features a P1 (Red) and P2 (Blue) theme toggle. Catch data is saved locally to the device's `localStorage` independently for both players.
* **Bill's PC Box:** A fully functioning visual grid tracking Caught vs. Uncaught Pokémon. Includes Base64 Save Data Export/Import for transferring progress between devices.
* **Native Mobile UX:** Built with `100dvh` for perfect Safari/Chrome mobile framing. Features tactile haptic feedback (vibration), custom swipe gestures (left/right/up), and a swipeable bottom sheet for deep data reading.
* **Accessibility & Audio:** Includes built-in Text-to-Speech (TTS) integration that reads the Pokémon's lore aloud, alongside native `.ogg` audio files for authentic in-game Pokémon cries.
