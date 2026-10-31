# Quality baseline: Sprout Road (v20 doorway) and classic

The "before" numbers for the HTML craft plan, Phase 3. Recorded on **2026-10-31** with no game code changed.

| | |
|---|---|
| Game commit | `fa704fc` (classic `APP_VERSION` 20.2.2, Sprout Road `APP_VERSION` 19.13.0) |
| Audit skills | `addyosmani/web-quality-skills` @ `afa8da942115f2961fdbfa80807ea0b232ff6c00`, five skills in `.claude/skills/` (gitignored, local only) |
| Tools | Lighthouse 13.4.1 and DevTools performance traces through Chrome DevTools MCP |
| Server | `npm run serve` (Python `http.server`, port 8321, no compression) |
| Browser | Isolated Chrome profile. Real saves on GitHub Pages and the boys' devices were never touched. |
| Throttling for traces | Mobile 412×823 @2x, 4× CPU slowdown, Slow 4G |

**What was audited:**
- **Sprout Road** (`/next/`): the app the boys play. The site root is a doorway that forwards here.
- **Classic** (`/classic/`): kept for old saves. One Lighthouse run, for comparison.

> **Lab data only.** There is no real-user (CrUX) data for this game. Treat these numbers as regression guardrails, not proof of how it feels on the boys' devices.

## Lighthouse scores

| Page and state | Accessibility | Best Practices | Agentic Browsing | SEO (ignored) |
|---|---|---|---|---|
| Sprout Road, "Who's playing?" (mobile) | **92** | 100 | 100 | 91 |
| Sprout Road, "Who's playing?" (desktop snapshot) | 92 | 100 | 100 | 80 |
| Sprout Road, battle screen (mobile snapshot) | 92 | 100 | 100 | 80 |
| Classic, boot screen (mobile) | 82 | 100 | 100 | 82 |
| **Plan target** | **≥ 95** | **≥ 95** | n/a | n/a |

Sprout Road loses its 8 accessibility points to one moderate issue, the zoom lock. Fixing that one line should reach the ≥ 95 target.

**Desktop:** the normal desktop audit of Sprout Road failed twice with "page did not paint any content" (`NO_FCP`). The page does render on desktop (checked with a screenshot and a first paint at 356 ms). The cause is the fade-in described under Core Web Vitals, so the desktop row uses snapshot mode instead.

## Core Web Vitals, Sprout Road (lab)

| Metric | Measured | Threshold | Result | Notes |
|---|---|---|---|---|
| LCP | **not recordable** | ≤ 2,500 ms | ⚠️ blind spot | See "Measurement blind spot" below. With reduced motion on (warm load), LCP is the `h1` "WHO'S PLAYING?" at **1,060 ms** ✅ |
| First paint, cold load (no service worker) | 4,216 ms | n/a | for reference | `style.css` is render-blocking: 2.7 s on Slow 4G, uncompressed on the local server |
| CLS, load and play | 0.00 / 0.01 | ≤ 0.1 | ✅ | |
| INP, worst tap | **504 ms** | ≤ 200 ms | ❌ | The first tap, PLAYER 1 → Pebble Hills. Input 56 ms + **processing 353 ms** + presentation 95 ms. |

### Measurement blind spot: the scene fade-in

- **The cause:** every scene enters with `.scene-enter { animation: scene-in .25s }`, which fades from `opacity: 0` (`next/style.css:105`). Chrome doesn't count transparent content as painted.
- **Confirmed in this session by comparing two warm reloads:**
  - Motion on: `first-paint` is recorded but no `first-contentful-paint` and no LCP.
  - `prefers-reduced-motion: reduce`: FCP and LCP both fire at 1,060 ms.
- **What it means:**
  - Lighthouse can't time Sprout Road.
  - Google's real-user data would get no LCP for this page.
  - The boys see nothing wrong.
- **Possible fixes** (verify with a trace after either change):
  - skip the fade on the first scene after page load, or
  - start the fade from a visible opacity instead of 0.

### Other trace notes (hypotheses, not proven)

- **The PLAYER 1 tap:** most of its time is the game's own code running (353 ms at 4× CPU slowdown). Profile what entering the road screen does first.
- **The Pokédex screen renders all 649 entries at once:**
  - 1,396 elements in total; `.dex-grid` alone has 649 children
  - one style recalculation of 95 ms and one layout of 70 ms
  - It wasn't the worst tap in this run, but it's the next most likely slow spot on an old tablet.

## axe-core violations by severity

These are Lighthouse's accessibility audits, which run axe-core 4.12. Impact levels come from the report data.

