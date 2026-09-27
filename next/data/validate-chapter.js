// ============================================================
// SPROUT ROAD: the Wild Chapter validator.
// A Wild Chapter is plain DATA an agent can keep writing (ROADMAP M7).
// Every chapter goes through validateChapter() when data/wild-chapters.js
// loads; a bad one is skipped with a console warning, never thrown, so one
// typo can never take the Road down. Pure: no DOM, no store.
//
// Chapter shape (every field required, no other keys allowed):
// { idx: 0..23, key: 'frost-peak', name: 'FROST PEAK', emoji: '❄️',
//   types: ['ice'] (1..2 of the 18 types), palette: { ground, sky, accent } ('#rrggbb'),
//   flavour: 'SNOW THAT NEVER MELTS.' (<= 6 words),
//   trainers: [ exactly 5 x { name, taunt (<= 6 words), team: [{ id: 1..649, level: 1..100 }] (1..6, no repeats) } ],
//   the 5th and ONLY the 5th carries leader: true }
// ============================================================

import { MAX_POKEMON } from './config.js';
import { WILD_COUNT, WILD_TRAINERS } from '../core/validate.js';

// 4 trainers + the LEADER (keys w<i>-t0..t4). Never more than the save's key
// space holds (WILD_TRAINERS in core/validate.js; a unit test checks it).
export const WILD_CHAPTER_TRAINERS = Math.min(5, WILD_TRAINERS);
export const MAX_TEAM = 6;
export const MAX_NAME = 18;                    // a trainer or chapter name, pixel-font width
export const MAX_LINE = 32;                    // a taunt or the flavour line
export const MAX_WORDS = 6;                    // kid-facing words, house rule
export const TYPES = Object.freeze(['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison',
  'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy']);

const CHAPTER_KEYS = ['idx', 'key', 'name', 'emoji', 'types', 'palette', 'flavour', 'trainers'];
const TRAINER_KEYS = ['name', 'taunt', 'team', 'leader'];
const MON_KEYS = ['id', 'level'];
const PALETTE_KEYS = ['ground', 'sky', 'accent'];

