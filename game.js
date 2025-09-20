const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 400;

const GRAVITY = 0.5;
const TILE_SIZE = 32;
const FPS = 60;

let game = {
    state: 'playing',
    score: 0,
    treats: 0,
    lives: 3,
    time: 400,
    world: '1-1',
    easyMode: false,
    camera: { x: 0, y: 0 },
    level: null,
    player: null,
    enemies: [],
    items: [],
    particles: [],
    keys: {},
    lastTime: 0,
    frameCount: 0
};

let audioContext = null;
const sounds = {
    jump: null,
    collect: null,
    stomp: null,
    powerup: null,
    death: null,
    victory: null,
    backgroundMusic: null
};

function initAudioContext() {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
        } catch (e) {
            console.log('Audio context creation failed:', e);
        }
    }
}

function createSound(frequency, type, duration) {
    return function() {
        if (!audioContext) return;
        try {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = frequency;
            oscillator.type = type;

            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + duration);
        } catch (e) {
            console.log('Sound playback failed:', e);
        }
    };
}

function initSounds() {
    sounds.jump = createSound(400, 'square', 0.1);
    sounds.collect = createSound(800, 'sine', 0.15);
    sounds.stomp = createSound(200, 'square', 0.2);
    sounds.powerup = createSound(600, 'triangle', 0.3);
    sounds.death = createSound(150, 'sawtooth', 0.5);
    sounds.victory = createSound(1000, 'sine', 0.6);
}

function playSound(soundName) {
    if (sounds[soundName]) {
        sounds[soundName]();
    }
}

function init() {
    initAudioContext();
    initSounds();
    loadLevel(levels['1-1']);
    initPlayer();
    gameLoop(0);
}

function loadLevel(levelData) {
    game.level = levelData;
    game.enemies = [];
    game.items = [];
    game.particles = [];

    levelData.enemies.forEach(e => {
        game.enemies.push(createEnemy(e.type, e.x * TILE_SIZE, e.y * TILE_SIZE));
    });

    levelData.items.forEach(i => {
        game.items.push(createItem(i.type, i.x * TILE_SIZE, i.y * TILE_SIZE));
    });
}

function initPlayer() {
    game.player = createPlayer(2 * TILE_SIZE, 10 * TILE_SIZE);
}

function gameLoop(currentTime) {
    if (!game.lastTime) game.lastTime = currentTime;
    const deltaTime = currentTime - game.lastTime;
    game.lastTime = currentTime;

    if (game.state === 'playing') {
        update(Math.min(deltaTime / 16.67, 2));
        render();
    }

    requestAnimationFrame(gameLoop);
}

function update(dt) {
    if (game.state !== 'playing' || !game.player) return;

    updatePlayer(game.player, dt);
    updateCamera();

    game.enemies.forEach(enemy => updateEnemy(enemy, dt));
    game.items = game.items.filter(item => updateItem(item, dt));
    game.particles = game.particles.filter(p => updateParticle(p, dt));

    checkCollisions();

    game.frameCount++;
    if (game.frameCount % 60 === 0) {
        game.time--;
        if (game.time <= 0) {
            playerDeath();
        }
    }

    updateUI();
}

function updateCamera() {
    const targetX = game.player.x - canvas.width / 2;
    game.camera.x = Math.max(0, targetX);

    const maxCameraX = game.level.width * TILE_SIZE - canvas.width;
    game.camera.x = Math.min(game.camera.x, maxCameraX);
}

function checkCollisions() {
    const player = game.player;

    game.enemies = game.enemies.filter(enemy => {
        if (checkEntityCollision(player, enemy)) {
            if (player.vy > 0 && player.y < enemy.y) {
                player.vy = -8;
                game.score += 100;
                createParticles(enemy.x + enemy.width/2, enemy.y, '#8B4513', 5);
                playSound('stomp');

                if (enemy.type === 'gummyBear') {
                    enemy.inShell = true;
                    enemy.shellTimer = 180;
                    return true;
                } else {
                    return false;
                }
            } else if (!enemy.inShell && !player.invincible) {
                playerHit();
            }
        }
        return true;
    });

    game.items = game.items.filter(item => {
        if (checkEntityCollision(player, item)) {
            collectItem(item);
            return false;
        }
        return true;
    });

    if (player.x > (game.level.width - 2) * TILE_SIZE) {
        levelComplete();
    }
}

function checkEntityCollision(a, b) {
    return a.x < b.x + b.width &&
           a.x + a.width > b.x &&
           a.y < b.y + b.height &&
           a.y + a.height > b.y;
}

