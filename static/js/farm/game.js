/* ============================================================
   PIXEL HARVEST — a tiny pixel farming game
   Pure canvas + vanilla JS. All art is drawn procedurally,
   pixel by pixel, into cached offscreen canvases.
   ============================================================ */
(() => {
'use strict';

// ---------------------------------------------------------------- constants
const TS = 16;                 // tile size in virtual pixels
const VW = 320, VH = 180;      // virtual screen
const MW = 32, MH = 24;        // map size in tiles
const WW = MW * TS, WH = MH * TS;
const SAVE_KEY = 'pixelharvest.save.v1';

const DAY_START = 6 * 60;      // 06:00
const DAY_END   = 26 * 60;     // 02:00 next day -> forced sleep
const MIN_PER_SEC = 3.2;       // in-game minutes per real second

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;

// ---------------------------------------------------------------- tiny art kit
function spr(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  draw({
    r: (px, py, pw, ph, col) => { x.fillStyle = col; x.fillRect(px | 0, py | 0, pw | 0, ph | 0); },
    p: (px, py, col) => { x.fillStyle = col; x.fillRect(px | 0, py | 0, 1, 1); },
    ctx: x
  });
  return c;
}
// deterministic pseudo random
function rnd(seed) { let s = seed * 9301 + 49297; s = s % 233280; return s / 233280; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// ---------------------------------------------------------------- palette
const C = {
  grass1: '#6ab04c', grass2: '#5d9e43', grass3: '#7cc25c',
  path: '#c2a173', path2: '#b08b5a',
  soil: '#8a6b48', soil2: '#7a5c3c',
  till: '#6f5335', till2: '#5d4429',
  wet: '#5c4530', wet2: '#4a3626',
  water: '#4aa7d8', water2: '#73c6ee', water3: '#2f86b8',
  wood: '#8a5a33', wood2: '#6b4426', woodL: '#b5804d',
  roof: '#c0453d', roof2: '#9c332d',
  wall: '#e8d9b8', wall2: '#cbb894',
  leaf: '#3f8f3a', leaf2: '#2f7230', leaf3: '#55a845',
  dark: '#2b1d2b', gold: '#ffd56b',
  skin: '#f0b183', skinS: '#d9906a', hair: '#7a4322',
  shirt: '#4a90d9', shirtS: '#3a74ad', jeans: '#2e5aa8', boot: '#5a3a22',
  hat: '#e8c86a', hatS: '#d8a84e', hatL: '#f5e09a'
};

// ---------------------------------------------------------------- terrain tiles
const TILE = {};
TILE.g = spr(TS, TS, ({ r }) => {
  r(0, 0, TS, TS, C.grass1);
  for (let i = 0; i < 26; i++) {
    const x = (rnd(i * 3 + 1) * TS) | 0, y = (rnd(i * 7 + 5) * TS) | 0;
    r(x, y, 1, 1, i % 3 === 0 ? C.grass3 : C.grass2);
  }
  r(3, 11, 1, 2, C.grass3); r(10, 4, 1, 2, C.grass3);
});
TILE.g2 = spr(TS, TS, ({ r }) => {
  r(0, 0, TS, TS, C.grass1);
  for (let i = 0; i < 22; i++) {
    const x = (rnd(i * 11 + 3) * TS) | 0, y = (rnd(i * 5 + 9) * TS) | 0;
    r(x, y, 1, 1, i % 4 === 0 ? C.grass3 : C.grass2);
  }
  // little flower
  r(6, 7, 2, 1, '#f2e06a'); r(7, 6, 1, 1, '#f2e06a'); r(7, 8, 1, 1, '#f2e06a');
  r(5, 9, 1, 2, C.leaf2);
});
TILE.p = spr(TS, TS, ({ r }) => {
  r(0, 0, TS, TS, C.path);
  for (let i = 0; i < 30; i++) {
    const x = (rnd(i * 13 + 2) * TS) | 0, y = (rnd(i * 17 + 4) * TS) | 0;
    r(x, y, 1, 1, C.path2);
  }
  r(4, 5, 2, 1, '#9b7a4e'); r(11, 10, 2, 1, '#9b7a4e');
});
// untilled farm plot: short, dry-ish meadow grass with a few bare specks
TILE.s = spr(TS, TS, ({ r }) => {
  r(0, 0, TS, TS, '#79ad52');
  for (let i = 0; i < 20; i++) {
    const x = (rnd(i * 23 + 6) * TS) | 0, y = (rnd(i * 29 + 8) * TS) | 0;
    r(x, y, 1, 1, i % 3 === 0 ? '#8cbe60' : '#6c9e49');
  }
  r(3, 4, 2, 1, C.soil); r(11, 9, 2, 1, C.soil); r(7, 13, 1, 1, C.soil2);
});
function tilledTile(wet) {
  const a = wet ? C.wet : C.till, b = wet ? C.wet2 : C.till2;
  return spr(TS, TS, ({ r }) => {
    r(0, 0, TS, TS, a);
    for (let y = 1; y < TS; y += 4) r(0, y, TS, 1, b);
    for (let y = 2; y < TS; y += 4) r(0, y, TS, 1, wet ? '#6b5139' : '#7d5f3d');
    r(0, 0, TS, 1, b); r(0, 0, 1, TS, b);
  });
}
TILE.t0 = tilledTile(false);
TILE.t1 = tilledTile(true);

const WATER_FRAMES = [0, 1, 2, 3].map(f => spr(TS, TS, ({ r }) => {
  r(0, 0, TS, TS, C.water);
  for (let i = 0; i < 18; i++) {
    const x = (rnd(i * 31 + f * 7 + 1) * TS) | 0, y = (rnd(i * 19 + f * 3 + 2) * TS) | 0;
    r(x, y, 1, 1, C.water3);
  }
  const o = f * 4;
  r((2 + o) % TS, 4, 3, 1, C.water2);
  r((9 + o) % TS, 9, 4, 1, C.water2);
  r((5 + o) % TS, 13, 2, 1, C.water2);
}));

// ---------------------------------------------------------------- props
const TREE = spr(16, 28, ({ r }) => {
  r(6, 18, 4, 10, C.wood2); r(7, 18, 2, 10, C.wood);
  r(5, 26, 6, 2, C.wood2);
  const blob = (x, y, w, h, c) => r(x, y, w, h, c);
  blob(3, 4, 10, 14, C.leaf2);
  blob(2, 7, 12, 8, C.leaf2);
  blob(4, 3, 8, 14, C.leaf);
  blob(3, 8, 10, 6, C.leaf);
  blob(5, 4, 6, 5, C.leaf3);
  blob(4, 10, 3, 3, C.leaf3);
  r(9, 13, 2, 2, '#2a6329'); r(6, 6, 1, 1, '#2a6329');
});
const BUSH = spr(16, 16, ({ r }) => {
  r(2, 7, 12, 7, C.leaf2); r(3, 5, 10, 8, C.leaf); r(5, 5, 5, 3, C.leaf3);
  r(4, 9, 2, 2, '#e2554a'); r(10, 8, 2, 2, '#e2554a'); r(7, 11, 2, 2, '#e2554a');
});
const FENCE = spr(16, 16, ({ r }) => {
  r(0, 8, 16, 2, C.woodL); r(0, 12, 16, 2, C.wood);
  r(3, 5, 3, 11, C.wood); r(3, 5, 1, 11, C.woodL);
  r(11, 5, 3, 11, C.wood); r(11, 5, 1, 11, C.woodL);
});
const FENCE_V = spr(16, 16, ({ r }) => {
  r(5, 0, 3, 16, C.wood); r(5, 0, 1, 16, C.woodL);
  r(9, 0, 2, 16, C.wood2);
  r(2, 6, 12, 2, C.woodL); r(2, 11, 12, 2, C.wood);
});

const HOUSE = spr(96, 80, ({ r }) => {
  // walls
  r(8, 30, 80, 46, C.wall2);
  r(10, 32, 76, 42, C.wall);
  // plank lines
  for (let y = 36; y < 74; y += 6) r(10, y, 76, 1, C.wall2);
  // roof
  for (let i = 0; i < 16; i++) r(4 + i * 2.6, 30 - i * 2, 88 - i * 5.2, 2, i % 2 ? C.roof2 : C.roof);
  r(0, 28, 96, 4, C.roof2); r(0, 28, 96, 2, C.roof);
  // chimney
  r(68, 4, 10, 14, '#8a5a5a'); r(68, 2, 10, 3, '#6b4444');
  // windows
  const win = (x) => {
    r(x, 40, 16, 14, C.wood2); r(x + 2, 42, 12, 10, '#9fd6ef');
    r(x + 2, 42, 6, 5, '#c8ecf8'); r(x + 7, 42, 2, 10, C.wood2); r(x + 2, 46, 12, 2, C.wood2);
  };
  win(16); win(62);
  // door (under tile 5,5 of map => local x 32..48)
  r(34, 52, 20, 24, C.wood2); r(36, 54, 16, 22, C.wood);
  r(36, 54, 16, 2, C.woodL);
  r(48, 64, 2, 2, C.gold);
  // step
  r(30, 76, 28, 4, '#a89a84');
});

const STALL = spr(80, 64, ({ r }) => {
  // posts
  r(4, 18, 4, 44, C.wood2); r(72, 18, 4, 44, C.wood2);
  // awning stripes
  for (let i = 0; i < 9; i++) r(i * 8, 8, 8, 12, i % 2 ? '#f2f2e8' : '#e2554a');
  r(0, 6, 72 + 8, 3, C.wood2);
  for (let i = 0; i < 9; i++) r(i * 8, 20, 8, 3, i % 2 ? '#d8d8ce' : '#b93f37');
  // counter
  r(6, 38, 68, 6, C.woodL); r(6, 44, 68, 16, C.wood);
  for (let x = 10; x < 74; x += 8) r(x, 44, 1, 16, C.wood2);
  // produce crates on counter
  r(12, 28, 16, 10, C.wood2); r(13, 29, 14, 8, C.woodL);
  r(14, 26, 4, 4, '#e2554a'); r(19, 25, 4, 4, '#f2a33c'); r(23, 27, 4, 3, '#8fd96b');
  r(48, 28, 18, 10, C.wood2); r(49, 29, 16, 8, C.woodL);
  r(51, 25, 5, 5, '#f0c93c'); r(57, 26, 5, 4, '#b06be0');
  // sign
  r(26, 0, 28, 10, C.wood); r(27, 1, 26, 8, C.woodL);
  r(30, 4, 2, 2, C.dark); r(34, 4, 2, 2, C.dark); r(38, 4, 2, 2, C.dark); r(42, 4, 2, 2, C.dark); r(46, 4, 2, 2, C.dark);
});

const COOP = spr(64, 56, ({ r }) => {
  r(4, 20, 56, 32, C.wall2); r(6, 22, 52, 28, C.wall);
  for (let y = 26; y < 50; y += 6) r(6, y, 52, 1, C.wall2);
  for (let i = 0; i < 10; i++) r(2 + i * 2.8, 20 - i * 2, 60 - i * 5.6, 2, i % 2 ? '#7a9c4a' : '#8fb857');
  r(0, 18, 64, 4, '#6b8a3f');
  // door hole
  r(24, 34, 14, 18, C.dark); r(26, 36, 10, 16, '#4a3524');
  // nest + window
  r(44, 30, 12, 10, C.wood2); r(46, 32, 8, 6, '#f0c93c');
  r(10, 50, 44, 4, C.wood2);
});

// ---------------------------------------------------------------- crops
const CROPS = {
  wheat:    { name: 'Wheat',    seed: 10,  sell: 28,  grow: 3, color: '#e8c54e', fruit: 'spike' },
  carrot:   { name: 'Carrot',   seed: 22,  sell: 60,  grow: 4, color: '#f2883c', fruit: 'root' },
  potato:   { name: 'Potato',   seed: 35,  sell: 95,  grow: 5, color: '#c99a5b', fruit: 'lump' },
  pumpkin:  { name: 'Pumpkin',  seed: 70,  sell: 230, grow: 7, color: '#f27d2c', fruit: 'big' }
};
const CROP_IDS = Object.keys(CROPS);

function cropSprite(id, stage) {
  const d = CROPS[id];
  const last = d.grow;
  const t = stage / last;
  return spr(16, 16, ({ r }) => {
    if (stage === 0) { // sprout
      r(7, 11, 2, 4, C.leaf2);
      r(4, 10, 3, 2, C.leaf); r(9, 10, 3, 2, C.leaf);
      r(7, 9, 2, 2, C.leaf3);
      return;
    }
    const h = Math.round(3 + t * 8);
    const top = 15 - h;
    r(7, top, 2, h, C.leaf2);
    r(7, top, 1, h, C.leaf);
    const leaves = Math.min(3, 1 + stage);
    for (let i = 0; i < leaves; i++) {
      const ly = 13 - i * 3;
      if (ly < top) break;
      const w = 3 + (i % 2);
      r(7 - w, ly, w, 2, i % 2 ? C.leaf : C.leaf3);
      r(9, ly - 1, w, 2, i % 2 ? C.leaf3 : C.leaf);
    }
    if (stage < last) return;
    // ripe fruit
    const col = d.color, sh = shade(col, -28), hi = shade(col, 34);
    if (d.fruit === 'spike') {
      for (let i = 0; i < 4; i++) {
        const y = top - 1 + i * 2;
        r(5, y, 2, 2, col); r(9, y, 2, 2, sh); r(7, y, 2, 2, hi);
      }
      r(7, top - 3, 2, 3, col);
    } else if (d.fruit === 'root') {
      r(6, 9, 4, 5, col); r(6, 9, 2, 5, hi); r(7, 14, 2, 2, sh);
      r(5, 8, 6, 1, sh);
    } else if (d.fruit === 'lump') {
      r(4, 10, 5, 4, col); r(5, 9, 3, 1, hi); r(9, 11, 4, 3, sh);
      r(6, 11, 1, 1, shade(col, -55));
    } else {
      r(3, 9, 10, 7, col); r(4, 8, 8, 2, col);
      r(4, 9, 2, 6, hi); r(11, 9, 2, 6, sh);
      r(6, 9, 1, 7, sh); r(9, 9, 1, 7, sh);
      r(7, 6, 2, 3, C.leaf2);
    }
  });
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => clamp(v + amt, 0, 255);
  return '#' + [f(n >> 16 & 255), f(n >> 8 & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('');
}
const CROP_SPR = {};
for (const id of CROP_IDS) {
  CROP_SPR[id] = [];
  for (let s = 0; s <= CROPS[id].grow; s++) CROP_SPR[id].push(cropSprite(id, s));
}
const SEED_BAG = {};
for (const id of CROP_IDS) {
  SEED_BAG[id] = spr(16, 16, ({ r }) => {
    r(4, 7, 8, 7, '#c9ab7a'); r(5, 6, 6, 2, '#ded0a8'); r(4, 7, 2, 7, '#ded0a8');
    r(6, 4, 4, 3, '#a98f62'); r(6, 4, 4, 1, '#8a7149');
    r(7, 9, 2, 2, CROPS[id].color); r(9, 11, 2, 2, CROPS[id].color);
  });
}
const ITEM_SPR = {};
for (const id of CROP_IDS) {
  ITEM_SPR[id] = spr(16, 16, ({ r }) => {
    const d = CROPS[id], col = d.color, sh = shade(col, -30), hi = shade(col, 34);
    if (id === 'wheat') {
      r(7, 3, 2, 11, '#c9a24e');
      for (let i = 0; i < 4; i++) { r(4, 3 + i * 2, 3, 2, col); r(9, 4 + i * 2, 3, 2, sh); }
      r(7, 2, 2, 2, hi);
    } else if (id === 'carrot') {
      r(6, 5, 4, 7, col); r(6, 5, 2, 7, hi); r(7, 12, 2, 2, sh);
      r(5, 3, 2, 3, C.leaf); r(8, 2, 2, 4, C.leaf3); r(10, 3, 2, 3, C.leaf);
    } else if (id === 'potato') {
      r(4, 6, 8, 6, col); r(5, 5, 6, 2, hi); r(5, 11, 6, 2, sh);
      r(6, 8, 1, 1, shade(col, -60)); r(9, 9, 1, 1, shade(col, -60));
    } else {
      r(3, 6, 10, 8, col); r(4, 5, 8, 2, col); r(4, 14, 8, 1, sh);
      r(4, 6, 2, 8, hi); r(10, 6, 2, 8, sh);
      r(6, 6, 1, 8, sh); r(9, 6, 1, 8, sh);
      r(7, 2, 2, 4, C.leaf2); r(9, 2, 3, 2, C.leaf);
    }
  });
}
const EGG = spr(16, 16, ({ r }) => {
  r(6, 5, 4, 2, '#fff6e2'); r(5, 7, 6, 5, '#f7ecd4'); r(6, 12, 4, 1, '#e3d4b6');
  r(6, 6, 2, 3, '#ffffff');
});
const HOE = spr(16, 16, ({ r }) => {
  r(4, 3, 2, 11, C.wood); r(4, 3, 1, 11, C.woodL);
  r(6, 3, 6, 2, '#b9c2cc'); r(10, 5, 2, 4, '#9aa5b1'); r(6, 3, 6, 1, '#dde4ea');
});
const CAN = spr(16, 16, ({ r }) => {
  r(4, 6, 7, 8, '#7fb6d9'); r(4, 6, 7, 1, '#a9d6ef'); r(4, 13, 7, 1, '#5d93b5');
  r(11, 7, 4, 2, '#7fb6d9'); r(14, 5, 2, 3, '#a9d6ef');
  r(3, 4, 4, 2, '#5d93b5'); r(6, 3, 2, 2, '#5d93b5');
});

// ---------------------------------------------------------------- player sprites
function playerSprite(dir, frame) {
  return spr(16, 16, ({ r }) => {
    const legA = frame === 1 ? 1 : 0, legB = frame === 2 ? 1 : 0;
    const bob = frame ? 1 : 0;
    const y0 = bob ? 1 : 0;
    // legs
    r(5, 12 + legA, 2, 3 - legA, C.jeans);
    r(9, 12 + legB, 2, 3 - legB, C.jeans);
    r(5, 15, 2, 1, C.boot); r(9, 15, 2, 1, C.boot);
    // body
    r(4, 8 + y0, 8, 5, C.shirt);
    r(4, 8 + y0, 8, 1, '#5fa2e6');
    r(4, 11 + y0, 8, 2, C.jeans);
    r(6, 8 + y0, 1, 4, C.jeans); r(9, 8 + y0, 1, 4, C.jeans);
    r(4, 12 + y0, 8, 1, C.shirtS);
    // arms
    const ay = frame === 1 ? 9 : frame === 2 ? 8 : 8;
    r(3, ay + y0, 2, 4, C.shirt); r(11, (frame === 2 ? 9 : 8) + y0, 2, 4, C.shirt);
    r(3, ay + y0 + 4, 2, 1, C.skin); r(11, (frame === 2 ? 9 : 8) + y0 + 4, 2, 1, C.skin);
    // head
    if (dir === 'up') {
      r(5, 4 + y0, 6, 5, C.hair);
      r(5, 8 + y0, 6, 1, '#60341a');
    } else if (dir === 'side') {
      r(5, 4 + y0, 6, 5, C.skin);
      r(5, 4 + y0, 2, 5, C.skinS);
      r(5, 4 + y0, 6, 1, C.hair);
      r(9, 6 + y0, 1, 2, C.dark);          // eye
      r(10, 8 + y0, 1, 1, '#c2735a');      // mouth
    } else {
      r(5, 4 + y0, 6, 5, C.skin);
      r(5, 4 + y0, 6, 1, C.hair);
      r(6, 6 + y0, 1, 2, C.dark); r(9, 6 + y0, 1, 2, C.dark);
      r(7, 8 + y0, 2, 1, '#c2735a');
      r(5, 5 + y0, 1, 3, C.skinS);
    }
    // straw hat
    r(5, 1 + y0, 6, 2, C.hat);
    r(5, 1 + y0, 6, 1, C.hatL);
    r(3, 3 + y0, 10, 2, C.hat);
    r(3, 4 + y0, 10, 1, C.hatS);
    if (dir === 'up') r(4, 3 + y0, 8, 1, C.hatS);
  });
}
const PLAYER = {
  down: [0, 1, 2].map(f => playerSprite('down', f)),
  up:   [0, 1, 2].map(f => playerSprite('up', f)),
  side: [0, 1, 2].map(f => playerSprite('side', f))
};

// chicken
function chickenSprite(frame) {
  return spr(12, 12, ({ r }) => {
    const b = frame ? 1 : 0;
    r(2, 4 + b, 7, 5, '#fdfdf5');       // body
    r(2, 7 + b, 7, 2, '#e4e2d2');
    r(7, 2 + b, 4, 4, '#fdfdf5');       // head
    r(9, 3 + b, 1, 1, C.dark);          // eye
    r(10, 4 + b, 2, 1, '#f2a33c');      // beak
    r(8, 0 + b, 1, 2, '#e2554a'); r(9, 1 + b, 1, 1, '#e2554a'); // comb
    r(1, 5 + b, 2, 2, '#efeade');       // tail
    r(3, 9 + (frame ? 0 : 1), 1, 2, '#f2a33c');
    r(6, 9 + (frame ? 1 : 0), 1, 2, '#f2a33c');
  });
}
const CHICKEN = [chickenSprite(0), chickenSprite(1)];

// ---------------------------------------------------------------- map
const terrain = [];
function buildMap() {
  for (let y = 0; y < MH; y++) {
    terrain[y] = [];
    for (let x = 0; x < MW; x++) terrain[y][x] = rnd(x * 31 + y * 17) > 0.9 ? 'G' : 'g';
  }
  const fill = (x0, y0, x1, y1, ch) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
      if (x >= 0 && y >= 0 && x < MW && y < MH) terrain[y][x] = ch;
  };
  // border trees
  for (let x = 0; x < MW; x++) { terrain[0][x] = 't'; terrain[MH - 1][x] = 't'; }
  for (let y = 0; y < MH; y++) { terrain[y][0] = 't'; terrain[y][MW - 1] = 't'; }
  // pond
  const pcx = 26.5, pcy = 19;
  for (let y = 15; y < 23; y++) for (let x = 21; x < 31; x++) {
    const dx = (x - pcx) / 4.6, dy = (y - pcy) / 3.1;
    if (dx * dx + dy * dy < 1) terrain[y][x] = 'w';
  }
  // paths
  fill(10, 6, 10, 21, 'p');
  fill(4, 7, 27, 7, 'p');
  fill(10, 12, 20, 12, 'p');
  // house (rows 1..5, cols 3..8) with door at (5,5)
  fill(3, 2, 8, 5, 'H');
  terrain[5][5] = 'D';
  // market stall cols 20..24 rows 3..5
  fill(20, 4, 24, 5, 'M');
  // coop cols 25..28 rows 9..11
  fill(25, 9, 28, 11, 'C');
  // farm plots
  fill(12, 14, 19, 21, 's');
  fill(3, 13, 8, 20, 's');
  // fences around plots (with gates)
  for (let x = 11; x <= 20; x++) { setFence(x, 13); setFence(x, 22); }
  for (let y = 13; y <= 22; y++) { setFence(11, y); setFence(20, y); }
  terrain[13][15] = 'p'; terrain[22][15] = 'g';
  for (let x = 2; x <= 9; x++) { setFence(x, 12); setFence(x, 21); }
  for (let y = 12; y <= 21; y++) { setFence(2, y); setFence(9, y); }
  terrain[12][6] = 'g'; terrain[13][6] = 's';
  // decorative bushes
  const bushes = [[2, 9], [6, 22], [17, 3], [27, 14], [14, 9], [29, 6], [2, 21]];
  for (const [x, y] of bushes) if (terrain[y][x] === 'g' || terrain[y][x] === 'G') terrain[y][x] = 'b';
  // extra trees in open grass
  const trees = [[13, 2], [15, 5], [2, 12], [29, 2], [30, 12], [22, 20], [18, 9], [26, 7], [8, 10]];
  for (const [x, y] of trees) if (terrain[y][x] === 'g' || terrain[y][x] === 'G') terrain[y][x] = 't';
}
function setFence(x, y) {
  if (terrain[y][x] === 'g' || terrain[y][x] === 'G' || terrain[y][x] === 's') terrain[y][x] = 'f';
}
buildMap();

const SOLID = new Set(['t', 'w', 'H', 'D', 'M', 'C', 'f', 'b']);
const isSolid = (x, y) => x < 0 || y < 0 || x >= MW || y >= MH || SOLID.has(terrain[y][x]);
const idx = (x, y) => y * MW + x;

// ---------------------------------------------------------------- state
const TOOLS = [
  { id: 'hoe', name: 'Hoe', spr: HOE },
  { id: 'can', name: 'Watering Can', spr: CAN },
  ...CROP_IDS.map(id => ({ id: 'seed:' + id, name: CROPS[id].name + ' Seeds', spr: SEED_BAG[id], crop: id }))
];

let S = null;
function freshState() {
  return {
    day: 1, time: DAY_START,
    coins: 120, energy: 100, maxEnergy: 100,
    water: 20, maxWater: 20,
    px: 5 * TS + 8, py: 8 * TS + 8,
    tool: 0,
    tilled: {}, watered: {}, crops: {},
    seeds: { wheat: 6, carrot: 0, potato: 0, pumpkin: 0 },
    bag: { wheat: 0, carrot: 0, potato: 0, pumpkin: 0, egg: 0 },
    chickens: 0, eggs: [], weather: 'sun',
    earned: 0, harvested: 0
  };
}
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return Object.assign(freshState(), o);
  } catch (e) { return null; }
}
const hasSave = () => !!localStorage.getItem(SAVE_KEY);

// runtime-only
const R = {
  dir: 'down', frame: 0, anim: 0, moving: false,
  camx: 0, camy: 0, t: 0,
  toasts: [], pops: [], drops: [],
  paused: true, mode: 'title',
  useFlash: 0
};

// ---------------------------------------------------------------- input
const keys = {};
const touchVec = { x: 0, y: 0 };
let usePressed = false;

addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(e.key)) e.preventDefault();
  if (e.repeat) return;
  keys[e.key.toLowerCase()] = true;
  const k = e.key.toLowerCase();
  if (R.mode === 'shop') { if (k === 'escape' || k === 'e') closeShop(); return; }
  if (R.mode === 'sleep') { if (k === ' ' || k === 'enter' || k === 'e') closeSleep(); return; }
  if (R.mode !== 'play') return;
  if (k === ' ' || k === 'e' || k === 'enter') usePressed = true;
  if (k >= '1' && k <= '6') S.tool = Math.min(TOOLS.length - 1, +k - 1);
  if (k === 'q') S.tool = (S.tool + TOOLS.length - 1) % TOOLS.length;
  if (k === 'tab') S.tool = (S.tool + 1) % TOOLS.length;
  if (k === 'f') eat();
  if (k === 'escape') { /* reserved */ }
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// touch
const touchEl = document.getElementById('touch');
const stick = document.getElementById('stick');
const nub = document.getElementById('nub');
if (matchMedia('(pointer: coarse)').matches) touchEl.classList.remove('hidden');

let stickId = null;
function stickMove(e) {
  const t = [...e.touches].find(t => t.identifier === stickId);
  if (!t) return;
  const r = stick.getBoundingClientRect();
  let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2);
  const d = Math.hypot(dx, dy), max = r.width / 2 - 10;
  if (d > max) { dx = dx / d * max; dy = dy / d * max; }
  nub.style.transform = `translate(${dx}px, ${dy}px)`;
  const n = Math.max(1, d);
  touchVec.x = dx / Math.max(max, n); touchVec.y = dy / Math.max(max, n);
}
stick.addEventListener('touchstart', e => { stickId = e.changedTouches[0].identifier; stickMove(e); e.preventDefault(); }, { passive: false });
stick.addEventListener('touchmove', e => { stickMove(e); e.preventDefault(); }, { passive: false });
const stickEnd = e => {
  if ([...e.changedTouches].some(t => t.identifier === stickId)) {
    stickId = null; touchVec.x = touchVec.y = 0; nub.style.transform = '';
  }
};
stick.addEventListener('touchend', stickEnd);
stick.addEventListener('touchcancel', stickEnd);
document.getElementById('tA').addEventListener('touchstart', e => { e.preventDefault(); usePressed = true; }, { passive: false });
document.getElementById('tB').addEventListener('touchstart', e => { e.preventDefault(); if (S) S.tool = (S.tool + 1) % TOOLS.length; }, { passive: false });
cv.addEventListener('wheel', e => { if (!S || R.mode !== 'play') return; e.preventDefault(); S.tool = (S.tool + (e.deltaY > 0 ? 1 : TOOLS.length - 1)) % TOOLS.length; }, { passive: false });

