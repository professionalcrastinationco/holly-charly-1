function createPlayer(x, y) {
    return {
        x: x,
        y: y,
        width: 32,
        height: 32,
        vx: 0,
        vy: 0,
        speed: 4,
        runSpeed: 6,
        jumpPower: -12,
        grounded: false,
        facing: 1,
        big: false,
        hasYarn: false,
        invincible: false,
        invincibleTimer: 0,
        yarnCooldown: 0,
        projectiles: []
    };
}

function updatePlayer(player, dt) {
    if (player.invincibleTimer > 0) {
        player.invincibleTimer--;
        if (player.invincibleTimer === 0) {
            player.invincible = false;
        }
    }

    if (player.yarnCooldown > 0) {
        player.yarnCooldown--;
    }

    const isRunning = game.keys['Shift'];
    const speed = isRunning ? player.runSpeed : player.speed;

    if (game.keys['ArrowLeft']) {
        player.vx = -speed;
        player.facing = -1;
    } else if (game.keys['ArrowRight']) {
        player.vx = speed;
        player.facing = 1;
    } else {
        player.vx *= 0.8;
        if (Math.abs(player.vx) < 0.1) player.vx = 0;
    }

    if ((game.keys[' '] || game.keys['ArrowUp']) && player.vy < 0) {
        player.vy -= 0.3;
    }

    player.vy += GRAVITY * dt;
    player.vy = Math.min(player.vy, 15);

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    if (player.x < game.camera.x) {
        player.x = game.camera.x;
    }

    checkPlayerCollisionWithLevel(player);

    if (game.keys['x'] && player.hasYarn && player.yarnCooldown === 0) {
        throwYarn(player);
        player.yarnCooldown = 30;
    }

    player.projectiles = player.projectiles.filter(yarn => {
        yarn.x += yarn.vx * dt;
        yarn.y += yarn.vy * dt;
        yarn.vy += 0.2 * dt;

        if (yarn.bounces < 3 && checkYarnCollisionWithLevel(yarn)) {
            yarn.vy = -5;
            yarn.bounces++;
        }

        game.enemies = game.enemies.filter(enemy => {
            if (checkEntityCollision(yarn, enemy)) {
                game.score += 150;
                createParticles(enemy.x + enemy.width/2, enemy.y, '#8B4513', 5);
                playSound('stomp');
                return false;
            }
            return true;
        });

        return yarn.x > game.camera.x - 50 &&
               yarn.x < game.camera.x + canvas.width + 50 &&
               yarn.y < canvas.height + 100 &&
               yarn.bounces < 3;
    });

    if (player.y > canvas.height + 100) {
        playerDeath();
    }
}

