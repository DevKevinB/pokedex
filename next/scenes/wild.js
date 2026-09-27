// ============================================================
// SPROUT ROAD: WILD GRASS (wild builder). A port of the classic
// EXPLORE mode (js/explore.js) onto Gabe's Road.
//
// Every BLOOMED chapter region grows tall grass in its own habitat
// (data/habitats.js maps chapter type -> habitat). One tuft is always
// rustling; tap it and a wild Pokemon from that habitat's pools jumps
// out (classic c/u/r/L weights, engine.wildLevel with the lead leash),
// then it's a wild battle. A shiny (1 in 64) glitters in its tuft before
// you tap. FARAWAY LAND opens after the Champion chapter blooms.
//
// Params:
//   { place: <chapterIdx> | 'faraway' }   walk straight into that grass
//   { chapter: <chapterIdx> }             same (alias)
//   {}                                    the WILD GRASS picker
//   { result, onEnd:'wild:<place>:<id>:<s>' }  back from the battle
// The battle hands onEnd back untouched, so the encounter rides on it.
// ============================================================

import { h, clear } from '../ui/h.js';
import { spriteImg } from '../ui/sprite.js';
import { sfx, cry } from '../audio/audio.js';
import * as music from '../audio/music.js';
import { wait } from '../core/pace.js';
import { rngFromUrl } from '../core/rng.js';
import { leadOf } from './together.js';
import { CHAPTERS, currentChapter, settleBerries, withBerries } from '../data/chapters.js';
import {
  FARAWAY_KEY, wildPlaces, parsePlace, placeOpen, habitatForPlace, rollWild,
  wildOnEnd, parseWildEnd
} from '../data/habitats.js';

const TUFTS = 9;
// Gifts waiting when we sent Gabe into a wild battle (same trick as the
// Road): the difference on the way back is the berries he ate.
let sentGifts = -1;

const play = (name, ...a) => { try { if (sfx && typeof sfx[name] === 'function') sfx[name](...a); } catch (e) { /* a sound never breaks a scene */ } };
const FARAWAY_SKY = { ground: '#9ad08a', sky: '#f6e4ff', accent: '#8e5fc4' };

