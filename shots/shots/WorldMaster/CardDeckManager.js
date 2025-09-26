// CardDeckManager.js - Card activation/deactivation system for Worldmaster mode
// Handles card deck logic for WorldMaster

class CardDeckManager {
    constructor(worldMaster) {
        this.worldMaster = worldMaster;
    }

    enableWorldMod(modName) {
        this.worldMaster.toggleWorldMod(modName, true);
    }

    disableWorldMod(modName) {
        this.worldMaster.toggleWorldMod(modName, false);
    }

    enablePowerup(powerupName) {
        this.worldMaster.togglePowerup(powerupName, true);
    }

    disablePowerup(powerupName) {
        this.worldMaster.togglePowerup(powerupName, false);
    }

    isWorldModEnabled(modName) {
        return this.worldMaster.availableWorldMods.has(modName);
    }

    isPowerupEnabled(powerupName) {
        return this.worldMaster.availablePowerups.has(powerupName);
    }
}

// Expose as browser global
try { if (typeof window !== 'undefined') window.CardDeckManager = CardDeckManager; } catch (e) {}
// CommonJS export for Node environments (guarded)
try { if (typeof module !== 'undefined' && module.exports) module.exports = CardDeckManager; } catch (e) {}
