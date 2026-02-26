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
        return true;
    }

    /**
     * Get valid attack targets for a unit
     */
    getValidTargets(attackerOwnerId) {
        const targets = [];
        const opponents = this.gameState.getOpponents(attackerOwnerId);

        for (const opponent of opponents) {
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
            // Check for taunt-like effects (Jarl N021, Guardian Golem W020)
            const opponent = target.player;
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

        // Apply defending player's Landmark effects
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
            // ATK is less than DEF — attacker owner takes rebound LP damage
            const rebound = defRemainingDEF - atkDmg;
            this.gameState.log('COMBAT', `${attackerOwner.name} takes ${rebound} rebound damage!`);
            this.effectEngine.dealDamageToLP(attackerOwner.id, rebound, `rebound from ${defender.name}`);
            // Defender does NOT take damage when attacker ATK < DEF
        } else {
            // ATK >= DEF — deal damage to defender
            this.effectEngine.dealDamageToUnit(defender, atkDmg, attacker.name);
        }

        // Pierce: if ATK > remaining DEF, excess → opponent LP
        if (attacker.keywords.includes('PIERCE') && atkDmg > defRemainingDEF) {
            const pierceDmg = atkDmg - defRemainingDEF;
            this.gameState.log('COMBAT', `${attacker.name} pierces for ${pierceDmg} damage to ${defenderOwner.name}'s LP!`);
            this.effectEngine.dealDamageToLP(defenderOwner.id, pierceDmg, `${attacker.name} Pierce`);
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
     */
    async _checkArenaOfTrials(attacker, defender, defenderOwner, defenderDestroyed) {
        // S001: Arena of Trials — if Southern unit in ATK position fights a non-southern unit, destroy the non-southern unit
        if (defenderOwner.landmarkZone?.cardId === 'S001' && !defenderOwner.landmarkZone.silenced) {
            if (attacker.region !== 'Southern' && defender.region === 'Southern' && defender.position === 'ATK') {
                if (!defenderDestroyed) {
                    // Wait, the rule is: non-southern unit is destroyed after damage calculation
                    // This happens after damage is calculated
                }
                // Actually — the landmark is the defender's, so if a non-southern unit attacks a southern unit in this region
                // the non-southern unit is destroyed after damage calculation
                // Let's reconsider: "When a southern unit in ATK position fights a non-southern unit in this region"
                // If the defender owns the landmark and controls a southern unit in ATK...
                // The attacker (non-southern) is destroyed after damage.
                const attackerLocation = this.gameState.findCardOnField(attacker.instanceId);
                if (attackerLocation && attacker.region !== 'Southern') {
                    this.gameState.log('LANDMARK', `Arena of Trials destroys ${attacker.name} after damage calculation!`);
                    await this.effectEngine.destroyUnit(attacker);
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

        if (!defenderOwner.landmarkZone || defenderOwner.landmarkZone.silenced) return;

        const landmark = defenderOwner.landmarkZone;

        // N001: Frostfell Citadel — +200 DEF to units in defense position
        // Now handled as a registered effect in NorthernEffects.js

        // S002: Volcanic Forge — Southern units +200 ATK
        if (landmark.cardId === 'S002') {
            for (const unit of defenderOwner.getFieldUnits()) {
                if (unit.region === 'Southern') {
                    this.effectEngine.applyTempStatMod(unit, 200, 0, 'Volcanic Forge');
                }
            }
        }
    }
}
