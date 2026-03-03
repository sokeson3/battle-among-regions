// ─────────────────────────────────────────────────────────────
// TutorialUI.js — Interactive tutorial system for Battle Among Regions
// Uses actual game artwork and card images from the game's asset library
// ─────────────────────────────────────────────────────────────

export class TutorialUI {
  constructor(gameUI) {
    this.gameUI = gameUI;
    this.app = document.getElementById('app');
    this.currentSlideIndex = 0;
    this.currentSlides = [];
    this.currentSection = null;
  }

  /** Helper: render a game card image by its card ID */
  _cardImg(cardId, alt = '', extraStyle = '') {
    return `<img src="./output-web/${cardId}.webp" alt="${alt}" 
                     onerror="this.style.display='none'" loading="lazy"
                     style="border-radius:var(--radius-card);object-fit:cover;${extraStyle}" />`;
  }

  /** Helper: render a showcase card with name + image */
  _showcaseCard(cardId, name, region, extraClass = '') {
    const regionClass = { Northern: 'north', Eastern: 'east', Southern: 'south', Western: 'west' }[region] || '';
    return `<div class="tut-showcase-card ${regionClass} ${extraClass}">
            ${this._cardImg(cardId, name, 'width:100%;height:140px')}
            <div class="tut-showcase-label">${name}</div>
        </div>`;
  }

  // ─── Tutorial Hub ────────────────────────────────────────

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
            <p>Objective, regions, setup, board, and turn structure.</p>
            <span class="tutorial-slide-count">6 lessons</span>
          </div>
          <div class="tutorial-mode-card card-types" id="tut-cards">
            <div class="tutorial-mode-icon">🃏</div>
            <h3>Card Types</h3>
            <p>Units, Spells, Traps, Landmarks, and Tokens.</p>
            <span class="tutorial-slide-count">6 lessons</span>
          </div>
          <div class="tutorial-mode-card mana" id="tut-mana">
            <div class="tutorial-mode-icon">💎</div>
            <h3>Mana & Resources</h3>
            <p>Primary mana, spell mana, and resource strategy.</p>
            <span class="tutorial-slide-count">3 lessons</span>
          </div>
          <div class="tutorial-mode-card combat" id="tut-combat">
            <div class="tutorial-mode-icon">⚔</div>
            <h3>Combat & Effects</h3>
            <p>Battle phase, damage, abilities, and chains.</p>
            <span class="tutorial-slide-count">5 lessons</span>
          </div>
          <div class="tutorial-mode-card campaign" id="tut-modes">
            <div class="tutorial-mode-icon">🏰</div>
            <h3>Game Modes</h3>
            <p>AI, Campaign, War Campaign, and Online.</p>
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
    const labels = { basics: 'Game Basics', cards: 'Card Types', mana: 'Mana & Resources', combat: 'Combat & Effects', modes: 'Game Modes' };

    this.app.innerHTML = `
      <div class="tutorial-viewer">
        <div class="tutorial-header">
          <button class="tutorial-back-btn" id="tut-back-hub">← Back</button>
          <span class="tutorial-section-label">${labels[this.currentSection] || 'Tutorial'}</span>
          <span class="tutorial-progress-text">${idx + 1} / ${total}</span>
        </div>
        <div class="tutorial-slide">
          <h2 class="tutorial-slide-title">${slide.title}</h2>
          <div class="tutorial-slide-content">${slide.content}</div>
        </div>
        <div class="tutorial-nav">
          <button class="tutorial-nav-btn ${idx === 0 ? 'disabled' : ''}" id="tut-prev">‹ Previous</button>
          <div class="tutorial-dots">
            ${this.currentSlides.map((_, i) => `<span class="tutorial-dot ${i === idx ? 'active' : ''} ${i < idx ? 'completed' : ''}" data-slide="${i}"></span>`).join('')}
          </div>
          <button class="tutorial-nav-btn primary ${idx === total - 1 ? 'finish' : ''}" id="tut-next">${idx === total - 1 ? 'Finish ✓' : 'Next ›'}</button>
        </div>
      </div>`;

