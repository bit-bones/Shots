// WorldMaster.js - Core World Master class for Worldmaster mode
// See project instructions for full requirements

class WorldMaster {
    constructor(isLocal = true) {
        // true for single-player, false for multiplayer
        this.isLocal = isLocal;
        this.isActive = false;

        // Card deck management
        this.availableWorldMods = new Set(); // Initially all WORLD_MODIFIERS
        this.availablePowerups = new Set(); // Initially all POWERUPS

        // Manual control system
        this.controlledEffect = null; // Currently controlled world modifier name
        this.effectCooldowns = new Map(); // Effect name -> {current: number, max: number}

        // UI reference
        this.ui = null; // Will hold WorldMasterUI instance

        // Initialize with all cards enabled and set up cooldowns
        this.initializeCardDecks();
        this.initializeCooldowns();
    }

    initializeCardDecks() {
        // Add all world modifier names to availableWorldMods Set
        if (typeof window.WORLD_MODIFIERS !== 'undefined') {
            for (const mod of window.WORLD_MODIFIERS) {
                this.availableWorldMods.add(mod.name);
            }
        }
        // Add all powerup names to availablePowerups Set
        if (typeof window.POWERUPS !== 'undefined') {
            for (const p of window.POWERUPS) {
                this.availablePowerups.add(p.name);
            }
        }
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
        if (enabled) {
            this.availableWorldMods.add(modName);
        } else {
            this.availableWorldMods.delete(modName);
        }
        this.syncCardDecks();
    }

    togglePowerup(powerupName, enabled) {
        if (enabled) {
            this.availablePowerups.add(powerupName);
        } else {
            this.availablePowerups.delete(powerupName);
        }
        this.syncCardDecks();
    }

    // Manual world effect control
    setControlledEffect(effectName) {
        this.controlledEffect = effectName;
        if (this.ui) this.ui.updateControlledEffect(effectName);
        this.syncControlState();
    }

    clearControlledEffect() {
        this.controlledEffect = null;
        if (this.ui) this.ui.updateControlledEffect(null);
        this.syncControlState();
    }

    // Handle map clicks for manual control
    handleMapClick(x, y) {
        if (!this.controlledEffect) return false;
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
            default:
                return false;
        }
    }

    // Manual effect implementations (stubs)
    manualInfestation(x, y) {
        // TODO: Find obstacle chunk at x,y and convert to infested
        return false;
    }

    manualFirestorm(x, y) {
        // TODO: Create new Firestorm at x,y
        return false;
    }

    manualExplosion(x, y) {
        // TODO: Find obstacle at x,y and create explosion
        return false;
    }

    manualDynamic(x, y) {
        // TODO: Remove or spawn obstacle at x,y
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
            for (const modName of WORLD_MODIFIERS.map(m => m.name)) {
                const enabled = this.availableWorldMods.has(modName);
                window.ws.send(JSON.stringify({
                    type: 'relay',
                    data: { type: 'worldmaster-card-toggle', cardType: 'mod', name: modName, enabled }
                }));
            }
            for (const powerupName of POWERUPS.map(p => p.name)) {
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

module.exports = WorldMaster;
