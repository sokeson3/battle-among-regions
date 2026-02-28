// ─────────────────────────────────────────────────────────────
// ActionValidator.js — Validates all player actions
// ─────────────────────────────────────────────────────────────

import { PHASES } from './GameState.js';

export class ActionValidator {
    /**
     * @param {import('./GameState.js').GameState} gameState
     * @param {import('./ManaSystem.js').ManaSystem} manaSystem
     */
    constructor(gameState, manaSystem) {
        this.gameState = gameState;
        this.manaSystem = manaSystem;
    }

    /**
     * Check if a player can play a Unit card from hand
     */
    canPlayUnit(playerId, cardInstance) {
        const gs = this.gameState;
        const player = gs.getPlayerById(playerId);
        if (!player || !gs.isPlayersTurn(playerId)) return { valid: false, reason: 'Not your turn.' };
        if (gs.phase !== PHASES.MAIN1 && gs.phase !== PHASES.MAIN2) return { valid: false, reason: 'Can only play units during Main Phase.' };
        if (cardInstance.type !== 'Unit') return { valid: false, reason: 'Card is not a Unit.' };

        // Check mana (Units use primary mana only)
        if (!this.manaSystem.canAfford(playerId, cardInstance.manaCost, false)) {
            return { valid: false, reason: `Not enough mana. Need ${cardInstance.manaCost}, have ${player.primaryMana}.` };
        }

        // Check for empty slot
        if (player.getEmptyUnitSlot() === -1) {
            return { valid: false, reason: 'No empty Unit Zone slots.' };
        }

        return { valid: true };
    }

    /**
     * Check if a player can play a Spell card face-up
     */
    canPlaySpell(playerId, cardInstance) {
        const gs = this.gameState;
        const player = gs.getPlayerById(playerId);
        if (!player || !gs.isPlayersTurn(playerId)) return { valid: false, reason: 'Not your turn.' };
        if (gs.phase !== PHASES.MAIN1 && gs.phase !== PHASES.MAIN2) return { valid: false, reason: 'Can only play Spells during Main Phase.' };
        if (cardInstance.type !== 'Spell') return { valid: false, reason: 'Card is not a Spell.' };

        // Spells can use both primary and spell-mana
        if (!this.manaSystem.canAfford(playerId, cardInstance.manaCost, true)) {
            return { valid: false, reason: `Not enough mana. Need ${cardInstance.manaCost}, have ${player.getTotalMana()}.` };
        }

        return { valid: true };
    }

    /**
     * Check if a player can set a Spell face-down (costs 0 to set)
     */
    canSetSpell(playerId, cardInstance) {
        const gs = this.gameState;
        const player = gs.getPlayerById(playerId);
        if (!player || !gs.isPlayersTurn(playerId)) return { valid: false, reason: 'Not your turn.' };
        if (gs.phase !== PHASES.MAIN1 && gs.phase !== PHASES.MAIN2) return { valid: false, reason: 'Can only set cards during Main Phase.' };
        if (cardInstance.type !== 'Spell') return { valid: false, reason: 'Card is not a Spell.' };

        if (player.getEmptySpellTrapSlot() === -1) {
            return { valid: false, reason: 'No empty Spell & Trap Zone slots.' };
        }

        return { valid: true };
    }

    /**
     * Check if a player can set a Trap face-down (costs 0 to set)
     */
    canSetTrap(playerId, cardInstance) {
        const gs = this.gameState;
        const player = gs.getPlayerById(playerId);
        if (!player || !gs.isPlayersTurn(playerId)) return { valid: false, reason: 'Not your turn.' };
        if (gs.phase !== PHASES.MAIN1 && gs.phase !== PHASES.MAIN2) return { valid: false, reason: 'Can only set Traps during Main Phase.' };
        if (cardInstance.type !== 'Trap') return { valid: false, reason: 'Card is not a Trap.' };

        if (player.getEmptySpellTrapSlot() === -1) {
            return { valid: false, reason: 'No empty Spell & Trap Zone slots.' };
        }

        return { valid: true };
    }

