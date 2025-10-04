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
    // Only show modifiers not already picked
    let modDeck = WORLD_MODIFIERS;
    try {
        if (window.WorldMasterIntegration && typeof window.WorldMasterIntegration.getFilteredWorldModifiers === 'function') {
            const filtered = window.WorldMasterIntegration.getFilteredWorldModifiers(WORLD_MODIFIERS) || [];
            if (Array.isArray(filtered) && filtered.length) {
                modDeck = filtered;
            }
        }
    } catch (e) { console.warn('[WORLDMASTER] Failed to filter world modifier deck:', e); }
    let available = modDeck.filter(m => !usedWorldModifiers[m.name]);
    // If fewer than three unused modifiers remain, fall back to entire filtered deck
    let pool = available.length >= 3 ? available : modDeck;
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
            setTimeout(() => {
                // Check if already picked and handle accordingly
                if (usedWorldModifiers[opt.name]) {
                    // Second pick: either disable or apply special logic
                    if (opt.name === "Dynamic") {
                        // Dynamic has special toggle logic
                        opt.effect();
                    } else {
                        // For other modifiers, disable them
                        if (opt.name === "Infestation") {
                            infestationActive = false;
                        } else if (opt.name === "Spontaneous") {
                            spontaneousActive = false;
                        }
                        // Remove from active modifiers
                        activeWorldModifiers = activeWorldModifiers.filter(m => m !== opt.name);
                    }
                } else {
                    // First pick: apply effect and mark as used
                    opt.effect();
                    usedWorldModifiers[opt.name] = true;
                    activeWorldModifiers.push(opt.name);
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
        const roster = new PlayerRoster({ maxSlots: 4 });
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

let rosterUIBound = false;
let rosterInitialized = false;
let localFighterId = null;

const HOST_PLAYER_COLOR = '#65c6ff';
const JOINER_PLAYER_COLORS = ['#ff5a5a', '#f7a945', '#9c6dfb'];
const BOT_PLAYER_COLOR = '#f48f3a';

function getJoinerColor(joinerIndex) {
    const idx = Math.max(0, Math.floor(joinerIndex || 0));
    return JOINER_PLAYER_COLORS[idx] || JOINER_PLAYER_COLORS[JOINER_PLAYER_COLORS.length - 1];
}

function getRosterFighterColor(slotIndex, fighter) {
    if (fighter && fighter.metadata && typeof fighter.metadata.color === 'string' && fighter.metadata.color.trim().length) {
        return fighter.metadata.color;
    }
    if (fighter && fighter.metadata && fighter.metadata.isHost) {
        return HOST_PLAYER_COLOR;
    }
    if (slotIndex === 0) {
        return HOST_PLAYER_COLOR;
    }
    if (fighter && fighter.metadata && typeof fighter.metadata.joinerIndex === 'number') {
        return getJoinerColor(fighter.metadata.joinerIndex);
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
    const bots = getActiveBotCount();
    window.activeBotCount = bots;
    const mappedCount = bots > 0 ? Math.min(bots, 2) : 0;
    if (typeof enemyCount !== 'undefined') {
        enemyCount = mappedCount;
    }
    window.enemyCount = mappedCount;
    const disabled = bots === 0;
    if (typeof enemyDisabled !== 'undefined') {
        enemyDisabled = disabled;
    }
    window.enemyDisabled = disabled;
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
    const fallbackSlots = (typeof playerRoster.getSlotCount === 'function') ? playerRoster.getSlotCount() : 4;
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
            // Ensure default for 3 players
            if (lobbyPlayers.length === 3 && worldMasterPlayerIndex === null) {
                worldMasterPlayerIndex = 2;
                try { if (NET.role === 'host' && typeof window.broadcastSetupWM === 'function') window.broadcastSetupWM(); } catch (e) {}
            }
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

// --- Sound Effects ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
// Volume settings (0.0 - 1.0)
let masterVolume = 1.0;
let musicVolume = 1.0; // reserved if you add music
let sfxVolume = 1.0;
// Per-effect multipliers. We map slider range 0-100 such that 50 == 1.0 (current level),
// higher values make the effect louder than current.
let shotVolume = 1.0;
let explosionVolume = 1.0;
let ricochetVolume = 1.0;
let hitVolume = 1.0;
let dashVolume = 1.0;
let burningVolume = 1.0;
// Limit concurrent procedural burning sound instances to avoid audio overload
const MAX_BURNING_SOUNDS = 10;
const activeBurningSounds = []; // { masterGain, stopTime, baseGain }
let firestormBurningInstance = null; // persistent burning sound for firestorms
// Load saved volumes from localStorage if present
try {
    const vs = JSON.parse(localStorage.getItem('shape_shot_volumes') || '{}');
    if (vs && typeof vs.master === 'number') masterVolume = vs.master;
    if (vs && typeof vs.music === 'number') musicVolume = vs.music;
    if (vs && typeof vs.sfx === 'number') sfxVolume = vs.sfx;
    if (vs && typeof vs.shot === 'number') shotVolume = vs.shot;
    if (vs && typeof vs.explosion === 'number') explosionVolume = vs.explosion;
    if (vs && typeof vs.ricochet === 'number') ricochetVolume = vs.ricochet;
    if (vs && typeof vs.hit === 'number') hitVolume = vs.hit;
    if (vs && typeof vs.dash === 'number') dashVolume = vs.dash;
    if (vs && typeof vs.burning === 'number') burningVolume = vs.burning;
} catch (e) {}
// Load saved rounds-to-win if present
try {
    const savedRounds = parseInt(localStorage.getItem('shape_shot_rounds') || '3');
    if (!isNaN(savedRounds) && savedRounds > 0) ROUNDS_TO_WIN = savedRounds;
    // If the setup input exists, populate it
    try { const roundsInput = document.getElementById('rounds-to-win'); if (roundsInput) roundsInput.value = ROUNDS_TO_WIN; } catch (e) {}
} catch (e) {}
function playGunShot() {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.value = 380;
    g.gain.value = 0.035 * masterVolume * sfxVolume * shotVolume;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.frequency.linearRampToValueAtTime(180, audioCtx.currentTime + 0.09);
    g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.11);
    o.stop(audioCtx.currentTime + 0.12);
    try { if (typeof GameEvents !== 'undefined' && GameEvents.emit) GameEvents.emit('sound-effect', { name: 'gunshot' }); } catch (e) {}
}
function playExplosion() {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'triangle';
    o.frequency.value = 80;
    g.gain.value = 0.45 * masterVolume * sfxVolume * explosionVolume;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.frequency.linearRampToValueAtTime(30, audioCtx.currentTime + 0.18);
    g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.22);
    o.stop(audioCtx.currentTime + 0.23);
    try { if (typeof GameEvents !== 'undefined' && GameEvents.emit) GameEvents.emit('sound-effect', { name: 'explosion' }); } catch (e) {}
}
function playSoftPoof() {
    // Softer, shorter poof sound for lifecycle expiries
    try {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'triangle';
        o.frequency.value = 120;
        g.gain.value = 0.12 * masterVolume * sfxVolume * explosionVolume;
        o.connect(g).connect(audioCtx.destination);
        o.start();
        o.frequency.linearRampToValueAtTime(60, audioCtx.currentTime + 0.12);
        g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.14);
        o.stop(audioCtx.currentTime + 0.15);
    } catch (e) {}
    try { if (typeof GameEvents !== 'undefined' && GameEvents.emit) GameEvents.emit('sound-effect', { name: 'soft-poof' }); } catch (e) {}
}
function playHit() {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = 220;
    g.gain.value = 0.13 * masterVolume * sfxVolume * hitVolume;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.frequency.linearRampToValueAtTime(110, audioCtx.currentTime + 0.08);
    g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.09);
    o.stop(audioCtx.currentTime + 0.1);
    try { if (typeof GameEvents !== 'undefined' && GameEvents.emit) GameEvents.emit('sound-effect', { name: 'hit' }); } catch (e) {}
}
function playRicochet() {
    // subtle short 'dink' sound for ricochet/deflect
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'triangle';
    o.frequency.value = 980; // high-pitched dink
    g.gain.value = 0.05 * masterVolume * sfxVolume * ricochetVolume;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    // quick pitch drop and fade
    o.frequency.linearRampToValueAtTime(640, audioCtx.currentTime + 0.04);
    g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.06);
    o.stop(audioCtx.currentTime + 0.07);
    try { if (typeof GameEvents !== 'undefined' && GameEvents.emit) GameEvents.emit('sound-effect', { name: 'ricochet' }); } catch (e) {}
}
function playDashWoosh(duration = 0.28, speedMult = 1.0) {
    try {
        // duration: seconds, speedMult: multiplier affecting pitch
        const now = audioCtx.currentTime;
        const dur = Math.max(0.06, Math.min(duration, 1.4));
        // Two-layer woosh: low rumble + high whoosh
    const low = audioCtx.createOscillator();
    const lowGain = audioCtx.createGain();
    low.type = 'sine';
    // slightly lower base frequency for a rounder rumble
    low.frequency.value = 80 * Math.max(0.55, speedMult);
    lowGain.gain.value = 0.06 * masterVolume * sfxVolume * dashVolume;
        low.connect(lowGain).connect(audioCtx.destination);
        low.start(now);
    low.frequency.linearRampToValueAtTime(40 * Math.max(0.55, speedMult), now + dur * 0.9);
    lowGain.gain.linearRampToValueAtTime(0.0, now + dur);
        low.stop(now + dur + 0.02);

    const high = audioCtx.createOscillator();
    const highGain = audioCtx.createGain();
    high.type = 'sawtooth';
    // keep high component but reduce base so it's less piercing
    high.frequency.value = 250 * Math.max(0.65, speedMult);
    highGain.gain.value = 0.05 * masterVolume * sfxVolume * dashVolume;
        high.connect(highGain).connect(audioCtx.destination);
        high.start(now);
        // pitch sweep downward for a pleasant woosh
    high.frequency.exponentialRampToValueAtTime(Math.max(120, 320 * Math.max(0.55, speedMult)), now + dur * 0.9);
    highGain.gain.setValueAtTime(highGain.gain.value, now);
    highGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        high.stop(now + dur + 0.02);
    } catch (e) { /* ignore audio errors */ }
    try { if (typeof GameEvents !== 'undefined' && GameEvents.emit) GameEvents.emit('sound-effect', { name: 'dash' }); } catch (e) {}
}
// Continuous burning sound builder: uses two overlapped looping buffers and randomized gain
// automation so the result is a continuous, non-pulsing crackle. Calls remain the same
// (playBurning(duration)) but internally we'll create a short looped source to simulate
// ongoing burning for the requested duration.
function playBurning(duration = 0.5) {
    try {
        const now = audioCtx.currentTime;
        // clamp duration but we'll use a short loop buffer length for continuity
        const requested = Math.max(0.1, Math.min(duration, 6.0));
        const loopLen = 0.6; // seconds, short loop that's overlapped to create continuous texture

        // Helper: create a pink-noise buffer of length loopLen
        function createPinkBuffer(lenSec) {
            const len = Math.floor(audioCtx.sampleRate * lenSec);
            const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
            const d = buf.getChannelData(0);
            let b0 = 0, b1 = 0, b2 = 0;
            for (let i = 0; i < len; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.997 * b0 + white * 0.029;
                b1 = 0.985 * b1 + white * 0.013;
                b2 = 0.950 * b2 + white * 0.007;
                const pink = b0 + b1 + b2 + white * 0.02;
                // soft decay within the small buffer to avoid clicks when stopped
                d[i] = pink * (0.95 - (i / len) * 0.15);
            }
            return buf;
        }

        const bufA = createPinkBuffer(loopLen);
        const bufB = createPinkBuffer(loopLen);

        // Global filter and gain for the burning sound
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 600;
        filter.Q.value = 0.7;

        const masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.05 * masterVolume * sfxVolume * burningVolume;

        filter.connect(masterGain).connect(audioCtx.destination);

        // If we already have too many burning sources, try to extend an existing one instead of
        // creating a new full chain. This prevents audio overload when many entities ignite.
        const nowActive = activeBurningSounds.filter(x => x.stopTime > now);
        if (nowActive.length >= MAX_BURNING_SOUNDS) {
            // Choose the one with the earliest stopTime and extend it slightly
            nowActive.sort((a, b) => a.stopTime - b.stopTime);
            const victim = nowActive[0];
            // bump stopTime by requested seconds but not exceeding a reasonable cap
            const extra = Math.min(requested, 4.0);
            const newStop = Math.max(victim.stopTime, now) + extra;
            // schedule a smoother gain bump to simulate more burning without adding nodes
            try {
                victim.masterGain.gain.cancelScheduledValues(now);
                victim.masterGain.gain.setValueAtTime(victim.baseGain * 0.9, now + 0.01);
                victim.masterGain.gain.linearRampToValueAtTime(victim.baseGain, now + 0.2 + Math.random() * 0.6);
                victim.masterGain.gain.setValueAtTime(victim.baseGain, newStop - 0.08);
                victim.masterGain.gain.linearRampToValueAtTime(0.0, newStop);
            } catch (e) {}
            victim.stopTime = newStop;
            return;
        }

        // Create two sources that will alternate with small randomized offsets
        const srcA = audioCtx.createBufferSource();
        srcA.buffer = bufA;
        srcA.loop = true;
        const srcB = audioCtx.createBufferSource();
        srcB.buffer = bufB;
        srcB.loop = true;

        // Per-source gain nodes so we can modulate amplitude independently
        const gainA = audioCtx.createGain();
        const gainB = audioCtx.createGain();
        gainA.gain.value = 0.9;
        gainB.gain.value = 0.9;

        srcA.connect(gainA).connect(filter);
        srcB.connect(gainB).connect(filter);

        // Start times: stagger slightly to prevent synchronous waves
        const startA = now + 0.01;
        const jitter = Math.random() * 0.08;
        const startB = now + loopLen / 2 + jitter + 0.01;
        srcA.start(startA);
        srcB.start(startB);

        // Randomized slow gain automation to keep texture lively but not pulsing
        function scheduleGainAutomation(gNode, sTime) {
            const segs = Math.max(3, Math.round(loopLen * 2));
            let t = sTime;
            for (let i = 0; i < segs; i++) {
                const dur = (loopLen / segs) * (0.9 + Math.random() * 0.3);
                const val = 0.7 + Math.random() * 0.35; // gentle modulation around ~0.8
                gNode.gain.setValueAtTime(val, t);
                // slight linear ramp to next point
                gNode.gain.linearRampToValueAtTime(0.65 + Math.random() * 0.4, t + dur);
                t += dur;
            }
            // make sure it matches at the loop boundary smoothly
            gNode.gain.setValueAtTime(gNode.gain.value, sTime + loopLen + 0.02);
        }

        scheduleGainAutomation(gainA, startA);
        scheduleGainAutomation(gainB, startB);

        // Stop both sources after requested duration with a smooth, slightly longer fade to avoid
        // any perceptible truncation or clicking. Fade scales with requested time but is clamped.
        const stopTime = now + requested;
        const fade = Math.min(0.6, Math.max(0.12, requested * 0.25));
        // cancel any prior schedules and smoothly target near-zero gain starting at (stopTime - fade)
        try { masterGain.gain.cancelScheduledValues(now); } catch (e) {}
        masterGain.gain.setValueAtTime(masterGain.gain.value, Math.max(now, stopTime - fade));
        // use setTargetAtTime for a gentle exponential-like decay (timeConstant ~0.06)
        masterGain.gain.setTargetAtTime(0.00001, Math.max(now, stopTime - fade) + 0.01, 0.06);

        // Stop sources shortly after fade finishes to ensure complete silence
        const stopAfter = stopTime + fade + 0.06;
        try { srcA.stop(stopAfter); } catch (e) {}
        try { srcB.stop(stopAfter); } catch (e) {}

        // Track this active burning sound so we can cap concurrent instances
        activeBurningSounds.push({ masterGain: masterGain, stopTime: stopAfter, baseGain: masterGain.gain.value });
        // Cleanup entry after it stops (slightly after stopAfter)
        setTimeout(() => {
            for (let i = activeBurningSounds.length - 1; i >= 0; --i) {
                if (activeBurningSounds[i].stopTime <= audioCtx.currentTime) activeBurningSounds.splice(i, 1);
            }
        }, (requested + fade + 0.8) * 1000);
    } catch (e) { /* ignore audio errors */ }
    try { if (typeof GameEvents !== 'undefined' && GameEvents.emit) GameEvents.emit('sound-effect', { name: 'burning' }); } catch (e) {}
}

