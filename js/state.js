// ============================================================
// Pokédex OS — versioned save system
// Schema v2. Migrates transparently from legacy v15 keys
// (pokedex_caught_p1 / pokedex_caught_p2) without data loss.
// ============================================================

const SAVE_KEY = 'pokedexos_save_v2';
const LEGACY_KEYS = { 1: 'pokedex_caught_p1', 2: 'pokedex_caught_p2' };

function freshPlayer() {
  return {
    name: '',            // display name (falls back to P1/P2)
    caught: [],          // dex ids owned
    team: [],            // up to 6 dex ids (Phase 2)
    mons: {},            // per-id growth: { [id]: { level, xp } } (Phase 2)
    badges: [],          // badge ids earned (Phase 4)
    items: { masterBalls: 1 },   // scarce: earn more via badges (Phase 4)
    quests: {},          // quest progress (Phase 4)
    gyms: { beaten: {} },// gym circuit progress (v18.1)
    settings: { junior: false },
    stats: { catches: 0, battlesWon: 0, battlesLost: 0 }
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
  return {
    ...base, ...raw,
    items: { ...base.items, ...(raw.items || {}) },
    settings: { ...base.settings, ...(raw.settings || {}) },
    stats: { ...base.stats, ...(raw.stats || {}) },
    mons: raw.mons || {}, quests: raw.quests || {},
    gyms: (raw.gyms && raw.gyms.beaten) ? raw.gyms : { beaten: {} },
    caught: Array.isArray(raw.caught) ? raw.caught : [],
    team: Array.isArray(raw.team) ? raw.team : [],
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

export function loadSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (raw && raw.version === 2) {
      state.save = { version: 2, players: { 1: hydratePlayer(raw.players?.[1]), 2: hydratePlayer(raw.players?.[2]) } };
    }
  } catch (e) { console.warn('Save corrupted, starting fresh (legacy keys still checked).'); }
  if (migrateLegacy(state.save)) persist();
  return state.save;
}

export function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state.save)); }
  catch (e) { console.warn('Persist failed', e); }
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
  const obj = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
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
