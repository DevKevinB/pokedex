// v18.11 visual check: the sprite-led spoils confirmation and the Parent
// Tools SECURITY section, at both phone sizes, in normal and Junior mode.
import { chromium } from 'playwright';
const TINY = Buffer.from('iVBORw0KGgoAAAABAAAAAQCAYAAAAf8/9hAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const OUT = process.env.SHOT_DIR || '/tmp';
const b = await chromium.launch();
for (const [size, w, h] of [['390', 390, 844], ['375', 375, 667]]) {
  for (const junior of [false, true]) {
    for (const which of ['hint', 'security']) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
      await ctx.route('https://pokeapi.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"results":[]}' }));
      await ctx.route('https://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: TINY }));
      const p = await ctx.newPage();
      await p.goto('http://127.0.0.1:8321/', { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(700);
      await p.evaluate(([jr, kind]) => {
        document.getElementById('boot-screen')?.remove();
        document.getElementById('whoplaying-modal')?.remove();
        document.body.classList.toggle('junior', jr);
        if (kind === 'hint') {
          document.getElementById('victory-lines').innerHTML =
            `<p>🏆 LEADER ROCKO DEFEATED!</p><p>You caught their whole team:</p>` +
            `<div id="spoils-grid" class="picked"><button class="spoils-pick chosen"><img src="https://raw.githubusercontent.com/x/74.png" style="background:#4a5568"><small>Lv12</small></button></div>` +
            `<p id="spoils-hint"><img class="spoils-hint-img" src="https://raw.githubusercontent.com/x/74.png" style="background:#4a5568"> ⭐ SAFE IN YOUR BOX!</p>`;
          document.getElementById('victory-modal').style.display = 'flex';
        } else {
          localStorage.setItem('pokedexos_devpin_set', '8/22/2026');
          document.getElementById('dev-pin-date').innerText = 'PIN SET ON 8/22/2026';
          document.getElementById('dev-modal').style.display = 'flex';
        }
      }, [junior, which]);
      await p.waitForTimeout(300);
      const sel = which === 'hint' ? '#victory-modal .modal-box' : '#dev-modal .modal-box';
      const box = await p.locator(sel).boundingBox();
      const name = `v1811-${which}-${size}${junior ? '-junior' : ''}`;
      const bottom = Math.round(box.y + box.height);
      console.log(`${name}: box bottom ${bottom} | viewport ${h} | ${bottom > h ? 'OVERFLOWS (check scroll)' : 'fits'}`);
      await p.screenshot({ path: `${OUT}/${name}.png` });
      await ctx.close();
    }
  }
}
await b.close();
