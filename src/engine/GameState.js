// ─────────────────────────────────────────────────────────────
// GameState.js — Central game state management
// ─────────────────────────────────────────────────────────────

export const PHASES = {
    SETUP: 'SETUP',
    MULLIGAN: 'MULLIGAN',
    DRAW: 'DRAW',
    MAIN1: 'MAIN1',
    BATTLE: 'BATTLE',
    MAIN2: 'MAIN2',
    END: 'END',
    GAME_OVER: 'GAME_OVER',
};

export const POSITIONS = {
    ATK: 'ATK',
    DEF: 'DEF',
};

export class PlayerState {
    constructor(id, name, region) {
        this.id = id;
        this.name = name;
        this.region = region;
        this.lp = 3000;
        this.primaryMana = 0;
        this.spellMana = 0;
        this.hand = [];        // CardInstance[]
        this.deck = [];        // CardInstance[]
        this.graveyard = [];   // CardInstance[]
        this.unitZone = [null, null, null, null, null];       // 5 slots
        this.spellTrapZone = [null, null, null, null, null];  // 5 slots
        this.landmarkZone = null;  // 1 slot
        this.unitsSummonedThisTurn = 0;
        this.spellsPlayedThisTurn = 0;
        this.isAlive = true;
        this.hasMulliganed = false;
    }

    getFieldUnits() {
        return this.unitZone.filter(u => u !== null);
    }

    getSetCards() {
        return this.spellTrapZone.filter(c => c !== null);
    }

    getFaceDownCards() {
        return this.spellTrapZone.filter(c => c !== null && !c.faceUp);
    }

    getEmptyUnitSlot() {
        return this.unitZone.findIndex(s => s === null);
    }

    getEmptySpellTrapSlot() {
        return this.spellTrapZone.findIndex(s => s === null);
    }

    getTotalMana() {
        return this.primaryMana + this.spellMana;
    }
}

export class GameState {
    constructor() {
        this.players = [];
        this.activePlayerIndex = 0;
        this.roundCounter = 0;
        this.turnCounter = 0;
        this.phase = PHASES.SETUP;
        this.isFirstTurn = true;
        this.startingPlayerIndex = 0;
        this.gameMode = 'duel'; // 'duel', 'regional', 'campaign'
        this.eventLog = [];
        this.pendingActions = [];
        this.battleState = null; // Tracks current battle resolution
        this.waitingForTarget = null; // { effectId, validTargets, callback }
        this.waitingForChoice = null; // { options, callback }
        this.chainStack = []; // For trap chaining
        this.listeners = new Map(); // Event listeners
        this.gameOver = false;
        this.winner = null;
    }

    /**
     * Initialize a new game with players
     */
    init(playerConfigs, options = {}) {
        this.players = playerConfigs.map((cfg, i) =>
            new PlayerState(i, cfg.name, cfg.region)
        );

        this.gameMode = options.gameMode || 'duel';
        const startingLP = options.startingLP || 3000;
        this.players.forEach(p => p.lp = startingLP);

        // Determine starting player (random)
        this.startingPlayerIndex = options.startingPlayer ?? Math.floor(Math.random() * this.players.length);
        this.activePlayerIndex = this.startingPlayerIndex;
        this.roundCounter = 0;
        this.turnCounter = 0;
        this.phase = PHASES.SETUP;
        this.gameOver = false;
        this.winner = null;

        this.log('GAME_INIT', `Game initialized: ${this.players.map(p => `${p.name} (${p.region})`).join(' vs ')}`);
        return this;
    }

    // ─── Accessors ────────────────────────────────────────────

    getActivePlayer() {
        return this.players[this.activePlayerIndex];
    }

    getOpponents(playerId) {
        return this.players.filter(p => p.id !== playerId && p.isAlive);
    }

    getOpponent(playerId) {
        // For 2-player, returns the single opponent
        const opponents = this.getOpponents(playerId);
        return opponents[0] || null;
    }

    getPlayerById(id) {
        return this.players[id] || null;
    }

    getAlivePlayers() {
        return this.players.filter(p => p.isAlive);
    }

    isPlayersTurn(playerId) {
        return this.activePlayerIndex === playerId;
    }

    // ─── State Queries ────────────────────────────────────────

    /**
     * Get all units on the field for a player
     */
    getFieldUnits(playerId) {
        const player = this.getPlayerById(playerId);
        return player ? player.getFieldUnits() : [];
    }

    /**
     * Get all units on the field (all players)
     */
    getAllFieldUnits() {
        return this.players.flatMap(p => p.getFieldUnits());
    }

    /**
     * Find a card instance anywhere on the field
     */
    findCardOnField(instanceId) {
        for (const player of this.players) {
            for (let i = 0; i < 5; i++) {
                if (player.unitZone[i]?.instanceId === instanceId) {
                    return { card: player.unitZone[i], zone: 'unit', index: i, player };
                }
                if (player.spellTrapZone[i]?.instanceId === instanceId) {
                    return { card: player.spellTrapZone[i], zone: 'spellTrap', index: i, player };
                }
            }
            if (player.landmarkZone?.instanceId === instanceId) {
                return { card: player.landmarkZone, zone: 'landmark', index: 0, player };
            }
        }
        return null;
    }

    /**
     * Find a card instance in a player's hand
     */
    findCardInHand(playerId, instanceId) {
        const player = this.getPlayerById(playerId);
        if (!player) return null;
        return player.hand.find(c => c.instanceId === instanceId) || null;
    }

    // ─── Event Logging ────────────────────────────────────────

    log(type, message, data = null) {
        const entry = {
            turn: this.turnCounter,
            round: this.roundCounter,
            phase: this.phase,
            type,
            message,
            data,
            timestamp: Date.now(),
        };
        this.eventLog.push(entry);
        this.emit('LOG', entry);
    }

    // ─── Event System ─────────────────────────────────────────

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
        return () => this.off(event, callback);
    }

    off(event, callback) {
        const cbs = this.listeners.get(event);
        if (cbs) {
            const idx = cbs.indexOf(callback);
            if (idx >= 0) cbs.splice(idx, 1);
        }
    }

    emit(event, data) {
        const cbs = this.listeners.get(event) || [];
        for (const cb of cbs) {
            cb(data);
        }
    }

    // ─── Serialization ────────────────────────────────────────

    toJSON() {
        return {
            players: this.players,
            activePlayerIndex: this.activePlayerIndex,
            roundCounter: this.roundCounter,
            turnCounter: this.turnCounter,
            phase: this.phase,
            gameMode: this.gameMode,
            gameOver: this.gameOver,
            winner: this.winner,
        };
    }
}
