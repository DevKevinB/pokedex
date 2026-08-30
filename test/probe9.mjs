import { chromium } from 'playwright';
const BASE='http://127.0.0.1:8321';
const OUT='/home/kevin/pokedex/test/playtest/art-probe/';
const SEED={version:2,players:{
 1:{name:'ART',caught:[1,4,6,25,74,95,133],team:[6,25,1,4,74,95],
    mons:Object.fromEntries([1,4,6,25,74,95,133].map(id=>[id,{level:14,xp:30}])),
    badges:[],shinies:[],nicks:{},items:{masterBalls:3},quests:{},gyms:{beaten:{}},
    settings:{junior:true},champion:null,stats:{catches:7,battlesWon:3,battlesLost:0,versusWins:0}},
 2:{name:'P2',caught:[1],team:[1],mons:{1:{level:5,xp:0}},badges:[],shinies:[],nicks:{},
    items:{masterBalls:1},quests:{},gyms:{beaten:{}},settings:{junior:false},champion:null,
    stats:{catches:1,battlesWon:0,battlesLost:0,versusWins:0}}}};
const b = await chromium.launch();
const ctx = await b.newContext({viewport:{width:375,height:667},serviceWorkers:'block',deviceScaleFactor:2});
await ctx.route('https://fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
const p = await ctx.newPage();
p.on('pageerror',e=>console.log('!! PAGEERROR',e.message));
await p.addInitScript(s=>{localStorage.setItem('pokedexos_save_v2',JSON.stringify(s));localStorage.setItem('pokedexos_lastplayer','1');localStorage.setItem('pokedexos_muted','1');},SEED);
await p.goto(BASE+'/?fast=1',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(1200);
await p.evaluate(()=>document.getElementById('boot-screen')?.click());
await p.waitForTimeout(800);
await p.evaluate(()=>document.getElementById('whoplaying-modal')?.remove());
await p.waitForTimeout(2200);
const shot = n => p.screenshot({path:OUT+`s375-${n}.png`});
await shot('01-dex');
// emoji/text gap audit across the whole app
const gaps = () => p.evaluate(()=>{
  const out=[];
  const vis=e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity>0.05;};
  for (const el of document.querySelectorAll('button, .set-row, .habitat-card, .gym-card, .trainer-card, a')){
    if(!vis(el)) continue;
    // find a text node directly after an emoji-bearing element/text
    const txt=(el.textContent||'').replace(/\s+/g,' ').trim();
    const m=/([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}])([A-Za-z0-9])/u.exec(txt);
    if(m) out.push({id:el.id||el.className.toString().slice(0,30),txt:txt.slice(0,34),kind:'NOSPACE'});
    const kids=[...el.children].filter(vis);
    for(let i=0;i<kids.length-1;i++){
      const a=kids[i].getBoundingClientRect(),c=kids[i+1].getBoundingClientRect();
      const vert=c.top>=a.bottom-2;
      const gap=vert? c.top-a.bottom : c.left-a.right;
      if(gap<1) out.push({id:el.id||el.className.toString().slice(0,30),txt:txt.slice(0,26),kind:vert?'VGAP':'HGAP',gap:Math.round(gap)});
    }
  }
  return out;
});
console.log('DEX gaps', JSON.stringify(await gaps()));
await p.click('#settings-btn'); await p.waitForTimeout(900); await shot('02-settings');
console.log('SETTINGS gaps', JSON.stringify(await gaps()));
console.log('SETTINGS text', JSON.stringify(await p.evaluate(()=>document.getElementById('settings-modal')?.innerText.replace(/\n/g,' | ').slice(0,600))));
await p.evaluate(()=>document.getElementById('close-settings-btn')?.click()||document.querySelector('#settings-modal button:last-of-type')?.click());
await p.waitForTimeout(700);
await p.click('#battle-btn'); await p.waitForTimeout(1600); await shot('03-versus');
console.log('VERSUS gaps', JSON.stringify(await gaps()));
console.log('VERSUS text', JSON.stringify(await p.evaluate(()=>document.body.innerText.replace(/\n+/g,' | ').slice(0,400))));
await b.close();
