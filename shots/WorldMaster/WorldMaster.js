// WorldMaster.js - Core World Master class for Worldmaster mode
// See project instructions for full requirements

class WorldMaster {
    constructor(isLocal = true) {
        // true for single-player, false for multiplayer
        this.isLocal = isLocal;
        this.isActive = false;

        // Auto-pick toggle: when true the system can auto-choose world modifiers;
        // when false the World Master will be shown the 3-card chooser to pick manually.
        this.autoPick = true;

    // When true, the enemy AI will automatically select its own powerup cards after a round loss.
    // When false, the World Master will be presented with the chooser to decide for the AI.
    this.aiSelfPickPowerups = true;

        // Card deck management
        this.availableWorldMods = new Set(); // Initially all WORLD_MODIFIERS
        this.availablePowerups = new Set(); // Initially all POWERUPS
    this.minWorldMods = 3;
    this.minPowerups = 5;

        // Manual control system
        this.controlledEffect = null; // Currently controlled world modifier name
        this.effectCooldowns = new Map(); // Effect name -> {current: number, max: number}

        // UI reference
        this.ui = null; // Will hold WorldMasterUI instance

        // Initialize with all cards enabled and set up cooldowns
        this.initializeCardDecks();
        this.initializeCooldowns();
    }

    // Helper: get the current list of active world modifiers from the global scope
    getActiveModsList() {
        try {
            if (typeof activeWorldModifiers !== 'undefined' && Array.isArray(activeWorldModifiers)) {
                return activeWorldModifiers;
            }
        } catch (e) {}
        try {
            if (typeof window !== 'undefined' && Array.isArray(window.activeWorldModifiers)) {
                return window.activeWorldModifiers;
            }
        } catch (e) {}
        return [];
    }

    initializeCardDecks() {
        // Add all world modifier names to availableWorldMods Set
        try {
            const mods = (typeof WORLD_MODIFIERS !== 'undefined') ? WORLD_MODIFIERS : (window.WORLD_MODIFIERS || []);
            for (const mod of mods) {
                const name = (typeof mod === 'string') ? mod : mod.name;
                if (name) this.availableWorldMods.add(name);
            }
        } catch (e) {}
        // Add all powerup names to availablePowerups Set
        try {
            const pups = (typeof POWERUPS !== 'undefined') ? POWERUPS : (window.POWERUPS || []);
            for (const p of pups) {
                const name = (typeof p === 'string') ? p : p.name;
                if (name) this.availablePowerups.add(name);
            }
        } catch (e) {}
    }

    initializeCooldowns() {
        // Create cooldown entries for each world modifier with minimum values
        // Infestation: 2.0s, Spontaneous: 5.0s, Firestorm: 8.0s, Dynamic: 1.0s
        const cooldowns = {
            'Infestation': 2.0,
            'Spontaneous': 5.0,
            'Firestorm': 8.0,
            'Dynamic': 1.0
        };
        for (const [effect, max] of Object.entries(cooldowns)) {
            this.effectCooldowns.set(effect, { current: 0, max });
        }
    }

    // Card deck management methods
    toggleWorldMod(modName, enabled) {
        const hadMod = this.availableWorldMods.has(modName);
        if (enabled) {
            if (!hadMod) {
                this.availableWorldMods.add(modName);
                this.syncCardDecks();
            }
            return true;
        }
        if (!hadMod) {
            return false;
        }
        if (this.availableWorldMods.size <= this.minWorldMods) {
            if (this.ui && typeof this.ui.showCardLimitWarning === 'function') {
                this.ui.showCardLimitWarning('mods', this.minWorldMods);
            }
            return false;
        }
        this.availableWorldMods.delete(modName);
        this.syncCardDecks();
        return true;
    }

    togglePowerup(powerupName, enabled) {
        const hadPowerup = this.availablePowerups.has(powerupName);
        if (enabled) {
            if (!hadPowerup) {
                this.availablePowerups.add(powerupName);
                this.syncCardDecks();
            }
            return true;
        }
        if (!hadPowerup) {
            return false;
        }
        if (this.availablePowerups.size <= this.minPowerups) {
            if (this.ui && typeof this.ui.showCardLimitWarning === 'function') {
                this.ui.showCardLimitWarning('powerups', this.minPowerups);
            }
            return false;
        }
        this.availablePowerups.delete(powerupName);
        this.syncCardDecks();
        return true;
    }