// ---------------------------------------------------------------- audio
let AC = null;
function beep(freq, dur, type = 'square', vol = 0.05) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
    o.connect(g); g.connect(AC.destination);
    o.start(); o.stop(AC.currentTime + dur);
  } catch (e) {}
}
const SFX = {
  till: () => { beep(140, .09, 'square', .05); setTimeout(() => beep(90, .08, 'square', .04), 50); },
  water: () => beep(620, .14, 'sine', .05),
  plant: () => beep(440, .07, 'triangle', .05),
  harvest: () => { beep(660, .07, 'square', .05); setTimeout(() => beep(990, .1, 'square', .05), 60); },
  coin: () => { beep(880, .06, 'square', .04); setTimeout(() => beep(1320, .09, 'square', .04), 55); },
  bad: () => beep(120, .16, 'sawtooth', .04),
  sleep: () => { beep(330, .18, 'sine', .05); setTimeout(() => beep(220, .3, 'sine', .05), 180); }
};

// ---------------------------------------------------------------- helpers
function toast(msg, col) { R.toasts.push({ msg, col: col || '#ffeedd', t: 0 }); if (R.toasts.length > 3) R.toasts.shift(); }
function pop(x, y, msg, col) { R.pops.push({ x, y, msg, col: col || C.gold, t: 0 }); }
function clockStr() {
  let m = S.time % (24 * 60), h = Math.floor(m / 60), mm = Math.floor(m % 60 / 10) * 10;
  const ap = h >= 12 && h < 24 ? 'pm' : 'am';
  let hh = h % 12; if (hh === 0) hh = 12;
  return `${hh}:${mm.toString().padStart(2, '0')}${ap}`;
}
function facingTile() {
  const tx = Math.floor(S.px / TS), ty = Math.floor(S.py / TS);
  const d = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[R.dirFull || 'down'];
  return { x: tx + d[0], y: ty + d[1] };
}

