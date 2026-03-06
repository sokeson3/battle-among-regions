// ─────────────────────────────────────────────────────────────
// SouthernEffects.js — All Southern region card effects
// ─────────────────────────────────────────────────────────────

import { EFFECT_EVENTS, createEffect } from '../engine/EffectEngine.js';

export function register(effectEngine, cardDB) {

    // ─── LANDMARKS ────────────────────────────────────────────

    // S001: Arena of Trials — non-Southern destroyed after dmg calc (handled in CombatEngine)
    // S002: Volcanic Forge — Southern +200 ATK (handled in CombatEngine._applyDefenderLandmark)

    // S038: Scorched Earth — +200 dmg for spells/traps that deal damage
    // Sets a flag BEFORE spell execution (ON_SPELL_ACTIVATE) so bonus damage is applied
    // during the spell's dealDamageToUnit/dealDamageToLP calls.
    effectEngine.registerCardEffects('S038', [
        createEffect({
            cardId: 'S038',
            trigger: EFFECT_EVENTS.ON_SPELL_ACTIVATE,
            description: 'Spells/traps deal +200 damage',
            priority: 1, // Execute before the spell resolves
            condition: (gs, ctx) => {
                const owner = gs.players.find(p => p.landmarkZone?.cardId === 'S038');
                return owner && ctx.caster?.id === owner.id;
            },
            execute: (gs, ctx, ee) => {
                const owner = gs.players.find(p => p.landmarkZone?.cardId === 'S038');
                if (owner) {
                    owner._scorchedEarthActive = true;
                    gs.log('LANDMARK', 'Scorched Earth: Spell/Trap deals +200 damage!');
                }
            },
        }),
        // Clear the flag after the spell resolves (ON_SPELL_PLAY fires after execution)
        createEffect({
            cardId: 'S038',
            trigger: EFFECT_EVENTS.ON_SPELL_PLAY,
            description: 'Clear Scorched Earth bonus',
            priority: 10, // Execute after other ON_SPELL_PLAY effects
            condition: (gs, ctx) => {
                const owner = gs.players.find(p => p.landmarkZone?.cardId === 'S038');
                return owner && owner._scorchedEarthActive;
            },
            execute: (gs, ctx, ee) => {
                const owner = gs.players.find(p => p.landmarkZone?.cardId === 'S038');
                if (owner) {
                    owner._scorchedEarthActive = false;
                }
            },
        }),
    ]);

    // ─── UNITS ────────────────────────────────────────────────

    // S003: Sunspear Recruit — Rush (keyword only)

    // S004: Desert Scuttler — When Summoned: Deal 100 to all opponents' LP
    effectEngine.registerCardEffects('S004', [
        createEffect({
            cardId: 'S004',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Deal 100 damage to all opponents\' LP',
            execute: (gs, ctx, ee) => {
                for (const opponent of gs.getOpponents(ctx.sourcePlayer.id)) {
                    ee.dealDamageToLP(opponent.id, 100, 'Desert Scuttler');
                }
            },
        }),
    ]);

    // S005: Aspiring Gladiator — Rush (keyword only)

    // S006: Ember Whelp — On destroy: deal 100 to destroyer (handled in CombatEngine)

    // S007: Dune Stalker — Rush (keyword only)

    // S008: Blazefist Initiate — When Summoned: +200 ATK to another friendly this turn
    effectEngine.registerCardEffects('S008', [
        createEffect({
            cardId: 'S008',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Give another friendly unit +200 ATK this turn',
            requiresTarget: true,
            targetType: 'friendly_unit',
            targets: (gs, ctx) => ctx.sourcePlayer.getFieldUnits().filter(u => u.instanceId !== ctx.source.instanceId),
            execute: (gs, ctx, ee) => {
                if (ctx.target) ee.applyTempStatMod(ctx.target, 200, 0, 'Blazefist Initiate');
            },
        }),
    ]);

    // S009: Mercenary Scout — Rush (keyword only)

    // S010: Seasoned Pit Fighter — Pierce (keyword only)

    // S011: Sunreaver Priest — When another friendly attacks: 200 dmg to defender's LP
    effectEngine.registerCardEffects('S011', [
        createEffect({
            cardId: 'S011',
            trigger: EFFECT_EVENTS.ON_ATTACK_DECLARE,
            description: 'Deal 200 damage to defending player',
            condition: (gs, ctx) => {
                return ctx.attacker?.ownerId === ctx.source?.ownerId &&
                    ctx.attacker?.instanceId !== ctx.source?.instanceId;
            },
            execute: (gs, ctx, ee) => {
                // Find defending player: for unit attacks, use defenderOwner;
                // for direct LP attacks, use target.player
                const defender = ctx.defenderOwner || ctx.target?.player;
                if (!defender) {
                    // Fallback: find the opponent being attacked
                    const attackerOwner = gs.getPlayerById(ctx.attacker?.ownerId);
                    if (attackerOwner) {
                        const opponent = gs.getOpponent(attackerOwner.id);
                        if (opponent) {
                            ee.dealDamageToLP(opponent.id, 200, 'Sunreaver Priest');
                        }
                    }
                } else {
                    ee.dealDamageToLP(defender.id, 200, 'Sunreaver Priest');
                }
            },
        }),
    ]);

    // S012: Obsidian Guard — End of turn: 200 to ALL players (handled in TurnManager)

    // S013: Reckless Berserker — Pierce. -200 DEF at turn start (handled in TurnManager)

    // S014: Magma Hound — No effect (vanilla)

    // S015: Arena Champion — When Summoned: 200 dmg to enemy unit
    effectEngine.registerCardEffects('S015', [
        createEffect({
            cardId: 'S015',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Deal 200 damage to an enemy unit',
            requiresTarget: true,
            targetType: 'enemy_unit',
            targets: (gs, ctx) => gs.getOpponents(ctx.sourcePlayer.id).flatMap(o => o.getFieldUnits()),
            execute: async (gs, ctx, ee) => {
                if (ctx.target) {
                    await ee.dealDamageToUnit(ctx.target, 200, 'Arena Champion');
                }
            },
        }),
    ]);

    // S016: Firebreather Nomad — End of turn: 100 to ALL other units (handled in TurnManager)

    // S017: Executioner — Rush. Must attack or be destroyed (handled in TurnManager)

    // S018: Molten Golem — When Summoned: 100 dmg to all enemy units
    effectEngine.registerCardEffects('S018', [
        createEffect({
            cardId: 'S018',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Deal 100 damage to all enemy units',
            execute: async (gs, ctx, ee) => {
                const enemies = gs.getOpponents(ctx.sourcePlayer.id).flatMap(o => o.getFieldUnits());
                for (const unit of enemies) {
                    await ee.dealDamageToUnit(unit, 100, 'Molten Golem');
                }
            },
        }),
    ]);

    // S021: Warlord of the Scorch — When Summoned: All friendly Southern get Pierce this turn
    effectEngine.registerCardEffects('S021', [
        createEffect({
            cardId: 'S021',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'All friendly Southern units gain Pierce this turn',
            execute: (gs, ctx, ee) => {
                for (const unit of ctx.sourcePlayer.getFieldUnits()) {
                    if (unit.region === 'Southern' && !unit.keywords.includes('PIERCE')) {
                        unit.keywords.push('PIERCE');
                        unit._tempPierce = true;
                        gs.log('EFFECT', `${unit.name} gains Pierce this turn!`);
                    }
                }
            },
        }),
    ]);

    // S022: Inferno Titan — Pierce. On LP damage: +300 extra
    effectEngine.registerCardEffects('S022', [
        createEffect({
            cardId: 'S022',
            trigger: EFFECT_EVENTS.ON_DAMAGE_TO_LP,
            description: 'Deal 300 extra damage on LP hit',
            condition: (gs, ctx) => ctx.attacker?.cardId === 'S022' && ctx.isCombat,
            execute: (gs, ctx, ee) => {
                ee.dealDamageToLP(ctx.defender.id, 300, 'Inferno Titan burn');
            },
        }),
    ]);

    // S023: Ancient Phoenix — Rush. When destroyed: if dealt LP dmg while attacking this turn, return to hand
    effectEngine.registerCardEffects('S023', [
        createEffect({
            cardId: 'S023',
            trigger: EFFECT_EVENTS.ON_SELF_DESTROY,
            description: 'Return to hand if it dealt LP damage this turn',
            condition: (gs, ctx) => ctx.destroyedCard?.cardId === 'S023',
            execute: (gs, ctx, ee) => {
                // Check if phoenix dealt LP damage (tracked via flag)
                if (ctx.destroyedCard._dealtLPDamage) {
                    const owner = ctx.destroyedPlayer;
                    // Remove from graveyard and add to hand
                    const idx = owner.graveyard.findIndex(c => c.instanceId === ctx.destroyedCard.instanceId);
                    if (idx >= 0) {
                        const card = owner.graveyard.splice(idx, 1)[0];
                        card.damageTaken = 0;
                        card.currentATK = card.baseATK;
                        card.currentDEF = card.baseDEF;
                        owner.hand.push(card);
                        gs.log('EFFECT', 'Ancient Phoenix rises from the ashes and returns to hand!');
                    }
                }
            },
        }),
    ]);

    // S024: Colossus of the Sun — Pierce (keyword only)

    // S025: Charging Rhino — First kill each round: can attack again (battle kills only)
    effectEngine.registerCardEffects('S025', [
        createEffect({
            cardId: 'S025',
            trigger: EFFECT_EVENTS.ON_DESTROY,
            description: 'Can make a second attack after first kill in battle',
            condition: (gs, ctx) => {
                // Check if the Rhino destroyed a unit IN BATTLE
                if (ctx.destroyedCard?.ownerId === ctx.source?.ownerId) return false;
                if (ctx.destroyedCard?._lastBattleKiller !== ctx.source?.instanceId) return false;
                return !ctx.source?._rhinoUsedDoubleAttack;
            },
            execute: (gs, ctx, ee) => {
                if (ctx.source) {
                    ctx.source.maxAttacks = 2;
                    ctx.source._rhinoUsedDoubleAttack = true;
                    gs.log('EFFECT', 'Charging Rhino charges again!');
                }
            },
        }),
    ]);

    // S026: Bounty Hunter — On LP damage: draw 1
    effectEngine.registerCardEffects('S026', [
        createEffect({
            cardId: 'S026',
            trigger: EFFECT_EVENTS.ON_DAMAGE_TO_LP,
            description: 'Draw 1 card on LP damage',
            condition: (gs, ctx) => ctx.attacker?.cardId === 'S026' && ctx.isCombat,
            execute: (gs, ctx, ee) => {
                ee.drawCards(ctx.source?.ownerId || ctx.attacker?.ownerId, 1);
            },
        }),
    ]);

    // S027: Siege Engineer — When Summoned: Switch 2 Landmarks or move 1
    effectEngine.registerCardEffects('S027', [
        createEffect({
            cardId: 'S027',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Switch 2 Landmarks or move one to empty slot',
            execute: async (gs, ctx, ee) => {
                const withLandmarks = gs.players.filter(p => p.landmarkZone);
                const withoutLandmarks = gs.players.filter(p => !p.landmarkZone);

                if (withLandmarks.length >= 2) {
                    const choice = await ee.requestChoice(
                        [{ label: 'Switch 2 Landmarks', value: 'switch' }, { label: 'Move a Landmark', value: 'move' }],
                        'Siege Engineer: Choose action'
                    );
                    if (choice?.value === 'switch') {
                        ee._cleanupLandmarkBuffs(withLandmarks[0], withLandmarks[0].landmarkZone);
                        ee._cleanupLandmarkBuffs(withLandmarks[1], withLandmarks[1].landmarkZone);
                        const temp = withLandmarks[0].landmarkZone;
                        withLandmarks[0].landmarkZone = withLandmarks[1].landmarkZone;
                        withLandmarks[1].landmarkZone = temp;
                        gs.log('EFFECT', 'Landmarks switched!');
                        // Trigger landmark-placed for each moved landmark
                        await ee.trigger(EFFECT_EVENTS.ON_LANDMARK_PLACED, { landmark: withLandmarks[0].landmarkZone, placer: ctx.sourcePlayer, targetPlayer: withLandmarks[0] });
                        await ee.trigger(EFFECT_EVENTS.ON_LANDMARK_PLACED, { landmark: withLandmarks[1].landmarkZone, placer: ctx.sourcePlayer, targetPlayer: withLandmarks[1] });
                    } else if (choice?.value === 'move' && withoutLandmarks.length > 0) {
                        const landmark = withLandmarks[0].landmarkZone;
                        ee._cleanupLandmarkBuffs(withLandmarks[0], landmark);
                        withLandmarks[0].landmarkZone = null;
                        withoutLandmarks[0].landmarkZone = landmark;
                        gs.log('EFFECT', `${landmark.name} moved to ${withoutLandmarks[0].name}'s zone!`);
                        await ee.trigger(EFFECT_EVENTS.ON_LANDMARK_PLACED, { landmark, placer: ctx.sourcePlayer, targetPlayer: withoutLandmarks[0] });
                    }
                } else if (withLandmarks.length === 1 && withoutLandmarks.length > 0) {
                    const landmark = withLandmarks[0].landmarkZone;
                    ee._cleanupLandmarkBuffs(withLandmarks[0], landmark);
                    withLandmarks[0].landmarkZone = null;
                    withoutLandmarks[0].landmarkZone = landmark;
                    gs.log('EFFECT', `${landmark.name} moved!`);
                    await ee.trigger(EFFECT_EVENTS.ON_LANDMARK_PLACED, { landmark, placer: ctx.sourcePlayer, targetPlayer: withoutLandmarks[0] });
                }
            },
        }),
    ]);

    // S028: Veteran Duelist — Rush (keyword only)

    // S029: Scavenging Hyena — Pierce. +100/+100 per unit destroyed (handled in CombatEngine)

    // S030: Pyromancer Adept — When you play a Spell: deal 100 dmg to an opponent
    effectEngine.registerCardEffects('S030', [
        createEffect({
            cardId: 'S030',
            trigger: EFFECT_EVENTS.ON_SPELL_PLAY,
            description: 'Deal 100 damage to opponent (unit or LP)',
            condition: (gs, ctx) => ctx.caster?.id === ctx.source?.ownerId,
            requiresTarget: true,
            targets: (gs, ctx) => {
                const opponents = gs.getOpponents(ctx.source.ownerId);
                const enemyUnits = opponents.flatMap(o => o.getFieldUnits());
                const lpTargets = opponents.map(o => ({ type: 'lp', player: o, name: `${o.name}'s LP` }));
                return [...enemyUnits, ...lpTargets];
            },
            execute: async (gs, ctx, ee) => {
                if (ctx.target?.type === 'lp') {
                    ee.dealDamageToLP(ctx.target.player.id, 100, 'Pyromancer Adept');
                } else if (ctx.target) {
                    await ee.dealDamageToUnit(ctx.target, 100, 'Pyromancer Adept');
                }
            },
        }),
    ]);

    // ─── SPELLS ───────────────────────────────────────────────

    // S031: Sharpen Blade — +300 ATK this turn
    effectEngine.registerCardEffects('S031', [
        createEffect({
            cardId: 'S031',
            trigger: 'SELF',
            description: 'Give a friendly unit +300 ATK this turn',
            requiresTarget: true,
            targets: (gs, ctx) => ctx.sourcePlayer.getFieldUnits(),
            execute: (gs, ctx, ee) => {
                if (ctx.target) ee.applyTempStatMod(ctx.target, 300, 0, 'Sharpen Blade');
            },
        }),
    ]);

    // S032: Quick Strike — Deal 100 dmg to enemy unit
    effectEngine.registerCardEffects('S032', [
        createEffect({
            cardId: 'S032',
            trigger: 'SELF',
            description: 'Deal 100 damage to an enemy unit',
            requiresTarget: true,
            targetType: 'enemy_unit',
            targets: (gs, ctx) => gs.getOpponents(ctx.sourcePlayer.id).flatMap(o => o.getFieldUnits()),
            execute: async (gs, ctx, ee) => {
                if (ctx.target) {
                    await ee.dealDamageToUnit(ctx.target, 100, 'Quick Strike');
                }
            },
        }),
    ]);

    // S033: Battle Fury — All friendly +100 ATK this turn
    effectEngine.registerCardEffects('S033', [
        createEffect({
            cardId: 'S033',
            trigger: 'SELF',
            description: '+100 ATK to all friendly units this turn',
            execute: (gs, ctx, ee) => {
                for (const unit of ctx.sourcePlayer.getFieldUnits()) {
                    ee.applyTempStatMod(unit, 100, 0, 'Battle Fury');
                }
            },
        }),
    ]);

    // S034: Searing Bolt — 300 dmg to enemy unit or LP
    effectEngine.registerCardEffects('S034', [
        createEffect({
            cardId: 'S034',
            trigger: 'SELF',
            description: 'Deal 300 damage to enemy unit or LP',
            requiresTarget: true,
            targets: (gs, ctx) => {
                const opponents = gs.getOpponents(ctx.sourcePlayer.id);
                const targets = opponents.flatMap(o => o.getFieldUnits());
                targets.push(...opponents.map(o => ({ type: 'lp', player: o, name: `${o.name}'s LP` })));
                return targets;
            },
            execute: async (gs, ctx, ee) => {
                if (ctx.target?.type === 'lp') {
                    ee.dealDamageToLP(ctx.target.player.id, 300, 'Searing Bolt');
                } else if (ctx.target) {
                    await ee.dealDamageToUnit(ctx.target, 300, 'Searing Bolt');
                }
            },
        }),
    ]);

    // S035: Challenge — Choose a region, force friendly vs enemy combat with landmark bonuses
    effectEngine.registerCardEffects('S035', [
        createEffect({
            cardId: 'S035',
            trigger: 'SELF',
            description: 'Choose a region, then force a friendly and enemy unit to fight',
            execute: async (gs, ctx, ee) => {
                // Step 1: Choose friendly unit
                const friendlies = ctx.sourcePlayer.getFieldUnits();
                if (friendlies.length === 0) {
                    gs.log('EFFECT', 'Challenge: No friendly units!');
                    return;
                }
                const friendlyChoice = await ee.requestTarget(friendlies, 'Choose your unit to fight');
                if (!friendlyChoice) return;

                // Step 2: Choose enemy unit
                const enemies = gs.getOpponents(ctx.sourcePlayer.id).flatMap(o => o.getFieldUnits());
                if (enemies.length === 0) {
                    gs.log('EFFECT', 'Challenge: No enemy units!');
                    return;
                }
                const enemyChoice = await ee.requestTarget(enemies, 'Choose an enemy unit to fight');
                if (!enemyChoice) return;

                const attacker = friendlyChoice;
                const defender = enemyChoice;
                const attackerOwner = ctx.sourcePlayer;
                const defenderOwner = gs.getPlayerById(defender.ownerId);

                // Step 3: Choose which region (landmark) the battle happens in
                const landmarkOptions = [];
                for (const p of gs.players) {
                    if (p.landmarkZone && !p.landmarkZone.silenced) {
                        landmarkOptions.push({
                            label: `${p.landmarkZone.name} (${p.name}'s region)`,
                            value: p.id,
                            cardId: p.landmarkZone.cardId,
                        });
                    }
                }

                let chosenLandmark = null;
                let chosenLandmarkOwner = null;
                if (landmarkOptions.length >= 2) {
                    const regionChoice = await ee.requestChoice(landmarkOptions, 'Choose which region to battle in');
                    if (regionChoice) {
                        chosenLandmarkOwner = gs.getPlayerById(regionChoice.value);
                        chosenLandmark = chosenLandmarkOwner.landmarkZone;
                    }
                } else if (landmarkOptions.length === 1) {
                    chosenLandmarkOwner = gs.getPlayerById(landmarkOptions[0].value);
                    chosenLandmark = chosenLandmarkOwner.landmarkZone;
                }

                gs.log('EFFECT', `Challenge! ${attacker.name} fights ${defender.name}${chosenLandmark ? ` in ${chosenLandmark.name}'s region` : ''}!`);

                // Step 4: Apply chosen landmark's combat bonuses
                if (chosenLandmark) {
                    // S002: Volcanic Forge — Southern units +200 ATK
                    if (chosenLandmark.cardId === 'S002') {
                        if (attacker.region === 'Southern') {
                            ee.applyTempStatMod(attacker, 200, 0, 'Volcanic Forge (Challenge)');
                        }
                        if (defender.region === 'Southern') {
                            ee.applyTempStatMod(defender, 200, 0, 'Volcanic Forge (Challenge)');
                        }
                    }
                    // Add other landmark combat effects here as needed
                }

                // Step 5: Resolve combat — respect defender position
                const atkDmg = Math.max(0, attacker.currentATK);

                if (defender.position === 'DEF') {
                    // ATK vs DEF: only attacker deals damage, no counter-damage
                    const defRemainingDEF = defender.currentDEF - defender.damageTaken;
                    if (atkDmg < defRemainingDEF) {
                        // Attacker's ATK less than defender's remaining DEF — rebound LP damage
                        await ee.dealDamageToUnit(defender, atkDmg, `Challenge (${attacker.name})`);
                        const rebound = defRemainingDEF - atkDmg;
                        ee.dealDamageToLP(attackerOwner.id, rebound, `Challenge rebound from ${defender.name}`);
                    } else {
                        await ee.dealDamageToUnit(defender, atkDmg, `Challenge (${attacker.name})`);
                        // Pierce from Challenge attacker
                        if (attacker.keywords.includes('PIERCE') && atkDmg > defRemainingDEF) {
                            const pierceDmg = atkDmg - defRemainingDEF;
                            ee.dealDamageToLP(defenderOwner.id, pierceDmg, `Challenge Pierce (${attacker.name})`);
                        }
                    }
                } else {
                    // ATK vs ATK: both deal damage simultaneously
                    const defDmg = Math.max(0, defender.currentATK);
                    const defRemainingDEF = defender.currentDEF - defender.damageTaken;
                    const atkRemainingDEF = attacker.currentDEF - attacker.damageTaken;

                    // Suppress auto-destroy for simultaneous damage
                    ee._suppressAutoDestroy = true;
                    const excessToDefender = Math.max(0, atkDmg - defRemainingDEF);
                    await ee.dealDamageToUnit(defender, atkDmg, `Challenge (${attacker.name})`);
                    const excessToAttacker = Math.max(0, defDmg - atkRemainingDEF);
                    await ee.dealDamageToUnit(attacker, defDmg, `Challenge (${defender.name})`);
                    ee._suppressAutoDestroy = false;

                    // Excess damage to LP
                    if (excessToDefender > 0) {
                        ee.dealDamageToLP(defenderOwner.id, excessToDefender, `Challenge excess (${attacker.name})`);
                    }
                    if (excessToAttacker > 0) {
                        ee.dealDamageToLP(attackerOwner.id, excessToAttacker, `Challenge excess (${defender.name})`);
                    }

                    // Destroy after simultaneous damage
                    const defenderDead = defender.damageTaken >= defender.currentDEF;
                    const attackerDead = attacker.damageTaken >= attacker.currentDEF;
                    if (defenderDead) await ee.destroyUnit(defender);
                    if (attackerDead) await ee.destroyUnit(attacker);
                }

                gs.log('EFFECT', `Challenge resolved: ${attacker.name} ${attacker.damageTaken}/${attacker.currentDEF} | ${defender.name} ${defender.damageTaken}/${defender.currentDEF}`);
            },
        }),
    ]);

    // S036: Finishing Blow — 400 dmg to damaged enemy unit
    effectEngine.registerCardEffects('S036', [
        createEffect({
            cardId: 'S036',
            trigger: 'SELF',
            description: 'Deal 400 damage to a damaged enemy unit',
            requiresTarget: true,
            targets: (gs, ctx) => gs.getOpponents(ctx.sourcePlayer.id).flatMap(o => o.getFieldUnits().filter(u => u.damageTaken > 0)),
            execute: async (gs, ctx, ee) => {
                if (ctx.target) {
                    await ee.dealDamageToUnit(ctx.target, 400, 'Finishing Blow');
                }
            },
        }),
    ]);

    // S039: War Cry — +300 ATK +100 DEF
    effectEngine.registerCardEffects('S039', [
        createEffect({
            cardId: 'S039',
            trigger: 'SELF',
            description: '+300 ATK and +100 DEF to a friendly unit',
            requiresTarget: true,
            targets: (gs, ctx) => ctx.sourcePlayer.getFieldUnits(),
            execute: (gs, ctx, ee) => {
                if (ctx.target) ee.applyPermStatMod(ctx.target, 300, 100, 'War Cry');
            },
        }),
    ]);

    // S040: Molten Rain — 200 dmg to 2 different units
    effectEngine.registerCardEffects('S040', [
        createEffect({
            cardId: 'S040',
            trigger: 'SELF',
            description: 'Deal 200 damage to two different units',
            execute: async (gs, ctx, ee) => {
                const allUnits = gs.getAllFieldUnits();
                const alreadyTargeted = [];
                for (let i = 0; i < Math.min(2, allUnits.length); i++) {
                    const eligible = allUnits.filter(u => u.damageTaken < u.currentDEF && !alreadyTargeted.includes(u.instanceId));
                    if (eligible.length === 0) break;
                    const target = await ee.requestTarget(eligible, `Target ${i + 1} for 200 damage`);
                    if (target) {
                        alreadyTargeted.push(target.instanceId);
                        await ee.dealDamageToUnit(target, 200, 'Molten Rain');
                    }
                }
            },
        }),
    ]);

    // S041: Tempered Steel — All friendly +200 ATK
    effectEngine.registerCardEffects('S041', [
        createEffect({
            cardId: 'S041',
            trigger: 'SELF',
            description: '+200 ATK to all friendly units',
            execute: (gs, ctx, ee) => {
                for (const unit of ctx.sourcePlayer.getFieldUnits()) {
                    ee.applyPermStatMod(unit, 200, 0, 'Tempered Steel');
                }
            },
        }),
    ]);

    // S042: Raid Planning — Draw 2, take 300 dmg
    effectEngine.registerCardEffects('S042', [
        createEffect({
            cardId: 'S042',
            trigger: 'SELF',
            description: 'Draw 2 cards, take 300 damage',
            execute: (gs, ctx, ee) => {
                ee.drawCards(ctx.sourcePlayer.id, 2);
                ee.dealDamageToLP(ctx.sourcePlayer.id, 300, 'Raid Planning self-damage');
            },
        }),
    ]);

    // S043: Unstable Blast — 600 dmg to enemy unit
    effectEngine.registerCardEffects('S043', [
        createEffect({
            cardId: 'S043',
            trigger: 'SELF',
            description: 'Deal 600 damage to an enemy unit',
            requiresTarget: true,
            targetType: 'enemy_unit',
            targets: (gs, ctx) => gs.getOpponents(ctx.sourcePlayer.id).flatMap(o => o.getFieldUnits()),
            execute: async (gs, ctx, ee) => {
                if (ctx.target) {
                    await ee.dealDamageToUnit(ctx.target, 600, 'Unstable Blast');
                }
            },
        }),
    ]);

    // ─── TRAPS ────────────────────────────────────────────────

    // S044: Pitfall — Destroy summoned unit with ≥500 ATK
    effectEngine.registerCardEffects('S044', [
        createEffect({
            cardId: 'S044',
            trigger: EFFECT_EVENTS.ON_OPPONENT_SUMMON,
            description: 'Destroy summoned unit with ≥500 ATK',
            condition: (gs, ctx) => ctx.summoningPlayer?.id !== ctx.sourcePlayer.id && ctx.summonedCard?.currentATK >= 500,
            execute: (gs, ctx, ee) => {
                if (ctx.summonedCard) {
                    ee.destroyUnit(ctx.summonedCard);
                    gs.log('TRAP', `Pitfall destroys ${ctx.summonedCard.name}!`);
                }
            },
        }),
    ]);

    // S045: Explosive Rune — 200 dmg to attacking unit
    effectEngine.registerCardEffects('S045', [
        createEffect({
            cardId: 'S045',
            trigger: EFFECT_EVENTS.ON_ATTACK_DECLARE,
            description: 'Deal 200 damage to attacking unit',
            condition: (gs, ctx) => ctx.attackerOwner?.id !== ctx.sourcePlayer.id,
            execute: async (gs, ctx, ee) => {
                await ee.dealDamageToUnit(ctx.attacker, 200, 'Explosive Rune');
            },
        }),
    ]);

    // S046: Backfire — 400 dmg to enemy LP when they activate Spell/Trap
    effectEngine.registerCardEffects('S046', [
        createEffect({
            cardId: 'S046',
            trigger: EFFECT_EVENTS.ON_SPELL_ACTIVATE,
            description: 'Deal 400 damage to opponent\'s LP',
            condition: (gs, ctx) => ctx.caster?.id !== ctx.sourcePlayer.id,
            execute: (gs, ctx, ee) => {
                if (ctx.caster) {
                    ee.dealDamageToLP(ctx.caster.id, 400, 'Backfire');
                    gs.log('TRAP', 'Backfire deals 400 damage!');
                }
            },
        }),
    ]);

    // S047: Ambush — Summon Southern Warrior token when LP attacked directly
    effectEngine.registerCardEffects('S047', [
        createEffect({
            cardId: 'S047',
            trigger: EFFECT_EVENTS.ON_ATTACK_DECLARE,
            description: 'Summon Southern Warrior to block direct attack',
            condition: (gs, ctx) => {
                return ctx.target?.type === 'direct' && ctx.target.player?.id === ctx.sourcePlayer.id;
            },
            execute: (gs, ctx, ee) => {
                const slot = ctx.sourcePlayer.getEmptyUnitSlot();
                if (slot === -1) return;
                const token = cardDB.createCardInstance('S047a', ctx.sourcePlayer.id);
                if (token) {
                    token.position = 'ATK';
                    token.faceUp = true;
                    ctx.sourcePlayer.unitZone[slot] = token;
                    // Redirect attack to token
                    ctx.target = { type: 'unit', card: token, player: ctx.sourcePlayer };
                    gs.log('TRAP', 'Ambush! Southern Warrior blocks the attack!');
                    gs.emit('UNIT_SUMMONED', { card: token, player: ctx.sourcePlayer, slot });
                }
            },
        }),
    ]);

    // S048: Burning Retribution — 300 dmg to enemy when friendly destroyed on their turn
    effectEngine.registerCardEffects('S048', [
        createEffect({
            cardId: 'S048',
            trigger: EFFECT_EVENTS.ON_FRIENDLY_DESTROY,
            description: 'Deal 300 damage to enemy LP',
            condition: (gs, ctx) => {
                return ctx.ownerId === ctx.sourcePlayer.id && gs.activePlayerIndex !== ctx.sourcePlayer.id;
            },
            execute: (gs, ctx, ee) => {
                const enemy = gs.getActivePlayer();
                ee.dealDamageToLP(enemy.id, 300, 'Burning Retribution');
                gs.log('TRAP', 'Burning Retribution deals 300 damage!');
            },
        }),
    ]);

    // S049: Spiked Barricade — Reflect attacker's ATK as damage before combat
    effectEngine.registerCardEffects('S049', [
        createEffect({
            cardId: 'S049',
            trigger: EFFECT_EVENTS.ON_ATTACK_DECLARE,
            description: 'Deal attacker\'s ATK as damage to itself',
            condition: (gs, ctx) => ctx.attackerOwner?.id !== ctx.sourcePlayer.id,
            execute: async (gs, ctx, ee) => {
                const dmg = ctx.attacker.currentATK;
                await ee.dealDamageToUnit(ctx.attacker, dmg, 'Spiked Barricade');
                gs.log('TRAP', `Spiked Barricade reflects ${dmg} damage to ${ctx.attacker.name}!`);
                if (ctx.attacker.damageTaken >= ctx.attacker.currentDEF) {
                    if (gs.battleState) gs.battleState.attackNegated = true;
                }
            },
        }),
    ]);

    // S050: Pressure Plate — 400 dmg to all enemy units when opponent summons ≥5 cost
    effectEngine.registerCardEffects('S050', [
        createEffect({
            cardId: 'S050',
            trigger: EFFECT_EVENTS.ON_OPPONENT_SUMMON,
            description: 'Deal 400 to all enemy units when ≥5 cost unit summoned',
            condition: (gs, ctx) => {
                return ctx.summoningPlayer?.id !== ctx.sourcePlayer.id && ctx.summonedCard?.manaCost >= 5;
            },
            execute: async (gs, ctx, ee) => {
                const enemyUnits = ctx.summoningPlayer.getFieldUnits();
                for (const unit of enemyUnits) {
                    await ee.dealDamageToUnit(unit, 400, 'Pressure Plate');
                }
                gs.log('TRAP', 'Pressure Plate explodes for 400 damage to all enemy units!');
            },
        }),
    ]);
}
