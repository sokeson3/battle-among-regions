// ─────────────────────────────────────────────────────────────
// EffectEngine.js — Event-driven card effect system
// ─────────────────────────────────────────────────────────────

export const EFFECT_EVENTS = {
    ON_SUMMON: 'ON_SUMMON',
    ON_DESTROY: 'ON_DESTROY',
    ON_SELF_DESTROY: 'ON_SELF_DESTROY',
    ON_ATTACK_DECLARE: 'ON_ATTACK_DECLARE',
    ON_ATTACK_RESOLVE: 'ON_ATTACK_RESOLVE',
    ON_DAMAGE_TO_LP: 'ON_DAMAGE_TO_LP',
    ON_DAMAGE_TO_UNIT: 'ON_DAMAGE_TO_UNIT',
    ON_SPELL_ACTIVATE: 'ON_SPELL_ACTIVATE',
    ON_TRAP_ACTIVATE: 'ON_TRAP_ACTIVATE',
    ON_TURN_START: 'ON_TURN_START',
    ON_TURN_END: 'ON_TURN_END',
    ON_CARD_DRAW: 'ON_CARD_DRAW',
    ON_LANDMARK_PLACED: 'ON_LANDMARK_PLACED',
    ON_UNIT_RETURNED: 'ON_UNIT_RETURNED',
    ON_FRIENDLY_DESTROY: 'ON_FRIENDLY_DESTROY',
    ON_FRIENDLY_TARGETED: 'ON_FRIENDLY_TARGETED',
    ON_OPPONENT_SUMMON: 'ON_OPPONENT_SUMMON',
    ON_MANA_GAIN: 'ON_MANA_GAIN',
    ON_PHASE_CHANGE: 'ON_PHASE_CHANGE',
    ON_SPELL_PLAY: 'ON_SPELL_PLAY',
    ON_BATTLE_PHASE_START: 'ON_BATTLE_PHASE_START',
};

/**
 * Effect definition structure
 */
export function createEffect(config) {
    return {
        id: config.id || `eff_${Math.random().toString(36).substr(2, 8)}`,
        cardId: config.cardId,
        trigger: config.trigger, // EFFECT_EVENTS value
        condition: config.condition || null, // (gameState, context) => boolean
        execute: config.execute, // (gameState, context, effectEngine) => void
        targets: config.targets || null, // (gameState, context) => CardInstance[]
        duration: config.duration || 'permanent', // 'this_turn', 'permanent', 'while_on_field'
        isOptional: config.isOptional || false,
        requiresTarget: config.requiresTarget || false,
        targetType: config.targetType || null, // 'friendly_unit', 'enemy_unit', 'any_unit', 'player', etc.
        priority: config.priority || 5, // Lower = executes first
        description: config.description || '',
    };
}

export class EffectEngine {
    /**
     * @param {import('./GameState.js').GameState} gameState
     */
    constructor(gameState) {
        this.gameState = gameState;
        this.effectRegistry = new Map(); // cardId -> Effect[]
        this.activeEffects = []; // Currently registered field effects
        this.effectQueue = []; // Pending effects to resolve
        this.isResolving = false;
        this.onTargetRequired = null; // Callback for UI to request target selection
        this.onChoiceRequired = null; // Callback for UI to request choice
    }

    /**
     * Register effects for a card ID
     */
    registerCardEffects(cardId, effects) {
        this.effectRegistry.set(cardId, effects);
    }

    /**
     * Get the registered effects for a card
     */
    getEffects(cardId) {
        return this.effectRegistry.get(cardId) || [];
    }

    /**
     * Trigger an event and resolve all matching effects
     */
    async trigger(event, context = {}) {
        const matchingEffects = [];

        // Check all cards on the field for matching effects
        for (const player of this.gameState.players) {
            if (!player.isAlive) continue;

            // Check units
            for (const unit of player.getFieldUnits()) {
                if (unit.silenced) continue;
                const effects = this.getEffects(unit.cardId);
                for (const effect of effects) {
                    if (effect.trigger === event) {
                        if (!effect.condition || effect.condition(this.gameState, { ...context, source: unit, sourcePlayer: player })) {
                            matchingEffects.push({ effect, source: unit, sourcePlayer: player });
                        }
                    }
                }
            }

            // Check landmarks
            if (player.landmarkZone && !player.landmarkZone.silenced) {
                const effects = this.getEffects(player.landmarkZone.cardId);
                for (const effect of effects) {
                    if (effect.trigger === event) {
                        if (!effect.condition || effect.condition(this.gameState, { ...context, source: player.landmarkZone, sourcePlayer: player })) {
                            matchingEffects.push({ effect, source: player.landmarkZone, sourcePlayer: player });
                        }
                    }
                }
            }

            // Check set spells/traps (for reactive triggers)
            for (const card of player.getSetCards()) {
                if (!card || card.faceUp) continue; // Only face-down cards
                const effects = this.getEffects(card.cardId);
                for (const effect of effects) {
                    if (effect.trigger === event) {
                        if (!effect.condition || effect.condition(this.gameState, { ...context, source: card, sourcePlayer: player })) {
                            matchingEffects.push({ effect, source: card, sourcePlayer: player, isTrap: true });
                        }
                    }
                }
            }
        }

        // Sort by priority
        matchingEffects.sort((a, b) => a.effect.priority - b.effect.priority);

        // Resolve each effect
        for (const { effect, source, sourcePlayer, isTrap } of matchingEffects) {
            await this._resolveEffect(effect, { ...context, source, sourcePlayer, isTrap });
        }
    }