    // Manual world effect control
    setControlledEffect(effectName, networked = true) {
        // Only allow selecting effects that are currently active via cards
        try {
            const list = this.getActiveModsList();
            const isActive = Array.isArray(list) && list.includes(effectName);
            if (!isActive) {
                return; // ignore selection of non-active effects
            }
        } catch (e) {}
        this.controlledEffect = effectName;
        // If controlling Dynamic, temporarily disable automatic dynamic mode and remember prior state
        try {
            if (effectName === 'Dynamic') {
                this._prevDynamicState = {
                    mode: typeof window.DYNAMIC_MODE !== 'undefined' ? window.DYNAMIC_MODE : false,
                    rate: typeof window.DYNAMIC_RATE !== 'undefined' ? window.DYNAMIC_RATE : 3.0,
                    timer: typeof window.dynamicTimer !== 'undefined' ? window.dynamicTimer : 0,
                    spawnNext: typeof window.dynamicSpawnNext !== 'undefined' ? window.dynamicSpawnNext : true
                };
                // Pause the game's automatic dynamic spawner by setting the global flags
                try {
                    if (typeof DYNAMIC_MODE !== 'undefined') {
                        // store direct refs to restore later
                        this._prevDynamicState._directMode = DYNAMIC_MODE;
                        DYNAMIC_MODE = false;
                    }
                    if (typeof DYNAMIC_RATE !== 'undefined') {
                        this._prevDynamicState._directRate = DYNAMIC_RATE;
                    }
                    if (typeof dynamicTimer !== 'undefined') {
                        this._prevDynamicState._directTimer = dynamicTimer;
                    }
                    if (typeof dynamicSpawnNext !== 'undefined') {
                        this._prevDynamicState._directSpawnNext = dynamicSpawnNext;
                    }
                } catch (e) {}
            }
        } catch (e) {}
        if (this.ui) this.ui.updateControlledEffect(effectName);
        if (networked) this.syncControlState();
        // Update top card badges to show selection
        try { if (typeof updateCardsUI === 'function') updateCardsUI(); } catch (e) {}
    }

    clearControlledEffect(networked = true) {
        const prev = this.controlledEffect;
        this.controlledEffect = null;
        // If releasing Dynamic, restore prior automatic state
        try {
            if (prev === 'Dynamic' && this._prevDynamicState) {
                try {
                    if (typeof DYNAMIC_MODE !== 'undefined' && typeof this._prevDynamicState._directMode !== 'undefined') DYNAMIC_MODE = !!this._prevDynamicState._directMode;
                    if (typeof DYNAMIC_RATE !== 'undefined' && typeof this._prevDynamicState._directRate !== 'undefined') DYNAMIC_RATE = this._prevDynamicState._directRate;
                    if (typeof dynamicTimer !== 'undefined' && typeof this._prevDynamicState._directTimer !== 'undefined') dynamicTimer = this._prevDynamicState._directTimer;
                    if (typeof dynamicSpawnNext !== 'undefined' && typeof this._prevDynamicState._directSpawnNext !== 'undefined') dynamicSpawnNext = !!this._prevDynamicState._directSpawnNext;
                } catch (e) {}
                this._prevDynamicState = null;
            }
        } catch (e) {}
        if (this.ui) this.ui.updateControlledEffect(null);
        if (networked) this.syncControlState();
        // Update top card badges to clear selection
        try { if (typeof updateCardsUI === 'function') updateCardsUI(); } catch (e) {}
    }

    // Handle map clicks for manual control
    handleMapClick(x, y) {
        if (!this.controlledEffect) return false;
        // Block if effect not active
        try {
            const list = this.getActiveModsList();
            if (!Array.isArray(list) || !list.includes(this.controlledEffect)) {
                return false;
            }
        } catch (e) {}
        const cooldown = this.effectCooldowns.get(this.controlledEffect);
        if (!cooldown || cooldown.current > 0) return false;
        const success = this.executeControlledEffect(x, y);
        if (success) {
            cooldown.current = cooldown.max;
        }
        return success;
    }

