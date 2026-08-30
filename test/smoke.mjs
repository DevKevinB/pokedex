// Smoke test for Pokédex OS — runs against a local static server with
// PokeAPI + sprite CDN fully mocked (sandbox has no egress to them).
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8321';
const NAMES = { 1: 'bulbasaur', 25: 'pikachu', 26: 'raichu', 172: 'pichu' };

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function pokemonFixture(id) {
  const name = NAMES[id] || `mon-${id}`;
  return {
    id, name, height: 4, weight: 60, base_experience: 112,
    types: [{ slot: 1, type: { name: 'electric', url: '' } }],
    abilities: [{ ability: { name: 'static', url: '' }, is_hidden: false, slot: 1 }],
    stats: [
      { base_stat: 35, stat: { name: 'hp' } }, { base_stat: 55, stat: { name: 'attack' } },
      { base_stat: 40, stat: { name: 'defense' } }, { base_stat: 50, stat: { name: 'special-attack' } },
      { base_stat: 50, stat: { name: 'special-defense' } }, { base_stat: 90, stat: { name: 'speed' } }
    ],
    cries: { latest: null },
    species: { url: `https://pokeapi.co/api/v2/pokemon-species/${id}/` },
    sprites: {
      front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',
      front_shiny: null, back_default: null, back_shiny: null,
      other: { 'official-artwork': { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png', front_shiny: null } },
      versions: { 'generation-v': { 'black-white': { animated: { front_default: null, front_shiny: null, back_default: null, back_shiny: null } } } }
    },
    moves: [
      { move: { name: 'thunder-shock', url: 'https://pokeapi.co/api/v2/move/84/' } },
      { move: { name: 'quick-attack', url: 'https://pokeapi.co/api/v2/move/98/' } }
    ]
  };
}

function speciesFixture(id) {
  return {
    capture_rate: 190,
    genera: [{ genus: 'Mouse Pokémon', language: { name: 'en' } }],
    flavor_text_entries: [{ flavor_text: 'It keeps its tail raised to monitor its surroundings.', language: { name: 'en' } }],
    evolution_chain: { url: 'https://pokeapi.co/api/v2/evolution-chain/10/' },
    is_legendary: false, is_mythical: false
  };
}

const evoFixture = {
  chain: {
    species: { name: 'pichu', url: 'https://pokeapi.co/api/v2/pokemon-species/172/' },
    evolves_to: [{
      species: { name: 'pikachu', url: 'https://pokeapi.co/api/v2/pokemon-species/25/' },
      evolves_to: [{ species: { name: 'raichu', url: 'https://pokeapi.co/api/v2/pokemon-species/26/' }, evolves_to: [] }]
    }]
  }
};

const moveFixture = { name: 'thunder-shock', power: 40, type: { name: 'electric' }, damage_class: { name: 'special' } };

async function mockRoutes(context) {
  await context.route('https://pokeapi.co/**', route => {
    const url = route.request().url();
    let body;
    const m = url.match(/pokemon-species\/(\d+)/);
    const p = url.match(/pokemon\/([\w-]+)\/?$/);
    if (url.includes('pokemon?limit')) {
      body = { results: Array.from({ length: 649 }, (_, i) => ({ name: NAMES[i + 1] || `mon-${i + 1}`, url: `https://pokeapi.co/api/v2/pokemon/${i + 1}/` })) };
    } else if (m) body = speciesFixture(parseInt(m[1]));
    else if (url.includes('evolution-chain')) body = evoFixture;
    else if (url.includes('/move/')) body = moveFixture;
    else if (p) {
      const key = p[1];
      const id = /^\d+$/.test(key) ? parseInt(key) : (Object.entries(NAMES).find(([, n]) => n === key)?.[0]);
      if (!id) return route.fulfill({ status: 404, body: 'Not Found' });
      body = pokemonFixture(parseInt(id));
    } else return route.fulfill({ status: 404, body: 'Not Found' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await context.route('https://raw.githubusercontent.com/**', route =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG }));
}


async function dismissCelebrations(page) {
  // Drains anything modal that can sit between the player and the next tap:
  // badge/quest celebrations AND the in-world nickname prompt, which since
  // v18.6 replaces window.prompt() and appears after every new catch.
  for (let i = 0; i < 10; i++) {
    if (await page.locator('#nick-modal').isVisible()) {
      await page.locator('#nick-skip').evaluate(el => el.click());
      await page.waitForTimeout(300);
      continue;
    }
    if (await page.locator('#badge-modal').isVisible()) {
      await page.locator('#badge-ok').evaluate(el => el.click());
      await page.waitForTimeout(400);
      continue;
    }
    break;
  }
}

let failures = 0;
function check(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await mockRoutes(context);
const page = await context.newPage();
const consoleErrors = [];
page.on('pageerror', e => consoleErrors.push(e.message));
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

// THE GAME DOES NOT TALK. Trip a flag if anything ever reaches speech
// synthesis, then assert it stayed false after the full run.
await page.addInitScript(() => {
  window.__SPOKE__ = false;
  try {
    if (window.speechSynthesis) {
      const orig = window.speechSynthesis.speak.bind(window.speechSynthesis);
      window.speechSynthesis.speak = function (...args) { window.__SPOKE__ = true; return orig(...args); };
    }
  } catch (e) { /* noop */ }
});

// NO NATIVE DIALOGS, ever. An installed iOS PWA suppresses alert/confirm/
// prompt (they return null without throwing), so any flow that reaches one
// is a flow that silently dead-ends on the boys' iPad. v18.8 moved every
// site to the in-world dialog system; this guard keeps them out for good.
await page.addInitScript(() => {
  window.__NATIVE_DIALOG__ = false;
  for (const fn of ['alert', 'confirm', 'prompt']) {
    const orig = window[fn].bind(window);
    window[fn] = function (...args) { window.__NATIVE_DIALOG__ = true; return orig(...args); };
  }
});

// Seed a legacy save to validate migration
await page.addInitScript(() => {
  if (!localStorage.getItem('pokedexos_save_v2')) {
    localStorage.setItem('pokedex_caught_p1', JSON.stringify([1, 25]));
  }
});

await page.goto(BASE, { waitUntil: 'networkidle' });
check('boot screen visible', await page.locator('#boot-screen').isVisible());

await page.click('#boot-screen');

// WHO'S PLAYING picker — shown on first boot because no player is remembered
// on this device yet. ART must never land in GABE's profile by default.
await page.waitForFunction(
  () => document.getElementById('whoplaying-modal').style.display === 'flex',
  null, { timeout: 8000 }
);
check("who's playing picker shown on first boot", true);
check('picker offers both trainers', await page.locator('.whoplaying-choice').count() === 2);
await page.locator('.whoplaying-choice[data-player="1"]').evaluate(el => el.click());
check('picker remembers the choice on this device',
  await page.evaluate(() => localStorage.getItem('pokedexos_lastplayer') === '1'));

await page.waitForFunction(() => document.getElementById('poke-name').innerText.toLowerCase() === 'pikachu', null, { timeout: 8000 });
check('pikachu loaded after boot', true);
check('dex number shown', (await page.locator('#id-text').innerText()).includes('0025'));
check('type tag rendered', (await page.locator('#types').innerText()).toLowerCase().includes('electric'));

// legacy migration → catch button should show OWNED (25 was in legacy save)
await page.waitForTimeout(300);
check('legacy save migrated (25 owned)', (await page.locator('#catch-btn').innerText()).includes('OWNED'));

// data sheet
await page.click('#data-btn');
await page.waitForTimeout(600);
check('data sheet opens', await page.locator('#data-sheet.open').count() === 1);
check('flavor text loaded', (await page.locator('#desc').innerText()).includes('tail'));
await page.waitForFunction(() => document.querySelectorAll('#evo-chain .evo-item').length === 3, null, { timeout: 5000 });
check('evolution chain rendered (3 stages incl. pichu)', true);
await page.click('#sheet-handle');
await page.waitForTimeout(500);

// navigation
await page.click('#nav-next');
await page.waitForFunction(() => document.getElementById('poke-name').innerText.toLowerCase() === 'raichu', null, { timeout: 8000 });
check('nav to raichu', true);

// catch flow on un-owned mon (raichu): drawer opens
await page.click('#catch-btn');
await page.waitForTimeout(400);
check('ball drawer opens', await page.locator('#ball-drawer.open').count() === 1);
await page.locator('.ball-opt[data-ball="master-ball"]').click();
await page.waitForFunction(() => document.getElementById('dex-catch-msg').style.opacity === '1', null, { timeout: 12000 });
check('master ball catch succeeds', (await page.locator('#dex-catch-msg').innerText()) === 'GOTCHA!');
await page.waitForFunction(() => document.getElementById('catch-btn').innerText.includes('OWNED'), null, { timeout: 5000 });
check('catch persisted to UI', true);

// Nicknames are asked in-world now, not via window.prompt() — which an
// installed iOS PWA suppresses, so on the boys' actual iPad the old prompt
// silently returned null and the feature did nothing at all.
await page.waitForFunction(
  () => document.getElementById('nick-modal').style.display === 'flex',
  null, { timeout: 8000 }
).catch(() => {});
check('nickname asked in-world, not via a native prompt',
  await page.locator('#nick-modal').isVisible());
await page.fill('#nick-input', 'SPARKY');
await page.locator('#nick-ok').evaluate(el => el.click());
await page.waitForTimeout(400);
check('nickname saved', await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('pokedexos_save_v2') || '{}');
  return s.players && s.players[1] && s.players[1].nicks && s.players[1].nicks[26] === 'SPARKY';
}));

// 3rd catch → maybe a quest celebration, but since the v18.9 badge rebase a
// plain catch must NEVER fire a badge — badges live on the gym circuit now.
await page.waitForTimeout(1200);
const celebrations = [];
for (let i = 0; i < 6; i++) {
  if (!(await page.locator('#badge-modal').isVisible())) break;
  celebrations.push((await page.locator('#badge-title').innerText()).toUpperCase());
  await page.locator('#badge-ok').evaluate(el => el.click());
  await page.waitForTimeout(450);
}
check('no badge fires from a plain catch (badges rebased to gyms)',
  !celebrations.some(t => t.includes('BADGE')));
await dismissCelebrations(page);

// PC box
await page.waitForTimeout(2200); // let catch animation fully release isCatching
await page.click('#pc-btn');
await page.waitForTimeout(400);
check('PC modal opens', await page.locator('#pc-modal').isVisible());
check('6 tabs (G1-G5 + ALL)', await page.locator('.gen-tab').count() === 6);
const caughtCount = await page.locator('.pc-item:not(.uncaught)').count();
check('PC shows 3 caught (1, 25, 26)', caughtCount === 3);
await page.locator('.gen-tab[data-gen="2"]').click();
await page.waitForTimeout(400);
check('gen 2 tab shows uncaught grid', await page.locator('.pc-item.uncaught').count() > 50);
await page.locator('.gen-tab[data-gen="all"]').click();
await page.waitForTimeout(600);
check('ALL tab lists every mon', await page.locator('.pc-item').count() === 649);
await page.fill('#pc-search', 'raichu');
await page.waitForTimeout(500);
check('search narrows to raichu', await page.locator('.pc-item').count() === 1 &&
  (await page.locator('.pc-item .pc-name').first().innerText()).toUpperCase().includes('SPARKY'));
check('nickname saved', await page.evaluate(() => JSON.parse(localStorage.getItem('pokedexos_save_v2')).players[1].nicks['26'] === 'SPARKY'));
await page.fill('#pc-search', '');
await page.locator('.gen-tab[data-gen="1"]').click();
await page.waitForTimeout(400);
await page.click('#close-pc-btn');

// battle: team picker → sparkle modal → regular → battle screen
await page.click('#battle-btn');
await page.waitForTimeout(400);
check('team picker opens', (await page.locator('#pc-instruction').innerText()).includes('TEAM'));
check('team preselected', await page.locator('.pc-item.picked').count() > 0);
await page.click('#close-pc-btn'); // START BATTLE
await page.waitForTimeout(300);
check('sparkle modal opens', await page.locator('#sparkle-modal').isVisible());
check('sparkle locked without shiny', await page.evaluate(() => document.getElementById('variant-sparkle').disabled));
check('sparkle hint explains unlock', (await page.locator('#sparkle-hint').innerText()).toUpperCase().includes('SHINY'));
// force RNG low: guarantees the wild rolls SHINY (0.011 < 1/50) and the throw lands
await page.evaluate(() => { window.__realRandom = Math.random; Math.random = () => 0.011; document.getElementById('variant-sparkle').disabled = false; });
await page.click('#variant-sparkle');
await page.waitForFunction(() => document.getElementById('battle-container').classList.contains('active'), null, { timeout: 10000 });
check('battle screen active', true);
await page.waitForFunction(() => document.querySelectorAll('.move-btn').length > 0, null, { timeout: 5000 });
check('move tiles + hero row rendered', await page.locator('.move-btn').count() >= 3 && await page.locator('#switch-btn').count() === 1 && await page.locator('#run-btn').count() === 0);
check('player level shown', /lv\d+/i.test(await page.locator('#player-name').innerText()));
check('wild level shown', /lv\d+/i.test(await page.locator('#wild-name').innerText()));

// wild rolled shiny under forced RNG
check('shiny wild announced', (await page.locator('#wild-name').innerText()).includes('✨'));

// BALL THROW: RNG still low so the catch always lands
await page.locator('#ball-btn').evaluate(el => el.click());
await page.waitForTimeout(400);
check('ball picker opens', await page.locator('#ballpick-modal').isVisible());
await page.locator('.ballpick[data-ball="ultra-ball"]').evaluate(el => el.click());
await page.waitForFunction(() => document.getElementById('victory-modal').style.display === 'flex', null, { timeout: 20000 });
check('ball catch → gotcha screen', (await page.locator('#victory-lines').innerText()).includes('GOTCHA'));
check('shiny recorded on capture', await page.evaluate(() => JSON.parse(localStorage.getItem('pokedexos_save_v2')).players[1].shinies.length > 0));
await page.evaluate(() => { Math.random = window.__realRandom; });
await page.locator('#victory-continue').evaluate(el => el.click());
await page.waitForFunction(() => !document.getElementById('battle-container').classList.contains('active'), null, { timeout: 15000 });
await page.waitForTimeout(800);
await dismissCelebrations(page);
await page.waitForTimeout(400);
await dismissCelebrations(page);

// start a fresh battle for the fight-to-victory path
await page.click('#battle-btn');
await page.waitForTimeout(500);
await page.locator('#close-pc-btn').evaluate(el => el.click());
await page.waitForTimeout(300);
await page.evaluate(() => { document.getElementById('variant-sparkle').disabled = false; });
await page.locator('#variant-sparkle').evaluate(el => el.click());
await page.waitForFunction(() => document.getElementById('battle-container').classList.contains('active'), null, { timeout: 15000 });
// Wait for the wild name to actually carry a level. The container goes active
// before the opponent is built, so a fixed sleep races the fetch under load.
await page.waitForFunction(
  () => /lv\d+/i.test(document.getElementById('wild-name').innerText),
  null, { timeout: 15000 }
).catch(() => {});
// Read the lead's real level rather than assuming Lv5 — it can level up in the
// battle just fought, which used to make this check fail at random.
// Assert the rule the game ACTUALLY implements. This check used to assert a
// ±20% multiplicative band, which v18.5 deliberately replaced with the
// additive habitat leash — so it had been failing about half the time and
// passing only when the lead happened to have levelled enough to widen the
// window. The leash itself is exhaustively covered in engine.test.mjs; this
// just confirms the rendered battle honours it.
check('wild level inside the habitat leash', await page.evaluate(() => {
  const m = document.getElementById('wild-name').innerText.match(/lv\s*\.?\s*(\d+)/i);
  if (!m) return false;
  const wild = parseInt(m[1]);
  const save = JSON.parse(localStorage.getItem('pokedexos_save_v2') || '{}');
  const p = save.players && save.players[1];
  if (!p) return false;
  const leadId = (p.team && p.team[0]) || (p.caught && p.caught[0]);
  const lead = (p.mons && p.mons[leadId] && p.mons[leadId].level) || 5;
  const junior = !!(p.settings && p.settings.junior);
  const lo = Math.max(2, lead - (junior ? 3 : 5));
  const hi = lead + (junior ? 5 : 8);
  return wild >= lo && wild <= hi;
}));

// This block tests the VICTORY FLOW (KO → auto-catch → victory screen), not
// game balance. Since v18.5 the player can legitimately lose an even fight —
// variance is real and no hit one-shots any more — so stack the deck first and
// make the outcome deterministic. Balance itself is covered by the engine's
// unit tests, which is where it belongs.
await page.evaluate(async () => {
  const B = await import('/js/battle.js');
  const f = B.battleState.loaded[B.battleState.teamIds[B.battleState.activeIdx]];
  if (f) { f.maxHp = 9999; f.hp = 9999; f.atk = 9999; f.spatk = 9999; }
});

let won = false;
// 30 turns, not 16: no single hit can remove more than 60% of a full-health
// Pokemon any more (engine.MAX_HIT_FRACTION), so fights legitimately run longer.
for (let turn = 0; turn < 30 && !won; turn++) {
  const btn = page.locator('.move-btn[data-move="0"]');
  try {
    await page.waitForFunction(() => {
      const log = document.getElementById('battle-log').innerText.toLowerCase();
      return document.getElementById('victory-modal').style.display === 'flex' ||
        document.getElementById('switch-modal').style.display === 'flex' ||
        (!document.querySelector('.move-btn[data-move="0"]')?.disabled &&
         (log.includes('do?') || log.includes('appeared')));
    }, null, { timeout: 15000 });
  } catch (e) { break; }
  if (await page.locator('#victory-modal').isVisible()) { won = true; break; }
  if (await page.locator('#switch-modal').isVisible()) {
    await page.locator('.switch-item').first().evaluate(el => el.click());
    await page.waitForTimeout(2500);
    continue;
  }
  await btn.evaluate(el => el.click());
  await page.waitForTimeout(4200);
  if (await page.locator('#victory-modal').isVisible()) { won = true; }
}
// The capture animation that follows a KO can outlast the loop's inner wait,
// so settle on the real outcome rather than whatever the last iteration saw.
if (!won) {
  await page.waitForFunction(
    () => document.getElementById('victory-modal').style.display === 'flex',
    null, { timeout: 20000 }
  ).catch(() => {});
  won = await page.locator('#victory-modal').isVisible();
}
check('battle won → victory screen', won);
if (won) {
  check('victory shows XP', (await page.locator('#victory-lines').innerText()).includes('XP'));
  await page.locator('#victory-continue').evaluate(el => el.click());
  await page.waitForTimeout(1500);
  // evolution may play for fixture mon; wait for it to finish
  await page.waitForFunction(() => document.getElementById('battle-container').classList.contains('active') === false, null, { timeout: 15000 });
}
check('battle exits to dex', !(await page.locator('#battle-container.active').count()));

// EXPLORE mode: habitat grid → encounter → battle → escape → back to explore
await page.waitForTimeout(800);
await dismissCelebrations(page);
await page.click('#explore-btn');
await page.waitForTimeout(600);
check('explore opens', await page.locator('#explore-container.active').count() === 1);
check('9 habitats listed (8 + FARAWAY LAND)', await page.locator('#habitat-grid .habitat-card').count() === 9);
check('FARAWAY LAND locked before Champion', await page.locator('#habitat-grid .habitat-card.locked').count() === 1);
await page.locator('.habitat-card[data-habitat="faraway"]').click();
await page.waitForTimeout(400);
check('locked FARAWAY explains itself instead of starting an encounter',
  await page.locator('#dlg-modal').isVisible() && !(await page.locator('#encounter-scene').isVisible()));
await page.locator('#dlg-ok').evaluate(el => el.click());
await page.waitForTimeout(300);

// WORLD COVERAGE: with the backfill merged, every one of the 649 species must
// be findable somewhere — a habitat pool or a gym roster. 336 were nowhere.
const unhomed = await page.evaluate(async () => {
  const E = await import('/js/explore.js');
  const G = await import('/js/gymdata.js');
  const world = new Set();
  E.HABITATS.forEach(h => ['c', 'u', 'r', 'L'].forEach(k => h[k].forEach(id => world.add(id))));
  G.GYMS.forEach(g => g.trainers.forEach(t => t.team.forEach(m => world.add(m.id))));
  let missing = 0;
  for (let i = 1; i <= 649; i++) if (!world.has(i)) missing++;
  return missing;
});
check('all 649 species reachable in the world', unhomed === 0);

// v18.11: habitat difficulty reads LEADER badges (0-11), not all 58 trainer
// keys — the old count saturated every band at the leash cap, flattening the
// world's shape.
const bandGuard = await page.evaluate(async () => {
  const S = await import('/js/state.js');
  const E = await import('/js/explore.js');
  const p = S.player();
  const forest = E.HABITATS[0];
  const before = E.habitatLevel(forest);            // deterministic (rng pinned at 0.5)
  for (let i = 0; i < 20; i++) p.gyms.beaten[`fake${i}:0`] = true;   // plain trainer wins
  const afterTrainers = E.habitatLevel(forest);
  p.gyms.beaten['faketown:4'] = true;               // one leader badge
  const afterLeader = E.habitatLevel(forest);
  for (let i = 0; i < 20; i++) delete p.gyms.beaten[`fake${i}:0`];
  delete p.gyms.beaten['faketown:4'];
  S.persist();
  return { flat: afterTrainers === before, rises: afterLeader > afterTrainers };
});
check('habitat bands ignore plain trainer wins (no saturation)', bandGuard.flat);
check('habitat bands still rise with leader badges', bandGuard.rises);

await page.locator('.habitat-card[data-habitat="forest"]').click();
await page.waitForTimeout(800);
check('encounter scene plays', await page.locator('#encounter-scene').isVisible());
await page.waitForFunction(() => document.getElementById('battle-container').classList.contains('active'), null, { timeout: 20000 });
check('explore encounter starts battle', true);
await page.waitForFunction(() => document.querySelectorAll('.move-btn').length > 0, null, { timeout: 8000 });
// v19.2: RUN is gone. The exit chip needs TWO taps in normal mode, so one
// stray thumb can no longer end a fight and lose the wild Pokemon.
await page.locator('#escape-btn').evaluate(el => el.click());
await page.waitForTimeout(150);
check('one tap on the exit chip does NOT leave the battle', await page.locator('#battle-container.active').count() === 1);
await page.locator('#escape-btn').evaluate(el => el.click());
await page.waitForTimeout(900);
check('exit chip returns to explore', await page.locator('#explore-container.active').count() === 1);
await page.click('#explore-back-btn');
await page.waitForTimeout(600);
check('back returns to dex', await page.locator('#explore-container.active').count() === 0);

// TEAM strip: visible in PC, tap promotes to lead
await dismissCelebrations(page);
await page.click('#pc-btn');
await page.waitForTimeout(500);
check('team strip visible', await page.locator('#team-strip').isVisible());
const stripCount = await page.locator('.team-slot').count();
if (stripCount > 1) {
  const secondId = await page.locator('.team-slot').nth(1).getAttribute('data-team-id');
  await page.locator('.team-slot').nth(1).evaluate(el => el.click());
  await page.waitForTimeout(400);
  check('tapped slot becomes lead', (await page.locator('.team-slot.lead').getAttribute('data-team-id')) === secondId);
} else {
  check('tapped slot becomes lead (single member — trivially lead)', await page.locator('.team-slot.lead').count() === 1);
}
await page.locator('#close-pc-btn').evaluate(el => el.click());
await page.waitForTimeout(300);

// trainer card
await page.click('#card-btn');
await page.waitForTimeout(500);
check('trainer card opens', await page.locator('#card-modal').isVisible());
check('17 badge slots (11 circuit + 6 late tier)', await page.locator('.card-badge').count() === 17);
check('badges show live progress, not hover text', await page.locator('.badge-prog').count() >= 1);
check('badges show their goal as visible text', await page.locator('.card-badge em').count() === 17);
check('3 daily quests', await page.locator('.card-quest').count() === 3);
check('oak speaks', (await page.locator('#card-oak').innerText()).includes('OAK'));
const mbOk = await page.evaluate(() => {
  const s2 = JSON.parse(localStorage.getItem('pokedexos_save_v2'));
  return s2.players[1].items.masterBalls >= 1;
});
check('starting master ball persisted', mbOk);
await page.click('#card-close');
await page.waitForTimeout(300);

// v18.11: an earned legacy badge counts in the BADGES stat and renders with
// its ★ — a boy who had 8/8 must never see his number drop to 0.
const legacyCount = await page.evaluate(async () => {
  const S = await import('/js/state.js');
  const P = await import('/js/progression.js');
  const p = S.player();
  p.badges.push('boulder');
  P.openTrainerCard();
  // expectation computed from state — earlier parts of the run may have
  // legitimately earned new-track badges (e.g. a lucky shiny)
  const newEarned = P.BADGES.filter(b => p.badges.includes(b.id)).length;
  const expect = `${newEarned + 1}/${P.BADGES.length + 1}`;
  const txt = document.getElementById('card-stats').innerText;
  const tiles = document.querySelectorAll('.card-badge').length;
  const legacyTiles = document.querySelectorAll('.card-badge.legacy').length;
  P.closeTrainerCard();
  p.badges = p.badges.filter(b => b !== 'boulder');
  S.persist();
  return { ok: txt.includes(expect), tilesOk: tiles === P.BADGES.length + 1, legacyOk: legacyTiles === 1 };
});
check('earned legacy badge keeps its place and its count',
  legacyCount.ok && legacyCount.tilesOk && legacyCount.legacyOk);

// SETTINGS: names, junior mode, sound toggle, save tools
await page.click('#settings-btn');
await page.waitForTimeout(400);
check('settings modal opens', await page.locator('#settings-modal').isVisible());
await page.fill('#set-p1-name', 'GABE');
await page.locator('#set-p1-junior').evaluate(el => el.click());
await page.waitForTimeout(200);
check('junior toggle flips to ON', (await page.locator('#set-p1-junior').innerText()).includes('ON'));
await page.locator('#set-sound').evaluate(el => el.click());
await page.waitForTimeout(150);
check('sound toggles to OFF', (await page.locator('#set-sound').innerText()).includes('OFF'));
await page.locator('#set-sound').evaluate(el => el.click());
await page.waitForTimeout(150);
await page.click('#settings-close');
await page.waitForTimeout(300);
check('player button shows custom name', (await page.locator('#player-btn').innerText()) === 'GABE');
check('junior body class applied', await page.evaluate(() => document.body.classList.contains('junior')));
check('search input hidden in junior', !(await page.locator('#search').isVisible()));
const fits = await page.evaluate(() => {
  const btn = document.getElementById('explore-btn').getBoundingClientRect();
  const sheetTop = document.getElementById('data-sheet').getBoundingClientRect().top;
  return { bottom: Math.round(btn.bottom), sheetTop: Math.round(sheetTop), vh: window.innerHeight };
});
check(`junior EXPLORE fits on screen (${fits.bottom} <= ${fits.sheetTop})`, fits.bottom <= fits.sheetTop + 1 && fits.bottom <= fits.vh);

// navigate to an uncaught mon and tap the sprite to catch — no drawer, guaranteed
await page.click('#nav-next'); // 27
await page.waitForTimeout(1500);
await dismissCelebrations(page);
await page.locator('#poke-sprite').evaluate(el => el.click());
await page.waitForTimeout(400);
check('junior tap opens ball drawer', await page.locator('#ball-drawer.open').count() === 1);
check('master ball count hidden in junior', !(await page.locator('#mb-count').isVisible()));
// a plain Pokéball on a low-rate target: in junior it must ALWAYS land
await page.locator('.ball-opt[data-ball="poke-ball"]').evaluate(el => el.click());
await page.waitForFunction(() => document.getElementById('catch-btn').innerText.includes('OWNED'), null, { timeout: 20000 });
check('junior poke-ball always succeeds', true);
check('confetti spawned', await page.evaluate(() => document.querySelectorAll('.confetti-piece').length > 0));
await page.waitForTimeout(2400);
await dismissCelebrations(page);

// junior mode is per-player: P2 unaffected
await page.click('#player-btn');
await page.waitForTimeout(300);
check('P2 not in junior mode', !(await page.evaluate(() => document.body.classList.contains('junior'))));
await page.click('#player-btn');
await page.waitForTimeout(300);
check('P1 junior persists', await page.evaluate(() => document.body.classList.contains('junior')));

// PARENT TOOLS: hold to open, set the PIN on the in-app keypad (the old
// prompt()-based PIN was unreachable in an installed PWA and failed OPEN)
const tapPin = async digits => {
  for (const d of digits) {
    await page.locator(`#pin-keys button[data-k="${d}"]`).evaluate(el => el.click());
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(450); // 4th digit resolves after a beat
};
await page.click('#settings-btn');
await page.waitForTimeout(400);
const devBtn = await page.locator('#dev-open-btn').boundingBox();
await page.mouse.move(devBtn.x + devBtn.width / 2, devBtn.y + devBtn.height / 2);
await page.mouse.down();
await page.waitForTimeout(1500);
await page.mouse.up();
await page.waitForTimeout(400);
check('in-app PIN pad shown (not a native prompt)', await page.locator('#pin-modal').isVisible());
await tapPin('1234');                  // SET A NEW PIN
check('pad asks to confirm the new PIN', await page.locator('#pin-modal').isVisible());
await tapPin('1234');                  // TYPE IT AGAIN
await page.waitForTimeout(300);
check('parent tools open after PIN setup', await page.locator('#dev-modal').isVisible());
check('PIN stored', await page.evaluate(() => localStorage.getItem('pokedexos_devpin') === '1234'));
// live name suggestions
await page.fill('#dev-add-name', 'raich');
await page.waitForTimeout(600);
check('name suggestions appear', await page.locator('.dev-sug').count() >= 1);
await page.locator('.dev-sug').first().evaluate(el => el.click());
await page.waitForTimeout(200);
check('suggestion fills the id', (await page.inputValue('#dev-add-name')) === '26');
await page.fill('#dev-add-name', '');
await page.fill('#dev-add-name', '150');
await page.fill('#dev-add-level', '70');
await page.locator('#dev-add-btn').evaluate(el => el.click());
await page.waitForTimeout(900);
check('added mon by number at level', (await page.locator('#dev-status').innerText()).includes('Lv70'));
const devSaved = await page.evaluate(() => {
  const s2 = JSON.parse(localStorage.getItem('pokedexos_save_v2'));
  return s2.players[1].caught.includes(150) && s2.players[1].mons['150'].level === 70;
});
check('parent-added mon persisted at Lv70', devSaved);
await page.locator('.dev-row[data-id="150"] .dev-mini[data-act="up"]').evaluate(el => el.click());
await page.waitForTimeout(400);
const bumped = await page.evaluate(() => JSON.parse(localStorage.getItem('pokedexos_save_v2')).players[1].mons['150'].level);
check('level +5 button works (75)', bumped === 75);
// Removal confirms first (v18.11): a mis-tapped ✕ used to destroy an earned
// Pokémon instantly with no undo.
await page.locator('.dev-row[data-id="150"] .dev-mini[data-act="del"]').evaluate(el => el.click());
await page.waitForTimeout(400);
check('remove asks first', await page.locator('#dlg-modal').isVisible());
const stillThere = await page.evaluate(() => JSON.parse(localStorage.getItem('pokedexos_save_v2')).players[1].caught.includes(150));
check('nothing removed before the answer', stillThere);
await page.locator('#dlg-cancel').evaluate(el => el.click());
await page.waitForTimeout(300);
check('KEEP keeps it', await page.evaluate(() => JSON.parse(localStorage.getItem('pokedexos_save_v2')).players[1].caught.includes(150)));
await page.locator('.dev-row[data-id="150"] .dev-mini[data-act="del"]').evaluate(el => el.click());
await page.waitForTimeout(400);
await page.locator('#dlg-ok').evaluate(el => el.click());
await page.waitForTimeout(400);
const removed = await page.evaluate(() => !JSON.parse(localStorage.getItem('pokedexos_save_v2')).players[1].caught.includes(150));
check('remove works after confirming', removed);
check('PIN set-date shown to the grown-up', (await page.locator('#dev-pin-date').innerText()).includes('PIN SET'));
await page.click('#dev-close');
await page.waitForTimeout(300);

// THE PARENT GATE: importing a save can wipe both boys, so PASTE CODE sits
// behind the PIN — and a wrong PIN keeps the gate SHUT (it used to fail open).
await page.click('#settings-btn');
await page.waitForTimeout(400);
await page.locator('#set-import-paste').evaluate(el => el.click());
await page.waitForTimeout(300);
check('paste code asks for the PIN', await page.locator('#pin-modal').isVisible());
await tapPin('9999');                  // wrong on purpose
check('wrong PIN keeps the pad up, gate shut',
  await page.locator('#pin-modal').isVisible() && !(await page.locator('#dlg-input').isVisible()));
await page.locator('#pin-keys button[data-k="cancel"]').evaluate(el => el.click());
await page.waitForTimeout(300);
check('cancelling the PIN never reaches the import', !(await page.locator('#dlg-modal').isVisible()));
await page.locator('#set-import-paste').evaluate(el => el.click());
await page.waitForTimeout(300);
await tapPin('1234');                  // the right PIN opens the in-world paste box
await page.waitForTimeout(300);
check('right PIN reaches the in-world paste box', await page.locator('#dlg-input').isVisible());
await page.locator('#dlg-cancel').evaluate(el => el.click());
await page.waitForTimeout(300);

// turn junior back off for the remaining checks
await page.waitForTimeout(100);
await page.locator('#set-p1-junior').evaluate(el => el.click());
await page.waitForTimeout(200);
await page.click('#settings-close');
await page.waitForTimeout(300);
const monsOk = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('pokedexos_save_v2'));
  return Object.keys(s.players[1].mons || {}).length > 0;
});
check('mon levels persisted', monsOk);

