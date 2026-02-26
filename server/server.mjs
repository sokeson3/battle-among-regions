// ─────────────────────────────────────────────────────────────
// server.mjs — Online Multiplayer Server for Battle Among Regions
// Uses Express for static file serving + WebSocket (ws) for game comms
// ─────────────────────────────────────────────────────────────

import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import { WebSocketServer } from 'ws';
import { readFileSync } from 'fs';

// Import game engine
import { GameController } from '../src/engine/GameController.js';
import * as NorthernEffects from '../src/effects/NorthernEffects.js';
import * as EasternEffects from '../src/effects/EasternEffects.js';
import * as WesternEffects from '../src/effects/WesternEffects.js';
import * as SouthernEffects from '../src/effects/SouthernEffects.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// ─── Configuration ───────────────────────────────────────────
const PORT = process.env.PORT || 4000;

// ─── Room Manager ────────────────────────────────────────────

class RoomManager {
    constructor() {
        this.rooms = new Map(); // roomCode -> Room
    }

    generateCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1 for clarity
        let code;
        do {
            code = '';
            for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
        } while (this.rooms.has(code));
        return code;
    }

    createRoom(ws, playerName, region) {
        const code = this.generateCode();
        const room = {
            code,
            players: [{ ws, name: playerName, region, id: 0 }],
            controller: null,
            phase: 'LOBBY', // LOBBY, LANDMARK, MULLIGAN, PLAYING
            landmarkSelections: {},
            mulliganDone: {},
        };
        this.rooms.set(code, room);
        return room;
    }

    joinRoom(code, ws, playerName, region) {
        const room = this.rooms.get(code);
        if (!room) return { error: 'Room not found.' };
        if (room.players.length >= 2) return { error: 'Room is full.' };
        if (room.phase !== 'LOBBY') return { error: 'Game already in progress.' };

        room.players.push({ ws, name: playerName, region, id: 1 });
        return { room };
    }

    removePlayer(ws) {
        for (const [code, room] of this.rooms) {
            const idx = room.players.findIndex(p => p.ws === ws);
            if (idx !== -1) {
                room.players.splice(idx, 1);
                // Notify remaining player
                for (const p of room.players) {
                    this.send(p.ws, 'OPPONENT_DISCONNECTED', { message: 'Opponent disconnected.' });
                }
                if (room.players.length === 0) {
                    this.rooms.delete(code);
                }
                return room;
            }
        }
        return null;
    }

    getRoomByWs(ws) {
        for (const room of this.rooms.values()) {
            if (room.players.some(p => p.ws === ws)) return room;
        }
        return null;
    }

    getPlayerInRoom(room, ws) {
        return room.players.find(p => p.ws === ws);
    }

    send(ws, type, data = {}) {
        if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type, ...data }));
        }
    }

    broadcast(room, type, data = {}) {
        for (const p of room.players) {
            this.send(p.ws, type, data);
        }
    }
}

// ─── State Sanitization ──────────────────────────────────────

function sanitizeStateForPlayer(gameState, playerId) {
    const state = gameState.toJSON();

    // Deep clone players to avoid mutating original
    state.players = state.players.map((p, i) => {
        const clone = JSON.parse(JSON.stringify(p));
        if (i !== playerId) {
            // Hide opponent's hand contents — only send count
            clone.hand = clone.hand.map(() => ({ hidden: true }));
            // Hide deck contents
            clone.deckCount = clone.deck.length;
            clone.deck = [];
        } else {
            clone.deckCount = clone.deck.length;
            clone.deck = []; // Don't send deck contents to anyone
        }
        return clone;
    });

    return state;
}

