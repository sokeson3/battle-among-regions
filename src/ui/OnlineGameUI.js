// ─────────────────────────────────────────────────────────────
// OnlineGameUI.js — Online Lobby, Matchmaking & Game Flow
// ─────────────────────────────────────────────────────────────

import { NetworkManager } from '../online/NetworkManager.js';
import { PHASES } from '../engine/GameState.js';
import * as SharedUI from './SharedUI.js';

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
        // Disconnect any previous connection to avoid stale event interference
        if (this.net.connected || this.net.ws) {
            this.net.disconnect();
        }
        // Clear old event listeners to prevent duplicate handler stacking
        this.net.removeAllListeners();

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
        this.net.on('SEARCHING', () => {
            // Server acknowledged search — already showing searching UI
        });

        this.net.on('MATCH_FOUND', (msg) => {
            this._showMatchFound(msg.yourRegion, msg.opponentName, msg.opponentRegion);
        });

        this.net.on('MATCH_CANCELLED', () => {
            this.showLobby();
        });

        this.net.on('ROOM_CREATED', (msg) => {
            this.roomCode = msg.roomCode;
            this._showWaitingForOpponent();
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
                <p class="menu-subtitle">Play against other players online</p>
                <div class="menu-buttons">
                    <button class="menu-btn primary online-glow" id="btn-quick-match">⚡ Quick Match</button>
                    <button class="menu-btn" id="btn-private-match">🔒 Private Match</button>
                    <button class="menu-btn" id="btn-back">← Back to Menu</button>
                </div>
                <div class="online-status" id="connection-status">
                    <span class="status-dot connected"></span> Connected to server
                </div>
            </div>
        `;

        document.getElementById('btn-quick-match').onclick = () => this._showQuickMatch();
        document.getElementById('btn-private-match').onclick = () => this._showPrivateMatch();
        document.getElementById('btn-back').onclick = () => {
            this.net.disconnect();
            this.gameUI.showMenu();
        };
    }

    _showQuickMatch() {
        this.app.innerHTML = `
            <div class="main-menu online-lobby">
                <h1 class="menu-title">⚡ Quick Match</h1>
                <p class="menu-subtitle">Enter your name and find an opponent</p>
                <div class="online-form">
                    <input type="text" class="online-input" id="player-name" placeholder="Your Name" maxlength="20" value="Player" />
                    <button class="menu-btn primary" id="btn-search">🔍 Find Opponent</button>
                    <button class="menu-btn" id="btn-lobby-back">← Back</button>
                </div>
            </div>
        `;

        document.getElementById('btn-search').onclick = () => {
            const name = document.getElementById('player-name').value.trim() || 'Player';
            this.net.findMatch(name);
            this._showSearching();
        };

        document.getElementById('btn-lobby-back').onclick = () => this.showLobby();
    }

    _showSearching() {
        this.app.innerHTML = `
            <div class="main-menu online-lobby">
                <h1 class="menu-title">⚡ Quick Match</h1>
                <div class="waiting-animation">
                    <div class="waiting-dots">
                        <span></span><span></span><span></span>
                    </div>
                    <p>Searching for an opponent...</p>
                </div>
                <button class="menu-btn" id="btn-cancel-search">✕ Cancel</button>
            </div>
        `;

        document.getElementById('btn-cancel-search').onclick = () => {
            this.net.cancelMatch();
            this.showLobby();
        };
    }

    _showMatchFound(yourRegion, opponentName, opponentRegion) {
        const yourRegionClass = this._getRegionClass(yourRegion);
        const oppRegionClass = this._getRegionClass(opponentRegion);

        this.app.innerHTML = `
            <div class="main-menu online-lobby">
                <h1 class="menu-title" style="color:var(--accent-gold)">⚔ Match Found!</h1>
                <div class="match-found-display" style="display:flex;align-items:center;justify-content:center;gap:32px;margin:24px 0">
                    <div class="match-player" style="text-align:center">
                        <div class="player-avatar ${yourRegionClass}" style="width:60px;height:60px;font-size:1.5rem;margin:0 auto 8px;display:flex;align-items:center;justify-content:center;border-radius:50%">You</div>
                        <div style="font-size:1.1rem;font-weight:bold;color:var(--text-primary)">${yourRegion}</div>
                    </div>
                    <div style="font-size:2rem;color:var(--text-muted)">VS</div>
                    <div class="match-player" style="text-align:center">
                        <div class="player-avatar ${oppRegionClass}" style="width:60px;height:60px;font-size:1.5rem;margin:0 auto 8px;display:flex;align-items:center;justify-content:center;border-radius:50%">${opponentName[0]}</div>
                        <div style="font-size:0.9rem;color:var(--text-secondary)">${opponentName}</div>
                        <div style="font-size:1.1rem;font-weight:bold;color:var(--text-primary)">${opponentRegion}</div>
                    </div>
                </div>
                <div class="waiting-animation">
                    <div class="waiting-dots">
                        <span></span><span></span><span></span>
                    </div>
                    <p>Setting up the game...</p>
                </div>
            </div>
        `;
    }

    _showPrivateMatch() {
        this.app.innerHTML = `
            <div class="main-menu online-lobby">
                <h1 class="menu-title">🔒 Private Match</h1>
                <p class="menu-subtitle">Play with a friend using a room code</p>
                <div class="menu-buttons">
                    <button class="menu-btn primary" id="btn-create">🏠 Create Room</button>
                    <button class="menu-btn" id="btn-join">🔗 Join Room</button>
                    <button class="menu-btn" id="btn-lobby-back">← Back</button>
                </div>
            </div>
        `;

        document.getElementById('btn-create').onclick = () => this._showCreateRoom();
        document.getElementById('btn-join').onclick = () => this._showJoinRoom();
        document.getElementById('btn-lobby-back').onclick = () => this.showLobby();
    }

    _showCreateRoom() {
        this.app.innerHTML = `
            <div class="main-menu online-lobby">
                <h1 class="menu-title">🏠 Create Room</h1>
                <p class="menu-subtitle">Enter your name to create a private room</p>
                <div class="online-form">
                    <input type="text" class="online-input" id="player-name" placeholder="Your Name" maxlength="20" value="Player 1" />
                    <button class="menu-btn primary" id="btn-create-go">Create Room</button>
                    <button class="menu-btn" id="btn-lobby-back">← Back</button>
                </div>
            </div>
        `;

        document.getElementById('btn-create-go').onclick = () => {
            const name = document.getElementById('player-name').value.trim() || 'Player 1';
            this.net.createRoom(name);
        };

        document.getElementById('btn-lobby-back').onclick = () => this._showPrivateMatch();
    }

    _showJoinRoom() {
        this.app.innerHTML = `
            <div class="main-menu online-lobby">
                <h1 class="menu-title">🔗 Join Room</h1>
                <p class="menu-subtitle">Enter the room code to join a private match</p>
                <div class="online-form">
                    <input type="text" class="online-input room-code-input" id="room-code" placeholder="ROOM CODE" maxlength="4" style="text-transform:uppercase;text-align:center;font-size:2rem;letter-spacing:0.3em" />
                    <input type="text" class="online-input" id="player-name" placeholder="Your Name" maxlength="20" value="Player 2" />
                    <button class="menu-btn primary" id="btn-join-go">Join Room</button>
                    <button class="menu-btn" id="btn-lobby-back">← Back</button>
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

            this.net.joinRoom(code, name);
        };

        document.getElementById('btn-lobby-back').onclick = () => this._showPrivateMatch();
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
                <div class="hand-count" title="Cards in hand" style="display:flex;align-items:center;gap:4px;font-size:0.75rem;color:var(--text-secondary);padding:2px 8px;background:rgba(255,255,255,0.05);border-radius:8px">
                    <span>🃏</span><span>${player.hand.length}</span>
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
                <div class="hand-label" style="text-align:center;font-size:0.7rem;color:var(--text-muted);margin-bottom:2px">Hand (${hand.length})</div>
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
        SharedUI.showCardActionMenu(rect, options, callback);
    };

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
        SharedUI.showTargetSelectionDialog(document.body, targets, description, (target) => {
            if (target) this.net.selectTarget(target.instanceId);
        });
    }

    _showChoiceDialog(options, description, localCallback = null) {
        SharedUI.showChoiceDialog(document.body, options, description, (choice) => {
            if (localCallback) localCallback(choice);
            else this.net.makeChoice(choice);
        });
    }

    _showResponseDialog(faceDownCards) {
        const cards = faceDownCards.map(c => ({ instanceId: c.instanceId, cardId: c.cardId, name: c.name }));
        SharedUI.showResponseDialog(document.body, cards, (result) => {
            this.net.respondToPrompt(result);
        });
    };

    _showCardZoom(cardId) {
        SharedUI.showCardZoom(cardId);
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
        SharedUI.showToast(message);
    }
}
