# Changelog

All notable changes to the Pokédex OS project will be documented in this file.

## [19.8.3] - BROTHER BATTLES ARE REAL BATTLES

Versus mode was not a match. Gabe's Charizard was Lv62 and Art's Pikachu was
Lv9, so the first move usually ended it — Art handed the tablet back before he
had really had a turn.

Now, in a brother battle, everyone fights at the strongest Pokémon's level.
Nothing about it is hidden or apologetic, and it is one sentence you can say
out loud to Gabe if he asks: **"in brother battles, everyone fights at the
strongest Pokémon's level."** That is the whole rule, and it is true in both
directions — if Art ever turns up with the higher Pokémon, it lifts Gabe.

### What the boys will notice
- Art's Pokémon survives more than one hit and can win. In the test match his
  Pikachu opened for 101 damage and took Gabe down to 6 HP before losing.
- Gabe's Pokémon are untouched. His Charizard is the same Lv62 with the same
  four moves it has everywhere else, and his save is not changed by any of
  this — the level only applies inside the match.
- Neither boy is told anything about it. There is no "easy mode" label, no
  helper message, nothing that tells Gabe his brother was given a hand.

### Fixed
- Brother battles no longer end on turn one.

## [19.8.2] - ROOM FOR THE COLLECTIONS

Browsing lots of Pokémon can no longer eat the room the boys' saves live in.

### Fixed
- **The Pokédex cache has a ceiling now.** Everything the app downloads about a
  Pokémon was kept forever, in the same small storage box the boys'
  collections live in. Flicking through the dex for a few minutes filled it
  until the app panicked and threw the *entire* cache away at once. It now
  keeps a fixed amount and quietly drops the least-recently-looked-at when it
  needs room. Measured over 400 dex taps against the real Pokémon database:
  it settles at about 1.1 MB and stays there, instead of climbing past 3.6 MB.
- **Your team is not what gets thrown away.** The six Pokémon the boys battle
  with are loaded first, which would have made them the first evicted. Looking
  something up now moves it to the back of the queue, so the team they are
  about to fight with stays put.
- **A full tablet no longer leaves a fat file behind.** The old emergency
  clean-up emptied the app's memory but left the big file sitting on the
  tablet, so nothing could ever shrink it again. It now clears both.

### Testing
- Four new checks: a 400-entry cache is capped at boot, a write at the cap
  evicts instead of growing, the oldest go first, and **an eviction never
  touches the save**. 189 browser checks, 18 engine tests, 42 layout checks.

## [19.8.1] - THE OFFLINE COPY

One line, and it turns out the game has had no offline mode since June.

### Fixed
- **The game works without wifi again.** The list of files the app saves to the
  tablet for offline play had one file written on it twice. That is enough for
  the browser to throw the whole list away — silently. It creates the storage,
  puts nothing in it, and everything looks completely normal until the moment
  the iPad has no signal. Then there is no game. This has been true since
  v19.4.0, and nothing anywhere would have told you: measured before the fix,
  0 files saved; after, all 27. In the car, on a plane, or on a bad afternoon
  of wifi, the boys now have the game.

### Testing
- Two new checks so it cannot come back: the offline list may never contain the
  same file twice, and every module the app actually loads must be on it — a
  file missing from that list boots the offline copy into a black screen rather
  than a graceful fallback.
- 185 browser checks, 18 engine tests, 42 layout checks.

## [19.8.0] - ROUND 2

Something to do after the crown.

