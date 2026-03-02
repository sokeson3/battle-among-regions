// ─────────────────────────────────────────────────────────────
// CombatEngine.js — Attack declaration and damage resolution
// ─────────────────────────────────────────────────────────────

export class CombatEngine {
    /**
     * @param {import('./GameState.js').GameState} gameState
     * @param {import('./EffectEngine.js').EffectEngine} effectEngine
     */
    constructor(gameState, effectEngine) {
        this.gameState = gameState;
        this.effectEngine = effectEngine;
    }

    // ─── Validation ───────────────────────────────────────────

    /**
     * Check if a unit can legally attack
     */
    canAttack(unit) {
        if (!unit) return false;
        if (unit.position !== 'ATK') return false;
        if (unit.hasAttackedThisTurn && unit.attackCount >= unit.maxAttacks) return false;
        if (unit.summonedThisTurn && !unit.keywords.includes('RUSH')) return false;
        if (unit.hasChangedPositionThisTurn) return false;
        return true;
    }

    /**
     * Get valid attack targets for a unit
     */
    getValidTargets(attackerOwnerId) {
        const targets = [];
        const opponents = this.gameState.getOpponents(attackerOwnerId);

        for (const opponent of opponents) {
            // E035: Seal Spell — sealed player is immune to attacks
            if (opponent._sealActive) continue;

            const opponentUnits = opponent.getFieldUnits();

            if (opponentUnits.length === 0) {
                // Can attack LP directly
                targets.push({ type: 'direct', player: opponent });
            } else {
                // Must attack units (unless Shadow)
                for (const unit of opponentUnits) {
                    targets.push({ type: 'unit', card: unit, player: opponent });
                }
                // Check if direct attack is possible via Shadow
                targets.push({ type: 'direct', player: opponent, requiresShadow: true });
            }
        }

        return targets;
    }

    /**
     * Check if the attacker can target a specific target
     */
    canTarget(attacker, target) {
        if (target.type === 'direct') {
            const opponent = target.player;
            // E035: Seal Spell — sealed player is immune
            if (opponent._sealActive) return false;
            const opponentUnits = opponent.getFieldUnits();

            if (opponentUnits.length === 0) return true;

            // Shadow: can attack directly unless opponent has Shadow unit
            if (attacker.keywords.includes('SHADOW')) {
                const hasShadowBlocker = opponentUnits.some(u => u.keywords.includes('SHADOW'));
                return !hasShadowBlocker;
            }
            return false;
        }

        if (target.type === 'unit') {
            const opponent = target.player;
            // E035: Seal Spell — sealed player's units can't be attacked
            if (opponent._sealActive) return false;

            // Check for taunt-like effects (Jarl N021, Guardian Golem W020)
            const opponentUnits = opponent.getFieldUnits();

            for (const u of opponentUnits) {
                if (u.silenced) continue;
                // N021: Jarl - opponents must attack this unit
                if (u.cardId === 'N021' && u.instanceId !== target.card.instanceId) {
                    return false; // Must attack Jarl instead
                }
                // W020: Guardian Golem - opponents must attack this unit
                if (u.cardId === 'W020' && u.instanceId !== target.card.instanceId) {
                    return false;
                }
            }
            return true;
        }

        return false;
    }

    // ─── Combat Resolution ────────────────────────────────────

    /**
     * Execute a full attack sequence
     */
    async resolveAttack(attacker, target) {
        const attackerOwner = this.gameState.getPlayerById(attacker.ownerId);

        this.gameState.log('ATTACK', `${attacker.name} attacks ${target.type === 'direct' ? target.player.name + "'s LP" : target.card.name}!`);
        this.gameState.emit('ATTACK_DECLARED', { attacker, target });

        // Trigger ON_ATTACK_DECLARE effects (checking for traps, etc.)
        await this.effectEngine.trigger('ON_ATTACK_DECLARE', {
            attacker,
            target,
            attackerOwner,
            defenderOwner: target.player,
        });

        // Check if the attack was negated (e.g., by Frozen Path N045)
        if (this.gameState.battleState?.attackNegated) {
            this.gameState.log('ATTACK', `Attack was negated!`);
            this.gameState.battleState.attackNegated = false;
            attacker.hasAttackedThisTurn = true;
            attacker.attackCount++;
            return;
        }

        // Apply Landmark effects for both players
        await this._applyAttackerLandmark(attacker, target);
        await this._applyDefenderLandmark(attacker, target);

        if (target.type === 'direct') {
            await this._resolveDirectAttack(attacker, target.player);
        } else if (target.card.position === 'ATK') {
            await this._resolveATKvsATK(attacker, target.card, attackerOwner, target.player);
        } else {
            await this._resolveATKvsDEF(attacker, target.card, attackerOwner, target.player);
        }

        attacker.hasAttackedThisTurn = true;
        attacker.attackCount++;

        this.gameState.emit('ATTACK_RESOLVED', { attacker, target });
    }

