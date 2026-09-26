// ============================================================
// SPROUT ROAD: the FAMILY POSTCARD (ROADMAP 5.1, 6.5).
//
// makePostcard(opts) draws a 1080x1350 pixel-art PNG on a canvas: a dated
// postcard with one shared family-green garden strip (Art's flowers and
// Gabe's bloomed regions mixed together, so there is no territory
// scoreboard), Art's Bulba at his stage, Gabe's lead Pokemon, both names,
// bloom icons, the petal count and a stamp in the corner.
//
// Canvas safety (the whole point of this file on iOS):
//   * sprites load with crossOrigin='anonymous' from raw.githubusercontent.com
//     (it sends Access-Control-Allow-Origin: *) and are drawn only after
//     decode(). A sprite that fails (CORS, 404, offline, slow) is replaced by
//     a pokeball drawn with canvas paths, so the canvas is never tainted.
//   * If toBlob still throws SecurityError (an opaque cached response from an
//     old service worker), the card is redrawn with placeholders only.
//
// The pure half (postcardModel and friends) has no DOM and is unit-tested in
// next/test/postcard.test.mjs. Text on the card is drawn with fillText, never
// parsed as markup.
// ============================================================

import { SPRITE_BASE, spriteUrl } from './sprite.js';
import { CHAPTERS } from '../data/chapters.js';
import { cleanPlayer, cleanGarden, cleanRoad, isObj, today } from '../core/validate.js';

export const POSTCARD_W = 1080;
export const POSTCARD_H = 1350;
export const BULBA_STAGE_IDS = [1, 2, 3];          // Bulbasaur, Ivysaur, Venusaur
export const FAMILY_GREEN = '#58b858';              // one blended green, nobody's colour
export const MAX_STRIP_FLOWERS = 40;
export const SPRITE_TIMEOUT_MS = 8000;              // network timeout, not a pacing wait
export const FONT_FAMILY = 'Press Start 2P';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// Flower petal colours per garden kind (keys as the save stores them).
// Unknown kinds get a colour from the list by hash, never an error.
export const KIND_COLOURS = {
  oran: '#4f8fe8', pecha: '#f8a0c8', sitrus: '#ffd040',
  cheri: '#e84040', razz: '#c060d0', rawst: '#ff8a1e',
};
const COLOUR_LIST = Object.values(KIND_COLOURS);
// The garden starts alive: these always bloom, even on day one.
const BASE_FLOWERS = ['#f8f8e8', '#ffd040', '#f8a0c8', '#f8f8e8', '#ffd040', '#f8a0c8'];

// ---------------------------------------------------------------- pure helpers

const hash = (a, b = 0) => ((Math.imul((a | 0) + 17, 73856093) ^ Math.imul((b | 0) + 5, 19349663)) >>> 0);
const frac = n => (n % 1000) / 1000;
const clamp01 = v => Math.max(0, Math.min(1, Number(v) || 0));

/** 'YYYY-MM-DD' -> '26 SEP 2026'. Anything else -> today's date. */
export function formatPostcardDate(iso) {
  const m = typeof iso === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const s = m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[3]) >= 1 && Number(m[3]) <= 31
    ? m : /^(\d{4})-(\d{2})-(\d{2})$/.exec(today());
  return `${Number(s[3])} ${MONTHS[Number(s[2]) - 1]} ${s[1]}`;
}

/** The players as a plain array: accepts [p1, p2], {1: p1, 2: p2}, or one player. */
export function playerList(players) {
  if (Array.isArray(players)) return players.filter(isObj);
  if (isObj(players) && (isObj(players[1]) || isObj(players[2]))) return [players[1], players[2]].filter(isObj);
  if (isObj(players)) return [players];
  return [];
}

function leadOf(p) {
  const id = p.team[0] || p.caught[0] || 25;
  return { spriteId: id, shiny: p.shinies.includes(id) };
}

