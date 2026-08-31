// ============================================================
// Pokédex OS — 🔧 TRAINER TOOLS (parent mode)
// Add any Pokémon to either player's box at any level, retune
// levels, or remove them. Level drives every battle stat, so a
// Lv70 Charizard really does hit like a Lv70 Charizard.
// ============================================================

import { MAX_POKEMON, PIXEL_SPRITE } from './config.js';
import { getPokemon, getNameIndex, nameOf } from './api.js';
import { state, persist, playerName, DEFAULT_LEVEL } from './state.js';
import { updateCatchUI } from './dex.js';
import { triggerVibration, sfx } from './audio.js';
import { dialog, pinPad } from './dialog.js';

let target = 1;

const P = () => state.save.players[target];
const clampLevel = n => Math.max(1, Math.min(100, parseInt(n) || DEFAULT_LEVEL));

function setStatus(msg, ok = true) {
  const el = document.getElementById('dev-status');
  el.innerText = msg;
  el.className = ok ? 'dev-status ok' : 'dev-status err';
}

// ---- open / close ----
export function openDevTools() {
  document.getElementById('dev-modal').style.display = 'flex';
  setStatus('');
  const dateEl = document.getElementById('dev-pin-date');
  if (dateEl) {
    let setOn = null;
    try { setOn = localStorage.getItem(PIN_KEY + '_set'); } catch (e) { /* noop */ }
    dateEl.innerText = setOn ? `PIN SET ON ${setOn}` : '';
  }
  render();
}

export function closeDevTools() {
  document.getElementById('dev-modal').style.display = 'none';
  updateCatchUI();
}

// ---- rendering ----
function render() {
  document.getElementById('dev-target-1').classList.toggle('on', target === 1);
  document.getElementById('dev-target-2').classList.toggle('on', target === 2);
  document.getElementById('dev-target-1').innerText = playerName(1);
  document.getElementById('dev-target-2').innerText = playerName(2);
  document.getElementById('dev-count').innerText = `${P().caught.length} / ${MAX_POKEMON} OWNED`;
  renderList();
}

function renderList() {
  const list = document.getElementById('dev-list');
  const filter = document.getElementById('dev-filter').value.trim().toLowerCase();
  const owned = P().caught.slice().sort((a, b) => a - b)
    .filter(id => !filter || String(id).includes(filter) || String(id).padStart(3, '0').includes(filter));

  if (owned.length === 0) {
    list.innerHTML = `<div class="dev-empty">${filter ? 'NO MATCHES' : 'NOTHING OWNED YET — ADD ONE ABOVE'}</div>`;
    return;
  }

  list.innerHTML = owned.map(id => {
    const lvl = P().mons[id]?.level ?? DEFAULT_LEVEL;
    return `<div class="dev-row" data-id="${id}">
      <img src="${PIXEL_SPRITE(id)}" loading="lazy">
      <span class="dev-id">#${id.toString().padStart(3, '0')}</span>
      <button class="dev-mini" data-act="down" title="Level down 5">−</button>
      <input class="dev-lvl" type="number" min="1" max="100" value="${lvl}" title="Set level (1–100)">
      <button class="dev-mini" data-act="up" title="Level up 5">+</button>
      <button class="dev-mini danger" data-act="del" title="Remove from box">✕</button>
    </div>`;
  }).join('');

  list.querySelectorAll('.dev-row').forEach(row => {
    const id = parseInt(row.dataset.id);
    const input = row.querySelector('.dev-lvl');
    input.addEventListener('change', () => setLevel(id, input.value));
    row.querySelectorAll('.dev-mini').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'del') removeMon(id);
        else setLevel(id, clampLevel(input.value) + (act === 'up' ? 5 : -5));
      });
    });
  });
}

// ---- mutations ----
function ensureEntry(id, level) {
  if (!P().mons[id]) P().mons[id] = { level: clampLevel(level), xp: 0 };
  return P().mons[id];
}

function setLevel(id, level) {
  const lvl = clampLevel(level);
  ensureEntry(id, lvl).level = lvl;
  P().mons[id].xp = 0;
  persist();
  triggerVibration(20);
  setStatus(`#${String(id).padStart(3, '0')} SET TO Lv${lvl}`);
  renderList();
}

// Removal is the one action in here that destroys something a boy earned —
// and re-adding can't restore the lost level. It confirms first, sprite-led,
// like every other destructive action since v18.8.
async function removeMon(id) {
  const go = await dialog({
    sprite: id, title: 'REMOVE IT?',
    text: `#${String(id).padStart(3, '0')} leaves ${playerName(target)}'s box and team. Its level is lost.`,
    ok: 'REMOVE', cancel: 'KEEP', danger: true
  });
  if (!go) return;
  P().caught = P().caught.filter(c => c !== id);
  P().team = P().team.filter(t => t !== id);
  delete P().mons[id];
  persist();
  triggerVibration(40);
  setStatus(`#${String(id).padStart(3, '0')} REMOVED`);
  render();
}

async function addMon() {
  const raw = document.getElementById('dev-add-name').value.trim().toLowerCase();
  const level = clampLevel(document.getElementById('dev-add-level').value);
  if (!raw) { setStatus('TYPE A NAME OR NUMBER FIRST', false); return; }

  setStatus('LOOKING UP...');
  let id = null;
  if (/^\d+$/.test(raw)) {
    id = parseInt(raw);
    if (id < 1 || id > MAX_POKEMON) { setStatus(`NUMBER MUST BE 1–${MAX_POKEMON}`, false); return; }
  } else {
    try {
      const data = await getPokemon(raw.replace(/\s+/g, '-'));
      if (!data || data.id > MAX_POKEMON) throw new Error('RANGE');
      id = data.id;
    } catch (e) {
      setStatus('NOT FOUND — CHECK THE SPELLING', false);
      return;
    }
  }

  const isNew = !P().caught.includes(id);
  if (isNew) { P().caught.push(id); P().caught.sort((a, b) => a - b); }
  P().mons[id] = { level, xp: 0 };
  persist();
  sfx.catch();
  triggerVibration([60, 30, 60]);
  document.getElementById('dev-add-name').value = '';
  setStatus(`${isNew ? 'ADDED' : 'UPDATED'} #${String(id).padStart(3, '0')} AT Lv${level}`);
  render();
}

