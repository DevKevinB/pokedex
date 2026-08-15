// v18.10 visual check: the Explore map with FARAWAY LAND, locked (pre-Champion)
// and unlocked, at both phone sizes, in normal and Junior mode.
import { chromium } from 'playwright';
const TINY = Buffer.from('iVBORw0KGgoAAAABAAAAAQCAYAAAAf8/9hAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const OUT = process.env.SHOT_DIR || '/tmp';
const b = await chromium.launch();
for (const [size, w, h] of [['390', 390, 844], ['375', 375, 667]]) {
  for (const junior of [false, true]) {
    for (const champion of [false, true]) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
      await ctx.route('https://pokeapi.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"results":[]}' }));
      await ctx.route('https://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: TINY }));
      const p = await ctx.newPage();
      await p.goto('http://127.0.0.1:8321/', { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(700);
      await p.evaluate(async ([jr, ch]) => {
        document.getElementById('boot-screen')?.remove();
        document.getElementById('whoplaying-modal')?.remove();
        document.body.classList.toggle('junior', jr);
        const S = await import('/js/state.js');
        const E = await import('/js/explore.js');
        S.player().caught.push(25);
        if (ch) S.recordChampion([25]);
        E.openExplore();
      }, [junior, champion]);
      await p.waitForTimeout(400);
      const grid = await p.locator('#habitat-grid').boundingBox();
      const name = `v1810-explore-${size}${junior ? '-junior' : ''}${champion ? '-champ' : ''}`;
      console.log(`${name}: grid bottom ${Math.round(grid.y + grid.height)} | viewport ${h}`);
      await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
      await ctx.close();
    }
  }
}
await b.close();