// save v2 persisted & api cache populated
const saveOk = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('pokedexos_save_v2'));
  return s?.version === 2 && s.players[1].caught.includes(26) && s.players[1].caught.includes(1);
});
check('v2 save contains migrated + new catches', saveOk);
const cacheOk = await page.evaluate(() => {
  const c = JSON.parse(localStorage.getItem('pokedexos_apicache_v2') || '{}');
  return !!c['pkmn:25'] && !!c['pkmn:26'];
});
check('api cache populated', cacheOk);

// second load should render from cache with zero pokeapi hits
let apiHits = 0;
await context.route('https://pokeapi.co/api/v2/pokemon/25', route => { apiHits++; route.continue(); });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.click('#boot-screen');
await page.waitForFunction(() => document.getElementById('poke-name').innerText.toLowerCase() === 'pikachu', null, { timeout: 8000 });
check('reload renders pikachu from cache', true);
check('no api refetch for cached mon', apiHits === 0);

// export/import round trip
const code = await page.evaluate(async () => {
  const { exportCode } = await import('./js/state.js');
  return exportCode();
});
check('export code generated', typeof code === 'string' && code.length > 20);

// LEVEL → POWER: a parent-set high level must produce real battle stats
await page.evaluate(() => {
  const sv = JSON.parse(localStorage.getItem('pokedexos_save_v2'));
  sv.players[1].team = [25];
  sv.players[1].mons['25'] = { level: 80, xp: 0 };
  sv.players[1].settings.junior = false;
  localStorage.setItem('pokedexos_save_v2', JSON.stringify(sv));
});
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.click('#boot-screen');
await page.waitForTimeout(1500);
await page.click('#battle-btn');
await page.waitForTimeout(500);
await page.locator('#close-pc-btn').evaluate(el => el.click());
await page.waitForTimeout(300);
await page.locator('#variant-regular').evaluate(el => el.click());
await page.waitForFunction(() => document.getElementById('battle-container').classList.contains('active'), null, { timeout: 15000 });
await page.waitForTimeout(600);
const lvlTxt = await page.locator('#player-name').innerText();
const hpTxt = await page.locator('#player-hp-text').innerText();
const maxHp = parseInt(hpTxt.split('/')[1]);
check('battle shows the parent-set level (Lv80)', /lv80/i.test(lvlTxt));
check(`Lv80 HP scales up (${maxHp} HP vs ~18 at Lv5)`, maxHp > 100);
await page.locator('#escape-btn').evaluate(el => el.click());
await page.waitForTimeout(150);
await page.locator('#escape-btn').evaluate(el => el.click());
await page.waitForTimeout(800);

