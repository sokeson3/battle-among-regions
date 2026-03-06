// ─────────────────────────────────────────────────────────────
// CosmeticsManager.js — Cosmetic definitions, equip state & persistence
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'bar_cosmetics';

// ─── Landmark Playmat Definitions ────────────────────────────
// Each playmat uses artwork from an existing Landmark card.
// Players can purchase a playmat; when they play the corresponding
// Landmark in-game, their field side shows that art as the background.

export const PLAYMATS = [
    {
        id: 'N001',
        cardId: 'N001',
        name: 'The Frostfell Citadel',
        description: 'An icy fortress wreathed in glowing Nordic runes.',
        imagePath: './cosmetics/N001.png',
        region: 'Northern',
        price: '£2.99',
    },
    {
        id: 'N002',
        cardId: 'N002',
        name: 'Ancestral Ice Cairn',
        description: 'Ancient glacial monument channelling ancestral power.',
        imagePath: './cosmetics/N002.png',
        region: 'Northern',
        price: '£2.99',
    },
    {
        id: 'E001',
        cardId: 'E001',
        name: 'Hidden Monastery',
        description: 'A moonlit sanctuary shrouded in mist and shadow.',
        imagePath: './cosmetics/E001.png',
        region: 'Eastern',
        price: '£2.99',
    },
    {
        id: 'E002',
        cardId: 'E002',
        name: 'Scroll Library',
        description: 'Vast shelves of ancient scrolls humming with arcane energy.',
        imagePath: './cosmetics/E002.png',
        region: 'Eastern',
        price: '£2.99',
    },
    {
        id: 'S001',
        cardId: 'S001',
        name: 'Arena of Trials',
        description: 'A scorching arena where only the strongest survive.',
        imagePath: './cosmetics/S001.png',
        region: 'Southern',
        price: '£2.99',
    },
    {
        id: 'S002',
        cardId: 'S002',
        name: 'Volcanic Forge',
        description: 'Molten lava flows through an ancient dwarven forge.',
        imagePath: './cosmetics/S002.png',
        region: 'Southern',
        price: '£2.99',
    },
    {
        id: 'S038',
        cardId: 'S038',
        name: 'Scorched Earth',
        description: 'Charred wasteland crackling with residual flame.',
        imagePath: './cosmetics/S038.png',
        region: 'Southern',
        price: '£2.99',
    },
    {
        id: 'W001',
        cardId: 'W001',
        name: 'Echoing Canyon',
        description: 'Deep sandstone canyons where spirit echoes resound.',
        imagePath: './cosmetics/W001.png',
        region: 'Western',
        price: '£2.99',
    },
    {
        id: 'W002',
        cardId: 'W002',
        name: 'Mystic Menagerie',
        description: 'A mystical sanctuary filled with spirit animals.',
        imagePath: './cosmetics/W002.png',
        region: 'Western',
        price: '£2.99',
    },
];

// ─── Card Sleeve Definitions ─────────────────────────────────

export const CARD_SLEEVES = [
    {
        id: 'default',
        name: 'Default Sleeve',
        description: 'The standard Battle Among Regions card back.',
        cssClass: '',
        useImage: true,
        imagePath: './Background.png',
    },
    {
        id: 'inferno',
        name: 'Inferno Crest',
        description: 'A blazing phoenix emblem radiating molten lava.',
        cssClass: 'sleeve-inferno',
        useImage: true,
        imagePath: './cosmetics/sleeves/sleeve_inferno.png',
        region: 'Southern',
        price: '£1.99',
    },
    {
        id: 'glacial',
        name: 'Glacial Sigil',
        description: 'Cyan rune carvings glow beneath frozen crystal.',
        cssClass: 'sleeve-glacial',
        useImage: true,
        imagePath: './cosmetics/sleeves/sleeve_glacial.png',
        region: 'Northern',
        price: '£1.99',
    },
    {
        id: 'shadow_scroll',
        name: 'Shadow Scroll',
        description: 'Dark jade with spectral dragon ink patterns.',
        cssClass: 'sleeve-shadow-scroll',
        useImage: true,
        imagePath: './cosmetics/sleeves/sleeve_shadow_scroll.png',
        region: 'Eastern',
        price: '£1.99',
    },
    {
        id: 'spirit_totem',
        name: 'Spirit Totem',
        description: 'Carved wooden patterns with amber spirit glows.',
        cssClass: 'sleeve-spirit-totem',
        useImage: true,
        imagePath: './cosmetics/sleeves/sleeve_spirit_totem.png',
        region: 'Western',
        price: '£1.99',
    },
];

