// ─────────────────────────────────────────────────────────────
// GameUI.js — Renders the game board and handles interactions
// ─────────────────────────────────────────────────────────────

import { PHASES } from '../engine/GameState.js';
import { DuelDeckBuilderUI } from './DuelDeckBuilderUI.js';

export class GameUI {
  /**
   * @param {import('../engine/GameController.js').GameController} controller
   */
  constructor(controller) {
    this.controller = controller;
    this.app = document.getElementById('app');
    this.selectedCard = null;
    this.attackingUnit = null;
    this.currentScreen = 'menu';
    this.playerConfigs = [];
    this.playerCount = 2;  // 2, 3, or 4
    this.previewTimeout = null;
    this.campaignUI = null; // Set externally by main.js
    this.tutorialUI = null; // Set externally by main.js
    this.deckBuilderUI = null; // Set externally by main.js

    // Animation tracking
    this._lastHandSizes = {};       // Track hand sizes per player for draw detection
    this._pendingPlayAnim = null;   // { rect, imgSrc } captured before play action
    this.pendingPlacement = null;   // Pending placement logic
    this._eventLogCollapsed = false; // Event log UI state

    // Wire up callbacks
    controller.onUIUpdate = (gs) => this._onUIUpdate(gs);
    controller.effectEngine.onTargetRequired = (targets, desc, cb) => this.showTargetSelection(targets, desc, cb);
    controller.effectEngine.onChoiceRequired = (options, desc, cb) => this.showChoiceDialog(options, desc, cb);
    controller.onOpponentResponse = (player, callback) => this.showOpponentResponseDialog(player, callback);
  }

  // ─── Screen Management ────────────────────────────────────

  showMenu() {
    this.currentScreen = 'menu';
    this.app.innerHTML = `
      <div class="main-menu">
        <h1 class="menu-title">Battle Among Regions</h1>
        <p class="menu-subtitle">War for Supremacy</p>
        <div class="menu-buttons">
          <button class="menu-btn primary" id="btn-duel">Regional Match (2P)</button>
          <button class="menu-btn" id="btn-3p">3-Player Match</button>
          <button class="menu-btn" id="btn-4p">4-Player Match</button>
          <button class="menu-btn campaign-glow" id="btn-war-campaign">⚔ War Campaign</button>
          <button class="menu-btn" id="btn-campaign">Solo Campaign</button>
          <button class="menu-btn" id="btn-deck-builder">⚔ Deck Builder</button>
          <button class="menu-btn online-glow" id="btn-online">🌐 Online Match</button>
          <button class="menu-btn tutorial-glow" id="btn-tutorial">📖 Tutorial</button>
        </div>
      </div>
    `;

    document.getElementById('btn-duel').onclick = () => { this.playerCount = 2; this.playerConfigs = []; this.showRegionSelect(0, 'duel'); };
    document.getElementById('btn-3p').onclick = () => { this.playerCount = 3; this.playerConfigs = []; this.showRegionSelect(0, 'duel'); };
    document.getElementById('btn-4p').onclick = () => { this.playerCount = 4; this.playerConfigs = []; this.showRegionSelect(0, 'duel'); };
    document.getElementById('btn-war-campaign').onclick = () => {
      if (this.warCampaignUI) {
        this.warCampaignUI.showPlayerCountSelect();
      }
    };
    document.getElementById('btn-campaign').onclick = () => {
      if (this.campaignUI) {
        const progress = this.campaignUI.progress;
        if (progress.playerRegion) {
          this.campaignUI.showCampaignMap();
        } else {
          this.campaignUI.showRegionSelect();
        }
      }
    };
    document.getElementById('btn-tutorial').onclick = () => {
      if (this.tutorialUI) {
        this.tutorialUI.showTutorial();
      }
    };
    document.getElementById('btn-deck-builder').onclick = () => {
      if (this.deckBuilderUI) {
        this.deckBuilderUI.show();
      }
    };
    document.getElementById('btn-online').onclick = async () => {
      if (this.onlineUI) {
        const connected = await this.onlineUI.connectToServer();
        if (connected) {
          this.onlineUI.showLobby();
        } else {
          this.app.innerHTML += `
            <div class="toast-message show" style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%)">
              Failed to connect to server. Make sure the server is running.
            </div>
          `;
          setTimeout(() => {
            const t = document.querySelector('.toast-message');
            if (t) t.remove();
          }, 3000);
        }
      }
    };
  }

  showRegionSelect(playerIndex, gameMode) {
    this.currentScreen = 'region-select';
    const selectedRegions = this.playerConfigs.map(p => p.region);
    const playerNum = playerIndex + 1;

    this.app.innerHTML = `
      <div class="region-select">
        <button class="global-menu-btn" id="btn-menu">☰ Menu</button>
        <h2>Choose Your Region</h2>
        <p class="player-label">Player ${playerNum} of ${this.playerCount}</p>
        <div class="region-grid">
          ${this._renderRegionCard('Northern', 'north', 'Resilient defenders. Masters of healing and fortification.', selectedRegions)}
          ${this._renderRegionCard('Eastern', 'east', 'Cunning strategists. Spell mastery and shadow tactics.', selectedRegions)}
          ${this._renderRegionCard('Southern', 'south', 'Aggressive warriors. Raw power and piercing strikes.', selectedRegions)}
          ${this._renderRegionCard('Western', 'west', 'Adaptable tricksters. Unit synergy and effect manipulation.', selectedRegions)}
        </div>
      </div>
    `;
    this._wireGlobalMenuButton();

    document.querySelectorAll('.region-card:not(.disabled)').forEach(card => {
      card.onclick = async () => {
        const region = card.dataset.region;
        const config = {
          name: `Player ${playerNum}`,
          region,
        };

        // Offer deck choice if deck builder is available
        if (this.deckBuilderUI) {
          const deckIds = await this.deckBuilderUI.showDeckChoice(region, `Player ${playerNum}`);
          if (deckIds) {
            config.deckCardIds = deckIds;
          }
        }

        this.playerConfigs.push(config);

        if (playerIndex < this.playerCount - 1) {
          this.showRegionSelect(playerIndex + 1, gameMode);
        } else {
          this.startGame(gameMode);
        }
      };
    });
  }

  _renderRegionCard(region, cssClass, desc, selectedRegions) {
    const disabled = selectedRegions.includes(region) ? 'disabled' : '';
    return `
      <div class="region-card ${cssClass} ${disabled}" data-region="${region}">
        <h3>${region}</h3>
        <p>${desc}</p>
      </div>
    `;
  }

  async startGame(gameMode) {
    this.currentScreen = 'game';
    const options = {
      gameMode,
      startingLP: 3000,
    };

    await this.controller.setupGame(this.playerConfigs, options);
    // Show landmark selection before mulligan
    this.showLandmarkSelect(0);
  }

  // ─── Pre-Mulligan Landmark Selection ────────────────────────

