// Screenshot tour of the GBA build (mocked network, placeholder sprite).
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const BASE = 'http://127.0.0.1:8321';
const SPRITE = readFileSync('test/fake-sprite.png');
const NAMES = { 25: 'pikachu' };

function pokemonFixture(id) {
  return {
    id, name: NAMES[id] || `mon-${id}`, height: 4, weight: 60, base_experience: 112,
    types: [{ slot: 1, type: { name: 'electric', url: '' } }],
    abilities: [{ ability: { name: 'static', url: '' } }, { ability: { name: 'lightning-rod', url: '' } }],
    stats: [
      { base_stat: 35, stat: { name: 'hp' } }, { base_stat: 55, stat: { name: 'attack' } },
      { base_stat: 40, stat: { name: 'defense' } }, { base_stat: 50, stat: { name: 'special-attack' } },
      { base_stat: 50, stat: { name: 'special-defense' } }, { base_stat: 90, stat: { name: 'speed' } }
    ],
    cries: { latest: null },
    species: { url: `https://pokeapi.co/api/v2/pokemon-species/${id}/` },
    sprites: {
      front_default: 'https://raw.githubusercontent.com/s/f.png', front_shiny: null,
      back_default: 'https://raw.githubusercontent.com/s/b.png', back_shiny: null,
      other: { 'official-artwork': { front_default: null, front_shiny: null } },
      versions: { 'generation-v': { 'black-white': { animated: {
        front_default: 'https://raw.githubusercontent.com/s/a.gif', front_shiny: null,
        back_default: 'https://raw.githubusercontent.com/s/ab.gif', back_shiny: null } } } }
    },
    moves: [
      { move: { name: 'thunder-shock', url: 'https://pokeapi.co/api/v2/move/84/' } },
      { move: { name: 'quick-attack', url: 'https://pokeapi.co/api/v2/move/98/' } },
      { move: { name: 'thunderbolt', url: 'https://pokeapi.co/api/v2/move/85/' } },
      { move: { name: 'iron-tail', url: 'https://pokeapi.co/api/v2/move/231/' } }
    ]
  };
}
const speciesFixture = () => ({
  capture_rate: 190,
  genera: [{ genus: 'Mouse Pokémon', language: { name: 'en' } }],
  flavor_text_entries: [{ flavor_text: 'When several of these POKéMON gather, their electricity could build and cause lightning storms.', language: { name: 'en' } }],
  evolution_chain: { url: 'https://pokeapi.co/api/v2/evolution-chain/10/' },
  is_legendary: false, is_mythical: false
});
const evoFixture = {
  chain: { species: { name: 'pichu', url: 'https://x/pokemon-species/172/' },
    evolves_to: [{ species: { name: 'pikachu', url: 'https://x/pokemon-species/25/' },
      evolves_to: [{ species: { name: 'raichu', url: 'https://x/pokemon-species/26/' }, evolves_to: [] }] }] }
};
const moveFixture = url => {
  const map = { 84: ['thunder-shock', 40], 98: ['quick-attack', 40], 85: ['thunderbolt', 90], 231: ['iron-tail', 100] };
  const id = url.match(/move\/(\d+)/)?.[1] || '84';
  return { name: map[id][0], power: map[id][1], type: { name: id === '231' ? 'steel' : id === '98' ? 'normal' : 'electric' }, damage_class: { name: 'special' } };
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', deviceScaleFactor: 2 });
await context.route('https://pokeapi.co/**', route => {
  const url = route.request().url();
  let body;
  if (url.includes('pokemon-species')) body = speciesFixture();
  else if (url.includes('evolution-chain')) body = evoFixture;
  else if (url.includes('/move/')) body = moveFixture(url);
  else body = pokemonFixture(parseInt(url.match(/pokemon\/(\d+)/)?.[1] || (url.includes('pikachu') ? 25 : 25)));
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});
await context.route('https://raw.githubusercontent.com/**', route =>
  route.fulfill({ status: 200, contentType: 'image/png', body: SPRITE }));
await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));

const page = await context.newPage();
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.screenshot({ path: 'test/shot-0-boot.png' });
await page.click('#boot-screen');
await page.waitForFunction(() => document.getElementById('poke-name').innerText.toLowerCase() === 'pikachu', null, { timeout: 8000 });
await page.waitForTimeout(2500); // typewriter + settle
await page.screenshot({ path: 'test/shot-1-dex.png' });

await page.click('#data-btn');
await page.waitForTimeout(900);
await page.screenshot({ path: 'test/shot-2-sheet.png' });
await page.click('#sheet-handle');
await page.waitForTimeout(600);

await page.click('#catch-btn');
await page.waitForTimeout(500);
await page.screenshot({ path: 'test/shot-3-drawer.png' });
await page.click('#catch-btn'); // close drawer
await page.waitForTimeout(400);

await page.click('#pc-btn');
await page.waitForTimeout(700);
await page.screenshot({ path: 'test/shot-4-pc.png' });
await page.click('#close-pc-btn');
await page.waitForTimeout(400);

// catch pikachu so battle can start
await page.click('#catch-btn');
await page.waitForTimeout(400);
await page.locator('.ball-opt[data-ball="master-ball"]').click();
await page.waitForFunction(() => document.getElementById('catch-btn').innerText.includes('OWNED'), null, { timeout: 15000 });
await page.waitForTimeout(2400);

await page.click('#battle-btn');
await page.waitForTimeout(500);
await page.locator('.pc-item').first().click();
await page.waitForTimeout(300);
await page.click('#variant-regular');
await page.waitForFunction(() => document.getElementById('battle-container').classList.contains('active'), null, { timeout: 10000 });
await page.waitForTimeout(800);
await page.screenshot({ path: 'test/shot-5-battle.png' });

// fire a move to capture FX mid-animation
await page.locator('.move-btn').first().click();
await page.waitForTimeout(1350);
await page.screenshot({ path: 'test/shot-6-battle-fx.png' });

await browser.close();
console.log('shots done');
