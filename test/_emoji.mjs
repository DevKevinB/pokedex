import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const HERE=new URL('.',import.meta.url).pathname, OUT=join(HERE,'emoji'); mkdirSync(OUT,{recursive:true});
const BASE='http://127.0.0.1:8321';
const JUNIOR=process.env.MODE==='junior';
const SEED={version:2,players:{
 1:{name:JUNIOR?'ART':'GABE',caught:Array.from({length:60},(_,i)=>i+1),team:[6,25,1,4,74,95],
    mons:Object.fromEntries(Array.from({length:60},(_,i)=>[i+1,{level:30,xp:30}])),
    badges:['boulder'],shinies:[25],nicks:{25:'ZAPPY'},items:{masterBalls:3},quests:{},gyms:{beaten:{boulder:5}},
    settings:{junior:JUNIOR},champion:null,stats:{catches:60,battlesWon:9,battlesLost:1,versusWins:2}},
 2:{name:'P2',caught:[1,4,7],team:[1,4,7],mons:{1:{level:20,xp:0},4:{level:20,xp:0},7:{level:20,xp:0}},badges:[],shinies:[],nicks:{},
    items:{masterBalls:1},quests:{},gyms:{beaten:{}},settings:{junior:false},champion:null,
    stats:{catches:3,battlesWon:0,battlesLost:0,versusWins:0}}}};

const AUDIT = `() => {
  const EMOJI = /[\\u{1F000}-\\u{1FAFF}\\u{2190}-\\u{2BFF}\\u{FE0F}\\u{2600}-\\u{27BF}\\u{1F1E6}-\\u{1F1FF}]/u;
  const vis = el => { const r=el.getBoundingClientRect(); const s=getComputedStyle(el);
    return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity>0.05
      && r.bottom>0 && r.top<innerHeight; };
  const out=[];
  const seen=new Set();
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walk.nextNode())) {
    const txt = node.nodeValue;
    if (!txt || !EMOJI.test(txt)) continue;
    const host = node.parentElement;
    if (!host || !vis(host)) continue;
    // find each emoji followed (possibly after spaces) by a word char in the SAME text node
    const re = /([\\u{1F000}-\\u{1FAFF}\\u{2190}-\\u{2BFF}\\u{2600}-\\u{27BF}][\\u{FE0F}\\u{FE0E}]?)(\\s*)([A-Za-z0-9À-ÿ])/gu;
    let m;
    while ((m = re.exec(txt))) {
      const iEmojiEnd = m.index + m[1].length;
      const iWord = iEmojiEnd + m[2].length;
      try {
        const r1=document.createRange(); r1.setStart(node,m.index); r1.setEnd(node,iEmojiEnd);
        const r2=document.createRange(); r2.setStart(node,iWord); r2.setEnd(node,iWord+1);
        const a=r1.getBoundingClientRect(), b=r2.getBoundingClientRect();
        if (!a.width||!b.width) continue;
        const sameLine = Math.abs(a.top-b.top) < a.height*0.6;
        const gap = sameLine ? Math.round((b.left-a.right)*10)/10 : null;
        const btn = host.closest('button, .habitat-card, .gym-card, .trainer-card, .set-row, .quest-row, [role=button]');
        const key = (btn?(btn.id||btn.className):'')+'|'+host.tagName+'|'+txt.trim().slice(0,30)+'|'+m[1];
        if (seen.has(key)) continue; seen.add(key);
        out.push({ gap, sameLine, emoji:m[1], nSpaces:m[2].length,
          text: txt.trim().replace(/\\s+/g,' ').slice(0,42),
          host: host.tagName+(host.id?'#'+host.id:'')+(host.className?'.'+String(host.className).split(' ').slice(0,2).join('.'):''),
          btn: btn? (btn.tagName+(btn.id?'#'+btn.id:'')+'.'+String(btn.className).split(' ').slice(0,2).join('.')) : null,
          fs: getComputedStyle(host).fontSize, ff: getComputedStyle(host).fontFamily.split(',')[0],
          emojiW: Math.round(a.width*10)/10, emojiH: Math.round(a.height*10)/10,
          rect:[Math.round(a.left),Math.round(a.top)] });
      } catch(e){}
    }
  }
  // also: element-level icon + label pairs (img/span icon followed by span text)
  for (const btn of document.querySelectorAll('button, .habitat-card, .gym-card, .trainer-card, .set-row, .hero-btn')) {
    if (!vis(btn)) continue;
    const kids=[...btn.children].filter(vis);
    for (let i=0;i<kids.length-1;i++){
      const a=kids[i].getBoundingClientRect(), b=kids[i+1].getBoundingClientRect();
      if (Math.abs(a.top-b.top) > a.height*0.7) continue; // stacked, not inline
      const isIcon = kids[i].tagName==='IMG' || EMOJI.test(kids[i].textContent||'');
      if (!isIcon) continue;
      out.push({ gap: Math.round((b.left-a.right)*10)/10, sameLine:true, kind:'ELEMENT-PAIR',
        emoji:(kids[i].textContent||kids[i].tagName), text:(btn.textContent||'').trim().replace(/\\s+/g,' ').slice(0,42),
        host:kids[i].tagName+'.'+String(kids[i].className).slice(0,20),
        btn: btn.tagName+(btn.id?'#'+btn.id:'')+'.'+String(btn.className).split(' ').slice(0,2).join('.'),
        fs:getComputedStyle(btn).fontSize, rect:[Math.round(a.left),Math.round(a.top)] });
    }
  }
  return out;
}`;

