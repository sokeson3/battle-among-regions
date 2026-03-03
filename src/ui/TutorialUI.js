// ─────────────────────────────────────────────────────────────
// TutorialUI.js — Interactive tutorial system for Battle Among Regions
// ─────────────────────────────────────────────────────────────

export class TutorialUI {
  /**
   * @param {import('./GameUI.js').GameUI} gameUI
   */
  constructor(gameUI) {
    this.gameUI = gameUI;
    this.app = document.getElementById('app');
    this.currentSlideIndex = 0;
    this.currentSlides = [];
    this.currentSection = null;
  }

  // ─── Tutorial Hub (selection screen) ─────────────────────

  showTutorial() {
    this.gameUI.currentScreen = 'tutorial';
    this.app.innerHTML = `
      <div class="tutorial-hub">
        <h1 class="tutorial-hub-title">📖 How to Play</h1>
        <p class="tutorial-hub-subtitle">Choose a tutorial section to begin learning</p>
        <div class="tutorial-mode-cards">
          <div class="tutorial-mode-card regional" id="tut-basics">
            <div class="tutorial-mode-icon">🎯</div>
            <h3>Game Basics</h3>
            <p>Learn the objective, regions, game setup, board layout, and turn phases.</p>
            <span class="tutorial-slide-count">6 lessons</span>
          </div>
          <div class="tutorial-mode-card card-types" id="tut-cards">
            <div class="tutorial-mode-icon">🃏</div>
            <h3>Card Types</h3>
            <p>Units, Spells, Traps, Landmarks, Tokens — master every card type.</p>
            <span class="tutorial-slide-count">6 lessons</span>
          </div>
          <div class="tutorial-mode-card mana" id="tut-mana">
            <div class="tutorial-mode-icon">💎</div>
            <h3>Mana & Resources</h3>
            <p>Primary mana, spell mana banking, and resource management strategy.</p>
            <span class="tutorial-slide-count">3 lessons</span>
          </div>
          <div class="tutorial-mode-card combat" id="tut-combat">
            <div class="tutorial-mode-icon">⚔</div>
            <h3>Combat & Effects</h3>
            <p>Battle phase, damage resolution, abilities, and the response chain system.</p>
            <span class="tutorial-slide-count">5 lessons</span>
          </div>
          <div class="tutorial-mode-card campaign" id="tut-modes">
            <div class="tutorial-mode-icon">🏰</div>
            <h3>Game Modes</h3>
            <p>vs AI, Solo Campaign, War Campaign drafting, and Online multiplayer.</p>
            <span class="tutorial-slide-count">4 lessons</span>
          </div>
        </div>
        <button class="menu-btn" id="tut-back" style="margin-top:32px;padding:12px 48px">Back to Menu</button>
      </div>
    `;

    document.getElementById('tut-basics').onclick = () => this._startSection('basics');
    document.getElementById('tut-cards').onclick = () => this._startSection('cards');
    document.getElementById('tut-mana').onclick = () => this._startSection('mana');
    document.getElementById('tut-combat').onclick = () => this._startSection('combat');
    document.getElementById('tut-modes').onclick = () => this._startSection('modes');
    document.getElementById('tut-back').onclick = () => this.gameUI.showMenu();
  }

  // ─── Section Launcher ────────────────────────────────────

  _startSection(section) {
    this.currentSection = section;
    this.currentSlideIndex = 0;
    const slideMap = {
      basics: this._getBasicsSlides(),
      cards: this._getCardTypesSlides(),
      mana: this._getManaSlides(),
      combat: this._getCombatSlides(),
      modes: this._getModesSlides(),
    };
    this.currentSlides = slideMap[section] || [];
    this._renderSlide();
  }

  // ─── Slide Renderer ──────────────────────────────────────

