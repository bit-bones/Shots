/**
 * OptionsUI - Game options modal system with audio, video, and controls settings
 * Provides hierarchical modal navigation for different setting categories
 */
class OptionsUI {
    constructor(gameInstance) {
        this.game = gameInstance;
        this.audioManager = gameInstance ? gameInstance.audio : new AudioManager();

        // Modal elements
        this.mainOptionsOverlay = document.getElementById('main-options-overlay');
        this.audioOptionsOverlay = document.getElementById('audio-options-overlay');
        this.videoOptionsOverlay = document.getElementById('video-options-overlay');
        this.controlsOptionsOverlay = document.getElementById('controls-options-overlay');

        // Navigation buttons
        this.optionsBtn = document.getElementById('open-options-btn');
        this.mainOptionsBackBtn = document.getElementById('main-options-back-btn');
        this.audioOptionsBackBtn = document.getElementById('audio-options-back-btn');
        this.videoOptionsBackBtn = document.getElementById('video-options-back-btn');
        this.controlsOptionsBackBtn = document.getElementById('controls-options-back-btn');

        // Sub-modal buttons
        this.audioOptionsBtn = document.getElementById('audio-options-btn');
        this.videoOptionsBtn = document.getElementById('video-options-btn');
        this.controlsOptionsBtn = document.getElementById('controls-options-btn');

        // Defaults buttons
        this.audioOptionsDefaultsBtn = document.getElementById('audio-options-defaults');
        this.videoOptionsDefaultsBtn = document.getElementById('video-options-defaults');
        this.controlsOptionsDefaultsBtn = document.getElementById('controls-options-defaults');

        this.bound = false;
        this.isRebinding = false;
        this.currentRebindTarget = null;
    }

    bind() {
        if (this.bound) return;
        this.bound = true;

        // Main options modal navigation
        if (this.optionsBtn) {
            this.optionsBtn.onclick = () => {
                if (this.mainOptionsOverlay) this.mainOptionsOverlay.style.display = 'block';
            };
        }

        if (this.mainOptionsBackBtn) {
            this.mainOptionsBackBtn.onclick = () => {
                if (this.mainOptionsOverlay) this.mainOptionsOverlay.style.display = 'none';
            };
        }

        // Sub-modal navigation
        if (this.audioOptionsBtn) {
            this.audioOptionsBtn.onclick = () => {
                if (this.mainOptionsOverlay) this.mainOptionsOverlay.style.display = 'none';
                if (this.audioOptionsOverlay) {
                    this.audioOptionsOverlay.style.display = 'block';
                    this.loadAudioSettings();
                }
            };
        }

        if (this.videoOptionsBtn) {
            this.videoOptionsBtn.onclick = () => {
                if (this.mainOptionsOverlay) this.mainOptionsOverlay.style.display = 'none';
                if (this.videoOptionsOverlay) {
                    this.videoOptionsOverlay.style.display = 'block';
                    this.loadVideoSettings();
                }
            };
        }

        if (this.controlsOptionsBtn) {
            this.controlsOptionsBtn.onclick = () => {
                if (this.mainOptionsOverlay) this.mainOptionsOverlay.style.display = 'none';
                if (this.controlsOptionsOverlay) this.controlsOptionsOverlay.style.display = 'block';
            };
        }

        // Back buttons for sub-modals
        if (this.audioOptionsBackBtn) {
            this.audioOptionsBackBtn.onclick = () => {
                if (this.audioOptionsOverlay) this.audioOptionsOverlay.style.display = 'none';
                if (this.mainOptionsOverlay) this.mainOptionsOverlay.style.display = 'block';
            };
        }

        if (this.videoOptionsBackBtn) {
            this.videoOptionsBackBtn.onclick = () => {
                if (this.videoOptionsOverlay) this.videoOptionsOverlay.style.display = 'none';
                if (this.mainOptionsOverlay) this.mainOptionsOverlay.style.display = 'block';
            };
        }

        if (this.controlsOptionsBackBtn) {
            this.controlsOptionsBackBtn.onclick = () => {
                if (this.controlsOptionsOverlay) this.controlsOptionsOverlay.style.display = 'none';
                if (this.mainOptionsOverlay) this.mainOptionsOverlay.style.display = 'block';
            };
        }

        // Defaults buttons
        if (this.audioOptionsDefaultsBtn) {
            this.audioOptionsDefaultsBtn.onclick = () => {
                this.resetAudioSettings();
            };
        }

        if (this.videoOptionsDefaultsBtn) {
            this.videoOptionsDefaultsBtn.onclick = () => {
                this.resetVideoSettings();
            };
        }

        if (this.controlsOptionsDefaultsBtn) {
            this.controlsOptionsDefaultsBtn.onclick = () => {
                this.resetControlsSettings();
            };
        }

        // Setup settings
        this.setupAudioSettings();
        this.setupVideoSettings();
        this.setupControlsSettings();
    }

