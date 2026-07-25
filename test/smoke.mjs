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
    if (m) body = speciesFixture(parseInt(m[1]));
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

// Seed a legacy save to validate migration
await page.addInitScript(() => {
  if (!localStorage.getItem('pokedexos_save_v2')) {
    localStorage.setItem('pokedex_caught_p1', JSON.stringify([1, 25]));
  }
});

await page.goto(BASE, { waitUntil: 'networkidle' });
check('boot screen visible', await page.locator('#boot-screen').isVisible());

await page.click('#boot-screen');
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
await page.waitForFunction(() => document.querySelectorAll('#evo-chain .evo-item').length === 2, null, { timeout: 5000 });
check('evolution chain rendered (2 gen-1 stages)', true);
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

// PC box
await page.waitForTimeout(2200); // let catch animation fully release isCatching
await page.click('#pc-btn');
await page.waitForTimeout(400);
check('PC modal opens', await page.locator('#pc-modal').isVisible());
const caughtCount = await page.locator('.pc-item:not(.uncaught)').count();
check('PC shows 3 caught (1, 25, 26)', caughtCount === 3);
await page.click('#close-pc-btn');

// battle: team picker → sparkle modal → regular → battle screen
await page.click('#battle-btn');
await page.waitForTimeout(400);
check('team picker opens', (await page.locator('#pc-instruction').innerText()).includes('TEAM'));
check('team preselected', await page.locator('.pc-item.picked').count() > 0);
await page.click('#close-pc-btn'); // START BATTLE
await page.waitForTimeout(300);
check('sparkle modal opens', await page.locator('#sparkle-modal').isVisible());
await page.click('#variant-sparkle');
await page.waitForFunction(() => document.getElementById('battle-container').classList.contains('active'), null, { timeout: 10000 });
check('battle screen active', true);
await page.waitForFunction(() => document.querySelectorAll('.move-btn').length > 0, null, { timeout: 5000 });
check('move buttons + switch/run rendered', await page.locator('.move-btn').count() >= 3 && await page.locator('#switch-btn').count() === 1);
check('player level shown', /lv\d+/i.test(await page.locator('#player-name').innerText()));
check('wild level shown', /lv\d+/i.test(await page.locator('#wild-name').innerText()));

// fight to victory (fixture mons are weak — a few hits should do it)
let won = false;
for (let turn = 0; turn < 16 && !won; turn++) {
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
check('battle won → victory screen', won);
if (won) {
  check('victory shows XP', (await page.locator('#victory-lines').innerText()).includes('XP'));
  await page.click('#victory-continue');
  await page.waitForTimeout(1500);
  // evolution may play for fixture mon; wait for it to finish
  await page.waitForFunction(() => document.getElementById('battle-container').classList.contains('active') === false, null, { timeout: 15000 });
}
check('battle exits to dex', !(await page.locator('#battle-container.active').count()));
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

await page.screenshot({ path: 'test/screen-dex.png' });

const realErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('Failed to load resource'));
check('no console/page errors', realErrors.length === 0);
if (realErrors.length) console.log('Errors:', realErrors);

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