function serializeCard(card) {
    if (!card) return null;
    return {
        instanceId: card.instanceId,
        cardId: card.cardId,
        name: card.name,
        type: card.type,
        region: card.region,
        manaCost: card.manaCost,
        baseATK: card.baseATK,
        baseDEF: card.baseDEF,
        currentATK: card.currentATK,
        currentDEF: card.currentDEF,
        damageTaken: card.damageTaken,
        position: card.position,
        faceUp: card.faceUp,
        description: card.description,
        keywords: card.keywords,
        atkModifiers: card.atkModifiers,
        defModifiers: card.defModifiers,
        silenced: card.silenced,
        summonedThisTurn: card.summonedThisTurn,
        hasAttackedThisTurn: card.hasAttackedThisTurn,
        hasChangedPositionThisTurn: card.hasChangedPositionThisTurn,
        activatedThisRound: card.activatedThisRound,
        activatedThisTurn: card.activatedThisTurn,
        ownerId: card.ownerId,
    };
}

// ─── Game State Broadcasting ─────────────────────────────────

function broadcastGameState(room, roomMgr) {
    const gs = room.controller.gameState;
    for (const p of room.players) {
        const sanitized = sanitizeStateForPlayer(gs, p.id);
        roomMgr.send(p.ws, 'GAME_STATE', { state: sanitized, yourPlayerId: p.id });
    }
}

// ─── Start Game ──────────────────────────────────────────────

async function startGame(room, roomMgr, csvText) {
    const controller = new GameController();
    await controller.loadCards(csvText);
    controller.registerEffects([NorthernEffects, EasternEffects, WesternEffects, SouthernEffects]);

    room.controller = controller;

    // Wire up callbacks for interactive effects
    controller.effectEngine.onTargetRequired = (targets, desc, cb) => {
        // Find which player needs to pick a target (active player)
        const activeId = controller.gameState.activePlayerIndex;
        const activeP = room.players.find(p => p.id === activeId);
        if (!activeP) { cb(targets[0]); return; }

        // Store callback for when client responds
        room.pendingTargetCb = cb;
        room.pendingTargetPlayerId = activeId;

        const serializedTargets = targets.map(t => ({
            instanceId: t.instanceId,
            cardId: t.cardId,
            name: t.name,
            type: t.type,
        }));
        roomMgr.send(activeP.ws, 'REQUEST_TARGET', { targets: serializedTargets, description: desc });
    };

    controller.effectEngine.onChoiceRequired = (options, desc, cb) => {
        const activeId = controller.gameState.activePlayerIndex;
        const activeP = room.players.find(p => p.id === activeId);
        if (!activeP) { cb(options[0]); return; }

        room.pendingChoiceCb = cb;
        room.pendingChoicePlayerId = activeId;
        roomMgr.send(activeP.ws, 'REQUEST_CHOICE', { options, description: desc });
    };

    controller.onOpponentResponse = (player, cb) => {
        const p = room.players.find(rp => rp.id === player.id);
        if (!p) { cb({ activate: false }); return; }

        const faceDownCards = player.getFaceDownCards().filter(c => c.type === 'Spell' || c.type === 'Trap');
        if (faceDownCards.length === 0) { cb({ activate: false }); return; }

        room.pendingResponseCb = cb;
        room.pendingResponsePlayerId = player.id;

        const serialized = faceDownCards.map(c => serializeCard(c));
        roomMgr.send(p.ws, 'REQUEST_RESPONSE', { faceDownCards: serialized });
    };

    controller.onUIUpdate = () => {
        broadcastGameState(room, roomMgr);
    };

    // Set up the game
    const playerConfigs = room.players.map(p => ({
        name: p.name,
        region: p.region,
    }));

    await controller.setupGame(playerConfigs, {
        gameMode: 'duel',
        startingLP: 3000,
    });

    // Now move to landmark phase
    room.phase = 'LANDMARK';
    room.landmarkSelections = {};

    // Send each player their landmark options
    for (const p of room.players) {
        const player = controller.gameState.getPlayerById(p.id);
        const seenCardIds = new Set();
        const landmarks = player.deck.filter(c => {
            if (c.type !== 'Landmark') return false;
            if (seenCardIds.has(c.cardId)) return false;
            seenCardIds.add(c.cardId);
            return true;
        });

        if (landmarks.length === 0) {
            room.landmarkSelections[p.id] = { skip: true };
            roomMgr.send(p.ws, 'GAME_PHASE', { phase: 'LANDMARK', landmarks: [] });
        } else {
            const serialized = landmarks.map(c => serializeCard(c));
            roomMgr.send(p.ws, 'REQUEST_LANDMARK', { landmarks: serialized });
        }
    }

    checkLandmarksComplete(room, roomMgr);
}

