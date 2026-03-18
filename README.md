# 📱 Pokédex OS

A high-performance, single-file Progressive Web App (PWA) Pokédex and RPG Battle Engine built entirely in Vanilla JavaScript, HTML5, and CSS3. 

Designed specifically for mobile browsers with zero external dependencies, this OS transforms a standard phone into a fully functional, interactive Pokédex and game engine.

## ✨ Core Features

### 📖 The Pokédex
* **Gen 1 Optimized:** Hard-locked to the original 151 Pokémon for fluid 60FPS DOM rendering and memory management.
* **Live API Integration:** Fetches real-time stats, abilities, lore (flavor text), and sprites directly from [PokeAPI](https://pokeapi.co/).
* **Interactive Evolution Tree:** Dynamically maps evolution chains. Tap any Pokémon in the tree to instantly jump to their data.
* **Audio Engine:** * Features a built-in Text-to-Speech (TTS) synthesizer that reads Pokédex lore aloud (with a custom "Professor" pitch).
  * Plays official high-fidelity `.ogg` Pokémon Cries natively.

### 🔴 The Catch Mechanic
* **RNG Mathematics:** Uses the actual `capture_rate` from the API to determine catch probability.
* **Item Drawer:** Choose between Pokéball (1x), Great Ball (1.5x), Ultra Ball (2x), and the Master Ball (100% guaranteed catch).
* **Dynamic Animations:** Features CSS-driven shrink/shake animations alongside procedurally generated 8-bit sound effects (built via the Web Audio API—no external `.mp3` files needed).

### ⚔️ RPG Battle Arena
* **Full-Screen Combat:** A dedicated battle view that slides over the Pokédex UI.
* **Combat Logic:**
  * Pulls 4 random, valid damage-dealing moves for both the player and the wild Pokémon.
  * Calculates Turn Order based on actual Speed stats.
  * Calculates Damage using Attack, Defense, and base Move Power.
  * Utilizes a hardcoded 18x18 Type Effectiveness Matrix (e.g., Water is super-effective against Fire).
* **Sparkle Variants:** Players can deploy "✨ SPARKLE ✨" (Shiny) variants from their PC Box, which deal a flat 200% damage multiplier.
* **Auto-Catch:** Defeating a wild Pokémon automatically captures it and sends it to the PC Box.

### 💻 Bill's PC Box & Multiplayer
* **P1 / P2 Profiles:** A global toggle switches the entire OS theme (Red for P1, Blue for P2) and uses completely isolated save files for multiplayer competition.
* **Visual Grid:** Displays all 151 Pokémon. Caught Pokémon appear in full color; uncaught remain in grayscale.
* **Base64 Save System:** Easily export and import save data as a text string to transfer progress seamlessly across different devices (e.g., from iPhone to iPad).

## 🚀 Installation & Deployment

This project requires **no build steps, no Node.js, and no backend servers**. 

1. Create a GitHub repository and upload the `index.html` file.
2. Go to your repository **Settings** > **Pages**.
3. Under "Build and deployment", set the source to **Deploy from a branch** and select your `main` branch.
4. GitHub will generate a live URL for your app (e.g., `https://yourusername.github.io/pokedex-os/`).

### 📱 iOS "Add to Home Screen" Instructions
To get the full, full-screen native app experience on an iPhone or iPad:
1. Open the live GitHub Pages URL in **Safari**.
2. Tap the **Share** button (the square with the arrow pointing up) at the bottom of the screen.
3. Scroll down and select **Add to Home Screen**.
4. Launch the app from the new icon on your home screen. 

*(Note: If updating the code, iOS aggressively caches PWAs. You may need to delete the app icon, clear Safari cache, and re-add it to see the newest updates).*

## 🛠️ Tech Stack
* **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3.
* **Network:** Custom `AbortController` fetch wrapper with timeout protection to prevent silent hanging on mobile networks.
* **Data Source:** [PokeAPI v2](https://pokeapi.co/)
* **Audio:** Web Audio API (procedural synthesis) & SpeechSynthesis API.

## ⚖️ Disclaimer
This is a non-commercial, educational fan project. Pokémon and Pokémon character names are trademarks of Nintendo. © 1995-2026 Nintendo/Game Freak Inc.
