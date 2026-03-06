// ─────────────────────────────────────────────────────────────
// NorthernEffects.js — All Northern region card effects
// ─────────────────────────────────────────────────────────────

import { EFFECT_EVENTS, createEffect } from '../engine/EffectEngine.js';

export function register(effectEngine, cardDB) {

    // ─── LANDMARKS ────────────────────────────────────────────

    // N001: The Frostfell Citadel — Units +200 DEF when in defense position
    effectEngine.registerCardEffects('N001', [
        createEffect({
            cardId: 'N001',
            trigger: EFFECT_EVENTS.ON_TURN_START,
            description: 'Friendly units in DEF position gain +200 DEF',
            condition: (gs, ctx) => {
                return ctx.activePlayer?.landmarkZone?.cardId === 'N001' &&
                    !ctx.activePlayer.landmarkZone.silenced;
            },
            execute: (gs, ctx, ee) => {
                for (const unit of ctx.activePlayer.getFieldUnits()) {
                    if (unit.position === 'DEF' && !unit._n001Applied) {
                        ee.applyPermStatMod(unit, 0, 200, 'Frostfell Citadel');
                        unit._n001Applied = true;
                    }
                    if (unit.position === 'ATK' && unit._n001Applied) {
                        ee.applyPermStatMod(unit, 0, -200, 'Frostfell Citadel lost');
                        unit._n001Applied = false;
                    }
                }
            },
        }),
        createEffect({
            cardId: 'N001',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Unit summoned in DEF position gains +200 DEF',
            condition: (gs, ctx) => {
                const owner = gs.getPlayerById(ctx.source?.ownerId);
                return owner?.landmarkZone?.cardId === 'N001' &&
                    !owner.landmarkZone.silenced &&
                    ctx.source?.position === 'DEF' &&
                    !ctx.source._n001Applied;
            },
            execute: (gs, ctx, ee) => {
                ee.applyPermStatMod(ctx.source, 0, 200, 'Frostfell Citadel');
                ctx.source._n001Applied = true;
            },
        }),
        createEffect({
            cardId: 'N001',
            trigger: EFFECT_EVENTS.ON_POSITION_CHANGE,
            description: 'Unit switched to DEF gains +200 DEF; loses it on switch to ATK',
            condition: (gs, ctx) => {
                const owner = gs.getPlayerById(ctx.changedCard?.ownerId);
                return owner?.landmarkZone?.cardId === 'N001' &&
                    !owner.landmarkZone.silenced;
            },
            execute: (gs, ctx, ee) => {
                if (ctx.changedCard.position === 'DEF' && !ctx.changedCard._n001Applied) {
                    ee.applyPermStatMod(ctx.changedCard, 0, 200, 'Frostfell Citadel');
                    ctx.changedCard._n001Applied = true;
                } else if (ctx.changedCard.position === 'ATK' && ctx.changedCard._n001Applied) {
                    ee.applyPermStatMod(ctx.changedCard, 0, -200, 'Frostfell Citadel lost');
                    ctx.changedCard._n001Applied = false;
                }
            },
        }),
        createEffect({
            cardId: 'N001',
            trigger: EFFECT_EVENTS.ON_LANDMARK_PLACED,
            description: 'When Frostfell Citadel is placed, existing DEF units gain +200 DEF',
            condition: (gs, ctx) => {
                return ctx.landmark?.cardId === 'N001' &&
                    !ctx.landmark.silenced;
            },
            execute: (gs, ctx, ee) => {
                const owner = ctx.targetPlayer;
                if (!owner) return;
                for (const unit of owner.getFieldUnits()) {
                    if (unit.position === 'DEF' && !unit._n001Applied) {
                        ee.applyPermStatMod(unit, 0, 200, 'Frostfell Citadel');
                        unit._n001Applied = true;
                    }
                }
            },
        }),
    ]);
    // N002: Ancestral Ice Cairn — +1 extra mana
    // Handled inline in ManaSystem._getExtraMana()

    // ─── UNITS ────────────────────────────────────────────────

    // N005: Frostfang Pup — Rush (keyword, no effect needed)

    // N006: Hardy Explorer — When Summoned: Heal LP by 100
    effectEngine.registerCardEffects('N006', [
        createEffect({
            cardId: 'N006',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Heal your LP by 100',
            execute: (gs, ctx, ee) => {
                ee.healLP(ctx.sourcePlayer.id, 100);
            },
        }),
    ]);

    // N007: Ice Wall Sentinel — Cannot attack. +1 mana (passive, handled in ManaSystem)
    // We register a passive to prevent attacks
    effectEngine.registerCardEffects('N007', [
        createEffect({
            cardId: 'N007',
            trigger: 'PASSIVE',
            description: 'This unit cannot attack',
            execute: () => { }, // Attack prevention is done by forcing DEF position or validator
        }),
    ]);

    // N009: Grizzled Trapper — When destroyed by battle: Draw "The Great White Bear"
    effectEngine.registerCardEffects('N009', [
        createEffect({
            cardId: 'N009',
            trigger: EFFECT_EVENTS.ON_SELF_DESTROY,
            description: 'Draw "The Great White Bear" from deck',
            condition: (gs, ctx) => ctx.destroyedCard?.cardId === 'N009',
            execute: (gs, ctx, ee) => {
                const player = ctx.destroyedPlayer;
                ee.searchDeck(player.id, c => c.cardId === 'N023', 'The Great White Bear');
                ee.shuffleDeck(player.id);
            },
        }),
    ]);

    // N010: Guardian Yeti — No effect (vanilla stats)

    // N011: Shield Wall Veteran — Reduce all combat damage by 100
    // Actual damage reduction logic is in EffectEngine.dealDamageToUnit()
    effectEngine.registerCardEffects('N011', [
        createEffect({
            cardId: 'N011',
            trigger: 'PASSIVE',
            description: 'Reduce combat damage by 100 (handled in EffectEngine)',
            execute: () => { },
        }),
    ]);

    // N013: Battle-Scarred Warrior — If takes damage and survives, gain +100 DEF
    effectEngine.registerCardEffects('N013', [
        createEffect({
            cardId: 'N013',
            trigger: EFFECT_EVENTS.ON_DAMAGE_TO_UNIT,
            description: 'Gain +100 DEF when damaged',
            condition: (gs, ctx) => {
                return ctx.target?.cardId === 'N013' &&
                    ctx.target.damageTaken < ctx.target.currentDEF;
            },
            execute: (gs, ctx, ee) => {
                ee.applyPermStatMod(ctx.target, 0, 100, 'Battle-Scarred Warrior');
            },
        }),
    ]);

    // N014: Iceflow Serpent — When Summoned: Target enemy unit gets -200 ATK this turn
    effectEngine.registerCardEffects('N014', [
        createEffect({
            cardId: 'N014',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Target enemy unit gets -200 ATK this turn',
            requiresTarget: true,
            targetType: 'enemy_unit',
            targets: (gs, ctx) => {
                const opponents = gs.getOpponents(ctx.sourcePlayer.id);
                return opponents.flatMap(o => o.getFieldUnits());
            },
            execute: (gs, ctx, ee) => {
                if (ctx.target) {
                    ee.applyTempStatMod(ctx.target, -200, 0, 'Iceflow Serpent');
                }
            },
        }),
    ]);

    // N016: Northern Healer — When Summoned: Heal LP by 200
    effectEngine.registerCardEffects('N016', [
        createEffect({
            cardId: 'N016',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Heal your LP by 200',
            execute: (gs, ctx, ee) => {
                ee.healLP(ctx.sourcePlayer.id, 200);
            },
        }),
    ]);

    // N017: Glacial Commander — When Summoned: Other friendly Northern units +100 DEF
    effectEngine.registerCardEffects('N017', [
        createEffect({
            cardId: 'N017',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Other friendly Northern units gain +100 DEF',
            execute: (gs, ctx, ee) => {
                const friendlyUnits = ctx.sourcePlayer.getFieldUnits();
                for (const unit of friendlyUnits) {
                    if (unit.instanceId !== ctx.source.instanceId && unit.region === 'Northern') {
                        ee.applyPermStatMod(unit, 0, 100, 'Glacial Commander');
                    }
                }
            },
        }),
    ]);

    // N019: Fortress Guard Captain — When Summoned: Adjacent units +200 DEF
    effectEngine.registerCardEffects('N019', [
        createEffect({
            cardId: 'N019',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Adjacent friendly units gain +200 DEF',
            execute: (gs, ctx, ee) => {
                const slotIdx = ctx.sourcePlayer.unitZone.indexOf(ctx.source);
                if (slotIdx >= 0) {
                    [slotIdx - 1, slotIdx + 1].forEach(i => {
                        if (i >= 0 && i < 5 && ctx.sourcePlayer.unitZone[i]) {
                            ee.applyPermStatMod(ctx.sourcePlayer.unitZone[i], 0, 200, 'Fortress Guard Captain');
                        }
                    });
                }
            },
        }),
    ]);

    // N020: Rime-Coated Wurm — When Summoned: Deal 500 to an enemy unit
    effectEngine.registerCardEffects('N020', [
        createEffect({
            cardId: 'N020',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Deal 500 damage to an enemy unit',
            requiresTarget: true,
            targetType: 'enemy_unit',
            targets: (gs, ctx) => gs.getOpponents(ctx.sourcePlayer.id).flatMap(o => o.getFieldUnits()),
            execute: async (gs, ctx, ee) => {
                if (ctx.target) {
                    await ee.dealDamageToUnit(ctx.target, 500, 'Rime-Coated Wurm');
                }
            },
        }),
    ]);

    // N021: Jarl of the High Peaks — Taunt (handled in CombatEngine.canTarget)

    // N022: Ymir's Bulwark — When Summoned: All friendly +200 ATK OR +200 DEF + heal 200
    effectEngine.registerCardEffects('N022', [
        createEffect({
            cardId: 'N022',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'All other friendly units +200 ATK or +200 DEF this round; heal 200 LP',
            isOptional: false,
            execute: async (gs, ctx, ee) => {
                const choice = await ee.requestChoice(
                    [{ label: '+200 ATK to all', value: 'atk' }, { label: '+200 DEF to all', value: 'def' }],
                    "Ymir's Bulwark: Choose a buff for all friendly units"
                );

                const friendlyUnits = ctx.sourcePlayer.getFieldUnits();
                for (const unit of friendlyUnits) {
                    if (unit.instanceId !== ctx.source.instanceId) {
                        if (choice?.value === 'atk') {
                            // "this round" = lasts until the same player's next End Phase
                            ee.applyPermStatMod(unit, 200, 0, "Ymir's Bulwark");
                            unit._ymirRoundBuff = { atk: 200, def: 0, round: gs.roundCounter };
                        } else {
                            ee.applyPermStatMod(unit, 0, 200, "Ymir's Bulwark");
                            unit._ymirRoundBuff = { atk: 0, def: 200, round: gs.roundCounter };
                        }
                    }
                }
                ee.healLP(ctx.sourcePlayer.id, 200);
            },
        }),
    ]);

    // N023: The Great White Bear — Pierce (keyword). On destroy enemy unit: heal 200. If 10 mana: +200 ATK (once)
    effectEngine.registerCardEffects('N023', [
        createEffect({
            cardId: 'N023',
            trigger: EFFECT_EVENTS.ON_TURN_START,
            description: 'If you have 10 total mana, gain +200 ATK (once)',
            condition: (gs, ctx) => {
                return ctx.activePlayer.id === ctx.source?.ownerId &&
                    ctx.activePlayer.getTotalMana() >= 10 &&
                    !ctx.source._n023BonusApplied;
            },
            execute: (gs, ctx, ee) => {
                const bear = ctx.source;
                if (bear) {
                    ee.applyPermStatMod(bear, 200, 0, 'The Great White Bear (10 mana bonus)');
                    bear._n023BonusApplied = true;
                }
            },
        }),
        // Heal 200 LP on enemy kill (handled in CombatEngine._applyOnDestroyEffects)
        // This registration is a documentation marker; actual logic is in CombatEngine
        createEffect({
            cardId: 'N023',
            trigger: 'PASSIVE',
            description: 'Heal 200 LP when destroying enemy by battle (handled in CombatEngine)',
            execute: () => { },
        }),
    ]);

    // N024: Colossus of the North — Cannot be affected by enemy Spells or Traps
    // Actual immunity logic is in EffectEngine.dealDamageToUnit() and target filtering
    effectEngine.registerCardEffects('N024', [
        createEffect({
            cardId: 'N024',
            trigger: 'PASSIVE',
            description: 'Cannot be affected by enemy Spells or Traps (handled in EffectEngine)',
            execute: () => { },
        }),
    ]);

    // N026: Pack Alpha Wolf — Pierce. When summoned: +100/+100 per friendly Northern unit
    effectEngine.registerCardEffects('N026', [
        createEffect({
            cardId: 'N026',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: '+100 ATK +100 DEF per friendly Northern unit',
            execute: (gs, ctx, ee) => {
                const northernCount = ctx.sourcePlayer.getFieldUnits()
                    .filter(u => u.region === 'Northern' && u.instanceId !== ctx.source.instanceId)
                    .length;
                if (northernCount > 0) {
                    ee.applyPermStatMod(ctx.source, 100 * northernCount, 100 * northernCount, 'Pack Alpha Wolf');
                }
            },
        }),
    ]);

    // N027: Mountain Goat Herder — When Summoned: Summon two 300/100 Mountain Goat tokens
    effectEngine.registerCardEffects('N027', [
        createEffect({
            cardId: 'N027',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Summon two Mountain Goat tokens',
            execute: (gs, ctx, ee) => {
                for (let i = 0; i < 2; i++) {
                    const slot = ctx.sourcePlayer.getEmptyUnitSlot();
                    if (slot === -1) break;
                    const token = cardDB.createCardInstance('N027a', ctx.sourcePlayer.id);
                    if (token) {
                        token.position = 'ATK';
                        token.faceUp = true;
                        token.summonedThisTurn = true;
                        ctx.sourcePlayer.unitZone[slot] = token;
                        gs.log('TOKEN', `Mountain Goat token summoned in slot ${slot + 1}.`);
                        gs.emit('UNIT_SUMMONED', { card: token, player: ctx.sourcePlayer, slot });
                    }
                }
            },
        }),
    ]);

    // N028: Ice Carver — When Summoned: Give a friendly unit +200 ATK
    effectEngine.registerCardEffects('N028', [
        createEffect({
            cardId: 'N028',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Give a friendly unit +200 ATK',
            requiresTarget: true,
            targetType: 'friendly_unit',
            targets: (gs, ctx) => ctx.sourcePlayer.getFieldUnits().filter(u => u.instanceId !== ctx.source.instanceId),
            execute: (gs, ctx, ee) => {
                if (ctx.target) {
                    ee.applyPermStatMod(ctx.target, 200, 0, 'Ice Carver');
                }
            },
        }),
    ]);

    // N029: Resilient Spearman — First destruction per turn: survive with 500 HP (reset)
    // Actual prevention logic is in EffectEngine.destroyUnit()
    effectEngine.registerCardEffects('N029', [
        createEffect({
            cardId: 'N029',
            trigger: 'PASSIVE',
            description: 'First destruction each turn: survive with 500 HP (handled in EffectEngine)',
            execute: () => { },
        }),
    ]);

    // N030: Stoic Elder — When a Spell affects this unit, heal LP by 200
    effectEngine.registerCardEffects('N030', [
        createEffect({
            cardId: 'N030',
            trigger: EFFECT_EVENTS.ON_SPELL_PLAY,
            description: 'When a Spell affects this unit, heal 200 LP',
            condition: (gs, ctx) => {
                // Check if any spell target was this unit (by instanceId or cardId)
                const targets = ctx.spellTargets || [];
                return targets.some(t =>
                    (t?.instanceId && t.instanceId === ctx.source?.instanceId) ||
                    (t?.card?.instanceId && t.card.instanceId === ctx.source?.instanceId)
                );
            },
            execute: (gs, ctx, ee) => {
                ee.healLP(ctx.sourcePlayer.id, 200);
                gs.log('EFFECT', `Stoic Elder heals ${ctx.sourcePlayer.name} for 200 LP!`);
            },
        }),
    ]);

    // ─── SPELLS ───────────────────────────────────────────────

    // N031: Invigorate — Heal unit or LP by 200
    effectEngine.registerCardEffects('N031', [
        createEffect({
            cardId: 'N031',
            trigger: 'SELF',
            description: 'Heal a target unit or your LP by 200',
            requiresTarget: true,
            targetType: 'friendly_unit_or_self_lp',
            targets: (gs, ctx) => {
                const units = ctx.sourcePlayer.getFieldUnits();
                return [...units, { type: 'lp', player: ctx.sourcePlayer, name: `${ctx.sourcePlayer.name}'s LP` }];
            },
            execute: (gs, ctx, ee) => {
                if (ctx.target?.type === 'lp') {
                    ee.healLP(ctx.sourcePlayer.id, 200);
                } else if (ctx.target) {
                    ee.healUnit(ctx.target, 200);
                }
            },
        }),
    ]);

    // N032: Harden — Give a friendly unit +300 DEF this turn
    effectEngine.registerCardEffects('N032', [
        createEffect({
            cardId: 'N032',
            trigger: 'SELF',
            description: 'Give a friendly unit +300 DEF this turn',
            requiresTarget: true,
            targetType: 'friendly_unit',
            targets: (gs, ctx) => ctx.sourcePlayer.getFieldUnits(),
            execute: (gs, ctx, ee) => {
                if (ctx.target) ee.applyTempStatMod(ctx.target, 0, 300, 'Harden');
            },
        }),
    ]);

    // N033: Rally the Reserves — Switch ATK and DEF of a unit you control
    effectEngine.registerCardEffects('N033', [
        createEffect({
            cardId: 'N033',
            trigger: 'SELF',
            description: 'Switch ATK and DEF of a friendly unit',
            requiresTarget: true,
            targetType: 'friendly_unit',
            targets: (gs, ctx) => ctx.sourcePlayer.getFieldUnits(),
            execute: (gs, ctx, ee) => {
                if (ctx.target) {
                    const tempATK = ctx.target.currentATK;
                    ctx.target.currentATK = ctx.target.currentDEF;
                    ctx.target.currentDEF = tempATK;
                    gs.log('EFFECT', `${ctx.target.name}: ATK/DEF swapped to ${ctx.target.currentATK}/${ctx.target.currentDEF}`);
                }
            },
        }),
    ]);

    // N034: Frostbite Touch — Give an enemy unit -300 ATK
    effectEngine.registerCardEffects('N034', [
        createEffect({
            cardId: 'N034',
            trigger: 'SELF',
            description: 'Give an enemy unit -300 ATK',
            requiresTarget: true,
            targetType: 'enemy_unit',
            targets: (gs, ctx) => gs.getOpponents(ctx.sourcePlayer.id).flatMap(o => o.getFieldUnits()),
            execute: (gs, ctx, ee) => {
                if (ctx.target) ee.applyPermStatMod(ctx.target, -300, 0, 'Frostbite Touch');
            },
        }),
    ]);

    // N035: Healing Balm — Heal unit or LP by 400
    effectEngine.registerCardEffects('N035', [
        createEffect({
            cardId: 'N035',
            trigger: 'SELF',
            description: 'Heal a target unit or your LP by 400',
            requiresTarget: true,
            targetType: 'friendly_unit_or_self_lp',
            targets: (gs, ctx) => {
                const units = ctx.sourcePlayer.getFieldUnits();
                return [...units, { type: 'lp', player: ctx.sourcePlayer, name: `${ctx.sourcePlayer.name}'s LP` }];
            },
            execute: (gs, ctx, ee) => {
                if (ctx.target?.type === 'lp') {
                    ee.healLP(ctx.sourcePlayer.id, 400);
                } else if (ctx.target) {
                    ee.healUnit(ctx.target, 400);
                }
            },
        }),
    ]);

    // N036: Sudden Thaw — Deal 400 damage to a target unit
    effectEngine.registerCardEffects('N036', [
        createEffect({
            cardId: 'N036',
            trigger: 'SELF',
            description: 'Deal 400 damage to a unit',
            requiresTarget: true,
            targetType: 'any_unit',
            targets: (gs) => gs.getAllFieldUnits(),
            execute: async (gs, ctx, ee) => {
                if (ctx.target) {
                    await ee.dealDamageToUnit(ctx.target, 400, 'Sudden Thaw');
                }
            },
        }),
    ]);

    // N037: Glacial Ward — Friendly unit immune to targeting and damage this turn
    effectEngine.registerCardEffects('N037', [
        createEffect({
            cardId: 'N037',
            trigger: 'SELF',
            description: 'A friendly unit cannot be targeted or take damage this turn',
            requiresTarget: true,
            targetType: 'friendly_unit',
            targets: (gs, ctx) => ctx.sourcePlayer.getFieldUnits(),
            execute: (gs, ctx, ee) => {
                if (ctx.target) {
                    ctx.target.canBeTargeted = false;
                    ctx.target.isImmune = true;
                    gs.log('EFFECT', `${ctx.target.name} is protected by Glacial Ward this turn!`);
                }
            },
        }),
    ]);

    // N038: Reinforce Defenses — Give a friendly unit +100 ATK and +300 DEF
    effectEngine.registerCardEffects('N038', [
        createEffect({
            cardId: 'N038',
            trigger: 'SELF',
            description: '+100 ATK and +300 DEF to a friendly unit',
            requiresTarget: true,
            targetType: 'friendly_unit',
            targets: (gs, ctx) => ctx.sourcePlayer.getFieldUnits(),
            execute: (gs, ctx, ee) => {
                if (ctx.target) ee.applyPermStatMod(ctx.target, 100, 300, 'Reinforce Defenses');
            },
        }),
    ]);

    // N039: Northern Blessing — Heal LP by 500 and draw a card
    effectEngine.registerCardEffects('N039', [
        createEffect({
            cardId: 'N039',
            trigger: 'SELF',
            description: 'Heal 500 LP and draw 1 card',
            execute: (gs, ctx, ee) => {
                ee.healLP(ctx.sourcePlayer.id, 500);
                ee.drawCards(ctx.sourcePlayer.id, 1);
            },
        }),
    ]);

    // N040: Call the Pack — Summon two Wolf tokens; if Pack Alpha Wolf, +200 ATK to wolves
    effectEngine.registerCardEffects('N040', [
        createEffect({
            cardId: 'N040',
            trigger: 'SELF',
            description: 'Summon two Wolf tokens',
            execute: (gs, ctx, ee) => {
                const hasAlpha = ctx.sourcePlayer.getFieldUnits().some(u => u.cardId === 'N026');
                for (let i = 0; i < 2; i++) {
                    const slot = ctx.sourcePlayer.getEmptyUnitSlot();
                    if (slot === -1) break;
                    const token = cardDB.createCardInstance('N040a', ctx.sourcePlayer.id);
                    if (token) {
                        if (hasAlpha) {
                            token.currentATK += 200;
                            token.atkModifiers.push({ amount: 200, source: 'Pack Alpha Wolf', duration: 'permanent' });
                        }
                        token.position = 'ATK';
                        token.faceUp = true;
                        token.summonedThisTurn = true;
                        ctx.sourcePlayer.unitZone[slot] = token;
                        gs.emit('UNIT_SUMMONED', { card: token, player: ctx.sourcePlayer, slot });
                    }
                }
            },
        }),
    ]);

    // N041: Ancestral Fortitude — All friendly units +200 ATK and +200 DEF
    effectEngine.registerCardEffects('N041', [
        createEffect({
            cardId: 'N041',
            trigger: 'SELF',
            description: 'All friendly units +200 ATK and +200 DEF',
            execute: (gs, ctx, ee) => {
                for (const unit of ctx.sourcePlayer.getFieldUnits()) {
                    ee.applyPermStatMod(unit, 200, 200, 'Ancestral Fortitude');
                }
            },
        }),
    ]);

    // N042: Second Wind — Heal LP by 800
    effectEngine.registerCardEffects('N042', [
        createEffect({
            cardId: 'N042',
            trigger: 'SELF',
            description: 'Heal 800 LP',
            execute: (gs, ctx, ee) => {
                ee.healLP(ctx.sourcePlayer.id, 800);
            },
        }),
    ]);

    // N043: Prepare for Winter — Summon a Landmark from deck
    effectEngine.registerCardEffects('N043', [
        createEffect({
            cardId: 'N043',
            trigger: 'SELF',
            description: 'Summon a Landmark from your deck',
            execute: async (gs, ctx, ee) => {
                const landmarks = ctx.sourcePlayer.deck.filter(c => c.type === 'Landmark');
                if (landmarks.length > 0) {
                    const chosen = await ee.requestChoice(
                        landmarks.map(l => ({ label: l.name, value: l.instanceId, cardId: l.cardId })),
                        'Choose a Landmark to summon from your deck'
                    );
                    if (chosen) {
                        const idx = ctx.sourcePlayer.deck.findIndex(c => c.instanceId === chosen.value);
                        if (idx >= 0) {
                            const landmark = ctx.sourcePlayer.deck.splice(idx, 1)[0];

                            // Let the player choose which landmark zone to place it in
                            const targetOptions = [{ label: `Your Landmark Zone`, value: ctx.sourcePlayer.id }];
                            const opponents = gs.getOpponents(ctx.sourcePlayer.id);
                            for (const opp of opponents) {
                                targetOptions.push({ label: `${opp.name}'s Landmark Zone`, value: opp.id });
                            }

                            let targetPlayerId = ctx.sourcePlayer.id;
                            if (targetOptions.length > 1) {
                                const targetChoice = await ee.requestChoice(
                                    targetOptions,
                                    'Choose which Landmark Zone to place it in'
                                );
                                if (targetChoice) {
                                    targetPlayerId = targetChoice.value;
                                }
                            }

                            const targetPlayer = gs.getPlayerById(targetPlayerId);
                            // Replace existing landmark
                            if (targetPlayer.landmarkZone) {
                                ee._cleanupLandmarkBuffs(targetPlayer, targetPlayer.landmarkZone);
                                targetPlayer.graveyard.push(targetPlayer.landmarkZone);
                            }
                            landmark.faceUp = true;
                            targetPlayer.landmarkZone = landmark;
                            gs.log('LANDMARK', `${landmark.name} summoned from deck into ${targetPlayer.name}'s Landmark Zone!`);
                            gs.emit('LANDMARK_PLACED', { card: landmark, player: ctx.sourcePlayer });
                            // Trigger landmark-placed for effects like E005
                            await ee.trigger(EFFECT_EVENTS.ON_LANDMARK_PLACED, { landmark, placer: ctx.sourcePlayer, targetPlayer });
                            ee.shuffleDeck(ctx.sourcePlayer.id);
                        }
                    }
                }
            },
        }),
    ]);

    // ─── TRAPS ────────────────────────────────────────────────

    // N044: Tripwire — When enemy attacks: -400 ATK this turn
    effectEngine.registerCardEffects('N044', [
        createEffect({
            cardId: 'N044',
            trigger: EFFECT_EVENTS.ON_ATTACK_DECLARE,
            description: 'Attacking unit gets -400 ATK this turn',
            condition: (gs, ctx) => ctx.attacker && ctx.attackerOwner?.id !== ctx.sourcePlayer.id,
            execute: (gs, ctx, ee) => {
                ee.applyTempStatMod(ctx.attacker, -400, 0, 'Tripwire');
            },
        }),
    ]);

    // N045: Frozen Path — Negate attack and end Battle Phase
    effectEngine.registerCardEffects('N045', [
        createEffect({
            cardId: 'N045',
            trigger: EFFECT_EVENTS.ON_ATTACK_DECLARE,
            description: 'Negate attack and end Battle Phase',
            condition: (gs, ctx) => ctx.attackerOwner?.id !== ctx.sourcePlayer.id,
            execute: (gs, ctx, ee) => {
                if (gs.battleState) {
                    gs.battleState.attackNegated = true;
                    gs.battleState.battlePhaseEnded = true;
                }
                gs.log('TRAP', 'Frozen Path negates the attack and ends the Battle Phase!');
            },
        }),
    ]);

    // N046: Ice Mirror — Negate a Spell or Trap effect
    effectEngine.registerCardEffects('N046', [
        createEffect({
            cardId: 'N046',
            trigger: EFFECT_EVENTS.ON_SPELL_ACTIVATE,
            description: 'Negate a Spell or Trap effect',
            condition: (gs, ctx) => ctx.caster && ctx.caster.id !== ctx.sourcePlayer.id,
            execute: (gs, ctx, ee) => {
                gs._chainNegate = true;
                gs.log('TRAP', `Ice Mirror negates ${ctx.spell?.name || 'the Spell/Trap'}!`);
            },
        }),
    ]);

    // N047: Hibernation Ward — Reduce LP combat damage by 500
    effectEngine.registerCardEffects('N047', [
        createEffect({
            cardId: 'N047',
            trigger: EFFECT_EVENTS.ON_ATTACK_DECLARE,
            description: 'Reduce combat LP damage by 500',
            condition: (gs, ctx) => ctx.attackerOwner?.id !== ctx.sourcePlayer.id,
            execute: (gs, ctx, ee) => {
                // Set a flag so the combat engine reduces LP damage by 500
                ctx.sourcePlayer._hibernationWardActive = true;
                gs.log('TRAP', 'Hibernation Ward activated — next combat LP damage reduced by 500!');
            },
        }),
    ]);

    // N048: Avalanche Warning — When second unit summoned: return it to hand
    effectEngine.registerCardEffects('N048', [
        createEffect({
            cardId: 'N048',
            trigger: EFFECT_EVENTS.ON_OPPONENT_SUMMON,
            description: 'Return second summoned unit to hand',
            condition: (gs, ctx) => {
                return ctx.summoningPlayer?.id !== ctx.sourcePlayer.id && ctx.isSecondSummon;
            },
            execute: (gs, ctx, ee) => {
                if (ctx.summonedCard) {
                    ee.returnToHand(ctx.summonedCard);
                    gs.log('TRAP', `Avalanche Warning returns ${ctx.summonedCard.name} to hand!`);
                }
            },
        }),
    ]);

    // N049: Shielding Aura — When friendly unit attacked: +500 DEF this turn
    effectEngine.registerCardEffects('N049', [
        createEffect({
            cardId: 'N049',
            trigger: EFFECT_EVENTS.ON_ATTACK_DECLARE,
            description: 'Defending unit gains +500 DEF this turn',
            condition: (gs, ctx) => {
                return ctx.target?.type === 'unit' && ctx.target.card?.ownerId === ctx.sourcePlayer.id;
            },
            execute: (gs, ctx, ee) => {
                if (ctx.target?.card) {
                    ee.applyTempStatMod(ctx.target.card, 0, 500, 'Shielding Aura');
                }
            },
        }),
    ]);

    // N050: Defensive Formation — All friendly units +200 DEF this turn
    effectEngine.registerCardEffects('N050', [
        createEffect({
            cardId: 'N050',
            trigger: EFFECT_EVENTS.ON_ATTACK_DECLARE,
            description: 'All friendly units gain +200 DEF this turn',
            condition: (gs, ctx) => ctx.attackerOwner?.id !== ctx.sourcePlayer.id,
            execute: (gs, ctx, ee) => {
                for (const unit of ctx.sourcePlayer.getFieldUnits()) {
                    ee.applyTempStatMod(unit, 0, 200, 'Defensive Formation');
                }
            },
        }),
    ]);
}
