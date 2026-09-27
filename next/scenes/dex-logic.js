// ============================================================
// SPROUT ROAD: the pure half of the Pokedex and the Team editor.
// No DOM, no store, no network: every function takes plain data and
// returns plain data, so node --test can cover all of it
// (next/test/dex.test.mjs). scenes/dex.js and scenes/team.js are the
// only callers.
//
// The 649 species names are baked in below (from PokeAPI
// /pokemon-species?limit=649, in dex order) so search is instant and
// works offline, with no extra request and no new host.
// ============================================================

import { cleanName } from '../core/validate.js';
import { xpProgress, DEFAULT_LEVEL } from '../data/engine.js';

export const MAX_ID = 649;
export const MAX_TEAM = 6;
export const MAX_FAVORITES = 6;
export const NICK_MAX = 10;

// prettier-ignore
const NAME_TEXT =
  'bulbasaur ivysaur venusaur charmander charmeleon charizard squirtle wartortle blastoise caterpie ' +
  'metapod butterfree weedle kakuna beedrill pidgey pidgeotto pidgeot rattata raticate spearow fearow ' +
  'ekans arbok pikachu raichu sandshrew sandslash nidoran-f nidorina nidoqueen nidoran-m nidorino ' +
  'nidoking clefairy clefable vulpix ninetales jigglypuff wigglytuff zubat golbat oddish gloom ' +
  'vileplume paras parasect venonat venomoth diglett dugtrio meowth persian psyduck golduck mankey ' +
  'primeape growlithe arcanine poliwag poliwhirl poliwrath abra kadabra alakazam machop machoke machamp ' +
  'bellsprout weepinbell victreebel tentacool tentacruel geodude graveler golem ponyta rapidash ' +
  'slowpoke slowbro magnemite magneton farfetchd doduo dodrio seel dewgong grimer muk shellder cloyster ' +
  'gastly haunter gengar onix drowzee hypno krabby kingler voltorb electrode exeggcute exeggutor cubone ' +
  'marowak hitmonlee hitmonchan lickitung koffing weezing rhyhorn rhydon chansey tangela kangaskhan ' +
  'horsea seadra goldeen seaking staryu starmie mr-mime scyther jynx electabuzz magmar pinsir tauros ' +
  'magikarp gyarados lapras ditto eevee vaporeon jolteon flareon porygon omanyte omastar kabuto ' +
  'kabutops aerodactyl snorlax articuno zapdos moltres dratini dragonair dragonite mewtwo mew chikorita ' +
  'bayleef meganium cyndaquil quilava typhlosion totodile croconaw feraligatr sentret furret hoothoot ' +
  'noctowl ledyba ledian spinarak ariados crobat chinchou lanturn pichu cleffa igglybuff togepi togetic ' +
  'natu xatu mareep flaaffy ampharos bellossom marill azumarill sudowoodo politoed hoppip skiploom ' +
  'jumpluff aipom sunkern sunflora yanma wooper quagsire espeon umbreon murkrow slowking misdreavus ' +
  'unown wobbuffet girafarig pineco forretress dunsparce gligar steelix snubbull granbull qwilfish ' +
  'scizor shuckle heracross sneasel teddiursa ursaring slugma magcargo swinub piloswine corsola ' +
  'remoraid octillery delibird mantine skarmory houndour houndoom kingdra phanpy donphan porygon2 ' +
  'stantler smeargle tyrogue hitmontop smoochum elekid magby miltank blissey raikou entei suicune ' +
  'larvitar pupitar tyranitar lugia ho-oh celebi treecko grovyle sceptile torchic combusken blaziken ' +
  'mudkip marshtomp swampert poochyena mightyena zigzagoon linoone wurmple silcoon beautifly cascoon ' +
  'dustox lotad lombre ludicolo seedot nuzleaf shiftry taillow swellow wingull pelipper ralts kirlia ' +
  'gardevoir surskit masquerain shroomish breloom slakoth vigoroth slaking nincada ninjask shedinja ' +
  'whismur loudred exploud makuhita hariyama azurill nosepass skitty delcatty sableye mawile aron ' +
  'lairon aggron meditite medicham electrike manectric plusle minun volbeat illumise roselia gulpin ' +
  'swalot carvanha sharpedo wailmer wailord numel camerupt torkoal spoink grumpig spinda trapinch ' +
  'vibrava flygon cacnea cacturne swablu altaria zangoose seviper lunatone solrock barboach whiscash ' +
  'corphish crawdaunt baltoy claydol lileep cradily anorith armaldo feebas milotic castform kecleon ' +
  'shuppet banette duskull dusclops tropius chimecho absol wynaut snorunt glalie spheal sealeo walrein ' +
  'clamperl huntail gorebyss relicanth luvdisc bagon shelgon salamence beldum metang metagross regirock ' +
  'regice registeel latias latios kyogre groudon rayquaza jirachi deoxys turtwig grotle torterra ' +
  'chimchar monferno infernape piplup prinplup empoleon starly staravia staraptor bidoof bibarel ' +
  'kricketot kricketune shinx luxio luxray budew roserade cranidos rampardos shieldon bastiodon burmy ' +
  'wormadam mothim combee vespiquen pachirisu buizel floatzel cherubi cherrim shellos gastrodon ambipom ' +
  'drifloon drifblim buneary lopunny mismagius honchkrow glameow purugly chingling stunky skuntank ' +
  'bronzor bronzong bonsly mime-jr happiny chatot spiritomb gible gabite garchomp munchlax riolu ' +
  'lucario hippopotas hippowdon skorupi drapion croagunk toxicroak carnivine finneon lumineon mantyke ' +
  'snover abomasnow weavile magnezone lickilicky rhyperior tangrowth electivire magmortar togekiss ' +
  'yanmega leafeon glaceon gliscor mamoswine porygon-z gallade probopass dusknoir froslass rotom uxie ' +
  'mesprit azelf dialga palkia heatran regigigas giratina cresselia phione manaphy darkrai shaymin ' +
  'arceus victini snivy servine serperior tepig pignite emboar oshawott dewott samurott patrat watchog ' +
  'lillipup herdier stoutland purrloin liepard pansage simisage pansear simisear panpour simipour munna ' +
  'musharna pidove tranquill unfezant blitzle zebstrika roggenrola boldore gigalith woobat swoobat ' +
  'drilbur excadrill audino timburr gurdurr conkeldurr tympole palpitoad seismitoad throh sawk sewaddle ' +
  'swadloon leavanny venipede whirlipede scolipede cottonee whimsicott petilil lilligant basculin ' +
  'sandile krokorok krookodile darumaka darmanitan maractus dwebble crustle scraggy scrafty sigilyph ' +
  'yamask cofagrigus tirtouga carracosta archen archeops trubbish garbodor zorua zoroark minccino ' +
  'cinccino gothita gothorita gothitelle solosis duosion reuniclus ducklett swanna vanillite vanillish ' +
  'vanilluxe deerling sawsbuck emolga karrablast escavalier foongus amoonguss frillish jellicent ' +
  'alomomola joltik galvantula ferroseed ferrothorn klink klang klinklang tynamo eelektrik eelektross ' +
  'elgyem beheeyem litwick lampent chandelure axew fraxure haxorus cubchoo beartic cryogonal shelmet ' +
  'accelgor stunfisk mienfoo mienshao druddigon golett golurk pawniard bisharp bouffalant rufflet ' +
  'braviary vullaby mandibuzz heatmor durant deino zweilous hydreigon larvesta volcarona cobalion ' +
  'terrakion virizion tornadus thundurus reshiram zekrom landorus kyurem keldeo meloetta genesect ';