    /**
     * Check if a player can play a Landmark
     */
    canPlayLandmark(playerId, cardInstance, targetPlayerId = null) {
        const gs = this.gameState;
        const player = gs.getPlayerById(playerId);
        if (!player || !gs.isPlayersTurn(playerId)) return { valid: false, reason: 'Not your turn.' };
        if (gs.phase !== PHASES.MAIN1 && gs.phase !== PHASES.MAIN2) return { valid: false, reason: 'Can only play Landmarks during Main Phase.' };
        if (cardInstance.type !== 'Landmark') return { valid: false, reason: 'Card is not a Landmark.' };

        // Landmarks use primary + spell-mana
        if (!this.manaSystem.canAfford(playerId, cardInstance.manaCost, true)) {
            return { valid: false, reason: `Not enough mana. Need ${cardInstance.manaCost}, have ${player.getTotalMana()}.` };
        }

        return { valid: true };
    }

    /**
     * Check if a unit can declare an attack
     */
    canDeclareAttack(playerId, unitInstance) {
        const gs = this.gameState;
        if (!gs.isPlayersTurn(playerId)) return { valid: false, reason: 'Not your turn.' };
        if (gs.phase !== PHASES.BATTLE) return { valid: false, reason: 'Can only attack during Battle Phase.' };

        if (unitInstance.position !== 'ATK') return { valid: false, reason: 'Unit must be in Attack position.' };
        if (unitInstance.hasAttackedThisTurn && unitInstance.attackCount >= unitInstance.maxAttacks) {
            return { valid: false, reason: 'Unit has already attacked this turn.' };
        }
        if (unitInstance.summonedThisTurn && !unitInstance.keywords.includes('RUSH')) {
            return { valid: false, reason: 'Unit cannot attack the turn it was summoned (no Rush).' };
        }

        return { valid: true };
    }

    /**
     * Check if a card's activated ability can be used
     */
    canActivateAbility(playerId, cardInstance) {
        const gs = this.gameState;
        const player = gs.getPlayerById(playerId);
        if (!player || !gs.isPlayersTurn(playerId)) return { valid: false, reason: 'Not your turn.' };
        if (gs.phase !== PHASES.MAIN1 && gs.phase !== PHASES.MAIN2) return { valid: false, reason: 'Can only activate during Main Phase.' };

        if (cardInstance.silenced) return { valid: false, reason: 'This card is silenced.' };
        if (cardInstance.activatedThisRound) return { valid: false, reason: 'Already activated this round.' };

        // Check if card has an activatable effect
        if (!cardInstance.effectTriggers.includes('ACTIVATED')) return { valid: false, reason: 'No activated ability.' };

        return { valid: true };
    }

    /**
     * Check if a face-down spell can be activated (costs mana when flipped)
     */
    canActivateSetSpell(playerId, cardInstance) {
        const gs = this.gameState;
        const player = gs.getPlayerById(playerId);
        if (!player) return { valid: false, reason: 'Invalid player.' };
        if (cardInstance.type !== 'Spell') return { valid: false, reason: 'Card is not a Spell.' };
        if (cardInstance.faceUp) return { valid: false, reason: 'Card is already face-up.' };
        if (cardInstance.setThisTurn) return { valid: false, reason: 'Cannot activate a card the same turn it was set.' };

        // Pay mana cost when activating
        if (!this.manaSystem.canAfford(playerId, cardInstance.manaCost, true)) {
            return { valid: false, reason: `Not enough mana to activate. Need ${cardInstance.manaCost}.` };
        }

        return { valid: true };
    }

