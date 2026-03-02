// ─────────────────────────────────────────────────────────────
// GameController.js — Orchestrates all engine components
// ─────────────────────────────────────────────────────────────

import { CardDatabase } from './CardDatabase.js';
import { GameState, PHASES } from './GameState.js';
import { ManaSystem } from './ManaSystem.js';
import { EffectEngine, EFFECT_EVENTS } from './EffectEngine.js';
import { CombatEngine } from './CombatEngine.js';
import { TurnManager } from './TurnManager.js';
import { ActionValidator } from './ActionValidator.js';

export class GameController {
    constructor() {
        this.cardDB = new CardDatabase();
        this.gameState = new GameState();
        this.manaSystem = new ManaSystem(this.gameState);
        this.effectEngine = new EffectEngine(this.gameState);
        this.combatEngine = new CombatEngine(this.gameState, this.effectEngine);
        this.turnManager = new TurnManager(this.gameState, this.manaSystem, this.effectEngine, this.combatEngine, this);
        this.actionValidator = new ActionValidator(this.gameState, this.manaSystem);
        this.actionValidator.effectEngine = this.effectEngine;
        this.effectEngine.controller = this; // Allow EffectEngine to trigger response prompts
        this.onUIUpdate = null; // Callback to refresh UI
        this.onOpponentResponse = null; // Callback: (player, callback) => shows Yes/No prompt
    }

    /**
     * Load card data from CSV
     */
    async loadCards(csvText) {
        await this.cardDB.loadFromCSV(csvText);
        return this;
    }

    /**
     * Initialize and register all card effects
     */
    registerEffects(effectModules) {
        for (const module of effectModules) {
            module.register(this.effectEngine, this.cardDB);
        }
    }

    /**
     * Set up a new game
     * @param {Object[]} playerConfigs - [{name, region, deckCardIds}]
     * @param {Object} options - {gameMode, startingLP, startingPlayer}
     */
    async setupGame(playerConfigs, options = {}) {
        // Initialize game state
        this.gameState.init(playerConfigs, options);

        // Build decks for each player
        for (let i = 0; i < playerConfigs.length; i++) {
            const cfg = playerConfigs[i];
            const player = this.gameState.getPlayerById(i);

            if (cfg.deckCardIds) {
                // Custom deck
                player.deck = cfg.deckCardIds.map(id => this.cardDB.createCardInstance(id, i)).filter(Boolean);
            } else {
                // Starting deck from CSV
                const deckIds = this.cardDB.getStartingDeck(cfg.region);
                player.deck = deckIds.map(id => this.cardDB.createCardInstance(id, i)).filter(Boolean);
            }
        }

        // Start the game
        await this.turnManager.startGame();
        this._notifyUI();
        return this;
    }

    // ─── Player Actions ───────────────────────────────────────

