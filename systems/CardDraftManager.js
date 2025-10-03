;(function(root) {
    const globalObj = root || (typeof globalThis !== 'undefined' ? globalThis : this);

    const EVENT_NAMES = {
        DRAFT_STARTED: 'draft-started',
        DRAFT_UPDATED: 'draft-updated',
        SELECTION_RECORDED: 'selection-recorded',
        DRAFT_COMPLETED: 'draft-completed',
        DRAFT_RESET: 'draft-reset'
    };

    class CardDraftManager {
        constructor(options = {}) {
            this.listeners = new Map();
            this.active = false;
            this.roundNumber = 0;
            this.participants = [];
            this.pendingParticipants = [];
            this.completedSelections = [];
            this.cardsByFighter = new Map();
            this.metadata = {};
            this.options = {
                autoAdvance: options.autoAdvance !== false,
                maxSelectionsPerFighter: options.maxSelectionsPerFighter || 1
            };
            this.cardPoolProvider = typeof options.cardPoolProvider === 'function' ? options.cardPoolProvider : null;
            this.roster = options.roster || null;
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
            if (!handler) {
                this.listeners.delete(eventName);
                return;
            }
            const set = this.listeners.get(eventName);
            set.delete(handler);
            if (!set.size) this.listeners.delete(eventName);
        }

        once(eventName, handler) {
            if (typeof handler !== 'function') return () => {};
            const wrapped = (...args) => {
                try { handler.apply(this, args); } finally { this.off(eventName, wrapped); }
            };
            return this.on(eventName, wrapped);
        }

        attachRoster(roster) {
            this.roster = roster || null;
        }

        startDraft(options = {}) {
            const { participants, roundNumber = 0, cardsByFighter = null, metadata = {} } = options;
            const participantList = Array.isArray(participants) && participants.length
                ? participants.slice()
                : this._inferParticipants();
            if (!participantList.length) {
                throw new Error('[CardDraftManager] Cannot start draft without participants.');
            }

            this.active = true;
            this.roundNumber = roundNumber;
            this.participants = participantList;
            this.pendingParticipants = participantList.slice();
            this.completedSelections = [];
            this.cardsByFighter = new Map();
            this.metadata = Object.assign({}, metadata);

            if (cardsByFighter) {
                Object.keys(cardsByFighter).forEach((key) => {
                    this.cardsByFighter.set(String(key), [].concat(cardsByFighter[key] || []));
                });
            } else if (this.cardPoolProvider) {
                this.pendingParticipants.forEach((fighterId) => {
                    const cards = this.cardPoolProvider(fighterId, { roundNumber });
                    this.cardsByFighter.set(String(fighterId), cards ? [].concat(cards) : []);
                });
            }

            this._emit(EVENT_NAMES.DRAFT_STARTED, this.getState());
            return this.getState();
        }

        cancelDraft(options = {}) {
            if (!this.active) return;
            const stateBefore = this.getState();
            this._resetInternal({ reason: options.reason || 'cancelled' });
            this._emit(EVENT_NAMES.DRAFT_RESET, { reason: options.reason || 'cancelled', previous: stateBefore });
        }

        recordSelection(fighterId, selection, selectionMeta = {}) {
            if (!this.active) throw new Error('[CardDraftManager] No active draft.');
            const normalizedId = this._normalizeId(fighterId);
            if (!normalizedId) throw new Error('[CardDraftManager] Invalid fighter id.');
            if (!this.pendingParticipants.includes(normalizedId)) {
                return { success: false, reason: 'already-completed' };
            }

            const cards = this.cardsByFighter.get(normalizedId) || [];
            let selectionRecord = null;
            if (selection === null || selection === undefined) {
                selectionRecord = { fighterId: normalizedId, skipped: true, timestamp: Date.now(), metadata: Object.assign({ reason: 'manual-skip' }, selectionMeta) };
            } else {
                const cardId = typeof selection === 'object' ? selection.id || selection.cardId : selection;
                selectionRecord = {
                    fighterId: normalizedId,
                    cardId,
                    card: typeof selection === 'object' ? Object.assign({}, selection) : { id: cardId },
                    metadata: Object.assign({}, selectionMeta),
                    timestamp: Date.now()
                };
                if (selectionRecord.card && !selectionRecord.card.id) {
                    selectionRecord.card.id = cardId;
                }
                if (cards.length && cardId != null) {
                    const found = cards.find((c) => String(c.id || c.cardId) === String(cardId));
                    if (!found) {
                        selectionRecord.metadata.missingFromPool = true;
                    }
                }
            }

            this.completedSelections.push(selectionRecord);
            this.pendingParticipants = this.pendingParticipants.filter((id) => id !== normalizedId);
            if (this.options.autoAdvance && !this.pendingParticipants.length) {
                this._completeDraft({ reason: 'auto-complete' });
            } else {
                this._emit(EVENT_NAMES.SELECTION_RECORDED, { selection: selectionRecord, remaining: this.pendingParticipants.slice() });
                this._emit(EVENT_NAMES.DRAFT_UPDATED, this.getState());
            }
            return { success: true, selection: selectionRecord };
        }

        getCardsForFighter(fighterId) {
            const normalizedId = this._normalizeId(fighterId);
            if (!normalizedId) return [];
            return (this.cardsByFighter.get(normalizedId) || []).slice();
        }

        setCardsForFighter(fighterId, cards = []) {
            const normalizedId = this._normalizeId(fighterId);
            if (!normalizedId) return;
            this.cardsByFighter.set(normalizedId, [].concat(cards || []));
            if (this.active) {
                this._emit(EVENT_NAMES.DRAFT_UPDATED, this.getState());
            }
        }

        isParticipantPending(fighterId) {
            const normalizedId = this._normalizeId(fighterId);
            return normalizedId ? this.pendingParticipants.includes(normalizedId) : false;
        }

        hasActiveDraft() {
            return !!this.active;
        }

        getState() {
            return {
                active: this.active,
                roundNumber: this.roundNumber,
                participants: this.participants.slice(),
                pendingParticipants: this.pendingParticipants.slice(),
                completedSelections: this.completedSelections.map((selection) => Object.assign({}, selection, { metadata: Object.assign({}, selection.metadata) })),
                cardsByFighter: this._serializeCardsByFighter(),
                metadata: Object.assign({}, this.metadata)
            };
        }

        toNetworkPayload(options = {}) {
            const state = this.getState();
            if (options && options.omitCardPools) {
                state.cardsByFighter = undefined;
            }
            return state;
        }

        syncFromNetwork(payload = {}) {
            if (!payload || typeof payload !== 'object') return;
            this.active = !!payload.active;
            this.roundNumber = Number.isFinite(payload.roundNumber) ? payload.roundNumber : this.roundNumber;
            if (Array.isArray(payload.participants)) this.participants = payload.participants.slice();
            if (Array.isArray(payload.pendingParticipants)) this.pendingParticipants = payload.pendingParticipants.slice();
            if (Array.isArray(payload.completedSelections)) this.completedSelections = payload.completedSelections.map((selection) => Object.assign({}, selection, { metadata: Object.assign({}, selection.metadata) }));
            if (payload.cardsByFighter) this._hydrateCardsByFighter(payload.cardsByFighter);
            if (payload.metadata) this.metadata = Object.assign({}, this.metadata, payload.metadata);
            this._emit(EVENT_NAMES.DRAFT_UPDATED, this.getState());
        }

        _completeDraft(context = {}) {
            if (!this.active) return;
            const state = this.getState();
            this.active = false;
            this._emit(EVENT_NAMES.DRAFT_COMPLETED, { state, reason: context.reason || null });
        }

        _resetInternal(context = {}) {
            this.active = false;
            this.roundNumber = 0;
            this.participants = [];
            this.pendingParticipants = [];
            this.completedSelections = [];
            this.cardsByFighter = new Map();
            this.metadata = {};
            if (context.reason) {
                this.metadata.reason = context.reason;
            }
        }

        _serializeCardsByFighter() {
            const result = {};
            this.cardsByFighter.forEach((cards, fighterId) => {
                result[fighterId] = [].concat(cards || []);
            });
            return result;
        }

        _hydrateCardsByFighter(raw) {
            this.cardsByFighter = new Map();
            Object.keys(raw || {}).forEach((fighterId) => {
                this.cardsByFighter.set(String(fighterId), [].concat(raw[fighterId] || []));
            });
        }

        _normalizeId(id) {
            if (id === null || id === undefined) return null;
            return String(id);
        }

        _inferParticipants() {
            if (!this.roster || typeof this.roster.getLivingFighters !== 'function') return [];
            return this.roster.getLivingFighters({ includeUnassigned: false }).map((fighter) => String(fighter.id));
        }

        _emit(eventName, payload) {
            const handlers = this.listeners.get(eventName);
            if (!handlers || !handlers.size) return;
            handlers.forEach((handler) => {
                try {
                    handler(payload, this);
                } catch (err) {
                    if (typeof console !== 'undefined' && console.warn) {
                        console.warn('[CardDraftManager] listener error for', eventName, err);
                    }
                }
            });
        }
    }

    globalObj.CardDraftManager = CardDraftManager;
    try {
        if (typeof module !== 'undefined' && module.exports) {
            module.exports = CardDraftManager;
        }
    } catch (err) {
        /* no-op */
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