// GYM CIRCUIT: browse, fight trainer 1 with the Lv80 lead, capture their team
await page.click('#gyms-btn');
await page.waitForTimeout(600);
check('gym screen opens', await page.locator('#gym-container.active').count() === 1);
check('12 gym stops listed', await page.locator('.gym-card').count() === 12);
check('gym 2 locked at start', await page.locator('.gym-card.locked').count() >= 10);
check('poke center button present', await page.locator('#poke-center-btn').isVisible());
await page.locator('.gym-card[data-gym="rock"]').click();
await page.waitForTimeout(500);
check('5 trainers in boulder gym', await page.locator('.trainer-card').count() === 5);
check('trainer 1 challengeable', (await page.locator('.trainer-card').first().innerText()).includes('TAP TO BATTLE'));
// v18.11 regression: the 'gymwin' badge event must fire AFTER the win is
// recorded — circuit badges read gyms.beaten, and until this fix the leader
// badge only arrived on the NEXT unrelated event.
await page.evaluate(() => {
  window.__gymwinFresh = null;
  document.addEventListener('game-progress', e => {
    if (e.detail?.kind === 'gymwin' && window.__gymwinFresh === null) {
      const sv = JSON.parse(localStorage.getItem('pokedexos_save_v2'));
      window.__gymwinFresh = sv.players[1].gyms.beaten['rock:0'] === true;
    }
  });
});
await page.evaluate(() => { window.__r2 = Math.random; Math.random = () => 0.011; });
await page.locator('.trainer-card').first().evaluate(el => el.click());
await page.waitForFunction(() => document.getElementById('battle-container').classList.contains('active'), null, { timeout: 15000 });
await page.waitForTimeout(500);
check('battle title shows trainer name', (await page.locator('#battle-title').innerText()).includes('CARL'));
check('no BALL button vs trainers', await page.locator('#ball-btn').count() === 0);
let gymWon = false;
for (let turn = 0; turn < 8 && !gymWon; turn++) {
  if (await page.locator('#victory-modal').isVisible()) { gymWon = true; break; }
  const can = await page.evaluate(() => { const b = document.querySelector('.move-btn[data-move="0"]'); return b && !b.disabled; });
  if (can) await page.locator('.move-btn[data-move="0"]').evaluate(el => el.click());
  await page.waitForTimeout(3800);
  if (await page.locator('#victory-modal').isVisible()) gymWon = true;
}
await page.evaluate(() => { Math.random = window.__r2; });
check('gym trainer defeated', gymWon);
check('badge event fires with the win already recorded',
  await page.evaluate(() => window.__gymwinFresh === true));
