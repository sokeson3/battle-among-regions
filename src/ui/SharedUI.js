// ─────────────────────────────────────────────────────────────
// SharedUI.js — Shared UI utilities for both GameUI and OnlineGameUI
// ─────────────────────────────────────────────────────────────

// ─── Card Zoom ───────────────────────────────────────────────

/**
 * Show card zoomed to center of screen with click/ESC to dismiss.
 * @param {string} cardId — e.g. 'N025'
 */
export function showCardZoom(cardId) {
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

    overlay.onclick = (e) => {
        if (!e.target.closest('.card-zoom-container')) overlay.remove();
    };
    const escHandler = (e) => {
        if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);
}

// ─── Choice Dialog ───────────────────────────────────────────

/**
 * Show a generic choice dialog with optional card images.
 * @param {HTMLElement} container — element to append the overlay to (or document.body)
 * @param {Array} options — [{label, value, cardId?}, ...]
 * @param {string} description — dialog title
 * @param {Function} callback — receives the chosen option object
 */
export function showChoiceDialog(container, options, description, callback) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:200;display:flex;align-items:center;justify-content:center';

    overlay.innerHTML = `
    <div class="choice-dialog">
      <h3>${description}</h3>
      <div class="choice-options" style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:600px">
        ${options.map((opt, i) => {
        const label = opt.label || opt;
        const cardId = opt.cardId || (typeof opt.value === 'string' && opt.value.match(/^[A-Z]\d{3}$/) ? opt.value : null);
        if (cardId) {
            return `
              <div class="choice-option" data-idx="${i}" style="display:flex;flex-direction:column;align-items:center;padding:8px;max-width:120px">
                <img src="./output-web/${cardId}.webp" alt="${label}"
                     class="popup-card-thumb" data-card-id="${cardId}"
                     style="width:80px;height:112px;object-fit:contain;border-radius:6px;margin-bottom:6px;border:1px solid var(--glass-border)" />
                <span style="font-size:0.7rem;text-align:center">${label}</span>
              </div>
            `;
        }
        return `<div class="choice-option" data-idx="${i}">${label}</div>`;
    }).join('')}
      </div>
    </div>
  `;

    container.appendChild(overlay);

    // Click outside dialog to cancel
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            overlay.remove();
            callback(options[0]);
        }
    };
    overlay.querySelector('.choice-dialog').onclick = (e) => e.stopPropagation();

    overlay.querySelectorAll('.choice-option').forEach(el => {
        el.onclick = () => {
            const idx = parseInt(el.dataset.idx);
            overlay.remove();
            callback(options[idx]);
        };
    });

    attachPopupHoverZoom(overlay);
}

// ─── Target Selection Dialog ─────────────────────────────────

/**
 * Show a popup dialog for selecting from a list of targets (cards with images).
 * @param {HTMLElement} container
 * @param {Array} targets — objects with {instanceId, cardId, name, ...}
 * @param {string} description
 * @param {Function} callback — receives the chosen target, or null for cancel
 */
export function showTargetSelectionDialog(container, targets, description, callback) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:200;display:flex;align-items:center;justify-content:center';

    overlay.innerHTML = `
    <div class="choice-dialog">
      <h3>Select Target</h3>
      <p>${description}</p>
      <div class="choice-options" style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:600px">
        ${targets.map((t, i) => `
          <div class="choice-option" data-idx="${i}" style="display:flex;flex-direction:column;align-items:center;padding:8px;max-width:120px">
            <img src="./output-web/${t.cardId}.webp" alt="${t.name}"
                 class="popup-card-thumb" data-card-id="${t.cardId}"
                 style="width:80px;height:112px;object-fit:contain;border-radius:6px;margin-bottom:6px;border:1px solid var(--glass-border)" onerror="this.style.display='none'" />
            <span style="font-size:0.7rem;text-align:center">${t.name}</span>
          </div>
        `).join('')}
      </div>
      <button class="menu-btn target-cancel-btn" style="margin-top:16px;padding:10px 28px;opacity:0.8">✕ Cancel</button>
    </div>
  `;

    container.appendChild(overlay);

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

    overlay.querySelector('.target-cancel-btn').onclick = () => {
        overlay.remove();
        callback(null);
    };

    attachPopupHoverZoom(overlay);
}

// ─── Response Dialog ─────────────────────────────────────────

/**
 * Show a response dialog for activating face-down cards.
 * @param {HTMLElement} container
 * @param {Array} cards — [{instanceId, cardId, name, canActivate?, reason?}, ...]
 * @param {Function} callback — receives {activate: bool, cardInstanceId?}
 * @param {Object} opts — optional {chainHtml, triggerDesc, attackContextHtml}
 */