// ─── Avatar Frame Definitions ────────────────────────────────

export const AVATAR_FRAMES = [
    {
        id: 'default',
        name: 'Default Frame',
        description: 'No special frame.',
        cssClass: '',
    },
    {
        id: 'shadow_dragon',
        name: 'Shadow Dragon',
        description: 'A spectral dragon coils around your portrait in dark jade.',
        cssClass: 'avatar-shadow-dragon',
        region: 'Eastern',
        price: '£1.49',
    },
    {
        id: 'frost_guardian',
        name: 'Frost Guardian',
        description: 'Ice crystals and aurora light frame your name.',
        cssClass: 'avatar-frost-guardian',
        region: 'Northern',
        price: '£1.49',
    },
    {
        id: 'flame_crown',
        name: 'Flame Crown',
        description: 'Molten golden filigree with ember particles.',
        cssClass: 'avatar-flame-crown',
        region: 'Southern',
        price: '£1.49',
    },
    {
        id: 'totem_spirit',
        name: 'Totem Spirit',
        description: 'Earthy carved totem borders with amber glow.',
        cssClass: 'avatar-totem-spirit',
        region: 'Western',
        price: '£1.49',
    },
];

// ─── Emote Set Definitions ───────────────────────────────────

export const EMOTE_SETS = [
    {
        id: 'default',
        name: 'Classic Emotes',
        description: 'Basic emote set.',
        emotes: [
            { id: 'gg', label: 'GG', icon: '🤝' },
            { id: 'nice', label: 'Nice!', icon: '👍' },
            { id: 'think', label: 'Hmm...', icon: '🤔' },
            { id: 'wow', label: 'Wow!', icon: '😮' },
        ],
    },
    {
        id: 'spirit_totems',
        name: 'Spirit Totems',
        description: 'Carved totem emotes with Western flair.',
        price: '£0.99',
        emotes: [
            { id: 'laugh', label: 'Ha ha!', icon: '🐺' },
            { id: 'shock', label: 'What?!', icon: '🦅' },
            { id: 'think', label: 'Hmm...', icon: '🐻' },
            { id: 'cheer', label: 'Awooo!', icon: '🌟' },
        ],
    },
    {
        id: 'battle_cries',
        name: 'Battle Cries',
        description: 'Southern warrior emotes.',
        price: '£0.99',
        emotes: [
            { id: 'charge', label: 'Charge!', icon: '⚔️' },
            { id: 'burn', label: 'Burn!', icon: '🔥' },
            { id: 'taunt', label: 'Come at me!', icon: '💪' },
            { id: 'victory', label: 'Victory!', icon: '🏆' },
        ],
    },
];

// ─── Manager Class ───────────────────────────────────────────

export class CosmeticsManager {
    constructor() {
        this.equipped = {
            playmat: 'default',      // kept for legacy compat but unused for landmark playmats
            cardSleeves: {},         // per-region sleeve map, e.g. { Northern: 'glacial', Southern: 'inferno' }
            avatarFrame: 'default',
            emoteSet: 'default',
            holoCards: [],            // array of cardId strings, e.g. ['N024', 'S024']
            purchasedPlaymats: [],    // array of landmark card IDs, e.g. ['N001', 'S002']
            equippedPlaymats: [],     // array of equipped playmat card IDs, e.g. ['N001', 'S002']
        };
        // Server-synced owned cosmetics: { 'playmat:N001': true, 'sleeve:inferno': true, ... }
        this._serverOwned = null; // null = not synced yet
        this.load();
    }

