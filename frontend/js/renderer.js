// renderer.js — AAA canvas game renderer
// Bloom glow, connected snake body, vignette, animated grid dots, food orbs, death dissolve

window.GameRenderer = (function () {
    'use strict';

    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');

    // Off-screen bloom buffer
    const bloomCanvas = document.createElement('canvas');
    const bloomCtx = bloomCanvas.getContext('2d');

    let width = 0, height = 0, cellSize = 0, offsetX = 0, offsetY = 0;
    let animFrame = 0;

    // Screen shake
    let shakeIntensity = 0, shakeDuration = 0, shakeX = 0, shakeY = 0;

    // Death dissolve tracking
    const deathTimers = {}; // id -> { body, color, startFrame }
    const DISSOLVE_FRAMES = 45;

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        bloomCanvas.width = Math.floor(width / 2);
        bloomCanvas.height = Math.floor(height / 2);
    }
    window.addEventListener('resize', resize);
    resize();

    function calcLayout(gs) {
        cellSize = Math.floor(Math.min((width - 40) / gs, (height - 40) / gs));
        offsetX = Math.floor((width - cellSize * gs) / 2);
        offsetY = Math.floor((height - cellSize * gs) / 2);
    }

    function triggerShake(i, d) { shakeIntensity = i || 6; shakeDuration = d || 15; }

    // ═══════ HELPERS ═══════
    function hexToRgb(h) {
        return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) };
    }
    function rgba(h, a) { const c = hexToRgb(h); return `rgba(${c.r},${c.g},${c.b},${a})`; }

    // ═══════ GRID — ANIMATED DOTS ═══════
    function drawGrid(state) {
        const { gridSize, arenaBounds: ab } = state;

        ctx.fillStyle = '#060608';
        ctx.fillRect(0, 0, width, height);

        // Subtle radial ambience
        const gx = offsetX + gridSize * cellSize / 2, gy = offsetY + gridSize * cellSize / 2;
        const ambGrad = ctx.createRadialGradient(gx, gy, 0, gx, gy, gridSize * cellSize * 0.55);
        ambGrad.addColorStop(0, 'rgba(0, 255, 135, 0.015)');
        ambGrad.addColorStop(0.5, 'rgba(168, 85, 247, 0.008)');
        ambGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = ambGrad;
        ctx.fillRect(0, 0, width, height);

        // Dot grid (intersections only)
        const breathe = 0.5 + Math.sin(animFrame * 0.015) * 0.2;
        for (let x = ab.minX; x <= ab.maxX + 1; x++) {
            for (let y = ab.minY; y <= ab.maxY + 1; y++) {
                const px = offsetX + x * cellSize;
                const py = offsetY + y * cellSize;
                const distFromCenter = Math.abs(x - gridSize / 2) + Math.abs(y - gridSize / 2);
                const fade = Math.max(0, 1 - distFromCenter / (gridSize * 0.7));
                const dotAlpha = (0.06 + breathe * 0.04) * fade;
                const sz = 1 + fade * 0.5;

                ctx.fillStyle = `rgba(255, 255, 255, ${dotAlpha})`;
                ctx.beginPath();
                ctx.arc(px, py, sz, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Out-of-bounds danger zone
        if (ab.minX > 0) {
            const da = 0.08 + Math.sin(animFrame * 0.04) * 0.04;

            // Create danger gradient from edge inward
            const drawDangerSide = (x, y, w, h) => {
                ctx.fillStyle = `rgba(255, 30, 30, ${da})`;
                ctx.fillRect(x, y, w, h);
            };

            drawDangerSide(offsetX, offsetY, gridSize * cellSize, ab.minY * cellSize);
            drawDangerSide(offsetX, offsetY + (ab.maxY + 1) * cellSize, gridSize * cellSize, (gridSize - ab.maxY - 1) * cellSize);
            drawDangerSide(offsetX, offsetY, ab.minX * cellSize, gridSize * cellSize);
            drawDangerSide(offsetX + (ab.maxX + 1) * cellSize, offsetY, (gridSize - ab.maxX - 1) * cellSize, gridSize * cellSize);

            // Scanning line effect inside danger zone
            const scanY = offsetY + ((animFrame * 1.5) % (gridSize * cellSize));
            ctx.strokeStyle = `rgba(255, 50, 50, ${da * 0.6})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(offsetX, scanY);
            ctx.lineTo(offsetX + gridSize * cellSize, scanY);
            ctx.stroke();
        }

        // Boundary — double-line glow with corner markers
        const bx = offsetX + ab.minX * cellSize, by = offsetY + ab.minY * cellSize;
        const bw = (ab.maxX - ab.minX + 1) * cellSize, bh = (ab.maxY - ab.minY + 1) * cellSize;
        const pa = 0.2 + Math.sin(animFrame * 0.06) * 0.1;

        // Outer glow
        ctx.shadowColor = '#ff4757';
        ctx.shadowBlur = 15;
        ctx.strokeStyle = `rgba(255, 71, 87, ${pa * 0.4})`;
        ctx.lineWidth = 3;
        ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
        ctx.shadowBlur = 0;

        // Inner crisp line
        ctx.strokeStyle = `rgba(255, 71, 87, ${pa})`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx, by, bw, bh);

        // Corner brackets
        const cLen = Math.min(20, bw * 0.05);
        ctx.strokeStyle = `rgba(255, 71, 87, ${pa * 1.5})`;
        ctx.lineWidth = 2;
        [[bx, by, 1, 1], [bx + bw, by, -1, 1], [bx, by + bh, 1, -1], [bx + bw, by + bh, -1, -1]].forEach(([cx, cy, dx, dy]) => {
            ctx.beginPath();
            ctx.moveTo(cx + dx * cLen, cy);
            ctx.lineTo(cx, cy);
            ctx.lineTo(cx, cy + dy * cLen);
            ctx.stroke();
        });
    }

    // ═══════ FOOD — DIAMOND + ORBITING PARTICLES ═══════
    function drawFood(foods) {
        const pulse = 0.65 + Math.sin(animFrame * 0.08) * 0.25;

        foods.forEach(food => {
            const cx = offsetX + food.x * cellSize + cellSize / 2;
            const cy = offsetY + food.y * cellSize + cellSize / 2;
            const r = cellSize * 0.28 + Math.sin(animFrame * 0.06) * cellSize * 0.03;

            // Radial glow
            const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, cellSize * 0.8);
            glow.addColorStop(0, `rgba(255, 71, 87, ${pulse * 0.18})`);
            glow.addColorStop(0.5, `rgba(255, 71, 87, ${pulse * 0.05})`);
            glow.addColorStop(1, 'rgba(255, 71, 87, 0)');
            ctx.fillStyle = glow;
            ctx.fillRect(cx - cellSize, cy - cellSize, cellSize * 2, cellSize * 2);

            // Orbiting mini-particles (3 orbs)
            for (let o = 0; o < 3; o++) {
                const angle = animFrame * 0.04 + (Math.PI * 2 / 3) * o;
                const orbR = cellSize * 0.35;
                const ox = cx + Math.cos(angle) * orbR;
                const oy = cy + Math.sin(angle) * orbR;
                const oa = 0.35 + Math.sin(animFrame * 0.1 + o * 2) * 0.2;
                ctx.fillStyle = `rgba(255, 120, 130, ${oa})`;
                ctx.beginPath();
                ctx.arc(ox, oy, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }

            // Core diamond
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(animFrame * 0.025);
            ctx.shadowColor = '#ff4757';
            ctx.shadowBlur = 16;
            ctx.fillStyle = `rgba(255, 71, 87, ${pulse})`;
            ctx.beginPath();
            ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.7, 0);
            ctx.closePath();
            ctx.fill();

            // Inner bright core
            ctx.shadowBlur = 0;
            ctx.fillStyle = `rgba(255, 220, 220, ${pulse * 0.5})`;
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
        ctx.shadowBlur = 0;
    }

    // ═══════ SNAKES — CONNECTED SMOOTH PATH ═══════
    function drawSnakes(snakes, myId) {
        for (const id in snakes) {
            const snake = snakes[id];
            if (!snake.alive && snake.body.length === 0) continue;

            const color = snake.color;
            const isMe = id === myId;
            const rgb = hexToRgb(color);
            const bodyAlpha = snake.alive ? 1 : 0.12;

            if (snake.body.length < 2) {
                // Single segment
                const seg = snake.body[0];
                const px = offsetX + seg.x * cellSize + cellSize / 2;
                const py = offsetY + seg.y * cellSize + cellSize / 2;
                ctx.fillStyle = rgba(color, bodyAlpha);
                ctx.beginPath();
                ctx.arc(px, py, cellSize * 0.42, 0, Math.PI * 2);
                ctx.fill();
                continue;
            }

            // Draw connected body as thick smooth line
            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // Main body path (thicker, base color)
            const bodyWidth = cellSize * 0.72;
            const tailWidth = cellSize * 0.35;

            // Draw segments from tail to head with gradient width
            for (let i = snake.body.length - 1; i >= 1; i--) {
                const s1 = snake.body[i];
                const s2 = snake.body[i - 1];
                const t = i / Math.max(snake.body.length - 1, 1);
                const w = tailWidth + (bodyWidth - tailWidth) * (1 - t);
                const a = bodyAlpha * (0.55 + (1 - t) * 0.45);

                ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
                ctx.lineWidth = w;
                ctx.beginPath();
                ctx.moveTo(offsetX + s1.x * cellSize + cellSize / 2, offsetY + s1.y * cellSize + cellSize / 2);
                ctx.lineTo(offsetX + s2.x * cellSize + cellSize / 2, offsetY + s2.y * cellSize + cellSize / 2);
                ctx.stroke();
            }

            // Inner highlight line (thinner, brighter)
            const innerWidth = bodyWidth * 0.35;
            for (let i = snake.body.length - 1; i >= 1; i--) {
                const s1 = snake.body[i];
                const s2 = snake.body[i - 1];
                const t = i / Math.max(snake.body.length - 1, 1);
                const w = innerWidth * (1 - t * 0.5);
                const a = bodyAlpha * 0.15 * (1 - t);

                if (a < 0.01) continue;
                ctx.strokeStyle = `rgba(255, 255, 255, ${a})`;
                ctx.lineWidth = w;
                ctx.beginPath();
                ctx.moveTo(offsetX + s1.x * cellSize + cellSize / 2, offsetY + s1.y * cellSize + cellSize / 2);
                ctx.lineTo(offsetX + s2.x * cellSize + cellSize / 2, offsetY + s2.y * cellSize + cellSize / 2);
                ctx.stroke();
            }

            ctx.restore();

            // HEAD — glowing circle with eyes
            const head = snake.body[0];
            const hx = offsetX + head.x * cellSize + cellSize / 2;
            const hy = offsetY + head.y * cellSize + cellSize / 2;
            const headR = cellSize * 0.44;

            ctx.shadowColor = color;
            ctx.shadowBlur = snake.dashActive ? 25 : 10;
            ctx.fillStyle = rgba(color, bodyAlpha);
            ctx.beginPath();
            ctx.arc(hx, hy, headR, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Head inner bright spot
            ctx.fillStyle = `rgba(255, 255, 255, ${bodyAlpha * 0.12})`;
            ctx.beginPath();
            ctx.arc(hx - headR * 0.15, hy - headR * 0.15, headR * 0.45, 0, Math.PI * 2);
            ctx.fill();

            // Direction chevron
            if (snake.alive) {
                drawChevron(hx, hy, headR, snake.direction, color, bodyAlpha);
                drawEyes(offsetX + head.x * cellSize, offsetY + head.y * cellSize, snake.direction, isMe ? '#fff' : '#ddd');
            } else {
                drawDeadEyes(offsetX + head.x * cellSize, offsetY + head.y * cellSize, snake.direction);
            }

            // Dash particles
            if (snake.dashActive && snake.alive && window.ParticleSystem) {
                const tail = snake.body[Math.min(2, snake.body.length - 1)];
                const tx = offsetX + tail.x * cellSize + cellSize / 2;
                const ty = offsetY + tail.y * cellSize + cellSize / 2;
                ParticleSystem.trail(tx, ty, 3, { color, size: 3, life: 14, spread: cellSize * 0.5, alpha: 0.6, glow: 8 });
            }

            // Name label
            if (!isMe && snake.alive) {
                ctx.font = '600 9px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillStyle = rgba(color, 0.55);
                ctx.fillText(snake.name, hx, hy - headR - 4);
            }
        }
    }

    // ═══════ DIRECTION CHEVRON ═══════
    function drawChevron(hx, hy, headR, dir, color, alpha) {
        const d = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] }[dir] || [1, 0];
        const tipX = hx + d[0] * headR * 0.75;
        const tipY = hy + d[1] * headR * 0.75;

        ctx.strokeStyle = rgba(color, alpha * 0.35);
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';

        const perpX = -d[1], perpY = d[0];
        const baseX = tipX - d[0] * headR * 0.35;
        const baseY = tipY - d[1] * headR * 0.35;

        ctx.beginPath();
        ctx.moveTo(baseX + perpX * headR * 0.3, baseY + perpY * headR * 0.3);
        ctx.lineTo(tipX, tipY);
        ctx.lineTo(baseX - perpX * headR * 0.3, baseY - perpY * headR * 0.3);
        ctx.stroke();
    }

    // ═══════ EYES ═══════
    function drawEyes(px, py, dir, color) {
        const s = cellSize, eyeR = Math.max(2, s * 0.12), pupilR = eyeR * 0.5;
        const positions = {
            RIGHT: [[0.72, 0.28], [0.72, 0.68]],
            LEFT: [[0.28, 0.28], [0.28, 0.68]],
            UP: [[0.28, 0.28], [0.68, 0.28]],
            DOWN: [[0.28, 0.72], [0.68, 0.72]]
        }[dir] || [[0.72, 0.28], [0.72, 0.68]];

        positions.forEach(([fx, fy]) => {
            const ex = px + s * fx, ey = py + s * fy;
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#0a0a0c';
            ctx.beginPath(); ctx.arc(ex, ey, pupilR, 0, Math.PI * 2); ctx.fill();
        });
    }

    function drawDeadEyes(px, py, dir) {
        const s = cellSize, sz = Math.max(2, s * 0.1);
        const positions = {
            RIGHT: [[0.72, 0.28], [0.72, 0.68]], LEFT: [[0.28, 0.28], [0.28, 0.68]],
            UP: [[0.28, 0.28], [0.68, 0.28]], DOWN: [[0.28, 0.72], [0.68, 0.72]]
        }[dir] || [[0.28, 0.72], [0.68, 0.72]];

        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.5;
        positions.forEach(([fx, fy]) => {
            const cx = px + s * fx, cy = py + s * fy;
            ctx.beginPath(); ctx.moveTo(cx - sz, cy - sz); ctx.lineTo(cx + sz, cy + sz); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx + sz, cy - sz); ctx.lineTo(cx - sz, cy + sz); ctx.stroke();
        });
    }

    // ═══════ TRAPS ═══════
    function drawTraps(traps) {
        traps.forEach(trap => {
            const cx = offsetX + trap.x * cellSize + cellSize / 2;
            const cy = offsetY + trap.y * cellSize + cellSize / 2;
            const r = cellSize * 0.32;
            const pulse = 0.5 + Math.sin(animFrame * 0.1) * 0.2;

            // Glow
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cellSize * 0.7);
            g.addColorStop(0, `rgba(255, 170, 50, ${pulse * 0.12})`);
            g.addColorStop(1, 'rgba(255, 170, 50, 0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(cx, cy, cellSize * 0.7, 0, Math.PI * 2); ctx.fill();

            // Triangle
            ctx.fillStyle = `rgba(255, 170, 50, ${pulse})`;
            ctx.shadowColor = '#ffaa32';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.moveTo(cx, cy - r); ctx.lineTo(cx - r, cy + r * 0.7); ctx.lineTo(cx + r, cy + r * 0.7);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;

            // ! mark
            ctx.fillStyle = '#060608';
            ctx.font = `bold ${Math.floor(cellSize * 0.3)}px sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('!', cx, cy + 1);
        });
    }

    // ═══════ WORMHOLES ═══════
    function drawWormholes(wormholes) {
        wormholes.forEach(wh => {
            [wh.a, wh.b].forEach((portal, idx) => {
                const px = offsetX + portal.x * cellSize + cellSize / 2;
                const py = offsetY + portal.y * cellSize + cellSize / 2;
                const r = cellSize * 0.5;
                const hue = idx === 0 ? 270 : 180;

                // Spiral rings
                for (let ring = 5; ring >= 0; ring--) {
                    const angle = animFrame * (0.035 + ring * 0.01) * (ring % 2 ? 1 : -1);
                    const ringR = r * (0.2 + ring * 0.16);
                    const a = 0.3 - ring * 0.04;
                    ctx.strokeStyle = `hsla(${hue}, 75%, 60%, ${a})`;
                    ctx.lineWidth = 1.2;
                    ctx.beginPath();
                    ctx.arc(px, py, ringR, angle, angle + Math.PI * 1.4);
                    ctx.stroke();
                }

                // Inner vortex
                const vg = ctx.createRadialGradient(px, py, 0, px, py, r * 0.35);
                vg.addColorStop(0, `hsla(${hue}, 90%, 70%, 0.45)`);
                vg.addColorStop(0.6, `hsla(${hue}, 85%, 55%, 0.1)`);
                vg.addColorStop(1, `hsla(${hue}, 85%, 55%, 0)`);
                ctx.fillStyle = vg;
                ctx.beginPath(); ctx.arc(px, py, r * 0.35, 0, Math.PI * 2); ctx.fill();

                // Center sparkle
                const sp = 0.5 + Math.sin(animFrame * 0.12 + idx * 3) * 0.3;
                ctx.fillStyle = `hsla(${hue}, 90%, 85%, ${sp})`;
                ctx.shadowColor = `hsla(${hue}, 90%, 70%, 0.5)`;
                ctx.shadowBlur = 8;
                ctx.beginPath(); ctx.arc(px, py, r * 0.06, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
            });

            // Connection line
            const ax = offsetX + wh.a.x * cellSize + cellSize / 2;
            const ay = offsetY + wh.a.y * cellSize + cellSize / 2;
            const bx = offsetX + wh.b.x * cellSize + cellSize / 2;
            const by = offsetY + wh.b.y * cellSize + cellSize / 2;
            ctx.strokeStyle = `rgba(168, 85, 247, ${0.03 + Math.sin(animFrame * 0.02) * 0.015})`;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 12]);
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
            ctx.setLineDash([]);
        });
    }

    // ═══════ DEATH DISSOLVE ═══════
    function drawDissolving() {
        for (const id in deathTimers) {
            const d = deathTimers[id];
            const elapsed = animFrame - d.startFrame;
            if (elapsed > DISSOLVE_FRAMES) { delete deathTimers[id]; continue; }

            const progress = elapsed / DISSOLVE_FRAMES;
            const rgb = hexToRgb(d.color);

            d.body.forEach((seg, i) => {
                const delay = i * 0.04;
                const t = Math.max(0, Math.min(1, (progress - delay) / (1 - delay)));
                if (t >= 1) return;

                const alpha = (1 - t) * 0.5;
                const scale = 1 + t * 0.8;
                const px = offsetX + seg.x * cellSize + cellSize / 2;
                const py = offsetY + seg.y * cellSize + cellSize / 2;
                const sz = (cellSize * 0.35) * scale;

                ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
                ctx.beginPath();
                ctx.arc(px, py - t * 8, sz, 0, Math.PI * 2);
                ctx.fill();
            });
        }
    }

    function registerDeath(id, body, color) {
        deathTimers[id] = { body: body.slice(), color, startFrame: animFrame };
    }

    // ═══════ BLOOM PASS ═══════
    function applyBloom() {
        // Downscale main canvas to bloom buffer
        bloomCtx.clearRect(0, 0, bloomCanvas.width, bloomCanvas.height);
        bloomCtx.filter = 'blur(8px) brightness(1.5)';
        bloomCtx.drawImage(canvas, 0, 0, bloomCanvas.width, bloomCanvas.height);
        bloomCtx.filter = 'none';

        // Composite bloom back at lower opacity with additive blend
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.12;
        ctx.drawImage(bloomCanvas, 0, 0, width, height);
        ctx.restore();
    }

    // ═══════ VIGNETTE ═══════
    function drawVignette() {
        const vg = ctx.createRadialGradient(width / 2, height / 2, height * 0.25, width / 2, height / 2, height * 0.85);
        vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vg.addColorStop(0.7, 'rgba(0, 0, 0, 0.15)');
        vg.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, width, height);
    }

    // ═══════ MAIN RENDER ═══════
    function render(state, myId) {
        animFrame++;
        calcLayout(state.gridSize);

        // Screen shake
        if (shakeDuration > 0) {
            shakeDuration--;
            const decay = shakeDuration / 15;
            shakeX = (Math.random() - 0.5) * shakeIntensity * decay;
            shakeY = (Math.random() - 0.5) * shakeIntensity * decay;
        } else { shakeX = 0; shakeY = 0; }

        ctx.save();
        ctx.translate(shakeX, shakeY);

        drawGrid(state);
        drawWormholes(state.wormholes);
        drawFood(state.foods);
        drawTraps(state.traps);
        drawDissolving();
        drawSnakes(state.snakes, myId);

        // Particles
        if (window.ParticleSystem) {
            ParticleSystem.spawnAmbient(state.arenaBounds, cellSize, offsetX, offsetY);
            ParticleSystem.update();
            ParticleSystem.draw(ctx);
        }

        ctx.restore();

        // Post-processing
        applyBloom();
        drawVignette();
    }

    function getCellCenter(x, y) {
        return { px: offsetX + x * cellSize + cellSize / 2, py: offsetY + y * cellSize + cellSize / 2 };
    }

    return { render, resize, triggerShake, getCellCenter, registerDeath };
})();