    /**
     * Direct attack: opponent LP -= attacker ATK
     */
    async _resolveDirectAttack(attacker, defendingPlayer) {
        const damage = Math.max(0, attacker.currentATK);
        this.effectEngine.dealDamageToLP(defendingPlayer.id, damage, attacker.name);

        this.gameState.emit('DIRECT_ATTACK', { attacker, defender: defendingPlayer, damage });

        // Trigger effects that fire on LP damage (e.g., S022 Inferno Titan extra 300)
        await this.effectEngine.trigger('ON_DAMAGE_TO_LP', {
            attacker,
            defender: defendingPlayer,
            damage,
            isCombat: true,
        });
    }

    /**
     * ATK vs ATK Position:
     * Both units deal their ATK to each other's DEF.
     * If ATK > remaining DEF, excess → LP damage.
     * Damage is permanent and accumulates.
     */
    async _resolveATKvsATK(attacker, defender, attackerOwner, defenderOwner) {
        const atkDmg = Math.max(0, attacker.currentATK);
        const defDmg = Math.max(0, defender.currentATK);

        // Both deal damage simultaneously
        const defRemainingDEF = defender.currentDEF - defender.damageTaken;
        const atkRemainingDEF = attacker.currentDEF - attacker.damageTaken;

        // Damage to defender
        const excessToDefender = Math.max(0, atkDmg - defRemainingDEF);
        this.effectEngine.dealDamageToUnit(defender, atkDmg, attacker.name);

        // Damage to attacker
        const excessToAttacker = Math.max(0, defDmg - atkRemainingDEF);
        this.effectEngine.dealDamageToUnit(attacker, defDmg, defender.name);

        // Excess damage to LP
        if (excessToDefender > 0) {
            this.gameState.log('COMBAT', `${attacker.name} deals ${excessToDefender} excess damage to ${defenderOwner.name}'s LP!`);
            this.effectEngine.dealDamageToLP(defenderOwner.id, excessToDefender, attacker.name);
            // Trigger ON_DAMAGE_TO_LP so effects like S026 (Bounty Hunter) fire
            await this.effectEngine.trigger('ON_DAMAGE_TO_LP', {
                attacker,
                defender: defenderOwner,
                damage: excessToDefender,
                isCombat: true,
            });
        }
        if (excessToAttacker > 0) {
            this.gameState.log('COMBAT', `${defender.name} deals ${excessToAttacker} excess damage to ${attackerOwner.name}'s LP!`);
            this.effectEngine.dealDamageToLP(attackerOwner.id, excessToAttacker, defender.name);
        }

        // Check for destroyed units
        const defenderDestroyed = defender.damageTaken >= defender.currentDEF;
        const attackerDestroyed = attacker.damageTaken >= attacker.currentDEF;

        // Apply special effects before destruction
        await this._applyOnDestroyEffects(attacker, defender, attackerOwner, defenderOwner, attackerDestroyed, defenderDestroyed);

        // Check S001 Arena of Trials Landmark
        await this._checkArenaOfTrials(attacker, defender, defenderOwner, defenderDestroyed);

        if (defenderDestroyed) {
            await this.effectEngine.destroyUnit(defender);
        }
        if (attackerDestroyed) {
            await this.effectEngine.destroyUnit(attacker);
        }

        this.gameState.emit('COMBAT_RESOLVED', {
            attacker, defender,
            attackerDestroyed, defenderDestroyed,
        });
    }

    /**
     * ATK vs DEF Position:
     * Attacker deals its ATK as damage to defender's DEF.
     * Attacker does NOT take any damage itself.
     * If attacker ATK < defender remaining DEF: attacker owner takes Rebound Damage (DEF - ATK).
     */
    async _resolveATKvsDEF(attacker, defender, attackerOwner, defenderOwner) {
        const atkDmg = Math.max(0, attacker.currentATK);
        const defRemainingDEF = defender.currentDEF - defender.damageTaken;

        if (atkDmg < defRemainingDEF) {
            // ATK is less than DEF — defender takes ATK as damage, attacker owner takes rebound LP damage
            this.effectEngine.dealDamageToUnit(defender, atkDmg, attacker.name);
            const rebound = defRemainingDEF - atkDmg;
            this.gameState.log('COMBAT', `${attackerOwner.name} takes ${rebound} rebound damage!`);
            this.effectEngine.dealDamageToLP(attackerOwner.id, rebound, `rebound from ${defender.name}`);
        } else {
            // ATK >= DEF — deal damage capped at remaining DEF (excess handled by Pierce)
            const cappedDmg = Math.min(atkDmg, defRemainingDEF);
            this.effectEngine.dealDamageToUnit(defender, cappedDmg, attacker.name);
        }

        // Pierce: if ATK > remaining DEF, excess → opponent LP
        if (attacker.keywords.includes('PIERCE') && atkDmg > defRemainingDEF) {
            const pierceDmg = atkDmg - defRemainingDEF;
            this.gameState.log('COMBAT', `${attacker.name} pierces for ${pierceDmg} damage to ${defenderOwner.name}'s LP!`);
            this.effectEngine.dealDamageToLP(defenderOwner.id, pierceDmg, `${attacker.name} Pierce`);
            // Trigger ON_DAMAGE_TO_LP so effects like S026 (Bounty Hunter) fire
            await this.effectEngine.trigger('ON_DAMAGE_TO_LP', {
                attacker,
                defender: defenderOwner,
                damage: pierceDmg,
                isCombat: true,
            });
        }

        // Check destruction
        const defenderDestroyed = defender.damageTaken >= defender.currentDEF;

        if (defenderDestroyed) {
            await this._applyOnDestroyEffects(attacker, defender, attackerOwner, defenderOwner, false, true);
            await this._checkArenaOfTrials(attacker, defender, defenderOwner, true);
            await this.effectEngine.destroyUnit(defender);
        }

        this.gameState.emit('COMBAT_RESOLVED', {
            attacker, defender,
            attackerDestroyed: false, defenderDestroyed,
        });
    }

