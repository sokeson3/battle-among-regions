// ─────────────────────────────────────────────────────────────
// WarCampaignData.js — War Campaign round definitions & state
// ─────────────────────────────────────────────────────────────

/**
 * Round definitions for the War Campaign.
 * 2-player and 3/4-player share the same structure but different VP rewards.
 */
export const WAR_ROUNDS_2P = [
    {
        round: 1,
        name: 'The Regional Skirmish',
        deckSize: 20,
        deckAddCards: 0,      // cards to add during intermission leading INTO this round
        lp: 2000,
        vpWinner: 1,
        landmarkRewardWinner: 1,
        description: 'Build a 20-card deck from your region, then draft from others.',
    },
    {
        round: 2,
        name: 'The Border War',
        deckSize: 30,
        deckAddCards: 10,
        lp: 2500,
        vpWinner: 1,
        landmarkRewardWinner: 1,
        description: 'Bolster your forces with 10 additional cards.',
    },
    {
        round: 3,
        name: 'The Final Front',
        deckSize: 40,
        deckAddCards: 10,
        lp: 3000,
        vpWinner: 1,
        landmarkRewardWinner: 0,
        description: 'All-out war with your full 40-card deck.',
    },
    {
        round: 4,
        name: 'Tiebreaker: War of Attrition',
        deckSize: 40,
        deckAddCards: 0,   // modify up to 10 cards instead
        modifyCards: 10,
        lp: 3000,
        vpWinner: 1,
        landmarkRewardWinner: 0,
        description: 'Modify your deck and fight to break the tie.',
        isTiebreaker: true,
    },
];

export const WAR_ROUNDS_MULTI = [
    {
        round: 1,
        name: 'The Regional Skirmish',
        deckSize: 20,
        deckAddCards: 0,
        lp: 2000,
        vpWinner: 2,
        vp2nd: 1,
        vpFirstBlood: 1,
        landmarkRewardWinner: 2,
        landmarkReward2nd: 1,
        minLandmarks: 2,
        description: 'Build a 20-card deck with at least 2 landmarks from your region.',
    },
    {
        round: 2,
        name: 'The Border War',
        deckSize: 30,
        deckAddCards: 10,
        lp: 2500,
        vpWinner: 2,
        vp2nd: 1,
        vpFirstBlood: 1,
        landmarkRewardWinner: 2,
        landmarkReward2nd: 1,
        description: 'Bolster your forces with 10 additional cards.',
    },
    {
        round: 3,
        name: 'The Final Front',
        deckSize: 40,
        deckAddCards: 10,
        lp: 3000,
        vpWinner: 2,
        vp2nd: 1,
        vpFirstBlood: 1,
        landmarkRewardWinner: 0,
        landmarkReward2nd: 0,
        description: 'All-out war with your full deck.',
    },
    {
        round: 4,
        name: 'Tiebreaker: War of Attrition',
        deckSize: 40,
        deckAddCards: 0,
        modifyCards: 10,
        lp: 3000,
        vpWinner: 3,
        vp2nd: 1,
        vpFirstBlood: 0,
        landmarkRewardWinner: 2,
        landmarkReward2nd: 1,
        description: 'Modify your deck and fight to break the tie.',
        isTiebreaker: true,
    },
];

// ─── War Campaign State (persists across rounds) ─────────────

const STORAGE_KEY = 'bar_war_campaign';

export class WarCampaignState {
    constructor() {
        this.playerCount = 2;
        this.players = [];  // { id, name, region, vp, deck (card IDs), landmarkRewards }
        this.currentRound = 1;
        this.roundResults = [];  // { round, winnerId, secondId, firstBloodId }
        this.fieldLandmarks = {};  // playerId → { cardId, cardData } persisted between rounds
        this.isActive = false;
    }

    init(playerConfigs) {
        this.playerCount = playerConfigs.length;
        this.players = playerConfigs.map((cfg, i) => ({
            id: i,
            name: cfg.name,
            region: cfg.region,
            vp: 0,
            deck: [],
            landmarkRewards: 0,  // landmarks they can pre-place next round
        }));
        this.currentRound = 1;
        this.roundResults = [];
        this.fieldLandmarks = {};
        this.isActive = true;
    }

    getRoundDef() {
        const rounds = this.playerCount <= 2 ? WAR_ROUNDS_2P : WAR_ROUNDS_MULTI;
        return rounds.find(r => r.round === this.currentRound) || rounds[rounds.length - 1];
    }

    recordResult(winnerId, secondId = null, firstBloodId = null) {
        const roundDef = this.getRoundDef();
        const result = { round: this.currentRound, winnerId, secondId, firstBloodId };
        this.roundResults.push(result);

        // Award VP  
        const winnerPlayer = this.players.find(p => p.id === winnerId);
        if (winnerPlayer) {
            winnerPlayer.vp += roundDef.vpWinner;
            winnerPlayer.landmarkRewards = roundDef.landmarkRewardWinner || 0;
        }

        if (secondId !== null && this.playerCount > 2) {
            const secondPlayer = this.players.find(p => p.id === secondId);
            if (secondPlayer) {
                secondPlayer.vp += roundDef.vp2nd || 0;
                secondPlayer.landmarkRewards = roundDef.landmarkReward2nd || 0;
            }
        }

        if (firstBloodId !== null && this.playerCount > 2 && roundDef.vpFirstBlood) {
            const fbPlayer = this.players.find(p => p.id === firstBloodId);
            if (fbPlayer) {
                fbPlayer.vp += roundDef.vpFirstBlood;
            }
        }
    }

    advanceRound() {
        this.currentRound++;
    }

    getStandings() {
        return [...this.players].sort((a, b) => b.vp - a.vp);
    }

    isCampaignOver() {
        const standings = this.getStandings();
        if (this.currentRound > 3) {
            // After round 3+, check for a clear winner
            if (standings[0].vp > standings[1].vp) return true;
            // If tie after round 4, it's still over (would need another tiebreaker but let's cap at reasonable)
            if (this.currentRound > 4) return true;
            return false;
        }
        // After round 3 in 2P, if someone has 3 VP they auto-win
        if (this.playerCount <= 2 && this.currentRound >= 3) {
            if (standings[0].vp >= 3) return true;
        }
        return false;
    }

    getWinner() {
        const standings = this.getStandings();
        return standings[0];
    }

    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                playerCount: this.playerCount,
                players: this.players,
                currentRound: this.currentRound,
                roundResults: this.roundResults,
                fieldLandmarks: this.fieldLandmarks,
                isActive: this.isActive,
            }));
        } catch (e) {
            console.warn('Could not save war campaign:', e);
        }
    }

    load() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                Object.assign(this, data);
                return true;
            }
        } catch (e) {
            console.warn('Could not load war campaign:', e);
        }
        return false;
    }

    reset() {
        this.isActive = false;
        localStorage.removeItem(STORAGE_KEY);
    }
}
