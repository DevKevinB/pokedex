// THROWAWAY zoom crops. Delete when done.
import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:8321';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', deviceScaleFactor: 5 });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('pokedexos_muted', '1'); } catch (e) {} });
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
await page.evaluate(() => document.getElementById('boot-screen')?.click());
await page.waitForTimeout(800);
await page.locator('.whoplaying-choice').first().click();
await page.waitForTimeout(2000);
const O = '/home/kevin/pokedex/test/playtest/zoom-';

// catch message over the identity block
await page.evaluate(() => { const m = document.getElementById('dex-catch-msg'); m.style.opacity = 1; m.textContent = 'DARN! IT BROKE FREE!'; });
await page.screenshot({ path: O + 'catchmsg.png', clip: { x: 0, y: 120, width: 390, height: 130 } });
await page.evaluate(() => { document.getElementById('dex-catch-msg').style.opacity = 0; });

// the LEAD button with no lead
await page.locator('#lead-btn').screenshot({ path: O + 'leadbtn.png' });

// settings row with the info glyph
await page.click('#settings-btn'); await page.waitForTimeout(900);
const vr = await page.locator('#set-version').locator('..').boundingBox();
await page.screenshot({ path: O + 'versionrow.png', clip: { x: vr.x - 4, y: vr.y - 6, width: vr.width + 8, height: vr.height + 12 } });
await page.click('#settings-close'); await page.waitForTimeout(800);

// habitat cards
await page.click('#explore-btn'); await page.waitForTimeout(2600);
const dd = await page.locator('.habitat-card[data-habitat]').nth(5).boundingBox();
await page.screenshot({ path: O + 'habitat-deepcave.png', clip: dd });
const cards = await page.locator('#habitat-grid .habitat-card').count();
const dr = await page.locator('#habitat-grid .habitat-card').nth(7).boundingBox();
await page.screenshot({ path: O + 'habitat-dragon.png', clip: dr });
console.log('habitat cards', cards);
await page.click('#explore-back-btn'); await page.waitForTimeout(900);

// gym locked card
await page.click('#gyms-btn'); await page.waitForTimeout(2600);
const gc = await page.locator('#gym-grid .gym-card').nth(1).boundingBox();
await page.screenshot({ path: O + 'gym-locked.png', clip: gc });
// the one tappable trainer's team sprite
await page.locator('#gym-grid .gym-card').first().click(); await page.waitForTimeout(1600);
const tc = await page.locator('.trainer-card').first().boundingBox();
await page.screenshot({ path: O + 'trainer-unlocked.png', clip: tc });
await browser.close();
console.log('done');