function checkLandmarksComplete(room, roomMgr) {
    if (Object.keys(room.landmarkSelections).length < 2) return;

    const gs = room.controller.gameState;

    // Apply landmark selections
    for (const p of room.players) {
        const selection = room.landmarkSelections[p.id];
        if (selection && !selection.skip && selection.cardInstanceId) {
            const player = gs.getPlayerById(p.id);
            const deckIdx = player.deck.findIndex(c => c.instanceId === selection.cardInstanceId);
            if (deckIdx !== -1) {
                const removed = player.deck.splice(deckIdx, 1)[0];
                removed.faceUp = true;
                if (player.landmarkZone) {
                    player.graveyard.push(player.landmarkZone);
                }
                player.landmarkZone = removed;
                gs.log('LANDMARK', `${player.name} places ${removed.name} in their Landmark Zone.`);
            }
        }
    }

    // Move to mulligan phase
    room.phase = 'MULLIGAN';
    room.mulliganDone = {};

    for (const p of room.players) {
        const player = gs.getPlayerById(p.id);
        const hand = player.hand.map(c => serializeCard(c));
        roomMgr.send(p.ws, 'REQUEST_MULLIGAN', { hand });
    }
}

async function checkMulliganComplete(room, roomMgr) {
    if (Object.keys(room.mulliganDone).length < 2) return;

    room.phase = 'PLAYING';

    // Check mulligan complete and start first turn
    await room.controller.turnManager.checkMulliganComplete();

    broadcastGameState(room, roomMgr);

    // Tell both players whose turn it is
    const gs = room.controller.gameState;
    roomMgr.broadcast(room, 'GAME_PHASE', {
        phase: 'PLAYING',
        activePlayerId: gs.activePlayerIndex,
    });
}

// ─── Action Handler ──────────────────────────────────────────