    /**
     * Play a unit from hand to the field
     */
    async playUnit(playerId, cardInstanceId, position = 'ATK', slotIndex = -1) {
        const player = this.gameState.getPlayerById(playerId);
        const card = player.hand.find(c => c.instanceId === cardInstanceId);
        if (!card) return { success: false, reason: 'Card not in hand.' };

        const validation = this.actionValidator.canPlayUnit(playerId, card);
        if (!validation.valid) return { success: false, reason: validation.reason };

        // Spend mana
        if (!this.manaSystem.spendMana(playerId, card.manaCost, false)) {
            return { success: false, reason: 'Failed to spend mana.' };
        }

        // Remove from hand
        player.hand = player.hand.filter(c => c.instanceId !== cardInstanceId);

        // Place on field
        const slot = slotIndex >= 0 && player.unitZone[slotIndex] === null
            ? slotIndex
            : player.getEmptyUnitSlot();

        if (slot < 0) {
            // No valid slot — refund mana and return card to hand
            this.manaSystem.addMana(playerId, card.manaCost);
            player.hand.push(card);
            return { success: false, reason: 'No empty Unit Zone slots available.' };
        }

        card.position = position;
        card.faceUp = position === 'ATK';
        card.summonedThisTurn = true;
        player.unitZone[slot] = card;
        player.unitsSummonedThisTurn++;

        // Show the unit on the board before the announcement
        this._notifyUI();
        await new Promise(resolve => setTimeout(resolve, 500));

        this.gameState.log('SUMMON', `${player.name} summons ${card.name} in ${position} position (Slot ${slot + 1}).`);
        this.gameState.emit('UNIT_SUMMONED', { card, player, slot, position });

        // Check for Avalanche Warning (N048) — return second unit summoned this turn
        if (player.unitsSummonedThisTurn >= 2) {
            await this.effectEngine.trigger('ON_OPPONENT_SUMMON', {
                summonedCard: card,
                summoningPlayer: player,
                isSecondSummon: true,
            });
        }

        // Trigger "When Summoned" effects
        await this.effectEngine.triggerOnSummon(card, player);

        // Trigger opponent trap checks
        await this.effectEngine.trigger(EFFECT_EVENTS.ON_OPPONENT_SUMMON, {
            summonedCard: card,
            summoningPlayer: player,
        });

        // Ask players if they want to respond
        await this._askOpponentResponse('summon', { summonedCard: card, summoningPlayer: player, isSecondSummon: player.unitsSummonedThisTurn >= 2 });

        this._notifyUI();
        return { success: true, card, slot };
    }

    /**
     * Play a spell from hand (face-up, costs mana)
     */
    async playSpell(playerId, cardInstanceId) {
        const player = this.gameState.getPlayerById(playerId);
        const card = player.hand.find(c => c.instanceId === cardInstanceId);
        if (!card) return { success: false, reason: 'Card not in hand.' };

        const validation = this.actionValidator.canPlaySpell(playerId, card);
        if (!validation.valid) return { success: false, reason: validation.reason };

        // Spend mana
        if (!this.manaSystem.spendMana(playerId, card.manaCost, true)) {
            return { success: false, reason: 'Failed to spend mana.' };
        }

        // Remove from hand
        player.hand = player.hand.filter(c => c.instanceId !== cardInstanceId);

        // Place spell face-up on field (visible during resolution)
        const spellSlot = player.getEmptySpellTrapSlot();
        if (spellSlot >= 0) {
            card.faceUp = true;
            player.spellTrapZone[spellSlot] = card;
        }

        // Show the spell on the board before the announcement
        this._notifyUI();
        await new Promise(resolve => setTimeout(resolve, 500));

        this.gameState.log('SPELL', `${player.name} activates ${card.name}!`);
        this.gameState.emit('SPELL_ACTIVATED', { card, player });

        player.spellsPlayedThisTurn++;

        // Trigger spell effects (including E002 Scroll Library negate/copy)
        await this.effectEngine.trigger(EFFECT_EVENTS.ON_SPELL_ACTIVATE, {
            spell: card,
            caster: player,
        });

        this._notifyUI(); // Show the spell on field

        // Check if spell was negated (E002 Scroll Library)
        if (this.gameState._scrollLibraryNegate) {
            this.gameState._scrollLibraryNegate = false;
            // Remove spell from field slot
            if (spellSlot >= 0) player.spellTrapZone[spellSlot] = null;
            // Send to graveyard without executing
            player.graveyard.push(card);
            this.gameState.log('SPELL', `${card.name} was negated!`);
            this._notifyUI();
            return { success: true, card, negated: true };
        }

        // Execute the spell's own effect
        const effects = this.effectEngine.getEffects(card.cardId);
        let cancelled = false;
        for (const effect of effects) {
            if (effect.trigger === EFFECT_EVENTS.ON_SPELL_ACTIVATE || effect.trigger === 'SELF') {
                const result = await this.effectEngine._resolveEffect(effect, { source: card, sourcePlayer: player });
                if (result && result.cancelled) {
                    cancelled = true;
                    break;
                }
            }
        }

        // Keep spell visible on field for 2 seconds before removing
        this._notifyUI();
        await new Promise(resolve => setTimeout(resolve, 1200));

        // Remove spell from field slot
        if (spellSlot >= 0) {
            player.spellTrapZone[spellSlot] = null;
        }

        // If the player cancelled target selection, refund everything
        if (cancelled) {
            this.manaSystem.addMana(playerId, card.manaCost);
            player.hand.push(card);
            card.faceUp = false;
            player.spellsPlayedThisTurn--;
            this.gameState.log('CANCEL', `${player.name} cancelled ${card.name}.`);
            this._notifyUI();
            return { success: false, reason: 'Spell cancelled.' };
        }

        // Send to graveyard
        player.graveyard.push(card);

        // Trigger ON_SPELL_PLAY for reactive effects (S030 Pyromancer, E004 Ink Sprite, etc.)
        await this.effectEngine.trigger(EFFECT_EVENTS.ON_SPELL_PLAY, {
            spell: card,
            caster: player,
        });

        // Ask players if they want to respond
        await this._askOpponentResponse('spell', { spell: card, caster: player });

        this._notifyUI();
        return { success: true, card };
    }

