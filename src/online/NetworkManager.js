// ─────────────────────────────────────────────────────────────
// NetworkManager.js — WebSocket client for online multiplayer
// ─────────────────────────────────────────────────────────────

export class NetworkManager {
    constructor() {
        this.ws = null;
        this.listeners = new Map();
        this.connected = false;
        this.serverUrl = null;
    }

    /**
     * Connect to the game server
     * @param {string} url - WebSocket URL (e.g., 'ws://localhost:4000')
     * @returns {Promise<void>}
     */
    connect(url) {
        return new Promise((resolve, reject) => {
            this.serverUrl = url;
            this.ws = new WebSocket(url);

            this.ws.onopen = () => {
                this.connected = true;
                console.log('🔌 Connected to server');
                this.emit('connected');
                resolve();
            };

            this.ws.onclose = () => {
                this.connected = false;
                console.log('🔌 Disconnected from server');
                this.emit('disconnected');
            };

            this.ws.onerror = (err) => {
                console.error('WebSocket error:', err);
                this.emit('error', { message: 'Connection error' });
                if (!this.connected) reject(new Error('Failed to connect'));
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    this.emit(msg.type, msg);
                } catch (e) {
                    console.error('Failed to parse message:', e);
                }
            };
        });
    }

    /**
     * Send a message to the server
     */
    send(type, data = {}) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('Cannot send — not connected');
            return;
        }
        this.ws.send(JSON.stringify({ type, ...data }));
    }

    /**
     * Create a new room
     */
    createRoom(playerName, region) {
        this.send('CREATE_ROOM', { playerName, region });
    }

    /**
     * Join an existing room
     */
    joinRoom(roomCode, playerName, region) {
        this.send('JOIN_ROOM', { roomCode, playerName, region });
    }

    // ─── Game Actions ────────────────────────────────────────

    selectLandmark(cardInstanceId) {
        this.send('SELECT_LANDMARK', { cardInstanceId });
    }

    skipLandmark() {
        this.send('SELECT_LANDMARK', { cardInstanceId: null });
    }

    mulligan(cardInstanceIds) {
        this.send('MULLIGAN', { cardInstanceIds });
    }

    playUnit(cardInstanceId, position = 'ATK', slotIndex = -1) {
        this.send('PLAY_UNIT', { cardInstanceId, position, slotIndex });
    }

    playSpell(cardInstanceId) {
        this.send('PLAY_SPELL', { cardInstanceId });
    }

    setSpell(cardInstanceId, slotIndex = -1) {
        this.send('SET_SPELL', { cardInstanceId, slotIndex });
    }

    setTrap(cardInstanceId, slotIndex = -1) {
        this.send('SET_TRAP', { cardInstanceId, slotIndex });
    }

    playLandmark(cardInstanceId, targetPlayerId = null) {
        this.send('PLAY_LANDMARK', { cardInstanceId, targetPlayerId });
    }

    activateSetSpell(cardInstanceId) {
        this.send('ACTIVATE_SET_SPELL', { cardInstanceId });
    }

    activateTrap(cardInstanceId) {
        this.send('ACTIVATE_TRAP', { cardInstanceId });
    }

    declareAttack(attackerInstanceId, targetInfo) {
        this.send('DECLARE_ATTACK', { attackerInstanceId, targetInfo });
    }

    activateAbility(cardInstanceId) {
        this.send('ACTIVATE_ABILITY', { cardInstanceId });
    }

    changePosition(cardInstanceId) {
        this.send('CHANGE_POSITION', { cardInstanceId });
    }

    enterBattle() {
        this.send('ENTER_BATTLE');
    }

    exitBattle() {
        this.send('EXIT_BATTLE');
    }

    endTurn() {
        this.send('END_TURN');
    }

    selectTarget(targetId) {
        this.send('TARGET_SELECTED', { targetId });
    }

    makeChoice(choice) {
        this.send('CHOICE_MADE', { choice });
    }

    respondToPrompt(response) {
        this.send('OPPONENT_RESPONSE', { response });
    }

    // ─── Event System ────────────────────────────────────────

    on(event, cb) {
        if (!this.listeners.has(event)) this.listeners.set(event, []);
        this.listeners.get(event).push(cb);
        return () => this.off(event, cb);
    }

    off(event, cb) {
        const cbs = this.listeners.get(event);
        if (cbs) {
            const idx = cbs.indexOf(cb);
            if (idx >= 0) cbs.splice(idx, 1);
        }
    }

    emit(event, data) {
        const cbs = this.listeners.get(event) || [];
        for (const cb of cbs) cb(data);
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
