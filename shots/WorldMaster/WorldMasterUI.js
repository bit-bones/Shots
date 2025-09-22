// WorldMasterUI.js - UI components and modals for Worldmaster mode
// See project instructions for full requirements

class WorldMasterUI {
    constructor(worldMaster) {
        this.worldMaster = worldMaster;
        this.panels = {};
        this.modals = {};
        this.cooldownElements = {};

        this.createControlPanel();
        this.createCardDeckModals();
        this.createCooldownDisplay();
        this.attachEventListeners();
    }

    createControlPanel() {
        // Minimal floating panel at top-right
        let panel = document.createElement('div');
        panel.id = 'wm-control-panel';
        panel.style.position = 'fixed';
        panel.style.top = '24px';
        panel.style.right = '24px';
        panel.style.zIndex = 1001;
        panel.style.background = 'rgba(40,60,120,0.96)';
        panel.style.color = '#fff';
        panel.style.padding = '18px 28px';
        panel.style.borderRadius = '18px';
        panel.style.boxShadow = '0 2px 16px #0008';
        panel.style.fontSize = '1.1em';
        panel.innerHTML = '<b>World Master Panel</b><br><small>(UI WIP)</small>';
        document.body.appendChild(panel);
        this.panels.main = panel;
    }

    createCardDeckModals() {
        // TODO: Modal for world modifier cards
        // Display all WORLD_MODIFIERS as cards in grid
        // Cards: normal (enabled), faded (disabled), click to toggle
        // Modal for powerup cards, same logic
        // Use existing card styling
    }

    createCooldownDisplay() {
        // TODO: Purple cooldown circles near "World Cards:" text
        // One per world modifier with active effects
        // Match player shot cooldown style
    }

    showWorldModDeck() {
        // TODO: Show world modifier card modal
        // Update card visuals based on worldMaster.availableWorldMods
        // Handle click events to call worldMaster.toggleWorldMod()
    }

    showPowerupDeck() {
        // TODO: Show powerup card modal
        // Update card visuals based on worldMaster.availablePowerups
        // Handle click events to call worldMaster.togglePowerup()
    }

    updateControlledEffect(effectName) {
        // TODO: Add purple border to specified effect in active list
        // Remove border from previous
        // Update cursor or add map click indicators
    }

    updateCooldowns(cooldownMap) {
        // TODO: Update each purple cooldown circle based on cooldownMap
        // Show progress arc, hide if not on cooldown
    }

    attachEventListeners() {
        // TODO: Wire up button clicks to show modals
        // Wire up effect clicks to setControlledEffect()
        // Handle modal close, escape key, etc.
    }

    toggle(show) {
        if (this.panels.main) {
            this.panels.main.style.display = show ? '' : 'none';
        }
    }
}

module.exports = WorldMasterUI;
