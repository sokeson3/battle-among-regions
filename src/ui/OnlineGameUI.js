// ─────────────────────────────────────────────────────────────
// OnlineGameUI.js — Online Lobby & Matchmaking
// In-game rendering is handled by GameUI (unified UI)
// ─────────────────────────────────────────────────────────────

import { NetworkManager } from '../online/NetworkManager.js';
import * as SharedUI from './SharedUI.js';
import * as MatchHistory from '../online/MatchHistory.js';

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
        this.roomCode = null;
        this.warUI = null; // Set after construction
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
            // Wire war campaign events (passes net reference to warUI)
            if (this.warUI) {
                this.warUI.net = this.net;
                this.warUI.wireWarEvents();
            }
            return true;
        } catch (err) {
            console.error('Connection failed:', err);
            return false;
        }
    }

    _wireNetworkEvents() {
        // Lobby events only — in-game events (GAME_STATE, REQUEST_TARGET, etc.)
        // are handled by GameUI._wireOnlineGameEvents() once startOnlineGame() is called.

        this.net.on('SEARCHING', () => {
            // Server acknowledged search — already showing searching UI
        });

        this.net.on('MATCH_FOUND', (msg) => {
            this._updateJoiningStatus('✅ Match found! Loading game...');
            this._showMatchFound(msg.yourRegion, msg.opponentName, msg.opponentRegion);
            // Hand off in-game rendering to GameUI
            this.gameUI.startOnlineGame(this.net, this.myPlayerId);
        });

        this.net.on('MATCH_CANCELLED', () => {
            this.showLobby();
        });

        this.net.on('ROOM_CREATED', (msg) => {
            this.roomCode = msg.roomCode;
            this._showWaitingForOpponent();
        });

        this.net.on('ERROR', (msg) => {
            this._showToast(msg.message || 'An error occurred.');
            // If we were on a joining screen, go back to the join form
            const joiningEl = document.querySelector('.joining-status');
            if (joiningEl) {
                this._showJoinRoom();
            }
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
                    <button class="menu-btn campaign-glow" id="btn-war-campaign">⚔ War Campaign</button>
                    <button class="menu-btn" id="btn-match-history">📊 Match History</button>
                    <button class="menu-btn" id="btn-back">← Back to Menu</button>
                </div>
                <div class="online-status" id="connection-status">
                    <span class="status-dot connected"></span> Connected to server
                </div>
            </div>
        `;

        document.getElementById('btn-quick-match').onclick = () => this._showQuickMatch();
        document.getElementById('btn-private-match').onclick = () => this._showPrivateMatch();
        document.getElementById('btn-war-campaign').onclick = () => {
            if (this.warUI) {
                this.warUI.showOnline(this);
            }
        };
        document.getElementById('btn-match-history').onclick = () => this._showMatchHistory();
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
            this._showJoining(code);
        };

        document.getElementById('btn-lobby-back').onclick = () => this._showPrivateMatch();
    }

    _showJoining(roomCode) {
        this.app.innerHTML = `
            <div class="main-menu online-lobby">
                <h1 class="menu-title">🔗 Joining Room</h1>
                <div class="room-code-display">
                    <div class="room-code-big">${roomCode}</div>
                </div>
                <div class="waiting-animation">
                    <div class="waiting-dots">
                        <span></span><span></span><span></span>
                    </div>
                    <p>Connecting to room...</p>
                </div>
                <div class="joining-status" id="joining-status" style="margin-top:12px;font-size:0.85rem;color:var(--text-muted);text-align:center;max-height:120px;overflow-y:auto">
                    <div>⏳ Sending join request...</div>
                </div>
                <button class="menu-btn" id="btn-cancel-join" style="margin-top:16px">Cancel</button>
            </div>
        `;

        document.getElementById('btn-cancel-join').onclick = () => {
            this.net.disconnect();
            this.gameUI.showMenu();
        };
    }

    _updateJoiningStatus(message) {
        const el = document.getElementById('joining-status');
        if (el) {
            const line = document.createElement('div');
            line.textContent = message;
            el.appendChild(line);
            el.scrollTop = el.scrollHeight;
        }
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

    // ─── Utility ─────────────────────────────────────────────

    _getRegionClass(region) {
        const map = { Northern: 'north', Eastern: 'east', Southern: 'south', Western: 'west' };
        return map[region] || '';
    }

    _showToast(message) {
        SharedUI.showToast(message);
    }

    // ─── Match History ───────────────────────────────────────

    _showMatchHistory() {
        const history = MatchHistory.getHistory();

        const rows = history.length === 0
            ? '<p class="menu-subtitle" style="margin-top:24px">No matches played yet.</p>'
            : history.map(m => {
                const d = new Date(m.date);
                const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                const dur = m.duration || 0;
                const mins = Math.floor(dur / 60);
                const secs = dur % 60;
                const timeStr = `${mins}m ${secs.toString().padStart(2, '0')}s`;
                const isWin = m.winner === m.myPlayerId;
                const regions = (m.players || []).map(p => p.region).join(' vs ');
                const resultClass = isWin ? 'win' : (m.winner === null ? 'draw' : 'loss');
                const resultLabel = isWin ? 'WIN' : (m.winner === null ? 'DRAW' : 'LOSS');
                return `
                    <div class="match-history-item ${resultClass}">
                        <div class="mh-result">${resultLabel}</div>
                        <div class="mh-details">
                            <span class="mh-regions">${regions || '—'}</span>
                            <span class="mh-meta">${dateStr} · ${timeStr} · R${m.rounds || '?'} T${m.turns || '?'}</span>
                        </div>
                        <div class="mh-winner">Winner: ${m.winnerName || '—'}</div>
                    </div>
                `;
            }).join('');

        this.app.innerHTML = `
            <div class="main-menu online-lobby">
                <h1 class="menu-title">📊 Match History</h1>
                <div class="match-history-list">${rows}</div>
                <div class="menu-buttons" style="margin-top:16px">
                    <button class="menu-btn primary" id="btn-download-csv">📥 Download CSV</button>
                    ${history.length > 0 ? '<button class="menu-btn danger" id="btn-clear-history">🗑 Clear History</button>' : ''}
                    <button class="menu-btn" id="btn-history-back">← Back</button>
                </div>
            </div>
        `;

        document.getElementById('btn-download-csv').onclick = () => {
            const link = document.createElement('a');
            link.href = '/api/match-history.csv';
            link.download = 'match_history.csv';
            link.click();
        };
        document.getElementById('btn-history-back').onclick = () => this.showLobby();
        const clearBtn = document.getElementById('btn-clear-history');
        if (clearBtn) {
            clearBtn.onclick = () => {
                MatchHistory.clearHistory();
                this._showMatchHistory();
            };
        }
    }
}