// Persistent firestorm burning sound: starts when firestorm begins and stops when it ends
function startFirestormBurning() {
    if (firestormBurningInstance) return; // already running
    try {
        const now = audioCtx.currentTime;
        const loopLen = 0.6;

        function createPinkBuffer(lenSec) {
            const len = Math.floor(audioCtx.sampleRate * lenSec);
            const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
            const d = buf.getChannelData(0);
            let b0 = 0, b1 = 0, b2 = 0;
            for (let i = 0; i < len; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.997 * b0 + white * 0.029;
                b1 = 0.985 * b1 + white * 0.013;
                b2 = 0.950 * b2 + white * 0.007;
                const pink = b0 + b1 + b2 + white * 0.02;
                d[i] = pink * (0.95 - (i / len) * 0.15);
            }
            return buf;
        }

        const bufA = createPinkBuffer(loopLen);
        const bufB = createPinkBuffer(loopLen);

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        filter.Q.value = 0.7;

        const masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.05 * masterVolume * sfxVolume * burningVolume;

        filter.connect(masterGain).connect(audioCtx.destination);

        const srcA = audioCtx.createBufferSource();
        srcA.buffer = bufA;
        srcA.loop = true;
        const srcB = audioCtx.createBufferSource();
        srcB.buffer = bufB;
        srcB.loop = true;

        const gainA = audioCtx.createGain();
        const gainB = audioCtx.createGain();
        gainA.gain.value = 0.9;
        gainB.gain.value = 0.9;

        srcA.connect(gainA).connect(filter);
        srcB.connect(gainB).connect(filter);

        const startA = now + 0.01;
        const jitter = Math.random() * 0.08;
        const startB = now + loopLen / 2 + jitter + 0.01;
        srcA.start(startA);
        srcB.start(startB);

        function scheduleGainAutomation(gNode, sTime) {
            const segs = Math.max(3, Math.round(loopLen * 2));
            let t = sTime;
            for (let i = 0; i < segs; i++) {
                const dur = (loopLen / segs) * (0.9 + Math.random() * 0.3);
                const val = 0.7 + Math.random() * 0.35;
                gNode.gain.setValueAtTime(val, t);
                gNode.gain.linearRampToValueAtTime(0.65 + Math.random() * 0.4, t + dur);
                t += dur;
            }
            gNode.gain.setValueAtTime(gNode.gain.value, sTime + loopLen + 0.02);
        }

        scheduleGainAutomation(gainA, startA);
        scheduleGainAutomation(gainB, startB);

        firestormBurningInstance = { srcA, srcB, masterGain, startTime: now };
    } catch (e) { /* ignore audio errors */ }
}

function stopFirestormBurning() {
    if (!firestormBurningInstance) return;
    try {
        const now = audioCtx.currentTime;
        const fade = 0.3;
        const stopTime = now + fade;
        firestormBurningInstance.masterGain.gain.cancelScheduledValues(now);
        firestormBurningInstance.masterGain.gain.setValueAtTime(firestormBurningInstance.masterGain.gain.value, now);
        firestormBurningInstance.masterGain.gain.setTargetAtTime(0.00001, now + 0.01, 0.06);
        firestormBurningInstance.srcA.stop(stopTime);
        firestormBurningInstance.srcB.stop(stopTime);
    } catch (e) { /* ignore audio errors */ }
    firestormBurningInstance = null;
}
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

// --- Utilities ---


// Dash settings helper (extracted so both update() and drawPlayer() can use it)



