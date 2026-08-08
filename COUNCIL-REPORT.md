# Pokédex OS — Expert Council Report

*50 independent expert audits · 8 adversarial debate panels · 298 findings*  
*Codebase reviewed: v18.2.0 (~5,200 lines) · North star for all tie-breaks: **the boys' fun***

> **Product ruling applied after this report was written — read this first.**
> Kevin has ruled that **the game does not talk.** All speech synthesis is out, including the TTS that ships today (Junior Mode's spoken names, the 🎙️ VOICE button, `speak()` / `isSpeaking()` in audio.js). This report is preserved as the council's raw output, so wherever an expert (notably Hassan, Kim, Mendes, Kowalski) recommends narration, spoken feedback, or self-voicing UI, **treat that specific remedy as rejected** — the finding underneath it usually still stands.
> The affected finding is the CRITICAL one that ART is a pre-reader and ~100% of the battle narrative is text. That problem is real and is being solved **visually instead of vocally** in Week 3 of ROADMAP.md ("Show, Don't Tell"): wordless type-coloured move tiles, a shared `impactFx()` visual grammar for effectiveness and crits, and icon-led status. ROADMAP.md is the authoritative plan; this report is the evidence behind it.

## Contents
1. [Scoreboard](#scoreboard)
2. [Debate panel verdicts](#debate-panel-verdicts) — the authoritative rulings
3. [Critical findings](#critical-findings)
4. [High-severity findings](#high-severity-findings)
5. [All findings by expert](#all-findings-by-expert)
6. [The boldest ideas](#the-boldest-ideas)

---

## Scoreboard

| Severity | Count |
|---|---|
| Critical | 33 |
| High | 113 |
| Medium | 113 |
| Low | 39 |
| **Total** | **298** |

| Kind | Count |
|---|---|
| Design Flaw | 133 |
| Bug | 75 |
| Missed Opportunity | 44 |
| Polish | 28 |
| Tech Debt | 18 |

---

## Debate panel verdicts

*Eight panels convened the relevant experts, staged their disagreements, and ruled. These verdicts are authoritative — they resolved the conflicts before the roadmap was drafted.*

### 🏛️ Fun vs Authenticity — ruling on free dex-catching, capture-all spoils, fixed-ladder difficulty, and battle length (28 prior reports triaged to 14 in-scope + 12 fresh; all disputes settled against /home/claude/pokedex source)

**Tensions resolved**

**Free unlimited dex-page catching (649 species, no encounter, no cost)**

- *One side:* Aria Voss, Mila Fernandez, Oscar Pena, Jordan Avery: catch.js:40-97 lets any of 649 — Mewtwo included — be caught by tapping CATCH on the dex screen with unlimited free Poké/Great/Ultra Balls (only Master Balls are counted, catch.js:46). It voids explore, gyms, rarity, and the Master Ball economy simultaneously. Gate on 'seen'; unseen species render as silhouettes.
- *Other side:* Dr. Hanna Kim's pre-reader walkthrough: the dex screen with a big CATCH button is the ONLY surface a 4-year-old can operate unaided. Junior mode is built around it (catch.js:44-47 forces success). A seen-gate makes the 4-year-old's primary interaction start refusing him.
- **→ Ruling:** SPLIT BY MODE, and sequence it. (1) Junior mode keeps unlimited instant tap-to-catch forever — never gate a pre-reader's only working verb. (2) Non-junior: the CATCH button never says 'no', it changes verb — for a SEEN species it becomes 'FIND IT ▶' and calls the existing startWildEncounter(state.curId) (battle.js:166); for an unseen species it shows a silhouette plus a habitat hint ('nobody has seen this one — try the OCEAN'). That is Jordan Avery's routing, not Oscar Pena's lock, and it turns the gate into a 'Who's That Pokémon?' game both boys play for free. (3) HARD DEPENDENCY, verified: habitat pools (explore.js:10-51) cover 280 species and gym rosters 140, union 313 of 649 — 336 species are reachable ONLY through the dex firehose. Shipping the gate first would make 52% of the dex permanently uncatchable and torch the collection north star. Backfill habitats by type (or ship a champion-unlocked 'FARAWAY LAND' pool of everything unplaced) in an earlier week, THEN gate.

**Capture-all gym spoils (58 trainers → 164 awards, 140 unique species, 21.6% of the dex)**

- *One side:* Oscar Pena, Walt Fischer, Sam Ellington, Jordan Avery: battle.js:550-557 dumps the whole beaten team into the box at trainer level. Aria Voss computed the consequence — a looted Lv53 ace beats anything a kid can raise at 25+10L XP per level (state.js:117), so 'train' collapses into 'loot' and each gym's spoils out-level the next gym's opener. Replace with pick-ONE at trainer level −3.
- *Other side:* 'I beat him and I got his WHOLE TEAM' is the loudest, most brag-worthy, most legible reward in the product, and the 4-year-old cannot make a strategic draft pick. Nerfing the prize to fix an economy is nerfing the fun to fix the math.
- **→ Ruling:** KEEP THE WHOLE TEAM AT FULL TRAINER LEVEL — the prize is not the problem, the player's own team falling behind is. Fix it from the other side (party XP share, endorsed separately) so his hand-raised Pikachu keeps pace instead of making the trophy smaller. Then repair three things that cost zero joy: (a) render spoils as SPRITES with one 'PICK YOUR FAVORITE' tap that gives that mon the full catch animation and a team slot — a ceremony, not a restriction; (b) battle.js:552-557 calls ensureMon(m.id, m.level) but state.js:106-109 only writes when absent, so 24 of 164 duplicate awards silently do nothing while the modal claims otherwise — change to max(existing, m.level); (c) stop dispatching kind:'catch' per spoil (battle.js:555) — it auto-completes 'Catch 4 Pokémon' daily quests without a ball ever being thrown.

**Fixed-ladder difficulty (gyms Lv8→80, sequential unlock) vs wilds that rubber-band to your lead**

- *One side:* Ivan Petrov, Ritu Sharma, Dev Okonkwo: battle.js:131 pins every wild to leadLevel*(0.8+rand*0.4), so turns-to-KO is mathematically constant from Lv5 to Lv100 (verified: 1.9 turns at Lv5, 2.5 at Lv100). Growth is never felt. Give habitats fixed level bands so 'go train at the volcano' becomes a real decision.
- *Other side:* Rubber-banding is the reason a 4-year-old never meets an unwinnable wild. Fixed bands mean he taps VOLCANO and gets deleted with no way to read the warning. Meanwhile Ritu also proved the dial is broken in the other direction: the lead falls back to caught.slice(0,6) (battle.js:124-126) over a dex-sorted array (state.js:140), and Explore never opens the team picker — so for the 4-year-old the entire difficulty of the game is set by whichever species has the lowest dex number.
- **→ Ruling:** BANDS WITH A LEASH, plus fix the dial. Give each habitat a base level band that rises with badges, then clamp it to [lead−3, lead+5] in junior and [lead−5, lead+8] otherwise — the volcano genuinely is harder and pays more XP, but can never become a wall. Put a 3-pip difficulty indicator on each habitat card and 'RECOMMENDED Lv N' on each trainer card (gym.js:119-127) as INFORMATION, never a lock. Fix the dial: auto-set team=[id] on first recordCatch, never fall back to dex-sorted caught for lead selection, and show a persistent LEAD chip (sprite + Lv) on the explore and battle screens. THE ACTUAL EMERGENCY here is neither side's: the ladder is fixed, junior mode cannot lose (battle.js:441), and junior does nothing to OUTGOING damage — a Lv8 mon does ~2.6 damage into Champion Rex's ~218 HP bar, ~84 turns per mon, ~450 for the team. Junior mode is unloseable AND unwinnable. That is the top fix in this whole panel.

**Battle length: dead air vs celebration**

- *One side:* Tom Bauer: every beat is a fixed sleep() — 900ms after the move line, +900 for crit, +900 for super-effective serially (battle.js:428, 455-458), 400ms tail, ~43s of unskippable dead air in a 3-mon gym fight, plus a 6.6s identical ending cinematic after EVERY wild win. Ship an awaitOrTap() primitive and hold-to-fast-forward.
- *Other side:* Luna Martinez, Jun Park: the pauses ARE the juice; level-up already has literally zero celebration (one 9px <p>, battle.js:626) and the champion moment is one line of body text. Cutting timing to save seconds trims the only thing that makes a win feel like a win.
- **→ Ruling:** SEPARATE TURNS FROM SECONDS — they were never the same argument. Turns stay short (~3-4; the junior damage floor fixes the gym marathon). Seconds: ship awaitOrTap with a 250ms floor so a tap skips the WAIT but never the animation, and merge crit + effectiveness into one line ('CRITICAL — super effective!') so the worst case drops 3.1s → 900ms. Then spend every second saved on Luna's side of the ledger: FIRST occurrence of any ceremony (first shiny, first evolution, champion, each level-up) plays at full length and unskippable; repeats become tap-through. Fun wins the tie toward skippable because a 4-year-old tapping at unresponsive dead air is learning that the screen ignores him — which is a worse lesson than a shortened animation.

**Auto-catch on KO makes the entire ball system strictly dominated**

- *One side:* Walt Fischer, Ivan Petrov, Sam Ellington, Mila Fernandez: handleVictory (battle.js:735-748) catches any fainted wild with 100% certainty, free, no ball spent, while a real throw at full HP with a Poké Ball is 5.9% (catchChance, battle.js:631-638) and a miss hands the enemy a free hit. Balls, all four tiers, and the Master Ball that every badge and quest pays out are strictly dominated. Remove auto-catch; add flee timers so the Master Ball finally matters.
- *Other side:* 'I won, so I got it' is the single clearest causal rule in this product, and it is the one a 4-year-old can hold in his head. Restoring the ball economy restores a failure surface for the express purpose of making a currency scarce.
- **→ Ruling:** KEEP AUTO-CATCH ON KO. Fix the honesty instead of the outcome. Rebrand the BALL button as what it actually is — the shortcut ('CATCH IT NOW, SKIP THE FIGHT') — and make it teach: recolour and relabel it live from catchChance in the HP bar's own red/yellow/green ('BALL · TOUGH / FAIR / EASY'), which makes the hidden hpFactor rule visible with no numbers and rewards watching the enemy's bar. Give ball-caught mons one small visible bonus (a ribbon in the PC, or +50% XP) so choosing to throw means something. Master Balls stay as the 'guaranteed, instant, on a legendary' button — the one place scarcity is genuinely thrilling. Add Sam Ellington's and Lena Morris's pity counter to dex throws (odds rise ~25% relative per break-free, reset on catch) so a capture_rate-3 legendary can never produce a 40-throw failure streak in red text at a 7-year-old.

**Endorsed**

- CRITICAL / effort S — Junior mode outgoing damage floor. battle.js:441 halves incoming and floors HP at 1 but does nothing to outgoing: a Lv8 junior mon deals ~2.6 into a Lv80 ~218 HP bar (~84 turns/mon, ~450 for Champion Rex). Add `damage = Math.max(damage, defender.maxHp * 0.15)` when the attacker is the junior player, and cap any single incoming hit at ~35% of maxHp so he stops living permanently pinned at 1 HP. Two lines; it converts the entire back half of the ladder from impossible to playable for the 4-year-old.
- HIGH / effort S — Party XP share. addXp fires only for the mon on the field at the KO (battle.js:511 and 613), so the bench is decorative forever and the 4-year-old's five spare mons sit at DEFAULT_LEVEL 5 while his lead hits 50. Give the KO'er 100% and every other team member 50%. This is also the correct fix for gym-loot inflation — it raises the player's own team instead of shrinking the prize.
- HIGH / effort M — awaitOrTap() everywhere in the battle pipeline, plus merge the crit and effectiveness lines into one. Removes ~43s of unskippable dead air per 3-mon gym fight and makes the 6.6s post-wild-win cinematic tap-through-able. Rule: first occurrence of any ceremony always plays in full.
- HIGH / effort S — Level-up and catch celebration. The most frequent milestone in the game is one 9px <p> (battle.js:626) styled identically to the XP line above it. Add a sprite-forward victory modal (PIXEL_SPRITE and spawnConfetti are both already imported and unused there), a rising 4-note fanfare, and a 'LV. 12!' burst. Same change kills the prompt() nickname dialog that fires mid-confetti (catch.js:110-119, battle.js:604-610) — replace with an optional 'NAME ME ✏️' button on the modal.
- HIGH / effort S — Gym wins can never trigger evolution. pendingEvolution is set only in concludeCapture (battle.js:627) and explicitly nulled at battle.js:571 after a trainer win, even though that path awards XP and prints 'grew to Lv..'. Set it to t.lastXpMon when ups > 0 instead of nulling. One line; restores the game's highest-value teaching-and-wow beat on its main content path. Found independently by three experts.
- HIGH / effort S — Sparkle: fix both ends. Unlock on `player().shinies.length > 0` instead of hasShiny(leadId) (battle.js:110-117) — as written it demands the shiny of your specific lead species from a uniform 1-649 roll, which is effectively unreachable while the locked button advertises it every battle. Then cut the 2.0x (battle.js:438) to 1.5x: multiplicative with STAB and crit it currently reaches 4.5x before type, which is a wider swing than the entire type chart and erases the mechanics it sits on top of.
- HIGH / effort S — buildFighter move hygiene (battle.js:56-63). Drop moves where damage_class === 'status' or power == null (Hypnosis, Thunder Wave, Spore currently become 40-power attacks), clamp power to ~120, and exclude explosion/self-destruct — the 70% trainer AI sorts on raw power and will deterministically spam a free 250-power nuke. Replace the biased `sort(() => 0.5 - Math.random())` with Fisher-Yates while in there.
- HIGH / effort M — Physical/Special split. computeStats (battle.js:35-43) builds only hp/atk/def/speed, so every move resolves against physical stats. This gutts exactly the Pokémon a 7-year-old picks because they look cool (Alakazam 50 atk vs 135 sp.atk, Gengar 65 vs 130) AND the gym ACES, who are disproportionately special attackers. Add spatk/spdef and branch on the move's damage_class, which PokeAPI already returns on the move object fetched at battle.js:60. ~10 lines, no new requests.
- MEDIUM / effort S — Micro-fix bundle, all one-liners: (a) multiply damage by 0.85 + Math.random()*0.15 (battle.js:439) so repeat fights stop being carbon copies; (b) add 'steel' to fire's resist list (config.js:32) — Fire has resisted Steel since Gen 2 and Elite Stone's whole roster is steel; (c) make todayNumber() local-time (progression.js:37) — UTC rollover wipes partial quest progress at 5pm PT, mid-play; (d) route quest XP to the highest-level owned mon instead of team[0] || caught[0] (progression.js:119), which currently feeds whichever species has the lowest dex number.
- CRITICAL / effort L, SEQUENCED — Seen-gate the dex catch for non-junior players only, and only AFTER habitat backfill. Order matters and is load-bearing: habitats cover 280 species and gyms 140 (union 313 of 649), so gate-first strands 336 species. Week N: backfill habitat pools by type (or add a champion-unlocked 'FARAWAY LAND' pool of everything unplaced). Week N+1: unseen species become silhouettes with a habitat hint, seen species turn CATCH into 'FIND IT ▶' routed through the existing startWildEncounter. Junior mode is exempt at every step.

**Rejected**

- ~~Poké Coins as a minted currency, with balls, heals, and gym entry bought from a shop (Walt Fischer's bold idea). Technically the correct answer to a faucet with no sink — and wrong here. It invents a budgeting chore for a 4-year-old who cannot budget, adds an entire new economy to a 3,320-line vanilla-JS codebase maintained by one AI engineer with a non-developer approving each weekly push, and solves a scarcity problem this product does not have because nothing is monetized and nobody is being retained.~~
- ~~Flee timers — wilds and legendaries escaping after 3-4 turns or failed throws (Mila Fernandez, Aria Voss). This is engineered loss whose only purpose is to prop up the Master Ball's relevance. A pre-reader watching a legendary he found vanish learns the game takes things away from him, and the 7-year-old learns to hoard rather than play. Fix the Master Ball's relevance with the guaranteed-instant-skip framing instead.~~
- ~~Removing auto-catch on KO (Walt Fischer, Ivan Petrov, Sam Ellington). 'I won, so I got it' is the clearest causal rule in the product and the only one the 4-year-old reliably holds. Removing it restores a failure surface for the express purpose of making a currency scarce. Keep the rule; fix the ball button's honesty instead.~~
- ~~Priced Poké Center heals, one-heal-per-gym limits, and 'entering a gym is a commitment' (Walt Fischer). Attrition design belongs to a ladder the player is meant to grind against. Here it produces a 7-year-old stuck on a Tuesday afternoon with no adult in the house able to read the code and no way out — and the endurance system it protects (battle.js:191-200) isn't even persisted across a reload.~~
- ~~Economic brakes on progression: sublinear XP against the level gap, xpThreshold = 25 + level²*1.2, a soft ceiling pinning the lead to nextUnbeatenTrainer.level + 3, and level-gating gym access (Ritu Sharma, partially Dev Okonkwo). Every one is mathematically right about inflation and wrong about this player. 25 + level*10 is a deliberately generous curve for a kid who plays twenty minutes a week; making the number go up slower is making the reward smaller. A soft ceiling is worse still — it stops the one number the boy actually watches. Ship 'RECOMMENDED Lv N' as information and never lock a trainer card: a 7-year-old who wants to try Leader Rocko early should be allowed to try and lose.~~
- ~~Replacing the stat-based damage formula with a target time-to-kill model (Ivan Petrov's bold idea). It is the cleanest way to guarantee 4-turn fights, and it deletes the payoff of the dex's own stat bars — a 7-year-old reading Charizard's ATK bar and having that number matter IS the franchise-authenticity half of this panel's mandate. It also makes the physical/special split, the highest-value fidelity fix on the board, meaningless. Hit the same target with the junior damage floor plus per-hit caps, which are local and reversible.~~
- ~~Adding accuracy checks and misses (implied by full-fidelity battle modelling; Grace Liu and Kenji Watanabe both pre-emptively decline it, correctly). A whiffed turn spends the 4-year-old's single tap on nothing. Same ruling for PP, status conditions, and held items: authenticity that costs a child his turn is authenticity we do not buy. Damage variance (0.85-1.00) delivers the 'will it KO?!' tension without ever taking a turn away.~~
- ~~HEART FIRE / stacking comeback buffs that visibly mark the losing brother (Sam Ellington's bold idea, adjacent to Rafa Costa's handicap). A flame badge that grows on the 4-year-old's sprite is a public label reading 'this is the one who keeps losing' — worse than losing quietly. ENDORSED in its place: Rafa's FAIR FIGHT toggle, defaulted ON whenever either profile has junior enabled, normalizing both sides to a common level in the buildFighter calls (cosmetic, no save writes), plus a two-step confirm on END MATCH so the losing brother can't void the winner's recorded VS win.~~

---

### 🏛️ ECONOMY & PACING — RULING

VERDICT ON THE MANDATE: No. The reward economy does not hold over 4 weeks. It holds about 9-12 days. Every number below I re-derived from the code, not from the reports.

The ledger, verified:
- XP curve (js/state.js:117 `25 + level*10` vs js/battle.js:509/612 `base_exp/2 + level*3`): a flat 1.67 battles/level at Lv5, 2.50 at Lv20, 2.92 at Lv50, 3.10 at Lv99. Simulated Lv5→Lv100 in 269 wild battles. The curve never bends because js/battle.js:131 pins wild level to `leadLevel * (0.8 + rand*0.4)`. Ivan, Ritu, Walt, Dev and Aria all landed on this independently and they are right.
- Gym ladder (js/gymdata.js:9 `lv=(g,i)=>8+g*6+(i===4?5:i)`): 58 trainers, Lv8→80. Spoils (js/battle.js:550-557) award 164 Pokémon / 140 unique species = 21.6% of the 649 dex. Each win hands you 1-3 mons at level i, and the next trainer is level i+1. The ladder supplies its own solution: the entire circuit is beatable on looted mons with zero training. Walt's framing is the correct one.
- Master Balls: faucet = 1 start + 8 badges + 1/day sweep = up to 37 by day 28. Sinks ≈ 0 — Ultra Balls are free and unlimited on the dex page (js/catch.js:74-79), any KO auto-catches for free (js/battle.js:735-747), and Junior mode never consumes one (js/catch.js:44-47). The scarcest reward in the game buys nothing.
- Badges (js/progression.js:12-21): simulated against the ladder, VOLCANO ("Catch 50") fires at gym win #23 of 58. All 8 are gone before the halfway point, and 5 of 8 fire off spoils rather than anything the boy did on purpose. Walt's #23 figure is exact.
- Duplicates: 24 of the 164 spoil awards are repeat species. `ensureMon` (js/state.js:106-109) only writes when the entry is absent, yet the victory line prints `#${id} Lv${m.level}` unconditionally. The game lies to the child 24 times per circuit. Confirmed bug, not a design opinion.
- Quest XP is a flat +30 (js/progression.js:119): 40% of a level at Lv5, 5.7% at Lv50, 3.6% at Lv80. The daily loop decays to nothing by week 2 on its own. And `todayNumber()` (js/progression.js:37) is UTC — for this household quests roll over during dinner, so the boys wake up to yesterday's completed list.
- Post-Champion: no champion flag exists anywhere in `freshPlayer` (js/state.js:10-24). js/gym.js:130 binds clicks only to `.trainer-card:not(.beaten)`, so all 58 hand-authored trainers become permanently dead UI. 336 of 649 species (explore 280 ∪ gym 140 = 313) are unreachable through any play system. The ending is one `<p>` sitting in the same list as "#006 Lv53 · #009 Lv53".

Shape of the four weeks as shipped: week 1 is genuinely excellent. Week 2 the badge track dies. Week 3 the ladder stops gating and duplicates start paying nothing. Week 4 there is no new thing left to happen.

THE ONE-LINE ROOT CAUSE: three separate systems (wild level, gym spoils, badges) are all keyed off the player instead of off the world, so the world can never get ahead of the player. Fix js/battle.js:131 and js/battle.js:550-557 and roughly two-thirds of this panel's findings evaporate.

HOW I RULED. The north star did real work here. Several experts arrived at technically correct economy fixes that are wrong for a family game: dampen the XP faucet, cap the lead's level, charge for healing, make wilds flee, mint a currency. Every one of those makes the game *better balanced* by making a 7-year-old's numbers go up slower or by introducing "you can't afford it" to a 4-year-old. I rejected all of them. The correct move in this product is never to close the faucet — it is to widen the drain and give the child more places to spend. Redistribute XP to the bench instead of throttling it; convert spoils into a choice instead of deleting them; give the Master Ball a moment worth hoarding for instead of a price tag.

I also weighted effort hard. One AI engineer, weekly pushes, zero build, a non-developer approving the diff. Six of my ten endorsements are S-effort and four are literally one or two lines. Nothing I endorsed requires a new screen, a new currency, or a new per-mon stat.

SEQUENCING (four weekly pushes, in this order):
W1 — the honesty pass: pick-one spoils + duplicate fix + `gymCatch` event + relative quest XP + local-time day. This alone buys back the week-2 cliff.
W2 — the pacing pass: bench XP share + habitat level bands + XP bar.
W3 — the scarcity pass: badge rebase onto the 11 leaders + Master Ball flee-timer sink + ball-vs-KO payoff split.
W4 — the ending pass: persist champion + Hall of Fame ceremony + unlock rematches.

**Tensions resolved**

**Auto-catch on KO: remove it, or keep it and re-price the ball?**

- *One side:* Walt Fischer (backed by Ivan Petrov, Mila Fernandez, Oscar Pena): auto-catch is the single root cause of the dead ball economy. js/battle.js:735-747 catches with 100% certainty, no ball spent, no roll — which makes hpFactor, all four ball tiers and Master Ball scarcity simultaneously meaningless. Remove it: a fainted wild gives XP and drops a Poke Ball; catching requires a throw while it is still standing.
- *Other side:* Sam Ellington, Diego Alvarez and Aria Voss: the 4-year-old who beats a Pokemon and then watches it walk away is a 4-year-old who cries. Auto-catch is precisely why a pre-reader can play this game unaccompanied. Don't remove it — differentiate the two paths so the ball becomes the greedy play.
- **→ Ruling:** Side B, on the north star. Removing a prize the child already won is the one change guaranteed to produce tears, and it lands hardest on ART. But Side A's diagnosis is correct, so take it via price rather than removal: KO-catch joins the box at DEFAULT_LEVEL 5 with base XP; ball-catch joins at the wild's actual level with +50% XP. `ensureMon` already accepts a level argument (js/state.js:106), so this is a two-line change. The ball stops being strictly dominated without anyone ever losing a Pokemon they beat. Junior mode exempt — both routes identical for ART.

**The XP faucet: dampen it, or redistribute it?**

- *One side:* Ritu Sharma: XP must go sublinear against the level gap (`min(1, ((wildLevel+5)/(leadLevel+5))**2)`) or xpThreshold must go quadratic, and the lead should be soft-capped at `nextUnbeatenTrainer.level + 3`. Otherwise the lead outruns the ladder from day 2 and hits Lv100 with weeks of circuit left.
- *Other side:* Walt Fischer, Dev Okonkwo and Aria Voss: the curve isn't the defect. 269 battles currently fund exactly one Pokemon because XP goes only to the mon on the field at the moment of KO (js/battle.js:511, :613). Keep 25+L*10, split the XP six ways, and make the world stop scaling to the player.
- **→ Ruling:** Side B, decisively, and I reject Ritu's remedies outright while keeping her diagnosis. Ritu is right that the lead outruns the ladder; she is wrong about the lever. Telling a 7-year-old 'your number goes up slower now' is the single most anti-north-star move available, and a soft ceiling stops the number entirely at the moment he is most invested. The flatness — not the speed — is the bug, and it lives at js/battle.js:131. Band the habitats, share XP with the bench, and the same 269 battles suddenly build a team instead of a carry. Then add the XP bar: there is no XP readout anywhere in the app, and for this age the visible fill IS the reward.

**Gym spoils: capture-all, or pick-one?**

- *One side:* Walt Fischer, Oscar Pena, Jordan Avery and Sam Ellington: 164 awards / 140 unique species = 21.6% of the dex, delivered as a joined text string, self-supplying the ladder and auto-completing catch quests. Replace with 'keep ONE at trainer level minus 3', rest converts to XP.
- *Other side:* Aria Voss and the north star: 58 trainer wins each raining Pokemon is a loud, legible, hugely satisfying reward for GABE, and pick-one triples the grind to fill a dex he is already excited about.
- **→ Ruling:** Side A on structure, Side B on volume — and they reconcile completely. Make it a pick-one CEREMONY, not a pick-one tax: show the defeated roster as three tappable sprites, 'PICK YOUR PRIZE', play the capture animation on the one he taps. The other two are not deleted, they are CONVERTED — labelled '(x2 → +140 XP)' to the mon that landed the KO. Nothing is taken away; a text string becomes a decision plus a level-up. This also fixes the 24 silent duplicate no-ops for free (keep at `max(existing, m.level)`) and is the natural place to change the dispatched event from `kind:'catch'` to `kind:'gymCatch'`.

**Master Ball: delete it for a real currency, or give it a real sink?**

- *One side:* Walt Fischer's boldest idea: delete the Master Ball and mint POKE COINS. Every KO, explore and quest pays coins; coins buy balls, heals and gym entry. One visible currency, faucets and sinks finally reconciled.
- *Other side:* Aria Voss, Mila Fernandez and Kenji Watanabe: don't build an economy, build a moment. Make legendaries and shinies flee unless balled, and the Master Ball becomes the thing you hoard for exactly the second the 1% roll hits — which retroactively makes all 8 badges valuable.
- **→ Ruling:** Side B. Coins are a new screen, a new save schema, a new balancing surface, and a weekly-push regression risk for one engineer with a non-developer approving the diff — and they introduce 'you don't have enough' to a family game, which is a sentence I will not ship to a 4-year-old. Side B costs roughly fifteen lines and repairs the same ledger: flee timer of 4 player turns on legendary and shiny encounters only, legendaries exempted from auto-catch-on-KO, non-junior only. Thirty-seven Master Balls with no purpose becomes thirty-seven Master Balls the boys are actively saving.

**Post-Champion: generate new content, or re-run the existing content?**

- *One side:* Amara Osei: ship SEASONS — a procedurally regenerated 13th gym seeded weekly off `todayNumber()/7`, plus daily featured habitats and swarms. Infinite content, zero server, and the seed infrastructure already exists at js/progression.js:39-42.
- *Other side:* Mila Fernandez and Dev Okonkwo: persist a champion flag first, then unlock rematches by deleting the `:not(.beaten)` filter at js/gym.js:130, then a Round 2 circuit at +15 levels via the existing `lv()` helper.
- **→ Ruling:** Side B first, Side A deferred — this is sequencing, not disagreement. Amara is right that 58 trainers rotting behind a CSS selector is the largest wasted asset in the codebase, but her remedy inverts the order of value. The game currently does not remember that the boy became Champion at all: there is no champion flag in `freshPlayer` (js/state.js:10-24) and the ending renders as one `<p>` beside '#006 Lv53'. Persisting the win and giving it a Hall of Fame ceremony is a two-hour change that fixes the emotional cliff; rematches are a one-line filter deletion; Round 2 is a level formula and a key suffix. That is three weekly pushes with near-zero regression risk. A weekly generative tower is a content pipeline with no QA and a non-developer approving it — revisit once the ladder is re-runnable.

**Endorsed**

- [CRITICAL / effort M] Replace gym capture-all with a PICK-ONE ceremony (js/battle.js:550-557). Show the defeated roster as tappable sprites, keep one, play the capture animation; the rest convert to XP for the KO'ing mon, labelled visibly. Cuts 164 awards to 58, restores a reason to train, and is the single highest-leverage change on the board. Unanimous across Walt Fischer, Oscar Pena, Jordan Avery and Sam Ellington.
- [CRITICAL / effort S] Split XP across the party (js/battle.js:511 and :613). KO'er gets full, every other team member 50%. Today 269 battles fund exactly one Pokemon and the six-slot team is decorative — the boys' bench sits at DEFAULT_LEVEL 5 forever. Two-line change, arrived at independently by Aria Voss, Dev Okonkwo and Ivan Petrov.
- [CRITICAL / effort S] Stop gym spoils firing `kind:'catch'` progress events (js/battle.js:555) — dispatch `gymCatch` or omit. Today beating one 3-mon trainer completes 'Catch 4 Pokemon' with zero balls thrown, and inflates the catch stat that gates 4 of the 8 badges. One word; unblocks the badge rebase below.
- [HIGH / effort M] Decouple wild level from the lead (js/battle.js:131). Give each of the 8 habitats a fixed level band that rises as leaders fall, so 'go train at the volcano' becomes a real decision. This one line is why week 4 of play is mathematically identical to day 2, and why growth is never felt.
- [HIGH / effort S] Fix the duplicate-spoils lie (js/battle.js:552-557 vs js/state.js:106-109). `ensureMon` no-ops on owned species while the victory line prints '#006 Lv53' unconditionally — verified 24 of 164 awards per circuit. Set `Math.max(existing, m.level)`, or fold it into the pick-one conversion as '(DUPLICATE → +140 XP)'.
- [HIGH / effort S] Ball-catch vs KO-catch payoff split. KO-catch joins at Lv5 with base XP; ball-catch joins at the wild's level with +50% XP. `ensureMon` already takes a level argument. Makes the BALL button the greedy play without ever taking a won Pokemon away from ART. Keeps auto-catch intact; Junior exempt.
- [HIGH / effort M] Rebase the badge track (js/progression.js:12-21). Verified: all 8 are exhausted by gym win #23 of 58, and 5 of 8 fire off spoils rather than deliberate play. Ship 11 gym-leader badges read straight from `p.gyms.beaten` (data already persisted) plus a late tier — 100/300/649 caught, first shiny, a Lv60, Champion. Walt, Mila, Sam and Amara all converge here.
- [HIGH / effort S] Give the Master Ball a sink: legendary and shiny encounters flee after 4 player turns unless balled, and legendaries are exempt from auto-catch-on-KO. Non-junior only. Turns a 37-ball stockpile with zero uses into the thing the boys hoard for the 1% roll — and retroactively makes every badge feel earned.
- [HIGH / effort S] Repair the daily loop's two bookkeeping leaks (js/progression.js:37 and :119). Quest day is UTC, so quests roll over during this family's dinner; use a local YYYY-MM-DD. Quest XP is a flat +30 — 40% of a level at Lv5, 3.6% at Lv80 — make it `xpThreshold(monLevel(lead)) * 0.5` so a daily is always visibly half a level, and stop the `caught[0]` fallback silently feeding the lowest-dex-numbered mon.
- [MEDIUM / effort M, sequenced last] Close the post-Champion cliff in three steps: persist `champion:{date, team}` (absent from js/state.js:10-24) with a real Hall of Fame ceremony instead of one `<p>`; delete `:not(.beaten)` at js/gym.js:130 to allow reduced-XP rematches; then a Round 2 circuit at +15 via the existing `lv()` helper. Also add an XP bar to the battle HUD and PC cards — there is no XP readout anywhere in the app, and for a 7-year-old the visible fill IS the reward.

**Rejected**

- ~~REJECT — Ritu Sharma's soft level ceiling ('the lead can never exceed nextUnbeatenTrainer.level + 3'). Technically it does fix the pacing gap. It also stops a 7-year-old's number from going up at the exact moment he is most invested, and it is incoherent for ART, who may never touch a gym — his ceiling would be Lv11 forever. The north star settles this instantly: never freeze the number. Keep her redistribution idea (route surplus XP into the rest of the box), discard the cap.~~
- ~~REJECT — Ritu Sharma's sublinear XP damper (`min(1, ((wildLevel+5)/(leadLevel+5))**2)`) and the quadratic `25 + level*level*1.2` threshold. Both punish the boys for playing the mode they enjoy, and the quadratic version turns a Lv50 level-up from 2.9 battles into roughly 25. Correct for a live-service game with monetised time; wrong for a family game where the only currency is a kid's attention span. Fix the flatness at js/battle.js:131 instead of taxing the faucet.~~
- ~~REJECT — Walt Fischer's POKE COINS currency (his boldest idea). Unifying faucets and sinks under one visible currency is genuinely good economy design, and it is the wrong shape here: a new save schema, a new shop screen, a new balancing surface to regress every week, for one AI engineer shipping to GitHub Pages with a non-developer approving the diff. It also teaches a 4-year-old the sentence 'you can't afford that'. The flee-timer sink gets the same ledger repair for ~15 lines.~~
- ~~REJECT — Charging for Poke Center heals (Walt Fischer: 'one free heal per gym, further heals cost'; Dev Okonkwo's endurance-pressure variant). Attrition is the correct answer for a difficulty economy and the wrong answer for these two players: ART is exempt anyway, and GABE will simply tap BACK to the gym list and heal there, so it converts a design pressure into a chore. Endorse Diego Alvarez's version instead — make endurance LEGIBLE (carried HP on the trainer list, the button reading 'POKE CENTER — 3 POKEMON HURT') rather than expensive.~~
- ~~REJECT (as scoped) — Aria Voss and Mila Fernandez's 'wild flees after 3-4 failed throws' applied to ALL wild encounters. On a catch_rate-45 mon at full HP a Poke Ball is 5.9%, so this is a frustration engine aimed squarely at the 4-year-old. Accepted only in the narrow form I endorsed: legendaries and shinies, 4 turns, non-junior only — where the tension is the point and the Master Ball is the answer.~~
- ~~REJECT — Aria Voss's Bond Levels (+10% damage per tier, visible aura, Bond-gated evolution) and Dev Okonkwo's Buddy System (100% XP echo to a crowned mon). Both correctly identify that looted mons outclass raised ones. Both answer it with a new per-mon stat, new UI, and a new balancing axis. Pick-one spoils plus bench XP produce the same outcome — raised beats looted — using systems that already exist and code that already runs. Don't add a stat to fix a stat you can just stop giving away.~~
- ~~DEFER, NOT NOW — Amara Osei's SEASONS: a procedurally regenerated weekly 13th gym seeded off `todayNumber()/7`. The diagnosis (58 hand-authored trainers rotting behind a CSS selector) is correct and important, but generative content is a pipeline nobody on this team can QA weekly, and it is being proposed before the game even remembers that the boy became Champion. Persist the champion flag, unlock rematches, ship Round 2 — three low-risk pushes that recover most of the retention. Revisit SEASONS in month two.~~
- ~~REJECT (for Junior) — Oscar Pena and Mila Fernandez's hard SEEN-gate on dex-screen catching. They are right that free unlimited Ultra Balls on the dex page make every other collection system cosmetic. But browsing to Pikachu and catching Pikachu is exactly what a 4-year-old pre-reader does with this app, and silhouetting the dex removes his best screen. Take Jordan Avery's split instead: for non-junior players the dex CATCH button starts a wild battle (`startWildEncounter` already exists at js/battle.js:166); Junior keeps instant tap-to-catch. Same valve, and ART never notices it closed.~~

---

### 🏛️ Performance vs Richness — mobile memory, network cost, assets, and the juice budget

**Tensions resolved**

**Bake the game data at build time vs. stay a runtime PokeAPI client**

- *One side:* Abel Girma, Lucia Moretti and Henrik Larsen all land on the same bold: a GitHub Action runs the slim projections already defined in api.js:39-93 over all 649 mons and commits static JSON. A cold CHAMPION REX fight currently costs ~66 PokeAPI requests across up to 10 mid-battle stalls; baked, it costs zero.
- *Other side:* The product constraint is explicit: vanilla JS, zero build steps, one AI engineer, a non-developer dad approving weekly pushes. CI is a build step. It is also a second source of truth that goes stale silently, and when the Action breaks on a Tuesday nobody in this household can debug it.
- **→ Ruling:** Bake exactly ONE file, generated once by hand, committed, no CI: data/moves.json — ~650 Gen 1-5 moves in the slimMove shape {name,power,type,damage_class}, ~25KB, added to SHELL_FILES. Moves are the worst offender by far: buildFighter shuffles the mon's full learnset and slices 4 at random (js/battle.js:56-58), so the move cache never converges, and move: entries are the FIRST thing evicted on quota overflow (js/api.js:17) — the game re-downloads them forever. One file removes 4 of every 6 fighter requests and makes battle setup work offline. Pokemon and species stay runtime: they are already slim-cached, and 1-2MB of committed JSON is diff churn nobody will ever review.

**The 649-tile ALL view: rebuild it once at boot, or stop rendering 649 tiles**

- *One side:* Rosa Jimenez's bold — retained-mode PC Box: build all ~4,000 nodes once at boot into a detached fragment and make every render a pure state-mutation pass. Chloe Dubois' variant: render once, filter by toggling a hidden class.
- *Other side:* The minimal-perf reading: 649 tiles, 649 <img loading=lazy>, and 649 addEventListener calls per render (js/pc.js:134-135), rebuilt on EVERY keystroke with no debounce (js/pc.js:138-140), is indefensible on a tablet — just stop showing uncaught entries in ALL.
- **→ Ruling:** Keep all 649 silhouettes. That wall IS the collecting fantasy for a 7-year-old, and Freya Lindqvist's finding proves the real defect is different: uncaught labels render at rgba(107,255,107,0.25) (2.04:1) at 5px (gba.css:279/587-588) — the wall is unreadable, not too large. Ship the cheap fix, reject the boot-time rebuild: one delegated listener on #pc-grid (deletes 649 addEventListener calls, ~10 lines), 150ms debounce on onPCSearchInput, Sets instead of Array.includes in the loop, width="60" height="60" on the img, and content-visibility:auto + contain-intrinsic-size on .pc-item so offscreen tiles skip layout and paint entirely. Revisit retained-mode only if that measurably fails on the actual iPad — it moves 4,000 nodes into boot cost for a screen not every session opens, and adds a DOM/state sync layer that will drift on a weekly cadence with no test harness.

**Official artwork in the dex gallery: encyclopedia richness vs. bytes and visual language**

- *One side:* Owen Gallagher wants the entry screen to carry MORE awe — rarity ribbons, branching evo fans, six flavor texts. The 475px official artwork is the single most beautiful image in the app and it is already fetched and cached.
- *Other side:* Chloe Dubois: it is a ~300KB PNG cycled every 4s and nearest-neighbor DOWNscaled to ~200px by the global img { image-rendering: pixelated } at gba.css:21 — the worst possible treatment. Pixel Pete Ramirez: smooth vector art crossfading into pixel sprites destroys the only visual language the app has. Rosa Jimenez: galleryTimer is cleared only in js/dex.js:66 and :160, so it keeps swapping #poke-sprite underneath battles, gyms and the PC modal forever.
- **→ Ruling:** Delete sp.official and sp.official_shiny from the imgs array in setupGallerySafe (js/dex.js:165-167). One deletion wins all three arguments simultaneously: ~300KB per species off the network bill, the pixelated-downscale artifact gone, the pixel-art language intact — and with a single frame remaining, imgs.length > 1 is false so the 4s interval never starts, which fixes the cross-screen leak for free. Replace the lost richness with bytes already paid for: api.js:68 stores six English flavor_texts and dex.js:120 renders only [0]; api.js:70 stores is_legendary/is_mythical with ZERO consumers anywhere in js/. Tappable 1/6 lore cycling and a LEGENDARY ribbon cost nothing over the wire and give the boys strictly more to look at.

**Service worker: cache more aggressively vs. cache correctly at all**

- *One side:* Henrik Larsen wants Road Trip Mode — a parent-triggered prefetch walking every id, sprites and cries, so the car ride works. Abel Girma wants LESS: the SW is hoarding full ~100KB PokeAPI JSON responses (sw.js:45 lists pokeapi.co) that api.js already slims to ~3KB in localStorage.
- *Other side:* Niko Virtanen and Chloe Dubois independently find the argument is moot: sw.js:63 gates caching on resp.ok, and every sprite is a plain <img> with no crossorigin attribute, so raw.githubusercontent responses are OPAQUE — status 0, ok === false. The 'static content, cache forever' promise in the sw.js:7-8 header describes a code path that has never once executed. Zero sprites have ever been cached.
- **→ Ruling:** Correctness before volume, strictly in this order. (1) `if (resp.ok || resp.type === 'opaque')` at sw.js:63 — one line, and every other asset argument in this council is downstream of it. (2) Decouple ASSET_CACHE from CACHE_VERSION (sw.js:14) and purge only shell keys in activate (sw.js:35), or the very next weekly push deletes everything fix (1) just started saving. (3) Guard the shell put on resp.ok (sw.js:53 currently caches 404s and captive-portal HTML over good JS) and race fetch against a 2.5s timeout (sw.js:50) — one flickering bar of LTE in a car, not airplane mode, is the real failure. (4) Drop pokeapi.co from isStaticAsset. Only THEN warm a scoped set: both players' caught lists, the open gym's roster, the next habitat pool. Never a 1-649 walk.

**The juice budget: which polish earns its bytes**

- *One side:* Jun Park (lunge + hit-stop + faint animation, flick-to-throw), Luna Martinez (5-tier reward vocabulary, Hall of Fame), Beep Kowalski (64-step B sections, per-Pokemon leitmotifs), Dina Hassan (route the whole battle log through TTS) — the emotional payoff layer is genuinely thin and the boys' fun is the north star.
- *Other side:* This panel's mandate: every one of those is a mobile-performance or network claim wearing a design costume, and the device is a family tablet on home Wi-Fi with a 5MB localStorage bucket that is already contested by the API cache and the save.
- **→ Ruling:** Rule by cost of DELIVERY, not cost of taste. Anything expressible as a CSS keyframe, a transform-origin, an oscillator, or an array literal costs zero new bytes over the wire and rides in a shell that is already cached — ship all of it: the lunge/hit-stop/faint grammar, the missing `transition: transform 0.45s` on .battle-sprite-wild (css/main.css:113 has none, so the capture suck-in is an instant snap), transform-origin: 50% 88% on the ball wobble, the typeMult===0 whiff guard (js/battle.js:247 clamps to Math.max(1,...) so an immune hit still pops '-1' with particles), sfx.faint and sfx.levelUp, bass transposed up an octave and 64-step answer phrases in TRACKS. Anything needing a NEW fetched asset — a sprite sheet, a second webfont, a TTS dependency, or 649 of anything — does not earn its bytes on a weekly cadence. And spend the one perf fix that funds the whole budget: there is no visibilitychange handler anywhere in the codebase (grep returns zero), so the music setInterval and both AudioContexts run forever behind a locked screen.

**Endorsed**

- CRITICAL / effort S — sw.js:63: change `if (resp.ok)` to `if (resp.ok || resp.type === 'opaque')`. Sprites load via plain <img> with no crossorigin (dex.js:150, pc.js:109, battle.js:275/312), so every raw.githubusercontent response is opaque and fails the guard. Not one sprite has ever entered ASSET_CACHE. This single line is the highest-leverage change in the entire 50-expert council: the app's whole 'cache forever' asset strategy is currently a no-op comment.
- HIGH / effort S — sw.js hygiene bundle, four small edits: (a) rename ASSET_CACHE to a version-independent 'pokedexos-assets-v1' and change the activate filter (sw.js:35) to delete only shell keys, so a weekly version bump stops nuking every accumulated sprite; (b) guard the shell put on `resp.ok && resp.status === 200` (sw.js:53) — today a mid-deploy 404 or a hotel captive portal permanently overwrites good main.js; (c) race the shell fetch against a 2.5s timer before falling back to cache (sw.js:50) — lie-fi currently means a 20-60s blank boot across index.html plus 18 modules; (d) remove 'pokeapi.co' from isStaticAsset (sw.js:45), since api.js already persists a 3KB slim projection of the same ~100KB payload — the SW is storing a second, fatter copy on the device with the tightest quota.
- HIGH / effort M — Ship data/moves.json: ~650 Gen 1-5 moves in the existing slimMove shape {name, power, type, damage_class}, ~25KB, one shell-cached file, generated once by hand and committed (no CI). getMove becomes a synchronous lookup. This removes 4 of the 6 network requests per fighter, drops a cold CHAMPION REX battle from ~66 requests to ~20, and structurally defeats the random-4-of-N sampling problem (battle.js:56-58) that keeps the move cache from ever converging. It also unblocks Ivan Petrov's damage_class fix at zero extra cost, since damage_class is already in the slim projection.
- HIGH / effort S — Prefetch the three things the boys visibly wait on. (a) In launchBattle, roll the NEXT wild id and fire-and-forget buildFighter for it, so the loading modal disappears from the second encounter onward — today finalizeBattleSetup rolls Math.random()*649 at the moment of the tap (battle.js:161), guaranteeing a cold 6-request stall. (b) At startTrainerBattle, Promise.all the whole known enemy roster (def.team) in the background so KO-to-next-mon transitions are cache hits — gym.js:110 already proves the warming pattern with getNameIndex(). (c) In buildFighter, Promise.all the species fetch WITH the move fetches instead of awaiting species first (battle.js:51-59) — a two-line change that removes an RTT from every fighter in the game.
- HIGH / effort S — Delete sp.official / sp.official_shiny from the gallery array in setupGallerySafe (js/dex.js:165-167). Cuts a ~300KB PNG per species from the network bill, removes the nearest-neighbor downscale artifact caused by the global img{image-rendering:pixelated} (gba.css:21), restores a single pixel-art visual language, and — because imgs.length drops to 1 — the 4s setInterval never starts, which fixes Rosa's leak where galleryTimer keeps swapping #poke-sprite underneath battles, gyms and the PC modal.
- HIGH / effort S-M — PC ALL view, four edits to js/pc.js and one CSS rule: one delegated click listener on #pc-grid using e.target.closest('[data-pc-id]') (deletes 649 addEventListener calls per render); a 150ms debounce on onPCSearchInput (pc.js:138 currently rebuilds up to 649 tiles per keystroke); convert player().caught and teamPick to Sets before the loop (currently Array.includes inside a 649-iteration loop); width="60" height="60" on the itemHtml img; and content-visibility:auto + contain-intrinsic-size:80px on .pc-item so offscreen tiles skip layout and paint. Keeps all 649 silhouettes — the collecting fantasy is the point.
- HIGH / effort S — One delegated image error handler in main.js: `document.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.src = e.target.dataset.fallback || POKEBALL_DATA_URI; }, true)`. Not one <img> in the app has onerror, and raw.githubusercontent.com is not a CDN — it rate-limits and 429s. Today a throttled sprite renders as a broken-image glyph as the battle opponent. Pair it with pinning SPRITE_BASE (config.js:17) from the mutable 'master' branch to a commit SHA, which is both immutable and safely cacheable forever.
- HIGH / effort S-M — Audio lifecycle: add one document visibilitychange listener that calls stopMusic() + ctx.suspend() on hidden and resumes on visible, and resume whenever ctx.state !== 'running' (covering iOS's 'interrupted' state, which neither audio.js:24 nor music.js:60 handles — they only check 'suspended'). Today the ~144-197ms note interval started at main.js:27 and both AudioContexts run for the entire life of the app behind a locked screen. While in there, merge the two contexts behind sfxGain/musicGain buses: SFX fire at 0.2-0.3 (audio.js:45-50) against music at 0.028-0.052 (music.js:24-47), a ~20dB gap that makes the score subliminal.
- MEDIUM / effort S — Cold-start hygiene, three one-liners: self-host the single press-start-2p.woff2 (~30KB) with a local @font-face and add it to SHELL_FILES (index.html:11-13 currently render-blocks on fonts.googleapis.com across two extra origins, and the font is absent from the shell cache, so a fresh install that goes offline has no typeface); ship local icons (apple-touch-icon 180x180 plus 192/512 in the manifest) instead of the remote 30x30 poke-ball.png at index.html:7, which iOS upscales 6x into a mushy blob; and add preconnect for raw.githubusercontent.com and pokeapi.co, the two hosts every sprite and API call depends on and neither of which is preconnected today.
- MEDIUM / effort S-M — The polish that earns its bytes, shipped as one batch because collectively it costs ZERO new bytes over the wire: guard the impact block on typeMult === 0 (battle.js:247 clamps damage to Math.max(1,...) so a Ghost-immune Normal move still pops '-1' with particles and a flash while the log says 'no effect'); add `transition: transform 0.45s cubic-bezier(0.5,0,0.5,1), opacity 0.4s` to .battle-sprite-wild (css/main.css:113 has none, so the capture suck-in is an instant snap while the dex-screen version animates); transform-origin: 50% 88% on .ball-shake; compose .hit-anim with the float loop instead of replacing it (css/main.css:121 overwrites the animation shorthand, causing a visible double-pop); a faint keyframe and a lunge/hit-stop pair; sfx.faint (600Hz→80Hz exponential ramp) and sfx.levelUp at the three faint sites and the ups>0 branch; and in music.js TRACKS, transpose every bass note up one octave (E2=82Hz is inaudible on an iPad speaker) and extend each track to 64 steps with an answer phrase. All of it is CSS keyframes, oscillator calls, and array literals inside an already-cached shell.

**Rejected**

- ~~Chloe Dubois' 'cartridge pack' — a Node script that downloads all 649 sprites at a pinned SHA and composites them into one ~1.5MB WebP sprite-sheet with generated CSS. REJECTED for this product: it requires a Node toolchain and a regeneration ritual the non-developer approver cannot run or verify, it forfeits the animated Gen-V GIFs that are the app's actual visual charm, and it pushes 1.5MB up front onto a tablet that may never open the PC box in a given session. The delegated listener plus content-visibility gets roughly 90% of the rendering win for about ten lines and zero new infrastructure.~~
- ~~The full 649-Pokemon build-time bake via GitHub Action (the shared bold of Abel Girma, Lucia Moretti and Henrik Larsen). REJECTED as stated: a CI pipeline is precisely the build step this project has ruled out, and it creates a silent second source of truth that goes stale without anyone noticing. The narrow version — one hand-generated, committed data/moves.json — captures the large majority of the request-count win with a file the dad can see in the repo. Pokemon and species JSON stay runtime.~~
- ~~Rosa Jimenez's retained-mode PC Box (build ~4,000 nodes once at boot, keep them alive forever, mutate classes thereafter). REJECTED for now: it relocates real cost into every cold boot for a screen not every session opens, and it introduces a DOM-versus-state synchronisation layer that will drift on a weekly-push cadence with no automated visual testing. Correct instinct, wrong moment — revisit only if content-visibility:auto is measured to fail on the boys' actual device.~~
- ~~Henrik Larsen's Road Trip Mode as a full 1-649 prefetch walk of sprites, cries and JSON. REJECTED at that scale: at the proposed ~2/s throttle it is roughly five and a half minutes of walking, and it deliberately pushes tens of megabytes into exactly the quota that is already evicting entries (api.js:17 drops move: keys under pressure). Accept the scoped version instead — warm only both players' caught lists, the currently open gym's roster, and the next habitat pool.~~
- ~~Beep Kowalski's procedural per-Pokemon leitmotifs (hash the dex number into a 4-note motif as an encounter sting). REJECTED as premature: it is a genuinely lovely idea layered on top of a mix the boys cannot currently hear at all — the bass sits at 62-82Hz where an iPad speaker rolls off, and the music is roughly 20dB under the SFX. Fix the mix and the B sections first, both of which are pure data edits; a leitmotif on a broken mix is 649 signatures nobody can distinguish.~~
- ~~Dina Hassan's audio-first Junior Mode routing every logMsg through TTS. REJECTED as a default: speechSynthesis is a queue with documented iOS suppression and garbage-collection failures — it is already the cause of the name-backlog bug (audio.js:72-82 never calls cancel()) — and gating battle pacing on speech synthesis slows every turn for the 4-year-old whose attention span is the binding constraint on the entire product. Fix the cancel() bug, raise pitch off 0.5, and speak at most the single outcome line, opt-in.~~
- ~~Pixel Pete Ramirez's blanket replacement of UI emoji with fetched PokeAPI item sprites or hand-drawn pixel icons. REJECTED as a sweep: emoji cost zero bytes, render on every platform, need no cache, and are exactly how a pre-reader navigates the toolbar and the habitat grid. Swapping them for remote item sprites converts free glyphs into network requests with their own 404 and rate-limit failure modes — the opposite of this panel's mandate. Keep the emoji; fix only the ones rendered too small to read.~~
- ~~Freya Lindqvist's two-font system (add a self-hosted mixed-case pixel dialog face alongside Press Start 2P). REJECTED on cost: a second webfont is another ~40KB in the shell plus an entire parallel type scale to retune across every screen, on a weekly cadence with no visual regression testing. The cheap 80% of the same readability win is free — drop text-transform:uppercase from .battle-log (gba.css:221), stop uppercasing whole sentences in battle.js, enforce an 8px floor in the two places a child actually reads (type badges and PC names — deleting text where 8px does not fit), and fix the type-badge contrast, which is white on #eed535 at 1.48:1 today.~~

---

### 🏛️ Robustness vs Velocity — RULING: This codebase does not have a design problem, it has a teardown problem. Three independent experts (Webb, Tanaka, Chen, Carter) converged on the same nine lines of exitBattleMode, and the code confirms them. The mandate for the next cycle is therefore narrow and non-negotiable: fence the state machine, extract the pure math, and put a save under glass. Everything shaped like an architecture — the battle kernel, the action journal, the merge-sync protocol, the CI matrix — is correct and premature, because it rewrites untested code before the tests exist and buys a non-developer approver nothing he can see. The ordering that matters: guards this week, extraction + node --test next week, balance changes only after the tests can pin them. One deliberate exception to the freeze: additive presentation work (celebration, onboarding, legibility) has near-zero regression surface and the highest north-star payoff in the entire council, so v19 is an invisible update in the engine and a loud one on the screen. Top regression risks to fence first, in order: (1) versusActive leaking past ESCAPE, which silently switches off the 4-year-old's invincibility for the rest of the session; (2) orphaned async turns writing into the next battle; (3) a thrown error freezing the battle with every button dead and nothing watching; (4) importCode wiping both boys wholesale with no undo.

**Tensions resolved**

**Rewrite battle.js as a kernel, or surgically extract the math?**

- *One side:* Schultz, Tanaka, Rezai and Carter all land on the same destination: battle.js is 979 lines (30% of the game) running three rulesets through one mutable singleton; versus literally aliases Player 2 onto the wild slot and fakes origin='gym' to route the exit. Their fix is a side-symmetric createBattle({sides, rules, hooks}) kernel plus a phase state machine replacing the four booleans — deleting ~150 lines and closing the whole class of bug at once.
- *Other side:* That is a multi-week, zero-visible-change rewrite of the file that shipped three features in two weeks, performed before any test exists, by one engineer, approved by a non-developer, and pushed weekly to the device the boys actually play on. A rewrite of untested code is not a safety measure — it is the largest single regression event available.
- **→ Ruling:** MANDATORY NOW: extract only the DOM-free math into engine.js (computeStats, computeDamage, catchProbability, xp/level, pickMove) — mechanical, behavior-preserving, immediately unit-testable with zero deps. MANDATORY NOW: a monotonic battleEpoch guard, which buys most of the kernel's safety for ~30 lines. PREMATURE: the side-symmetric kernel, versus unification, and the phase machine. They are the right destination and the wrong week. Revisit only when a feature genuinely demands a second human-controlled side — and only with the tests already green.

**Feature freeze (Rezai, Avery) vs. the celebration and onboarding backlog (Martinez, Fontaine, Alvarez)**

- *One side:* Rezai wants v19 declared an 'invisible update': four weeks, findings 1-4 only, zero player-facing systems, explicitly deferring online anything, trading, new generations and new battle mechanics. Avery wants a feature freeze that merges the three rival economies.
- *Other side:* Martinez documents that a level-up — the most frequent milestone in the game — has literally zero celebration, and the champion ending is one line of body text. Fontaine documents that the entire instruction layer is 26 hover tooltips on a touch device with no hover, and that Junior Mode ships off by default and undiscoverable. A freeze that also freezes these spends a month making the game safer and none of it making it better — which inverts the north star.
- **→ Ruling:** Split the freeze by regression surface, not by whether something is 'a feature'. FROZEN: anything that touches battleState, the save schema, or the economies — no currency, no new modes, no new generations, no balance rewrites. NOT FROZEN: additive presentation that only reads existing state — level-up fanfare, first-shiny moment, champion sequence, visible badge goals, a first-boot WHO'S PLAYING picker, replacing native prompt()/alert() with in-world panels. These are near-zero regression risk and the highest fun-per-hour in the entire council. v19 = invisible in the engine, loud on the screen.

**Save integrity: journal/ring-buffer/merge-sync, or four cheap guards?**

- *One side:* Webb proposes an append-only action journal with the save as a replayed projection. Ndiaye proposes three rotating slots with rev + timestamp + checksum, then IndexedDB. Alvarez (Andre) proposes merge-only sync with mergePlayer union semantics and QR transfer. All three are motivated by the same true fact: 200 catches is weeks of a 7-year-old's life and it lives in one localStorage key.
- *Other side:* Every one of those proposals rewrites or replaces the exact artifact you are trying to protect, in a module with no tests. Journal replay bugs are silent and unrecoverable. Merge semantics are the hardest thing in the proposal set to get right and the hardest to test, and a wrong merge is indistinguishable from a wrong replace. Meanwhile the confirmed loss paths — importCode replacing both players with no backup, loadSave overwriting an unparseable blob on the next persist, persist() swallowing quota failures — are each closed by about five lines.
- **→ Ruling:** Ship the five-line guards, reject the architectures. Backup-before-import + RESTORE button; quarantine corrupt or unknown-version blobs before starting fresh; on persist() failure evict the API cache, retry, then show a blocking 'SHOW A GROWN-UP' banner; validate hydratePlayer at element level, not container level; and record catches at decision time rather than after 4s of animation (recordCatch is already idempotent). Do ship the cheap half of Alvarez's sync now — embed a timestamp and per-player catch counts in the export payload — so merge stays possible later without building it today.

**Which tests are mandatory: unit math, chaos gremlin, Monte-Carlo simulator, or scenario split?**

- *One side:* Santos wants the 563-line order-dependent smoke.mjs split into seeded scenario files with GitHub Actions, plus a Monte-Carlo balance simulator running 10,000 battles per configuration. Rezai concurs on the split — the suite will go flaky, then get deleted.
- *Other side:* Chen wants a resident chaos gremlin: a Playwright script that plays as a feral 4-year-old, random-tapping every visible element at 100-300ms intervals and double-tapping mid-animation. Neither camp's headline investment catches the balance defects that Petrov, Fischer and Sharma just found by hand, and neither runs in under a minute on a laptop.
- **→ Ruling:** MANDATORY: node --test table-driven unit tests over the newly extracted engine.js — zero dependencies, zero build step, sub-second, and they are the precondition for every balance change the pacing panel wants (you cannot safely change a formula you cannot pin). MANDATORY: the ?fast=1 sleep flag and an injectable RNG seam, which together make the existing smoke suite survivable at weekly cadence and kill the leaky global Math.random patching. ENDORSED SMALL: a 60-second gremlin scoped to the battle screen, run manually before push — it models the literal user and it is 40 lines on infra that already exists. PREMATURE: the scenario split, the CI matrix, and the Monte-Carlo campaign harness.

**Fence the state leaks first, or fix the flat difficulty curve first?**

- *One side:* Petrov, Rossi, Fischer and Sharma bring a wall of critical design findings — wild levels rubber-band to the lead so difficulty is mathematically flat from Lv5 to Lv100, zero damage variance means battles are decided before a button is pressed, auto-catch-on-KO strictly dominates every ball including the Master Ball, and gym spoils hand out 164 Pokémon that out-level the next gym's opener. The game is, by their arithmetic, already solved.
- *Other side:* Petrov et al. describe a fun ceiling. The concurrency and teardown bugs describe a fun floor: versusActive leaking past ESCAPE turns off the 4-year-old's no-faint shield for the rest of the session, and he cannot read the screen to understand why he suddenly started losing. An orphaned turn from an escaped battle writes damage into the next one. A single thrown error freezes the battle with every button disabled and no handler watching.
- **→ Ruling:** Floor before ceiling. The leaks are invisible to the approving parent, non-reproducible for the engineer, and directly punish the youngest player; the balance flaws are visible to everyone and cost nobody a session. Fence the state machine this cycle. Then rebalance in the next cycle — one variable at a time, each shipped as something the dad can evaluate by watching the boys play (add damage variance, then split party XP, then decouple wild level from the lead), with the unit tests from this cycle pinning the old behavior. This also resolves the apparent conflict: the tests are not a quality tax, they are what unblocks the balance work everyone wants.

**Endorsed**

- [CRITICAL / effort S / ~8 lines] Make exitBattleMode (js/battle.js:79-97) the single teardown authority: reset versusActive, busy, wildShiny, pendingEvolution and passResolver, and add 'pass-modal' and 'ballpick-modal' to the hide list at line 83. VERIFIED: it currently resets only origin/canCatch/trainer/loaded, while the junior shield at battle.js:441 reads `&& !battleState.versusActive` — so one tap of ESCAPE during a versus match silently switches off the 4-year-old's invincibility for the rest of the session. Four experts (Webb, Tanaka, Chen, Carter) found this independently. Highest fun-recovered-per-line in the entire council.
- [CRITICAL / effort M] Add a monotonic battle epoch: `let battleEpoch = 0`, incremented in exitBattleMode and at every battle launch; capture it at the top of executeTurn, doSwitch, executeBallThrow, handleEnemyDown, handleVictory and the versus paths, and bail after every await if stale. Also disable escape-btn while busy. VERIFIED: escape-btn (index.html:131 -> main.js:118) is not a .move-btn, so enableMoves(false) never touches it, and exitBattleMode has no busy guard — an orphaned turn from an escaped battle writes damage and nickname prompts into the NEXT battle.
- [CRITICAL / effort S-M] Wrap executeTurn, doSwitch, executeBallThrow and executeVersusMove in try/finally that clears busy, and make a single awaitInput() the only caller of enableMoves(true). Fix two verified ordering bugs while in there: executeTurn clears busy at battle.js:420 BEFORE `await checkFaints()`, and doSwitch never sets busy at all while renderActive() at line 376 rebuilds fresh ENABLED buttons across ~2.2s of awaits. A frozen battle with every button dead is indistinguishable from a broken game to a 7-year-old.
- [HIGH / effort S] Add the global error net that does not exist today: window 'unhandledrejection' and 'error' listeners in main.js showing one in-world overlay ('OH NO — something went wobbly') with a single giant button calling exitBattleMode(), plus one delegated img error handler swapping any failed sprite to a Pokeball data URI. VERIFIED: zero global handlers and zero onerror attributes in the repo, while all sprites come from raw.githubusercontent.com — a host outside the API timeout that does rate-limit. This converts every unknown future bug from 'frozen screen' to 'recoverable'.
- [MANDATORY REFACTOR / effort M] Extract js/engine.js — DOM-free, sleep-free: computeStats, computeDamage returning {dmg, crit, typeMult}, catchProbability(captureRate, ballMod, {hpFrac, junior}), the xp/level math, and pickMove. Call it from BOTH battle.js and catch.js. VERIFIED divergence: catch.js:77 uses (baseRate*ballMod)/255 with no HP factor and no floor, while battle.js:634-637 applies hpFactor and clamps to [0.03,0.95] — two live catch formulas is a bug in itself. This is the only structural refactor that is mandatory now, and it is the precondition for every balance change the pacing panel wants.
- [MANDATORY TEST / effort S once engine.js lands] node --test unit suite over engine.js — zero new dependencies, zero build step, preserves the no-build constraint, runs in under a second. Table-driven: type-chart round trip against a known matchup table; addXp at exact threshold, multi-level jump, and the Lv100 cap; catchProbability invariants (junior === 1, master === 1, monotonic in ballMod, 0.03 floor honored); junior shield never drops a player below 1 HP; damage monotonic in level and type multiplier. These are the numbers that decide whether a gym run feels fair, and today not one of them is pinned.
- [CRITICAL / effort S-M, all additive, none touch gameplay] Five save fences: (a) importCode (state.js:198-210) snapshots the current save to pokedexos_save_prev before assigning, behind a confirm() naming exactly what is lost, with a RESTORE PREVIOUS SAVE button in Parent Tools — VERIFIED it currently replaces BOTH players wholesale with no gate at all; (b) loadSave copies unparseable or unknown-version raw blobs to pokedexos_save_quarantine before starting fresh (state.js:87-96 today lets the next persist overwrite them permanently); (c) persist()'s catch evicts the API cache, retries once, then shows a persistent 'SAVING ISN'T WORKING — SHOW A GROWN-UP' banner instead of a console.warn; (d) hydratePlayer validates ELEMENTS (ints 1..MAX_POKEMON, deduped, level clamped 1-100), not just container types; (e) call recordCatch at decision time rather than after ~4s of animation — it is already idempotent, so this is free.
- [HIGH / effort S-M] Persist which kid is playing, in a DEVICE-LOCAL key (pokedexos_lastplayer — deliberately outside the synced save so importing a code cannot reassign whose tablet it is), and add a first-boot two-giant-tile WHO'S PLAYING picker with sprites rather than text. VERIFIED: state.currentPlayer is runtime-only and hardcoded to 1 (state.js:69), so every reload, PWA relaunch and iOS tab eviction drops the 4-year-old into his brother's profile with junior mode off. Four experts converged (Stone, Alvarez, Webb, Fontaine).
- [HIGH / effort S each — two one-line fun restorations with no regression surface] (1) In handleEnemyDown, set battleState.pendingEvolution = t.lastXpMon when ups > 0 and delete the null-out at battle.js:571 — VERIFIED evolution can currently NEVER fire from a gym battle, the game's biggest XP source, and both Alvarez and Martinez independently called it the highest-value teaching beat in the game. (2) Gate Sparkle on player().shinies.length > 0 instead of hasShiny(leadId) at battle.js:111 and rewrite the hint to match — the current gate requires the shiny of your current lead's exact species, which is a de facto feature removal (Gallagher/Avery, Alvarez).
- [MEDIUM / effort S-M] Make the existing test suite survivable rather than replacing it: route every engine delay through config.js sleep honoring a ?fast=1 flag (ms/20), collapsing smoke.mjs from minutes to under a minute, and add a tiny rng.js seam (export let rand = Math.random, seedable via ?seed=) so tests stop monkey-patching Math.random globally — VERIFIED smoke.mjs patches it at lines 196 and 490 and restores only on the happy path, so one timeout cascades bogus failures through every later check. Then add ONE new scenario: 'the save survives' (catch, reload, still caught; import garbage, save intact). Optionally a 60-second gremlin random-tapper scoped to the battle screen, run manually pre-push — 40 lines on infra that already exists, and it models the literal user.

**Rejected**

- ~~Webb's append-only action journal with the save as a replayed projection (~150 lines). REJECTED: it rewrites the exact artifact you are trying to protect, inside the module with no test coverage, to solve a problem that five ~5-line guards solve completely. Journal replay bugs are silent, cumulative and unrecoverable — the worst possible failure shape for a 7-year-old's 200-catch box. Correct for a service with a server and an ops team; wrong for a save that lives on one iPad.~~
- ~~The full battle-kernel rewrite — Schultz's createBattle({sides, rules, hooks}), Tanaka's headless-engine/presenter split, Carter's four-flags-to-one-phase-machine, Rezai's mode-config objects. REJECTED FOR NOW, not on the merits: it is the right destination, but it is a multi-week zero-visible-change rewrite of 30% of the codebase, performed before any test exists, by one engineer, approved weekly by a non-developer. The epoch guard plus the math extraction buy roughly 80% of the safety for roughly 10% of the blast radius. Schedule the kernel when a feature actually demands a second human-controlled side.~~
- ~~Alvarez's merge-only sync (mergePlayer union semantics, per-id max levels) plus QR-code camera-to-camera transfer with a vendored encoder. REJECTED: it solves multi-device divergence the family does not demonstrably have yet, and merge semantics are simultaneously the hardest thing in the proposal set to get right and the hardest to test — a wrong merge is indistinguishable to a child from a wrong replace. Ship only the cheap, forward-compatible half now (timestamp + per-player counts in the export payload, an import preview, backup-before-import) so merge remains buildable the day a second device appears.~~
- ~~Stone's PIN hardening: crypto.subtle SHA-256 with a per-install random salt, plus exponential backoff after three wrong tries. REJECTED as wrong for this product: the threat model is a 7-year-old with no devtools, and salted hashing is security theater against him while adding an async failure mode to a settings screen. Do fix the two REAL defects she and Chen found — devtools.js:190 fails OPEN on any storage error (change to fail closed with a readable message), and window.prompt is unreliable in installed iOS PWAs (replace with a small in-app 4-digit keypad, which suits the GBA aesthetic anyway). Note the deeper asymmetry she correctly identified: the reversible action (Parent Tools) has a hold-gate AND a PIN, while the irreversible one (import) has neither — fix that instead of the crypto.~~
- ~~Santos's Monte-Carlo balance instrument (10,000 simulated battles per configuration in CI). REJECTED as premature: Petrov, Fischer and Sharma just produced a complete, credible balance diagnosis by hand-simulating the formulas — measurement is not the bottleneck. The bottleneck is that nobody can change a formula safely, and table-driven unit tests over engine.js fix that this week for a fraction of the cost. Build the simulator when there is a second balance pass to validate, not before the first one has shipped.~~
- ~~Santos's and Rezai's full scenario-file split of smoke.mjs plus a GitHub Actions workflow. REJECTED FOR THIS CYCLE (premature, not wrong): the order-dependence critique is accurate, but a green CI badge is worth nothing to a dad approving on a phone, and a 563-line suite that runs in 40 seconds via ?fast=1 is worth more than six suites that do not exist yet. Take the two enabling pieces now (fast mode, injectable RNG) and split a scenario out only when it actually blocks a fix.~~
- ~~Ndiaye's three-slot rotating ring buffer with rev + timestamp + checksum, and the IndexedDB migration behind it. REJECTED: one backup key plus one quarantine key captures nearly every observed loss path at a tenth of the code and a tenth of the risk. Checksums defend against corruption modes never seen in this app; the mode that HAS been identified is quota exhaustion caused by the app's own unbounded API cache, which is fixed directly by evicting the cache on persist failure. Same reasoning retires the version-stamping release script and the z-index custom-property refactor — real debt, but zero-build is a feature here and tidy-ups eat weekly cycles the boys never see.~~
- ~~Fischer's headline proposal: delete the Master Ball and mint POKE COINS as a universal currency buying balls, heals and gym entry. REJECTED for this cycle on velocity grounds, and flagged as the single largest scope expansion in the council: it introduces a new economy, a new faucet, a new sink and a new UI surface into the exact release that Rezai and Avery correctly want frozen — on top of a battle engine whose teardown path is currently leaking three flags. His underlying diagnoses are sound and should be actioned later in small, separately-shippable pieces (auto-catch-on-KO dominating every ball; gym spoils out-levelling the next gym's opener; badges exhausted at win 23 of 58). Same ruling for Petrov's target-time-to-kill damage rewrite: change the formula one variable at a time, after the unit tests can pin the old behavior, so the dad can judge each change by watching the boys play.~~

---

### 🏛️ PLATFORM TRUTH — "iOS Safari standalone is the real runtime"

Convened: Sarah Oduya (iOS/PWA), Niko Virtanen (service worker), Henrik Larsen (offline), Abel Girma (network), Lucia Moretti (API/error taxonomy), Dr. Hanna Kim (pre-reader), Priya Nair (touch), Annika Berg (motor), Dina Hassan (audio/TTS) from the prior 38; Olga Ivanova (error handling), Ben Carter (concurrency), Meredith Stone (parental controls), Andre Williams (save durability), Claire Fontaine (cold start), Luna Martinez (juice), Owen Gallagher (dex) from the fresh 12. Battle-math experts (Petrov, Rossi, Fischer, Sharma, Alvarez) were heard only where their fix touches the platform layer.

THE RULING IN ONE LINE: in a home-screen standalone app there is no URL bar, no reload button, and no back gesture — so every failure this panel found is not degraded UX, it is a dead end that ends with a 7-year-old handing a frozen iPad to his dad. That, not aesthetics, is why native dialogs go, why the service worker gets fixed before any new feature, and why a watchdog outranks an architecture refactor.

VERIFIED AGAINST CODE (not taken on report authority):
- 21 native dialog sites exist: js/battle.js:101,154,208,490,524,607,817,862; js/explore.js:95; js/gym.js:133; js/catch.js:116; js/settings.js:72,74,96,102,107,127; js/devtools.js:181,182,186,188. Eleven are kid-facing.
- sw.js:63 gates asset caching on `resp.ok`. Every sprite is a plain <img> and every cry is `new Audio(url)` (js/audio.js:54) — both no-cors, both opaque, both `ok === false`. Confirmed: the ASSET_CACHE has never cached a single sprite. "Offline support" today is a claim, not a behaviour.
- sw.js:51-53 puts every same-origin response into SHELL_CACHE with no status check. A mid-deploy 404 or a captive-portal HTML page permanently replaces main.js.
- sw.js:12-14 + :35 namespace ASSET_CACHE by CACHE_VERSION and delete everything not matching. At a weekly push cadence that is a full asset wipe every week, forever. This is the worst interaction between the codebase and the stated cadence.
- js/audio.js:24 and js/music.js:60 both resume only on `state === 'suspended'`, and initAudio() runs once at boot. iOS parks a backgrounded context in `'interrupted'`, which neither branch matches — one phone call and the game is silent until relaunch. Two separate AudioContexts compound it; music.js's is created ~900ms after the tap, outside the gesture.
- js/audio.js:72 speak() never calls cancel(); speechSynthesis is a queue; js/dex.js:138 speaks on every junior-mode load.
- js/devtools.js:190 `catch (e) { return true; }` — the Parent Tools PIN fails OPEN.
- index.html:7 / manifest.webmanifest: the home-screen icon is a remote 30x30 PNG on raw.githubusercontent.com, not in SHELL_FILES.
- MODERATOR'S OWN FINDING, in no report: cries come from `d.cries.latest` (js/api.js:44), which PokeAPI serves as .ogg. iOS Safari's Ogg Vorbis support is absent-to-unreliable, and js/audio.js:61 swallows the rejection into console.warn. The CRY button — a headline feature — is plausibly a silent no-op on the actual runtime and nobody would ever know.

THE STANDARD I APPLIED: the boys' fun wins every tie, and that cuts both ways. It kills native dialogs (a gray "says:" box shatters the Game Boy fiction, and a 4-year-old cannot read it). It also kills three technically-correct proposals — a CI build step, salted PIN hashing, a state-machine refactor — because each spends the one engineer's week on something no boy will ever see, in a repo whose approver cannot debug a broken push.

**Tensions resolved**

**Kill PokeAPI as a runtime dependency (build-time bake) vs. zero build steps**

- *One side:* Larsen, Girma and Moretti converge independently: run the existing slimPokemon/slimSpecies/slimEvo projections (js/api.js:39-93) once over all 649 mons via a GitHub Action, commit ~1.5-2MB of static JSON. Offline becomes total, the cold Champion battle drops from ~66 requests to 0, and the whole error-taxonomy problem evaporates because there is nothing left to fail.
- *Other side:* The product constraint is vanilla JS, zero build steps, one AI engineer, and a non-developer dad approving a weekly push. A GitHub Action is a second system he cannot debug: the day it fails, the push looks fine and the game ships stale or empty data, and he has no way to tell.
- **→ Ruling:** Split the proposal from its delivery mechanism. REJECT the CI pipeline. ACCEPT the artifact — generated once, by the engineer, in-session, committed as a plain file the dad only ever sees as 'a new file in the diff'. Start with the highest-leverage one: data/moves.json, ~650 Gen 1-5 moves at {name,power,type,damage_class}, roughly 25KB, added to SHELL_FILES. That alone deletes 4 network requests per fighter (js/battle.js:56-59), removes the mid-battle stall the boys actually feel, and stops the move-cache thrash that evicts entries at js/api.js:17. Defer the full 649-mon bake until the moves file has survived a month. Rule: static data committed to the repo is not a build step; a process that must run for the repo to be correct is.

**Native dialogs: replace everything, or keep prompt()/confirm() for adult-only paths**

- *One side:* Oduya, Kim, Ivanova, Martinez and Berg all want every alert()/prompt() gone. The kid-facing ones are unreadable by the pre-reader, they guillotine the catch celebration mid-confetti (js/catch.js:116 fires 2100ms in, while the 1.6s confetti is still settling), and iOS standalone has a long history of suppressing them outright.
- *Other side:* Stone wants a native confirm() in front of the destructive import, and js/settings.js:74 uses prompt() as the clipboard fallback for a ~10.7k-character save code. These are adult-facing, one-off, and a custom modal is real work for a screen the boys never see.
- **→ Ruling:** Kid-facing: zero native dialogs, non-negotiable, all eleven sites. Adult-facing: they go too, but for a harder reason than taste — in standalone a suppressed dialog does not throw, it returns null, and the caller cannot distinguish 'the parent cancelled' from 'iOS ate it'. That makes native confirm() the worst possible gate on the one irreversible action in the app (importCode replaces BOTH boys' saves, js/state.js:191-196). Build one reusable dialog({icon, text, input, ok, cancel}) on the existing overlay system — 12 modals already exist in index.html and js/battle.js:32 already has the show() helper — and retire all 21 sites in one pass. Special case: the save code is not a prompt, it is a read-only selectable textarea plus a QR (Williams is right that camera-to-camera removes the clipboard entirely, and a vendored QR encoder works offline on Pages).

**Parent PIN: harden it (hash, lockout, fail closed) vs. the gate is built on a dialog iOS may never show**

- *One side:* Stone: js/devtools.js:190 fails OPEN on any exception, has no lockout, and cannot be changed or recovered without deleting both boys' saves. Hash with crypto.subtle SHA-256 plus a per-install salt, fail CLOSED on any storage error, exponential backoff after 3 wrong tries.
- *Other side:* Oduya: the entire gate is prompt()-based and invoked from a setTimeout inside the 1200ms hold — i.e. not synchronously within the user gesture. In standalone the dialog may never appear at all. Hardening a lock whose input channel does not exist on the target device is fitting a deadbolt to a doorway with no door.
- **→ Ruling:** Oduya's diagnosis is upstream of Stone's fix. Do hers first: replace the prompt with an in-app 4-digit keypad modal — which also gives the parent something usable one-handed. Then take HALF of Stone's fix: delete the fail-open catch (a 7-year-old should never be one thrown exception away from the level editor) and add a CHANGE PIN row. REJECT the salted SHA-256 (see rejections). Fail closed on a wrong PIN, never fail open, and document the recovery — clear localStorage key 'pokedexos_devpin' — in the README so a locked-out dad has a path that is not 'wipe both saves'.

**Offline: parent-triggered full prefetch ('Road Trip Mode') vs. fixing what is already broken**

- *One side:* Virtanen and Larsen: the universe is closed and known — 649 ids, a fixed sprite URL scheme, slim JSON. Walk it all with one tap in Settings and airplane mode and the car become first-class.
- *Other side:* Girma: the SW already hoards ~100KB PokeAPI responses that js/api.js slims to 3KB — 70-80MB of duplicate JSON — right in the zone where iOS quota-evicts the whole origin. Adding hundreds of MB of sprite variants raises the odds of an eviction that can take the boys' collection with it.
- **→ Ruling:** Sequence, don't choose. Nobody prefetches into a cache that provably does not work: today ZERO sprites are cached (sw.js:63 opaque bug) and every weekly push deletes the cache anyway (sw.js:35). Fix those two plus the shell-poisoning guard and the fetch timeout FIRST — four small diffs, and the entire difference between 'offline is broken' and 'offline works for everything you have seen'. THEN scope the warm-up to what is reachable this week: both boys' caught lists, the current gym's rosters, the eight habitat pools — not 649 × 5 variants. Simultaneously drop pokeapi.co from the SW's isStaticAsset list (Girma, sw.js:46) since js/api.js already keeps the slim copy. And take Larsen's cheapest win outright: when offline, filter habitat pools to cached IDs so Explore's 3-second rustle can never end in an error dialog.

**A frozen battle: watchdog and epoch guard, vs. replacing the four booleans with a phase state machine**

- *One side:* Carter: delete isBattling/busy/versusActive/canCatch, replace with one battleState.phase machine plus a monotonic epoch. It is the correct architecture and it structurally eliminates the ESCAPE-mid-turn bug, the versusActive leak that permanently strips Junior invincibility, and the pass-modal leak.
- *Other side:* Ivanova: what actually matters is that ONE unhandled rejection pins busy=true and disables every .move-btn (js/battle.js:325-327 — and RUN and SWITCH both carry that class) with no global handler to notice. A rewrite of the hot path in a 38KB file, shipped weekly, approved by someone who cannot read the diff, is exactly the regression risk this product cannot absorb.
- **→ Ruling:** The standalone runtime settles it. No reload button, no URL bar — a frozen battle means force-quitting from the app switcher, which neither boy can do. Priority is recovery, not elegance. Ship this week: (1) window 'unhandledrejection' and 'error' handlers in main.js showing one in-world overlay ('OH NO! Something went wobbly' + one giant OK) that calls exitBattleMode(); (2) try/finally around executeTurn, executeBallThrow, doSwitch and executeVersusMove so busy can never stay pinned; (3) Carter's epoch counter alone — ~15 lines, incremented in exitBattleMode/startBattleUI, checked after each await — which kills the phantom-nickname bug without touching the flag architecture; (4) move versusActive=false into exitBattleMode and add pass-modal and ballpick-modal to the cleanup list at js/battle.js:83. DEFER the full phase machine to a quiet week with nothing else in the diff.

**Endorsed**

- [critical, S] sw.js:63 — cache opaque responses: `if (resp.ok || resp.type === 'opaque')`. Unanimous (Virtanen, Larsen) and verified in code: every sprite is a no-cors <img> and every cry is `new Audio()`, so the asset cache is empty and always has been. This one line is the difference between 'we have offline support' and the truth.
- [critical, S] sw.js:12-14 and :35 — rename ASSET_CACHE to a version-independent 'pokedexos-assets-v1' and change the activate filter to delete only stale SHELL caches. At a weekly push cadence the current code wipes every accumulated sprite and cry every single release. Virtanen, Larsen and Moretti found this independently; the weekly cadence is what makes it critical rather than medium.
- [high, S] sw.js:51-53 — guard the shell put with `resp.ok && resp.status === 200`, plus a content-type sanity check on index.html. A mid-deploy GitHub Pages 404 or a hotel captive portal currently overwrites good cached main.js permanently, and the next offline launch is a white screen with no reload button.
- [high, S] sw.js:49-56 — race the shell fetch against a ~2500ms timer falling back to caches.match. Airplane mode already works because fetch rejects fast; the real road-trip failure is one bar of LTE stalling index.html plus 17 modules serially. Endorsed as written by both Virtanen and Larsen.
- [critical, M] Retire all 21 native dialog sites behind one reusable dialog({icon, text, input, ok, cancel}) built on the existing overlay system. Kid-facing first: js/battle.js:101,154,208,490,524,817,862, js/explore.js:95, js/gym.js:133, js/catch.js:116. Wild defeat especially (js/battle.js:490) — gym defeat already gets the themed victory-modal, so the harshest emotional moment in the game is the only one delivered as a gray system box.
- [high, S] One audio hygiene pass, the highest fun-per-line item on this list. (a) Merge the two AudioContexts (js/audio.js:22-26, js/music.js:52-62) into one and resume whenever state !== 'running' — not just 'suspended' — on visibilitychange, focus and pageshow, plus opportunistically at the top of playBeep/blip; iOS parks backgrounded contexts in 'interrupted', which neither current branch matches, so one phone call silences the game until relaunch. (b) js/audio.js:72: call speechSynthesis.cancel() before every speak(), hold the utterance in a module-level ref until onend/onerror so it cannot be GC'd mid-sentence, set utter.lang='en-US', and raise the default pitch from 0.5 to ~1.0. Today a 4-year-old swiping fifteen entries queues fifteen names that recite over the wrong screens in a half-pitch robot drone. Oduya and Hassan agree exactly.
- [critical, M] Global 'unhandledrejection' and 'error' handlers in main.js that show one in-world overlay and call exitBattleMode(); try/finally on the four async battle entry points; Carter's ~15-line battleEpoch guard; and versusActive / pass-modal / ballpick-modal moved into exitBattleMode's cleanup (js/battle.js:83-88). In standalone there is no reload button — a pinned busy flag is a force-quit — and the versusActive leak silently strips the 4-year-old's Junior invincibility for the rest of the session.
- [high, M] Offline as a first-class state, not an accident: navigator.onLine plus online/offline listeners driving an airplane chip; Explore filters habitat pools to cached IDs before rolling so the 3-second rustle (js/explore.js:115-139) can never dead-end in an error; a failed dex load auto-navigates to the nearest cached mon instead of the 'ERROR / TIMEOUT — API Server issue' screen (js/dex.js:88-94); and in Junior, speak('We need the internet to find new Pokémon!'). Larsen and Moretti — the Explore filter is the cheapest piece and does the most.
- [medium, S] Storage and install durability, four small changes: call navigator.storage.persist() on boot (called nowhere today); debounce saveCache with a ~250ms trailing timer plus a flush on pagehide (js/api.js:98 currently re-serializes the whole growing cache on every write); make persist()'s silent console.warn at js/state.js:99 surface a visible banner, since on iOS a save that has stopped persisting is indistinguishable from one that works right up until it is gone; and commit a local 180x180 apple-touch-icon plus 192/512 manifest icons into SHELL_FILES, replacing the remote 30x30 PNG at index.html:7 that depends on raw.githubusercontent.com being reachable at install time.
- [verify-first, S] Before anything else audio-related ships, confirm on Gabe's actual iPad whether PokeAPI's .ogg cries (js/api.js:44 → js/audio.js:54) play at all in iOS Safari. js/audio.js:61 swallows the rejection into console.warn, so a headline feature may be a permanent silent no-op that no report caught. If it is silent: either fall back to a procedural cry built on the existing playBeep, or remove the CRY button — shipping a button that does nothing is worse than shipping no button.

**Rejected**

- ~~REJECTED — a GitHub Action that bakes all 649 Pokémon into static JSON (Girma, Moretti and Larsen, all three as their bold swing). The right answer for a commercial product; wrong here. It puts a CI pipeline in front of a non-developer dad's weekly push, and its failure mode is invisible: the push succeeds, the data is stale, and he cannot diagnose it. Take the artifact without the automation — one committed data/moves.json (~25KB) in SHELL_FILES.~~
- ~~REJECTED — per-child PWA installs via p1.html / p2.html with distinct apple-touch-icons (Oduya's bold). Charming, and the underlying problem is real (state.currentPlayer is hardcoded to 1 at js/state.js:69, so the 4-year-old always lands in his brother's profile). But two entry pages on one origin means two shell caches, two SW scopes and one shared localStorage — double the iOS quota pressure and double the failure surface — for a problem Stone and Williams both solve more cheaply with a device-local 'last player' key plus a two-face WHO'S PLAYING picker. Take theirs.~~
- ~~REJECTED — crypto.subtle SHA-256 with a per-install salt for the Parent Tools PIN (Stone). Correct security engineering against the wrong threat model: the adversary is a first-grader who wants free Master Balls. Async hashing adds a new failure path on a device where the parent has no console, and buys nothing against that adversary. Keep the plaintext key; the parts of the finding worth taking are deleting the fail-open catch at js/devtools.js:190 and adding CHANGE PIN.~~
- ~~REJECTED — chasing haptics on iOS, including the iOS 18 checkbox-switch hack. Oduya raised it and dismissed it herself; the panel ratifies. navigator.vibrate does not exist in any iOS Safari, so every choreographed pattern in js/catch.js and js/battle.js:507 is already a no-op. Do not emulate it — compensate in channels iOS has: a CSS shake on .visual-display synced to sfx.shake(), and wider audio dynamics on shake/break/catch.~~
- ~~REJECTED AS SCOPED — 'Road Trip Mode', a one-tap prefetch of all 649 mons with every sprite variant and cry (Virtanen's bold). Hundreds of MB into a bucket iOS evicts under pressure, stacked on the 70-80MB of duplicate PokeAPI JSON the SW already hoards (Girma). Eviction risk here is not abstract — it is the boys' collection. Approved only in scoped form (owned mons + current gym rosters + habitat pools, throttled) and only after the four SW correctness fixes land.~~
- ~~REJECTED THIS QUARTER — replacing isBattling/busy/versusActive/canCatch with a phase state machine (Carter's bold). The right architecture, wrong week: a rewrite of the hot path in a 38KB file, shipped weekly, approved by someone who cannot read the diff — while Carter's own epoch counter delivers most of the safety in fifteen lines. Regression risk in a family game is measured in the boys' lost progress, and the rollback ritual here is 'dad pushes again and hopes'.~~
- ~~REJECTED — moving the API cache to IndexedDB (Moretti and Larsen, both as long-term suggestions). It bolts an async storage layer plus a migration onto a codebase whose entire persistence story is one synchronous localStorage key, and migrations are precisely where family saves die. The real problem is entry size: js/api.js:59 keeps the FULL move list while js/battle.js:56-58 only ever uses 4. Trim slimPokemon.moves to ~12 sampled entries (~4x smaller) and evict oldest LRU instead of the current `cache = {}` nuke at js/api.js:19.~~
- ~~REJECTED AS WRITTEN — auto-playing the cry at the end of every dex scan (Gallagher). Two problems the recommendation does not see. First, per-load autoplay on a device where a 4-year-old swipes fifteen entries in ten seconds is a wall of overlapping remote audio, each one an uncached opaque fetch today. Second and worse: the cries are .ogg, which iOS Safari may not decode at all, so this could ship as an elaborate silence. Accept only a debounced version — ~400ms after navigation settles, gated on unlocked-and-unmuted, cry-then-name in Junior — and only after the format question is answered on the actual device.~~

---

### 🏛️ Safety & Trust — Pokédex OS Advisory Council (moderator ruling on XSS/save-import, PIN storage, third-party egress, dark patterns in the daily loop, and parental visibility). Source: 9 relevant reports from the prior 38 (Blackwood, Shah, Ndiaye, Webb, Morris, Ellington, Brandt, Costa, Kim, Fernandez) plus Stone and Williams from the fresh 12, with every disputed claim checked against the code at /home/claude/pokedex.

**Tensions resolved**

**How hard to harden the save-code trust boundary (XSS / injection)**

- *One side:* Tanya Blackwood: import is untrusted network input — escape every innerHTML sink, integer-validate arrays, and ship HMAC-signed saves with a quarantine parse for foreign codes.
- *Other side:* Dr. Imran Shah + product reality: there is no server, no account, no cookie, no cross-user data. The only person who ever pastes a code is Dad moving the save from the iPad to his phone. Code execution in this page grants exactly the capability the paster already has.
- **→ Ruling:** Split the finding. The escaping and schema validation are CONFIRMED and cheap — do them: hydratePlayer (js/state.js:52-64) copies `name` and every value in `nicks` verbatim with no length clamp (unlike setNick/setPlayerName, which slice to 12), and those land in innerHTML at js/battle.js:274, :873, :877 and js/pc.js:106. Worth fixing not because a hacker is coming but because a garbled code silently corrupts the UI. REJECT the HMAC/quarantine layer: a per-install secret would break the one workflow that actually matters — transferring the family's own save between the family's own devices — to defend against an attacker who does not exist.

**Save import: replace, or merge?**

- *One side:* Andre Williams: make sync merge-only and idempotent — union caught/shinies/badges/gyms, max() the mon levels and stats. Then import order stops mattering and nobody can lose anything.
- *Other side:* Paul Ndiaye, Rafa Costa, Meredith Stone: the urgent defect is that importCode (js/state.js:198-210) replaces BOTH players with zero backup, zero preview, zero undo, and settings.js:96 then says 'SAVE LOADED! Welcome back.' Fix the destruction first.
- **→ Ruling:** Ndiaye/Costa/Stone win on sequencing; Williams wins on eventual direction. Confirmed in code: the string {"v":2,"save":{"players":{}}} base64-encodes to a code that passes every check, hydrates two empty players, persists, and reports success — both boys' boxes gone, cheerfully. Ship this week: snapshot to pokedexos_save_v2_prev before assignment, a preview naming what is lost per player, a RESTORE PREVIOUS SAVE button in Parent Tools, and a refusal when both incoming players are empty and the current save is not. Ship next: a per-player import ('LOAD P1 ONLY'), which solves the real family failure — syncing one kid wipes the other — with a fraction of the machinery. Full union merge is a month-three item, not a week-one one; a merge that silently resurrects a Pokémon the parent deleted is its own support ticket.

**PIN storage: crypto hardening vs. fixing the actual hole**

- *One side:* Blackwood + Stone: the PIN is written and compared in cleartext under a self-documenting key (js/devtools.js:174-190, PIN_KEY='pokedexos_devpin'). Hash it with SHA-256 + a per-install salt, add exponential backoff after 3 wrong tries, rename the key.
- *Other side:* Proportionality: the adversary is a curious 7-year-old on a family iPad. Anyone who can read localStorage.pokedexos_devpin can equally well edit pokedexos_save_v2 by hand — hashing the PIN protects a door in a wall that has no other walls.
- **→ Ruling:** Both are pointing at the wrong bug. The confirmed defect is that requirePin() ends in `catch (e) { return true; }` — it fails OPEN, with a comment claiming that is for kiosks. Fail CLOSED. And the asymmetry Stone names is the real scandal: Parent Tools (add a Pokémon, set a level — fully reversible) costs a 1200ms hold AND a PIN, while PASTE CODE and LOAD FILE (irreversible, wipes both kids) sit one tap from the gear icon, and either brother can flip the other's Junior Mode from the same ungated panel (js/settings.js:139-140). Move the destructive and protective controls behind the existing gate; add a CHANGE PIN row and a documented recovery. DEFER hashing: requirePin() is synchronous inside a pointerdown timer and crypto.subtle is async, so it is a refactor, not 20 lines — and it buys almost nothing next to fail-closed.

**The daily loop: remove the calendar, or lean into it?**

- *One side:* Dr. Lena Morris: the UTC day boundary (js/progression.js:37) rug-pulls quest progress at 5pm PT / 8pm ET — mid play-window — and the Master Ball, the game's scarcest item, becomes renewable ONLY through the daily sweep (progression.js:124-127). That is an appointment mechanic. Decouple the reward from the calendar.
- *Other side:* Felix Brandt + Mila Fernandez: add {lastDay, streak, bestStreak}, a flame on the Trainer Card, escalating 3/7/14/30-day milestone rewards, streak insurance, and a Mystery Egg that cracks once per quest-sweep day.
- **→ Ruling:** Morris wins outright, and Brandt's proposal is REJECTED as the single most dangerous recommendation in the whole council packet for this product. A 4-year-old and a 7-year-old do not control device access — their father does. A visible streak does not motivate the child to play; it motivates the child to lobby the parent, and converts a bedtime into a loss. That is a dark pattern aimed at the family, not at the user. Ship the local-date fix (one line), let unfinished quest boards roll over instead of expiring, and pay the Master Ball on a cumulative counter (every 3 quests completed, ever) rather than on a daily sweep. Keep Brandt's Egg — but crack it on catches and gym wins, never on days.

**Adding playtime tracking to a children's app**

- *One side:* Meredith Stone: there is zero time data anywhere — stats holds catches/battlesWon/battlesLost/versusWins/explores (js/state.js:23) and nothing else. Add stats.play = {totalMs, todayMs, day, lastSeen, sessions[]} and make the first screen behind the PIN a read-only 'Dad's Morning Card'.
- *Other side:* Dr. Imran Shah's ethos: the app's best privacy property is that it collects nothing. Building a per-child usage log is exactly what one criticises in commercial kids' apps.
- **→ Ruling:** Stone wins, with one amendment. Shah's objection is about EGRESS, and there is none here: this is device-local, parent-only, never transmitted, on an app with no accounts and no analytics. A father who currently cannot answer 'how long was he on that?' has no visibility at all — that gap is the finding. Amendment: drop the sessions[] array. Store aggregate minutes today / this week and lastSeen only; a rolling timestamped log of a child's activity is a liability with no parental payoff. Pair it with the PRIVACY.md Shah asks for, stating plainly: no accounts, no analytics, nothing leaves the device, time data is aggregate and local.

**Endorsed**

- [CRITICAL / effort S] Make import survivable. In js/state.js:198-210, snapshot the current save to pokedexos_save_v2_prev BEFORE assigning; refuse an import whose two hydrated players are both empty when the current save is not; replace settings.js:96's unconditional 'SAVE LOADED! Welcome back.' with a preview naming what is being replaced per player; add RESTORE PREVIOUS SAVE inside Parent Tools. Confirmed: {"v":2,"save":{"players":{}}} is today a valid, silent, unrecoverable double wipe.
- [HIGH / effort S] One escapeHtml() helper applied at every import-derived innerHTML boundary — js/battle.js:274, :873, :877 and js/pc.js:106 (nameLine) — plus a real schema pass in hydratePlayer (js/state.js:52-64): caught/team/shinies/badges filtered through Number.isInteger and clamped to 1..MAX_POKEMON (migrateLegacy at :37 already does this — hydratePlayer inexplicably does not), mons coerced to {level: int 1-100, xp: finite >= 0}, name and every nicks value re-run through the same slice(0,12) sanitizer setNick uses. Verify by nicknaming a mon <b>x</b> and confirming literal text.
- [HIGH / effort S] Fail CLOSED in requirePin() (js/devtools.js:190) — the current `catch (e) { return true; }` hands Parent Tools to anyone in a browser where prompt() throws. Add a CHANGE PIN row inside Parent Tools and one documented reset path that does not require deleting both boys' saves.
- [HIGH / effort S] Fix the gating asymmetry: move PASTE CODE and LOAD FILE (index.html:233-235) behind the same hold-to-open + PIN gate that already protects the reversible Parent Tools, and gate the OTHER player's Junior Mode toggle (js/settings.js:139-140) the same way. Junior Mode is the 4-year-old's entire safety net — no-faint shield (battle.js:441), guaranteed catches (battle.js:632) — and his brother can currently switch it off in two taps.
- [HIGH / effort S] Make save failure loud. js/state.js:98-101 swallows every persist() error into a console.warn while sharing a ~5MB localStorage bucket with pokedexos_apicache_v2, whose header still claims '151 Pokémon ≈ 450KB' against a real MAX_POKEMON of 649 (js/config.js:5). On catch: clear the API cache (rebuildable), retry the save (not rebuildable), and if it still fails show a blocking in-game banner and auto-open the export dialog.
- [HIGH / effort S] Kill the calendar rug-pull. todayNumber() at js/progression.js:37 is a UTC day, so quests reset at 5-8pm local — mid play window. Switch to a local YYYYMMDD number, let unfinished boards roll over rather than being wiped at :54-56, and pay the Master Ball on a persistent cumulative counter (3 quests completed ever = 1 ball) instead of the daily all-done sweep at :124-127.
- [HIGH / effort M] Build the parent dashboard as the FIRST screen behind the PIN, read-only: minutes played today and this week per kid (aggregate only — no session log), last played, what each boy caught since you last looked, badges earned, and 'LAST BACKUP: N DAYS AGO' turning red past 7. Today Parent Tools is a cheat menu and the save has no time fields at all (js/state.js:23).
- [MEDIUM / effort S] Fix 'whose game is this'. Persist the active player in a DEVICE-LOCAL key (pokedexos_lastplayer), deliberately NOT inside the synced save, so importing a code cannot reassign who the tablet belongs to — state.currentPlayer is hardcoded to 1 at js/state.js:69 and never restored, so every reload drops the pre-reader into his brother's profile with Junior Mode off. Add a two-tile 'WHO'S PLAYING?' picker using sprites rather than the 'P1' text button, and call clearGymRun() inside togglePlayer (gym.js:18 endurance HP currently bleeds between brothers).
- [MEDIUM / effort S] Cut Google from the request graph: self-host Press Start 2P (index.html:11-13 currently ships every cold load's IP and UA to fonts.googleapis.com/gstatic), commit local PWA icons instead of the raw.githubusercontent.com apple-touch-icon (index.html:8) and manifest icon, add both to SHELL_FILES in sw.js. That leaves pokeapi.co and raw.githubusercontent.com as the only third parties, both load-bearing. Then write the 5-line PRIVACY.md — README.md already invites other families to deploy this and says nothing about data.
- [MEDIUM / effort S] Two fixes that each pay twice. (a) Resolve typed search against the already-cached 649-name index (js/api.js:105) before issuing a request — js/dex.js:73-74 currently interpolates whatever a 7-year-old types straight into a pokeapi.co URL unencoded, so 'OWEN' or a school name lands in a third party's logs; local matching also lets you show 'DID YOU MEAN CHARIZARD?' instead of 'API Server issue'. (b) Make the catch animation honest and add invisible pity: js/catch.js:82 plays a random 1-3 shakes before failure — cap failures at 2 shakes (3 = caught, as in the mainline games) and add a per-species consecutive-miss multiplier, since capture_rate/255 (catch.js:77-79) has no floor and a legendary sits near 1.2% forever.

**Rejected**

- ~~HMAC-signed save codes with a per-install secret and quarantine-sandbox parsing of foreign codes (Blackwood's bold). There is no server, no account, no cookie, and no distribution channel — a save code only ever travels from the family's iPad to the family's phone, carried by the dad. A per-install secret would break exactly that transfer while defending against an adversary who does not exist. Escaping plus schema validation covers the real failure mode (garbled input corrupting the UI) for a tenth of the cost.~~
- ~~SubtleCrypto salted-hash PIN storage + exponential backoff after 3 wrong tries (Blackwood, Stone). requirePin() is synchronous and called inside a pointerdown hold timer (js/devtools.js:174-191); crypto.subtle is async, so this is a control-flow refactor, not a 20-line change. And anyone capable of reading localStorage.pokedexos_devpin can equally edit pokedexos_save_v2 directly — the hash guards one door in a house with no walls. Fail-closed plus gating the destructive buttons buys the protection that matters. Revisit only if that code is being touched anyway.~~
- ~~Daily streaks, streak insurance, and escalating 3/7/14/30-day login rewards (Brandt, Fernandez). This is the one recommendation the panel rejects on ethics rather than cost. These children do not control device access — their father does. A visible streak does not make a 7-year-old play more; it makes him lobby, and turns a normal bedtime or a weekend away into a loss he blames on a parent. In a commercial product that is retention. In a family game it is a dark pattern pointed at the household. Keep Brandt's Mystery Egg, but crack it on catches and gym wins, never on days elapsed.~~
- ~~A session cap, timed lockout, or forced break nudge as an engineered off-ramp (extension of Morris's 'Journey's End'). The celebration-shaped recap is endorsed; the enforcement is not. The dad is in the room — he is the off-switch, and he is a better one than a timer that does not know whether it is a rainy Saturday or a school night. A lockout makes the app the disciplinarian, teaches the boys to negotiate with software instead of a parent, and will be worked around within a week.~~
- ~~Stripping player names out of exportCode() so the boys' first names never appear in a save blob (Shah). The names ARE the trainer identity for a 7-year-old — that is the point of typing them. The export never leaves the family's own devices, and a JSON file in Dad's Downloads folder containing 'GABE' is not a privacy incident. Keep the placeholder hint suggesting trainer aliases as a nudge; do not delete the feature to satisfy a threat model that has no adversary.~~
- ~~Migrating the save to IndexedDB, journaled ring-buffer slots with checksums, or an append-only action journal replayed into a projection (Ndiaye's and Webb's bolds). Architecturally correct, and wrong for this product: 150+ lines of new machinery, zero visible kid value, against a constraint of one AI engineer, zero build steps, weekly pushes, and a non-developer approving the diff. Three rotating daily snapshot keys with a RESTORE picker gets most of the safety in roughly fifteen lines and can be explained to the approver in one sentence.~~
- ~~A cross-tab conflict-resolution engine — monotonic rev numbers with per-player read-merge-write on every persist (Webb, Ndiaye). The boys share one device and pass it back and forth; the two-tab scenario is a desktop edge case. Take the cheap 90%: a storage-event listener on SAVE_KEY that reloads state, and clearGymRun() inside togglePlayer. Skip the rev/merge protocol until a real second device exists.~~
- ~~Gating the dex-screen CATCH button behind a 'seen first' requirement or an earned per-throw resource (Fernandez; echoed by the ball-economy push in the fresh economy reports). This panel objects to manufactured scarcity in the daily loop and will not endorse it here either. For the 4-year-old, tapping CATCH on the screen and getting a Pokémon IS the game — the one frictionless delight that needs no reading, no team, and no battle. Metering it to protect the integrity of a completion percentage trades the north star for a spreadsheet. Fix dex completion with more places to find Pokémon, not fewer chances to catch them.~~

---

### 🏛️ Little-Kid Reality — RULING: No. ART (4) cannot play alone today, and the reason is narrower than the panel's alarm suggests. He is not blocked by difficulty (the Junior shield makes him unkillable) or by touch targets (the move grid is already 16px-padded). He is blocked by three things: he boots into his brother's adult profile by default (state.js:22 junior:false, state.js:69 currentPlayer=1 unpersisted); every decision he must make is delivered as words he cannot read (battle.js:279 move buttons, victory-lines at 9px, 9 native alert()s); and Junior Mode was built as a difficulty shield, not a comprehension layer — verified: all 20 body.junior CSS rules are font-size/padding, all 9 JS branches are damage/catch shields, and not one converts text into an icon or a voice. Fix the profile default, ice-ify the four move buttons, and put a sprite in the victory modal, and he plays alone. Do NOT spend this quarter's budget on the WCAG keyboard program or a gesture-engine rewrite.

**Tensions resolved**

**Reading dependence: is narration the fix, or a trap?**

- *One side:* Kim, Mendes and Hassan independently converge on the same bold idea — route logMsg() through speak() and make Junior Mode a self-voicing OS. The infrastructure exists (audio.js:72) and is used for exactly two things.
- *Other side:* Hassan's own finding undermines the bold: speak() never calls speechSynthesis.cancel(), so it is a queue — a 4-year-old swiping builds a minutes-long backlog. Add that voices load async, iOS needs a gesture unlock, audio.js swallows every failure silently, and mute is a shared global key a sibling can flip.
- **→ Ruling:** Icons first, voice second. A 4-year-old must be able to play the game with the iPad on silent. Ship the one-line cancel() fix BEFORE any narration is wired, then narrate only the four highest-value strings in junior (encounter, super-effective, faint, 'You caught Pikachu!'). Reject 'narrate everything' — logMsg fires 6-10x per battle and would collide with the cries, the music and the SFX. The move buttons becoming type-colored emoji tiles does more for ART than narrating the whole log, because it works when the sound is off.

**Junior difficulty: is the invincibility shield already enough?**

- *One side:* Current design plus Sharma: ART cannot lose (battle.js:441 floors HP at 1), every ball catches (:632), gyms are never level-gated. The only wall left is a tap-count wall — arguably fine for a 4-year-old.
- *Other side:* Rossi verified there is no Junior branch anywhere in pickEnemyMove (battle.js:394 gates on trainer only), so ART faces the same 70% type-optimal AI as the champion run. A super-effective STAB hit is 125-176% of maxHp; halved by the shield it is still 63-88%. He spends every fight pinned at 1 HP watching his own bar flash red.
- **→ Ruling:** Rossi wins on the north star. Being unable to lose is not the same as feeling like you're winning — and a red flashing bar reads as losing to a 4-year-old regardless of what the code guarantees. Gate the AI on mode, not just opponent class, and give Junior a ~1.75x outgoing multiplier so fights end in 2-3 turns. ART should watch the OPPONENT's bar crash. Keep the invincibility; it is not a dark pattern, it is the whole point.

**Touch targets: universal 44px sweep vs. the header's own 'must fit' constraint**

- *One side:* Nair and Berg both demand a 44px floor everywhere — header buttons at ~30px, gen tabs at ~35x41px, team slots at 34px, dev-mini at 24px, all with no Junior enlargement.
- *Other side:* gba.css:452 carries an explicit design comment ('header stays compact in junior mode — it must fit narrow phones'), and a global 44px sweep touches every screen in a zero-build vanilla repo maintained by one AI engineer on a weekly push, approved by a non-developer.
- **→ Ruling:** Tier it by whose finger it is. On ART's actual path — CATCH, ball options, habitat cards, move buttons, PC grid — 44px is mandatory (most already clear it). On the header, do the opposite of enlarging: in Junior, REMOVE the gear and the P1 toggle behind the existing hold-gate. That fixes the 30px target and the one-tap 'all my Pokémon vanished' save-swap trap in a single change, and honors the 'must fit' constraint instead of fighting it. Gen tabs and dev-mini are GABE's and dad's screens — defer them.

**Dead air: cut the ceremony or add more of it?**

- *One side:* Bauer measured ~43s of unskippable dead air in a 3-mon gym fight (900+900+900+400ms per attack, all fixed sleeps, no tap-to-skip anywhere) and wants awaitOrTap plus hold-to-fast-forward; Voss wants a TURBO setting.
- *Other side:* Martinez says the game under-celebrates — level-up has literally zero celebration, first shiny gets a recycled two-note beep, and beating all 55 trainers is one extra line of body text. Her fixes all ADD seconds.
- **→ Ruling:** Repeated gets fast, rare gets big — they are not actually in conflict once you split by frequency. Compress what ART sees fifty times a session (merge crit+super-effective into one line, tap-through the 3.8s capture cinematic, prefetch the next gym enemy so no spinner lands between KOs). Spend the reclaimed time on what he sees once a week (first shiny, evolution, champion). One caveat that decides the implementation: tap-to-skip is invisible to a pre-reader, so awaitOrTap MUST ship with a blinking down-arrow — the classic Game Boy affordance — or ART will never discover it and only GABE benefits.

**Should the Junior toggle be locked behind the Parent Tools PIN?**

- *One side:* Kim: a 4-year-old poking buttons can reach Settings on one tap (settings.js:40) and flip his own safety net off (settings.js:139-140), restoring catch failure and battle defeat with no explanation. Move it behind the existing hold-to-open Parent Tools gate.
- *Other side:* Stone verified the PIN fails OPEN on any storage error (devtools.js:190 returns true from the outer catch), has no lockout, cannot be changed, and cannot be recovered without deleting both boys' saves. Putting the 4-year-old's safety net behind it means one iOS private-browsing quirk locks dad out of restoring it.
- **→ Ruling:** Hold-gate, do not PIN-gate. The 1.2s hold (already built, already styled) stops a 4-year-old's exploratory poking, which is the entire threat model — ART is not adversarial. The PIN adds no protection against him and adds a real lockout risk for dad. Stone's PIN defects are worth fixing on their own merits, but the junior toggle should not be downstream of them.

**Endorsed**

- [critical / M] First-boot 'WHO'S PLAYING?' card: two giant tappable faces (BIG KID / LITTLE KID) that set settings.junior for the active player, plus persist the choice in a device-local key (deliberately NOT inside the synced save, so an import doesn't reassign whose tablet it is). This is the single highest-leverage item on the board — it fixes js/state.js:22 (junior:false default) and js/state.js:69 (currentPlayer boots to 1, unpersisted) together. Today, ART opening the app himself lands in GABE's profile in adult mode. Flagged independently by Fontaine, Stone, Williams and Kim.
- [critical / M] Make the four move buttons readable without reading: in junior, render each as a large type-colored tile with a big type emoji (fire/water/electric/grass) and demote the move name to a small caption. js/battle.js:279 currently emits raw `${m.name}` plus a 6px type WORD badge. Independently: fix the badge everywhere by picking ink per type luminance instead of the hardcoded `color:#fff` at css/main.css:135 — white on ground #f7de3f measures 1.36:1, on electric 1.48:1, on fairy 1.58:1. This is the change that decides whether ART is choosing or mashing.
- [high / S then M] Fix speak() before using it: add `window.speechSynthesis.cancel()` before speak (js/audio.js:79), set lang='en-US', pick a real voice, and raise the default pitch from 0.5 (a groaning robot) to ~1.0. One line for the queue bug, ~10 for the voice. THEN narrate — but only four strings in junior: encounter, super-effective, faint, and the catch headline. Not the whole log.
- [high / M] Replace all 9 player-facing alert()/prompt() sites with the existing modal pattern (explore.js:95, battle.js:101/154/208/490/524/817/862, gym.js:133): sprite + <=4 big words + one giant button. For the three 'no Pokémon yet' gates specifically, do better than a modal — bounce straight to the dex with the CATCH button pulsing. A native OS dialog is the one surface in the app that Junior Mode provably cannot style, cannot enlarge, and cannot speak.
- [high / S] Gate the battle AI on mode, not just opponent class: `if (battleState.trainer && !junior && Math.random() < 0.7)` at js/battle.js:394, plus a ~1.75x outgoing multiplier in junior. Verified there is currently no junior branch in pickEnemyMove at all. Cheapest change with the largest felt effect for ART — his fights become 2-3 turns with his bar green instead of a long grind at 1 HP.
- [high / S] Put the caught Pokémon's sprite front and center in the victory/GOTCHA modal with confetti, and speak the headline in junior. Both PIXEL_SPRITE and spawnConfetti are already imported and unused there. Today the single most emotional moment in the game — 'you caught it!' — is delivered as 9px text lines like '#025 Lv12 was added to your PC Box!' (js/battle.js:618-625). Kim, Martinez and Ellington all land on this independently; it is S-effort with the highest joy-per-line ratio in the report.
- [high / S] Strip adult chrome out of the junior path rather than shrinking it to fit: (a) hide the gear and P1 toggle behind the existing 1.2s hold-gate in junior, giving the remaining header buttons 44px; (b) skip the sparkle modal entirely in junior (js/battle.js:109-119 has no junior branch — ART currently stalls on a disabled '🔒 SPARKLE — CATCH A SHINY!' with a two-line explanation of 1-in-50 odds); (c) auto-fill the team picker when the player owns <=6, since every battle currently routes through openPC('team') at js/battle.js:105, a screen with a visible search input (body.junior hides .search-row input at gba.css:437, but the PC's input is .pc-search at :579 — the junior rule misses it).
- [high / M] Replace the fixed sleeps in the battle flow with one awaitOrTap(ms) primitive that races the timer against a screen tap (min ~250ms), and ship it WITH a blinking down-arrow affordance or the pre-reader will never find it. Merge crit and effectiveness into one line so the worst case drops from 3.1s to ~1.3s per attack (js/battle.js:455-458), make the 3.8s capture cinematic tap-through-able, and prefetch the next gym enemy at send-out so no spinner lands between KOs (js/battle.js:519-528).
- [medium / M] Impose a hard typography floor: nothing in Press Start 2P below 8px — it is a bitmap face designed for multiples of 8, and 14 styles currently sit at 5-7px (.pc-name 5px gba.css:587, .card-badge small 5px :417, .team-strip-label small 5px :600, .type-badge 6px :233). Where 5-6px was used to make text fit, cut the words, not the size. Raise uncaught PC labels from rgba(107,255,107,0.25) (~2.04:1) to 0.55 — keep the dim sprite as the silhouette-guessing fun, but the label shouldn't whisper too. Self-host the ~30KB woff2 and add it to SHELL_FILES so GitHub Pages and offline are deterministic. Also drop text-transform:uppercase from the battle log — all-caps removes word shape, the main cue a 7-year-old reads by.
- [critical safety / S] Fix the two strobes and add reduced-motion: .blink runs ledBlink at 0.3s infinite (3.33 flashes/sec, css/main.css:21-22) during every Pokémon scan, and #evo-sprite.evolving runs an infinite luminance-inverting flash (gba.css:342-344) — both at or above the photosensitive-seizure threshold. Pure CSS keyframe edits. Add one @media (prefers-reduced-motion: reduce) block killing shake/wipe/rustle/scanlines. This is the one item from the WCAG audit that is a safety issue rather than a compliance issue, and it is the cheapest fix in the whole report.

**Rejected**

- ~~REJECT the full WCAG program — converting every templated div to <button>, role='dialog'/aria-modal on 13 modals, focus trapping, focus restore, Escape handling, aria-live regions (Mendes, high/M x2). Technically correct and correctly audited. Wrong for this product: there are exactly two users, both touch-only on a family iPad, and neither uses a keyboard or a screen reader. This work would consume several weekly pushes and add regression surface across every modal to serve zero people in this house. Mendes's real insight — 'a 4-year-old pre-reader has the same needs as a screen-reader user' — is correct but the remedy is speech and icons, not ARIA. Carved out and endorsed above: the strobe fix, prefers-reduced-motion, and sprite alt text (a one-line template interpolation).~~
- ~~REJECT the 'forgiving tap' engine — a document-level pointerup handler that snaps dead-space taps to the nearest interactive element within 28px, weighted by mode (Berg's bold). Genuinely clever for tremor and small hands. Wrong here: it makes every tap in the app nondeterministic, and its highest-weighted target would be CATCH — meaning a stray tap near the sprite throws a ball. When ART reports 'it did the wrong thing,' a non-developer dad has no way to reason about a heuristic proximity layer, and the AI engineer cannot regression-test it without a device farm. Solve the same problem with bigger targets on ART's four screens.~~
- ~~REJECT the finger-following gesture rewrite that replaces threshold swipes with a physical drag layer and makes ball-throwing the star (Nair's bold). It is the most fun idea in the whole council. It is also a ground-up rewrite of the input layer (main.js:74-95) in a zero-build vanilla repo with no test harness, and input bugs are exactly the class that strands a 4-year-old mid-battle with no adult nearby. Revisit after Junior Mode actually works. The small pieces ARE worth taking now: record gestureTarget on touchstart and bail inside .sheet-content (fixes the sheet-scroll hijack), and close the ball drawer on nav (fixes throwing at the wrong Pokémon).~~
- ~~REJECT the two-font system — keeping Press Start 2P as the label face and introducing a self-hosted mixed-case dialog face (Lindqvist's bold). Correct typographic instinct, and it is what the real GBA games did. But every layout in this app is hand-tuned to 8px pixel metrics, so a second face means re-tuning every screen at once — the highest-churn, hardest-to-review change on the board, for a legibility problem the 8px floor plus dropping all-caps already solves. Also: it helps GABE, not ART, who cannot read either face.~~
- ~~REJECT the collectible RULES cards on the Trainer Card — one blacked-out card per invisible mechanic (Alvarez's bold). The list itself is excellent diagnosis: LEAD SETS THE LEVEL, WEAK = EASY CATCH, SPEED GOES FIRST, SAME TYPE HITS HARDER, SWITCHING COSTS A TURN, HURT MONS STAY HURT are all genuinely invisible. But the proposed remedy is a text encyclopedia in a submenu — unusable by the pre-reader by definition, and unvisited by the 7-year-old. RULING on the invisible-mechanics list: for ART, neutralize rather than teach (junior already voids catch odds and endurance; add the AI branch and he never needs the type chart). For GABE, teach exactly three via live button state, never prose: recolor and relabel the BALL button from catchChance in the HP bar's own red/yellow/green (Alvarez's own best idea), show a persistent lead chip on Explore and the battle title bar, and make the Poké Center button turn yellow and read 'POKÉ CENTER — 3 POKÉMON HURT' when gymRun.hp holds anything below max. Three live cues beat seven cards nobody opens.~~
- ~~REJECT the scripted coached first run — dim everything but CATCH, pulsing arrow, staged reveal of EXPLORE then GYMS, persisted progress flag (Fontaine's bold). The diagnosis is airtight (zero onboarding code exists; 26 title= tooltips on a hoverless device). But this is a new sequencing subsystem with its own state, its own failure modes, and a permanent tax on every future feature that touches the toolbar — and it teaches a game ART will replay hundreds of times, so it is load-bearing for about 45 seconds of his life. The endorsed WHO'S PLAYING card captures most of the value at a fraction of the risk. The pre-reader's real onboarding is buttons that explain themselves, not a scripted tour.~~
- ~~REJECT moving the Junior toggle behind the Parent Tools PIN (Kim). Right problem, wrong lock. Stone verified the PIN fails OPEN (devtools.js:190 returns true from the outer catch), has no lockout, cannot be changed, and cannot be recovered without wiping both boys' saves — so PIN-gating ART's safety net means one iOS storage quirk locks dad out of turning it back on. The existing 1.2s hold-gate stops exploratory poking, which is the entire threat model here. ART is curious, not adversarial.~~
- ~~REJECT loosening the swipe system for junior — dropping the horizontal threshold to ~40px and relaxing axis dominance to 0.6 so arced diagonal strokes register (Berg, low/S). This optimizes the wrong direction. A 4-year-old should have FEWER gestures, not more sensitive ones: looser thresholds mean his sloppy diagonals start firing dex navigation he didn't intend, mid-scan. Do the opposite — gate the entire swipe layer off behind !junior (main.js:74-95), matching the button-only interaction model Junior Mode already implies. That also incidentally kills Nair's sheet-scroll hijack on ART's device. Keep the loosened thresholds as an option for GABE if he asks.~~

---

### 🏛️ THE NEXT BIG THING — Pokédex OS Advisory Council (50 experts, 38 prior + 12 fresh). MODERATOR'S RULING: The ONE big swing for the 4-week roadmap is Hanna Kim / Carlos Mendes / Dina Hassan / Luna Martinez's convergent proposal — a self-voicing Junior Mode: one narrate() wrapper over the existing speak() (js/audio.js:72) piped through logMsg (js/battle.js:31), encounter text, victory-lines, badge popups and quest labels. Four experts arrived at it independently from four different disciplines (pre-reader UX, WCAG, sound design, juice), which is the strongest signal in the entire corpus. It wins on the north star arithmetic: ART is 4 and pre-literate, and 100% of this game's narrative channel is text — every 'IT'S SUPER EFFECTIVE!', every badge name, every one of the 26 title= tooltips in index.html. Half the audience currently receives zero information from the game they are playing. No other proposal moves that number. It also reuses shipped infrastructure, degrades safely (mute + no speechSynthesis = today's game), and slices cleanly into four weekly pushes: (1) narrate battle log + encounters, (2) narrate victory/level-up/badge, (3) narrate menu buttons on tap in Junior Mode, (4) voice-pick + rate tuning in Parent Tools. Everything else in this document is either a cheap delight riding alongside it, a confirmed bug worth a one-line fix, or a trap. The runner-up big swing — Grace Liu's persistent movesets, 'my Charizard knows Flamethrower' — is NOT the big swing precisely because Sofia Rossi showed it is small: seed the existing shuffle. It ships as an ordinary endorsed item.

**Tensions resolved**

**Auto-catch on KO: keep it or kill it?**

- *One side:* Walt Fischer, Ivan Petrov, Diego Alvarez and Kenji Watanabe want it removed. Verified in code: handleVictory (js/battle.js:735-748) unconditionally calls playCaptureAnimation + concludeCapture on any faint — 100% catch, no ball spent, no roll. That makes catchChance (js/battle.js:631-638), the four ball tiers, hpFactor and the Master Ball all strictly dominated. Walt is right that the ball economy has a faucet and no sink.
- *Other side:* Battle-to-catch was a deliberate v18.0 decision. A 4-year-old who wins a fight and is then told the Pokémon ran away is a meltdown, and a 7-year-old who throws four balls and fails four times has learned that the game wastes his afternoon. The dominated-strategy critique is an economics argument, not a fun argument; no child has ever noticed that their ball inventory lacks a sink.
- **→ Ruling:** KEEP auto-catch. It is the single most kid-legible rule in the game: you beat it, you get it. Re-role the ball instead of rebalancing it — the ball is the SHORTCUT and the MERCY option: it ends the fight two turns early, and it is the only way to take a Pokémon without knocking it out. Then take the two cheap pieces of the critique that survive: (a) Diego's live BALL button label ('🔴 BALL · TOUGH / FAIR / EASY', recoloured from catchChance) which finally teaches hpFactor for free; (b) Kenji's scoped exception — legendaries are immune to auto-catch and require a real throw, which is exactly where ball scarcity should live.

**Fixing the flat difficulty curve: rebuild the math, or add variance and decouple the level?**

- *One side:* Ivan Petrov's bold wants damage derived from a target time-to-kill (TTK_base = 4 turns, damage = maxHp/4 scaled by type), replacing the stat-based formula outright. Ritu Sharma wants a soft level ceiling — the lead can never exceed nextUnbeatenTrainer.level + 3 — with surplus XP routed to the box. Both are responding to a real, verified defect: js/battle.js:131 rubber-bands wild level to the lead, and js/battle.js:430-438 has no damage roll, so turns-to-KO is constant from Lv5 to Lv100 and repeat fights are carbon copies.
- *Other side:* Sofia Rossi and the scope hawks (Jordan Avery, Nadia Rezai) point out that battle.js is 979 lines, has no test harness, and is touched by every mode — wild, gym, versus, junior. A TTK rewrite touches the one formula that every other system reads. And a level ceiling is an invisible punishment: a 7-year-old who grinds and watches his XP bar refuse to move has been silently told that playing more is worthless.
- **→ Ruling:** Neither bold ships. Take the three surgical pieces that deliver ~80% of both arguments for ~20 lines: (1) multiply damage by 0.85 + Math.random()*0.15 at js/battle.js:439 so no two fights are identical; (2) Sofia's survivability floor — cap any single hit on a player Pokémon at ~45% of its maxHp, which kills the verified one-shot (Lv8 Geodude rock-throw STAB+2x = 125% of a Lv8 Charmander's bar) without nerfing the child's own type-advantage fantasy; (3) decouple wild level from the lead by giving each habitat in js/explore.js a fixed level band that rises with badges. NO level cap — ever. Surplus XP goes to the party (see endorsed #8), never to the void.

**Bake PokeAPI into static data — but the product constraint says 'zero build steps'**

- *One side:* Six experts converge here: Abel Girma, Lucia Moretti, Henrik Larsen, Imran Shah, Chloe Dubois and Niko Virtanen all independently propose committing the slim projections (already defined at js/api.js:39-93) as static JSON via a GitHub Action. It would delete an entire class of failure at once — Olga Ivanova found nine alert() sites that are all network-error terminals, and Andre Williams found the API cache silently eating the localStorage budget the save lives in (js/state.js:99-100 swallows the failure).
- *Other side:* The product constraint is explicit: vanilla JS, zero build steps, weekly pushes to GitHub Pages, a non-developer dad approving. A GitHub Action is a thing that can break on a Saturday morning in a way the approving parent cannot diagnose or roll back.
- **→ Ruling:** The constraint survives, correctly interpreted. 'Zero build steps' means the dad never runs a toolchain — it does not mean the repo can never contain generated data. An Action that commits data/dex-gen1.json is reviewed as a normal diff and the site stays static files. But this is a dad-facing win, not a boys' fun win, so it does NOT get the big-swing slot. Ship the smallest version in week 4 if the narrator lands early: bake Gen 1 only (151 mons, ~400KB), keep the live PokeAPI path as fallback so a stale bake can never brick the game. The urgent half is free and ships now regardless — Andre's fix to clear the API cache and retry when persist() throws, so the save can never be silently evicted by the cache.

**Rewrite battle.js as a headless kernel, or leave it and ship visible fun?**

- *One side:* Ines Schultz (createBattle kernel), Yuki Tanaka (engine/presenter split), Ben Carter (delete the four booleans for one phase state machine + epoch), Victor Hugo Santos (pure simulator + 10,000-battle Monte Carlo), Nadia Rezai (four-week feature freeze, 'the invisible update'). Their diagnosis is confirmed: js/battle.js:404-422, :668-732, :353-388 and :915-937 all do busy = true → await → busy = false with no try/finally, so one throw pins the battle busy with every .move-btn disabled forever.
- *Other side:* Luna Martinez, Tom Bauer, Jun Park and the north star itself: a four-week freeze means four consecutive Saturdays where the boys open the game and nothing is new. For a family game with a one-engineer cadence, that is the most expensive thing on this list, and it is paid entirely by the users the product exists for.
- **→ Ruling:** No rewrite, no freeze. Ship the targeted 30 lines that buy nearly all the safety: try/finally around the four async entry points, one monotonic battleEpoch checked after every await, and the confirmed leak fixes — #escape-btn (index.html:131) is not a .move-btn so enableMoves(false) at js/battle.js:326 never disables it, and exitBattleMode (js/battle.js:79-97) clears origin/canCatch/trainer/loaded but never versusActive or pass-modal, which is how a 4-year-old permanently loses Junior Mode invincibility mid-session. Then pay Victor's idea forward cheaply: extract only computeStats, the damage expression and catchChance into a pure rules.js with no document references — that is one afternoon and it makes every future balance change measurable instead of guessed.

**Who owns the first 45 seconds — a scripted cold open, or a discoverable UI?**

- *One side:* Claire Fontaine's bold: delete the tutorial concept and make the first 45 seconds an unlosable scripted 'YOUR FIRST CATCH' — toolbar dark, a wild Pikachu rustles in, one pulsing button. She is right about the diagnosis: there is zero onboarding code in the repo, the entire instruction layer is 26 title= tooltips on a touch device with no hover, and three of the four big buttons are alert() dead ends for a fresh save (js/explore.js:94-96 fires only AFTER the habitat grid has been rendered and tapped).
- *Other side:* Diego Alvarez would rather make the hidden rules collectible (a blacked-out RULES section on the Trainer Card that unstamps as the child discovers each mechanic), and Owen Gallagher wants the dex entry itself to become the stampable collection. Both argue that a one-time scripted sequence is seen once, by one child, and then is dead code forever — while a collectible teaches across months and rewards the second kid too.
- **→ Ruling:** Claire wins the slot but at a third of the scope, and Diego's version is deferred rather than rejected. Ship the two-tap 'WHO'S PLAYING?' first-boot card (giant faces, sets settings.junior per kid — verified default is false at js/state.js:22, meaning ART's first session is currently the adult game) plus replacing the three alert() dead ends with one in-app 'CATCH ONE FIRST — FIND ME ONE ▶' panel that actually loads a starter. Skip the scripted Pikachu cold open: it is bespoke sequencing code that runs once per child in a codebase with no test harness. Diego's RULES cards are a genuinely good v20 — they are the collectible version of the narrator's job, and they should be revisited once narrate() exists to read them aloud.

**Endorsed**

- THE BIG SWING — Self-voicing Junior Mode. [CRITICAL / effort M, 4 weekly slices] Add one narrate(text) wrapper over the existing speak() (js/audio.js:72) with an interrupt-safe queue, and call it from logMsg (js/battle.js:31), encounter text, victory-lines, badge popups and quest labels, gated on settings.junior and isMuted(). Four experts converged on this independently — Hanna Kim (pre-reader walkthrough), Carlos Mendes (WCAG), Dina Hassan (sound design), Luna Martinez (juice). The insight that settles it: a 4-year-old pre-reader has exactly the same needs as a screen-reader user, and the engine for both already shipped.
- One-line evolution fix: gym wins can never trigger evolution. [HIGH / effort XS] Verified — battleState.pendingEvolution is set only in concludeCapture (js/battle.js:627), while the gym path computes ups and prints 'grew to Lv..' and then explicitly nulls it at js/battle.js:571. Set pendingEvolution = t.lastXpMon (already computed at js/battle.js:513) when ups > 0 and delete the null-out. Diego Alvarez and Luna Martinez found this separately. It restores the single highest-value moment in Pokémon to the game's biggest XP source, for one line.
- Switching is punished with a fully-informed free hit. [CRITICAL / effort XS] Verified — in doSwitch (js/battle.js:374-382) battleState.activeIdx = newIdx executes BEFORE pickEnemyMove(), so the 70% trainer heuristic evaluates type advantage against the Pokémon that just entered. Switching is the one correct answer to a type-countering AI and the game cheats to punish it. Commit the move first: const punish = pickEnemyMove(); then swap. Sofia Rossi.
- Battle exit and concurrency hygiene bundle. [CRITICAL / effort S] Four verified leaks, ~30 lines total: (1) #escape-btn (index.html:131) has no .move-btn class so enableMoves(false) at js/battle.js:326 never disables it — it is tappable during every await, wiping state mid-turn; (2) exitBattleMode (js/battle.js:79-97) never clears versusActive, so a 4-year-old who escapes a versus match loses Junior Mode invincibility for the whole session; (3) 'pass-modal' and 'ballpick-modal' are missing from the cleanup list at js/battle.js:83; (4) no try/finally on the four async entry points. Add one monotonic battleEpoch checked after each await. Ben Carter, confirmed by Olga Ivanova.
- Player identity and save safety. [CRITICAL / effort S] state.currentPlayer is runtime-only and hardcoded to 1 (js/state.js:69), so every relaunch drops whoever opens the app into P1 — meaning ART lands in GABE's profile with junior mode off. Persist it in a DEVICE-LOCAL key (not inside the synced save) and show the two-face 'WHO'S PLAYING?' card on cold boot. In the same push, make import non-destructive: snapshot to pokedexos_save_v2_prev before importCode writes (js/state.js:191-196 replaces BOTH players wholesale) and add RESTORE PREVIOUS SAVE. Meredith Stone, Andre Williams and Claire Fontaine all landed here.
- Damage variance plus a survivability floor. [HIGH / effort S] Verified — js/battle.js:430-438 has no damage roll, no accuracy check and no miss; the only randomness in an entire battle is a 1/16 crit. Multiply by 0.85 + Math.random()*0.15, and cap any single incoming hit on a player Pokémon at ~45% of maxHp so the child always gets to react. Ivan Petrov's variance plus Sofia Rossi's asymmetry — outgoing super-effective stays 2.0x (the fantasy is intact), incoming is survivable.
- Persistent, seeded movesets. [HIGH / effort M] buildFighter shuffles the whole learnset and slices 4 on every construction (js/battle.js:56-58) — every battle and every mid-battle switch-in. Seed the shuffle deterministically per (pokemonId, level), cache it on the mon record, and filter candidates to roughly power <= 40 + level*1.2 so Lv8 fights use Lv8 moves. Grace Liu named the stake exactly: 'my Charizard knows Flamethrower' is the sentence that IS Pokémon for a 7-year-old, and right now GABE cannot say it.
- Make the team of six mean something. [HIGH / effort S] Three verified defects, one fix each: XP goes exclusively to active() at the moment of the KO (js/battle.js:511, :613) so five bench mons sit at DEFAULT_LEVEL 5 forever — give the KO'er full XP and the party 50%. Wild level derives from teamIds[0] only (js/battle.js:130-131) — use the team's max. And js/battle.js:124 falls back to caught.slice(0,6), which is dex-sorted ascending (js/state.js:140), so an Explore-only player's difficulty dial is silently set by whichever species has the lowest dex number. Auto-set team = [id] on first recordCatch. Ivan Petrov and Ritu Sharma.
- Sparkle: rescope the buff, fix the unreachable unlock. [HIGH / effort S] Verified — js/battle.js:437 applies a flat 2.0x to every player attack, stacking multiplicatively with STAB and type for 262% of the enemy bar in one hit, which deletes the mode it unlocks. Make it additive +50% and scope it to the mon whose shiny you actually own. Separately, onTeamConfirmed gates on hasShiny(leadId) (js/battle.js:111) while the arena wild is random — the hint asks the child to pursue a goal he cannot pursue. Gate on shinies.length > 0 and rewrite the hint to 'Catch ANY shiny — about 1 in 50 wild Pokémon'. Ivan Petrov and Diego Alvarez.
- CHEAP DELIGHTS BUNDLE — one week, seven wins, all effort XS-S. [MEDIUM, punches far above weight] (1) Kill the two prompt() nickname calls (js/catch.js:110, js/battle.js:604) that guillotine the confetti mid-celebration; replace with an optional 'NAME ME ✏️' button. (2) Cycle the five flavor texts already fetched, cached and thrown away — api.js:68 stores six, dex.js:120 renders one, so every revisit to an entry reads identically for free. (3) Auto-play the cry at the end of the scan instead of hiding the Pokédex's signature payload behind a button. (4) One delegated img onerror handler — zero sprites in the entire app have one, and a 404 currently renders a broken-image glyph as the opponent. (5) Live BALL button label 'TOUGH / FAIR / EASY' recoloured from catchChance, which teaches hpFactor with no numbers. (6) Render badge desc and live progress as visible text (progression.js:149-152 hides 'Catch 3 Pokémon' inside a title= on a touch device). (7) Level-up fanfare + a persistent XP bar under the HP bar — the most frequent milestone in the game currently has literally zero celebration (js/battle.js:626 is one 9px line). Luna Martinez, Owen Gallagher, Claire Fontaine, Olga Ivanova, Diego Alvarez, Ritu Sharma.

**Rejected**

- ~~Walt Fischer's POKÉ COINS economy (delete the Master Ball, mint one currency; coins buy balls, heals and gym entry). REJECTED. The verified diagnosis is right — there is a faucet with no sink — but the cure mints a shop, a price table, a balance surface and an inflation problem, in a game whose actual illness is too MANY parallel economies (Jordan Avery's finding), not too few. It also imports the grammar of free-to-play monetization into a family game where nothing is for sale, teaching two boys that fun is something you buy with a resource meter. Fix the sink instead: charge nothing, but make the Poké Center heal available only from the gym LIST and not from inside a gym, so entering a gym is a commitment. That is Walt's own cheapest variant and it costs one conditional.~~
- ~~Removing auto-catch on KO (Walt Fischer, Ivan Petrov option (a), Diego Alvarez). REJECTED as a general rule, though the diagnosis is confirmed at js/battle.js:735-748. 'You beat it, you get it' is the most legible rule in the entire product and it is the reason a 4-year-old will sit through a battle at all. Deleting it to make hpFactor and four ball tiers relevant trades a felt reward for a systems abstraction that neither boy will ever perceive. Kenji Watanabe's scoped exception is the right shape and is accepted instead: legendaries only.~~
- ~~Ivan Petrov's TTK-inverted damage engine (stop computing damage from stats; derive it from a target time-to-kill, maxHp/4 scaled by type). REJECTED for this product and this cadence. It rewrites the single most load-bearing expression in a 979-line file that wild, gym, versus and junior modes all read, with no test harness in place, maintained by one engineer shipping weekly and approved by a non-developer. A regression here is not a bug ticket — it is a broken Saturday. The 20-line subset (variance roll + incoming-damage cap) delivers the felt outcome Ivan is actually chasing, which is that two fights should not be identical.~~
- ~~Ritu Sharma's soft level ceiling (lead can never exceed nextUnbeatenTrainer.level + 3). REJECTED. It is the most elegant pacing fix in the corpus and it is exactly wrong for a 7-year-old: it makes effort invisible and unrewarded at the precise moment the child is trying hardest. A boy who battles for twenty minutes and watches his XP bar refuse to move has been silently told the game does not care. Keep the good half — route surplus XP into the rest of the box — and let GABE outlevel the ladder if he wants to. Being overpowered is a reward a 7-year-old has earned and can feel; the ladder is not a difficulty contract he signed.~~
- ~~Marcus Webb's append-only action journal and Tanya Blackwood's HMAC-signed save quarantine. REJECTED together as enterprise architecture answering a household threat model. The realistic failure is not a forged save code or an unreplayable mutation — it is a curious tap on the P1/P2 button, a 'Clear Browsing Data', or a brother pasting his own code over his sibling's 121 caught. Cryptographic trust boundaries and event sourcing add ~150 lines of machinery that the approving parent can never debug at 7am. Ship PAUL NDIAYE's three-slot checksummed ring buffer plus the RESTORE PREVIOUS snapshot instead: ~20 lines, and it actually recovers the failure that will happen.~~
- ~~The battle.js kernel rewrite as a project — Ines Schultz's createBattle({sides, rules, hooks}), Yuki Tanaka's engine/presenter split, Ben Carter's four-booleans-to-one-state-machine, and Nadia Rezai's four-week feature freeze. REJECTED as scoped. Every one of them is correct about the code and wrong about the calendar: a freeze means four consecutive Saturdays where the boys open the game and find nothing new, paid entirely by the two users the product exists for. The targeted epoch guard and try/finally (endorsed above) buy the safety; extracting only the pure damage/catch math into rules.js buys Victor Hugo Santos's Monte Carlo instrument for one afternoon.~~
- ~~Jun Park's flick-to-throw physics and Priya Nair's finger-following gesture layer. REJECTED for the younger half of the audience. Replacing a tap with a velocity-and-angle flick converts the game's most important action into a fine-motor skill test, and the council contains its own rebuttal — Annika Berg's motor-accessibility findings argue directly against demanding gestural precision from a 4-year-old, whose failed throws would land as the game refusing him rather than as his own miss. Ship Annika's forgiving-tap engine instead: a nearest-interactive-element fallback within ~28px on dead-space taps, which makes the existing buttons more generous rather than making the throw less so.~~
- ~~AMARA OSEI's SEASONS (generative weekly 13th gym / RIVAL TOWER) and Sarah Oduya's per-child PWA installs (p1.html / p2.html with distinct icons). REJECTED as premature, not as bad. SEASONS is post-champion content for a circuit neither boy has finished — content built for an endgame that does not yet exist is content nobody sees. Per-child installs double the entry-point surface (two HTML files, two icon pipelines, two things to keep in sync) to solve a problem that the persisted currentPlayer plus the WHO'S PLAYING card already solves in one screen. Revisit SEASONS the week after GABE beats CHAMPION REX — that is when it becomes the best idea in the file.~~

---

## Critical findings

#### Free dex-page catching bypasses the entire loop

`CRITICAL` · `design-flaw` · effort **M** · — *Aria Voss*

From the Pokédex browser, any of the 649 species can be caught with unlimited free Pokéball throws: executeCatch (catch.js:40-97) rolls capture_rate*mod/255 with no ball inventory (only Master Balls are counted), and failure costs a 2-second 'BROKE FREE' message (catch.js:129-138) before you can thr

**Fix:** Gate dex-page catching to species already encountered in explore or battle ('seen' list), or give dex-throws a small daily Pokéball budget refilled by explores and wins. Collection must route through the other three arms of the loop or it isn't a loop.

#### Battle screen is 100% text-dependent — Junior Mode only makes the words bigger

`CRITICAL` · `design-flaw` · effort **M** · — *Dr. Hanna Kim*

A 4-year-old reaches battles constantly (tapping any EXPLORE habitat launches one, js/explore.js 139 → battle). Once there, the four move buttons are raw move names ('vine whip', 'thunderbolt') with a 6px type word badge (js/battle.js renderActive 277-283, gba.css .type-badge 233), and every game-st

**Fix:** In junior: (a) pipe every logMsg() through speak() (the queue pattern from progression.js celebrations works here); (b) render move buttons as big type-colored tiles with a type emoji (🔥💧⚡🌿 map already implied by typeColors in config.js) and demote the move na

#### Dex completion, the north-star long arc, is cheapest via button-mashing the dex screen — a

`CRITICAL` · `design-flaw` · effort **L** · — *MILA FERNANDEZ*

Any of the 649 species can be caught directly from the dex browse screen: openBag (catch.js:11) only blocks already-owned mons, and poke/great/ultra balls are free and unlimited (index.html:83-84, catch.js:74-79). A 7-year-old completionist will discover that navigating to #150 and spamming ULTRA BA

**Fix:** Make encounter context the only catch context: dex-screen CATCH should require the species be 'seen' first (via Explore, gym rosters, or evolution), or cost an earned resource per throw. Simultaneously expand habitat pools so all 649 are findable somewhere, an

#### Save import silently obliterates the OTHER brother's progress

`CRITICAL` · `design-flaw` · effort **M** · — *Rafa Costa*

importCode (state.js:198-210) replaces the ENTIRE two-player save — players 1 AND 2 — and applyImportedCode (settings.js:93-104) calls it with zero confirmation, zero preview, and no backup of what it overwrites. Realistic scenario: Dad exports from the iPad (where the 7yo mostly plays) to move his 

**Fix:** Before applying an import: (1) snapshot the current save to a pokedexos_save_backup_<timestamp> key with a RESTORE button in Parent Tools; (2) show a confirm dialog comparing incoming vs current per player ('P1: 42→38 caught, P2: 51→12 caught — REPLACE?'); (3)

#### The dex browser is an ungated catch firehose that makes every other collection system cosm

`CRITICAL` · `design-flaw` · effort **M** · — *OSCAR PENA*

Any species #1-649 — including Mewtwo, Arceus, every legendary — can be pulled up via nav/search/random on the main dex screen (dex.js:189-201) and caught on the spot with the CATCH button (catch.js:40-97). No encounter, no cost, no cooldown, no gating of any kind; a failed throw costs ~6 seconds. I

**Fix:** Gate dex-screen catching behind 'seen': you can only throw a ball at a species you've encountered in explore, battle, or gyms. Unseen species render as silhouettes. This one valve turns the dex from a vending machine into a record of the journey.

#### Escaping a versus match leaves versusActive=true, silently disabling the 4-year-old's juni

`CRITICAL` · `bug` · effort **S** · — *MARCUS WEBB*

battleState.versusActive is set true in startVersusBattle (battle.js:829) but exitBattleMode (battle.js:79-97) never resets it — only versusMatchOver, the vs-quit button, and the setup catch block do. The ESCAPE button (index.html:131, wired to exitBattleMode in main.js:118) is visible during versus

**Fix:** Add `battleState.versusActive = false;` (and null out passResolver) in exitBattleMode. Longer term, make the junior check side-aware: resolve the owning player from the defender's side, not from state.currentPlayer.

#### ESCAPE during Versus leaves versusActive=true, silently disabling the Junior shield

`CRITICAL` · `bug` · effort **S** · — *Yuki Tanaka*

exitBattleMode (battle.js:79-97) resets origin, canCatch, and trainer — but NOT battleState.versusActive. The always-visible header ESCAPE button (index.html:131, wired at main.js:118) calls exitBattleMode directly. Only the VS quit button, versusMatchOver, and the VS error path clear the flag (batt

**Fix:** Make exitBattleMode the single teardown authority: reset versusActive, wildShiny, pendingEvolution, and passResolver there, alongside origin/trainer/canCatch. Every field the battle can dirty must be cleaned in exactly one place.

#### Service worker never actually caches sprites — opaque responses fail the resp.ok guard

`CRITICAL` · `bug` · effort **S** · — *Chloe Dubois*

sw.js:63 gates asset caching on `if (resp.ok)`. Every sprite is loaded via <img> without a crossorigin attribute (dex.js:150, pc.js:109, battle.js:275/312, etc.), so the SW's fetch() returns an OPAQUE response — status 0, ok === false — for all raw.githubusercontent.com images. The 'cache-first, cac

**Fix:** Change the guard to `if (resp.ok || resp.type === 'opaque')` (opaque responses are safe to cache-first here since sprites are static), or add crossorigin="anonymous" to all sprite <img> tags — raw.githubusercontent sends ACAO:* so responses become non-opaque a

#### ASSET_CACHE never caches sprites, cries, or font CSS — offline images are broken

`CRITICAL` · `bug` · effort **S** · — *Niko Virtanen*

sw.js:63 only caches when `resp.ok` is true. But every sprite is loaded via plain <img> tags (dex.js:150, pc.js:109, battle.js:275/312) and cries via `new Audio(url)` (audio.js:54) — these are no-cors requests, so responses from raw.githubusercontent.com are opaque with status 0 and `ok === false`. 

**Fix:** Cache opaque responses for the sprite/cry hosts: `if (resp.ok || resp.type === 'opaque') cache.put(...)` — these URLs are immutable so a cached opaque error is low-risk, or better, refetch same-URL with `fetch(url, {mode:'cors'})` inside the SW (raw.githubuser

#### LED blink and evolution flash strobe at/above the 3-flashes-per-second seizure threshold

`CRITICAL` · `bug` · effort **S** · — *CARLOS MENDES, WCAG auditor*

main.css:21-22 — .blink runs ledBlink at 0.3s linear infinite (3.33 cycles/sec, each cycle a brightness(2) + glow pulse) on the header LEDs whenever scanning is active (dex.js:42-46 toggles it during every Pokémon load). Worse, gba.css:342-344 — #evo-sprite.evolving runs evoFlash 0.35s steps(2) infi

**Fix:** Slow ledBlink to >=1s. Replace the infinite invert strobe with 3 flashes max followed by a gentle white glow pulse; cap any luminance-inverting animation at 2 flashes/sec. Both are pure CSS keyframe edits.

#### Import silently wipes both boys' saves on shape-passing garbage, with no backup or undo

`CRITICAL` · `bug` · effort **M** · — *PAUL NDIAYE, save-integrity auditor*

importCode (state.js:198-210) replaces the ENTIRE save the moment obj.v===2 and obj.save.players is truthy. The code {"v":2,"save":{"players":{}}} base64-encodes to a valid 'save code'; hydratePlayer(undefined) returns freshPlayer() for both slots, persist() runs, and settings.js:96 cheerfully alert

**Fix:** Before assigning state.save in importCode: (1) write the current save to a backup key (pokedexos_save_backup) so any import is one-tap reversible from Parent Tools; (2) reject imports where both hydrated players have 0 caught unless the current save is also em

#### Import code is a stored-XSS delivery vehicle: name/nicks copied raw into innerHTML

`CRITICAL` · `bug` · effort **M** · — *Tanya Blackwood*

exportCode/importCode round-trip is just base64(JSON) with no signature or content validation (state.js:193-210). On import, hydratePlayer spreads the attacker object over defaults: `{...base, ...raw, nicks: raw.nicks || {}}` (state.js:52-60) — `name` and every value in `nicks` are copied verbatim w

**Fix:** Add one escapeHtml() helper (replace & < > " ') and apply it to every user/import-derived value at the innerHTML boundary — nick, name, and any imported string. Better still, stop building these rows with innerHTML: set the volatile text via textContent / a `<

#### Offline playability is purely accidental — nothing is ever precached

`CRITICAL` · `design-flaw` · effort **M** · — *Henrik Larsen*

Both caches are fill-on-demand only: sw.js precaches just the 20 shell files (sw.js:16-24), and api.js cached() (line 95-101) requires a network round-trip on any miss. So offline coverage equals 'whatever this specific browser happened to view while online.' Consequences in airplane mode: dex nav t

**Fix:** Add a warm-up pass: on idle while online, iterate HABITATS pools + all gym team IDs + both players' caught lists, calling getPokemon() (localStorage data) and caches.add(PIXEL_SPRITE(id)) + the animated sprite URLs at a throttled rate (~2/s). That is roughly 4

#### battle.js is a 979-line three-mode engine sharing one mutable singleton — the #1 regressio

`CRITICAL` · `design-flaw` · effort **L** · — *NADIA REZAI*

battle.js is ~30% of all game code and now runs three rulesets (wild, gym trainer, versus) through one shared battleState. Versus mode literally aliases Player 2 onto the wild-Pokemon slot ('map side 1 onto the engine's player slot, side 2 onto the wild slot', battle.js:843-846) and fakes its origin

**Fix:** Freeze battle-engine features. Extract the pure math (computeStats, damage/crit/STAB in performAttack:430-445, catchChance:631-638) into a DOM-free rules module with unit tests, and make each mode an explicit config object (canCatch, aiSmart, faintShield, exit

#### Super-effective STAB is a one-shot at EVERY level tier — so the 70% AI is a 70% delete button

`CRITICAL` · `design-flaw` · effort **M** · — *Sofia Rossi — AI-behavior designer (opponent AI, difficulty curves, felt fairness)*

The damage formula (battle.js:430-437) multiplies by 2.0 for type and 1.5 for STAB on top of a linear power term, while maxHp (battle.js:38) grows only ~linearly. Real numbers I ran: Lv8 Geodude, rock-throw (50 pow), STAB+2x, vs Lv8 Charmander = 30.1 damage into a 24 HP bar = 125% — a one-shot on the very first trainer of the very first gym (HIKER CARL, gymdata.js:16). Rock-slide (75 pow) = 176%. If the boy is a level behind at Lv5: 197%. At the top end, Lv80 Gyarados surf vs Lv80 Charizard = 297.8 into 214 HP = 139% — still a one-shot. Neutral non-STAB is 3 hits; resisted is 7. So every exchange has exactly two outcomes: nothing happens, or your Pokémon is deleted. Since `pickEnemyMove` uses its best move ~77.5% of turns (0.7 + 0.3×0.25) whenever its random 4-move roll contains a super-effective option — which happens ~60% of the time — most trainer battles are decided by a dice roll the child never sees and cannot influence. There is no difficulty CURVE across Lv8→80, only a variance curve: it is equally lethal at both ends.

**Fix:** Floor survivability instead of nerfing the fantasy: cap any single hit on a player Pokémon at ~45% of its maxHp (a 'you always get to react' rule), or make incoming super-effective 1.6x while outgoing stays 2.0x — an asymmetry the child reads as 'my type advantage is stronger than theirs'. Also scale the smartness constant by tier (~0.35 gyms 0-2, 0.55 mid, 0.85 Victory Road/Elite Four) so the AI visibly gets smarter as the boys do.

#### Switching — the one correct answer to a type-countering AI — is punished with a fully-informed free hit

`CRITICAL` · `bug` · effort **S** · — *Sofia Rossi — AI-behavior designer (opponent AI, difficulty curves, felt fairness)*

In `doSwitch` (battle.js:380-382) the opponent's free swing calls `pickEnemyMove()` AFTER `battleState.activeIdx` has already changed, so the 70% heuristic evaluates `getTypeMultiplier` against the Pokémon that just entered. That directly contradicts the honest behaviour in `executeTurn` (line 410), where the move is locked in first. Consequence: the child does the smart thing — 'Charmander is losing to rocks, I'll send in Squirtle' — and the AI instantly re-targets with a move super-effective against Squirtle, which per finding #1 is usually a one-shot on a fresh Pokémon. Switching is therefore strictly worse than mashing the same attack, and the game silently teaches a 7-year-old that thinking is punished. It is the most damaging line in the battle AI and it is a one-line fix.

**Fix:** Commit the enemy move before the swap: `const punish = pickEnemyMove(); battleState.activeIdx = newIdx; ... await performAttack('wild','player',punish);` — exactly like a real turn. Better for this age band: halve that punish hit with a 'caught off guard!' log line, and make switching completely free in Junior mode so the 4-year-old can rotate favourites without consequence.

#### Wild levels rubber-band to your lead, so difficulty is mathematically flat from Lv5 to Lv100

`CRITICAL` · `design-flaw` · effort **M** · — *Ivan Petrov — combat-math auditor*

js/battle.js:131: wildLevel = round(leadLevel * (0.8 + Math.random()*0.4)). Every wild is always within +/-20% of your lead. Combined with the stat formula this makes turns-to-KO a constant. Mirror-match at level parity, power-60 STAB move: Bulbasaur 1.9 turns at Lv5, 2.3 at Lv20, 2.4 at Lv40, 2.5 at Lv100. Charizard 2.0 -> 3.2. Snorlax 2.3 -> 3.3. Across 95 levels of grinding the fight length moves by less than one turn. The boys' 159 battles of leveling buy them nothing they can perceive -- the number over the sprite goes up and the fight is identical. Worse, the +/-20% level band is dwarfed by species variance the code does not control: at a Lv50 lead, the level band spans 29.4 to 57.6 incoming damage, but same-level species span 14.0 (Magikarp, 13% of your bar) to 102.0 (Garchomp, 97%). The 'difficulty knob' the code tunes is the smaller of the two, and the bigger one is uniform-random over all 649 species including legendaries (js/battle.js:161).

**Fix:** Decouple the two. (a) Make wild level a function of habitat/region, not the player -- Explore already has rarity tiers (js/explore.js:3), so give each habitat a fixed level band that rises as gyms are cleared. (b) Cap wild base-stat-total relative to the player's badge count so a Lv12 team never meets a Garchomp. (c) If you keep any rubber-banding, band the BST, not the level -- the level band is the wrong variable.

#### Zero damage variance plus deterministic initiative means the winner is decided before the kid touches a button

`CRITICAL` · `design-flaw` · effort **M** · — *Ivan Petrov — combat-math auditor*

js/battle.js:430-438 has no random damage roll -- mainline Pokemon multiplies by a uniform 0.85-1.00, this does not. There is also no accuracy check and no miss. The only randomness in a whole battle is a 1/16 crit and the enemy's move pick. Turn order is a pure deterministic comparison (js/battle.js:411: playerGoesFirst = f.speed >= battleState.wild.speed) with no speed tie randomization. Since KOs take 2-3 hits, first mover wins. I simulated 20,000 mirror duels with crits enabled: first-mover win rate is 100.0% at Lv5, 89.6% at Lv20 and Lv50, 99.6% at Lv80. The crit is the only thing that ever flips it -- P(at least one crit in a 6-swing battle) is 32%, and a crit only adds 20-27% of a bar (Lv5: +5.1 on a 19 HP bar; Lv50: +21.3 on a 105 HP bar). So the 7-year-old's move choice changes almost nothing except when type multipliers differ, and moves are re-rolled every battle anyway (js/battle.js:57, validMoves.sort(() => 0.5 - Math.random()) -- a biased comparator shuffle, then slice(0,4)), so he can never learn or plan around a moveset. His Charizard has different attacks every single fight.

**Fix:** Three cheap fixes, in priority order: (1) multiply damage by 0.85 + Math.random()*0.15 at js/battle.js:439 so repeat fights aren't carbon copies; (2) randomize speed ties and give slower-but-stronger a real path -- e.g. break ties by coin flip, and widen KOs to ~4 hits by halving the damage constant; (3) persist a moveset per owned Pokemon in player().mons[id].moves (seeded once at catch time) so 'my Charizard knows Flamethrower' becomes true.

#### Auto-catch on KO makes every ball — including the Master Ball — strictly dominated; the ball economy has a faucet and no sink

`CRITICAL` · `design-flaw` · effort **M** · — *Walt Fischer — reward-economy balancer*

handleVictory (/home/claude/pokedex/js/battle.js:735-747) catches the wild Pokémon with 100% certainty the moment it faints: `logMsg('CATCHING...')` → playCaptureAnimation() → concludeCapture('VICTORY!'), no ball spent, no roll. Meanwhile the BALL button path (battle.js:668-732) costs a turn, can fail (catchChance, line 631), and on failure gives the wild a free attack (line 728). A Master Ball costs an inventory item to buy a guaranteed catch that KOing already gives away for free — and KOing additionally awards XP the ball path also grants. So the rational play is: never throw a ball, ever. Demand for Master Balls in battle is exactly zero, while the faucet runs at 8 badges (progression.js:93) + 1 per daily sweep (progression.js:126), uncapped. The counter on the trainer card (progression.js:160) becomes a number that only goes up. The only surviving use is the Dex-screen throw (catch.js:74), i.e. skipping the game entirely to instant-grab a legendary from the browse list of all 649.

**Fix:** Remove auto-catch on KO. A fainted wild should give XP and drop a Poké Ball; catching should require a throw while it is still standing — that instantly makes hpFactor, the 4 ball tiers, and Master Ball scarcity all live again. If losing the mon entirely is too harsh for the 7-year-old, auto-catch only below 15% HP and print 'YOUR LAST POKÉ BALL CAUGHT IT!' so the ball is visibly consumed. Junior mode keeps auto-catch as-is.

#### Gym spoils hand out 164 Pokémon at trainer level, and each gym's spoils out-level the next gym's opener — the ladder self-supplies its own solution

`CRITICAL` · `design-flaw` · effort **M** · — *Walt Fischer — reward-economy balancer*

On every trainer win the entire enemy team joins the box at full trainer level (battle.js:550-557, `recordCatch(m.id); ensureMon(m.id, m.level)`). Across the 58 trainers in gymdata.js that is 164 awards / 140 unique species, ending with CHAMPION REX's six at Lv80 (gymdata.js:128). The level formula `lv = 8 + g*6 + (i===4 ? 5 : i)` (gymdata.js:9) means gym g's leader awards Lv 13+6g mons while gym g+1 opens at Lv 14+6g — a one-level gap. The player never needs to train: beat a leader, promote the freshly gifted mon to lead, walk into the next gym. XP, the 25+10L curve, evolution, team building and the entire Explore loop are bypassed as optional side content. The reward is also un-earned in feel: you win the fight, then get handed six things you did not choose.

**Fix:** Turn spoils into a draft: after a win, show the defeated team and let the kid keep ONE, at (trainer level − 3). Everything else converts to XP for the mon that landed the KO. That preserves the 'I won something' beat, restores a reason to grind between gyms, and makes the choice itself the reward — 58 small decisions instead of 58 dumps.

#### The XP curve never bends, so the lead outpaces the ladder from day 2 and never stops

`CRITICAL` · `design-flaw` · effort **S** · — *Ritu Sharma — progression-pacing analyst*

XP per fight is `Math.floor((w.base_experience||60)/2 + w.level*3)` (js/battle.js:509, :612) and wild level is tied to the lead: `Math.round(leadLevel * (0.8 + Math.random()*0.4))` (js/battle.js:131). Cost to level is `25 + level*10` (js/state.js:117). So levels-gained-per-fight = (32 + 3L)/(25 + 10L), which converges to a CONSTANT 0.30-0.38 levels per fight at every level — there is no diminishing return anywhere in the game. Meanwhile the ladder advances exactly +1 level per trainer (gymdata.js:9). Simulating 5 explores + 1 gym trainer/day (≈7.6 XP events/day): lead gains ~2.7 levels/day against a ladder gaining 1.0. Exact days: day 1 lead Lv9 vs Lv9 foe (gap 0) — the only fair day of the whole month. Day 2 gap +3. Day 5, first Leader ROCKO Lv13, lead is Lv24 (gap +10). Day 10 gap +18. Day 14 gap +23. Day 21 gap +32. Day 28 gap +40 (lead Lv81 fighting Lv41). The equilibrium explore rate is ~0.3 explores/day — i.e. the ladder is only in balance for a child who explores once every three days. The single most fun loop in the game is the thing that breaks it.

**Fix:** Make XP sublinear against the gap. Cheapest correct fix: multiply the award by `Math.min(1, ((wildLevel+5)/(leadLevel+5))**2)` in js/battle.js:509 and :612, so grinding at-or-below your level pays almost nothing, or switch xpThreshold to `25 + level*level*1.2`. Either turns 0.35 lv/fight into ~0.12 by Lv40 and lands the day-28 gap near +5 instead of +40. Then re-sim before shipping.

#### The lead Pokémon is silently whichever species has the lowest dex number, and it is invisible

`CRITICAL` · `bug` · effort **S** · — *Ritu Sharma — progression-pacing analyst*

`battleState.teamIds = player().team.length ? [...player().team] : player().caught.slice(0, 6)` (js/battle.js:124) — and `caught` is kept sorted ascending by dex id (`p.caught.sort((a,b)=>a-b)` in js/state.js:140, :183). `team` is only ever populated by an explicit PC → team-picker flow (js/pc.js:168). So a child who never opens the PC — certainly the 4-year-old, likely the 7-year-old for weeks — has their lead silently reassigned every time they catch a lower-numbered species. Volcano Path's COMMON pool contains #4 Charmander (js/explore.js:27); Deep Forest's uncommon pool contains #1 Bulbasaur (js/explore.js:13); Cascade Gym trainer 4 hands you #7 Squirtle (js/gymdata.js:29). Worse: `renderTeamStrip` returns early and hides the strip entirely when `team.length === 0` (js/pc.js:49-50), so there is no on-screen indication of who the lead even is. The mon the child has been levelling for a week is abandoned mid-run with no message, no animation, no way to notice — and since wild level scales off `monLevel(teamIds[0])`, the whole encounter curve reshuffles with it.

**Fix:** On the first `recordCatch`, auto-set `team = [id]` (js/state.js:180). Never fall back to dex-sorted `caught` for lead selection — if team is empty, pick the highest-level owned mon instead of `caught.slice(0,6)`. And render the TEAM strip with the effective lead even when `team` is empty so the star is always visible.

#### The entire instruction layer is hover tooltips, on a device with no hover

`CRITICAL` · `design-flaw` · effort **M** · — *Claire Fontaine — first-session / onboarding designer*

There is zero onboarding code in the repo — grep for tutorial/onboard/welcome/first-run/intro across js/, index.html and css/ returns nothing. Instead, every explanation of a feature lives in a `title=` attribute: 26 of them in index.html (e.g. line 39 'Settings: names, junior mode, sound, save data', line 78 'Challenge 58 trainers — win their whole team!', line 85 'Never fails — earn more from badges') plus 11 more generated in JS (pc.js:55 'tap to make it your lead', gym.js:84, progression.js:150). On an iPhone/iPad — the stated target, given the apple-mobile-web-app meta tags on index.html:6-7 — `title` never renders. A cousin picking this up cold sees nine unlabelled-in-meaning chips (CRY, VOICE, SHINY, RNDM, CATCH, DATA, CARD, EXPLORE, GYMS) and a header of four icons, with 100% of the authored explanation invisible.

**Fix:** Ship a one-time coached first run instead of tooltips: after the boot wipe, dim everything except CATCH with a pulsing arrow and three words ('CATCH IT!'); after the first GOTCHA, reveal EXPLORE the same way; after the first encounter, reveal GYMS. Persist a `save.players[n].seen = {catch:true, explore:true, gyms:true}` flag so it never repeats. Separately, mirror every `title=` into a visible `<small>` caption or a long-press toast so the copy that already exists actually reaches a reader.

#### The lead is the game's difficulty dial, and for Explore players it is set by an accident of dex numbering

`CRITICAL` · `design-flaw` · effort **M** · — *Diego Alvarez*

js/battle.js:130-131 sets every wild encounter's level from the lead: wildLevel = round(leadLevel * (0.8 + rand*0.4)). The lead therefore controls all difficulty. But js/battle.js:126 falls back to player().caught.slice(0,6) when team is empty, and Explore never opens the team picker (js/explore.js:475 -> js/main.js:148 -> startWildEncounter skips the PC entirely). A boy who only explores never sets a team, so his lead is permanently caught[0] — the LOWEST DEX NUMBER he owns. Catch a Caterpie (#010) at Lv5 and every wild in Dragon's Den is Lv4-6 forever, while the Lv40 Charizard he is proud of is benched. Two more rules ride the same invisible switch: KO XP goes to whoever is active (js/battle.js:511, 613) and quest XP is hard-coded to team[0] (js/progression.js:469), so the accidental lead also hogs all growth. Nothing in the UI names the lead, shows its level, or links it to the enemy's level.

**Fix:** Put a persistent lead chip on the Explore habitat screen and the battle title bar: sprite + 'LEAD · Lv12' + one fixed line 'WILD POKEMON MATCH YOUR LEAD'S LEVEL'. Tapping it opens the PC team strip. Also run the team picker once on first Explore entry (reuse openPC('team')) so team is never empty by accident. Rule learned in one encounter, no tutorial.

#### A single thrown error mid-turn freezes the battle with every button disabled — and there is no global handler to notice

`CRITICAL` · `bug` · effort **M** · — *Olga Ivanova — error-handling & failure-mode auditor*

`executeTurn` is fired from a click listener with no `.catch` (/home/claude/pokedex/js/battle.js:288, :349) and immediately sets `battleState.busy = true; enableMoves(false)` (:406-407). `enableMoves` disables *every* `.move-btn` (:325-327), and RUN and SWITCH carry that class (:283). So any rejection anywhere in the awaited chain — `performAttack` → `checkFaints` → `handleEnemyDown` → `buildEnemy` — leaves `busy` permanently true and all four move buttons plus RUN and SWITCH greyed out, with the battle log frozen on 'X used TACKLE!'. There is zero `window.onerror` / `unhandledrejection` listener anywhere in the codebase (verified: no matches across js/ or index.html), so nothing logs it, nothing recovers it, and the only exit is the tiny grey ESCAPE chip in the header (index.html:131). A 4-year-old will not find that. He will hand dad a dead Pokédex. The same unguarded-promise pattern silently eats the save-transfer path too: `navigator.clipboard.writeText(code).then(...)` has no `.catch` (/home/claude/pokedex/js/settings.js:72), so a denied/unfocused clipboard write produces no alert, no fallback prompt, and no copied code.

**Fix:** (1) Add `window.addEventListener('unhandledrejection'|'error')` in main.js that shows one big in-world overlay ('OH NO! Something went wobbly' + one giant OK button) and calls `exitBattleMode()`. (2) Wrap every async entry point invoked from a listener in `.catch(gameError)` — `executeTurn`, `doSwitch`, `executeBallThrow`, `executeVersusMove`, `maybeEvolveThenExit`. (3) Give RUN its own class so `enableMoves(false)` can never disable the escape hatch. (4) Add `.catch` to the clipboard promise with the `prompt()` fallback that v15 had (index.v15.html:842).

#### The most destructive action in the app has no gate at all, while the harmless one has two

`CRITICAL` · `design-flaw` · effort **S** · — *Meredith Stone — parental-controls designer*

Parent Tools (add a Pokémon, set a level — fully reversible) is protected by a 1200ms hold AND a PIN. But 'PASTE CODE' and 'LOAD FILE' sit in the same Settings modal, one tap from the ⚙️ button, with no hold, no PIN, and no confirmation (js/settings.js:106-133). importCode() replaces BOTH players wholesale (js/state.js:198-210) and immediately persist()s over the only copy (js/state.js:209). Concrete breakfast scenario: the 7-year-old is shown a 'save code' by a friend at school, taps ⚙️ → PASTE CODE → paste → 'SAVE LOADED! Welcome back.' — and his 4-year-old brother's entire dex, badges, levels and nicknames are gone with no undo, no backup, and no error. The section is even labelled 'SAVE DATA (BOTH PLAYERS)' (index.html:236) so the code knows it is destructive; it just doesn't act like it.

**Fix:** Before importCode() writes, snapshot the current save to a separate key (pokedexos_save_v2_prev) and add a RESTORE PREVIOUS SAVE button. Put a confirm() naming exactly what is lost ('This replaces BOTH players — ALEX has 47 caught, SAM has 12'). Move the two import buttons behind the same PIN gate as Parent Tools; leave export ungated.

#### The app always boots as Player 1, so the 4-year-old lands in his brother's profile

`CRITICAL` · `design-flaw` · effort **M** · — *Meredith Stone — parental-controls designer*

state.currentPlayer is runtime-only and hardcoded to 1 (js/state.js:69) — it is not in the persisted save (js/state.js:27-29). Every reload, every PWA relaunch, every iOS tab eviction resets to P1. So when the pre-reader opens the app himself, he gets P1's settings: junior mode off (small buttons, no spoken names, catches can fail, battles CAN be lost — js/battle.js:441), and every Pokémon he catches lands in his brother's dex (recordCatch writes to player(), js/state.js:180). The only way out is the header button (js/main.js:58-67) whose entire affordance is a 12-character text name (js/settings.js:15) that a 4-year-old cannot read, with no avatar, no face, no picture. He has no way to know he is in the wrong profile and no way to fix it — and his brother will find his dex polluted.

**Fix:** Persist currentPlayer in the save. On boot, if two profiles have any data, show a two-giant-tile 'WHO'S PLAYING?' picker using color + a chosen starter sprite per kid (a pre-reader can pick a picture). Make the header button show that sprite, not text.

#### Import is whole-family replace — syncing one kid destroys the other kid's progress

`CRITICAL` · `design-flaw` · effort **M** · — *Andre Williams — family-logistics expert*

`importCode` (js/state.js:191-196) does `state.save = { version: 2, players: { 1: hydratePlayer(...), 2: hydratePlayer(...) } }` — it replaces BOTH players wholesale, and there is no per-player export/import anywhere in the UI (js/settings.js:145-148 wires only 4 buttons: copy/file export, paste/file import). Walk the real workflow: 7yo plays P1 on the iPad Tuesday; 4yo plays P2 on Dad's phone Wednesday. Both devices now hold newer data for one player and stale data for the other. Any code transferred in either direction wipes one child's week. There is no direction of transfer that preserves both. With three devices this happens continuously, not occasionally.

**Fix:** Make sync merge-only, never replace. Add `mergePlayer(a,b)`: union `caught`/`shinies`/`badges`/`gyms.beaten`, per-id `max(level)` and `max(xp)` for `mons`, `max` for each `stats` counter, `max` for `items.masterBalls`, prefer non-empty for `name`/`nicks`. Then make import default to MERGE with 'replace instead' behind a parent confirm. Also emit per-player codes (`{v:3, p:1, player:{...}}`) so one kid's device can be synced without touching the other's.

#### Silent destructive import: no timestamp, no preview, no undo

`CRITICAL` · `bug` · effort **S** · — *Andre Williams — family-logistics expert*

`exportCode` payload is `{ v: 2, save: state.save }` (js/state.js:186) — no timestamp, no counts, no device id. The JSON file wrapper does carry `exported` (js/settings.js:71-75) but `uploadSaveFile` throws it away, reading only `.code` (js/settings.js:135). So on import there is literally no information available to tell whether the incoming code is newer or older than what's on the device. `applyImportedCode` (js/settings.js:96-106) then calls `importCode` → `persist()` (js/state.js:199), overwriting `pokedexos_save_v2` immediately, and cheerfully alerts 'SAVE LOADED! Welcome back.' Concrete failure: Dad pastes the code still sitting in his Notes app from three weeks ago; 40 catches, two badges and every nickname are gone in one tap with a congratulatory alert and no recovery path.

**Fix:** Embed `t: Date.now()` and a summary (`caught` counts per player) in the export payload. Before applying, show a comparison: 'CODE: 84 caught, saved Jul 12 · THIS DEVICE: 121 caught, played today' with MERGE / REPLACE / CANCEL. Always copy the current save to `pokedexos_save_v2_prev` first and expose an 'UNDO LAST IMPORT' button in Settings for 7 days.

#### ESCAPE mid-turn wipes battle state while the turn is still awaiting — the boys get a phantom nickname prompt and a Pokémon they ran away from

`CRITICAL` · `bug` · effort **M** · — *Ben Carter — race-condition & async-state hunter*

`escape-btn` (index.html:131) lives inside `#battle-container` and is NOT a `.move-btn`, so `enableMoves(false)` (js/battle.js:325-327) never disables it. It is tappable during every await in the turn pipeline. `exitBattleMode` (js/battle.js:79-97) synchronously sets `isBattling=false` and `loaded={}` — but nothing downstream re-checks. Concrete trace: the player's move KOs the wild at js/battle.js:414; during the trailing `await sleep(900)`/`sleep(400)` at :455-460 the child taps ESCAPE. The chain resumes at :420-421 → `checkFaints()` sees `wild.hp <= 0` (wild is never nulled) → `handleVictory()` runs the full 2.9s capture animation on a hidden container, increments `stats.battlesWon` and persists (:745), then `concludeCapture()` calls `recordCatch(w.id)` + `ensureMon()` (:599-600) — the catch is committed — then fires `prompt('Give X a nickname?')` (:607) on top of the dex/explore screen seconds after the child left the battle, then throws TypeError at `monLevel(f.id)` (:613) because `active()` is now undefined. Same class of failure in `doSwitch` (:353-388), `executeBallThrow` (:726-731) and `versusNextMon` (:939-961). There is no cancellation token anywhere in the file.

**Fix:** Add `let battleEpoch = 0;` incremented in `exitBattleMode` and `startBattleUI`. Capture `const e = battleEpoch` at the top of every async function and add `if (e !== battleEpoch) return;` after every `await` (or wrap sleep: `const step = async ms => { await sleep(ms); if (e !== battleEpoch) throw ABORTED; }`, swallowing ABORTED at the entry points). Cheap interim fix: make ESCAPE a no-op while `battleState.busy` is true and show 'FINISH THE TURN FIRST!'.

#### `versusActive` is never cleared on the ESCAPE exit path — a 4-year-old permanently loses Junior Mode invincibility for the rest of the session

`CRITICAL` · `bug` · effort **S** · — *Ben Carter — race-condition & async-state hunter*

`startVersusBattle` sets `battleState.versusActive = true` (js/battle.js:829). It is cleared in exactly three places: the END MATCH button (:892), `versusMatchOver` (:965) and the startup catch block (:863). `exitBattleMode` (js/battle.js:79-97) resets `origin`, `canCatch`, `trainer` and `loaded` — but not `versusActive`. During a VS match, ESCAPE (index.html:131) sits on screen right next to 🏳️ END MATCH, and a 7-year-old will hit either. Quitting via ESCAPE leaves `versusActive === true` forever — no later entry point resets it (`launchBattle` :121-128, `startTrainerBattle` :181-188, `startWildEncounter` :166-171 all set other flags but never this one). Consequence at js/battle.js:441: `if (defenderRole === 'player' && player().settings.junior && !battleState.versusActive)` — the Junior Mode 'your Pokémon can never faint' shield is silently disabled for every subsequent wild and gym battle. The 4-year-old's team now faints, `checkFaints` runs the loss branch (:477-492) and he gets `alert('DEFEAT!')`. The one feature that makes the game safe for the younger son is switched off by one wrong button, with no visible cause and no recovery short of a page reload.

**Fix:** Move `versusActive = false` (and `versus.sides = null`, `versus.qi = 0`) into `exitBattleMode` alongside the other resets at js/battle.js:86-88. Better: derive it — `const inVersus = () => versus.sides !== null` — so it cannot drift. Add a test asserting every `battleState` field is back to its documented default after `exitBattleMode()`.

#### Level-up — the most frequent milestone in the game — has literally zero celebration

`CRITICAL` · `design-flaw` · effort **M** · — *Luna Martinez — celebration designer*

A 7-year-old levels a Pokémon every couple of battles (xpThreshold = 25 + level*10, js/state.js:116 — deliberately fast). The entire payoff is one <p> of 9px pixel text inside the victory modal: `${f.name} grew from Lv${before} to Lv${after}!` (js/battle.js:626), styled identically to the XP line above it (css/gba.css:338). No sound, no animation, no haptic, no sprite reaction. In gym battles it is worse — level-ups are pushed into t.xpLines (js/battle.js:512) and buried at position 4+ of a text list. `t.lastXpMon` (js/battle.js:513) captures the level-up data and is never read anywhere in the codebase: dead code where a celebration was clearly intended. Worse still, XP is invisible: xpThreshold exists but no XP bar is rendered anywhere (the only fill element is #card-dex-fill), so the child cannot see the meter creeping toward the reward. Anticipation without a visible meter is not anticipation.

**Fix:** Add a level-up beat before the victory modal: the player sprite bounces, a 4-note rising fanfare (523/659/784/1047 — the pokeCenterHeal jingle in js/gym.js:36 already proves the pattern), a big yellow 'LV. 12!' burst over the sprite reusing the .dmg-float/fxBurst keyframes, haptic [60,40,120]. For multi-level gains, replay the beat once per level with a rising pitch — three pops feel three times as good as 'Lv5 to Lv8'. Then add an XP bar under the player nameplate that visibly fills and empties on level-up; wire the gym path by consuming t.lastXpMon instead of discarding it.

#### Beating all 55 trainers — the game's ending — is one extra line of body text

`CRITICAL` · `missed-opportunity` · effort **M** · — *Luna Martinez — celebration designer*

js/battle.js:570 `if (circuitDone) lines.push('👑 YOU BEAT THE ENTIRE GYM CIRCUIT! YOU ARE THE CHAMPION!')` — the culmination of 55 sequential trainer fights is appended to the same list as '#025 Lv12 · #026 Lv14', and because css/gba.css:339 only enlarges #victory-lines p:first-child, the champion line renders SMALLER and duller than the routine 'TRAINER DEFEATED' headline above it. No sound (show('victory-modal') at js/battle.js:570 plays nothing at all), no confetti, no unique haptic, no permanent record — the trainer card (js/progression.js:150-176) has no champion field, so the next day there is nothing to point at and say 'I did that.' The single biggest achievement available to the 7-year-old is the most under-celebrated thing in the game.

**Fix:** Give the champion its own fullscreen sequence, not a line: dim to the evo-modal treatment, march the child's six team sprites in one at a time with a beep each, a 10-second Hall of Fame with the trainer name and total trainers beaten, max confetti, a long ascending fanfare, then permanently stamp a 👑 CHAMPION banner at the top of the trainer card and a crown on the Gym Circuit header. Fire it AFTER the spoils modal, never inside it.

---

## High-severity findings

#### Only the active mon earns XP — the team of 6 is decorative

`HIGH` · `design-flaw` · effort **S** · — *Aria Voss*

addXp is called exclusively for the mon on the field at the moment of KO or capture (battle.js:509-511 for gyms, 612-614 for wilds); benched teammates get nothing, ever. Voluntary switching even costs a free enemy hit (battle.js:380-383). So the rational play is one over-leveled lead and five Lv5 pa

**Fix:** Give 50% XP to every team member who entered the field during the battle, or a flat 25% share to the bench (classic Exp. Share). One-line change in the two award sites; transforms team-building from decoration into strategy.

#### Gym loot outclasses hand-raised mons — 'train' collapses into 'loot'

`HIGH` · `design-flaw` · effort **M** · — *Aria Voss*

Beating a trainer grants their whole team at the trainer's level (battle.js:551-557, ensureMon(m.id, m.level)), while raising your own mon at Lv40 needs ~425 XP/level (state.js:117) against ~150-180 XP per win — several multi-minute battles per level. So the dominant strategy from roughly the fighti

**Fix:** Two-part fix: (a) prize mons of already-owned species should raise that mon to max(currentLevel, trainerLevel) so loot strengthens what you have; (b) add a Bond bonus (see boldest idea) so levels earned in battle are worth more than levels looted.

#### Duplicate catches pay nothing — late-game wild battles are dead reward loops

`HIGH` · `missed-opportunity` · effort **M** · — *Aria Voss*

Arena wilds are uniform random over all 649 (battle.js:161) and explore pools are small (14-17 commons per habitat, explore.js:10-51), so by session 20 the majority of wild victories end in '(already in your Box)' (battle.js:621) — the collect arm delivers literal nothing beyond lead XP. There is no

**Fix:** Duplicates award a currency (Star Shards): spend on Rare Candies (+1 level to any mon — finally a use that feeds 'train'), Great/Ultra Ball stock for the dex drawer, or shiny-charm odds. Scale daily-quest XP with lead level (e.g. 3× threshold %).

#### Loyalty is punished: the optimal strategy is abandoning your starter team every gym

`HIGH` · `design-flaw` · effort **S** · — *Dev Okonkwo*

XP goes ONLY to the single active mon at the moment of a KO or catch (battle.js:511 addXp(f.id,...), battle.js:614) — there is no XP share, and caught wilds join at wild level ~= lead level (battle.js:131, 600). Meanwhile gym gifts arrive at the trainer's own level. Computed: a kid who keeps his bel

**Fix:** Split KO XP across all 6 team members (full amount to each is fine at this curve — it merely converts the 6x multi-mon grind into the 1x carry grind), or give benched team members 50% echo XP. One loop in addXp's call sites.

#### Junior Mode can't lose but effectively can't win past Gym 4: 90+ turn tap marathons

`HIGH` · `design-flaw` · effort **S** · — *Dev Okonkwo*

Junior halves incoming damage and floors HP at 1 (battle.js:441-443) but does nothing to outgoing damage. A junior kid's Lv8 mon does ~2.6 damage/hit into a Lv80 champion mon with ~242 HP (formula at battle.js:430, stats at battle.js:35-43) — ~93 turns per enemy mon, ~450+ turns for Champion Rex's 6

**Fix:** In junior mode, scale player damage by a floor: e.g. damage = max(damage, enemy.maxHp * 0.15) when the level gap exceeds ~10. Fights become 5-8 taps regardless of ladder position — pacing, not challenge, is what junior mode should tune.

#### Native alert()/prompt() dialogs still fire inside junior flows

`HIGH` · `bug` · effort **S** · — *Dr. Hanna Kim*

Junior correctly suppresses the nickname prompt (battle.js 606, catch.js 111), but pre-readers still hit raw system dialogs: 'You need to CATCH a Pokémon before you can battle!' (battle.js 101), the explore gate (explore.js 95), 'Catch a Pokémon first!' (gym.js 133), the wild-defeat alert (battle.js

**Fix:** Replace all player-facing alert()s with the existing badge-modal/victory-modal pattern (emoji + spoken line + one big button). For the 'no Pokémon yet' gates, better still: auto-bounce to the dex with the CATCH button pulsing — show, don't tell.

#### Victory/defeat screens are paragraphs of 8-9px text with no picture of what you caught

`HIGH` · `missed-opportunity` · effort **S** · — *Dr. Hanna Kim*

The single most emotionally important moment — 'you caught it!' — is delivered as text lines: concludeCapture builds strings like '#025 Lv12 was added to your PC Box!' and gym wins list captures as 'カ#123 Lv14' text tokens (battle.js 618-625, 562-569; #victory-lines styled at 9px, gba.css 338). No s

**Fix:** Put the caught Pokémon's sprite (PIXEL_SPRITE is already imported) front and center in the victory modal with confetti (spawnConfetti is exported and unused here), and in junior speak the headline: 'You caught Pikachu!'. This is an S-effort change with the sin

#### All 8 badges are exhausted by roughly week 2, and none of them are tied to the gyms

`HIGH` · `design-flaw` · effort **M** · — *MILA FERNANDEZ*

BADGES (progression.js:12-21) top out at 'catch 50', 'win 10', 'explore 15', 'one mon at Lv30' — an engaged kid clears all eight inside two weeks, after which checkBadges() is dead code for the rest of the game's life. Worse, the game has a 12-stage GYM CIRCUIT with named LEADERs (gymdata.js), and b

**Fix:** Rebuild BADGES as one badge per gym leader defeated (check p.gyms.beaten for each ':4' leader key — 10 badges, data already persisted) plus tiered dex-milestone badges (100/200/300/500/649 caught). Keep the current 8 as early 'ribbons' if you like, but the bad

#### Becoming Champion — the game's climax — is one unpersisted log line

`HIGH` · `missed-opportunity` · effort **M** · — *MILA FERNANDEZ*

recordGymWin (gym.js:150-154) returns circuitDone, and battle.js:568 renders '👑 YOU BEAT THE ENTIRE GYM CIRCUIT!' as a <p> in the victory modal. No champion flag is saved, nothing on the trainer card changes, the celebration queue (which exists!) isn't used, and at day 30 there is zero visible evide

**Fix:** Persist a champion flag + date in the save, fire queueCelebration with a unique champion ceremony, gold-tint the trainer card, and add a Round 2 rematch circuit (same data, levels +15, ~one line in gymdata's lv() helper) so the ladder regenerates instead of dy

#### No tap-to-skip anywhere: a 3-mon gym battle carries ~43s of unskippable dead air

`HIGH` · `design-flaw` · effort **M** · — *TOM BAUER*

Every battle message is a fixed sleep(): 900ms after 'X used MOVE!' (battle.js:428), +900ms for crit AND +900ms for super-effective — they stack serially to 3.1s per attack (battle.js:455-458) — plus a 400ms tail (line 460). Minimum attack = 1.3s. Worse, gym AI deliberately picks super-effective mov

**Fix:** Replace sleep(ms) in battle flows with an awaitOrTap(ms) that races the timer against one pointerdown on the battle view (min ~250ms so text registers). Also merge crit+effectiveness into ONE line ('CRITICAL — it's super effective!') so the worst case is 900ms

#### Global swipe handler hijacks scrolling inside the open data sheet

`HIGH` · `bug` · effort **S** · — *Priya Nair*

wireGestures (main.js:74-95) attaches touch listeners to the entire #app-body with no target check. The bottom sheet and its scrollable .sheet-content live inside #app-body (index.html:88-104). When the sheet is open and a child scrolls DOWN through stats then drags downward >80px to scroll back up,

**Fix:** In touchstart, record gestureTarget = e.target; in touchend, bail if gestureTarget.closest('.sheet-content, #ball-drawer, .toolbar, input'). Track a single touch identifier and ignore multi-touch. Also close the diffX 40-60px dead zone where scroll is preventD

#### Header controls are ~29px tall — five in a row, and Junior mode does not enlarge them

`HIGH` · `design-flaw` · effort **M** · — *Priya Nair*

In the GBA theme, .player-toggle/.header-btn are font-size 9px + padding 7px 8px + 3px borders (gba.css:83-88) ≈ 29-32px tall — well under Apple's 44pt minimum. At ≤430px (every iPhone) they shrink further to padding 7px 6px, font 8px with 5px gaps (gba.css:567-573). That row packs P1 toggle, music,

**Fix:** Give header buttons min-height:44px (pad vertically, keep pixel font), and in Junior mode collapse the header to just music + PC with oversized hit areas; move player switching behind settings or add a 'Switch to P2?' confirm since it swaps the active save.

#### Versus mode structurally guarantees the 4-year-old loses

`HIGH` · `design-flaw` · effort **M** · — *Dr. Sam Ellington*

Versus uses each profile's own raised levels (pLevel, battle.js:799, 837-838) with no handicap. The 7-year-old plays more, reads better, and grinds gyms, so his levels will permanently outpace his brother's — versus becomes a deterministic stomp, and versusWins is tracked on the trainer card as a sc

**Fix:** Level-normalize versus by default: build both sides' fighters at a fixed level (e.g. both at 50), so team choice and type matchups decide the winner, not playtime. Add a comeback mechanic (loser of the last match gets a visible, cool-sounding buff). Keep the j

#### No pity mechanic on dex-catch RNG — unbounded fail streaks on rare species

`HIGH` · `design-flaw` · effort **S** · — *Dr. Sam Ellington*

catch.js:77-79 computes catch odds as capture_rate * ballMod / 255 with no floor and no streak memory. A capture_rate-3 legendary (Mewtwo, Articuno) is ~1.2% per Pokéball, ~2.4% per Ultra Ball — a 7-year-old can fail 30-50 consecutive throws, each ending in 'DARN! IT BROKE FREE!' in red text (catch.

**Fix:** Add a per-species consecutive-miss counter that multiplies odds (e.g. +25% relative per break-free, reset on catch). Invisible, cheap, and converts fail streaks into rising tension with a guaranteed payoff horizon.

#### UTC day boundary rug-pulls quest progress during prime play hours

`HIGH` · `bug` · effort **S** · — *Dr. Lena Morris*

todayNumber() is Math.floor(Date.now()/86400000) — UTC days (progression.js:37). ensureDailyQuests() wipes the entire quest list, including partial progress, the moment the UTC day flips (progression.js:54-56). For a US household that flip lands at 5pm PT / 8pm ET — exactly the after-dinner play win

**Fix:** Key the day on local date instead: e.g. const d = new Date(); return d.getFullYear()*10000 + (d.getMonth()+1)*100 + d.getDate(). One-line change; midnight local is a boundary no child is awake to lose progress across.

#### Near-miss shake theater on failed catches with no pity floor

`HIGH` · `design-flaw` · effort **S** · — *Dr. Lena Morris*

A failed dex-screen catch plays Math.floor(Math.random()*3)+1 shakes before 'DARN! IT BROKE FREE!' (catch.js:82) — randomized almost-had-it suspense is the signature slot-machine near-miss pattern. Combined with raw PokeAPI capture rates (catch.js:77-79: baseRate*ballModifier/255), a legendary at ca

**Fix:** Add a per-species pity counter: after ~4 consecutive failures, the next throw succeeds ('It's getting tired!'). Also make 3 shakes mean success only — a failure caps at 2 — so the animation is honest information, as in the real games, rather than manufactured 

#### Physical/Special split ignored — special attackers are gutted

`HIGH` · `design-flaw` · effort **M** · — *KENJI WATANABE*

computeStats (battle.js:35-43) only builds atk/def/speed; the damage formula (battle.js:430) always uses attacker.atk vs defender.def. Alakazam (base Atk 50, SpA 135) hits like a wet noodle; ironically the flagship gym aces — Alakazam (LUNA), Gengar (SHADE), Chandelure, Vanilluxe — are all special a

**Fix:** Add spAtk/spDef to computeStats and branch on move.damage_class: special moves use spAtk/spDef, physical use atk/def. The data is already in the cache; this is a ~10-line change that makes Alakazam feel like Alakazam.

#### Status moves deal damage and movesets ignore learnsets

`HIGH` · `design-flaw` · effort **M** · — *KENJI WATANABE*

buildFighter (battle.js:56-63) blacklists only 4 moves by name, then does power: mData.power || 40 — so Hypnosis, Thunder Wave, Sleep Powder, Protect, Stealth Rock all become 40-power attacks of their type. Worse, the 4 moves are drawn at random from the ENTIRE legal movepool, so a Lv8 Geodude can r

**Fix:** Filter out moves where mData.power == null (fall back to tackle if empty) — one-line fix, effort S on its own. Better: keep each move's level-up learn level in slimPokemon and pick from moves learnable at or below the fighter's level, so movesets grow with the

#### Gym endurance HP bleeds between brothers on player switch

`HIGH` · `bug` · effort **S** · — *Rafa Costa*

gymRun (gym.js:18) is module-level, keyed only by gymKey and mon id, with no owner field, and togglePlayer (main.js:58-67) never clears it. Concrete failure: P1 (non-junior) battles through half of a gym, his Pikachu #25 drops to 9 HP (saved at battle.js:547). Brothers swap via the header button; P2

**Fix:** Add `owner: state.currentPlayer` to gymRun, include it in the endurance checks at battle.js:191 and 361, and call clearGymRun() inside togglePlayer. Three lines.

#### Status moves silently become 40-power attacks of their type

`HIGH` · `bug` · effort **S** · — *Grace Liu*

buildFighter blacklists only 4 status moves by name (battle.js:56: swords-dance, growl, tail-whip, splash) out of the hundreds in PokeAPI, then `mData.power || 40` (battle.js:62) converts every other status move — Thunder Wave, Sleep Powder, Hypnosis, Spore, Recover, Protect, String Shot — into a 40

**Fix:** In buildFighter, after getMove, drop moves where `mData.damage_class === 'status'` or `mData.power == null` (retry the shuffle pool until 4 damaging moves are found; the pool is large). Delete the name blacklist — it becomes redundant.

#### No physical/special split — special attackers are structurally gutted

`HIGH` · `design-flaw` · effort **M** · — *Grace Liu*

computeStats (battle.js:35-43) derives only atk from base Attack and def from base Defense; every move, regardless of damage_class, uses attacker.atk vs defender.def (battle.js:430). Alakazam (base Atk 50), Gengar (65) and Starmie (75) — who are gym leader ACES in gymdata.js (Luna's Alakazam #65 lin

**Fix:** Add spAtk/spDef to computeStats (same formula), keep each move's damage_class from getMove, and in performAttack select atk/def vs spAtk/spDef by the move's class. ~10 lines; no new fetches, no cache invalidation needed beyond a version bump.

#### Explosion/Self-Destruct are free 250-power nukes the smart AI will spam

`HIGH` · `bug` · effort **S** · — *Grace Liu*

Move power is uncapped and self-KO recoil is unimplemented, so Explosion (250) and Self-Destruct (200) are strictly-best moves with zero drawback. Worse, the trainer AI's 70% branch sorts by multiplier THEN raw power (battle.js:396-399), so whenever multipliers tie it deterministically selects Explo

**Fix:** Cheapest fix: clamp move power to ~120 in buildFighter (Math.min(mData.power, 120)) and exclude the self-KO move names (explosion, self-destruct, misty-explosion). Purist fix: implement the recharge/self-KO drawbacks — but for this audience the clamp is the ri

#### Capture-all-on-gym-win bulk-deposits 21% of the dex as text lines and obsoletes the raisin

`HIGH` · `design-flaw` · effort **M** · — *OSCAR PENA*

battle.js:550-557 loops the beaten trainer's whole team through recordCatch. Modeled across gymdata.js: 58 trainers grant 164 mons, 140 unique species — 21.6% of the 649 dex — averaging 2.83 species per win, delivered as a joined string in the victory modal ('#006 Lv53 · ...') with none of the ball-

**Fix:** Replace capture-all with 'pick ONE Pokémon from their team to keep' — a real choice, a real ceremony (show the three, let him tap one, play the catch animation), 3x less flood — and cap its join level at your lead's level so raised mons stay relevant.

#### 52% of the dex (336 species) is unreachable through any play system

`HIGH` · `missed-opportunity` · effort **M** · — *OSCAR PENA*

Computed from the data files: habitat pools (explore.js:10-51) cover 280 unique species, gym rosters (gymdata.js) cover 140, union 313. The remaining 336 of 649 — overwhelmingly Gens 3-5, which config.js:9-15 explicitly celebrates with PC Box tabs — exist ONLY via the ungated dex-browser catch. So e

**Fix:** Add 4-6 Gen 3-5 habitats (Hoenn Coast, Sinnoh Peaks, Unova City) reusing the existing habitat-card UI, or a rotating daily 'MIGRATION!' pool that cycles unreachable species through existing habitats — the data change is just more id arrays.

#### doSwitch re-enables move buttons mid-switch: button-mashing fires overlapping turns

`HIGH` · `bug` · effort **S** · — *Ines Schultz*

doSwitch (battle.js:353-388) never sets battleState.busy. It calls enableMoves(false) - but then renderActive() at line 376 rebuilds #battle-moves via innerHTML with fresh, NON-disabled buttons, before the two 800ms sleeps and the opponent's free hit (line 382). During that ~2s window busy=false, is

**Fix:** Set battleState.busy=true at the top of doSwitch and clear it at the end (the executeTurn guard then holds); or make renderActive render buttons disabled and only enableMoves(true) explicitly. Same audit for the busy=false-before-await-checkFaints ordering at 

#### Inverted dependency: the battle engine imports UI screens (gym.js, pc.js), which is what f

`HIGH` · `design-flaw` · effort **M** · — *Ines Schultz*

battle.js:12-14 imports openPC from pc.js and gymRun/clearGymRun/recordGymWin from gym.js - the engine depends on two screen modules. That is the only reason gym.js and pc.js cannot import battle.js directly and must instead dispatch 'gym-challenge', 'team-confirmed', 'pc-battle-cancelled', 'versus-

**Fix:** Extract gymRun/clearGymRun/recordGymWin into a DOM-free gymstate.js (alongside gymdata.js), and replace the openPC('team') call with a dispatched event or a callback passed at init. battle.js then imports only leaves; gym.js and pc.js may import battle.js dire

#### Versus mode is a second, parallel turn engine that aliases Player 2 onto battleState.wild

`HIGH` · `design-flaw` · effort **L** · — *Ines Schultz*

Lines 797-976 (~180 lines, a fifth of the file) reimplement turn order (versusRound), faint handling (executeVersusMove lines 923-934 vs checkFaints), forced replacement (versusNextMon vs openSwitchModal/doSwitch), and rendering (renderVersusSide/renderVersusMoves vs renderActive/renderEnemy) - all 

**Fix:** Make the core loop side-symmetric: a side = { ids, loaded, activeIdx, controller: 'human'|'ai', ownerPlayer }. executeTurn, checkFaints, and switching operate on side objects; versus becomes 'two human controllers plus a pass-device hook', deleting ~150 lines.

#### doSwitch re-enables move buttons before the opponent's free hit resolves — concurrent turn

`HIGH` · `bug` · effort **S** · — *MARCUS WEBB*

doSwitch (battle.js:373-388) never sets battleState.busy, and renderActive() at line 376 rebuilds the move grid with fresh, enabled buttons (renderActive's template has no disabled attribute, and enableMoves(true) hasn't run yet — innerHTML replacement discards the earlier enableMoves(false)). Durin

**Fix:** Set battleState.busy = true at the top of doSwitch and clear it only after the free-hit/checkFaints completes; make renderActive render buttons disabled by default and let enableMoves(true) be the single unlock. Kids mash buttons — assume every await is a re-e

#### Versus mode is impersonated through misnamed state: P2 lives in battleState.wild with orig

`HIGH` · `design-flaw` · effort **L** · — *Yuki Tanaka*

startVersusBattle maps side 2 onto the engine's wild slot and sets battleState.origin='gym' purely so exit routes back to the gym screen — the comment admits it (battle.js:828 "exits back to the gym screen", 842-846). versus.sides[1].loaded is aliased to battleState.loaded by reference. Every future

**Fix:** Rename the slots to role-neutral names (e.g. `allySide`/`foeSide` with a `mode: 'wild'|'trainer'|'versus'` discriminant) and give origin its real value ('versus') with an explicit returnTo field. Mechanical rename, big trap removed.

#### Two ball tables and two catch formulas — tuning one silently desyncs the other

`HIGH` · `tech-debt` · effort **M** · — *Yuki Tanaka*

Ball modifiers exist twice: the BALLS array in battle.js:645-650 and hardcoded data-mod attributes in index.html:82-85. Worse, the catch math exists twice and already disagrees: dex catching uses `(baseRate * ballModifier) / 255` with no HP factor (catch.js:77-79), battle catching uses the HP-scaled

**Fix:** Move BALLS, catchChance, and the XP formula into config.js as the single source; render the index.html ball drawer from the BALLS array at boot instead of hardcoding data-mod.

#### Service worker version bump nukes the entire sprite/artwork/API asset cache

`HIGH` · `bug` · effort **S** · — *Rosa Jimenez*

sw.js:12-14 derives ASSET_CACHE from CACHE_VERSION, and the activate handler (sw.js:35) deletes every cache whose key doesn't start with the new version — including 'pokedexos-v18.1.0-assets'. That cache holds every pixel sprite, animated GIF, and 300KB+ official-artwork PNG the boys have accumulate

**Fix:** Decouple the asset cache from the release version (e.g. const ASSET_CACHE = 'pokedexos-assets-v1') and only purge caches matching the shell prefix on activate. Sprites are immutable content-addressed files — they should survive every app update. Optionally add

#### PC ALL view rebuilds ~4,000 DOM nodes and attaches 649 listeners on every keystroke

`HIGH` · `design-flaw` · effort **M** · — *Rosa Jimenez*

renderGrid (pc.js:114-136) string-builds up to 649 tiles (each div + img + span + up to 3 more elements ≈ 4,000 nodes), assigns innerHTML, then loops querySelectorAll('.pc-item') attaching an individual click listener per tile. onPCSearchInput (pc.js:138-140) calls it with no debounce, and an active

**Fix:** Attach ONE delegated click listener on #pc-grid at init (e.target.closest('[data-pc-id]')) — deletes 649 addEventListener calls per render for ~10 lines. Convert player().caught and teamPick to Sets before the loop. Debounce search input ~150ms. For team-pick 

#### A cold Champion battle costs ~66 API requests across up to 10 mid-battle loading stalls

`HIGH` · `design-flaw` · effort **S** · — *Abel Girma, network engineer*

Cold-cache buildFighter (battle.js:45-76) = 1 pokemon + 1 species (wild side) + 4 moves. Gym leader fight (3 mons, gymdata.js): 3x6 enemy + 5 player = ~23 PokeAPI requests. CHAMPION REX (6 mons, gymdata.js:128) with full 6-mon switching: 36 + 30 = ~66 requests. Worse than the count is the placement:

**Fix:** The full enemy roster is known at startTrainerBattle (def.team). Kick off Promise.all(def.team.map(buildEnemy)) fire-and-forget right after the first enemy resolves — subsequent KO transitions become cache hits. Same for the player team: warm remaining teamIds

#### Random 4-of-N move sampling defeats the move cache — moves are refetched nearly every batt

`HIGH` · `design-flaw` · effort **M** · — *Abel Girma, network engineer*

battle.js:56-58 shuffles the mon's full move list (often 80-100+ moves for popular mons) and picks 4 at random, so each battle requests ~4 mostly-new move URLs; the cache converges only after dozens of battles per mon. Compounding it, the quota-overflow handler (api.js:17) evicts exactly the move: e

**Fix:** Ship a static moves.json in the repo: ~650 Gen 1-5 moves, and slimMove keeps only {name, power, type, damage_class} (api.js:74-76) — roughly 25KB, one shell-cached file. getMove becomes a synchronous lookup and 4-per-fighter network requests drop to zero perma

#### Sprite URLs pinned to mutable 'master' branch of PokeAPI/sprites with no error fallback

`HIGH` · `design-flaw` · effort **S** · — *Chloe Dubois*

config.js:17 uses raw.githubusercontent.com/PokeAPI/sprites/master/... — 'master' is a moving target with no availability or path-stability guarantee (PokeAPI has reorganized sprite paths before), and raw.githubusercontent is explicitly not a CDN: it rate-limits (429s) and can throttle hot files. No

**Fix:** Pin SPRITE_BASE to a commit SHA (immutable, safely cacheable forever) and add a delegated error handler that swaps failed sprites to the local poke-ball placeholder: document.addEventListener('error', e => { if (e.target.tagName==='IMG') e.target.src='...'; },

#### Shell cache poisoning: non-OK and captive-portal responses overwrite good cached shell fil

`HIGH` · `bug` · effort **S** · — *Niko Virtanen*

sw.js:51-54 unconditionally `cache.put()`s every same-origin response into SHELL_CACHE with no `resp.ok` check. Two real scenarios: (1) GitHub Pages briefly 404s files mid-deploy — the 404 replaces the good cached main.js and gets served on the next offline launch; (2) hotel/plane captive portals re

**Fix:** Guard the put: only cache when `resp.ok && resp.status === 200`. For captive-portal defense on index.html, additionally sanity-check `resp.headers.get('content-type')` matches the request destination (a JS request answered with text/html is a portal).

#### Dex gallery crossfades pixel sprites into smooth official artwork every 4 seconds

`HIGH` · `design-flaw` · effort **S** · — *Pixel Pete Ramirez*

dex.js:163-178 (setupGallerySafe) alternates the Gen-V animated pixel sprite with PokeAPI 'official-artwork' (475px smooth vector-style renders) on a 4s timer, using an opacity/scale tween that rides main.css:39's cubic-bezier transition. Worse, the global `img { image-rendering: pixelated }` (gba.c

**Fix:** Pick one language for the hero: keep only animated/front_default pixel sprites in the cycle (delete `sp.official` from the imgs array), or if the artwork frame stays, exempt it with `image-rendering: auto` on a class and swap frames with a steps(2) flick or th

#### Press Start 2P rendered at 5-7px shatters the font's own pixel grid and is illegible for k

`HIGH` · `design-flaw` · effort **S** · — *Pixel Pete Ramirez*

Press Start 2P is drawn on an 8px grid; gba.css sets it at 5px (.card-badge small :417, .pc-name :587, .team-strip-label small :600), 6px (ball-opt small :132, ball-count :133, type-badge :233, pc-lvl :310, dev-status :541) and 7px in a dozen more places. Non-multiple sizes force fractional downscal

**Fix:** Enforce an 8px-grid type scale: 8px minimum everywhere, 16px for emphasis. Where 8px doesn't fit (pc-grid names, badge labels), drop the label and let the sprite carry meaning, or truncate harder — never shrink the font below 8px.

#### Parent Tools PIN gate is built entirely on prompt()/alert(), which are unreliable in iOS s

`HIGH` · `design-flaw` · effort **M** · — *Sarah Oduya*

js/devtools.js requirePin() (~lines 176-190) uses prompt() to set and verify the PIN. It is invoked from a setTimeout inside the 1200ms hold-to-open gate (wireHoldToOpen), i.e. NOT synchronously within a user gesture. iOS home-screen (standalone) web apps have a long history of suppressing window.pr

**Fix:** The app already has a complete overlay-modal system (settings-modal, badge-modal, sparkle-modal). Build one reusable in-game dialog (text + optional input + OK/CANCEL) and replace every prompt()/alert() call: PIN entry becomes a 4-digit keypad modal, nickname 

#### AudioContext never recovers from iOS 'interrupted' state — game goes silent after backgrou

`HIGH` · `bug` · effort **S** · — *Sarah Oduya*

Both js/audio.js:24 (initAudio) and js/music.js:60 (ensureCtx) only call resume() when state === 'suspended', and initAudio() is only ever called once at boot (js/main.js startApp). On iOS, backgrounding the PWA, a Siri activation, a phone call, or the kid flipping to YouTube puts the AudioContext i

**Fix:** Add a visibilitychange/focus listener that calls resume() on both contexts whenever state !== 'running' (covering 'interrupted'), and also opportunistically resume at the top of playBeep/blip. Better: merge the two AudioContexts (audio.js and music.js each cre

#### Attacks have zero attacker motion and no hit-stop — impact appears from nowhere

`HIGH` · `design-flaw` · effort **M** · — *JUN PARK*

performAttack (js/battle.js:424-461) is: logMsg('X used Y!') → sleep(900) of totally static sprites → damage pop + flash + particles all fire on the defender simultaneously. The attacker never lunges, recoils, or even pauses its idle float. Then up to two more 900ms text sleeps stack before the next

**Fix:** Add a 3-beat impact grammar: (1) attacker lunge — a 150ms keyframe translating ~24px toward the defender (player: up-right, wild: down-left) triggered right after the move text; (2) 80-100ms hit-stop — set animation-play-state:paused on both sprites (or add a 

#### No faint animation and no entry animations — the two biggest payoff moments are sprite src

`HIGH` · `missed-opportunity` · effort **M** · — *JUN PARK*

On faint, the sprite just stands there floating while text says 'FAINTED!' and the phone vibrates (js/battle.js:468-471, 505, 738) — the defeated mon never drops, tips, or leaves the screen. On battle start and gym enemy swap, renderEnemy/renderActive simply assign img.src (js/battle.js:275, 312, 52

**Fix:** Faint: one keyframe — squash to scaleY(0.85), then translateY(120%) with grayscale+fade over ~500ms, steps(5) to stay on-brand — plus a descending sfx. Entry: wild slides in from the right (translateX(60px)→0, steps(4)); player mon appears via the existing thr

#### Fourteen text styles set Press Start 2P below its 8px bitmap grid — 5-7px text is decorati

`HIGH` · `design-flaw` · effort **M** · — *Freya Lindqvist*

Press Start 2P is a bitmap-derived face designed for exact multiples of 8px; below that, stems render at sub-pixel fractions and counters fill in. The codebase has a whole sub-8px underclass: .pc-name at 5px (gba.css:587), .card-badge small at 5px (:417), .team-strip-label small at 5px (:600), 6px o

**Fix:** Impose a hard floor: nothing in Press Start 2P below 8px. Where 5-6px was used to make text fit (badge names, ball sub-labels, PC names), cut the text instead of the size — e.g. drop '1.5x RATE' captions entirely (the ball icons + one word suffice), truncate P

#### White 6px type-badge text on light type colors fails contrast catastrophically (1.48:1 on 

`HIGH` · `bug` · effort **S** · — *Freya Lindqvist*

main.css:135 hardcodes .type-badge { color:#fff } while battle.js:279 and :887 inject background from typeColors (config.js:22). Computed ratios: white on electric #eed535 = 1.48:1, ground #f7de3f = 1.36:1, fairy #fdb9e9 = 1.58:1, grass #9bcc50 = 1.88:1, ice = 2.02:1 — all far below even the 3:1 lar

**Fix:** Pick text color per type by luminance: dark ink #24243a on light types (electric/grass/ice/fairy/ground clear 6.5-11:1 with ink — verified), white on dark types (ghost, dragon, fighting). One small helper in config.js next to typeColors, applied wherever a typ

#### Junior Mode TTS queues instead of interrupting — fast swiping builds a minutes-long name b

`HIGH` · `bug` · effort **S** · — *DINA HASSAN*

speak() in audio.js:72-82 never calls speechSynthesis.cancel(), and dex.js:138 speaks the Pokémon name on every loadPoke in Junior mode. speechSynthesis is a QUEUE: a 4-year-old swiping through 15 Pokémon (nav via touchend, main.js:86-95) enqueues 15 utterances that play back-to-back long after he's

**Fix:** In speak(), call window.speechSynthesis.cancel() before speechSynthesis.speak(utter) (or add an { interrupt: true } option used by the dex.js:138 call). One line; transforms Junior browsing from chaotic to responsive.

#### Level-up and faint — the two biggest emotional beats — have zero sound

`HIGH` · `missed-opportunity` · effort **S** · — *DINA HASSAN*

Level-ups exist only as text: battle.js:513 pushes '...grew to Lv...' into xpLines shown on the victory modal; addXp fires no jingle anywhere. Faints get only vibration: checkFaints battle.js:469-470 (player faint, [500]ms buzz), handleEnemyDown:506 and versus:928 ([100,100,100]/[300]) — no sfx call

**Fix:** Add sfx.faint (descending pitch sweep: osc.frequency.exponentialRampToValueAtTime from ~600Hz to ~80Hz over 0.5s — the classic GB faint) at all three faint sites, and sfx.levelUp (rising 4-note arpeggio, distinct from catch) fired from addXp or the ups>0 branc

#### Triangle bass is written an octave too low to be heard on the kids' actual speakers

`HIGH` · `design-flaw` · effort **S** · — *BEEP KOWALSKI, chiptune composer*

All four bass lines live in octave 1-2: E2=82Hz, D2/C2=65Hz, B1=62Hz (music.js:27-47). Phone and iPad speakers (this is an iOS PWA per main.js:179 comment) roll off steeply below ~200Hz, and a triangle wave has almost no harmonics to carry the pitch upward. On the boys' devices the entire bass chann

**Fix:** Transpose every bass note up one octave (E2→E3 etc. — pure data edit in TRACKS), or double each bass hit with a quiet square one octave up. A/B it on an actual iPad, not headphones.

#### SFX and cries are 15-24dB louder than the music — the score is subliminal

`HIGH` · `design-flaw` · effort **M** · — *BEEP KOWALSKI, chiptune composer*

Music voices peak at 0.028-0.052 gain (music.js:24-45) while sfx.hit/break/superHit fire at 0.3 (audio.js:47-49), shake at 0.2, and cries at 0.5 (audio.js:60). That's roughly a 20dB gap: every battle hit obliterates the battle theme, and during a cry the music might as well be off. Worse, music.js a

**Fix:** Merge to one AudioContext with musicBus and sfxBus GainNodes. Raise music to ~0.10-0.15, pull SFX to ~0.15-0.2, and duck musicBus by ~6dB while a cry or TTS line plays (a simple gain ramp on the shared bus).

#### Zero prefers-reduced-motion support across ~15 always-on animations, including full-screen

`HIGH` · `design-flaw` · effort **S** · — *CARLOS MENDES, WCAG auditor*

grep confirms no prefers-reduced-motion query exists in either stylesheet or any JS. Meanwhile: .battle-view.shake translates the entire viewport on every hit (gba.css:236-242, battle.js:235-238); #screen-wipe sweeps full-screen on every Pokémon load (gba.css:35-41, dex.js:34-37); #scanlines is a fi

**Fix:** Add one @media (prefers-reduced-motion: reduce) block that kills shake/wipe/float/rustle/ledBlink/badgeBounce and hides #scanlines, plus a matchMedia guard around classList.add('shake'). ~20 lines, honors the OS setting the devices already expose.

#### Half the interactive surface is click-only divs: invisible and inoperable for keyboard and

`HIGH` · `design-flaw` · effort **M** · — *CARLOS MENDES, WCAG auditor*

The four .ball-opt catch choices are divs (index.html:82-85, wired via click in main.js:151-152); .habitat-card (explore.js:71-78), .gym-card and .trainer-card (gym.js:92,119,131), .pc-item (pc.js:108,135), .team-slot (pc.js:55,62), .evo-item (dex.js:150-153), .switch-item and ballpick rows (battle.

**Fix:** Convert the templated divs to <button> (everything is fully restyled already, so button chrome is a non-issue) or add role='button' tabindex='0' + Enter/Space in the shared wiring helpers. Delete maximum-scale/user-scalable from the viewport meta.

#### Thirteen modals with no dialog semantics, no focus trapping, and no Escape handling

`HIGH` · `design-flaw` · effort **M** · — *CARLOS MENDES, WCAG auditor*

All .overlay-screen modals (switch, pass, ballpick, victory, evo, settings, dev, badge, card, sparkle, loading — index.html:178-325) plus #pc-modal open via style.display or classList with no role='dialog', no aria-modal, no focus move on open, no focus restore on close, and no Escape-to-close (the 

**Fix:** Give each modal role='dialog' aria-modal='true' and add one shared openModal()/closeModal() helper that saves document.activeElement, focuses the primary button, traps Tab, and closes on Escape. Every modal already routes through getElementById + style.display

#### Gen tabs are ~35x41px, seven abreast, with no Junior-mode enlargement

`HIGH` · `design-flaw` · effort **S** · — *Annika Berg*

css/gba.css 466-473: .gen-tab is font-size 8px, padding 7px 2px, 2px border, two stacked text lines — roughly 35px tall — and flex:1 across 6-7 tabs plus ALL inside #pc-modal's 20px padding, so on a 375px phone each tab is ~41px wide with 6px gaps. That is under the 44px WCAG 2.5.8/child-HCI floor o

**Fix:** Add body.junior #gen-tabs rules: two rows (flex-wrap) of tabs at min 48px height, 12px font; or in Junior mode replace tabs entirely with big < GEN > paddle buttons. In normal mode, raise padding to 12px vertical and drop max-width:76px so tabs use the full ro

#### 24px dev-mini delete button sits 4px from +/- and removes a Pokémon instantly, no confirm,

`HIGH` · `bug` · effort **S** · — *Annika Berg*

css/gba.css 557-563: .dev-mini is min-width 24px, padding 5px 3px (~24x26px) with 4px gaps in each .dev-row; the red ✕ (danger) is immediately adjacent to the + level button. js/devtools.js 100-108: removeMon() fires on a single click, deletes the mon from caught, team, and mons, and persists immedi

**Fix:** Two-tap arm-then-confirm on ✕ (first tap turns it into 'SURE?' for 3s), or a 5-second undo toast via setStatus. Also widen dev-mini to 40px min and move ✕ to the far edge with a 12px margin-left gap.

#### Zero unit coverage of the pure game math the whole game balances on

`HIGH` · `design-flaw` · effort **S** · — *Victor Hugo Santos*

Every number a kid feels is computed in pure, Node-importable functions with no tests: damage formula + STAB + crit + sparkle 2x + junior half-damage floor (battle.js:430-445), catchChance with its 3% floor and HP factor (battle.js:631-638), computeStats (battle.js:35-43), addXp/xpThreshold/evolveMo

**Fix:** Add node --test (zero new deps) with table-driven tests: typeChart round-trip against a known-good matchup table; addXp boundary cases (exact threshold, multi-level jump, Lv100 cap); evolveMon team-slot replacement; catchChance invariants (junior always 1, mas

#### Two divergent catch formulas, neither under test

`HIGH` · `bug` · effort **S** · — *Victor Hugo Santos*

Dex-side executeCatch uses (capture_rate * ballMod)/255 with NO floor and NO HP factor (catch.js:77-79), while battle-side catchChance adds an HP factor and clamps to [0.03, 0.95] (battle.js:631-638). For a legendary (capture_rate 3), a dex poke-ball is a 1.2% chance with no floor — a non-junior kid

**Fix:** Extract one catchProbability(captureRate, ballMod, {hpFrac, junior}) into a pure module, call it from both catch.js and battle.js, and pin its invariants (floor, junior=1, monotonic in ballMod) with unit tests. Decide deliberately whether the dex path should s

#### ESCAPE button is live mid-turn — orphaned async battle loop can crash or contaminate the n

`HIGH` · `bug` · effort **M** · — *MEI CHEN*

escape-btn sits in the battle header (index.html:131) wired directly to exitBattleMode (main.js:118), which has no isBattling/busy guard (battle.js:79-97). Tap ESCAPE during performAttack's ~2s of awaited sleeps: exitBattleMode wipes loaded={} but NOT battleState.wild, and the in-flight executeTurn 

**Fix:** Add a battle generation counter: increment it in exitBattleMode and every launch; capture it at the top of executeTurn/doSwitch/executeBallThrow/handleEnemyDown and bail after every await if stale. Disable escape-btn while busy. Add ballpick-modal and pass-mod

#### Voluntary switch never sets busy and re-enables fresh move buttons — double-turn race duri

`HIGH` · `bug` · effort **S** · — *MEI CHEN*

doSwitch (battle.js:353-388) disables moves, but then renderActive() at line 376 rebuilds #battle-moves via innerHTML — brand-new buttons are enabled by default — while busy is still false (doSwitch never sets it). During the following ~2.2s (sleep(800) + the opponent's free performAttack), a kid ta

**Fix:** Set battleState.busy = true as the first line of doSwitch and clear it at the end; call enableMoves(false) immediately after renderActive(). Same pattern for the forced-switch branch.

#### versusActive is never cleared on escape or defeat exits — silently disables the 4-year-old

`HIGH` · `bug` · effort **S** · — *MEI CHEN*

Only vs-quit-btn (battle.js:892) and versusMatchOver (battle.js:964) reset battleState.versusActive. exitBattleMode (battle.js:79-97) does not. So: kids play a VS match, someone taps the header ESCAPE instead of END MATCH → versusActive stays true for the rest of the session. Every subsequent wild/g

**Fix:** Reset battleState.versusActive = false inside exitBattleMode alongside trainer/canCatch. One line.

#### Corrupt or future-version saves are silently discarded and then overwritten forever

`HIGH` · `design-flaw` · effort **S** · — *PAUL NDIAYE, save-integrity auditor*

loadSave (state.js:87-96) has two destructive paths: (a) JSON.parse throws → console.warn, fresh save, and the first persist() of the session (any catch, toggle, or name edit) overwrites the possibly-90%-recoverable corrupt blob; (b) raw.version !== 2 — e.g. a future v3 save opened by a cached old b

**Fix:** On parse failure or unknown version, copy the raw string to pokedexos_save_quarantine before doing anything else, and accept version >= 2 through hydratePlayer (its spread already preserves unknown fields, so a v3 save survives a v2 round-trip). Surface 'a dam

#### hydratePlayer validates container types only — imported element garbage reaches gameplay a

`HIGH` · `bug` · effort **M** · — *PAUL NDIAYE, save-integrity auditor*

state.js:52-64 checks Array.isArray/typeof object but never element types or ranges, and the importCode legacy branch (state.js:204-205) lacks even the Number.isInteger filter that migrateLegacy has. From one garbled/malicious code: caught can hold floats, strings, or id 99999 (broken sprites, count

**Fix:** Make hydratePlayer a real schema pass: caught/team/shinies filtered to integers 1..MAX_POKEMON and deduped; mons values coerced to {level: clamped int 1-100, xp: finite number >= 0}; nicks and name re-run through the same slice(0,12) sanitizer used by setNick;

#### persist() fails silently under quota pressure the cache itself creates — hours of play can

`HIGH` · `bug` · effort **S** · — *PAUL NDIAYE, save-integrity auditor*

api.js's header still claims '151 Pokémon ≈ 450KB' but config.js:5 says MAX_POKEMON = 649, and getPokemon (api.js:129-130) double-stores every name-based lookup under both pkmn:name and pkmn:id keys, plus species/evo entries keyed by full URLs and a move cache — realistically several MB against Safa

**Fix:** On persist() catch: removeItem(CACHE_KEY) and retry the save (the cache is rebuildable, the save is not); if the retry also fails, show a persistent in-game banner ('SAVING BROKEN — TELL DAD'). Also dedupe the name/id cache keys and fix the stale capacity comm

#### Imported caught/team arrays aren't integer-validated, injecting XSS through id sinks

`HIGH` · `bug` · effort **S** · — *Tanya Blackwood*

hydratePlayer accepts caught/team as any array: `caught: Array.isArray(raw.caught) ? raw.caught : []` and `team: Array.isArray(raw.team) ? raw.team : []` (state.js:61-62) — no Number.isInteger filter, unlike migrateLegacy which DOES filter (state.js:37). Non-integer entries survive import and reach 

**Fix:** Filter caught and team through `.filter(Number.isInteger)` (and range-clamp to 1..MAX_POKEMON) inside hydratePlayer, matching what migrateLegacy already does. This closes the vector regardless of whether escaping lands.

#### Parent-Tools PIN stored and compared in plaintext localStorage

`HIGH` · `design-flaw` · effort **M** · — *Tanya Blackwood*

The PIN is written and checked as cleartext under a guessable key: `localStorage.setItem('pokedexos_devpin', pin.trim())` and `entry.trim() === stored` (devtools.js:174-190). Any cousin who opens DevTools console and types `localStorage.pokedexos_devpin` reads the parent's PIN instantly — and since 

**Fix:** Store a salted hash (SHA-256 via SubtleCrypto with a random per-install salt) instead of the raw PIN, and compare hashes. Rename the key to something less self-documenting. Accept that this is deterrence-grade only and frame it as such in the parent-facing cop

#### Timeout, 404, offline, and 5xx are all shown as the same error — and nothing ever retries

`HIGH` · `design-flaw` · effort **M** · — *LUCIA MORETTI*

apiFetch (api.js:29) throws a generic Error('API_ERROR') for any non-ok status, an AbortError for timeout, and a TypeError when offline. loadPoke's catch (dex.js:88-94) collapses all three into 'ERROR / TIMEOUT — API Server issue or Pokémon not found. Try again.' A 7-year-old who typo'd a name gets 

**Fix:** In apiFetch, classify errors: response.status===404 → NOT_FOUND ('No Pokémon by that name — check the spelling!'), e.name==='AbortError' → TIMEOUT, !navigator.onLine → OFFLINE ('No internet — ask a grown-up!'), else SERVER. Add one automatic retry with ~1s bac

#### Rapid dex navigation has a stale-response race and fires redundant bursts at PokeAPI

`HIGH` · `bug` · effort **S** · — *LUCIA MORETTI*

loadPoke (dex.js:63-105) has no request-generation guard, and cached() (api.js:95-101) memoizes the resolved value, not the in-flight promise. Holding the next-arrow through uncached territory fires one uncancelled fetch per tap (a burst against PokeAPI from a button-mashing 4-year-old), and whichev

**Fix:** Two small fixes: (1) a monotonic token in loadPoke — capture const seq = ++loadSeq at entry, bail out of the UI update if seq !== loadSeq after each await; (2) make cached() store the promise in an in-flight map so concurrent same-key calls share one request. 

#### Every version bump deletes the entire sprite/asset cache

`HIGH` · `bug` · effort **S** · — *Henrik Larsen*

ASSET_CACHE embeds the release version ('pokedexos-v18.2.0-assets', sw.js:12-14), and the activate handler deletes every cache not starting with the current CACHE_VERSION (sw.js:35). So the ship-a-release ritual (CHANGELOG shows v17→v18→v18.1→v18.2 in quick succession) wipes all accumulated sprites,

**Fix:** Rename to a version-independent 'pokedexos-assets' and change the activate filter to delete only caches matching the shell prefix (e.g. keys.filter(k => k.endsWith('-shell') && !k.startsWith(CACHE_VERSION))). Sprites and API JSON are immutable; they should nev

#### Network-first shell has no timeout — flaky cell service hangs the whole game

`HIGH` · `bug` · effort **S** · — *Henrik Larsen*

sw.js:49-56 awaits fetch() with no deadline before falling back to cache. In true airplane mode fetch rejects fast, so this works. But the real road-trip condition is one flickering bar of LTE, where a stalled fetch can hang 30-60s per request — and this applies to index.html AND all 17 JS/CSS files

**Fix:** Race the network against a ~2.5s timer: Promise.race([fetch(req), timeout(2500)]).catch(() => caches.match(req)) — or switch the shell to stale-while-revalidate, which still delivers the iOS-update goal one launch later while making boot instant always.

#### Two rival badge/gym systems that never talk to each other

`HIGH` · `design-flaw` · effort **M** · — *JORDAN AVERY*

The 8 badges (progression.js:12-21) are stat milestones ('Catch 3 Pokémon', 'Win 3 battles') from the v17 era. The v18 Gym Circuit — 58 trainers, 10 themed gyms, Elite Four, Champion — awards ZERO badges: recordGymWin (gym.js:150-154) just sets a boolean and battle.js:559 checks circuit completion. 

**Fix:** Fuse them: each of the 11 gym-leader defeats awards that gym's badge + 1 Master Ball via a check in recordGymWin, rendered on the trainer card (progression.js:149-152 already renders from BADGES — extend the array with a gymKey check like p.gyms.beaten['rock:4

#### Legacy dex-screen catch bypasses the entire progression economy

`HIGH` · `design-flaw` · effort **M** · — *JORDAN AVERY*

catch.js:74-80 rolls capture_rate × ballModifier with unlimited free Poké/Great/Ultra Balls (only Master Balls are scarce, catch.js:46). A non-junior kid can sit on Mewtwo's dex page and spam free Ultra Balls (2.35%/throw, no cost, no cooldown) until it lands — no battle, no weakening, no exploring.

**Fix:** For non-junior players, make the dex CATCH button start a wild battle against that Pokémon (startWildEncounter(state.curId) already exists in battle.js:166) instead of a raw throw. Keep the instant tap-to-catch exclusively as Junior mode's path — it is perfect

#### Sparkle power is locked behind near-unreachable odds — a de facto feature removal

`HIGH` · `missed-opportunity` · effort **S** · — *JORDAN AVERY*

Sparkle (200% damage, a headline README feature the boys already knew from v15) now requires hasShiny(leadId) — the shiny of your CURRENT LEAD's exact species (battle.js:110-117), and shinies only spawn in battles at 1-in-50 (battle.js:125), only for the species the encounter happened to roll. Expec

**Fix:** Unlock sparkle account-wide after the FIRST shiny catch (p.shinies.length > 0) — one-line change to battle.js:110 — keeping shiny hunting exciting (each shiny is still a trophy with its ✨ PC badge) without holding a v15 feature hostage. Optionally keep per-spe

#### One localStorage key, no backup: a single bad write or version mismatch silently erases bo

`HIGH` · `bug` · effort **S** · — *NADIA REZAI*

loadSave (state.js:87-96) starts a fresh save whenever the stored blob fails to parse OR has version !== 2 — then the very next recordCatch/persist() overwrites the old data permanently under the same key. Failure scenarios that end in a 7-year-old's 200-catch save vanishing: a future v3 schema ship

**Fix:** Before any persist() that follows a fresh-save load, stash the old raw blob to pokedexos_save_backup with a timestamp; keep a small rolling ring (3-5 snapshots, e.g. on first load per day). Add a 'RESTORE SAVE' button in Parent Tools. On unknown version, go re

#### The entire test suite is one 564-line order-dependent script — it will go flaky, then get 

`HIGH` · `tech-debt` · effort **M** · — *NADIA REZAI*

smoke.mjs is a single serial journey where every check depends on the mutated state of all previous checks (the gym test at line 484 requires the Lv80 seed at 454; the versus test at 523 requires the gym run's save). It steers RNG by globally monkey-patching Math.random (smoke.mjs:196, 490) and sync

**Fix:** Split into independent scenario files (dex/catch, battle, gym, versus, junior, save-migration) that each boot from an explicit seeded localStorage fixture, sharing the mock-route module. Replace Math.random patching with an injectable RNG hook on window (windo

#### Next month's biggest risk is the roadmap itself — do NOT add online/sync, trading, more ge

`HIGH` · `missed-opportunity` · effort **S** · — *NADIA REZAI*

The CHANGELOG shows five major systems shipped in ~two weeks (Junior Mode 16.4 → National Dex 17.0 → Parent Tools 17.1 → Battle-to-catch 18.0 → 58-trainer Gym Circuit 18.1 → Shinies/Versus/Nicknames 18.2). Each release already leans on the previous one's flags (versus reuses gym's origin, shinies ho

**Fix:** Declare next month a stabilization release (v19 'invisible update'): findings 1-4 only, zero player-facing systems. Explicitly defer online anything, trading, new generations, and new battle mechanics until the battle core is extracted and save backups exist. 

#### Daily quests roll over at UTC midnight, killing the morning 'new quests!' moment

`HIGH` · `bug` · effort **S** · — *Felix Brandt*

progression.js:37 todayNumber() = Math.floor(Date.now()/86400000) — a UTC day boundary. For a US household that means quests reset around 5-8pm LOCAL time. A kid who plays after dinner and sweeps all 3 quests wakes up the next morning to the SAME completed quest list (nothing new until evening), and

**Fix:** Compute the day number in local time (e.g. use a YYYY-MM-DD string from new Date(), or subtract getTimezoneOffset()*60000 before dividing). Keep the existing seed formula so sibling-divergent quests still work.

#### Daily quests are invisible unless the kid taps the CARD button

`HIGH` · `design-flaw` · effort **M** · — *Felix Brandt*

Quests render only inside the Trainer Card modal (progression.js:165-171, index.html:76/298). initProgression() calls ensureDailyQuests() at boot but nothing announces 'NEW QUESTS TODAY!', no dot/badge on the CARD button, no progress toast while playing (a kid catching their 2nd Pokémon gets no '1/2

**Fix:** On first open of a new quest day, fire the existing celebration queue with an Oak greeting listing today's 3 quests (emoji-first for Junior: 🎣x2, ⚔️x1, 🌊x1); put a pulsing dot on the CARD button while any quest is unfinished; show a small toast ('QUEST 1/2!') 

#### No streak or any cross-day memory — day 40 is mechanically identical to day 2

`HIGH` · `missed-opportunity` · effort **M** · — *Felix Brandt*

freshPlayer() (state.js:10-24) stores no lastPlayedDay, no streak counter, and bumpQuests (progression.js:100-130) discards yesterday entirely. The only daily-loop payoff is +1 Master Ball for the all-done sweep (progression.js:126), and badges are one-shot thresholds that dry up around 50 catches /

**Fix:** Add {lastDay, streak, bestStreak} to the save; show a flame/chain on the Trainer Card; make the all-quests reward scale gently with streak (day 3: +1 extra ball, day 5: guaranteed-rare next explore). Use kid-safe 'streak insurance' — a missed day drops the str

#### Becoming Champion changes literally nothing — one modal line, then the game forgets

`HIGH` · `design-flaw` · effort **S** · — *AMARA OSEI*

The entire post-Champion state is battle.js:568: `if (circuitDone) lines.push('👑 YOU BEAT THE ENTIRE GYM CIRCUIT!...')` appended to the standard victory modal. recordGymWin (js/gym.js:150-154) returns the completion bool but no champion flag is ever persisted — freshPlayer (js/state.js:10-24) has no

**Fix:** Persist `champion: {date, team: [...6 ids+levels]}` on the win. Gold-frame the trainer card, change Oak's dialogue permanently, show the Hall-of-Fame team (the exact six that won) on a new card section, and retitle the gym screen 'CHAMPION'S CIRCUIT'. Two hour

#### All 58 hand-crafted trainers become permanently unclickable dead UI after one win

`HIGH` · `missed-opportunity` · effort **M** · — *AMARA OSEI*

js/gym.js:130 binds click handlers only to `.trainer-card:not(.locked):not(.beaten)` — a beaten trainer can never be fought again, ever. Combined with capture-all rewards (battle.js:550-557) already being banked, the game's largest content investment (58 trainers, 10 themed gyms, Victory Road, Elite

**Fix:** Add 'ROUND 2' rematches unlocked by the champion flag: reuse GYMS verbatim but recompute levels with lv2=(g,i)=>50+g*4+... via the existing lv() pattern (gymdata.js:9), retitle leaders ('LEADER ROCKO ★'), and track beaten state under trainerKey(gym.key,i)+':r2

#### The 'smart' AI maximizes the wrong quantity — it teaches the type chart backwards

`HIGH` · `bug` · effort **S** · — *Sofia Rossi — AI-behavior designer (opponent AI, difficulty curves, felt fairness)*

`pickEnemyMove` sorts by `(mb - ma) || (b.power - a.power)` (battle.js:396-399): multiplier first, power only as tiebreak, STAB ignored entirely even though `performAttack` applies it at line 434. Worked example at Lv80: a 2x / 40-power / non-STAB move deals 90.4; a 1x / 120-power / STAB move deals 197.5. The AI confidently picks the 90. The log then prints "It's super effective!" (battle.js:456) with screen shake and a super-styled damage pop — attached to a hit that did LESS than a plain one. For a 7-year-old using this game to learn the type chart, that is active mis-teaching: the loudest feedback in the game is decorrelated from actual harm. Compounding it, `power: mData.power || 40` (battle.js:62) gives every status move a 40-power attack profile, and status moves have the widest odd-type coverage (confuse-ray/ghost, thunder-wave/electric, will-o-wisp/fire), so multiplier-first sorting actively prefers these fake attacks. `damage_class` is already fetched (api.js:75) and never used.

**Fix:** Sort by expected damage: `(m.power||40) * getTypeMultiplier(m.type, target.types) * (attackerHasType(m.type) ? 1.5 : 1)`. Then the 'super effective' banner only fires on hits that genuinely hurt. Separately, filter `damage_class === 'status'` out of the pool in buildFighter instead of the four hardcoded names at battle.js:56 — no more Lv8 Geodude 'attacking' with Defense Curl.

#### Movesets are re-rolled every battle, so the AI can plan and the child cannot

`HIGH` · `design-flaw` · effort **M** · — *Sofia Rossi — AI-behavior designer (opponent AI, difficulty curves, felt fairness)*

`buildFighter` shuffles the entire learnset and slices 4 (battle.js:56-58) on every construction — every battle, and again on every mid-battle switch-in (battle.js:360). The boys' Charizard has different moves each fight, and moves are not level-gated (a Lv8 starter or a Lv8 gym mon can roll a 150-power finisher). Against this, `pickEnemyMove` plays near-optimally within ITS roll. The asymmetry: the opponent always makes the best use of its random hand; the child cannot even memorise his own. Every skill this game could teach — 'my water move beats the rock gym', 'save the big move' — is structurally unlearnable, and the same Lv8 trainer is trivial or lethal depending on two invisible shuffles, which reads to a child as the game being moody rather than hard.

**Fix:** Seed the shuffle deterministically per (pokemonId, level) so a Pokémon's four moves are identical every time it is sent out, cache them on the mon record, and filter candidates to roughly `power <= 40 + level*1.2` so Lv8 fights use Lv8-scale moves. Reveal enemy moves in the gym roster preview once seen — a 7-year-old remembering 'ROCKO's Onix has Rock Slide' is exactly the mastery this ladder should sell.

#### Junior mode faces the identical champion-grade AI — the 4-year-old is immortal but permanently pinned at 1 HP

`HIGH` · `design-flaw` · effort **S** · — *Sofia Rossi — AI-behavior designer (opponent AI, difficulty curves, felt fairness)*

`pickEnemyMove` branches only on `battleState.trainer` (battle.js:394); there is no Junior branch anywhere in the AI. The Junior shield (battle.js:441-443) halves damage and floors HP at 1, but a super-effective STAB hit is 125-176% of maxHp at Lv8 — halved, still ~63-88% of the bar in one blow. So the 4-year-old's green bar is red and near-empty for essentially every turn of every fight, and with no compensating offense boost a resisted matchup is a 7-turn, ~35-second slog he cannot lose and cannot stay interested in. The HP bar is his only feedback channel and the AI keeps it at zero: immortality without visible dominance is the worst of both worlds — no tension AND no triumph.

**Fix:** Gate AI difficulty on mode, not just opponent class: `if (battleState.trainer && !junior && Math.random() < 0.7)`, plus a ~1.75x outgoing multiplier for Junior so fights end in 2-3 turns with his bar still green. He should watch the OPPONENT's bar crash, not his own — that is the difference between 'the game likes me' and 'the game can't kill me'.

#### Sparkle 2x stacks multiplicatively to 6x/9x and deletes the game mode it unlocks

`HIGH` · `design-flaw` · effort **S** · — *Ivan Petrov — combat-math auditor*

js/battle.js:432-438 applies typeMult, then STAB 1.5, then crit 1.5, then Sparkle 2.0, all multiplicative. At Lv20 level parity (Charizard vs Bulbasaur, 48 HP bar, power-60 move): plain 21.0 (44% of bar) -> STAB 31.5 (66%) -> Sparkle+STAB 63.0 (131%) -> Sparkle+STAB+2x-type 126.0 (262%) -> plus crit 189.0 (394%, a 9x multiplier). Sparkle alone with only STAB already one-shots any level-parity wild, and because the player also wins the speed check ~90% of the time, an arena battle becomes: tap one button, win. This is the reward for the single rarest achievement in the game -- catching the 1-in-50 shiny of your specific lead (js/battle.js:117,125) -- and its payoff is that battling stops existing. Also note the 2x is keyed on attackerRole === 'player' (js/battle.js:438), so it applies to every team member for the whole battle, not just the shiny mon the boy actually earned.

**Fix:** Make Sparkle additive and scoped: apply +50% (damage *= 1.5) and only when active().id is the mon whose shiny was caught (hasShiny(active().id)), not the whole team. That leaves a 2.25x STAB-Sparkle hit -- ~1.5 turns to KO instead of 2.3 -- which feels powerful without being a skip button. Alternatively keep 2x but give Sparkle battles a tougher wild (level +25%) so the power has something to chew on.

#### Throwing a Poke Ball is a strictly dominated strategy -- KOing auto-catches with 100% certainty

`HIGH` · `design-flaw` · effort **M** · — *Ivan Petrov — combat-math auditor*

handleVictory (js/battle.js:735-748) unconditionally calls concludeCapture on any KO -- knocking a wild out catches it, always, free. Meanwhile catchChance (js/battle.js:631-638) gives: typical capture_rate 45 at full HP with a Poke Ball = 5.9%; the same mon weakened to 1 HP with an Ultra Ball = 35.3%, needing 2.8 throws on average. Every failed throw hands the wild a free attack (js/battle.js:727-729) worth ~40% of a Lv5 bar. Legendaries are worse: capture_rate 3 clamps to the 0.03 floor even at 1 HP with an Ultra Ball, so 33 throws on average and 33 free hits -- an unwinnable loop -- while simply KOing the legendary catches it instantly. So the child who plays 'correctly' (weaken it, throw a ball, the thing every Pokemon game has taught him) is mathematically punished, and the child who ignores the ball button gets a perfect catch rate. The whole ball economy, the Master Ball scarcity (js/state.js:19,174), and the shake animation are decorative on top of a dominated choice.

**Fix:** Pick one model. Either (a) remove auto-catch-on-KO for wilds and make balls the only route -- then rebalance catchChance so a weakened + Ultra Ball is ~75%, not 35% -- or (b) keep auto-catch and rebrand balls as what they actually are: a *speed* option that ends the fight early, priced accordingly (full-HP Poke Ball ~25%, weakened Ultra ~80%). Either way, raise the low clamp for legendaries above 0.03 or they are pure frustration.

#### The team of six is math-dead: only the KO'er gains XP, and the wild scales to the lead

`HIGH` · `design-flaw` · effort **S** · — *Ivan Petrov — combat-math auditor*

XP goes exclusively to active() at the moment of the KO (js/battle.js:511 and 613). Bench Pokemon gain nothing, ever. Simultaneously the wild's level is derived from the *lead* only (js/battle.js:130-131), so by the time the lead is Lv50 the five bench mons are still at DEFAULT_LEVEL 5 (js/state.js:104). Switching one in: a Lv5 Bulbasaur has 19 max HP, and the incoming Lv50 STAB power-60 hit does 241 damage -- 13x overkill, a guaranteed one-shot. Voluntary switching is even worse, because it costs the turn and grants a free enemy hit (js/battle.js:380-383). The consequence for a 7-year-old is that his carefully-picked team of six is one fighter and five instant corpses, and the moment his lead faints the forced-switch cascade (js/battle.js:472-476) wipes the rest in one hit each. The PC/team-builder UI is promising a strategic layer the arithmetic cannot deliver.

**Fix:** Split XP across the party -- give the KO'er full XP and every other team member 50% (a two-line change in handleEnemyDown/concludeCapture). Additionally, derive wildLevel from the team's *average* or *max* level rather than teamIds[0], and consider an 'exp share' floor that pulls any team member more than 10 levels below the lead up toward it.

#### All 8 badges — the entire non-daily Master Ball faucet — are exhausted at gym win 23 of 58, and 5 of the 8 fire without the player doing the thing they name

`HIGH` · `design-flaw` · effort **M** · — *Walt Fischer — reward-economy balancer*

Simulating the ladder against BADGES (progression.js:12-21): BOULDER (catch 3) at win #2, THUNDER (win 3 battles) at win #3, CASCADE (catch 10) at win #6, SOUL (win 10) at win #10, RAINBOW (catch 25) at win #12, EARTH (raise one to Lv30) at win #21, VOLCANO (catch 50) at win #23. Every catch-count badge is satisfied by spoils the player never chose to catch, and EARTH — the capstone, worded 'Raise one to Lv30' — fires because PSYCHIC MILO's Lv32 Abra was dumped in the box (gymdata.js:56, lv(4,0)=32), not because anything was raised. So the badge track, the trainer card's headline progression, and the whole Master Ball faucet are finished at 40% of the content; the remaining 35 trainers (Victory Road, Elite Four, Champion) award zero economy — only a checkmark in gym.js:121.

**Fix:** Rebase badges on circuit progress and on verbs the kid performs deliberately: 'clear 2 gyms', 'win a battle with a type disadvantage', 'catch a mon YOU threw a ball at' (track ball-catches separately from spoils), 'raise a mon you caught below Lv10 to Lv30'. Then add a second reward tier past badge 8 — Victory Road and the Elite Four must pay something, or the last 60% of the ladder is unpaid labour.

#### The one attrition system in the game — gym endurance — is nullified by a free, unlimited heal button sitting two lines above the gym list, and losing heals you too

`HIGH` · `design-flaw` · effort **S** · — *Walt Fischer — reward-economy balancer*

HP carries across a gym's trainers (battle.js:191-200, 546-548) — the only resource pressure anywhere in Pokédex OS. But renderGymList paints `💗 POKÉ CENTER — HEAL TEAM` directly above the gym grid (gym.js:84, handler line 99) calling pokeCenterHeal() → clearGymRun(), free, unlimited, available between every single trainer. And on a loss, checkFaints calls clearGymRun() and tells the player 'Your team was rushed to the Poké Center and fully healed' (battle.js:482-484) — defeat costs nothing either. Net: zero-cost failure, zero-cost recovery, so endurance is a mechanic that exists in code and never in play. There is no currency, item, timer, or cooldown gating anything in the entire game.

**Fix:** Give the heal a price. Cheapest version: one free heal per gym, further heals cost a coin (see the currency proposal); or the heal is only available from the gym LIST, not from inside a gym, so entering a gym is a commitment. Junior mode exempt. A defeat should also cost the run's progress within that gym, not refund it.

#### Lead hits Lv100 on day 37 with 21 days of ladder left, and there is no XP bar anywhere to notice it

`HIGH` · `design-flaw` · effort **M** · — *Ritu Sharma — progression-pacing analyst*

`addXp` stops levelling at 100 (`while (mon.level < 100 && ...)`, js/state.js:125) but keeps accumulating `mon.xp` forever with nothing consuming it. In the 60-day sim the lead reaches Lv100 on day 37, at which point the ladder is only serving Lv52 foes; days 37-58 (the entire back half — Glacier, Inferno, Dragon, Victory Road, Elite Four, Champion) are played with zero progression feedback of any kind. And `xp` is never rendered: there is no `#xp` element in index.html, no bar in js/pc.js or js/dex.js — the only growth signal in the whole game is the transient 'grew to Lv..' log line (js/battle.js:512) and a static 'TOP LEVEL' number on the trainer card (js/progression.js:159). For a 7-year-old the XP bar is the single strongest 'one more battle' hook and it does not exist.

**Fix:** Add a persistent XP bar to the battle HUD and the TEAM strip slots (js/pc.js:57) — `xp / xpThreshold(level)` is already computable. Then either raise the cap above the Champion's Lv80 with real cost, or convert post-100 XP into a visible collectible (ribbons, 'mastery stars') so the day-37→58 stretch still ticks.

#### Junior mode removes the only fail state, so the gym ladder has no wall — only a tap-count wall

`HIGH` · `design-flaw` · effort **M** · — *Ritu Sharma — progression-pacing analyst*

In Junior mode the player literally cannot faint (`defender.hp = Math.max(1, defender.hp - damage*0.5)`, js/battle.js:441) and every ball catches (`if (player().settings.junior) return 1`, js/battle.js:632). Gym access is sequential-only, never level-gated (js/gym.js:44-53). So the 4-year-old's ceiling is not difficulty, it is patience — and nothing warns him. Worked case: a Lv5 Junior lead against CHAMPION REX's six Lv80 mons (js/gymdata.js:128). With the stat formulas at js/battle.js:38-41 and the damage formula at :430, a typical Lv5 attacker deals ~2.5 damage into ~202 max HP, i.e. ~80 turns per mon, ~480 taps for the fight. Unlosable and unplayable — the worst combination. Conversely there is nothing stopping a determined 7-year-old from running 10 trainers in one sitting since a loss costs nothing (js/battle.js:481), which detonates the 1-trainer/day pacing assumption entirely.

**Fix:** Show 'RECOMMENDED Lv N' on each trainer card in js/gym.js:119-127 (green/amber/red vs. current lead level) — information, not a lock. And in Junior mode scale the foe's maxHp/def down toward the lead's level so no fight can exceed ~8 turns; being unable to lose should mean fights are short, not endless.

#### Junior Mode is off by default and undiscoverable — the 4-year-old's first session is the adult game

`HIGH` · `design-flaw` · effort **M** · — *Claire Fontaine — first-session / onboarding designer*

state.js:22 ships `settings: { junior: false }` for both players, and the only way to turn it on is ⚙️ → PLAYERS → 'P1 JUNIOR MODE' (index.html:222) — a text row inside a text-dense modal, reachable only by an adult who already knows it exists. Nothing at boot asks who is playing. So the pre-reader's cold start is: catches that can fail (catch.js:78 `Math.random() < catchProbability`), battles that can be lost, the search box visible instead of hidden (gba.css:437), no spoken names (dex.js:138 gates `speak()` on junior), and — worst — a native `prompt('Give PIKACHU a nickname?')` fired 2.1s after his very first GOTCHA (catch.js:114-119; same at battle.js:607), which slams a keyboard over the confetti and is the single most likely moment for a 4-year-old to hand the tablet back.

**Fix:** Add a first-boot 'WHO'S PLAYING?' card with two giant tappable faces (BIG KID / LITTLE KID) that sets `settings.junior` for the active player — two taps, once, and the 4-year-old never sees adult mode. Also gate the nickname prompt behind an explicit tap on a '✏️ NAME IT' button inside the GOTCHA celebration rather than auto-firing a system dialog.

#### Every zero-catches path is a native alert() dead end, and one of them contradicts itself

`HIGH` · `bug` · effort **M** · — *Claire Fontaine — first-session / onboarding designer*

A brand-new player has three of the four big buttons booby-trapped. EXPLORE: explore.js:94-96 `alert('You need to CATCH a Pokémon before exploring!')` — but only AFTER the habitat grid has already been rendered and tapped, so the kid picks 'DEEP FOREST', gets rejected, and is left on a grid of eight things that all reject him. BTL: battle.js:100-102 alert. GYMS: gym.js:133 `alert('Catch a Pokémon first!')`, again only after drilling two levels in. And the PC's own empty state actively misdirects: pc.js:133 renders 'NOTHING CAUGHT HERE YET — GO EXPLORE!' — sending the player to the one screen that is hard-blocked until they've caught something. Native `alert()` is also the wrong instrument here: it's untranslated-looking OS chrome, non-dismissable by tapping away, unreadable to a pre-reader, and it returns the player to exactly the dead end they were in.

**Fix:** Replace all three with the same in-app panel: a big sprite, 'CATCH ONE FIRST!', and a single action button 'FIND ME ONE ▶' that closes the screen, calls loadPoke() on a high-capture-rate starter, and pulses the CATCH button. Lock the entry points visually too — grey EXPLORE/GYMS/BTL with a 🔒 while `caught.length === 0` so the rejection happens before the tap, not after three. And change pc.js:133 to 'TAP 🔴 CATCH ON THE MAIN SCREEN!' when caught.length is 0, reserving 'GO EXPLORE' for the case where the player actually has Pokémon.

#### Gym wins never trigger evolution — the biggest teaching moment is silently skipped for gym players

`HIGH` · `bug` · effort **S** · — *Diego Alvarez*

battleState.pendingEvolution is only ever assigned in concludeCapture (js/battle.js:627). The gym path explicitly nulls it at js/battle.js:571 at the end of handleEnemyDown, even though that same function awards XP and level-ups (js/battle.js:509-513) and prints '${name} grew to Lv..' in the victory lines. A boy who levels his starter from Lv5 to Lv40 entirely through the 55-trainer gym circuit will NEVER see the evolution animation (js/battle.js:772-790). Evolution is the strongest 'my choices changed the world' feedback the game owns, and the mode most likely to produce level-ups is the one mode that cannot fire it.

**Fix:** In handleEnemyDown, set battleState.pendingEvolution = t.lastXpMon (already computed at js/battle.js:513) when ups > 0, instead of nulling on line 571; maybeEvolveThenExit handles the rest. One-line fix restoring the highest-value teaching beat in the game.

#### HP-scaled ball odds are a hidden rule the player is punished for learning — KO auto-catch strictly dominates it

`HIGH` · `design-flaw` · effort **M** · — *Diego Alvarez*

catchChance (js/battle.js:631-637) computes hpFactor = (3*maxHp - 2*hp)/(3*maxHp) — 1/3 at full HP rising to 1 near zero — clamped to [0.03, 0.95]. A failed throw costs a free enemy attack (js/battle.js:727-729). Meanwhile handleVictory auto-catches ANY wild that faints with identical XP (js/battle.js:735-748). Optimal play is therefore: never throw a ball, just KO everything. The hidden odds curve exists to teach 'weaken it first'; the lesson the boys will actually derive is 'balls are a trap'. Worse, the dex-screen catch uses a different formula with no HP term and no floor (js/catch.js:286-289: baseRate * ballModifier / 255), so the same four-ball drawer obeys two rules in two screens — a Mewtwo (capture_rate 3) is a 1.2% roll there with no feedback and no way to improve it. The wild's HP is never shown numerically either (js/battle.js:322 writes text for the player only), so the only visible input is a bar colour.

**Fix:** Make the BALL button the teacher: recolour and relabel it live from catchChance — '🔴 BALL · TOUGH' / '· FAIR' / '· EASY' in the same red/yellow/green as the HP bar. The rule becomes visible with no numbers and rewards watching the enemy bar. Then give the ball a reason to exist (e.g. ball-caught mons keep their wild level while KO-caught ones do not) so the advertised strategy is the winning one.

#### Sparkle's unlock is effectively unreachable and its hint teaches a goal the player cannot pursue

`HIGH` · `design-flaw` · effort **S** · — *Diego Alvarez*

onTeamConfirmed gates sparkle on hasShiny(leadId) (js/battle.js:111) and the hint reads "Catch your lead Pokémon's SHINY in the wild (1-in-50 encounters)" (js/battle.js:117). The 1-in-50 is true of the shiny roll (js/battle.js:125) but the species is not yours to choose: the arena wild is Math.floor(Math.random()*MAX_POKEMON)+1 across 649 species (js/battle.js:161), so unlocking sparkle for a SPECIFIC lead is roughly 1 in 32,000 per battle. The hint states an actionable-sounding goal that is not actionable, and the boys will grind at it. Two further invisibilities: the sparkle modal only appears from the arena path (js/battle.js:159-163) because Explore hard-codes sparkle:false (js/battle.js:170); and the 2x applies to the WHOLE team for the whole battle (js/battle.js:438 checks battleState.isSparkle, not the active mon), so switching to a non-shiny mon silently keeps the doubler.

**Fix:** Gate on player().shinies.length > 0 (any shiny unlocks sparkle for the team) and rewrite the hint to the reachable version: 'Catch ANY shiny Pokémon — about 1 in 50 wild encounters — to unlock Sparkle for your whole team.' Add the progress cue '✨ 0 SHINIES YET' on the locked button so the counter is the tutorial. If the per-species gate is intentional, at minimum name the species in the hint ('Catch a shiny PIKACHU').

#### `alert()` is the entire error UX — nine sites, none of them readable by the pre-reader the game was built for

`HIGH` · `design-flaw` · effort **M** · — *Olga Ivanova — error-handling & failure-mode auditor*

Every network failure terminates in a native modal: 'Error loading battle data. Network issue?' (/home/claude/pokedex/js/battle.js:154, :208, :862), 'Network hiccup — the gym battle ended safely.' (:524), 'DEFEAT! The wild Pokémon got away...' (:490), plus explore.js:249 and gym.js:133. These are junior-mode-blind: the code carefully suppresses the nickname `prompt()` in junior mode (battle.js:605, catch.js:111) because it knows a 4-year-old can't type — yet fires an English-text native dialog at that same child. Concretely: mid-gym, enemy 2 of 3 goes down, PokeAPI drops the next fetch, and battle.js:522-526 shows a grey OS dialog reading 'Network hiccup', then `exitBattleMode()` dumps him to the dex. He beat a Pokémon and got teleported home with an unreadable grey box. Worse, the win is not recorded (`recordGymWin` is only reached at :578), and the XP granted at :506-509 already persisted — so the run half-counted.

**Fix:** Replace all nine `alert()`s with the existing in-world modal system (`show('victory-modal')` pattern) using icon-first copy — a sad Pokéball graphic, ≤4 big words, and a giant 'TRY AGAIN' button that re-invokes the failed action rather than exiting. For the mid-gym case specifically: retry the enemy fetch twice, and if it still fails, keep the kid on the trainer with the already-won KOs intact instead of exiting.

#### A failed lookup leaves stale `curId`/`curData` — the CATCH button then catches an invisible Pokémon while the screen reads ERROR

`HIGH` · `bug` · effort **S** · — *Olga Ivanova — error-handling & failure-mode auditor*

In `loadPoke`'s catch block (/home/claude/pokedex/js/dex.js:85-100) the screen is repainted to 'ERROR / TIMEOUT', sprite swapped to a Pokéball, types and stats cleared — but `state.curId`, `state.curData` and `state.curSpeciesData` are never reset; they are only assigned on the success path (:77-79). `updateCatchUI()` is also not called in the failure branch. So after the 7-year-old types 'pikchu' and gets ERROR, the CATCH button still reads whatever it read before, `openBag` still passes the `state.curId` guard (catch.js:11), and `executeCatch` records the *previous* Pokémon (catch.js:108 `recordCatch(state.curId)`) using the previous species' capture rate (catch.js:77). The confetti fires, 'GOTCHA!' appears over a Pokéball placeholder labelled ERROR / TIMEOUT, and an unrelated Pokémon lands in the box. Additionally, a 404 (typo) and a 500 (API down) are indistinguishable — api.js:29 throws the same `API_ERROR` for both — so a spelling mistake shows the same scary 'API Server issue' text as an outage.

**Fix:** In the catch branch set `state.curData = state.curSpeciesData = null` and disable/blank the CATCH button; guard `openBag`/`executeCatch` on `state.curData` being non-null. Separately, have `apiFetch` throw a typed error carrying `response.status` so dex.js can render 'HMM — NO POKÉMON WITH THAT NAME. TRY AGAIN!' for 404 versus 'THE POKÉDEX CAN'T REACH THE NETWORK' for 5xx/timeout.

#### Zero `onerror` handling on any sprite — a 404 renders a broken-image glyph as the opponent, and `src=''` re-downloads the page HTML

`HIGH` · `missed-opportunity` · effort **S** · — *Olga Ivanova — error-handling & failure-mode auditor*

Not one `<img>` in index.html or any of the six generators (battle.js:270/311/318, dex.js:150/169, gym.js:118, pc.js) carries an `onerror`. All sprites come from `raw.githubusercontent.com` (config.js:17-19), a host that is not PokeAPI, is not covered by the API timeout, and does rate-limit. Worse, `buildFighter` sets `spriteFront: sp.animated ?? sp.front_default ?? ''` (/home/claude/pokedex/js/battle.js:74) — for any Pokémon lacking both, `img.src = ''` resolves to the document URL, so the browser fetches index.html as an image and paints a broken-image icon. The kid then fights a full-HP, fully-named opponent that is literally not there: damage numbers pop over an empty box, the hit animation shakes nothing. Nothing in the code detects this, so it never even reaches the (bad) alert path.

**Fix:** Add one delegated handler in main.js: `document.addEventListener('error', e => { if (e.target.tagName==='IMG') e.target.src = e.target.dataset.fallback || POKEBALL_DATA_URI; }, true)`. Set `data-fallback` to `PIXEL_SPRITE(id)` on battle/gallery sprites so an animated-sprite failure degrades to the static one, and inline the final Pokéball placeholder as a data: URI so it cannot itself 404. Never assign `''` to a src — use the placeholder.

#### Network errors silently rewrite the rules of the battle: a fainted Pokémon keeps fighting, and a VS match is awarded to the wrong brother

`HIGH` · `bug` · effort **M** · — *Olga Ivanova — error-handling & failure-mode auditor*

Two catch blocks recover by breaking the game's own invariants. (1) `doSwitch` (/home/claude/pokedex/js/battle.js:365-370): when a fetch fails during a *forced* switch — i.e. the active Pokémon just fainted — it logs 'COULD NOT SWITCH. TRY AGAIN!' and calls `enableMoves(true)` regardless of `forced`. The kid then attacks with a 0-HP Pokémon; `performAttack` happily runs, `checkFaints` sees hp<=0 and reopens the forced switch modal, forever. A zombie Pokémon in an unbreakable loop. (2) `versusNextMon` (:944-950): `catch (e) { show('loading-modal', false); continue; }` — if the remaining team members fail to load, the loop exhausts, returns false, and `executeVersusMove` (:933) calls `versusMatchOver(otherSide)`. A Wi-Fi blip during a brother-vs-brother match declares the other brother the winner and increments his `versusWins` on the Trainer Card (:962-964). That is the single most argument-generating failure mode in the app.

**Fix:** In `doSwitch`, on failure with `forced===true`, retry once then reopen the forced switch modal (never `enableMoves(true)`); if no team member can be loaded, route to the normal defeat screen. In `versusNextMon`, distinguish 'no healthy Pokémon left' (legitimate loss) from 'could not load' — on load failure, pause the match with a retry button rather than silently ending it.

#### PIN fails OPEN, has no lockout, and cannot be changed or recovered without deleting both boys' saves

`HIGH` · `bug` · effort **M** · — *Meredith Stone — parental-controls designer*

Three compounding defects in js/devtools.js:174-191. (1) Fail-open: the outer catch returns true (line 190). If localStorage.setItem throws — iOS private browsing, 'Block All Cookies', quota pressure — the flow is getItem throws → stored=null → 'Set a 4-digit PIN' → setItem throws → catch → return true. Storage is blocked, so the PIN never persists, so EVERY open shows 'Set a PIN' and any four digits the child types grants full access. The comment says 'fail open for the parent'; it fails open for the child. (2) The PIN is stored as plaintext in localStorage under a self-describing key ('pokedexos_devpin', line 174) and compared by string equality (line 188), with unlimited attempts and no delay — a kid can brute-force 4 digits by hand faster than a parent expects, and any reading child who ever sees a browser storage view gets it for free. (3) There is no CHANGE PIN and no forgot-PIN path anywhere in the codebase. A parent who forgets it must clear site data — which deletes pokedexos_save_v2 in the same origin (js/state.js:7) and wipes both children's progress. The PIN is effectively a one-way lock on the family's own game.

**Fix:** Hash the PIN (crypto.subtle SHA-256 + a random per-install salt) and store the digest; fail CLOSED on any storage error with a clear message; add exponential backoff after 3 wrong tries. Add a 'CHANGE PIN' row inside Parent Tools, and a documented recovery that force-downloads the save file before clearing the PIN key only.

#### Zero playtime visibility, paired with a daily engagement loop that resets at dinnertime

`HIGH` · `missed-opportunity` · effort **M** · — *Meredith Stone — parental-controls designer*

The per-player stats block records catches, battlesWon, battlesLost, versusWins (js/state.js:23) and nothing time-based whatsoever — no firstPlayed, no lastPlayed, no session count, no minutes. There is no timer, no session cap, no break nudge anywhere in the 3320 lines. A father at breakfast literally cannot answer 'how long was he on this last night?' or 'when did he last play?' Meanwhile the app runs a deliberate return-tomorrow reward loop: three daily quests granting Master Balls (js/progression.js:52-60), keyed to todayNumber() = floor(Date.now()/86400000) — raw UTC days with no local offset (js/progression.js:37). In US timezones that boundary lands at 8pm ET / 5pm PT, so quests refresh in the middle of the evening: a kid who finished today's set at breakfast gets a brand-new set of rewards right at dinner. The engagement design is more sophisticated than the parental instrumentation, which is nil.

**Fix:** Add stats.play = { totalMs, todayMs, day, lastSeen, sessions:[] }, accumulated on a visibilitychange/interval tick. Surface a PARENT DASHBOARD as the first screen of Parent Tools: minutes today and this week per kid, last played timestamp, catches this week. Add an optional soft cap that shows a friendly 'Professor Oak says take a break' screen — soft, never a hard lock. Fix todayNumber() to use local midnight.

#### Nothing ever asks the parent to back up, and localStorage is the only copy

`HIGH` · `missed-opportunity` · effort **S** · — *Andre Williams — family-logistics expert*

The save lives solely in `localStorage` (js/state.js:99); `navigator.storage.persist()` is called nowhere in the codebase (grep across js/, index.html, sw.js returns nothing). Settings shows no 'last exported' date — nothing in js/settings.js tracks or displays export time. On iOS, a site opened in Safari rather than installed to the home screen has its localStorage evicted after ~7 days without interaction. The realistic three-device family pattern — the spare iPad gets used on car trips — means a two-week gap silently deletes the entire save, and because no one was ever prompted to export, there is no code to restore from. Manual export is only viable if the app nags; right now it never does.

**Fix:** Call `navigator.storage.persist()` on boot. Store `lastExportAt` and render it in Settings ('Last backup: 12 days ago' in red past 7 days). Auto-offer export after milestones the parent will be nearby for — badge earned, every 25th catch, first shiny — with a one-tap 'SAVE TO FILES / SHARE' that uses `navigator.share`.

#### Save can silently stop persisting when the API cache fills the origin's storage

`HIGH` · `bug` · effort **S** · — *Andre Williams — family-logistics expert*

`persist()` swallows every failure with `console.warn('Persist failed', e)` (js/state.js:99-100) — no user-visible signal. It shares the origin's ~5MB localStorage bucket with `pokedexos_apicache_v2`, documented at '151 Pokémon ≈ 450KB' (js/api.js:5) but which also caches move data and grows unbounded across sessions; `saveCache` only defends itself, dropping `move:` keys and then nuking its own cache (js/api.js:12-21), never reserving headroom for the save. Under quota pressure (or iOS private browsing, where quota is tiny), the boys play a full evening of catching, the UI shows everything as caught because `state.save` is fine in memory, and on next launch the whole session is gone with zero warning.

**Fix:** On a `persist()` catch: immediately clear the API cache and retry, and if it still fails show a blocking in-game banner ('SAVING ISN'T WORKING — SHOW A GROWN-UP') plus auto-open the export dialog. Long term move the save to IndexedDB and keep the API cache in the Cache API where it can't compete for the same quota.

#### Which kid is playing is never remembered — every launch starts as P1

`HIGH` · `design-flaw` · effort **S** · — *Andre Williams — family-logistics expert*

`state.currentPlayer` is initialized to 1 in the runtime (non-persisted) block of `state` (js/state.js:69) and is only ever changed by the header toggle (js/main.js:60). It is not in the save and not in localStorage. So on all three devices, every cold start puts whoever picks it up into P1. For a 4-year-old pre-reader on the shared iPad, that means he lands in his brother's profile with Junior Mode off — `applyJuniorClass()` reads `player().settings.junior` (js/settings.js:10-12), which is P1's. He then catches things into the wrong account. This is the single most common source of real divergence in a two-kid house, and unlike a stale code it's unfixable after the fact: those catches are genuinely in the wrong child's dex.

**Fix:** Persist the active player in a DEVICE-LOCAL key (`pokedexos_lastplayer` — deliberately not inside the synced save, so importing a code doesn't reassign who the tablet belongs to). Better: on cold boot show a full-screen two-face 'WHO'S PLAYING?' picker with the boys' chosen starter sprites — no reading required, and it makes the 4yo's first tap correct by construction.

#### Versus pass-modal is excluded from exit cleanup, `passResolver` is never released, and `versusNextTurn` has no post-await guard

`HIGH` · `bug` · effort **S** · — *Ben Carter — race-condition & async-state hunter*

Three defects compound on the pass-and-play path. (1) `exitBattleMode`'s cleanup list (js/battle.js:83) hides sparkle/victory/switch/evo/loading but omits `pass-modal` and `ballpick-modal`. `#pass-modal` is a full-screen overlay at `z-index: 2400` (index.html:186) — the highest in the app — whose only control is READY, so any exit or thrown error while it is displayed leaves an unclearable 'PASS TO P2!' wall over the gym screen. (2) `waitForPass` (js/battle.js:808-812) stores the resolver in module-level `passResolver` and nothing clears it on abort, so the suspended promise plus both sides' fully-built fighter objects stay retained. (3) `versusNextTurn` (js/battle.js:905-913) checks `isBattling` at :906, *before* `await waitForPass(n)`, and never re-checks after. Tapping READY on a stranded modal therefore resumes a dead battle: `renderVersusMoves(n)` → `sideActive(1)` → `active()` → `battleState.loaded` is `{}` after exit → TypeError on `f.moves.map` (:886), after `#battle-moves` has already been stomped with a dead player's moves. That rejection is unhandled: the try/catch at :835-865 only wraps the first round, because the promise chain is broken by the click listener at :890 — every turn after turn one throws into the void.

**Fix:** Add `export function cancelPass() { const r = passResolver; passResolver = null; show('pass-modal', false); if (r) r(); }` and call it from `exitBattleMode`; add `'pass-modal','ballpick-modal'` to the cleanup array at :83; re-check `if (!battleState.isBattling) return;` immediately after `await waitForPass(n)`. Give `#pass-modal` a visible cancel/back button so it is never a dead end.

#### No try/finally anywhere in the async turn pipeline — one throw freezes the battle with every button disabled

`HIGH` · `design-flaw` · effort **M** · — *Ben Carter — race-condition & async-state hunter*

`executeTurn` (js/battle.js:404-422), `executeBallThrow` (:668-732), `doSwitch` (:353-388) and `executeVersusMove` (:915-937) all follow `busy = true; enableMoves(false); await ...; busy = false; enableMoves(true)`. None uses try/finally, so any exception between those lines leaves `busy` pinned true and the whole move grid permanently disabled — a hard-frozen battle whose only escape is the ESCAPE button (which then triggers finding #1). Reachable today via the exit-during-await path and via any transient failure inside `buildEnemy` (:521) or `performAttack`. Secondary ordering smell: `busy` is cleared *before* the outcome resolves — js/battle.js:420-421 sets `busy = false` then awaits `checkFaints()`, which sleeps 1200-1600ms, opens modals and (gym path, :519-528) performs a network fetch; :730-731 and :921 do the same. That window is currently masked only because `enableMoves(false)` happens to still be in effect: two independent guards that must agree, with no invariant enforcing it.

**Fix:** Wrap each entry point in `try { ... } finally { battleState.busy = false; }`, and re-enable moves from a single `awaitInput()` helper that is the sole caller of `enableMoves(true)`. Then collapse `busy` and the disabled state into one source of truth so they cannot disagree.

#### Explore encounters fire ~2.9 seconds after the tap with no cancellation — a battle ambushes the child after they left explore

`HIGH` · `bug` · effort **S** · — *Ben Carter — race-condition & async-state hunter*

`enterHabitat` (js/explore.js:91-139) runs a rustle animation (3 × 550ms at :115-119 plus 1200ms at :136) before dispatching `explore-encounter` at :139, bridged to `startWildEncounter` at js/main.js:148. Throughout that ~2.85s window `state.appMode` is still `'explore'` and the BACK button (`explore-back-btn` → `closeExplore`, js/explore.js:64-67, wired at main.js:129) is fully live on screen. If the child taps BACK during the rustle — which they will, because nothing is happening yet — `closeExplore` sets `appMode='dex'` and hides the container, and two seconds later a wild battle launches out of the dex screen with no user action. Because `origin` is `'explore'` (js/battle.js:170), exiting that battle dispatches `return-to-explore` (:90-91) and drops them back into the habitat grid they deliberately left. The same window lets `openGyms`/`openExplore` run — their guards only test `appMode === 'battle'` (js/gym.js:61, js/explore.js:56) — so the encounter can hijack the gym screen too.

**Fix:** Add module-level `let encounterToken = 0;` incremented in `closeExplore` and at the top of `enterHabitat`; capture it locally and bail after each await if it changed. Also make BACK cancel the rustle immediately rather than leaving it running — a child tapping BACK should get BACK.

#### Evolution can never trigger from a gym battle — the biggest XP source in the game

`HIGH` · `bug` · effort **S** · — *Luna Martinez — celebration designer*

Evolution only plays via maybeEvolveThenExit() reading battleState.pendingEvolution, which is set exclusively in concludeCapture (js/battle.js:627 — wild/explore battles). The gym path handleEnemyDown() computes `ups` per KO (js/battle.js:511) but never sets pendingEvolution, and then explicitly clears it on the trainer-defeat branch: js/battle.js:771 `battleState.pendingEvolution = null;`. So a child who KOs a full 3-Pokémon gym roster — several levels in one fight, easily crossing a Lv16/Lv30 threshold — gets the flat text 'grew to Lv31' and the best-crafted animation in the game silently never fires. It will read as a broken promise, since evolution DOES fire in arena battles.

**Fix:** In handleEnemyDown, accumulate the highest-level fighter with ups>0 into battleState.pendingEvolution (t.lastXpMon already holds exactly this), delete the null-out at line 771, and let the gym victory modal's CONTINUE route through maybeEvolveThenExit() like the wild path does. Queue multiple evolutions if several team members crossed thresholds.

#### A native browser prompt() guillotines the catch celebration mid-confetti

`HIGH` · `design-flaw` · effort **S** · — *Luna Martinez — celebration designer*

js/catch.js:110-119 fires `prompt('Give PIDGEY a nickname?')` 2100ms after GOTCHA — precisely while the 1.6s confetti is settling and the green GOTCHA still reads. Worse, js/battle.js:604-610 calls prompt() SYNCHRONOUSLY inside concludeCapture before `show('victory-modal')` at line 626, so the entire post-battle celebration is held hostage behind a grey OS dialog with a text field. For a 7-year-old the emotional arc is: triumph → grey box demanding typing → (probably taps Cancel) → text wall. Naming should be the warm coda to a celebration, not the interruption of one; a modal keyboard also blocks the confetti from being seen on a phone.

**Fix:** Never prompt during the celebration. Show the nickname affordance as an optional in-game button ('NAME ME ✏️') on the victory/GOTCHA panel that only opens an in-app styled input when tapped, and let the confetti and sound finish first. Default to skip — silence should always be the path of least resistance.

#### First shiny — a 1-in-50 event — gets a recycled two-note beep and no visual whatsoever

`HIGH` · `missed-opportunity` · effort **M** · — *Luna Martinez — celebration designer*

Encounter: js/battle.js:147-150 logs '✨ WOW! A SHINY X APPEARED!!' into the scrolling battle log, plays sfx.catch() (the same 600→800Hz blip as catching a Rattata) and vibrates. No screen flash, no sparkle particles, no music sting, and the log line scrolls away within two turns. Capture: js/battle.js:601 computes `newShiny = recordShiny(w.id)` — which uniquely returns true only the FIRST time that species' shiny is recorded (js/state.js:159-163) — and spends that precious signal on one more line of 9px text (js/battle.js:620). A child's very first shiny ever and their fifth are indistinguishable. Persistent recognition is a ✨ glyph in the PC grid (js/pc.js:107) and a number on the trainer card. The rarest thing in the game is the least celebrated per unit of rarity — and rarity you don't feel doesn't teach anticipation.

**Fix:** On shiny appear: freeze input for 1.2s, white screen flash, gold confetti over the wild sprite, a distinct high shimmer arpeggio (1047/1319/1568), long haptic — the child should shout before the first turn. On the player's FIRST-EVER shiny (guard on player().shinies.length===0), run a dedicated fullscreen 'YOUR FIRST SHINY!' card with the sprite on a gold background, and add a permanent ✨SHINY DEX row to the trainer card.

#### The cry — the Pokédex's signature sensory payload — never plays unless you press a button

`HIGH` · `design-flaw` · effort **S** · — *Owen Gallagher — curiosity-loop designer*

dex.js:135 only ARMS the cry (setCry(d.cries?.latest)); nothing plays it. The only trigger is the CRY button (index.html:70 → main.js:51-55, 111). So the default experience of landing on entry #612 is silent. Worse for the pre-reader: dex.js:138 gives Junior mode a robotic TTS reading of the name instead of the monster's actual voice — the boy who can't read gets the least evocative audio in the app. A real Pokédex screams at you when you open it; this one waits politely for a tap on a 60px button labelled 💥 CRY.

**Fix:** Auto-play the cry at the end of the scan (in loadPoke's 600ms setTimeout, dex.js:101-104), gated on isMuted() and on audio having been unlocked by the boot tap. For Junior mode, play the cry FIRST, then speak the name ~500ms later — voice of the creature, then its name. Keep the CRY button for replays.

#### Five of six lore entries are fetched, cached, and thrown away — every visit to an entry reads identically

`HIGH` · `missed-opportunity` · effort **S** · — *Owen Gallagher — curiosity-loop designer*

api.js:68 deliberately stores six English flavor texts per species; dex.js:120 renders flavor_texts[0] and nothing else ever reads the array (verified by grep: the only reference in the codebase is dex.js:120). The bandwidth and localStorage are already spent. The consequence is that entry #612 has exactly one sentence of content, forever — there is no reason to open it twice, and the boy who already looked at Charizard has literally exhausted Charizard. This is the cheapest re-read value in the codebase, sitting unused.

**Fix:** Make the desc block tappable: cycle 1/6 → 2/6 with a small counter and the typewriter re-running each time (typeText already exists). Ship a subtle '▸ MORE' affordance, and on revisit start from a random index so the same entry says something new. Trivial change, multiplies the encyclopedia's word count by six.

#### Evolution chains show only the first branch — Eevee's fan, the most famous discovery moment in Pokémon, is invisible

`HIGH` · `bug` · effort **M** · — *Owen Gallagher — curiosity-loop designer*

api.js:78-93 slimEvo walks only curr.evolves_to?.[0] ('flatten first path'). Every branching family is truncated: Eevee (#133) renders as Eevee → Vaporeon with Jolteon, Flareon, Espeon, Umbreon, Leafeon, Glaceon silently deleted; same for Wurmple, Tyrogue, Snorunt, Poliwag, Slowpoke, Kirlia, Nincada, Burmy. And the branch data is CACHED in that truncated shape, so the bug is sticky per-device. Separately, min_level IS captured at api.js:88 and never rendered (dex.js:149-151 draws a bare ▶ arrow), so a kid can see that Dratini becomes Dragonair but not that it takes Lv30 — the one fact that turns browsing into a goal.

**Fix:** Store the full tree (recurse evolves_to, not [0]) and render branches as a fan: base sprite, then a row of all children. Label each arrow with 'Lv16' / 'STONE' / '???' from evolution_details. Bump the cache key (evo: → evo2:) so existing truncated entries are refetched. Bonus: dim chain members not in p.caught so the chain doubles as a to-do list.

#### Nothing on the entry screen conveys rarity or awe — Mewtwo looks exactly like Rattata

`HIGH` · `missed-opportunity` · effort **S** · — *Owen Gallagher — curiosity-loop designer*

api.js:70 stores is_legendary and is_mythical on every species; grep shows zero consumers anywhere in js/. capture_rate is fetched too (api.js:66) and only used by the catch RNG (catch.js:77) — never shown. So the dex screen has no rarity vocabulary at all: #150 renders with the same header, same tags, same layout as #19. Meanwhile explore.js already encodes a full rarity model (c/u/r/L tiers, lines 12-50) and the encounter scene DOES sell it ('💥 A LEGENDARY POKÉMON!! 💥', explore.js:124) — the excitement exists in one screen and is completely absent from the screen whose job is reverence.

**Fix:** Add a rarity ribbon to the identity block (index.html:46-53): 👑 LEGENDARY / 🌟 MYTHICAL from the species flags, plus a plain-language rarity line derived from capture_rate ('VERY HARD TO CATCH — 3 in 255'). Give legendaries a distinct glow/scanline treatment on load. Cost is ~20 lines against data already in the cache.

#### A misspelled name blames the network ('API Server issue') — and the autocomplete that would fix it is locked inside the parents-only panel

`HIGH` · `design-flaw` · effort **S** · — *Owen Gallagher — curiosity-loop designer*

main.js:154-156 passes raw input straight to loadPoke; a 7-year-old typing 'charzard' hits the catch block at dex.js:92-93 and reads 'ERROR / TIMEOUT — API Server issue or Pokémon not found. Try again.' — the app blames itself and gives no path forward, so the child's move is to stop searching. Meanwhile devtools.js:194-213 implements exactly the right thing — live substring matching over the cached 649-name index with sprites — behind a 1200ms hold-to-open PIN gate (devtools.js:170-190) that only the dad ever passes. The kids' search box has no suggestions, no fuzzy fallback, no 'did you mean', despite getNameIndex() being warm from the PC box (pc.js:37).

**Fix:** Lift renderSuggestions() out of devtools into a shared module and wire it to #search: sprite + name suggestions after 2 characters. On a failed lookup, fall back to nearest-name matching over the index and show 'DID YOU MEAN 🖼 CHARIZARD?' instead of an error. Reserve the API-error copy for actual fetch failures.

---

## All findings by expert

### Aria Voss
*Core loop: catch → train → battle → collect. Session-1 map (verified f*

- **[CRITICAL/M]** Free dex-page catching bypasses the entire loop — Gate dex-page catching to species already encountered in explore or battle ('seen' list), or give dex-throws a small daily Pokéball budget refilled by explores and wins. Collection must route through 
- **[HIGH/S]** Only the active mon earns XP — the team of 6 is decorative — Give 50% XP to every team member who entered the field during the battle, or a flat 25% share to the bench (classic Exp. Share). One-line change in the two award sites; transforms team-building from d
- **[HIGH/M]** Gym loot outclasses hand-raised mons — 'train' collapses into 'loot' — Two-part fix: (a) prize mons of already-owned species should raise that mon to max(currentLevel, trainerLevel) so loot strengthens what you have; (b) add a Bond bonus (see boldest idea) so levels earn
- **[HIGH/M]** Duplicate catches pay nothing — late-game wild battles are dead reward loops — Duplicates award a currency (Star Shards): spend on Rare Candies (+1 level to any mon — finally a use that feeds 'train'), Great/Ultra Ball stock for the dex drawer, or shiny-charm odds. Scale daily-q
- **[MEDIUM/S]** Fixed sleep() choreography makes every grind battle a 2-3 minute time-tax — Add a text-speed/TURBO setting (halve all sleeps) and a win-streak XP multiplier (+25% per consecutive win, resets on loss/run) so grinding acquires a push-your-luck texture instead of a metronome.
- **[LOW/S]** Master Ball economy inflates with no sink — Make legendary and shiny encounters flee after 3-4 turns unless balled — the Master Ball becomes the clutch answer kids hoard for exactly the moment the 1% roll hits, which retroactively makes every b

### Dev Okonkwo
*Difficulty curve / XP economy / gym-ladder pacing*

- **[HIGH/S]** Loyalty is punished: the optimal strategy is abandoning your starter team every gym — Split KO XP across all 6 team members (full amount to each is fine at this curve — it merely converts the 6x multi-mon grind into the 1x carry grind), or give benched team members 50% echo XP. One loo
- **[HIGH/S]** Junior Mode can't lose but effectively can't win past Gym 4: 90+ turn tap marathons — In junior mode, scale player damage by a floor: e.g. damage = max(damage, enemy.maxHp * 0.15) when the level gap exceeds ~10. Fights become 5-8 taps regardless of ladder position — pacing, not challen
- **[MEDIUM/M]** Wild-level rubber-banding makes grinding permanently inefficient and invisible-progress — Make habitats carry level bands (forest Lv5-15 ... dragon den Lv55+) with XP proportional to actual wild level, so 'go train at the volcano' becomes a real, teachable decision; halve the sleep() timin
- **[MEDIUM/S]** No signpost that gift mons outlevel the team — the kid hits a wall he owns the answer to — On gym-battle defeat, check whether any box mon outlevels the current team's weakest by 3+; if so, add a line: 'Psst — your #095 ONIX is Lv19! Tap TEAM to add it!' One monLevel() scan in the defeat br
- **[LOW/M]** Champion difficulty spike: +4 levels, 6 mons, and the leader-slot formula's hidden +2 jump — Either make the Poke Center cost something inside Victory Road/Elite (e.g. one heal per run) so endurance is a real designed pressure, or auto-heal between elite trainers and let the Champion's 6 mons
- **[LOW/S]** Repeat gym trainers give no rematch XP path; beaten trainers are permanently unclickable — Allow rematches of beaten trainers at their fixed levels for reduced XP (no re-catch). It reuses the entire existing startTrainerBattle path — mostly deleting the ':not(.beaten)' filter and skipping t

### Dr. Hanna Kim
*Pre-reader walkthrough: every screen as a 4-year-old in Junior Mode — *

- **[CRITICAL/M]** Battle screen is 100% text-dependent — Junior Mode only makes the words bigger — In junior: (a) pipe every logMsg() through speak() (the queue pattern from progression.js celebrations works here); (b) render move buttons as big type-colored tiles with a type emoji (🔥💧⚡🌿 map alread
- **[HIGH/S]** Native alert()/prompt() dialogs still fire inside junior flows — Replace all player-facing alert()s with the existing badge-modal/victory-modal pattern (emoji + spoken line + one big button). For the 'no Pokémon yet' gates, better still: auto-bounce to the dex with
- **[HIGH/S]** Victory/defeat screens are paragraphs of 8-9px text with no picture of what you caught — Put the caught Pokémon's sprite (PIXEL_SPRITE is already imported) front and center in the victory modal with confetti (spawnConfetti is exported and unused here), and in junior speak the headline: 'Y
- **[MEDIUM/M]** PC Box and pre-battle team picker have zero junior adaptation — Add body.junior rules for the PC: hide .pc-search and gen-tabs (default to ALL), enlarge grid cells, and make the confirm button a large green ⚔️-dominant button distinct in shape/color from the grey 
- **[MEDIUM/S]** The 4-year-old can silently turn off his own safety net — Move the junior toggles behind the existing hold-to-open Parent Tools gate (the pattern is already built), and give each player a chosen avatar sprite shown in the header instead of/next to the text n
- **[LOW/S]** Arena battle entry stalls juniors at the SELECT VARIANT text modal — In junior mode, skip the sparkle modal entirely (auto-pick sparkle if unlocked — it only helps him) and go straight to the battle, mirroring the explore path.

### MILA FERNANDEZ
*Meta-progression: badges, daily quests, dex completion as long-arc goa*

- **[CRITICAL/L]** Dex completion, the north-star long arc, is cheapest via button-mashing the dex screen — a — Make encounter context the only catch context: dex-screen CATCH should require the species be 'seen' first (via Explore, gym rosters, or evolution), or cost an earned resource per throw. Simultaneousl
- **[HIGH/M]** All 8 badges are exhausted by roughly week 2, and none of them are tied to the gyms — Rebuild BADGES as one badge per gym leader defeated (check p.gyms.beaten for each ':4' leader key — 10 badges, data already persisted) plus tiered dex-milestone badges (100/200/300/500/649 caught). Ke
- **[HIGH/M]** Becoming Champion — the game's climax — is one unpersisted log line — Persist a champion flag + date in the save, fire queueCelebration with a unique champion ceremony, gold-tint the trainer card, and add a Round 2 rematch circuit (same data, levels +15, ~one line in gy
- **[MEDIUM/M]** Daily quest pool is 10 items with no streaks, no scaling, no memory — dry by week 2 — Add a persisted daily streak with escalating milestone rewards (3/7/14/30 days), extend the pool with quest kinds keyed to existing events ('beat a gym trainer', 'level a Pokemon up twice', 'win witho
- **[MEDIUM/S]** Master Balls are a scarce reward currency with no scarce use — Give wild encounters a flee timer (wild escapes after 3-4 failed throws, standard Pokemon tension) so Master Balls become the real answer to legendaries and shinies — one small battle.js change makes 
- **[LOW/S]** Quest XP fallback silently feeds the lowest-numbered dex entry — Fall back to the highest-level mon in p.mons instead of caught[0], and name the recipient in the celebration subtitle so the reward is legible to the kid.

### TOM BAUER
*Attention span, session pacing, and dead-air elimination*

- **[HIGH/M]** No tap-to-skip anywhere: a 3-mon gym battle carries ~43s of unskippable dead air — Replace sleep(ms) in battle flows with an awaitOrTap(ms) that races the timer against one pointerdown on the battle view (min ~250ms so text registers). Also merge crit+effectiveness into ONE line ('C
- **[MEDIUM/S]** Mid-battle loading modals: next gym enemy is fetched on demand instead of prefetched — Kick off buildEnemy(def, n+1) in the background the moment enemy n is sent out (store the promise on battleState.trainer); handleEnemyDown just awaits it — usually already resolved. Skip the getSpecie
- **[MEDIUM/S]** Failed ball throw is a 5-6s punishment loop, repeatable many times at full HP — On failure, break out of the shake loop with a snappier beat: 1 shake max on a hopeless throw, cut 'BROKE FREE' to 600ms, and skip the enemy free hit on the FIRST failed throw of a battle (keep it the
- **[MEDIUM/S]** Every wild win replays a fixed 6.6s ending cinematic before the victory modal — Make the capture cinematic tap-through-able (same awaitOrTap primitive), and replace prompt() with a small in-game nickname field ON the victory modal, pre-focused but optional — no OS modal, no flow 
- **[MEDIUM/S]** Explore rustle burns 2.85s while the known encounter sits unfetched — Start buildFighter(wildId) and the lead's buildFighter in Promise.all as soon as rollEncounter returns, in parallel with the rustle animation; pass the resolved fighters through the explore-encounter 
- **[LOW/S]** Evolution scene is a fixed 5.7s with a 2.6s dead tail after the reveal — Keep the build-up untouched (that anticipation is the fun) but make the post-reveal 2600ms tap-dismissable, and add a subtle 'TAP!' blinker so kids learn the affordance.

### Priya Nair
*Touch interaction: target sizes, gesture conflicts, accidental taps, z*

- **[HIGH/S]** Global swipe handler hijacks scrolling inside the open data sheet — In touchstart, record gestureTarget = e.target; in touchend, bail if gestureTarget.closest('.sheet-content, #ball-drawer, .toolbar, input'). Track a single touch identifier and ignore multi-touch. Als
- **[HIGH/M]** Header controls are ~29px tall — five in a row, and Junior mode does not enlarge them — Give header buttons min-height:44px (pad vertically, keep pixel font), and in Junior mode collapse the header to just music + PC with oversized hit areas; move player switching behind settings or add 
- **[MEDIUM/S]** Open ball drawer survives swipe/nav — the throw can hit a different Pokémon — Close the drawer in loadPoke()/nav(), and add a scrim over the rest of the screen while the drawer is open that dismisses on tap and swallows swipes.
- **[MEDIUM/S]** RUN / END MATCH sits inside the moves grid, identical styling, no confirmation — Visually separate RUN (smaller, outlined, corner placement) and require a confirm ('Really run away?') when a trainer/gym or versus battle is in progress; wild-encounter RUN can stay one-tap.
- **[MEDIUM/S]** Collapsed bottom-sheet handle lives in the iOS home-indicator gesture zone — Add padding-bottom: env(safe-area-inset-bottom) inside the sheet so the handle and quick-stats render above the indicator, and since the app is a PWA, consider CSS overscroll-behavior plus moving the 
- **[LOW/S]** PC gen tabs and CRT-green search are undersized for the primary collection screen — Bump gen tabs to min-height 44px and team slots to 44px+ hit areas (padding, not image size, can supply it); 5px pixel-font labels should be at least 7px.

### Dr. Sam Ellington
*Play psychology — reward schedules, celebration density, failure exper*

- **[HIGH/M]** Versus mode structurally guarantees the 4-year-old loses — Level-normalize versus by default: build both sides' fighters at a fixed level (e.g. both at 50), so team choice and type matchups decide the winner, not playtime. Add a comeback mechanic (loser of th
- **[HIGH/S]** No pity mechanic on dex-catch RNG — unbounded fail streaks on rare species — Add a per-species consecutive-miss counter that multiplies odds (e.g. +25% relative per break-free, reset on catch). Invisible, cheap, and converts fail streaks into rising tension with a guaranteed p
- **[MEDIUM/M]** Auto-catch on KO makes the entire ball system strictly dominated in battle — Differentiate the paths: ball-catch grants a bonus (e.g. +50% XP, or ball-caught mons join at the wild's level while KO-catches join at Lv5 — ensureMon already supports a level arg, battle.js:600). No
- **[MEDIUM/S]** Gym progression can never trigger the evolution celebration — In handleEnemyDown/handleVictory for gyms, set pendingEvolution when ups > 0 for the active mon (mirror concludeCapture at battle.js:627). One-line-per-site fix.
- **[MEDIUM/M]** Reward curve is severely front-loaded, then flatlines — Add a second badge tier keyed to late content (beat 3 gyms, catch a legendary, catch a shiny, evolve a Pokémon, 100 caught, beat the Champion) and consider making gym spoils a choice of ONE mon from t
- **[LOW/S]** Defeat and errors are delivered via raw browser alert() — Route the wild-defeat path through the same styled modal as gym defeat, with the emoji-forward encouraging copy pattern already established.

### Dr. Lena Morris
*Digital wellbeing & dark-pattern ethics*

- **[HIGH/S]** UTC day boundary rug-pulls quest progress during prime play hours — Key the day on local date instead: e.g. const d = new Date(); return d.getFullYear()*10000 + (d.getMonth()+1)*100 + d.getDate(). One-line change; midnight local is a boundary no child is awake to lose
- **[HIGH/S]** Near-miss shake theater on failed catches with no pity floor — Add a per-species pity counter: after ~4 consecutive failures, the next throw succeeds ('It's getting tired!'). Also make 3 shakes mean success only — a failure caps at 2 — so the animation is honest 
- **[MEDIUM/M]** Master Ball economy funnels into a daily check-in loop once badges run out — Decouple the reward from the calendar: award a Master Ball per 3 quests completed cumulatively (a persistent counter), and let an unfinished quest board simply roll over instead of expiring. The quest
- **[MEDIUM/M]** Sparkle unlock chains a compound lottery with unbounded grind — Add a shiny charm pity: after ~25 encounters without a shiny, the next one sparkles guaranteed (kids feel luck arriving, not withheld). Or unlock Sparkle team-wide from ANY shiny — the first shiny is 
- **[LOW/S]** Explore's 2.9-second anticipation ritual is unskippable — Make a tap during the rustle skip to the reveal. Keep the full ceremony automatic for rare/legendary tiers only — that preserves the goosebumps where they're earned.

### KENJI WATANABE
*Franchise fidelity: catch math, evolution, type chart, gym structure*

- **[HIGH/M]** Physical/Special split ignored — special attackers are gutted — Add spAtk/spDef to computeStats and branch on move.damage_class: special moves use spAtk/spDef, physical use atk/def. The data is already in the cache; this is a ~10-line change that makes Alakazam fe
- **[HIGH/M]** Status moves deal damage and movesets ignore learnsets — Filter out moves where mData.power == null (fall back to tackle if empty) — one-line fix, effort S on its own. Better: keep each move's level-up learn level in slimPokemon and pick from moves learnabl
- **[MEDIUM/S]** Type chart bug: Fire doesn't resist Steel — Add 'steel' to fire's resist list in config.js line 32. One word.
- **[MEDIUM/M]** Evolution flattens branches — Eevee can only ever become Vaporeon — Keep the full branch array in slimEvo and, when a branch point is reached, show a choice modal — 'Which will EEVEE become?' with sprites. Kids choosing their Eeveelution is a better moment than the ma
- **[MEDIUM/M]** Legendaries spawn like Rattata and are auto-caught by KO — Exclude is_legendary/is_mythical from the normal wild pool. Make legendaries rare gated encounters (e.g., unlocked per badge, spawning at Lv50+ with no auto-catch — ball throws only, using the real ca
- **[LOW/S]** No damage variance — identical matchups play out identically — Multiply damage by (0.85 + Math.random()*0.15) after line 430. One line, restores drama without adding frustration.

### Rafa Costa
*Sibling co-play: P1/P2 switching, versus handoff, save collisions, jea*

- **[CRITICAL/M]** Save import silently obliterates the OTHER brother's progress — Before applying an import: (1) snapshot the current save to a pokedexos_save_backup_<timestamp> key with a RESTORE button in Parent Tools; (2) show a confirm dialog comparing incoming vs current per p
- **[HIGH/S]** Gym endurance HP bleeds between brothers on player switch — Add `owner: state.currentPlayer` to gymRun, include it in the endurance checks at battle.js:191 and 361, and call clearGymRun() inside togglePlayer. Three lines.
- **[MEDIUM/S]** Player switching is allowed mid-Explore and mid-Gym, crediting the wrong brother — Extend the guard to `state.appMode !== 'dex'`, and re-render the gym/explore screens on any legal switch so displayed unlock state always matches player().
- **[MEDIUM/M]** Versus is structurally unfair to the younger brother: raw levels, no handicap, and P1 wins — Add a 'FAIR FIGHT' toggle on the VS start (default ON when either player has junior enabled): temporarily normalize both sides to a common level (e.g. max of the two leads) in buildFighter calls — cos
- **[MEDIUM/S]** END MATCH lets the losing brother rage-quit and void the winner's earned VS win — Make END MATCH a two-step confirm, and record a forfeit as a win for the other side with gentle framing ('{name} takes the round — rematch anytime!'). Keep the language soft; keep the stat honest.
- **[LOW/S]** Each brother can toggle the OTHER's Junior Mode from the open settings panel — Move the CURRENT player's junior toggle to stay open, but gate flipping the OTHER player's toggle behind the existing Parent Tools PIN (requirePin is already exported-adjacent in devtools.js). Alterna

### Grace Liu
*Battle mechanics: damage formula, STAB/crits, turn order, damage-class*

- **[HIGH/S]** Status moves silently become 40-power attacks of their type — In buildFighter, after getMove, drop moves where `mData.damage_class === 'status'` or `mData.power == null` (retry the shuffle pool until 4 damaging moves are found; the pool is large). Delete the nam
- **[HIGH/M]** No physical/special split — special attackers are structurally gutted — Add spAtk/spDef to computeStats (same formula), keep each move's damage_class from getMove, and in performAttack select atk/def vs spAtk/spDef by the move's class. ~10 lines; no new fetches, no cache 
- **[HIGH/S]** Explosion/Self-Destruct are free 250-power nukes the smart AI will spam — Cheapest fix: clamp move power to ~120 in buildFighter (Math.min(mData.power, 120)) and exclude the self-KO move names (explosion, self-destruct, misty-explosion). Purist fix: implement the recharge/s
- **[MEDIUM/M]** Movesets re-rolled per battle via a biased shuffle — no move ownership, lottery difficulty — Replace with a Fisher-Yates shuffle at minimum (2 lines). Better: weight-select moves whose power roughly fits the mon's level, and persist the roll (see boldest_idea).
- **[MEDIUM/S]** Sparkle's flat 2.0x damage multiplier flattens every mechanic under it — Reduce Sparkle to 1.25-1.3x — still visibly 'stronger' in the damage pops (spawnDamagePop shows exact numbers) but no longer mechanics-erasing — and make the shiny sprite/particles the real reward. Ke
- **[LOW/S]** Zero damage variance: every non-crit hit is the identical number — Multiply damage by (0.85 + Math.random()*0.15) — one line, invisible to the 4-year-old, restores 'will it KO?!' tension for the 7-year-old. Skip accuracy/miss entirely; whiffed turns feel bad at this 

### OSCAR PENA
*collection-meta: completion pace, rarity economy, legendary earnabilit*

- **[CRITICAL/M]** The dex browser is an ungated catch firehose that makes every other collection system cosm — Gate dex-screen catching behind 'seen': you can only throw a ball at a species you've encountered in explore, battle, or gyms. Unseen species render as silhouettes. This one valve turns the dex from a
- **[HIGH/M]** Capture-all-on-gym-win bulk-deposits 21% of the dex as text lines and obsoletes the raisin — Replace capture-all with 'pick ONE Pokémon from their team to keep' — a real choice, a real ceremony (show the three, let him tap one, play the catch animation), 3x less flood — and cap its join level
- **[HIGH/M]** 52% of the dex (336 species) is unreachable through any play system — Add 4-6 Gen 3-5 habitats (Hoenn Coast, Sinnoh Peaks, Unova City) reusing the existing habitat-card UI, or a rotating daily 'MIGRATION!' pool that cycles unreachable species through existing habitats —
- **[MEDIUM/M]** Legendary economy is incoherent: the front door is astronomical, the back door is wide ope — Make legendaries encounter-only (excluded from dex-screen catching even after the seen-gate, until seen in explore), raise the roll to ~2.5%, and let badges unlock specific legendary 'lairs' — e.g. Ea
- **[MEDIUM/S]** Gym capture-all silently completes 'Catch N Pokémon' daily quests and inflates catch stats — Dispatch kind:'gymCatch' (or omit the event) for capture-all grants so quests and the catches stat only count deliberate ball throws.
- **[MEDIUM/M]** Duplicates are dead ends — collecting has no repeatable loop between new species — Give duplicate catches a payoff that feeds the raising system: +25 XP candy to that species (or your lead), and a per-species catch counter on the PC card ('CAUGHT x7'). Duplicates become fuel, explor

### Ines Schultz
*Vanilla-JS architecture: module graph, event-bus workarounds, battle.j*

- **[HIGH/S]** doSwitch re-enables move buttons mid-switch: button-mashing fires overlapping turns — Set battleState.busy=true at the top of doSwitch and clear it at the end (the executeTurn guard then holds); or make renderActive render buttons disabled and only enableMoves(true) explicitly. Same au
- **[HIGH/M]** Inverted dependency: the battle engine imports UI screens (gym.js, pc.js), which is what f — Extract gymRun/clearGymRun/recordGymWin into a DOM-free gymstate.js (alongside gymdata.js), and replace the openPC('team') call with a dispatched event or a callback passed at init. battle.js then imp
- **[HIGH/L]** Versus mode is a second, parallel turn engine that aliases Player 2 onto battleState.wild — Make the core loop side-symmetric: a side = { ids, loaded, activeIdx, controller: 'human'|'ai', ownerPlayer }. executeTurn, checkFaints, and switching operate on side objects; versus becomes 'two huma
- **[MEDIUM/M]** battleState accumulates undeclared mode flags branch-checked at ~15 sites — Build one immutable battle-config object per launch - { mode: 'wild'|'gym'|'versus', canCatch, juniorShield, endurance, trainer } - created in a single makeBattleConfig(mode) and swapped wholesale on 
- **[MEDIUM/S]** Eleven stringly-typed event names with no constants: a typo fails silently — Add a 20-line events.js exporting EV = { BATTLE_STARTED: 'battle-started', ... } plus emit(name, detail)/on(name, fn) helpers; import the constants everywhere. Cheap, mechanical, and it turns the invi
- **[MEDIUM/M]** Pure combat math is fused to DOM and sleeps, so the balance-critical code is untestable — Extract engine.js with pure functions: computeDamage(attacker, defender, move, opts) returning { dmg, crit, typeMult }, computeStats, catchChance(wild, ballMod, opts), pickMove(attacker, defender, sma

### MARCUS WEBB
*State management — save integrity, write races, persistence discipline*

- **[CRITICAL/S]** Escaping a versus match leaves versusActive=true, silently disabling the 4-year-old's juni — Add `battleState.versusActive = false;` (and null out passResolver) in exitBattleMode. Longer term, make the junior check side-aware: resolve the owning player from the defender's side, not from state
- **[HIGH/S]** doSwitch re-enables move buttons before the opponent's free hit resolves — concurrent turn — Set battleState.busy = true at the top of doSwitch and clear it only after the free-hit/checkFaints completes; make renderActive render buttons disabled by default and let enableMoves(true) be the sin
- **[MEDIUM/S]** gymRun endurance HP is a global keyed only by mon id — one brother's battle damage bleeds  — Store the owning player on gymRun (gymRun.player = state.currentPlayer) and require it to match in the endurance checks at battle.js:191 and 361 — or simply call clearGymRun() inside togglePlayer.
- **[MEDIUM/S]** state.currentPlayer is never persisted — every reload dumps the 4-year-old back onto P1 wi — Persist currentPlayer (either inside the save blob or a sibling localStorage key), restore it in loadSave, and re-run applyJuniorClass/theme sync on boot.
- **[MEDIUM/M]** Whole-blob last-writer-wins persist with no cross-tab coordination can silently wipe a sib — Listen for `window.addEventListener('storage', ...)` on SAVE_KEY and re-run loadSave (plus UI refresh) when another tab writes; alternatively read-merge-write inside persist(). Even a crude 'reload st
- **[LOW/S]** Parent Tools removeMon leaves orphaned nicks/shinies and stale gymRun HP entries — In removeMon, also `delete P().nicks[id]`, filter it from shinies, and `delete gymRun.hp[id]` — three lines next to the existing deletes.

### Yuki Tanaka
*Code consistency: naming, error-handling patterns, dead code, magic nu*

- **[CRITICAL/S]** ESCAPE during Versus leaves versusActive=true, silently disabling the Junior shield — Make exitBattleMode the single teardown authority: reset versusActive, wildShiny, pendingEvolution, and passResolver there, alongside origin/trainer/canCatch. Every field the battle can dirty must be 
- **[HIGH/L]** Versus mode is impersonated through misnamed state: P2 lives in battleState.wild with orig — Rename the slots to role-neutral names (e.g. `allySide`/`foeSide` with a `mode: 'wild'|'trainer'|'versus'` discriminant) and give origin its real value ('versus') with an explicit returnTo field. Mech
- **[HIGH/M]** Two ball tables and two catch formulas — tuning one silently desyncs the other — Move BALLS, catchChance, and the XP formula into config.js as the single source; render the index.html ball drawer from the BALLS array at boot instead of hardcoding data-mod.
- **[MEDIUM/S]** Version string lives in five places and has already drifted — Add a 5-line release script (or npm script) that stamps one version constant into index.html and sw.js; at minimum, set the footer text from APP_VERSION at runtime so it can never lie again.
- **[MEDIUM/S]** Dead code and undeclared battleState fields accumulating — Delete selectFighter, index.v15.html, `before`, and lastXpMon; declare wildShiny/versusActive/pendingEvolution with defaults in the battleState literal so the object shape is honest.
- **[LOW/M]** Inline z-index ladder and three competing show/hide idioms — Move all z-index values to CSS custom properties in one ordered block (--z-modal, --z-evo, ...), and standardize on a hidden-class toggle so display comes from the stylesheet, not JS.

### Rosa Jimenez
*Mobile memory & runtime performance (DOM churn, caches, timers)*

- **[HIGH/S]** Service worker version bump nukes the entire sprite/artwork/API asset cache — Decouple the asset cache from the release version (e.g. const ASSET_CACHE = 'pokedexos-assets-v1') and only purge caches matching the shell prefix on activate. Sprites are immutable content-addressed 
- **[HIGH/M]** PC ALL view rebuilds ~4,000 DOM nodes and attaches 649 listeners on every keystroke — Attach ONE delegated click listener on #pc-grid at init (e.target.closest('[data-pc-id]')) — deletes 649 addEventListener calls per render for ~10 lines. Convert player().caught and teamPick to Sets b
- **[MEDIUM/S]** Dex gallery interval keeps flipping sprite src underneath battles, gyms, and the PC modal — Export a stopGallery() from dex.js and call it from every mode entry (battle-started, openExplore, openGyms, openPC); restart on return via the existing loadPoke path. Also stop the swap after N cycle
- **[MEDIUM/S]** saveCache JSON.stringifies the entire multi-MB cache on every single API miss, and getPoke — Debounce persistence: mark cache dirty and flush once via setTimeout(500)/requestIdleCallback instead of per-miss. Store canonical 'pkmn:<id>' entries only, with a tiny name→id alias map so name looku
- **[MEDIUM/S]** Music sequencer and AudioContext never suspend when the app is backgrounded or the tablet  — Add one document.visibilitychange listener: on hidden → remember current track, stopMusic(), ctx.suspend(); on visible → ctx.resume(), playMusic(remembered). Ten lines in music.js, fixes battery drain
- **[LOW/S]** 649 grid <img> tiles carry no width/height attributes and rely on CSS sizing only in one s — Add width="60" height="60" to the itemHtml template and contain: layout (or content-visibility: auto with contain-intrinsic-size) on .pc-item so offscreen tiles skip layout/paint entirely — content-vi

### Abel Girma, network engineer
*Cold-start network waterfall, request counts, batching strategy*

- **[HIGH/S]** A cold Champion battle costs ~66 API requests across up to 10 mid-battle loading stalls — The full enemy roster is known at startTrainerBattle (def.team). Kick off Promise.all(def.team.map(buildEnemy)) fire-and-forget right after the first enemy resolves — subsequent KO transitions become 
- **[HIGH/M]** Random 4-of-N move sampling defeats the move cache — moves are refetched nearly every batt — Ship a static moves.json in the repo: ~650 Gen 1-5 moves, and slimMove keeps only {name, power, type, damage_class} (api.js:74-76) — roughly 25KB, one shell-cached file. getMove becomes a synchronous 
- **[MEDIUM/S]** buildFighter serializes three independent round trips per fighter — Promise.all the species fetch with the move fetches, and new Image().src the chosen sprite URL inside buildFighter. Two-line change, removes 1-2 RTTs from every single fighter load in the game.
- **[MEDIUM/S]** Service worker hoards full ~100KB PokeAPI responses that api.js already slims to 3KB — In the SW fetch handler, don't cache pokeapi.co JSON at all (localStorage slim cache already makes repeats free) — keep SW caching only for raw.githubusercontent sprites and fonts, which are the bytes
- **[MEDIUM/S]** Explore/arena wild encounters roll a random 1-649 mon at tap time — guaranteed cold 6-requ — Roll the NEXT wild id when the current battle starts and prefetch it in the background (buildFighter fire-and-forget). The loading modal disappears from the second encounter onward — the tap-to-battle
- **[LOW/S]** Press Start 2P via render-blocking Google Fonts CSS instead of the shell cache — Self-host the single woff2 (~30KB) in the repo, declare @font-face in main.css with font-display:swap, add it to SHELL_FILES. Two origins eliminated, font guaranteed offline from install time.

### Chloe Dubois
*Asset loading: sprite delivery, caching, decoding, and upscaling*

- **[CRITICAL/S]** Service worker never actually caches sprites — opaque responses fail the resp.ok guard — Change the guard to `if (resp.ok || resp.type === 'opaque')` (opaque responses are safe to cache-first here since sprites are static), or add crossorigin="anonymous" to all sprite <img> tags — raw.git
- **[HIGH/S]** Sprite URLs pinned to mutable 'master' branch of PokeAPI/sprites with no error fallback — Pin SPRITE_BASE to a commit SHA (immutable, safely cacheable forever) and add a delegated error handler that swaps failed sprites to the local poke-ball placeholder: document.addEventListener('error',
- **[MEDIUM/S]** Dex gallery cycles a ~300KB 475x475 official artwork PNG through image-rendering:pixelated — Scope pixelated to the pixel-art sprites only (`#poke-sprite.pixel, .pc-item img, ...`) and toggle a class when showing artwork; pre-decode the next frame with `const i=new Image(); i.src=next; await 
- **[MEDIUM/S]** Battle sprites are assigned at render time with zero preloading — GIF pop-in mid-intro — On team-confirmed and on gym trainer selection, fire-and-forget `new Image().src = ...` for each team member's animated back sprite and each opponent's front sprite (plus shiny variants when player().
- **[LOW/S]** No preconnect to the two hosts every sprite and API call depends on — Add `<link rel="preconnect" href="https://raw.githubusercontent.com" crossorigin>` and the same for pokeapi.co. One line each; shaves the cold-start of the most-tapped screen in the app.
- **[LOW/M]** PC search rebuilds up to 649 <img> nodes per keystroke — Render all 649 items once and filter by toggling a hidden class (or display:none) per item on input — the browser keeps decoded images alive and search becomes O(class toggle). A 150ms debounce is a t

### Niko Virtanen
*Service worker: caching strategy, update lifecycle, offline correctnes*

- **[CRITICAL/S]** ASSET_CACHE never caches sprites, cries, or font CSS — offline images are broken — Cache opaque responses for the sprite/cry hosts: `if (resp.ok || resp.type === 'opaque') cache.put(...)` — these URLs are immutable so a cached opaque error is low-risk, or better, refetch same-URL wi
- **[HIGH/S]** Shell cache poisoning: non-OK and captive-portal responses overwrite good cached shell fil — Guard the put: only cache when `resp.ok && resp.status === 200`. For captive-portal defense on index.html, additionally sanity-check `resp.headers.get('content-type')` matches the request destination 
- **[MEDIUM/S]** Every version bump nukes the entire asset cache, contradicting the 'cache forever' design — Rename to a version-independent `pokedexos-assets-v1` and change the activate filter to delete only stale SHELL caches (e.g. keys matching `-shell` that aren't current). Bump the assets suffix only if
- **[MEDIUM/S]** Network-first shell has no timeout — lie-fi means a 20-60s blank boot — Race the network against a short timer: `Promise.race([fetch(req), timeout(3000)])`, falling back to `caches.match(...)`, and only hitting the network-error path if there's no cached copy. Alternative
- **[MEDIUM/M]** Shell cache has no version atomicity — offline boot can serve a mixed-version app — Let install-time `addAll` be the sole writer of SHELL_CACHE (drop the runtime put, keep network-first serving), and rely on the SW byte-diff update cycle to refresh the shell atomically. Keep bumping 
- **[LOW/S]** Runtime cache.put calls are not wrapped in event.waitUntil and errors are unhandled — Wrap the write: `event.waitUntil(caches.open(...).then(c => c.put(...)).catch(() => {}))` in both branches.

### Pixel Pete Ramirez
*GBA visual-language consistency: emoji vs pixel art, palette disciplin*

- **[HIGH/S]** Dex gallery crossfades pixel sprites into smooth official artwork every 4 seconds — Pick one language for the hero: keep only animated/front_default pixel sprites in the cycle (delete `sp.official` from the imgs array), or if the artwork frame stays, exempt it with `image-rendering: 
- **[HIGH/S]** Press Start 2P rendered at 5-7px shatters the font's own pixel grid and is illegible for k — Enforce an 8px-grid type scale: 8px minimum everywhere, 16px for emphasis. Where 8px doesn't fit (pc-grid names, badge labels), drop the label and let the sprite carry meaning, or truncate harder — ne
- **[MEDIUM/M]** Color emoji are the app's entire iconography inside a pixel-art shell — Triage: keep emoji where they're content the 4-year-old navigates by (habitat/gym crests work as pre-reader wayfinding), but replace UI chrome icons with the pixel assets already in reach — PokeAPI it
- **[MEDIUM/M]** Battle and dex sprites are upscaled to arbitrary non-integer factors under image-rendering — Snap to integer multiples of the sprite's natural size: read naturalHeight on load and set height to 2x or 3x (96 → 192px fits both battle slots and the dex hero), letting the layout breathe around a 
- **[LOW/S]** CRT scanlines cover the console shell, desktop bezel, and modals — and moiré at 1px on mob — On desktop, clip #scanlines to the 520px frame (match the .app-container media query). Bump the pattern to 2px-on-4px so it survives fractional DPRs, drop opacity to ~0.06, and consider parenting it b
- **[LOW/S]** Smooth easing leaks into an otherwise stepped motion language — Give the two full-screen containers a steps(8) slide or reuse the existing #screen-wipe for scene entry; fill the dex bar with steps(12); replace card :active transitions with instant transform (the o

### Sarah Oduya
*iOS Safari / standalone PWA behavior*

- **[HIGH/M]** Parent Tools PIN gate is built entirely on prompt()/alert(), which are unreliable in iOS s — The app already has a complete overlay-modal system (settings-modal, badge-modal, sparkle-modal). Build one reusable in-game dialog (text + optional input + OK/CANCEL) and replace every prompt()/alert
- **[HIGH/S]** AudioContext never recovers from iOS 'interrupted' state — game goes silent after backgrou — Add a visibilitychange/focus listener that calls resume() on both contexts whenever state !== 'running' (covering 'interrupted'), and also opportunistically resume at the top of playBeep/blip. Better:
- **[MEDIUM/S]** Home-screen icon is a remote 30x30 sprite — blurry blob or gray fallback tile on the boys' — Ship local icons in the repo: apple-touch-icon.png at 180x180 plus 192/512 in the manifest (and add them to SHELL_FILES in sw.js). A crisp upscaled pixel-art Poké Ball on a red rounded square takes 20
- **[MEDIUM/S]** Junior-mode TTS queues instead of interrupting, and utterances can be GC'd leaving the VOI — In speak(): hold the current utterance in a module-level variable until onend/onerror; call speechSynthesis.cancel() before junior-mode name announcements (the 50ms cancel→speak gap used in toggleVoic
- **[LOW/S]** Every haptic in the game is a silent no-op on iOS — the feedback design was tuned for a pl — Don't chase the iOS 18 checkbox-switch haptic hack for gameplay. Instead compensate in channels iOS does have: sync a subtle CSS screen-shake/scale pulse on the .visual-display with each sfx.shake(), 
- **[LOW/S]** Defeat in a wild battle is delivered as a native alert() — the harshest moment gets the ug — Route wild-battle defeat through the existing victory-modal with encouraging copy (the gym path already proves the pattern), and turn the 'catch one first' gates into the badge-modal style with a big 

### JUN PARK
*Game-feel, animation & juice*

- **[HIGH/M]** Attacks have zero attacker motion and no hit-stop — impact appears from nowhere — Add a 3-beat impact grammar: (1) attacker lunge — a 150ms keyframe translating ~24px toward the defender (player: up-right, wild: down-left) triggered right after the move text; (2) 80-100ms hit-stop 
- **[HIGH/M]** No faint animation and no entry animations — the two biggest payoff moments are sprite src — Faint: one keyframe — squash to scaleY(0.85), then translateY(120%) with grayscale+fade over ~500ms, steps(5) to stay on-brand — plus a descending sfx. Entry: wild slides in from the right (translateX
- **[MEDIUM/S]** Immune hits ('It had no effect!') still show a '-1' damage pop, particles, and hit flash — Guard the whole feedback block: if (typeMult === 0) skip pop/particles/flash/vibration and instead play a distinct 'whiff' — defender unaffected, attacker does a small confused hop, dull thud sfx. The
- **[MEDIUM/S]** Battle capture suck-in is an instant snap — .battle-sprite-wild has no transform transitio — Add 'transition: transform 0.45s cubic-bezier(0.5,0,0.5,1), opacity 0.4s' to .battle-sprite-wild (and player). One CSS line. Bonus: tint the sprite red/white (filter: sepia+hue-rotate) for 100ms befor
- **[MEDIUM/S]** Hit flinch kills the idle float and knocks both sides in the same (sometimes wrong) direct — Compose instead of replace: .hit-anim { animation: float 3s ease-in-out infinite, flashHit 0.3s steps(2); } and rewrite flashHit to use translateX via a CSS var (--knock: -10px for wild, +10px... i.e.
- **[LOW/S]** Ball wobble pivots around its center and the throw has no arc or bounce — transform-origin: 50% 88% on .ball-shake fixes the pivot in one line. For the arc: replace the transition with a ~700ms keyframe animating translateX and translateY separately (X linear, Y with two cu

### Freya Lindqvist
*Typography & layout — Press Start 2P legibility, line length, contrast*

- **[HIGH/M]** Fourteen text styles set Press Start 2P below its 8px bitmap grid — 5-7px text is decorati — Impose a hard floor: nothing in Press Start 2P below 8px. Where 5-6px was used to make text fit (badge names, ball sub-labels, PC names), cut the text instead of the size — e.g. drop '1.5x RATE' capti
- **[HIGH/S]** White 6px type-badge text on light type colors fails contrast catastrophically (1.48:1 on  — Pick text color per type by luminance: dark ink #24243a on light types (electric/grass/ice/fairy/ground clear 6.5-11:1 with ink — verified), white on dark types (ghost, dragon, fighting). One small he
- **[MEDIUM/M]** Relentless ALL-CAPS in the battle log and dialogs fights a developing reader — and isn't e — Drop text-transform: uppercase from .battle-log and stop uppercasing sentence text in JS; keep .toUpperCase() only on Pokémon names. Result is both easier for the 7-year-old and closer to the source m
- **[MEDIUM/S]** Per-screen hierarchy is inverted: the text a child must read is the smallest on screen — Establish a three-tier scale and enforce it: labels 8px, reading text 10px minimum (line-height ≥1.8), headings 13px+. Concretely bump .modal-box p, .card-quest, #card-oak, .trainer-taunt and #victory
- **[MEDIUM/S]** Uncaught PC-box labels render at 2.04:1 contrast and 5px — the collection screen is unbrow — Keep the sprite dimming for uncaught mons (that's the fun silhouette-guessing) but hold the label at rgba(107,255,107,0.55)+ (~4.5:1) and 8px. The dim sprite alone communicates 'uncaught'; the label d
- **[LOW/S]** Press Start 2P is fetched from Google Fonts with a metrically alien fallback — offline/fir — Self-host the single ~30KB press-start-2p woff2 in the repo, declare @font-face locally, add it to SHELL_FILES so the PWA is truly offline-complete, and it becomes deterministic on GitHub Pages foreve

### DINA HASSAN
*Sound design: SFX vocabulary, missing sounds, TTS for kids*

- **[HIGH/S]** Junior Mode TTS queues instead of interrupting — fast swiping builds a minutes-long name b — In speak(), call window.speechSynthesis.cancel() before speechSynthesis.speak(utter) (or add an { interrupt: true } option used by the dex.js:138 call). One line; transforms Junior browsing from chaot
- **[HIGH/S]** Level-up and faint — the two biggest emotional beats — have zero sound — Add sfx.faint (descending pitch sweep: osc.frequency.exponentialRampToValueAtTime from ~600Hz to ~80Hz over 0.5s — the classic GB faint) at all three faint sites, and sfx.levelUp (rising 4-note arpegg
- **[MEDIUM/S]** sfx.catch is overloaded as the universal 'success' sound, destroying the catch's audio ide — Give celebrations their own longer fanfare-ish jingle (or reuse playMusic('victory') which already exists and is currently only wired to battle-victory), keep sfx.catch exclusive to captures, and move
- **[MEDIUM/S]** UI is silent: no tap, menu-open, page-turn, or navigation sounds — and the vibration subst — Add sfx.tap (short 1000Hz square, 0.03s, vol 0.06) and sfx.open (two quick rising blips). Cheapest wiring: play sfx.tap inside the on() helper in main.js:99-102 so all ~30 buttons get it in one line; 
- **[MEDIUM/M]** TTS uses the OS default voice at pitch 0.5 — a low robotic drone reading Pokédex entries t — Set utter.lang='en-US' and pick a voice once from speechSynthesis.getVoices() (prefer names matching /Samantha|Google US English|Natural|Aria/, falling back to first en-* voice; note getVoices() popul
- **[LOW/M]** SFX (vol 0.2-0.3) are ~6-10x louder than music (0.028-0.05) with no shared bus or ducking — Share one AudioContext with sfxGain and musicGain buses feeding a masterGain; drop sfx to ~0.12-0.15 or raise music slightly. Bonus: momentarily dip musicGain.gain during speak() so TTS is intelligibl

### BEEP KOWALSKI, chiptune composer
*Music: the 4 procedural tracks, harmony, loop structure, missing theme*

- **[HIGH/S]** Triangle bass is written an octave too low to be heard on the kids' actual speakers — Transpose every bass note up one octave (E2→E3 etc. — pure data edit in TRACKS), or double each bass hit with a quiet square one octave up. A/B it on an actual iPad, not headphones.
- **[HIGH/M]** SFX and cries are 15-24dB louder than the music — the score is subliminal — Merge to one AudioContext with musicBus and sfxBus GainNodes. Raise music to ~0.10-0.15, pull SFX to ~0.15-0.2, and duck musicBus by ~6dB while a cry or TTS line plays (a simple gain ramp on the share
- **[MEDIUM/M]** Loops are 5.7-9.2 seconds with no B section — ear fatigue in minutes — Double each track to 64 steps: keep bars 1-4 as-is, write bars 5-8 as an answer phrase (transpose the lead motif up a 4th, walk the bass differently). Pure data change, no engine work. The dex theme, 
- **[MEDIUM/S]** Victory fanfare ends in dead silence over the whole victory/evolution sequence — Add a short looping victory-lap track (relaxed C-major, ~120bpm) and call playFanfare('victoryLoop'); write a dedicated 16-bar evolution cue (rising ostinato → resolution on the reveal) and trigger it
- **[MEDIUM/M]** setInterval-per-note scheduling will drift and lurch under load — Use the standard lookahead scheduler: a ~100ms setInterval that schedules all notes falling in the next ~200ms against the AudioContext clock. ~15 lines, makes tempo rock-solid regardless of main-thre
- **[LOW/S]** Gym track has two exposed dissonances against the bass — Change the B4 over F2 to A4 or C5 (keeping the contour), and start the final ascending run on the '&' of the beat so F4 doesn't strike simultaneously with E2 — or start the run from G4.

### CARLOS MENDES, WCAG auditor
*Accessibility: semantics, focus management, color-only information, mo*

- **[CRITICAL/S]** LED blink and evolution flash strobe at/above the 3-flashes-per-second seizure threshold — Slow ledBlink to >=1s. Replace the infinite invert strobe with 3 flashes max followed by a gentle white glow pulse; cap any luminance-inverting animation at 2 flashes/sec. Both are pure CSS keyframe e
- **[HIGH/S]** Zero prefers-reduced-motion support across ~15 always-on animations, including full-screen — Add one @media (prefers-reduced-motion: reduce) block that kills shake/wipe/float/rustle/ledBlink/badgeBounce and hides #scanlines, plus a matchMedia guard around classList.add('shake'). ~20 lines, ho
- **[HIGH/M]** Half the interactive surface is click-only divs: invisible and inoperable for keyboard and — Convert the templated divs to <button> (everything is fully restyled already, so button chrome is a non-issue) or add role='button' tabindex='0' + Enter/Space in the shared wiring helpers. Delete maxi
- **[HIGH/M]** Thirteen modals with no dialog semantics, no focus trapping, and no Escape handling — Give each modal role='dialog' aria-modal='true' and add one shared openModal()/closeModal() helper that saves document.activeElement, focuses the primary button, traps Tab, and closes on Escape. Every
- **[MEDIUM/S]** Battle is silent to assistive tech: no live regions and no alt text anywhere — Add aria-live='polite' to #battle-log, #encounter-text and the catch-msg elements; give HP containers role='progressbar' with aria-valuenow; interpolate alt='${name}' in sprite templates where the nam
- **[MEDIUM/S]** Game state conveyed by color/filter alone: HP thresholds, beaten/locked cards, damage effe — Add glyph/text cues: ✔ overlay on beaten trainer cards, 🔒 on locked ones, '!'/'...' suffixes on super/weak damage pops, and a small numeric or segmented readout for the wild HP bar. Pure template-stri

### Annika Berg
*Motor accessibility: target sizes, gesture demands, timing windows*

- **[HIGH/S]** Gen tabs are ~35x41px, seven abreast, with no Junior-mode enlargement — Add body.junior #gen-tabs rules: two rows (flex-wrap) of tabs at min 48px height, 12px font; or in Junior mode replace tabs entirely with big < GEN > paddle buttons. In normal mode, raise padding to 1
- **[HIGH/S]** 24px dev-mini delete button sits 4px from +/- and removes a Pokémon instantly, no confirm, — Two-tap arm-then-confirm on ✕ (first tap turns it into 'SURE?' for 3s), or a 5-second undo toast via setStatus. Also widen dev-mini to 40px min and move ✕ to the far edge with a 12px margin-left gap.
- **[MEDIUM/M]** Header buttons (settings gear, player toggle, PC, battle) are ~30px tall and explicitly NO — In body.junior: hide or hold-gate the settings gear (the parent can toggle junior from the other profile), and grow remaining header buttons to 44px min-height — the header comment's 'must fit' constr
- **[MEDIUM/S]** Parent Tools hold-to-open is pointer-only, 1.2s stationary, cancelled by pixel drift — and — Add a keydown Enter/Space handler that goes straight to requirePin() (the PIN is the actual gate), and tolerate drift by tracking pointer position with a ~24px slop radius instead of cancelling on poi
- **[LOW/S]** Swipe gestures demand 60-80px strict-axis-dominant strokes and fail silently on diagonal c — Loosen dominance to |diffX| > |diffY| * 0.6, reduce horizontal threshold to ~40px (buttons remain the fallback), and gate the swipe-open sheet behind !player().settings.junior to match the button beha
- **[LOW/M]** Post-catch nickname prompt() lands mid-celebration on a 2.1s timer and demands keyboard ty — Replace with a non-blocking 'NICKNAME?' button on the victory state that opens the sheet later at the child's pace, and add rename to the PC item long-view so a dismissed prompt is not a permanent los

### Victor Hugo Santos
*Test architecture & quality engineering*

- **[HIGH/S]** Zero unit coverage of the pure game math the whole game balances on — Add node --test (zero new deps) with table-driven tests: typeChart round-trip against a known-good matchup table; addXp boundary cases (exact threshold, multi-level jump, Lv100 cap); evolveMon team-sl
- **[HIGH/S]** Two divergent catch formulas, neither under test — Extract one catchProbability(captureRate, ballMod, {hpFrac, junior}) into a pure module, call it from both catch.js and battle.js, and pin its invariants (floor, junior=1, monotonic in ballMod) with u
- **[MEDIUM/M]** Global Math.random monkey-patching is leaky and tests unreachable states — Give the app an injectable RNG seam: a tiny rng.js module (export let rand = Math.random; export function seed(n){...}) used by battle.js/catch.js, seedable via ?seed= query param. Tests then get dete
- **[MEDIUM/M]** 71 hard-coded sleeps make the suite slow, flaky, and animation-clocked — Two-part fix: (1) route the engine's delays through config.js sleep and honor a test flag (?fast=1 → ms/20), collapsing runtime from minutes to seconds; (2) replace timeouts with event/state waits — t
- **[MEDIUM/L]** One 563-line sequential script: shared state cascades failures and blocks bisection — Split into scenario files (boot-and-catch, battle, gyms, junior, versus, migration) sharing the fixture/mock module, each seeding its own localStorage state via addInitScript. Add a runner that starts
- **[LOW/S]** Homogeneous fixtures leave the type system and edge mons untested end-to-end — Parameterize the fixture: give a handful of ids distinct types/stats/capture rates (e.g. 150 = psychic, rate 3, high stats; a dual-type; a zero-move mon) and add checks for the immunity and effectiven

### MEI CHEN
*Chaos & edge-case testing (double-taps, mid-animation interrupts, proc*

- **[HIGH/M]** ESCAPE button is live mid-turn — orphaned async battle loop can crash or contaminate the n — Add a battle generation counter: increment it in exitBattleMode and every launch; capture it at the top of executeTurn/doSwitch/executeBallThrow/handleEnemyDown and bail after every await if stale. Di
- **[HIGH/S]** Voluntary switch never sets busy and re-enables fresh move buttons — double-turn race duri — Set battleState.busy = true as the first line of doSwitch and clear it at the end; call enableMoves(false) immediately after renderActive(). Same pattern for the forced-switch branch.
- **[HIGH/S]** versusActive is never cleared on escape or defeat exits — silently disables the 4-year-old — Reset battleState.versusActive = false inside exitBattleMode alongside trainer/canCatch. One line.
- **[MEDIUM/S]** Catches are persisted only AFTER ~4 seconds of animation — killing the app mid-GOTCHA lose — Persist at decision time: call recordCatch/ensureMon/stats++ the moment success is rolled (or the wild faints), then play the animation purely cosmetically. recordCatch is already idempotent, so this 
- **[MEDIUM/S]** Trainer-battle defeat leaves busy semantics inconsistent and hands out a free ESCAPE retry — On RUN/ESCAPE from a trainer battle, snapshot current HP into gymRun.hp (or treat flee as a loss: clearGymRun). Either makes fleeing honest.
- **[MEDIUM/M]** Parent Tools PIN gate depends on window.prompt, which is unreliable in iOS installed-PWA m — Replace prompt() with a tiny in-game 4-digit keypad modal (matches the GBA aesthetic anyway) and keep localStorage storage. Verify on an actual installed iOS PWA.

### PAUL NDIAYE, save-integrity auditor
*localStorage limits with cache+save, corrupt-save recovery, import val*

- **[CRITICAL/M]** Import silently wipes both boys' saves on shape-passing garbage, with no backup or undo — Before assigning state.save in importCode: (1) write the current save to a backup key (pokedexos_save_backup) so any import is one-tap reversible from Parent Tools; (2) reject imports where both hydra
- **[HIGH/S]** Corrupt or future-version saves are silently discarded and then overwritten forever — On parse failure or unknown version, copy the raw string to pokedexos_save_quarantine before doing anything else, and accept version >= 2 through hydratePlayer (its spread already preserves unknown fi
- **[HIGH/M]** hydratePlayer validates container types only — imported element garbage reaches gameplay a — Make hydratePlayer a real schema pass: caught/team/shinies filtered to integers 1..MAX_POKEMON and deduped; mons values coerced to {level: clamped int 1-100, xp: finite number >= 0}; nicks and name re
- **[HIGH/S]** persist() fails silently under quota pressure the cache itself creates — hours of play can — On persist() catch: removeItem(CACHE_KEY) and retry the save (the cache is rebuildable, the save is not); if the retry also fails, show a persistent in-game banner ('SAVING BROKEN — TELL DAD'). Also d
- **[MEDIUM/S]** Legacy migration re-fires whenever a player's box is emptied, resurrecting ghost Pokémon — After a successful migration+persist, localStorage.removeItem both legacy keys (or set a pokedexos_migrated flag and gate on it).
- **[MEDIUM/M]** Two open tabs clobber each other's saves — last writer wins with no detection — Minimum: listen for the storage event on SAVE_KEY and reload state (or show 'game open elsewhere'). Better: add a monotonically increasing rev field; if the stored rev is newer than the one loaded, me

### Dr. Imran Shah
*Kids' privacy / COPPA — data egress, third-party requests, fingerprint*

- **[MEDIUM/S]** Remote Google Fonts ships the kids' IP + user-agent to Google on every cold load — Self-host: download the Press Start 2P woff2 into /fonts/, replace the three <link> tags with a local @font-face in css/main.css, add it to SHELL_FILES in sw.js. Removes Google from the request graph 
- **[LOW/S]** Free-text child input is sent verbatim to PokeAPI's servers — Gate the fetch: resolve typed input against the local name index first (exact or prefix match), and only issue a network request for a matched canonical name/ID. Bonus: gives the 7-year-old fuzzy matc
- **[LOW/S]** No privacy note anywhere despite README inviting other families to deploy — Add a 5-line PRIVACY.md (and a line in README + a note under the GROWN-UPS settings section, index.html:239-242): 'No accounts, no analytics, no data collection. All progress stays on your device. The
- **[LOW/S]** Save exports embed the children's real names in the code and file — Either strip the name fields from exportCode() (names are device-local preferences, not progress) or keep them only in the file variant with a one-line warning in the copy-code alert. Placeholder hint
- **[LOW/S]** PWA icons fetched from raw.githubusercontent.com bypass the service worker — Commit a local 180x180 and 512x512 icon into the repo, reference them relatively in both places, add to SHELL_FILES. One less third-party origin at install time, and a crisp icon the boys will actuall

### Tanya Blackwood
*Client-side XSS, save/import injection, and the Parent-Tools PIN under*

- **[CRITICAL/M]** Import code is a stored-XSS delivery vehicle: name/nicks copied raw into innerHTML — Add one escapeHtml() helper (replace & < > " ') and apply it to every user/import-derived value at the innerHTML boundary — nick, name, and any imported string. Better still, stop building these rows 
- **[HIGH/S]** Imported caught/team arrays aren't integer-validated, injecting XSS through id sinks — Filter caught and team through `.filter(Number.isInteger)` (and range-clamp to 1..MAX_POKEMON) inside hydratePlayer, matching what migrateLegacy already does. This closes the vector regardless of whet
- **[HIGH/M]** Parent-Tools PIN stored and compared in plaintext localStorage — Store a salted hash (SHA-256 via SubtleCrypto with a random per-install salt) instead of the raw PIN, and compare hashes. Rename the key to something less self-documenting. Accept that this is deterre
- **[MEDIUM/S]** PIN gate fails OPEN on any prompt() exception — Fail closed: on exception, deny access and surface a message ('Parent Tools unavailable on this browser'). If a kiosk fallback is truly needed, gate it behind an explicit build/config flag, not a sile
- **[MEDIUM/S]** Direct-entry nickname/name still unescaped — 12 chars is enough for some payloads — Same escapeHtml() / textContent fix as finding 1 — one boundary fix covers both hand-entered and imported strings. Verify by nicknaming a Pokémon `<b>x</b>` and confirming it renders as literal text i
- **[LOW/M]** No integrity or provenance on save codes — silent, un-attributable overwrite — Before applying an import, stash the current save to a `pokedexos_save_v2.bak` key and show a confirm() naming whose progress is about to be replaced ('This will replace P1 and P2 boxes — continue?').

### LUCIA MORETTI
*API integration: PokeAPI fair-use, caching, URL parsing, error taxonom*

- **[HIGH/M]** Timeout, 404, offline, and 5xx are all shown as the same error — and nothing ever retries — In apiFetch, classify errors: response.status===404 → NOT_FOUND ('No Pokémon by that name — check the spelling!'), e.name==='AbortError' → TIMEOUT, !navigator.onLine → OFFLINE ('No internet — ask a gr
- **[HIGH/S]** Rapid dex navigation has a stale-response race and fires redundant bursts at PokeAPI — Two small fixes: (1) a monotonic token in loadPoke — capture const seq = ++loadSeq at entry, bail out of the UI update if seq !== loadSeq after each await; (2) make cached() store the promise in an in
- **[MEDIUM/S]** Every release bump nukes the immutable sprite/API cache and triggers a full re-download st — Decouple the versions: name the asset cache 'pokedexos-assets-v1' (bump only if the slim/sprite format changes) and only version-purge the shell cache. In activate, filter deletions to keys starting w
- **[MEDIUM/S]** saveCache re-serializes the entire cache on every single write — O(n²) main-thread jank du — Debounce saveCache with a ~250ms trailing timer plus a flush on visibilitychange/pagehide. Longer term, move the API cache into the Cache API or IndexedDB (the SW already caches the raw responses — th
- **[MEDIUM/M]** Evolution chain parsing: bare split-pop URL parsing plus first-branch-only flattening — Replace the parse with const m = sUrl.match(/\/(\d+)\/?$/); skip the node if !m. Flatten all evolves_to branches into a small tree (or at least render branches side-by-side in the evo box) — the slim 
- **[MEDIUM/S]** Raw search input goes straight to PokeAPI — guaranteed-404 traffic for names the app alrea — Before fetching, strip punctuation and map ♀/♂ → -f/-m, then resolve the query against the nameIndex: exact → prefix → includes match, and fetch by the matched id. Only fall through to the network for

### Henrik Larsen
*Offline resilience & pre-caching (airplane-mode / road-trip readiness)*

- **[CRITICAL/M]** Offline playability is purely accidental — nothing is ever precached — Add a warm-up pass: on idle while online, iterate HABITATS pools + all gym team IDs + both players' caught lists, calling getPokemon() (localStorage data) and caches.add(PIXEL_SPRITE(id)) + the animat
- **[HIGH/S]** Every version bump deletes the entire sprite/asset cache — Rename to a version-independent 'pokedexos-assets' and change the activate filter to delete only caches matching the shell prefix (e.g. keys.filter(k => k.endsWith('-shell') && !k.startsWith(CACHE_VER
- **[HIGH/S]** Network-first shell has no timeout — flaky cell service hangs the whole game — Race the network against a ~2.5s timer: Promise.race([fetch(req), timeout(2500)]).catch(() => caches.match(req)) — or switch the shell to stale-while-revalidate, which still delivers the iOS-update go
- **[MEDIUM/M]** localStorage quota overflow nukes the entire offline data cache — Shrink slimPokemon.moves to ~12 randomly sampled entries (buildFighter only ever picks 4, battle.js:56-58), which cuts entry size ~4x; and on quota overflow, evict oldest pkmn entries LRU-style instea
- **[MEDIUM/S]** Explore builds 3 seconds of rustle suspense, then aborts with an adult error dialog offlin — Export hasCached(id) (and hasSpritesCached via caches.match) from api.js; when offline (navigator.onLine === false or after one failed roll), filter each habitat pool to cached IDs before rolling — ex
- **[LOW/S]** No offline awareness anywhere in the UI, and error copy targets adults — Add an airplane-emoji status chip when offline; on a failed dex load, auto-navigate to the nearest cached Pokemon instead of an error screen, and in Junior Mode speak('We need internet to find new Pok

### JORDAN AVERY
*Feature portfolio: kid-value vs maintenance cost, system coherence, un*

- **[HIGH/M]** Two rival badge/gym systems that never talk to each other — Fuse them: each of the 11 gym-leader defeats awards that gym's badge + 1 Master Ball via a check in recordGymWin, rendered on the trainer card (progression.js:149-152 already renders from BADGES — ext
- **[HIGH/M]** Legacy dex-screen catch bypasses the entire progression economy — For non-junior players, make the dex CATCH button start a wild battle against that Pokémon (startWildEncounter(state.curId) already exists in battle.js:166) instead of a raw throw. Keep the instant ta
- **[HIGH/S]** Sparkle power is locked behind near-unreachable odds — a de facto feature removal — Unlock sparkle account-wide after the FIRST shiny catch (p.shinies.length > 0) — one-line change to battle.js:110 — keeping shiny hunting exciting (each shiny is still a trophy with its ✨ PC badge) wi
- **[MEDIUM/M]** Trainer-team auto-capture floods the box and silently completes catch quests — Award ONE Pokémon per trainer win (let the kid pick from the beaten roster — a fun choice moment), don't fire 'catch' progress events for grants, and cap granted levels at lead level + 5. Keeps the 'w
- **[MEDIUM/S]** Daily quests are invisible until a kid opens the tiny CARD button — Surface it: put a quest pip/count on the CARD button (e.g. '🎖️ 1/3'), and after each catch/win/explore flash a one-line toast 'QUEST: Catch 2 Pokémon — 1/2!' using the existing gym-center-msg toast pa
- **[LOW/S]** Blocking prompt() nickname dialog interrupts the catch celebration — Replace prompt() with a themed, skippable inline input on the existing victory modal (a 'NAME IT?' field on victory-lines), defaulting to skip after no interaction. Keeps the celebration unbroken and 

### NADIA REZAI
*Scope & regression risk*

- **[CRITICAL/L]** battle.js is a 979-line three-mode engine sharing one mutable singleton — the #1 regressio — Freeze battle-engine features. Extract the pure math (computeStats, damage/crit/STAB in performAttack:430-445, catchChance:631-638) into a DOM-free rules module with unit tests, and make each mode an 
- **[HIGH/S]** One localStorage key, no backup: a single bad write or version mismatch silently erases bo — Before any persist() that follows a fresh-save load, stash the old raw blob to pokedexos_save_backup with a timestamp; keep a small rolling ring (3-5 snapshots, e.g. on first load per day). Add a 'RES
- **[HIGH/M]** The entire test suite is one 564-line order-dependent script — it will go flaky, then get  — Split into independent scenario files (dex/catch, battle, gym, versus, junior, save-migration) that each boot from an explicit seeded localStorage fixture, sharing the mock-route module. Replace Math.
- **[HIGH/S]** Next month's biggest risk is the roadmap itself — do NOT add online/sync, trading, more ge — Declare next month a stabilization release (v19 'invisible update'): findings 1-4 only, zero player-facing systems. Explicitly defer online anything, trading, new generations, and new battle mechanics
- **[MEDIUM/M]** No central mode state machine: appMode string + 4 booleans + CSS classes + CustomEvent bri — Introduce one tiny mode controller: a single setMode(next) with an allowed-transition table and a busy latch, and route all open/close/exit functions through it. Keep the CustomEvent bridges but have 
- **[LOW/S]** Gym capture-all floods the progression economy through an untyped event, inflating quests  — Give game-progress events a source field ('wild'|'gym-spoils'|'parent-tools') and let progression decide which sources count per quest/badge; fetch or embed roster types in gymdata so type quests beha

### Felix Brandt
*Session cadence & return hooks (daily quests, gym gating, shiny odds)*

- **[HIGH/S]** Daily quests roll over at UTC midnight, killing the morning 'new quests!' moment — Compute the day number in local time (e.g. use a YYYY-MM-DD string from new Date(), or subtract getTimezoneOffset()*60000 before dividing). Keep the existing seed formula so sibling-divergent quests s
- **[HIGH/M]** Daily quests are invisible unless the kid taps the CARD button — On first open of a new quest day, fire the existing celebration queue with an Oak greeting listing today's 3 quests (emoji-first for Junior: 🎣x2, ⚔️x1, 🌊x1); put a pulsing dot on the CARD button while
- **[HIGH/M]** No streak or any cross-day memory — day 40 is mechanically identical to day 2 — Add {lastDay, streak, bestStreak} to the save; show a flame/chain on the Trainer Card; make the all-quests reward scale gently with streak (day 3: +1 extra ball, day 5: guaranteed-rare next explore). 
- **[MEDIUM/S]** Gym spoils auto-complete catch quests without a ball throw, and quest XP falls back to Bul — Tag the spoils event (kind:'gym_catch' or pass a fromGym flag) and have bumpQuests count only real ball-throw catches toward catch quests — or at least fetch and pass real types so the inconsistency i
- **[MEDIUM/M]** Junior Mode zeroes the entire reward economy for the 4-year-old — Give Junior Mode its own reward text and a parallel visible collectible: quest sweeps award a sticker/stamp on the Trainer Card (big emoji grid he can count), and badges trigger the extra-generous con
- **[MEDIUM/M]** Flat 1% legendary and 1-in-50 shiny with no pity timer and no shiny in the main dex-catch  — Add a hidden pity counter per player: after ~30 legendary-less explores, force tier='legendary' on the next roll; after ~60 shiny-less encounters, force wildShiny. Also roll the same 1/50 shiny in the

### AMARA OSEI
*Post-Champion content: events, rotations, zero-server generative conte*

- **[HIGH/S]** Becoming Champion changes literally nothing — one modal line, then the game forgets — Persist `champion: {date, team: [...6 ids+levels]}` on the win. Gold-frame the trainer card, change Oak's dialogue permanently, show the Hall-of-Fame team (the exact six that won) on a new card sectio
- **[HIGH/M]** All 58 hand-crafted trainers become permanently unclickable dead UI after one win — Add 'ROUND 2' rematches unlocked by the champion flag: reuse GYMS verbatim but recompute levels with lv2=(g,i)=>50+g*4+... via the existing lv() pattern (gymdata.js:9), retitle leaders ('LEADER ROCKO 
- **[MEDIUM/M]** Daily quest pool is 10 static trivial quests — the only renewable loop caps out on day one — Triple the pool with quests targeting existing systems ('Find something RARE in the GHOST TOWER', 'Evolve a Pokémon', 'Win a VS battle', 'Catch a Pokémon over Lv40 area'), and add a champion-gated har
- **[MEDIUM/M]** No date-seeded events or rotations despite the seed infrastructure already existing — Seed from todayNumber(): pick one daily FEATURED habitat (banner + star on the habitat card) where rare odds double and a 'swarm' species from the full 649 list is injected into the common pool; on th
- **[MEDIUM/M]** 336 of 649 species are unreachable through play — late-dex completion degrades into menu-g — Don't hand-author 336 placements: procedurally backfill each habitat's pools at load time by type (fetch types are already cached via api.js), or add a champion-unlocked 9th habitat 'FARAWAY LAND' who
- **[LOW/S]** Oak's 100% dialogue announces the cliff out loud, and the badge track dies pre-champion — Add a second badge row gated on late-game feats the code already tracks: shinies caught (p.shinies), versusWins, explores 100, a Lv100 mon, dex 300/500/649, circuit complete. Rewrite the 100% Oak line

### Sofia Rossi — AI-behavior designer (opponent AI, difficulty curves, felt fairness)
*Trainer/wild opponent AI, difficulty legibility, and the felt experience of the Lv8→Lv80 gym ladder*

**Genuine strengths noted:**

- No omniscience in the normal turn loop: `executeTurn` locks the enemy's move at battle.js:410 BEFORE the player's attack resolves, so the AI never reacts to what just happened. That is the correct, honest architecture for a kids' game — most hobby engines cheat here.
- Difficulty is cleanly gated by opponent class: `pickEnemyMove` (battle.js:391-402) only thinks when `battleState.trainer` is set, so wild encounters stay a no-pressure sandbox and trainers carry the challenge. One constant (0.7) is the whole difficulty dial — an unusually tunable design.
- The loss model is genuinely kind and reads as such to a 7-year-old: defeat costs nothing but time — free full heal (battle.js:481), gym progress preserved, encouraging copy at battle.js:484 — and the fixed enemy queue with the `1/3` counter (battle.js:309) turns each trainer into a visible progress bar.

- **[CRITICAL/M]** Super-effective STAB is a one-shot at EVERY level tier — so the 70% AI is a 70% delete button — Floor survivability instead of nerfing the fantasy: cap any single hit on a player Pokémon at ~45% of its maxHp (a 'you always get to react' rule), or make incoming super-effective 1.6x while outgoing
- **[CRITICAL/S]** Switching — the one correct answer to a type-countering AI — is punished with a fully-informed free hit — Commit the enemy move before the swap: `const punish = pickEnemyMove(); battleState.activeIdx = newIdx; ... await performAttack('wild','player',punish);` — exactly like a real turn. Better for this ag
- **[HIGH/S]** The 'smart' AI maximizes the wrong quantity — it teaches the type chart backwards — Sort by expected damage: `(m.power||40) * getTypeMultiplier(m.type, target.types) * (attackerHasType(m.type) ? 1.5 : 1)`. Then the 'super effective' banner only fires on hits that genuinely hurt. Sepa
- **[HIGH/M]** Movesets are re-rolled every battle, so the AI can plan and the child cannot — Seed the shuffle deterministically per (pokemonId, level) so a Pokémon's four moves are identical every time it is sent out, cache them on the mon record, and filter candidates to roughly `power <= 40
- **[HIGH/S]** Junior mode faces the identical champion-grade AI — the 4-year-old is immortal but permanently pinned at 1 HP — Gate AI difficulty on mode, not just opponent class: `if (battleState.trainer && !junior && Math.random() < 0.7)`, plus a ~1.75x outgoing multiplier for Junior so fights end in 2-3 turns with his bar 
- **[MEDIUM/M]** Answering the mandate: wilds should stay dumb (but thematic), and trainers should NOT switch — Keep wild move SELECTION random but bias the move ROLL: guarantee at least 2 of 4 moves share one of the Pokémon's own types (STAB-first draft, remainder random). Habitats and gyms then read as advert

### Ivan Petrov — combat-math auditor
*Battle formulas: stat scaling, damage curve, level band, crit weight, Sparkle stacking, XP/catch economies*

**Genuine strengths noted:**

- The flat constants in computeStats (js/battle.js:38-41: +5 on atk/def, +10 on HP) are a genuinely smart kid-safe hack. At Lv5 they compress the entire 649-species base-stat spread into a ~1.9x damage band: a Lv5 Caterpie hits a Lv5 Bulbasaur for 9.4 (49% of its 19 HP bar) while a Lv5 Garchomp hits for 17.4 (92%). Nobody's random starter is hopeless. Nothing else in the codebase does this much work with two constants.
- The XP curve is properly tuned, which is rare. xpThreshold = 25 + 10*level (js/state.js:117) against gain = floor(base_exp/2 + level*3) (js/battle.js:509,612) yields 0.9-3.0 battles per level-up from Lv5 to Lv80 across the whole base_exp range (64/130/200 -> 1.60/0.94/0.65 at Lv5; 3.03/2.70/2.43 at Lv80). Total Lv5->Lv80 is 33,375 XP, ~159 battles. It is near-linear with no grind wall and no early-game stall. Do not touch this.
- Junior mode's invulnerability is implemented at the single damage sink (js/battle.js:441-443, defender.hp = Math.max(1, hp - damage*0.5)) rather than being scattered across UI checks, so it is mathematically airtight -- the 4-year-old literally cannot reach 0 HP -- and the `&& !battleState.versusActive` guard correctly removes the shield in brother-vs-brother VS so the 7-year-old isn't fighting a god.

- **[CRITICAL/M]** Wild levels rubber-band to your lead, so difficulty is mathematically flat from Lv5 to Lv100 — Decouple the two. (a) Make wild level a function of habitat/region, not the player -- Explore already has rarity tiers (js/explore.js:3), so give each habitat a fixed level band that rises as gyms are
- **[CRITICAL/M]** Zero damage variance plus deterministic initiative means the winner is decided before the kid touches a button — Three cheap fixes, in priority order: (1) multiply damage by 0.85 + Math.random()*0.15 at js/battle.js:439 so repeat fights aren't carbon copies; (2) randomize speed ties and give slower-but-stronger 
- **[HIGH/S]** Sparkle 2x stacks multiplicatively to 6x/9x and deletes the game mode it unlocks — Make Sparkle additive and scoped: apply +50% (damage *= 1.5) and only when active().id is the mon whose shiny was caught (hasShiny(active().id)), not the whole team. That leaves a 2.25x STAB-Sparkle h
- **[HIGH/M]** Throwing a Poke Ball is a strictly dominated strategy -- KOing auto-catches with 100% certainty — Pick one model. Either (a) remove auto-catch-on-KO for wilds and make balls the only route -- then rebalance catchChance so a weakened + Ultra Ball is ~75%, not 35% -- or (b) keep auto-catch and rebra
- **[HIGH/S]** The team of six is math-dead: only the KO'er gains XP, and the wild scales to the lead — Split XP across the party -- give the KO'er full XP and every other team member 50% (a two-line change in handleEnemyDown/concludeCapture). Additionally, derive wildLevel from the team's *average* or 
- **[MEDIUM/M]** computeStats has no Special Attack or Special Defense, plus two HP-readout bugs — Add spatk/spdef to computeStats and pick the pair based on the move's damage_class (PokeAPI returns it on the move object already fetched at js/battle.js:60) -- roughly 8 lines. Separately, change the

### Walt Fischer — reward-economy balancer
*Faucets vs. sinks: Master Ball economy, gym-spoils inflation, XP curve vs. the 58-trainer ladder*

**Genuine strengths noted:**

- The weaken-then-catch curve is genuinely well shaped: `hpFactor = (3*maxHp - 2*hp)/(3*maxHp)` in /home/claude/pokedex/js/battle.js:635 runs 1/3 at full HP to ~1.0 near zero, multiplied by capture_rate/255 and ball mod, clamped to [0.03, 0.95] (line 637). That is a legible risk dial a 7-year-old can feel — it is the one piece of real economy math in the codebase, and it deserves to matter.
- Junior mode diverges the economy at the leaves, not by forking the system: catchChance returns 1 (battle.js:632), Master Balls are never decremented (battle.js:674, catch.js:46), gym runs always start at full HP (battle.js:191, 546), and the drawer still renders the full 4-ball choice (battle.js:654). The 4-year-old gets a zero-attrition economy without a second code path to keep in sync.
- Daily quests are seeded deterministically per day AND per player (`seed = todayNumber()*7 + state.currentPlayer*13`, progression.js:41-47) with splice-based no-repeat picking. Two brothers get different dailies, neither can re-roll, and progress cannot be farmed by reopening the card.

- **[CRITICAL/M]** Auto-catch on KO makes every ball — including the Master Ball — strictly dominated; the ball economy has a faucet and no sink — Remove auto-catch on KO. A fainted wild should give XP and drop a Poké Ball; catching should require a throw while it is still standing — that instantly makes hpFactor, the 4 ball tiers, and Master Ba
- **[CRITICAL/M]** Gym spoils hand out 164 Pokémon at trainer level, and each gym's spoils out-level the next gym's opener — the ladder self-supplies its own solution — Turn spoils into a draft: after a win, show the defeated team and let the kid keep ONE, at (trainer level − 3). Everything else converts to XP for the mon that landed the KO. That preserves the 'I won
- **[HIGH/M]** All 8 badges — the entire non-daily Master Ball faucet — are exhausted at gym win 23 of 58, and 5 of the 8 fire without the player doing the thing they name — Rebase badges on circuit progress and on verbs the kid performs deliberately: 'clear 2 gyms', 'win a battle with a type disadvantage', 'catch a mon YOU threw a ball at' (track ball-catches separately 
- **[HIGH/S]** The one attrition system in the game — gym endurance — is nullified by a free, unlimited heal button sitting two lines above the gym list, and losing heals you too — Give the heal a price. Cheapest version: one free heal per gym, further heals cost a coin (see the currency proposal); or the heal is only available from the gym LIST, not from inside a gym, so enteri
- **[MEDIUM/M]** XP curve 25+10L is a straight line racing a straight line: a flat 2.7-3.1 battles per level from Lv5 to Lv99, with no XP readout anywhere — Add an XP bar under the HP bar in battle and under each mon in the PC — for a 7-year-old the visible fill IS the reward. Then band the curve: cheap Lv1-15 (~1.5 battles/level), a deliberate slowdown a
- **[MEDIUM/S]** Duplicate gym spoils silently do nothing while the victory screen claims you got them at trainer level — In the spoils loop, set the level to `Math.max(existing, m.level)` when the mon is already owned, or — better, and it doubles as a dupe sink — convert duplicates into an XP payout for the KO'ing mon a

### Ritu Sharma — progression-pacing analyst
*Progression pacing: XP curve vs. gym ladder, simulated over 28 days at 5 explores + 1 gym trainer/day*

**Genuine strengths noted:**

- The ladder is a single legible line: `lv = (g,i) => 8 + g*6 + (i===4 ? 5 : i)` (js/gymdata.js:9) produces a perfectly monotone Lv8→Lv80 with a +5 leader spike. 58 trainers, one formula, zero hand-tuned outliers — the whole difficulty curve is retunable by editing one expression, which is exactly the property you want when you're pacing for two kids with different appetites.
- 'Win = you catch their whole team' (js/battle.js:551-557, `t.def.team.forEach(m => recordCatch(m.id); ensureMon(m.id, m.level))`) is a genuinely excellent child reward: 140 unique species across the ladder, delivered in 2-6 mon bursts, at levels above what the kid owns. Every gym win is simultaneously a dex event, a team event and a power event. That triple payoff is rare and it is the strongest hook in the build.
- Failure is non-punitive and self-repairing. A gym loss calls `clearGymRun()` and tells the child 'Your team was rushed to the Poké Center and fully healed. Train up and try again!' (js/battle.js:481-487), while HP carryover within a gym (js/gym.js:18, js/battle.js:191) gives the 7-year-old real endurance texture without ever producing a dead end. The day-1 onboarding ramp is also well judged: `xpThreshold = 25 + level*10` (js/state.js:117) delivers Lv5→Lv8 inside the first six fights.

- **[CRITICAL/S]** The XP curve never bends, so the lead outpaces the ladder from day 2 and never stops — Make XP sublinear against the gap. Cheapest correct fix: multiply the award by `Math.min(1, ((wildLevel+5)/(leadLevel+5))**2)` in js/battle.js:509 and :612, so grinding at-or-below your level pays alm
- **[CRITICAL/S]** The lead Pokémon is silently whichever species has the lowest dex number, and it is invisible — On the first `recordCatch`, auto-set `team = [id]` (js/state.js:180). Never fall back to dex-sorted `caught` for lead selection — if team is empty, pick the highest-level owned mon instead of `caught.
- **[HIGH/M]** Lead hits Lv100 on day 37 with 21 days of ladder left, and there is no XP bar anywhere to notice it — Add a persistent XP bar to the battle HUD and the TEAM strip slots (js/pc.js:57) — `xp / xpThreshold(level)` is already computable. Then either raise the cap above the Champion's Lv80 with real cost, 
- **[HIGH/M]** Junior mode removes the only fail state, so the gym ladder has no wall — only a tap-count wall — Show 'RECOMMENDED Lv N' on each trainer card in js/gym.js:119-127 (green/amber/red vs. current lead level) — information, not a lock. And in Junior mode scale the foe's maxHp/def down toward the lead'
- **[MEDIUM/L]** Explore never gets easier or harder, so the child never feels the growth they earned — Gate habitat depth on badges: keep the first four habitats open, unlock Ghost Tower / Dragon's Den / legendary tiers behind Rainbow/Volcano/Earth badges, and let badge count push the rare-tier roll (e
- **[MEDIUM/S]** All 8 badges and every quest reward are consumed or irrelevant inside two weeks — Make quest XP relative — `addXp(lead, Math.round(xpThreshold(monLevel(lead)) * 0.5))` — so a completed daily is always visibly half a level. Re-target badges onto the long tail (200 caught, 3 gyms cle

### Claire Fontaine — first-session / onboarding designer
*Cold-start experience: time-to-first-delight, discoverability without a tutorial, and every empty state (no catches, no team, no badges)*

**Genuine strengths noted:**

- Time-to-first-delight is genuinely excellent: one tap on the boot screen (main.js:105 wires `on('boot-screen', startApp)`) and ~1.4s later a full-screen animated Pikachu is on the glass (state.js:71 `curId: 25` → main.js:33 `loadPoke(state.curId)`). First catch is only 3 taps total: TAP TO START → CATCH → POKÉBALL. Almost nothing to cut here.
- CATCH is the one button that wins the visual fight on a cold screen: `grid-column: span 2` plus a red gradient (css/main.css:61) among eight otherwise-identical chips, and it self-updates to a green ✔️ OWNED state (dex.js:49-61) so a pre-reader learns 'red = do it, green = done' without a word of instruction.
- Empty states are written, not blank — rare in a hobby build. Locked gyms explain themselves ('BEAT THE PREVIOUS GYM', gym.js:95), the PC grid has copy instead of a void (pc.js:133), and Prof. Oak's line is authored specifically for the 0% case (progression.js:179).

- **[CRITICAL/M]** The entire instruction layer is hover tooltips, on a device with no hover — Ship a one-time coached first run instead of tooltips: after the boot wipe, dim everything except CATCH with a pulsing arrow and three words ('CATCH IT!'); after the first GOTCHA, reveal EXPLORE the s
- **[HIGH/M]** Junior Mode is off by default and undiscoverable — the 4-year-old's first session is the adult game — Add a first-boot 'WHO'S PLAYING?' card with two giant tappable faces (BIG KID / LITTLE KID) that sets `settings.junior` for the active player — two taps, once, and the 4-year-old never sees adult mode
- **[HIGH/M]** Every zero-catches path is a native alert() dead end, and one of them contradicts itself — Replace all three with the same in-app panel: a big sprite, 'CATCH ONE FIRST!', and a single action button 'FIND ME ONE ▶' that closes the screen, calls loadPoke() on a high-capture-rate starter, and 
- **[MEDIUM/S]** The zero-badge trainer card is eight mystery icons with the how-to-earn text hidden in a tooltip — Render `b.desc` as visible text under each badge plus live progress ('Catch 3 — 1/3'), sort so the nearest-to-earned badge is first and flagged 'NEXT GOAL ▶', and swap the 0/649 headline for the far m
- **[MEDIUM/M]** The team system is invisible until you happen to start a battle — In `dex` context render six placeholder slots with a dashed '+' instead of hiding the strip, and make tapping an empty slot open a picker; also add a 'MAKE LEAD ★' action when tapping an owned Pokémon
- **[MEDIUM/S]** The P1/P2 header button is a one-tap 'all my stuff vanished' trap — Show identity and stakes on the control itself — render `${playerName()} · ${caught.length}` — and fire a 1.5s toast on switch ('NOW PLAYING AS P2 — 0 CAUGHT · TAP AGAIN TO GO BACK'). If the target pr

### Diego Alvarez
*Tutorialization / teaching invisible mechanics*

**Genuine strengths noted:**

- The ball picker's per-item microcopy "BETTER WHEN WEAKENED" (js/battle.js:657) paired with the HP bar's traffic-light thresholds (js/battle.js:321, red <20%, yellow <50%) is exactly the right pattern: the rule is stated at the moment of decision, in the same glance as the evidence you act on. It is the best teaching moment in the codebase — it is just never replicated anywhere else.
- The sparkle modal teaches its own lock state instead of hiding it: the button relabels to '🔒 SPARKLE — CATCH A SHINY!' and the hint line rewrites with the unlock condition and the odds (js/battle.js:112-117). A visible, self-explaining lock beats a greyed-out button and gives the 7-year-old a goal.
- Junior mode teaches by subtraction with real discipline: no nickname prompt to interrupt (js/battle.js:605, js/catch.js:321), gym HP always fresh (js/battle.js:191), no fail state (js/battle.js:441). The 4-year-old is never shown a rule he cannot parse.

- **[CRITICAL/M]** The lead is the game's difficulty dial, and for Explore players it is set by an accident of dex numbering — Put a persistent lead chip on the Explore habitat screen and the battle title bar: sprite + 'LEAD · Lv12' + one fixed line 'WILD POKEMON MATCH YOUR LEAD'S LEVEL'. Tapping it opens the PC team strip. A
- **[HIGH/S]** Gym wins never trigger evolution — the biggest teaching moment is silently skipped for gym players — In handleEnemyDown, set battleState.pendingEvolution = t.lastXpMon (already computed at js/battle.js:513) when ups > 0, instead of nulling on line 571; maybeEvolveThenExit handles the rest. One-line f
- **[HIGH/M]** HP-scaled ball odds are a hidden rule the player is punished for learning — KO auto-catch strictly dominates it — Make the BALL button the teacher: recolour and relabel it live from catchChance — '🔴 BALL · TOUGH' / '· FAIR' / '· EASY' in the same red/yellow/green as the HP bar. The rule becomes visible with no nu
- **[HIGH/S]** Sparkle's unlock is effectively unreachable and its hint teaches a goal the player cannot pursue — Gate on player().shinies.length > 0 (any shiny unlocks sparkle for the team) and rewrite the hint to the reachable version: 'Catch ANY shiny Pokémon — about 1 in 50 wild encounters — to unlock Sparkle
- **[MEDIUM/M]** Gym endurance HP is invisible before the fight, unpersisted, and has no teeth — Render carried HP where the decision is made: a small team strip above the trainer list with sprite + HP pip, and make the Poké Center button change state — '💗 POKÉ CENTER — 3 POKÉMON HURT' in yellow 
- **[MEDIUM/S]** Tap-to-promote-lead is hidden where the lead matters and fires silently where it doesn't — Show the strip in BOTH contexts, and on tap replace the silent vibration with a one-line toast in the existing #pc-instruction slot: '★ PIKACHU IS YOUR LEAD — wild Pokémon will match its level'. Same 

### Olga Ivanova — error-handling & failure-mode auditor
*Swallowed exceptions, unhandled rejections, network/asset failure UX, and what a 7- and 4-year-old actually see when things break*

**Genuine strengths noted:**

- Per-unit graceful degradation in `buildFighter` is genuinely good: a failed move fetch yields a working `{name:'tackle',power:40}` (/home/claude/pokedex/js/battle.js:63) and a failed species fetch falls back to captureRate 45 (:53), so one flaky sub-request produces a slightly duller battle instead of a crash. That is the right instinct.
- `getNameIndex` nulls its own memoized promise inside `.catch` (/home/claude/pokedex/js/api.js:118), so a failed name index retries on the next call instead of poisoning every later lookup — and `nameOf` degrades to `#025` rather than throwing (:125). Textbook.
- The dex screen distinguishes a real failure class from a generic one and writes an in-world message: GEN_RANGE gets 'This OS covers Pokémon #1–#649' rather than a stack trace (/home/claude/pokedex/js/dex.js:88-94), and `updateUISafe` / `loadEvolutionsSafe` isolate widget-level failures so one broken evolution chain shows 'DNA ERROR' instead of blanking the screen (:139, :155).

- **[CRITICAL/M]** A single thrown error mid-turn freezes the battle with every button disabled — and there is no global handler to notice — (1) Add `window.addEventListener('unhandledrejection'|'error')` in main.js that shows one big in-world overlay ('OH NO! Something went wobbly' + one giant OK button) and calls `exitBattleMode()`. (2) 
- **[HIGH/M]** `alert()` is the entire error UX — nine sites, none of them readable by the pre-reader the game was built for — Replace all nine `alert()`s with the existing in-world modal system (`show('victory-modal')` pattern) using icon-first copy — a sad Pokéball graphic, ≤4 big words, and a giant 'TRY AGAIN' button that 
- **[HIGH/S]** A failed lookup leaves stale `curId`/`curData` — the CATCH button then catches an invisible Pokémon while the screen reads ERROR — In the catch branch set `state.curData = state.curSpeciesData = null` and disable/blank the CATCH button; guard `openBag`/`executeCatch` on `state.curData` being non-null. Separately, have `apiFetch` 
- **[HIGH/S]** Zero `onerror` handling on any sprite — a 404 renders a broken-image glyph as the opponent, and `src=''` re-downloads the page HTML — Add one delegated handler in main.js: `document.addEventListener('error', e => { if (e.target.tagName==='IMG') e.target.src = e.target.dataset.fallback || POKEBALL_DATA_URI; }, true)`. Set `data-fallb
- **[HIGH/M]** Network errors silently rewrite the rules of the battle: a fainted Pokémon keeps fighting, and a VS match is awarded to the wrong brother — In `doSwitch`, on failure with `forced===true`, retry once then reopen the forced switch modal (never `enableMoves(true)`); if no team member can be loaded, route to the normal defeat screen. In `vers
- **[MEDIUM/S]** Tapping CONTINUE after a level-up can do nothing for 8–24 seconds with no spinner and no cancel — Show `loading-modal` around the evolution lookup and give it a 3 s soft cap (evolution is optional — skip rather than stall). Prefetch the lead Pokémon's species/evolution during the battle's idle sle

### Meredith Stone — parental-controls designer
*Parental controls: PIN robustness, destructive-action gating, playtime/progress visibility, per-kid settings, save recoverability*

**Genuine strengths noted:**

- The Parent Tools gate has the right *shape* for a 7-year-old threat model: it lives inside Settings (not the main screen), requires a deliberate 1200ms hold (js/devtools.js:143-171), and only then prompts for a PIN — no discoverable tap, no accidental entry, no visible 'secret menu' begging to be poked.
- Junior Mode is real behavioral differentiation, not a font-size switch: catches never fail (js/catch.js:74), the player literally cannot lose a battle (js/battle.js:441), Master Ball scarcity is hidden rather than enforced (js/battle.js:653-654), the nickname prompt never interrupts (js/battle.js:605), and the sprite itself becomes a giant catch button (js/main.js:143). That is design that respects a pre-reader.
- Save data is genuinely portable and forward-compatible: export as both code and file (js/settings.js:69-91), hydratePlayer merges partial saves over fresh defaults so old saves gain new fields (js/state.js:49-65), and legacy v15 keys migrate without loss (js/state.js:31-45). A careful parent CAN take a backup that will still load six versions later.

- **[CRITICAL/S]** The most destructive action in the app has no gate at all, while the harmless one has two — Before importCode() writes, snapshot the current save to a separate key (pokedexos_save_v2_prev) and add a RESTORE PREVIOUS SAVE button. Put a confirm() naming exactly what is lost ('This replaces BOT
- **[CRITICAL/M]** The app always boots as Player 1, so the 4-year-old lands in his brother's profile — Persist currentPlayer in the save. On boot, if two profiles have any data, show a two-giant-tile 'WHO'S PLAYING?' picker using color + a chosen starter sprite per kid (a pre-reader can pick a picture)
- **[HIGH/M]** PIN fails OPEN, has no lockout, and cannot be changed or recovered without deleting both boys' saves — Hash the PIN (crypto.subtle SHA-256 + a random per-install salt) and store the digest; fail CLOSED on any storage error with a clear message; add exponential backoff after 3 wrong tries. Add a 'CHANGE
- **[HIGH/M]** Zero playtime visibility, paired with a daily engagement loop that resets at dinnertime — Add stats.play = { totalMs, todayMs, day, lastSeen, sessions:[] }, accumulated on a visibilitychange/interval tick. Surface a PARENT DASHBOARD as the first screen of Parent Tools: minutes today and th
- **[MEDIUM/M]** Per-kid settings are exactly one bit, and either kid can flip the other's — Move mute into per-player settings with a global mute override. Put the junior toggles (and names) behind the PIN, or add a 'LOCK SETTINGS' switch a parent enables once. Add per-kid vibration and voic
- **[MEDIUM/M]** No second-device visibility and no automatic backup — one 'Clear Browsing Data' erases everything — Stay serverless but add rotating local snapshots (keep the last 3 daily saves under separate keys, written on first launch each day) with a RESTORE picker in Parent Tools, plus a 'LAST BACKUP: 12 DAYS

### Andre Williams — family-logistics expert
*Multi-device save/sync workflow: divergence, data loss, and the viability of manual base64 export over months*

**Genuine strengths noted:**

- Versioned schema with forward-compatible hydration: `hydratePlayer` (js/state.js:47-66) merges partial old saves over fresh defaults, and `migrateLegacy` (js/state.js:31-45) only fills empty `caught` arrays. This means shipping v18.3, v19, v20 over months will not brick a save that's been sitting on the grandparents' iPad since spring — genuinely the hardest part of long-lived family saves, and it's done right.
- Write-through persistence on every mutation — `recordCatch`, `addXp`, `evolveMon`, `setTeam`, `setNick`, `spendMasterBall` all call `persist()` inline (js/state.js:104-183). There is no 'forgot to save before the tablet died' failure mode within a single device.
- The file importer is forgiving of real parent behavior: `uploadSaveFile` accepts either the wrapper JSON or a raw pasted base64 blob (js/settings.js:130-137), so a code emailed into a .txt still loads. Small touch, but it's the difference between a 9pm recovery working and not.

- **[CRITICAL/M]** Import is whole-family replace — syncing one kid destroys the other kid's progress — Make sync merge-only, never replace. Add `mergePlayer(a,b)`: union `caught`/`shinies`/`badges`/`gyms.beaten`, per-id `max(level)` and `max(xp)` for `mons`, `max` for each `stats` counter, `max` for `i
- **[CRITICAL/S]** Silent destructive import: no timestamp, no preview, no undo — Embed `t: Date.now()` and a summary (`caught` counts per player) in the export payload. Before applying, show a comparison: 'CODE: 84 caught, saved Jul 12 · THIS DEVICE: 121 caught, played today' with
- **[HIGH/S]** Nothing ever asks the parent to back up, and localStorage is the only copy — Call `navigator.storage.persist()` on boot. Store `lastExportAt` and render it in Settings ('Last backup: 12 days ago' in red past 7 days). Auto-offer export after milestones the parent will be nearby
- **[HIGH/S]** Save can silently stop persisting when the API cache fills the origin's storage — On a `persist()` catch: immediately clear the API cache and retry, and if it still fails show a blocking in-game banner ('SAVING ISN'T WORKING — SHOW A GROWN-UP') plus auto-open the export dialog. Lon
- **[HIGH/S]** Which kid is playing is never remembered — every launch starts as P1 — Persist the active player in a DEVICE-LOCAL key (`pokedexos_lastplayer` — deliberately not inside the synced save, so importing a code doesn't reassign who the tablet belongs to). Better: on cold boot
- **[MEDIUM/M]** The transfer channel itself doesn't scale: ~10.7k-char codes, prompt() fallback, colliding filenames — Render the code as a QR in the export modal (a small vendored QR encoder, works offline on GitHub Pages) and add a scan-to-import path — camera-to-camera transfer removes the clipboard entirely and th

### Ben Carter — race-condition & async-state hunter
*Concurrency: busy/isCatching flags, mid-await input, versus passResolver, timer/interval cleanup on exit paths, double-fire on rapid taps*

**Genuine strengths noted:**

- The move grid is genuinely double-fire proof. `renderActive` (js/battle.js:277-288) rebuilds `#battle-moves` innerHTML on every render, so listeners never stack, and `executeTurn` sets `battleState.busy = true` synchronously before the first await (js/battle.js:405-407) while `enableMoves(false)` disables all `.move-btn` elements. Triple-tapping a move yields exactly one turn. Same synchronous-guard discipline in `executeBallThrow` (js/battle.js:668-671) and `openBallPick` (js/battle.js:641).
- The `state.isCatching` flag is honored at *every* navigation entry point, which is why the dex catch animation can never desync from `state.curId`: js/dex.js:64 (loadPoke), :182 (toggleShiny), :190 (randomPoke), :195 (nav), :204 (toggleSheet); js/pc.js:17; js/gym.js:61; js/explore.js:56; js/progression.js:140; js/settings.js:41; js/main.js:39, :52, :59, :80, :87. Unusually thorough flag hygiene — and it makes the contrast with battle mode (no equivalent input lockout on ESCAPE) all the sharper.
- js/music.js holds a clean single-timer invariant: `playMusic` always calls `stopMusic()` first, the `current?.name === name` guard (js/music.js:79) prevents restart-thrash when `battle-started`/`battle-exited` fire in quick succession, and the non-looping victory track clears its own interval from inside its callback (js/music.js:96). I could not construct an interval leak across dex→battle→gym→victory→exit transitions.

- **[CRITICAL/M]** ESCAPE mid-turn wipes battle state while the turn is still awaiting — the boys get a phantom nickname prompt and a Pokémon they ran away from — Add `let battleEpoch = 0;` incremented in `exitBattleMode` and `startBattleUI`. Capture `const e = battleEpoch` at the top of every async function and add `if (e !== battleEpoch) return;` after every 
- **[CRITICAL/S]** `versusActive` is never cleared on the ESCAPE exit path — a 4-year-old permanently loses Junior Mode invincibility for the rest of the session — Move `versusActive = false` (and `versus.sides = null`, `versus.qi = 0`) into `exitBattleMode` alongside the other resets at js/battle.js:86-88. Better: derive it — `const inVersus = () => versus.side
- **[HIGH/S]** Versus pass-modal is excluded from exit cleanup, `passResolver` is never released, and `versusNextTurn` has no post-await guard — Add `export function cancelPass() { const r = passResolver; passResolver = null; show('pass-modal', false); if (r) r(); }` and call it from `exitBattleMode`; add `'pass-modal','ballpick-modal'` to the
- **[HIGH/M]** No try/finally anywhere in the async turn pipeline — one throw freezes the battle with every button disabled — Wrap each entry point in `try { ... } finally { battleState.busy = false; }`, and re-enable moves from a single `awaitInput()` helper that is the sole caller of `enableMoves(true)`. Then collapse `bus
- **[HIGH/S]** Explore encounters fire ~2.9 seconds after the tap with no cancellation — a battle ambushes the child after they left explore — Add module-level `let encounterToken = 0;` incremented in `closeExplore` and at the top of `enterHabitat`; capture it locally and bail after each await if it changed. Also make BACK cancel the rustle 
- **[MEDIUM/M]** `loadPoke` has no request-sequence token — rapid NEXT taps resolve out of order and land on the wrong Pokémon — Add `let loadSeq = 0;` in dex.js; `const seq = ++loadSeq;` at the top of `loadPoke`, and gate every state write and DOM paint (including inside `loadEvolutionsSafe`, which should take `seq` as a param

### Luna Martinez — celebration designer
*Reward moments and "juice": catch, level-up, evolution, badge, gym win, champion, first shiny*

**Genuine strengths noted:**

- Celebration queue is correct engineering that most hobby games get wrong: js/progression.js:66-94 serializes badge/quest popups so two rewards never stomp each other, and dismissCelebration() chains to the next — a 7-year-old mashing A gets every reward, one at a time.
- The evolution sequence is the one genuinely well-directed moment in the game (js/battle.js:773-791): 1.2s of dread on the old sprite, a 6-note rising arpeggio over 1.9s of strobe (#evo-sprite.evolving, css/gba.css:342-345), a scale-up pop on the new sprite, a 5-pulse haptic, then a 2.6s hold to read the name. That is real anticipation-payoff structure.
- Catch anticipation timing is tuned right: 500ms wind-up, 1000ms per shake, 800ms dead air before the verdict (js/catch.js:76-95). The silence before 'GOTCHA!' is what makes it land, and junior mode doubles confetti to 48 (js/catch.js:107) — the only place in the codebase where the 4-year-old's reward is scaled up.

- **[CRITICAL/M]** Level-up — the most frequent milestone in the game — has literally zero celebration — Add a level-up beat before the victory modal: the player sprite bounces, a 4-note rising fanfare (523/659/784/1047 — the pokeCenterHeal jingle in js/gym.js:36 already proves the pattern), a big yellow
- **[CRITICAL/M]** Beating all 55 trainers — the game's ending — is one extra line of body text — Give the champion its own fullscreen sequence, not a line: dim to the evo-modal treatment, march the child's six team sprites in one at a time with a beep each, a 10-second Hall of Fame with the train
- **[HIGH/S]** Evolution can never trigger from a gym battle — the biggest XP source in the game — In handleEnemyDown, accumulate the highest-level fighter with ups>0 into battleState.pendingEvolution (t.lastXpMon already holds exactly this), delete the null-out at line 771, and let the gym victory
- **[HIGH/S]** A native browser prompt() guillotines the catch celebration mid-confetti — Never prompt during the celebration. Show the nickname affordance as an optional in-game button ('NAME ME ✏️') on the victory/GOTCHA panel that only opens an in-app styled input when tapped, and let t
- **[HIGH/M]** First shiny — a 1-in-50 event — gets a recycled two-note beep and no visual whatsoever — On shiny appear: freeze input for 1.2s, white screen flash, gold confetti over the wild sprite, a distinct high shimmer arpeggio (1047/1319/1568), long haptic — the child should shout before the first
- **[MEDIUM/M]** One 0.4s jingle stands in for five different rewards — there is no reward hierarchy — Build a 5-tier reward vocabulary (nudge / nice / big / huge / legendary), each tier = a distinct ascending arpeggio + confetti count + haptic pattern + flash intensity, and assign: quest=1, catch=2, l

### Owen Gallagher — curiosity-loop designer
*The dex as encyclopedia: cries, lore, evolution chains, stats, and the discovery surface*

**Genuine strengths noted:**

- Loading an entry is staged as an EVENT, not a data dump: screenWipe + scanning LEDs + typewriter lore (/home/claude/pokedex/js/dex.js:14-47, 120) plus the type-colored radial glow driving the whole chrome (dex.js:110-112). That 600ms ritual is the single best thing about browsing here — it makes a lookup feel like a scan.
- Evolution items are tappable navigation (dex.js:150-153), which is the only genuine curiosity loop in the app: one entry hands you the next. Chain-hopping is how a kid discovers Larvitar exists.
- Junior mode speaks the name aloud on entry load (dex.js:138) — the 4-year-old gets a hook that requires no reading — and the slim persistent cache (api.js:39-72) makes revisits instant, which is the unglamorous prerequisite for a 649-entry browse ever feeling good.

- **[HIGH/S]** The cry — the Pokédex's signature sensory payload — never plays unless you press a button — Auto-play the cry at the end of the scan (in loadPoke's 600ms setTimeout, dex.js:101-104), gated on isMuted() and on audio having been unlocked by the boot tap. For Junior mode, play the cry FIRST, th
- **[HIGH/S]** Five of six lore entries are fetched, cached, and thrown away — every visit to an entry reads identically — Make the desc block tappable: cycle 1/6 → 2/6 with a small counter and the typewriter re-running each time (typeText already exists). Ship a subtle '▸ MORE' affordance, and on revisit start from a ran
- **[HIGH/M]** Evolution chains show only the first branch — Eevee's fan, the most famous discovery moment in Pokémon, is invisible — Store the full tree (recurse evolves_to, not [0]) and render branches as a fan: base sprite, then a row of all children. Label each arrow with 'Lv16' / 'STONE' / '???' from evolution_details. Bump the
- **[HIGH/S]** Nothing on the entry screen conveys rarity or awe — Mewtwo looks exactly like Rattata — Add a rarity ribbon to the identity block (index.html:46-53): 👑 LEGENDARY / 🌟 MYTHICAL from the species flags, plus a plain-language rarity line derived from capture_rate ('VERY HARD TO CATCH — 3 in 2
- **[HIGH/S]** A misspelled name blames the network ('API Server issue') — and the autocomplete that would fix it is locked inside the parents-only panel — Lift renderSuggestions() out of devtools into a shared module and wire it to #search: sprite + name suggestions after 2 characters. On a failed lookup, fall back to nearest-name matching over the inde
- **[MEDIUM/S]** Base stats are scaled to 255 and color-coded so most Pokémon look like failures, and there is no total to compare — Normalize against ~180 (or per-stat 95th percentile) so bars use their range, and drop the red/yellow/green judgement for a single type-colored fill — the length already carries the information. Add a

---

## The boldest ideas

*Each expert's single most ambitious proposal — the move only their discipline would think of.*

**Aria Voss** — Bond Levels: make the raised mon unbeatable by loot. Every battle a mon personally fights adds Bond (tracked per-mon next to level in state.mons); Bond tiers grant what looted Lv57 aces can never have — +10% damage per tier, a visible aura, Bond-gated early ev

**Dev Okonkwo** — Buddy System: let each boy crown ONE Pokémon (his starter, his Pikachu) as his Buddy — it wears a badge in the UI, receives a 100% echo of ALL XP earned by anyone on the team, and the ladder is retuned so a buddy that fights every gym arrives at each leader ex

**Dr. Hanna Kim** — Make Junior Mode a self-voicing OS, not a big-button skin. One wrapper — narrate(text) — that queues Web Speech (the speak() infra and celebration queue already exist) and is called from logMsg(), encounter-text, victory lines, badge popups, and quest labels w

**MILA FERNANDEZ** — Five Regions, Five Diplomas: stop presenting one unfathomable 649-mon dex and restructure completion as five sequential regional dexes matching the GENERATIONS ranges already in config.js:9-15 (the PC box already tabs by gen). Explore habitats surface mostly c

**TOM BAUER** — Build an "A-button" input layer like a Game Boy emulator: route every battle sleep() through one awaitOrTap() primitive that resolves early on any screen tap, then add hold-to-fast-forward — press and hold anywhere during enemy turns and all timers run at 3x, 

**Priya Nair** — Replace the invisible threshold-swipe system with a physical, finger-following interaction layer — and make ball-throwing the star. Today every gesture is binary and post-hoc (nothing moves until touchend crosses a magic 60/80px number, main.js:86-95). Rebuild

**Dr. Sam Ellington** — Turn versus mode into a self-balancing sibling ritual with a visible comeback engine: every loss banks the loser a stacking, proudly-displayed 'HEART FIRE' buff (+15% damage per consecutive loss, shown as flames on their sprite) that resets on victory, layered

**Dr. Lena Morris** — Build the industry's first engineered OFF-ramp: a 'Journey's End' beat. After ~20 minutes or ~8 catches in a sitting, Professor Oak appears once — full celebration treatment, confetti, the works — recaps what the boys caught today ('You found a SHINY GYARADOS!

**KENJI WATANABE** — Badge-gated Legendary Quests: after each badge, a one-shot 'roaming legendary' event unlocks (bird trio after gyms 1-3, Ho-Oh/Lugia mid-circuit, Mewtwo only after the Elite Four) — Lv50+, immune to the auto-catch-on-KO rule, ball throws only with the real Gen 

**Rafa Costa** — Turn the one-device constraint from a jealousy engine into a bonding engine: BROTHER RAID mode. The versus code already proves the engine can map two saves onto one battle (versus.sides, battle.js:797-866) — invert it into 2-vs-1 pass-and-play co-op where BOTH

**Grace Liu** — Give every owned Pokémon a PERSISTENT four-move kit with learn-up moments. Right now movesets are re-rolled from a biased shuffle every single battle (battle.js:56-58), so no kid can say 'my Charizard knows Flamethrower' — the sentence that IS Pokémon for a 7-

**OSCAR PENA** — Split the dex into SEEN and OWNED and make 'seen' the master valve of the whole game. Unseen species render as black silhouettes in the dex browser — a built-in 'Who's That Pokémon?' guessing game the 4-year-old will play for free — and only seen species can b

**Ines Schultz** — Rebuild battle.js as a declarative "battle session" kernel: one createBattle({ sides: [sideA, sideB], rules, hooks }) where a side is { ids, levels, controller: 'human'|'ai'|'junior' } and rules is a plain data bundle ({ canCatch, autoCatchOnKO, faintShield, e

**MARCUS WEBB** — Replace direct mutation of the shared save object with a ~150-line append-only action journal: every gameplay mutation becomes a persisted {player, type, payload, ts} record (CATCH, XP, EVOLVE, REMOVE, SET_LEVEL) and the save is a replayed projection. This sin

**Yuki Tanaka** — Split battle.js (979 lines, the file every phase touches) into a headless engine and a DOM presenter. The engine — computeStats, damage, catchChance, turn order, faint/switch logic — becomes a pure state machine with zero document.getElementById calls, driven 

**Rosa Jimenez** — Retained-mode PC Box: build the 649-tile grid exactly ONCE at boot (idle-time, detached DocumentFragment), keep it alive forever, and make every 'render' a pure state-mutation pass — toggling .uncaught/.picked classes, updating level/nick text nodes, and apply

**Abel Girma, network engineer** — Kill the runtime PokeAPI dependency entirely with a build-time bake: a GitHub Action runs a script that fetches all 649 slim-pokemon projections, species, evolution chains, and the full move table (the exact slim shapes already defined in api.js:39-93), and co

**Chloe Dubois** — Ship a "cartridge pack" build step: a Node script that downloads all 649 gen-V static 96x96 sprites at a pinned SHA and composites them into ONE ~1.5MB WebP sprite-sheet with a generated CSS file (.mon-25 { background-position: ... }), used by every grid view 

**Niko Virtanen** — Ship "Road Trip Mode": the game is a closed universe — exactly 151 Pokémon, a known sprite-URL scheme (config.js SPRITE_BASE), cries, and slim JSON. Add a parent-triggered (settings.js) one-tap prefetch that walks ids 1-151, CORS-fetches every pixel/back/shiny

**Pixel Pete Ramirez** — Turn the emoji problem into the boys' game: a "Sprite Workshop" weekend project where the 7-year-old designs the eight gym crests and eight badge icons on 16x16 graph paper, Dad photographs and quantizes them to the cream/ink palette, and they ship as a single

**Sarah Oduya** — Per-child PWA installs: give each boy his OWN Pokédex on the home screen. Ship two thin entry pages (p1.html, p2.html) that each set a distinct apple-touch-icon — the child's chosen starter rendered on his player color (P1 red / P2 blue), regenerable from Pare

**JUN PARK** — Flick-to-throw: make the Poké Ball a real physical object the kids launch with their finger. Replace the tap-a-button throw with a touch drag on the ball (touchstart/touchmove/touchend on #battle-throw-ball) — flick velocity sets a parabolic arc rendered as a 

**Freya Lindqvist** — Split the typography into a two-font system, exactly as the real GBA games did: keep Press Start 2P strictly as the 'label face' for chrome (buttons, stat names, headers, HP boxes, ≥8px), and introduce a self-hosted mixed-case pixel 'dialog face' (e.g. VT323 o

**DINA HASSAN** — Audio-first Junior Mode: make the battle log speak. The game's entire narrative channel is logMsg() text — 'It's super effective!', 'PIKACHU FAINTED!', 'OH NO! IT BROKE FREE!' — which is invisible to the 4-year-old. Route logMsg through the (fixed, interrupt-c

**BEEP KOWALSKI, chiptune composer** — Procedural leitmotifs: since the engine is fully data-driven, give every Pokémon its own musical signature for free. Hash the dex number into a 4-note motif quantized to the battle track's scale (E minor pentatonic), play it as a 2-bar intro sting when the enc

**CARLOS MENDES, WCAG auditor** — Make Pokédex OS the first self-voicing kids' game in its class: a 4-year-old pre-reader has exactly the same needs as a screen-reader user, and the speak() TTS engine already exists (audio.js, main.js:38-49). Add a 'Narrator' layer to Junior Mode that speaks e

**Annika Berg** — Ship a "forgiving tap" engine as the app's input layer: a single document-level pointerup handler that, when a tap lands on dead space, finds the nearest interactive element within a 28px radius (weighted toward whatever the current mode expects — the CATCH bu

**Victor Hugo Santos** — Turn the test suite into a game-balance instrument: extract the battle loop's decision math (damage, catch, XP, enemy AI pick) into a pure simulator with injected RNG, then run Monte-Carlo campaigns in Node — 10,000 simulated battles per configuration in under

**MEI CHEN** — Ship a resident chaos gremlin: a Playwright script in test/ (the harness infra already exists — smoke.mjs, shots.mjs) that plays as a feral 4-year-old for five minutes per build — random-tapping every visible element at 100-300ms intervals, double-tapping mid-

**PAUL NDIAYE, save-integrity auditor** — Journaled ring-buffer saves with a parent-facing time machine: persist() writes to three rotating slots (pokedexos_save_v2_a/b/c), each stamped with {rev, timestamp, checksum}; loadSave picks the newest slot whose checksum verifies, automatically surviving quo

**Dr. Imran Shah** — Ship an 'Airplane Mode Certified' release: write a small build script that vendors everything into the repo — the 151 slim PokeAPI projections as one prebaked JSON (api.js's slimPokemon output is ~2-3KB each, so ~400KB total), the pixel sprites and cries for G

**Tanya Blackwood** — Treat every save code as untrusted network input and put a real trust boundary around import. Ship a tiny signed-save scheme: exportCode appends an HMAC computed from a per-install secret, and importCode of a foreign code is quarantined — parsed into a sandbox

**LUCIA MORETTI** — Stop treating PokeAPI as a runtime dependency at all: add a tiny build step (a GitHub Action) that runs the existing slimPokemon/slimSpecies/slimEvo projections over all 649 Pokémon once and commits the result as ~5 static JSON shards (~1.5MB total, one per ge

**Henrik Larsen** — Kill PokeAPI as a runtime dependency entirely. All game data is immutable Gen 1-5 facts, and api.js already defines the exact slim projections needed — so run those projections once at build time into a committed static snapshot: data/dex-649.json (~1-2MB of s

**JORDAN AVERY** — Declare a feature freeze and ship 'v19: THE FUSION' — a release that adds zero new systems and instead merges the game's three parallel economies into one loop: (1) gyms become the sole badge source (badges the boys can point to after beating ROCKO), (2) all c

**NADIA REZAI** — Ship v19 as the "invisible update": a four-week feature freeze where the only deliverables are (1) a DOM-free battle rules module hammered by 10,000 randomized property-test battles in plain Node on every commit — asserting invariants like "junior player HP ne

**Felix Brandt** — The Mystery Egg: a persistent, visibly-hatching return hook that needs zero reading. Every quest-sweep day adds one crack to an Egg sprite parked on the main dex screen (state: {eggProgress, eggTier}); at 5 cracks it hatches — with the full celebration-queue f

**AMARA OSEI** — Ship 'SEASONS' — a fully client-side generative 13th gym that rebuilds itself every Monday. Seed an LCG from Math.floor(todayNumber()/7) (the exact pattern already proven in progression.js:39-42) and procedurally assemble 'RIVAL TOWER': five trainers whose nam

**Sofia Rossi — AI-behavior designer (opponent AI, difficulty curves, felt fairness)** — Flip the AI's job from winning to TEACHING: make opponent intent legible one beat before it lands. Add a telegraph phase to `performAttack` — the already-chosen enemy move is announced with its type badge ('ROCKO's ONIX is winding up a ROCK move!'), ~1s pause, and the player's type-advantaged options visibly glow in the move grid — paired with the switch fix so committing to a counter actually works. The math changes by zero; the felt experience inverts. Today a 70% super-effective AI is an invisible coin flip that deletes a 7-year-old's favourite Pokémon; telegraphed, that same 70% becomes the game's best teacher — a puzzle with a visible answer, where the child sees the rock coming, swaps in his Squirtle, and is rewarded for reading the type chart. Then fade the telegraph with the ladder: full warning through gym 3, a one-word hint mid-circuit, none at the Elite Four. The difficulty curve stops being a damage curve and becomes an information curve — the only kind of curve that makes a kid feel like he got smarter instead of just older.

**Ivan Petrov — combat-math auditor** — Stop computing damage from stats and start computing it from a target time-to-kill, then spend the freed variance on things the boys can see. Concretely: define TTK_base = 4 turns, and derive damage as maxHp/4 scaled by (a) the type multiplier (2x -> 2 turns, 0.5x -> 8 turns), (b) a level-gap term, and (c) a small random roll. Every fight then lasts a legible, tunable number of turns regardless of whether it is a Lv5 Caterpie or a Lv80 Champion's Charizard, which instantly fixes findings 1, 2 and 5 at once: all six team members become viable because raw base stats no longer decide anything, wild levels can be flat per habitat instead of rubber-banded, and difficulty becomes a single number the father can tune per gym instead of an emergent accident of PokeAPI's stat tables. Sparkle then stops being a 6x nuke and becomes an honest, explainable promise -- "Sparkle wins in 2 turns instead of 4" -- which is both a real reward and something a 7-year-old can actually understand and brag about.

**Walt Fischer — reward-economy balancer** — Delete the Master Ball and mint one visible currency instead: POKÉ COINS. Every KO, explore, and quest pays coins (battle.js:509 and 612 already compute the exact scaling number you'd reuse); coins buy Poké/Great/Ultra Balls, Poké Center heals, and gym entry — and Poké Balls become the actual consumable now that auto-catch is gone. That single change fixes the whole lane at once: it gives the economy a sink that never dries up (unlike 8 one-shot badges), it makes the beautiful hpFactor catch curve load-bearing again, it puts a price on the free heal button, it gives the last 35 trainers something to pay out, and it gives the 4-year-old a number that goes up AND down — the first thing in this game he can actually spend. Pair it with drafting one Pokémon from each defeated gym team instead of taking all six, and the gym circuit stops being a vending machine and becomes 58 small decisions the boys make together.

**Ritu Sharma — progression-pacing analyst** — Invert the pacer: let the gym circuit cap the level, not the XP curve. Add a soft ceiling — the lead can never exceed `nextUnbeatenTrainer.level + 3` — and route all surplus XP into the rest of the box instead of throwing it away. Three things happen at once. Every gym fight becomes a genuine fight for all 58 trainers instead of the 5 it currently is. Exploring stops being a way to break the game and becomes the way you raise your whole team, which is exactly the behaviour that makes a 7-year-old fall in love with a party. And the 4-year-old, who cannot lose anyway, gets fights that are always ~4 taps long because the level gap is structurally bounded. It costs one clamp in `addXp` (js/state.js:121) plus an overflow loop, and it converts a game that is finished in spirit on day 5 into one that still has teeth on day 58.

**Claire Fontaine — first-session / onboarding designer** — Delete the concept of a tutorial and make the first 45 seconds a scripted, unlosable cold open — 'YOUR FIRST CATCH'. Tap TO START; instead of dropping into a static Pikachu with nine equal buttons, the toolbar starts dark, a wild Pikachu rustles into the scanner frame, and exactly one thing on screen is lit: the CATCH button, pulsing. The catch cannot fail regardless of junior mode (reuse catch.js's existing `forceSuccess` flag, which is already plumbed at line 40 and currently never passed true). GOTCHA, confetti, the boy's first Pokémon lands in slot 1 of a team strip that animates into existence. Then the toolbar lights up one region at a time as the game hands control over — EXPLORE glows next with a single arrow, and GYMS only after the first wild encounter. Fold the 'WHO'S PLAYING?' question into this as two giant tappable faces before the ball is thrown, so Junior Mode is chosen by the 4-year-old himself in one tap instead of buried in a settings modal he can't read. Same three taps to first delight as today — but they now teach the loop, set the mode, seed the team, and retire all 37 invisible hover tooltips in one move.

**Diego Alvarez** — Make the hidden rules collectible. Add a RULES section to the Trainer Card that starts fully blacked out — one card per invisible mechanic (LEAD SETS THE LEVEL, WEAK = EASY CATCH, SPEED GOES FIRST, SAME TYPE HITS HARDER, SWITCHING COSTS A TURN, HURT MONS STAY HURT IN A GYM, SPARKLE DOUBLES DAMAGE). The first time a rule actually fires in play, the engine appends one plain-language cause line under the battle log ("PIKACHU went first — it's faster") and unlocks that rule card with the badge fanfare that already exists in queueCelebration (js/progression.js:417). No tutorial, no modal, no reading gate: the rule is explained exactly once, at the instant the boy just felt it, then it becomes something he owns. It reuses the celebration queue, the badge grid layout, and the game-progress event bus already in the codebase — and it converts the game's biggest weakness (a dozen undocumented multipliers) into its most on-theme reward loop, because a Pokédex game should absolutely let you collect the rules of its own world.

**Olga Ivanova — error-handling & failure-mode auditor** — Add a Battle Watchdog and make every failure fall back to fun instead of falling back to `alert()`. Concretely: a 12-second heartbeat that arms whenever `battleState.busy` goes true or a loading modal opens, and, if the turn never completes, replaces the freeze with an in-world 'A wild GLITCH appeared!' card — a shaking Pokéball, no text required, one giant button that resumes the battle from the last known-good state (HP, team, gym progress are all already in `battleState`/`gymRun`). Pair it with a two-tier offline strategy the code is 90% of the way to already: `saveCache` (api.js:12-21) currently reacts to a full quota by silently nuking the entire in-memory cache (`cache = {}` at :19), throwing away the child's offline Pokédex mid-session; instead, evict by LRU, and pre-warm the ~30 Pokémon in the player's box plus every gym roster (`gymdata.js`) on first load so that a car-ride outage still allows catching, battling and gym runs with zero network. The design goal: there should be no reachable code path in this game where a 4-year-old sees a grey OS dialog, a broken-image icon, or a screen that stopped responding. Every error becomes a Pokémon-shaped event he can tap through.

**Meredith Stone — parental-controls designer** — Reframe Parent Tools from a cheat menu into a "Dad's Morning Card": make the FIRST screen behind the PIN a read-only one-page dashboard — minutes played yesterday and this week per kid, last played time, what each boy caught since you last looked, and which badge each is closest to earning ("SAM is 2 catches from the Rainbow Badge") — with the level editor demoted to a second tab and a single "SEND TO MY PHONE" button that renders the save code plus that summary as a QR. Every requirement is already satisfiable from data the app either has or could log in 20 lines, and it converts the parental-controls surface from something that polices the boys into something that lets their father say at breakfast "I saw you got the Thunder Badge last night — show me your Charizard." Measured against the north star, a dad who can talk about the game is worth more to the boys' fun than any level slider.

**Andre Williams — family-logistics expert** — Replace 'transfer the save' with 'bump the saves together': make sync merge-only and idempotent, then wrap it in a ritual the kids run themselves. Union `caught`/`shinies`/`badges`/`gyms`, max-out `mons` levels and `stats`, and sync becomes order-independent and lossless — no 'which device is truth', no direction to get wrong, no possible way for Dad pasting a stale code to erase a week. Then surface it as TEAM-UP BUMP: one device shows a QR, the other scans it, both screens play a badge-clink animation and show 'YOU TWO NOW HAVE 137 TOGETHER'. It turns the single most fragile, most-forgotten piece of parental admin in this project into a thing a 7-year-old asks to do at bedtime — which is the only backup schedule that will actually survive six months.

**Ben Carter — race-condition & async-state hunter** — Delete the four boolean flags (`isBattling`, `busy`, `versusActive`, `canCatch`) and replace them with one `battleState.phase` state machine plus one monotonic `battleState.epoch`. Legal phases: `idle | loading | awaiting-input | resolving | modal | ending`. Every DOM handler in the battle screen — including ESCAPE, RUN, the ball picker, the switch list and the versus pass button — becomes a one-line no-op unless `phase === 'awaiting-input'`, and every `await` in the engine goes through one helper: `const step = async ms => { await sleep(ms); if (epoch !== myEpoch) throw ABORT; }`, with ABORT swallowed at the four entry points. `exitBattleMode` becomes the only function that bumps `epoch`, and it resets state by spreading a fresh object literal rather than assigning fields one at a time — which structurally makes finding #2 (the `versusActive` leak that silently strips a 4-year-old's invincibility) impossible to reintroduce. Roughly 60 lines of change; it eliminates findings 1, 2, 3 and 4 at once, and the same epoch pattern drops straight into explore.js (#5) and dex.js (#6). The north star is concrete: the boys should never be able to produce a state the code cannot name.

**Luna Martinez — celebration designer** — Make every celebration speak. audio.js already ships a working speak() (js/audio.js:72) and it is used for exactly two things — reading a Pokémon's name and its dex entry (js/dex.js:138, js/main.js:44) — while 100% of the reward layer (victory-lines, badge-sub, evo-text, the champion line, the shiny line) is small pixel text. That means the 4-year-old, the player the whole Junior Mode exists for, currently receives none of the game's rewards; he sees confetti and has no idea why. Build one juice bus, celebrate({tier, headline, spoken, sprite}), that every milestone in the codebase routes through — it fires tiered confetti, a tiered fanfare, a tiered haptic, a flash, AND speaks the headline aloud in an excited voice ("You got the Boulder Badge!", "Charmander evolved into Charmeleon!", "You are the Champion!"). One function, ~60 lines, and suddenly the pre-reader hears every win, the 7-year-old gets an audible reward hierarchy, and the father has a single place to tune the game's entire emotional curve.

**Owen Gallagher — curiosity-loop designer** — Turn every one of the 649 entries into a stampable page, so the dex stops being a lookup table and becomes the collection itself. Right now 'ownership' is one boolean (state.js:182 caught[]) and the entry screen reflects it with a single button label (dex.js:49-61) — so 649 pages offer exactly 649 bits of achievement, all earned in the catch screen, none earned by reading. Instead give each entry a 5-stamp row rendered under the sprite: HEARD (played its cry), SEEN SHINY (toggled shiny — dex.js:181), READ (revealed all six flavor texts), CAUGHT, EVOLVED/BATTLED. That is ~3,200 tiny collectibles, all earned by acts of curiosity rather than acts of grinding, and it retroactively gives every existing button a reason to exist. Then hang the discovery loop off it: each entry shows 'FOUND IN: 🌲 DEEP FOREST' by reverse-indexing the habitat pools that already exist in explore.js:10-51 (Haxorus #612 is sitting in dragon.r right now, and the dex never tells the boys where to look), and add a 🔎 NEXT UNKNOWN button that jumps to the nearest entry with zero stamps. The 7-year-old gets a completionist grid worth 3,200 stamps; the 4-year-old gets a page where every button he mashes lights something up permanently. That is what makes a kid voluntarily open #612 — not better data, but the page remembering that he was there.