    /**
     * Check if a face-down trap can be activated
     * @param {number} playerId
     * @param {Object} cardInstance
     * @param {Object} [options] - Optional: { triggerContext, effectEngine }
     */
    canActivateTrap(playerId, cardInstance, options = {}) {
        const player = this.gameState.getPlayerById(playerId);
        if (!player) return { valid: false, reason: 'Invalid player.' };
        if (cardInstance.type !== 'Trap') return { valid: false, reason: 'Card is not a Trap.' };
        if (cardInstance.faceUp) return { valid: false, reason: 'Card is already face-up.' };
        if (cardInstance.setThisTurn) return { valid: false, reason: 'Cannot activate a Trap the same turn it was set.' };

        // Pay mana cost when activating
        if (!this.manaSystem.canAfford(playerId, cardInstance.manaCost, true)) {
            return { valid: false, reason: `Not enough mana to activate. Need ${cardInstance.manaCost}.` };
        }

        // Check for E019 Enigmatic Sensei — opponents must pay 400 LP to activate traps
        const activePlayer = this.gameState.getActivePlayer();
        if (playerId !== activePlayer.id) {
            // Check if the active player has Enigmatic Sensei
            for (const unit of activePlayer.getFieldUnits()) {
                if (unit.cardId === 'E019' && !unit.silenced) {
                    if (player.lp < 400) {
                        return { valid: false, reason: 'Must pay 400 LP to activate Traps (Enigmatic Sensei) but not enough LP.' };
                    }
                }
            }
        }

        // If we have an effect engine and trigger context, check if the trap's effect conditions are met
        if (options.effectEngine && options.triggerContext) {
            const { effectEngine, triggerContext } = options;
            const effects = effectEngine.getEffects(cardInstance.cardId);
            if (effects.length > 0) {
                // Check if at least one effect's condition is satisfied
                const hasMatchingCondition = effects.some(effect => {
                    // If the effect has no condition, it's always valid
                    if (!effect.condition) return true;
                    // Check the condition with current context
                    try {
                        return effect.condition(this.gameState, {
                            ...triggerContext,
                            source: cardInstance,
                            sourcePlayer: player
                        });
                    } catch (e) {
                        return false;
                    }
                });
                if (!hasMatchingCondition) {
                    return { valid: false, reason: 'Trap conditions are not met.' };
                }
            }
        }

        return { valid: true };
    }

    /**
     * Get all valid actions for the active player
     */
    getValidActions() {
        const gs = this.gameState;
        const player = gs.getActivePlayer();
        const actions = [];

        if (gs.phase === PHASES.MAIN1 || gs.phase === PHASES.MAIN2) {
            // Play units from hand
            for (const card of player.hand) {
                if (card.type === 'Unit' && this.canPlayUnit(player.id, card).valid) {
                    actions.push({ type: 'PLAY_UNIT', card, position: 'ATK' });
                    actions.push({ type: 'PLAY_UNIT', card, position: 'DEF' });
                }
                if (card.type === 'Spell' && this.canPlaySpell(player.id, card).valid) {
                    actions.push({ type: 'PLAY_SPELL', card });
                }
                if (card.type === 'Spell' && this.canSetSpell(player.id, card).valid) {
                    actions.push({ type: 'SET_SPELL', card });
                }
                if (card.type === 'Trap' && this.canSetTrap(player.id, card).valid) {
                    actions.push({ type: 'SET_TRAP', card });
                }
                if (card.type === 'Landmark' && this.canPlayLandmark(player.id, card).valid) {
                    actions.push({ type: 'PLAY_LANDMARK', card });
                }
            }

            // Activate abilities on field
            for (const unit of player.getFieldUnits()) {
                if (this.canActivateAbility(player.id, unit).valid) {
                    actions.push({ type: 'ACTIVATE_ABILITY', card: unit });
                }
            }

            // Enter battle phase
            if (!gs.isFirstTurn) {
                actions.push({ type: 'ENTER_BATTLE' });
            }

            // End turn
            actions.push({ type: 'END_TURN' });
        }

        if (gs.phase === PHASES.BATTLE) {
            // Declare attacks
            for (const unit of player.getFieldUnits()) {
                if (this.canDeclareAttack(player.id, unit).valid) {
                    actions.push({ type: 'DECLARE_ATTACK', card: unit });
                }
            }

            // End battle phase
            actions.push({ type: 'END_BATTLE' });
        }

        return actions;
    }
}