/** API names, index = dex id (index 0 is ''). */
export const API_NAMES = ['', ...NAME_TEXT.trim().split(/\s+/)];

const SPECIAL_NAMES = {
  'nidoran-f': 'NIDORAN♀', 'nidoran-m': 'NIDORAN♂', 'mr-mime': 'MR. MIME', 'mime-jr': 'MIME JR.',
  farfetchd: "FARFETCH'D", 'ho-oh': 'HO-OH', 'porygon-z': 'PORYGON-Z',
};
/** Same display rules as core/api.js displayName(). */
export function displayName(apiName) {
  const n = String(apiName || '').toLowerCase();
  if (SPECIAL_NAMES[n]) return SPECIAL_NAMES[n];
  return n.replace(/[^a-z0-9-]/g, '').replace(/-/g, ' ').toUpperCase().slice(0, 20);
}

export const isDexId = id => Number.isInteger(id) && id >= 1 && id <= MAX_ID;

/** 'PIKACHU' for 25; '#700' style for anything unknown. */
export function nameOf(id) {
  const n = Number(id);
  return isDexId(n) ? displayName(API_NAMES[n]) : '#' + String(n || 0).padStart(3, '0');
}
export const numOf = id => '#' + String(Number(id) || 0).padStart(3, '0');

// The generations wear their starter's face (classic pc.js STARTER_OF), so a
// tab is a picture, not "G3". id 0 is the ALL tab (a Poke Ball picture).
export const GENS = [
  { key: 0, from: 1, to: 649, pic: 0 },
  { key: 1, from: 1, to: 151, pic: 1 },
  { key: 2, from: 152, to: 251, pic: 152 },
  { key: 3, from: 252, to: 386, pic: 252 },
  { key: 4, from: 387, to: 493, pic: 387 },
  { key: 5, from: 494, to: 649, pic: 495 },
];
export const genOf = id => (GENS.slice(1).find(g => id >= g.from && id <= g.to) || GENS[0]).key;

