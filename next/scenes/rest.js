// ============================================================
// SPROUT ROAD: the campfire REST scene at the end of a chapter.
// Dusk, a flickering fire, Gabe's lead Pokemon keeping watch and
// a Bulbasaur fast asleep. Calm music. Nothing auto-advances: the
// only ways out are KEEP GOING and HOME.
// ============================================================

import { h } from '../ui/h.js';
import { spriteImg } from '../ui/sprite.js';
import { sfx } from '../audio/audio.js';
import * as music from '../audio/music.js';
import { CHAPTERS } from '../data/chapters.js';

const BULBA_ID = 1;
const play = name => { try { if (sfx && typeof sfx[name] === 'function') sfx[name](); } catch (e) { /* silent */ } };

function leadId(p) {
  const team = p && Array.isArray(p.team) ? p.team : [];
  const caught = p && Array.isArray(p.caught) ? p.caught : [];
  const id = Number(team[0] || caught[0] || 25);
  return Number.isFinite(id) && id > 0 ? id : 25;
}

export function mount(root, ctx) {
  const p = ctx.store.player();
  const params = ctx.params || {};
  const ci = Number.isInteger(params.chapter) && CHAPTERS[params.chapter] ? params.chapter : -1;
  const ch = ci >= 0 ? CHAPTERS[ci] : null;
  const lead = leadId(p);
  const pre = p.profile === 'prereader';     // pictures only for a prereader

  // Calm music. music.js is the shell's port of the classic chiptune; ask for
  // a 'rest' track and fall back to the gentle dex theme if it has none.
  try {
    if (typeof music.playMusic === 'function') {
      const names = Array.isArray(music.TRACK_NAMES) ? music.TRACK_NAMES : ['rest'];
      music.playMusic(names.includes('rest') ? 'rest' : 'dex');
    }
  } catch (e) { /* music is a bonus */ }

  const stars = h('div', { class: 'rest-stars', attrs: { 'aria-hidden': 'true' } },
    Array.from({ length: 14 }, (_, k) => h('span', { class: 'rest-star s' + (k % 4) })));

  const fire = h('div', { class: 'rest-fire', attrs: { 'aria-hidden': 'true' } },
    h('div', { class: 'fire-glow' }),
    h('div', { class: 'fire-flame f1' }),
    h('div', { class: 'fire-flame f2' }),
    h('div', { class: 'fire-flame f3' }),
    h('div', { class: 'fire-logs' }, h('span', { class: 'log l1' }), h('span', { class: 'log l2' })),
    h('div', { class: 'fire-sparks' }, h('span', { class: 'spark k1' }), h('span', { class: 'spark k2' }), h('span', { class: 'spark k3' })));

  const watcher = h('div', { class: 'rest-mon rest-lead' }, spriteImg(lead, { class: 'rest-sprite' }));
  const sleeper = h('div', { class: 'rest-mon rest-bulba' },
    spriteImg(BULBA_ID, { class: 'rest-sprite' }),
    h('div', { class: 'rest-zzz', attrs: { 'aria-hidden': 'true' } },
      h('span', { class: 'z z1' }, 'Z'), h('span', { class: 'z z2' }, 'Z'), h('span', { class: 'z z3' }, 'Z')));

  const camp = h('div', { class: 'rest-camp' }, watcher, fire, sleeper);

  const banner = h('div', { class: 'rest-banner' },
    ch ? h('div', { class: 'rest-badge' }, ch.emoji) : null,
    pre ? null : h('div', { class: 'rest-title' }, 'TIME TO REST'),
    ch && !pre ? h('div', { class: 'rest-sub' }, ch.region + ' IS BLOOMING!') : null);

  const keepGoing = h('button', {
    class: 'rest-btn rest-go', type: 'button',
    on: { click: () => { play('tap'); ctx.go('road'); } }
  }, pre ? '\u25B6\uFE0E' : 'KEEP GOING \u25B6\uFE0E');
  const home = h('button', {
    class: 'rest-btn rest-home', type: 'button',
    on: { click: () => { play('tap'); ctx.go('who'); } }
  }, pre ? '⌂' : 'HOME ⌂');

  const scene = h('div', { class: ['rest', pre && 'rest-pre'], dataset: { scene: 'rest' } },
    stars,
    h('div', { class: 'rest-moon', attrs: { 'aria-hidden': 'true' } }),
    h('div', { class: 'rest-hills', attrs: { 'aria-hidden': 'true' } }),
    banner,
    camp,
    h('div', { class: 'rest-actions' }, keepGoing, home));
  if (ch) {
    scene.style.setProperty('--accent', ch.palette.accent);
    scene.style.setProperty('--ground', ch.palette.ground);
  }
  root.appendChild(scene);

  return function unmount() {
    try { if (typeof music.stopMusic === 'function') music.stopMusic(); } catch (e) { /* ignore */ }
    scene.remove();
  };
}