check('spoils listed', (await page.locator('#victory-lines').innerText()).toLowerCase().includes('whole team'));

// SPOILS CEREMONY (v18.9): the beaten roster is tappable sprites; picking a
// favorite plays the capture animation and takes a team slot.
check('spoils shown as tappable sprites', await page.locator('.spoils-pick').count() >= 1);
await page.locator('.spoils-pick').first().evaluate(el => el.click());
await page.waitForFunction(() => {
  const m = document.getElementById('victory-modal');
  const hint = document.getElementById('spoils-hint');
  return m.style.display === 'flex' && hint && hint.innerText.includes('TEAM');
}, null, { timeout: 15000 });
check('favorite captured with ceremony and joins the team',
  await page.evaluate(() => JSON.parse(localStorage.getItem('pokedexos_save_v2')).players[1].team.includes(74)));
await page.locator('#victory-continue').evaluate(el => el.click());
await page.waitForTimeout(1200);
check('returned to gym trainer list', await page.locator('#gym-container.active').count() === 1);
check('trainer 1 marked beaten', (await page.locator('.trainer-card').first().innerText()).includes('✅'));
check('beaten trainer offers a REMATCH', (await page.locator('.trainer-card').first().innerText()).includes('REMATCH'));
const gymSave = await page.evaluate(() => {
  const sv = JSON.parse(localStorage.getItem('pokedexos_save_v2'));
  return sv.players[1].caught.includes(74) && sv.players[1].mons['74']?.level === 8 && !!sv.players[1].gyms.beaten['rock:0'];
});
check('trainer team captured + progress saved', gymSave);
await dismissCelebrations(page);

