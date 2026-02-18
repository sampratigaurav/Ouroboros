// gameEngine.js - Server-authoritative multiplayer snake game engine

const SNAKE_COLORS = [
    '#00ff87', // Emerald green
    '#ff6b6b', // Coral red
    '#4ecdc4', // Teal
    '#ffd93d', // Gold
    '#a855f7', // Purple
];

const DIRECTIONS = {
    UP: { x: 0, y: -1 },
    DOWN: { x: 0, y: 1 },
    LEFT: { x: -1, y: 0 },
    RIGHT: { x: 1, y: 0 }
};

const OPPOSITE = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };

class GameEngine {
    constructor(players, gridSize = 40) {
        this.gridSize = gridSize;
        this.tickRate = 150; // ms per tick
        this.tickCount = 0;
        this.state = 'running'; // running | finished

        // Arena shrinking
        this.arenaBounds = { minX: 0, minY: 0, maxX: gridSize - 1, maxY: gridSize - 1 };
        this.shrinkInterval = 200; // ticks between shrinks
        this.shrinkAmount = 1;

        // Foods
        this.foods = [];
        this.maxFoods = Math.max(3, Math.ceil(players.length * 1.5));

        // Traps
        this.traps = []; // { x, y, ownerId, createdTick }
        this.trapDuration = 70; // ticks a trap lasts

        // Wormholes
        this.wormholes = []; // pairs of { x, y }

        // Initialize snakes
        this.snakes = new Map();
        const playerArray = Array.from(players.entries());
        const spawnPositions = this._getSpawnPositions(playerArray.length);

        playerArray.forEach(([id, player], index) => {
            const spawn = spawnPositions[index];
            const direction = spawn.direction;
            const body = [];
            for (let i = 0; i < 3; i++) {
                body.push({
                    x: spawn.x - DIRECTIONS[direction].x * i,
                    y: spawn.y - DIRECTIONS[direction].y * i
                });
            }

            this.snakes.set(id, {
                id,
                name: player.name,
                body,
                direction,
                nextDirection: direction,
                color: SNAKE_COLORS[index % SNAKE_COLORS.length],
                score: 0,
                alive: true,
                dashCooldown: 0,
                dashActive: 0,
                trapCooldown: 0,
                kills: 0
            });
        });

        // Spawn initial foods
        for (let i = 0; i < this.maxFoods; i++) {
            this._spawnFood();
        }

        // Generate wormhole pairs
        this._generateWormholes();

        this.interval = null;
        this.onStateUpdate = null;
        this.onGameEnd = null;
    }

    _getSpawnPositions(count) {
        const margin = 5;
        const positions = [
            { x: margin, y: margin, direction: 'RIGHT' },
            { x: this.gridSize - margin - 1, y: this.gridSize - margin - 1, direction: 'LEFT' },
            { x: this.gridSize - margin - 1, y: margin, direction: 'DOWN' },
            { x: margin, y: this.gridSize - margin - 1, direction: 'UP' },
            { x: Math.floor(this.gridSize / 2), y: margin, direction: 'DOWN' }
        ];
        return positions.slice(0, count);
    }

    _generateWormholes() {
        this.wormholes = [];
        const padding = 8;
        for (let i = 0; i < 2; i++) {
            let a, b;
            let attempts = 0;
            do {
                a = {
                    x: padding + Math.floor(Math.random() * (this.gridSize - padding * 2)),
                    y: padding + Math.floor(Math.random() * (this.gridSize - padding * 2))
                };
                b = {
                    x: padding + Math.floor(Math.random() * (this.gridSize - padding * 2)),
                    y: padding + Math.floor(Math.random() * (this.gridSize - padding * 2))
                };
                attempts++;
            } while (attempts < 50 && (Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) < 10);

            this.wormholes.push({ a, b, id: i });
        }
    }

    _isOccupied(x, y) {
        for (const [, snake] of this.snakes) {
            if (!snake.alive) continue;
            for (const seg of snake.body) {
                if (seg.x === x && seg.y === y) return true;
            }
        }
        for (const f of this.foods) {
            if (f.x === x && f.y === y) return true;
        }
        for (const t of this.traps) {
            if (t.x === x && t.y === y) return true;
        }
        for (const wh of this.wormholes) {
            if ((wh.a.x === x && wh.a.y === y) || (wh.b.x === x && wh.b.y === y)) return true;
        }
        return false;
    }

    _spawnFood() {
        let x, y;
        let attempts = 0;
        do {
            x = this.arenaBounds.minX + Math.floor(Math.random() * (this.arenaBounds.maxX - this.arenaBounds.minX + 1));
            y = this.arenaBounds.minY + Math.floor(Math.random() * (this.arenaBounds.maxY - this.arenaBounds.minY + 1));
            attempts++;
        } while (this._isOccupied(x, y) && attempts < 100);

        if (attempts < 100) {
            this.foods.push({ x, y, id: Math.random().toString(36).substr(2, 6) });
        }
    }

