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
    ON_POSITION_CHANGE: 'ON_POSITION_CHANGE',
    ON_ABILITY_ACTIVATE: 'ON_ABILITY_ACTIVATE',
    ON_UNIT_EFFECT_RESOLVE: 'ON_UNIT_EFFECT_RESOLVE',
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
                // W035/W004: Use overridden cardId if set (effect copied until end of turn)
                const effectCardId = unit._temporaryEffectOverride || unit.cardId;
                const effects = this.getEffects(effectCardId);
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
            // NOTE: Skip face-down Traps — they activate only via the response dialog, not automatically
            for (const card of player.getSetCards()) {
                if (!card || card.faceUp) continue; // Only face-down cards
                if (card.type === 'Trap' && event !== EFFECT_EVENTS.ON_UNIT_EFFECT_RESOLVE) continue; // Traps activate through dialog only (except ON_UNIT_EFFECT_RESOLVE for W050)
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

        // ON_SELF_DESTROY: the destroyed card is already in the graveyard,
        // so it won't be found among field units above. Check it explicitly.
        if (event === EFFECT_EVENTS.ON_SELF_DESTROY && context.destroyedCard && !context.destroyedCard.silenced) {
            const dc = context.destroyedCard;
            const dcOwner = context.destroyedPlayer;
            const effects = this.getEffects(dc.cardId);
            for (const effect of effects) {
                if (effect.trigger === event) {
                    if (!effect.condition || effect.condition(this.gameState, { ...context, source: dc, sourcePlayer: dcOwner })) {
                        matchingEffects.push({ effect, source: dc, sourcePlayer: dcOwner });
                    }
                }
            }
        }

        // ON_SPELL_PLAY: spell targets may have been removed from the field (e.g. returned to hand).
        // Check them explicitly so effects like N030 (Stoic Elder) still fire.
        if (event === EFFECT_EVENTS.ON_SPELL_PLAY && context.spellTargets) {
            for (const t of context.spellTargets) {
                const card = t?.card || t; // target may be { card, player } or direct unit ref
                if (!card?.cardId || card.silenced) continue;
                // Skip if already found on the field (already checked above)
                const onField = this.gameState.findCardOnField(card.instanceId);
                if (onField) continue;
                const owner = this.gameState.getPlayerById(card.ownerId);
                if (!owner) continue;
                const effects = this.getEffects(card.cardId);
                for (const effect of effects) {
                    if (effect.trigger === event) {
                        if (!effect.condition || effect.condition(this.gameState, { ...context, source: card, sourcePlayer: owner })) {
                            matchingEffects.push({ effect, source: card, sourcePlayer: owner });
                        }
                    }
                }
            }
        }

        // Sort by priority
        matchingEffects.sort((a, b) => a.effect.priority - b.effect.priority);

        // Resolve each effect
        for (const { effect, source, sourcePlayer, isTrap } of matchingEffects) {
            // Auto-triggered face-down traps: flip face-up, pay mana, resolve, send to graveyard
            if (isTrap && source && !source.faceUp && source.type === 'Trap') {
                // Check mana (spell mana allowed)
                const manaSystem = this.controller?.manaSystem;
                if (manaSystem && !manaSystem.canAfford(sourcePlayer.id, source.manaCost, true)) {
                    continue; // Can't afford — skip
                }
                if (source.setThisTurn) continue; // Can't activate same turn it was set
                if (manaSystem) manaSystem.spendMana(sourcePlayer.id, source.manaCost, true);

                // Flip face-up
                source.faceUp = true;
                this.gameState.log('TRAP', `${sourcePlayer.name} activates ${source.name}!`);
                this.gameState.emit('TRAP_ACTIVATED', { card: source, player: sourcePlayer });

                await this._resolveEffect(effect, { ...context, source, sourcePlayer, isTrap });

                // Send to graveyard
                const loc = this.gameState.findCardOnField(source.instanceId);
                if (loc) {
                    loc.player.spellTrapZone[loc.index] = null;
                    loc.player.graveyard.push(source);
                }
            } else {
                await this._resolveEffect(effect, { ...context, source, sourcePlayer, isTrap });
            }
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

                    // Check for Echoing Canyon (W001) - trigger "When Summoned" twice (once per round)
                    let triggerCount = 1;
                    if (player.landmarkZone && player.landmarkZone.cardId === 'W001' && !player.landmarkZone.silenced
                        && !player.landmarkZone._echoUsedThisRound) {
                        triggerCount = 2;
                        player.landmarkZone._echoUsedThisRound = true;
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
     * Check landmarks for ON_SUMMON reactions (e.g. N001 Frostfell Citadel)
     * Separate from triggerOnSummon to avoid double-firing the summoned card's own effects.
     */
    async triggerLandmarkOnSummon(cardInstance, player) {
        for (const p of this.gameState.players) {
            if (!p.isAlive || !p.landmarkZone || p.landmarkZone.silenced) continue;
            const effects = this.getEffects(p.landmarkZone.cardId);
            for (const effect of effects) {
                if (effect.trigger === EFFECT_EVENTS.ON_SUMMON) {
                    const context = { source: cardInstance, sourcePlayer: player, summonedCard: cardInstance };
                    if (!effect.condition || effect.condition(this.gameState, context)) {
                        await this._resolveEffect(effect, context);
                    }
                }
            }
        }
    }

    /**
     * Resolve a single effect, potentially requesting targets from UI
     * @returns {{ cancelled: boolean }} result
     */
    async _resolveEffect(effect, context) {
        // Track current source player for callback routing (AI vs human)
        this._currentSourcePlayerId = context.sourcePlayer?.id ?? null;

        // Track if we're resolving a spell/trap effect (for Scorched Earth gating)
        const source = context.source;
        const wasResolvingSpellOrTrap = this._resolvingSpellOrTrap;
        if (source && (source.type === 'Spell' || source.type === 'Trap')) {
            this._resolvingSpellOrTrap = true;
        }

        if (effect.requiresTarget && this.onTargetRequired) {
            // Request target from UI
            const validTargets = effect.targets ? effect.targets(this.gameState, context) : [];
            if (validTargets.length === 0 && effect.requiresTarget) {
                this.gameState.log('EFFECT', `${context.source?.name || 'Effect'}: No valid targets available.`);
                this._resolvingSpellOrTrap = wasResolvingSpellOrTrap;
                return { cancelled: true };
            }

            const target = await this.requestTarget(validTargets, effect.description || effect.id);
            if (target) {
                context.target = target;
            } else {
                // Player cancelled target selection
                this._resolvingSpellOrTrap = wasResolvingSpellOrTrap;
                return { cancelled: true };
            }
        }

        try {
            await effect.execute(this.gameState, context, this);
        } catch (err) {
            console.error(`[EffectEngine] Error resolving effect ${effect.id}:`, err);
        }
        this._resolvingSpellOrTrap = wasResolvingSpellOrTrap;

        // Emit ON_UNIT_EFFECT_RESOLVE when a unit's effect resolves (for W050 Power Siphon)
        const src = context.source;
        if (src && src.type === 'Unit' && effect.trigger !== EFFECT_EVENTS.ON_UNIT_EFFECT_RESOLVE) {
            const srcOwner = context.sourcePlayer || this.gameState.getPlayerById(src.ownerId);
            await this.trigger(EFFECT_EVENTS.ON_UNIT_EFFECT_RESOLVE, {
                effectUnit: src,
                effectOwner: srcOwner,
                resolvedEffect: effect,
            });
        }

        return { cancelled: false, target: context.target || null };
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
            // Clear per-turn player flags
            player._smokeScreenActive = false;

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
                // Remove temporary keywords (e.g. SHADOW from E022/E046)
                if (unit._tempKeywords && unit._tempKeywords.length > 0) {
                    for (const kw of unit._tempKeywords) {
                        const idx = unit.keywords.indexOf(kw);
                        if (idx >= 0) unit.keywords.splice(idx, 1);
                    }
                    unit._tempKeywords = [];
                }
                // Reset per-turn flags
                unit.canBeTargeted = true;
                unit.isImmune = false;
                unit._n029SurvivedThisTurn = false;
                unit._dealtLPDamage = false;
                unit._destroyedThisTurn = false;
                // W035/W004: Clear temporary effect overrides
                delete unit._temporaryEffectOverride;
            }

            // W012: Totem Carver — restore original mana costs for cards in hand
            for (const card of player.hand) {
                if (card._originalManaCost !== undefined) {
                    card.manaCost = card._originalManaCost;
                    delete card._originalManaCost;
                }
            }
        }
    }

    /**
     * Deal damage to a unit
     */
    async dealDamageToUnit(target, amount, source = 'effect') {
        if (target.isImmune) {
            this.gameState.log('EFFECT', `${target.name} is immune to damage!`);
            return 0;
        }

        // E035: Seal Spell — sealed player's units are immune
        const targetOwner = this.gameState.getPlayerById(target.ownerId);
        if (targetOwner && targetOwner._sealActive) {
            this.gameState.log('EFFECT', `${target.name} is protected by Seal!`);
            return 0;
        }

        // N024: Colossus of the North — immune to enemy spell/trap damage
        if (target.cardId === 'N024' && !target.silenced && this._resolvingSpellOrTrap) {
            this.gameState.log('EFFECT', `${target.name} is immune to Spell/Trap damage!`);
            return 0;
        }

        // E020: Mist Walker — immune to spell/trap damage
        if (target.cardId === 'E020' && !target.silenced && this._resolvingSpellOrTrap) {
            this.gameState.log('EFFECT', `${target.name} is immune to Spell/Trap damage!`);
            return 0;
        }

        // N011: Shield Wall Veteran — reduce all combat damage by 100
        let reducedAmount = amount;
        if (target.cardId === 'N011' && !target.silenced) {
            reducedAmount = Math.max(0, amount - 100);
            if (reducedAmount < amount) {
                this.gameState.log('EFFECT', `Shield Wall Veteran reduces damage by ${amount - reducedAmount}!`);
            }
        }

        // S038: Scorched Earth — +200 bonus damage ONLY from spells/traps
        let bonus = 0;
        if (this._resolvingSpellOrTrap) {
            const scorchedOwner = this.gameState.players.find(p => p._scorchedEarthActive);
            if (scorchedOwner && target.ownerId !== scorchedOwner.id) {
                bonus = 200;
            }
        }
        const totalDmg = reducedAmount + bonus;

        target.damageTaken += totalDmg;
        this.gameState.log('DAMAGE', `${target.name} takes ${totalDmg} damage from ${source}${bonus > 0 ? ' (+200 Scorched Earth)' : ''} (${target.damageTaken}/${target.currentDEF} damage taken)`);
        this.gameState.emit('UNIT_DAMAGED', { target, amount: totalDmg, source });

        // Emit ON_DAMAGE_TO_UNIT so effects like N013 (Battle-Scarred Warrior) can react
        if (totalDmg > 0 && target.damageTaken < target.currentDEF) {
            this.trigger(EFFECT_EVENTS.ON_DAMAGE_TO_UNIT, { target, amount: totalDmg, source });
        }

        // Check if the unit should be destroyed (DEF reduced to 0)
        // When _suppressAutoDestroy is set (during combat), skip auto-destroy
        // so that simultaneous damage can be applied before destruction checks.
        if (target.damageTaken >= target.currentDEF && !this._suppressAutoDestroy) {
            this.gameState.log('DESTROY', `${target.name} is destroyed by ${source}!`);
            await this.destroyUnit(target);
        }

        return totalDmg;
    }

    /**
     * Deal damage to a player's LP
     */
    dealDamageToLP(playerId, amount, source = 'effect') {
        const player = this.gameState.getPlayerById(playerId);
        if (!player) return;

        // E035: Seal Spell — sealed player is immune to LP damage
        if (player._sealActive) {
            this.gameState.log('EFFECT', `${player.name} is protected by Seal!`);
            return;
        }

        // N047: Hibernation Ward — reduce combat LP damage by 500 (one-time, combat only)
        let reducedAmount = amount;
        if (player._hibernationWardActive && this._isCombatDamage) {
            reducedAmount = Math.max(0, amount - 500);
            player._hibernationWardActive = false;
            this.gameState.log('TRAP', `Hibernation Ward reduces LP damage by ${amount - reducedAmount}!`);
            if (reducedAmount === 0) return;
        }

        // S038: Scorched Earth — +200 bonus damage ONLY from spells/traps
        let bonus = 0;
        if (this._resolvingSpellOrTrap) {
            const scorchedOwner = this.gameState.players.find(p => p._scorchedEarthActive);
            if (scorchedOwner && playerId !== scorchedOwner.id) {
                bonus = 200;
            }
        }
        const totalDmg = reducedAmount + bonus;

        player.lp = Math.max(0, player.lp - totalDmg);
        this.gameState.log('LP_DAMAGE', `${player.name} takes ${totalDmg} LP damage${bonus > 0 ? ' (+200 Scorched Earth)' : ''} (${player.lp} LP remaining)`);
        this.gameState.emit('LP_CHANGED', { playerId, amount: -totalDmg, newLP: player.lp });

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
        // Cap LP at 9999 (can exceed starting LP)
        const maxLP = 9999;
        const actualHeal = Math.min(amount, maxLP - player.lp);
        if (actualHeal <= 0) {
            this.gameState.log('HEAL', `${player.name} is already at max LP (${player.lp}).`);
            return;
        }
        player.lp += actualHeal;
        this.gameState.log('HEAL', `${player.name} heals ${actualHeal} LP (${player.lp} LP)`);
        this.gameState.emit('LP_CHANGED', { playerId, amount: actualHeal, newLP: player.lp });
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
    async destroyUnit(cardInstance) {
        const location = this.gameState.findCardOnField(cardInstance.instanceId);
        if (!location) return;

        const { player, zone, index } = location;

        // N029: Resilient Spearman — survive first destruction per turn
        if (cardInstance.cardId === 'N029' && !cardInstance.silenced && !cardInstance._n029SurvivedThisTurn) {
            cardInstance._n029SurvivedThisTurn = true;
            cardInstance.damageTaken = 0;
            cardInstance.currentDEF = cardInstance.baseDEF;
            this.gameState.log('EFFECT', `Resilient Spearman survives destruction! DEF reset to ${cardInstance.baseDEF}.`);
            this.gameState.emit('UNIT_HEALED', { card: cardInstance, amount: cardInstance.baseDEF });
            return;
        }

        if (zone === 'unit') {
            player.unitZone[index] = null;
        } else if (zone === 'spellTrap') {
            player.spellTrapZone[index] = null;
        }

        // Mark destroyed this turn for W032 (Ancestral Recall)
        cardInstance._destroyedThisTurn = true;

        player.graveyard.push(cardInstance);

        // Track for destruction-response prompts (W047, S048)
        if (!this.gameState._recentlyDestroyed) this.gameState._recentlyDestroyed = [];
        this.gameState._recentlyDestroyed.push({ card: cardInstance, ownerId: player.id });

        this.gameState.log('DESTROY', `${cardInstance.name} is destroyed and sent to the graveyard.`);
        this.gameState.emit('CARD_DESTROYED', { card: cardInstance, player, zone });

        // S029: Scavenging Hyena — +100/+100 when any unit is destroyed (field-wide check)
        for (const p of this.gameState.players) {
            for (const unit of p.getFieldUnits()) {
                if (unit.cardId === 'S029' && !unit.silenced && unit.instanceId !== cardInstance.instanceId) {
                    this.applyPermStatMod(unit, 100, 100, 'Scavenging Hyena');
                }
            }
        }

        // Trigger ON_SELF_DESTROY
        await this.trigger(EFFECT_EVENTS.ON_SELF_DESTROY, { destroyedCard: cardInstance, destroyedPlayer: player });
        // Trigger ON_FRIENDLY_DESTROY for other allies
        await this.trigger(EFFECT_EVENTS.ON_FRIENDLY_DESTROY, { destroyedCard: cardInstance, ownerId: player.id });
        // Trigger ON_DESTROY for any listener
        await this.trigger(EFFECT_EVENTS.ON_DESTROY, { destroyedCard: cardInstance, destroyedPlayer: player });

        // Ask opponent if they want to respond to the destruction
        if (this.controller) {
            await this.controller._askOpponentResponse('destroy', { destroyedCard: cardInstance, destroyedPlayer: player });
        }
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
            // Clean up any landmark-specific buffs before removing
            this._cleanupLandmarkBuffs(player, cardInstance);
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
    /**
     * Clean up landmark-specific buffs when a landmark leaves the field
     */
    _cleanupLandmarkBuffs(player, landmark) {
        if (!landmark) return;

        // N001: Frostfell Citadel — remove +200 DEF from all units
        if (landmark.cardId === 'N001') {
            for (const unit of player.getFieldUnits()) {
                if (unit._n001Applied) {
                    this.applyPermStatMod(unit, 0, -200, 'Frostfell Citadel lost');
                    unit._n001Applied = false;
                }
            }
        }
    }

    /**
     * Check if a card is protected by E012 (Temple Guardian)
     * Returns true if the card belongs to a player who controls E012,
     * and the card is a landmark or a set spell/trap.
     */
    isProtectedByTempleGuardian(card, attackingPlayerId) {
        const owner = this.gameState.getPlayerById(card.ownerId);
        if (!owner) return false;
        // Only protect against enemy effects
        if (owner.id === attackingPlayerId) return false;
        // Check if owner has E012 on the field and it's not silenced
        const hasE012 = owner.getFieldUnits().some(u => u.cardId === 'E012' && !u.silenced);
        if (!hasE012) return false;
        // Check if the card is a landmark or a set spell/trap
        if (card.type === 'Landmark') return true;
        if ((card.type === 'Spell' || card.type === 'Trap') && !card.faceUp) return true;
        return false;
    }
}
