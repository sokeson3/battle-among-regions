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
        this.turnManager = new TurnManager(this.gameState, this.manaSystem, this.effectEngine, this.combatEngine);
        this.actionValidator = new ActionValidator(this.gameState, this.manaSystem);
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

        card.position = position;
        card.faceUp = position === 'ATK';
        card.summonedThisTurn = true;
        player.unitZone[slot] = card;
        player.unitsSummonedThisTurn++;

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

        // Ask opponent if they want to respond
        await this._askOpponentResponse();

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

        this.gameState.log('SPELL', `${player.name} activates ${card.name}!`);
        this.gameState.emit('SPELL_ACTIVATED', { card, player });

        player.spellsPlayedThisTurn++;

        // Check Scorched Earth (S038) — +200 damage for owner's spells/traps that deal damage
        // This will be handled in the individual effect implementations

        // Trigger spell effects
        await this.effectEngine.trigger(EFFECT_EVENTS.ON_SPELL_ACTIVATE, {
            spell: card,
            caster: player,
        });

        // Execute the spell's own effect
        const effects = this.effectEngine.getEffects(card.cardId);
        for (const effect of effects) {
            if (effect.trigger === EFFECT_EVENTS.ON_SPELL_ACTIVATE || effect.trigger === 'SELF') {
                await this.effectEngine._resolveEffect(effect, { source: card, sourcePlayer: player });
            }
        }

        // Send to graveyard
        player.graveyard.push(card);

        // Trigger ON_SPELL_PLAY for reactive effects (S030 Pyromancer, E004 Ink Sprite, etc.)
        await this.effectEngine.trigger(EFFECT_EVENTS.ON_SPELL_PLAY, {
            spell: card,
            caster: player,
        });

        // Ask opponent if they want to respond
        await this._askOpponentResponse();

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
        player.spellTrapZone[slot] = card;

        this.gameState.log('SET', `${player.name} sets a card face-down.`);
        this.gameState.emit('CARD_SET', { card, player, slot });

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
        player.spellTrapZone[slot] = card;

        this.gameState.log('SET', `${player.name} sets a Trap face-down.`);
        this.gameState.emit('CARD_SET', { card, player, slot });

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

        // Flip face-up
        card.faceUp = true;

        // Remove from zone
        player.spellTrapZone[slotIndex] = null;

        this.gameState.log('SPELL', `${player.name} activates ${card.name} from the field!`);
        this.gameState.emit('SPELL_ACTIVATED', { card, player });

        player.spellsPlayedThisTurn++;

        // Trigger spell effects
        await this.effectEngine.trigger(EFFECT_EVENTS.ON_SPELL_ACTIVATE, {
            spell: card,
            caster: player,
        });

        // Execute the spell's own effect
        const effects = this.effectEngine.getEffects(card.cardId);
        for (const effect of effects) {
            if (effect.trigger === EFFECT_EVENTS.ON_SPELL_ACTIVATE || effect.trigger === 'SELF') {
                await this.effectEngine._resolveEffect(effect, { source: card, sourcePlayer: player });
            }
        }

        // Send to graveyard
        player.graveyard.push(card);

        // Trigger ON_SPELL_PLAY for reactive effects
        await this.effectEngine.trigger(EFFECT_EVENTS.ON_SPELL_PLAY, {
            spell: card,
            caster: player,
        });

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

        // Ask opponent if they want to respond before battle resolves
        await this._askOpponentResponse();

        // Resolve the attack (unless negated by response)
        if (!this.gameState.battleState.attackNegated) {
            await this.combatEngine.resolveAttack(attacker, targetInfo);
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

        this.gameState.log('ABILITY', `${player.name} activates ${card.name}'s ability.`);
        this.gameState.emit('ABILITY_ACTIVATED', { card, player });

        // Execute the card's activated effect
        const effects = this.effectEngine.getEffects(card.cardId);
        for (const effect of effects) {
            if (effect.trigger === 'ACTIVATED') {
                await this.effectEngine._resolveEffect(effect, { source: card, sourcePlayer: player });
            }
        }

        this._notifyUI();
        return { success: true };
    }

    /**
     * Enter battle phase
     */
    async enterBattlePhase() {
        const result = await this.turnManager.startBattlePhase();
        // Ask opponent if they want to respond to phase change
        await this._askOpponentResponse();
        this._notifyUI();
        return result;
    }

    /**
     * End battle phase
     */
    async exitBattlePhase() {
        await this.turnManager.endBattlePhase();
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
        this.gameState.log('POSITION', `${card.name} switched to ${card.position} position.`);
        this.gameState.emit('POSITION_CHANGED', { card });

        this._notifyUI();
        return { success: true };
    }

    // ─── Utility ──────────────────────────────────────────────

    _notifyUI() {
        if (this.onUIUpdate) this.onUIUpdate(this.gameState);
    }

    /**
     * Ask each opponent if they want to activate a card effect.
     * Triggers the onOpponentResponse callback for each opponent with face-down cards.
     */
    async _askOpponentResponse() {
        if (!this.onOpponentResponse) return;
        const gs = this.gameState;
        const activeId = gs.activePlayerIndex;

        for (const player of gs.players) {
            if (player.id === activeId || !player.isAlive) continue;

            // Check if opponent has any face-down spells or traps they could activate
            const faceDownCards = player.getFaceDownCards().filter(c => c.type === 'Spell' || c.type === 'Trap');
            if (faceDownCards.length === 0) continue;

            // Ask the opponent via the UI callback
            const response = await new Promise(resolve => {
                this.onOpponentResponse(player, resolve);
            });

            if (response && response.activate && response.cardInstanceId) {
                // Find the card to determine its type
                const card = faceDownCards.find(c => c.instanceId === response.cardInstanceId);
                if (card && card.type === 'Trap') {
                    await this.activateTrap(player.id, response.cardInstanceId);
                } else {
                    await this.activateSetSpell(player.id, response.cardInstanceId);
                }
            }
        }
    }

    /**
     * Activate a trap that was set face-down in the spell/trap zone
     */
    async activateTrap(playerId, cardInstanceId) {
        const player = this.gameState.getPlayerById(playerId);
        const slotIndex = player.spellTrapZone.findIndex(c => c && c.instanceId === cardInstanceId);
        if (slotIndex === -1) return { success: false, reason: 'Card not found in Spell/Trap zone.' };

        const card = player.spellTrapZone[slotIndex];
        if (card.type !== 'Trap') return { success: false, reason: 'Card is not a Trap.' };

        // Spend mana (spell mana allowed)
        if (!this.manaSystem.spendMana(playerId, card.manaCost, true)) {
            return { success: false, reason: 'Not enough mana.' };
        }

        // Flip face-up
        card.faceUp = true;

        // Remove from zone
        player.spellTrapZone[slotIndex] = null;

        this.gameState.log('TRAP', `${player.name} activates ${card.name}!`);
        this.gameState.emit('TRAP_ACTIVATED', { card, player });

        // Execute the trap's own effect
        const effects = this.effectEngine.getEffects(card.cardId);
        for (const effect of effects) {
            await this.effectEngine._resolveEffect(effect, { source: card, sourcePlayer: player });
        }

        // Send to graveyard
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
