// WorldMasterUI.js - UI components and modals for Worldmaster mode
// See project instructions for full requirements

class WorldMasterUI {
    // Refresh any open modals with current enabled/disabled state
    updateCardDecks() {
        try {
            if (this.modals && this.modals.mods && this.modals.mods.style.display !== 'none') {
                this.showWorldModDeck();
            }
        } catch (e) {}
        try {
            if (this.modals && this.modals.pups && this.modals.pups.style.display !== 'none') {
                this.showPowerupDeck();
            }
        } catch (e) {}
    }
    createCooldownDisplay() {
        // Add a container for cooldown circles at the top of the panel
        const panel = this.panels.main;
        const cdDiv = document.createElement('div');
        cdDiv.id = 'wm-cooldowns';
        cdDiv.style.display = 'flex';
        cdDiv.style.gap = '10px';
        cdDiv.style.marginBottom = '8px';
        panel.insertBefore(cdDiv, panel.firstChild.nextSibling); // after title
        this.cooldownElements.container = cdDiv;
    }
    constructor(worldMaster) {
        this.worldMaster = worldMaster;
        this.panels = {};
        this.modals = {};
        this.cooldownElements = {};
        this._activeModsPollInterval = null;
        this._lastActiveModsSnapshot = '';
    this._limitWarningTimers = {};

        this.createControlPanel(); // Initialize control panel
        this.createCardDeckModals();
        this.createCooldownDisplay();
        this.attachEventListeners();

        // Start a small poll to detect changes to activeWorldModifiers so the panel
        // updates immediately when a card is applied elsewhere in the code.
        try {
            this._lastActiveModsSnapshot = JSON.stringify(this._getActiveModsList());
        } catch (e) { this._lastActiveModsSnapshot = '[]'; }
        this._activeModsPollInterval = setInterval(() => {
            try {
                const current = JSON.stringify(this._getActiveModsList());
                if (current !== this._lastActiveModsSnapshot) {
                    this._lastActiveModsSnapshot = current;
                    this.renderActiveEffects();
                }
            } catch (e) {}
        }, 250);
    }

    // Helper to read activeWorldModifiers from global scope with window fallback
    _getActiveModsList() {
        try {
            if (typeof activeWorldModifiers !== 'undefined' && Array.isArray(activeWorldModifiers)) return activeWorldModifiers;
        } catch (e) {}
        try { if (typeof window !== 'undefined' && Array.isArray(window.activeWorldModifiers)) return window.activeWorldModifiers; } catch (e) {}
        return [];
    }

