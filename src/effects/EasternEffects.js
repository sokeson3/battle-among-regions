// ─────────────────────────────────────────────────────────────
// EasternEffects.js — All Eastern region card effects
// ─────────────────────────────────────────────────────────────

import { EFFECT_EVENTS, createEffect } from '../engine/EffectEngine.js';

export function register(effectEngine, cardDB) {

    // ─── LANDMARKS ────────────────────────────────────────────

    // E001: Hidden Monastery — +2 mana if only Shadow/no units (handled in ManaSystem)

    // E002: Scroll Library — Once per round: copy/negate a spell for 2 mana
    effectEngine.registerCardEffects('E002', [
        createEffect({
            cardId: 'E002',
            trigger: EFFECT_EVENTS.ON_SPELL_ACTIVATE,
            description: 'Negate or copy a spell for 2 mana',
            condition: (gs, ctx) => {
                const owner = gs.players.find(p => p.landmarkZone?.cardId === 'E002');
                if (!owner) return false;
                // Only react to OPPONENT spells, not the owner's own
                if (!ctx.caster || ctx.caster.id === owner.id) return false;
                if (owner.landmarkZone._scrollLibraryUsed) return false;
                // Must have a Spell or Trap in hand to reveal AND 2 mana to pay
                return owner.hand.some(c => c.type === 'Spell' || c.type === 'Trap') &&
                    (owner.primaryMana + owner.spellMana) >= 2;
            },
            isOptional: true,
            execute: async (gs, ctx, ee) => {
                const owner = gs.players.find(p => p.landmarkZone?.cardId === 'E002');
                if (!owner) return;

                const choice = await ee.requestChoice(
                    [{ label: 'Negate the Spell', value: 'negate' }, { label: 'Copy the effect', value: 'copy' }, { label: 'Pass', value: 'pass' }],
                    `Scroll Library: React to ${ctx.spell?.name || 'Spell'}?`
                );
                if (!choice || choice.value === 'pass') return;

                // Reveal a Spell/Trap from hand, shuffle it into deck
                const revealable = owner.hand.filter(c => c.type === 'Spell' || c.type === 'Trap');
                const revealed = await ee.requestChoice(
                    revealable.map(c => ({ label: `${c.name} (${c.type})`, value: c.instanceId, cardId: c.cardId })),
                    'Choose a Spell/Trap to reveal and shuffle into your deck'
                );
                if (!revealed) return;

                const revIdx = owner.hand.findIndex(c => c.instanceId === revealed.value);
                if (revIdx >= 0) {
                    const card = owner.hand.splice(revIdx, 1)[0];
                    owner.deck.push(card);
                    ee.shuffleDeck(owner.id);
                    gs.log('EFFECT', `${owner.name} reveals ${card.name} and shuffles it into the deck.`);
                }

                // Pay 2 mana
                const fromSpell = Math.min(2, owner.spellMana);
                owner.spellMana -= fromSpell;
                if (fromSpell < 2) owner.primaryMana -= (2 - fromSpell);

                // Mark as used this round
                owner.landmarkZone._scrollLibraryUsed = true;

                gs.log('LANDMARK', `Scroll Library activates! (${choice.value})`);

                if (choice.value === 'negate') {
                    // Set negation flag — spell execution will be skipped
                    if (gs.battleState) {
                        gs.battleState.spellNegated = true;
                    }
                    gs._scrollLibraryNegate = true;
                    gs.log('EFFECT', `Scroll Library negates ${ctx.spell?.name || 'the Spell'}!`);
                } else if (choice.value === 'copy') {
                    // Copy the spell's effect to the Scroll Library owner
                    const spellEffects = ee.getEffects(ctx.spell?.cardId);
                    for (const eff of spellEffects) {
                        if (eff.trigger === 'SELF' || eff.trigger === EFFECT_EVENTS.ON_SPELL_ACTIVATE) {
                            await ee._resolveEffect(eff, { source: ctx.spell, sourcePlayer: owner });
                        }
                    }
                    gs.log('EFFECT', `Scroll Library copies ${ctx.spell?.name || 'the Spell'}'s effect!`);
                }
            },
        }),
    ]);

    // ─── UNITS ────────────────────────────────────────────────

    // E003: Initiate Monk — When Summoned: Draw 1 card
    effectEngine.registerCardEffects('E003', [
        createEffect({
            cardId: 'E003',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Draw 1 card',
            execute: (gs, ctx, ee) => {
                ee.drawCards(ctx.sourcePlayer.id, 1);
            },
        }),
    ]);

    // E004: Ink Sprite — Pierce. When you activate a Spell, +100 ATK
    effectEngine.registerCardEffects('E004', [
        createEffect({
            cardId: 'E004',
            trigger: EFFECT_EVENTS.ON_SPELL_PLAY,
            description: '+100 ATK when a Spell is activated',
            condition: (gs, ctx) => ctx.caster?.id === ctx.source?.ownerId,
            execute: (gs, ctx, ee) => {
                ee.applyPermStatMod(ctx.source, 100, 0, 'Ink Sprite');
            },
        }),
    ]);

    // E005: Shadow Novice — Shadow. When Landmark summoned/moved, +100/+100
    effectEngine.registerCardEffects('E005', [
        createEffect({
            cardId: 'E005',
            trigger: EFFECT_EVENTS.ON_LANDMARK_PLACED,
            description: 'Gain +100 ATK and +100 DEF',
            execute: (gs, ctx, ee) => {
                ee.applyPermStatMod(ctx.source, 100, 100, 'Shadow Novice');
            },
        }),
    ]);

    // E006: Meditation Adept — Spells can be activated as Traps (passive)

    // E007: Silent Assassin — Shadow. Rush. Cannot be targeted by enemy Spells/Traps while attacking
    effectEngine.registerCardEffects('E007', [
        createEffect({
            cardId: 'E007',
            trigger: EFFECT_EVENTS.ON_ATTACK_DECLARE,
            description: 'Cannot be targeted while attacking',
            condition: (gs, ctx) => ctx.attacker?.cardId === 'E007',
            execute: (gs, ctx, ee) => {
                ctx.attacker.canBeTargeted = false;
                gs.log('EFFECT', 'Silent Assassin cannot be targeted by enemy effects while attacking!');
            },
        }),
    ]);

    // E008: Scroll Keeper — When Summoned: Search deck for Spell/Trap
    effectEngine.registerCardEffects('E008', [
        createEffect({
            cardId: 'E008',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Search deck for a Spell/Trap',
            execute: async (gs, ctx, ee) => {
                const spellsTraps = ctx.sourcePlayer.deck.filter(c => c.type === 'Spell' || c.type === 'Trap');
                if (spellsTraps.length > 0) {
                    const chosen = await ee.requestChoice(
                        spellsTraps.map(c => ({ label: `${c.name} (${c.type}, Cost: ${c.manaCost})`, value: c.instanceId, cardId: c.cardId })),
                        'Choose a Spell/Trap from your deck'
                    );
                    if (chosen) {
                        ee.searchDeck(ctx.sourcePlayer.id, c => c.instanceId === chosen.value, 'Spell/Trap');
                        ee.shuffleDeck(ctx.sourcePlayer.id);
                    }
                }
            },
        }),
    ]);

    // E009: Illusionist Apprentice — Shadow. Once per round: Switch 2 Landmarks
    effectEngine.registerCardEffects('E009', [
        createEffect({
            cardId: 'E009',
            trigger: 'ACTIVATED',
            description: 'Switch 2 Landmarks on the field',
            execute: async (gs, ctx, ee) => {
                const players = gs.players.filter(p => p.landmarkZone !== null);
                if (players.length >= 2) {
                    // Swap the first two landmarks found
                    const temp = players[0].landmarkZone;
                    players[0].landmarkZone = players[1].landmarkZone;
                    players[1].landmarkZone = temp;
                    gs.log('EFFECT', `Landmarks swapped between ${players[0].name} and ${players[1].name}!`);
                    // Trigger landmark-placed for each moved landmark
                    await ee.trigger(EFFECT_EVENTS.ON_LANDMARK_PLACED, { landmark: players[0].landmarkZone, placer: ctx.sourcePlayer, targetPlayer: players[0] });
                    await ee.trigger(EFFECT_EVENTS.ON_LANDMARK_PLACED, { landmark: players[1].landmarkZone, placer: ctx.sourcePlayer, targetPlayer: players[1] });
                }
            },
        }),
    ]);

    // E010: Wind Dancer — First Spell/Trap each turn: +100/+100
    effectEngine.registerCardEffects('E010', [
        createEffect({
            cardId: 'E010',
            trigger: EFFECT_EVENTS.ON_SPELL_PLAY,
            description: '+100/+100 on first Spell/Trap',
            condition: (gs, ctx) => {
                return ctx.caster?.id === ctx.source?.ownerId && ctx.caster.spellsPlayedThisTurn <= 1;
            },
            execute: (gs, ctx, ee) => {
                ee.applyPermStatMod(ctx.source, 100, 100, 'Wind Dancer');
            },
        }),
    ]);

    // E011: Master Spy — When Summoned: Draw one random card from opponent's hand
    effectEngine.registerCardEffects('E011', [
        createEffect({
            cardId: 'E011',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: "Draw a random card from opponent's hand",
            execute: (gs, ctx, ee) => {
                const opponent = gs.getOpponent(ctx.sourcePlayer.id);
                if (opponent && opponent.hand.length > 0) {
                    const idx = Math.floor(Math.random() * opponent.hand.length);
                    const stolen = opponent.hand.splice(idx, 1)[0];
                    stolen.ownerId = ctx.sourcePlayer.id;
                    ctx.sourcePlayer.hand.push(stolen);
                    gs.log('EFFECT', `Master Spy steals ${stolen.name} from ${opponent.name}!`);
                }
            },
        }),
    ]);

    // E012: Temple Guardian — Landmark and Set cards cannot be affected by enemies (passive)

    // E013: Arcane Assistant — Once per round: Draw 1 card when Spell/Trap/Landmark affected
    effectEngine.registerCardEffects('E013', [
        createEffect({
            cardId: 'E013',
            trigger: EFFECT_EVENTS.ON_SPELL_PLAY,
            description: 'Draw 1 card when you play a Spell/Trap',
            condition: (gs, ctx) => ctx.caster?.id === ctx.source?.ownerId && !ctx.source.activatedThisRound,
            execute: (gs, ctx, ee) => {
                ctx.source.activatedThisRound = true;
                ee.drawCards(ctx.sourcePlayer.id, 1);
            },
        }),
    ]);

    // E014: Shadow Clone Master — When Summoned: Summon Shadow Clone with chosen unit's ATK
    effectEngine.registerCardEffects('E014', [
        createEffect({
            cardId: 'E014',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Summon Shadow Clone with a chosen unit\'s ATK',
            requiresTarget: true,
            targetType: 'any_unit',
            targets: (gs, ctx) => gs.getAllFieldUnits().filter(u => u.instanceId !== ctx.source.instanceId),
            execute: (gs, ctx, ee) => {
                const slot = ctx.sourcePlayer.getEmptyUnitSlot();
                if (slot === -1 || !ctx.target) return;
                const token = cardDB.createCardInstance('E014a', ctx.sourcePlayer.id);
                if (token) {
                    token.currentATK = ctx.target.currentATK;
                    token.baseATK = ctx.target.currentATK;
                    token.position = 'ATK';
                    token.faceUp = true;
                    token.summonedThisTurn = true;
                    ctx.sourcePlayer.unitZone[slot] = token;
                    gs.log('TOKEN', `Shadow Clone summoned with ${token.currentATK} ATK!`);
                    gs.emit('UNIT_SUMMONED', { card: token, player: ctx.sourcePlayer, slot });
                }
            },
        }),
    ]);

    // E015: Lore Weaver — When Summoned: Pay 2 extra mana to destroy unit with ≤500 ATK
    effectEngine.registerCardEffects('E015', [
        createEffect({
            cardId: 'E015',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Pay 2 extra mana to destroy a unit with ≤500 ATK',
            isOptional: true,
            requiresTarget: true,
            targets: (gs, ctx) => gs.getAllFieldUnits().filter(u => u.currentATK <= 500 && u.instanceId !== ctx.source.instanceId),
            condition: (gs, ctx) => ctx.sourcePlayer.getTotalMana() >= 2,
            execute: async (gs, ctx, ee) => {
                if (ctx.target) {
                    // Spend 2 extra mana
                    const player = ctx.sourcePlayer;
                    const spent = Math.min(2, player.primaryMana);
                    player.primaryMana -= spent;
                    if (spent < 2) player.spellMana -= (2 - spent);
                    ee.destroyUnit(ctx.target);
                }
            },
        }),
    ]);

    // E016: Bladestorm Monk — When this unit attacks: Recover 1 Spell/Landmark from graveyard
    effectEngine.registerCardEffects('E016', [
        createEffect({
            cardId: 'E016',
            trigger: EFFECT_EVENTS.ON_ATTACK_DECLARE,
            description: 'Recover a Spell or Landmark from graveyard',
            condition: (gs, ctx) => ctx.attacker?.cardId === 'E016',
            isOptional: true,
            execute: async (gs, ctx, ee) => {
                const player = gs.getPlayerById(ctx.attacker.ownerId);
                const eligible = player.graveyard.filter(c => c.type === 'Spell' || c.type === 'Landmark');
                if (eligible.length > 0) {
                    const chosen = await ee.requestChoice(
                        eligible.map(c => ({ label: c.name, value: c.instanceId, cardId: c.cardId })),
                        'Choose a Spell/Landmark to return to hand'
                    );
                    if (chosen) {
                        const idx = player.graveyard.findIndex(c => c.instanceId === chosen.value);
                        if (idx >= 0) {
                            const card = player.graveyard.splice(idx, 1)[0];
                            player.hand.push(card);
                            gs.log('EFFECT', `${card.name} returned from graveyard to hand!`);
                        }
                    }
                }
            },
        }),
    ]);

    // E017: Grandmaster Strategist — When Summoned: Place Landmark from any graveyard to any zone
    effectEngine.registerCardEffects('E017', [
        createEffect({
            cardId: 'E017',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Place a Landmark from graveyard into any Landmark zone',
            execute: async (gs, ctx, ee) => {
                const allLandmarks = gs.players.flatMap(p =>
                    p.graveyard.filter(c => c.type === 'Landmark').map(c => ({ card: c, player: p }))
                );
                if (allLandmarks.length > 0) {
                    const chosen = await ee.requestChoice(
                        allLandmarks.map(l => ({ label: `${l.card.name} (${l.player.name}'s graveyard)`, value: l.card.instanceId, cardId: l.card.cardId })),
                        'Choose a Landmark from any graveyard'
                    );
                    if (chosen) {
                        const target = allLandmarks.find(l => l.card.instanceId === chosen.value);
                        if (target) {
                            const idx = target.player.graveyard.findIndex(c => c.instanceId === chosen.value);
                            if (idx >= 0) {
                                const landmark = target.player.graveyard.splice(idx, 1)[0];
                                // Choose which player to place it on
                                const targetPlayer = await ee.requestChoice(
                                    gs.players.map(p => ({ label: `${p.name}'s zone`, value: p.id })),
                                    'Place Landmark in which zone?'
                                );
                                if (targetPlayer) {
                                    const tp = gs.getPlayerById(targetPlayer.value);
                                    if (tp.landmarkZone) tp.graveyard.push(tp.landmarkZone);
                                    tp.landmarkZone = landmark;
                                    landmark.faceUp = true;
                                    gs.log('LANDMARK', `${landmark.name} placed in ${tp.name}'s Landmark Zone!`);
                                    // Trigger landmark-placed so E005 etc. react
                                    await ee.trigger(EFFECT_EVENTS.ON_LANDMARK_PLACED, { landmark, placer: ctx.sourcePlayer, targetPlayer: tp });
                                }
                            }
                        }
                    }
                }
            },
        }),
    ]);

    // E018: Spirit Dragon — When Summoned: Return all Spell/Traps to owners' hands
    effectEngine.registerCardEffects('E018', [
        createEffect({
            cardId: 'E018',
            trigger: EFFECT_EVENTS.ON_SUMMON,
            description: 'Return all Spell/Traps to owners\' hands',
            execute: (gs, ctx, ee) => {
                for (const player of gs.players) {
                    for (let i = 0; i < 5; i++) {
                        const card = player.spellTrapZone[i];
                        if (card) {
                            player.spellTrapZone[i] = null;
                            player.hand.push(card);
                            gs.log('EFFECT', `${card.name} returned to ${player.name}'s hand.`);
                        }
                    }
                }
            },
        }),
    ]);

    // E019: Enigmatic Sensei — Opponents pay 400 LP to activate traps (handled in ActionValidator)

    // E020: Mist Walker — Shadow. Immune to Spell/Trap damage (passive)

    // ─── SPELLS ───────────────────────────────────────────────

    // E021: Preparation — Look at top 3, reorder
    effectEngine.registerCardEffects('E021', [
        createEffect({
            cardId: 'E021',
            trigger: 'SELF',
            description: 'Look at top 3 cards and reorder',
            execute: async (gs, ctx, ee) => {
                const top3 = ctx.sourcePlayer.deck.splice(0, Math.min(3, ctx.sourcePlayer.deck.length));
                if (top3.length === 0) return;
                gs.log('EFFECT', `Top ${top3.length} cards: ${top3.map(c => c.name).join(', ')}`);

                // Let the player reorder by picking cards one at a time
                const reordered = [];
                let remaining = [...top3];
                for (let i = 0; i < top3.length; i++) {
                    if (remaining.length === 1) {
                        reordered.push(remaining[0]);
                        break;
                    }
                    const chosen = await ee.requestChoice(
                        remaining.map(c => ({ label: c.name, value: c.instanceId, cardId: c.cardId })),
                        `Choose card for position ${i + 1} (top of deck)`
                    );
                    if (chosen) {
                        const card = remaining.find(c => c.instanceId === chosen.value);
                        reordered.push(card);
                        remaining = remaining.filter(c => c.instanceId !== chosen.value);
                    } else {
                        // If cancelled, push remaining in current order
                        reordered.push(...remaining);
                        break;
                    }
                }
                // Place reordered cards back on top of deck
                ctx.sourcePlayer.deck.unshift(...reordered);
                gs.log('EFFECT', `Deck reordered: ${reordered.map(c => c.name).join(', ')}`);
            },
        }),
    ]);

    // E022: Quick Reflexes — Give a friendly unit Shadow this turn
    effectEngine.registerCardEffects('E022', [
        createEffect({
            cardId: 'E022',
            trigger: 'SELF',
            description: 'Give a unit Shadow this turn',
            requiresTarget: true,
            targetType: 'friendly_unit',
            targets: (gs, ctx) => ctx.sourcePlayer.getFieldUnits(),
            execute: (gs, ctx, ee) => {
                if (ctx.target && !ctx.target.keywords.includes('SHADOW')) {
                    ctx.target.keywords.push('SHADOW');
                    if (!ctx.target._tempKeywords) ctx.target._tempKeywords = [];
                    ctx.target._tempKeywords.push('SHADOW');
                    gs.log('EFFECT', `${ctx.target.name} gains Shadow this turn!`);
                }
            },
        }),
    ]);

    // E023: Scroll Search — Add a Spell/Trap from deck to hand
    effectEngine.registerCardEffects('E023', [
        createEffect({
            cardId: 'E023',
            trigger: 'SELF',
            description: 'Search deck for a Spell/Trap',
            execute: async (gs, ctx, ee) => {
                const eligible = ctx.sourcePlayer.deck.filter(c => c.type === 'Spell' || c.type === 'Trap');
                if (eligible.length > 0) {
                    const chosen = await ee.requestChoice(
                        eligible.map(c => ({ label: `${c.name} (${c.type})`, value: c.instanceId, cardId: c.cardId })),
                        'Choose a Spell or Trap from your deck'
                    );
                    if (chosen) {
                        ee.searchDeck(ctx.sourcePlayer.id, c => c.instanceId === chosen.value);
                        ee.shuffleDeck(ctx.sourcePlayer.id);
                    }
                }
            },
        }),
    ]);

    // E024: Redirect — Deal 200 dmg (400 if played another Spell/Trap this turn)
    effectEngine.registerCardEffects('E024', [
        createEffect({
            cardId: 'E024',
            trigger: 'SELF',
            description: 'Deal 200 (or 400) damage to a unit',
            requiresTarget: true,
            targetType: 'any_unit',
            targets: (gs) => gs.getAllFieldUnits(),
            execute: (gs, ctx, ee) => {
                const dmg = ctx.sourcePlayer.spellsPlayedThisTurn > 1 ? 400 : 200;
                if (ctx.target) {
                    ee.dealDamageToUnit(ctx.target, dmg, 'Redirect');
                }
            },
        }),
    ]);

    // E026: Energy Flow — Draw 1 card
    effectEngine.registerCardEffects('E026', [
        createEffect({
            cardId: 'E026',
            trigger: 'SELF',
            description: 'Draw 1 card',
            execute: (gs, ctx, ee) => {
                ee.drawCards(ctx.sourcePlayer.id, 1);
            },
        }),
    ]);

    // E027: Double Cast — Next spell is copied
    effectEngine.registerCardEffects('E027', [
        createEffect({
            cardId: 'E027',
            trigger: 'SELF',
            description: 'Next spell is copied',
            execute: (gs, ctx, ee) => {
                // Set a flag on the player that the next spell activates twice
                ctx.sourcePlayer._doubleCastActive = true;
                gs.log('EFFECT', 'Double Cast active — next Spell will be copied!');
            },
        }),
    ]);

    // E028: Mind Read — Steal a random card from opponent's hand
    effectEngine.registerCardEffects('E028', [
        createEffect({
            cardId: 'E028',
            trigger: 'SELF',
            description: 'Steal a random card from opponent\'s hand',
            execute: (gs, ctx, ee) => {
                const opponent = gs.getOpponent(ctx.sourcePlayer.id);
                if (opponent && opponent.hand.length > 0) {
                    const idx = Math.floor(Math.random() * opponent.hand.length);
                    const stolen = opponent.hand.splice(idx, 1)[0];
                    stolen.ownerId = ctx.sourcePlayer.id;
                    ctx.sourcePlayer.hand.push(stolen);
                    gs.log('EFFECT', `Mind Read steals ${stolen.name} from ${opponent.name}!`);
                }
            },
        }),
    ]);

    // E029: Cleansing Ritual — Destroy one Landmark
    effectEngine.registerCardEffects('E029', [
        createEffect({
            cardId: 'E029',
            trigger: 'SELF',
            description: 'Destroy one Landmark',
            requiresTarget: true,
            targets: (gs) => gs.players.filter(p => p.landmarkZone).map(p => ({
                type: 'landmark', card: p.landmarkZone, player: p, name: `${p.landmarkZone.name} (${p.name})`
            })),
            execute: (gs, ctx, ee) => {
                if (ctx.target?.type === 'landmark') {
                    const player = ctx.target.player;
                    player.graveyard.push(player.landmarkZone);
                    player.landmarkZone = null;
                    gs.log('EFFECT', `${ctx.target.card.name} destroyed by Cleansing Ritual!`);
                }
            },
        }),
    ]);

    // E030: Focused Chi — Draw 2 cards
    effectEngine.registerCardEffects('E030', [
        createEffect({
            cardId: 'E030',
            trigger: 'SELF',
            description: 'Draw 2 cards',
            execute: (gs, ctx, ee) => {
                ee.drawCards(ctx.sourcePlayer.id, 2);
            },
        }),
    ]);

    // E031: Forbidden Technique — Destroy enemy unit, take 300 damage
    effectEngine.registerCardEffects('E031', [
        createEffect({
            cardId: 'E031',
            trigger: 'SELF',
            description: 'Destroy an enemy unit; you take 300 damage',
            requiresTarget: true,
            targetType: 'enemy_unit',
            targets: (gs, ctx) => gs.getOpponents(ctx.sourcePlayer.id).flatMap(o => o.getFieldUnits()),
            execute: (gs, ctx, ee) => {
                if (ctx.target) {
                    ee.destroyUnit(ctx.target);
                    ee.dealDamageToLP(ctx.sourcePlayer.id, 300, 'Forbidden Technique self-damage');
                }
            },
        }),
    ]);

    // E032: Knowledge Transfer — Shuffle 3 Spells/Traps from graveyard to deck, draw 1
    effectEngine.registerCardEffects('E032', [
        createEffect({
            cardId: 'E032',
            trigger: 'SELF',
            description: 'Shuffle 3 Spells/Traps from graveyard into deck, draw 1',
            execute: (gs, ctx, ee) => {
                const eligible = ctx.sourcePlayer.graveyard.filter(c => c.type === 'Spell' || c.type === 'Trap');
                const toReturn = eligible.slice(0, 3);
                for (const card of toReturn) {
                    const idx = ctx.sourcePlayer.graveyard.indexOf(card);
                    if (idx >= 0) {
                        ctx.sourcePlayer.graveyard.splice(idx, 1);
                        ctx.sourcePlayer.deck.push(card);
                    }
                }
                ee.shuffleDeck(ctx.sourcePlayer.id);
                ee.drawCards(ctx.sourcePlayer.id, 1);
                gs.log('EFFECT', `${toReturn.length} cards shuffled back, 1 drawn.`);
            },
        }),
    ]);

    // E033: Tactical Retreat — Return enemy unit to hand
    effectEngine.registerCardEffects('E033', [
        createEffect({
            cardId: 'E033',
            trigger: 'SELF',
            description: 'Return an enemy unit to its owner\'s hand',
            requiresTarget: true,
            targetType: 'enemy_unit',
            targets: (gs, ctx) => gs.getOpponents(ctx.sourcePlayer.id).flatMap(o => o.getFieldUnits()),
            execute: (gs, ctx, ee) => {
                if (ctx.target) ee.returnToHand(ctx.target);
            },
        }),
    ]);

    // E034: Mass Illusion — Shuffle all Landmarks and place randomly
    effectEngine.registerCardEffects('E034', [
        createEffect({
            cardId: 'E034',
            trigger: 'SELF',
            description: 'Shuffle and randomly redistribute all Landmarks',
            execute: async (gs, ctx, ee) => {
                // Collect landmarks and remember which players had them
                const playersWithLandmarks = [];
                const originalLandmarks = [];
                for (const p of gs.players) {
                    if (p.landmarkZone) {
                        playersWithLandmarks.push(p);
                        originalLandmarks.push(p.landmarkZone);
                        p.landmarkZone = null;
                    }
                }
                if (originalLandmarks.length < 2) {
                    // Need at least 2 landmarks to shuffle meaningfully
                    if (originalLandmarks.length === 1) {
                        playersWithLandmarks[0].landmarkZone = originalLandmarks[0];
                    }
                    gs.log('EFFECT', 'Not enough Landmarks on the field to shuffle.');
                    return;
                }
                // Shuffle landmarks, guaranteeing at least one changes position
                let shuffled;
                do {
                    shuffled = [...originalLandmarks];
                    for (let i = shuffled.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                    }
                } while (shuffled.every((lm, idx) => lm === originalLandmarks[idx]));

                // Assign shuffled landmarks back to the players who had them
                for (let i = 0; i < playersWithLandmarks.length; i++) {
                    playersWithLandmarks[i].landmarkZone = shuffled[i];
                    shuffled[i].faceUp = true;
                }
                gs.log('EFFECT', 'All Landmarks shuffled and redistributed!');
                // Trigger landmark-placed for each redistributed landmark
                for (let i = 0; i < playersWithLandmarks.length; i++) {
                    gs.emit('LANDMARK_PLACED', { card: shuffled[i], player: ctx.sourcePlayer, targetPlayer: playersWithLandmarks[i] });
                    await ee.trigger(EFFECT_EVENTS.ON_LANDMARK_PLACED, { landmark: shuffled[i], placer: ctx.sourcePlayer, targetPlayer: playersWithLandmarks[i] });
                }
            },
        }),
    ]);

    // E035: Seal Spell — Immune to attack/spells/traps for 1 round
    effectEngine.registerCardEffects('E035', [
        createEffect({
            cardId: 'E035',
            trigger: 'SELF',
            description: 'Immune to all attacks, Spells and Traps for 1 round',
            execute: (gs, ctx, ee) => {
                ctx.sourcePlayer._sealActive = true;
                ctx.sourcePlayer._sealExpiresRound = gs.roundCounter + 1;
                gs.log('EFFECT', `${ctx.sourcePlayer.name} is sealed — immune for 1 round!`);
            },
        }),
    ]);

    // ─── TRAPS ────────────────────────────────────────────────

    // E025: Calculated Strike — Change target of enemy single-target Spell/Trap
    effectEngine.registerCardEffects('E025', [
        createEffect({
            cardId: 'E025',
            trigger: EFFECT_EVENTS.ON_SPELL_ACTIVATE,
            description: 'Redirect an enemy Spell/Trap to another target',
            condition: (gs, ctx) => ctx.caster && ctx.caster.id !== ctx.sourcePlayer.id,
            isOptional: true,
            execute: (gs, ctx, ee) => {
                gs.log('TRAP', 'Calculated Strike redirects the effect!');
            },
        }),
    ]);

    // E037: Feint — Attack now targets your LP instead
    effectEngine.registerCardEffects('E037', [
        createEffect({
            cardId: 'E037',
            trigger: EFFECT_EVENTS.ON_ATTACK_DECLARE,
            description: 'Redirect attack to your LP',
            condition: (gs, ctx) => ctx.target?.type === 'unit' && ctx.target.card?.ownerId === ctx.sourcePlayer.id,
            execute: (gs, ctx, ee) => {
                // Change target to LP
                ctx.target = { type: 'direct', player: ctx.sourcePlayer };
                gs.log('TRAP', 'Feint redirects the attack to LP!');
            },
        }),
    ]);

    // E038: Bamboo Snare — Attacking unit -300 ATK -300 DEF this turn
    effectEngine.registerCardEffects('E038', [
        createEffect({
            cardId: 'E038',
            trigger: EFFECT_EVENTS.ON_ATTACK_DECLARE,
            description: 'Attacker gets -300 ATK and -300 DEF',
            condition: (gs, ctx) => ctx.attackerOwner?.id !== ctx.sourcePlayer.id,
            execute: (gs, ctx, ee) => {
                ee.applyTempStatMod(ctx.attacker, -300, -300, 'Bamboo Snare');
            },
        }),
    ]);

    // E039: Misdirection — Change target of single-target card
    effectEngine.registerCardEffects('E039', [
        createEffect({
            cardId: 'E039',
            trigger: EFFECT_EVENTS.ON_FRIENDLY_TARGETED,
            description: 'Change target to another valid card',
            condition: (gs, ctx) => ctx.sourcePlayer.id !== ctx.attackerOwner?.id,
            execute: (gs, ctx, ee) => {
                gs.log('TRAP', 'Misdirection changes the target!');
            },
        }),
    ]);

    // E040: Smoke Screen — Enemy units cannot attack LP directly this turn
    effectEngine.registerCardEffects('E040', [
        createEffect({
            cardId: 'E040',
            trigger: EFFECT_EVENTS.ON_BATTLE_PHASE_START,
            description: 'Enemies cannot attack LP directly this turn',
            condition: (gs, ctx) => gs.getActivePlayer()?.id !== ctx.sourcePlayer.id,
            execute: (gs, ctx, ee) => {
                gs.log('TRAP', 'Smoke Screen — no direct LP attacks this turn!');
                // Set flag to prevent direct attacks
                ctx.sourcePlayer._smokeScreenActive = true;
            },
        }),
    ]);

    // E041: Vanishing Act — Return targeted friendly unit to hand
    effectEngine.registerCardEffects('E041', [
        createEffect({
            cardId: 'E041',
            trigger: EFFECT_EVENTS.ON_FRIENDLY_TARGETED,
            description: 'Return targeted friendly unit to hand',
            condition: (gs, ctx) => ctx.target?.card?.ownerId === ctx.sourcePlayer.id,
            execute: (gs, ctx, ee) => {
                if (ctx.target?.card) {
                    ee.returnToHand(ctx.target.card);
                }
            },
        }),
    ]);

    // E042: Spell Reversal — Negate damage spell and reflect to opponent
    effectEngine.registerCardEffects('E042', [
        createEffect({
            cardId: 'E042',
            trigger: EFFECT_EVENTS.ON_SPELL_ACTIVATE,
            description: 'Negate damage spell and deal damage to opponent',
            condition: (gs, ctx) => ctx.caster?.id !== ctx.sourcePlayer.id,
            execute: (gs, ctx, ee) => {
                gs._chainNegate = true;
                const opponent = ctx.caster;
                if (opponent) {
                    ee.dealDamageToLP(opponent.id, 400, 'Spell Reversal');
                    gs.log('TRAP', 'Spell Reversal negates and reflects damage!');
                }
            },
        }),
    ]);

    // E043: Shadow Clone Spell — When opponent summons: create clone with that ATK
    effectEngine.registerCardEffects('E043', [
        createEffect({
            cardId: 'E043',
            trigger: EFFECT_EVENTS.ON_OPPONENT_SUMMON,
            description: 'Summon Shadow Clone with summoned unit\'s ATK',
            condition: (gs, ctx) => ctx.summoningPlayer?.id !== ctx.sourcePlayer.id,
            execute: (gs, ctx, ee) => {
                const slot = ctx.sourcePlayer.getEmptyUnitSlot();
                if (slot === -1) return;
                const token = cardDB.createCardInstance('E014a', ctx.sourcePlayer.id);
                if (token && ctx.summonedCard) {
                    token.currentATK = ctx.summonedCard.currentATK;
                    token.baseATK = ctx.summonedCard.currentATK;
                    token.position = 'ATK';
                    token.faceUp = true;
                    token.summonedThisTurn = true;
                    ctx.sourcePlayer.unitZone[slot] = token;
                    gs.log('TRAP', `Shadow Clone summoned with ${token.currentATK} ATK!`);
                    gs.emit('UNIT_SUMMONED', { card: token, player: ctx.sourcePlayer, slot });
                }
            },
        }),
    ]);

    // E044: Time Delay Rune — Opponent can only play 1 more card this turn
    effectEngine.registerCardEffects('E044', [
        createEffect({
            cardId: 'E044',
            trigger: 'SELF',
            description: 'Opponent can only play 1 more card this turn',
            execute: (gs, ctx, ee) => {
                const opponent = gs.getOpponent(ctx.sourcePlayer.id);
                if (opponent) {
                    opponent._timeDelayActive = true;
                    gs.log('TRAP', 'Time Delay Rune — opponent can only play 1 more card!');
                }
            },
        }),
    ]);

    // E045: Karma Cut — When enemy unit activates effect: destroy it
    // Implementation: triggers on opponent summon for units with ON_SUMMON effects
    effectEngine.registerCardEffects('E045', [
        createEffect({
            cardId: 'E045',
            trigger: EFFECT_EVENTS.ON_OPPONENT_SUMMON,
            description: 'Destroy unit that activated its effect',
            condition: (gs, ctx) => {
                return ctx.summoningPlayer?.id !== ctx.sourcePlayer.id &&
                    ctx.summonedCard?.effectTriggers?.includes('ON_SUMMON');
            },
            execute: (gs, ctx, ee) => {
                if (ctx.summonedCard && ctx.summonedCard.effectTriggers.includes('ON_SUMMON')) {
                    ee.destroyUnit(ctx.summonedCard);
                    gs.log('TRAP', `Karma Cut destroys ${ctx.summonedCard.name}!`);
                }
            },
        }),
    ]);

    // E046: Secret Passage — Give attacking friendly unit Shadow this turn
    effectEngine.registerCardEffects('E046', [
        createEffect({
            cardId: 'E046',
            trigger: EFFECT_EVENTS.ON_ATTACK_DECLARE,
            description: 'Give attacking friendly unit Shadow',
            condition: (gs, ctx) => ctx.attacker?.ownerId === ctx.sourcePlayer.id,
            execute: (gs, ctx, ee) => {
                if (!ctx.attacker.keywords.includes('SHADOW')) {
                    ctx.attacker.keywords.push('SHADOW');
                    if (!ctx.attacker._tempKeywords) ctx.attacker._tempKeywords = [];
                    ctx.attacker._tempKeywords.push('SHADOW');
                    gs.log('TRAP', `Secret Passage gives ${ctx.attacker.name} Shadow!`);
                }
            },
        }),
    ]);

    // E047: Chain Reaction — Copy graveyard trap effect
    effectEngine.registerCardEffects('E047', [
        createEffect({
            cardId: 'E047',
            trigger: EFFECT_EVENTS.ON_ATTACK_DECLARE,
            description: 'Copy a Trap from graveyard',
            execute: async (gs, ctx, ee) => {
                const graveyardTraps = ctx.sourcePlayer.graveyard.filter(c => c.type === 'Trap');
                if (graveyardTraps.length === 0) {
                    gs.log('TRAP', 'Chain Reaction: No Traps in graveyard!');
                    return;
                }
                const chosen = await ee.requestChoice(
                    graveyardTraps.map(c => ({ label: c.name, value: c.instanceId, cardId: c.cardId })),
                    'Choose a Trap from your graveyard to copy'
                );
                if (chosen) {
                    const trapCard = graveyardTraps.find(c => c.instanceId === chosen.value);
                    const trapEffects = ee.getEffects(trapCard.cardId);
                    gs.log('TRAP', `Chain Reaction copies ${trapCard.name}!`);
                    for (const eff of trapEffects) {
                        await ee._resolveEffect(eff, { ...ctx, source: trapCard, sourcePlayer: ctx.sourcePlayer });
                    }
                }
            },
        }),
    ]);

    // E048: Emergency Provisions — Destroy own Spell/Traps, heal 300 per card
    effectEngine.registerCardEffects('E048', [
        createEffect({
            cardId: 'E048',
            trigger: 'SELF',
            description: 'Destroy own Spell/Traps for 300 LP each',
            execute: (gs, ctx, ee) => {
                let healed = 0;
                for (let i = 0; i < 5; i++) {
                    const card = ctx.sourcePlayer.spellTrapZone[i];
                    if (card && card.instanceId !== ctx.source.instanceId) {
                        ctx.sourcePlayer.graveyard.push(card);
                        ctx.sourcePlayer.spellTrapZone[i] = null;
                        healed += 300;
                        gs.log('EFFECT', `${card.name} destroyed for 300 LP.`);
                    }
                }
                if (healed > 0) ee.healLP(ctx.sourcePlayer.id, healed);
            },
        }),
    ]);

    // E049: Trap Hole Refined — Destroy summoned unit with ≥800 ATK, draw 1
    effectEngine.registerCardEffects('E049', [
        createEffect({
            cardId: 'E049',
            trigger: EFFECT_EVENTS.ON_OPPONENT_SUMMON,
            description: 'Destroy summoned unit with ≥800 ATK, draw 1',
            condition: (gs, ctx) => {
                return ctx.summoningPlayer?.id !== ctx.sourcePlayer.id &&
                    ctx.summonedCard?.currentATK >= 800;
            },
            execute: (gs, ctx, ee) => {
                if (ctx.summonedCard) {
                    ee.destroyUnit(ctx.summonedCard);
                    ee.drawCards(ctx.sourcePlayer.id, 1);
                    gs.log('TRAP', `Trap Hole Refined destroys ${ctx.summonedCard.name}!`);
                }
            },
        }),
    ]);
}
