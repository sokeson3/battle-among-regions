// ─────────────────────────────────────────────────────────────
// DeckBuilderUI.js — Card drafting UI for War Campaign
// Shows a pool of available cards and lets the player pick
// ─────────────────────────────────────────────────────────────

export class DeckBuilderUI {
  /**
   * @param {HTMLElement} container
   * @param {import('../engine/CardDatabase.js').CardDatabase} cardDb
   */
  constructor(container, cardDb) {
    this.container = container;
    this.cardDb = cardDb;
  }

  /**
   * Show a draft screen where the player can pick from ALL available cards,
   * grouped by region, until they reach the target deck size.
   *
   * Cards with quantity > 1 appear as multiple copies in the pool.
   * The player must start picking from their own region (at least 1 card)
   * before picking from other regions.
   *
   * @param {Object} opts
   * @param {string}   opts.playerName       - e.g. "Player 1"
   * @param {string}   opts.playerRegion     - The player's home region
   * @param {Object[]} opts.available        - Card template objects available to pick
   *                                           (already expanded for quantity, with draftId)
   * @param {number}   opts.maxPicks         - Maximum cards the player may pick
   * @param {number}   opts.currentDeckSize  - Cards already in the player's deck
   * @param {number}   opts.targetDeckSize   - Final deck size target
   * @param {boolean}  opts.mustStartOwn     - If true, must pick ≥1 from own region first
   * @returns {Promise<string[]>}            - Array of card IDs picked (may contain duplicates)
   */
  showDraftPick(opts) {
    const {
      playerName,
      playerRegion,
      available,
      maxPicks,
      currentDeckSize,
      targetDeckSize,
      mustStartOwn = false,
      existingDeckCardIds = [],
    } = opts;

    return new Promise(resolve => {
      const selected = new Set();        // Set of draftIds
      let hasPickedFromOwn = !mustStartOwn; // If not required, treat as satisfied
      let showExistingDeck = false;      // Toggle for existing deck section

      const regionOrder = [playerRegion, ...['Northern', 'Eastern', 'Southern', 'Western'].filter(r => r !== playerRegion)];

      const render = () => {
        const currentTotal = currentDeckSize + selected.size;
        const canPickMore = selected.size < maxPicks && currentTotal < targetDeckSize;

        // Check if player has picked at least one card from own region
        const selectedFromOwn = [...selected].some(draftId => {
          const card = available.find(c => c.draftId === draftId);
          return card && card.region === playerRegion;
        });
        hasPickedFromOwn = !mustStartOwn || selectedFromOwn || selected.size === 0;

        // Group cards by region
        const regionGroups = {};
        for (const region of regionOrder) {
          regionGroups[region] = available.filter(c => c.region === region);
        }

        // Build existing deck HTML if there are saved cards
        let existingDeckHTML = '';
        if (existingDeckCardIds.length > 0) {
          const existingCards = existingDeckCardIds.map(id => {
            const all = this.cardDb.getAllPlayableCards ? this.cardDb.getAllPlayableCards() : [];
            return all.find(c => c.id === id);
          }).filter(Boolean);

          existingDeckHTML = `
            <div class="existing-deck-section">
              <h3 class="existing-deck-toggle" id="toggle-existing-deck" style="
                color:var(--gold);margin:8px 0;font-family:Cinzel,serif;cursor:pointer;
                display:flex;align-items:center;gap:8px;user-select:none;
              ">
                <span style="transition:transform 0.2s;display:inline-block;transform:rotate(${showExistingDeck ? '90deg' : '0deg'})">▶</span>
                Cards Already in Deck (${existingDeckCardIds.length})
              </h3>
              ${showExistingDeck ? `
                <div class="deck-builder-grid">
                  ${existingCards.map(card => `
                    <div class="draft-card existing-card" style="opacity:0.7;pointer-events:none;border-color:var(--gold)">
                      <img class="draft-card-img" src="./output-web/${card.id}.webp" alt="${card.name}"
                           onerror="this.style.display='none'" loading="lazy" />
                      <div class="draft-card-info">
                        <div class="draft-card-name">${card.name}</div>
                        <div class="draft-card-type">${card.type}</div>
                        <div class="draft-card-stats">
                          ${card.type === 'Unit' ? `⚔${card.atk} ❤${card.hp}` : ''}
                          💎${card.manaCost}
                        </div>
                      </div>
                      <div class="draft-check" style="background:var(--gold);color:#000">★</div>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          `;
        }

        this.container.innerHTML = `
          <div class="deck-builder">
            <div class="deck-builder-header">
              <h2>${playerName}: Draft Cards</h2>
              <div class="deck-builder-counter">
                Deck: <span class="deck-count">${currentTotal}</span> / <span class="deck-target">${targetDeckSize}</span>
                <span style="color:var(--text-muted);margin-left:12px">
                  Pick up to ${Math.min(maxPicks - selected.size, targetDeckSize - currentTotal)} more
                </span>
              </div>
              ${mustStartOwn && !selectedFromOwn && selected.size === 0 ? `
                <div style="color:var(--gold);font-size:0.85rem;margin-top:4px">
                  ⚠ You must pick at least 1 card from your own region (${playerRegion}) first
                </div>
              ` : ''}
            </div>

            ${existingDeckHTML}

            ${regionOrder.map(region => {
          const cards = regionGroups[region];
          if (!cards || cards.length === 0) return '';
          const regionClass = this._getRegionClass(region);
          const isOwnRegion = region === playerRegion;
          // Disable non-own regions until at least 1 own-region card is picked
          const regionLocked = mustStartOwn && !selectedFromOwn && !isOwnRegion && selected.size === 0;

          return `
                <div class="draft-region-section${regionLocked ? ' region-locked' : ''}">
                  <h3 class="draft-region-title ${regionClass}" style="text-transform:capitalize">
                    ${region}${isOwnRegion ? ' (Your Region)' : ''}
                    ${regionLocked ? ' 🔒' : ''}
                  </h3>
                  <div class="deck-builder-grid">
                    ${cards.map(card => {
            const isSelected = selected.has(card.draftId);
            const disabled = regionLocked || (!isSelected && !canPickMore);
            return `
                        <div class="draft-card ${isSelected ? 'selected' : ''} ${disabled ? 'disabled' : ''} ${regionClass}"
                             data-draft-id="${card.draftId}" data-card-id="${card.id}" data-region="${card.region}">
                          <img class="draft-card-img" src="./output-web/${card.id}.webp" alt="${card.name}"
                               onerror="this.style.display='none'" loading="lazy" />
                          <div class="draft-card-info">
                            <div class="draft-card-name">${card.name}</div>
                            <div class="draft-card-type">${card.type}</div>
                            <div class="draft-card-stats">
                              ${card.type === 'Unit' ? `⚔${card.atk} ❤${card.hp}` : ''}
                              💎${card.manaCost}
                            </div>
                          </div>
                          ${isSelected ? '<div class="draft-check">✓</div>' : ''}
                        </div>
                      `;
          }).join('')}
                  </div>
                </div>
              `;
        }).join('')}

            <div class="deck-builder-actions">
              <button class="menu-btn primary" id="btn-confirm-draft">
                Confirm Selection (${selected.size})
              </button>
            </div>
          </div>
        `;

        // Wire card clicks
        this.container.querySelectorAll('.draft-card:not(.disabled):not(.existing-card)').forEach(el => {
          el.onclick = () => {
            const draftId = el.dataset.draftId;
            const cardRegion = el.dataset.region;

            if (selected.has(draftId)) {
              selected.delete(draftId);
            } else if (selected.size < maxPicks && currentDeckSize + selected.size < targetDeckSize) {
              // Check own-region constraint
              if (mustStartOwn && selected.size === 0 && cardRegion !== playerRegion) {
                return; // Must start from own region
              }
              selected.add(draftId);
            }
            render();
          };
        });

        // Wire existing deck toggle
        const toggleBtn = this.container.querySelector('#toggle-existing-deck');
        if (toggleBtn) {
          toggleBtn.onclick = () => {
            showExistingDeck = !showExistingDeck;
            render();
          };
        }

        // Confirm button
        const btn = this.container.querySelector('#btn-confirm-draft');
        if (btn) {
          btn.onclick = () => {
            // Resolve with card IDs (not draft IDs)
            const picks = [...selected].map(draftId => {
              const card = available.find(c => c.draftId === draftId);
              return card ? card.id : null;
            }).filter(Boolean);
            resolve(picks);
          };
        }
      };

      render();
    });
  }

  /**
   * Show modify screen (for tiebreaker round — swap up to N cards)
   */
  showModifyScreen(existingDeck, playerRegion, maxSwaps) {
    return new Promise(resolve => {
      const allCards = this.cardDb.getAllPlayableCards();
      const removed = new Set();
      const added = new Set();

      const render = () => {
        const deckCards = existingDeck.filter(id => !removed.has(id));
        const swapsUsed = removed.size;
        const canSwapMore = swapsUsed < maxSwaps;

        this.container.innerHTML = `
          <div class="deck-builder">
            <div class="deck-builder-header">
              <h2>Modify Your Deck</h2>
              <div class="deck-builder-counter">
                Swaps: ${swapsUsed} / ${maxSwaps}
                <span style="margin-left:12px">Deck: ${deckCards.length + added.size} cards</span>
              </div>
            </div>

            <h3 style="color:var(--gold);margin:16px 0 8px;font-family:Cinzel,serif">Your Current Deck</h3>
            <div class="deck-builder-grid">
              ${existingDeck.map(cardId => {
          const card = allCards.find(c => c.id === cardId);
          if (!card) return '';
          const isRemoved = removed.has(cardId);
          return `
                  <div class="draft-card ${isRemoved ? 'removed' : ''}" data-card-id="${cardId}" data-action="remove">
                    <img class="draft-card-img" src="./output-web/${cardId}.webp" alt="${card.name}"
                         onerror="this.style.display='none'" loading="lazy" />
                    <div class="draft-card-info">
                      <div class="draft-card-name">${card.name}</div>
                      <div class="draft-card-type">${card.type}</div>
                    </div>
                    ${isRemoved ? '<div class="draft-check" style="color:var(--lp-red)">✕</div>' : ''}
                  </div>
                `;
        }).join('')}
            </div>

            ${removed.size > 0 ? `
              <h3 style="color:var(--lp-green);margin:16px 0 8px;font-family:Cinzel,serif">Replacement Cards (pick ${removed.size})</h3>
              <div class="deck-builder-grid">
                ${allCards.filter(c => !existingDeck.includes(c.id) || removed.has(c.id))
              .filter(c => c.type === 'Landmark' ? c.region === playerRegion : true)
              .slice(0, 40)
              .map(card => {
                const isAdded = added.has(card.id);
                const canAdd = !isAdded && added.size < removed.size;
                return `
                      <div class="draft-card ${isAdded ? 'selected' : ''} ${!canAdd && !isAdded ? 'disabled' : ''}"
                           data-card-id="${card.id}" data-action="add">
                        <img class="draft-card-img" src="./output-web/${card.id}.webp" alt="${card.name}"
                             onerror="this.style.display='none'" loading="lazy" />
                        <div class="draft-card-info">
                          <div class="draft-card-name">${card.name}</div>
                          <div class="draft-card-type">${card.type}</div>
                        </div>
                        ${isAdded ? '<div class="draft-check">✓</div>' : ''}
                      </div>
                    `;
              }).join('')}
              </div>
            ` : ''}

            <div class="deck-builder-actions">
              <button class="menu-btn primary" id="btn-confirm-modify"
                      ${removed.size !== added.size ? 'disabled style="opacity:0.5"' : ''}>
                Confirm Modifications
              </button>
            </div>
          </div>
        `;

        // Wire clicks
        this.container.querySelectorAll('.draft-card[data-action="remove"]').forEach(el => {
          el.onclick = () => {
            const cardId = el.dataset.cardId;
            if (removed.has(cardId)) {
              removed.delete(cardId);
              while (added.size > removed.size) {
                const last = [...added].pop();
                added.delete(last);
              }
            } else if (canSwapMore) {
              removed.add(cardId);
            }
            render();
          };
        });

        this.container.querySelectorAll('.draft-card[data-action="add"]:not(.disabled)').forEach(el => {
          el.onclick = () => {
            const cardId = el.dataset.cardId;
            if (added.has(cardId)) {
              added.delete(cardId);
            } else if (added.size < removed.size) {
              added.add(cardId);
            }
            render();
          };
        });

        const btn = this.container.querySelector('#btn-confirm-modify');
        if (btn && removed.size === added.size) {
          btn.onclick = () => {
            const finalDeck = existingDeck.filter(id => !removed.has(id));
            finalDeck.push(...added);
            resolve(finalDeck);
          };
        }
      };

      render();
    });
  }

  _getRegionClass(region) {
    const map = { Northern: 'north', Eastern: 'east', Southern: 'south', Western: 'west' };
    return map[region] || '';
  }
}
