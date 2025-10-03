;(function(root) {
    const globalObj = root || (typeof globalThis !== 'undefined' ? globalThis : this);

    const DEFAULT_STATE = 'idle';
    const STATE_VALUES = new Set([
        'idle',          // No active session yet
        'lobby',         // Players configuring loadout / lobby UI
        'ready-check',   // Countdown or synchronization before match
        'round-prep',    // Cards / draft / placement before round
        'round-active',  // Combat is active
        'round-end',     // Someone won, resolving rewards
        'intermission',  // Between rounds, before next ready state
        'match-complete' // Match flow complete
    ]);

    const EVENT_NAMES = {
        STATE_CHANGED: 'state-changed',
        ROUND_CHANGED: 'round-changed',
        ROUND_COMPLETED: 'round-completed',
        ELIMINATION: 'elimination',
        SCORE_UPDATED: 'score-updated',
        MATCH_RESET: 'match-reset',
        SUMMARY_UPDATED: 'summary-updated'
    };

    function now() {
        return Date.now ? Date.now() : new Date().getTime();
    }

    class MatchLifecycleManager {
        constructor(options = {}) {
            this.listeners = new Map();
            this.state = DEFAULT_STATE;
            this.roundNumber = 0;
            this.roundStartedAt = null;
            this.roundEndedAt = null;
            this.roundHistory = [];
            this.eliminationLog = [];
            this.matchStartedAt = null;
            this.matchEndedAt = null;
            this.metadata = {
                sessionId: options.sessionId || null,
                ruleset: options.ruleset || 'standard'
            };
            this.options = {
                autoRoundIncrement: options.autoRoundIncrement !== false,
                allowImmediateRespawn: options.allowImmediateRespawn === true
            };
            this.timeProvider = typeof options.timeProvider === 'function' ? options.timeProvider : now;
            this.roster = null;
            this._rosterSubscription = null;
            if (options.roster) {
                this.setRoster(options.roster);
            }
        }

        static get STATES() {
            return Object.freeze(Array.from(STATE_VALUES));
        }

        static get EVENTS() {
            return EVENT_NAMES;
        }

        on(eventName, handler) {
            if (!eventName || typeof handler !== 'function') return () => {};
            if (!this.listeners.has(eventName)) this.listeners.set(eventName, new Set());
            const set = this.listeners.get(eventName);
            set.add(handler);
            return () => this.off(eventName, handler);
        }

        off(eventName, handler) {
            if (!eventName || !this.listeners.has(eventName)) return;
            if (handler) {
                const set = this.listeners.get(eventName);
                set.delete(handler);
                if (!set.size) this.listeners.delete(eventName);
            } else {
                this.listeners.delete(eventName);
            }
        }

        once(eventName, handler) {
            if (typeof handler !== 'function') return () => {};
            const wrapped = (...args) => {
                try { handler.apply(this, args); } finally { this.off(eventName, wrapped); }
            };
            return this.on(eventName, wrapped);
        }

        setRoster(roster) {
            if (this._rosterSubscription) {
                this._rosterSubscription();
                this._rosterSubscription = null;
            }
            this.roster = roster || null;
            if (this.roster && typeof this.roster.on === 'function') {
                this._rosterSubscription = this.roster.on('roster-updated', () => {
                    this._emit(EVENT_NAMES.SUMMARY_UPDATED, { reason: 'roster-sync' });
                });
            }
        }

        getRoster() {
            return this.roster;
        }

        getState() {
            return {
                state: this.state,
                roundNumber: this.roundNumber,
                roundStartedAt: this.roundStartedAt,
                roundEndedAt: this.roundEndedAt,
                matchStartedAt: this.matchStartedAt,
                matchEndedAt: this.matchEndedAt,
                options: Object.assign({}, this.options),
                metadata: Object.assign({}, this.metadata)
            };
        }

        setState(nextState, options = {}) {
            if (!STATE_VALUES.has(nextState)) {
                throw new Error(`[MatchLifecycleManager] Invalid state: ${nextState}`);
            }
            if (this.state === nextState) return;
            const prevState = this.state;
            this.state = nextState;
            if (nextState === 'round-active') {
                this.roundStartedAt = this.timeProvider();
                if (!this.matchStartedAt) this.matchStartedAt = this.roundStartedAt;
            }
            if (nextState === 'match-complete') {
                this.matchEndedAt = this.timeProvider();
            }
            this._emit(EVENT_NAMES.STATE_CHANGED, { previous: prevState, current: nextState, info: options.info || null });
        }

        beginRound(options = {}) {
            if (this.options.autoRoundIncrement) {
                this.roundNumber += 1;
                this._emit(EVENT_NAMES.ROUND_CHANGED, { roundNumber: this.roundNumber, reason: 'auto-increment' });
            } else if (Number.isFinite(options.roundNumber)) {
                this.roundNumber = Math.max(0, Math.floor(options.roundNumber));
                this._emit(EVENT_NAMES.ROUND_CHANGED, { roundNumber: this.roundNumber, reason: 'manual-set' });
            }
            this.roundStartedAt = this.timeProvider();
            this.roundEndedAt = null;
            if (this.roster && typeof this.roster.resetRoundState === 'function') {
                this.roster.resetRoundState({ clearScores: false });
            }
            this.setState('round-active', { info: options.info || null });
        }

        completeRound(summary = {}) {
            this.roundEndedAt = this.timeProvider();
            const roundSummary = {
                roundNumber: this.roundNumber,
                startedAt: this.roundStartedAt,
                endedAt: this.roundEndedAt,
                durationMs: this.roundStartedAt ? this.roundEndedAt - this.roundStartedAt : null,
                winners: summary.winners ? [].concat(summary.winners) : [],
                eliminations: summary.eliminations ? [].concat(summary.eliminations) : [],
                reason: summary.reason || null,
                metadata: summary.metadata ? Object.assign({}, summary.metadata) : {}
            };
            this.roundHistory.push(roundSummary);
            this._emit(EVENT_NAMES.ROUND_COMPLETED, { summary: roundSummary });
            this.setState('round-end', { info: summary.reason || null });
        }

        markEliminated(fighterId, context = {}) {
            if (!fighterId) return null;
            let fighterRecord = null;
            if (this.roster && typeof this.roster.markEliminated === 'function') {
                fighterRecord = this.roster.markEliminated(fighterId, context) || null;
            }
            const entry = {
                fighterId,
                roundNumber: this.roundNumber,
                timestamp: this.timeProvider(),
                reason: context.reason || null,
                position: context.position || null
            };
            this.eliminationLog.push(entry);
            this._emit(EVENT_NAMES.ELIMINATION, { entry, fighter: fighterRecord });
            return entry;
        }

        markAlive(fighterId, context = {}) {
            if (!fighterId) return null;
            let fighterRecord = null;
            if (this.roster && typeof this.roster.markAlive === 'function') {
                fighterRecord = this.roster.markAlive(fighterId, context) || null;
            }
            this._emit(EVENT_NAMES.SUMMARY_UPDATED, { reason: 'revive', fighter: fighterRecord });
            return fighterRecord;
        }

        registerScore(fighterId, scoreDelta = 1) {
            if (!fighterId || !this.roster || typeof this.roster.incrementScore !== 'function') return null;
            const newScore = this.roster.incrementScore(fighterId, scoreDelta);
            this._emit(EVENT_NAMES.SCORE_UPDATED, { fighterId, score: newScore, delta: scoreDelta });
            return newScore;
        }

        getMatchSummary(options = {}) {
            const includeFighters = options.includeFighters !== false;
            const summary = {
                state: this.state,
                roundNumber: this.roundNumber,
                roundHistory: this.roundHistory.slice(),
                eliminationLog: this.eliminationLog.slice(),
                startedAt: this.matchStartedAt,
                endedAt: this.matchEndedAt,
                metadata: Object.assign({}, this.metadata)
            };
            if (includeFighters && this.roster && typeof this.roster.getFighters === 'function') {
                summary.fighters = this.roster.getFighters({ includeUnassigned: true });
            }
            return summary;
        }

        syncFromNetwork(payload = {}) {
            if (!payload || typeof payload !== 'object') return;
            if (payload.state && STATE_VALUES.has(payload.state)) {
                this.state = payload.state;
            }
            if (Number.isFinite(payload.roundNumber)) this.roundNumber = payload.roundNumber;
            this.roundStartedAt = payload.roundStartedAt || null;
            this.roundEndedAt = payload.roundEndedAt || null;
            this.matchStartedAt = payload.matchStartedAt || this.matchStartedAt;
            this.matchEndedAt = payload.matchEndedAt || this.matchEndedAt;
            if (payload.metadata) this.metadata = Object.assign({}, this.metadata, payload.metadata);
            if (Array.isArray(payload.roundHistory)) this.roundHistory = payload.roundHistory.slice();
            if (Array.isArray(payload.eliminationLog)) this.eliminationLog = payload.eliminationLog.slice();
            if (this.roster && payload.roster && typeof this.roster.importSerializable === 'function') {
                this.roster.importSerializable(payload.roster, { preserveExternalIds: true });
            }
            this._emit(EVENT_NAMES.SUMMARY_UPDATED, { reason: 'network-sync' });
        }

        toNetworkPayload(options = {}) {
            return Object.assign({}, this.getState(), {
                roundHistory: this.roundHistory.slice(),
                eliminationLog: this.eliminationLog.slice(),
                roster: options.includeRoster && this.roster && typeof this.roster.toSerializable === 'function'
                    ? this.roster.toSerializable({ includeEntity: false })
                    : undefined
            });
        }

        resetMatch(options = {}) {
            this.state = DEFAULT_STATE;
            this.roundNumber = 0;
            this.roundStartedAt = null;
            this.roundEndedAt = null;
            this.roundHistory = [];
            this.eliminationLog = [];
            this.matchStartedAt = null;
            this.matchEndedAt = null;
            if (this.roster && typeof this.roster.reset === 'function') {
                this.roster.reset({ forgetExternal: options.forgetExternalIds === true });
            }
            this._emit(EVENT_NAMES.MATCH_RESET, { reason: options.reason || null });
        }

        _emit(eventName, payload) {
            const handlers = this.listeners.get(eventName);
            if (!handlers || !handlers.size) return;
            handlers.forEach((handler) => {
                try {
                    handler(payload, this);
                } catch (err) {
                    if (typeof console !== 'undefined' && console.warn) {
                        console.warn('[MatchLifecycleManager] listener error for', eventName, err);
                    }
                }
            });
        }
    }

    globalObj.MatchLifecycleManager = MatchLifecycleManager;
    try {
        if (typeof module !== 'undefined' && module.exports) {
            module.exports = MatchLifecycleManager;
        }
    } catch (err) {
        /* no-op */
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