    /**
     * Set a spell face-down (costs 0)
     */
    async setSpell(playerId, cardInstanceId, slotIndex = -1) {
        const player = this.gameState.getPlayerById(playerId);
        const card = player.hand.find(c => c.instanceId === cardInstanceId);
        if (!card) return { success: false, reason: 'Card not in hand.' };

        const validation = this.actionValidator.canSetSpell(playerId, card);
        if (!validation.valid) return { success: false, reason: validation.reason };

        // Remove from hand
        player.hand = player.hand.filter(c => c.instanceId !== cardInstanceId);

        // Place face-down
        const slot = slotIndex >= 0 && player.spellTrapZone[slotIndex] === null
            ? slotIndex
            : player.getEmptySpellTrapSlot();

        card.faceUp = false;
        card.setThisTurn = true;
        player.spellTrapZone[slot] = card;

        // Show the set card on the board before the announcement
        this._notifyUI();
        await new Promise(resolve => setTimeout(resolve, 500));

        this.gameState.log('SET', `${player.name} sets a card face-down.`);
        this.gameState.emit('CARD_SET', { card, player, slot });

        // Ask players if they want to respond to the set
        await this._askOpponentResponse('set', { setCard: card, settingPlayer: player });

        this._notifyUI();
        return { success: true, slot };
    }

    /**
     * Set a trap face-down (costs 0)
     */
    async setTrap(playerId, cardInstanceId, slotIndex = -1) {
        const player = this.gameState.getPlayerById(playerId);
        const card = player.hand.find(c => c.instanceId === cardInstanceId);
        if (!card) return { success: false, reason: 'Card not in hand.' };

        const validation = this.actionValidator.canSetTrap(playerId, card);
        if (!validation.valid) return { success: false, reason: validation.reason };

        // Remove from hand
        player.hand = player.hand.filter(c => c.instanceId !== cardInstanceId);

        // Place face-down
        const slot = slotIndex >= 0 && player.spellTrapZone[slotIndex] === null
            ? slotIndex
            : player.getEmptySpellTrapSlot();

        card.faceUp = false;
        card.setThisTurn = true;
        player.spellTrapZone[slot] = card;

        // Show the set card on the board before the announcement
        this._notifyUI();
        await new Promise(resolve => setTimeout(resolve, 500));

        this.gameState.log('SET', `${player.name} sets a Trap face-down.`);
        this.gameState.emit('CARD_SET', { card, player, slot });

        // Ask players if they want to respond to the set
        await this._askOpponentResponse('set', { setCard: card, settingPlayer: player });

        this._notifyUI();
        return { success: true, slot };
    }

