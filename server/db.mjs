// ─────────────────────────────────────────────────────────────
// db.mjs — SQLite database layer for user accounts, decks,
//          leaderboard, and device linking
// ─────────────────────────────────────────────────────────────

import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = join(__dirname, 'bar_game.db');

const db = new Database(DB_PATH);

// Enable WAL for better concurrent read performance
db.pragma('journal_mode = WAL');

// ─── Schema ──────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    display_name  TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS auth_tokens (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    token        TEXT    NOT NULL UNIQUE,
    device_label TEXT    DEFAULT '',
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_decks (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id  INTEGER NOT NULL REFERENCES users(id),
    name     TEXT    NOT NULL,
    region   TEXT    NOT NULL,
    card_ids TEXT    NOT NULL,
    saved_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS leaderboard (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL UNIQUE REFERENCES users(id),
    ranked_points INTEGER NOT NULL DEFAULT 1000,
    wins          INTEGER NOT NULL DEFAULT 0,
    losses        INTEGER NOT NULL DEFAULT 0,
    draws         INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS link_codes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    code       TEXT    NOT NULL UNIQUE,
    expires_at TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_collections (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    card_id TEXT    NOT NULL,
    count   INTEGER NOT NULL DEFAULT 1,
    UNIQUE(user_id, card_id)
  );

  CREATE TABLE IF NOT EXISTS user_cosmetics (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    cosmetic_type TEXT    NOT NULL,
    cosmetic_id   TEXT    NOT NULL,
    purchased_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, cosmetic_type, cosmetic_id)
  );

  CREATE TABLE IF NOT EXISTS purchase_log (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL REFERENCES users(id),
    stripe_session_id TEXT    NOT NULL UNIQUE,
    cosmetic_type     TEXT    NOT NULL,
    cosmetic_id       TEXT    NOT NULL,
    amount            INTEGER NOT NULL,
    currency          TEXT    NOT NULL DEFAULT 'gbp',
    status            TEXT    NOT NULL DEFAULT 'completed',
    created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// ─── Migrations ──────────────────────────────────────────────

// Add chosen_region column to users (safe to re-run)
try {
    db.exec(`ALTER TABLE users ADD COLUMN chosen_region TEXT DEFAULT NULL`);
} catch (e) {
    // Column already exists — ignore
}

// ─── Prepared Statements ─────────────────────────────────────

const stmts = {
    insertUser: db.prepare(`INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)`),
    getUserByName: db.prepare(`SELECT * FROM users WHERE username = ?`),
    getUserById: db.prepare(`SELECT id, username, display_name, created_at, chosen_region FROM users WHERE id = ?`),

    insertToken: db.prepare(`INSERT INTO auth_tokens (user_id, token, device_label) VALUES (?, ?, ?)`),
    getByToken: db.prepare(`SELECT u.id, u.username, u.display_name, u.created_at, u.chosen_region FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?`),
    deleteToken: db.prepare(`DELETE FROM auth_tokens WHERE token = ?`),

    insertDeck: db.prepare(`INSERT INTO user_decks (user_id, name, region, card_ids) VALUES (?, ?, ?, ?)`),
    updateDeck: db.prepare(`UPDATE user_decks SET name = ?, region = ?, card_ids = ?, saved_at = datetime('now') WHERE id = ? AND user_id = ?`),
    getDecksByUser: db.prepare(`SELECT * FROM user_decks WHERE user_id = ? ORDER BY saved_at DESC`),
    deleteDeck: db.prepare(`DELETE FROM user_decks WHERE id = ? AND user_id = ?`),

    upsertLeaderboard: db.prepare(`
    INSERT INTO leaderboard (user_id) VALUES (?)
    ON CONFLICT(user_id) DO NOTHING
  `),
    addWin: db.prepare(`UPDATE leaderboard SET ranked_points = MAX(0, ranked_points + ?), wins = wins + 1 WHERE user_id = ?`),
    addLoss: db.prepare(`UPDATE leaderboard SET ranked_points = MAX(0, ranked_points + ?), losses = losses + 1 WHERE user_id = ?`),
    addDraw: db.prepare(`UPDATE leaderboard SET draws = draws + 1 WHERE user_id = ?`),
    getLeaderboard: db.prepare(`
    SELECT l.*, u.display_name, u.username
    FROM leaderboard l JOIN users u ON u.id = l.user_id
    ORDER BY l.ranked_points DESC LIMIT ?
  `),
    getUserStats: db.prepare(`SELECT * FROM leaderboard WHERE user_id = ?`),

    insertLinkCode: db.prepare(`INSERT INTO link_codes (user_id, code, expires_at) VALUES (?, ?, datetime('now', '+5 minutes'))`),
    getLinkCode: db.prepare(`SELECT * FROM link_codes WHERE code = ? AND expires_at > datetime('now')`),
    deleteLinkCode: db.prepare(`DELETE FROM link_codes WHERE code = ?`),
    cleanExpiredCodes: db.prepare(`DELETE FROM link_codes WHERE expires_at <= datetime('now')`),

    // ─── Collections ─────────────────────────────────────
    getCollection: db.prepare(`SELECT card_id, count FROM user_collections WHERE user_id = ?`),
    upsertCollectionCard: db.prepare(`
      INSERT INTO user_collections (user_id, card_id, count)
      VALUES (?, ?, 1)
      ON CONFLICT(user_id, card_id) DO UPDATE SET count = MIN(count + 1, 3)
    `),
    getCollectionCard: db.prepare(`SELECT count FROM user_collections WHERE user_id = ? AND card_id = ?`),
    setChosenRegion: db.prepare(`UPDATE users SET chosen_region = ? WHERE id = ?`),
    getChosenRegion: db.prepare(`SELECT chosen_region FROM users WHERE id = ?`),

    // ─── Cosmetics ───────────────────────────────────
    insertCosmetic: db.prepare(`INSERT OR IGNORE INTO user_cosmetics (user_id, cosmetic_type, cosmetic_id) VALUES (?, ?, ?)`),
    getUserCosmetics: db.prepare(`SELECT cosmetic_type, cosmetic_id FROM user_cosmetics WHERE user_id = ?`),
    ownsCosmetic: db.prepare(`SELECT 1 FROM user_cosmetics WHERE user_id = ? AND cosmetic_type = ? AND cosmetic_id = ?`),
    insertPurchaseLog: db.prepare(`INSERT INTO purchase_log (user_id, stripe_session_id, cosmetic_type, cosmetic_id, amount, currency) VALUES (?, ?, ?, ?, ?, ?)`),
    getPurchaseBySession: db.prepare(`SELECT * FROM purchase_log WHERE stripe_session_id = ?`),
};

// ─── Token Generation ────────────────────────────────────────

function generateToken() {
    return randomBytes(32).toString('hex');
}

function generateLinkCodeStr() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Register a new user.
 * @returns {{ id, username, display_name, token }}
 */
export function createUser(username, password, displayName, deviceLabel = '') {
    username = username.trim();
    displayName = (displayName || username).trim();

    if (!username || username.length < 3 || username.length > 24) {
        throw new Error('Username must be 3–24 characters.');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        throw new Error('Username can only contain letters, numbers, and underscores.');
    }
    if (!password || password.length < 4) {
        throw new Error('Password must be at least 4 characters.');
    }

    const existing = stmts.getUserByName.get(username);
    if (existing) throw new Error('Username already taken.');

    const hash = bcrypt.hashSync(password, 10);
    const result = stmts.insertUser.run(username, hash, displayName);
    const userId = result.lastInsertRowid;

    // Create leaderboard entry
    stmts.upsertLeaderboard.run(userId);

    // Create auth token
    const token = generateToken();
    stmts.insertToken.run(userId, token, deviceLabel);

    return { id: userId, username, display_name: displayName, token };
}

/**
 * Log in an existing user.
 * @returns {{ id, username, display_name, token }}
 */
export function loginUser(username, password, deviceLabel = '') {
    const user = stmts.getUserByName.get(username?.trim());
    if (!user) throw new Error('Invalid username or password.');

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) throw new Error('Invalid username or password.');

    const token = generateToken();
    stmts.insertToken.run(user.id, token, deviceLabel);

    return { id: user.id, username: user.username, display_name: user.display_name, token };
}

/**
 * Look up a user by auth token.
 * @returns {Object|null} user
 */
export function getUserByToken(token) {
    if (!token) return null;
    return stmts.getByToken.get(token) || null;
}

/**
 * Log out (delete token).
 */
export function logout(token) {
    stmts.deleteToken.run(token);
}

// ─── Decks ───────────────────────────────────────────────────

/**
 * Save or update a deck.
 * @param {number} userId
 * @param {string} name
 * @param {string} region
 * @param {string[]} cardIds
 * @param {number|null} deckId - if provided, update existing deck
 * @returns {{ id }}
 */
export function saveUserDeck(userId, name, region, cardIds, deckId = null) {
    const json = JSON.stringify(cardIds);
    if (deckId) {
        stmts.updateDeck.run(name, region, json, deckId, userId);
        return { id: deckId };
    }
    const result = stmts.insertDeck.run(userId, name, region, json);
    return { id: result.lastInsertRowid };
}

/**
 * Get all decks for a user.
 */
export function getUserDecks(userId) {
    const rows = stmts.getDecksByUser.all(userId);
    return rows.map(r => ({ ...r, card_ids: JSON.parse(r.card_ids) }));
}

/**
 * Delete a deck.
 */
export function deleteUserDeck(userId, deckId) {
    const result = stmts.deleteDeck.run(deckId, userId);
    return result.changes > 0;
}

// ─── Leaderboard / Ranked ────────────────────────────────────

/**
 * Update ranked points after a match.
 * @param {number} userId
 * @param {'win'|'loss'|'draw'} outcome
 * @param {number} [pointsDelta] - override default
 */
export function updateRankedPoints(userId, outcome, pointsDelta) {
    stmts.upsertLeaderboard.run(userId);
    if (outcome === 'win') {
        stmts.addWin.run(pointsDelta ?? 25, userId);
    } else if (outcome === 'loss') {
        stmts.addLoss.run(pointsDelta ?? -15, userId);
    } else {
        stmts.addDraw.run(userId);
    }
}

/**
 * Get the top N players.
 */
export function getLeaderboard(limit = 50) {
    return stmts.getLeaderboard.all(limit);
}

/**
 * Get a user's full profile (info + stats).
 */
export function getUserProfile(userId) {
    const user = stmts.getUserById.get(userId);
    if (!user) return null;
    const stats = stmts.getUserStats.get(userId) || { ranked_points: 1000, wins: 0, losses: 0, draws: 0 };
    return { ...user, ...stats };
}

// ─── Card Collection ─────────────────────────────────────────

/**
 * Get a user's card collection.
 * @param {number} userId
 * @returns {{ card_id: string, count: number }[]}
 */
export function getCollection(userId) {
    return stmts.getCollection.all(userId);
}

/**
 * Add cards to a user's collection (increment counts, cap at 3).
 * @param {number} userId
 * @param {string[]} cardIds - array of card IDs to add (may contain duplicates)
 * @returns {{ added: {cardId: string, newCount: number}[] }}
 */
export function addCardsToCollection(userId, cardIds) {
    const added = [];
    const addTx = db.transaction(() => {
        for (const cardId of cardIds) {
            const before = stmts.getCollectionCard.get(userId, cardId);
            const beforeCount = before ? before.count : 0;
            if (beforeCount >= 3) continue; // already at max
            stmts.upsertCollectionCard.run(userId, cardId);
            const after = stmts.getCollectionCard.get(userId, cardId);
            added.push({ cardId, newCount: after.count });
        }
    });
    addTx();
    return { added };
}

/**
 * Set the user's chosen starting region.
 * @param {number} userId
 * @param {string} region
 */
export function setChosenRegion(userId, region) {
    stmts.setChosenRegion.run(region, userId);
}

/**
 * Get the user's chosen starting region.
 * @param {number} userId
 * @returns {string|null}
 */
export function getChosenRegion(userId) {
    const row = stmts.getChosenRegion.get(userId);
    return row ? row.chosen_region : null;
}

/**
 * Grant starter cards for a region (1 copy of every card in that region).
 * @param {number} userId
 * @param {string} region
 * @param {string[]} regionCardIds - all card IDs belonging to the region
 * @returns {{ added: {cardId: string, newCount: number}[] }}
 */
export function grantStarterCards(userId, region, regionCardIds) {
    setChosenRegion(userId, region);
    return addCardsToCollection(userId, regionCardIds);
}

// ─── Cosmetics Store ─────────────────────────────────────────

/**
 * Grant a cosmetic item to a user.
 * @param {number} userId
 * @param {string} cosmeticType - 'playmat' | 'sleeve' | 'avatarFrame' | 'emoteSet'
 * @param {string} cosmeticId - e.g. 'N001', 'inferno', 'shadow_dragon'
 * @returns {boolean} true if newly granted, false if already owned
 */
export function grantCosmetic(userId, cosmeticType, cosmeticId) {
    const result = stmts.insertCosmetic.run(userId, cosmeticType, cosmeticId);
    return result.changes > 0;
}

/**
 * Get all cosmetics owned by a user.
 * @param {number} userId
 * @returns {{ cosmetic_type: string, cosmetic_id: string }[]}
 */
export function getUserCosmetics(userId) {
    return stmts.getUserCosmetics.all(userId);
}

/**
 * Check if a user owns a specific cosmetic.
 * @returns {boolean}
 */
export function ownsCosmetic(userId, cosmeticType, cosmeticId) {
    return !!stmts.ownsCosmetic.get(userId, cosmeticType, cosmeticId);
}

/**
 * Log a completed purchase.
 */
export function logPurchase(userId, stripeSessionId, cosmeticType, cosmeticId, amount, currency = 'gbp') {
    stmts.insertPurchaseLog.run(userId, stripeSessionId, cosmeticType, cosmeticId, amount, currency);
}

/**
 * Check if a Stripe session has already been processed (idempotency).
 */
export function getPurchaseBySession(stripeSessionId) {
    return stmts.getPurchaseBySession.get(stripeSessionId) || null;
}

// ─── Device Linking ──────────────────────────────────────────

/**
 * Generate a 6-char link code for the user (valid 5 minutes).
 * @returns {{ code }}
 */
export function generateLinkCode(userId) {
    // Clean expired codes first
    stmts.cleanExpiredCodes.run();

    let code;
    let attempts = 0;
    do {
        code = generateLinkCodeStr();
        attempts++;
    } while (stmts.getLinkCode.get(code) && attempts < 20);

    stmts.insertLinkCode.run(userId, code);
    return { code };
}

/**
 * Redeem a link code — returns a new auth token for the linked device.
 * @returns {{ id, username, display_name, token }}
 */
export function redeemLinkCode(code, deviceLabel = '') {
    const row = stmts.getLinkCode.get(code?.toUpperCase());
    if (!row) throw new Error('Invalid or expired link code.');

    // Delete the used code
    stmts.deleteLinkCode.run(code.toUpperCase());

    const user = stmts.getUserById.get(row.user_id);
    if (!user) throw new Error('Account not found.');

    const token = generateToken();
    stmts.insertToken.run(user.id, token, deviceLabel);

    return { id: user.id, username: user.username, display_name: user.display_name, token };
}

export default db;