  showLandmarkSelect(playerIndex) {
    const gs = this.controller.gameState;
    const player = gs.getPlayerById(playerIndex);
    if (!player) {
      this.showMulliganScreen(0);
      return;
    }

    // In campaign mode, skip AI player's landmark (already handled)
    if (gs.gameMode === 'campaign' && playerIndex === 1) {
      this.showMulliganScreen(0);
      return;
    }

    // Find landmark cards in the player's deck AND hand — deduplicate by cardId, max 1 of each
    const seenCardIds = new Set();
    const allCards = [...player.deck, ...player.hand];
    const landmarks = allCards.filter(c => {
      if (c.type !== 'Landmark') return false;
      if (seenCardIds.has(c.cardId)) return false;
      seenCardIds.add(c.cardId);
      return true;
    });

    if (landmarks.length === 0) {
      // No landmarks, skip to next player or mulligan
      if (playerIndex < gs.players.length - 1) {
        this.showLandmarkSelect(playerIndex + 1);
      } else {
        this.showMulliganScreen(0);
      }
      return;
    }

    const playerNum = playerIndex + 1;
    this.app.innerHTML = `
      <div class="mulligan-screen">
        <button class="global-menu-btn" id="btn-menu">☰ Menu</button>
        <h2>Select a Landmark</h2>
        <p>Player ${playerNum} — Choose a Landmark to play for free, or skip</p>
        <div class="mulligan-cards">
          ${landmarks.map(card => `
            <div class="game-card mulligan-card ${this._getRegionClass(card.region)}"
                 data-id="${card.instanceId}" data-card-id="${card.cardId}"
                 style="width:150px;height:210px;position:relative;cursor:pointer">
              ${this._renderCardVisual(card)}
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:16px;align-items:center;margin-top:16px">
          <button class="action-btn primary" id="btn-accept-landmark" style="opacity:0.5;pointer-events:none">Accept</button>
          <button class="action-btn" id="btn-skip-landmark">Skip</button>
        </div>
      </div>
    `;
    this._wireGlobalMenuButton();

    let selectedInstanceId = null;

    // Click a landmark to select it (no target selection)
    document.querySelectorAll('.mulligan-card').forEach(el => {
      el.onclick = () => {
        const instanceId = el.dataset.id;
        const card = [...player.deck, ...player.hand].find(c => c.instanceId === instanceId);
        if (!card) return;

        // Visual marking
        document.querySelectorAll('.mulligan-card').forEach(c => c.classList.remove('landmark-selected'));
        el.classList.add('landmark-selected');

        selectedInstanceId = instanceId;

        // Enable Accept button
        const btnAccept = document.getElementById('btn-accept-landmark');
        if (btnAccept) {
          btnAccept.style.opacity = '1';
          btnAccept.style.pointerEvents = 'auto';
        }
      };
    });

    // Accept selected landmark
    document.getElementById('btn-accept-landmark').onclick = () => {
      if (!selectedInstanceId) return;

      const targetPlayer = player; // Own landmark zone
      // Look in deck first, then hand
      let deckIdx = player.deck.findIndex(c => c.instanceId === selectedInstanceId);
      let removed = null;
      if (deckIdx !== -1) {
        removed = player.deck.splice(deckIdx, 1)[0];
      } else {
        const handIdx = player.hand.findIndex(c => c.instanceId === selectedInstanceId);
        if (handIdx !== -1) {
          removed = player.hand.splice(handIdx, 1)[0];
        }
      }

      if (removed) {
        removed.faceUp = true;
        // Replace existing landmark if any
        if (targetPlayer.landmarkZone) {
          const old = targetPlayer.landmarkZone;
          targetPlayer.graveyard.push(old);
          gs.log('LANDMARK', `${old.name} is replaced and sent to the graveyard.`);
        }
        targetPlayer.landmarkZone = removed;
        gs.log('LANDMARK', `${player.name} places ${removed.name} in their Landmark Zone.`);
      }

      // Next player or mulligan — skip AI in campaign
      if (gs.gameMode === 'campaign') {
        this.showMulliganScreen(0);
      } else if (playerIndex < gs.players.length - 1) {
        const nextPlayer = gs.getPlayerById(playerIndex + 1);
        this.showTurnTransition(() => this.showLandmarkSelect(playerIndex + 1), nextPlayer);
      } else {
        this.showTurnTransition(() => this.showMulliganScreen(0));
      }
    };

    document.getElementById('btn-skip-landmark').onclick = () => {
      if (gs.gameMode === 'campaign') {
        this.showMulliganScreen(0);
      } else if (playerIndex < gs.players.length - 1) {
        const nextPlayer = gs.getPlayerById(playerIndex + 1);
        this.showTurnTransition(() => this.showLandmarkSelect(playerIndex + 1), nextPlayer);
      } else {
        this.showTurnTransition(() => this.showMulliganScreen(0));
      }
    };
  }

  // ─── Mulligan Screen ──────────────────────────────────────

  showMulliganScreen(playerIndex) {
    const gs = this.controller.gameState;
    const player = gs.getPlayerById(playerIndex);
    if (!player || player.hasMulliganed) {
      if (playerIndex < gs.players.length - 1) {
        this.showMulliganScreen(playerIndex + 1);
      } else {
        // All mulliganed
        this.controller.turnManager.checkMulliganComplete().then(() => {
          this.showTurnTransition();
        });
      }
      return;
    }

    const selectedIds = new Set();

    const renderMulligan = () => {
      this.app.innerHTML = `
        <div class="mulligan-screen">
          <button class="global-menu-btn" id="btn-menu">☰ Menu</button>
          <h2>Mulligan Phase</h2>
          <p>${player.name} — Select cards to replace (click to toggle)</p>
          <div class="mulligan-cards">
            ${player.hand.map(card => `
              <div class="game-card mulligan-card ${this._getRegionClass(card.region)} ${selectedIds.has(card.instanceId) ? 'selected' : ''}"
                   data-id="${card.instanceId}" style="width:110px;height:154px;position:relative">
                ${this._renderCardVisual(card)}
              </div>
            `).join('')}
          </div>
          <div style="display:flex;gap:16px;align-items:center">
            <button class="action-btn primary" id="btn-keep">Keep Hand</button>
            <button class="action-btn" id="btn-mulligan" ${selectedIds.size === 0 ? 'style="opacity:0.5"' : ''}>
              Replace ${selectedIds.size} Card${selectedIds.size !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      `;
      this._wireGlobalMenuButton();

      document.querySelectorAll('.mulligan-card').forEach(el => {
        el.onclick = () => {
          const id = el.dataset.id;
          if (selectedIds.has(id)) selectedIds.delete(id);
          else selectedIds.add(id);
          renderMulligan();
        };
      });

      document.getElementById('btn-keep').onclick = async () => {
        await this.controller.mulligan(playerIndex, []);
        if (gs.gameMode === 'campaign') {
          // Auto-mulligan for AI then start
          if (this.campaignUI) await this.campaignUI.handleAIMulligan();
          this.showTurnTransition();
        } else if (playerIndex < gs.players.length - 1) {
          const nextPlayer = gs.getPlayerById(playerIndex + 1);
          this.showTurnTransition(() => this.showMulliganScreen(playerIndex + 1), nextPlayer);
        } else {
          this.showTurnTransition();
        }
      };

      document.getElementById('btn-mulligan').onclick = async () => {
        if (selectedIds.size > 0) {
          await this.controller.mulligan(playerIndex, [...selectedIds]);
          if (gs.gameMode === 'campaign') {
            if (this.campaignUI) await this.campaignUI.handleAIMulligan();
            this.showTurnTransition();
          } else if (playerIndex < gs.players.length - 1) {
            const nextPlayer = gs.getPlayerById(playerIndex + 1);
            this.showTurnTransition(() => this.showMulliganScreen(playerIndex + 1), nextPlayer);
          } else {
            this.showTurnTransition();
          }
        }
      };
    };

    renderMulligan();
  }

  // ─── Turn Transition ──────────────────────────────────────

  showTurnTransition(onContinue = null, overridePlayer = null) {
    const gs = this.controller.gameState;
    const player = overridePlayer || gs.getActivePlayer();
    const regionClass = this._getRegionClass(player.region);

    this.app.innerHTML = `
      <div class="turn-transition visible">
        <button class="global-menu-btn" id="btn-menu">☰ Menu</button>
        <h2 style="color: var(--${regionClass.replace('north', 'north-primary').replace('east', 'east-primary').replace('south', 'south-primary').replace('west', 'west-primary')})">${player.name}'s Turn</h2>
        <p>Round ${gs.roundCounter} — ${player.region} Region</p>
        <button class="start-btn" id="btn-start">Begin Turn</button>
      </div>
    `;
    this._wireGlobalMenuButton();

    document.getElementById('btn-start').onclick = () => {
      if (onContinue) {
        onContinue();
      } else {
        this.render();
      }
    };
  }

  // ─── Main Game Board Render ───────────────────────────────

  render() {
    const gs = this.controller.gameState;
    if (gs.gameOver) {
      this.showGameOver();
      return;
    }

    const active = gs.getActivePlayer();
    const players = gs.players;
    const numPlayers = players.length;

    // In campaign mode, always show from human player's perspective (player 0)
    // In other modes, active player is rendered at bottom
    const isCampaign = gs.gameMode === 'campaign';
    const p1 = isCampaign ? players[0] : active;
    // Opponents are everyone else (alive or dead for display)
    const opponents = players.filter(p => p.id !== p1.id);

    if (numPlayers <= 2) {
      // ─── 2 Player Layout ────────────────────────────
      const opponent = opponents[0] || p1;
      this.app.innerHTML = `
        <!-- Opponent bar (top) -->
        ${this._renderPlayerBar(opponent, 'top', false)}

        <!-- Opponent field -->
        <div class="field-rows">
          <div class="field-landmark-col">
            ${this._renderLandmarkSlot(opponent)}
          </div>
          <div class="field-main">
            <div class="field-section opponent">
              ${this._renderSpellTrapZone(opponent, true)}
            </div>
            <div class="field-section opponent">
              ${this._renderUnitZone(opponent, true)}
            </div>
          </div>
          <div class="field-landmark-col">
            ${this._renderSideZone(opponent, 'right')}
          </div>
        </div>

        <!-- Divider + Phase bar -->
        <div class="field-divider"></div>
        ${this._renderPhaseBar(gs)}

        <!-- Player field -->
        <div class="field-rows">
          <div class="field-landmark-col">
            ${this._renderLandmarkSlot(p1)}
          </div>
          <div class="field-main">
            <div class="field-section">
              ${this._renderUnitZone(p1, false)}
            </div>
            <div class="field-section">
              ${this._renderSpellTrapZone(p1, false)}
            </div>
          </div>
          <div class="field-landmark-col">
            ${this._renderSideZone(p1, 'right')}
          </div>
        </div>

        <!-- Active player bar (bottom) -->
        ${this._renderPlayerBar(p1, 'bottom', true)}

        <!-- Hand -->
        ${this._renderHand(p1)}

        <!-- Action buttons -->
        ${this._renderActionPanel(gs)}

        <!-- Event Log -->
        ${this._renderEventLog(gs)}

        ${this.pendingPlacement ? `<div class="placement-instruction">Choose a field to play this card to</div>` : ''}
      `;
      this._attachListeners(p1, opponent, gs);

    } else {
      // ─── 3 or 4 Player Layout ───────────────────────
      // Top opponent is always opponents[0], side opponents are the rest
      const topOpponent = opponents[0];
      const sideOpponents = opponents.slice(1); // 1 for 3P, 2 for 4P

      const leftOpp = sideOpponents[0] || null;
      const rightOpp = sideOpponents[1] || null;

      this.app.innerHTML = `
        <div class="board-multi">
          <!-- Top opponent -->
          <div class="multi-top">
            ${this._renderPlayerBar(topOpponent, 'top', false)}
            <div class="field-rows compact">
              <div class="field-landmark-col compact">
                ${this._renderLandmarkSlot(topOpponent)}
              </div>
              <div class="field-main">
                <div class="field-section opponent">
                  ${this._renderSpellTrapZone(topOpponent, true)}
                </div>
                <div class="field-section opponent">
                  ${this._renderUnitZone(topOpponent, true)}
                </div>
              </div>
              <div class="field-landmark-col compact">
                ${this._renderSideZone(topOpponent, 'right')}
              </div>
            </div>
          </div>

          <!-- Middle: optional side opponents + player field -->
          <div class="multi-middle">
            ${leftOpp ? `
              <div class="multi-side left">
                ${this._renderOpponentCompact(leftOpp)}
              </div>
            ` : ''}

            <div class="multi-center">
              <div class="field-divider"></div>
              ${this._renderPhaseBar(gs)}

              <!-- Active player field -->
              <div class="field-rows">
                <div class="field-landmark-col">
                  ${this._renderLandmarkSlot(p1)}
                </div>
                <div class="field-main">
                  <div class="field-section">
                    ${this._renderUnitZone(p1, false)}
                  </div>
                  <div class="field-section">
                    ${this._renderSpellTrapZone(p1, false)}
                  </div>
                </div>
                <div class="field-landmark-col">
                  ${this._renderSideZone(p1, 'right')}
                </div>
              </div>
            </div>

            ${rightOpp ? `
              <div class="multi-side right">
                ${this._renderOpponentCompact(rightOpp)}
              </div>
            ` : ''}
          </div>

          <!-- Active player bar + hand -->
          <div class="multi-bottom">
            ${this._renderPlayerBar(p1, 'bottom', true)}
            ${this._renderHand(p1)}
          </div>
        </div>

        <!-- Action buttons -->
        ${this._renderActionPanel(gs)}

        ${this.pendingPlacement ? `<div class="placement-instruction">Choose a field to play this card to</div>` : ''}
      `;

      // For multi-player, pass the first opponent for attack targeting (player picks target via UI)
      this._attachListeners(p1, topOpponent, gs);
    }
  }

  // ─── Component Renderers ──────────────────────────────────

  _renderPlayerBar(player, position, isActive) {
    const lpPct = Math.max(0, (player.lp / 3000) * 100);
    const lpClass = lpPct > 50 ? 'healthy' : lpPct > 25 ? 'warning' : 'danger';
    const regionClass = this._getRegionClass(player.region);

    return `
      <div class="player-bar ${position} ${isActive ? 'active' : ''}" data-player="${player.id}">
        <div class="player-identity">
          <div class="player-avatar ${regionClass}">${player.name[0]}</div>
          <div>
            <div class="player-name">${player.name}</div>
            <div class="player-region-label">${player.region}</div>
          </div>
        </div>
        <div class="lp-display" id="lp-${player.id}">
          <div class="lp-bar-wrapper">
            <div class="lp-bar ${lpClass}" style="width:${lpPct}%"></div>
          </div>
          <span class="lp-text">${player.lp}</span>
        </div>
        <div class="mana-display">
          <div class="mana-number primary-mana">
            <span class="mana-icon">💎</span>
            <span class="mana-value">${player.primaryMana}</span>
          </div>
          <div class="mana-number spell-mana">
            <span class="mana-icon">✦</span>
            <span class="mana-value">${player.spellMana}</span>
          </div>
          <span class="mana-label">Total: ${player.primaryMana + player.spellMana}</span>
        </div>
      </div>
    `;
  }

  _renderUnitZone(player, isOpponent) {
    return `
      <div class="unit-zone" style="display:flex;gap:8px" data-zone="unit" data-player="${player.id}">
        ${player.unitZone.map((card, i) => {
      if (card) {
        const posClass = card.position === 'DEF' ? 'defense-position' : '';
        const damagedClass = card.damageTaken > 0 ? 'damaged' : '';
        const buffed = card.atkModifiers.length > 0 || card.defModifiers.length > 0;
        const regionClass = this._getRegionClass(card.region);
        const statTokens = this._renderStatTokens(card);
        return `
              <div class="card-slot has-card" data-slot="${i}" data-instance="${card.instanceId}">
                <div class="game-card ${regionClass} ${posClass} ${damagedClass} ${buffed ? 'buffed' : ''} ${card.silenced ? 'silenced' : ''}"
                     data-instance="${card.instanceId}" data-player="${player.id}" data-card-id="${card.cardId}">
                  ${this._renderCardVisual(card)}
                  ${statTokens}
                </div>
              </div>
            `;
      }
      const isValidForPlacement = this.pendingPlacement && this.pendingPlacement.type === 'Unit' && this.pendingPlacement.player.id === player.id;
      return `<div class="card-slot${isValidForPlacement ? ' valid-placement' : ''}" data-slot="${i}" data-player="${player.id}" data-zone="unit"></div>`;
    }).join('')}
      </div>
    `;
  }

  _renderSpellTrapZone(player, isOpponent) {
    return `
      <div class="spelltrap-zone" style="display:flex;gap:8px" data-zone="spellTrap" data-player="${player.id}">
        ${player.spellTrapZone.map((card, i) => {
      if (card) {
        if (!card.faceUp) {
          return `
                <div class="card-slot has-card" data-slot="${i}">
                  <div class="game-card face-down" data-instance="${card.instanceId}" data-player="${player.id}" data-card-id="${card.cardId}">
                    <img class="card-image" src="./Background.webp" alt="Face-down"
                         style="width:100%;height:100%;object-fit:contain;border-radius:var(--radius-card);background:#0a0c14" />
                  </div>
                </div>
              `;
        }
        return `
              <div class="card-slot has-card" data-slot="${i}">
                <div class="game-card ${this._getRegionClass(card.region)}" data-instance="${card.instanceId}" data-player="${player.id}" data-card-id="${card.cardId}">
                  ${this._renderCardVisual(card)}
                </div>
              </div>
            `;
      }
      const isValidForPlacement = this.pendingPlacement &&
        (this.pendingPlacement.type === 'SpellSet' || this.pendingPlacement.type === 'TrapSet') &&
        this.pendingPlacement.player.id === player.id;
      return `<div class="card-slot${isValidForPlacement ? ' valid-placement' : ''}" data-slot="${i}" data-player="${player.id}" data-zone="spellTrap"></div>`;
    }).join('')}
      </div>
    `;
  }

  _renderLandmarkSlot(player) {
    const landmark = player.landmarkZone;
    if (landmark) {
      const imgPath = `./output-web/${landmark.cardId}.webp`;
      return `
        <div class="landmark-slot has-card" data-player="${player.id}">
          <div class="game-card ${this._getRegionClass(landmark.region)} field-card" 
               data-instance="${landmark.instanceId}" data-player="${player.id}" data-card-id="${landmark.cardId}">
            <img class="card-image" src="${imgPath}" alt="${landmark.name}" 
                 onerror="this.parentElement.classList.add('no-art')" loading="lazy" 
                 style="width:100%;height:100%;object-fit:contain;border-radius:var(--radius-card)" />
          </div>
        </div>
      `;
    }
    const isValidForPlacement = this.pendingPlacement && this.pendingPlacement.type === 'Landmark' && this.pendingPlacement.player.id === player.id;
    return `<div class="landmark-slot${isValidForPlacement ? ' valid-placement' : ''}" data-player="${player.id}"></div>`;
  }

  _renderSideZone(player, side) {
    return `
      <div class="side-zone">
        <div class="deck-pile" style="position:relative; overflow:hidden; background-image:url('./Background.webp'); background-size:cover; background-position:center; border-radius:var(--radius-card); outline:1px solid rgba(255,255,255,0.2);">
          <div style="position:absolute; inset:0; background:rgba(0,0,0,0.15);"></div>
          <span style="position:relative; z-index:1; background:rgba(0,0,0,0.75); padding:2px 8px; border-radius:4px; font-weight:bold; box-shadow:0 0 4px rgba(0,0,0,0.8);">${player.deck.length}</span>
        </div>
        <span class="zone-count">Deck</span>
        <div class="graveyard-pile" data-player="${player.id}" style="cursor:pointer" title="Click to view graveyard">${player.graveyard.length}</div>
        <span class="zone-count">Grave</span>
      </div>
    `;
  }

  /**
   * Render a compact opponent panel for side positions in 3/4-player layouts
   */
  _renderOpponentCompact(player) {
    const regionClass = this._getRegionClass(player.region);
    const lpPct = Math.max(0, (player.lp / 3000) * 100);
    const lpClass = lpPct > 50 ? 'healthy' : lpPct > 25 ? 'warning' : 'danger';
    const landmark = player.landmarkZone;

    return `
      <div class="compact-opponent ${!player.isAlive ? 'eliminated' : ''}" data-player="${player.id}">
        <div class="compact-header">
          <div class="player-avatar ${regionClass}" style="width:30px;height:30px;font-size:0.75rem">${player.name[0]}</div>
          <div>
            <div class="player-name" style="font-size:0.75rem">${player.name}</div>
            <div class="player-region-label">${player.region}</div>
          </div>
        </div>
        <div class="compact-lp">
          <div class="lp-bar-wrapper" style="width:100%">
            <div class="lp-bar ${lpClass}" style="width:${lpPct}%"></div>
          </div>
          <span class="lp-text" style="font-size:0.7rem">${player.lp}</span>
        </div>
        <div class="compact-mana">
          <span style="color:var(--mana-blue);font-family:'Orbitron',monospace;font-size:0.7rem">💎${player.primaryMana}</span>
          <span style="color:var(--mana-purple);font-family:'Orbitron',monospace;font-size:0.7rem">✦${player.spellMana}</span>
        </div>
        <div class="compact-units">
          ${player.unitZone.slice(0, 3).map((card, i) => {
      if (card) {
        const statTokens = this._renderStatTokens(card);
        return `
                <div class="game-card compact-card ${this._getRegionClass(card.region)}"
                     data-instance="${card.instanceId}" data-player="${player.id}" data-card-id="${card.cardId}"
                     style="width:55px;height:77px">
                  ${this._renderCardVisual(card)}
                  ${statTokens}
                </div>`;
      }
      return `<div class="card-slot compact-slot" style="width:55px;height:77px"></div>`;
    }).join('')}
          ${player.unitZone.filter(c => c !== null).length > 3 ? `<span style="font-size:0.65rem;color:var(--text-muted)">+${player.unitZone.filter(c => c !== null).length - 3}</span>` : ''}
        </div>
        ${landmark ? `
          <div class="compact-landmark">
            <div class="game-card ${this._getRegionClass(landmark.region)}"
                 data-instance="${landmark.instanceId}" data-player="${player.id}" data-card-id="${landmark.cardId}"
                 style="width:70px;height:98px">
              <img class="card-image" src="./output-web/${landmark.cardId}.webp" alt="${landmark.name}"
                   onerror="this.parentElement.classList.add('no-art')" loading="lazy"
                   style="width:100%;height:100%;object-fit:contain;border-radius:var(--radius-card)" />
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  _renderHand(player) {
    const gs = this.controller.gameState;
    const isMainPhase = gs.phase === PHASES.MAIN1 || gs.phase === PHASES.MAIN2;

    return `
      <div class="hand-container">
        <div class="hand-cards">
          ${player.hand.map(card => {
      const canPlay = isMainPhase && (
        (card.type === 'Unit' && this.controller.actionValidator.canPlayUnit(player.id, card).valid) ||
        (card.type === 'Spell' && (this.controller.actionValidator.canPlaySpell(player.id, card).valid || this.controller.actionValidator.canSetSpell(player.id, card).valid)) ||
        (card.type === 'Trap' && this.controller.actionValidator.canSetTrap(player.id, card).valid) ||
        (card.type === 'Landmark' && this.controller.actionValidator.canPlayLandmark(player.id, card).valid)
      );

      const handStatTokens = this._renderStatTokens(card);
      return `
              <div class="hand-card game-card ${this._getRegionClass(card.region)} ${canPlay ? 'playable' : ''}"
                   data-instance="${card.instanceId}" data-type="${card.type}" data-card-id="${card.cardId}">
                ${this._renderCardVisual(card)}
                ${handStatTokens}
              </div>
            `;
    }).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render card as image-only — the card art IS the full visual.
   * No stat overlays, no mana cost badges, no name text.
   */
  _renderCardVisual(card) {
    const imgPath = `./output-web/${card.cardId}.webp`;
    return `
      <img class="card-image" src="${imgPath}" alt="${card.name}" 
           onerror="this.parentElement.classList.add('no-art')" loading="lazy"
           style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-card)" />
    `;
  }

  /**
   * Render ATK/DEF stat tokens for units with modified stats.
   * Tokens overlay the card's bottom corners, covering original printed values.
   */
  _renderStatTokens(card) {
    if (!card || card.type !== 'Unit') return '';

    const effectiveATK = card.currentATK;
    const remainingDEF = card.currentDEF - card.damageTaken;

    const atkClass = effectiveATK > card.baseATK ? 'stat-increased' : effectiveATK < card.baseATK ? 'stat-decreased' : '';
    const defClass = remainingDEF > card.baseDEF ? 'stat-increased' : remainingDEF < card.baseDEF ? 'stat-decreased' : '';

    // Always show both ATK and DEF tokens for units
    let html = '';
    html += `<div class="stat-token atk-token ${atkClass}">⚔${effectiveATK}</div>`;
    html += `<div class="stat-token def-token ${defClass}">🛡${remainingDEF}</div>`;

    return html;
  }

  _renderPhaseBar(gs) {
    const phases = [
      { id: PHASES.DRAW, label: 'Draw' },
      { id: PHASES.MAIN1, label: 'Main 1' },
      { id: PHASES.BATTLE, label: 'Battle' },
      { id: PHASES.MAIN2, label: 'Main 2' },
      { id: PHASES.END, label: 'End' },
    ];

    const phaseOrder = phases.map(p => p.id);
    const currentIdx = phaseOrder.indexOf(gs.phase);

    return `
      <div class="phase-bar">
        ${phases.map((p, i) => {
      const cls = i === currentIdx ? 'active' : i < currentIdx ? 'completed' : '';
      return `<span class="phase-step ${cls}">${p.label}</span>`;
    }).join('<span style="color:var(--text-muted);font-size:0.5rem">▸</span>')}
        <span style="margin-left:16px;font-size:0.65rem;color:var(--text-muted)">
          R${gs.roundCounter} T${gs.turnCounter}
        </span>
        <button class="phase-menu-btn" id="btn-menu">☰ Menu</button>
      </div>
    `;
  }

  _renderActionPanel(gs) {
    const phase = gs.phase;
    const buttons = [];

    if (phase === PHASES.MAIN1) {
      if (!gs.isFirstTurn) {
        buttons.push(`<button class="action-btn primary" id="btn-battle">⚔ Battle</button>`);
      }
    }
    if (phase === PHASES.MAIN1 || phase === PHASES.MAIN2) {
      buttons.push(`<button class="action-btn" id="btn-endturn">End Turn ▸</button>`);
    }

    if (phase === PHASES.BATTLE) {
      buttons.push(`<button class="action-btn" id="btn-endbattle">End Battle ▸</button>`);
    }

    if (this.attackingUnit || this.pendingPlacement) {
      buttons.push(`<button class="action-btn danger" id="btn-cancel-action">✕ Cancel</button>`);
    }

    // Menu button is now in the phase bar, not here

    return `<div class="action-panel">${buttons.join('')}</div>`;
  }

  _renderEventLog(gs) {
    // Filter for combat, spell, trap, and key game events
    const relevantTypes = new Set(['ATTACK', 'DAMAGE', 'LP_DAMAGE', 'BATTLE', 'TRAP', 'SPELL', 'EFFECT', 'DESTROY', 'STAT_MOD', 'HEAL', 'ELIMINATION', 'LANDMARK', 'TOKEN', 'GAME_OVER']);
    const filteredLogs = gs.eventLog.filter(e => relevantTypes.has(e.type)).slice(-30).reverse();
    if (filteredLogs.length === 0) return '';

    const isCollapsed = this._eventLogCollapsed;

    return `
      <div class="event-log ${isCollapsed ? 'collapsed' : ''}">
        <div class="event-log-header" id="event-log-toggle">
          <span>📜 Event Log</span>
          <span class="event-log-toggle-icon">${isCollapsed ? '◂' : '▸'}</span>
        </div>
        <div class="event-log-body">
          ${filteredLogs.map(entry => {
      let msg = this._enrichLogMessage(entry.message);
      const typeClass = entry.type.toLowerCase().replace(/_/g, '-');
      return `
              <div class="log-entry log-${typeClass}">
                <span class="log-type">${entry.type}</span> ${msg}
              </div>
            `;
    }).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Replace card names in log messages with inline thumbnail images
   */
  _enrichLogMessage(message) {
    const db = this.controller.cardDB;
    if (!db || !db.cards) return message;

    // Search for card names in the message and replace with thumb + name
    let enriched = message;
    for (const [id, card] of db.cards) {
      if (card.name && card.name.length > 2 && enriched.includes(card.name)) {
        const thumb = `<span class="log-card-thumb"><img src="./output-web/${id}.webp" alt="" onerror="this.style.display='none'"/><span class="log-card-name">${card.name}</span></span>`;
        enriched = enriched.replaceAll(card.name, thumb);
      }
    }
    return enriched;
  }

  // ─── Event Listeners ──────────────────────────────────────

  _attachListeners(activePlayer, opponent, gs) {
    // Hand card clicks + JS-managed hover using container-level mouse tracking
    // This approach ensures correct hover detection even when scaled cards overlap
    const handCards = Array.from(document.querySelectorAll('.hand-card'));
    const handContainer = document.querySelector('.hand-container');

    if (handContainer && handCards.length > 0) {
      // Capture original (un-scaled) bounding rects for hit-testing
      const cardRects = handCards.map(el => el.getBoundingClientRect());

      // Find which card a point is over (last match wins = topmost in stack order)
      const getCardAtPoint = (x, y) => {
        for (let i = handCards.length - 1; i >= 0; i--) {
          const r = cardRects[i];
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
            return i;
          }
        }
        return -1;
      };

      let currentHoverIdx = -1;

      handContainer.onmousemove = (e) => {
        const idx = getCardAtPoint(e.clientX, e.clientY);
        if (idx !== currentHoverIdx) {
          // Un-hover previous
          handCards.forEach(c => c.classList.remove('hovered'));
          currentHoverIdx = idx;
          if (idx >= 0) {
            handCards[idx].classList.add('hovered');
          }
        }
      };

      handContainer.onmouseleave = () => {
        handCards.forEach(c => c.classList.remove('hovered'));
        currentHoverIdx = -1;
      };

      handContainer.onclick = (e) => {
        if (this.pendingPlacement) {
          this._showToast('Cancel placement before doing something else.');
          return;
        }
        const idx = getCardAtPoint(e.clientX, e.clientY);
        if (idx >= 0) {
          this._onHandCardClick(handCards[idx], activePlayer, gs);
        }
      };
    }

    // Field card clicks (exclude hand cards — they have their own handler)
    document.querySelectorAll('.game-card[data-instance]:not(.hand-card)').forEach(el => {
      const instanceId = el.dataset.instance;
      const playerId = parseInt(el.dataset.player);
      const cardId = el.dataset.cardId;

      el.onclick = (e) => {
        e.stopPropagation();
        if (this.pendingPlacement) {
          if (this.pendingPlacement.type === 'Landmark' && el.parentElement.classList.contains('landmark-slot')) {
            // allow clicking the card in the landmark slot to replace it
            el.parentElement.click();
          } else {
            this._showToast('Select an empty slot to specify placement.');
          }
          return;
        }

        if (this.attackingUnit) {
          // Selecting attack target
          this._onAttackTargetClick(instanceId, playerId, opponent, gs);
        } else if (playerId === activePlayer.id) {
          // Show field card action menu (switch position, zoom, etc.)
          this._onFieldCardClick(el, instanceId, activePlayer, gs);
        } else {
          // Opponent card — show zoom only
          this._showCardZoom(cardId || el.querySelector('img')?.alt);
        }
      };
    });

    // Field slot clicks for placement
    document.querySelectorAll('.card-slot, .landmark-slot').forEach(el => {
      el.onclick = (e) => {
        if (!this.pendingPlacement) return;
        const playerId = parseInt(el.dataset.player);
        if (playerId !== activePlayer.id && this.pendingPlacement.type !== 'Landmark') {
          return; // Can only place in your own slots unless it's a Landmark
        }

        const slotIdx = el.dataset.slot !== undefined ? parseInt(el.dataset.slot) : -1;
        const isLandmarkSlot = el.classList.contains('landmark-slot');
        const isUnitZone = el.dataset.zone === 'unit';
        const isSpellTrapZone = el.dataset.zone === 'spellTrap';
        const hasCard = el.classList.contains('has-card');

        if (hasCard && this.pendingPlacement.type !== 'Landmark') {
          this._showToast('Slot is already occupied!');
          return;
        }

        const p = this.pendingPlacement;
        this.pendingPlacement = null;
        this._pendingPlayAnim = { rect: p.rect, imgSrc: p.imgSrc };

        if (p.type === 'Unit' && isUnitZone) {
          this.controller.playUnit(p.player.id, p.cardInstanceId, p.position, slotIdx).then(r => {
            if (!r.success) this._showToast(r.reason);
          }).catch(err => {
            console.error('playUnit threw an exception:', err);
            this._showToast('Error playing unit. See console.');
          });
        } else if (p.type === 'SpellSet' && isSpellTrapZone) {
          this.controller.setSpell(p.player.id, p.cardInstanceId, slotIdx).then(r => {
            if (!r.success) this._showToast(r.reason);
          }).catch(err => {
            console.error('setSpell threw:', err);
            this._showToast('Error setting spell.');
          });
        } else if (p.type === 'TrapSet' && isSpellTrapZone) {
          this.controller.setTrap(p.player.id, p.cardInstanceId, slotIdx).then(r => {
            if (!r.success) this._showToast(r.reason);
          }).catch(err => {
            console.error('setTrap threw:', err);
            this._showToast('Error setting trap.');
          });
        } else if (p.type === 'Landmark' && isLandmarkSlot) {
          this.controller.playLandmark(p.player.id, p.cardInstanceId, playerId).then(r => {
            if (!r.success) this._showToast(r.reason);
          }).catch(err => {
            console.error('playLandmark threw:', err);
            this._showToast('Error playing landmark.');
          });
        } else {
          // Invalid slot clicked
          this.pendingPlacement = p; // Restore it
          this._pendingPlayAnim = null;
          this._showToast('Invalid slot for this card.');
        }
      };
    });

    // LP click for direct attack (works for any opponent in multi-player)
    document.querySelectorAll('.player-bar').forEach(el => {
      const pid = parseInt(el.dataset.player);
      if (pid !== activePlayer.id && this.attackingUnit) {
        const targetPlayer = gs.getPlayerById(pid);
        if (targetPlayer && targetPlayer.isAlive) {
          el.style.cursor = 'pointer';
          el.onclick = () => {
            this.controller.declareAttack(activePlayer.id, this.attackingUnit, {
              type: 'direct',
              player: targetPlayer,
            }).then(result => {
              this.attackingUnit = null;
              if (!result.success) this._showToast(result.reason);
            });
          };
        }
      }
    });

    // Action buttons
    const btnBattle = document.getElementById('btn-battle');
    const btnEndTurn = document.getElementById('btn-endturn');
    const btnEndBattle = document.getElementById('btn-endbattle');
    const btnCancelAction = document.getElementById('btn-cancel-action');

    if (btnBattle) btnBattle.onclick = () => this.controller.enterBattlePhase();
    if (btnEndTurn) btnEndTurn.onclick = () => {
      this.controller.endTurn().then(() => {
        if (gs.gameOver) {
          if (gs.gameMode === 'campaign' && this.campaignUI) {
            this.campaignUI._showPostBattle();
          } else {
            this.showGameOver();
          }
          return;
        }
        if (gs.gameMode === 'campaign' && this.campaignUI) {
          this.campaignUI.handleTurnTransition();
        } else {
          this.showTurnTransition();
        }
      });
    };
    if (btnEndBattle) btnEndBattle.onclick = () => this.controller.exitBattlePhase();
    if (btnCancelAction) btnCancelAction.onclick = () => {
      this.attackingUnit = null;
      this.pendingPlacement = null;
      this.render();
    };

    const btnMenu = document.getElementById('btn-menu');
    if (btnMenu) btnMenu.onclick = () => {
      this.showChoiceDialog(
        [{ label: '✅ Return to Main Menu', value: 'yes' }, { label: '✕ Cancel', value: 'no' }],
        'Are you sure you want to leave the game?',
        (choice) => {
          if (choice.value === 'yes') {
            this.playerConfigs = [];
            this.selectedCard = null;
            this.attackingUnit = null;
            this.showMenu();
          }
        }
      );
    };

    // Graveyard click to view
    document.querySelectorAll('.graveyard-pile').forEach(el => {
      el.onclick = () => {
        const pid = parseInt(el.dataset.player);
        const player = gs.getPlayerById(pid);
        if (player) this._showGraveyardViewer(player);
      };
    });

    // Event log toggle
    const logToggle = document.getElementById('event-log-toggle');
    if (logToggle) {
      logToggle.onclick = () => {
        this._eventLogCollapsed = !this._eventLogCollapsed;
        this.render();
      };
    }
  }

  _onHandCardClick(el, player, gs) {
    const instanceId = el.dataset.instance;
    const cardType = el.dataset.type;
    const card = player.hand.find(c => c.instanceId === instanceId);
    if (!card) return;

    if (gs.phase !== PHASES.MAIN1 && gs.phase !== PHASES.MAIN2) {
      this._showToast('You can only play cards during Main Phase.');
      return;
    }

    // Get the card element's position for the popup menu
    const rect = el.getBoundingClientRect();

    // Capture card image for play animation
    const imgEl = el.querySelector('img');
    const imgSrc = imgEl ? imgEl.src : null;

    if (cardType === 'Unit') {
      // YGO-style: Summon in ATK or Set in DEF
      const options = [];
      const canSummon = this.controller.actionValidator.canPlayUnit(player.id, card).valid;
      if (canSummon) {
        options.push({ label: '⚔ Summon in ATK', value: 'atk', icon: '⚔' });
        options.push({ label: '🛡 Set in DEF', value: 'def', icon: '🛡' });
      }
      if (options.length === 0) {
        this._showToast(this.controller.actionValidator.canPlayUnit(player.id, card).reason || 'Cannot play this card.');
        return;
      }
      this._showCardActionMenu(rect, options, (choice) => {
        const position = choice.value === 'def' ? 'DEF' : 'ATK';
        console.log('Action menu choice:', choice, 'Position:', position);
        this.pendingPlacement = {
          type: 'Unit',
          cardInstanceId: instanceId,
          position: position,
          rect: el.getBoundingClientRect(),
          imgSrc: imgSrc,
          player: player
        };
        this._showToast(`Select a slot to summon ${card.name}`);
        this.render();
      });

    } else if (cardType === 'Spell') {
      // YGO-style: Activate or Set face-down
      const options = [];
      const canActivate = this.controller.actionValidator.canPlaySpell(player.id, card).valid;
      const canSet = this.controller.actionValidator.canSetSpell(player.id, card).valid;
      if (canActivate) options.push({ label: '✦ Activate', value: 'activate', icon: '✦' });
      if (canSet) options.push({ label: '⬇ Set', value: 'set', icon: '⬇' });
      if (options.length === 0) {
        this._showToast('Cannot play this Spell right now.');
        return;
      }
      this._showCardActionMenu(rect, options, (choice) => {
        if (choice.value === 'activate') {
          this._pendingPlayAnim = { rect: el.getBoundingClientRect(), imgSrc };
          this.controller.playSpell(player.id, instanceId).then(r => {
            if (!r.success) this._showToast(r.reason);
          });
        } else {
          this.pendingPlacement = {
            type: 'SpellSet',
            cardInstanceId: instanceId,
            rect: el.getBoundingClientRect(),
            imgSrc: imgSrc,
            player: player
          };
          this._showToast(`Select a slot to set the Spell`);
          this.render();
        }
      });

    } else if (cardType === 'Trap') {
      // Traps can only be Set face-down
      const canSet = this.controller.actionValidator.canSetTrap(player.id, card).valid;
      if (!canSet) {
        this._showToast(this.controller.actionValidator.canSetTrap(player.id, card).reason || 'Cannot set this Trap.');
        return;
      }
      this._showCardActionMenu(rect, [
        { label: '⬇ Set', value: 'set', icon: '⬇' }
      ], () => {
        this.pendingPlacement = {
          type: 'TrapSet',
          cardInstanceId: instanceId,
          rect: el.getBoundingClientRect(),
          imgSrc: imgSrc,
          player: player
        };
        this._showToast(`Select a slot to set the Trap`);
        this.render();
      });

    } else if (cardType === 'Landmark') {
      const canPlay = this.controller.actionValidator.canPlayLandmark(player.id, card).valid;
      if (!canPlay) {
        this._showToast(this.controller.actionValidator.canPlayLandmark(player.id, card).reason || 'Cannot play this Landmark.');
        return;
      }
      this._showCardActionMenu(rect, [
        { label: '🏔 Play Landmark', value: 'play', icon: '🏔' }
      ], () => {
        this.pendingPlacement = {
          type: 'Landmark',
          cardInstanceId: instanceId,
          rect: el.getBoundingClientRect(),
          imgSrc: imgSrc,
          player: player
        };
        this._showToast(`Select a Landmark slot to place ${card.name}`);
        this.render();
      });
    }
  }

  /**
   * Show a floating action menu near a card (YGO-style)
   */
  _showCardActionMenu(rect, options, callback) {
    // Remove any existing menu
    document.querySelectorAll('.card-action-menu-overlay').forEach(e => e.remove());

    const overlay = document.createElement('div');
    overlay.className = 'card-action-menu-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:65;';

    const menu = document.createElement('div');
    menu.className = 'card-action-menu';
    // Position the menu above the card
    const menuX = Math.min(rect.left + rect.width / 2, window.innerWidth - 100);
    const menuY = rect.top - 8;
    menu.style.cssText = `
            position:fixed;
            left:${menuX}px;
            top:${menuY}px;
            transform:translate(-50%, -100%);
            z-index:66;
        `;

    menu.innerHTML = options.map((opt, i) => `
            <div class="card-action-option" data-idx="${i}">
                <span class="card-action-icon">${opt.icon || ''}</span>
                <span>${opt.label}</span>
            </div>
        `).join('');

    overlay.appendChild(menu);
    document.body.appendChild(overlay);

    // Click on option
    menu.querySelectorAll('.card-action-option').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        const idx = parseInt(el.dataset.idx);
        overlay.remove();
        callback(options[idx]);
      };
    });

    // Click outside to cancel
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };
  }

  /**
   * Handle field card click — show action menu with position switch, zoom, attack options
   */
  _onFieldCardClick(el, instanceId, player, gs) {
    const unit = player.getFieldUnits().find(u => u.instanceId === instanceId);
    const spellTrap = player.spellTrapZone.find(c => c && c.instanceId === instanceId);
    const rect = el.getBoundingClientRect();
    const options = [];

    if (unit) {
      // Battle phase: attack option
      if (gs.phase === PHASES.BATTLE && this.controller.combatEngine.canAttack(unit)) {
        options.push({ label: '⚔ Attack', value: 'attack', icon: '⚔' });
      }
      // Main phase: switch position (once per turn, not after attacking)
      const isMainPhase = gs.phase === PHASES.MAIN1 || gs.phase === PHASES.MAIN2;
      if (isMainPhase && !unit.summonedThisTurn && !unit.hasChangedPositionThisTurn && !unit.hasAttackedThisTurn) {
        const newPos = unit.position === 'ATK' ? 'DEF' : 'ATK';
        options.push({ label: `🔄 Switch to ${newPos}`, value: 'switch', icon: '🔄' });
      }
      // Main phase: activate ability (once per round effects)
      const isMainPhase2 = gs.phase === PHASES.MAIN1 || gs.phase === PHASES.MAIN2;
      if (isMainPhase2 && this.controller.actionValidator.canActivateAbility(player.id, unit).valid) {
        options.push({ label: '⚡ Activate', value: 'activate_ability', icon: '⚡' });
      }
    }

    if (spellTrap && spellTrap.faceUp === false) {
      const isMainPhase = gs.phase === PHASES.MAIN1 || gs.phase === PHASES.MAIN2;
      if (isMainPhase && spellTrap.type === 'Spell') {
        options.push({ label: '✦ Activate', value: 'activate_set', icon: '✦' });
      }
    }

    // Always allow zoom
    const cardId = el.dataset.cardId;
    options.push({ label: '🔍 View Card', value: 'zoom', icon: '🔍' });

    this._showCardActionMenu(rect, options, (choice) => {
      if (choice.value === 'attack') {
        this.attackingUnit = instanceId;
        this._showToast(`${unit.name} selected — click a target`);
        this.render();
      } else if (choice.value === 'switch') {
        this.controller.changePosition(player.id, instanceId).then(r => {
          if (!r.success) this._showToast(r.reason);
        });
      } else if (choice.value === 'activate_set') {
        this.controller.activateSetSpell(player.id, instanceId).then(r => {
          if (!r.success) this._showToast(r.reason);
        });
      } else if (choice.value === 'activate_ability') {
        this.controller.activateAbility(player.id, instanceId).then(r => {
          if (!r.success) this._showToast(r.reason);
        });
      } else if (choice.value === 'zoom') {
        this._showCardZoom(cardId);
      }
    });
  }

  _onFieldUnitClick(instanceId, player, gs) {
    const unit = player.getFieldUnits().find(u => u.instanceId === instanceId);
    if (!unit) return;

    if (this.controller.combatEngine.canAttack(unit)) {
      this.attackingUnit = instanceId;
      this._showToast(`${unit.name} selected — click a target`);
      this.render();
    }
  }

  _onAttackTargetClick(instanceId, playerId, opponent, gs) {
    const target = opponent.getFieldUnits().find(u => u.instanceId === instanceId);
    if (target) {
      this.controller.declareAttack(gs.activePlayerIndex, this.attackingUnit, {
        type: 'unit',
        card: target,
        player: opponent,
      }).then(result => {
        this.attackingUnit = null;
        if (!result.success) this._showToast(result.reason);
      });
    }
  }

  // ─── Target Selection ─────────────────────────────────────

  showTargetSelection(targets, description, callback) {
    if (targets.length === 0) {
      callback(null);
      return;
    }

    // Auto-select if only one target
    if (targets.length === 1) {
      callback(targets[0]);
      return;
    }

    // Show choice dialog with target names
    const options = targets.map((t, i) => ({
      label: t.name || t.card?.name || `Target ${i + 1}`,
      value: i,
      cardId: t.cardId || t.card?.cardId || null,
    }));

    this.showChoiceDialog(options, description, (choice) => {
      callback(targets[choice.value] || null);
    });
  }

  // ─── Choice Dialog ────────────────────────────────────────

  showChoiceDialog(options, description, callback) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:65;display:flex;align-items:center;justify-content:center';

    overlay.innerHTML = `
      <div class="choice-dialog">
        <h3>${description}</h3>
        <div class="choice-options" style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:600px">
          ${options.map((opt, i) => {
      // If the option has a cardId or value that looks like a card ID, show its image
      const cardId = opt.cardId || (typeof opt.value === 'string' && opt.value.match(/^[A-Z]\d{3}$/) ? opt.value : null);
      if (cardId) {
        return `
                <div class="choice-option" data-idx="${i}" style="display:flex;flex-direction:column;align-items:center;padding:8px;max-width:120px">
                  <img src="./output-web/${cardId}.webp" alt="${opt.label}" style="width:80px;height:112px;object-fit:contain;border-radius:6px;margin-bottom:6px;border:1px solid var(--glass-border)" />
                  <span style="font-size:0.7rem;text-align:center">${opt.label}</span>
                </div>
              `;
      }
      return `<div class="choice-option" data-idx="${i}">${opt.label}</div>`;
    }).join('')}
        </div>
      </div>
    `;

    this.app.appendChild(overlay);

    overlay.querySelectorAll('.choice-option').forEach(el => {
      el.onclick = () => {
        const idx = parseInt(el.dataset.idx);
        overlay.remove();
        callback(options[idx]);
      };
    });
  }

  // ─── Opponent Response Dialog ────────────────────────────

  showOpponentResponseDialog(player, callback) {
    const faceDownCards = player.getFaceDownCards().filter(c => c.type === 'Spell' || c.type === 'Trap');
    if (faceDownCards.length === 0) {
      callback({ activate: false });
      return;
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:70;display:flex;align-items:center;justify-content:center';

    // Check which cards can be activated (mana check)
    const validator = this.controller.actionValidator;
    const cardStates = faceDownCards.map(card => {
      let canActivate = false;
      if (card.type === 'Trap') {
        canActivate = validator.canActivateTrap(player.id, card).valid;
      } else if (card.type === 'Spell') {
        canActivate = validator.canActivateSetSpell(player.id, card).valid;
      }
      return { card, canActivate };
    });

    overlay.innerHTML = `
      <div class="choice-dialog response-card-dialog">
        <h3 style="color:var(--gold)">${player.name} — Activate a face-down card?</h3>
        <p style="color:var(--text-muted);font-size:0.8rem;margin-bottom:16px">
          You have ${faceDownCards.length} face-down card(s). Hover to inspect, then choose an action.
        </p>
        <div class="response-cards-row">
          ${cardStates.map(({ card, canActivate }) => `
            <div class="response-card-wrapper" data-instance="${card.instanceId}">
              <div class="response-card-img-wrap">
                <img src="./output-web/${card.cardId}.webp" alt="${card.name}" class="response-card-img" />
              </div>
              <span class="response-card-name">${card.name}</span>
              <span class="response-card-cost">Mana: ${card.manaCost}</span>
              <div class="response-card-buttons">
                ${canActivate
        ? `<button class="menu-btn primary resp-activate-btn" data-instance="${card.instanceId}" style="padding:6px 14px;font-size:0.75rem">⚡ Activate</button>`
        : `<span class="response-card-no-mana">Not enough mana</span>`
      }
                <button class="menu-btn resp-view-btn" data-card-id="${card.cardId}" style="padding:6px 14px;font-size:0.75rem;opacity:0.8">🔍 View Details</button>
              </div>
            </div>
          `).join('')}
        </div>
        <button class="menu-btn resp-pass-btn" style="margin-top:16px;padding:10px 28px;opacity:0.8">No, Pass</button>
      </div>
    `;

    this.app.appendChild(overlay);

    // Pass button
    overlay.querySelector('.resp-pass-btn').onclick = () => {
      overlay.remove();
      callback({ activate: false });
    };

    // Activate buttons
    overlay.querySelectorAll('.resp-activate-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        overlay.remove();
        callback({ activate: true, cardInstanceId: btn.dataset.instance });
      };
    });

    // View Details buttons — open zoom without closing the dialog
    overlay.querySelectorAll('.resp-view-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        this._showCardZoom(btn.dataset.cardId);
      };
    });
  }

  // ─── Preview & Toast ──────────────────────────────────────

  _showPreview(el) {
    // Now handled by JS hover management in _attachListeners
  }

  _hidePreview() {
    // Now handled by JS hover management in _attachListeners
  }

  _showCardPreview(instanceId) {
    // CSS hover handles preview
  }

  // ─── UI Update with Animation Detection ───────────────────

  _onUIUpdate(gs) {
    if (!gs) { this.render(); return; }

    // Detect draw events: check if hand grew for active player
    const activePlayer = gs.getActivePlayer();
    const prevSize = this._lastHandSizes[activePlayer.id] || 0;
    const newSize = activePlayer.hand.length;
    const drewCards = newSize > prevSize && prevSize > 0;
    const cardsDrawn = drewCards ? newSize - prevSize : 0;

    // Check if we have a pending play animation
    const playAnim = this._pendingPlayAnim;
    this._pendingPlayAnim = null;

    // Re-render the DOM
    this.render();

    // Play card fly animation (hand → field)
    if (playAnim && playAnim.imgSrc) {
      this._animateCardPlay(playAnim.rect, playAnim.imgSrc);
    }

    // Draw animation removed per user request

    // Track hand sizes for all players
    for (const p of gs.players) {
      this._lastHandSizes[p.id] = p.hand.length;
    }
  }

  // ─── Card Play Animation ──────────────────────────────────

  _animateCardPlay(startRect, imgSrc) {
    // Find the most recently placed field card
    const fieldSection = document.querySelector('.field-section:not(.opponent)');
    let targetRect;
    if (fieldSection) {
      const slots = fieldSection.querySelectorAll('.card-slot.has-card');
      const lastSlot = slots.length > 0 ? slots[slots.length - 1] : null;
      targetRect = lastSlot ? lastSlot.getBoundingClientRect() : fieldSection.getBoundingClientRect();
    } else {
      return;
    }

    // Create flying clone
    const clone = document.createElement('div');
    clone.className = 'card-flying';
    const img = document.createElement('img');
    img.src = imgSrc;
    clone.appendChild(img);

    // Position at start
    clone.style.left = `${startRect.left}px`;
    clone.style.top = `${startRect.top}px`;
    clone.style.width = `${startRect.width}px`;
    clone.style.height = `${startRect.height}px`;

    document.body.appendChild(clone);

    // Animate from start to target using Web Animations API
    const dx = targetRect.left + targetRect.width / 2 - (startRect.left + startRect.width / 2);
    const dy = targetRect.top + targetRect.height / 2 - (startRect.top + startRect.height / 2);

    clone.animate([
      {
        transform: 'scale(1) rotate(0deg) translate(0, 0)',
        opacity: 1,
      },
      {
        transform: `scale(1.15) rotate(-5deg) translate(${dx * 0.3}px, ${dy * 0.3 - 40}px)`,
        opacity: 1,
        offset: 0.35,
      },
      {
        transform: `scale(0.9) rotate(0deg) translate(${dx}px, ${dy}px)`,
        opacity: 0.8,
      }
    ], {
      duration: 450,
      easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      fill: 'forwards',
    }).onfinish = () => {
      clone.remove();
    };
  }

  // ─── Card Draw Animation ──────────────────────────────────

  _animateCardDraw(count, playerId) {
    // Find deck pile position
    const deckPile = document.querySelector('.field-section:not(.opponent) .deck-pile')
      || document.querySelector('.deck-pile');
    if (!deckPile) return;
    const deckRect = deckPile.getBoundingClientRect();

    // Find the hand cards (the last N cards are the newly drawn ones)
    const handCards = document.querySelectorAll('.hand-card');
    if (handCards.length === 0) return;

    const drawCount = Math.min(count, handCards.length);

    for (let i = 0; i < drawCount; i++) {
      const targetEl = handCards[handCards.length - 1 - i];
      if (!targetEl) continue;
      const targetRect = targetEl.getBoundingClientRect();

      // Create flying card-back clone
      const clone = document.createElement('div');
      clone.className = 'card-flying';
      clone.style.background = 'linear-gradient(135deg, #1a237e, #283593)';
      clone.style.border = '1px solid rgba(63, 81, 181, 0.6)';

      // Add card-back pattern
      const inner = document.createElement('div');
      inner.style.cssText = `
        width: 100%; height: 100%; border-radius: inherit;
        background: repeating-linear-gradient(45deg, transparent, transparent 4px,
          rgba(255,255,255,0.05) 4px, rgba(255,255,255,0.05) 8px);
      `;
      clone.appendChild(inner);

      // Position at deck
      clone.style.left = `${deckRect.left}px`;
      clone.style.top = `${deckRect.top}px`;
      clone.style.width = `${deckRect.width}px`;
      clone.style.height = `${deckRect.height}px`;

      document.body.appendChild(clone);

      const dx = targetRect.left + targetRect.width / 2 - (deckRect.left + deckRect.width / 2);
      const dy = targetRect.top + targetRect.height / 2 - (deckRect.top + deckRect.height / 2);

      // Stagger animations for multiple draws
      const delay = i * 120;

      clone.animate([
        {
          transform: 'scale(0.7) rotate(5deg) translate(0, 0)',
          opacity: 0.6,
        },
        {
          transform: `scale(1.1) rotate(-3deg) translate(${dx * 0.5}px, ${dy * 0.5 + 30}px)`,
          opacity: 1,
          offset: 0.45,
        },
        {
          transform: `scale(1) rotate(0deg) translate(${dx}px, ${dy}px)`,
          opacity: 1,
        }
      ], {
        duration: 420,
        delay: delay,
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        fill: 'forwards',
      }).onfinish = () => {
        clone.remove();
      };
    }
  }

  /**
   * Show card zoomed 200% to center of screen
   */
  _showCardZoom(cardId) {
    if (!cardId) return;
    // Remove existing zoom
    document.querySelectorAll('.card-zoom-overlay').forEach(e => e.remove());

    const imgPath = `./output-web/${cardId}.webp`;
    const overlay = document.createElement('div');
    overlay.className = 'card-zoom-overlay';
    overlay.innerHTML = `
      <div class="card-zoom-container">
        <img src="${imgPath}" alt="Card" class="card-zoom-image" />
      </div>
    `;

    document.body.appendChild(overlay);

    // Click outside the card to dismiss
    overlay.onclick = (e) => {
      if (!e.target.closest('.card-zoom-container')) {
        overlay.remove();
      }
    };
    // ESC to dismiss
    const escHandler = (e) => {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);
  }
  _showGraveyardViewer(player) {
    if (!player.graveyard || player.graveyard.length === 0) {
      this._showToast(`${player.name}'s graveyard is empty.`);
      return;
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:70;display:flex;align-items:center;justify-content:center';

    overlay.innerHTML = `
      <div class="choice-dialog" style="max-width:700px;max-height:80vh;overflow-y:auto">
        <h3 style="color:var(--gold);margin-bottom:12px">${player.name}'s Graveyard (${player.graveyard.length} cards)</h3>
        <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;padding:8px">
          ${player.graveyard.map(card => `
            <div class="graveyard-card-entry" data-card-id="${card.cardId}"
                 style="display:flex;flex-direction:column;align-items:center;cursor:pointer;padding:6px;border-radius:8px;transition:background 0.2s"
                 onmouseover="this.style.background='rgba(255,213,79,0.1)'"
                 onmouseout="this.style.background='transparent'">
              <img src="./output-web/${card.cardId}.webp" alt="${card.name}"
                   style="width:80px;height:112px;object-fit:contain;border-radius:6px;border:1px solid var(--glass-border)"
                   onerror="this.parentElement.style.display='none'" />
              <span style="font-size:0.65rem;text-align:center;color:var(--text-secondary);margin-top:4px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${card.name}</span>
            </div>
          `).join('')}
        </div>
        <button class="menu-btn" style="margin-top:12px;padding:8px 24px" id="graveyard-close">Close</button>
      </div>
    `;

    document.body.appendChild(overlay);

    // Close button
    overlay.querySelector('#graveyard-close').onclick = () => overlay.remove();

    // Click outside to close
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };

    // Click on card to zoom
    overlay.querySelectorAll('.graveyard-card-entry').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        this._showCardZoom(el.dataset.cardId);
      };
    });

    // ESC to close
    const escHandler = (e) => {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);
  }