/** Chapter indices a reader has bloomed: road.bloomed plus any gym badge ('rock' or classic 'gym-rock'). */
export function bloomedChapters(road, badges = []) {
  const r = cleanRoad(road);
  const set = new Set(r.bloomed.filter(i => Number.isInteger(i) && i >= 0 && i < CHAPTERS.length));
  const keys = new Set(Array.isArray(badges) ? badges : []);
  CHAPTERS.forEach((c, i) => { if (keys.has(c.key) || keys.has('gym-' + c.key)) set.add(i); });   // Road key or classic 'gym-<key>'
  return [...set].sort((a, b) => a - b);
}

/**
 * The shared garden strip, as data. x in [0,1] across the strip, row 0 =
 * back, 1 = front. Art's grown plots, one bloom per region Gabe restored
 * (in that region's colour), and six base flowers so it is never bare.
 * Deterministic: the same inputs always give the same strip.
 */
export function stripFlowers(garden, bloomed = []) {
  const g = cleanGarden(garden);
  const out = BASE_FLOWERS.map((colour, i) => ({
    x: (i + 0.5) / BASE_FLOWERS.length + (frac(hash(i, 91)) - 0.5) * 0.08,
    row: i % 2, colour, size: 2, from: 'base',
  }));
  const grown = g.plots.filter(p => p.grown === true || (typeof p.grown === 'number' && p.grown >= 2));
  grown.forEach((p, i) => {
    const colour = KIND_COLOURS[p.kind] || COLOUR_LIST[hash(p.kind.length, p.kind.charCodeAt(0)) % COLOUR_LIST.length];
    out.push({ x: clamp01(p.x), row: (i + 1) % 2, colour, size: (p.grown === true || p.grown >= 4) ? 3 : 2, from: 'garden' });
  });
  for (const i of bloomed) {
    const ch = CHAPTERS[i];
    if (!ch) continue;
    out.push({ x: (i + 0.5) / CHAPTERS.length + (frac(hash(i, 7)) - 0.5) * 0.04, row: 1, colour: ch.palette.accent, size: 3, from: 'bloom', chapter: i });
  }
  // Keep every bloom and base flower, then as many garden flowers as fit.
  const keep = out.filter(f => f.from !== 'garden');
  const garden2 = out.filter(f => f.from === 'garden').slice(0, Math.max(0, MAX_STRIP_FLOWERS - keep.length));
  return [...keep, ...garden2]
    .map(f => ({ ...f, x: Math.max(0.02, Math.min(0.98, f.x)) }))
    .sort((a, b) => a.row - b.row || a.x - b.x);
}

function cleanHighlight(h) {
  const n = Math.trunc(Number(isObj(h) ? h.id : h));
  return Number.isInteger(n) && n >= 1 && n <= 649 ? n : 1;
}

/**
 * Everything the card shows, as plain data (no DOM). Inputs:
 *   players   [p1, p2] or {1, 2}; raw save players are cleaned first.
 *   date      'YYYY-MM-DD' (default today)
 *   garden    the shared strip's garden (default: the prereader's garden)
 *   road      the reader's road (default: each reader's own road)
 *   highlight dex id (or {id}) for the stamp picture (default Bulbasaur)
 *   number    the postcard's number, shown on the stamp (optional)
 * Left seat: the prereader (Bulba at his stage). Right seat: the reader
 * (his lead). Two players of the same profile keep player order.
 */
export function postcardModel({ players, date, garden, road, highlight, number } = {}) {
  const list = playerList(players).slice(0, 2).map(p => cleanPlayer(p));
  const ordered = list.length === 2 && list[0].profile === 'reader' && list[1].profile === 'prereader'
    ? [list[1], list[0]] : list;
  const seats = ordered.map((p, i) => {
    const pre = p.profile === 'prereader';
    const look = pre
      ? { spriteId: BULBA_STAGE_IDS[p.bulba.stage - 1] || 1, shiny: false }
      : leadOf(p);
    return {
      name: p.name || ('P' + (i + 1)),
      profile: p.profile,
      spriteId: look.spriteId,
      shiny: look.shiny,
    };
  });
  const pres = ordered.filter(p => p.profile === 'prereader');
  const readers = ordered.filter(p => p.profile === 'reader');
  const petals = pres.length ? Math.max(...pres.map(p => p.bulba.petals)) : null;
  const bloomSet = new Set();
  for (const p of readers) {
    for (const i of bloomedChapters(road != null ? road : p.road, p.badges)) bloomSet.add(i);
  }
  if (!readers.length && road != null) for (const i of bloomedChapters(road)) bloomSet.add(i);
  const blooms = [...bloomSet].sort((a, b) => a - b);
  const g = garden != null ? garden : (pres[0] ? pres[0].garden : null);
  const iso = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today();
  const n = Math.trunc(Number(number));
  return {
    date: iso,
    dateText: formatPostcardDate(iso),
    seats,
    petals,
    blooms: blooms.map(i => ({ idx: i, emoji: CHAPTERS[i].emoji, ground: CHAPTERS[i].palette.ground, accent: CHAPTERS[i].palette.accent })),
    flowers: stripFlowers(g, blooms),
    stampId: cleanHighlight(highlight),
    number: Number.isFinite(n) && n > 0 ? Math.min(n, 99999) : null,
  };
}

