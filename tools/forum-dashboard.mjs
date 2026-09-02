#!/usr/bin/env node
// ============================================================
// Pokédex OS — the forum dashboard
//
// KEVIN: this builds the page you watch while the loop is running.
//
//   node tools/forum-dashboard.mjs            docs/forum.html + docs/forum-state.json
//   node tools/forum-dashboard.mjs --inline   also writes docs/forum-artifact.html
//
// TWO COPIES, ON PURPOSE:
//
//   docs/forum.html      Served from GitHub Pages, on the same web address as
//                        the game itself. Because it is same-origin it is
//                        ALLOWED to re-read its own data file, so it refreshes
//                        itself every 60 seconds. This is the one to keep open.
//
//   docs/forum-artifact.html
//                        The same page with the data baked in and refreshing
//                        switched off, for viewing outside the site. It cannot
//                        update itself, so it says so rather than pretending.
//
// The page is rebuilt after every release, so what you see is a snapshot
// stamped with the time it was taken.
// ============================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const F = join(ROOT, 'forum');
const DOCS = join(ROOT, 'docs');
mkdirSync(DOCS, { recursive: true });

const readJson = (f, d) => existsSync(join(F, f)) ? JSON.parse(readFileSync(join(F, f), 'utf8')) : d;
const readJsonl = f => existsSync(join(F, f))
  ? readFileSync(join(F, f), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  : [];

const threads = readJson('threads.json', []);
const seeded = readJson('seeded.json', []);
const editor = readJson('editor.json', {});
const merges = readJson('merges.json', []);
const backlogAll = readJsonl('backlog.jsonl');
const ticks = readJsonl('ticks.jsonl');

// Append-only ledger: later revs supersede, nothing is deleted.
const backlog = (() => {
  const by = new Map();
  for (const r of backlogAll) {
    const cur = by.get(r.id);
    if (!cur || (r.rev ?? 0) >= (cur.rev ?? 0)) by.set(r.id, r);
  }
  return [...by.values()];
})();

// ---- ranking (kept in step with tools/forum-rank.mjs) --------------------
const SEVERITY = { blocker: 8, major: 4, minor: 2, polish: 1, none: 1 };
const AUDIENCE = { art: 1.6, both: 1.4, gabe: 1.2, kevin: 1.0 };
const canonical = new Map();
for (const m of merges) for (const d of m.duplicates || []) canonical.set(d, m.canonical);
const threadById = new Map([...threads, ...seeded].map(t => [t.id, t]));

const statusOf = id => {
  const evs = ticks.filter(t => t.item === id);
  if (!evs.length) return 'queued';
  const last = evs[evs.length - 1].event;
  if (last === 'shipped') return 'shipped';
  if (last === 'parked' || last === 'vetoed') return 'parked';
  if (last === 'picked' || last === 'built' || last === 'gates') return 'in-flight';
  return last;
};

const scored = backlog.map(item => {
  const people = new Set();
  for (const tid of item.threads || []) {
    const t = threadById.get(canonical.get(tid) || tid) || threadById.get(tid);
    people.add(t?.persona || 'machine');
  }
  const votes = 1 + 0.5 * Math.log2(1 + people.size);
  const sev = SEVERITY[item.severity] ?? 1;
  const aud = AUDIENCE[item.helps] ?? 1;
  const rule = (item.rule_risk || []).length ? 3 : 1;
  const effort = Math.min(3, Math.max(1, item.effort || 1));
  return { ...item, voters: people.size, score: (votes * sev * aud * rule) / effort, status: statusOf(item.id) };
}).sort((a, b) => {
  const band = r => (r.severity === 'blocker' || (r.rule_risk || []).length ? 0 : 1);
  return band(a) - band(b) || b.score - a.score;
});

// ---- the word cloud ------------------------------------------------------
// Computed over the CLOSED tag vocabulary, never over prose: word frequency on
// thread text yields "the / button / screen" and says nothing. Size is how much
// the forum talked about a feature, colour is whether they liked it, and the
// bar behind each word is how much of it has shipped.
const tagStat = new Map();
for (const t of threads) {
  const w = SEVERITY[t.severity] ?? 1;
  for (const tag of t.feature_tags || []) {
    const e = tagStat.get(tag) || { tag, weight: 0, sentiment: 0, n: 0, personas: new Set(), threads: [] };
    e.weight += w;
    e.sentiment += (t.sentiment ?? 0);
    e.n++;
    e.personas.add(t.persona);
    e.threads.push(t.id);
    tagStat.set(tag, e);
  }
}
const shippedThreads = new Set(scored.filter(i => i.status === 'shipped').flatMap(i => i.threads || []));
const cloud = [...tagStat.values()].map(e => ({
  tag: e.tag,
  n: e.n,
  weight: Math.sqrt(e.weight * (1 + 0.4 * e.personas.size)),
  sentiment: e.sentiment / e.n,
  shipped: e.threads.filter(id => shippedThreads.has(id)).length / e.threads.length,
  threads: e.threads,
})).sort((a, b) => b.weight - a.weight).slice(0, 30);

// ---- state ---------------------------------------------------------------
const now = new Date();
const shipped = scored.filter(i => i.status === 'shipped');
const parked = scored.filter(i => i.status === 'parked');
const inflight = scored.find(i => i.status === 'in-flight') || null;
const lastTick = ticks[ticks.length - 1] || null;
const tickNo = ticks.filter(t => t.event === 'picked').length;

const sinceArt = (() => {
  const ships = ticks.filter(t => t.event === 'shipped');
  let n = 0;
  for (let i = ships.length - 1; i >= 0; i--) {
    if (backlog.find(b => b.id === ships[i].item)?.helps === 'art') return n;
    n++;
  }
  return ships.length;
})();

const state = {
  generatedAt: now.toISOString(),
  version: (() => {
    const m = /APP_VERSION = '([^']+)'/.exec(readFileSync(join(ROOT, 'js', 'config.js'), 'utf8'));
    return m ? m[1] : '?';
  })(),
  paused: existsSync(join(F, 'PAUSE')),
  pauseReason: existsSync(join(F, 'PAUSE')) ? readFileSync(join(F, 'PAUSE'), 'utf8').trim() : null,
  tickNo,
  counts: {
    threads: threads.length, seeded: seeded.length, merges: merges.length,
    items: scored.length, shipped: shipped.length, parked: parked.length,
    open: scored.filter(i => i.status === 'queued').length,
    blockers: scored.filter(i => i.severity === 'blocker' && i.status !== 'shipped').length,
  },
  sinceArt,
  editorSummary: editor.summary || null,
  inflight, lastShipped: shipped[0] || null,
  nextUp: scored.filter(i => i.status === 'queued').slice(0, 3),
  cloud,
  backlog: scored,
  threads: threads.map(t => ({
    id: t.id, persona: t.persona, seat: t.seat, wave: t.wave, title: t.title,
    kind: t.kind, body: t.body, severity: t.severity, helps: t.helps,
    sentiment: t.sentiment, tags: t.feature_tags, evidence: t.evidence,
    rule_risk: t.rule_risk || [],
  })),
  ticks,
  expectedDoneMs: 45 * 60 * 1000,
};

