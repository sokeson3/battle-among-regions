// ─────────────────────────────────────────────────────────────
// MatchHistory.js — Persist online match results in localStorage
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'bar_match_history';
const MAX_ENTRIES = 50;

/**
 * Save a match record.
 * @param {{
 *   date: string,
 *   duration: number,
 *   rounds: number,
 *   turns: number,
 *   winner: number|null,
 *   winnerName: string|null,
 *   myPlayerId: number,
 *   players: Array<{name:string, region:string}>
 * }} record
 */
export function saveMatch(record) {
    const history = getHistory();
    history.unshift(record);
    if (history.length > MAX_ENTRIES) history.length = MAX_ENTRIES;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

/**
 * Retrieve all saved match records, newest first.
 * @returns {Array}
 */
export function getHistory() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

/**
 * Clear all match history.
 */
export function clearHistory() {
    localStorage.removeItem(STORAGE_KEY);
}