    start() {
        this.interval = setInterval(() => this.tick(), this.tickRate);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    setDirection(playerId, direction) {
        const snake = this.snakes.get(playerId);
        if (!snake || !snake.alive) return;
        if (!DIRECTIONS[direction]) return;
        // Prevent 180° reversal
        if (OPPOSITE[direction] === snake.direction) return;
        snake.nextDirection = direction;
    }

    activateDash(playerId) {
        const snake = this.snakes.get(playerId);
        if (!snake || !snake.alive) return;
        if (snake.dashCooldown > 0) return;
        if (snake.body.length <= 3) return; // Must have at least 3 segments
        snake.dashActive = 3; // 3 ticks of dash
        snake.dashCooldown = 35; // ~5 second cooldown at 150ms tick
        // Cost: remove last segment
        snake.body.pop();
    }

    placeTrap(playerId) {
        const snake = this.snakes.get(playerId);
        if (!snake || !snake.alive) return;
        if (snake.trapCooldown > 0) return;
        if (snake.body.length <= 2) return;

        const tail = snake.body[snake.body.length - 1];
        this.traps.push({
            x: tail.x,
            y: tail.y,
            ownerId: playerId,
            createdTick: this.tickCount
        });
        snake.trapCooldown = 50; // ~7.5 second cooldown
    }

    tick() {
        if (this.state !== 'running') return;
        this.tickCount++;

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
            const head = snake.body[0];
            const moveCount = snake.dashActive > 0 ? 2 : 1;

            for (let m = 0; m < moveCount; m++) {
                const currentHead = snake.body[0];
                const newHead = { x: currentHead.x + dir.x, y: currentHead.y + dir.y };

                // Check wormhole teleportation
                for (const wh of this.wormholes) {
                    if (newHead.x === wh.a.x && newHead.y === wh.a.y) {
                        newHead.x = wh.b.x + dir.x;
                        newHead.y = wh.b.y + dir.y;
                        break;
                    } else if (newHead.x === wh.b.x && newHead.y === wh.b.y) {
                        newHead.x = wh.a.x + dir.x;
                        newHead.y = wh.a.y + dir.y;
                        break;
                    }
                }

                snake.body.unshift(newHead);

                // Check food collision
                let ateFood = false;
                for (let i = this.foods.length - 1; i >= 0; i--) {
                    if (this.foods[i].x === newHead.x && this.foods[i].y === newHead.y) {
                        ateFood = true;
                        snake.score += 10;
                        this.foods.splice(i, 1);
                        this._spawnFood();
                        break;
                    }
                }

                if (!ateFood) {
                    snake.body.pop();
                }
            }
        }

        // Check collisions (after all snakes moved)
        for (const [id, snake] of this.snakes) {
            if (!snake.alive) continue;
            const head = snake.body[0];

            // Wall collision (arena bounds)
            if (head.x < this.arenaBounds.minX || head.x > this.arenaBounds.maxX ||
                head.y < this.arenaBounds.minY || head.y > this.arenaBounds.maxY) {
                snake.alive = false;
                continue;
            }

            // Self collision (skip head)
            for (let i = 1; i < snake.body.length; i++) {
                if (head.x === snake.body[i].x && head.y === snake.body[i].y) {
                    snake.alive = false;
                    break;
                }
            }
            if (!snake.alive) continue;

            // Other snake collision
            for (const [otherId, other] of this.snakes) {
                if (otherId === id || !other.alive) continue;
                for (const seg of other.body) {
                    if (head.x === seg.x && head.y === seg.y) {
                        snake.alive = false;
                        other.kills++;
                        other.score += 25;
                        break;
                    }
                }
                if (!snake.alive) break;
            }
            if (!snake.alive) continue;

            // Trap collision
            for (let i = this.traps.length - 1; i >= 0; i--) {
                const trap = this.traps[i];
                if (trap.ownerId !== id && head.x === trap.x && head.y === trap.y) {
                    snake.alive = false;
                    const trapper = this.snakes.get(trap.ownerId);
                    if (trapper) {
                        trapper.kills++;
                        trapper.score += 25;
                    }
                    this.traps.splice(i, 1);
                    break;
                }
            }
        }

        // Remove expired traps
        this.traps = this.traps.filter(t => (this.tickCount - t.createdTick) < this.trapDuration);

        // Arena shrinking
        if (this.tickCount % this.shrinkInterval === 0 && this.tickCount > 0) {
            const size = this.arenaBounds.maxX - this.arenaBounds.minX;
            if (size > 12) { // Don't shrink below 12x12
                this.arenaBounds.minX += this.shrinkAmount;
                this.arenaBounds.minY += this.shrinkAmount;
                this.arenaBounds.maxX -= this.shrinkAmount;
                this.arenaBounds.maxY -= this.shrinkAmount;
            }
        }

        // Check for winner
        const alivePlayers = Array.from(this.snakes.values()).filter(s => s.alive);
        if (alivePlayers.length <= 1) {
            this.state = 'finished';
            this.stop();
            const winner = alivePlayers.length === 1 ? alivePlayers[0] : null;
            if (this.onGameEnd) {
                this.onGameEnd(winner, this.getScoreboard());
            }
        }

        // Broadcast state
        if (this.onStateUpdate) {
            this.onStateUpdate(this.getState());
        }
    }

    getState() {
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
    }

    getScoreboard() {
        return Array.from(this.snakes.values())
            .map(s => ({ id: s.id, name: s.name, score: s.score, alive: s.alive, kills: s.kills, color: s.color }))
            .sort((a, b) => b.score - a.score);
    }
}

module.exports = GameEngine;