// SPOILS HONESTY: an award for an already-owned species raises its level to
// what the victory screen claims (never lowers it). Old code silently no-oped
// on 24 of the 164 awards.
const honesty = await page.evaluate(async () => {
  const S = await import('/js/state.js');
  S.ensureMon(60, 5);
  S.ensureMonAtLeast(60, 40);
  const raised = S.player().mons[60].level === 40;
  S.ensureMonAtLeast(60, 10);
  const kept = S.player().mons[60].level === 40;
  delete S.player().mons[60];
  return raised && kept;
});
check('spoils raise an owned mon to the claimed level, never lower', honesty);

// BADGE REBASE: beating a gym leader awards that leader's badge + master ball.
const badgeUnit = await page.evaluate(async () => {
  const S = await import('/js/state.js');
  const P = await import('/js/progression.js');
  const p = S.player();
  const ballsBefore = p.items.masterBalls;
  ['rock:1', 'rock:2', 'rock:3', 'rock:4'].forEach(k => { p.gyms.beaten[k] = true; });
  P.onProgress('win');
  return { badge: p.badges.includes('gym-rock'), ball: p.items.masterBalls === ballsBefore + 1 };
});
check('leader badge fires from gyms.beaten', badgeUnit.badge);
check('leader badge still pays a master ball', badgeUnit.ball);
await dismissCelebrations(page);

