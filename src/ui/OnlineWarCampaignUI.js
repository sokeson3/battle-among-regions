// ─────────────────────────────────────────────────────────────
// OnlineWarCampaignUI.js — Online War Campaign mode flow
// ─────────────────────────────────────────────────────────────

import { DeckBuilderUI } from './DeckBuilderUI.js';

export class OnlineWarCampaignUI {
  /**
   * @param {import('./GameUI.js').GameUI} gameUI
   * @param {import('../engine/GameController.js').GameController} controller
   * @param {import('./OnlineGameUI.js').OnlineGameUI} onlineUI
   */
  constructor(gameUI, controller, onlineUI) {
    this.gameUI = gameUI;
    this.controller = controller;
    this.onlineUI = onlineUI;
    this.net = onlineUI.net;
    this.app = document.getElementById('app');
    this.deckBuilder = new DeckBuilderUI(this.app, controller.cardDB);
    this._active = false;
    this._myRegion = null;
    this._opponentRegion = null;
    this._opponentName = null;
    this._currentRound = 1;
    this._playerDeck = [];
    this._standings = [];
    this._roundDef = null;
    this._draftContinueResolve = null; // resolve fn for WAR_DRAFT_CONTINUE
  }

  // ─── Entry: Create or Join ──────────────────────────────

  show() {
    this._active = true;
    this.app.innerHTML = `
      <div class="main-menu online-lobby">
        <h1 class="menu-title" style="font-size:2rem">⚔ Online War Campaign</h1>
        <p class="menu-subtitle">Multi-round 2-player battle for Victory Points</p>
        <div class="menu-buttons">
          <button class="menu-btn primary" id="owc-create">🏠 Create War Room</button>
          <button class="menu-btn" id="owc-join">🔗 Join War Room</button>
          <button class="menu-btn" id="owc-back" style="margin-top:16px;opacity:0.7">← Back</button>
        </div>
      </div>
    `;

    document.getElementById('owc-create').onclick = () => this._showCreateRoom();
    document.getElementById('owc-join').onclick = () => this._showJoinRoom();
    document.getElementById('owc-back').onclick = () => {
      this._active = false;
      this.onlineUI.showLobby();
    };
  }

  _showCreateRoom() {
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
    document.getElementById('btn-back').onclick = () => this.show();
  }