function collectItem(item) {
    if (item.type === 'treat') {
        game.treats++;
        game.score += 50;
        createParticles(item.x + item.width/2, item.y, '#FFD700', 8);
        playSound('collect');
    } else if (item.type === 'fish') {
        if (!game.player.big) {
            game.player.big = true;
            game.player.height = 64;
            game.player.y -= 32;
        }
        game.score += 200;
        playSound('powerup');
    } else if (item.type === 'yarnBall') {
        game.player.hasYarn = true;
        game.score += 300;
        playSound('powerup');
    } else if (item.type === 'life') {
        game.lives++;
        game.score += 500;
        playSound('powerup');
    }
}

function playerHit() {
    const player = game.player;
    if (player.big) {
        player.big = false;
        player.height = 32;
        player.invincible = true;
        player.invincibleTimer = 120;
        playSound('stomp');
    } else {
        playerDeath();
    }
}

function playerDeath() {
    game.lives--;
    playSound('death');

    if (game.lives <= 0) {
        gameOver();
    } else {
        resetLevel();
    }
}

function resetLevel() {
    loadLevel(game.level);
    initPlayer();
    game.camera.x = 0;
    game.time = 400;
}

function gameOver() {
    game.state = 'gameover';
    document.getElementById('final-score').textContent = game.score;
    document.getElementById('game-over').classList.remove('hidden');
}

function levelComplete() {
    game.state = 'complete';
    game.score += game.time * 10;
    document.getElementById('level-score').textContent = game.score;
    document.getElementById('level-complete').classList.remove('hidden');
    playSound('victory');
}

function createParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        game.particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 4,
            vy: Math.random() * -5 - 2,
            color: color,
            life: 30
        });
    }
}

function updateParticle(particle, dt) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 0.3 * dt;
    particle.life--;
    return particle.life > 0;
}

function render() {
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-game.camera.x, -game.camera.y);

    renderLevel();
    renderItems();
    renderEnemies();
    renderPlayer();
    renderParticles();

    ctx.restore();
}

function renderLevel() {
    const level = game.level;
    const startCol = Math.floor(game.camera.x / TILE_SIZE);
    const endCol = Math.ceil((game.camera.x + canvas.width) / TILE_SIZE);

    for (let row = 0; row < level.height; row++) {
        for (let col = startCol; col <= endCol && col < level.width; col++) {
            const tile = level.tiles[row][col];
            if (tile) {
                const x = col * TILE_SIZE;
                const y = row * TILE_SIZE;

                switch(tile) {
                    case 1:
                        ctx.fillStyle = '#8B4513';
                        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                        ctx.strokeStyle = '#654321';
                        ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
                        break;
                    case 2:
                        ctx.fillStyle = '#FFD700';
                        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                        ctx.fillStyle = '#FFA500';
                        ctx.font = '20px Arial';
                        ctx.fillText('?', x + 10, y + 24);
                        break;
                    case 3:
                        ctx.fillStyle = '#228B22';
                        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                        ctx.fillStyle = '#32CD32';
                        ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
                        break;
                    case 4:
                        ctx.fillStyle = '#A0522D';
                        ctx.fillRect(x, y - TILE_SIZE, TILE_SIZE * 2, TILE_SIZE * 2);
                        ctx.strokeStyle = '#8B4513';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(x, y - TILE_SIZE, TILE_SIZE * 2, TILE_SIZE * 2);
                        break;
                }
            }
        }
    }

    const flagX = (level.width - 2) * TILE_SIZE;
    const flagY = 8 * TILE_SIZE;
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(flagX, flagY, 4, 4 * TILE_SIZE);
    ctx.fillStyle = '#FF0000';
    ctx.beginPath();
    ctx.moveTo(flagX + 4, flagY);
    ctx.lineTo(flagX + 40, flagY + 15);
    ctx.lineTo(flagX + 4, flagY + 30);
    ctx.fill();
}

function renderPlayer() {
    const player = game.player;
    if (!player) return;

    if (player.invincible && player.invincibleTimer % 10 < 5) {
        return;
    }

    ctx.fillStyle = '#FF8C00';
    ctx.fillRect(player.x, player.y, player.width, player.height);

    ctx.fillStyle = '#000';
    ctx.fillRect(player.x + 8, player.y + 8, 4, 4);
    ctx.fillRect(player.x + 20, player.y + 8, 4, 4);

    ctx.fillStyle = '#FFC0CB';
    ctx.beginPath();
    ctx.moveTo(player.x + 5, player.y);
    ctx.lineTo(player.x + 10, player.y - 8);
    ctx.lineTo(player.x + 15, player.y);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(player.x + 17, player.y);
    ctx.lineTo(player.x + 22, player.y - 8);
    ctx.lineTo(player.x + 27, player.y);
    ctx.fill();

    if (player.hasYarn) {
        ctx.fillStyle = '#FF1493';
        ctx.beginPath();
        ctx.arc(player.x + player.width/2, player.y - 10, 5, 0, Math.PI * 2);
        ctx.fill();
    }

    if (player.projectiles && player.projectiles.length > 0) {
        player.projectiles.forEach(yarn => {
            ctx.fillStyle = '#FF1493';
            ctx.beginPath();
            ctx.arc(yarn.x + yarn.width/2, yarn.y + yarn.height/2, 4, 0, Math.PI * 2);
            ctx.fill();
        });
    }
}