    createControlPanel() {
        // Floating panel at top-right
        const panel = document.createElement('div');
        panel.id = 'wm-panel';
        panel.style.position = 'fixed';
        panel.style.top = '20px';
        panel.style.right = '20px';
        panel.style.background = '#222b';
        panel.style.border = '2px solid #65c6ff';
        panel.style.borderRadius = '12px';
        panel.style.padding = '16px 20px';
        panel.style.zIndex = '1000';
        panel.style.color = '#fff';
        panel.style.fontFamily = 'inherit';
        panel.style.minWidth = '240px';
        panel.innerHTML = `
            <div style="font-size:1.2em;font-weight:bold;margin-bottom:8px;">World Master Panel</div>
            <button id="wm-mods-btn" style="margin-bottom:8px;background:#65c6ff;color:#222;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">Manage World Mods</button>
            <button id="wm-pups-btn" style="margin-bottom:8px;background:#ff5a5a;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">Manage Powerups</button>
            <div style="margin-top:10px;display:flex;align-items:center;gap:8px;">
                <label style="color:#fff;font-size:0.95em;">Autopick</label>
                <input id="wm-autopick" type="checkbox" checked style="transform:scale(1.1);margin-left:6px;" />
            </div>
            <div style="margin-top:6px;display:flex;align-items:center;gap:8px;">
                <label style="color:#fff;font-size:0.95em;">AI self-picks powerups</label>
                <input id="wm-ai-powerups" type="checkbox" checked style="transform:scale(1.05);margin-left:6px;" />
            </div>
            <div id="wm-active-effects" style="margin-top:12px;"></div>
        `;
        this.panels.main = panel;
        document.body.appendChild(panel);
        // Attach button listeners
        setTimeout(() => {
            document.getElementById('wm-mods-btn').onclick = () => this.showWorldModDeck();
            document.getElementById('wm-pups-btn').onclick = () => this.showPowerupDeck();
            const ap = document.getElementById('wm-autopick');
            if (ap) {
                ap.checked = !!this.worldMaster.autoPick;
                ap.addEventListener('change', () => {
                    this.worldMaster.autoPick = !!ap.checked;
                });
            }
            const ai = document.getElementById('wm-ai-powerups');
            if (ai) {
                ai.checked = this.worldMaster.aiSelfPickPowerups !== false;
                ai.addEventListener('change', () => {
                    this.worldMaster.aiSelfPickPowerups = !!ai.checked;
                });
            }
        }, 0);
        // Render active effects list
        this.renderActiveEffects();
    }
    renderActiveEffects() {
        // Show only currently ACTIVE world effects (cards chosen) as buttons for manual control
        const container = this.panels.main.querySelector('#wm-active-effects');
        container.innerHTML = '<div style="font-size:0.98em;margin-bottom:4px;">World Effects:</div>';
        // Prefer real global binding if available, else fall back to window.activeWorldModifiers
        let activeList = [];
        try {
            if (typeof activeWorldModifiers !== 'undefined' && Array.isArray(activeWorldModifiers)) {
                activeList = activeWorldModifiers;
            } else if (typeof window !== 'undefined' && Array.isArray(window.activeWorldModifiers)) {
                activeList = window.activeWorldModifiers;
            }
        } catch (e) {}
        // Guard: only list effects that are also enabled in the WM deck, if deck filtering is used
        const names = activeList.filter(n => !this.worldMaster.availableWorldMods.size || this.worldMaster.availableWorldMods.has(n));
        if (!names.length) {
            const none = document.createElement('div');
            none.textContent = 'None active';
            none.style.opacity = '0.7';
            none.style.fontSize = '0.92em';
            container.appendChild(none);
            return;
        }
        for (const modName of names) {
            const btn = document.createElement('button');
            btn.textContent = modName;
            btn.style.margin = '0 6px 6px 0';
            btn.style.padding = '6px 10px';
            btn.style.borderRadius = '7px';
            btn.style.border = '2px solid #65c6ff';
            btn.style.background = '#232b';
            btn.style.color = '#fff';
            btn.style.fontWeight = 'bold';
            btn.style.cursor = 'pointer';
            btn.style.transition = 'box-shadow 0.2s, border-color 0.2s';
            if (this.worldMaster.controlledEffect === modName) {
                btn.style.boxShadow = '0 0 0 3px #b36cff, 0 0 8px #b36cff88';
                btn.style.borderColor = '#b36cff';
            }
            btn.onclick = () => {
                if (this.worldMaster.controlledEffect === modName) {
                    this.worldMaster.clearControlledEffect();
                } else {
                    this.worldMaster.setControlledEffect(modName);
                }
                this.renderActiveEffects();
            };
            container.appendChild(btn);
        }
    }

    createCardDeckModals() {
        // Modal for world modifier cards
        const modModal = document.createElement('div');
        modModal.id = 'wm-mods-modal';
        modModal.style.display = 'none';
        modModal.style.position = 'fixed';
        modModal.style.top = '0';
        modModal.style.left = '0';
        modModal.style.width = '100vw';
        modModal.style.height = '100vh';
        modModal.style.background = '#000a';
        modModal.style.zIndex = '2000';
        modModal.innerHTML = `
            <div style="background:#222;padding:24px 32px;border-radius:16px;max-width:520px;margin:60px auto;box-shadow:0 4px 32px #000b;position:relative;">
                <div class="wm-card-title" data-type="mods" style="font-size:1.1em;font-weight:bold;margin-bottom:6px;color:#65c6ff;">World Modifier Cards <span class="wm-card-count" style="font-size:0.85em;font-weight:600;opacity:0.85;"></span></div>
                <div class="wm-card-limit-message" data-type="mods" style="font-size:0.9em;color:#f9d37c;opacity:0;height:18px;transition:opacity 0.2s ease;margin-bottom:6px;"></div>
                <div id="wm-mods-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;"></div>
                <button id="wm-mods-close" style="margin-top:18px;background:#65c6ff;color:#222;border:none;padding:6px 18px;border-radius:6px;cursor:pointer;float:right;">Close</button>
            </div>
        `;
        document.body.appendChild(modModal);
        this.modals.mods = modModal;
        // Modal for powerup cards
        const pupModal = document.createElement('div');
        pupModal.id = 'wm-pups-modal';
        pupModal.style.display = 'none';
        pupModal.style.position = 'fixed';
        pupModal.style.top = '0';
        pupModal.style.left = '0';
        pupModal.style.width = '100vw';
        pupModal.style.height = '100vh';
        pupModal.style.background = '#000a';
        pupModal.style.zIndex = '2000';
        pupModal.innerHTML = `
            <div style="background:#222;padding:24px 32px;border-radius:16px;max-width:520px;margin:60px auto;box-shadow:0 4px 32px #000b;position:relative;">
                <div class="wm-card-title" data-type="powerups" style="font-size:1.1em;font-weight:bold;margin-bottom:6px;color:#ff5a5a;">Powerup Cards <span class="wm-card-count" style="font-size:0.85em;font-weight:600;opacity:0.85;"></span></div>
                <div class="wm-card-limit-message" data-type="powerups" style="font-size:0.9em;color:#ffdede;opacity:0;height:18px;transition:opacity 0.2s ease;margin-bottom:6px;"></div>
                <div id="wm-pups-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;"></div>
                <button id="wm-pups-close" style="margin-top:18px;background:#ff5a5a;color:#fff;border:none;padding:6px 18px;border-radius:6px;cursor:pointer;float:right;">Close</button>
            </div>
        `;
        document.body.appendChild(pupModal);
        this.modals.pups = pupModal;
        // Attach close events
        setTimeout(() => {
            document.getElementById('wm-mods-close').onclick = () => this.hideModal('mods');
            document.getElementById('wm-pups-close').onclick = () => this.hideModal('pups');
        }, 0);
    }

