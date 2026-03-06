// ─────────────────────────────────────────────────────────────
// WarCampaignUI.js — War Campaign mode flow controller
// Handles BOTH offline (AI/hot-seat) and online modes
// ─────────────────────────────────────────────────────────────

import { WarCampaignState } from '../campaign/WarCampaignData.js';
import { DeckBuilderUI } from './DeckBuilderUI.js';
import { PHASES } from '../engine/GameState.js';

export class WarCampaignUI {
  /**
   * @param {import('./GameUI.js').GameUI} gameUI
   * @param {import('../engine/GameController.js').GameController} controller
   */
  constructor(gameUI, controller) {
    this.gameUI = gameUI;
    this.controller = controller;
    this.app = document.getElementById('app');
    this.state = new WarCampaignState();
    this.deckBuilder = null;
    this._isInWarCampaign = false;

    // ─── Online mode properties ──────────────────────────
    this.isOnline = false;
    this.onlineUI = null;           // OnlineGameUI reference (set when entering online mode)
    this.net = null;                // NetworkManager reference
    this._myRegion = null;
    this._opponentRegion = null;
    this._opponentName = null;
    this._currentRound = 1;
    this._playerDeck = [];
    this._standings = [];
    this._roundDef = null;
    this._draftContinueResolve = null; // resolve fn for WAR_DRAFT_CONTINUE
  }

  isWarCampaignMode() {
    return this._isInWarCampaign;
  }

  isActive() { return this._isInWarCampaign; }

  // ═══════════════════════════════════════════════════════════
  //  ONLINE WAR CAMPAIGN — Entry, Lobby, Matchmaking
  // ═══════════════════════════════════════════════════════════

  /** Enter the online war campaign lobby */
  showOnline(onlineUI) {
    this.isOnline = true;
    this.onlineUI = onlineUI;
    this.net = onlineUI.net;
    this._isInWarCampaign = true;
    if (!this.deckBuilder) {
      this.deckBuilder = new DeckBuilderUI(this.app, this.controller.cardDB);
    }

    this.app.innerHTML = `
      <div class="main-menu online-lobby">
        <h1 class="menu-title" style="font-size:2rem">⚔ Online War Campaign</h1>
        <p class="menu-subtitle">Multi-round 2-player battle for Victory Points</p>
        <div class="menu-buttons">
          <button class="menu-btn primary online-glow" id="owc-quick">⚡ Quick Join</button>
          <button class="menu-btn" id="owc-create">🏠 Create War Room</button>
          <button class="menu-btn" id="owc-join">🔗 Join War Room</button>
          <button class="menu-btn" id="owc-back" style="margin-top:16px;opacity:0.7">← Back</button>
        </div>
      </div>
    `;

    document.getElementById('owc-quick').onclick = () => this._showQuickWarMatch();
    document.getElementById('owc-create').onclick = () => this._showOnlineCreateRoom();
    document.getElementById('owc-join').onclick = () => this._showOnlineJoinRoom();
    document.getElementById('owc-back').onclick = () => {
      this._isInWarCampaign = false;
      this.isOnline = false;
      this.onlineUI.showLobby();
    };
  }

  _showOnlineCreateRoom() {
    this.app.innerHTML = `
      <div class="main-menu online-lobby">
        <h1 class="menu-title">🏠 Create War Room</h1>
        <p class="menu-subtitle">Enter your name to create a War Campaign room</p>
        <div class="online-form">
          <input type="text" class="online-input" id="player-name" placeholder="Your Name" maxlength="20" value="Player 1" />
          <button class="menu-btn primary" id="btn-create-go">Create War Room</button>
          <button class="menu-btn" id="btn-back">← Back</button>
        </div>
      </div>
    `;

    document.getElementById('btn-create-go').onclick = () => {
      const name = document.getElementById('player-name').value.trim() || 'Player 1';
      this.net.createWarRoom(name);
    };
    document.getElementById('btn-back').onclick = () => this.showOnline(this.onlineUI);
  }

  _showOnlineJoinRoom() {
    this.app.innerHTML = `
      <div class="main-menu online-lobby">
        <h1 class="menu-title">🔗 Join War Room</h1>
        <p class="menu-subtitle">Enter the war room code to join</p>
        <div class="online-form">
          <input type="text" class="online-input room-code-input" id="room-code" placeholder="ROOM CODE" maxlength="4"
                 style="text-transform:uppercase;text-align:center;font-size:2rem;letter-spacing:0.3em" />
          <input type="text" class="online-input" id="player-name" placeholder="Your Name" maxlength="20" value="Player 2" />
          <button class="menu-btn primary" id="btn-join-go">Join War Room</button>
          <button class="menu-btn" id="btn-back">← Back</button>
        </div>
      </div>
    `;

    document.getElementById('btn-join-go').onclick = () => {
      const code = document.getElementById('room-code').value.trim().toUpperCase();
      const name = document.getElementById('player-name').value.trim() || 'Player 2';
      if (code.length !== 4) {
        this._showToast('Please enter a 4-character room code.');
        return;
      }
      this.net.joinWarRoom(code, name);
      this._showJoiningWar(code);
    };
    document.getElementById('btn-back').onclick = () => this.showOnline(this.onlineUI);
  }

