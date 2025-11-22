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
    'entities/LooseChunk.js',
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
    'ui/OptionsUI.js',
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
    script.onerror = () => {
        console.error('Failed to load script:', src);
    };
    document.head.appendChild(script);
});

let game = null;
let cardManagementUI = null;
let multiplayerUI = null;
let optionsUI = null;

function initGame() {
    console.log('All modules loaded successfully!');
    const canvas = document.getElementById('game');
    game = new Game(canvas);
    cardManagementUI = new CardManagementUI(game.cards, {
        onSettingsChanged: () => game && typeof game.handleCardSettingsChanged === 'function' && game.handleCardSettingsChanged(),
        interactionEnabled: game ? game.canModifySetupControls() : true
    });
    if (game && typeof game.setCardManagementUI === 'function') {
        game.setCardManagementUI(cardManagementUI);
    }
    multiplayerUI = new MultiplayerUI(game);
    optionsUI = new OptionsUI(game);
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
        if (!game || !game.canModifySetupControls()) {
            if (game && game.setupOptions && Number.isFinite(game.setupOptions.obstacleDensity)) {
                densitySlider.value = String(game.setupOptions.obstacleDensity);
                document.getElementById('density-value').textContent = densitySlider.value;
            }
            return;
        }
        if (game && typeof game.handleLocalSetupOptionChange === 'function') {
            const parsed = parseInt(densitySlider.value, 10);
            if (Number.isFinite(parsed)) {
                game.handleLocalSetupOptionChange('obstacleDensity', parsed);
            }
        }
    };
    
    sizeSlider.oninput = () => {
        document.getElementById('size-value').textContent = sizeSlider.value;
        if (!game || !game.canModifySetupControls()) {
            if (game && game.setupOptions && Number.isFinite(game.setupOptions.obstacleSize)) {
                sizeSlider.value = String(game.setupOptions.obstacleSize);
                document.getElementById('size-value').textContent = sizeSlider.value;
            }
            return;
        }
        if (game && typeof game.handleLocalSetupOptionChange === 'function') {
            const parsed = parseInt(sizeSlider.value, 10);
            if (Number.isFinite(parsed)) {
                game.handleLocalSetupOptionChange('obstacleSize', parsed);
            }
        }
    };
    
    if (worldModIntervalSlider) {
        const updateWorldModLabel = () => {
            if (worldModIntervalValue) {
                worldModIntervalValue.textContent = worldModIntervalSlider.value;
            }
            if (!game || !game.canModifySetupControls()) {
                if (game && game.setupOptions && Number.isFinite(game.setupOptions.worldModInterval)) {
                    worldModIntervalSlider.value = String(game.setupOptions.worldModInterval);
                    if (worldModIntervalValue) {
                        worldModIntervalValue.textContent = worldModIntervalSlider.value;
                    }
                }
                return;
            }
            if (game && typeof game.handleLocalSetupOptionChange === 'function') {
                const parsed = parseInt(worldModIntervalSlider.value, 10);
                if (Number.isFinite(parsed)) {
                    game.handleLocalSetupOptionChange('worldModInterval', parsed);
                }
            }
        };
        updateWorldModLabel();
        worldModIntervalSlider.oninput = updateWorldModLabel;
    }

    if (mapBorderCheckbox) {
        mapBorderCheckbox.checked = true;
        mapBorderCheckbox.addEventListener('change', () => {
            if (!game || !game.canModifySetupControls()) {
                if (game && game.setupOptions && Object.prototype.hasOwnProperty.call(game.setupOptions, 'mapBorder')) {
                    mapBorderCheckbox.checked = !!game.setupOptions.mapBorder;
                }
                return;
            }
            if (game && typeof game.handleLocalSetupOptionChange === 'function') {
                game.handleLocalSetupOptionChange('mapBorder', !!mapBorderCheckbox.checked);
            }
        });
    }
    
    // Initialize options UI
    if (optionsUI) {
        optionsUI.bind();
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