    /**
     * Play a Landmark
     */
    async playLandmark(playerId, cardInstanceId, targetPlayerId = null) {
        const player = this.gameState.getPlayerById(playerId);
        const card = player.hand.find(c => c.instanceId === cardInstanceId);
        if (!card) return { success: false, reason: 'Card not in hand.' };

        const validation = this.actionValidator.canPlayLandmark(playerId, card);
        if (!validation.valid) return { success: false, reason: validation.reason };

        // Spend mana
        if (!this.manaSystem.spendMana(playerId, card.manaCost, true)) {
            return { success: false, reason: 'Failed to spend mana.' };
        }

        // Remove from hand
        player.hand = player.hand.filter(c => c.instanceId !== cardInstanceId);

        // Determine target zone
        const targetPlayer = targetPlayerId !== null
            ? this.gameState.getPlayerById(targetPlayerId)
            : player;

        // If target already has a landmark, send it to graveyard
        if (targetPlayer.landmarkZone) {
            const oldLandmark = targetPlayer.landmarkZone;
            targetPlayer.graveyard.push(oldLandmark);
            this.gameState.log('LANDMARK', `${oldLandmark.name} is replaced and sent to the graveyard.`);
        }

        card.faceUp = true;
        targetPlayer.landmarkZone = card;

        // Show the landmark on the board before the announcement
        this._notifyUI();
        await new Promise(resolve => setTimeout(resolve, 500));

        this.gameState.log('LANDMARK', `${player.name} places ${card.name} in ${targetPlayer.name}'s Landmark Zone.`);
        this.gameState.emit('LANDMARK_PLACED', { card, player, targetPlayer });

        // Trigger landmark placement effects
        await this.effectEngine.trigger(EFFECT_EVENTS.ON_LANDMARK_PLACED, {
            landmark: card,
            placer: player,
            targetPlayer,
        });

        this._notifyUI();
        return { success: true, card };
    }

    /**
     * Activate a spell that was set face-down in the spell/trap zone
     */
    async activateSetSpell(playerId, cardInstanceId) {
        const player = this.gameState.getPlayerById(playerId);
        const slotIndex = player.spellTrapZone.findIndex(c => c && c.instanceId === cardInstanceId);
        if (slotIndex === -1) return { success: false, reason: 'Card not found in Spell/Trap zone.' };

        const card = player.spellTrapZone[slotIndex];
        if (card.type !== 'Spell') return { success: false, reason: 'Only Spells can be activated this way.' };

        const phase = this.gameState.phase;
        if (phase !== PHASES.MAIN1 && phase !== PHASES.MAIN2) {
            return { success: false, reason: 'Can only activate during Main Phase.' };
        }

        // Spend mana (spell mana allowed)
        if (!this.manaSystem.spendMana(playerId, card.manaCost, true)) {
            return { success: false, reason: 'Not enough mana.' };
        }

        // Flip face-up (keep in slot so it's visible during resolution)
        card.faceUp = true;

        // Show the spell face-up on the board before the announcement
        this._notifyUI();
        await new Promise(resolve => setTimeout(resolve, 500));

        this.gameState.log('SPELL', `${player.name} activates ${card.name} from the field!`);
        this.gameState.emit('SPELL_ACTIVATED', { card, player });

        player.spellsPlayedThisTurn++;

        // Trigger spell effects (including E002 Scroll Library negate/copy)
        await this.effectEngine.trigger(EFFECT_EVENTS.ON_SPELL_ACTIVATE, {
            spell: card,
            caster: player,
        });

        // Check if spell was negated (E002 Scroll Library)
        if (this.gameState._scrollLibraryNegate) {
            this.gameState._scrollLibraryNegate = false;
            // Remove from zone and send to graveyard without executing
            player.spellTrapZone[slotIndex] = null;
            player.graveyard.push(card);
            this.gameState.log('SPELL', `${card.name} was negated!`);
            this._notifyUI();
            return { success: true, card, negated: true };
        }

        // Execute the spell's own effect
        const effects = this.effectEngine.getEffects(card.cardId);
        let cancelled = false;
        for (const effect of effects) {
            if (effect.trigger === EFFECT_EVENTS.ON_SPELL_ACTIVATE || effect.trigger === 'SELF') {
                const result = await this.effectEngine._resolveEffect(effect, { source: card, sourcePlayer: player });
                if (result && result.cancelled) {
                    cancelled = true;
                    break;
                }
            }
        }

        // If the player cancelled target selection, refund everything
        if (cancelled) {
            this.manaSystem.addMana(playerId, card.manaCost);
            card.faceUp = false;
            player.spellTrapZone[slotIndex] = card;
            player.spellsPlayedThisTurn--;
            this.gameState.log('CANCEL', `${player.name} cancelled ${card.name}.`);
            this._notifyUI();
            return { success: false, reason: 'Spell cancelled.' };
        }

        // Keep spell visible on field for 2 seconds before sending to graveyard
        this._notifyUI();
        await new Promise(resolve => setTimeout(resolve, 1200));

        // Remove from zone and send to graveyard
        player.spellTrapZone[slotIndex] = null;
        player.graveyard.push(card);

        // Trigger ON_SPELL_PLAY for reactive effects
        await this.effectEngine.trigger(EFFECT_EVENTS.ON_SPELL_PLAY, {
            spell: card,
            caster: player,
        });

        // Ask players if they want to respond
        await this._askOpponentResponse('spell', { spell: card, caster: player });

        this._notifyUI();
        return { success: true, card };
    }

