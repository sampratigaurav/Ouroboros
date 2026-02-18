// soloEngine.js — Client-side game engine for single player modes
// Produces same state shape as server gameEngine.js so renderer/HUD work unchanged

window.SoloEngine = (function () {
    'use strict';

    const SNAKE_COLORS = ['#00ff87', '#ff6b6b', '#4ecdc4', '#ffd93d', '#a855f7'];
    const BOT_NAMES = ['Viper', 'Cobra', 'Python', 'Mamba'];

    const DIRECTIONS = {
        UP: { x: 0, y: -1 },
        DOWN: { x: 0, y: 1 },
        LEFT: { x: -1, y: 0 },
        RIGHT: { x: 1, y: 0 }
    };
    const OPPOSITE = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
    const DIR_KEYS = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

    // ═══════ CONSTRUCTOR ═══════
    function SoloEngine(options) {
        this.mode = options.mode || 'classic'; // 'classic' | 'arena'
        this.gridSize = 40;
        this.tickRate = 150;
        this.tickCount = 0;
        this.state = 'running';
        this.startTime = Date.now();

        // Arena bounds
        this.arenaBounds = { minX: 0, minY: 0, maxX: this.gridSize - 1, maxY: this.gridSize - 1 };
        this.shrinkInterval = 200;
        this.shrinkAmount = 1;

        // Foods / Traps / Wormholes
        this.foods = [];
        this.traps = [];
        this.trapDuration = 70;
        this.wormholes = [];

        // Player ID
        this.playerId = 'player';
        this.playerName = options.playerName || 'Player';

        // Snakes map (id → snake object)
        this.snakes = new Map();

        // Bots
        this.botCount = options.botCount || 0;
        this.difficulty = options.difficulty || 'medium';
        this.botAI = null; // set externally

        // Build players list
        const allIds = [this.playerId];
        const allNames = [this.playerName];
        if (this.mode === 'arena') {
            for (let i = 0; i < this.botCount; i++) {
                allIds.push('bot_' + i);
                allNames.push(BOT_NAMES[i] || 'Bot ' + (i + 1));
            }
        }

        this.maxFoods = Math.max(3, Math.ceil(allIds.length * 1.5));

        // Spawn positions
        const spawns = this._getSpawnPositions(allIds.length);

        allIds.forEach((id, index) => {
            const spawn = spawns[index];
            const dir = spawn.direction;
            const body = [];
            for (let i = 0; i < 3; i++) {
                body.push({
                    x: spawn.x - DIRECTIONS[dir].x * i,
                    y: spawn.y - DIRECTIONS[dir].y * i
                });
            }

            this.snakes.set(id, {
                id,
                name: allNames[index],
                body,
                direction: dir,
                nextDirection: dir,
                color: SNAKE_COLORS[index % SNAKE_COLORS.length],
                score: 0,
                alive: true,
                dashCooldown: 0,
                dashActive: 0,
                trapCooldown: 0,
                kills: 0
            });
        });

        // Initial foods
        for (let i = 0; i < this.maxFoods; i++) {
            this._spawnFood();
        }

        // Wormholes only in arena mode
        if (this.mode === 'arena') {
            this._generateWormholes();
        }

        this.interval = null;
        this.onStateUpdate = null;
        this.onGameEnd = null;

        // Visual event callbacks
        this.onFoodEaten = null;     // (snakeId, position, color)
        this.onSnakeDeath = null;    // (snakeId, body, color)
        this.onDashActivated = null; // (snakeId, position, color)
        this.onTrapPlaced = null;    // (position)
        this.onArenaShrink = null;   // (newBounds)
    }

    // ═══════ SPAWN HELPERS ═══════
    SoloEngine.prototype._getSpawnPositions = function (count) {
        const m = 5;
        const g = this.gridSize;
        const positions = [
            { x: m, y: m, direction: 'RIGHT' },
            { x: g - m - 1, y: g - m - 1, direction: 'LEFT' },
            { x: g - m - 1, y: m, direction: 'DOWN' },
            { x: m, y: g - m - 1, direction: 'UP' },
            { x: Math.floor(g / 2), y: m, direction: 'DOWN' }
        ];
        return positions.slice(0, count);
    };

    SoloEngine.prototype._generateWormholes = function () {
        this.wormholes = [];
        const pad = 8;
        for (let i = 0; i < 2; i++) {
            let a, b, attempts = 0;
            do {
                a = { x: pad + Math.floor(Math.random() * (this.gridSize - pad * 2)), y: pad + Math.floor(Math.random() * (this.gridSize - pad * 2)) };
                b = { x: pad + Math.floor(Math.random() * (this.gridSize - pad * 2)), y: pad + Math.floor(Math.random() * (this.gridSize - pad * 2)) };
                attempts++;
            } while (attempts < 50 && (Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) < 10);
            this.wormholes.push({ a, b, id: i });
        }
    };

    SoloEngine.prototype._isOccupied = function (x, y) {
        for (const [, snake] of this.snakes) {
            if (!snake.alive) continue;
            for (const seg of snake.body) {
                if (seg.x === x && seg.y === y) return true;
            }
        }
        for (const f of this.foods) { if (f.x === x && f.y === y) return true; }
        for (const t of this.traps) { if (t.x === x && t.y === y) return true; }
        for (const wh of this.wormholes) {
            if ((wh.a.x === x && wh.a.y === y) || (wh.b.x === x && wh.b.y === y)) return true;
        }
        return false;
    };

    SoloEngine.prototype._spawnFood = function () {
        let x, y, attempts = 0;
        do {
            x = this.arenaBounds.minX + Math.floor(Math.random() * (this.arenaBounds.maxX - this.arenaBounds.minX + 1));
            y = this.arenaBounds.minY + Math.floor(Math.random() * (this.arenaBounds.maxY - this.arenaBounds.minY + 1));
            attempts++;
        } while (this._isOccupied(x, y) && attempts < 100);
        if (attempts < 100) {
            this.foods.push({ x, y, id: Math.random().toString(36).substr(2, 6) });
        }
    };

    // ═══════ CONTROLS ═══════
    SoloEngine.prototype.setDirection = function (id, direction) {
        const snake = this.snakes.get(id);
        if (!snake || !snake.alive) return;
        if (!DIRECTIONS[direction]) return;
        if (OPPOSITE[direction] === snake.direction) return;
        snake.nextDirection = direction;
    };

    SoloEngine.prototype.activateDash = function (id) {
        if (this.mode === 'classic') return;
        const snake = this.snakes.get(id);
        if (!snake || !snake.alive) return;
        if (snake.dashCooldown > 0 || snake.body.length <= 3) return;
        snake.dashActive = 3;
        snake.dashCooldown = 35;
        snake.body.pop();
        if (this.onDashActivated) {
            this.onDashActivated(id, { x: snake.body[0].x, y: snake.body[0].y }, snake.color);
        }
    };

    SoloEngine.prototype.placeTrap = function (id) {
        if (this.mode === 'classic') return;
        const snake = this.snakes.get(id);
        if (!snake || !snake.alive) return;
        if (snake.trapCooldown > 0 || snake.body.length <= 2) return;
        const tail = snake.body[snake.body.length - 1];
        this.traps.push({ x: tail.x, y: tail.y, ownerId: id, createdTick: this.tickCount });
        snake.trapCooldown = 50;
        if (this.onTrapPlaced) {
            this.onTrapPlaced({ x: tail.x, y: tail.y });
        }
    };

    // ═══════ START / STOP ═══════
    SoloEngine.prototype.start = function () {
        this.startTime = Date.now();
        this.interval = setInterval(() => this.tick(), this.tickRate);
    };

    SoloEngine.prototype.stop = function () {
        if (this.interval) { clearInterval(this.interval); this.interval = null; }
    };

    // ═══════ TICK ═══════
    SoloEngine.prototype.tick = function () {
        if (this.state !== 'running') return;
        this.tickCount++;

        // Run bot AI before processing
        if (this.botAI && this.mode === 'arena') {
            this.botAI.update(this);
        }

        // Reduce cooldowns
        for (const [, snake] of this.snakes) {
            if (!snake.alive) continue;
            if (snake.dashCooldown > 0) snake.dashCooldown--;
            if (snake.trapCooldown > 0) snake.trapCooldown--;
            if (snake.dashActive > 0) snake.dashActive--;
        }

        // Move snakes
        for (const [id, snake] of this.snakes) {
            if (!snake.alive) continue;
            snake.direction = snake.nextDirection;
            const dir = DIRECTIONS[snake.direction];
            const moveCount = snake.dashActive > 0 ? 2 : 1;

            for (let m = 0; m < moveCount; m++) {
                const currentHead = snake.body[0];
                const newHead = { x: currentHead.x + dir.x, y: currentHead.y + dir.y };

                // Wormhole teleportation (arena only)
                if (this.mode === 'arena') {
                    for (const wh of this.wormholes) {
                        if (newHead.x === wh.a.x && newHead.y === wh.a.y) {
                            newHead.x = wh.b.x + dir.x; newHead.y = wh.b.y + dir.y; break;
                        } else if (newHead.x === wh.b.x && newHead.y === wh.b.y) {
                            newHead.x = wh.a.x + dir.x; newHead.y = wh.a.y + dir.y; break;
                        }
                    }
                }

                snake.body.unshift(newHead);

                // Food collision
                let ateFood = false;
                for (let i = this.foods.length - 1; i >= 0; i--) {
                    if (this.foods[i].x === newHead.x && this.foods[i].y === newHead.y) {
                        ateFood = true;
                        snake.score += 10;
                        const eatenPos = { x: this.foods[i].x, y: this.foods[i].y };
                        this.foods.splice(i, 1);
                        this._spawnFood();
                        if (this.onFoodEaten) {
                            this.onFoodEaten(id, eatenPos, snake.color);
                        }
                        break;
                    }
                }
                if (!ateFood) snake.body.pop();
            }
        }

        // Check collisions
        for (const [id, snake] of this.snakes) {
            if (!snake.alive) continue;
            const head = snake.body[0];

            // Wall / arena bounds
            if (head.x < this.arenaBounds.minX || head.x > this.arenaBounds.maxX ||
                head.y < this.arenaBounds.minY || head.y > this.arenaBounds.maxY) {
                snake.alive = false;
                if (this.onSnakeDeath) this.onSnakeDeath(id, snake.body.slice(), snake.color);
                continue;
            }

            // Self collision
            for (let i = 1; i < snake.body.length; i++) {
                if (head.x === snake.body[i].x && head.y === snake.body[i].y) {
                    snake.alive = false;
                    if (this.onSnakeDeath) this.onSnakeDeath(id, snake.body.slice(), snake.color);
                    break;
                }
            }
            if (!snake.alive) continue;

            // Other snake collision
            for (const [otherId, other] of this.snakes) {
                if (otherId === id || !other.alive) continue;
                for (const seg of other.body) {
                    if (head.x === seg.x && head.y === seg.y) {
                        snake.alive = false; other.kills++; other.score += 25;
                        if (this.onSnakeDeath) this.onSnakeDeath(id, snake.body.slice(), snake.color);
                        break;
                    }
                }
                if (!snake.alive) break;
            }
            if (!snake.alive) continue;

            // Trap collision (arena only)
            if (this.mode === 'arena') {
                for (let i = this.traps.length - 1; i >= 0; i--) {
                    const trap = this.traps[i];
                    if (trap.ownerId !== id && head.x === trap.x && head.y === trap.y) {
                        snake.alive = false;
                        const trapper = this.snakes.get(trap.ownerId);
                        if (trapper) { trapper.kills++; trapper.score += 25; }
                        this.traps.splice(i, 1);
                        if (this.onSnakeDeath) this.onSnakeDeath(id, snake.body.slice(), snake.color);
                        break;
                    }
                }
            }
        }

        // Remove expired traps
        if (this.mode === 'arena') {
            this.traps = this.traps.filter(t => (this.tickCount - t.createdTick) < this.trapDuration);
        }

        // Arena shrinking (arena only)
        if (this.mode === 'arena' && this.tickCount % this.shrinkInterval === 0 && this.tickCount > 0) {
            const size = this.arenaBounds.maxX - this.arenaBounds.minX;
            if (size > 12) {
                this.arenaBounds.minX += this.shrinkAmount;
                this.arenaBounds.minY += this.shrinkAmount;
                this.arenaBounds.maxX -= this.shrinkAmount;
                this.arenaBounds.maxY -= this.shrinkAmount;
                if (this.onArenaShrink) {
                    this.onArenaShrink({ ...this.arenaBounds });
                }
            }
        }

        // Check game end
        const player = this.snakes.get(this.playerId);

        if (this.mode === 'classic') {
            // Classic: game ends when player dies
            if (!player || !player.alive) {
                this.state = 'finished';
                this.stop();
                if (this.onGameEnd) {
                    this.onGameEnd(null, this.getScoreboard(), this.getSurvivalTime());
                }
            }
        } else {
            // Arena: last snake alive wins
            const alive = Array.from(this.snakes.values()).filter(s => s.alive);
            if (alive.length <= 1) {
                this.state = 'finished';
                this.stop();
                const winner = alive.length === 1 ? alive[0] : null;
                if (this.onGameEnd) {
                    this.onGameEnd(winner, this.getScoreboard(), this.getSurvivalTime());
                }
            }
        }

        // Broadcast state
        if (this.onStateUpdate) {
            this.onStateUpdate(this.getState());
        }
    };

    // ═══════ STATE / SCOREBOARD ═══════
    SoloEngine.prototype.getState = function () {
        const snakes = {};
        for (const [id, snake] of this.snakes) {
            snakes[id] = {
                id: snake.id,
                name: snake.name,
                body: snake.body,
                direction: snake.direction,
                color: snake.color,
                score: snake.score,
                alive: snake.alive,
                dashActive: snake.dashActive > 0,
                dashCooldown: snake.dashCooldown,
                trapCooldown: snake.trapCooldown,
                kills: snake.kills
            };
        }
        return {
            snakes,
            foods: this.foods,
            traps: this.traps.map(t => ({ x: t.x, y: t.y, ownerId: t.ownerId })),
            wormholes: this.wormholes,
            arenaBounds: { ...this.arenaBounds },
            gridSize: this.gridSize,
            tickCount: this.tickCount,
            state: this.state
        };
    };

    SoloEngine.prototype.getScoreboard = function () {
        return Array.from(this.snakes.values())
            .map(s => ({ id: s.id, name: s.name, score: s.score, alive: s.alive, kills: s.kills, color: s.color }))
            .sort((a, b) => b.score - a.score);
    };

    SoloEngine.prototype.getSurvivalTime = function () {
        return Math.floor((Date.now() - this.startTime) / 1000);
    };

    return SoloEngine;
})();