// ---------------------------------------------------------------- actions
function spendEnergy(n) {
  if (S.energy < n) { toast('Too tired... get some sleep', '#ff8a7a'); SFX.bad(); return false; }
  S.energy -= n; return true;
}
function doUse() {
  const f = facingTile();
  const here = { x: Math.floor(S.px / TS), y: Math.floor(S.py / TS) };
  R.useFlash = .18;
  for (const t of [f, here]) {
    if (t.x < 0 || t.y < 0 || t.x >= MW || t.y >= MH) continue;
    const ch = terrain[t.y][t.x];
    if (ch === 'D' || ch === 'H') { askSleep(); return; }
    if (ch === 'M') { openShop(); return; }
    if (ch === 'w') {
      if (S.water >= S.maxWater) { toast('Can is already full'); return; }
      S.water = S.maxWater; SFX.water(); toast('Watering can filled', '#9fd6ef'); return;
    }
    if (ch === 'C') { toast(S.chickens ? `${S.chickens} chicken${S.chickens > 1 ? 's' : ''} live here` : 'An empty coop... buy a chicken!'); return; }
  }
  const t = f;
  if (t.x < 0 || t.y < 0 || t.x >= MW || t.y >= MH) return;
  const i = idx(t.x, t.y);
  const crop = S.crops[i];

  // harvest first, with any tool
  if (crop && crop.stage >= CROPS[crop.id].grow) {
    if (!spendEnergy(1)) return;
    const d = CROPS[crop.id];
    const amount = crop.id === 'wheat' ? 2 : 1;
    S.bag[crop.id] += amount;
    S.harvested += amount;
    delete S.crops[i];
    delete S.watered[i];
    SFX.harvest();
    pop(t.x * TS + 8, t.y * TS, `+${amount} ${d.name}`, d.color);
    return;
  }
  const tool = TOOLS[S.tool];
  if (tool.id === 'hoe') {
    if (terrain[t.y][t.x] !== 's') { toast('You can only till the farm plots'); return; }
    if (S.tilled[i]) { toast('Already tilled'); return; }
    if (!spendEnergy(2)) return;
    S.tilled[i] = 1; SFX.till();
    for (let k = 0; k < 6; k++) R.drops.push({ x: t.x * TS + 8, y: t.y * TS + 8, vx: (Math.random() - .5) * 40, vy: -Math.random() * 40 - 10, t: 0, c: C.soil2 });
    return;
  }
  if (tool.id === 'can') {
    if (!S.tilled[i]) { toast('Till the soil first'); return; }
    if (S.watered[i]) { toast('Already watered'); return; }
    if (S.water <= 0) { toast('Out of water — refill at the pond', '#9fd6ef'); SFX.bad(); return; }
    if (!spendEnergy(1)) return;
    S.water--; S.watered[i] = 1; SFX.water();
    for (let k = 0; k < 6; k++) R.drops.push({ x: t.x * TS + 8, y: t.y * TS + 4, vx: (Math.random() - .5) * 30, vy: -Math.random() * 20, t: 0, c: '#9fd6ef' });
    return;
  }
  if (tool.crop) {
    const id = tool.crop;
    if (!S.tilled[i]) { toast('Till the soil first'); return; }
    if (S.crops[i]) { toast('Something is already growing here'); return; }
    if (S.seeds[id] <= 0) { toast(`No ${CROPS[id].name.toLowerCase()} seeds — buy some at the stall`); SFX.bad(); return; }
    if (!spendEnergy(1)) return;
    S.seeds[id]--;
    S.crops[i] = { id, stage: 0, wateredToday: !!S.watered[i] };
    SFX.plant();
    return;
  }
}