    /**
     * Execute a specific card's "When Summoned" effects
     */
    async triggerOnSummon(cardInstance, player) {
        if (cardInstance.silenced) return;

        const effects = this.getEffects(cardInstance.cardId);
        for (const effect of effects) {
            if (effect.trigger === EFFECT_EVENTS.ON_SUMMON) {
                const context = { source: cardInstance, sourcePlayer: player, summonedCard: cardInstance };
                if (!effect.condition || effect.condition(this.gameState, context)) {

                    // Check for Echoing Canyon (W001) - trigger "When Summoned" twice
                    let triggerCount = 1;
                    if (player.landmarkZone && player.landmarkZone.cardId === 'W001' && !player.landmarkZone.silenced) {
                        triggerCount = 2;
                        this.gameState.log('EFFECT', `Echoing Canyon doubles the "When Summoned" effect!`);
                    }

                    for (let i = 0; i < triggerCount; i++) {
                        await this._resolveEffect(effect, context);
                    }
                }
            }
        }
    }

    /**
     * Resolve a single effect, potentially requesting targets from UI
     */
    async _resolveEffect(effect, context) {
        if (effect.requiresTarget && this.onTargetRequired) {
            // Request target from UI
            const validTargets = effect.targets ? effect.targets(this.gameState, context) : [];
            if (validTargets.length === 0 && effect.requiresTarget) {
                this.gameState.log('EFFECT', `${context.source?.name || 'Effect'}: No valid targets available.`);
                return;
            }

            const target = await this.requestTarget(validTargets, effect.description || effect.id);
            if (target) {
                context.target = target;
            } else if (effect.isOptional) {
                return; // Player chose not to use optional effect
            }
        }

        try {
            await effect.execute(this.gameState, context, this);
        } catch (err) {
            console.error(`[EffectEngine] Error resolving effect ${effect.id}:`, err);
        }
    }

    /**
     * Request target selection from UI
     */
    requestTarget(validTargets, description) {
        return new Promise((resolve) => {
            if (this.onTargetRequired) {
                this.onTargetRequired(validTargets, description, (selectedTarget) => {
                    resolve(selectedTarget);
                });
            } else {
                // Auto-select first valid target (for AI / testing)
                resolve(validTargets[0] || null);
            }
        });
    }

    /**
     * Request a choice from the player (e.g., ATK or DEF buff)
     */
    requestChoice(options, description) {
        return new Promise((resolve) => {
            if (this.onChoiceRequired) {
                this.onChoiceRequired(options, description, (choice) => {
                    resolve(choice);
                });
            } else {
                resolve(options[0] || null);
            }
        });
    }

    // ─── Stat Modification Helpers ────────────────────────────

    /**
     * Apply a temporary ATK/DEF modifier that expires at end of turn
     */
    applyTempStatMod(cardInstance, atkMod, defMod, source = 'effect') {
        if (atkMod !== 0) {
            cardInstance.currentATK += atkMod;
            cardInstance.atkModifiers.push({ amount: atkMod, source, duration: 'this_turn' });
        }
        if (defMod !== 0) {
            cardInstance.currentDEF += defMod;
            cardInstance.defModifiers.push({ amount: defMod, source, duration: 'this_turn' });
        }
        this.gameState.log('STAT_MOD', `${cardInstance.name}: ${atkMod >= 0 ? '+' : ''}${atkMod} ATK, ${defMod >= 0 ? '+' : ''}${defMod} DEF (${source})`);
        this.gameState.emit('STAT_CHANGED', { card: cardInstance, atkMod, defMod });
    }

