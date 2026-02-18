// botAI.js — Intelligent AI controller for solo arena bots
// Features: flood-fill space eval, multi-step lookahead, personalities, strategic abilities

window.BotAI = (function () {
    'use strict';

    const DIRECTIONS = {
        UP: { x: 0, y: -1 },
        DOWN: { x: 0, y: 1 },
        LEFT: { x: -1, y: 0 },
        RIGHT: { x: 1, y: 0 }
    };
    const OPPOSITE = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
    const DIR_KEYS = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

    // ═══════ DIFFICULTY PROFILES ═══════
    const PROFILES = {
        easy: {
            lookAhead: 2,
            foodSeekChance: 0.35,
            dashChance: 0.01,
            trapChance: 0.005,
            randomTurnChance: 0.18,
            chaseChance: 0,
            floodFillDepth: 12,   // limited space awareness
            mistakeChance: 0.12   // randomly picks bad direction
        },
        medium: {
            lookAhead: 3,
            foodSeekChance: 0.65,
            dashChance: 0.03,
            trapChance: 0.012,
            randomTurnChance: 0.04,
            chaseChance: 0.08,
            floodFillDepth: 30,
            mistakeChance: 0.04
        },
        hard: {
            lookAhead: 5,
            foodSeekChance: 0.92,
            dashChance: 0.06,
            trapChance: 0.025,
            randomTurnChance: 0.01,
            chaseChance: 0.2,
            floodFillDepth: 60,
            mistakeChance: 0
        }
    };

    // ═══════ PERSONALITY TYPES ═══════
    const PERSONALITIES = ['aggressive', 'defensive', 'collector'];

    function BotAI(difficulty) {
        this.profile = PROFILES[difficulty] || PROFILES.medium;
        this.tickCounter = 0;
        this.botPersonalities = {};
    }

    // Assign personality to a bot (called lazily)
    BotAI.prototype._getPersonality = function (botId) {
        if (!this.botPersonalities[botId]) {
            this.botPersonalities[botId] = PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
        }
        return this.botPersonalities[botId];
    };

    // ═══════ MAIN UPDATE ═══════
    BotAI.prototype.update = function (engine) {
        this.tickCounter++;
        for (const [id, snake] of engine.snakes) {
            if (!id.startsWith('bot_') || !snake.alive) continue;
            this._decideBot(engine, id, snake);
        }
    };

    BotAI.prototype._decideBot = function (engine, botId, snake) {
        const head = snake.body[0];
        const currentDir = snake.direction;
        const p = this.profile;
        const personality = this._getPersonality(botId);

        // Intentional mistakes (easy mode)
        if (p.mistakeChance > 0 && Math.random() < p.mistakeChance) {
            const anyDirs = DIR_KEYS.filter(d => OPPOSITE[d] !== currentDir);
            if (anyDirs.length > 0) {
                engine.setDirection(botId, anyDirs[Math.floor(Math.random() * anyDirs.length)]);
                return;
            }
        }

        // 1. Get safe directions with multi-step lookahead
        const safeDirs = DIR_KEYS.filter(d => {
            if (OPPOSITE[d] === currentDir) return false;
            return this._isPathSafe(engine, head, d, p.lookAhead);
        });

        if (safeDirs.length === 0) return; // doomed

        // 2. Score each safe direction using flood-fill space evaluation
        const dirScores = {};
        for (const d of safeDirs) {
            const nx = head.x + DIRECTIONS[d].x;
            const ny = head.y + DIRECTIONS[d].y;
            dirScores[d] = this._floodFillScore(engine, nx, ny, p.floodFillDepth, botId);
        }

        // Penalize directions toward arena edges (arena edge proximity)
        const bounds = engine.arenaBounds;
        for (const d of safeDirs) {
            const nx = head.x + DIRECTIONS[d].x;
            const ny = head.y + DIRECTIONS[d].y;
            const edgeDist = Math.min(
                nx - bounds.minX, bounds.maxX - nx,
                ny - bounds.minY, bounds.maxY - ny
            );
            if (edgeDist < 3) {
                dirScores[d] *= 0.5; // heavily penalize near-edge
            } else if (edgeDist < 5) {
                dirScores[d] *= 0.8;
            }
        }

        let chosenDir = null;

        // 3. Personality-driven behavior
        const foodChance = personality === 'collector' ? Math.min(p.foodSeekChance + 0.15, 1) : p.foodSeekChance;
        const chaseChance = personality === 'aggressive' ? Math.min(p.chaseChance + 0.15, 1) : p.chaseChance;

        // Try to seek food
        if (Math.random() < foodChance && engine.foods.length > 0) {
            chosenDir = this._seekFoodSmart(engine, head, safeDirs, dirScores);
        }

        // Try to chase player (aggressive personality)
        if (!chosenDir && Math.random() < chaseChance) {
            const player = engine.snakes.get(engine.playerId);
            if (player && player.alive) {
                const dist = Math.abs(player.body[0].x - head.x) + Math.abs(player.body[0].y - head.y);
                if (dist < 15) { // only chase if within range
                    chosenDir = this._seekTarget(head, player.body[0], safeDirs, dirScores);
                }
            }
        }

        // Defensive: try to avoid all other snakes
        if (!chosenDir && personality === 'defensive') {
            chosenDir = this._pickSafestDirection(safeDirs, dirScores);
        }

        // Random turn
        if (!chosenDir && Math.random() < p.randomTurnChance) {
            chosenDir = safeDirs[Math.floor(Math.random() * safeDirs.length)];
        }

        // Default: pick direction with most open space
        if (!chosenDir) {
            if (safeDirs.includes(currentDir) && dirScores[currentDir] > 0) {
                // Stay on current if it has decent space
                const maxScore = Math.max(...safeDirs.map(d => dirScores[d]));
                if (dirScores[currentDir] >= maxScore * 0.6) {
                    chosenDir = currentDir;
                }
            }
            if (!chosenDir) {
                chosenDir = this._pickSafestDirection(safeDirs, dirScores);
            }
        }

        engine.setDirection(botId, chosenDir);

        // 4. Strategic ability usage
        this._useAbilities(engine, botId, snake, personality, p);
    };

    // ═══════ SAFETY CHECK — MULTI-STEP ═══════
    BotAI.prototype._isPathSafe = function (engine, head, direction, steps) {
        const dir = DIRECTIONS[direction];
        const bounds = engine.arenaBounds;

        // Check each step ahead
        for (let step = 1; step <= steps; step++) {
            const x = head.x + dir.x * step;
            const y = head.y + dir.y * step;

            // Wall
            if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) {
                return step > 1; // ok if wall is not immediate
            }

            // Only check immediate cell for body collisions (step 1)
            if (step === 1) {
                // Snake bodies
                for (const [, s] of engine.snakes) {
                    if (!s.alive) continue;
                    for (let i = 0; i < s.body.length - 1; i++) {
                        if (s.body[i].x === x && s.body[i].y === y) return false;
                    }
                }
                // Traps
                for (const trap of engine.traps) {
                    if (trap.x === x && trap.y === y) return false;
                }
            }
        }
        return true;
    };

    // ═══════ FLOOD-FILL SPACE EVALUATION ═══════
    // Count reachable cells from (startX, startY) up to maxDepth
    BotAI.prototype._floodFillScore = function (engine, startX, startY, maxDepth, botId) {
        const bounds = engine.arenaBounds;
        const visited = new Set();
        const queue = [{ x: startX, y: startY, depth: 0 }];
        let count = 0;
        let foodBonus = 0;

        // Build occupied set for fast lookup
        const occupied = new Set();
        for (const [, s] of engine.snakes) {
            if (!s.alive) continue;
            for (let i = 0; i < s.body.length - 1; i++) { // skip tail
                occupied.add(s.body[i].x + ',' + s.body[i].y);
            }
        }
        for (const trap of engine.traps) {
            occupied.add(trap.x + ',' + trap.y);
        }

        while (queue.length > 0 && count < maxDepth) {
            const cell = queue.shift();
            const key = cell.x + ',' + cell.y;

            if (visited.has(key)) continue;
            if (cell.x < bounds.minX || cell.x > bounds.maxX ||
                cell.y < bounds.minY || cell.y > bounds.maxY) continue;
            if (occupied.has(key)) continue;

            visited.add(key);
            count++;

            // Bonus for reachable food
            for (const food of engine.foods) {
                if (food.x === cell.x && food.y === cell.y) {
                    foodBonus += 5;
                }
            }

            if (cell.depth < maxDepth) {
                for (const dk of DIR_KEYS) {
                    const d = DIRECTIONS[dk];
                    queue.push({ x: cell.x + d.x, y: cell.y + d.y, depth: cell.depth + 1 });
                }
            }
        }

        return count + foodBonus;
    };

    // ═══════ SMART FOOD SEEKING ═══════
    BotAI.prototype._seekFoodSmart = function (engine, head, safeDirs, dirScores) {
        // Find nearest 3 foods, pick the one in a safe direction with best space
        const foods = engine.foods
            .map(f => ({ ...f, dist: Math.abs(f.x - head.x) + Math.abs(f.y - head.y) }))
            .sort((a, b) => a.dist - b.dist)
            .slice(0, 3);

        let bestDir = null;
        let bestValue = -Infinity;

        for (const food of foods) {
            const dir = this._seekTarget(head, food, safeDirs, dirScores);
            if (dir) {
                const value = dirScores[dir] - food.dist * 0.5; // prefer closer food with more space
                if (value > bestValue) {
                    bestValue = value;
                    bestDir = dir;
                }
            }
        }
        return bestDir;
    };

    // ═══════ TARGET SEEKING (direction-scored) ═══════
    BotAI.prototype._seekTarget = function (head, target, safeDirs, dirScores) {
        const dx = target.x - head.x;
        const dy = target.y - head.y;

        const preferred = [];
        if (dx > 0 && safeDirs.includes('RIGHT')) preferred.push('RIGHT');
        if (dx < 0 && safeDirs.includes('LEFT')) preferred.push('LEFT');
        if (dy > 0 && safeDirs.includes('DOWN')) preferred.push('DOWN');
        if (dy < 0 && safeDirs.includes('UP')) preferred.push('UP');

        if (preferred.length === 0) return null;

        // Among preferred, pick the one with best space score
        if (dirScores) {
            preferred.sort((a, b) => (dirScores[b] || 0) - (dirScores[a] || 0));
        }

        // Prefer axis with larger distance
        if (preferred.length > 1) {
            if (Math.abs(dx) > Math.abs(dy)) {
                const axial = preferred.find(d => d === 'LEFT' || d === 'RIGHT');
                if (axial) return axial;
            } else {
                const axial = preferred.find(d => d === 'UP' || d === 'DOWN');
                if (axial) return axial;
            }
        }
        return preferred[0];
    };

    // ═══════ PICK SAFEST DIRECTION ═══════
    BotAI.prototype._pickSafestDirection = function (safeDirs, dirScores) {
        let best = safeDirs[0];
        let bestScore = -1;
        for (const d of safeDirs) {
            if ((dirScores[d] || 0) > bestScore) {
                bestScore = dirScores[d] || 0;
                best = d;
            }
        }
        return best;
    };

    // ═══════ STRATEGIC ABILITY USAGE ═══════
    BotAI.prototype._useAbilities = function (engine, botId, snake, personality, profile) {
        const head = snake.body[0];

        // Dash: use when food is very close (2-3 tiles) and in the right direction
        if (Math.random() < profile.dashChance) {
            // Smart dash: only if food is ahead within 3 tiles
            const dir = DIRECTIONS[snake.direction];
            for (const food of engine.foods) {
                const ahead = (food.x - head.x) * dir.x + (food.y - head.y) * dir.y;
                const lateral = Math.abs((food.x - head.x) * dir.y) + Math.abs((food.y - head.y) * dir.x);
                if (ahead > 0 && ahead <= 3 && lateral === 0) {
                    engine.activateDash(botId);
                    return;
                }
            }
            // Aggressive bots dash toward player
            if (personality === 'aggressive') {
                const player = engine.snakes.get(engine.playerId);
                if (player && player.alive) {
                    const pHead = player.body[0];
                    const ahead = (pHead.x - head.x) * dir.x + (pHead.y - head.y) * dir.y;
                    const lateral = Math.abs((pHead.x - head.x) * dir.y) + Math.abs((pHead.y - head.y) * dir.x);
                    if (ahead > 0 && ahead <= 4 && lateral <= 1) {
                        engine.activateDash(botId);
                        return;
                    }
                }
            }
        }

        // Trap: place when enemy snake is behind us
        if (Math.random() < profile.trapChance) {
            const tail = snake.body[snake.body.length - 1];
            // Check if any enemy is within 5 tiles of our tail
            for (const [otherId, other] of engine.snakes) {
                if (otherId === botId || !other.alive) continue;
                const dist = Math.abs(other.body[0].x - tail.x) + Math.abs(other.body[0].y - tail.y);
                if (dist < 6) {
                    engine.placeTrap(botId);
                    return;
                }
            }
        }
    };

    return BotAI;
})();
