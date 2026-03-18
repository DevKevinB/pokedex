# Pokédex OS v15.0

A full-featured Pokédex and Pokémon battle simulator built as a single HTML file. No frameworks, no build tools, no server required. Runs 100% in the browser and installs as a PWA on iOS and Android home screens.

Built for two kids — a 7 year old and a 4 year old — who want to catch 'em all.

---

## Live App

Hosted on GitHub Pages: [https://devkevinb.github.io/pokedex](https://devkevinb.github.io/pokedex)

**To install on iPhone/iPad:**
1. Open the link in Safari
2. Tap the Share button → "Add to Home Screen"
3. Launch from the home screen like a native app

---

## Features

### Pokédex
- Covers all **1,025 Pokémon** (Gen I through Gen IX)
- Live data from [PokéAPI](https://pokeapi.co) — sprites, stats, abilities, lore, evolution chains
- Holographic laser scanner animation while fetching
- Dynamic background glow that matches the Pokémon's primary type
- Rotating sprite gallery (official artwork + game sprite)
- Shiny toggle for ✨ shiny variants
- Search by name or Dex number
- Left/right swipe to navigate, up/down swipe for the data sheet
- Pokédex entry read aloud via Text-to-Speech (pitch/speed tuned for a "Professor" voice)
- Authentic in-game Pokémon cries (`.ogg` from the official games)

### Catch Mechanic
- Tap **CATCH** to open the item bag
- Four ball types with real catch math using the Pokémon's actual `capture_rate` from the API:
  - Pokéball — 1× rate
  - Great Ball — 1.5× rate
  - Ultra Ball — 2× rate
  - Legend Ball (Master Ball) — 90% flat catch rate
- Pokémon shrinks and gets sucked in; ball drops, shakes 1–3 times
- Confetti explosion on a successful catch
- Caught status saved to `localStorage` per player

### Battle Arena
- Select any caught Pokémon from your PC Box as your fighter
- Choose Regular or ✨ Sparkle variant (Sparkle = 200% damage)
- Wild opponent drawn randomly from all 1,025 Pokémon
- Live move data fetched from the API — 4 random damage-dealing moves per fighter
- Turn order based on real Speed stats
- Damage calculated using the actual Gen formula (power × atk/def)
- Full 18×18 type effectiveness matrix (super effective, not very effective, immune)
- Defeating the wild Pokémon auto-catches it and adds it to your PC Box
- Confetti and vibration on victory

### Bill's PC Box
- Visual grid of all 1,025 Pokémon — caught = full color, uncaught = greyed out
- **Generation filter tabs**: ALL · GEN I · GEN II · GEN III · GEN IV · GEN V · GEN VI · GEN VII · GEN VIII · GEN IX · ❤️ FAVES
- Filter to ❤️ FAVES to see only your starred Pokémon
- Export save as a Base64 string — paste it on another device to transfer progress
- Import save from any previously exported code

### Favorites System
- Tap ❤️ **FAVE** on any caught Pokémon to star it
- Heart icon appears on the main display when viewing a favorite
- Pink glow border in the PC Box grid
- Persists in `localStorage` per player

### Completion Tracker
- Thin cyan progress bar under the header
- Shows `X / 1025 CAUGHT` for the active player
- Updates live on every catch; swaps automatically when toggling P1/P2

### Battle Win/Loss Record
- Every battle result is saved — `W: X | L: Y` displayed in the PC Box
- Tracked separately for P1 and P2
- Included in export/import save codes

### Daily Pokémon Spotlight
- A different Pokémon is featured every day (seeds from the calendar date)
- Loads automatically on boot
- Gold **TODAY** badge appears on the Dex ID line

### Type Matchup Helper
- Tap any type badge (e.g. `FIRE ℹ`) to open the matchup sheet
- Shows: Weak to · Resists · Immune to · Super Effective vs · Not Very Effective vs
- Designed to teach kids the type system
- Dismisses with a tap outside or the ✕ button

### Two-Player Support
- **P1** (red theme) and **P2** (blue theme) — toggle in the header
- Completely separate catch collections, favorites, battle records, and save files
- Theme color switches instantly across the whole UI

### Audio & Haptics
- 8-bit synthesizer built from scratch using the Web Audio API (no `.mp3` files)
- Authentic Pokémon cries from the official games (`.ogg` via PokéAPI)
- Text-to-Speech Pokédex readings
- Haptic vibration on button presses, catching, and taking damage in battle
- Global audio kill-switch — navigating to a new Pokémon stops everything

---

## Technical Notes

- **Zero dependencies** — one `.html` file, no npm, no build step
- **PWA-ready** — `apple-mobile-web-app-capable`, `100dvh`, safe area insets, touch-action tuned for Safari
- **Fetch with AbortController** — 8-second timeout on every API call; never hangs
- **localStorage** — all save data stored on-device, nothing sent to a server
- **lazy loading** — PC Box images use `loading="lazy"` so 1,025 sprites don't all load at once
- Tested on iOS Safari (standalone PWA) and Chrome for Android

---

## Project Structure

```
pokedex/
├── index.html      # Entire app — HTML + CSS + JS in one file
├── README.md
├── CHANGELOG.md
├── SECURITY.md
└── LICENSE
```

---

## Save Code Format

Export produces a Base64-encoded JSON string (v2 format):

```json
{
  "v": 2,
  "p1": [1, 4, 7, 25],
  "p2": [152, 155],
  "f1": [25],
  "f2": [],
  "r1": { "w": 5, "l": 2 },
  "r2": { "w": 0, "l": 0 }
}
```

v1 save codes (caught data only) are also supported on import.

---

## Version History

See [CHANGELOG.md](CHANGELOG.md) for full history.

Current version: **v15.0** — All 1,025 Pokémon, 6 new features, Safari PWA loading fix.

---

## Credits

- Pokémon data: [PokéAPI](https://pokeapi.co)
- Sprites: [PokeAPI/sprites](https://github.com/PokeAPI/sprites)
- Pokémon is © Nintendo / Game Freak. This is a fan project for personal use.
