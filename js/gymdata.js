// ============================================================
// Pokédex OS — Gym Circuit data: 58 trainers, fixed ladder Lv8→80
// 10 themed gyms (4 trainers + leader) → Victory Road → Elite Four
// → Champion. Beat a trainer to unlock the next; win = you catch
// their whole team.
// ============================================================

// level for gym g (0-based), slot i (0-3 trainers, 4 = leader)
const lv = (g, i) => 8 + g * 6 + (i === 4 ? 5 : i);
const T = (name, taunt, ids, level) => ({ name, taunt, team: ids.map(id => ({ id, level })) });

export const GYMS = [
  {
    key: 'rock', emoji: '🪨', name: 'BOULDER GYM', type: 'rock',
    trainers: [
      T('HIKER CARL', "These rocks don't roll — they CRUSH!", [74], lv(0, 0)),
      T('CAMPER SANDY', 'I found these two under a boulder!', [27, 524], lv(0, 1)),
      T('HIKER PETE', 'Rock solid, baby!', [185, 304], lv(0, 2)),
      T('RUIN MANIAC LEO', 'My fossils are old. My skills are TIMELESS.', [111, 524], lv(0, 3)),
      T('LEADER ROCKO', 'My Pokémon are harder than your homework!', [74, 95, 76], lv(0, 4))
    ]
  },
  {
    key: 'water', emoji: '🌊', name: 'CASCADE GYM', type: 'water',
    trainers: [
      T('SWIMMER FINN', 'You look all washed up!', [118, 129], lv(1, 0)),
      T('TUBER LILY', 'My rubber duck brought backup!', [54, 183], lv(1, 1)),
      T('SAILOR BARNEY', 'Anchors aweigh!', [116, 194, 550], lv(1, 2)),
      T('FISHERMAN GUS', 'You should SEA what I caught!', [7, 170, 339], lv(1, 3)),
      T('LEADER MARINA', 'Prepare to be swept away!', [121, 130, 9], lv(1, 4))
    ]
  },
  {
    key: 'electric', emoji: '⚡', name: 'THUNDER GYM', type: 'electric',
    trainers: [
      T('SCHOOLBOY WATT', 'I studied VOLTAGE for this!', [81, 179], lv(2, 0)),
      T('ENGINEER TESS', 'Fully charged and ready!', [100, 522], lv(2, 1)),
      T('ROCKER ZANE', 'Feel the THUNDER of my guitar!', [25, 309, 417], lv(2, 2)),
      T('GUITARIST NORA', 'This next song SHOCKS everyone!', [82, 403], lv(2, 3)),
      T('LEADER VOLT', 'You are in for a SHOCKING defeat!', [26, 125, 405], lv(2, 4))
    ]
  },
  {
    key: 'grass', emoji: '🌿', name: 'MEADOW GYM', type: 'grass',
    trainers: [
      T('PICNICKER MAY', 'My garden grows WINNERS!', [43, 191], lv(3, 0)),
      T('BUG CATCHER TIM', 'My bugs love your leafy team!', [11, 165], lv(3, 1)),
      T('GARDENER IVY', 'Time to weed out the competition!', [69, 152, 548], lv(3, 2)),
      T('AROMA LADY ROSE', 'Stop and smell the flowers... FOREVER!', [102, 315, 495], lv(3, 3)),
      T('LEADER FERN', 'Nature always wins in the end!', [3, 154, 497], lv(3, 4))
    ]
  },
  {
    key: 'psychic', emoji: '🔮', name: 'MINDBEND GYM', type: 'psychic',
    trainers: [
      T('PSYCHIC MILO', 'I knew you would say that.', [63, 96], lv(4, 0)),
      T('MEDIUM CLARA', 'The spirits whisper... you lose!', [96, 203], lv(4, 1)),
      T('PSYCHIC IRIS', 'Mind over matter. MY mind, to be exact.', [64, 280, 517], lv(4, 2)),
      T('HEX MANIAC JUNE', 'My crystal ball says GAME OVER.', [122, 325, 577], lv(4, 3)),
      T('LEADER LUNA', 'I saw this battle in a dream. You lost.', [65, 196, 282], lv(4, 4))
    ]
  },
  {
    key: 'fighting', emoji: '🥊', name: 'KNUCKLE GYM', type: 'fighting',
    trainers: [
      T('BLACK BELT JO', 'HI-YA! My fists do the talking!', [66, 236], lv(5, 0)),
      T('BATTLE GIRL MIA', 'Fast feet, faster Pokémon!', [56, 296], lv(5, 1)),
      T('BLACK BELT KOJI', 'A thousand push-ups a day!', [67, 106, 532], lv(5, 2)),
      T('WORKOUT BRO REX', 'Do you even LIFT, trainer?', [107, 297, 533], lv(5, 3)),
      T('LEADER PUNCHY', 'My gym, my rules: NO MERCY!', [68, 448, 534], lv(5, 4))
    ]
  },
  {
    key: 'ghost', emoji: '👻', name: 'PHANTOM GYM', type: 'ghost',
    trainers: [
      T('LASS WISP', 'Boo! Did I scare you?', [92, 353], lv(6, 0)),
      T('HEX MANIAC MORTICIA', 'The walls are watching you...', [200, 355], lv(6, 1)),
      T('CHANNELER EVE', 'A spirit follows you. It is MINE.', [93, 425, 562], lv(6, 2)),
      T('PHANTOM PETE', 'I have been dead tired of waiting!', [356, 607, 92], lv(6, 3)),
      T('LEADER SHADE', 'Welcome to your final fright!', [94, 477, 609], lv(6, 4))
    ]
  },
  {
    key: 'ice', emoji: '❄️', name: 'GLACIER GYM', type: 'ice',
    trainers: [
      T('SKIER ELSA', 'Stay frosty!', [86, 220], lv(7, 0)),
      T('BOARDER CHILL', 'Cool moves, cooler Pokémon!', [124, 361], lv(7, 1)),
      T('SKIER BJORN', 'You are skating on thin ice!', [87, 221, 582], lv(7, 2)),
      T('SNOW LADY NEVE', 'Let it snow, let it SNOW!', [362, 459, 583], lv(7, 3)),
      T('LEADER FROST', 'Your winning streak ends in a BLIZZARD!', [131, 473, 584], lv(7, 4))
    ]
  },
  {
    key: 'fire', emoji: '🔥', name: 'INFERNO GYM', type: 'fire',
    trainers: [
      T('KINDLER ASH', 'Things are heating up!', [58, 513], lv(8, 0)),
      T('FIREBREATHER RON', 'HOT stuff coming through!', [77, 218], lv(8, 1)),
      T('KINDLER BLAISE', 'You just got BURNED!', [5, 228, 390], lv(8, 2)),
      T('FIREBREATHER SOL', 'My team never gets cold feet!', [37, 255, 498], lv(8, 3)),
      T('LEADER BLAZE', 'Feel the heat of a TRUE champion!', [6, 59, 257], lv(8, 4))
    ]
  },
  {
    key: 'dragon', emoji: '🐉', name: 'DRAGON GYM', type: 'dragon',
    trainers: [
      T('DRAGON TAMER RYU', 'Dragons bow to no one!', [147, 333], lv(9, 0)),
      T('DRAGON TAMER ONA', 'My dragons eat champions for breakfast!', [371, 610], lv(9, 1)),
      T('VETERAN DRAKE', 'Fifty years of dragon training!', [148, 334, 443], lv(9, 2)),
      T('VETERAN WYVERN', 'You dare enter the dragon den?!', [372, 444, 611], lv(9, 3)),
      T('LEADER DRACO', 'ROAR! The sky itself fights for me!', [149, 373, 612], lv(9, 4))
    ]
  },
  {
    key: 'victory', emoji: '🏔️', name: 'VICTORY ROAD', type: 'rock',
    trainers: [
      T('ACE TRAINER KAI', 'Only the best make it this far. Turn back!', [130, 68, 94, 59], 69),
      T('ACE TRAINER RIA', 'I have beaten everyone who stood here!', [65, 131, 6, 18], 70),
      T('ACE TRAINER ZED', 'The Elite Four? First you face ME!', [248, 376, 445, 469], 71)
    ]
  },
  {
    key: 'elite', emoji: '👑', name: 'ELITE FOUR + CHAMPION', type: 'dragon',
    trainers: [
      T('ELITE STONE', 'I am the wall you cannot climb!', [76, 95, 208, 306, 530], 73),
      T('ELITE IVY', 'My garden of victory has no room for you!', [3, 45, 71, 465, 549], 74),
      T('ELITE STORM', 'Thunder and wind obey my command!', [125, 405, 466, 523, 18], 75),
      T('ELITE SPECTER', 'Your journey ends in darkness!', [94, 197, 229, 302, 477], 76),
      T('CHAMPION REX', 'So you beat the Elite Four... but I am on another level entirely!', [18, 65, 112, 130, 59, 6], 80)
    ]
  }
];

export const TOTAL_TRAINERS = GYMS.reduce((a, g) => a + g.trainers.length, 0);

export function trainerKey(gymKey, idx) { return `${gymKey}:${idx}`; }
