// ─────────────────────────────────────────────────────────────
// ManaSystem.js — Primary Mana + Spell-Mana management
// ─────────────────────────────────────────────────────────────

export class ManaSystem {
    /**
     * @param {import('./GameState.js').GameState} gameState
     */
    constructor(gameState) {
        this.gameState = gameState;
    }

    /**
     * Save up to 3 unspent primary mana into spell-mana pool.
     * Called at the START of a turn, before gaining new mana.
     */
    saveSpellMana(playerId) {
        const player = this.gameState.getPlayerById(playerId);
        if (!player) return;

        const toSave = Math.min(player.primaryMana, 3 - player.spellMana);
        if (toSave > 0) {
            player.spellMana += toSave;
            player.primaryMana -= toSave;
            this.gameState.log('MANA_SAVE', `${player.name} saved ${toSave} mana to Spell-Mana pool (${player.spellMana}/3)`);
        }
    }

    /**
     * Set primary mana for the turn based on round number.
     * Starting player gets 1 mana on Turn 1.
     * Subsequent turns: mana = min(roundNumber, 9)
     */
    gainMana(playerId) {
        const player = this.gameState.getPlayerById(playerId);
        if (!player) return;

        const gs = this.gameState;
        let manaGain;

        if (gs.turnCounter === 1) {
            // First turn of the entire game: starting player gets 1
            manaGain = 1;
        } else {
            manaGain = Math.min(gs.roundCounter, 9);
        }

        // Check for extra mana from effects (e.g., Ancestral Ice Cairn N002, Ice Wall Sentinel N007)
        const extraMana = this._getExtraMana(player);
        manaGain += extraMana;

        player.primaryMana = manaGain;
        this.gameState.log('MANA_GAIN', `${player.name} gains ${manaGain} primary mana (round ${gs.roundCounter}${extraMana > 0 ? `, +${extraMana} bonus` : ''})`);

        this.gameState.emit('MANA_GAINED', { playerId, amount: manaGain });
    }

    /**
     * Check for extra mana from Landmarks and field effects
     */
    _getExtraMana(player) {
        let extra = 0;

        console.log(`[ManaSystem] Checking extra mana for ${player.name}, landmark: ${player.landmarkZone?.cardId || 'none'}, silenced: ${player.landmarkZone?.silenced}`);

        // Check player's own Landmark
        if (player.landmarkZone && !player.landmarkZone.silenced) {
            const lm = player.landmarkZone;
            // N002: Ancestral Ice Cairn — +1 extra mana
            if (lm.cardId === 'N002') {
                extra += 1;
            }
            // E001: Hidden Monastery — +2 mana if only Shadow/no units
            if (lm.cardId === 'E001') {
                const units = player.getFieldUnits();
                const allShadowOrNone = units.length === 0 ||
                    units.every(u => u.keywords.includes('SHADOW'));
                if (allShadowOrNone) {
                    extra += 2;
                }
            }
        }

        // Check field units for extra mana effects
        for (const unit of player.getFieldUnits()) {
            if (unit.silenced) continue;
            // N007: Ice Wall Sentinel — +1 extra mana
            if (unit.cardId === 'N007') {
                extra += 1;
            }
        }

        return extra;
    }

    /**
     * Check if a player can afford a card's mana cost
     * @param {number} playerId
     * @param {number} cost
     * @param {boolean} isSpellTrapLandmark - Whether spell-mana can be used
     */
    canAfford(playerId, cost, isSpellTrapLandmark = false) {
        const player = this.gameState.getPlayerById(playerId);
        if (!player) return false;

        if (isSpellTrapLandmark) {
            return (player.primaryMana + player.spellMana) >= cost;
        }
        return player.primaryMana >= cost;
    }

    /**
     * Spend mana to play a card
     * @param {number} playerId
     * @param {number} cost
     * @param {boolean} isSpellTrapLandmark
     * @returns {boolean} Success
     */
    spendMana(playerId, cost, isSpellTrapLandmark = false) {
        const player = this.gameState.getPlayerById(playerId);
        if (!player) return false;
        if (!this.canAfford(playerId, cost, isSpellTrapLandmark)) return false;

        let remaining = cost;

        // Spend spell-mana first for spells/traps/landmarks
        if (isSpellTrapLandmark) {
            const fromSpell = Math.min(remaining, player.spellMana);
            player.spellMana -= fromSpell;
            remaining -= fromSpell;
        }

        // Then spend primary mana
        const fromPrimary = Math.min(remaining, player.primaryMana);
        player.primaryMana -= fromPrimary;
        remaining -= fromPrimary;

        if (remaining > 0) {
            // Should not happen if canAfford was checked
            return false;
        }

        this.gameState.log('MANA_SPEND', `${player.name} spent ${cost} mana (Primary: ${player.primaryMana}, Spell: ${player.spellMana})`);
        this.gameState.emit('MANA_SPENT', { playerId, amount: cost });
        return true;
    }

    /**
     * Add mana to a player (from effects)
     */
    addMana(playerId, amount) {
        const player = this.gameState.getPlayerById(playerId);
        if (!player) return;
        player.primaryMana += amount;
        this.gameState.log('MANA_ADD', `${player.name} gained ${amount} bonus mana (Primary: ${player.primaryMana})`);
        this.gameState.emit('MANA_GAINED', { playerId, amount });
    }
}