export function mount(root, ctx) {
  const store = ctx.store;
  const params = ctx.params || {};
  const p = store.player();
  const pre = p.profile === 'prereader';
  const ac = new AbortController();
  const rng = rngFromUrl();
  let alive = true;
  let busy = false;

  // ---------------------------------------------------------- back from battle
  const back = parseWildEnd(params.onEnd);
  let celebrate = null;
  if (back) {
    let dirty = false;
    // Berries eaten in the fight leave Gabe's pouch too.
    if (!pre && sentGifts >= 0) {
      try { settleBerries(p, sentGifts, store.giftCount()); dirty = true; } catch (e) { /* the pouch self-clamps anyway */ }
    }
    sentGifts = -1;
    if (params.result === 'caught' && back.shiny && Array.isArray(p.caught) && p.caught.includes(back.id)) {
      if (!Array.isArray(p.shinies)) p.shinies = [];
      if (!p.shinies.includes(back.id)) { p.shinies.push(back.id); dirty = true; }
    }
    if (dirty) { try { store.commit(); } catch (e) { /* store reports its own failures */ } }
    if (params.result === 'caught' || params.result === 'win') celebrate = { ...back, result: params.result };
  }

  let place = back ? back.place : parsePlace(params.place ?? params.chapter);
  if (place != null && !placeOpen(p, place)) place = null;

  // batch 4: the roots' 🌿 button walks in with {home:'roots'}, so BACK goes back under the Tree.
  const homeScene = !pre && params.home === 'roots' ? 'roots' : pre ? 'garden' : 'road';
  const scene = h('div', { class: ['wild', { 'wild-pre': pre }], dataset: { scene: 'wild' } });
  root.appendChild(scene);

  try {
    if (typeof music.playMusic === 'function' && (music.TRACK_NAMES || []).includes('road')) music.playMusic('road');
  } catch (e) { /* music is a bonus */ }

  if (place == null) renderPicker(); else renderGrass(place);

  // ---------------------------------------------------------- the picker
  function renderPicker() {
    clear(scene);
    scene.dataset.view = 'picker';
    scene.classList.remove('wild-far');
    const places = wildPlaces(p);
    const cards = places.map(pl => placeCard(pl));
    // No region has bloomed yet: show the one he is working on, locked, so
    // the page is a promise and not an empty box.
    if (places.length === 1) {
      const ci = Math.min(currentChapter(p), CHAPTERS.length - 1);
      cards.unshift(placeCard({ place: ci, chapter: CHAPTERS[ci], habitat: habitatForPlace(ci), open: false }));
    }
    scene.append(
      h('div', { class: 'wild-top' },
        backBtn(() => ctx.go(homeScene)),
        h('div', { class: 'wild-title' }, h('span', { class: 'wild-title-emoji', attrs: { 'aria-hidden': 'true' } }, '🌿'), pre ? null : 'WILD GRASS')),
      h('div', { class: 'wild-places' }, cards));
  }

  function placeCard(pl) {
    const far = pl.place === FARAWAY_KEY;
    const pal = far ? FARAWAY_SKY : pl.chapter.palette;
    const card = h('button', {
      class: ['wild-card', { 'is-locked': !pl.open, 'is-far': far }], type: 'button',
      dataset: { place: String(pl.place), habitat: pl.habitat.key },
      attrs: { 'aria-label': far ? pl.habitat.name : pl.chapter.region },
      on: {
        click: () => {
          if (!alive || busy) return;
          if (!pl.open) {
            play('notYet');
            card.classList.remove('wiggle'); void card.offsetWidth; card.classList.add('wiggle');
            return;
          }
          play('tap');
          renderGrass(pl.place);
        }
      }
    },
    h('span', { class: 'wild-card-art', attrs: { 'aria-hidden': 'true' } },
      far ? null : h('span', { class: 'wild-card-ch' }, pl.chapter.emoji),
      h('span', { class: 'wild-card-hab' }, pl.habitat.emoji)),
    pre ? null : h('span', { class: 'wild-card-name' }, far ? pl.habitat.name : pl.chapter.region),
    pre || !pl.open ? null : h('span', { class: 'wild-card-sub' }, pl.habitat.name),
    pl.open ? null : h('span', { class: 'wild-card-lock', attrs: { 'aria-hidden': 'true' } }, far ? '👑🔒' : '🔒'));
    card.style.setProperty('--ground', pal.ground);
    card.style.setProperty('--sky-c', pal.sky);
    card.style.setProperty('--accent', pal.accent);
    return card;
  }

  // ---------------------------------------------------------- the grass
  function renderGrass(pl) {
    place = pl;
    const habitat = habitatForPlace(pl);
    const far = pl === FARAWAY_KEY;
    const ch = far ? null : CHAPTERS[pl];
    const pal = far ? FARAWAY_SKY : ch.palette;
    clear(scene);
    scene.dataset.view = 'grass';
    scene.dataset.place = String(pl);
    scene.dataset.habitat = habitat.key;
    scene.classList.toggle('wild-far', far);
    scene.style.setProperty('--ground', pal.ground);
    scene.style.setProperty('--sky-c', pal.sky);
    scene.style.setProperty('--accent', pal.accent);

    const several = wildPlaces(p).filter(x => x.open).length > 1;
    // A prereader's lead is his BULBA (battle.js always puts him first).
    const lead = pre ? leadOf(p).id : ((Array.isArray(p.team) && p.team[0]) || (Array.isArray(p.caught) && p.caught[0]) || 0);

    const tufts = [];
    const field = h('div', { class: 'wild-field' });
    for (let k = 0; k < TUFTS; k++) {
      const t = h('button', {
        class: 'wild-tuft', type: 'button', dataset: { i: k },
        attrs: { 'aria-label': 'GRASS' },
        on: { click: () => onTuft(k) }
      },
      h('span', { class: 'wild-blades', attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'wild-blades back', attrs: { 'aria-hidden': 'true' } }));
      tufts.push(t);
      field.append(t);
    }
    const pointer = h('span', { class: 'wild-pointer', attrs: { 'aria-hidden': 'true' } }, '👆');
    field.append(pointer);
    const hint = pre ? null : h('div', { class: 'wild-hint' }, 'TAP THE RUSTLING GRASS!');
    const celebrateLayer = h('div', { class: 'wild-party', hidden: true });

    scene.append(
      h('div', { class: ['wild-sky', 'bg-' + (habitat.bg || 'grass')], attrs: { 'aria-hidden': 'true' } },
        h('span', { class: 'wild-cloud c1' }), h('span', { class: 'wild-cloud c2' })),
      h('div', { class: 'wild-top' },
        backBtn(() => { if (several) renderPicker(); else ctx.go(homeScene); }),
        h('div', { class: 'wild-title' },
          h('span', { class: 'wild-title-emoji', attrs: { 'aria-hidden': 'true' } }, habitat.emoji),
          pre ? null : h('span', { class: 'wild-title-words' },
            h('span', { class: 'wild-title-name' }, habitat.name),
            ch ? h('span', { class: 'wild-title-sub' }, ch.region) : null))),
      h('div', { class: 'wild-meadow' }, field),
      h('div', { class: 'wild-bottom' },
        lead ? h('div', { class: 'wild-lead' }, spriteImg(lead, { class: 'wild-lead-sprite', shiny: !pre && (p.shinies || []).includes(lead) })) : null,
        hint),
      celebrateLayer);

    // One tuft rustles, holding a pre-rolled encounter (so a shiny can glitter).
    let enc = null;
    let hot = -1;
    function rustleNew(avoid = -1) {
      if (hot >= 0 && tufts[hot]) {
        tufts[hot].classList.remove('is-rustling', 'is-shiny', 'tier-rare', 'tier-legendary');
        tufts[hot].querySelectorAll('.wild-sparkle').forEach(s => s.remove());
      }
      enc = rollWild(pl, p, rng);
      let k = Math.floor(rng() * TUFTS);
      if (k === avoid) k = (k + 1 + Math.floor(rng() * (TUFTS - 1))) % TUFTS;
      hot = k;
      const t = tufts[k];
      t.classList.add('is-rustling');
      if (enc.tier === 'rare' || enc.tier === 'legendary') t.classList.add('tier-' + enc.tier);
      if (enc.shiny) {
        t.classList.add('is-shiny');
        t.append(...[0, 1, 2].map(i => h('span', { class: 'wild-sparkle s' + i, attrs: { 'aria-hidden': 'true' } }, '✨')));
      }
      scene.dataset.hot = String(k);
      scene.dataset.encounter = enc.id + ':' + enc.level + (enc.shiny ? ':s' : '');
      // The pointer (a prereader's only hint) hovers over the hot tuft.
      pointer.style.setProperty('--col', String(k % 3));
      pointer.style.setProperty('--row', String(Math.floor(k / 3)));
    }
    rustleNew();

    async function onTuft(k) {
      if (!alive || busy) return;
      const t = tufts[k];
      if (k !== hot) {
        // A quiet tuft just puffs some leaves. Nothing is lost by trying.
        play('tap');
        t.classList.remove('puff'); void t.offsetWidth; t.classList.add('puff');
        return;
      }
      busy = true;
      scene.classList.add('is-busy');
      const e = enc;
      play('shake');
      t.classList.add('is-shaking');
      await wait(500, { signal: ac.signal });
      if (!alive) return;
      t.classList.add('is-open');
      const pop = h('div', { class: ['wild-pop', 'tier-' + e.tier] },
        h('span', { class: 'wild-bang', attrs: { 'aria-hidden': 'true' } }, e.tier === 'legendary' ? '‼️' : '❗'),
        spriteImg(e.id, { class: 'wild-pop-sprite', shiny: e.shiny, animated: true }));
      t.append(pop);
      if (e.tier === 'legendary') play('phase2'); else if (e.tier === 'rare' || e.shiny) play('levelUp'); else play('ballThrow');
      cry(e.id);
      await wait(e.tier === 'legendary' ? 1300 : 900, { signal: ac.signal });
      if (!alive) return;
      // Counted when he walks into the fight (the classic 'explores' stat).
      try {
        if (!p.stats || typeof p.stats !== 'object') p.stats = {};
        p.stats.explores = (p.stats.explores | 0) + 1;
        store.commit();
      } catch (err) { /* never block the fight over a counter */ }
      const gifts = (() => { try { return store.giftCount(); } catch (err) { return 0; } })();
      sentGifts = pre ? -1 : gifts;
      const prm = {
        enemyTeam: [{ id: e.id, level: e.level }],
        trainer: null,
        wild: true,
        shiny: !!e.shiny,          // for the battle view to glitter the foe (see report)
        returnTo: 'wild',
        onEnd: wildOnEnd(pl, e.id, e.shiny)
      };
      alive = false;
      ctx.go('battle', pre ? prm : withBerries(p, gifts, prm));
    }

    // ------------------------------------------------ the little party
    if (celebrate && celebrate.place === pl) {
      const c = celebrate;
      celebrate = null;
      const shiny = (p.shinies || []).includes(c.id) && c.shiny;
      clear(celebrateLayer).append(h('div', { class: ['wild-party-card', c.result] },
        h('div', { class: 'wild-party-stars', attrs: { 'aria-hidden': 'true' } },
          [0, 1, 2].map(i => h('span', { class: 'wild-star', style: { '--i': i } }, '⭐'))),
        spriteImg(c.id, { class: 'wild-party-sprite', shiny, animated: true }),
        c.result === 'caught' ? h('span', { class: 'wild-party-ball', attrs: { 'aria-hidden': 'true' } }) : null,
        shiny ? h('span', { class: 'wild-party-shiny', attrs: { 'aria-hidden': 'true' } }, '✨') : null,
        pre ? null : h('div', { class: 'wild-party-words' }, c.result === 'caught' ? (shiny ? 'A SHINY! GOT IT!' : 'GOT IT!') : 'NICE WIN!')));
      celebrateLayer.hidden = false;
      play(c.result === 'caught' ? 'caught' : 'win');
      busy = true;
      (async () => {
        await wait(1600, { signal: ac.signal });
        if (!alive) return;
        celebrateLayer.classList.add('bye');
        await wait(250, { signal: ac.signal });
        if (!alive) return;
        celebrateLayer.hidden = true;
        busy = false;
      })();
    }
  }

  function backBtn(fn) {
    return h('button', {
      class: 'wild-back', type: 'button', attrs: { 'aria-label': 'BACK' },
      on: { click: () => { if (!alive) return; play('tap'); fn(); } }
    }, '◀');
  }

  return function unmount() {
    alive = false;
    ac.abort();
    try { if (typeof music.stopMusic === 'function') music.stopMusic(); } catch (e) { /* ignore */ }
    scene.remove();
  };
}