    executeControlledEffect(x, y) {
        switch (this.controlledEffect) {
            case 'Infestation':
                return this.manualInfestation(x, y);
            case 'Firestorm':
                return this.manualFirestorm(x, y);
            case 'Spontaneous':
                return this.manualExplosion(x, y);
            case 'Dynamic':
                return this.manualDynamic(x, y);
            case 'Dynamic-Spawn':
                return this.manualDynamic(x, y);
            case 'Dynamic-Despawn':
                return this.manualDynamic(x, y);
            default:
                return false;
        }
    }

    // Manual effect implementations (stubs)
    manualInfestation(x, y) {
        try {
            // Find the obstacle chunk under x,y
            for (let oi = 0; oi < ((typeof obstacles !== 'undefined' ? obstacles : (window.obstacles||[])) || []).length; oi++) {
                const obs = (typeof obstacles !== 'undefined' ? obstacles : window.obstacles)[oi];
                if (!obs || !obs.chunks) continue;
                for (let ci = 0; ci < obs.chunks.length; ci++) {
                    const c = obs.chunks[ci];
                    if (!c || c.destroyed) continue;
                    // Click tolerance: treat clicks near the chunk as a hit
                    const cx = c.x + c.w/2, cy = c.y + c.h/2;
                    const inBox = (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
                    const near = Math.hypot(x - cx, y - cy) <= Math.max(c.w, c.h) * 0.65;
                    if (inBox || near) {
                        // Convert to infested chunk using existing class
                        try {
                            const inf = new (window.InfestedChunk || InfestedChunk)(c, obs);
                            if (typeof infestedChunks !== 'undefined' && Array.isArray(infestedChunks)) {
                                infestedChunks.push(inf);
                            } else {
                                if (!window.infestedChunks) window.infestedChunks = [];
                                window.infestedChunks.push(inf);
                            }
                            // Sync to joiner via GameEvents (host authoritative)
                            try { if (window.NET && window.NET.role === 'host' && window.NET.connected) { GameEvents.emit('infestation-spawn', { obstacleIndex: oi, chunkIndex: ci, id: inf.id, x: inf.x, y: inf.y, w: inf.w, h: inf.h, hp: inf.hp }); } } catch (e) {}
                        } catch (e) {}
                        return true;
                    }
                }
            }
        } catch (e) {}
        return false;
    }

    manualFirestorm(x, y) {
        try {
            // Create a Firestorm instance at x,y with a larger default radius
            const radius = 200;
            const F = (typeof window !== 'undefined' && window.Firestorm) ? window.Firestorm : (typeof Firestorm !== 'undefined' ? Firestorm : null);
            if (typeof F === 'function') {
                // Host (or offline) spawns directly and informs joiner
                if (!window.NET || !window.NET.connected || window.NET.role === 'host') {
                    try { firestormInstance = new F(x, y, radius); } catch (e) {}
                    try { firestormActive = true; firestormTimer = 0; } catch (e) {}
                    // Emit via GameEvents (standard path)
                    try { if (window.NET && window.NET.role === 'host') { GameEvents.emit('firestorm-spawn', { x, y, radius }); } } catch (e) {}
                    // Also send direct relay once (simple redundancy, no acks/resends)
                    try {
                        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                            window.ws.send(JSON.stringify({ type: 'relay', data: { type: 'firestorm-spawn', x, y, radius, manual: true } }));
                        }
                    } catch (e) {}
                    return true;
                }
                // Non-host WM: request host action
                this.syncAction('Firestorm', x, y);
                return true;
            }
        } catch (e) {}
        return false;
    }

