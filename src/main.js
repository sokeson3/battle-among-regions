// ─────────────────────────────────────────────────────────────
// main.js — Entry point for Battle Among Regions
// ─────────────────────────────────────────────────────────────

import './index.css';
import { GameController } from './engine/GameController.js';
import { GameUI } from './ui/GameUI.js';
import { CampaignUI } from './ui/CampaignUI.js';
import { WarCampaignUI } from './ui/WarCampaignUI.js';
import { DuelDeckBuilderUI } from './ui/DuelDeckBuilderUI.js';
import { TutorialUI } from './ui/TutorialUI.js';
import { OnlineGameUI } from './ui/OnlineGameUI.js';
import * as NorthernEffects from './effects/NorthernEffects.js';
import * as EasternEffects from './effects/EasternEffects.js';
import * as WesternEffects from './effects/WesternEffects.js';
import * as SouthernEffects from './effects/SouthernEffects.js';

// Card data CSV path — loaded from the project root
const CSV_URL = './card_dataV4.3.csv';

async function init() {
    console.log('🎴 Battle Among Regions — Initializing...');

    // 1. Create the game controller
    const controller = new GameController();

    // 2. Load card database from CSV
    try {
        const response = await fetch(CSV_URL);
        const csvText = await response.text();
        await controller.loadCards(csvText);
        console.log('✅ Card database loaded');
    } catch (err) {
        console.error('❌ Failed to load card data:', err);
        document.getElementById('app').innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;
                  font-family:Cinzel,serif;color:#ef5350;text-align:center;padding:40px">
        <div>
          <h1 style="font-size:2rem;margin-bottom:16px">Failed to Load Card Data</h1>
          <p style="color:#8b92a8">${err.message}</p>
          <p style="color:#525a72;margin-top:12px;font-size:0.8rem">
            Make sure card_dataV4.3.csv is in the project root directory.
          </p>
        </div>
      </div>
    `;
        return;
    }

    // 3. Register all card effects
    controller.registerEffects([
        NorthernEffects,
        EasternEffects,
        WesternEffects,
        SouthernEffects,
    ]);
    console.log('✅ Card effects registered');

    // 4. Set up event listeners for animations
    controller.gameState.on('LP_CHANGED', (data) => {
        const el = document.getElementById(`lp-${data.playerId}`);
        if (el) {
            el.classList.add('shaking');
            setTimeout(() => el.classList.remove('shaking'), 400);
        }
        if (data.amount < 0) {
            // Show floating damage number
            const bar = document.querySelector(`[data-player="${data.playerId}"] .lp-display`);
            if (bar) {
                const rect = bar.getBoundingClientRect();
                ui.showFloatingNumber(rect.x + rect.width / 2, rect.y, `${data.amount}`, 'damage');
            }
        }
    });

    controller.gameState.on('UNIT_SUMMONED', (data) => {
        setTimeout(() => {
            const card = document.querySelector(`[data-instance="${data.card.instanceId}"]`);
            if (card) card.classList.add('summoning');
        }, 50);
    });

    controller.gameState.on('CARD_DESTROYED', (data) => {
        const card = document.querySelector(`[data-instance="${data.card.instanceId}"]`);
        if (card) {
            card.classList.add('destroying');
        }
    });

    controller.gameState.on('UNIT_DAMAGED', (data) => {
        const card = document.querySelector(`[data-instance="${data.target.instanceId}"]`);
        if (card) {
            const rect = card.getBoundingClientRect();
            ui.showFloatingNumber(rect.x + rect.width / 2, rect.y, `-${data.amount}`, 'damage');
        }
    });

    controller.gameState.on('UNIT_HEALED', (data) => {
        const card = document.querySelector(`[data-instance="${data.card.instanceId}"]`);
        if (card) {
            const rect = card.getBoundingClientRect();
            ui.showFloatingNumber(rect.x + rect.width / 2, rect.y, `+${data.amount}`, 'heal');
        }
    });

    // 5. Create UI and Campaign UI
    const ui = new GameUI(controller);
    const campaignUI = new CampaignUI(ui, controller);
    const warCampaignUI = new WarCampaignUI(ui, controller);
    const tutorialUI = new TutorialUI(ui);
    const deckBuilderUI = new DuelDeckBuilderUI(
        document.getElementById('app'),
        controller.cardDB,
        () => ui.showMenu()
    );
    const onlineUI = new OnlineGameUI(ui, controller);
    // Wire war campaign for online mode
    onlineUI.warUI = warCampaignUI;

    ui.campaignUI = campaignUI;
    ui.warCampaignUI = warCampaignUI;
    ui.tutorialUI = tutorialUI;
    ui.deckBuilderUI = deckBuilderUI;
    ui.onlineUI = onlineUI;

    ui.showMenu();

    console.log('✅ Game ready!');

    // Debug: expose globally for console testing
    window.game = controller;
    window.ui = ui;
    window.campaign = campaignUI;
    window.warCampaign = warCampaignUI;
}

// Boot the game
init().catch(console.error);