  _showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position:fixed;bottom:180px;left:50%;transform:translateX(-50%);
      background:rgba(30,30,40,0.95);color:var(--text-primary);
      padding:10px 24px;border-radius:8px;font-size:0.8rem;
      border:1px solid var(--glass-border);z-index:100;
      animation:float-up 2s ease-out forwards;
    `;
    toast.textContent = message;
    this.app.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  // ─── Animations ───────────────────────────────────────────

  showFloatingNumber(x, y, text, type = 'damage') {
    const el = document.createElement('div');
    el.className = `floating-number ${type}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.textContent = text;
    this.app.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  // ─── Game Over ────────────────────────────────────────────

  showGameOver() {
    const gs = this.controller.gameState;
    const winner = gs.winner;

    // Campaign mode: delegate to campaign UI
    if (gs.gameMode === 'campaign' && this.campaignUI) {
      this.campaignUI._showPostBattle();
      return;
    }

    // War Campaign mode: delegate to war campaign UI
    if (gs.gameMode === 'warCampaign' && this.warCampaignUI) {
      const loser = gs.players.find(p => p.id !== (winner ? winner.id : null));
      this.warCampaignUI.handleWarCampaignGameOver(winner, loser);
      return;
    }

    this.app.innerHTML = `
      <div class="game-over">
        <button class="global-menu-btn" id="btn-menu">☰ Menu</button>
        <h1>Victory!</h1>
        <h2>${winner ? `${winner.name} wins the battle!` : 'Draw!'}</h2>
        <button class="menu-btn primary" id="btn-rematch" style="position:relative;z-index:1">Play Again</button>
      </div>
    `;
    this._wireGlobalMenuButton();

    document.getElementById('btn-rematch').onclick = () => {
      this.playerConfigs = [];
      this.selectedCard = null;
      this.attackingUnit = null;
      this.showMenu();
    };
  }

  // ─── Helpers ──────────────────────────────────────────────

  /**
   * Wire up a global menu button (#btn-menu) that confirms and returns to menu.
   */
  _wireGlobalMenuButton() {
    const btnMenu = document.getElementById('btn-menu');
    if (btnMenu) {
      btnMenu.onclick = () => {
        this.showChoiceDialog(
          [{ label: '✅ Return to Main Menu', value: 'yes' }, { label: '✕ Cancel', value: 'no' }],
          'Are you sure you want to leave?',
          (choice) => {
            if (choice.value === 'yes') {
              this.playerConfigs = [];
              this.selectedCard = null;
              this.attackingUnit = null;
              this.showMenu();
            }
          }
        );
      };
    }
  }

  _getRegionClass(region) {
    const map = { Northern: 'north', Eastern: 'east', Southern: 'south', Western: 'west' };
    return map[region] || '';
  }
}
