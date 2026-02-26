// ─────────────────────────────────────────────────────────────
// TurnManager.js — Phase sequencing and turn flow
// ─────────────────────────────────────────────────────────────

import { PHASES } from './GameState.js';
import { EFFECT_EVENTS } from './EffectEngine.js';

export class TurnManager {
    /**
     * @param {import('./GameState.js').GameState} gameState
     * @param {import('./ManaSystem.js').ManaSystem} manaSystem
     * @param {import('./EffectEngine.js').EffectEngine} effectEngine
     * @param {import('./CombatEngine.js').CombatEngine} combatEngine
     */
    constructor(gameState, manaSystem, effectEngine, combatEngine) {
        this.gameState = gameState;
        this.manaSystem = manaSystem;
        this.effectEngine = effectEngine;
        this.combatEngine = combatEngine;
    }

    // ─── Game Start ───────────────────────────────────────────

    /**
     * Begin the game — deal starting hands
     */
    async startGame() {
        const gs = this.gameState;

        // Shuffle all decks
        for (const player of gs.players) {
            this.effectEngine.shuffleDeck(player.id);
        }

        // Starting player draws 5, second player draws 6
        for (let i = 0; i < gs.players.length; i++) {
            const playerIdx = (gs.startingPlayerIndex + i) % gs.players.length;
            const drawCount = i === 0 ? 5 : 6;
            this.effectEngine.drawCards(playerIdx, drawCount);
        }

        gs.phase = PHASES.MULLIGAN;
        gs.log('PHASE', 'Mulligan phase — players may exchange cards.');
        gs.emit('PHASE_CHANGED', { phase: PHASES.MULLIGAN });
    }

    /**
     * Perform mulligan for a player
     * @param {number} playerId
     * @param {string[]} cardInstanceIds — IDs of cards to mulligan
     */
    async performMulligan(playerId, cardInstanceIds) {
        const player = this.gameState.getPlayerById(playerId);
        if (!player || player.hasMulliganed) return;

        if (cardInstanceIds.length > 0) {
            // Remove selected cards from hand, shuffle into deck
            const kept = [];
            const returned = [];
            for (const card of player.hand) {
                if (cardInstanceIds.includes(card.instanceId)) {
                    returned.push(card);
                } else {
                    kept.push(card);
                }
            }
            player.hand = kept;
            player.deck.push(...returned);
            this.effectEngine.shuffleDeck(playerId);

            // Draw the same number of new cards
            this.effectEngine.drawCards(playerId, returned.length);
            this.gameState.log('MULLIGAN', `${player.name} mulliganed ${returned.length} cards.`);
        } else {
            this.gameState.log('MULLIGAN', `${player.name} keeps their hand.`);
        }

        player.hasMulliganed = true;
    }

    /**
     * Check if all players have mulliganed, then start the game
     */
    async checkMulliganComplete() {
        const allDone = this.gameState.players.every(p => p.hasMulliganed);
        if (allDone) {
            await this.startFirstTurn();
        }
    }

    // ─── Turn Flow ────────────────────────────────────────────

    /**
     * Start the very first turn
     */
    async startFirstTurn() {
        const gs = this.gameState;
        gs.activePlayerIndex = gs.startingPlayerIndex;
        gs.turnCounter = 1;
        gs.roundCounter = 1;
        gs.isFirstTurn = true;

        await this._startDrawPhase(true); // Skip draw on first turn
    }

