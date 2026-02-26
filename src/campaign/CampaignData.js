// ─────────────────────────────────────────────────────────────
// CampaignData.js — Campaign stage definitions & progression
// ─────────────────────────────────────────────────────────────

export const CAMPAIGN_STAGES = [
    // ─── Northern Front (Stages 1–3) ─────────────────────────
    {
        id: 1,
        name: 'Frozen Outpost',
        description: 'A patrol of Northern scouts defends the frost-bitten frontier.',
        opponentName: 'Shield Maiden Astrid',
        opponentRegion: 'Northern',
        opponentLP: 2000,
        playerLP: 3000,
        difficulty: 'easy',
        region: 'Northern',
        reward: 'Passage to the Tundra',
    },
    {
        id: 2,
        name: 'Tundra Crossing',
        description: 'A seasoned Northern commander blocks your advance through the icy plains.',
        opponentName: 'Commander Bjorn',
        opponentRegion: 'Northern',
        opponentLP: 2500,
        playerLP: 3000,
        difficulty: 'easy',
        region: 'Northern',
        reward: 'Access to the Citadel',
    },
    {
        id: 3,
        name: 'Frostfell Citadel',
        description: 'The Northern Jarl himself guards the ancient citadel. Conquer it to claim the North.',
        opponentName: 'Jarl Eirik the Unyielding',
        opponentRegion: 'Northern',
        opponentLP: 3000,
        playerLP: 3000,
        difficulty: 'medium',
        region: 'Northern',
        reward: 'Northern Territory Conquered',
    },

    // ─── Eastern Front (Stages 4–6) ──────────────────────────
    {
        id: 4,
        name: 'Bamboo Gate',
        description: 'Eastern monks bar entry to the sacred lands with cunning spell traps.',
        opponentName: 'Initiate Mei Lin',
        opponentRegion: 'Eastern',
        opponentLP: 2500,
        playerLP: 3000,
        difficulty: 'easy',
        region: 'Eastern',
        reward: 'Passage to the Monastery',
    },
    {
        id: 5,
        name: 'Hidden Monastery',
        description: 'Deep in mist-shrouded mountains, a master strategist awaits.',
        opponentName: 'Master Zhao',
        opponentRegion: 'Eastern',
        opponentLP: 3000,
        playerLP: 3000,
        difficulty: 'medium',
        region: 'Eastern',
        reward: 'Access to the Dragon Temple',
    },
    {
        id: 6,
        name: 'Dragon Temple',
        description: 'The Grandmaster commands shadow and spell alike. Only the worthy pass.',
        opponentName: 'Grandmaster Shen',
        opponentRegion: 'Eastern',
        opponentLP: 3000,
        playerLP: 3000,
        difficulty: 'hard',
        region: 'Eastern',
        reward: 'Eastern Territory Conquered',
    },

    // ─── Southern Front (Stages 7–9) ─────────────────────────
    {
        id: 7,
        name: 'Desert Border',
        description: 'Southern raiders attack relentlessly from the sun-scorched sands.',
        opponentName: 'Raider Captain Zara',
        opponentRegion: 'Southern',
        opponentLP: 2500,
        playerLP: 3000,
        difficulty: 'medium',
        region: 'Southern',
        reward: 'Passage to the Arena',
    },
    {
        id: 8,
        name: 'Arena of Trials',
        description: 'The arena champion fights with molten fury and piercing blades.',
        opponentName: 'Champion Draven',
        opponentRegion: 'Southern',
        opponentLP: 3000,
        playerLP: 3000,
        difficulty: 'medium',
        region: 'Southern',
        reward: 'Access to the Volcano',
    },
    {
        id: 9,
        name: 'Volcanic Forge',
        description: 'The Warlord of the Scorch commands an army of fire. Survive the inferno.',
        opponentName: 'Warlord Ignatius',
        opponentRegion: 'Southern',
        opponentLP: 3500,
        playerLP: 3000,
        difficulty: 'hard',
        region: 'Southern',
        reward: 'Southern Territory Conquered',
    },

    // ─── Western Front (Stages 10–12) ────────────────────────
    {
        id: 10,
        name: 'Canyon Pass',
        description: 'Western tricksters ambush you through the narrow canyon.',
        opponentName: 'Tracker Sienna',
        opponentRegion: 'Western',
        opponentLP: 3000,
        playerLP: 3000,
        difficulty: 'medium',
        region: 'Western',
        reward: 'Passage to the Plains',
    },
    {
        id: 11,
        name: 'Spirit Plains',
        description: 'The Grand Shaman summons spirits and beasts to halt your advance.',
        opponentName: 'Grand Shaman Orla',
        opponentRegion: 'Western',
        opponentLP: 3500,
        playerLP: 3000,
        difficulty: 'hard',
        region: 'Western',
        reward: 'Access to the Throne',
    },
    {
        id: 12,
        name: 'Throne of Supremacy',
        description: 'The final battle. Defeat the Supreme Commander to unite all regions under your banner.',
        opponentName: 'Supreme Commander Voss',
        opponentRegion: 'Western',
        opponentLP: 4000,
        playerLP: 3000,
        difficulty: 'hard',
        region: 'Western',
        reward: 'Western Territory Conquered',
    },

    // ─── Finale: Multi-Region Campaign (Stages 13–15) ───────
    {
        id: 13,
        name: 'The Alliance',
        description: 'Two conquered regions forge an alliance against you. Draft your deck and face their combined might.',
        opponentName: 'Alliance Generals',
        opponentRegion: 'Multi',
        opponentLP: 3500,
        playerLP: 3000,
        difficulty: 'hard',
        region: 'Finale',
        reward: 'Alliance Shattered',
        multiRegion: true,
        opponentRegionCount: 2,  // AI uses 2 non-player regions
        draftDeckSize: 20,
    },
    {
        id: 14,
        name: 'Continental War',
        description: 'Three regions unite their armies. Only a masterfully drafted deck can withstand the onslaught.',
        opponentName: 'The Triumvirate',
        opponentRegion: 'Multi',
        opponentLP: 4000,
        playerLP: 3000,
        difficulty: 'hard',
        region: 'Finale',
        reward: 'Triumvirate Defeated',
        multiRegion: true,
        opponentRegionCount: 3,  // AI uses 3 non-player regions
        draftDeckSize: 30,
    },
    {
        id: 15,
        name: 'Supreme Conquest',
        description: 'All four regions rally their greatest warriors for a final stand. Conquer them all to claim ultimate victory.',
        opponentName: 'The Four Sovereigns',
        opponentRegion: 'Multi',
        opponentLP: 4500,
        playerLP: 3000,
        difficulty: 'legendary',
        region: 'Finale',
        reward: 'ALL REGIONS CONQUERED — SUPREME VICTORY!',
        multiRegion: true,
        opponentRegionCount: 4,  // AI uses all 4 regions
        draftDeckSize: 40,
    },
];