const NAME_RE = /^[A-Z0-9][A-Z0-9 .'-]*$/;         // UPPERCASE, digits, space . ' -
const LINE_RE = /^[A-Z0-9][A-Z0-9 .,'!?-]*$/;      // plus , ! ?
const KEY_RE = /^[a-z][a-z0-9-]{1,23}$/;
const COLOUR_RE = /^#[0-9a-fA-F]{6}$/;
const POISON = new Set(['__proto__', 'constructor', 'prototype']);

const isPlain = o => o !== null && typeof o === 'object' && !Array.isArray(o) &&
  (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null);
const words = s => s.trim().split(/\s+/).filter(Boolean).length;

function exactKeys(o, allowed, required, where, errors) {
  for (const k of Object.keys(o)) if (!allowed.includes(k) || POISON.has(k)) errors.push(where + ': unknown key ' + JSON.stringify(k));
  for (const k of required) if (!Object.prototype.hasOwnProperty.call(o, k)) errors.push(where + ': missing ' + k);
}

function checkText(v, re, max, where, errors, maxWords = 0) {
  if (typeof v !== 'string') { errors.push(where + ': not a string'); return; }
  if (!v.length || v.length > max) errors.push(where + ': length must be 1..' + max);
  if (v !== v.trim() || /\s\s/.test(v)) errors.push(where + ': stray spaces');
  if (!re.test(v)) errors.push(where + ': only UPPERCASE letters, digits and simple punctuation');
  if (maxWords && words(v) > maxWords) errors.push(where + ': more than ' + maxWords + ' words');
}

const isInt = (v, lo, hi) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

function checkTrainer(t, j, errors) {
  const where = 'trainers[' + j + ']';
  if (!isPlain(t)) { errors.push(where + ': not an object'); return; }
  const last = j === WILD_CHAPTER_TRAINERS - 1;
  exactKeys(t, TRAINER_KEYS, last ? TRAINER_KEYS : ['name', 'taunt', 'team'], where, errors);
  checkText(t.name, NAME_RE, MAX_NAME, where + '.name', errors);
  checkText(t.taunt, LINE_RE, MAX_LINE, where + '.taunt', errors, MAX_WORDS);
  if (last && t.leader !== true) errors.push(where + ': the last trainer must be the leader (leader: true)');
  if (!last && Object.prototype.hasOwnProperty.call(t, 'leader')) errors.push(where + ': only the last trainer is a leader');
  if (!Array.isArray(t.team) || t.team.length < 1 || t.team.length > MAX_TEAM) {
    errors.push(where + '.team: needs 1..' + MAX_TEAM + ' Pokemon');
    return;
  }
  const seen = new Set();
  t.team.forEach((m, k) => {
    const w = where + '.team[' + k + ']';
    if (!isPlain(m)) { errors.push(w + ': not an object'); return; }
    exactKeys(m, MON_KEYS, MON_KEYS, w, errors);
    if (!isInt(m.id, 1, MAX_POKEMON)) errors.push(w + '.id: must be an integer 1..' + MAX_POKEMON);
    else if (seen.has(m.id)) errors.push(w + '.id: ' + m.id + ' twice on one team');
    else seen.add(m.id);
    if (!isInt(m.level, 1, 100)) errors.push(w + '.level: must be an integer 1..100');
  });
}

/**
 * Check one Wild Chapter strictly. Never throws (a getter that throws, a
 * Proxy, a cyclic object: all come back as {ok:false}).
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateChapter(obj) {
  const errors = [];
  try {
    if (!isPlain(obj)) return { ok: false, errors: ['chapter: not a plain object'] };
    exactKeys(obj, CHAPTER_KEYS, CHAPTER_KEYS, 'chapter', errors);
    if (!isInt(obj.idx, 0, WILD_COUNT - 1)) errors.push('idx: must be an integer 0..' + (WILD_COUNT - 1));
    if (typeof obj.key !== 'string' || !KEY_RE.test(obj.key)) errors.push('key: lowercase letters, digits and -, 2..24 long');
    checkText(obj.name, NAME_RE, MAX_NAME, 'name', errors);
    if (typeof obj.emoji !== 'string' || !obj.emoji.length || obj.emoji.length > 8 ||
        /[\x00-\x7F]/.test(obj.emoji)) errors.push('emoji: 1..8 chars, a picture (no ASCII)');
    if (!Array.isArray(obj.types) || obj.types.length < 1 || obj.types.length > 2 ||
        !obj.types.every(t => TYPES.includes(t)) || new Set(obj.types).size !== obj.types.length) {
      errors.push('types: 1 or 2 different types from ' + TYPES.join(','));
    }
    if (!isPlain(obj.palette)) errors.push('palette: not an object');
    else {
      exactKeys(obj.palette, PALETTE_KEYS, PALETTE_KEYS, 'palette', errors);
      for (const k of PALETTE_KEYS) if (typeof obj.palette[k] !== 'string' || !COLOUR_RE.test(obj.palette[k])) errors.push('palette.' + k + ': must be #rrggbb');
    }
    checkText(obj.flavour, LINE_RE, MAX_LINE, 'flavour', errors, MAX_WORDS);
    if (!Array.isArray(obj.trainers) || obj.trainers.length !== WILD_CHAPTER_TRAINERS) {
      errors.push('trainers: exactly ' + WILD_CHAPTER_TRAINERS + ' needed');
    } else {
      obj.trainers.forEach((t, j) => checkTrainer(t, j, errors));
    }
  } catch (e) {
    errors.push('chapter: unreadable (' + (e && e.message ? e.message : 'error') + ')');
  }
  return { ok: errors.length === 0, errors };
}

/** Deep-copied, frozen copy of a chapter that passed (so nothing later can
 *  mutate the shared data). Only call on a chapter that validated. */
export function freezeChapter(c) {
  return Object.freeze({
    idx: c.idx, key: c.key, name: c.name, emoji: c.emoji,
    types: Object.freeze([...c.types]),
    palette: Object.freeze({ ground: c.palette.ground, sky: c.palette.sky, accent: c.palette.accent }),
    flavour: c.flavour,
    trainers: Object.freeze(c.trainers.map((t, j) => Object.freeze({
      name: t.name, taunt: t.taunt, leader: j === WILD_CHAPTER_TRAINERS - 1,
      team: Object.freeze(t.team.map(m => Object.freeze({ id: m.id, level: m.level })))
    })))
  });
}

/**
 * Validate a list: the good chapters, sorted by idx, deep-frozen. A bad one,
 * or a second chapter with an idx or key already taken, is skipped (and
 * reported through `warn`). Never throws.
 */
export function loadChapters(list, warn = () => {}) {
  const out = [];
  const idxs = new Set(), keys = new Set();
  let arr = [];
  try { arr = Array.isArray(list) ? [...list] : []; } catch (e) { arr = []; }
  arr.forEach((c, n) => {
    const r = validateChapter(c);
    if (!r.ok) { try { warn('wild chapter #' + n + ' skipped: ' + r.errors.join('; ')); } catch (e) { /* ignore */ } return; }
    if (idxs.has(c.idx) || keys.has(c.key)) { try { warn('wild chapter #' + n + ' skipped: idx or key used twice'); } catch (e) { /* ignore */ } return; }
    idxs.add(c.idx); keys.add(c.key);
    out.push(freezeChapter(c));
  });
  return Object.freeze(out.sort((a, b) => a.idx - b.idx));
}