export function showResponseDialog(container, cards, callback, opts = {}) {
    const { chainHtml = '', triggerDesc = '', attackContextHtml = '' } = opts;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:70;display:flex;align-items:center;justify-content:center';

    overlay.innerHTML = `
    <div class="response-card-dialog">
      <h3 class="response-title">⚡ Respond?</h3>
      ${triggerDesc ? `<p style="color:var(--text-secondary);font-size:0.8rem;margin-bottom:4px">${triggerDesc}</p>` : ''}
      ${attackContextHtml}
      ${chainHtml}
      <p style="color:var(--text-secondary);font-size:0.75rem;margin-bottom:12px">Activate a face-down card in response?</p>
      <div class="response-cards" style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;max-width:600px">
        ${cards.map(c => {
        const disabled = c.canActivate === false;
        return `
            <div class="response-card-option ${disabled ? 'disabled' : ''}" style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px;border-radius:8px;border:1px solid var(--glass-border);max-width:130px;background:rgba(255,255,255,0.03)${disabled ? ';opacity:0.4;pointer-events:none' : ''}">
              <img src="./output-web/${c.cardId}.webp" alt="${c.name}"
                   class="popup-card-thumb response-card-img" data-card-id="${c.cardId}"
                   style="width:80px;height:112px;object-fit:contain;border-radius:6px;border:1px solid var(--glass-border)" />
              <span style="font-size:0.7rem;color:var(--text-primary);text-align:center">${c.name}</span>
              ${c.reason ? `<span style="font-size:0.55rem;color:var(--text-muted);text-align:center">${c.reason}</span>` : ''}
              <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:center">
                ${!disabled ? `<button class="menu-btn resp-activate-btn" data-instance="${c.instanceId}" style="padding:4px 12px;font-size:0.65rem">⚡ Activate</button>` : ''}
                <button class="menu-btn resp-view-btn" data-card-id="${c.cardId}" style="padding:4px 8px;font-size:0.65rem;opacity:0.7">🔍</button>
              </div>
            </div>
          `;
    }).join('')}
      </div>
      <button class="menu-btn resp-pass-btn" style="margin-top:16px;padding:10px 28px;opacity:0.8">No, Pass</button>
    </div>
  `;

    container.appendChild(overlay);

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
            callback({ activate: true, cardInstanceId: btn.dataset.instance });
        };
    });

    // View Details buttons — open zoom without closing the dialog
    overlay.querySelectorAll('.resp-view-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            showCardZoom(btn.dataset.cardId);
        };
    });

    attachPopupHoverZoom(overlay);
}

// ─── Card Action Menu ────────────────────────────────────────

/**
 * Show a floating action menu near a card (YGO-style).
 * @param {DOMRect} rect — bounding rect of the triggering card
 * @param {Array} options — [{label, value, icon}, ...]
 * @param {Function} callback — receives the chosen option
 */
export function showCardActionMenu(rect, options, callback) {
    document.querySelectorAll('.card-action-menu-overlay').forEach(e => e.remove());

    const overlay = document.createElement('div');
    overlay.className = 'card-action-menu-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:65;';

    const menu = document.createElement('div');
    menu.className = 'card-action-menu';
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

    menu.querySelectorAll('.card-action-option').forEach(el => {
        el.onclick = (e) => {
            e.stopPropagation();
            const idx = parseInt(el.dataset.idx);
            overlay.remove();
            callback(options[idx]);
        };
    });

    overlay.onclick = (e) => {
        if (e.target === overlay) overlay.remove();
    };
}

// ─── Hover-to-Zoom ───────────────────────────────────────────

/**
 * Attach hover-to-zoom behavior on card images inside popup dialogs.
 * Shows a larger preview next to the hovered .popup-card-thumb or .response-card-img
 */