function checkPlayerCollisionWithLevel(player) {
    const level = game.level;
    player.grounded = false;

    const leftTile = Math.floor(player.x / TILE_SIZE);
    const rightTile = Math.floor((player.x + player.width) / TILE_SIZE);
    const topTile = Math.floor(player.y / TILE_SIZE);
    const bottomTile = Math.floor((player.y + player.height) / TILE_SIZE);

    for (let row = topTile; row <= bottomTile; row++) {
        for (let col = leftTile; col <= rightTile; col++) {
            if (row >= 0 && row < level.height && col >= 0 && col < level.width) {
                const tile = level.tiles[row][col];
                if (tile && tile !== 0) {
                    const tileX = col * TILE_SIZE;
                    const tileY = row * TILE_SIZE;

                    if (tile === 2) {
                        if (player.vy < 0 &&
                            player.y < tileY + TILE_SIZE &&
                            player.y + player.height > tileY) {

                            const itemIndex = game.items.findIndex(item =>
                                item.fromBlock &&
                                item.blockX === col &&
                                item.blockY === row
                            );

                            if (itemIndex === -1) {
                                const itemType = Math.random() < 0.7 ? 'treat' : 'fish';
                                const newItem = createItem(itemType, tileX, tileY - TILE_SIZE);
                                newItem.fromBlock = true;
                                newItem.blockX = col;
                                newItem.blockY = row;
                                newItem.vy = -8;
                                game.items.push(newItem);
                                game.score += 50;
                                playSound('collect');
                            }
                        }
                    }

                    if (tile !== 4) {
                        const overlapX = Math.min(player.x + player.width, tileX + TILE_SIZE) -
                                        Math.max(player.x, tileX);
                        const overlapY = Math.min(player.y + player.height, tileY + TILE_SIZE) -
                                        Math.max(player.y, tileY);

                        if (overlapX > 0 && overlapY > 0) {
                            if (overlapX < overlapY) {
                                if (player.x < tileX) {
                                    player.x = tileX - player.width;
                                } else {
                                    player.x = tileX + TILE_SIZE;
                                }
                                player.vx = 0;
                            } else {
                                if (player.y < tileY) {
                                    player.y = tileY - player.height;
                                    player.vy = 0;
                                    player.grounded = true;
                                } else {
                                    player.y = tileY + TILE_SIZE;
                                    player.vy = 0;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

function checkYarnCollisionWithLevel(yarn) {
    const level = game.level;
    const tileX = Math.floor(yarn.x / TILE_SIZE);
    const tileY = Math.floor(yarn.y / TILE_SIZE);

    if (tileY >= 0 && tileY < level.height && tileX >= 0 && tileX < level.width) {
        const tile = level.tiles[tileY][tileX];
        if (tile && tile !== 0 && tile !== 4) {
            return true;
        }
    }
    return false;
}

function throwYarn(player) {
    const yarn = {
        x: player.x + (player.facing > 0 ? player.width : 0),
        y: player.y + 10,
        width: 8,
        height: 8,
        vx: player.facing * 8,
        vy: -3,
        bounces: 0
    };
    player.projectiles.push(yarn);
    playSound('jump');
}

function createEnemy(type, x, y) {
    if (type === 'chocolateChip') {
        return {
            type: 'chocolateChip',
            x: x,
            y: y,
            width: 32,
            height: 32,
            vx: -1,
            vy: 0,
            grounded: false
        };
    } else if (type === 'gummyBear') {
        return {
            type: 'gummyBear',
            x: x,
            y: y,
            width: 32,
            height: 40,
            vx: -0.8,
            vy: 0,
            grounded: false,
            inShell: false,
            shellTimer: 0
        };
    }
}

function updateEnemy(enemy, dt) {
    enemy.vy += GRAVITY * dt;
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;

    if (enemy.type === 'gummyBear' && enemy.inShell) {
        enemy.shellTimer--;
        if (enemy.shellTimer <= 0) {
            enemy.inShell = false;
        }
        enemy.vx = 0;
    } else {
        checkEnemyCollisionWithLevel(enemy);
    }

    if (enemy.y > canvas.height + 100) {
        enemy.y = -100;
        enemy.x = Math.random() * (game.level.width * TILE_SIZE);
    }
}

function checkEnemyCollisionWithLevel(enemy) {
    const level = game.level;
    enemy.grounded = false;

    const leftTile = Math.floor(enemy.x / TILE_SIZE);
    const rightTile = Math.floor((enemy.x + enemy.width) / TILE_SIZE);
    const topTile = Math.floor(enemy.y / TILE_SIZE);
    const bottomTile = Math.floor((enemy.y + enemy.height) / TILE_SIZE);

    for (let row = topTile; row <= bottomTile; row++) {
        for (let col = leftTile; col <= rightTile; col++) {
            if (row >= 0 && row < level.height && col >= 0 && col < level.width) {
                const tile = level.tiles[row][col];
                if (tile && tile !== 0 && tile !== 4) {
                    const tileX = col * TILE_SIZE;
                    const tileY = row * TILE_SIZE;

                    const overlapX = Math.min(enemy.x + enemy.width, tileX + TILE_SIZE) -
                                    Math.max(enemy.x, tileX);
                    const overlapY = Math.min(enemy.y + enemy.height, tileY + TILE_SIZE) -
                                    Math.max(enemy.y, tileY);

                    if (overlapX > 0 && overlapY > 0) {
                        if (overlapX < overlapY) {
                            if (enemy.x < tileX) {
                                enemy.x = tileX - enemy.width;
                            } else {
                                enemy.x = tileX + TILE_SIZE;
                            }
                            enemy.vx = -enemy.vx;
                        } else {
                            if (enemy.y < tileY) {
                                enemy.y = tileY - enemy.height;
                                enemy.vy = 0;
                                enemy.grounded = true;
                            } else {
                                enemy.y = tileY + TILE_SIZE;
                                enemy.vy = 0;
                            }
                        }
                    }
                }
            }
        }
    }

    const nextTileX = Math.floor((enemy.x + (enemy.vx > 0 ? enemy.width : 0) + enemy.vx * 2) / TILE_SIZE);
    const groundTileY = Math.floor((enemy.y + enemy.height + 1) / TILE_SIZE);

    if (nextTileX >= 0 && nextTileX < level.width && groundTileY < level.height) {
        const groundTile = level.tiles[groundTileY][nextTileX];
        if (!groundTile || groundTile === 0 || groundTile === 4) {
            enemy.vx = -enemy.vx;
        }
    }
}

function createItem(type, x, y) {
    return {
        type: type,
        x: x,
        y: y,
        width: 32,
        height: 32,
        vx: 0,
        vy: 0,
        collected: false,
        fromBlock: false,
        blockX: -1,
        blockY: -1
    };
}

function updateItem(item, dt) {
    if (item.fromBlock && item.vy < 0) {
        item.vy += GRAVITY * dt;
        item.y += item.vy * dt;

        if (item.vy >= 0) {
            item.fromBlock = false;
        }
    }

    return !item.collected;
}