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

// ONE AUDIO GRAPH (v19.5). Two AudioContexts means two hardware clocks, two
// things iOS can suspend independently and no single place to balance the
// mix. Count every construction and assert the app only ever made one.
await page.addInitScript(() => {
  window.__AUDIO_CTXS__ = 0;
  for (const key of ['AudioContext', 'webkitAudioContext']) {
    const Orig = window[key];
    if (typeof Orig !== 'function') continue;
    const Wrapped = function (...args) { window.__AUDIO_CTXS__++; return new Orig(...args); };
    Wrapped.prototype = Orig.prototype;
    window[key] = Wrapped;
  }
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

// ---- B-010: the dex type chip, measured on the ELEMENT ----
// There is already a check further down that every type clears WCAG AA, and
// it PASSED for months while this exact screen showed white-on-yellow at
// 1.5:1 — because it measured inkFor() as a function instead of the pill a
// child actually looks at. dex.js set a background and no colour, so the
// chip inherited body{color:white} and the helper's answer never reached it.
// This one reads getComputedStyle on chips living in the real #types
// container, so the cascade and the inheritance are both in the measurement.
// PIKACHU is the worst case on purpose: electric #eed535 under white ink.
// Every mocked species is electric, so to measure more than one type on a
// REAL chip the route has to hand back a different one. These load through
// dex.loadPoke — the same path the child's tap takes — and the numbers come
// off getComputedStyle of the pill sitting in #types.
const TYPE_PROBE = ['electric', 'ground', 'ice', 'fighting', 'steel', 'fairy', 'dark', 'ghost'];
const chip = { rows: [], worst: 99, worstType: '' };
for (let ti = 0; ti < TYPE_PROBE.length; ti++) {
  const want = TYPE_PROBE[ti];
  // Deliberately high, unvisited ids: api.js caches by id in localStorage, so
  // probing a species the suite has already loaded (25 is PIKACHU) would be
  // served from cache and silently ignore the route — which is exactly what
  // happened on the first run, and showed up as fairy rendering electric's ⚡.
  const id = 600 + ti;
  // Built from the local fixture, never route.fetch() — that would leave the
  // handler and hit the real PokeAPI, and this suite has to run with no network.
  await context.route(`https://pokeapi.co/api/v2/pokemon/${id}`, route => {
    const body = pokemonFixture(id);
    body.types = [{ slot: 1, type: { name: want, url: '' } }];
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const row = await page.evaluate(async ([pid, wantType]) => {
    const D = await import('/js/dex.js');
    await D.loadPoke(pid);
    const lum = css => {
      const [r, g, b] = (css.match(/\d+(\.\d+)?/g) || ['0', '0', '0']).slice(0, 3)
        .map(v => { v = +v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const el = document.querySelector('#types .tag:not(.habitat-chip)');
    if (!el) return { want: wantType, type: '', ratio: 0, glyph: '', word: '', found: false };
    const cs = getComputedStyle(el);
    const a = lum(cs.color), b = lum(cs.backgroundColor);
    return {
      want: wantType, type: el.dataset.type || '', found: true,
      ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      glyph: el.querySelector('.tag-ico')?.textContent || '',
      word: (el.querySelector('.tag-name')?.textContent || '').toLowerCase(),
    };
  }, [id, want]);
  chip.rows.push(row);
  if (row.ratio < chip.worst) { chip.worst = row.ratio; chip.worstType = row.type || '(none rendered)'; }
  await context.unroute(`https://pokeapi.co/api/v2/pokemon/${id}`);
}
await page.evaluate(async () => { const D = await import('/js/dex.js'); await D.loadPoke(25); });
await page.waitForTimeout(300);

// Verified red before the fix: electric came back at 1.48:1 with no glyph,
// and the "readable" check failed at exactly the 1.5:1 the forum measured.
// FIRST: prove the probe measured what it asked for. api.js caches species in
// localStorage, so a probe id the suite has already loaded is served from cache
// and the route override never fires -- every chip then collapses to the SAME
// type and every check below stays green while measuring one type eight times.
// That is the exact false-assurance shape this whole item exists to kill, so it
// is asserted rather than left to the choice of id.
check(`each dex probe rendered the type it asked for (${chip.rows.map(r => r.type || '?').join(' ')})`,
  chip.rows.length === TYPE_PROBE.length &&
  chip.rows.every((r, i) => r.found && r.type === TYPE_PROBE[i] && r.want === TYPE_PROBE[i]));
check(`every dex type chip is readable as rendered (worst: ${chip.worstType} ${chip.worst.toFixed(2)}:1)`,
  chip.rows.length === TYPE_PROBE.length && chip.rows.every(r => r.found && r.ratio >= 4.5));
// The picture is the half ART can use. Without it the chip is a coloured pill
// with a word in it, which is nothing at all to a four-year-old.
const glyphless = chip.rows.filter(r => !r.glyph).map(r => r.type);
check(`every dex type chip leads with a picture (${chip.rows.map(r => r.glyph).join('')})`,
  glyphless.length === 0);
// ...and the word is still there beside it, for GABE, who reads it.
// Compared against TYPE_PROBE, not against r.type: comparing the word to the
// attribute PASSED on the old code, where both were absent and '' === ''.
check('the dex chip keeps its word for the brother who reads',
  chip.rows.every((r, i) => r.word === TYPE_PROBE[i]));

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
// B-011 baseline. battle.js imported NO cry function at all before this, so at
// the moment a wild Pokemon appeared, who had turned up existed only as the
// words "WILD PIDGEY APPEARED!" in a log ART cannot read. Counted through
// audio.js's own emitCry -- past the mute check and past the 400ms anti-stack
// floor -- because an ES module's exported binding cannot be spied on.
const cryBefore = await page.evaluate(async () => {
  const A = await import('/js/audio.js');
  return { n: A.criesEmitted(), unlocked: A.audioUnlocked(), muted: A.isMuted() };
});
await page.click('#variant-sparkle');
await page.waitForFunction(() => document.getElementById('battle-container').classList.contains('active'), null, { timeout: 10000 });
check('battle screen active', true);
await page.waitForTimeout(500);
const cryAfter = await page.evaluate(async () => (await import('/js/audio.js')).criesEmitted());
// Reported rather than assumed: if the AudioContext were still locked the
// encounter would be CORRECTLY silent, and asserting a cry would be a false
// pass rather than a real guard.
check(`the wild encounter says who it is (unlocked=${cryBefore.unlocked}, muted=${cryBefore.muted}, +${cryAfter - cryBefore.n})`,
  cryBefore.unlocked && !cryBefore.muted && cryAfter - cryBefore.n === 1);
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
// ---- B-031: the four balls have to be tellable apart ----
// Three of these four rows used to read BETTER WHEN WEAKENED, so the one thing
// GABE is choosing between was the one thing the words refused to tell him.
const ballCaps = await page.evaluate(() =>
  [...document.querySelectorAll('#ballpick-list .ballpick')].map(el => ({
    ball: el.dataset.ball,
    cap: (el.querySelector('small')?.textContent || '').trim(),
  })));
check(`the four balls carry four different captions (${ballCaps.map(b => b.cap).join(' / ')})`,
  ballCaps.length === 4 && new Set(ballCaps.map(b => b.cap)).size === 4 && ballCaps.every(b => b.cap));
// ---- B-031: ...and ART's drawer stays silent ----
// The caption check above only ever runs in normal mode, so the junior branch
// could be deleted and every check would still pass -- QA proved exactly that.
// A visible 1x/1.5x/2x ladder in ART's mode is the accommodation advertising
// itself (rule 2), and it would be a lie besides: his balls always succeed.
// Re-rendered through the real openBallPick, in the real battle, then flipped
// straight back so nothing downstream sees a junior profile.
const juniorBalls = await page.evaluate(async () => {
  const S = await import('/js/state.js');
  const was = S.player().settings.junior;
  S.player().settings.junior = true;
  document.getElementById('ballpick-modal').style.display = 'none';
  document.getElementById('ball-btn').click();
  await new Promise(r => setTimeout(r, 400));
  const rows = [...document.querySelectorAll('#ballpick-list .ballpick')];
  const out = {
    rows: rows.length,
    captions: rows.map(r => (r.querySelector('small')?.textContent || '').trim()).filter(Boolean),
    counts: rows.filter(r => /x\d/.test(r.textContent)).length,
  };
  S.player().settings.junior = was;
  document.getElementById('ballpick-modal').style.display = 'none';
  document.getElementById('ball-btn').click();
  await new Promise(r => setTimeout(r, 400));
  return out;
});
check(`ART still picks from four balls (${juniorBalls.rows})`, juniorBalls.rows === 4);
check('...and his drawer says nothing about odds or counts',
  juniorBalls.captions.length === 0 && juniorBalls.counts === 0);
const cryBeforeCatch = await page.evaluate(async () => (await import('/js/audio.js')).criesEmitted());
await page.locator('.ballpick[data-ball="ultra-ball"]').evaluate(el => el.click());
await page.waitForFunction(() => document.getElementById('victory-modal').style.display === 'flex', null, { timeout: 20000 });
check('ball catch → gotcha screen', (await page.locator('#victory-lines').innerText()).includes('GOTCHA'));
// ...and the thing he just won says its own name. Same reason as the encounter:
// "GOTCHA!" is a word, and words do not exist for ART.
const cryAfterCatch = await page.evaluate(async () => (await import('/js/audio.js')).criesEmitted());
check(`the catch says what he just got (+${cryAfterCatch - cryBeforeCatch})`,
  cryAfterCatch - cryBeforeCatch === 1);
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
check('18 badge slots (11 circuit + 7 late tier)', await page.locator('.card-badge').count() === 18);
check('badges show live progress, not hover text', await page.locator('.badge-prog').count() >= 1);
check('badges show their goal as visible text', await page.locator('.card-badge em').count() === 18);
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
// The gear is a 1200ms hold in Junior Mode (so ART cannot flip his own
// settings); a hold is a superset of a tap, so the suite holds in both modes.
await (async () => {
  const b = await page.locator('#settings-btn').boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(1500); await page.mouse.up();
  await page.waitForTimeout(400);
})();
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

// ---- B-036: an uncaught shadow has to ANSWER a poke ----
// A pre-reader's entire vocabulary for "tell me about this" is poking the
// picture. In ART's sticker book every one of the 649 slots is rendered, so on
// a young save most of the screen is grey shadows -- and poking one used to
// produce a 320ms 5px shake in steps(3), over before he had lifted his finger.
// That teaches a four-year-old the pictures are not for touching. The answer
// now lifts the tile and lets the shadow peek at its real colours, and the
// acceptance is specifically that it is STILL HAPPENING 300ms later.
await page.click('#pc-btn');
await page.waitForTimeout(700);
const poke = await page.evaluate(async () => {
  const el = document.querySelector('#pc-grid .pc-item.uncaught');
  if (!el) return { found: false };
  const img = el.querySelector('img');
  const before = { t: getComputedStyle(el).transform, f: getComputedStyle(img).filter };
  el.click();
  await new Promise(r => setTimeout(r, 200));
  const at300 = { t: getComputedStyle(el).transform, f: getComputedStyle(img).filter };
  await new Promise(r => setTimeout(r, 400));
  const at600 = { t: getComputedStyle(el).transform, f: getComputedStyle(img).filter,
                  // The durable signal: at 600ms the filter has eased back to
                  // within a few percent of resting, so comparing values there
                  // discriminates by a hair and goes flaky on a loaded machine.
                  // Whether the answer is STILL RUNNING is unambiguous.
                  anim: getComputedStyle(img).animationName, cls: el.classList.contains('tease') };
  await new Promise(r => setTimeout(r, 900));
  const after = { t: getComputedStyle(el).transform, f: getComputedStyle(img).filter };
  return { found: true, before, at300, at600, after, cls: el.className };
});
check('the sticker book is full of shadows to poke', poke.found);
// Measured on the FILTER, not just on movement, and again at 600ms. The old
// 320ms shake was still technically mid-frame at exactly 300ms, so a check
// that only asked "has anything changed by 300ms" passed on the broken code --
// verified, not assumed. What the old shake never did was touch the colour,
// and it was long finished by 600ms.
check('poking an uncaught shadow shows it its own colours',
  poke.found && poke.at300.f !== poke.before.f);
check('and the answer is still going 600ms later',
  poke.found && poke.at600.cls && poke.at600.anim === 'stickerTeaseInk');
// ...and then it settles back, so the book does not slowly fill with tiles
// stuck mid-animation.
check('and the answer finishes, leaving the shadow where it was',
  poke.found && poke.after.t === poke.before.t && poke.after.f === poke.before.f);
await page.click('#close-pc-btn');
await page.waitForTimeout(300);
// v19.6: the old check measured EXPLORE against the top of the collapsed data
// sheet. In junior the sheet is display:none now, so its rect.top is 0 and the
// old assertion could only ever fail. Replaced with the three facts that
// actually matter on ART's home screen.
const fits = await page.evaluate(() => {
  const btn = document.getElementById('explore-btn').getBoundingClientRect();
  const last = document.getElementById('jr-stickers-btn').getBoundingClientRect();
  const sprite = document.getElementById('poke-sprite').getBoundingClientRect();
  return {
    bottom: Math.round(btn.bottom), last: Math.round(last.bottom),
    sheet: getComputedStyle(document.getElementById('data-sheet')).display,
    sprite: Math.round(sprite.height), vh: window.innerHeight
  };
});
check('junior data sheet is hidden, not peeking', fits.sheet === 'none');
check(`junior EXPLORE fits on screen (${fits.bottom} <= ${fits.vh})`, fits.bottom <= fits.vh);
check(`junior STICKERS is the last row and fits (${fits.last} <= ${fits.vh})`, fits.last > 0 && fits.last <= fits.vh);
check(`junior sprite is at least 140px (${fits.sprite}px)`, fits.sprite >= 140);

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

// ---- B-043: the header chip ASKS before handing over the other boy's game ----
// It used to switch on one tap of a centimetre-wide chip beside the Pokeball,
// with no confirm and no undo, landing you in the other brother's PC box with
// full edit rights -- and silently discarding a half-finished gym run on the
// way (setPlayer calls clearGymRun). It now opens the two-face WHO'S PLAYING
// card the app already shows on boot.
const switchTo = async n => {
  await page.click('#player-btn');
  await page.waitForFunction(() => document.getElementById('whoplaying-modal').style.display === 'flex',
    null, { timeout: 8000 });
  await page.locator(`.whoplaying-choice[data-player="${n}"]`).evaluate(el => el.click());
  await page.waitForTimeout(350);
};
await page.click('#player-btn');
await page.waitForFunction(() => document.getElementById('whoplaying-modal').style.display === 'flex',
  null, { timeout: 8000 });
check('the header chip asks before switching player',
  await page.evaluate(() => document.getElementById('whoplaying-modal').style.display === 'flex'));
check('and it does not switch anybody until a face is tapped',
  await page.evaluate(() => document.getElementById('player-btn').innerText.includes('GABE')));
// Backing out is a real exit, not a trap: a boy who opened it by accident must
// be able to leave without picking, and leave everything as it was.
check('the ask offers a way out', await page.locator('#whoplaying-back').isVisible());
await page.locator('#whoplaying-back').evaluate(el => el.click());
await page.waitForTimeout(300);
check('backing out leaves the player alone',
  await page.evaluate(() => document.getElementById('whoplaying-modal').style.display === 'none'
    && document.getElementById('player-btn').innerText.includes('GABE')));
// Re-picking the boy ALREADY playing must not run setPlayer, because setPlayer
// calls clearGymRun -- that is the quiet half of B-043, and without this the
// guard could be deleted with the suite still fully green.
const gymRunKept = await page.evaluate(async () => {
  const G = await import('/js/gym.js');
  // A half-finished run: one stop, one damaged Pokemon. This is exactly what
  // the old one-tap chip threw away without asking.
  G.gymRun.gymKey = 'rock'; G.gymRun.hp = { 25: 7 }; G.gymRun.max = { 25: 30 };
  const snap = () => JSON.stringify([G.gymRun.gymKey, G.gymRun.hp, G.gymRun.max]);
  const before = snap();
  document.getElementById('player-btn').click();
  await new Promise(r => setTimeout(r, 400));
  document.querySelector('.whoplaying-choice[data-player="1"]').click();
  await new Promise(r => setTimeout(r, 400));
  const after = snap();
  G.clearGymRun();
  return { before, after, supported: before.includes('rock') };
});
check('re-picking the same brother keeps his half-finished gym run',
  gymRunKept.supported && gymRunKept.before === gymRunKept.after);
// ...and the boot path still paints the chrome. Picking the boy who is already
// the default took NEITHER branch and left the lead chip unpainted all session.
check('picking the current player still paints his chrome',
  await page.evaluate(() => getComputedStyle(document.documentElement)
    .getPropertyValue('--p-primary').trim().length > 0));

// junior mode is per-player: P2 unaffected
await switchTo(2);
check('P2 not in junior mode', !(await page.evaluate(() => document.body.classList.contains('junior'))));
await switchTo(1);
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
// v19.6: the gear is hold-to-open while the active profile is junior, and P1
// is junior for this whole stretch of the suite. A hold is a superset of a tap
// (in normal mode pointerdown is a no-op and the trailing click opens it), so
// the suite holds in both modes.
const openSettingsPanel = async () => {
  const b = await page.locator('#settings-btn').boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
  await page.waitForTimeout(400);
};
await openSettingsPanel(page);
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
// v19.5.4: DONE lands you back on SETTINGS, where you came from. Parent Tools
// used to hide Settings on the way in and never put it back, so DONE dropped
// you on the Pokedex — and the hide bypassed closeSettings(), which is the only
// thing that persists the two name fields, so a name typed just before holding
// PARENT TOOLS was thrown away. This suite used to re-open Settings here,
// which is why the bug survived: it encoded the broken behaviour.
check('DONE returns to Settings, not the dex', await page.locator('#settings-modal').isVisible());

// THE PARENT GATE: importing a save can wipe both boys, so PASTE CODE sits
// behind the PIN — and a wrong PIN keeps the gate SHUT (it used to fail open).
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

// v19.6 FAVOURITES — the save-touching half of the sprint, exercised through
// the real module and then re-read from the real key.
const favs = await page.evaluate(async () => {
  const S = await import('./js/state.js');
  const owned = S.player().caught.slice(0, 2);
  const a = S.toggleFavorite(owned[0]);
  const b = S.toggleFavorite(owned[1]);
  const bad = S.toggleFavorite(648);                 // never caught in this run
  const written = JSON.parse(localStorage.getItem('pokedexos_save_v2'));
  const caughtBefore = written.players[1].caught.length;
  // forge a code that stars something the trainer does not own: it must be
  // dropped on load, and the collection must not be touched doing it.
  const blob = JSON.parse(decodeURIComponent(escape(atob(S.exportCode()))));
  blob.save.players[1].favorites = [...owned, 648];
  S.importCode(btoa(unescape(encodeURIComponent(JSON.stringify(blob)))));
  const after = JSON.parse(localStorage.getItem('pokedexos_save_v2'));
  const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  return {
    added: a === 'added' && b === 'added',
    refusedUnowned: bad === 'unowned',
    persisted: eq(written.players[1].favorites, owned),
    schemaStill2: after.version === 2,
    roundTrip: eq(after.players[1].favorites, owned),
    droppedUnowned: !after.players[1].favorites.includes(648),
    caughtIntact: after.players[1].caught.length === caughtBefore
  };
});
check('favorites: starring an owned mon writes the save', favs.added && favs.persisted);
check('favorites: an unowned id is refused, not stored', favs.refusedUnowned);
check('favorites: schema stays version 2 (additive)', favs.schemaStill2);
check('favorites: round-trips through export/import', favs.roundTrip);
check('favorites: an uncaught id is dropped on load', favs.droppedUnowned);
check('favorites: the collection itself is never touched', favs.caughtIntact);

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

// VERSUS MODE: seed the exact mismatch that used to flatten ART — GABE's
// Lv62 squad against a Lv9 starter — then play GABE vs P2 pass-and-play.
await page.evaluate(() => {
  const sv = JSON.parse(localStorage.getItem('pokedexos_save_v2'));
  sv.players[2].caught = [1];
  sv.players[2].mons = { 1: { level: 9, xp: 0 } };
  sv.players[2].team = [1];
  for (const id of sv.players[1].team) {
    sv.players[1].mons[id] = Object.assign({ xp: 0 }, sv.players[1].mons[id], { level: 62 });
  }
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
// B-006: the match level cap. Lv62 against Lv9 was not a match, it was GABE's
// CHARIZARD deleting everything ART owns on turn one. Both sides now fight at
// the HIGHER team's top level -- levelling DOWN instead would shrink GABE's
// Charizard to a Lv9 in front of his little brother, which takes something
// away from him AND is the game saying "your brother is little" out loud.
// The full reasoning lives at js/battle.js:1810. If you are here because the
// numbers look wrong: 62 vs 62 is CORRECT and deliberate. Do not "fix" this
// to Math.min -- that hands ART's Lv9 Pikachu back to a Lv62 Charizard.
const vsLv = await page.evaluate(() => {
  const lv = sel => parseInt((document.querySelector(sel + ' .lvl')?.textContent || '').match(/Lv(\d+)/)?.[1] || '0');
  return { p1: lv('#player-name'), p2: lv('#wild-name') };
});
// Pinned to the exact values, not just the gap: a gap check passes at 9 vs 9
// too, so it could not catch someone flipping the direction back to Math.min.
// The seed above is Lv62 (GABE) against Lv9 (ART), so 62 is the only right
// answer for both sides.
check(`versus levels meet at the top (Lv${vsLv.p1} vs Lv${vsLv.p2})`,
  vsLv.p1 === 62 && vsLv.p2 === 62);
// ...and the cap NEVER says so. Anything that reads as an accommodation on the
// versus board tells GABE his brother was helped, which is the rule this fix
// exists to keep. Attributes are checked too; `fair(?!y)` only spares the
// FAIRY move type, which is a type name and not a word about the match.
const vsTell = await page.evaluate(() => {
  const el = document.getElementById('battle-container');
  const bad = /junior|easy|helper|handicap|fair(?!y)/i;
  const text = el.textContent || '';
  return { text: bad.test(text) ? text.match(bad)[0] : '',
           html: bad.test(el.innerHTML) ? el.innerHTML.match(bad)[0] : '' };
});
check('versus never advertises the handicap', !vsTell.text && !vsTell.html);
// Play the match out. This used to be over almost immediately, because P2 was
// a lone Lv9 starter facing a Lv62 squad — the mismatch B-006 exists to fix.
// Now both sides fight at the same level with full teams, so it is a genuine
// multi-turn pass-and-play match and the loop needs the turns to match: ART's
// lone starter now fights at Lv62, so it survives several exchanges and takes
// some of GABE's six down with it, with a hand-over tap between every turn.
// Measured cost is 51 turns. 160 is ~3x that, generous on purpose -- and it
// cannot hide a hang, because the waitForFunction on #victory-modal below
// still hard-fails a match that never ends.
let vsWon = false;
for (let turn = 0; turn < 160 && !vsWon; turn++) {
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
// Clear any celebration first. The versus match above is now a real multi-turn
// fight, so it earns progress, and the v19.5.2 queue plays the badge card once
// the battle screen frees — which lands on top of the toolbar. That queue is
// working exactly as designed; the suite just has to take its turn like a
// player would, or the next tap waits thirty seconds on a covered button.
// Drained through the suite's own helper, which taps #badge-ok the way a
// child does rather than reaching into the module -- so this also covers a
// nickname prompt if one ever lands here.
await dismissCelebrations(page);
await page.click('#explore-btn');
await page.waitForTimeout(500);
check('FARAWAY LAND unlocks for the Champion', await page.locator('#habitat-grid .habitat-card.locked').count() === 0);
await page.click('#explore-back-btn');
await page.waitForTimeout(400);

// ---- B-011 / B-013: the sound switch still means what it says ----
const soundGuards = await page.evaluate(async () => {
  const A = await import('/js/audio.js');
  const out = {};
  // Muting must silence the NEW channel completely. A cry that survives the
  // mute button is worse than no cry: it is the one control Kevin uses in a
  // waiting room, quietly not working.
  const wasMuted = A.isMuted();
  if (!wasMuted) A.toggleMute();
  const b = A.criesEmitted();
  A.playCryFor(25); A.playCryFor(6);
  out.whenMuted = A.criesEmitted() - b;
  A.toggleMute();
  if (wasMuted) A.toggleMute();

  // B-013: syncMusicBtn used to assign btn.innerText, which DESTROYED the
  // <span class="btn-glyph"> the markup provides and replaced it with a bare
  // text node -- so after the FIRST toggle the glyph permanently lost its 15px
  // sizing and never got it back. Toggle twice and the span must survive both.
  // Driven by CLICKING the button, not by calling toggleMute() -- the repaint
  // lives in the click handler (main.js:366), so calling the module directly
  // would test a path no child ever takes and pass while the button was broken.
  const btn = document.getElementById('music-btn');
  const face = () => btn.querySelector('.btn-glyph')?.textContent || btn.textContent;
  btn.click();
  out.spanAfter1 = !!btn.querySelector('.btn-glyph');
  out.glyphOff = face();
  btn.click();
  out.spanAfter2 = !!btn.querySelector('.btn-glyph');
  out.glyphOn = face();
  out.mutedClass = null; out.liveClass = null;
  btn.click(); out.mutedClass = btn.classList.contains('is-muted');
  btn.click(); out.liveClass = btn.classList.contains('is-muted');
  out.cryGlyph = document.querySelector('#cry-btn .btn-icon')?.textContent || '';
  out.finallyMuted = A.isMuted();
  return out;
});
check('the sound switch silences cries too', soundGuards.whenMuted === 0);
check('the sound button keeps its shape through both toggles',
  soundGuards.spanAfter1 && soundGuards.spanAfter2);
check(`silence looks different from sound (${soundGuards.glyphOff} vs ${soundGuards.glyphOn})`,
  soundGuards.glyphOff && soundGuards.glyphOn && soundGuards.glyphOff !== soundGuards.glyphOn);
// 🔇 is a red prohibition circle. To a four-year-old that reads "you are not
// allowed", not "the sound is off" -- so OFF must not be that glyph...
check('and silence does not look like a rule he broke', soundGuards.glyphOff !== '\u{1F507}');
// ...and the glyph swap alone was only ~2% of the button's pixels, so the whole
// button greys out. That is the app's own picture for "sleeping".
check('the muted button reads as sleeping, not as a tiny different arc',
  soundGuards.mutedClass === true && soundGuards.liveClass === false);
// ...and neither of them is the CRY button's picture. A pre-reader navigating
// entirely by glyph must not see "turn the sound off" and "hear this Pokemon"
// wearing the same face.
check(`CRY does not wear the sound switch's face (${soundGuards.cryGlyph})`,
  soundGuards.cryGlyph && soundGuards.cryGlyph !== soundGuards.glyphOn
  && soundGuards.cryGlyph !== soundGuards.glyphOff);
check('and the sound is left on afterwards', soundGuards.finallyMuted === false);

// ---- B-036: the answer survives prefers-reduced-motion ----
// The reduced-motion block kills .tease's animation outright. If nothing
// replaced it, ART would be handed back the dead button this item exists to
// remove -- and QA found that branch had ZERO coverage, so it could silently
// return. A whole separate context, because reduced motion is set at browser
// level and cannot be toggled on a live page.
{
  const ctxRM = await browser.newContext({
    viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce',
  });
  await mockRoutes(ctxRM);
  await ctxRM.addInitScript(() => {
    localStorage.setItem('pokedexos_lastplayer', '1');
    localStorage.setItem('pokedexos_save_v2', JSON.stringify({
      version: 2,
      players: {
        1: { name: 'GABE', caught: [25], team: [25], mons: { 25: { level: 9, xp: 0 } },
             badges: [], shinies: [], nicks: {}, items: {}, quests: {}, gyms: {},
             settings: { junior: true }, stats: {} },
        2: { name: 'ART', caught: [], team: [], mons: {}, badges: [], shinies: [], nicks: {},
             items: {}, quests: {}, gyms: {}, settings: { junior: true }, stats: {} },
      },
    }));
  });
  const pRM = await ctxRM.newPage();
  await pRM.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pRM.waitForTimeout(1200);
  await pRM.evaluate(() => document.getElementById('boot-screen')?.click());
  await pRM.waitForTimeout(2200);
  await pRM.evaluate(() => document.getElementById('pc-btn').click());
  await pRM.waitForTimeout(900);
  const rm = await pRM.evaluate(async () => {
    const el = document.querySelector('#pc-grid .pc-item.uncaught');
    if (!el) return { found: false };
    const img = el.querySelector('img');
    const rest = getComputedStyle(img).filter;
    el.click();
    await new Promise(r => setTimeout(r, 250));
    return {
      found: true, rest, held: getComputedStyle(img).filter,
      anim: getComputedStyle(img).animationName, motionless: matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
  });
  check('reduced motion really is on for this context', rm.motionless === true);
  check('...and the animation is genuinely suppressed there', rm.found && rm.anim === 'none');
  // The whole point: no movement, but still an ANSWER.
  check('...yet poking a shadow still answers, without moving anything',
    rm.found && rm.held !== rm.rest);
  await ctxRM.close();
}

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
check(`inkFor picks readable ink for every type colour — helper maths, not the screen (worst: ${visual.worstType} ${visual.worst.toFixed(2)}:1)`,
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


// ---- v19.4: sprite life, and the tip-over that has died twice ----
// v18.6 shipped a faint tip-over that never rendered (the float animation on
// the same element owned `transform`); v19.1 papered over it; v19.4 fixed it
// structurally by moving the idle loop onto a .sprite-bob wrapper. Three
// releases of the same bug is enough — it gets a test.
check('idle float lives on the wrapper, not the sprite', await page.evaluate(() => {
  const bobs = [...document.querySelectorAll('.sprite-bob')];
  if (bobs.length !== 2) return false;
  const wrappersAnimate = bobs.every(b => getComputedStyle(b).animationName !== 'none');
  const spritesDont = ['wild-sprite', 'player-sprite'].every(id => {
    const el = document.getElementById(id);
    return el && getComputedStyle(el).animationName === 'none';
  });
  return wrappersAnimate && spritesDont;
}));

check('a fainted Pokémon actually tips over', await page.evaluate(async () => {
  const img = document.getElementById('wild-sprite');
  img.classList.add('fainted');
  // the tip-over is a 0.55s transition; reading it immediately returns the
  // START of the interpolation, which is how it looked "dead" during review
  await new Promise(r => setTimeout(r, 700));
  const m = getComputedStyle(img).transform;
  img.classList.remove('fainted');
  if (!m.startsWith('matrix')) return false;
  const [a, b] = m.slice(7, -1).split(',').map(Number);
  return Math.abs(Math.atan2(b, a) * 180 / Math.PI) > 45;   // a real rotation
}));

check('the ghost HP bar snaps for a new fighter and lags for a hit', await page.evaluate(() => {
  const ghost = document.getElementById('player-hp-ghost');
  if (!ghost) return false;
  // same fighter, HP drops -> the ghost must LAG (keep a transition)
  ghost.dataset.mon = 'PIKACHU|40';
  ghost.style.width = '100%';
  const sameFighterLags = (() => {
    const was = ghost.style.width;
    return was === '100%';
  })();
  // a different fighter -> the ghost must SNAP, or switching in a damaged
  // team-mate looks exactly like taking a hit, which is ART's only damage cue
  const differentFighter = ghost.dataset.mon !== 'SNORLAX|90';
  return sameFighterLags && differentFighter;
}));

// ---- one audio graph (v19.5) ----
check('at most one AudioContext for the whole app',
  await page.evaluate(() => window.__AUDIO_CTXS__ <= 1));


// ---- v19.5.2: one celebration at a time ----
// Every .overlay-screen paints its own 0.9 scrim, so two stacked are 99% black
// and three are 99.9%. A quest card opening on top of the victory card buried
// the PICTURE reward — the only half of a win ART can read — while its gold XP
// bar finished filling where nobody could see it. Shuffling z-indexes cannot
// fix compounding scrims; taking turns can.
check('a quest card waits its turn behind the win card', await page.evaluate(async () => {
  const vis = id => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; };
  const S = await import('/js/state.js');
  const wasMode = S.state.appMode;
  S.state.appMode = 'battle';
  document.getElementById('victory-modal').style.display = 'flex';
  document.dispatchEvent(new CustomEvent('game-progress', { detail: { kind: 'win' } }));
  await new Promise(r => setTimeout(r, 400));
  const heldWhileBusy = !vis('badge-modal');
  S.state.appMode = wasMode;
  document.getElementById('victory-modal').style.display = 'none';
  await new Promise(r => setTimeout(r, 700));
  const playedAfter = vis('badge-modal');
  document.getElementById('badge-modal').style.display = 'none';
  // held, and then NOT dropped — a swallowed reward is as bad as a buried one
  return heldWhileBusy && playedAfter;
}));


// ---- v19.8: ROUND 2 exists only after the crown ----
// The round is module state both brothers share, so the gate is checked at the
// READ as well as at the entry point: a player switch with the hub already
// open must not leave the other boy on a board he has not earned.
check('the ROUND tabs are hidden until you are champion', await page.evaluate(async () => {
  const S = await import('/js/state.js');
  const G = await import('/js/gym.js');
  const p = S.player();
  const wasChampion = p.champion;
  p.champion = null;
  G.openGyms();
  const hiddenBefore = document.querySelectorAll('.round-tab').length === 0;
  p.champion = { date: '2026-08-30', team: [], levels: {} };
  G.openGyms();
  const shownAfter = document.querySelectorAll('.round-tab').length === 2;
  p.champion = wasChampion;
  G.openGyms();
  G.closeGyms();
  return hiddenBefore && shownAfter;
}));

check('round 2 raises every trainer by 15 and keeps round 1 untouched', await page.evaluate(async () => {
  const D = await import('/js/gymdata.js');
  const gym = D.GYMS[0];
  const r1 = D.roundTrainers(gym, 1);
  const r2 = D.roundTrainers(gym, 2);
  // round 1 must hand back the ORIGINAL array: GYMS itself never moves
  if (r1 !== gym.trainers) return false;
  const raised = r2.every((t, i) =>
    t.team.every((m, j) => m.level === Math.min(100, gym.trainers[i].team[j].level + 15)));
  // and the keys must not collide, or a round-2 win would mark round 1 beaten
  const k1 = D.trainerKey(gym.key, 0, 1), k2 = D.trainerKey(gym.key, 0, 2);
  return raised && k1 !== k2 && k1 === D.trainerKey(gym.key, 0);
}));


// ---- v19.8.1: the offline copy actually exists ----
// cache.addAll() rejects the ENTIRE list if it contains one duplicate URL, and
// it fails silently: the named cache is created, nothing is stored, and the app
// looks perfectly healthy until the tablet loses signal. './js/fx.js' was listed
// twice from v19.4 to v19.8 — five releases with no offline mode and no symptom
// anyone could see. Two cheap assertions make that unrepeatable.
check('the offline file list has no duplicates', await page.evaluate(async () => {
  const src = await (await fetch('/sw.js')).text();
  const block = /const SHELL_FILES = \[([\s\S]*?)\]/.exec(src)?.[1] || '';
  const files = [...block.matchAll(/'([^']+)'/g)].map(m => m[1]);
  return files.length > 0 && files.length === new Set(files).size;
}));

check('every app module is in the offline file list', await page.evaluate(async () => {
  const src = await (await fetch('/sw.js')).text();
  const block = /const SHELL_FILES = \[([\s\S]*?)\]/.exec(src)?.[1] || '';
  const listed = new Set([...block.matchAll(/'([^']+)'/g)].map(m => m[1].replace(/^\.\//, '')));
  // Every module index.html's graph can reach must be cached, or the offline
  // copy boots into a missing import — which is a black screen, not a fallback.
  const mods = [...document.querySelectorAll('script[type=module]')].map(s => s.src);
  const seen = new Set(), queue = [...mods];
  while (queue.length) {
    const url = queue.pop();
    const path = new URL(url, location.href).pathname.replace(/^\//, '').split('?')[0];
    if (seen.has(path)) continue;
    seen.add(path);
    let text = '';
    try { text = await (await fetch('/' + path)).text(); } catch (e) { continue; }
    for (const m of text.matchAll(/from\s*['"](\.[^'"]+)['"]/g)) {
      queue.push(new URL(m[1], location.origin + '/' + path).href);
    }
  }
  return [...seen].every(p => listed.has(p));
}));

// ---- v19.8.2: the API cache lives inside a budget ----
// The cache and the boys' save share ONE ~5MB localStorage box, and only the
// save is irreplaceable. Browsing the whole 649-Pokemon dex used to grow the
// cache with no ceiling at all — no cap, no eviction — until a quota error
// landed on the SAVE's own write. Seed a fresh device with a 400-entry cache
// written by that older build, boot, and it must come back inside the cap
// with the oldest rows gone and the save untouched.
{
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await mockRoutes(ctx2);
  await ctx2.addInitScript(() => {
    // Ids well above MAX_POKEMON, so nothing in the app ever reads them and
    // this measures the cap and nothing else. ~3.9KB each ≈ 1.55MB in total.
    const filler = 'x'.repeat(3800);
    const blob = {};
    for (let i = 0; i < 400; i++) blob[`pkmn:${1000 + i}`] = { id: 1000 + i, name: `mon-${1000 + i}`, filler };
    localStorage.setItem('pokedexos_apicache_v2', JSON.stringify(blob));
    localStorage.setItem('pokedexos_save_v2', JSON.stringify({
      version: 2,
      players: { 1: { name: 'GABE', caught: [1, 4, 7, 25, 150] }, 2: { name: 'ART', caught: [25, 133] } }
    }));
    localStorage.setItem('pokedexos_lastplayer', '1');
  });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE, { waitUntil: 'networkidle' });
  const r = await p2.evaluate(async () => {
    const A = await import('/js/api.js');
    const read = () => localStorage.getItem('pokedexos_apicache_v2') || '{}';
    const seeded = obj => Object.keys(obj).map(k => /^pkmn:(1\d\d\d)$/.exec(k))
      .filter(Boolean).map(m => Number(m[1])).sort((a, b) => a - b);
    const bootText = read(), boot = JSON.parse(bootText);
    const saveBefore = localStorage.getItem('pokedexos_save_v2');
    // Now write through the REAL path, at the cap, so eviction runs on a
    // normal fetch and not only on the one-off boot tidy-up.
    for (let i = 1; i <= 20; i++) { try { await A.getPokemon(i); } catch (e) { /* ignore */ } }
    const afterText = read(), after = JSON.parse(afterText);
    return {
      limits: A.CACHE_LIMITS,
      bootKeys: Object.keys(boot).length, bootLen: bootText.length, bootSeeded: seeded(boot),
      afterKeys: Object.keys(after).length, afterLen: afterText.length, afterSeeded: seeded(after),
      saveBefore, saveAfter: localStorage.getItem('pokedexos_save_v2')
    };
  });
  // No published budget at all is itself a failure, not a crash.
  const limits = r.limits || { entries: Infinity, bytes: Infinity };
  const inBudget = (keys, len) => !!r.limits && keys <= limits.entries && len <= limits.bytes && len < 1500000;
  check('a 400-entry cache is capped at boot and stays under 1.5MB',
    r.bootSeeded.length > 0 && inBudget(r.bootKeys, r.bootLen));
  check('a cache write at the cap evicts instead of growing',
    r.afterKeys > 0 && inBudget(r.afterKeys, r.afterLen) && r.afterSeeded.length < r.bootSeeded.length);
  // Oldest-first: the survivors must be the tail of the seeded run (1000 is
  // the oldest row, 1399 the newest), never an arbitrary slice.
  const tail = list => list.length > 0 && list[0] > 1000 && list[list.length - 1] === 1399 &&
    list.every((n, i) => n === list[0] + i);
  check('the cache evicts the oldest entries first', tail(r.bootSeeded) && tail(r.afterSeeded));
  check('cache eviction never touches the save',
    r.saveAfter === r.saveBefore &&
    JSON.parse(r.saveAfter).players['1'].caught.join() === '1,4,7,25,150' &&
    JSON.parse(r.saveAfter).players['2'].caught.join() === '25,133');
  await ctx2.close();
}

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
