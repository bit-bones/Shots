/**
 * MatchSystem - Manages round/match lifecycle
 */
class MatchSystem {
    constructor() {
        this.roundNum = 0;
        this.roundsToWin = 10;
        this.roundActive = false;
        this.matchActive = false;
        this.winner = null;
        this.roundEndTimer = 0;
        this.roundEndDuration = 2.0;
        this.worldModInterval = 3; // Offer world mod every 3 rounds
        this.pendingEliminations = []; // Queue of eliminations waiting for death animation
        this.eliminationDelay = 1.5; // Delay before showing cards (matches death animation)
        this.mode = null;
    }

    startMatch(roundsToWin) {
        this.roundsToWin = roundsToWin || 10;
        this.roundNum = 0;
        this.matchActive = true;
        this.winner = null;
        this.startRound();
        if (this.mode && typeof this.mode.onMatchStart === 'function') {
            this.mode.onMatchStart({ roundsToWin: this.roundsToWin });
        }
    }

    startRound() {
        this.roundNum++;
        this.roundActive = true;
        this.roundEndTimer = 0;
        if (this.mode && typeof this.mode.onRoundStart === 'function') {
            this.mode.onRoundStart({ roundNum: this.roundNum });
        }
    }

    update(dt, fighters) {
        let events = [];

        if (this.mode && typeof this.mode.update === 'function') {
            const modeEvents = this.mode.update(dt, fighters);
            if (Array.isArray(modeEvents)) {
                events.push(...modeEvents);
            } else if (modeEvents) {
                events.push(modeEvents);
            }
        } else {
            // Legacy elimination behaviour (fallback)
            for (let i = this.pendingEliminations.length - 1; i >= 0; i--) {
                const pending = this.pendingEliminations[i];
                pending.timer += dt;
                if (pending.timer >= this.eliminationDelay) {
                    events.push({ event: 'elimination', fighter: pending.fighter });
                    this.pendingEliminations.splice(i, 1);
                }
            }

            if (!this.matchActive || !this.roundActive) {
                return events.length ? events : null;
            }

            for (let fighter of fighters) {
                if (!fighter.alive && !fighter.eliminated) {
                    fighter.eliminated = true;
                    this.pendingEliminations.push({ fighter, timer: 0 });
                }
            }

            const aliveFighters = fighters.filter(f => f.alive);
            if (aliveFighters.length <= 1) {
                this.roundActive = false;
                this.roundEndTimer = this.roundEndDuration;
                const roundWinner = aliveFighters[0] || null;
                if (roundWinner) {
                    roundWinner.score++;
                }
                const shouldOfferWorldMod = (this.roundNum % this.worldModInterval) === 0;
                events.push({
                    event: 'round_end',
                    winner: roundWinner,
                    offerWorldMod: shouldOfferWorldMod
                });
            }
        }

        return events.length ? events : null;
    }

    updateRoundEndTimer(dt, onRoundEndComplete) {
        if (this.roundEndTimer > 0) {
            this.roundEndTimer -= dt;
            if (this.roundEndTimer <= 0) {
                // Check for match winner
                let matchWinner = this.checkMatchWinner();
                if (matchWinner) {
                    this.matchActive = false;
                    this.winner = matchWinner;
                    if (onRoundEndComplete) {
                        onRoundEndComplete({ event: 'match_end', winner: matchWinner });
                    }
                } else {
                    // Continue to next round
                    this.startRound();
                    if (onRoundEndComplete) {
                        onRoundEndComplete({ event: 'next_round' });
                    }
                }
            }
        }
    }

    checkMatchWinner() {
        if (this.mode && typeof this.mode.checkMatchWinner === 'function') {
            const modeWinner = this.mode.checkMatchWinner();
            if (modeWinner) return modeWinner;
        }
        // Find fighter(s) with highest score
        let maxScore = 0;
        let winners = [];
        
        for (let f of this.getAllFighters()) {
            if (f.score > maxScore) {
                maxScore = f.score;
                winners = [f];
            } else if (f.score === maxScore) {
                winners.push(f);
            }
        }
        
        // Check if winner reached rounds to win
        if (maxScore >= this.roundsToWin) {
            return winners[0]; // Return first if tied (could extend for tiebreaker)
        }
        
        return null;
    }

    getAllFighters() {
        // This will be set from outside
        return this._allFighters || [];
    }

    setFighters(fighters) {
        this._allFighters = fighters;
    }

    resetMatch() {
        this.roundNum = 0;
        this.roundActive = false;
        this.matchActive = false;
        this.winner = null;
        this.roundEndTimer = 0;
        this.pendingEliminations = [];
        
        // Reset scores
        for (let f of this.getAllFighters()) {
            f.score = 0;
        }
        if (this.mode && typeof this.mode.onMatchReset === 'function') {
            this.mode.onMatchReset();
        }
    }

    isRoundActive() {
        return this.roundActive;
    }

    isMatchActive() {
        return this.matchActive;
    }

    getWinner() {
        return this.winner;
    }

    getRoundNum() {
        return this.roundNum;
    }

    getRoundsToWin() {
        return this.roundsToWin;
    }

    isRoundEnding() {
        return this.roundEndTimer > 0;
    }

    setMode(mode) {
        if (this.mode === mode) return;
        this.mode = mode || null;
        if (this.mode && typeof this.mode.attach === 'function') {
            this.mode.attach(this, {});
        }
    }

    getMode() {
        return this.mode;
    }

    getScoreboardEntries(fighters = []) {
        if (this.mode && typeof this.mode.getScoreboardEntries === 'function') {
            return this.mode.getScoreboardEntries(fighters.length ? fighters : this.getAllFighters());
        }
        return null;
    }
}

// Export to window
if (typeof window !== 'undefined') {
    window.MatchSystem = MatchSystem;
}