function eat() {
  if (S.energy >= S.maxEnergy - 2) { toast('You are not hungry'); return; }
  const id = CROP_IDS.find(c => S.bag[c] > 0) || (S.bag.egg > 0 ? 'egg' : null);
  if (!id) { toast('Nothing to eat — harvest something first'); SFX.bad(); return; }
  S.bag[id]--;
  const gain = id === 'egg' ? 14 : 10 + Math.round(CROPS[id].sell / 8);
  S.energy = Math.min(S.maxEnergy, S.energy + gain);
  SFX.plant();
  pop(S.px, S.py - 14, `+${gain} energy`, '#8fd96b');
  toast(`Ate ${id === 'egg' ? 'an egg' : CROPS[id].name.toLowerCase()}`, '#8fd96b');
}

// ---------------------------------------------------------------- day cycle
function askSleep() { doSleep(false); }
function doSleep(collapsed) {
  const grown = [];
  let grownCount = 0;
  for (const k in S.crops) {
    const c = S.crops[k];
    if (S.watered[k] && c.stage < CROPS[c.id].grow) { c.stage++; grownCount++; }
    if (c.stage >= CROPS[c.id].grow) grown.push(c.id);
  }
  S.watered = {};
  // chickens lay eggs
  let laid = 0;
  for (let i = 0; i < S.chickens; i++) {
    if (S.eggs.length < 12) {
      S.eggs.push({ x: (24 + Math.random() * 4) * TS + 8, y: (12 + Math.random() * 2) * TS + 8 });
      laid++;
    }
  }
  S.day++;
  S.time = DAY_START;
  S.weather = Math.random() < 0.28 ? 'rain' : 'sun';
  if (S.weather === 'rain') for (const k in S.tilled) S.watered[k] = 1;
  const rest = collapsed ? 0.6 : 1;
  S.energy = Math.round(S.maxEnergy * rest);
  S.water = S.maxWater;
  S.px = 5 * TS + 8; S.py = 7 * TS + 10;
  R.dirFull = 'down'; R.dir = 'down';
  SFX.sleep();

  const ready = Object.values(S.crops).filter(c => c.stage >= CROPS[c.id].grow).length;
  const lines = [];
  if (collapsed) lines.push(['You collapsed in the field...', '#ff8a7a']);
  if (S.weather === 'rain') lines.push(['It is raining — your crops water themselves', '#9fd6ef']);
  lines.push([`${grownCount} crop${grownCount === 1 ? '' : 's'} grew overnight`, '#8fd96b']);
  lines.push([`${ready} crop${ready === 1 ? '' : 's'} ready to harvest`, '#ffd56b']);
  if (S.chickens) lines.push([`${laid} egg${laid === 1 ? '' : 's'} laid by your chickens`, '#fff6e2']);
  lines.push([`Coins: ${S.coins}g`, '#ffd56b']);
  showSleep(lines);
  save();
}

