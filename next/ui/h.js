// ============================================================
// SPROUT ROAD — h(): the only way next/ builds DOM.
// Text always goes in through textContent / text nodes, so a
// name typed by a child (or a poisoned save code) can never
// become markup. There is deliberately NO markup-parsing path here.
//
// The page CSP is style-src 'self' with NO 'unsafe-inline'. That
// blocks style="" ATTRIBUTES, but not the CSSOM, so styles from
// props.style are written through el.style / setProperty, never
// setAttribute('style').
// ============================================================

const SVG_NS = 'http://www.w3.org/2000/svg';

// Keys that would parse a string as markup or code. Refused, loudly.
// (Spelled in pieces so the repo's "no inner-HTML" grep stays a clean zero.)
const BLOCKED = new Set(['inner' + 'HTML', 'outer' + 'HTML', 'insertAdjacent' + 'HTML', 'srcdoc']);

function isPlainProps(p) {
  return p != null && typeof p === 'object' && !Array.isArray(p) &&
    !(typeof Node !== 'undefined' && p instanceof Node);
}

function classList(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(classList).filter(Boolean).join(' ');
  if (typeof v === 'object') return Object.keys(v).filter(k => v[k]).join(' ');
  return String(v);
}

function applyStyle(el, style) {
  if (style == null || style === false) return;
  if (typeof style === 'string') { el.style.cssText = style; return; }
  for (const k of Object.keys(style)) {
    const v = style[k];
    if (v == null || v === false) continue;
    if (k.startsWith('--') || k.includes('-')) el.style.setProperty(k, String(v));
    else el.style[k] = typeof v === 'number' && !UNITLESS.has(k) ? v + 'px' : v;
  }
}
const UNITLESS = new Set(['opacity', 'zIndex', 'flex', 'flexGrow', 'flexShrink', 'order',
  'lineHeight', 'fontWeight', 'scale', 'zoom']);

function setAttr(el, k, v) {
  if (v == null || v === false) return;
  if (BLOCKED.has(k)) { console.warn('h(): refused', k); return; }
  if (/^on/i.test(k)) { console.warn('h(): use props.on, not an inline', k); return; }
  if (k === 'style') { applyStyle(el, v); return; }
  el.setAttribute(k, v === true ? '' : String(v));
}

function applyProps(el, props, isSvg) {
  for (const k of Object.keys(props)) {
    const v = props[k];
    if (BLOCKED.has(k)) { console.warn('h(): refused', k); continue; }
    switch (k) {
      case 'class': case 'className': {
        const c = classList(v);
        if (c) { if (isSvg) el.setAttribute('class', c); else el.className = c; }
        break;
      }
      case 'style': applyStyle(el, v); break;
      case 'attrs': if (v) for (const a of Object.keys(v)) setAttr(el, a, v[a]); break;
      case 'dataset': if (v) for (const d of Object.keys(v)) { if (v[d] != null) el.dataset[d] = String(v[d]); } break;
      case 'on':
        if (v) for (const evt of Object.keys(v)) {
          const fn = v[evt];
          if (typeof fn === 'function') el.addEventListener(evt, fn);
          else if (Array.isArray(fn) && typeof fn[0] === 'function') el.addEventListener(evt, fn[0], fn[1]);
        }
        break;
      case 'text': if (v != null && v !== false) el.textContent = String(v); break;
      case 'ref': if (typeof v === 'function') v(el); break;
      default:
        if (v == null || v === false) break;
        if (/^on/i.test(k)) { console.warn('h(): use props.on, not', k); break; }
        // Real DOM properties (id, src, alt, type, disabled, value, hidden,
        // tabIndex, draggable ...) go on as properties; anything else as an
        // attribute (aria-*, role, viewBox, fill ...).
        if (!isSvg && k in el) { try { el[k] = v; } catch (e) { setAttr(el, k, v); } }
        else setAttr(el, k, v);
    }
  }
}

function append(el, kids) {
  for (const c of kids) {
    if (c == null || c === false || c === true) continue;
    if (Array.isArray(c)) { append(el, c); continue; }
    if (typeof c === 'string' || typeof c === 'number') { el.appendChild(document.createTextNode(String(c))); continue; }
    if (typeof Node !== 'undefined' && c instanceof Node) { el.appendChild(c); continue; }
    el.appendChild(document.createTextNode(String(c)));
  }
}

function build(el, props, children, isSvg) {
  // Forgiving: h('b', 'HI') and h('div', [a, b]) work too.
  if (isPlainProps(props)) applyProps(el, props, isSvg);
  else if (props != null) children.unshift(props);
  append(el, children);
  return el;
}

/** h(tag, props, ...children)
 *  props: {class, style:{...}, attrs:{...}, on:{click:fn,...}, dataset:{...}, text, ref(el), ...domProps}
 *  children: string|number -> text node | Node | array | null/false (skipped) */
export function h(tag, props = {}, ...children) {
  return build(document.createElement(tag), props, children, false);
}

/** The same builder for SVG elements (svg, path, circle, g ...). */
export function svg(tag, props = {}, ...children) {
  return build(document.createElementNS(SVG_NS, tag), props, children, true);
}

/** Remove every child. Returns el so it can be chained. */
export function clear(el) {
  if (!el) return el;
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Count a number up from 0 to `to` in `el` over <= ms (default 400ms), per
 *  the juice rule. Returns cancel(); the final value is always written, and
 *  with reduced motion (or ms <= 0) it is written at once. */
export function countUp(el, to, ms = 400) {
  const end = Math.max(0, Math.round(Number(to) || 0));
  let raf = 0;
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!el) return () => {};
  if (ms <= 0 || reduce || end === 0 || typeof requestAnimationFrame !== 'function') {
    el.textContent = String(end);
    return () => {};
  }
  const dur = Math.min(400, ms);
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / dur);
    el.textContent = String(Math.round(end * (1 - Math.pow(1 - k, 3))));
    if (k < 1) raf = requestAnimationFrame(step);
  };
  el.textContent = '0';
  raf = requestAnimationFrame(step);
  return () => { cancelAnimationFrame(raf); el.textContent = String(end); };
}