    // ── Playmat Getters ──

    /**
     * Get all available playmat definitions.
     */
    getPlaymats() {
        return PLAYMATS;
    }

    /**
     * Check if a landmark playmat has been purchased.
     * Checks server-synced ownership first, falls back to localStorage.
     */
    ownsPlaymat(cardId) {
        if (this._serverOwned) {
            return !!this._serverOwned[`playmat:${cardId}`];
        }
        return this.equipped.purchasedPlaymats.includes(cardId);
    }

    /**
     * Check if a landmark playmat is currently equipped.
     */
    isPlaymatEquipped(cardId) {
        return (this.equipped.equippedPlaymats || []).includes(cardId);
    }

    /**
     * Get the playmat definition for a given landmark card ID.
     * Returns null if no playmat exists for that card.
     */
    getPlaymatForLandmark(cardId) {
        return PLAYMATS.find(p => p.cardId === cardId) || null;
    }

    /**
     * Get the image path for a player's field background based on their active landmark.
     * If equippedPlaymats has entries and the player's landmark matches one, use that.
     * When no landmark is in play, shows the first equipped playmat.
     * Returns empty string if no matching equipped playmat.
     * @param {object} player - Player object with landmarkZone
     */
    getFieldImageForPlayer(player) {
        const equipped = this.equipped.equippedPlaymats || [];
        if (!player || !player.landmarkZone) {
            // No landmark in play — show first equipped playmat background
            if (equipped.length > 0) {
                const firstId = equipped[0];
                const pm = this.getPlaymatForLandmark(firstId);
                if (pm && this.ownsPlaymat(firstId)) {
                    return pm.imagePath;
                }
            }
            return '';
        }
        const landmark = player.landmarkZone;
        // Show playmat if the landmark's playmat is equipped
        if (equipped.includes(landmark.cardId)) {
            const playmat = this.getPlaymatForLandmark(landmark.cardId);
            if (playmat && this.ownsPlaymat(landmark.cardId)) {
                return playmat.imagePath;
            }
        }
        return '';
    }

    /**
     * Legacy getter — returns empty string since playmats are now per-player landmark-based.
     */
    getPlaymatClass() {
        return '';
    }

    // ── Card Sleeve Getters ──

    /**
     * Get the equipped sleeve for a given region.
     * Falls back to default if no region-specific sleeve is equipped.
     * @param {string} region - e.g. 'Northern', 'Southern'
     */
    getCardSleeve(region) {
        const sleeves = this.equipped.cardSleeves || {};
        const id = (region && sleeves[region]) || 'default';
        return CARD_SLEEVES.find(s => s.id === id) || CARD_SLEEVES[0];
    }

    getSleeveClass(region) {
        return this.getCardSleeve(region).cssClass || '';
    }

    usesDefaultSleeve(region) {
        const sleeves = this.equipped.cardSleeves || {};
        return !region || !sleeves[region] || sleeves[region] === 'default';
    }

    /**
     * Get the sleeve ID equipped for a specific region (or null).
     */
    getSleeveForRegion(region) {
        const sleeves = this.equipped.cardSleeves || {};
        return sleeves[region] || null;
    }

    // ── Avatar Frame Getters ──

    getAvatarFrame() {
        return AVATAR_FRAMES.find(f => f.id === this.equipped.avatarFrame) || AVATAR_FRAMES[0];
    }

    getAvatarFrameClass() {
        return this.getAvatarFrame().cssClass || '';
    }

    // ── Holo ──

    isHolo(cardId) {
        return this.equipped.holoCards.includes(cardId);
    }

    // ── Emotes ──

    getEmoteSet() {
        return EMOTE_SETS.find(e => e.id === this.equipped.emoteSet) || EMOTE_SETS[0];
    }