function beginDash(p, dashVec, dashSet, opts = {}) {
    if (!p) return;
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
let lastTimestamp = 0;
let cardState = { active: false, player: null, callback: null };

function isSelectionPauseActive() {
    if (cardState && cardState.active) return true;
    if (waitingForCard) return true;
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
    joinerTargets: { p0: null, p1: null, healers: new Map() },
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
        const payload = { type: 'input', seq: this.inputSeq, input };
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
            bullets: bullets.map(b => ({ id: b.id, x: b.x, y: b.y, angle: b.angle, speed: b.speed, r: b.radius, dmg: b.damage, bnc: b.bouncesLeft, obl: !!b.obliterator, ex: !!b.explosive, ownerRole: (b.owner === player ? 'host' : 'joiner') })),
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
                } else {
                    // Map ownerRole from snapshot to a local entity so visual owner/color is correct
                    const owner = (typeof sb.ownerRole === 'string') ? getEntityForRole(sb.ownerRole) : player;
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
                    bullets.push(nb);
                }
            }
        } catch (e) { /* ignore snapshot errors to avoid crashing */ }
    },
    // Assign an id to a newly created bullet (host only)
    tagBullet(b) {
        if (!b.id) b.id = 'b' + (Date.now().toString(36)) + '-' + (this.bulletCounter++);
    },
    // Read local input (joiner). We map to existing variables.
    collectLocalInput() {
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
    if (!data || typeof data.entityId === 'undefined') return;
    let entity = null;
    if (player && player.id === data.entityId) entity = player;
    else if (enemy && enemy.id === data.entityId) entity = enemy;
    else if (Array.isArray(healers)) {
        entity = healers.find(h => h && h.id === data.entityId) || null;
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
    // Joiner-side only: show visuals without re-syncing
    entity.triggerHealingEffect(Math.max(healAmount, 1), { skipSync: true, intensityOverride });
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
        if (data.entityId) {
            // player or enemy burning
            let ent = (player && player.id === data.entityId) ? player : ((enemy && enemy.id === data.entityId) ? enemy : null);
            if (ent) ent.burning = { time: 0, duration: data.duration || 2.5 };
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

function createSyncedDamageFlash(targetEntity, damage, isBurning = false) {
    try {
        const data = { entityId: (targetEntity && targetEntity.id) ? targetEntity.id : null, damage, isBurning };
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
    if (player) {
        player.updateBurning(dt);
        if (typeof player.update === 'function') player.update(dt);
    }
    if (activeEnemy) {
        enemy.updateBurning(dt);
        if (typeof enemy.update === 'function') enemy.update(dt);
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
    if (simulateLocally && player.dash && !joinerIsWM_AI_On && !hostIsWM_AI_On) {
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
                    let dmg = 18 + (player.ramStacks || 0) * 6; // damage scales per ram stack
                    enemy._lastAttacker = player;
                    enemy.takeDamage(dmg);
                    enemy._lastAttacker = null;
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
                    let dmg = 18 + (enemy.ramStacks || 0) * 6;
                    player._lastAttacker = enemy;
                    player.takeDamage(dmg);
                    player._lastAttacker = null;
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
        // Host: drive enemy using remote input from joiner
        let ri = NET.remoteInput || { up:false,down:false,left:false,right:false };
        let vx = (ri.right?1:0) - (ri.left?1:0);
        let vy = (ri.down?1:0) - (ri.up?1:0);
        if (!enemy.dashActive) {
            if (vx || vy) {
                // Axis-separated movement to allow smooth sliding along obstacle surfaces
                let norm = Math.hypot(vx, vy);
                vx = norm ? (vx / norm) : 0; 
                vy = norm ? (vy / norm) : 0;
                const speed = enemy.speed;
                // Move X, resolve collisions on X only
                const oldX = enemy.x;
                enemy.x += vx * speed * dt;
                enemy.x = clamp(enemy.x, enemy.radius, window.CANVAS_W - enemy.radius);
                for (let o of obstacles) {
                    if (o.circleCollide(enemy.x, enemy.y, enemy.radius)) { enemy.x = oldX; break; }
                }
                // Move Y, resolve collisions on Y only
                const oldY = enemy.y;
                enemy.y += vy * speed * dt;
                enemy.y = clamp(enemy.y, enemy.radius, CANVAS_H - enemy.radius);
                for (let o of obstacles) {
                    if (o.circleCollide(enemy.x, enemy.y, enemy.radius)) { enemy.y = oldY; break; }
                }
            }
        }
        // If enemy is currently dashing, move and resolve collisions (host authoritative)
        if (enemy.dashActive) {
            let dashSet = getDashSettings(enemy);
            if (isTeledashEnabled(enemy)) {
                const blockers = { obstacles, others: [player] };
                const aimProvider = () => ({
                    x: (NET.remoteInput && typeof NET.remoteInput.aimX === 'number') ? NET.remoteInput.aimX : player.x,
                    y: (NET.remoteInput && typeof NET.remoteInput.aimY === 'number') ? NET.remoteInput.aimY : player.y
                });
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
        // Remote dash intent processed once per input sequence to avoid double-firing when cooldown finishes
        if (NET.remoteDashReqSeq && NET.remoteDashReqSeq > NET.lastProcessedRemoteDashSeq && enemy.dash && !enemy.dashActive && enemy.dashCooldown <= 0) {
            // If the remote (joiner) is currently moving, dash in that movement direction so dash follows movement
            // Otherwise fallback to aim-based dash (toward cursor) as before.
            let dir = { x: 0, y: 0 };
            if (vx || vy) {
                // use movement vector from remote input
                let norm = Math.hypot(vx, vy) || 1;
                dir.x = vx / norm; dir.y = vy / norm;
                let dashSet = getDashSettings(enemy);
                // Host should show the remote player's warmup ring for mutual visibility
                beginDash(enemy, dir, dashSet, { showWarmup: true });
            } else {
                // trigger dash using direction toward aim (cursor) when stationary
                let dx = (ri.aimX||player.x) - enemy.x;
                let dy = (ri.aimY||player.y) - enemy.y;
                let norm = Math.hypot(dx, dy) || 1;
                dir = { x: dx/norm, y: dy/norm };
                let dashSet = getDashSettings(enemy);
                // Host-side dash for remote: show the remote's warmup ring for mutual visibility
                beginDash(enemy, dir, dashSet, { lockedAim: { x: ri.aimX || player.x, y: ri.aimY || player.y }, showWarmup: true });
            }
            NET.lastProcessedRemoteDashSeq = NET.remoteDashReqSeq;
            NET.remoteDashReqSeq = 0;
        }
        // Always tick enemy shoot timer on host
        enemy.timeSinceShot += dt;
        // Remote shoot intent: only fire if remote input currently indicates shoot is held
        if (NET.remoteShootQueued && enemy.timeSinceShot >= enemy.shootInterval) {
            // Only proceed if the remote input currently wants to shoot (holding), otherwise drop the queued request
            const remoteWantsShoot = !!(NET.remoteInput && NET.remoteInput.shoot);
            if (remoteWantsShoot) {
                // Use joiner's aim coordinates (from remote input) if available
                let aimX = (ri && typeof ri.aimX === 'number') ? ri.aimX : player.x;
                let aimY = (ri && typeof ri.aimY === 'number') ? ri.aimY : player.y;
                let target = { x: aimX, y: aimY };
                enemy.shootToward(target, bullets);
                // tag bullets with ids (host)
                for (let i = bullets.length-1; i >= 0; i--) {
                    if (bullets[i].owner === enemy && !bullets[i].id) NET.tagBullet(bullets[i]);
                }
                enemy.timeSinceShot = 0;
                // If the remote is still holding, keep remoteShootQueued true so subsequent shots fire as cooldown completes
                // Otherwise clear the queued flag to avoid delayed firing
                if (!remoteWantsShoot) NET.remoteShootQueued = false;
            } else {
                NET.remoteShootQueued = false;
            }
        }
        // Clear transient flags so future presses can re-queue
        NET.remoteInput.shoot = false; NET.remoteInput.dash = false;
    } else {
        // Joiner: suppress local enemy AI entirely; enemy state comes from snapshots
        // No movement/AI here
    }
    // Check if blue AI is controlling player to avoid double increment
    const blueAIActive = !!(NET.connected && NET.role === 'host' && worldMasterEnabled && !enemySuppressed && 
        ((worldMasterPlayerIndex === 0) || (worldMasterPlayerIndex === 1)));
    if (simulateLocally && !blueAIActive) player.timeSinceShot += dt;
    if (simulateLocally && !blueAIActive && player.shootQueued && player.timeSinceShot >= player.shootInterval) {
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
                window.ai1 = new Player(false, "#ff5a5a", window.CANVAS_W/3, CANVAS_H/2);
                window.ai1.displayName = "AI 1";
            }
            if (!window.ai2) {
                window.ai2 = new Player(false, "#65c6ff", 2*window.CANVAS_W/3, CANVAS_H/2);
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
            enemy.timeSinceShot += dt;
            let distToPlayer = dist(enemy.x, enemy.y, player.x, player.y);
            let canSeePlayer = hasLineOfSight(enemy.x, enemy.y, player.x, player.y, obstacles);
            let canShootDespiteBlock = enemy.pierce || enemy.obliterator;
            if (
                enemy.timeSinceShot >= enemy.shootInterval &&
                (canSeePlayer || canShootDespiteBlock) &&
                distToPlayer > 125 && distToPlayer < 430
            ) {
                let target = { x: player.x, y: player.y };
                enemy.shootToward(target, bullets);
                enemy.timeSinceShot = 0;
            }
            if (!enemy.dashActive) {
                if (typeof enemy._strafePhase === 'undefined') enemy._strafePhase = Math.random() * Math.PI * 2;
                if (typeof enemy._strafeSwitch === 'undefined') enemy._strafeSwitch = (Math.random() * 1.4) + 0.6;
                enemy._strafeSwitch -= dt;
                if (enemy._strafeSwitch <= 0) {
                    enemy._strafeSwitch = (Math.random() * 1.6) + 0.6;
                    enemy._strafePhase += Math.PI;
                }
                const IDEAL_DIST = 240;
                const BAND = 36;
                let dx = player.x - enemy.x, dy = player.y - enemy.y;
                let r = Math.hypot(dx, dy) || 1;
                let radial = 0;
                if (r > IDEAL_DIST + BAND) radial = 1;
                else if (r < IDEAL_DIST - BAND) radial = -1;
                let rx = dx / r, ry = dy / r;
                enemy._strafePhase += dt * (0.9 + Math.random() * 0.8);
                let strafeDir = Math.sign(Math.sin(enemy._strafePhase)) || 1;
                let perpX = -ry * strafeDir;
                let perpY = rx * strafeDir;
                let distFactor = Math.max(0, 1 - Math.abs(r - IDEAL_DIST) / (IDEAL_DIST));
                let strafeAmp = lerp(0.35, 0.9, distFactor);
                let mvx = (radial * rx) + (perpX * strafeAmp);
                let mvy = (radial * ry) + (perpY * strafeAmp);
                let mlen = Math.hypot(mvx, mvy) || 1;
                mvx /= mlen; mvy /= mlen;
                let speed = enemy.speed;
                let oldx = enemy.x, oldy = enemy.y;
                enemy.x += mvx * speed * dt;
                enemy.y += mvy * speed * dt;
                enemy.x = clamp(enemy.x, enemy.radius, window.CANVAS_W-enemy.radius);
                enemy.y = clamp(enemy.y, enemy.radius, CANVAS_H-enemy.radius);
                for (let o of obstacles) {
                    if (o.circleCollide(enemy.x, enemy.y, enemy.radius)) { enemy.x = oldx; enemy.y = oldy; break; }
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
        // On host, steer enemy bullets (joiner) toward joiner's aim if they have Shot Controller
        if (NET.connected && NET.role === 'host' && NET.remoteInput && typeof NET.remoteInput.aimX === 'number' && typeof NET.remoteInput.aimY === 'number') {
            for (let b of bullets) {
                if (b.active && b.owner === enemy && b.shotController && b.playerControlActive) {
                    let dx = NET.remoteInput.aimX - b.x;
                    let dy = NET.remoteInput.aimY - b.y;
                    let distToCursor = Math.hypot(dx, dy);
                    if (distToCursor > 2) {
                        let steerAngle = Math.atan2(dy, dx);
                        // Smoothly steer toward cursor (limit turn rate for control)
                        let turnRate = 0.13; // radians per frame
                        let da = steerAngle - b.angle;
                        // Wrap angle to [-PI, PI]
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
        }
    } else {
        const s = 24; // bullet smoothing rate (snappier than players)
        const t = Math.max(0, Math.min(1, s * dt));
        for (let b of bullets) {
            if (!b.active) continue;
            // If this bullet is locally controlled (host or joiner), simulate it locally
            if (b.isLocalPlayerBullet) {
                try { b.update(dt); } catch (e) { /* ignore update errors to avoid crash */ }
                continue;
            }
            // Otherwise, smooth position/angle from snapshot
            const tx = (typeof b.targetX === 'number') ? b.targetX : b.x;
            const ty = (typeof b.targetY === 'number') ? b.targetY : b.y;
            const ta = (typeof b.targetAngle === 'number') ? b.targetAngle : b.angle;
            b.x = lerp(b.x, tx, t);
            b.y = lerp(b.y, ty, t);
            b.angle = lerpAngle(b.angle, ta, t);
            // Optionally, smooth angle as well (if needed)
        }
    }
    for (let o of obstacles) o.update(dt);
    // Always update explosion visuals. Only apply damage/chunk updates on the authoritative side (host or single-player).
    const explosionPlayers = [player].concat(enemySuppressed ? [] : [enemy]);
    const explosionHealers = (healersActive && healers.length) ? healers.filter(h => h && h.active) : [];
    for (let e of explosions) {
        if (!e.done) e.update(dt, obstacles, explosionPlayers, simulateLocally, explosionHealers);
    }
    explosions = explosions.filter(e => !e.done);


    // Bullet collision and effects (host only)
    if (simulateLocally) for (let b of bullets) {
        if (!b.active) continue;
        let victim = null;
        if (b.owner === player) {
            victim = activeEnemy ? enemy : null;
        } else {
            victim = player;
        }
        let hit = false;
        if (victim && dist(b.x, b.y, victim.x, victim.y) < b.radius + victim.radius) {
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
                    }
                }
                b.active = false;
                hit = true;
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
                            // no bounces left -> deactivate
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
                            // no bounces left -> behave as before
                            b.active = false;
                            break;
                        }
                    }
                }
            }
        }
    }
    bullets = bullets.filter(b => b.active);

    [player, enemy].forEach(p => {
        if (p.shakeTime > 0) p.shakeTime -= dt;
        if (p.damageFlash > 0) p.damageFlash -= dt;
        if (p.healthbarFlash > 0) p.healthbarFlash -= dt;
    });

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
    if (!waitingForCard && (!NET.connected || NET.role === 'host')) {
        const participants = [player, enemy];
        for (let p of participants) {
            if (p.health <= 0) {
                waitingForCard = true;
                const loser = p;
                const loserRole = (loser === player) ? 'host' : 'joiner';
                const winner = (loser === player) ? enemy : player;
                // Only increment score if not in continue loop
                let allowScore = true;
                if (window._victoryRoundsActive && window._victoryRoundsLeft === 3) {
                    // Just resumed from continue, don't increment score again
                    allowScore = false;
                }
                if (allowScore) winner.score++;
                // Check for match victory
                try {
                    if (typeof ROUNDS_TO_WIN !== 'number' || ROUNDS_TO_WIN <= 0) ROUNDS_TO_WIN = 10;
                    // Infinite continue loop logic
                    if (window._victoryRoundsActive) {
                        window._victoryRoundsLeft--;
                        if (window._victoryRoundsLeft <= 0) {
                            window._victoryRoundsActive = false;
                            showVictoryModal((winner.displayName || (winner.isPlayer ? 'Player' : 'Enemy')), NET.role === 'host');
                            return;
                        }
                    } else if (winner.score >= ROUNDS_TO_WIN) {
                        try { logDev && logDev(`[MATCH] ${winner.displayName || (winner.isPlayer ? 'Player' : 'Enemy')} wins match (${winner.score} >= ${ROUNDS_TO_WIN}). Showing victory modal.`); } catch (e) {}
                        // Show victory modal and broadcast match-end to clients; host controls restart
                        showVictoryModal((winner.displayName || (winner.isPlayer ? 'Player' : 'Enemy')), NET.role === 'host');
                        // Do not auto-restart; wait for host to press Restart
                        return;
                    }
                } catch (e) {}
                if (winner.healOnKill) {
                    const prev = winner.health;
                    winner.health = Math.min(winner.health + 25, winner.healthMax);
                    const healed = winner.health - prev;
                    if (healed > 0 && typeof winner.triggerHealingEffect === 'function') {
                        winner.triggerHealingEffect(healed);
                    }
                }
                bullets = [];
                explosions = [];
                // Clear transient world-mod entities so they don't persist across map refresh
                try {
                    infestedChunks = [];
                    // Firestorm is a transient instance (visual + damage). Clear it.
                    firestormInstance = null;
                    firestormTimer = 0;
                    // Reset spontaneous timer so immediate events don't fire right after a map load
                    spontaneousTimer = 0;
                    infestationTimer = 0;
                } catch (e) {}
                // Rebuild map for next round
                const sel = document.getElementById('saved-maps');
                if (sel && sel.value) {
                    if (sel.value === '__RANDOM__') {
                        const key = pickRandomSavedMapKey();
                        if (key) loadSavedMapByKey(key); else generateObstacles();
                    } else {
                        loadSavedMapByKey(sel.value);
                    }
                } else {
                    generateObstacles();
                }
                window.positionPlayersSafely();
                // Reset both entities and heal them to full for the new round
                try {
                    // reset preserves position; ensure both start fully healed
                    if (player && typeof player.reset === 'function') player.reset(player.x, player.y);
                    if (enemy && typeof enemy.reset === 'function') enemy.reset(enemy.x, enemy.y);
                    if (player) player.health = player.healthMax || 100;
                    if (enemy) enemy.health = enemy.healthMax || 100;
                    // Clear any ongoing burning effects so DoT doesn't carry into the next round
                    try {
                        // stop burning on players
                        if (player && player.burning) {
                            try { if (GameEvents && GameEvents.emit) GameEvents.emit('burning-stop', { entityId: player.id }); } catch (e) {}
                            player.burning = null;
                        }
                        if (enemy && enemy.burning) {
                            try { if (GameEvents && GameEvents.emit) GameEvents.emit('burning-stop', { entityId: enemy.id }); } catch (e) {}
                            enemy.burning = null;
                        }
                        // stop burning on obstacle chunks
                        if (Array.isArray(obstacles)) {
                            for (let oi = 0; oi < obstacles.length; oi++) {
                                const obs = obstacles[oi];
                                if (!obs || !obs.chunks) continue;
                                for (let ci = 0; ci < obs.chunks.length; ci++) {
                                    const chunk = obs.chunks[ci];
                                    if (chunk && chunk.burning) {
                                        try { if (GameEvents && GameEvents.emit) GameEvents.emit('burning-stop', { obstacleIndex: oi, chunkIndex: ci }); } catch (e) {}
                                        chunk.burning = null;
                                    }
                                }
                            }
                        }
                        // reset tracking set
                        try { if (typeof burningEntities !== 'undefined') burningEntities = new Set(); } catch (e) {}
                    } catch (e) {}
                } catch (e) {}
                // Broadcast round-reset (map + scores + positions)
                try {
                    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                        window.ws.send(JSON.stringify({ type:'relay', data: {
                            type:'round-reset',
                            obstacles: serializeObstacles(),
                            hostPos: { x: player.x, y: player.y, hp: player.health },
                            joinerPos: { x: enemy.x, y: enemy.y, hp: enemy.health },
                            scores: { host: (player.score||0), joiner: (enemy.score||0) }
                        }}));
                    }
                } catch (e) {}
                // Remove existing healers completely at round end and start respawn timer
                try {
                    if (healersActive && Array.isArray(healers) && healers.length) {
                        // Clear all healers from the map entirely
                        healers.length = 0;
                        // Start respawn timer for a fresh healer
                        healerPendingRespawn = true;
                        healerRespawnTimer = 0;
                        setNextHealerRespawnDelay();
                    }
                } catch (e) {}
                // Decide what selection to show
                // Always show powerup offer (5 cards) for the loser first
                let powerupPool = POWERUPS;
                try {
                    if (window.WorldMasterIntegration && typeof window.WorldMasterIntegration.getFilteredPowerups === 'function') {
                        const filtered = window.WorldMasterIntegration.getFilteredPowerups(POWERUPS) || [];
                        if (Array.isArray(filtered) && filtered.length >= 5) {
                            powerupPool = filtered;
                        } else if (Array.isArray(filtered) && filtered.length > 0 && filtered.length < 5) {
                            console.warn('[WORLDMASTER] Only', filtered.length, 'powerup cards enabled; falling back to full deck to maintain five choices.');
                            powerupPool = POWERUPS;
                        }
                    }
                } catch (e) { console.warn('[WORLDMASTER] Failed to filter powerup deck:', e); }
                if (!Array.isArray(powerupPool) || powerupPool.length < 5) {
                    powerupPool = POWERUPS;
                }
                const sampledPowerups = randomChoice(powerupPool, Math.min(5, powerupPool.length));
                const powerupChoices = sampledPowerups.map(c => (typeof c === 'string') ? c : (c && c.name)).filter(Boolean);
                if (powerupChoices.length < 5 && Array.isArray(POWERUPS)) {
                    const fallbackNames = POWERUPS.map(extra => (typeof extra === 'string') ? extra : (extra && extra.name))
                        .filter(Boolean)
                        .filter(name => !powerupChoices.includes(name));
                    for (const name of fallbackNames) {
                        powerupChoices.push(name);
                        if (powerupChoices.length >= 5) break;
                    }
                }
                if (powerupChoices.length > 0 && powerupChoices.length < 5) {
                    const filler = powerupChoices.slice();
                    let idx = 0;
                    while (powerupChoices.length < 5 && filler.length) {
                        powerupChoices.push(filler[idx % filler.length]);
                        idx++;
                    }
                }
                const powerupChooserRole = loserRole;
                logDev(`[CARD FLOW] Player died: ${loser.isPlayer ? 'player' : 'enemy'} (${loserRole}). Offering powerup choices: [${powerupChoices.join(', ')}]`);
                // Prepare pending world modifier offer if due
                roundsSinceLastModifier++;
                let pendingWorldMod = null;
                if (roundsSinceLastModifier >= worldModifierRoundInterval) {
                    roundsSinceLastModifier = 0;
                    const modChooserRole = (winner === player) ? 'host' : 'joiner';
                    // Allow Integration filter to trim mod pool if available
                    let modPool = WORLD_MODIFIERS;
                    try {
                        if (window.WorldMasterIntegration && typeof window.WorldMasterIntegration.getFilteredWorldModifiers === 'function') {
                            modPool = window.WorldMasterIntegration.getFilteredWorldModifiers(WORLD_MODIFIERS);
                        }
                    } catch (e) {}
                    if (!Array.isArray(modPool) || !modPool.length) {
                        modPool = WORLD_MODIFIERS;
                    }
                    let sampledMods = randomChoice(modPool, Math.min(3, modPool.length));
                    if (sampledMods.length < 3 && Array.isArray(WORLD_MODIFIERS)) {
                        const fallbackMods = WORLD_MODIFIERS.filter(mod => !sampledMods.includes(mod));
                        for (const mod of fallbackMods) {
                            sampledMods.push(mod);
                            if (sampledMods.length >= 3) break;
                        }
                    }
                    if (sampledMods.length > 0 && sampledMods.length < 3) {
                        const filler = sampledMods.slice();
                        let idx = 0;
                        while (sampledMods.length < 3 && filler.length) {
                            sampledMods.push(filler[idx % filler.length]);
                            idx++;
                        }
                    }
                    const modChoices = sampledMods.map(c => (typeof c === 'string') ? c : (c && c.name)).filter(Boolean);
                    while (modChoices.length < 3 && Array.isArray(WORLD_MODIFIERS)) {
                        const extra = WORLD_MODIFIERS[randInt(0, WORLD_MODIFIERS.length-1)];
                        const name = (typeof extra === 'string') ? extra : (extra && extra.name);
                        if (name && !modChoices.includes(name)) modChoices.push(name);
                    }
                    if (modChoices.length > 0 && modChoices.length < 3) {
                        const filler = modChoices.slice();
                        let idx = 0;
                        while (modChoices.length < 3 && filler.length) {
                            modChoices.push(filler[idx % filler.length]);
                            idx++;
                        }
                    }
                    // Choose a deterministic final index now on host so clients can mirror the final highlight
                    const chosenFinalIdx = randInt(0, Math.max(0, modChoices.length - 1));
                    pendingWorldMod = { choices: modChoices, chooserRole: modChooserRole, finalIdx: chosenFinalIdx };
                    try {
                        const inst = window.gameWorldMasterInstance;
                        let autopickDisabled = !!(inst && inst.autoPick === false);
                        try {
                            const apEl = document.getElementById('wm-autopick');
                            if (apEl && apEl.type === 'checkbox' && apEl.checked === false) autopickDisabled = true;
                        } catch (e2) {}
                        const chooserIsAssignedWM = (typeof worldMasterPlayerIndex === 'number') && (
                            (modChooserRole === 'host' && worldMasterPlayerIndex === 0) ||
                            (modChooserRole === 'joiner' && worldMasterPlayerIndex === 1)
                        );
                        const localSpectatorWM = (typeof window.localPlayerIndex === 'number' && window.localPlayerIndex === -1);
                        if (autopickDisabled && (chooserIsAssignedWM || localSpectatorWM)) {
                            pendingWorldMod.manual = true;
                        }
                    } catch (e) {}
                    logDev(`[CARD FLOW] World modifier due! Will offer to ${modChooserRole}: [${modChoices.join(', ')}] after powerup pick. finalIdx=${chosenFinalIdx}`);
                }
                // Patch: show powerup, then after pick, show world mod if pending
                window._pendingWorldModOffer = pendingWorldMod;
                setTimeout(() => {
                    logDev(`[CARD FLOW] Showing powerup card UI to ${powerupChooserRole} with choices: [${powerupChoices.join(', ')}]`);
                    netShowPowerupCards(powerupChoices, powerupChooserRole);
                    try {
                        // remember last offered choices locally so a declined pick can re-open the UI
                        window._lastOfferedChoices = { choices: powerupChoices, chooserRole: powerupChooserRole };
                    } catch (e) {}
                    try {
                        // Only relay powerup offers to joiners if powerups are enabled for the match
                        if (!(typeof window.setupAllowPowerups !== 'undefined' && window.setupAllowPowerups === false)) {
                            if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'card-offer', choices: powerupChoices, chooserRole: powerupChooserRole } }));
                        }
                    } catch (e) {}
                }, 700);
                break;
            }
        }
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
function draw() {
    ctx.clearRect(0, 0, window.CANVAS_W, CANVAS_H);
    if (MAP_BORDER) {
        ctx.save();
        ctx.strokeStyle = '#3d4550';
        ctx.lineWidth = 6;
        ctx.globalAlpha = 0.55;
        ctx.strokeRect(3, 3, window.CANVAS_W-6, CANVAS_H-6);
        ctx.restore();
    }
    for(let o of obstacles) o.draw(ctx);
    // Draw healer pre-spawn indicator if pending
    if (healerPendingRespawn && healerPreSpawnPos) {
        // show only during final 2 seconds before spawn
        const remaining = Math.max(0, (healerRespawnDelay || 0) - healerRespawnTimer);
        if (remaining <= 2) {
            const now = performance.now();
            const pulse = 0.8 + 0.2 * Math.sin(now / 250); // slower, gentler pulse
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const radius = 56 + 10 * Math.sin(now / 300);
            const grad = ctx.createRadialGradient(healerPreSpawnPos.x, healerPreSpawnPos.y, 8, healerPreSpawnPos.x, healerPreSpawnPos.y, radius);
            grad.addColorStop(0, `rgba(76,255,122,${0.42 * pulse})`);
            grad.addColorStop(0.7, `rgba(76,255,122,${0.16 * pulse})`);
            grad.addColorStop(1, 'rgba(76,255,122,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(healerPreSpawnPos.x, healerPreSpawnPos.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
    // Draw firestorm pre-spawn indicator if pending
    if (firestormPreSpawnPos) {
        const now = performance.now();
        const pulse = 0.8 + 0.2 * Math.sin(now / 200); // slightly faster pulse than healer
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const radius = firestormPreSpawnPos.radius * 0.6 + 16 * Math.sin(now / 280);
        const grad = ctx.createRadialGradient(firestormPreSpawnPos.x, firestormPreSpawnPos.y, 12, firestormPreSpawnPos.x, firestormPreSpawnPos.y, radius);
        grad.addColorStop(0, `rgba(255,100,50,${0.45 * pulse})`);
        grad.addColorStop(0.6, `rgba(255,150,80,${0.18 * pulse})`);
        grad.addColorStop(1, 'rgba(255,100,50,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(firestormPreSpawnPos.x, firestormPreSpawnPos.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    if (healersActive) {
        for (const healer of healers) {
            if (!healer || !healer.active) continue;
            healer.draw(ctx);
        }
    }
    for(let b of bullets) {
        ctx.save();
        ctx.globalAlpha = 0.78;
        ctx.fillStyle = b.owner.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI*2);
        ctx.fill();
        // Fireshot: draw fire particles
        if (b.fireshot) {
            for (let i = 0; i < 4; ++i) {
                let ang = Math.random() * Math.PI * 2;
                let dist = b.radius * (0.7 + Math.random() * 0.6);
                let px = b.x + Math.cos(ang) * dist;
                let py = b.y + Math.sin(ang) * dist;
                ctx.globalAlpha = 0.32 + Math.random() * 0.18;
                ctx.beginPath();
                ctx.arc(px, py, 2.2 + Math.random() * 2.2, 0, Math.PI*2);
                ctx.fillStyle = `rgba(255,${180+Math.floor(Math.random()*60)},40,0.85)`;
                ctx.shadowColor = '#ffb347';
                ctx.shadowBlur = 8;
                ctx.fill();
                ctx.shadowBlur = 0;
            }
            ctx.globalAlpha = 0.78;
        }
        if (b.explosive) {
            ctx.globalAlpha = 0.38;
            ctx.shadowColor = "#fff";
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius*1.88, 0, Math.PI*2);
            ctx.fillStyle = "#fff";
            ctx.fill();
            ctx.shadowBlur = 0;
        }
        ctx.restore();
    }
    for(let e of explosions) e.draw(ctx);
    // Draw infested chunks
    for(let ic of infestedChunks) {
        ic.draw(ctx);
    }
    // Draw firestorm (always, for both host and joiner)
    if (firestormInstance) {
        firestormInstance.draw(ctx);
    }
    const enemySuppressedNow = isEnemySuppressedForGameplay();
    // Draw local 'player' entity unless it's the blue character in WM-without-AI (host view)
    if (typeof player !== 'undefined' && player) {
        const hostIsWMNow_A = NET.connected && worldMasterEnabled && ((((worldMasterPlayerIndex|0) === 0)) || (NET.role === 'host' && window.localPlayerIndex === -1));
        const hidePlayerBlue = hostIsWMNow_A && worldMasterEnabled && enemySuppressedNow && (NET.role === 'host');
        if (!hidePlayerBlue) drawPlayer(player);
    }
    // Determine which character should be hidden based on WM mode and Enemy AI
    const hostIsWM = NET.connected && worldMasterEnabled && (worldMasterPlayerIndex === 0);
    const joinerIsWM = NET.connected && worldMasterEnabled && (worldMasterPlayerIndex === 1);
    
    // Host=blue, Joiner=red. Hide the non-WM character when Enemy AI is disabled
    const hideBlueChar = hostIsWM && enemySuppressedNow;
    const hideRedChar = joinerIsWM && enemySuppressedNow;
    
    // Draw enemy unless it should be hidden
    if (!((NET.role === 'host' && hideRedChar) || (NET.role === 'joiner' && hideBlueChar))) {
        if (typeof enemy !== 'undefined' && enemy) drawPlayer(enemy);
    }

    ctx.save();
    ctx.font = "bold 22px sans-serif";
    // Player labels: handle single-player and multiplayer mapping cleanly
    if (!NET.connected) {
        // Single-player: left is local player, right is AI/enemy
    const pName = (player && (player.displayName || NET.myName)) || (NET.myName || 'Player 1');
    const eName = (enemy && (enemy.displayName)) || (NET.peerName || 'Shot bot');
    ctx.fillStyle = "#65c6ff";
    ctx.fillText(pName + ": " + ((player && typeof player.score === 'number') ? player.score : '0'), 24, 34);
        ctx.fillStyle = "#ff5a5a";
        if (enemy) ctx.fillText(eName + ": " + ((enemy && typeof enemy.score === 'number') ? enemy.score : '0'), window.CANVAS_W - 220, 34);
    } else {
        // Multiplayer: implement exact specification for WM mode
        const isJoiner = (NET.role === 'joiner');
        const hostEntity = isJoiner ? enemy : player;
        const joinerEntity = isJoiner ? player : enemy;
        
        // Get actual names
        const hostName = (NET.role === 'host') ? (NET.myName || 'Player 1') : (NET.peerName || 'Player 1');
        const joinerName = (NET.role === 'host') ? (NET.peerName || 'Player 2') : (NET.myName || 'Player 2');
        
        // Determine WM status
        
    const hostIsWM = !!(worldMasterEnabled && (worldMasterPlayerIndex === 0));
    const joinerIsWM = !!(worldMasterEnabled && (worldMasterPlayerIndex === 1));
    const aiEnabled = !enemySuppressedNow;
        
        
        // Draw blue header (host)
        if (aiEnabled || !hostIsWM) {
            let blueLabel;
            if (hostIsWM && aiEnabled) {
                // Host is WM and AI enabled: blue becomes "Shot bot"
                blueLabel = 'Shot bot';
            } else {
                // Normal case: show host name
                blueLabel = hostName;
            }
            ctx.fillStyle = "#65c6ff";
            ctx.fillText(blueLabel + ": " + ((hostEntity && typeof hostEntity.score === 'number') ? hostEntity.score : '0'), 24, 34);
        }
        
        // Draw red header (joiner) 
        if (aiEnabled || !joinerIsWM) {
            let redLabel;
            if (joinerIsWM && aiEnabled) {
                // Joiner is WM and AI enabled: red becomes "Shot bot"
                redLabel = 'Shot bot';
            } else {
                // Normal case: show joiner name
                redLabel = joinerName;
            }
            ctx.fillStyle = "#ff5a5a";
            if (joinerEntity) ctx.fillText(redLabel + ": " + ((joinerEntity && typeof joinerEntity.score === 'number') ? joinerEntity.score : '0'), window.CANVAS_W - 220, 34);
        }
    }
    ctx.restore();

    drawCardsUI();
}

function drawPlayer(p) {
    // Prefer instance draw() when available (it renders aura/particles/heal flash)
    try {
        if (p && typeof p.draw === 'function') {
            p.draw(ctx);
        }
    } catch (e) { /* defensive: fallback to legacy drawing below if draw() errors */ }

    ctx.save();
    let shakeX = 0, shakeY = 0;
    if (p.shakeTime > 0) {
        let mag = p.shakeMag * (p.shakeTime / 0.18);
        shakeX = rand(-mag, mag);
        shakeY = rand(-mag, mag);
    }
    let cdFrac = Math.min(1, p.timeSinceShot / p.shootInterval);
    if (cdFrac < 1) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x + shakeX, p.y + shakeY, p.radius + 7, -Math.PI/2, -Math.PI/2 + Math.PI*2*cdFrac, false);
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = 0.48;
        ctx.lineWidth = 4.2;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 2;
        ctx.stroke();
        // Always draw the black base circle underneath the cooldown ring
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(p.x + shakeX, p.y + shakeY, p.radius + 7, -Math.PI/2, -Math.PI/2 + Math.PI*2*cdFrac, false);
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 2.5;
    ctx.stroke();
        ctx.restore();
    }

    // Draw dash cooldown only (do not show dash-progress while dashing)
    try {
        let dashSet = getDashSettings(p);
        let ringFrac = null;
        let ringColor = '#ffd86b';
        let ringGlow = '#ffd86b';
        let ringAlpha = 0.62;
        const isTele = isTeledashEnabled(p);
        if (isTele && p.teledashWarmupActive && (dashSet.warmup || 0) > 0) {
            const warmupTotal = Math.max(0.001, p.teledashWarmupTime || dashSet.warmup || 0);
            ringFrac = clamp((p.teledashWarmupElapsed || 0) / warmupTotal, 0, 1);
            // Use the same yellow used for dash cooldown rings so warmup matches player's dash UI
            ringColor = 'rgba(200,220,255,0.9)';
            ringGlow = 'rgba(200,220,255,0.9)';
            ringAlpha = 0.62;
        } else if ((dashSet.cooldown || 0) > 0 && p.dashCooldown > 0) {
            // Prefer authoritative max cooldown from host snapshot when available (joiner)
            const maxCd = (typeof p.dashCooldownMax === 'number' && p.dashCooldownMax > 0) ? p.dashCooldownMax : dashSet.cooldown;
            ringFrac = 1 - clamp(p.dashCooldown / maxCd, 0, 1);
        }
        if (ringFrac !== null && ringFrac > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(p.x + shakeX, p.y + shakeY, p.radius + 13, -Math.PI/2, -Math.PI/2 + Math.PI*2*ringFrac, false);
            ctx.strokeStyle = ringColor;
            ctx.globalAlpha = ringAlpha;
            ctx.lineWidth = 3.6;
            ctx.shadowColor = ringGlow;
            ctx.shadowBlur = ringColor === '#6ecbff' ? 7 : 6;
            ctx.stroke();
            ctx.restore();
        }
    } catch (e) { /* defensive: if something unexpected, ignore dash UI */ }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    const healthBarBaseW = 54;
    let w = Math.max(18, healthBarBaseW * Math.sqrt((p.healthMax || window.HEALTH_MAX) / window.HEALTH_MAX));
    let h = 10;
    let x = p.x - w/2 + shakeX, y = p.y - p.radius - 18 + shakeY;
    ctx.save();
    if (p.healthbarFlash > 0) {
        let t = Math.min(1, p.healthbarFlash / 0.45);
        ctx.shadowColor = "#fff";
        ctx.shadowBlur = 16 * t;
    }
    ctx.fillStyle = "#222";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#56ff7a";
    ctx.fillRect(x, y, w * clamp(p.health/p.healthMax, 0, 1), h);
    ctx.strokeStyle = "#000";
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
    ctx.restore();
}

// --- Powerup Cards ---
function showPowerupCards(loser) {
    cardState.active = true;
    cardState.player = loser;
    // Allow the setup UI to completely disable powerups for this match
    try {
        if (typeof window.setupAllowPowerups !== 'undefined' && window.setupAllowPowerups === false) {
            logDev('[CARD FLOW] Powerups are disabled via setup; skipping powerup offer.');
            return; // do not show powerup chooser
        }
    } catch (e) {}
    let div = document.getElementById('card-choices');
    div.innerHTML = "";
    let powerupPool = POWERUPS;
    try {
        if (window.WorldMasterIntegration && typeof window.WorldMasterIntegration.getFilteredPowerups === 'function') {
            const filtered = window.WorldMasterIntegration.getFilteredPowerups(POWERUPS) || [];
            if (Array.isArray(filtered) && filtered.length >= 5) {
                powerupPool = filtered;
            } else if (Array.isArray(filtered) && filtered.length > 0 && filtered.length < 5) {
                console.warn('[WORLDMASTER] Only', filtered.length, 'powerup cards enabled; using filtered list with fallback to fill chooser.');
                powerupPool = filtered;
            }
        }
    } catch (e) { console.warn('[WORLDMASTER] Failed to filter powerup deck for chooser:', e); }
    if (!Array.isArray(powerupPool) || !powerupPool.length) {
        powerupPool = POWERUPS;
    }
    let choices = randomChoice(powerupPool, Math.min(5, powerupPool.length));
    if (choices.length < 5 && Array.isArray(POWERUPS)) {
        const fallbackCards = POWERUPS.filter(card => !choices.includes(card));
        for (const card of fallbackCards) {
            choices.push(card);
            if (choices.length >= 5) break;
        }
    }
    if (choices.length > 0 && choices.length < 5) {
        const filler = choices.slice();
        let idx = 0;
        while (choices.length < 5 && filler.length) {
            choices.push(filler[idx % filler.length]);
            idx++;
        }
    }

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
                    cardState.active = false;
                    waitingForCard = false;
                }, 1000);
            }, 700);
        }, 1100);
    }
}