    /**
     * Declare an attack
     */
    async declareAttack(playerId, attackerInstanceId, targetInfo) {
        const player = this.gameState.getPlayerById(playerId);
        const attacker = player.getFieldUnits().find(u => u.instanceId === attackerInstanceId);
        if (!attacker) return { success: false, reason: 'Attacker not found on field.' };

        const validation = this.actionValidator.canDeclareAttack(playerId, attacker);
        if (!validation.valid) return { success: false, reason: validation.reason };

        // Validate target
        if (!this.combatEngine.canTarget(attacker, targetInfo)) {
            return { success: false, reason: 'Invalid target.' };
        }

        // Initialize battle state
        this.gameState.battleState = { attackNegated: false, battlePhaseEnded: false };

        // Fire ON_FRIENDLY_TARGETED for traps like E039, E041, W046
        if (targetInfo?.type === 'unit' && targetInfo.card) {
            await this.effectEngine.trigger(EFFECT_EVENTS.ON_FRIENDLY_TARGETED, {
                attacker,
                attackerOwner: player,
                target: targetInfo,
            });
        }

        // Ask players if they want to respond before battle resolves
        await this._askOpponentResponse('attack', { attacker, attackerOwner: player, target: targetInfo });

        // Resolve the attack (unless negated by response)
        if (!this.gameState.battleState.attackNegated) {
            await this.combatEngine.resolveAttack(attacker, targetInfo);

            // After combat: prompt for destruction-triggered traps (W047, S048)
            // Check if any unit was destroyed during combat
            const destroyedUnits = this.gameState._recentlyDestroyed || [];
            if (destroyedUnits.length > 0) {
                for (const { card: destroyedCard, ownerId } of destroyedUnits) {
                    await this._askOpponentResponse('destroy', {
                        destroyedCard,
                        ownerId,
                        attacker,
                        attackerOwner: player,
                    });
                }
                this.gameState._recentlyDestroyed = [];
            }
        }

        // Check if battle phase should end
        if (this.gameState.battleState?.battlePhaseEnded) {
            await this.turnManager.endBattlePhase();
        }

        this.gameState.battleState = null;
        this._notifyUI();
        return { success: true };
    }

