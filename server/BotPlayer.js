// ─────────────────────────────────────────────────────────────
// BotPlayer.js — Server-side AI bot that plays in online rooms
// ─────────────────────────────────────────────────────────────

import { AIPlayer } from '../src/engine/AIPlayer.js';

/**
 * A fake WebSocket that discards all messages.
 * Used so the bot can sit in a room's players[] array
 * without breaking roomMgr.send() / roomMgr.broadcast().
 */
class NullSocket {
    constructor() {
        this.readyState = 1; // WebSocket.OPEN
    }
    send() { /* discard */ }
    close() { this.readyState = 3; }
}

/**
 * BotPlayer — wraps AIPlayer and integrates it into a game room.
 *
 * After startGame() wires the controller callbacks, call
 * botPlayer.attach(room) to hook the bot into the game flow.
 */
export class BotPlayer {
    /**
     * @param {number} playerId — The bot's player ID in the room (usually 1)
     * @param {'easy'|'medium'|'hard'} difficulty
     */
    constructor(playerId, difficulty = 'medium') {
        this.playerId = playerId;
        this.difficulty = difficulty;
        this.ai = null;          // Set after attach()
        this.room = null;
        this._turnInProgress = false;
    }

    /** Create a NullSocket for the bot to occupy a room player slot. */
    static createSocket() {
        return new NullSocket();
    }

    /**
     * Attach the bot to a room AFTER the controller is set up.
     * Creates the AIPlayer instance bound to the room's controller.
     */
    attach(room) {
        this.room = room;
        this.ai = new AIPlayer(room.controller, this.playerId, this.difficulty);
        // Reduce delays for server-side bot (no human watching AI card-by-card)
        this.ai.actionDelay = 300;

        // Mark the bot player in the room
        const botP = room.players.find(p => p.id === this.playerId);
        if (botP) botP.isBot = true;

        // Store reference on the room
        room.botPlayer = this;
    }

    /**
     * Auto-select a landmark for the bot.
     * Returns selection object matching the server SELECT_LANDMARK format.
     */
    chooseLandmark(landmarks) {
        if (!landmarks || landmarks.length === 0) {
            return { skip: true };
        }
        // Pick the first available landmark (same logic as AIPlayer.chooseLandmark)
        const card = landmarks[0];
        if (card) {
            return { cardInstanceId: card.instanceId };
        }
        return { skip: true };
    }

    /**
     * Auto-mulligan for the bot.
     * Returns array of instanceIds to replace.
     */
    chooseMulligan(hand) {
        if (!hand || hand.length === 0) return [];
        // Mulligan cards costing >4 mana (same logic as AIPlayer.chooseMulligan)
        if (this.difficulty === 'easy') return [];
        return hand
            .filter(c => c.manaCost > 4)
            .map(c => c.instanceId);
    }

    /**
     * Auto-select a target for the bot.
     */
    chooseTarget(targets, description) {
        const chosen = this.ai.chooseTarget(targets, description);
        return chosen;
    }

    /**
     * Auto-select a choice for the bot.
     */
    chooseOption(options, description) {
        return this.ai.chooseOption(options, description);
    }

    /**
     * Run the bot's full turn. Called when it becomes the bot's turn.
     */
    async performTurn() {
        if (this._turnInProgress) return;
        this._turnInProgress = true;
        try {
            await this.ai.performTurn();
        } catch (err) {
            console.error('Bot turn error:', err);
            // Safety: try to end the turn so the game doesn't get stuck
            try {
                const gs = this.room.controller.gameState;
                if (!gs.gameOver && gs.activePlayerIndex === this.playerId) {
                    await this.room.controller.endTurn();
                }
            } catch (e) {
                console.error('Bot recovery endTurn failed:', e);
            }
        } finally {
            this._turnInProgress = false;
        }
    }
}