    setupAudioSettings() {
        const masterVol = document.getElementById('master-vol');
        if (masterVol) {
            masterVol.oninput = () => {
                const val = parseInt(masterVol.value);
                const valEl = document.getElementById('master-vol-val');
                if (valEl) valEl.textContent = val;
                this.audioManager.setMasterVolume(val / 100);
            };
        }

        const musicVol = document.getElementById('music-vol');
        if (musicVol) {
            musicVol.oninput = () => {
                const val = parseInt(musicVol.value);
                const valEl = document.getElementById('music-vol-val');
                if (valEl) valEl.textContent = val;
                this.audioManager.setMusicVolume(val / 100);
            };
        }

        const sfxVol = document.getElementById('sfx-vol');
        if (sfxVol) {
            sfxVol.oninput = () => {
                const val = parseInt(sfxVol.value);
                const valEl = document.getElementById('sfx-vol-val');
                if (valEl) valEl.textContent = val;
                this.audioManager.setSfxVolume(val / 100);
            };
        }

        const effects = ['shot', 'explosion', 'ricochet', 'hit', 'dash', 'impact', 'burning'];
        effects.forEach(effect => {
            const slider = document.getElementById(effect + '-vol');
            const valueDisplay = document.getElementById(effect + '-vol-val');
            if (!slider || !valueDisplay) return;

            slider.oninput = () => {
                const val = parseInt(slider.value);
                valueDisplay.textContent = val;
                this.audioManager.setEffectVolume(effect, val / 100);
            };

            const previewBtn = document.getElementById('preview-' + effect);
            if (previewBtn) {
                previewBtn.onclick = () => {
                    if (effect === 'shot') this.audioManager.playGunShot();
                    else if (effect === 'explosion') this.audioManager.playExplosion();
                    else if (effect === 'ricochet') this.audioManager.playRicochet();
                    else if (effect === 'hit') this.audioManager.playHit();
                    else if (effect === 'dash') this.audioManager.playDashWoosh();
                    else if (effect === 'impact') this.audioManager.playImpact(2.5);
                    else if (effect === 'burning') this.audioManager.playBurning(1.0);
                };
            }
        });
    }

