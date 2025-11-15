class GameMode {
    constructor(config = {}) {
        this.key = config.key || 'mode';
        this.label = config.label || 'Game Mode';
        this.description = config.description || '';
        this._match = null;
        this._game = config.game || null;
    }

    attach(match, context = {}) {
        this._match = match || null;
        this._game = context.game || this._game || null;
        if (typeof this.onAttach === 'function') {
            this.onAttach(match, context);
        }
    }

    detach() {
        if (typeof this.onDetach === 'function') {
            this.onDetach();
        }
        this._match = null;
    }

    getKey() {
        return this.key;
    }

    getLabel() {
        return this.label;
    }

    getDescription() {
        return this.description || '';
    }

    /**
     * Called when this mode becomes active in the setup menu.
     */
    onActivated(context = {}) {}

    /**
     * Called when this mode is deactivated in favour of another mode.
     */
    onDeactivated() {}

    /**
     * Optional roster flags that influence how the setup UI should render slots.
     * @returns {object}
     */
    getRosterFlags() {
        return {};
    }

    /**
     * Returns an array describing additional setup controls for this mode.
     * Each control descriptor should include { id, label, type, min, max, step, default, suffix, description }.
     */
    getSetupSettings() {
        return [];
    }

    /**
     * Allows the mode to mutate fighter/roster metadata when the roster changes.
     */
    onRosterChanged(roster, context = {}) {}

    /**
     * Allows the mode to apply host-provided setup values before a match starts.
     */
    applySetupSettings(values = {}) {
        this._setupValues = Object.assign({}, values);
    }

    /**
     * Returns setup values that should be shared with joiners.
     */
    serializeSetupValues() {
        return Object.assign({}, this._setupValues || {});
    }

    /**
     * Called before MatchSystem.startMatch
     */
    onMatchStart(options = {}) {}

    /**
     * Called at the beginning of each round.
     */
    onRoundStart(options = {}) {}

    /**
     * Main update loop for the game mode. Must return an array of events or null.
     */
    update(dt, fighters = []) {
        return null;
    }

    /**
     * Called while MatchSystem.updateRoundEndTimer is ticking. Should return an object
     * with event descriptor once ready, or null to continue default behaviour.
     */
    updateRoundEnd(dt, callback) {
        return null;
    }

    /**
     * Returns information used by RenderSystem to draw scoreboards.
     * Should return an array of { id, label, color, score }.
     */
    getScoreboardEntries(fighters = []) {
        return fighters.map(f => ({
            id: f.id,
            label: f.name,
            color: f.color,
            score: typeof f.score === 'number' ? f.score : 0,
            slotIndex: f.slotIndex
        }));
    }

    /**
     * Called by MatchSystem to determine match winner if any.
     */
    checkMatchWinner() {
        return null;
    }

    /**
     * Allows the mode to contribute extra state for network snapshots.
     */
    getSerializableState() {
        return null;
    }

    /**
     * Allows the mode to apply state received from the network (joiners).
     */
    applySerializableState(state) {}

    /**
     * Optional hook to intercept fighter deaths. Return true to cancel default death handling.
     */
    getDeathInterceptor() {
        return null;
    }

    /**
     * Called when match resets entirely.
     */
    onMatchReset() {}

    /**
     * Provides any decorations for roster slots (e.g., team labels).
     */
    getRosterSlotDecorations(slotIndex, roster) {
        return null;
    }

    /**
     * Allows the mode to mutate fighters as rounds reset.
     */
    onRoundReset(options = {}) {}

    /**
     * Determines whether fighters should receive powerups immediately upon elimination.
     * Return false to suppress the default behaviour.
     */
    shouldOfferPowerupOnElimination(context = {}) {
        return true;
    }

    /**
     * Returns an array of fighters (or fighter IDs) that should receive powerups at the
     * conclusion of a round. Return null/undefined for default behaviour (no awards).
     */
    getRoundEndPowerupRecipients(event = {}, context = {}) {
        return null;
    }
}

if (typeof window !== 'undefined') {
    window.GameMode = GameMode;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameMode;
}