// ---- hold-to-open gate (keeps curious 7-year-olds out by accident) ----
function wireHoldToOpen() {
  const btn = document.getElementById('dev-open-btn');
  if (!btn) return;
  let timer = null, held = false;
  const HOLD_MS = 1200;

  const start = e => {
    e.preventDefault();
    clearTimeout(timer);   // a second finger must not orphan the first timer
    held = false;
    btn.classList.add('holding');
    timer = setTimeout(async () => {
      held = true;
      btn.classList.remove('holding');
      if (!(await requirePin())) return;
      // Settings stays OPEN behind Trainer Tools. Hiding it here was never
      // needed for stacking — #dev-modal is z-index 2700 over #settings-modal's
      // 2600, so it is completely covered — and it did two bad things: nothing
      // ever put Settings back, so DONE dropped you on the Pokedex; and it
      // bypassed closeSettings(), which is the only thing that persists the two
      // name fields, so typing a name and then holding PARENT TOOLS silently
      // threw the name away. DONE only hides #dev-modal, which now reveals
      // Settings exactly as it was left, typed name and all.
      openDevTools();
    }, HOLD_MS);
  };
  const cancel = () => {
    clearTimeout(timer);
    btn.classList.remove('holding');
    if (!held) btn.innerText = '🔧 PARENT TOOLS — HOLD TO OPEN';
  };

  btn.addEventListener('pointerdown', start);
  btn.addEventListener('pointerup', cancel);
  btn.addEventListener('pointerleave', cancel);
  btn.addEventListener('pointercancel', cancel);
}

// ---- PIN gate: set on first open, required ever after ----
// Runs on the in-app keypad (js/dialog.js), never on prompt(): an installed
// iOS PWA suppresses prompt() entirely, which made Parent Tools unreachable
// on the boys' iPad — and the old error path returned true, failing OPEN.
// Any failure here now fails CLOSED.
const PIN_KEY = 'pokedexos_devpin';

async function setNewPin(title) {
  const pin = await pinPad({ title, sub: 'SET A NEW PIN' });
  if (pin === null) return false;
  // The confirm pad stays open on a mismatch (shake + clear) until it
  // matches or the grown-up cancels.
  const again = await pinPad({ title, sub: 'TYPE IT AGAIN', verify: v => v === pin });
  if (again === null) return false;
  localStorage.setItem(PIN_KEY, pin);
  // First-use PIN setup is trust-on-first-use by design (like a TV's parental
  // PIN) — a reading 7-year-old could claim an unset gate. The date makes a
  // surprise claim VISIBLE to Kevin inside Parent Tools.
  try { localStorage.setItem(PIN_KEY + '_set', new Date().toLocaleDateString()); } catch (e) { /* cosmetic */ }
  return true;
}

export async function requirePin() {
  try {
    let stored = null;
    try { stored = localStorage.getItem(PIN_KEY); } catch (e) { /* fall through: no PIN yet */ }
    if (!stored) return await setNewPin('🔒 GROWN-UPS ONLY');
    const entry = await pinPad({ title: '🔒 GROWN-UPS ONLY', sub: 'ENTER PIN', verify: v => v === stored });
    return entry !== null;
  } catch (e) {
    return false; // fail CLOSED — a broken gate stays shut
  }
}

async function changePin() {
  try {
    if (await setNewPin('🔑 CHANGE PIN')) {
      await dialog({ icon: '🔑', title: 'PIN CHANGED', text: 'The new PIN starts now.' });
    }
  } catch (e) { /* noop — nothing changed */ }
}

// ---- live name suggestions with sprites ----
function renderSuggestions() {
  const box = document.getElementById('dev-suggest');
  const q = document.getElementById('dev-add-name').value.trim().toLowerCase();
  if (q.length < 2 || /^\d+$/.test(q)) { box.innerHTML = ''; return; }
  getNameIndex().then(idx => {
    if (!idx) return;
    const hits = [];
    for (let id = 1; id < idx.length && hits.length < 8; id++) {
      if (idx[id].includes(q)) hits.push(id);
    }
    box.innerHTML = hits.map(id =>
      `<div class="dev-sug" data-id="${id}"><img src="${PIXEL_SPRITE(id)}"><span>${idx[id]}</span><small>#${String(id).padStart(3, '0')}</small></div>`
    ).join('');
    box.querySelectorAll('.dev-sug').forEach(el =>
      el.addEventListener('click', () => {
        document.getElementById('dev-add-name').value = el.dataset.id;
        box.innerHTML = '';
        document.getElementById('dev-add-level').focus();
      }));
  });
}

export function initDevTools() {
  const on = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);
  on('dev-close', closeDevTools);
  on('dev-add-btn', addMon);
  on('dev-change-pin', changePin);
  on('dev-target-1', () => { target = 1; render(); });
  on('dev-target-2', () => { target = 2; render(); });
  document.getElementById('dev-filter')?.addEventListener('input', renderList);
  document.getElementById('dev-add-name')?.addEventListener('input', renderSuggestions);
  document.getElementById('dev-add-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') addMon();
  });
  wireHoldToOpen();
}
