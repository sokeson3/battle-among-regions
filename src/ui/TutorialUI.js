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
        this.currentSection = null; // 'regional' or 'campaign'
    }

    // ─── Tutorial Hub (selection screen) ─────────────────────

    showTutorial() {
        this.gameUI.currentScreen = 'tutorial';
        this.app.innerHTML = `
      <div class="tutorial-hub">
        <h1 class="tutorial-hub-title">📖 How to Play</h1>
        <p class="tutorial-hub-subtitle">Choose a tutorial section to begin learning</p>
        <div class="tutorial-mode-cards">
          <div class="tutorial-mode-card regional" id="tut-regional">
            <div class="tutorial-mode-icon">⚔</div>
            <h3>Regional Match</h3>
            <p>Learn the core rules: turn phases, card types, mana, combat, and how to win a standard match.</p>
            <span class="tutorial-slide-count">12 lessons</span>
          </div>
          <div class="tutorial-mode-card campaign" id="tut-campaign">
            <div class="tutorial-mode-icon">🏰</div>
            <h3>Campaign Mode</h3>
            <p>Learn about Solo Campaign progression and the War Campaign drafting system.</p>
            <span class="tutorial-slide-count">8 lessons</span>
          </div>
        </div>
        <button class="menu-btn" id="tut-back" style="margin-top:32px;padding:12px 48px">Back to Menu</button>
      </div>
    `;

        document.getElementById('tut-regional').onclick = () => this._startSection('regional');
        document.getElementById('tut-campaign').onclick = () => this._startSection('campaign');
        document.getElementById('tut-back').onclick = () => this.gameUI.showMenu();
    }

    // ─── Section Launcher ────────────────────────────────────

    _startSection(section) {
        this.currentSection = section;
        this.currentSlideIndex = 0;
        this.currentSlides = section === 'regional' ? this._getRegionalSlides() : this._getCampaignSlides();
        this._renderSlide();
    }

    // ─── Slide Renderer ──────────────────────────────────────

    _renderSlide() {
        const slide = this.currentSlides[this.currentSlideIndex];
        const total = this.currentSlides.length;
        const idx = this.currentSlideIndex;
        const sectionLabel = this.currentSection === 'regional' ? 'Regional Match' : 'Campaign Mode';

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
    }

    // ─── Regional Match Slides ───────────────────────────────

    _getRegionalSlides() {
        return [
            {
                title: 'Welcome to Battle Among Regions',
                content: `
          <div class="tut-block">
            <p>In <strong>Battle Among Regions</strong>, two or more players command armies from different regions, battling for supremacy using units, spells, traps, and powerful landmarks.</p>
            <div class="tut-highlight-box">
              <span class="tut-icon">🎯</span>
              <div>
                <strong>Goal:</strong> Reduce your opponent's <span class="tut-keyword lp">Life Points (LP)</span> to 0, or force them to run out of cards in their deck.
              </div>
            </div>
            <p>Each player starts with <strong>3000 LP</strong> and a deck of cards from their chosen region. Let's learn how it all works!</p>
          </div>
        `
            },
            {
                title: 'The Four Regions',
                content: `
          <div class="tut-block">
            <p>Each region has a distinct playstyle and unique cards. Choose the region that fits your strategy!</p>
            <div class="tut-region-grid">
              <div class="tut-region-item north">
                <h4>❄ Northern</h4>
                <p>Resilient defenders. Masters of healing, fortification, and outlasting opponents.</p>
              </div>
              <div class="tut-region-item east">
                <h4>🌿 Eastern</h4>
                <p>Cunning strategists. Spell mastery, shadow tactics, and battlefield control.</p>
              </div>
              <div class="tut-region-item south">
                <h4>🔥 Southern</h4>
                <p>Aggressive warriors. Raw power, piercing strikes, and relentless pressure.</p>
              </div>
              <div class="tut-region-item west">
                <h4>🌅 Western</h4>
                <p>Adaptable tricksters. Unit synergy, effect manipulation, and surprise combos.</p>
              </div>
            </div>
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
                  <p>If your deck contains Landmark cards, you may place one for free before the game starts.</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">3</span>
                <div>
                  <strong>Draw Starting Hand</strong>
                  <p>You receive 5 cards from your deck as your opening hand.</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">4</span>
                <div>
                  <strong>Mulligan</strong>
                  <p>You may exchange any cards from your hand for new ones from your deck — once only!</p>
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
            <p>The battlefield is where all the action happens. Each player's side of the field has these zones:</p>
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
            <p style="margin-top:12px; color:var(--text-secondary); font-size:0.85rem">Your field is at the bottom, your opponent's is at the top (mirrored).</p>
          </div>
        `
            },
            {
                title: 'Turn Structure',
                content: `
          <div class="tut-block">
            <p>Each turn follows a fixed sequence of 5 phases:</p>
            <div class="tut-phase-flow">
              <div class="tut-phase active">
                <span class="tut-phase-icon">🃏</span>
                <strong>Draw Phase</strong>
                <p>Draw 1 card from your deck. (Skipped on the very first turn of the game.)</p>
              </div>
              <div class="tut-phase-arrow">→</div>
              <div class="tut-phase">
                <span class="tut-phase-icon">🔧</span>
                <strong>Main Phase 1</strong>
                <p>Play units, spells, traps, or landmarks from your hand.</p>
              </div>
              <div class="tut-phase-arrow">→</div>
              <div class="tut-phase">
                <span class="tut-phase-icon">⚔</span>
                <strong>Battle Phase</strong>
                <p>Declare attacks with your units against the opponent.</p>
              </div>
              <div class="tut-phase-arrow">→</div>
              <div class="tut-phase">
                <span class="tut-phase-icon">🔧</span>
                <strong>Main Phase 2</strong>
                <p>Play more cards or set traps after combat.</p>
              </div>
              <div class="tut-phase-arrow">→</div>
              <div class="tut-phase">
                <span class="tut-phase-icon">🏁</span>
                <strong>End Phase</strong>
                <p>Unused mana is banked as spell mana. Turn passes to the next player.</p>
              </div>
            </div>
          </div>
        `
            },
            {
                title: 'Mana System',
                content: `
          <div class="tut-block">
            <p>Mana is the resource you use to play cards. There are two types:</p>
            <div class="tut-mana-display">
              <div class="tut-mana-type primary">
                <span class="tut-mana-icon">💎</span>
                <div>
                  <strong>Primary Mana</strong>
                  <p>Generated each turn. Increases by 1 each round (Round 1 = 1 mana, Round 2 = 2 mana, etc.).</p>
                  <p>Used to play units, spells, and other cards.</p>
                </div>
              </div>
              <div class="tut-mana-type spell">
                <span class="tut-mana-icon">✦</span>
                <div>
                  <strong>Spell Mana</strong>
                  <p>Unspent primary mana at end of turn becomes spell mana (up to 3 max).</p>
                  <p>Can <em>only</em> be used to cast spells — not units.</p>
                </div>
              </div>
            </div>
            <div class="tut-highlight-box tip">
              <span class="tut-icon">💡</span>
              <div><strong>Tip:</strong> Save mana early to bank spell mana for powerful spells later!</div>
            </div>
          </div>
        `
            },
            {
                title: 'Card Types — Units',
                content: `
          <div class="tut-block">
            <p><strong>Units</strong> are your soldiers. They fight on the battlefield and have two stats:</p>
            <div class="tut-stats-display">
              <div class="tut-stat atk">
                <span>⚔ ATK</span>
                <p>Attack power — used to deal damage when attacking.</p>
              </div>
              <div class="tut-stat def">
                <span>🛡 DEF</span>
                <p>Defense points — the unit's HP. When DEF reaches 0, the unit is destroyed.</p>
              </div>
            </div>
            <div class="tut-steps">
              <div class="tut-step">
                <span class="tut-step-num">⚔</span>
                <div>
                  <strong>ATK Position</strong>
                  <p>Card faces up. The unit can attack. Displayed upright on the field.</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">🛡</span>
                <div>
                  <strong>DEF Position</strong>
                  <p>Card is turned sideways. The unit cannot attack but uses its DEF value when targeted. You can set units in DEF position directly from hand.</p>
                </div>
              </div>
            </div>
            <div class="tut-highlight-box tip">
              <span class="tut-icon">💡</span>
              <div><strong>Tip:</strong> You can switch a unit between ATK and DEF once per turn during a Main Phase.</div>
            </div>
          </div>
        `
            },
            {
                title: 'Card Types — Spells, Traps & Landmarks',
                content: `
          <div class="tut-block">
            <div class="tut-card-types">
              <div class="tut-card-type">
                <h4>✦ Spells</h4>
                <p>Powerful one-time effects. You can play a spell <strong>face-up</strong> (costs mana, resolves immediately) or <strong>set it face-down</strong> (free to set, activate later).</p>
              </div>
              <div class="tut-card-type">
                <h4>🪤 Traps</h4>
                <p>Always set <strong>face-down</strong> first (free to set). When your opponent takes an action, you may activate your trap in response — like a counter-attack!</p>
              </div>
              <div class="tut-card-type">
                <h4>🏛 Landmarks</h4>
                <p>Persistent field effects. Each player has <strong>1 landmark slot</strong>. Landmarks provide ongoing bonuses (buffs, healing, mana generation, etc.). Playing a new landmark replaces the old one.</p>
              </div>
            </div>
            <div class="tut-highlight-box">
              <span class="tut-icon">⚡</span>
              <div><strong>Response System:</strong> When your opponent plays a card or attacks, you get a chance to activate face-down traps/spells in response — creating chains!</div>
            </div>
          </div>
        `
            },
            {
                title: 'Combat',
                content: `
          <div class="tut-block">
            <p>During the <strong>Battle Phase</strong>, you declare attacks with your units:</p>
            <div class="tut-steps">
              <div class="tut-step">
                <span class="tut-step-num">1</span>
                <div>
                  <strong>Select an Attacker</strong>
                  <p>Choose one of your units in ATK position. Each unit can attack once per turn.</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">2</span>
                <div>
                  <strong>Choose a Target</strong>
                  <p>Target an opponent's unit, or attack directly if they have no units in ATK position.</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">3</span>
                <div>
                  <strong>Resolve Combat</strong>
                  <p>Your ATK deals damage to the target's DEF. If the target was in ATK position, it fights back!</p>
                </div>
              </div>
            </div>
            <div class="tut-combat-table">
              <table>
                <thead>
                  <tr><th>Scenario</th><th>Result</th></tr>
                </thead>
                <tbody>
                  <tr><td>ATK vs ATK unit</td><td>Both deal damage to each other's DEF. Weaker unit may be destroyed.</td></tr>
                  <tr><td>ATK vs DEF unit</td><td>Attacker's ATK vs defender's DEF. Excess damage does NOT pierce to LP.</td></tr>
                  <tr><td>Direct Attack</td><td>Full ATK damage dealt to opponent's LP.</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        `
            },
            {
                title: 'Card Abilities & Effects',
                content: `
          <div class="tut-block">
            <p>Many cards have special abilities that trigger at specific times:</p>
            <div class="tut-card-types">
              <div class="tut-card-type">
                <h4>⚡ On Summon</h4>
                <p>Triggers automatically when the unit is played to the field. Example: "Deal 2 damage to a target unit."</p>
              </div>
              <div class="tut-card-type">
                <h4>🔄 Passive</h4>
                <p>Always active while the card is on the field. Example: "All friendly Northern units gain +1 ATK."</p>
              </div>
              <div class="tut-card-type">
                <h4>🎯 Activated</h4>
                <p>You choose when to use it (usually once per turn). Look for the <em>Activate</em> button on cards with this ability.</p>
              </div>
              <div class="tut-card-type">
                <h4>💀 On Destruction</h4>
                <p>Triggers when the card is destroyed and sent to the graveyard.</p>
              </div>
            </div>
            <div class="tut-highlight-box tip">
              <span class="tut-icon">💡</span>
              <div><strong>Tip:</strong> Read your cards carefully! Powerful effects can turn the tide of battle. Hover or click on any card to see its full art and details.</div>
            </div>
          </div>
        `
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
          </div>
        `
            },
            {
                title: 'Tips & Strategy',
                content: `
          <div class="tut-block">
            <div class="tut-tips-grid">
              <div class="tut-tip-card">
                <span class="tut-tip-icon">💎</span>
                <strong>Manage Your Mana</strong>
                <p>Don't spend everything! Banking mana as spell mana gives you flexibility on future turns.</p>
              </div>
              <div class="tut-tip-card">
                <span class="tut-tip-icon">🪤</span>
                <strong>Set Traps Early</strong>
                <p>Traps are free to set. Get them down early to surprise your opponent when they attack or play big cards.</p>
              </div>
              <div class="tut-tip-card">
                <span class="tut-tip-icon">🛡</span>
                <strong>Use DEF Position</strong>
                <p>When you're behind, setting units in DEF position can buy time — excess ATK damage doesn't pierce to your LP!</p>
              </div>
              <div class="tut-tip-card">
                <span class="tut-tip-icon">🏛</span>
                <strong>Leverage Landmarks</strong>
                <p>Landmarks provide persistent advantages. Place one early to gain a lasting edge throughout the match.</p>
              </div>
              <div class="tut-tip-card">
                <span class="tut-tip-icon">🔄</span>
                <strong>Know Your Region</strong>
                <p>Play to your region's strengths. Northern defends, Southern attacks, Eastern controls, Western adapts.</p>
              </div>
              <div class="tut-tip-card">
                <span class="tut-tip-icon">⚡</span>
                <strong>Watch for Responses</strong>
                <p>Your opponent can activate face-down cards in response to your actions. Play cautiously!</p>
              </div>
            </div>
            <p style="text-align:center;margin-top:24px;color:var(--gold);font-family:'Cinzel',serif;font-size:1.1rem">You're ready for battle! Good luck, Commander! ⚔</p>
          </div>
        `
            }
        ];
    }

    // ─── Campaign Slides ─────────────────────────────────────

    _getCampaignSlides() {
        return [
            {
                title: 'Solo Campaign Overview',
                content: `
          <div class="tut-block">
            <p>The <strong>Solo Campaign</strong> lets you battle through 12 stages across all four regions, fighting AI opponents of increasing difficulty.</p>
            <div class="tut-highlight-box">
              <span class="tut-icon">🏰</span>
              <div><strong>Story:</strong> Travel across the four regions, defeat enemy commanders, and prove your dominance in Battle Among Regions!</div>
            </div>
            <div class="tut-steps">
              <div class="tut-step">
                <span class="tut-step-num">1</span>
                <div>
                  <strong>Choose Your Region</strong>
                  <p>Select the region you'll represent throughout the campaign.</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">2</span>
                <div>
                  <strong>Battle Through Stages</strong>
                  <p>Fight AI opponents from each region. Stages get progressively harder.</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">3</span>
                <div>
                  <strong>Boss Fights</strong>
                  <p>Each region's final stage is a boss battle with a stronger AI and more LP!</p>
                </div>
              </div>
            </div>
          </div>
        `
            },
            {
                title: 'Campaign Map & Progression',
                content: `
          <div class="tut-block">
            <p>The campaign map shows all 12 stages organized by region. Stages unlock as you progress:</p>
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
              <div><strong>Tip:</strong> You must complete stages in order. Beat all 12 to conquer every region!</div>
            </div>
          </div>
        `
            },
            {
                title: 'Fighting the AI',
                content: `
          <div class="tut-block">
            <p>In Solo Campaign, you fight against an AI opponent that uses heuristic-based strategy:</p>
            <div class="tut-card-types">
              <div class="tut-card-type">
                <h4>🤖 AI Behavior</h4>
                <p>The AI will play units, cast spells, set traps, and make attacks — just like a human player. It evaluates the board state and makes tactical decisions.</p>
              </div>
              <div class="tut-card-type">
                <h4>📈 Scaling Difficulty</h4>
                <p>Early stages are easier with weaker AI decks. Boss stages feature stronger decks with better synergies and more LP.</p>
              </div>
              <div class="tut-card-type">
                <h4>🔄 Retry</h4>
                <p>Lost a battle? You can retry any stage as many times as you want. Learn from your mistakes!</p>
              </div>
            </div>
            <p style="color:var(--text-secondary);margin-top:12px">The AI handles its turns automatically — you'll see a transition screen when it's the AI's turn, then the results are shown on the game board.</p>
          </div>
        `
            },
            {
                title: 'War Campaign Overview',
                content: `
          <div class="tut-block">
            <p>The <strong>War Campaign</strong> is a competitive multiplayer campaign mode featuring a unique serpentine drafting system and multi-round battles!</p>
            <div class="tut-highlight-box">
              <span class="tut-icon">⚔</span>
              <div><strong>Format:</strong> Players draft cards from a shared pool, build custom decks, then battle across multiple rounds in a best-of series.</div>
            </div>
            <div class="tut-steps">
              <div class="tut-step">
                <span class="tut-step-num">1</span>
                <div>
                  <strong>Select Player Count</strong>
                  <p>War Campaign supports 2, 3, or 4 players.</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">2</span>
                <div>
                  <strong>Choose Regions</strong>
                  <p>Each player selects their home region (no duplicates).</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">3</span>
                <div>
                  <strong>Draft → Fight → Repeat</strong>
                  <p>Players draft cards before each round, then battle. Winner gains control!</p>
                </div>
              </div>
            </div>
          </div>
        `
            },
            {
                title: 'War Campaign — Drafting System',
                content: `
          <div class="tut-block">
            <p>The drafting system uses a <strong>serpentine order</strong> to ensure fairness:</p>
            <div class="tut-draft-diagram">
              <div class="tut-draft-round">
                <h4>Draft Order (2 Players)</h4>
                <div class="tut-draft-steps">
                  <div class="tut-draft-pick">
                    <span class="tut-pick-label p1">P1</span> picks from <span class="tut-pick-region">Opponent's region</span>
                  </div>
                  <div class="tut-draft-pick">
                    <span class="tut-pick-label p2">P2</span> picks from <span class="tut-pick-region">Opponent's region</span>
                  </div>
                  <div class="tut-draft-pick">
                    <span class="tut-pick-label p2">P2</span> picks from <span class="tut-pick-region">Neutral region</span>
                  </div>
                  <div class="tut-draft-pick">
                    <span class="tut-pick-label p1">P1</span> picks from <span class="tut-pick-region">Own region</span>
                  </div>
                  <div class="tut-draft-pick mid">... and so on until the round cap</div>
                </div>
              </div>
            </div>
            <div class="tut-highlight-box">
              <span class="tut-icon">📋</span>
              <div><strong>Key Rules:</strong> Cards picked by one player are removed from the pool for everyone. Landmarks can only be picked from your own region.</div>
            </div>
          </div>
        `
            },
            {
                title: 'War Campaign — Building Your Deck',
                content: `
          <div class="tut-block">
            <p>After each draft phase, you build a battle deck from your picked cards:</p>
            <div class="tut-card-types">
              <div class="tut-card-type">
                <h4>📦 Card Pool</h4>
                <p>All cards you've drafted throughout the campaign are available. You can mix cards from multiple regions!</p>
              </div>
              <div class="tut-card-type">
                <h4>🔨 Deck Building</h4>
                <p>Select cards from your pool to form your battle deck. Find the right balance of units, spells, and traps.</p>
              </div>
              <div class="tut-card-type">
                <h4>🔄 Adapt Each Round</h4>
                <p>Between rounds, you draft more cards and can rebuild your deck. Adapt your strategy based on previous battles!</p>
              </div>
            </div>
            <div class="tut-highlight-box tip">
              <span class="tut-icon">💡</span>
              <div><strong>Tip:</strong> Pay attention to what your opponents draft — counter-pick cards that are strong against their strategy!</div>
            </div>
          </div>
        `
            },
            {
                title: 'War Campaign — Rounds & Battles',
                content: `
          <div class="tut-block">
            <p>The War Campaign plays across multiple rounds:</p>
            <div class="tut-steps">
              <div class="tut-step">
                <span class="tut-step-num">📋</span>
                <div>
                  <strong>Pre-Round</strong>
                  <p>See matchups, review deck standings, and prepare for battle.</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">⚔</span>
                <div>
                  <strong>Battle</strong>
                  <p>Play a full match against your opponent using your drafted deck. Standard rules apply — all the mechanics you learned in the Regional Match tutorial.</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">📊</span>
                <div>
                  <strong>Post-Round</strong>
                  <p>Results are tallied. Winners and losers are tracked on the scoreboard.</p>
                </div>
              </div>
              <div class="tut-step">
                <span class="tut-step-num">🔄</span>
                <div>
                  <strong>Next Draft</strong>
                  <p>Draft more cards from the pool and adjust your deck before the next round.</p>
                </div>
              </div>
            </div>
          </div>
        `
            },
            {
                title: 'War Campaign — Victory',
                content: `
          <div class="tut-block">
            <p>The campaign continues until one player has won enough rounds to claim total victory!</p>
            <div class="tut-highlight-box">
              <span class="tut-icon">🏆</span>
              <div>
                <strong>Winning:</strong> The first player to win the majority of rounds claims victory. In a 2-player campaign with 3 rounds, you need 2 wins!
              </div>
            </div>
            <div class="tut-tips-grid" style="grid-template-columns:1fr 1fr">
              <div class="tut-tip-card">
                <span class="tut-tip-icon">🧠</span>
                <strong>Draft Smart</strong>
                <p>Counter-draft to deny your opponent key cards while building your own synergies.</p>
              </div>
              <div class="tut-tip-card">
                <span class="tut-tip-icon">🔄</span>
                <strong>Adapt & Evolve</strong>
                <p>Each round is a new chance. Adjust your deck and strategy based on what worked.</p>
              </div>
            </div>
            <p style="text-align:center;margin-top:24px;color:var(--gold);font-family:'Cinzel',serif;font-size:1.1rem">Lead your region to glorious conquest! 🏰</p>
          </div>
        `
            }
        ];
    }
}
