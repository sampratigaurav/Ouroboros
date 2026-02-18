// game.js - Unified game client for both solo and multiplayer modes
// Handles particle effects, screen shake, score popups via engine events

(function () {
    'use strict';

    // ═══════ DETECT MODE FROM URL ═══════
    const params = new URLSearchParams(window.location.search);
    const soloMode = params.get('mode'); // 'classic' | 'arena' | null (multiplayer)
    const isSolo = soloMode === 'classic' || soloMode === 'arena';
    const difficulty = params.get('difficulty') || 'medium';
    const botCount = parseInt(params.get('bots') || '3');

    // DOM elements
    const hudScores = document.getElementById('hud-scores');
    const hudAlive = document.getElementById('hud-alive');
    const abilityDash = document.getElementById('ability-dash');
    const abilityTrap = document.getElementById('ability-trap');
    const hudAbilities = document.getElementById('hud-abilities');
    const deathBanner = document.getElementById('death-banner');
    const gameOverOverlay = document.getElementById('game-over-overlay');
    const overlayIcon = document.getElementById('overlay-icon');
    const overlayTitle = document.getElementById('overlay-title');
    const overlaySubtitle = document.getElementById('overlay-subtitle');
    const overlayScoreboard = document.getElementById('overlay-scoreboard');
    const overlaySoloStats = document.getElementById('overlay-solo-stats');
    const btnPlayAgain = document.getElementById('btn-play-again');
    const btnBackLobby = document.getElementById('btn-back-lobby');
    const soloStatsEl = document.getElementById('solo-stats');
    const soloTimeEl = document.getElementById('solo-time');
    const soloBestEl = document.getElementById('solo-best');
    const finalScoreEl = document.getElementById('final-score');
    const finalTimeEl = document.getElementById('final-time');
    const killFeed = document.getElementById('kill-feed');

    let latestState = null;
    let gameRunning = false;
    let playerDead = false;
    let actualId = null;
    let renderStarted = false;
    let soloEngine = null;
    let soloTimerInterval = null;
    let snakeNames = {}; // track snake names/colors for kill feed

    // ═══════════════════════════════════════
    //  SOLO MODE
    // ═══════════════════════════════════════
    if (isSolo) {
        initSoloMode();
    } else {
        initMultiplayerMode();
    }

    function initSoloMode() {
        actualId = 'player';
        const playerName = sessionStorage.getItem('ouroboros_name') || 'Player';

        // Show/hide appropriate UI
        if (soloMode === 'classic') {
            hudAbilities.style.display = 'none';
        }
        soloStatsEl.style.display = 'block';

        // Load best score
        const bestKey = soloMode === 'classic' ? 'ouroboros_best_classic' : 'ouroboros_best_arena';
        const bestScore = parseInt(localStorage.getItem(bestKey) || '0');
        soloBestEl.textContent = bestScore;

        // Create engine
        soloEngine = new SoloEngine({
            mode: soloMode,
            playerName,
            botCount: soloMode === 'arena' ? botCount : 0,
            difficulty
        });

        // Attach bot AI in arena mode
        if (soloMode === 'arena') {
            soloEngine.botAI = new BotAI(difficulty);
        }

        // Wire up particle events
        wireEngineEvents(soloEngine);

        // Init controls — wire directly to solo engine
        // Init controls — shared logic handled by global functions
        GameControls.init(null);

        // Init touch controls for mobile
        if (window.TouchControls) {
            TouchControls.init({ socket: null, soloEngine: soloEngine, playerId: actualId });
        }

        // Engine callbacks
        soloEngine.onStateUpdate = (state) => {
            latestState = state;

            if (state.snakes[actualId] && !state.snakes[actualId].alive && !playerDead) {
                playerDead = true;
                if (soloMode === 'arena') {
                    deathBanner.classList.add('active');
                }
                GameControls.disable();
            }

            updateHUD(state);
            if (soloMode === 'arena') updateAbilities(state);
        };

        soloEngine.onGameEnd = (winner, scoreboard, survivalTime) => {
            gameRunning = false;
            GameControls.disable();
            deathBanner.classList.remove('active');
            clearInterval(soloTimerInterval);

            const playerScore = soloEngine.snakes.get(actualId)?.score || 0;

            if (playerScore > bestScore) {
                localStorage.setItem(bestKey, playerScore);
                soloBestEl.textContent = playerScore;
            }

            submitSoloScore(playerName, playerScore, survivalTime, soloMode);

            if (soloMode === 'classic') {
                overlayIcon.textContent = '💀';
                overlayTitle.textContent = 'Game Over';
                overlayTitle.className = 'overlay-title defeat';
                overlaySubtitle.textContent = `Final Score: ${playerScore}`;
            } else {
                const isWinner = winner && winner.id === actualId;
                if (isWinner) {
                    overlayIcon.textContent = '🏆';
                    overlayTitle.textContent = 'Victory!';
                    overlayTitle.className = 'overlay-title victory';
                    overlaySubtitle.textContent = `You survived and won with ${playerScore} points!`;
                    // Confetti burst on victory!
                    if (window.ParticleSystem) {
                        const vw = window.innerWidth, vh = window.innerHeight;
                        setTimeout(() => ParticleSystem.confetti(vw / 2, vh * 0.3, 50, {}), 200);
                        setTimeout(() => ParticleSystem.confetti(vw * 0.3, vh * 0.35, 30, {}), 400);
                        setTimeout(() => ParticleSystem.confetti(vw * 0.7, vh * 0.35, 30, {}), 600);
                    }
                } else {
                    overlayIcon.textContent = '💀';
                    overlayTitle.textContent = 'Defeated';
                    overlayTitle.className = 'overlay-title defeat';
                    if (winner) {
                        overlaySubtitle.textContent = `${winner.name} wins. Your score: ${playerScore}`;
                    } else {
                        overlaySubtitle.textContent = `No survivors! Your score: ${playerScore}`;
                    }
                }
                renderOverlayScoreboard(scoreboard);
            }

            overlaySoloStats.style.display = 'flex';
            finalScoreEl.textContent = playerScore;
            finalTimeEl.textContent = formatTime(survivalTime);

            gameOverOverlay.classList.add('active');
        };

        // Start with countdown
        startCountdown(() => {
            gameRunning = true;
            soloEngine.start();
            GameControls.enable();
            startSoloTimer();
        });

        // Start render loop
        renderStarted = true;
        latestState = soloEngine.getState();
        renderLoop();
    }

    // ═══════ WIRE ENGINE → PARTICLES ═══════
    function wireEngineEvents(engine) {
        if (!window.ParticleSystem) return;

        // Clear any old particles
        ParticleSystem.clear();

        engine.onFoodEaten = (snakeId, pos, color) => {
            const { px, py } = GameRenderer.getCellCenter(pos.x, pos.y);
            // Burst of food-colored particles
            ParticleSystem.burst(px, py, 10, {
                color: '#ff4757', speed: 2.5, size: 3, life: 25,
                gravity: 0.04, shape: 'star', glow: 8
            });
            // Score popup
            ParticleSystem.addScorePopup(px, py - 10, '+10', color);
        };

        engine.onSnakeDeath = (snakeId, body, color) => {
            // Register death dissolve effect in renderer
            if (GameRenderer.registerDeath) {
                GameRenderer.registerDeath(snakeId, body, color);
            }

            // Explosion from each body segment (limited to first 10)
            const segments = body.slice(0, 10);
            segments.forEach((seg, i) => {
                const { px, py } = GameRenderer.getCellCenter(seg.x, seg.y);
                const delay = i * 2;
                setTimeout(() => {
                    ParticleSystem.burst(px, py, 6, {
                        color: color, speed: 3, size: 3.5, life: 35,
                        gravity: 0.06, shape: 'square', glow: 10
                    });
                }, delay * 16);
            });

            // Ring burst from head
            if (body.length > 0) {
                const { px, py } = GameRenderer.getCellCenter(body[0].x, body[0].y);
                ParticleSystem.ring(px, py, 12, { color, speed: 2, size: 2, life: 20, glow: 8 });
            }

            // Screen shake
            if (snakeId === actualId) {
                GameRenderer.triggerShake(12, 22);
            } else {
                GameRenderer.triggerShake(5, 12);
            }

            // Kill feed toast
            const deadName = snakeNames[snakeId] || snakeId;
            addKillToast(deadName, color);

            // Kill score popup for killer
            if (snakeId !== actualId) {
                const head = body[0];
                const { px, py } = GameRenderer.getCellCenter(head.x, head.y);
                ParticleSystem.addScorePopup(px, py - 15, '+25', '#ffd93d');
            }
        };

        engine.onDashActivated = (snakeId, pos, color) => {
            const { px, py } = GameRenderer.getCellCenter(pos.x, pos.y);
            ParticleSystem.burst(px, py, 8, {
                color: color, speed: 4, size: 2, life: 15,
                gravity: 0, friction: 0.9, shape: 'circle', glow: 12
            });
        };

        engine.onTrapPlaced = (pos) => {
            const { px, py } = GameRenderer.getCellCenter(pos.x, pos.y);
            ParticleSystem.burst(px, py, 6, {
                color: '#ffaa32', speed: 1.5, size: 2.5, life: 20,
                gravity: 0.01, shape: 'star', glow: 6
            });
        };

        engine.onArenaShrink = (newBounds) => {
            const { px: leftX, py: topY } = GameRenderer.getCellCenter(newBounds.minX, newBounds.minY);
            const { px: rightX, py: botY } = GameRenderer.getCellCenter(newBounds.maxX, newBounds.maxY);

            // Boundary burst particles
            for (let i = 0; i < 15; i++) {
                const side = Math.floor(Math.random() * 4);
                let x, y;
                if (side === 0) { x = leftX + Math.random() * (rightX - leftX); y = topY; }
                else if (side === 1) { x = leftX + Math.random() * (rightX - leftX); y = botY; }
                else if (side === 2) { x = leftX; y = topY + Math.random() * (botY - topY); }
                else { x = rightX; y = topY + Math.random() * (botY - topY); }

                ParticleSystem.burst(x, y, 3, {
                    color: '#ff4757', speed: 1, size: 2, life: 30,
                    gravity: 0, shape: 'circle', glow: 4
                });
            }

            // Rising embers in danger zone
            ParticleSystem.embers(
                (leftX + rightX) / 2, (topY + botY) / 2, 8,
                { spread: rightX - leftX, color: '#ff6b4a' }
            );

            GameRenderer.triggerShake(4, 10);
        };
    }

    // ═══════ SOLO TIMER ═══════
    function startSoloTimer() {
        const startTime = Date.now();
        soloTimerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            soloTimeEl.textContent = formatTime(elapsed);
        }, 500);
    }

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function submitSoloScore(name, score, time, mode) {
        fetch(`${window.GameConfig.BACKEND_URL}/api/solo-score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, score, survivalTime: time, mode })
        }).catch(() => { /* silent fail for offline */ });
    }

    // ═══════ KILL FEED ═══════
    function addKillToast(name, color) {
        if (!killFeed) return;
        const toast = document.createElement('div');
        toast.className = 'kill-toast';
        toast.innerHTML = `<span class="kill-dot" style="background:${color}"></span><span class="kill-icon">💀</span> <span class="kill-name">${escapeHtml(name)}</span> eliminated`;
        killFeed.appendChild(toast);
        // Auto-remove after animation
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3800);
        // Keep max 4
        while (killFeed.children.length > 4) killFeed.removeChild(killFeed.firstChild);
    }

    // ═══════ SOLO: PLAY AGAIN ═══════
    function soloPlayAgain() {
        gameOverOverlay.classList.remove('active');
        deathBanner.classList.remove('active');
        playerDead = false;
        clearInterval(soloTimerInterval);
        if (window.ParticleSystem) ParticleSystem.clear();
        if (killFeed) killFeed.innerHTML = '';

        const playerName = sessionStorage.getItem('ouroboros_name') || 'Player';

        soloEngine.stop();
        soloEngine = new SoloEngine({
            mode: soloMode,
            playerName,
            botCount: soloMode === 'arena' ? botCount : 0,
            difficulty
        });

        if (soloMode === 'arena') {
            soloEngine.botAI = new BotAI(difficulty);
        }

        // Re-wire events
        wireEngineEvents(soloEngine);

        soloEngine.onStateUpdate = (state) => {
            latestState = state;
            if (state.snakes[actualId] && !state.snakes[actualId].alive && !playerDead) {
                playerDead = true;
                if (soloMode === 'arena') deathBanner.classList.add('active');
                GameControls.disable();
            }
            updateHUD(state);
            if (soloMode === 'arena') updateAbilities(state);
        };

        const bestKey = soloMode === 'classic' ? 'ouroboros_best_classic' : 'ouroboros_best_arena';
        const bestScore = parseInt(localStorage.getItem(bestKey) || '0');
        soloBestEl.textContent = bestScore;

        soloEngine.onGameEnd = (winner, scoreboard, survivalTime) => {
            gameRunning = false;
            GameControls.disable();
            deathBanner.classList.remove('active');
            clearInterval(soloTimerInterval);
            const playerScore = soloEngine.snakes.get(actualId)?.score || 0;
            if (playerScore > bestScore) {
                localStorage.setItem(bestKey, playerScore);
                soloBestEl.textContent = playerScore;
            }
            submitSoloScore(sessionStorage.getItem('ouroboros_name') || 'Player', playerScore, survivalTime, soloMode);
            if (soloMode === 'classic') {
                overlayIcon.textContent = '💀';
                overlayTitle.textContent = 'Game Over';
                overlayTitle.className = 'overlay-title defeat';
                overlaySubtitle.textContent = `Final Score: ${playerScore}`;
            } else {
                const isWinner = winner && winner.id === actualId;
                if (isWinner) {
                    overlayIcon.textContent = '🏆'; overlayTitle.textContent = 'Victory!';
                    overlayTitle.className = 'overlay-title victory';
                    overlaySubtitle.textContent = `You survived and won with ${playerScore} points!`;
                } else {
                    overlayIcon.textContent = '💀'; overlayTitle.textContent = 'Defeated';
                    overlayTitle.className = 'overlay-title defeat';
                    overlaySubtitle.textContent = winner ? `${winner.name} wins. Your score: ${playerScore}` : `No survivors! Your score: ${playerScore}`;
                }
                renderOverlayScoreboard(scoreboard);
            }
            overlaySoloStats.style.display = 'flex';
            finalScoreEl.textContent = playerScore;
            finalTimeEl.textContent = formatTime(survivalTime);
            gameOverOverlay.classList.add('active');
        };

        latestState = soloEngine.getState();

        startCountdown(() => {
            gameRunning = true;
            soloEngine.start();
            GameControls.enable();
            startSoloTimer();
        });
    }


    // ═══════════════════════════════════════
    //  MULTIPLAYER MODE
    // ═══════════════════════════════════════
    function initMultiplayerMode() {
        const socket = io(window.GameConfig.BACKEND_URL, {
            transports: ["websocket", "polling"],
            secure: true
        });

        // Init touch controls for multiplayer
        if (window.TouchControls) {
            TouchControls.init({ socket: socket });
        }

        socket.on('connect', () => {
            actualId = socket.id;
            const token = sessionStorage.getItem('ouroboros_token');
            if (token) {
                socket.emit('reconnect_with_token', { token }, (res) => {
                    if (res && res.error) {
                        console.warn('Token reconnect failed:', res.error);
                        window.location.href = 'lobby.html';
                        return;
                    }
                });
            } else {
                window.location.href = 'lobby.html';
            }
        });

        GameControls.init(socket);

        socket.on('gameStart', (state) => {
            latestState = state;
            gameRunning = true;
            playerDead = false;
            deathBanner.classList.remove('active');
            gameOverOverlay.classList.remove('active');
            actualId = socket.id;
            if (actualId && state.snakes[actualId]) {
                GameControls.setDirection(state.snakes[actualId].direction);
            }
            if (!renderStarted) { renderStarted = true; renderLoop(); }
            startCountdown(() => {
                GameControls.enable();
                window.focus();
            });
        });

        socket.on('gameState', (state) => {
            latestState = state;
            actualId = socket.id;
            if (actualId && state.snakes[actualId] && !state.snakes[actualId].alive && !playerDead) {
                playerDead = true;
                deathBanner.classList.add('active');
                GameControls.disable();
            }
            updateHUD(state);
            updateAbilities(state);
            if (!renderStarted) { renderStarted = true; renderLoop(); }
        });

        socket.on('gameOver', (data) => {
            gameRunning = false;
            GameControls.disable();
            deathBanner.classList.remove('active');
            actualId = socket.id;
            const isWinner = data.winner && data.winner.id === actualId;
            if (isWinner) {
                overlayIcon.textContent = '🏆'; overlayTitle.textContent = 'Victory!';
                overlayTitle.className = 'overlay-title victory';
                overlaySubtitle.textContent = `You win with ${data.winner.score} points!`;
            } else if (data.winner) {
                overlayIcon.textContent = '💀'; overlayTitle.textContent = 'Defeat';
                overlayTitle.className = 'overlay-title defeat';
                overlaySubtitle.textContent = `${data.winner.name} wins with ${data.winner.score} points`;
            } else {
                overlayIcon.textContent = '🤝'; overlayTitle.textContent = 'Draw';
                overlayTitle.className = 'overlay-title';
                overlaySubtitle.textContent = 'No survivors!';
            }
            renderOverlayScoreboard(data.scoreboard);
            gameOverOverlay.classList.add('active');
        });

        socket.on('returnToLobby', () => { window.location.href = 'lobby.html'; });

        const mpPlayAgain = () => { socket.emit('playAgain'); };
        const mpBackLobby = () => {
            socket.emit('leaveRoom');
            sessionStorage.removeItem('ouroboros_token');
            sessionStorage.removeItem('ouroboros_room');
            window.location.href = 'lobby.html';
        };
        btnPlayAgain.addEventListener('click', mpPlayAgain);
        btnBackLobby.addEventListener('click', mpBackLobby);
        btnPlayAgain.addEventListener('touchstart', function (e) { e.preventDefault(); mpPlayAgain(); }, { passive: false });
        btnBackLobby.addEventListener('touchstart', function (e) { e.preventDefault(); mpBackLobby(); }, { passive: false });
    }


    // ═══════════════════════════════════════
    //  SHARED FUNCTIONS
    // ═══════════════════════════════════════

    // ── Play Again / Back (solo override) ──
    // ── Global Ability Functions ──
    window.activateDash = function () {
        if (!gameRunning || playerDead) return;

        let me = null;
        if (latestState && actualId && latestState.snakes[actualId]) {
            me = latestState.snakes[actualId];
            if (me.dashCooldown > 0) return; // Prevent spam
        }

        console.log('[Game] Activate Dash');

        if (isSolo) {
            if (soloEngine && actualId) soloEngine.activateDash(actualId);
        } else {
            // Multiplayer
            const socket = window.GameControls.getSocket();
            if (socket) socket.emit('dash');
        }
    };

    window.placeTrap = function () {
        if (!gameRunning || playerDead) return;

        let me = null;
        if (latestState && actualId && latestState.snakes[actualId]) {
            me = latestState.snakes[actualId];
            if (me.trapCooldown > 0) return; // Prevent spam
        }

        console.log('[Game] Place Trap');

        if (isSolo) {
            if (soloEngine && actualId) soloEngine.placeTrap(actualId);
        } else {
            // Multiplayer
            const socket = window.GameControls.getSocket();
            if (socket) socket.emit('trap');
        }
    };

    window.changeDirection = function (dir) {
        if (!gameRunning || playerDead) return;

        // Prevent 180° turns client-side
        let currentDir = null;
        if (latestState && actualId && latestState.snakes[actualId]) {
            currentDir = latestState.snakes[actualId].direction;
        }

        const OPPOSITE = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
        if (currentDir && OPPOSITE[dir] === currentDir) return;

        if (isSolo) {
            if (soloEngine && actualId) soloEngine.setDirection(actualId, dir);
        } else {
            const socket = window.GameControls.getSocket();
            if (socket) socket.emit('direction', dir);
        }
    };

    // ── Play Again / Back (solo override) ──
    if (isSolo) {
        const soloBackLobby = () => {
            if (soloEngine) soloEngine.stop();
            clearInterval(soloTimerInterval);
            window.location.href = 'lobby.html';
        };
        btnPlayAgain.addEventListener('click', soloPlayAgain);
        btnBackLobby.addEventListener('click', soloBackLobby);
        btnPlayAgain.addEventListener('touchstart', function (e) { e.preventDefault(); soloPlayAgain(); }, { passive: false });
        btnBackLobby.addEventListener('touchstart', function (e) { e.preventDefault(); soloBackLobby(); }, { passive: false });
    }

    // ── Countdown ──
    function startCountdown(onComplete) {
        const wrapper = document.getElementById('game-wrapper');
        const existing = wrapper.querySelector('.countdown-overlay');
        if (existing) existing.remove();

        const countdownEl = document.createElement('div');
        countdownEl.className = 'countdown-overlay';
        countdownEl.innerHTML = '<span class="countdown-number">3</span>';
        wrapper.appendChild(countdownEl);
        const numEl = countdownEl.querySelector('.countdown-number');

        let count = 3;
        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                numEl.textContent = count;
                numEl.classList.remove('countdown-pop');
                void numEl.offsetWidth; // reflow
                numEl.classList.add('countdown-pop');
            } else if (count === 0) {
                numEl.textContent = 'GO!';
                numEl.style.color = '#00ff87';
                numEl.classList.remove('countdown-pop');
                void numEl.offsetWidth;
                numEl.classList.add('countdown-pop');
            } else {
                clearInterval(interval);
                countdownEl.classList.add('fade-out');
                setTimeout(() => countdownEl.remove(), 300);
                if (onComplete) onComplete();
            }
        }, 800);
    }

    // ── Render loop ──
    function renderLoop() {
        if (latestState) {
            GameRenderer.render(latestState, actualId);
        }
        requestAnimationFrame(renderLoop);
    }

    // ── HUD ──
    function updateHUD(state) {
        const snakes = Object.values(state.snakes);
        const alive = snakes.filter(s => s.alive);
        hudAlive.textContent = alive.length;

        // Cache names/colors for kill feed
        snakes.forEach(s => { snakeNames[s.id] = s.name; });

        const sorted = [...snakes].sort((a, b) => b.score - a.score);
        hudScores.innerHTML = '';
        sorted.forEach(s => {
            const li = document.createElement('li');
            li.className = 'hud-score-item' + (!s.alive ? ' dead' : '');
            const isMe = s.id === actualId;
            const nameText = isMe ? `${escapeHtml(s.name)} (you)` : escapeHtml(s.name);
            li.innerHTML = `
        <span class="hud-color-dot" style="background:${s.color}"></span>
        <span class="hud-score-name">${nameText}</span>
        <span class="hud-score-value">${s.score}</span>
      `;
            hudScores.appendChild(li);
        });
    }

    function updateAbilities(state) {
        if (!actualId || !state.snakes[actualId]) return;
        const me = state.snakes[actualId];
        if (me.dashCooldown > 0) {
            abilityDash.classList.add('on-cooldown');
            abilityDash.classList.remove('active');
            abilityDash.style.setProperty('--cooldown-pct', (me.dashCooldown / 35 * 100) + '%');
        } else {
            abilityDash.classList.remove('on-cooldown');
            abilityDash.style.setProperty('--cooldown-pct', '0%');
        }
        if (me.dashActive) abilityDash.classList.add('active');
        else abilityDash.classList.remove('active');

        if (me.trapCooldown > 0) {
            abilityTrap.classList.add('on-cooldown');
            abilityTrap.style.setProperty('--cooldown-pct', (me.trapCooldown / 50 * 100) + '%');
        } else {
            abilityTrap.classList.remove('on-cooldown');
            abilityTrap.style.setProperty('--cooldown-pct', '0%');
        }
        // Sync mobile touch button cooldowns
        if (window.TouchControls) {
            TouchControls.updateCooldowns(me.dashCooldown, 35, me.trapCooldown, 50);
        }
    }

    function renderOverlayScoreboard(scoreboard) {
        overlayScoreboard.innerHTML = '';
        scoreboard.forEach((entry, i) => {
            const li = document.createElement('li');
            const isMe = entry.id === actualId;
            const nameText = isMe ? `${escapeHtml(entry.name)} (you)` : escapeHtml(entry.name);
            li.innerHTML = `
        <span class="sb-rank">#${i + 1}</span>
        <span class="sb-color" style="background:${entry.color}"></span>
        <span class="sb-name">${nameText}</span>
        <span class="sb-kills">${entry.kills} kills</span>
        <span class="sb-score">${entry.score}</span>
      `;
            overlayScoreboard.appendChild(li);
        });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
})();
