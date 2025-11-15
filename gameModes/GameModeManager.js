class GameModeManager {
    constructor(options = {}) {
        this.game = options.game || null;
        this.match = options.match || null;
        this.roster = options.roster || null;
        this.setupUI = options.setupUI || null;
        this.modes = new Map();
        this.defaultKey = null;
        this.activeMode = null;
        this.serializedSettings = {};
    }

    register(modeInstance) {
        if (!modeInstance || typeof modeInstance.getKey !== 'function') {
            throw new Error('[GameModeManager] Mode must expose getKey()');
        }
        const key = modeInstance.getKey();
        if (!key) {
            throw new Error('[GameModeManager] Mode key is required');
        }
        if (this.modes.has(key)) {
            console.warn('[GameModeManager] Duplicate mode key:', key);
        }
        this.modes.set(key, modeInstance);
        modeInstance.attach(this.match, {
            game: this.game,
            roster: this.roster,
            manager: this
        });
        if (!this.defaultKey) {
            this.defaultKey = key;
        }
    }

    initialize(defaultKey = null) {
        const key = defaultKey || this.defaultKey;
        if (!key) {
            console.warn('[GameModeManager] No game modes registered');
            return;
        }
        this.setActiveMode(key, { silent: true });
    }

    setActiveMode(key, options = {}) {
        const nextKey = key || this.defaultKey;
        const nextMode = this.modes.get(nextKey);
        if (!nextMode) {
            console.warn('[GameModeManager] Unknown mode key:', key);
            return;
        }
        if (this.activeMode === nextMode) {
            return;
        }
        if (this.activeMode && typeof this.activeMode.onDeactivated === 'function') {
            this.activeMode.onDeactivated();
        }
        this.activeMode = nextMode;
        if (this.match && typeof this.match.setMode === 'function') {
            this.match.setMode(nextMode);
        }
        this._applyDeathInterceptor(nextMode);
        if (!options.silent && typeof nextMode.onActivated === 'function') {
            nextMode.onActivated({ roster: this.roster, game: this.game });
        }
    }

    getActiveMode() {
        return this.activeMode;
    }

    getModeOptions() {
        const entries = [];
        for (const [key, mode] of this.modes.entries()) {
            entries.push({
                key,
                label: typeof mode.getLabel === 'function' ? mode.getLabel() : key,
                description: typeof mode.getDescription === 'function' ? mode.getDescription() : ''
            });
        }
        return entries;
    }

    getActiveSetupSettings() {
        if (!this.activeMode || typeof this.activeMode.getSetupSettings !== 'function') return [];
        return this.activeMode.getSetupSettings();
    }

    applySetupValues(values) {
        this.serializedSettings = Object.assign({}, values || {});
        if (this.activeMode && typeof this.activeMode.applySetupSettings === 'function') {
            this.activeMode.applySetupSettings(this.serializedSettings);
        }
    }

    getSerializedSetupValues() {
        if (!this.activeMode || typeof this.activeMode.serializeSetupValues !== 'function') {
            return Object.assign({}, this.serializedSettings || {});
        }
        return this.activeMode.serializeSetupValues();
    }

    onRosterChanged() {
        if (this.activeMode && typeof this.activeMode.onRosterChanged === 'function') {
            this.activeMode.onRosterChanged(this.roster, { game: this.game });
        }
    }

    update(dt, fighters = []) {
        if (!this.activeMode || typeof this.activeMode.update !== 'function') return null;
        const events = this.activeMode.update(dt, fighters);
        return Array.isArray(events) && events.length ? events : (events ? [events] : null);
    }

    getRosterFlags() {
        if (this.activeMode && typeof this.activeMode.getRosterFlags === 'function') {
            return this.activeMode.getRosterFlags() || {};
        }
        return {};
    }

    getRosterSlotDecorations(slotIndex) {
        if (!this.activeMode || typeof this.activeMode.getRosterSlotDecorations !== 'function') return null;
        return this.activeMode.getRosterSlotDecorations(slotIndex, this.roster);
    }

    onMatchStart(options = {}) {
        if (this.activeMode && typeof this.activeMode.onMatchStart === 'function') {
            this.activeMode.onMatchStart(options);
        }
    }

    onRoundStart(options = {}) {
        if (this.activeMode && typeof this.activeMode.onRoundStart === 'function') {
            this.activeMode.onRoundStart(options);
        }
    }

    onRoundReset(options = {}) {
        if (this.activeMode && typeof this.activeMode.onRoundReset === 'function') {
            this.activeMode.onRoundReset(options);
        }
    }

    getScoreboardEntries(fighters = []) {
        if (this.activeMode && typeof this.activeMode.getScoreboardEntries === 'function') {
            return this.activeMode.getScoreboardEntries(fighters);
        }
        return null;
    }

    checkMatchWinner() {
        if (this.activeMode && typeof this.activeMode.checkMatchWinner === 'function') {
            return this.activeMode.checkMatchWinner();
        }
        return null;
    }

    getSerializableState() {
        if (this.activeMode && typeof this.activeMode.getSerializableState === 'function') {
            return this.activeMode.getSerializableState();
        }
        return null;
    }

    applySerializableState(state) {
        if (this.activeMode && typeof this.activeMode.applySerializableState === 'function') {
            this.activeMode.applySerializableState(state);
        }
    }

    _applyDeathInterceptor(mode) {
        if (!mode || typeof mode.getDeathInterceptor !== 'function') {
            if (typeof Fighter !== 'undefined' && typeof Fighter.setDeathInterceptor === 'function') {
                Fighter.setDeathInterceptor(null);
            }
            return;
        }
        const interceptor = mode.getDeathInterceptor();
        if (typeof Fighter !== 'undefined' && typeof Fighter.setDeathInterceptor === 'function') {
            Fighter.setDeathInterceptor(typeof interceptor === 'function' ? interceptor : null);
        }
    }
}

if (typeof window !== 'undefined') {
    window.GameModeManager = GameModeManager;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameModeManager;
}