### Added
- **ROUND 2.** Once you're Champion, a gold ROUND 2 button appears at the top of the Gym Circuit. Tap it and all 58 trainers are back — same names, same taunts, fifteen levels stronger. Hiker Carl is Lv23 now. Champion Rex is Lv95.
- Beating a ROUND 2 trainer for the first time pays FULL experience, not the half a rematch pays — it's a new fight, not a repeat. Their team joins your box at the higher level too.
- Beat ROUND 2 Rex and the Hall of Fame plays again. Beat all 58 of them and you get the **MASTER BADGE** — the last thing in the game, and one more Master Ball.
- Nothing you already won moves. ROUND 1 is still there on the other tab, still ticked off exactly as you left it, and the Pokémon you're finding out in the world don't get any harder because of ROUND 2.
- **Eevee's page finally shows all of them.** The Pokédex used to draw one line of evolutions, so a Pokémon that can become several different things only ever showed you one. Now the whole fan is on the page, with the one you're looking at ringed in gold.
- **Gabe picks.** When a Pokémon levels up and could become more than one thing, a box appears — WHO WILL EEVEE BECOME? — with a picture of each one. Tap the one you want. Art taps a picture too; there's nothing to read.
- **NOT YET is always there**, and it costs nothing. Say not yet and the question comes back next time it levels up. Forever. You never lose the choice.
- **The PC learned to spell EVOLVE.** Your whole team earns experience in every fight, but only the Pokémon that landed the knockout was ever offered an evolution — the other five could be twenty levels overdue and nothing ever said so. Now the PC shows a gold READY TO EVOLVE button (one sprite, an arrow, and either the new one or a ❓ if it's a choice). Tap it and the ceremony plays right there.
- **The daily quests stopped repeating themselves.** Ten quests became thirty-one: catch something in a particular place (DEEP FOREST, the OCEAN, GHOST TOWER…), catch something RARE, catch one at Lv40 or above, evolve a Pokémon, win a brother battle, rematch a gym trainer, and eight more types to hunt.
- There's always at least one quest on the board anybody can finish — two of them on Art's board — so a morning's quests are never three things a four-year-old can't do.
- **Champions get a fourth quest.** Once you've won the crown the board grows one extra, harder line — catch a shiny, win a ROUND 2 battle, evolve two — and that one pays a **Master Ball**. The other three are unchanged; it's added, never swapped.
- Fixed: battle backgrounds now actually match where you are. Walking into DEEP FOREST and meeting a water Pokémon used to paint an ocean underneath a sign that still said DEEP FOREST — the code meant to fix that had a typo in it and has never once worked.

## [19.7.0] - THE MAP

Every place in the world now looks like a place, and shows you who lives there.

### Added
- EXPLORE is a proper map now. Art gets a big picture card for every place — the forest looks like a forest, the ocean looks like the ocean — with three little Pokémon bobbing about in it, so he can pick where to go without reading a word.
- Every card in the game finally matches. Places, gyms and trainers all use the same look: a picture, a short name, a green / orange / red stripe for how tough it is, and a padlock on anything not open yet. Locked things stay recognisable instead of turning into grey blanks.
- The Gym Circuit shows the whole journey. One big card for the gym you're on, then all twelve stops as a row of badges — Victory Road and the Elite Four are on screen from day one instead of buried below ten grey boxes.
- Trainers you can fight now have a proper red BATTLE button with a little arrow that nudges, and each row starts with a picture of that trainer's first Pokémon and a tick, swords or padlock so you can see at a glance who's done, who's next and who's locked.
- Mewtwo, Mew, Zekrom and friends get a gold LEGENDARY (or MYTHICAL) ribbon on their page and a gold glow behind them. The game already knew which ones were special — it just never said so.
- Tap the Pokédex entry and it flips to the next one. There are six write-ups saved for most Pokémon and Gabe has only ever been shown the first; the little dots underneath say how many there are.
- There's a picture of where each Pokémon lives next to its types. Tap it and the map opens on that place with it lit up.
- When a scan finishes, the Pokémon makes its noise by itself. Turn the sound off with the speaker button if it gets much at bedtime.
- ONE PLACE A DAY GLITTERS. A ✨ appears on one habitat and shiny Pokémon are five times more likely there — the same for both boys, and it moves to somewhere new tomorrow. It's a bonus, never a lock, and nothing counts down.
- The very first shiny either boy ever catches gets its own celebration: the sparkly Pokémon big on screen, sparkles, confetti and a little four-note fanfare. It politely waits until the win screen is finished rather than landing on top of it.

## [19.6.0] - ART'S BOOK

Art gets his own game instead of Gabe's game with the words left in.

### Added
- Art's home screen is six big picture tiles two across — a wide CATCH, then EXPLORE and GYMS, then PLAY and STICKERS.
- Pikachu is much bigger on Art's screen: he was actually smaller than on Gabe's screen, which was backwards. The blank cream bar at the bottom is gone.
- Art's PC is now a sticker book: colour stickers for what he's caught, grey shadows for what he hasn't, and no words anywhere. The generation tabs are starter Pokémon instead of numbers.
- A Pokémon he has just caught springs onto the page with a chime the first time he opens the book — once each.
- Tap a sticker for a big picture, its type symbols and its cry. On the iPad, where Safari can't play the real cry files, it now plays a little chiptune voice instead of nothing — which also fixes the CRY button, silent on the iPad for a long time.
- Up to six favourites get a gold star and sit on a shelf. When the shelf is full it just wobbles — it never says no and never bumps one off.
- The gear icon needs a press-and-hold in Art's mode now, and swiping up on his screen no longer opens anything.
- Nothing changed for Gabe: same toolbar, same green PC, same battles.

## [19.5.4] - SMALL MERCIES

The last of the play-test list: timing, save handling, and the bits a grown-up
touches.

### Fixed
- The Pokédex used to show one Pokémon while naming another — SANDSHREW on screen under the words SANDSLASH, with CATCH live on it. The picture now waits for itself, so what you see and what it says are always the same Pokémon.
- Battles stopped starting on two empty patches of grass. On a slow connection the whole fight appeared with nobody in it for about two seconds.
- A new opponent's health bar no longer fills up like a heal. Every enemy after the first came out with an empty green bar that climbed to full — which is exactly what healing looks like in this game, on a Pokémon that hadn't been touched.
- GABE'S stays GABE'S. It used to come back as GABE&#39;S after a reload, and it got a bit worse every single time.
- DONE in Parent Tools puts you back in Settings instead of dumping you on the Pokédex — and it stops throwing away a name you'd just typed.
- 🔑 CHANGE PIN is reachable. It was sitting underneath the DONE button on both phone sizes.
- The save code shows as it really is — not in capitals, not centred, and starting at the beginning, so you can actually check you've got the right one.
- PASTE CODE tells you when the box was empty instead of just closing.
- Loading an old save code from the previous game no longer leaves Pokémon on your team that aren't in your box.
- The POKé CENTER stops congratulating you on healing a team you don't have.
- DEEP FOREST is actually the gentle one now — a brand-new player's first fight was a coin flip on the card that looks easiest.
- The dex ball throw can be hurried along with a tap. It was a seven-second ceremony nothing could interrupt.
- The blinking ▼ 'tap to hurry' arrow stays up for the whole wait now instead of flashing for a moment in the middle, and the short battle lines can be tapped through too.
- Art's explore map is all green. The red squares were warning him about a danger that cannot happen to him — his Pokémon can't faint. The Lv~ number on each card is unchanged so you can still see what he's walking into.
- The LEAD button has a picture before your first catch — it was the only button on the dex that was just a word.
- The ✨ and the number on the SHINIES tile of the trainer card aren't touching any more.

## [19.5.3] - READ IT, TAP IT

Things you could not read, and things you could not tap.

### Fixed
- Art can play VERSUS now — Gabe-vs-Art was the last mode still using word-only move buttons, so he was guessing every turn. It uses the same big picture buttons as every other fight.
- CANCEL is a red button again. In the ball drawer, the switch menu and the sparkle picker it had been white writing on a cream background — invisible, and the only way out of each one.
- Move buttons keep their colour. A move that isn't great against the other Pokémon used to go grey, which to Art means 'broken'. The colour stays; the little arrow in the corner does the telling.
- The SWITCH menu stops lying. Mid-gym it said READY next to Pokémon that were nearly out of HP, so Gabe kept sending out something that fell over instantly. Real HP now, red when it's nearly out, and listed by name instead of by number.
- All six of your team show in the PC box. The sixth was off the edge of the screen with nothing to show it was there — and tapping a slot is how you pick your lead, so one of the six could never be made lead.
- Two-line captions no longer run into each other — the locked gym cards, the habitat subtitles, the team-picker line.
- MASTER BALL fits on one line on the small phone, so the ball drawer is four tidy columns again.
- The 'not done yet' mark on the trainer card's quests is a proper empty checkbox instead of a faint speck.
- The little info icon next to VERSION in Settings was drawing as a black box. Fixed.
- Junior Mode finally covers the PC box and the trainer card: no text-search box Art can't use, and badges are pictures instead of small print.
- The browser tab and the bottom of the Pokédex data sheet were both still saying v18. They read the real version now, so it's still one bump per release.

## [19.5.2] - ONE THING AT A TIME

After a win or a catch the game used to throw up to three full-screen boxes at
once. They take turns now.

### Fixed
- ONE THING AT A TIME. After a win or a catch the game used to throw up three screens at once and the dark layers piled up until everything went black. Now the boys get one screen at a time: the card with the Pokémon on it first, then the naming box, then the gold star quest card.
- The win card is on its own now, so you can actually watch the gold XP bar fill up — it used to finish behind the quest card where nobody could see it.
- Catching on the Pokédex screen: the Pokémon pops back the same moment GOTCHA! and the confetti go off. Before, the confetti went off over an empty box for six seconds and Art never saw what he caught.
- A Pokémon you win by knocking out no longer comes back out of the ball grey and tipped over. It stands up in full colour.
- GOTCHA! and DARN! IT BROKE FREE no longer get painted straight across the Pokémon's name — the message hangs at the bottom of the screen now, so you can read both.
- CANCEL was white letters on a cream button in the SWITCH and BALL menus — effectively invisible. It is dark and readable now.
- The SWITCH menu shows a full team of six without slicing the last card in half, and it lists your Pokémon by name and nickname instead of by number (SPARKY Lv14, not #025 Lv14).
- In Junior Mode the ball drawer no longer prints catch rates that are not true for Art — his balls always work, so the ratings just went away. He still picks whichever ball he likes.
- The mid-fight loading screen was a black box of engineer words. It is now a Poké Ball and GET READY!.
- Battles wait for the Pokémon pictures to arrive before the screen opens, so the fight never starts on an empty field.
- The naming box now looks like the rest of the game instead of a plain browser text box, and the VERSION line in Settings finally has an icon instead of a little blank square.

## [19.5.1] - PLAYTEST FIXES

Six agents played the game properly for the first time — as Art, as Gabe on a
long Saturday, at real speed, as a brand-new player, and as you in Parent
Tools — and every bug they reported was independently reproduced before it got
written down. 56 were real. These are the ones that mattered most.

### Fixed
- **A save the game cannot read is no longer quietly replaced with an empty
  one.** This was the worst thing found. If the save file was ever damaged, the
  game started fresh, said nothing, and then wrote that empty save straight
  over the real one the moment it rolled the daily quests — both boys'
  collections gone, silently, before either of them had touched anything. The
  old save was always kept safely in the background, but nothing told anyone
  to stop. Now it stops the screen with the SHOW A GROWN-UP message and
  refuses to write anything at all until you have seen it.
- **Winning a gym battle no longer leaves your team more fragile.** Any
  Pokémon that fainted was being brought back at exactly 1 HP for the rest of
  the gym run — and the SWITCH menu still cheerfully called it READY. Each win
  made the next fight harder. Fainted Pokémon now come back properly healed for
  the next trainer; the ones that survived still carry their damage, so a gym
  run still means something.
- **The Pokémon you just beat no longer stands back up as the next one.** When
  a new opponent came out, the picture of the *previous* one stayed on screen
  until the new one finished downloading — so the Pokémon that had just fainted
  got up, turned back to full colour, and played the next one's entrance under
  the wrong name and a full health bar. **This is almost certainly the
  "greyscale Pokémon" you saw.**
- **A grey, keeled-over Pokémon no longer walks into a versus match.** The
  fainted look was never cleared when a fight ended, so the next brother battle
  started with a tipped-over grey Pokémon on a full green health bar.
- **Tapping BACK in a battle does something for Art now.** Art has to *hold*
  BACK to leave a fight — deliberately, so a mashing four-year-old can't lose
  the Pokémon he was chasing. But a tap did absolutely nothing once his finger
  lifted, which just teaches him the button is broken. A tap now plays the
  hold-bar through once so he can see what the gesture is, and the bar fills
  the whole button instead of being a 5-pixel sliver hidden under his thumb.
- **The little pictures on buttons are the right size.** The emoji on the
  header buttons and the BACK buttons was being drawn at the text size — the
  smallest thing on the screen — while the toolbar buttons got proper big
  icons. **This is the "spacing between emojis and text" you spotted**; it was
  a size problem rather than a spacing one. They now match.

## [19.5.0] - IT TALKS BACK

The Pokémon answer back now, and the CRY button finally works on the iPad.

### Added
- **Pet your Pokémon.** Tap a Pokémon you have already caught — on the dex, or
  your own Pokémon during a fight — and it hops, hearts pop out of it, the
  iPad buzzes and it makes its cry. There is no reward and no way to get it
  wrong. Tap it five times fast and it spins with twelve hearts and a little
  fanfare. Tapping one you have NOT caught still opens the ball drawer for Art
  exactly as before.
- **Every button clicks.** Tapping anything in the game now makes a short click
  and a small bump under your finger — buttons, habitat cards, PC tiles, balls,
  team slots, everything.
- **A BUZZ switch in Settings**, next to MUSIC & SOUND. It only affects the
  device you set it on; it does not travel in a save file.

### Fixed
- **The CRY button has probably never made a sound on your iPad.** Pokémon
  cries are delivered in a format Safari cannot play at all, so every tap has
  been silently doing nothing. The game now checks first, and where the real
  cry cannot play it invents one instead — a short chiptune squeak built from
  that Pokémon's number, size and stats. Each Pokémon always gets the same
  one, so #25 always sounds like #25. (Still no talking, ever.)
- **Music no longer dies after a phone call.** When the iPad interrupted the
  game — a call, a video, backgrounding the app — the sound stopped for good
  until you force-quit and reopened it. It now comes back by itself.
- **The beat no longer stumbles.** Confetti, sprite loading and big animations
  used to drag the music off the beat. The tune is now scheduled against the
  sound hardware's own clock, so nothing on screen can push it around.
- **Hits sound and feel different from each other.** A super-effective hit
  buzzes as three thumps, a weak one as a single tap.
- The tooltip on JUNIOR MODE still advertised the spoken names removed back in
  v18.3.0. The CRY button's picture is a speaker now instead of an explosion.

## [19.4.0] - LEVEL UP!

Hits look like they hurt, levelling up is a party, and the box that opens
after a fight finally shows Art what he won.

### Added
- **You can see how much a hit took.** The health bar leaves a white "ghost"
  behind for a moment before it catches up, so the size of the chunk that just
  came off is a picture, not a number. The number underneath counts down
  instead of jumping.
- **Levelling up is an event.** The bar fills to the end, the health box
  flashes gold, a big **LV 13** pops over your Pokémon and a little four-note
  tune goes up. It used to be one line of text Art could not read.
- **The health bar changes colour in one jump** — green, then yellow at half,
  then red near the end — instead of smearing slowly between them.
- **Pokémon move when they fight.** The attacker leans in, everything freezes
  for a split second when the blow lands, and the one that faints actually
  keels over now (it was supposed to and never did).
- **They pop in and out of the ball when you switch**, which replaced two
  sentences and made switching about half a second quicker.

### Changed
- **The box after a fight leads with a picture.** A big sprite of what you
  caught (or the trainer's whole team), a ✅ or ⭐ that pops, and a fat gold XP
  bar — all before the first word. Gabe's sentences are still there, below a
  line. Art's mode hides them and turns CONTINUE into one big ▶.
- **"IT GOT AWAY" has no words any more.** The wild Pokémon just fades out on
  a puff of smoke. Nothing else changed — your team is fine either way.
- **Fights are quicker.** The long pause before every attack is roughly half
  what it was, and the "it's super effective" pauses are much shorter. Tapping
  still hurries anything along.
- **The Pokédex picture stopped flipping to the drawing every four seconds.**
  It stays on the pixel sprite and wipes in when you look up a new one.

### Notes for Kevin
- Nothing was added to the save file. This release cannot touch the boys' data.
- New file `js/fx.js` (all the sprite movement), added to the offline list in
  `sw.js` so it updates with everything else.

## [19.3.0] - PICK THE GOLD ONE

Art can tell his four attacks apart now, and the game stops asking the
internet mid-fight.

### Fixed
- **Two attacks no longer look identical.** If a Pokémon knew two moves of the
  same type, both buttons were the same colour with the same picture, and Art
  had no way to tell them apart — he was picking at random. The second one now
  wears a diagonal stripe.
- **The picture stopped covering the word.** The type symbol was drawn on top
  of the move name, so neither read properly. They now have their own rows.
- **A normal-type move is a fist, not a star.** A gold star reads as "special"
  or "the best one" to a four-year-old. QUICK ATTACK was wearing it.
- **Move names are readable** — bigger, and in capitals instead of the
  lowercase the Pokémon database hands over ("tera blast").

### Added
- **Every attack shows how strong it is,** as one, two or three little squares.
  No reading needed.
- **A gold outline on the move that will really hurt this opponent** — with a
  small up-arrow — and a faded look with a down-arrow on one that will barely
  scratch it. This is on in Art's mode too, because it is a picture, not a
  sentence. It never disables anything and never says no; it just points.
- **The tile you tapped stays lit** while the turn plays out, so you can see
  what you chose.
- **Each type sounds different** — fire crackles, water sweeps, electric
  buzzes — so the fight reads with the screen barely glanced at.
- **Your Pokémon keeps its moves.** Charizard used to be handed four random
  attacks every single time it was sent out, so "my Charizard knows
  Flamethrower" was never true. Movesets are now stable, and a gym trainer's
  Onix has the same moves on a rematch as it did the first time.
- **Battles start instantly.** The game used to ask the internet about ten
  moves every time a Pokémon appeared — roughly 66 requests during one
  Champion fight, each a pause mid-battle. All 559 moves from the first five
  generations now ship inside the app (29 KB), so there is nothing to wait
  for, and battles work with no signal at all.

### Testing
- 167 browser checks, 18 engine tests and 38 layout checks pass, with no
  layout drift — the new three-row tiles fit inside the exact tile height the
  arena rebuild was measured against, so the Pokéball stays reachable.

## [19.2.0] - THE ARENA

The battle screen — the screen the boys spend the most time on — rebuilt so it
looks like a real Game Boy fight and, more importantly, so it fits on a phone.

### Fixed
- **Art can reach the Pokéball.** This is the big one. On a smaller phone
  (a 375x667 screen — an iPhone SE, or a hand-me-down) the buttons in Junior
  Mode ran clean off the bottom of the screen: the Pokéball sat 43 pixels below
  the edge of the display and simply could not be tapped. Art could enter a
  battle and had no way to catch anything. The button now sits comfortably on
  screen with room to spare, at every size, in both modes.
- **RUN can't end a fight by accident any more.** RUN was the biggest, lowest
  button on the screen, right under a thumb, and one bump made the wild
  Pokémon vanish. The row is gone. The way out is the BACK chip in the corner:
  Gabe taps it twice (it turns red and asks), and Art holds it for a moment
  while a bar fills — the same gesture that guards Parent Tools.

### Changed
- **The arena looks like a battle.** The wild Pokémon used to float in the
  top-right corner with 150 pixels of empty sky beneath it, its health box
  sitting on top of it, on a strip of ground that collapsed to almost nothing
  on a small screen. Now both Pokémon stand on proper platforms, sized against
  the screen so nobody shrinks below the buttons, with your Pokémon big in the
  foreground and its feet tucked behind the text box — the way the real games
  frame it.
- **The Pokéball is the hero.** It is now a full-width red button across the
  bottom, with SWITCH as a small chip beside it showing who comes in next.
  On the old screen BALL was half the width of RUN.
- **The title bar is gone**, replaced by a small BACK chip and a chip naming
  where you are — so a wild fight in Deep Forest says DEEP FOREST instead of
  "BATTLE ARENA", and the arena gets that space back.
- **Art taps the swords and he is in a fight.** Junior Mode skips the team
  picker and the sparkle question when he already has a team.

### Testing
- 167 browser checks and 38 layout checks pass. **The layout net now reports
  zero known issues** — all 144 problems it found two releases ago are fixed.

## [19.1.0] - ONE CONSOLE

The app stops looking like five different apps stitched together, and the
writing gets big enough to actually read. Nothing in the game changed — this
is all how it looks and feels.

### Fixed
- **Every label is readable now.** Thirty different pieces of writing around
  the app were printed smaller than the 8-pixel floor the project set itself —
  some as small as 5 pixels, which in the blocky game font is a smear rather
  than a word. The Pokémon names in the PC box, the levels, the badge captions,
  the settings rows, the move names in battle and the ball names in the drawer
  are all up to a readable size. Where a label genuinely could not fit at a
  readable size it was shortened rather than shrunk — the stat rows now read
  HP / ATK / DEF / SPA / SPD / SPE.
- **The difficulty dots on the map are visible.** Every habitat card has shown
  a one-to-three difficulty rating since the FARAWAY LAND update, but the dots
  were being drawn in white on a cream card, so nobody has ever seen them.
  They are now green, amber and red squares — Deep Forest reads as easy and
  Dragon's Den as hard at a glance, with no reading required.
- **The CLOSE button can always be reached.** On the trainer card the button
  sat 1216 pixels down a 667-pixel screen — off the bottom, unreachable, with
  the only way out being to guess. It now sticks to the bottom of any long box.
- **A fainted Pokémon finally keels over.** The tip-over added in v18.6 never
  once appeared: the gentle floating animation was overriding it every frame.
- **The XP bar stopped running backwards** when a Pokémon levelled up.
- **The music comes back after a win.** The victory fanfare was replacing the
  area music and never handing it back, so the game went silent for the rest of
  the session after your first win.
- **The screen can't strobe.** Holding down the Pokédex arrows fired a
  full-screen wipe on every press; it is now limited to well under the rate
  that can trigger photosensitive seizures.
- **The search box no longer pushes the ▶ arrow off the screen.**
- Boxes and menus now fade and pop in instead of appearing instantly, and the
  screens slide in a way that does not stutter on an older iPad.

### Added
- **One set of colours, sizes and spacings for the whole app.** Every screen
  now draws from the same named palette and the same type scale, so the next
  few updates change one thing in one place instead of ninety scattered ones.
- **iPhone and iPad manners:** a long press on a Pokémon no longer pops up the
  phone's share sheet, the keyboard stops autocorrecting Pokémon names into
  English words, lists no longer drag the whole page around, and the ball
  drawer can't peek above the home bar on a notched phone.

### Testing
- 166 browser checks and 38 layout checks pass. The layout net that shipped
  last release found 144 real problems; **140 of them are now fixed**. The four
  that remain are the battle-screen buttons running off a small phone — that is
  the next release.

## [19.0.0] - THE SAFETY NET

The first update of the v19 run. Almost all of this is invisible to the boys on
purpose: it is the seatbelt that makes the next few updates — a rebuilt battle
screen and a proper look for the whole app — safe to attempt.

### Added
- **Tapping hurries a battle along.** Gabe sat through roughly forty seconds of
  waiting per gym fight with no way to move it on. Now a tap skips ahead to the
  next line, and a small blinking arrow appears to show that tapping works —
  Art would never find an invisible shortcut. A wait can only ever be *hurried*,
  never skipped outright, so no celebration flashes past him because a finger
  happened to be down.
- **The computer now checks every screen before you push.** A new check walks
  the game to fifteen screens, on two phone sizes, in both boys' modes, and
  makes sure nothing has fallen off the edge, the Pokéball is always reachable
  in a fight, and no writing has shrunk below readable size. Junior Mode has
  slid off the bottom of the screen twice before without anything noticing;
  it cannot happen again silently. Run it with `npm run scenes`.
- **A promise to Art, written down as a test.** Five new checks prove his
  Pokémon cannot be knocked out, that his attacks always do real damage so a
  fight is winnable, and that the game never mentions anywhere on screen that
  it is going easy on him. Nothing changed for him — it is a promise the tests
  now keep every single release.
- **A release helper.** `npm run release 19.1.0 "Name"` sets the version number
  in all four places it has to match, warns if the offline file list is
  incomplete, starts the changelog entry, runs the tests, and prints the exact
  git commands to run. Getting one of those four places wrong is what leaves
  the boys with a half-updated app.

### Known issues, now written down
- The check above found 144 real problems that were already there, and they are
  recorded in `test/known-issues.json` so new breakage stands out immediately.
  The two worst are being fixed next: on a small phone the battle buttons run
  off the bottom of the screen (in Art's mode the **Pokéball itself is
  unreachable**), and 22 pieces of writing around the app are too small to read
  comfortably.

## [18.11.0] - THE TUNE-UP

A deep audit of the last three updates — dozens of reviewers combing the code,
then a second pass trying to disprove every complaint. Fourteen survived.
Eight were worth fixing; here they are.

### Fixed
- **Badges arrive at the moment you earn them.** Beating a Gym Leader awarded
  the badge and its Master Ball only at the *next* thing you did — the win was
  recorded a beat after the celebration check ran. Same for the Champion
  badge. Now the badge fires right at the victory (and the Champion badge
  politely waits until after the Hall of Fame instead of covering it).
- **Picking a spoils favorite never benches anyone.** With a full team of six,
  tapping your favorite used to silently overwrite team slot 6 — a team a boy
  arranged himself, changed by one invited tap with only words as warning.
  Now a full team is left alone ("⭐ SAFE IN YOUR BOX!") and the confirmation
  leads with the Pokémon's picture, so Art can read it too. The team spot is
  also locked in the moment you tap, not after the animation — same rule
  catches have followed since v18.4.
- **The world got its shape back.** Habitat difficulty was scaling with every
  one of the 58 trainers you'd beaten instead of your 11 real badges, so after
  a handful of wins *every* habitat maxed out at the same level and the
  difficulty dots all matched. Deep Forest is gentle again; Dragon's Den is not.
- **Removing a Pokémon in Parent Tools asks first.** The red ✕ sat one slip of
  the finger from the level buttons and deleted instantly, permanently. It
  now shows the Pokémon and asks REMOVE or KEEP.
- **A rare nickname mix-up.** If a nickname box was open when the game hit an
  error, the *next* nickname you typed could silently apply to the previous
  Pokémon as well. The prompt now closes properly in every case.
- **A boy's badge count can't drop.** The BADGES number on the trainer card
  ignored earned classic badges — someone with 8/8 would have read 0/17.
  Classic badges now count (8/25 in that case), matching the badge case.
- **Parent Tools shows when the PIN was set.** Setting a PIN the first time is
  first-come-first-served by design (like a TV's parental lock) — so if a
  certain seven-year-old claims it first, the date inside Parent Tools gives
  it away. Set your PIN soon after updating; forgot-the-PIN recovery is in
  the v18.8.0 notes below.
- Two keypad nits: mashing the Parent Tools button with two fingers could pop
  the PIN pad after fingers left the screen, and two gated taps at once could
  double-run the keypad. Both squashed.

### Testing
- 159 browser checks (11 new), including a full rematch played end-to-end
  with a six-Pokémon team to prove nobody gets benched, and a
  badge-fires-at-the-win regression guard.

## [18.10.0] - FARAWAY LAND

Until today, 336 of the game's 649 Pokémon lived *nowhere*. Habitats and gym
trainers between them covered 313 species; the rest could only ever be met by
flipping to their Pokédex page. Now every single one of the 649 has a home in
the world.

### Added
- **336 Pokémon moved into the wild.** Every previously-homeless species now
  appears in the habitat that matches its type — new bugs and plants in the
  Deep Forest, new sea creatures in the Ocean, new ghosts in the Tower, and so
  on. How rare each one is comes from its real in-game strength, so the
  commons stay common and the powerhouses stay special. (Built from PokeAPI's
  own type data, checked by a test that fails if even one of the 649 is ever
  homeless again.)
- **🌈 FARAWAY LAND** — a ninth region on the Explore map, and the reason to
  become Champion. It holds **all 28 legendary and mythical Pokémon that live
  nowhere else** (the Regis, the lake trio, Deoxys, Arceus, Genesect...) plus
  the strongest fully-evolved Pokémon from the whole dex, at the highest wild
  levels in the game. It shows on the map with a 🔒 and "👑 BECOME CHAMPION!"
  until this player finishes the Gym Circuit — a door with a prize behind it,
  visible from day one. Tapping it early explains what opens it. (Junior Mode's
  usual safety leash applies inside, so it can never become a wall for Art.)

### Testing
- 148 browser checks. New ones: all 649 species reachable somewhere in the
  world, FARAWAY LAND locked before Champion and open after, and the locked
  card explaining itself instead of failing silently.

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
