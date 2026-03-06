// ─────────────────────────────────────────────────────────────
// CampaignUI.js — Campaign mode UI screens
// ─────────────────────────────────────────────────────────────

import { CAMPAIGN_STAGES, CampaignProgress } from '../campaign/CampaignData.js';
import { AIPlayer } from '../engine/AIPlayer.js';
import { PHASES } from '../engine/GameState.js';
import { DeckBuilderUI } from './DeckBuilderUI.js';

export class CampaignUI {
    /**
     * @param {import('./GameUI.js').GameUI} gameUI
     * @param {import('../engine/GameController.js').GameController} controller
     */
    constructor(gameUI, controller) {
        this.gameUI = gameUI;
        this.controller = controller;
        this.app = document.getElementById('app');
        this.progress = new CampaignProgress();
        this.ai = null;
        this.currentStage = null;
        this._aiTurnListener = null;
        this.deckBuilder = null;
        this._playerDraftedDeck = null;
        this._aiDraftedDeck = null;
    }

    // ─── Region Select (Player only) ──────────────────────────

    showRegionSelect() {
        const self = this;

        this.app.innerHTML = `
            <div class="region-select">
                <button class="global-menu-btn" id="btn-menu">☰ Menu</button>
                <h2>Choose Your Region</h2>
                <p class="player-label">War Campaign — Select your homeland</p>
                <div class="region-grid">
                    ${this._renderRegionCard('Northern', 'north', 'Resilient defenders. Masters of healing and fortification.')}
                    ${this._renderRegionCard('Eastern', 'east', 'Cunning strategists. Spell mastery and shadow tactics.')}
                    ${this._renderRegionCard('Southern', 'south', 'Aggressive warriors. Raw power and piercing strikes.')}
                    ${this._renderRegionCard('Western', 'west', 'Adaptable tricksters. Unit synergy and effect manipulation.')}
                </div>
            </div>
        `;
        this._wireMenuBtn();

        document.querySelectorAll('.region-card').forEach(card => {
            card.onclick = () => {
                const region = card.dataset.region;
                self.progress.playerRegion = region;
                self.progress.currentStage = 1;
                self.progress.completedStages = [];
                self.progress.stats = {};
                self.progress.savedDeckCardIds = [];
                self.progress.save();
                self.showCampaignMap();
            };
        });
    }

    _renderRegionCard(region, cssClass, desc) {
        return `
            <div class="region-card ${cssClass}" data-region="${region}">
                <h3>${region}</h3>
                <p>${desc}</p>
            </div>
        `;
    }

    // ─── Campaign Map ──────────────────────────────────────────

