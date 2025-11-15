class TeamEliminationMode extends GameMode {
    constructor(config = {}) {
        super(Object.assign({
            key: 'team_elimination',
            label: 'Team Elimination',
            description: 'Teams battle until only one fighter remains standing. Downed teammates can be revived.'
        }, config));
        this.settings = {
            bleedOutDuration: 10,
            reviveTime: 3,
            reviveHealthPercent: 0.5
        };
        this.teams = [
            { id: 'team_alpha', name: 'Team Alpha', color: '#65c6ff', score: 0 },
            { id: 'team_beta', name: 'Team Beta', color: '#ff5a5a', score: 0 }
        ];
        this.downedFighters = new Map();
        this.reviveRadius = 70;
    }

    onAttach(match, context = {}) {
        this.match = match || this.match || null;
        this.roster = context.roster || this.roster || null;
        this.game = context.game || this.game || null;
    }

    onActivated() {
        this._ensureTeamsAssigned();
        this._syncAllFighterTeamMetadata();
    }

    getRosterFlags() {
        return {
            showTeamLabels: true,
            enableTeamContextMenu: true
        };
    }

    getSetupSettings() {
        return [
            {
                id: 'bleedOutDuration',
                label: 'Bleed Out Time',
                type: 'range',
                min: 4,
                max: 20,
                step: 1,
                default: this.settings.bleedOutDuration,
                suffix: 's'
            },
            {
                id: 'reviveTime',
                label: 'Revive Hold Time',
                type: 'range',
                min: 1,
                max: 8,
                step: 0.5,
                default: this.settings.reviveTime,
                suffix: 's'
            },
            {
                id: 'reviveHealthPercent',
                label: 'Revive Health %',
                type: 'range',
                min: 0.1,
                max: 1,
                step: 0.05,
                default: this.settings.reviveHealthPercent,
                suffix: '%'
            }
        ];
    }

    applySetupSettings(values = {}) {
        const parsed = Object.assign({}, this.settings);
        if (values.bleedOutDuration != null) {
            parsed.bleedOutDuration = clamp(parseFloat(values.bleedOutDuration), 2, 60);
        }
        if (values.reviveTime != null) {
            parsed.reviveTime = clamp(parseFloat(values.reviveTime), 0.2, 15);
        }
        if (values.reviveHealthPercent != null) {
            const pct = parseFloat(values.reviveHealthPercent);
            parsed.reviveHealthPercent = clamp(pct > 1 ? pct / 100 : pct, 0.05, 1);
        }
        this.settings = parsed;
    }

    serializeSetupValues() {
        return Object.assign({}, this.settings);
    }

    onMatchStart() {
        this.downedFighters.clear();
        this._resetTeamScores();
    }

    onRoundStart() {
        this.downedFighters.clear();
        this._ensureTeamsAssigned();
    }

    onRoundReset() {
        this.downedFighters.clear();
        for (const fighter of this._getAllFighters()) {
            if (fighter) {
                fighter.isDowned = false;
                fighter.reviveProgress = 0;
                fighter.reviveSource = null;
                fighter.reviveTimeRequired = 0;
                fighter.downedTimer = 0;
                fighter.downedDuration = 0;
                fighter.downedSettings = null;
                fighter.downedHealthPercent = 0;
                if (!fighter.alive) {
                    fighter.alive = true;
                    fighter.dying = false;
                    fighter.deathTimer = 0;
                }
            }
        }
    }

    onMatchReset() {
        this.downedFighters.clear();
        this._resetTeamScores();
        for (const fighter of this._getAllFighters()) {
            if (!fighter) continue;
            fighter.isDowned = false;
            fighter.reviveProgress = 0;
            fighter.reviveSource = null;
            fighter.reviveTimeRequired = 0;
            fighter.downedTimer = 0;
            fighter.downedDuration = 0;
            fighter.downedSettings = null;
            fighter.downedHealthPercent = 0;
            fighter.dying = false;
            fighter.deathTimer = 0;
            fighter.alive = true;
        }
    }

    onRosterChanged(roster) {
        this.roster = roster;
        this._ensureTeamsAssigned();
    }

    getTeams() {
        return this.teams.slice();
    }

    setTeamName(teamId, name) {
        const team = this._getTeam(teamId);
        if (!team) return;
        const trimmed = (name || '').toString().trim().slice(0, 32);
        if (trimmed.length) {
            team.name = trimmed;
            this._syncFighterTeamMetadata(team.id);
        }
    }

    assignFighterToTeam(fighterId, teamId) {
        const fighter = this._findFighterById(fighterId);
        const team = this._getTeam(teamId);
        if (!fighter || !team) return;
        this._applyTeamMetadata(fighter, team);
        this._syncFighterTeamMetadata(team.id);
    }

    getRosterSlotDecorations(slotIndex) {
        const fighter = this._findFighterBySlot(slotIndex);
        if (!fighter || !fighter.metadata) return null;
        if (!fighter.metadata.teamId) return null;
        const team = this._getTeam(fighter.metadata.teamId);
        if (!team) return null;
        return {
            type: 'team-label',
            text: team.name,
            color: team.color
        };
    }

    getTeamOptionsForSlot(slotIndex, fighter) {
        if (!fighter) return { teams: [] };
        const currentTeamId = this._getTeamId(fighter);
        const teams = this.teams.map(team => ({
            id: team.id,
            teamId: team.id,
            label: team.name,
            color: team.color,
            active: team.id === currentTeamId,
            disabled: team.id === currentTeamId
        }));
        return {
            label: 'Assign team',
            teams
        };
    }

    getDeathInterceptor() {
        return ({ fighter }) => {
            if (!fighter || fighter.isDowned) return false;
            const teamId = this._getTeamId(fighter);
            if (!teamId) return false;
            const teamAlive = this._getTeamFighters(teamId).filter(f => f && f.alive).length;
            if (teamAlive === 0) {
                // No teammates alive to revive; allow normal death
                return false;
            }
            fighter.eliminated = false;
            fighter.enterDownedState({
                bleedOutDuration: this.settings.bleedOutDuration,
                reviveTime: this.settings.reviveTime,
                reviveHealthPercent: this.settings.reviveHealthPercent
            });
            this.downedFighters.set(fighter.id, {
                fighter,
                teamId,
                timer: 0,
                bleedOut: this.settings.bleedOutDuration,
                reviveTime: this.settings.reviveTime,
                reviveHealthPercent: this.settings.reviveHealthPercent
            });
            return true;
        };
    }

    update(dt, fighters = []) {
        const events = [];
        const activeFighters = fighters || this._getAllFighters();

        this._updateDowned(dt, events);
        this._updateRevives(dt, activeFighters, events);

        if (!this.match || !this.match.matchActive || !this.match.roundActive) {
            return events;
        }

        const aliveFighters = activeFighters.filter(f => f && f.alive);
        const aliveTeams = new Set(aliveFighters.map(f => this._getTeamId(f)).filter(Boolean));

        if (aliveTeams.size === 1 && aliveFighters.length > 0) {
            const winnerTeamId = aliveTeams.values().next().value;
            const team = this._getTeam(winnerTeamId);
            if (team) {
                team.score = (team.score || 0) + 1;
            }
            const losingTeamIds = this.teams
                .filter(t => t.id !== winnerTeamId)
                .map(t => t.id);
            const losingFighters = this._getAllFighters().filter(f => f && this._getTeamId(f) && this._getTeamId(f) !== winnerTeamId);
            const losingFighterIds = losingFighters.map(f => f.id);
            this.match.roundActive = false;
            this.match.roundEndTimer = this.match.roundEndDuration;
            const shouldOfferWorldMod = (this.match.roundNum % this.match.worldModInterval) === 0;
            events.push({
                event: 'round_end',
                winner: this._createTeamWinner(team),
                winnerTeamId,
                offerWorldMod: shouldOfferWorldMod,
                losingTeamIds,
                losingFighterIds
            });
        }

        return events;
    }

    getScoreboardEntries() {
        return this.teams.map(team => ({
            id: team.id,
            label: team.name,
            color: team.color,
            score: team.score || 0
        }));
    }

    getSerializableState() {
        return {
            teams: this.teams.map(team => ({
                id: team.id,
                name: team.name,
                color: team.color,
                score: team.score || 0
            }))
        };
    }

    applySerializableState(state) {
        if (!state || !Array.isArray(state.teams)) return;
        for (const incoming of state.teams) {
            if (!incoming || !incoming.id) continue;
            const team = this._getTeam(incoming.id);
            if (!team) continue;
            if (typeof incoming.name === 'string') {
                team.name = incoming.name;
            }
            if (typeof incoming.color === 'string') {
                team.color = incoming.color;
            }
            if (typeof incoming.score === 'number' && Number.isFinite(incoming.score)) {
                team.score = incoming.score;
            }
        }
        this._syncAllFighterTeamMetadata();
    }

    checkMatchWinner() {
        if (!this.match) return null;
        for (const team of this.teams) {
            if ((team.score || 0) >= this.match.roundsToWin) {
                return this._createTeamWinner(team);
            }
        }
        return null;
    }

    _updateDowned(dt, events) {
        for (const [fighterId, entry] of Array.from(this.downedFighters.entries())) {
            const fighter = entry.fighter;
            if (!fighter || !fighter.isDowned) {
                this.downedFighters.delete(fighterId);
                continue;
            }
            entry.timer += dt;
            fighter.downedTimer = entry.timer;
            fighter.downedDuration = entry.bleedOut;
            if (entry.timer >= entry.bleedOut) {
                fighter.forceEliminate({ amount: 22 });
                fighter.eliminated = true;
                this.downedFighters.delete(fighterId);
                events.push({ event: 'elimination', fighter });
            }
        }
    }

    _updateRevives(dt, fighters, events) {
        const downedEntries = Array.from(this.downedFighters.values());
        this._syncAllFighterTeamMetadata();
        if (!downedEntries.length) return;

        for (const entry of downedEntries) {
            const fighter = entry.fighter;
            if (!fighter || !fighter.isDowned) continue;
            const teammates = this._getTeamFighters(entry.teamId).filter(f => f && f.alive);
            const revived = this._processReviveAttempt(dt, fighter, teammates, entry);
            if (revived) {
                this.downedFighters.delete(fighter.id);
                fighter.exitDownedState(entry.reviveHealthPercent);
                fighter.triggerHealingEffect(Math.round(fighter.health));
                events.push({ event: 'revived', fighter });
            }
        }
    }

    _processReviveAttempt(dt, fighter, teammates, entry) {
        let bestTeammate = null;
        let bestDistance = Infinity;
        for (const mate of teammates) {
            const distance = dist(mate.x, mate.y, fighter.x, fighter.y);
            if (distance < this.reviveRadius && this._isReviveInputActive(mate)) {
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestTeammate = mate;
                }
            }
        }

        if (!bestTeammate) {
            fighter.reviveSource = null;
            fighter.reviveProgress = Math.max(0, fighter.reviveProgress - dt * 0.8);
            return false;
        }

        fighter.reviveSource = bestTeammate;
        fighter.reviveProgress += dt;
        fighter.reviveTimeRequired = entry.reviveTime;
        return fighter.reviveProgress >= entry.reviveTime;
    }

    _isReviveInputActive(fighter) {
        if (!fighter) return false;
        if (fighter.isLocal) {
            return !!(this.game && this.game.input && (this.game.input.keys['e'] || this.game.input.keys['E']));
        }
        const keys = fighter.keys || {};
        return !!(keys['e'] || keys['E']);
    }

    _createTeamWinner(team) {
        if (!team) return null;
        return {
            id: `team-${team.id}`,
            name: team.name,
            color: team.color,
            isTeam: true,
            score: team.score || 0
        };
    }

    _ensureTeamsAssigned() {
        if (!this.roster) return;
        const fighters = this._getAllFighters();
        if (!fighters.length) return;
        const assignmentCounts = new Map();
        for (const team of this.teams) {
            assignmentCounts.set(team.id, 0);
        }
        for (const fighter of fighters) {
            if (!fighter) continue;
            const existingTeamId = this._getTeamId(fighter);
            if (existingTeamId && assignmentCounts.has(existingTeamId)) {
                assignmentCounts.set(existingTeamId, assignmentCounts.get(existingTeamId) + 1);
                continue;
            }
            const targetTeam = this._getTeamWithFewest(assignmentCounts);
            if (!targetTeam) continue;
            this._applyTeamMetadata(fighter, targetTeam);
            assignmentCounts.set(targetTeam.id, assignmentCounts.get(targetTeam.id) + 1);
        }
        this._syncAllFighterTeamMetadata();
    }

    _getTeamWithFewest(counts) {
        let bestTeam = null;
        let bestCount = Infinity;
        for (const team of this.teams) {
            const count = counts.get(team.id) || 0;
            if (count < bestCount) {
                bestCount = count;
                bestTeam = team;
            }
        }
        return bestTeam;
    }

    _getTeam(teamId) {
        return this.teams.find(team => team.id === teamId) || null;
    }

    _getTeamId(fighter) {
        if (!fighter || !fighter.metadata) return null;
        return fighter.metadata.teamId || null;
    }

    _getTeamFighters(teamId) {
        return this._getAllFighters().filter(f => f && this._getTeamId(f) === teamId);
    }

    _findFighterById(id) {
        return this._getAllFighters().find(f => f && f.id === id) || null;
    }

    _findFighterBySlot(slotIndex) {
        if (!this.roster) return null;
        return this.roster.getSlot(slotIndex);
    }

    _getAllFighters() {
        let fighters = null;
        if (this.match && typeof this.match.getAllFighters === 'function') {
            try {
                fighters = this.match.getAllFighters();
            } catch (error) {
                console.warn('[TeamEliminationMode] Failed to read fighters from match:', error);
            }
        }

        if (Array.isArray(fighters) && fighters.length) {
            return fighters;
        }

        if (this.roster && typeof this.roster.getAllFighters === 'function') {
            return this.roster.getAllFighters();
        }

        return Array.isArray(fighters) ? fighters : [];
    }

    _resetTeamScores() {
        for (const team of this.teams) {
            team.score = 0;
        }
    }

    _applyTeamMetadata(fighter, team) {
        if (!fighter || !team) return;
        fighter.metadata = fighter.metadata || {};
        fighter.metadata.teamId = team.id;
        fighter.metadata.teamName = team.name;
        fighter.metadata.teamColor = team.color;
        if (!fighter.color) {
            fighter.color = team.color;
        }
    }

    _syncFighterTeamMetadata(teamId) {
        if (!teamId) return;
        const team = this._getTeam(teamId);
        if (!team) return;
        const fighters = this._getTeamFighters(teamId);
        for (const fighter of fighters) {
            this._applyTeamMetadata(fighter, team);
        }
    }

    _syncAllFighterTeamMetadata() {
        for (const team of this.teams) {
            this._syncFighterTeamMetadata(team.id);
        }
    }

    shouldOfferPowerupOnElimination() {
        return false;
    }

    getRoundEndPowerupRecipients(event = {}) {
        const winnerTeamId = event && event.winnerTeamId;
        if (!winnerTeamId) return [];
        const fighters = this._getAllFighters();
        const recipients = [];
        for (const fighter of fighters) {
            if (!fighter) continue;
            const teamId = this._getTeamId(fighter);
            if (!teamId || teamId === winnerTeamId) continue;
            recipients.push(fighter);
        }
        return recipients;
    }
}

if (typeof window !== 'undefined') {
    window.TeamEliminationMode = TeamEliminationMode;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TeamEliminationMode;
}
