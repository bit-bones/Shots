class EliminationMode extends GameMode {
    constructor(config = {}) {
        super(Object.assign({
            key: 'elimination',
            label: 'Elimination',
            description: 'Free-for-all. Last fighter standing scores the round.'
        }, config));
        this.pendingEliminations = [];
        this.eliminationDelay = 1.5;
    }

    onAttach(match) {
        this.match = match;
    }

    onMatchStart() {
        this.pendingEliminations = [];
    }

    onRoundStart() {
        this.pendingEliminations = [];
        if (!this.match) return;
        this.match.roundActive = true;
        this.match.roundEndTimer = 0;
    }

    update(dt, fighters = []) {
        const events = [];

        for (let i = this.pendingEliminations.length - 1; i >= 0; i -= 1) {
            const pending = this.pendingEliminations[i];
            pending.timer += dt;
            if (pending.timer >= this.eliminationDelay) {
                events.push({ event: 'elimination', fighter: pending.fighter });
                this.pendingEliminations.splice(i, 1);
            }
        }

        if (!this.match || !this.match.matchActive || !this.match.roundActive) {
            return events.length ? events : null;
        }

        for (const fighter of fighters) {
            if (!fighter) continue;
            if (!fighter.alive && !fighter.eliminated) {
                fighter.eliminated = true;
                this.pendingEliminations.push({ fighter, timer: 0 });
            }
        }

        const aliveFighters = fighters.filter(f => f && f.alive);
        if (aliveFighters.length <= 1) {
            this.match.roundActive = false;
            this.match.roundEndTimer = this.match.roundEndDuration;
            const roundWinner = aliveFighters[0] || null;
            if (roundWinner) {
                roundWinner.score = (roundWinner.score || 0) + 1;
            }
            const shouldOfferWorldMod = (this.match.roundNum % this.match.worldModInterval) === 0;
            events.push({
                event: 'round_end',
                winner: roundWinner,
                offerWorldMod: shouldOfferWorldMod
            });
        }

        return events.length ? events : null;
    }

    getScoreboardEntries(fighters = []) {
        return fighters.map(f => ({
            id: f.id,
            label: f.name,
            color: f.color,
            score: typeof f.score === 'number' ? f.score : 0,
            slotIndex: f.slotIndex
        }));
    }

    checkMatchWinner() {
        if (!this.match) return null;
        const fighters = this.match.getAllFighters();
        let maxScore = 0;
        let winner = null;
        for (const fighter of fighters) {
            if (!fighter) continue;
            const score = typeof fighter.score === 'number' ? fighter.score : 0;
            if (score > maxScore) {
                maxScore = score;
                winner = fighter;
            }
        }
        if (maxScore >= this.match.roundsToWin) {
            return winner;
        }
        return null;
    }

    onMatchReset() {
        this.pendingEliminations = [];
    }
}

if (typeof window !== 'undefined') {
    window.EliminationMode = EliminationMode;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = EliminationMode;
}