writeFileSync(join(DOCS, 'forum-state.json'), JSON.stringify(state));

// ---- the page ------------------------------------------------------------
const PAGE = String.raw`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pokédex OS — Release Loop</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;800&family=IBM+Plex+Mono:wght@400;600&family=Press+Start+2P&display=swap">
<style>
:root{
  --ground:#0f1219; --panel:#171b24; --panel-2:#1e2430; --line:#28303d;
  --ink:#e8ecf2; --ink-2:#98a3b4; --ink-3:#5b6472;
  --paper:#f2efe2;
  --ship:#3fb27f; --fly:#e0a92e; --stop:#d9534f; --queue:#5b6472;
  --art:#e0683c; --gabe:#4a90d9; --dad:#8b7fd4;
  --display:Archivo,"Helvetica Neue",Arial,sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,Menlo,monospace;
  --px:"Press Start 2P",monospace;
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--display);font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:0 18px}
body > .wrap{padding-bottom:90px}
/* the sticky bar carries its own wrap; it must not inherit the page's tail */
.status .wrap{padding-bottom:0}
a{color:inherit}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
.px{font-family:var(--px);font-size:8px;letter-spacing:.04em;line-height:1.8}

/* status bar */
.status{position:sticky;top:0;z-index:50;background:var(--ground);border-bottom:1px solid var(--line);
  padding:14px 0 12px;margin-bottom:22px}
.status .bar{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.dot{width:10px;height:10px;border-radius:50%;flex:0 0 10px;background:var(--ship)}
.dot.fly{background:var(--fly)} .dot.stop{background:var(--stop)}
.status h1{font-size:15px;font-weight:800;letter-spacing:-.01em;margin:0;text-transform:uppercase}
.status .meta{margin-left:auto;color:var(--ink-3);font-size:12px}
.status.paused{background:#2a1416;border-bottom-color:#5c2b2e}

/* cards */
.grid3{display:grid;grid-template-columns:1fr;gap:14px;margin-bottom:26px}
@media(min-width:820px){.grid3{grid-template-columns:repeat(3,1fr)}}
.card{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:16px}
.card h2{margin:0 0 10px;font-size:9px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);font-family:var(--px)}
.card .big{font-family:var(--display);font-weight:800;font-size:19px;line-height:1.25;letter-spacing:-.01em}
.card .sub{color:var(--ink-2);font-size:13px;margin-top:6px}

/* the six gate pips */
.gates{display:flex;gap:5px;margin-top:14px}
.gate{flex:1;text-align:center;padding:7px 2px 6px;border-radius:5px;background:var(--panel-2);
  border:1px solid var(--line);font-family:var(--px);font-size:6.5px;color:var(--ink-3)}
.gate.pass{background:rgba(63,178,127,.15);border-color:var(--ship);color:var(--ship)}
.gate.fail{background:rgba(217,83,79,.15);border-color:var(--stop);color:var(--stop)}
.gate.run{background:rgba(224,169,46,.13);border-color:var(--fly);color:var(--fly);animation:pulse 1.4s ease-in-out infinite}
@keyframes pulse{50%{opacity:.5}}

/* word cloud */
.cloud{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:22px 20px 16px;margin-bottom:26px}
.cloudwrap{display:flex;flex-wrap:wrap;gap:7px 12px;align-items:baseline}
.w{position:relative;cursor:pointer;padding:3px 9px;border-radius:5px;line-height:1.15;
  font-weight:600;letter-spacing:-.01em;border:1px solid transparent;background:var(--panel-2);
  overflow:hidden;transition:transform .12s,border-color .12s}
.w:hover{transform:translateY(-2px);border-color:var(--ink-3)}
.w.on{border-color:var(--fly);box-shadow:0 0 0 1px var(--fly)}
.w .fill{position:absolute;inset:0 auto 0 0;background:rgba(63,178,127,.22);pointer-events:none}
.w span{position:relative}
.legend{margin-top:14px;color:var(--ink-3);font-size:11.5px;display:flex;gap:16px;flex-wrap:wrap}
.sw{display:inline-block;width:9px;height:9px;border-radius:2px;vertical-align:-1px;margin-right:5px}

/* timeline */
.tl{display:flex;gap:3px;flex-wrap:wrap;margin-bottom:26px}
.tl i{width:15px;height:26px;border-radius:3px;background:var(--queue);display:block;cursor:pointer}
.tl i.ship{background:var(--ship)} .tl i.fail{background:var(--stop)} .tl i.fly{background:var(--fly)}

/* table */
.controls{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px}
.chip{font-family:var(--px);font-size:7.5px;padding:8px 10px;border-radius:5px;background:var(--panel);
  border:1px solid var(--line);color:var(--ink-2);cursor:pointer}
.chip.on{background:var(--fly);border-color:var(--fly);color:#1b1405}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{text-align:left;font-family:var(--px);font-size:7px;color:var(--ink-3);letter-spacing:.06em;
  padding:0 10px 9px 0;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:11px 10px 11px 0;border-bottom:1px solid var(--line);vertical-align:top}
tr.row{cursor:pointer} tr.row:hover td{background:var(--panel)}
.who{font-family:var(--px);font-size:6.5px;padding:4px 6px;border-radius:4px;white-space:nowrap}
.who.art{background:rgba(224,104,60,.18);color:var(--art)}
.who.gabe{background:rgba(74,144,217,.18);color:var(--gabe)}
.who.both{background:rgba(152,163,180,.16);color:var(--ink-2)}
.who.kevin{background:rgba(139,127,212,.18);color:var(--dad)}
.st{font-family:var(--px);font-size:6.5px;color:var(--ink-3)}
.st.shipped{color:var(--ship)} .st.parked{color:var(--stop)} .st.in-flight{color:var(--fly)}

/* drawer */
.scrim{position:fixed;inset:0;background:rgba(4,6,10,.72);opacity:0;pointer-events:none;transition:opacity .16s;z-index:80}
.scrim.on{opacity:1;pointer-events:auto}
.drawer{position:fixed;top:0;right:0;bottom:0;width:min(560px,100%);background:var(--panel);
  border-left:1px solid var(--line);transform:translateX(100%);transition:transform .2s;z-index:90;
  overflow-y:auto;padding:22px 22px 60px}
.drawer.on{transform:none}
.drawer h3{margin:8px 0 4px;font-size:20px;font-weight:800;letter-spacing:-.015em}
.drawer .kev{color:var(--paper);background:var(--panel-2);border-left:3px solid var(--fly);
  padding:11px 13px;border-radius:0 5px 5px 0;margin:14px 0;font-size:14px}
.th{background:var(--panel-2);border:1px solid var(--line);border-radius:7px;padding:12px 13px;margin:9px 0}
.th .who2{font-family:var(--px);font-size:7px;color:var(--fly)}
.th p{margin:7px 0 0;color:var(--ink-2);font-size:13px;white-space:pre-wrap}
.close{position:absolute;top:14px;right:16px;background:none;border:1px solid var(--line);
  color:var(--ink-2);border-radius:5px;padding:7px 11px;cursor:pointer;font-family:var(--px);font-size:7px}
h2.sec{font-family:var(--px);font-size:8px;color:var(--ink-3);letter-spacing:.09em;margin:30px 0 12px}
.summary{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--dad);
  border-radius:0 9px 9px 0;padding:16px 18px;margin-bottom:26px;color:var(--ink-2);font-size:14px;white-space:pre-wrap}
.empty{color:var(--ink-3);font-size:13px;padding:18px 0}
</style></head><body>
<div class="status" id="statusbar"><div class="wrap"><div class="bar">
  <span class="dot" id="dot"></span>
  <h1 id="headline">loading</h1>
  <span class="meta mono" id="stamp"></span>
</div></div></div>

<div class="wrap">
  <div class="grid3">
    <div class="card"><h2>Last shipped</h2><div id="last"></div></div>
    <div class="card"><h2>In flight</h2><div id="fly"></div>
      <div class="gates" id="gates"></div></div>
    <div class="card"><h2>Next up</h2><div id="next"></div></div>
  </div>

  <div class="cloud">
    <h2 class="sec" style="margin:0 0 14px">What the forum talked about — click a word to filter</h2>
    <div class="cloudwrap" id="cloud"></div>
    <div class="legend">
      <span><i class="sw" style="background:var(--stop)"></i>they disliked it</span>
      <span><i class="sw" style="background:var(--ship)"></i>they liked it</span>
      <span><i class="sw" style="background:rgba(63,178,127,.22)"></i>bar behind = share already fixed</span>
      <span>size = how much they talked about it</span>
    </div>
  </div>

  <div class="summary" id="summary"></div>

  <h2 class="sec">Release heartbeat</h2>
  <div class="tl" id="timeline"></div>

  <h2 class="sec">The backlog</h2>
  <div class="controls" id="filters"></div>
  <table><thead><tr>
    <th>#</th><th>Score</th><th>Who</th><th>Sev</th><th>Eff</th><th>Votes</th><th>Status</th><th>Title</th>
  </tr></thead><tbody id="rows"></tbody></table>

  <h2 class="sec">The forum — <span id="tcount"></span> threads from 24 reviewers</h2>
  <div class="controls" id="tfilters"></div>
  <div id="threads"></div>
</div>

<div class="scrim" id="scrim"></div>
<aside class="drawer" id="drawer"><button class="close" id="dclose">CLOSE</button><div id="dbody"></div></aside>

<script id="state" type="application/json">__STATE__</script>
<script>
const LIVE = __LIVE__;
let S = JSON.parse(document.getElementById('state').textContent);
let tagFilter = null, statusFilter = null, whoFilter = null, threadFilter = null;

const el = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ago = iso => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60); return h + 'h ' + (m % 60) + 'm ago';
};

function render() {
  // --- status bar. The expected-done clock is what lets a FROZEN page
  // diagnose itself as stale: it cannot fetch, but it knows what time it is.
  const stale = Date.now() - new Date(S.generatedAt) > S.expectedDoneMs;
  el('statusbar').classList.toggle('paused', !!S.paused);
  el('dot').className = 'dot' + (S.paused ? ' stop' : stale ? ' fly' : '');
  el('headline').textContent = S.paused
    ? 'PAUSED — NEEDS DAD' + (S.pauseReason ? ' · ' + S.pauseReason : '')
    : 'v' + S.version + ' · ' + S.counts.shipped + ' shipped · ' + S.counts.open + ' open · '
      + S.counts.blockers + ' blockers' + (S.tickNo ? ' · tick ' + S.tickNo : '');
  el('stamp').textContent = (LIVE ? 'updates itself · ' : 'reload for the latest · ')
    + 'as of ' + new Date(S.generatedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
    + ' · ' + ago(S.generatedAt) + (stale && !S.paused ? ' · OVERDUE' : '');

  const item = (i, extra) => i ? '<div class="big">' + esc(i.title) + '</div><div class="sub">'
      + esc(i.kevin || '') + '</div>' + (extra || '') : '<div class="empty">nothing yet</div>';
  el('last').innerHTML = item(S.lastShipped);
  el('fly').innerHTML = item(S.inflight);
  el('next').innerHTML = S.nextUp.length
    ? S.nextUp.map((n,ix) => '<div class="' + (ix?'sub':'big') + '">' + esc(n.title) + '</div>').join('')
    : '<div class="empty">queue empty</div>';

  const GATES = ['QA','UAT','REVIEW','SAVE','RELEASE','APPROVE'];
  const g = (S.inflight && S.inflight.gates) || {};
  el('gates').innerHTML = GATES.map(n =>
    '<div class="gate ' + (g[n.toLowerCase()] || (S.inflight ? 'run' : '')) + '">' + n + '</div>').join('');

  // --- word cloud: size says how much, colour says how they felt,
  //     and the bar behind says how much of it is already fixed.
  const max = Math.max(...S.cloud.map(c => c.weight), 1);
  el('cloud').innerHTML = S.cloud.map(c => {
    const size = 12 + 26 * Math.sqrt(c.weight / max);
    const col = c.sentiment > .35 ? 'var(--ship)' : c.sentiment < -.35 ? 'var(--stop)' : 'var(--ink-2)';
    return '<button class="w' + (tagFilter === c.tag ? ' on' : '') + '" data-tag="' + esc(c.tag)
      + '" style="font-size:' + size.toFixed(1) + 'px;color:' + col + '" title="'
      + c.n + ' threads · ' + Math.round(c.shipped * 100) + '% fixed">'
      + '<i class="fill" style="width:' + (c.shipped * 100).toFixed(0) + '%"></i>'
      + '<span>' + esc(c.tag) + '</span></button>';
  }).join('');

  el('summary').textContent = S.editorSummary || '';
  el('summary').style.display = S.editorSummary ? '' : 'none';

  // --- heartbeat
  const picks = S.ticks.filter(t => t.event === 'picked');
  el('timeline').innerHTML = picks.length
    ? picks.map(p => {
        const evs = S.ticks.filter(t => t.item === p.item);
        const last = evs[evs.length - 1].event;
        const cls = last === 'shipped' ? 'ship' : (last === 'parked' || last === 'vetoed') ? 'fail' : 'fly';
        return '<i class="' + cls + '" title="' + esc(p.item) + '" data-item="' + esc(p.item) + '"></i>';
      }).join('')
    : '<div class="empty">the loop has not started yet</div>';

  // --- filters + table
  const fdefs = [['status','shipped'],['status','queued'],['status','parked'],
                 ['who','art'],['who','gabe'],['who','both'],['who','kevin']];
  el('filters').innerHTML = fdefs.map(([k,v]) =>
    '<button class="chip' + ((k==='status'?statusFilter:whoFilter)===v ? ' on':'') + '" data-k="'+k+'" data-v="'+v+'">'
    + (v==='kevin'?'DAD':v.toUpperCase()) + '</button>').join('')
    + (tagFilter ? '<button class="chip on" data-k="tag" data-v="">TAG: '+esc(tagFilter)+' ✕</button>' : '');

  const rows = S.backlog.filter(r =>
    (!statusFilter || r.status === statusFilter) &&
    (!whoFilter || r.helps === whoFilter) &&
    (!tagFilter || (r.threads||[]).some(id => (S.threads.find(t=>t.id===id)?.tags||[]).includes(tagFilter))));
  el('rows').innerHTML = rows.length ? rows.map((r,i) =>
    '<tr class="row" data-item="'+esc(r.id)+'"><td class="mono">'+(i+1)+'</td>'
    + '<td class="mono">'+r.score.toFixed(1)+'</td>'
    + '<td><span class="who '+r.helps+'">'+(r.helps==='kevin'?'DAD':r.helps.toUpperCase())+'</span></td>'
    + '<td class="mono">'+esc(r.severity)+'</td><td class="mono">'+r.effort+'</td>'
    + '<td class="mono">'+r.voters+'</td>'
    + '<td><span class="st '+r.status+'">'+r.status.toUpperCase()+'</span></td>'
    + '<td>'+esc(r.title)+'</td></tr>').join('')
    : '<tr><td colspan="8" class="empty">no items match — the planner may still be running</td></tr>';

  // --- threads
  el('tcount').textContent = S.threads.length;
  const tf = [...new Set(S.threads.map(t => t.persona))].slice(0, 24);
  el('tfilters').innerHTML = '<button class="chip'+(threadFilter?'':' on')+'" data-p="">ALL</button>'
    + tf.map(p => '<button class="chip'+(threadFilter===p?' on':'')+'" data-p="'+esc(p)+'">'+esc(p)+'</button>').join('');
  const th = S.threads.filter(t => (!threadFilter || t.persona === threadFilter)
    && (!tagFilter || (t.tags||[]).includes(tagFilter)));
  el('threads').innerHTML = th.map(t =>
    '<div class="th"><div class="who2">'+esc(t.persona)+' · '+esc(t.kind).toUpperCase()
    +' · '+esc(t.severity)+'</div><div class="big" style="font-size:15px">'+esc(t.title)+'</div>'
    +'<p>'+esc(t.body)+'</p></div>').join('') || '<div class="empty">no threads match</div>';
}

// --- drawer
function openItem(id) {
  const r = S.backlog.find(x => x.id === id);
  if (!r) return;
  const ths = (r.threads || []).map(tid => S.threads.find(t => t.id === tid)).filter(Boolean);
  el('dbody').innerHTML = '<div class="who '+r.helps+'">'+(r.helps==='kevin'?'DAD':r.helps.toUpperCase())+'</div>'
    + '<h3>'+esc(r.title)+'</h3>'
    + (r.kevin ? '<div class="kev">'+esc(r.kevin)+'</div>' : '')
    + '<div class="sub mono">'+esc(r.severity)+' · effort '+r.effort+' · '+r.voters+' reviewers · score '+r.score.toFixed(1)+' · '+esc(r.status)+'</div>'
    + (r.acceptance?.length ? '<h2 class="sec">How we will know it worked</h2>'
        + r.acceptance.map(a => '<div class="th"><p>'+esc(a)+'</p></div>').join('') : '')
    + (ths.length ? '<h2 class="sec">Who asked for it, in their words</h2>'
        + ths.map(t => '<div class="th"><div class="who2">'+esc(t.persona)+'</div><p>'+esc(t.body)+'</p></div>').join('') : '');
  el('drawer').classList.add('on'); el('scrim').classList.add('on');
}
const closeDrawer = () => { el('drawer').classList.remove('on'); el('scrim').classList.remove('on'); };
el('dclose').onclick = closeDrawer; el('scrim').onclick = closeDrawer;

document.addEventListener('click', e => {
  const w = e.target.closest('.w');
  if (w) { tagFilter = tagFilter === w.dataset.tag ? null : w.dataset.tag; return render(); }
  const c = e.target.closest('.chip');
  if (c) {
    if (c.dataset.k === 'status') statusFilter = statusFilter === c.dataset.v ? null : c.dataset.v;
    else if (c.dataset.k === 'who') whoFilter = whoFilter === c.dataset.v ? null : c.dataset.v;
    else if (c.dataset.k === 'tag') tagFilter = null;
    else if (c.dataset.p !== undefined) threadFilter = c.dataset.p || null;
    return render();
  }
  const row = e.target.closest('[data-item]');
  if (row) openItem(row.dataset.item);
});

render();
if (LIVE) {
  // Same-origin, so this page is allowed to re-read its own data. It is the
  // reason this copy is the one to keep open.
  setInterval(async () => {
    try {
      const r = await fetch('./forum-state.json?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) { S = await r.json(); render(); }
    } catch (e) { /* offline: the stamp above already says how old this is */ }
  }, 60000);
}
</script></body></html>`;

const live = PAGE.replace('__STATE__', JSON.stringify(state)).replace('__LIVE__', 'true');
writeFileSync(join(DOCS, 'forum.html'), live);

if (process.argv.includes('--inline')) {
  writeFileSync(join(DOCS, 'forum-artifact.html'),
    PAGE.replace('__STATE__', JSON.stringify(state)).replace('__LIVE__', 'false'));
}

console.log(`dashboard: ${state.counts.threads} threads · ${state.counts.items} items · ${cloud.length} tags`);
console.log(`  docs/forum.html          (live, re-reads itself every 60s)`);
console.log(`  docs/forum-state.json    ${(JSON.stringify(state).length / 1024).toFixed(0)} KB`);
if (process.argv.includes('--inline')) console.log(`  docs/forum-artifact.html (state baked in)`);
