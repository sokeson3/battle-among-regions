// ─────────────────────────────────────────────────────────────
// DuelDeckBuilderUI.js — Create, save, and load custom decks
// for duel mode (Regional Match)
// ─────────────────────────────────────────────────────────────

import { MAX_COPIES_PER_CARD } from '../engine/CardDatabase.js';

const STORAGE_KEY = 'bar_custom_decks';

export class DuelDeckBuilderUI {
  /**
   * @param {HTMLElement} container - #app element
   * @param {import('../engine/CardDatabase.js').CardDatabase} cardDb
   * @param {Function} onBack - callback to return to menu
   */
  constructor(container, cardDb, onBack) {
    this.container = container;
    this.cardDb = cardDb;
    this.onBack = onBack;

    // Builder state
    this.deckName = '';
    this.deckRegion = 'Northern';
    this.deckCards = [];       // card IDs in current deck
    this.filterRegion = 'all'; // 'all' | 'Northern' | 'Eastern' | ...
    this.filterType = 'all';   // 'all' | 'Unit' | 'Spell' | ...
    this.searchQuery = '';
    this.editingIndex = -1;    // index in saved decks when editing, -1 = new
    this.showingSaved = false;
    this.showAllCards = false;  // false = show only obtained cards

    // Collection data (null = not loaded / guest)
    this.collection = null;    // Map<cardId, count> or null for guest
  }

  // ─── Persistence ──────────────────────────────────────────