async function handleAction(room, ws, msg, roomMgr) {
    const player = roomMgr.getPlayerInRoom(room, ws);
    if (!player) return;

    const controller = room.controller;
    const gs = controller.gameState;
    const playerId = player.id;

    // Handle non-turn-specific messages first
    switch (msg.type) {
        case 'SELECT_LANDMARK': {
            if (room.phase !== 'LANDMARK') return;
            if (msg.cardInstanceId) {
                room.landmarkSelections[playerId] = { cardInstanceId: msg.cardInstanceId };
            } else {
                room.landmarkSelections[playerId] = { skip: true };
            }
            roomMgr.send(ws, 'GAME_PHASE', { phase: 'WAITING', message: 'Waiting for opponent...' });
            checkLandmarksComplete(room, roomMgr);
            return;
        }

        case 'MULLIGAN': {
            if (room.phase !== 'MULLIGAN') return;
            const cardInstanceIds = msg.cardInstanceIds || [];
            await controller.mulligan(playerId, cardInstanceIds);
            room.mulliganDone[playerId] = true;
            roomMgr.send(ws, 'GAME_PHASE', { phase: 'WAITING', message: 'Waiting for opponent...' });
            await checkMulliganComplete(room, roomMgr);
            return;
        }

        case 'TARGET_SELECTED': {
            if (room.pendingTargetCb && room.pendingTargetPlayerId === playerId) {
                // Find the actual card instance from the target ID
                const found = gs.findCardOnField(msg.targetId);
                const target = found ? found.card : null;
                const cb = room.pendingTargetCb;
                room.pendingTargetCb = null;
                room.pendingTargetPlayerId = null;
                cb(target);
            }
            return;
        }

        case 'CHOICE_MADE': {
            if (room.pendingChoiceCb && room.pendingChoicePlayerId === playerId) {
                const cb = room.pendingChoiceCb;
                room.pendingChoiceCb = null;
                room.pendingChoicePlayerId = null;
                // The choice options were sent as an array, return the selected one
                cb(msg.choice);
            }
            return;
        }

        case 'OPPONENT_RESPONSE': {
            if (room.pendingResponseCb && room.pendingResponsePlayerId === playerId) {
                const cb = room.pendingResponseCb;
                room.pendingResponseCb = null;
                room.pendingResponsePlayerId = null;
                cb(msg.response || { activate: false });
            }
            return;
        }
    }

    // Turn-specific actions — verify it's this player's turn
    if (room.phase !== 'PLAYING') {
        roomMgr.send(ws, 'ERROR', { message: 'Game is not in playing phase.' });
        return;
    }

    if (gs.activePlayerIndex !== playerId) {
        roomMgr.send(ws, 'ERROR', { message: "It's not your turn." });
        return;
    }

    let result;

    try {
        switch (msg.type) {
            case 'PLAY_UNIT':
                result = await controller.playUnit(playerId, msg.cardInstanceId, msg.position || 'ATK', msg.slotIndex ?? -1);
                break;
            case 'PLAY_SPELL':
                result = await controller.playSpell(playerId, msg.cardInstanceId);
                break;
            case 'SET_SPELL':
                result = await controller.setSpell(playerId, msg.cardInstanceId, msg.slotIndex ?? -1);
                break;
            case 'SET_TRAP':
                result = await controller.setTrap(playerId, msg.cardInstanceId, msg.slotIndex ?? -1);
                break;
            case 'PLAY_LANDMARK':
                result = await controller.playLandmark(playerId, msg.cardInstanceId, msg.targetPlayerId ?? null);
                break;
            case 'ACTIVATE_SET_SPELL':
                result = await controller.activateSetSpell(playerId, msg.cardInstanceId);
                break;
            case 'ACTIVATE_TRAP':
                result = await controller.activateTrap(playerId, msg.cardInstanceId);
                break;
            case 'DECLARE_ATTACK':
                result = await controller.declareAttack(playerId, msg.attackerInstanceId, msg.targetInfo);
                break;
            case 'ACTIVATE_ABILITY':
                result = await controller.activateAbility(playerId, msg.cardInstanceId);
                break;
            case 'CHANGE_POSITION':
                result = await controller.changePosition(playerId, msg.cardInstanceId);
                break;
            case 'ENTER_BATTLE':
                result = await controller.enterBattlePhase();
                break;
            case 'EXIT_BATTLE':
                await controller.exitBattlePhase();
                result = { success: true };
                break;
            case 'END_TURN':
                await controller.endTurn();
                result = { success: true };

                // Check game over
                if (gs.gameOver) {
                    roomMgr.broadcast(room, 'GAME_OVER', {
                        winner: gs.winner,
                        winnerName: gs.winner !== null ? gs.getPlayerById(gs.winner)?.name : null,
                    });
                } else {
                    // Broadcast turn change
                    broadcastGameState(room, roomMgr);
                    roomMgr.broadcast(room, 'TURN_CHANGE', {
                        activePlayerId: gs.activePlayerIndex,
                        round: gs.roundCounter,
                        turn: gs.turnCounter,
                    });
                }
                break;
            default:
                roomMgr.send(ws, 'ERROR', { message: `Unknown action: ${msg.type}` });
                return;
        }
    } catch (err) {
        console.error('Action error:', err);
        roomMgr.send(ws, 'ERROR', { message: `Server error: ${err.message}` });
        return;
    }

    if (result) {
        roomMgr.send(ws, 'ACTION_RESULT', { success: result.success, reason: result.reason });
        if (!result.success) {
            roomMgr.send(ws, 'TOAST', { message: result.reason });
        }
    }

    // Always broadcast updated state after actions
    broadcastGameState(room, roomMgr);

    // Check game over after any action
    if (gs.gameOver) {
        roomMgr.broadcast(room, 'GAME_OVER', {
            winner: gs.winner,
            winnerName: gs.winner !== null ? gs.getPlayerById(gs.winner)?.name : null,
        });
    }
}