// QUEST HONESTY: gym spoils dispatch 'gymCatch', which must not tick
// "Catch N Pokémon" quests — no ball was thrown.
const questGuard = await page.evaluate(async () => {
  const P = await import('/js/progression.js');
  const snap = () => JSON.stringify(P.ensureDailyQuests().list.filter(q => q.key.startsWith('catch')));
  const before = snap();
  document.dispatchEvent(new CustomEvent('game-progress', { detail: { kind: 'gymCatch', types: [] } }));
  return before === snap();
});
check('gym spoils no longer tick catch quests', questGuard);
await dismissCelebrations(page);

// REMATCH, end to end — and the no-evict rule: with a FULL team, picking a
// spoils favorite must not silently bench anyone (v18.11; team[5] used to be
// overwritten on one invited tap).
const originalTeam = await page.evaluate(async () => {
  const S = await import('/js/state.js');
  const saved = [...S.player().team];
  [10, 16, 13].forEach(id => S.recordCatch(id));
  S.player().team = [25, 1, 26, 10, 16, 13];   // full six, none is #74
  S.persist();
  return saved;
});
await page.evaluate(() => { window.__r2 = Math.random; Math.random = () => 0.011; });
await page.locator('.trainer-card').first().evaluate(el => el.click());
await page.waitForFunction(() => document.getElementById('battle-container').classList.contains('active'), null, { timeout: 15000 });
await page.waitForTimeout(500);
let rematchWon = false;
for (let turn = 0; turn < 8 && !rematchWon; turn++) {
  if (await page.locator('#victory-modal').isVisible()) { rematchWon = true; break; }
  const can = await page.evaluate(() => { const b = document.querySelector('.move-btn[data-move="0"]'); return b && !b.disabled; });
  if (can) await page.locator('.move-btn[data-move="0"]').evaluate(el => el.click());
  await page.waitForTimeout(3800);
  if (await page.locator('#victory-modal').isVisible()) rematchWon = true;
}
await page.evaluate(() => { Math.random = window.__r2; });
check('rematch battle plays and is won', rematchWon);
await page.locator('.spoils-pick').first().evaluate(el => el.click());
await page.waitForFunction(() => {
  const m = document.getElementById('victory-modal');
  const hint = document.getElementById('spoils-hint');
  return m.style.display === 'flex' && hint && hint.innerText.includes('BOX');
}, null, { timeout: 15000 });
const fullTeamKept = await page.evaluate(() =>
  JSON.stringify(JSON.parse(localStorage.getItem('pokedexos_save_v2')).players[1].team) === JSON.stringify([25, 1, 26, 10, 16, 13]));
check('full team: favorite stays in the box, nobody gets benched', fullTeamKept);
await page.locator('#victory-continue').evaluate(el => el.click());
await page.waitForTimeout(1200);
await page.evaluate(async team => {
  const S = await import('/js/state.js');
  S.player().team = team;
  S.persist();
}, originalTeam);
await dismissCelebrations(page);
await page.locator('#gym-back-btn').evaluate(el => el.click());
await page.waitForTimeout(400);
await page.locator('#gym-back-btn').evaluate(el => el.click());
await page.waitForTimeout(500);
check('gym screen closes to dex', await page.locator('#gym-container.active').count() === 0);