const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:375,height:667},serviceWorkers:'block',deviceScaleFactor:2});
await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
const page=await ctx.newPage();
await page.addInitScript(s=>{try{localStorage.setItem('pokedexos_save_v2',JSON.stringify(s));
 localStorage.setItem('pokedexos_lastplayer','1');localStorage.setItem('pokedexos_muted','1');}catch(e){}},SEED);
await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(1200);
await page.evaluate(()=>document.getElementById('boot-screen')?.click());
await page.waitForTimeout(700);
await page.evaluate(()=>document.getElementById('whoplaying-modal')?.remove());
await page.waitForTimeout(1500);

const all=[];
const grab = async name => {
  await page.waitForTimeout(400);
  const rows = await page.evaluate(new Function('return '+AUDIT)());
  await page.screenshot({ path: join(OUT, `${JUNIOR?'jr-':''}${name}.png`), fullPage: true });
  rows.forEach(r=>all.push({screen:name,...r}));
  console.log(`\n--- ${name} (${rows.length}) ---`);
  rows.forEach(r=>console.log(`  gap=${String(r.gap).padStart(6)}px spaces=${r.nSpaces??'-'} ${String(r.emoji).slice(0,4).padEnd(4)} ${String(r.kind||'').padEnd(12)} ${String(r.btn||r.host).padEnd(42)} fs=${r.fs} "${r.text}"`));
};
const go = async (name, fn) => { try { await fn(); await grab(name); } catch(e){ console.log(`SKIP ${name}: ${e.message.split('\n')[0]}`);} };

await grab('dex');
await go('ball-drawer', async()=>{ await page.click('#catch-btn'); await page.waitForTimeout(900); });
await go('dex2', async()=>{ await page.keyboard.press('Escape'); await page.evaluate(()=>document.getElementById('ball-drawer')?.classList.remove('open')); await page.waitForTimeout(400); });
await go('pc', async()=>{ await page.click('#pc-btn'); await page.waitForTimeout(1600); });
await go('pc-detail', async()=>{ await page.locator('.pc-item').nth(2).click(); await page.waitForTimeout(900); });
await go('card', async()=>{ await page.evaluate(()=>document.getElementById('close-pc-btn')?.click()); await page.waitForTimeout(600); await page.click('#card-btn'); await page.waitForTimeout(1400); });
await go('settings', async()=>{ await page.evaluate(()=>document.getElementById('card-close')?.click()); await page.waitForTimeout(500); await page.click('#settings-btn'); await page.waitForTimeout(1200); });
await go('explore', async()=>{ await page.evaluate(()=>document.querySelectorAll('.modal-close,#settings-close').forEach(b=>b.click())); await page.waitForTimeout(500);
  await page.evaluate(()=>document.getElementById('settings-modal')?.classList.remove('visible'));
  await page.click('#explore-btn'); await page.waitForFunction(()=>document.querySelectorAll('#habitat-grid .habitat-card').length>0,null,{timeout:20000}); });
await go('gyms', async()=>{ await page.click('#explore-back-btn'); await page.waitForTimeout(700); await page.click('#gyms-btn');
  await page.waitForFunction(()=>document.querySelectorAll('#gym-body .gym-card').length>0,null,{timeout:20000}); });
await go('gym-trainers', async()=>{ await page.locator('#gym-body .gym-card').first().click(); await page.waitForTimeout(1400); });
await go('battle', async()=>{ await page.evaluate(()=>document.getElementById('gym-back-btn')?.click()); await page.waitForTimeout(600);
  await page.click('#explore-btn'); await page.waitForFunction(()=>document.querySelectorAll('#habitat-grid .habitat-card:not(.locked)').length>0,null,{timeout:20000});
  await page.locator('#habitat-grid .habitat-card:not(.locked)').first().click();
  await page.waitForFunction(()=>document.getElementById('battle-container')?.classList.contains('active'),null,{timeout:30000});
  await page.waitForTimeout(2000); });
await go('battle-switch', async()=>{ await page.click('#switch-btn'); await page.waitForTimeout(900); });
await go('battle-balls', async()=>{ await page.evaluate(()=>document.querySelectorAll('.modal-close,#switch-close').forEach(b=>b.click()));
  await page.waitForTimeout(600); await page.click('#ball-btn'); await page.waitForTimeout(900); });
writeFileSync(join(OUT,(JUNIOR?'jr-':'')+'emoji.json'), JSON.stringify(all,null,1));
console.log('\n\n===== WORST GAPS (same-line, sorted) =====');
all.filter(r=>r.sameLine&&r.gap!==null).sort((a,b)=>a.gap-b.gap).slice(0,25)
   .forEach(r=>console.log(`  gap=${String(r.gap).padStart(6)}px  ${r.screen.padEnd(14)} ${String(r.btn||r.host).padEnd(40)} "${r.text}"`));
console.log('\n===== WIDEST =====');
all.filter(r=>r.sameLine&&r.gap!==null).sort((a,b)=>b.gap-a.gap).slice(0,15)
   .forEach(r=>console.log(`  gap=${String(r.gap).padStart(6)}px  ${r.screen.padEnd(14)} ${String(r.btn||r.host).padEnd(40)} "${r.text}"`));
await browser.close();
