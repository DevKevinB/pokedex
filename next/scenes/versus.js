// ============================================================
// SPROUT ROAD — COUCH VERSUS (one device, pass-and-play).
//
// The reader (his own team) against DAD (a grown-up picks 3 of all 649
// with a search box; they fight at the reader's top level). Each turn:
//   Bulbasaur CURTAIN (peeking) + the next player's sprite + PASS ▶
//   -> that player picks a move in secret -> curtain -> the other picks
//   -> both picks resolve together, in the open.
// The win card is a celebration for whoever won, and never mean: the
// other side is on it too, with a handshake. The tally goes to
// save.family.versus ('gabe' = the reader, 'dad' = the grown-up) and the
// reader's stats.versusWins.
//
// Built on createBattle: the reader is 'me', DAD is 'foe'. DAD's secret
// pick is played by lending his Pokemon a one-move list for that turn,
// so the factory's "committed foe move" is exactly the move DAD chose.
//
// params: { battler: 1|2 }
// ============================================================

import { h, clear } from '../ui/h.js';
import { spriteImg, ITEM } from '../ui/sprite.js';
import { sfx, cry } from '../audio/audio.js';
import * as music from '../audio/music.js';
import { wait } from '../core/pace.js';
import { rngFromUrl } from '../core/rng.js';
import { buildFighter, moveInfo, movesReady } from '../core/api.js';
import { createBattle } from '../battle/createBattle.js';
import { moveSeed } from '../data/engine.js';
import { typeEmoji, typeColors, inkFor } from '../data/config.js';
import { seatsFrom, teamSpec, topLevel, nameOf, battleProfile, BULBA_ID } from './together.js';
import { makeStage } from './family-table.js';

export const DAD_TEAM = 3;
const MAX_ID = 649;
const DAD_KEY = 'pokedexos_next_dadteam';     // a per-device convenience, NOT the save
const SUGGEST = [6, 9, 3, 25, 150, 149, 130, 94, 143, 248, 445, 448];

