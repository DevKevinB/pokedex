// ============================================================
// Pokédex OS — versioned save system
// Schema v2. Migrates transparently from legacy v15 keys
// (pokedex_caught_p1 / pokedex_caught_p2) without data loss.
// ============================================================

const SAVE_KEY = 'pokedexos_save_v2';
const PREV_KEY = 'pokedexos_save_v2_prev';       // one-deep undo before an import
const QUARANTINE_PREFIX = 'pokedexos_save_corrupt_';
const LEGACY_KEYS = { 1: 'pokedex_caught_p1', 2: 'pokedex_caught_p2' };

// Two boys' entire collections live behind one localStorage key. Everything in
// this file that can destroy data has a fence in front of it.
const MAX_ID = 649;
const isDexId = n => Number.isInteger(n) && n >= 1 && n <= MAX_ID;
const cleanIds = arr => Array.isArray(arr)
  ? [...new Set(arr.map(Number).filter(isDexId))].sort((a, b) => a - b)
  : [];
// Same validation WITHOUT sorting — team order is meaningful (team[0] is the
// lead, which sets wild levels and who sends out first). Never sort a team.
const cleanOrderedIds = arr => Array.isArray(arr)
  ? [...new Set(arr.map(Number).filter(isDexId))]
  : [];
// Save data is rendered straight into innerHTML in several places (PC tiles,
// victory lines, the trainer card). A name or nickname arriving from a pasted
// import code is untrusted input, so it gets escaped and length-capped here,
// once, at the boundary — not at every render site.
const escapeHtml = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const cleanName = s => escapeHtml(String(s == null ? '' : s)).trim().slice(0, 12);

function freshPlayer() {
  return {
    name: '',            // display name (falls back to P1/P2)
    caught: [],          // dex ids owned
    team: [],            // up to 6 dex ids (Phase 2)
    mons: {},            // per-id growth: { [id]: { level, xp } } (Phase 2)
    badges: [],          // badge ids earned (Phase 4)
    shinies: [],         // ids whose shiny form was caught (v18.2)
    nicks: {},           // id → nickname (v18.2)
    items: { masterBalls: 1 },   // scarce: earn more via badges (Phase 4)
    quests: {},          // quest progress (Phase 4)
    gyms: { beaten: {} },// gym circuit progress (v18.1)
    settings: { junior: false },
    stats: { catches: 0, battlesWon: 0, battlesLost: 0, versusWins: 0 }
  };
}

function freshSave() {
  return { version: 2, players: { 1: freshPlayer(), 2: freshPlayer() } };
}

function migrateLegacy(save) {
  let migrated = false;
  for (const p of [1, 2]) {
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEYS[p]));
      if (Array.isArray(legacy) && legacy.length && save.players[p].caught.length === 0) {
        save.players[p].caught = [...new Set(legacy)].filter(n => Number.isInteger(n)).sort((a, b) => a - b);
        save.players[p].stats.catches = save.players[p].caught.length;
        save.players[p].items.masterBalls = 1;
        migrated = true;
      }
    } catch (e) { /* corrupt legacy save — ignore */ }
  }
  return migrated;
}

// Merge a possibly-partial loaded object over fresh defaults so
// older v2 saves gain new fields automatically as phases ship.
function hydratePlayer(raw) {
  const base = freshPlayer();
  if (!raw || typeof raw !== 'object') return base;

  // Element-level validation, not just "is it an array". A caught list holding
  // a string, a null or id 99999 renders as a broken tile and can crash a
  // sprite lookup mid-battle; junk arrives easily via a pasted import code.
  const mons = {};
  if (raw.mons && typeof raw.mons === 'object') {
    for (const [k, v] of Object.entries(raw.mons)) {
      if (!isDexId(Number(k)) || !v || typeof v !== 'object') continue;
      const level = Math.max(1, Math.min(100, Math.floor(Number(v.level)) || DEFAULT_LEVEL));
      const xp = Math.max(0, Math.floor(Number(v.xp)) || 0);
      mons[Number(k)] = { level, xp };
    }
  }
  const nicks = {};
  if (raw.nicks && typeof raw.nicks === 'object') {
    for (const [k, v] of Object.entries(raw.nicks)) {
      if (isDexId(Number(k)) && v) nicks[Number(k)] = cleanName(v);
    }
  }
  const caught = cleanIds(raw.caught);

  return {
    ...base, ...raw,
    name: cleanName(raw.name),
    items: { ...base.items, ...(raw.items || {}) },
    settings: { ...base.settings, ...(raw.settings || {}), junior: !!(raw.settings || {}).junior },
    stats: { ...base.stats, ...(raw.stats || {}) },
    mons, quests: (raw.quests && typeof raw.quests === 'object') ? raw.quests : {},
    gyms: (raw.gyms && raw.gyms.beaten) ? raw.gyms : { beaten: {} },
    shinies: cleanIds(raw.shinies),
    nicks,
    caught,
    // A team member you don't own is a guaranteed crash on battle start.
    // Order preserved — team[0] is the lead.
    team: cleanOrderedIds(raw.team).filter(id => caught.includes(id)).slice(0, 6),
    badges: Array.isArray(raw.badges) ? raw.badges : []
  };
}

