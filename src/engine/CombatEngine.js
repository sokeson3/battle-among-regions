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
        // W008/W048: Unit was locked from attacking by previous turn's effect
        if (unit._cannotAttackNextTurn) return false;
        // N007: Ice Wall Sentinel — cannot attack
        if (unit.cardId === 'N007' && !unit.silenced) return false;
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

            // W020: Guardian Golem — opponents cannot attack LP directly
            const hasGuardianGolem = opponentUnits.some(u => u.cardId === 'W020' && !u.silenced);
            if (hasGuardianGolem) return false;

            // E040: Smoke Screen — direct LP attacks blocked this turn
            if (opponent._smokeScreenActive) return false;

            if (opponentUnits.length === 0) return true;

            // Taunt units (N021 Jarl) block all direct attacks, even from SHADOW
            const hasTaunt = opponentUnits.some(u =>
                !u.silenced && (u.cardId === 'N021')
            );
            if (hasTaunt) return false;

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
        this.effectEngine._isCombatDamage = true;
        this.effectEngine.dealDamageToLP(defendingPlayer.id, damage, attacker.name);
        this.effectEngine._isCombatDamage = false;

        // S023: Ancient Phoenix — track LP damage for return-to-hand
        attacker._dealtLPDamage = true;

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

        // Suppress auto-destroy so both units take damage before destruction checks
        this.effectEngine._suppressAutoDestroy = true;

        // Damage to defender
        const excessToDefender = Math.max(0, atkDmg - defRemainingDEF);
        await this.effectEngine.dealDamageToUnit(defender, atkDmg, attacker.name);

        // Damage to attacker
        const excessToAttacker = Math.max(0, defDmg - atkRemainingDEF);
        await this.effectEngine.dealDamageToUnit(attacker, defDmg, defender.name);

        // Re-enable auto-destroy
        this.effectEngine._suppressAutoDestroy = false;

        // Excess damage to LP
        if (excessToDefender > 0) {
            this.gameState.log('COMBAT', `${attacker.name} deals ${excessToDefender} excess damage to ${defenderOwner.name}'s LP!`);
            this.effectEngine._isCombatDamage = true;
            this.effectEngine.dealDamageToLP(defenderOwner.id, excessToDefender, attacker.name);
            this.effectEngine._isCombatDamage = false;
            // S023: Ancient Phoenix — track LP damage
            attacker._dealtLPDamage = true;
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
            this.effectEngine._isCombatDamage = true;
            this.effectEngine.dealDamageToLP(attackerOwner.id, excessToAttacker, defender.name);
            this.effectEngine._isCombatDamage = false;
        }

        // Check for destroyed units
        const defenderDestroyed = defender.damageTaken >= defender.currentDEF;
        const attackerDestroyed = attacker.damageTaken >= attacker.currentDEF;

        // Apply special effects before destruction
        await this._applyOnDestroyEffects(attacker, defender, attackerOwner, defenderOwner, attackerDestroyed, defenderDestroyed);

        // Check S001 Arena of Trials Landmark
        await this._checkArenaOfTrials(attacker, defender, defenderOwner, defenderDestroyed);

        // Tag destroyed units with who killed them in battle
        if (defenderDestroyed) defender._lastBattleKiller = attacker.instanceId;
        if (attackerDestroyed) attacker._lastBattleKiller = defender.instanceId;

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
            await this.effectEngine.dealDamageToUnit(defender, atkDmg, attacker.name);
            const rebound = defRemainingDEF - atkDmg;
            this.gameState.log('COMBAT', `${attackerOwner.name} takes ${rebound} rebound damage!`);
            this.effectEngine._isCombatDamage = true;
            this.effectEngine.dealDamageToLP(attackerOwner.id, rebound, `rebound from ${defender.name}`);
            this.effectEngine._isCombatDamage = false;
        } else {
            // ATK >= DEF — deal full ATK as damage (dealDamageToUnit handles reductions like N011)
            await this.effectEngine.dealDamageToUnit(defender, atkDmg, attacker.name);
        }

        // Pierce: if ATK > remaining DEF, excess → opponent LP
        if (attacker.keywords.includes('PIERCE') && atkDmg > defRemainingDEF) {
            const pierceDmg = atkDmg - defRemainingDEF;
            this.gameState.log('COMBAT', `${attacker.name} pierces for ${pierceDmg} damage to ${defenderOwner.name}'s LP!`);
            this.effectEngine._isCombatDamage = true;
            this.effectEngine.dealDamageToLP(defenderOwner.id, pierceDmg, `${attacker.name} Pierce`);
            this.effectEngine._isCombatDamage = false;
            // S023: Ancient Phoenix — track LP damage
            attacker._dealtLPDamage = true;
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
            // Tag with battle killer for W022/S025
            defender._lastBattleKiller = attacker.instanceId;
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
                await this.effectEngine.dealDamageToUnit(attacker, 100, 'Ember Whelp Last Breath');
            }
        }

        // N023: The Great White Bear — heal 200 LP when destroying enemy unit by battle
        if (defenderDestroyed && !attacker.silenced && attacker.cardId === 'N023') {
            const owner = this.gameState.getPlayerById(attacker.ownerId);
            if (owner) {
                this.effectEngine.healLP(owner.id, 200, 'The Great White Bear');
            }
        }

        // Attacker destroyed effects
        if (attackerDestroyed && !attacker.silenced) {
            // Effects that trigger when attacker is destroyed
        }

        // Note: S029 Scavenging Hyena is now handled universally in EffectEngine.destroyUnit()
    }

    /**
     * Check Arena of Trials (S001) Landmark effect
     * CSV: "When a southern unit in ATK position fights a non-southern unit in this region,
     *       the non-southern unit is destroyed after damage calculation."
     * "In this region" = the defender's landmark zone (battle happens at defender's side).
     */
    async _checkArenaOfTrials(attacker, defender, defenderOwner, defenderDestroyed) {
        // S001 only applies when it's in the defender's landmark zone
        if (defenderOwner.landmarkZone?.cardId !== 'S001' || defenderOwner.landmarkZone.silenced) return;

        // Case 1: Defender is Southern ATK, attacker is non-Southern → destroy attacker
        if (defender.region === 'Southern' && defender.position === 'ATK' && attacker.region !== 'Southern') {
            const loc = this.gameState.findCardOnField(attacker.instanceId);
            if (loc) {
                this.gameState.log('LANDMARK', `Arena of Trials destroys ${attacker.name} after damage calculation!`);
                await this.effectEngine.destroyUnit(attacker);
            }
        }

        // Case 2: Attacker is Southern ATK, defender is non-Southern → destroy defender
        if (attacker.region === 'Southern' && attacker.position === 'ATK' && defender.region !== 'Southern') {
            const loc = this.gameState.findCardOnField(defender.instanceId);
            if (loc) {
                this.gameState.log('LANDMARK', `Arena of Trials destroys ${defender.name} after damage calculation!`);
                await this.effectEngine.destroyUnit(defender);
            }
        }
    }

    /**
     * Apply defending player's Landmark effects during battle
     * "In this region" = the defender's landmark zone (battle happens at defender's side)
     */
    async _applyDefenderLandmark(attacker, target) {
        if (target.type !== 'unit') return;
        const defenderOwner = target.player;
        const defender = target.card;

        if (!defenderOwner.landmarkZone || defenderOwner.landmarkZone.silenced) return;

        const landmark = defenderOwner.landmarkZone;

        // S002: Volcanic Forge — Southern units +200 ATK when fighting in this region
        // Both attacker and defender get the buff if they are Southern
        if (landmark.cardId === 'S002') {
            if (defender.region === 'Southern') {
                this.effectEngine.applyTempStatMod(defender, 200, 0, 'Volcanic Forge');
            }
            if (attacker.region === 'Southern') {
                this.effectEngine.applyTempStatMod(attacker, 200, 0, 'Volcanic Forge');
            }
        }
    }

    /**
     * Apply attacking player's Landmark effects during battle
     */
    async _applyAttackerLandmark(attacker, target) {
        const attackerOwner = this.gameState.getPlayerById(attacker.ownerId);
        if (!attackerOwner.landmarkZone || attackerOwner.landmarkZone.silenced) return;

        // S002: NOT applied here — attacker is attacking "out" of the region
        // Other attacker landmarks can be added here in the future
    }
}