// All 649 species (PokeAPI names, dex order) for DAD's search box.
const NAMES_RAW = [
  'bulbasaur ivysaur venusaur charmander charmeleon charizard squirtle wartortle blastoise caterpie',
  'metapod butterfree weedle kakuna beedrill pidgey pidgeotto pidgeot rattata raticate spearow',
  'fearow ekans arbok pikachu raichu sandshrew sandslash nidoran-f nidorina nidoqueen nidoran-m',
  'nidorino nidoking clefairy clefable vulpix ninetales jigglypuff wigglytuff zubat golbat oddish',
  'gloom vileplume paras parasect venonat venomoth diglett dugtrio meowth persian psyduck golduck',
  'mankey primeape growlithe arcanine poliwag poliwhirl poliwrath abra kadabra alakazam machop',
  'machoke machamp bellsprout weepinbell victreebel tentacool tentacruel geodude graveler golem',
  'ponyta rapidash slowpoke slowbro magnemite magneton farfetchd doduo dodrio seel dewgong grimer',
  'muk shellder cloyster gastly haunter gengar onix drowzee hypno krabby kingler voltorb electrode',
  'exeggcute exeggutor cubone marowak hitmonlee hitmonchan lickitung koffing weezing rhyhorn rhydon',
  'chansey tangela kangaskhan horsea seadra goldeen seaking staryu starmie mr-mime scyther jynx',
  'electabuzz magmar pinsir tauros magikarp gyarados lapras ditto eevee vaporeon jolteon flareon',
  'porygon omanyte omastar kabuto kabutops aerodactyl snorlax articuno zapdos moltres dratini',
  'dragonair dragonite mewtwo mew chikorita bayleef meganium cyndaquil quilava typhlosion totodile',
  'croconaw feraligatr sentret furret hoothoot noctowl ledyba ledian spinarak ariados crobat',
  'chinchou lanturn pichu cleffa igglybuff togepi togetic natu xatu mareep flaaffy ampharos',
  'bellossom marill azumarill sudowoodo politoed hoppip skiploom jumpluff aipom sunkern sunflora',
  'yanma wooper quagsire espeon umbreon murkrow slowking misdreavus unown wobbuffet girafarig',
  'pineco forretress dunsparce gligar steelix snubbull granbull qwilfish scizor shuckle heracross',
  'sneasel teddiursa ursaring slugma magcargo swinub piloswine corsola remoraid octillery delibird',
  'mantine skarmory houndour houndoom kingdra phanpy donphan porygon2 stantler smeargle tyrogue',
  'hitmontop smoochum elekid magby miltank blissey raikou entei suicune larvitar pupitar tyranitar',
  'lugia ho-oh celebi treecko grovyle sceptile torchic combusken blaziken mudkip marshtomp swampert',
  'poochyena mightyena zigzagoon linoone wurmple silcoon beautifly cascoon dustox lotad lombre',
  'ludicolo seedot nuzleaf shiftry taillow swellow wingull pelipper ralts kirlia gardevoir surskit',
  'masquerain shroomish breloom slakoth vigoroth slaking nincada ninjask shedinja whismur loudred',
  'exploud makuhita hariyama azurill nosepass skitty delcatty sableye mawile aron lairon aggron',
  'meditite medicham electrike manectric plusle minun volbeat illumise roselia gulpin swalot',
  'carvanha sharpedo wailmer wailord numel camerupt torkoal spoink grumpig spinda trapinch vibrava',
  'flygon cacnea cacturne swablu altaria zangoose seviper lunatone solrock barboach whiscash',
  'corphish crawdaunt baltoy claydol lileep cradily anorith armaldo feebas milotic castform kecleon',
  'shuppet banette duskull dusclops tropius chimecho absol wynaut snorunt glalie spheal sealeo',
  'walrein clamperl huntail gorebyss relicanth luvdisc bagon shelgon salamence beldum metang',
  'metagross regirock regice registeel latias latios kyogre groudon rayquaza jirachi deoxys turtwig',
  'grotle torterra chimchar monferno infernape piplup prinplup empoleon starly staravia staraptor',
  'bidoof bibarel kricketot kricketune shinx luxio luxray budew roserade cranidos rampardos',
  'shieldon bastiodon burmy wormadam mothim combee vespiquen pachirisu buizel floatzel cherubi',
  'cherrim shellos gastrodon ambipom drifloon drifblim buneary lopunny mismagius honchkrow glameow',
  'purugly chingling stunky skuntank bronzor bronzong bonsly mime-jr happiny chatot spiritomb gible',
  'gabite garchomp munchlax riolu lucario hippopotas hippowdon skorupi drapion croagunk toxicroak',
  'carnivine finneon lumineon mantyke snover abomasnow weavile magnezone lickilicky rhyperior',
  'tangrowth electivire magmortar togekiss yanmega leafeon glaceon gliscor mamoswine porygon-z',
  'gallade probopass dusknoir froslass rotom uxie mesprit azelf dialga palkia heatran regigigas',
  'giratina cresselia phione manaphy darkrai shaymin arceus victini snivy servine serperior tepig',
  'pignite emboar oshawott dewott samurott patrat watchog lillipup herdier stoutland purrloin',
  'liepard pansage simisage pansear simisear panpour simipour munna musharna pidove tranquill',
  'unfezant blitzle zebstrika roggenrola boldore gigalith woobat swoobat drilbur excadrill audino',
  'timburr gurdurr conkeldurr tympole palpitoad seismitoad throh sawk sewaddle swadloon leavanny',
  'venipede whirlipede scolipede cottonee whimsicott petilil lilligant basculin sandile krokorok',
  'krookodile darumaka darmanitan maractus dwebble crustle scraggy scrafty sigilyph yamask',
  'cofagrigus tirtouga carracosta archen archeops trubbish garbodor zorua zoroark minccino cinccino',
  'gothita gothorita gothitelle solosis duosion reuniclus ducklett swanna vanillite vanillish',
  'vanilluxe deerling sawsbuck emolga karrablast escavalier foongus amoonguss frillish jellicent',
  'alomomola joltik galvantula ferroseed ferrothorn klink klang klinklang tynamo eelektrik',
  'eelektross elgyem beheeyem litwick lampent chandelure axew fraxure haxorus cubchoo beartic',
  'cryogonal shelmet accelgor stunfisk mienfoo mienshao druddigon golett golurk pawniard bisharp',
  'bouffalant rufflet braviary vullaby mandibuzz heatmor durant deino zweilous hydreigon larvesta',
  'volcarona cobalion terrakion virizion tornadus thundurus reshiram zekrom landorus kyurem keldeo',
  'meloetta genesect'
].join(' ');
export const SPECIES = NAMES_RAW.split(' ');          // SPECIES[id - 1]