export const state = {
  save: freshSave(),
  currentPlayer: 1,
  // runtime (non-persisted)
  curId: 25, curData: null, curSpeciesData: null,
  isShiny: false, isCatching: false, appMode: 'dex'
};

export function player() { return state.save.players[state.currentPlayer]; }

export function playerName(n = state.currentPlayer) {
  const nm = state.save.players[n]?.name?.trim();
  return nm || `P${n}`;
}

export function setPlayerName(n, name) {
  state.save.players[n].name = (name || '').trim().slice(0, 12).toUpperCase();
  persist();
}

// FENCE: never silently discard a save we couldn't read. Park the raw text
// under its own key so it can be recovered by hand later, rather than being
// overwritten by the first fresh save that gets written on top of it.
function quarantine(rawText, why) {
  try {
    if (!rawText) return;
    localStorage.setItem(QUARANTINE_PREFIX + Date.now(), rawText);
    console.warn('Save quarantined (' + why + '). Original text preserved.');
  } catch (e) { /* out of space — nothing more we can do */ }
}

export function loadSave() {
  const rawText = (() => { try { return localStorage.getItem(SAVE_KEY); } catch (e) { return null; } })();
  try {
    const raw = JSON.parse(rawText);
    if (raw && raw.version === 2 && raw.players && (raw.players[1] || raw.players[2])) {
      state.save = { version: 2, players: { 1: hydratePlayer(raw.players?.[1]), 2: hydratePlayer(raw.players?.[2]) } };
    } else if (rawText) {
      quarantine(rawText, 'unrecognized shape');
    }
  } catch (e) {
    quarantine(rawText, 'unparseable');
  }
  if (migrateLegacy(state.save)) persist();
  return state.save;
}

// FENCE: a failed write is a silently lost afternoon. The usual cause is the
// quota being full, and the usual culprit is the sprite/API cache — which is
// disposable, unlike the save. So: evict the cache, retry once, and only if
// that also fails, stop the game and say so in words a grown-up will see.
let persistBroken = false;
export function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state.save));
    persistBroken = false;
    return true;
  } catch (e) {
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('pokedexos_apicache')) localStorage.removeItem(k);
      }
      localStorage.setItem(SAVE_KEY, JSON.stringify(state.save));
      console.warn('Persist recovered by evicting the API cache.');
      persistBroken = false;
      return true;
    } catch (e2) {
      console.error('Persist failed after cache eviction', e2);
      if (!persistBroken) { persistBroken = true; showSaveFailureBanner(); }
      return false;
    }
  }
}

// Deliberately blocking and deliberately wordy — this is the one message in
// the game aimed at Kevin rather than at a child.
function showSaveFailureBanner() {
  try {
    if (document.getElementById('save-fail-banner')) return;
    const el = document.createElement('div');
    el.id = 'save-fail-banner';
    el.setAttribute('role', 'alert');
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(120,0,0,0.97);' +
      'color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'text-align:center;padding:24px;font-family:sans-serif;font-size:16px;line-height:1.5;';
    el.innerHTML = '<div style="font-size:56px">⚠️</div>' +
      '<div style="font-weight:800;font-size:20px;margin:12px 0">SHOW A GROWN-UP</div>' +
      '<div style="max-width:420px">This tablet is out of storage, so the game cannot save. ' +
      'Please stop playing and tell Dad now, before anything is lost.</div>';
    document.body.appendChild(el);
  } catch (e) { /* if even this fails, the console warning is all we have */ }
}

// FENCE: one-deep undo before anything overwrites the whole save.
export function snapshotBeforeRisk() {
  try { localStorage.setItem(PREV_KEY, JSON.stringify(state.save)); return true; }
  catch (e) { return false; }
}

export function hasPreviousSave() {
  try { return !!localStorage.getItem(PREV_KEY); } catch (e) { return false; }
}

// Swaps current and previous, so RESTORE is itself undoable.
export function restorePreviousSave() {
  const prevText = localStorage.getItem(PREV_KEY);
  if (!prevText) throw new Error('NO_SNAPSHOT');
  const prev = JSON.parse(prevText);
  if (!prev || !prev.players) throw new Error('SNAPSHOT_UNREADABLE');
  const current = JSON.stringify(state.save);
  state.save = { version: 2, players: { 1: hydratePlayer(prev.players[1]), 2: hydratePlayer(prev.players[2]) } };
  persist();
  try { localStorage.setItem(PREV_KEY, current); } catch (e) { /* non-fatal */ }
  return true;
}

