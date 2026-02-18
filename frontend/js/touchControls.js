// touchControls.js — Mobile D-Pad / Joystick + Ability buttons
// Integrates with GameControls socket/soloEngine, never breaks desktop

window.TouchControls = (function () {
    'use strict';

    const MIN_SWIPE = 30;
    let socket = null;
    let soloEngine = null;
    let playerId = null;
    let enabled = false;
    let touchStartX = 0, touchStartY = 0;
    let swiping = false;

    // Control type: 'dpad' or 'joystick'
    let controlType = localStorage.getItem('ouroboros_control_type') || 'dpad';

    // Detect touch device
    const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    // Refs to created elements
    let controlsContainer = null;
    let abilitiesContainer = null;
    let joystickKnob = null;
    let joystickBase = null;
    let joystickActive = false;

    // Cooldown elements
    let dashBtnEl = null;
    let trapBtnEl = null;

    function init(opts) {
        if (!isTouchDevice) return;
        socket = opts.socket || null;
        soloEngine = opts.soloEngine || null;
        playerId = opts.playerId || null;
        enabled = true;

        // Prevent mobile browser interference on game wrapper
        const wrapper = document.getElementById('game-wrapper');
        if (wrapper) {
            wrapper.style.touchAction = 'none';
            wrapper.addEventListener('touchstart', onTouchStart, { passive: false });
            wrapper.addEventListener('touchend', onTouchEnd, { passive: false });
            wrapper.addEventListener('touchmove', onTouchMove, { passive: false });
        }

        // Prevent pull-to-refresh and double-tap zoom globally during game
        document.body.style.touchAction = 'none';
        document.body.style.overscrollBehavior = 'none';

        createMobileUI();
        document.body.classList.add('is-touch');
    }

    function onTouchMove(e) {
        if (enabled) e.preventDefault();
    }

    function onTouchStart(e) {
        if (!enabled) return;
        // Don't intercept touches on our control buttons
        if (e.target.closest('.mobile-controls-area') || e.target.closest('.touch-abilities')) return;
        e.preventDefault();
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        swiping = true;
    }

    function onTouchEnd(e) {
        if (!enabled || !swiping) return;
        if (e.target.closest('.mobile-controls-area') || e.target.closest('.touch-abilities')) return;
        e.preventDefault();
        swiping = false;

        const touch = e.changedTouches[0];
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;

        if (Math.abs(dx) < MIN_SWIPE && Math.abs(dy) < MIN_SWIPE) return;

        let dir;
        if (Math.abs(dx) > Math.abs(dy)) {
            dir = dx > 0 ? 'RIGHT' : 'LEFT';
        } else {
            dir = dy > 0 ? 'DOWN' : 'UP';
        }

        emitDirection(dir);
    }

    function emitDirection(dir) {
        if (socket) {
            socket.emit('direction', dir);
        } else if (soloEngine && playerId) {
            // Direct call for solo if no socket wrapper
            soloEngine.setDirection(playerId, dir);
        }

        if (window.GameControls) {
            GameControls.setDirection(dir);
        }
    }

    function emitDash() {
        if (window.activateDash) window.activateDash();
    }

    function emitTrap() {
        if (window.placeTrap) window.placeTrap();
    }

    // ═══════ CREATE MOBILE UI ═══════
    function createMobileUI() {
        // Remove old if exists
        const oldControls = document.getElementById('mobile-controls-area');
        if (oldControls) oldControls.remove();
        const oldAbilities = document.getElementById('touch-abilities');
        if (oldAbilities) oldAbilities.remove();

        // Create controls area
        controlsContainer = document.createElement('div');
        controlsContainer.className = 'mobile-controls-area';
        controlsContainer.id = 'mobile-controls-area';

        // Create controller based on type
        if (controlType === 'joystick') {
            createJoystick();
        } else {
            createDpad();
        }

        // Abilities (Dash + Trap)
        abilitiesContainer = document.createElement('div');
        abilitiesContainer.className = 'touch-abilities';
        abilitiesContainer.id = 'touch-abilities';

        dashBtnEl = createAbilityButton('⚡', 'Dash', 'touch-dash', emitDash);
        trapBtnEl = createAbilityButton('💣', 'Trap', 'touch-trap', emitTrap);

        abilitiesContainer.appendChild(dashBtnEl);
        abilitiesContainer.appendChild(trapBtnEl);

        controlsContainer.appendChild(abilitiesContainer);
        document.body.appendChild(controlsContainer);
    }

    function createAbilityButton(icon, label, className, handler) {
        const btn = document.createElement('button');
        btn.className = 'touch-ability-btn ' + className;
        btn.id = className;
        btn.innerHTML = `<span class="ability-emoji">${icon}</span><span>${label}</span>`;

        // Cooldown overlay
        const cooldownOverlay = document.createElement('div');
        cooldownOverlay.className = 'touch-cooldown-overlay';
        btn.appendChild(cooldownOverlay);

        btn.addEventListener('touchstart', function (e) {
            console.log('[TouchControls] Touchstart on', label);
            e.preventDefault();
            e.stopPropagation();
            handler();
            this.classList.add('pressed');
        }, { passive: false });

        btn.addEventListener('touchend', function (e) {
            e.preventDefault();
            e.stopPropagation();
            this.classList.remove('pressed');
        }, { passive: false });

        // Fallback click for desktop testing in mobile emulator
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            handler();
        });

        return btn;
    }

    // ═══════ D-PAD ═══════
    function createDpad() {
        const dpad = document.createElement('div');
        dpad.className = 'dpad-container';
        dpad.id = 'dpad-container';

        const directions = [
            { dir: 'UP', label: '▲', cls: 'dpad-up' },
            { dir: 'LEFT', label: '◀', cls: 'dpad-left' },
            { dir: 'RIGHT', label: '▶', cls: 'dpad-right' },
            { dir: 'DOWN', label: '▼', cls: 'dpad-down' },
        ];

        // Center circle
        const center = document.createElement('div');
        center.className = 'dpad-center';
        dpad.appendChild(center);

        directions.forEach(({ dir, label, cls }) => {
            const btn = document.createElement('button');
            btn.className = 'dpad-btn ' + cls;
            btn.textContent = label;
            btn.setAttribute('data-dir', dir);

            btn.addEventListener('touchstart', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (enabled) {
                    emitDirection(dir);
                    this.classList.add('active');
                }
            }, { passive: false });

            btn.addEventListener('touchend', function (e) {
                e.preventDefault();
                e.stopPropagation();
                this.classList.remove('active');
            }, { passive: false });

            // Fallback for desktop mobile emulator
            btn.addEventListener('mousedown', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (enabled) {
                    emitDirection(dir);
                    this.classList.add('active');
                }
            });

            btn.addEventListener('mouseup', function (e) {
                e.preventDefault();
                this.classList.remove('active');
            });

            btn.addEventListener('mouseleave', function () {
                this.classList.remove('active');
            });

            dpad.appendChild(btn);
        });

        controlsContainer.appendChild(dpad);
    }

    // ═══════ JOYSTICK ═══════
    function createJoystick() {
        const joystick = document.createElement('div');
        joystick.className = 'joystick-container';
        joystick.id = 'joystick-container';

        joystickBase = document.createElement('div');
        joystickBase.className = 'joystick-base';

        joystickKnob = document.createElement('div');
        joystickKnob.className = 'joystick-knob';

        joystickBase.appendChild(joystickKnob);
        joystick.appendChild(joystickBase);

        const DEADZONE = 15;
        const MAX_DIST = 40;
        let baseCenterX = 0, baseCenterY = 0;
        let lastJoystickDir = null;

        joystickBase.addEventListener('touchstart', function (e) {
            e.preventDefault();
            e.stopPropagation();
            joystickActive = true;
            const rect = joystickBase.getBoundingClientRect();
            baseCenterX = rect.left + rect.width / 2;
            baseCenterY = rect.top + rect.height / 2;
            joystickKnob.classList.add('active');
        }, { passive: false });

        joystickBase.addEventListener('touchmove', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (!joystickActive) return;
            const touch = e.touches[0];
            let dx = touch.clientX - baseCenterX;
            let dy = touch.clientY - baseCenterY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > MAX_DIST) {
                dx = (dx / dist) * MAX_DIST;
                dy = (dy / dist) * MAX_DIST;
            }

            joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;

            if (dist > DEADZONE && enabled) {
                let dir;
                if (Math.abs(dx) > Math.abs(dy)) {
                    dir = dx > 0 ? 'RIGHT' : 'LEFT';
                } else {
                    dir = dy > 0 ? 'DOWN' : 'UP';
                }
                if (dir !== lastJoystickDir) {
                    lastJoystickDir = dir;
                    emitDirection(dir);
                }
            }
        }, { passive: false });

        const resetJoystick = function (e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            joystickActive = false;
            lastJoystickDir = null;
            joystickKnob.style.transform = 'translate(0, 0)';
            joystickKnob.classList.remove('active');
        };

        joystickBase.addEventListener('touchend', resetJoystick, { passive: false });
        joystickBase.addEventListener('touchcancel', resetJoystick, { passive: false });

        controlsContainer.appendChild(joystick);
    }

    // ═══════ COOLDOWN SYNC ═══════
    function updateCooldowns(dashCD, dashMax, trapCD, trapMax) {
        if (!dashBtnEl || !trapBtnEl) return;

        const dashOverlay = dashBtnEl.querySelector('.touch-cooldown-overlay');
        const trapOverlay = trapBtnEl.querySelector('.touch-cooldown-overlay');

        if (dashCD > 0) {
            const pct = (dashCD / dashMax) * 100;
            dashBtnEl.classList.add('on-cooldown');
            if (dashOverlay) dashOverlay.style.height = pct + '%';
        } else {
            dashBtnEl.classList.remove('on-cooldown');
            if (dashOverlay) dashOverlay.style.height = '0%';
        }

        if (trapCD > 0) {
            const pct = (trapCD / trapMax) * 100;
            trapBtnEl.classList.add('on-cooldown');
            if (trapOverlay) trapOverlay.style.height = pct + '%';
        } else {
            trapBtnEl.classList.remove('on-cooldown');
            if (trapOverlay) trapOverlay.style.height = '0%';
        }
    }

    // ═══════ CONTROL TYPE SWITCH ═══════
    function setControlType(type) {
        controlType = type;
        localStorage.setItem('ouroboros_control_type', type);
        if (controlsContainer) {
            // Remove old controller
            const oldDpad = document.getElementById('dpad-container');
            const oldJoystick = document.getElementById('joystick-container');
            if (oldDpad) oldDpad.remove();
            if (oldJoystick) oldJoystick.remove();

            // Create new one and insert before abilities
            if (type === 'joystick') {
                createJoystick();
            } else {
                createDpad();
            }
            // Re-insert so controller is before abilities
            if (abilitiesContainer && controlsContainer.contains(abilitiesContainer)) {
                controlsContainer.insertBefore(
                    document.getElementById(type === 'joystick' ? 'joystick-container' : 'dpad-container'),
                    abilitiesContainer
                );
            }
        }
    }

    function getControlType() {
        return controlType;
    }

    function disable() { enabled = false; }
    function enable() { enabled = true; }

    function updateRefs(opts) {
        if (opts.socket) socket = opts.socket;
        if (opts.soloEngine) soloEngine = opts.soloEngine;
        if (opts.playerId) playerId = opts.playerId;
    }

    return { init, disable, enable, updateRefs, updateCooldowns, setControlType, getControlType, isTouchDevice };
})();