const play = (name, ...a) => { try { const f = sfx && sfx[name]; if (typeof f === 'function') f(...a); } catch (e) { /* silent */ } };
const safeCry = id => { try { cry(id); } catch (e) { /* silent */ } };
const moveLabel = name => String(name || '').replace(/-/g, ' ').toUpperCase();
const isId = n => Number.isInteger(n) && n >= 1 && n <= MAX_ID;
const restart = (node, cls) => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };

/** 'mr-mime' -> 'MR MIME' */
export const speciesName = id => (isId(id) ? SPECIES[id - 1].replace(/-/g, ' ').toUpperCase() : '');

/** DAD's search: a dex number, or any part of a name. Up to `limit` ids. Pure. */
export function searchSpecies(q, limit = 12) {
  const s = String(q || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!s) return SUGGEST.slice(0, limit);
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return isId(n) ? [n] : [];
  }
  const starts = [], has = [];
  SPECIES.forEach((name, i) => {
    const flat = name.replace(/[^a-z0-9]/g, '');
    if (flat.startsWith(s)) starts.push(i + 1);
    else if (flat.includes(s)) has.push(i + 1);
  });
  return starts.concat(has).slice(0, limit);
}

function loadDad() {
  try {
    const a = JSON.parse(globalThis.localStorage.getItem(DAD_KEY) || '[]');
    return Array.isArray(a) ? a.filter(isId).slice(0, DAD_TEAM) : [];
  } catch (e) { return []; }
}
function keepDad(ids) { try { globalThis.localStorage.setItem(DAD_KEY, JSON.stringify(ids)); } catch (e) { /* not fatal */ } }