export function attachPopupHoverZoom(container) {
    const imgs = container.querySelectorAll('.popup-card-thumb, .response-card-img');
    let preview = null;

    imgs.forEach(img => {
        img.style.cursor = 'pointer';

        img.addEventListener('mouseenter', () => {
            const cardId = img.dataset.cardId || img.alt;
            const src = img.src;
            if (!src) return;

            // Build stat tokens HTML if card has stat data
            let statHtml = '';
            if (img.dataset.atk !== undefined && img.dataset.atk !== '') {
                const atk = parseInt(img.dataset.atk);
                const def = parseInt(img.dataset.def);
                const baseAtk = parseInt(img.dataset.baseAtk);
                const baseDef = parseInt(img.dataset.baseDef);
                const damage = parseInt(img.dataset.damage || '0');
                const remainingDef = def - damage;

                const atkColor = atk > baseAtk ? '#4cff4c' : atk < baseAtk ? '#ff4c4c' : '#fff';
                const defColor = remainingDef > baseDef ? '#4cff4c' : remainingDef < baseDef ? '#ff4c4c' : '#fff';

                statHtml = `
          <div style="display:flex;justify-content:space-between;width:200px;margin-top:6px;gap:4px">
            <div style="flex:1;background:rgba(255,60,60,0.2);border:1px solid rgba(255,60,60,0.4);border-radius:6px;padding:4px 8px;text-align:center;font-size:0.8rem;font-weight:bold;color:${atkColor}">
              ⚔ ${atk}${atk !== baseAtk ? ` <span style="font-size:0.65rem;opacity:0.6">(${baseAtk})</span>` : ''}
            </div>
            <div style="flex:1;background:rgba(60,120,255,0.2);border:1px solid rgba(60,120,255,0.4);border-radius:6px;padding:4px 8px;text-align:center;font-size:0.8rem;font-weight:bold;color:${defColor}">
              🛡 ${remainingDef}${remainingDef !== baseDef ? ` <span style="font-size:0.65rem;opacity:0.6">(${baseDef})</span>` : ''}
            </div>
          </div>
        `;
            }

            preview = document.createElement('div');
            preview.className = 'popup-hover-preview';
            preview.innerHTML = `
        <img src="${src}" alt="${cardId}" style="width:200px;height:auto;border-radius:var(--radius-card);box-shadow:0 8px 32px rgba(0,0,0,0.8),0 0 30px rgba(255,213,79,0.15)" />
        ${statHtml}
      `;
            preview.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;';
            document.body.appendChild(preview);

            const rect = img.getBoundingClientRect();
            const previewW = 220;
            let left = rect.right + 12;
            if (left + previewW > window.innerWidth) left = rect.left - previewW - 12;
            let top = rect.top;
            const previewH = statHtml ? 340 : 300;
            if (top + previewH > window.innerHeight) top = window.innerHeight - previewH - 10;
            preview.style.left = `${left}px`;
            preview.style.top = `${top}px`;
        });

        img.addEventListener('mouseleave', () => {
            if (preview) { preview.remove(); preview = null; }
        });
    });
}

// ─── Attack Target Highlights ────────────────────────────────

/**
 * Highlight attack source and valid target slots with glowing borders.
 * @param {string} attackerInstanceId
 * @param {Array} targetSlots — array of {instanceId} to highlight as targets
 * @param {HTMLElement} [oppBar] — optional opponent LP bar element to highlight
 */
export function highlightAttackTargets(attackerInstanceId, targetSlots, oppBar) {
    removeAttackHighlights();

    const attackerEl = document.querySelector(`.card-slot[data-instance="${attackerInstanceId}"]`);
    if (attackerEl) {
        attackerEl.style.outline = '3px solid #ff6b6b';
        attackerEl.style.outlineOffset = '2px';
        attackerEl.style.boxShadow = '0 0 16px 4px rgba(255,107,107,0.5)';
        attackerEl.style.zIndex = '160';
        attackerEl.style.position = 'relative';
        attackerEl.classList.add('attack-highlight-source');
    }

    for (const slot of targetSlots) {
        const slotEl = document.querySelector(`.card-slot[data-instance="${slot.instanceId}"]`);
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

    if (oppBar) {
        oppBar.style.outline = '2px solid #ffd700';
        oppBar.style.boxShadow = '0 0 12px 2px rgba(255,215,0,0.3)';
        oppBar.classList.add('target-highlight');
    }
}

/**
 * Remove all attack target highlights.
 */
export function removeAttackHighlights() {
    document.querySelectorAll('.target-highlight, .attack-highlight-source').forEach(el => {
        el.style.outline = '';
        el.style.outlineOffset = '';
        el.style.boxShadow = '';
        el.style.zIndex = '';
        el.style.cursor = '';
        el.classList.remove('target-highlight', 'attack-highlight-source');
    });
}

// ─── Toast ───────────────────────────────────────────────────

/**
 * Show a temporary toast notification.
 * @param {string} message
 * @param {number} [duration=2500] — ms to show
 */
export function showToast(message, duration = 2500) {
    const existing = document.querySelector('.toast-message');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ─── Rendering Helpers ───────────────────────────────────────

/**
 * Render a card's visual (image).
 */
export function renderCardVisual(card) {
    const imgPath = `./output-web/${card.cardId}.webp`;
    return `
    <img class="card-image" src="${imgPath}" alt="${card.name}"
         onerror="this.parentElement.classList.add('no-art')" loading="lazy"
         style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-card)" />
  `;
}

/**
 * Render stat tokens (ATK/DEF) for a unit card.
 */
export function renderStatTokens(card) {
    if (!card || card.type !== 'Unit') return '';
    const effectiveATK = card.currentATK;
    const remainingDEF = card.currentDEF - card.damageTaken;
    const atkClass = effectiveATK > card.baseATK ? 'stat-increased' : effectiveATK < card.baseATK ? 'stat-decreased' : '';
    const defClass = remainingDEF > card.baseDEF ? 'stat-increased' : remainingDEF < card.baseDEF ? 'stat-decreased' : '';
    return `
    <div class="stat-token atk-token ${atkClass}">⚔${effectiveATK}</div>
    <div class="stat-token def-token ${defClass}">🛡${remainingDEF}</div>
  `;
}

/**
 * Map region name to CSS class.
 */
export function getRegionClass(region) {
    const map = { Northern: 'north', Eastern: 'east', Southern: 'south', Western: 'west' };
    return map[region] || '';
}
