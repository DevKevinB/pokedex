# Changelog

All notable changes to the Pokédex OS project will be documented in this file.

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