export function mount(root, ctx) {
  const { store } = ctx;
  const seats = seatsFrom(store.save, ctx.params || {});
  const gabeN = seats.battler;
  const R = () => store.save.players[gabeN];
  const gabeName = nameOf(store.save, gabeN);
  const level = topLevel(R());
  // seatsFrom never seats a prereader over a reader; if BOTH are prereaders
  // he still battles under Junior rules (never faints, calm, no words).
  const profile = battleProfile(store.save, gabeN);
  const pre = profile === 'prereader';
  let rng;
  try { rng = rngFromUrl(); } catch (e) { rng = Math.random; }

  let alive = true;
  let battle = null;
  let dadTeam = loadDad();
  const picks = { me: null, foe: null };
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const pause = async ms => { await wait(ms, { signal: ac && ac.signal }); return alive; };

  const stage = makeStage({
    calm: pre, words: !pre, pause,
    shinyOf: (side, id) => side === 'me' && (R().shinies || []).includes(id),
    nickOf: (side, id) => (side === 'me' ? (R().nicks || {})[id] : null),
  });
  const ui = {};
  const el = h('div', { class: 'vs', dataset: { scene: 'versus' } },
    h('button', {
      class: 'vs-home', type: 'button', attrs: { 'aria-label': 'HOME' },
      on: { click: () => { play('tap'); leave('who'); } }
    }, '⌂'),
    stage.field,
    ui.controls = h('div', { class: 'vs-controls' }),
    ui.layer = h('div', { class: 'vs-layer', hidden: true }));
  root.appendChild(el);

  // A tap that finished the last screen must not also press the button that
  // appears under the same finger.
  let shownAt = 0;
  const fresh = e => !e || e.detail === 0 || performance.now() - shownAt > 250;
  const guard = fn => e => { if (fresh(e)) fn(e); };

  function layer(...kids) {
    clear(ui.layer).append(...kids.flat().filter(Boolean));
    ui.layer.hidden = false;
    shownAt = performance.now();
    restart(ui.layer, 'open');
  }
  function hideLayer() { ui.layer.hidden = true; clear(ui.layer); ui.layer.className = 'vs-layer'; }

  // ---------------------------------------------------------- DAD picks a team
  function setup() {
    try { music.stopMusic(); } catch (e) { /* ignore */ }
    clear(ui.controls);
    const slots = h('div', { class: 'vs-dad-slots' });
    const results = h('div', { class: 'vs-dad-results' });
    const input = h('input', {
      class: 'vs-dad-search', type: 'search',
      attrs: { placeholder: 'NAME OR NUMBER', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', 'aria-label': 'SEARCH', maxlength: '20' },
      on: { input: () => drawResults() }
    });
    const go = h('button', {
      class: 'btn btn-go vs-dad-go', type: 'button', disabled: true,
      on: { click: guard(() => { if (dadTeam.length !== DAD_TEAM) return; play('tap'); keepDad(dadTeam); start(); }) }
    }, 'FIGHT \u25B6\uFE0E');

    function drawSlots() {
      clear(slots);
      for (let i = 0; i < DAD_TEAM; i++) {
        const id = dadTeam[i];
        slots.appendChild(h('button', {
          class: ['vs-dad-slot', { on: id != null }], type: 'button', disabled: id == null,
          attrs: { 'aria-label': id != null ? speciesName(id) : 'EMPTY' },
          on: { click: () => { if (id == null) return; play('tap'); dadTeam.splice(i, 1); drawSlots(); } }
        }, id != null ? [spriteImg(id, { class: 'vs-dad-sprite' }), h('span', { class: 'vs-dad-x', attrs: { 'aria-hidden': 'true' } }, '✖')] : String(i + 1)));
      }
      go.disabled = dadTeam.length !== DAD_TEAM;
    }
    function drawResults() {
      clear(results);
      for (const id of searchSpecies(input.value, 12)) {
        results.appendChild(h('button', {
          class: 'vs-dad-pick', type: 'button', dataset: { id },
          attrs: { 'aria-label': speciesName(id) },
          on: { click: () => { if (dadTeam.length >= DAD_TEAM) return; play('tap'); dadTeam.push(id); drawSlots(); } }
        }, spriteImg(id, { class: 'vs-dad-sprite', lazy: true }), h('span', { class: 'vs-dad-name' }, speciesName(id))));
      }
      if (!results.firstChild) results.appendChild(h('div', { class: 'vs-dad-none', attrs: { 'aria-hidden': 'true' } }, '🔍 ?'));
    }
    const random = h('button', {
      class: 'btn vs-dad-random', type: 'button',
      on: {
        click: () => {
          play('tap');
          while (dadTeam.length < DAD_TEAM) dadTeam.push(1 + Math.floor(rng() * MAX_ID));
          drawSlots();
        }
      }
    }, '🎲');

    layer(h('div', { class: 'vs-dad panel', attrs: { role: 'dialog', 'aria-label': "DAD'S TEAM" } },
      h('div', { class: 'vs-dad-head' },
        h('span', { class: 'vs-dad-title' }, "DAD'S TEAM"),
        h('span', { class: 'vs-dad-lv' }, 'Lv' + level)),
      slots,
      h('div', { class: 'vs-dad-row' }, input, random),
      results,
      h('div', { class: 'vs-dad-actions' },
        h('button', { class: 'btn vs-dad-back', type: 'button', on: { click: () => { play('tap'); leave('together', seats); } } }, '\u25C0\uFE0E'),
        go)));
    ui.layer.classList.add('vs-layer-setup');
    drawSlots();
    drawResults();
  }

  // ---------------------------------------------------------- the fight
  async function start() {
    hideLayer();
    layer(h('div', { class: 'vs-loading' }, h('img', { class: 'vs-loading-ball', src: ITEM('poke-ball'), alt: '', draggable: false })));
    try {
      try { await movesReady; } catch (e) { /* buildFighter copes */ }
      const mine = teamSpec(R());
      const [myTeam, foeTeam] = await Promise.all([
        Promise.all(mine.map(m => buildFighter(m.id, m.level, { seed: moveSeed(gabeN, m.id) }))),
        Promise.all(dadTeam.map(id => buildFighter(id, level, { seed: moveSeed(7, id, level) })))
      ]);
      if (!alive) return;
      battle = createBattle({ myTeam, enemyTeam: foeTeam, profile, rng, moveLookup: moveInfo, wild: false, leader: false });
    } catch (err) {
      if (!alive) return;
      console.warn('versus: could not start', err);
      layer(h('div', { class: 'vs-loading' }, h('button', {
        class: 'btn', type: 'button', attrs: { 'aria-label': 'BACK' }, on: { click: () => setup() }
      }, '\u25C0\uFE0E')));
      return;
    }
    try { music.playMusic('battle'); } catch (e) { /* bonus */ }
    stage.show('foe', battle.state.foe.team[0]);
    stage.show('me', battle.state.me.team[0]);
    el.dataset.ready = '1';
    safeCry(battle.state.foe.team[0].id);
    curtain('me');
  }

  const active = side => battle.state[side].team[battle.state[side].active];
  const sideName = side => (side === 'me' ? gabeName : 'DAD');

  // Bulbasaur peeks over a leafy curtain; the next player's Pokemon waits.
  function curtain(side) {
    clear(ui.controls);
    const f = active(side);
    layer(h('div', { class: ['vs-curtain', 'vs-for-' + side], dataset: { side } },
      h('div', { class: 'vs-curtain-leaves', attrs: { 'aria-hidden': 'true' } }),
      h('div', { class: 'vs-curtain-who' },
        spriteImg(f.id, { animated: true, shiny: side === 'me' && (R().shinies || []).includes(f.id), class: 'vs-curtain-sprite' }),
        h('span', { class: 'vs-curtain-name' }, sideName(side))),
      h('button', {
        class: 'vs-pass', type: 'button', attrs: { 'aria-label': 'PASS' },
        on: { click: guard(() => { play('tap'); hideLayer(); pickScreen(side); }) }
      }, 'PASS \u25B6\uFE0E'),
      h('div', { class: 'vs-peek', attrs: { 'aria-hidden': 'true' } }, spriteImg(BULBA_ID, { animated: true, class: 'vs-peek-sprite' }))));
    ui.layer.classList.add('vs-layer-curtain');
  }

  // One player's secret pick: his Pokemon's moves, nobody else's.
  function pickScreen(side) {
    const f = active(side);
    shownAt = performance.now();
    clear(ui.controls).append(
      h('div', { class: ['vs-picker', 'vs-for-' + side] },
        h('div', { class: 'vs-picker-who' },
          spriteImg(f.id, { class: 'vs-picker-sprite' }),
          h('span', { class: 'vs-picker-name' }, sideName(side))),
        h('div', { class: 'vs-moves' },
          f.moves.map((m, i) => {
            const bg = typeColors[m.type] || typeColors.normal;
            return h('button', {
              class: ['vs-move', `t-${m.type}`], type: 'button',
              style: { '--tc': bg, '--ink': inkFor(bg) },
              attrs: { 'aria-label': moveLabel(m.name) },
              on: { click: guard(() => chose(side, i)) }
            },
            h('span', { class: 'vs-move-emoji', attrs: { 'aria-hidden': 'true' } }, typeEmoji[m.type] || typeEmoji.normal),
            h('span', { class: 'vs-move-name' }, moveLabel(m.name)));
          }))));
  }

  function chose(side, i) {
    if (!alive || !battle || battle.state.over) return;
    play('tap');
    picks[side] = i;
    clear(ui.controls);
    if (side === 'me') curtain('foe');
    else resolve();
  }

  async function resolve() {
    const foe = active('foe');
    const saved = foe.moves;
    foe.moves = [saved[picks.foe] || saved[0]];
    let events;
    try { events = await battle.choose({ kind: 'move', index: picks.me | 0 }); }
    finally { foe.moves = saved; }
    picks.me = picks.foe = null;
    let endEv = null;
    for (const e of events) {
      if (!alive) return;
      if (e.type === 'end') { endEv = e; continue; }
      if (!await stage.playEvent(e, battle)) return;
    }
    if (!alive) return;
    if (endEv) { finish(endEv); return; }
    curtain('me');
  }

  // ---------------------------------------------------------- the win card
  function finish(ev) {
    const gabeWon = ev.winner === 'me';
    const r = R();
    if (gabeWon) { r.stats = r.stats || {}; r.stats.versusWins = (r.stats.versusWins | 0) + 1; }
    const tally = store.addVersusWin(gabeWon ? 'gabe' : 'dad') || store.save.family.versus;
    play('win');
    const winSide = gabeWon ? 'me' : 'foe';
    const hero = battle.state[winSide].team.find(f => !f.fainted) || battle.state[winSide].team[0];
    layer(h('div', { class: ['vs-win', 'vs-win-' + winSide] },
      h('div', { class: 'vs-confetti', attrs: { 'aria-hidden': 'true' } },
        Array.from({ length: 10 }, (_, i) => h('span', { style: { '--i': i } }, i % 2 ? '🎉' : '⭐'))),
      h('div', { class: 'vs-win-crown', attrs: { 'aria-hidden': 'true' } }, '👑'),
      spriteImg(hero.id, { animated: true, class: 'vs-win-sprite' }),
      h('div', { class: 'vs-win-words' }, sideName(winSide) + ' WINS!'),
      h('div', { class: 'vs-win-shake' },
        spriteImg(battle.state.me.team[0].id, { class: 'vs-win-mini' }),
        h('span', { attrs: { 'aria-hidden': 'true' } }, '🤝'),
        spriteImg(battle.state.foe.team[0].id, { class: 'vs-win-mini' })),
      h('div', { class: 'vs-win-sub' }, 'GOOD GAME!'),
      h('div', { class: 'vs-tally' },
        h('span', { class: 'vs-tally-me' }, gabeName + ' ' + ((tally && tally.gabe) | 0)),
        h('span', { class: 'vs-tally-foe' }, 'DAD ' + ((tally && tally.dad) | 0))),
      h('div', { class: 'vs-win-actions' },
        h('button', { class: 'vs-win-btn', type: 'button', attrs: { 'aria-label': 'HOME' }, on: { click: guard(() => { play('tap'); leave('who'); }) } }, '⌂'),
        h('button', { class: 'vs-win-btn vs-again', type: 'button', attrs: { 'aria-label': 'AGAIN' }, on: { click: guard(() => { play('tap'); start(); }) } }, '⟳'),
        h('button', {
          class: 'vs-win-btn vs-next', type: 'button', attrs: { 'aria-label': 'NEXT' },
          on: { click: guard(() => { play('tap'); leave('postcard', { returnTo: 'together', returnParams: { battler: gabeN, helper: gabeN === 1 ? 2 : 1 }, highlight: hero.id, from: 'versus', result: gabeWon ? 'gabe' : 'dad' }); }) }
        }, '\u25B6\uFE0E'))));
    ui.layer.classList.add('vs-layer-win');
    safeCry(hero.id);
  }

  function leave(name, params) {
    if (!alive) return;
    alive = false;
    ctx.go(name, params || {});
  }

  setup();

  return function unmount() {
    alive = false;
    if (ac) ac.abort();
    try { music.stopMusic(); } catch (e) { /* ignore */ }
    clear(root);
  };
}
