// ─────────────────────────────────────────────────────────────
// AIPlayer.js — Heuristic-based AI opponent for campaign mode
// ─────────────────────────────────────────────────────────────

import { PHASES } from './GameState.js';

export class AIPlayer {
    /**
     * @param {import('./GameController.js').GameController} controller
     * @param {number} playerId — The AI's player ID
     * @param {'easy'|'medium'|'hard'} difficulty
     */
    constructor(controller, playerId, difficulty = 'medium') {
        this.controller = controller;
        this.playerId = playerId;
        this.difficulty = difficulty;
        this.actionDelay = difficulty === 'easy' ? 600 : difficulty === 'medium' ? 450 : 350;
        this.isThinking = false;
    }

    _delay(ms) {
        return new Promise(r => setTimeout(r, ms || this.actionDelay));
    }

    /**
     * Perform the AI's full turn — called when it becomes the AI's turn.
     * Returns when the turn is fully complete.
     */
    async performTurn() {
        if (this.isThinking) return;
        this.isThinking = true;

        try {
            const gs = this.controller.gameState;

            // --- Main Phase 1 ---
            if (gs.phase === PHASES.MAIN1 || gs.phase === PHASES.MAIN2) {
                await this._playMainPhase();
            }

            // --- Battle Phase ---
            if (!gs.isFirstTurn && !gs.gameOver) {
                await this._delay();
                await this.controller.enterBattlePhase();
                this.controller._notifyUI();
                await this._delay();
                await this._playBattlePhase();

                if (!gs.gameOver && gs.phase === PHASES.BATTLE) {
                    await this._delay();
                    await this.controller.exitBattlePhase();
                    this.controller._notifyUI();
                }
            }

            // --- Main Phase 2 (play remaining cards if possible) ---
            if ((gs.phase === PHASES.MAIN2) && !gs.gameOver) {
                await this._playMainPhase();
            }

            // --- End Turn ---
            if (!gs.gameOver) {
                await this._delay();
                await this.controller.endTurn();
                this.controller._notifyUI();
            }
        } catch (err) {
            console.error('AI error:', err);
        } finally {
            this.isThinking = false;
        }
    }

    /**
     * Play cards during a Main Phase
     */
    async _playMainPhase() {
        const gs = this.controller.gameState;
        const player = gs.getPlayerById(this.playerId);
        let playedSomething = true;
        let iterations = 0;
        const maxIterations = 15; // Safety limit

        while (playedSomething && iterations < maxIterations && !gs.gameOver) {
            playedSomething = false;
            iterations++;

            // 1. Play units (prioritize by ATK, play strongest affordable)
            const unitPlays = this._getPlayableUnits(player);
            if (unitPlays.length > 0) {
                const bestUnit = this._pickBestUnit(unitPlays, player);
                if (bestUnit) {
                    await this._delay();
                    const position = this._choosePosition(bestUnit, player);
                    const result = await this.controller.playUnit(this.playerId, bestUnit.instanceId, position);
                    if (result.success) {
                        playedSomething = true;
                        this.controller._notifyUI();
                        continue;
                    }
                }
            }

            // 2. Play spells (offensive first)
            const spellPlays = this._getPlayableSpells(player);
            if (spellPlays.length > 0) {
                const spell = this._pickBestSpell(spellPlays);
                if (spell) {
                    await this._delay();
                    const result = await this.controller.playSpell(this.playerId, spell.instanceId);
                    if (result.success) {
                        playedSomething = true;
                        this.controller._notifyUI();
                        continue;
                    }
                }
            }

            // 3. Set traps (if we have spare slots)
            const trapSets = this._getSettableTraps(player);
            if (trapSets.length > 0) {
                const trap = trapSets[0]; // Set the first available trap
                await this._delay();
                const result = await this.controller.setTrap(this.playerId, trap.instanceId);
                if (result.success) {
                    playedSomething = true;
                    this.controller._notifyUI();
                    continue;
                }
            }

            // 4. Play landmarks
            const landmarkPlays = this._getPlayableLandmarks(player);
            if (landmarkPlays.length > 0) {
                await this._delay();
                const result = await this.controller.playLandmark(this.playerId, landmarkPlays[0].instanceId);
                if (result.success) {
                    playedSomething = true;
                    this.controller._notifyUI();
                    continue;
                }
            }
        }
    }

    /**
     * Declare attacks during Battle Phase
     */
    async _playBattlePhase() {
        const gs = this.controller.gameState;
        const player = gs.getPlayerById(this.playerId);
        const opponent = gs.getOpponent(this.playerId);
        if (!opponent) return;

        let attackedSomething = true;
        let iterations = 0;
        const maxIterations = 10;

        while (attackedSomething && iterations < maxIterations && !gs.gameOver && gs.phase === PHASES.BATTLE) {
            attackedSomething = false;
            iterations++;

            const attackers = player.getFieldUnits().filter(u =>
                this.controller.combatEngine.canAttack(u)
            );

            if (attackers.length === 0) break;

            for (const attacker of attackers) {
                if (gs.gameOver || gs.phase !== PHASES.BATTLE) break;

                const target = this._pickBestTarget(attacker, opponent);
                if (target) {
                    await this._delay();
                    const result = await this.controller.declareAttack(this.playerId, attacker.instanceId, target);
                    if (result.success) {
                        attackedSomething = true;
                        this.controller._notifyUI();
                    }
                }
            }
        }
    }

    // ─── Card Selection Heuristics ──────────────────────────

    _getPlayableUnits(player) {
        return player.hand.filter(c =>
            c.type === 'Unit' &&
            this.controller.actionValidator.canPlayUnit(this.playerId, c).valid
        );
    }