    /**
     * Activate a unit's ability
     */
    async activateAbility(playerId, cardInstanceId) {
        const player = this.gameState.getPlayerById(playerId);
        const card = player.getFieldUnits().find(u => u.instanceId === cardInstanceId);
        if (!card) return { success: false, reason: 'Card not found on field.' };

        const validation = this.actionValidator.canActivateAbility(playerId, card);
        if (!validation.valid) return { success: false, reason: validation.reason };

        card.activatedThisRound = true;

        // Show the ability activation on the board before the announcement
        this._notifyUI();
        await new Promise(resolve => setTimeout(resolve, 500));

        this.gameState.log('ABILITY', `${player.name} activates ${card.name}'s ability.`);
        this.gameState.emit('ABILITY_ACTIVATED', { card, player });

        // Execute the card's activated effect
        const effects = this.effectEngine.getEffects(card.cardId);
        for (const effect of effects) {
            if (effect.trigger === 'ACTIVATED') {
                await this.effectEngine._resolveEffect(effect, { source: card, sourcePlayer: player });
            }
        }

        // Ask players if they want to respond
        await this._askOpponentResponse('ability', { abilityCard: card, caster: player });

        this._notifyUI();
        return { success: true };
    }

    /**
     * Enter battle phase
     */
    async enterBattlePhase() {
        const result = await this.turnManager.startBattlePhase();
        // Ask players if they want to respond to phase change
        await this._askOpponentResponse('phase_change', { phase: 'BATTLE' });
        this._notifyUI();
        return result;
    }

    /**
     * End battle phase
     */
    async exitBattlePhase() {
        await this.turnManager.endBattlePhase();
        // Ask players if they want to respond to Main Phase 2 start
        await this._askOpponentResponse('phase_change', { phase: 'MAIN2' });
        this._notifyUI();
    }

    /**
     * End turn
     */
    async endTurn() {
        await this.turnManager.endTurn();
        this._notifyUI();
    }

    /**
     * Perform mulligan
     */
    async mulligan(playerId, cardInstanceIds) {
        await this.turnManager.performMulligan(playerId, cardInstanceIds);
        await this.turnManager.checkMulliganComplete();
        this._notifyUI();
    }

    /**
     * Change a unit's position (ATK ↔ DEF)
     */
    async changePosition(playerId, cardInstanceId) {
        const player = this.gameState.getPlayerById(playerId);
        const card = player.getFieldUnits().find(u => u.instanceId === cardInstanceId);
        if (!card) return { success: false, reason: 'Card not found.' };
        if (this.gameState.phase !== PHASES.MAIN1 && this.gameState.phase !== PHASES.MAIN2) {
            return { success: false, reason: 'Can only change position during Main Phase.' };
        }
        if (card.summonedThisTurn) {
            return { success: false, reason: 'Cannot change position the turn a unit is summoned.' };
        }
        if (card.hasChangedPositionThisTurn) {
            return { success: false, reason: 'This unit has already changed position this turn.' };
        }
        if (card.hasAttackedThisTurn) {
            return { success: false, reason: 'Cannot change position after attacking.' };
        }

        card.position = card.position === 'ATK' ? 'DEF' : 'ATK';
        card.hasChangedPositionThisTurn = true;

        // Show the position change before the announcement
        this._notifyUI();
        await new Promise(resolve => setTimeout(resolve, 500));

        this.gameState.log('POSITION', `${card.name} switched to ${card.position} position.`);
        this.gameState.emit('POSITION_CHANGED', { card });

        // Trigger position change effects (e.g., N001 Frostfell Citadel)
        await this.effectEngine.trigger('ON_POSITION_CHANGE', { changedCard: card, player });

        this._notifyUI();
        return { success: true };
    }

    // ─── Utility ──────────────────────────────────────────────

    _notifyUI() {
        if (this.onUIUpdate) this.onUIUpdate(this.gameState);
    }

    /**
     * Ask players if they want to activate a card effect in response.
     * Implements a chain system: after each activation, the other player can respond.
     * @param {string} triggerType - What triggered this response opportunity (e.g. 'summon', 'attack', 'spell', 'phase_change')
     * @param {Object} triggerContext - Context data about the trigger (attacker, spell, etc.)
     */
    async _askOpponentResponse(triggerType = 'action', triggerContext = {}) {
        if (!this.onOpponentResponse) return;
        await this._resolveChain(triggerType, triggerContext);
    }

