import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({viewport:{width:400,height:220}, deviceScaleFactor:3});
await p.setContent(`<body style="margin:0;background:#fff;display:flex;gap:20px;align-items:center;justify-content:center">
<div style="text-align:center;font:14px sans-serif">27<br><img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/27.gif" style="image-rendering:pixelated;width:160px"></div>
<div style="text-align:center;font:14px sans-serif">28<br><img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/28.gif" style="image-rendering:pixelated;width:160px"></div>
</body>`);
await p.waitForTimeout(2500);
await p.screenshot({path:'/tmp/claude-1000/-home-kevin-pokedex/c02990b7-8698-403c-8544-c2332c13aa8b/scratchpad/cmp.png'});
await b.close();
