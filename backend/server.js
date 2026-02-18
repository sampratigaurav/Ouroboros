// server.js - Express + Socket.IO server for Project Ouroboros

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const roomManager = require('./roomManager');
const GameEngine = require('./gameEngine');
const leaderboard = require('./leaderboard');

const cors = require('cors');

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
    'https://ouroboros-rd4irpnik-samprati-gauravs-projects.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST'],
    credentials: true
}));

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

const PORT = process.env.PORT || 3000;

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use(express.json());

// API: Leaderboard
app.get('/api/leaderboard', (req, res) => {
    res.json(leaderboard.getTopPlayers(20));
});

// API: Solo Leaderboard
app.get('/api/leaderboard/solo', (req, res) => {
    res.json(leaderboard.getTopSoloScores(20));
});

app.post('/api/solo-score', (req, res) => {
    const { name, score, survivalTime, mode } = req.body || {};
    if (!name || typeof score !== 'number') {
        return res.status(400).json({ error: 'Invalid data' });
    }
    leaderboard.recordSoloScore(name, score, survivalTime, mode);
    res.json({ ok: true });
});

// ═══════ PLAYER TOKEN SYSTEM ═══════
// Maps playerToken -> { socketId, roomCode, playerName }
// Allows reconnection across page navigations
const tokenMap = new Map();

function sanitizeName(name) {
    if (typeof name !== 'string') return 'Player';
    return name.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().substring(0, 16) || 'Player';
}

