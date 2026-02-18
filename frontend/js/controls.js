// controls.js - Keyboard input handler for game

window.GameControls = (function () {
    'use strict';

    let socket = null;
    let enabled = false;
    let lastDirection = null;

    const KEY_MAP = {
        'ArrowUp': 'UP',
        'ArrowDown': 'DOWN',
        'ArrowLeft': 'LEFT',
        'ArrowRight': 'RIGHT',
        'w': 'UP',
        'W': 'UP',
        's': 'DOWN',
        'S': 'DOWN',
        'a': 'LEFT',
        'A': 'LEFT',
        'd': 'RIGHT',
        'D': 'RIGHT'
    };

    const OPPOSITE = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };

    function init(socketInstance) {
        socket = socketInstance;
        enabled = true;

        document.addEventListener('keydown', handleKeyDown);
    }

    function handleKeyDown(e) {
        if (!enabled) return;

        // Direction
        const dir = KEY_MAP[e.key];
        if (dir) {
            e.preventDefault();
            if (window.changeDirection) window.changeDirection(dir);
            return;
        }

        // Dash
        if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            if (window.activateDash) window.activateDash();
            return;
        }

        // Trap
        if (e.key === 't' || e.key === 'T') {
            e.preventDefault();
            if (window.placeTrap) window.placeTrap();
            return;
        }
    }

    function disable() {
        enabled = false;
    }

    function enable() {
        enabled = true;
    }

    function setDirection(dir) {
        lastDirection = dir;
    }

    function getSocket() {
        return socket;
    }

    return { init, disable, enable, setDirection, getSocket };
})();
