// ─────────────────────────────────────────────────────────────
// GameUI.js — Renders the game board and handles interactions
// Handles Online (network) mode — AI runs server-side via BotPlayer
// ─────────────────────────────────────────────────────────────

import { PHASES } from '../engine/GameState.js';
import { DuelDeckBuilderUI } from './DuelDeckBuilderUI.js';
import * as SharedUI from './SharedUI.js';
import * as MatchHistory from '../online/MatchHistory.js';

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

    // ─── Online mode properties ──────────────────────────────
    this.isOnline = false;          // True when playing online
    this.net = null;                // NetworkManager reference
    this.myPlayerId = null;         // Player ID assigned by server
    this._onlineState = null;       // Hydrated server state
    this._onlineMatchStartedAt = null; // For duration tracking

    // Animation tracking
    this._lastHandSizes = {};       // Track hand sizes per player for draw detection
    this._pendingPlayAnim = null;   // { rect, imgSrc } captured before play action
    this.pendingPlacement = null;   // Pending placement logic
    this._eventLogCollapsed = false; // Event log UI state
    this._attackArrowSvg = null;    // SVG element for attack arrow
    this._attackArrowLine = null;   // SVG line/path for arrow
    this._attackArrowOrigin = null; // { x, y } origin of attack arrow

    // Visual effects tracking
    this._lastLP = {};              // Track LP per player for screen shake
    this._lastFieldUnits = {};      // Track field units per player for destruction particles
    this._lastFieldSpellTraps = {}; // Track spell/trap state for flip animation
    this._lastMana = {};            // Track mana per player for crystal animation
    this._lastUnitDamage = {};       // Track unit damage for damage flash
    this._fieldParticlesCreated = false; // Prevent duplicate field particles

    // Wire up callbacks (for local/AI mode — online mode wires these differently)
    controller.onUIUpdate = (gs) => this._onUIUpdate(gs);
    controller.effectEngine.onTargetRequired = (targets, desc, cb) => this.showTargetSelection(targets, desc, cb);
    controller.effectEngine.onChoiceRequired = (options, desc, cb) => this.showChoiceDialog(options, desc, cb);
    controller.onOpponentResponse = (player, callback, chainContext) => this.showOpponentResponseDialog(player, callback, chainContext);
  }

  // ─── Unified State Access ────────────────────────────────

  /** Returns the current game state — either local controller or hydrated online state */
  get _gs() {
    return this.isOnline ? this._onlineState : this.controller.gameState;
  }

  /** Hydrate serialized JSON state from server with helper methods */
  _hydrateOnlineState(state) {
    if (!state || !state.players) return state;
    state.getActivePlayer = () => state.players[state.activePlayerIndex];
    state.getPlayerById = (id) => state.players[id] || null;
    state.getOpponents = (id) => state.players.filter(p => p.id !== id && p.isAlive);
    state.getOpponent = (id) => {
      const opps = state.players.filter(p => p.id !== id && p.isAlive);
      return opps[0] || null;
    };
    state.getAlivePlayers = () => state.players.filter(p => p.isAlive);
    state.isPlayersTurn = (id) => state.activePlayerIndex === id;
    state.findCardOnField = (instanceId) => {
      for (const player of state.players) {
        for (let i = 0; i < 5; i++) {
          if (player.unitZone[i]?.instanceId === instanceId)
            return { card: player.unitZone[i], zone: 'unit', index: i, player };
          if (player.spellTrapZone[i]?.instanceId === instanceId)
            return { card: player.spellTrapZone[i], zone: 'spellTrap', index: i, player };
        }
        if (player.landmarkZone?.instanceId === instanceId)
          return { card: player.landmarkZone, zone: 'landmark', index: 0, player };
      }
      return null;
    };
    state.findCardInHand = (playerId, instanceId) => {
      const player = state.players[playerId];
      if (!player) return null;
      return player.hand.find(c => c.instanceId === instanceId) || null;
    };
    state.log = (type, message) => {
      if (!state.eventLog) state.eventLog = [];
      state.eventLog.push({ type, message, timestamp: Date.now(), turn: state.turnCounter, round: state.roundCounter, phase: state.phase });
    };
    // Hydrate player objects
    for (const p of state.players) {
      if (!p.getFieldUnits) {
        p.getFieldUnits = () => p.unitZone.filter(c => c !== null);
        p.getFaceDownCards = () => p.spellTrapZone.filter(c => c && !c.faceUp);
        p.getSetCards = () => p.spellTrapZone.filter(c => c !== null);
        p.getEmptyUnitSlot = () => p.unitZone.findIndex(s => s === null);
        p.getEmptySpellTrapSlot = () => p.spellTrapZone.findIndex(s => s === null);
        p.getTotalMana = () => p.primaryMana + p.spellMana;
      }
    }
    return state;
  }

  // ─── Online Game Lifecycle ───────────────────────────────

  /** Called by OnlineGameUI when a match starts. Takes over all in-game rendering. */
  startOnlineGame(net, myPlayerId) {
    this.isOnline = true;
    this.net = net;
    this.myPlayerId = myPlayerId;
    this._onlineState = null;
    this._onlineMatchStartedAt = Date.now();
    this.currentScreen = 'game';
    this.attackingUnit = null;
    this.pendingPlacement = null;
    this.selectedCard = null;
    // Reset animation tracking
    this._lastHandSizes = {};
    this._lastLP = {};
    this._lastFieldUnits = {};
    this._lastFieldSpellTraps = {};
    this._lastMana = {};
    this._lastUnitDamage = {};
    this._wireOnlineGameEvents();
  }

  /** Reset online mode and return to local/AI mode. */
  endOnlineGame() {
    this.isOnline = false;
    this.net = null;
    this.myPlayerId = null;
    this._onlineState = null;
    this._onlineMatchStartedAt = null;
  }

  /** Wire network events for in-game phase. Called by startOnlineGame(). */
  _wireOnlineGameEvents() {
    const net = this.net;

    net.on('REQUEST_LANDMARK', (msg) => {
      this.showLandmarkSelect(-1, msg.landmarks);
    });

    net.on('REQUEST_MULLIGAN', (msg) => {
      this.showMulliganScreen(-1, msg.hand);
    });

    net.on('GAME_PHASE', (msg) => {
      if (msg.phase === 'WAITING') {
        this._showOnlineWaiting(msg.message || 'Waiting for opponent...');
      } else if (msg.phase === 'LANDMARK' && msg.landmarks && msg.landmarks.length === 0) {
        net.send('SELECT_LANDMARK', { cardInstanceId: null });
        this._showOnlineWaiting('Waiting for opponent to select a landmark...');
      }
    });

    net.on('GAME_STATE', (msg) => {
      this.myPlayerId = msg.yourPlayerId;
      const prevState = this._onlineState;
      this._onlineState = this._hydrateOnlineState(msg.state);
      if (this._onlineState.phase !== 'SETUP' && this._onlineState.phase !== 'MULLIGAN') {
        this._onUIUpdate(this._onlineState);
      }
    });

    net.on('TURN_CHANGE', (msg) => {
      if (!this._onlineState) return;
      this._onlineState.activePlayerIndex = msg.activePlayerId;
      if (msg.round) this._onlineState.roundCounter = msg.round;
      if (msg.turn) this._onlineState.turnCounter = msg.turn;
      this.showTurnTransition(null, null, msg);
    });

    net.on('REQUEST_TARGET', (msg) => {
      this.showTargetSelection(msg.targets, msg.description, (target) => {
        if (target) net.send('TARGET_SELECTED', { targetId: target.instanceId });
      });
    });

    net.on('REQUEST_CHOICE', (msg) => {
      this.showChoiceDialog(msg.options, msg.description, (choice) => {
        net.send('CHOICE_MADE', { choice });
      });
    });

    net.on('REQUEST_RESPONSE', (msg) => {
      const cards = msg.faceDownCards.map(c => ({
        instanceId: c.instanceId, cardId: c.cardId, name: c.name,
        type: c.type, manaCost: c.manaCost,
        canActivate: c.canActivate, reason: c.reason
      }));
      SharedUI.showResponseDialog(document.body, cards, (result) => {
        net.send('OPPONENT_RESPONSE', { response: result });
      });
    });

    net.on('TOAST', (msg) => {
      this._showToast(msg.message);
    });

    net.on('ACTION_RESULT', (msg) => {
      if (!msg.success && msg.reason) {
        this._showToast(msg.reason);
      }
    });

    net.on('GAME_OVER', (msg) => {
      // Persist match result
      MatchHistory.saveMatch({
        date: new Date().toISOString(),
        duration: msg.duration || 0,
        rounds: msg.rounds || 0,
        turns: msg.turns || 0,
        winner: msg.winner,
        winnerName: msg.winnerName,
        myPlayerId: this.myPlayerId,
        players: msg.players || [],
      });
      // Store server msg so unified showGameOver can use it
      this._onlineGameOverMsg = msg;
      this.showGameOver();
    });

    net.on('ERROR', (msg) => {
      this._showToast(msg.message || 'An error occurred.');
    });

    net.on('OPPONENT_DISCONNECTED', (msg) => {
      this._showDisconnected(msg.message);
    });

    net.on('disconnected', () => {
      this._showDisconnected('Connection to server lost.');
    });
  }

  /** Show a waiting screen during online play */
  _showOnlineWaiting(message) {
    this.app.innerHTML = `
      <div class="main-menu online-lobby">
        <div class="waiting-animation">
          <div class="waiting-dots"><span></span><span></span><span></span></div>
          <p>${message}</p>
        </div>
      </div>
    `;
  }

  /** Route an action to either the local controller or the network */
  async _doAction(type, ...args) {
    if (this.isOnline) {
      // Network methods do NOT take playerId (server knows who sent via WebSocket).
      // All callers pass (playerId, ...restArgs), so strip the first arg for network calls.
      // Exception: actions with no playerId arg (enterBattle, exitBattle, endTurn).
      const netArgs = args.slice(1); // Remove playerId
      switch (type) {
        case 'playUnit': this.net.playUnit(...netArgs); break;
        case 'playSpell': this.net.playSpell(...netArgs); break;
        case 'setSpell': this.net.setSpell(...netArgs); break;
        case 'setTrap': this.net.setTrap(...netArgs); break;
        case 'playLandmark': this.net.playLandmark(...netArgs); break;
        case 'activateSetSpell': this.net.activateSetSpell(...netArgs); break;
        case 'activateTrap': this.net.activateTrap(...netArgs); break;
        case 'declareAttack': {
          // Serialize targetInfo: send just IDs, not full objects
          const [attackerId, targetInfo] = netArgs;
          const serializedTarget = {
            type: targetInfo.type,
            targetPlayerId: targetInfo.player?.id,
            cardInstanceId: targetInfo.card?.instanceId,
          };
          this.net.declareAttack(attackerId, serializedTarget);
          break;
        }
        case 'activateAbility': this.net.activateAbility(...netArgs); break;
        case 'changePosition': this.net.changePosition(...netArgs); break;
        case 'enterBattlePhase': this.net.enterBattle(); break;
        case 'exitBattlePhase': this.net.exitBattle(); break;
        case 'endTurn': this.net.endTurn(); break;
        default: console.warn('Unknown online action:', type);
      }
      return { success: true }; // Server validates
    }
    // Local mode — call controller directly (needs playerId)
    const fn = this.controller[type];
    if (fn) return fn.call(this.controller, ...args);
    return { success: false, reason: 'Unknown action' };
  }

  /** Check if it's the local player's turn (works in both modes) */
  _isMyTurn() {
    const gs = this._gs;
    if (!gs) return false;
    if (this.isOnline) return gs.activePlayerIndex === this.myPlayerId;
    // In AI/campaign mode, player 0 is the human
    if (gs.gameMode === 'ai' || gs.gameMode === 'campaign') return gs.activePlayerIndex === 0;
    return true; // Duel/other modes — always the active player's turn to act
  }

  /** Get the local player (bottom of screen) */
  _getLocalPlayer() {
    const gs = this._gs;
    if (!gs) return null;
    if (this.isOnline) return gs.players[this.myPlayerId];
    const isFixedPerspective = gs.gameMode === 'campaign' || gs.gameMode === 'ai';
    return isFixedPerspective ? gs.players[0] : gs.getActivePlayer();
  }

  // ─── Screen Management ────────────────────────────────────

  showMenu() {
    this.currentScreen = 'menu';
    const isFullscreen = !!document.fullscreenElement;
    this.app.innerHTML = `
      <div class="main-menu">
        <span class="version-label">v1.01</span>
        <button class="settings-btn" id="btn-settings" title="Settings">⚙</button>
        <h1 class="menu-title">Battle Among Regions</h1>
        <p class="menu-subtitle">War for Supremacy</p>
        <div class="menu-buttons">
          <button class="menu-btn primary" id="btn-vs-ai">⚔ vs AI</button>
          <!-- Hot-seat buttons removed (kept for later)
          <button class="menu-btn" id="btn-duel">Regional Match (2P)</button>
          <button class="menu-btn" id="btn-3p">3-Player Match</button>
          <button class="menu-btn" id="btn-4p">4-Player Match</button>
          <button class="menu-btn campaign-glow" id="btn-war-campaign">⚔ War Campaign</button>
          -->
          <button class="menu-btn" id="btn-campaign">Solo Campaign</button>
          <button class="menu-btn" id="btn-deck-builder">⚔ Deck Builder</button>
          <button class="menu-btn online-glow" id="btn-online">🌐 Online Match</button>
          <button class="menu-btn tutorial-glow" id="btn-tutorial">📖 Tutorial</button>
        </div>

        <!-- Settings Overlay -->
        <div class="settings-overlay" id="settings-overlay">
          <div class="settings-panel">
            <div class="settings-header">
              <h2>Settings</h2>
              <button class="settings-close-btn" id="settings-close">✕</button>
            </div>
            <div class="settings-body">
              <div class="settings-row">
                <span class="settings-label">Fullscreen</span>
                <label class="toggle-switch">
                  <input type="checkbox" id="toggle-fullscreen" ${isFullscreen ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Settings button
    document.getElementById('btn-settings').onclick = () => {
      document.getElementById('settings-overlay').classList.add('visible');
    };
    document.getElementById('settings-close').onclick = () => {
      document.getElementById('settings-overlay').classList.remove('visible');
    };
    document.getElementById('settings-overlay').onclick = (e) => {
      if (e.target.id === 'settings-overlay') {
        e.target.classList.remove('visible');
      }
    };

    // Fullscreen toggle
    document.getElementById('toggle-fullscreen').onchange = async (e) => {
      try {
        if (e.target.checked) {
          await document.documentElement.requestFullscreen();
        } else {
          if (document.fullscreenElement) {
            await document.exitFullscreen();
          }
        }
      } catch (err) {
        console.warn('Fullscreen toggle failed:', err);
        e.target.checked = !e.target.checked;
      }
    };

    // Sync toggle if user exits fullscreen via Escape key
    document.onfullscreenchange = () => {
      const toggle = document.getElementById('toggle-fullscreen');
      if (toggle) {
        toggle.checked = !!document.fullscreenElement;
      }
    };

    /* Hot-seat handlers removed (kept for later)
    document.getElementById('btn-duel').onclick = () => { this.playerCount = 2; this.playerConfigs = []; this.showRegionSelect(0, 'duel'); };
    document.getElementById('btn-3p').onclick = () => { this.playerCount = 3; this.playerConfigs = []; this.showRegionSelect(0, 'duel'); };
    document.getElementById('btn-4p').onclick = () => { this.playerCount = 4; this.playerConfigs = []; this.showRegionSelect(0, 'duel'); };
    document.getElementById('btn-war-campaign').onclick = () => {
      if (this.warCampaignUI) {
        this.warCampaignUI.showPlayerCountSelect();
      }
    };
    */
    document.getElementById('btn-vs-ai').onclick = () => { this.showAIRegionSelect(); };
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

  // ─── vs AI Mode ─────────────────────────────────────────────

  showAIRegionSelect() {
    this.currentScreen = 'region-select';

    this.app.innerHTML = `
      <div class="region-select">
        <button class="global-menu-btn" id="btn-menu">☰ Menu</button>
        <h2>Choose Your Region</h2>
        <p class="player-label">vs AI — Select your homeland</p>
        <div class="region-grid">
          ${this._renderRegionCard('Northern', 'north', 'Resilient defenders. Masters of healing and fortification.', [])}
          ${this._renderRegionCard('Eastern', 'east', 'Cunning strategists. Spell mastery and shadow tactics.', [])}
          ${this._renderRegionCard('Southern', 'south', 'Aggressive warriors. Raw power and piercing strikes.', [])}
          ${this._renderRegionCard('Western', 'west', 'Adaptable tricksters. Unit synergy and effect manipulation.', [])}
        </div>
      </div>
    `;
    this._wireGlobalMenuButton();

    document.querySelectorAll('.region-card').forEach(card => {
      card.onclick = async () => {
        const region = card.dataset.region;
        const config = { name: 'You', region };

        // Offer deck choice if deck builder is available
        if (this.deckBuilderUI) {
          const deckIds = await this.deckBuilderUI.showDeckChoice(region, 'You');
          if (deckIds) {
            config.deckCardIds = deckIds;
          }
        }

        // Connect to server for AI game (bypass OnlineGameUI lobby events)
        if (this.onlineUI) {
          try {
            const net = this.onlineUI.net;
            // Disconnect any previous connection
            if (net.connected || net.ws) {
              net.disconnect();
            }
            net.removeAllListeners();

            // Connect directly without wiring lobby events
            const envUrl = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SERVER_URL;
            let url;
            if (envUrl) {
              url = envUrl;
            } else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
              url = `ws://${window.location.hostname}:4000`;
            } else {
              const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
              url = `${protocol}//${window.location.host}`;
            }

            await net.connect(url);

            // Wire only the MATCH_FOUND handler — skip ROOM_CREATED/SEARCHING etc.
            net.on('MATCH_FOUND', (msg) => {
              this.net = net;
              this.startOnlineGame(net, 0); // Human is always player 0
            });

            // Send PLAY_VS_AI request
            net.playVsAI(config.name, region, 'medium');
            return;
          } catch (e) {
            // fall through to error
          }
        }
        // Show connection error
        alert('Could not connect to server. Please make sure the server is running.');
      };
    });
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

  showLandmarkSelect(playerIndex, onlineLandmarks = null) {
    // Online mode: landmarks come from the server
    if (this.isOnline && onlineLandmarks) {
      const landmarks = onlineLandmarks;
      if (landmarks.length === 0) {
        this.net.send('SELECT_LANDMARK', { cardInstanceId: null });
        this._showOnlineWaiting('Waiting for opponent to select a landmark...');
        return;
      }

      this.app.innerHTML = `
        <div class="mulligan-screen">
          <h2>Select a Landmark</h2>
          <p>Choose a Landmark to play for free, or skip</p>
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

      let selectedInstanceId = null;

      document.querySelectorAll('.mulligan-card').forEach(el => {
        el.onclick = () => {
          document.querySelectorAll('.mulligan-card').forEach(c => c.classList.remove('landmark-selected'));
          el.classList.add('landmark-selected');
          selectedInstanceId = el.dataset.id;
          const btnAccept = document.getElementById('btn-accept-landmark');
          if (btnAccept) { btnAccept.style.opacity = '1'; btnAccept.style.pointerEvents = 'auto'; }
        };
      });

      document.getElementById('btn-accept-landmark').onclick = () => {
        if (!selectedInstanceId) return;
        this.net.send('SELECT_LANDMARK', { cardInstanceId: selectedInstanceId });
        this._showOnlineWaiting('Waiting for opponent...');
      };

      document.getElementById('btn-skip-landmark').onclick = () => {
        this.net.send('SELECT_LANDMARK', { cardInstanceId: null });
        this._showOnlineWaiting('Waiting for opponent...');
      };
      return;
    }

    // ─── Local mode (AI/duel/campaign) ───
    const gs = this.controller.gameState;
    const player = gs.getPlayerById(playerIndex);
    if (!player) {
      this.showMulliganScreen(0);
      return;
    }

    // In campaign/ai mode, skip AI player's landmark (already handled)
    if ((gs.gameMode === 'campaign' || gs.gameMode === 'ai') && playerIndex === 1) {
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

      // Next player or mulligan — skip AI in campaign/ai mode
      if (gs.gameMode === 'campaign' || gs.gameMode === 'ai') {
        this.showMulliganScreen(0);
      } else if (playerIndex < gs.players.length - 1) {
        const nextPlayer = gs.getPlayerById(playerIndex + 1);
        this.showTurnTransition(() => this.showLandmarkSelect(playerIndex + 1), nextPlayer);
      } else {
        const firstPlayer = gs.getPlayerById(0);
        this.showTurnTransition(() => this.showMulliganScreen(0), firstPlayer);
      }
    };

    document.getElementById('btn-skip-landmark').onclick = () => {
      if (gs.gameMode === 'campaign' || gs.gameMode === 'ai') {
        this.showMulliganScreen(0);
      } else if (playerIndex < gs.players.length - 1) {
        const nextPlayer = gs.getPlayerById(playerIndex + 1);
        this.showTurnTransition(() => this.showLandmarkSelect(playerIndex + 1), nextPlayer);
      } else {
        const firstPlayer = gs.getPlayerById(0);
        this.showTurnTransition(() => this.showMulliganScreen(0), firstPlayer);
      }
    };
  }

  // ─── Mulligan Screen ──────────────────────────────────────

  showMulliganScreen(playerIndex, onlineHand = null) {
    // Online mode: hand comes from the server
    if (this.isOnline && onlineHand) {
      const hand = onlineHand;
      const selectedIds = new Set();

      const renderMulligan = () => {
        this.app.innerHTML = `
          <div class="mulligan-screen">
            <button class="global-menu-btn" id="btn-menu">☰ Menu</button>
            <h2>Mulligan Phase</h2>
            <p>Select cards to replace (click to toggle)</p>
            <div class="mulligan-cards">
              ${hand.map(card => `
                <div class="game-card mulligan-card ${this._getRegionClass(card.region)} ${selectedIds.has(card.instanceId) ? 'selected' : ''}"
                     data-id="${card.instanceId}" style="width:110px;height:154px;position:relative">
                  ${this._renderCardVisual(card)}
                </div>
              `).join('')}
            </div>
            <div style="display:flex;gap:16px;align-items:center">
              <button class="action-btn primary" id="btn-accept-mulligan">
                ${selectedIds.size === 0 ? 'Accept Hand' : `Remove ${selectedIds.size} Card${selectedIds.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        `;

        document.querySelectorAll('.mulligan-card').forEach(el => {
          el.onclick = () => {
            const id = el.dataset.id;
            if (selectedIds.has(id)) selectedIds.delete(id);
            else selectedIds.add(id);
            renderMulligan();
          };
        });
        this._wireGlobalMenuButton();

        document.getElementById('btn-accept-mulligan').onclick = () => {
          this.net.send('MULLIGAN', { cardInstanceIds: [...selectedIds] });
          this._showOnlineWaiting('Waiting for opponent...');
        };
      };

      renderMulligan();
      return;
    }

    // ─── Local mode (AI/duel/campaign) ───
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
            <button class="action-btn primary" id="btn-accept-mulligan">
              ${selectedIds.size === 0 ? 'Accept Hand' : `Remove ${selectedIds.size} Card${selectedIds.size !== 1 ? 's' : ''}`}
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

      document.getElementById('btn-accept-mulligan').onclick = async () => {
        await this.controller.mulligan(playerIndex, [...selectedIds]);
        if (gs.gameMode === 'campaign') {
          // Auto-mulligan for AI then start
          if (this.campaignUI) await this.campaignUI.handleAIMulligan();
          this.showTurnTransition();
        } else if (gs.gameMode === 'ai') {
          // Auto-mulligan for AI then start
          if (this.ai) {
            const aiPlayer = gs.getPlayerById(1);
            const toMulligan = this.ai.chooseMulligan(aiPlayer.hand);
            await this.controller.mulligan(1, toMulligan);
          }
          // Go straight to the game (no transition screen)
          this.render();
        } else if (playerIndex < gs.players.length - 1) {
          const nextPlayer = gs.getPlayerById(playerIndex + 1);
          this.showTurnTransition(() => this.showMulliganScreen(playerIndex + 1), nextPlayer);
        } else {
          this.showTurnTransition();
        }
      };
    };

    renderMulligan();
  }

  // ─── Turn Transition ──────────────────────────────────────

  showTurnTransition(onContinue = null, overridePlayer = null, onlineMsg = null) {
    // Online mode turn transition
    if (this.isOnline && onlineMsg) {
      const isMyTurn = onlineMsg.activePlayerId === this.myPlayerId;
      const label = isMyTurn ? 'Your Turn' : "Opponent's Turn";
      const roundInfo = onlineMsg.round ? `Round ${onlineMsg.round}` : '';

      this._showTurnBanner(label, roundInfo);
      // After short delay, re-render the board
      setTimeout(() => this.render(), 500);
      return;
    }

    // ─── Local mode ───
    const gs = this._gs;
    if (!gs) return;
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
    // Clean up any orphaned floating UI elements
    document.querySelectorAll('.popup-hover-preview, .card-flying, .hand-select-banner, .turn-banner, .destruction-particle, .mana-crystal-float, .chain-flash').forEach(e => e.remove());

    const gs = this._gs;
    if (!gs) return;
    if (gs.gameOver) {
      if (this.isOnline) return; // Online game over handled by GAME_OVER event
      this.showGameOver();
      return;
    }

    const active = gs.getActivePlayer();
    const players = gs.players;
    const numPlayers = players.length;

    // In campaign/ai mode, always show from human player's perspective (player 0)
    // In online mode, always show from our player's perspective
    // In other modes, active player is rendered at bottom
    const isFixedPerspective = gs.gameMode === 'campaign' || gs.gameMode === 'ai' || this.isOnline;
    const p1 = this.isOnline ? gs.players[this.myPlayerId] : (isFixedPerspective ? players[0] : active);
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
      this._spawnFieldParticles();

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
      this._spawnFieldParticles();
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
        <div class="hand-count" title="Cards in hand" style="display:flex;align-items:center;gap:4px;font-size:0.75rem;color:var(--text-secondary);padding:2px 8px;background:rgba(255,255,255,0.05);border-radius:8px">
          <span>🃏</span><span>${player.hand.length}</span>
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
          <span style="position:relative; z-index:1; background:rgba(0,0,0,0.75); padding:2px 8px; border-radius:4px; font-weight:bold; box-shadow:0 0 4px rgba(0,0,0,0.8);">${player.deckCount !== undefined ? player.deckCount : (player.deck ? player.deck.length : 0)}</span>
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
    const gs = this._gs;
    const isMainPhase = gs.phase === PHASES.MAIN1 || gs.phase === PHASES.MAIN2;
    const canAct = this._isMyTurn();

    return `
      <div class="hand-container">
        <div class="hand-label" style="text-align:center;font-size:0.7rem;color:var(--text-muted);margin-bottom:2px">Hand (${player.hand.length})</div>
        <div class="hand-cards">
          ${player.hand.map(card => {
      // Handle hidden cards (opponent's hand in online mode)
      if (card.hidden) {
        return `<div class="hand-card game-card face-down" style="width:var(--card-w);height:var(--card-h)">
          <img class="card-image" src="./Background.webp" alt="Hidden" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-card)" />
        </div>`;
      }

      let canPlay;
      if (this.isOnline) {
        // Online: lightweight client-side validation for consistent visual feedback
        // (server still does full validation on action)
        const pm = player.primaryMana || 0;
        const sm = player.spellMana || 0;
        const cost = card.manaCost || 0;
        const unitSlots = player.unitZone || [];
        const stSlots = player.spellTrapZone || [];
        const hasUnitSlot = unitSlots.some(s => s === null);
        const hasSTSlot = stSlots.some(s => s === null);

        if (card.type === 'Unit') {
          canPlay = canAct && isMainPhase && pm >= cost && hasUnitSlot;
        } else if (card.type === 'Spell') {
          // Spell is playable if it can be activated (costs mana) OR set face-down (free, just needs a slot)
          canPlay = canAct && isMainPhase && ((pm + sm) >= cost || hasSTSlot);
        } else if (card.type === 'Trap') {
          canPlay = canAct && isMainPhase && hasSTSlot; // Traps are free to set; mana paid on activation
        } else if (card.type === 'Landmark') {
          canPlay = canAct && isMainPhase && (pm + sm) >= cost;
        } else {
          canPlay = false;
        }
      } else {
        canPlay = canAct && isMainPhase && (
          (card.type === 'Unit' && this.controller.actionValidator.canPlayUnit(player.id, card).valid) ||
          (card.type === 'Spell' && (this.controller.actionValidator.canPlaySpell(player.id, card).valid || this.controller.actionValidator.canSetSpell(player.id, card).valid)) ||
          (card.type === 'Trap' && this.controller.actionValidator.canSetTrap(player.id, card).valid) ||
          (card.type === 'Landmark' && this.controller.actionValidator.canPlayLandmark(player.id, card).valid)
        );
      }

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
    if (!card || (card.type !== 'Unit' && card.type !== 'Token')) return '';

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
    // During AI/online opponent turn, hide action buttons — player cannot act
    if (!this._isMyTurn()) {
      return `<div class="action-panel"><span class="waiting-label">Opponent's Turn</span></div>`;
    }

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
        // Block hand interactions when it's not our turn
        if (!this._isMyTurn()) return;
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
        // Block field card interactions when it's not our turn (allow zoom only)
        if (!this._isMyTurn()) {
          if (!el.classList.contains('face-down')) {
            this._showCardZoom(cardId || el.querySelector('img')?.alt);
          }
          return;
        }
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
          // Opponent card — show zoom only (but not if face-down)
          if (!el.classList.contains('face-down')) {
            this._showCardZoom(cardId || el.querySelector('img')?.alt);
          }
        }
      };
    });

    // Highlight valid attack targets when attackingUnit is set
    if (this.attackingUnit) {
      this._highlightAttackTargets();
    } else {
      this._removeAttackHighlights();
    }

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
          // Summon circle effect on the slot
          this._showSummonCircle(el);
          this._doAction('playUnit', p.player.id, p.cardInstanceId, p.position, slotIdx).then(r => {
            if (r && !r.success) this._showToast(r.reason);
          }).catch(err => {
            console.error('playUnit threw an exception:', err);
            this._showToast('Error playing unit. See console.');
          });
        } else if (p.type === 'SpellSet' && isSpellTrapZone) {
          this._doAction('setSpell', p.player.id, p.cardInstanceId, slotIdx).then(r => {
            if (r && !r.success) this._showToast(r.reason);
          }).catch(err => {
            console.error('setSpell threw:', err);
            this._showToast('Error setting spell.');
          });
        } else if (p.type === 'TrapSet' && isSpellTrapZone) {
          this._doAction('setTrap', p.player.id, p.cardInstanceId, slotIdx).then(r => {
            if (r && !r.success) this._showToast(r.reason);
          }).catch(err => {
            console.error('setTrap threw:', err);
            this._showToast('Error setting trap.');
          });
        } else if (p.type === 'Landmark' && isLandmarkSlot) {
          this._doAction('playLandmark', p.player.id, p.cardInstanceId, playerId).then(r => {
            if (r && !r.success) this._showToast(r.reason);
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

    // LP bar click — direct attack is now handled by the action menu dialog,
    // so no LP-click handler is needed.

    // Action buttons
    const btnBattle = document.getElementById('btn-battle');
    const btnEndTurn = document.getElementById('btn-endturn');
    const btnEndBattle = document.getElementById('btn-endbattle');
    const btnCancelAction = document.getElementById('btn-cancel-action');

    if (btnBattle) btnBattle.onclick = () => this._doAction('enterBattlePhase');
    if (btnEndTurn) btnEndTurn.onclick = () => {
      if (this.isOnline) {
        this._doAction('endTurn');
        return;
      }
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
      }).catch(err => {
        console.error('End turn error — recovering:', err);
        // Ensure the game doesn't get stuck: attempt AI transition anyway
        if (gs.gameOver) {
          this.showGameOver();
        } else if (gs.gameMode === 'campaign' && this.campaignUI) {
          this.campaignUI.handleTurnTransition();
        } else {
          this.render();
        }
      });
    };
    if (btnEndBattle) btnEndBattle.onclick = () => this._doAction('exitBattlePhase');
    if (btnCancelAction) btnCancelAction.onclick = () => {
      this.attackingUnit = null;
      this.pendingPlacement = null;
      this._removeAttackHighlights();
      this.render();
    };

    const btnMenu = document.getElementById('btn-menu');
    if (btnMenu) btnMenu.onclick = () => {
      this.showChoiceDialog(
        [{ label: '✅ Return to Main Menu', value: 'yes' }, { label: '✕ Cancel', value: 'no' }],
        'Are you sure you want to leave the game?',
        (choice) => {
          if (choice.value === 'yes') {
            if (this.isOnline && this.net) {
              this.net.disconnect();
              this.endOnlineGame();
            }
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
      let canSummon;
      if (this.isOnline) {
        const hasSlot = (player.unitZone || []).some(s => s === null);
        canSummon = (player.primaryMana || 0) >= (card.manaCost || 0) && hasSlot;
      } else {
        canSummon = this.controller.actionValidator.canPlayUnit(player.id, card).valid;
      }
      if (canSummon) {
        options.push({ label: '⚔ Summon in ATK', value: 'atk', icon: '⚔' });
        options.push({ label: '🛡 Set in DEF', value: 'def', icon: '🛡' });
      }
      if (options.length === 0) {
        if (this.isOnline) {
          const hasSlot = (player.unitZone || []).some(s => s === null);
          if (!hasSlot) this._showToast('No available Unit slots.');
          else this._showToast('Not enough mana.');
        } else {
          this._showToast(this.controller.actionValidator.canPlayUnit(player.id, card).reason || 'Cannot play this card.');
        }
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
      let canActivate, canSet;
      if (this.isOnline) {
        const totalMana = (player.primaryMana || 0) + (player.spellMana || 0);
        const hasSTSlot = (player.spellTrapZone || []).some(s => s === null);
        canActivate = totalMana >= (card.manaCost || 0);
        canSet = hasSTSlot; // Setting a spell is free (mana paid on activation)
      } else {
        canActivate = this.controller.actionValidator.canPlaySpell(player.id, card).valid;
        canSet = this.controller.actionValidator.canSetSpell(player.id, card).valid;
      }
      if (canActivate) options.push({ label: '✦ Activate', value: 'activate', icon: '✦' });
      if (canSet) options.push({ label: '⬇ Set', value: 'set', icon: '⬇' });
      if (options.length === 0) {
        this._showToast('Cannot play this Spell right now.');
        return;
      }
      this._showCardActionMenu(rect, options, (choice) => {
        if (choice.value === 'activate') {
          this._pendingPlayAnim = { rect: el.getBoundingClientRect(), imgSrc };
          this._doAction('playSpell', player.id, instanceId).then(r => {
            if (r && !r.success) this._showToast(r.reason);
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
      // Traps can only be Set face-down (no mana cost to set; mana is paid on activation)
      let canSet;
      if (this.isOnline) {
        const hasSTSlot = (player.spellTrapZone || []).some(s => s === null);
        canSet = hasSTSlot;
      } else {
        canSet = this.controller.actionValidator.canSetTrap(player.id, card).valid;
      }
      if (!canSet) {
        this._showToast('No available Spell/Trap slots.');
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
      let canPlay;
      if (this.isOnline) {
        const totalMana = (player.primaryMana || 0) + (player.spellMana || 0);
        canPlay = totalMana >= (card.manaCost || 0);
      } else {
        canPlay = this.controller.actionValidator.canPlayLandmark(player.id, card).valid;
      }
      if (!canPlay) {
        this._showToast(this.isOnline ? 'Not enough mana.' : (this.controller.actionValidator.canPlayLandmark(player.id, card).reason || 'Cannot play this Landmark.'));
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
    SharedUI.showCardActionMenu(rect, options, callback);
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
      if (gs.phase === PHASES.BATTLE) {
        const canAttack = unit.position === 'ATK'
          && !(unit.hasAttackedThisTurn && (unit.attackCount || 1) >= (unit.maxAttacks || 1))
          && !(unit.summonedThisTurn && !unit.keywords?.includes('RUSH'))
          && !unit.hasChangedPositionThisTurn;
        if (canAttack) options.push({ label: '⚔ Attack', value: 'attack', icon: '⚔' });
      }
      // Main phase: switch position (once per turn, not after attacking)
      const isMainPhase = gs.phase === PHASES.MAIN1 || gs.phase === PHASES.MAIN2;
      if (isMainPhase && !unit.summonedThisTurn && !unit.hasChangedPositionThisTurn && !unit.hasAttackedThisTurn) {
        const newPos = unit.position === 'ATK' ? 'DEF' : 'ATK';
        options.push({ label: `🔄 Switch to ${newPos}`, value: 'switch', icon: '🔄' });
      }
      // Main phase: activate ability (once per round effects)
      const isMainPhase2 = gs.phase === PHASES.MAIN1 || gs.phase === PHASES.MAIN2;
      const hasActivatedAbility = unit.effectTriggers?.includes('ACTIVATED');
      const canAbility = isMainPhase2 && hasActivatedAbility && !unit.activatedThisRound && !unit.activatedThisTurn;
      if (canAbility) {
        options.push({ label: '⚡ Activate', value: 'activate_ability', icon: '⚡' });
      }
    }

    if (spellTrap && spellTrap.faceUp === false) {
      const isMainPhase = gs.phase === PHASES.MAIN1 || gs.phase === PHASES.MAIN2;
      if (isMainPhase && spellTrap.type === 'Spell') {
        options.push({ label: '✦ Activate', value: 'activate_set', icon: '✦' });
      }
      // Allow face-down Traps with SELF trigger to be activated during Main Phase (e.g. E048)
      if (isMainPhase && spellTrap.type === 'Trap' && !spellTrap.setThisTurn) {
        // Show activate option for traps with SELF trigger
        // In online mode, we don't have effectEngine access, so show for all and let server validate
        if (this.isOnline) {
          options.push({ label: '⚡ Activate', value: 'activate_set_trap', icon: '⚡' });
        } else {
          const effects = this.controller.effectEngine.getEffects(spellTrap.cardId);
          const hasSelfTrigger = effects.some(e => e.trigger === 'SELF');
          if (hasSelfTrigger) {
            const canAct = this.controller.actionValidator.canActivateTrap(player.id, spellTrap, {
              effectEngine: this.controller.effectEngine,
              triggerContext: {}
            });
            if (canAct.valid) {
              options.push({ label: '⚡ Activate', value: 'activate_set_trap', icon: '⚡' });
            }
          }
        }
      }
    }

    // Always allow zoom
    const cardId = el.dataset.cardId;
    options.push({ label: '🔍 View Card', value: 'zoom', icon: '🔍' });

    this._showCardActionMenu(rect, options, (choice) => {
      if (choice.value === 'attack') {
        // Check if unit is eligible for direct attack
        const opponents = gs.getOpponents(player.id);
        let directTarget = null;
        // Check if unit can attack directly (same logic for both modes)
        for (const opp of opponents) {
          if (opp && opp.isAlive) {
            const oppUnits = opp.getFieldUnits();
            // Direct attack allowed if: no opponent units, or attacker has SHADOW and no shadow blockers
            if (oppUnits.length === 0) {
              directTarget = opp;
              break;
            }
            if (unit.keywords?.includes('SHADOW')) {
              const hasShadowBlocker = oppUnits.some(u => u.keywords?.includes('SHADOW'));
              if (!hasShadowBlocker) {
                directTarget = opp;
                break;
              }
            }
          }
        }

        if (directTarget) {
          const isShadow = unit.keywords?.includes('SHADOW');
          const hasOpponentUnits = directTarget.getFieldUnits().length > 0;
          this.showChoiceDialog(
            [{ label: '✅ Yes, attack directly', value: 'yes' }, { label: '✕ No', value: 'no' }],
            `Attack ${directTarget.name}'s LP directly with ${unit.name}?`,
            (dialogChoice) => {
              if (dialogChoice.value === 'yes') {
                // Direct attack on LP
                this._showAttackAnimation(unit, null, directTarget);
                this._doAction('declareAttack', player.id, instanceId, {
                  type: 'direct',
                  player: directTarget,
                }).then(result => {
                  if (result && !result.success) this._showToast(result.reason);
                });
              } else if (isShadow && hasOpponentUnits) {
                // Shadow unit: enter target selection to pick a unit
                this.attackingUnit = instanceId;
                this._showToast(`Select a unit to attack with ${unit.name}`);
                this.render();
              } else {
                // Non-shadow or no units to attack: cancel
                this.render();
              }
            }
          );
        } else {
          // Not eligible for direct attack — enter target selection
          this.attackingUnit = instanceId;
          this._showToast(`${unit.name} selected — click a target`);
          this.render();
        }
      } else if (choice.value === 'switch') {
        // Trigger position switch animation
        const cardEl = document.querySelector(`.game-card[data-instance="${instanceId}"]`);
        const newPos = unit.position === 'ATK' ? 'DEF' : 'ATK';
        if (cardEl) {
          cardEl.classList.add(newPos === 'DEF' ? 'switching-to-def' : 'switching-to-atk');
          setTimeout(() => cardEl.classList.remove('switching-to-def', 'switching-to-atk'), 350);
        }
        this._doAction('changePosition', player.id, instanceId).then(r => {
          if (r && !r.success) this._showToast(r.reason);
        });
      } else if (choice.value === 'activate_set') {
        this._doAction('activateSetSpell', player.id, instanceId).then(r => {
          if (r && !r.success) this._showToast(r.reason);
        });
      } else if (choice.value === 'activate_set_trap') {
        this._doAction('activateTrap', player.id, instanceId).then(r => {
          if (r && !r.success) this._showToast(r.reason);
        });
      } else if (choice.value === 'activate_ability') {
        this._doAction('activateAbility', player.id, instanceId).then(r => {
          if (r && !r.success) this._showToast(r.reason);
        });
      } else if (choice.value === 'zoom') {
        this._showCardZoom(cardId);
      }
    });
  }

  _onFieldUnitClick(instanceId, player, gs) {
    const unit = player.getFieldUnits().find(u => u.instanceId === instanceId);
    if (!unit) return;

    const canAttack = unit.position === 'ATK'
      && !(unit.hasAttackedThisTurn && (unit.attackCount || 1) >= (unit.maxAttacks || 1))
      && !(unit.summonedThisTurn && !unit.keywords?.includes('RUSH'))
      && !unit.hasChangedPositionThisTurn;
    if (canAttack) {
      this.attackingUnit = instanceId;
      this._showToast(`${unit.name} selected — click a target`);
      this.render();
    }
  }

  _onAttackTargetClick(instanceId, playerId, opponent, gs) {
    const target = opponent.getFieldUnits().find(u => u.instanceId === instanceId);
    if (target) {
      const activePlayer = gs.getActivePlayer();
      const attackerUnit = activePlayer.getFieldUnits().find(u => u.instanceId === this.attackingUnit);
      const attackerInstanceId = this.attackingUnit;
      this.attackingUnit = null;
      this._removeAttackHighlights();
      this._showAttackAnimation(attackerUnit, target, null);
      this._doAction('declareAttack', gs.activePlayerIndex, attackerInstanceId, {
        type: 'unit',
        card: target,
        player: opponent,
      }).then(result => {
        if (result && !result.success) this._showToast(result.reason);
      });
    }
  }

  // ─── Target Selection ─────────────────────────────────────

  showTargetSelection(targets, description, callback) {
    if (targets.length === 0) {
      callback(null);
      return;
    }

    // Check if targets are cards on the field (units/spells/traps with instanceIds visible on board)
    const fieldInstanceIds = new Map(); // instanceId → target index
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const instanceId = t.instanceId || t.card?.instanceId;
      if (instanceId) {
        // Check if this card is actually on the field (has a matching DOM element)
        const fieldEl = document.querySelector(`.card-slot[data-instance="${instanceId}"]`);
        if (fieldEl) {
          fieldInstanceIds.set(instanceId, i);
        }
      }
    }

    // If ALL targets are on the field → use on-field click selection
    if (fieldInstanceIds.size > 0 && fieldInstanceIds.size === targets.length) {
      this._showFieldTargetSelection(targets, fieldInstanceIds, description, callback);
      return;
    }

    // Fallback: standard popup dialog for non-field targets (landmarks, special objects, etc.)
    this._showDialogTargetSelection(targets, description, callback);
  }

  /**
   * Highlight valid target cards on the field and let the player click them directly.
   * Shows a floating banner with the prompt and a cancel button.
   */
  _showFieldTargetSelection(targets, fieldInstanceIds, description, callback) {
    let resolved = false;

    // Create a semi-transparent overlay that doesn't block field cards
    const overlay = document.createElement('div');
    overlay.className = 'field-target-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:150;pointer-events:none';

    // Floating banner with description and cancel
    const banner = document.createElement('div');
    banner.className = 'field-target-banner';
    banner.style.cssText = `
      position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:201;
      background:rgba(0,0,0,0.85);border:2px solid #ffd700;border-radius:12px;
      padding:12px 28px;text-align:center;pointer-events:auto;
      box-shadow:0 4px 24px rgba(255,215,0,0.3);backdrop-filter:blur(8px);
      animation:fadeInDown 0.3s ease;
    `;
    banner.innerHTML = `
      <div style="color:#ffd700;font-weight:bold;font-size:1rem;margin-bottom:8px">${description}</div>
      <div style="color:#ccc;font-size:0.8rem;margin-bottom:10px">Click a highlighted card on the field</div>
      <button class="menu-btn field-target-cancel" style="padding:6px 20px;font-size:0.8rem;opacity:0.9">✕ Cancel</button>
    `;
    document.body.appendChild(overlay);
    document.body.appendChild(banner);

    // Highlight valid targets on the field
    const highlightedEls = [];
    for (const [instanceId] of fieldInstanceIds) {
      const slotEl = document.querySelector(`.card-slot[data-instance="${instanceId}"]`);
      if (slotEl) {
        slotEl.style.outline = '3px solid #ffd700';
        slotEl.style.outlineOffset = '2px';
        slotEl.style.boxShadow = '0 0 16px 4px rgba(255,215,0,0.5)';
        slotEl.style.zIndex = '160';
        slotEl.style.position = 'relative';
        slotEl.style.cursor = 'pointer';
        slotEl.classList.add('target-highlight');
        highlightedEls.push(slotEl);
      }
    }

    const cleanup = () => {
      overlay.remove();
      banner.remove();
      for (const el of highlightedEls) {
        el.style.outline = '';
        el.style.outlineOffset = '';
        el.style.boxShadow = '';
        el.style.zIndex = '';
        el.style.cursor = '';
        el.classList.remove('target-highlight');
      }
      // Remove click listeners
      document.removeEventListener('click', fieldClickHandler, true);
    };

    // Click handler that intercepts clicks on highlighted field cards
    const fieldClickHandler = (e) => {
      if (resolved) return;

      // Walk up from the clicked element to find a card-slot with data-instance
      let el = e.target;
      while (el && !el.dataset?.instance) {
        el = el.parentElement;
      }

      if (el && fieldInstanceIds.has(el.dataset.instance)) {
        e.stopPropagation();
        e.preventDefault();
        resolved = true;
        const idx = fieldInstanceIds.get(el.dataset.instance);
        cleanup();
        callback(targets[idx]);
      }
    };

    // Use capture phase to intercept before normal handlers
    document.addEventListener('click', fieldClickHandler, true);

    // Cancel button
    banner.querySelector('.field-target-cancel').onclick = (e) => {
      e.stopPropagation();
      if (resolved) return;
      resolved = true;
      cleanup();
      callback(null);
    };
  }

  /**
   * Fallback dialog-based target selection for non-field targets.
   */
  _showDialogTargetSelection(targets, description, callback) {
    const options = targets.map((t, i) => ({
      label: t.name || t.card?.name || `Target ${i + 1}`,
      value: i,
      cardId: t.cardId || t.card?.cardId || null,
    }));

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:200;display:flex;align-items:center;justify-content:center';

    overlay.innerHTML = `
      <div class="choice-dialog">
        <h3>${description}</h3>
        <div class="choice-options" style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:600px">
          ${options.map((opt, i) => {
      const cardId = opt.cardId || (typeof opt.value === 'string' && opt.value.match(/^[A-Z]\d{3}$/) ? opt.value : null);
      if (cardId || targets[i]?.cardId) {
        const cId = cardId || targets[i].cardId;
        const t = targets[i];
        const hasStats = t && (t.type === 'Unit' || t.type === 'Token') && t.currentATK !== undefined;
        const statAttrs = hasStats ? `data-atk="${t.currentATK}" data-def="${t.currentDEF}" data-base-atk="${t.baseATK}" data-base-def="${t.baseDEF}" data-damage="${t.damageTaken || 0}"` : '';
        return `
                <div class="choice-option" data-idx="${i}" style="display:flex;flex-direction:column;align-items:center;padding:8px;max-width:120px">
                  <img src="./output-web/${cId}.webp" alt="${opt.label}"
                       class="popup-card-thumb" data-card-id="${cId}" ${statAttrs}
                       style="width:80px;height:112px;object-fit:contain;border-radius:6px;margin-bottom:6px;border:1px solid var(--glass-border)" />
                  <span style="font-size:0.7rem;text-align:center">${opt.label}</span>
                </div>
              `;
      }
      return `<div class="choice-option" data-idx="${i}">${opt.label}</div>`;
    }).join('')}
        </div>
        <button class="menu-btn target-cancel-btn" style="margin-top:16px;padding:10px 28px;opacity:0.8">✕ Cancel</button>
      </div>
    `;

    this.app.appendChild(overlay);

    // Click outside dialog to cancel
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.remove();
        callback(null);
      }
    };
    overlay.querySelector('.choice-dialog').onclick = (e) => e.stopPropagation();

    overlay.querySelectorAll('.choice-option').forEach(el => {
      el.onclick = () => {
        const idx = parseInt(el.dataset.idx);
        overlay.remove();
        callback(targets[idx]);
      };
    });

    // Cancel button — returns null to cancel the effect
    overlay.querySelector('.target-cancel-btn').onclick = () => {
      overlay.remove();
      callback(null);
    };

    // Hover-to-zoom on card images in the target dialog
    this._attachPopupHoverZoom(overlay);
  }

  // ─── Choice Dialog ────────────────────────────────────────

  showChoiceDialog(options, description, callback) {
    SharedUI.showChoiceDialog(this.app, options, description, callback);
  }

  // ─── Opponent Response Dialog ────────────────────────────

  showOpponentResponseDialog(player, callback, chainContext = {}) {
    const faceDownCards = player.getFaceDownCards().filter(c =>
      (c.type === 'Spell' || c.type === 'Trap') && !c.setThisTurn
    );
    if (faceDownCards.length === 0) {
      callback({ activate: false });
      return;
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:70;display:flex;align-items:center;justify-content:center';

    // Check which cards can be activated (mana check + condition check)
    // In online mode, server already validated — treat all as activatable
    const triggerContext = chainContext.triggerContext || {};
    const triggerType = chainContext.triggerType || 'action';
    const chainStack = chainContext.chainStack || [];

    const cardStates = faceDownCards.map(card => {
      if (this.isOnline) {
        // Server already filtered which cards can respond — all are activatable
        return { card, canActivate: true, reason: '' };
      }
      let canActivate = false;
      let reason = '';
      const validator = this.controller.actionValidator;
      const effectEngine = this.controller.effectEngine;
      if (card.type === 'Trap') {
        const result = validator.canActivateTrap(player.id, card, {
          effectEngine,
          triggerContext,
          triggerType
        });
        canActivate = result.valid;
        reason = result.reason || '';
      } else if (card.type === 'Spell') {
        const result = validator.canActivateSetSpell(player.id, card, { isResponse: true });
        canActivate = result.valid;
        reason = result.reason || '';
      }
      return { card, canActivate, reason };
    });

    // Build trigger description for context
    let triggerDesc = 'an action was performed';
    if (triggerType === 'attack') triggerDesc = 'an attack was declared';
    else if (triggerType === 'summon') triggerDesc = 'a unit was summoned';
    else if (triggerType === 'spell') triggerDesc = 'a spell was activated';
    else if (triggerType === 'set') triggerDesc = 'a card was set';
    else if (triggerType === 'destroy') triggerDesc = 'a unit was destroyed';
    else if (triggerType === 'phase_change') {
      const phaseCtx = chainContext.triggerContext || {};
      if (phaseCtx.phase === 'MAIN1') triggerDesc = 'Main Phase 1 has started';
      else if (phaseCtx.phase === 'BATTLE') triggerDesc = 'Battle Phase has started';
      else if (phaseCtx.phase === 'MAIN2') triggerDesc = 'Main Phase 2 has started';
      else triggerDesc = 'a phase change occurred';
    }

    const chainInfo = chainStack.length > 0
      ? `<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap;justify-content:center">
          <span style="color:var(--text-muted);font-size:0.7rem">Chain:</span>
          ${chainStack.map(c => {
        const hasStats = c.card.type === 'Unit' || c.card.type === 'Token';
        const statAttrs = hasStats ? `data-atk="${c.card.currentATK}" data-def="${c.card.currentDEF}" data-base-atk="${c.card.baseATK}" data-base-def="${c.card.baseDEF}" data-damage="${c.card.damageTaken || 0}"` : '';
        return `
            <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
              <img src="./output-web/${c.card.cardId}.webp" alt="${c.card.name}"
                   class="popup-card-thumb" data-card-id="${c.card.cardId}" ${statAttrs}
                   style="width:40px;height:56px;object-fit:cover;border-radius:4px;border:1px solid var(--gold)" />
              <span style="font-size:0.55rem;color:var(--text-secondary);max-width:50px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.card.name}</span>
            </div>
          `}).join('<span style="color:var(--gold);font-size:0.7rem">→</span>')}
        </div>`
      : '';

    // Build attack context info showing attacker and target
    let attackContextHtml = '';
    if (triggerType === 'attack' && triggerContext.attacker) {
      const atkCard = triggerContext.attacker;
      const targetInfo = triggerContext.target;
      const atkStatAttrs = `data-atk="${atkCard.currentATK}" data-def="${atkCard.currentDEF}" data-base-atk="${atkCard.baseATK}" data-base-def="${atkCard.baseDEF}" data-damage="${atkCard.damageTaken || 0}"`;
      let targetHtml = '';
      if (targetInfo?.type === 'unit' && targetInfo.card) {
        const tgt = targetInfo.card;
        const tgtStatAttrs = `data-atk="${tgt.currentATK}" data-def="${tgt.currentDEF}" data-base-atk="${tgt.baseATK}" data-base-def="${tgt.baseDEF}" data-damage="${tgt.damageTaken || 0}"`;
        targetHtml = `
          <div class="attack-context-card">
            <img src="./output-web/${tgt.cardId}.webp" alt="${tgt.name}" class="popup-card-thumb" data-card-id="${tgt.cardId}" ${tgtStatAttrs} />
            <span>${tgt.name}</span>
          </div>
        `;
      } else if (targetInfo?.type === 'direct') {
        targetHtml = `<div class="attack-context-card"><span style="font-size:1.5rem">💥</span><span>Direct Attack</span></div>`;
      }
      attackContextHtml = `
        <div class="attack-context-row">
          <div class="attack-context-card">
            <img src="./output-web/${atkCard.cardId}.webp" alt="${atkCard.name}" class="popup-card-thumb" data-card-id="${atkCard.cardId}" ${atkStatAttrs} />
            <span>${atkCard.name}</span>
          </div>
          <span class="attack-context-arrow">⚔→</span>
          ${targetHtml}
        </div>
      `;
    }

    overlay.innerHTML = `
      <div class="choice-dialog response-card-dialog">
        <h3 style="color:var(--gold)">${player.name} — Respond?</h3>
        <p style="color:var(--text-muted);font-size:0.8rem;margin-bottom:8px">
          ${triggerDesc.charAt(0).toUpperCase() + triggerDesc.slice(1)}. Activate a face-down card?
        </p>
        ${attackContextHtml}
        ${chainInfo}
        <div class="response-cards-row">
          ${cardStates.map(({ card, canActivate, reason }) => `
            <div class="response-card-wrapper" data-instance="${card.instanceId}">
              <div class="response-card-img-wrap">
                <img src="./output-web/${card.cardId}.webp" alt="${card.name}" class="response-card-img" />
              </div>
              <span class="response-card-name">${card.name}</span>
              <span class="response-card-cost">Mana: ${card.manaCost}</span>
              <div class="response-card-buttons">
                ${canActivate
        ? `<button class="menu-btn primary resp-activate-btn" data-instance="${card.instanceId}" style="padding:6px 14px;font-size:0.75rem">⚡ Activate</button>`
        : `<span class="response-card-no-mana">${reason || 'Cannot activate'}</span>`
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

    // Click outside dialog to pass
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.remove();
        callback({ activate: false });
      }
    };
    overlay.querySelector('.response-card-dialog').onclick = (e) => e.stopPropagation();

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
        // Chain flash visual
        this._triggerChainFlash();
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

    // Hover-to-zoom on card images in the response dialog
    this._attachPopupHoverZoom(overlay);
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

    // ─── Detect LP changes (screen shake + damage flash) ───
    for (const p of gs.players) {
      const prevLP = this._lastLP[p.id];
      if (prevLP !== undefined && p.lp < prevLP) {
        const dmg = prevLP - p.lp;
        // Screen shake for any LP damage
        this._triggerScreenShake();
        // Schedule floating number on the LP bar after render
        setTimeout(() => {
          const lpEl = document.getElementById(`lp-${p.id}`);
          if (lpEl) {
            const rect = lpEl.getBoundingClientRect();
            this.showFloatingNumber(rect.left + rect.width / 2, rect.top, `-${dmg}`, 'damage');
          }
        }, 50);
      } else if (prevLP !== undefined && p.lp > prevLP) {
        const heal = p.lp - prevLP;
        setTimeout(() => {
          const lpEl = document.getElementById(`lp-${p.id}`);
          if (lpEl) {
            const rect = lpEl.getBoundingClientRect();
            this.showFloatingNumber(rect.left + rect.width / 2, rect.top, `+${heal}`, 'heal');
          }
        }, 50);
      }
    }

    // ─── Detect unit destruction (particles) ───
    for (const p of gs.players) {
      const prevUnits = this._lastFieldUnits[p.id] || [];
      const currentUnits = p.getFieldUnits().map(u => u.instanceId);
      const destroyed = prevUnits.filter(id => !currentUnits.includes(id));
      if (destroyed.length > 0) {
        // Schedule particles after render for each destroyed unit
        for (const instanceId of destroyed) {
          setTimeout(() => this._spawnDestructionParticles(instanceId), 100);
        }
      }
    }

    // ─── Detect spell/trap flip (card flip animation) ───
    for (const p of gs.players) {
      const prevST = this._lastFieldSpellTraps[p.id] || {};
      for (const card of p.spellTrapZone) {
        if (card && card.faceUp && prevST[card.instanceId] === false) {
          // This card was just flipped face-up
          setTimeout(() => {
            const el = document.querySelector(`.game-card[data-instance="${card.instanceId}"]`);
            if (el) {
              el.classList.add('card-flipping');
              // Also add spell flash if it's a spell
              if (card.type === 'Spell') {
                el.classList.add('spell-activating');
              }
              setTimeout(() => {
                el.classList.remove('card-flipping', 'spell-activating');
              }, 600);
            }
          }, 50);
        }
      }
    }

    // ─── Detect mana changes (crystal animation) ───
    for (const p of gs.players) {
      const prevMana = this._lastMana[p.id];
      const currentMana = (p.primaryMana || 0) + (p.spellMana || 0);
      if (prevMana !== undefined && currentMana !== prevMana) {
        const diff = currentMana - prevMana;
        setTimeout(() => {
          const manaEl = document.querySelector(`.player-bar[data-player="${p.id}"] .mana-display`);
          if (manaEl) {
            this._showManaCrystal(manaEl, diff);
          }
        }, 50);
      }
    }

    // ─── Detect unit damage flash (units that took damage but survived) ───
    for (const p of gs.players) {
      for (const unit of p.getFieldUnits()) {
        const prevDmg = (this._lastUnitDamage[unit.instanceId] || 0);
        if (unit.damageTaken > prevDmg) {
          setTimeout(() => this._triggerDamageFlash(unit.instanceId), 80);
        }
      }
    }

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

    // Track state for all players
    for (const p of gs.players) {
      this._lastHandSizes[p.id] = p.hand.length;
      this._lastLP[p.id] = p.lp;
      this._lastFieldUnits[p.id] = p.getFieldUnits().map(u => u.instanceId);
      this._lastMana[p.id] = (p.primaryMana || 0) + (p.spellMana || 0);
      // Track unit damage for flash animation
      for (const unit of p.getFieldUnits()) {
        this._lastUnitDamage[unit.instanceId] = unit.damageTaken;
      }
      // Track spell/trap face-up state
      const stState = {};
      for (const card of p.spellTrapZone) {
        if (card) stState[card.instanceId] = card.faceUp;
      }
      this._lastFieldSpellTraps[p.id] = stState;
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
    SharedUI.showCardZoom(cardId);
  }

  // ─── Attack Target Highlights ──────────────────────────────

  /**
   * Highlight all valid attack targets on the field using the same gold
   * outline + glow style used for spell/trap/effect target selection.
   */
  _highlightAttackTargets() {
    this._removeAttackHighlights();

    const gs = this._gs;
    if (!gs) return;
    const activePlayer = gs.getActivePlayer();
    const attackerUnit = activePlayer.getFieldUnits().find(u => u.instanceId === this.attackingUnit);
    if (!attackerUnit) return;

    // Highlight the attacker card itself with a distinct style
    const attackerEl = document.querySelector(`.card-slot[data-instance="${this.attackingUnit}"]`);
    if (attackerEl) {
      attackerEl.style.outline = '3px solid #ff6b6b';
      attackerEl.style.outlineOffset = '2px';
      attackerEl.style.boxShadow = '0 0 16px 4px rgba(255,107,107,0.5)';
      attackerEl.style.zIndex = '160';
      attackerEl.style.position = 'relative';
      attackerEl.classList.add('attack-highlight-source');
    }

    // Find all valid targets and highlight them
    const opponents = gs.getOpponents(activePlayer.id);
    for (const opponent of opponents) {
      if (opponent._sealActive) continue;
      for (const unit of opponent.getFieldUnits()) {
        // In online mode, simplified targeting — all visible opponent units are valid
        // Check targeting rules: taunt units (Jarl N021, Guardian Golem W020) must be attacked first
        let isValid = true;
        const oppUnits = opponent.getFieldUnits();
        for (const u of oppUnits) {
          if (u.silenced) continue;
          if ((u.cardId === 'N021' || u.cardId === 'W020') && u.instanceId !== unit.instanceId) {
            isValid = false; break;
          }
        }
        if (isValid) {
          const slotEl = document.querySelector(`.card-slot[data-instance="${unit.instanceId}"]`);
          if (slotEl) {
            slotEl.style.outline = '3px solid #ffd700';
            slotEl.style.outlineOffset = '2px';
            slotEl.style.boxShadow = '0 0 16px 4px rgba(255,215,0,0.5)';
            slotEl.style.zIndex = '160';
            slotEl.style.position = 'relative';
            slotEl.style.cursor = 'pointer';
            slotEl.classList.add('target-highlight');
          }
        }
      }
    }
  }

  /**
   * Remove all attack target highlights from the field.
   */
  _removeAttackHighlights() {
    SharedUI.removeAttackHighlights();
  }

  // ─── Attack Declaration Animation ─────────────────────────

  _showAttackAnimation(attacker, targetUnit, targetPlayer) {
    if (!attacker) return;

    const overlay = document.createElement('div');
    overlay.className = 'attack-anim-overlay';

    let targetHtml = '';
    if (targetUnit) {
      targetHtml = `
        <div class="attack-anim-card">
          <img src="./output-web/${targetUnit.cardId}.webp" alt="${targetUnit.name}" />
          <span>${targetUnit.name}</span>
        </div>
      `;
    } else if (targetPlayer) {
      targetHtml = `
        <div class="attack-anim-card attack-anim-direct">
          <span class="attack-anim-lp-icon">💥</span>
          <span>${targetPlayer.name}</span>
        </div>
      `;
    }

    overlay.innerHTML = `
      <div class="attack-anim-content">
        <div class="attack-anim-card">
          <img src="./output-web/${attacker.cardId}.webp" alt="${attacker.name}" />
          <span>${attacker.name}</span>
        </div>
        <div class="attack-anim-slash">⚔</div>
        ${targetHtml}
      </div>
    `;

    document.body.appendChild(overlay);

    // Auto-remove after animation
    setTimeout(() => {
      overlay.classList.add('attack-anim-fade');
      setTimeout(() => overlay.remove(), 400);
    }, 1800);
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
      animation:float-up 4s ease-out forwards;
    `;
    toast.textContent = message;
    this.app.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
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
    const gs = this._gs;
    if (!gs && !this.isOnline) return;

    // Campaign mode: delegate to campaign UI
    if (gs && gs.gameMode === 'campaign' && this.campaignUI) {
      this.campaignUI._showPostBattle();
      return;
    }

    // War Campaign mode: delegate to war campaign UI
    if (gs && gs.gameMode === 'warCampaign' && this.warCampaignUI) {
      const winner = gs.winner;
      const loser = gs.players.find(p => p.id !== (winner ? winner.id : null));
      this.warCampaignUI.handleWarCampaignGameOver(winner, loser);
      return;
    }

    // ─── Unified Game Over (both AI and Online) ───
    const onlineMsg = this._onlineGameOverMsg || null;
    this._onlineGameOverMsg = null; // Clear after use

    // Determine win/loss
    let playerWon, titleText, subtitleText, isDefeat;
    let duration = 0, rounds = 0, turns = 0;
    let playerInfos = [];

    if (this.isOnline && onlineMsg) {
      // Online mode — data comes from server msg
      playerWon = onlineMsg.winner === this.myPlayerId;
      titleText = playerWon ? 'Victory!' : 'Defeat!';
      subtitleText = playerWon
        ? 'You won the battle!'
        : `${onlineMsg.winnerName || 'Opponent'} wins the battle!`;
      isDefeat = !playerWon;
      duration = onlineMsg.duration || 0; // Server already sends seconds
      rounds = onlineMsg.rounds || 0;
      turns = onlineMsg.turns || 0;
      playerInfos = (onlineMsg.players || []).map(p => `${p.name} (${p.region}) — ${p.lp} LP`);
    } else if (gs) {
      // AI / local mode — data comes from game state
      const winner = gs.winner;
      const isAI = gs.gameMode === 'ai';
      playerWon = winner && winner.id === 0;
      titleText = isAI ? (playerWon ? 'Victory!' : 'Defeat!') : 'Victory!';
      subtitleText = isAI
        ? (playerWon ? 'You won the battle!' : 'AI Opponent defeated you.')
        : (winner ? `${winner.name} wins the battle!` : 'Draw!');
      isDefeat = isAI && !playerWon;
      rounds = gs.roundCounter || 0;
      turns = gs.turnCounter || 0;
      // Calculate duration from match start if available
      if (this._onlineMatchStartedAt) {
        duration = Math.round((Date.now() - this._onlineMatchStartedAt) / 1000);
      }
      playerInfos = gs.players.map(p => `${p.name} (${p.region}) — ${p.lp} LP`);
    } else {
      return;
    }

    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;

    this.app.innerHTML = `
      <div class="game-over ${isDefeat ? 'defeat' : ''}">
        <button class="global-menu-btn" id="btn-menu">☰ Menu</button>
        ${isDefeat ? '<div class="defeat-vignette"></div>' : ''}
        ${!isDefeat ? '<div class="victory-particles" id="victory-particles"></div>' : ''}
        <h1>${titleText}</h1>
        <h2>${subtitleText}</h2>
        <div style="display:flex;gap:24px;margin:16px 0;justify-content:center;flex-wrap:wrap;position:relative;z-index:1">
          <div style="text-align:center">
            <div style="font-size:1.5rem;font-weight:bold;color:var(--gold)">${minutes}:${seconds.toString().padStart(2, '0')}</div>
            <div style="font-size:0.7rem;color:var(--text-muted)">Duration</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:1.5rem;font-weight:bold;color:var(--gold)">${rounds}</div>
            <div style="font-size:0.7rem;color:var(--text-muted)">Rounds</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:1.5rem;font-weight:bold;color:var(--gold)">${turns}</div>
            <div style="font-size:0.7rem;color:var(--text-muted)">Turns</div>
          </div>
        </div>
        ${playerInfos.map(info => `
          <div style="font-size:0.8rem;color:var(--text-secondary);position:relative;z-index:1">${info}</div>
        `).join('')}
        <div style="display:flex;gap:12px;margin-top:20px;position:relative;z-index:1">
          ${this.isOnline
        ? '<button class="menu-btn primary" id="btn-online-lobby">Return to Lobby</button><button class="menu-btn" id="btn-online-menu">☰ Main Menu</button>'
        : '<button class="menu-btn primary" id="btn-rematch">Play Again</button>'
      }
        </div>
      </div>
    `;
    this._wireGlobalMenuButton();

    // Spawn victory particles
    if (!isDefeat) {
      this._spawnVictoryParticles();
    }

    // Wire buttons based on mode
    if (this.isOnline) {
      document.getElementById('btn-online-lobby').onclick = () => {
        this.endOnlineGame();
        if (this.onlineUI) this.onlineUI.showLobby();
      };
      document.getElementById('btn-online-menu').onclick = () => {
        if (this.net) this.net.disconnect();
        this.endOnlineGame();
        this.showMenu();
      };
    } else {
      document.getElementById('btn-rematch').onclick = () => {
        this.playerConfigs = [];
        this.selectedCard = null;
        this.attackingUnit = null;
        this.showMenu();
      };
    }
  }

  /** Show disconnection screen */
  _showDisconnected(message) {
    this.app.innerHTML = `
      <div class="main-menu online-lobby">
        <h2 style="color: #ef5350">🔌 Disconnected</h2>
        <p style="color: var(--text-secondary)">${message || 'Connection lost.'}</p>
        <button class="menu-btn primary" id="btn-dc-menu">☰ Main Menu</button>
      </div>
    `;
    document.getElementById('btn-dc-menu').onclick = () => {
      this.endOnlineGame();
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

  // ─── Visual Effect Helpers ──────────────────────────────────

  _triggerScreenShake() {
    this.app.classList.remove('screen-shake');
    // Force reflow to restart animation
    void this.app.offsetWidth;
    this.app.classList.add('screen-shake');
    setTimeout(() => this.app.classList.remove('screen-shake'), 350);
  }

  _spawnDestructionParticles(instanceId) {
    // Try to find the card element; if destroyed, use last known position or center
    const el = document.querySelector(`.game-card[data-instance="${instanceId}"]`)
      || document.querySelector(`.card-slot[data-instance="${instanceId}"]`);
    let cx, cy;
    if (el) {
      const rect = el.getBoundingClientRect();
      cx = rect.left + rect.width / 2;
      cy = rect.top + rect.height / 2;
    } else {
      // Fallback: center of screen
      cx = window.innerWidth / 2;
      cy = window.innerHeight / 2;
    }

    const colors = ['fire', 'gold', 'white'];
    for (let i = 0; i < 12; i++) {
      const particle = document.createElement('div');
      const color = colors[Math.floor(Math.random() * colors.length)];
      particle.className = `destruction-particle ${color}`;
      particle.style.position = 'fixed';
      particle.style.left = `${cx}px`;
      particle.style.top = `${cy}px`;
      const angle = (Math.PI * 2 / 12) * i + (Math.random() - 0.5);
      const dist = 40 + Math.random() * 80;
      particle.style.setProperty('--px', `${Math.cos(angle) * dist}px`);
      particle.style.setProperty('--py', `${Math.sin(angle) * dist}px`);
      document.body.appendChild(particle);
      setTimeout(() => particle.remove(), 800);
    }
  }

  _showTurnBanner(title, subtitle) {
    const banner = document.createElement('div');
    banner.className = 'turn-banner';
    banner.innerHTML = `
      <div class="turn-banner-content">
        <div class="turn-banner-line"></div>
        <h2>${title}</h2>
        <p>${subtitle}</p>
        <div class="turn-banner-line"></div>
      </div>
    `;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 1700);
  }

  _showManaCrystal(parentEl, diff) {
    if (!parentEl) return;
    const rect = parentEl.getBoundingClientRect();
    const crystal = document.createElement('div');
    crystal.className = 'mana-crystal-float';
    crystal.textContent = diff > 0 ? `+${diff} 💎` : `${diff} 💎`;
    crystal.style.color = diff > 0 ? 'var(--mana-blue)' : 'var(--lp-red)';
    crystal.style.position = 'fixed';
    crystal.style.left = `${rect.left + rect.width / 2}px`;
    crystal.style.top = `${rect.top}px`;
    document.body.appendChild(crystal);
    setTimeout(() => crystal.remove(), 1000);
  }

  _triggerChainFlash() {
    const flash = document.createElement('div');
    flash.className = 'chain-flash';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 250);
  }

  _spawnVictoryParticles() {
    const container = document.getElementById('victory-particles');
    if (!container) return;
    const colors = ['#ffd54f', '#ffb74d', '#fff8e1', '#4fc3f7', '#66bb6a', '#ba68c8'];
    for (let i = 0; i < 40; i++) {
      const p = document.createElement('div');
      p.className = 'victory-particle';
      p.style.left = `${Math.random() * 100}%`;
      p.style.top = `-10px`;
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.width = `${3 + Math.random() * 5}px`;
      p.style.height = p.style.width;
      p.style.animationDuration = `${2 + Math.random() * 3}s`;
      p.style.animationDelay = `${Math.random() * 2}s`;
      container.appendChild(p);
    }
  }

  _spawnFieldParticles() {
    // Only create once per render cycle
    if (this._fieldParticlesCreated) return;
    this._fieldParticlesCreated = true;

    const container = document.createElement('div');
    container.className = 'field-particles';
    for (let i = 0; i < 15; i++) {
      const p = document.createElement('div');
      p.className = 'field-particle';
      p.style.left = `${Math.random() * 100}%`;
      p.style.bottom = `${Math.random() * 30}%`;
      p.style.animationDuration = `${8 + Math.random() * 12}s`;
      p.style.animationDelay = `${Math.random() * 10}s`;
      p.style.opacity = `${0.1 + Math.random() * 0.2}`;
      container.appendChild(p);
    }
    this.app.style.position = 'relative';
    this.app.appendChild(container);

    // Reset flag when field particles are removed (next render)
    setTimeout(() => { this._fieldParticlesCreated = false; }, 100);
  }

  _showKeywordBurst(instanceId, keyword) {
    const el = document.querySelector(`.game-card[data-instance="${instanceId}"]`);
    if (!el) return;
    el.style.position = 'relative';
    const burst = document.createElement('div');
    const kwLower = keyword.toLowerCase();
    burst.className = `keyword-burst ${kwLower}`;
    burst.textContent = keyword;
    el.appendChild(burst);
    setTimeout(() => burst.remove(), 900);
  }

  _showSummonCircle(slotEl) {
    if (!slotEl) return;
    slotEl.style.position = 'relative';
    const circle = document.createElement('div');
    circle.className = 'summon-circle';
    slotEl.appendChild(circle);
    setTimeout(() => circle.remove(), 600);
  }

  _triggerDamageFlash(instanceId) {
    const el = document.querySelector(`.game-card[data-instance="${instanceId}"]`);
    if (!el) return;
    el.classList.add('damage-flash');
    setTimeout(() => el.classList.remove('damage-flash'), 350);
  }

  /**
   * Attach hover-to-zoom behavior on card images inside popup dialogs.
   * Shows a larger preview next to the cursor when hovering .popup-card-thumb or .response-card-img
   */
  _attachPopupHoverZoom(container) {
    SharedUI.attachPopupHoverZoom(container);
  }

  /**
   * Hand-based card selection: highlights valid cards in hand and lets player click them.
   * Used when an effect requires choosing from cards in the player's own hand.
   */
  _showHandSelection(targets, description, callback) {
    // Build a set of valid instance IDs
    const validIds = new Set(targets.map(t => t.instanceId || t.card?.instanceId));

    // Show instruction banner
    const banner = document.createElement('div');
    banner.className = 'hand-select-banner';
    banner.innerHTML = `
      <div class="hand-select-content">
        <span>${description}</span>
        <button class="menu-btn hand-select-cancel">✕ Cancel</button>
      </div>
    `;
    document.body.appendChild(banner);

    // Highlight valid hand cards
    const handCards = document.querySelectorAll('.hand-card.game-card');
    const cleanup = () => {
      banner.remove();
      handCards.forEach(c => {
        c.classList.remove('hand-selectable');
        c.removeEventListener('click', c._handSelectHandler);
        delete c._handSelectHandler;
      });
    };

    handCards.forEach(cardEl => {
      const instanceId = cardEl.dataset.instance;
      if (validIds.has(instanceId)) {
        cardEl.classList.add('hand-selectable');
        const handler = (e) => {
          e.stopPropagation();
          cleanup();
          const target = targets.find(t => (t.instanceId || t.card?.instanceId) === instanceId);
          callback(target);
        };
        cardEl._handSelectHandler = handler;
        cardEl.addEventListener('click', handler);
      }
    });

    // Cancel button
    banner.querySelector('.hand-select-cancel').onclick = () => {
      cleanup();
      callback(null);
    };
  }
}