    document.getElementById('tut-back-hub').onclick = () => this.showTutorial();
    if (idx > 0) document.getElementById('tut-prev').onclick = () => { this.currentSlideIndex--; this._renderSlide(); };
    document.getElementById('tut-next').onclick = idx < total - 1 ? () => { this.currentSlideIndex++; this._renderSlide(); } : () => this.showTutorial();
    document.querySelectorAll('.tutorial-dot').forEach(d => { d.onclick = () => { this.currentSlideIndex = parseInt(d.dataset.slide); this._renderSlide(); }; });
    if (slide.onMount) setTimeout(() => slide.onMount(), 50);
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
            <div class="tut-hero-banner">
              <img src="./Background.webp" alt="Battle Among Regions" class="tut-hero-img" />
              <div class="tut-hero-overlay">
                <p>Two commanders. Four regions. One battlefield.</p>
              </div>
            </div>
            <p>In <strong>Battle Among Regions</strong>, two players command armies from warring regions, clashing with units, spells, traps, and powerful landmarks.</p>
            <div class="tut-highlight-box">
              <span class="tut-icon">🎯</span>
              <div><strong>Goal:</strong> Reduce your opponent's <span class="tut-keyword lp">Life Points (LP)</span> to 0, or force them to deck out (run out of cards to draw).</div>
            </div>
            <div class="tut-interactive-demo" id="demo-lp">
              <p class="tut-demo-label">👆 Click to simulate taking damage</p>
              <div class="tut-lp-demo">
                <div class="tut-lp-bar-track"><div class="tut-lp-bar-fill" id="demo-lp-fill" style="width:100%"></div></div>
                <span class="tut-lp-text" id="demo-lp-text">3000 / 3000</span>
              </div>
            </div>
          </div>`,
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
            if (text) text.textContent = lp <= 0 ? '0 / 3000 — DEFEATED!' : `${lp} / 3000`;
            if (fill) { fill.classList.add('tut-damage-flash'); setTimeout(() => fill.classList.remove('tut-damage-flash'), 300); }
          };
        }
      },
      {
        title: 'The Four Regions',
        content: `
          <div class="tut-block">
            <p>Each region has a distinct identity and fighting style. Choose the one that matches your strategy!</p>
            <div class="tut-region-grid">
              <div class="tut-region-item north tut-region-hover">
                <h4>❄ Northern</h4>
                <div class="tut-region-art">${this._cardImg('N010', 'Guardian Yeti', 'width:100%;height:80px')}</div>
                <p>Resilient defenders. Masters of healing, fortification, and outlasting opponents with high-DEF walls.</p>
                <div class="tut-region-detail"><span>🛡 High DEF</span><span>💚 Healing</span><span>🐺 Wolf Tokens</span></div>
              </div>
              <div class="tut-region-item east tut-region-hover">
                <h4>🌿 Eastern</h4>
                <div class="tut-region-art">${this._cardImg('E014', 'Shadow Clone Master', 'width:100%;height:80px')}</div>
                <p>Cunning strategists. Shadow tactics, spell mastery, and deceptive clones that catch opponents off-guard.</p>
                <div class="tut-region-detail"><span>✦ Spell synergy</span><span>👁 Card draw</span><span>👤 Shadow Clones</span></div>
              </div>
              <div class="tut-region-item south tut-region-hover">
                <h4>🔥 Southern</h4>
                <div class="tut-region-art">${this._cardImg('S010', 'Seasoned Pit Fighter', 'width:100%;height:80px')}</div>
                <p>Aggressive warriors. Raw power, piercing strikes, and relentless pressure that overwhelms defenses.</p>
                <div class="tut-region-detail"><span>⚔ High ATK</span><span>🔥 Burn damage</span><span>💥 Pierce</span></div>
              </div>
              <div class="tut-region-item west tut-region-hover">
                <h4>🌅 Western</h4>
                <div class="tut-region-art">${this._cardImg('W015', 'Beast Tamer', 'width:100%;height:80px')}</div>
                <p>Adaptable tricksters. Unit synergy, token summoning, and surprise combos that multiply your army.</p>
                <div class="tut-region-detail"><span>🔄 Combos</span><span>🐅 Tiger Tokens</span><span>🎭 Manipulation</span></div>
              </div>
            </div>
          </div>`
      },
      {
        title: 'Game Setup',
        content: `
          <div class="tut-block">
            <p>Before battle begins, both players go through a setup phase:</p>
            <div class="tut-steps">
              <div class="tut-step">
                <span class="tut-step-num">1</span>
                <div><strong>Choose Your Region</strong><p>Select your region. Each player must pick a different one.</p></div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">2</span>
                <div>
                  <strong>Landmark Placement</strong>
                  <p>Place one Landmark from your deck for free before the game starts!</p>
                  <div class="tut-inline-cards">${this._showcaseCard('N001', 'Frostfell Citadel', 'Northern')}${this._showcaseCard('S001', 'Arena of Trials', 'Southern')}</div>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">3</span>
                <div><strong>Draw 5 Cards</strong><p>Your opening hand is drawn from the deck.</p></div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">4</span>
                <div><strong>Mulligan</strong><p>Exchange any cards you don't want for new ones — once only!</p></div>
              </div>
            </div>
          </div>`
      },
      {
        title: 'The Game Board',
        content: `
          <div class="tut-block">
            <p>The battlefield is where all action happens. Each player controls these zones:</p>
            <div class="tut-board-diagram">
              <div class="tut-board-zone landmark">🏛 Landmark Zone<span>1 slot — persistent field effect</span></div>
              <div class="tut-board-zones-row"><div class="tut-board-zone unit">⚔ Unit Zone<span>5 slots for your fighting units</span></div></div>
              <div class="tut-board-zones-row"><div class="tut-board-zone spelltrap">✦ Spell/Trap Zone<span>5 slots for face-down spells & traps</span></div></div>
              <div class="tut-board-zones-row side">
                <div class="tut-board-zone deck">📚 Deck<span>Draw each turn</span></div>
                <div class="tut-board-zone grave">💀 Graveyard<span>Destroyed cards</span></div>
              </div>
            </div>
            <p style="color:var(--text-muted);font-size:0.82rem;text-align:center">Your field is at the bottom, opponent's at the top (mirrored).</p>
          </div>`
      },
      {
        title: 'Turn Structure',
        content: `
          <div class="tut-block">
            <p>Each turn follows <strong>5 phases</strong>. Click any phase to learn more:</p>
            <div class="tut-phase-flow">
              <div class="tut-phase tut-phase-click active" data-phase="draw"><span class="tut-phase-icon">🃏</span><strong>Draw</strong></div>
              <div class="tut-phase-arrow">→</div>
              <div class="tut-phase tut-phase-click" data-phase="main1"><span class="tut-phase-icon">🔧</span><strong>Main 1</strong></div>
              <div class="tut-phase-arrow">→</div>
              <div class="tut-phase tut-phase-click" data-phase="battle"><span class="tut-phase-icon">⚔</span><strong>Battle</strong></div>
              <div class="tut-phase-arrow">→</div>
              <div class="tut-phase tut-phase-click" data-phase="main2"><span class="tut-phase-icon">🔧</span><strong>Main 2</strong></div>
              <div class="tut-phase-arrow">→</div>
              <div class="tut-phase tut-phase-click" data-phase="end"><span class="tut-phase-icon">🏁</span><strong>End</strong></div>
            </div>
            <div class="tut-phase-detail" id="phase-detail"><p><strong>🃏 Draw Phase:</strong> Draw 1 card from your deck. Skipped on the very first turn so the starting player doesn't get extra card advantage.</p></div>
          </div>`,
        onMount: () => {
          const details = {
            draw: '<p><strong>🃏 Draw Phase:</strong> Draw 1 card from your deck. Skipped on the very first turn so the starting player doesn\'t get extra card advantage.</p>',
            main1: '<p><strong>🔧 Main Phase 1:</strong> Play units, cast spells, set traps face-down, play landmarks, switch unit positions (ATK ↔ DEF), or activate abilities. Your primary action phase.</p>',
            battle: '<p><strong>⚔ Battle Phase:</strong> Declare attacks with your units. Each unit attacks once per turn. Units summoned this turn cannot attack. Your opponent can activate traps in response!</p>',
            main2: '<p><strong>🔧 Main Phase 2:</strong> Same actions as Main 1. Play more cards after seeing how combat went, or set traps before passing.</p>',
            end: '<p><strong>🏁 End Phase:</strong> Turn ends. Unspent primary mana is banked as <em>spell mana</em> (up to 3 max). Some effects trigger here. Turn passes to opponent.</p>',
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
            <div class="tut-steps">
              <div class="tut-step"><span class="tut-step-num">🏆</span><div><strong>Reduce LP to 0</strong><p>Deal enough damage through combat and effects to bring your opponent's Life Points to zero.</p></div></div>
              <div class="tut-step"><span class="tut-step-num">📚</span><div><strong>Deck Out</strong><p>If a player must draw but has no cards left in their deck, they lose!</p></div></div>
            </div>
            <div class="tut-highlight-box tip">
              <span class="tut-icon">💡</span>
              <div><strong>Tip:</strong> Each player starts with <strong>3000 LP</strong> and a 30-card deck. Plan your strategy around both win conditions!</div>
            </div>
          </div>`
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
            <p><strong>Units</strong> are your soldiers on the battlefield. They have two key stats:</p>
            <div class="tut-stats-display">
              <div class="tut-stat atk"><span>⚔ ATK</span><p>Attack power — damage dealt when attacking.</p></div>
              <div class="tut-stat def"><span>🛡 DEF</span><p>Defense — the unit's health. Reaches 0 = destroyed.</p></div>
            </div>
            <div class="tut-showcase-row">
              ${this._showcaseCard('N010', 'Guardian Yeti', 'Northern')}
              ${this._showcaseCard('S010', 'Pit Fighter', 'Southern')}
              ${this._showcaseCard('E014', 'Shadow Clone Master', 'Eastern')}
              ${this._showcaseCard('W025', 'Mimic Chest', 'Western')}
            </div>
            <div class="tut-highlight-box tip">
              <span class="tut-icon">💡</span>
              <div><strong>Key rule:</strong> DEF damage is <strong>permanent</strong>. A 600 DEF unit that takes 300 damage stays at 300 DEF next turn — making it easy prey!</div>
            </div>
          </div>`
      },
      {
        title: 'Unit Positions — ATK vs DEF',
        content: `
          <div class="tut-block">
            <p>Units can be placed in two positions:</p>
            <div class="tut-position-demo">
              <div class="tut-pos-card atk-pos">
                <div class="tut-pos-art">${this._cardImg('S005', 'Aspiring Gladiator', 'width:100%;height:90px')}</div>
                <h4>ATK Position</h4>
                <p>Unit faces upright. <strong>Can attack</strong> during Battle Phase. When attacked, opponent deals damage to its DEF.</p>
                <div class="tut-pos-tag atk">Can attack</div>
              </div>
              <div class="tut-pos-vs">VS</div>
              <div class="tut-pos-card def-pos">
                <div class="tut-pos-art sideways">${this._cardImg('N010', 'Guardian Yeti', 'width:100%;height:90px')}</div>
                <h4>DEF Position</h4>
                <p>Unit is turned sideways. <strong>Cannot attack</strong>, but excess damage does NOT pierce to your LP. Ideal for stalling.</p>
                <div class="tut-pos-tag def">Absorbs damage</div>
              </div>
            </div>
            <div class="tut-highlight-box tip">
              <span class="tut-icon">💡</span>
              <div><strong>Tip:</strong> Switch a unit between ATK/DEF once per turn during a Main Phase. Use DEF when you're behind to buy time!</div>
            </div>
          </div>`
      },
      {
        title: 'Spells — Powerful One-Time Effects',
        content: `
          <div class="tut-block">
            <p><strong>Spells</strong> unleash powerful one-time effects. Two ways to use them:</p>
            <div class="tut-spell-modes">
              <div class="tut-spell-mode">
                <div class="tut-spell-mode-header cast">✦ Cast Face-Up</div>
                <ul><li>Costs <strong>mana</strong> to play</li><li>Effect resolves <strong>immediately</strong></li><li>Goes to graveyard after use</li><li>Opponent can respond</li></ul>
              </div>
              <div class="tut-spell-mode">
                <div class="tut-spell-mode-header set">⬇ Set Face-Down</div>
                <ul><li><strong>Free</strong> to set (no mana cost)</li><li>Sits hidden in Spell/Trap Zone</li><li>Activate later by paying mana</li><li>Surprise your opponent!</li></ul>
              </div>
            </div>
            <div class="tut-interactive-demo" id="demo-flip-spell">
              <p class="tut-demo-label">👆 Click the card to flip it face-down / face-up</p>
              <div class="tut-flip-card-container">
                <div class="tut-flip-card" id="demo-spell-card">
                  <div class="tut-flip-front">${this._cardImg('N040', 'Call the Pack', 'width:100%;height:100%')}</div>
                  <div class="tut-flip-back"><img src="./Background.webp" alt="Face-down" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-card)" /><div class="tut-flip-label">Set Spell</div></div>
                </div>
              </div>
            </div>
          </div>`,
        onMount: () => {
          const card = document.getElementById('demo-spell-card');
          if (card) card.onclick = () => card.classList.toggle('flipped');
        }
      },
      {
        title: 'Traps — Hidden Counter-Attacks',
        content: `
          <div class="tut-block">
            <p><strong>Traps</strong> are your hidden weapons, set face-down and activated in response to opponent actions.</p>
            <div class="tut-showcase-row">
              ${this._showcaseCard('N046', 'Ice Mirror', 'Northern')}
              ${this._showcaseCard('N047', 'Hibernation Ward', 'Northern')}
              ${this._showcaseCard('E025', 'Calculated Strike', 'Eastern')}
              ${this._showcaseCard('S047', 'Ambush', 'Southern')}
            </div>
            <div class="tut-steps" style="margin-top:16px">
              <div class="tut-step"><span class="tut-step-num">1</span><div><strong>Set the Trap</strong><p>During Main Phase, set a trap face-down for <strong>free</strong> (0 mana).</p></div></div>
              <div class="tut-step"><span class="tut-step-num">2</span><div><strong>Wait for the Trigger</strong><p>When your opponent plays a card or attacks, you get a <strong>response prompt</strong>.</p></div></div>
              <div class="tut-step"><span class="tut-step-num">3</span><div><strong>Activate!</strong><p>Choose to spring your trap. Its effect resolves before the triggering action!</p></div></div>
            </div>
            <div class="tut-highlight-box">
              <span class="tut-icon">⚡</span>
              <div><strong>Ice Mirror</strong> can negate a spell or trap. <strong>Ambush</strong> summons a warrior when your LP is attacked directly!</div>
            </div>
          </div>`
      },
      {
        title: 'Landmarks — Persistent Field Effects',
        content: `
          <div class="tut-block">
            <p><strong>Landmarks</strong> provide ongoing field bonuses as long as they're in play.</p>
            <div class="tut-card-types">
              <div class="tut-card-type"><h4>🏛 1 Slot Per Player</h4><p>Each player has one landmark slot. Playing a new one replaces the old.</p></div>
              <div class="tut-card-type"><h4>🆓 Free Pre-Game</h4><p>Place one from your deck for free before the match starts!</p></div>
              <div class="tut-card-type"><h4>♾ Persistent</h4><p>Stay on the field giving continuous bonuses: stat buffs, extra mana, combat advantages.</p></div>
            </div>
            <div class="tut-landmark-gallery">
              <div class="tut-region-grid" style="margin-top:12px">
                <div class="tut-region-item north">
                  <div class="tut-region-art">${this._cardImg('N001', 'Frostfell Citadel', 'width:100%;height:70px')}</div>
                  <h4>❄ Frostfell Citadel</h4><p>Northern units gain +200 DEF in defense position.</p>
                </div>
                <div class="tut-region-item east">
                  <div class="tut-region-art">${this._cardImg('E001', 'Hidden Monastery', 'width:100%;height:70px')}</div>
                  <h4>🌿 Hidden Monastery</h4><p>Gain 2 extra mana if you only control Shadow units.</p>
                </div>
                <div class="tut-region-item south">
                  <div class="tut-region-art">${this._cardImg('S001', 'Arena of Trials', 'width:100%;height:70px')}</div>
                  <h4>🔥 Arena of Trials</h4><p>Southern units destroy non-southern units after battle.</p>
                </div>
                <div class="tut-region-item west">
                  <div class="tut-region-art">${this._cardImg('W001', 'Echoing Canyon', 'width:100%;height:70px')}</div>
                  <h4>🌅 Echoing Canyon</h4><p>When-summoned effects activate twice in this region!</p>
                </div>
              </div>
            </div>
          </div>`
      },
      {
        title: 'Tokens — Summoned Creatures',
        content: `
          <div class="tut-block">
            <p><strong>Tokens</strong> are special units created by card effects — not drawn or played from hand.</p>
            <div class="tut-card-types">
              <div class="tut-card-type"><h4>⚡ Created by Effects</h4><p>Appear directly on the field when another card's ability triggers.</p></div>
              <div class="tut-card-type"><h4>⚔ Fight Like Units</h4><p>Once on the field, tokens attack, defend, and take damage like regular units.</p></div>
              <div class="tut-card-type"><h4>💀 Temporary</h4><p>When destroyed, tokens are removed from the game — they don't go to the graveyard.</p></div>
            </div>
            <div class="tut-token-gallery"><h4>Tokens From Each Region:</h4>
              <div class="tut-token-list">
                <div class="tut-token-item north">
                  <div class="tut-token-art">${this._cardImg('N040a', 'Wolf Token', 'width:60px;height:60px')}</div>
                  <div><strong>🐺 Wolf Token</strong> (200/200)<p>Summoned by "Call the Pack" (N040). Gets +200 ATK if Pack Alpha Wolf is present.</p></div>
                </div>
                <div class="tut-token-item east">
                  <div class="tut-token-art">${this._cardImg('E014a', 'Shadow Clone', 'width:60px;height:60px')}</div>
                  <div><strong>👤 Shadow Clone</strong> (?/300)<p>Summoned by Shadow Clone Master (E014). Copies the ATK of a chosen unit!</p></div>
                </div>
                <div class="tut-token-item south">
                  <div class="tut-token-art">${this._cardImg('S047a', 'Southern Warrior', 'width:60px;height:60px')}</div>
                  <div><strong>⚔ Southern Warrior</strong> (500/200)<p>Summoned by "Ambush" trap (S047). Appears when your LP is attacked directly!</p></div>
                </div>
                <div class="tut-token-item west">
                  <div class="tut-token-art">${this._cardImg('W015a', 'Tiger Token', 'width:60px;height:60px')}</div>
                  <div><strong>🐅 Tiger Token</strong> (500/300)<p>Summoned by Beast Tamer (W015). A quick-summoned ally for combat.</p></div>
                </div>
              </div>
            </div>
          </div>`
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
            <p><strong>Primary Mana</strong> is your main resource for playing cards. It scales each round:</p>
            <div class="tut-highlight-box">
              <span class="tut-icon">💎</span>
              <div><strong>Mana Scaling:</strong> Round 1 = 1 mana, Round 2 = 2 mana … up to a maximum of <strong>10 mana</strong>.</div>
            </div>
            <div class="tut-interactive-demo" id="demo-mana">
              <p class="tut-demo-label">👆 Click "Next Round" to see mana scaling</p>
              <div class="tut-mana-sim">
                <div class="tut-mana-crystals" id="mana-crystals"></div>
                <div class="tut-mana-info"><span id="mana-round">Round 1</span><span id="mana-amount">💎 1 Mana</span></div>
                <button class="tut-demo-btn" id="mana-next-btn">Next Round →</button>
              </div>
            </div>
            <p>Each card has a mana cost. Units, face-up spells, and landmarks all require mana to play.</p>
          </div>`,
        onMount: () => {
          let round = 1;
          const update = () => {
            const mana = Math.min(round, 10);
            const c = document.getElementById('mana-crystals');
            const r = document.getElementById('mana-round');
            const a = document.getElementById('mana-amount');
            if (c) c.innerHTML = Array(mana).fill('<span class="tut-mana-crystal">💎</span>').join('');
            if (r) r.textContent = `Round ${round}`;
            if (a) a.textContent = `💎 ${mana} Mana`;
          };
          update();
          const btn = document.getElementById('mana-next-btn');
          if (btn) btn.onclick = () => { round = round < 12 ? round + 1 : 1; update(); };
        }
      },
      {
        title: 'Spell Mana — Banking Resources',
        content: `
          <div class="tut-block">
            <p>Didn't spend all your mana? <strong>Spell Mana</strong> lets you save it:</p>
            <div class="tut-mana-display">
              <div class="tut-mana-type primary"><span class="tut-mana-icon">💎</span><div><strong>Primary Mana</strong><p>Refills every turn. Used for all card types.</p></div></div>
              <div class="tut-mana-type spell"><span class="tut-mana-icon">✦</span><div><strong>Spell Mana</strong><p>Banked from unspent primary mana (up to <strong>3 max</strong>). Can <em>only</em> be used for spells.</p></div></div>
            </div>
            <div class="tut-highlight-box">
              <span class="tut-icon">📖</span>
              <div><strong>Example:</strong> Round 1, you spend 0 mana → bank 1 spell mana. Round 2, you have 2 primary + 1 spell = <strong>3 total</strong> for spells!</div>
            </div>
            <div class="tut-highlight-box tip">
              <span class="tut-icon">💡</span>
              <div><strong>Tip:</strong> Intentionally save mana early to cast expensive spells before your opponent expects it!</div>
            </div>
          </div>`
      },
      {
        title: 'Resource Strategy',
        content: `
          <div class="tut-block">
            <div class="tut-tips-grid">
              <div class="tut-tip-card"><span class="tut-tip-icon">💎</span><strong>Mana Curve</strong><p>Build with a mix of cheap (1–2) and expensive (3+) cards. Don't overload on expensive cards!</p></div>
              <div class="tut-tip-card"><span class="tut-tip-icon">✦</span><strong>Bank Spell Mana</strong><p>Skip playing in Round 1 to bank 1 spell mana for a powerful Round 2 play.</p></div>
              <div class="tut-tip-card"><span class="tut-tip-icon">🆓</span><strong>Free Actions</strong><p>Setting traps and spells face-down costs <strong>0 mana</strong>. Fill your board without spending!</p></div>
              <div class="tut-tip-card"><span class="tut-tip-icon">⚖</span><strong>Tempo vs Value</strong><p>Spend all now (tempo) or save for later (value)? Read the board and adapt each turn.</p></div>
            </div>
          </div>`
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
            <div class="tut-steps">
              <div class="tut-step"><span class="tut-step-num">1</span><div><strong>Select an Attacker</strong><p>Choose one of your units in <strong>ATK position</strong>. Each unit can attack once per turn. Units summoned this turn cannot attack (unless they have <strong>Rush</strong>).</p></div></div>
              <div class="tut-step"><span class="tut-step-num">2</span><div><strong>Choose a Target</strong><p>Target an opponent's unit, or attack their LP directly if they have no units.</p></div></div>
              <div class="tut-step"><span class="tut-step-num">3</span><div><strong>Opponent Response</strong><p>Before combat resolves, your opponent can activate traps or set spells!</p></div></div>
              <div class="tut-step"><span class="tut-step-num">4</span><div><strong>Resolve Combat</strong><p>Damage is dealt based on positions. Destroyed units go to the graveyard.</p></div></div>
            </div>
            <div class="tut-showcase-row" style="margin-top:12px">
              ${this._showcaseCard('S005', 'Aspiring Gladiator', 'Southern')}
              ${this._showcaseCard('N005', 'Frostfang Pup', 'Northern')}
            </div>
            <p style="text-align:center;font-size:0.8rem;color:var(--text-muted)">These units have <strong>Rush</strong> — they can attack the same turn they're summoned!</p>
          </div>`
      },
      {
        title: 'Damage Resolution',
        content: `
          <div class="tut-block">
            <p>How damage works depends on the defender's position:</p>
            <div class="tut-combat-table"><table>
              <thead><tr><th>Scenario</th><th>What Happens</th></tr></thead>
              <tbody>
                <tr><td><strong>ATK vs ATK</strong></td><td>Both units deal their ATK to each other's DEF. Excess damage beyond DEF hits the <strong>owner's LP</strong>. Both units can be destroyed!</td></tr>
                <tr><td><strong>ATK vs DEF</strong></td><td>Attacker's ATK damages defender's DEF. Excess does <strong>NOT</strong> pierce LP. If attacker ATK < defender DEF, attacker's owner takes <strong>rebound damage</strong> (DEF − ATK).</td></tr>
                <tr><td><strong>Direct Attack</strong></td><td>If opponent has no units, your full ATK deals damage to their LP directly.</td></tr>
              </tbody>
            </table></div>
            <div class="tut-highlight-box tip"><span class="tut-icon">💡</span><div><strong>Pierce keyword:</strong> Units with Pierce can deal excess damage to the owner's LP even when attacking a DEF position unit!</div></div>
          </div>`
      },
      {
        title: 'Interactive Combat Simulator',
        content: `
          <div class="tut-block">
            <p>See how combat plays out! Set the defender's position and click "Fight!"</p>
            <div class="tut-combat-sim">
              <div class="tut-combat-side attacker">
                <h4>Your Unit (ATK)</h4>
                <div class="tut-sim-card">${this._cardImg('S010', 'Pit Fighter', 'width:80px;height:110px')}
                  <div class="tut-sim-stats"><span class="tut-mock-atk">⚔ 500</span><span class="tut-mock-def">🛡 <span id="sim-atk-def">200</span></span></div>
                </div>
              </div>
              <div class="tut-combat-middle">
                <button class="tut-demo-btn" id="sim-fight-btn">⚔ Fight!</button>
                <button class="tut-demo-btn" id="sim-reset-btn" style="margin-top:6px;font-size:0.7rem">↻ Reset</button>
                <div class="tut-sim-toggle">
                  <label><input type="radio" name="def-pos" value="atk" checked> ATK pos</label>
                  <label><input type="radio" name="def-pos" value="def"> DEF pos</label>
                </div>
              </div>
              <div class="tut-combat-side defender">
                <h4>Enemy Unit</h4>
                <div class="tut-sim-card">${this._cardImg('N010', 'Guardian Yeti', 'width:80px;height:110px')}
                  <div class="tut-sim-stats"><span class="tut-mock-atk">⚔ <span id="sim-def-atk-val">300</span></span><span class="tut-mock-def">🛡 <span id="sim-def-def">600</span></span></div>
                </div>
              </div>
            </div>
            <div class="tut-combat-result" id="sim-result">Choose defender position and click Fight!</div>
          </div>`,
        onMount: () => {
          let atkDef = 200, defDef = 600;
          const fight = document.getElementById('sim-fight-btn');
          const reset = document.getElementById('sim-reset-btn');
          if (!fight) return;
          fight.onclick = () => {
            const pos = document.querySelector('input[name="def-pos"]:checked')?.value || 'atk';
            const result = document.getElementById('sim-result');
            let msg = '';
            if (pos === 'atk') {
              atkDef -= 300; defDef -= 500;
              document.getElementById('sim-atk-def').textContent = Math.max(0, atkDef);
              document.getElementById('sim-def-def').textContent = Math.max(0, defDef);
              msg = `ATK vs ATK: Pit Fighter takes 300 dmg → ${Math.max(0, atkDef)} DEF. Yeti takes 500 dmg → ${Math.max(0, defDef)} DEF.`;
              if (atkDef <= 0) msg += ' Pit Fighter DESTROYED!';
              if (defDef <= 0) msg += ' Yeti DESTROYED!';
            } else {
              defDef -= 500;
              document.getElementById('sim-def-def').textContent = Math.max(0, defDef);
              msg = `ATK vs DEF: Yeti takes 500 dmg → ${Math.max(0, defDef)} DEF.`;
              if (defDef <= 0) msg += ' Yeti DESTROYED! (No LP damage — DEF position)';
              else msg += ` Pit Fighter owner takes ${defDef} rebound damage!`;
            }
            if (result) result.innerHTML = msg;
          };
          if (reset) reset.onclick = () => {
            atkDef = 200; defDef = 600;
            document.getElementById('sim-atk-def').textContent = '200';
            document.getElementById('sim-def-def').textContent = '600';
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
              <div class="tut-card-type"><h4>⚡ On Summon</h4><p>Triggers when the unit enters the field. E.g. <strong>Beast Tamer</strong> summons a Tiger token.</p></div>
              <div class="tut-card-type"><h4>🔄 Passive</h4><p>Always active while on the field. E.g. <strong>Frostfell Citadel</strong> gives +200 DEF.</p></div>
              <div class="tut-card-type"><h4>🎯 Activated</h4><p>You choose when to use it (usually once per turn). Look for the Activate button.</p></div>
              <div class="tut-card-type"><h4>💀 On Destruction</h4><p>Triggers when destroyed by battle or effect. E.g. "Draw 1 card."</p></div>
              <div class="tut-card-type"><h4>🔇 Silence</h4><p>Some effects can <em>silence</em> a unit, negating all its abilities and stat buffs.</p></div>
            </div>
            <div class="tut-showcase-row" style="margin-top:12px">
              ${this._showcaseCard('W015', 'Beast Tamer', 'Western')}
              ${this._showcaseCard('N027', 'Goat Herder', 'Northern')}
              ${this._showcaseCard('E048', 'Emergency Provisions', 'Eastern')}
            </div>
          </div>`
      },
      {
        title: 'Response System & Chains',
        content: `
          <div class="tut-block">
            <p>The <strong>Response System</strong> adds depth by letting you react to your opponent's moves:</p>
            <div class="tut-chain-diagram">
              <div class="tut-chain-step trigger"><span>1️⃣</span><div><strong>Trigger</strong><p>Opponent plays a card, attacks, or takes an action.</p></div></div>
              <div class="tut-chain-arrow">↓</div>
              <div class="tut-chain-step response"><span>2️⃣</span><div><strong>Response Window</strong><p>You can activate face-down traps or set spells in response.</p></div></div>
              <div class="tut-chain-arrow">↓</div>
              <div class="tut-chain-step counter"><span>3️⃣</span><div><strong>Counter-Response</strong><p>If you respond, your opponent can respond back — building a chain!</p></div></div>
              <div class="tut-chain-arrow">↓</div>
              <div class="tut-chain-step resolve"><span>4️⃣</span><div><strong>Resolution</strong><p>Chain resolves in <strong>reverse order</strong> (last activated → first activated).</p></div></div>
            </div>
            <div class="tut-highlight-box">
              <span class="tut-icon">⚡</span>
              <div><strong>Example:</strong> Opponent casts a spell → You activate <strong>Ice Mirror</strong> to negate it → Opponent can't counter → Your trap resolves first, negating the spell!</div>
            </div>
            <div class="tut-showcase-row" style="margin-top:8px">${this._showcaseCard('N046', 'Ice Mirror', 'Northern')}${this._showcaseCard('E025', 'Calculated Strike', 'Eastern')}</div>
          </div>`
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
            <div class="tut-hero-banner small">
              <img src="./Background.webp" alt="Battle" class="tut-hero-img" />
              <div class="tut-hero-overlay"><p>Challenge the AI and prove your worth!</p></div>
            </div>
            <div class="tut-card-types">
              <div class="tut-card-type"><h4>🤖 Smart AI</h4><p>The AI plays units, casts spells, sets traps, and makes tactical attacks.</p></div>
              <div class="tut-card-type"><h4>🎯 Choose Your Region</h4><p>Pick your region — the AI picks another. Customize your deck!</p></div>
              <div class="tut-card-type"><h4>🔄 Unlimited Replays</h4><p>Play as many matches as you want to practice strategies.</p></div>
            </div>
          </div>`
      },
      {
        title: 'Solo Campaign — Story Mode',
        content: `
          <div class="tut-block">
            <p>Battle through <strong>12 stages</strong> across all four regions against increasingly difficult AI:</p>
            <div class="tut-campaign-map">
              <div class="tut-map-region north">
                <h4>❄ Northern</h4>
                <div class="tut-map-stages"><span class="tut-map-stage">1</span><span class="tut-map-stage">2</span><span class="tut-map-stage boss">👑 3</span></div>
              </div>
              <div class="tut-map-region east">
                <h4>🌿 Eastern</h4>
                <div class="tut-map-stages"><span class="tut-map-stage">4</span><span class="tut-map-stage">5</span><span class="tut-map-stage boss">👑 6</span></div>
              </div>
              <div class="tut-map-region south">
                <h4>🔥 Southern</h4>
                <div class="tut-map-stages"><span class="tut-map-stage">7</span><span class="tut-map-stage">8</span><span class="tut-map-stage boss">👑 9</span></div>
              </div>
              <div class="tut-map-region west">
                <h4>🌅 Western</h4>
                <div class="tut-map-stages"><span class="tut-map-stage">10</span><span class="tut-map-stage">11</span><span class="tut-map-stage boss">👑 12</span></div>
              </div>
            </div>
            <div class="tut-highlight-box tip"><span class="tut-icon">💡</span><div>Boss stages (👑) have stronger AI with more LP! Retry any stage as many times as needed.</div></div>
          </div>`
      },
      {
        title: 'War Campaign — Draft & Battle',
        content: `
          <div class="tut-block">
            <p>The <strong>War Campaign</strong> is a competitive drafting mode:</p>
            <div class="tut-steps">
              <div class="tut-step"><span class="tut-step-num">1</span><div><strong>Choose Regions</strong><p>Each player selects a home region (no duplicates).</p></div></div>
              <div class="tut-step"><span class="tut-step-num">2</span><div><strong>Draft Cards</strong><p>Take turns picking from a shared pool in serpentine order. Picked cards are removed for everyone.</p></div></div>
              <div class="tut-step"><span class="tut-step-num">3</span><div><strong>Build Deck</strong><p>Assemble your battle deck from drafted cards. Mix cards from multiple regions!</p></div></div>
              <div class="tut-step"><span class="tut-step-num">4</span><div><strong>Battle</strong><p>Fight a full match! After each round, draft more cards and rebuild.</p></div></div>
            </div>
            <div class="tut-highlight-box"><span class="tut-icon">🏆</span><div>Win the majority of rounds to claim the War Campaign title!</div></div>
          </div>`
      },
      {
        title: 'Online Match — Play with Friends',
        content: `
          <div class="tut-block">
            <div class="tut-card-types">
              <div class="tut-card-type"><h4>🌐 Online Multiplayer</h4><p>Connect to the game server and battle real players in real-time!</p></div>
              <div class="tut-card-type"><h4>🏛 War Campaign Online</h4><p>Play the full draft-and-battle experience with a friend online. Draft simultaneously!</p></div>
              <div class="tut-card-type"><h4>⚡ Real-Time</h4><p>See your opponent's plays as they happen — including response windows!</p></div>
            </div>
            <p style="text-align:center;margin-top:24px;color:var(--gold);font-family:'Cinzel',serif;font-size:1.1rem">You're ready for battle! Good luck, Commander! ⚔</p>
            <div class="tut-showcase-row" style="margin-top:12px">
              ${this._showcaseCard('N010', 'Guardian Yeti', 'Northern')}
              ${this._showcaseCard('E014', 'Shadow Clone Master', 'Eastern')}
              ${this._showcaseCard('S010', 'Pit Fighter', 'Southern')}
              ${this._showcaseCard('W015', 'Beast Tamer', 'Western')}
            </div>
          </div>`
      }
    ];
  }
}