    /**
     * Resolve a chain of responses. Players alternate responding until both pass.
     * Then the chain resolves in LIFO (last-in-first-out) order.
     */
    async _resolveChain(triggerType = 'action', triggerContext = {}) {
        if (!this.onOpponentResponse) return;
        const gs = this.gameState;
        const activeId = gs.activePlayerIndex;
        const chainStack = [];

        // Both opponents AND the active player can respond (active player goes last in order)
        const playerOrder = [];
        for (const player of gs.players) {
            if (player.id !== activeId && player.isAlive) playerOrder.push(player);
        }
        // Active player can also chain their set spells/traps in response
        const activePlayer = gs.getActivePlayer();
        if (activePlayer.isAlive) playerOrder.push(activePlayer);
        if (playerOrder.length === 0) return;

        let consecutivePasses = 0;
        let currentPlayerIdx = 0;

        // ── Phase 1: Build the chain ──────────────────────────
        // Collect all responses. Each activation flips face-up and pays costs,
        // but effects are NOT executed yet.
        while (consecutivePasses < playerOrder.length) {
            const player = playerOrder[currentPlayerIdx % playerOrder.length];

            // Check if player has any face-down spells or traps they could activate
            const faceDownCards = player.getFaceDownCards().filter(c => c.type === 'Spell' || c.type === 'Trap');
            if (faceDownCards.length === 0) {
                consecutivePasses++;
                currentPlayerIdx++;
                continue;
            }

            // Ask the player via the UI callback, passing trigger context
            const response = await new Promise(resolve => {
                this.onOpponentResponse(player, resolve, { triggerType, triggerContext, chainStack });
            });

            if (response && response.activate && response.cardInstanceId) {
                const card = faceDownCards.find(c => c.instanceId === response.cardInstanceId);
                if (card) {
                    const slotIndex = player.spellTrapZone.findIndex(c => c && c.instanceId === response.cardInstanceId);

                    // E019 Enigmatic Sensei — opponents must pay 400 LP for traps
                    if (card.type === 'Trap') {
                        const activePlayer = gs.getActivePlayer();
                        if (player.id !== activePlayer.id) {
                            for (const unit of activePlayer.getFieldUnits()) {
                                if (unit.cardId === 'E019' && !unit.silenced) {
                                    if (player.lp >= 400) {
                                        player.lp -= 400;
                                        gs.log('EFFECT', `${player.name} pays 400 LP to activate Trap (Enigmatic Sensei).`);
                                    }
                                    break;
                                }
                            }
                        }
                    }

                    // Spend mana
                    if (!this.manaSystem.spendMana(player.id, card.manaCost, true)) {
                        consecutivePasses++;
                        currentPlayerIdx++;
                        continue;
                    }

                    // Flip face-up (visible to all players during chain building)
                    card.faceUp = true;
                    this._notifyUI();
                    await new Promise(resolve => setTimeout(resolve, 500));
                    const logType = card.type === 'Trap' ? 'TRAP' : 'SPELL';
                    gs.log(logType, `${player.name} chains ${card.name}!`);
                    gs.emit(card.type === 'Trap' ? 'TRAP_ACTIVATED' : 'SPELL_ACTIVATED', { card, player });
                    this._notifyUI();

                    chainStack.push({ playerId: player.id, cardInstanceId: response.cardInstanceId, card, slotIndex });
                    consecutivePasses = 0; // Reset passes — other player can now respond
                } else {
                    consecutivePasses++;
                }
            } else {
                consecutivePasses++;
            }

            currentPlayerIdx++;
        }

        // ── Phase 2: Resolve chain in LIFO order ─────────────
        // Last activated card resolves first.
        for (let i = chainStack.length - 1; i >= 0; i--) {
            const entry = chainStack[i];
            const player = gs.getPlayerById(entry.playerId);
            const card = entry.card;
            const slotIndex = entry.slotIndex;

            gs.log('CHAIN', `Resolving chain link ${chainStack.length - i}: ${card.name}`);

            const effects = this.effectEngine.getEffects(card.cardId);

            if (card.type === 'Trap') {
                // Execute all trap effects with trigger context
                for (const effect of effects) {
                    await this.effectEngine._resolveEffect(effect, {
                        ...triggerContext, source: card, sourcePlayer: player,
                    });
                }
            } else {
                // Spell — resolve SELF and ON_SPELL_ACTIVATE effects
                player.spellsPlayedThisTurn = (player.spellsPlayedThisTurn || 0) + 1;
                for (const effect of effects) {
                    if (effect.trigger === 'ON_SPELL_ACTIVATE' || effect.trigger === 'SELF') {
                        await this.effectEngine._resolveEffect(effect, {
                            source: card, sourcePlayer: player,
                        });
                    }
                }
            }

            // Keep visible on field for 2 seconds
            this._notifyUI();
            await new Promise(resolve => setTimeout(resolve, 1200));

            // Remove from field and send to graveyard
            if (slotIndex >= 0 && player.spellTrapZone[slotIndex] === card) {
                player.spellTrapZone[slotIndex] = null;
            }
            player.graveyard.push(card);

            // Fire ON_SPELL_PLAY for spells (reactive effects like Pyromancer)
            if (card.type === 'Spell') {
                await this.effectEngine.trigger('ON_SPELL_PLAY', {
                    spell: card, caster: player,
                });
            }

            this._notifyUI();
        }
    }

