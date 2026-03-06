// ─────────────────────────────────────────────────────────────
// AuthService.js — Client-side authentication & account API
// ─────────────────────────────────────────────────────────────

const TOKEN_KEY = 'bar_auth_token';
const USER_KEY = 'bar_auth_user';

export class AuthService {
    constructor() {
        this.token = localStorage.getItem(TOKEN_KEY) || null;
        this.user = this._loadUser();
        this.baseUrl = this._resolveBaseUrl();
    }

    // ─── URL Resolution ──────────────────────────────────────

    _resolveBaseUrl() {
        // In production, the API is on the same server as the WS
        // Derive from the WebSocket URL or use current origin
        const wsUrl = import.meta.env?.VITE_SERVER_URL;
        if (wsUrl) {
            // Convert wss://host to https://host, ws://host to http://host
            return wsUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
        }
        // When served from the Express server (port 4000), use current origin
        const host = window.location.hostname;
        const port = window.location.port;
        if (host === 'localhost' || host === '127.0.0.1') {
            // Vite dev typically runs on 5173; if we're on a different port, use it
            // Otherwise fall back to the Express server port
            return `http://${host}:4000`;
        }
        // Production: same origin
        return window.location.origin;
    }

    // ─── Persistence ─────────────────────────────────────────

    _saveToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem(TOKEN_KEY, token);
        } else {
            localStorage.removeItem(TOKEN_KEY);
        }
    }

    _saveUser(user) {
        this.user = user;
        if (user) {
            localStorage.setItem(USER_KEY, JSON.stringify(user));
        } else {
            localStorage.removeItem(USER_KEY);
        }
    }

    _loadUser() {
        try {
            const raw = localStorage.getItem(USER_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }

    // ─── HTTP Helpers ────────────────────────────────────────

    async _fetch(path, options = {}) {
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        let res;
        try {
            res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
        } catch (err) {
            throw new Error('Cannot reach the server. Make sure it is running.');
        }
        // Guard against non-JSON responses (e.g. HTML from wrong server)
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            throw new Error('Server returned an unexpected response. Is the game server running on port 4000?');
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed.');
        return data;
    }

    // ─── Auth Methods ────────────────────────────────────────

    get isLoggedIn() {
        return !!this.token && !!this.user;
    }

    get displayName() {
        return this.user?.display_name || this.user?.username || 'Guest';
    }

    /**
     * Register a new account.
     * @returns {{ id, username, display_name, token }}
     */
    async register(username, password, displayName) {
        const data = await this._fetch('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, password, displayName, deviceLabel: this._getDeviceLabel() }),
        });
        this._saveToken(data.token);
        this._saveUser({ id: data.id, username: data.username, display_name: data.display_name, chosen_region: data.chosen_region || null });
        return data;
    }

    /**
     * Log in with username + password.
     * @returns {{ id, username, display_name, token }}
     */
    async login(username, password) {
        const data = await this._fetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password, deviceLabel: this._getDeviceLabel() }),
        });
        this._saveToken(data.token);
        this._saveUser({ id: data.id, username: data.username, display_name: data.display_name, chosen_region: data.chosen_region || null });
        return data;
    }

    /**
     * Verify the stored token is still valid and refresh user data.
     */
    async verifyToken() {
        if (!this.token) return false;
        try {
            const profile = await this._fetch('/api/auth/me');
            this._saveUser({ id: profile.id, username: profile.username, display_name: profile.display_name, chosen_region: profile.chosen_region || null });
            return true;
        } catch {
            this._saveToken(null);
            this._saveUser(null);
            return false;
        }
    }

    /**
     * Log out and clear stored credentials.
     */
    async logout() {
        try {
            await this._fetch('/api/auth/logout', { method: 'POST' });
        } catch { /* ignore */ }
        this._saveToken(null);
        this._saveUser(null);
    }

    // ─── Device Linking ──────────────────────────────────────

    /**
     * Generate a 6-char link code for this account.
     * @returns {{ code: string }}
     */
    async generateLinkCode() {
        return this._fetch('/api/auth/link-code', { method: 'POST' });
    }

    /**
     * Redeem a link code to authenticate on this device.
     * @returns {{ id, username, display_name, token }}
     */
    async redeemLinkCode(code) {
        const data = await this._fetch('/api/auth/link', {
            method: 'POST',
            body: JSON.stringify({ code, deviceLabel: this._getDeviceLabel() }),
        });
        this._saveToken(data.token);
        this._saveUser({ id: data.id, username: data.username, display_name: data.display_name, chosen_region: data.chosen_region || null });
        return data;
    }

    // ─── Profile & Leaderboard ───────────────────────────────

    async getProfile() {
        return this._fetch('/api/profile');
    }

    async getLeaderboard(limit = 50) {
        return this._fetch(`/api/leaderboard?limit=${limit}`);
    }

    // ─── Cloud Deck Sync ─────────────────────────────────────

    async getCloudDecks() {
        if (!this.isLoggedIn) return [];
        try {
            return await this._fetch('/api/decks');
        } catch { return []; }
    }

    async saveCloudDeck(name, region, cardIds, deckId = null) {
        if (!this.isLoggedIn) return null;
        return this._fetch('/api/decks', {
            method: 'POST',
            body: JSON.stringify({ name, region, cardIds, deckId }),
        });
    }

    async deleteCloudDeck(deckId) {
        if (!this.isLoggedIn) return false;
        const result = await this._fetch(`/api/decks/${deckId}`, { method: 'DELETE' });
        return result.success;
    }

    // ─── Card Collection ───────────────────────────────────────

    /**
     * Get the player's card collection.
     * @returns {Promise<{card_id: string, count: number}[]>}
     */
    async getCollection() {
        if (!this.isLoggedIn) return [];
        try {
            return await this._fetch('/api/collection');
        } catch { return []; }
    }

    /**
     * Choose starting region and receive starter cards.
     * @param {string} region - 'Northern' | 'Eastern' | 'Southern' | 'Western'
     * @returns {Promise<{region, collection, granted}>}
     */
    async chooseRegion(region) {
        const data = await this._fetch('/api/collection/choose-region', {
            method: 'POST',
            body: JSON.stringify({ region }),
        });
        // Update local user with chosen region
        if (this.user) {
            this.user.chosen_region = region;
            this._saveUser(this.user);
        }
        return data;
    }

    /** Whether the user has already chosen a starting region. */
    get hasChosenRegion() {
        return !!this.user?.chosen_region;
    }

    /** The user's chosen starting region, or null. */
    get chosenRegion() {
        return this.user?.chosen_region || null;
    }

    // ─── Store / Cosmetics ──────────────────────────────────

    /**
     * Fetch the full store catalog (available cosmetics + prices).
     * @returns {Promise<{type, id, name, price, currency}[]>}
     */
    async getStoreCatalog() {
        try {
            return await this._fetch('/api/store/catalog');
        } catch { return []; }
    }

    /**
     * Fetch owned cosmetics for the logged-in user.
     * @returns {Promise<{cosmetic_type, cosmetic_id}[]>}
     */
    async getOwnedCosmetics() {
        if (!this.isLoggedIn) return [];
        try {
            return await this._fetch('/api/store/owned');
        } catch { return []; }
    }

    /**
     * Start a Stripe checkout session and redirect to the payment page.
     * @param {string} cosmeticType - 'playmat' | 'sleeve' | 'avatarFrame' | 'emoteSet'
     * @param {string} cosmeticId - e.g. 'N001', 'inferno'
     * @returns {Promise<{url: string}>}
     */
    async purchaseCosmetic(cosmeticType, cosmeticId) {
        const data = await this._fetch('/api/store/checkout', {
            method: 'POST',
            body: JSON.stringify({ cosmeticType, cosmeticId }),
        });
        // Open Stripe-hosted checkout in a new tab
        if (data.url) {
            window.open(data.url, '_blank');
        }
        return data;
    }

    // ─── WebSocket Auth ──────────────────────────────────────

    /**
     * Send AUTH message over the given NetworkManager WebSocket.
     */
    authenticateWebSocket(networkManager) {
        if (this.token && networkManager?.ws?.readyState === WebSocket.OPEN) {
            networkManager.send('AUTH', { token: this.token });
        }
    }

    // ─── Helpers ─────────────────────────────────────────────

    _getDeviceLabel() {
        const ua = navigator.userAgent || '';
        if (/Android/i.test(ua)) return 'Android';
        if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
        if (/Electron/i.test(ua)) return 'Desktop (Electron)';
        return 'Web Browser';
    }
}