    /**
     * Apply a permanent ATK/DEF modifier
     */
    applyPermStatMod(cardInstance, atkMod, defMod, source = 'effect') {
        if (atkMod !== 0) {
            cardInstance.currentATK += atkMod;
            cardInstance.atkModifiers.push({ amount: atkMod, source, duration: 'permanent' });
        }
        if (defMod !== 0) {
            cardInstance.currentDEF += defMod;
            cardInstance.defModifiers.push({ amount: defMod, source, duration: 'permanent' });
        }
        this.gameState.log('STAT_MOD', `${cardInstance.name}: ${atkMod >= 0 ? '+' : ''}${atkMod} ATK, ${defMod >= 0 ? '+' : ''}${defMod} DEF permanently (${source})`);
        this.gameState.emit('STAT_CHANGED', { card: cardInstance, atkMod, defMod });
    }

    /**
     * Clear all temporary effects at end of turn
     */
    clearTempEffects() {
        for (const player of this.gameState.players) {
            for (const unit of player.getFieldUnits()) {
                // Remove temporary modifiers
                unit.atkModifiers = unit.atkModifiers.filter(m => {
                    if (m.duration === 'this_turn') {
                        unit.currentATK -= m.amount;
                        return false;
                    }
                    return true;
                });
                unit.defModifiers = unit.defModifiers.filter(m => {
                    if (m.duration === 'this_turn') {
                        unit.currentDEF -= m.amount;
                        return false;
                    }
                    return true;
                });
                // Reset per-turn flags
                unit.canBeTargeted = true;
                unit.isImmune = false;
            }
        }
    }

    /**
     * Deal damage to a unit
     */
    dealDamageToUnit(target, amount, source = 'effect') {
        if (target.isImmune) {
            this.gameState.log('EFFECT', `${target.name} is immune to damage!`);
            return 0;
        }
        target.damageTaken += amount;
        this.gameState.log('DAMAGE', `${target.name} takes ${amount} damage from ${source} (${target.damageTaken}/${target.currentDEF} damage taken)`);
        this.gameState.emit('UNIT_DAMAGED', { target, amount, source });
        return amount;
    }

    /**
     * Deal damage to a player's LP
     */
    dealDamageToLP(playerId, amount, source = 'effect') {
        const player = this.gameState.getPlayerById(playerId);
        if (!player) return;
        player.lp = Math.max(0, player.lp - amount);
        this.gameState.log('LP_DAMAGE', `${player.name} takes ${amount} LP damage (${player.lp} LP remaining)`);
        this.gameState.emit('LP_CHANGED', { playerId, amount: -amount, newLP: player.lp });

        if (player.lp <= 0) {
            player.isAlive = false;
            this.gameState.log('ELIMINATION', `${player.name} has been eliminated!`);
            this.gameState.emit('PLAYER_ELIMINATED', { playerId });
            this._checkWinCondition();
        }
    }

    /**
     * Heal a player's LP
     */
    healLP(playerId, amount) {
        const player = this.gameState.getPlayerById(playerId);
        if (!player) return;
        player.lp += amount;
        this.gameState.log('HEAL', `${player.name} heals ${amount} LP (${player.lp} LP)`);
        this.gameState.emit('LP_CHANGED', { playerId, amount, newLP: player.lp });
    }

    /**
     * Heal a unit's damage
     */
    healUnit(cardInstance, amount) {
        const healed = Math.min(amount, cardInstance.damageTaken);
        cardInstance.damageTaken -= healed;
        this.gameState.log('HEAL', `${cardInstance.name} heals ${healed} damage (${cardInstance.damageTaken}/${cardInstance.currentDEF} damage taken)`);
        this.gameState.emit('UNIT_HEALED', { card: cardInstance, amount: healed });
    }

    /**
     * Destroy a unit and send to graveyard
     */
    destroyUnit(cardInstance) {
        const location = this.gameState.findCardOnField(cardInstance.instanceId);
        if (!location) return;

        const { player, zone, index } = location;

        if (zone === 'unit') {
            player.unitZone[index] = null;
        } else if (zone === 'spellTrap') {
            player.spellTrapZone[index] = null;
        }

        player.graveyard.push(cardInstance);

        this.gameState.log('DESTROY', `${cardInstance.name} is destroyed and sent to the graveyard.`);
        this.gameState.emit('CARD_DESTROYED', { card: cardInstance, player, zone });

        // Trigger ON_SELF_DESTROY
        this.trigger(EFFECT_EVENTS.ON_SELF_DESTROY, { destroyedCard: cardInstance, destroyedPlayer: player });
        // Trigger ON_FRIENDLY_DESTROY for other allies
        this.trigger(EFFECT_EVENTS.ON_FRIENDLY_DESTROY, { destroyedCard: cardInstance, ownerId: player.id });
        // Trigger ON_DESTROY for any listener
        this.trigger(EFFECT_EVENTS.ON_DESTROY, { destroyedCard: cardInstance, destroyedPlayer: player });
    }

