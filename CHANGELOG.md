# Changelog

All notable changes to the Pokédex OS project will be documented in this file.

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
