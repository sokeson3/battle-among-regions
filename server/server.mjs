// ─────────────────────────────────────────────────────────────
// server.mjs — Online Multiplayer Server for Battle Among Regions
// Uses Express for static file serving + WebSocket (ws) for game comms
// ─────────────────────────────────────────────────────────────

import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import { WebSocketServer } from 'ws';
import { readFileSync, appendFileSync, existsSync } from 'fs';
import Stripe from 'stripe';
import * as DB from './db.mjs';

// Import game engine
import { GameController } from '../src/engine/GameController.js';
import { CardDatabase } from '../src/engine/CardDatabase.js';
import { WAR_ROUNDS_2P } from '../src/campaign/WarCampaignData.js';
import { BotPlayer } from './BotPlayer.js';
import * as NorthernEffects from '../src/effects/NorthernEffects.js';
import * as EasternEffects from '../src/effects/EasternEffects.js';
import * as WesternEffects from '../src/effects/WesternEffects.js';
import * as SouthernEffects from '../src/effects/SouthernEffects.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// ─── Configuration ───────────────────────────────────────────
const PORT = process.env.PORT || 4000;
const MATCH_LOG_PATH = join(PROJECT_ROOT, 'match_history.csv');

// ─── Stripe Setup ────────────────────────────────────────────
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY;
const CLIENT_URL = process.env.CLIENT_URL || `http://localhost:${PORT}`;

let stripe = null;
if (STRIPE_SECRET_KEY) {
    stripe = new Stripe(STRIPE_SECRET_KEY);
    console.log('✅ Stripe initialized.');
} else {
    console.warn('⚠ STRIPE_SECRET_KEY not set — store purchases disabled.');
}

// ─── Cosmetics Store Catalog ─────────────────────────────────
// Authoritative catalog of all purchasable cosmetics with prices (in pence).
// These IDs must match the definitions in CosmeticsManager.js.
const STORE_CATALOG = [
    // Playmats
    { type: 'playmat', id: 'N001', name: 'The Frostfell Citadel', price: 299, currency: 'gbp' },
    { type: 'playmat', id: 'N002', name: 'Ancestral Ice Cairn', price: 299, currency: 'gbp' },
    { type: 'playmat', id: 'E001', name: 'Hidden Monastery', price: 299, currency: 'gbp' },
    { type: 'playmat', id: 'E002', name: 'Scroll Library', price: 299, currency: 'gbp' },
    { type: 'playmat', id: 'S001', name: 'Arena of Trials', price: 299, currency: 'gbp' },
    { type: 'playmat', id: 'S002', name: 'Volcanic Forge', price: 299, currency: 'gbp' },
    { type: 'playmat', id: 'S038', name: 'Scorched Earth', price: 299, currency: 'gbp' },
    { type: 'playmat', id: 'W001', name: 'Echoing Canyon', price: 299, currency: 'gbp' },
    { type: 'playmat', id: 'W002', name: 'Mystic Menagerie', price: 299, currency: 'gbp' },
    // Sleeves
    { type: 'sleeve', id: 'inferno', name: 'Inferno Crest', price: 199, currency: 'gbp' },
    { type: 'sleeve', id: 'glacial', name: 'Glacial Sigil', price: 199, currency: 'gbp' },
    { type: 'sleeve', id: 'shadow_scroll', name: 'Shadow Scroll', price: 199, currency: 'gbp' },
    { type: 'sleeve', id: 'spirit_totem', name: 'Spirit Totem', price: 199, currency: 'gbp' },
    // Avatar Frames
    { type: 'avatarFrame', id: 'shadow_dragon', name: 'Shadow Dragon', price: 149, currency: 'gbp' },
    { type: 'avatarFrame', id: 'frost_guardian', name: 'Frost Guardian', price: 149, currency: 'gbp' },
    { type: 'avatarFrame', id: 'flame_crown', name: 'Flame Crown', price: 149, currency: 'gbp' },
    { type: 'avatarFrame', id: 'totem_spirit', name: 'Totem Spirit', price: 149, currency: 'gbp' },
    // Emote Sets
    { type: 'emoteSet', id: 'spirit_totems', name: 'Spirit Totems', price: 99, currency: 'gbp' },
    { type: 'emoteSet', id: 'battle_cries', name: 'Battle Cries', price: 99, currency: 'gbp' },
];

// ─── CSV Match Logger ────────────────────────────────────────

function logMatchToCSV({ date, duration, rounds, turns, winner, winnerName, player1Name, player1Region, player2Name, player2Region }) {
    const headers = 'Date,Duration(s),Rounds,Turns,Winner,WinnerName,Player1,Player1Region,Player2,Player2Region';
    if (!existsSync(MATCH_LOG_PATH)) {
        appendFileSync(MATCH_LOG_PATH, headers + '\n', 'utf-8');
    }
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const row = [date, duration, rounds, turns, winner, winnerName, player1Name, player1Region, player2Name, player2Region].map(escape).join(',');
    appendFileSync(MATCH_LOG_PATH, row + '\n', 'utf-8');
}

// ─── Room Manager ────────────────────────────────────────────