  _renderSlide() {
    const slide = this.currentSlides[this.currentSlideIndex];
    const total = this.currentSlides.length;
    const idx = this.currentSlideIndex;
    const sectionLabels = {
      basics: 'Game Basics',
      cards: 'Card Types',
      mana: 'Mana & Resources',
      combat: 'Combat & Effects',
      modes: 'Game Modes',
    };
    const sectionLabel = sectionLabels[this.currentSection] || 'Tutorial';

    this.app.innerHTML = `
      <div class="tutorial-viewer">
        <div class="tutorial-header">
          <button class="tutorial-back-btn" id="tut-back-hub">← Back</button>
          <span class="tutorial-section-label">${sectionLabel}</span>
          <span class="tutorial-progress-text">${idx + 1} / ${total}</span>
        </div>

        <div class="tutorial-slide">
          <h2 class="tutorial-slide-title">${slide.title}</h2>
          <div class="tutorial-slide-content">
            ${slide.content}
          </div>
        </div>

        <div class="tutorial-nav">
          <button class="tutorial-nav-btn ${idx === 0 ? 'disabled' : ''}" id="tut-prev">‹ Previous</button>
          <div class="tutorial-dots">
            ${this.currentSlides.map((_, i) => `
              <span class="tutorial-dot ${i === idx ? 'active' : ''} ${i < idx ? 'completed' : ''}" data-slide="${i}"></span>
            `).join('')}
          </div>
          <button class="tutorial-nav-btn primary ${idx === total - 1 ? 'finish' : ''}" id="tut-next">
            ${idx === total - 1 ? 'Finish ✓' : 'Next ›'}
          </button>
        </div>
      </div>
    `;

    // Wire navigation
    document.getElementById('tut-back-hub').onclick = () => this.showTutorial();

    if (idx > 0) {
      document.getElementById('tut-prev').onclick = () => {
        this.currentSlideIndex--;
        this._renderSlide();
      };
    }

    if (idx < total - 1) {
      document.getElementById('tut-next').onclick = () => {
        this.currentSlideIndex++;
        this._renderSlide();
      };
    } else {
      document.getElementById('tut-next').onclick = () => this.showTutorial();
    }

    // Clickable dots
    document.querySelectorAll('.tutorial-dot').forEach(dot => {
      dot.onclick = () => {
        this.currentSlideIndex = parseInt(dot.dataset.slide);
        this._renderSlide();
      };
    });

    // Wire interactive elements after rendering
    if (slide.onMount) {
      setTimeout(() => slide.onMount(), 50);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // SECTION 1: GAME BASICS (6 slides)
  // ═══════════════════════════════════════════════════════════

  _getBasicsSlides() {
    return [
      {
        title: 'Welcome to Battle Among Regions',
        content: `
          <div class="tut-block">
            <p>In <strong>Battle Among Regions</strong>, two players command armies from different regions, battling for supremacy using units, spells, traps, and powerful landmarks.</p>
            <div class="tut-highlight-box">
              <span class="tut-icon">🎯</span>
              <div>
                <strong>Goal:</strong> Reduce your opponent's <span class="tut-keyword lp">Life Points (LP)</span> to 0, or force them to run out of cards in their deck.
              </div>
            </div>
            <p>Each player starts with <strong>3000 LP</strong> and a deck of cards from their chosen region.</p>
            <div class="tut-interactive-demo" id="demo-lp">
              <p class="tut-demo-label">👆 Click to simulate damage</p>
              <div class="tut-lp-demo">
                <div class="tut-lp-bar-track">
                  <div class="tut-lp-bar-fill" id="demo-lp-fill" style="width:100%"></div>
                </div>
                <span class="tut-lp-text" id="demo-lp-text">3000 / 3000</span>
              </div>
            </div>
          </div>
        `,
        onMount: () => {
          let lp = 3000;
          const btn = document.getElementById('demo-lp');
          if (!btn) return;
          btn.onclick = () => {
            const dmg = Math.floor(Math.random() * 400) + 200;
            lp = Math.max(0, lp - dmg);
            const fill = document.getElementById('demo-lp-fill');
            const text = document.getElementById('demo-lp-text');
            if (fill) fill.style.width = `${(lp / 3000) * 100}%`;
            if (text) text.textContent = `${lp} / 3000`;
            if (lp <= 0 && text) text.textContent = '0 / 3000 — DEFEATED!';
            // Flash effect
            if (fill) {
              fill.classList.add('tut-damage-flash');
              setTimeout(() => fill.classList.remove('tut-damage-flash'), 300);
            }
          };
        }
      },
      {
        title: 'The Four Regions',
        content: `
          <div class="tut-block">
            <p>Each region has a distinct playstyle and unique cards. Choose the one that fits your strategy!</p>
            <div class="tut-region-grid">
              <div class="tut-region-item north tut-region-hover" id="reg-north">
                <h4>❄ Northern</h4>
                <p>Resilient defenders. Masters of healing, fortification, and outlasting opponents.</p>
                <div class="tut-region-detail" id="reg-north-detail">
                  <span>🛡 High DEF units</span><span>💚 LP healing</span><span>🏔 Defensive traps</span>
                </div>
              </div>
              <div class="tut-region-item east tut-region-hover" id="reg-east">
                <h4>🌿 Eastern</h4>
                <p>Cunning strategists. Spell mastery, shadow tactics, and battlefield control.</p>
                <div class="tut-region-detail" id="reg-east-detail">
                  <span>✦ Spell synergy</span><span>👁 Card draw</span><span>🌑 Shadow clones</span>
                </div>
              </div>
              <div class="tut-region-item south tut-region-hover" id="reg-south">
                <h4>🔥 Southern</h4>
                <p>Aggressive warriors. Raw power, piercing strikes, and relentless pressure.</p>
                <div class="tut-region-detail" id="reg-south-detail">
                  <span>⚔ High ATK units</span><span>🔥 Burn damage</span><span>💥 Piercing attacks</span>
                </div>
              </div>
              <div class="tut-region-item west tut-region-hover" id="reg-west">
                <h4>🌅 Western</h4>
                <p>Adaptable tricksters. Unit synergy, effect manipulation, and surprise combos.</p>
                <div class="tut-region-detail" id="reg-west-detail">
                  <span>🔄 Effect combos</span><span>🐅 Token summons</span><span>🎭 Manipulation</span>
                </div>
              </div>
            </div>
            <p style="color:var(--text-muted);font-size:0.8rem;text-align:center">Hover over a region to see its strengths</p>
          </div>
        `
      },
      {
        title: 'Game Setup',
        content: `
          <div class="tut-block">
            <p>Before the battle begins, each player goes through a setup phase:</p>
            <div class="tut-steps">
              <div class="tut-step">
                <span class="tut-step-num">1</span>
                <div>
                  <strong>Choose Your Region</strong>
                  <p>Select which region to play. Each player must pick a different region.</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">2</span>
                <div>
                  <strong>Landmark Placement</strong>
                  <p>If your deck contains Landmark cards, you may place one for free before the game starts. Landmarks give persistent bonuses throughout the match.</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">3</span>
                <div>
                  <strong>Draw Starting Hand</strong>
                  <p>You receive <strong>5 cards</strong> from your deck as your opening hand.</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">4</span>
                <div>
                  <strong>Mulligan</strong>
                  <p>You may exchange any cards from your hand for new ones from your deck — once only! Choose wisely which cards to keep.</p>
                </div>
              </div>
            </div>
          </div>
        `
      },
      {
        title: 'The Game Board',
        content: `
          <div class="tut-block">
            <p>The battlefield is where all the action happens. Each player's side has these zones:</p>
            <div class="tut-board-diagram">
              <div class="tut-board-zone landmark">🏛 Landmark Zone<span>1 slot — your region's landmark</span></div>
              <div class="tut-board-zones-row">
                <div class="tut-board-zone unit">⚔ Unit Zone<span>5 slots — your fighting units</span></div>
              </div>
              <div class="tut-board-zones-row">
                <div class="tut-board-zone spelltrap">✦ Spell/Trap Zone<span>5 slots — set spells & traps face-down</span></div>
              </div>
              <div class="tut-board-zones-row side">
                <div class="tut-board-zone deck">📚 Deck<span>Draw cards each turn</span></div>
                <div class="tut-board-zone grave">💀 Graveyard<span>Destroyed cards go here</span></div>
              </div>
            </div>
            <p style="margin-top:12px; color:var(--text-secondary); font-size:0.85rem">Your field is at the bottom, your opponent's is at the top (mirrored). The divider between fields shows the current phase.</p>
          </div>
        `
      },
      {
        title: 'Turn Structure',
        content: `
          <div class="tut-block">
            <p>Each turn follows a fixed sequence of <strong>5 phases</strong>. Click each phase to learn more:</p>
            <div class="tut-phase-flow">
              <div class="tut-phase tut-phase-click active" data-phase="draw">
                <span class="tut-phase-icon">🃏</span>
                <strong>Draw</strong>
              </div>
              <div class="tut-phase-arrow">→</div>
              <div class="tut-phase tut-phase-click" data-phase="main1">
                <span class="tut-phase-icon">🔧</span>
                <strong>Main 1</strong>
              </div>
              <div class="tut-phase-arrow">→</div>
              <div class="tut-phase tut-phase-click" data-phase="battle">
                <span class="tut-phase-icon">⚔</span>
                <strong>Battle</strong>
              </div>
              <div class="tut-phase-arrow">→</div>
              <div class="tut-phase tut-phase-click" data-phase="main2">
                <span class="tut-phase-icon">🔧</span>
                <strong>Main 2</strong>
              </div>
              <div class="tut-phase-arrow">→</div>
              <div class="tut-phase tut-phase-click" data-phase="end">
                <span class="tut-phase-icon">🏁</span>
                <strong>End</strong>
              </div>
            </div>
            <div class="tut-phase-detail" id="phase-detail">
              <p><strong>🃏 Draw Phase:</strong> Draw 1 card from your deck. Skipped on the very first turn of the game.</p>
            </div>
          </div>
        `,
        onMount: () => {
          const details = {
            draw: '<p><strong>🃏 Draw Phase:</strong> Draw 1 card from your deck. Skipped on the very first turn of the game so the starting player doesn\'t get an extra card advantage.</p>',
            main1: '<p><strong>🔧 Main Phase 1:</strong> Play units, cast spells face-up, set spells/traps face-down, play landmarks, change unit positions (ATK ↔ DEF), or activate abilities. This is your primary action phase.</p>',
            battle: '<p><strong>⚔ Battle Phase:</strong> Declare attacks with your units against opponent units or directly at their LP. Each unit can attack once per turn. Your opponent can activate traps in response!</p>',
            main2: '<p><strong>🔧 Main Phase 2:</strong> Same actions as Main 1. Use this to play more cards after seeing how combat went, or to set traps before passing the turn.</p>',
            end: '<p><strong>🏁 End Phase:</strong> Your turn ends. Any unspent primary mana is banked as <em>spell mana</em> (up to 3 max). Some card effects trigger here. Then the turn passes to your opponent.</p>',
          };
          document.querySelectorAll('.tut-phase-click').forEach(el => {
            el.onclick = () => {
              document.querySelectorAll('.tut-phase-click').forEach(p => p.classList.remove('active'));
              el.classList.add('active');
              const box = document.getElementById('phase-detail');
              if (box) box.innerHTML = details[el.dataset.phase] || '';
            };
          });
        }
      },
      {
        title: 'Winning the Game',
        content: `
          <div class="tut-block">
            <p>Victory is achieved in one of these ways:</p>
            <div class="tut-steps">
              <div class="tut-step">
                <span class="tut-step-num">🏆</span>
                <div>
                  <strong>Reduce LP to 0</strong>
                  <p>Deal enough damage through combat and card effects to bring your opponent's Life Points to zero.</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">📚</span>
                <div>
                  <strong>Deck Out</strong>
                  <p>If a player must draw a card but has no cards left in their deck, they lose!</p>
                </div>
              </div>
            </div>
            <div class="tut-highlight-box">
              <span class="tut-icon">🎮</span>
              <div><strong>Multiplayer:</strong> In 3–4 player matches, the last player standing wins! Eliminated players' cards remain on the field until destroyed.</div>
            </div>
            <p style="text-align:center;margin-top:20px;color:var(--gold);font-family:'Cinzel',serif">Now let's learn about the different card types! →</p>
          </div>
        `
      }
    ];
  }

  // ═══════════════════════════════════════════════════════════
  // SECTION 2: CARD TYPES (6 slides)
  // ═══════════════════════════════════════════════════════════

  _getCardTypesSlides() {
    return [
      {
        title: 'Units — Your Fighting Force',
        content: `
          <div class="tut-block">
            <p><strong>Units</strong> are your soldiers. They fight on the battlefield and have two key stats:</p>
            <div class="tut-stats-display">
              <div class="tut-stat atk">
                <span>⚔ ATK</span>
                <p>Attack power — the damage this unit deals when attacking.</p>
              </div>
              <div class="tut-stat def">
                <span>🛡 DEF</span>
                <p>Defense points — the unit's health. When DEF reaches 0, the unit is destroyed.</p>
              </div>
            </div>
            <div class="tut-highlight-box tip">
              <span class="tut-icon">💡</span>
              <div><strong>Key rule:</strong> DEF works like HP — damage is permanent and accumulates across turns! A 500 DEF unit that takes 300 damage has only 200 DEF remaining.</div>
            </div>
            <div class="tut-interactive-demo" id="demo-unit-dmg">
              <p class="tut-demo-label">👆 Click to deal damage to this unit</p>
              <div class="tut-unit-demo">
                <div class="tut-mock-card">
                  <div class="tut-mock-card-name">Warrior</div>
                  <div class="tut-mock-card-stats">
                    <span class="tut-mock-atk">⚔ 600</span>
                    <span class="tut-mock-def" id="demo-unit-def">🛡 500</span>
                  </div>
                </div>
                <div class="tut-demo-status" id="demo-unit-status">Full health</div>
              </div>
            </div>
          </div>
        `,
        onMount: () => {
          let def = 500;
          const btn = document.getElementById('demo-unit-dmg');
          if (!btn) return;
          btn.onclick = () => {
            const dmg = Math.floor(Math.random() * 150) + 100;
            def = Math.max(0, def - dmg);
            const defEl = document.getElementById('demo-unit-def');
            const status = document.getElementById('demo-unit-status');
            if (defEl) defEl.textContent = `🛡 ${def}`;
            if (status) {
              if (def <= 0) status.textContent = '💀 Destroyed! Sent to graveyard.';
              else if (def <= 200) status.textContent = `⚠ Critical! Took ${dmg} damage.`;
              else status.textContent = `Took ${dmg} damage. Remaining: ${def} DEF.`;
            }
          };
        }
      },
      {
        title: 'Unit Positions — ATK vs DEF',
        content: `
          <div class="tut-block">
            <p>Units can be placed in two positions on the field:</p>
            <div class="tut-position-demo">
              <div class="tut-pos-card atk-pos">
                <div class="tut-pos-visual">⚔</div>
                <h4>ATK Position</h4>
                <p>Card faces upright. The unit <strong>can attack</strong> during the Battle Phase. When attacked, uses its <strong>DEF</strong> as health.</p>
                <div class="tut-pos-tag atk">Can attack</div>
              </div>
              <div class="tut-pos-vs">VS</div>
              <div class="tut-pos-card def-pos">
                <div class="tut-pos-visual sideways">🛡</div>
                <h4>DEF Position</h4>
                <p>Card is turned sideways. The unit <strong>cannot attack</strong> but when attacked, excess damage does <strong>NOT</strong> pierce to your LP.</p>
                <div class="tut-pos-tag def">Absorbs damage</div>
              </div>
            </div>
            <div class="tut-highlight-box tip">
              <span class="tut-icon">💡</span>
              <div><strong>Tip:</strong> You can switch a unit between ATK and DEF once per turn during a Main Phase. Use DEF position when you're behind to buy time!</div>
            </div>
          </div>
        `
      },
      {
        title: 'Spells — Powerful One-Time Effects',
        content: `
          <div class="tut-block">
            <p><strong>Spells</strong> unleash powerful one-time effects. You have two ways to use them:</p>
            <div class="tut-spell-modes">
              <div class="tut-spell-mode">
                <div class="tut-spell-mode-header cast">✦ Cast Face-Up</div>
                <ul>
                  <li>Costs <strong>mana</strong> to play</li>
                  <li>Effect resolves <strong>immediately</strong></li>
                  <li>Goes to graveyard after use</li>
                  <li>Opponent can respond with traps</li>
                </ul>
              </div>
              <div class="tut-spell-mode">
                <div class="tut-spell-mode-header set">⬇ Set Face-Down</div>
                <ul>
                  <li><strong>Free</strong> to set (no mana cost)</li>
                  <li>Sits hidden in Spell/Trap Zone</li>
                  <li>Activate later by paying mana</li>
                  <li>Surprise your opponent!</li>
                </ul>
              </div>
            </div>
            <div class="tut-interactive-demo" id="demo-flip-spell">
              <p class="tut-demo-label">👆 Click the card to flip it</p>
              <div class="tut-flip-card-container">
                <div class="tut-flip-card" id="demo-spell-card">
                  <div class="tut-flip-front">
                    <span>✦</span>
                    <p>Lightning Bolt</p>
                    <small>Deal 400 damage</small>
                  </div>
                  <div class="tut-flip-back">
                    <span>❓</span>
                    <p>Face-Down</p>
                    <small>Set Spell</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `,
        onMount: () => {
          const card = document.getElementById('demo-spell-card');
          if (card) {
            card.onclick = () => card.classList.toggle('flipped');
          }
        }
      },
      {
        title: 'Traps — Hidden Counter-Attacks',
        content: `
          <div class="tut-block">
            <p><strong>Traps</strong> are your hidden weapons. They're always set face-down first, then activated in response to your opponent's actions.</p>
            <div class="tut-steps">
              <div class="tut-step">
                <span class="tut-step-num">1</span>
                <div>
                  <strong>Set the Trap</strong>
                  <p>During your Main Phase, set a trap face-down for <strong>free</strong> (no mana cost). It occupies a Spell/Trap Zone slot.</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">2</span>
                <div>
                  <strong>Wait for the Trigger</strong>
                  <p>When your opponent plays a card, attacks, or takes certain actions, you'll get a <strong>response prompt</strong>.</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">3</span>
                <div>
                  <strong>Activate!</strong>
                  <p>Choose to activate your trap. Its effect resolves before or alongside the triggering action!</p>
                </div>
              </div>
            </div>
            <div class="tut-highlight-box">
              <span class="tut-icon">⚡</span>
              <div><strong>Chain System:</strong> After you activate a trap, your opponent can respond with their own traps/spells, creating a <em>chain</em>. Chains resolve in reverse order (last activated → first activated).</div>
            </div>
          </div>
        `
      },
      {
        title: 'Landmarks — Persistent Field Effects',
        content: `
          <div class="tut-block">
            <p><strong>Landmarks</strong> are powerful cards that provide ongoing bonuses as long as they're on the field.</p>
            <div class="tut-card-types">
              <div class="tut-card-type">
                <h4>🏛 1 Slot Per Player</h4>
                <p>Each player has exactly one landmark slot. Playing a new landmark <strong>replaces</strong> the old one (sending it to graveyard).</p>
              </div>
              <div class="tut-card-type">
                <h4>🆓 Free Pre-Game Placement</h4>
                <p>Before the game starts, you can place one landmark from your deck for free. This gives you an advantage from turn 1!</p>
              </div>
              <div class="tut-card-type">
                <h4>♾ Persistent Effects</h4>
                <p>Landmarks stay on the field and provide continuous bonuses: stat buffs, healing each turn, mana generation, or combat advantages.</p>
              </div>
            </div>
            <div class="tut-landmark-examples">
              <h4>Example Landmarks by Region:</h4>
              <div class="tut-region-grid" style="margin-top:8px">
                <div class="tut-region-item north"><h4>❄ Frostfell Citadel</h4><p>Northern units gain bonus DEF when summoned.</p></div>
                <div class="tut-region-item east"><h4>🌿 Jade Sanctum</h4><p>Grants additional spell mana each turn.</p></div>
                <div class="tut-region-item south"><h4>🔥 Arena of Trials</h4><p>Southern units destroy non-southern units after battle.</p></div>
                <div class="tut-region-item west"><h4>🌅 Merchant's Haven</h4><p>Draw an extra card under certain conditions.</p></div>
              </div>
            </div>
          </div>
        `
      },
      {
        title: 'Tokens — Summoned Creatures',
        content: `
          <div class="tut-block">
            <p><strong>Tokens</strong> are special units that are created by card effects rather than played from your hand. They act like regular units but have some unique properties:</p>
            <div class="tut-card-types">
              <div class="tut-card-type">
                <h4>⚡ Created by Effects</h4>
                <p>Tokens are summoned by other card abilities — you can't draw them or put them in your deck. They appear directly on the field.</p>
              </div>
              <div class="tut-card-type">
                <h4>⚔ Fight Like Units</h4>
                <p>Once on the field, tokens attack, defend, and take damage just like regular units.</p>
              </div>
              <div class="tut-card-type">
                <h4>💀 Temporary Soldiers</h4>
                <p>When destroyed, tokens are removed from the game entirely — they don't go to the graveyard.</p>
              </div>
            </div>
            <div class="tut-token-gallery">
              <h4>Token Examples:</h4>
              <div class="tut-token-list">
                <div class="tut-token-item north">
                  <span class="tut-token-icon">🐺</span>
                  <div><strong>Wolf Token</strong><p>Summoned by "Call the Pack" (N040). Gets +200 ATK if Pack Alpha Wolf is present.</p></div>
                </div>
                <div class="tut-token-item east">
                  <span class="tut-token-icon">👤</span>
                  <div><strong>Shadow Clone</strong><p>Summoned by "Shadow Clone Jutsu" (E014). Copies the ATK of the original unit!</p></div>
                </div>
                <div class="tut-token-item south">
                  <span class="tut-token-icon">⚔</span>
                  <div><strong>Southern Warrior</strong><p>Summoned by "Ambush" trap (S047). Appears when your LP is attacked directly!</p></div>
                </div>
                <div class="tut-token-item west">
                  <span class="tut-token-icon">🐅</span>
                  <div><strong>Tiger Token</strong><p>Summoned by "Beast Tamer" (W015). A quick-summoned ally for combat.</p></div>
                </div>
              </div>
            </div>
          </div>
        `
      }
    ];
  }

  // ═══════════════════════════════════════════════════════════
  // SECTION 3: MANA & RESOURCES (3 slides)
  // ═══════════════════════════════════════════════════════════

  _getManaSlides() {
    return [
      {
        title: 'Primary Mana',
        content: `
          <div class="tut-block">
            <p><strong>Primary Mana</strong> is your main resource for playing cards. It refills and scales each round:</p>
            <div class="tut-highlight-box">
              <span class="tut-icon">💎</span>
              <div>
                <strong>Mana Scaling:</strong> Each round, you receive mana equal to the round number.<br>
                Round 1 = 1 mana, Round 2 = 2 mana, Round 3 = 3 mana... up to a maximum of <strong>10 mana</strong>.
              </div>
            </div>
            <div class="tut-interactive-demo" id="demo-mana">
              <p class="tut-demo-label">👆 Click "Next Round" to see mana scaling</p>
              <div class="tut-mana-sim">
                <div class="tut-mana-crystals" id="mana-crystals"></div>
                <div class="tut-mana-info">
                  <span id="mana-round">Round 1</span>
                  <span id="mana-amount">💎 1 Mana</span>
                </div>
                <button class="tut-demo-btn" id="mana-next-btn">Next Round →</button>
              </div>
            </div>
            <p>Primary mana is used to play <strong>units</strong>, <strong>spells</strong> (cast face-up), and <strong>landmarks</strong>. Each card has a mana cost shown on it.</p>
          </div>
        `,
        onMount: () => {
          let round = 1;
          const btn = document.getElementById('mana-next-btn');
          const update = () => {
            const mana = Math.min(round, 10);
            const crystals = document.getElementById('mana-crystals');
            const roundEl = document.getElementById('mana-round');
            const amountEl = document.getElementById('mana-amount');
            if (crystals) crystals.innerHTML = Array(mana).fill('<span class="tut-mana-crystal">💎</span>').join('');
            if (roundEl) roundEl.textContent = `Round ${round}`;
            if (amountEl) amountEl.textContent = `💎 ${mana} Mana`;
          };
          update();
          if (btn) {
            btn.onclick = () => {
              if (round < 12) round++;
              else round = 1;
              update();
            };
          }
        }
      },
      {
        title: 'Spell Mana — Banking Resources',
        content: `
          <div class="tut-block">
            <p>Didn't spend all your mana this turn? <strong>Spell Mana</strong> lets you save it for later:</p>
            <div class="tut-mana-display">
              <div class="tut-mana-type primary">
                <span class="tut-mana-icon">💎</span>
                <div>
                  <strong>Primary Mana</strong>
                  <p>Refills every turn. Used for all card types.</p>
                </div>
              </div>
              <div class="tut-mana-type spell">
                <span class="tut-mana-icon">✦</span>
                <div>
                  <strong>Spell Mana</strong>
                  <p>Banked from unspent primary mana (up to <strong>3 max</strong>). Can <em>only</em> be used for spells — not units or landmarks.</p>
                </div>
              </div>
            </div>
            <div class="tut-highlight-box">
              <span class="tut-icon">📖</span>
              <div><strong>How Banking Works:</strong> At the end of your turn, any unspent primary mana converts to spell mana (capped at 3). Example: If you have 3 primary mana and spend 1, you bank 2 as spell mana.</div>
            </div>
            <div class="tut-highlight-box tip">
              <span class="tut-icon">💡</span>
              <div><strong>Tip:</strong> Intentionally save mana in early rounds to stockpile spell mana. This lets you cast expensive spells earlier than your opponent expects!</div>
            </div>
          </div>
        `
      },
      {
        title: 'Resource Strategy',
        content: `
          <div class="tut-block">
            <div class="tut-tips-grid">
              <div class="tut-tip-card">
                <span class="tut-tip-icon">💎</span>
                <strong>Mana Curve</strong>
                <p>Build your deck with a mix of cheap (1–2) and expensive (3+) cards. Don't load up on expensive cards you can't play early!</p>
              </div>
              <div class="tut-tip-card">
                <span class="tut-tip-icon">✦</span>
                <strong>Spell Mana Savings</strong>
                <p>In Round 1, if you don't play anything, you bank 1 spell mana. By Round 2, you'd have 2 primary + 1 spell = 3 total for spells!</p>
              </div>
              <div class="tut-tip-card">
                <span class="tut-tip-icon">🆓</span>
                <strong>Free Actions</strong>
                <p>Setting traps and spells face-down costs <strong>0 mana</strong>. Use free actions to fill your board without spending resources.</p>
              </div>
              <div class="tut-tip-card">
                <span class="tut-tip-icon">⚖</span>
                <strong>Tempo vs Value</strong>
                <p>Spending all mana now (tempo) vs saving for later (value) is a core decision each turn. Read the board and adapt!</p>
              </div>
            </div>
          </div>
        `
      }
    ];
  }

  // ═══════════════════════════════════════════════════════════
  // SECTION 4: COMBAT & EFFECTS (5 slides)
  // ═══════════════════════════════════════════════════════════

  _getCombatSlides() {
    return [
      {
        title: 'Battle Phase Overview',
        content: `
          <div class="tut-block">
            <p>During the <strong>Battle Phase</strong>, you declare attacks with your units:</p>
            <div class="tut-steps">
              <div class="tut-step">
                <span class="tut-step-num">1</span>
                <div>
                  <strong>Select an Attacker</strong>
                  <p>Choose one of your units in <strong>ATK position</strong>. Each unit can attack once per turn. Units summoned this turn <em>cannot</em> attack.</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">2</span>
                <div>
                  <strong>Choose a Target</strong>
                  <p>Target an opponent's unit. If the opponent has no units, you can <strong>attack their LP directly</strong>.</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">3</span>
                <div>
                  <strong>Opponent Response</strong>
                  <p>Before combat resolves, your opponent gets a chance to activate face-down traps or spells!</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">4</span>
                <div>
                  <strong>Resolve Combat</strong>
                  <p>Damage is dealt based on unit positions and stats. Destroyed units go to the graveyard.</p>
                </div>
              </div>
            </div>
          </div>
        `
      },
      {
        title: 'Damage Resolution',
        content: `
          <div class="tut-block">
            <p>How damage is calculated depends on unit positions:</p>
            <div class="tut-combat-table">
              <table>
                <thead>
                  <tr><th>Scenario</th><th>What Happens</th></tr>
                </thead>
                <tbody>
                  <tr><td><strong>ATK vs ATK</strong></td><td>Both units deal their ATK as damage to each other's DEF. If ATK exceeds remaining DEF, <strong>excess damage hits the owner's LP</strong>. Both units can be destroyed!</td></tr>
                  <tr><td><strong>ATK vs DEF</strong></td><td>Attacker's ATK damages defender's DEF. Excess damage does <strong>NOT</strong> pierce to LP. However, if attacker's ATK is <em>less</em> than defender's remaining DEF, the <strong>attacker's owner takes rebound damage</strong> (DEF − ATK).</td></tr>
                  <tr><td><strong>Direct Attack</strong></td><td>If opponent has no units in ATK position, your full ATK deals damage to their LP directly.</td></tr>
                </tbody>
              </table>
            </div>
            <div class="tut-highlight-box tip">
              <span class="tut-icon">💡</span>
              <div><strong>Key insight:</strong> Damage to units is <em>permanent</em>. A 500 DEF unit that took 300 damage last turn only has 200 DEF now — making it easy prey!</div>
            </div>
          </div>
        `
      },
      {
        title: 'Interactive Combat Simulator',
        content: `
          <div class="tut-block">
            <p>See how combat plays out! Click the "Fight!" button to resolve:</p>
            <div class="tut-combat-sim">
              <div class="tut-combat-side attacker">
                <h4>Your Unit (ATK)</h4>
                <div class="tut-mock-card">
                  <div class="tut-mock-card-name">Attacker</div>
                  <div class="tut-mock-card-stats">
                    <span class="tut-mock-atk">⚔ <span id="sim-atk-val">600</span></span>
                    <span class="tut-mock-def">🛡 <span id="sim-atk-def">400</span></span>
                  </div>
                </div>
              </div>
              <div class="tut-combat-middle">
                <button class="tut-demo-btn" id="sim-fight-btn">⚔ Fight!</button>
                <button class="tut-demo-btn" id="sim-reset-btn" style="margin-top:8px;font-size:0.75rem">↻ Reset</button>
                <div class="tut-sim-toggle">
                  <label><input type="radio" name="def-pos" value="atk" checked> ATK pos</label>
                  <label><input type="radio" name="def-pos" value="def"> DEF pos</label>
                </div>
              </div>
              <div class="tut-combat-side defender">
                <h4>Enemy Unit</h4>
                <div class="tut-mock-card">
                  <div class="tut-mock-card-name">Defender</div>
                  <div class="tut-mock-card-stats">
                    <span class="tut-mock-atk">⚔ <span id="sim-def-atk-val">500</span></span>
                    <span class="tut-mock-def">🛡 <span id="sim-def-def">450</span></span>
                  </div>
                </div>
              </div>
            </div>
            <div class="tut-combat-result" id="sim-result">Choose defender position and click Fight!</div>
          </div>
        `,
        onMount: () => {
          let atkDef = 400, defDef = 450;
          const fight = document.getElementById('sim-fight-btn');
          const reset = document.getElementById('sim-reset-btn');
          if (!fight) return;
          fight.onclick = () => {
            const pos = document.querySelector('input[name="def-pos"]:checked')?.value || 'atk';
            const atkATK = 600, defATK = 500;
            const result = document.getElementById('sim-result');
            let msg = '';
            if (pos === 'atk') {
              atkDef -= defATK; defDef -= atkATK;
              document.getElementById('sim-atk-def').textContent = Math.max(0, atkDef);
              document.getElementById('sim-def-def').textContent = Math.max(0, defDef);
              const atkDestroyed = atkDef <= 0, defDestroyed = defDef <= 0;
              msg = `ATK vs ATK: Attacker takes ${defATK} dmg → ${Math.max(0, atkDef)} DEF. Defender takes ${atkATK} dmg → ${Math.max(0, defDef)} DEF.`;
              if (atkDestroyed) msg += ' Attacker DESTROYED!';
              if (defDestroyed) msg += ' Defender DESTROYED!';
              if (defDef < 0) msg += ` ${Math.abs(defDef)} excess damage → opponent LP!`;
            } else {
              defDef -= atkATK;
              document.getElementById('sim-def-def').textContent = Math.max(0, defDef);
              msg = `ATK vs DEF: Defender takes ${atkATK} dmg → ${Math.max(0, defDef)} DEF.`;
              if (defDef <= 0) msg += ' Defender DESTROYED! (No LP damage)';
              else msg += ` Attacker owner takes ${defDef} rebound damage!`;
            }
            if (result) result.innerHTML = msg;
          };
          if (reset) reset.onclick = () => {
            atkDef = 400; defDef = 450;
            document.getElementById('sim-atk-def').textContent = '400';
            document.getElementById('sim-def-def').textContent = '450';
            document.getElementById('sim-result').textContent = 'Choose defender position and click Fight!';
          };
        }
      },
      {
        title: 'Card Abilities & Effects',
        content: `
          <div class="tut-block">
            <p>Many cards have special abilities that trigger at specific times:</p>
            <div class="tut-card-types">
              <div class="tut-card-type">
                <h4>⚡ On Summon</h4>
                <p>Triggers automatically when the unit enters the field. Example: "Deal 200 damage to a target unit."</p>
              </div>
              <div class="tut-card-type">
                <h4>🔄 Passive</h4>
                <p>Always active while the card is on the field. Example: "All friendly Northern units gain +100 ATK."</p>
              </div>
              <div class="tut-card-type">
                <h4>🎯 Activated</h4>
                <p>You choose when to use it (usually once per turn). Look for the <em>Activate</em> button on field cards.</p>
              </div>
              <div class="tut-card-type">
                <h4>💀 On Destruction</h4>
                <p>Triggers when the card is destroyed and sent to the graveyard. Example: "Draw 1 card."</p>
              </div>
              <div class="tut-card-type">
                <h4>🔇 Silence</h4>
                <p>Some effects can <em>silence</em> a unit, negating all its abilities and removing stat buffs.</p>
              </div>
            </div>
            <div class="tut-highlight-box tip">
              <span class="tut-icon">💡</span>
              <div><strong>Tip:</strong> Hover over any card on the field or in your hand to see its full description and abilities!</div>
            </div>
          </div>
        `
      },
      {
        title: 'Response System & Chains',
        content: `
          <div class="tut-block">
            <p>The <strong>Response System</strong> adds depth by letting you react to your opponent's moves:</p>
            <div class="tut-chain-diagram">
              <div class="tut-chain-step trigger">
                <span>1️⃣</span>
                <div><strong>Trigger</strong><p>Opponent plays a card, attacks, or takes an action.</p></div>
              </div>
              <div class="tut-chain-arrow">↓</div>
              <div class="tut-chain-step response">
                <span>2️⃣</span>
                <div><strong>Response Window</strong><p>You get the option to activate face-down traps or set spells in response.</p></div>
              </div>
              <div class="tut-chain-arrow">↓</div>
              <div class="tut-chain-step counter">
                <span>3️⃣</span>
                <div><strong>Counter-Response</strong><p>If you respond, your opponent can respond back — building a chain!</p></div>
              </div>
              <div class="tut-chain-arrow">↓</div>
              <div class="tut-chain-step resolve">
                <span>4️⃣</span>
                <div><strong>Resolution</strong><p>When both players pass, the chain resolves in <strong>reverse order</strong> (LIFO — last activated first).</p></div>
              </div>
            </div>
            <div class="tut-highlight-box">
              <span class="tut-icon">⚡</span>
              <div><strong>Example:</strong> Opponent attacks → You activate a trap that reduces ATK → Opponent chains a spell to negate your trap → Your trap is negated, attack proceeds at full power. The last response wins!</div>
            </div>
          </div>
        `
      }
    ];
  }

  // ═══════════════════════════════════════════════════════════
  // SECTION 5: GAME MODES (4 slides)
  // ═══════════════════════════════════════════════════════════

  _getModesSlides() {
    return [
      {
        title: 'vs AI — Quick Battles',
        content: `
          <div class="tut-block">
            <p>The fastest way to play! Jump into a match against an AI opponent:</p>
            <div class="tut-card-types">
              <div class="tut-card-type">
                <h4>🤖 Smart AI</h4>
                <p>The AI plays units, casts spells, sets traps, and makes tactical attacks — just like a human player.</p>
              </div>
              <div class="tut-card-type">
                <h4>🎯 Choose Your Region</h4>
                <p>Pick your region and the AI will randomly pick a different one. You can also select a custom deck!</p>
              </div>
              <div class="tut-card-type">
                <h4>🔄 Unlimited Replays</h4>
                <p>Play as many matches as you want to practice your skills and try different strategies.</p>
              </div>
            </div>
          </div>
        `
      },
      {
        title: 'Solo Campaign — Story Mode',
        content: `
          <div class="tut-block">
            <p>Battle through <strong>12 stages</strong> across all four regions, fighting AI of increasing difficulty:</p>
            <div class="tut-campaign-map">
              <div class="tut-map-region north">
                <h4>❄ Northern</h4>
                <div class="tut-map-stages">
                  <span class="tut-map-stage">1</span>
                  <span class="tut-map-stage">2</span>
                  <span class="tut-map-stage boss">👑 3</span>
                </div>
              </div>
              <div class="tut-map-region east">
                <h4>🌿 Eastern</h4>
                <div class="tut-map-stages">
                  <span class="tut-map-stage">4</span>
                  <span class="tut-map-stage">5</span>
                  <span class="tut-map-stage boss">👑 6</span>
                </div>
              </div>
              <div class="tut-map-region south">
                <h4>🔥 Southern</h4>
                <div class="tut-map-stages">
                  <span class="tut-map-stage">7</span>
                  <span class="tut-map-stage">8</span>
                  <span class="tut-map-stage boss">👑 9</span>
                </div>
              </div>
              <div class="tut-map-region west">
                <h4>🌅 Western</h4>
                <div class="tut-map-stages">
                  <span class="tut-map-stage">10</span>
                  <span class="tut-map-stage">11</span>
                  <span class="tut-map-stage boss">👑 12</span>
                </div>
              </div>
            </div>
            <div class="tut-highlight-box tip">
              <span class="tut-icon">💡</span>
              <div><strong>Tip:</strong> Boss stages (👑) have stronger AI with more LP! You can retry any stage as many times as needed.</div>
            </div>
          </div>
        `
      },
      {
        title: 'War Campaign — Draft & Battle',
        content: `
          <div class="tut-block">
            <p>The <strong>War Campaign</strong> is a multi-round competitive mode featuring a serpentine card drafting system:</p>
            <div class="tut-steps">
              <div class="tut-step">
                <span class="tut-step-num">1</span>
                <div>
                  <strong>Choose Regions</strong>
                  <p>Each player selects a home region (no duplicates).</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">2</span>
                <div>
                  <strong>Draft Cards</strong>
                  <p>Players take turns picking cards from a shared pool in serpentine order. Cards picked by one player are removed for everyone.</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">3</span>
                <div>
                  <strong>Build Deck</strong>
                  <p>Assemble your battle deck from drafted cards. You can mix cards from multiple regions!</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">4</span>
                <div>
                  <strong>Battle</strong>
                  <p>Fight a full match. After each round, draft more cards and rebuild your deck.</p>
                </div>
              </div>
            </div>
            <div class="tut-highlight-box">
              <span class="tut-icon">🏆</span>
              <div><strong>Victory:</strong> Win the majority of rounds to claim the War Campaign title!</div>
            </div>
          </div>
        `
      },
      {
        title: 'Online Match — Play with Friends',
        content: `
          <div class="tut-block">
            <p>Take your skills online and battle real players!</p>
            <div class="tut-card-types">
              <div class="tut-card-type">
                <h4>🌐 Online Multiplayer</h4>
                <p>Connect to the game server and battle other players in real-time. All the same rules as vs AI, but against a human opponent!</p>
              </div>
              <div class="tut-card-type">
                <h4>🏛 War Campaign Online</h4>
                <p>Play the full War Campaign draft-and-battle experience with a friend online. Draft cards simultaneously!</p>
              </div>
              <div class="tut-card-type">
                <h4>⚡ Real-Time</h4>
                <p>Actions sync in real-time. You'll see your opponent's plays as they happen — including their response window!</p>
              </div>
            </div>
            <p style="text-align:center;margin-top:24px;color:var(--gold);font-family:'Cinzel',serif;font-size:1.1rem">You're ready for battle! Good luck, Commander! ⚔</p>
          </div>
        `
      }
    ];
  }
}