    /**
     * Silence a card (negate all effects, remove granted ATK/DEF)
     */
    silenceUnit(cardInstance) {
        cardInstance.silenced = true;
        // Remove all modifiers
        for (const mod of cardInstance.atkModifiers) {
            cardInstance.currentATK -= mod.amount;
        }
        for (const mod of cardInstance.defModifiers) {
            cardInstance.currentDEF -= mod.amount;
        }
        cardInstance.atkModifiers = [];
        cardInstance.defModifiers = [];
        // Remove keywords
        cardInstance.keywords = [];
        this.gameState.log('SILENCE', `${cardInstance.name} has been silenced.`);
        this.gameState.emit('CARD_SILENCED', { card: cardInstance });
    }

    /**
     * Return unit to owner's hand
     */
    returnToHand(cardInstance) {
        const location = this.gameState.findCardOnField(cardInstance.instanceId);
        if (!location) return;

        const { player, zone, index } = location;

        if (zone === 'unit') {
            player.unitZone[index] = null;
        } else if (zone === 'spellTrap') {
            player.spellTrapZone[index] = null;
        } else if (zone === 'landmark') {
            player.landmarkZone = null;
        }

        // Reset the card instance
        cardInstance.damageTaken = 0;
        cardInstance.currentATK = cardInstance.baseATK;
        cardInstance.currentDEF = cardInstance.baseDEF;
        cardInstance.atkModifiers = [];
        cardInstance.defModifiers = [];
        cardInstance.silenced = false;
        cardInstance.summonedThisTurn = false;
        cardInstance.hasAttackedThisTurn = false;

        player.hand.push(cardInstance);
        this.gameState.log('RETURN', `${cardInstance.name} returned to ${player.name}'s hand.`);
        this.gameState.emit('CARD_RETURNED', { card: cardInstance, player });
        this.trigger(EFFECT_EVENTS.ON_UNIT_RETURNED, { returnedCard: cardInstance, ownerId: player.id });
    }

    /**
     * Draw cards for a player
     */
    drawCards(playerId, count = 1) {
        const player = this.gameState.getPlayerById(playerId);
        if (!player) return [];

        const drawn = [];
        for (let i = 0; i < count; i++) {
            if (player.deck.length === 0) {
                // Only eliminate on deck-out during actual gameplay, not during setup/mulligan
                const phase = this.gameState.phase;
                if (phase !== 'SETUP' && phase !== 'MULLIGAN') {
                    player.isAlive = false;
                    this.gameState.log('DECK_OUT', `${player.name} has no cards left to draw — eliminated!`);
                    this.gameState.emit('PLAYER_ELIMINATED', { playerId });
                    this._checkWinCondition();
                }
                break;
            }
            const card = player.deck.shift();
            player.hand.push(card);
            drawn.push(card);
            this.gameState.log('DRAW', `${player.name} draws ${card.name}.`);
        }

        this.gameState.emit('CARDS_DRAWN', { playerId, cards: drawn });
        return drawn;
    }

    /**
     * Search deck for a specific card and add to hand
     */
    searchDeck(playerId, predicate, description = 'a card') {
        const player = this.gameState.getPlayerById(playerId);
        if (!player) return null;

        const idx = player.deck.findIndex(predicate);
        if (idx >= 0) {
            const card = player.deck.splice(idx, 1)[0];
            player.hand.push(card);
            this.gameState.log('SEARCH', `${player.name} searches deck and adds ${card.name} to hand.`);
            return card;
        }
        this.gameState.log('SEARCH', `${player.name} searches deck for ${description} but finds nothing.`);
        return null;
    }

    /**
     * Shuffle a player's deck
     */
    shuffleDeck(playerId) {
        const player = this.gameState.getPlayerById(playerId);
        if (!player) return;
        for (let i = player.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [player.deck[i], player.deck[j]] = [player.deck[j], player.deck[i]];
        }
    }

    /**
     * Check win condition
     */
    _checkWinCondition() {
        const alive = this.gameState.getAlivePlayers();
        if (alive.length <= 1) {
            this.gameState.gameOver = true;
            this.gameState.winner = alive[0] || null;
            this.gameState.log('GAME_OVER', alive[0] ? `${alive[0].name} wins!` : 'Draw!');
            this.gameState.emit('GAME_OVER', { winner: alive[0] || null });
        }
    }
}