// ---------------------------------------------------------------- update
function update(dt) {
  R.t += dt;
  if (R.mode !== 'play') return;

  // time
  S.time += dt * MIN_PER_SEC;
  if (S.time >= DAY_END) { doSleep(true); return; }

  // movement
  let mx = 0, my = 0;
  if (keys['a'] || keys['arrowleft']) mx -= 1;
  if (keys['d'] || keys['arrowright']) mx += 1;
  if (keys['w'] || keys['arrowup']) my -= 1;
  if (keys['s'] || keys['arrowdown']) my += 1;
  if (Math.abs(touchVec.x) > .22 || Math.abs(touchVec.y) > .22) { mx += touchVec.x; my += touchVec.y; }
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  const speed = 62;
  R.moving = len > .05;
  if (R.moving) {
    if (Math.abs(mx) > Math.abs(my)) R.dirFull = mx > 0 ? 'right' : 'left';
    else R.dirFull = my > 0 ? 'down' : 'up';
    R.dir = R.dirFull === 'left' || R.dirFull === 'right' ? 'side' : R.dirFull;
    moveBy(mx * speed * dt, my * speed * dt);
    R.anim += dt * (6 + len * 2);
    R.frame = 1 + (Math.floor(R.anim) % 2);
  } else { R.frame = 0; R.anim = 0; }

  // pick up eggs
  for (let i = S.eggs.length - 1; i >= 0; i--) {
    const e = S.eggs[i];
    if (Math.hypot(e.x - S.px, e.y - S.py) < 11) {
      S.eggs.splice(i, 1); S.bag.egg++; SFX.coin();
      pop(e.x, e.y - 6, '+1 Egg', '#fff6e2');
    }
  }

  if (usePressed) { usePressed = false; doUse(); }
  if (R.useFlash > 0) R.useFlash -= dt;

  // camera
  R.camx = clamp(S.px - VW / 2, 0, WW - VW);
  R.camy = clamp(S.py - VH / 2, 0, WH - VH);

  // particles
  for (let i = R.drops.length - 1; i >= 0; i--) {
    const d = R.drops[i];
    d.t += dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 150 * dt;
    if (d.t > .6) R.drops.splice(i, 1);
  }
  for (let i = R.pops.length - 1; i >= 0; i--) { R.pops[i].t += dt; if (R.pops[i].t > 1.4) R.pops.splice(i, 1); }
  for (let i = R.toasts.length - 1; i >= 0; i--) { R.toasts[i].t += dt; if (R.toasts[i].t > 2.6) R.toasts.splice(i, 1); }
}

