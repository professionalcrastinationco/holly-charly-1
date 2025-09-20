/* Main game loop, rendering, collisions, input, audio, and level flow */
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const HUD = {
    score: document.getElementById('score'),
    lives: document.getElementById('lives'),
    power: document.getElementById('power'),
    easy: document.getElementById('easyMode'),
    restart: document.getElementById('restartBtn'),
    twoP: document.getElementById('twoPlayerBtn'),
    mute: document.getElementById('muteBtn')
  };
  const uiLayer = document.body; // for score pops

  const { Player, Chip, Gummy, Yarn, Item, Particle, ScorePop, aabb, TILE } = window.Engine;

  // ---- Audio (Web Audio API) ----
  const Audio = (() => {
    const A = new (window.AudioContext || window.webkitAudioContext)();
    let muted = false, bgGain = A.createGain(), sfxGain = A.createGain();
    bgGain.gain.value = 0.15; sfxGain.gain.value = 0.35;
    bgGain.connect(A.destination); sfxGain.connect(A.destination);
    let bgOsc, bgFilter;

    function playBeep(freq=440, dur=0.08, type='square', vol=0.5) {
      if (muted) return;
      const o = A.createOscillator(); const g = A.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.value = vol; o.connect(g); g.connect(sfxGain);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, A.currentTime + Math.max(0.03, dur));
      o.stop(A.currentTime + Math.max(0.04, dur+0.02));
    }

    function jump() { playBeep(600, 0.08, 'square', 0.4); }
    function coin() { playBeep(1100, 0.1, 'triangle', 0.4); }
    function power() { playBeep(520, 0.12, 'sawtooth', 0.35); setTimeout(()=>playBeep(760,0.12,'sawtooth',0.35), 60); }
    function hurt() { playBeep(160, 0.14, 'square', 0.4); }
    function lose() { playBeep(140, 0.3, 'sawtooth', 0.5); }
    function stomp() { playBeep(300, 0.06, 'triangle', 0.4); }
    function throwYarn() { playBeep(900, 0.06, 'square', 0.3); }

    function startBg() {
      if (muted) return;
      if (bgOsc) return;
      bgOsc = A.createOscillator();
      bgFilter = A.createBiquadFilter();
      bgFilter.type = "lowpass"; bgFilter.frequency.value = 1000;
      bgOsc.type = 'triangle'; bgOsc.frequency.value = 220;
      const lfo = A.createOscillator(); const lfoGain = A.createGain();
      lfo.frequency.value = 0.2; lfoGain.gain.value = 20;
      lfo.connect(lfoGain); lfoGain.connect(bgOsc.frequency);
      bgOsc.connect(bgFilter); bgFilter.connect(bgGain);
      bgOsc.start(); lfo.start();
    }
    function stopBg() { if (bgOsc) { bgOsc.stop(); bgOsc.disconnect(); bgOsc = null; } }

    function setMuted(m) { muted = m; if (muted) stopBg(); else startBg(); }

    const api = (name) => {
      switch(name) {
        case 'jump': return jump();
        case 'coin': return coin();
        case 'power': return power();
        case 'hurt': return hurt();
        case 'lose': return lose();
        case 'stomp': return stomp();
        case 'throw': return throwYarn();
      }
    };
    api.startBg = startBg;
    api.setMuted = setMuted;
    api.isMuted = () => muted;
    api.resume = () => A.resume && A.resume();
    return api;
  })();

  // ---- Input ----
  const inputTemplate = () => ({
    left:false, right:false, jump:false, jumpPressed:false, shift:false, throw:false
  });
  const input1 = inputTemplate(), input2 = inputTemplate();
  const keys = {};
  window.addEventListener('keydown', (e)=>{ keys[e.code]=true; });
  window.addEventListener('keyup',   (e)=>{ keys[e.code]=false; });

  function pollInput() {
    // Player 1: arrows + Shift + Space/ArrowUp, X to throw
    input1.left  = !!(keys['ArrowLeft']);
    input1.right = !!(keys['ArrowRight']);
    const wasJump = input1.jump; input1.jump = !!(keys['Space'] || keys['ArrowUp']);
    input1.jumpPressed = input1.jump && !wasJump;
    input1.shift = !!(keys['ShiftRight'] || keys['ShiftLeft']);
    input1.throw = !!keys['KeyX'];

    // Player 2 (optional): WASD + LeftShift + F to throw
    input2.left  = !!keys['KeyA'];
    input2.right = !!keys['KeyD'];
    const wasJump2 = input2.jump; input2.jump = !!keys['KeyW'];
    input2.jumpPressed = input2.jump && !wasJump2;
    input2.shift = !!keys['ShiftLeft'];
    input2.throw = !!keys['KeyF'];
  }

  // ---- World / Level ----
  let state;
  function resetLevel() {
    const easy = HUD.easy.checked;
    const L = window.Levels.buildLevel({ easy });
    state = {
      T: L.T, map: L.map, W:L.W, H:L.H,
      cam: { x:0, y:0 },
      players: [],
      enemies: [],
      items: [],
      projectiles: [],
      particles: [],
      pops: [],
      marshmallows: L.marshmallows,
      questionRewards: L.questionRewards,
      started: false,
      finished: false,
      time: 0,
      twoP: twoPlayer
    };
    const p1 = new Player(32, (27*16)-14, 'kitten');
    p1.lives = livesP1; p1.score = scoreP1; p1.setPower(powerP1);
    state.players.push(p1);

    if (twoPlayer) {
      const p2 = new Player(60, (27*16)-14, 'puppy');
      p2.lives = livesP2; p2.score = scoreP2; p2.setPower(powerP2);
      state.players.push(p2);
    }

    // Enemies
    for (const e of L.enemies) {
      if (e.type === 'chip') state.enemies.push(new Chip(e.x, e.y));
      if (e.type === 'gummy') state.enemies.push(new Gummy(e.x, e.y));
    }

    // Fill question block reward cache already set in L.questionRewards

    Audio.resume();
  }

  // Camera solid test helper
  function solidAtRect(x, y, w, h) { return solidAt(x, y, w, h, state.map, state.T); }
  function solidAt(x, y, w, h, map, T) {
    const x0 = Math.floor(x / TILE), x1 = Math.floor((x+w-1)/TILE);
    const y0 = Math.floor(y / TILE), y1 = Math.floor((y+h-1)/TILE);
    for (let tx=x0; tx<=x1; tx++) {
      for (let ty=y0; ty<=y1; ty++) {
        const t = tileAt(tx, ty, map);
        if (t === T.GROUND || t === T.TUBE_TOP || t === T.TUBE_BODY || t === T.PLATFORM || t === T.FLAG_POLE || t === T.CAT_TREE) return true;
        if (t === T.BOX_Q || t === T.BOX_USED) return true;
      }
    }
    return false;
  }
  function tileAt(tx, ty, map) {
    if (tx < 0 || ty < 0 || tx >= state.W || ty >= state.H) return 1; // treat out-of-bounds as solid
    return map[tx][ty];
  }

  // Spawn particles
  function poof(x,y,color) {
    for (let i=0;i<8;i++) state.particles.push(new Particle(x, y, (Math.random()-0.5)*2, -Math.random()*2-1, 30, color));
  }

  // ----- Gameplay helpers -----
  let twoPlayer = false;
  let livesP1 = 3, livesP2 = 3, scoreP1 = 0, scoreP2 = 0, powerP1 = 'small', powerP2='small';

  function addScore(p, amt, x, y) {
    p.score += amt;
    state.pops.push(new ScorePop(x, y, amt, document.body));
  }

  function setHUD() {
    const p = state.players[0];
    HUD.score.textContent = (p.score).toString().padStart(6, '0');
    HUD.lives.textContent = p.lives;
    HUD.power.textContent = p.power === 'small' ? 'Small' : (p.power === 'big' ? 'Big' : 'Yarn');
    HUD.twoP.textContent = `2P: ${twoPlayer ? 'On' : 'Off'}`;
    HUD.mute.textContent = Audio.isMuted() ? '🔇' : '🔈';
  }

  HUD.restart.addEventListener('click', () => { saveFromPlayers(); resetLevel(); });
  HUD.easy.addEventListener('change', () => { saveFromPlayers(); resetLevel(); });
  HUD.twoP.addEventListener('click', () => { twoPlayer = !twoPlayer; saveFromPlayers(); resetLevel(); });
  HUD.mute.addEventListener('click', () => { Audio.setMuted(!Audio.isMuted()); setHUD(); });

  function saveFromPlayers() {
    if (!state || !state.players.length) return;
    const p1 = state.players[0];
    livesP1 = p1.lives; scoreP1 = p1.score; powerP1 = p1.power;
    if (state.players[1]) { const p2 = state.players[1]; livesP2 = p2.lives; scoreP2 = p2.score; powerP2 = p2.power; }
  }

  // Question block hit
  function hitHead(p) {
    // check block directly above
    const tx = Math.floor((p.x + p.w/2)/TILE);
    const ty = Math.floor((p.y-1)/TILE);
    const t = tileAt(tx, ty, state.map);
    if (t === state.T.BOX_Q) {
      state.map[tx][ty] = state.T.BOX_USED;
      const key = `${tx}:${ty}`;
      const reward = state.questionRewards[key] || 'coin';
      const spawnX = tx*TILE + 2, spawnY = ty*TILE - 2;
      let itemType = 'coin';
      if (reward === 'fish') itemType = 'fish';
      if (reward === 'yarn') itemType = 'yarn';
      const item = new Item(spawnX, spawnY, itemType);
      state.items.push(item);
      Audio('coin'); addScore(p, 100, p.x, p.y-10);
      poof(spawnX, spawnY, reward==='yarn' ? '#b565d9' : (reward==='fish' ? '#7cd1f7' : '#ffd166'));
    }
  }

  // Collect item
  function tryCollect(p, it) {
    if (!aabb(p.bbox(), it.bbox())) return false;
    if (it.type === 'coin') { addScore(p, 200, it.x, it.y); Audio('coin'); }
    if (it.type === 'fish') { p.setPower('big'); addScore(p, 500, it.x, it.y); Audio('power'); }
    if (it.type === 'yarn') { p.setPower('yarn'); addScore(p, 800, it.x, it.y); Audio('power'); }
    it.dead = true;
    // celebratory particles
    poof(p.x+p.w/2, p.y, it.type==='yarn' ? '#b565d9' : it.type==='fish' ? '#7cd1f7' : '#ffd166');
    return true;
  }

  // Enemy interactions
  function playerEnemy(p, e) {
    if (e.dead) return;
    const pb = p.bbox(), eb = e.bbox();
    if (!aabb(pb, eb)) return;

    // Determine if stomp (player falling and feet above top)
    const feetAbove = (p.vy > 0) && (pb.y + pb.h - 3) < (eb.y + 4);
    if (feetAbove) {
      // stomp
      if (e instanceof Chip) {
        e.stomped = true; p.vy = -7; Audio('stomp'); addScore(p, 100, e.x, e.y-8); poof(e.x, e.y, '#6b3a1e');
      } else if (e instanceof Gummy) {
        if (!e.shell) { e.shell = true; e.vx = 0; e.shellVx = 0; p.vy = -7; Audio('stomp'); addScore(p, 200, e.x, e.y-8); }
        else { // kick shell
          e.shellVx = (p.x < e.x ? 1 : -1) * 4.5; p.vy = -6; Audio('stomp'); addScore(p, 400, e.x, e.y-8);
        }
      }
    } else {
      // side collision -> damage
      p.damage(Audio);
    }
  }

  // Yarn vs enemy
  function yarnHit(y, e) {
    if (e.dead || y.dead) return false;
    if (aabb(y.bbox(), e.bbox())) {
      if (e instanceof Chip) { e.stomped = true; }
      if (e instanceof Gummy) { e.shell = true; e.vx = 0; e.shellVx = Math.sign(y.vx) * 4.5; }
      y.dead = true; Audio('stomp'); poof(e.x, e.y, '#b565d9'); return true;
    }
    return false;
  }

  // Goal / flag
  function checkGoal(p) {
    const tx = Math.floor((p.x + p.w/2)/TILE);
    if (tx >= state.W-8-1) {
      state.finished = true;
      addScore(p, 2000, p.x, p.y - 20);
    }
  }

  // ---- Rendering tiles & NPCs ----
  function drawTiles() {
    const T = state.T, map = state.map;
    const camX = Math.floor(state.cam.x / TILE), camY = Math.floor(state.cam.y / TILE);
    const viewW = Math.ceil(canvas.width / TILE) + 2, viewH = Math.ceil(canvas.height / TILE) + 2;

    for (let x = camX; x < camX + viewW; x++) {
      for (let y = camY; y < camY + viewH; y++) {
        const t = tileAt(x, y, map);
        const px = x*TILE - state.cam.x, py = y*TILE - state.cam.y;
        if (t === T.GROUND) {
          ctx.fillStyle = '#7dcf7f'; ctx.fillRect(px, py, TILE, TILE);
          ctx.strokeStyle = '#62b463'; ctx.strokeRect(px, py, TILE, TILE);
        } else if (t === T.PLATFORM) {
          ctx.fillStyle = '#caffbf'; ctx.fillRect(px, py, TILE, 6);
          ctx.fillStyle = '#a8f19f'; ctx.fillRect(px, py+6, TILE, 4);
        } else if (t === T.TUBE_TOP || t === T.TUBE_BODY) {
          // cardboard tube
          ctx.fillStyle = '#d6c4a3';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#b59f76';
          ctx.fillRect(px+3, py, TILE-6, TILE);
          if (t === T.TUBE_TOP) { ctx.fillStyle = '#e7d8ba'; ctx.fillRect(px, py, TILE, 4); }
        } else if (t === T.BOX_Q) {
          ctx.fillStyle = '#ffd166'; ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#ad8d29'; ctx.fillRect(px+3, py+3, TILE-6, TILE-6);
          // '?' mark
          ctx.fillStyle = '#fff';
          ctx.fillRect(px+7, py+6, 2, 2); ctx.fillRect(px+7, py+10, 2, 2);
          ctx.fillRect(px+5, py+6, 2, 2);
          ctx.fillRect(px+9, py+6, 2, 2);
          ctx.fillRect(px+7, py+8, 2, 2);
        } else if (t === T.BOX_USED) {
          ctx.fillStyle = '#c9c9c9'; ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#a1a1a1'; ctx.fillRect(px+3, py+3, TILE-6, TILE-6);
        } else if (t === T.FLAG_POLE) {
          ctx.fillStyle = '#a7b8ff'; ctx.fillRect(px+6, py, 4, TILE);
        } else if (t === T.FLAG_TOP) {
          ctx.fillStyle = '#a7b8ff'; ctx.fillRect(px+6, py, 4, TILE);
          ctx.fillStyle = '#ff8c42'; ctx.fillRect(px+10, py+2, 18, 10);
        } else if (t === T.CAT_TREE) {
          // Cat tree base
          ctx.fillStyle = '#cdb79e'; ctx.fillRect(px, py, TILE*2, TILE);
          ctx.fillStyle = '#aa8f6a'; ctx.fillRect(px+6, py-24, 6, 24); // pole
          ctx.fillStyle = '#e6d1b8'; ctx.fillRect(px-6, py-32, TILE+12, 10); // perch
        }
      }
    }

    // Marshmallow NPCs
    for (const m of state.marshmallows) {
      if (m.x - state.cam.x < -64 || m.x - state.cam.x > canvas.width + 64) continue;
      const px = Math.floor(m.x - state.cam.x), py = Math.floor(m.y - state.cam.y);
      // squishy body
      roundedBlob(px, py-10, 18, 16, '#fff0f0', '#f7caca');
      // eyes
      ctx.fillStyle = '#222'; ctx.fillRect(px+6, py-18, 2, 2); ctx.fillRect(px+12, py-18, 2, 2);
      // speech bubble
      if (Math.abs(state.players[0].x - m.x) < 80) {
        bubble(px-10, py-40, m.text);
      }
    }
  }

  function roundedBlob(x,y,w,h,fill,edge) {
    ctx.fillStyle = fill; ctx.strokeStyle = edge;
    ctx.beginPath();
    ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI*2);
    ctx.fill(); ctx.stroke();
  }
  function bubble(x,y,text) {
    ctx.fillStyle = '#ffffffee'; ctx.strokeStyle = '#ccd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, 160, 36, 10);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#334';
    ctx.font = '12px system-ui'; ctx.fillText(text, x+8, y+22);
    ctx.lineWidth = 1;
  }

  // ---- Game loop ----
  let last = 0;
  function loop(ts) {
    window.requestAnimationFrame(loop);
    if (!last) last = ts;
    const dt = Math.min(32, ts - last); last = ts;
    tick(dt);
    render(ts/16.67);
  }

  function tick(dt) {
    state.time += dt;

    pollInput();
    const addProjectile = (p) => state.projectiles.push(p);

    // Update players
    for (const [i,p] of state.players.entries()) {
      const input = i===0 ? input1 : input2;
      p.update(input, solidAtRect, addProjectile, Audio);

      // prevent going backward past camera left
      if (p.x < state.cam.x + 2) p.x = state.cam.x + 2;

      // bump boxes with head if jumping upward into them
      if (p.vy < 0) hitHead(p);

      // death if fall
      if (p.y > state.H * TILE) {
        p.damage(Audio); p.dead = true;
      }

      // collisions with enemies
      for (const e of state.enemies) playerEnemy(p, e);

      // collect items
      for (const it of state.items) tryCollect(p, it);

      // goal
      checkGoal(p);

      // respawn logic if dead
      if (p.dead) {
        // spin/fall animation simulated by y drift — quick reset
        if (p.lives > 0) {
          p.dead = false; p.x = 32; p.y = (27*TILE)-p.h; p.vx = 0; p.vy = 0; p.setPower('small');
        } else {
          // game over — soft restart
          p.lives = 3; p.score = 0; p.setPower('small');
          state.cam.x = 0; p.x = 32; p.y = (27*TILE)-p.h;
        }
      }
    }

    // Update enemies
    for (const e of state.enemies) e.update(solidAtRect);
    state.enemies = state.enemies.filter(e => !e.dead);

    // Yarn projectiles
    for (const y of state.projectiles) {
      y.update(solidAtRect);
      for (const e of state.enemies) yarnHit(y, e);
    }
    state.projectiles = state.projectiles.filter(p => !p.dead);

    // Items
    for (const it of state.items) it.update(solidAtRect);
    state.items = state.items.filter(it => !it.dead);

    // Particles & score pops
    for (const pa of state.particles) pa.update();
    state.particles = state.particles.filter(pa => !pa.dead);
    for (const pop of state.pops) pop.update(state.cam);
    state.pops = state.pops.filter(p => !p.dead);

    // Camera follows lead player forward; no backward scroll
    const lead = state.players[0];
    const targetCam = Math.max(state.cam.x, Math.floor(lead.x - canvas.width*0.35));
    state.cam.x = lerp(state.cam.x, Math.min(targetCam, (state.W*TILE) - canvas.width), 0.15);
    if (state.cam.x < 0) state.cam.x = 0;

    // Background music kickstart after user gesture
    if (!state.started && (input1.left||input1.right||input1.jump||input1.throw)) {
      state.started = true; Audio.startBg();
    }

    setHUD();
  }

  function render(t) {
    // clear sky is baked into CSS canvas background; draw parallax candy clouds
    ctx.clearRect(0,0,canvas.width, canvas.height);

    // parallax sweets
    drawParallax();

    // world tiles
    drawTiles();

    // items
    for (const it of state.items) it.draw(ctx, state.cam);

    // enemies
    for (const e of state.enemies) e.draw(ctx, state.cam, t);

    // players
    for (const p of state.players) p.draw(ctx, state.cam, t);

    // yarn
    for (const y of state.projectiles) y.draw(ctx, state.cam);

    // particles
    for (const pa of state.particles) pa.draw(ctx, state.cam);
  }

  function drawParallax() {
    const cx = state.cam.x;
    const bands = [
      { y: 60, r: 24, k: 0.3, c: '#ffffffaa' },
      { y: 100, r: 18, k: 0.5, c: '#ffffff88' },
    ];
    for (const b of bands) {
      for (let i=0;i<6;i++) {
        const x = ((i*220) - (cx*b.k)) % (canvas.width+240) - 120;
        candyCloud(x, b.y + (i%2)*12, b.r, b.c);
      }
    }
  }
  function candyCloud(x,y,r,c) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.arc(x+20, y+6, r*0.8, 0, Math.PI*2);
    ctx.arc(x-20, y+6, r*0.7, 0, Math.PI*2);
    ctx.fill();
  }

  function lerp(a,b,t){ return a + (b-a)*t; }

  // ---- Boot ----
  window.addEventListener('pointerdown', () => Audio.resume(), { passive:true });

  resetLevel();
  requestAnimationFrame(loop);

  // Expose for console tinkering
  window.__state = () => state;
})();