    showWorldModDeck() {
        // Show modal and populate grid
        const modal = this.modals.mods;
        const grid = modal.querySelector('#wm-mods-grid');
        grid.innerHTML = '';
        try {
            const msg = modal.querySelector('.wm-card-limit-message');
            if (msg) msg.style.opacity = '0';
        } catch (e) {}
        try {
            const countEl = modal.querySelector('.wm-card-title[data-type="mods"] .wm-card-count');
            if (countEl) countEl.textContent = `(${this.worldMaster.availableWorldMods.size} active)`;
        } catch (e) {}
        const allMods = (typeof WORLD_MODIFIERS !== 'undefined') ? WORLD_MODIFIERS : (window.WORLD_MODIFIERS || []);
        for (const mod of allMods) {
            const name = typeof mod === 'string' ? mod : mod.name;
            const enabled = this.worldMaster.availableWorldMods.has(name);
            const card = document.createElement('div');
            card.textContent = name;
            card.style.padding = '14px 8px';
            card.style.background = enabled ? '#65c6ff' : '#444';
            card.style.color = enabled ? '#222' : '#888';
            card.style.border = enabled ? '2px solid #65c6ff' : '2px solid #333';
            card.style.borderRadius = '8px';
            card.style.textAlign = 'center';
            card.style.fontWeight = 'bold';
            card.style.cursor = 'pointer';
            card.style.opacity = enabled ? '1' : '0.5';
            card.onclick = () => {
                const changed = this.worldMaster.toggleWorldMod(name, !enabled);
                if (!changed) return;
                this.showWorldModDeck(); // Refresh
            };
            grid.appendChild(card);
        }
        modal.style.display = 'block';
    }

    showPowerupDeck() {
        // Show modal and populate grid
        const modal = this.modals.pups;
        const grid = modal.querySelector('#wm-pups-grid');
        grid.innerHTML = '';
        try {
            const msg = modal.querySelector('.wm-card-limit-message');
            if (msg) msg.style.opacity = '0';
        } catch (e) {}
        try {
            const countEl = modal.querySelector('.wm-card-title[data-type="powerups"] .wm-card-count');
            if (countEl) countEl.textContent = `(${this.worldMaster.availablePowerups.size} active)`;
        } catch (e) {}
        const allPups = (typeof POWERUPS !== 'undefined') ? POWERUPS : (window.POWERUPS || []);
        for (const pup of allPups) {
            const name = typeof pup === 'string' ? pup : pup.name;
            const enabled = this.worldMaster.availablePowerups.has(name);
            const card = document.createElement('div');
            card.textContent = name;
            card.style.padding = '14px 8px';
            card.style.background = enabled ? '#ff5a5a' : '#444';
            card.style.color = enabled ? '#fff' : '#888';
            card.style.border = enabled ? '2px solid #ff5a5a' : '2px solid #333';
            card.style.borderRadius = '8px';
            card.style.textAlign = 'center';
            card.style.fontWeight = 'bold';
            card.style.cursor = 'pointer';
            card.style.opacity = enabled ? '1' : '0.5';
            card.onclick = () => {
                const changed = this.worldMaster.togglePowerup(name, !enabled);
                if (!changed) return;
                this.showPowerupDeck(); // Refresh
            };
            grid.appendChild(card);
        }
        modal.style.display = 'block';
    }