  _showQuickWarMatch() {
    this.app.innerHTML = `
      <div class="main-menu online-lobby">
        <h1 class="menu-title">⚡ Quick War Match</h1>
        <p class="menu-subtitle">Enter your name and find an opponent</p>
        <div class="online-form">
          <input type="text" class="online-input" id="player-name" placeholder="Your Name" maxlength="20" value="Player" />
          <button class="menu-btn primary" id="btn-war-search">🔍 Find Opponent</button>
          <button class="menu-btn" id="btn-back">← Back</button>
        </div>
      </div>
    `;

    document.getElementById('btn-war-search').onclick = () => {
      const name = document.getElementById('player-name').value.trim() || 'Player';
      this.net.findWarMatch(name);
      this._showWarSearching();
    };
    document.getElementById('btn-back').onclick = () => {
      this._isInWarCampaign = false;
      this.isOnline = false;
      this.net.disconnect();
      this.gameUI.showMenu();
    };
  }

  _showWarSearching() {
    this.app.innerHTML = `
      <div class="main-menu online-lobby">
        <h1 class="menu-title">⚡ Quick War Match</h1>
        <div class="waiting-animation">
          <div class="waiting-dots"><span></span><span></span><span></span></div>
          <p>Searching for an opponent...</p>
        </div>
        <button class="menu-btn" id="btn-cancel-search">✕ Cancel</button>
      </div>
    `;

    document.getElementById('btn-cancel-search').onclick = () => {
      this.net.cancelWarMatch();
      this._isInWarCampaign = false;
      this.isOnline = false;
      this.net.disconnect();
      this.gameUI.showMenu();
    };
  }

  _showJoiningWar(roomCode) {
    this.app.innerHTML = `
      <div class="main-menu online-lobby">
        <h1 class="menu-title">🔗 Joining War Room</h1>
        <div class="room-code-display">
          <div class="room-code-big">${roomCode}</div>
        </div>
        <div class="waiting-animation">
          <div class="waiting-dots"><span></span><span></span><span></span></div>
          <p>Connecting to war room...</p>
        </div>
        <div class="joining-status" id="war-joining-status" style="margin-top:12px;font-size:0.85rem;color:var(--text-muted);text-align:center;max-height:120px;overflow-y:auto">
          <div>⏳ Sending join request...</div>
        </div>
        <button class="menu-btn" id="btn-cancel-join" style="margin-top:16px">Cancel</button>
      </div>
    `;

    document.getElementById('btn-cancel-join').onclick = () => {
      this._isInWarCampaign = false;
      this.isOnline = false;
      this.net.disconnect();
      this.gameUI.showMenu();
    };
  }

