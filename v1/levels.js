/* Level data & tileset
   Grid is 16x16 pixel tiles. Camera shows 60x33 tiles at 960x528 (with HUD).
*/
(() => {
  const T = {
    EMPTY: 0,
    GROUND: 1,
    BOX_Q: 2,        // question block
    BOX_USED: 3,
    TUBE_TOP: 4,     // cardboard tube
    TUBE_BODY: 5,
    PLATFORM: 6,
    FLAG_POLE: 7,
    FLAG_TOP: 8,
    CAT_TREE: 9
  };

  // Helper to make a ground line
  function groundRow(width, ySolidFrom = 28) {
    const row = new Array(width).fill(T.EMPTY);
    for (let i = ySolidFrom; i < 34; i++) row[i] = T.GROUND;
    return row;
  }

  // Build a simple 1-1 style level procedurally:
  // width in tiles ~ 320 (long enough to feel like a level)
  function buildLevel({ easy=false } = {}) {
    const W = 320, H = 34;
    const map = Array.from({ length: W }, () => new Array(H).fill(T.EMPTY));

    // Ground
    for (let x = 0; x < W; x++) {
      for (let y = 28; y < H; y++) map[x][y] = T.GROUND;
    }

    // Small stairs and platforms (easier in Easy Mode)
    const gaps = easy ? [24, 25, 26] : [24, 25, 26, 60, 61, 62, 95, 96, 130, 131, 132, 180, 181, 220, 221, 260];
    gaps.forEach(x => { for (let y = 28; y < H; y++) map[x][y] = T.EMPTY; });

    const platY = easy ? 21 : 19;
    for (let x = 40; x < 46; x++) map[x][platY] = T.PLATFORM;
    for (let x = 100; x < 106; x++) map[x][platY-1] = T.PLATFORM;
    for (let x = 150; x < 156; x++) map[x][platY-2] = T.PLATFORM;
    if (easy) { for (let x = 60; x < 64; x++) map[x][22] = T.PLATFORM; }

    // Cardboard tubes (pipes)
    function tube(x, height=3) {
      map[x][28-height] = T.TUBE_TOP;
      for (let i=1;i<height;i++) map[x][28-height+i] = T.TUBE_BODY;
    }
    tube(70, 3); tube(120, 4); tube(170, 2); tube(210, 5);

    // Question blocks with treats
    const qBlocks = [
      {x: 20, y: 18, reward: 'fish'},
      {x: 21, y: 18, reward: 'coin'},
      {x: 22, y: 18, reward: 'yarn'},
      {x: 75, y: 16, reward: 'coin'},
      {x: 101, y: 15, reward: 'fish'},
      {x: 151, y: 14, reward: 'coin'},
      {x: 152, y: 14, reward: 'yarn'},
    ];
    qBlocks.forEach(({x,y}) => map[x][y] = T.BOX_Q);

    // Flag / cat tree goal
    for (let y=10; y<28; y++) map[W-8][y] = T.FLAG_POLE;
    map[W-8][9] = T.FLAG_TOP;
    map[W-6][24] = T.CAT_TREE;

    // Enemy & item placements
    const enemies = [
      // Angry chocolate chips (goomba-like)
      { type: 'chip', x: 18*16, y: 27*16 },
      { type: 'chip', x: 44*16, y: 27*16 },
      { type: 'chip', x: 66*16, y: 27*16 },
      { type: 'chip', x: 146*16, y: 27*16 },
      // Gummy bears (koopas)
      { type: 'gummy', x: 88*16, y: 27*16 },
      { type: 'gummy', x: 134*16, y: 27*16 },
      { type: 'gummy', x: 205*16, y: 27*16 },
    ];

    const marshmallows = [
      { x: 35*16, y: 27*16, text: "Hi! Press X to toss yarn!" },
      { x: 125*16, y: 27*16, text: "Easy Mode helps with jumps." }
    ];

    const questionRewards = {};
    qBlocks.forEach(({x,y,reward}) => { questionRewards[`${x}:${y}`] = reward; });

    return { T, map, W, H, enemies, marshmallows, questionRewards };
  }

  window.Levels = { buildLevel };
})();
