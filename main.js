// Shots Game - New Modular Architecture (173 lines)
// Main entry point - loads modules and initializes game

const scripts = [
    'config/constants.js',
    'utils/math.js',
    'utils/helpers.js',
    'utils/stateSerializer.js',
    'core/AudioManager.js',
    'core/InputManager.js',
    'core/NetworkManager.js',
    'entities/Fighter.js',
    'entities/Bullet.js',
    'entities/Obstacle.js',
    'entities/Explosion.js',
    'entities/Firestorm.js',
    'entities/InfestedChunk.js',
    'entities/Healer.js',
    'systems/RosterSystem.js',
    'systems/CardSystem.js',
    'systems/CollisionSystem.js',
    'systems/RenderSystem.js',
    'systems/MatchSystem.js',
    'ai/FighterAI.js',
    'ui/CardUI.js',
    'ui/CardsUI.js',
    'ui/SetupUI.js',
    'ui/CardManagementUI.js',
    'ui/MultiplayerUI.js',
    'gameModes/GameMode.js',
    'gameModes/GameModeManager.js',
    'gameModes/EliminationMode.js',
    'gameModes/TeamEliminationMode.js',
    'core/Game.js'
];

let loadedCount = 0;
scripts.forEach((src) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => {
        loadedCount++;
        if (loadedCount === scripts.length) initGame();
    };
    script.onerror = () => console.error('Failed to load ' + src);
    document.head.appendChild(script);
});

let game = null;
let cardManagementUI = null;
let multiplayerUI = null;

function initGame() {
    console.log('All modules loaded successfully!');
    const canvas = document.getElementById('game');
    game = new Game(canvas);
    cardManagementUI = new CardManagementUI(game.cards);
    multiplayerUI = new MultiplayerUI(game);
    setupUIHandlers();
    game.init(); // Shows setup UI
    game.start(); // Starts game loop (renders setup UI)
}

function setupUIHandlers() {
    const densitySlider = document.getElementById('obstacle-density');
    const sizeSlider = document.getElementById('obstacle-size');
    const worldModIntervalSlider = document.getElementById('world-modifier-interval');
    const worldModIntervalValue = document.getElementById('world-modifier-value');
    const mapBorderCheckbox = document.getElementById('map-border');
    
    densitySlider.oninput = () => {
        document.getElementById('density-value').textContent = densitySlider.value;
    };
    
    sizeSlider.oninput = () => {
        document.getElementById('size-value').textContent = sizeSlider.value;
    };
    
    if (worldModIntervalSlider) {
        const updateWorldModLabel = () => {
            if (worldModIntervalValue) {
                worldModIntervalValue.textContent = worldModIntervalSlider.value;
            }
        };
        updateWorldModLabel();
        worldModIntervalSlider.oninput = updateWorldModLabel;
    }

    if (mapBorderCheckbox) {
        mapBorderCheckbox.checked = true;
    }
    
    const optionsBtn = document.getElementById('open-options-btn');
    const optionsOverlay = document.getElementById('options-overlay');
    const optionsBackBtn = document.getElementById('options-back-btn');
    
    optionsBtn.onclick = () => {
        optionsOverlay.style.display = 'block';
        loadAudioSettings();
    };
    
    optionsBackBtn.onclick = () => optionsOverlay.style.display = 'none';
    
    setupAudioSettings();
}

function setupAudioSettings() {
    const audioManager = game ? game.audio : new AudioManager();
    
    const masterVol = document.getElementById('master-vol');
    masterVol.oninput = () => {
        const val = parseInt(masterVol.value);
        document.getElementById('master-vol-val').textContent = val;
        audioManager.setMasterVolume(val / 100);
    };
    
    const musicVol = document.getElementById('music-vol');
    musicVol.oninput = () => {
        const val = parseInt(musicVol.value);
        document.getElementById('music-vol-val').textContent = val;
        audioManager.setMusicVolume(val / 100);
    };
    
    const sfxVol = document.getElementById('sfx-vol');
    sfxVol.oninput = () => {
        const val = parseInt(sfxVol.value);
        document.getElementById('sfx-vol-val').textContent = val;
        audioManager.setSfxVolume(val / 100);
    };
    
    const effects = ['shot', 'explosion', 'ricochet', 'hit', 'dash', 'impact', 'burning'];
    effects.forEach(effect => {
        const slider = document.getElementById(effect + '-vol');
        const valueDisplay = document.getElementById(effect + '-vol-val');
        if (!slider || !valueDisplay) return;

        slider.oninput = () => {
            const val = parseInt(slider.value);
            valueDisplay.textContent = val;
            audioManager.setEffectVolume(effect, val / 100);
        };
        
        const previewBtn = document.getElementById('preview-' + effect);
        if (previewBtn) {
            previewBtn.onclick = () => {
                if (effect === 'shot') audioManager.playGunShot();
                else if (effect === 'explosion') audioManager.playExplosion();
                else if (effect === 'ricochet') audioManager.playRicochet();
                else if (effect === 'hit') audioManager.playHit();
                else if (effect === 'dash') audioManager.playDashWoosh();
                else if (effect === 'impact') audioManager.playImpact(2.5);
                else if (effect === 'burning') audioManager.playBurning(1.0);
            };
        }
    });
    
    setupCursorSettings();
}

