// ─────────────────────────────────────────────────────────────
// WarCampaignUI.js — War Campaign mode flow controller
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
  }

  isWarCampaignMode() {
    return this._isInWarCampaign;
  }

  // ─── Entry: Player Count & Region Selection ──────────

  showPlayerCountSelect() {
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
    document.getElementById('wc-back').onclick = () => this.gameUI.showMenu();
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
    this._isInWarCampaign = true;
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
    // Each player has their own region. Non-chosen regions are placed as piles.
    const chosenRegions = this.state.players.map(p => p.region);
    const nonChosenRegions = allRegions.filter(r => !chosenRegions.includes(r));

    // Build initial region pools
    const regionPools = {};
    for (const region of allRegions) {
      regionPools[region] = buildRegionPool(region);
    }

    // ── Build the pass order for each player ──
    // passSlots: array of "seats" around the table, each containing { owner, pool }
    // Players sit at indices 0..playerCount-1, and non-chosen regions fill remaining "seats"
    let seats = []; // each seat = { ownerId: player.id | null, region, pool }

    if (playerCount === 2) {
      // 2-Player: 4 seats total. Players at 0 and 1, non-chosen at 2 and 3 (randomised)
      const shuffledNonChosen = [...nonChosenRegions].sort(() => Math.random() - 0.5);
      seats = [
        { ownerId: 0, region: this.state.players[0].region },
        { ownerId: null, region: shuffledNonChosen[0] },
        { ownerId: 1, region: this.state.players[1].region },
        { ownerId: null, region: shuffledNonChosen[1] },
      ];
    } else if (playerCount === 3) {
      // 3-Player: Players 0, 1, 2. Non-chosen region placed between player 2 & 3 (index 2 & 0).
      // So seats: [P0, P1, non-chosen, P2] — pass left means P0→P1→nonChosen→P2→P0
      seats = [
        { ownerId: 0, region: this.state.players[0].region },
        { ownerId: 1, region: this.state.players[1].region },
        { ownerId: null, region: nonChosenRegions[0] },
        { ownerId: 2, region: this.state.players[2].region },
      ];
    } else {
      // 4-Player: all seats are players
      seats = this.state.players.map(p => ({
        ownerId: p.id, region: p.region,
      }));
    }

    // Each seat starts with its region's pool
    for (const seat of seats) {
      seat.pool = regionPools[seat.region];
    }

    // Track each player's picks and landmark counts
    const playerPicks = {};   // playerId → cardId[]
    const landmarkCounts = {}; // playerId → number
    for (const p of this.state.players) {
      playerPicks[p.id] = [...p.deck]; // start with existing deck for intermission
      landmarkCounts[p.id] = 0;
      // Count existing landmarks
      for (const cardId of p.deck) {
        const card = cardDB.getCard(cardId);
        if (card && card.type === 'Landmark') {
          landmarkCounts[p.id]++;
        }
      }
    }

    // ── Rotation: keep passing pools until all players reach target ──
    let pass = 0;
    const maxPasses = 20; // safety cap

    while (pass < maxPasses) {
      // Check if all players have enough cards
      const allDone = this.state.players.every(
        p => playerPicks[p.id].length >= targetSize
      );
      if (allDone) break;

      // Check if any pools have cards left
      const totalPoolCards = seats.reduce((sum, s) => sum + s.pool.length, 0);
      if (totalPoolCards === 0) break;

      // For each player seat, show the draft screen for the pool currently at their seat
      for (const seat of seats) {
        if (seat.ownerId === null) continue; // non-chosen pile seats skip UI

        const player = this.state.players.find(p => p.id === seat.ownerId);
        if (!player) continue;
        if (playerPicks[player.id].length >= targetSize) continue;

        // Filter pool: only show landmarks if from player's own region
        const filteredPool = seat.pool.filter(c =>
          c.type !== 'Landmark' || c.region === player.region
        );

        if (filteredPool.length === 0) continue;

        // Show transition screen for this player's turn
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

        // Update seat pool: remaining items from the draft + items that were filtered out
        // (non-own-region landmarks that were hidden from this player but still in the pool)
        const remainingDraftIds = new Set(result.remaining.map(c => c.draftId));
        const filteredDraftIds = new Set(filteredPool.map(c => c.draftId));
        seat.pool = seat.pool.filter(c =>
          remainingDraftIds.has(c.draftId) || !filteredDraftIds.has(c.draftId)
        );
      }

      // ── Pass pools: shift left (each seat gives pool to seat on its left) ──
      const pools = seats.map(s => s.pool);
      // Rotate: each seat receives from the seat on its right
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
      customDeck: p.deck, // Pass the drafted deck
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
        // Try to find this card and place it
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
      // 2nd place is the last eliminated player
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

  // ─── Transition Helper ───────────────────────────────

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

  cleanup() {
    this._isInWarCampaign = false;
  }
}
