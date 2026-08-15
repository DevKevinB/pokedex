import { chromium } from 'playwright';
const TINY = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const b = await chromium.launch();
for (const [name, w, h] of [['hof-390', 390, 844], ['hof-375', 375, 667]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  // Real sprites can't be fetched here; draw a solid pixel block so the layout is honest.
  await ctx.route('https://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: TINY }));
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:8321/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(600);
  await p.evaluate(() => {
    document.getElementById('boot-screen')?.remove();
    document.getElementById('whoplaying-modal')?.remove();
    const team = [[25,'PIKA',44],[6,'CHARIZARD',47],[9,'BLASTOISE',45],[3,'VENUSAUR',43],[143,'SNORLAX',41],[149,'DRAGONITE',50]];
    document.getElementById('hof-trainer').innerText = 'GABE — CHAMPION';
    document.getElementById('hof-date').innerText = 'ENTERED 2026-08-15';
    document.getElementById('hof-team').innerHTML = team.map(([id,n,lv]) =>
      `<div class="hof-slot marched"><img src="https://raw.githubusercontent.com/x/${id}.png" style="background:#4a5568"><small>${n}</small><span class="hof-lv">Lv${lv}</span></div>`).join('');
    document.getElementById('hof-close').style.display = 'block';
    document.getElementById('hof-modal').style.display = 'flex';
  });
  await p.waitForTimeout(500);
  const box = await p.locator('#hof-inner').boundingBox();
  console.log(`${name}: inner bottom ${Math.round(box.y + box.height)} | viewport ${h} | ${box.y + box.height > h ? 'OVERFLOWS' : 'fits'}`);
  await p.screenshot({ path: `/tmp/${name}.png` });
  await ctx.close();
}
await b.close();
