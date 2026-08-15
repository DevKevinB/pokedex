// v18.8 visual check: the PIN pad and the in-world dialog, at both phone
// sizes, in normal and Junior mode. Layout has overflowed off-screen twice
// before; the smoke suite cannot see that — eyes only.
import { chromium } from 'playwright';
const TINY = Buffer.from('iVBORw0KGgoAAAABAAAAAQCAYAAAAf8/9hAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const OUT = process.env.SHOT_DIR || '/tmp';
const b = await chromium.launch();
for (const [size, w, h] of [['390', 390, 844], ['375', 375, 667]]) {
  for (const junior of [false, true]) {
    for (const which of ['pin', 'dlg']) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
      await ctx.route('https://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: TINY }));
      const p = await ctx.newPage();
      await p.goto('http://127.0.0.1:8321/', { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(600);
      await p.evaluate(([jr, kind]) => {
        document.getElementById('boot-screen')?.remove();
        document.getElementById('whoplaying-modal')?.remove();
        document.body.classList.toggle('junior', jr);
        if (kind === 'pin') {
          document.getElementById('pin-dots').querySelectorAll('span').forEach((d, i) => d.classList.toggle('filled', i < 2));
          document.getElementById('pin-modal').style.display = 'flex';
        } else {
          document.getElementById('dlg-icon').innerText = '⚠️';
          document.getElementById('dlg-title').innerText = 'UNDO THE LAST IMPORT?';
          document.getElementById('dlg-text').style.display = 'block';
          document.getElementById('dlg-text').innerText = 'Right now you have 128 Pokémon. This swaps back to the save from just before the last import.';
          document.getElementById('dlg-ok').innerText = 'UNDO IT';
          document.getElementById('dlg-cancel').style.display = 'block';
          document.getElementById('dlg-cancel').innerText = 'KEEP THIS';
          document.getElementById('dlg-modal').style.display = 'flex';
        }
      }, [junior, which]);
      await p.waitForTimeout(300);
      const sel = which === 'pin' ? '#pin-modal .modal-box' : '#dlg-modal .modal-box';
      const box = await p.locator(sel).boundingBox();
      const name = `v188-${which}-${size}${junior ? '-junior' : ''}`;
      console.log(`${name}: box bottom ${Math.round(box.y + box.height)} | viewport ${h} | ${box.y + box.height > h ? 'OVERFLOWS' : 'fits'}`);
      await p.screenshot({ path: `${OUT}/${name}.png` });
      await ctx.close();
    }
  }
}
await b.close();