// VERSUS MODE: seed P2 with a weak mon, then GABE vs P2 pass-and-play
await page.evaluate(() => {
  const sv = JSON.parse(localStorage.getItem('pokedexos_save_v2'));
  sv.players[2].caught = [1];
  sv.players[2].mons = { 1: { level: 5, xp: 0 } };
  sv.players[2].team = [1];
  localStorage.setItem('pokedexos_save_v2', JSON.stringify(sv));
});
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.click('#boot-screen');
await page.waitForTimeout(1600);
await dismissCelebrations(page);
await page.click('#gyms-btn');
await page.waitForTimeout(600);
check('VS button on gym screen', await page.locator('#vs-btn').isVisible());
await page.locator('#vs-btn').evaluate(el => el.click());
await page.waitForFunction(() => document.getElementById('pass-modal').style.display === 'flex', null, { timeout: 20000 });
check('pass-and-play handoff appears', (await page.locator('#pass-name').innerText()).includes('GABE'));
check('versus title shows both players', (await page.locator('#battle-title').innerText()).includes('VS'));
await page.locator('#pass-ready').evaluate(el => el.click());
await page.waitForTimeout(500);
check('versus moves rendered', await page.locator('[data-vmove]').count() >= 1);
// Play the match out. A single tap used to end it, but no single hit can
// delete a full-health Pokémon any more (engine.MAX_HIT_FRACTION), so this
// now drives a real multi-turn pass-and-play match: attack, hand over, repeat.
let vsWon = false;
for (let turn = 0; turn < 40 && !vsWon; turn++) {
  if (await page.locator('#victory-modal').isVisible()) { vsWon = true; break; }
  if (await page.locator('#pass-modal').isVisible()) {
    await page.locator('#pass-ready').evaluate(el => el.click());
    await page.waitForTimeout(350);
    continue;
  }
  const move0 = page.locator('[data-vmove="0"]');
  if (await move0.count() && !(await move0.first().isDisabled())) {
    await move0.first().evaluate(el => el.click());
  }
  await page.waitForTimeout(700);
}
await page.waitForFunction(() => document.getElementById('victory-modal').style.display === 'flex', null, { timeout: 25000 });
check('versus match plays to a winner over multiple turns', true);
check('versus winner announced', (await page.locator('#victory-lines').innerText()).includes('WINS'));
await page.locator('#victory-continue').evaluate(el => el.click());
await page.waitForTimeout(1000);
check('versus returns to gym screen', await page.locator('#gym-container.active').count() === 1);
check('versus win recorded', await page.evaluate(() => JSON.parse(localStorage.getItem('pokedexos_save_v2')).players[1].stats.versusWins === 1));
await page.locator('#gym-back-btn').evaluate(el => el.click());
await page.waitForTimeout(500);

// ============================================================
// v18.4 regressions. Run LAST and against the live ES modules, because these
// mutate the save on purpose — nothing downstream may depend on them.
// ============================================================
const teardown = await page.evaluate(async () => {
  const B = await import('/js/battle.js');
  // Simulate the exact CRITICAL bug: one ESCAPE tap during a versus match used
  // to leave versusActive true, which silently stripped ART's no-faint shield
  // for the rest of the session.
  B.battleState.versusActive = true;
  B.battleState.busy = true;
  B.battleState.pendingEvolution = { id: 25 };
  B.battleState.bankedCatch = { id: 25 };
  const e0 = B.battleState.epoch;
  B.exitBattleMode();
  return {
    epochBumped: B.battleState.epoch === e0 + 1,
    versusCleared: B.battleState.versusActive === false,
    busyCleared: B.battleState.busy === false,
    evoCleared: B.battleState.pendingEvolution === null,
    catchCleared: B.battleState.bankedCatch === null
  };
});
check('exit bumps the battle epoch (orphaned turns go stale)', teardown.epochBumped);
check("exit clears versusActive (ART keeps his no-faint shield)", teardown.versusCleared);
check('exit clears busy, pendingEvolution and bankedCatch',
  teardown.busyCleared && teardown.evoCleared && teardown.catchCleared);

// v18.11: teardown must SETTLE an open nickname prompt, not just hide it —
// the leaked listeners used to rename the previously caught Pokémon too.
const nickLeak = await page.evaluate(async () => {
  const N = await import('/js/nickname.js');
  const B = await import('/js/battle.js');
  let settled = 'pending';
  N.askNickname(25, 'PIKACHU').then(v => { settled = v === null ? 'null' : 'value'; });
  await new Promise(r => setTimeout(r, 30));
  B.exitBattleMode();
  await new Promise(r => setTimeout(r, 80));
  return { settled, hidden: document.getElementById('nick-modal').style.display === 'none' };
});
check('teardown settles an open nickname prompt (no listener leak)',
  nickLeak.settled === 'null' && nickLeak.hidden);

const fences = await page.evaluate(async () => {
  const S = await import('/js/state.js');
  const out = {};
  const before = S.state.save.players[1].caught.length;

  // THE catastrophic case: a valid-looking code that silently wipes both boys.
  const emptyCode = btoa(JSON.stringify({ v: 2, save: { players: {} } }));
  try { S.importCode(emptyCode); out.emptyRejected = false; }
  catch (e) { out.emptyRejected = e.message === 'EMPTY_SAVE'; }
  out.survivedEmpty = S.state.save.players[1].caught.length === before;

  // Junk and hostile input inside an otherwise valid code.
  const dirty = btoa(unescape(encodeURIComponent(JSON.stringify({ v: 2, save: { players: {
    1: {
      caught: [25, 1, 'x', null, 99999, 26],
      team: [26, 25],                       // deliberately NOT sorted
      mons: { 25: { level: 300, xp: -5 } },
      name: '<img src=x onerror=alert(1)>'
    },
    2: { caught: [] }
  } } }))));
  S.importCode(dirty);
  const p1 = S.state.save.players[1];
  out.caughtClean = JSON.stringify(p1.caught) === JSON.stringify([1, 25, 26]);
  out.teamOrderKept = JSON.stringify(p1.team) === JSON.stringify([26, 25]);
  out.levelClamped = p1.mons[25].level === 100 && p1.mons[25].xp === 0;
  out.nameEscaped = !p1.name.includes('<');

  // And the import is reversible.
  out.hasPrev = S.hasPreviousSave();
  S.restorePreviousSave();
  out.undoRestored = S.state.save.players[1].caught.length === before;
  return out;
});
check('empty save code is refused, not applied', fences.emptyRejected);
check('both boys survive an empty import', fences.survivedEmpty);
check('import strips junk ids', fences.caughtClean);
check('import preserves team ORDER (team[0] is the lead)', fences.teamOrderKept);
check('import clamps absurd levels and negative xp', fences.levelClamped);
check('import escapes hostile names', fences.nameEscaped);
check('import takes an undo snapshot', fences.hasPrev);
check('UNDO IMPORT restores the previous save', fences.undoRestored);

// ---- v18.7: the game remembers he became Champion ----
// Before this the entire ending was one <p> in a victory list and the save had
// no field for it: Gabe could become Champion and by morning there'd be no
// evidence it ever happened.
const champ = await page.evaluate(async () => {
  const S = await import('/js/state.js');
  const before = S.isChampion();
  S.recordChampion([25, 26, 1]);
  const rec = S.championRecord();
  // Written once, on the day it first happened — a later completion must not
  // overwrite the original date.
  const second = S.recordChampion([172]);
  const after = S.championRecord();
  return {
    before, wroteOnce: second === false,
    teamKept: JSON.stringify(after.team) === JSON.stringify(rec.team),
    hasDate: /^\d{4}-\d{2}-\d{2}$/.test(rec.date),
    hasLevels: rec.levels && typeof rec.levels === 'object',
    persisted: (() => {
      const s = JSON.parse(localStorage.getItem('pokedexos_save_v2') || '{}');
      return !!(s.players && s.players[1] && s.players[1].champion);
    })()
  };
});
check('champion flag starts empty', champ.before === false);
check('champion record has a date, a team and their levels',
  champ.hasDate && champ.hasLevels);