    _getPlayableSpells(player) {
        return player.hand.filter(c =>
            c.type === 'Spell' &&
            this.controller.actionValidator.canPlaySpell(this.playerId, c).valid
        );
    }

    _getSettableTraps(player) {
        return player.hand.filter(c =>
            c.type === 'Trap' &&
            this.controller.actionValidator.canSetTrap(this.playerId, c).valid
        );
    }

    _getPlayableLandmarks(player) {
        return player.hand.filter(c =>
            c.type === 'Landmark' &&
            this.controller.actionValidator.canPlayLandmark(this.playerId, c).valid
        );
    }

    _pickBestUnit(units, player) {
        // Easy: play randomly
        // Medium/Hard: play strongest affordable unit (highest ATK + DEF)
        if (this.difficulty === 'easy') {
            return units[Math.floor(Math.random() * units.length)];
        }
        return units.sort((a, b) => {
            const scoreA = (a.baseATK || 0) + (a.baseDEF || 0);
            const scoreB = (b.baseATK || 0) + (b.baseDEF || 0);
            return scoreB - scoreA;
        })[0];
    }

    _choosePosition(card, player) {
        // Hard: consider board state
        if (this.difficulty === 'hard') {
            const opponent = this.controller.gameState.getOpponent(this.playerId);
            const opponentUnits = opponent ? opponent.getFieldUnits() : [];
            // If opponent has strong attackers on board, DEF position for weaker units
            if (opponentUnits.some(u => u.currentATK > card.baseATK) && card.baseDEF > card.baseATK) {
                return 'DEF';
            }
        }
        // Default: ATK position for aggressive play
        return card.baseATK > 0 ? 'ATK' : 'DEF';
    }

    _pickBestSpell(spells) {
        if (this.difficulty === 'easy') {
            return spells[Math.floor(Math.random() * spells.length)];
        }
        // Prefer higher-cost spells (usually more impactful)
        return spells.sort((a, b) => (b.manaCost || 0) - (a.manaCost || 0))[0];
    }

    _pickBestTarget(attacker, opponent) {
        const opponentUnits = opponent.getFieldUnits();
        const targets = this.controller.combatEngine.getValidTargets(this.playerId);

        if (targets.length === 0) return null;

        // If no opponent units, go for direct attack
        if (opponentUnits.length === 0) {
            const directTarget = targets.find(t => t.type === 'direct' && !t.requiresShadow);
            return directTarget || null;
        }

        // Filter to targets we can actually hit
        const validTargets = targets.filter(t => this.controller.combatEngine.canTarget(attacker, t));
        if (validTargets.length === 0) return null;

        // Try direct attack with shadow
        if (attacker.keywords?.includes('SHADOW')) {
            const directTarget = validTargets.find(t => t.type === 'direct');
            if (directTarget) return directTarget;
        }

        // Attack weakest unit we can destroy
        const unitTargets = validTargets.filter(t => t.type === 'unit');
        if (unitTargets.length === 0) {
            return validTargets.find(t => t.type === 'direct') || null;
        }

        // Sort by remaining DEF (attack weakest first)
        const sorted = unitTargets.sort((a, b) => {
            const aHP = (a.card.currentDEF || 0) - (a.card.damageTaken || 0);
            const bHP = (b.card.currentDEF || 0) - (b.card.damageTaken || 0);
            return aHP - bHP;
        });

        // Hard: prefer targets we can actually destroy
        if (this.difficulty === 'hard' || this.difficulty === 'medium') {
            const canKill = sorted.find(t => {
                const remainHP = (t.card.currentDEF || 0) - (t.card.damageTaken || 0);
                return attacker.currentATK >= remainHP;
            });
            if (canKill) return canKill;
        }

        return sorted[0];
    }

    // ─── Landmark Selection ─────────────────────────────────

    /**
     * Auto-select a landmark for the AI.
     * Returns the cardId of the chosen landmark.
     */
    chooseLandmark(landmarks) {
        if (!landmarks || landmarks.length === 0) return null;
        // Pick the first available landmark
        return landmarks[0].id;
    }

    // ─── Mulligan Logic ────────────────────────────────────

    /**
     * Decide which cards to mulligan.
     * Returns an array of instanceIds to mulligan.
     */
    chooseMulligan(hand) {
        if (!hand || hand.length === 0) return [];

        // Easy: keep everything
        if (this.difficulty === 'easy') return [];

        // Medium/Hard: mulligan cards that cost too much (>4 mana)
        const toMulligan = hand
            .filter(c => c.manaCost > 4)
            .map(c => c.instanceId);

        return toMulligan;
    }

    /**
     * Auto-handle target selection for the AI
     */
    chooseTarget(targets, description) {
        if (!targets || targets.length === 0) return null;

        // For damage spells: target weakest enemy unit
        const enemyUnits = targets.filter(t =>
            t.ownerId !== undefined && t.ownerId !== this.playerId
        );
        if (enemyUnits.length > 0) {
            return enemyUnits.sort((a, b) =>
                ((a.currentDEF || 0) - (a.damageTaken || 0)) -
                ((b.currentDEF || 0) - (b.damageTaken || 0))
            )[0];
        }

        // For buffs: target strongest friendly unit
        const friendlyUnits = targets.filter(t =>
            t.ownerId !== undefined && t.ownerId === this.playerId
        );
        if (friendlyUnits.length > 0) {
            return friendlyUnits.sort((a, b) =>
                ((b.currentATK || 0) + (b.currentDEF || 0)) -
                ((a.currentATK || 0) + (a.currentDEF || 0))
            )[0];
        }

        // Default: pick first
        return targets[0];
    }

    /**
     * Auto-handle choice selection for the AI
     */
    chooseOption(options, description) {
        if (!options || options.length === 0) return null;
        // Default: pick first option
        return options[0];
    }
}