    setupVideoSettings() {
        const cursorSelect = document.getElementById('cursor-style');
        const cursorColorInput = document.getElementById('cursor-color');
        const canvasEl = document.getElementById('game');

        // Load saved cursor settings
        try {
            const savedStyle = localStorage.getItem('shape_shot_cursor') || 'reticle';
            const savedColor = localStorage.getItem('shape_shot_color') || '#ffd86b';
            if (cursorSelect) cursorSelect.value = savedStyle;
            if (cursorColorInput) cursorColorInput.value = savedColor;
            this.applyCursorStyle(savedStyle, savedColor);
        } catch (e) {}

        // Setup blood effects toggle
        const bloodToggle = document.getElementById('blood-effects-toggle');
        if (bloodToggle) {
            try {
                const savedBlood = localStorage.getItem('shape_shot_blood_effects') === 'true';
                bloodToggle.checked = savedBlood;
            } catch (e) {}

            bloodToggle.addEventListener('change', (e) => {
                try {
                    localStorage.setItem('shape_shot_blood_effects', e.target.checked ? 'true' : 'false');
                } catch (err) {}
            });
        }

        if (cursorSelect) {
            cursorSelect.addEventListener('change', (e) => {
                const style = e.target.value;
                const color = (cursorColorInput && cursorColorInput.value) ? cursorColorInput.value : '#ffd86b';
                try { localStorage.setItem('shape_shot_cursor', style); } catch (err) {}
                this.applyCursorStyle(style, color);

                // Update local fighter metadata immediately and render UI
                if (this.game && this.game.roster) {
                    const localFighter = this.game.roster.getLocalFighter();
                    if (localFighter) {
                        this.game.roster.updateFighter(localFighter.id, { metadata: { cursorStyle: style, cursorColor: color } });
                        if (this.game.setupUI) this.game.setupUI.render();
                    }
                }

                // Handle network updates
                if (this.game && this.game.network && this.game.network.connected) {
                    const fighter = this.game.roster ? this.game.roster.getLocalFighter() : null;
                    if (fighter) {
                        const payload = {
                            cursorStyle: style,
                            cursorColor: color,
                            style,
                            color,
                            fighterId: fighter.id,
                            slotIndex: typeof fighter.slotIndex === 'number' ? fighter.slotIndex : null
                        };
                        if (this.game.network.role === 'joiner') {
                            this.game.network.sendMessage('cursor-update', payload);
                        } else if (this.game.network.role === 'host') {
                            this.game._broadcastRosterUpdate();
                            this.game._broadcastSetupState();
                        }
                    }
                }
            });
        }

        if (cursorColorInput) {
            cursorColorInput.addEventListener('input', (e) => {
                const color = e.target.value;
                const style = (cursorSelect && cursorSelect.value) ? cursorSelect.value : 'reticle';
                try { localStorage.setItem('shape_shot_color', color); } catch (err) {}
                this.applyCursorStyle(style, color);

                // Update local fighter metadata immediately and render UI
                if (this.game && this.game.roster) {
                    const localFighter = this.game.roster.getLocalFighter();
                    if (localFighter) {
                        this.game.roster.updateFighter(localFighter.id, { metadata: { cursorStyle: style, cursorColor: color } });
                        if (this.game.setupUI) this.game.setupUI.render();
                    }
                }

                // Handle network updates
                if (this.game && this.game.network && this.game.network.connected) {
                    const fighter = this.game.roster ? this.game.roster.getLocalFighter() : null;
                    if (fighter) {
                        const payload = {
                            cursorStyle: style,
                            cursorColor: color,
                            style,
                            color,
                            fighterId: fighter.id,
                            slotIndex: typeof fighter.slotIndex === 'number' ? fighter.slotIndex : null
                        };
                        if (this.game.network.role === 'joiner') {
                            this.game.network.sendMessage('cursor-update', payload);
                        } else if (this.game.network.role === 'host') {
                            this.game._broadcastRosterUpdate();
                            this.game._broadcastSetupState();
                        }
                    }
                }
            });
        }
    }

