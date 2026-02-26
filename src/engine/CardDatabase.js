// ─────────────────────────────────────────────────────────────
// CardDatabase.js — Parses CSV and provides card lookup
// ─────────────────────────────────────────────────────────────

export class CardDatabase {
    constructor() {
        this.cards = new Map();
        this.byRegion = { Northern: [], Eastern: [], Western: [], Southern: [] };
        this.byType = { Unit: [], Spell: [], Trap: [], Landmark: [], Token: [] };
    }

    /**
     * Parse the CSV text and populate the database
     * @param {string} csvText - Raw CSV file content
     */
    async loadFromCSV(csvText) {
        const lines = csvText.split('\n').map(l => l.replace(/\r$/, ''));
        const header = this._parseCSVLine(lines[0]);

        // Find column indices
        const cols = {};
        ['ID', 'Name', 'Type', 'Region', 'ATK', 'HP', 'ManaCost', 'Description', 'Quantity', 'Starting deck'].forEach(name => {
            cols[name] = header.indexOf(name);
        });

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = this._parseCSVLine(line);
            const id = (values[cols.ID] || '').trim();
            if (!id) continue;

            // Skip stat rows embedded in CSV (they have no valid Type)
            const type = (values[cols.Type] || '').trim();
            if (!['Unit', 'Spell', 'Trap', 'Landmark', 'Token'].includes(type)) continue;

            const card = {
                id,
                name: (values[cols.Name] || '').trim(),
                type,
                region: (values[cols.Region] || '').trim(),
                atk: parseInt(values[cols.ATK]) || 0,
                hp: parseInt(values[cols.HP]) || 0,
                manaCost: parseInt(values[cols.ManaCost]) || 0,
                description: (values[cols.Description] || '').trim(),
                quantity: parseInt(values[cols.Quantity]) || 0,
                startingDeck: parseInt(values[cols['Starting deck']]) || 0,
                // Derived fields
                keywords: this._extractKeywords((values[cols.Description] || '').trim()),
                effectTriggers: this._extractTriggers((values[cols.Description] || '').trim()),
            };

            this.cards.set(id, card);

            if (this.byRegion[card.region]) {
                this.byRegion[card.region].push(card);
            }
            if (this.byType[card.type]) {
                this.byType[card.type].push(card);
            }
        }

        console.log(`[CardDatabase] Loaded ${this.cards.size} cards`);
        return this;
    }

    /**
     * Parse a CSV line respecting quoted fields
     */
    _parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
        result.push(current);
        return result;
    }

    /**
     * Extract keywords from description text
     */
    _extractKeywords(desc) {
        const keywords = [];
        if (/\bPierce\b/i.test(desc)) keywords.push('PIERCE');
        if (/\bRush\b/i.test(desc)) keywords.push('RUSH');
        if (/\bShadow\b/i.test(desc)) keywords.push('SHADOW');
        if (/\bSilence\b/i.test(desc)) keywords.push('SILENCE');
        return keywords;
    }

    /**
     * Extract effect trigger types from description
     */
    _extractTriggers(desc) {
        const triggers = [];
        if (/When Summoned:/i.test(desc)) triggers.push('ON_SUMMON');
        if (/When this unit is destroyed/i.test(desc)) triggers.push('ON_SELF_DESTROY');
        if (/When destroyed/i.test(desc)) triggers.push('ON_SELF_DESTROY');
        if (/When.*(attack|declares an attack)/i.test(desc)) triggers.push('ON_ATTACK');
        if (/Once per round/i.test(desc)) triggers.push('ACTIVATED');
        if (/End of (your|the) turn/i.test(desc)) triggers.push('ON_TURN_END');
        if (/At the start of your turn/i.test(desc)) triggers.push('ON_TURN_START');
        if (/LANDMARK:/i.test(desc)) triggers.push('LANDMARK_AURA');
        if (/While this unit is on the field/i.test(desc)) triggers.push('PASSIVE_AURA');
        if (/When you play a Spell/i.test(desc)) triggers.push('ON_SPELL_PLAY');
        if (/When a friendly unit is destroyed/i.test(desc)) triggers.push('ON_FRIENDLY_DESTROY');
        if (/When a friendly unit is targeted/i.test(desc)) triggers.push('ON_FRIENDLY_TARGETED');
        if (/When your opponent/i.test(desc)) triggers.push('ON_OPPONENT_ACTION');
        return triggers;
    }

    // ─── Lookup Methods ───────────────────────────────────────

    getCard(id) {
        return this.cards.get(id) || null;
    }

    getCardsByRegion(region) {
        return this.byRegion[region] || [];
    }

    getCardsByType(type) {
        return this.byType[type] || [];
    }

    getUnitsByRegion(region) {
        return this.getCardsByRegion(region).filter(c => c.type === 'Unit');
    }

    getSpellsByRegion(region) {
        return this.getCardsByRegion(region).filter(c => c.type === 'Spell');
    }

    getTrapsByRegion(region) {
        return this.getCardsByRegion(region).filter(c => c.type === 'Trap');
    }

    getLandmarksByRegion(region) {
        return this.getCardsByRegion(region).filter(c => c.type === 'Landmark');
    }

    getStartingDeck(region) {
        // Use quantity column as deck composition (startingDeck column is empty in CSV)
        return this.getCardsByRegion(region)
            .filter(c => c.quantity > 0 && c.type !== 'Token')
            .flatMap(c => Array(c.quantity).fill(c.id));
    }

    getAllPlayableCards() {
        return [...this.cards.values()].filter(c => c.type !== 'Token' && c.quantity > 0);
    }

    /**
     * Create a card instance from a template
     */
    createCardInstance(cardId, ownerId) {
        const template = this.getCard(cardId);
        if (!template) return null;

        return {
            instanceId: `${cardId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            cardId: template.id,
            name: template.name,
            type: template.type,
            region: template.region,
            baseATK: template.atk,
            baseDEF: template.hp,
            currentATK: template.atk,
            currentDEF: template.hp,
            manaCost: template.manaCost,
            description: template.description,
            keywords: [...template.keywords],
            effectTriggers: [...template.effectTriggers],
            ownerId,
            // State
            position: 'ATK', // 'ATK' or 'DEF'
            faceUp: true,
            summonedThisTurn: false,
            hasAttackedThisTurn: false,
            attackCount: 0,
            maxAttacks: 1,
            damageTaken: 0,
            temporaryEffects: [], // Effects that expire at end of turn
            permanentEffects: [], // Effects that persist
            silenced: false,
            canBeTargeted: true,
            isImmune: false,
            // For "once per round" tracking
            activatedThisRound: false,
            // For tracking buffs/debuffs
            atkModifiers: [],
            defModifiers: [],
        };
    }
}