const squash = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Search by name or number. '25', '#025', 'pika', 'mr mime' all work.
 * A pure number matches that id first, then ids that start with it.
 * Returns dex ids in a stable order (exact, then prefix, then contains).
 */
export function searchIds(query) {
  const raw = String(query == null ? '' : query).trim().slice(0, 30);
  if (!raw) return [];
  const digits = raw.replace(/^#/, '');
  if (/^\d{1,3}$/.test(digits)) {
    const n = Number(digits);
    const out = [];
    if (isDexId(n)) out.push(n);
    for (let id = 1; id <= MAX_ID; id++) {
      if (id !== n && String(id).startsWith(String(n))) out.push(id);
    }
    return out;
  }
  const q = squash(raw);
  if (!q) return [];
  const exact = [], prefix = [], inner = [];
  for (let id = 1; id <= MAX_ID; id++) {
    const nm = squash(API_NAMES[id]);
    if (nm === q) exact.push(id);
    else if (nm.startsWith(q)) prefix.push(id);
    else if (nm.includes(q)) inner.push(id);
  }
  return [...exact, ...prefix, ...inner];
}

const idSet = a => new Set(Array.isArray(a) ? a.map(Number).filter(isDexId) : []);

/**
 * The ids the grid shows.
 *   gen        0 = all, 1..5 = one generation
 *   query      reader search (ignored for a prereader)
 *   caught     the player's caught ids
 *   prereader  his caught ones go first (then the rest, in dex order)
 */
export function gridIds({ gen = 0, query = '', caught = [], prereader = false } = {}) {
  const g = GENS.find(x => x.key === gen) || GENS[0];
  let ids;
  if (!prereader && String(query || '').trim()) ids = searchIds(query);
  else {
    ids = [];
    for (let id = g.from; id <= g.to; id++) ids.push(id);
  }
  if (!prereader) return ids;
  // A prereader sees only what he owns: never a wall of silhouettes.
  const own = idSet(caught);
  return ids.filter(id => own.has(id));
}

/** Caught count within one generation (0 = all). */
export function genCount(gen, caught) {
  const g = GENS.find(x => x.key === gen) || GENS[0];
  let n = 0;
  for (const id of idSet(caught)) if (id >= g.from && id <= g.to) n++;
  return n;
}

// ---------------------------------------------------------------- one mon

export const owns = (p, id) => !!p && Array.isArray(p.caught) && p.caught.includes(id);
export const ownsShiny = (p, id) => owns(p, id) && Array.isArray(p.shinies) && p.shinies.includes(id);

/** {level, frac 0..1} for an owned mon (an owned mon with no record is level 5). */
export function levelInfo(p, id) {
  const m = p && p.mons && p.mons[id];
  const level = m && Number.isInteger(m.level) ? m.level : DEFAULT_LEVEL;
  const xp = m && Number.isFinite(m.xp) ? m.xp : 0;
  return { level, frac: xpProgress({ level, xp }) };
}

/** The name a boy sees: his nickname, else the species name. */
export function shownName(p, id) {
  const nick = p && p.nicks && typeof p.nicks[id] === 'string' ? p.nicks[id] : '';
  return nick || nameOf(id);
}

// ---------------------------------------------------------------- nickname

/** The in-app keypad: A-Z, then a space. Nothing else can be typed. */
export const KEYPAD = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ' '];

/** Cleaned exactly like core/validate cleanName, then held to 10 characters. */
export function cleanNick(s) {
  return cleanName(s).slice(0, NICK_MAX).trim();
}

/** Keypad state machine: returns the next draft (never longer than 10, no leading/double spaces). */
export function typeKey(draft, key) {
  const d = String(draft || '').slice(0, NICK_MAX);
  if (key === 'DEL') return d.slice(0, -1);
  if (key === 'CLR') return '';
  if (key === ' ' && (!d || d.endsWith(' '))) return d;
  if (d.length >= NICK_MAX) return d;
  if (key !== ' ' && !/^[A-Z]$/.test(key)) return d;
  return d + key;
}