    /**
     * Activate a trap that was set face-down in the spell/trap zone
     */
    async activateTrap(playerId, cardInstanceId, triggerContext = {}) {
        const player = this.gameState.getPlayerById(playerId);
        const slotIndex = player.spellTrapZone.findIndex(c => c && c.instanceId === cardInstanceId);
        if (slotIndex === -1) return { success: false, reason: 'Card not found in Spell/Trap zone.' };

        const card = player.spellTrapZone[slotIndex];
        if (card.type !== 'Trap') return { success: false, reason: 'Card is not a Trap.' };

        // Check for E019 Enigmatic Sensei — opponents must pay 400 LP
        const activePlayer = this.gameState.getActivePlayer();
        if (playerId !== activePlayer.id) {
            for (const unit of activePlayer.getFieldUnits()) {
                if (unit.cardId === 'E019' && !unit.silenced) {
                    if (player.lp >= 400) {
                        player.lp -= 400;
                        this.gameState.log('EFFECT', `${player.name} pays 400 LP to activate Trap (Enigmatic Sensei).`);
                    }
                    break;
                }
            }
        }

        // Spend mana (spell mana allowed)
        if (!this.manaSystem.spendMana(playerId, card.manaCost, true)) {
            return { success: false, reason: 'Not enough mana.' };
        }

        // Flip face-up (keep on field so the player can see it)
        card.faceUp = true;

        // Show the trap face-up on the field before the announcement
        this._notifyUI();
        await new Promise(resolve => setTimeout(resolve, 500));

        this.gameState.log('TRAP', `${player.name} activates ${card.name}!`);
        this.gameState.emit('TRAP_ACTIVATED', { card, player });

        // Execute the trap's own effect, merging trigger context so effects can access attacker/caster/etc.
        const effects = this.effectEngine.getEffects(card.cardId);
        for (const effect of effects) {
            await this.effectEngine._resolveEffect(effect, { ...triggerContext, source: card, sourcePlayer: player });
        }

        // Keep the trap visible on field for 2s (matches announcement text duration)
        await new Promise(resolve => setTimeout(resolve, 1200));

        // Now remove from zone and send to graveyard
        player.spellTrapZone[slotIndex] = null;
        player.graveyard.push(card);

        this._notifyUI();
        return { success: true, card };
    }

    /**
     * Get all valid actions for the active player
     */
    getValidActions() {
        return this.actionValidator.getValidActions();
    }
}