    /**
     * Apply on-destroy-by-battle effects
     */
    async _applyOnDestroyEffects(attacker, defender, attackerOwner, defenderOwner, attackerDestroyed, defenderDestroyed) {
        // Defender destroyed effects
        if (defenderDestroyed && !defender.silenced) {
            // S006: Ember Whelp — deal 100 damage to attacker
            if (defender.cardId === 'S006') {
                this.effectEngine.dealDamageToUnit(attacker, 100, 'Ember Whelp Last Breath');
            }
        }

        // Attacker destroyed effects
        if (attackerDestroyed && !attacker.silenced) {
            // Effects that trigger when attacker is destroyed
        }

        // S029: Scavenging Hyena — +100/+100 when ANY unit destroyed
        for (const player of this.gameState.players) {
            for (const unit of player.getFieldUnits()) {
                if (unit.cardId === 'S029' && !unit.silenced) {
                    if (defenderDestroyed || attackerDestroyed) {
                        const count = (defenderDestroyed ? 1 : 0) + (attackerDestroyed ? 1 : 0);
                        this.effectEngine.applyPermStatMod(unit, 100 * count, 100 * count, 'Scavenging Hyena');
                    }
                }
            }
        }
    }

    /**
     * Check Arena of Trials (S001) Landmark effect
     * CSV: "When a southern unit in ATK position fights a non-southern unit in this region,
     *       the non-southern unit is destroyed after damage calculation."
     */
    async _checkArenaOfTrials(attacker, defender, defenderOwner, defenderDestroyed) {
        const attackerOwner = this.gameState.getPlayerById(attacker.ownerId);

        // Case 1: Defender owns the Arena — defender's Southern ATK unit fights non-Southern attacker
        if (defenderOwner.landmarkZone?.cardId === 'S001' && !defenderOwner.landmarkZone.silenced) {
            if (defender.region === 'Southern' && defender.position === 'ATK' && attacker.region !== 'Southern') {
                // Check if attacker is still on the field (may already be destroyed by combat)
                const loc = this.gameState.findCardOnField(attacker.instanceId);
                if (loc) {
                    this.gameState.log('LANDMARK', `Arena of Trials destroys ${attacker.name} after damage calculation!`);
                    await this.effectEngine.destroyUnit(attacker);
                }
            }
        }

        // Case 2: Attacker owns the Arena — attacker's Southern ATK unit fights non-Southern defender
        if (attackerOwner.landmarkZone?.cardId === 'S001' && !attackerOwner.landmarkZone.silenced) {
            if (attacker.region === 'Southern' && attacker.position === 'ATK' && defender.region !== 'Southern') {
                // Check if defender is still on the field (may already be destroyed by combat)
                const loc = this.gameState.findCardOnField(defender.instanceId);
                if (loc) {
                    this.gameState.log('LANDMARK', `Arena of Trials destroys ${defender.name} after damage calculation!`);
                    await this.effectEngine.destroyUnit(defender);
                }
            }
        }
    }

    /**
     * Apply defending player's Landmark effects during battle
     */
    async _applyDefenderLandmark(attacker, target) {
        if (target.type !== 'unit') return;
        const defenderOwner = target.player;
        const defender = target.card;

        if (!defenderOwner.landmarkZone || defenderOwner.landmarkZone.silenced) return;

        const landmark = defenderOwner.landmarkZone;

        // S002: Volcanic Forge — Southern units +200 ATK when fighting in this region
        // Only buff the specific unit that is fighting
        if (landmark.cardId === 'S002') {
            if (defender.region === 'Southern') {
                this.effectEngine.applyTempStatMod(defender, 200, 0, 'Volcanic Forge');
            }
        }
    }

    /**
     * Apply attacking player's Landmark effects during battle
     */
    async _applyAttackerLandmark(attacker, target) {
        const attackerOwner = this.gameState.getPlayerById(attacker.ownerId);
        if (!attackerOwner.landmarkZone || attackerOwner.landmarkZone.silenced) return;

        const landmark = attackerOwner.landmarkZone;

        // S002: Volcanic Forge — Southern units +200 ATK when fighting in this region
        // Only buff the specific unit that is fighting
        if (landmark.cardId === 'S002') {
            if (attacker.region === 'Southern') {
                this.effectEngine.applyTempStatMod(attacker, 200, 0, 'Volcanic Forge');
            }
        }
    }
}
