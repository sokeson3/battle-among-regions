// ─────────────────────────────────────────────────────────────
// WesternEffects.js — All Western region card effects
// ─────────────────────────────────────────────────────────────

import { EFFECT_EVENTS, createEffect } from '../engine/EffectEngine.js';

export function register(effectEngine, cardDB) {

    // ─── LANDMARKS ────────────────────────────────────────────

    // W001: Echoing Canyon — "When Summoned" effects trigger twice
    // Handled inline in EffectEngine.triggerOnSummon()

    // W002: Mystic Menagerie — When you return a unit, gain 1 mana
    effectEngine.registerCardEffects('W002', [
        createEffect({
            cardId: 'W002',
            trigger: EFFECT_EVENTS.ON_UNIT_RETURNED,
            description: 'Gain 1 mana when a unit is returned',
            condition: (gs, ctx) => {
                const owner = gs.players.find(p => p.landmarkZone?.cardId === 'W002');
                return owner && ctx.ownerId === owner.id;
            },
            execute: (gs, ctx, ee) => {
                const owner = gs.players.find(p => p.landmarkZone?.cardId === 'W002');
                if (owner) {
                    owner.primaryMana += 1;
                    gs.log('LANDMARK', 'Mystic Menagerie: +1 mana!');
                }
            },
        }),
    ]);

    // ─── UNITS ────────────────────────────────────────────────

    // W003: Plains Runner — When Summoned: Look at top card, may put on bottom
    effectEngine.registerCardEffects('W003', [
        createEffect({
            cardId: 'W003',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Look at top card; optionally put on bottom',
            execute: async (gs, ctx, ee) => {
                if (ctx.sourcePlayer.deck.length > 0) {
                    const top = ctx.sourcePlayer.deck[0];
                    const choice = await ee.requestChoice(
                        [{ label: `Keep ${top.name} on top`, value: 'keep', cardId: top.cardId }, { label: 'Put on bottom', value: 'bottom' }],
                        `Top card: ${top.name}`
                    );
                    if (choice?.value === 'bottom') {
                        ctx.sourcePlayer.deck.shift();
                        ctx.sourcePlayer.deck.push(top);
                        gs.log('EFFECT', `${top.name} placed on the bottom of the deck.`);
                    }
                }
            },
        }),
    ]);

    // W004: Shifting Chameleon — Once per round: copy another card's effect
    effectEngine.registerCardEffects('W004', [
        createEffect({
            cardId: 'W004',
            trigger: 'ACTIVATED',
            description: 'Copy another card\'s effect',
            requiresTarget: true,
            targets: (gs, ctx) => gs.getAllFieldUnits().filter(u => u.instanceId !== ctx.source.instanceId),
            execute: async (gs, ctx, ee) => {
                if (ctx.target) {
                    gs.log('EFFECT', `Shifting Chameleon copies ${ctx.target.name}'s effect!`);
                    // Copy the source's registered effects and execute them
                    const effects = ee.getEffects(ctx.target.cardId);
                    for (const eff of effects) {
                        if (eff.trigger === EFFECT_EVENTS.ON_SUMMON || eff.trigger === 'ACTIVATED') {
                            await ee._resolveEffect(eff, { ...ctx, source: ctx.source });
                        }
                    }
                }
            },
        }),
    ]);

    // W005: Gadgeteer Apprentice — When Summoned: +100/+100 to another friendly unit
    effectEngine.registerCardEffects('W005', [
        createEffect({
            cardId: 'W005',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Give another friendly unit +100 ATK and +100 DEF',
            requiresTarget: true,
            targetType: 'friendly_unit',
            targets: (gs, ctx) => ctx.sourcePlayer.getFieldUnits().filter(u => u.instanceId !== ctx.source.instanceId),
            execute: (gs, ctx, ee) => {
                if (ctx.target) ee.applyPermStatMod(ctx.target, 100, 100, 'Gadgeteer Apprentice');
            },
        }),
    ]);

    // W007: Zephyr Spirit — When Summoned: Return another friendly unit to hand, gain 2 mana
    effectEngine.registerCardEffects('W007', [
        createEffect({
            cardId: 'W007',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Return a friendly unit, gain 2 mana',
            requiresTarget: true,
            targetType: 'friendly_unit',
            targets: (gs, ctx) => ctx.sourcePlayer.getFieldUnits().filter(u => u.instanceId !== ctx.source.instanceId),
            execute: (gs, ctx, ee) => {
                if (ctx.target) {
                    ee.returnToHand(ctx.target);
                    ctx.sourcePlayer.primaryMana += 2;
                    gs.log('EFFECT', `${ctx.sourcePlayer.name} gains 2 bonus mana!`);
                }
            },
        }),
    ]);

    // W008: Cliffside Falconer — Once per round: Target enemy cannot attack next turn
    effectEngine.registerCardEffects('W008', [
        createEffect({
            cardId: 'W008',
            trigger: 'ACTIVATED',
            description: 'Target enemy unit cannot attack next turn',
            requiresTarget: true,
            targets: (gs, ctx) => gs.getOpponents(ctx.sourcePlayer.id).flatMap(o => o.getFieldUnits()),
            execute: (gs, ctx, ee) => {
                if (ctx.target) {
                    ctx.target._cannotAttackNextTurn = true;
                    gs.log('EFFECT', `${ctx.target.name} cannot attack next turn!`);
                }
            },
        }),
    ]);

    // W009: Resourceful Scavenger — Once per turn: gain 1 mana when friendly destroyed/returned
    effectEngine.registerCardEffects('W009', [
        createEffect({
            cardId: 'W009',
            trigger: EFFECT_EVENTS.ON_FRIENDLY_DESTROY,
            description: 'Gain 1 mana when friendly unit destroyed',
            condition: (gs, ctx) => ctx.ownerId === ctx.source?.ownerId,
            execute: (gs, ctx, ee) => {
                const owner = gs.getPlayerById(ctx.source.ownerId);
                owner.primaryMana += 1;
                gs.log('EFFECT', 'Resourceful Scavenger: +1 mana!');
            },
        }),
    ]);

    // W010: Illusion Weaver — When Summoned: Silence an enemy unit
    effectEngine.registerCardEffects('W010', [
        createEffect({
            cardId: 'W010',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Silence an enemy unit',
            requiresTarget: true,
            targetType: 'enemy_unit',
            targets: (gs, ctx) => gs.getOpponents(ctx.sourcePlayer.id).flatMap(o => o.getFieldUnits()),
            execute: (gs, ctx, ee) => {
                if (ctx.target) ee.silenceUnit(ctx.target);
            },
        }),
    ]);

    // W011: Canyon Ambusher — Rush (keyword only)

    // W012: Totem Carver — When unit returned to hand: reduce cost by 1, gain 1 mana
    effectEngine.registerCardEffects('W012', [
        createEffect({
            cardId: 'W012',
            trigger: EFFECT_EVENTS.ON_UNIT_RETURNED,
            description: 'Reduce returned unit cost by 1, gain 1 mana',
            condition: (gs, ctx) => ctx.ownerId === ctx.source?.ownerId,
            execute: (gs, ctx, ee) => {
                if (ctx.returnedCard) {
                    ctx.returnedCard.manaCost = Math.max(0, ctx.returnedCard.manaCost - 1);
                    gs.log('EFFECT', `${ctx.returnedCard.name} cost reduced to ${ctx.returnedCard.manaCost}!`);
                }
                const owner = gs.getPlayerById(ctx.source.ownerId);
                owner.primaryMana += 1;
                gs.log('EFFECT', 'Totem Carver: +1 mana!');
            },
        }),
    ]);

    // W014: Wind Rider — When Summoned: Return a unit ≤400 ATK to hand
    effectEngine.registerCardEffects('W014', [
        createEffect({
            cardId: 'W014',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Return a unit with ≤400 ATK to hand',
            requiresTarget: true,
            targets: (gs, ctx) => gs.getAllFieldUnits().filter(u => u.currentATK <= 400 && u.instanceId !== ctx.source.instanceId),
            execute: (gs, ctx, ee) => {
                if (ctx.target) ee.returnToHand(ctx.target);
            },
        }),
    ]);

    // W015: Beast Tamer — When Summoned: Summon Tiger token
    effectEngine.registerCardEffects('W015', [
        createEffect({
            cardId: 'W015',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Summon a Tiger token',
            execute: (gs, ctx, ee) => {
                const slot = ctx.sourcePlayer.getEmptyUnitSlot();
                if (slot === -1) return;
                const token = cardDB.createCardInstance('W015a', ctx.sourcePlayer.id);
                if (token) {
                    token.position = 'ATK';
                    token.faceUp = true;
                    token.summonedThisTurn = true;
                    ctx.sourcePlayer.unitZone[slot] = token;
                    gs.log('TOKEN', 'Tiger token summoned!');
                    gs.emit('UNIT_SUMMONED', { card: token, player: ctx.sourcePlayer, slot });
                }
            },
        }),
    ]);

    // W016: Mesa Oracle — Once per round: Look at top 2, add 1, put other on bottom
    effectEngine.registerCardEffects('W016', [
        createEffect({
            cardId: 'W016',
            trigger: 'ACTIVATED',
            description: 'Look at top 2 cards, add 1 to hand',
            execute: async (gs, ctx, ee) => {
                const top2 = ctx.sourcePlayer.deck.splice(0, 2);
                if (top2.length === 0) return;
                const chosen = await ee.requestChoice(
                    top2.map(c => ({ label: c.name, value: c.instanceId, cardId: c.cardId })),
                    'Choose a card to add to your hand'
                );
                for (const card of top2) {
                    if (card.instanceId === chosen?.value) {
                        ctx.sourcePlayer.hand.push(card);
                        gs.log('EFFECT', `${card.name} added to hand.`);
                    } else {
                        ctx.sourcePlayer.deck.push(card);
                    }
                }
            },
        }),
    ]);

    // W017: Experienced Pathfinder — When attacks: +200 ATK to another friendly unit
    effectEngine.registerCardEffects('W017', [
        createEffect({
            cardId: 'W017',
            trigger: EFFECT_EVENTS.ON_ATTACK_DECLARE,
            description: 'Give another friendly unit +200 ATK',
            condition: (gs, ctx) => ctx.attacker?.cardId === 'W017',
            requiresTarget: true,
            targets: (gs, ctx) => {
                const owner = gs.getPlayerById(ctx.attacker.ownerId);
                return owner.getFieldUnits().filter(u => u.instanceId !== ctx.attacker.instanceId);
            },
            execute: (gs, ctx, ee) => {
                if (ctx.target) ee.applyTempStatMod(ctx.target, 200, 0, 'Experienced Pathfinder');
            },
        }),
    ]);

    // W018: Grand Shaman — Return friendly (gain 3 mana) or return enemy
    effectEngine.registerCardEffects('W018', [
        createEffect({
            cardId: 'W018',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Return a friendly unit (+3 mana) or an enemy unit',
            execute: async (gs, ctx, ee) => {
                const choice = await ee.requestChoice(
                    [{ label: 'Return friendly unit (+3 mana)', value: 'friendly' }, { label: 'Return enemy unit', value: 'enemy' }],
                    'Grand Shaman: Choose mode'
                );
                if (choice?.value === 'friendly') {
                    const targets = ctx.sourcePlayer.getFieldUnits().filter(u => u.instanceId !== ctx.source.instanceId);
                    if (targets.length > 0) {
                        const target = await ee.requestTarget(targets, 'Choose a friendly unit to return');
                        if (target) {
                            ee.returnToHand(target);
                            ctx.sourcePlayer.primaryMana += 3;
                            gs.log('EFFECT', `${ctx.sourcePlayer.name} gains 3 bonus mana!`);
                        }
                    }
                } else {
                    const targets = gs.getOpponents(ctx.sourcePlayer.id).flatMap(o => o.getFieldUnits());
                    if (targets.length > 0) {
                        const target = await ee.requestTarget(targets, 'Choose an enemy unit to return');
                        if (target) ee.returnToHand(target);
                    }
                }
            },
        }),
    ]);

    // W019: Twin-Headed Serpent — Can attack twice (set maxAttacks = 2)
    effectEngine.registerCardEffects('W019', [
        createEffect({
            cardId: 'W019',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Can attack twice per turn',
            execute: (gs, ctx, ee) => {
                ctx.source.maxAttacks = 2;
            },
        }),
    ]);

    // W020: Guardian Golem — Taunt (handled in CombatEngine.canTarget)

    // W021: Roaming Thunderbeast — When Summoned: Deal 300 to up to 2 enemy units
    effectEngine.registerCardEffects('W021', [
        createEffect({
            cardId: 'W021',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Deal 300 damage to up to 2 enemy units',
            execute: async (gs, ctx, ee) => {
                const enemies = gs.getOpponents(ctx.sourcePlayer.id).flatMap(o => o.getFieldUnits());
                for (let i = 0; i < Math.min(2, enemies.length); i++) {
                    const target = await ee.requestTarget(
                        enemies.filter(u => u.damageTaken < u.currentDEF),
                        `Choose target ${i + 1} for 300 damage`
                    );
                    if (target) {
                        ee.dealDamageToUnit(target, 300, 'Roaming Thunderbeast');
                        if (target.damageTaken >= target.currentDEF) ee.destroyUnit(target);
                    }
                }
            },
        }),
    ]);

    // W022: Sky Sovereign Eagle — When destroys enemy and survives: search Western unit
    effectEngine.registerCardEffects('W022', [
        createEffect({
            cardId: 'W022',
            trigger: EFFECT_EVENTS.ON_DESTROY,
            description: 'Search for a Western unit when destroying enemy',
            condition: (gs, ctx) => {
                // Check if the Eagle was the one that destroyed the enemy
                return ctx.destroyedCard?.ownerId !== ctx.source?.ownerId;
            },
            execute: async (gs, ctx, ee) => {
                const owner = gs.getPlayerById(ctx.source.ownerId);
                const westerns = owner.deck.filter(c => c.type === 'Unit' && c.region === 'Western');
                if (westerns.length > 0) {
                    const chosen = await ee.requestChoice(
                        westerns.map(c => ({ label: c.name, value: c.instanceId, cardId: c.cardId })),
                        'Choose a Western unit to add to hand'
                    );
                    if (chosen) {
                        ee.searchDeck(owner.id, c => c.instanceId === chosen.value);
                        ee.shuffleDeck(owner.id);
                    }
                }
            },
        }),
    ]);

    // W023: Spirit Walker Chief — Once per round: Summon from graveyard (silenced)
    effectEngine.registerCardEffects('W023', [
        createEffect({
            cardId: 'W023',
            trigger: 'ACTIVATED',
            description: 'Summon a unit from graveyard (silenced)',
            execute: async (gs, ctx, ee) => {
                const slot = ctx.sourcePlayer.getEmptyUnitSlot();
                if (slot === -1) return;
                const graveUnits = ctx.sourcePlayer.graveyard.filter(c => c.type === 'Unit');
                if (graveUnits.length > 0) {
                    const chosen = await ee.requestChoice(
                        graveUnits.map(c => ({ label: c.name, value: c.instanceId, cardId: c.cardId })),
                        'Choose a unit to revive from graveyard'
                    );
                    if (chosen) {
                        const idx = ctx.sourcePlayer.graveyard.findIndex(c => c.instanceId === chosen.value);
                        if (idx >= 0) {
                            const unit = ctx.sourcePlayer.graveyard.splice(idx, 1)[0];
                            unit.damageTaken = 0;
                            unit.position = 'ATK';
                            unit.faceUp = true;
                            unit.summonedThisTurn = true;
                            ee.silenceUnit(unit);
                            ctx.sourcePlayer.unitZone[slot] = unit;
                            gs.log('EFFECT', `${unit.name} revived from graveyard (silenced)!`);
                            gs.emit('UNIT_SUMMONED', { card: unit, player: ctx.sourcePlayer, slot });
                        }
                    }
                }
            },
        }),
    ]);

    // W024: Colossus of the Plains — When Summoned: Destroy all units ≤400 ATK
    effectEngine.registerCardEffects('W024', [
        createEffect({
            cardId: 'W024',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Destroy all other units with ≤400 ATK',
            execute: async (gs, ctx, ee) => {
                const toDestroy = gs.getAllFieldUnits().filter(u =>
                    u.instanceId !== ctx.source.instanceId && u.currentATK <= 400
                );
                for (const unit of toDestroy) {
                    await ee.destroyUnit(unit);
                }
            },
        }),
    ]);

    // W025: Mimic Chest — When Summoned: if 5+ total mana, draw a card
    effectEngine.registerCardEffects('W025', [
        createEffect({
            cardId: 'W025',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Draw a card if you have 5+ total mana',
            condition: (gs, ctx) => ctx.sourcePlayer.getTotalMana() >= 5,
            execute: (gs, ctx, ee) => {
                ee.drawCards(ctx.sourcePlayer.id, 1);
            },
        }),
    ]);

    // W026: Wind Whisperer — Once per round: Return a friendly unit to hand
    effectEngine.registerCardEffects('W026', [
        createEffect({
            cardId: 'W026',
            trigger: 'ACTIVATED',
            description: 'Return a friendly unit to your hand',
            requiresTarget: true,
            targets: (gs, ctx) => ctx.sourcePlayer.getFieldUnits().filter(u => u.instanceId !== ctx.source.instanceId),
            execute: (gs, ctx, ee) => {
                if (ctx.target) ee.returnToHand(ctx.target);
            },
        }),
    ]);

    // W027: Pack Mule Handler — When Summoned: If you control another Western unit, +1 mana + draw 1
    effectEngine.registerCardEffects('W027', [
        createEffect({
            cardId: 'W027',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'If you control another Western unit, +1 mana and draw 1',
            condition: (gs, ctx) => {
                return ctx.sourcePlayer.getFieldUnits()
                    .some(u => u.region === 'Western' && u.instanceId !== ctx.source.instanceId);
            },
            execute: (gs, ctx, ee) => {
                ctx.sourcePlayer.primaryMana += 1;
                ee.drawCards(ctx.sourcePlayer.id, 1);
            },
        }),
    ]);

    // W028: Trickster Coyote — Rush. When deals LP damage: return to hand
    effectEngine.registerCardEffects('W028', [
        createEffect({
            cardId: 'W028',
            trigger: EFFECT_EVENTS.ON_DAMAGE_TO_LP,
            description: 'Return to hand after dealing LP damage',
            condition: (gs, ctx) => ctx.attacker?.cardId === 'W028' && ctx.isCombat,
            execute: (gs, ctx, ee) => {
                if (ctx.attacker) ee.returnToHand(ctx.attacker);
            },
        }),
    ]);

    // W029: Burrowing Worm — When Summoned: Destroy/switch enemy Landmark
    effectEngine.registerCardEffects('W029', [
        createEffect({
            cardId: 'W029',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Destroy an enemy Landmark or switch with yours',
            execute: async (gs, ctx, ee) => {
                const opponents = gs.getOpponents(ctx.sourcePlayer.id).filter(o => o.landmarkZone);
                if (opponents.length === 0) return;
                const choice = await ee.requestChoice(
                    [{ label: 'Destroy enemy Landmark', value: 'destroy' }, { label: 'Switch Landmarks', value: 'switch' }],
                    'Burrowing Worm: Choose action'
                );
                if (choice?.value === 'destroy') {
                    const target = opponents[0];
                    target.graveyard.push(target.landmarkZone);
                    target.landmarkZone = null;
                    gs.log('EFFECT', 'Enemy Landmark destroyed!');
                } else if (choice?.value === 'switch') {
                    const target = opponents[0];
                    const temp = ctx.sourcePlayer.landmarkZone;
                    ctx.sourcePlayer.landmarkZone = target.landmarkZone;
                    target.landmarkZone = temp;
                    gs.log('EFFECT', 'Landmarks switched!');
                }
            },
        }),
    ]);

    // W030: Shield Brother — If you control another unit with ≥600 DEF, +300 ATK
    effectEngine.registerCardEffects('W030', [
        createEffect({
            cardId: 'W030',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: '+300 ATK if you control a unit with ≥600 DEF',
            execute: (gs, ctx, ee) => {
                const hasTank = ctx.sourcePlayer.getFieldUnits()
                    .some(u => u.instanceId !== ctx.source.instanceId && u.currentDEF >= 600);
                if (hasTank) {
                    ee.applyPermStatMod(ctx.source, 300, 0, 'Shield Brother');
                }
            },
        }),
    ]);

    // ─── SPELLS ───────────────────────────────────────────────

    // W031: Sudden Gust — Return a friendly unit to hand
    effectEngine.registerCardEffects('W031', [
        createEffect({
            cardId: 'W031',
            trigger: 'SELF',
            description: 'Return a friendly unit to your hand',
            requiresTarget: true,
            targets: (gs, ctx) => ctx.sourcePlayer.getFieldUnits(),
            execute: (gs, ctx, ee) => {
                if (ctx.target) ee.returnToHand(ctx.target);
            },
        }),
    ]);

    // W032: Ancestral Recall — Return a unit destroyed this turn from graveyard to hand
    effectEngine.registerCardEffects('W032', [
        createEffect({
            cardId: 'W032',
            trigger: 'SELF',
            description: 'Return a unit destroyed this turn to hand',
            execute: async (gs, ctx, ee) => {
                const eligible = ctx.sourcePlayer.graveyard.filter(c => c.type === 'Unit');
                if (eligible.length > 0) {
                    const chosen = await ee.requestChoice(
                        eligible.map(c => ({ label: c.name, value: c.instanceId, cardId: c.cardId })),
                        'Choose a unit to return to hand'
                    );
                    if (chosen) {
                        const idx = ctx.sourcePlayer.graveyard.findIndex(c => c.instanceId === chosen.value);
                        if (idx >= 0) {
                            const card = ctx.sourcePlayer.graveyard.splice(idx, 1)[0];
                            card.damageTaken = 0;
                            ctx.sourcePlayer.hand.push(card);
                            gs.log('EFFECT', `${card.name} returned to hand!`);
                        }
                    }
                }
            },
        }),
    ]);

    // W033: Stat Swap — Swap a unit's current ATK and DEF
    effectEngine.registerCardEffects('W033', [
        createEffect({
            cardId: 'W033',
            trigger: 'SELF',
            description: 'Swap a unit\'s ATK and DEF',
            requiresTarget: true,
            targetType: 'any_unit',
            targets: (gs) => gs.getAllFieldUnits(),
            execute: (gs, ctx, ee) => {
                if (ctx.target) {
                    const temp = ctx.target.currentATK;
                    ctx.target.currentATK = ctx.target.currentDEF;
                    ctx.target.currentDEF = temp;
                    gs.log('EFFECT', `${ctx.target.name}: ATK/DEF swapped to ${ctx.target.currentATK}/${ctx.target.currentDEF}`);
                }
            },
        }),
    ]);

    // W034: Rejuvenation Potion — Activate a unit's "When Summoned" effect
    effectEngine.registerCardEffects('W034', [
        createEffect({
            cardId: 'W034',
            trigger: 'SELF',
            description: 'Re-trigger a unit\'s "When Summoned" effect',
            requiresTarget: true,
            targets: (gs, ctx) => ctx.sourcePlayer.getFieldUnits().filter(u => u.effectTriggers.includes('ON_SUMMON')),
            execute: async (gs, ctx, ee) => {
                if (ctx.target) {
                    gs.log('EFFECT', `Re-triggering ${ctx.target.name}'s "When Summoned" effect!`);
                    await ee.triggerOnSummon(ctx.target, ctx.sourcePlayer);
                }
            },
        }),
    ]);

    // W035: Effect Mimicry — Copy another unit's effect text
    effectEngine.registerCardEffects('W035', [
        createEffect({
            cardId: 'W035',
            trigger: 'SELF',
            description: 'Copy a unit\'s effect to a friendly unit',
            execute: async (gs, ctx, ee) => {
                gs.log('EFFECT', 'Effect Mimicry activates!');
            },
        }),
    ]);

    // W036: Howling Wind — Switch two Landmarks
    effectEngine.registerCardEffects('W036', [
        createEffect({
            cardId: 'W036',
            trigger: 'SELF',
            description: 'Switch two Landmarks',
            execute: (gs, ctx, ee) => {
                const withLandmarks = gs.players.filter(p => p.landmarkZone);
                if (withLandmarks.length >= 2) {
                    const temp = withLandmarks[0].landmarkZone;
                    withLandmarks[0].landmarkZone = withLandmarks[1].landmarkZone;
                    withLandmarks[1].landmarkZone = temp;
                    gs.log('EFFECT', 'Landmarks switched!');
                }
            },
        }),
    ]);

    // W037: Silence — Silence an enemy unit
    effectEngine.registerCardEffects('W037', [
        createEffect({
            cardId: 'W037',
            trigger: 'SELF',
            description: 'Silence an enemy unit',
            requiresTarget: true,
            targets: (gs, ctx) => gs.getOpponents(ctx.sourcePlayer.id).flatMap(o => o.getFieldUnits()),
            execute: (gs, ctx, ee) => {
                if (ctx.target) ee.silenceUnit(ctx.target);
            },
        }),
    ]);

    // W038: Call of the Wild — Top 5 cards, summon 1 Western unit free
    effectEngine.registerCardEffects('W038', [
        createEffect({
            cardId: 'W038',
            trigger: 'SELF',
            description: 'Reveal top 5, summon 1 Western unit for free',
            execute: async (gs, ctx, ee) => {
                const top5 = ctx.sourcePlayer.deck.splice(0, Math.min(5, ctx.sourcePlayer.deck.length));
                const westerns = top5.filter(c => c.type === 'Unit' && c.region === 'Western');
                if (westerns.length > 0) {
                    const chosen = await ee.requestChoice(
                        westerns.map(c => ({ label: c.name, value: c.instanceId, cardId: c.cardId })),
                        'Choose a Western unit to summon for free'
                    );
                    if (chosen) {
                        const slot = ctx.sourcePlayer.getEmptyUnitSlot();
                        if (slot >= 0) {
                            const unit = westerns.find(c => c.instanceId === chosen.value);
                            unit.position = 'ATK';
                            unit.faceUp = true;
                            unit.summonedThisTurn = true;
                            ctx.sourcePlayer.unitZone[slot] = unit;
                            gs.emit('UNIT_SUMMONED', { card: unit, player: ctx.sourcePlayer, slot });
                            // Return rest to deck and shuffle
                            for (const c of top5) {
                                if (c.instanceId !== chosen.value) ctx.sourcePlayer.deck.push(c);
                            }
                            ee.shuffleDeck(ctx.sourcePlayer.id);
                            // Trigger summon effects
                            await ee.triggerOnSummon(unit, ctx.sourcePlayer);
                            return;
                        }
                    }
                }
                // Put all back if nothing summoned
                ctx.sourcePlayer.deck.unshift(...top5);
                ee.shuffleDeck(ctx.sourcePlayer.id);
            },
        }),
    ]);

    // W040: Planned Migration — Draw 2, put 1 on bottom
    effectEngine.registerCardEffects('W040', [
        createEffect({
            cardId: 'W040',
            trigger: 'SELF',
            description: 'Draw 2 cards, put 1 on deck bottom',
            execute: async (gs, ctx, ee) => {
                ee.drawCards(ctx.sourcePlayer.id, 2);
                if (ctx.sourcePlayer.hand.length > 0) {
                    const chosen = await ee.requestChoice(
                        ctx.sourcePlayer.hand.map(c => ({ label: c.name, value: c.instanceId, cardId: c.cardId })),
                        'Choose a card to put on deck bottom'
                    );
                    if (chosen) {
                        const idx = ctx.sourcePlayer.hand.findIndex(c => c.instanceId === chosen.value);
                        if (idx >= 0) {
                            const card = ctx.sourcePlayer.hand.splice(idx, 1)[0];
                            ctx.sourcePlayer.deck.push(card);
                        }
                    }
                }
            },
        }),
    ]);

    // W041: Empower Totem — +200/+200, retrigger When Summoned if Western
    effectEngine.registerCardEffects('W041', [
        createEffect({
            cardId: 'W041',
            trigger: 'SELF',
            description: '+200/+200; retrigger When Summoned if Western',
            requiresTarget: true,
            targets: (gs, ctx) => ctx.sourcePlayer.getFieldUnits(),
            execute: async (gs, ctx, ee) => {
                if (ctx.target) {
                    ee.applyPermStatMod(ctx.target, 200, 200, 'Empower Totem');
                    if (ctx.target.region === 'Western' && ctx.target.effectTriggers.includes('ON_SUMMON')) {
                        await ee.triggerOnSummon(ctx.target, ctx.sourcePlayer);
                    }
                }
            },
        }),
    ]);

    // W042: Shared Strength — All other friendly units gain half chosen unit's ATK
    effectEngine.registerCardEffects('W042', [
        createEffect({
            cardId: 'W042',
            trigger: 'SELF',
            description: 'All others gain half a chosen unit\'s ATK',
            requiresTarget: true,
            targets: (gs, ctx) => ctx.sourcePlayer.getFieldUnits(),
            execute: (gs, ctx, ee) => {
                if (ctx.target) {
                    const atkGain = Math.floor(ctx.target.baseATK / 2);
                    for (const unit of ctx.sourcePlayer.getFieldUnits()) {
                        if (unit.instanceId !== ctx.target.instanceId) {
                            ee.applyTempStatMod(unit, atkGain, 0, 'Shared Strength');
                        }
                    }
                }
            },
        }),
    ]);

    // W043: Ancestral Guidance — Search deck for unit with When Summoned
    effectEngine.registerCardEffects('W043', [
        createEffect({
            cardId: 'W043',
            trigger: 'SELF',
            description: 'Search deck for a unit with "When Summoned"',
            execute: async (gs, ctx, ee) => {
                const eligible = ctx.sourcePlayer.deck.filter(c =>
                    c.type === 'Unit' && c.effectTriggers.includes('ON_SUMMON')
                );
                if (eligible.length > 0) {
                    const chosen = await ee.requestChoice(
                        eligible.map(c => ({ label: c.name, value: c.instanceId, cardId: c.cardId })),
                        'Choose a unit with "When Summoned" to add to hand'
                    );
                    if (chosen) {
                        ee.searchDeck(ctx.sourcePlayer.id, c => c.instanceId === chosen.value);
                        ee.shuffleDeck(ctx.sourcePlayer.id);
                    }
                }
            },
        }),
    ]);

    // ─── TRAPS ────────────────────────────────────────────────

    // W044: Unstable Ground — When opponent summons: return to hand
    effectEngine.registerCardEffects('W044', [
        createEffect({
            cardId: 'W044',
            trigger: EFFECT_EVENTS.ON_OPPONENT_SUMMON,
            description: 'Return summoned unit to hand',
            condition: (gs, ctx) => ctx.summoningPlayer?.id !== ctx.sourcePlayer.id,
            execute: (gs, ctx, ee) => {
                if (ctx.summonedCard) {
                    ee.returnToHand(ctx.summonedCard);
                    gs.log('TRAP', `Unstable Ground returns ${ctx.summonedCard.name} to hand!`);
                }
            },
        }),
    ]);

    // W045: Effect Dampener — Negate unit ability
    effectEngine.registerCardEffects('W045', [
        createEffect({
            cardId: 'W045',
            trigger: EFFECT_EVENTS.ON_OPPONENT_SUMMON,
            description: "Negate opponent's unit ability",
            condition: (gs, ctx) => ctx.summoningPlayer?.id !== ctx.sourcePlayer.id,
            execute: (gs, ctx, ee) => {
                if (ctx.summonedCard) {
                    ee.silenceUnit(ctx.summonedCard);
                    gs.log('TRAP', `Effect Dampener negates ${ctx.summonedCard.name}'s abilities!`);
                }
            },
        }),
    ]);

    // W046: Decoy Totem — Redirect targeting to this card, then destroy
    effectEngine.registerCardEffects('W046', [
        createEffect({
            cardId: 'W046',
            trigger: EFFECT_EVENTS.ON_FRIENDLY_TARGETED,
            description: 'Redirect effect to this card, then destroy it',
            execute: (gs, ctx, ee) => {
                gs.log('TRAP', 'Decoy Totem absorbs the targeting!');
                // Find and destroy the Decoy Totem
                const loc = gs.findCardOnField(ctx.source.instanceId);
                if (loc) {
                    loc.player.spellTrapZone[loc.index] = null;
                    loc.player.graveyard.push(ctx.source);
                }
            },
        }),
    ]);

    // W047: Surprise Reinforcements — When friendly destroyed: summon unit ≤4 cost from hand
    effectEngine.registerCardEffects('W047', [
        createEffect({
            cardId: 'W047',
            trigger: EFFECT_EVENTS.ON_FRIENDLY_DESTROY,
            description: 'Summon a unit (≤4 cost) from hand',
            condition: (gs, ctx) => ctx.ownerId === ctx.sourcePlayer.id,
            execute: async (gs, ctx, ee) => {
                const eligible = ctx.sourcePlayer.hand.filter(c => c.type === 'Unit' && c.manaCost <= 4);
                if (eligible.length > 0) {
                    const chosen = await ee.requestChoice(
                        eligible.map(c => ({ label: c.name, value: c.instanceId, cardId: c.cardId })),
                        'Choose a unit (≤4 cost) to summon'
                    );
                    if (chosen) {
                        const slot = ctx.sourcePlayer.getEmptyUnitSlot();
                        if (slot >= 0) {
                            const idx = ctx.sourcePlayer.hand.findIndex(c => c.instanceId === chosen.value);
                            const unit = ctx.sourcePlayer.hand.splice(idx, 1)[0];
                            unit.position = 'ATK';
                            unit.faceUp = true;
                            unit.summonedThisTurn = true;
                            ctx.sourcePlayer.unitZone[slot] = unit;
                            gs.emit('UNIT_SUMMONED', { card: unit, player: ctx.sourcePlayer, slot });
                        }
                    }
                }
            },
        }),
    ]);

    // W048: Ensnaring Trap — Attacker cannot attack next turn
    effectEngine.registerCardEffects('W048', [
        createEffect({
            cardId: 'W048',
            trigger: EFFECT_EVENTS.ON_ATTACK_DECLARE,
            description: 'Attacker cannot attack next turn',
            condition: (gs, ctx) => ctx.attackerOwner?.id !== ctx.sourcePlayer.id,
            execute: (gs, ctx, ee) => {
                ctx.attacker._cannotAttackNextTurn = true;
                gs.log('TRAP', `${ctx.attacker.name} is ensnared and cannot attack next turn!`);
            },
        }),
    ]);

    // W049: Spirit Backlash — Negate enemy Spell/Trap targeting friendly
    effectEngine.registerCardEffects('W049', [
        createEffect({
            cardId: 'W049',
            trigger: EFFECT_EVENTS.ON_SPELL_ACTIVATE,
            description: 'Negate and destroy enemy Spell/Trap',
            condition: (gs, ctx) => ctx.caster?.id !== ctx.sourcePlayer.id,
            execute: (gs, ctx, ee) => {
                gs.log('TRAP', 'Spirit Backlash negates the Spell/Trap!');
            },
        }),
    ]);

    // W050: Power Siphon — When opponent activates ability: friendly gains ATK/DEF = cost x100
    effectEngine.registerCardEffects('W050', [
        createEffect({
            cardId: 'W050',
            trigger: EFFECT_EVENTS.ON_OPPONENT_SUMMON,
            description: 'Friendly unit gains ATK/DEF equal to activating unit cost x100',
            condition: (gs, ctx) => ctx.summoningPlayer?.id !== ctx.sourcePlayer.id,
            execute: async (gs, ctx, ee) => {
                if (ctx.summonedCard) {
                    const bonus = ctx.summonedCard.manaCost * 100;
                    const friendlies = ctx.sourcePlayer.getFieldUnits();
                    if (friendlies.length > 0) {
                        const target = await ee.requestTarget(friendlies, 'Choose a friendly unit to power up');
                        if (target) {
                            ee.applyPermStatMod(target, bonus, bonus, 'Power Siphon');
                        }
                    }
                }
            },
        }),
    ]);
}
