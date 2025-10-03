;(function(root) {
    const globalObj = root || (typeof globalThis !== 'undefined' ? globalThis : this);

    const DEFAULT_MAX_SLOTS = 4;

    const EVENT_NAMES = {
        ROSTER_UPDATED: 'roster-updated',
        SLOT_CHANGED: 'slot-changed',
        FIGHTER_ADDED: 'fighter-added',
        FIGHTER_UPDATED: 'fighter-updated',
        FIGHTER_REMOVED: 'fighter-removed',
        SCORE_CHANGED: 'score-changed',
        STATUS_CHANGED: 'status-changed'
    };

    function cloneShallow(value) {
        if (!value) return value;
        if (Array.isArray(value)) return value.slice();
        if (typeof value === 'object') return Object.assign({}, value);
        return value;
    }

    class PlayerRoster {
        constructor(options = {}) {
            const maxSlots = Number.isFinite(options.maxSlots) ? Math.max(1, Math.floor(options.maxSlots)) : DEFAULT_MAX_SLOTS;
            this.maxSlots = maxSlots;
            this.slots = new Array(this.maxSlots).fill(null);
            this.fighters = new Map();
            this.externalIdLookup = new Map();
            this.listeners = new Map();
            this.nextFighterId = 1;

            if (Array.isArray(options.initialAssignments)) {
                const assignments = options.initialAssignments.filter(Boolean);
                assignments.forEach((assignment) => {
                    const slotIndex = Number.isInteger(assignment.slotIndex) ? assignment.slotIndex : this._findFirstOpenSlot();
                    if (slotIndex >= 0) {
                        this._assignFighter(assignment.kind || assignment.type || 'human', slotIndex, assignment, { silent: true });
                    }
                });
                if (assignments.length) {
                    this._emit(EVENT_NAMES.ROSTER_UPDATED, { reason: 'initial-assignments' });
                }
            }
        }

        static get EVENTS() {
            return EVENT_NAMES;
        }

        on(eventName, handler) {
            if (!eventName || typeof handler !== 'function') return () => {};
            if (!this.listeners.has(eventName)) this.listeners.set(eventName, new Set());
            const handlers = this.listeners.get(eventName);
            handlers.add(handler);
            return () => this.off(eventName, handler);
        }

        off(eventName, handler) {
            if (!eventName || !this.listeners.has(eventName)) return;
            if (handler) {
                const handlers = this.listeners.get(eventName);
                handlers.delete(handler);
                if (!handlers.size) this.listeners.delete(eventName);
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

        getSlotCount() {
            return this.maxSlots;
        }

        getSlots(options = {}) {
            const includeDetails = !!options.includeDetails;
            return this.slots.map((fighterId, index) => {
                if (!includeDetails) {
                    return { index, fighterId: fighterId || null };
                }
                const fighter = fighterId ? this._cloneFighter(this.fighters.get(fighterId), options) : null;
                return { index, fighterId: fighter ? fighter.id : null, fighter };
            });
        }

        getFighters(options = {}) {
            const includeUnassigned = !!options.includeUnassigned;
            const list = [];
            this.fighters.forEach((fighter) => {
                if (!includeUnassigned && (fighter.slotIndex === null || fighter.slotIndex === undefined)) return;
                list.push(this._cloneFighter(fighter, options));
            });
            list.sort((a, b) => {
                const aIdx = typeof a.slotIndex === 'number' ? a.slotIndex : this.maxSlots + a.id;
                const bIdx = typeof b.slotIndex === 'number' ? b.slotIndex : this.maxSlots + b.id;
                return aIdx - bIdx;
            });
            return list;
        }

        getLivingFighters(options = {}) {
            return this.getFighters(options).filter(f => f && f.isAlive !== false);
        }

        getEliminatedFighters(options = {}) {
            return this.getFighters(options).filter(f => f && f.isAlive === false);
        }

        getFighterById(fighterId, options = {}) {
            if (!fighterId || !this.fighters.has(fighterId)) return null;
            return this._cloneFighter(this.fighters.get(fighterId), options);
        }

        getFighterByExternalId(externalId, options = {}) {
            if (!externalId) return null;
            const normalized = this._normalizeExternalId(externalId);
            if (!normalized || !this.externalIdLookup.has(normalized)) return null;
            return this.getFighterById(this.externalIdLookup.get(normalized), options);
        }

        assignHuman(slotIndex, descriptor = {}) {
            return this._assignFighter('human', slotIndex, descriptor);
        }

        assignBot(slotIndex, descriptor = {}) {
            return this._assignFighter('bot', slotIndex, descriptor);
        }

        assignFighter(slotIndex, descriptor = {}) {
            const kind = descriptor.kind || descriptor.type || 'human';
            return this._assignFighter(kind, slotIndex, descriptor);
        }

        clearSlot(slotIndex, options = {}) {
            this._assertValidSlot(slotIndex);
            const fighterId = this.slots[slotIndex];
            if (!fighterId) return null;
            const fighter = this.fighters.get(fighterId);
            this.slots[slotIndex] = null;
            if (fighter) {
                fighter.slotIndex = null;
                if (options.removeFighter) {
                    this._removeFighterInternal(fighter, { forgetExternal: options.forgetExternal });
                } else {
                    this._emit(EVENT_NAMES.FIGHTER_UPDATED, { fighter: this._cloneFighter(fighter) });
                }
            }
            this._emit(EVENT_NAMES.SLOT_CHANGED, { slotIndex, fighter: null });
            this._emit(EVENT_NAMES.ROSTER_UPDATED, { reason: 'clear-slot', slotIndex, fighterId });
            return fighter ? this._cloneFighter(fighter) : null;
        }

        removeFighterById(fighterId, options = {}) {
            const fighter = this.fighters.get(fighterId);
            if (!fighter) return false;
            this._removeFighterInternal(fighter, options);
            return true;
        }

        removeFighters(predicate, options = {}) {
            if (typeof predicate !== 'function') return 0;
            let removed = 0;
            [...this.fighters.values()].forEach((fighter) => {
                if (predicate(fighter)) {
                    this._removeFighterInternal(fighter, options);
                    removed++;
                }
            });
            if (removed) {
                this._emit(EVENT_NAMES.ROSTER_UPDATED, { reason: 'bulk-remove', removed });
            }
            return removed;
        }

        reset(options = {}) {
            const { forgetExternal = false } = options;
            this.slots = new Array(this.maxSlots).fill(null);
            this.fighters.clear();
            if (forgetExternal) this.externalIdLookup.clear();
            this._emit(EVENT_NAMES.ROSTER_UPDATED, { reason: 'reset' });
        }

        getActiveBotCount(options = {}) {
            const list = this.getFighters({ includeUnassigned: !!options.includeUnassigned });
            return list.filter((fighter) => fighter && fighter.kind === 'bot').length;
        }

        ensureLobbyDefaults(config = {}) {
            const {
                hostName = 'Player 1',
                hostMetadata = {},
                isMultiplayer = false,
                ensureDefaultBot = true,
                botSlotIndex = 1,
                botName = 'Shot Bot',
                botMetadata = {}
            } = config;

            const hostExtras = Object.assign({ control: 'local', isHost: true }, hostMetadata || {});
            const slots = this.getSlots({ includeDetails: true });
            const slot0 = slots[0] || null;
            let hostFighter = slot0 && slot0.fighter ? slot0.fighter : null;

            if (!hostFighter || hostFighter.kind !== 'human') {
                hostFighter = this.assignHuman(0, {
                    name: hostName,
                    metadata: hostExtras
                });
            } else {
                const patch = {};
                if (hostFighter.name !== hostName) patch.name = hostName;
                patch.metadata = Object.assign({}, hostFighter.metadata || {}, hostExtras);
                hostFighter = this.updateFighter(hostFighter.id, patch);
            }

            if (!isMultiplayer && ensureDefaultBot) {
                const idx = Number.isFinite(botSlotIndex) ? Math.max(1, Math.min(this.maxSlots - 1, Math.floor(botSlotIndex))) : 1;
                const refreshedSlot = this.getSlots({ includeDetails: true })[idx] || null;
                if (!refreshedSlot || !refreshedSlot.fighter) {
                    this.assignBot(idx, {
                        name: botName,
                        metadata: Object.assign({ difficulty: 'normal' }, botMetadata || {})
                    });
                }
            }

            return hostFighter ? hostFighter.id : null;
        }

        toggleSlotState(slotIndex, options = {}) {
            this._assertValidSlot(slotIndex);
            const {
                placeholderName,
                placeholderMetadata,
                botName,
                botMetadata
            } = options;

            const slots = this.getSlots({ includeDetails: true });
            const slot = slots[slotIndex] || null;
            const defaultPlaceholderName = placeholderName || `Open Slot ${slotIndex + 1}`;
            const defaultBotName = botName || `Bot ${slotIndex + 1}`;
            const placeholderMeta = Object.assign({ placeholder: true }, placeholderMetadata || {});
            const botMeta = Object.assign({ difficulty: 'normal' }, botMetadata || {});

            if (!slot || !slot.fighter) {
                const fighter = this.assignHuman(slotIndex, {
                    name: defaultPlaceholderName,
                    metadata: placeholderMeta
                });
                return { action: 'assigned-placeholder', fighter };
            }

            const fighter = slot.fighter;
            if (fighter.kind === 'human' && fighter.metadata && fighter.metadata.placeholder) {
                const updated = this.assignBot(slotIndex, {
                    name: defaultBotName,
                    metadata: botMeta
                });
                return { action: 'assigned-bot', fighter: updated };
            }

            if (fighter.kind === 'bot') {
                const cleared = this.clearSlot(slotIndex, { removeFighter: true });
                return { action: 'cleared', fighter: cleared };
            }

            return { action: 'unchanged', fighter: this._cloneFighter(fighter) };
        }

        describeSlot(slotIndex, options = {}) {
            this._assertValidSlot(slotIndex);
            const slot = this.getSlots({ includeDetails: true })[slotIndex] || null;
            const fighter = slot ? slot.fighter : null;
            const includeTitle = options.includeTitle !== false;
            const response = {
                title: includeTitle ? `Slot ${slotIndex + 1}` : undefined,
                body: 'Unassigned',
                subtext: slotIndex === 0 ? 'Local player' : 'Click to assign',
                classes: ['empty']
            };

            if (!fighter) return response;

            response.classes = [fighter.kind];
            response.body = fighter.name || (fighter.kind === 'bot' ? 'AI Bot' : 'Player');

            if (fighter.metadata && fighter.metadata.control === 'local') {
                response.subtext = 'Controlled on this device';
            } else if (fighter.metadata && fighter.metadata.control === 'remote') {
                response.subtext = 'Remote player';
            } else if (fighter.kind === 'bot') {
                response.subtext = 'Host-controlled AI';
            } else if (fighter.metadata && fighter.metadata.placeholder) {
                response.subtext = 'Reserved slot';
            } else {
                response.subtext = slotIndex === 0 ? 'Local player' : 'Player';
            }

            if (fighter.metadata && fighter.metadata.isWorldMaster) {
                response.classes.push('worldmaster');
            }

            if (options.includeFighter) {
                response.fighter = fighter;
            }

            return response;
        }

        resetRoundState(options = {}) {
            const { clearScores = false } = options;
            let touched = false;
            this.fighters.forEach((fighter) => {
                if (fighter.isAlive === false || fighter.eliminatedAt) {
                    fighter.isAlive = true;
                    fighter.eliminatedAt = null;
                    touched = true;
                }
                if (clearScores && fighter.score) {
                    fighter.score = 0;
                    touched = true;
                }
            });
            if (touched) {
                this._emit(EVENT_NAMES.STATUS_CHANGED, { scope: 'round-reset' });
            }
        }

        markEliminated(fighterId, context = {}) {
            const fighter = this.fighters.get(fighterId);
            if (!fighter) return null;
            fighter.isAlive = false;
            fighter.eliminatedAt = {
                round: Number.isFinite(context.round) ? context.round : null,
                timestamp: typeof context.timestamp === 'number' ? context.timestamp : Date.now(),
                reason: context.reason || null
            };
            this._emit(EVENT_NAMES.STATUS_CHANGED, { fighter: this._cloneFighter(fighter), status: 'eliminated' });
            return this._cloneFighter(fighter);
        }

        markAlive(fighterId, context = {}) {
            const fighter = this.fighters.get(fighterId);
            if (!fighter) return null;
            fighter.isAlive = true;
            fighter.eliminatedAt = null;
            if (context.position) fighter.metadata.spawnPosition = cloneShallow(context.position);
            this._emit(EVENT_NAMES.STATUS_CHANGED, { fighter: this._cloneFighter(fighter), status: 'alive' });
            return this._cloneFighter(fighter);
        }

        setScore(fighterId, score) {
            const fighter = this.fighters.get(fighterId);
            if (!fighter) return null;
            const newScore = Number.isFinite(score) ? score : 0;
            if (fighter.score !== newScore) {
                fighter.score = newScore;
                this._emit(EVENT_NAMES.SCORE_CHANGED, { fighterId, score: fighter.score });
            }
            return fighter.score;
        }

        incrementScore(fighterId, delta = 1) {
            const fighter = this.fighters.get(fighterId);
            if (!fighter) return null;
            const inc = Number.isFinite(delta) ? delta : 0;
            fighter.score = (fighter.score || 0) + inc;
            this._emit(EVENT_NAMES.SCORE_CHANGED, { fighterId, score: fighter.score });
            return fighter.score;
        }

        updateFighter(fighterId, patch = {}) {
            const fighter = this.fighters.get(fighterId);
            if (!fighter) return null;
            this._applyDescriptorToFighter(fighter, patch);
            this._emit(EVENT_NAMES.FIGHTER_UPDATED, { fighter: this._cloneFighter(fighter) });
            return this._cloneFighter(fighter);
        }

        setEntityReference(fighterId, entity) {
            const fighter = this.fighters.get(fighterId);
            if (!fighter) return null;
            fighter.entity = entity || null;
            return fighter.entity;
        }

        getEntityReference(fighterId) {
            const fighter = this.fighters.get(fighterId);
            return fighter ? fighter.entity || null : null;
        }

        toSerializable(options = {}) {
            const includeEntity = !!options.includeEntity;
            return {
                maxSlots: this.maxSlots,
                slots: this.getSlots({ includeDetails: false }),
                fighters: this.getFighters({ includeUnassigned: true, includeEntity })
            };
        }

        importSerializable(data, options = {}) {
            if (!data || typeof data !== 'object') return;
            const { maxSlots = this.maxSlots, slots = [], fighters = [] } = data;
            this.maxSlots = Math.max(1, Math.floor(maxSlots));
            this.slots = new Array(this.maxSlots).fill(null);
            this.fighters.clear();
            if (!options.preserveExternalIds) this.externalIdLookup.clear();

            fighters.forEach((f) => {
                if (!f) return;
                const fighter = this._createFighterRecord(f.kind || 'human', f.slotIndex, f);
                this.fighters.set(fighter.id, fighter);
                if (fighter.externalId) this.externalIdLookup.set(fighter.externalId, fighter.id);
            });

            slots.forEach((slot) => {
                if (!slot || typeof slot.index !== 'number') return;
                const idx = slot.index;
                if (idx < 0 || idx >= this.maxSlots) return;
                const fighterId = slot.fighterId;
                if (fighterId && this.fighters.has(fighterId)) {
                    this.slots[idx] = fighterId;
                    const fighter = this.fighters.get(fighterId);
                    fighter.slotIndex = idx;
                }
            });

            this._emit(EVENT_NAMES.ROSTER_UPDATED, { reason: 'import' });
        }

        applyLegacyAssignments(assignments = [], options = {}) {
            const keepIds = new Set();
            assignments.forEach((assignment) => {
                if (!assignment) return;
                const slotIndex = Number.isInteger(assignment.slotIndex) ? assignment.slotIndex : this._findFirstOpenSlot();
                if (slotIndex < 0) return;
                const result = this.assignFighter(slotIndex, assignment);
                if (result && result.externalId) keepIds.add(this._normalizeExternalId(result.externalId));
            });
            if (options.removeMissingExternalIds) {
                const removed = [];
                this.externalIdLookup.forEach((fighterId, externalId) => {
                    if (keepIds.has(externalId)) return;
                    const fighter = this.fighters.get(fighterId);
                    if (fighter && options.externalIdFilter && !options.externalIdFilter(fighter)) return;
                    if (fighter && (!options.externalIdPrefix || (fighter.externalId || '').startsWith(options.externalIdPrefix))) {
                        this._removeFighterInternal(fighter, { forgetExternal: true });
                        removed.push(fighterId);
                    }
                });
                if (removed.length) {
                    this._emit(EVENT_NAMES.ROSTER_UPDATED, { reason: 'legacy-prune', removed });
                }
            }
        }

        _assignFighter(kind, slotIndex, descriptor = {}, internalOptions = {}) {
            this._assertValidSlot(slotIndex);
            const normalizedKind = (kind || 'human').toLowerCase();
            const externalId = this._normalizeExternalId(descriptor.externalId || descriptor.legacyId || null);
            let fighter = null;

            if (descriptor.id && this.fighters.has(descriptor.id)) {
                fighter = this.fighters.get(descriptor.id);
            } else if (externalId && this.externalIdLookup.has(externalId)) {
                const fighterId = this.externalIdLookup.get(externalId);
                fighter = this.fighters.get(fighterId) || null;
            }

            const previousSlotOccupant = this.slots[slotIndex] ? this.fighters.get(this.slots[slotIndex]) : null;

            if (!fighter) {
                fighter = this._createFighterRecord(normalizedKind, slotIndex, descriptor);
                this.fighters.set(fighter.id, fighter);
                if (externalId) {
                    fighter.externalId = externalId;
                    this.externalIdLookup.set(externalId, fighter.id);
                }
                if (previousSlotOccupant && previousSlotOccupant !== fighter) {
                    previousSlotOccupant.slotIndex = null;
                    this._emit(EVENT_NAMES.SLOT_CHANGED, { slotIndex, fighter: null });
                }
                this.slots[slotIndex] = fighter.id;
                fighter.slotIndex = slotIndex;
                if (!internalOptions.silent) {
                    this._emit(EVENT_NAMES.FIGHTER_ADDED, { fighter: this._cloneFighter(fighter) });
                    this._emit(EVENT_NAMES.SLOT_CHANGED, { slotIndex, fighter: this._cloneFighter(fighter) });
                    this._emit(EVENT_NAMES.ROSTER_UPDATED, { reason: 'assign', slotIndex, fighterId: fighter.id });
                }
            } else {
                if (externalId && !fighter.externalId) {
                    fighter.externalId = externalId;
                    this.externalIdLookup.set(externalId, fighter.id);
                }
                if (previousSlotOccupant && previousSlotOccupant !== fighter) {
                    previousSlotOccupant.slotIndex = null;
                    this._emit(EVENT_NAMES.SLOT_CHANGED, { slotIndex, fighter: null });
                }
                const previousSlot = fighter.slotIndex;
                if (typeof previousSlot === 'number' && previousSlot >= 0 && previousSlot !== slotIndex && this.slots[previousSlot] === fighter.id) {
                    this.slots[previousSlot] = null;
                    this._emit(EVENT_NAMES.SLOT_CHANGED, { slotIndex: previousSlot, fighter: null });
                }
                this.slots[slotIndex] = fighter.id;
                fighter.slotIndex = slotIndex;
                this._applyDescriptorToFighter(fighter, Object.assign({}, descriptor, { kind: normalizedKind }));
                if (!internalOptions.silent) {
                    this._emit(EVENT_NAMES.FIGHTER_UPDATED, { fighter: this._cloneFighter(fighter) });
                    this._emit(EVENT_NAMES.SLOT_CHANGED, { slotIndex, fighter: this._cloneFighter(fighter) });
                    this._emit(EVENT_NAMES.ROSTER_UPDATED, { reason: 'assign-update', slotIndex, fighterId: fighter.id });
                }
            }

            return this._cloneFighter(fighter);
        }

        _createFighterRecord(kind, slotIndex, descriptor = {}) {
            const fighterId = descriptor.id && Number.isFinite(descriptor.id) ? descriptor.id : this._allocateFighterId();
            const name = descriptor.name || descriptor.displayName || this._suggestName(kind, fighterId);
            const color = descriptor.color || this._defaultColorForSlot(slotIndex);
            const controller = descriptor.controller ? cloneShallow(descriptor.controller) : this._inferController(kind, descriptor);

            const fighter = {
                id: fighterId,
                kind,
                slotIndex: Number.isInteger(slotIndex) ? slotIndex : null,
                name,
                color,
                controller,
                isAlive: descriptor.isAlive !== undefined ? !!descriptor.isAlive : true,
                eliminatedAt: descriptor.eliminatedAt ? cloneShallow(descriptor.eliminatedAt) : null,
                score: Number.isFinite(descriptor.score) ? descriptor.score : 0,
                metadata: descriptor.metadata ? cloneShallow(descriptor.metadata) : {},
                entity: descriptor.entity || null,
                externalId: this._normalizeExternalId(descriptor.externalId || descriptor.legacyId || null)
            };
            return fighter;
        }

        _removeFighterInternal(fighter, options = {}) {
            if (!fighter) return;
            const { forgetExternal = false } = options;
            if (typeof fighter.slotIndex === 'number' && fighter.slotIndex >= 0 && fighter.slotIndex < this.maxSlots) {
                if (this.slots[fighter.slotIndex] === fighter.id) {
                    this.slots[fighter.slotIndex] = null;
                    this._emit(EVENT_NAMES.SLOT_CHANGED, { slotIndex: fighter.slotIndex, fighter: null });
                }
            }
            if (fighter.externalId && forgetExternal) {
                this.externalIdLookup.delete(fighter.externalId);
            }
            this.fighters.delete(fighter.id);
            this._emit(EVENT_NAMES.FIGHTER_REMOVED, { fighter: this._cloneFighter(fighter) });
            this._emit(EVENT_NAMES.ROSTER_UPDATED, { reason: 'remove', fighterId: fighter.id });
        }

        _applyDescriptorToFighter(fighter, descriptor = {}) {
            if (!fighter || !descriptor) return;
            if (descriptor.name) fighter.name = descriptor.name;
            if (descriptor.displayName) fighter.name = descriptor.displayName;
            if (descriptor.color) fighter.color = descriptor.color;
            if (descriptor.kind || descriptor.type) fighter.kind = (descriptor.kind || descriptor.type).toLowerCase();
            if (descriptor.controller) fighter.controller = cloneShallow(descriptor.controller);
            if (descriptor.metadata) {
                fighter.metadata = Object.assign({}, fighter.metadata, cloneShallow(descriptor.metadata));
            }
            if (descriptor.entity !== undefined) fighter.entity = descriptor.entity;
            if (descriptor.score !== undefined && Number.isFinite(descriptor.score)) fighter.score = descriptor.score;
            if (descriptor.isAlive !== undefined) fighter.isAlive = !!descriptor.isAlive;
            if (descriptor.eliminatedAt !== undefined) fighter.eliminatedAt = descriptor.eliminatedAt ? cloneShallow(descriptor.eliminatedAt) : null;
            if (descriptor.externalId) {
                const normalized = this._normalizeExternalId(descriptor.externalId);
                if (normalized && normalized !== fighter.externalId) {
                    if (fighter.externalId) this.externalIdLookup.delete(fighter.externalId);
                    fighter.externalId = normalized;
                    this.externalIdLookup.set(normalized, fighter.id);
                }
            }
        }

        _cloneFighter(fighter, options = {}) {
            if (!fighter) return null;
            const clone = {
                id: fighter.id,
                kind: fighter.kind,
                slotIndex: fighter.slotIndex,
                name: fighter.name,
                color: fighter.color,
                controller: fighter.controller ? cloneShallow(fighter.controller) : null,
                isAlive: fighter.isAlive !== false,
                eliminatedAt: fighter.eliminatedAt ? cloneShallow(fighter.eliminatedAt) : null,
                score: fighter.score || 0,
                metadata: fighter.metadata ? cloneShallow(fighter.metadata) : {},
                externalId: fighter.externalId || null
            };
            if (options.includeEntity) {
                clone.entity = fighter.entity || null;
            }
            return clone;
        }

        _emit(eventName, payload) {
            const handlers = this.listeners.get(eventName);
            if (!handlers || !handlers.size) return;
            handlers.forEach((handler) => {
                try {
                    handler(payload, this);
                } catch (err) {
                    if (typeof console !== 'undefined' && console.warn) {
                        console.warn('[PlayerRoster] listener error for', eventName, err);
                    }
                }
            });
        }

        _assertValidSlot(slotIndex) {
            if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= this.maxSlots) {
                throw new RangeError(`[PlayerRoster] Slot index ${slotIndex} is out of range (0-${this.maxSlots - 1}).`);
            }
        }

        _findFirstOpenSlot() {
            for (let i = 0; i < this.maxSlots; i++) {
                if (!this.slots[i]) return i;
            }
            return -1;
        }

        _normalizeExternalId(externalId) {
            if (!externalId) return null;
            return String(externalId).trim().toLowerCase();
        }

        _allocateFighterId() {
            let candidate = this.nextFighterId++;
            while (this.fighters.has(candidate)) {
                candidate = this.nextFighterId++;
            }
            return candidate;
        }

        _suggestName(kind, fighterId) {
            const base = kind === 'bot' ? 'Bot' : 'Player';
            return `${base} ${fighterId}`;
        }

        _defaultColorForSlot(slotIndex) {
            const palette = ['#65c6ff', '#ff5a5a', '#ffe066', '#9b59b6'];
            return palette[slotIndex % palette.length];
        }

        _inferController(kind, descriptor = {}) {
            if (descriptor.controller) return cloneShallow(descriptor.controller);
            if (kind === 'bot') return { type: 'bot' };
            if (descriptor.isLocal || descriptor.local === true) return { type: 'local' };
            if (descriptor.remote === true || descriptor.role === 'joiner' || descriptor.role === 'host') {
                return { type: 'remote', role: descriptor.role || null };
            }
            return { type: 'local' };
        }
    }

    globalObj.PlayerRoster = PlayerRoster;
    try {
        if (typeof module !== 'undefined' && module.exports) {
            module.exports = PlayerRoster;
        }
    } catch (err) {
        /* no-op */
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
