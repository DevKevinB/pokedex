// v18.9 visual check: the spoils ceremony and the rebased badge case, at both
// phone sizes, in normal and Junior mode.
import { chromium } from 'playwright';
const TINY = Buffer.from('iVBORw0KGgoAAAABAAAAAQCAYAAAAf8/9hAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const OUT = process.env.SHOT_DIR || '/tmp';
const b = await chromium.launch();
for (const [size, w, h] of [['390', 390, 844], ['375', 375, 667]]) {
  for (const junior of [false, true]) {
    for (const which of ['spoils', 'badges']) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
      await ctx.route('https://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: TINY }));
      const p = await ctx.newPage();
      await p.goto('http://127.0.0.1:8321/', { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(600);
      await p.evaluate(async ([jr, kind]) => {
        document.getElementById('boot-screen')?.remove();
        document.getElementById('whoplaying-modal')?.remove();
        document.body.classList.toggle('junior', jr);
        if (kind === 'spoils') {
          const team = [[74, 12], [95, 12], [76, 13]];
          document.getElementById('victory-lines').innerHTML =
            `<p>🏆 LEADER ROCKO DEFEATED!</p><p>You caught their whole team:</p>` +
            `<div id="spoils-grid">` + team.map(([id, lv]) =>
              `<button class="spoils-pick"><img src="https://raw.githubusercontent.com/x/${id}.png" style="background:#4a5568"><small>Lv${lv}</small></button>`).join('') +
            `</div><p id="spoils-hint">⭐ PICK YOUR FAVORITE!</p><p>GEODUDE grew to Lv14!</p>`;
          document.getElementById('victory-modal').style.display = 'flex';
        } else {
          const S = await import('/js/state.js');
          const P = await import('/js/progression.js');
          const pl = S.player();
          pl.badges.push('gym-rock', 'gym-water', 'boulder');   // 2 new + 1 legacy ★
          pl.gyms.beaten['victory:0'] = true; pl.gyms.beaten['elite:1'] = true;
          for (let i = 1; i <= 47; i++) if (!pl.caught.includes(i)) pl.caught.push(i);
          P.openTrainerCard();
        }
      }, [junior, which]);
      await p.waitForTimeout(300);
      const sel = which === 'spoils' ? '#victory-modal .modal-box' : '#card-modal .modal-box';
      const box = await p.locator(sel).boundingBox();
      const name = `v189-${which}-${size}${junior ? '-junior' : ''}`;
      const bottom = Math.round(box.y + box.height);
      console.log(`${name}: box bottom ${bottom} | viewport ${h} | ${bottom > h ? 'OVERFLOWS' : 'fits'}`);
      await p.screenshot({ path: `${OUT}/${name}.png` });
      await ctx.close();
    }
  }
}
await b.close();