    showCampaignMap() {
        const progress = this.progress;

        // Group stages by region front
        const fronts = [
            { name: 'Northern Front', region: 'Northern', cssClass: 'north', stages: CAMPAIGN_STAGES.filter(s => s.id <= 3) },
            { name: 'Eastern Front', region: 'Eastern', cssClass: 'east', stages: CAMPAIGN_STAGES.filter(s => s.id >= 4 && s.id <= 6) },
            { name: 'Southern Front', region: 'Southern', cssClass: 'south', stages: CAMPAIGN_STAGES.filter(s => s.id >= 7 && s.id <= 9) },
            { name: 'Western Front', region: 'Western', cssClass: 'west', stages: CAMPAIGN_STAGES.filter(s => s.id >= 10 && s.id <= 12) },
            { name: '⚔ Finale', region: 'Finale', cssClass: 'finale', stages: CAMPAIGN_STAGES.filter(s => s.id >= 13) },
        ];

        const completedCount = progress.completedStages.length;
        const totalCount = CAMPAIGN_STAGES.length;

        this.app.innerHTML = `
            <div class="campaign-map">
                <div class="campaign-header">
                    <button class="campaign-back-btn" id="btn-campaign-back">← Back</button>
                    <div class="campaign-title-wrap">
                        <h1 class="campaign-title">War Campaign</h1>
                        <p class="campaign-subtitle">${progress.playerRegion} Legion • ${completedCount}/${totalCount} Stages Conquered</p>
                    </div>
                    <button class="campaign-reset-btn" id="btn-campaign-reset">Reset</button>
                </div>

                <div class="campaign-progress-bar">
                    <div class="campaign-progress-fill" style="width: ${(completedCount / totalCount) * 100}%"></div>
                </div>

                <div class="campaign-fronts">
                    ${fronts.map(front => `
                        <div class="campaign-front">
                            <h2 class="front-title ${front.cssClass}">${front.name}</h2>
                            <div class="stage-nodes">
                                ${front.stages.map((stage, i) => {
            const unlocked = progress.isStageUnlocked(stage.id);
            const completed = progress.isStageCompleted(stage.id);
            const stateClass = completed ? 'completed' : unlocked ? 'unlocked' : 'locked';
            const stageStats = progress.stats[stage.id];

            return `
                                        ${i > 0 ? `<div class="stage-connector ${completed ? 'completed' : unlocked ? 'active' : ''}"></div>` : ''}
                                        <div class="stage-node ${stateClass} ${front.cssClass}" data-stage="${stage.id}">
                                            <div class="stage-icon">
                                                ${completed ? '✓' : unlocked ? stage.id : '🔒'}
                                            </div>
                                            <div class="stage-info">
                                                <span class="stage-name">${stage.name}</span>
                                                <span class="stage-opponent">${unlocked ? stage.opponentName : '???'}</span>
                                                <span class="difficulty-badge ${stage.difficulty}">${stage.difficulty}</span>
                                                ${stageStats ? `<span class="stage-stat">LP: ${stageStats.lpRemaining} • ${stageStats.turns}T</span>` : ''}
                                            </div>
                                        </div>
                                    `;
        }).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>

                ${progress.isComplete ? `
                    <div class="campaign-victory-banner">
                        <h2>🏆 ALL REGIONS CONQUERED 🏆</h2>
                        <p>You have united the lands under the ${progress.playerRegion} banner!</p>
                    </div>
                ` : ''}
            </div>
        `;

        // Wire up stage clicks
        document.querySelectorAll('.stage-node.unlocked').forEach(el => {
            el.onclick = () => {
                const stageId = parseInt(el.dataset.stage);
                this.showPreBattle(stageId);
            };
        });

        // Wire up back button
        document.getElementById('btn-campaign-back').onclick = () => {
            this.gameUI.showMenu();
        };

        // Wire up reset button
        document.getElementById('btn-campaign-reset').onclick = () => {
            if (confirm('Reset all campaign progress?')) {
                this.progress.reset();
                this.showRegionSelect();
            }
        };
    }

    // ─── Pre-Battle Screen ──────────────────────────────────────

    showPreBattle(stageId) {
        const stage = CAMPAIGN_STAGES.find(s => s.id === stageId);
        if (!stage) return;

        this.currentStage = stage;
        const playerRegion = this.progress.playerRegion;
        const regionClass = this._getRegionClass(stage.opponentRegion);
        const playerClass = this._getRegionClass(playerRegion);

        this.app.innerHTML = `
            <div class="pre-battle-screen">
                <div class="pre-battle-bg ${regionClass}"></div>
                <div class="pre-battle-content">
                    <div class="pre-battle-stage-info">
                        <span class="difficulty-badge ${stage.difficulty}">${stage.difficulty}</span>
                        <h3>Stage ${stage.id} — ${stage.name}</h3>
                        <p class="pre-battle-desc">${stage.description}</p>
                    </div>

                    <div class="pre-battle-versus">
                        <div class="pre-battle-player ${playerClass}">
                            <div class="pre-battle-avatar ${playerClass}">You</div>
                            <span class="pre-battle-name">Your ${playerRegion} Legion</span>
                            <span class="pre-battle-lp">LP: ${stage.playerLP}</span>
                        </div>

                        <div class="pre-battle-vs">VS</div>

                        <div class="pre-battle-player ${regionClass}">
                            <div class="pre-battle-avatar ${regionClass}">${stage.opponentName[0]}</div>
                            <span class="pre-battle-name">${stage.opponentName}</span>
                            <span class="pre-battle-lp">LP: ${stage.opponentLP}</span>
                        </div>
                    </div>

                    <div class="pre-battle-actions">
                        <button class="menu-btn primary campaign-glow" id="btn-draft-battle">📋 Draft Deck & Battle</button>
                        <button class="menu-btn" id="btn-back-map">← Back to Map</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('btn-draft-battle').onclick = () => this._startCampaignDraft(stage);
        document.getElementById('btn-back-map').onclick = () => this.showCampaignMap();
    }

    // ─── Draft Deck for Campaign ──────────────────────────────

    async _startCampaignDraft(stage) {
        const cardDB = this.controller.cardDB;
        const playerRegion = this.progress.playerRegion;
        const allRegions = ['Northern', 'Eastern', 'Southern', 'Western'];

        // Initialize deck builder
        if (!this.deckBuilder) {
            this.deckBuilder = new DeckBuilderUI(this.app, cardDB);
        }

        const targetDeckSize = stage.draftDeckSize || 20;
        let draftIdCounter = 0;

        // ── Helper: Build a region's card pool ──
        const buildRegionPool = (region) => {
            const regionCards = cardDB.getCardsByRegion(region)
                .filter(c => c.type !== 'Token' && c.quantity > 0);
            const pool = [];
            for (const card of regionCards) {
                for (let copy = 0; copy < card.quantity; copy++) {
                    pool.push({ ...card, draftId: `${card.id}_draft_${draftIdCounter++}` });
                }
            }
            return pool;
        };

        // ── Determine AI region and seat arrangement ──
        const aiRegion = stage.multiRegion
            ? allRegions.filter(r => r !== playerRegion)[0]
            : stage.opponentRegion;

        // Build initial region pools
        const regionPools = {};
        for (const region of allRegions) {
            regionPools[region] = buildRegionPool(region);
        }

        // Remove copies of cards already in the player's saved deck from pools
        const existingCounts = {};
        for (const cardId of this.progress.savedDeckCardIds) {
            existingCounts[cardId] = (existingCounts[cardId] || 0) + 1;
        }
        const removedCounts = {};
        for (const region of allRegions) {
            regionPools[region] = regionPools[region].filter(c => {
                if (existingCounts[c.id] && (!removedCounts[c.id] || removedCounts[c.id] < existingCounts[c.id])) {
                    removedCounts[c.id] = (removedCounts[c.id] || 0) + 1;
                    return false;
                }
                return true;
            });
        }

        // Build 4 seats — one per unique region, player at 0, AI at 2
        let seatRegions;
        if (playerRegion === aiRegion) {
            // Same region: player at 0, spread remaining 3 across seats 1–3
            const others = allRegions.filter(r => r !== playerRegion)
                .sort(() => Math.random() - 0.5);
            seatRegions = [playerRegion, others[0], others[1], others[2]];
        } else {
            // Different regions: player at 0, AI at 2, fill 1 and 3
            const others = allRegions.filter(r => r !== playerRegion && r !== aiRegion)
                .sort(() => Math.random() - 0.5);
            seatRegions = [playerRegion, others[0], aiRegion, others[1]];
        }

        const seats = seatRegions.map((region, i) => ({
            ownerId: i === 0 ? 'player' : i === 2 ? 'ai' : null,
            region: region,
            pool: regionPools[region],
        }));

        // Track player picks and landmark counts
        let playerPicks = [...this.progress.savedDeckCardIds];
        let aiPicks = [];
        let playerLandmarks = 0;

        // Count existing landmarks in saved deck
        for (const cardId of playerPicks) {
            const card = cardDB.getCard(cardId);
            if (card && card.type === 'Landmark') playerLandmarks++;
        }

        // ── Rotation: keep passing pools until both player and AI reach target ──
        let pass = 0;
        const maxPasses = 20; // safety cap

        while (pass < maxPasses) {
            // Check if both player and AI have enough cards
            if (playerPicks.length >= targetDeckSize && aiPicks.length >= targetDeckSize) break;

            // Check if any pools have cards left
            const totalPoolCards = seats.reduce((sum, s) => sum + s.pool.length, 0);
            if (totalPoolCards === 0) break;

            // ── Player drafts from their current seat ──
            const playerSeat = seats.find(s => s.ownerId === 'player');
            if (playerSeat && playerPicks.length < targetDeckSize) {
                // Filter pool: only show landmarks from player's own region
                const filteredPool = playerSeat.pool.filter(c =>
                    c.type !== 'Landmark' || c.region === playerRegion
                );

                if (filteredPool.length > 0) {
                    const result = await this.deckBuilder.showRegionRotationDraft({
                        playerName: 'You',
                        playerRegion: playerRegion,
                        regionPool: filteredPool,
                        regionName: playerSeat.pool.length > 0 ? playerSeat.pool[0].region : 'Unknown',
                        passNumber: pass + 1,
                        totalPasses: '?',
                        currentDeckSize: playerPicks.length,
                        targetDeckSize: targetDeckSize,
                        existingDeckCardIds: playerPicks,
                        minLandmarks: 1,
                        currentLandmarks: playerLandmarks,
                    });

                    // Record picks
                    for (const cardId of result.picked) {
                        playerPicks.push(cardId);
                        const card = cardDB.getCard(cardId);
                        if (card && card.type === 'Landmark') playerLandmarks++;
                    }

                    // Update seat pool
                    const remainingDraftIds = new Set(result.remaining.map(c => c.draftId));
                    const filteredDraftIds = new Set(filteredPool.map(c => c.draftId));
                    playerSeat.pool = playerSeat.pool.filter(c =>
                        remainingDraftIds.has(c.draftId) || !filteredDraftIds.has(c.draftId)
                    );
                }
            }

            // ── AI drafts from its current seat ──
            const aiSeat = seats.find(s => s.ownerId === 'ai');
            if (aiSeat && aiPicks.length < targetDeckSize) {
                const aiPool = aiSeat.pool.filter(c =>
                    c.type !== 'Landmark' || c.region === aiRegion
                );
                const aiNeeded = targetDeckSize - aiPicks.length;
                const picked = this._aiAutoDraft(aiPool, Math.min(aiNeeded, aiPool.length));

                for (const cardId of picked) {
                    aiPicks.push(cardId);
                }

                // Remove picked cards from AI seat pool
                const pickedCounts = {};
                for (const id of picked) {
                    pickedCounts[id] = (pickedCounts[id] || 0) + 1;
                }
                const removedCounts = {};
                aiSeat.pool = aiSeat.pool.filter(c => {
                    if (pickedCounts[c.id] && (!removedCounts[c.id] || removedCounts[c.id] < pickedCounts[c.id])) {
                        removedCounts[c.id] = (removedCounts[c.id] || 0) + 1;
                        return false;
                    }
                    return true;
                });
            }

            // ── Pass pools: shift left ──
            const pools = seats.map(s => s.pool);
            for (let i = 0; i < seats.length; i++) {
                seats[i].pool = pools[(i + 1) % seats.length];
            }

            pass++;
        }

        this._playerDraftedDeck = playerPicks;
        this._aiDraftedDeck = aiPicks;

        // Start battle with drafted decks
        this._startCampaignBattle(stage);
    }

    /**
     * AI auto-draft: picks cards randomly from pool, preferring units and higher-cost cards.
     */
    _aiAutoDraft(pool, targetSize) {
        const deck = [];
        // Shuffle pool with a weighted preference for units
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        // Sort: units first, then by mana cost descending
        shuffled.sort((a, b) => {
            const typeOrder = { Unit: 0, Spell: 1, Trap: 2, Landmark: 3 };
            const ta = typeOrder[a.type] ?? 4;
            const tb = typeOrder[b.type] ?? 4;
            if (ta !== tb) return ta - tb;
            return (b.manaCost || 0) - (a.manaCost || 0);
        });

        const pickedCounts = {};
        for (const card of shuffled) {
            if (deck.length >= targetSize) break;
            // Respect quantity limits
            const count = pickedCounts[card.id] || 0;
            if (count < (card.quantity || 1)) {
                deck.push(card.id);
                pickedCounts[card.id] = count + 1;
            }
        }
        return deck;
    }

    // ─── Start Campaign Battle ──────────────────────────────────

    async _startCampaignBattle(stage) {
        const playerRegion = this.progress.playerRegion;

        // For multi-region stages, AI region is set to the first non-player region
        // (just for display; the actual deck comes from drafted cards)
        const aiRegion = stage.multiRegion
            ? ['Northern', 'Eastern', 'Southern', 'Western'].find(r => r !== playerRegion)
            : stage.opponentRegion;

        // Configure players: Player (0) vs AI (1)
        const playerConfigs = [
            { name: 'You', region: playerRegion },
            { name: stage.opponentName, region: aiRegion },
        ];

        // If drafted decks exist, attach them
        if (this._playerDraftedDeck) {
            playerConfigs[0].deckCardIds = this._playerDraftedDeck;
        }
        if (this._aiDraftedDeck) {
            playerConfigs[1].deckCardIds = this._aiDraftedDeck;
        }

        const options = {
            gameMode: 'campaign',
            startingLP: stage.playerLP,
            startingPlayer: 0, // Player always goes first
        };

        // Setup game
        await this.controller.setupGame(playerConfigs, options);

        // Set opponent LP (may differ from player)
        const opponentPlayer = this.controller.gameState.getPlayerById(1);
        opponentPlayer.lp = stage.opponentLP;

        // Create AI player
        this.ai = new AIPlayer(this.controller, 1, stage.difficulty);

        // Wire AI to handle target/choice selections
        this._wireAICallbacks();

        // Auto-select landmark for AI
        this._aiSelectLandmark(stage);

        // Clear drafted decks (used)
        this._playerDraftedDeck = null;
        this._aiDraftedDeck = null;

        // Show landmark selection for human player, then start
        this.gameUI.showLandmarkSelect(0);
    }

    /**
     * Wire the AI to answer target/choice queries when it's the AI's turn
     */
    _wireAICallbacks() {
        const gs = this.controller.gameState;

        // Override the effect engine's target/choice callbacks for AI player
        const origOnTarget = this.controller.effectEngine.onTargetRequired;
        const origOnChoice = this.controller.effectEngine.onChoiceRequired;
        const origOnResponse = this.controller.onOpponentResponse;

        this.controller.effectEngine.onTargetRequired = (targets, desc, cb) => {
            // Check which player's effect needs the target (not active player)
            const sourcePlayerId = this.controller.effectEngine._currentSourcePlayerId;
            if (sourcePlayerId === 1 && this.ai) {
                // AI selects target automatically
                const target = this.ai.chooseTarget(targets, desc);
                setTimeout(() => cb(target), 100);
            } else if (origOnTarget) {
                origOnTarget(targets, desc, cb);
            }
        };

        this.controller.effectEngine.onChoiceRequired = (options, desc, cb) => {
            const sourcePlayerId = this.controller.effectEngine._currentSourcePlayerId;
            if (sourcePlayerId === 1 && this.ai) {
                const choice = this.ai.chooseOption(options, desc);
                setTimeout(() => cb(choice), 100);
            } else if (origOnChoice) {
                origOnChoice(options, desc, cb);
            }
        };

        // Override response callback: AI always auto-passes,
        // human gets the response dialog during AI's turn to activate traps
        this.controller.onOpponentResponse = (player, callback, chainContext) => {
            if (player.id === 1) {
                // AI auto-passes on response prompts
                setTimeout(() => callback({ activate: false }), 50);
            } else if (origOnResponse) {
                origOnResponse(player, callback, chainContext);
            } else {
                callback({ activate: false });
            }
        };

        // Wire AI action callback for visual feedback
        this.ai.onAction = async (actionType, data) => {
            if (actionType === 'attack') {
                const targetUnit = data.target?.type === 'unit' ? data.target.card : null;
                const targetPlayer = data.target?.type === 'direct' ? data.target.player : null;
                this.gameUI._showAttackAnimation(data.attacker, targetUnit, targetPlayer);
                await new Promise(r => setTimeout(r, 3000));
            } else if (actionType === 'summon') {
                await new Promise(r => setTimeout(r, 1500));
            } else if (actionType === 'spell') {
                await new Promise(r => setTimeout(r, 1500));
            } else if (actionType === 'setTrap') {
                await new Promise(r => setTimeout(r, 800));
            } else if (actionType === 'landmark') {
                await new Promise(r => setTimeout(r, 1500));
            }
        };
    }

    _aiSelectLandmark(stage) {
        // For multi-region stages, pick a landmark from the first AI region
        const allRegions = ['Northern', 'Eastern', 'Southern', 'Western'];
        const playerRegion = this.progress.playerRegion;
        let landmarkRegion = stage.opponentRegion;

        if (stage.multiRegion) {
            // Pick from the first non-player region
            const nonPlayerRegions = allRegions.filter(r => r !== playerRegion);
            landmarkRegion = nonPlayerRegions[0] || 'Northern';
        }

        const landmarks = this.controller.cardDB.getLandmarksByRegion(landmarkRegion);
        if (landmarks.length > 0) {
            const player = this.controller.gameState.getPlayerById(1);
            const landmarkCard = this.controller.cardDB.createCardInstance(landmarks[0].id, 1);
            if (landmarkCard) {
                player.landmarkZone = landmarkCard;
            }
        }
    }

    /**
     * Called by GameUI when it's time for turn transition.
     * If it's the AI's turn, run the AI instead of showing transition screen.
     */
    async handleTurnTransition() {
        const gs = this.controller.gameState;

        if (gs.gameOver) {
            this._showPostBattle();
            return;
        }

        if (gs.activePlayerIndex === 1 && this.ai) {
            // AI's turn — keep the board visible from player's perspective
            // Render the board so the player can watch the AI play
            this.gameUI.render();

            // Show "Opponent's Turn" banner
            this.gameUI._showTurnBanner("Opponent's Turn", '');

            // Brief pause before AI starts acting
            await new Promise(r => setTimeout(r, 600));

            // Let AI play its turn
            await this.ai.performTurn();

            // After AI turn completes, check game over
            if (gs.gameOver) {
                this._showPostBattle();
                return;
            }

            // Show "Your Turn" banner before transition
            this.gameUI._showTurnBanner('Your Turn', '');

            // Show transition to player's turn
            this.gameUI.showTurnTransition();
        } else {
            // Player's turn — normal transition
            this.gameUI.showTurnTransition();
        }
    }

    /**
     * Handle mulligan for AI
     */
    async handleAIMulligan() {
        if (!this.ai) return;
        const player = this.controller.gameState.getPlayerById(1);
        const toMulligan = this.ai.chooseMulligan(player.hand);
        await this.controller.mulligan(1, toMulligan);
    }

    // ─── Post-Battle Screen ──────────────────────────────────

    _showPostBattle() {
        const gs = this.controller.gameState;
        const stage = this.currentStage;
        if (!stage) return;

        const playerWon = gs.winner && gs.winner.id === 0;
        const playerLP = gs.getPlayerById(0).lp;
        const turns = gs.turnCounter;

        if (playerWon) {
            // Save the player's deck for the next stage (exclude landmark & tokens)
            const playerObj = gs.getPlayerById(0);
            const deckCardIds = [
                ...playerObj.deck.map(c => c.cardId),
                ...playerObj.hand.map(c => c.cardId),
                ...playerObj.unitZone.filter(Boolean).map(c => c.cardId),
                ...playerObj.spellTrapZone.filter(Boolean).map(c => c.cardId),
                ...playerObj.graveyard.map(c => c.cardId),
            ].filter(id => {
                const def = this.controller.cardDB.getCard(id);
                return def && def.type !== 'Token';
            });
            this.progress.savedDeckCardIds = deckCardIds;
            this.progress.completeStage(stage.id, { lpRemaining: playerLP, turns });
        }

        const regionClass = this._getRegionClass(stage.opponentRegion);

        this.app.innerHTML = `
            <div class="post-battle-screen ${playerWon ? 'victory' : 'defeat'}">
                <button class="global-menu-btn" id="btn-menu">☰ Menu</button>
                <div class="post-battle-content">
                    <h1 class="post-battle-title">${playerWon ? '⚔ Victory! ⚔' : '💀 Defeat 💀'}</h1>
                    <h2 class="post-battle-stage">${stage.name}</h2>
                    <p class="post-battle-opponent">${playerWon ? `${stage.opponentName} has been defeated!` : `${stage.opponentName} crushed your forces.`}</p>

                    ${playerWon ? `
                        <div class="post-battle-stats">
                            <div class="stat-card">
                                <span class="stat-label">LP Remaining</span>
                                <span class="stat-value">${playerLP}</span>
                            </div>
                            <div class="stat-card">
                                <span class="stat-label">Turns Taken</span>
                                <span class="stat-value">${turns}</span>
                            </div>
                        </div>
                        <p class="post-battle-reward">🎖 ${stage.reward}</p>
                    ` : ''}

                    <div class="post-battle-actions">
                        ${playerWon && stage.id < CAMPAIGN_STAGES.length ? `
                            <button class="menu-btn primary" id="btn-next-stage">Next Stage →</button>
                        ` : ''}
                        ${playerWon && stage.id >= CAMPAIGN_STAGES.length ? `
                            <button class="menu-btn primary" id="btn-campaign-complete">🏆 Campaign Complete!</button>
                        ` : ''}
                        ${!playerWon ? `
                            <button class="menu-btn primary" id="btn-retry">⚔ Retry</button>
                        ` : ''}
                        <button class="menu-btn" id="btn-back-to-map">Campaign Map</button>
                    </div>
                </div>
            </div>
        `;

        const btnNext = document.getElementById('btn-next-stage');
        const btnRetry = document.getElementById('btn-retry');
        const btnMap = document.getElementById('btn-back-to-map');
        const btnComplete = document.getElementById('btn-campaign-complete');

        if (btnNext) btnNext.onclick = () => {
            const nextStage = CAMPAIGN_STAGES.find(s => s.id === stage.id + 1);
            if (nextStage) this.showPreBattle(nextStage.id);
        };
        if (btnRetry) btnRetry.onclick = () => this.showPreBattle(stage.id);
        if (btnMap) btnMap.onclick = () => this.showCampaignMap();
        if (btnComplete) btnComplete.onclick = () => this.showCampaignMap();
        this._wireMenuBtn();
    }

    // ─── Helpers ───────────────────────────────────────────────

    _getRegionClass(region) {
        const map = { Northern: 'north', Eastern: 'east', Southern: 'south', Western: 'west', Multi: 'finale', Finale: 'finale' };
        return map[region] || '';
    }

    _wireMenuBtn() {
        const btn = document.getElementById('btn-menu');
        if (btn) btn.onclick = () => this.gameUI.showMenu();
    }

    get isCampaignMode() {
        return this.controller.gameState.gameMode === 'campaign';
    }

    /**
     * Clean up AI listeners when leaving campaign
     */
    cleanup() {
        this.ai = null;
        this.currentStage = null;
    }
}