  _showJoinRoom() {
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
    };
    document.getElementById('btn-back').onclick = () => this.show();
  }

  _showWaitingForOpponent(roomCode) {
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
      this._active = false;
      this.net.disconnect();
      this.gameUI.showMenu();
    };
  }

  // ─── Draft Phase (2-phase simultaneous) ────────────────

  async _startDraft(msg) {
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

    // Build seats for 2-player draft (same as offline)
    const nonChosenRegions = allRegions.filter(r => r !== this._myRegion && r !== this._opponentRegion);
    const shuffledNonChosen = [...nonChosenRegions].sort(() => Math.random() - 0.5);
    // Seats from MY perspective:
    // seat 0 (me): my region
    // seat 1 (empty): non-chosen A
    // seat 2 (opp): opponent's region
    // seat 3 (empty): non-chosen B
    let seats = [
      { ownerId: 'me', region: this._myRegion },
      { ownerId: null, region: shuffledNonChosen[0] },
      { ownerId: 'opp', region: this._opponentRegion },
      { ownerId: null, region: shuffledNonChosen[1] },
    ];

    for (const seat of seats) {
      seat.pool = regionPools[seat.region];
    }

    // Track picks and landmarks
    const playerPicks = [...existingDeck];
    let landmarkCount = 0;
    for (const cardId of existingDeck) {
      const card = cardDB.getCard(cardId);
      if (card && card.type === 'Landmark') landmarkCount++;
    }

    // ────────────────────────────────────────────────────────
    // PHASE 1: Draft from first 2 pools (own region + first rotation)
    // These are independent of the opponent's picks
    // ────────────────────────────────────────────────────────

    // Pass 1: draft from my own region (seat 0)
    const phase1Remaining = [];  // track remaining pools to send in sync

    for (let pass = 0; pass < 2; pass++) {
      if (playerPicks.length >= targetSize) break;

      const mySeat = seats[0]; // always position 0 = my seat
      if (mySeat.pool.length > 0 && playerPicks.length < targetSize) {
        // Filter: only show landmarks from own region
        const filteredPool = mySeat.pool.filter(c =>
          c.type !== 'Landmark' || c.region === this._myRegion
        );

        if (filteredPool.length > 0) {
          const result = await this.deckBuilder.showRegionRotationDraft({
            playerName: 'You',
            playerRegion: this._myRegion,
            regionPool: filteredPool,
            regionName: mySeat.pool.length > 0 ? mySeat.pool[0].region : 'Unknown',
            passNumber: pass + 1,
            totalPasses: '4',
            currentDeckSize: playerPicks.length,
            targetDeckSize: targetSize,
            existingDeckCardIds: playerPicks,
            minLandmarks: minLandmarks,
            currentLandmarks: landmarkCount,
          });

          // Record picks
          for (const cardId of result.picked) {
            playerPicks.push(cardId);
            const card = cardDB.getCard(cardId);
            if (card && card.type === 'Landmark') landmarkCount++;
          }

          // Update seat pool
          const remainingDraftIds = new Set(result.remaining.map(c => c.draftId));
          const filteredDraftIds = new Set(filteredPool.map(c => c.draftId));
          mySeat.pool = mySeat.pool.filter(c =>
            remainingDraftIds.has(c.draftId) || !filteredDraftIds.has(c.draftId)
          );
        }
      }

      // Save remaining pool IDs for sync
      phase1Remaining.push(mySeat.pool.map(c => c.id));

      // Rotate pools left for the next pass
      const pools = seats.map(s => s.pool);
      for (let i = 0; i < seats.length; i++) {
        seats[i].pool = pools[(i + 1) % seats.length];
      }
    }

    // ────────────────────────────────────────────────────────
    // SYNC: Send my remaining pools, wait for opponent's
    // phase1Remaining[0] = remaining from my own region (pass 1)
    // phase1Remaining[1] = remaining from non-chosen A (pass 2)
    // ────────────────────────────────────────────────────────
    this.net.warDraftSync(phase1Remaining[0], phase1Remaining[1]);
    this._showWaitingScreen('Waiting for opponent to finish drafting first pools...');

    // Wait for WAR_DRAFT_CONTINUE from server (opponent's remaining pools)
    const continueData = await new Promise(resolve => {
      this._draftContinueResolve = resolve;
    });

    // ────────────────────────────────────────────────────────
    // PHASE 2: Draft from opponent's remaining pools
    // Rebuild pools from the card IDs received from opponent
    // ────────────────────────────────────────────────────────
    let phase2DraftIdCounter = 10000;
    const rebuildPool = (cardIds) => {
      const pool = [];
      for (const id of cardIds) {
        const card = cardDB.getCard(id);
        if (card) {
          pool.push({ ...card, draftId: `${id}_sync_${phase2DraftIdCounter++}` });
        }
      }
      return pool;
    };

    // The opponent's remaining pools arrive in the same order they drafted:
    // pool1 = opponent's own region remaining, pool2 = non-chosen remaining
    // After 2 more rotations, these land on my seat
    const oppPool1 = rebuildPool(continueData.pool1Ids);
    const oppPool2 = rebuildPool(continueData.pool2Ids);

    // Draft from opponent's first remaining pool (pass 3)
    for (let i = 0; i < 2; i++) {
      if (playerPicks.length >= targetSize) break;
      const pool = i === 0 ? oppPool1 : oppPool2;

      if (pool.length > 0 && playerPicks.length < targetSize) {
        const filteredPool = pool.filter(c =>
          c.type !== 'Landmark' || c.region === this._myRegion
        );

        if (filteredPool.length > 0) {
          const result = await this.deckBuilder.showRegionRotationDraft({
            playerName: 'You',
            playerRegion: this._myRegion,
            regionPool: filteredPool,
            regionName: pool.length > 0 ? pool[0].region : 'Unknown',
            passNumber: 3 + i,
            totalPasses: '4',
            currentDeckSize: playerPicks.length,
            targetDeckSize: targetSize,
            existingDeckCardIds: playerPicks,
            minLandmarks: minLandmarks,
            currentLandmarks: landmarkCount,
          });

          for (const cardId of result.picked) {
            playerPicks.push(cardId);
            const card = cardDB.getCard(cardId);
            if (card && card.type === 'Landmark') landmarkCount++;
          }
        }
      }
    }

    // Draft complete — send deck to server
    this._playerDeck = playerPicks;
    this.net.warDeckReady(playerPicks);
    this._showWaitingScreen('Waiting for opponent to finish drafting...');
  }

  // ─── Tiebreaker Modify Phase ───────────────────────────

  async _startTiebreakerDraft(msg) {
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
    this._showWaitingScreen('Waiting for opponent to finish modifying...');
  }

  // ─── Round Result ──────────────────────────────────────

  _showRoundResult(msg) {
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
        this._active = false;
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

  // ─── Network Event Wiring ─────────────────────────────

  wireWarEvents() {
    this.net.on('WAR_ROOM_CREATED', (msg) => {
      if (!this._active) return;
      this._showWaitingForOpponent(msg.roomCode);
    });

    this.net.on('WAR_DRAFT_START', (msg) => {
      if (!this._active) return;
      if (msg.roundDef && msg.roundDef.isTiebreaker) {
        this._startTiebreakerDraft(msg);
      } else {
        this._startDraft(msg);
      }
    });

    this.net.on('WAR_DRAFT_CONTINUE', (msg) => {
      if (!this._active) return;
      // Resolve the promise that _startDraft is waiting on
      if (this._draftContinueResolve) {
        this._draftContinueResolve(msg);
        this._draftContinueResolve = null;
      }
    });

    this.net.on('WAR_ROUND_RESULT', (msg) => {
      if (!this._active) return;
      this._showRoundResult(msg);
    });

    this.net.on('OPPONENT_DISCONNECTED', (msg) => {
      if (!this._active) return;
      this._showDisconnected(msg.message);
    });

    this.net.on('disconnected', () => {
      if (!this._active) return;
      this._showDisconnected('Connection to server lost.');
    });
  }

  // ─── Helpers ───────────────────────────────────────────

  isActive() { return this._active; }

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

  _showDisconnected(message) {
    this.app.innerHTML = `
      <div class="main-menu online-lobby">
        <h1 class="menu-title" style="color:var(--lp-red)">Disconnected</h1>
        <p class="menu-subtitle">${message}</p>
        <button class="menu-btn primary" id="btn-menu">Return to Menu</button>
      </div>
    `;
    document.getElementById('btn-menu').onclick = () => {
      this._active = false;
      this.net.disconnect();
      this.gameUI.showMenu();
    };
  }
}