function isValidDirection(dir) {
    return ['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(dir);
}

// ═══════ SOCKET.IO ═══════
io.on('connection', (socket) => {
    console.log(`[+] Connected: ${socket.id}`);

    let currentRoom = null;
    let playerName = 'Player';
    let playerToken = null;

    // SET NAME
    socket.on('setName', (name) => {
        playerName = sanitizeName(name);
    });

    // RECONNECT with token - allows rejoining after page navigation
    socket.on('reconnect_with_token', (data, callback) => {
        const token = data?.token;
        if (!token || !tokenMap.has(token)) {
            return callback?.({ error: 'Invalid token' });
        }

        const tokenData = tokenMap.get(token);
        const room = roomManager.getRoom(tokenData.roomCode);
        if (!room) {
            tokenMap.delete(token);
            return callback?.({ error: 'Room no longer exists' });
        }

        // Update the player's socket ID in the room
        const oldId = tokenData.socketId;
        const player = room.players.get(oldId);
        if (player) {
            room.players.delete(oldId);
            player.id = socket.id;
            room.players.set(socket.id, player);

            // Update host if needed
            if (room.hostId === oldId) {
                room.hostId = socket.id;
            }

            // Update game engine snake if game is running
            if (room.gameInstance) {
                const snake = room.gameInstance.snakes.get(oldId);
                if (snake) {
                    room.gameInstance.snakes.delete(oldId);
                    snake.id = socket.id;
                    room.gameInstance.snakes.set(socket.id, snake);
                }
            }
        }

        // Update token mapping
        tokenData.socketId = socket.id;
        playerToken = token;
        playerName = tokenData.playerName;
        currentRoom = tokenData.roomCode;
        socket.join(currentRoom);

        // Send current state
        if (room.gameInstance && room.state === 'playing') {
            callback?.({ code: currentRoom, inGame: true });
            socket.emit('gameStart', room.gameInstance.getState());
        } else {
            callback?.({ code: currentRoom, inGame: false });
            io.to(currentRoom).emit('lobbyUpdate', {
                players: roomManager.getSerializablePlayers(currentRoom),
                hostId: room.hostId,
                code: currentRoom
            });
        }
    });

    // CREATE ROOM
    socket.on('createRoom', (data, callback) => {
        if (currentRoom) {
            return callback?.({ error: 'Already in a room' });
        }
        const name = sanitizeName(data?.name || playerName);
        playerName = name;
        const room = roomManager.createRoom(socket.id, name);
        currentRoom = room.code;
        socket.join(room.code);

        // Generate player token
        playerToken = uuidv4();
        tokenMap.set(playerToken, {
            socketId: socket.id,
            roomCode: room.code,
            playerName: name
        });

        callback?.({ code: room.code, token: playerToken });
        io.to(room.code).emit('lobbyUpdate', {
            players: roomManager.getSerializablePlayers(room.code),
            hostId: room.hostId,
            code: room.code
        });
    });

    // JOIN ROOM
    socket.on('joinRoom', (data, callback) => {
        if (currentRoom) {
            return callback?.({ error: 'Already in a room' });
        }
        const code = (data?.code || '').toUpperCase().trim();
        if (!code || code.length !== 6) {
            return callback?.({ error: 'Invalid room code' });
        }

        const name = sanitizeName(data?.name || playerName);
        playerName = name;
        const result = roomManager.joinRoom(code, socket.id, name);

        if (result.error) {
            return callback?.({ error: result.error });
        }

        currentRoom = code;
        socket.join(code);

        // Generate player token
        playerToken = uuidv4();
        tokenMap.set(playerToken, {
            socketId: socket.id,
            roomCode: code,
            playerName: name
        });

        callback?.({ code, token: playerToken });
        io.to(code).emit('lobbyUpdate', {
            players: roomManager.getSerializablePlayers(code),
            hostId: result.room.hostId,
            code
        });
    });

    // TOGGLE READY
    socket.on('toggleReady', () => {
        if (!currentRoom) return;
        const room = roomManager.toggleReady(currentRoom, socket.id);
        if (!room) return;
        io.to(currentRoom).emit('lobbyUpdate', {
            players: roomManager.getSerializablePlayers(currentRoom),
            hostId: room.hostId,
            code: currentRoom
        });
    });

    // START GAME
    socket.on('startGame', () => {
        if (!currentRoom) return;
        const room = roomManager.getRoom(currentRoom);
        if (!room) return;
        if (room.hostId !== socket.id) return;
        if (!roomManager.canStartGame(currentRoom)) return;

        room.state = 'playing';

        const engine = new GameEngine(room.players);
        room.gameInstance = engine;

        const roomCode = currentRoom;

        engine.onStateUpdate = (state) => {
            io.to(roomCode).emit('gameState', state);
        };

        engine.onGameEnd = (winner, scoreboard) => {
            room.state = 'finished';

            for (const entry of scoreboard) {
                if (winner && entry.id === winner.id) {
                    leaderboard.recordWin(entry.name, entry.score);
                } else {
                    leaderboard.recordGame(entry.name, entry.score);
                }
            }

            io.to(roomCode).emit('gameOver', {
                winner: winner ? { id: winner.id, name: winner.name, score: winner.score, color: winner.color } : null,
                scoreboard
            });
        };

        // Emit gameStart to all — clients will navigate to game page and reconnect
        io.to(roomCode).emit('gameStart', engine.getState());

        // Delay starting the engine to allow page transitions
        setTimeout(() => {
            engine.start();
        }, 3500); // 3.5s delay for page transition + countdown
    });

    // GAME INPUT: Direction
    socket.on('direction', (dir) => {
        if (!currentRoom) return;
        if (!isValidDirection(dir)) return;
        const room = roomManager.getRoom(currentRoom);
        if (!room || !room.gameInstance) return;
        room.gameInstance.setDirection(socket.id, dir);
    });

    // GAME INPUT: Dash
    socket.on('dash', () => {
        if (!currentRoom) return;
        const room = roomManager.getRoom(currentRoom);
        if (!room || !room.gameInstance) return;
        room.gameInstance.activateDash(socket.id);
    });

    // GAME INPUT: Trap
    socket.on('trap', () => {
        if (!currentRoom) return;
        const room = roomManager.getRoom(currentRoom);
        if (!room || !room.gameInstance) return;
        room.gameInstance.placeTrap(socket.id);
    });

    // LEAVE ROOM
    socket.on('leaveRoom', () => {
        handleLeave();
    });

    // PLAY AGAIN
    socket.on('playAgain', () => {
        if (!currentRoom) return;
        const room = roomManager.getRoom(currentRoom);
        if (!room) return;

        if (room.gameInstance) {
            room.gameInstance.stop();
            room.gameInstance = null;
        }
        room.state = 'waiting';

        for (const [, player] of room.players) {
            player.ready = false;
        }

        io.to(currentRoom).emit('returnToLobby', {
            players: roomManager.getSerializablePlayers(currentRoom),
            hostId: room.hostId,
            code: currentRoom
        });
    });

    // HANDLE LEAVE (explicit leave—cleanup token)
    function handleLeave() {
        if (currentRoom) {
            const room = roomManager.getRoom(currentRoom);
            if (room && room.gameInstance) {
                const snake = room.gameInstance.snakes.get(socket.id);
                if (snake) snake.alive = false;
            }

            const result = roomManager.leaveRoom(currentRoom, socket.id);
            socket.leave(currentRoom);

            if (result && !result.deleted) {
                io.to(currentRoom).emit('lobbyUpdate', {
                    players: roomManager.getSerializablePlayers(currentRoom),
                    hostId: result.room.hostId,
                    code: currentRoom
                });
            }

            // Cleanup token
            if (playerToken) {
                tokenMap.delete(playerToken);
                playerToken = null;
            }
            currentRoom = null;
        }
    }

    // HANDLE DISCONNECT (socket lost—keep token for reconnection)
    socket.on('disconnect', () => {
        console.log(`[-] Disconnected: ${socket.id}`);
        if (currentRoom) {
            // Don't remove from room immediately — give them time to reconnect (page nav)
            const token = playerToken;
            const roomCode = currentRoom;

            // Set a timeout: if they don't reconnect within 10 seconds, remove them
            setTimeout(() => {
                if (token && tokenMap.has(token)) {
                    const td = tokenMap.get(token);
                    // Check if they reconnected (socketId would have changed)
                    if (td.socketId === socket.id) {
                        // They didn't reconnect — remove them
                        const room = roomManager.getRoom(roomCode);
                        if (room) {
                            if (room.gameInstance) {
                                const snake = room.gameInstance.snakes.get(socket.id);
                                if (snake) snake.alive = false;
                            }
                            const result = roomManager.leaveRoom(roomCode, socket.id);
                            if (result && !result.deleted) {
                                io.to(roomCode).emit('lobbyUpdate', {
                                    players: roomManager.getSerializablePlayers(roomCode),
                                    hostId: result.room.hostId,
                                    code: roomCode
                                });
                            }
                        }
                        tokenMap.delete(token);
                    }
                }
            }, 10000);

            currentRoom = null;
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  🐍 Project Ouroboros server running on http://0.0.0.0:${PORT}\n`);
});
