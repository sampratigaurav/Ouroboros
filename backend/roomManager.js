// roomManager.js - Room creation, join/leave, player tracking

const { v4: uuidv4 } = require('uuid');

const MAX_PLAYERS = 5;

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

class RoomManager {
    constructor() {
        this.rooms = new Map();
    }

    createRoom(hostId, hostName) {
        let code = generateRoomCode();
        while (this.rooms.has(code)) {
            code = generateRoomCode();
        }

        const room = {
            code,
            hostId,
            players: new Map(),
            state: 'waiting', // waiting | playing | finished
            gameInstance: null,
            createdAt: Date.now()
        };

        room.players.set(hostId, {
            id: hostId,
            name: hostName,
            ready: false,
            color: null
        });

        this.rooms.set(code, room);
        return room;
    }

    joinRoom(code, playerId, playerName) {
        const room = this.rooms.get(code);
        if (!room) return { error: 'Room not found' };
        if (room.state !== 'waiting') return { error: 'Game already in progress' };
        if (room.players.size >= MAX_PLAYERS) return { error: 'Room is full' };
        if (room.players.has(playerId)) return { error: 'Already in room' };

        room.players.set(playerId, {
            id: playerId,
            name: playerName,
            ready: false,
            color: null
        });

        return { room };
    }

    leaveRoom(code, playerId) {
        const room = this.rooms.get(code);
        if (!room) return null;

        room.players.delete(playerId);

        // If no players left, delete room
        if (room.players.size === 0) {
            this.rooms.delete(code);
            return { deleted: true };
        }

        // If host left, assign new host
        if (room.hostId === playerId) {
            const newHost = room.players.keys().next().value;
            room.hostId = newHost;
        }

        return { room, deleted: false };
    }

    toggleReady(code, playerId) {
        const room = this.rooms.get(code);
        if (!room) return null;
        const player = room.players.get(playerId);
        if (!player) return null;
        player.ready = !player.ready;
        return room;
    }

    getRoom(code) {
        return this.rooms.get(code) || null;
    }

    getRoomByPlayerId(playerId) {
        for (const [code, room] of this.rooms) {
            if (room.players.has(playerId)) return room;
        }
        return null;
    }

    deleteRoom(code) {
        this.rooms.delete(code);
    }

    canStartGame(code) {
        const room = this.rooms.get(code);
        if (!room) return false;
        if (room.players.size < 2) return false;
        // All non-host players must be ready
        for (const [id, player] of room.players) {
            if (id !== room.hostId && !player.ready) return false;
        }
        return true;
    }

    getSerializablePlayers(code) {
        const room = this.rooms.get(code);
        if (!room) return [];
        return Array.from(room.players.values()).map(p => ({
            id: p.id,
            name: p.name,
            ready: p.ready,
            isHost: p.id === room.hostId
        }));
    }
}

module.exports = new RoomManager();