    applyCursorStyle(style, colorHex) {
        const c = (colorHex || '#ffd86b').replace('#','%23');
        const canvasEl = document.getElementById('game');
        if (!canvasEl) return;

        if (style === 'reticle') {
            canvasEl.style.cursor = "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"32\" height=\"32\" viewBox=\"0 0 32 32\"><g fill=\"none\" stroke=\""+c+"\" stroke-width=\"1.8\"><circle cx=\"16\" cy=\"16\" r=\"7.2\"/></g><g stroke=\""+c+"\" stroke-width=\"1.6\"><path d=\"M16 2v4\"/><path d=\"M16 30v-4\"/><path d=\"M2 16h4\"/><path d=\"M30 16h-4\"/></g></svg>') 16 16, crosshair";
        } else if (style === 'crosshair') {
            canvasEl.style.cursor = "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\"><g fill=\"none\" stroke=\""+c+"\" stroke-width=\"1.6\"><path d=\"M12 0v5\"/><path d=\"M12 24v-5\"/><path d=\"M0 12h5\"/><path d=\"M24 12h-5\"/></g></svg>') 12 12, crosshair";
        } else if (style === 'dot') {
            canvasEl.style.cursor = "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"><circle cx=\"8\" cy=\"8\" r=\"2\" fill=\""+c+"\"/></svg>') 8 8, auto";
        } else if (style === 'bigdot') {
            canvasEl.style.cursor = "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"32\" height=\"32\" viewBox=\"0 0 32 32\"><circle cx=\"16\" cy=\"16\" r=\"5\" fill=\""+c+"\"/></svg>') 16 16, auto";
        } else if (style === 'scope') {
            canvasEl.style.cursor = "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"40\" height=\"40\" viewBox=\"0 0 40 40\"><g fill=\"none\" stroke=\""+c+"\" stroke-width=\"1.6\"><circle cx=\"20\" cy=\"20\" r=\"10\"/></g><circle cx=\"20\" cy=\"20\" r=\"3\" fill=\""+c+"\" /><g stroke=\""+c+"\" stroke-width=\"1.2\"><path d=\"M20 2v6\"/><path d=\"M20 38v-6\"/><path d=\"M2 20h6\"/><path d=\"M38 20h-6\"/></g></svg>') 20 20, crosshair";
        } else {
            canvasEl.style.cursor = 'auto';
        }
    }

    loadAudioSettings() {
        const volumes = this.audioManager.loadVolumes();

        const masterVol = document.getElementById('master-vol');
        const masterVolVal = document.getElementById('master-vol-val');
        if (masterVol) masterVol.value = Math.round(volumes.master * 100);
        if (masterVolVal) masterVolVal.textContent = Math.round(volumes.master * 100);

        const musicVol = document.getElementById('music-vol');
        const musicVolVal = document.getElementById('music-vol-val');
        if (musicVol) musicVol.value = Math.round(volumes.music * 100);
        if (musicVolVal) musicVolVal.textContent = Math.round(volumes.music * 100);

        const sfxVol = document.getElementById('sfx-vol');
        const sfxVolVal = document.getElementById('sfx-vol-val');
        if (sfxVol) sfxVol.value = Math.round(volumes.sfx * 100);
        if (sfxVolVal) sfxVolVal.textContent = Math.round(volumes.sfx * 100);

        const effects = ['shot', 'explosion', 'ricochet', 'hit', 'dash', 'impact', 'burning'];
        const effectVolumes = (volumes && volumes.effects) ? volumes.effects : {};
        effects.forEach(effect => {
            const effectValue = typeof effectVolumes[effect] === 'number' ? effectVolumes[effect] : 1.0;
            const val = Math.round(effectValue * 100);
            const slider = document.getElementById(effect + '-vol');
            const display = document.getElementById(effect + '-vol-val');
            if (slider) slider.value = val;
            if (display) display.textContent = val;
        });
    }

    loadVideoSettings() {
        // Load cursor settings
        const cursorSelect = document.getElementById('cursor-style');
        const cursorColorInput = document.getElementById('cursor-color');
        try {
            const savedStyle = localStorage.getItem('shape_shot_cursor') || 'reticle';
            const savedColor = localStorage.getItem('shape_shot_color') || '#ffd86b';
            if (cursorSelect) cursorSelect.value = savedStyle;
            if (cursorColorInput) cursorColorInput.value = savedColor;
        } catch (e) {}

        // Load blood effects setting
        const bloodToggle = document.getElementById('blood-effects-toggle');
        if (bloodToggle) {
            try {
                const savedBlood = localStorage.getItem('shape_shot_blood_effects') === 'true';
                bloodToggle.checked = savedBlood;
            } catch (e) {}
        }
    }