    updateControlledEffect(effectName) {
        // Re-render active effects to update highlight
        this.renderActiveEffects();
        // Optionally update cursor or add map click indicators here
    }
    hideModal(type) {
        if (type === 'mods' && this.modals.mods) this.modals.mods.style.display = 'none';
        if (type === 'pups' && this.modals.pups) this.modals.pups.style.display = 'none';
    }

    updateCooldowns(cooldownMap) {
        // cooldownMap: Map<string, {current: number, max: number}>
        const cdDiv = this.cooldownElements.container;
        if (!cdDiv) return;
        cdDiv.innerHTML = '';
        for (const [effect, {current, max}] of cooldownMap.entries()) {
            if (max <= 0 || current <= 0) continue; // Only show if on cooldown
            const percent = Math.max(0, Math.min(1, current / max));
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', '36');
            svg.setAttribute('height', '36');
            svg.style.display = 'block';
            svg.style.background = 'none';
            svg.style.borderRadius = '50%';
            svg.style.boxShadow = '0 0 6px #a5f';
            // Background circle
            const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            bg.setAttribute('cx', '18');
            bg.setAttribute('cy', '18');
            bg.setAttribute('r', '15');
            bg.setAttribute('fill', '#2a1a3a');
            svg.appendChild(bg);
            // Cooldown arc
            const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            arc.setAttribute('cx', '18');
            arc.setAttribute('cy', '18');
            arc.setAttribute('r', '15');
            arc.setAttribute('fill', 'none');
            arc.setAttribute('stroke', '#b36cff');
            arc.setAttribute('stroke-width', '5');
            arc.setAttribute('stroke-linecap', 'round');
            arc.setAttribute('stroke-dasharray', `${2 * Math.PI * 15}`);
            arc.setAttribute('stroke-dashoffset', `${2 * Math.PI * 15 * (1 - percent)}`);
            svg.appendChild(arc);
            // Label
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', '18');
            label.setAttribute('y', '23');
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('font-size', '11');
            label.setAttribute('fill', '#fff');
            label.textContent = effect[0];
            svg.appendChild(label);
            cdDiv.appendChild(svg);
        }
    }

    showCardLimitWarning(type, minimum) {
        const modalKey = type === 'mods' ? 'mods' : (type === 'powerups' ? 'pups' : null);
        if (!modalKey || !this.modals[modalKey]) return;
        const modal = this.modals[modalKey];
        const messageEl = modal.querySelector('.wm-card-limit-message');
        if (!messageEl) return;
        const typeLabel = (type === 'mods') ? 'world modifiers' : 'powerups';
        messageEl.textContent = `Keep at least ${minimum} ${typeLabel} active.`;
        messageEl.style.opacity = '1';
        const timerKey = `${type}-limit`;
        if (this._limitWarningTimers[timerKey]) {
            clearTimeout(this._limitWarningTimers[timerKey]);
        }
        this._limitWarningTimers[timerKey] = setTimeout(() => {
            messageEl.style.opacity = '0';
        }, 2000);
    }

    attachEventListeners() {
        // Escape key closes modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideModal('mods');
                this.hideModal('pups');
            }
        });
    }

    toggle(show = true) {
        // Show/hide the main control panel
        if (this.panels.main) {
            this.panels.main.style.display = show ? 'block' : 'none';
            // If hiding the panel entirely, stop the active-mods poll to avoid leaks.
            if (!show && this._activeModsPollInterval) {
                clearInterval(this._activeModsPollInterval);
                this._activeModsPollInterval = null;
            }
            // If showing the panel after it was hidden, restart the poll briefly so UI stays in sync
            if (show && !this._activeModsPollInterval) {
                try {
                    this._lastActiveModsSnapshot = JSON.stringify(this._getActiveModsList());
                } catch (e) { this._lastActiveModsSnapshot = '[]'; }
                this._activeModsPollInterval = setInterval(() => {
                    try {
                        const current = JSON.stringify(this._getActiveModsList());
                        if (current !== this._lastActiveModsSnapshot) {
                            this._lastActiveModsSnapshot = current;
                            this.renderActiveEffects();
                        }
                    } catch (e) {}
                }, 250);
            }
        }
    }
}

// Expose for browser globals if running in a browser
try { if (typeof window !== 'undefined') window.WorldMasterUI = WorldMasterUI; } catch (e) {}
// CommonJS export for Node environments
try { if (typeof module !== 'undefined' && module.exports) module.exports = WorldMasterUI; } catch (e) {}
