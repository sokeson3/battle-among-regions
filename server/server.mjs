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
import { WAR_ROUNDS_2P } from '../src/campaign/WarCampaignData.js';
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
        this.matchQueue = [];   // [{ ws, name }] — players waiting for a match
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

    /**
     * Assign two unique random regions to the players in a room.
     */
    assignRandomRegions(room) {
        const allRegions = ['Northern', 'Eastern', 'Southern', 'Western'];
        // Shuffle and pick 2
        for (let i = allRegions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allRegions[i], allRegions[j]] = [allRegions[j], allRegions[i]];
        }
        room.players[0].region = allRegions[0];
        room.players[1].region = allRegions[1];
    }

    createRoom(ws, playerName) {
        const code = this.generateCode();
        const room = {
            code,
            players: [{ ws, name: playerName, region: null, id: 0 }],
            controller: null,
            phase: 'LOBBY', // LOBBY, LANDMARK, MULLIGAN, PLAYING
            landmarkSelections: {},
            mulliganDone: {},
        };
        this.rooms.set(code, room);
        return room;
    }

    joinRoom(code, ws, playerName) {
        const room = this.rooms.get(code);
        if (!room) return { error: 'Room not found.' };
        if (room.players.length >= 2) return { error: 'Room is full.' };
        if (room.phase !== 'LOBBY') return { error: 'Game already in progress.' };

        room.players.push({ ws, name: playerName, region: null, id: 1 });
        return { room };
    }

    // ─── Matchmaking Queue ───────────────────────────────────

    addToQueue(ws, name) {
        // Remove if already in queue
        this.removeFromQueue(ws);
        this.matchQueue.push({ ws, name });
    }

    removeFromQueue(ws) {
        this.matchQueue = this.matchQueue.filter(entry => entry.ws !== ws);
    }

    /**
     * Try to pair two players from the queue.
     * Returns { room } if matched, null otherwise.
     */
    tryMatchFromQueue() {
        if (this.matchQueue.length < 2) return null;

        const p1 = this.matchQueue.shift();
        const p2 = this.matchQueue.shift();

        const room = this.createRoom(p1.ws, p1.name);
        room.players.push({ ws: p2.ws, name: p2.name, region: null, id: 1 });
        this.assignRandomRegions(room);
        return room;
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

// ─── War Room Manager ────────────────────────────────────────

class WarRoomManager {
    constructor() {
        this.rooms = new Map(); // roomCode -> WarRoom
    }

    generateCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code;
        do {
            code = '';
            for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
        } while (this.rooms.has(code));
        return code;
    }

    createWarRoom(ws, playerName) {
        const code = this.generateCode();
        const warRoom = {
            code,
            players: [{ ws, name: playerName, region: null, id: 0, vp: 0, deck: [], landmarkRewards: 0 }],
            currentRound: 1,
            roundResults: [],
            fieldLandmarks: {},
            phase: 'LOBBY',
            gameRoom: null,       // reference to active game room in roomMgr
            deckReadyCount: 0,
            nextRoundReady: 0,
        };
        this.rooms.set(code, warRoom);
        return warRoom;
    }

    joinWarRoom(code, ws, playerName) {
        const warRoom = this.rooms.get(code);
        if (!warRoom) return { error: 'War room not found.' };
        if (warRoom.players.length >= 2) return { error: 'War room is full.' };
        if (warRoom.phase !== 'LOBBY') return { error: 'Campaign already in progress.' };

        warRoom.players.push({ ws, name: playerName, region: null, id: 1, vp: 0, deck: [], landmarkRewards: 0 });

        // Auto-assign random unique regions
        const allRegions = ['Northern', 'Eastern', 'Southern', 'Western'];
        const shuffled = [...allRegions].sort(() => Math.random() - 0.5);
        warRoom.players[0].region = shuffled[0];
        warRoom.players[1].region = shuffled[1];

        // Go straight to deck build (skip region select)
        warRoom.phase = 'DECK_BUILD';
        warRoom.draftSyncData = {}; // { playerId -> { pool1, pool2 } }
        const roundDef = this.getRoundDef(warRoom);
        for (const p of warRoom.players) {
            const opp = warRoom.players.find(o => o.id !== p.id);
            this.send(p.ws, 'WAR_DRAFT_START', {
                yourRegion: p.region,
                opponentRegion: opp.region,
                opponentName: opp.name,
                round: warRoom.currentRound,
                roundDef,
                standings: this.getStandings(warRoom),
            });
        }
        console.log(`⚔ War room ${code}: ${warRoom.players[0].name} (${shuffled[0]}) vs ${warRoom.players[1].name} (${shuffled[1]})`);
        return { warRoom };
    }

    handleDraftSync(warRoom, ws, pool1Ids, pool2Ids) {
        const player = warRoom.players.find(p => p.ws === ws);
        if (!player) return;

        warRoom.draftSyncData[player.id] = { pool1Ids, pool2Ids };
        this.send(ws, 'GAME_PHASE', { phase: 'WAITING', message: 'Waiting for opponent to finish drafting first pools...' });

        // When both players have synced, exchange pools
        if (Object.keys(warRoom.draftSyncData).length >= 2) {
            for (const p of warRoom.players) {
                const opp = warRoom.players.find(o => o.id !== p.id);
                const oppSync = warRoom.draftSyncData[opp.id];
                this.send(p.ws, 'WAR_DRAFT_CONTINUE', {
                    pool1Ids: oppSync.pool1Ids,
                    pool2Ids: oppSync.pool2Ids,
                });
            }
            warRoom.draftSyncData = {};
        }
    }

    handleDeckReady(warRoom, ws, cardIds) {
        const player = warRoom.players.find(p => p.ws === ws);
        if (!player) return;
        player.deck = cardIds;
        warRoom.deckReadyCount++;

        this.send(ws, 'GAME_PHASE', { phase: 'WAITING', message: 'Waiting for opponent to finish drafting...' });

        if (warRoom.deckReadyCount >= 2) {
            warRoom.deckReadyCount = 0;
            warRoom.phase = 'PLAYING';
            return true; // signal to start the round
        }
        return false;
    }

    handleNextRound(warRoom, ws) {
        warRoom.nextRoundReady++;
        this.send(ws, 'GAME_PHASE', { phase: 'WAITING', message: 'Waiting for opponent...' });

        if (warRoom.nextRoundReady >= 2) {
            warRoom.nextRoundReady = 0;
            warRoom.currentRound++;
            warRoom.phase = 'DECK_BUILD';
            warRoom.draftSyncData = {};
            const roundDef = this.getRoundDef(warRoom);
            for (const p of warRoom.players) {
                const opp = warRoom.players.find(o => o.id !== p.id);
                this.send(p.ws, 'WAR_DRAFT_START', {
                    yourRegion: p.region,
                    opponentRegion: opp.region,
                    opponentName: opp.name,
                    round: warRoom.currentRound,
                    roundDef,
                    standings: this.getStandings(warRoom),
                    previousDeck: p.deck,
                });
            }
            return true;
        }
        return false;
    }

    recordRoundResult(warRoom, winnerId) {
        const roundDef = this.getRoundDef(warRoom);
        warRoom.roundResults.push({ round: warRoom.currentRound, winnerId });

        const winner = warRoom.players.find(p => p.id === winnerId);
        if (winner) {
            winner.vp += roundDef.vpWinner;
            winner.landmarkRewards = roundDef.landmarkRewardWinner || 0;
        }

        const standings = this.getStandings(warRoom);
        const isOver = this.isCampaignOver(warRoom);

        warRoom.phase = isOver ? 'FINISHED' : 'INTERMISSION';

        for (const p of warRoom.players) {
            this.send(p.ws, 'WAR_ROUND_RESULT', {
                round: warRoom.currentRound,
                winnerId,
                winnerName: winner ? winner.name : null,
                standings,
                isOver,
                campaignWinner: isOver ? standings[0] : null,
            });
        }

        if (isOver) {
            this.rooms.delete(warRoom.code);
        }
    }

    getRoundDef(warRoom) {
        return WAR_ROUNDS_2P.find(r => r.round === warRoom.currentRound) || WAR_ROUNDS_2P[WAR_ROUNDS_2P.length - 1];
    }

    getStandings(warRoom) {
        return [...warRoom.players]
            .map(p => ({ id: p.id, name: p.name, region: p.region, vp: p.vp }))
            .sort((a, b) => b.vp - a.vp);
    }

    isCampaignOver(warRoom) {
        const standings = this.getStandings(warRoom);
        if (warRoom.currentRound > 3) {
            if (standings[0].vp > standings[1].vp) return true;
            if (warRoom.currentRound > 4) return true;
            return false;
        }
        if (warRoom.currentRound >= 3 && standings[0].vp >= 3) return true;
        return false;
    }

    getWarRoomByWs(ws) {
        for (const room of this.rooms.values()) {
            if (room.players.some(p => p.ws === ws)) return room;
        }
        return null;
    }

    removePlayer(ws) {
        for (const [code, room] of this.rooms) {
            const idx = room.players.findIndex(p => p.ws === ws);
            if (idx !== -1) {
                room.players.splice(idx, 1);
                for (const p of room.players) {
                    this.send(p.ws, 'OPPONENT_DISCONNECTED', { message: 'Opponent disconnected from war campaign.' });
                }
                if (room.players.length === 0) {
                    this.rooms.delete(code);
                }
                return room;
            }
        }
        return null;
    }

    send(ws, type, data = {}) {
        if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type, ...data }));
        }
    }

    broadcast(warRoom, type, data = {}) {
        for (const p of warRoom.players) {
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

// ─── Start War Round ─────────────────────────────────────────

async function startWarRound(warRoom, warRoomMgr, roomMgr, csvText) {
    const roundDef = warRoomMgr.getRoundDef(warRoom);
    const controller = new GameController();
    await controller.loadCards(csvText);
    controller.registerEffects([NorthernEffects, EasternEffects, WesternEffects, SouthernEffects]);

    // Build player configs with custom decks
    const playerConfigs = warRoom.players.map(p => ({
        name: p.name,
        region: p.region,
        customDeck: p.deck,
    }));

    // Create a game room in the regular RoomManager for action handling
    const gameRoom = {
        code: warRoom.code + '_R' + warRoom.currentRound,
        players: warRoom.players.map(p => ({ ws: p.ws, name: p.name, region: p.region, id: p.id })),
        controller: controller,
        phase: 'LANDMARK',
        landmarkSelections: {},
        mulliganDone: {},
        warRoom: warRoom, // link back to the war room
    };
    roomMgr.rooms.set(gameRoom.code, gameRoom);
    warRoom.gameRoom = gameRoom;

    // Wire up callbacks for interactive effects (same as startGame)
    controller.effectEngine.onTargetRequired = (targets, desc, cb) => {
        const activeId = controller.gameState.activePlayerIndex;
        const activeP = gameRoom.players.find(p => p.id === activeId);
        if (!activeP) { cb(targets[0]); return; }
        gameRoom.pendingTargetCb = cb;
        gameRoom.pendingTargetPlayerId = activeId;
        const serializedTargets = targets.map(t => ({
            instanceId: t.instanceId, cardId: t.cardId, name: t.name, type: t.type,
        }));
        roomMgr.send(activeP.ws, 'REQUEST_TARGET', { targets: serializedTargets, description: desc });
    };

    controller.effectEngine.onChoiceRequired = (options, desc, cb) => {
        const activeId = controller.gameState.activePlayerIndex;
        const activeP = gameRoom.players.find(p => p.id === activeId);
        if (!activeP) { cb(options[0]); return; }
        gameRoom.pendingChoiceCb = cb;
        gameRoom.pendingChoicePlayerId = activeId;
        roomMgr.send(activeP.ws, 'REQUEST_CHOICE', { options, description: desc });
    };

    controller.onOpponentResponse = (player, cb) => {
        const p = gameRoom.players.find(rp => rp.id === player.id);
        if (!p) { cb({ activate: false }); return; }
        const faceDownCards = player.getFaceDownCards().filter(c => c.type === 'Spell' || c.type === 'Trap');
        if (faceDownCards.length === 0) { cb({ activate: false }); return; }
        gameRoom.pendingResponseCb = cb;
        gameRoom.pendingResponsePlayerId = player.id;
        const serialized = faceDownCards.map(c => serializeCard(c));
        roomMgr.send(p.ws, 'REQUEST_RESPONSE', { faceDownCards: serialized });
    };

    controller.onUIUpdate = () => {
        broadcastGameState(gameRoom, roomMgr);
    };

    // Set up the game with war campaign settings
    await controller.setupGame(playerConfigs, {
        gameMode: 'warCampaign',
        startingLP: roundDef.lp,
    });

    // Pre-place persisted landmarks from previous rounds
    const gs = controller.gameState;
    for (const player of gs.players) {
        const savedLandmark = warRoom.fieldLandmarks[player.id];
        if (savedLandmark) {
            const card = controller.cardDB.getCard(savedLandmark.cardId);
            if (card) {
                const instance = gs.createCardInstance(card);
                instance.faceUp = true;
                player.landmarkZone = instance;
                gs.log('LANDMARK', `${player.name}'s Landmark ${card.name} persists from previous round.`);
            }
        }
    }

    // Move to landmark phase
    gameRoom.landmarkSelections = {};
    for (const p of gameRoom.players) {
        const player = gs.getPlayerById(p.id);
        const seenCardIds = new Set();
        const landmarks = player.deck.filter(c => {
            if (c.type !== 'Landmark') return false;
            if (seenCardIds.has(c.cardId)) return false;
            seenCardIds.add(c.cardId);
            return true;
        });

        if (landmarks.length === 0) {
            gameRoom.landmarkSelections[p.id] = { skip: true };
            roomMgr.send(p.ws, 'GAME_PHASE', { phase: 'LANDMARK', landmarks: [] });
        } else {
            const serialized = landmarks.map(c => serializeCard(c));
            roomMgr.send(p.ws, 'REQUEST_LANDMARK', { landmarks: serialized });
        }
    }

    checkLandmarksComplete(gameRoom, roomMgr);
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
                    // War campaign: route result to WarRoomManager
                    if (room.warRoom) {
                        // Save landmarks for next round
                        for (const player of gs.players) {
                            if (player.landmarkZone) {
                                room.warRoom.fieldLandmarks[player.id] = {
                                    cardId: player.landmarkZone.cardId,
                                };
                            }
                        }
                        warRoomMgr.recordRoundResult(room.warRoom, gs.winner);
                        // Clean up the game room
                        roomMgr.rooms.delete(room.code);
                        room.warRoom.gameRoom = null;
                    } else {
                        roomMgr.broadcast(room, 'GAME_OVER', {
                            winner: gs.winner,
                            winnerName: gs.winner !== null ? gs.getPlayerById(gs.winner)?.name : null,
                        });
                    }
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
        if (room.warRoom) {
            // Save landmarks for next round
            for (const player of gs.players) {
                if (player.landmarkZone) {
                    room.warRoom.fieldLandmarks[player.id] = {
                        cardId: player.landmarkZone.cardId,
                    };
                }
            }
            warRoomMgr.recordRoundResult(room.warRoom, gs.winner);
            roomMgr.rooms.delete(room.code);
            room.warRoom.gameRoom = null;
        } else {
            roomMgr.broadcast(room, 'GAME_OVER', {
                winner: gs.winner,
                winnerName: gs.winner !== null ? gs.getPlayerById(gs.winner)?.name : null,
            });
        }
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
const warRoomMgr = new WarRoomManager();

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
            case 'FIND_MATCH': {
                const name = msg.playerName || 'Player';
                roomMgr.addToQueue(ws, name);
                roomMgr.send(ws, 'SEARCHING', { message: 'Looking for an opponent...' });
                console.log(`🔍 ${name} is searching for a match (queue: ${roomMgr.matchQueue.length})`);

                const matched = roomMgr.tryMatchFromQueue();
                if (matched) {
                    // Notify both players of the match
                    for (const p of matched.players) {
                        const opp = matched.players.find(op => op.id !== p.id);
                        roomMgr.send(p.ws, 'MATCH_FOUND', {
                            yourRegion: p.region,
                            opponentName: opp.name,
                            opponentRegion: opp.region,
                        });
                    }
                    console.log(`⚔ Match found: ${matched.players.map(p => `${p.name} (${p.region})`).join(' vs ')}`);

                    try {
                        await startGame(matched, roomMgr, csvText);
                    } catch (err) {
                        console.error('Failed to start game:', err);
                        roomMgr.broadcast(matched, 'ERROR', { message: 'Failed to start game: ' + err.message });
                    }
                }
                break;
            }

            case 'CANCEL_MATCH': {
                roomMgr.removeFromQueue(ws);
                roomMgr.send(ws, 'MATCH_CANCELLED', { message: 'Search cancelled.' });
                console.log(`❌ Player cancelled match search`);
                break;
            }

            case 'CREATE_ROOM': {
                const room = roomMgr.createRoom(ws, msg.playerName || 'Player 1');
                roomMgr.send(ws, 'ROOM_CREATED', { roomCode: room.code });
                console.log(`🏠 Room ${room.code} created by ${msg.playerName}`);
                break;
            }

            case 'JOIN_ROOM': {
                const code = (msg.roomCode || '').toUpperCase().trim();
                const result = roomMgr.joinRoom(code, ws, msg.playerName || 'Player 2');
                if (result.error) {
                    roomMgr.send(ws, 'ERROR', { message: result.error });
                } else {
                    const room = result.room;
                    // Assign random regions now that both players are in
                    roomMgr.assignRandomRegions(room);

                    // Notify both players of the match with assigned regions
                    for (const p of room.players) {
                        const opp = room.players.find(op => op.id !== p.id);
                        roomMgr.send(p.ws, 'MATCH_FOUND', {
                            yourRegion: p.region,
                            opponentName: opp.name,
                            opponentRegion: opp.region,
                        });
                    }

                    console.log(`🎮 Room ${code}: ${room.players.map(p => `${p.name} (${p.region})`).join(' vs ')} — Starting game!`);

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

            case 'CREATE_WAR_ROOM': {
                const warRoom = warRoomMgr.createWarRoom(ws, msg.playerName || 'Player 1');
                warRoomMgr.send(ws, 'WAR_ROOM_CREATED', { roomCode: warRoom.code });
                console.log(`⚔ War Room ${warRoom.code} created by ${msg.playerName}`);
                break;
            }

            case 'JOIN_WAR_ROOM': {
                const wCode = (msg.roomCode || '').toUpperCase().trim();
                const wResult = warRoomMgr.joinWarRoom(wCode, ws, msg.playerName || 'Player 2');
                if (wResult.error) {
                    warRoomMgr.send(ws, 'ERROR', { message: wResult.error });
                }
                // joinWarRoom now auto-assigns regions and sends WAR_DRAFT_START
                break;
            }

            case 'WAR_DRAFT_SYNC': {
                const warRoom = warRoomMgr.getWarRoomByWs(ws);
                if (warRoom && warRoom.phase === 'DECK_BUILD') {
                    warRoomMgr.handleDraftSync(warRoom, ws, msg.pool1Ids || [], msg.pool2Ids || []);
                }
                break;
            }

            case 'WAR_DECK_READY': {
                const warRoom = warRoomMgr.getWarRoomByWs(ws);
                if (warRoom) {
                    const ready = warRoomMgr.handleDeckReady(warRoom, ws, msg.cardIds || []);
                    if (ready) {
                        try {
                            await startWarRound(warRoom, warRoomMgr, roomMgr, csvText);
                        } catch (err) {
                            console.error('Failed to start war round:', err);
                            warRoomMgr.broadcast(warRoom, 'ERROR', { message: 'Failed to start war round: ' + err.message });
                        }
                    }
                }
                break;
            }

            case 'WAR_NEXT_ROUND': {
                const warRoom = warRoomMgr.getWarRoomByWs(ws);
                if (warRoom && warRoom.phase === 'INTERMISSION') {
                    warRoomMgr.handleNextRound(warRoom, ws);
                }
                break;
            }

            default: {
                // Check regular game rooms first, then war rooms
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
        roomMgr.removeFromQueue(ws);
        roomMgr.removePlayer(ws);
        warRoomMgr.removePlayer(ws);
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