// ─── Express + WebSocket Server ─────────────────────────────

const app = express();
const server = createServer(app);

// Allow cross-origin requests from the Netlify frontend
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Serve static files from dist (built game)
app.use(express.static(join(PROJECT_ROOT, 'dist')));

// Also serve card images and CSV from project root
app.use('/output', express.static(join(PROJECT_ROOT, 'dist', 'output')));
app.use('/card_dataV4.2.csv', (req, res) => {
    res.sendFile(join(PROJECT_ROOT, 'card_dataV4.2.csv'));
});

// Fallback to index.html for SPA routing
app.get('/{*splat}', (req, res) => {
    res.sendFile(join(PROJECT_ROOT, 'dist', 'index.html'));
});

// WebSocket server
const wss = new WebSocketServer({ server });
const roomMgr = new RoomManager();

// Load CSV for game setup
let csvText;
try {
    csvText = readFileSync(join(PROJECT_ROOT, 'card_dataV4.2.csv'), 'utf-8');
    console.log('✅ Card data loaded for server.');
} catch (err) {
    console.error('❌ Failed to load card_dataV4.2.csv:', err.message);
    process.exit(1);
}

wss.on('connection', (ws) => {
    console.log('🔌 New WebSocket connection');

    ws.on('message', async (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        } catch (e) {
            roomMgr.send(ws, 'ERROR', { message: 'Invalid JSON.' });
            return;
        }

        switch (msg.type) {
            case 'CREATE_ROOM': {
                const room = roomMgr.createRoom(ws, msg.playerName || 'Player 1', msg.region || 'Northern');
                roomMgr.send(ws, 'ROOM_CREATED', { roomCode: room.code });
                console.log(`🏠 Room ${room.code} created by ${msg.playerName}`);
                break;
            }

            case 'JOIN_ROOM': {
                const code = (msg.roomCode || '').toUpperCase().trim();
                const result = roomMgr.joinRoom(code, ws, msg.playerName || 'Player 2', msg.region || 'Eastern');
                if (result.error) {
                    roomMgr.send(ws, 'ERROR', { message: result.error });
                } else {
                    const room = result.room;
                    // Notify joiner
                    roomMgr.send(ws, 'ROOM_JOINED', {
                        opponentName: room.players[0].name,
                        opponentRegion: room.players[0].region,
                    });
                    // Notify creator
                    roomMgr.send(room.players[0].ws, 'OPPONENT_JOINED', {
                        opponentName: msg.playerName,
                        opponentRegion: msg.region,
                    });

                    console.log(`🎮 Room ${code}: ${room.players.map(p => p.name).join(' vs ')} — Starting game!`);

                    // Start the game
                    try {
                        await startGame(room, roomMgr, csvText);
                    } catch (err) {
                        console.error('Failed to start game:', err);
                        roomMgr.broadcast(room, 'ERROR', { message: 'Failed to start game: ' + err.message });
                    }
                }
                break;
            }

            default: {
                const room = roomMgr.getRoomByWs(ws);
                if (room) {
                    try {
                        await handleAction(room, ws, msg, roomMgr);
                    } catch (err) {
                        console.error('Message handling error:', err);
                        roomMgr.send(ws, 'ERROR', { message: 'Server error.' });
                    }
                } else {
                    roomMgr.send(ws, 'ERROR', { message: 'You are not in a room. Create or join one first.' });
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        console.log('🔌 WebSocket disconnected');
        roomMgr.removePlayer(ws);
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err.message);
    });
});

server.listen(PORT, () => {
    console.log(`\n⚔ Battle Among Regions — Online Server`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`  WebSocket: ws://localhost:${PORT}\n`);
});
