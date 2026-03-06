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
import { AuthService } from './services/AuthService.js';
import { LoginUI } from './ui/LoginUI.js';
import * as NorthernEffects from './effects/NorthernEffects.js';
import * as EasternEffects from './effects/EasternEffects.js';
import * as WesternEffects from './effects/WesternEffects.js';
import * as SouthernEffects from './effects/SouthernEffects.js';

// Card data CSV path — loaded from the project root
const CSV_URL = './card_dataV4.4.csv';

async function init() {
    console.log('🎴 Battle Among Regions — Initializing...');

    // 1. Create auth service
    const authService = new AuthService();

    // 2. Create the game controller
    const controller = new GameController();

    // 3. Load card database from CSV
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
            Make sure card_dataV4.4.csv is in the project root directory.
          </p>
        </div>
      </div>
    `;
        return;
    }

    // 4. Register all card effects
    controller.registerEffects([
        NorthernEffects,
        EasternEffects,
        WesternEffects,
        SouthernEffects,
    ]);
    console.log('✅ Card effects registered');

    // 5. Set up event listeners for animations
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

    // 6. Create UI and Campaign UI
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

    // Wire auth service into UI components
    ui.authService = authService;
    onlineUI.authService = authService;
    deckBuilderUI.authService = authService;

    console.log('✅ Game ready!');

    // Debug: expose globally for console testing
    window.game = controller;
    window.ui = ui;
    window.campaign = campaignUI;
    window.warCampaign = warCampaignUI;
    window.auth = authService;

    // 7. Auth Flow — check for existing token or show login
    const startGame = () => {
        // Check for Stripe purchase redirect
        const params = new URLSearchParams(window.location.search);
        if (params.get('purchase') === 'success') {
            // Clean URL and sync cosmetics
            window.history.replaceState({}, '', window.location.pathname);
            ui.cosmetics.syncFromServer(authService).then(() => {
                ui._showMenuToast?.('✓ Purchase complete! Item added to your collection.');
            });
        } else if (params.get('purchase') === 'cancelled') {
            window.history.replaceState({}, '', window.location.pathname);
        }
        ui.showMenu();
    };

    // Region selection for first-time players
    const showRegionSelect = () => {
        return new Promise(resolve => {
            const app = document.getElementById('app');
            const regions = [
                { name: 'Northern', color: '#4fc3f7', desc: 'Ice and frost warriors' },
                { name: 'Eastern', color: '#81c784', desc: 'Stealth and precision' },
                { name: 'Southern', color: '#ff8a65', desc: 'Fire and brute force' },
                { name: 'Western', color: '#ce93d8', desc: 'Spirits and the arcane' },
            ];

            app.innerHTML = `
              <div class="region-select-screen">
                <div class="region-select-content">
                  <h1 class="region-select-heading">Choose Your Region</h1>
                  <p class="region-select-subtitle">You'll receive one copy of every card from your chosen region to start your collection.</p>
                  <div class="region-select-grid">
                    ${regions.map(r => `
                      <div class="region-select-card region-select-${r.name.toLowerCase()}" data-region="${r.name}">
                        <div class="region-select-card-img-wrap">
                          <img class="region-select-card-img"
                               src="./cosmetics/${r.name.charAt(0)}001.png"
                               alt="${r.name}"
                               onerror="this.style.display='none'" />
                        </div>
                        <div class="region-select-card-info">
                          <h2>${r.name}</h2>
                          <p>${r.desc}</p>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              </div>
            `;

            app.querySelectorAll('[data-region]').forEach(el => {
                el.onclick = async () => {
                    const region = el.dataset.region;
                    el.classList.add('selected');
                    app.querySelectorAll('[data-region]').forEach(e => {
                        if (e !== el) e.style.pointerEvents = 'none';
                    });

                    try {
                        const result = await authService.chooseRegion(region);
                        console.log(`🗺️ Chose ${region} — received ${result.granted.length} starter cards`);
                        resolve();
                    } catch (err) {
                        console.error('Failed to choose region:', err);
                        alert('Failed to save region choice: ' + err.message);
                        // Re-enable
                        app.querySelectorAll('[data-region]').forEach(e => e.style.pointerEvents = '');
                        el.classList.remove('selected');
                    }
                };
            });
        });
    };

    const handleAuthComplete = async (loggedIn) => {
        if (loggedIn && authService.isLoggedIn && !authService.hasChosenRegion) {
            await showRegionSelect();
        }
        startGame();
    };

    if (authService.token) {
        // Verify existing token is still valid
        const valid = await authService.verifyToken();
        if (valid) {
            console.log(`🔑 Logged in as: ${authService.displayName}`);
            await handleAuthComplete(true);
        } else {
            console.log('🔑 Token expired, showing login');
            const loginUI = new LoginUI(document.getElementById('app'), authService, async ({ loggedIn }) => {
                if (loggedIn) console.log(`🔑 Logged in as: ${authService.displayName}`);
                else console.log('👤 Continuing as guest');
                await handleAuthComplete(loggedIn);
            });
            loginUI.show();
        }
    } else {
        // No token — show login screen
        const loginUI = new LoginUI(document.getElementById('app'), authService, async ({ loggedIn }) => {
            if (loggedIn) console.log(`🔑 Logged in as: ${authService.displayName}`);
            else console.log('👤 Continuing as guest');
            await handleAuthComplete(loggedIn);
        });
        loginUI.show();
    }
}

// Boot the game
init().catch(console.error);
