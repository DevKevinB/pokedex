import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const SPRITE = readFileSync('test/fake-sprite.png');
const browser = await chromium.launch();

const mon = id => ({ id, name: id === 25 ? 'pikachu' : `mon-${id}`, height: 4, weight: 60, base_experience: 112,
  types: [{ slot: 1, type: { name: 'electric', url: '' } }], abilities: [{ ability: { name: 'static' } }],
  stats: [{ base_stat: 35, stat: { name: 'hp' } }, { base_stat: 55, stat: { name: 'attack' } },
          { base_stat: 40, stat: { name: 'defense' } }, { base_stat: 90, stat: { name: 'speed' } }],
  cries: { latest: null }, species: { url: `https://pokeapi.co/api/v2/pokemon-species/${id}/` },
  sprites: { front_default: 'https://raw.githubusercontent.com/s/f.png', front_shiny: null, back_default: 'https://raw.githubusercontent.com/s/b.png', back_shiny: null,
    other: { 'official-artwork': { front_default: null, front_shiny: null } },
    versions: { 'generation-v': { 'black-white': { animated: { front_default: 'https://raw.githubusercontent.com/s/a.gif', front_shiny: null, back_default: null, back_shiny: null } } } } },
  moves: [{ move: { name: 'thunder-shock', url: 'https://pokeapi.co/api/v2/move/84/' } }] });

async function shot(viewport, label, junior) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', deviceScaleFactor: 2 });
  await context.route('https://pokeapi.co/**', route => {
    const url = route.request().url(); let body;
    if (url.includes('pokemon-species')) body = { capture_rate: 190, genera: [{ genus: 'Mouse Pokémon', language: { name: 'en' } }], flavor_text_entries: [{ flavor_text: 'It raises its tail to check.', language: { name: 'en' } }], evolution_chain: { url: 'https://pokeapi.co/api/v2/evolution-chain/10/' } };
    else if (url.includes('evolution-chain')) body = { chain: { species: { name: 'pikachu', url: 'https://x/pokemon-species/25/' }, evolves_to: [] } };
    else if (url.includes('/move/')) body = { name: 'zap', power: 40, type: { name: 'electric' }, damage_class: { name: 'special' } };
    else body = mon(parseInt(url.match(/pokemon\/(\d+)/)?.[1] || 25));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await context.route('https://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: SPRITE }));
  await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await context.newPage();
  await page.addInitScript(j => {
    localStorage.setItem('pokedexos_save_v2', JSON.stringify({ version: 2, players: {
      1: { name: 'ART', caught: [25], team: [25], mons: { 25: { level: 8, xp: 0 } }, badges: [], items: { masterBalls: 1 }, quests: null, settings: { junior: j }, stats: { catches: 1, battlesWon: 0, battlesLost: 0, explores: 0 } },
      2: { name: 'GABE', caught: [], team: [], mons: {}, badges: [], items: { masterBalls: 1 }, quests: null, settings: { junior: false }, stats: { catches: 0, battlesWon: 0, battlesLost: 0 } } } }));
    localStorage.setItem('pokedexos_lastplayer', '1');
  }, junior);
  await page.goto('http://127.0.0.1:8321', { waitUntil: 'domcontentloaded' });
  await page.click('#boot-screen');
  await page.waitForTimeout(2300);
  await page.screenshot({ path: `test/${label}.png` });
  const geo = await page.evaluate(() => {
    const b = document.getElementById('explore-btn').getBoundingClientRect();
    const s = document.getElementById('data-sheet').getBoundingClientRect();
    return `explore bottom ${Math.round(b.bottom)} | sheet top ${Math.round(s.top)} | viewport ${window.innerHeight}`;
  });
  console.log(`${label}: ${geo}`);
  await context.close();
}

await shot({ width: 390, height: 844 }, 'v186-junior-tall', true);
await shot({ width: 375, height: 667 }, 'v186-junior-short', true);
await shot({ width: 390, height: 844 }, 'v186-normal', false);
await browser.close();