    manualExplosion(x, y) {
        try {
            // Find obstacle whose bounding box contains x,y
            for (let oi = 0; oi < ((typeof obstacles !== 'undefined' ? obstacles : (window.obstacles||[])) || []).length; oi++) {
                const o = (typeof obstacles !== 'undefined' ? obstacles : window.obstacles)[oi];
                if (!o || o.destroyed) continue;
                // Click tolerance: allow near-center clicks to count
                const inBox = (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h);
                const cx = o.x + o.w/2, cy = o.y + o.h/2;
                const near = Math.hypot(x - cx, y - cy) <= Math.max(o.w, o.h) * 0.8;
                if (inBox || near) {
                    // Make a large explosion centered on obstacle
                    const centerX = o.x + o.w/2;
                    const centerY = o.y + o.h/2;
                    const explosionRadius = Math.max(o.w, o.h) * 1.0 + 50;
                    const explosionDamage = 36;
                    // Host applies directly, else send to host
                    if (!window.NET || !window.NET.connected || window.NET.role === 'host') {
                        try { explosions.push(new (window.Explosion || Explosion)(centerX, centerY, explosionRadius, '#ff6b4a', explosionDamage, null, false)); } catch (e) {}
                        // Mark chunks destroyed similar to spontaneous logic
                        try {
                            for (const c of o.chunks) {
                                if (!c.destroyed) {
                                    const ang = Math.atan2(c.y + c.h/2 - centerY, c.x + c.w/2 - centerX) + (Math.random()-0.5)*0.8;
                                    const v = 200 + Math.random() * 180;
                                    c.vx = Math.cos(ang) * v;
                                    c.flying = true;
                                    c.destroyed = true;
                                    c.alpha = 1;
                                }
                            }
                            o.destroyed = true;
                        } catch (e) {}
                        // Emit chunk-update and explosion sync
                        try { createSyncedChunkUpdate(oi, o.chunks.map((cc, idx) => ({ i: idx, destroyed: !!cc.destroyed, flying: !!cc.flying, vx: cc.vx||0, vy: cc.vy||0, alpha: cc.alpha||1, x: cc.x, y: cc.y }))); } catch (e) {}
                        try { createSyncedExplosion(centerX, centerY, explosionRadius, '#ff6b4a', explosionDamage, null); } catch (e) {}
                        try { if (typeof playExplosion === 'function') playExplosion(); } catch (e) {}
                        return true;
                    } else {
                        // Send action to host for authoritative execution
                        this.syncAction('Spontaneous', x, y);
                        return true;
                    }
                }
            }
        } catch (e) {}
        return false;
    }

