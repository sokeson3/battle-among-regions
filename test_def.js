import fs from 'fs';
import { GameController } from './src/engine/GameController.js';
import { CardDatabase } from './src/engine/CardDatabase.js';

import * as NorthernEffects from './src/effects/NorthernEffects.js';
import * as EasternEffects from './src/effects/EasternEffects.js';
import * as SouthernEffects from './src/effects/SouthernEffects.js';
import * as WesternEffects from './src/effects/WesternEffects.js';

async function test() {
    const csvRules = fs.readFileSync('./card_dataV4.3.csv', 'utf8');
    const controller = new GameController();
    await controller.loadCards(csvRules);
    controller.registerEffects([NorthernEffects, EasternEffects, SouthernEffects, WesternEffects]);

    await controller.setupGame([
        { name: 'P1', region: 'Northern' },
        { name: 'P2', region: 'Eastern' }
    ]);

    const p1 = controller.gameState.players[0];
    const unit = p1.hand.find(c => c.type === 'Unit');

    if (!unit) {
        console.log("No unit found in hand");
        return;
    }

    // grant mana and main phase
    p1.primaryMana = 10;
    controller.gameState.phase = 'MAIN1';
    controller.gameState.activePlayerIndex = 0;

    console.log("Playing", unit.name, "in DEF");
    try {
        const result = await controller.playUnit(p1.id, unit.instanceId, 'DEF');
        console.log("Result:", result);
    } catch (e) {
        console.error("Exception:", e);
    }
}

test().catch(console.error);