    getEmotes() {
        return this.getEmoteSet().emotes;
    }

    /**
     * Export the current equipped cosmetics state as a plain serializable object.
     * Used for sending cosmetics data to the opponent over the network.
     */
    getEquippedSnapshot() {
        return {
            cardSleeves: { ...(this.equipped.cardSleeves || {}) },
            equippedPlaymats: [...(this.equipped.equippedPlaymats || [])],
            purchasedPlaymats: [...(this.equipped.purchasedPlaymats || [])],
            holoCards: [...(this.equipped.holoCards || [])],
            avatarFrame: this.equipped.avatarFrame,
        };
    }

    // ── Equip / Purchase ──

    /**
     * Purchase a landmark playmat. Adds it to the owned list.
     */
    purchasePlaymat(cardId) {
        if (!this.ownsPlaymat(cardId) && PLAYMATS.some(p => p.cardId === cardId)) {
            this.equipped.purchasedPlaymats.push(cardId);
            this.save();
        }
    }

    /**
     * Toggle a purchased playmat's equipped state.
     * Multiple playmats can be equipped simultaneously.
     */
    equipPlaymat(cardId) {
        if (!this.ownsPlaymat(cardId)) return;
        if (!this.equipped.equippedPlaymats) this.equipped.equippedPlaymats = [];
        const idx = this.equipped.equippedPlaymats.indexOf(cardId);
        if (idx >= 0) {
            this.equipped.equippedPlaymats.splice(idx, 1); // unequip
        } else {
            this.equipped.equippedPlaymats.push(cardId);   // equip
        }
        this.save();
    }

    /**
     * Equip a sleeve for its region. If already equipped for that region, unequip (reset to default).
     */
    equipCardSleeve(id) {
        const sleeve = CARD_SLEEVES.find(s => s.id === id);
        if (!sleeve) return;
        if (!this.equipped.cardSleeves) this.equipped.cardSleeves = {};
        if (sleeve.region) {
            // Toggle: if already equipped for this region, unequip
            if (this.equipped.cardSleeves[sleeve.region] === id) {
                delete this.equipped.cardSleeves[sleeve.region];
            } else {
                this.equipped.cardSleeves[sleeve.region] = id;
            }
        }
        this.save();
    }

    equipAvatarFrame(id) {
        if (AVATAR_FRAMES.some(f => f.id === id)) {
            this.equipped.avatarFrame = id;
            this.save();
        }
    }

    equipEmoteSet(id) {
        if (EMOTE_SETS.some(e => e.id === id)) {
            this.equipped.emoteSet = id;
            this.save();
        }
    }

    toggleHoloCard(cardId) {
        const idx = this.equipped.holoCards.indexOf(cardId);
        if (idx >= 0) {
            this.equipped.holoCards.splice(idx, 1);
        } else {
            this.equipped.holoCards.push(cardId);
        }
        this.save();
    }