  _loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  _saveAll(decks) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
  }

  getSavedDecksForRegion(region) {
    return this._loadAll().filter(d => d.region === region);
  }

  // ─── Entry Point ──────────────────────────────────────────

  async show() {
    this.deckCards = [];
    this.deckName = '';
    this.deckRegion = 'Northern';
    this.filterRegion = 'all';
    this.filterType = 'all';
    this.searchQuery = '';
    this.editingIndex = -1;
    this.showingSaved = false;
    this.showAllCards = false;

    // Load collection for logged-in users
    if (this.authService && this.authService.isLoggedIn) {
      try {
        const collArray = await this.authService.getCollection();
        this.collection = new Map();
        for (const entry of collArray) {
          this.collection.set(entry.card_id, entry.count);
        }
      } catch {
        this.collection = null; // fallback to showing all
      }
    } else {
      this.collection = null; // guest — show all
    }

    this._render();
  }

  // ─── Main Render ──────────────────────────────────────────

  _render() {
    if (this.showingSaved) {
      this._renderSavedList();
      return;
    }

    const allCards = this.cardDb.getAllPlayableCards();

    // Filter to owned cards if collection is loaded (logged-in user)
    let ownershipMap = null;
    if (this.collection) {
      ownershipMap = this.collection;
    }

    // Apply filters
    let pool = allCards;

    // Filter to obtained cards only (unless showAllCards is toggled on)
    if (ownershipMap && !this.showAllCards) {
      pool = pool.filter(c => (ownershipMap.get(c.id) || 0) > 0);
    }

    if (this.filterRegion !== 'all') {
      pool = pool.filter(c => c.region === this.filterRegion);
    }
    if (this.filterType !== 'all') {
      pool = pool.filter(c => c.type === this.filterType);
    }
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      pool = pool.filter(c => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
    }

    // Sort: Units first, then Spells, Traps, Landmarks; by mana cost within
    const typeOrder = { Unit: 0, Spell: 1, Trap: 2, Landmark: 3 };
    pool.sort((a, b) => (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9) || a.manaCost - b.manaCost);

    // Count copies in current deck per card id
    const deckCounts = {};
    this.deckCards.forEach(id => { deckCounts[id] = (deckCounts[id] || 0) + 1; });

    // Build deck list with card info
    const deckEntries = this.deckCards.map(id => this.cardDb.getCard(id)).filter(Boolean);

    // Group deck entries
    const deckGrouped = {};
    deckEntries.forEach(c => {
      if (!deckGrouped[c.id]) deckGrouped[c.id] = { card: c, count: 0 };
      deckGrouped[c.id].count++;
    });
    const deckGroupList = Object.values(deckGrouped);
    deckGroupList.sort((a, b) => (typeOrder[a.card.type] ?? 9) - (typeOrder[b.card.type] ?? 9) || a.card.manaCost - b.card.manaCost);

    const regionBtns = ['all', 'Northern', 'Eastern', 'Southern', 'Western'];
    const typeBtns = ['all', 'Unit', 'Spell', 'Trap', 'Landmark'];

    this.container.innerHTML = `
      <div class="duel-deck-builder">
        <!-- Header -->
        <div class="db-header">
          <button class="db-back-btn" id="db-back">← Back</button>
          <h2 class="db-title">⚔ Deck Builder</h2>
          <div class="db-header-actions">
            <button class="db-action-btn" id="db-load">📂 Load Deck</button>
            <button class="db-action-btn db-save-btn" id="db-save">💾 Save Deck</button>
          </div>
        </div>

        <div class="db-body">
          <!-- Card Pool (left) -->
          <div class="db-pool-section">
            <!-- Search bar -->
            <div class="db-search-row">
              <input type="text" class="db-search-input" id="db-search" placeholder="Search cards..." value="${this.searchQuery}" />
            </div>

            <!-- Region filter tabs -->
            <div class="db-filter-row">
              ${regionBtns.map(r => `
                <button class="db-filter-btn ${this.filterRegion === r ? 'active' : ''} ${r !== 'all' ? this._getRegionColorClass(r) : ''}"
                        data-filter-region="${r}">
                  ${r === 'all' ? 'All' : r}
                </button>
              `).join('')}
            </div>

            <!-- Type filter tabs -->
            <div class="db-filter-row">
              ${typeBtns.map(t => `
                <button class="db-filter-btn ${this.filterType === t ? 'active' : ''}"
                        data-filter-type="${t}">
                  ${t === 'all' ? 'All Types' : t}
                </button>
              `).join('')}
              ${ownershipMap ? `
                <button class="db-filter-btn db-toggle-all ${this.showAllCards ? 'active' : ''}" id="db-toggle-all">
                  ${this.showAllCards ? '👁 Owned Only' : '👁 Show All'}
                </button>
              ` : ''}
            </div>

            <!-- Card grid -->
            <div class="db-card-pool" id="db-card-pool">
              ${pool.map(card => {
      const copies = deckCounts[card.id] || 0;
      const ownedCount = ownershipMap ? (ownershipMap.get(card.id) || 0) : MAX_COPIES_PER_CARD;
      const maxCopies = Math.min(ownedCount, MAX_COPIES_PER_CARD);
      const atMax = copies >= maxCopies;
      const notOwned = ownershipMap && ownedCount === 0;
      return `
                  <div class="db-card ${atMax ? 'at-max' : ''} ${notOwned ? 'not-owned' : ''} ${this._getRegionColorClass(card.region)}"
                       data-add-id="${notOwned ? '' : card.id}" title="${card.name}\n${card.description}${notOwned ? '\n\n🔒 Not in your collection' : ''}">
                    <img class="db-card-img" src="./output-web/${card.id}.webp" alt="${card.name}"
                         onerror="this.style.display='none'" loading="lazy" />
                    ${copies > 0 ? `<div class="db-card-count">${copies}/${maxCopies}</div>` : ''}
                    ${notOwned ? '<div class="db-card-locked">🔒</div>' : ''}
                  </div>
                `;
    }).join('')}
              ${pool.length === 0 ? '<div class="db-empty">No cards match your filters</div>' : ''}
            </div>
          </div>

          <!-- Deck panel (right sidebar) -->
          <div class="db-deck-panel">
            <div class="db-deck-info">
              <input type="text" class="db-deck-name-input" id="db-deck-name"
                     placeholder="Enter deck name..." value="${this._escapeHtml(this.deckName)}" />
              <div class="db-deck-region-select">
                <label>Region:</label>
                <select id="db-region-select" class="db-region-dropdown">
                  ${['Northern', 'Eastern', 'Southern', 'Western'].map(r =>
      `<option value="${r}" ${this.deckRegion === r ? 'selected' : ''}>${r}</option>`
    ).join('')}
                </select>
              </div>
              <div class="db-deck-count">
                <span class="db-count-number">${this.deckCards.length}</span> cards
              </div>
            </div>

            <div class="db-deck-grid" id="db-deck-list">
              ${deckGroupList.length === 0 ? '<div class="db-deck-empty">Click cards to add them to your deck</div>' : ''}
              ${deckGroupList.map(({ card, count }) => `
                <div class="db-deck-card ${this._getRegionColorClass(card.region)}" data-remove-id="${card.id}">
                  <img class="db-card-img" src="./output-web/${card.id}.webp" alt="${card.name}"
                       onerror="this.style.display='none'" loading="lazy" />
                  <div class="db-deck-card-count">×${count}</div>
                  <button class="db-deck-card-remove" data-remove-id="${card.id}">✕</button>
                </div>
              `).join('')}
            </div>

            <div class="db-deck-actions">
              <button class="db-action-btn db-clear-btn" id="db-clear">🗑 Clear All</button>
              <button class="db-action-btn db-default-btn" id="db-load-default">📋 Load Default</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this._attachEventListeners();
  }

  // ─── Saved Decks List ─────────────────────────────────────

  _renderSavedList() {
    const decks = this._loadAll();

    this.container.innerHTML = `
      <div class="duel-deck-builder">
        <div class="db-header">
          <button class="db-back-btn" id="db-saved-back">← Back to Builder</button>
          <h2 class="db-title">📂 Saved Decks</h2>
          <div class="db-header-actions"></div>
        </div>

        <div class="db-saved-body">
          ${decks.length === 0 ? `
            <div class="db-no-decks">
              <p>No saved decks yet.</p>
              <p style="color:var(--text-muted);font-size:0.9rem">Build a deck and save it to see it here.</p>
            </div>
          ` : `
            <div class="db-saved-grid">
              ${decks.map((deck, i) => `
                <div class="db-saved-card">
                  <div class="db-saved-card-header ${this._getRegionColorClass(deck.region)}">
                    <h3>${this._escapeHtml(deck.name || 'Unnamed Deck')}</h3>
                    <span class="db-saved-region">${deck.region}</span>
                  </div>
                  <div class="db-saved-card-body">
                    <div class="db-saved-stat">${deck.cardIds.length} cards</div>
                    <div class="db-saved-preview">
                      ${deck.cardIds.slice(0, 5).map(id => {
      const c = this.cardDb.getCard(id);
      return c ? `<img class="db-saved-thumb" src="./output-web/${id}.webp" alt="${c.name}" onerror="this.style.display='none'" />` : '';
    }).join('')}
                      ${deck.cardIds.length > 5 ? `<span class="db-saved-more">+${deck.cardIds.length - 5}</span>` : ''}
                    </div>
                  </div>
                  <div class="db-saved-card-actions">
                    <button class="db-action-btn" data-load-deck="${i}">📂 Load</button>
                    <button class="db-action-btn" data-edit-deck="${i}">✏️ Edit</button>
                    <button class="db-action-btn db-delete-btn" data-delete-deck="${i}">🗑</button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;

    // Back to builder
    document.getElementById('db-saved-back').onclick = () => {
      this.showingSaved = false;
      this._render();
    };

    // Load, Edit, Delete handlers
    this.container.querySelectorAll('[data-load-deck]').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.loadDeck);
        const deck = decks[idx];
        if (deck) {
          this.deckName = deck.name;
          this.deckRegion = deck.region;
          this.deckCards = [...deck.cardIds];
          this.editingIndex = idx;
          this.showingSaved = false;
          this._render();
          this._showToast(`Loaded "${deck.name}"`);
        }
      };
    });

    this.container.querySelectorAll('[data-edit-deck]').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.editDeck);
        const deck = decks[idx];
        if (deck) {
          this.deckName = deck.name;
          this.deckRegion = deck.region;
          this.deckCards = [...deck.cardIds];
          this.editingIndex = idx;
          this.showingSaved = false;
          this._render();
        }
      };
    });

    this.container.querySelectorAll('[data-delete-deck]').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.deleteDeck);
        const deck = decks[idx];
        if (deck && confirm(`Delete "${deck.name}"?`)) {
          decks.splice(idx, 1);
          this._saveAll(decks);
          this._renderSavedList();
          this._showToast('Deck deleted');
        }
      };
    });
  }

  // ─── Event Listeners ──────────────────────────────────────

  _attachEventListeners() {
    // Back button
    document.getElementById('db-back').onclick = () => this.onBack();

    // Save
    document.getElementById('db-save').onclick = () => this._saveDeck();

    // Load (show saved list)
    document.getElementById('db-load').onclick = () => {
      this.showingSaved = true;
      this._render();
    };

    // Toggle show all cards
    const toggleAllBtn = document.getElementById('db-toggle-all');
    if (toggleAllBtn) {
      toggleAllBtn.onclick = () => {
        this.showAllCards = !this.showAllCards;
        this._render();
      };
    }

    // Region filters
    this.container.querySelectorAll('[data-filter-region]').forEach(btn => {
      btn.onclick = () => {
        this.filterRegion = btn.dataset.filterRegion;
        this._render();
      };
    });

    // Type filters
    this.container.querySelectorAll('[data-filter-type]').forEach(btn => {
      btn.onclick = () => {
        this.filterType = btn.dataset.filterType;
        this._render();
      };
    });

    // Search
    const searchInput = document.getElementById('db-search');
    if (searchInput) {
      searchInput.oninput = () => {
        this.searchQuery = searchInput.value;
        this._render();
        // Re-focus search after render
        const newSearch = document.getElementById('db-search');
        if (newSearch) {
          newSearch.focus();
          newSearch.selectionStart = newSearch.selectionEnd = newSearch.value.length;
        }
      };
    }

    // Deck name
    const nameInput = document.getElementById('db-deck-name');
    if (nameInput) {
      nameInput.oninput = () => { this.deckName = nameInput.value; };
    }

    // Region dropdown
    const regionSelect = document.getElementById('db-region-select');
    if (regionSelect) {
      regionSelect.onchange = () => { this.deckRegion = regionSelect.value; };
    }

    // Add card from pool
    this.container.querySelectorAll('[data-add-id]').forEach(el => {
      el.onclick = () => {
        const cardId = el.dataset.addId;
        if (!cardId) return; // locked card
        const card = this.cardDb.getCard(cardId);
        if (!card) return;
        const count = this.deckCards.filter(id => id === cardId).length;
        const ownedCount = this.collection ? (this.collection.get(cardId) || 0) : MAX_COPIES_PER_CARD;
        const maxAllowed = Math.min(ownedCount, MAX_COPIES_PER_CARD);
        if (count < maxAllowed) {
          this.deckCards.push(cardId);
          this._render();
        }
      };
    });

    // Remove card from deck
    this.container.querySelectorAll('[data-remove-id]').forEach(el => {
      if (el.tagName === 'BUTTON') {
        el.onclick = (e) => {
          e.stopPropagation();
          const cardId = el.dataset.removeId;
          const idx = this.deckCards.lastIndexOf(cardId);
          if (idx !== -1) {
            this.deckCards.splice(idx, 1);
            this._render();
          }
        };
      } else {
        // Click on entry row also removes one copy
        el.onclick = () => {
          const cardId = el.dataset.removeId;
          const idx = this.deckCards.lastIndexOf(cardId);
          if (idx !== -1) {
            this.deckCards.splice(idx, 1);
            this._render();
          }
        };
      }
    });

    // Clear
    document.getElementById('db-clear').onclick = () => {
      this.deckCards = [];
      this._render();
    };

    // Load default
    document.getElementById('db-load-default').onclick = () => {
      const defaultIds = this.cardDb.getStartingDeck(this.deckRegion);
      this.deckCards = [...defaultIds];
      this._render();
      this._showToast(`Loaded default ${this.deckRegion} deck`);
    };
  }

  // ─── Save Logic ───────────────────────────────────────────

  _saveDeck() {
    if (this.deckCards.length === 0) {
      this._showToast('Deck is empty!', 'error');
      return;
    }
    if (!this.deckName.trim()) {
      this._showToast('Please name your deck', 'error');
      return;
    }

    // Validate: all landmarks must belong to the deck's region
    const invalidLandmarks = this.deckCards.filter(id => {
      const card = this.cardDb.getCard(id);
      return card && card.type === 'Landmark' && card.region !== this.deckRegion;
    });
    if (invalidLandmarks.length > 0) {
      this._showToast(`Landmarks must be from ${this.deckRegion} region only`, 'error');
      return;
    }

    const decks = this._loadAll();
    const deckData = {
      name: this.deckName.trim(),
      region: this.deckRegion,
      cardIds: [...this.deckCards],
      savedAt: Date.now(),
    };

    if (this.editingIndex >= 0 && this.editingIndex < decks.length) {
      decks[this.editingIndex] = deckData;
    } else {
      decks.push(deckData);
      this.editingIndex = decks.length - 1;
    }

    this._saveAll(decks);
    this._showToast(`"${deckData.name}" saved!`);
  }

  // ─── Deck Selection Screen (called from GameUI) ─────────────

  /**
   * Landmark images for each region (used as standard deck covers).
   */
  static REGION_LANDMARKS = {
    Northern: { id: 'N001', name: 'The Frostfell Citadel', img: './cosmetics/N001.png' },
    Eastern: { id: 'E001', name: 'Hidden Monastery', img: './cosmetics/E001.png' },
    Southern: { id: 'S001', name: 'Arena of Trials', img: './cosmetics/S001.png' },
    Western: { id: 'W001', name: 'Echoing Canyon', img: './cosmetics/W001.png' },
  };

  /**
   * Show a full deck selection screen with 4 standard region decks
   * and all custom-created decks.
   * @param {string} playerName - e.g. "Player 1" or "You"
   * @param {string[]} [excludeRegions=[]] - regions already picked (for local duel)
   * @returns {Promise<{region: string, deckCardIds: string[]|null}>}
   */
  showDeckSelect(playerName, excludeRegions = []) {
    return new Promise(resolve => {
      const allSaved = this._loadAll();
      const regions = ['Northern', 'Eastern', 'Southern', 'Western'];

      const overlay = document.createElement('div');
      overlay.className = 'deck-select-overlay';
      overlay.innerHTML = `
        <div class="deck-select-screen">
          <h2 class="deck-select-title">${this._escapeHtml(playerName)}: Choose Your Deck</h2>
          <p class="deck-select-subtitle">Pick a standard region deck or one of your custom decks</p>

          <div class="deck-select-section">
            <h3 class="deck-select-section-label">Standard Decks</h3>
            <div class="deck-select-grid">
              ${regions.map(region => {
        const lm = DuelDeckBuilderUI.REGION_LANDMARKS[region];
        const disabled = excludeRegions.includes(region);
        return `
                  <div class="deck-tile ${this._getRegionColorClass(region)} ${disabled ? 'disabled' : ''}"
                       data-std-region="${region}">
                    <div class="deck-tile-img-wrap">
                      <img class="deck-tile-img" src="${lm.img}" alt="${lm.name}"
                           onerror="this.style.display='none'" />
                    </div>
                    <div class="deck-tile-info">
                      <span class="deck-tile-name">${region}</span>
                      <span class="deck-tile-desc">All ${region} cards</span>
                    </div>
                  </div>
                `;
      }).join('')}
            </div>
          </div>

          ${allSaved.length > 0 ? `
            <div class="deck-select-section">
              <h3 class="deck-select-section-label">Custom Decks</h3>
              <div class="deck-select-grid">
                ${allSaved.map((deck, i) => {
        const firstId = deck.cardIds && deck.cardIds.length > 0 ? deck.cardIds[0] : null;
        const firstCard = firstId ? this.cardDb.getCard(firstId) : null;
        const thumbSrc = firstId ? `./output-web/${firstId}.webp` : '';
        const disabled = excludeRegions.includes(deck.region);
        return `
                    <div class="deck-tile deck-tile-custom ${this._getRegionColorClass(deck.region)} ${disabled ? 'disabled' : ''}"
                         data-custom-idx="${i}">
                      <div class="deck-tile-img-wrap">
                        ${thumbSrc
            ? `<img class="deck-tile-img" src="${thumbSrc}" alt="${firstCard ? firstCard.name : ''}" onerror="this.style.display='none'" />`
            : `<div class="deck-tile-placeholder">⚔</div>`
          }
                      </div>
                      <div class="deck-tile-info">
                        <span class="deck-tile-name">${this._escapeHtml(deck.name || 'Unnamed')}</span>
                        <span class="deck-tile-desc">${deck.region} · ${deck.cardIds.length} cards</span>
                      </div>
                    </div>
                  `;
      }).join('')}
              </div>
            </div>
          ` : ''}

          <button class="deck-select-back" id="deck-select-back">← Back</button>
        </div>
      `;

      document.body.appendChild(overlay);

      // Standard deck clicks
      overlay.querySelectorAll('[data-std-region]:not(.disabled)').forEach(el => {
        el.onclick = () => {
          const region = el.dataset.stdRegion;
          overlay.remove();
          resolve({ region, deckCardIds: null });
        };
      });

      // Custom deck clicks
      overlay.querySelectorAll('[data-custom-idx]:not(.disabled)').forEach(el => {
        el.onclick = () => {
          const idx = parseInt(el.dataset.customIdx);
          const deck = allSaved[idx];
          overlay.remove();
          resolve({ region: deck.region, deckCardIds: [...deck.cardIds] });
        };
      });

      // Back button
      document.getElementById('deck-select-back').onclick = () => {
        overlay.remove();
        resolve(null); // null = user cancelled
      };
    });
  }

  /**
   * Legacy wrapper — still used by some callers.
   * @deprecated Use showDeckSelect instead
   */
  showDeckChoice(region, playerName) {
    return new Promise(resolve => {
      const saved = this.getSavedDecksForRegion(region);
      if (saved.length === 0) { resolve(null); return; }

      // Delegate to showDeckSelect, filter by region
      this.showDeckSelect(playerName).then(result => {
        if (!result) { resolve(null); return; }
        resolve(result.deckCardIds);
      });
    });
  }

  // ─── Helpers ──────────────────────────────────────────────

  _getRegionColorClass(region) {
    const map = { Northern: 'north', Eastern: 'east', Southern: 'south', Western: 'west' };
    return map[region] || '';
  }

  _escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  _showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `db-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
}