    /**
     * Advance to the next turn
     */
    async nextTurn() {
        const gs = this.gameState;
        if (gs.gameOver) return;

        // Switch active player
        const prevPlayer = gs.activePlayerIndex;
        gs.activePlayerIndex = (gs.activePlayerIndex + 1) % gs.players.length;

        // Skip eliminated players
        while (!gs.players[gs.activePlayerIndex].isAlive) {
            gs.activePlayerIndex = (gs.activePlayerIndex + 1) % gs.players.length;
            if (gs.activePlayerIndex === prevPlayer) break; // All eliminated
        }

        gs.turnCounter++;

        // Increment round counter when it wraps back to starting player
        if (gs.activePlayerIndex === gs.startingPlayerIndex) {
            gs.roundCounter++;
        }

        gs.isFirstTurn = false;

        // Reset per-turn state for all units on this player's field
        const activePlayer = gs.getActivePlayer();
        for (const unit of activePlayer.getFieldUnits()) {
            unit.hasAttackedThisTurn = false;
            unit.attackCount = 0;
            unit.summonedThisTurn = false;
            unit.hasChangedPositionThisTurn = false;
        }
        activePlayer.unitsSummonedThisTurn = 0;
        activePlayer.spellsPlayedThisTurn = 0;

        // Reset "once per round" flags for all units when round changes
        if (gs.activePlayerIndex === gs.startingPlayerIndex) {
            for (const player of gs.players) {
                for (const unit of player.getFieldUnits()) {
                    unit.activatedThisRound = false;
                }
            }
        }

        gs.log('TURN', `=== Turn ${gs.turnCounter} — ${activePlayer.name}'s turn (Round ${gs.roundCounter}) ===`);
        gs.emit('TURN_STARTED', { playerId: gs.activePlayerIndex, turn: gs.turnCounter, round: gs.roundCounter });

        await this._startDrawPhase(false);
    }

    /**
     * Draw Phase
     */
    async _startDrawPhase(skipDraw = false) {
        const gs = this.gameState;
        const player = gs.getActivePlayer();

        gs.phase = PHASES.DRAW;
        gs.emit('PHASE_CHANGED', { phase: PHASES.DRAW });

        // 1. Save unspent mana to spell-mana pool
        this.manaSystem.saveSpellMana(player.id);

        // 2. Set primary mana for the turn
        this.manaSystem.gainMana(player.id);

        // 3. Trigger turn start effects
        await this.effectEngine.trigger(EFFECT_EVENTS.ON_TURN_START, {
            activePlayer: player,
        });

        // 4. Draw 1 card (skip on very first turn)
        if (!skipDraw) {
            this.effectEngine.drawCards(player.id, 1);
        }

        if (gs.gameOver) return;

        // Auto-advance to Main Phase 1
        await this._startMainPhase1();
    }

    /**
     * Main Phase 1
     */
    async _startMainPhase1() {
        const gs = this.gameState;
        gs.phase = PHASES.MAIN1;
        gs.log('PHASE', `Main Phase 1`);
        gs.emit('PHASE_CHANGED', { phase: PHASES.MAIN1 });
        // Player actions are handled via the GameController
    }

    /**
     * Battle Phase
     */
    async startBattlePhase() {
        const gs = this.gameState;
        if (gs.phase !== PHASES.MAIN1 && gs.phase !== PHASES.MAIN2) return;

        // Can't battle on the very first turn of the game
        if (gs.isFirstTurn) {
            gs.log('PHASE', 'Cannot enter Battle Phase on the first turn.');
            return false;
        }

        gs.phase = PHASES.BATTLE;
        gs.log('PHASE', 'Battle Phase');
        gs.emit('PHASE_CHANGED', { phase: PHASES.BATTLE });

        // Trigger battle phase start effects
        await this.effectEngine.trigger(EFFECT_EVENTS.ON_BATTLE_PHASE_START, {
            activePlayer: gs.getActivePlayer(),
        });

        return true;
    }

    /**
     * End Battle Phase → Main Phase 2
     */
    async endBattlePhase() {
        const gs = this.gameState;
        if (gs.phase !== PHASES.BATTLE) return;

        gs.phase = PHASES.MAIN2;
        gs.log('PHASE', 'Main Phase 2');
        gs.emit('PHASE_CHANGED', { phase: PHASES.MAIN2 });
    }