### Sprout Road
- **Critical:** none.
- **Serious:** none.
- **Moderate:** `meta-viewport`. `maximum-scale=1.0, user-scalable=no` blocks pinch-zoom (`next/index.html:5`).
- **Minor:** none.

### Classic (boot screen, cold load)
- **Critical:** `image-alt`. Two images have no `alt`: `img#poke-sprite` and `img#dex-throw-ball`. This is down from 9 on v18.11.
- **Serious:** `color-contrast`. The boot version label `#boot-version` measures **1.57:1** (`#cbcd88` on `#8bac0f`, 8 px bold); needs 4.5:1.
- **Moderate:** `meta-viewport` (same zoom lock).

## Manual checks (Sprout Road)

- **The structure is clean:**
  - one `main`, an `h1`, real `button`s
  - Pokédex filters exposed as `tab`s, search as a `searchbox`, entries as `listitem`s
  - battle moves are named buttons ("GIGA DRAIN"), and the battle sprites have `alt`
- **Keyboard:** Tab reaches PLAYER 1 first, with a visible **4 px yellow focus ring** (`:focus-visible`).
- **Pointer targets:** Lighthouse `target-size` (24×24 px) passed.

## Compared with the v18.11.0 numbers (recorded earlier the same day, superseded)

| | v18.11.0 | Now |
|---|---|---|
| Accessibility score | 71–78 | 92 Sprout Road / 82 classic |
| Images missing `alt` | 9–12 | 0 Sprout Road / 2 classic |
| Type-tag contrast (16 of 18 failed) | ❌ | fixed (v19.8.4 picks dark or light ink per chip) |
| "Spoken names" text in Settings | present | gone |
| Google Fonts request | render-blocking | font self-hosted and preloaded |

## Against the plan's targets

| Check | Target | Baseline | Result |
|---|---|---|---|
| W3C markup validator | 0 errors | not run | not run |
| axe-core, Sprout Road | 0 serious or critical | 0 | ✅ |
| axe-core, classic | 0 serious or critical | 1 critical, 1 serious | ❌ |
| Pointer targets | ≥ 24×24 CSS px | `target-size` passed | ✅ (automated only) |
| Core Web Vitals (lab, Sprout Road) | LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 | LCP blind spot (1.06 s with reduced motion) · INP 504 ms · CLS 0.01 | ⚠️ · ❌ · ✅ |
| Lighthouse a11y / best practices | ≥ 95 | 92 / 100 | ❌ (one line away) / ✅ |
| Third-party scripts | SRI-hashed or inlined | none; strict CSP with `script-src 'self'` | ✅ |
| Unreviewed skills installed | 0 | 0 | ✅ |

## Fix next (Phase 3, step 4)

**Serious and critical:** only classic has any.
1. Add `alt` to classic's `#poke-sprite` (the Pokémon's name) and `#dex-throw-ball` (`alt=""`, decorative).
2. Raise classic's `#boot-version` contrast to at least 4.5:1.

**Highest value for Sprout Road:**
- **Re-enable zoom.** Drop `maximum-scale=1.0, user-scalable=no` from both apps. This is the only thing keeping Sprout Road under 95. Check first that the boys' tablets don't zoom by accident mid-battle; if they do, record that as a deliberate exception.
- **Fix the fade-in blind spot,** so load speed can be measured at all.
- **Profile the PLAYER 1 → road tap** (504 ms) and consider rendering the 649-entry Pokédex grid in pages.

## Not covered by this baseline

- Real-user Core Web Vitals (no CrUX data), real-device testing, and screen-reader testing.
- W3C validator.
- Sprout Road flows that weren't exercised: garden, hatch, evolve, versus, Play Together, grown-ups lock.
- Classic manual checks: the v18.11 keyboard and boot-overlay findings weren't re-checked on v20.2.2.
- The Playwright suites (`test/smoke.mjs`, `test/next-smoke.mjs`, `test/doorway.mjs`) couldn't run on this Mac because Playwright isn't installed (`npm run setup`).
  - Import check: passed (721 names, 69 modules).
  - Engine tests: 18/18.
  - Sprout Road unit tests: 279/279.

## Re-running this baseline

From the repo, in Claude Code:

> Run a web quality audit on Sprout Road at http://localhost:8321/next/ and classic at /classic/ (`npm run serve`). Compare against docs/quality-baseline.md using the same throttling (mobile 412×823, 4× CPU, Slow 4G), cold and warm loads, and the same taps (PLAYER 1, POKÉDEX, BACK, NEXT BATTLE, one move). Don't change any code.
