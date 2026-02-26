// ─────────────────────────────────────────────────────────────
// DuelDeckBuilderUI.js — Create, save, and load custom decks
// for duel mode (Regional Match)
// ─────────────────────────────────────────────────────────────

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

  show() {
    this.deckCards = [];
    this.deckName = '';
    this.deckRegion = 'Northern';
    this.filterRegion = 'all';
    this.filterType = 'all';
    this.searchQuery = '';
    this.editingIndex = -1;
    this.showingSaved = false;
    this._render();
  }

  // ─── Main Render ──────────────────────────────────────────

  _render() {
    if (this.showingSaved) {
      this._renderSavedList();
      return;
    }

    const allCards = this.cardDb.getAllPlayableCards();

    // Apply filters
    let pool = allCards;
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
            </div>

            <!-- Card grid -->
            <div class="db-card-pool" id="db-card-pool">
              ${pool.map(card => {
      const copies = deckCounts[card.id] || 0;
      const maxCopies = card.quantity;
      const atMax = copies >= maxCopies;
      return `
                  <div class="db-card ${atMax ? 'at-max' : ''} ${this._getRegionColorClass(card.region)}"
                       data-add-id="${card.id}" title="${card.name}\n${card.description}">
                    <img class="db-card-img" src="./output-web/${card.id}.webp" alt="${card.name}"
                         onerror="this.style.display='none'" loading="lazy" />
                    <div class="db-card-overlay">
                      <div class="db-card-name">${card.name}</div>
                      <div class="db-card-meta">
                        <span class="db-card-type">${card.type}</span>
                        <span class="db-card-mana">💎${card.manaCost}</span>
                      </div>
                      ${card.type === 'Unit' ? `<div class="db-card-stats">⚔${card.atk} 🛡${card.hp}</div>` : ''}
                    </div>
                    ${copies > 0 ? `<div class="db-card-count">${copies}/${maxCopies}</div>` : ''}
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

            <div class="db-deck-list" id="db-deck-list">
              ${deckGroupList.length === 0 ? '<div class="db-deck-empty">Click cards to add them to your deck</div>' : ''}
              ${deckGroupList.map(({ card, count }) => `
                <div class="db-deck-entry ${this._getRegionColorClass(card.region)}" data-remove-id="${card.id}">
                  <img class="db-entry-img" src="./output-web/${card.id}.webp" alt="${card.name}"
                       onerror="this.style.display='none'" loading="lazy" />
                  <div class="db-entry-info">
                    <div class="db-entry-name">${card.name}</div>
                    <div class="db-entry-meta">${card.type} · 💎${card.manaCost}</div>
                  </div>
                  <div class="db-entry-count">×${count}</div>
                  <button class="db-entry-remove" data-remove-id="${card.id}">✕</button>
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
        const card = this.cardDb.getCard(cardId);
        if (!card) return;
        const count = this.deckCards.filter(id => id === cardId).length;
        if (count < card.quantity) {
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

  // ─── Deck Choice Dialog (called from GameUI) ──────────────

  /**
   * Show a modal to choose between default deck and saved decks.
   * @param {string} region - Player's selected region
   * @param {string} playerName - e.g. "Player 1"
   * @returns {Promise<string[]|null>} - card IDs array or null for default
   */
  showDeckChoice(region, playerName) {
    return new Promise(resolve => {
      const saved = this.getSavedDecksForRegion(region);

      // If no saved decks for this region, use default immediately
      if (saved.length === 0) {
        resolve(null);
        return;
      }

      // Create a modal overlay
      const overlay = document.createElement('div');
      overlay.className = 'db-choice-overlay';
      overlay.innerHTML = `
        <div class="db-choice-modal">
          <h2>${playerName}: Choose Your Deck</h2>
          <p class="db-choice-region">${region} Region</p>

          <div class="db-choice-options">
            <div class="db-choice-card db-choice-default" id="db-choice-default">
              <div class="db-choice-icon">📋</div>
              <div class="db-choice-label">Default Deck</div>
              <div class="db-choice-desc">Use the standard ${region} deck</div>
            </div>

            ${saved.map((deck, i) => `
              <div class="db-choice-card" data-choice-idx="${i}">
                <div class="db-choice-icon">⚔</div>
                <div class="db-choice-label">${this._escapeHtml(deck.name)}</div>
                <div class="db-choice-desc">${deck.cardIds.length} cards</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      // Default deck
      overlay.querySelector('#db-choice-default').onclick = () => {
        overlay.remove();
        resolve(null);
      };

      // Custom decks
      overlay.querySelectorAll('[data-choice-idx]').forEach(el => {
        el.onclick = () => {
          const idx = parseInt(el.dataset.choiceIdx);
          overlay.remove();
          resolve([...saved[idx].cardIds]);
        };
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