// Networked selection helpers (host composes choices and sends; clients display based on chooserRole)
function netShowPowerupCards(choiceNames, chooserRole) {
    if (matchOver) return; // suppress during match-end modal
    // Respect setup checkbox: if powerups are disabled for this match, skip showing
    try {
        if (typeof window.setupAllowPowerups !== 'undefined' && window.setupAllowPowerups === false) {
            logDev('[CARD FLOW] Powerups are disabled via setup; skipping networked powerup offer.');
            return;
        }
    } catch (e) {}
    // chooserRole: 'host' or 'joiner'
    // Map role to the correct local entity so color usage is correct on clients
    // In networked mode, use getEntityForRole which maps based on NET.role.
    // In single-player (NET undefined or not connected) map directly to local player/enemy
    let loser;
    if (typeof NET === 'undefined' || !NET.connected) {
        // chooserRole refers to the logical host/joiner; in single-player host==player, joiner==enemy
        loser = (chooserRole === 'host') ? player : enemy;
    } else {
        loser = getEntityForRole(chooserRole); // chooser is the loser of the round
    }
    // Build fake POWERUPS array subset from provided names
    const choices = choiceNames.map(n => getCardByName(n)).filter(Boolean);
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
    const isMe = (chooserRole === NET.role);
    const shouldAutoResolveAsSpectator = (() => {
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
    if (!isMe) {
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
            div.appendChild(card);
        }
        Object.assign(div.style, { display:'flex', position:'absolute', left:'50%', top:'50%', transform:'translate(-50%, -50%)', height:'320px', width:'900px' });
        div.classList.add('card-bg-visible');
        return;
    }
    // Let the chooser pick and report back to host
    cardState.active = true;
    div.innerHTML = '';
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
                            window.ws.send(JSON.stringify({ type:'relay', data:{ type:'card-apply', pickerRole: chooserRole, card: opt.name } }));
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
                            window.ws.send(JSON.stringify({ type:'relay', data:{ type:'card-pick', pickerRole: chooserRole, card: opt.name } }));
                        }
                    } catch (e) {}
                    closeLocalChooser();
                    return; // keep waitingForCard true until host applies
                }
            }
            if (!NET.connected || (NET.role === 'host' && chooserRole === 'host')) {
                try { opt.effect(loser); loser.addCard(opt.name); } catch (e) {}
                try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'card-apply', pickerRole: chooserRole, card: opt.name } })); } catch (e) {}
                div.style.display = 'none'; div.innerHTML = ''; div.classList.remove('card-bg-visible');
                cardState.active = false;
                const hadPending3 = !!window._pendingWorldModOffer;
                if (!hadPending3) waitingForCard = false;
                if (hadPending3) {
                    const offer = window._pendingWorldModOffer;
                    window._pendingWorldModOffer = null;
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
                try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'card-pick', pickerRole: chooserRole, card: opt.name } })); } catch (e) {}
                div.style.display = 'none'; div.innerHTML = ''; div.classList.remove('card-bg-visible');
                // keep waitingForCard true until apply arrives
            }
        };
        div.appendChild(card);
    }
    Object.assign(div.style, { display:'flex', position:'absolute', left:'50%', top:'50%', transform:'translate(-50%, -50%)', height:'320px', width:'900px' });
    div.classList.add('card-bg-visible');
    if (shouldAutoResolveAsSpectator) {
        const applyAutoPick = () => {
            if (!div || !div.childNodes || div.childNodes.length === 0) return;
            let idx = randInt(0, Math.max(0, div.childNodes.length - 1));
            const card = div.childNodes[idx];
            if (!card) return;
            try {
                card.classList.add('selected', 'centered');
                card.style.zIndex = 10;
                card.style.transform = 'translate(-50%, -60px) scale(1.18) rotate(0deg)';
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
            } catch (e) {}
            setTimeout(() => {
                const opt = choices[idx];
                if (!opt) return;
                try { opt.effect(loser); loser.addCard(opt.name); } catch (e) {}
                try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'card-apply', pickerRole: chooserRole, card: opt.name } })); } catch (e) {}
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

    let rowsHtml = '';
    if (topLabel1) rowsHtml += `<div class="cards-list"><span style="color:#65c6ff;font-weight:bold;">${topLabel1}</span> ${topList1}</div>`;
    // Always show the red row (joiner) even when Enemy AI is disabled; only the blue row is removed
    rowsHtml += `<div class="cards-list" style="margin-top:7px;"><span style="color:#ff5a5a;font-weight:bold;">${topLabel2}</span> ${topList2}</div>`;
    rowsHtml += `<div class="cards-list" style="margin-top:7px;"><span style="color:#8f4f8f;font-weight:bold;">${worldHeader}</span> ${buildHtmlForWorldList(worldList)}</div>`;
    cardsDiv.innerHTML = rowsHtml;
    
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
function setupOverlayInit() {
    // --- Multiplayer WebSocket logic ---
    // Make networking vars global so update() can access them reliably
    window.ws = null;
    window.wsRole = null; // 'host' or 'joiner'
    window.wsSession = null;
    window.remotePlayerState = { x: 0, y: 0, shoot: false, dash: false };
    window.lastSentAction = {};
    // Configurable server URL: prefer ?ws=, otherwise try same origin, fallback to localhost
    const paramWs = new URLSearchParams(window.location.search).get('ws');
    const defaultWs = (location.protocol === 'https:' ? 'wss://' : 'ws://') + (location.hostname || 'localhost') + ':3001';
    window.MULTIPLAYER_WS_URL = paramWs || defaultWs;

    window.sendAction = function(action) {
        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify({ type: 'relay', data: action }));
        }
    };

    function handleGameMessage(data) {
        // --- WorldMaster network protocol extension ---
        if (data && data.type === 'worldmaster-card-toggle') {
            // Sync card deck enable/disable states
            // Example: { type: 'worldmaster-card-toggle', cardType: 'mod'|'powerup', name, enabled }
            if (window.gameWorldMaster && typeof window.gameWorldMaster.syncCardDecksFromNet === 'function') {
                window.gameWorldMaster.syncCardDecksFromNet(data);
            }
            return;
        }
        if (data && data.type === 'worldmaster-control') {
            // Sync which effect is being manually controlled
            // Example: { type: 'worldmaster-control', effectName }
            if (window.gameWorldMaster && typeof window.gameWorldMaster.syncControlStateFromNet === 'function') {
                window.gameWorldMaster.syncControlStateFromNet(data);
            }
            return;
        }
        if (data && data.type === 'worldmaster-action') {
            // Sync manual effect activations (click locations)
            // Example: { type: 'worldmaster-action', effectName, x, y }
            // If a WM instance exists locally (e.g., on the WM client), use its handler first.
            // In cases where the stub exists but no instance is present (host not WM), fall back to host execution.
            let handledByWM = false;
            if (window.gameWorldMaster && typeof window.gameWorldMaster.syncActionFromNet === 'function') {
                const hadInstance = !!window.gameWorldMasterInstance;
                window.gameWorldMaster.syncActionFromNet(data);
                handledByWM = !!window.gameWorldMasterInstance && !window.gameWorldMasterInstance.isLocal;
                // Note: when host is not WM, there is no instance, so handledByWM remains false
            }
            if (!handledByWM) {
                try {
                    if (NET && NET.role === 'host') {
                        const eff = (data.effectName || '').toString();
                        const x = Number(data.x), y = Number(data.y);
                        // Execute based on effect
                        if (eff === 'Firestorm') {
                            try {
                                // Increase manual/manual-triggered Firestorm default radius from 140 to 200
                                firestormInstance = new Firestorm(x, y, 200);
                                firestormActive = true; firestormTimer = 0;
                                // Emit actual radius value (was incorrectly hardcoded to 140)
                                GameEvents.emit('firestorm-spawn', { x, y, radius: 200 });
                            } catch (e) {}
                        } else if (eff === 'Spontaneous') {
                            // Find obstacle at x,y and create explosion
                            try {
                                for (let oi = 0; oi < (obstacles||[]).length; oi++) {
                                    const o = obstacles[oi];
                                    if (!o || o.destroyed) continue;
                                    const inBox = (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h);
                                    const cx = o.x + o.w/2, cy = o.y + o.h/2;
                                    const near = Math.hypot(x - cx, y - cy) <= Math.max(o.w, o.h) * 0.8;
                                    if (inBox || near) {
                                        const cx = o.x + o.w/2, cy = o.y + o.h/2;
                                        const r = Math.max(o.w, o.h) * 1.0 + 50;
                                        const dmg = 36;
                                        explosions.push(new Explosion(cx, cy, r, '#ff6b4a', dmg, null, false));
                                        for (const c of o.chunks) { if (!c.destroyed) { const ang = Math.atan2(c.y + c.h/2 - cy, c.x + c.w/2 - cx) + (Math.random()-0.5)*0.8; const v = 200 + Math.random()*180; c.vx = Math.cos(ang)*v; c.flying = true; c.destroyed = true; c.alpha = 1; } }
                                        o.destroyed = true;
                                        try { createSyncedChunkUpdate(oi, o.chunks.map((cc, idx) => ({ i: idx, destroyed: !!cc.destroyed, flying: !!cc.flying, vx: cc.vx||0, vy: cc.vy||0, alpha: cc.alpha||1, x: cc.x, y: cc.y }))); } catch (e) {}
                                        try { createSyncedExplosion(cx, cy, r, '#ff6b4a', dmg, null); } catch (e) {}
                                        try { playExplosion(); } catch (e) {}
                                        break;
                                    }
                                }
                            } catch (e) {}
                        } else if (eff === 'Infestation') {
                            try {
                                for (let oi = 0; oi < (obstacles||[]).length; oi++) {
                                    const obs = obstacles[oi];
                                    if (!obs || !obs.chunks) continue;
                                    for (let ci = 0; ci < obs.chunks.length; ci++) {
                                        const c = obs.chunks[ci];
                                        if (!c || c.destroyed) continue;
                                        if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
                                            // Enforce max active infested chunks
                                            try {
                                                const activeCount = (infestedChunks || []).filter(ic => ic && ic.active).length;
                                                if (activeCount < 10) {
                                                    const inf = new InfestedChunk(c, obs);
                                                    infestedChunks.push(inf);
                                                }
                                            } catch (e) {
                                                const inf = new InfestedChunk(c, obs);
                                                infestedChunks.push(inf);
                                            }
                                            try {
                                                if (typeof inf !== 'undefined' && inf) {
                                                    GameEvents.emit('infestation-spawn', { obstacleIndex: oi, chunkIndex: ci, id: inf.id, x: inf.x, y: inf.y, w: inf.w, h: inf.h, hp: inf.hp });
                                                }
                                            } catch (e) {}
                                            oi = obstacles.length; break;
                                        }
                                    }
                                }
                            } catch (e) {}
                        } else if (eff === 'Dynamic' || eff === 'Dynamic-Spawn' || eff === 'Dynamic-Despawn') {
                            // Equal in/out behavior: keep total live obstacles constant
                            try {
                                const enemySuppressed = isEnemySuppressedForGameplay();
                                // Destroy helper
                                const destroyIdx = (idx) => {
                                    const o = obstacles[idx]; if (!o || o.destroyed) return false;
                                    for (const c of o.chunks) { if (!c.destroyed) { c.destroyed = true; c.flying = true; c.vx = rand(-140,140); c.vy = rand(-240,-40); c.alpha = 1; } }
                                    o.destroyed = true; try { GameEvents.emit('dynamic-despawn', { obstacleIndex: idx }); } catch (e) {}
                                    return true;
                                };
                                // Create helper
                                const makeAt = (px, py) => {
                                    // Try multiple attempts to find a non-overlapping location near px,py
                                    for (let attempt = 0; attempt < 40; attempt++) {
                                        const size = rand(OBSTACLE_MIN_SIZE, OBSTACLE_MAX_SIZE);
                                        const w = size, h = size;
                                        // jitter around desired px,py a bit
                                        const jitterX = px + rand(-40, 40);
                                        const jitterY = py + rand(-40, 40);
                                        let nx = Math.max(60, Math.min(window.CANVAS_W - 60 - w, jitterX - w/2));
                                        let ny = Math.max(60, Math.min(CANVAS_H - 60 - h, jitterY - h/2));
                                        const candidate = new Obstacle(nx, ny, w, h);
                                        const centerX = nx + w/2, centerY = ny + h/2;
                                        let safe = true;
                                        for (let k = 0; k < obstacles.length; k++) {
                                            const o2 = obstacles[k];
                                            if (!o2) continue;
                                            if (!o2.destroyed && rectsOverlap(o2, candidate)) { safe = false; break; }
                                        }
                                        if (!safe) continue;
                                        if (dist(centerX, centerY, player.x, player.y) <= 90) safe = false;
                                        if (!enemySuppressed && dist(centerX, centerY, enemy.x, enemy.y) <= 90) safe = false;
                                        if (!safe) continue;
                                        return candidate;
                                    }
                                    // Failed to find safe spot
                                    return null;
                                };
                                // Find clicked obstacle
                                let clicked = -1;
                                for (let oi = 0; oi < (obstacles||[]).length; oi++) {
                                    const o = obstacles[oi]; if (!o || o.destroyed) continue;
                                    if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) { clicked = oi; break; }
                                }
                                if (clicked >= 0) {
                                    // Remove clicked (mark chunks flying) and append a new obstacle elsewhere so flying chunks remain visible
                                    destroyIdx(clicked);
                                    const newObs = makeAt(rand(80, window.CANVAS_W-80), rand(80, CANVAS_H-80));
                                    if (newObs) {
                                        obstacles.push(newObs);
                                        try { GameEvents.emit('dynamic-spawn', { obstacleIndex: obstacles.indexOf(newObs), obstacle: { x: newObs.x, y: newObs.y, w: newObs.w, h: newObs.h } }); } catch (e) {}
                                    }
                                } else {
                                    // Empty space: spawn at click, remove a random live obstacle (mark destroyed but keep it for visuals)
                                    const liveIdx = obstacles.map((o,i)=>(!o||o.destroyed)?-1:i).filter(i=>i>=0);
                                    if (liveIdx.length > 0) {
                                        const remIdx = liveIdx[Math.floor(Math.random()*liveIdx.length)];
                                        const newObs = makeAt(x, y);
                                        if (newObs) {
                                            destroyIdx(remIdx);
                                            obstacles.push(newObs);
                                            try { GameEvents.emit('dynamic-spawn', { obstacleIndex: obstacles.indexOf(newObs), obstacle: { x: newObs.x, y: newObs.y, w: newObs.w, h: newObs.h } }); } catch (e) {}
                                        }
                                    }
                                }
                            } catch (e) {}
                        }
                    }
                } catch (e) { console.warn('Failed to execute WM action on host fallback', e); }
            }
            return;
        }
        // Remote focus from WM chooser hover (visual only)
        if (data && data.type === 'mod-focus') {
            try {
                const idx = (typeof data.idx === 'number') ? data.idx : -1;
                const div = document.getElementById('card-choices');
                if (!div) return;
                // Record forced focus on the div so clearAll respects it
                div._forceFocus = idx >= 0 ? idx : -1;
                // Clear existing hover highlights except the forced one
                for (let c of div.childNodes) {
                    try {
                        const ci = Array.prototype.indexOf.call(div.childNodes, c);
                        if (div._forceFocus >= 0 && ci === div._forceFocus) continue;
                        c.style.removeProperty('border');
                        c.style.removeProperty('box-shadow');
                        c.style.removeProperty('color');
                        const sm = c.querySelector('small'); if (sm) sm.style.removeProperty('color');
                        const hb = c.querySelector('b'); if (hb) hb.style.removeProperty('color');
                        if (c._accentClass) c.classList.remove(c._accentClass);
                        if (c._accentStyle) { c._accentStyle.remove(); c._accentStyle = null; }
                        c.style.transform = 'none';
                        c.style.zIndex = 1;
                    } catch (e) {}
                }
                if (idx >= 0 && div.childNodes[idx]) {
                    const card = div.childNodes[idx];
                    try {
                        const accent = '#a06cc7';
                        const textColor = '#b48be6';
                        card.style.transform = 'scale(1.13)';
                        card.style.zIndex = 10;
                        card.style.setProperty('border', `3px solid ${accent}`, 'important');
                        card.style.setProperty('box-shadow', `0 6px 18px ${accent}`, 'important');
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
                }
            } catch (e) {}
            return;
        }
        // Update remote player state
        if (typeof data.x === 'number' && typeof data.y === 'number') {
            remotePlayerState.x = data.x;
            remotePlayerState.y = data.y;
        }
        if (data.shoot) remotePlayerState.shoot = true;
        if (data.dash) remotePlayerState.dash = true;
    }

    // Patch ws.onmessage to use handleGameMessage
    function patchWsOnMessage() {
        if (!window.ws) return;
        window.ws.onmessage = function(event) {
            let msg;
            try { msg = JSON.parse(event.data); } catch (e) { return; }
            if (msg.type === 'error') {
                const message = (msg && msg.message) ? msg.message : 'An error occurred while communicating with the server.';
                alert(message);
                return;
            }
            if (msg.type === 'hosted') {
                if (mpSessionCode) mpSessionCode.value = msg.code;
                if (typeof setMpSessionDisplay === 'function') setMpSessionDisplay(msg.code);
                window.wsSession = msg.code;
                if (!NET.hostName) NET.hostName = NET.myName || 'Host';
                try {
                    if (typeof setLobbyPlayers === 'function') {
                        setLobbyPlayers(NET.myName || 'Player 1', NET.getJoinerName(0) || NET.peerName || 'Player 2');
                    }
                } catch (e) {}
                try { if (typeof updateCardsUI === 'function') updateCardsUI(); } catch (e) {}
                try { updateWorldMasterSetupUI(); } catch (e) {}
            } else if (msg.type === 'joined') {
                hideMpModal();
                alert('Joined session: ' + msg.code);
                window.wsSession = msg.code;
                if (mpSessionCode) mpSessionCode.value = msg.code;
                if (typeof setMpSessionDisplay === 'function') setMpSessionDisplay(msg.code);
                const idx = (typeof msg.joinerIndex === 'number' && msg.joinerIndex >= 0) ? msg.joinerIndex : null;
                NET.joinerIndex = idx;
                if (idx !== null) {
                    const localName = NET.pendingName || NET.myName || '';
                    if (localName) {
                        NET.updateJoinerName(idx, localName, { control: 'local' });
                    }
                }
                if (NET.pendingName) {
                    NET.myName = NET.pendingName;
                    NET.pendingName = '';
                }
                sendLocalDisplayName();
                try {
                    if (typeof setLobbyPlayers === 'function') {
                        const hostLabel = NET.hostName || NET.peerName || 'Host';
                        setLobbyPlayers(hostLabel, NET.myName || 'Player 2');
                    }
                } catch (e) {}
                try { if (typeof updateCardsUI === 'function') updateCardsUI(); } catch (e) {}
                try { updateWorldMasterSetupUI(); } catch (e) {}
                try { renderRosterUI(); } catch (e) {}
            } else if (msg.type === 'peer-joined') {
                hideMpModal();
                const idx = (typeof msg.joinerIndex === 'number' && msg.joinerIndex >= 0) ? msg.joinerIndex : 0;
                if (NET.role === 'host') {
                    alert('A player has joined your session!' + (Number.isInteger(idx) ? ` (Slot ${idx + 2})` : ''));
                    const existingName = NET.getJoinerName(idx);
                    const placeholder = existingName || `Joiner ${idx + 1}`;
                    NET.updateJoinerName(idx, placeholder, { control: 'remote' });
                    assignRemoteJoinerToRoster(idx, placeholder, { isPending: true });
                    sendLocalDisplayName();
                    try { broadcastRosterSnapshot(); } catch (e) {}
                } else {
                    if (idx !== NET.joinerIndex) {
                        const existingName = NET.getJoinerName(idx);
                        NET.updateJoinerName(idx, existingName || `Joiner ${idx + 1}`, { control: 'remote' });
                    }
                }
                try {
                    if (typeof setLobbyPlayers === 'function') {
                        const hostLabel = NET.role === 'host' ? (NET.myName || 'Host') : (NET.hostName || NET.peerName || 'Host');
                        const joinerLabel = NET.role === 'host' ? (NET.getJoinerName(0) || NET.peerName || 'Joiner') : (NET.myName || 'Player 2');
                        setLobbyPlayers(hostLabel, joinerLabel);
                    }
                } catch (e) {}
                try { if (typeof updateCardsUI === 'function') updateCardsUI(); } catch (e) {}
                try { updateWorldMasterSetupUI(); } catch (e) {}
                try { renderRosterUI(); } catch (e) {}
            } else if (msg.type === 'peer-left') {
                const idx = (typeof msg.joinerIndex === 'number' && msg.joinerIndex >= 0) ? msg.joinerIndex : null;
                if (idx !== null) {
                    if (NET.role === 'host') {
                        try { clearRemoteJoinerFromRoster(idx); } catch (e) {}
                        try { broadcastRosterSnapshot(); } catch (e) {}
                    }
                    NET.removeJoiner(idx);
                }
                try {
                    if (typeof setLobbyPlayers === 'function') {
                        const hostLabel = NET.role === 'host' ? (NET.myName || 'Host') : (NET.hostName || NET.peerName || 'Host');
                        const joinerLabel = NET.role === 'host' ? (NET.getJoinerName(0) || NET.peerName || 'Joiner') : (NET.myName || 'Player 2');
                        setLobbyPlayers(hostLabel, joinerLabel);
                    }
                } catch (e) {}
                try { if (typeof updateCardsUI === 'function') updateCardsUI(); } catch (e) {}
                try { updateWorldMasterSetupUI(); } catch (e) {}
                try { renderRosterUI(); } catch (e) {}
            } else if (msg.type === 'host-left') {
                if (NET.role === 'joiner') {
                    alert('Host left the session. You have been disconnected.');
                    NET.handleDisconnect('Host left the session');
                }
            } else if (msg.type === 'relay') {
                // New routing: input from joiner to host, snapshots from host to joiner
                const data = msg.data;
                try { /* removed debug relay tap logging */ } catch (e) {}
                // Unified event system: handle game-event
                if (data && data.type === 'game-event' && data.event) {
                    if (typeof GameEvents !== 'undefined' && typeof GameEvents.processEvent === 'function') {
                        GameEvents.processEvent(data.event);
                    }
                    return;
                }
                if (data && data.type === 'input' && NET.role === 'host') {
                    NET.remoteInput = { ...(data.input||{}), seq: data.seq };
                    NET.lastInputAt = NET.now();
                    // Queue one-shot actions so they trigger as soon as possible
                    if (data.input && data.input.shoot) NET.remoteShootQueued = true;
                    if (data.input && data.input.dash) {
                        // track the sequence so repeated inputs don't cause multiple queued dashes
                        NET.remoteDashReqSeq = data.seq || (NET.remoteDashReqSeq + 1);
                    }
                } else if (data && data.type === 'snapshot' && NET.role === 'joiner') {
                    NET.applySnapshot(data.snap);
                } else if (data && data.type === 'set-name') {
                    const rawName = (data.name || '').toString();
                    const name = rawName.slice(0, 32);
                    const joinerIdx = (typeof data.joinerIndex === 'number' && data.joinerIndex >= 0) ? data.joinerIndex : null;
                    if (data.role === 'host') {
                        NET.hostName = name || 'Host';
                        NET.peerName = NET.hostName;
                        if (NET.role === 'host') {
                            try { broadcastRosterSnapshot(); } catch (e) {}
                        }
                    } else if (data.role === 'joiner') {
                        if (joinerIdx !== null) {
                            NET.updateJoinerName(joinerIdx, name || `Joiner ${joinerIdx + 1}`, { control: 'remote' });
                            if (NET.role === 'host') {
                                assignRemoteJoinerToRoster(joinerIdx, name || `Joiner ${joinerIdx + 1}`);
                                try { broadcastRosterSnapshot(); } catch (e) {}
                            }
                            if (NET.role === 'joiner' && joinerIdx === NET.joinerIndex) {
                                NET.myName = name || NET.myName;
                            }
                        }
                    } else {
                        if (NET.role === 'host') {
                            const idx = joinerIdx === null ? 0 : joinerIdx;
                            NET.updateJoinerName(idx, name || `Joiner ${idx + 1}`, { control: 'remote' });
                            if (NET.role === 'host') {
                                try { broadcastRosterSnapshot(); } catch (e) {}
                            }
                        } else {
                            NET.hostName = name || NET.hostName;
                            NET.peerName = name || NET.peerName;
                            if (NET.role === 'host') {
                                try { broadcastRosterSnapshot(); } catch (e) {}
                            }
                        }
                    }
                    try {
                        if (typeof setLobbyPlayers === 'function') {
                            const hostLabel = NET.role === 'host' ? (NET.myName || 'Host') : (NET.hostName || 'Host');
                            const joinerLabel = NET.role === 'host' ? (NET.getJoinerName(0) || NET.peerName || 'Joiner') : (NET.myName || 'Player 2');
                            setLobbyPlayers(hostLabel, joinerLabel);
                        }
                    } catch (e) {}
                    try { updateCardsUI(); } catch (e) {}
                    try { updateWorldMasterSetupUI(); } catch (e) {}
                    try { renderRosterUI(); } catch (e) {}
                } else if (data && data.type === 'roster-sync' && data.roster) {
                    const rosterData = data.roster;
                    if (NET.role === 'joiner' && playerRoster && typeof playerRoster.importSerializable === 'function') {
                        try {
                            playerRoster.importSerializable(rosterData, { preserveExternalIds: true });
                        } catch (e) {}
                        try {
                            if (Array.isArray(rosterData.fighters)) {
                                rosterData.fighters.forEach((fighter) => {
                                    if (!fighter) return;
                                    const meta = fighter.metadata || {};
                                    if (typeof meta.joinerIndex === 'number') {
                                        NET.updateJoinerName(meta.joinerIndex, fighter.name || `Joiner ${meta.joinerIndex + 1}`, meta);
                                    }
                                    if (meta.isHost) {
                                        NET.hostName = fighter.name || NET.hostName;
                                        NET.peerName = NET.hostName;
                                    }
                                });
                            }
                        } catch (e) {}
                        try { renderRosterUI(); } catch (e) {}
                        try { updateWorldMasterSetupUI(); } catch (e) {}
                        try {
                            if (typeof setLobbyPlayers === 'function') {
                                const hostLabel = NET.hostName || 'Host';
                                const joinerLabel = (typeof NET.joinerIndex === 'number')
                                    ? (NET.getJoinerName(NET.joinerIndex) || NET.myName || 'Player 2')
                                    : (NET.myName || 'Player 2');
                                setLobbyPlayers(hostLabel, joinerLabel);
                            }
                        } catch (e) {}
                    }
                } else if (data && data.type === 'setup' && NET.role === 'joiner') {
                    // Update the joiner's setup UI live
                    applyIncomingSetup(data.data);
                } else if (data && data.type === 'rounds-update') {
                    // Host sent the rounds-to-win value; apply on joiner so UI and logic match
                    try {
                        const r = parseInt(data.rounds);
                        if (NET.role === 'joiner' && typeof r === 'number' && !isNaN(r) && r > 0) {
                            ROUNDS_TO_WIN = r;
                            try { const roundsInput = document.getElementById('rounds-to-win'); if (roundsInput) roundsInput.value = ROUNDS_TO_WIN; } catch (e) {}
                            try { localStorage.setItem('shape_shot_rounds', String(ROUNDS_TO_WIN)); } catch (e) {}
                        }
                    } catch (e) {}
                } else if (data && data.type === 'round-start') {
                    // Sync obstacles and critical flags before starting
                    if (NET.role === 'joiner') {
                        // If host included player names, store them for HUD
                        try {
                            if (data.names) {
                                NET.peerName = data.names && data.names.p0 ? data.names.p0 : NET.peerName;
                                // our own name may be included too
                                NET.myName = data.names && data.names.p1 ? data.names.p1 : NET.myName;
                                try { updateCardsUI(); } catch (e) {}
                                try { if (typeof setLobbyPlayers === 'function') setLobbyPlayers(NET.peerName || 'Player 1', NET.myName || 'Player 2'); } catch (e) {}
                            }
                        } catch (e) {}
                        // apply settings
                        try {
                            DYNAMIC_MODE = !!data.dynamic;
                            DYNAMIC_RATE = parseFloat(data.dynamicRate);
                            MAP_BORDER = !!data.mapBorder;
                            worldModifierRoundInterval = parseInt(data.worldModInterval||3);
                            // build obstacles
                            deserializeObstacles(data.obstacles||[]);
                        } catch (e) {}
                        // Clear any transient world-mod entities so client visuals reset with the map
                        try { infestedChunks = []; firestormInstance = null; firestormTimer = 0; spontaneousTimer = 0; infestationTimer = 0; } catch (e) {}
                        // Close any lingering card UI
                        const div = document.getElementById('card-choices');
                        if (div) { div.style.display='none'; div.innerHTML=''; div.classList.remove('card-bg-visible'); }
                        cardState.active = false; waitingForCard = false;
                        hideWaitingOverlay();
                        startGame();
                    }
                } else if (data && data.type === 'player-ready') {
                    if (NET.role === 'host') {
                        const idx = (typeof data.joinerIndex === 'number' && data.joinerIndex >= 0) ? data.joinerIndex : 0;
                        readyPlayers.add(`joiner${idx}`);
                        maybeStartRoundIfReady();
                    }
                } else if (data && data.type === 'round-reset') {
                    // Host reset after death: sync map, positions, and scores
                    try {
                        if (NET.role === 'joiner') {
                            deserializeObstacles(data.obstacles||[]);
                            if (data.hostPos) { enemy.x = data.hostPos.x; enemy.y = data.hostPos.y; enemy.health = data.hostPos.hp; }
                            if (data.joinerPos) { player.x = data.joinerPos.x; player.y = data.joinerPos.y; player.health = data.joinerPos.hp; }
                            if (data.scores) {
                                // P1 (host) shows on joiner as enemy; P2 (joiner) shows as player
                                enemy.score = data.scores.host|0;
                                player.score = data.scores.joiner|0;
                            }
                            bullets = []; explosions = []; infestedChunks = [];
                            // reset transient world-mod entities on joiner after round-reset
                            try { firestormInstance = null; firestormTimer = 0; spontaneousTimer = 0; infestationTimer = 0; } catch (e) {}
                            // Ensure any local burning states are cleared so DoT doesn't carry over
                            try {
                                if (player && player.burning) player.burning = null;
                                if (enemy && enemy.burning) enemy.burning = null;
                                if (Array.isArray(obstacles)) {
                                    for (let oi = 0; oi < obstacles.length; oi++) {
                                        const obs = obstacles[oi];
                                        if (!obs || !obs.chunks) continue;
                                        for (let ci = 0; ci < obs.chunks.length; ci++) {
                                            const chunk = obs.chunks[ci];
                                            if (chunk && chunk.burning) chunk.burning = null;
                                        }
                                    }
                                }
                                try { if (typeof burningEntities !== 'undefined') burningEntities = new Set(); } catch (e) {}
                            } catch (e) {}
                        } else {
                            // host already applied locally in update()
                        }
                        updateCardsUI();
                        // Close any lingering card UI
                        const div = document.getElementById('card-choices');
                        if (div) { div.style.display='none'; div.innerHTML=''; div.classList.remove('card-bg-visible'); }
                        cardState.active = false; waitingForCard = false;
                    } catch (e) {}
                } else if (data && data.type === 'card-offer') {
                    // Host offered powerup choices to a role: show the UI on clients (unless match has ended)
                    if (!matchOver) {
                        try { waitingForCard = true; } catch (e) {}
                        try { window._lastOfferedChoices = { choices: data.choices||[], chooserRole: data.chooserRole }; } catch (e) {}
                        setTimeout(() => netShowPowerupCards(data.choices||[], data.chooserRole), 200);
                    }
                } else if (data && data.type === 'mod-offer') {
                    if (!matchOver) {
                        try { waitingForCard = true; } catch (e) {}
                        const finalIdx = (typeof data.finalIdx === 'number') ? data.finalIdx : undefined;
                        const manual = !!data.manual;
                        setTimeout(() => netShowWorldModifierCards(data.choices||[], data.chooserRole, finalIdx, { manual }), 200);
                    }
                } else if (data && data.type === 'card-pick') {
                    // Joiner sent a pick: auto-accept and apply silently on host
                    if (NET.role === 'host') {
                        const pending = { kind: 'card', pickerRole: data.pickerRole, cardName: data.card };
                        applyHostPendingConfirm(pending);
                    } else {
                        // ignore (only host handles picks)
                    }
                } else if (data && data.type === 'mod-pick') {
                    // Joiner sent a world-mod pick: auto-accept and apply silently on host
                    if (NET.role === 'host') {
                        const pending = { kind: 'mod', chooserRole: data.chooserRole || data.pickerRole, name: data.name };
                        applyHostPendingConfirm(pending);
                    }
                } else if (data && data.type === 'card-apply') {
                    // Apply on non-host clients (host already applied during pick)
                    try {
                        if (NET.role !== 'host') {
                            const target = getEntityForRole(data.pickerRole);
                            const card = getCardByName(data.card);
                            if (target && card) {
                                try { card.effect(target); target.addCard(card.name); } catch (e) {}
                            }
                        }
                    } catch (e) {}
                    // Close any lingering card UI and clear waiting state for all clients
                    try {
                        const div = document.getElementById('card-choices');
                        if (div) { div.style.display = 'none'; div.innerHTML = ''; div.classList.remove('card-bg-visible'); }
                    } catch (e) {}
                    try { cardState.active = false; waitingForCard = false; } catch (e) {}
                } else if (data && data.type === 'card-hover') {
                    // Mirror hover state for non-chooser clients
                    try {
                        const chooserRole = data.chooserRole;
                        const idx = typeof data.idx === 'number' ? data.idx : -1;
                        const div = document.getElementById('card-choices');
                        if (div && div.childNodes && div.childNodes.length > 0) {
                            // Remove existing highlights
                            for (let n = 0; n < div.childNodes.length; ++n) {
                                const c = div.childNodes[n];
                                c.classList.remove('selected', 'centered');
                                c.style.zIndex = 1;
                                // reset transform if stored
                                try { c.style.transform = c._origTransform || c.style.transform; } catch (e) {}
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
                            if (idx >= 0 && idx < div.childNodes.length) {
                                const card = div.childNodes[idx];
                                // chooserRole color mapping: map role to the correct local entity
                                const chooserEntity = getEntityForRole(chooserRole);
                                const color = chooserEntity && chooserEntity.color ? chooserEntity.color : null;
                                try {
                                    card.classList.add('selected', 'centered');
                                    card.style.zIndex = 10;
                                    // store original transform if not present
                                    if (!card._origTransform) card._origTransform = card.style.transform;
                                    card.style.transform = 'translate(-50%, -60px) scale(1.18) rotate(0deg)';
                                    if (color) {
                                        card.style.setProperty('border', '3px solid ' + color, 'important');
                                        card.style.setProperty('box-shadow', '0 6px 18px ' + color, 'important');
                                        card.style.setProperty('color', color, 'important');
                                        const sm = card.querySelector('small'); if (sm) sm.style.setProperty('color', color, 'important');
                                        if (!card._accentClass) card._accentClass = 'card-accent-' + Math.floor(Math.random()*1000000);
                                        if (!card._accentStyle) {
                                            const styleEl = document.createElement('style');
                                            styleEl.innerText = `.${card._accentClass}::after{ background: radial-gradient(ellipse at center, ${color}33 0%, #0000 100%) !important; } .${card._accentClass}.centered::after{ background: radial-gradient(ellipse at center, ${color}55 0%, #0000 100%) !important; }`;
                                            document.head.appendChild(styleEl);
                                            card._accentStyle = styleEl;
                                        }
                                        card.classList.add(card._accentClass);
                                    }
                                } catch (e) {}
                            }
                        }
                    } catch (e) {}
                } else if (data && data.type === 'hit-anim') {
                    // Visual-only: play damage flash/shake for targetRole on joiner
                    try {
                        if (NET.role !== 'host') {
                            const tgt = getEntityForRole(data.targetRole);
                            if (tgt) {
                                tgt.shakeTime = 0.20; tgt.shakeMag = 8; tgt.damageFlash = 0.25; try { playHit(); } catch(e) {}
                            }
                        }
                    } catch (e) {}
                } else if (data && data.type === 'firestorm-spawn') {
                    // Visual-only: spawn firestorm on joiner
                    try {
                        if (NET.role !== 'host') {
                            firestormInstance = new Firestorm(data.x, data.y, data.radius);
                            firestormActive = true;
                            if (firestormTimeout) { clearTimeout(firestormTimeout); }
                            firestormTimeout = setTimeout(() => {
                                firestormActive = false;
                                firestormInstance = null;
                                firestormTimeout = null;
                            }, 10000);
                        }
                    } catch (e) {}
                } else if (data && data.type === 'firestorm-remove') {
                    // Visual-only: remove firestorm on joiner
                    try {
                        if (NET.role !== 'host') {
                            firestormInstance = null;
                        }
                    } catch (e) {}
                } else if (data && data.type === 'infestation-spawn') {
                    // Visual-only: spawn infested chunk on joiner
                    try {
                        if (NET.role !== 'host') {
                            const oi = data.obstacleIndex, ci = data.chunkIndex;
                            if (typeof oi === 'number' && typeof ci === 'number' && obstacles[oi] && obstacles[oi].chunks[ci]) {
                                try {
                                    const activeCount = (infestedChunks || []).filter(ic => ic && ic.active).length;
                                    if (activeCount < 10) {
                                        // avoid duplicates by id if provided
                                        if (typeof data.id !== 'undefined' && (infestedChunks || []).some(ic => ic && ic.id === data.id)) return;
                                        let infestedChunk = new InfestedChunk(obstacles[oi].chunks[ci], obstacles[oi]);
                                        infestedChunk.id = data.id || infestedChunk.id;
                                        infestedChunks.push(infestedChunk);
                                    }
                                } catch (e) {
                                    let infestedChunk = new InfestedChunk(obstacles[oi].chunks[ci], obstacles[oi]);
                                    infestedChunk.id = data.id || infestedChunk.id;
                                    infestedChunks.push(infestedChunk);
                                }
                            }
                        }
                    } catch (e) {}
                // Visual-only: play damage flash/shake for targetRole on joiner
                } else if (data && data.type === 'hit-anim') {
                    try {
                        if (NET.role !== 'host') {
                            const tgt = getEntityForRole(data.targetRole);
                            if (tgt) {
                                tgt.shakeTime = 0.20; tgt.shakeMag = 8; tgt.damageFlash = 0.25; try { playHit(); } catch(e) {}
                            }
                        }
                    } catch (e) {}
                        } else if (data && data.type === 'explosion') {
                            // Visual-only explosion sent from host: recreate locally on joiner
                            try {
                                if (NET.role !== 'host') {
                                    const ex = new Explosion(data.x, data.y, data.radius || window.EXPLOSION_BASE_RADIUS, data.color || '#ffffff', data.damage || 0, null, !!data.obl);
                                    explosions.push(ex);
                                    try { playExplosion(); } catch (e) {}
                                }
                            } catch (e) {}
                    } else if (data && data.type === 'chunks-update') {
                        // Visual-only chunk updates from host: apply to local obstacles if possible
                        try {
                            if (NET.role !== 'host') {
                                const idx = data.obstacleIndex;
                                if (typeof idx === 'number' && obstacles && obstacles[idx]) {
                                    const obs = obstacles[idx];
                                    const updates = data.updates || [];
                                    for (const u of updates) {
                                        const ci = u.i;
                                        if (typeof ci !== 'number' || !obs.chunks || !obs.chunks[ci]) continue;
                                        const cc = obs.chunks[ci];
                                            cc.destroyed = !!u.destroyed;
                                            cc.flying = !!u.flying;
                                            cc.vx = u.vx || 0; cc.vy = u.vy || 0; cc.alpha = (typeof u.alpha === 'number') ? u.alpha : cc.alpha;
                                            // Burning field: if provided, set burning timer/duration; otherwise preserve existing
                                            if (u.burning) {
                                                cc.burning = { time: 0, duration: u.burning.duration };
                                            }
                                        // position sync if provided
                                        if (typeof u.x === 'number') cc.x = u.x; if (typeof u.y === 'number') cc.y = u.y;
                                    }
                                    // Recompute obstacle destroyed state in case all chunks are removed
                                    try {
                                        obs.destroyed = obs.chunks.every(c => !!c.destroyed);
                                    } catch (e) {}
                                }
                            }
                        } catch (e) {}
                } else if (data && data.type === 'mod-pick') {
                    // Only host should authoritatively apply then broadcast
                    if (NET.role === 'host') {
                        const name = data.name;
                        applyWorldModifierByName(name);
                        // Close host UI and clear waiting state immediately
                        try {
                            const div = document.getElementById('card-choices');
                            if (div) { div.style.display = 'none'; div.innerHTML = ''; div.classList.remove('card-bg-visible'); }
                        } catch (e) {}
                        try { cardState.active = false; waitingForCard = false; } catch (e) {}
                        try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'mod-apply', name } })); } catch (e) {}
                    }
                } else if (data && data.type === 'mod-apply') {
                    // Apply on non-host clients (host already applied)
                    if (NET.role !== 'host') applyWorldModifierByName(data.name);
                    const div = document.getElementById('card-choices');
                    if (div) { div.style.display='none'; div.innerHTML=''; div.classList.remove('card-bg-visible'); }
                    cardState.active = false; waitingForCard = false;
                } else if (data && data.type === 'match-end') {
                    // Show victory modal on clients
                    try { if (NET.role !== 'host') showVictoryModal(data.winner || 'Opponent', false); } catch (e) {}
                } else if (data && data.type === 'match-restart') {
                    // Host requested a restart for all clients
                    try { hideVictoryModal(); restartGame(); } catch (e) {}
                } else if (data && data.type === 'victory-vote') {
                    // Peer sent their vote
                    try {
                        const peerRole = data.role;
                        const choice = data.choice;
                        window._victoryVotes[peerRole] = choice;
                        updateVictoryModalStatus();
                        checkVictoryVotes();
                    } catch (e) {}
                } else if (data && data.type === 'victory-continue') {
                    // Host confirmed continue action
                    try {
                        hideVictoryModal();
                        window._victoryRoundsLeft = 3;
                        window._victoryRoundsActive = true;
                    } catch (e) {}
                } else if (data && data.type === 'card-decline') {
                    // Host declined the joiner's pick; clear waiting state and log
                    try { waitingForCard = false; cardState.active = false; } catch (e) {}
                    try { logDev('[CARD FLOW] Host declined the pick.'); } catch (e) {}
                    // Optionally, if we stored last offered choices, re-open UI for the chooser
                    try {
                        if (window._lastOfferedChoices && Array.isArray(window._lastOfferedChoices.choices) && window._lastOfferedChoices.chooserRole === NET.role) {
                            // reopen the choices for the chooser
                            setTimeout(() => netShowPowerupCards(window._lastOfferedChoices.choices, window._lastOfferedChoices.chooserRole), 250);
                        }
                    } catch (e) {}
                } else {
                    // fallback to previous handler if any simple sync message comes through
                    handleGameMessage(data);
                }
            }
        };
    }

    // Host confirm overlay helpers
    function showHostConfirmOverlay(text) {
        try {
            const overlay = document.getElementById('host-confirm-overlay');
            const txt = document.getElementById('host-confirm-text');
            if (txt) txt.innerText = text || 'Remote player selected an option';
            if (overlay) overlay.style.display = 'block';
        } catch (e) {}
    }
    function hideHostConfirmOverlay() {
        try { const overlay = document.getElementById('host-confirm-overlay'); if (overlay) overlay.style.display = 'none'; } catch (e) {}
        try { window._pendingHostConfirm = null; } catch (e) {}
    }

    // Apply a pending host confirmation immediately (same logic as clicking the host Accept button)
    function applyHostPendingConfirm(pending) {
        try {
            if (!pending) return;
            if (pending.kind === 'card') {
                const target = getEntityForRole(pending.pickerRole);
                const card = getCardByName(pending.cardName);
                if (target && card) {
                    try { card.effect(target); target.addCard(card.name); } catch (e) {}
                }
                // Broadcast applied so clients close UI
                try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'card-apply', pickerRole: pending.pickerRole, card: pending.cardName } })); } catch (e) {}
                // Ensure host UI closes as well
                try { const div = document.getElementById('card-choices'); if (div) { div.style.display='none'; div.innerHTML=''; div.classList.remove('card-bg-visible'); } } catch (e) {}
                // If there was a pending world modifier offer queued for this round, show it now on host and broadcast to joiner
                try {
                    if (window._pendingWorldModOffer) {
                        const offer = window._pendingWorldModOffer;
                        window._pendingWorldModOffer = null;
                        try { waitingForCard = true; } catch (e) {}
                        try { netShowWorldModifierCards(offer.choices, offer.chooserRole, offer.finalIdx, offer); } catch (e) {}
                        try {
                            if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'mod-offer', choices: offer.choices, chooserRole: offer.chooserRole, finalIdx: offer.finalIdx, manual: !!offer.manual } }));
                        } catch (e) {}
                    }
                } catch (e) {}
            } else if (pending.kind === 'mod') {
                const name = pending.name;
                try { applyWorldModifierByName(name); } catch (e) {}
                try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'mod-apply', name } })); } catch (e) {}
            }
            try { cardState.active = false; waitingForCard = false; } catch (e) {}
            try { window._pendingHostConfirm = null; } catch (e) {}
        } catch (err) { console.warn('applyHostPendingConfirm error', err); }
    }

    // Wire host confirm buttons (accept/decline)
    try {
        const accept = document.getElementById('host-confirm-accept');
        const decline = document.getElementById('host-confirm-decline');
        if (accept) accept.addEventListener('click', () => {
            const pending = window._pendingHostConfirm;
            hideHostConfirmOverlay();
            if (!pending) return;
            if (pending.kind === 'card') {
                const target = getEntityForRole(pending.pickerRole);
                const card = getCardByName(pending.cardName);
                if (target && card) {
                    try { card.effect(target); target.addCard(card.name); } catch (e) {}
                }
                // Broadcast applied so clients close UI
                try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'card-apply', pickerRole: pending.pickerRole, card: pending.cardName } })); } catch (e) {}
                // Ensure host UI closes as well
                try { const div = document.getElementById('card-choices'); if (div) { div.style.display='none'; div.innerHTML=''; div.classList.remove('card-bg-visible'); } } catch (e) {}
                // If there was a pending world modifier offer queued for this round, show it now on host and broadcast to joiner
                try {
                    if (window._pendingWorldModOffer) {
                        const offer = window._pendingWorldModOffer;
                        window._pendingWorldModOffer = null;
                        try { waitingForCard = true; } catch (e) {}
                        try { netShowWorldModifierCards(offer.choices, offer.chooserRole, offer.finalIdx, offer); } catch (e) {}
                        try {
                            if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'mod-offer', choices: offer.choices, chooserRole: offer.chooserRole, finalIdx: offer.finalIdx, manual: !!offer.manual } }));
                        } catch (e) {}
                    }
                } catch (e) {}
            } else if (pending.kind === 'mod') {
                const name = pending.name;
                try { applyWorldModifierByName(name); } catch (e) {}
                try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'mod-apply', name } })); } catch (e) {}
            }
            try { cardState.active = false; waitingForCard = false; } catch (e) {}
            window._pendingHostConfirm = null;
        });
        if (decline) decline.addEventListener('click', () => {
            const pending = window._pendingHostConfirm;
            hideHostConfirmOverlay();
            if (!pending) return;
            // Notify joiner the pick was declined so they can resume (optional)
            try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'card-decline', pickerRole: pending.pickerRole, kind: pending.kind, name: pending.cardName || pending.name } })); } catch (e) {}
            try { cardState.active = false; waitingForCard = false; } catch (e) {}
            window._pendingHostConfirm = null;
        });
    } catch (e) {}

    // Additional incoming visual-only messages handled for joiners
    // We'll add these handlers in the same onmessage processing above by observing data.type 'hit-anim' and 'chunks-update'

    // Reconnect button helper: create DOM element if missing and show/hide
    function ensureReconnectButton() {
        let btn = document.getElementById('mp-reconnect-btn');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'mp-reconnect-btn';
            btn.innerText = 'Reconnect';
            btn.style.position = 'fixed';
            btn.style.right = '18px';
            btn.style.bottom = '18px';
            btn.style.zIndex = 9999;
            btn.style.padding = '10px 14px';
            btn.style.background = '#2f8bff';
            btn.style.color = '#fff';
            btn.style.border = 'none';
            btn.style.borderRadius = '8px';
            btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.35)';
            btn.style.display = 'none';
            btn.onclick = function() {
                // Try reconnect using previously selected session/role
                if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                    btn.style.display = 'none';
                    return;
                }
                const role = window.wsRole || NET.role || 'host';
                const code = window.wsSession || (document.getElementById('mp-session-code') ? document.getElementById('mp-session-code').value : '') || '';
                connectWebSocket(role, code);
                btn.innerText = 'Reconnecting...';
                setTimeout(() => { btn.innerText = 'Reconnect'; }, 4000);
            };
            document.body.appendChild(btn);
        }
        return btn;
    }

    function showReconnectButton() { const b = ensureReconnectButton(); b.style.display = 'block'; }
    function hideReconnectButton() { const b = ensureReconnectButton(); b.style.display = 'none'; b.innerText = 'Reconnect'; }

    // Patch after each connect
    let oldConnectWebSocket = null;
    if (typeof connectWebSocket === 'function') oldConnectWebSocket = connectWebSocket;
    // Helper to normalize user input: allow full invite URLs or plain codes
    function normalizeJoinCode(input) {
        if (!input) return '';
        const trimmed = input.trim();
        try {
            // If it's a URL, parse the ?join param
            const url = new URL(trimmed);
            const fromParam = url.searchParams.get('join');
            if (fromParam) return fromParam.trim().toUpperCase();
        } catch (e) { /* not a URL */ }
        // Otherwise just strip non-alphanumerics and uppercase
        return trimmed.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    }

    connectWebSocket = function(role, code) {
        if (oldConnectWebSocket) oldConnectWebSocket(role, code);
        else {
            if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.close();
            NET.resetSessionState();
            NET.setConnected(false);
            window.wsRole = role;
            window.wsSession = normalizeJoinCode(code);
            try {
                window.ws = new WebSocket(window.MULTIPLAYER_WS_URL);
            } catch (e) {
                alert('Could not open WebSocket: ' + e.message);
                return;
            }
            window.ws.onopen = function() {
                if (role === 'host') {
                    window.ws.send(JSON.stringify({ type: 'host', code: window.wsSession }));
                } else if (role === 'joiner') {
                    window.ws.send(JSON.stringify({ type: 'join', code: window.wsSession }));
                }
                NET.setRole(role);
                NET.setConnected(true);
                NET.joinerIndex = null;
                try { hideReconnectButton(); } catch (e) {}
                let myName = '';
                try {
                    const nameInput = document.getElementById('display-name');
                    myName = nameInput ? (nameInput.value || nameInput.placeholder || '') : '';
                } catch (e) { myName = ''; }
                if (myName) {
                    try { NET.myName = myName.toString().slice(0, 32); } catch (e) { NET.myName = myName; }
                    try { localStorage.setItem('shape_shot_display_name', NET.myName); } catch (e) {}
                } else {
                    NET.myName = myName || '';
                }
                if (role === 'host') {
                    NET.hostName = NET.myName || 'Host';
                    sendLocalDisplayName();
                } else {
                    NET.pendingName = NET.myName || '';
                }
                try {
                    if (typeof setLobbyPlayers === 'function') {
                        const hostLabel = NET.role === 'host' ? (NET.myName || 'Host') : (NET.hostName || NET.peerName || 'Host');
                        const joinerLabel = NET.role === 'host' ? (NET.getJoinerName(0) || '') : (NET.myName || '');
                        setLobbyPlayers(hostLabel, joinerLabel);
                    }
                } catch (e) {}
                try { if (typeof updateCardsUI === 'function') updateCardsUI(); } catch (e) {}
                if (role === 'host') {
                    if (player) player.color = HOST_PLAYER_COLOR;
                    if (enemy) enemy.color = getJoinerColor(0);
                } else {
                    const myJoinerIdx = Number.isInteger(NET.joinerIndex) ? NET.joinerIndex : 0;
                    if (player) player.color = getJoinerColor(myJoinerIdx);
                    if (enemy) enemy.color = HOST_PLAYER_COLOR;
                }
            };
            patchWsOnMessage();
            window.ws.onclose = function() {
                NET.handleDisconnect('Socket closed');
                try { if (typeof setMpSessionDisplay === 'function') setMpSessionDisplay(''); } catch (e) {}
            };
            window.ws.onerror = function() {
                NET.handleDisconnect('Socket error');
                try { if (typeof setMpSessionDisplay === 'function') setMpSessionDisplay(''); } catch (e) {}
            };
        }
        setTimeout(patchWsOnMessage, 200);
    };
    const overlay = document.getElementById('setup-overlay');
    const setupWrapper = document.getElementById('setup-wrapper');

    function showSetupUI() {
        if (!rosterUIBound) {
            try { bindRosterUI(); } catch (e) {}
        }
        if (setupWrapper) setupWrapper.style.display = 'flex';
        if (overlay) overlay.style.display = 'flex';
        try { ensureRosterDefaults(); } catch (e) {}
        try { renderRosterUI(); } catch (e) {}
    }

    function hideSetupUI() {
        if (overlay) overlay.style.display = 'none';
        if (setupWrapper) setupWrapper.style.display = 'none';
    }
    const densitySlider = document.getElementById('obstacle-density');
    const densityValue = document.getElementById('density-value');
    const sizeSlider = document.getElementById('obstacle-size');
    const sizeValue = document.getElementById('size-value');
    const dynamicCheckbox = document.getElementById('dynamic-mode');
    const dynamicRateRow = document.getElementById('dynamic-rate-row');
    const dynamicRateSlider = document.getElementById('dynamic-rate');
    const dynamicRateValue = document.getElementById('dynamic-rate-value');
    const mapBorderCheckbox = document.getElementById('map-border');
    // Ensure map border is checked by default on load
    if (mapBorderCheckbox) mapBorderCheckbox.checked = true;
    // The world modifier interval slider was moved into the World Master modal.
    // We'll attempt to find it in the modal when needed; keep references null for now.
    let worldModifierSlider = document.getElementById('world-modifier-interval') || null;
    let worldModifierValue = document.getElementById('world-modifier-value') || null;
    const roundsInput = document.getElementById('rounds-to-win');
    const managePowerupsBtn = document.getElementById('setup-manage-powerups');
    const manageWorldModsBtn = document.getElementById('setup-manage-mods');
    const setupEnableWorldMods = document.getElementById('setup-enable-worldmods');
    const setupEnablePowerups = document.getElementById('setup-enable-powerups');

    function getSetupDeckUI() {
        const controller = ensureGlobalDeckController();
        if (!controller) return null;
        if (window.gameWorldMasterInstance && window.gameWorldMasterInstance.ui) {
            try { controller.attachWorldMaster(window.gameWorldMasterInstance); } catch (e) {}
            return window.gameWorldMasterInstance.ui;
        }
        if (controller.ui && controller.uiSource === 'global') {
            if (controller.uiAdapter) {
                controller.uiAdapter.minWorldMods = controller.minWorldMods;
                controller.uiAdapter.minPowerups = controller.minPowerups;
            }
            return controller.ui;
        }
        if (typeof WorldMasterUI !== 'function') return null;
        const adapter = {
            minWorldMods: controller.minWorldMods,
            minPowerups: controller.minPowerups,
            availableWorldMods: controller.availableWorldMods,
            availablePowerups: controller.availablePowerups,
            autoPick: true,
            aiSelfPickPowerups: true,
            toggleWorldMod: (name, enabled) => controller.toggleWorldMod(name, enabled, {}),
            togglePowerup: (name, enabled) => controller.togglePowerup(name, enabled, {})
        };
        controller.uiAdapter = adapter;
        controller.ui = new WorldMasterUI(adapter, { attachPanel: false, attachCooldownDisplay: false, activeModsPolling: false });
        controller.uiSource = 'global';
        return controller.ui;
    }

    if (managePowerupsBtn) {
        managePowerupsBtn.onclick = () => {
            if (typeof window.setupAllowPowerups !== 'undefined' && window.setupAllowPowerups === false) return;
            const ui = getSetupDeckUI();
            if (ui && typeof ui.showPowerupDeck === 'function') ui.showPowerupDeck();
        };
    }
    if (manageWorldModsBtn) {
        manageWorldModsBtn.onclick = () => {
            if (typeof window.setupAllowWorldMods !== 'undefined' && window.setupAllowWorldMods === false) return;
            const ui = getSetupDeckUI();
            if (ui && typeof ui.showWorldModDeck === 'function') ui.showWorldModDeck();
        };
    }
    // Initialize global flags for setup-enabled features (default true)
    try {
        window.setupAllowWorldMods = !(setupEnableWorldMods && setupEnableWorldMods.type === 'checkbox' && setupEnableWorldMods.checked === false);
    } catch (e) { window.setupAllowWorldMods = true; }
    try {
        window.setupAllowPowerups = !(setupEnablePowerups && setupEnablePowerups.type === 'checkbox' && setupEnablePowerups.checked === false);
    } catch (e) { window.setupAllowPowerups = true; }
    // Reflect initial disabled state on the manage buttons
    try {
        const modsBtn = document.getElementById('setup-manage-mods');
        const pupsBtn = document.getElementById('setup-manage-powerups');
        if (modsBtn) {
            if (!window.setupAllowWorldMods) modsBtn.classList.add('disabled'); else modsBtn.classList.remove('disabled');
        }
        if (pupsBtn) {
            if (!window.setupAllowPowerups) pupsBtn.classList.add('disabled'); else pupsBtn.classList.remove('disabled');
        }
    } catch (e) {}
    if (setupEnableWorldMods) setupEnableWorldMods.onchange = () => {
        window.setupAllowWorldMods = !!setupEnableWorldMods.checked;
        try { const modsBtn = document.getElementById('setup-manage-mods'); if (modsBtn) { if (!window.setupAllowWorldMods) modsBtn.classList.add('disabled'); else modsBtn.classList.remove('disabled'); } } catch (e) {}
    };
    if (setupEnablePowerups) setupEnablePowerups.onchange = () => {
        window.setupAllowPowerups = !!setupEnablePowerups.checked;
        try { const pupsBtn = document.getElementById('setup-manage-powerups'); if (pupsBtn) { if (!window.setupAllowPowerups) pupsBtn.classList.add('disabled'); else pupsBtn.classList.remove('disabled'); } } catch (e) {}
    };
    
    densitySlider.oninput = () => { densityValue.textContent = densitySlider.value; };
    sizeSlider.oninput = () => { sizeValue.textContent = sizeSlider.value; };
    dynamicCheckbox.onchange = () => {
        dynamicRateRow.style.display = dynamicCheckbox.checked ? 'flex' : 'none';
    };
    dynamicRateSlider.oninput = () => {
        dynamicRateValue.textContent = parseFloat(dynamicRateSlider.value).toFixed(2);
    };
    // If the setup slider exists (fallback), wire its display update. Otherwise, the modal will handle showing the value.
    try {
        if (worldModifierSlider && worldModifierValue) {
            worldModifierSlider.oninput = () => { worldModifierValue.textContent = worldModifierSlider.value; };
        }
    } catch (e) {}
    // If host edits rounds input live, broadcast the change so joiner UI stays in sync
    try {
        if (roundsInput) {
            roundsInput.onchange = roundsInput.oninput = function() {
                try {
                    const v = parseInt(roundsInput.value);
                    if (NET.role === 'host' && NET.connected && window.ws && window.ws.readyState === WebSocket.OPEN && typeof v === 'number' && !isNaN(v) && v > 0) {
                        window.ws.send(JSON.stringify({ type: 'relay', data: { type: 'rounds-update', rounds: v } }));
                    }
                } catch (e) {}
            };
        }
    } catch (e) {}
    document.getElementById('start-btn').onclick = () => {
        OBSTACLE_COUNT = parseInt(densitySlider.value);
        let size = parseInt(sizeSlider.value);
        OBSTACLE_MIN_SIZE = Math.round(size * 0.6);
        OBSTACLE_MAX_SIZE = size;
        DYNAMIC_MODE = !!dynamicCheckbox.checked;
        DYNAMIC_RATE = parseFloat(dynamicRateSlider.value);
        MAP_BORDER = !!mapBorderCheckbox.checked;
        // Read world modifier interval from the modal slider if present, otherwise use the setup slider fallback
        try {
            const modalSlider = document.getElementById('wm-world-mod-interval');
            if (modalSlider && modalSlider.type === 'range') {
                worldModifierRoundInterval = parseInt(modalSlider.value);
            } else if (worldModifierSlider) {
                worldModifierRoundInterval = parseInt(worldModifierSlider.value);
            }
        } catch (e) {}
        // Read rounds-to-win setting
        try {
            const roundsInput = document.getElementById('rounds-to-win');
            const v = roundsInput ? parseInt(roundsInput.value) : NaN;
            if (typeof v === 'number' && !isNaN(v) && v > 0) ROUNDS_TO_WIN = v; else ROUNDS_TO_WIN = 10;
    } catch (e) { ROUNDS_TO_WIN = 10; }
        try { localStorage.setItem('shape_shot_rounds', String(ROUNDS_TO_WIN)); } catch (e) {}
        // If we're host, inform joiner of the chosen rounds so they stay in sync
        try {
            if (NET.role === 'host' && NET.connected && window.ws && window.ws.readyState === WebSocket.OPEN) {
                window.ws.send(JSON.stringify({ type: 'relay', data: { type: 'rounds-update', rounds: ROUNDS_TO_WIN } }));
            }
        } catch (e) {}
        // Read enemy AI checkbox (on/off)
        try {
            const enemyAiCheckbox = document.getElementById('enemy-ai');
            if (enemyAiCheckbox) {
                const enabled = !!enemyAiCheckbox.checked;
                enemyCount = enabled ? 1 : 0;
                enemyDisabled = !enabled;
            } else {
                enemyCount = 1;
                enemyDisabled = false;
            }
        } catch (e) { enemyCount = 1; enemyDisabled = false; }
    hideSetupUI();
        // Save chosen display name and populate NET.myName
        try {
            const nameInput = document.getElementById('display-name');
            const myName = nameInput ? (nameInput.value || nameInput.placeholder || '') : '';
            if (myName) {
                NET.myName = myName.toString().slice(0,32);
                try { localStorage.setItem('shape_shot_display_name', NET.myName); } catch (e) {}
                try { updateCardsUI(); } catch (e) {}
            }
        } catch (e) {}
        // If we're a joiner, inform host of our chosen name (in case we connected earlier)
        try {
            if (NET.role === 'joiner' && window.ws && window.ws.readyState === WebSocket.OPEN && NET.myName) {
                window.ws.send(JSON.stringify({ type: 'relay', data: { type: 'set-name', name: NET.myName } }));
            }
        } catch (e) {}
        // If a saved map is selected, load it into obstacles before starting
        const sel = document.getElementById('saved-maps');
        if (sel && sel.value) {
            if (sel.value === '__RANDOM__') {
                const key = pickRandomSavedMapKey();
                if (key) loadSavedMapByKey(key);
                else generateObstacles();
            } else {
                // load the selected key
                loadSavedMapByKey(sel.value);
            }
        } else if (NET.role === 'host' && NET.connected) {
            // Deterministically generate on host only, then broadcast to joiner
            generateObstacles();
        }
        // Before starting, assign players/AI and configure WorldMaster mode
        try { assignPlayersAndAI(); } catch (e) { console.warn('assignPlayersAndAI failed', e); }
        if (!NET.connected) {
            startGame();
            return;
        }
        let roundStartPayload = null;
        if (NET.role === 'host') {
            roundStartPayload = {
                type: 'round-start',
                obstacles: serializeObstacles(),
                names: {
                    p0: (NET.myName || (player && player.displayName) || 'Player 1'),
                    p1: (NET.peerName || (enemy && enemy.displayName) || 'Player 2')
                },
                dynamic: DYNAMIC_MODE,
                dynamicRate: DYNAMIC_RATE,
                mapBorder: MAP_BORDER,
                worldModInterval: worldModifierRoundInterval
            };
        }
        handleLocalReadyForStart(roundStartPayload);
        return;
    };

    // Multiplayer UI wiring
    const hostBtn = document.getElementById('host-btn');
    const joinBtn = document.getElementById('join-btn');
    const mpModal = document.getElementById('multiplayer-modal');
    const mpHostSection = document.getElementById('mp-host-section');
    const mpJoinSection = document.getElementById('mp-join-section');
    const mpCancel = document.getElementById('mp-cancel');
    const mpSessionCode = document.getElementById('mp-session-code');
    const mpSessionRow = document.getElementById('mp-session-row');
    const mpSessionLabel = document.getElementById('mp-session-label');
    const mpCopyLink = document.getElementById('mp-copy-link');
    const mpJoinCode = document.getElementById('mp-join-code');
    const mpJoinConfirm = document.getElementById('mp-join-confirm');
    const lobbyPlayersRow = document.getElementById('lobby-players');
    const lobbyHostName = document.getElementById('lobby-host-name');
    const lobbyJoinerName = document.getElementById('lobby-joiner-name');

    function hideMpModal() {
        if (mpModal) mpModal.style.display = 'none';
        if (mpHostSection) mpHostSection.style.display = 'none';
        if (mpJoinSection) mpJoinSection.style.display = 'none';
    }

    if (hostBtn) hostBtn.onclick = () => {
        if (mpModal && mpHostSection) {
            mpModal.style.display = 'flex';
            mpHostSection.style.display = 'flex';
            mpJoinSection.style.display = 'none';
            // Generate a session code (simple random 6-char alphanumeric)
            const code = Math.random().toString(36).substr(2, 6).toUpperCase();
            if (mpSessionCode) mpSessionCode.value = code;
            if (mpSessionRow && mpSessionLabel) {
                mpSessionLabel.textContent = code;
                mpSessionRow.style.display = 'block';
            }
            // show lobby players area while waiting
            try { if (lobbyPlayersRow) lobbyPlayersRow.style.display = 'block'; } catch (e) {}
            connectWebSocket('host', code);
        }
    };
    if (joinBtn) joinBtn.onclick = () => {
        if (mpModal && mpJoinSection) {
            mpModal.style.display = 'flex';
            mpHostSection.style.display = 'none';
            mpJoinSection.style.display = 'flex';
            if (mpJoinCode) {
                mpJoinCode.value = '';
                setTimeout(() => mpJoinCode.focus(), 100);
            }
        }
    };
    // Allow pressing Enter in join code input
    if (mpJoinCode) {
        mpJoinCode.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                if (mpJoinCode.value) {
                    connectWebSocket('joiner', mpJoinCode.value.trim().toUpperCase());
                }
            }
        });
    }
    // Auto-join if ?join=CODE in URL
    const urlParams = new URLSearchParams(window.location.search);
    const joinCodeFromUrl = urlParams.get('join');
    if (joinCodeFromUrl) {
        if (mpModal && mpJoinSection) {
            mpModal.style.display = 'flex';
            mpHostSection.style.display = 'none';
            mpJoinSection.style.display = 'flex';
            if (mpJoinCode) {
                mpJoinCode.value = joinCodeFromUrl.trim().toUpperCase();
                setTimeout(() => mpJoinCode.focus(), 100);
            }
        }
    }
    if (mpCancel) mpCancel.onclick = hideMpModal;
    // Escape key closes modal
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && mpModal && mpModal.style.display !== 'none') {
            hideMpModal();
        }
    });
    // Copy link button
    if (mpCopyLink) mpCopyLink.onclick = function() {
        if (mpSessionCode) {
            const url = window.location.origin + window.location.pathname + '?join=' + mpSessionCode.value;
            navigator.clipboard.writeText(url);
            mpCopyLink.innerText = 'Copied!';
            setTimeout(() => { mpCopyLink.innerText = 'Copy Link'; }, 1200);
        }
    };
    // Join confirm button (placeholder, to be wired to WebSocket logic)
    if (mpJoinConfirm) mpJoinConfirm.onclick = function() {
        if (mpJoinCode && mpJoinCode.value) {
            connectWebSocket('joiner', mpJoinCode.value);
        }
    };

    // Paste button: paste clipboard text into join code input
    const mpPasteBtn = document.getElementById('mp-paste');
    if (mpPasteBtn) {
        mpPasteBtn.addEventListener('click', async function() {
            try {
                if (navigator.clipboard && navigator.clipboard.readText) {
                    const txt = await navigator.clipboard.readText();
                    if (mpJoinCode) {
                        // Extract potential code from URL or raw text
                        let code = txt.trim();
                        // If it's a URL with ?join=CODE, extract
                        try {
                            const u = new URL(code);
                            const p = new URLSearchParams(u.search);
                            const j = p.get('join');
                            if (j) code = j;
                        } catch (e) { /* not a URL, ignore */ }
                        mpJoinCode.value = code.toUpperCase();
                        mpJoinCode.focus();
                        mpJoinCode.select();
                    }
                } else {
                    // Fallback: prompt paste
                    const txt = prompt('Paste invite code or link here:');
                    if (txt && mpJoinCode) {
                        mpJoinCode.value = txt.trim().toUpperCase();
                        mpJoinCode.focus();
                        mpJoinCode.select();
                    }
                }
            } catch (err) {
                // Graceful fallback on permission denied / error
                const txt = prompt('Paste invite code or link here:');
                if (txt && mpJoinCode) {
                    mpJoinCode.value = txt.trim().toUpperCase();
                    mpJoinCode.focus();
                    mpJoinCode.select();
                }
            }
        });
    }

    // Helper to set or clear session display when code changes
    function setMpSessionDisplay(code) {
        if (mpSessionRow && mpSessionLabel) {
            if (code && code.length) {
                mpSessionLabel.textContent = code;
                mpSessionRow.style.display = 'block';
            } else {
                mpSessionLabel.textContent = '';
                mpSessionRow.style.display = 'none';
            }
        }
    }

    // Update lobby players row with names (safe helper)
    function setLobbyPlayers(hostName, joinerName) {
        try {
            if (lobbyPlayersRow) lobbyPlayersRow.style.display = 'block';
            const defaultHost = (NET.role === 'host') ? (NET.myName || 'Player 1') : (NET.hostName || NET.peerName || 'Player 1');
            const defaultJoiner = (NET.role === 'host') ? (NET.getJoinerName(0) || NET.peerName || 'Player 2') : (NET.myName || 'Player 2');
            if (lobbyHostName) lobbyHostName.textContent = hostName || defaultHost;
            if (lobbyJoinerName) lobbyJoinerName.textContent = joinerName || defaultJoiner;
        } catch (e) {}
    }

    // Host broadcasts setup changes (sliders/toggles) to joiner
    function broadcastSetup() {
        if (NET.role !== 'host' || !window.ws || window.ws.readyState !== WebSocket.OPEN) return;
        const setup = {
            type: 'setup',
            data: {
                density: parseInt(densitySlider.value),
                size: parseInt(sizeSlider.value),
                dynamic: !!dynamicCheckbox.checked,
                dynamicRate: parseFloat(dynamicRateSlider.value),
                mapBorder: !!mapBorderCheckbox.checked,
                worldModInterval: worldModifierSlider ? parseInt(worldModifierSlider.value) : worldModifierRoundInterval,
                // Include WorldMaster mode fields
                wmEnabled: !!worldMasterEnabled,
                wmPlayerIndex: (typeof worldMasterPlayerIndex === 'number' ? worldMasterPlayerIndex : null),
                // Also include Enemy AI toggle so joiner can mirror blue AI presence when host is WM
                enemyAI: (function(){ try { const el = document.getElementById('enemy-ai'); return !!(el && el.checked); } catch(e) { return true; } })()
            }
        };
        try {
            if (playerRoster && typeof playerRoster.toSerializable === 'function') {
                setup.data.roster = playerRoster.toSerializable({ includeEntity: false });
            }
        } catch (e) {}
        window.ws.send(JSON.stringify({ type: 'relay', data: setup }));
    }
    // Also broadcast when Enemy AI is toggled; update local flags so UI can reflect immediately
    try {
        const enemyAiToggle = document.getElementById('enemy-ai');
        const onAiChange = () => {
            try {
                const enabled = !!enemyAiToggle.checked;
                enemyCount = enabled ? 1 : 0;
                enemyDisabled = !enabled;
            } catch (e) {}
            try { updateCardsUI(); } catch (e) {}
            try { broadcastSetup(); } catch (e) {}
        };
        if (enemyAiToggle) {
            enemyAiToggle.addEventListener('input', onAiChange);
            enemyAiToggle.addEventListener('change', onAiChange);
        }
    } catch (e) { /* non-fatal */ }
    [densitySlider,sizeSlider,dynamicCheckbox,dynamicRateSlider,mapBorderCheckbox,worldModifierSlider].forEach(el => {
        if (el) el.addEventListener('input', () => broadcastSetup());
        if (el) el.addEventListener('change', () => broadcastSetup());
    });

    // Apply incoming setup and preview UI for the joiner
    function applyIncomingSetup(s) {
        try {
            densitySlider.value = s.density; densityValue.textContent = densitySlider.value;
            sizeSlider.value = s.size; sizeValue.textContent = sizeSlider.value;
            dynamicCheckbox.checked = !!s.dynamic; dynamicRateRow.style.display = s.dynamic ? 'flex' : 'none';
            dynamicRateSlider.value = s.dynamicRate.toFixed(2); dynamicRateValue.textContent = parseFloat(dynamicRateSlider.value).toFixed(2);
            mapBorderCheckbox.checked = !!s.mapBorder;
            worldModifierSlider.value = s.worldModInterval; worldModifierValue.textContent = worldModifierSlider.value;
            // Mirror Enemy AI toggle from host so UI and game logic align (used for host-is-WM 2p behavior)
            if (typeof s.enemyAI !== 'undefined') {
                try {
                    const enemyAiCheckbox = document.getElementById('enemy-ai');
                    if (enemyAiCheckbox) enemyAiCheckbox.checked = !!s.enemyAI;
                    enemyCount = s.enemyAI ? 1 : 0;
                    enemyDisabled = !s.enemyAI;
                } catch (e) { /* non-fatal */ }
            }
            // Apply WorldMaster settings from host
            if (typeof s.wmEnabled !== 'undefined') worldMasterEnabled = !!s.wmEnabled;
            if (typeof s.wmPlayerIndex !== 'undefined') worldMasterPlayerIndex = (s.wmPlayerIndex === null ? null : s.wmPlayerIndex|0);
            try { updateWorldMasterSetupUI(); } catch (e) {}
            // Re-assign local roles and configure WM instance/UI as needed
            try { assignPlayersAndAI(); } catch (e) {}
            // Apply roster snapshot from host so joiner sees accurate seating
            if (s.roster && playerRoster && typeof playerRoster.importSerializable === 'function') {
                try { playerRoster.importSerializable(s.roster, { preserveExternalIds: true }); renderRosterUI(); } catch (err) {}
            }
            // Refresh cards UI so labels/rows reflect the new setup immediately on joiner
            try { updateCardsUI(); } catch (e) {}
        } catch (e) {}
    }

    // Helper so radios can broadcast WM changes
    window.broadcastSetupWM = function() {
        try { broadcastSetup(); } catch (e) {}
    };
}

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
    // Ignore game keybinds if typing in dev console input
    const devInput = document.getElementById('dev-console-input');
    if (document.activeElement === devInput) return;
    
    // Ignore game controls if WorldMaster mode is active
    if (window.disablePlayerControls) {
        
        return;
    }
    
    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ' || e.code === 'Space') {
        // mark keyboard state; collectLocalInput reads keys[] and player.shootQueued may be used as fallback
        // keep player.shootQueued for legacy code paths
        player.shootQueued = true;
    }
});
window.addEventListener('keyup', e => {
    // Ignore game keybinds if typing in dev console input
    const devInput = document.getElementById('dev-console-input');
    if (document.activeElement === devInput) return;
    
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
    if (!enemy) enemy = new Player(false, "#ff5a5a", window.CANVAS_W*0.66, CANVAS_H/2);
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
            // queue a shoot action (legacy/compat path)
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
        localStorage.setItem('shape_shot_volumes', JSON.stringify({ master: masterVolume, music: musicVolume, sfx: sfxVolume, shot: shotVolume, explosion: explosionVolume, ricochet: ricochetVolume, hit: hitVolume, dash: dashVolume, burning: burningVolume }));
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
    // Map multipliers so slider value 50 represents multiplier 1.0
    if (sh) { sh.value = Math.round(shotVolume * 50); if (shv) shv.innerText = Math.round(sh.value); }
    if (ex) { ex.value = Math.round(explosionVolume * 50); if (exv) exv.innerText = Math.round(ex.value); }
    if (ric) { ric.value = Math.round(ricochetVolume * 50); if (ricv) ricv.innerText = Math.round(ric.value); }
    if (hi) { hi.value = Math.round(hitVolume * 50); if (hiv) hiv.innerText = Math.round(hi.value); }
    if (da) { da.value = Math.round(dashVolume * 50); if (dav) dav.innerText = Math.round(da.value); }
    if (bu) { bu.value = Math.round(burningVolume * 50); if (buv) buv.innerText = Math.round(bu.value); }
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
    if (hitSlider) hitSlider.addEventListener('input', e => updateHit(e.target.value));
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
        if (btnShot) btnShot.addEventListener('click', (e) => { e.stopPropagation(); try { playGunShot(); } catch (ex) {} });
        if (btnExpl) btnExpl.addEventListener('click', (e) => { e.stopPropagation(); try { playExplosion(); } catch (ex) {} });
        if (btnRic) btnRic.addEventListener('click', (e) => { e.stopPropagation(); try { playRicochet(); } catch (ex) {} });
        if (btnHit) btnHit.addEventListener('click', (e) => { e.stopPropagation(); try { playHit(); } catch (ex) {} });
        if (btnDash) btnDash.addEventListener('click', (e) => { e.stopPropagation(); try { playDashWoosh(0.28, 1.0); } catch (ex) {} });
        if (btnBurning) btnBurning.addEventListener('click', (e) => { e.stopPropagation(); try { playBurning(1.0); } catch (ex) {} });
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



// --- Dev Console (fixed, always visible, global references) ---
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