// ---- Growth: per-Pokémon level & XP ----
export const DEFAULT_LEVEL = 5;

export function ensureMon(id, level = DEFAULT_LEVEL) {
  const p = player();
  if (!p.mons[id]) { p.mons[id] = { level, xp: 0 }; persist(); }
  return p.mons[id];
}

export function monLevel(id) {
  return player().mons[id]?.level ?? DEFAULT_LEVEL;
}

export function xpThreshold(level) {
  return 25 + level * 10; // fast, kid-friendly curve
}

// Adds xp; returns number of levels gained (capped at 100).
export function addXp(id, amount) {
  const mon = ensureMon(id);
  mon.xp += amount;
  let ups = 0;
  while (mon.level < 100 && mon.xp >= xpThreshold(mon.level)) {
    mon.xp -= xpThreshold(mon.level);
    mon.level++;
    ups++;
  }
  persist();
  return ups;
}

// Evolution bookkeeping: newId joins the box at the same level,
// and replaces oldId in the team lineup.
export function evolveMon(oldId, newId) {
  const p = player();
  const growth = p.mons[oldId] || { level: DEFAULT_LEVEL, xp: 0 };
  p.mons[newId] = { level: growth.level, xp: growth.xp };
  if (!p.caught.includes(newId)) { p.caught.push(newId); p.caught.sort((a, b) => a - b); }
  const ti = p.team.indexOf(oldId);
  if (ti >= 0) p.team[ti] = newId;
  persist();
}

export function setTeam(ids) {
  player().team = ids.slice(0, 6);
  persist();
}

// promote a team member to lead (position 0), preserving the rest's order
export function setLead(id) {
  const p = player();
  if (!p.team.includes(id)) return;
  p.team = [id, ...p.team.filter(t => t !== id)];
  persist();
}

export function recordShiny(id) {
  const p = player();
  if (!p.shinies.includes(id)) { p.shinies.push(id); persist(); return true; }
  return false;
}

export function hasShiny(id) { return player().shinies.includes(id); }

export function setNick(id, nick) {
  const clean = (nick || '').trim().slice(0, 12).toUpperCase();
  if (clean) { player().nicks[id] = clean; persist(); }
}

export function nickOf(id) { return player().nicks[id] || null; }

export function spendMasterBall() {
  const p = player();
  if (p.items.masterBalls > 0) { p.items.masterBalls--; persist(); return true; }
  return false;
}

export function recordCatch(id) {
  const p = player();
  if (!p.caught.includes(id)) {
    p.caught.push(id);
    p.caught.sort((a, b) => a - b);
    p.stats.catches++;
    persist();
    return true;
  }
  return false;
}

// ---- Export / Import codes (backwards compatible) ----
export function exportCode() {
  const payload = { v: 2, save: state.save };
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

export function importCode(code) {
  // Parse BEFORE snapshotting, so a typo'd code can't cost you the undo slot.
  const obj = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));

  // `{"v":2,"save":{"players":{}}}` used to pass every check here: players is a
  // truthy object, both hydrate calls returned fresh blanks, and the UI happily
  // reported "SAVE LOADED! Welcome back." after wiping BOTH boys. A valid v2
  // code must actually carry a player object with a caught list on it.
  const v2players = (obj.v === 2 && obj.save && obj.save.players) ? obj.save.players : null;
  const v2HasContent = !!v2players && [1, 2].some(n => {
    const p = v2players[n];
    return p && typeof p === 'object' && Array.isArray(p.caught);
  });
  const v1HasContent = Array.isArray(obj.p1) || Array.isArray(obj.p2);
  if (!v2HasContent && !v1HasContent) throw new Error('EMPTY_SAVE');

  snapshotBeforeRisk();
  if (obj.v === 2 && obj.save?.players) {
    state.save = { version: 2, players: { 1: hydratePlayer(obj.save.players[1]), 2: hydratePlayer(obj.save.players[2]) } };
  } else if (obj.v === 1 || obj.p1 || obj.p2) {
    // legacy v1 code from the old game
    if (Array.isArray(obj.p1)) state.save.players[1].caught = [...new Set(obj.p1)].sort((a, b) => a - b);
    if (Array.isArray(obj.p2)) state.save.players[2].caught = [...new Set(obj.p2)].sort((a, b) => a - b);
  } else {
    throw new Error('UNRECOGNIZED_SAVE');
  }
  persist();
}