    // ── Persistence ──

    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.equipped));
        } catch (e) {
            console.warn('Could not save cosmetics:', e);
        }
    }

    load() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                // Ensure purchasedPlaymats array exists for saves from before this feature
                if (!data.purchasedPlaymats) data.purchasedPlaymats = [];
                // Migrate legacy single equippedPlaymat → equippedPlaymats array
                if (!data.equippedPlaymats) {
                    data.equippedPlaymats = data.equippedPlaymat ? [data.equippedPlaymat] : [];
                }
                delete data.equippedPlaymat;
                // Migrate legacy single cardSleeve → per-region cardSleeves map
                if (data.cardSleeve && !data.cardSleeves) {
                    const legacySleeve = CARD_SLEEVES.find(s => s.id === data.cardSleeve);
                    if (legacySleeve && legacySleeve.region) {
                        data.cardSleeves = { [legacySleeve.region]: data.cardSleeve };
                    } else {
                        data.cardSleeves = {};
                    }
                }
                if (!data.cardSleeves) data.cardSleeves = {};
                delete data.cardSleeve;
                Object.assign(this.equipped, data);
            }
        } catch (e) {
            console.warn('Could not load cosmetics:', e);
        }
    }

    // ── Server Sync ──

    /**
     * Sync owned cosmetics from the server.
     * Call this after login / on page load when online.
     * @param {AuthService} authService
     */
    async syncFromServer(authService) {
        if (!authService || !authService.isLoggedIn) return;
        try {
            const owned = await authService.getOwnedCosmetics();
            this._serverOwned = {};
            for (const item of owned) {
                this._serverOwned[`${item.cosmetic_type}:${item.cosmetic_id}`] = true;
            }
            // Also sync purchasedPlaymats array from server data
            const serverPlaymats = owned
                .filter(o => o.cosmetic_type === 'playmat')
                .map(o => o.cosmetic_id);
            // Merge: keep any local purchases + add server ones
            for (const pmId of serverPlaymats) {
                if (!this.equipped.purchasedPlaymats.includes(pmId)) {
                    this.equipped.purchasedPlaymats.push(pmId);
                }
            }
            this.save();
        } catch (e) {
            console.warn('Could not sync cosmetics from server:', e);
        }
    }

    /**
     * Generic ownership check (works for all cosmetic types).
     * @param {string} type - 'playmat' | 'sleeve' | 'avatarFrame' | 'emoteSet'
     * @param {string} id - e.g. 'N001', 'inferno'
     * @returns {boolean}
     */
    ownsCosmetic(type, id) {
        if (this._serverOwned) {
            return !!this._serverOwned[`${type}:${id}`];
        }
        // Fallback for offline / guest: only playmats have localStorage tracking
        if (type === 'playmat') return this.equipped.purchasedPlaymats.includes(id);
        return false;
    }
}

// ─── Remote Cosmetics (opponent's cosmetics received over network) ────

/**
 * Lightweight adapter that mirrors CosmeticsManager's read API but reads from
 * a plain snapshot object (received from the opponent over the network).
 * Returns default / empty values for anything missing.
 */
export class RemoteCosmetics {
    constructor(snapshot) {
        this._data = snapshot || {};
    }

    getCardSleeve(region) {
        const sleeves = this._data.cardSleeves || {};
        const id = (region && sleeves[region]) || 'default';
        return CARD_SLEEVES.find(s => s.id === id) || CARD_SLEEVES[0];
    }

    getSleeveClass(region) {
        return this.getCardSleeve(region).cssClass || '';
    }

    usesDefaultSleeve(region) {
        const sleeves = this._data.cardSleeves || {};
        return !region || !sleeves[region] || sleeves[region] === 'default';
    }

    getFieldImageForPlayer(player) {
        const equipped = this._data.equippedPlaymats || [];
        const purchased = this._data.purchasedPlaymats || [];
        if (!player || !player.landmarkZone) {
            if (equipped.length > 0) {
                const firstId = equipped[0];
                const pm = PLAYMATS.find(p => p.cardId === firstId);
                if (pm && purchased.includes(firstId)) return pm.imagePath;
            }
            return '';
        }
        const landmark = player.landmarkZone;
        if (equipped.includes(landmark.cardId)) {
            const playmat = PLAYMATS.find(p => p.cardId === landmark.cardId);
            if (playmat && purchased.includes(landmark.cardId)) return playmat.imagePath;
        }
        return '';
    }

    isHolo(cardId) {
        return (this._data.holoCards || []).includes(cardId);
    }

    getAvatarFrame() {
        const id = this._data.avatarFrame || 'default';
        return AVATAR_FRAMES.find(f => f.id === id) || AVATAR_FRAMES[0];
    }

    getAvatarFrameClass() {
        return this.getAvatarFrame().cssClass || '';
    }
}

/**
 * A default empty cosmetics instance (no cosmetics equipped).
 * Used for AI / campaign opponents.
 */
export const DEFAULT_COSMETICS = new RemoteCosmetics({});