    /**
     * End Phase
     */
    async startEndPhase() {
        const gs = this.gameState;
        gs.phase = PHASES.END;
        gs.log('PHASE', 'End Phase');
        gs.emit('PHASE_CHANGED', { phase: PHASES.END });

        const player = gs.getActivePlayer();

        // Trigger end-of-turn effects
        await this.effectEngine.trigger(EFFECT_EVENTS.ON_TURN_END, {
            activePlayer: player,
        });

        // Check for units with end-of-turn effects
        for (const unit of player.getFieldUnits()) {
            if (unit.silenced) continue;

            // S012: Obsidian Guard — deal 200 to ALL players
            if (unit.cardId === 'S012') {
                for (const p of gs.players) {
                    if (p.isAlive) {
                        this.effectEngine.dealDamageToLP(p.id, 200, 'Obsidian Guard');
                    }
                }
            }
            // S016: Firebreather Nomad — deal 100 to ALL other units
            if (unit.cardId === 'S016') {
                for (const p of gs.players) {
                    for (const u of p.getFieldUnits()) {
                        if (u.instanceId !== unit.instanceId) {
                            this.effectEngine.dealDamageToUnit(u, 100, 'Firebreather Nomad');
                        }
                    }
                }
                // Check for destroyed units
                await this._checkDestroyedUnits();
            }
            // N025: Aurora Sentinel — +100 DEF to adjacent unit
            if (unit.cardId === 'N025') {
                const slotIdx = player.unitZone.indexOf(unit);
                if (slotIdx >= 0) {
                    const adjacent = [slotIdx - 1, slotIdx + 1]
                        .filter(i => i >= 0 && i < 5 && player.unitZone[i])
                        .map(i => player.unitZone[i]);
                    if (adjacent.length > 0) {
                        // Apply to the first adjacent unit (or could request target)
                        this.effectEngine.applyPermStatMod(adjacent[0], 0, 100, 'Aurora Sentinel');
                    }
                }
            }
        }

        // S017: Executioner — must have attacked or be destroyed
        for (const unit of player.getFieldUnits()) {
            if (unit.cardId === 'S017' && !unit.silenced && !unit.hasAttackedThisTurn) {
                this.gameState.log('EFFECT', `Executioner did not attack this turn and is destroyed!`);
                await this.effectEngine.destroyUnit(unit);
            }
        }

        // S013: Reckless Berserker — loses 200 DEF at turn start (handled here for simplicity)
        for (const unit of player.getFieldUnits()) {
            if (unit.cardId === 'S013' && !unit.silenced) {
                this.effectEngine.applyPermStatMod(unit, 0, -200, 'Reckless Berserker decay');
                if (unit.currentDEF - unit.damageTaken <= 0) {
                    await this.effectEngine.destroyUnit(unit);
                }
            }
        }

        // Clear temporary effects
        this.effectEngine.clearTempEffects();

        // Discard to 8 cards
        await this._enforceHandLimit(player);

        if (gs.gameOver) return;

        // Transition to next turn
        await this.nextTurn();
    }

    /**
     * Enforce max hand size of 8
     */
    async _enforceHandLimit(player) {
        while (player.hand.length > 8) {
            // Need to request player to choose which card to discard
            if (this.effectEngine.onChoiceRequired) {
                const card = await this.effectEngine.requestChoice(
                    player.hand.map(c => ({ label: c.name, value: c.instanceId, cardId: c.cardId })),
                    `Discard to 8 cards (currently ${player.hand.length})`
                );
                if (card) {
                    const idx = player.hand.findIndex(c => c.instanceId === card.value);
                    if (idx >= 0) {
                        const discarded = player.hand.splice(idx, 1)[0];
                        player.graveyard.push(discarded);
                        this.gameState.log('DISCARD', `${player.name} discards ${discarded.name}.`);
                    }
                }
            } else {
                // Auto-discard last card
                const discarded = player.hand.pop();
                player.graveyard.push(discarded);
                this.gameState.log('DISCARD', `${player.name} discards ${discarded.name}.`);
            }
        }
    }

    /**
     * Check and destroy any units that have taken lethal damage
     */
    async _checkDestroyedUnits() {
        for (const player of this.gameState.players) {
            for (const unit of [...player.getFieldUnits()]) {
                if (unit.damageTaken >= unit.currentDEF) {
                    await this.effectEngine.destroyUnit(unit);
                }
            }
        }
    }

    /**
     * End the current turn (called by player action)
     */
    async endTurn() {
        const gs = this.gameState;
        if (gs.phase === PHASES.BATTLE) {
            await this.endBattlePhase();
        }
        if (gs.phase === PHASES.MAIN1 || gs.phase === PHASES.MAIN2) {
            await this.startEndPhase();
        }
    }
}
