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
  for (let i = 0; i < 8; i++) {
    if (await page.locator('#badge-modal').isVisible()) {
      await page.locator('#badge-ok').evaluate(el => el.click());
      await page.waitForTimeout(400);
    } else break;
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
page.once('dialog', d => d.accept('SPARKY'));
await page.locator('.ball-opt[data-ball="master-ball"]').click();
await page.waitForFunction(() => document.getElementById('dex-catch-msg').style.opacity === '1', null, { timeout: 12000 });
check('master ball catch succeeds', (await page.locator('#dex-catch-msg').innerText()) === 'GOTCHA!');
await page.waitForFunction(() => document.getElementById('catch-btn').innerText.includes('OWNED'), null, { timeout: 5000 });
check('catch persisted to UI', true);

// 3rd catch → celebrations. A random daily quest can also complete on this same
// catch, and quests and badges share #badge-modal, so the Boulder Badge is NOT
// reliably the first one shown. Drain the whole queue and assert Boulder is in
// it. (Asserting on the first modal made this check flaky at random.)
await page.waitForFunction(() => {
  const m = document.getElementById('badge-modal');
  const t = document.getElementById('badge-title');
  return m && m.style.display === 'flex' && t && t.innerText.trim().length > 0;
}, null, { timeout: 10000 }).catch(() => {});
check('boulder badge celebration', await page.locator('#badge-modal').isVisible());
const celebrations = [];
for (let i = 0; i < 6; i++) {
  if (!(await page.locator('#badge-modal').isVisible())) break;
  celebrations.push((await page.locator('#badge-title').innerText()).toUpperCase());
  await page.locator('#badge-ok').evaluate(el => el.click());
  await page.waitForTimeout(450);
}
check('badge title correct', celebrations.some(t => t.includes('BOULDER')));
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
check('move buttons + switch/run rendered', await page.locator('.move-btn').count() >= 3 && await page.locator('#switch-btn').count() === 1);
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
check('wild level within ±20% of lead', await page.evaluate(() => {
  const m = document.getElementById('wild-name').innerText.match(/lv\s*\.?\s*(\d+)/i);
  if (!m) return false;
  const wild = parseInt(m[1]);
  const save = JSON.parse(localStorage.getItem('pokedexos_save_v2') || '{}');
  const p = save.players && save.players[1];
  if (!p) return false;
  const leadId = (p.team && p.team[0]) || (p.caught && p.caught[0]);
  const lead = (p.mons && p.mons[leadId] && p.mons[leadId].level) || 5;
  return wild >= Math.floor(lead * 0.8) && wild <= Math.ceil(lead * 1.2);
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
check('8 habitats listed', await page.locator('.habitat-card').count() === 8);
await page.locator('.habitat-card[data-habitat="forest"]').click();
await page.waitForTimeout(800);
check('encounter scene plays', await page.locator('#encounter-scene').isVisible());
await page.waitForFunction(() => document.getElementById('battle-container').classList.contains('active'), null, { timeout: 20000 });
check('explore encounter starts battle', true);
await page.waitForFunction(() => document.querySelectorAll('.move-btn').length > 0, null, { timeout: 8000 });
await page.locator('#run-btn').evaluate(el => el.click());
await page.waitForTimeout(900);
check('run returns to explore', await page.locator('#explore-container.active').count() === 1);
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
check('8 badge slots', await page.locator('.card-badge').count() === 8);
check('boulder badge earned on card', await page.locator('.card-badge.earned').count() >= 1);
check('3 daily quests', await page.locator('.card-quest').count() === 3);
check('oak speaks', (await page.locator('#card-oak').innerText()).includes('OAK'));
const mbOk = await page.evaluate(() => {
  const s2 = JSON.parse(localStorage.getItem('pokedexos_save_v2'));
  return s2.players[1].items.masterBalls >= 1 && s2.players[1].badges.length >= 1;
});
check('badge + master ball persisted', mbOk);
await page.click('#card-close');
await page.waitForTimeout(300);

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

// PARENT TOOLS: hold to open, add a Pokémon at a chosen level
await page.click('#settings-btn');
await page.waitForTimeout(400);
const devBtn = await page.locator('#dev-open-btn').boundingBox();
page.once('dialog', d => d.accept('1234')); // set the PIN on first open
await page.mouse.move(devBtn.x + devBtn.width / 2, devBtn.y + devBtn.height / 2);
await page.mouse.down();
await page.waitForTimeout(1500);
await page.mouse.up();
await page.waitForTimeout(500);
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
await page.locator('.dev-row[data-id="150"] .dev-mini[data-act="del"]').evaluate(el => el.click());
await page.waitForTimeout(400);
const removed = await page.evaluate(() => !JSON.parse(localStorage.getItem('pokedexos_save_v2')).players[1].caught.includes(150));
check('remove works', removed);
await page.click('#dev-close');
await page.waitForTimeout(300);

// turn junior back off for the remaining checks
await page.click('#settings-btn');
await page.waitForTimeout(400);
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
await page.locator('#run-btn').evaluate(el => el.click());
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
check('spoils listed', (await page.locator('#victory-lines').innerText()).toLowerCase().includes('whole team'));
await page.locator('#victory-continue').evaluate(el => el.click());
await page.waitForTimeout(1200);
check('returned to gym trainer list', await page.locator('#gym-container.active').count() === 1);
check('trainer 1 marked beaten', (await page.locator('.trainer-card').first().innerText()).includes('✅'));
const gymSave = await page.evaluate(() => {
  const sv = JSON.parse(localStorage.getItem('pokedexos_save_v2'));
  return sv.players[1].caught.includes(74) && sv.players[1].mons['74']?.level === 8 && !!sv.players[1].gyms.beaten['rock:0'];
});
check('trainer team captured + progress saved', gymSave);
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

// ---- the game never talks ----
check('no VOICE button in the toolbar', await page.locator('#voice-btn').count() === 0);
check('speech synthesis never invoked', await page.evaluate(() => window.__SPOKE__ === false));

await page.screenshot({ path: 'test/screen-dex.png' });

const realErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('Failed to load resource'));
check('no console/page errors', realErrors.length === 0);
if (realErrors.length) console.log('Errors:', realErrors);

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
