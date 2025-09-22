// Integration.js - Hooks WorldMaster into existing game systems
// See project instructions for integration points and logic

const WorldMaster = require('./WorldMaster');
const WorldMasterUI = require('./WorldMasterUI');

// Global WorldMaster instance
let gameWorldMaster = null;

// Initialize WorldMaster based on game mode
function initializeWorldMaster(mode) {
    // mode: 'single-worldmaster', 'multi-worldmaster', null
    if (mode === 'single-worldmaster' || mode === 'multi-worldmaster') {
        gameWorldMaster = new WorldMaster(mode === 'single-worldmaster');
        gameWorldMaster.ui = new WorldMasterUI(gameWorldMaster);
        // TODO: Set up event listeners for map clicks
    } else {
        gameWorldMaster = null;
    }
}

// Hook into existing world modifier selection
function getFilteredWorldModifiers(WORLD_MODIFIERS) {
    if (gameWorldMaster) {
        return WORLD_MODIFIERS.filter(mod => gameWorldMaster.availableWorldMods.has(mod));
    }
    return WORLD_MODIFIERS;
}

// Hook into existing powerup selection
function getFilteredPowerups(POWERUPS) {
    if (gameWorldMaster) {
        return POWERUPS.filter(p => gameWorldMaster.availablePowerups.has(p));
    }
    return POWERUPS;
}

// Replace automatic world modifier triggering
function triggerWorldModifierChoice(choices) {
    if (gameWorldMaster) {
        // TODO: Show choice UI to world master
        // Integrate with netShowWorldModifierCards()
    } else {
        // TODO: Use existing automatic selection logic
    }
}

// Map click handler for world master controls
function handleWorldMasterMapClick(event) {
    // Only handle if current player is world master (localPlayerIndex === -1)
    // TODO: Convert click coordinates to game canvas coordinates
    // TODO: Call gameWorldMaster.handleMapClick(x, y)
    // TODO: Prevent default game click behavior if handled
}

// Update loop integration
function updateWorldMaster(dt) {
    if (gameWorldMaster) {
        gameWorldMaster.update(dt);
        // UI cooldown/state update handled in WorldMaster.update
    }
}

// Mode switching helpers
function enableWorldMasterMode(isLocal) {
    gameWorldMaster = new WorldMaster(isLocal);
    gameWorldMaster.ui = new WorldMasterUI(gameWorldMaster);
    // TODO: Disable normal player controls, set up spectator camera
}

function disableWorldMasterMode() {
    if (gameWorldMaster && gameWorldMaster.ui) {
        gameWorldMaster.ui.toggle(false);
    }
    gameWorldMaster = null;
    // TODO: Re-enable normal player controls
}

module.exports = {
    initializeWorldMaster,
    getFilteredWorldModifiers,
    getFilteredPowerups,
    triggerWorldModifierChoice,
    handleWorldMasterMapClick,
    updateWorldMaster,
    enableWorldMasterMode,
    disableWorldMasterMode,
    get gameWorldMaster() { return gameWorldMaster; }
};