function setupCursorSettings() {
    const cursorSelect = document.getElementById('cursor-style');
    const cursorColorInput = document.getElementById('cursor-color');
    const canvasEl = document.getElementById('game');
    
    // Load saved cursor settings
    try {
        const savedStyle = localStorage.getItem('shape_shot_cursor') || 'reticle';
        const savedColor = localStorage.getItem('shape_shot_color') || '#ffd86b';
        if (cursorSelect) cursorSelect.value = savedStyle;
        if (cursorColorInput) cursorColorInput.value = savedColor;
        applyCursorStyle(savedStyle, savedColor);
    } catch (e) {}
    
    // Setup blood effects toggle
    const bloodToggle = document.getElementById('blood-effects-toggle');
    if (bloodToggle) {
        try {
            const savedBlood = localStorage.getItem('shape_shot_blood_effects') === 'true';
            bloodToggle.checked = savedBlood;
        } catch (e) {}
        
        bloodToggle.addEventListener('change', function(e) {
            try {
                localStorage.setItem('shape_shot_blood_effects', e.target.checked ? 'true' : 'false');
            } catch (err) {}
        });
    }
    
    if (cursorSelect) {
        cursorSelect.addEventListener('change', function(e) {
            const style = e.target.value;
            const color = (cursorColorInput && cursorColorInput.value) ? cursorColorInput.value : '#ffd86b';
            try { localStorage.setItem('shape_shot_cursor', style); } catch (err) {}
            applyCursorStyle(style, color);
            
            // Update local fighter metadata immediately and render UI
            if (window.game && game.roster) {
                const localFighter = game.roster.getLocalFighter();
                if (localFighter) {
                    game.roster.updateFighter(localFighter.id, { metadata: { cursorStyle: style, cursorColor: color } });
                    game.setupUI.render();
                }
            }
            
            // Handle network updates
            if (window.game && game.network && game.network.connected) {
                const fighter = game.roster.getLocalFighter();
                if (fighter) {
                    if (game.network.role === 'joiner') {
                        game.network.sendCursorUpdate(style, color, fighter.id, fighter.slotIndex);
                    } else if (game.network.role === 'host') {
                        game._broadcastRosterUpdate();
                    }
                }
            }
        });
    }
    
    if (cursorColorInput) {
        cursorColorInput.addEventListener('input', function(e) {
            const color = e.target.value;
            const style = (cursorSelect && cursorSelect.value) ? cursorSelect.value : 'reticle';
            try { localStorage.setItem('shape_shot_color', color); } catch (err) {}
            applyCursorStyle(style, color);
            
            // Update local fighter metadata immediately and render UI
            if (window.game && game.roster) {
                const localFighter = game.roster.getLocalFighter();
                if (localFighter) {
                    game.roster.updateFighter(localFighter.id, { metadata: { cursorStyle: style, cursorColor: color } });
                    game.setupUI.render();
                }
            }
            
            // Handle network updates
            if (window.game && game.network && game.network.connected) {
                const fighter = game.roster.getLocalFighter();
                if (fighter) {
                    if (game.network.role === 'joiner') {
                        game.network.sendCursorUpdate(style, color, fighter.id, fighter.slotIndex);
                    } else if (game.network.role === 'host') {
                        game._broadcastRosterUpdate();
                    }
                }
            }
        });
    }
}

function applyCursorStyle(style, colorHex) {
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

function loadAudioSettings() {
    const audioManager = game ? game.audio : new AudioManager();
    const volumes = audioManager.loadVolumes();
    
    document.getElementById('master-vol').value = Math.round(volumes.master * 100);
    document.getElementById('master-vol-val').textContent = Math.round(volumes.master * 100);
    
    document.getElementById('music-vol').value = Math.round(volumes.music * 100);
    document.getElementById('music-vol-val').textContent = Math.round(volumes.music * 100);
    
    document.getElementById('sfx-vol').value = Math.round(volumes.sfx * 100);
    document.getElementById('sfx-vol-val').textContent = Math.round(volumes.sfx * 100);
    
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

const devConsoleForm = document.getElementById('dev-console-form');
const devConsoleInput = document.getElementById('dev-console-input');
const devConsoleLog = document.getElementById('dev-console-log');

devConsoleForm.onsubmit = (e) => {
    e.preventDefault();
    const cmd = devConsoleInput.value.trim();
    if (cmd) {
        devConsoleLog.textContent += '> ' + cmd + '\n';
        devConsoleInput.value = '';
        
        if (cmd.startsWith('//')) {
            const cardName = cmd.substring(2);
            console.log('Dev command: Give card "' + cardName + '"');
            
            if (game && game.roster) {
                const localFighter = game.roster.getLocalFighter();
                if (localFighter) {
                    localFighter.applyCard(cardName);
                    devConsoleLog.textContent += 'Applied card: ' + cardName + '\n';
                }
            }
        }
    }
};

// Global keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Restart on Enter key when match ends
    if (e.key === 'Enter' && game && game.match && game.match.getWinner()) {
        game.reset();
        game.init();
        game.start();
    }
    
    // ESC to close dev console (matches original game)
    if (e.key === 'Escape' || e.key === 'Esc') {
        const devConsoleFixed = document.getElementById('dev-console-fixed');
        const devInput = document.getElementById('dev-console-input');
        
        if (devConsoleFixed && !devConsoleFixed.classList.contains('hidden')) {
            devConsoleFixed.classList.add('hidden');
            if (devInput && document.activeElement === devInput) {
                devInput.blur();
            }
            e.preventDefault();
            e.stopPropagation();
        }
    }
    
    // / key to toggle dev console (matches original game)
    if ((e.key === '/' || e.key === 'Slash') && document.activeElement !== devConsoleInput) {
        const devConsoleFixed = document.getElementById('dev-console-fixed');
        if (devConsoleFixed) {
            e.preventDefault();
            e.stopPropagation();
            devConsoleFixed.classList.toggle('hidden');
            // If showing the console, focus the input
            if (!devConsoleFixed.classList.contains('hidden')) {
                if (devConsoleInput) devConsoleInput.focus();
            }
        }
    }
});

console.log('Shots Game - Loading...');
