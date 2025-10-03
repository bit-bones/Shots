// Integration.js - Hooks WorldMaster into existing game systems
// See project instructions for integration points and logic

// Idempotent loader: avoid declaring globals that already exist (class WorldMaster / WorldMasterUI).
// Always reference through window to prevent "Identifier has already been declared" errors when script tags repeat.
function _getWM() { try { return (typeof window !== 'undefined') ? window.WorldMaster : undefined; } catch (e) { return undefined; } }
function _getWMUI() { try { return (typeof window !== 'undefined') ? window.WorldMasterUI : undefined; } catch (e) { return undefined; } }
function _getGlobalDeckController() {
    try {
        if (typeof window === 'undefined') return null;
        if (typeof window.ensureGlobalDeckController === 'function') {
            return window.ensureGlobalDeckController();
        }
        return window.globalDeckController || null;
    } catch (e) { return null; }
}
let _wmLocal = _getWM();
let _wmUILocal = _getWMUI();
// Attempt dynamic require fallback only if globals missing (Node/testing contexts)
try { if (!_wmLocal && typeof require === 'function') _wmLocal = require('./WorldMaster'); } catch (e) {}
try { if (!_wmUILocal && typeof require === 'function') _wmUILocal = require('./WorldMasterUI'); } catch (e) {}
try { if (typeof window !== 'undefined') {
    if (_wmLocal && !window.WorldMaster) window.WorldMaster = _wmLocal;
    if (_wmUILocal && !window.WorldMasterUI) window.WorldMasterUI = _wmUILocal;
} } catch (e) {}

// Global WorldMaster instance lives in main.js as window.gameWorldMasterInstance.
// Use accessors to avoid duplicating state.
function getInstance() {
    try { return (typeof window !== 'undefined') ? window.gameWorldMasterInstance : null; } catch (e) { return null; }
}

// Initialize WorldMaster based on game mode
function initializeWorldMaster(mode) {
    // mode: 'single-worldmaster', 'multi-worldmaster', null
    const shouldEnable = (mode === 'single-worldmaster' || mode === 'multi-worldmaster');
    if (!shouldEnable) {
        disableWorldMasterMode();
        return;
    }
    const isLocal = (mode === 'single-worldmaster');
    // If main.js already created the instance, just ensure UI is visible
    let inst = getInstance();
    if (!inst && WorldMaster) {
        // Create new instance and UI
        try {
            if (typeof window !== 'undefined') {
                window.gameWorldMasterInstance = new WorldMaster(isLocal);
                window.gameWorldMasterInstance.ui = WorldMasterUI ? new WorldMasterUI(window.gameWorldMasterInstance) : null;
            }
        } catch (e) {}
        inst = getInstance();
    }
    try {
        const controller = _getGlobalDeckController();
        if (controller && typeof controller.attachWorldMaster === 'function') controller.attachWorldMaster(inst);
    } catch (e) {}
    // Ensure UI is initialized but keep it hidden until the match actually starts
    try { if (inst && inst.ui && typeof inst.ui.toggle === 'function') inst.ui.toggle(false); } catch (e) {}
}

// Hook into existing world modifier selection
function getFilteredWorldModifiers(WORLD_MODIFIERS) {
    const inst = getInstance();
    if (inst && inst.availableWorldMods && inst.availableWorldMods.size) {
        return (WORLD_MODIFIERS || []).filter(mod => {
            const name = (typeof mod === 'string') ? mod : (mod && mod.name);
            return name ? inst.availableWorldMods.has(name) : true;
        });
    }
    const controller = _getGlobalDeckController();
    if (!controller || !controller.availableWorldMods || !controller.availableWorldMods.size) return WORLD_MODIFIERS;
    return (WORLD_MODIFIERS || []).filter(mod => {
        const name = (typeof mod === 'string') ? mod : (mod && mod.name);
        return name ? controller.availableWorldMods.has(name) : true;
    });
}

// Hook into existing powerup selection
function getFilteredPowerups(POWERUPS) {
    const inst = getInstance();
    if (inst && inst.availablePowerups && inst.availablePowerups.size) {
        return (POWERUPS || []).filter(p => {
            const name = (typeof p === 'string') ? p : (p && p.name);
            return name ? inst.availablePowerups.has(name) : true;
        });
    }
    const controller = _getGlobalDeckController();
    if (!controller || !controller.availablePowerups || !controller.availablePowerups.size) return POWERUPS;
    return (POWERUPS || []).filter(p => {
        const name = (typeof p === 'string') ? p : (p && p.name);
        return name ? controller.availablePowerups.has(name) : true;
    });
}

