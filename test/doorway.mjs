// ============================================================
// v20 SWITCHOVER: the doorway at the site root.
// The boys' home-screen icon opens the root address. It must land in Sprout
// Road (next/), keep working offline once visited, and the classic Pokédex
// must still open at classic/. Run with the server on :8321.
// ============================================================
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const ROOT_URL = 'http://127.0.0.1:8321/';
let fails = 0;
const check = (label, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  ' + extra}`); if (!ok) fails++; };
const TINY = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// Static: the doorway page carries a strict CSP and no inline script.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
check('doorway: CSP present with script-src self only',
  /http-equiv="Content-Security-Policy"[^>]+script-src 'self';/.test(html) && !/unsafe-/.test(html));
check('doorway: no inline script', !/<script>(?!<\/script>)|<script(?![^>]*src=)[^>]*>\s*\S/.test(html));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
await ctx.route('https://pokeapi.co/**', r => r.fulfill({ status: 404, body: '' }));
await ctx.route('https://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: TINY, headers: { 'Access-Control-Allow-Origin': '*' } }));
const errs = [];
const page = await ctx.newPage();
page.on('pageerror', e => errs.push(e.message));

await page.goto(ROOT_URL, { waitUntil: 'networkidle' });
await page.waitForURL(/\/next\/$/, { timeout: 10000 }).catch(() => {});
check('the root address forwards to Sprout Road', /\/next\/$/.test(page.url()), page.url());

await page.goto(ROOT_URL + '?fast=1', { waitUntil: 'networkidle' });
await page.waitForURL(/\/next\/\?fast=1$/, { timeout: 10000 }).catch(() => {});
check('the query string survives the doorway', /\/next\/\?fast=1$/.test(page.url()), page.url());

// Both workers installed: the doorway's at the root, Sprout Road's at next/.
await page.waitForTimeout(1500);
const scopes = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(r => new URL(r.scope).pathname).sort());
check('doorway worker registered at the root', scopes.includes('/'), JSON.stringify(scopes));
check('Sprout Road worker registered at next/', scopes.includes('/next/'), JSON.stringify(scopes));

// Offline: the icon still opens and still lands in the game.
await ctx.setOffline(true);
await page.goto(ROOT_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForURL(/\/next\/$/, { timeout: 10000 }).catch(() => {});
const offlineOk = /\/next\/$/.test(page.url()) && await page.locator('#app').count() === 1;
check('offline: the root address still opens Sprout Road', offlineOk, page.url());
await ctx.setOffline(false);

// The classic Pokédex still opens at classic/.
const c = await ctx.newPage();
c.on('pageerror', e => errs.push('classic: ' + e.message));
await c.goto(ROOT_URL + 'classic/', { waitUntil: 'networkidle' });
check('the classic Pokédex opens at classic/', await c.locator('#boot-screen').count() === 1);
check('no page errors', errs.length === 0, errs.join(' | '));

await browser.close();
console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL DOORWAY CHECKS PASSED');
process.exit(fails ? 1 : 0);
