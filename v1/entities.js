/* Entity classes & helpers (player, enemies, items, particles) */
(() => {
  const GRAVITY = 0.55;
  const FRICTION = 0.86;
  const TILE = 16;

  // Axis-aligned bounding box collision
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  class Particle {
    constructor(x, y, vx, vy, life=30, color="#fff") {
      this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.life = life; this.color = color;
      this.w = 3; this.h = 3;
    }
    update() { this.x += this.vx; this.y += this.vy; this.vy += 0.2; this.life--; }
    draw(ctx, cam) {
      ctx.fillStyle = this.color;
      ctx.fillRect(Math.floor(this.x - cam.x), Math.floor(this.y - cam.y), this.w, this.h);
    }
    get dead() { return this.life <= 0; }
  }

  class ScorePop {
    constructor(x, y, amount, container) {
      this.el = document.createElement('div');
      this.el.className = 'score-pop';
      this.el.textContent = `+${amount}`;
      container.appendChild(this.el);
      this.x = x; this.y = y; this.t = 0; this.dead = false;
    }
    update(cam) {
      this.t++;
      const px = Math.floor(this.x - cam.x);
      const py = Math.floor(this.y - cam.y) - this.t;
      this.el.style.transform = `translate(${px}px, ${py}px)`;
      this.el.style.opacity = String(1 - this.t/60);
      if (this.t > 60) { this.dead = true; this.el.remove(); }
    }
  }

  class Entity {
    constructor(x, y, w, h) {
      this.x = x; this.y = y; this.w = w; this.h = h;
      this.vx = 0; this.vy = 0; this.onGround = false; this.dead = false;
    }
    bbox() { return { x:this.x, y:this.y, w:this.w, h:this.h }; }
  }

  class Player extends Entity {
    constructor(x, y, palette="kitten") {
      super(x, y, 14, 14);
      this.palette = palette;
      this.speed = 0.7;
      this.maxRun = 3.5;
      this.jumpVel = -9.5;
      this.holdJumpBoost = 0.38;
      this.holdingJump = false;
      this.power = 'small'; // small | big | yarn
      this.invuln = 0; // frames
      this.facing = 1;
      this.throwCd = 0;
      this.lives = 3;
      this.score = 0;
    }

    setPower(p) {
      this.power = p;
      if (p === 'big' && this.h === 14) { this.y -= 14; this.h = 28; }
      if (p === 'small' && this.h === 28) { this.h = 14; }
    }

    damage(sfx) {
      if (this.invuln > 0) return;
      if (this.power === 'yarn') { this.setPower('big'); this.invuln = 90; sfx('hurt'); return; }
      if (this.power === 'big') { this.setPower('small'); this.invuln = 90; sfx('hurt'); return; }
      // lose life
      this.lives--; sfx('lose');
      this.dead = true; // animation handled by game
    }

    update(input, solidAt, addProjectile, sfx) {
      const run = input.shift ? 1.25 : 1;
      const accel = this.speed * run;
      const max = this.maxRun * run;

      if (input.left) { this.vx -= accel; this.facing = -1; }
      if (input.right){ this.vx += accel; this.facing = 1; }
      if (!input.left && !input.right) this.vx *= FRICTION;
      this.vx = Math.max(-max, Math.min(max, this.vx));

      // Jump
      if (input.jumpPressed && this.onGround) {
        this.vy = this.jumpVel; this.onGround = false; this.holdingJump = true; sfx('jump');
      }
      if (input.jump && this.holdingJump && this.vy < 0) {
        this.vy += -this.holdJumpBoost; // hold to jump higher
      }
      if (!input.jump) this.holdingJump = false;

      // Apply gravity
      this.vy += GRAVITY; if (this.vy > 12) this.vy = 12;

      // Attempt movement with solid collisions
      const stepX = this.vx;
      const stepY = this.vy;

      // Horizontal
      this.x += stepX;
      if (solidAt(this.x, this.y, this.w, this.h)) {
        // step back
        this.x -= stepX;
        // resolve to tile boundary
        while (!solidAt(this.x + Math.sign(stepX), this.y, this.w, this.h)) this.x += Math.sign(stepX);
        this.vx = 0;
      }

      // Vertical
      this.y += stepY;
      if (solidAt(this.x, this.y, this.w, this.h)) {
        this.y -= stepY;
        while (!solidAt(this.x, this.y + Math.sign(stepY), this.w, this.h)) this.y += Math.sign(stepY);
        if (stepY > 0) { this.onGround = true; }
        this.vy = 0;
      } else {
        this.onGround = false;
      }

      // Throw yarn
      if (this.power === 'yarn') {
        if (this.throwCd > 0) this.throwCd--;
        if (input.throw && this.throwCd === 0) {
          addProjectile(new Yarn(this.x + this.w/2, this.y + this.h/2, this.facing));
          this.throwCd = 18;
          sfx('throw');
        }
      }

      if (this.invuln > 0) this.invuln--;
    }

    draw(ctx, cam, t) {
      ctx.save();
      ctx.translate(Math.floor(this.x - cam.x), Math.floor(this.y - cam.y));
      // Body (rounded rectangle) — kitten or puppy colors
      const isInv = this.invuln > 0 && (Math.floor(t/3) % 2 === 0);
      const body = this.palette === 'kitten' ? (isInv ? '#ffd4a6' : '#ff9f50') : (isInv ? '#ffe9a6' : '#ffd166');
      const ear = this.palette === 'kitten' ? '#ff7f2a' : '#f6c453';
      const eye = '#222';

      // Feet bounce
      const bob = Math.sin((t/10)) * 1;

      // Body
      roundRect(ctx, 0, -bob, this.w, this.h, 3, body);
      // Ears
      ctx.fillStyle = ear;
      ctx.beginPath(); ctx.moveTo(3, -bob); ctx.lineTo(7, -bob-6); ctx.lineTo(10, -bob); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(this.w-3, -bob); ctx.lineTo(this.w-7, -bob-6); ctx.lineTo(this.w-10, -bob); ctx.closePath(); ctx.fill();
      // Eyes
      ctx.fillStyle = eye;
      ctx.fillRect(4, 4-bob, 2, 2);
      ctx.fillRect(this.w-6, 4-bob, 2, 2);

      // Power indicator stripe
      if (this.power === 'big' || this.power === 'yarn') {
        ctx.fillStyle = this.palette === 'kitten' ? '#ffb347' : '#ffd97a';
        ctx.fillRect(0, this.h-4, this.w, 3);
      }
      if (this.power === 'yarn') {
        ctx.fillStyle = '#b565d9';
        ctx.fillRect(0, this.h-7, this.w, 2);
      }
      ctx.restore();
    }
  }

  class Yarn extends Entity {
    constructor(x, y, dir) {
      super(x, y, 6, 6);
      this.vx = 6 * dir; this.vy = -1;
      this.bounces = 2;
    }
    update(solidAt) {
      this.vy += 0.3;
      this.x += this.vx; this.y += this.vy;
      // collide with solid
      if (solidAt(this.x, this.y, this.w, this.h)) {
        // simple bounce
        this.y -= this.vy; this.vy = -Math.abs(this.vy)*0.7; this.bounces--;
        if (this.bounces < 0) this.dead = true;
      }
    }
    draw(ctx, cam) {
      ctx.fillStyle = '#b565d9';
      ctx.beginPath();
      ctx.arc(Math.floor(this.x - cam.x), Math.floor(this.y - cam.y), 4, 0, Math.PI*2);
      ctx.fill();
      // little tail
      ctx.strokeStyle = '#8b3fb3';
      ctx.beginPath();
      ctx.moveTo(Math.floor(this.x - cam.x)-3, Math.floor(this.y - cam.y));
      ctx.lineTo(Math.floor(this.x - cam.x)-8, Math.floor(this.y - cam.y)+3);
      ctx.stroke();
    }
  }

  class Chip extends Entity { // Angry chocolate chip (goomba-like)
    constructor(x, y) {
      super(x, y, 14, 12); this.vx = -0.6; this.stomped = false; this.flipT = 0;
    }
    update(solidAt) {
      if (this.stomped) { this.flipT++; if (this.flipT > 40) this.dead = true; return; }
      this.vy += 0.5; if (this.vy > 10) this.vy = 10;
      this.x += this.vx;
      if (solidAt(this.x, this.y, this.w, this.h)) { this.x -= this.vx; this.vx *= -1; }
      this.y += this.vy;
      if (solidAt(this.x, this.y, this.w, this.h)) {
        this.y -= this.vy; while (!solidAt(this.x, this.y+Math.sign(this.vy), this.w, this.h)) this.y += Math.sign(this.vy);
        this.vy = 0;
      }
    }
    draw(ctx, cam, t) {
      const px = Math.floor(this.x - cam.x), py = Math.floor(this.y - cam.y);
      ctx.save();
      ctx.translate(px, py);
      if (this.stomped) ctx.rotate(Math.PI);
      roundRect(ctx, 0, 0, this.w, this.h, 6, '#6b3a1e');
      ctx.fillStyle = '#2a160b';
      ctx.fillRect(4, 4, 2, 2); ctx.fillRect(this.w-6, 4, 2, 2);
      ctx.restore();
    }
  }

  class Gummy extends Entity { // Gummy bear (koopa-like)
    constructor(x, y) {
      super(x, y, 14, 18);
      this.vx = -0.5; this.shell = false; this.shellVx = 0;
    }
    update(solidAt) {
      this.vy += 0.5; if (this.vy > 10) this.vy = 10;

      if (this.shell) {
        this.x += this.shellVx;
        this.shellVx *= 0.998;
        if (Math.abs(this.shellVx) < 0.05) this.shellVx = 0;
      } else {
        this.x += this.vx;
        if (solidAt(this.x, this.y, this.w, this.h)) { this.x -= this.vx; this.vx *= -1; }
      }
      this.y += this.vy;
      if (solidAt(this.x, this.y, this.w, this.h)) {
        this.y -= this.vy; while (!solidAt(this.x, this.y+Math.sign(this.vy), this.w, this.h)) this.y += Math.sign(this.vy);
        this.vy = 0;
      }
    }
    draw(ctx, cam) {
      const px = Math.floor(this.x - cam.x), py = Math.floor(this.y - cam.y);
      ctx.save(); ctx.translate(px, py);
      const body = this.shell ? '#d58df5' : '#9bf6ff';
      roundRect(ctx, 0, 0, this.w, this.h, 6, body);
      ctx.fillStyle = '#1e1b2e';
      ctx.fillRect(4, 5, 2, 2); ctx.fillRect(this.w-6, 5, 2, 2);
      ctx.restore();
    }
  }

  class Item extends Entity {
    constructor(x, y, type='coin') { super(x, y, 12, 12); this.type = type; this.vy = -2; this.spawnT = 0; }
    update(solidAt) {
      this.spawnT++; this.vy += 0.3; this.y += this.vy;
      if (solidAt(this.x, this.y, this.w, this.h)) { this.vy = 0; }
    }
    draw(ctx, cam) {
      const px = Math.floor(this.x - cam.x), py = Math.floor(this.y - cam.y);
      if (this.type === 'coin') {
        ctx.fillStyle = '#ffd166'; roundRect(ctx, px, py, this.w, this.h, 4);
        ctx.strokeStyle = '#ad8d29'; ctx.strokeRect(px+3, py+3, this.w-6, this.h-6);
      } else if (this.type === 'fish') {
        ctx.fillStyle = '#7cd1f7'; roundRect(ctx, px, py, this.w+6, this.h-2, 6);
        ctx.fillStyle = '#5fb8db'; ctx.beginPath(); ctx.moveTo(px-6, py+5); ctx.lineTo(px, py); ctx.lineTo(px, py+10); ctx.closePath(); ctx.fill();
      } else if (this.type === 'yarn') {
        ctx.fillStyle = '#b565d9'; ctx.beginPath(); ctx.arc(px+6, py+6, 7, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#8b3fb3'; ctx.beginPath(); ctx.arc(px+6, py+6, 5, 0, Math.PI*2); ctx.stroke();
      }
    }
  }

  // Rounded rect helper
  function roundRect(ctx, x, y, w, h, r=4, fill='#fff') {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath(); ctx.fill();
  }

  window.Engine = {
    Player, Chip, Gummy, Yarn, Item, Particle, ScorePop, aabb, TILE
  };
})();