    setupControlsSettings() {
        // Control input elements
        this.shootPrimary = document.getElementById('shoot-primary');
        this.shootSecondary = document.getElementById('shoot-secondary');
        this.dashPrimary = document.getElementById('dash-primary');
        this.dashSecondary = document.getElementById('dash-secondary');

        // Load saved control bindings
        this.loadControlsSettings();

        // Setup click handlers for rebinding
        const controlInputs = [this.shootPrimary, this.shootSecondary, this.dashPrimary, this.dashSecondary];
        controlInputs.forEach(input => {
            if (input) {
                input.addEventListener('click', (e) => {
                    this.startRebinding(e.target);
                });
            }
        });

        // Setup keyboard event listener for rebinding
        document.addEventListener('keydown', (e) => {
            if (this.isRebinding && this.currentRebindTarget) {
                e.preventDefault();
                this.finishRebinding(e);
            }
        });

        // Setup mouse event listener for rebinding
        document.addEventListener('mousedown', (e) => {
            if (this.isRebinding && this.currentRebindTarget) {
                e.preventDefault();
                this.finishRebinding(e);
            }
        });

        // Cancel rebinding on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isRebinding) {
                this.cancelRebinding();
            }
        });
    }

    startRebinding(target) {
        if (this.isRebinding) return;

        this.isRebinding = true;
        this.currentRebindTarget = target;

        // Visual feedback
        target.style.background = '#2f3440';
        target.style.borderColor = '#ffd86b';
        target.value = 'Press key...';

        // Prevent other interactions
        document.body.style.pointerEvents = 'none';
        target.style.pointerEvents = 'auto';
    }

    finishRebinding(event) {
        if (!this.isRebinding || !this.currentRebindTarget) return;

        const target = this.currentRebindTarget;
        let keyName = '';

        if (event.type === 'keydown') {
            // Handle keyboard input
            if (event.key === ' ') {
                keyName = 'Space';
            } else if (event.key.length === 1) {
                keyName = event.key.toUpperCase();
            } else {
                keyName = event.key;
            }
        } else if (event.type === 'mousedown') {
            // Handle mouse input
            if (event.button === 0) {
                keyName = 'LMB';
            } else if (event.button === 2) {
                keyName = 'RMB';
            }
        }

        if (keyName) {
            target.value = keyName;
            this.saveControlBinding(target.id, keyName);
            // Notify input manager to reload controls
            if (this.game && this.game.input) {
                this.game.input.reloadControlBindings();
            }
        }

        this.cancelRebinding();
    }

    cancelRebinding() {
        if (!this.isRebinding || !this.currentRebindTarget) return;

        const target = this.currentRebindTarget;

        // Reset visual feedback
        target.style.background = '#13161a';
        target.style.borderColor = '#2f3440';

        // Reset value if it was "Press key..."
        if (target.value === 'Press key...') {
            const savedValue = this.getSavedControlBinding(target.id);
            target.value = savedValue || this.getDefaultControlBinding(target.id);
        }

        // Reset state
        this.isRebinding = false;
        this.currentRebindTarget = null;
        document.body.style.pointerEvents = 'auto';
    }

    getDefaultControlBinding(controlId) {
        const defaults = {
            'shoot-primary': 'LMB',
            'shoot-secondary': 'Space',
            'dash-primary': 'RMB',
            'dash-secondary': 'Shift'
        };
        return defaults[controlId] || '';
    }

    getSavedControlBinding(controlId) {
        try {
            return localStorage.getItem(`shape_shot_control_${controlId}`) || this.getDefaultControlBinding(controlId);
        } catch (e) {
            return this.getDefaultControlBinding(controlId);
        }
    }

    saveControlBinding(controlId, keyName) {
        try {
            localStorage.setItem(`shape_shot_control_${controlId}`, keyName);
        } catch (e) {
            console.warn('Failed to save control binding:', e);
        }
    }

    loadControlsSettings() {
        if (this.shootPrimary) this.shootPrimary.value = this.getSavedControlBinding('shoot-primary');
        if (this.shootSecondary) this.shootSecondary.value = this.getSavedControlBinding('shoot-secondary');
        if (this.dashPrimary) this.dashPrimary.value = this.getSavedControlBinding('dash-primary');
        if (this.dashSecondary) this.dashSecondary.value = this.getSavedControlBinding('dash-secondary');
    }

    resetAudioSettings() {
        // Reset audio volumes to defaults
        const defaultVolumes = {
            master: 1.0,
            music: 1.0,
            sfx: 1.0,
            effects: {
                shot: 1.0,
                explosion: 1.0,
                ricochet: 1.0,
                hit: 1.0,
                dash: 1.0,
                impact: 1.0,
                burning: 1.0
            }
        };

        // Save defaults to localStorage
        try {
            localStorage.setItem('shape_shot_volumes', JSON.stringify(defaultVolumes));
        } catch (e) {}

        // Reload the settings in the UI
        this.loadAudioSettings();

        // Apply the defaults to the audio manager
        this.audioManager.setMasterVolume(defaultVolumes.master);
        this.audioManager.setMusicVolume(defaultVolumes.music);
        this.audioManager.setSfxVolume(defaultVolumes.sfx);
        Object.keys(defaultVolumes.effects).forEach(effect => {
            this.audioManager.setEffectVolume(effect, defaultVolumes.effects[effect]);
        });
    }

    resetVideoSettings() {
        // Reset cursor settings to defaults
        const defaultCursorStyle = 'reticle';
        const defaultCursorColor = '#ffd86b';
        const defaultBloodEffects = true;

        // Save defaults to localStorage
        try {
            localStorage.setItem('shape_shot_cursor', defaultCursorStyle);
            localStorage.setItem('shape_shot_color', defaultCursorColor);
            localStorage.setItem('shape_shot_blood_effects', defaultBloodEffects ? 'true' : 'false');
        } catch (e) {}

        // Reload the settings in the UI
        this.loadVideoSettings();

        // Apply cursor style
        this.applyCursorStyle(defaultCursorStyle, defaultCursorColor);

        // Update local fighter metadata
        if (this.game && this.game.roster) {
            const localFighter = this.game.roster.getLocalFighter();
            if (localFighter) {
                this.game.roster.updateFighter(localFighter.id, { 
                    metadata: { 
                        cursorStyle: defaultCursorStyle, 
                        cursorColor: defaultCursorColor 
                    } 
                });
                if (this.game.setupUI) this.game.setupUI.render();
            }
        }

        // Handle network updates
        if (this.game && this.game.network && this.game.network.connected) {
            const fighter = this.game.roster ? this.game.roster.getLocalFighter() : null;
            if (fighter) {
                const payload = {
                    cursorStyle: defaultCursorStyle,
                    cursorColor: defaultCursorColor,
                    style: defaultCursorStyle,
                    color: defaultCursorColor,
                    fighterId: fighter.id,
                    slotIndex: typeof fighter.slotIndex === 'number' ? fighter.slotIndex : null
                };
                if (this.game.network.role === 'joiner') {
                    this.game.network.sendMessage('cursor-update', payload);
                } else if (this.game.network.role === 'host') {
                    this.game._broadcastRosterUpdate();
                    this.game._broadcastSetupState();
                }
            }
        }
    }

    resetControlsSettings() {
        // Reset control bindings to defaults
        const defaultControls = {
            'shoot-primary': 'LMB',
            'shoot-secondary': 'Space',
            'dash-primary': 'RMB',
            'dash-secondary': 'Shift'
        };

        // Clear saved controls from localStorage
        try {
            Object.keys(defaultControls).forEach(key => {
                localStorage.removeItem(`shape_shot_control_${key}`);
            });
        } catch (e) {}

        // Reload the settings in the UI
        this.loadControlsSettings();

        // Notify input manager to reload controls
        if (this.game && this.game.input) {
            this.game.input.reloadControlBindings();
        }
    }
}