function moveBy(dx, dy) {
  const rx = 5, ry = 3; // collision box (feet)
  const footY = () => S.py + 5;
  let nx = S.px + dx;
  if (!collides(nx, footY(), rx, ry)) S.px = nx;
  let ny = S.py + dy;
  if (!collides(S.px, ny + 5, rx, ry)) S.py = ny;
  S.px = clamp(S.px, TS + 4, WW - TS - 4);
  S.py = clamp(S.py, TS, WH - TS - 2);
}
function collides(cx, cy, rx, ry) {
  for (const [ox, oy] of [[-rx, -ry], [rx, -ry], [-rx, ry], [rx, ry]]) {
    const tx = Math.floor((cx + ox) / TS), ty = Math.floor((cy + oy) / TS);
    if (isSolid(tx, ty)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- draw
function drawText(t, x, y, col, align) {
  ctx.font = '8px "Courier New", monospace';
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#17101c';
  ctx.fillText(t, x + 1, y + 1);
  ctx.fillStyle = col || '#ffeedd';
  ctx.fillText(t, x, y);
}

function draw() {
  ctx.fillStyle = '#4e8c33';
  ctx.fillRect(0, 0, VW, VH);
  if (!S) return;
  const cx = Math.round(R.camx), cy = Math.round(R.camy);
  ctx.save();
  ctx.translate(-cx, -cy);

  const x0 = Math.floor(cx / TS), x1 = Math.min(MW - 1, Math.ceil((cx + VW) / TS));
  const y0 = Math.floor(cy / TS), y1 = Math.min(MH - 1, Math.ceil((cy + VH) / TS));
  const wf = WATER_FRAMES[Math.floor(R.t * 3) % 4];

  // ground layer
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const ch = terrain[y][x];
    let img = TILE.g;
    if (ch === 'G') img = TILE.g2;
    else if (ch === 'p') img = TILE.p;
    else if (ch === 'w') img = wf;
    else if (ch === 's') {
      const i = idx(x, y);
      img = S.tilled[i] ? (S.watered[i] ? TILE.t1 : TILE.t0) : TILE.s;
    } else if (ch === 'H' || ch === 'D' || ch === 'M' || ch === 'C') img = TILE.g;
    else if (ch === 'f' || ch === 't' || ch === 'b') img = TILE.g;
    ctx.drawImage(img, x * TS, y * TS);
    if (ch === 'w') { // sandy shoreline where water meets land
      const px = x * TS, py = y * TS;
      ctx.fillStyle = '#cbb183';
      if (terrain[y - 1] && terrain[y - 1][x] !== 'w') ctx.fillRect(px, py, TS, 2);
      if (terrain[y + 1] && terrain[y + 1][x] !== 'w') ctx.fillRect(px, py + TS - 2, TS, 2);
      if (terrain[y][x - 1] !== 'w') ctx.fillRect(px, py, 2, TS);
      if (terrain[y][x + 1] !== 'w') ctx.fillRect(px + TS - 2, py, 2, TS);
    }
  }

  // target highlight
  if (R.mode === 'play') {
    const f = facingTile();
    if (f.x >= 0 && f.y >= 0 && f.x < MW && f.y < MH && terrain[f.y][f.x] === 's') {
      ctx.strokeStyle = R.useFlash > 0 ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(f.x * TS + .5, f.y * TS + .5, TS - 1, TS - 1);
    }
  }

  // crops
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const c = S.crops[idx(x, y)];
    if (!c) continue;
    const ripe = c.stage >= CROPS[c.id].grow;
    const bob = ripe ? Math.round(Math.sin(R.t * 2.4 + x + y) * 1) : 0;
    ctx.drawImage(CROP_SPR[c.id][c.stage], x * TS, y * TS + bob);
  }

  // y-sorted object layer: {sy: sort key, x, y: top-left draw pos, img}
  const objs = [];
  for (let y = y0; y <= y1 + 2; y++) for (let x = x0; x <= x1; x++) {
    if (y >= MH) continue;
    const ch = terrain[y][x];
    if (ch === 't') objs.push({ sy: (y + 1) * TS, x: x * TS, y: (y + 1) * TS - TREE.height, img: TREE });
    else if (ch === 'b') objs.push({ sy: (y + 1) * TS, x: x * TS, y: y * TS, img: BUSH });
    else if (ch === 'f') {
      const horiz = terrain[y][x - 1] === 'f' || terrain[y][x + 1] === 'f';
      objs.push({ sy: (y + 1) * TS, x: x * TS, y: y * TS, img: horiz ? FENCE : FENCE_V });
    }
  }
  // buildings (bottom edge aligned to the tile row below them)
  objs.push({ sy: 6 * TS, x: 3 * TS, y: 6 * TS - HOUSE.height, img: HOUSE });
  objs.push({ sy: 6 * TS, x: 20 * TS, y: 6 * TS - STALL.height, img: STALL });
  objs.push({ sy: 12 * TS, x: 25 * TS, y: 12 * TS - COOP.height, img: COOP });
  for (const e of S.eggs) objs.push({ sy: e.y + 4, x: e.x - 8, y: e.y - 8 + Math.round(Math.sin(R.t * 3 + e.x)), img: EGG });
  for (let i = 0; i < S.chickens; i++) {
    const a = R.t * .55 + i * 2.1;
    const cxp = (26.5 + Math.cos(a) * 2.2) * TS, cyp = (13.4 + Math.sin(a * 1.3) * 1.1) * TS;
    objs.push({ sy: cyp + 6, x: cxp - 6, y: cyp - 8, img: CHICKEN[Math.floor(R.t * 6 + i) % 2], flip: Math.cos(a + .3) < 0 });
  }
  objs.push({ sy: S.py + 8, player: true });

  objs.sort((a, b) => a.sy - b.sy);
  for (const o of objs) {
    if (o.player) { drawPlayer(); continue; }
    const dx = Math.round(o.x), dy = Math.round(o.y);
    if (o.flip) {
      ctx.save(); ctx.translate(dx + o.img.width, dy); ctx.scale(-1, 1);
      ctx.drawImage(o.img, 0, 0); ctx.restore();
    } else ctx.drawImage(o.img, dx, dy);
  }

  // particles
  for (const d of R.drops) {
    ctx.fillStyle = d.c;
    ctx.fillRect(Math.round(d.x), Math.round(d.y), 2, 2);
  }
  for (const p of R.pops) {
    ctx.globalAlpha = clamp(1.4 - p.t, 0, 1);
    drawText(p.msg, Math.round(p.x), Math.round(p.y - p.t * 14), p.col, 'center');
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  drawRain();
  drawNight();
  drawHUD();
}

function drawPlayer() {
  const frames = PLAYER[R.dir];
  const img = frames[R.frame];
  const x = Math.round(S.px - 8), y = Math.round(S.py - 11);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.beginPath(); ctx.ellipse(Math.round(S.px), Math.round(S.py + 4), 6, 2.5, 0, 0, 7); ctx.fill();
  if (R.dirFull === 'left') {
    ctx.save(); ctx.translate(x + 16, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0); ctx.restore();
  } else ctx.drawImage(img, x, y);

  // held tool
  if (R.mode === 'play') {
    const tool = TOOLS[S.tool];
    const off = R.useFlash > 0 ? 2 : 0;
    const hx = R.dirFull === 'left' ? x - 5 - off : x + 5 + off;
    if (R.dirFull !== 'up') {
      ctx.save();
      ctx.globalAlpha = .98;
      if (R.dirFull === 'left') { ctx.translate(hx + 16, y + 2); ctx.scale(-1, 1); ctx.drawImage(tool.spr, 0, 0); }
      else ctx.drawImage(tool.spr, hx, y + 2);
      ctx.restore();
    }
  }
}

function drawRain() {
  if (!S || S.weather !== 'rain') return;
  ctx.fillStyle = 'rgba(70,100,150,.18)';
  ctx.fillRect(0, 0, VW, VH);
  ctx.fillStyle = 'rgba(190,220,255,.55)';
  for (let i = 0; i < 70; i++) {
    const sp = 150 + (i % 5) * 40;
    const x = (i * 57 + R.t * 40) % VW;
    const y = (i * 91 + R.t * sp) % VH;
    ctx.fillRect(x | 0, y | 0, 1, 4);
  }
}

function drawNight() {
  const t = S.time;
  let a = 0, tint = '10,12,40';
  if (t < 7 * 60) { a = (7 * 60 - t) / 60 * .35; tint = '40,30,70'; }
  else if (t > 17 * 60 && t <= 19.5 * 60) { a = (t - 17 * 60) / (2.5 * 60) * .30; tint = '90,40,30'; }
  else if (t > 19.5 * 60) { a = .30 + Math.min(1, (t - 19.5 * 60) / (3 * 60)) * .32; tint = '20,18,55'; }
  if (S.weather === 'rain') a = Math.max(a, .18);
  a = clamp(a, 0, .62);
  if (a > 0) { ctx.fillStyle = `rgba(${tint},${a})`; ctx.fillRect(0, 0, VW, VH); }
}

function panel(x, y, w, h) {
  ctx.fillStyle = 'rgba(32,22,40,.86)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(120,96,140,.9)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
}

function drawHUD() {
  // top-left info
  panel(4, 4, 92, 34);
  drawText(`Day ${S.day}`, 9, 8, '#ffeedd');
  drawText(clockStr(), 90, 8, S.time > 22 * 60 ? '#ff8a7a' : '#9fd6ef', 'right');
  // energy bar
  drawText('EN', 9, 19, '#bba7c7');
  ctx.fillStyle = '#1b1324'; ctx.fillRect(24, 19, 50, 6);
  const ew = Math.round(48 * clamp(S.energy / S.maxEnergy, 0, 1));
  ctx.fillStyle = S.energy > 30 ? '#8fd96b' : '#ff8a7a';
  ctx.fillRect(25, 20, ew, 4);
  ctx.strokeStyle = '#4d3a57'; ctx.strokeRect(24.5, 19.5, 49, 5);
  // water
  drawText('WA', 9, 28, '#bba7c7');
  ctx.fillStyle = '#1b1324'; ctx.fillRect(24, 28, 50, 6);
  ctx.fillStyle = '#4aa7d8';
  ctx.fillRect(25, 29, Math.round(48 * clamp(S.water / S.maxWater, 0, 1)), 4);
  ctx.strokeStyle = '#4d3a57'; ctx.strokeRect(24.5, 28.5, 49, 5);

  // coins
  panel(VW - 68, 4, 64, 16);
  ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(VW - 58, 12, 4, 0, 7); ctx.fill();
  ctx.fillStyle = '#c99a2e'; ctx.fillRect(VW - 59, 10, 2, 4);
  drawText(`${S.coins}g`, VW - 9, 8, C.gold, 'right');

  // hotbar
  const n = TOOLS.length, bw = 20, gap = 2;
  const total = n * bw + (n - 1) * gap;
  const bx = Math.round((VW - total) / 2), by = VH - 25;
  for (let i = 0; i < n; i++) {
    const x = bx + i * (bw + gap);
    const sel = i === S.tool;
    ctx.fillStyle = sel ? 'rgba(255,213,107,.92)' : 'rgba(32,22,40,.86)';
    ctx.fillRect(x, by, bw, bw);
    ctx.strokeStyle = sel ? '#fff3cf' : 'rgba(120,96,140,.9)';
    ctx.strokeRect(x + .5, by + .5, bw - 1, bw - 1);
    ctx.drawImage(TOOLS[i].spr, x + 2, by + 2);
    const t = TOOLS[i];
    if (t.crop) drawText(String(S.seeds[t.crop]), x + bw - 2, by + bw - 9, S.seeds[t.crop] ? '#ffffff' : '#ff8a7a', 'right');
    drawText(String(i + 1), x + 2, by - 1, sel ? '#2b1d2b' : '#8d7b98');
  }
  drawText(TOOLS[S.tool].name, VW / 2, VH - 8, '#ffeedd', 'center');

  // bag summary
  const items = CROP_IDS.filter(id => S.bag[id] > 0);
  if (S.bag.egg > 0) items.push('egg');
  if (items.length) {
    const w = items.length * 18 + 6;
    panel(4, VH - 26, w, 22);
    items.forEach((id, i) => {
      const img = id === 'egg' ? EGG : ITEM_SPR[id];
      ctx.drawImage(img, 6 + i * 18, VH - 26);
      drawText(String(S.bag[id]), 6 + i * 18 + 16, VH - 13, '#ffeedd', 'right');
    });
  }

  // contextual hint
  const f = facingTile();
  let hint = '';
  if (f.x >= 0 && f.y >= 0 && f.x < MW && f.y < MH) {
    const ch = terrain[f.y][f.x];
    const c = S.crops[idx(f.x, f.y)];
    if (ch === 'D' || ch === 'H') hint = 'E — Sleep until morning';
    else if (ch === 'M') hint = 'E — Open the market';
    else if (ch === 'w') hint = 'E — Refill watering can';
    else if (c && c.stage >= CROPS[c.id].grow) hint = `E — Harvest ${CROPS[c.id].name}`;
  }
  if (hint) {
    const w = hint.length * 5 + 10;
    panel(Math.round((VW - w) / 2), 24, w, 14);
    drawText(hint, VW / 2, 28, C.gold, 'center');
  }

  // toasts
  R.toasts.forEach((t, i) => {
    ctx.globalAlpha = clamp(2.6 - t.t, 0, 1);
    drawText(t.msg, VW / 2, 44 + i * 10, t.col, 'center');
    ctx.globalAlpha = 1;
  });
}

// ---------------------------------------------------------------- UI: shop
const $ = id => document.getElementById(id);
function miniIcon(img) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}
function openShop() {
  R.mode = 'shop';
  renderShop();
  $('shop').classList.remove('hidden');
}
function closeShop() { R.mode = 'play'; $('shop').classList.add('hidden'); save(); }

function renderShop() {
  const buy = $('buyList'); buy.innerHTML = '';
  for (const id of CROP_IDS) {
    const d = CROPS[id];
    const row = document.createElement('div');
    row.className = 'row' + (S.coins < d.seed ? ' dim' : '');
    row.appendChild(miniIcon(SEED_BAG[id]));
    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.innerHTML = `${d.name} seeds<br><small style="color:#8d7b98">${d.grow} days · sells ${d.sell}g</small>`;
    row.appendChild(nm);
    const pr = document.createElement('div'); pr.className = 'pr'; pr.textContent = d.seed + 'g';
    row.appendChild(pr);
    const b = document.createElement('button');
    b.textContent = 'BUY'; b.disabled = S.coins < d.seed;
    b.onclick = () => {
      if (S.coins < d.seed) return;
      S.coins -= d.seed; S.seeds[id]++; SFX.coin(); renderShop();
    };
    row.appendChild(b);
    buy.appendChild(row);
  }
  // chicken
  const chickCost = 150 + S.chickens * 80;
  const crow = document.createElement('div');
  crow.className = 'row' + (S.coins < chickCost ? ' dim' : '');
  crow.appendChild(miniIcon(CHICKEN[0]));
  const cn = document.createElement('div'); cn.className = 'nm';
  cn.innerHTML = `Chicken<br><small style="color:#8d7b98">lays an egg every morning</small>`;
  crow.appendChild(cn);
  const cp = document.createElement('div'); cp.className = 'pr'; cp.textContent = chickCost + 'g';
  crow.appendChild(cp);
  const cb = document.createElement('button');
  cb.textContent = 'BUY'; cb.disabled = S.coins < chickCost || S.chickens >= 6;
  cb.onclick = () => { if (S.coins < chickCost) return; S.coins -= chickCost; S.chickens++; SFX.coin(); renderShop(); };
  crow.appendChild(cb);
  buy.appendChild(crow);

  // sell
  const sell = $('sellList'); sell.innerHTML = '';
  const entries = [...CROP_IDS.map(id => [id, CROPS[id].name, CROPS[id].sell, ITEM_SPR[id]]), ['egg', 'Egg', 45, EGG]]
    .filter(e => S.bag[e[0]] > 0);
  if (!entries.length) {
    const d = document.createElement('div');
    d.className = 'empty';
    d.textContent = 'Your basket is empty. Come back with a harvest!';
    sell.appendChild(d);
  }
  for (const [id, name, price, img] of entries) {
    const row = document.createElement('div');
    row.className = 'row';
    row.appendChild(miniIcon(img));
    const nm = document.createElement('div'); nm.className = 'nm';
    nm.innerHTML = `${name} <small style="color:#8d7b98">x${S.bag[id]}</small>`;
    row.appendChild(nm);
    const pr = document.createElement('div'); pr.className = 'pr'; pr.textContent = price + 'g';
    row.appendChild(pr);
    const b = document.createElement('button');
    b.textContent = 'SELL';
    b.onclick = () => { S.bag[id]--; S.coins += price; S.earned += price; SFX.coin(); renderShop(); };
    row.appendChild(b);
    sell.appendChild(row);
  }
  $('shopCoins').textContent = S.coins + 'g';
}
$('sellAll').onclick = () => {
  let total = 0;
  for (const id of CROP_IDS) { total += S.bag[id] * CROPS[id].sell; S.bag[id] = 0; }
  total += S.bag.egg * 45; S.bag.egg = 0;
  if (total > 0) { S.coins += total; S.earned += total; SFX.coin(); toast(`Sold everything for ${total}g`, C.gold); }
  renderShop();
};
$('shopClose').onclick = closeShop;

// ---------------------------------------------------------------- UI: sleep
function showSleep(lines) {
  R.mode = 'sleep';
  $('sleepTitle').textContent = `DAY ${S.day}`;
  const body = $('sleepBody'); body.innerHTML = '';
  for (const [txt, col] of lines) {
    const d = document.createElement('div');
    d.className = 'row';
    d.style.justifyContent = 'center';
    d.innerHTML = `<span style="color:${col}">${txt}</span>`;
    body.appendChild(d);
  }
  $('sleep').classList.remove('hidden');
}
function closeSleep() { $('sleep').classList.add('hidden'); R.mode = 'play'; }
$('sleepClose').onclick = closeSleep;

// ---------------------------------------------------------------- title / boot
function start(fresh) {
  S = fresh ? freshState() : (load() || freshState());
  R.dirFull = 'down'; R.dir = 'down';
  R.mode = 'play';
  $('title').classList.add('hidden');
  toast('Welcome to your farm!', '#8fd96b');
  save();
}
$('btnPlay').onclick = () => start(false);
$('btnNew').onclick = () => {
  if (hasSave() && !confirm('Start a brand new farm? Your current save will be lost.')) return;
  localStorage.removeItem(SAVE_KEY);
  start(true);
};
if (hasSave()) $('btnPlay').textContent = 'CONTINUE';

// autosave
setInterval(() => { if (S && R.mode === 'play') save(); }, 10000);
addEventListener('beforeunload', () => { if (S) save(); });

// ---------------------------------------------------------------- resize + loop
function resize() {
  const pad = 8;
  const sw = innerWidth - pad * 2, sh = innerHeight - pad * 2;
  let scale = Math.min(sw / VW, sh / VH);
  scale = Math.max(1, scale >= 2 ? Math.floor(scale * 2) / 2 : scale);
  cv.style.width = Math.round(VW * scale) + 'px';
  cv.style.height = Math.round(VH * scale) + 'px';
}
addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now) {
  const dt = Math.max(0, Math.min(.05, (now - last) / 1000));
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// debug handle (handy for testing in the console)
window.PixelHarvest = { get state() { return S; }, runtime: R, terrain, TOOLS, save, reset() { localStorage.removeItem(SAVE_KEY); location.reload(); } };

})();