class RoomManager {
    constructor() {
        this.rooms = new Map(); // roomCode -> Room
        this.matchQueue = [];   // [{ ws, name }] — players waiting for a match
        this.duelMatchQueue = []; // [{ ws, name }] — players waiting for duel with deck select
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
            players: [{ ws, name: playerName, region: null, id: 0, cosmetics: null }],
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

    addToQueue(ws, name, cosmetics = null) {
        // Remove if already in queue
        this.removeFromQueue(ws);
        this.matchQueue.push({ ws, name, cosmetics });
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
        room.players[0].cosmetics = p1.cosmetics || null;
        room.players.push({ ws: p2.ws, name: p2.name, region: null, id: 1, cosmetics: p2.cosmetics || null });
        this.assignRandomRegions(room);
        return room;
    }

    // ─── Duel Matchmaking Queue (with deck select) ───────────

    addToDuelQueue(ws, name, cosmetics = null) {
        this.removeFromDuelQueue(ws);
        this.duelMatchQueue.push({ ws, name, cosmetics });
    }

    removeFromDuelQueue(ws) {
        this.duelMatchQueue = this.duelMatchQueue.filter(entry => entry.ws !== ws);
    }

    /**
     * Try to pair two players from the duel queue.
     * Creates a room in DUEL_DECK_SELECT phase (no regions assigned yet).
     */
    tryDuelMatchFromQueue() {
        if (this.duelMatchQueue.length < 2) return null;

        const p1 = this.duelMatchQueue.shift();
        const p2 = this.duelMatchQueue.shift();

        const room = this.createRoom(p1.ws, p1.name);
        room.players[0].cosmetics = p1.cosmetics || null;
        room.players.push({ ws: p2.ws, name: p2.name, region: null, id: 1, cosmetics: p2.cosmetics || null });
        room.phase = 'DUEL_DECK_SELECT';
        room.duelDeckSelections = {}; // { playerId -> { region, deckCardIds } }
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
        this.warMatchQueue = []; // [{ ws, name }] — players waiting for a war campaign match
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

        // Determine and store the non-chosen regions in a fixed shuffled order
        const nonChosen = allRegions.filter(r => r !== shuffled[0] && r !== shuffled[1]);
        const shuffledNonChosen = [...nonChosen].sort(() => Math.random() - 0.5);
        warRoom.nonChosenRegions = shuffledNonChosen; // persist for subsequent rounds

        // Go straight to deck build (skip region select)
        warRoom.phase = 'DECK_BUILD';
        warRoom.draftSyncData = {}; // { playerId -> { pool1, pool2 } }
        const roundDef = this.getRoundDef(warRoom);
        for (const p of warRoom.players) {
            const opp = warRoom.players.find(o => o.id !== p.id);
            // Each player drafts from their main + one non-chosen region
            // Then they swap and draft from the opponent's main + other non-chosen
            const myPools = p.id === 0
                ? [p.region, shuffledNonChosen[0]]
                : [p.region, shuffledNonChosen[1]];
            const oppPools = p.id === 0
                ? [opp.region, shuffledNonChosen[1]]
                : [opp.region, shuffledNonChosen[0]];
            this.send(p.ws, 'WAR_DRAFT_START', {
                yourRegion: p.region,
                opponentRegion: opp.region,
                opponentName: opp.name,
                round: warRoom.currentRound,
                roundDef,
                standings: this.getStandings(warRoom),
                myPools,
                oppPools,
            });
        }
        console.log(`⚔ War room ${code}: ${warRoom.players[0].name} (${shuffled[0]}) vs ${warRoom.players[1].name} (${shuffled[1]}), non-chosen: [${shuffledNonChosen}]`);
        return { warRoom };
    }

    handleDraftSync(warRoom, ws, pool1Ids, pool2Ids, extraPools = []) {
        const player = warRoom.players.find(p => p.ws === ws);
        if (!player) return;

        const opp = warRoom.players.find(p => p.id !== player.id);

        // If the opponent is already done drafting, auto-respond immediately
        if (opp && opp.draftDone) {
            this.send(ws, 'WAR_DRAFT_CONTINUE', {
                pool1Ids: pool1Ids,
                pool2Ids: pool2Ids,
                extraPools: extraPools,
                opponentDone: true,
            });
            return;
        }

        warRoom.draftSyncData[player.id] = { pool1Ids, pool2Ids, extraPools };

        // When both players have synced, exchange pools
        if (Object.keys(warRoom.draftSyncData).length >= 2) {
            for (const p of warRoom.players) {
                const o = warRoom.players.find(x => x.id !== p.id);
                const oSync = warRoom.draftSyncData[o.id];
                this.send(p.ws, 'WAR_DRAFT_CONTINUE', {
                    pool1Ids: oSync.pool1Ids,
                    pool2Ids: oSync.pool2Ids,
                    extraPools: oSync.extraPools,
                });
            }
            warRoom.draftSyncData = {};
        }
    }

    handleDeckReady(warRoom, ws, cardIds) {
        const player = warRoom.players.find(p => p.ws === ws);
        if (!player) return;
        player.deck = cardIds;
        player.draftDone = true;
        console.log(`⚔ War deck stored: Player ${player.id} (${player.region}), ${cardIds.length} cards`);

        // If the opponent has a pending draft sync waiting, auto-resolve it
        const opp = warRoom.players.find(p => p.id !== player.id);
        if (opp && warRoom.draftSyncData[opp.id] && !warRoom.draftSyncData[player.id]) {
            const oppSync = warRoom.draftSyncData[opp.id];
            this.send(opp.ws, 'WAR_DRAFT_CONTINUE', {
                pool1Ids: oppSync.pool1Ids,
                pool2Ids: oppSync.pool2Ids,
                extraPools: oppSync.extraPools,
                opponentDone: true,
            });
            warRoom.draftSyncData = {};
        }

        this.send(ws, 'GAME_PHASE', { phase: 'WAITING', message: 'Waiting for opponent to finish drafting...' });
    }

    handleReadyCheck(warRoom, ws) {
        const player = warRoom.players.find(p => p.ws === ws);
        if (!player) return false;

        warRoom.readyCheckCount = (warRoom.readyCheckCount || 0) + 1;
        console.log(`✅ War ready check: Player ${player.id} (${warRoom.readyCheckCount}/2)`);

        if (warRoom.readyCheckCount >= 2) {
            warRoom.readyCheckCount = 0;
            warRoom.phase = 'PLAYING';
            // Tell both clients to wire game event handlers
            for (const p of warRoom.players) {
                this.send(p.ws, 'WAR_GAME_STARTING', { yourPlayerId: p.id });
            }
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
            warRoom.readyCheckCount = 0;
            for (const p of warRoom.players) p.draftDone = false;
            const roundDef = this.getRoundDef(warRoom);
            const nc = warRoom.nonChosenRegions || [];
            for (const p of warRoom.players) {
                const opp = warRoom.players.find(o => o.id !== p.id);
                const myPools = p.id === 0
                    ? [p.region, nc[0]]
                    : [p.region, nc[1]];
                const oppPools = p.id === 0
                    ? [opp.region, nc[1]]
                    : [opp.region, nc[0]];
                this.send(p.ws, 'WAR_DRAFT_START', {
                    yourRegion: p.region,
                    opponentRegion: opp.region,
                    opponentName: opp.name,
                    round: warRoom.currentRound,
                    roundDef,
                    standings: this.getStandings(warRoom),
                    previousDeck: p.deck,
                    myPools,
                    oppPools,
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
            // Award 3 random cards to each player for completing a war campaign
            for (const p of warRoom.players) {
                if (p.ws.userId) {
                    try {
                        const rewardIds = pickRandomRewardCards(p.ws.userId, 3);
                        if (rewardIds.length > 0) {
                            DB.addCardsToCollection(p.ws.userId, rewardIds);
                            const rewardCards = rewardIds.map(id => {
                                const card = serverCardDB.getCard(id);
                                return card ? { id: card.id, name: card.name, region: card.region, type: card.type } : { id };
                            });
                            this.send(p.ws, 'CARDS_UNLOCKED', { cards: rewardCards, source: 'warCampaign' });
                            console.log(`🎁 War campaign reward: ${p.name} unlocked ${rewardIds.join(', ')}`);
                        }
                    } catch (err) {
                        console.error(`Failed to award war campaign cards to ${p.name}:`, err);
                    }
                }
            }
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
        // Note: called BEFORE advanceRound(), so currentRound is the round that just finished.
        if (warRoom.currentRound >= 3) {
            // After round 3+, check for a clear VP leader
            if (standings[0].vp > standings[1].vp) return true;
            // If tie after round 4 (tiebreaker), cap the campaign
            if (warRoom.currentRound >= 4) return true;
        }
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

    // ─── War Matchmaking Queue ────────────────────────────────

    addToWarQueue(ws, name) {
        this.removeFromWarQueue(ws);
        this.warMatchQueue.push({ ws, name });
    }

    removeFromWarQueue(ws) {
        this.warMatchQueue = this.warMatchQueue.filter(p => p.ws !== ws);
    }

    tryWarMatchFromQueue() {
        if (this.warMatchQueue.length < 2) return null;

        const p1 = this.warMatchQueue.shift();
        const p2 = this.warMatchQueue.shift();

        const warRoom = this.createWarRoom(p1.ws, p1.name);
        const result = this.joinWarRoom(warRoom.code, p2.ws, p2.name);
        return result.warRoom || null;
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
    // Spread all card properties automatically so new fields are never missed.
    // Only strip internal/non-serializable properties if needed.
    const { _listeners, _internalRef, ...rest } = card;
    return rest;
}

/**
 * Serialize trigger context for the client so it can render card visuals.
 * Only extracts card names/IDs — never full card objects.
 */
function serializeTriggerContext(triggerType, triggerContext) {
    if (!triggerContext) return null;
    const ctx = {};
    if (triggerType === 'attack') {
        if (triggerContext.attacker) {
            ctx.attackerCardId = triggerContext.attacker.cardId;
            ctx.attackerName = triggerContext.attacker.name;
        }
        if (triggerContext.target) {
            ctx.targetType = triggerContext.target.type;
            if (triggerContext.target.card) {
                ctx.targetCardId = triggerContext.target.card.cardId;
                ctx.targetName = triggerContext.target.card.name;
            }
        }
    } else if (triggerType === 'spell') {
        if (triggerContext.spell) {
            ctx.cardId = triggerContext.spell.cardId;
            ctx.cardName = triggerContext.spell.name;
        }
    } else if (triggerType === 'summon') {
        if (triggerContext.summonedCard) {
            ctx.cardId = triggerContext.summonedCard.cardId;
            ctx.cardName = triggerContext.summonedCard.name;
        }
    } else if (triggerType === 'ability') {
        if (triggerContext.abilityCard) {
            ctx.cardId = triggerContext.abilityCard.cardId;
            ctx.cardName = triggerContext.abilityCard.name;
        }
    } else if (triggerType === 'destroy') {
        if (triggerContext.destroyedCard) {
            ctx.cardId = triggerContext.destroyedCard.cardId;
            ctx.cardName = triggerContext.destroyedCard.name;
        }
    } else if (triggerType === 'phase_change') {
        ctx.phase = triggerContext.phase;
    }
    return Object.keys(ctx).length > 0 ? ctx : null;
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
        // Use source player (card owner) for target selection, fall back to active player
        const sourceId = controller.effectEngine._currentSourcePlayerId ?? controller.gameState.activePlayerIndex;
        const sourceP = room.players.find(p => p.id === sourceId);
        if (!sourceP) { cb(targets[0]); return; }

        // Bot auto-resolves targets
        if (sourceP.isBot && room.botPlayer) {
            const chosen = room.botPlayer.chooseTarget(targets, desc);
            setTimeout(() => cb(chosen || targets[0]), 100);
            return;
        }

        // Store callback for when client responds
        room.pendingTargetCb = cb;
        room.pendingTargetPlayerId = sourceId;

        const serializedTargets = targets.map(t => {
            if (t.type === 'lp') {
                return { __lp_target: true, type: 'lp', name: t.name, playerId: t.player?.id };
            }
            return {
                instanceId: t.instanceId,
                cardId: t.cardId,
                name: t.name,
                type: t.type,
            };
        });
        roomMgr.send(sourceP.ws, 'REQUEST_TARGET', { targets: serializedTargets, description: desc });
    };

    controller.effectEngine.onChoiceRequired = (options, desc, cb) => {
        // Use source player (card owner) for choice selection, fall back to active player
        const sourceId = controller.effectEngine._currentSourcePlayerId ?? controller.gameState.activePlayerIndex;
        const sourceP = room.players.find(p => p.id === sourceId);
        if (!sourceP) { cb(options[0]); return; }

        // Bot auto-resolves choices
        if (sourceP.isBot && room.botPlayer) {
            const chosen = room.botPlayer.chooseOption(options, desc);
            setTimeout(() => cb(chosen || options[0]), 100);
            return;
        }

        room.pendingChoiceCb = cb;
        room.pendingChoicePlayerId = sourceId;
        roomMgr.send(sourceP.ws, 'REQUEST_CHOICE', { options, description: desc });
    };

    controller.onOpponentResponse = (player, cb, chainContext) => {
        const p = room.players.find(rp => rp.id === player.id);
        if (!p) { cb({ activate: false }); return; }

        // Bot never activates response traps (simple AI — always passes)
        if (p.isBot) {
            setTimeout(() => cb({ activate: false }), 50);
            return;
        }

        const activeId = controller.gameState.activePlayerIndex;
        const faceDownCards = player.getFaceDownCards().filter(c =>
            (c.type === 'Trap' || (c.type === 'Spell' && player.id === activeId)) && !c.setThisTurn
        );
        if (faceDownCards.length === 0) { cb({ activate: false }); return; }

        // Validate each card and annotate with canActivate/reason
        const validator = controller.actionValidator;
        const effectEngine = controller.effectEngine;
        const annotated = faceDownCards.map(card => {
            let canActivate = false;
            let reason = '';
            if (card.type === 'Trap') {
                const result = validator.canActivateTrap(player.id, card, {
                    effectEngine,
                    triggerContext: chainContext?.triggerContext,
                    triggerType: chainContext?.triggerType
                });
                canActivate = result.valid;
                reason = result.reason || '';
            } else if (card.type === 'Spell') {
                const result = validator.canActivateSetSpell(player.id, card, { isResponse: true });
                canActivate = result.valid;
                reason = result.reason || '';
            }
            return { ...serializeCard(card), canActivate, reason };
        });
        console.log(`🎴 Response: P${player.id} has ${faceDownCards.length} face-down, ${annotated.filter(c => c.canActivate).length} activatable (trigger: ${chainContext?.triggerType})`);

        // If no cards are eligible, auto-pass without showing the dialog
        if (!annotated.some(c => c.canActivate)) { cb({ activate: false }); return; }

        room.pendingResponseCb = cb;
        room.pendingResponsePlayerId = player.id;
        const serializedCtx = serializeTriggerContext(chainContext?.triggerType, chainContext?.triggerContext);
        roomMgr.send(p.ws, 'REQUEST_RESPONSE', { faceDownCards: annotated, triggerType: chainContext?.triggerType, triggerContext: serializedCtx });

        // Tell other players to show "Awaiting opponent..." overlay
        for (const otherP of room.players) {
            if (otherP.id !== player.id) {
                roomMgr.send(otherP.ws, 'AWAITING_RESPONSE', { waitingForPlayerId: player.id });
            }
        }
    };

    controller.onUIUpdate = () => {
        broadcastGameState(room, roomMgr);
    };

    // Set up the game (use custom deckCardIds if present from duel deck select)
    const playerConfigs = room.players.map(p => {
        const cfg = { name: p.name, region: p.region };
        if (p.deckCardIds) cfg.deckCardIds = p.deckCardIds;
        return cfg;
    });

    await controller.setupGame(playerConfigs, {
        gameMode: 'duel',
        startingLP: 3000,
    });

    // Record match start time
    room.startedAt = Date.now();

    // Now move to landmark phase
    room.phase = 'LANDMARK';
    room.landmarkSelections = {};

    // Send each player their landmark options
    for (const p of room.players) {
        const player = controller.gameState.getPlayerById(p.id);
        const seenCardIds = new Set();
        const allCards = [...player.deck, ...player.hand];
        const landmarks = allCards.filter(c => {
            if (c.type !== 'Landmark') return false;
            if (seenCardIds.has(c.cardId)) return false;
            seenCardIds.add(c.cardId);
            return true;
        });

        if (p.isBot && room.botPlayer) {
            // Bot auto-selects landmark
            room.landmarkSelections[p.id] = room.botPlayer.chooseLandmark(landmarks);
        } else if (landmarks.length === 0) {
            room.landmarkSelections[p.id] = { skip: true };
            roomMgr.send(p.ws, 'GAME_PHASE', { phase: 'LANDMARK', landmarks: [] });
        } else {
            const serialized = landmarks.map(c => serializeCard(c));
            roomMgr.send(p.ws, 'REQUEST_LANDMARK', { landmarks: serialized });
        }
    }

    await checkLandmarksComplete(room, roomMgr);
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
        deckCardIds: p.deck,
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
    gameRoom.startedAt = Date.now();
    roomMgr.rooms.set(gameRoom.code, gameRoom);
    warRoom.gameRoom = gameRoom;

    // Wire up callbacks for interactive effects (same as startGame)
    controller.effectEngine.onTargetRequired = (targets, desc, cb) => {
        // Use source player (card owner) for target selection, fall back to active player
        const sourceId = controller.effectEngine._currentSourcePlayerId ?? controller.gameState.activePlayerIndex;
        const sourceP = gameRoom.players.find(p => p.id === sourceId);
        if (!sourceP) { cb(targets[0]); return; }
        gameRoom.pendingTargetCb = cb;
        gameRoom.pendingTargetPlayerId = sourceId;
        const serializedTargets = targets.map(t => {
            if (t.type === 'lp') {
                return { __lp_target: true, type: 'lp', name: t.name, playerId: t.player?.id };
            }
            return { instanceId: t.instanceId, cardId: t.cardId, name: t.name, type: t.type };
        });
        roomMgr.send(sourceP.ws, 'REQUEST_TARGET', { targets: serializedTargets, description: desc });
    };

    controller.effectEngine.onChoiceRequired = (options, desc, cb) => {
        // Use source player (card owner) for choice selection, fall back to active player
        const sourceId = controller.effectEngine._currentSourcePlayerId ?? controller.gameState.activePlayerIndex;
        const sourceP = gameRoom.players.find(p => p.id === sourceId);
        if (!sourceP) { cb(options[0]); return; }
        gameRoom.pendingChoiceCb = cb;
        gameRoom.pendingChoicePlayerId = sourceId;
        roomMgr.send(sourceP.ws, 'REQUEST_CHOICE', { options, description: desc });
    };

    controller.onOpponentResponse = (player, cb, chainContext) => {
        const p = gameRoom.players.find(rp => rp.id === player.id);
        if (!p) { cb({ activate: false }); return; }
        const activeId = controller.gameState.activePlayerIndex;
        const faceDownCards = player.getFaceDownCards().filter(c =>
            (c.type === 'Trap' || (c.type === 'Spell' && player.id === activeId)) && !c.setThisTurn
        );
        if (faceDownCards.length === 0) { cb({ activate: false }); return; }

        // Validate each card and annotate with canActivate/reason
        const validator = controller.actionValidator;
        const effectEngine = controller.effectEngine;
        const annotated = faceDownCards.map(card => {
            let canActivate = false;
            let reason = '';
            if (card.type === 'Trap') {
                const result = validator.canActivateTrap(player.id, card, {
                    effectEngine,
                    triggerContext: chainContext?.triggerContext,
                    triggerType: chainContext?.triggerType
                });
                canActivate = result.valid;
                reason = result.reason || '';
            } else if (card.type === 'Spell') {
                const result = validator.canActivateSetSpell(player.id, card, { isResponse: true });
                canActivate = result.valid;
                reason = result.reason || '';
            }
            return { ...serializeCard(card), canActivate, reason };
        });
        console.log(`🎴 Response: P${player.id} has ${faceDownCards.length} face-down, ${annotated.filter(c => c.canActivate).length} activatable (trigger: ${chainContext?.triggerType})`);

        // If no cards are eligible, auto-pass without showing the dialog
        if (!annotated.some(c => c.canActivate)) { cb({ activate: false }); return; }

        gameRoom.pendingResponseCb = cb;
        gameRoom.pendingResponsePlayerId = player.id;
        const serializedCtx = serializeTriggerContext(chainContext?.triggerType, chainContext?.triggerContext);
        roomMgr.send(p.ws, 'REQUEST_RESPONSE', { faceDownCards: annotated, triggerType: chainContext?.triggerType, triggerContext: serializedCtx });

        // Tell other players to show "Awaiting opponent..." overlay
        for (const otherP of gameRoom.players) {
            if (otherP.id !== player.id) {
                roomMgr.send(otherP.ws, 'AWAITING_RESPONSE', { waitingForPlayerId: player.id });
            }
        }
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
        const allCards = [...player.deck, ...player.hand];
        const landmarks = allCards.filter(c => {
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

    await checkLandmarksComplete(gameRoom, roomMgr);
}

async function checkLandmarksComplete(room, roomMgr) {
    if (Object.keys(room.landmarkSelections).length < 2) return;

    const gs = room.controller.gameState;

    // Apply landmark selections
    for (const p of room.players) {
        const selection = room.landmarkSelections[p.id];
        if (selection && !selection.skip && selection.cardInstanceId) {
            const player = gs.getPlayerById(p.id);
            // Look in deck first, then hand
            let deckIdx = player.deck.findIndex(c => c.instanceId === selection.cardInstanceId);
            let removed = null;
            if (deckIdx !== -1) {
                removed = player.deck.splice(deckIdx, 1)[0];
            } else {
                const handIdx = player.hand.findIndex(c => c.instanceId === selection.cardInstanceId);
                if (handIdx !== -1) {
                    removed = player.hand.splice(handIdx, 1)[0];
                }
            }
            if (removed) {
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
        if (p.isBot && room.botPlayer) {
            // Bot auto-mulligans
            const player = gs.getPlayerById(p.id);
            const toMulligan = room.botPlayer.chooseMulligan(player.hand);
            await room.controller.turnManager.performMulligan(p.id, toMulligan);
            room.mulliganDone[p.id] = true;
        } else {
            const player = gs.getPlayerById(p.id);
            const hand = player.hand.map(c => serializeCard(c));
            roomMgr.send(p.ws, 'REQUEST_MULLIGAN', { hand });
        }
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

    // If the starting player is a bot, trigger its turn
    if (room.botPlayer && gs.activePlayerIndex === room.botPlayer.playerId) {
        setTimeout(() => triggerBotTurn(room, roomMgr), 500);
    }
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
            await checkLandmarksComplete(room, roomMgr);
            return;
        }

        case 'MULLIGAN': {
            if (room.phase !== 'MULLIGAN') return;
            const cardInstanceIds = msg.cardInstanceIds || [];
            // Use performMulligan directly (NOT controller.mulligan which also calls
            // checkMulliganComplete internally, causing a double-start bug)
            await controller.turnManager.performMulligan(playerId, cardInstanceIds);
            room.mulliganDone[playerId] = true;
            roomMgr.send(ws, 'GAME_PHASE', { phase: 'WAITING', message: 'Waiting for opponent...' });
            await checkMulliganComplete(room, roomMgr);
            return;
        }

        case 'TARGET_SELECTED': {
            if (room.pendingTargetCb && room.pendingTargetPlayerId === playerId) {
                let target = null;
                if (msg.lpTarget) {
                    // LP target — reconstruct the LP target object
                    const lpPlayer = gs.getPlayerById(msg.lpPlayerId ?? playerId);
                    target = { type: 'lp', player: lpPlayer, name: lpPlayer?.name ? `${lpPlayer.name}'s LP` : 'LP' };
                } else {
                    // Card target — find the actual card instance from the target ID
                    const found = gs.findCardOnField(msg.targetId);
                    target = found ? found.card : null;
                }
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
            case 'DECLARE_ATTACK': {
                // Resolve serialized targetInfo to actual game objects
                const targetInfo = msg.targetInfo || {};
                const resolvedTarget = { type: targetInfo.type };
                if (targetInfo.targetPlayerId !== undefined) {
                    resolvedTarget.player = gs.getPlayerById(targetInfo.targetPlayerId);
                }
                if (targetInfo.cardInstanceId && resolvedTarget.player) {
                    resolvedTarget.card = resolvedTarget.player.getFieldUnits()
                        .find(u => u.instanceId === targetInfo.cardInstanceId);
                }
                result = await controller.declareAttack(playerId, msg.attackerInstanceId, resolvedTarget);
                break;
            }
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
                    room._gameOverHandled = true; // Prevent double-reporting by post-switch check
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
                        const duration = room.startedAt ? Math.round((Date.now() - room.startedAt) / 1000) : 0;
                        const matchData = {
                            winner: gs.winner,
                            winnerName: gs.winner !== null ? gs.getPlayerById(gs.winner)?.name : null,
                            duration,
                            rounds: gs.roundCounter,
                            turns: gs.turnCounter,
                            players: room.players.map(p => ({ name: p.name, region: p.region, lp: gs.getPlayerById(p.id)?.lp ?? 0 })),
                        };
                        roomMgr.broadcast(room, 'GAME_OVER', matchData);

                        // ─── Update Ranked Points & Award Cards ──
                        if (gs.winner !== null) {
                            for (const p of room.players) {
                                if (p.ws.userId && !p.isBot) {
                                    const outcome = p.id === gs.winner ? 'win' : 'loss';
                                    try {
                                        DB.updateRankedPoints(p.ws.userId, outcome);
                                        console.log(`🏆 Ranked update: ${p.name} (ID ${p.ws.userId}) → ${outcome}`);
                                    } catch (err) {
                                        console.error(`Failed to update ranked points for ${p.name}:`, err);
                                    }

                                    // Award 1 random card for completing a ranked duel
                                    try {
                                        const rewardIds = pickRandomRewardCards(p.ws.userId, 1);
                                        if (rewardIds.length > 0) {
                                            const result = DB.addCardsToCollection(p.ws.userId, rewardIds);
                                            const rewardCards = rewardIds.map(id => {
                                                const card = serverCardDB.getCard(id);
                                                return card ? { id: card.id, name: card.name, region: card.region, type: card.type } : { id };
                                            });
                                            roomMgr.send(p.ws, 'CARDS_UNLOCKED', { cards: rewardCards, source: 'duel' });
                                            console.log(`🎁 Card reward: ${p.name} unlocked ${rewardIds.join(', ')}`);
                                        }
                                    } catch (err) {
                                        console.error(`Failed to award cards to ${p.name}:`, err);
                                    }
                                }
                            }
                        }

                        logMatchToCSV({
                            date: new Date().toISOString(),
                            duration,
                            rounds: gs.roundCounter,
                            turns: gs.turnCounter,
                            winner: gs.winner,
                            winnerName: matchData.winnerName,
                            player1Name: room.players[0]?.name,
                            player1Region: room.players[0]?.region,
                            player2Name: room.players[1]?.name,
                            player2Region: room.players[1]?.region,
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

                    // If next player is a bot, trigger its turn
                    if (room.botPlayer && gs.activePlayerIndex === room.botPlayer.playerId) {
                        setTimeout(() => triggerBotTurn(room, roomMgr), 600);
                    }
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

    // Check game over after any action (skip if already handled by END_TURN above)
    if (gs.gameOver && !room._gameOverHandled) {
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
            const duration = room.startedAt ? Math.round((Date.now() - room.startedAt) / 1000) : 0;
            const matchData = {
                winner: gs.winner,
                winnerName: gs.winner !== null ? gs.getPlayerById(gs.winner)?.name : null,
                duration,
                rounds: gs.roundCounter,
                turns: gs.turnCounter,
                players: room.players.map(p => ({ name: p.name, region: p.region, lp: gs.getPlayerById(p.id)?.lp ?? 0 })),
            };
            roomMgr.broadcast(room, 'GAME_OVER', matchData);
            logMatchToCSV({
                date: new Date().toISOString(),
                duration,
                rounds: gs.roundCounter,
                turns: gs.turnCounter,
                winner: gs.winner,
                winnerName: matchData.winnerName,
                player1Name: room.players[0]?.name,
                player1Region: room.players[0]?.region,
                player2Name: room.players[1]?.name,
                player2Region: room.players[1]?.region,
            });
        }
    }
}

// ─── Bot Turn Trigger ────────────────────────────────────────

async function triggerBotTurn(room, roomMgr) {
    if (!room.botPlayer) return;
    const gs = room.controller.gameState;
    if (gs.gameOver) return;
    if (gs.activePlayerIndex !== room.botPlayer.playerId) return;

    console.log(`🤖 Bot is taking its turn...`);
    await room.botPlayer.performTurn();

    // After bot turn, broadcast state
    broadcastGameState(room, roomMgr);

    if (gs.gameOver) {
        const duration = room.startedAt ? Math.round((Date.now() - room.startedAt) / 1000) : 0;
        const matchData = {
            winner: gs.winner,
            winnerName: gs.winner !== null ? gs.getPlayerById(gs.winner)?.name : null,
            duration,
            rounds: gs.roundCounter,
            turns: gs.turnCounter,
            players: room.players.map(p => ({ name: p.name, region: p.region, lp: gs.getPlayerById(p.id)?.lp ?? 0 })),
        };
        roomMgr.broadcast(room, 'GAME_OVER', matchData);
    } else {
        roomMgr.broadcast(room, 'TURN_CHANGE', {
            activePlayerId: gs.activePlayerIndex,
            round: gs.roundCounter,
            turn: gs.turnCounter,
        });
    }
}

// ─── Express + WebSocket Server ─────────────────────────────

const app = express();
const server = createServer(app);

// Allow cross-origin requests from the Netlify frontend
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Stripe webhook needs raw body for signature verification — must come BEFORE json parsing
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!stripe || !STRIPE_WEBHOOK_SECRET) {
        return res.status(503).json({ error: 'Stripe not configured.' });
    }
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('⚠ Stripe webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const { userId, cosmeticType, cosmeticId } = session.metadata || {};

        if (!userId || !cosmeticType || !cosmeticId) {
            console.error('⚠ Stripe webhook: missing metadata', session.metadata);
            return res.json({ received: true });
        }

        // Idempotency: skip if already processed
        const existing = DB.getPurchaseBySession(session.id);
        if (existing) {
            console.log(`🔁 Stripe webhook: session ${session.id} already processed, skipping.`);
            return res.json({ received: true });
        }

        // Grant the cosmetic
        DB.grantCosmetic(Number(userId), cosmeticType, cosmeticId);
        DB.logPurchase(Number(userId), session.id, cosmeticType, cosmeticId, session.amount_total || 0, session.currency || 'gbp');
        console.log(`💰 Purchase complete: User ${userId} bought ${cosmeticType}:${cosmeticId} (session ${session.id})`);
    }

    res.json({ received: true });
});

// JSON body parsing for API routes (after webhook route)
app.use(express.json());

// ─── Auth Middleware Helper ──────────────────────────────────

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not authenticated.' });
    }
    const token = authHeader.slice(7);
    const user = DB.getUserByToken(token);
    if (!user) return res.status(401).json({ error: 'Invalid or expired token.' });
    req.user = user;
    req.token = token;
    next();
}

// ─── REST API: Auth ──────────────────────────────────────────

app.post('/api/auth/register', (req, res) => {
    try {
        const { username, password, displayName, deviceLabel } = req.body;
        const result = DB.createUser(username, password, displayName, deviceLabel || '');
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/auth/login', (req, res) => {
    try {
        const { username, password, deviceLabel } = req.body;
        const result = DB.loginUser(username, password, deviceLabel || '');
        res.json(result);
    } catch (err) {
        res.status(401).json({ error: err.message });
    }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
    const profile = DB.getUserProfile(req.user.id);
    res.json(profile);
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
    DB.logout(req.token);
    res.json({ success: true });
});

app.post('/api/auth/link-code', authMiddleware, (req, res) => {
    try {
        const result = DB.generateLinkCode(req.user.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/link', (req, res) => {
    try {
        const { code, deviceLabel } = req.body;
        const result = DB.redeemLinkCode(code, deviceLabel || '');
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ─── REST API: Decks ─────────────────────────────────────────

app.get('/api/decks', authMiddleware, (req, res) => {
    const decks = DB.getUserDecks(req.user.id);
    res.json(decks);
});

app.post('/api/decks', authMiddleware, (req, res) => {
    try {
        const { name, region, cardIds, deckId } = req.body;
        const result = DB.saveUserDeck(req.user.id, name, region, cardIds, deckId || null);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/decks/:id', authMiddleware, (req, res) => {
    const success = DB.deleteUserDeck(req.user.id, parseInt(req.params.id));
    res.json({ success });
});

// ─── REST API: Collection ────────────────────────────────────

app.get('/api/collection', authMiddleware, (req, res) => {
    const collection = DB.getCollection(req.user.id);
    res.json(collection);
});

app.post('/api/collection/choose-region', authMiddleware, (req, res) => {
    try {
        const { region } = req.body;
        const validRegions = ['Northern', 'Eastern', 'Southern', 'Western'];
        if (!validRegions.includes(region)) {
            return res.status(400).json({ error: 'Invalid region.' });
        }

        // Check if user already chose a region
        const existing = DB.getChosenRegion(req.user.id);
        if (existing) {
            return res.status(400).json({ error: 'Region already chosen.' });
        }

        // Get all cards in the chosen region from the server-level card DB
        const regionCards = serverCardDB.getCardsByRegion(region)
            .filter(c => c.type !== 'Token' && c.quantity > 0)
            .map(c => c.id);

        const result = DB.grantStarterCards(req.user.id, region, regionCards);
        const collection = DB.getCollection(req.user.id);
        res.json({ region, collection, granted: result.added });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── REST API: Leaderboard & Profile ─────────────────────────

app.get('/api/leaderboard', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const board = DB.getLeaderboard(limit);
    res.json(board);
});

app.get('/api/profile', authMiddleware, (req, res) => {
    const profile = DB.getUserProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });
    res.json(profile);
});

// ─── REST API: Cosmetics Store ───────────────────────────────

app.get('/api/store/catalog', (req, res) => {
    res.json(STORE_CATALOG);
});

app.get('/api/store/owned', authMiddleware, (req, res) => {
    const owned = DB.getUserCosmetics(req.user.id);
    res.json(owned);
});

app.post('/api/store/checkout', authMiddleware, async (req, res) => {
    if (!stripe) {
        return res.status(503).json({ error: 'Store purchases are not available yet. Stripe is not configured.' });
    }
    try {
        const { cosmeticType, cosmeticId } = req.body;
        if (!cosmeticType || !cosmeticId) {
            return res.status(400).json({ error: 'Missing cosmeticType or cosmeticId.' });
        }

        // Find the item in the catalog
        const item = STORE_CATALOG.find(c => c.type === cosmeticType && c.id === cosmeticId);
        if (!item) {
            return res.status(404).json({ error: 'Item not found in store catalog.' });
        }

        // Check if already owned
        if (DB.ownsCosmetic(req.user.id, cosmeticType, cosmeticId)) {
            return res.status(409).json({ error: 'You already own this item.' });
        }

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: item.currency,
                    product_data: {
                        name: item.name,
                        description: `${item.type.charAt(0).toUpperCase() + item.type.slice(1)} — Battle Among Regions`,
                    },
                    unit_amount: item.price,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${CLIENT_URL}?purchase=success&item=${cosmeticId}`,
            cancel_url: `${CLIENT_URL}?purchase=cancelled`,
            metadata: {
                userId: String(req.user.id),
                cosmeticType,
                cosmeticId,
            },
        });

        res.json({ url: session.url });
    } catch (err) {
        console.error('Stripe checkout error:', err);
        res.status(500).json({ error: 'Failed to create checkout session.' });
    }
});

// ─── Static Files ────────────────────────────────────────────

// Serve static files from dist (built game)
app.use(express.static(join(PROJECT_ROOT, 'dist')));

// Also serve card images and CSV from project root
app.use('/output', express.static(join(PROJECT_ROOT, 'dist', 'output')));
app.use('/card_dataV4.4.csv', (req, res) => {
    res.sendFile(join(PROJECT_ROOT, 'card_dataV4.4.csv'));
});

// Serve match history CSV for download
app.get('/api/match-history.csv', (req, res) => {
    if (existsSync(MATCH_LOG_PATH)) {
        res.download(MATCH_LOG_PATH, 'match_history.csv');
    } else {
        res.status(404).send('No match history yet.');
    }
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
    csvText = readFileSync(join(PROJECT_ROOT, 'card_dataV4.4.csv'), 'utf-8');
    console.log('✅ Card data loaded for server.');
} catch (err) {
    console.error('❌ Failed to load card_dataV4.4.csv:', err.message);
    process.exit(1);
}

// Server-level card database for collection operations
const serverCardDB = new CardDatabase();
await serverCardDB.loadFromCSV(csvText);

/**
 * Pick N random playable cards that the user hasn't maxed (3 copies) yet.
 * @param {number} userId
 * @param {number} count
 * @returns {string[]} array of card IDs
 */
function pickRandomRewardCards(userId, count) {
    const collection = DB.getCollection(userId);
    const ownedMap = {};
    for (const entry of collection) ownedMap[entry.card_id] = entry.count;

    const allPlayable = serverCardDB.getAllPlayableCards();
    const eligible = allPlayable.filter(c => (ownedMap[c.id] || 0) < 3);
    if (eligible.length === 0) return [];

    const picked = [];
    const shuffled = [...eligible].sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(count, shuffled.length); i++) {
        picked.push(shuffled[i].id);
    }
    return picked;
}

wss.on('connection', (ws) => {
    console.log('🔌 New WebSocket connection');
    ws.userId = null;       // Authenticated user ID (null = guest)
    ws.displayName = null;  // Authenticated display name

    ws.on('message', async (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        } catch (e) {
            roomMgr.send(ws, 'ERROR', { message: 'Invalid JSON.' });
            return;
        }

        // ─── WebSocket Auth ──────────────────────────────
        if (msg.type === 'AUTH') {
            const user = DB.getUserByToken(msg.token);
            if (user) {
                ws.userId = user.id;
                ws.displayName = user.display_name;
                roomMgr.send(ws, 'AUTH_OK', { userId: user.id, displayName: user.display_name });
                console.log(`🔑 WebSocket authenticated: ${user.display_name} (ID ${user.id})`);
            } else {
                roomMgr.send(ws, 'AUTH_FAIL', { message: 'Invalid token.' });
            }
            return;
        }

        switch (msg.type) {
            case 'FIND_MATCH': {
                const name = msg.playerName || 'Player';
                roomMgr.addToQueue(ws, name, msg.cosmetics || null);
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
                            opponentCosmetics: opp.cosmetics || null,
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

            case 'FIND_DUEL_MATCH': {
                const name = msg.playerName || 'Player';
                roomMgr.addToDuelQueue(ws, name, msg.cosmetics || null);
                roomMgr.send(ws, 'SEARCHING', { message: 'Looking for a duel opponent...' });
                console.log(`🔍 ${name} is searching for a duel match (queue: ${roomMgr.duelMatchQueue.length})`);

                const matched = roomMgr.tryDuelMatchFromQueue();
                if (matched) {
                    // Notify both players — they now choose region + deck
                    for (const p of matched.players) {
                        const opp = matched.players.find(op => op.id !== p.id);
                        roomMgr.send(p.ws, 'DUEL_MATCH_FOUND', {
                            opponentName: opp.name,
                        });
                    }
                    console.log(`⚔ Duel match found: ${matched.players.map(p => p.name).join(' vs ')} — awaiting deck selections`);
                }
                break;
            }

            case 'CANCEL_DUEL_MATCH': {
                roomMgr.removeFromDuelQueue(ws);
                roomMgr.send(ws, 'MATCH_CANCELLED', { message: 'Duel search cancelled.' });
                console.log(`❌ Player cancelled duel match search`);
                break;
            }

            case 'DUEL_DECK_SELECTED': {
                const room = roomMgr.getRoomByWs(ws);
                if (!room || room.phase !== 'DUEL_DECK_SELECT') {
                    roomMgr.send(ws, 'ERROR', { message: 'Not in deck selection phase.' });
                    break;
                }

                const player = roomMgr.getPlayerInRoom(room, ws);
                if (!player) break;

                const region = msg.region;
                const validRegions = ['Northern', 'Eastern', 'Southern', 'Western'];
                if (!validRegions.includes(region)) {
                    roomMgr.send(ws, 'ERROR', { message: 'Invalid region.' });
                    break;
                }

                // Validate landmark region constraint
                let deckCardIds = msg.deckCardIds || null;
                if (deckCardIds && Array.isArray(deckCardIds)) {
                    // Load card DB to check landmarks
                    const { CardDatabase } = await import('../src/engine/CardDatabase.js');
                    const tempDB = new CardDatabase();
                    tempDB.loadFromCSV(csvText);

                    const invalidLandmarks = deckCardIds.filter(id => {
                        const card = tempDB.getCard(id);
                        return card && card.type === 'Landmark' && card.region !== region;
                    });

                    if (invalidLandmarks.length > 0) {
                        roomMgr.send(ws, 'ERROR', { message: `Deck contains landmarks from a different region. All landmarks must be from ${region}.` });
                        break;
                    }
                }

                // Store selection
                player.region = region;
                player.deckCardIds = deckCardIds;
                if (msg.cosmetics) player.cosmetics = msg.cosmetics;
                room.duelDeckSelections[player.id] = { region, deckCardIds };

                // Tell this player to wait
                roomMgr.send(ws, 'GAME_PHASE', { phase: 'WAITING', message: 'Waiting for opponent to select their deck...' });

                // Check if both players are ready
                if (Object.keys(room.duelDeckSelections).length >= 2) {
                    // Notify both players of final matchup
                    for (const p of room.players) {
                        const opp = room.players.find(op => op.id !== p.id);
                        roomMgr.send(p.ws, 'MATCH_FOUND', {
                            yourRegion: p.region,
                            opponentName: opp.name,
                            opponentRegion: opp.region,
                            opponentCosmetics: opp.cosmetics || null,
                        });
                    }

                    console.log(`⚔ Duel decks confirmed: ${room.players.map(p => `${p.name} (${p.region})`).join(' vs ')}`);

                    try {
                        await startGame(room, roomMgr, csvText);
                    } catch (err) {
                        console.error('Failed to start duel game:', err);
                        roomMgr.broadcast(room, 'ERROR', { message: 'Failed to start game: ' + err.message });
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
                room.players[0].cosmetics = msg.cosmetics || null;
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
                    // Store joiner's cosmetics
                    const joiner = room.players.find(p => p.ws === ws);
                    if (joiner) joiner.cosmetics = msg.cosmetics || null;
                    // Enter deck selection phase — let players pick region + deck
                    room.phase = 'DUEL_DECK_SELECT';
                    room.duelDeckSelections = {};

                    // Notify both players to choose their deck
                    for (const p of room.players) {
                        const opp = room.players.find(op => op.id !== p.id);
                        roomMgr.send(p.ws, 'DUEL_MATCH_FOUND', {
                            opponentName: opp.name,
                            opponentCosmetics: opp.cosmetics || null,
                        });
                    }

                    console.log(`🎮 Room ${code}: ${room.players.map(p => p.name).join(' vs ')} — Deck selection phase`);
                }
                break;
            }

            case 'PLAY_VS_AI': {
                // Create a room with a bot opponent
                const aiRoom = roomMgr.createRoom(ws, msg.playerName || 'Player');

                // Create bot socket and add bot as player 2
                const botSocket = BotPlayer.createSocket();
                const botName = msg.aiName || 'AI Opponent';
                const botJoin = roomMgr.joinRoom(aiRoom.code, botSocket, botName);
                if (botJoin.error) {
                    roomMgr.send(ws, 'ERROR', { message: 'Failed to create AI room: ' + botJoin.error });
                    break;
                }

                const room = botJoin.room;

                // Assign regions — human gets their chosen region or random, bot gets another
                if (msg.region) {
                    room.players[0].region = msg.region;
                    const allRegions = ['Northern', 'Eastern', 'Southern', 'Western'].filter(r => r !== msg.region);
                    room.players[1].region = allRegions[Math.floor(Math.random() * allRegions.length)];
                } else {
                    roomMgr.assignRandomRegions(room);
                }

                // Create and attach bot
                const difficulty = msg.difficulty || 'medium';
                const bot = new BotPlayer(1, difficulty);
                const humanP = room.players[0];
                const botP = room.players[1];

                // Mark bot BEFORE startGame so landmark/mulligan checks see it
                botP.isBot = true;
                room.botPlayer = bot;

                // Notify human player
                roomMgr.send(humanP.ws, 'MATCH_FOUND', {
                    yourRegion: humanP.region,
                    opponentName: botP.name,
                    opponentRegion: botP.region,
                });

                console.log(`🤖 AI game: ${humanP.name} (${humanP.region}) vs ${botP.name} (${botP.region}) [${difficulty}]`);

                try {
                    await startGame(room, roomMgr, csvText);
                    // Attach bot AFTER startGame wires the controller (creates AIPlayer)
                    bot.attach(room);
                } catch (err) {
                    console.error('Failed to start AI game:', err);
                    roomMgr.send(ws, 'ERROR', { message: 'Failed to start game: ' + err.message });
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

            case 'FIND_WAR_MATCH': {
                const name = msg.playerName || 'Player';
                warRoomMgr.addToWarQueue(ws, name);
                warRoomMgr.send(ws, 'WAR_SEARCHING', { message: 'Looking for a war opponent...' });
                console.log(`🔍 ${name} is searching for a war match (queue: ${warRoomMgr.warMatchQueue.length})`);

                const warMatched = warRoomMgr.tryWarMatchFromQueue();
                if (warMatched) {
                    console.log(`⚔ War match found: ${warMatched.players.map(p => `${p.name} (${p.region})`).join(' vs ')}`);
                }
                break;
            }

            case 'CANCEL_WAR_MATCH': {
                warRoomMgr.removeFromWarQueue(ws);
                warRoomMgr.send(ws, 'WAR_MATCH_CANCELLED', { message: 'War search cancelled.' });
                console.log(`❌ Player cancelled war match search`);
                break;
            }

            case 'WAR_DRAFT_SYNC': {
                const warRoom = warRoomMgr.getWarRoomByWs(ws);
                if (warRoom) {
                    warRoomMgr.handleDraftSync(warRoom, ws, msg.pool1Ids || [], msg.pool2Ids || [], msg.extraPools || []);
                }
                break;
            }

            case 'WAR_DECK_READY': {
                const warRoom = warRoomMgr.getWarRoomByWs(ws);
                if (warRoom) {
                    warRoomMgr.handleDeckReady(warRoom, ws, msg.cardIds || []);
                }
                break;
            }

            case 'WAR_READY_CHECK': {
                const warRoom = warRoomMgr.getWarRoomByWs(ws);
                if (warRoom) {
                    const ready = warRoomMgr.handleReadyCheck(warRoom, ws);
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
        roomMgr.removeFromDuelQueue(ws);
        roomMgr.removePlayer(ws);
        warRoomMgr.removeFromWarQueue(ws);
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
