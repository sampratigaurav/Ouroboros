// lobby.js - Socket.IO lobby client for room management + solo mode selection

(function () {
    'use strict';

    const socket = io();

    // DOM elements
    const menuView = document.getElementById('menu-view');
    const soloView = document.getElementById('solo-view');
    const joinView = document.getElementById('join-view');
    const waitingView = document.getElementById('waiting-view');
    const playerNameInput = document.getElementById('player-name');
    const roomCodeInput = document.getElementById('room-code-input');
    const roomCodeDisplay = document.getElementById('room-code-display');
    const playerList = document.getElementById('player-list');
    const btnSolo = document.getElementById('btn-solo');
    const btnCreate = document.getElementById('btn-create');
    const btnJoinView = document.getElementById('btn-join-view');
    const btnJoinBack = document.getElementById('btn-join-back');
    const btnJoinConfirm = document.getElementById('btn-join-confirm');
    const btnLeave = document.getElementById('btn-leave');
    const btnReady = document.getElementById('btn-ready');
    const btnStart = document.getElementById('btn-start');
    const menuError = document.getElementById('menu-error');
    const joinError = document.getElementById('join-error');

    // Solo mode elements
    const cardClassic = document.getElementById('card-classic');
    const cardArena = document.getElementById('card-arena');
    const arenaOptions = document.getElementById('arena-options');
    const difficultyPicker = document.getElementById('difficulty-picker');
    const botPicker = document.getElementById('bot-picker');
    const btnSoloBack = document.getElementById('btn-solo-back');
    const btnSoloStart = document.getElementById('btn-solo-start');

    let currentRoomCode = null;
    let isHost = false;
    let isReady = false;

    // Solo selections
    let soloMode = 'classic';
    let soloDifficulty = 'medium';
    let soloBots = 3;

    // Control type toggle
    const controlToggle = document.getElementById('control-type-toggle');
    const pillDpad = document.getElementById('pill-dpad');
    const pillJoystick = document.getElementById('pill-joystick');
    let controlType = localStorage.getItem('ouroboros_control_type') || 'dpad';

    // Set initial state
    if (controlType === 'joystick') {
        pillDpad.classList.remove('active');
        pillJoystick.classList.add('active');
    }

    if (pillDpad) {
        pillDpad.addEventListener('click', () => {
            controlType = 'dpad';
            localStorage.setItem('ouroboros_control_type', 'dpad');
            pillDpad.classList.add('active');
            pillJoystick.classList.remove('active');
        });
    }
    if (pillJoystick) {
        pillJoystick.addEventListener('click', () => {
            controlType = 'joystick';
            localStorage.setItem('ouroboros_control_type', 'joystick');
            pillJoystick.classList.add('active');
            pillDpad.classList.remove('active');
        });
    }

    // ═══════ VIEW MANAGEMENT ═══════
    function showView(view) {
        [menuView, soloView, joinView, waitingView].forEach(v => v.classList.remove('active'));
        view.classList.add('active');
    }

    function getPlayerName() {
        const name = playerNameInput.value.trim();
        return name || 'Player';
    }

    // Restore name from sessionStorage
    const savedName = sessionStorage.getItem('ouroboros_name');
    if (savedName) playerNameInput.value = savedName;

    playerNameInput.addEventListener('input', () => {
        sessionStorage.setItem('ouroboros_name', playerNameInput.value);
    });

    // ═══════ TOKEN RECONNECTION ═══════
    socket.on('connect', () => {
        const existingToken = sessionStorage.getItem('ouroboros_token');
        if (existingToken) {
            socket.emit('reconnect_with_token', { token: existingToken }, (res) => {
                if (res && !res.error && res.code) {
                    currentRoomCode = res.code;
                    roomCodeDisplay.textContent = res.code;
                    showView(waitingView);
                } else {
                    sessionStorage.removeItem('ouroboros_token');
                    sessionStorage.removeItem('ouroboros_room');
                }
            });
        }
    });

    // ═══════ PLAY SOLO ═══════
    btnSolo.addEventListener('click', () => {
        sessionStorage.setItem('ouroboros_name', getPlayerName());
        showView(soloView);
    });

    // Mode card selection
    cardClassic.addEventListener('click', () => {
        soloMode = 'classic';
        cardClassic.classList.add('selected');
        cardArena.classList.remove('selected');
        arenaOptions.classList.remove('visible');
    });

    cardArena.addEventListener('click', () => {
        soloMode = 'arena';
        cardArena.classList.add('selected');
        cardClassic.classList.remove('selected');
        arenaOptions.classList.add('visible');
    });

    // Difficulty picker
    difficultyPicker.addEventListener('click', (e) => {
        const btn = e.target.closest('.diff-btn');
        if (!btn) return;
        soloDifficulty = btn.dataset.diff;
        difficultyPicker.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
    });

    // Bot picker
    botPicker.addEventListener('click', (e) => {
        const btn = e.target.closest('.bot-btn');
        if (!btn) return;
        soloBots = parseInt(btn.dataset.bots);
        botPicker.querySelectorAll('.bot-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
    });

    btnSoloBack.addEventListener('click', () => {
        showView(menuView);
    });

    btnSoloStart.addEventListener('click', startSoloGame);
    btnSoloStart.addEventListener('touchstart', function (e) { e.preventDefault(); startSoloGame(); }, { passive: false });

    function startSoloGame() {
        const name = getPlayerName();
        sessionStorage.setItem('ouroboros_name', name);
        if (soloMode === 'classic') {
            window.location.href = `game.html?mode=classic`;
        } else {
            window.location.href = `game.html?mode=arena&difficulty=${soloDifficulty}&bots=${soloBots}`;
        }
    }

    // ═══════ CREATE ROOM ═══════
    btnCreate.addEventListener('click', () => {
        const name = getPlayerName();
        menuError.textContent = '';
        socket.emit('setName', name);
        socket.emit('createRoom', { name }, (res) => {
            if (res.error) {
                menuError.textContent = res.error;
                return;
            }
            currentRoomCode = res.code;
            isHost = true;
            roomCodeDisplay.textContent = res.code;

            sessionStorage.setItem('ouroboros_token', res.token);
            sessionStorage.setItem('ouroboros_room', res.code);
            sessionStorage.setItem('ouroboros_name', name);

            showView(waitingView);
            updateStartButton();
        });
    });

    // ═══════ JOIN ROOM ═══════
    btnJoinView.addEventListener('click', () => {
        showView(joinView);
        roomCodeInput.value = '';
        joinError.textContent = '';
        roomCodeInput.focus();
    });

    btnJoinBack.addEventListener('click', () => {
        showView(menuView);
    });

    btnJoinConfirm.addEventListener('click', () => {
        const code = roomCodeInput.value.trim().toUpperCase();
        if (code.length !== 6) {
            joinError.textContent = 'Please enter a 6-character room code';
            return;
        }
        joinError.textContent = '';
        const name = getPlayerName();
        socket.emit('setName', name);
        socket.emit('joinRoom', { code, name }, (res) => {
            if (res.error) {
                joinError.textContent = res.error;
                return;
            }
            currentRoomCode = res.code;
            isHost = false;
            roomCodeDisplay.textContent = res.code;

            sessionStorage.setItem('ouroboros_token', res.token);
            sessionStorage.setItem('ouroboros_room', res.code);
            sessionStorage.setItem('ouroboros_name', name);

            showView(waitingView);
        });
    });

    roomCodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') btnJoinConfirm.click();
    });

    // ═══════ READY / START ═══════
    btnReady.addEventListener('click', () => {
        socket.emit('toggleReady');
    });

    btnStart.addEventListener('click', () => {
        if (!isHost) return;
        socket.emit('startGame');
    });

    btnLeave.addEventListener('click', () => {
        socket.emit('leaveRoom');
        currentRoomCode = null;
        isHost = false;
        isReady = false;
        sessionStorage.removeItem('ouroboros_token');
        sessionStorage.removeItem('ouroboros_room');
        showView(menuView);
    });

    function updateStartButton() {
        btnStart.style.display = isHost ? 'inline-flex' : 'none';
    }

    // ═══════ SOCKET EVENTS ═══════
    socket.on('lobbyUpdate', (data) => {
        renderPlayerList(data.players, data.hostId);
        isHost = (socket.id === data.hostId);
        updateStartButton();

        if (isHost) {
            const allReady = data.players.filter(p => !p.isHost).every(p => p.ready);
            const enoughPlayers = data.players.length >= 2;
            btnStart.disabled = !(allReady && enoughPlayers);
        }

        const me = data.players.find(p => p.id === socket.id);
        if (me) {
            isReady = me.ready;
            btnReady.textContent = isReady ? '✓ Ready' : 'Ready';
            btnReady.classList.toggle('is-ready', isReady);
        }
    });

    socket.on('gameStart', () => {
        window.location.href = 'game.html';
    });

    socket.on('returnToLobby', (data) => {
        renderPlayerList(data.players, data.hostId);
        isHost = (socket.id === data.hostId);
        isReady = false;
        updateStartButton();
        showView(waitingView);
    });

    socket.on('disconnect', () => {
        menuError.textContent = 'Disconnected from server. Reconnecting...';
    });

    socket.on('reconnect', () => {
        menuError.textContent = '';
    });

    // ═══════ RENDER PLAYER LIST ═══════
    function renderPlayerList(players, hostId) {
        playerList.innerHTML = '';
        players.forEach(p => {
            const li = document.createElement('li');
            li.className = 'player-list-item' + (p.isHost ? ' host' : '');

            const infoDiv = document.createElement('div');
            infoDiv.className = 'player-info';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'player-name';
            nameSpan.textContent = p.name + (p.id === socket.id ? ' (you)' : '');
            infoDiv.appendChild(nameSpan);

            const statusSpan = document.createElement('span');
            statusSpan.className = 'player-status';
            if (p.isHost) {
                statusSpan.innerHTML = '<span class="player-badge badge-host">Host</span>';
            } else if (p.ready) {
                statusSpan.innerHTML = '<span class="player-badge badge-ready">Ready</span>';
            } else {
                statusSpan.innerHTML = '<span class="player-badge badge-waiting">Waiting</span>';
            }

            li.appendChild(infoDiv);
            li.appendChild(statusSpan);
            playerList.appendChild(li);
        });
    }
})();