// Replace automatic world modifier triggering
function triggerWorldModifierChoice(choices, chooserRole) {
    // Defer to existing main.js logic if present. This helper can optionally
    // show the WM choice UI when autopick is disabled and local player is WM.
    try {
        const inst = getInstance();
        const isWM = (typeof window !== 'undefined' && window.localPlayerIndex === -1 && !!inst);
        if (inst && isWM && inst.autoPick === false && typeof window.netShowWorldModifierCards === 'function') {
            const role = chooserRole || (typeof NET !== 'undefined' ? NET.role : 'host');
            // choices may be objects or strings; netShowWorldModifierCards expects names
            const names = (choices || []).map(c => (typeof c === 'string') ? c : (c && c.name)).filter(Boolean);
            window.netShowWorldModifierCards(names, role, undefined, { manual: true });
            return true;
        }
    } catch (e) {}
    return false;
}

// Map click handler for world master controls
function handleWorldMasterMapClick(event) {
    try {
        const inst = getInstance();
        if (!(typeof window !== 'undefined' && window.localPlayerIndex === -1 && inst)) return false;
        const canvas = document.getElementById('game');
        if (!canvas) return false;
        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * (canvas.width / rect.width);
        const y = (event.clientY - rect.top) * (canvas.height / rect.height);
        const handled = !!inst.handleMapClick && inst.handleMapClick(x, y);
        if (handled) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        }
        return handled;
    } catch (e) { return false; }
}

// Update loop integration
function updateWorldMaster(dt) {
    const inst = getInstance();
    if (inst && typeof inst.update === 'function') inst.update(dt);
}

// Mode switching helpers
function enableWorldMasterMode(isLocal) {
    try {
        if (typeof window !== 'undefined') {
            if (!window.gameWorldMasterInstance && WorldMaster) {
                window.gameWorldMasterInstance = new WorldMaster(!!isLocal);
                window.gameWorldMasterInstance.ui = WorldMasterUI ? new WorldMasterUI(window.gameWorldMasterInstance) : null;
            }
            const inst = window.gameWorldMasterInstance;
            try {
                const controller = _getGlobalDeckController();
                if (controller && typeof controller.attachWorldMaster === 'function') controller.attachWorldMaster(inst);
            } catch (e) {}
            // Keep UI hidden during setup; show only if the game is already running
            try {
                if (typeof running !== 'undefined' && running && inst && inst.ui && typeof inst.ui.toggle === 'function') {
                    inst.ui.toggle(true);
                } else if (inst && inst.ui && typeof inst.ui.toggle === 'function') {
                    // Ensure it's initialized but hidden
                    inst.ui.toggle(false);
                }
            } catch (e) {}
        }
    } catch (e) {}
}

function disableWorldMasterMode() {
    try {
        const inst = getInstance();
        if (inst && inst.ui && typeof inst.ui.toggle === 'function') inst.ui.toggle(false);
        try {
            const controller = _getGlobalDeckController();
            if (controller && typeof controller.attachWorldMaster === 'function') controller.attachWorldMaster(null);
        } catch (e) {}
        if (typeof window !== 'undefined') window.gameWorldMasterInstance = null;
    } catch (e) {}
}

// Expose integration helpers as browser globals and guarded CommonJS export
try { if (typeof window !== 'undefined') window.WorldMasterIntegration = {
    initializeWorldMaster,
    getFilteredWorldModifiers,
    getFilteredPowerups,
    triggerWorldModifierChoice,
    handleWorldMasterMapClick,
    updateWorldMaster,
    enableWorldMasterMode,
    disableWorldMasterMode,
    get gameWorldMaster() { return getInstance(); }
}; } catch (e) {}
try { if (typeof module !== 'undefined' && module.exports) module.exports = {
    initializeWorldMaster,
    getFilteredWorldModifiers,
    getFilteredPowerups,
    triggerWorldModifierChoice,
    handleWorldMasterMapClick,
    updateWorldMaster,
    enableWorldMasterMode,
    disableWorldMasterMode,
    get gameWorldMaster() { return getInstance(); }
}; } catch (e) {}
