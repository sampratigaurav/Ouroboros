// particles.js — AAA particle system with ring, confetti, embers, shimmer

window.ParticleSystem = (function () {
    'use strict';

    const particles = [];
    const MAX_PARTICLES = 800;

    // ═══════ PARTICLE ═══════
    function Particle(x, y, o) {
        this.x = x; this.y = y;
        this.vx = o.vx || 0; this.vy = o.vy || 0;
        this.life = o.life || 40; this.maxLife = this.life;
        this.size = o.size || 3;
        this.sizeEnd = o.sizeEnd !== undefined ? o.sizeEnd : 0;
        this.color = o.color || '#fff';
        this.alpha = o.alpha || 1;
        this.gravity = o.gravity || 0;
        this.friction = o.friction || 0.98;
        this.shape = o.shape || 'circle';
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = o.rotationSpeed || 0;
        this.glow = o.glow || 0;
    }

    // ═══════ SPAWN: BURST ═══════
    function burst(x, y, count, o) {
        for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
            const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
            const speed = (o.speed || 2) * (0.5 + Math.random() * 0.8);
            particles.push(new Particle(x, y, {
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                life: (o.life || 30) + Math.random() * 15,
                size: (o.size || 3) * (0.6 + Math.random() * 0.8),
                sizeEnd: o.sizeEnd !== undefined ? o.sizeEnd : 0,
                color: o.color || '#fff', alpha: o.alpha || 1,
                gravity: o.gravity || 0.02, friction: o.friction || 0.96,
                shape: o.shape || 'circle',
                rotationSpeed: (Math.random() - 0.5) * 0.15,
                glow: o.glow || 0
            }));
        }
    }

    // ═══════ SPAWN: TRAIL ═══════
    function trail(x, y, count, o) {
        for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
            particles.push(new Particle(
                x + (Math.random() - 0.5) * (o.spread || 6),
                y + (Math.random() - 0.5) * (o.spread || 6), {
                vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5,
                life: (o.life || 15) + Math.random() * 10,
                size: (o.size || 2) * (0.5 + Math.random()),
                color: o.color || '#fff', alpha: o.alpha || 0.7,
                friction: 0.93, shape: o.shape || 'circle', glow: o.glow || 0
            }
            ));
        }
    }

    // ═══════ SPAWN: RING ═══════
    function ring(x, y, count, o) {
        const radius = o.radius || 20;
        for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
            const angle = (Math.PI * 2 * i) / count;
            const speed = (o.speed || 1.5) * (0.8 + Math.random() * 0.4);
            particles.push(new Particle(
                x + Math.cos(angle) * radius * 0.3,
                y + Math.sin(angle) * radius * 0.3, {
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: (o.life || 25) + Math.random() * 10,
                size: (o.size || 2) * (0.7 + Math.random() * 0.6),
                color: o.color || '#a855f7', alpha: o.alpha || 0.8,
                friction: 0.94, glow: o.glow || 6,
                shape: 'circle'
            }
            ));
        }
    }

    // ═══════ SPAWN: CONFETTI ═══════
    function confetti(x, y, count, o) {
        const colors = o.colors || ['#ff4757', '#ffd93d', '#00ff87', '#4ecdc4', '#a855f7', '#ff6b6b'];
        for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
            const angle = (Math.random() - 0.5) * Math.PI;
            const speed = 2 + Math.random() * 4;
            particles.push(new Particle(x + (Math.random() - 0.5) * 30, y, {
                vx: Math.cos(angle) * speed,
                vy: -Math.abs(Math.sin(angle)) * speed - Math.random() * 2,
                life: 70 + Math.random() * 40,
                size: 3 + Math.random() * 3,
                color: colors[Math.floor(Math.random() * colors.length)],
                alpha: 1, gravity: 0.08, friction: 0.98,
                shape: 'square',
                rotationSpeed: (Math.random() - 0.5) * 0.3,
                glow: 0
            }));
        }
    }

    // ═══════ SPAWN: EMBERS ═══════
    function embers(x, y, count, o) {
        for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
            particles.push(new Particle(
                x + (Math.random() - 0.5) * (o.spread || 40),
                y + (Math.random() - 0.5) * (o.spread || 40), {
                vx: (Math.random() - 0.5) * 0.3,
                vy: -0.3 - Math.random() * 0.5,
                life: 60 + Math.random() * 40,
                size: 1 + Math.random() * 2,
                color: o.color || '#ff6b4a',
                alpha: 0.6 + Math.random() * 0.3,
                friction: 1, gravity: -0.005,
                shape: 'circle', glow: 4
            }
            ));
        }
    }

    // ═══════ SCORE POPUPS ═══════
    const scorePopups = [];

    function addScorePopup(x, y, text, color) {
        scorePopups.push({
            x, y, text: String(text),
            color: color || '#00ff87',
            life: 55, maxLife: 55, vy: -1.0
        });
    }

    // ═══════ AMBIENT ═══════
    let ambientTimer = 0;
    function spawnAmbient(bounds, cellSize, oX, oY) {
        ambientTimer++;
        if (ambientTimer % 6 !== 0 || particles.length > MAX_PARTICLES - 30) return;

        const x = oX + (bounds.minX + Math.random() * (bounds.maxX - bounds.minX + 1)) * cellSize;
        const y = oY + (bounds.minY + Math.random() * (bounds.maxY - bounds.minY + 1)) * cellSize;

        particles.push(new Particle(x, y, {
            vx: (Math.random() - 0.5) * 0.12,
            vy: -0.08 - Math.random() * 0.18,
            life: 90 + Math.random() * 50,
            size: 0.8 + Math.random() * 1.2,
            color: ['rgba(0, 255, 135, 0.25)', 'rgba(168, 85, 247, 0.18)', 'rgba(78, 205, 196, 0.15)'][Math.floor(Math.random() * 3)],
            alpha: 0.25, friction: 1, gravity: 0, shape: 'circle'
        }));
    }

    // ═══════ UPDATE & DRAW ═══════
    function update() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx; p.y += p.vy;
            p.vy += p.gravity; p.vx *= p.friction; p.vy *= p.friction;
            p.life--; p.rotation += p.rotationSpeed;
            if (p.life <= 0) particles.splice(i, 1);
        }
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            const sp = scorePopups[i];
            sp.y += sp.vy; sp.vy *= 0.97; sp.life--;
            if (sp.life <= 0) scorePopups.splice(i, 1);
        }
    }

    function draw(ctx) {
        for (const p of particles) {
            const prog = 1 - p.life / p.maxLife;
            const alpha = p.alpha * (1 - prog * prog);
            const size = p.size + (p.sizeEnd - p.size) * prog;
            if (alpha <= 0.005 || size <= 0) continue;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);

            if (p.glow > 0) { ctx.shadowColor = p.color; ctx.shadowBlur = p.glow; }

            ctx.fillStyle = p.color;

            if (p.shape === 'circle') {
                ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.fill();
            } else if (p.shape === 'square') {
                ctx.fillRect(-size, -size * 0.4, size * 2, size * 0.8); // confetti rectangle
            } else if (p.shape === 'star') {
                drawStar(ctx, 0, 0, 4, size, size * 0.4); ctx.fill();
            } else if (p.shape === 'shimmer') {
                // Elongated diamond
                ctx.beginPath();
                ctx.moveTo(0, -size * 1.5); ctx.lineTo(size * 0.4, 0);
                ctx.lineTo(0, size * 1.5); ctx.lineTo(-size * 0.4, 0);
                ctx.closePath(); ctx.fill();
            }
            ctx.restore();
        }

        // Score popups
        for (const sp of scorePopups) {
            const prog = 1 - sp.life / sp.maxLife;
            const alpha = 1 - prog * prog;
            const scale = 0.6 + prog * 0.6;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(sp.x, sp.y);
            ctx.scale(scale, scale);
            ctx.font = 'bold 15px Outfit, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.strokeStyle = 'rgba(0,0,0,0.7)';
            ctx.lineWidth = 3;
            ctx.strokeText(sp.text, 0, 0);
            ctx.fillStyle = sp.color;
            ctx.shadowColor = sp.color;
            ctx.shadowBlur = 10;
            ctx.fillText(sp.text, 0, 0);
            ctx.restore();
        }
    }

    function drawStar(ctx, cx, cy, spikes, outerR, innerR) {
        let rot = Math.PI / 2 * 3;
        const step = Math.PI / spikes;
        ctx.beginPath();
        ctx.moveTo(cx, cy - outerR);
        for (let i = 0; i < spikes; i++) {
            ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
            rot += step;
            ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
            rot += step;
        }
        ctx.closePath();
    }

    function clear() { particles.length = 0; scorePopups.length = 0; ambientTimer = 0; }

    return { burst, trail, ring, confetti, embers, addScorePopup, spawnAmbient, update, draw, clear };
})();