    manualDynamic(x, y) {
        try {
            const isHostLike = (!window.NET || !window.NET.connected || window.NET.role === 'host');
            // Helper: mark obstacle destroyed with some motion for visuals
            function destroyObstacleAtIndex(idx) {
                const o = obstacles[idx];
                if (!o || o.destroyed) return false;
                for (const c of o.chunks) {
                    if (!c.destroyed) { c.destroyed = true; c.flying = true; c.vx = rand(-140,140); c.vy = rand(-240,-40); c.alpha = 1; }
                }
                o.destroyed = true;
                try { if (window.NET && window.NET.role === 'host' && window.NET.connected) { GameEvents.emit('dynamic-despawn', { obstacleIndex: idx }); } } catch (e) {}
                return true;
            }
            // Helper: create a new obstacle object at a clamped location
            function createObstacleAt(nx, ny) {
                // Try multiple attempts to find a safe non-overlapping placement
                for (let attempt = 0; attempt < 40; attempt++) {
                    const size = rand(OBSTACLE_MIN_SIZE, OBSTACLE_MAX_SIZE);
                    const w = size, h = size;
                    const jitterX = nx + rand(-40, 40);
                    const jitterY = ny + rand(-40, 40);
                    const px = Math.max(60, Math.min(CANVAS_W - 60 - w, jitterX - w/2));
                    const py = Math.max(60, Math.min(CANVAS_H - 60 - h, jitterY - h/2));
                    const cand = new Obstacle(px, py, w, h);
                    const centerX = px + w/2, centerY = py + h/2;
                    let safe = true;
                    for (let k = 0; k < obstacles.length; k++) {
                        const o2 = obstacles[k];
                        if (!o2) continue;
                        if (!o2.destroyed && rectsOverlap(o2, cand)) { safe = false; break; }
                    }
                    if (!safe) continue;
                    if (dist(centerX, centerY, player.x, player.y) <= 90) safe = false;
                    if (!enemyDisabled && dist(centerX, centerY, enemy.x, enemy.y) <= 90) safe = false;
                    if (!safe) continue;
                    return cand;
                }
                return null;
            }
            // Helper: spawn new at index (replace slot) and emit event
            function placeNewAtIndex(idx, obs) {
                if (!obs) return false;
                obstacles[idx] = obs;
                try { if (window.NET && window.NET.role === 'host' && window.NET.connected) { GameEvents.emit('dynamic-spawn', { obstacleIndex: idx, obstacle: { x: obs.x, y: obs.y, w: obs.w, h: obs.h } }); } } catch (e) {}
                return true;
            }
            // Try to find clicked obstacle index
            let clickedIdx = -1;
            for (let oi = 0; oi < (obstacles || []).length; oi++) {
                const o = obstacles[oi];
                if (!o || o.destroyed) continue;
                if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) { clickedIdx = oi; break; }
            }
            if (isHostLike) {
                if (clickedIdx >= 0) {
                    // Remove clicked (mark chunks flying) and append a new obstacle elsewhere so flying chunks remain visible
                    destroyObstacleAtIndex(clickedIdx);
                    const newObs = createObstacleAt(rand(80, CANVAS_W-80), rand(80, CANVAS_H-80));
                    if (!newObs) return false;
                    obstacles.push(newObs);
                    try { if (window.NET && window.NET.role === 'host' && window.NET.connected) { GameEvents.emit('dynamic-spawn', { obstacleIndex: obstacles.indexOf(newObs), obstacle: { x: newObs.x, y: newObs.y, w: newObs.w, h: newObs.h } }); } } catch (e) {}
                    return true;
                } else {
                    // Empty space: spawn at click, remove a random existing live obstacle (mark destroyed but keep it for visuals)
                    const liveIdx = obstacles.map((o, i) => (!o || o.destroyed) ? -1 : i).filter(i => i >= 0);
                    if (liveIdx.length === 0) return false;
                    const remIdx = liveIdx[Math.floor(Math.random() * liveIdx.length)];
                    const newObs = createObstacleAt(x, y);
                    if (!newObs) return false;
                    destroyObstacleAtIndex(remIdx);
                    obstacles.push(newObs);
                    try { if (window.NET && window.NET.role === 'host' && window.NET.connected) { GameEvents.emit('dynamic-spawn', { obstacleIndex: obstacles.indexOf(newObs), obstacle: { x: newObs.x, y: newObs.y, w: newObs.w, h: newObs.h } }); } } catch (e) {}
                    return true;
                }
            } else {
                // Not host: ask host to perform action. Let host decide case by position
                // We use a single action name 'Dynamic' with x,y so host performs the equal in/out logic
                this.syncAction('Dynamic', x, y);
                return true;
            }
        } catch (e) {}
        return false;
    }

    update(dt) {
        // Decrement all cooldown timers
        for (const cooldown of this.effectCooldowns.values()) {
            if (cooldown.current > 0) {
                cooldown.current = Math.max(0, cooldown.current - dt);
            }
        }
        if (this.ui) this.ui.updateCooldowns(this.effectCooldowns);
    }

    // Network synchronization placeholders
    syncCardDecks() {
        // Only send if multiplayer and this is the local world master
        if (!this.isLocal && window.ws && window.ws.readyState === WebSocket.OPEN) {
            // Send all enabled/disabled mods and powerups
            const mods = (typeof WORLD_MODIFIERS !== 'undefined') ? WORLD_MODIFIERS : (window.WORLD_MODIFIERS || []);
            for (const modName of mods.map(m => (typeof m === 'string') ? m : m.name)) {
                const enabled = this.availableWorldMods.has(modName);
                window.ws.send(JSON.stringify({
                    type: 'relay',
                    data: { type: 'worldmaster-card-toggle', cardType: 'mod', name: modName, enabled }
                }));
            }
            const pups = (typeof POWERUPS !== 'undefined') ? POWERUPS : (window.POWERUPS || []);
            for (const powerupName of pups.map(p => (typeof p === 'string') ? p : p.name)) {
                const enabled = this.availablePowerups.has(powerupName);
                window.ws.send(JSON.stringify({
                    type: 'relay',
                    data: { type: 'worldmaster-card-toggle', cardType: 'powerup', name: powerupName, enabled }
                }));
            }
        }
    }

    syncControlState() {
        // Only send if multiplayer and this is the local world master
        if (!this.isLocal && window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify({
                type: 'relay',
                data: { type: 'worldmaster-control', effectName: this.controlledEffect }
            }));
        }
    }

    syncAction(effectName, x, y) {
        // Only send if multiplayer and this is the local world master
        if (!this.isLocal && window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify({
                type: 'relay',
                data: { type: 'worldmaster-action', effectName, x, y }
            }));
        }
    }
}

// Expose for browser globals if running in a browser
try { if (typeof window !== 'undefined') window.WorldMaster = WorldMaster; } catch (e) {}
// CommonJS export for Node environments
try { if (typeof module !== 'undefined' && module.exports) module.exports = WorldMaster; } catch (e) {}