/** Every sprite URL a model needs (all on SPRITE_BASE). */
export function spriteUrlsFor(model) {
  const urls = model.seats.map(s => spriteUrl(s.spriteId, { shiny: s.shiny }));
  urls.push(spriteUrl(model.stampId));
  return [...new Set(urls)].filter(u => u.startsWith(SPRITE_BASE));
}

// ---------------------------------------------------------------- loading

function withTimeout(promise, ms) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); }),
  ]).finally(() => clearTimeout(t));
}

/** A CORS-mode, fully decoded image, or null. Never rejects. Never retries
 *  without CORS (a no-CORS image would taint the canvas). */
export function loadCorsImage(url, ms = SPRITE_TIMEOUT_MS) {
  return new Promise(resolve => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      let settled = false;
      const done = v => { if (!settled) { settled = true; resolve(v); } };
      const loaded = new Promise((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('load'));
      });
      img.src = url;
      const ready = typeof img.decode === 'function'
        ? img.decode().catch(() => loaded)   // decode() can reject spuriously; trust onload
        : loaded;
      withTimeout(ready, ms)
        .then(() => done(img.naturalWidth > 0 ? img : null))
        .catch(() => done(null));
    } catch (e) { resolve(null); }
  });
}

let fontPromise = null;
/** Loads Press Start 2P from ../fonts through FontFace. Resolves true/false, never rejects. */
export function loadPostcardFont() {
  if (fontPromise) return fontPromise;
  fontPromise = (async () => {
    try {
      if (typeof FontFace !== 'function' || typeof document === 'undefined' || !document.fonts) return false;
      const src = new URL('../../fonts/press-start-2p-latin.woff2', import.meta.url).href;
      const face = new FontFace(FONT_FAMILY, `url(${src}) format('woff2')`, { style: 'normal', weight: '400' });
      await withTimeout(face.load(), 6000);
      document.fonts.add(face);
      return true;
    } catch (e) {
      try { return !!(await withTimeout(document.fonts.load(`32px "${FONT_FAMILY}"`), 3000)).length; }
      catch (e2) { return false; }
    }
  })();
  return fontPromise;
}

// ---------------------------------------------------------------- drawing