check('champion is written once and keeps the original day',
  champ.wroteOnce && champ.teamKept);
check('champion survives to the save file', champ.persisted);

// A pasted import code is untrusted — junk here would crash the proudest
// screen in the game.
const champGuard = await page.evaluate(async () => {
  const S = await import('/js/state.js');
  const bad = ['{"v":2,"save":{"players":{"1":{"champion":{"date":"nope","team":[1]}}}}}',
               '{"v":2,"save":{"players":{"1":{"champion":{"date":"2026-01-02","team":[99999,null]}}}}}',
               '{"v":2,"save":{"players":{"1":{"champion":"yes"}}}}'];
  return bad.map(b => { try { S.importCode(b); return S.championRecord(); } catch (e) { return 'threw'; } });
});
check('malformed champion records are rejected, not rendered',
  champGuard.every(r => r === null || r === 'threw'));

// The crown renders on the trainer card and nowhere else until earned.
const crown = await page.evaluate(async () => {
  const S = await import('/js/state.js');
  S.recordChampion([25]);
  const P = await import('/js/progression.js');
  P.openTrainerCard();
  const html = document.getElementById('card-title')?.innerHTML || '';
  P.closeTrainerCard();
  return html;
});
check('crown appears on the trainer card once Champion', crown.includes('champ-crown'));

// ...and the crown opens FARAWAY LAND.
await page.click('#explore-btn');
await page.waitForTimeout(500);
check('FARAWAY LAND unlocks for the Champion', await page.locator('#habitat-grid .habitat-card.locked').count() === 0);
await page.click('#explore-back-btn');
await page.waitForTimeout(400);

// ---- v18.6: the battle screen works without words ----
// ART cannot read. These assert that the wordless channel actually exists,
// because if it silently regresses nothing else replaces it for him.
const visual = await page.evaluate(async () => {
  const B = await import('/js/battle.js');
  const C = await import('/js/config.js');
  // Every type in the game must have a picture, or a move tile falls back to
  // being a word-only button for the child who can't read words.
  const missing = Object.keys(C.typeColors).filter(t => !C.typeEmoji[t]);
  // Ink must be chosen by luminance. White on ground was 1.36:1 — invisible.
  // Measure the real contrast ratio of every type chip with the ink the game
  // actually picks. White-on-ground used to be ~1.4:1.
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  let worst = 99, worstType = '';
  for (const [name, col] of Object.entries(C.typeColors)) {
    const r = ratio(C.luminance(col), C.luminance(C.inkFor(col)));
    if (r < worst) { worst = r; worstType = name; }
  }
  return { missing, worst, worstType, hasImpactFx: typeof B.battleState === 'object' };
});
check('every type has a picture, not just a word', visual.missing.length === 0);
check(`every type chip clears WCAG AA (worst: ${visual.worstType} ${visual.worst.toFixed(2)}:1)`,
  visual.worst >= 4.5);


// ============================================================
// THE PROMISE TO ART  (v19.0)
// Rule 2 of CLAUDE.md: Junior Mode never punishes, and never advertises that
// it is helping. Those were guarded only by unit tests on the engine; nothing
// checked the promise end to end, in the browser, the way Art meets it. These
// checks exist so a future change cannot quietly take the floor away from him.
// ============================================================
check('pacing seam exists and honours its floor', await page.evaluate(async () => {
  const C = await import('/js/config.js');
  if (typeof C.awaitOrTap !== 'function') return false;
  const wasFast = C.PACE.fast;
  C.PACE.fast = true;
  const t0 = performance.now();
  await C.awaitOrTap(4000);          // a long ceremony, in fast mode
  const dt = performance.now() - t0;
  C.PACE.fast = wasFast;
  // clamped to the floor, but never allowed to vanish entirely
  return dt < 1200 && dt >= C.PACE.floor - 30;
}));

check('a wait can never resolve faster than the floor', await page.evaluate(async () => {
  const C = await import('/js/config.js');
  const wasFast = C.PACE.fast; C.PACE.fast = false;
  const t0 = performance.now();
  const pending = C.awaitOrTap(900);
  // a finger already down must not skip the beat instantly
  document.getElementById('battle-container')?.dispatchEvent(new Event('pointerdown'));
  await pending;
  const dt = performance.now() - t0;
  C.PACE.fast = wasFast;
  return dt >= C.PACE.floor - 30;
}));

// Art's Pokémon do not faint. Six turns against a maximum-level attacker.
check('junior: six hits from a Lv100 attacker never drop Art below 1 HP', await page.evaluate(async () => {
  const E = await import('/js/engine.js');
  const atk = { level: 100, name: 'BOSS', types: [{ type: { name: 'dragon' } }],
    atk: 250, def: 200, spatk: 250, spdef: 200 };
  const move = { name: 'outrage', power: 120, type: 'dragon', damage_class: 'physical' };
  const fighter = { level: 5, name: 'ART', types: [{ type: { name: 'normal' } }],
    atk: 20, def: 20, spatk: 20, spdef: 20, maxHp: 100, hp: 100 };
  for (let i = 0; i < 6; i++) {
    const { damage } = E.computeDamage(atk, fighter, move, { junior: 'defender' });
    fighter.hp = Math.max(1, fighter.hp - damage * 0.5);
    if (fighter.hp < 1) return false;
  }
  return fighter.hp >= 1;
}));

// ...and his attacks always land somewhere meaningful, so a fight can be won.
check('junior: Art always does real damage, even into a wall', await page.evaluate(async () => {
  const E = await import('/js/engine.js');
  const art = { level: 5, name: 'ART', types: [{ type: { name: 'normal' } }],
    atk: 20, def: 20, spatk: 20, spdef: 20 };
  const wall = { level: 100, name: 'WALL', types: [{ type: { name: 'steel' } }],
    atk: 200, def: 400, spatk: 200, spdef: 400, maxHp: 400, hp: 400 };
  const weak = { name: 'tackle', power: 20, type: 'normal', damage_class: 'physical' };
  const { damage } = E.computeDamage(art, wall, weak, { junior: 'attacker' });
  return damage >= wall.maxHp * 0.10;
}));

// The accommodations must stay invisible. Art should feel skilled, not helped.
check('junior mode never says it is helping', await page.evaluate(() => {
  const banned = /junior|easy mode|easier|can't lose|cannot lose|always catch|guaranteed/i;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const el = n.parentElement;
    if (!el) continue;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    if (!el.getBoundingClientRect().width) continue;
    if (banned.test(n.textContent || '')) return false;
  }
  return true;
}));

// ---- the game never talks ----
check('no VOICE button in the toolbar', await page.locator('#voice-btn').count() === 0);
check('speech synthesis never invoked', await page.evaluate(() => window.__SPOKE__ === false));

// ---- and it never opens a native dialog (suppressed in installed PWAs) ----
check('native alert/confirm/prompt never invoked', await page.evaluate(() => window.__NATIVE_DIALOG__ === false));

await page.screenshot({ path: 'test/screen-dex.png' });

const realErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('Failed to load resource'));
check('no console/page errors', realErrors.length === 0);
if (realErrors.length) console.log('Errors:', realErrors);

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