function renderEnemies() {
    game.enemies.forEach(enemy => {
        if (enemy.type === 'chocolateChip') {
            ctx.fillStyle = '#654321';
            ctx.beginPath();
            ctx.arc(enemy.x + enemy.width/2, enemy.y + enemy.height/2, enemy.width/2, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#000';
            ctx.fillRect(enemy.x + 8, enemy.y + 8, 3, 3);
            ctx.fillRect(enemy.x + 20, enemy.y + 8, 3, 3);
            ctx.fillRect(enemy.x + 14, enemy.y + 16, 6, 2);
        } else if (enemy.type === 'gummyBear') {
            ctx.fillStyle = enemy.inShell ? '#808080' : '#FF69B4';
            ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);

            if (!enemy.inShell) {
                ctx.fillStyle = '#000';
                ctx.fillRect(enemy.x + 8, enemy.y + 8, 4, 4);
                ctx.fillRect(enemy.x + 20, enemy.y + 8, 4, 4);
            }
        }
    });
}

function renderItems() {
    game.items.forEach(item => {
        if (item.type === 'treat') {
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(item.x + item.width/2, item.y + item.height/2, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFA500';
            ctx.font = '12px Arial';
            ctx.fillText('🍪', item.x + 4, item.y + 14);
        } else if (item.type === 'fish') {
            ctx.fillStyle = '#FFA07A';
            ctx.fillRect(item.x + 4, item.y + 4, 24, 12);
            ctx.beginPath();
            ctx.moveTo(item.x, item.y + 10);
            ctx.lineTo(item.x + 8, item.y + 5);
            ctx.lineTo(item.x + 8, item.y + 15);
            ctx.fill();
        } else if (item.type === 'yarnBall') {
            ctx.fillStyle = '#FF1493';
            ctx.beginPath();
            ctx.arc(item.x + item.width/2, item.y + item.height/2, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#C71585';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(item.x + item.width/2, item.y + item.height/2, 10, 0, Math.PI);
            ctx.stroke();
        }
    });
}

function renderParticles() {
    game.particles.forEach(particle => {
        ctx.fillStyle = particle.color;
        ctx.fillRect(particle.x - 2, particle.y - 2, 4, 4);
    });
}

function updateUI() {
    document.getElementById('score').textContent = String(game.score).padStart(6, '0');
    document.getElementById('treats').textContent = 'x' + String(game.treats).padStart(2, '0');
    document.getElementById('world').textContent = game.world;
    document.getElementById('time').textContent = game.time;
    document.getElementById('lives').textContent = game.lives;
}

window.addEventListener('keydown', (e) => {
    game.keys[e.key] = true;

    if (!audioContext || audioContext.state === 'suspended') {
        initAudioContext();
    }

    if (game.player && (e.key === ' ' || e.key === 'ArrowUp') && game.player.grounded) {
        game.player.vy = game.player.jumpPower;
        game.player.grounded = false;
        playSound('jump');
    }
});

window.addEventListener('keyup', (e) => {
    game.keys[e.key] = false;
});

document.getElementById('pauseBtn').addEventListener('click', () => {
    if (game.state === 'playing') {
        game.state = 'paused';
        document.getElementById('pause-menu').classList.remove('hidden');
    }
});

document.getElementById('easyModeBtn').addEventListener('click', function() {
    game.easyMode = !game.easyMode;
    this.textContent = 'EASY MODE: ' + (game.easyMode ? 'ON' : 'OFF');

    if (game.easyMode) {
        game.player.jumpPower = -14;
        game.lives = 5;
    } else {
        game.player.jumpPower = -12;
    }
});

function resumeGame() {
    game.state = 'playing';
    document.getElementById('pause-menu').classList.add('hidden');
}

function restartGame() {
    game.score = 0;
    game.treats = 0;
    game.lives = 3;
    game.time = 400;
    game.state = 'playing';

    document.querySelectorAll('.overlay').forEach(el => el.classList.add('hidden'));

    loadLevel(levels['1-1']);
    initPlayer();
}

function nextLevel() {
    document.getElementById('level-complete').classList.add('hidden');
    game.state = 'playing';
}

window.addEventListener('load', init);