const INK = '#24243a', PAPER = '#f8f0d8', PAPER_3 = '#fffef2', LEAF = '#7ac74c', LEAF_2 = '#3f8f3a', LEAF_3 = '#1f5c2a';
const font = px => `${px}px "${FONT_FAMILY}", "Courier New", monospace`;
const EMOJI_FONT = px => `${px}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;

function rect(ctx, x, y, w, hgt, fill) { ctx.fillStyle = fill; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(hgt)); }

/** A chunky pixel-bordered box: ink outline, fill, with notched corners. */
function pixelBox(ctx, x, y, w, hgt, fill, border = 6) {
  rect(ctx, x + border, y, w - 2 * border, hgt, INK);
  rect(ctx, x, y + border, w, hgt - 2 * border, INK);
  rect(ctx, x + border, y + border, w - 2 * border, hgt - 2 * border, fill);
}

/** Text that shrinks to fit maxW. */
function fitText(ctx, text, x, y, maxPx, maxW, { align = 'left', colour = INK, shadow = null } = {}) {
  let px = maxPx;
  ctx.font = font(px);
  while (px > 12 && ctx.measureText(text).width > maxW) { px -= 2; ctx.font = font(px); }
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if (shadow) { ctx.fillStyle = shadow; ctx.fillText(text, x + 4, y + 4); }
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
}

/** The pokeball placeholder for a sprite that could not load cleanly. */
export function drawPokeball(ctx, cx, cy, r) {
  ctx.save();
  ctx.lineWidth = Math.max(4, r * 0.12);
  ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#f8f8e8'; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.closePath(); ctx.fillStyle = '#e84040'; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2); ctx.fillStyle = '#f8f8e8'; ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawSprite(ctx, img, cx, bottom, size) {
  if (img) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, Math.round(cx - size / 2), Math.round(bottom - size), size, size);
  } else {
    drawPokeball(ctx, cx, bottom - size * 0.36, size * 0.26);
  }
}

/** A little pixel flower: 4 petals around a centre, on a stem. u = pixel size. */
function drawFlower(ctx, x, groundY, colour, u) {
  const stemH = u * 3;
  rect(ctx, x - u / 2, groundY - stemH, u, stemH, LEAF_2);
  rect(ctx, x + u / 2, groundY - stemH * 0.6, u, u, LEAF);
  const cy = groundY - stemH - u;
  rect(ctx, x - u * 1.5, cy - u / 2, u, u, colour);
  rect(ctx, x + u * 0.5, cy - u / 2, u, u, colour);
  rect(ctx, x - u / 2, cy - u * 1.5, u, u, colour);
  rect(ctx, x - u / 2, cy + u * 0.5, u, u, colour);
  rect(ctx, x - u / 2, cy - u / 2, u, u, '#ffd040');
}

function drawPetal(ctx, x, y, u) {
  // a pixel petal shape, pink with a darker edge
  const P = [
    '..##..',
    '.####.',
    '######',
    '######',
    '.####.',
    '..##..',
  ];
  P.forEach((row, j) => [...row].forEach((c, i) => {
    if (c !== '#') return;
    const edge = j === 0 || j === 5 || i === 0 || i === 5 || P[j][i - 1] === '.' || P[j][i + 1] === '.';
    rect(ctx, x + i * u, y + j * u, u, u, edge ? '#e070a0' : '#f8b0c8');
  }));
  rect(ctx, x + 2 * u, y + 2 * u, u, u, '#fff0f6');
}

function drawStamp(ctx, model, img, x, y, w, hgt) {
  // perforated white edge
  rect(ctx, x, y, w, hgt, PAPER_3);
  ctx.fillStyle = PAPER;
  const r = 9, step = 26;
  for (let px = x + step / 2; px < x + w; px += step) {
    ctx.beginPath(); ctx.arc(px, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(px, y + hgt, r, 0, Math.PI * 2); ctx.fill();
  }
  for (let py = y + step / 2; py < y + hgt; py += step) {
    ctx.beginPath(); ctx.arc(x, py, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w, py, r, 0, Math.PI * 2); ctx.fill();
  }
  const ix = x + 20, iy = y + 20, iw = w - 40, ih = hgt - 40;
  rect(ctx, ix, iy, iw, ih, LEAF);
  rect(ctx, ix, iy + ih * 0.62, iw, ih * 0.38, LEAF_2);
  ctx.strokeStyle = LEAF_3; ctx.lineWidth = 4;
  ctx.strokeRect(ix + 2, iy + 2, iw - 4, ih - 4);
  ctx.save();
  ctx.beginPath(); ctx.rect(ix + 4, iy + 4, iw - 8, ih - 8); ctx.clip();
  drawSprite(ctx, img, ix + iw / 2, iy + ih - 10, Math.round(iw * 1.25));   // sprites carry padding; crop to the stamp
  ctx.restore();
  if (model.number) fitText(ctx, 'NO.' + model.number, ix + iw / 2, iy + ih - 10, 18, iw - 16, { align: 'center', colour: PAPER_3, shadow: LEAF_3 });
  // postmark: ring + waves across the stamp's left edge
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = INK; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(x - 20, y + hgt * 0.62, 62, 0, Math.PI * 2); ctx.stroke();
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    const wy = y + hgt * 0.42 + k * 28;
    ctx.moveTo(x - 200, wy);
    for (let wx = x - 200; wx <= x + 30; wx += 20) ctx.lineTo(wx, wy + ((wx / 20) % 2 ? 8 : -8));
    ctx.stroke();
  }
  ctx.restore();
}

function drawScene(ctx, model, imgs, x, y, w, hgt) {
  pixelBox(ctx, x - 8, y - 8, w + 16, hgt + 16, INK, 8);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, hgt); ctx.clip();   // hills and sprites stay inside the window
  // sky in pixel bands
  const bands = ['#bfe6ff', '#c9ecf6', '#d4f2ea', '#def6de', '#e8fad6'];
  const skyH = hgt * 0.62;
  bands.forEach((c, i) => rect(ctx, x, y + (skyH / bands.length) * i, w, skyH / bands.length + 1, c));
  // sun
  ctx.fillStyle = '#ffe070';
  ctx.beginPath(); ctx.arc(x + w - 120, y + 110, 52, 0, Math.PI * 2); ctx.fill();
  // the Venusaur Tree on the horizon
  const tx = x + w * 0.5, ty = y + skyH;
  rect(ctx, tx - 14, ty - 150, 28, 150, '#8fbf8a');
  ctx.fillStyle = '#a8d4a0';
  for (const [dx, dy, r] of [[0, -190, 70], [-70, -150, 55], [70, -150, 55], [-40, -225, 45], [40, -225, 45]]) {
    ctx.beginPath(); ctx.arc(tx + dx, ty + dy, r, 0, Math.PI * 2); ctx.fill();
  }
  // hills
  ctx.fillStyle = '#9ed48a';
  ctx.beginPath(); ctx.ellipse(x + w * 0.2, ty + 20, w * 0.36, 90, 0, Math.PI, 0); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + w * 0.85, ty + 30, w * 0.34, 110, 0, Math.PI, 0); ctx.fill();
  // the shared family-green ground
  rect(ctx, x, ty, w, hgt - skyH, FAMILY_GREEN);
  rect(ctx, x, ty, w, 10, LEAF_2);
  for (let gx = x + 14; gx < x + w; gx += 48) {
    rect(ctx, gx, ty + 10, 6, 6, LEAF_2);
    rect(ctx, gx + 18, ty + 40 + (gx % 3) * 12, 6, 6, '#4aa04a');
  }
  // back row of flowers, then the two friends, then the front row
  const stripTop = ty + 30, stripH = hgt - skyH - 30;
  const rowY = row => stripTop + (row === 0 ? stripH * 0.35 : stripH * 0.9);
  for (const f of model.flowers.filter(f => f.row === 0)) drawFlower(ctx, x + f.x * w, rowY(0), f.colour, f.size * 4);
  const seatX = model.seats.length === 1 ? [0.5] : [0.27, 0.73];
  model.seats.forEach((s, i) => {
    const cx = x + w * seatX[i], feet = ty + 70;
    ctx.fillStyle = 'rgba(31, 92, 42, 0.45)';
    ctx.beginPath(); ctx.ellipse(cx, feet - 24, 120, 22, 0, 0, Math.PI * 2); ctx.fill();
    drawSprite(ctx, imgs[i], cx, feet + 30, 384);
  });
  for (const f of model.flowers.filter(f => f.row === 1)) drawFlower(ctx, x + f.x * w, rowY(1), f.colour, f.size * 5);
  ctx.restore();
}

function drawNames(ctx, model, y) {
  const seatX = model.seats.length === 1 ? [0.5] : [0.27, 0.73];
  model.seats.forEach((s, i) => {
    const cx = 60 + 960 * seatX[i], w = 430, hgt = 88;
    pixelBox(ctx, cx - w / 2, y, w, hgt, PAPER_3, 6);
    // leaf for the prereader's seat, pokeball for the reader's
    if (s.profile === 'prereader') {
      ctx.fillStyle = LEAF; ctx.beginPath(); ctx.ellipse(cx - w / 2 + 44, y + hgt / 2, 20, 12, -0.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = LEAF_3; ctx.lineWidth = 3; ctx.stroke();
    } else drawPokeball(ctx, cx - w / 2 + 44, y + hgt / 2, 18);
    fitText(ctx, s.name.toUpperCase(), cx + 22, y + hgt / 2 + 17, 34, w - 110, { align: 'center' });
  });
}

function drawFooter(ctx, model, y) {
  let x = 70;
  if (model.petals != null) {
    drawPetal(ctx, x, y + 20, 12);
    fitText(ctx, 'x' + model.petals, x + 90, y + 72, 36, 250);
    x += 360;
  }
  const icon = 76, gap = 14, perRow = Math.max(1, Math.floor((1010 - x) / (icon + gap)));
  if (!model.blooms.length) {
    drawFlower(ctx, x + icon / 2, y + icon + 10, LEAF, 10);
    return;
  }
  model.blooms.forEach((b, k) => {
    const bx = x + (k % perRow) * (icon + gap), by = y + Math.floor(k / perRow) * (icon + gap);
    ctx.fillStyle = b.accent; ctx.beginPath(); ctx.arc(bx + icon / 2, by + icon / 2, icon / 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = b.ground; ctx.beginPath(); ctx.arc(bx + icon / 2, by + icon / 2, icon / 2 - 7, 0, Math.PI * 2); ctx.fill();
    ctx.font = EMOJI_FONT(38); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = INK;
    ctx.fillText(b.emoji, bx + icon / 2, by + icon / 2 + 3);
  });
}

/** Draws the whole card into ctx. imgs = [seat0, seat1, stamp], null = pokeball. */
export function drawPostcard(ctx, model, imgs = []) {
  const W = POSTCARD_W, H = POSTCARD_H;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  rect(ctx, 0, 0, W, H, PAPER);
  // outer frame: ink, then a family-green inner line
  ctx.strokeStyle = INK; ctx.lineWidth = 18; ctx.strokeRect(9, 9, W - 18, H - 18);
  ctx.strokeStyle = FAMILY_GREEN; ctx.lineWidth = 8; ctx.setLineDash([24, 12]);
  ctx.strokeRect(34, 34, W - 68, H - 68); ctx.setLineDash([]);
  // header
  fitText(ctx, 'SPROUT ROAD', 70, 140, 46, 600, { colour: LEAF_3, shadow: '#c8e8b0' });
  fitText(ctx, model.dateText, 70, 210, 30, 600, { colour: INK });
  drawStamp(ctx, model, imgs[2] || null, 800, 58, 210, 240);
  drawScene(ctx, model, imgs, 68, 320, 944, 680);
  drawNames(ctx, model, 1030);
  drawFooter(ctx, model, 1150);
  ctx.restore();
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob returned null'))), 'image/png');
    } catch (e) { reject(e); }
  });
}

/**
 * makePostcard({players, date, garden, road, highlight, number}) -> Promise<Blob> (image/png, 1080x1350).
 * Waits for the pixel font and every sprite to decode before drawing. A sprite
 * that fails is drawn as a pokeball; a tainted canvas is redrawn without
 * sprites. Rejects only if the browser cannot make a PNG at all.
 */
export async function makePostcard(opts = {}) {
  const model = postcardModel(opts);
  const urls = [
    ...model.seats.map(s => spriteUrl(s.spriteId, { shiny: s.shiny })),
    spriteUrl(model.stampId),
  ];
  const [, ...loaded] = await Promise.all([
    loadPostcardFont(),
    ...urls.map(u => (u.startsWith(SPRITE_BASE) ? loadCorsImage(u) : Promise.resolve(null))),
  ]);
  const seatImgs = loaded.slice(0, model.seats.length);
  const imgs = [seatImgs[0] || null, seatImgs[1] || null, loaded[loaded.length - 1] || null];
  if (model.seats.length === 1) imgs[1] = null;

  const render = pictures => {
    const canvas = document.createElement('canvas');
    canvas.width = POSTCARD_W;
    canvas.height = POSTCARD_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    drawPostcard(ctx, model, pictures);
    return canvasBlob(canvas);
  };
  try {
    return await render(imgs);
  } catch (e) {
    if (!e || e.name !== 'SecurityError') throw e;
    // Belt and braces: something tainted the canvas, and a tainted canvas
    // stays tainted, so draw a brand-new one with pokeballs only.
    return render([]);
  }
}