  _showWaitingForOnlineOpponent(roomCode) {
    this.app.innerHTML = `
      <div class="main-menu online-lobby">
        <h1 class="menu-title">War Room Created!</h1>
        <div class="room-code-display">
          <p class="room-code-label">Share this code with your opponent:</p>
          <div class="room-code-big">${roomCode}</div>
          <button class="menu-btn compact" id="btn-copy-code">📋 Copy Code</button>
        </div>
        <div class="waiting-animation">
          <div class="waiting-dots"><span></span><span></span><span></span></div>
          <p>Waiting for opponent to join...</p>
        </div>
        <button class="menu-btn" id="btn-cancel">Cancel</button>
      </div>
    `;

    document.getElementById('btn-copy-code').onclick = () => {
      navigator.clipboard.writeText(roomCode).then(() => this._showToast('Code copied!'));
    };
    document.getElementById('btn-cancel').onclick = () => {
      this._isInWarCampaign = false;
      this.isOnline = false;
      this.net.disconnect();
      this.gameUI.showMenu();
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  ONLINE: Network Event Wiring
  // ═══════════════════════════════════════════════════════════

  wireWarEvents() {
    if (!this.net) return;

    this.net.on('WAR_ROOM_CREATED', (msg) => {
      if (!this._isInWarCampaign) return;
      this._showWaitingForOnlineOpponent(msg.roomCode);
    });

    this.net.on('WAR_SEARCHING', () => {
      // Server acknowledged war search — already showing searching UI
    });

    this.net.on('WAR_MATCH_CANCELLED', () => {
      if (!this._isInWarCampaign) return;
      this.showOnline(this.onlineUI);
    });

    this.net.on('WAR_DRAFT_START', (msg) => {
      if (!this._isInWarCampaign) return;
      // Update joining status if on joining screen
      this._updateWarJoiningStatus('✅ Match found! Starting draft...');
      if (msg.roundDef && msg.roundDef.isTiebreaker) {
        this._startOnlineTiebreakerDraft(msg);
      } else {
        this._startOnlineDraft(msg);
      }
    });

    this.net.on('WAR_DRAFT_CONTINUE', (msg) => {
      if (!this._isInWarCampaign) return;
      // Resolve the promise that _startOnlineDraft is waiting on
      if (this._draftContinueResolve) {
        this._draftContinueResolve(msg);
        this._draftContinueResolve = null;
      }
    });

    this.net.on('WAR_GAME_STARTING', (msg) => {
      if (!this._isInWarCampaign) return;
      // Wire GameUI for online game — this registers REQUEST_LANDMARK, GAME_STATE, etc.
      this.onlineUI.myPlayerId = msg.yourPlayerId;
      this.gameUI.startOnlineGame(this.net, msg.yourPlayerId);
    });

    this.net.on('WAR_ROUND_RESULT', (msg) => {
      if (!this._isInWarCampaign) return;
      this._showOnlineRoundResult(msg);
    });

    this.net.on('OPPONENT_DISCONNECTED', (msg) => {
      if (!this._isInWarCampaign) return;
      this._showDisconnected(msg.message);
    });

    this.net.on('disconnected', () => {
      if (!this._isInWarCampaign) return;
      this._showDisconnected('Connection to server lost.');
    });

    this.net.on('ERROR', (msg) => {
      if (!this._isInWarCampaign) return;
      this._showToast(msg.message || 'An error occurred.');
      // If on a joining/searching screen, return to menu
      const joiningEl = document.querySelector('.joining-status') || document.querySelector('.waiting-animation');
      if (joiningEl && !document.querySelector('.war-campaign-screen')) {
        this.showOnline(this.onlineUI);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  ONLINE: Draft Phase (simultaneous with opponent sync)
  // ═══════════════════════════════════════════════════════════

  async _startOnlineDraft(msg) {
    this._myRegion = msg.yourRegion;
    this._opponentRegion = msg.opponentRegion;
    this._opponentName = msg.opponentName;
    this._currentRound = msg.round;
    this._roundDef = msg.roundDef;
    this._standings = msg.standings || [];

    const cardDB = this.controller.cardDB;
    const allRegions = ['Northern', 'Eastern', 'Southern', 'Western'];
    const targetSize = this._roundDef.deckSize;
    const minLandmarks = this._roundDef.minLandmarks || 0;
    let draftIdCounter = 0;

    // Build region pools
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

    // Start with previous deck if provided (for rounds 2+)
    const existingDeck = msg.previousDeck || [];

    // Remove existing deck cards from pools
    const existingCounts = {};
    for (const cardId of existingDeck) {
      existingCounts[cardId] = (existingCounts[cardId] || 0) + 1;
    }

    const regionPools = {};
    for (const region of allRegions) {
      regionPools[region] = buildRegionPool(region);
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

    // Server assigns 2 pools for me and 2 for the opponent
    const myPoolRegions = msg.myPools;
    const oppPoolRegions = msg.oppPools;

    // Fixed rotation order: my pair, then opponent's pair (repeating)
    const rotationRegions = [myPoolRegions[0], myPoolRegions[1], oppPoolRegions[0], oppPoolRegions[1]];
    let pools = rotationRegions.map(r => regionPools[r]);

    // Track picks and landmarks
    const playerPicks = [...existingDeck];
    let landmarkCount = 0;
    for (const cardId of existingDeck) {
      const card = cardDB.getCard(cardId);
      if (card && card.type === 'Landmark') landmarkCount++;
    }

    // Helper: draft from a single pool (one pass)
    let passCounter = 0;
    const draftFromPool = async (pool, fallbackRegionName) => {
      if (pool.length === 0 || playerPicks.length >= targetSize) return pool;

      const regionName = pool[0]?.region || fallbackRegionName;
      const filteredPool = pool.filter(c =>
        c.type !== 'Landmark' || c.region === this._myRegion
      );
      if (filteredPool.length === 0) return pool;

      passCounter++;
      const result = await this.deckBuilder.showRegionRotationDraft({
        playerName: 'You',
        playerRegion: this._myRegion,
        regionPool: filteredPool,
        regionName,
        passNumber: passCounter,
        totalPasses: '∞',
        currentDeckSize: playerPicks.length,
        targetDeckSize: targetSize,
        existingDeckCardIds: playerPicks,
        minLandmarks,
        currentLandmarks: landmarkCount,
      });

      // Record picks
      for (const cardId of result.picked) {
        playerPicks.push(cardId);
        const card = cardDB.getCard(cardId);
        if (card && card.type === 'Landmark') landmarkCount++;
      }

      // Return updated pool
      const remainingDraftIds = new Set(result.remaining.map(c => c.draftId));
      const filteredDraftIds = new Set(filteredPool.map(c => c.draftId));
      return pool.filter(c =>
        remainingDraftIds.has(c.draftId) || !filteredDraftIds.has(c.draftId)
      );
    };

    // Helper: rebuild pool from card IDs (received from opponent via sync)
    let syncIdCounter = 10000;
    const rebuildPool = (cardIds) => {
      const pool = [];
      for (const id of cardIds) {
        const card = cardDB.getCard(id);
        if (card) {
          pool.push({ ...card, draftId: `${id}_sync_${syncIdCounter++}` });
        }
      }
      return pool;
    };

    // MAIN DRAFT LOOP — 4-pool rotation
    let pairIndex = 0;
    let opponentDone = false;

    while (playerPicks.length < targetSize) {
      const idx1 = (pairIndex % 2) * 2;
      const idx2 = (pairIndex % 2) * 2 + 1;

      // Draft from first pool of the pair
      pools[idx1] = await draftFromPool(pools[idx1], rotationRegions[idx1]);
      if (playerPicks.length >= targetSize) {
        if (!opponentDone) {
          this.net.warDraftSync(pools[idx1].map(c => c.id), pools[idx2].map(c => c.id));
          this._showWaitingScreen('Waiting for opponent to finish drafting...');
          await new Promise(resolve => { this._draftContinueResolve = resolve; });
        }
        break;
      }

      // Draft from second pool of the pair
      pools[idx2] = await draftFromPool(pools[idx2], rotationRegions[idx2]);
      if (playerPicks.length >= targetSize) {
        if (!opponentDone) {
          this.net.warDraftSync(pools[idx1].map(c => c.id), pools[idx2].map(c => c.id));
          this._showWaitingScreen('Waiting for opponent to finish drafting...');
          await new Promise(resolve => { this._draftContinueResolve = resolve; });
        }
        break;
      }

      // Sync with opponent (unless opponent is already done)
      if (!opponentDone) {
        this.net.warDraftSync(pools[idx1].map(c => c.id), pools[idx2].map(c => c.id));
        this._showWaitingScreen('Waiting for opponent to finish drafting...');

        const data = await new Promise(resolve => {
          this._draftContinueResolve = resolve;
        });

        if (data.opponentDone) {
          opponentDone = true;
        } else {
          const nextIdx1 = ((pairIndex + 1) % 2) * 2;
          const nextIdx2 = ((pairIndex + 1) % 2) * 2 + 1;
          pools[nextIdx1] = rebuildPool(data.pool1Ids || []);
          pools[nextIdx2] = rebuildPool(data.pool2Ids || []);
        }
      }

      pairIndex++;
    }

    // Draft complete — send deck to server, then signal ready
    this._playerDeck = playerPicks;
    this.net.warDeckReady(playerPicks);
    this.net.send('WAR_READY_CHECK', {});
    this._showWaitingScreen('Waiting for opponent to finish drafting...');
  }

  async _startOnlineTiebreakerDraft(msg) {
    this._myRegion = msg.yourRegion;
    this._opponentRegion = msg.opponentRegion;
    this._opponentName = msg.opponentName;
    this._currentRound = msg.round;
    this._roundDef = msg.roundDef;
    this._standings = msg.standings || [];

    const existingDeck = msg.previousDeck || this._playerDeck;
    const modifyCards = this._roundDef.modifyCards || 10;

    const finalDeck = await this.deckBuilder.showModifyScreen(
      existingDeck, this._myRegion, modifyCards
    );

    this._playerDeck = finalDeck;
    this.net.warDeckReady(finalDeck);
    this.net.send('WAR_READY_CHECK', {});
    this._showWaitingScreen('Waiting for opponent to finish modifying...');
  }

  _showOnlineRoundResult(msg) {
    this._standings = msg.standings;
    const regionClass = (r) => ({ Northern: 'north', Eastern: 'east', Southern: 'south', Western: 'west' }[r] || '');
    const isOver = msg.isOver;

    this.app.innerHTML = `
      <div class="war-campaign-screen">
        <div class="wc-header">
          <h1 class="wc-title" style="color:var(--gold)">Round ${msg.round} Complete!</h1>
          <p class="wc-desc">${msg.winnerName ? `${msg.winnerName} wins this round!` : 'Round ended.'}</p>
        </div>

        <div class="wc-standings">
          <h3>Victory Point Standings</h3>
          <div class="wc-standings-list">
            ${msg.standings.map((p, i) => `
              <div class="wc-standing-row ${i === 0 ? 'leading' : ''}">
                <span class="wc-rank">${i + 1}</span>
                <span class="player-avatar ${regionClass(p.region)}" style="width:28px;height:28px;font-size:0.7rem">${p.name[0]}</span>
                <span class="wc-player-name">${p.name} (${p.region})</span>
                <span class="wc-vp">${p.vp} VP</span>
              </div>
            `).join('')}
          </div>
        </div>

        ${isOver ? `
          <div class="wc-victory">
            <h2>🏆 ${msg.campaignWinner.name} Wins the War Campaign!</h2>
            <p>Final score: ${msg.campaignWinner.vp} Victory Points</p>
          </div>
          <button class="menu-btn primary" id="owc-finish" style="margin-top:24px">Return to Menu</button>
        ` : `
          <div class="wc-intermission">
            <h3>Intermission</h3>
            <p style="color:var(--text-muted)">
              Prepare for Round ${msg.round + 1}. Draft new cards to strengthen your deck.
            </p>
          </div>
          <button class="menu-btn primary" id="owc-next" style="margin-top:24px">
            Continue to Round ${msg.round + 1}
          </button>
        `}
      </div>
    `;

    if (isOver) {
      document.getElementById('owc-finish').onclick = () => {
        this._isInWarCampaign = false;
        this.isOnline = false;
        this.net.disconnect();
        this.gameUI.showMenu();
      };
    } else {
      document.getElementById('owc-next').onclick = () => {
        this.net.warNextRound();
        this._showWaitingScreen('Waiting for opponent...');
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  OFFLINE WAR CAMPAIGN — Entry, Region Selection, Draft
  // ═══════════════════════════════════════════════════════════

  showPlayerCountSelect() {
    this.isOnline = false;
    this._isInWarCampaign = true;

    this.app.innerHTML = `
      <div class="main-menu">
        <h1 class="menu-title" style="font-size:2.2rem">War Campaign</h1>
        <p class="menu-subtitle">Multi-round battle for Victory Points</p>
        <div class="menu-buttons">
          <button class="menu-btn primary" id="wc-2p">2-Player Campaign</button>
          <button class="menu-btn" id="wc-3p">3-Player Campaign</button>
          <button class="menu-btn" id="wc-4p">4-Player Campaign</button>
          <button class="menu-btn" id="wc-back" style="margin-top:16px;opacity:0.7">← Back</button>
        </div>
      </div>
    `;

    document.getElementById('wc-2p').onclick = () => this._startRegionSelect(2);
    document.getElementById('wc-3p').onclick = () => this._startRegionSelect(3);
    document.getElementById('wc-4p').onclick = () => this._startRegionSelect(4);
    document.getElementById('wc-back').onclick = () => {
      this._isInWarCampaign = false;
      this.gameUI.showMenu();
    };
  }

  _startRegionSelect(playerCount) {
    this._playerCount = playerCount;
    this._playerConfigs = [];
    this._showRegionPick(0);
  }

  _showRegionPick(idx) {
    const selectedRegions = this._playerConfigs.map(p => p.region);
    const regionClass = (r) => ({ Northern: 'north', Eastern: 'east', Southern: 'south', Western: 'west' }[r] || '');

    this.app.innerHTML = `
      <div class="region-select">
        <h2>War Campaign — Choose Region</h2>
        <p class="player-label">Player ${idx + 1} of ${this._playerCount}</p>
        <div class="region-grid">
          ${['Northern', 'Eastern', 'Southern', 'Western'].map(region => {
      const disabled = selectedRegions.includes(region);
      return `
              <div class="region-card ${regionClass(region)} ${disabled ? 'disabled' : ''}" data-region="${region}">
                <h3>${region}</h3>
                <p>${this._getRegionDesc(region)}</p>
              </div>
            `;
    }).join('')}
        </div>
      </div>
    `;

    this.app.querySelectorAll('.region-card:not(.disabled)').forEach(el => {
      el.onclick = () => {
        this._playerConfigs.push({
          name: `Player ${idx + 1}`,
          region: el.dataset.region,
        });

        if (idx < this._playerCount - 1) {
          this._showRegionPick(idx + 1);
        } else {
          this._initCampaign();
        }
      };
    });
  }

  _getRegionDesc(region) {
    const descs = {
      Northern: 'Resilient defenders. Masters of healing and fortification.',
      Eastern: 'Cunning strategists. Spell mastery and shadow tactics.',
      Southern: 'Aggressive warriors. Raw power and piercing strikes.',
      Western: 'Adaptable tricksters. Unit synergy and effect manipulation.',
    };
    return descs[region] || '';
  }

  // ─── Campaign Initialization ─────────────────────────

  _initCampaign() {
    this.state.init(this._playerConfigs);
    this.deckBuilder = new DeckBuilderUI(this.app, this.controller.cardDB);

    // Start with deck building for round 1
    this._startDeckBuildPhase();
  }

  // ─── Deck Building Phase (Region-Rotation Draft) ──────

  async _startDeckBuildPhase() {
    const roundDef = this.state.getRoundDef();
    const cardDB = this.controller.cardDB;

    // Tiebreaker: each player modifies independently
    if (roundDef.isTiebreaker) {
      for (const player of this.state.players) {
        await this._showTransition(
          `${player.name} — Modify Your Deck`,
          `Tiebreaker Round\nSwap up to ${roundDef.modifyCards || 10} cards`
        );
        player.deck = await this.deckBuilder.showModifyScreen(
          player.deck, player.region, roundDef.modifyCards || 10
        );
      }
      this.state.save();
      this._showPreRound();
      return;
    }

    const allRegions = ['Northern', 'Eastern', 'Southern', 'Western'];
    const playerCount = this.state.playerCount;
    const targetSize = roundDef.deckSize;
    const minLandmarks = roundDef.minLandmarks || 0;
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

    // ── Determine region assignment and pass order ──
    const chosenRegions = this.state.players.map(p => p.region);
    const nonChosenRegions = allRegions.filter(r => !chosenRegions.includes(r));

    // Build initial region pools
    const regionPools = {};
    for (const region of allRegions) {
      regionPools[region] = buildRegionPool(region);
    }

    // Remove copies of cards already in each player's deck from pools
    const existingCounts = {};
    for (const p of this.state.players) {
      for (const cardId of p.deck) {
        existingCounts[cardId] = (existingCounts[cardId] || 0) + 1;
      }
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

    // ── Build the pass order for each player ──
    let seats = [];

    if (playerCount === 2) {
      const shuffledNonChosen = [...nonChosenRegions].sort(() => Math.random() - 0.5);
      seats = [
        { ownerId: 0, region: this.state.players[0].region },
        { ownerId: null, region: shuffledNonChosen[0] },
        { ownerId: 1, region: this.state.players[1].region },
        { ownerId: null, region: shuffledNonChosen[1] },
      ];
    } else if (playerCount === 3) {
      seats = [
        { ownerId: 0, region: this.state.players[0].region },
        { ownerId: 1, region: this.state.players[1].region },
        { ownerId: null, region: nonChosenRegions[0] },
        { ownerId: 2, region: this.state.players[2].region },
      ];
    } else {
      seats = this.state.players.map(p => ({
        ownerId: p.id, region: p.region,
      }));
    }

    // Each seat starts with its region's pool
    for (const seat of seats) {
      seat.pool = regionPools[seat.region];
    }

    // Track each player's picks and landmark counts
    const playerPicks = {};
    const landmarkCounts = {};
    for (const p of this.state.players) {
      playerPicks[p.id] = [...p.deck];
      landmarkCounts[p.id] = 0;
      for (const cardId of p.deck) {
        const card = cardDB.getCard(cardId);
        if (card && card.type === 'Landmark') {
          landmarkCounts[p.id]++;
        }
      }
    }

    // ── Rotation: keep passing pools until all players reach target ──
    let pass = 0;
    const maxPasses = 20;

    while (pass < maxPasses) {
      const allDone = this.state.players.every(
        p => playerPicks[p.id].length >= targetSize
      );
      if (allDone) break;

      const totalPoolCards = seats.reduce((sum, s) => sum + s.pool.length, 0);
      if (totalPoolCards === 0) break;

      for (const seat of seats) {
        if (seat.ownerId === null) continue;

        const player = this.state.players.find(p => p.id === seat.ownerId);
        if (!player) continue;
        if (playerPicks[player.id].length >= targetSize) continue;

        const filteredPool = seat.pool.filter(c =>
          c.type !== 'Landmark' || c.region === player.region
        );

        if (filteredPool.length === 0) continue;

        await this._showTransition(
          `${player.name}'s Turn to Draft`,
          `Region Rotation — Pass ${pass + 1}\nDeck: ${playerPicks[player.id].length} / ${targetSize}`
        );

        const result = await this.deckBuilder.showRegionRotationDraft({
          playerName: player.name,
          playerRegion: player.region,
          regionPool: filteredPool,
          regionName: seat.pool.length > 0 ? seat.pool[0].region : 'Unknown',
          passNumber: pass + 1,
          totalPasses: '?',
          currentDeckSize: playerPicks[player.id].length,
          targetDeckSize: targetSize,
          existingDeckCardIds: playerPicks[player.id],
          minLandmarks: minLandmarks,
          currentLandmarks: landmarkCounts[player.id],
        });

        // Record picks
        for (const cardId of result.picked) {
          playerPicks[player.id].push(cardId);
          const card = cardDB.getCard(cardId);
          if (card && card.type === 'Landmark') {
            landmarkCounts[player.id]++;
          }
        }

        const remainingDraftIds = new Set(result.remaining.map(c => c.draftId));
        const filteredDraftIds = new Set(filteredPool.map(c => c.draftId));
        seat.pool = seat.pool.filter(c =>
          remainingDraftIds.has(c.draftId) || !filteredDraftIds.has(c.draftId)
        );
      }

      // ── Pass pools: shift left ──
      const pools = seats.map(s => s.pool);
      for (let i = 0; i < seats.length; i++) {
        seats[i].pool = pools[(i + 1) % seats.length];
      }

      pass++;
    }

    // Save decks back to campaign state
    for (const p of this.state.players) {
      p.deck = playerPicks[p.id];
    }

    this.state.save();
    this._showPreRound();
  }

  // ─── Pre-Round Screen ────────────────────────────────

  _showPreRound() {
    const roundDef = this.state.getRoundDef();
    const standings = this.state.getStandings();
    const prevResult = this.state.roundResults[this.state.roundResults.length - 1];
    const regionClass = (r) => ({ Northern: 'north', Eastern: 'east', Southern: 'south', Western: 'west' }[r] || '');

    this.app.innerHTML = `
      <div class="war-campaign-screen">
        <div class="wc-header">
          <h1 class="wc-title">Round ${roundDef.round}: ${roundDef.name}</h1>
          <p class="wc-desc">${roundDef.description}</p>
        </div>

        <div class="wc-standings">
          <h3>Victory Point Standings</h3>
          <div class="wc-standings-list">
            ${standings.map((p, i) => `
              <div class="wc-standing-row ${i === 0 ? 'leading' : ''}">
                <span class="wc-rank">${i + 1}</span>
                <span class="player-avatar ${regionClass(p.region)}" style="width:28px;height:28px;font-size:0.7rem">${p.name[0]}</span>
                <span class="wc-player-name">${p.name} (${p.region})</span>
                <span class="wc-vp">${p.vp} VP</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="wc-round-info">
          <div class="wc-info-item">
            <span class="wc-info-label">Life Points</span>
            <span class="wc-info-value">${roundDef.lp}</span>
          </div>
          <div class="wc-info-item">
            <span class="wc-info-label">Deck Size</span>
            <span class="wc-info-value">${roundDef.deckSize}</span>
          </div>
          <div class="wc-info-item">
            <span class="wc-info-label">VP for Winner</span>
            <span class="wc-info-value">${roundDef.vpWinner}</span>
          </div>
        </div>

        ${prevResult ? `
          <div class="wc-landmark-placement">
            <h3>Landmark Pre-Placement</h3>
            <p style="color:var(--text-muted);font-size:0.85rem">
              Round winner(s) may place Landmarks before the battle begins.
              This will be handled during the game's landmark selection phase.
            </p>
          </div>
        ` : ''}

        <button class="menu-btn primary" id="wc-start-battle" style="margin-top:24px">
          ⚔ Begin Round ${roundDef.round}
        </button>
      </div>
    `;

    document.getElementById('wc-start-battle').onclick = () => this._startBattle();
  }

  // ─── Start a Battle Round ────────────────────────────

  async _startBattle() {
    const roundDef = this.state.getRoundDef();

    // Build player configs for the game controller
    const playerConfigs = this.state.players.map(p => ({
      name: p.name,
      region: p.region,
      customDeck: p.deck,
    }));

    // Set up the game
    const options = {
      gameMode: 'warCampaign',
      startingLP: roundDef.lp,
    };

    await this.controller.setupGame(playerConfigs, options);

    // Pre-place persisted landmarks from previous rounds
    const gs = this.controller.gameState;
    for (const player of gs.players) {
      const savedLandmark = this.state.fieldLandmarks[player.id];
      if (savedLandmark) {
        const card = this.controller.cardDB.getCard(savedLandmark.cardId);
        if (card) {
          const instance = gs.createCardInstance(card);
          instance.faceUp = true;
          player.landmarkZone = instance;
          gs.log('LANDMARK', `${player.name}'s Landmark ${card.name} persists from previous round.`);
        }
      }
    }

    // Set the game UI's player configs and count
    this.gameUI.playerConfigs = playerConfigs;
    this.gameUI.playerCount = this.state.playerCount;

    // Track first blood for multi-player
    this._firstBloodPlayerId = null;
    this._eliminationOrder = [];
    gs.on('PLAYER_ELIMINATED', (data) => {
      if (this._firstBloodPlayerId === null && data.eliminatorId !== undefined) {
        this._firstBloodPlayerId = data.eliminatorId;
      }
      this._eliminationOrder.push(data.playerId);
    });

    // Show landmark selection, then mulligan will follow
    this.gameUI.showLandmarkSelect(0);
  }

  // ─── Handle Game Over in War Campaign ────────────────

  handleWarCampaignGameOver(winner, loser) {
    const gs = this.controller.gameState;

    // Determine 2nd place for multi-player
    let secondId = null;
    if (this.state.playerCount > 2 && this._eliminationOrder.length > 0) {
      secondId = this._eliminationOrder[this._eliminationOrder.length - 1];
    }

    // Record the result
    this.state.recordResult(
      winner ? winner.id : null,
      secondId,
      this._firstBloodPlayerId
    );

    // Save landmarks on field for next round
    for (const player of gs.players) {
      if (player.landmarkZone) {
        this.state.fieldLandmarks[player.id] = {
          cardId: player.landmarkZone.cardId,
        };
      }
    }

    this.state.save();

    // Show post-round screen
    this._showPostRound(winner);
  }

  // ─── Post-Round Screen ───────────────────────────────

  _showPostRound(winner) {
    const roundDef = this.state.getRoundDef();
    const standings = this.state.getStandings();
    const regionClass = (r) => ({ Northern: 'north', Eastern: 'east', Southern: 'south', Western: 'west' }[r] || '');

    const isOver = this.state.isCampaignOver();
    const canContinueToTiebreaker = !isOver && this.state.currentRound >= 3 && standings[0].vp === standings[1].vp;

    this.app.innerHTML = `
      <div class="war-campaign-screen">
        <div class="wc-header">
          <h1 class="wc-title" style="color:var(--gold)">Round ${roundDef.round} Complete!</h1>
          <p class="wc-desc">${winner ? `${winner.name} wins this round!` : 'Round ended.'}</p>
        </div>

        <div class="wc-standings">
          <h3>Victory Point Standings</h3>
          <div class="wc-standings-list">
            ${standings.map((p, i) => `
              <div class="wc-standing-row ${i === 0 ? 'leading' : ''}">
                <span class="wc-rank">${i + 1}</span>
                <span class="player-avatar ${regionClass(p.region)}" style="width:28px;height:28px;font-size:0.7rem">${p.name[0]}</span>
                <span class="wc-player-name">${p.name} (${p.region})</span>
                <span class="wc-vp">${p.vp} VP</span>
              </div>
            `).join('')}
          </div>
        </div>

        ${isOver ? `
          <div class="wc-victory">
            <h2>🏆 ${standings[0].name} Wins the War Campaign!</h2>
            <p>Final score: ${standings[0].vp} Victory Points</p>
          </div>
          <button class="menu-btn primary" id="wc-finish" style="margin-top:24px">Return to Menu</button>
        ` : `
          <div class="wc-intermission">
            <h3>${canContinueToTiebreaker ? 'Tied! Tiebreaker Round Required' : 'Intermission'}</h3>
            <p style="color:var(--text-muted)">
              ${this.state.currentRound < 3
        ? `Add ${roundDef.deckAddCards || 10} cards to build your deck to ${(this.state.getRoundDef().deckSize || 30) + 10}.`
        : canContinueToTiebreaker
          ? 'Modify up to 10 cards in your deck for the tiebreaker round.'
          : 'Prepare for the final push.'
      }
            </p>
          </div>
          <button class="menu-btn primary" id="wc-next" style="margin-top:24px">
            ${canContinueToTiebreaker ? 'Prepare Tiebreaker' : `Continue to Round ${this.state.currentRound + 1}`}
          </button>
        `}
      </div>
    `;

    if (isOver) {
      document.getElementById('wc-finish').onclick = () => {
        this.state.reset();
        this._isInWarCampaign = false;
        this.gameUI.showMenu();
      };
    } else {
      document.getElementById('wc-next').onclick = () => {
        this.state.advanceRound();
        this.state.save();
        this._startDeckBuildPhase();
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  SHARED HELPERS
  // ═══════════════════════════════════════════════════════════

  _showTransition(title, subtitle) {
    return new Promise(resolve => {
      this.app.innerHTML = `
        <div class="turn-transition visible">
          <h2>${title}</h2>
          <p>${subtitle.replace(/\n/g, '<br>')}</p>
          <button class="start-btn" id="wc-transition-btn">Continue</button>
        </div>
      `;
      document.getElementById('wc-transition-btn').onclick = () => resolve();
    });
  }

  _showWaitingScreen(message) {
    this.app.innerHTML = `
      <div class="main-menu online-lobby">
        <div class="waiting-animation">
          <div class="waiting-dots"><span></span><span></span><span></span></div>
          <p>${message}</p>
        </div>
      </div>
    `;
  }

  _showToast(message) {
    const existing = document.querySelector('.toast-message');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-message show';
    toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  _updateWarJoiningStatus(message) {
    const el = document.getElementById('war-joining-status');
    if (el) {
      const line = document.createElement('div');
      line.textContent = message;
      el.appendChild(line);
      el.scrollTop = el.scrollHeight;
    }
  }

  _showDisconnected(message) {
    this.app.innerHTML = `
      <div class="main-menu online-lobby">
        <h1 class="menu-title" style="color:var(--lp-red)">Disconnected</h1>
        <p class="menu-subtitle">${message}</p>
        <button class="menu-btn primary" id="btn-menu">Return to Menu</button>
      </div>
    `;
    document.getElementById('btn-menu').onclick = () => {
      this._isInWarCampaign = false;
      this.isOnline = false;
      if (this.net) this.net.disconnect();
      this.gameUI.showMenu();
    };
  }

  cleanup() {
    this._isInWarCampaign = false;
    this.isOnline = false;
  }
}