/**
 * Write a nickname into p.nicks (mutates). An empty (or same-as-species)
 * name removes the nickname. Only for a mon he owns. -> the stored name or ''.
 */
export function setNick(p, id, raw) {
  if (!owns(p, id)) return '';
  if (!p.nicks || typeof p.nicks !== 'object') p.nicks = {};
  const n = cleanNick(raw);
  if (!n || n === nameOf(id)) { delete p.nicks[id]; return ''; }
  p.nicks[id] = n;
  return n;
}

// ---------------------------------------------------------------- favourites

export const isFav = (p, id) => !!p && Array.isArray(p.favorites) && p.favorites.includes(id);

/**
 * Star / unstar (mutates p.favorites). Only an owned mon can be starred.
 * -> 'on' | 'off' | 'full' (six already starred: nothing changes) | 'no'
 */
export function toggleFav(p, id) {
  if (!owns(p, id)) return 'no';
  if (!Array.isArray(p.favorites)) p.favorites = [];
  const i = p.favorites.indexOf(id);
  if (i >= 0) { p.favorites.splice(i, 1); return 'off'; }
  if (p.favorites.length >= MAX_FAVORITES) return 'full';
  p.favorites.push(id);
  return 'on';
}

/** Six are starred: put `id` in `out`'s place (same position). -> true when swapped. */
export function swapFav(p, out, id) {
  if (!owns(p, id) || !Array.isArray(p.favorites) || isFav(p, id)) return false;
  const i = p.favorites.indexOf(out);
  if (i < 0) return false;
  p.favorites[i] = id;
  return true;
}

// ---------------------------------------------------------------- team
// A team is a packed array (no gaps) of up to six owned ids; slot 0 is the
// LEAD. All helpers are pure and return a new array.

/** A clean copy: owned, unique, at most six. */
export function cleanTeam(team, caught) {
  const own = idSet(caught);
  return [...new Set((Array.isArray(team) ? team : []).map(Number))].filter(id => own.has(id)).slice(0, MAX_TEAM);
}

/**
 * Put `id` into `slot` (0..5).
 *  - id already on the team: the two slots swap (moving within the team)
 *  - slot holds someone: they are replaced (they go back to the box)
 *  - slot is empty: id joins at the end (the team stays packed)
 */
export function placeInTeam(team, slot, id, caught) {
  const t = cleanTeam(team, caught);
  if (!idSet(caught).has(id) || !(slot >= 0 && slot < MAX_TEAM)) return t;
  const at = t.indexOf(id);
  if (slot >= t.length) {
    if (at >= 0) return t;          // already on the team; an empty slot changes nothing
    t.push(id);
    return t;
  }
  if (at === slot) return t;
  if (at >= 0) { [t[at], t[slot]] = [t[slot], t[at]]; return t; }
  t[slot] = id;
  return t;
}

/** Swap two filled slots (a way to change the LEAD). */
export function swapSlots(team, a, b, caught) {
  const t = cleanTeam(team, caught);
  if (a === b || !(a >= 0 && a < t.length) || !(b >= 0 && b < t.length)) return t;
  [t[a], t[b]] = [t[b], t[a]];
  return t;
}

/** Take a slot's mon back to the box. The last team member can never be removed. */
export function removeFromTeam(team, slot, caught) {
  const t = cleanTeam(team, caught);
  if (t.length <= 1 || !(slot >= 0 && slot < t.length)) return t;
  t.splice(slot, 1);
  return t;
}

export const canRemove = (team, slot) => Array.isArray(team) && team.length > 1 && slot >= 0 && slot < team.length;

/** The box for the team editor: favourites first, then dex order. */
export function boxIds(p) {
  const caught = [...idSet(p && p.caught)].sort((a, b) => a - b);
  const favs = (p && Array.isArray(p.favorites) ? p.favorites : []).filter(id => caught.includes(id));
  const f = new Set(favs);
  return [...favs, ...caught.filter(id => !f.has(id))];
}

/** Where to go on BACK. Only a plain scene name survives; else home by profile. */
export function safeReturn(params, prereader) {
  const r = params && params.returnTo;
  if (typeof r === 'string' && /^[a-z][a-z-]{1,19}$/.test(r)) return r;
  return prereader ? 'garden' : 'road';
}
