// --- WorldMaster Network Sync Stubs ---
if (!window.gameWorldMaster) window.gameWorldMaster = {};
window.gameWorldMaster.syncCardDecksFromNet = function(data) {
    // data: { type: 'worldmaster-card-toggle', cardType: 'mod'|'powerup', name, enabled }
    if (!window.gameWorldMasterInstance) return;
    if (data.cardType === 'mod') {
        if (data.enabled) {
            window.gameWorldMasterInstance.availableWorldMods.add(data.name);
            // Sync activeWorldModifiers for joiner so badge updates
            if (typeof window.activeWorldModifiers !== 'undefined' && Array.isArray(window.activeWorldModifiers)) {
                if (!window.activeWorldModifiers.includes(data.name)) {
                    window.activeWorldModifiers.push(data.name);
                }
            }
        } else {
            window.gameWorldMasterInstance.availableWorldMods.delete(data.name);
            // Remove from activeWorldModifiers for joiner
            if (typeof window.activeWorldModifiers !== 'undefined' && Array.isArray(window.activeWorldModifiers)) {
                window.activeWorldModifiers = window.activeWorldModifiers.filter(m => m !== data.name);
            }
        }
    } else if (data.cardType === 'powerup') {
        if (data.enabled) {
            window.gameWorldMasterInstance.availablePowerups.add(data.name);
        } else {
            window.gameWorldMasterInstance.availablePowerups.delete(data.name);
        }
    }
    // --- Obstacle chunk burning spread (host only) ---
    if (NET && NET.role !== 'joiner' && Array.isArray(obstacles) && obstacles.length) {
        let spreadChecks = 0;
        const MAX_SPREAD_CHECKS = 3000;
        const MAX_NEW_IGNITED = 20;
        let newIgnited = 0;
        for (let oi = 0; oi < obstacles.length; oi++) {
            const o = obstacles[oi];
            if (!o || !o.chunks) continue;
            for (let ci = 0; ci < o.chunks.length; ci++) {
                const c = o.chunks[ci];
                if (!c || c.destroyed || !c.burning || c.burning.time <= 0.4) continue;
                // Attempt to ignite nearby chunks across all obstacles
                for (let oi2 = 0; oi2 < obstacles.length; oi2++) {
                    const o2 = obstacles[oi2];
                    if (!o2 || !o2.chunks) continue;
                    for (let ci2 = 0; ci2 < o2.chunks.length; ci2++) {
                        if (newIgnited >= MAX_NEW_IGNITED) break;
                        spreadChecks++;
                        if (spreadChecks > MAX_SPREAD_CHECKS) break;
                        if (oi === oi2 && ci === ci2) continue;
                        const c2 = o2.chunks[ci2];
                        if (!c2 || c2.destroyed || c2.burning) continue;
                        const d = dist(c.x + c.w/2, c.y + c.h/2, c2.x + c2.w/2, c2.y + c2.h/2);
                        const maxDist = Math.max(c.w, c.h) * 1.6;
                        if (d <= maxDist) {
                            const sourcePower = (c.burning && c.burning.power) ? c.burning.power : 1;
                            // probability scales with source power; slight boost for higher-power sources
                            const prob = Math.min(0.7, 0.12 * sourcePower + 0.05 * Math.random());
                            if (Math.random() < prob) {
                                // per-target randomized dissipation multiplier so some chains burn stronger
                                const dissipation = 0.5 + Math.random() * 0.45; // 0.5 .. 0.95
                                const newPower = Math.max(0.18, sourcePower * dissipation);
                                // duration also gets a random multiplier influenced by dissipation
                                const newDur = Math.max(0.9, (c.burning.duration || 2.0) * (0.6 + Math.random() * 0.7) * (0.5 + dissipation * 0.8));
                                c2.burning = { time: 0, duration: newDur, power: newPower, nextTick: 0 };
                                // initialize flameParticles so joiner draw shows them immediately
                                c2.flameParticles = c2.flameParticles || [];
                                // Emit event for joiners
                                try { if (NET && NET.role === 'host' && NET.connected && typeof GameEvents !== 'undefined') {
                                    GameEvents.emit('burning-start', { obstacleIndex: oi2, chunkIndex: ci2, duration: newDur, power: newPower });
                                } } catch (e) {}
                                newIgnited++;
                            }
                        }
                    }
                    if (spreadChecks > MAX_SPREAD_CHECKS || newIgnited >= MAX_NEW_IGNITED) break;
                }
                if (spreadChecks > MAX_SPREAD_CHECKS || newIgnited >= MAX_NEW_IGNITED) break;
            }
            if (spreadChecks > MAX_SPREAD_CHECKS || newIgnited >= MAX_NEW_IGNITED) break;
        }
    }
    // Always force badge/effects UI to update for joiner
    if (window.gameWorldMasterInstance.ui) {
        window.gameWorldMasterInstance.ui.updateCardDecks && window.gameWorldMasterInstance.ui.updateCardDecks();
        if (typeof window.gameWorldMasterInstance.ui.renderActiveEffects === 'function') {
            window.gameWorldMasterInstance.ui.renderActiveEffects();
        }
    }
};
window.gameWorldMaster.syncControlStateFromNet = function(data) {
    // data: { type: 'worldmaster-control', effectName }
    if (!window.gameWorldMasterInstance) return;
    // Apply remote control state without causing a network echo
    try {
        if (data.effectName) {
            // Set controlled effect but do not network this change back
            if (typeof window.gameWorldMasterInstance.setControlledEffect === 'function') {
                window.gameWorldMasterInstance.setControlledEffect(data.effectName, false);
            } else {
                window.gameWorldMasterInstance.controlledEffect = data.effectName;
                if (window.gameWorldMasterInstance.ui) window.gameWorldMasterInstance.ui.updateControlledEffect(data.effectName);
            }
        } else {
            if (typeof window.gameWorldMasterInstance.clearControlledEffect === 'function') {
                window.gameWorldMasterInstance.clearControlledEffect(false);
            } else {
                window.gameWorldMasterInstance.controlledEffect = null;
                if (window.gameWorldMasterInstance.ui) window.gameWorldMasterInstance.ui.updateControlledEffect(null);
            }
        }
    } catch (e) { console.warn('Error applying remote WM control state', e); }
};
window.gameWorldMaster.syncActionFromNet = function(data) {
    // data: { type: 'worldmaster-action', effectName, x, y }
    if (!window.gameWorldMasterInstance) return;
    // Only trigger if not local world master
    if (window.gameWorldMasterInstance.isLocal) return;
    try {
        logDev('[WORLDMASTER ACTION] Received action from remote WM:', data.effectName, data.x, data.y);
        window.gameWorldMasterInstance.controlledEffect = data.effectName;
        const success = window.gameWorldMasterInstance.executeControlledEffect(data.x, data.y);
        // If action was successful, start server-side cooldown
        if (success) {
            const cd = window.gameWorldMasterInstance.effectCooldowns.get(data.effectName);
            if (cd) cd.current = cd.max;
            if (window.gameWorldMasterInstance.ui) window.gameWorldMasterInstance.ui.updateCooldowns(window.gameWorldMasterInstance.effectCooldowns);
        }
    } catch (e) { console.warn('Error handling remote worldmaster action', e); }
};
// --- World Modifier Card UI ---
function showWorldModifierCards() {
    cardState.active = true;
    let div = document.getElementById('card-choices');
    div.innerHTML = '';
    // World modifier deck (do not permanently hide modifiers that are currently active)
    let modDeck = WORLD_MODIFIERS;
    try {
        if (window.WorldMasterIntegration && typeof window.WorldMasterIntegration.getFilteredWorldModifiers === 'function') {
            const filtered = window.WorldMasterIntegration.getFilteredWorldModifiers(WORLD_MODIFIERS) || [];
            if (Array.isArray(filtered) && filtered.length) {
                modDeck = filtered;
            }
        }
    } catch (e) { console.warn('[WORLDMASTER] Failed to filter world modifier deck:', e); }
        // Increase base alpha and size multipliers so trailSizeScale and trailAlphaScale have stronger effect.
        const alpha = (0.01 + 0.09 * tnorm) * (b.trailAlphaScale || 1);
        // Size is influenced by bullet radius, tnorm (older points smaller), and trailSizeScale for damage.
        const size = b.radius * (0.08 + 0.6 * tnorm) * (b.trailSizeScale || 1);
    let pool = modDeck.slice();
    if (!pool.length) {
        console.warn('[WORLDMASTER] No enabled world modifiers remaining; reverting to full deck for chooser.');
        pool = WORLD_MODIFIERS;
    }
    const selectionCount = Math.min(3, pool.length);
    let choices = randomChoice(pool, selectionCount);
    if (selectionCount < 3 && Array.isArray(WORLD_MODIFIERS)) {
        const fallbackPool = WORLD_MODIFIERS.slice();
        while (choices.length < 3 && fallbackPool.length) {
            const extra = fallbackPool.splice(randInt(0, fallbackPool.length-1), 1)[0];
            if (extra && !choices.includes(extra)) choices.push(extra);
        }
    }
    // Side-by-side layout
    const cardWidth = 220;
    const cardHeight = 260;
        for (let i = 0; i < choices.length; ++i) {
        let opt = choices[i];
        let card = document.createElement('div');
        card.className = "card card-uniform world-modifier";
        card.innerHTML = `<b>${opt.name}</b><br><small>${opt.desc}</small>`;
        card.style.position = 'absolute';
        card.style.left = `calc(50% + ${(i-1)*cardWidth*1.1}px)`;
        card.style.top = '50%';
        card.style.width = cardWidth + 'px';
        card.style.height = cardHeight + 'px';
    card.style.transform = 'translate(-50%, -50%)';
        card.onclick = () => {
            Array.from(div.children).forEach(c => c.classList.remove('selected', 'centered'));
            card.classList.add('selected', 'centered');
            // Immediately broadcast highlight to joiners
            try {
                if (NET && NET.role === 'host' && NET.connected && window.ws && window.ws.readyState === WebSocket.OPEN) {
                    window.ws.send(JSON.stringify({ type: 'relay', data: { type: 'card-apply', pickerRole: NET.role, card: opt.name, highlight: true } }));
                }
            } catch (e) {}
            setTimeout(() => {
                // ...existing code...
                if (usedWorldModifiers[opt.name]) {
                    // ...existing code...
                } else {
                    // ...existing code...
                }
                div.style.display = "none";
                div.innerHTML = '';
                div.removeAttribute('style');
                div.classList.remove('card-bg-visible');
                cardState.active = false;
                waitingForCard = false;
            }, 220);
        };
        div.appendChild(card);
    }
    div.style.display = "flex";
    div.style.position = 'absolute';
    div.style.left = '50%';
    div.style.top = '50%';
    div.style.transform = 'translate(-50%, -50%)';
    div.style.height = '320px';
    div.style.width = '900px';
}

// --- Worldmaster Setup Overlay Logic ---
let worldMasterEnabled = false;
let worldMasterPlayerIndex = null; // null = none, 0 = host, 1 = joiner1, 2 = joiner2
let isMultiplayer = false;
let lobbyPlayers = [];

// --- Fighter Roster & Lifecycle Managers ---
const playerRoster = (() => {
    try {
        if (window.playerRoster instanceof PlayerRoster) return window.playerRoster;
    const roster = new PlayerRoster({ maxSlots: 5 });
        window.playerRoster = roster;
        return roster;
    } catch (err) {
        console.error('[Roster] Failed to bootstrap PlayerRoster', err);
        const fallback = {
            getSlots: () => [],
            assignHuman: () => null,
            assignBot: () => null,
            clearSlot: () => null,
            on: () => () => {},
            ensureLobbyDefaults: () => null,
            getActiveBotCount: () => 0,
            describeSlot: () => ({ body: 'Unavailable', subtext: '', classes: ['empty'], fighter: null }),
            toggleSlotState: () => ({ action: 'noop', fighter: null })
        };
        window.playerRoster = fallback;
        return fallback;
    }
})();

// Listen for score changes to sync in multiplayer
if (playerRoster && typeof playerRoster.on === 'function') {
    playerRoster.on('score-changed', (data) => {
        if (NET && NET.role === 'host' && NET.connected && window.ws && window.ws.readyState === WebSocket.OPEN) {
            try {
                window.ws.send(JSON.stringify({ type: 'relay', data: { type: 'score-update', fighterId: data.fighterId, score: data.score } }));
            } catch (e) {}
        }
    });
}

const matchLifecycleManager = (() => {
    try {
        if (window.matchLifecycleManager instanceof MatchLifecycleManager) return window.matchLifecycleManager;
        const mgr = new MatchLifecycleManager({ roster: playerRoster });
        window.matchLifecycleManager = mgr;
        return mgr;
    } catch (err) {
        console.warn('[Lifecycle] Failed to initialize MatchLifecycleManager', err);
        return null;
    }
})();

const cardDraftManager = (() => {
    try {
        if (window.cardDraftManager instanceof CardDraftManager) return window.cardDraftManager;
        const mgr = new CardDraftManager({ roster: playerRoster });
        window.cardDraftManager = mgr;
        return mgr;
    } catch (err) {
        console.warn('[Draft] Failed to initialize CardDraftManager', err);
        return null;
    }
})();

const roundFlowState = {
    eliminationQueue: [],
    processedEliminations: new Set(),
    awaitingCardSelection: false,
    awaitingCardFighterId: null,
    awaitingCardEntity: null,
    awaitingCardChooserRole: null,
    awaitingCardSlotIndex: null,
    awaitingCardJoinerIndex: null,
    roundTransitionActive: false,
    eliminationOrder: [],
    nextRoundTimeout: null,
    pendingWorldModOffer: null
};

function coerceJoinerIndex(value) {
    if (Number.isInteger(value) && value >= 0) return value;
    if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
    }
    return null;
}

function resetRoundFlowState(options = {}) {
    roundFlowState.eliminationQueue.length = 0;
    roundFlowState.processedEliminations.clear();
    roundFlowState.awaitingCardSelection = false;
    roundFlowState.awaitingCardFighterId = null;
    roundFlowState.awaitingCardEntity = null;
    roundFlowState.awaitingCardChooserRole = null;
    roundFlowState.awaitingCardSlotIndex = null;
    roundFlowState.awaitingCardJoinerIndex = null;
    roundFlowState.eliminationOrder = [];
    roundFlowState.pendingWorldModOffer = null;
    if (!options.keepTransition) {
        roundFlowState.roundTransitionActive = false;
    }
    if (roundFlowState.nextRoundTimeout) {
        clearTimeout(roundFlowState.nextRoundTimeout);
        roundFlowState.nextRoundTimeout = null;
    }
}


function beginRoundLifecycle(reason) {
    resetRoundFlowState();
    try {
        if (cardDraftManager && typeof cardDraftManager.cancelDraft === 'function' && cardDraftManager.hasActiveDraft && cardDraftManager.hasActiveDraft()) {
            cardDraftManager.cancelDraft({ reason: reason || 'round-reset' });
        }
    } catch (err) {
        console.warn('[Draft] Failed to cancel draft during round reset', err);
    }
    try {
        if (playerRoster && typeof playerRoster.resetRoundState === 'function') {
            playerRoster.resetRoundState({ clearScores: false });
        }
    } catch (err) {
        console.warn('[Roster] Failed to reset round state', err);
    }
    try {
        if (matchLifecycleManager && typeof matchLifecycleManager.beginRound === 'function') {
            matchLifecycleManager.beginRound({ info: reason || null });
        }
    } catch (err) {
        console.warn('[Lifecycle] Failed to begin round', err);
    }
}

function queueEliminationForEntry(entry, context = {}) {
    if (!entry || !entry.fighter || !entry.entity) return;
    const fighterId = entry.fighter.id;
    if (!fighterId) return;
    if (roundFlowState.processedEliminations.has(fighterId)) return;
    roundFlowState.processedEliminations.add(fighterId);
    const eliminationJoinerIndex = (() => {
        if (entry.fighter && entry.fighter.metadata) {
            const metaIdx = coerceJoinerIndex(entry.fighter.metadata.joinerIndex);
            if (metaIdx !== null) return metaIdx;
        }
        if (typeof resolveJoinerIndexForEntity === 'function') {
            const idx = coerceJoinerIndex(resolveJoinerIndexForEntity(entry.entity));
            if (idx !== null) return idx;
        }
        if (typeof resolveJoinerIndexForSlot === 'function' && typeof entry.fighter.slotIndex === 'number') {
            const idx = coerceJoinerIndex(resolveJoinerIndexForSlot(entry.fighter.slotIndex));
            if (idx !== null) return idx;
        }
        return null;
    })();
    roundFlowState.eliminationQueue.push({
        fighterId,
        entity: entry.entity,
        fighter: entry.fighter || null,
        slotIndex: typeof entry.fighter.slotIndex === 'number' ? entry.fighter.slotIndex : null,
        context: Object.assign({
            timestamp: Date.now(),
            round: matchLifecycleManager && typeof matchLifecycleManager.getState === 'function'
                ? matchLifecycleManager.getState().roundNumber
                : null,
            reason: 'health-zero',
            joinerIndex: Number.isInteger(eliminationJoinerIndex) ? eliminationJoinerIndex : undefined
        }, context || {})
    });
}

function startCardDraftForElimination(entity, fighterId, context = {}, options = {}) {
    if (!entity || !fighterId) return;
    const opts = options || {};
    let slotIndex = typeof opts.slotIndex === 'number' ? opts.slotIndex : null;
    let chooserRole = opts.chooserRole || null;
    let chooserJoinerIndex = coerceJoinerIndex(opts.joinerIndex);
    if (chooserJoinerIndex === null) {
        chooserJoinerIndex = coerceJoinerIndex(roundFlowState && roundFlowState.awaitingCardJoinerIndex);
    }
    const fighterIdStr = String(fighterId);

    if ((slotIndex === null || chooserRole === null) && playerRoster && typeof playerRoster.getFighterById === 'function') {
        try {
            const rec = playerRoster.getFighterById(fighterId);
            if (rec) {
                if (slotIndex === null && typeof rec.slotIndex === 'number') slotIndex = rec.slotIndex;
                if (chooserRole === null) chooserRole = resolveChooserRoleForSlot(rec.slotIndex);
                if (chooserJoinerIndex === null && rec.metadata) {
                    const parsed = coerceJoinerIndex(rec.metadata.joinerIndex);
                    if (parsed !== null) chooserJoinerIndex = parsed;
                }
            }
        } catch (e) {}
    }

    if (slotIndex === null) {
        try {
            const record = getFighterRecordForEntity(entity);
            if (record && typeof record.slotIndex === 'number') {
                slotIndex = record.slotIndex;
                if (chooserJoinerIndex === null && record.metadata) {
                    const parsed = coerceJoinerIndex(record.metadata.joinerIndex);
                    if (parsed !== null) chooserJoinerIndex = parsed;
                }
            }
        } catch (err) {}
    }

    if (slotIndex === null) {
        try {
            if (typeof NET === 'undefined' || !NET || !NET.connected) {
                slotIndex = entity && entity.isPlayer ? 0 : 1;
            } else if (NET.role === 'host') {
                if (entity === player) slotIndex = 0;
                else if (entity === enemy) slotIndex = 1;
            } else if (NET.role === 'joiner') {
                if (entity === player) {
                    const joinerIdx = Number.isInteger(NET.joinerIndex) ? NET.joinerIndex : 0;
                    if (typeof getJoinerSlotIndex === 'function') slotIndex = getJoinerSlotIndex(joinerIdx);
                    else slotIndex = joinerIdx + 1;
                } else if (entity === enemy) {
                    slotIndex = 0;
                }
            }
        } catch (err) {}
    }

    if (chooserJoinerIndex === null && typeof resolveJoinerIndexForSlot === 'function' && typeof slotIndex === 'number') {
        const idx = coerceJoinerIndex(resolveJoinerIndexForSlot(slotIndex));
        if (idx !== null) chooserJoinerIndex = idx;
    }

    if (chooserRole === null && slotIndex !== null) {
        chooserRole = resolveChooserRoleForSlot(slotIndex);
    }

    if (chooserRole === null) {
        chooserRole = inferRoleForEntity(entity);
    }

    if (chooserJoinerIndex === null && typeof resolveJoinerIndexForEntity === 'function') {
        const idx = coerceJoinerIndex(resolveJoinerIndexForEntity(entity));
        if (idx !== null) chooserJoinerIndex = idx;
    }

    let sharedChoices = [];
    try {
        sharedChoices = buildPowerupChoices(entity, 5);
    } catch (err) {
        sharedChoices = [];
    }
    const normalizedJoinerForDraft = coerceJoinerIndex(chooserJoinerIndex);

    roundFlowState.awaitingCardChooserRole = chooserRole;
    roundFlowState.awaitingCardSlotIndex = typeof slotIndex === 'number' ? slotIndex : null;
    roundFlowState.awaitingCardJoinerIndex = normalizedJoinerForDraft;

    try {
        if (cardDraftManager && typeof cardDraftManager.startDraft === 'function') {
            const metadata = Object.assign({ reason: 'elimination' }, context.metadata || {});
            const startPayload = {
                participants: [fighterIdStr],
                roundNumber: (matchLifecycleManager && matchLifecycleManager.getState) ? matchLifecycleManager.getState().roundNumber : 0,
                metadata
            };
            if (Array.isArray(sharedChoices) && sharedChoices.length) {
                startPayload.cardsByFighter = { [fighterIdStr]: sharedChoices.slice() };
            }
            cardDraftManager.startDraft(startPayload);
        }
    } catch (err) {
        console.warn('[Draft] Failed to start elimination draft', err);
    }
    // If we're host, broadcast the card offer so joiners show the same UI
    try {
        if (typeof NET !== 'undefined' && NET && NET.connected && NET.role === 'host' && typeof window.ws !== 'undefined' && window.ws && window.ws.readyState === WebSocket.OPEN) {
            let choiceNames = [];
            if (Array.isArray(sharedChoices) && sharedChoices.length) {
                choiceNames = sharedChoices.map(c => (c && (c.name || c.id)) ? (c.name || c.id) : null).filter(Boolean);
            }
            if (!choiceNames.length) {
                try {
                    const cards = cardDraftManager && typeof cardDraftManager.getCardsForFighter === 'function' ? cardDraftManager.getCardsForFighter(fighterIdStr) : [];
                    if (Array.isArray(cards)) choiceNames = cards.map(c => (c && (c.name || c.id)) ? (c.name || c.id) : null).filter(Boolean);
                } catch (e) { choiceNames = []; }
            }
            if (!choiceNames.length) {
                logDev('[CARD FLOW] No card choices available to broadcast for fighter ' + fighterIdStr + '; skipping relay.');
            }
            try {
                if (choiceNames.length) {
                    window.ws.send(JSON.stringify({
                        type: 'relay',
                        data: {
                            type: 'card-offer',
                            choices: choiceNames,
                            chooserRole,
                            fighterId: fighterIdStr,
                            slotIndex: typeof slotIndex === 'number' ? slotIndex : null,
                            joinerIndex: normalizedJoinerForDraft
                        }
                    }));
                    logDev('[CARD FLOW] Broadcast card-offer to ' + chooserRole + ' with choices: [' + choiceNames.join(', ') + '] (fighter ' + fighterIdStr + ')');
                }
            } catch (e) {}
        }
    } catch (e) {}
    try {
        showPowerupCards(entity, {
            choices: Array.isArray(sharedChoices) ? sharedChoices : [],
            chooserRole,
            fighterId: fighterIdStr,
            slotIndex: typeof slotIndex === 'number' ? slotIndex : (context && typeof context.slotIndex === 'number' ? context.slotIndex : null),
            joinerIndex: normalizedJoinerForDraft !== null ? normalizedJoinerForDraft : coerceJoinerIndex(context && context.joinerIndex)
        });
    } catch (err) {
        console.warn('[Cards] Failed to show powerup cards for eliminated fighter', err);
        // Fail-safe: if UI cannot render, immediately resume flow
        setTimeout(() => notifyPowerupSelectionComplete(entity, null), 0);
    }
}

function processNextElimination() {
    if (roundFlowState.awaitingCardSelection || roundFlowState.roundTransitionActive) return;
    const next = roundFlowState.eliminationQueue.shift();
    if (!next) return;
    const { fighterId, entity, context, slotIndex, fighter } = next;
    const resolvedSlotIndex = typeof slotIndex === 'number'
        ? slotIndex
        : (fighter && typeof fighter.slotIndex === 'number' ? fighter.slotIndex : null);
    const chooserRole = resolveChooserRoleForSlot(resolvedSlotIndex);
    const chooserJoinerIndex = (() => {
        const fromContext = context ? coerceJoinerIndex(context.joinerIndex) : null;
        if (fromContext !== null) return fromContext;
        const fromMetadata = (fighter && fighter.metadata) ? coerceJoinerIndex(fighter.metadata.joinerIndex) : null;
        if (fromMetadata !== null) return fromMetadata;
        if (typeof resolveJoinerIndexForSlot === 'function' && typeof resolvedSlotIndex === 'number') {
            const idx = coerceJoinerIndex(resolveJoinerIndexForSlot(resolvedSlotIndex));
            if (idx !== null) return idx;
        }
        if (typeof resolveJoinerIndexForEntity === 'function' && entity) {
            const idx = coerceJoinerIndex(resolveJoinerIndexForEntity(entity));
            if (idx !== null) return idx;
        }
        return null;
    })();
    const normalizedJoinerIndex = coerceJoinerIndex(chooserJoinerIndex);
    try {
        if (matchLifecycleManager && typeof matchLifecycleManager.markEliminated === 'function') {
            matchLifecycleManager.markEliminated(fighterId, context || { reason: 'health-zero' });
        } else if (playerRoster && typeof playerRoster.markEliminated === 'function') {
            playerRoster.markEliminated(fighterId, context || { reason: 'health-zero' });
        }
    } catch (err) {
        console.warn('[Lifecycle] Failed to mark fighter eliminated', err);
    }
    if (entity) {
        try {
            entity.disabled = true;
            entity.dashActive = false;
            entity.teledashWarmupActive = false;
            entity.teledashPendingTeleport = false;
        } catch (err) {}
    }
    roundFlowState.eliminationOrder.push(fighterId);
    roundFlowState.awaitingCardSelection = true;
    roundFlowState.awaitingCardFighterId = fighterId;
    roundFlowState.awaitingCardEntity = entity;
    roundFlowState.awaitingCardChooserRole = chooserRole;
    roundFlowState.awaitingCardSlotIndex = resolvedSlotIndex;
    roundFlowState.awaitingCardJoinerIndex = normalizedJoinerIndex;
    waitingForCard = true;
    startCardDraftForElimination(entity, fighterId, context || {}, { chooserRole, slotIndex: resolvedSlotIndex, joinerIndex: normalizedJoinerIndex });
}

function notifyPowerupSelectionComplete(loserEntity, selectedCardName) {
    const fighterRecord = getFighterRecordForEntity(loserEntity);
    const expectedId = roundFlowState.awaitingCardFighterId;
    const fighterIdForBroadcast = fighterRecord && fighterRecord.id ? fighterRecord.id : expectedId;
    const chooserRoleForBroadcast = roundFlowState.awaitingCardChooserRole || (fighterRecord ? resolveChooserRoleForSlot(fighterRecord.slotIndex) : null);
    const slotIndexForBroadcast = (() => {
        if (fighterRecord && typeof fighterRecord.slotIndex === 'number') return fighterRecord.slotIndex;
        if (typeof roundFlowState.awaitingCardSlotIndex === 'number') return roundFlowState.awaitingCardSlotIndex;
        return null;
    })();
    const joinerIndexForBroadcast = (() => {
        const fromState = coerceJoinerIndex(roundFlowState.awaitingCardJoinerIndex);
        if (fromState !== null) return fromState;
        if (fighterRecord && fighterRecord.metadata) {
            const metaIdx = coerceJoinerIndex(fighterRecord.metadata.joinerIndex);
            if (metaIdx !== null) return metaIdx;
        }
        return null;
    })();
    let shouldBroadcastSelection = false;
    if (typeof NET !== 'undefined' && NET && NET.connected && NET.role === 'host') {
        // Joiner selections are already broadcast via host confirmation flow
        if (chooserRoleForBroadcast !== 'joiner') {
            shouldBroadcastSelection = true;
        }
    }
    if (fighterRecord && fighterRecord.id && fighterRecord.id === expectedId) {
        try {
            if (cardDraftManager && typeof cardDraftManager.hasActiveDraft === 'function' && cardDraftManager.hasActiveDraft()) {
                const selection = selectedCardName ? { id: selectedCardName, name: selectedCardName } : null;
                cardDraftManager.recordSelection(String(fighterRecord.id), selection, { source: 'powerup-ui' });
                cardDraftManager.cancelDraft({ reason: 'selection-complete' });
            }
        } catch (err) {
            console.warn('[Draft] Failed to finalize card selection', err);
        }
    }
    roundFlowState.awaitingCardSelection = false;
    roundFlowState.awaitingCardFighterId = null;
    roundFlowState.awaitingCardEntity = null;
    roundFlowState.awaitingCardChooserRole = null;
    roundFlowState.awaitingCardSlotIndex = null;
    roundFlowState.awaitingCardJoinerIndex = null;
    waitingForCard = false;
    if (shouldBroadcastSelection && typeof window !== 'undefined' && window.ws && window.ws.readyState === WebSocket.OPEN) {
        try {
            window.ws.send(JSON.stringify({
                type: 'relay',
                data: {
                    type: 'card-apply',
                    pickerRole: chooserRoleForBroadcast || 'host',
                    card: selectedCardName || null,
                    fighterId: fighterIdForBroadcast != null ? String(fighterIdForBroadcast) : null,
                    slotIndex: typeof slotIndexForBroadcast === 'number' ? slotIndexForBroadcast : null,
                    joinerIndex: Number.isInteger(joinerIndexForBroadcast) ? joinerIndexForBroadcast : null
                }
            }));
        } catch (e) {}
    }
    if (roundFlowState.eliminationQueue.length > 0) {
        processNextElimination();
        return;
    }
    processPostSelectionRoundState();
}

function processPostSelectionRoundState() {
    if (roundFlowState.roundTransitionActive) return;
    const livingEntries = collectRosterEntries({ includeEliminated: false }).filter(entry => {
        if (!entry || !entry.fighter || !entry.entity) return false;
        if (entry.fighter.isAlive === false) return false;
        const hp = typeof entry.entity.health === 'number' ? entry.entity.health : entry.entity.healthMax;
        return hp > 0;
    });
    if (livingEntries.length <= 1) {
        handleRoundVictory(livingEntries.length === 1 ? livingEntries[0] : null);
    }
}

function handleRoundVictory(winnerEntry) {
    if (roundFlowState.roundTransitionActive) return;
    roundFlowState.roundTransitionActive = true;
    let winnerId = null;
    if (winnerEntry && winnerEntry.fighter) {
        winnerId = winnerEntry.fighter.id || null;
    }
    if (winnerId && matchLifecycleManager && typeof matchLifecycleManager.registerScore === 'function') {
        try {
            matchLifecycleManager.registerScore(winnerId, 1);
        } catch (err) {
            console.warn('[Lifecycle] Failed to register round score', err);
        }
    }
    if (winnerEntry && winnerEntry.entity && winnerId) {
        try {
            const rosterRecord = playerRoster && typeof playerRoster.getFighterById === 'function'
                ? playerRoster.getFighterById(winnerId)
                : null;
            const updatedScore = rosterRecord && typeof rosterRecord.score === 'number' ? rosterRecord.score : winnerEntry.entity.score || 0;
            winnerEntry.entity.score = updatedScore;
        } catch (err) {
            /* non-fatal */
        }
    }
    try {
        if (matchLifecycleManager && typeof matchLifecycleManager.completeRound === 'function') {
            matchLifecycleManager.completeRound({
                winners: winnerId ? [winnerId] : [],
                eliminations: roundFlowState.eliminationOrder.slice(),
                reason: 'last-fighter-standing'
            });
        }
    } catch (err) {
        console.warn('[Lifecycle] Failed to complete round summary', err);
    }
    try { maybeTriggerWorldModifierOffer({ reason: 'round-complete' }); } catch (err) { console.warn('[World Mod] Failed to queue offer', err); }
    scheduleNextRoundTransition(winnerEntry);
}

function scheduleNextRoundTransition(winnerEntry) {
    const delayMs = 1350;
    if (roundFlowState.nextRoundTimeout) {
        clearTimeout(roundFlowState.nextRoundTimeout);
    }
    roundFlowState.nextRoundTimeout = setTimeout(() => {
        resetArenaForNextRound(winnerEntry);
    }, delayMs);
}

function resetArenaForNextRound(winnerEntry) {
    let shouldDelayForChoice = false;
    try { if (cardState && cardState.active) shouldDelayForChoice = true; } catch (e) {}
    if (!shouldDelayForChoice) {
        try { if (waitingForCard) shouldDelayForChoice = true; } catch (e) {}
    }
    if (!shouldDelayForChoice) {
        try { if (roundFlowState && roundFlowState.awaitingCardSelection) shouldDelayForChoice = true; } catch (e) {}
    }
    let pendingOffer = null;
    let hasPendingOffer = false;
    try {
        if (window && window._pendingWorldModOffer) {
            pendingOffer = window._pendingWorldModOffer;
            hasPendingOffer = !!(pendingOffer && pendingOffer.choices && pendingOffer.choices.length);
        }
    } catch (e) {}
    if (!shouldDelayForChoice && hasPendingOffer) {
        try { window._pendingWorldModOffer = null; } catch (err) {}
        try { roundFlowState.pendingWorldModOffer = null; } catch (err) {}
        let presented = false;
        try { presented = presentWorldModifierOffer(pendingOffer) === true; } catch (err) {
            console.warn('[World Mod] Failed to present pending offer during round reset', err);
            presented = false;
        }
        if (!presented) {
            try { window._pendingWorldModOffer = pendingOffer; } catch (err) {}
            try { roundFlowState.pendingWorldModOffer = pendingOffer; } catch (err) {}
        } else {
            shouldDelayForChoice = true;
        }
    }
    if (shouldDelayForChoice) {
        if (roundFlowState.nextRoundTimeout) {
            clearTimeout(roundFlowState.nextRoundTimeout);
        }
        roundFlowState.nextRoundTimeout = setTimeout(() => resetArenaForNextRound(winnerEntry), 450);
        return;
    }
    roundFlowState.nextRoundTimeout = null;
    try { if (roundFlowState) roundFlowState.roundTransitionActive = false; } catch (e) {}
    // Preserve winner reference for spawn ordering

    const orderedEntries = collectRosterEntries({ includeEliminated: true }).sort((a, b) => {
        const ai = (a && a.fighter && typeof a.fighter.slotIndex === 'number') ? a.fighter.slotIndex : 99;
        const bi = (b && b.fighter && typeof b.fighter.slotIndex === 'number') ? b.fighter.slotIndex : 99;
        return ai - bi;
    });

    // Clear burning state for all fighters before respawn
    for (const entry of orderedEntries) {
        if (entry && entry.entity && entry.entity.burning) {
            entry.entity.burning = null;
        }
        if (entry && entry.entity && Array.isArray(entry.entity.flameParticles)) {
            entry.entity.flameParticles = [];
        }
    }

    bullets = [];
    explosions = [];
    try { waitingForCard = false; } catch (err) {}
    try { window._pendingWorldModOffer = null; } catch (err) {}
    try {
        infestedChunks = [];
        firestormInstance = null;
        firestormTimer = 0;
        spontaneousTimer = 0;
        infestationTimer = 0;
        if (typeof burningEntities !== 'undefined') burningEntities = new Set();
    } catch (err) {
        /* defensive */
    }
    try {
        if (healersActive && Array.isArray(healers) && healers.length) {
            healers.length = 0;
            healerPendingRespawn = true;
            healerRespawnTimer = 0;
            setNextHealerRespawnDelay();
        }
    } catch (err) {}

    try {
        const sel = document.getElementById('saved-maps');
        if (sel && sel.value) {
            if (sel.value === '__RANDOM__') {
                const key = pickRandomSavedMapKey();
                if (key) {
                    loadSavedMapByKey(key);
                } else {
                    generateObstacles();
                }
            } else {
                loadSavedMapByKey(sel.value);
            }
        } else {
            generateObstacles();
        }
    } catch (err) {
        console.warn('[Arena] Failed to regenerate map for new round', err);
        try { generateObstacles(); } catch (err2) {}
    }

    // If we're the host in a multiplayer match, broadcast the new obstacle layout
    // and (optional) spawn positions so joiners render the same map visuals.
    try {
        if (NET && NET.role === 'host' && NET.connected && window.ws && window.ws.readyState === WebSocket.OPEN) {
            let rosterScores = [];
            try {
                if (playerRoster && typeof playerRoster.getFighters === 'function') {
                    const fighters = playerRoster.getFighters({ includeUnassigned: false }) || [];
                    rosterScores = fighters.map(f => ({ id: f.id, score: f.score || 0 }));
                }
            } catch (err) {}
            const payload = {
                type: 'round-reset',
                obstacles: serializeObstacles(),
                // include authoritative positions/scores so joiners can mirror spawn placement
                hostPos: (enemy && typeof enemy.x === 'number') ? { x: enemy.x, y: enemy.y, hp: enemy.health|0 } : null,
                joinerPos: (player && typeof player.x === 'number') ? { x: player.x, y: player.y, hp: player.health|0 } : null,
                scores: {
                    host: (enemy && typeof enemy.score === 'number') ? enemy.score|0 : 0,
                    joiner: (player && typeof player.score === 'number') ? player.score|0 : 0
                },
                rosterScores: rosterScores
            };
            try { window.ws.send(JSON.stringify({ type: 'relay', data: payload })); } catch (e) {}
        }
    } catch (e) {}

    try { window.positionPlayersSafely && window.positionPlayersSafely(); } catch (err) {}

    const centerX = window.CANVAS_W / 2;
    const centerY = window.CANVAS_H / 2;
    const radius = Math.min(window.CANVAS_W, window.CANVAS_H) * 0.32;
    const total = orderedEntries.length || 1;

    // Compute spawn positions with separation to avoid overlapping spawns
    const placed = [];
    // Helper: find a clear spot near x0,y0 that doesn't overlap obstacles or any already-placed fighters
    function findClearAvoidingPlaced(x0, y0, cr, opts = {}) {
        const maxRadius = opts.maxRadius || 420;
        const step = opts.step || 12;
        const angleStep = opts.angleStep || 0.6;
        // If a fast helper exists and the raw candidate is clear, use it
        if (typeof window.isCircleClear === 'function' && window.isCircleClear(x0, y0, cr)) {
            // Still ensure not too close to placed
            let tooClose = false;
            for (const p of placed) {
                const req = (cr + (p.r || cr) + 12);
                if (window.dist(x0, y0, p.x, p.y) < req) { tooClose = true; break; }
            }
            if (!tooClose) return { x: x0, y: y0 };
        }
        // Start radial search expanding outward
        for (let r = step; r <= maxRadius; r += step) {
            for (let a = 0; a < Math.PI*2; a += angleStep) {
                const nx = x0 + Math.cos(a) * r;
                const ny = y0 + Math.sin(a) * r;
                if (typeof window.isCircleClear === 'function' && !window.isCircleClear(nx, ny, cr)) continue;
                // ensure not overlapping previously placed fighters
                let ok = true;
                for (const p of placed) {
                    const req = (cr + (p.r || cr) + 12);
                    if (window.dist(nx, ny, p.x, p.y) < req) { ok = false; break; }
                }
                if (ok) return { x: nx, y: ny };
            }
        }
        // Fallback to some corner/edges used by original helper
        const fallbackCandidates = [ {x: x0, y: 60+cr}, {x: x0, y: window.CANVAS_H-60-cr}, {x: 60+cr, y: y0}, {x: window.CANVAS_W-60-cr, y: y0}, {x: window.CANVAS_W/2, y: window.CANVAS_H/2} ];
        for (const c of fallbackCandidates) {
            if (typeof window.isCircleClear === 'function' && !window.isCircleClear(c.x, c.y, cr)) continue;
            let ok = true;
            for (const p of placed) {
                const req = (cr + (p.r || cr) + 12);
                if (window.dist(c.x, c.y, p.x, p.y) < req) { ok = false; break; }
            }
            if (ok) return { x: c.x, y: c.y };
        }
        return { x: x0, y: y0 };
    }
    orderedEntries.forEach((entry, idx) => {
        if (!entry || !entry.entity) return;
        let spawnX = entry.entity.x;
        let spawnY = entry.entity.y;
        // default min distance (pixels) between spawns
        const entityRadius = (entry.entity && typeof entry.entity.radius === 'number') ? entry.entity.radius : 18;
        const minSpawnDist = Math.max(96, Math.round(entityRadius * 3));

        if (entry.entity !== player && entry.entity !== enemy) {
            // initial ring placement
            let angle = -Math.PI / 2 + (idx / total) * Math.PI * 2;
            let baseRadius = radius;
            // Try small angle perturbations until we find a non-colliding spot
            let found = false;
            for (let attempt = 0; attempt < 48; attempt++) {
                const perturb = (Math.random() - 0.5) * 0.9 + attempt * 0.02; // gradual sweep
                const a = angle + perturb;
                const r = Math.round(centerX + Math.cos(a) * baseRadius);
                const s = Math.round(centerY + Math.sin(a) * baseRadius);
                // Skip if collides with obstacles or arena bounds
                if (typeof window.isCircleClear === 'function') {
                    if (!window.isCircleClear(r, s, entityRadius)) continue;
                }
                let ok = true;
                for (const p of placed) {
                    const dx = p.x - r;
                    const dy = p.y - s;
                    // require combined radius + small padding
                    const req = (entityRadius + (p.r || entityRadius) + 12);
                    if ((dx*dx + dy*dy) < (req * req)) { ok = false; break; }
                }
                if (ok) { spawnX = r; spawnY = s; found = true; break; }
            }
            // If not found, fall back to first candidate and we'll nudge later
            if (!found) {
                // choose the ring position and then try to find a nearby clear spot
                let candX = Math.round(centerX + Math.cos(angle) * baseRadius);
                let candY = Math.round(centerY + Math.sin(angle) * baseRadius);
                if (typeof findClearAvoidingPlaced === 'function') {
                    const best = findClearAvoidingPlaced(candX, candY, entityRadius, { maxRadius: 420, step: 16 });
                    spawnX = Math.round(best.x);
                    spawnY = Math.round(best.y);
                } else if (typeof window.findNearestClearPosition === 'function') {
                    const best = window.findNearestClearPosition(candX, candY, entityRadius, { maxRadius: 420, step: 16 });
                    spawnX = Math.round(best.x);
                    spawnY = Math.round(best.y);
                } else {
                    spawnX = candX;
                    spawnY = candY;
                }
            }
        } else {
            // For main player/enemy, ensure they are not too close to already placed spawns.
            // If they are, nudge them away along the vector between centers.
            for (let attempt = 0; attempt < 24; attempt++) {
                let conflict = null;
                for (const p of placed) {
                    const dx = p.x - spawnX;
                    const dy = p.y - spawnY;
                    const req = (entityRadius + (p.r || entityRadius) + 12);
                    if ((dx*dx + dy*dy) < (req * req)) { conflict = p; break; }
                }
                if (!conflict) break;
                // push away from conflict using combined radius as minimum separation
                const dx = spawnX - conflict.x || (Math.random() - 0.5);
                const dy = spawnY - conflict.y || (Math.random() - 0.5);
                const len = Math.hypot(dx, dy) || 1;
                const push = Math.max((entityRadius + (conflict.r || entityRadius) + 12), Math.round(len + 24));
                spawnX = Math.round(conflict.x + (dx / len) * push);
                spawnY = Math.round(conflict.y + (dy / len) * push);
                // clamp to canvas
                spawnX = clamp(spawnX, entry.entity.radius, window.CANVAS_W - entry.entity.radius);
                spawnY = clamp(spawnY, entry.entity.radius, CANVAS_H - entry.entity.radius);
            }
            // If still overlapping an obstacle or placed entity, search nearby for a clear spot
            try {
                if (typeof window.isCircleClear === 'function' && !window.isCircleClear(spawnX, spawnY, entityRadius)) {
                    const best = findClearAvoidingPlaced(spawnX, spawnY, entityRadius, { maxRadius: 420, step: 12 });
                    spawnX = Math.round(best.x);
                    spawnY = Math.round(best.y);
                } else {
                    // ensure not too close to placed even if clear of obstacles
                    let tooClose = false;
                    for (const p of placed) {
                        const req = (entityRadius + (p.r || entityRadius) + 12);
                        if (window.dist(spawnX, spawnY, p.x, p.y) < req) { tooClose = true; break; }
                    }
                    if (tooClose) {
                        const best = findClearAvoidingPlaced(spawnX, spawnY, entityRadius, { maxRadius: 420, step: 12 });
                        spawnX = Math.round(best.x);
                        spawnY = Math.round(best.y);
                    }
                }
            } catch (err) {}
            // Ensure final spawn does not overlap obstacles; if it does, search nearby for a clear spot
            try {
                if (typeof window.isCircleClear === 'function' && !window.isCircleClear(spawnX, spawnY, entityRadius)) {
                    if (typeof window.findNearestClearPosition === 'function') {
                        const best = window.findNearestClearPosition(spawnX, spawnY, entityRadius, { maxRadius: 420, step: 12 });
                        spawnX = Math.round(best.x);
                        spawnY = Math.round(best.y);
                    }
                }
            } catch (err) {}
        }

    // record the placed position to check against later entries (store radius too)
    placed.push({ x: spawnX, y: spawnY, r: entityRadius });

        if (typeof entry.entity.reset === 'function') {
            entry.entity.reset(spawnX, spawnY);
        } else {
            entry.entity.x = spawnX;
            entry.entity.y = spawnY;
            entry.entity.health = entry.entity.healthMax || entry.entity.health || 100;
        }
        // Reset shooting timers to eliminate cooldowns from previous round, but don't trigger immediate shots
        if (entry.fighter && entry.fighter.id) {
            entry.entity.timeSinceShot = entry.entity.shootInterval;
        }
        entry.entity.health = entry.entity.healthMax || entry.entity.health || 100;
        entry.entity.disabled = false;
        entry.entity.damageFlash = 0;
        entry.entity.shakeTime = 0;
        entry.entity.healthbarFlash = 0;
        try {
            if (entry.fighter && entry.fighter.id && playerRoster && typeof playerRoster.getFighterById === 'function') {
                const updated = playerRoster.getFighterById(entry.fighter.id) || entry.fighter;
                if (updated && typeof updated.score === 'number') {
                    entry.entity.score = updated.score;
                }
            }
        } catch (err) {}
        try {
            if (playerRoster && typeof playerRoster.markAlive === 'function' && entry.fighter && entry.fighter.id) {
                playerRoster.markAlive(entry.fighter.id, { position: { x: spawnX, y: spawnY } });
            }
        } catch (err) {
            console.warn('[Roster] Failed to mark fighter alive for new round', err);
        }
    });

    resetRoundFlowState();
    beginRoundLifecycle('next-round');
}

function hostEvaluateEliminations() {
    if (roundFlowState.roundTransitionActive) return;
    try {
        if (typeof isSelectionPauseActive === 'function' && isSelectionPauseActive()) return;
    } catch (err) {}
    const entries = collectRosterEntries({ includeEliminated: true });
    if (!entries.length) return;
    for (const entry of entries) {
        if (!entry || !entry.entity || !entry.fighter) continue;
        if (entry.fighter.isAlive === false) continue;
        const health = typeof entry.entity.health === 'number' ? entry.entity.health : entry.entity.healthMax;
        if (health <= 0) {
            queueEliminationForEntry(entry);
        }
    }
    if (!roundFlowState.awaitingCardSelection) {
        processNextElimination();
    }
}

let rosterUIBound = false;
let rosterInitialized = false;
let localFighterId = null;

const HOST_PLAYER_COLOR = '#65c6ff';
// Joiner colors for slots 2..5: red, yellow, green, purple
const JOINER_PLAYER_COLORS = ['#ff5a5a', '#ffe066', '#2ecc71', '#9b59b6'];
const BOT_PLAYER_COLOR = '#f48f3a';

function getJoinerColor(joinerIndex) {
    const idx = Math.max(0, Math.floor(joinerIndex || 0));
    return JOINER_PLAYER_COLORS[idx] || JOINER_PLAYER_COLORS[JOINER_PLAYER_COLORS.length - 1];
}

function getRosterFighterColor(slotIndex, fighter) {
    if (fighter && fighter.metadata && typeof fighter.metadata.color === 'string' && fighter.metadata.color.trim().length) {
        return fighter.metadata.color;
    }
    // Support older code that stored color on the fighter record directly
    if (fighter && typeof fighter.color === 'string' && fighter.color.trim().length) {
        return fighter.color;
    }
    if (fighter && fighter.metadata && fighter.metadata.isHost) {
        return HOST_PLAYER_COLOR;
    }
    if (slotIndex === 0) {
        return HOST_PLAYER_COLOR;
    }
    const joinerFromMetadata = (fighter && fighter.metadata) ? coerceJoinerIndex(fighter.metadata.joinerIndex) : null;
    if (joinerFromMetadata !== null) {
        return getJoinerColor(joinerFromMetadata);
    }
    if (slotIndex > 0) {
        return getJoinerColor(slotIndex - 1);
    }
    // For bots, prefer slot-derived color (host/joiner). If none available, use BOT_PLAYER_COLOR as fallback.
    if (fighter && fighter.kind === 'bot') {
        return BOT_PLAYER_COLOR;
    }
    return '';
}

function getRosterSlotsDetailed() {
    try {
        return playerRoster.getSlots({ includeDetails: true });
    } catch (err) {
        return [];
    }
}

function getActiveBotCount() {
    try {
        return typeof playerRoster.getActiveBotCount === 'function'
            ? playerRoster.getActiveBotCount({ includeUnassigned: false })
            : 0;
    } catch (err) {
        return 0;
    }
}

function updateEnemyFlagsFromRoster() {
    let bots = 0;
    try {
        bots = getActiveBotCount();
    } catch (err) {
        bots = 0;
    }
    window.activeBotCount = bots;
    const mappedCount = bots > 0 ? Math.min(bots, 2) : 0;
    if (typeof enemyCount !== 'undefined') {
        enemyCount = mappedCount;
    }
    window.enemyCount = mappedCount;

    let hasOpponent = false;
    try {
        if (playerRoster && typeof playerRoster.getFighters === 'function') {
            const fighters = playerRoster.getFighters({ includeUnassigned: false }) || [];
            const localIdx = (typeof window !== 'undefined' && typeof window.localPlayerIndex === 'number') ? window.localPlayerIndex : 0;
            for (const fighter of fighters) {
                if (!fighter) continue;
                if (fighter.metadata && fighter.metadata.isWorldMaster) continue;
                if (fighter.metadata && fighter.metadata.placeholder) continue;
                const slotIdx = (typeof fighter.slotIndex === 'number') ? fighter.slotIndex : null;
                if (localIdx >= 0 && slotIdx === localIdx) continue;
                hasOpponent = true;
                break;
            }
        }
    } catch (err) {}

    if (!hasOpponent) {
        try {
            if (NET && NET.connected) {
                if (NET.role === 'host') {
                    if (Array.isArray(NET.joiners) && NET.joiners.some(entry => entry && entry.connected !== false)) {
                        hasOpponent = true;
                    }
                } else if (NET.role === 'joiner') {
                    hasOpponent = true;
                }
            }
        } catch (err) {}
    }

    const disabled = !hasOpponent;
    if (typeof enemyDisabled !== 'undefined') {
        enemyDisabled = disabled;
    }
    window.enemyDisabled = disabled;
    if (typeof enemy !== 'undefined' && enemy) {
        enemy.disabled = !!disabled;
    }
}

function ensureRosterDefaults() {
    if (!playerRoster || typeof playerRoster.getSlots !== 'function') return;
    const isHostContext = (typeof NET === 'undefined') || !NET || !NET.connected || NET.role === 'host';
    if (!isHostContext) {
        rosterInitialized = true;
        updateEnemyFlagsFromRoster();
        return;
    }
    const nameInput = document.getElementById('display-name');
    const hostName = (nameInput && nameInput.value && nameInput.value.trim()) || (nameInput && nameInput.placeholder) || 'Player 1';
    try {
        const hostId = typeof playerRoster.ensureLobbyDefaults === 'function'
            ? playerRoster.ensureLobbyDefaults({ hostName, isMultiplayer, hostMetadata: { color: HOST_PLAYER_COLOR } })
            : null;
        if (hostId !== null && hostId !== undefined) {
            localFighterId = hostId;
        }
    } catch (err) {
        console.warn('[Roster] ensureLobbyDefaults failed', err);
    } finally {
        rosterInitialized = true;
        updateEnemyFlagsFromRoster();
    }
}

function describeRosterSlot(slotIndex) {
    if (!playerRoster || typeof playerRoster.describeSlot !== 'function') {
        return {
            title: `Slot ${slotIndex + 1}`,
            body: 'Unassigned',
            subtext: slotIndex === 0 ? 'Local player' : 'Click to assign',
            classes: ['empty']
        };
    }
    return playerRoster.describeSlot(slotIndex, { includeFighter: true });
}

function onRosterSlotClicked(event) {
    if (!canEditRoster()) return;
    const el = event.currentTarget;
    if (!el || typeof el.getAttribute !== 'function') return;
    const slotIndex = parseInt(el.getAttribute('data-slot'), 10);
    if (Number.isNaN(slotIndex)) return;
    if (slotIndex === 0) return; // local slot fixed
    // If this slot is currently being inline-renamed, ignore clicks/keypresses to avoid
    // accidental toggles while editing (e.g., Space key activating the button).
    if (typeof _rosterInlineRenameSlot === 'number' && _rosterInlineRenameSlot === slotIndex) return;
    try {
        if (typeof playerRoster.toggleSlotState === 'function') {
            playerRoster.toggleSlotState(slotIndex);
        }
    } catch (err) {
        console.warn('[Roster] Slot toggle failed', err);
    }
}

function canEditRoster() {
    if (typeof NET === 'undefined' || !NET.connected) return true;
    return NET.role === 'host';
}

function renderRosterUI() {
    const grid = document.getElementById('roster-grid');
    if (!grid) return;
    ensureRosterDefaults();
    const slots = getRosterSlotsDetailed();
    const buttons = grid.querySelectorAll('.roster-slot');
    buttons.forEach((btn) => {
        const slotIndex = parseInt(btn.getAttribute('data-slot'), 10);
        const data = slots[slotIndex] || {};
        const desc = describeRosterSlot(slotIndex);
        const fighter = (desc && desc.fighter) || data.fighter;
        const titleEl = btn.querySelector('.slot-title');
        const bodyEl = btn.querySelector('.slot-body');
        const subEl = btn.querySelector('.slot-subtext');
        const chipWrap = btn.querySelector('.slot-actions');
        btn.classList.remove('empty', 'human', 'bot', 'worldmaster');
        desc.classes.forEach(cls => btn.classList.add(cls));
        if (titleEl) titleEl.textContent = `Slot ${slotIndex + 1}`;
        if (bodyEl) {
            bodyEl.textContent = desc.body;
            const displayColor = getRosterFighterColor(slotIndex, fighter);
            if (displayColor) {
                bodyEl.style.color = displayColor;
            } else if (bodyEl.style) {
                bodyEl.style.removeProperty('color');
            }
        }
        if (subEl) subEl.textContent = desc.subtext;
        // Show 'Host' label on the local slot when hosting (replace generic local-player text)
        if (slotIndex === 0 && subEl) {
            try {
                // If we're connected to multiplayer, slot 1 represents the Host's player
                if (typeof NET !== 'undefined' && NET && NET.connected) {
                    subEl.textContent = 'Host';
                } else {
                    // single-player or offline
                    subEl.textContent = 'Controlled on this device';
                }
            } catch (e) {}
        }
        if (chipWrap) {
            chipWrap.innerHTML = '';
            if (fighter && fighter.metadata && fighter.metadata.isWorldMaster) {
                const chip = document.createElement('span');
                chip.className = 'slot-chip worldmaster';
                chip.textContent = 'World Master';
                chipWrap.appendChild(chip);
            } else if (fighter && fighter.kind === 'bot') {
                const chip = document.createElement('span');
                chip.className = 'slot-chip bot';
                chip.textContent = 'Bot';
                chipWrap.appendChild(chip);
            }
        }
        if (!canEditRoster() || slotIndex === 0 || (fighter && fighter.kind === 'human' && !(fighter.metadata && fighter.metadata.placeholder))) {
            btn.disabled = true;
            btn.classList.remove('selected');
        } else {
            btn.disabled = false;
        }
    });
    const noteEl = document.getElementById('roster-note');
    if (noteEl) {
        noteEl.textContent = canEditRoster()
            ? 'Click a slot to cycle between open seat and AI bot. Slot 1 is your local character.'
            : 'Roster is managed by the host. Joiners view assignments here.';
    }
    updateEnemyFlagsFromRoster();
}

function getJoinerExternalId(joinerIndex) {
    return `net-joiner-${Math.max(0, Math.floor(joinerIndex || 0))}`;
}

function getJoinerSlotIndex(joinerIndex) {
    const fallbackSlots = (typeof playerRoster.getSlotCount === 'function') ? playerRoster.getSlotCount() : 5;
    const maxSlots = Math.max(2, fallbackSlots);
    const desired = Math.max(1, Math.floor(joinerIndex || 0) + 1);
    return Math.min(maxSlots - 1, desired);
}

function assignRemoteJoinerToRoster(joinerIndex, displayName, metadataExtras = {}) {
    try {
        if (!playerRoster || typeof playerRoster.assignHuman !== 'function') return;
        const slotIndex = getJoinerSlotIndex(joinerIndex);
        const color = (metadataExtras && metadataExtras.color) || getJoinerColor(joinerIndex);
        const descriptor = {
            name: displayName || `Joiner ${joinerIndex + 1}`,
            externalId: getJoinerExternalId(joinerIndex),
            metadata: Object.assign({ control: 'remote', joinerIndex, color }, metadataExtras || {})
        };
        playerRoster.assignHuman(slotIndex, descriptor);
    } catch (err) {
        console.warn('[Roster] Failed to assign remote joiner', joinerIndex, err);
    }
}

function clearRemoteJoinerFromRoster(joinerIndex) {
    try {
        if (!playerRoster) return;
        const externalId = getJoinerExternalId(joinerIndex);
        if (typeof playerRoster.getFighterByExternalId === 'function') {
            const fighter = playerRoster.getFighterByExternalId(externalId);
            if (fighter && typeof playerRoster.removeFighterById === 'function') {
                playerRoster.removeFighterById(fighter.id, { forgetExternal: true });
                return;
            }
        }
        if (typeof playerRoster.clearSlot === 'function') {
            const slotIndex = getJoinerSlotIndex(joinerIndex);
            playerRoster.clearSlot(slotIndex, { removeFighter: true, forgetExternal: true });
        }
    } catch (err) {
        console.warn('[Roster] Failed to clear remote joiner slot', joinerIndex, err);
    }
}

function broadcastRosterSnapshot() {
    try {
        if (typeof NET === 'undefined' || !NET || NET.role !== 'host' || !NET.connected) return;
        if (!window.ws || window.ws.readyState !== WebSocket.OPEN) return;
        if (!playerRoster || typeof playerRoster.toSerializable !== 'function') return;
        const rosterSnap = playerRoster.toSerializable({ includeEntity: false });
        window.ws.send(JSON.stringify({
            type: 'relay',
            data: {
                type: 'roster-sync',
                roster: rosterSnap,
                emittedAt: Date.now()
            }
        }));
    } catch (err) {
        /* non-fatal: roster sync is best-effort */
    }
}

function bindRosterUI() {
    if (rosterUIBound) return;
    const grid = document.getElementById('roster-grid');
    if (!grid) return;
    ensureRosterDefaults();
    grid.querySelectorAll('.roster-slot').forEach(btn => {
        btn.addEventListener('click', onRosterSlotClicked);
        // Right-click context menu for slot actions (rename for bots)
        btn.addEventListener('contextmenu', (ev) => {
            try {
                ev.preventDefault();
                const slotIndex = Number.parseInt(btn.getAttribute('data-slot'), 10);
                showRosterContextMenu(slotIndex, ev.clientX, ev.clientY);
            } catch (e) {}
            return false;
        });
    });
    if (typeof playerRoster.on === 'function') {
        playerRoster.on(PlayerRoster.EVENTS.ROSTER_UPDATED, () => {
            renderRosterUI();
            if (typeof NET !== 'undefined' && NET && NET.role === 'host') {
                if (typeof broadcastSetup === 'function') {
                    try { broadcastSetup(); } catch (e) {}
                }
                try { broadcastRosterSnapshot(); } catch (e) {}
            }
        });
    }
    rosterUIBound = true;
    renderRosterUI();
}

// Roster context menu and inline rename helpers
let _rosterContextEl = null;
// Index of slot currently being inline-renamed, or null
let _rosterInlineRenameSlot = null;
function hideRosterContextMenu() {
    try {
        if (_rosterContextEl && _rosterContextEl.parentNode) _rosterContextEl.parentNode.removeChild(_rosterContextEl);
    } catch (e) {}
    _rosterContextEl = null;
}

function showRosterContextMenu(slotIndex, x, y) {
    hideRosterContextMenu();
    try {
        const desc = describeRosterSlot(slotIndex);
        const fighter = desc && desc.fighter ? desc.fighter : null;
        if (!fighter || fighter.kind !== 'bot') return;
        const menu = document.createElement('div');
        menu.className = 'roster-context-menu';
        Object.assign(menu.style, { position: 'absolute', left: x + 'px', top: y + 'px', zIndex: 20000, background: '#111', color: '#fff', padding: '6px', borderRadius: '6px', boxShadow: '0 6px 18px rgba(0,0,0,0.6)' });
        const rename = document.createElement('div');
        rename.className = 'roster-context-item';
        rename.textContent = 'Rename';
        rename.style.cursor = 'pointer';
        rename.onclick = (ev) => {
            ev && ev.stopPropagation && ev.stopPropagation();
            hideRosterContextMenu();
            beginInlineRenameForSlot(slotIndex);
        };
        menu.appendChild(rename);
        document.body.appendChild(menu);
        _rosterContextEl = menu;
        setTimeout(() => {
            const closer = (e) => { hideRosterContextMenu(); window.removeEventListener('click', closer); };
            window.addEventListener('click', closer);
        }, 0);
    } catch (e) { console.warn('Failed to show roster context menu', e); }
}

function beginInlineRenameForSlot(slotIndex) {
    try {
        const grid = document.getElementById('roster-grid');
        if (!grid) return;
        const btn = grid.querySelector(`.roster-slot[data-slot="${slotIndex}"]`);
        if (!btn) return;
        const desc = describeRosterSlot(slotIndex);
        const fighter = desc && desc.fighter ? desc.fighter : null;
        if (!fighter) return;
        const bodyEl = btn.querySelector('.slot-body');
        if (!bodyEl) return;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'roster-inline-rename';
        input.value = fighter.name || '';
        input.maxLength = 32;
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';
        bodyEl.innerHTML = '';
        bodyEl.appendChild(input);
    // Mark this slot as being edited so click/keypress handlers can ignore it
    _rosterInlineRenameSlot = slotIndex;
    input.focus();
    input.select();

        function commit() {
            try {
                const newName = (input.value || '').toString().trim().slice(0,32);
                if (newName && playerRoster && typeof playerRoster.updateFighter === 'function') {
                    playerRoster.updateFighter(fighter.id, { name: newName });
                    try { if (typeof updateCardsUI === 'function') updateCardsUI(); } catch (e) {}
                }
            } catch (e) { console.warn('Failed to rename fighter', e); }
            try { renderRosterUI(); } catch (e) {}
            _rosterInlineRenameSlot = null;
        }

        // Prevent key events (notably Space) from bubbling to the parent button which would
        // trigger a slot toggle. Handle Enter/Escape here and stop propagation for Space.
        input.addEventListener('keydown', (ev) => {
            // Stop the key from bubbling to global handlers or the slot button
            ev.stopPropagation();
            if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
            else if (ev.key === 'Escape') { ev.preventDefault(); renderRosterUI(); }
            // Do NOT preventDefault for Space — allow it to insert into the input while still
            // stopping propagation so parent button doesn't receive the event.
        });
        // also stop keypress/keyup to be safe across browsers
    input.addEventListener('keypress', (ev) => { ev.stopPropagation(); });
        input.addEventListener('keyup', (ev) => { ev.stopPropagation(); });
        input.addEventListener('blur', () => { commit(); });
    } catch (e) { console.warn('beginInlineRenameForSlot error', e); }
}

// --- WorldMaster Integration ---
window.gameWorldMasterInstance = null;

function setupWorldMasterInstance(isLocal) {
    // Prefer Integration API to avoid duplicate instances
        try {
        if (window.WorldMasterIntegration && typeof window.WorldMasterIntegration.enableWorldMasterMode === 'function') {
            window.WorldMasterIntegration.enableWorldMasterMode(!!isLocal);
            // Pull the instance reference
            if (window.WorldMasterIntegration.gameWorldMaster) {
                window.gameWorldMasterInstance = window.WorldMasterIntegration.gameWorldMaster;
            }
        } else {
            // Fallback to direct construction if Integration is not available
            if (typeof window.WorldMaster !== 'function' || typeof window.WorldMasterUI !== 'function') {
                console.error('WorldMaster or WorldMasterUI not loaded globally.');
                return;
            }
            window.gameWorldMasterInstance = new window.WorldMaster(isLocal);
            window.gameWorldMasterInstance.ui = new window.WorldMasterUI(window.gameWorldMasterInstance);
        }
        try {
            const controller = ensureGlobalDeckController();
            if (controller && typeof controller.attachWorldMaster === 'function') {
                controller.attachWorldMaster(window.gameWorldMasterInstance);
            }
        } catch (e) {}
    } catch (e) {}
    // Initialize autoPick from UI checkbox if present
    try {
        const ap = document.getElementById('wm-autopick');
        if (ap && window.gameWorldMasterInstance) window.gameWorldMasterInstance.autoPick = !!ap.checked;
    } catch (e) {}
    try {
        const ai = document.getElementById('wm-ai-powerups');
        if (ai && window.gameWorldMasterInstance) window.gameWorldMasterInstance.aiSelfPickPowerups = !!ai.checked;
    } catch (e) {}
    // Attach map click event for manual effects at the document level so UI can sit above
    const canvas = document.getElementById('game');
    if (canvas && !window._wmDocClickAttached) {
        const _wmDocClickHandler = function(e) {
            if (!(window.localPlayerIndex === -1 && window.gameWorldMasterInstance)) return;
            // Suppress while card chooser/modal is active
            try { if (window.cardState && window.cardState.active) return; } catch (e2) {}
            // Ignore clicks on UI controls that must consume the click
            const target = e.target;
            if (target && (target.closest('.wm-clickable') || target.closest('#wm-panel') || target.id === 'wm-panel')) {
                // Badge/UI handled separately
                return;
            }
            // Note: clicks that land in non-interactive areas of #cards-ui are allowed for WM map actions
            // Only handle clicks that occur over the canvas bounds
            const rect = canvas.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
            // Delegate click handling to Integration helper (it will compute coordinates & consume event if handled)
            try {
                if (window.WorldMasterIntegration && typeof window.WorldMasterIntegration.handleWorldMasterMapClick === 'function') {
                    window.WorldMasterIntegration.handleWorldMasterMapClick(e);
                } else if (window.gameWorldMasterInstance && typeof window.gameWorldMasterInstance.handleMapClick === 'function') {
                    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
                    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
                    window.gameWorldMasterInstance.handleMapClick(x, y);
                }
            } catch (err) { console.error('WM map click error:', err); }
        };
        document.addEventListener('click', _wmDocClickHandler, true);
        window._wmDocClickHandler = _wmDocClickHandler;
        window._wmDocClickAttached = true;
    }
}

function destroyWorldMasterInstance() {
    try {
        if (window.WorldMasterIntegration && typeof window.WorldMasterIntegration.disableWorldMasterMode === 'function') {
            window.WorldMasterIntegration.disableWorldMasterMode();
        } else if (window.gameWorldMasterInstance && window.gameWorldMasterInstance.ui && typeof window.gameWorldMasterInstance.ui.toggle === 'function') {
            window.gameWorldMasterInstance.ui.toggle(false);
            window.gameWorldMasterInstance = null;
        } else {
            window.gameWorldMasterInstance = null;
        }
        try {
            if (window.globalDeckController && typeof window.globalDeckController.attachWorldMaster === 'function') {
                window.globalDeckController.attachWorldMaster(null);
            }
        } catch (e) {}
    } catch (e) { window.gameWorldMasterInstance = null; }
}

function getLobbyPlayers() {
    // Dummy implementation: replace with actual lobby player retrieval
    // For now, just return host and up to 2 joiners
    const hostLabel = (typeof NET !== 'undefined')
        ? (NET.role === 'host' ? (NET.myName || 'Host') : (NET.hostName || NET.peerName || 'Host'))
        : 'Host';
    const players = [{ id: 0, name: hostLabel }];
    if (typeof NET !== 'undefined' && Array.isArray(NET.joiners)) {
        for (let i = 0; i < NET.joiners.length; ++i) {
            const entry = NET.joiners[i];
            if (!entry) continue;
            players.push({ id: i + 1, name: entry.name || `Joiner ${i + 1}` });
        }
    }
    return players;
}

function updateWorldMasterSetupUI() {
    const wmToggle = document.getElementById('wm-toggle');
    const wmToggleRow = document.getElementById('wm-toggle-row');
    const wmToggleLabel = document.getElementById('wm-toggle-label');
    const wmMpRoles = document.getElementById('wm-multiplayer-roles');
    // If setup overlay controls aren't present yet, bail gracefully
    if (!wmToggle || !wmToggleLabel || !wmMpRoles) {
        return;
    }
    // Determine multiplayer state
    isMultiplayer = (typeof NET !== 'undefined' && NET.connected);
    // Get lobby players (host, joiners)
    lobbyPlayers = getLobbyPlayers();
    // Fallback: if getLobbyPlayers didn't return both players for a 2-player session,
    // build a minimal list from NET names so radios always appear.
    try {
        if (isMultiplayer && Array.isArray(lobbyPlayers) && lobbyPlayers.length < 2) {
            const fallback = [];
            if (NET.role === 'host') {
                fallback.push({ id: 0, name: NET.myName || 'Host' });
                fallback.push({ id: 1, name: NET.peerName || 'Joiner' });
            } else {
                // joiner view: peerName is host, myName is joiner
                fallback.push({ id: 0, name: NET.peerName || 'Host' });
                fallback.push({ id: 1, name: NET.myName || 'Joiner' });
            }
            lobbyPlayers = fallback;
        }
    } catch (e) {}
    if (!isMultiplayer) {
        // Singleplayer: show checkbox, hide radio buttons
        wmToggle.style.display = '';
        wmToggleLabel.style.display = '';
        wmMpRoles.style.display = 'none';
        wmToggle.checked = !!worldMasterEnabled;
    } else {
    // Multiplayer: hide checkbox, show radio buttons for each player
        wmToggle.style.display = 'none';
        wmToggleLabel.style.display = 'none';
        wmMpRoles.style.display = 'flex';
        wmMpRoles.innerHTML = '';
        // Build radio buttons. For 2-player sessions ensure Host and Joiner radios always exist (use NET fallbacks if needed).
        if (lobbyPlayers.length >= 3) {
            // 3+ players: build radios from the list
            lobbyPlayers.forEach((p, idx) => {
                const label = document.createElement('label');
                label.style.color = '#fff';
                label.style.fontWeight = 'normal';
                label.style.marginRight = '12px';
                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = 'wm-role-radio';
                radio.value = idx;
                radio.checked = (worldMasterPlayerIndex === idx);
                if (NET.role !== 'host') radio.disabled = true;
                radio.onclick = () => {
                    if (NET.role !== 'host') return;
                    worldMasterPlayerIndex = idx;
                    try { if (typeof window.broadcastSetupWM === 'function') window.broadcastSetupWM(); } catch (e) {}
                    updateWorldMasterSetupUI();
                };
                label.appendChild(radio);
                label.appendChild(document.createTextNode(' ' + p.name + (idx === 0 ? ' (Host)' : '')));
                wmMpRoles.appendChild(label);
            });
            // For 3-player lobbies do not auto-assign a WorldMaster by default.
            // Previously we defaulted to making the 3rd player (index 2) the WorldMaster,
            // which caused the second joiner to be promoted unexpectedly. Leave
            // `worldMasterPlayerIndex` as null so all joiners behave as normal fighters
            // unless the host explicitly chooses a WorldMaster.
        } else {
            // 2-player (or fallback) scenario: always create explicit Host and Joiner radios
            const hostName = (lobbyPlayers[0] && lobbyPlayers[0].name) || (NET.role === 'host' ? (NET.myName || 'Host') : (NET.peerName || 'Host'));
            const joinerName = (lobbyPlayers[1] && lobbyPlayers[1].name) || (NET.role === 'host' ? (NET.peerName || 'Joiner') : (NET.myName || 'Joiner'));

            // Host radio (index 0)
            (function() {
                const label = document.createElement('label');
                label.style.color = '#fff';
                label.style.fontWeight = 'normal';
                label.style.marginRight = '12px';
                const radio = document.createElement('input');
                radio.type = 'radio'; radio.name = 'wm-role-radio'; radio.value = 0; radio.checked = (worldMasterPlayerIndex === 0);
                if (NET.role !== 'host') radio.disabled = true;
                radio.onclick = () => { if (NET.role !== 'host') return; worldMasterPlayerIndex = 0; worldMasterEnabled = true; try { assignPlayersAndAI(); } catch (e) {} try { if (typeof window.broadcastSetupWM === 'function') window.broadcastSetupWM(); } catch (e) {} try { updateCardsUI(); } catch (e) {} updateWorldMasterSetupUI(); };
                label.appendChild(radio);
                label.appendChild(document.createTextNode(' ' + hostName + ' (Host)'));
                wmMpRoles.appendChild(label);
            })();

            // Joiner radio (index 1)
            (function() {
                const label = document.createElement('label');
                label.style.color = '#fff';
                label.style.fontWeight = 'normal';
                label.style.marginRight = '12px';
                const radio = document.createElement('input');
                radio.type = 'radio'; radio.name = 'wm-role-radio'; radio.value = 1; radio.checked = (worldMasterPlayerIndex === 1);
                if (NET.role !== 'host') radio.disabled = true;
                radio.onclick = () => { if (NET.role !== 'host') return; worldMasterPlayerIndex = 1; worldMasterEnabled = true; try { assignPlayersAndAI(); } catch (e) {} try { if (typeof window.broadcastSetupWM === 'function') window.broadcastSetupWM(); } catch (e) {} try { updateCardsUI(); } catch (e) {} updateWorldMasterSetupUI(); };
                label.appendChild(radio);
                label.appendChild(document.createTextNode(' ' + joinerName));
                wmMpRoles.appendChild(label);
            })();

            // Add 'None' option for 2-player
            const labelNone = document.createElement('label');
            labelNone.style.color = '#fff';
            labelNone.style.fontWeight = 'normal';
            labelNone.style.marginRight = '12px';
            const radioNone = document.createElement('input');
            radioNone.type = 'radio'; radioNone.name = 'wm-role-radio'; radioNone.value = 'none'; radioNone.checked = (worldMasterPlayerIndex === null);
            if (NET.role !== 'host') radioNone.disabled = true;
            radioNone.onclick = () => { if (NET.role !== 'host') return; worldMasterPlayerIndex = null; worldMasterEnabled = false; try { assignPlayersAndAI(); } catch (e) {} try { if (typeof window.broadcastSetupWM === 'function') window.broadcastSetupWM(); } catch (e) {} try { updateCardsUI(); } catch (e) {} updateWorldMasterSetupUI(); };
            labelNone.appendChild(radioNone);
            labelNone.appendChild(document.createTextNode(' None'));
            wmMpRoles.appendChild(labelNone);
        }
    }
}

function assignPlayersAndAI() {
    // Called before starting game, sets up player/AI roles
    if (!isMultiplayer) {
        if (worldMasterEnabled) {
            // Host is world master, 2 AI fight each other
            window.localPlayerIndex = -1;
            window.aiCount = 2;
            setupWorldMasterInstance(true);
            enableWorldMasterModeUI();
        } else {
            // Normal PvAI
            window.localPlayerIndex = 0;
            window.aiCount = 1;
            destroyWorldMasterInstance();
            disableWorldMasterModeUI();
        }
    } else {
        // Multiplayer
        // Track MP count for runtime checks (avoid relying on stale lobbyPlayers later)
        try { window.multiplayerPlayerCount = Array.isArray(lobbyPlayers) ? lobbyPlayers.length : 2; } catch (e) { window.multiplayerPlayerCount = 2; }
        if (lobbyPlayers.length === 2) {
            if (worldMasterPlayerIndex === null) {
                // PvP: both players fight
                window.localPlayerIndex = (NET.role === 'host') ? 0 : 1;
                window.aiCount = 0;
                destroyWorldMasterInstance();
                disableWorldMasterModeUI();
            } else {
                // One is world master, other fights AI depending on Enemy AI toggle
                window.localPlayerIndex = (NET.role === 'host') ? (worldMasterPlayerIndex === 0 ? -1 : 0) : (worldMasterPlayerIndex === 1 ? -1 : 1);
                // Determine if Enemy AI is enabled from setup overlay
                let aiEnabled = true;
                try { const aiEl = document.getElementById('enemy-ai'); aiEnabled = !!(aiEl && aiEl.checked); } catch (e) {}
                // If host is WM (index 0): when aiEnabled => 1 AI (blue), else 0 AI (blue absent)
                // If joiner is WM (index 1): keep existing behavior (other side fights AI) until extended
                if (worldMasterPlayerIndex === 0) {
                    window.aiCount = aiEnabled ? 1 : 0;
                } else {
                    window.aiCount = 1;
                }
                if ((NET.role === 'host' && worldMasterPlayerIndex === 0) || (NET.role === 'joiner' && worldMasterPlayerIndex === 1)) {
                    setupWorldMasterInstance(false);
                    enableWorldMasterModeUI();
                } else {
                    destroyWorldMasterInstance();
                    disableWorldMasterModeUI();
                }
            }
        } else if (lobbyPlayers.length === 3) {
            // 3 players: host, joiner1, joiner2
            // worldMasterPlayerIndex: 0=host, 1=joiner1, 2=joiner2
            window.localPlayerIndex = (NET.role === 'host') ? (worldMasterPlayerIndex === 0 ? -1 : 0)
                : (NET.role === 'joiner' && NET.joinerIndex === 0 ? (worldMasterPlayerIndex === 1 ? -1 : 1)
                : (worldMasterPlayerIndex === 2 ? -1 : 2));
            window.aiCount = 0;
            // Only the selected world master gets the instance
            if ((NET.role === 'host' && worldMasterPlayerIndex === 0) ||
                (NET.role === 'joiner' && NET.joinerIndex === 0 && worldMasterPlayerIndex === 1) ||
                (NET.role === 'joiner' && NET.joinerIndex === 1 && worldMasterPlayerIndex === 2)) {
                setupWorldMasterInstance(false);
                enableWorldMasterModeUI();
            } else {
                destroyWorldMasterInstance();
                disableWorldMasterModeUI();
            }
        }
    }

    // UI feedback for WorldMaster role
    updateWorldMasterRoleBanner();
}

function enableWorldMasterModeUI() {
    // Show WorldMaster UI panel if available
    // Do not auto-show the WM panel during setup - it should only appear once the match starts.
    // The UI instance is kept created; showing is handled by startGame().
    // However, if the game is already running and a WM is enabled, show the panel now.
    try {
        if (running && window.gameWorldMasterInstance && window.gameWorldMasterInstance.ui && typeof window.gameWorldMasterInstance.ui.toggle === 'function') {
            window.gameWorldMasterInstance.ui.toggle(true);
        }
    } catch (e) {}
    // Optionally, disable player controls if localPlayerIndex === -1
    if (window.localPlayerIndex === -1) {
        window.disablePlayerControls = true;
    }
    // Allow canvas to receive clicks so WM map control works; do not disable pointer events here
    try {
        const gameCanvas = document.getElementById('game');
        if (gameCanvas) {
            gameCanvas.style.pointerEvents = '';
        }
    } catch (e) {}
    
    // Force update the cards UI to enable WorldMaster click handlers
    
    try { 
        if (typeof updateCardsUI === 'function') {
            updateCardsUI(); 
        }
    } catch (e) {
        console.error('[DEBUG] Error calling updateCardsUI in enableWorldMasterModeUI:', e);
    }
    
    // Also call it again with a small delay to ensure DOM is ready
    setTimeout(() => {
        
        try { 
            if (typeof updateCardsUI === 'function') {
                updateCardsUI(); 
            }
        } catch (e) {
            console.error('[DEBUG] Error in delayed updateCardsUI call:', e);
        }
    }, 100);
}

function disableWorldMasterModeUI() {
    // Hide WorldMaster UI panel if available
    if (window.gameWorldMasterInstance && window.gameWorldMasterInstance.ui && typeof window.gameWorldMasterInstance.ui.toggle === 'function') {
        window.gameWorldMasterInstance.ui.toggle(false);
    }
    window.disablePlayerControls = false;
    // Re-enable canvas pointer events
    try {
        const gameCanvas = document.getElementById('game');
        if (gameCanvas) {
            gameCanvas.style.pointerEvents = '';
        }
    } catch (e) {}

    // Teardown WM document-level listeners if present
    try {
        if (window._wmDocClickAttached && window._wmDocClickHandler) {
            document.removeEventListener('click', window._wmDocClickHandler, true);
        }
        window._wmDocClickAttached = false;
        window._wmDocClickHandler = null;
    } catch (e) {}
    try {
        if (window._wmDocBadgeCaptureInstalled && window._wmDocBadgeCaptureHandler) {
            document.removeEventListener('click', window._wmDocBadgeCaptureHandler, true);
            document.removeEventListener('pointerdown', window._wmDocBadgeCaptureHandler, true);
            document.removeEventListener('mousedown', window._wmDocBadgeCaptureHandler, true);
        }
        window._wmDocBadgeCaptureInstalled = false;
        window._wmDocBadgeCaptureHandler = null;
    } catch (e) {}

    // Remove cardsDiv delegated handler if present
    try {
        const cardsDiv = document.getElementById('cards-ui');
        if (cardsDiv && window._wmCardClickHandler) {
            cardsDiv.removeEventListener('click', window._wmCardClickHandler);
        }
        window._wmCardClickHandler = null;
    } catch (e) {}
}

function updateWorldMasterRoleBanner() {
    // Show a banner or indicator for WorldMaster role
    let banner = document.getElementById('wm-role-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'wm-role-banner';
        banner.style.position = 'fixed';
        banner.style.top = '';
        banner.style.bottom = '12px';
        banner.style.left = '50%';
        banner.style.transform = 'translateX(-50%)';
        banner.style.zIndex = 1000;
        banner.style.background = 'rgba(80,40,160,0.92)';
        banner.style.color = '#fff';
        banner.style.padding = '8px 32px';
        banner.style.borderRadius = '16px';
        banner.style.fontSize = '1.3em';
        banner.style.fontWeight = 'bold';
        banner.style.boxShadow = '0 2px 16px #0008';
        document.body.appendChild(banner);
    }
    if (window.localPlayerIndex === -1) {
        banner.innerText = 'World Master';
        banner.style.display = '';
    } else {
        banner.innerText = '';
        banner.style.display = 'none';
    }
}

// Call this after DOMContentLoaded and whenever lobby/connection state changes
document.addEventListener('DOMContentLoaded', () => {
    // Options button opens options modal
    const optionsBtn = document.getElementById('open-options-btn');
    const optionsModal = document.getElementById('options-overlay');
    if (optionsBtn && optionsModal) {
        optionsBtn.addEventListener('click', function() {
            // Hide setup/roster modal if visible
            var setupModal = document.getElementById('setup-overlay');
            if (setupModal && setupModal.style.display !== 'none') {
                setupModal.style.display = 'none';
            }
            optionsModal.style.display = 'block';
        });
    }

    // Multiplayer modal 'Close' button logic
    const mpCloseBtn = document.getElementById('mp-close');
    if (mpCloseBtn) {
        mpCloseBtn.addEventListener('click', function() {
            // Hide the multiplayer modal
            const mpModal = document.getElementById('multiplayer-modal');
            if (mpModal) mpModal.style.display = 'none';
            // If session is already created, keep it active and joinable
            // If not, create session now (simulate host/invite click)
            if (typeof NET !== 'undefined' && NET && NET.role === 'host' && NET.connected) {
                // Session is already active, do nothing
            } else {
                // If not connected, trigger host/invite logic
                if (typeof startHostSession === 'function') {
                    startHostSession();
                } else if (typeof hostBtn === 'object' && hostBtn && typeof hostBtn.click === 'function') {
                    hostBtn.click();
                }
            }
            // Ensure session code remains visible in roster and joiners can connect
            try { if (typeof setMpSessionDisplay === 'function') setMpSessionDisplay(); } catch (e) {}
        });
    }
    // --- Prevent browser menus and stuck movement when clicking outside canvas ---
    // Prevent right-click context menu anywhere
    document.addEventListener('contextmenu', function(e) {
        // Only allow context menu on form controls and contenteditable elements
        const t = e.target;
        if (!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable))) {
            e.preventDefault();
        }
    });
    // Prevent left/right mouse down/up outside canvas from causing stuck movement
    document.addEventListener('mousedown', function(e) {
        // Allow normal interaction with dev console and form controls (inputs, textareas, selects) and contenteditable
        const t = e.target;
        if (
            (window.canvas && window.canvas.contains(t)) ||
            (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) ||
            (t && (t.id === 'dev-console-input' || t.id === 'dev-console-log' || t.id === 'dev-console-fixed' || t.id === 'dev-console-form'))
        ) {
            return;
        }
        e.preventDefault();
    // Defensive: clear movement/dash/shoot keys if mouse leaves canvas
    if (window.keys) {
            window.keys['left'] = false;
            window.keys['right'] = false;
            window.keys['up'] = false;
            window.keys['down'] = false;
            window.keys['shift'] = false;
            window.keys['shoot'] = false;
        }
    }, true);
    document.addEventListener('mouseup', function(e) {
        // Allow normal interaction with dev console and form controls (inputs, textareas, selects) and contenteditable
        const t = e.target;
        if (
            (window.canvas && window.canvas.contains(t)) ||
            (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) ||
            (t && (t.id === 'dev-console-input' || t.id === 'dev-console-log' || t.id === 'dev-console-fixed' || t.id === 'dev-console-form'))
        ) {
            return;
        }
        e.preventDefault();
        if (window.keys) {
            window.keys['left'] = false;
            window.keys['right'] = false;
            window.keys['up'] = false;
            window.keys['down'] = false;
            window.keys['shift'] = false;
            window.keys['shoot'] = false;
        }
    }, true);
    const wmToggle = document.getElementById('wm-toggle');
    if (wmToggle) {
        wmToggle.addEventListener('change', () => {
            worldMasterEnabled = wmToggle.checked;
            
            // Re-assign players and AI to set up WM instance
            try { assignPlayersAndAI(); } catch (e) {}
            // Broadcast to joiner and update UI immediately
            try { if (typeof window.broadcastSetupWM === 'function') window.broadcastSetupWM(); } catch (e) {}
            try { updateCardsUI(); } catch (e) {}
        });
    }
    updateWorldMasterSetupUI();
});

// --- Restart Game ---
function restartGame() {
    // Reset scores
    if (typeof player !== 'undefined' && player) player.resetStats();
    if (typeof enemy !== 'undefined' && enemy) enemy.resetStats();
    updateCardsUI();
    // Show setup overlay
    showSetupOverlay();
    updateWorldMasterSetupUI();
}

// Show victory modal and optionally broadcast to peer
function showVictoryModal(winnerName, broadcast = false) {
    try {
        const modal = document.getElementById('victory-modal');
        const txt = document.getElementById('victory-text');
        const title = document.getElementById('victory-title');
        if (title) title.innerText = 'Match Over';
        if (txt) txt.innerText = `${winnerName} won the match!`;
        if (modal) modal.style.display = 'flex';
        matchOver = true;
        // Pause game selection
        window._victoryPauseActive = true;
        // Reset votes for multiplayer
        window._victoryVotes = { host: null, joiner: null };
        updateVictoryModalStatus();
        // Hide any active card UI so background selection is suppressed
        try {
            const div = document.getElementById('card-choices');
            if (div) { div.style.display = 'none'; div.innerHTML = ''; div.classList.remove('card-bg-visible'); }
            try { cardState.active = false; } catch (e) {}
            try { waitingForCard = false; } catch (e) {}
        } catch (e) {}
        // Broadcast match-end for other client to display
        if (broadcast && window.ws && window.ws.readyState === WebSocket.OPEN) {
            try { window.ws.send(JSON.stringify({ type: 'relay', data: { type: 'match-end', winner: winnerName } })); } catch (e) {}
        }
    } catch (e) {}
}

function hideVictoryModal() {
    try { const modal = document.getElementById('victory-modal'); if (modal) modal.style.display = 'none'; } catch (e) {}
    matchOver = false;
    window._victoryPauseActive = false;
    // Reset votes
    window._victoryVotes = { host: null, joiner: null };
    updateVictoryModalStatus();
}

function updateVictoryModalStatus() {
    try {
        const txt = document.getElementById('victory-text');
        const modal = document.getElementById('victory-modal');
        if (!txt || !modal) return;
        const isMultiplayer = (typeof NET !== 'undefined' && NET.connected);
        if (!isMultiplayer) return;

        const myRole = NET.role;
        const peerRole = (myRole === 'host') ? 'joiner' : 'host';
        const myVote = window._victoryVotes[myRole];
        const peerVote = window._victoryVotes[peerRole];

        // Get display names
        let myName = (myRole === 'host') ? (NET.myName || 'Host') : (NET.myName || 'Joiner');
        let peerName = (peerRole === 'host') ? (NET.peerName || 'Host') : (NET.peerName || 'Joiner');
        if (myRole === 'joiner') peerName = (NET.peerName || 'Host');

        // Remove any previous status
        let statusEl = modal.querySelector('#victory-status-line');
        if (statusEl) statusEl.remove();

        // Build status line
        let statusMsg = '';
        if (myVote && !peerVote) {
            statusMsg = `<small style="color:#ffda72;">Waiting for ${peerName}... (You chose: ${myVote})</small>`;
        } else if (!myVote && peerVote) {
            statusMsg = `<small style="color:#65c6ff;">${peerName} chose: ${peerVote}</small>`;
        } else if (myVote && peerVote) {
            statusMsg = `<small style="color:#56ff7a;">Both voted!</small>`;
        }

        // Insert status line below buttons
        const btnRow = modal.querySelector('div[style*="display:flex"][style*="justify-content:center"]');
        if (btnRow && statusMsg) {
            const line = document.createElement('div');
            line.id = 'victory-status-line';
            line.style.marginTop = '12px';
            line.innerHTML = statusMsg;
            btnRow.parentNode.insertBefore(line, btnRow.nextSibling);
        }
    } catch (e) {}
}

// Wire victory modal buttons
try {
    const vr = document.getElementById('victory-restart');
    const vc = document.getElementById('victory-close');
    if (vr) vr.addEventListener('click', function() {
        const isMultiplayer = (typeof NET !== 'undefined' && NET.connected);
        if (isMultiplayer) {
            // Record vote and broadcast
            const myRole = NET.role;
            window._victoryVotes[myRole] = 'Restart';
            updateVictoryModalStatus();
            // Broadcast vote
            try {
                if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                    window.ws.send(JSON.stringify({ type:'relay', data:{ type:'victory-vote', role: myRole, choice: 'Restart' } }));
                }
            } catch (e) {}
            // Check if both voted
            checkVictoryVotes();
        } else {
            // Singleplayer: immediate restart
            try { player.score = 0; enemy.score = 0; } catch (e) {}
            hideVictoryModal();
            try { restartGame(); } catch (e) {}
        }
    });
    if (vc) {
        // Change label to 'Continue'
        vc.innerText = 'Continue';
        vc.addEventListener('click', function() {
            const isMultiplayer = (typeof NET !== 'undefined' && NET.connected);
            if (isMultiplayer) {
                // Record vote and broadcast
                const myRole = NET.role;
                window._victoryVotes[myRole] = 'Continue';
                updateVictoryModalStatus();
                // Broadcast vote
                try {
                    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                        window.ws.send(JSON.stringify({ type:'relay', data:{ type:'victory-vote', role: myRole, choice: 'Continue' } }));
                    }
                } catch (e) {}
                // Check if both voted
                checkVictoryVotes();
            } else {
                // Singleplayer: immediate continue
                hideVictoryModal();
                window._victoryRoundsLeft = 3;
                window._victoryRoundsActive = true;
            }
        });
    }
} catch (e) {}

function checkVictoryVotes() {
    try {
        const hostVote = window._victoryVotes.host;
        const joinerVote = window._victoryVotes.joiner;
        
        // Both must vote
        if (!hostVote || !joinerVote) return;
        
        // Determine action based on votes
        const restartCount = (hostVote === 'Restart' ? 1 : 0) + (joinerVote === 'Restart' ? 1 : 0);
        const continueCount = (hostVote === 'Continue' ? 1 : 0) + (joinerVote === 'Continue' ? 1 : 0);
        
        // If both chose same, do that action
        // If split, prioritize Continue (allows game to continue)
        if (restartCount === 2) {
            // Both want restart
            if (NET.role === 'host') {
                try { player.score = 0; enemy.score = 0; } catch (e) {}
                try { if (window.ws && window.ws.readyState === WebSocket.OPEN) { window.ws.send(JSON.stringify({ type:'relay', data:{ type:'match-restart' } })); } } catch (e) {}
            }
            hideVictoryModal();
            try { restartGame(); } catch (e) {}
        } else {
            // At least one wants continue, so continue
            hideVictoryModal();
            window._victoryRoundsLeft = 3;
            window._victoryRoundsActive = true;
            // Broadcast continue action for both clients
            if (NET.role === 'host') {
                try {
                    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                        window.ws.send(JSON.stringify({ type:'relay', data:{ type:'victory-continue' } }));
                    }
                } catch (e) {}
            }
        }
    } catch (e) {}
}

// Sound effect helpers live in functions/sounds.js
// Load saved rounds-to-win if present
try {
    const savedRounds = parseInt(localStorage.getItem('shape_shot_rounds') || '3');
    if (!isNaN(savedRounds) && savedRounds > 0) ROUNDS_TO_WIN = savedRounds;
    // If the setup input exists, populate it
    try { const roundsInput = document.getElementById('rounds-to-win'); if (roundsInput) roundsInput.value = ROUNDS_TO_WIN; } catch (e) {}
} catch (e) {}
let OBSTACLE_COUNT = 8;
let OBSTACLE_MIN_SIZE = 70, OBSTACLE_MAX_SIZE = 170;

// Dynamic & map border settings (controlled via UI)
let DYNAMIC_MODE = false;
let DYNAMIC_RATE = 3.0; // seconds between spawn/despawn events
let dynamicTimer = 0;
let dynamicSpawnNext = true;
let MAP_BORDER = true; // when true, border blocks bullets (ricochet only if bullet has bounces)


// --- World Modifiers System ---
// Apply a world modifier by name with proper first/second-pick semantics
function applyWorldModifierByName(name) {
    const mod = WORLD_MODIFIERS.find(m => m.name === name);
    if (!mod) return;
        if (usedWorldModifiers[name]) {
            // Second pick: either disable or apply special logic
            if (name === 'Dynamic') {
                // Dynamic toggles back to previous settings via effect()
                if (typeof mod.effect === 'function') mod.effect();
            } else {
                // For other modifiers, disable them (turn off flags and remove from active)
                if (name === 'Infestation') {
                    infestationActive = false;
                } else if (name === 'Spontaneous') {
                    spontaneousActive = false;
                } else if (name === 'Firestorm') {
                    firestormActive = false;
                    firestormInstance = null;
                    firestormTimer = 0;
                } else if (name === 'Healers') {
                    healersActive = false;
                    clearHealers();
                }
                activeWorldModifiers = activeWorldModifiers.filter(m => m !== name);
                usedWorldModifiers[name] = false;
            }
    } else {
        // First pick: apply effect and mark as used
        if (typeof mod.effect === 'function') mod.effect();
        usedWorldModifiers[name] = true;
        if (!activeWorldModifiers.includes(name)) activeWorldModifiers.push(name);
    }
    // Refresh cards UI so World Cards line reflects current activeWorldModifiers
    try { if (typeof updateCardsUI === 'function') updateCardsUI(); } catch (e) {}
    // Also refresh WorldMaster panel effect list if present
    try { if (window.gameWorldMasterInstance && window.gameWorldMasterInstance.ui && typeof window.gameWorldMasterInstance.ui.renderActiveEffects === 'function') { window.gameWorldMasterInstance.ui.renderActiveEffects(); } } catch (e) {}
}
// --- Firestorm State ---
let firestormActive = false;
let firestormTimer = 0;
let firestormNextTime = 0;
let wasFirestormActive = false;
let wasFirestormInstance = null;
let firestormInstance = null; // holds the current firestorm object
let firestormPreSpawnPos = null;
let firestormPreSpawnTimer = 0;
let firestormPreSpawnDelay = 2; // 2 seconds warning

// --- Healers State ---
let healersActive = false;
let healers = [];
let healerRespawnTimer = 0;
let healerRespawnDelay = 0;
let healerPendingRespawn = false;
let healerPreSpawnPos = null;

function clearHealers() {
    healers.length = 0;
    healerRespawnTimer = 0;
    healerRespawnDelay = 0;
    healerPendingRespawn = false;
}

function setNextHealerRespawnDelay() {
    healerRespawnDelay = 5 + Math.random() * 5; // 5-10 seconds
    // Pick a pre-spawn position that avoids obstacles
    const spawnRadius = 24; // safe radius for spawn collision checks
    let attempt = randomHealerPosition();
    let tries = 0;
    while (tries < 30) {
        const ax = attempt.x;
        const ay = attempt.y;
        let colliding = false;
        try {
            if (Array.isArray(obstacles)) {
                for (let o of obstacles) {
                    if (!o) continue;
                    if (typeof o.circleCollide === 'function' && o.circleCollide(ax, ay, spawnRadius)) { colliding = true; break; }
                }
            }
        } catch (e) { colliding = false; }
        if (!colliding) {
            healerPreSpawnPos = { x: ax, y: ay };
            break;
        }
        // try another spot
        attempt = randomHealerPosition();
        tries++;
    }
    // fallback: use last attempted position even if overlapping
    if (!healerPreSpawnPos) {
        healerPreSpawnPos = { x: attempt.x || (window.CANVAS_W/2), y: attempt.y || (CANVAS_H/2) };
    }
    try { console.log('[Healer] pre-spawn position set', healerPreSpawnPos, 'delay=', healerRespawnDelay.toFixed(2)); } catch (e) {}
}

function randomHealerPosition() {
    const margin = 140;
    return {
        x: rand(margin, window.CANVAS_W - margin),
        y: rand(margin, CANVAS_H - margin)
    };
}

function spawnHealerAt(pos) {
    // If pos is provided (e.g., from pre-spawn position), use it exactly
    if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
        const h = new Healer(pos.x, pos.y);
        healers.push(h);
        return h;
    }
    
    // Otherwise, try to find a spawn position that doesn't overlap obstacles
    const spawnRadius = 24; // safe radius for spawn collision checks
    let attempt = randomHealerPosition();
    let tries = 0;
    while (tries < 30) {
        const ax = attempt.x;
        const ay = attempt.y;
        let colliding = false;
        try {
            if (Array.isArray(obstacles)) {
                for (let o of obstacles) {
                    if (!o) continue;
                    if (typeof o.circleCollide === 'function' && o.circleCollide(ax, ay, spawnRadius)) { colliding = true; break; }
                }
            }
        } catch (e) { colliding = false; }
        if (!colliding) {
            const h = new Healer(ax, ay);
            healers.push(h);
            return h;
        }
        // try another spot
        attempt = randomHealerPosition();
        tries++;
    }
    // fallback: spawn at last attempted position even if overlapping
    const h = new Healer(attempt.x || (window.CANVAS_W/2), attempt.y || (CANVAS_H/2));
    healers.push(h);
    return h;
}

function getHealerTargets() {
    const targets = [];
    // Prefer roster-aware list when available so bots and additional players are included
    try {
        if (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.getFighters === 'function') {
            const fighters = playerRoster.getFighters({ includeUnassigned: false, includeEntity: true }) || [];
            for (const f of fighters) {
                if (!f || !f.entity) continue;
                // Skip world master or disabled entries
                if (f.metadata && f.metadata.isWorldMaster) continue;
                // Only include entities that exist
                targets.push(f.entity);
            }
            return targets;
        }
    } catch (e) {
        // fallthrough to legacy mapping
    }
    if (player) targets.push(player);
    if (enemy && !enemyDisabled) targets.push(enemy);
    return targets;
}

// Global function for WorldMaster to trigger firestorm pre-spawn
function triggerFirestormPreSpawn(x, y, radius = 200) {
    try {
        // Set pre-spawn position for manual WorldMaster click
        firestormPreSpawnPos = { x, y, radius };
        firestormPreSpawnTimer = 0;
        try {
            if (NET && NET.role === 'host' && NET.connected) {
                GameEvents.emit('firestorm-pre-spawn', { x, y, radius, delay: firestormPreSpawnDelay, timer: firestormPreSpawnTimer });
            }
        } catch (e) {}
        return true;
    } catch (e) {
        return false;
    }
}

// Expose to window for WorldMaster access
if (typeof window !== 'undefined') {
    window.triggerFirestormPreSpawn = triggerFirestormPreSpawn;
}

let worldModifierRoundInterval = 3; // default, can be set in setup
// Victory modal continue loop
window._victoryRoundsLeft = 0;
window._victoryRoundsActive = false;
// Victory modal voting system
window._victoryVotes = { host: null, joiner: null };
let roundsSinceLastModifier = 0;
// Match settings
let ROUNDS_TO_WIN = 10; // default, can be changed in setup UI
// When true, suppress card/UI offers (used while victory modal is shown)
let matchOver = false;
let activeWorldModifiers = [];
let usedWorldModifiers = {};

function areWorldModifiersAllowed() {
    if (!Array.isArray(WORLD_MODIFIERS) || !WORLD_MODIFIERS.length) return false;
    try {
        if (typeof window.setupAllowWorldMods !== 'undefined' && window.setupAllowWorldMods === false) return false;
    } catch (e) {}
    return true;
}

function isWorldMasterManualModeActive() {
    try {
        if (window.gameWorldMasterInstance && window.gameWorldMasterInstance.autoPick === false) return true;
    } catch (e) {}
    try {
        const apEl = document.getElementById('wm-autopick');
        if (apEl && apEl.type === 'checkbox' && apEl.checked === false) return true;
    } catch (e) {}
    return false;
}

function getWorldModifierChooserRole() {
    try {
        if (typeof NET !== 'undefined' && NET && NET.connected) {
            if (typeof worldMasterPlayerIndex === 'number') {
                if (worldMasterPlayerIndex === 0) return 'host';
                if (worldMasterPlayerIndex === 1) return 'joiner';
            }
            return 'host';
        }
    } catch (e) {}
    return 'host';
}

function getFilteredWorldModifierDeck() {
    let deck = Array.isArray(WORLD_MODIFIERS) ? WORLD_MODIFIERS.slice() : [];
    try {
        if (window.WorldMasterIntegration && typeof window.WorldMasterIntegration.getFilteredWorldModifiers === 'function') {
            const filtered = window.WorldMasterIntegration.getFilteredWorldModifiers(deck) || [];
            if (Array.isArray(filtered) && filtered.length) deck = filtered.slice();
        }
    } catch (e) {}
    return deck;
}

function buildWorldModifierOffer(options = {}) {
    if (!areWorldModifiersAllowed()) return null;
    const deck = getFilteredWorldModifierDeck();
    if (!deck.length) return null;
    // Do not exclude modifiers that are currently marked as used/active. Offers should
    // still be able to include already-active modifiers so World Master can toggle them.
    let pool = deck.slice();
    if (!pool.length) return null;
    const selectionCount = Math.min(3, pool.length);
    let selections = [];
    try {
        if (typeof randomChoice === 'function') {
            selections = randomChoice(pool, selectionCount) || [];
        }
    } catch (e) { selections = []; }
    if (!Array.isArray(selections) || !selections.length) {
        const copy = pool.slice();
        while (selections.length < selectionCount && copy.length) {
            const idx = randInt(0, copy.length - 1);
            selections.push(copy.splice(idx, 1)[0]);
        }
    }
    const choiceNames = selections.map(mod => mod && mod.name).filter(Boolean);
    if (!choiceNames.length) return null;
    let finalIdx = options && typeof options.finalIdx === 'number' ? options.finalIdx : null;
    if (typeof finalIdx !== 'number' || finalIdx < 0 || finalIdx >= choiceNames.length) {
        finalIdx = randInt(0, Math.max(0, choiceNames.length - 1));
    }
    const manual = ((options && options.manual === true) || ((typeof worldMasterEnabled !== 'undefined' && worldMasterEnabled) && isWorldMasterManualModeActive())) === true;
    const offer = {
        choices: choiceNames,
        chooserRole: options && options.chooserRole ? options.chooserRole : getWorldModifierChooserRole(),
        finalIdx,
        reason: options && options.reason ? options.reason : null
    };
    if (manual) offer.manual = true;
    return offer;
}

function presentWorldModifierOffer(offer, options = {}) {
    if (!offer || !Array.isArray(offer.choices) || !offer.choices.length) return false;
    if (!areWorldModifiersAllowed()) return false;
    const payload = {
        choices: offer.choices.slice(),
        chooserRole: offer.chooserRole || getWorldModifierChooserRole(),
        finalIdx: typeof offer.finalIdx === 'number' ? offer.finalIdx : undefined,
        manual: !!offer.manual
    };
    const execute = () => {
        try {
            if (!(window.WorldMasterIntegration && typeof window.WorldMasterIntegration.triggerWorldModifierChoice === 'function' && window.WorldMasterIntegration.triggerWorldModifierChoice(payload.choices, payload.chooserRole))) {
                netShowWorldModifierCards(payload.choices, payload.chooserRole, payload.finalIdx, payload);
            }
        } catch (err) {
            netShowWorldModifierCards(payload.choices, payload.chooserRole, payload.finalIdx, payload);
        }
        try {
            if (typeof NET !== 'undefined' && NET && NET.connected && NET.role === 'host') {
                if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                    window.ws.send(JSON.stringify({ type: 'relay', data: { type: 'mod-offer', choices: payload.choices, chooserRole: payload.chooserRole, finalIdx: payload.finalIdx, manual: !!payload.manual } }));
                }
            }
        } catch (err) {}
    };
    try { waitingForCard = true; } catch (err) {}
    try { cardState.active = true; } catch (err) {}
    const delayMs = options && typeof options.delayMs === 'number' ? options.delayMs : 0;
    if (delayMs > 0) setTimeout(execute, delayMs); else execute();
    try { roundFlowState.pendingWorldModOffer = null; } catch (err) {}
    return true;
}

function queueWorldModifierOffer(offer, options = {}) {
    if (!offer || !Array.isArray(offer.choices) || !offer.choices.length) return false;
    try { roundFlowState.pendingWorldModOffer = offer; } catch (e) {}
    const shouldDefer = (options && options.defer === true) || isSelectionPauseActive();
    if (shouldDefer) {
        try { window._pendingWorldModOffer = Object.assign({}, offer); } catch (e) {}
        return false;
    }
    try { window._pendingWorldModOffer = null; } catch (e) {}
    return presentWorldModifierOffer(offer, options);
}

function maybeTriggerWorldModifierOffer(context = {}) {
    if (!areWorldModifiersAllowed()) return false;
    try {
        if (typeof NET !== 'undefined' && NET && NET.connected && NET.role !== 'host') return false;
    } catch (e) {}
    const force = context && context.force === true;
    if (!force) {
        roundsSinceLastModifier = Math.max(0, roundsSinceLastModifier + 1);
        if (roundsSinceLastModifier < worldModifierRoundInterval) return false;
    }
    roundsSinceLastModifier = 0;
    const offer = buildWorldModifierOffer(context);
    if (!offer) return false;
    queueWorldModifierOffer(offer, { defer: context && context.defer === true });
    return true;
}

// Infestation tracking
let infestationActive = false;
let infestationTimer = 0;
let infestedChunks = [];

// Spontaneous explosion tracking
let spontaneousActive = false;
let spontaneousTimer = 0;

// Dynamic modifier tracking
let dynamicModifierActive = false;
let dynamicPreviousMode = false;
let dynamicPreviousRate = 3.0;

class GlobalDeckController {
    constructor() {
        this.minWorldMods = 3;
        this.minPowerups = 5;
        this.availableWorldMods = new Set();
        this.availablePowerups = new Set();
        this._initialized = false;
        this.worldMaster = null;
        this.ui = null;
        this.uiAdapter = null;
        this.uiSource = null;
    }

    ensureInitialized() {
        if (this._initialized) return;
        const mods = (typeof WORLD_MODIFIERS !== 'undefined') ? WORLD_MODIFIERS : (window.WORLD_MODIFIERS || []);
        for (const mod of mods) {
            const name = (typeof mod === 'string') ? mod : (mod && mod.name);
            if (name) this.availableWorldMods.add(name);
        }
        const pups = (typeof POWERUPS !== 'undefined') ? POWERUPS : (window.POWERUPS || []);
        for (const pup of pups) {
            const name = (typeof pup === 'string') ? pup : (pup && pup.name);
            if (name) this.availablePowerups.add(name);
        }
        this._initialized = true;
    }

    attachWorldMaster(worldMaster) {
        if (worldMaster) {
            this.ensureInitialized();
            const wmMods = (worldMaster && worldMaster.availableWorldMods instanceof Set) ? worldMaster.availableWorldMods : null;
            const wmPups = (worldMaster && worldMaster.availablePowerups instanceof Set) ? worldMaster.availablePowerups : null;
            if (wmMods && !this.availableWorldMods.size && wmMods.size) {
                this.availableWorldMods = new Set(wmMods);
            }
            if (wmPups && !this.availablePowerups.size && wmPups.size) {
                this.availablePowerups = new Set(wmPups);
            }
            if (this.uiAdapter) {
                this.uiAdapter.availableWorldMods = this.availableWorldMods;
                this.uiAdapter.availablePowerups = this.availablePowerups;
            }
            this.worldMaster = worldMaster;
            worldMaster.availableWorldMods = this.availableWorldMods;
            worldMaster.availablePowerups = this.availablePowerups;
            worldMaster.minWorldMods = this.minWorldMods;
            worldMaster.minPowerups = this.minPowerups;
        } else {
            this.worldMaster = null;
        }
    }

    toggleWorldMod(name, enabled, context = {}) {
        this.ensureInitialized();
        const had = this.availableWorldMods.has(name);
        if (enabled) {
            if (!had) {
                this.availableWorldMods.add(name);
                this._afterToggle(context);
            }
            return true;
        }
        if (!had) return false;
        if (this.availableWorldMods.size <= this.minWorldMods) {
            return false;
        }
        this.availableWorldMods.delete(name);
        this._afterToggle(context);
        return true;
    }

    togglePowerup(name, enabled, context = {}) {
        this.ensureInitialized();
        const had = this.availablePowerups.has(name);
        if (enabled) {
            if (!had) {
                this.availablePowerups.add(name);
                this._afterToggle(context);
            }
            return true;
        }
        if (!had) return false;
        if (this.availablePowerups.size <= this.minPowerups) {
            return false;
        }
        this.availablePowerups.delete(name);
        this._afterToggle(context);
        return true;
    }

    _afterToggle(context) {
        const wm = context && context.worldMaster ? context.worldMaster : this.worldMaster;
        if (wm && context && context.skipSync) {
            return;
        }
        if (wm && typeof wm.syncCardDecks === 'function') {
            try { wm.syncCardDecks(); } catch (e) {}
        }
    }
}

function ensureGlobalDeckController() {
    if (typeof window === 'undefined') return null;
    if (!window.globalDeckController) {
        window.globalDeckController = new GlobalDeckController();
        window.globalDeckController.ensureInitialized();
        if (window.gameWorldMasterInstance) {
            try { window.globalDeckController.attachWorldMaster(window.gameWorldMasterInstance); } catch (e) {}
        }
    } else {
        try { window.globalDeckController.ensureInitialized(); } catch (e) {}
    }
    return window.globalDeckController;
}

if (typeof window !== 'undefined') {
    window.ensureGlobalDeckController = ensureGlobalDeckController;
    ensureGlobalDeckController();
}

function beginDash(p, dashVec, dashSet, opts = {}) {
    if (!p) return;
    try {
        if (typeof isEntityActive === 'function' && !isEntityActive(p)) return;
    } catch (e) {}
    const dir = dashVec ? { x: dashVec.x, y: dashVec.y } : { x: 0, y: 0 };
    const teledash = isTeledashEnabled(p);
    p.dashActive = true;
    p.dashDir = dir;
    p.dashCooldown = dashSet.cooldown;
    p.dashTime = dashSet.duration;
    p.deflectRemaining = (p.deflectStacks || 0);
    if (p.bigShot) p.bigShotPending = true;
    if (teledash) {
        // Allow callers to suppress local warmup visual while still running the
        // mechanical warmup on the authoritative side. Default: show visual.
        const showWarmup = (opts && typeof opts.showWarmup !== 'undefined') ? !!opts.showWarmup : true;
        p.teledashWarmupActive = true; // mechanical warmup (authoritative)
        p.teledashPendingTeleport = true;
        p.teledashWarmupTime = dashSet.warmup;
        p.teledashWarmupElapsed = 0;
        p.teledashOrigin = { x: p.x, y: p.y };
        p.teledashLockedAim = opts.lockedAim || null;
        p.teledashSequence = (p.teledashSequence || 0) + 1;
        // Visual-only flag: when false the local client should not draw the ring.
        p.teledashWarmupVisible = showWarmup;
    } else {
        try { playDashWoosh(p.dashTime, dashSet.speedMult); } catch (e) {}
    }
}

function completeTeledash(p, dashSet, aim, blockers = {}) {
    if (!p) return;
    const dest = computeTeledashDestination(p, dashSet, aim, blockers);
    p.x = dest.x;
    p.y = dest.y;
    p.teledashTarget = dest;
    p.teledashWarmupActive = false;
    p.teledashPendingTeleport = false;
    p.teledashOrigin = null;
    p.teledashLockedAim = null;
    p.dashTime = 0;
    p.dashActive = false;
    try { playDashWoosh(dashSet.duration, dashSet.speedMult); } catch (e) {}
}

function updateTeledashWarmup(p, dt, dashSet, aimProvider, blockers = {}) {
    if (!p || !p.teledashWarmupActive) return false;
    p.teledashWarmupElapsed += dt;
    const remaining = Math.max(0, (p.teledashWarmupTime || 0) - p.teledashWarmupElapsed);
    p.dashTime = remaining;
    if (p.teledashWarmupElapsed >= (p.teledashWarmupTime || 0)) {
        const aim = typeof aimProvider === 'function' ? aimProvider() : aimProvider;
        completeTeledash(p, dashSet, aim, blockers);
        return true;
    }
    return false;
}

// Local-only tick for joiner clients: advance the warmup timer and set pending flag
// but do NOT perform the authoritative teleport locally. This keeps the visual
// indicator working for joiners without moving the entity (host is authoritative).
function tickLocalTeledashWarmup(p, dt) {
    if (!p || !p.teledashWarmupActive) return false;
    p.teledashWarmupElapsed += dt;
    const remaining = Math.max(0, (p.teledashWarmupTime || 0) - p.teledashWarmupElapsed);
    p.dashTime = remaining;
    if (p.teledashWarmupElapsed >= (p.teledashWarmupTime || 0)) {
        // Warmup completed locally: clear warmup visual and mark pending teleport
        p.teledashWarmupActive = false;
        p.teledashPendingTeleport = true;
        return true;
    }
    return false;
}

// --- Enemy AI helper: line of sight (simple) ---
function hasLineOfSight(ax, ay, bx, by, obstacles) {
    let steps = 14;
    for (let i = 0; i <= steps; ++i) {
        let t = i / steps;
        let x = lerp(ax, bx, t);
        let y = lerp(ay, by, t);
        for (let o of obstacles) {
            if (o.circleCollide(x, y, 8)) return false;
        }
    }
    return true;
}

// --- Game State ---
let canvas, ctx;
let mouse = { x: window.CANVAS_W/2, y: CANVAS_H/2 };
window.mouse = mouse;
let keys = {};
var player, enemy, bullets, obstacles;
let enemyCount = 1;
let enemyDisabled = false; // when true, enemy exists but AI/draw are disabled (for 0 enemies option; ignored in MP)
let explosions = [];
// Visual-only impact line effects when bullets hit obstacles
let impactLines = [];
let lastTimestamp = 0;
let cardState = { active: false, player: null, callback: null };

function isSelectionPauseActive() {
    if (cardState && cardState.active) return true;
    if (waitingForCard) return true;
    try {
        if (roundFlowState && (roundFlowState.awaitingCardSelection || roundFlowState.roundTransitionActive)) return true;
    } catch (e) {}
    try {
        if (cardDraftManager && typeof cardDraftManager.hasActiveDraft === 'function' && cardDraftManager.hasActiveDraft()) return true;
    } catch (e) {}
    try {
        if (window._pendingWorldModOffer) return true;
    } catch (e) {}
    if (window._victoryPauseActive) return true;
    return false;
}
let running = false;
let animFrameId = null;
let waitingForCard = false;

// Multiplayer start coordination helpers
let waitingForPlayers = false;
const readyPlayers = new Set();
let pendingRoundStartPayload = null;

function getLocalReadyKey() {
    if (typeof NET === 'undefined' || !NET.connected) return 'local';
    if (NET.role === 'host') return 'host';
    const idx = (typeof NET.joinerIndex === 'number' && NET.joinerIndex >= 0) ? NET.joinerIndex : 0;
    return `joiner${idx}`;
}

function getExpectedReadyCount() {
    if (typeof NET === 'undefined' || !NET.connected) return 1;
    if (typeof window.multiplayerPlayerCount === 'number' && window.multiplayerPlayerCount > 0) {
        return window.multiplayerPlayerCount;
    }
    if (Array.isArray(lobbyPlayers) && lobbyPlayers.length > 0) {
        return lobbyPlayers.length;
    }
    if (Array.isArray(NET.joiners)) {
        return 1 + NET.joiners.length;
    }
    return 2;
}

function ensureWaitingOverlay() {
    if (typeof document === 'undefined') return null;
    if (!window._mpWaitingOverlay && document.body) {
        const overlay = document.createElement('div');
        overlay.id = 'mp-waiting-overlay';
        overlay.innerText = 'Waiting for other players...';
        overlay.style.position = 'fixed';
        overlay.style.left = '50%';
        overlay.style.top = '50%';
        overlay.style.transform = 'translate(-50%, -50%)';
        overlay.style.padding = '16px 32px';
        overlay.style.background = 'rgba(18, 24, 38, 0.9)';
        overlay.style.color = '#ffffff';
        overlay.style.fontFamily = 'inherit';
        overlay.style.fontSize = '1.6em';
        overlay.style.fontWeight = '700';
        overlay.style.borderRadius = '14px';
        overlay.style.boxShadow = '0 12px 32px rgba(0,0,0,0.45)';
        overlay.style.zIndex = '1200';
        overlay.style.pointerEvents = 'none';
        overlay.style.display = 'none';
        document.body.appendChild(overlay);
        window._mpWaitingOverlay = overlay;
    }
    return window._mpWaitingOverlay || null;
}

function showWaitingOverlay() {
    const overlay = ensureWaitingOverlay();
    if (overlay) overlay.style.display = 'block';
    waitingForPlayers = true;
}

function hideWaitingOverlay() {
    const overlay = window._mpWaitingOverlay;
    if (overlay) overlay.style.display = 'none';
    waitingForPlayers = false;
}

function resetMultiplayerReadyState() {
    readyPlayers.clear();
    pendingRoundStartPayload = null;
    waitingForPlayers = false;
    hideWaitingOverlay();
}

function maybeStartRoundIfReady() {
    if (typeof NET === 'undefined' || NET.role !== 'host' || !NET.connected) return;
    if (!pendingRoundStartPayload) return;
    if (!readyPlayers.has('host')) return;
    const expected = Math.max(1, getExpectedReadyCount());
    if (readyPlayers.size < expected) return;
    const payload = pendingRoundStartPayload;
    pendingRoundStartPayload = null;
    try {
        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify({ type: 'relay', data: payload }));
        }
    } catch (e) {}
    readyPlayers.clear();
    hideWaitingOverlay();
    startGame();
}

function handleLocalReadyForStart(roundStartPayload) {
    if (typeof NET === 'undefined' || !NET.connected) {
        startGame();
        return;
    }
    const key = getLocalReadyKey();
    showWaitingOverlay();
    if (NET.role === 'host') {
        if (roundStartPayload) pendingRoundStartPayload = roundStartPayload;
        readyPlayers.add('host');
        maybeStartRoundIfReady();
    } else {
        if (!readyPlayers.has(key)) readyPlayers.add(key);
        try {
            if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                const idx = (typeof NET.joinerIndex === 'number' && NET.joinerIndex >= 0) ? NET.joinerIndex : 0;
                window.ws.send(JSON.stringify({ type: 'relay', data: { type: 'player-ready', joinerIndex: idx } }));
            }
        } catch (e) {}
    }
}

// === Host-authoritative networking helpers ===
const NET = {
    role: null, // 'host' | 'joiner'
    connected: false,
    hostName: '',
    joiners: [],
    joinerIndex: null,
    pendingName: '',
    inputSeq: 0,
    lastInputSentAt: 0,
    lastSnapshotSentAt: 0,
    INPUT_HZ: 30,
    SNAPSHOT_HZ: 30,
    // Timeouts (ms) to detect dropped connections
    TIMEOUT_INPUT_MS: 4000,   // host expects joiner inputs at least every 4s
    TIMEOUT_SNAPSHOT_MS: 5000, // joiner expects host snapshots at least every 5s
    lastInputAt: 0,     // host: last time an input was received from joiner
    lastSnapshotAt: 0,  // joiner: last time a snapshot was received from host
    remoteInput: { up:false,down:false,left:false,right:false,shoot:false,dash:false,aimX:0,aimY:0,seq:0 },
    // Per-joiner input maps for multiplayer with multiple joiners
    remoteInputs: {}, // keyed by joinerIndex
    remoteShootQueuedMap: {},
    remoteDashReqSeqMap: {},
    lastInputAtMap: {},
    lastProcessedRemoteDashSeqMap: {},
    // Debug helpers (development only)
    _debugLastInputSeqMap: {},
    shootLatch: false, // joiner-side edge trigger to avoid hold-to-shoot
    // Host latches for joiner one-shot actions so they fire when off cooldown
    remoteShootQueued: false,
    remoteDashQueued: false,
    // Sequence-tracked remote requests to avoid duplicate processing
    remoteDashReqSeq: 0,
    lastProcessedRemoteDashSeq: 0,
    // Joiner-side dash edge latch (so dash is sent as a single press)
    dashLatch: false,
    bulletCounter: 1,
    // Joiner-side smoothing targets
    joinerTargets: { p0: null, p1: null, healers: new Map(), rosterBots: new Map() },
    myName: '', // local player's display name
    peerName: '', // first remote player's display name (legacy fallback)
    resetSessionState() {
        this.joiners = [];
        this.joinerIndex = null;
        this.peerName = '';
        this.hostName = '';
        this.pendingName = '';
    },
    updateJoinerName(index, name, meta = {}) {
        if (!Number.isInteger(index) || index < 0) return;
        while (this.joiners.length <= index) this.joiners.push(null);
        const current = this.joiners[index] || { index };
        const cleaned = (name || '').toString().slice(0, 32);
        current.index = index;
        if (cleaned.length) current.name = cleaned;
        const mergedMeta = Object.assign({}, current.meta || {}, meta || {});
        if (!mergedMeta.color) {
            mergedMeta.color = getJoinerColor(index);
        }
        current.meta = mergedMeta;
        this.joiners[index] = current;
        if (this.role === 'host') {
            if (!this.peerName || index === 0) {
                this.peerName = current.name || this.peerName || '';
            }
        }
    },
    getJoinerName(index) {
        if (!Number.isInteger(index) || index < 0) return '';
        const entry = this.joiners[index];
        return entry && entry.name ? entry.name : '';
    },
    removeJoiner(index) {
        if (!Number.isInteger(index) || index < 0) return;
        if (index < this.joiners.length) {
            this.joiners[index] = null;
        }
        if (this.role === 'host' && index === 0) {
            const next = this.joiners.find(entry => entry && entry.name);
            this.peerName = next ? next.name : '';
        }
    },
    setRole(role) {
        this.role = role;
        this.updateEventSystem();
    },
    setConnected(c) {
        this.connected = !!c;
        this.updateEventSystem();
    },
    updateEventSystem() {
        if (typeof GameEvents !== 'undefined' && typeof GameEvents.setNetworkState === 'function') {
            GameEvents.setNetworkState(this.role === 'host', this.connected);
        }
    },
    now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); },
    // JOINER: package local input and send
    sendInputs() {
        if (!window.ws || window.ws.readyState !== WebSocket.OPEN || this.role !== 'joiner') return;
        const input = this.collectLocalInput();
        this.inputSeq++;
        const payload = { type: 'input', seq: this.inputSeq, input, joinerIndex: (Number.isInteger(this.joinerIndex) ? this.joinerIndex : null) };
        try { window.ws.send(JSON.stringify({ type: 'relay', data: payload })); } catch (e) {}
    },
    // HOST: send snapshot to joiner
    sendSnapshot() {
        if (!this.connected) return;
        if (!window.ws || window.ws.readyState !== WebSocket.OPEN || this.role !== 'host') return;
        const snap = this.buildSnapshot();
        const payload = { type: 'snapshot', snap };
        try { window.ws.send(JSON.stringify({ type: 'relay', data: payload })); } catch (e) {}
    },
    onFrame(dt) {
        const now = this.now();
        // Rate-limit input and snapshot traffic
        if (this.role === 'joiner' && now - this.lastInputSentAt >= (1000 / this.INPUT_HZ)) {
            this.sendInputs();
            this.lastInputSentAt = now;
        }
        if (this.role === 'host' && now - this.lastSnapshotSentAt >= (1000 / this.SNAPSHOT_HZ)) {
            this.sendSnapshot();
            this.lastSnapshotSentAt = now;
        }
        // Timeout checks
        if (this.connected) {
            if (this.role === 'host') {
                if (this.lastInputAt && (now - this.lastInputAt) > this.TIMEOUT_INPUT_MS) {
                    this.handleDisconnect('No input from joiner');
                }
            } else if (this.role === 'joiner') {
                if (this.lastSnapshotAt && (now - this.lastSnapshotAt) > this.TIMEOUT_SNAPSHOT_MS) {
                    this.handleDisconnect('No snapshots from host');
                }
            }
        }
    },
    // Build a host snapshot (includes timers for cooldown ring rendering)
    buildSnapshot() {
        const serializePlayer = (p) => {
            const dashSet = getDashSettings(p) || {};
            return {
                x: p.x,
                y: p.y,
                hp: p.health,
                ts: p.timeSinceShot,
                si: p.shootInterval,
                dc: p.dashCooldown,
                // include authoritative total cooldown so clients render the ring consistently
                dcMax: typeof dashSet.cooldown === 'number' ? dashSet.cooldown : null,
                da: !!p.dashActive,
                dt: p.dashTime || 0,
                td: !!p.teledash,
                // NOTE: teledash warmup (visual indicator) is synced for mutual visibility
                // so both players can see the warmup ring. Sequence and pending teleport
                // ensure teleport completion and ordering still sync correctly.
                tdA: !!p.teledashWarmupActive,
                tdE: p.teledashWarmupElapsed || 0,
                tdT: p.teledashWarmupTime || 0,
                tdS: p.teledashSequence || 0,
                tdP: !!p.teledashPendingTeleport,
                tdV: !!p.teledashWarmupVisible
            };
        };
        const snap = {
            names: {
                p0: (this.role === 'host' ? (this.myName || (player && player.displayName) || 'Player 1') : (this.peerName || (player && player.displayName) || 'Player 1')),
                p1: (this.role === 'host' ? (this.peerName || (enemy && enemy.displayName) || 'Player 2') : (this.myName || (enemy && enemy.displayName) || 'Player 2'))
            },
            players: [
                serializePlayer(player),
                serializePlayer(enemy)
            ],
            bullets: bullets.map(b => ({ id: b.id, x: b.x, y: b.y, angle: b.angle, speed: b.speed, r: b.radius, dmg: b.damage, bnc: b.bouncesLeft, obl: !!b.obliterator, ex: !!b.explosive, ownerRole: ((b.owner && b.owner._isRosterBot) ? 'host' : (b.owner === player ? 'host' : 'joiner')), ownerFighterId: (b.owner && b.owner._rosterFighterId) ? b.owner._rosterFighterId : null })),
            healersActive: !!healersActive,
            healers: (healersActive ? healers.filter(h => h && h.active).map(h => ({
                id: h.id,
                x: h.x,
                y: h.y,
                health: h.health,
                healthMax: h.healthMax,
                damageFlash: h.damageFlash,
                shakeTime: h.shakeTime,
                shakeMag: h.shakeMag,
                burning: h.burning ? { time: h.burning.time || 0, duration: h.burning.duration || 0, nextTick: h.burning.nextTick || 0 } : null
            })) : []),
            healerRespawn: {
                pending: !!healerPendingRespawn,
                timer: healerRespawnTimer,
                delay: healerRespawnDelay,
                preSpawnPos: healerPreSpawnPos
            },
            firestormPreSpawn: {
                pos: firestormPreSpawnPos,
                timer: firestormPreSpawnTimer,
                delay: firestormPreSpawnDelay
            }
            ,
            // Host includes roster-assigned bot state so joiners can be driven by host
            rosterBots: (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.getFighters === 'function') ? (function(){
                try {
                    const out = [];
                    const fighters = playerRoster.getFighters({ includeUnassigned: false, includeEntity: true }) || [];
                    for (const f of fighters) {
                        if (!f || f.kind !== 'bot') continue;
                        const ent = playerRoster.getEntityReference(f.id) || f.entity || null;
                        if (!ent) continue;
                        const s = serializePlayer(ent);
                        s.fighterId = f.id;
                        out.push(s);
                    }
                    return out;
                } catch (e) { return []; }
            })() : [],
            // Also include roster-assigned human players (joiners) so joiners receive authoritative positions
            rosterPlayers: (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.getFighters === 'function') ? (function(){
                try {
                    const out = [];
                    const fighters = playerRoster.getFighters({ includeUnassigned: false, includeEntity: true }) || [];
                    for (const f of fighters) {
                        if (!f) continue;
                        // Expose human-controlled roster fighters (control: 'remote' or with joinerIndex) - skip bots
                        if (f.kind === 'bot') continue;
                        const ent = playerRoster.getEntityReference(f.id) || f.entity || null;
                        if (!ent) continue;
                        const s = serializePlayer(ent);
                        s.fighterId = f.id;
                        s.joinerIndex = (f.metadata) ? coerceJoinerIndex(f.metadata.joinerIndex) : null;
                        s.displayName = f.name || s.displayName || null;
                        // include metadata color if available to allow joiners to color correctly
                        s.color = (f.metadata && f.metadata.color) ? f.metadata.color : (ent && ent.color ? ent.color : null);
                        out.push(s);
                    }
                    return out;
                } catch (e) { return []; }
            })() : []
        };
        return snap;
    },
    // Apply snapshot on joiner
    applySnapshot(snap) {
        if (!snap) return;
        try {
            this.lastSnapshotAt = this.now();
            const p0 = snap.players && snap.players[0]; // host
            const p1 = snap.players && snap.players[1]; // joiner
            if (NET.role === 'joiner') {
                // Stash targets for smoothing and update timers so rings display
                if (p0) {
                    NET.joinerTargets.p0 = { x: p0.x, y: p0.y };
                    enemy.health = p0.hp;
                    if (typeof p0.ts === 'number') enemy.timeSinceShot = p0.ts;
                    if (typeof p0.si === 'number') enemy.shootInterval = p0.si;
                    if (typeof p0.dc === 'number') enemy.dashCooldown = p0.dc;
                    if (typeof p0.dcMax === 'number') enemy.dashCooldownMax = p0.dcMax;
                    enemy.dashActive = !!p0.da;
                    if (typeof p0.dt === 'number') enemy.dashTime = p0.dt;
                    enemy.teledash = !!p0.td;
                    enemy.teledashWarmupActive = !!p0.tdA;
                    enemy.teledashWarmupElapsed = typeof p0.tdE === 'number' ? p0.tdE : (enemy.teledashWarmupElapsed || 0);
                    enemy.teledashWarmupTime = typeof p0.tdT === 'number' ? p0.tdT : (enemy.teledashWarmupTime || 0);
                    enemy.teledashSequence = p0.tdS || enemy.teledashSequence || 0;
                    enemy.teledashPendingTeleport = !!p0.tdP;
                    enemy.teledashWarmupVisible = !!p0.tdV;
                }
                if (p1) {
                    NET.joinerTargets.p1 = { x: p1.x, y: p1.y };
                    // Reconcile joiner's predicted position if it differs significantly from host
                    const distToHost = Math.hypot(player.x - p1.x, player.y - p1.y);
                    if (distToHost > 10) { // threshold for reconciliation
                        player.reconcileX = p1.x;
                        player.reconcileY = p1.y;
                    }
                    player.health = p1.hp;
                    if (typeof p1.ts === 'number') player.timeSinceShot = p1.ts;
                    if (typeof p1.si === 'number') player.shootInterval = p1.si;
                    if (typeof p1.dc === 'number') player.dashCooldown = p1.dc;
                    if (typeof p1.dcMax === 'number') player.dashCooldownMax = p1.dcMax;
                    player.dashActive = !!p1.da;
                    if (typeof p1.dt === 'number') player.dashTime = p1.dt;
                    player.teledash = !!p1.td;
                    player.teledashWarmupActive = !!p1.tdA;
                    player.teledashWarmupElapsed = typeof p1.tdE === 'number' ? p1.tdE : (player.teledashWarmupElapsed || 0);
                    player.teledashWarmupTime = typeof p1.tdT === 'number' ? p1.tdT : (player.teledashWarmupTime || 0);
                    player.teledashSequence = p1.tdS || player.teledashSequence || 0;
                    player.teledashPendingTeleport = !!p1.tdP;
                    player.teledashWarmupVisible = !!p1.tdV;
                }
                // On first snapshot or if positions uninitialized, snap directly to avoid lerp jump
                if (typeof enemy.x !== 'number' || typeof enemy.y !== 'number') { if (p0) { enemy.x = p0.x; enemy.y = p0.y; } }
                if (typeof player.x !== 'number' || typeof player.y !== 'number') { if (p1) { player.x = p1.x; player.y = p1.y; } }
            } else {
                // Fallback mapping (not used on host normally)
                if (p0) {
                    player.x = p0.x; player.y = p0.y; player.health = p0.hp;
                    if (typeof p0.ts === 'number') player.timeSinceShot = p0.ts;
                    if (typeof p0.si === 'number') player.shootInterval = p0.si;
                    if (typeof p0.dc === 'number') player.dashCooldown = p0.dc;
                    player.dashActive = !!p0.da;
                    if (typeof p0.dt === 'number') player.dashTime = p0.dt;
                    player.teledash = !!p0.td;
                    player.teledashWarmupActive = !!p0.tdA;
                    player.teledashWarmupElapsed = typeof p0.tdE === 'number' ? p0.tdE : (player.teledashWarmupElapsed || 0);
                    player.teledashWarmupTime = typeof p0.tdT === 'number' ? p0.tdT : (player.teledashWarmupTime || 0);
                    player.teledashSequence = p0.tdS || player.teledashSequence || 0;
                    player.teledashPendingTeleport = !!p0.tdP;
                    player.teledashWarmupVisible = !!p0.tdV;
                }
                if (p1) {
                    enemy.x = p1.x; enemy.y = p1.y; enemy.health = p1.hp;
                    if (typeof p1.ts === 'number') enemy.timeSinceShot = p1.ts;
                    if (typeof p1.si === 'number') enemy.shootInterval = p1.si;
                    if (typeof p1.dc === 'number') enemy.dashCooldown = p1.dc;
                    enemy.dashActive = !!p1.da;
                    if (typeof p1.dt === 'number') enemy.dashTime = p1.dt;
                    enemy.teledash = !!p1.td;
                    enemy.teledashWarmupActive = !!p1.tdA;
                    enemy.teledashWarmupElapsed = typeof p1.tdE === 'number' ? p1.tdE : (enemy.teledashWarmupElapsed || 0);
                    enemy.teledashWarmupTime = typeof p1.tdT === 'number' ? p1.tdT : (enemy.teledashWarmupTime || 0);
                    enemy.teledashSequence = p1.tdS || enemy.teledashSequence || 0;
                    enemy.teledashPendingTeleport = !!p1.tdP;
                    enemy.teledashWarmupVisible = !!p1.tdV;
                }
            }
            if (typeof snap.healersActive !== 'undefined') {
                if (!snap.healersActive && healersActive) {
                    clearHealers();
                }
                healersActive = !!snap.healersActive;
            }
            if (healersActive) {
                const incomingHealers = new Map();
                for (const h of (snap.healers || [])) {
                    if (!h || typeof h.id === 'undefined') continue;
                    incomingHealers.set(h.id, h);
                }
                for (let i = healers.length - 1; i >= 0; i--) {
                    const h = healers[i];
                    if (!incomingHealers.has(h.id)) healers.splice(i, 1);
                }
                for (const data of incomingHealers.values()) {
                    let h = healers.find(existing => existing.id === data.id);
                    if (!h) {
                        h = new Healer(data.x, data.y);
                        h.id = data.id;
                        healers.push(h);
                    }
                    // Store target position for smoothing on joiner
                    if (NET.role === 'joiner') {
                        NET.joinerTargets.healers.set(data.id, { x: data.x, y: data.y });
                    } else {
                        h.x = data.x;
                        h.y = data.y;
                    }
                    if (typeof data.healthMax === 'number') h.healthMax = data.healthMax;
                    if (typeof data.health === 'number') h.health = data.health;
                    h.active = data.health > 0;
                    h.damageFlash = data.damageFlash || 0;
                    h.shakeTime = data.shakeTime || 0;
                    h.shakeMag = data.shakeMag || 0;
                    if (data.burning) {
                        h.burning = {
                            time: data.burning.time || 0,
                            duration: data.burning.duration || 0,
                            nextTick: data.burning.nextTick
                        };
                    } else {
                        h.burning = null;
                    }
                    if (!Array.isArray(h.flameParticles)) h.flameParticles = [];
                }
                if (snap.healerRespawn) {
                    healerPendingRespawn = !!snap.healerRespawn.pending;
                    healerRespawnTimer = snap.healerRespawn.timer || 0;
                    healerRespawnDelay = snap.healerRespawn.delay || 0;
                    healerPreSpawnPos = snap.healerRespawn.preSpawnPos || null;
                }
                // Sync firestorm pre-spawn state
                if (snap.firestormPreSpawn) {
                    firestormPreSpawnPos = snap.firestormPreSpawn.pos || null;
                    firestormPreSpawnTimer = snap.firestormPreSpawn.timer || 0;
                    firestormPreSpawnDelay = snap.firestormPreSpawn.delay || 2;
                }
            } else {
                healers.length = 0;
                healerPendingRespawn = false;
                healerRespawnTimer = 0;
                healerRespawnDelay = 0;
                healerPreSpawnPos = null;
                if (NET.joinerTargets && NET.joinerTargets.healers) {
                    NET.joinerTargets.healers.clear();
                }
            }
            // bullets: upsert by id, remove missing
            const incoming = new Map();
            for (const sb of (snap.bullets || [])) incoming.set(sb.id, sb);
            for (let i = bullets.length - 1; i >= 0; i--) {
                const id = bullets[i].id;
                if (!incoming.has(id)) bullets.splice(i, 1);
            }
            const have = new Map(bullets.map(b => [b.id, b]));
            for (const sb of incoming.values()) {
                if (have.has(sb.id)) {
                    const b = have.get(sb.id);
                    // For locally controlled bullets, do NOT override position/angle from snapshot
                    const isLocal = (sb.ownerRole === 'host' && NET.role === 'host') || (sb.ownerRole === 'joiner' && NET.role === 'joiner');
                    if (!isLocal) {
                        b.targetX = sb.x; b.targetY = sb.y;
                        b.targetAngle = sb.angle;
                    }
                    b.speed = sb.speed;
                    b.radius = sb.r; b.damage = sb.dmg; b.bouncesLeft = sb.bnc;
                    b.obliterator = !!sb.obl; b.explosive = !!sb.ex;
                    b.active = true;
                    // Set isLocalPlayerBullet for host/joiner bullets
                    if (isLocal) {
                        b.isLocalPlayerBullet = true;
                    }
                    // Recompute visual trail scaling (joiner needs these to match host visuals)
                    try {
                        const speedBased = Math.round((b.speed || 0) / 85);
                        const damageBased = Math.round(Math.min(6, (b.damage || 0) * 0.6));
                        b.trailMax = Math.max(2, Math.min(18, speedBased + damageBased));
                        b.trailSizeScale = Math.max(0.08, Math.min(4.0, 0.10 + (b.damage || 0) * 0.09));
                        b.trailAlphaScale = Math.max(0.02, Math.min(3.0, 0.03 + (b.damage || 0) * 0.06));
                    } catch (e) {}
                } else {
                    // Map ownerRole from snapshot to a local entity so visual owner/color is correct
                    let owner = (typeof sb.ownerRole === 'string') ? getEntityForRole(sb.ownerRole) : player;
                    // If snapshot includes an ownerFighterId (roster bot), try to map to the local entity reference
                    try {
                        if (sb.ownerFighterId && typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.getEntityReference === 'function') {
                            const ref = playerRoster.getEntityReference(sb.ownerFighterId);
                            if (ref) owner = ref;
                        }
                    } catch (e) {}
                    const nb = new Bullet(owner, sb.x, sb.y, sb.angle);
                    nb.id = sb.id; nb.speed = sb.speed; nb.radius = sb.r; nb.damage = sb.dmg;
                    nb.bouncesLeft = sb.bnc; nb.obliterator = !!sb.obl; nb.explosive = !!sb.ex;
                    nb.active = true;
                    nb.targetX = sb.x; nb.targetY = sb.y;
                    nb.targetAngle = sb.angle;
                    // Set isLocalPlayerBullet for joiner's bullets
                    if (sb.ownerRole === 'joiner' && NET.role === 'joiner') {
                        nb.isLocalPlayerBullet = true;
                    }
                    // Ensure visual trail scaling matches the host snapshot's damage/speed
                    try {
                        const speedBased = Math.round((nb.speed || 0) / 85);
                        const damageBased = Math.round(Math.min(6, (nb.damage || 0) * 0.6));
                        nb.trailMax = Math.max(2, Math.min(18, speedBased + damageBased));
                        nb.trailSizeScale = Math.max(0.08, Math.min(4.0, 0.10 + (nb.damage || 0) * 0.09));
                        nb.trailAlphaScale = Math.max(0.02, Math.min(3.0, 0.03 + (nb.damage || 0) * 0.06));
                        if (!Array.isArray(nb.trail)) nb.trail = [];
                    } catch (e) {}
                    bullets.push(nb);
                }
            }

            // Apply roster bot state (joiner: smooth toward host-provided targets)
            try {
                const roster = snap.rosterBots || [];
                if (NET.role === 'joiner' && Array.isArray(roster) && roster.length) {
                    // Build a quick map of existing roster entities by fighterId
                    const existingMap = new Map();
                    if (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.getFighters === 'function') {
                        const fighters = playerRoster.getFighters({ includeUnassigned: true, includeEntity: true }) || [];
                        for (const f of fighters) {
                            if (!f) continue;
                            existingMap.set(f.id, f.entity || null);
                        }
                    }
                    for (const rb of roster) {
                        if (!rb || typeof rb.fighterId === 'undefined') continue;
                        const fid = rb.fighterId;
                        let ent = existingMap.get(fid) || null;
                        if (!ent) {
                            // Create a visual-only entity for this roster bot
                            ent = new Player(false, '#ff5a5a', rb.x || 0, rb.y || 0);
                            ent.displayName = rb.displayName || rb.name || `Bot ${fid}`;
                            // Register with roster if possible
                            try { if (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.setEntityReference === 'function') playerRoster.setEntityReference(fid, ent); } catch (e) {}
                        }
                        // Mark as roster-driven so joiner doesn't run local AI
                        ent._isRosterBot = true;
                        // Store smoothing target
                        if (NET.joinerTargets && NET.joinerTargets.rosterBots) {
                            NET.joinerTargets.rosterBots.set(fid, { x: rb.x, y: rb.y });
                        }
                        // Apply authoritative stats immediately (health, cooldowns)
                        if (typeof rb.hp === 'number') ent.health = rb.hp;
                        if (typeof rb.ts === 'number') ent.timeSinceShot = rb.ts;
                        if (typeof rb.si === 'number') ent.shootInterval = rb.si;
                        if (typeof rb.dc === 'number') ent.dashCooldown = rb.dc;
                        ent.dashActive = !!rb.da;
                        ent.teledash = !!rb.td;
                        ent.teledashWarmupActive = !!rb.tdA;
                    }
                } else if (NET.role === 'host') {
                    // Host: ensure any roster bot entries map to local entities and mark them as roster bots
                    const roster = snap.rosterBots || [];
                    for (const rb of roster) {
                        if (!rb || typeof rb.fighterId === 'undefined') continue;
                        const fid = rb.fighterId;
                        try {
                            if (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.getEntityReference === 'function') {
                                const ent = playerRoster.getEntityReference(fid) || null;
                                if (ent) ent._isRosterBot = true;
                            }
                        } catch (e) {}
                    }
                }
                // Also handle human roster players so joiners see other joiners' movement/colors
                try {
                    const rplayers = snap.rosterPlayers || [];
                    if (NET.role === 'joiner' && Array.isArray(rplayers) && rplayers.length) {
                        // Upsert entities for each roster player reported by host
                        for (const rp of rplayers) {
                            if (!rp || typeof rp.fighterId === 'undefined') continue;
                            let ent = null;
                            try { ent = (playerRoster && typeof playerRoster.getEntityReference === 'function') ? playerRoster.getEntityReference(rp.fighterId) : null; } catch (e) { ent = null; }
                            if (!ent) {
                                // Create a visual-only Player entity for this roster player
                                ent = new Player(false, rp.color || '#ffffff', rp.x || 0, rp.y || 0);
                                ent.displayName = rp.displayName || `Player ${rp.fighterId}`;
                                // Register entity with roster so future mapping works
                                try { if (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.setEntityReference === 'function') playerRoster.setEntityReference(rp.fighterId, ent); } catch (e) {}
                            }
                            // Mark as a roster-driven human (not a bot)
                            ent._isRosterHuman = true;
                            ent._rosterFighterId = rp.fighterId;
                            // Apply authoritative stats
                            ent.x = typeof rp.x === 'number' ? rp.x : ent.x;
                            ent.y = typeof rp.y === 'number' ? rp.y : ent.y;
                            if (typeof rp.hp === 'number') ent.health = rp.hp;
                            if (typeof rp.ts === 'number') ent.timeSinceShot = rp.ts;
                            if (typeof rp.si === 'number') ent.shootInterval = rp.si;
                            if (typeof rp.dc === 'number') ent.dashCooldown = rp.dc;
                            ent.dashActive = !!rp.da;
                            ent.teledash = !!rp.td;
                            ent.teledashWarmupActive = !!rp.tdA;
                            // Smoothing target map for roster players
                            if (NET.joinerTargets && NET.joinerTargets.rosterPlayers) {
                                NET.joinerTargets.rosterPlayers.set(rp.fighterId, { x: rp.x, y: rp.y });
                            } else if (NET.joinerTargets) {
                                NET.joinerTargets.rosterPlayers = new Map();
                                NET.joinerTargets.rosterPlayers.set(rp.fighterId, { x: rp.x, y: rp.y });
                            }
                            // Update color and display name for accurate visuals
                            try { if (rp.color) ent.color = rp.color; } catch (e) {}
                            try { if (rp.displayName) ent.displayName = rp.displayName; } catch (e) {}
                        }
                    }
                } catch (e) {}
            } catch (e) {}
        } catch (e) { /* ignore snapshot errors to avoid crashing */ }
    },
    // Assign an id to a newly created bullet (host only)
    tagBullet(b) {
        if (!b.id) b.id = 'b' + (Date.now().toString(36)) + '-' + (this.bulletCounter++);
    },
    // Read local input (joiner). We map to existing variables.
    collectLocalInput() {
    // If player entity is not active (eliminated/disabled), return neutral input
    try { if (!isEntityActive(player)) return { up: false, down: false, left: false, right: false, shoot: false, dash: false, aimX: 0, aimY: 0 }; } catch (e) {}

    // Shoot: continuous while held. Use keyboard state or legacy player.shootQueued as a fallback.
    const spacePressed = !!keys[' '] || !!keys['space'] || !!player.shootQueued;
    const shootPressed = !!spacePressed;
        // Dash: triggers only on transition from not-held to held, not repeatedly while held
        const dashHeld = !!keys['shift'];
        let dashTrigger = false;
        if (player.dash && dashHeld && !this.dashLatch && !player.dashActive && player.dashCooldown <= 0) {
            dashTrigger = true;
            this.dashLatch = true;
        }
        if (!dashHeld) {
            this.dashLatch = false;
        }
        const out = {
            up: !!keys['w'],
            down: !!keys['s'],
            left: !!keys['a'],
            right: !!keys['d'],
            shoot: shootPressed,
            dash: dashTrigger,
            aimX: mouse.x,
            aimY: mouse.y
        };
        // If this client is a joiner and is initiating a dash, start a local-only warmup
        // so the player immediately sees the range ring. The actual teleport remains
        // host-authoritative and will be applied via snapshot/pending flags.
        try {
            if (NET.role === 'joiner' && out.dash && player && player.dash && !player.dashActive && player.dashCooldown <= 0) {
                const dashSet = getDashSettings(player);
                player.dashActive = true;
                player.dashDir = player.dashDir || { x: 0, y: 0 };
                player.dashCooldown = dashSet.cooldown;
                player.dashTime = dashSet.duration;
                if (isTeledashEnabled(player)) {
                    player.teledashWarmupActive = true;
                    player.teledashPendingTeleport = true;
                    player.teledashWarmupTime = dashSet.warmup;
                    player.teledashWarmupElapsed = 0;
                    player.teledashOrigin = { x: player.x, y: player.y };
                    player.teledashSequence = (player.teledashSequence || 0) + 1;
                    player.teledashWarmupVisible = true; // show local visual for joiner
                }
            }
        } catch (e) {}
    // Update latch state (used for local edge-detection elsewhere like dash)
    this.shootLatch = !!spacePressed;
    this.dashLatch = !!dashHeld;
        return out;
    },
    handleDisconnect(reason) {
        // Close ws gracefully
        try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.close(); } catch (e) {}
        this.setConnected(false);
        this.resetSessionState();
        // Reset latches
        this.remoteShootQueued = false; this.remoteDashQueued = false;
        // Revert colors to single-player default
    if (player) player.color = HOST_PLAYER_COLOR;
    if (enemy) enemy.color = getJoinerColor(0);
        // Stop current game loop and show setup so both players are forced back to lobby
        try { stopGame(); } catch (e) {}
        // Show reconnect button to allow the user to attempt to reconnect to the same session
        try { showReconnectButton(); } catch (e) {}
        // Inform the user unobtrusively
        try { console.warn('Multiplayer disconnected:', reason); } catch (e) {}
    }
};

function isEnemySuppressedForGameplay() {
    if (!enemyDisabled) return false;
    if (NET && NET.connected) {
        if (NET.role === 'host') {
            return !(Array.isArray(NET.joiners) && NET.joiners.some(entry => entry && entry.index === 0));
        }
        if (NET.role === 'joiner') {
            return false;
        }
    }
    return true;
}

function sendLocalDisplayName(extra = {}) {
    if (!window.ws || window.ws.readyState !== WebSocket.OPEN) return;
    const name = (NET.myName || '').toString().slice(0, 32);
    const payload = Object.assign({}, extra || {}, {
        type: 'set-name',
        name,
        role: NET.role
    });
    if (NET.role === 'joiner' && Number.isInteger(NET.joinerIndex)) {
        payload.joinerIndex = NET.joinerIndex;
    }
    try {
        window.ws.send(JSON.stringify({ type: 'relay', data: payload }));
    } catch (e) {}
}


// === Effect Processing Functions for Joiner-Side Visuals ===
function applyExplosionEvent(data) {
    // Create explosion visual only (no damage logic)
    if (!data) return;
    explosions.push(new Explosion(data.x, data.y, data.radius, data.color, 0, null));
    if (typeof playExplosion === 'function') playExplosion();
}

// Spawn impact line effects at x,y. count is number of lines; strength scales visuals
function createImpactLines(x, y, damage, color, baseAngle) {
    // Threshold: below this damage, produce no visible impact lines
    const MIN_VISIBLE_DAMAGE = 6;
    if (!damage || damage <= MIN_VISIBLE_DAMAGE) return; // skip for very small damage

    // Non-linear scaling: map damage to 0..1 using a reference range
    const REF_MAX = 48; // damage at which effects reach full scale
    const norm = Math.max(0, Math.min(1, (damage - MIN_VISIBLE_DAMAGE) / (REF_MAX - MIN_VISIBLE_DAMAGE)));

    // Count grows with damage (non-linear: ease-in)
    const maxCount = 12;
    const count = Math.round(Math.pow(norm, 1.25) * maxCount);

    const speed = 300 + norm * 400; // px/sec scaled by normalized damage
    const life = 0.04 + norm * 0.36; // grows with damage but stays short for low damage

    for (let i = 0; i < count; ++i) {
        let angle;
        if (typeof baseAngle === 'number') {
            const jitter = (Math.random() - 0.5) * 0.35;
            const offset = (i - (count - 1) / 2) * (Math.PI * 0.10);
            angle = baseAngle + offset + jitter;
        } else {
            const diag = (Math.random() < 0.5) ? (Math.PI / 4) : (-Math.PI / 4);
            const jitter = (Math.random() - 0.5) * 0.35;
            angle = diag + jitter + (Math.random() * Math.PI * 0.14 - Math.PI * 0.07);
        }
        const mag = speed * (0.6 + Math.random() * 0.8);
        // width and alpha scale using eased normalized damage
        const width = 0.35 + Math.pow(norm, 1.6) * 3.2; // base small, max ~3.55
        const alphaScale = 0.06 + Math.pow(norm, 1.4) * 1.8; // base very small, max ~1.86
        impactLines.push({ x, y, vx: Math.cos(angle) * mag, vy: Math.sin(angle) * mag, life, t: 0, color: color || '#ffd966', width, alphaScale });
    }
}

function applyInfestationDieEvent(data) {
    // Visual-only: play the same small poof explosion when an infested chunk dies on joiner
    if (!data) return;
    // Prefer to find the infested chunk by id and deactivate it so visuals stay in sync
    try {
        if (typeof data.id !== 'undefined') {
            const found = (infestedChunks || []).find(ic => ic && (ic.id === data.id));
            if (found) {
                // trigger local poof at the chunk center and deactivate
                const cx = found.x + found.w/2;
                const cy = found.y + found.h/2;
                found.active = false;
                try { explosions.push(new Explosion(cx, cy, 25, "#8f4f8f", 0, null, false)); } catch (e) {}
                try { if (typeof playSoftPoof === 'function') playSoftPoof(); } catch (e) {}
                return;
            }
        }
    } catch (e) {}
    // Fallback: spawn visual by coords if id not found
    const x = typeof data.x === 'number' ? data.x : (data.cx || 0);
    const y = typeof data.y === 'number' ? data.y : (data.cy || 0);
    explosions.push(new Explosion(x, y, 25, "#8f4f8f", 0, null, false));
    if (typeof playSoftPoof === 'function') playSoftPoof();
}

function applyDamageFlashEvent(data) {
    // Find entity by ID and apply visual damage flash
    if (!data) return;
    let entity = null;
    if (data.fighterId != null) {
        entity = getEntityForFighterId(data.fighterId);
    }
    if (!entity && typeof data.entityId !== 'undefined') {
        if (player && player.id === data.entityId) entity = player;
        else if (enemy && enemy.id === data.entityId) entity = enemy;
    }
    if (!entity && Array.isArray(healers)) {
        entity = healers.find(h => h && (h.id === data.entityId || h.id === data.fighterId)) || null;
    }
    if (entity && typeof entity.applyDamageFlash === 'function') {
        entity.applyDamageFlash(data.damage, data.isBurning);
        if (typeof playHit === 'function') playHit();
    }
}

function applyHealingEffectEvent(data) {
    if (!data || typeof data.entityId === 'undefined') return;
    let entity = null;
    if (player && player.id === data.entityId) entity = player;
    else if (enemy && enemy.id === data.entityId) entity = enemy;
    // If not found among players, try healers
    if (!entity && Array.isArray(healers)) {
        entity = healers.find(h => h && h.id === data.entityId) || null;
    }
    if (!entity || typeof entity.triggerHealingEffect !== 'function') return;
    const healAmount = typeof data.healAmount === 'number' ? data.healAmount : 0;
    const intensityOverride = typeof data.intensity === 'number' ? data.intensity : 0;
    // Joiner-side: show visuals and locally apply heal so the joiner sees HP change immediately.
    // Host already applied the authoritative heal; this event is primarily for joiner clients.
    try {
        entity.triggerHealingEffect(Math.max(healAmount, 1), { skipSync: true, intensityOverride });
    } catch (e) {}
    try {
        // Only apply health change locally on non-host clients (joiner) or when entity isn't the authoritative one
        if (typeof NET !== 'undefined' && NET && NET.connected && NET.role === 'joiner') {
            if (typeof entity.health === 'number' && typeof entity.healthMax === 'number') {
                entity.health = Math.min(entity.healthMax, (entity.health || 0) + Math.max(0, healAmount));
            }
        }
    } catch (e) {}
}

function applyChunkUpdateEvent(data) {
    // Find obstacle by index and apply chunk updates
    if (!data || typeof data.obstacleIndex !== 'number' || !Array.isArray(data.updates)) return;
    const obs = obstacles[data.obstacleIndex];
    if (!obs || !obs.chunks) return;
    for (const upd of data.updates) {
        const c = obs.chunks[upd.i];
        if (!c) continue;
        if (typeof upd.destroyed !== 'undefined') c.destroyed = !!upd.destroyed;
        if (typeof upd.flying !== 'undefined') c.flying = !!upd.flying;
        if (typeof upd.alpha !== 'undefined') c.alpha = upd.alpha;
        if (typeof upd.x === 'number') c.x = upd.x;
        if (typeof upd.y === 'number') c.y = upd.y;
        if (typeof upd.vx === 'number') c.vx = upd.vx;
        if (typeof upd.vy === 'number') c.vy = upd.vy;
        // Apply burning state if present
        if (upd.burning) {
            c.burning = { time: upd.burning.time || 0, duration: upd.burning.duration || 2.5, power: upd.burning.power || 1 };
            if (!c.flameParticles) c.flameParticles = [];
        } else if (upd.burning === null) {
            c.burning = null;
        }
    }
}

function applyParticleEvent(data) {
    // Extend as needed for burning, infested chunks, etc.
    // Example: spawn particles for burning chunks
    // (Implementation depends on your particle system)
}

function applyInfestationSpawnEvent(data) {
    if (!data) return;
    // Create a visual-only infested chunk on joiner
    try {
        // Respect max active infested chunks for visuals too
        try {
            const activeCount = (infestedChunks || []).filter(ic => ic && ic.active).length;
            if (activeCount < 10) {
                // avoid duplicate visuals if we already have a chunk with this id
                if (typeof data.id !== 'undefined' && (infestedChunks || []).some(ic => ic && ic.id === data.id)) return;
                // create visual-only infested chunk on joiner
                const chunkStub = { x: data.x, y: data.y, w: data.w, h: data.h, hp: data.hp || 1 };
                const ic = new InfestedChunk(chunkStub, null, true);
                // keep the new infested chunk active for visuals; set id so die events map correctly
                ic.id = data.id || ic.id;
                infestedChunks.push(ic);
            }
        } catch (e) {}
    } catch (e) { /* ignore errors on joiner */ }
}

function applyFirestormPreSpawnEvent(data) {
    if (!data || (typeof NET !== 'undefined' && NET.role === 'host')) return;
    try {
        if (typeof data.delay === 'number' && data.delay > 0) {
            firestormPreSpawnDelay = data.delay;
        }
        firestormPreSpawnTimer = data.timer || 0;
        if (typeof data.x === 'number' && typeof data.y === 'number') {
            const radius = (typeof data.radius === 'number' && data.radius > 0) ? data.radius : (firestormPreSpawnPos ? firestormPreSpawnPos.radius : 200);
            firestormPreSpawnPos = { x: data.x, y: data.y, radius };
        } else {
            firestormPreSpawnPos = null;
        }
    } catch (e) {}
}

function applyFirestormSpawnEvent(data) {
    if (!data) return;
    try {
        // Create visual-only firestorm instance on joiner
        firestormInstance = new Firestorm(data.x, data.y, data.radius);
        // If a stop flag is included, clear immediately
        if (data.done) firestormInstance = null;
        // Clear any pending pre-spawn warning once the firestorm starts or finishes
        if (!data || data.done || typeof data.x === 'number') {
            firestormPreSpawnPos = null;
            firestormPreSpawnTimer = 0;
        }
    } catch (e) {}
}

function applyDynamicSpawnEvent(data) {
    if (!data) return;
    try {
        const oi = data.obstacleIndex;
        const odata = data.obstacle;
        if (typeof oi === 'number' && odata) {
            // Create visual-only obstacle exactly at the host-specified index so joiner map matches host
            const obs = new Obstacle(odata.x, odata.y, odata.w, odata.h);
            // Expand array if needed
            while (obstacles.length <= oi) obstacles.push(null);
            obstacles[oi] = obs;
            // Clear any residual destroyed flag on this slot (host intends this to be active)
            obs.destroyed = false;
            // no-op
        }
    } catch (e) {}
}

function applyDynamicDespawnEvent(data) {
    if (!data) return;
    try {
        const oi = data.obstacleIndex;
        if (typeof oi === 'number' && obstacles[oi]) {
            const o = obstacles[oi];
            // Animate chunks flying off on joiner for visuals
            for (const c of o.chunks) {
                if (!c.destroyed) {
                    c.destroyed = true;
                    c.flying = true;
                    c.vx = (Math.random()-0.5) * 140;
                    c.vy = -Math.random() * 200 - 40;
                    c.alpha = 1;
                }
            }
            o.destroyed = true;
            // Note: joiner must NOT autonomously spawn replacements — host is authoritative.
            // Any replacement or further dynamic-spawn will arrive as a `dynamic-spawn` event from host.
            // no-op
        }
    } catch (e) {}
}

function applyBurningStartEvent(data) {
    if (!data) return;
    try {
        // Prefer fighterId (roster-aware) when available
        if (data.fighterId != null) {
            let ent = null;
            try { ent = (playerRoster && typeof playerRoster.getEntityReference === 'function') ? playerRoster.getEntityReference(String(data.fighterId)) : null; } catch (e) { ent = null; }
            if (!ent) {
                // fallback to mapping by entityId
                if (data.entityId) ent = (player && player.id === data.entityId) ? player : ((enemy && enemy.id === data.entityId) ? enemy : null);
            }
            if (ent) ent.burning = { time: 0, duration: data.duration || 2.5, nextTick: 0.45 + Math.random() * 0.2 };
            return;
        }
        if (data.entityId) {
            // player or enemy burning
            let ent = (player && player.id === data.entityId) ? player : ((enemy && enemy.id === data.entityId) ? enemy : null);
            if (ent) ent.burning = { time: 0, duration: data.duration || 2.5, nextTick: 0.45 + Math.random() * 0.2 };
        } else if (typeof data.obstacleIndex === 'number' && typeof data.chunkIndex === 'number') {
            const obs = obstacles[data.obstacleIndex];
            if (obs && obs.chunks && obs.chunks[data.chunkIndex]) {
                const c = obs.chunks[data.chunkIndex];
                c.burning = { time: 0, duration: data.duration || 2.5, power: (typeof data.power === 'number' ? data.power : 1) };
                // ensure joiner has local flame particle array for visuals
                if (!c.flameParticles) c.flameParticles = [];
            }
        } else if (typeof data.infestedId !== 'undefined') {
            // Start burning on an infested chunk (joiner receives this for visuals)
            const found = (infestedChunks || []).find(ic => ic && ic.id === data.infestedId);
            if (found) {
                found.burning = { time: 0, duration: data.duration || 2.5, power: (typeof data.power === 'number' ? data.power : 1) };
                if (!found.flameParticles) found.flameParticles = [];
            }
        }
    } catch (e) {}
}

function applyBurningStopEvent(data) {
    if (!data) return;
    try {
        if (data.fighterId != null) {
            try {
                const ent = (playerRoster && typeof playerRoster.getEntityReference === 'function') ? playerRoster.getEntityReference(String(data.fighterId)) : null;
                if (ent) ent.burning = null;
            } catch (e) {}
            return;
        }
        if (data.entityId) {
            let ent = (player && player.id === data.entityId) ? player : ((enemy && enemy.id === data.entityId) ? enemy : null);
            if (ent) ent.burning = null;
        } else if (typeof data.obstacleIndex === 'number' && typeof data.chunkIndex === 'number') {
            const obs = obstacles[data.obstacleIndex];
            if (obs && obs.chunks && obs.chunks[data.chunkIndex]) {
                obs.chunks[data.chunkIndex].burning = null;
            }
        } else if (typeof data.infestedId !== 'undefined') {
            // Stop burning on an infested chunk (joiner receives this for visuals)
            const found = (infestedChunks || []).find(ic => ic && ic.id === data.infestedId);
            if (found) found.burning = null;
        }
    } catch (e) {}
}

function applySoundEffectEvent(data) {
    if (!data || !data.name) return;
    try {
        switch (data.name) {
            case 'gunshot': if (typeof playGunShot === 'function') playGunShot(); break;
            case 'explosion': if (typeof playExplosion === 'function') playExplosion(); break;
            case 'soft-poof': if (typeof playSoftPoof === 'function') playSoftPoof(); break;
            case 'hit': if (typeof playHit === 'function') playHit(); break;
            case 'ricochet': if (typeof playRicochet === 'function') playRicochet(); break;
            case 'dash': if (typeof playDashWoosh === 'function') playDashWoosh(); break;
            default: break;
        }
    } catch (e) {}
}

function applyImpactEvent(data) {
    if (!data) return;
    try {
        const x = data.x || 0;
        const y = data.y || 0;
        const damage = data.damage || 1;
        const color = data.color || '#ffffff';
        const baseAngle = (typeof data.baseAngle === 'number') ? data.baseAngle : 0;
        try { if (typeof createImpactLines === 'function') createImpactLines(x, y, damage, color, baseAngle); } catch (e) {}
        try { if (typeof playImpact === 'function') playImpact(damage); } catch (e) {}
    } catch (e) {}
}

// --- Sync helper functions (use GameEvents.emit when host) ---
function syncToJoiner(eventType, data) {
    try {
        if (NET && NET.role === 'host' && NET.connected && typeof GameEvents !== 'undefined') {
            
            GameEvents.emit(eventType, data);
        } else {
            
        }
    } catch (e) { 
        console.error('[SyncToJoiner] Error:', e);
    }
}

function createSyncedExplosion(x, y, radius, color, damage, owner) {
    // Create locally first (host already created explosion when triggering)
    try { if (!NET.connected || NET.role === 'host') {
        // host already pushes Explosion to local array where needed
    } } catch (e) {}
    const data = { x, y, radius, color, damage, ownerId: owner ? owner.id : null };
    syncToJoiner('explosion', data);
}

function createSyncedChunkUpdate(obstacleIndex, chunkUpdates) {
    const data = { obstacleIndex, updates: chunkUpdates };
    syncToJoiner('chunk-update', data);
}

function createSyncedImpact(x, y, damage, color, baseAngle) {
    const data = { x, y, damage: damage || 1, color: color || '#ffffff', baseAngle: baseAngle || 0 };
    syncToJoiner('impact', data);
}

function createSyncedDamageFlash(targetEntity, damage, isBurning = false) {
    try {
        const fighterRecord = getFighterRecordForEntity(targetEntity);
        const data = {
            entityId: (targetEntity && targetEntity.id) ? targetEntity.id : null,
            fighterId: fighterRecord && fighterRecord.id ? fighterRecord.id : null,
            damage,
            isBurning
        };
        // Only sync to joiner - host already applied visuals in takeDamage
        syncToJoiner('damage-flash', data);
    } catch (e) {}
}

function createSyncedHealingEffect(targetEntity, healAmount, intensity) {
    try {
        if (!targetEntity) return;
        const data = {
            entityId: (targetEntity && targetEntity.id) ? targetEntity.id : null,
            healAmount,
            intensity: typeof intensity === 'number' ? intensity : undefined
        };
        syncToJoiner('healing-effect', data);
    } catch (e) {}
}

// Map a role label ('host'|'joiner') to the correct local entity
function getEntityForRole(role) {
    // Single-player (no NET or not connected): host == player, joiner == enemy
    try {
        if (typeof NET === 'undefined' || !NET || !NET.connected) {
            return role === 'host' ? player : enemy;
        }
    } catch (e) {}
    if (NET.role === 'host') return role === 'host' ? player : enemy;
    if (NET.role === 'joiner') return role === 'host' ? enemy : player;
    return player;
}

// --- Procedural Obstacle Generation ---
function generateObstacles() {
    obstacles = [];
    const enemySuppressed = isEnemySuppressedForGameplay();
    let tries = 0;
    while (obstacles.length < OBSTACLE_COUNT && tries < 100) {
        tries++;
        let size = rand(OBSTACLE_MIN_SIZE, OBSTACLE_MAX_SIZE);
        let w = size, h = size;
        let x = rand(60, window.CANVAS_W - w - 60);
        let y = rand(60, CANVAS_H - h - 60);
        let obs = new Obstacle(x, y, w, h);
        let centerX = x + w/2, centerY = y + h/2;
        let safe = true;
        if (typeof player !== 'undefined' && player) {
            let minDist = Math.max(w, h) * 0.6 + player.radius + 12;
            if (dist(centerX, centerY, player.x, player.y) <= minDist) safe = false;
        } else {
            if (dist(centerX, centerY, window.CANVAS_W/3, CANVAS_H/2) <= 110) safe = false;
        }
        if (!enemySuppressed && typeof enemy !== 'undefined' && enemy) {
            let minDist = Math.max(w, h) * 0.6 + enemy.radius + 12;
            if (dist(centerX, centerY, enemy.x, enemy.y) <= minDist) safe = false;
        } else {
            if (dist(centerX, centerY, 2*window.CANVAS_W/3, CANVAS_H/2) <= 110) safe = false;
        }
        if (!obstacles.some(o => rectsOverlap(o, obs))) {
        } else safe = false;
        if (safe) obstacles.push(obs);
    }
}

// Serialize/deserialize obstacles for setup sync
function serializeObstacles() {
    return (obstacles||[]).map(o => ({ x:o.x, y:o.y, w:o.w, h:o.h, destroyed: !!o.destroyed }));
}
function deserializeObstacles(arr) {
    obstacles = [];
    for (const s of (arr||[])) {
        const o = new Obstacle(s.x, s.y, s.w, s.h);
        o.destroyed = !!s.destroyed;
        obstacles.push(o);
    }
}






function rectsOverlap(a, b) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x ||
             a.y + a.h < b.y || b.y + b.h < a.y);
}

function spawnDynamicObstacle() {
    // Count active (non-destroyed) obstacles
    let activeCount = 0;
    for (let o of obstacles) if (!o.destroyed) activeCount++;

    // If we've already got enough active obstacles, don't spawn more
    if (activeCount >= OBSTACLE_COUNT) return;

    let tries = 0;
    const enemySuppressed = isEnemySuppressedForGameplay();
    while (tries < 60) {
        tries++;
        let size = rand(OBSTACLE_MIN_SIZE, OBSTACLE_MAX_SIZE);
        let w = size, h = size;
        let x = rand(60, window.CANVAS_W - w - 60);
        let y = rand(60, CANVAS_H - h - 60);
        let obs = new Obstacle(x, y, w, h);
        let centerX = x + w/2, centerY = y + h/2;
        let safe = true;
        for (let o of obstacles) {
            if (!o) continue;
            if (!o.destroyed && rectsOverlap(o, obs)) { safe = false; break; }
        }
        if (!safe) continue;
    if (dist(centerX, centerY, player.x, player.y) <= 90) safe = false;
    if (!enemySuppressed && dist(centerX, centerY, enemy.x, enemy.y) <= 90) safe = false;
        if (!safe) continue;
        // Prefer to reuse a destroyed slot so array length doesn't grow
        let replaced = false;
        for (let i = 0; i < obstacles.length; i++) {
            if (obstacles[i] && obstacles[i].destroyed) {
                obstacles[i] = obs;
                replaced = true;
                break;
            }
        }
        if (!replaced) obstacles.push(obs);
        // Relay spawn to joiner (visual-only)
        try {
            if (NET && NET.role === 'host' && NET.connected) {
                const oi = obstacles.indexOf(obs);
                GameEvents.emit('dynamic-spawn', { obstacleIndex: oi, obstacle: { x: obs.x, y: obs.y, w: obs.w, h: obs.h } });
            }
        } catch (e) {}
        break;
    }
}

function despawnDynamicObstacle() {
    if (obstacles.length === 0) return;
    let idx = randInt(0, obstacles.length-1);
    for (let i = 0; i < obstacles.length; i++) {
        let j = (idx + i) % obstacles.length;
        if (!obstacles[j].destroyed) { idx = j; break; }
    }
    let o = obstacles[idx];
    // Animate chunks flying off
    for (const c of o.chunks) {
        if (!c.destroyed) {
            c.destroyed = true;
            c.flying = true;
            c.vx = rand(-140, 140);
            c.vy = rand(-240, -40);
            c.alpha = 1;
        }
    }
    o.destroyed = true;

    // Relay despawn to joiner (visual-only)
    try {
        if (NET && NET.role === 'host' && NET.connected) {
            const oi = obstacles.indexOf(o);
            GameEvents.emit('dynamic-despawn', { obstacleIndex: oi });
        }
    } catch (e) {}

    // Replace this obstacle after a short delay, ensuring 1:1 ratio
    setTimeout(() => {
        // Try to spawn a replacement obstacle at a safe location. If we fail, retry a few times.
        let spawnTries = 0;
        function tryReplace() {
            spawnTries++;
            let tries = 0;
            while (tries < 120) {
                tries++;
                let size = rand(OBSTACLE_MIN_SIZE, OBSTACLE_MAX_SIZE);
                let w = size, h = size;
                let x = rand(60, window.CANVAS_W - w - 60);
                let y = rand(60, CANVAS_H - h - 60);
                let newObs = new Obstacle(x, y, w, h);
                let centerX = x + w/2, centerY = y + h/2;
                // Must not overlap any non-destroyed obstacle (ignore the one we're replacing)
                let safe = true;
                for (let k = 0; k < obstacles.length; k++) {
                    if (k === idx) continue;
                    let o2 = obstacles[k];
                    if (!o2) continue;
                    if (!o2.destroyed && rectsOverlap(o2, newObs)) { safe = false; break; }
                }
                if (!safe) continue;
                if (dist(centerX, centerY, player.x, player.y) <= 90) safe = false;
                if (dist(centerX, centerY, enemy.x, enemy.y) <= 90) safe = false;
                if (safe) {
                    // Replace in-place so obstacles.length stays stable
                    obstacles[idx] = newObs;
                    try {
                        if (NET && NET.role === 'host' && NET.connected) {
                            GameEvents.emit('dynamic-spawn', { obstacleIndex: idx, obstacle: { x: newObs.x, y: newObs.y, w: newObs.w, h: newObs.h } });
                        }
                    } catch (e) {}
                    return;
                }
            }
            // If we failed to place, retry a few times with delay
            if (spawnTries < 6) {
                setTimeout(tryReplace, 500 + Math.random()*300);
            } else {
                // As a last resort, attempt to un-destroy one chunk to keep some visual element
                // (do nothing further)
            }
        }
        tryReplace();
    }, 700 + Math.random() * 300);
}

// --- Game Loop ---
function gameLoop(ts) {
    if (!running) return;
    let dt = ((ts - lastTimestamp) || 16) / 1000;
    lastTimestamp = ts;
    // Always run NET frame so networking continues while card UI is active
    try { if (NET && typeof NET.onFrame === 'function') NET.onFrame(dt); } catch (e) {}
    const selectionPaused = isSelectionPauseActive();
    if (!selectionPaused) {
        update(dt);
    } else {
        // Keep WorldMaster cooldowns/UI ticking during card UI
        try {
            if (window.WorldMasterIntegration && typeof window.WorldMasterIntegration.updateWorldMaster === 'function') {
                window.WorldMasterIntegration.updateWorldMaster(dt);
            } else if (window.gameWorldMasterInstance && typeof window.gameWorldMasterInstance.update === 'function') {
                window.gameWorldMasterInstance.update(dt);
            }
        } catch (e) {}
    }
    draw();
    animFrameId = requestAnimationFrame(gameLoop);
}

// --- Update Logic ---
function update(dt) {
    // --- Multiplayer Sync (host-authoritative) ---
    NET.onFrame(dt);
    const simulateLocally = !NET.connected || NET.role === 'host';

    // Helper: perform a lightweight, visual-only obstacle collision and ricochet
    // for bullets that are simulated locally on a non-authoritative client (joiner).
    // This mirrors the host's ricochet math (surface normal reflection and bounce
    // decrement) but does NOT modify obstacle chunk state or emit authoritative
    // chunk updates. Its purpose is purely to keep joiner visuals in sync with
    // the host for locally-fired bullets.
    function handleLocalBulletObstacleCollision(b) {
        if (!b || !b.active) return;
        if (!Array.isArray(obstacles) || !obstacles.length) return;
        try {
            for (let o of obstacles) {
                if (!o || o.destroyed) continue;
                // If bullet doesn't pierce, check collision and reflect/deactivate
                if (!b.pierce) {
                    let collidedChunk = null;
                    let closestX = 0, closestY = 0;
                    for (const c of o.chunks) {
                        if (c.destroyed) continue;
                        let cx = clamp(b.x, c.x, c.x + c.w);
                        let cy = clamp(b.y, c.y, c.y + c.h);
                        let dx = b.x - cx, dy = b.y - cy;
                        if ((dx*dx + dy*dy) < b.radius * b.radius) {
                            collidedChunk = c;
                            closestX = cx; closestY = cy;
                            break;
                        }
                    }
                    if (collidedChunk) {
                        if ((b.bouncesLeft|0) > 0) {
                            // reflect velocity around surface normal (from collision point to bullet center)
                            let nx = b.x - closestX;
                            let ny = b.y - closestY;
                            let nlen = Math.hypot(nx, ny);
                            if (nlen === 0) {
                                nx = (Math.random() - 0.5) || 0.0001;
                                ny = (Math.random() - 0.5) || 0.0001;
                                nlen = Math.hypot(nx, ny);
                            }
                            nx /= nlen; ny /= nlen;
                            let vx = Math.cos(b.angle), vy = Math.sin(b.angle);
                            let dot = vx*nx + vy*ny;
                            let rx = vx - 2 * dot * nx;
                            let ry = vy - 2 * dot * ny;
                            b.angle = Math.atan2(ry, rx);
                            b.bouncesLeft = Math.max(0, b.bouncesLeft - 1);
                            b.x += rx * (b.radius * 0.9);
                            b.y += ry * (b.radius * 0.9);
                            try { if (typeof playRicochet === 'function') playRicochet(); } catch (e) {}
                            // Only visual; don't modify obstacle chunks here
                            break;
                        } else {
                            // compute surface normal from collision point to bullet center
                            try {
                                let nx = b.x - closestX;
                                let ny = b.y - closestY;
                                let nlen = Math.hypot(nx, ny);
                                if (nlen === 0) { nx = (Math.random() - 0.5) || 0.0001; ny = (Math.random() - 0.5) || 0.0001; nlen = Math.hypot(nx, ny); }
                                nx /= nlen; ny /= nlen;
                                const baseAngle = Math.atan2(ny, nx);
                                createImpactLines(b.x, b.y, b.damage || 1, (b.owner && b.owner.color) ? b.owner.color : '#ffffff', baseAngle);
                                try { if (typeof playImpact === 'function') playImpact(b.damage || 1); } catch (e) {}
                                try { if (NET && NET.role === 'host') createSyncedImpact(b.x, b.y, b.damage || 1, (b.owner && b.owner.color) ? b.owner.color : '#ffffff', baseAngle); } catch (e) {}
                            } catch (e) {}
                            b.active = false;
                            break;
                        }
                    }
                } else {
                    // Piercing bullets: decrement pierceLimit on chunk contact (visual-only)
                    let collided = false;
                    let closestX = 0, closestY = 0;
                    for (const c of o.chunks) {
                        if (c.destroyed) continue;
                        let cx = clamp(b.x, c.x, c.x + c.w);
                        let cy = clamp(b.y, c.y, c.y + c.h);
                        let dx = b.x - cx, dy = b.y - cy;
                        if ((dx*dx + dy*dy) < b.radius * b.radius) {
                            collided = true; closestX = cx; closestY = cy; break;
                        }
                    }
                    if (collided) {
                        b.pierceLimit--;
                        if (b.pierceLimit <= 0) {
                            // Suppress impact animation and sound for piercing bullet expiration inside obstacle
                            b.active = false;
                            break;
                        }
                    }
                }
            }
        } catch (e) {
            // defensive: don't allow visual collision handling to throw
        }
    }
    const enemySuppressed = isEnemySuppressedForGameplay();
    const activeEnemy = enemy && !enemySuppressed;
    // Joiner: smooth positions toward latest snapshot targets and tick timers locally
    if (NET.connected && NET.role === 'joiner') {
        const s = 25; // smoothing rate (higher = snappier)
        const t = Math.max(0, Math.min(1, s * dt));
        const tgt0 = NET.joinerTargets && NET.joinerTargets.p0;
        const tgt1 = NET.joinerTargets && NET.joinerTargets.p1;
        if (tgt0 && enemy && typeof enemy.x === 'number' && typeof enemy.y === 'number') {
            enemy.x = lerp(enemy.x, tgt0.x, t);
            enemy.y = lerp(enemy.y, tgt0.y, t);
        }
        // For joiner, smooth reconcile own player position when needed
        if (player && typeof player.reconcileX === 'number' && typeof player.reconcileY === 'number') {
            const reconcileT = Math.max(0, Math.min(1, 25 * dt)); // smoother reconciliation
            player.x = lerp(player.x, player.reconcileX, reconcileT);
            player.y = lerp(player.y, player.reconcileY, reconcileT);
            const dist = Math.hypot(player.x - player.reconcileX, player.y - player.reconcileY);
            if (dist < 1) { // close enough, clear reconcile
                delete player.reconcileX;
                delete player.reconcileY;
            }
        }
        // Smoothly animate cooldown rings between snapshots
        if (player) {
            if (typeof player.timeSinceShot === 'number') player.timeSinceShot += dt;
            if (typeof player.dashCooldown === 'number') player.dashCooldown = Math.max(0, player.dashCooldown - dt);
        }
        if (enemy) {
            if (typeof enemy.timeSinceShot === 'number') enemy.timeSinceShot += dt;
            if (typeof enemy.dashCooldown === 'number') enemy.dashCooldown = Math.max(0, enemy.dashCooldown - dt);
        }
        // Smooth healer positions
        if (NET.joinerTargets && NET.joinerTargets.healers) {
            for (const healer of healers) {
                if (!healer || !healer.active) continue;
                const target = NET.joinerTargets.healers.get(healer.id);
                if (target && typeof healer.x === 'number' && typeof healer.y === 'number') {
                    healer.x = lerp(healer.x, target.x, t);
                    healer.y = lerp(healer.y, target.y, t);
                }
            }
        }
        // Smooth roster bot positions (joiner)
        if (NET.joinerTargets && NET.joinerTargets.rosterBots) {
            try {
                const fighters = (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.getFighters === 'function') ? playerRoster.getFighters({ includeUnassigned: false, includeEntity: true }) : [];
                for (const f of (fighters || [])) {
                    if (!f || !f.entity) continue;
                    const ent = f.entity;
                    const target = NET.joinerTargets.rosterBots.get(f.id);
                    if (target && typeof ent.x === 'number' && typeof ent.y === 'number') {
                        ent.x = lerp(ent.x, target.x, t);
                        ent.y = lerp(ent.y, target.y, t);
                    }
                }
            } catch (e) {}
        }
        // Smooth roster human player positions (joiner)
        if (NET.joinerTargets && NET.joinerTargets.rosterPlayers) {
            try {
                const fighters = (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.getFighters === 'function') ? playerRoster.getFighters({ includeUnassigned: false, includeEntity: true }) : [];
                for (const f of (fighters || [])) {
                    if (!f) continue;
                    const fid = f.id;
                    const ent = playerRoster.getEntityReference ? playerRoster.getEntityReference(fid) : (f.entity || null);
                    if (!ent) continue;
                    const target = NET.joinerTargets.rosterPlayers.get(fid);
                    if (target && typeof ent.x === 'number' && typeof ent.y === 'number') {
                        ent.x = lerp(ent.x, target.x, t);
                        ent.y = lerp(ent.y, target.y, t);
                    }
                }
            } catch (e) {}
        }
        // Smooth healer positions
        if (NET.joinerTargets && NET.joinerTargets.healers) {
            for (const healer of healers) {
                if (!healer || !healer.active) continue;
                const target = NET.joinerTargets.healers.get(healer.id);
                if (target && typeof healer.x === 'number' && typeof healer.y === 'number') {
                    healer.x = lerp(healer.x, target.x, t);
                    healer.y = lerp(healer.y, target.y, t);
                }
            }
        }
        // Smooth healer positions
        if (NET.joinerTargets && NET.joinerTargets.healers) {
            for (const healer of healers) {
                if (!healer || !healer.active) continue;
                const target = NET.joinerTargets.healers.get(healer.id);
                if (target && typeof healer.x === 'number' && typeof healer.y === 'number') {
                    healer.x = lerp(healer.x, target.x, t);
                    healer.y = lerp(healer.y, target.y, t);
                }
            }
        }
    }
        // --- WorldMaster cooldowns/UI ---
        try {
            if (window.gameWorldMasterInstance && typeof window.gameWorldMasterInstance.update === 'function') {
                window.gameWorldMasterInstance.update(dt);
            }
        } catch (e) { /* non-fatal */ }

    // --- Burning Damage Over Time ---
        // Update burning for all living fighters (not just host/joiner)
        if (playerRoster && typeof playerRoster.getFighters === 'function') {
            const fighters = playerRoster.getFighters({ includeUnassigned: false, includeEntity: true }) || [];
            for (const fighter of fighters) {
                if (!fighter || fighter.isAlive === false) continue;
                const entity = fighter.entity || (playerRoster.getEntityReference && playerRoster.getEntityReference(fighter.id));
                if (entity && typeof entity.updateBurning === 'function') {
                    entity.updateBurning(dt);
                }
                if (entity && typeof entity.update === 'function' && !entity._isRosterHuman) entity.update(dt);
            }
        } else {
            // Fallback for legacy two-player
            if (player && typeof player.updateBurning === 'function') player.updateBurning(dt);
            if (player && typeof player.update === 'function') player.update(dt);
            if (enemy && typeof enemy.updateBurning === 'function') enemy.updateBurning(dt);
            if (enemy && typeof enemy.update === 'function') enemy.update(dt);
        }
    if (Array.isArray(obstacles) && obstacles.length > 0) {
        // Cap how many chunk burning updates we do per frame to avoid stalls
        let chunkChecks = 0;
        const MAX_CHUNK_CHECKS_PER_FRAME = 2000;
        for (let o of obstacles) {
            if (!o || !o.chunks) continue;
            for (let c of o.chunks) {
                if (chunkChecks++ > MAX_CHUNK_CHECKS_PER_FRAME) break;
                if (c && c.burning && !c.destroyed) {
                    c.burning.time += dt;
                    if (!c.burning.nextTick) c.burning.nextTick = 0;
                    c.burning.nextTick -= dt;
                        if (c.burning.nextTick <= 0) {
                            // Visual particle spawn/timer update (joiner+host)
                            if (!Array.isArray(c.flameParticles)) c.flameParticles = [];
                            if (c.flameParticles.length < 18 && Math.random() < 0.92) {
                                const cx = c.x + c.w/2 + (Math.random() - 0.5) * c.w * 0.6;
                                const cy = c.y + c.h/2 + (Math.random() - 0.5) * c.h * 0.6;
                                c.flameParticles.push({ x: cx, y: cy, vx: (Math.random() - 0.5) * 28, vy: -30 + Math.random() * -18, life: 0.55 + Math.random() * 0.7, maxLife: 0.55 + Math.random() * 0.7, r: 2 + Math.random() * 3, hue: 18 + Math.random() * 30 });
                            }
                            // Advance the nextTick for visuals (both host and joiner)
                            c.burning.nextTick = 0.44 + Math.random()*0.22;

                            // Host-authoritative changes: HP, heat accumulation, ignition and destruction
                            if (NET && NET.role !== 'joiner') {
                                // Damage chunk (reduced for longer burn)
                                c.hp = (typeof c.hp === 'number') ? c.hp - 0.11 : 1.0 - 0.11;
                                c.alpha = Math.max(0.25, Math.min(1, c.hp));
                                // Relay partial damage/alpha to joiner so partially-damaged chunks stay in sync
                                try {
                                    if (NET && NET.role === 'host' && NET.connected) {
                                        const oi = obstacles.indexOf(o);
                                        const ci = o.chunks.indexOf(c);
                                        if (typeof oi === 'number' && oi >= 0 && typeof ci === 'number' && ci >= 0) {
                                            const upd = { i: ci, alpha: c.alpha, x: c.x, y: c.y };
                                            if (c.burning) upd.burning = { time: c.burning.time || 0, duration: c.burning.duration || 2.5, power: c.burning.power || 1 };
                                            try { createSyncedChunkUpdate(oi, [upd]); } catch (e) {}
                                        }
                                    }
                                } catch (e) {}

                                // Gradual heat accumulation for adjacent chunks (host only)
                                for (let o2 of obstacles) {
                                    if (!o2 || !o2.chunks) continue;
                                    for (let c2 of o2.chunks) {
                                        if (!c2 || c2 === c || c2.destroyed || c2.burning) continue;
                                        const d = dist(c.x + c.w/2, c.y + c.h/2, c2.x + c2.w/2, c2.y + c2.h/2);
                                        const maxDist = Math.max(c.w, c.h) * 1.6;
                                        if (d <= maxDist) {
                                            // Accumulate heat from burning neighbor
                                            c2.heat = (c2.heat || 0) + 0.13 * (c.burning.power || 1);
                                            // If heat exceeds threshold, ignite
                                            if (c2.heat > 1.0) {
                                                const dissipation = 0.5 + Math.random() * 0.45;
                                                const newPower = Math.max(0.18, (c.burning.power || 1) * dissipation);
                                                const newDur = Math.max(1.2, (c.burning.duration || 2.0) * (0.7 + Math.random() * 0.7) * (0.5 + dissipation * 0.8));
                                                c2.burning = { time: 0, duration: newDur, power: newPower, nextTick: 0 };
                                                c2.flameParticles = c2.flameParticles || [];
                                                c2.heat = 0;
                                                // Emit event for joiners
                                                try { if (NET && NET.role === 'host' && NET.connected && typeof GameEvents !== 'undefined') {
                                                    const oi2 = obstacles.indexOf(o2);
                                                    const ci2 = o2.chunks.indexOf(c2);
                                                    GameEvents.emit('burning-start', { obstacleIndex: oi2, chunkIndex: ci2, duration: newDur, power: newPower });
                                                } } catch (e) {}
                                            }
                                        }
                                    }
                                }

                                // If HP depleted, destroy and sync
                                if (c.hp <= 0) {
                                    c.destroyed = true;
                                    c.burning = null;
                                    // Relay chunk destruction to joiner via chunk update
                                    try {
                                        if (NET && NET.role === 'host' && NET.connected) {
                                            const oi = obstacles.indexOf(o);
                                            const ci = o.chunks.indexOf(c);
                                            if (typeof oi === 'number' && oi >= 0 && typeof ci === 'number' && ci >= 0) {
                                                const updates = [{ i: ci, destroyed: true, flying: !!c.flying, vx: c.vx||0, vy: c.vy||0, alpha: c.alpha||1, x: c.x, y: c.y }];
                                                try { createSyncedChunkUpdate(oi, updates); } catch (e) {}
                                            }
                                        }
                                    } catch (e) {}
                                }
                            }
                        }
                    if (c.burning && c.burning.time > c.burning.duration) {
                        // Only the host clears burning and emits stop — joiner waits for authoritative event
                        if (NET && NET.role !== 'joiner') {
                            c.burning = null;
                            try { if (NET && NET.role === 'host' && NET.connected) {
                                const oi = obstacles.indexOf(o);
                                const ci = o.chunks.indexOf(c);
                                if (typeof oi === 'number' && oi >= 0 && typeof ci === 'number' && ci >= 0) {
                                    GameEvents.emit('burning-stop', { obstacleIndex: oi, chunkIndex: ci });
                                }
                            } } catch (e) {}
                        }
                    }
                    // Update any chunk flame particles
                    if (Array.isArray(c.flameParticles) && c.flameParticles.length) {
                        for (let fp of c.flameParticles) {
                            fp.x += fp.vx * dt;
                            fp.y += fp.vy * dt;
                            fp.vy += 80 * dt;
                            fp.life -= dt;
                        }
                        c.flameParticles = c.flameParticles.filter(p => p.life > 0);
                    }
                }
            }
            if (chunkChecks > MAX_CHUNK_CHECKS_PER_FRAME) break;
        }
    }

    // --- Infested-chunk burning spread (host only) ---
    if (NET && NET.role !== 'joiner' && Array.isArray(infestedChunks) && infestedChunks.length) {
        // limit checks to avoid heavy CPU
        let spreadChecks = 0;
        const MAX_SPREAD_CHECKS = 1200;
        for (let i = 0; i < infestedChunks.length; ++i) {
            const ic = infestedChunks[i];
            if (!ic || !ic.active || !ic.burning) continue;
            // Only attempt spread after a short burn time so it feels natural
            if (ic.burning.time < 0.4) continue;
            // iterate other infested chunks nearby
            for (let j = 0; j < infestedChunks.length; ++j) {
                if (i === j) continue;
                spreadChecks++;
                if (spreadChecks > MAX_SPREAD_CHECKS) break;
                const ic2 = infestedChunks[j];
                if (!ic2 || !ic2.active || ic2.burning) continue;
                const d = dist(ic.x + ic.w/2, ic.y + ic.h/2, ic2.x + ic2.w/2, ic2.y + ic2.h/2);
                const maxDist = Math.max(ic.w, ic.h) * 1.6;
                if (d <= maxDist) {
                    // chance to ignite depends on source power and distance; bias slightly with randomness
                    const sourcePower = (ic.burning && ic.burning.power) ? ic.burning.power : 1;
                    const prob = Math.min(0.6, 0.12 * sourcePower + 0.04 * Math.random());
                    if (Math.random() < prob) {
                        // per-target randomized dissipation multiplier so some chains burn stronger
                        const dissipation = 0.5 + Math.random() * 0.45; // 0.5 .. 0.95
                        const newPower = Math.max(0.18, sourcePower * dissipation);
                        const newDur = Math.max(0.9, (ic.burning.duration || 2.0) * (0.6 + Math.random() * 0.7) * (0.5 + dissipation * 0.8));
                        ic2.burning = { time: 0, duration: newDur, power: newPower, nextTick: 0 };
                        // relay to joiner for visuals
                        try { if (NET && NET.role === 'host' && NET.connected && typeof GameEvents !== 'undefined') {
                            // find if this infested chunk maps to an obstacle chunk index (best-effort)
                            GameEvents.emit('burning-start', { infestedId: ic2.id, duration: newDur, power: newPower });
                        } } catch (e) {}
                    }
                }
            }
            if (spreadChecks > MAX_SPREAD_CHECKS) break;
        }
    }
    // --- Firestorm World Modifier Logic ---
    // Spawn/management (host-only). If WM is actively controlling Firestorm, pause random spawning.
    const wmControllingFirestorm = !!(window.gameWorldMasterInstance && window.gameWorldMasterInstance.controlledEffect === 'Firestorm');
    if (NET.role !== 'joiner' && firestormActive && !wmControllingFirestorm) {
        firestormTimer += dt;
        if (!firestormInstance && firestormTimer >= firestormNextTime) {
            // Start pre-spawn warning if not already started
            if (!firestormPreSpawnPos) {
                let fx = rand(120, window.CANVAS_W - 120);
                let fy = rand(90, CANVAS_H - 90);
                firestormPreSpawnPos = { x: fx, y: fy, radius: rand(140, 260) };
                firestormPreSpawnTimer = 0;
                    try {
                        if (NET && NET.role === 'host' && NET.connected) {
                            GameEvents.emit('firestorm-pre-spawn', { x: fx, y: fy, radius: firestormPreSpawnPos.radius, delay: firestormPreSpawnDelay, timer: firestormPreSpawnTimer });
                        }
                    } catch (e) {}
            }
            
            firestormPreSpawnTimer += dt;
            if (firestormPreSpawnTimer >= firestormPreSpawnDelay) {
                // Spawn the actual firestorm at pre-spawn position
                firestormTimer = 0;
                firestormNextTime = 10 + Math.random() * 20;
                firestormInstance = new Firestorm(firestormPreSpawnPos.x, firestormPreSpawnPos.y, firestormPreSpawnPos.radius);
                // Relay to joiner
                try {
                    if (NET && NET.role === 'host' && NET.connected) {
                        GameEvents.emit('firestorm-spawn', { x: firestormPreSpawnPos.x, y: firestormPreSpawnPos.y, radius: firestormPreSpawnPos.radius });
                    }
                } catch (e) {}
                firestormPreSpawnPos = null;
                firestormPreSpawnTimer = 0;
            }
        }
        // Host will still handle lifecycle and relay removal when done
        if (firestormInstance && NET && NET.role === 'host') {
            if (firestormInstance.done) {
                try {
                    if (NET && NET.role === 'host' && NET.connected) {
                        GameEvents.emit('firestorm-spawn', { done: true });
                    }
                } catch (e) {}
                firestormInstance = null;
            }
        }
    } else if (NET.role !== 'joiner' && firestormPreSpawnPos && !firestormActive) {
        // Clear pre-spawn only if firestorm becomes inactive (not when WM is controlling)
        firestormPreSpawnPos = null;
        firestormPreSpawnTimer = 0;
    }
    
    // Manage persistent firestorm burning sound
    if (firestormInstance && !wasFirestormInstance) {
        startFirestormBurning();
    } else if (!firestormInstance && wasFirestormInstance) {
        stopFirestormBurning();
    }
    wasFirestormInstance = firestormInstance;
    
    // Handle WorldMaster-triggered firestorm pre-spawns (runs independently of wmControllingFirestorm)
    if (NET.role !== 'joiner' && firestormPreSpawnPos && !firestormInstance) {
        firestormPreSpawnTimer += dt;
        if (firestormPreSpawnTimer >= firestormPreSpawnDelay) {
            // Spawn the actual firestorm at pre-spawn position
            firestormInstance = new Firestorm(firestormPreSpawnPos.x, firestormPreSpawnPos.y, firestormPreSpawnPos.radius);
            firestormActive = true;
            playBurning(5.0); // Play burning sound for firestorm
            // Relay to joiner
            try {
                if (NET && NET.role === 'host' && NET.connected) {
                    GameEvents.emit('firestorm-spawn', { x: firestormPreSpawnPos.x, y: firestormPreSpawnPos.y, radius: firestormPreSpawnPos.radius });
                }
            } catch (e) {}
            firestormPreSpawnPos = null;
            firestormPreSpawnTimer = 0;
        }
    }

    // Update/draw (visuals) - run on both host and joiner if an instance exists
    if (firestormInstance) {
        try { firestormInstance.update(dt); } catch (e) { if (window.console) console.warn('Firestorm update error', e); }
        if (firestormInstance.done) {
            // If joiner receives done, just clear local instance
            firestormInstance = null;
        }
    }

    // World Modifier: Infestation logic
    const wmControllingInfestation = !!(window.gameWorldMasterInstance && window.gameWorldMasterInstance.controlledEffect === 'Infestation');
    if (NET.role !== 'joiner' && infestationActive && !wmControllingInfestation) {
        infestationTimer += dt;
        let nextInfestationTime = 1 + Math.random() * 9;
        if (infestationTimer >= nextInfestationTime) {
            infestationTimer = 0;
            let availableChunks = [];
            for (let o of obstacles) {
                if (o.destroyed) continue;
                for (let c of o.chunks) {
                    if (!c.destroyed && !c.flying) {
                        availableChunks.push({ chunk: c, obstacle: o });
                    }
                }
            }
            
            if (availableChunks.length > 0) {
                // Enforce maximum active infested chunks
                let target = null;
                let spawnedInf = null;
                try {
                    const activeCount = (infestedChunks || []).filter(ic => ic && ic.active).length;
                    if (activeCount < 10) {
                        target = availableChunks[Math.floor(Math.random() * availableChunks.length)];
                        spawnedInf = new InfestedChunk(target.chunk, target.obstacle);
                        infestedChunks.push(spawnedInf);
                    }
                } catch (e) {
                    // fallback: spawn if error
                    target = availableChunks[Math.floor(Math.random() * availableChunks.length)];
                    try {
                        spawnedInf = new InfestedChunk(target.chunk, target.obstacle);
                        infestedChunks.push(spawnedInf);
                    } catch (e2) {}
                }
                // Relay to joiner (only if we spawned)
                try {
                    if (spawnedInf && NET && NET.role === 'host' && NET.connected && window.ws && window.ws.readyState === WebSocket.OPEN) {
                        let oi = obstacles.indexOf(target.obstacle);
                        let ci = target.obstacle.chunks.indexOf(target.chunk);
                        try { GameEvents.emit('infestation-spawn', { obstacleIndex: oi, chunkIndex: ci, id: spawnedInf.id, x: spawnedInf.x, y: spawnedInf.y, w: spawnedInf.w, h: spawnedInf.h, hp: spawnedInf.hp }); } catch (e) {}
                    }
                } catch (e) {}
            }
        }
    }

    // World Modifier: Spontaneous explosions
    const wmControllingSpontaneous = !!(window.gameWorldMasterInstance && window.gameWorldMasterInstance.controlledEffect === 'Spontaneous');
    if (NET.role !== 'joiner' && spontaneousActive && !wmControllingSpontaneous) {
        spontaneousTimer += dt;
        // Random intervals between ~3-15 seconds (less frequent)
        let nextSpontaneousTime = 3 + Math.random() * 12;
        if (spontaneousTimer >= nextSpontaneousTime) {
            spontaneousTimer = 0;
            // Find a random non-destroyed obstacle
            let availableObstacles = obstacles.filter(o => !o.destroyed);
            if (availableObstacles.length > 0) {
                let targetObstacle = availableObstacles[Math.floor(Math.random() * availableObstacles.length)];
                // Calculate center of obstacle
                let centerX = targetObstacle.x + targetObstacle.w / 2;
                let centerY = targetObstacle.y + targetObstacle.h / 2;
                
                // Create explosion at center (slightly larger and stronger)
                let explosionRadius = Math.max(targetObstacle.w, targetObstacle.h) * 1.0 + 50;
                let explosionDamage = 36;
                explosions.push(new Explosion(
                    centerX, centerY,
                    explosionRadius,
                    "#ff6b4a", // orange-red color for spontaneous
                    explosionDamage,
                    null, // no owner
                    false // not obliterator
                ));
                
                // Destroy the entire obstacle
                for (let c of targetObstacle.chunks) {
                    if (!c.destroyed) {
                        let ang = Math.atan2(c.y + c.h/2 - centerY, c.x + c.w/2 - centerX) + (Math.random()-0.5)*0.8;
                        let v = 200 + Math.random() * 180;
                        c.vx = Math.cos(ang) * v;
                        // continue normal flow
                        c.flying = true;
                        c.destroyed = true;
                        c.alpha = 1;
                    }
                }
                targetObstacle.destroyed = true;
                // Build chunk updates for joiners and emit via event system
                try {
                    const obsIdx = obstacles.indexOf(targetObstacle);
                    const updates = [];
                    for (let ci = 0; ci < targetObstacle.chunks.length; ci++) {
                        const cc = targetObstacle.chunks[ci];
                        updates.push({ i: ci, destroyed: !!cc.destroyed, flying: !!cc.flying, vx: cc.vx||0, vy: cc.vy||0, alpha: cc.alpha||1, x: cc.x, y: cc.y });
                    }
                    createSyncedChunkUpdate(obsIdx, updates);
                } catch (e) {}

                // Emit explosion visual event
                createSyncedExplosion(centerX, centerY, explosionRadius, '#ff6b4a', explosionDamage, null);

                playExplosion();
            }
        }
    }

    // Update infested chunks
    for (let ic of infestedChunks) {
        if (ic.active) {
            ic.update(dt, [player].concat(enemySuppressed ? [] : [enemy]));
        }
    }
    infestedChunks = infestedChunks.filter(ic => ic.active);
    if (NET.role !== 'joiner' && DYNAMIC_MODE) {
        dynamicTimer += dt;
        if (dynamicTimer >= DYNAMIC_RATE) {
            dynamicTimer = 0;
            if (dynamicSpawnNext) {
                spawnDynamicObstacle();
            } else {
                despawnDynamicObstacle();
            }
            dynamicSpawnNext = !dynamicSpawnNext;
        }
    }
    let input = { x: 0, y: 0 };
    if (keys['w']) input.y -= 1;
    if (keys['s']) input.y += 1;
    if (keys['a']) input.x -= 1;
    if (keys['d']) input.x += 1;
    // use top-level getDashSettings(p)
    // Suppress local player controls when host is driving blue as AI (joiner is WM and Enemy AI enabled)
    const joinerIsWM_AI_On = !!(NET.connected && NET.role === 'host' && worldMasterEnabled && (worldMasterPlayerIndex|0) === 1 && !enemySuppressed);
    const hostIsWM_AI_On = !!(NET.connected && NET.role === 'host' && worldMasterEnabled && (worldMasterPlayerIndex|0) === 0 && !enemySuppressed);
    if (simulateLocally && player.dash && !joinerIsWM_AI_On && !hostIsWM_AI_On && isEntityActive(player)) {
        if (keys['shift'] && !player.dashActive && player.dashCooldown <= 0) {
            let dashVec = { x: 0, y: 0 };
            if (input.x || input.y) {
                let norm = Math.hypot(input.x, input.y);
                dashVec.x = input.x / norm;
                dashVec.y = input.y / norm;
            } else {
                let dx = mouse.x - player.x, dy = mouse.y - player.y;
                let norm = Math.hypot(dx, dy);
                if (norm > 0) {
                    dashVec.x = dx / norm;
                    dashVec.y = dy / norm;
                } else {
                    dashVec.x = 1; dashVec.y = 0;
                }
            }
            let dashSet = getDashSettings(player);
            beginDash(player, dashVec, dashSet);
        }
        if (player.dashActive) {
            let dashSet = getDashSettings(player);
            if (isTeledashEnabled(player)) {
                const blockers = { obstacles, others: enemySuppressed ? [] : [enemy] };
                const aimProvider = () => ({ x: mouse.x, y: mouse.y });
                updateTeledashWarmup(player, dt, dashSet, aimProvider, blockers);
            } else {
                let dashVx = player.dashDir.x * player.speed * dashSet.speedMult;
                let dashVy = player.dashDir.y * player.speed * dashSet.speedMult;
                let oldX = player.x, oldY = player.y;
                player.x += dashVx * dt;
                player.y += dashVy * dt;
                player.x = clamp(player.x, player.radius, window.CANVAS_W-player.radius);
                player.y = clamp(player.y, player.radius, CANVAS_H-player.radius);
                let collided = false;
                // First: check collision with the enemy (characters) so ramming hits players/enemies directly in open space
                if (activeEnemy && player.ram && dist(player.x, player.y, enemy.x, enemy.y) < player.radius + enemy.radius) {
                    // If enemy is inactive (eliminated/disabled), ignore ram damage
                    if (typeof isEntityActive === 'function' && !isEntityActive(enemy)) {
                        // skip
                    } else {
                        let dmg = 18 + (player.ramStacks || 0) * 6; // damage scales per ram stack
                        enemy._lastAttacker = player;
                        enemy.takeDamage(dmg);
                        enemy._lastAttacker = null;
                    }
                    // Knockback logic: shove enemy in dash direction, scaling with ram stacks, but stop at obstacles
                    if (player.dashDir) {
                        let ramStacks = player.ramStacks || 0;
                        let knockbackDist = 60 + ramStacks * 40; // base 60px, +40px per stack
                        let steps = Math.ceil(knockbackDist / 8); // move in 8px increments
                        let stepX = player.dashDir.x * (knockbackDist / steps);
                        let stepY = player.dashDir.y * (knockbackDist / steps);
                        for (let i = 0; i < steps; ++i) {
                            let nextX = enemy.x + stepX;
                            let nextY = enemy.y + stepY;
                            // Check collision with obstacles
                            let collides = false;
                            for (let o of obstacles) {
                                if (o.circleCollide(nextX, nextY, enemy.radius)) {
                                    collides = true;
                                    break;
                                }
                            }
                            if (collides) break;
                            enemy.x = nextX;
                            enemy.y = nextY;
                        }
                        // Clamp enemy position to arena bounds
                        enemy.x = clamp(enemy.x, enemy.radius, window.CANVAS_W - enemy.radius);
                        enemy.y = clamp(enemy.y, enemy.radius, CANVAS_H - enemy.radius);
                    }
                    // revert position and mark collision so dash ends (mirror obstacle behavior)
                    player.x = oldX; player.y = oldY;
                    collided = true;
                }
                // Also check collision with infested chunks (they behave like destructible enemies)
                if (!collided && player.ram && (player.obliterator || (player.obliteratorStacks || 0) > 0) && infestedChunks && infestedChunks.length) {
                    for (let ic of infestedChunks) {
                        if (!ic.active) continue;
                        let centerX = ic.x + ic.w/2, centerY = ic.y + ic.h/2;
                        let thresh = Math.max(ic.w, ic.h) * 0.5 + player.radius;
                        if (dist(player.x, player.y, centerX, centerY) < thresh) {
                            let ramStacks = player.ramStacks || 0;
                            let oblStacks = player.obliteratorStacks || 0;
                            let radiusMul = 1 + 0.22 * ramStacks; // ram radius scaling kept as-is
                            // Increased obliterator power scaling: stronger per-stack effect
                            let powerMul = 1 + 0.75 * oblStacks;
                            let basePower = 1.6 * (1 + 0.4 * ramStacks);
                            // chip the infested chunk (uses hp and explosion FX)
                            ic.chipAt(player.x, player.y, player.radius * 1.6 * radiusMul, basePower * powerMul, player.obliterator, false, 0);
                            player.x = oldX; player.y = oldY;
                            collided = true;
                            break;
                        }
                    }
                }
                // If no character collision, check collision with obstacles and apply ram/obliterator effects
                if (!collided) {
                    for (let o of obstacles) {
                        if (o.circleCollide(player.x, player.y, player.radius)) {
                            // If player has ramming, deal damage to obstacle chunks at impact
                            if (player.ram && (player.obliterator || (player.obliteratorStacks || 0) > 0)) {
                                // Compute collision point and chip only if player has obliterator
                                let cx = player.x, cy = player.y;
                                let ramStacks = player.ramStacks || 0;
                                let oblStacks = player.obliteratorStacks || 0;
                                let radiusMul = 1 + 0.22 * ramStacks; // keep ram-based radius unchanged
                                let powerMul = 1 + 0.75 * oblStacks;
                                // base power moderately tuned for dash
                                let basePower = 1.6 * (1 + 0.4 * ramStacks);
                                // Do NOT apply fire shot effect when ramming
                                o.chipChunksAt(cx, cy, player.radius * 1.6 * radiusMul, basePower * powerMul, player.obliterator, false, 0);
                            }
                            player.x = oldX;
                            player.y = oldY;
                            collided = true;
                            break;
                        }
                    }
                }
                player.dashTime -= dt;
                if (player.dashTime <= 0 || collided) {
                    player.dashActive = false;
                }
            }
        } else {
            player.dashCooldown = Math.max(0, player.dashCooldown - dt);
        }
    }
    // Joiner clients should locally tick their own teledash warmup visuals so they
    // can see the range ring even though the host is authoritative for teleport.
    try {
        if (NET && NET.role === 'joiner') {
            // Advance local warmup timers for the joiner's own player object
            tickLocalTeledashWarmup(player, dt);
        }
    } catch (e) {}
    if (simulateLocally && !enemySuppressed && enemy.dash && !NET.connected) {
        if (!enemy.dashActive && Math.random() < 0.003 && enemy.dashCooldown <= 0) {
            let dx = enemy.x - player.x, dy = enemy.y - player.y;
            let norm = Math.hypot(dx, dy);
            let dir = norm > 0 ? { x: dx/norm, y: dy/norm } : { x: 1, y: 0 };
            let dashSet = getDashSettings(enemy);
            beginDash(enemy, dir, dashSet, { lockedAim: { x: player.x, y: player.y } });
        }
        if (enemy.dashActive) {
            let dashSet = getDashSettings(enemy);
            if (isTeledashEnabled(enemy)) {
                const blockers = { obstacles, others: [player] };
                const aimProvider = () => ({ x: player.x, y: player.y });
                updateTeledashWarmup(enemy, dt, dashSet, aimProvider, blockers);
            } else {
                let dashVx = enemy.dashDir.x * enemy.speed * dashSet.speedMult;
                let dashVy = enemy.dashDir.y * enemy.speed * dashSet.speedMult;
                let oldx = enemy.x, oldy = enemy.y;
                enemy.x += dashVx * dt;
                enemy.y += dashVy * dt;
                enemy.x = clamp(enemy.x, enemy.radius, window.CANVAS_W-enemy.radius);
                enemy.y = clamp(enemy.y, enemy.radius, CANVAS_H-enemy.radius);
                let collided = false;
                // First: check collision with player directly so enemy dash damages player in open space
                if (enemy.ram && dist(enemy.x, enemy.y, player.x, player.y) < enemy.radius + player.radius) {
                    // Skip if player inactive
                    if (!(typeof isEntityActive === 'function' && !isEntityActive(player))) {
                        let dmg = 18 + (enemy.ramStacks || 0) * 6;
                        player._lastAttacker = enemy;
                        player.takeDamage(dmg);
                        player._lastAttacker = null;
                    }
                    enemy.x = oldx; enemy.y = oldy;
                    collided = true;
                }
                // Also check collision with infested chunks
                if (!collided && enemy.ram && (enemy.obliterator || (enemy.obliteratorStacks || 0) > 0) && infestedChunks && infestedChunks.length) {
                    for (let ic of infestedChunks) {
                        if (!ic.active) continue;
                        let centerX = ic.x + ic.w/2, centerY = ic.y + ic.h/2;
                        let thresh = Math.max(ic.w, ic.h) * 0.5 + enemy.radius;
                        if (dist(enemy.x, enemy.y, centerX, centerY) < thresh) {
                            let ramStacks = enemy.ramStacks || 0;
                            let oblStacks = enemy.obliteratorStacks || 0;
                            let radiusMul = 1 + 0.22 * ramStacks;
                            let powerMul = 1 + 0.45 * oblStacks;
                            let basePower = 1.6 * (1 + 0.4 * ramStacks);
                            ic.chipAt(enemy.x, enemy.y, enemy.radius * 1.6 * radiusMul, basePower * powerMul, enemy.obliterator, false, (enemy.fireshotStacks || 0));
                            enemy.x = oldx; enemy.y = oldy;
                            collided = true;
                            break;
                        }
                    }
                }
                // If no character collision, check collision with obstacles
                if (!collided) {
                    for(let o of obstacles) {
                        if(o.circleCollide(enemy.x, enemy.y, enemy.radius)) {
                            // Enemy ramming into obstacles
                            if (enemy.ram && (enemy.obliterator || (enemy.obliteratorStacks || 0) > 0)) {
                                let cx = enemy.x, cy = enemy.y;
                                let ramStacks = enemy.ramStacks || 0;
                                let oblStacks = enemy.obliteratorStacks || 0;
                                let radiusMul = 1 + 0.22 * ramStacks;
                                let powerMul = 1 + 0.75 * oblStacks;
                                let basePower = 1.6 * (1 + 0.4 * ramStacks);
                                o.chipChunksAt(cx, cy, enemy.radius * 1.6 * radiusMul, basePower * powerMul, enemy.obliterator, false, (enemy.fireshotStacks || 0));
                            }
                            enemy.x = oldx; enemy.y = oldy;
                            collided = true;
                            break;
                        }
                    }
                }
                enemy.dashTime -= dt;
                if (enemy.dashTime <= 0 || collided) {
                    enemy.dashActive = false;
                }
            }
        } else {
            enemy.dashCooldown = Math.max(0, enemy.dashCooldown - dt);
        }
    }
    // If joiner, disable local enemy AI and movement (enemy will be driven by snapshots)
    if (NET.role === 'joiner') {
        // Joiner still moves their local player; enemy AI disabled below
    }
    if (simulateLocally && !player.dashActive && !joinerIsWM_AI_On && !hostIsWM_AI_On) {
        if (input.x || input.y) {
            let norm = Math.hypot(input.x, input.y);
            input.x /= norm; input.y /= norm;
            let speed = player.speed;
            let oldX = player.x;
            player.x += input.x * speed * dt;
            player.x = clamp(player.x, player.radius, window.CANVAS_W-player.radius);
            let collidedX = false;
            for (let o of obstacles) {
                if (o.circleCollide(player.x, player.y, player.radius)) {
                    player.x = oldX;
                    collidedX = true;
                    break;
                }
            }
            let oldY = player.y;
            player.y += input.y * speed * dt;
            player.y = clamp(player.y, player.radius, CANVAS_H-player.radius);
            let collidedY = false;
            for (let o of obstacles) {
                if (o.circleCollide(player.x, player.y, player.radius)) {
                    player.y = oldY;
                    collidedY = true;
                    break;
                }
            }
        }
    }
    if (NET.role === 'host') {
        // Host: drive remote players using per-joiner remoteInputs
        try {
            const inputsMap = NET.remoteInputs || {};
            for (const key in inputsMap) {
                const jIdx = coerceJoinerIndex(key);
                if (jIdx === null) continue;
                const ri = inputsMap[jIdx] || { up:false,down:false,left:false,right:false };
                // Find the fighter/entity that corresponds to this joiner index
                let remoteEntity = null;
                try {
                    const fighters = (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.getFighters === 'function') ? playerRoster.getFighters({ includeUnassigned: false, includeEntity: true }) : [];
                    for (const f of fighters) {
                        if (!f || !f.metadata) continue;
                        const metaJi = coerceJoinerIndex(f && f.metadata && f.metadata.joinerIndex);
                        if (metaJi === jIdx) { remoteEntity = f.entity || (playerRoster.getEntityReference && playerRoster.getEntityReference(f.id)) || null; break; }
                    }
                } catch (e) { remoteEntity = null; }
                if (!remoteEntity) {
                    // Fallback: use legacy enemy mapping for joinerIndex 0
                    if (jIdx === 0 && enemy) remoteEntity = enemy;
                    else continue;
                }
                try { console.log('[HOST] joiner->entity mapping', jIdx, '->', (remoteEntity && (remoteEntity._rosterFighterId || remoteEntity.id || '<no-id>'))); } catch (e) {}
                let vx = (ri.right?1:0) - (ri.left?1:0);
                let vy = (ri.down?1:0) - (ri.up?1:0);
                if (!remoteEntity.dashActive) {
                    if (vx || vy) {
                        let norm = Math.hypot(vx, vy);
                        vx = norm ? (vx / norm) : 0;
                        vy = norm ? (vy / norm) : 0;
                        const speed = remoteEntity.speed || 0;
                        const oldX = remoteEntity.x;
                        remoteEntity.x += vx * speed * dt;
                        remoteEntity.x = clamp(remoteEntity.x, remoteEntity.radius, window.CANVAS_W - remoteEntity.radius);
                        for (let o of obstacles) { if (o.circleCollide(remoteEntity.x, remoteEntity.y, remoteEntity.radius)) { remoteEntity.x = oldX; break; } }
                        const oldY = remoteEntity.y;
                        remoteEntity.y += vy * speed * dt;
                        remoteEntity.y = clamp(remoteEntity.y, remoteEntity.radius, CANVAS_H - remoteEntity.radius);
                        for (let o of obstacles) { if (o.circleCollide(remoteEntity.x, remoteEntity.y, remoteEntity.radius)) { remoteEntity.y = oldY; break; } }
                    }
                }
                // Process dash/shoot requests for this joiner using per-joiner maps further down
            }
        } catch (e) {}
        // If enemy is currently dashing, move and resolve collisions (host authoritative)
        if (enemy.dashActive) {
            let dashSet = getDashSettings(enemy);
                if (isTeledashEnabled(enemy)) {
                    const blockers = { obstacles, others: [player] };
                    // Aim provider that resolves the correct joiner's aim for the given entity.
                    const aimProvider = () => {
                        try {
                            // Attempt to find the roster fighter record that references this enemy entity
                            if (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.getFighters === 'function') {
                                const fighters = playerRoster.getFighters({ includeUnassigned: false, includeEntity: true }) || [];
                                for (const f of fighters) {
                                    if (!f) continue;
                                    const ent = f.entity || (playerRoster.getEntityReference && playerRoster.getEntityReference(f.id));
                                    if (ent === enemy) {
                                        const ji = coerceJoinerIndex(f && f.metadata && f.metadata.joinerIndex);
                                        const ri = (ji !== null && NET.remoteInputs) ? NET.remoteInputs[ji] : null;
                                        return {
                                            x: (ri && typeof ri.aimX === 'number') ? ri.aimX : player.x,
                                            y: (ri && typeof ri.aimY === 'number') ? ri.aimY : player.y
                                        };
                                    }
                                }
                            }
                        } catch (e) {}
                        // Fallback: use legacy player cursor
                        return { x: player.x, y: player.y };
                    };
                    updateTeledashWarmup(enemy, dt, dashSet, aimProvider, blockers);
                } else {
                let dashVx = enemy.dashDir.x * enemy.speed * dashSet.speedMult;
                let dashVy = enemy.dashDir.y * enemy.speed * dashSet.speedMult;
                let oldx = enemy.x, oldy = enemy.y;
                enemy.x += dashVx * dt;
                enemy.y += dashVy * dt;
                enemy.x = clamp(enemy.x, enemy.radius, window.CANVAS_W-enemy.radius);
                enemy.y = clamp(enemy.y, enemy.radius, CANVAS_H-enemy.radius);
                let collided = false;
                // Collision with player (ram) - apply damage + knockback similar to player-side ram
                if (enemy.ram && dist(enemy.x, enemy.y, player.x, player.y) < enemy.radius + player.radius) {
                    let dmg = 18 + (enemy.ramStacks || 0) * 6;
                    player._lastAttacker = enemy;
                    player.takeDamage(dmg);
                    player._lastAttacker = null;
                    // Knockback logic: shove player in enemy dash direction, scaling with ram stacks, but stop at obstacles
                    let dirX = enemy.dashDir ? enemy.dashDir.x : (player.x - enemy.x);
                    let dirY = enemy.dashDir ? enemy.dashDir.y : (player.y - enemy.y);
                    let norm = Math.hypot(dirX, dirY) || 1;
                    dirX /= norm; dirY /= norm;
                    let ramStacks = enemy.ramStacks || 0;
                    let knockbackDist = 60 + ramStacks * 40; // base 60px, +40px per stack
                    let steps = Math.ceil(knockbackDist / 8);
                    let stepX = dirX * (knockbackDist / steps);
                    let stepY = dirY * (knockbackDist / steps);
                    for (let i = 0; i < steps; ++i) {
                        let nextX = player.x + stepX;
                        let nextY = player.y + stepY;
                        // Check collision with obstacles for the player
                        let collides = false;
                        for (let o of obstacles) {
                            if (o.circleCollide(nextX, nextY, player.radius)) { collides = true; break; }
                        }
                        if (collides) break;
                        player.x = nextX;
                        player.y = nextY;
                    }
                    // Clamp player position to arena bounds
                    player.x = clamp(player.x, player.radius, window.CANVAS_W - player.radius);
                    player.y = clamp(player.y, player.radius, CANVAS_H - player.radius);
                    // Revert enemy position and mark collision so dash ends
                    enemy.x = oldx; enemy.y = oldy;
                    collided = true;
                }
                // Collision with infested chunks (ram/obliterator effects)
                if (!collided && enemy.ram && (enemy.obliterator || (enemy.obliteratorStacks || 0) > 0) && infestedChunks && infestedChunks.length) {
                    for (let ic of infestedChunks) {
                        if (!ic.active) continue;
                        let centerX = ic.x + ic.w/2, centerY = ic.y + ic.h/2;
                        let thresh = Math.max(ic.w, ic.h) * 0.5 + enemy.radius;
                        if (dist(enemy.x, enemy.y, centerX, centerY) < thresh) {
                            let ramStacks = enemy.ramStacks || 0;
                            let oblStacks = enemy.obliteratorStacks || 0;
                            let radiusMul = 1 + 0.22 * ramStacks;
                            let powerMul = 1 + 0.45 * oblStacks;
                            let basePower = 1.6 * (1 + 0.4 * ramStacks);
                            ic.chipAt(enemy.x, enemy.y, enemy.radius * 1.6 * radiusMul, basePower * powerMul, enemy.obliterator, false);
                            enemy.x = oldx; enemy.y = oldy;
                            collided = true;
                            break;
                        }
                    }
                }
                // Collision with obstacles
                if (!collided) {
                    for (let o of obstacles) {
                        if (o.circleCollide(enemy.x, enemy.y, enemy.radius)) {
                            if (enemy.ram && (enemy.obliterator || (enemy.obliteratorStacks || 0) > 0)) {
                                let cx = enemy.x, cy = enemy.y;
                                let ramStacks = enemy.ramStacks || 0;
                                let oblStacks = enemy.obliteratorStacks || 0;
                                let radiusMul = 1 + 0.22 * ramStacks;
                                let powerMul = 1 + 0.75 * oblStacks;
                                let basePower = 1.6 * (1 + 0.4 * ramStacks);
                                o.chipChunksAt(cx, cy, enemy.radius * 1.6 * radiusMul, basePower * powerMul, enemy.obliterator, false);
                            }
                            enemy.x = oldx; enemy.y = oldy;
                            collided = true;
                            break;
                        }
                    }
                }
                enemy.dashTime -= dt;
                if (enemy.dashTime <= 0 || collided) {
                    enemy.dashActive = false;
                }
            }
        } else {
            // Cooldown ticks when not dashing
            enemy.dashCooldown = Math.max(0, enemy.dashCooldown - dt);
        }
        // Process dash and shooting intents per joiner (multi-joiner support)
        try {
            const inputsMap = NET.remoteInputs || {};
            for (const key in inputsMap) {
                const jIdx = coerceJoinerIndex(key);
                if (jIdx === null) continue;
                const ri = inputsMap[jIdx] || {};
                // locate the entity for this joiner via roster metadata
                let remoteEntity = null;
                try {
                    const fighters = (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.getFighters === 'function') ? playerRoster.getFighters({ includeUnassigned: false, includeEntity: true }) : [];
                    for (const f of fighters) {
                        if (!f || !f.metadata) continue;
                        const metaJi = coerceJoinerIndex(f && f.metadata && f.metadata.joinerIndex);
                        if (metaJi === jIdx) { remoteEntity = f.entity || (playerRoster.getEntityReference && playerRoster.getEntityReference(f.id)) || null; break; }
                    }
                } catch (e) { remoteEntity = null; }
                if (!remoteEntity) {
                    // legacy fallback to enemy for joiner 0
                    if (jIdx === 0 && enemy) remoteEntity = enemy;
                    else continue;
                }

                // Dash processing per-joiner
                const dashReq = (NET.remoteDashReqSeqMap && NET.remoteDashReqSeqMap[jIdx]) || 0;
                const lastProc = (NET.lastProcessedRemoteDashSeqMap && NET.lastProcessedRemoteDashSeqMap[jIdx]) || 0;
                if (dashReq && dashReq > lastProc && remoteEntity.dash && !remoteEntity.dashActive && remoteEntity.dashCooldown <= 0) {
                    let vx = (ri.right?1:0) - (ri.left?1:0);
                    let vy = (ri.down?1:0) - (ri.up?1:0);
                    let dir = { x: 0, y: 0 };
                    if (vx || vy) {
                        let norm = Math.hypot(vx, vy) || 1; dir.x = vx / norm; dir.y = vy / norm;
                        let dashSet = getDashSettings(remoteEntity);
                        beginDash(remoteEntity, dir, dashSet, { showWarmup: true });
                    } else {
                        let dx = (ri.aimX||player.x) - remoteEntity.x;
                        let dy = (ri.aimY||player.y) - remoteEntity.y;
                        let norm = Math.hypot(dx, dy) || 1; dir = { x: dx/norm, y: dy/norm };
                        let dashSet = getDashSettings(remoteEntity);
                        beginDash(remoteEntity, dir, dashSet, { lockedAim: { x: ri.aimX || player.x, y: ri.aimY || player.y }, showWarmup: true });
                    }
                    if (!NET.lastProcessedRemoteDashSeqMap) NET.lastProcessedRemoteDashSeqMap = {};
                    NET.lastProcessedRemoteDashSeqMap[jIdx] = dashReq;
                    if (NET.remoteDashReqSeqMap) NET.remoteDashReqSeqMap[jIdx] = 0;
                }

                // Shooting per-joiner (host authoritative)
                remoteEntity.timeSinceShot = (remoteEntity.timeSinceShot || 0) + dt;
                if (NET.remoteShootQueuedMap && NET.remoteShootQueuedMap[jIdx] && remoteEntity.timeSinceShot >= remoteEntity.shootInterval) {
                    const wantsShoot = !!(ri && ri.shoot);
                    if (wantsShoot) {
                        const aimX = (ri && typeof ri.aimX === 'number') ? ri.aimX : player.x;
                        const aimY = (ri && typeof ri.aimY === 'number') ? ri.aimY : player.y;
                        remoteEntity.shootToward({ x: aimX, y: aimY }, bullets);
                        for (let i = bullets.length-1; i >= 0; i--) {
                            if (bullets[i].owner === remoteEntity && !bullets[i].id) NET.tagBullet(bullets[i]);
                        }
                        remoteEntity.timeSinceShot = 0;
                        if (!wantsShoot) NET.remoteShootQueuedMap[jIdx] = false;
                    } else {
                        NET.remoteShootQueuedMap[jIdx] = false;
                    }
                }
                // Clear transient flags on this per-joiner input record
                if (ri) { ri.shoot = false; ri.dash = false; }
            }
        } catch (e) { /* defensive */ }
    } else {
        // Joiner: suppress local enemy AI entirely; enemy state comes from snapshots
        // No movement/AI here
    }
    // Host: also run AI for any roster-assigned bots (host is authoritative for bots in multiplayer)
    if (simulateLocally && NET.connected && NET.role === 'host') {
        try {
            const aiEntities = [];
            // include legacy enemy object if it's a bot-style entity (not remote player)
            if (enemy && !enemyDisabled && enemy._isRosterBot) aiEntities.push(enemy);
            // collect roster bots (includeEntity to get actual entity refs)
            if (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.getFighters === 'function') {
                const fighters = playerRoster.getFighters({ includeUnassigned: false, includeEntity: true }) || [];
                for (const f of fighters) {
                    if (!f) continue;
                    if (f.kind !== 'bot') continue;
                    if (f.isAlive === false) continue;
                    const ent = playerRoster.getEntityReference(f.id) || f.entity || null;
                    if (!ent) continue;
                    // don't include the main player/enemy duplicate
                    if (ent === player || ent === enemy) continue;
                    if (!isEntityActive(ent, { skipRosterLookup: true })) continue;
                    aiEntities.push(ent);
                }
            }

            // Run AI update for all collected bot entities
            for (const ent of aiEntities) {
                if (!ent || !isEntityActive(ent)) continue;
                ent.timeSinceShot += dt;
                const targetCandidates = [];
                const enqueueTarget = (candidate) => {
                    if (!candidate || candidate === ent) return;
                    if (!isEntityActive(candidate)) return;
                    if (targetCandidates.includes(candidate)) return;
                    targetCandidates.push(candidate);
                };
                enqueueTarget(player);
                enqueueTarget(enemy);
                try {
                    if (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.getFighters === 'function') {
                        const fighters = playerRoster.getFighters({ includeUnassigned: false, includeEntity: true }) || [];
                        for (const f of fighters) {
                            if (!f || f.isAlive === false) continue;
                            const rosterEnt = playerRoster.getEntityReference(f.id) || f.entity || null;
                            enqueueTarget(rosterEnt);
                        }
                    }
                } catch (err) {}

                // choose nearest target
                let target = null;
                for (const candidate of targetCandidates) {
                    if (!candidate) continue;
                    if (!target) { target = candidate; continue; }
                    const candDist = dist(ent.x, ent.y, candidate.x, candidate.y);
                    const bestDist = dist(ent.x, ent.y, target.x, target.y);
                    if (candDist < bestDist) target = candidate;
                }
                if (!target) continue;

                let distToTarget = dist(ent.x, ent.y, target.x, target.y);
                let canSeeTarget = hasLineOfSight(ent.x, ent.y, target.x, target.y, obstacles);
                let canShootDespiteBlock = ent.pierce || ent.obliterator;
                if (
                    ent.timeSinceShot >= ent.shootInterval &&
                    (canSeeTarget || canShootDespiteBlock) &&
                    distToTarget > 125 && distToTarget < 430
                ) {
                    let t = { x: target.x, y: target.y };
                    ent.shootToward(t, bullets);
                    ent.timeSinceShot = 0;
                    // Tag bullets if host
                    if (NET.role === 'host') {
                        for (let i = bullets.length-1; i >= 0; i--) {
                            if (bullets[i].owner === ent && !bullets[i].id) NET.tagBullet(bullets[i]);
                        }
                    }
                }
                // Movement / strafing similar to single-player AI
                if (!ent.dashActive) {
                    if (typeof ent._strafePhase === 'undefined') ent._strafePhase = Math.random() * Math.PI * 2;
                    if (typeof ent._strafeSwitch === 'undefined') ent._strafeSwitch = (Math.random() * 1.4) + 0.6;
                    ent._strafeSwitch -= dt;
                    if (ent._strafeSwitch <= 0) { ent._strafeSwitch = (Math.random() * 1.6) + 0.6; ent._strafePhase += Math.PI; }
                    const IDEAL_DIST = 240; const BAND = 36;
                    let dx = target.x - ent.x, dy = target.y - ent.y;
                    let r = Math.hypot(dx, dy) || 1; let radial = 0;
                    if (r > IDEAL_DIST + BAND) radial = 1; else if (r < IDEAL_DIST - BAND) radial = -1;
                    let rx = dx / r, ry = dy / r;
                    ent._strafePhase += dt * (0.9 + Math.random() * 0.8);
                    let strafeDir = Math.sign(Math.sin(ent._strafePhase)) || 1;
                    let perpX = -ry * strafeDir; let perpY = rx * strafeDir;
                    let distFactor = Math.max(0, 1 - Math.abs(r - IDEAL_DIST) / (IDEAL_DIST));
                    let strafeAmp = lerp(0.35, 0.9, distFactor);
                    let mvx = (radial * rx) + (perpX * strafeAmp); let mvy = (radial * ry) + (perpY * strafeAmp);
                    let mlen = Math.hypot(mvx, mvy) || 1; mvx /= mlen; mvy /= mlen;
                    let speed = ent.speed; let oldx = ent.x, oldy = ent.y;
                    ent.x += mvx * speed * dt; ent.y += mvy * speed * dt;
                    ent.x = clamp(ent.x, ent.radius, window.CANVAS_W - ent.radius);
                    ent.y = clamp(ent.y, ent.radius, CANVAS_H - ent.radius);
                    for (let o of obstacles) { if (o.circleCollide(ent.x, ent.y, ent.radius)) { ent.x = oldx; ent.y = oldy; break; } }
                }
            }
        } catch (err) {
            // defensive: if roster or other state missing, skip host-side bot AI this tick
        }
    }
    // Check if blue AI is controlling player to avoid double increment
    const blueAIActive = !!(NET.connected && NET.role === 'host' && worldMasterEnabled && !enemySuppressed && 
        ((worldMasterPlayerIndex === 0) || (worldMasterPlayerIndex === 1)));
    if (simulateLocally && !blueAIActive) player.timeSinceShot += dt;
    if (simulateLocally && !blueAIActive && isEntityActive(player) && player.shootQueued && player.timeSinceShot >= player.shootInterval) {
        player.shootToward(mouse, bullets);
        // If this client is a joiner doing local prediction, mark newly fired bullets as local so Shot Controller can steer them
        if (NET.role === 'joiner') {
            for (let i = bullets.length - 1; i >= 0; --i) {
                const b = bullets[i];
                if (b.owner === player && b.justFired) {
                    b.isLocalPlayerBullet = true;
                }
            }
        }
        // Host assigns bullet ids for player's bullets
        if (NET.role === 'host') {
            for (let i = bullets.length-1; i >= 0; i--) {
                if (bullets[i].owner === player && !bullets[i].id) {
                    NET.tagBullet(bullets[i]);
                    bullets[i].isLocalPlayerBullet = true;
                }
            }
        }
        player.timeSinceShot = 0;
    }
    // Disable enemy AI entirely when multiplayer is active; only run in solo
    // --- AI Logic: Support WorldMaster mode (2 AI fight each other) ---
    if (simulateLocally && !enemySuppressed && !NET.connected) {
        // WorldMaster mode: host is world master, 2 AI fight each other
        if (window.localPlayerIndex === -1 && window.aiCount === 2) {
            // Ensure both AI exist
            if (!window.ai1) {
                const c1 = (typeof getJoinerColor === 'function') ? getJoinerColor(0) : '#ff5a5a';
                window.ai1 = new Player(false, c1, window.CANVAS_W/3, CANVAS_H/2);
                window.ai1.displayName = "AI 1";
            }
            if (!window.ai2) {
                const c2 = (typeof HOST_PLAYER_COLOR !== 'undefined') ? HOST_PLAYER_COLOR : '#65c6ff';
                window.ai2 = new Player(false, c2, 2*window.CANVAS_W/3, CANVAS_H/2);
                window.ai2.displayName = "AI 2";
            }
            let aiA = window.ai1, aiB = window.ai2;
            // Update both AI
            [aiA, aiB].forEach((self, idx) => {
                let target = idx === 0 ? aiB : aiA;
                // Shooting logic
                self.timeSinceShot += dt;
                let distToTarget = dist(self.x, self.y, target.x, target.y);
                let canSeeTarget = hasLineOfSight(self.x, self.y, target.x, target.y, obstacles);
                let canShootDespiteBlock = self.pierce || self.obliterator;
                if (
                    self.timeSinceShot >= self.shootInterval &&
                    (canSeeTarget || canShootDespiteBlock) &&
                    distToTarget > 125 && distToTarget < 430
                ) {
                    let t = { x: target.x, y: target.y };
                    self.shootToward(t, bullets);
                    self.timeSinceShot = 0;
                }
                // Movement / seeking + strafing
                if (!self.dashActive) {
                    if (typeof self._strafePhase === 'undefined') self._strafePhase = Math.random() * Math.PI * 2;
                    if (typeof self._strafeSwitch === 'undefined') self._strafeSwitch = (Math.random() * 1.4) + 0.6;
                    self._strafeSwitch -= dt;
                    if (self._strafeSwitch <= 0) {
                        self._strafeSwitch = (Math.random() * 1.6) + 0.6;
                        self._strafePhase += Math.PI;
                    }
                    const IDEAL_DIST = 240;
                    const BAND = 36;
                    let dx = target.x - self.x, dy = target.y - self.y;
                    let r = Math.hypot(dx, dy) || 1;
                    let radial = 0;
                    if (r > IDEAL_DIST + BAND) radial = 1;
                    else if (r < IDEAL_DIST - BAND) radial = -1;
                    let rx = dx / r, ry = dy / r;
                    self._strafePhase += dt * (0.9 + Math.random() * 0.8);
                    let strafeDir = Math.sign(Math.sin(self._strafePhase)) || 1;
                    let perpX = -ry * strafeDir;
                    let perpY = rx * strafeDir;
                    let distFactor = Math.max(0, 1 - Math.abs(r - IDEAL_DIST) / (IDEAL_DIST));
                    let strafeAmp = lerp(0.35, 0.9, distFactor);
                    let mvx = (radial * rx) + (perpX * strafeAmp);
                    let mvy = (radial * ry) + (perpY * strafeAmp);
                    let mlen = Math.hypot(mvx, mvy) || 1;
                    mvx /= mlen; mvy /= mlen;
                    let speed = self.speed;
                    let oldx = self.x, oldy = self.y;
                    self.x += mvx * speed * dt;
                    self.y += mvy * speed * dt;
                    self.x = clamp(self.x, self.radius, window.CANVAS_W-self.radius);
                    self.y = clamp(self.y, self.radius, CANVAS_H-self.radius);
                    for (let o of obstacles) {
                        if (o.circleCollide(self.x, self.y, self.radius)) { self.x = oldx; self.y = oldy; break; }
                    }
                }
            });
            // For drawing and other logic, set player/enemy to AI 1/2
            player = ai1;
            enemy = ai2;
        } else {
            // Normal single-player AI logic (player vs AI)
            const aiEntities = [];
            if (enemy && !enemyDisabled && isEntityActive(enemy, { skipRosterLookup: true })) aiEntities.push(enemy);
            // Also include any roster bot entities so multiple bots act in the match
            try {
                if (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.getFighters === 'function') {
                    const fighters = playerRoster.getFighters({ includeUnassigned: false }) || [];
                    for (const f of fighters) {
                        if (!f) continue;
                        if (f.kind === 'bot') {
                            if (f.isAlive === false) continue;
                            const ent = playerRoster.getEntityReference(f.id);
                            if (!ent) continue;
                            if (!isEntityActive(ent, { skipRosterLookup: true })) continue;
                            if (!aiEntities.includes(ent)) aiEntities.push(ent);
                        }
                    }
                }
            } catch (e) {}

            for (const ent of aiEntities) {
                if (!isEntityActive(ent)) continue;
                ent.timeSinceShot += dt;
                const targetCandidates = [];
                const enqueueTarget = (candidate) => {
                    if (!candidate || candidate === ent) return;
                    if (!isEntityActive(candidate)) return;
                    if (targetCandidates.includes(candidate)) return;
                    targetCandidates.push(candidate);
                };
                enqueueTarget(player);
                enqueueTarget(enemy);
                try {
                    if (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.getFighters === 'function') {
                        const fighters = playerRoster.getFighters({ includeUnassigned: false, includeEntity: true }) || [];
                        for (const f of fighters) {
                            if (!f || f.isAlive === false) continue;
                            const rosterEnt = playerRoster.getEntityReference(f.id) || f.entity || null;
                            enqueueTarget(rosterEnt);
                        }
                    }
                } catch (err) {}

                let target = null;
                for (const candidate of targetCandidates) {
                    if (!candidate) continue;
                    if (!target) {
                        target = candidate;
                        continue;
                    }
                    const candDist = dist(ent.x, ent.y, candidate.x, candidate.y);
                    const bestDist = dist(ent.x, ent.y, target.x, target.y);
                    if (candDist < bestDist) target = candidate;
                }
                if (!target) continue;

                let distToPlayer = dist(ent.x, ent.y, target.x, target.y);
                let canSeePlayer = hasLineOfSight(ent.x, ent.y, target.x, target.y, obstacles);
                let canShootDespiteBlock = ent.pierce || ent.obliterator;
                if (
                    ent.timeSinceShot >= ent.shootInterval &&
                    (canSeePlayer || canShootDespiteBlock) &&
                    distToPlayer > 125 && distToPlayer < 430
                ) {
                    let t = { x: target.x, y: target.y };
                    ent.shootToward(t, bullets);
                    ent.timeSinceShot = 0;
                }
                if (!ent.dashActive) {
                    if (typeof ent._strafePhase === 'undefined') ent._strafePhase = Math.random() * Math.PI * 2;
                    if (typeof ent._strafeSwitch === 'undefined') ent._strafeSwitch = (Math.random() * 1.4) + 0.6;
                    ent._strafeSwitch -= dt;
                    if (ent._strafeSwitch <= 0) {
                        ent._strafeSwitch = (Math.random() * 1.6) + 0.6;
                        ent._strafePhase += Math.PI;
                    }
                    const IDEAL_DIST = 240;
                    const BAND = 36;
                    let dx = target.x - ent.x, dy = target.y - ent.y;
                    let r = Math.hypot(dx, dy) || 1;
                    let radial = 0;
                    if (r > IDEAL_DIST + BAND) radial = 1;
                    else if (r < IDEAL_DIST - BAND) radial = -1;
                    let rx = dx / r, ry = dy / r;
                    ent._strafePhase += dt * (0.9 + Math.random() * 0.8);
                    let strafeDir = Math.sign(Math.sin(ent._strafePhase)) || 1;
                    let perpX = -ry * strafeDir;
                    let perpY = rx * strafeDir;
                    let distFactor = Math.max(0, 1 - Math.abs(r - IDEAL_DIST) / (IDEAL_DIST));
                    let strafeAmp = lerp(0.35, 0.9, distFactor);
                    let mvx = (radial * rx) + (perpX * strafeAmp);
                    let mvy = (radial * ry) + (perpY * strafeAmp);
                    let mlen = Math.hypot(mvx, mvy) || 1;
                    mvx /= mlen; mvy /= mlen;
                    let speed = ent.speed;
                    let oldx = ent.x, oldy = ent.y;
                    ent.x += mvx * speed * dt;
                    ent.y += mvy * speed * dt;
                    ent.x = clamp(ent.x, ent.radius, window.CANVAS_W-ent.radius);
                    ent.y = clamp(ent.y, ent.radius, CANVAS_H-ent.radius);
                    for (let o of obstacles) {
                        if (o.circleCollide(ent.x, ent.y, ent.radius)) { ent.x = oldx; ent.y = oldy; break; }
                    }
                }
            }
        }
    } else if (simulateLocally && NET.connected && NET.role === 'host') {
        // Multiplayer host-only AI: drive the blue entity when a World Master is selected and Enemy AI is enabled.
        const twoPlayers = (Array.isArray(NET.joiners) ? NET.joiners.length === 1 : true);
        // Host drives blue AI when: (1) host is WM, or (2) joiner is WM and Enemy AI is on
        
        const shouldDriveBlueAI = !!(worldMasterEnabled && !enemySuppressed && 
            ((worldMasterPlayerIndex === 0) || (worldMasterPlayerIndex === 1)));
        
        if (twoPlayers && shouldDriveBlueAI) {
            // From host perspective: player is blue (host), enemy is red (joiner). We want blue to be AI, red is human.
            // Swap roles locally for AI control without changing render mapping: treat 'player' as AI self, 'enemy' as target.
            const self = player; // blue AI
            const target = enemy; // red human
            if (self && target) {
                self.timeSinceShot += dt;
                const distToTarget = dist(self.x, self.y, target.x, target.y);
                const canSeeTarget = hasLineOfSight(self.x, self.y, target.x, target.y, obstacles);
                const canShootDespiteBlock = self.pierce || self.obliterator;
                if (
                    self.timeSinceShot >= self.shootInterval &&
                    (canSeeTarget || canShootDespiteBlock) &&
                    distToTarget > 125 && distToTarget < 430
                ) {
                    const t = { x: target.x, y: target.y };
                    self.shootToward(t, bullets);
                    // Host assigns bullet ids for AI's bullets (blue)
                    if (NET.role === 'host') {
                        for (let i = bullets.length-1; i >= 0; i--) {
                            if (bullets[i].owner === self && !bullets[i].id) NET.tagBullet(bullets[i]);
                        }
                    }
                    self.timeSinceShot = 0;
                }
                if (!self.dashActive) {
                    if (typeof self._strafePhase === 'undefined') self._strafePhase = Math.random() * Math.PI * 2;
                    if (typeof self._strafeSwitch === 'undefined') self._strafeSwitch = (Math.random() * 1.4) + 0.6;
                    self._strafeSwitch -= dt;
                    if (self._strafeSwitch <= 0) {
                        self._strafeSwitch = (Math.random() * 1.6) + 0.6;
                        self._strafePhase += Math.PI;
                    }
                    const IDEAL_DIST = 240;
                    const BAND = 36;
                    let dx = target.x - self.x, dy = target.y - self.y;
                    let r = Math.hypot(dx, dy) || 1;
                    let radial = 0;
                    if (r > IDEAL_DIST + BAND) radial = 1;
                    else if (r < IDEAL_DIST - BAND) radial = -1;
                    let rx = dx / r, ry = dy / r;
                    self._strafePhase += dt * (0.9 + Math.random() * 0.8);
                    let strafeDir = Math.sign(Math.sin(self._strafePhase)) || 1;
                    let perpX = -ry * strafeDir;
                    let perpY = rx * strafeDir;
                    let distFactor = Math.max(0, 1 - Math.abs(r - IDEAL_DIST) / (IDEAL_DIST));
                    let strafeAmp = lerp(0.35, 0.9, distFactor);
                    let mvx = (radial * rx) + (perpX * strafeAmp);
                    let mvy = (radial * ry) + (perpY * strafeAmp);
                    let mlen = Math.hypot(mvx, mvy) || 1;
                    mvx /= mlen; mvy /= mlen;
                    let speed = self.speed;
                    let oldx = self.x, oldy = self.y;
                    self.x += mvx * speed * dt;
                    self.y += mvy * speed * dt;
                    self.x = clamp(self.x, self.radius, window.CANVAS_W-self.radius);
                    self.y = clamp(self.y, self.radius, CANVAS_H-self.radius);
                    for (let o of obstacles) {
                        if (o.circleCollide(self.x, self.y, self.radius)) { self.x = oldx; self.y = oldy; break; }
                    }
                }
                // Optional AI dash behavior for blue
                if (!self.dashActive && self.dash && self.dashCooldown <= 0 && Math.random() < 0.0025) {
                    let dx = target.x - self.x, dy = target.y - self.y;
                    let norm = Math.hypot(dx, dy) || 1;
                    let dir = { x: dx/norm, y: dy/norm };
                    let dashSet = getDashSettings(self);
                    beginDash(self, dir, dashSet, { lockedAim: { x: target.x, y: target.y } });
                }
                if (self.dashActive) {
                    let dashSet = getDashSettings(self);
                    if (isTeledashEnabled(self)) {
                        const blockers = { obstacles, others: [target] };
                        const aimProvider = () => ({ x: target.x, y: target.y });
                        updateTeledashWarmup(self, dt, dashSet, aimProvider, blockers);
                    } else {
                        let dashVx = self.dashDir.x * self.speed * dashSet.speedMult;
                        let dashVy = self.dashDir.y * self.speed * dashSet.speedMult;
                        let oldx = self.x, oldy = self.y;
                        self.x += dashVx * dt; self.y += dashVy * dt;
                        self.x = clamp(self.x, self.radius, window.CANVAS_W-self.radius);
                        self.y = clamp(self.y, self.radius, CANVAS_H-self.radius);
                        let collided = false;
                        if (self.ram && dist(self.x, self.y, target.x, target.y) < self.radius + target.radius) {
                            // Skip if target inactive
                            if (!(typeof isEntityActive === 'function' && !isEntityActive(target))) {
                                let dmg = 18 + (self.ramStacks || 0) * 6;
                                target._lastAttacker = self;
                                target.takeDamage(dmg);
                                target._lastAttacker = null;
                                self.x = oldx; self.y = oldy; collided = true;
                            }
                        }
                        if (!collided) {
                            for (let o of obstacles) {
                                if (o.circleCollide(self.x, self.y, self.radius)) {
                                    if (self.ram && (self.obliterator || (self.obliteratorStacks || 0) > 0)) {
                                        let cx = self.x, cy = self.y;
                                        let ramStacks = self.ramStacks || 0;
                                        let oblStacks = self.obliteratorStacks || 0;
                                        let radiusMul = 1 + 0.22 * ramStacks;
                                        let powerMul = 1 + 0.45 * oblStacks;
                                        let basePower = 1.6 * (1 + 0.4 * ramStacks);
                                        o.chipChunksAt(cx, cy, self.radius * 1.6 * radiusMul, basePower * powerMul, self.obliterator, false, (self.fireshotStacks || 0));
                                    }
                                    self.x = oldx; self.y = oldy; collided = true; break;
                                }
                            }
                        }
                        self.dashTime -= dt; if (self.dashTime <= 0 || collided) self.dashActive = false;
                    }
                } else {
                    if (typeof self.dashCooldown === 'number') self.dashCooldown = Math.max(0, self.dashCooldown - dt);
                }
            }
        }
    } else if (simulateLocally && NET.connected && NET.role === 'host') {
        // Host drives red AI when joiner is WM and Enemy AI is enabled
        const twoPlayers = (Array.isArray(NET.joiners) ? NET.joiners.length === 1 : true);
        
    const shouldDriveRedAI = !!(worldMasterEnabled && !enemySuppressed && (worldMasterPlayerIndex === 1));
        
        if (twoPlayers && shouldDriveRedAI) {
            // From host perspective: enemy is red (joiner), player is blue (host). We want red to be AI, blue is human.
            const self = enemy; // red AI
            const target = player; // blue human
            if (self && target) {
                self.timeSinceShot += dt;
                const distToTarget = dist(self.x, self.y, target.x, target.y);
                const canSeeTarget = hasLineOfSight(self.x, self.y, target.x, target.y, obstacles);
                const canShootDespiteBlock = self.pierce || self.obliterator;
                if (
                    self.timeSinceShot >= self.shootInterval &&
                    (canSeeTarget || canShootDespiteBlock) &&
                    distToTarget > 125 && distToTarget < 430
                ) {
                    const t = { x: target.x, y: target.y };
                    self.shootToward(t, bullets);
                    // Host assigns bullet ids for AI's bullets (red)
                    if (NET.role === 'host') {
                        for (let i = bullets.length-1; i >= 0; i--) {
                            if (bullets[i].owner === self && !bullets[i].id) NET.tagBullet(bullets[i]);
                        }
                    }
                    self.timeSinceShot = 0;
                }
                if (!self.dashActive) {
                    if (typeof self._strafePhase === 'undefined') self._strafePhase = Math.random() * Math.PI * 2;
                    if (typeof self._strafeSwitch === 'undefined') self._strafeSwitch = (Math.random() * 1.4) + 0.6;
                    self._strafeSwitch -= dt;
                    if (self._strafeSwitch <= 0) {
                        self._strafeSwitch = (Math.random() * 1.6) + 0.6;
                        self._strafePhase += Math.PI;
                    }
                    const IDEAL_DIST = 240;
                    const BAND = 36;
                    let dx = target.x - self.x, dy = target.y - self.y;
                    let r = Math.hypot(dx, dy) || 1;
                    let radial = 0;
                    if (r > IDEAL_DIST + BAND) radial = 1;
                    else if (r < IDEAL_DIST - BAND) radial = -1;
                    let rx = dx / r, ry = dy / r;
                    self._strafePhase += dt * (0.9 + Math.random() * 0.8);
                    let strafeDir = Math.sign(Math.sin(self._strafePhase)) || 1;
                    let perpX = -ry * strafeDir;
                    let perpY = rx * strafeDir;
                    let distFactor = Math.max(0, 1 - Math.abs(r - IDEAL_DIST) / (IDEAL_DIST));
                    let strafeAmp = lerp(0.35, 0.9, distFactor);
                    let mvx = (radial * rx) + (perpX * strafeAmp);
                    let mvy = (radial * ry) + (perpY * strafeAmp);
                    let mlen = Math.hypot(mvx, mvy) || 1;
                    mvx /= mlen; mvy /= mlen;
                    let speed = self.speed;
                    let oldx = self.x, oldy = self.y;
                    self.x += mvx * speed * dt;
                    self.y += mvy * speed * dt;
                    self.x = clamp(self.x, self.radius, window.CANVAS_W-self.radius);
                    self.y = clamp(self.y, self.radius, CANVAS_H-self.radius);
                    for (let o of obstacles) {
                        if (o.circleCollide(self.x, self.y, self.radius)) { self.x = oldx; self.y = oldy; break; }
                    }
                }
                // Optional AI dash behavior for red
                if (!self.dashActive && self.dash && self.dashCooldown <= 0 && Math.random() < 0.0025) {
                    let dx = target.x - self.x, dy = target.y - self.y;
                    let norm = Math.hypot(dx, dy) || 1;
                    let dir = { x: dx/norm, y: dy/norm };
                    let dashSet = getDashSettings(self);
                    beginDash(self, dir, dashSet, { lockedAim: { x: target.x, y: target.y } });
                }
                if (self.dashActive) {
                    let dashSet = getDashSettings(self);
                    if (isTeledashEnabled(self)) {
                        const blockers = { obstacles, others: [target] };
                        const aimProvider = () => ({ x: target.x, y: target.y });
                        updateTeledashWarmup(self, dt, dashSet, aimProvider, blockers);
                    } else {
                        let dashVx = self.dashDir.x * self.speed * dashSet.speedMult;
                        let dashVy = self.dashDir.y * self.speed * dashSet.speedMult;
                        let oldx = self.x, oldy = self.y;
                        self.x += dashVx * dt; self.y += dashVy * dt;
                        self.x = clamp(self.x, self.radius, window.CANVAS_W-self.radius);
                        self.y = clamp(self.y, self.radius, CANVAS_H-self.radius);
                        let collided = false;
                        if (self.ram && dist(self.x, self.y, target.x, target.y) < self.radius + target.radius) {
                            let dmg = 18 + (self.ramStacks || 0) * 6;
                            target._lastAttacker = self;
                            target.takeDamage(dmg);
                            target._lastAttacker = null;
                            self.x = oldx; self.y = oldy; collided = true;
                        }
                        if (!collided) {
                            for (let o of obstacles) {
                                if (o.circleCollide(self.x, self.y, self.radius)) {
                                    if (self.ram && (self.obliterator || (self.obliteratorStacks || 0) > 0)) {
                                        let cx = self.x, cy = self.y;
                                        let ramStacks = self.ramStacks || 0;
                                        let oblStacks = self.obliteratorStacks || 0;
                                        let radiusMul = 1 + 0.22 * ramStacks;
                                        let powerMul = 1 + 0.45 * oblStacks;
                                        let basePower = 1.6 * (1 + 0.4 * ramStacks);
                                        o.chipChunksAt(cx, cy, self.radius * 1.6 * radiusMul, basePower * powerMul, self.obliterator, false);
                                    }
                                    self.x = oldx; self.y = oldy; collided = true; break;
                                }
                            }
                        }
                        self.dashTime -= dt; if (self.dashTime <= 0 || collided) self.dashActive = false;
                    }
                } else {
                    if (typeof self.dashCooldown === 'number') self.dashCooldown = Math.max(0, self.dashCooldown - dt);
                }
            }
        }
    }
    // Bullets: on host (or solo), integrate locally; on joiner, lerp toward snapshot targets for smooth visuals
    if (simulateLocally) {
        for (let b of bullets) if (b.active) b.update(dt);
        // On host, steer remote-controlled bullets toward their joiner's aim if available
        if (NET.connected && NET.role === 'host') {
            const inputsMap = NET.remoteInputs || {};
            for (let b of bullets) {
                if (!b.active || !b.shotController || !b.playerControlActive) continue;
                // determine which joiner controls this bullet via owner -> roster fighter mapping
                let owner = b.owner || null;
                let joinerIdx = null;
                if (owner && owner._rosterFighterId) {
                    try {
                        const f = (playerRoster && typeof playerRoster.getFighterById === 'function') ? playerRoster.getFighterById(owner._rosterFighterId) : null;
                        if (f && f.metadata) joinerIdx = coerceJoinerIndex(f.metadata.joinerIndex);
                    } catch (e) {}
                } else if (owner === enemy) {
                    joinerIdx = 0;
                }
                if (joinerIdx === null) continue;
                const ri = inputsMap[joinerIdx] || null;
                if (!ri || typeof ri.aimX !== 'number' || typeof ri.aimY !== 'number') continue;
                let dx = ri.aimX - b.x;
                let dy = ri.aimY - b.y;
                let distToCursor = Math.hypot(dx, dy);
                if (distToCursor > 2) {
                    let steerAngle = Math.atan2(dy, dx);
                    let turnRate = 0.13; // radians per frame
                    let da = steerAngle - b.angle;
                    while (da > Math.PI) da -= 2 * Math.PI;
                    while (da < -Math.PI) da += 2 * Math.PI;
                    if (Math.abs(da) > turnRate) {
                        b.angle += turnRate * Math.sign(da);
                    } else {
                        b.angle = steerAngle;
                    }
                }
            }
        }
    } else {
        const s = 24; // bullet smoothing rate (snappier than players)
        const t = Math.max(0, Math.min(1, s * dt));
        for (let b of bullets) {
            if (!b.active) continue;
            // If this bullet is locally controlled (host or joiner), simulate it locally
            if (b.isLocalPlayerBullet) {
                try {
                    b.update(dt);
                    // If we're a non-authoritative client (joiner) and this bullet belongs to the local player,
                    // perform a visual-only obstacle collision/ricochet so joiner visuals match host behavior.
                    if (NET && NET.connected && NET.role === 'joiner') {
                        try { handleLocalBulletObstacleCollision(b); } catch (e) {}
                    }
                } catch (e) { /* ignore update errors to avoid crash */ }
                continue;
            }
            // Otherwise, smooth position/angle from snapshot
            const tx = (typeof b.targetX === 'number') ? b.targetX : b.x;
            const ty = (typeof b.targetY === 'number') ? b.targetY : b.y;
            const ta = (typeof b.targetAngle === 'number') ? b.targetAngle : b.angle;
            const newX = lerp(b.x, tx, t);
            const newY = lerp(b.y, ty, t);
            b.angle = lerpAngle(b.angle, ta, t);
            // Append visual trail points for non-local bullets (joiner) so trails are visible
            try {
                // If the bullet has moved noticeably since last stored trail point, push one
                if (!Array.isArray(b.trail)) b.trail = [];
                const last = b.trail.length ? b.trail[b.trail.length - 1] : null;
                const dx = last ? (newX - last.x) : (newX - b.x);
                const dy = last ? (newY - last.y) : (newY - b.y);
                if (!last || (dx*dx + dy*dy) > 9) { // ~3px threshold squared
                    b.trail.push({ x: newX, y: newY });
                    // Clamp trail length to bullet's trailMax if present or a sensible default
                    const maxLen = (typeof b.trailMax === 'number') ? b.trailMax : 8;
                    while (b.trail.length > maxLen) b.trail.shift();
                }
            } catch (e) {}
            b.x = newX;
            b.y = newY;
            // Optionally, smooth angle as well (if needed)
        }
    }
    for (let o of obstacles) o.update(dt);
    // Always update explosion visuals. Only apply damage/chunk updates on the authoritative side (host or single-player).
    const explosionPlayers = [player].concat(enemySuppressed ? [] : [enemy]);
    // Add roster bot entities to explosion targets
    try {
        if (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.getFighters === 'function') {
            const fighters = playerRoster.getFighters({ includeUnassigned: false, includeEntity: true }) || [];
            for (const f of fighters) {
                if (!f || !f.entity) continue;
                if (f.isAlive === false) continue;
                if (f.metadata && f.metadata.isWorldMaster) continue;
                if (!explosionPlayers.includes(f.entity)) explosionPlayers.push(f.entity);
            }
        }
    } catch (e) {}
    const explosionHealers = (healersActive && healers.length) ? healers.filter(h => h && h.active) : [];
    for (let e of explosions) {
        if (!e.done) e.update(dt, obstacles, explosionPlayers, simulateLocally, explosionHealers);
    }
    explosions = explosions.filter(e => !e.done);


    // Bullet collision and effects (host only)
    if (simulateLocally) for (let b of bullets) {
        if (!b.active) continue;
        // Collect all potential victims: player, enemy, and roster bots
        let potentialVictims = [];
        if (player) potentialVictims.push(player);
        if (enemy && !enemyDisabled) potentialVictims.push(enemy);
        // Add roster bot entities
        try {
            if (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.getFighters === 'function') {
                const fighters = playerRoster.getFighters({ includeUnassigned: false, includeEntity: true }) || [];
                for (const f of fighters) {
                    if (!f || !f.entity) continue;
                    if (f.isAlive === false) continue;
                    // Skip worldmaster placeholders
                    if (f.metadata && f.metadata.isWorldMaster) continue;
                    // Skip if already in list
                    if (!potentialVictims.includes(f.entity)) potentialVictims.push(f.entity);
                }
            }
        } catch (e) {}

        let hit = false;
        for (const victim of potentialVictims) {
            if (!victim || victim === b.owner) continue; // Don't hit self
                    if (dist(b.x, b.y, victim.x, victim.y) < b.radius + victim.radius) {
                        // Ignore hits on inactive/eliminated victims
                        if (typeof isEntityActive === 'function' && !isEntityActive(victim)) continue;
                // If victim is dashing and has deflect available, reflect the bullet instead of taking damage
                if (victim.dashActive && victim.deflect && (victim.deflectRemaining || 0) > 0) {
                    // compute normal from victim center to bullet
                    let nx = b.x - victim.x;
                    let ny = b.y - victim.y;
                    let nlen = Math.hypot(nx, ny) || 0.0001;
                    nx /= nlen; ny /= nlen;
                    // reflect bullet angle
                    let vx = Math.cos(b.angle), vy = Math.sin(b.angle);
                    let dot = vx*nx + vy*ny;
                    let rx = vx - 2 * dot * nx;
                    let ry = vy - 2 * dot * ny;
                    b.angle = Math.atan2(ry, rx);
                    // nudge out of collision
                    b.x += rx * (b.radius * 0.9);
                    b.y += ry * (b.radius * 0.9);
                    // reassign ownership to the deflector so it can hit original owner
                    b.owner = victim;
                    // decrement available deflects for this dash
                    victim.deflectRemaining = Math.max(0, (victim.deflectRemaining||0) - 1);
                    // If bullet had bounces left, consume one (optional) to match ricochet behavior
                    if ((b.bouncesLeft|0) > 0) b.bouncesLeft = Math.max(0, b.bouncesLeft - 1);
                    // ensure explosive bullets do NOT explode on deflect; keep them active
                    b.active = true;
                    try { playRicochet(); } catch (e) {}
                    hit = true;
                    break; // Stop checking other victims after deflect
                } else {
                    if (b.explosive) {
                        triggerExplosion(b, victim.x, victim.y);
                    } else {
                        victim._lastAttacker = b.owner || null;
                        victim.takeDamage(b.damage);
                        victim._lastAttacker = null;
                        // Fireshot: apply burning
                        if (b.fireshot) {
                            let stacks = (b.owner && b.owner.fireshotStacks) ? b.owner.fireshotStacks : 1;
                            victim.burning = { time: 0, duration: 1.2 + 1.3 * stacks };
                            try {
                                if (NET && NET.role === 'host' && NET.connected) {
                                    const payload = { duration: victim.burning.duration };
                                    if (victim._rosterFighterId) payload.fighterId = victim._rosterFighterId;
                                    else if (victim.id) payload.entityId = victim.id;
                                    try { GameEvents.emit('burning-start', payload); } catch (e) {}
                                }
                            } catch (e) {}
                        }
                    }
                    b.active = false;
                    hit = true;
                    break; // Stop checking other victims after hit
                }
            }
        }
        if (hit) continue;

        if (healersActive && healers.length) {
            for (const healer of healers) {
                if (!healer || !healer.active) continue;
                if (dist(b.x, b.y, healer.x, healer.y) < b.radius + healer.radius) {
                    if (b.explosive) {
                        triggerExplosion(b, healer.x, healer.y);
                    } else {
                        healer._lastAttacker = b.owner || null;
                        healer.takeDamage(b.damage, b.owner || null);
                        healer._lastAttacker = null;
                        if (b.fireshot) {
                            const stacks = (b.owner && b.owner.fireshotStacks) ? b.owner.fireshotStacks : 1;
                            healer.burning = { time: 0, duration: 1.2 + 1.3 * stacks };
                            try {
                                if (NET && NET.role === 'host' && NET.connected) {
                                    const payload = { duration: healer.burning.duration };
                                    if (healer._rosterFighterId) payload.fighterId = healer._rosterFighterId;
                                    else if (healer.id) payload.entityId = healer.id;
                                    try { GameEvents.emit('burning-start', payload); } catch (e) {}
                                }
                            } catch (e) {}
                        }
                    }
                    b.active = false;
                    hit = true;
                    break;
                }
            }
        }
        if (hit) continue;

        // Infested chunk collision
        for (let ic of infestedChunks) {
            if (!ic.active) continue;
            let centerX = ic.x + ic.w/2;
            let centerY = ic.y + ic.h/2;
            let r = Math.max(ic.w, ic.h) * 0.6;
            if (dist(b.x, b.y, centerX, centerY) < b.radius + r) {
                // Only bullets whose owner has obliterator can chip infested chunks
                if (b.obliterator || (b.obliteratorStacks || 0) > 0) {
                    let stacks = b.obliteratorStacks || 0;
                    // stronger obliterator stacking: bigger chip radius and more chip power per stack
                    let radiusMul = 1.22 * (1 + 0.6 * stacks);
                    let powerMul = 1 + 0.75 * stacks;
                    let chipPower = (b.damage/18) * powerMul;
                    let didChip = ic.chipAt(b.x, b.y, b.radius * radiusMul, chipPower, b.obliterator, b.explosive);
                    if (didChip) {
                        // Fireshot: apply burning to chunk
                        if (b.fireshot) {
                            let stacks = (b.owner && b.owner.fireshotStacks) ? b.owner.fireshotStacks : 1;
                            ic.burning = { time: 0, duration: 1.2 + 1.3 * stacks };
                            try {
                                if (NET && NET.role === 'host' && NET.connected) {
                                    try { GameEvents.emit('burning-start', { infestedId: ic.id, duration: ic.burning.duration }); } catch (e) {}
                                }
                            } catch (e) {}
                        }
                        if (b.explosive) {
                            triggerExplosion(b, centerX, centerY);
                            b.active = false;
                            break;
                        }
                        if ((b.bouncesLeft|0) > 0) {
                            // reflect bullet
                            let nx = b.x - centerX;
                            let ny = b.y - centerY;
                            let nlen = Math.hypot(nx, ny);
                            if (nlen === 0) {
                                nx = (Math.random() - 0.5) || 0.0001;
                                ny = (Math.random() - 0.5) || 0.0001;
                                nlen = Math.hypot(nx, ny);
                            }
                            nx /= nlen; ny /= nlen;
                            let vx = Math.cos(b.angle), vy = Math.sin(b.angle);
                            let dot = vx*nx + vy*ny;
                            let rx = vx - 2 * dot * nx;
                            let ry = vy - 2 * dot * ny;
                            b.angle = Math.atan2(ry, rx);
                            b.bouncesLeft = Math.max(0, b.bouncesLeft - 1);
                            b.x += rx * (b.radius * 0.9);
                            b.y += ry * (b.radius * 0.9);
                            try { playRicochet(); } catch (e) {}
                            break;
                        } else {
                            b.active = false;
                            break;
                        }
                    }
                }
            }
        }
        if (!b.active) continue;

        for (let o of obstacles) {
            if (o.destroyed) continue;
            if (!b.pierce) {
                if (b.obliterator) {
                    // Scale chip radius and power by obliterator stacks on the bullet (from owner)
                    let stacks = b.obliteratorStacks || 0;
                    // stronger obliterator effect on bullets' chip radius and power
                    let radiusMul = 1.22 * (1 + 0.6 * stacks);
                    let powerMul = 1 + 0.75 * stacks;
                    // Find the collided chunk/closest point BEFORE chipping so we can reflect
                    let collidedChunk = null;
                    let closestX = 0, closestY = 0;
                    for (const c of o.chunks) {
                        if (c.destroyed) continue;
                        let cx = clamp(b.x, c.x, c.x + c.w);
                        let cy = clamp(b.y, c.y, c.y + c.h);
                        let dx = b.x - cx, dy = b.y - cy;
                        if ((dx*dx + dy*dy) < b.radius * b.radius) {
                            collidedChunk = c;
                            closestX = cx; closestY = cy;
                            break;
                        }
                    }
                    // If we actually collided with a chunk and this bullet is explosive, explode at impact
                    if (collidedChunk) {
                        if (b.explosive) {
                            triggerExplosion(b, b.x, b.y, o);
                            b.active = false;
                            break;
                        }
                    }
                    let didChip = o.chipChunksAt(
                        b.x, b.y,
                        b.radius * radiusMul,
                        (b.damage/18) * powerMul,
                        b.obliterator || true, // ensure obliterator flag is set if bullet has it
                        false,
                        b.fireshotStacks || 0
                    );
                    if (didChip) {
                        // If the bullet is explosive, trigger a full explosion at the impact
                        // even if we used obliterator-style chunk chipping. Then deactivate the bullet.
                        if (b.explosive) {
                            try { triggerExplosion(b, b.x, b.y, o); } catch (e) {}
                            b.active = false;
                            break;
                        }
                        // If bullet can still ricochet, perform reflection instead of dying
                        if ((b.bouncesLeft|0) > 0) {
                            // if we have a precomputed collision point, reflect around its normal
                            if (collidedChunk) {
                                let nx = b.x - closestX;
                                let ny = b.y - closestY;
                                let nlen = Math.hypot(nx, ny);
                                if (nlen === 0) {
                                    nx = (Math.random() - 0.5) || 0.0001;
                                    ny = (Math.random() - 0.5) || 0.0001;
                                    nlen = Math.hypot(nx, ny);
                                }
                                nx /= nlen; ny /= nlen;
                                let vx = Math.cos(b.angle), vy = Math.sin(b.angle);
                                let dot = vx*nx + vy*ny;
                                let rx = vx - 2 * dot * nx;
                                let ry = vy - 2 * dot * ny;
                                b.angle = Math.atan2(ry, rx);
                                b.bouncesLeft = Math.max(0, b.bouncesLeft - 1);
                                b.x += rx * (b.radius * 0.9);
                                b.y += ry * (b.radius * 0.9);
                                try { playRicochet(); } catch (e) {}
                                // continue to next obstacle/bullet
                                break;
                            } else {
                                // destroyed chunks prevented finding collision point; try a generic reflection
                                let nx = (Math.random() - 0.5) || 0.0001;
                                let ny = (Math.random() - 0.5) || 0.0001;
                                let nlen = Math.hypot(nx, ny);
                                nx /= nlen; ny /= nlen;
                                let vx = Math.cos(b.angle), vy = Math.sin(b.angle);
                                let dot = vx*nx + vy*ny;
                                let rx = vx - 2 * dot * nx;
                                let ry = vy - 2 * dot * ny;
                                b.angle = Math.atan2(ry, rx);
                                b.bouncesLeft = Math.max(0, b.bouncesLeft - 1);
                                b.x += rx * (b.radius * 0.9);
                                b.y += ry * (b.radius * 0.9);
                                try { playRicochet(); } catch (e) {}
                                break;
                            }
                        } else {
                            // no bounces left -> spawn impact lines and deactivate
                            try {
                                if (typeof createImpactLines === 'function') {
                                    // compute a reasonable normal if we have a collision point
                                    let nx = 0, ny = 0;
                                    try { nx = b.x - (closestX || b.x); ny = b.y - (closestY || b.y); } catch (e) { nx = 0; ny = 0; }
                                    let nlen = Math.hypot(nx, ny);
                                    if (nlen === 0) { nx = (Math.random() - 0.5) || 0.0001; ny = (Math.random() - 0.5) || 0.0001; nlen = Math.hypot(nx, ny); }
                                    nx /= nlen; ny /= nlen;
                                    const baseAngle = Math.atan2(ny, nx);
                                    createImpactLines(b.x, b.y, b.damage || 1, (b.owner && b.owner.color) ? b.owner.color : '#ffffff', baseAngle);
                                    try { if (typeof playImpact === 'function') playImpact(b.damage || 1); } catch (e) {}
                                    try { if (NET && NET.role === 'host') createSyncedImpact(b.x, b.y, b.damage || 1, (b.owner && b.owner.color) ? b.owner.color : '#ffffff', baseAngle); } catch (e) {}
                                }
                            } catch (e) {}
                            b.active = false;
                            break;
                        }
                    }
                } else {
                    // Check collision against chunks so we can compute a surface normal for ricochet
                    let collidedChunk = null;
                    let closestX = 0, closestY = 0;
                    for (const c of o.chunks) {
                        if (c.destroyed) continue;
                        let cx = clamp(b.x, c.x, c.x + c.w);
                        let cy = clamp(b.y, c.y, c.y + c.h);
                        let dx = b.x - cx, dy = b.y - cy;
                        if ((dx*dx + dy*dy) < b.radius * b.radius) {
                            collidedChunk = c;
                            closestX = cx; closestY = cy;
                            break;
                        }
                    }
                    if (collidedChunk) {
                        // Non-obliterator bullets no longer chip chunks; only obliterator-enabled owners can chip
                        if (b.explosive) {
                            triggerExplosion(b, b.x, b.y, o);
                            b.active = false;
                            break;
                        }
                        if ((b.bouncesLeft|0) > 0) {
                            // reflect velocity around surface normal (from collision point to bullet center)
                            let nx = b.x - closestX;
                            let ny = b.y - closestY;
                            let nlen = Math.hypot(nx, ny);
                            if (nlen === 0) {
                                // fallback normal if center exactly on corner
                                nx = (Math.random() - 0.5) || 0.0001;
                                ny = (Math.random() - 0.5) || 0.0001;
                                nlen = Math.hypot(nx, ny);
                            }
                            nx /= nlen; ny /= nlen;
                            let vx = Math.cos(b.angle), vy = Math.sin(b.angle);
                            let dot = vx*nx + vy*ny;
                            let rx = vx - 2 * dot * nx;
                            let ry = vy - 2 * dot * ny;
                            // set new angle and decrement bounce count
                            b.angle = Math.atan2(ry, rx);
                            b.bouncesLeft = Math.max(0, b.bouncesLeft - 1);
                            // nudge bullet out of collision so it doesn't immediately re-collide
                            b.x += rx * (b.radius * 0.9);
                            b.y += ry * (b.radius * 0.9);
                            try { playRicochet(); } catch (e) {}
                            // continue to next bullet (don't deactivate)
                            break;
                        } else {
                            // spawn impact lines at collision normal and deactivate
                            try {
                                if (typeof createImpactLines === 'function') {
                                    let nx = b.x - closestX;
                                    let ny = b.y - closestY;
                                    let nlen = Math.hypot(nx, ny);
                                    if (nlen === 0) { nx = (Math.random() - 0.5) || 0.0001; ny = (Math.random() - 0.5) || 0.0001; nlen = Math.hypot(nx, ny); }
                                    nx /= nlen; ny /= nlen;
                                    const baseAngle = Math.atan2(ny, nx);
                                    createImpactLines(b.x, b.y, b.damage || 1, (b.owner && b.owner.color) ? b.owner.color : '#ffffff', baseAngle);
                                    try { if (typeof playImpact === 'function') playImpact(b.damage || 1); } catch (e) {}
                                    try { if (NET && NET.role === 'host') createSyncedImpact(b.x, b.y, b.damage || 1, (b.owner && b.owner.color) ? b.owner.color : '#ffffff', baseAngle); } catch (e) {}
                                }
                            } catch (e) {}
                            b.active = false;
                            break;
                        }
                    }
                }
            } else if (b.pierce) {
                // Piercing bullets: check for collision with chunks and decrement pierce limit
                let collidedChunk = null;
                for (const c of o.chunks) {
                    if (c.destroyed) continue;
                    let cx = clamp(b.x, c.x, c.x + c.w);
                    let cy = clamp(b.y, c.y, c.y + c.h);
                    let dx = b.x - cx, dy = b.y - cy;
                    if ((dx*dx + dy*dy) < b.radius * b.radius) {
                        collidedChunk = c;
                        break;
                    }
                }
                if (collidedChunk) {
                    b.pierceLimit--;
                    if (b.pierceLimit <= 0) {
                        // Bullet expired due to pierce limit while inside an obstacle chunk.
                        // Do NOT spawn impact lines, explosions, or play sounds in this case —
                        // simply deactivate the bullet so it disappears silently.
                        b.active = false;
                        break;
                    }
                }
            }
        }
    }
    bullets = bullets.filter(b => b.active);

    // Decrement visual timers for all active entities: player, enemy, roster bots, healers
    try {
        const ents = [];
        if (player) ents.push(player);
        if (enemy) ents.push(enemy);
        // Add roster entity references (bots/extra fighters)
        if (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.getFighters === 'function') {
            const fighters = playerRoster.getFighters({ includeUnassigned: false, includeEntity: true }) || [];
            for (const f of fighters) {
                if (!f || !f.entity) continue;
                // Skip duplicates
                if (!ents.includes(f.entity)) ents.push(f.entity);
            }
        }
        // Include healers (they manage their own damageFlash too, but safe to include)
        if (Array.isArray(healers) && healers.length) {
            for (const h of healers) if (h && !ents.includes(h)) ents.push(h);
        }
        for (const p of ents) {
            if (!p) continue;
            if (p.shakeTime > 0) p.shakeTime = Math.max(0, p.shakeTime - dt);
            if (p.damageFlash > 0) p.damageFlash = Math.max(0, p.damageFlash - dt);
            if (p.healthbarFlash > 0) p.healthbarFlash = Math.max(0, p.healthbarFlash - dt);
        }
    } catch (e) {
        // defensive: if something unexpected, ensure player/enemy timers still update
        try {
            if (player) {
                if (player.shakeTime > 0) player.shakeTime = Math.max(0, player.shakeTime - dt);
                if (player.damageFlash > 0) player.damageFlash = Math.max(0, player.damageFlash - dt);
                if (player.healthbarFlash > 0) player.healthbarFlash = Math.max(0, player.healthbarFlash - dt);
            }
            if (enemy) {
                if (enemy.shakeTime > 0) enemy.shakeTime = Math.max(0, enemy.shakeTime - dt);
                if (enemy.damageFlash > 0) enemy.damageFlash = Math.max(0, enemy.damageFlash - dt);
                if (enemy.healthbarFlash > 0) enemy.healthbarFlash = Math.max(0, enemy.healthbarFlash - dt);
            }
        } catch (e2) {}
    }

    // --- Healers logic ---
    if (healersActive) {
        if (simulateLocally) {
            if (!healers.length) {
                if (!healerPendingRespawn) {
                    spawnHealerAt();
                }
            }
            const targets = getHealerTargets();
            let anyAlive = false;
            for (const healer of healers) {
                if (!healer) continue;
                if (healer.active) {
                    anyAlive = true;
                    healer.update(dt, targets);
                } else if (!healerPendingRespawn) {
                    healerPendingRespawn = true;
                    healerRespawnTimer = 0;
                    setNextHealerRespawnDelay();
                }
            }
            healers = healers.filter(h => h && h.active);
            // Clean up inactive healer targets
            if (NET.joinerTargets && NET.joinerTargets.healers) {
                for (const [id, target] of NET.joinerTargets.healers.entries()) {
                    const healerExists = healers.some(h => h && h.id === id);
                    if (!healerExists) {
                        NET.joinerTargets.healers.delete(id);
                    }
                }
            }
            if (!anyAlive && !healerPendingRespawn) {
                healerPendingRespawn = true;
                healerRespawnTimer = 0;
                setNextHealerRespawnDelay();
            }
            if (healerPendingRespawn) {
                healerRespawnTimer += dt;
                if (healerRespawnTimer >= healerRespawnDelay) {
                    healerRespawnTimer = 0;
                    healerPendingRespawn = false;
                    healers = healers.filter(h => h && h.active);
                    spawnHealerAt(healerPreSpawnPos);
                    healerPreSpawnPos = null;
                }
            }
        } else {
            for (const healer of healers) {
                if (!healer || !healer.active) continue;
                healer.update(dt, null, { applyGameLogic: false });
            }
        }
    }

    // --- Respawn, health reset, card (host-authoritative) ---
    // Run when in single-player (not connected) OR when connected as host
    if (simulateLocally) {
        hostEvaluateEliminations();
    }
}

// --- Explosion trigger ---
function triggerExplosion(bullet, x, y) {
    let owner = bullet.owner;
    // reduce bullet-size influence: use a sublinear exponent so very large bullets affect radius less
    const sizeFactor = Math.pow(Math.max(0.1, (bullet.radius / window.BULLET_RADIUS)), 0.6);
    let explosionRadius = window.EXPLOSION_BASE_RADIUS * sizeFactor * (1 + bullet.damage/64);
    // keep damage scaling for explosion damage, but reduce size-driven damage boost
    let explosionDamage = bullet.damage * (1.08 + 0.12 * sizeFactor);
    let canObliterate = bullet.obliterator;
    if (canObliterate) {
        // smaller obliterator radius bonus to avoid very large splash
        explosionRadius *= 1.12;
        explosionDamage *= 1.12;
    }
    // lower the maximum allowed explosion radius
    explosionRadius = Math.min(explosionRadius, 170);
    explosionDamage = Math.max(8, Math.min(explosionDamage, 90));
    // Fireshot: mark explosion as fiery
    let isFireshot = bullet.fireshot;
    // Scale explosion radius slightly per explosive stack (small per-stack bonus)
    let explosiveStacks = bullet.explosiveStacks || 0;
    if (explosiveStacks > 0) {
        // each stack increases radius by ~12% (tunable)
        explosionRadius *= (1 + 0.12 * explosiveStacks);
        // ensure the cap still applies
        explosionRadius = Math.min(explosionRadius, 200);
    }
    explosions.push(new Explosion(
        x, y,
        explosionRadius,
        owner.color,
        explosionDamage,
        owner,
        canObliterate,
        isFireshot
    ));
    playExplosion();
    // If we're host in a multiplayer game, broadcast a visual-only explosion event
    // Use new sync helper for explosion
    createSyncedExplosion(x, y, explosionRadius, (owner && owner.color) ? owner.color : '#ffffff', explosionDamage, owner);
}

// --- Draw ---
// --- Powerup Cards ---
function buildPowerupChoices(loser, desiredCount = 5) {
    let powerupPool = POWERUPS;
    try {
        if (window.WorldMasterIntegration && typeof window.WorldMasterIntegration.getFilteredPowerups === 'function') {
            const filtered = window.WorldMasterIntegration.getFilteredPowerups(POWERUPS) || [];
            if (Array.isArray(filtered) && filtered.length >= desiredCount) {
                powerupPool = filtered;
            } else if (Array.isArray(filtered) && filtered.length > 0 && filtered.length < desiredCount) {
                console.warn('[WORLDMASTER] Only', filtered.length, 'powerup cards enabled; using filtered list with fallback to fill chooser.');
                powerupPool = filtered;
            }
        }
    } catch (e) {
        console.warn('[WORLDMASTER] Failed to filter powerup deck for chooser:', e);
    }
    if (!Array.isArray(powerupPool) || !powerupPool.length) {
        powerupPool = POWERUPS;
    }
    let choices = [];
    try {
        const maxCount = Math.min(desiredCount, Array.isArray(powerupPool) ? powerupPool.length : desiredCount);
        choices = randomChoice(powerupPool, maxCount);
    } catch (err) {
        choices = Array.isArray(powerupPool) ? powerupPool.slice(0, desiredCount) : [];
    }
    if (!Array.isArray(choices)) choices = [];
    if (choices.length < desiredCount && Array.isArray(POWERUPS)) {
        const fallbackCards = POWERUPS.filter(card => !choices.includes(card));
        for (const card of fallbackCards) {
            choices.push(card);
            if (choices.length >= desiredCount) break;
        }
    }
    if (choices.length > 0 && choices.length < desiredCount) {
        const filler = choices.slice();
        let idx = 0;
        while (choices.length < desiredCount && filler.length) {
            choices.push(filler[idx % filler.length]);
            idx++;
        }
    }
    return choices.slice(0, desiredCount);
}

function showPowerupCards(loser, options = {}) {
    cardState.active = true;
    cardState.player = loser;
    // Allow the setup UI to completely disable powerups for this match
    try {
        if (typeof window.setupAllowPowerups !== 'undefined' && window.setupAllowPowerups === false) {
            logDev('[CARD FLOW] Powerups are disabled via setup; skipping powerup offer.');
            return; // do not show powerup chooser
        }
    } catch (e) {}
    const chooserRole = (options && options.chooserRole) ? options.chooserRole : (() => {
        try { return inferRoleForEntity ? inferRoleForEntity(loser) : null; } catch (err) { return null; }
    })();
    const fighterIdFromOptions = (options && options.fighterId != null) ? String(options.fighterId) : null;
    const slotIndexFromOptions = (options && typeof options.slotIndex === 'number') ? options.slotIndex : null;
    const joinerIndexFromOptions = coerceJoinerIndex(options ? options.joinerIndex : null);
    let fighterRecord = null;
    if (fighterIdFromOptions && playerRoster && typeof playerRoster.getFighterById === 'function') {
        try { fighterRecord = playerRoster.getFighterById(fighterIdFromOptions, { includeEntity: true }) || null; } catch (err) { fighterRecord = null; }
    }
    if (!fighterRecord) {
        try { fighterRecord = getFighterRecordForEntity(loser); } catch (err) { fighterRecord = null; }
    }
    const fighterMetadata = (fighterRecord && fighterRecord.metadata) ? fighterRecord.metadata : {};
    const fighterKind = fighterRecord ? fighterRecord.kind : null;
    const controlTag = (fighterMetadata && typeof fighterMetadata.control === 'string') ? fighterMetadata.control : null;
    const joinerIndexMeta = fighterMetadata ? coerceJoinerIndex(fighterMetadata.joinerIndex) : null;
    const resolvedSlotIndex = (slotIndexFromOptions !== null && slotIndexFromOptions !== undefined)
        ? slotIndexFromOptions
        : (fighterRecord && typeof fighterRecord.slotIndex === 'number' ? fighterRecord.slotIndex : null);
    const isRemoteControlled = (() => {
        if (controlTag === 'remote') return true;
        if (typeof NET !== 'undefined' && NET && NET.connected) {
            if (NET.role === 'host') {
                if (chooserRole === 'joiner') return true;
                if (joinerIndexMeta !== null) return true;
            } else if (NET.role === 'joiner') {
                if (chooserRole === 'host' && controlTag === 'remote-host') return true;
            }
        }
        return false;
    })();
    const isBotControlled = (() => {
        if (fighterKind === 'bot') return true;
        if (controlTag === 'bot' || controlTag === 'ai') return true;
        if (!fighterRecord) {
            if (typeof NET === 'undefined' || !NET || !NET.connected) return true;
            if (NET.role === 'host' && chooserRole !== 'joiner') return true;
        }
        return false;
    })();
    const shouldAutoPickForAI = !loser.isPlayer && isBotControlled && !isRemoteControlled;
    const shouldShowReadOnly = !loser.isPlayer && !shouldAutoPickForAI;
    const div = document.getElementById('card-choices');
    if (!div) return;
    div.innerHTML = "";
    let choices = [];
    if (options && Array.isArray(options.choices) && options.choices.length) {
        choices = options.choices.slice();
    } else {
        choices = buildPowerupChoices(loser, 5);
    }
    if (!Array.isArray(choices) || !choices.length) {
        logDev('[CARD FLOW] No powerup choices available; skipping chooser.');
        return;
    }
    const choiceNames = choices.map(opt => {
        if (!opt) return null;
        if (typeof opt === 'string') return opt;
        if (opt && typeof opt.name === 'string') return opt.name;
        if (opt && typeof opt.id === 'string') return opt.id;
        return null;
    }).filter(Boolean);
    try {
        window._lastOfferedChoices = {
            choices: choiceNames,
            chooserRole: chooserRole || null,
            fighterId: fighterIdFromOptions || (fighterRecord && fighterRecord.id != null ? String(fighterRecord.id) : null),
            slotIndex: resolvedSlotIndex,
            joinerIndex: joinerIndexFromOptions != null ? joinerIndexFromOptions : joinerIndexMeta
        };
    } catch (err) {}

    if (loser.isPlayer) {
        div.innerHTML = '';
        const handRadius = 220;
        const cardCount = choices.length;
        const baseAngle = Math.PI / 2;
        const spread = Math.PI / 1.1;
        const cardWidth = 170;
        const cardHeight = 220;
        for(let i = 0; i < cardCount; ++i) {
            let opt = choices[i];
            let card = document.createElement('div');
            card.className = "card card-uniform";
            card.innerHTML = `<b>${opt.name}</b><br><small>${opt.desc}</small>`;
            // Flip the fan direction so cards lay like a hand: invert angle step and rotation, and flip vertical offset
            let theta = baseAngle - (i - (cardCount-1)/2) * (spread/(cardCount-1));
            let x = Math.cos(theta) * handRadius;
            let y = Math.sin(theta) * handRadius;
            let rot = (Math.PI/2 - theta) * 28;
            card.style.position = 'absolute';
            card.style.left = `calc(50% + ${x}px)`;
            // use +y so the cards arc the other way (more like a held hand)
            // lower the whole fan so it sits further down the screen
            card.style.bottom = `calc(-10% + ${y}px)`;
            card.style.width = cardWidth + 'px';
            card.style.height = cardHeight + 'px';
            card.style.transform = `translate(-50%, 0) rotate(${rot}deg)`;
            card.onmouseenter = () => {
                Array.from(div.children).forEach(c => c.classList.remove('selected', 'centered'));
                card.classList.add('selected', 'centered');
                card.style.zIndex = 10;
                card.style.transform = 'translate(-50%, -60px) scale(1.18) rotate(0deg)';
                // highlight with loser's color: border, glow, and text
                try {
                    card.style.setProperty('border', '3px solid ' + loser.color, 'important');
                    card.style.setProperty('box-shadow', '0 6px 18px ' + loser.color, 'important');
                    // override CSS .card.centered !important color
                    card.style.setProperty('color', loser.color, 'important');
                    const sm = card.querySelector('small'); if (sm) sm.style.setProperty('color', loser.color, 'important');
                    // inject per-card ::after override for the glow
                    if (!card._accentClass) card._accentClass = 'card-accent-' + Math.floor(Math.random()*1000000);
                    if (!card._accentStyle) {
                        const styleEl = document.createElement('style');
                        styleEl.innerText = `.${card._accentClass}::after{ background: radial-gradient(ellipse at center, ${loser.color}33 0%, #0000 100%) !important; } .${card._accentClass}.centered::after{ background: radial-gradient(ellipse at center, ${loser.color}55 0%, #0000 100%) !important; }`;
                        document.head.appendChild(styleEl);
                        card._accentStyle = styleEl;
                    }
                    card.classList.add(card._accentClass);
                } catch (ex) {}
            };
            card.onmouseleave = () => {
                card.classList.remove('selected', 'centered');
                card.style.zIndex = 1;
                card.style.transform = `translate(-50%, 0) rotate(${rot}deg)`;
                // reset highlight
                try {
                    card.style.removeProperty('border');
                    card.style.removeProperty('box-shadow');
                    card.style.removeProperty('color');
                    const sm = card.querySelector('small'); if (sm) sm.style.removeProperty('color');
                    if (card._accentClass) card.classList.remove(card._accentClass);
                    if (card._accentStyle) { card._accentStyle.remove(); card._accentStyle = null; }
                } catch (ex) {}
            };
            card.onclick = () => {
                Array.from(div.children).forEach(c => c.classList.remove('selected', 'centered'));
                card.classList.add('selected', 'centered');
                try {
                    card.style.setProperty('border', '3px solid ' + loser.color, 'important');
                    card.style.setProperty('box-shadow', '0 6px 18px ' + loser.color, 'important');
                    card.style.setProperty('color', loser.color, 'important');
                    const sm = card.querySelector('small'); if (sm) sm.style.setProperty('color', loser.color, 'important');
                } catch (ex) {}
                setTimeout(() => {
                    opt.effect(loser);
                    loser.addCard(opt.name);
                    // cleanup accent style if present
                    try { if (card._accentStyle) { card._accentStyle.remove(); card._accentStyle = null; } } catch (ex) {}
                    div.style.display = "none";
                    div.innerHTML = '';
                    div.removeAttribute('style');
                    div.classList.remove('card-bg-visible');
                    cardState.active = false;
                    notifyPowerupSelectionComplete(loser, opt.name);
                }, 220);
            };
            div.appendChild(card);
        }
        div.style.display = "flex";
        div.style.position = 'absolute';
        div.style.left = '50%';
        div.style.top = '50%';
        div.style.transform = 'translate(-50%, -50%)';
        div.style.height = '320px';
        div.style.width = '900px';
    } else {
        div.innerHTML = '';
        const handRadius = 220;
        const cardCount = choices.length;
        const baseAngle = Math.PI / 2;
        const spread = Math.PI / 1.1;
        const cardWidth = 170;
        const cardHeight = 220;
        for(let i = 0; i < cardCount; ++i) {
            let opt = choices[i];
            let card = document.createElement('div');
            card.className = "card card-uniform";
            card.innerHTML = `<b>${opt.name}</b><br><small>${opt.desc}</small>`;
            // Flip the fan direction so cards lay like a hand: invert angle step and rotation, and flip vertical offset
            let theta = baseAngle - (i - (cardCount-1)/2) * (spread/(cardCount-1));
            let x = Math.cos(theta) * handRadius;
            let y = Math.sin(theta) * handRadius;
            let rot = (Math.PI/2 - theta) * 28;
            card.style.position = 'absolute';
            card.style.left = `calc(50% + ${x}px)`;
            // use +y so the cards arc the other way (more like a held hand)
            // match player's custom offset (-10%) so enemy cards appear in the same place
            card.style.bottom = `calc(-10% + ${y}px)`;
            card.style.width = cardWidth + 'px';
            card.style.height = cardHeight + 'px';
            card.style.transform = `translate(-50%, 0) rotate(${rot}deg)`;
            // add hover highlight so it matches player behavior if visible briefly
            card.onmouseenter = () => {
                try {
                    card.style.setProperty('border', '3px solid ' + loserColor, 'important');
                    card.style.setProperty('box-shadow', '0 6px 18px ' + loserColor, 'important');
                    card.style.setProperty('color', loserColor, 'important');
                    const sm = card.querySelector('small'); if (sm) sm.style.setProperty('color', loserColor, 'important');
                    if (!card._accentClass) card._accentClass = 'card-accent-' + Math.floor(Math.random()*1000000);
                    if (!card._accentStyle) {
                        const styleEl = document.createElement('style');
                        styleEl.innerText = `.${card._accentClass}::after{ background: radial-gradient(ellipse at center, ${loserColor}33 0%, #0000 100%) !important; } .${card._accentClass}.centered::after{ background: radial-gradient(ellipse at center, ${loserColor}55 0%, #0000 100%) !important; }`;
                        document.head.appendChild(styleEl);
                        card._accentStyle = styleEl;
                    }
                    card.classList.add(card._accentClass);
                } catch (ex) {}
            };
            card.onmouseleave = () => {
                try {
                    card.style.removeProperty('border');
                    card.style.removeProperty('box-shadow');
                    card.style.removeProperty('color');
                    const sm = card.querySelector('small'); if (sm) sm.style.removeProperty('color');
                    if (card._accentClass) card.classList.remove(card._accentClass);
                    if (card._accentStyle) { card._accentStyle.remove(); card._accentStyle = null; }
                } catch (ex) {}
            };
            div.appendChild(card);
        }
        div.style.display = "flex";
        div.style.position = 'absolute';
        div.style.left = '50%';
        div.style.top = '50%';
        div.style.transform = 'translate(-50%, -50%)';
        div.style.height = '320px';
        div.style.width = '900px';
        div.classList.add('card-bg-visible');
        if (shouldShowReadOnly) {
            return;
        }
        setTimeout(() => {
            let idx = randInt(0, choices.length-1);
            let card = div.childNodes[idx];
            card.classList.add('selected', 'centered');
            card.style.zIndex = 10;
            card.style.transform = 'translate(-50%, -60px) scale(1.18) rotate(0deg)';
            // highlight using loser's color (border, glow, text, and ::after)
            try {
                card.style.setProperty('border', '3px solid ' + loser.color, 'important');
                card.style.setProperty('box-shadow', '0 6px 18px ' + loser.color, 'important');
                card.style.setProperty('color', loser.color, 'important');
                const sm = card.querySelector('small'); if (sm) sm.style.setProperty('color', loser.color, 'important');
                if (!card._accentClass) card._accentClass = 'card-accent-' + Math.floor(Math.random()*1000000);
                if (!card._accentStyle) {
                    const styleEl = document.createElement('style');
                    styleEl.innerText = `.${card._accentClass}::after{ background: radial-gradient(ellipse at center, ${loser.color}33 0%, #0000 100%) !important; } .${card._accentClass}.centered::after{ background: radial-gradient(ellipse at center, ${loser.color}55 0%, #0000 100%) !important; }`;
                    document.head.appendChild(styleEl);
                    card._accentStyle = styleEl;
                }
                card.classList.add(card._accentClass);
            } catch (ex) {}
            setTimeout(() => {
                // Delay the actual apply slightly so player can see the AI's selection
                let pickedCard = choices[idx];
                setTimeout(() => {
                    pickedCard.effect(loser);
                    loser.addCard(pickedCard.name);
                    div.style.display = 'none';
                    div.innerHTML = '';
                    div.removeAttribute('style');
                    div.classList.remove('card-bg-visible');
                    cardState.active = false;
                    notifyPowerupSelectionComplete(loser, pickedCard.name || null);
                }, 1000);
            }, 700);
        }, 1100);
    }
}

// Networked selection helpers (host composes choices and sends; clients display based on chooserRole)
function netShowPowerupCards(choiceNames, chooserRole, opts) {
    if (matchOver) return; // suppress during match-end modal
    // Respect setup checkbox: if powerups are disabled for this match, skip showing
    try {
        if (typeof window.setupAllowPowerups !== 'undefined' && window.setupAllowPowerups === false) {
            logDev('[CARD FLOW] Powerups are disabled via setup; skipping networked powerup offer.');
            return;
        }
    } catch (e) {}
    const options = opts || {};
    const fighterId = options && options.fighterId != null ? String(options.fighterId) : null;
    const slotIndex = (options && typeof options.slotIndex === 'number') ? options.slotIndex : null;
    const joinerIndexFromOptions = (options && Number.isInteger(options.joinerIndex)) ? options.joinerIndex : null;
    // chooserRole: 'host' or 'joiner'
    // Map to the correct local entity so color usage is correct on clients; prefer fighterId when provided
    let loser = null;
    if (fighterId) {
        loser = getEntityForFighterId(fighterId);
    }
    let loserRecord = null;
    if (fighterId && !loserRecord) {
        try {
            if (playerRoster && typeof playerRoster.getFighterById === 'function') {
                loserRecord = playerRoster.getFighterById(fighterId, { includeEntity: true }) || null;
                if (!loser && loserRecord && loserRecord.entity) loser = loserRecord.entity;
            }
        } catch (err) { loserRecord = null; }
    }
    if (!loser && slotIndex !== null) {
        try {
            const inferredRole = resolveChooserRoleForSlot(slotIndex);
            loser = getEntityForRole(inferredRole);
        } catch (err) {}
    }
    if (!loser) {
        if (typeof NET === 'undefined' || !NET.connected) {
            // chooserRole refers to the logical host/joiner; in single-player host==player, joiner==enemy
            loser = (chooserRole === 'host') ? player : enemy;
        } else {
            loser = getEntityForRole(chooserRole); // chooser is the loser of the round
        }
    }
    if (!loserRecord && fighterId) {
        try {
            if (playerRoster && typeof playerRoster.getFighterById === 'function') {
                loserRecord = playerRoster.getFighterById(fighterId, { includeEntity: true }) || null;
            }
        } catch (err) {}
    }
    if (!loser) {
        try { waitingForCard = false; cardState.active = false; } catch (e) {}
        try { logDev('[CARD FLOW] Could not resolve entity for fighterId=' + fighterId + ' chooserRole=' + chooserRole + '; skipping powerup UI.'); } catch (e) {}
        return;
    }
    const slotIndexForMessage = (typeof slotIndex === 'number') ? slotIndex : (loserRecord && typeof loserRecord.slotIndex === 'number' ? loserRecord.slotIndex : null);
    const joinerIndexForMessage = (() => {
        if (joinerIndexFromOptions !== null) return joinerIndexFromOptions;
        if (loserRecord && loserRecord.metadata) {
            const metaIdx = coerceJoinerIndex(loserRecord.metadata.joinerIndex);
            if (metaIdx !== null) return metaIdx;
        }
        if (typeof resolveJoinerIndexForSlot === 'function' && typeof slotIndexForMessage === 'number') {
            const idx = coerceJoinerIndex(resolveJoinerIndexForSlot(slotIndexForMessage));
            if (idx !== null) return idx;
        }
        if (typeof resolveJoinerIndexForEntity === 'function' && loser) {
            const idx = coerceJoinerIndex(resolveJoinerIndexForEntity(loser));
            if (idx !== null) return idx;
        }
        return null;
    })();
    const joinerIndexPayload = coerceJoinerIndex(joinerIndexForMessage);
    const fighterIdForMessage = (() => {
        if (fighterId) return fighterId;
        if (loserRecord && loserRecord.id != null) return String(loserRecord.id);
        const fallbackRecord = getFighterRecordForEntity(loser);
        if (fallbackRecord && fallbackRecord.id != null) return String(fallbackRecord.id);
        return null;
    })();
    const loserColor = (() => {
        if (loser && loser.color) return loser.color;
        if (loserRecord && loserRecord.color) return loserRecord.color;
        try {
            if (typeof getRosterFighterColor === 'function' && loserRecord && typeof loserRecord.slotIndex === 'number') {
                const clr = getRosterFighterColor(loserRecord.slotIndex, loserRecord);
                if (clr) return clr;
            }
        } catch (err) {}
        return '#65c6ff';
    })();
    // Build fake POWERUPS array subset from provided names
    const choices = choiceNames.map(n => getCardByName(n)).filter(Boolean);
    if (!choices.length) {
        try { waitingForCard = false; cardState.active = false; } catch (e) {}
        return;
    }
    // prepare card container
    const div = document.getElementById('card-choices');
    if (!div) return;
    // If we're not connected, behave like the single-player flow: show local UI and let AI auto-pick
    if (!NET.connected) {
        cardState.active = true;
        div.innerHTML = '';
        // If the chooser is the human player, present clickable UI similar to showPowerupCards
        if (loser.isPlayer) {
            const handRadius = 220;
            const cardCount = choices.length;
            const baseAngle = Math.PI / 2;
            const spread = Math.PI / 1.1;
            const cardWidth = 170;
            const cardHeight = 220;
            for (let i = 0; i < cardCount; ++i) {
                const opt = choices[i];
                const card = document.createElement('div');
                card.className = 'card card-uniform';
                card.innerHTML = `<b>${opt.name}</b><br><small>${opt.desc}</small>`;
                const theta = baseAngle - (i - (cardCount-1)/2) * (spread/(cardCount-1));
                const x = Math.cos(theta) * handRadius;
                const y = Math.sin(theta) * handRadius;
                const rot = (Math.PI/2 - theta) * 28;
                card.style.position = 'absolute';
                card.style.left = `calc(50% + ${x}px)`;
                card.style.bottom = `calc(-10% + ${y}px)`;
                card.style.width = cardWidth + 'px';
                card.style.height = cardHeight + 'px';
                card.style.transform = `translate(-50%, 0) rotate(${rot}deg)`;
                // hover highlight/pop behavior using chooser color
                card.onmouseenter = () => {
                    Array.from(div.children).forEach(c => c.classList.remove('selected', 'centered'));
                    card.classList.add('selected', 'centered');
                    card.style.zIndex = 10;
                    card.style.transform = 'translate(-50%, -60px) scale(1.18) rotate(0deg)';
                    try {
                        card.style.setProperty('border', '3px solid ' + loserColor, 'important');
                        card.style.setProperty('box-shadow', '0 6px 18px ' + loserColor, 'important');
                        card.style.setProperty('color', loserColor, 'important');
                        const sm = card.querySelector('small'); if (sm) sm.style.setProperty('color', loserColor, 'important');
                        if (!card._accentClass) card._accentClass = 'card-accent-' + Math.floor(Math.random()*1000000);
                        if (!card._accentStyle) {
                            const styleEl = document.createElement('style');
                            styleEl.innerText = `.${card._accentClass}::after{ background: radial-gradient(ellipse at center, ${loserColor}33 0%, #0000 100%) !important; } .${card._accentClass}.centered::after{ background: radial-gradient(ellipse at center, ${loserColor}55 0%, #0000 100%) !important; }`;
                            document.head.appendChild(styleEl);
                            card._accentStyle = styleEl;
                        }
                        card.classList.add(card._accentClass);
                    } catch (ex) {}
                };
                card.onmouseleave = () => {
                    card.classList.remove('selected', 'centered');
                    card.style.zIndex = 1;
                    card.style.transform = `translate(-50%, 0) rotate(${rot}deg)`;
                    try {
                        card.style.removeProperty('border');
                        card.style.removeProperty('box-shadow');
                        card.style.removeProperty('color');
                        const sm = card.querySelector('small'); if (sm) sm.style.removeProperty('color');
                        if (card._accentClass) card.classList.remove(card._accentClass);
                        if (card._accentStyle) { card._accentStyle.remove(); card._accentStyle = null; }
                    } catch (ex) {}
                };
                card.onclick = () => {
                    Array.from(div.children).forEach(c => c.classList.remove('selected', 'centered'));
                    card.classList.add('selected', 'centered');
                    try { opt.effect(loser); loser.addCard(opt.name); } catch (e) {}
                    div.style.display = 'none'; div.innerHTML = ''; div.removeAttribute('style'); div.classList.remove('card-bg-visible');
                    cardState.active = false;
                    // If a world modifier is pending, keep waitingForCard true until it is shown/applied;
                    // otherwise clear waitingForCard so the game resumes.
                    const hadPending = !!window._pendingWorldModOffer;
                    if (!hadPending) waitingForCard = false;
                    if (hadPending) {
                        const offer = window._pendingWorldModOffer;
                        window._pendingWorldModOffer = null;
                        try { roundFlowState.pendingWorldModOffer = null; } catch (e) {}
                        setTimeout(() => {
                            try {
                                if (!(window.WorldMasterIntegration && typeof window.WorldMasterIntegration.triggerWorldModifierChoice === 'function' && window.WorldMasterIntegration.triggerWorldModifierChoice(offer.choices, offer.chooserRole))) {
                                    netShowWorldModifierCards(offer.choices, offer.chooserRole, offer.finalIdx, offer);
                                }
                            } catch (e) { netShowWorldModifierCards(offer.choices, offer.chooserRole, offer.finalIdx, offer); }
                        }, 700);
                        try {
                            if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'mod-offer', choices: offer.choices, chooserRole: offer.chooserRole, finalIdx: offer.finalIdx, manual: !!offer.manual } }));
                        } catch (e) {}
                    }
                };
                div.appendChild(card);
            }
            Object.assign(div.style, { display:'flex', position:'absolute', left:'50%', top:'50%', transform:'translate(-50%, -50%)', height:'320px', width:'900px' });
            div.classList.add('card-bg-visible');
            return;
        }
    // If chooser is AI, show the choices and visually highlight the AI's pick (match original animation)
    // Build non-interactive cards, then randomly highlight one and apply it
        const handRadius = 220, cardWidth = 170, cardHeight = 220;
        const baseAngle = Math.PI / 2, spread = Math.PI / 1.1;
        for (let i = 0; i < choices.length; ++i) {
            const opt = choices[i];
            const card = document.createElement('div');
            card.className = 'card card-uniform';
            card.innerHTML = `<b>${opt.name}</b><br><small>${opt.desc}</small>`;
            const theta = baseAngle - (i - (choices.length-1)/2) * (spread/(choices.length-1));
            const x = Math.cos(theta) * handRadius;
            const y = Math.sin(theta) * handRadius;
            const rot = (Math.PI/2 - theta) * 28;
            Object.assign(card.style, { position:'absolute', left:`calc(50% + ${x}px)`, bottom:`calc(-10% + ${y}px)`, width:cardWidth+'px', height:cardHeight+'px', transform:`translate(-50%, 0) rotate(${rot}deg)` });
            div.appendChild(card);
        }
        Object.assign(div.style, { display:'flex', position:'absolute', left:'50%', top:'50%', transform:'translate(-50%, -50%)', height:'320px', width:'900px' });
        div.classList.add('card-bg-visible');
        // Randomly pick and animate highlight using loser's color
        setTimeout(() => {
            let idx = randInt(0, choices.length-1);
            let card = div.childNodes[idx];
            if (card) {
                card.classList.add('selected', 'centered');
                card.style.zIndex = 10;
                card.style.transform = 'translate(-50%, -60px) scale(1.18) rotate(0deg)';
                try {
                    card.style.setProperty('border', '3px solid ' + loserColor, 'important');
                    card.style.setProperty('box-shadow', '0 6px 18px ' + loserColor, 'important');
                    card.style.setProperty('color', loserColor, 'important');
                    const sm = card.querySelector('small'); if (sm) sm.style.setProperty('color', loserColor, 'important');
                    if (!card._accentClass) card._accentClass = 'card-accent-' + Math.floor(Math.random()*1000000);
                    if (!card._accentStyle) {
                        const styleEl = document.createElement('style');
                        styleEl.innerText = `.${card._accentClass}::after{ background: radial-gradient(ellipse at center, ${loserColor}33 0%, #0000 100%) !important; } .${card._accentClass}.centered::after{ background: radial-gradient(ellipse at center, ${loserColor}55 0%, #0000 100%) !important; }`;
                        document.head.appendChild(styleEl);
                        card._accentStyle = styleEl;
                    }
                    card.classList.add(card._accentClass);
                } catch (ex) {}
            }
            setTimeout(() => {
                // Wait a little longer after highlight so player can perceive AI choice
                const pickedCard = choices[idx];
                setTimeout(() => {
                    try { pickedCard.effect(loser); loser.addCard(pickedCard.name); } catch (e) {}
                    div.style.display = 'none';
                    div.innerHTML = '';
                    div.removeAttribute('style');
                    div.classList.remove('card-bg-visible');
                    // cleanup accent style if present
                    try { if (card && card._accentStyle) { card._accentStyle.remove(); card._accentStyle = null; } } catch (e) {}
                    cardState.active = false;
                    // keep game paused if a pending world modifier exists; otherwise resume
                    const hadPending2 = !!window._pendingWorldModOffer;
                    if (!hadPending2) waitingForCard = false;
                    if (hadPending2) {
                        const offer = window._pendingWorldModOffer;
                        window._pendingWorldModOffer = null;
                        try { roundFlowState.pendingWorldModOffer = null; } catch (e) {}
                        setTimeout(() => {
                            try {
                                if (!(window.WorldMasterIntegration && typeof window.WorldMasterIntegration.triggerWorldModifierChoice === 'function' && window.WorldMasterIntegration.triggerWorldModifierChoice(offer.choices, offer.chooserRole))) {
                                    netShowWorldModifierCards(offer.choices, offer.chooserRole, offer.finalIdx, offer);
                                }
                            } catch (e) { netShowWorldModifierCards(offer.choices, offer.chooserRole, offer.finalIdx, offer); }
                        }, 700);
                        try {
                            if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'mod-offer', choices: offer.choices, chooserRole: offer.chooserRole, finalIdx: offer.finalIdx, manual: !!offer.manual } }));
                        } catch (e) {}
                    }
                }, 1000);
            }, 700);
        }, 1100);
        return;
    }

    // Networked clients: decide if this chooser is local
    let isMe = false;
    if (typeof NET === 'undefined' || !NET || !NET.connected) {
        isMe = chooserRole === 'host';
    } else if (NET.role === 'host') {
        isMe = chooserRole === 'host';
    } else if (NET.role === 'joiner') {
        if (chooserRole === 'joiner') {
            const joinerIdx = Number.isInteger(NET.joinerIndex) ? NET.joinerIndex : null;
            if (joinerIndexFromOptions !== null) {
                isMe = joinerIdx !== null && joinerIdx === joinerIndexFromOptions;
            } else {
                isMe = false;
            }
        } else {
            isMe = false;
        }
    }
    const resolvedSlotIndex = (typeof slotIndex === 'number') ? slotIndex : (loserRecord && typeof loserRecord.slotIndex === 'number' ? loserRecord.slotIndex : null);
    const localFighterIdStr = (() => {
        try { return (typeof localFighterId !== 'undefined' && localFighterId !== null) ? String(localFighterId) : null; } catch (err) { return null; }
    })();
    const localSlotIndex = (() => {
        try {
            if (typeof window !== 'undefined' && window.localPlayerIndex === -1) return null;
            if (typeof NET === 'undefined' || !NET || !NET.connected) return 0;
            if (NET.role === 'host') return 0;
            if (NET.role === 'joiner') {
                const joinerIdx = Number.isInteger(NET.joinerIndex) ? NET.joinerIndex : 0;
                if (typeof getJoinerSlotIndex === 'function') return getJoinerSlotIndex(joinerIdx);
                return joinerIdx + 1;
            }
        } catch (err) {}
        return null;
    })();
    const localJoinerIndex = (() => {
        try {
            if (typeof NET === 'undefined' || !NET || !NET.connected) return null;
            if (NET.role === 'joiner' && Number.isInteger(NET.joinerIndex)) return NET.joinerIndex;
        } catch (err) {}
        return null;
    })();
    const localEntityRef = (() => {
        try {
            if (typeof NET === 'undefined' || !NET) return player;
            if (!NET.connected) return player;
            return getEntityForRole(NET.role);
        } catch (err) {
            return player;
        }
    })();
    const localExternalId = (() => {
        try {
            if (typeof NET === 'undefined' || !NET || !NET.connected || NET.role !== 'joiner') return null;
            const joinerIdx = Number.isInteger(NET.joinerIndex) ? NET.joinerIndex : 0;
            return typeof getJoinerExternalId === 'function' ? getJoinerExternalId(joinerIdx) : null;
        } catch (err) {
            return null;
        }
    })();
    const entityMatchesLocal = !!(loser && localEntityRef && loser === localEntityRef);
    const slotMatchesLocal = !!(localSlotIndex !== null && resolvedSlotIndex !== null && localSlotIndex === resolvedSlotIndex);
    const fighterIdMatchesLocal = !!(localFighterIdStr && fighterId && localFighterIdStr === fighterId);
    const externalIdMatchesLocal = !!(localExternalId && loserRecord && typeof loserRecord.externalId === 'string' && loserRecord.externalId === localExternalId);
    const joinerMatchesLocal = !!(joinerIndexFromOptions !== null && localJoinerIndex !== null && joinerIndexFromOptions === localJoinerIndex);
    const metadataSuggestsLocal = (() => {
        if (!loserRecord || !loserRecord.metadata) return false;
        const meta = loserRecord.metadata;
        const control = typeof meta.control === 'string' ? meta.control : null;
        const metaJoinerIndex = coerceJoinerIndex(meta.joinerIndex);
        if (typeof NET === 'undefined' || !NET || !NET.connected) {
            return control === 'local';
        }
        if (NET.role === 'host') {
            if (chooserRole === 'host' && control === 'local') return true;
            return false;
        }
        if (NET.role === 'joiner') {
            if (chooserRole === 'joiner' && Number.isInteger(NET.joinerIndex)) {
                if (metaJoinerIndex === NET.joinerIndex) return true;
                if (joinerIndexFromOptions !== null && NET.joinerIndex === joinerIndexFromOptions) return true;
            }
            return false;
        }
        return false;
    })();
    let isLocalChooser = isMe || entityMatchesLocal || slotMatchesLocal || fighterIdMatchesLocal || externalIdMatchesLocal || joinerMatchesLocal || metadataSuggestsLocal;
    if (!isLocalChooser && typeof NET !== 'undefined' && NET && NET.role === 'joiner' && chooserRole === 'host') {
        // Fallback: if roster record maps to our slot even though chooserRole disagrees, treat as local
        if (localSlotIndex !== null && resolvedSlotIndex === localSlotIndex) {
            isLocalChooser = true;
        }
    }
    if (typeof NET !== 'undefined' && NET && NET.connected) {
        if (NET.role === 'joiner' && chooserRole === 'host') {
            isLocalChooser = false;
        } else if (NET.role === 'host' && chooserRole === 'joiner') {
            isLocalChooser = false;
        }
    }
    try {
        if (isLocalChooser && loserRecord && loserRecord.id != null && (typeof localFighterId === 'undefined' || localFighterId === null || fighterIdMatchesLocal === false)) {
            localFighterId = loserRecord.id;
        }
    } catch (err) {}

    const shouldAutoResolveAsSpectator = (() => {
        if (isLocalChooser) return false;
        const loserIsBot = !!(loserRecord && (loserRecord.kind === 'bot' || (loserRecord.metadata && loserRecord.metadata.control === 'bot')));
        if (!loserIsBot) return false;
        if (typeof window === 'undefined') return false;
        if (window.localPlayerIndex !== -1) return false;
        if (typeof worldMasterPlayerIndex === 'undefined' || worldMasterPlayerIndex === null) return false;
        let allowAISelfPick = true;
        try {
            if (window.gameWorldMasterInstance && window.gameWorldMasterInstance.aiSelfPickPowerups === false) allowAISelfPick = false;
        } catch (e) {}
        if (allowAISelfPick) {
            try {
                const aiToggle = document.getElementById('wm-ai-powerups');
                if (aiToggle && aiToggle.type === 'checkbox' && aiToggle.checked === false) allowAISelfPick = false;
            } catch (e) {}
        }
        if (!allowAISelfPick) return false;
        if (chooserRole === 'host' && worldMasterPlayerIndex === 0) return true;
        if (chooserRole === 'joiner' && worldMasterPlayerIndex === 1) return true;
        return false;
    })();
    if (!isLocalChooser) {
        // Show read-only choices (no click), highlight selection will be applied when host broadcasts pick
        cardState.active = true;
        div.innerHTML = '';
        const handRadius = 220, cardWidth = 170, cardHeight = 220;
        const baseAngle = Math.PI / 2, spread = Math.PI / 1.1;
        for (let i = 0; i < choices.length; ++i) {
            const opt = choices[i];
            const card = document.createElement('div');
            card.className = 'card card-uniform';
            card.innerHTML = `<b>${opt.name}</b><br><small>${opt.desc}</small>`;
            const theta = baseAngle - (i - (choices.length-1)/2) * (spread/(choices.length-1));
            const x = Math.cos(theta) * handRadius;
            const y = Math.sin(theta) * handRadius;
            const rot = (Math.PI/2 - theta) * 28;
            Object.assign(card.style, { position:'absolute', left:`calc(50% + ${x}px)`, bottom:`calc(-10% + ${y}px)`, width:cardWidth+'px', height:cardHeight+'px', transform:`translate(-50%, 0) rotate(${rot}deg)` });
            card.style.pointerEvents = 'none';
            div.appendChild(card);
        }
        Object.assign(div.style, { display:'flex', position:'absolute', left:'50%', top:'50%', transform:'translate(-50%, -50%)', height:'320px', width:'900px' });
        div.classList.add('card-bg-visible');
        div.style.pointerEvents = 'none';
        return;
    }
    // Let the chooser pick and report back to host
    cardState.active = true;
    div.innerHTML = '';
    div.style.pointerEvents = 'auto';
    const handRadius = 220, cardWidth = 170, cardHeight = 220; const baseAngle = Math.PI/2, spread = Math.PI/1.1;
    for (let i = 0; i < choices.length; ++i) {
        const opt = choices[i];
        const card = document.createElement('div');
        card.className = 'card card-uniform';
        card.innerHTML = `<b>${opt.name}</b><br><small>${opt.desc}</small>`;
        const theta = baseAngle - (i - (choices.length-1)/2) * (spread/(choices.length-1));
        const x = Math.cos(theta) * handRadius;
        const y = Math.sin(theta) * handRadius;
        const rot = (Math.PI/2 - theta) * 28;
    Object.assign(card.style, { position:'absolute', left:`calc(50% + ${x}px)`, bottom:`calc(-10% + ${y}px)`, width:cardWidth+'px', height:cardHeight+'px', transform:`translate(-50%, 0) rotate(${rot}deg)` });
        // Hover highlight: notify other peer so they can mirror highlight
        card.onmouseenter = () => {
            try {
                Array.from(div.children).forEach(c => c.classList.remove('selected', 'centered'));
                card.classList.add('selected', 'centered');
                card.style.zIndex = 10;
                card.style.transform = 'translate(-50%, -60px) scale(1.18) rotate(0deg)';
                try {
                    card.style.setProperty('border', '3px solid ' + loserColor, 'important');
                    card.style.setProperty('box-shadow', '0 6px 18px ' + loserColor, 'important');
                    card.style.setProperty('color', loserColor, 'important');
                    const sm = card.querySelector('small'); if (sm) sm.style.setProperty('color', loserColor, 'important');
                    if (!card._accentClass) card._accentClass = 'card-accent-' + Math.floor(Math.random()*1000000);
                    if (!card._accentStyle) {
                        const styleEl = document.createElement('style');
                        styleEl.innerText = `.${card._accentClass}::after{ background: radial-gradient(ellipse at center, ${loserColor}33 0%, #0000 100%) !important; } .${card._accentClass}.centered::after{ background: radial-gradient(ellipse at center, ${loserColor}55 0%, #0000 100%) !important; }`;
                        document.head.appendChild(styleEl);
                        card._accentStyle = styleEl;
                    }
                    card.classList.add(card._accentClass);
                } catch (ex) {}
                // send hover signal to remote peer
                try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'card-hover', chooserRole: chooserRole, idx: i } })); } catch (e) {}
            } catch (e) {}
        };
        card.onmouseleave = () => {
            try {
                card.classList.remove('selected', 'centered');
                card.style.zIndex = 1;
                card.style.transform = `translate(-50%, 0) rotate(${rot}deg)`;
                try {
                    card.style.removeProperty('border');
                    card.style.removeProperty('box-shadow');
                    card.style.removeProperty('color');
                    const sm = card.querySelector('small'); if (sm) sm.style.removeProperty('color');
                    if (card._accentClass) card.classList.remove(card._accentClass);
                    if (card._accentStyle) { card._accentStyle.remove(); card._accentStyle = null; }
                } catch (ex) {}
                try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'card-hover', chooserRole: chooserRole, idx: -1 } })); } catch (e) {}
            } catch (e) {}
        };

        card.onclick = () => {
            // If we're host (or not connected) apply immediately; otherwise forward pick to host
            // Special-case: if local player is World Master (localPlayerIndex === -1) and there's a WM instance
            // and autopick is disabled, allow that WM to decide the card for the AI.
            const isLocalWMChooser = (window.localPlayerIndex === -1 && window.gameWorldMasterInstance && window.gameWorldMasterInstance.autoPick === false && (typeof NET !== 'undefined' && NET.connected));
            if (isLocalWMChooser) {
                const closeLocalChooser = () => {
                    try { div.style.display = 'none'; div.innerHTML = ''; div.classList.remove('card-bg-visible'); } catch (e) {}
                    try {
                        if (card && card._accentStyle) {
                            card._accentStyle.remove();
                            card._accentStyle = null;
                        }
                    } catch (e) {}
                };
                if (!NET.connected || NET.role === 'host') {
                    try { opt.effect(loser); loser.addCard(opt.name); } catch (e) {}
                    try {
                        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                            window.ws.send(JSON.stringify({ type:'relay', data:{ type:'card-apply', pickerRole: chooserRole, card: opt.name, fighterId: fighterIdForMessage, slotIndex: slotIndexForMessage, joinerIndex: joinerIndexPayload } }));
                        }
                    } catch (e) {}
                    closeLocalChooser();
                    try { cardState.active = false; } catch (e) {}
                    let hadPendingFromWM = false;
                    try { hadPendingFromWM = !!window._pendingWorldModOffer; } catch (e) {}
                    if (!hadPendingFromWM) {
                        try { waitingForCard = false; } catch (e) {}
                    }
                    if (hadPendingFromWM) {
                        try {
                            const offer = window._pendingWorldModOffer;
                            window._pendingWorldModOffer = null;
                            try { roundFlowState.pendingWorldModOffer = null; } catch (e) {}
                            setTimeout(() => {
                                try {
                                    if (!(window.WorldMasterIntegration && typeof window.WorldMasterIntegration.triggerWorldModifierChoice === 'function' && window.WorldMasterIntegration.triggerWorldModifierChoice(offer.choices, offer.chooserRole))) {
                                        netShowWorldModifierCards(offer.choices, offer.chooserRole, offer.finalIdx, offer);
                                    }
                                } catch (err) { netShowWorldModifierCards(offer.choices, offer.chooserRole, offer.finalIdx, offer); }
                                try {
                                    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                                        window.ws.send(JSON.stringify({ type:'relay', data:{ type:'mod-offer', choices: offer.choices, chooserRole: offer.chooserRole, finalIdx: offer.finalIdx, manual: !!offer.manual } }));
                                    }
                                } catch (err) {}
                            }, 700);
                        } catch (err) {}
                    }
                    return;
                } else {
                    try {
                        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                            window.ws.send(JSON.stringify({ type:'relay', data:{ type:'card-pick', pickerRole: chooserRole, card: opt.name, fighterId: fighterIdForMessage, slotIndex: slotIndexForMessage, joinerIndex: joinerIndexPayload } }));
                        }
                    } catch (e) {}
                    closeLocalChooser();
                    return; // keep waitingForCard true until host applies
                }
            }
            if (!NET.connected || (NET.role === 'host' && chooserRole === 'host')) {
                try { opt.effect(loser); loser.addCard(opt.name); } catch (e) {}
                try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'card-apply', pickerRole: chooserRole, card: opt.name, fighterId: fighterIdForMessage, slotIndex: slotIndexForMessage, joinerIndex: joinerIndexPayload } })); } catch (e) {}
                div.style.display = 'none'; div.innerHTML = ''; div.classList.remove('card-bg-visible');
                cardState.active = false;
                const hadPending3 = !!window._pendingWorldModOffer;
                if (!hadPending3) waitingForCard = false;
                if (hadPending3) {
                    const offer = window._pendingWorldModOffer;
                    window._pendingWorldModOffer = null;
                    try { roundFlowState.pendingWorldModOffer = null; } catch (e) {}
                    setTimeout(() => {
                        try {
                            if (!(window.WorldMasterIntegration && typeof window.WorldMasterIntegration.triggerWorldModifierChoice === 'function' && window.WorldMasterIntegration.triggerWorldModifierChoice(offer.choices, offer.chooserRole))) {
                                netShowWorldModifierCards(offer.choices, offer.chooserRole, offer.finalIdx, offer);
                            }
                        } catch (e) { netShowWorldModifierCards(offer.choices, offer.chooserRole, offer.finalIdx, offer); }
                    }, 700);
                    try {
                        if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'mod-offer', choices: offer.choices, chooserRole: offer.chooserRole, finalIdx: offer.finalIdx, manual: !!offer.manual } }));
                    } catch (e) {}
                }
            } else {
                try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'card-pick', pickerRole: chooserRole, card: opt.name, fighterId: fighterIdForMessage, slotIndex: slotIndexForMessage, joinerIndex: joinerIndexPayload } })); } catch (e) {}
                div.style.display = 'none'; div.innerHTML = ''; div.classList.remove('card-bg-visible');
                // keep waitingForCard true until apply arrives
            }
        };
        div.appendChild(card);
    }
    Object.assign(div.style, { display:'flex', position:'absolute', left:'50%', top:'50%', transform:'translate(-50%, -50%)', height:'320px', width:'900px' });
    div.classList.add('card-bg-visible');
    if (shouldAutoResolveAsSpectator && !isLocalChooser) {
        const applyAutoPick = () => {
            if (!div || !div.childNodes || div.childNodes.length === 0) return;
            let idx = randInt(0, Math.max(0, div.childNodes.length - 1));
            const card = div.childNodes[idx];
            if (!card) return;
            try {
                card.classList.add('selected', 'centered');
                card.style.zIndex = 10;
                card.style.transform = 'translate(-50%, -60px) scale(1.18) rotate(0deg)';
                card.style.setProperty('border', '3px solid ' + loserColor, 'important');
                card.style.setProperty('box-shadow', '0 6px 18px ' + loserColor, 'important');
                card.style.setProperty('color', loserColor, 'important');
                const sm = card.querySelector('small'); if (sm) sm.style.setProperty('color', loserColor, 'important');
                if (!card._accentClass) card._accentClass = 'card-accent-' + Math.floor(Math.random()*1000000);
                if (!card._accentStyle) {
                    const styleEl = document.createElement('style');
                    styleEl.innerText = `.${card._accentClass}::after{ background: radial-gradient(ellipse at center, ${loserColor}33 0%, #0000 100%) !important; } .${card._accentClass}.centered::after{ background: radial-gradient(ellipse at center, ${loserColor}55 0%, #0000 100%) !important; }`;
                    document.head.appendChild(styleEl);
                    card._accentStyle = styleEl;
                }
                card.classList.add(card._accentClass);
            } catch (e) {}
            setTimeout(() => {
                const opt = choices[idx];
                if (!opt) return;
                try { opt.effect(loser); loser.addCard(opt.name); } catch (e) {}
                try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'card-apply', pickerRole: chooserRole, card: opt.name, fighterId: fighterIdForMessage, slotIndex: slotIndexForMessage, joinerIndex: joinerIndexPayload } })); } catch (e) {}
                try {
                    div.style.display = 'none';
                    div.innerHTML = '';
                    div.classList.remove('card-bg-visible');
                } catch (e) {}
                try { if (card._accentStyle) { card._accentStyle.remove(); card._accentStyle = null; } } catch (e) {}
                cardState.active = false;
                const hadPending = !!window._pendingWorldModOffer;
                if (!hadPending) waitingForCard = false;
                if (hadPending) {
                    const offer = window._pendingWorldModOffer;
                    window._pendingWorldModOffer = null;
                    try { roundFlowState.pendingWorldModOffer = null; } catch (e) {}
                    setTimeout(() => {
                        try {
                            if (!(window.WorldMasterIntegration && typeof window.WorldMasterIntegration.triggerWorldModifierChoice === 'function' && window.WorldMasterIntegration.triggerWorldModifierChoice(offer.choices, offer.chooserRole))) {
                                netShowWorldModifierCards(offer.choices, offer.chooserRole, offer.finalIdx, offer);
                            }
                        } catch (e) { netShowWorldModifierCards(offer.choices, offer.chooserRole, offer.finalIdx, offer); }
                    }, 700);
                    try {
                        if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'mod-offer', choices: offer.choices, chooserRole: offer.chooserRole, finalIdx: offer.finalIdx, manual: !!offer.manual } }));
                    } catch (e) {}
                }
            }, 900);
        };
        setTimeout(applyAutoPick, 650);
        return;
    }
}

function netShowWorldModifierCards(choiceNames, chooserRole, finalIdx /* optional */, opts /* optional */) {
    if (matchOver) return; // suppress during match-end modal
    // Allow the setup UI to completely disable world modifiers for this match
    try {
        if (typeof window.setupAllowWorldMods !== 'undefined' && window.setupAllowWorldMods === false) {
            logDev('[CARD FLOW] World modifiers are disabled via setup; skipping world modifier offer.');
            return;
        }
    } catch (e) {}
    let options = opts;
    let resolvedFinalIdx = finalIdx;
    if (typeof resolvedFinalIdx === 'object' && resolvedFinalIdx !== null && options === undefined) {
        options = resolvedFinalIdx;
        if (typeof options.finalIdx === 'number') resolvedFinalIdx = options.finalIdx;
    }
    const manualMode = !!(options && options.manual);
    const choices = choiceNames.map(n => WORLD_MODIFIERS.find(m => m.name === n)).filter(Boolean);
    logDev(`[CARD FLOW] Triggering world modifier offer (neutral AI will pick) with choices: [${choices.map(c=>c.name).join(', ')}]`);
    // Debug: print chooser context and WorldMaster state to assist with autopick troubleshooting
    try {
        logDev('[CARD FLOW DEBUG] chooserRole=' + String(chooserRole) + ' NET=' + (typeof NET === 'undefined' ? 'undefined' : JSON.stringify({ role: NET.role })) + ' localPlayerIndex=' + String(window.localPlayerIndex));
        if (window.gameWorldMasterInstance) logDev('[CARD FLOW DEBUG] WM.autoPick=' + String(window.gameWorldMasterInstance.autoPick) + ' WM.isLocal=' + String(window.gameWorldMasterInstance.isLocal));
    } catch (e) {}

    // Build a non-interactive UI that shows the cycling highlight animation for everyone.
    const div = document.getElementById('card-choices');
    if (!div) return;
    div.innerHTML = '';
    const cardWidth = 180, cardHeight = 240; const margin = 18;
    const cardCount = choices.length;
    const totalWidth = cardCount * cardWidth + (cardCount-1) * margin;
    const startX = (900 - totalWidth) / 2;

    // Highlight colors are defined later where cycling highlight runs

    // Early override: if local WorldMaster exists and has autopick disabled,
    // show an interactive chooser so the WorldMaster can pick manually.
    try {
        // Also allow the UI checkbox to control autopick in case instance state isn't synced yet.
        let wmAutoPickDisabled = false;
        try {
            if (window.gameWorldMasterInstance && window.gameWorldMasterInstance.autoPick === false) wmAutoPickDisabled = true;
        } catch (e) {}
        try {
            const apEl = document.getElementById('wm-autopick');
            if (apEl && apEl.type === 'checkbox' && apEl.checked === false) wmAutoPickDisabled = true;
        } catch (e) {}
        if (window.localPlayerIndex === -1 && wmAutoPickDisabled) {
            logDev('[WORLDMASTER] Local WorldMaster detected and autopick disabled - showing manual chooser');
            // Build clickable cards (interactive) for the WorldMaster
            for (let i = 0; i < cardCount; ++i) {
                const opt = choices[i];
                const card = document.createElement('div');
                card.className = 'card card-uniform world-modifier';
                card.innerHTML = `<b>${opt.name}</b><br><small>${opt.desc}</small>`;
                Object.assign(card.style, {
                    position: 'absolute',
                    left: `${startX + i * (cardWidth + margin)}px`,
                    top: '40px',
                    width: cardWidth + 'px',
                    height: cardHeight + 'px',
                    transform: 'none',
                    zIndex: 1
                });
                // Hover highlighting that matches the autoplay accent (use inline !important and accent style)
                card.addEventListener('mouseenter', () => {
                    try {
                        const accent = '#a06cc7';
                        const textColor = '#b48be6';
                        card.style.transform = 'scale(1.13)';
                        card.style.zIndex = 10;
                        card.style.setProperty('border', '3px solid ' + accent, 'important');
                        card.style.setProperty('box-shadow', '0 6px 18px ' + accent, 'important');
                        card.style.setProperty('color', textColor, 'important');
                        const sm = card.querySelector('small'); if (sm) sm.style.setProperty('color', textColor, 'important');
                        const hb = card.querySelector('b'); if (hb) hb.style.setProperty('color', textColor, 'important');
                        if (!card._accentClass) card._accentClass = 'card-accent-' + Math.floor(Math.random()*1000000);
                        if (!card._accentStyle) {
                            const styleEl = document.createElement('style');
                            styleEl.innerText = `.${card._accentClass}::after{ background: radial-gradient(ellipse at center, ${accent}33 0%, #0000 100%) !important; } .${card._accentClass}.centered::after{ background: radial-gradient(ellipse at center, ${accent}55 0%, #0000 100%) !important; }`;
                            document.head.appendChild(styleEl);
                            card._accentStyle = styleEl;
                        }
                        card.classList.add(card._accentClass);
                    } catch (e) {}
                    // Notify peers/host about focus so everyone sees the highlight
                    try {
                        if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type: 'relay', data: { type: 'mod-focus', idx: i } }));
                    } catch (e) {}
                });
                card.addEventListener('mouseleave', () => {
                    try {
                        card.style.transform = 'none';
                        card.style.zIndex = 1;
                        card.style.removeProperty('border');
                        card.style.removeProperty('box-shadow');
                        card.style.removeProperty('color');
                        const sm = card.querySelector('small'); if (sm) sm.style.removeProperty('color');
                        const hb = card.querySelector('b'); if (hb) hb.style.removeProperty('color');
                        if (card._accentClass) card.classList.remove(card._accentClass);
                        if (card._accentStyle) { card._accentStyle.remove(); card._accentStyle = null; }
                    } catch (e) {}
                    try {
                        if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type: 'relay', data: { type: 'mod-focus', idx: -1 } }));
                    } catch (e) {}
                });

                card.onclick = () => {
                    try {
                        // In single-player host scenario, apply immediately.
                        if (!NET || !NET.connected) {
                            applyWorldModifierByName(opt.name);
                        } else {
                            // If we're host, apply and broadcast; otherwise send pick to host for confirmation
                            if (NET.role === 'host') {
                                applyWorldModifierByName(opt.name);
                                try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'mod-apply', name: opt.name } })); } catch (e) {}
                            } else {
                                try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'mod-pick', name: opt.name, chooserRole: NET.role } })); } catch (e) {}
                            }
                        }
                    } catch (e) {}
                    // Close UI
                    try { div.style.display = 'none'; div.innerHTML = ''; div.classList.remove('card-bg-visible'); } catch (e) {}
                    try { cardState.active = false; waitingForCard = false; } catch (e) {}
                };
                div.appendChild(card);
            }
            Object.assign(div.style, {
                display: 'flex',
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                height: '320px',
                width: '900px',
                background: '',
            });
            div.classList.add('card-bg-visible');
            return;
        }
    } catch (e) {}
    for (let i = 0; i < cardCount; ++i) {
        const opt = choices[i];
        const card = document.createElement('div');
        card.className = 'card card-uniform world-modifier';
        card.innerHTML = `<b>${opt.name}</b><br><small>${opt.desc}</small>`;
        Object.assign(card.style, {
            position: 'absolute',
            left: `${startX + i * (cardWidth + margin)}px`,
            top: '40px',
            width: cardWidth + 'px',
            height: cardHeight + 'px',
            transform: 'none',
            zIndex: 1
        });
        div.appendChild(card);
    }
    Object.assign(div.style, {
        display: 'flex',
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        height: '320px',
        width: '900px',
        background: '',
    });
    div.classList.add('card-bg-visible');

    // Cycling highlight parameters: 4 cycles of 250ms then final highlight 1s
    const lightPurple = '#b48be6';
    const accentPurple = '#a06cc7';
    let cycle = 0; let lastHi = -1;
    function clearAll() {
        for (let c of div.childNodes) {
            // If a remote focus has been set, preserve that card's visual state and skip clearing it
            try {
                const parent = div;
                if (parent && typeof parent._forceFocus === 'number' && parent._forceFocus >= 0) {
                    const idx = Array.prototype.indexOf.call(parent.childNodes, c);
                    if (idx === parent._forceFocus) continue;
                }
            } catch (e) {}
            c.classList.remove('selected', 'centered');
            c.style.zIndex = 1;
            c.style.transform = 'none';
            try {
                c.style.removeProperty('border');
                c.style.removeProperty('box-shadow');
                c.style.removeProperty('color');
                const sm = c.querySelector('small'); if (sm) sm.style.removeProperty('color');
                const hb = c.querySelector('b'); if (hb) hb.style.removeProperty('color');
                if (c._accentClass) c.classList.remove(c._accentClass);
                if (c._accentStyle) { c._accentStyle.remove(); c._accentStyle = null; }
            } catch (e) {}
        }
    }
    function highlightCard(i, accent) {
        const card = div.childNodes[i];
        if (!card) return;
        card.classList.add('selected', 'centered');
        card.style.zIndex = 10;
        card.style.transform = 'scale(1.13)';
        try {
            card.style.setProperty('border', '3px solid ' + accent, 'important');
            card.style.setProperty('box-shadow', '0 6px 18px ' + accent, 'important');
            card.style.setProperty('color', lightPurple, 'important');
            const sm = card.querySelector('small'); if (sm) sm.style.setProperty('color', lightPurple, 'important');
            if (!card._accentClass) card._accentClass = 'card-accent-' + Math.floor(Math.random()*1000000);
            if (!card._accentStyle) {
                const styleEl = document.createElement('style');
                styleEl.innerText = `.${card._accentClass}::after{ background: radial-gradient(ellipse at center, ${ accent }33 0%, #0000 100%) !important; } .${card._accentClass}.centered::after{ background: radial-gradient(ellipse at center, ${ accent }55 0%, #0000 100%) !important; }`;
                document.head.appendChild(styleEl);
                card._accentStyle = styleEl;
            }
            card.classList.add(card._accentClass);
        } catch (e) {}
    }

    // neutral AI selection: normally host decides the final pick and broadcasts mod-apply; clients only display
    // However, if the chooserRole corresponds to a remote World Master (e.g. joiner is WM and this is host),
    // the host should not auto-decide — instead wait for the WM client to pick (so autopick can be disabled).
    let hostWillDecide = (!NET.connected) || (NET.connected && NET.role === 'host');
    try {
        if (NET && NET.connected) {
            // If we're the host but the chooser is the joiner and the joiner is the assigned WorldMaster, do not decide here
            if (NET.role === 'host' && chooserRole === 'joiner' && typeof worldMasterPlayerIndex !== 'undefined' && worldMasterPlayerIndex === 1) {
                hostWillDecide = false;
            }
            // If we're a joiner and the chooser is the host and the host is assigned WorldMaster, do not decide here on the client side
            if (NET.role !== 'host' && chooserRole === 'host' && typeof worldMasterPlayerIndex !== 'undefined' && worldMasterPlayerIndex === 0) {
                hostWillDecide = false;
            }
        }
    } catch (e) {}
    // If caller provided finalIdx (from host), honor it; otherwise pick locally
    if (typeof resolvedFinalIdx !== 'number' || resolvedFinalIdx < 0 || resolvedFinalIdx >= cardCount) {
        resolvedFinalIdx = randInt(0, Math.max(0, cardCount-1));
    }
    if (manualMode) {
        clearAll();
        try { div._manualWorldMaster = true; } catch (e) {}
        return;
    }
    try { div._manualWorldMaster = false; } catch (e) {}
    function cycleOnce() {
        clearAll();
        let hi;
        do { hi = randInt(0, cardCount-1); } while (cardCount > 1 && hi === lastHi);
        lastHi = hi;
        highlightCard(hi, accentPurple);
        cycle++;
        if (cycle < 4) {
            setTimeout(cycleOnce, 250);
        } else {
            // final highlight
            clearAll();
            highlightCard(resolvedFinalIdx, accentPurple);
            setTimeout(() => {
                const opt = choices[resolvedFinalIdx];
                // Host applies and broadcasts; clients wait for mod-apply message
                if (hostWillDecide) {
                    try { applyWorldModifierByName(opt.name); } catch (e) {}
                    try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'mod-apply', name: opt.name } })); } catch (e) {}
                } else {
                    logDev(`[CARD FLOW] Waiting for host to apply world modifier: ${opt.name}`);
                }
                // hide UI for everyone; host already applied, clients will apply on mod-apply handler
                try { const card = div.childNodes[resolvedFinalIdx]; if (card && card._accentStyle) { card._accentStyle.remove(); card._accentStyle = null; } } catch (e) {}
                div.style.display = 'none'; div.innerHTML = ''; div.classList.remove('card-bg-visible');
                cardState.active = false; waitingForCard = false;
            }, 1000);
        }
    }
    cycleOnce();
}

// --- Cards UI ---
function updateCardsUI() {
    
    let cardsDiv = document.getElementById('cards-ui');
    if (!cardsDiv) {
        
        return;
    }
    function cardHtml(cardName, count) {
        let card = getCardByName(cardName);
        let suffix = count > 1 ? ` <small style="opacity:0.85; margin-left:6px;">x${count}</small>` : '';
        return `<span class="card-badge" title="${card ? card.desc : ""}">${cardName}${suffix}</span>`;
    }

    function buildHtmlForList(cards) {
        if (!cards || cards.length === 0) return '<span class="card-badge none">None</span>';
        // count occurrences
        let counts = {};
        for (let c of cards) counts[c] = (counts[c] || 0) + 1;
        let out = [];
        for (let name of Object.keys(counts)) out.push(cardHtml(name, counts[name]));
        return out.join('');
    }

    let hostName, joinerName, p1Cards, p2Cards;
    if (!NET.connected) {
        // Single player: default labels
        hostName = NET.myName || 'Player 1';
        joinerName = 'Shot bot';
        p1Cards = (player && Array.isArray(player.cards)) ? player.cards : [];
        p2Cards = (enemy && Array.isArray(enemy.cards)) ? enemy.cards : [];
    } else {
        // Multiplayer: always use NET.myName/NET.peerName for lobby and in-game
        if (NET.role === 'host') {
            hostName = NET.myName || 'Player 1';
            joinerName = NET.peerName || 'Player 2';
            p1Cards = (player && Array.isArray(player.cards)) ? player.cards : [];
            p2Cards = (enemy && Array.isArray(enemy.cards)) ? enemy.cards : [];
        } else {
            // joiner
            hostName = NET.peerName || 'Player 1';
            joinerName = NET.myName || 'Player 2';
            p1Cards = (enemy && Array.isArray(enemy.cards)) ? enemy.cards : [];
            p2Cards = (player && Array.isArray(player.cards)) ? player.cards : [];
        }
    }
    // Build world modifiers list from activeWorldModifiers
    let worldList = [];
    try { worldList = Array.isArray(activeWorldModifiers) ? activeWorldModifiers.slice() : []; } catch (e) { worldList = []; }
    function buildHtmlForWorldList(wlist) {
        if (!wlist || wlist.length === 0) return '<span class="card-badge none">None</span>';
        // If WorldMaster is active, make badges clickable to select controlled effect
        const isWorldMaster = window.localPlayerIndex === -1 && window.gameWorldMasterInstance;
        
        
        return wlist.map(n => {
            const isSelected = isWorldMaster && window.gameWorldMasterInstance.controlledEffect === n;
            const clickableClass = isWorldMaster ? ' wm-clickable' : '';
            const selectedClass = isSelected ? ' wm-selected' : '';
            const badge = `<span class="card-badge${clickableClass}${selectedClass}" title="World modifier: ${n}" data-effect-name="${n}">${n}</span>`;
            
            return badge;
        }).join('');
    }

    // Header renames in single-player World Master mode:
    // If localPlayerIndex === -1 (World Master) and not NET.connected,
    // then labels should be:
    // - First line: "Shot bot 1 Cards:" (enemy cards)
    // - Second line: "Shot bot 2 Cards:" (extra bot, maps to player cards visually)
    // - Third line: "<PlayerName> Cards:" instead of "World Cards:"
    let topLabel1 = `${hostName} Cards:`;
    let topList1 = buildHtmlForList(p1Cards);
    let topLabel2 = `${joinerName} Cards:`;
    let topList2 = buildHtmlForList(p2Cards);
    let worldHeader = 'World Cards:';
    // Derive display name for WM
    let wmName = hostName;
    if (!NET.connected && window.localPlayerIndex === -1) {
        // Re-map labels for single-player WM UX
        wmName = (NET.myName && NET.myName.trim()) ? NET.myName.trim() : hostName;
        topLabel1 = 'Shot bot 1 Cards:';
        topList1 = buildHtmlForList(p2Cards); // enemy on first line
        topLabel2 = 'Shot bot 2 Cards:';
        topList2 = buildHtmlForList(p1Cards); // player's old cards on second line to represent bot 2
        worldHeader = wmName + ' Cards:';
    }

    // Apply World Master logic according to exact specification
    
    if (NET.connected && worldMasterEnabled) {
    const hostIsWM = (worldMasterPlayerIndex === 0);
    const joinerIsWM = (worldMasterPlayerIndex === 1);
    const aiEnabled = !isEnemySuppressedForGameplay();
        
        
        if (hostIsWM) {
            // Host is WM: their name goes in purple world header
            worldHeader = (hostName || 'Player 1') + ' Cards:';
            if (aiEnabled) {
                // Blue becomes AI controlled "Shot bot"
                topLabel1 = 'Shot bot Cards:';
            } else {
                // Blue disappears entirely 
                topLabel1 = null;
            }
        } else if (joinerIsWM) {
            // Joiner is WM: their name goes in purple world header
            worldHeader = (joinerName || 'Player 2') + ' Cards:';
            if (aiEnabled) {
                // Red becomes AI controlled "Shot bot" 
                topLabel2 = 'Shot bot Cards:';
            } else {
                // Red disappears entirely
                topLabel2 = null;
            }
        }
    }

    // Populate per-slot rows based on roster slots (only show rows for active fighters)
    const slotRows = [document.getElementById('cards-row-0'), document.getElementById('cards-row-1'), document.getElementById('cards-row-2'), document.getElementById('cards-row-3')];
    let slots = [];
    try { slots = (playerRoster && typeof playerRoster.getSlots === 'function') ? playerRoster.getSlots({ includeDetails: true }) : []; } catch (e) { slots = []; }

    function writeRow(rowEl, labelHtml, listHtml) {
        if (!rowEl) return;
        rowEl.innerHTML = `<div class="cards-list"><span style="font-weight:bold;">${labelHtml}</span> ${listHtml}</div>`;
        rowEl.style.display = '';
    }

    // clear rows
    for (const r of slotRows) { if (r) { r.innerHTML = ''; r.style.display = 'none'; } }

    // slot 0 (host/blue)
    if (slots[0] && slots[0].fighter) {
        // If label maps to a generic 'Shot bot' and the slot actually holds a bot,
        // prefer the bot's configured name so card badges show the updated name.
        let label = topLabel1 || `${hostName} Cards:`;
        try {
            const f0 = slots[0].fighter;
            if (f0 && f0.kind === 'bot' && /shot bot/i.test((label || '').toLowerCase()) ) {
                label = (f0.name || `Bot 1`) + ' Cards:';
            }
        } catch (e) {}
        writeRow(slotRows[0], `<span style=\"color:#65c6ff;\">${label}</span>`, topList1 || '<span class="card-badge none">None</span>');
    }
    // slot 1 (joiner/red)
    if (slots[1] && slots[1].fighter) {
        let label = topLabel2 || `${joinerName} Cards:`;
        try {
            const f1 = slots[1].fighter;
            if (f1 && f1.kind === 'bot' && /shot bot/i.test((label || '').toLowerCase()) ) {
                label = (f1.name || `Bot 2`) + ' Cards:';
            }
        } catch (e) {}
        writeRow(slotRows[1], `<span style=\"color:#ff5a5a;\">${label}</span>`, topList2 || '<span class="card-badge none">None</span>');
    }
    // slots 2..3 (yellow/green)
    for (let si = 2; si <= 3; si++) {
        if (slots[si] && slots[si].fighter) {
            const f = slots[si].fighter;
            const name = f.name || (`Bot ${si+1}`);
            let entity = null;
            try { entity = playerRoster.getEntityReference(f.id); } catch (e) { entity = f.entity || null; }
            const cardsArr = (entity && Array.isArray(entity.cards)) ? entity.cards : (f.cards || []);
            const listHtml = buildHtmlForList(cardsArr);
            const color = (si === 2) ? '#ffe066' : '#2ecc71';
            writeRow(slotRows[si], `<span style=\"color:${color};\">${name} Cards:</span>`, listHtml);
        }
    }

    // update world cards into dedicated container under canvas
    try {
        const worldContainer = document.getElementById('world-cards-list');
        if (worldContainer) {
            worldContainer.innerHTML = `<span style=\"color:#8f4f8f;font-weight:bold; margin-right:8px;\">${worldHeader}</span> ${buildHtmlForWorldList(worldList)}`;
            worldContainer.style.display = '';
        }
    } catch (e) {}
    
    // Enable pointer events and add click delegation for WorldMaster
    const isWorldMaster = window.localPlayerIndex === -1 && window.gameWorldMasterInstance;
    
    
    if (isWorldMaster) {
        // Let the container ignore clicks so map clicks go through except for badges
        cardsDiv.style.pointerEvents = 'none';
        // Only raise the z-index to allow WM interaction when a match is running.
        // During setup we must keep these badges behind overlays (setup overlay z-index:20).
        try {
            if (typeof running !== 'undefined' && running) {
                cardsDiv.style.zIndex = '5000'; // ensure it's above the canvas during play
            } else {
                cardsDiv.style.zIndex = '10'; // keep behind setup overlay while in lobby/setup
            }
        } catch (e) {
            cardsDiv.style.zIndex = '10';
        }
        
        
        
        
        
        // Check if badges have the right classes
        const clickableBadges = cardsDiv.querySelectorAll('.wm-clickable');
        
        clickableBadges.forEach((badge, i) => {
            // Ensure badges can receive click events even if parent ignores them
            try { badge.style.pointerEvents = 'auto'; } catch (e) {}
            // Hover handlers: notify peers about focus so they can show purple highlight
            if (!badge._wmHoverHandlers) {
                badge.addEventListener('mouseenter', () => {
                    try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type: 'relay', data: { type: 'mod-focus', idx: i } })); } catch (e) {}
                });
                badge.addEventListener('mouseleave', () => {
                    try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type: 'relay', data: { type: 'mod-focus', idx: -1 } })); } catch (e) {}
                });
                badge._wmHoverHandlers = true;
            }
            
            // Add a direct listener to guarantee badge clicks work and don't bubble to canvas
            if (!badge._wmDirectClick) {
                badge.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    ev.stopImmediatePropagation();
                    const effectName = badge.getAttribute('data-effect-name');
                    
                    if (window.gameWorldMasterInstance.controlledEffect === effectName) {
                        window.gameWorldMasterInstance.clearControlledEffect();
                    } else {
                        window.gameWorldMasterInstance.setControlledEffect(effectName);
                    }
                    setTimeout(() => updateCardsUI(), 50);
                });
                badge._wmDirectClick = true;
            }
        });
        
        // Remove any existing click handlers to prevent duplicates
        if (window._wmCardClickHandler) {
            cardsDiv.removeEventListener('click', window._wmCardClickHandler);
        }
        
        // Create new click handler using event delegation
        window._wmCardClickHandler = function(event) {
            // prevent clicks from bubbling to the canvas accidentally
            event.stopPropagation();
            
            const badge = event.target.closest('.wm-clickable');
            if (!badge) {
                
                return;
            }
            event.preventDefault();
            event.stopImmediatePropagation();
            const effectName = badge.getAttribute('data-effect-name');
            
            
            if (window.gameWorldMasterInstance.controlledEffect === effectName) {
                
                window.gameWorldMasterInstance.clearControlledEffect();
            } else {
                
                window.gameWorldMasterInstance.setControlledEffect(effectName);
            }
            
            // Refresh UI to show updated selection
            setTimeout(() => updateCardsUI(), 50);
        };
        
        cardsDiv.addEventListener('click', window._wmCardClickHandler);
        
        // Safety net: document-level capture to catch badge clicks before anything else
        if (!window._wmDocBadgeCaptureInstalled) {
            const badgeCapture = function(e) {
                if (!(window.localPlayerIndex === -1 && window.gameWorldMasterInstance)) return;
                const t = e.target;
                if (!t || !t.closest) return;
                const badge = t.closest('.wm-clickable');
                if (!badge) return;
                // Consume completely so it never reaches canvas or other listeners
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const effectName = badge.getAttribute('data-effect-name');
                
                try {
                    if (window.gameWorldMasterInstance.controlledEffect === effectName) {
                        window.gameWorldMasterInstance.clearControlledEffect();
                    } else {
                        window.gameWorldMasterInstance.setControlledEffect(effectName);
                    }
                    setTimeout(() => updateCardsUI(), 50);
                } catch (ex) { console.error('WM badge capture error:', ex); }
            };
            document.addEventListener('click', badgeCapture, true);
            document.addEventListener('pointerdown', badgeCapture, true);
            document.addEventListener('mousedown', badgeCapture, true);
            window._wmDocBadgeCaptureHandler = badgeCapture;
            window._wmDocBadgeCaptureInstalled = true;
            
        }
        
        // Add a test click function accessible from console
        window._testWMBadgeClick = function(effectName) {
            
            const badge = cardsDiv.querySelector(`[data-effect-name="${effectName}"]`);
            if (badge) {
                
                badge.click();
            } else {
                
                
            }
        };
        
    } else {
        // Non-WM: container behaves normally, but we ensure it doesn't block gameplay clicks unnecessarily
        cardsDiv.style.pointerEvents = 'none';
    }

    // Ensure no JS overrides the top placement; CSS keeps it top-centered.
    try { cardsDiv.style.top = '10px'; } catch (e) {}
}
function drawCardsUI() {
    updateCardsUI();
}

// --- Setup Overlay Logic ---
function showSetupOverlay() {
    showSetupUI();
    resetMultiplayerReadyState();
    stopGame();
}

// --- Input ---
window.addEventListener('mousemove', e => {
    if(!canvas) return;
    let rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
});
window.addEventListener('keydown', e => {
    const devInput = document.getElementById('dev-console-input');
    const activeEl = document.activeElement;
    const typingInField = activeEl && (activeEl === devInput || activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
    if (typingInField) return;

    // Ignore game controls if WorldMaster mode is active
    if (window.disablePlayerControls) {

        return;
    }

    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ' || e.code === 'Space') {
        // mark keyboard state; collectLocalInput reads keys[] and player.shootQueued may be used as fallback
        // keep player.shootQueued for legacy code paths
        try { if (!isEntityActive(player)) return; } catch (e) {}
        player.shootQueued = true;
    }
});
window.addEventListener('keyup', e => {
    const devInput = document.getElementById('dev-console-input');
    const activeEl = document.activeElement;
    const typingInField = activeEl && (activeEl === devInput || activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
    if (typingInField) return;

    // Ignore game controls if WorldMaster mode is active
    if (window.disablePlayerControls) {

        return;
    }

    keys[e.key.toLowerCase()] = false;
    if (e.key === ' ' || e.code === 'Space') {
        // clear shoot queued to avoid sticky state
        if (player) player.shootQueued = false;
    }
    if (e.key.toLowerCase() === 'r') {
        restartGame();
    }
});

// --- Game Start/Restart ---
function startGame() {
    hideWaitingOverlay();
    waitingForPlayers = false;
    readyPlayers.clear();
    pendingRoundStartPayload = null;
    bullets = [];
    explosions = [];
    // Reset world modifier states
    infestationActive = false;
    infestationTimer = 0;
    infestedChunks = [];
    spontaneousActive = false;
    spontaneousTimer = 0;
    dynamicModifierActive = false;
    roundsSinceLastModifier = 0;
    activeWorldModifiers = [];
    usedWorldModifiers = {};
    try { if (typeof updateCardsUI === 'function') updateCardsUI(); } catch (e) {}
    try { beginRoundLifecycle('game-start'); } catch (e) {}
    // If obstacles were pre-populated (for example, from the Map Editor), keep them.
    // Otherwise generate procedural obstacles as before.
    if (!obstacles || obstacles.length === 0) {
        generateObstacles();
    } else {
        // Ensure loaded obstacles are marked as active and chunks initialized correctly
        for (let o of obstacles) {
            if (!o) continue;
            o.destroyed = o.destroyed || false;
            if (Array.isArray(o.chunks)) {
                for (const c of o.chunks) {
                    c.destroyed = c.destroyed || false;
                    c.flying = c.flying || false;
                    c.alpha = (typeof c.alpha === 'number') ? c.alpha : 1;
                    c.hp = (typeof c.hp === 'number') ? c.hp : 1.0;
                }
            }
        }
    }
    window.positionPlayersSafely();
    // Ensure any roster-assigned bots have entity instances and are positioned
    try {
        if (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.getSlots === 'function') {
            const slots = playerRoster.getSlots({ includeDetails: true }) || [];
            // Place bots evenly around the center if they don't have entity instances yet
            const activeBotSlots = slots.map(s => s.fighter).filter(f => f && f.kind === 'bot');
            for (let i = 0; i < activeBotSlots.length; ++i) {
                const f = activeBotSlots[i];
                if (!f) continue;
                let ent = playerRoster.getEntityReference(f.id);
                const angle = (i / Math.max(1, activeBotSlots.length)) * Math.PI * 2 - Math.PI/2;
                const radius = Math.min(window.CANVAS_W, window.CANVAS_H) * 0.32;
                const px = Math.round(window.CANVAS_W/2 + Math.cos(angle) * radius);
                const py = Math.round(window.CANVAS_H/2 + Math.sin(angle) * radius);
                if (!ent) {
                    // If this bot occupies the host or joiner slot, reuse the existing player/enemy entity
                    if (Number.isInteger(f.slotIndex) && f.slotIndex === 0 && typeof player !== 'undefined' && player) {
                        ent = player;
                        try { playerRoster.setEntityReference(f.id, ent); } catch (e) {}
                    } else if (Number.isInteger(f.slotIndex) && f.slotIndex === 1 && typeof enemy !== 'undefined' && enemy) {
                        ent = enemy;
                        try { playerRoster.setEntityReference(f.id, ent); } catch (e) {}
                    }
                }
                if (!ent) {
                    const color = (typeof getRosterFighterColor === 'function') ? (getRosterFighterColor(f.slotIndex, f) || f.color) : (f.color || '#ff5a5a');
                    ent = new Player(false, color, px, py);
                    ent.displayName = f.name || ent.displayName || `Bot ${f.id}`;
                    // Basic sync of key stats
                    ent.score = f.score || 0;
                    ent._isRosterBot = true;
                    ent._rosterFighterId = f.id;
                    try { playerRoster.setEntityReference(f.id, ent); } catch (e) {}
                } else {
                    // Update position if entity exists but not placed
                    if (typeof ent.x !== 'number' || typeof ent.y !== 'number') {
                        ent.x = px; ent.y = py;
                    }
                    ent._isRosterBot = true;
                    ent._rosterFighterId = f.id;
                    ent.color = (typeof getRosterFighterColor === 'function') ? (getRosterFighterColor(f.slotIndex, f) || f.color || ent.color) : (f.color || ent.color);
                    ent.displayName = f.name || ent.displayName;
                    ent.score = f.score || ent.score || 0;
                }
            }
        }
    } catch (e) { console.warn('Failed to ensure roster bot entities:', e); }
    // Make sure slot 0/1 roster fighters point to the player/enemy instances to avoid duplicates
    try {
        if (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.getFighterById === 'function') {
            const slots = playerRoster.getSlots({ includeDetails: true }) || [];
            const isMultiplayer = !!(NET && NET.connected);
            const slot0Entity = (() => {
                if (!isMultiplayer) return player;
                if (NET.role === 'host') return player; // host's local player controls slot 0
                return enemy; // joiner views host as enemy entity
            })();
            const slot1Entity = (() => {
                if (!isMultiplayer) return enemy;
                if (NET.role === 'host') return enemy; // host views joiner as enemy entity
                return player; // joiner controls slot 1 locally
            })();
            if (slot0Entity && slots[0] && slots[0].fighter) {
                try { playerRoster.setEntityReference(slots[0].fighter.id, slot0Entity); } catch (e) {}
            }
            if (slot1Entity && slots[1] && slots[1].fighter) {
                try { playerRoster.setEntityReference(slots[1].fighter.id, slot1Entity); } catch (e) {}
            }
            // Assign entities for additional human slots (joiners beyond the first)
            try {
                for (let i = 2; i < slots.length; i++) {
                    const slot = slots[i];
                    if (!slot || !slot.fighter || slot.fighter.kind !== 'human') continue;
                    let ent = playerRoster.getEntityReference(slot.fighter.id);
                    if (ent) continue; // already assigned
                    // Create a new entity for this remote human player
                    const color = (typeof getRosterFighterColor === 'function') ? getRosterFighterColor(i, slot.fighter) : '#ff5a5a';
                    const angle = ((i - 2) / Math.max(1, slots.length - 2)) * Math.PI * 2 - Math.PI/2; // distribute starting from top
                    const radius = Math.min(window.CANVAS_W, window.CANVAS_H) * 0.32;
                    const px = Math.round(window.CANVAS_W/2 + Math.cos(angle) * radius);
                    const py = Math.round(window.CANVAS_H/2 + Math.sin(angle) * radius);
                    ent = new Player(false, color, px, py);
                    ent.displayName = slot.fighter.name || `Player ${i}`;
                    ent.score = slot.fighter.score || 0;
                    ent._isRosterHuman = true;
                    ent._rosterFighterId = slot.fighter.id;
                    try { playerRoster.setEntityReference(slot.fighter.id, ent); } catch (e) {}
                }
            } catch (e) { console.warn('Failed to assign entities for additional human slots:', e); }
        }
    } catch (e) {}
    // Ensure colors are right for current mode
    if (typeof NET === 'undefined' || !NET || !NET.connected) {
        if (player) player.color = HOST_PLAYER_COLOR;
        if (enemy) enemy.color = getJoinerColor(0);
    } else if (NET.role === 'host') {
        if (player) player.color = HOST_PLAYER_COLOR;
        if (enemy) enemy.color = getJoinerColor(0);
    } else if (NET.role === 'joiner') {
        const myJoinerIdx = Number.isInteger(NET.joinerIndex) ? NET.joinerIndex : 0;
        if (player) player.color = getJoinerColor(myJoinerIdx);
        if (enemy) enemy.color = HOST_PLAYER_COLOR;
    }
    // Ensure enemy existence and disabled flag according to selection
    if (!enemy) {
        const enemyColor = (typeof getJoinerColor === 'function') ? getJoinerColor(0) : '#ff5a5a';
        enemy = new Player(false, enemyColor, window.CANVAS_W*0.66, CANVAS_H/2);
    }
    enemyDisabled = (enemyCount <= 0);
    
    lastTimestamp = 0;
    cardState = { active: false, player: null, callback: null };
    waitingForCard = false;
    running = true;
    cancelAnimationFrame(animFrameId);
    animFrameId = requestAnimationFrame(gameLoop);
    updateCardsUI();
    // If WorldMaster is assigned and the match is starting, show the WM panel now
    try {
        if (window.localPlayerIndex === -1 && window.gameWorldMasterInstance && window.gameWorldMasterInstance.ui && typeof window.gameWorldMasterInstance.ui.toggle === 'function') {
            window.gameWorldMasterInstance.ui.toggle(true);
        }
    } catch (e) {}
}

function stopGame() {
    running = false;
    cancelAnimationFrame(animFrameId);
}

// --- Init ---
canvas = document.getElementById('game');
ctx = canvas.getContext('2d');
setupOverlayInit();
// Prevent default context menu on the game canvas and map right-click to dash
if (canvas) {
    // Right mouse down -> treat as Shift pressed (dash)
    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 2) {
            // Disable dash for WorldMaster
            if (window.disablePlayerControls) {
                
                e.preventDefault();
                return;
            }
            // prevent the browser context menu
            e.preventDefault();
            // set shift-like state so collectLocalInput sees dash
            keys['shift'] = true;
            // also mark player dash intent for legacy code paths
            if (player && player.dash) {
                // emulate pressing shift: if possible, queue dash (will be handled in update)
                // we don't call dash directly here to preserve host-authoritative behavior
            }
        }
    });
    // Right mouse up -> clear shift state
    canvas.addEventListener('mouseup', (e) => {
        if (e.button === 2) {
            e.preventDefault();
            // Clear shift state only if not WorldMaster
            if (!window.disablePlayerControls) {
                keys['shift'] = false;
            }
        }
    });
    // Left mouse down -> treat as shooting (like Space)
    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
            // Disable shooting for WorldMaster
            if (window.disablePlayerControls) {
                
                return;
            }
            // queue a shoot action (legacy/compat path) only if player is active
            try { if (!isEntityActive(player)) return; } catch (e) {}
            if (player) player.shootQueued = true;
        }
    });
    // Left mouse up -> clear shoot queue
    canvas.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
            // Clear shoot queue only if not WorldMaster
            if (!window.disablePlayerControls && player) {
                player.shootQueued = false;
            }
        }
    });
    // Prevent context menu from opening on right-click
    canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); });
    // Also clear shift when leaving the window to avoid sticky state
    window.addEventListener('blur', () => { keys['shift'] = false; });
}
document.getElementById('card-choices').style.display = 'none';
updateCardsUI();

// --- Options modal wiring ---
function saveVolumesToStorage() {
    try {
    localStorage.setItem('shape_shot_volumes', JSON.stringify({ master: masterVolume, music: musicVolume, sfx: sfxVolume, shot: shotVolume, explosion: explosionVolume, ricochet: ricochetVolume, hit: hitVolume, impact: impactVolume, dash: dashVolume, burning: burningVolume }));
    } catch (e) {}
}

function applyVolumeSlidersToUI() {
    const m = document.getElementById('master-vol');
    const mu = document.getElementById('music-vol');
    const s = document.getElementById('sfx-vol');
    const mv = document.getElementById('master-vol-val');
    const muv = document.getElementById('music-vol-val');
    const sv = document.getElementById('sfx-vol-val');
    if (m) { m.value = Math.round(masterVolume * 100); if (mv) mv.innerText = m.value; }
    if (mu) { mu.value = Math.round(musicVolume * 100); if (muv) muv.innerText = mu.value; }
    if (s) { s.value = Math.round(sfxVolume * 100); if (sv) sv.innerText = s.value; }
    // per-effect
    const sh = document.getElementById('shot-vol');
    const shv = document.getElementById('shot-vol-val');
    const ex = document.getElementById('explosion-vol');
    const exv = document.getElementById('explosion-vol-val');
    const ric = document.getElementById('ricochet-vol');
    const ricv = document.getElementById('ricochet-vol-val');
    const hi = document.getElementById('hit-vol');
    const hiv = document.getElementById('hit-vol-val');
    const da = document.getElementById('dash-vol');
    const dav = document.getElementById('dash-vol-val');
    const bu = document.getElementById('burning-vol');
    const buv = document.getElementById('burning-vol-val');
    const imp = document.getElementById('impact-vol');
    const impv = document.getElementById('impact-vol-val');
    // Map multipliers so slider value 50 represents multiplier 1.0
    if (sh) { sh.value = Math.round(shotVolume * 50); if (shv) shv.innerText = Math.round(sh.value); }
    if (ex) { ex.value = Math.round(explosionVolume * 50); if (exv) exv.innerText = Math.round(ex.value); }
    if (ric) { ric.value = Math.round(ricochetVolume * 50); if (ricv) ricv.innerText = Math.round(ric.value); }
    if (hi) { hi.value = Math.round(hitVolume * 50); if (hiv) hiv.innerText = Math.round(hi.value); }
    if (da) { da.value = Math.round(dashVolume * 50); if (dav) dav.innerText = Math.round(da.value); }
    if (bu) { bu.value = Math.round(burningVolume * 50); if (buv) buv.innerText = Math.round(bu.value); }
    if (imp) { imp.value = Math.round(impactVolume * 50); if (impv) impv.innerText = Math.round(imp.value); }
}

    // Load saved display name into setup input (if present)
    try {
        const nameInput = document.getElementById('display-name');
        const saved = localStorage.getItem('shape_shot_display_name');
        if (nameInput && saved) nameInput.value = saved;
        // If no saved name, set placeholder to "Player 1"
        if (nameInput && !nameInput.value) nameInput.placeholder = 'Player 1';
    } catch (e) {}

document.addEventListener('DOMContentLoaded', function() {
    try { bindRosterUI(); } catch (e) {}
    try { renderRosterUI(); } catch (e) {}
    try { assignPlayersAndAI(); } catch (e) {}
    const openBtn = document.getElementById('open-options-btn');
    const optionsModal = document.getElementById('options-overlay');
    const backBtn = document.getElementById('options-back-btn');
    const masterSlider = document.getElementById('master-vol');
    const musicSlider = document.getElementById('music-vol');
    const sfxSlider = document.getElementById('sfx-vol');
    const masterVal = document.getElementById('master-vol-val');
    const musicVal = document.getElementById('music-vol-val');
    const sfxVal = document.getElementById('sfx-vol-val');

    if (openBtn && optionsModal) {
        openBtn.addEventListener('click', function() {
            // show options modal and hide setup overlay
            hideSetupUI();
            optionsModal.style.display = 'block';
            applyVolumeSlidersToUI();
        });
    }

    // Defaults button: reset sound sliders and cursor prefs to defaults
    const defaultsBtn = document.getElementById('options-defaults-btn');
    function resetToDefaults() {
        // sound defaults
        masterVolume = 1.0;
        musicVolume = 1.0;
        sfxVolume = 1.0;
        // per-effect defaults: set to 1.0 (slider 100) but UI expectation is 50==1.0,
        // to preserve current audible level mapping we'll set sliders to 50 while
        // treating their multiplier as 1.0 in code.
        shotVolume = 1.0;
        explosionVolume = 1.0;
        ricochetVolume = 1.0;
    hitVolume = 1.0;
    impactVolume = 1.0;
        dashVolume = 1.0;
        burningVolume = 1.0;
        // cursor defaults
        try { localStorage.setItem('shape_shot_cursor', 'reticle'); localStorage.setItem('shape_shot_color', '#ffd86b'); } catch (e) {}
        if (cursorSelect) cursorSelect.value = 'reticle';
        if (cursorColorInput) cursorColorInput.value = '#ffd86b';
        applyCursorStyle('reticle', '#ffd86b');
        // persist volumes and update UI
        saveVolumesToStorage();
        applyVolumeSlidersToUI();
    }
    if (defaultsBtn) {
        defaultsBtn.addEventListener('click', function() {
            resetToDefaults();
        });
    }

    // Cursor style selection: apply saved preference and wire change handler
    const cursorSelect = document.getElementById('cursor-style');
    const cursorColorInput = document.getElementById('cursor-color');
    const canvasEl = document.getElementById('game');
    function applyCursorStyle(style, colorHex) {
        const c = (colorHex || '#ffd86b').replace('#','%23');
        if (!canvasEl) return;
        if (style === 'reticle') {
            canvasEl.style.cursor = "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"32\" height=\"32\" viewBox=\"0 0 32 32\"><g fill=\"none\" stroke=\""+c+"\" stroke-width=\"1.8\"><circle cx=\"16\" cy=\"16\" r=\"7.2\"/></g><g stroke=\""+c+"\" stroke-width=\"1.6\"><path d=\"M16 2v4\"/><path d=\"M16 30v-4\"/><path d=\"M2 16h4\"/><path d=\"M30 16h-4\"/></g></svg>') 16 16, crosshair";
        } else if (style === 'crosshair') {
            // Use a small colored SVG crosshair so it respects the chosen color (fallback to system crosshair)
            canvasEl.style.cursor = "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\"><g fill=\"none\" stroke=\""+c+"\" stroke-width=\"1.6\"><path d=\"M12 0v5\"/><path d=\"M12 24v-5\"/><path d=\"M0 12h5\"/><path d=\"M24 12h-5\"/></g></svg>') 12 12, crosshair";
        } else if (style === 'dot') {
            canvasEl.style.cursor = "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"><circle cx=\"8\" cy=\"8\" r=\"2\" fill=\""+c+"\"/></svg>') 8 8, auto";
        } else if (style === 'bigdot') {
            canvasEl.style.cursor = "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"32\" height=\"32\" viewBox=\"0 0 32 32\"><circle cx=\"16\" cy=\"16\" r=\"5\" fill=\""+c+"\"/></svg>') 16 16, auto";
        } else if (style === 'scope') {
            // scope: outer ring + inner dot + small crosshair
            canvasEl.style.cursor = "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"40\" height=\"40\" viewBox=\"0 0 40 40\"><g fill=\"none\" stroke=\""+c+"\" stroke-width=\"1.6\"><circle cx=\"20\" cy=\"20\" r=\"10\"/></g><circle cx=\"20\" cy=\"20\" r=\"3\" fill=\""+c+"\" /><g stroke=\""+c+"\" stroke-width=\"1.2\"><path d=\"M20 2v6\"/><path d=\"M20 38v-6\"/><path d=\"M2 20h6\"/><path d=\"M38 20h-6\"/></g></svg>') 20 20, crosshair";
        } else {
            canvasEl.style.cursor = 'auto';
        }
    }
    try {
        const saved = localStorage.getItem('shape_shot_cursor') || 'reticle';
        const savedColor = localStorage.getItem('shape_shot_color') || '#ffd86b';
        if (cursorSelect) { cursorSelect.value = saved; }
        if (cursorColorInput) { cursorColorInput.value = savedColor; }
        applyCursorStyle(saved, savedColor);
    } catch (e) {}
    if (cursorSelect) {
        cursorSelect.addEventListener('change', function(e) {
            try { localStorage.setItem('shape_shot_cursor', e.target.value); } catch (err) {}
            const color = (cursorColorInput && cursorColorInput.value) ? cursorColorInput.value : '#ffd86b';
            applyCursorStyle(e.target.value, color);
        });
    }
    if (cursorColorInput) {
        cursorColorInput.addEventListener('input', function(e) {
            try { localStorage.setItem('shape_shot_color', e.target.value); } catch (err) {}
            const style = (cursorSelect && cursorSelect.value) ? cursorSelect.value : 'reticle';
            applyCursorStyle(style, e.target.value);
        });
    }
    if (backBtn && optionsModal) {
        backBtn.addEventListener('click', function() {
            optionsModal.style.display = 'none';
            // Show both setup overlay and setup wrapper for full menu
            var setupOverlay = document.getElementById('setup-overlay');
            var setupWrapper = document.getElementById('setup-wrapper');
            if (setupOverlay) setupOverlay.style.display = 'flex';
            if (setupWrapper) setupWrapper.style.display = 'flex';
            showSetupUI();
            saveVolumesToStorage();
        });
    }

    const displayNameInput = document.getElementById('display-name');
    if (displayNameInput) {
        const onNameChange = () => {
            const raw = displayNameInput.value ? displayNameInput.value.trim() : (displayNameInput.placeholder || '');
            const sanitized = raw ? raw.toString().slice(0, 32) : '';
            NET.myName = sanitized;
            if (NET.role === 'host') {
                NET.hostName = sanitized || 'Host';
            } else if (NET.role === 'joiner' && Number.isInteger(NET.joinerIndex)) {
                NET.updateJoinerName(NET.joinerIndex, sanitized || `Joiner ${NET.joinerIndex + 1}`, { control: 'local' });
            }
            try { localStorage.setItem('shape_shot_display_name', sanitized); } catch (e) {}
            if (NET.connected) {
                sendLocalDisplayName();
            }
            try { ensureRosterDefaults(); } catch (e) {}
            try { renderRosterUI(); } catch (e) {}
            if (typeof NET !== 'undefined' && NET && NET.role === 'host') {
                try { broadcastSetup(); } catch (e) {}
            }
            try { if (typeof setLobbyPlayers === 'function') setLobbyPlayers(); } catch (e) {}
        };
        displayNameInput.addEventListener('change', onNameChange);
        displayNameInput.addEventListener('blur', onNameChange);
        displayNameInput.addEventListener('input', () => {
            // live update local UI but avoid spamming network until commit events
            try { ensureRosterDefaults(); } catch (e) {}
            try { renderRosterUI(); } catch (e) {}
        });
    }

    function updateMaster(val) { masterVolume = val / 100; if (masterVal) masterVal.innerText = Math.round(val); }
    function updateMusic(val) { musicVolume = val / 100; if (musicVal) musicVal.innerText = Math.round(val); }
    function updateSfx(val) { sfxVolume = val / 100; if (sfxVal) sfxVal.innerText = Math.round(val); }
    // Slider mapping: slider value 50 corresponds to multiplier 1.0
    function updateShot(val) { shotVolume = val / 50; const el = document.getElementById('shot-vol-val'); if (el) el.innerText = Math.round(val); }
    function updateExplosion(val) { explosionVolume = val / 50; const el = document.getElementById('explosion-vol-val'); if (el) el.innerText = Math.round(val); }
    function updateRicochet(val) { ricochetVolume = val / 50; const el = document.getElementById('ricochet-vol-val'); if (el) el.innerText = Math.round(val); }
    function updateHit(val) { hitVolume = val / 50; const el = document.getElementById('hit-vol-val'); if (el) el.innerText = Math.round(val); }
    function updateImpact(val) { impactVolume = val / 50; const el = document.getElementById('impact-vol-val'); if (el) el.innerText = Math.round(val); }
    function updateDash(val) { dashVolume = val / 50; const el = document.getElementById('dash-vol-val'); if (el) el.innerText = Math.round(val); }
    function updateBurning(val) { burningVolume = val / 50; const el = document.getElementById('burning-vol-val'); if (el) el.innerText = Math.round(val); }

    if (masterSlider) masterSlider.addEventListener('input', e => updateMaster(e.target.value));
    if (musicSlider) musicSlider.addEventListener('input', e => updateMusic(e.target.value));
    if (sfxSlider) sfxSlider.addEventListener('input', e => updateSfx(e.target.value));
    // per-effect
    const shotSlider = document.getElementById('shot-vol');
    const explosionSlider = document.getElementById('explosion-vol');
    const ricochetSlider = document.getElementById('ricochet-vol');
    const hitSlider = document.getElementById('hit-vol');
    if (shotSlider) shotSlider.addEventListener('input', e => updateShot(e.target.value));
    if (explosionSlider) explosionSlider.addEventListener('input', e => updateExplosion(e.target.value));
    if (ricochetSlider) ricochetSlider.addEventListener('input', e => updateRicochet(e.target.value));
    if (hitSlider) hitSlider.addEventListener('input', e => { updateHit(e.target.value); saveVolumesToStorage(); });
    const impactSlider = document.getElementById('impact-vol');
    if (impactSlider) impactSlider.addEventListener('input', e => { updateImpact(e.target.value); saveVolumesToStorage(); });
    const dashSlider = document.getElementById('dash-vol');
    if (dashSlider) dashSlider.addEventListener('input', e => updateDash(e.target.value));
    const burningSlider = document.getElementById('burning-vol');
    if (burningSlider) burningSlider.addEventListener('input', e => updateBurning(e.target.value));

    // initialize displayed slider values
    applyVolumeSlidersToUI();

    // Wire preview buttons for SFX (subtle small buttons next to sliders)
    try {
        const btnShot = document.getElementById('preview-shot');
        const btnExpl = document.getElementById('preview-explosion');
        const btnRic = document.getElementById('preview-ricochet');
        const btnHit = document.getElementById('preview-hit');
        const btnDash = document.getElementById('preview-dash');
        const btnBurning = document.getElementById('preview-burning');
        const btnImpact = document.getElementById('preview-impact');
        if (btnShot) btnShot.addEventListener('click', (e) => { e.stopPropagation(); try { playGunShot(); } catch (ex) {} });
        if (btnExpl) btnExpl.addEventListener('click', (e) => { e.stopPropagation(); try { playExplosion(); } catch (ex) {} });
        if (btnRic) btnRic.addEventListener('click', (e) => { e.stopPropagation(); try { playRicochet(); } catch (ex) {} });
        if (btnHit) btnHit.addEventListener('click', (e) => { e.stopPropagation(); try { playHit(); } catch (ex) {} });
        if (btnDash) btnDash.addEventListener('click', (e) => { e.stopPropagation(); try { playDashWoosh(0.28, 1.0); } catch (ex) {} });
        if (btnBurning) btnBurning.addEventListener('click', (e) => { e.stopPropagation(); try { playBurning(1.0); } catch (ex) {} });
        if (btnImpact) btnImpact.addEventListener('click', (e) => { e.stopPropagation(); try { playImpact(3.5); } catch (ex) {} });
    } catch (e) { /* ignore if elements missing */ }

    // Inject subtle CSS for preview buttons to keep them visually light
    try {
        const style = document.createElement('style');
        style.innerText = `.sfx-preview{ background:#123033; color:#7fe0d6; border:1px solid #0e2a2b; border-radius:6px; font-size:12px; padding:2px 6px; cursor:pointer; box-shadow:0 1px 0 #0007; } .sfx-preview:hover{ background:#165a57; }`;
        document.head.appendChild(style);
    } catch (e) {}
});

// --- Map Editor Support ---
function mapEditorInit() {
    const modal = document.getElementById('map-editor-modal');
    const openBtn = document.getElementById('open-map-editor');
    const canvasEl = document.getElementById('map-editor-canvas');
    const ctxEl = canvasEl.getContext('2d');
    const sizeRange = document.getElementById('editor-size');
    const sizeVal = document.getElementById('editor-size-val');
    const placeBtn = document.getElementById('editor-place');
    const eraseBtn = document.getElementById('editor-erase');
    const saveBtn = document.getElementById('editor-save');
    const clearBtn = document.getElementById('editor-clear');
    const closeBtn = document.getElementById('editor-close');
    const nameInput = document.getElementById('editor-map-name');
    const savedSelect = document.getElementById('saved-maps');
    const gridSnapCheckbox = document.getElementById('editor-grid-snap');

    let mode = 'place';
    let editorSquares = []; // {x,y,w,h}
    let gridSnap = !!(gridSnapCheckbox && gridSnapCheckbox.checked);
    let preview = null; // {x,y,w,h}

    function drawEditor() {
        ctxEl.clearRect(0,0,canvasEl.width, canvasEl.height);
        // background grid
        ctxEl.fillStyle = '#2a2f36';
        ctxEl.fillRect(0,0,canvasEl.width, canvasEl.height);
        ctxEl.strokeStyle = '#374047'; ctxEl.lineWidth = 1;
        for (let x=0;x<canvasEl.width;x+=20) { ctxEl.beginPath(); ctxEl.moveTo(x,0); ctxEl.lineTo(x,canvasEl.height); ctxEl.stroke(); }
        for (let y=0;y<canvasEl.height;y+=20) { ctxEl.beginPath(); ctxEl.moveTo(0,y); ctxEl.lineTo(canvasEl.width,y); ctxEl.stroke(); }
        // draw squares
        ctxEl.fillStyle = '#3d4351';
        for (let s of editorSquares) {
            ctxEl.globalAlpha = 1;
            ctxEl.fillRect(s.x, s.y, s.w, s.h);
            // chunk grid overlay
            ctxEl.strokeStyle = '#2f343b';
            ctxEl.strokeRect(s.x, s.y, s.w, s.h);
        }
        // draw preview silhouette (snapping guide)
        if (preview) {
            ctxEl.save();
            ctxEl.globalAlpha = 0.48;
            ctxEl.fillStyle = '#65c6ff';
            ctxEl.fillRect(preview.x, preview.y, preview.w, preview.h);
            ctxEl.globalAlpha = 0.18;
            ctxEl.strokeStyle = '#ffffff';
            ctxEl.strokeRect(preview.x, preview.y, preview.w, preview.h);
            ctxEl.restore();
        }
        ctxEl.globalAlpha = 1;
    }

    function toEditorCoords(evt) {
        const rect = canvasEl.getBoundingClientRect();
        const x = (evt.clientX - rect.left) * (canvasEl.width/rect.width);
        const y = (evt.clientY - rect.top) * (canvasEl.height/rect.height);
        return {x,y};
    }

    canvasEl.addEventListener('click', (e) => {
        const p = toEditorCoords(e);
        const s = parseInt(sizeRange.value,10);
        let x = Math.round(p.x - s/2), y = Math.round(p.y - s/2);
        if (gridSnap) {
            // snap to 20px editor grid
            x = Math.round(x / 20) * 20;
            y = Math.round(y / 20) * 20;
        }
        if (mode === 'place') {
            editorSquares.push({x, y, w: s, h: s});
        } else {
            // erase if click inside
            for (let i = editorSquares.length-1; i >= 0; --i) {
                const sq = editorSquares[i];
                if (p.x >= sq.x && p.x <= sq.x + sq.w && p.y >= sq.y && p.y <= sq.y + sq.h) {
                    editorSquares.splice(i,1);
                    break;
                }
            }
        }
        drawEditor();
    });

    // Update preview position on mouse move for placement silhouette
    canvasEl.addEventListener('mousemove', (e) => {
        const p = toEditorCoords(e);
        const s = parseInt(sizeRange.value,10);
        let x = Math.round(p.x - s/2), y = Math.round(p.y - s/2);
        if (gridSnap) {
            x = Math.round(x / 20) * 20;
            y = Math.round(y / 20) * 20;
        }
        preview = { x, y, w: s, h: s };
        drawEditor();
    });

    // Toggle grid snap when checkbox changes
    if (gridSnapCheckbox) {
        gridSnapCheckbox.addEventListener('change', () => {
            gridSnap = !!gridSnapCheckbox.checked;
        });
    }

    sizeRange.addEventListener('input', () => { sizeVal.textContent = sizeRange.value; });
    placeBtn.addEventListener('click', () => { mode='place'; placeBtn.disabled=true; eraseBtn.disabled=false; });
    eraseBtn.addEventListener('click', () => { mode='erase'; placeBtn.disabled=false; eraseBtn.disabled=true; });
    clearBtn.addEventListener('click', () => { editorSquares = []; drawEditor(); });
    closeBtn.addEventListener('click', () => { modal.style.display='none'; });

    function saveMap() {
        const nm = (nameInput.value || 'map-' + Date.now()).trim();
        const stored = JSON.parse(localStorage.getItem('shape_shot_maps' ) || '{}');
        stored[nm] = { squares: editorSquares, width: canvasEl.width, height: canvasEl.height };
        localStorage.setItem('shape_shot_maps', JSON.stringify(stored));
        populateSavedMaps();
        alert('Map saved: ' + nm);
    }
    saveBtn.addEventListener('click', saveMap);

    function populateSavedMaps() {
        const stored = JSON.parse(localStorage.getItem('shape_shot_maps' ) || '{}');
        const sel = document.getElementById('saved-maps');
        if (!sel) return;
        // Add a Random option that will pick a saved map each round
        let keys = Object.keys(stored || {});
        let options = ['<option value="">(none)</option>'];
        if (keys.length > 0) options.push('<option value="__RANDOM__">Random</option>');
        options = options.concat(keys.map(k => `<option value="${k}">${k}</option>`));
        sel.innerHTML = options.join('');
    }
    populateSavedMaps();

    openBtn.addEventListener('click', () => {
        const stored = JSON.parse(localStorage.getItem('shape_shot_maps' ) || '{}');
        // load first map into editor if available
        modal.style.display = 'flex';
        editorSquares = [];
        drawEditor();
    });

    // When a saved map is selected in setup overlay, load it later on startGame
    window.getSelectedSavedMap = function() {
        const sel = document.getElementById('saved-maps');
        if (!sel) return null;
        const key = sel.value;
        if (!key) return null;
        const stored = JSON.parse(localStorage.getItem('shape_shot_maps' ) || '{}');
        // If Random option selected, caller should detect it by checking the select value
        return stored[key] || null;
    };
}

mapEditorInit();

// Helper: load a saved map by its storage key into obstacles (scales to game canvas)
function loadSavedMapByKey(key) {
    const stored = JSON.parse(localStorage.getItem('shape_shot_maps' ) || '{}');
    if (!stored[key]) return false;
    const selectedMap = stored[key];
    obstacles = [];
    const editorW = selectedMap.width || 780;
    const editorH = selectedMap.height || 420;
    const scaleX = window.CANVAS_W / editorW;
    const scaleY = CANVAS_H / editorH;
    for (const s of selectedMap.squares || []) {
        const x = s.x * scaleX;
        const y = s.y * scaleY;
        const w = s.w * scaleX;
        const h = s.h * scaleY;
        obstacles.push(new Obstacle(x, y, w, h));
    }
    OBSTACLE_COUNT = Math.max(obstacles.length, OBSTACLE_COUNT);
    return true;
}

// Helper: pick a random saved map key (or null)
function pickRandomSavedMapKey() {
    const stored = JSON.parse(localStorage.getItem('shape_shot_maps' ) || '{}');
    const keys = Object.keys(stored || {});
    if (!keys || keys.length === 0) return null;
    return keys[Math.floor(Math.random() * keys.length)];
}

// Delete saved map handler (setup UI delete button)
const deleteSavedBtn = document.getElementById('delete-saved-map');
if (deleteSavedBtn) {
    deleteSavedBtn.addEventListener('click', () => {
        const sel = document.getElementById('saved-maps');
        if (!sel) return alert('No saved maps selector found.');
        const key = sel.value;
        if (!key) return alert('No map selected to delete.');
        if (!confirm('Delete saved map: ' + key + '? This cannot be undone.')) return;
        const stored = JSON.parse(localStorage.getItem('shape_shot_maps') || '{}');
        if (stored[key]) {
            delete stored[key];
            localStorage.setItem('shape_shot_maps', JSON.stringify(stored));
            // Try to remove the option immediately from the select for instant UI feedback
            const selEl = document.getElementById('saved-maps');
            if (selEl) {
                for (let i = selEl.options.length - 1; i >= 0; --i) {
                    if (selEl.options[i].value === key) {
                        selEl.remove(i);
                    }
                }
                // Reset selection to none
                selEl.value = '';
                try { selEl.dispatchEvent(new Event('change')); } catch (e) {}
            }
            // Ensure populateSavedMaps keeps things consistent
            try { populateSavedMaps(); } catch (e) {}
            alert('Deleted map: ' + key);
        } else {
            alert('Map not found: ' + key);
        }
    });
}



// --- Dev Console (fixed, global references) ---
const devLog = document.getElementById('dev-console-log');
const devInput = document.getElementById('dev-console-input');
const devForm = document.getElementById('dev-console-form');

// Toggle visibility helper: add/remove a hidden class on the fixed console
const devConsoleFixed = document.getElementById('dev-console-fixed');
if (devConsoleFixed) {
    // ensure the class exists in style (minimal inline fallback)
    if (!document.getElementById('dev-console-hidden-style')) {
        const s = document.createElement('style');
        s.id = 'dev-console-hidden-style';
        s.innerText = '#dev-console-fixed.hidden { display: none !important; }';
        document.head.appendChild(s);
    }
    // Start hidden by default
    if (!devConsoleFixed.classList.contains('hidden')) devConsoleFixed.classList.add('hidden');
}

// Key handler: toggle console with '/' unless the input is focused
window.addEventListener('keydown', (e) => {
    // Ignore when modifier keys are used (so Ctrl+/ etc don't conflict)
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    // Always allow Escape to close the console even if the input is focused
    if (e.key === 'Escape' || e.key === 'Esc') {
        if (devConsoleFixed && !devConsoleFixed.classList.contains('hidden')) {
            devConsoleFixed.classList.add('hidden');
            try { if (devInput && document.activeElement === devInput) devInput.blur(); } catch (ex) {}
            e.preventDefault();
            e.stopPropagation();
            return;
        }
    }
    // If the dev input exists and is focused, do nothing for other keys
    if (devInput && document.activeElement === devInput) return;
    // Check for '/' key (both main slash and numpad)
    if (e.key === '/' || e.key === 'Slash') {
        if (!devConsoleFixed) return;
        // Prevent the key from doing other actions in the game
        e.preventDefault();
        e.stopPropagation();
        devConsoleFixed.classList.toggle('hidden');
        // If showing the console, focus the input
        if (!devConsoleFixed.classList.contains('hidden')) {
            if (devInput) devInput.focus();
        }
    }
    // Close console on Escape key from anywhere
    if (e.key === 'Escape' || e.key === 'Esc') {
        if (!devConsoleFixed) return;
        if (!devConsoleFixed.classList.contains('hidden')) {
            devConsoleFixed.classList.add('hidden');
            // if the input had focus, blur it so game keys resume
            try { if (devInput && document.activeElement === devInput) devInput.blur(); } catch (ex) {}
        }
    }
});
let devLogLines = [];
function logDev(msg) {
    const time = new Date().toLocaleTimeString();
    devLogLines.push(`[${time}] ${msg}`);
    if (devLogLines.length > 200) devLogLines.shift();
    devLog.innerText = devLogLines.join('\n');
    devLog.scrollTop = devLog.scrollHeight;
}
devForm.addEventListener('submit', function(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const val = devInput.value.trim();
    if (!val) return false;
    logDev('> ' + val);
    if (val.startsWith('//')) {
        let cmd = val.slice(2).trim();
        // Special commands handled by the dev console
        if (cmd.toLowerCase() === 'cards') {
            for (const c of POWERUPS) logDev('//' + c.name);
            devInput.value = '';
            return false;
        }
        if (cmd.toLowerCase() === 'mods') {
            for (const m of WORLD_MODIFIERS) logDev('//' + m.name);
            devInput.value = '';
            return false;
        }
        if (cmd.toLowerCase() === 'ref' || cmd.toLowerCase() === 'refresh') {
            bullets = [];
            explosions = [];
            generateObstacles();
            window.positionPlayersSafely();
            waitingForCard = false;
            logDev('Map refreshed (obstacles regenerated, players repositioned).');
            devInput.value = '';
            return false;
        }
        let count = 1;
        let name = cmd;
        if (cmd.includes('/x')) {
            let parts = cmd.split('/x');
            name = parts[0].trim();
            let n = parseInt(parts[1], 10);
            if (!isNaN(n) && n > 0) count = n;
        }
        // Try world modifier first
        let mod = WORLD_MODIFIERS.find(m => m.name.toLowerCase() === name.toLowerCase());
                if (mod) {
            if (typeof mod.effect === 'function') {
                mod.effect();
                usedWorldModifiers[mod.name] = !usedWorldModifiers[mod.name]; // toggle for testing
                if (usedWorldModifiers[mod.name]) {
                    if (!activeWorldModifiers.includes(mod.name)) activeWorldModifiers.push(mod.name);
                    logDev(`World modifier "${mod.name}" enabled.`);
                            try { if (typeof updateCardsUI === 'function') updateCardsUI(); } catch (e) {}
                } else {
                    activeWorldModifiers = activeWorldModifiers.filter(n => n !== mod.name);
                    logDev(`World modifier "${mod.name}" disabled.`);
                            try { if (typeof updateCardsUI === 'function') updateCardsUI(); } catch (e) {}
                }
            } else {
                logDev(`World modifier "${mod.name}" has no effect function.`);
            }
            devInput.value = '';
            return false;
        }
        // Then try powerup card
        let card = getCardByName(name);
        if (card) {
            if (typeof player !== 'undefined' && player && typeof player.addCard === 'function' && typeof card.effect === 'function') {
                for (let i = 0; i < count; ++i) {
                    player.addCard(card.name);
                    card.effect(player);
                }
                if (typeof updateCardsUI === 'function') updateCardsUI();
                logDev(`Granted ${count}x "${card.name}" to player.`);
            } else {
                try {
                    logDev('DIAG: player=' + (typeof player) + ', playerTruthy=' + (!!player) + ', addCard=' + (player && typeof player.addCard) + ', updateCardsUI=' + (typeof updateCardsUI) + ', cardEffect=' + (typeof card.effect));
                } catch (ex) {
                    logDev('DIAG: error reading diagnostic info: ' + ex.message);
                }
                logDev('Player or updateCardsUI not ready. Try after game starts.');
            }
            devInput.value = '';
            return false;
        }
        logDev(`Card or world modifier not found: "${name}"`);
    } else {
        logDev('Unknown command.');
    }
    devInput.value = '';
    return false;
});
// Initial log message
logDev('Dev console ready. //cards //mods //ref');

// Also handle Enter directly on the input to be extra-reliable
devInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const val = devInput.value.trim();
        if (!val) return;
        logDev('> ' + val);
        if (val.startsWith('//')) {
            let cmd = val.slice(2).trim();
            if (cmd.toLowerCase() === 'cards') {
                for (const c of POWERUPS) logDev('//' + c.name);
                devInput.value = '';
                return;
            }
            if (cmd.toLowerCase() === 'mods') {
                for (const m of WORLD_MODIFIERS) logDev('//' + m.name);
                devInput.value = '';
                return;
            }
            if (cmd.toLowerCase() === 'inv' || cmd.toLowerCase() === 'invincible' || cmd.toLowerCase() === 'god') {
                if (typeof player !== 'undefined' && player) {
                    player.invincible = !player.invincible;
                    logDev('Player invincibility: ' + (player.invincible ? 'ON' : 'OFF'));
                } else {
                    logDev('Player object not ready.');
                }
                devInput.value = '';
                return;
            }
            if (cmd.toLowerCase() === 'ref' || cmd.toLowerCase() === 'refresh') {
                bullets = [];
                explosions = [];
                // Clear transient world-mod entities so //ref behaves like a new round
                try {
                    infestedChunks = [];
                    firestormInstance = null;
                    firestormTimer = 0;
                    spontaneousTimer = 0;
                    infestationTimer = 0;
                } catch (e) {}
                generateObstacles();
                window.positionPlayersSafely();
                waitingForCard = false;
                logDev('Map refreshed (obstacles regenerated, players repositioned). World-mod transient entities cleared.');
                devInput.value = '';
                return;
            }
            let count = 1;
            let name = cmd;
            if (cmd.includes('/x')) {
                let parts = cmd.split('/x');
                name = parts[0].trim();
                let n = parseInt(parts[1], 10);
                if (!isNaN(n) && n > 0) count = n;
            }
            // Try world modifier first
            let mod = WORLD_MODIFIERS.find(m => m.name.toLowerCase() === name.toLowerCase());
            if (mod) {
                if (typeof mod.effect === 'function') {
                    mod.effect();
                    usedWorldModifiers[mod.name] = !usedWorldModifiers[mod.name];
                    if (usedWorldModifiers[mod.name]) {
                        if (!activeWorldModifiers.includes(mod.name)) activeWorldModifiers.push(mod.name);
                        logDev(`World modifier "${mod.name}" enabled.`);
                    } else {
                        activeWorldModifiers = activeWorldModifiers.filter(n => n !== mod.name);
                        logDev(`World modifier "${mod.name}" disabled.`);
                    }
                } else {
                    logDev(`World modifier "${mod.name}" has no effect function.`);
                }
                devInput.value = '';
                return;
            }
            // Then try powerup card
            let card = getCardByName(name);
            if (card) {
                if (typeof player !== 'undefined' && player && typeof player.addCard === 'function' && typeof card.effect === 'function') {
                    for (let i = 0; i < count; ++i) {
                        player.addCard(card.name);
                        card.effect(player);
                    }
                    if (typeof updateCardsUI === 'function') updateCardsUI();
                    logDev(`Granted ${count}x "${card.name}" to player.`);
                } else {
                    try {
                        logDev('DIAG: player=' + (typeof player) + ', playerTruthy=' + (!!player) + ', addCard=' + (player && typeof player.addCard) + ', updateCardsUI=' + (typeof updateCardsUI) + ', cardEffect=' + (typeof card.effect));
                    } catch (ex) {
                        logDev('DIAG: error reading diagnostic info: ' + ex.message);
                    }
                    logDev('Player or updateCardsUI not ready. Try after game starts.');
                }
                devInput.value = '';
                return;
            }
            logDev(`Card or world modifier not found: "${name}"`);
        } else {
            logDev('Unknown command. Use //Card Name, //ModName, or //mods');
        }
        devInput.value = '';
    }
});


