// landing.js — AAA animated grid, parallax, demo snake with glow trail, modal interactions

(function () {
    'use strict';

    // ═══════ PARALLAX GRID BACKGROUND ═══════
    const bgCanvas = document.getElementById('hero-bg-canvas');
    const bgCtx = bgCanvas.getContext('2d');
    let mouseX = 0.5, mouseY = 0.5; // normalized 0-1

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX / window.innerWidth;
        mouseY = e.clientY / window.innerHeight;
    });

    function resizeBgCanvas() {
        bgCanvas.width = window.innerWidth;
        bgCanvas.height = window.innerHeight;
    }
    resizeBgCanvas();
    window.addEventListener('resize', resizeBgCanvas);

    const CELL = 28;

    let bgFrame = 0;
    function drawGrid() {
        bgFrame++;
        const { width, height } = bgCanvas;
        bgCtx.clearRect(0, 0, width, height);

        const cols = Math.ceil(width / CELL) + 1;
        const rows = Math.ceil(height / CELL) + 1;
        const cx = width / 2, cy = height / 2;
        const maxDist = Math.sqrt(cx * cx + cy * cy);

        // Parallax offset based on mouse
        const parallaxX = (mouseX - 0.5) * 12;
        const parallaxY = (mouseY - 0.5) * 12;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const baseX = c * CELL;
                const baseY = r * CELL;
                const dx = baseX + CELL / 2 - cx;
                const dy = baseY + CELL / 2 - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const t = dist / maxDist;

                // Parallax: cells closer to center move more
                const pFactor = (1 - t) * 0.8;
                const x = baseX + parallaxX * pFactor;
                const y = baseY + parallaxY * pFactor;

                const breathe = Math.sin(bgFrame * 0.008 + dist * 0.003) * 0.02;

                // Vignette fade
                const alpha = Math.max(0, 0.08 - t * 0.06 + breathe);
                if (alpha <= 0) continue;

                // Color tint near center
                const greenTint = (1 - t) * 0.2;
                const rr = Math.floor(255 * (1 - greenTint));
                const gg = 255;
                const bb = Math.floor(255 * (1 - greenTint * 0.5));

                bgCtx.fillStyle = `rgba(${rr}, ${gg}, ${bb}, ${alpha})`;
                bgCtx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
            }
        }
    }

    // Animate background
    function bgLoop() {
        drawGrid();
        requestAnimationFrame(bgLoop);
    }
    bgLoop();

    window.addEventListener('resize', drawGrid);

    // ═══════ ANIMATED GAME PREVIEW ═══════
    const previewCanvas = document.getElementById('game-preview-canvas');
    const pCtx = previewCanvas.getContext('2d');

    function resizePreview() {
        const rect = previewCanvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        previewCanvas.width = rect.width * dpr;
        previewCanvas.height = rect.height * dpr;
        pCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resizePreview();

    const PREVIEW_CELL = 18;
    let previewWidth, previewHeight, previewCols, previewRows;

    function recalcPreviewDimensions() {
        const rect = previewCanvas.getBoundingClientRect();
        previewWidth = rect.width;
        previewHeight = rect.height;
        previewCols = Math.floor(previewWidth / PREVIEW_CELL);
        previewRows = Math.floor(previewHeight / PREVIEW_CELL);
    }
    recalcPreviewDimensions();

    const demoSnake = { body: [], dir: { x: 1, y: 0 }, length: 14 };

    function initDemoSnake() {
        recalcPreviewDimensions();
        const startX = Math.floor(previewCols * 0.3);
        const startY = Math.floor(previewRows / 2);
        demoSnake.body = [];
        for (let i = 0; i < demoSnake.length; i++) {
            demoSnake.body.push({ x: startX - i, y: startY });
        }
        demoSnake.dir = { x: 1, y: 0 };
    }
    initDemoSnake();

    let demoFood = { x: 0, y: 0 };
    function spawnDemoFood() {
        demoFood.x = Math.floor(Math.random() * (previewCols - 4)) + 2;
        demoFood.y = Math.floor(Math.random() * (previewRows - 4)) + 2;
    }
    spawnDemoFood();

    // Trail history for glow
    const trailHistory = [];
    const MAX_TRAIL = 40;

    function updateDemoDirection() {
        const head = demoSnake.body[0];
        const dx = demoFood.x - head.x;
        const dy = demoFood.y - head.y;

        if (Math.random() < 0.7) {
            if (dx > 0 && demoSnake.dir.x !== -1) demoSnake.dir = { x: 1, y: 0 };
            else if (dx < 0 && demoSnake.dir.x !== 1) demoSnake.dir = { x: -1, y: 0 };
            else if (dy > 0 && demoSnake.dir.y !== -1) demoSnake.dir = { x: 0, y: 1 };
            else if (dy < 0 && demoSnake.dir.y !== 1) demoSnake.dir = { x: 0, y: -1 };
        }
    }

    function moveDemoSnake() {
        updateDemoDirection();
        const head = demoSnake.body[0];
        const newHead = { x: head.x + demoSnake.dir.x, y: head.y + demoSnake.dir.y };

        if (newHead.x < 0) newHead.x = previewCols - 1;
        if (newHead.x >= previewCols) newHead.x = 0;
        if (newHead.y < 0) newHead.y = previewRows - 1;
        if (newHead.y >= previewRows) newHead.y = 0;

        demoSnake.body.unshift(newHead);

        // Store trail
        trailHistory.unshift({ x: newHead.x, y: newHead.y });
        if (trailHistory.length > MAX_TRAIL) trailHistory.pop();

        if (newHead.x === demoFood.x && newHead.y === demoFood.y) {
            demoSnake.length++;
            spawnDemoFood();
        }
        while (demoSnake.body.length > demoSnake.length) demoSnake.body.pop();
    }

    let previewFrame = 0;
    function drawPreview() {
        previewFrame++;
        const w = previewWidth, h = previewHeight;
        pCtx.clearRect(0, 0, w, h);

        const oX = (w - previewCols * PREVIEW_CELL) / 2;
        const oY = (h - previewRows * PREVIEW_CELL) / 2;

        // Grid dots
        for (let r = 0; r <= previewRows; r++) {
            for (let c = 0; c <= previewCols; c++) {
                pCtx.fillStyle = 'rgba(255, 255, 255, 0.04)';
                pCtx.beginPath();
                pCtx.arc(oX + c * PREVIEW_CELL, oY + r * PREVIEW_CELL, 0.8, 0, Math.PI * 2);
                pCtx.fill();
            }
        }

        // Glow trail
        trailHistory.forEach((t, i) => {
            const alpha = (1 - i / MAX_TRAIL) * 0.08;
            if (alpha <= 0) return;
            const tx = oX + t.x * PREVIEW_CELL + PREVIEW_CELL / 2;
            const ty = oY + t.y * PREVIEW_CELL + PREVIEW_CELL / 2;
            pCtx.fillStyle = `rgba(0, 255, 135, ${alpha})`;
            pCtx.beginPath();
            pCtx.arc(tx, ty, PREVIEW_CELL * 0.6, 0, Math.PI * 2);
            pCtx.fill();
        });

        // Food with glow
        const fx = oX + demoFood.x * PREVIEW_CELL + PREVIEW_CELL / 2;
        const fy = oY + demoFood.y * PREVIEW_CELL + PREVIEW_CELL / 2;
        const pulse = 0.5 + Math.sin(previewFrame * 0.06) * 0.3;

        const fg = pCtx.createRadialGradient(fx, fy, 0, fx, fy, PREVIEW_CELL);
        fg.addColorStop(0, `rgba(255, 71, 87, ${pulse * 0.3})`);
        fg.addColorStop(1, 'rgba(255, 71, 87, 0)');
        pCtx.fillStyle = fg;
        pCtx.beginPath(); pCtx.arc(fx, fy, PREVIEW_CELL, 0, Math.PI * 2); pCtx.fill();

        pCtx.fillStyle = `rgba(255, 71, 87, ${pulse})`;
        pCtx.shadowColor = '#ff4757';
        pCtx.shadowBlur = 12;
        pCtx.beginPath();
        pCtx.arc(fx, fy, PREVIEW_CELL * 0.3, 0, Math.PI * 2);
        pCtx.fill();
        pCtx.shadowBlur = 0;

        // Snake — connected smooth body
        pCtx.lineCap = 'round';
        pCtx.lineJoin = 'round';
        for (let i = demoSnake.body.length - 1; i >= 1; i--) {
            const s1 = demoSnake.body[i], s2 = demoSnake.body[i - 1];
            const t = i / demoSnake.body.length;
            const w = PREVIEW_CELL * (0.35 + (1 - t) * 0.35);
            const alpha = 0.5 + (1 - t) * 0.5;

            pCtx.strokeStyle = `rgba(0, 255, 135, ${alpha})`;
            pCtx.lineWidth = w;
            pCtx.beginPath();
            pCtx.moveTo(oX + s1.x * PREVIEW_CELL + PREVIEW_CELL / 2, oY + s1.y * PREVIEW_CELL + PREVIEW_CELL / 2);
            pCtx.lineTo(oX + s2.x * PREVIEW_CELL + PREVIEW_CELL / 2, oY + s2.y * PREVIEW_CELL + PREVIEW_CELL / 2);
            pCtx.stroke();
        }

        // Head glow
        const headSeg = demoSnake.body[0];
        const hx = oX + headSeg.x * PREVIEW_CELL + PREVIEW_CELL / 2;
        const hy = oY + headSeg.y * PREVIEW_CELL + PREVIEW_CELL / 2;
        pCtx.shadowColor = '#00ff87';
        pCtx.shadowBlur = 10;
        pCtx.fillStyle = 'rgba(0, 255, 135, 0.9)';
        pCtx.beginPath(); pCtx.arc(hx, hy, PREVIEW_CELL * 0.42, 0, Math.PI * 2); pCtx.fill();
        pCtx.shadowBlur = 0;

        // Eyes
        const dir = demoSnake.dir;
        const eSz = PREVIEW_CELL * 0.12;
        let e1dx = 0, e1dy = 0, e2dx = 0, e2dy = 0;
        if (dir.x === 1) { e1dx = 0.25; e1dy = -0.22; e2dx = 0.25; e2dy = 0.22; }
        else if (dir.x === -1) { e1dx = -0.25; e1dy = -0.22; e2dx = -0.25; e2dy = 0.22; }
        else if (dir.y === -1) { e1dx = -0.22; e1dy = -0.25; e2dx = 0.22; e2dy = -0.25; }
        else { e1dx = -0.22; e1dy = 0.25; e2dx = 0.22; e2dy = 0.25; }

        pCtx.fillStyle = '#fff';
        pCtx.beginPath(); pCtx.arc(hx + e1dx * PREVIEW_CELL, hy + e1dy * PREVIEW_CELL, eSz, 0, Math.PI * 2); pCtx.fill();
        pCtx.beginPath(); pCtx.arc(hx + e2dx * PREVIEW_CELL, hy + e2dy * PREVIEW_CELL, eSz, 0, Math.PI * 2); pCtx.fill();
    }

    let previewTickCounter = 0;
    function previewLoop() {
        previewTickCounter++;
        if (previewTickCounter % 5 === 0) moveDemoSnake();
        drawPreview();
        requestAnimationFrame(previewLoop);
    }
    previewLoop();

    window.addEventListener('resize', () => { resizePreview(); recalcPreviewDimensions(); });

    // ═══════ MODAL LOGIC ═══════
    function openModal(id) {
        document.getElementById(id).classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    function closeModal(id) {
        document.getElementById(id).classList.remove('active');
        document.body.style.overflow = '';
    }

    document.getElementById('nav-how-to-play').addEventListener('click', (e) => { e.preventDefault(); openModal('how-to-play-modal'); });
    document.getElementById('nav-about').addEventListener('click', (e) => { e.preventDefault(); openModal('about-modal'); });
    document.getElementById('htp-close').addEventListener('click', () => closeModal('how-to-play-modal'));
    document.getElementById('about-close').addEventListener('click', () => closeModal('about-modal'));

    // Touch support for modals
    const touchHandler = (id) => (e) => { e.preventDefault(); openModal(id); };
    const closeHandler = (id) => (e) => { e.preventDefault(); closeModal(id); };

    document.getElementById('nav-how-to-play').addEventListener('touchstart', touchHandler('how-to-play-modal'), { passive: false });
    document.getElementById('nav-about').addEventListener('touchstart', touchHandler('about-modal'), { passive: false });
    document.getElementById('htp-close').addEventListener('touchstart', closeHandler('how-to-play-modal'), { passive: false });
    document.getElementById('about-close').addEventListener('touchstart', closeHandler('about-modal'), { passive: false });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) { overlay.classList.remove('active'); document.body.style.overflow = ''; }
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(o => { o.classList.remove('active'); document.body.style.overflow = ''; });
        }
    });
})();
