// ─────────────────────────────────────────────────────────────
// OnlineGameUI.js — Online Lobby, Matchmaking & Game Flow
// ─────────────────────────────────────────────────────────────

import { NetworkManager } from '../online/NetworkManager.js';
import { PHASES } from '../engine/GameState.js';

export class OnlineGameUI {
    /**
     * @param {import('./GameUI.js').GameUI} gameUI
     * @param {import('../engine/GameController.js').GameController} controller
     */
    constructor(gameUI, controller) {
        this.gameUI = gameUI;
        this.controller = controller;
        this.app = document.getElementById('app');
        this.net = new NetworkManager();
        this.myPlayerId = null;
        this.currentState = null;
        this.roomCode = null;
        this.attackingUnit = null;
        this.pendingPlacement = null;
    }

    // ─── Connection ──────────────────────────────────────────

    async connectToServer() {
        // Use env var for production (set in .env.production), fall back to same-origin or localhost
        const envUrl = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SERVER_URL;
        let url;
        if (envUrl) {
            url = envUrl;
        } else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            url = `ws://${window.location.hostname}:4000`;
        } else {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            url = `${protocol}//${window.location.host}`;
        }

        try {
            await this.net.connect(url);
            this._wireNetworkEvents();
            return true;
        } catch (err) {
            console.error('Connection failed:', err);
            return false;
        }
    }

    _wireNetworkEvents() {
        this.net.on('ROOM_CREATED', (msg) => {
            this.roomCode = msg.roomCode;
            this._showWaitingForOpponent();
        });

        this.net.on('ROOM_JOINED', (msg) => {
            this._showWaitingForGame(msg.opponentName, msg.opponentRegion);
        });

        this.net.on('OPPONENT_JOINED', (msg) => {
            this._showWaitingForGame(msg.opponentName, msg.opponentRegion);
        });

        this.net.on('REQUEST_LANDMARK', (msg) => {
            this._showLandmarkSelection(msg.landmarks);
        });

        this.net.on('REQUEST_MULLIGAN', (msg) => {
            this._showMulliganScreen(msg.hand);
        });

        this.net.on('GAME_PHASE', (msg) => {
            if (msg.phase === 'WAITING') {
                this._showWaitingScreen(msg.message || 'Waiting for opponent...');
            } else if (msg.phase === 'PLAYING') {
                this.myPlayerId = this.myPlayerId; // already set
            } else if (msg.phase === 'LANDMARK' && msg.landmarks && msg.landmarks.length === 0) {
                this.net.skipLandmark();
                this._showWaitingScreen('Waiting for opponent to select a landmark...');
            }
        });

        this.net.on('GAME_STATE', (msg) => {
            this.myPlayerId = msg.yourPlayerId;
            this.currentState = msg.state;
            // Only re-render if we're in the playing phase
            if (this.currentState.phase !== 'SETUP' && this.currentState.phase !== 'MULLIGAN') {
                this._renderOnlineGame();
            }
        });

        this.net.on('TURN_CHANGE', (msg) => {
            this._showTurnTransition(msg);
        });

        this.net.on('REQUEST_TARGET', (msg) => {
            this._showTargetSelection(msg.targets, msg.description);
        });

        this.net.on('REQUEST_CHOICE', (msg) => {
            this._showChoiceDialog(msg.options, msg.description);
        });

        this.net.on('REQUEST_RESPONSE', (msg) => {
            this._showResponseDialog(msg.faceDownCards);
        });

        this.net.on('TOAST', (msg) => {
            this._showToast(msg.message);
        });

        this.net.on('ACTION_RESULT', (msg) => {
            if (!msg.success && msg.reason) {
                this._showToast(msg.reason);
            }
        });

        this.net.on('GAME_OVER', (msg) => {
            this._showGameOver(msg);
        });

        this.net.on('ERROR', (msg) => {
            this._showToast(msg.message || 'An error occurred.');
        });

        this.net.on('OPPONENT_DISCONNECTED', (msg) => {
            this._showDisconnected(msg.message);
        });

        this.net.on('disconnected', () => {
            this._showDisconnected('Connection to server lost.');
        });
    }

    // ─── Lobby Screens ───────────────────────────────────────

    showLobby() {
        this.app.innerHTML = `
            <div class="main-menu online-lobby">
                <h1 class="menu-title">⚔ Online Battle</h1>
                <p class="menu-subtitle">Play against a friend online</p>
                <div class="menu-buttons">
                    <button class="menu-btn primary" id="btn-create">Create Room</button>
                    <button class="menu-btn" id="btn-join">Join Room</button>
                    <button class="menu-btn" id="btn-back">← Back to Menu</button>
                </div>
                <div class="online-status" id="connection-status">
                    <span class="status-dot connected"></span> Connected to server
                </div>
            </div>
        `;

        document.getElementById('btn-create').onclick = () => this._showCreateRoom();
        document.getElementById('btn-join').onclick = () => this._showJoinRoom();
        document.getElementById('btn-back').onclick = () => {
            this.net.disconnect();
            this.gameUI.showMenu();
        };
    }

    _showCreateRoom() {
        this.app.innerHTML = `
            <div class="main-menu online-lobby">
                <h1 class="menu-title">Create Room</h1>
                <p class="menu-subtitle">Choose your name and region</p>
                <div class="online-form">
                    <input type="text" class="online-input" id="player-name" placeholder="Your Name" maxlength="20" value="Player 1" />
                    <div class="region-grid online-region-grid">
                        ${this._renderRegionCard('Northern', 'north', 'Resilient defenders.')}
                        ${this._renderRegionCard('Eastern', 'east', 'Cunning strategists.')}
                        ${this._renderRegionCard('Southern', 'south', 'Aggressive warriors.')}
                        ${this._renderRegionCard('Western', 'west', 'Adaptable tricksters.')}
                    </div>
                    <button class="menu-btn" id="btn-lobby-back">← Back</button>
                </div>
            </div>
        `;

        document.querySelectorAll('.region-card').forEach(card => {
            card.onclick = () => {
                const region = card.dataset.region;
                const name = document.getElementById('player-name').value.trim() || 'Player 1';
                this.net.createRoom(name, region);
            };
        });

        document.getElementById('btn-lobby-back').onclick = () => this.showLobby();
    }

    _showJoinRoom() {
        this.app.innerHTML = `
            <div class="main-menu online-lobby">
                <h1 class="menu-title">Join Room</h1>
                <p class="menu-subtitle">Enter the room code and choose your region</p>
                <div class="online-form">
                    <input type="text" class="online-input room-code-input" id="room-code" placeholder="ROOM CODE" maxlength="4" style="text-transform:uppercase;text-align:center;font-size:2rem;letter-spacing:0.3em" />
                    <input type="text" class="online-input" id="player-name" placeholder="Your Name" maxlength="20" value="Player 2" />
                    <div class="region-grid online-region-grid">
                        ${this._renderRegionCard('Northern', 'north', 'Resilient defenders.')}
                        ${this._renderRegionCard('Eastern', 'east', 'Cunning strategists.')}
                        ${this._renderRegionCard('Southern', 'south', 'Aggressive warriors.')}
                        ${this._renderRegionCard('Western', 'west', 'Adaptable tricksters.')}
                    </div>
                    <button class="menu-btn" id="btn-lobby-back">← Back</button>
                </div>
            </div>
        `;

        document.querySelectorAll('.region-card').forEach(card => {
            card.onclick = () => {
                const region = card.dataset.region;
                const code = document.getElementById('room-code').value.trim().toUpperCase();
                const name = document.getElementById('player-name').value.trim() || 'Player 2';

                if (code.length !== 4) {
                    this._showToast('Please enter a 4-character room code.');
                    return;
                }

                this.net.joinRoom(code, name, region);
            };
        });

        document.getElementById('btn-lobby-back').onclick = () => this.showLobby();
    }

    _showWaitingForOpponent() {
        this.app.innerHTML = `
            <div class="main-menu online-lobby">
                <h1 class="menu-title">Room Created!</h1>
                <div class="room-code-display">
                    <p class="room-code-label">Share this code with your opponent:</p>
                    <div class="room-code-big">${this.roomCode}</div>
                    <button class="menu-btn compact" id="btn-copy-code">📋 Copy Code</button>
                </div>
                <div class="waiting-animation">
                    <div class="waiting-dots">
                        <span></span><span></span><span></span>
                    </div>
                    <p>Waiting for opponent to join...</p>
                </div>
                <button class="menu-btn" id="btn-cancel">Cancel</button>
            </div>
        `;

        document.getElementById('btn-copy-code').onclick = () => {
            navigator.clipboard.writeText(this.roomCode).then(() => {
                this._showToast('Code copied!');
            });
        };
        document.getElementById('btn-cancel').onclick = () => {
            this.net.disconnect();
            this.gameUI.showMenu();
        };
    }

    _showWaitingForGame(opponentName, opponentRegion) {
        this.app.innerHTML = `
            <div class="main-menu online-lobby">
                <h1 class="menu-title">Match Found!</h1>
                <p class="menu-subtitle">vs ${opponentName} (${opponentRegion})</p>
                <div class="waiting-animation">
                    <div class="waiting-dots">
                        <span></span><span></span><span></span>
                    </div>
                    <p>Setting up the game...</p>
                </div>
            </div>
        `;
    }

    _showWaitingScreen(message) {
        this.app.innerHTML = `
            <div class="main-menu online-lobby">
                <div class="waiting-animation">
                    <div class="waiting-dots">
                        <span></span><span></span><span></span>
                    </div>
                    <p>${message}</p>
                </div>
            </div>
        `;
    }

    // ─── Landmark Selection ──────────────────────────────────

    _showLandmarkSelection(landmarks) {
        if (landmarks.length === 0) {
            this.net.skipLandmark();
            this._showWaitingScreen('Waiting for opponent...');
            return;
        }

        this.app.innerHTML = `
            <div class="mulligan-screen">
                <h2>Select a Landmark</h2>
                <p>Choose a Landmark to play for free, or skip</p>
                <div class="mulligan-cards">
                    ${landmarks.map(card => `
                        <div class="game-card mulligan-card ${this._getRegionClass(card.region)}"
                             data-id="${card.instanceId}" data-card-id="${card.cardId}"
                             style="width:150px;height:210px;position:relative;cursor:pointer">
                            ${this._renderCardVisual(card)}
                        </div>
                    `).join('')}
                </div>
                <div style="display:flex;gap:16px;align-items:center;margin-top:16px">
                    <button class="action-btn primary" id="btn-accept-landmark" style="opacity:0.5;pointer-events:none">Accept</button>
                    <button class="action-btn" id="btn-skip-landmark">Skip</button>
                </div>
            </div>
        `;

        let selectedId = null;

        document.querySelectorAll('.mulligan-card').forEach(el => {
            el.onclick = () => {
                document.querySelectorAll('.mulligan-card').forEach(c => c.classList.remove('landmark-selected'));
                el.classList.add('landmark-selected');
                selectedId = el.dataset.id;
                const btn = document.getElementById('btn-accept-landmark');
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
            };
        });

        document.getElementById('btn-accept-landmark').onclick = () => {
            if (selectedId) {
                this.net.selectLandmark(selectedId);
                this._showWaitingScreen('Waiting for opponent...');
            }
        };

        document.getElementById('btn-skip-landmark').onclick = () => {
            this.net.skipLandmark();
            this._showWaitingScreen('Waiting for opponent...');
        };
    }

    // ─── Mulligan ────────────────────────────────────────────

    _showMulliganScreen(hand) {
        const selectedIds = new Set();

        const render = () => {
            this.app.innerHTML = `
                <div class="mulligan-screen">
                    <h2>Mulligan Phase</h2>
                    <p>Select cards to replace (click to toggle)</p>
                    <div class="mulligan-cards">
                        ${hand.map(card => `
                            <div class="game-card mulligan-card ${this._getRegionClass(card.region)} ${selectedIds.has(card.instanceId) ? 'selected' : ''}"
                                 data-id="${card.instanceId}" style="width:110px;height:154px;position:relative">
                                ${this._renderCardVisual(card)}
                            </div>
                        `).join('')}
                    </div>
                    <div style="display:flex;gap:16px;align-items:center">
                        <button class="action-btn primary" id="btn-keep">Keep Hand</button>
                        <button class="action-btn" id="btn-mulligan" ${selectedIds.size === 0 ? 'style="opacity:0.5"' : ''}>
                            Replace ${selectedIds.size} Card${selectedIds.size !== 1 ? 's' : ''}
                        </button>
                    </div>
                </div>
            `;

            document.querySelectorAll('.mulligan-card').forEach(el => {
                el.onclick = () => {
                    const id = el.dataset.id;
                    if (selectedIds.has(id)) selectedIds.delete(id);
                    else selectedIds.add(id);
                    render();
                };
            });

            document.getElementById('btn-keep').onclick = () => {
                this.net.mulligan([]);
                this._showWaitingScreen('Waiting for opponent...');
            };

            document.getElementById('btn-mulligan').onclick = () => {
                if (selectedIds.size > 0) {
                    this.net.mulligan([...selectedIds]);
                    this._showWaitingScreen('Waiting for opponent...');
                }
            };
        };

        render();
    }

    // ─── Turn Transition ─────────────────────────────────────

    _showTurnTransition(msg) {
        const state = this.currentState;
        if (!state) return;

        const activePlayer = state.players[msg.activePlayerId];
        const isMyTurn = msg.activePlayerId === this.myPlayerId;
        const regionClass = this._getRegionClass(activePlayer.region);

        this.app.innerHTML = `
            <div class="turn-transition visible">
                <h2 style="color: var(--text-primary)">${isMyTurn ? 'Your Turn' : `${activePlayer.name}'s Turn`}</h2>
                <p>Round ${msg.round} — ${activePlayer.region} Region</p>
                <button class="start-btn" id="btn-start">Continue</button>
            </div>
        `;

        document.getElementById('btn-start').onclick = () => {
            this._renderOnlineGame();
        };
    }

    // ─── Main Game Rendering ─────────────────────────────────

    _renderOnlineGame() {
        const state = this.currentState;
        if (!state || !state.players) return;

        const myId = this.myPlayerId;
        const opId = myId === 0 ? 1 : 0;
        const me = state.players[myId];
        const opp = state.players[opId];
        const isMyTurn = state.activePlayerIndex === myId;
        const phase = state.phase;

        this.app.innerHTML = `
            <!-- Opponent bar (top) -->
            ${this._renderPlayerBar(opp, 'top', false)}

            <!-- Opponent field -->
            <div class="field-rows">
                <div class="field-landmark-col">
                    ${this._renderLandmarkSlot(opp)}
                </div>
                <div class="field-main">
                    <div class="field-section opponent">
                        ${this._renderSpellTrapZone(opp, true)}
                    </div>
                    <div class="field-section opponent">
                        ${this._renderUnitZone(opp, true)}
                    </div>
                </div>
                <div class="field-landmark-col">
                    ${this._renderSideZone(opp)}
                </div>
            </div>

            <!-- Divider + Phase bar -->
            <div class="field-divider"></div>
            ${this._renderPhaseBar(state, isMyTurn)}

            <!-- My field -->
            <div class="field-rows">
                <div class="field-landmark-col">
                    ${this._renderLandmarkSlot(me)}
                </div>
                <div class="field-main">
                    <div class="field-section">
                        ${this._renderUnitZone(me, false)}
                    </div>
                    <div class="field-section">
                        ${this._renderSpellTrapZone(me, false)}
                    </div>
                </div>
                <div class="field-landmark-col">
                    ${this._renderSideZone(me)}
                </div>
            </div>

            <!-- My bar (bottom) -->
            ${this._renderPlayerBar(me, 'bottom', true)}

            <!-- Hand -->
            ${this._renderHand(me, isMyTurn, phase)}

            <!-- Action buttons -->
            ${this._renderActionPanel(state, isMyTurn)}

            ${this.pendingPlacement ? `<div class="placement-instruction">Choose a field to play this card to</div>` : ''}

            <!-- Online indicator -->
            <div class="online-indicator ${isMyTurn ? 'my-turn' : 'opp-turn'}">
                ${isMyTurn ? '🟢 Your Turn' : '🔴 Opponent\'s Turn'}
            </div>
        `;

        this._attachOnlineListeners(me, opp, state, isMyTurn);
    }

    // ─── Component Renderers (adapted for online state objects) ──

    _renderPlayerBar(player, position, isActive) {
        const lpPct = Math.max(0, (player.lp / 3000) * 100);
        const lpClass = lpPct > 50 ? 'healthy' : lpPct > 25 ? 'warning' : 'danger';
        const regionClass = this._getRegionClass(player.region);

        return `
            <div class="player-bar ${position} ${isActive ? 'active' : ''}" data-player="${player.id}">
                <div class="player-identity">
                    <div class="player-avatar ${regionClass}">${player.name[0]}</div>
                    <div>
                        <div class="player-name">${player.name}</div>
                        <div class="player-region-label">${player.region}</div>
                    </div>
                </div>
                <div class="lp-display" id="lp-${player.id}">
                    <div class="lp-bar-wrapper">
                        <div class="lp-bar ${lpClass}" style="width:${lpPct}%"></div>
                    </div>
                    <span class="lp-text">${player.lp}</span>
                </div>
                <div class="mana-display">
                    <div class="mana-number primary-mana">
                        <span class="mana-icon">💎</span>
                        <span class="mana-value">${player.primaryMana}</span>
                    </div>
                    <div class="mana-number spell-mana">
                        <span class="mana-icon">✦</span>
                        <span class="mana-value">${player.spellMana}</span>
                    </div>
                    <span class="mana-label">Total: ${player.primaryMana + player.spellMana}</span>
                </div>
            </div>
        `;
    }

    _renderUnitZone(player, isOpponent) {
        return `
            <div class="unit-zone" style="display:flex;gap:8px" data-zone="unit" data-player="${player.id}">
                ${player.unitZone.map((card, i) => {
            if (card) {
                const posClass = card.position === 'DEF' ? 'defense-position' : '';
                const damagedClass = card.damageTaken > 0 ? 'damaged' : '';
                const buffed = (card.atkModifiers && card.atkModifiers.length > 0) || (card.defModifiers && card.defModifiers.length > 0);
                const regionClass = this._getRegionClass(card.region);
                const statTokens = this._renderStatTokens(card);
                return `
                            <div class="card-slot has-card" data-slot="${i}" data-instance="${card.instanceId}">
                                <div class="game-card ${regionClass} ${posClass} ${damagedClass} ${buffed ? 'buffed' : ''} ${card.silenced ? 'silenced' : ''}"
                                     data-instance="${card.instanceId}" data-player="${player.id}" data-card-id="${card.cardId}">
                                    ${this._renderCardVisual(card)}
                                    ${statTokens}
                                </div>
                            </div>
                        `;
            }
            const isValidForPlacement = this.pendingPlacement && this.pendingPlacement.type === 'Unit' && this.pendingPlacement.playerId === player.id;
            return `<div class="card-slot${isValidForPlacement ? ' valid-placement' : ''}" data-slot="${i}" data-player="${player.id}" data-zone="unit"></div>`;
        }).join('')}
            </div>
        `;
    }

    _renderSpellTrapZone(player, isOpponent) {
        return `
            <div class="spelltrap-zone" style="display:flex;gap:8px" data-zone="spellTrap" data-player="${player.id}">
                ${player.spellTrapZone.map((card, i) => {
            if (card) {
                if (!card.faceUp) {
                    return `
                                <div class="card-slot has-card" data-slot="${i}">
                                    <div class="game-card face-down" data-instance="${card.instanceId}" data-player="${player.id}" data-card-id="${card.cardId}">
                                        <img class="card-image" src="./Background.webp" alt="Face-down"
                                             style="width:100%;height:100%;object-fit:contain;border-radius:var(--radius-card);background:#0a0c14" />
                                    </div>
                                </div>
                            `;
                }
                return `
                            <div class="card-slot has-card" data-slot="${i}">
                                <div class="game-card ${this._getRegionClass(card.region)}" data-instance="${card.instanceId}" data-player="${player.id}" data-card-id="${card.cardId}">
                                    ${this._renderCardVisual(card)}
                                </div>
                            </div>
                        `;
            }
            const isValidForPlacement = this.pendingPlacement &&
                (this.pendingPlacement.type === 'SpellSet' || this.pendingPlacement.type === 'TrapSet') &&
                this.pendingPlacement.playerId === player.id;
            return `<div class="card-slot${isValidForPlacement ? ' valid-placement' : ''}" data-slot="${i}" data-player="${player.id}" data-zone="spellTrap"></div>`;
        }).join('')}
            </div>
        `;
    }

    _renderLandmarkSlot(player) {
        const landmark = player.landmarkZone;
        if (landmark) {
            const imgPath = `./output-web/${landmark.cardId}.webp`;
            return `
                <div class="landmark-slot has-card" data-player="${player.id}">
                    <div class="game-card ${this._getRegionClass(landmark.region)} field-card"
                         data-instance="${landmark.instanceId}" data-player="${player.id}" data-card-id="${landmark.cardId}">
                        <img class="card-image" src="${imgPath}" alt="${landmark.name}"
                             onerror="this.parentElement.classList.add('no-art')" loading="lazy"
                             style="width:100%;height:100%;object-fit:contain;border-radius:var(--radius-card)" />
                    </div>
                </div>
            `;
        }
        const isValidForPlacement = this.pendingPlacement && this.pendingPlacement.type === 'Landmark' && this.pendingPlacement.playerId === player.id;
        return `<div class="landmark-slot${isValidForPlacement ? ' valid-placement' : ''}" data-player="${player.id}"></div>`;
    }

    _renderSideZone(player) {
        const deckCount = player.deckCount !== undefined ? player.deckCount : (player.deck ? player.deck.length : 0);
        const graveCount = player.graveyard ? player.graveyard.length : 0;
        return `
            <div class="side-zone">
                <div class="deck-pile" style="position:relative; overflow:hidden; background-image:url('./Background.webp'); background-size:cover; background-position:center; border-radius:var(--radius-card); outline:1px solid rgba(255,255,255,0.2);">
                    <div style="position:absolute; inset:0; background:rgba(0,0,0,0.15);"></div>
                    <span style="position:relative; z-index:1; background:rgba(0,0,0,0.75); padding:2px 8px; border-radius:4px; font-weight:bold; box-shadow:0 0 4px rgba(0,0,0,0.8);">${deckCount}</span>
                </div>
                <span class="zone-count">Deck</span>
                <div class="graveyard-pile">${graveCount}</div>
                <span class="zone-count">Grave</span>
            </div>
        `;
    }

    _renderHand(player, isMyTurn, phase) {
        const isMainPhase = phase === 'MAIN1' || phase === 'MAIN2';

        // Opponent's hand: show hidden cards
        const hand = player.hand || [];

        return `
            <div class="hand-container">
                <div class="hand-cards">
                    ${hand.map(card => {
            if (card.hidden) {
                return `
                                <div class="hand-card game-card face-down-hand" style="width:90px;height:126px">
                                    <img class="card-image" src="./Background.webp" alt="Hidden"
                                         style="width:100%;height:100%;object-fit:contain;border-radius:var(--radius-card);background:#0a0c14" />
                                </div>
                            `;
            }

            const canPlay = isMyTurn && isMainPhase; // Simplified — server validates
            const statTokens = this._renderStatTokens(card);
            return `
                            <div class="hand-card game-card ${this._getRegionClass(card.region)} ${canPlay ? 'playable' : ''}"
                                 data-instance="${card.instanceId}" data-type="${card.type}" data-card-id="${card.cardId}">
                                ${this._renderCardVisual(card)}
                                ${statTokens}
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    }

    _renderPhaseBar(state, isMyTurn) {
        const phases = [
            { id: 'DRAW', label: 'Draw' },
            { id: 'MAIN1', label: 'Main 1' },
            { id: 'BATTLE', label: 'Battle' },
            { id: 'MAIN2', label: 'Main 2' },
            { id: 'END', label: 'End' },
        ];

        const phaseOrder = phases.map(p => p.id);
        const currentIdx = phaseOrder.indexOf(state.phase);

        return `
            <div class="phase-bar">
                ${phases.map((p, i) => {
            const cls = i === currentIdx ? 'active' : i < currentIdx ? 'completed' : '';
            return `<span class="phase-step ${cls}">${p.label}</span>`;
        }).join('<span style="color:var(--text-muted);font-size:0.5rem">▸</span>')}
                <span style="margin-left:16px;font-size:0.65rem;color:var(--text-muted)">
                    R${state.roundCounter} T${state.turnCounter}
                </span>
            </div>
        `;
    }

    _renderActionPanel(state, isMyTurn) {
        const phase = state.phase;
        const buttons = [];

        if (isMyTurn) {
            if (phase === 'MAIN1' && !state.isFirstTurn) {
                buttons.push(`<button class="action-btn primary" id="btn-battle">⚔ Battle</button>`);
            }
            if (phase === 'MAIN1' || phase === 'MAIN2') {
                buttons.push(`<button class="action-btn" id="btn-endturn">End Turn ▸</button>`);
            }
            if (phase === 'BATTLE') {
                buttons.push(`<button class="action-btn" id="btn-endbattle">End Battle ▸</button>`);
            }
        } else {
            buttons.push(`<span class="waiting-label">Opponent's Turn</span>`);
        }

        if (this.attackingUnit || this.pendingPlacement) {
            buttons.push(`<button class="action-btn danger" id="btn-cancel-action">✕ Cancel</button>`);
        }

        buttons.push(`<button class="action-btn menu-return" id="btn-menu">☰ Menu</button>`);

        return `<div class="action-panel">${buttons.join('')}</div>`;
    }

    _renderCardVisual(card) {
        const imgPath = `./output-web/${card.cardId}.webp`;
        return `
            <img class="card-image" src="${imgPath}" alt="${card.name}"
                 onerror="this.parentElement.classList.add('no-art')" loading="lazy"
                 style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-card)" />
        `;
    }

    _renderStatTokens(card) {
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

    _renderRegionCard(region, cssClass, desc) {
        return `
            <div class="region-card ${cssClass}" data-region="${region}">
                <h3>${region}</h3>
                <p>${desc}</p>
            </div>
        `;
    }

    _getRegionClass(region) {
        const map = { Northern: 'north', Eastern: 'east', Southern: 'south', Western: 'west' };
        return map[region] || '';
    }

    // ─── Event Listeners (Online) ────────────────────────────

    _attachOnlineListeners(me, opp, state, isMyTurn) {
        // Hand card clicks
        const handCards = Array.from(document.querySelectorAll('.hand-card:not(.face-down-hand)'));
        const handContainer = document.querySelector('.hand-container');

        if (handContainer && handCards.length > 0) {
            const cardRects = handCards.map(el => el.getBoundingClientRect());
            const getCardAtPoint = (x, y) => {
                for (let i = handCards.length - 1; i >= 0; i--) {
                    const r = cardRects[i];
                    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
                }
                return -1;
            };

            let currentHoverIdx = -1;
            handContainer.onmousemove = (e) => {
                const idx = getCardAtPoint(e.clientX, e.clientY);
                if (idx !== currentHoverIdx) {
                    handCards.forEach(c => c.classList.remove('hovered'));
                    currentHoverIdx = idx;
                    if (idx >= 0) handCards[idx].classList.add('hovered');
                }
            };
            handContainer.onmouseleave = () => {
                handCards.forEach(c => c.classList.remove('hovered'));
                currentHoverIdx = -1;
            };

            handContainer.onclick = (e) => {
                if (!isMyTurn) return;
                if (this.pendingPlacement) {
                    this._showToast('Cancel placement first.');
                    return;
                }
                const idx = getCardAtPoint(e.clientX, e.clientY);
                if (idx >= 0) {
                    this._onHandCardClick(handCards[idx], me, state);
                }
            };
        }

        // Field card clicks
        document.querySelectorAll('.game-card[data-instance]:not(.hand-card)').forEach(el => {
            const instanceId = el.dataset.instance;
            const playerId = parseInt(el.dataset.player);
            const cardId = el.dataset.cardId;

            el.onclick = (e) => {
                e.stopPropagation();

                if (this.pendingPlacement) {
                    if (this.pendingPlacement.type === 'Landmark' && el.parentElement.classList.contains('landmark-slot')) {
                        el.parentElement.click();
                    } else {
                        this._showToast('Select an empty slot.');
                    }
                    return;
                }

                if (this.attackingUnit) {
                    if (playerId !== this.myPlayerId) {
                        // Attack target
                        this.net.declareAttack(this.attackingUnit, { type: 'unit', instanceId });
                        this.attackingUnit = null;
                        // State update will re-render
                    }
                } else if (playerId === this.myPlayerId && isMyTurn) {
                    this._onFieldCardClick(el, instanceId, me, state);
                } else if (cardId) {
                    this._showCardZoom(cardId);
                }
            };
        });

        // Slot clicks for placement
        document.querySelectorAll('.card-slot, .landmark-slot').forEach(el => {
            el.onclick = (e) => {
                if (!this.pendingPlacement) return;
                const playerId = parseInt(el.dataset.player);
                if (playerId !== this.myPlayerId && this.pendingPlacement.type !== 'Landmark') return;

                const slotIdx = el.dataset.slot !== undefined ? parseInt(el.dataset.slot) : -1;
                const isLandmarkSlot = el.classList.contains('landmark-slot');
                const isUnitZone = el.dataset.zone === 'unit';
                const isSpellTrapZone = el.dataset.zone === 'spellTrap';
                const hasCard = el.classList.contains('has-card');

                if (hasCard && this.pendingPlacement.type !== 'Landmark') {
                    this._showToast('Slot is occupied!');
                    return;
                }

                const p = this.pendingPlacement;
                this.pendingPlacement = null;

                if (p.type === 'Unit' && isUnitZone) {
                    this.net.playUnit(p.cardInstanceId, p.position, slotIdx);
                } else if (p.type === 'SpellSet' && isSpellTrapZone) {
                    this.net.setSpell(p.cardInstanceId, slotIdx);
                } else if (p.type === 'TrapSet' && isSpellTrapZone) {
                    this.net.setTrap(p.cardInstanceId, slotIdx);
                } else if (p.type === 'Landmark' && isLandmarkSlot) {
                    this.net.playLandmark(p.cardInstanceId, playerId);
                } else {
                    this.pendingPlacement = p;
                    this._showToast('Invalid slot for this card.');
                }
            };
        });

        // LP click for direct attack
        document.querySelectorAll('.player-bar').forEach(el => {
            const pid = parseInt(el.dataset.player);
            if (pid !== this.myPlayerId && this.attackingUnit) {
                el.style.cursor = 'pointer';
                el.onclick = () => {
                    this.net.declareAttack(this.attackingUnit, { type: 'direct', player: { id: pid } });
                    this.attackingUnit = null;
                };
            }
        });

        // Action buttons
        const btnBattle = document.getElementById('btn-battle');
        const btnEndTurn = document.getElementById('btn-endturn');
        const btnEndBattle = document.getElementById('btn-endbattle');
        const btnCancelAction = document.getElementById('btn-cancel-action');
        const btnMenu = document.getElementById('btn-menu');

        if (btnBattle) btnBattle.onclick = () => this.net.enterBattle();
        if (btnEndTurn) btnEndTurn.onclick = () => this.net.endTurn();
        if (btnEndBattle) btnEndBattle.onclick = () => this.net.exitBattle();
        if (btnCancelAction) btnCancelAction.onclick = () => {
            this.attackingUnit = null;
            this.pendingPlacement = null;
            this._renderOnlineGame();
        };
        if (btnMenu) btnMenu.onclick = () => {
            this._showChoiceDialog(
                [{ label: '✅ Leave Game', value: 'yes' }, { label: '✕ Cancel', value: 'no' }],
                'Are you sure? This will disconnect you from the match.',
                (choice) => {
                    if (choice.value === 'yes') {
                        this.net.disconnect();
                        this.gameUI.showMenu();
                    }
                }
            );
        };
    }

    // ─── Hand Card Click ─────────────────────────────────────

    _onHandCardClick(el, player, state) {
        const instanceId = el.dataset.instance;
        const cardType = el.dataset.type;
        const cardId = el.dataset.cardId;
        const card = player.hand.find(c => c.instanceId === instanceId);
        if (!card) return;

        const phase = state.phase;
        const isMainPhase = phase === 'MAIN1' || phase === 'MAIN2';

        if (!isMainPhase) {
            this._showCardZoom(cardId);
            return;
        }

        // Get the card element's position for the floating menu
        const rect = el.getBoundingClientRect();

        if (cardType === 'Unit') {
            const options = [
                { label: '⚔ Summon in ATK', value: 'summon-atk', icon: '⚔' },
                { label: '🛡 Set in DEF', value: 'summon-def', icon: '🛡' },
            ];
            this._showCardActionMenu(rect, options, (choice) => {
                const position = choice.value === 'summon-def' ? 'DEF' : 'ATK';
                this.pendingPlacement = { type: 'Unit', cardInstanceId: instanceId, position, playerId: this.myPlayerId };
                this._renderOnlineGame();
            });
        } else if (cardType === 'Spell') {
            const options = [
                { label: '✦ Activate', value: 'play-spell', icon: '✦' },
                { label: '⬇ Set', value: 'set-spell', icon: '⬇' },
            ];
            this._showCardActionMenu(rect, options, (choice) => {
                if (choice.value === 'play-spell') {
                    this.net.playSpell(instanceId);
                } else {
                    this.pendingPlacement = { type: 'SpellSet', cardInstanceId: instanceId, playerId: this.myPlayerId };
                    this._renderOnlineGame();
                }
            });
        } else if (cardType === 'Trap') {
            this._showCardActionMenu(rect, [
                { label: '⬇ Set', value: 'set-trap', icon: '⬇' },
            ], () => {
                this.pendingPlacement = { type: 'TrapSet', cardInstanceId: instanceId, playerId: this.myPlayerId };
                this._renderOnlineGame();
            });
        } else if (cardType === 'Landmark') {
            this._showCardActionMenu(rect, [
                { label: '🏔 Play Landmark', value: 'play-landmark', icon: '🏔' },
            ], () => {
                this.pendingPlacement = { type: 'Landmark', cardInstanceId: instanceId, playerId: this.myPlayerId };
                this._renderOnlineGame();
            });
        }
    }

    /**
     * Show a floating action menu near a card (YGO-style) — matches GameUI
     */
    _showCardActionMenu(rect, options, callback) {
        // Remove any existing menu
        document.querySelectorAll('.card-action-menu-overlay').forEach(e => e.remove());

        const overlay = document.createElement('div');
        overlay.className = 'card-action-menu-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:65;';

        const menu = document.createElement('div');
        menu.className = 'card-action-menu';
        // Position the menu above the card
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

        // Click on option
        menu.querySelectorAll('.card-action-option').forEach(el => {
            el.onclick = (e) => {
                e.stopPropagation();
                const idx = parseInt(el.dataset.idx);
                overlay.remove();
                callback(options[idx]);
            };
        });

        // Click outside to cancel
        overlay.onclick = (e) => {
            if (e.target === overlay) overlay.remove();
        };
    }

    // ─── Field Card Click ────────────────────────────────────

    _onFieldCardClick(el, instanceId, player, state) {
        const phase = state.phase;
        const card = player.unitZone.find(c => c && c.instanceId === instanceId);

        if (!card) {
            // Check spell/trap zone
            const stCard = player.spellTrapZone.find(c => c && c.instanceId === instanceId);
            if (stCard && !stCard.faceUp && stCard.type === 'Spell') {
                this._showChoiceDialog(
                    [{ label: '✨ Activate Spell', value: 'activate' }, { label: '✕ Cancel', value: 'cancel' }],
                    stCard.name || 'Face-Down Spell',
                    (choice) => {
                        if (choice.value === 'activate') {
                            this.net.activateSetSpell(instanceId);
                        }
                    }
                );
            }
            return;
        }

        // Unit on field — offer actions
        const choices = [];

        if (phase === 'BATTLE' && card.position === 'ATK' && !card.hasAttackedThisTurn && !card.summonedThisTurn) {
            choices.push({ label: '⚔ Attack', value: 'attack' });
        }

        if ((phase === 'MAIN1' || phase === 'MAIN2') && !card.summonedThisTurn && !card.hasChangedPositionThisTurn && !card.hasAttackedThisTurn) {
            choices.push({ label: `🔄 Switch to ${card.position === 'ATK' ? 'DEF' : 'ATK'}`, value: 'switch' });
        }

        // Check for activated ability
        if ((phase === 'MAIN1' || phase === 'MAIN2') && !card.activatedThisRound && !card.activatedThisTurn) {
            choices.push({ label: '⚡ Activate Ability', value: 'ability' });
        }

        choices.push({ label: '🔍 View Card', value: 'zoom' });
        choices.push({ label: '✕ Cancel', value: 'cancel' });

        this._showChoiceDialog(choices, card.name, (choice) => {
            switch (choice.value) {
                case 'attack':
                    this.attackingUnit = instanceId;
                    this._renderOnlineGame();
                    this._showToast('Select a target to attack.');
                    break;
                case 'switch':
                    this.net.changePosition(instanceId);
                    break;
                case 'ability':
                    this.net.activateAbility(instanceId);
                    break;
                case 'zoom':
                    this._showCardZoom(el.dataset.cardId);
                    break;
            }
        });
    }

    // ─── Dialogs ─────────────────────────────────────────────

    _showTargetSelection(targets, description) {
        const overlay = document.createElement('div');
        overlay.className = 'choice-overlay';
        overlay.innerHTML = `
            <div class="choice-dialog">
                <h3>Select Target</h3>
                <p>${description}</p>
                <div class="choice-list">
                    ${targets.map(t => `
                        <button class="choice-btn" data-id="${t.instanceId}">
                            <img src="./output-web/${t.cardId}.webp" style="width:40px;height:56px;border-radius:4px;margin-right:8px" onerror="this.style.display='none'" />
                            ${t.name}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelectorAll('.choice-btn').forEach(btn => {
            btn.onclick = () => {
                const targetId = btn.dataset.id;
                this.net.selectTarget(targetId);
                overlay.remove();
            };
        });
    }

    _showChoiceDialog(options, description, localCallback = null) {
        const overlay = document.createElement('div');
        overlay.className = 'choice-overlay';
        overlay.innerHTML = `
            <div class="choice-dialog">
                <h3>${description}</h3>
                <div class="choice-list">
                    ${options.map((opt, i) => `
                        <button class="choice-btn" data-index="${i}">${opt.label || opt}</button>
                    `).join('')}
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelectorAll('.choice-btn').forEach(btn => {
            btn.onclick = () => {
                const idx = parseInt(btn.dataset.index);
                if (localCallback) {
                    localCallback(options[idx]);
                } else {
                    this.net.makeChoice(options[idx]);
                }
                overlay.remove();
            };
        });
    }

    _showResponseDialog(faceDownCards) {
        const overlay = document.createElement('div');
        overlay.className = 'choice-overlay';
        overlay.innerHTML = `
            <div class="choice-dialog">
                <h3>Opponent Action!</h3>
                <p>Would you like to activate a face-down card?</p>
                <div class="choice-list">
                    ${faceDownCards.map(c => `
                        <button class="choice-btn response-activate" data-id="${c.instanceId}">
                            <img src="./output-web/${c.cardId}.webp" style="width:40px;height:56px;border-radius:4px;margin-right:8px" onerror="this.style.display='none'" />
                            Activate ${c.name}
                        </button>
                    `).join('')}
                    <button class="choice-btn response-pass">No, Pass</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelectorAll('.response-activate').forEach(btn => {
            btn.onclick = () => {
                this.net.respondToPrompt({ activate: true, cardInstanceId: btn.dataset.id });
                overlay.remove();
            };
        });

        overlay.querySelector('.response-pass').onclick = () => {
            this.net.respondToPrompt({ activate: false });
            overlay.remove();
        };
    }

    _showCardZoom(cardId) {
        if (!cardId) return;
        const overlay = document.createElement('div');
        overlay.className = 'card-zoom-overlay';
        overlay.innerHTML = `
            <div class="card-zoom-container">
                <img src="./output-web/${cardId}.webp" alt="Card" class="card-zoom-img" />
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.onclick = () => overlay.remove();
        const escHandler = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); } };
        document.addEventListener('keydown', escHandler);
    }

    // ─── Game Over ──────────────────────────────────────────

    _showGameOver(msg) {
        const isWinner = msg.winner === this.myPlayerId;
        this.app.innerHTML = `
            <div class="main-menu online-lobby">
                <h1 class="menu-title ${isWinner ? 'victory' : 'defeat'}">${isWinner ? '🏆 Victory!' : '💀 Defeat'}</h1>
                <p class="menu-subtitle">${msg.winnerName || 'Unknown'} wins!</p>
                <div class="menu-buttons">
                    <button class="menu-btn primary" id="btn-rematch">Return to Lobby</button>
                    <button class="menu-btn" id="btn-back-menu">Main Menu</button>
                </div>
            </div>
        `;

        document.getElementById('btn-rematch').onclick = async () => {
            this.net.disconnect();
            const connected = await this.connectToServer();
            if (connected) this.showLobby();
            else this._showToast('Failed to reconnect.');
        };
        document.getElementById('btn-back-menu').onclick = () => {
            this.net.disconnect();
            this.gameUI.showMenu();
        };
    }

    _showDisconnected(message) {
        this.app.innerHTML = `
            <div class="main-menu online-lobby">
                <h1 class="menu-title" style="color:var(--danger)">Disconnected</h1>
                <p class="menu-subtitle">${message}</p>
                <div class="menu-buttons">
                    <button class="menu-btn primary" id="btn-back-menu">Main Menu</button>
                </div>
            </div>
        `;
        document.getElementById('btn-back-menu').onclick = () => {
            this.net.disconnect();
            this.gameUI.showMenu();
        };
    }

    // ─── Utility ─────────────────────────────────────────────

    _showToast(message) {
        // Reuse GameUI's toast method if available, otherwise create our own
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
        }, 2500);
    }
}