// ─── Campaign Progress (localStorage) ───────────────────────

const STORAGE_KEY = 'bar_campaign_progress';

export class CampaignProgress {
    constructor() {
        this.playerRegion = null;
        this.currentStage = 1;
        this.completedStages = [];
        this.stats = {}; // stageId → { turns, lpRemaining }
        this.savedDeckCardIds = []; // Persisted deck card IDs from previous stage
        this._load();
    }

    _load() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                this.playerRegion = data.playerRegion || null;
                this.currentStage = data.currentStage || 1;
                this.completedStages = data.completedStages || [];
                this.stats = data.stats || {};
                this.savedDeckCardIds = data.savedDeckCardIds || [];
            }
        } catch (e) {
            console.warn('Could not load campaign progress:', e);
        }
    }

    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                playerRegion: this.playerRegion,
                currentStage: this.currentStage,
                completedStages: this.completedStages,
                stats: this.stats,
                savedDeckCardIds: this.savedDeckCardIds,
            }));
        } catch (e) {
            console.warn('Could not save campaign progress:', e);
        }
    }

    isStageUnlocked(stageId) {
        return stageId <= this.currentStage;
    }

    isStageCompleted(stageId) {
        return this.completedStages.includes(stageId);
    }

    completeStage(stageId, stats = {}) {
        if (!this.completedStages.includes(stageId)) {
            this.completedStages.push(stageId);
        }
        this.stats[stageId] = stats;
        if (stageId >= this.currentStage) {
            this.currentStage = stageId + 1;
        }
        this.save();
    }

    reset() {
        this.playerRegion = null;
        this.currentStage = 1;
        this.completedStages = [];
        this.stats = {};
        this.save();
    }

    get totalStages() {
        return CAMPAIGN_STAGES.length;
    }

    get isComplete() {
        return this.completedStages.length >= CAMPAIGN_STAGES.length;
    }
}
