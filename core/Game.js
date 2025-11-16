/**
 * Game - Main game coordinator (SLIM - delegates to systems)
 * Target: < 300 lines
 */
class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Systems
        this.roster = new RosterSystem();
        this.cards = new CardSystem(this);
        this.collision = new CollisionSystem();
        this.render = new RenderSystem(canvas, this.ctx);
        this.match = new MatchSystem();
        this.audio = new AudioManager();
        this._configureAudioStorageForInitialRole();
        this.input = new InputManager(canvas);
        this.network = new NetworkManager();
        this.cardUI = new CardUI();
        this.cardsUI = new CardsUI(); // Card badges display
        this.setupUI = new SetupUI(this.roster, {
            onRosterChanged: () => this._handleSetupRosterChanged(),
            onDisplayNameChange: (slotIndex, fighterId, newName) => this._handleDisplayNameChangeRequest(slotIndex, fighterId, newName)
        });
        this.setupUI.onBotDifficultyChange = (slotIndex, difficulty) => this._handleBotDifficultyChange(slotIndex, difficulty);

        this.modeManager = new GameModeManager({
            game: this,
            match: this.match,
            roster: this.roster,
            setupUI: this.setupUI
        });
        this.setupUI.onModeChange = (key) => this._handleModeChange(key);
        this.setupUI.onModeSettingsChange = (values) => this._handleModeSettingsChange(values);
        this.setupUI.setTeamAssignmentHandler((payloadOrSlot, fighterId, teamId, fighter) => this._handleTeamAssignment(payloadOrSlot, fighterId, teamId, fighter));
        this.setupUI.setTeamOptionsProvider((slotIndex, fighter) => this._provideTeamOptions(slotIndex, fighter));
        this._initializeGameModes();

        this.cards.setAudioManager(this.audio);
        if (typeof Firestorm !== 'undefined' && typeof Firestorm.setAudioManager === 'function') {
            Firestorm.setAudioManager(this.audio);
        }
        if (typeof Fighter !== 'undefined' && typeof Fighter.setAudioManager === 'function') {
            Fighter.setAudioManager(this.audio);
        }
        
        // Link systems
        this.collision.setAudioManager(this.audio);
        this.collision.setImpactCallback((x, y, damage, color, baseAngle) => this._spawnImpactLines(x, y, damage, color, baseAngle));
        this.match.setFighters(this.roster.getAllFighters());
        
        // Network callbacks
        this._setupNetworkCallbacks();
        
        // Entities
        this.bullets = [];
        this.obstacles = [];
        this.looseChunks = [];
        this.explosions = [];
        this.firestorms = [];
        this.infestedChunks = [];
        this.healers = [];
        this.impactLines = [];
        
        // AI
        this.botAIs = [];
        
        // State
        this.running = false;
        this.lastTime = 0;
        this.setupComplete = false;
        this.waitingForCard = false;
        this.remoteShowScoreboard = true;
        this.activeCardSelection = null;
        this.pendingWorldMod = null; // Queue world mod selection after powerup selection
        this.mapBorderEnabled = true;
        this.readyStates = {};
        this.chooseCardOnStart = true;
        this.cardSelectionQueue = [];
        this.initialCardDraftActive = false;
        
        // Multiplayer state
        this.isMultiplayer = false;
        this.lastStateBroadcast = 0;
        this.stateBroadcastInterval = 1000 / 20; // 20hz state updates
        this.firestormAudioActive = false;
        
        // Audio state tracking for joiners
        this._previousBulletIds = new Set();
        this._previousExplosionIds = new Set();
        this._previousFighterHealths = new Map();
        this._previousFighterDashActive = new Map();
        this._audioStateInitialized = false;

        // Joiner snapshot smoothing
        this._snapshotBuffer = [];
        this._snapshotInterpolationDelay = 20; // milliseconds of intentional delay
        this._snapshotMaxBuffer = 10;
        this._hasAppliedInitialSnapshot = false;
        this._remoteScoreboardEntries = null;
        this._lastReceivedModePayload = null;
        this._lastModeFlagsDigest = null;
        this._lastModeSettingsDigest = null;
        this._lastModeDescription = null;
        this._lastModeKey = null;

        // Death animation waiting
        this.waitingForDeathAnimations = false;
    }

    _configureAudioStorageForInitialRole() {
        if (typeof window === 'undefined') return;
        try {
            const params = new URLSearchParams(window.location.search || '');
            if (params.has('join')) {
                this._applyJoinerAudioStorage(null, { skipUI: true });
            } else {
                this._applyHostAudioStorage({ skipUI: true });
            }
        } catch (e) {
            console.warn('[Game] Failed to configure audio storage:', e);
        }
    }

    _applyHostAudioStorage(options = {}) {
        const opts = options || {};
        this.audio.setStorageKey('shape_shot_volumes');
        if (!opts.skipUI && typeof loadAudioSettings === 'function') {
            loadAudioSettings();
        }
    }

    _applyJoinerAudioStorage(joinerIndex, options = {}) {
        const opts = options || {};
        const suffix = (typeof joinerIndex === 'number' && joinerIndex >= 0)
            ? `_slot${joinerIndex}`
            : '';
        const key = `shape_shot_volumes_joiner${suffix}`;
        this.audio.setStorageKey(key);
        if (!opts.skipUI && typeof loadAudioSettings === 'function') {
            loadAudioSettings();
        }
    }

    init() {
        if (typeof Firestorm !== 'undefined' && typeof Firestorm.setAudioManager === 'function') {
            Firestorm.setAudioManager(this.audio);
        }
        if (typeof Fighter !== 'undefined' && typeof Fighter.setAudioManager === 'function') {
            Fighter.setAudioManager(this.audio);
        }
        // Load saved display name from localStorage
        let savedDisplayName = 'Player 1';
        try {
            const saved = localStorage.getItem('shape_shot_display_name');
            if (saved && saved.trim().length > 0) {
                savedDisplayName = saved.trim();
            }
        } catch (e) {
            console.warn('[Game] Failed to load display name from localStorage:', e);
        }
        
        // Initialize default roster
        this.roster.initializeDefaults();
        
        // Update local player name with saved display name
        const localPlayer = this.roster.getSlot(0);
        if (localPlayer) {
            localPlayer.name = savedDisplayName;
        }
        
        // Load saved rounds to win from localStorage
        try {
            const savedRounds = localStorage.getItem('shape_shot_rounds');
            if (savedRounds) {
                const roundsValue = parseInt(savedRounds, 10);
                if (Number.isFinite(roundsValue) && roundsValue >= 1 && roundsValue <= 50) {
                    const roundsInput = document.getElementById('rounds-to-win');
                    if (roundsInput) {
                        roundsInput.value = String(roundsValue);
                    }
                }
            }
        } catch (e) {
            console.warn('[Game] Failed to load rounds from localStorage:', e);
        }
        
        const chooseCardCheckbox = document.getElementById('choose-card-on-start');
        let chooseCardSetting = true;
        try {
            const savedChooseCard = localStorage.getItem('shape_shot_choose_card_start');
            if (savedChooseCard !== null) {
                chooseCardSetting = savedChooseCard === '1';
            }
        } catch (e) {
            console.warn('[Game] Failed to load choose-card-on-start setting:', e);
        }
        if (chooseCardCheckbox) {
            chooseCardCheckbox.checked = chooseCardSetting;
        }
        this.chooseCardOnStart = chooseCardSetting;

        // Set up rounds input change listener for multiplayer broadcasting
        const roundsInput = document.getElementById('rounds-to-win');
        if (roundsInput) {
            roundsInput.addEventListener('change', () => {
                if (this.isMultiplayer && this.network.role === 'host' && this.network.connected) {
                    try {
                        const roundsValue = parseInt(roundsInput.value, 10);
                        if (Number.isFinite(roundsValue) && roundsValue >= 1 && roundsValue <= 50) {
                            this.network.sendMessage('rounds-update', { rounds: roundsValue });
                        }
                    } catch (e) {
                        console.warn('[Game] Failed to broadcast rounds update:', e);
                    }
                }
            });
        }

        if (chooseCardCheckbox) {
            chooseCardCheckbox.addEventListener('change', () => {
                const enabled = !!chooseCardCheckbox.checked;
                this.chooseCardOnStart = enabled;
                try {
                    localStorage.setItem('shape_shot_choose_card_start', enabled ? '1' : '0');
                } catch (e) {
                    console.warn('[Game] Failed to save choose-card-on-start setting:', e);
                }
                if (this.isMultiplayer && this.network.role === 'host' && this.network.connected) {
                    this.network.sendMessage('start-card-setting', { enabled });
                }
            });
        }
        
        // Bind setup UI
        this.setupUI.bind();
        this.setupUI.onReadyToggle = (slotIndex) => this._handleReadyToggle(slotIndex);
        this.setupUI.onStart(() => {
            if (this.isMultiplayer) {
                if (!this.network || !this.network.connected || this.network.role !== 'host') {
                    return false;
                }
                if (!this._areAllPlayersReady()) {
                    alert('Waiting for players');
                    return false;
                }
            }
            this.startMatch();
            return true;
        });
        this.setupUI.show();
    }

    _setupNetworkCallbacks() {
        // Host callbacks
        this.network.onHosted = (code) => {
            console.log('[Game] Hosted lobby:', code);
            this.isMultiplayer = true;
            this._applyHostAudioStorage();
            this.setupUI.setMultiplayerMode(true);
            this._clearReadyStates(false);
            // Show session code in UI
            this.setupUI.showSessionCode(code);
        };
        
        this.network.onPeerJoined = (joinerIndex, joinerName) => {
            console.log('[Game] Peer joined at index:', joinerIndex, joinerName || '');
            
            // Assign joiner to roster slot
            const slotIndex = joinerIndex + 1;
            const displayName = joinerName && joinerName.trim().length > 0 ? joinerName.trim() : `Player ${slotIndex + 1}`;
            this.roster.assignJoiner(joinerIndex, displayName);
            
            // Remove AI if this slot was previously a bot
            this.botAIs = this.botAIs.filter(ai => ai.fighter.slotIndex !== slotIndex);
            
            // Update UI
            this.setupUI.onPeerJoined(joinerIndex, displayName);
            
            // Always broadcast roster state to all joiners (including the new one)
            // This ensures the new joiner sees the correct roster immediately
            this._broadcastRosterUpdate();
            this.setupUI.setMultiplayerMode(true);
            this._broadcastReadyStates();

            if (this.network.connected && this.network.role === 'host') {
                this.network.sendMessage('start-card-setting', { enabled: !!this.chooseCardOnStart });
            }
            
            // If match already started, send current state to the new joiner
            if (this.setupComplete) {
                this.network.broadcastState(this.getGameState());
            }
        };
        
        this.network.onPeerLeft = (joinerIndex) => {
            console.log('[Game] Peer left:', joinerIndex);
            // Remove from roster
            this.setupUI.onPeerLeft(joinerIndex);
            this._broadcastRosterUpdate();
            if (this.network.role === 'host') {
                this._updateReadyState(joinerIndex + 1, false);
            }
        };
        
        // Joiner callbacks
        this.network.onJoined = (code, joinerIndex, joinerName) => {
            console.log('[Game] Joined lobby:', code, 'as joiner', joinerIndex, joinerName || '');
            this.isMultiplayer = true;
            this._applyJoinerAudioStorage(joinerIndex);
            this.setupUI.onJoinedAsJoiner(code, joinerIndex, joinerName || null);
            this.setupUI.setMultiplayerMode(true);
            this._clearReadyStates(false);
            
            // Request initial roster state from host
            // The host will respond with a state broadcast
            // Immediately send our locally saved cursor settings to the host so they are present
            try {
                if (this.network && this.network.connected && this.network.role === 'joiner') {
                    let savedStyle = null;
                    let savedColor = null;
                    try {
                        savedStyle = localStorage.getItem('shape_shot_cursor') || null;
                        savedColor = localStorage.getItem('shape_shot_color') || null;
                    } catch (e) { }

                    if (savedStyle || savedColor) {
                        // Send cursor update without fighterId/slotIndex; host will map via joinerIndex
                        this.network.sendMessage('cursor-update', {
                            style: savedStyle,
                            color: savedColor,
                            fighterId: null,
                            slotIndex: null
                        });
                    }
                    // Send again shortly after to avoid race where host hasn't assigned the joiner slot yet
                    setTimeout(() => {
                        try {
                            const savedStyle2 = localStorage.getItem('shape_shot_cursor') || null;
                            const savedColor2 = localStorage.getItem('shape_shot_color') || null;
                            if (savedStyle2 || savedColor2) {
                                this.network.sendMessage('cursor-update', {
                                    style: savedStyle2,
                                    color: savedColor2,
                                    fighterId: null,
                                    slotIndex: null
                                });
                            }
                        } catch (e) {}
                    }, 450);
                }
            } catch (e) { console.warn('[Game] Failed to send initial cursor update to host', e); }
        };
        
        this.network.onHostLeft = () => {
            console.log('[Game] Host left the game');
            alert('Host disconnected from the game');
            this.reset();
            this.setupUI.show();
        };
        
        this.network.onStateUpdate = (state) => {
            // Joiner receives authoritative state from host
            this._applyStateUpdate(state);
        };
        
        this.network.onInputReceived = (joinerIndex, inputData) => {
            // Host receives input from joiner
            this._applyJoinerInput(joinerIndex, inputData);
        };
        
        this.network.onCardOffer = (data) => {
            this._receiveCardOffer(data);
        };

        this.network.onCardSelect = (data) => {
            this._handleJoinerCardSelection(data);
        };

        this.network.onCardApply = (data) => {
            this._handleCardApplyBroadcast(data);
        };

        this.network.onCardHover = (data) => {
            this._handleRemoteCardHover(data);
        };

        this.network.onDisplayNameChangeRequest = (data) => {
            this._handleDisplayNameChangeFromJoiner(data);
        };
        this.network.onCursorUpdateRequest = (data) => {
            this._handleCursorUpdateFromJoiner(data);
        };
        
        this.network.onRoundsUpdate = (data) => {
            // Joiner receives rounds-to-win update from host
            if (this.network.role === 'joiner' && data && typeof data.rounds === 'number') {
                const roundsValue = Math.min(Math.max(data.rounds, 1), 50);
                const roundsInput = document.getElementById('rounds-to-win');
                if (roundsInput) {
                    roundsInput.value = String(roundsValue);
                }
                // Save to localStorage on joiner as well
                try {
                    localStorage.setItem('shape_shot_rounds', String(roundsValue));
                } catch (e) {
                    console.warn('[Game] Failed to save rounds to localStorage on joiner:', e);
                }
            }
        };

        this.network.onReadyState = (data) => {
            if (!data) return;
            if (this.network.role === 'host') {
                if (typeof data.slotIndex === 'number') {
                    const joinerIndex = typeof data.joinerIndex === 'number' ? data.joinerIndex : null;
                    const updated = this._updateReadyState(data.slotIndex, !!data.ready, {
                        broadcast: false,
                        joinerIndex
                    });
                    if (updated) {
                        this._broadcastReadyStates();
                    }
                }
            } else if (this.network.role === 'joiner') {
                if (data.states && typeof data.states === 'object') {
                    this._applyReadyStatesFromHost(data.states);
                }
            }
        };

        this.network.onStartCardSetting = (data) => {
            if (this.network.role !== 'joiner' || !data) return;
            const enabled = !!data.enabled;
            const checkbox = document.getElementById('choose-card-on-start');
            if (checkbox) {
                checkbox.checked = enabled;
            }
            this.chooseCardOnStart = enabled;
            try {
                localStorage.setItem('shape_shot_choose_card_start', enabled ? '1' : '0');
            } catch (e) {
                console.warn('[Game] Failed to save choose-card-on-start setting on joiner:', e);
            }
        };
        
        this.network.onRoundReset = (data) => {
            // Joiner receives round reset from host (including initial match start)
            this._applyRoundReset(data);
            
            // If match hasn't started yet, start it now
            if (!this.setupComplete) {
                this.setupComplete = true;
                const initialRounds = this.match.getRoundsToWin ? this.match.getRoundsToWin() : this.match.roundsToWin;
                const roundsToUse = Number.isFinite(initialRounds) && initialRounds > 0 ? initialRounds : 10;
                this.match.startMatch(roundsToUse);
                this.setupUI.hide();
            }
        };
        
        this.network.onError = (message) => {
            console.error('[Game] Network error:', message);
            alert('Network error: ' + message);
        };
    }

    _initializeGameModes() {
        if (!this.modeManager) return;

        try {
            if (typeof EliminationMode === 'function') {
                this.modeManager.register(new EliminationMode());
            }
            if (typeof TeamEliminationMode === 'function') {
                this.modeManager.register(new TeamEliminationMode());
            }
        } catch (error) {
            console.warn('[Game] Failed to register game modes:', error);
        }

        this.modeManager.initialize('elimination');

        const options = this.modeManager.getModeOptions() || [];
        if (this.setupUI && typeof this.setupUI.setModeOptions === 'function') {
            const activeMode = this.modeManager.getActiveMode();
            const activeKey = activeMode && typeof activeMode.getKey === 'function' ? activeMode.getKey() : null;
            this.setupUI.setModeOptions(options, activeKey);
        }

        const activeMode = this.modeManager.getActiveMode();
        if (activeMode && typeof activeMode.onActivated === 'function') {
            activeMode.onActivated({ roster: this.roster, game: this });
        }

        this.modeManager.onRosterChanged();
        this._lastModeFlagsDigest = null;
        this._lastModeSettingsDigest = null;
        this._lastModeDescription = null;
        this._lastModeKey = null;
        this._syncModeUIState({ suppressRender: true });
    }

    _syncModeUIState(options = {}) {
        if (!this.modeManager || !this.setupUI) return;

        const activeMode = this.modeManager.getActiveMode();
        const rosterFlags = this.modeManager.getRosterFlags() || {};

        let flagsDigest = null;
        let flagsDigestable = false;
        try {
            flagsDigest = JSON.stringify(rosterFlags || {});
            flagsDigestable = true;
        } catch (error) {
            console.warn('[Game] Failed to serialize mode flags for digest:', error);
        }

        if (typeof this.setupUI.setModeFlags === 'function') {
            if (!flagsDigestable || this._lastModeFlagsDigest !== flagsDigest) {
                this.setupUI.setModeFlags(rosterFlags);
                this._lastModeFlagsDigest = flagsDigestable ? flagsDigest : null;
            }
        }

        const activeKey = activeMode && typeof activeMode.getKey === 'function' ? activeMode.getKey() : null;
        if (typeof this.setupUI.setActiveModeKey === 'function' && this._lastModeKey !== activeKey) {
            this.setupUI.setActiveModeKey(activeKey);
            this._lastModeKey = activeKey;
        }

        const description = activeMode && typeof activeMode.getDescription === 'function'
            ? (activeMode.getDescription() || '')
            : '';
        if (typeof this.setupUI.setModeDescription === 'function' && this._lastModeDescription !== description) {
            this.setupUI.setModeDescription(description);
            this._lastModeDescription = description;
        }

        if (typeof this.setupUI.setModeSettings === 'function') {
            const settings = this.modeManager.getActiveSetupSettings() || [];
            const values = this.modeManager.getSerializedSetupValues() || {};
            let settingsDigest = null;
            let settingsDigestable = false;
            try {
                settingsDigest = JSON.stringify({ settings, values });
                settingsDigestable = true;
            } catch (error) {
                console.warn('[Game] Failed to serialize mode settings for digest:', error);
            }
            if (!settingsDigestable || this._lastModeSettingsDigest !== settingsDigest) {
                this.setupUI.setModeSettings(settings, values);
                this._lastModeSettingsDigest = settingsDigestable ? settingsDigest : null;
            }
        }

        if (!options.suppressRender && this.setupUI && typeof this.setupUI.render === 'function') {
            this.setupUI.render();
        }
    }

    _handleModeChange(key) {
        if (!this.modeManager) return;
        const targetKey = key || this.modeManager.defaultKey;
        this.modeManager.setActiveMode(targetKey);
        const activeMode = this.modeManager.getActiveMode();
        if (activeMode && typeof activeMode.onActivated === 'function') {
            activeMode.onActivated({ roster: this.roster, game: this });
        }
        if (this.modeManager) {
            this.modeManager.onRosterChanged();
        }
        if (this.setupUI) {
            this._lastModeFlagsDigest = null;
            this._lastModeSettingsDigest = null;
            this._lastModeDescription = null;
            this._lastModeKey = null;
            this._syncModeUIState({ suppressRender: false });
        }
        if (!this.isMultiplayer || (this.network && this.network.role === 'host')) {
            this._broadcastRosterUpdate();
        }
    }

    _handleModeSettingsChange(values) {
        if (!this.modeManager) return;
        this.modeManager.applySetupValues(values || {});
        this._lastModeSettingsDigest = null;
        this._syncModeUIState({ suppressRender: false });
        if (!this.isMultiplayer || (this.network && this.network.role === 'host')) {
            this._broadcastRosterUpdate();
        }
    }

    _provideTeamOptions(slotIndex, fighter) {
        if (!this.modeManager) return null;
        const mode = this.modeManager.getActiveMode();
        if (!mode || typeof mode.getTeamOptionsForSlot !== 'function') return null;
        try {
            return mode.getTeamOptionsForSlot(slotIndex, fighter, this.roster);
        } catch (error) {
            console.warn('[Game] Failed to retrieve team options:', error);
            return null;
        }
    }

    _handleTeamAssignment(payloadOrSlot, fighterId, teamId, fighter) {
        if (!this.modeManager) return;
        const mode = this.modeManager.getActiveMode();
        if (!mode || typeof mode.assignFighterToTeam !== 'function') return;

        let resolvedSlot = null;
        let resolvedFighterId = null;
        let resolvedTeamId = null;
        let resolvedFighter = null;

        if (payloadOrSlot && typeof payloadOrSlot === 'object' && !Array.isArray(payloadOrSlot)) {
            resolvedSlot = payloadOrSlot.slotIndex ?? null;
            resolvedFighterId = payloadOrSlot.fighterId ?? null;
            resolvedTeamId = payloadOrSlot.teamId ?? null;
            resolvedFighter = payloadOrSlot.fighter ?? null;
        } else {
            resolvedSlot = payloadOrSlot;
            resolvedFighterId = fighterId ?? null;
            resolvedTeamId = teamId ?? null;
            resolvedFighter = arguments.length >= 4 ? arguments[3] : null;
        }

        if (!resolvedTeamId) return;

        let fighterInstance = resolvedFighter;
        if (!fighterInstance && resolvedFighterId) {
            fighterInstance = this.roster.getFighterById(resolvedFighterId);
        }
        if (!fighterInstance && typeof resolvedSlot === 'number') {
            fighterInstance = this.roster.getSlot(resolvedSlot);
        }

        const assignId = fighterInstance ? fighterInstance.id : resolvedFighterId;
        if (!assignId) return;

        mode.assignFighterToTeam(assignId, resolvedTeamId);
        this.modeManager.onRosterChanged();
        if (this.setupUI) {
            this.setupUI.render();
        }
        if (!this.isMultiplayer || (this.network && this.network.role === 'host')) {
            this._broadcastRosterUpdate();
        }
    }

    _buildModeNetworkPayload() {
        if (!this.modeManager) return null;
        const activeMode = this.modeManager.getActiveMode();
        if (!activeMode || typeof activeMode.getKey !== 'function') return null;
        return {
            key: activeMode.getKey(),
            setup: this.modeManager.getSerializedSetupValues() || {},
            state: this.modeManager.getSerializableState() || null
        };
    }

    _applyModeNetworkPayload(payload, options = {}) {
        if (!payload || !this.modeManager) return;

        if (this.isMultiplayer && this.network && this.network.role === 'joiner') {
            try {
                const digest = JSON.stringify(payload);
                if (this._lastReceivedModePayload === digest) {
                    return;
                }
                this._lastReceivedModePayload = digest;
            } catch (error) {
                console.warn('[Game] Failed to hash mode payload:', error);
            }
        }

        const targetKey = payload.key || this.modeManager.defaultKey;
        const currentMode = this.modeManager.getActiveMode();
        const currentKey = currentMode && typeof currentMode.getKey === 'function' ? currentMode.getKey() : null;
        if (targetKey && targetKey !== currentKey) {
            this.modeManager.setActiveMode(targetKey);
            const activeMode = this.modeManager.getActiveMode();
            if (activeMode && typeof activeMode.onActivated === 'function') {
                activeMode.onActivated({ roster: this.roster, game: this });
            }
        }
        if (payload.setup) {
            this.modeManager.applySetupValues(payload.setup);
        }
        if (payload.state) {
            this.modeManager.applySerializableState(payload.state);
        }
        this.modeManager.onRosterChanged();
        this._lastModeFlagsDigest = null;
        this._lastModeSettingsDigest = null;
        this._lastModeDescription = null;
        this._lastModeKey = null;
        this._syncModeUIState({ suppressRender: !!options.skipRosterRefresh });
    }

    _handleSetupRosterChanged() {
        if (this.modeManager) {
            this.modeManager.onRosterChanged();
            this._lastModeFlagsDigest = null;
            this._lastModeSettingsDigest = null;
            this._lastModeDescription = null;
            this._lastModeKey = null;
            this._syncModeUIState({ suppressRender: false });
        }
        if (!this.isMultiplayer || (this.network && this.network.role === 'host')) {
            this._broadcastRosterUpdate();
        }
    }

    startMatch() {
        this.roster.resetFighters();
        // Reset card runtime state and apply any configured start-of-round activations
        this.cards.reset();
        this.cards.applyStartWorldMods();
        const fightersForStart = this.roster.getAllFighters();
        this.cards.applyStartPowerupsToFighters(fightersForStart);
        
        // Create AI for bots only (not for remote joiners)
        this.botAIs = [];
        for (let bot of this.roster.getBotFighters()) {
            // Skip if this is a remote player's slot
            if (bot.metadata && bot.metadata.remote) continue;
            const botDifficulty = (bot.metadata && bot.metadata.botDifficulty) || bot.botDifficulty || 'normal';
            this.botAIs.push(new FighterAI(bot, { difficulty: botDifficulty }));
        }
        
        // Read obstacle settings from UI
        const densitySlider = document.getElementById('obstacle-density');
        const sizeSlider = document.getElementById('obstacle-size');
        const obstacleCount = densitySlider ? parseInt(densitySlider.value, 10) : 7;
        const obstacleSize = sizeSlider ? parseInt(sizeSlider.value, 10) : 110;
        
        // Read world modifier interval from UI
        const worldModIntervalSlider = document.getElementById('world-modifier-interval');
        const worldModInterval = worldModIntervalSlider ? parseInt(worldModIntervalSlider.value, 10) : 3;
        if (Number.isFinite(worldModInterval)) {
            this.match.worldModInterval = worldModInterval;
        }

        // Read rounds to win from UI
        const roundsInput = document.getElementById('rounds-to-win');
        let roundsToWin = roundsInput ? parseInt(roundsInput.value, 10) : 10;
        if (!Number.isFinite(roundsToWin) || roundsToWin < 1) {
            roundsToWin = 10;
        }
        roundsToWin = Math.min(Math.max(roundsToWin, 1), 50); // Clamp to 1-50
        
        // Save to localStorage
        try {
            localStorage.setItem('shape_shot_rounds', String(roundsToWin));
        } catch (e) {
            console.warn('[Game] Failed to save rounds to localStorage:', e);
        }
        
        // Map border toggle
        const mapBorderCheckbox = document.getElementById('map-border');
        this.mapBorderEnabled = mapBorderCheckbox ? !!mapBorderCheckbox.checked : true;

        const chooseCardCheckbox = document.getElementById('choose-card-on-start');
        const chooseCardOnStart = chooseCardCheckbox ? !!chooseCardCheckbox.checked : !!this.chooseCardOnStart;
        this.chooseCardOnStart = chooseCardOnStart;
        try {
            localStorage.setItem('shape_shot_choose_card_start', chooseCardOnStart ? '1' : '0');
        } catch (e) {
            console.warn('[Game] Failed to save choose-card-on-start setting:', e);
        }
        if (this.isMultiplayer && this.network.role === 'host' && this.network.connected) {
            this.network.sendMessage('start-card-setting', { enabled: chooseCardOnStart });
        }
        
        // Generate obstacles
        this.generateObstacles(obstacleCount, obstacleSize);
        this.impactLines = [];
        
        // Start match with specified rounds to win
        this.match.startMatch(roundsToWin);
        this.setupComplete = true;
        
        // If multiplayer host, broadcast initial state to joiners
        if (this.isMultiplayer && this.network.role === 'host') {
            // Send initial round reset with obstacles
            this.network.broadcastRoundReset(
                this.obstacles.map(o => (typeof o.serialize === 'function' ? o.serialize() : StateSerializer.serialize(o))),
                this.roster.getAllFighters().map(f => ({ id: f.id, x: f.x, y: f.y })),
                {
                    mapBorder: this.mapBorderEnabled,
                    worldModInterval: this.match.worldModInterval,
                    roundsToWin: roundsToWin,
                    chooseCardOnStart: chooseCardOnStart
                }
            );
        }

        if (chooseCardOnStart) {
            this._beginStartCardDraft();
        } else {
            this.cardSelectionQueue = [];
            this.initialCardDraftActive = false;
        }
    }

    generateObstacles(count, size) {
        this.obstacles = [];
        this.looseChunks = [];
        let tries = 0;
        let fighters = this.roster.getAllFighters();
        
        // Size determines min/max range: center around the slider value
        const sizeRange = size * 0.4; // 40% variance
        const minSize = Math.max(40, size - sizeRange);
        const maxSize = Math.min(200, size + sizeRange);
        
        // Determine how many obstacles should be loose chunks
        const clutterCount = this.cards.clutterActive ? Math.min(this.cards.clutterCardsPulled, count) : 0;
        let looseChunksCreated = 0;
        
        while (this.obstacles.length + Math.floor(looseChunksCreated / 6) < count && tries < 100) {
            tries++;
            let obstacleSize = rand(minSize, maxSize);
            let w = obstacleSize, h = obstacleSize;
            let x = rand(60, CANVAS_W - w - 60);
            let y = rand(60, CANVAS_H - h - 60);
            
            let centerX = x + w / 2;
            let centerY = y + h / 2;
            let safe = true;
            
            // Check distance from fighters
            for (let f of fighters) {
                let minDist = Math.max(w, h) * 0.6 + f.radius + 12;
                if (dist(centerX, centerY, f.x, f.y) <= minDist) {
                    safe = false;
                    break;
                }
            }
            
            // Check overlap with existing obstacles
            if (safe) {
                for (let o of this.obstacles) {
                    if (this.rectsOverlap({x, y, w, h}, o)) {
                        safe = false;
                        break;
                    }
                }
            }
            
            // Check overlap with existing loose chunks
            if (safe) {
                for (let chunk of this.looseChunks) {
                    if (this.rectsOverlap({x, y, w, h}, chunk)) {
                        safe = false;
                        break;
                    }
                }
            }
            
            if (safe) {
                // Decide if this obstacle should be loose chunks
                const shouldBeLoose = looseChunksCreated < clutterCount * 6; // 6 chunks per obstacle
                
                if (shouldBeLoose) {
                    // Create loose chunks instead of obstacle
                    const grid = 6;
                    let chunkW = w / grid;
                    let chunkH = h / grid;
                    
                    for (let i = 0; i < grid; i++) {
                        for (let j = 0; j < grid; j++) {
                            if (typeof LooseChunk !== 'undefined') {
                                this.looseChunks.push(new LooseChunk(
                                    x + i * chunkW,
                                    y + j * chunkH,
                                    chunkW,
                                    chunkH
                                ));
                            } else {
                                console.warn('LooseChunk class not available, skipping loose chunk creation');
                            }
                        }
                    }
                    looseChunksCreated += 6;
                } else {
                    this.obstacles.push(new Obstacle(x, y, w, h));
                }
            }
        }
    }
    
    rectsOverlap(a, b) {
        return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
    }

    start() {
        this.running = true;
        this.lastTime = performance.now();
        this.gameLoop();
    }

    stop() {
        this.running = false;
    }

    gameLoop() {
        if (!this.running) return;
        
        let now = performance.now();
        let dt = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;
        
        this.update(dt);
        
        // Update DOM round counter
        const gameState = this.getGameState();
        if (gameState.roundNum && gameState.totalRounds) {
            const roundCounter = document.getElementById('round-counter');
            if (roundCounter) {
                roundCounter.textContent = `Round ${gameState.roundNum}`;
                roundCounter.style.display = '';
            }
        } else {
            const roundCounter = document.getElementById('round-counter');
            if (roundCounter) {
                roundCounter.style.display = 'none';
            }
        }
        
        this.render.render(gameState);
        
        // Update card badges UI (separate from canvas rendering)
        this.cardsUI.update(this.roster.getAllFighters(), this.cards.activeMods);
        
        requestAnimationFrame(() => this.gameLoop());
    }

    update(dt) {
        if (!this.setupComplete) return;
        
        // Pause game during card selection
        if (this.waitingForCard && !this.activeCardSelection) {
            // Safety: if no active selection exists, resume the game loop
            this.waitingForCard = false;
        }
        if (this.waitingForCard) return;
        
        let fighters = this.roster.getAllFighters();

        if (this.isMultiplayer && this.network.role === 'joiner') {
            this._processJoinerSnapshots(dt);
            fighters = this.roster.getAllFighters();
        }

        this.match.setFighters(fighters);
        
        // Update input
        this.input.update();
        
        // MULTIPLAYER: If joiner, send input to host instead of processing locally
        if (this.isMultiplayer && this.network.role === 'joiner') {
            let localFighter = this.roster.getLocalFighter();
            if (localFighter && localFighter.alive && this.match.isRoundActive()) {
                let mouse = this.input.getMousePosition();
                const dashRequested = this.input.peekDashRequest();
                const shootQueued = this.input.peekShootRequest();
                const shootActive = this.input.isShootPressed() || shootQueued;

                const sent = this.network.sendInput(
                    this.input.getMovementKeys(),
                    mouse.x,
                    mouse.y,
                    shootActive,
                    dashRequested
                );

                if (sent) {
                    if (dashRequested) {
                        this.input.clearDashRequest();
                    }
                    if (shootQueued) {
                        this.input.clearShootRequest();
                    }
                }
            }
            this._updateFirestormAudio();
            if (this.impactLines && this.impactLines.length) {
                this._updateImpactLines(dt);
            }
            // Joiners don't process game logic - they just render state from host
            return;
        }
        
        // HOST or SINGLEPLAYER: Handle local player input
        let localFighter = this.roster.getLocalFighter();
        if (localFighter && localFighter.alive && this.match.isRoundActive()) {
            // Movement
            localFighter.move(this.input.getMovementKeys(), dt);
            const mouse = this.input.getMousePosition();
            localFighter.updateCursorAim(mouse.x, mouse.y);
            
            // Shooting
            if (this.input.isShootPressed() || this.input.consumeShoot()) {
                const aim = this._resolveAimTarget(localFighter, mouse.x, mouse.y, fighters);
                let newBullets = localFighter.shoot(aim.x, aim.y);
                if (newBullets) {
                    this.bullets.push(...newBullets);
                    this.audio.playGunShot();
                }
            }
            
            // Dashing
            if (this.input.consumeDash()) {
                const dashContext = {
                    obstacles: this.obstacles,
                    fighters,
                    infestedChunks: this.infestedChunks
                };
                if (localFighter.startDash(mouse.x, mouse.y, dashContext)) {
                    this.audio.playDashWoosh();
                }
            }
        }
        
        // HOST: Process joiner inputs (networked players)
        if (this.isMultiplayer && this.network.role === 'host' && this.match.isRoundActive()) {
            for (let fighter of fighters) {
                if (fighter.metadata && fighter.metadata.remote && fighter.alive) {
                    // This fighter is controlled by a remote joiner
                    // Input has been set via _applyJoinerInput callback
                    fighter.move(fighter.keys || {}, dt);
                    if (typeof fighter.mouseX === 'number' && typeof fighter.mouseY === 'number') {
                        fighter.updateCursorAim(fighter.mouseX, fighter.mouseY);
                    }
                    
                    if (fighter.shootRequested && typeof fighter.mouseX === 'number' && typeof fighter.mouseY === 'number') {
                        const aim = this._resolveAimTarget(fighter, fighter.mouseX, fighter.mouseY, fighters);
                        let newBullets = fighter.shoot(aim.x, aim.y);
                        if (newBullets) {
                            this.bullets.push(...newBullets);
                            this.audio.playGunShot();
                        }
                        fighter.shootRequested = false;
                    }
                    
                    if (fighter.dashRequested) {
                        const dashContext = {
                            obstacles: this.obstacles,
                            fighters,
                            infestedChunks: this.infestedChunks
                        };
                        const dashX = typeof fighter.mouseX === 'number' ? fighter.mouseX : fighter.x + 50;
                        const dashY = typeof fighter.mouseY === 'number' ? fighter.mouseY : fighter.y;
                        if (fighter.startDash(dashX, dashY, dashContext)) {
                            this.audio.playDashWoosh();
                        }
                        fighter.dashRequested = false;
                    }
                }
            }
        }
        
        // Update bot AI
        if (this.match.isRoundActive()) {
            for (let ai of this.botAIs) {
                ai.update(dt, fighters, this.obstacles);
                
                // Process bot actions
                let bot = ai.fighter;
                if (bot.alive) {
                    bot.move(bot.keys || {}, dt);
                    if (typeof bot.mouseX === 'number' && typeof bot.mouseY === 'number') {
                        bot.updateCursorAim(bot.mouseX, bot.mouseY);
                    }
                    
                    if (bot.shootRequested && typeof bot.mouseX === 'number' && typeof bot.mouseY === 'number') {
                        const aim = this._resolveAimTarget(bot, bot.mouseX, bot.mouseY, fighters);
                        let newBullets = bot.shoot(aim.x, aim.y);
                        if (newBullets) {
                            this.bullets.push(...newBullets);
                            this.audio.playGunShot();
                        }
                        bot.shootRequested = false;
                    }
                    
                    if (bot.dashRequested) {
                        const dashContext = {
                            obstacles: this.obstacles,
                            fighters,
                            infestedChunks: this.infestedChunks
                        };
                        const dashX = typeof bot.mouseX === 'number' ? bot.mouseX : bot.x + 50;
                        const dashY = typeof bot.mouseY === 'number' ? bot.mouseY : bot.y;
                        if (bot.startDash(dashX, dashY, dashContext)) {
                            this.audio.playDashWoosh();
                        }
                        bot.dashRequested = false;
                    }
                }
            }
        }
        
        // Update fighters
        for (let f of fighters) {
            f.update(dt);
        }

        // Check if waiting for death animations to finish
        if (this.waitingForDeathAnimations) {
            const anyDying = fighters.some(f => f && f.dying);
            if (!anyDying) {
                this.waitingForDeathAnimations = false;
                this._processCardSelectionQueue();
            }
        }

        let queuedGunshots = 0;
        for (let f of fighters) {
            if (typeof f.drainPendingBurstBullets === 'function') {
                const spawned = f.drainPendingBurstBullets();
                if (spawned && spawned.length) {
                    this.bullets.push(...spawned);
                }
            }
            if (typeof f.consumePendingGunshotBursts === 'function') {
                queuedGunshots += f.consumePendingGunshotBursts();
            }
        }
        for (let i = 0; i < queuedGunshots; i++) {
            this.audio.playGunShot();
        }
        
        // Update bullets
        for (let b of this.bullets) {
            const bounced = b.update(dt, false);
            if (bounced && this.audio && typeof this.audio.playRicochet === 'function') {
                this.audio.playRicochet();
            }
        }
        this.bullets = this.bullets.filter(b => b.active);
        
        // Update obstacles
        for (let o of this.obstacles) {
            o.update(dt);
        }
        
        // Update loose chunks
        for (let chunk of this.looseChunks) {
            chunk.update(dt);
        }
        this.looseChunks = this.looseChunks.filter(c => !c.destroyed || c.flying);
        
        // Handle spontaneous explosions
        for (let o of this.obstacles) {
            for (let c of o.chunks) {
                if (c.spontaneousGlow && c.spontaneousGlow.time >= c.spontaneousGlow.duration && !c.destroyed) {
                    // Mark as exploded to prevent multiple triggers
                    c.spontaneousExploded = true;
                    
                    // Explode with flying animation
                    c.destroyed = true;
                    c.flying = true;
                    const ang = Math.random() * Math.PI * 2;
                    const v = 200 + Math.random() * 100;
                    c.vx = Math.cos(ang) * v;
                    c.vy = Math.sin(ang) * v - 100;
                    c.alpha = 1;
                    
                    this._triggerSpontaneousExplosion(c);
                }
            }
        }
        
        // Update explosions
        for (let e of this.explosions) {
            e.update(dt, this.obstacles, fighters, this.healers, this.infestedChunks, this.looseChunks);
        }
        this.explosions = this.explosions.filter(e => !e.done);
        
        // Update firestorms
        for (let f of this.firestorms) {
            f.update(dt, this.obstacles, fighters, this.healers, this.infestedChunks, this.looseChunks);
        }
        this.firestorms = this.firestorms.filter(f => !f.done);
        this._updateFirestormAudio();
        
        // Update infested chunks
        for (let chunk of this.infestedChunks) {
            const wasActive = chunk.active;
            chunk.update(dt, fighters, this.healers);
            
            // Create explosion when chunk dies
            if (wasActive && !chunk.active) {
                const centerX = chunk.x + chunk.w/2;
                const centerY = chunk.y + chunk.h/2;
                this.explosions.push(new Explosion(centerX, centerY, 25, "#8f4f8f", 0, null, false));
                // Play poof sound when infested chunk dies
                this.audio.playSoftPoof();
            }
        }
        this.infestedChunks = this.infestedChunks.filter(c => c.active);
        
        // Update healers
        for (let healer of this.healers) {
            healer.update(dt, fighters, this.obstacles);
        }
        this.healers = this.healers.filter(h => h.active);
        
        // Update world modifiers
        this.cards.update(dt, this.obstacles, this.infestedChunks, this.firestorms, this.healers, this.looseChunks);
        this._updateFirestormAudio();
        
        // Update collisions
        if (this.match.isRoundActive()) {
            this.collision.update(this.bullets, fighters, this.obstacles, this.explosions, this.healers, this.infestedChunks, this.looseChunks);
        }

        if (this.impactLines && this.impactLines.length) {
            this._updateImpactLines(dt);
        }
        
        // Check for destroyed spontaneous glowing chunks and trigger immediate explosions
        for (let o of this.obstacles) {
            for (let c of o.chunks) {
                if (c.destroyed && c.spontaneousGlow && !c.spontaneousExploded) {
                    this._triggerSpontaneousExplosion(c);
                }
            }
        }
        
        // Check for destroyed spontaneous glowing loose chunks and trigger immediate explosions
        for (let lc of this.looseChunks) {
            if (lc.destroyed && lc.spontaneousGlow && !lc.spontaneousExploded) {
                this._triggerSpontaneousExplosion(lc);
            }
        }
        
        // Update match state
        if (!this.waitingForCard) {
            const activeMode = this.modeManager ? this.modeManager.getActiveMode() : null;
            let matchEvents = this.match.update(dt, fighters);
            if (matchEvents) {
                for (let event of matchEvents) {
                    if (event.event === 'elimination') {
                        let allowPowerup = this.cards.powerupsEnabled;
                        if (allowPowerup && activeMode && typeof activeMode.shouldOfferPowerupOnElimination === 'function') {
                            allowPowerup = !!activeMode.shouldOfferPowerupOnElimination({
                                fighter: event.fighter,
                                game: this,
                                event
                            });
                        }
                        if (allowPowerup) {
                            this.offerPowerUpToFighter(event.fighter);
                        }
                    } else if (event.event === 'round_end') {
                        // Check if we should offer world modifier
                        if (event.offerWorldMod && this.cards.worldModsEnabled) {
                            // Queue world mod selection instead of offering immediately
                            this.pendingWorldMod = {};
                        }

                        if (this.cards.powerupsEnabled && activeMode && typeof activeMode.getRoundEndPowerupRecipients === 'function') {
                            const recipients = activeMode.getRoundEndPowerupRecipients(event, {
                                game: this,
                                roster: this.roster
                            });
                            if (Array.isArray(recipients) && recipients.length) {
                                const seen = new Set();
                                if (!Array.isArray(this.cardSelectionQueue)) {
                                    this.cardSelectionQueue = [];
                                }
                                let queuedAny = false;
                                for (const entry of recipients) {
                                    if (!entry) continue;
                                    let fighter = entry;
                                    if (typeof entry === 'string') {
                                        fighter = this.roster.getFighterById(entry);
                                    }
                                    if (!fighter || seen.has(fighter.id)) continue;
                                    seen.add(fighter.id);
                                    this.cardSelectionQueue.push({
                                        fighter,
                                        source: 'round-end',
                                        allowDead: true
                                    });
                                    queuedAny = true;
                                }
                                if (queuedAny) {
                                    this.waitingForDeathAnimations = true;
                                    // Don't call _processCardSelectionQueue yet
                                }
                            }
                        }
                    }
                }
            }
        }
        
        if (this.match.isRoundEnding()) {
            this.match.updateRoundEndTimer(dt, (event) => {
                if (event.event === 'match_end') {
                    console.log('Match winner:', event.winner.name);
                } else if (event.event === 'next_round') {
                    this.resetRound();
                }
            });
        }
        
        // Broadcast state to joiners (host only)
        if (this.isMultiplayer && this.network.role === 'host') {
            const now = Date.now();
            if (now - this.lastStateBroadcast >= this.stateBroadcastInterval) {
                this.network.broadcastState(this.createNetworkSnapshot());
                this.lastStateBroadcast = now;
            }
        }
    }

    offerPowerUpToFighter(fighter, options = {}) {
        if (!this.cards.powerupsEnabled) return;

        let choices = options.choices;
        if (!choices || choices.length === 0) {
            const enabledCards = POWERUPS.filter(card => this.cards.isPowerupEnabled(card.name));
            if (!enabledCards.length) return;
            const selectionCount = Math.min(5, enabledCards.length);
            const chooser = (typeof weightedSampleWithoutReplacement === 'function')
                ? weightedSampleWithoutReplacement
                : (arr, count) => randomChoice(arr, count);
            choices = chooser(enabledCards, selectionCount, (card) => {
                const weights = typeof POWERUP_RARITY_WEIGHTS !== 'undefined' ? POWERUP_RARITY_WEIGHTS : null;
                return weights && weights[card.rarity] ? weights[card.rarity] : 1;
            });
        } else {
            choices = choices.map(choice => {
                if (!choice) return null;
                if (typeof choice === 'string') {
                    return (typeof POWERUP_LOOKUP !== 'undefined' && POWERUP_LOOKUP[choice]) ? POWERUP_LOOKUP[choice] : null;
                }
                if (choice.name && typeof POWERUP_LOOKUP !== 'undefined') {
                    return POWERUP_LOOKUP[choice.name] || choice;
                }
                return choice;
            }).filter(Boolean);
        }

        if (!choices || choices.length === 0) return;

        const normalizedChoices = choices.map(card => ({
            name: card.name,
            desc: card.desc,
            rarity: card.rarity,
            rarityLabel: card.rarityLabel,
            rarityColor: card.rarityColor,
            lines: Array.isArray(card.lines) ? card.lines : []
        }));

        const selection = this._createCardSelection({
            type: 'powerup',
            fighter: fighter || null,
            fighterId: options.fighterId || (fighter ? fighter.id : null),
            choices: normalizedChoices,
            joinerIndex: options.joinerIndex !== undefined ? options.joinerIndex : this._getJoinerIndexForFighter(fighter || null),
            fighterColor: options.fighterColor || (fighter ? fighter.color : '#fff'),
            fromNetwork: !!options.fromNetwork
        });

        const interactiveOverride = (fighter && fighter.isBot) ? false : undefined;
        this._showCardSelection(selection, { interactive: interactiveOverride });

        if (this.isMultiplayer && this.network.role === 'host' && !options.fromNetwork) {
            const slotIndex = fighter ? fighter.slotIndex : null;
            this.network.broadcastCardOffer(
                selection.fighterId,
                selection.choices,
                slotIndex,
                selection.joinerIndex,
                'powerup',
                selection.fighterColor
            );
        }

        if (fighter && fighter.isBot && !options.fromNetwork) {
            this._handleBotPowerupSelection(selection);
        }
    }

    offerWorldModifier(options = {}) {
        if (!this.cards.worldModsEnabled) return;

        let choices = options.choices;
        if (!choices || choices.length === 0) {
            // Filter to only enabled cards
            let enabledMods = WORLD_MODIFIERS.filter(m => this.cards.isWorldModEnabled(m.name));
            let available = enabledMods.filter(m => !this.cards.usedWorldMods[m.name]);
            const pool = available.length >= 3 ? available : enabledMods;
            if (pool.length === 0) return; // No enabled mods available
            choices = randomChoice(pool, Math.min(3, pool.length));
        } else {
            choices = choices.map(choice => {
                if (!choice) return null;
                if (typeof choice === 'string') {
                    const ref = WORLD_MODIFIERS.find(m => m.name === choice) || { name: choice, desc: '' };
                    return { name: ref.name, desc: ref.desc };
                }
                return { name: choice.name, desc: choice.desc };
            }).filter(Boolean);
        }

        if (!choices || choices.length === 0) return;

        const selection = this._createCardSelection({
            type: 'world',
            fighter: null,
            fighterId: null,
            choices,
            joinerIndex: null,
            fighterColor: options.fighterColor || '#a06cc7',
            fromNetwork: !!options.fromNetwork
        });

        this._showCardSelection(selection);

        if (this.isMultiplayer && this.network.role === 'host' && !options.fromNetwork) {
            this.network.broadcastCardOffer(null, selection.choices, null, null, 'world', selection.fighterColor);
        }
    }

    _beginStartCardDraft() {
        if (!this.cards.powerupsEnabled) {
            this.cardSelectionQueue = [];
            this.initialCardDraftActive = false;
            return;
        }
        if (this.isMultiplayer && this.network.role === 'joiner') {
            return;
        }

        const fighters = this.roster.getAllFighters().filter(f => f && f.alive);
        if (!fighters.length) {
            this.cardSelectionQueue = [];
            this.initialCardDraftActive = false;
            return;
        }

        fighters.sort((a, b) => (a.slotIndex || 0) - (b.slotIndex || 0));

        if (!Array.isArray(this.cardSelectionQueue)) {
            this.cardSelectionQueue = [];
        }

        this.cardSelectionQueue = this.cardSelectionQueue.filter(entry => entry && entry.source !== 'start-draft');

        for (const fighter of fighters) {
            this.cardSelectionQueue.push({ fighter, source: 'start-draft' });
        }

        this.initialCardDraftActive = true;
        this._processCardSelectionQueue();
    }

    _processCardSelectionQueue() {
        if (this.isMultiplayer && this.network.role === 'joiner') {
            this.cardSelectionQueue = [];
            this.initialCardDraftActive = false;
            return;
        }

        if (!this.cards.powerupsEnabled) {
            this.cardSelectionQueue = [];
            this.initialCardDraftActive = false;
            return;
        }

        if (!Array.isArray(this.cardSelectionQueue)) {
            this.cardSelectionQueue = [];
        }

        if (this.waitingForCard || this.activeCardSelection) {
            return;
        }

        if (!this.cardSelectionQueue.length) {
            if (this.initialCardDraftActive) {
                this.initialCardDraftActive = false;
            }
            return;
        }

        const entry = this.cardSelectionQueue.shift();
        if (!entry || !entry.fighter) {
            this._processCardSelectionQueue();
            return;
        }

        const fighter = this.roster.getFighterById(entry.fighter.id) || entry.fighter;
        const allowDead = entry.allowDead === true;
        if (!fighter || (!fighter.alive && !allowDead)) {
            this._processCardSelectionQueue();
            return;
        }

        this.offerPowerUpToFighter(fighter, entry.options || {});

        if (!this.waitingForCard && !this.activeCardSelection) {
            this._processCardSelectionQueue();
        }
    }

    _createCardSelection(params) {
        if (this.activeCardSelection) {
            this._clearActiveCardSelection();
        }

        const selection = {
            type: params.type,
            fighter: params.fighter || null,
            fighterId: params.fighter ? params.fighter.id : (params.fighterId !== undefined ? params.fighterId : null),
            choices: (params.choices || []).map(choice => ({
                name: choice.name,
                desc: choice.desc || '',
                rarity: choice.rarity || (typeof POWERUP_LOOKUP !== 'undefined' && POWERUP_LOOKUP[choice.name] ? POWERUP_LOOKUP[choice.name].rarity : null),
                rarityLabel: choice.rarityLabel || (typeof POWERUP_RARITY_LABELS !== 'undefined' && choice.rarity ? POWERUP_RARITY_LABELS[choice.rarity] : null),
                rarityColor: choice.rarityColor || (typeof POWERUP_RARITY_COLORS !== 'undefined' && choice.rarity ? POWERUP_RARITY_COLORS[choice.rarity] : null),
                lines: Array.isArray(choice.lines) ? choice.lines : (typeof POWERUP_LOOKUP !== 'undefined' && POWERUP_LOOKUP[choice.name] ? POWERUP_LOOKUP[choice.name].lines || [] : [])
            })),
            joinerIndex: typeof params.joinerIndex === 'number' ? params.joinerIndex : null,
            fighterColor: params.fighterColor || (params.fighter ? params.fighter.color : '#fff'),
            fromNetwork: !!params.fromNetwork,
            timeouts: [],
            lastBroadcastHoverIndex: undefined,
            lastReceivedHoverIndex: undefined,
            pendingChoice: null
        };

        selection.isLocalChooser = this._determineLocalChooser(selection);

        this.activeCardSelection = selection;
        this.waitingForCard = true;

        return selection;
    }

    _determineLocalChooser(selection) {
        if (!this.isMultiplayer) return true;

        if (selection.type === 'world') {
            return this.network.role === 'host';
        }

        const fighter = selection.fighter;

        if (this.network.role === 'host') {
            if (!fighter) return false;
            return !!fighter.isLocal && !(fighter.metadata && fighter.metadata.remote);
        }

        if (this.network.role === 'joiner') {
            const joinerIdx = this.network.joinerIndex;
            if (joinerIdx === null) return false;

            if (selection.joinerIndex === null) {
                // Host's turn - joiners only spectate
                return false;
            }

            if (selection.joinerIndex === joinerIdx) {
                return true;
            }

            if (!fighter) {
                return false;
            }

            const fighterJoiner = (fighter.metadata && typeof fighter.metadata.joinerIndex === 'number')
                ? fighter.metadata.joinerIndex
                : null;
            return fighterJoiner === joinerIdx;
        }

        return false;
    }

    _showCardSelection(selection, overrideOptions = {}) {
        if (!selection) return;

        const interactive = typeof overrideOptions.interactive === 'boolean'
            ? overrideOptions.interactive
            : selection.isLocalChooser;

        const cardOptions = { interactive };
        if (interactive) {
            cardOptions.onHover = (index) => this._handleLocalCardHover(selection, index);
            cardOptions.onHoverEnd = () => this._handleLocalCardHover(selection, null);
        }
        const info = this._buildCardSelectionInfo(selection);
        if (info) {
            cardOptions.turnLabel = info.turnLabel;
            cardOptions.queuedLabel = info.queuedLabel;
        }

        this.cardUI.show(
            selection.choices,
            (cardName) => this._handleLocalCardSelection(selection, cardName),
            selection.fighterColor,
            cardOptions
        );

        if (!interactive) {
            this.cardUI.clearHighlight();
        }
    }

    _buildCardSelectionInfo(selection) {
        if (!selection) return { turnLabel: '', queuedLabel: '' };

        const info = { turnLabel: '', queuedLabel: '' };
        const isLocalChooser = !!selection.isLocalChooser;

        if (selection.type === 'powerup') {
            let fighterName = selection.fighter && selection.fighter.name ? selection.fighter.name : null;
            let fighterColor = selection.fighter && selection.fighter.color ? selection.fighter.color : null;
            if ((!fighterName || !fighterColor) && selection.fighterId != null) {
                const fighter = this.roster.getFighterById(selection.fighterId);
                if (fighter) {
                    if (!fighterName && fighter.name) {
                        fighterName = fighter.name;
                    }
                    if (!fighterColor && fighter.color) {
                        fighterColor = fighter.color;
                    }
                }
            }

            if (fighterName) {
                const safeName = this._escapeHtml(fighterName);
                let displayName = safeName;
                if (fighterColor) {
                    const safeColor = this._clampHexColor(fighterColor);
                    displayName = `<span class="card-chooser-name" style="color:${safeColor};">${safeName}</span>`;
                }
                info.turnLabel = isLocalChooser
                    ? `${displayName}, choose a card`
                    : `${displayName} is choosing a card`;
            } else {
                info.turnLabel = isLocalChooser ? 'Choose a card' : 'Card selection in progress';
            }

            if (this.pendingWorldMod) {
                info.queuedLabel = 'World Modifier up next';
            }
        } else if (selection.type === 'world') {
            const role = this.network ? this.network.role : null;
            if (!this.isMultiplayer) {
                info.turnLabel = 'Choose a World Modifier';
            } else if (selection.isLocalChooser && role === 'host') {
                info.turnLabel = 'Choose a World Modifier';
            } else {
                info.turnLabel = 'Host is choosing a World Modifier';
            }
        }

        return info;
    }

    _clampHexColor(color) {
        if (!color) return '#ffffff';
        if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) {
            if (color.length === 4) {
                return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`.toLowerCase();
            }
            return color.toLowerCase();
        }
        return '#ffffff';
    }

    _escapeHtml(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    _handleBotPowerupSelection(selection) {
        if (!selection || !selection.fighter) {
            this._clearActiveCardSelection();
            return;
        }

        const ai = this.botAIs.find(bot => bot.fighter === selection.fighter);
        const chosenCard = ai ? ai.selectCard(selection.choices) : (selection.choices[0] ? selection.choices[0].name : null);
        if (!chosenCard) {
            this._clearActiveCardSelection();
            return;
        }

        const chosenIndex = selection.choices.findIndex(choice => choice.name === chosenCard);

        const highlightTimeout = setTimeout(() => {
            this.cardUI.selectCard(chosenCard);
            if (this.isMultiplayer && this.network.role === 'host' && chosenIndex >= 0) {
                this.network.broadcastCardHover(selection.fighterId, chosenIndex, selection.joinerIndex, selection.type, null);
            }

            const finalizeTimeout = setTimeout(() => {
                this._finalizeCardSelection(selection, chosenCard, { broadcast: this.isMultiplayer && this.network.role === 'host' });
            }, 800);
            selection.timeouts.push(finalizeTimeout);
        }, 1000);

        selection.timeouts.push(highlightTimeout);
    }

    _handleLocalCardSelection(selection, cardName) {
        if (!selection || !cardName) return;

        const choiceIndex = selection.choices.findIndex(choice => choice.name === cardName);

        if (this.isMultiplayer) {
            if (this.network.role === 'joiner') {
                this.cardUI.setInteractionEnabled(false);
                if (choiceIndex >= 0) {
                    this.cardUI.highlightCard(choiceIndex);
                }
                this.network.sendCardSelection(cardName, selection.fighterId, selection.type);
                selection.pendingChoice = cardName;
                return;
            }

            if (this.network.role === 'host') {
                if (choiceIndex >= 0) {
                    this.cardUI.highlightCard(choiceIndex);
                    this.network.broadcastCardHover(selection.fighterId, choiceIndex, selection.joinerIndex, selection.type, null);
                }
                this._finalizeCardSelection(selection, cardName, { broadcast: true });
                return;
            }
        }

        if (choiceIndex >= 0) {
            this.cardUI.highlightCard(choiceIndex);
        }
        this._finalizeCardSelection(selection, cardName, { broadcast: false });
    }

    _handleLocalCardHover(selection, cardIndex) {
        if (!selection || !this.isMultiplayer || !selection.isLocalChooser) return;

        if (selection.lastBroadcastHoverIndex === cardIndex) return;
        selection.lastBroadcastHoverIndex = cardIndex;

        if (this.network.role === 'host') {
            this.network.broadcastCardHover(selection.fighterId, cardIndex, selection.joinerIndex, selection.type, null);
        } else if (this.network.role === 'joiner') {
            this.network.sendCardHover(selection.fighterId, cardIndex, selection.type);
        }
    }

    _handleJoinerCardSelection(data) {
        if (this.network.role !== 'host' || !data) return;

    const selection = this.activeCardSelection;
    const selectionType = data.selectionType || 'powerup';
    if (!selection || selection.type !== selectionType) return;

    // Only the targeted joiner should be able to respond; host selections ignore joiner messages entirely
    if (selection.joinerIndex === null) return;
    if (data.joinerIndex !== selection.joinerIndex) return;
        if (selection.type === 'powerup' && selection.fighterId && data.fighterId && selection.fighterId !== data.fighterId) return;

        const cardName = data.cardName;
        if (!cardName) return;

        const choiceIndex = selection.choices.findIndex(choice => choice.name === cardName);
        if (choiceIndex >= 0) {
            this.cardUI.selectCard(cardName);
            const origin = data.originJoinerIndex !== undefined ? data.originJoinerIndex : (data.joinerIndex !== undefined ? data.joinerIndex : null);
            this.network.broadcastCardHover(selection.fighterId, choiceIndex, selection.joinerIndex, selection.type, origin);
        }

        this._finalizeCardSelection(selection, cardName, { broadcast: true });
    }

    _handleCardApplyBroadcast(data) {
        if (!data) return;

        const selectionType = data.selectionType || 'powerup';
        const cardName = data.cardName;
        if (!cardName) {
            this._clearActiveCardSelection();
            return;
        }

        if (this.cardUI && this.cardUI.isActive()) {
            this.cardUI.selectCard(cardName);
        }

        if (selectionType === 'powerup') {
            const fighter = this.roster.getFighterById(data.fighterId);
            if (fighter) {
                fighter.applyCard(cardName);
            }
        } else if (selectionType === 'world') {
            this.cards.applyWorldMod(cardName);
        }

        // Ensure joiners always resume gameplay once the selection is resolved
        this.waitingForCard = false;
        this._clearActiveCardSelection();
    }

    _handleRemoteCardHover(data) {
        if (!data) return;

        const selection = this.activeCardSelection;
        if (!selection) return;

        const selectionType = data.selectionType || 'powerup';
        if (selection.type !== selectionType) return;

        if (selection.type === 'powerup') {
            const targetId = data.fighterId || selection.fighterId;
            if (selection.fighterId && targetId && selection.fighterId !== targetId) {
                return;
            }
        }

        if (this.network.role === 'joiner' && typeof data.originJoinerIndex === 'number' && data.originJoinerIndex === this.network.joinerIndex) {
            return;
        }

        if (typeof data.cardIndex === 'number' && data.cardIndex >= 0) {
            this.cardUI.highlightCard(data.cardIndex);
            selection.lastReceivedHoverIndex = data.cardIndex;
        } else {
            this.cardUI.clearHighlight();
            selection.lastReceivedHoverIndex = null;
        }

        if (this.network.role === 'host' && typeof data.originJoinerIndex === 'number') {
            this.network.broadcastCardHover(
                selection.fighterId,
                typeof data.cardIndex === 'number' ? data.cardIndex : null,
                selection.joinerIndex,
                selection.type,
                data.originJoinerIndex
            );
        }
    }

    _finalizeCardSelection(selection, cardName, options = {}) {
        console.log('[Game] _finalizeCardSelection called:', { type: selection?.type, cardName, options });
        
        if (!selection || !cardName) {
            console.log('[Game] No selection or cardName, clearing');
            this._clearActiveCardSelection();
            return;
        }

        if (selection.type === 'powerup') {
            const fighter = selection.fighter || this.roster.getFighterById(selection.fighterId);
            if (fighter) {
                fighter.applyCard(cardName);
                console.log(`${fighter.name} selected: ${cardName}`);
            }
        } else if (selection.type === 'world') {
            console.log('[Game] Applying world modifier:', cardName);
            this.cards.applyWorldMod(cardName);
            console.log(`World Modifier activated: ${cardName}`);
        }

        if (this.isMultiplayer && this.network.role === 'host' && options.broadcast) {
            this.network.broadcastCardApply(selection.fighterId, cardName, selection.joinerIndex, selection.type);
        }

        // Check if there's a pending world mod selection after powerup selection
        if (selection.type === 'powerup' && this.pendingWorldMod) {
            this.pendingWorldMod = null; // Clear the pending flag
            // Offer world modifier after powerup selection completes
            this.offerWorldModifier();
            return; // Don't clear active selection yet - world mod selection will handle it
        }

        this._clearActiveCardSelection();
        this._processCardSelectionQueue();
    }

    _clearActiveCardSelection() {
        if (this.activeCardSelection && Array.isArray(this.activeCardSelection.timeouts)) {
            for (const timeoutId of this.activeCardSelection.timeouts) {
                clearTimeout(timeoutId);
            }
        }

        this.activeCardSelection = null;
        this.waitingForCard = false;
        this.cardUI.hide();
    }

    _getJoinerIndexForFighter(fighter) {
        if (!fighter || !fighter.metadata) return null;
        return typeof fighter.metadata.joinerIndex === 'number' ? fighter.metadata.joinerIndex : null;
    }

    _receiveCardOffer(data) {
        if (!data) return;

        const selectionType = data.selectionType || 'powerup';

        if (selectionType === 'powerup') {
            const choices = Array.isArray(data.choices)
                ? data.choices.map(choice => {
                    if (!choice) return null;
                    if (typeof choice === 'string') {
                        return (typeof POWERUP_LOOKUP !== 'undefined' && POWERUP_LOOKUP[choice]) ? POWERUP_LOOKUP[choice] : null;
                    }
                    if (choice.name && typeof POWERUP_LOOKUP !== 'undefined') {
                        const reference = POWERUP_LOOKUP[choice.name];
                        if (reference) {
                            return Object.assign({}, reference, {
                                rarity: choice.rarity || reference.rarity,
                                rarityLabel: choice.rarityLabel || reference.rarityLabel,
                                rarityColor: choice.rarityColor || reference.rarityColor,
                                lines: Array.isArray(choice.lines) ? choice.lines : reference.lines
                            });
                        }
                    }
                    return choice;
                }).filter(Boolean)
                : [];

            let fighter = data.fighterId ? this.roster.getFighterById(data.fighterId) : null;
            if (!fighter && typeof data.slotIndex === 'number') {
                fighter = this.roster.getSlot(data.slotIndex);
            }

            this.offerPowerUpToFighter(fighter, {
                choices,
                fighterId: data.fighterId || null,
                joinerIndex: typeof data.joinerIndex === 'number' ? data.joinerIndex : null,
                fighterColor: data.fighterColor || (fighter ? fighter.color : '#fff'),
                fromNetwork: true
            });

        } else if (selectionType === 'world') {
            const choices = Array.isArray(data.choices)
                ? data.choices.map(choice => {
                    if (!choice) return null;
                    if (typeof choice === 'string') {
                        const ref = WORLD_MODIFIERS.find(m => m.name === choice) || { name: choice, desc: '' };
                        return { name: ref.name, desc: ref.desc };
                    }
                    return { name: choice.name, desc: choice.desc };
                }).filter(Boolean)
                : [];

            this.offerWorldModifier({
                choices,
                fighterColor: data.fighterColor || '#a06cc7',
                fromNetwork: true
            });
        }
    }

    getGameState() {
        return {
            fighters: this.roster.getAllFighters(),
            bullets: this.bullets,
            obstacles: this.obstacles,
            explosions: this.explosions,
            firestorms: this.firestorms,
            infestedChunks: this.infestedChunks,
            looseChunks: this.looseChunks,
            healers: this.healers,
            roundNum: this.match.getRoundNum(),
            totalRounds: this.match.getRoundsToWin(),
            roundActive: this.match.isRoundActive(),
            matchActive: this.match.isMatchActive(),
            activeMods: this.cards.activeMods,
            showScoreboard: this.remoteShowScoreboard,
            winner: this.match.getWinner(),
            cardSystem: this.cards,
            impactLines: this.impactLines,
            mapBorder: this.mapBorderEnabled,
            worldModInterval: this.match.worldModInterval,
            scoreboardEntries: this._resolveScoreboardEntries(),
            mode: this._buildModeNetworkPayload()
        };
    }

    _resolveScoreboardEntries() {
        if (this.isMultiplayer && this.network && this.network.role === 'joiner') {
            if (Array.isArray(this._remoteScoreboardEntries) && this._remoteScoreboardEntries.length) {
                return this._remoteScoreboardEntries.map(entry => Object.assign({}, entry));
            }
            return null;
        }

        if (!this.modeManager) return null;

        try {
            const fighters = this.roster.getAllFighters();
            const entries = this.modeManager.getScoreboardEntries(fighters);
            if (!Array.isArray(entries) || entries.length === 0) {
                return null;
            }
            return entries.map(entry => Object.assign({}, entry));
        } catch (error) {
            console.warn('[Game] Failed to resolve scoreboard entries:', error);
            return null;
        }
    }

    _spawnImpactLines(x, y, damage, color, baseAngle) {
        const MIN_VISIBLE_DAMAGE = 6;
        if (!damage || damage <= MIN_VISIBLE_DAMAGE) return;

        const REF_MAX = 48;
        const norm = Math.max(0, Math.min(1, (damage - MIN_VISIBLE_DAMAGE) / (REF_MAX - MIN_VISIBLE_DAMAGE)));
        const maxCount = 12;
        const count = Math.round(Math.pow(norm, 1.25) * maxCount);
        if (count <= 0) return;

        const speed = 300 + norm * 400;
        const life = 0.04 + norm * 0.36;
        const resolvedColor = color || '#ffd966';

        for (let i = 0; i < count; i += 1) {
            let angle;
            if (typeof baseAngle === 'number' && Number.isFinite(baseAngle)) {
                const jitter = (Math.random() - 0.5) * 0.35;
                const offset = (i - (count - 1) / 2) * (Math.PI * 0.10);
                angle = baseAngle + offset + jitter;
            } else {
                const diag = Math.random() < 0.5 ? (Math.PI / 4) : (-Math.PI / 4);
                const jitter = (Math.random() - 0.5) * 0.35;
                angle = diag + jitter + (Math.random() * Math.PI * 0.14 - Math.PI * 0.07);
            }

            const mag = speed * (0.6 + Math.random() * 0.8);
            const width = 0.35 + Math.pow(norm, 1.6) * 3.2;
            const alphaScale = 0.06 + Math.pow(norm, 1.4) * 1.8;

            this.impactLines.push({
                x,
                y,
                vx: Math.cos(angle) * mag,
                vy: Math.sin(angle) * mag,
                life,
                t: 0,
                color: resolvedColor,
                width,
                alphaScale
            });
        }
    }

    _updateImpactLines(dt) {
        if (!this.impactLines || this.impactLines.length === 0) return;
        const delta = Number.isFinite(dt) ? Math.max(0, dt) : 0;
        for (let i = this.impactLines.length - 1; i >= 0; i -= 1) {
            const line = this.impactLines[i];
            line.t += delta;
            if (line.t >= line.life) {
                this.impactLines.splice(i, 1);
            }
        }
    }

    createNetworkSnapshot() {
        const fighters = this.roster.getAllFighters();

        const fighterState = fighters.map(fighter => {
            if (typeof fighter.serialize === 'function') {
                return fighter.serialize();
            }
            return StateSerializer.serialize(fighter, {
                exclude: ['keys', 'mouseX', 'mouseY', 'shootRequested', 'dashRequested']
            });
        });

        const selectionState = this.activeCardSelection ? {
            type: this.activeCardSelection.type,
            fighterId: this.activeCardSelection.fighterId,
            joinerIndex: this.activeCardSelection.joinerIndex,
            isLocalChooser: !!this.activeCardSelection.isLocalChooser
        } : null;

        const bulletState = this.bullets.map(bullet => {
            if (typeof bullet.serialize === 'function') {
                return bullet.serialize();
            }
            return StateSerializer.serialize(bullet, {
                exclude: ['owner'],
                augment: {
                    ownerId: bullet.owner && bullet.owner.id ? bullet.owner.id : null,
                    ownerColor: bullet.owner && bullet.owner.color ? bullet.owner.color : '#ffffff'
                }
            });
        });

        const explosionState = this.explosions.map(explosion => {
            if (typeof explosion.serialize === 'function') {
                return explosion.serialize();
            }
            return StateSerializer.serialize(explosion, {
                exclude: ['owner']
            });
        });

        const firestormState = this.firestorms.map(firestorm => {
            if (typeof firestorm.serialize === 'function') {
                return firestorm.serialize();
            }
            return StateSerializer.serialize(firestorm, {
                exclude: ['damagedFighters', 'damagedObstacles']
            });
        });

        const infestedState = this.infestedChunks.map(chunk => {
            if (typeof chunk.serialize === 'function') {
                return chunk.serialize();
            }
            return StateSerializer.serialize(chunk);
        });

        const looseState = this.looseChunks.map(chunk => {
            if (typeof chunk.serialize === 'function') {
                return chunk.serialize();
            }
            return StateSerializer.serialize(chunk);
        });

        const obstacleState = this.obstacles.map(obstacle => {
            if (typeof obstacle.serialize === 'function') {
                return obstacle.serialize();
            }
            return StateSerializer.serialize(obstacle);
        });

        const healerState = this.healers.map(healer => {
            if (typeof healer.serialize === 'function') {
                return healer.serialize();
            }
            return StateSerializer.serialize(healer, {
                exclude: ['_lastAttacker']
            });
        });

        return {
            fighters: fighterState,
            bullets: bulletState,
            explosions: explosionState,
            firestorms: firestormState,
            infestedChunks: infestedState,
            looseChunks: looseState,
            obstacles: obstacleState,
            healers: healerState,
            activeMods: this.cards.activeMods.slice(),
            usedWorldMods: Object.assign({}, this.cards.usedWorldMods),
            firestormPreSpawnPos: this.cards.firestormPreSpawnPos ? {
                x: this.cards.firestormPreSpawnPos.x,
                y: this.cards.firestormPreSpawnPos.y,
                radius: this.cards.firestormPreSpawnPos.radius
            } : null,
            firestormCardsPulled: this.cards.firestormCardsPulled,
            healersActive: this.cards.healersActive,
            healersCardsPulled: this.cards.healersCardsPulled,
            healerPendingRespawn: this.cards.healerPendingRespawn,
            healerRespawnTimer: this.cards.healerRespawnTimer,
            healerRespawnDelay: this.cards.healerRespawnDelay,
            healerPreSpawnPos: this.cards.healerPreSpawnPos ? {
                x: this.cards.healerPreSpawnPos.x,
                y: this.cards.healerPreSpawnPos.y,
                radius: this.cards.healerPreSpawnPos.radius || 0,
                progress: this.cards.healerPreSpawnPos.progress || 0,
                timeRemaining: this.cards.healerPreSpawnPos.timeRemaining || 0
            } : null,
            healerNextSpawnPos: this.cards.healerNextSpawnPos ? {
                x: this.cards.healerNextSpawnPos.x,
                y: this.cards.healerNextSpawnPos.y
            } : null,
            healerTelegraphDuration: this.cards.healerTelegraphDuration,
            scoreboardEntries: this._resolveScoreboardEntries(),
            mode: this._buildModeNetworkPayload(),
            impactLines: this.impactLines.map(line => ({
                x: line.x,
                y: line.y,
                vx: line.vx,
                vy: line.vy,
                life: line.life,
                t: line.t,
                color: line.color,
                width: line.width,
                alphaScale: line.alphaScale
            })),
            roundNum: this.match.getRoundNum(),
            totalRounds: this.match.getRoundsToWin(),
            roundActive: this.match.isRoundActive(),
            matchActive: this.match.isMatchActive(),
            showScoreboard: this.remoteShowScoreboard,
            winnerId: this.match.getWinner() ? this.match.getWinner().id : null,
            waitingForCard: this.waitingForCard,
            cardSelection: selectionState,
            mapBorder: this.mapBorderEnabled,
            worldModInterval: this.match.worldModInterval,
            timestamp: Date.now()
        };
    }

    reset() {
        if (this.activeCardSelection) {
            this._clearActiveCardSelection();
        } else {
            this.cardUI.hide();
        }

        this.pendingWorldMod = null; // Clear any pending world mod selection
        this.mapBorderEnabled = true;
        const borderToggle = document.getElementById('map-border');
        if (borderToggle) {
            borderToggle.checked = true;
        }
        this.cardSelectionQueue = [];
        this.initialCardDraftActive = false;

        this.bullets = [];
        this.explosions = [];
        this.firestorms = [];
        this.infestedChunks = [];
        this.looseChunks = [];
        this.healers = [];
        this.impactLines = [];
        this.audio.stopFirestormBurning();
        this.firestormAudioActive = false;
        this.roster.clearAllSlots();
        this.botAIs = [];
        this.match.resetMatch();
        this.cards.reset();
        this.setupComplete = false;
        this.isMultiplayer = false;
        this.setupUI.setMultiplayerMode(false);
        this._clearReadyStates(false);
        this._clearJoinerSmoothing();
        this._remoteScoreboardEntries = null;
        this._lastReceivedModePayload = null;
        this._lastModeFlagsDigest = null;
        this._lastModeSettingsDigest = null;
        this._lastModeDescription = null;
        this._lastModeKey = null;

        // Hide round counter when resetting game
        const roundCounter = document.getElementById('round-counter');
        if (roundCounter) {
            roundCounter.style.display = 'none';
        }

        if (this.modeManager) {
            this.modeManager.onRosterChanged();
            this._syncModeUIState({ suppressRender: false });
        }
        
        // Disconnect network
        if (this.network.connected) {
            this.network.disconnect();
        }
        
        // Reset audio tracking
        this._previousBulletIds.clear();
        this._previousExplosionIds.clear();
        this._previousFighterHealths.clear();
        this._previousFighterDashActive.clear();
        this._audioStateInitialized = false;
    }

    resetRound() {
        this.cardSelectionQueue = [];
        this.initialCardDraftActive = false;
        this.roster.resetFighters();
        if (this.modeManager) {
            this.modeManager.onRoundReset();
        }
        this.bullets = [];
        this.explosions = [];
        this.firestorms = [];
        this.infestedChunks = [];
        this.looseChunks = [];
        this.healers = [];
        this.impactLines = [];
        
        // Hide round counter when resetting round
        const roundCounter = document.getElementById('round-counter');
        if (roundCounter) {
            roundCounter.style.display = 'none';
        }
        
        // Read obstacle settings from UI (same as match start)
        const densitySlider = document.getElementById('obstacle-density');
        const sizeSlider = document.getElementById('obstacle-size');
        const obstacleCount = densitySlider ? parseInt(densitySlider.value, 10) : 7;
        const obstacleSize = sizeSlider ? parseInt(sizeSlider.value, 10) : 110;

        const worldModIntervalSlider = document.getElementById('world-modifier-interval');
        if (worldModIntervalSlider) {
            const sliderValue = parseInt(worldModIntervalSlider.value, 10);
            if (Number.isFinite(sliderValue)) {
                this.match.worldModInterval = sliderValue;
            }
        }

        const mapBorderCheckbox = document.getElementById('map-border');
        if (mapBorderCheckbox) {
            this.mapBorderEnabled = !!mapBorderCheckbox.checked;
        }
        
        this.generateObstacles(obstacleCount, obstacleSize);
        
        // Broadcast round reset to joiners
        if (this.isMultiplayer && this.network.role === 'host') {
            this.network.broadcastRoundReset(
                this.obstacles.map(o => (typeof o.serialize === 'function' ? o.serialize() : StateSerializer.serialize(o))),
                this.roster.getAllFighters().map(f => ({ id: f.id, x: f.x, y: f.y })),
                {
                    mapBorder: this.mapBorderEnabled,
                    worldModInterval: this.match.worldModInterval,
                    roundsToWin: this.match.roundsToWin
                }
            );
        }

        this._updateFirestormAudio();
        
        // Reset audio tracking for joiners
        this._previousBulletIds.clear();
        this._previousExplosionIds.clear();
        this._previousFighterHealths.clear();
        this._previousFighterDashActive.clear();
        this._audioStateInitialized = false;
    }

    // ==================== MULTIPLAYER METHODS ====================
    
    async hostMultiplayerGame(hostName) {
        try {
            // Update local fighter name before hosting
            const localFighter = this.roster.getLocalFighter();
            if (localFighter && hostName) {
                localFighter.name = hostName.trim().slice(0, 32);
                this.setupUI.render();
            }
            
            const code = await this.network.hostLobby(hostName);
            console.log('[Game] Hosting with code:', code);
            // Ensure host's fighter metadata contains current cursor settings so joiners see host reticle
            try {
                if (localFighter) {
                    let savedStyle = null;
                    let savedColor = null;
                    try {
                        savedStyle = localStorage.getItem('shape_shot_cursor') || null;
                        savedColor = localStorage.getItem('shape_shot_color') || null;
                    } catch (e) {}
                    const updates = { metadata: {} };
                    let changed = false;
                    if (savedStyle) { updates.metadata.cursorStyle = savedStyle; changed = true; }
                    if (savedColor) { updates.metadata.cursorColor = savedColor; changed = true; }
                    if (changed) {
                        this.roster.updateFighter(localFighter.id, updates);
                        this.setupUI.render();
                        this._broadcastRosterUpdate();
                    }
                }
            } catch (e) { console.warn('[Game] Failed to set host cursor metadata', e); }
            return code;
        } catch (error) {
            console.error('[Game] Failed to host:', error);
            throw error;
        }
    }
    
    async joinMultiplayerGame(sessionCode, playerName) {
        try {
            // Send the name to host, but keep local fighter name as-is for now
            const result = await this.network.joinLobby(sessionCode, playerName);
            console.log('[Game] Joined as joiner', result.joinerIndex);
            
            // Clear the default roster - we'll receive the real roster from host
            this.roster.clearAllSlots();
            
            return result;
        } catch (error) {
            console.error('[Game] Failed to join:', error);
            throw error;
        }
    }

    _broadcastRosterUpdate() {
        if (!this.network || this.network.role !== 'host' || !this.network.connected) {
            return;
        }

        const snapshot = this.createNetworkSnapshot();
        if (snapshot) {
            this.network.broadcastState(snapshot);
        }
    }

    _handleReadyToggle(slotIndex) {
        if (!this.isMultiplayer || !this.network) return;
        if (this.network.role === 'host' && slotIndex === 0) {
            const hostFighter = this.roster.getSlot(0);
            if (hostFighter && !hostFighter.isLocal) {
                return;
            }
        }
        const fighter = this.roster.getSlot(slotIndex);
        if (!fighter || !fighter.isLocal || fighter.isBot) return;
        const currentlyReady = !!this.readyStates[slotIndex];
        this._updateReadyState(slotIndex, !currentlyReady);
    }

    _handleBotDifficultyChange(slotIndex, difficulty) {
        if (!Number.isFinite(slotIndex)) return;
        const fighter = this.roster.getSlot(slotIndex);
        if (!fighter || !fighter.isBot) return;
        if (this.isMultiplayer && this.network && this.network.role === 'joiner') {
            return;
        }

        const presets = (typeof BOT_DIFFICULTY_PRESETS !== 'undefined') ? BOT_DIFFICULTY_PRESETS : null;
        let normalized = (difficulty || '').toString().toLowerCase();
        const fallback = presets && presets.normal ? presets.normal.key || 'normal' : 'normal';
        if (!normalized || (presets && !presets[normalized])) {
            normalized = fallback;
        }

        this.roster.updateFighter(fighter.id, { metadata: { botDifficulty: normalized } });
        fighter.metadata = fighter.metadata || {};
        fighter.metadata.botDifficulty = normalized;
        fighter.botDifficulty = normalized;
        if (this.roster && this.roster.botDifficultyCache) {
            this.roster.botDifficultyCache[slotIndex] = normalized;
        }

        const ai = this.botAIs.find(instance => instance && instance.fighter === fighter);
        if (ai && typeof ai.setDifficulty === 'function') {
            ai.setDifficulty(normalized);
        }

        this.setupUI.render();

        if (this.isMultiplayer && this.network && this.network.role === 'host' && this.network.connected) {
            this._broadcastRosterUpdate();
        }
    }

    _areAllPlayersReady() {
        if (!this.isMultiplayer) return true;
        const fighters = this.roster.getAllFighters().filter(f => f && !f.isBot);
        if (!fighters.length) return true;
        for (const fighter of fighters) {
            if (!this.readyStates[fighter.slotIndex]) {
                return false;
            }
        }
        return true;
    }

    _updateReadyState(slotIndex, ready, options = {}) {
        const normalizedSlot = Number.isFinite(slotIndex) ? slotIndex : null;
        if (normalizedSlot === null) return false;
        const readyValue = !!ready;

        if (this.isMultiplayer && this.network && this.network.role === 'host') {
            if (typeof options.joinerIndex === 'number') {
                const fighter = this.roster.getSlot(normalizedSlot);
                if (!fighter || fighter.isBot) {
                    return false;
                }
                if (fighter.isLocal) {
                    return false;
                }
                const meta = fighter.metadata || {};
                const assignedJoiner = typeof meta.joinerIndex === 'number' ? meta.joinerIndex : null;
                if (assignedJoiner === null || assignedJoiner !== options.joinerIndex) {
                    return false;
                }
            }
        }

        this.readyStates[normalizedSlot] = readyValue;
        this.setupUI.setReadyState(normalizedSlot, readyValue);
        if (!this.isMultiplayer || !this.network) return true;
        if (this.network.role === 'host') {
            if (options.broadcast === false) return true;
            this._broadcastReadyStates();
            return true;
        }
        if (this.network.role === 'joiner') {
            if (options.broadcast === false) return true;
            this.network.sendReadyState(normalizedSlot, readyValue);
            return true;
        }
        return true;
    }

    _broadcastReadyStates() {
        if (!this.network || this.network.role !== 'host') return;
        this.network.broadcastReadyStates(this.readyStates);
    }

    _applyReadyStatesFromHost(states = {}) {
        this.readyStates = {};
        if (!states || typeof states !== 'object') return;
        for (const key in states) {
            if (!Object.prototype.hasOwnProperty.call(states, key)) continue;
            const slotIndex = Number(key);
            if (!Number.isFinite(slotIndex)) continue;
            const ready = !!states[key];
            this.readyStates[slotIndex] = ready;
            this.setupUI.setReadyState(slotIndex, ready);
        }
    }

    _clearReadyStates(broadcast = true) {
        this.readyStates = {};
        if (this.setupUI) {
            this.setupUI.clearReadyStates();
        }
        if (broadcast && this.isMultiplayer && this.network && this.network.role === 'host') {
            this._broadcastReadyStates();
        }
    }

    _handleDisplayNameChangeRequest(slotIndex, fighterId, newName) {
        const trimmed = (newName || '').toString().trim().slice(0, 32);
        if (!trimmed) return;

        const fighter = this.roster.getFighterById(fighterId);
        if (!fighter) return;

        // Update local roster state
        this.roster.updateFighter(fighterId, { name: trimmed });
        this.setupUI.render();

        // Save display name to localStorage
        try {
            localStorage.setItem('shape_shot_display_name', trimmed);
        } catch (e) {
            console.warn('[Game] Failed to save display name to localStorage:', e);
        }

        if (!this.network || !this.network.connected) {
            return;
        }

        if (this.network.role === 'joiner') {
            this.network.sendDisplayNameChange(fighterId, slotIndex, trimmed);
            return;
        }
        // Host path already broadcast via onRosterChanged callback in SetupUI
    }

    _handleDisplayNameChangeFromJoiner(data) {
        if (!data || this.network.role !== 'host') return;

        const joinerIndex = typeof data.joinerIndex === 'number' ? data.joinerIndex : null;
        const requestedName = typeof data.name === 'string' ? data.name.trim().slice(0, 32) : '';
        const fighterId = data.fighterId || null;
        const slotIndex = typeof data.slotIndex === 'number' ? data.slotIndex : null;

        if (joinerIndex === null || !requestedName) return;

        let fighter = null;
        if (fighterId) {
            fighter = this.roster.getFighterById(fighterId);
        }
        if (!fighter && slotIndex !== null) {
            fighter = this.roster.getSlot(slotIndex);
        }
        if (!fighter) {
            fighter = this.roster.getFighterByJoinerIndex(joinerIndex);
        }
        if (!fighter) return;

        const meta = fighter.metadata || {};
        if (typeof meta.joinerIndex !== 'number' || meta.joinerIndex !== joinerIndex) {
            return;
        }

        this.roster.updateFighter(fighter.id, { name: requestedName });
        this.setupUI.render();
        this._broadcastRosterUpdate();
    }

    _handleCursorUpdateFromJoiner(data) {
        if (!data || this.network.role !== 'host') return;

        const joinerIndex = typeof data.joinerIndex === 'number' ? data.joinerIndex : null;
        const style = typeof data.cursorStyle === 'string' ? data.cursorStyle.trim().slice(0, 32) : null;
        const color = typeof data.cursorColor === 'string' ? data.cursorColor.trim().slice(0, 32) : null;
        const fighterId = data.fighterId || null;
        const slotIndex = typeof data.slotIndex === 'number' ? data.slotIndex : null;

        if (joinerIndex === null) return;

        let fighter = null;
        if (fighterId) fighter = this.roster.getFighterById(fighterId);
        if (!fighter && slotIndex !== null) fighter = this.roster.getSlot(slotIndex);
        if (!fighter) fighter = this.roster.getFighterByJoinerIndex(joinerIndex);
        if (!fighter) return;

        const meta = fighter.metadata || {};
        if (typeof meta.joinerIndex !== 'number' || meta.joinerIndex !== joinerIndex) {
            return;
        }

        const updates = { metadata: {} };
        if (style) updates.metadata.cursorStyle = style;
        if (color) updates.metadata.cursorColor = color;

        this.roster.updateFighter(fighter.id, updates);
        this.setupUI.render();
        this._broadcastRosterUpdate();
    }
    
    _resolveAimTarget(fighter, requestedX, requestedY, fighters = []) {
        const fallbackAim = fighter && typeof fighter.getCursorAim === 'function'
            ? fighter.getCursorAim()
            : { x: requestedX, y: requestedY };
        let aimX = typeof requestedX === 'number' ? requestedX : fallbackAim.x;
        let aimY = typeof requestedY === 'number' ? requestedY : fallbackAim.y;

        if (fighter && fighter.aimBotActive) {
            const target = this._findNearestEnemy(fighter, fighters);
            if (target) {
                aimX = target.x;
                aimY = target.y;
                if (typeof fighter.updateCursorAim === 'function') {
                    fighter.updateCursorAim(target.x, target.y);
                }
            }
        }

        return { x: aimX, y: aimY };
    }

    _findNearestEnemy(fighter, fighters = []) {
        if (!fighter) return null;
        let nearest = null;
        let nearestDist = Infinity;
        const fighterTeamId = fighter.metadata && fighter.metadata.teamId;
        for (const other of fighters) {
            if (!other || other === fighter || !other.alive) continue;
            // In team modes, don't target teammates
            const otherTeamId = other.metadata && other.metadata.teamId;
            if (fighterTeamId && otherTeamId && fighterTeamId === otherTeamId) continue;
            const d = dist(fighter.x, fighter.y, other.x, other.y);
            if (!Number.isFinite(d)) continue;
            if (d < nearestDist) {
                nearestDist = d;
                nearest = other;
            }
        }
        return nearest;
    }

    _applyJoinerInput(joinerIndex, inputData) {
        // Host applies joiner's input to their fighter
        const fighter = this.roster.getFighterByJoinerIndex(joinerIndex);
        if (!fighter || !fighter.alive) return;
        
        // Store input for processing in update loop
        fighter.keys = inputData.keys || {};
        fighter.mouseX = inputData.mouseX;
        fighter.mouseY = inputData.mouseY;
        fighter.shootRequested = inputData.shootPressed;
        fighter.dashRequested = inputData.dashPressed;
        if (typeof inputData.mouseX === 'number' && typeof inputData.mouseY === 'number') {
            fighter.updateCursorAim(inputData.mouseX, inputData.mouseY);
        }
    }
    
    _applyStateUpdate(state) {
        if (this.network.role !== 'joiner') return;
        if (!state) return;

        const snapshot = this._cloneSnapshotForBuffer(state);
        this._snapshotBuffer.push(snapshot);
        if (this._snapshotBuffer.length > this._snapshotMaxBuffer) {
            this._snapshotBuffer.shift();
        }

        if (!this._hasAppliedInitialSnapshot) {
            this._applyStateFrame(snapshot, { deferPositions: false, now: this._now() });
            this._hasAppliedInitialSnapshot = true;
        }
    }

    _processJoinerSnapshots(dt) {
        if (!this.isMultiplayer || this.network.role !== 'joiner') return;

        const now = this._now();
        const readyThreshold = now - this._snapshotInterpolationDelay;

        while (this._snapshotBuffer.length > 0) {
            const candidate = this._snapshotBuffer[0];
            if (!this._hasAppliedInitialSnapshot || candidate.__receivedAt <= readyThreshold) {
                this._snapshotBuffer.shift();
                this._applyStateFrame(candidate, { deferPositions: this._hasAppliedInitialSnapshot, now });
                this._hasAppliedInitialSnapshot = true;
            } else {
                break;
            }
        }

        this._stepJoinerInterpolation(now);
    }

    _applyStateFrame(state, options = {}) {
        if (!state) return;

        const deferPositions = !!options.deferPositions;
        const now = typeof options.now === 'number' ? options.now : this._now();

        if (state.mode) {
            this._applyModeNetworkPayload(state.mode, { skipRosterRefresh: true });
        }

        if (Array.isArray(state.scoreboardEntries)) {
            this._remoteScoreboardEntries = state.scoreboardEntries.map(entry => Object.assign({}, entry));
        } else {
            this._remoteScoreboardEntries = null;
        }

        const fighterStates = Array.isArray(state.fighters) ? state.fighters : [];
        this._syncRosterFromState(fighterStates);

        for (let fighterData of fighterStates) {
            const fighter = this.roster.getFighterById(fighterData.id);
            if (fighter) {
                this._applyFighterState(fighter, fighterData, { deferPosition: deferPositions, now });
            }
        }

        const bulletStates = Array.isArray(state.bullets) ? state.bullets : [];
        this.bullets = bulletStates.map(bulletData => {
            const owner = bulletData.ownerId ? this.roster.getFighterById(bulletData.ownerId) : null;
            return Bullet.fromState(bulletData, owner);
        }).filter(Boolean);

        const explosionStates = Array.isArray(state.explosions) ? state.explosions : [];
        this.explosions = explosionStates.map(data => Explosion.fromState(data)).filter(Boolean);

        const firestormStates = Array.isArray(state.firestorms) ? state.firestorms : [];
        this.firestorms = firestormStates.map(data => Firestorm.fromState(data)).filter(Boolean);

        const infestedStates = Array.isArray(state.infestedChunks) ? state.infestedChunks : [];
        this.infestedChunks = infestedStates.map(data => InfestedChunk.fromState(data)).filter(Boolean);

        const looseStates = Array.isArray(state.looseChunks) ? state.looseChunks : [];
        this.looseChunks = looseStates.map(data => LooseChunk.fromState(data)).filter(Boolean);

        const healerStates = Array.isArray(state.healers) ? state.healers : [];
        this.healers = healerStates.map(data => Healer.fromState(data)).filter(Boolean);

        if (Array.isArray(state.obstacles)) {
            const obstacleStates = state.obstacles;
            this.obstacles = obstacleStates.map(data => Obstacle.fromState(data)).filter(Boolean);
        }

        if (Array.isArray(state.impactLines)) {
            this.impactLines = state.impactLines.map(line => ({
                x: line.x,
                y: line.y,
                vx: line.vx,
                vy: line.vy,
                life: line.life,
                t: line.t,
                color: line.color,
                width: line.width,
                alphaScale: line.alphaScale
            })).filter(item => Number.isFinite(item.life));
        } else {
            this.impactLines = [];
        }

        if (Array.isArray(state.activeMods)) {
            this.cards.activeMods = state.activeMods.slice();
        }

        if (typeof state.mapBorder === 'boolean') {
            this.mapBorderEnabled = state.mapBorder;
            if (this.network.role === 'joiner') {
                const borderToggle = document.getElementById('map-border');
                if (borderToggle) {
                    borderToggle.checked = this.mapBorderEnabled;
                }
            }
        }

        if (typeof state.worldModInterval === 'number' && Number.isFinite(state.worldModInterval)) {
            this.match.worldModInterval = state.worldModInterval;
            if (this.network.role === 'joiner') {
                const slider = document.getElementById('world-modifier-interval');
                if (slider) {
                    slider.value = String(Math.max(1, Math.min(10, Math.round(state.worldModInterval))));
                    if (typeof slider.oninput === 'function') {
                        slider.oninput();
                    } else {
                        const label = document.getElementById('world-modifier-value');
                        if (label) label.textContent = slider.value;
                    }
                }
            }
        }

        if (state.usedWorldMods && typeof state.usedWorldMods === 'object') {
            this.cards.usedWorldMods = Object.assign({}, state.usedWorldMods);
        }

        if (state.firestormPreSpawnPos) {
            this.cards.firestormPreSpawnPos = {
                x: state.firestormPreSpawnPos.x,
                y: state.firestormPreSpawnPos.y,
                radius: state.firestormPreSpawnPos.radius
            };
        } else {
            this.cards.firestormPreSpawnPos = null;
        }

        if (typeof state.firestormCardsPulled === 'number') {
            this.cards.firestormCardsPulled = state.firestormCardsPulled;
        }

        if (typeof state.healersActive === 'boolean') {
            this.cards.healersActive = state.healersActive;
        }
        if (typeof state.healersCardsPulled === 'number') {
            this.cards.healersCardsPulled = state.healersCardsPulled;
        }
        if (typeof state.healerPendingRespawn === 'boolean') {
            this.cards.healerPendingRespawn = state.healerPendingRespawn;
        }
        if (typeof state.healerRespawnTimer === 'number') {
            this.cards.healerRespawnTimer = state.healerRespawnTimer;
        }
        if (typeof state.healerRespawnDelay === 'number') {
            this.cards.healerRespawnDelay = state.healerRespawnDelay;
        }
        if (state.healerPreSpawnPos) {
            this.cards.healerPreSpawnPos = {
                x: state.healerPreSpawnPos.x,
                y: state.healerPreSpawnPos.y,
                radius: state.healerPreSpawnPos.radius || 0,
                progress: state.healerPreSpawnPos.progress || 0,
                timeRemaining: state.healerPreSpawnPos.timeRemaining || 0
            };
        } else {
            this.cards.healerPreSpawnPos = null;
        }

        if (state.healerNextSpawnPos) {
            this.cards.healerNextSpawnPos = {
                x: state.healerNextSpawnPos.x,
                y: state.healerNextSpawnPos.y
            };
        } else {
            this.cards.healerNextSpawnPos = null;
        }

        if (typeof state.healerTelegraphDuration === 'number') {
            this.cards.healerTelegraphDuration = state.healerTelegraphDuration;
        }

        if (typeof state.roundNum === 'number') {
            this.match.roundNum = state.roundNum;
        }
        if (typeof state.totalRounds === 'number') {
            this.match.roundsToWin = state.totalRounds;
        }
        if (typeof state.roundActive === 'boolean') {
            this.match.roundActive = state.roundActive;
        }
        if (typeof state.matchActive === 'boolean') {
            this.match.matchActive = state.matchActive;
        }
        if (typeof state.showScoreboard === 'boolean') {
            this.remoteShowScoreboard = state.showScoreboard;
        }

        if (this.network.role === 'joiner') {
            if (typeof state.waitingForCard === 'boolean') {
                const wasWaiting = this.waitingForCard;
                this.waitingForCard = state.waitingForCard;

                if (!this.waitingForCard && wasWaiting && !state.cardSelection && this.activeCardSelection) {
                    this._clearActiveCardSelection();
                }
            }

            if (!state.cardSelection && this.activeCardSelection && !this.waitingForCard) {
                this._clearActiveCardSelection();
            }
        }

        if (state.winnerId) {
            const winningFighter = this.roster.getFighterById(state.winnerId);
            this.match.winner = winningFighter || null;
        } else {
            this.match.winner = null;
        }

        this._updateFirestormAudio();

        if (this.network.role === 'joiner') {
            this._playSoundsForStateChanges(state);
        }

        if (this.network.role === 'joiner') {
            if (this.setupUI) {
                try { this.setupUI.render(); } catch (e) { console.warn('[Game] setupUI.render failed', e); }
            }
            if (this.cardsUI) {
                try { this.cardsUI.update(this.roster.getAllFighters(), this.cards.activeMods); } catch (e) { console.warn('[Game] cardsUI.update failed', e); }
            }
        }
    }

    _cloneSnapshotForBuffer(state) {
        const clone = StateSerializer.cloneValue(state);
        const receivedAt = this._now();
        Object.defineProperty(clone, '__receivedAt', {
            value: receivedAt,
            enumerable: false,
            configurable: false
        });
        return clone;
    }

    _stepJoinerInterpolation(now) {
        const fighters = this.roster.getAllFighters();
        const defaultDuration = this._snapshotInterpolationDelay;

        for (const fighter of fighters) {
            if (!fighter) continue;
            if (!fighter._networkInitialized) continue;
            if (typeof fighter._networkTargetX !== 'number' || typeof fighter._networkTargetY !== 'number') continue;
            if (typeof fighter._networkStartX !== 'number' || typeof fighter._networkStartY !== 'number') continue;
            const startTime = typeof fighter._networkBlendStartMs === 'number' ? fighter._networkBlendStartMs : now;
            const duration = Math.max(0, typeof fighter._networkBlendDurationMs === 'number' ? fighter._networkBlendDurationMs : defaultDuration);
            const elapsed = now - startTime;
            const denom = duration > 0 ? duration : 1;
            let t = denom > 0 ? elapsed / denom : 1;
            if (t < 0) t = 0;
            if (t > 1) t = 1;

            const newX = this._lerp(fighter._networkStartX, fighter._networkTargetX, t);
            const newY = this._lerp(fighter._networkStartY, fighter._networkTargetY, t);
            fighter.x = newX;
            fighter.y = newY;

            if (t >= 1 && fighter._networkLerpActive) {
                fighter._networkLerpActive = false;
                fighter._networkStartX = fighter._networkTargetX;
                fighter._networkStartY = fighter._networkTargetY;
                fighter._networkBlendStartMs = now;
                fighter._networkBlendDurationMs = 0;
            }
        }
    }

    _clearJoinerSmoothing() {
        this._snapshotBuffer = [];
        this._hasAppliedInitialSnapshot = false;
        const fighters = this.roster ? this.roster.getAllFighters() : [];
        const now = this._now();
        for (const fighter of fighters) {
            if (!fighter) continue;
            fighter._networkInitialized = false;
            fighter._networkStartX = fighter.x;
            fighter._networkStartY = fighter.y;
            fighter._networkTargetX = fighter.x;
            fighter._networkTargetY = fighter.y;
            fighter._networkBlendStartMs = now;
            fighter._networkBlendDurationMs = 0;
            fighter._networkLerpActive = false;
        }
    }

    _playSoundsForStateChanges(state) {
        if (!state || !this.audio) return;
        if (this.network.role !== 'joiner') return;

        const initializing = !this._audioStateInitialized;
        const callAudio = (method, ...args) => {
            const fn = this.audio && this.audio[method];
            if (typeof fn !== 'function') return;
            try {
                fn.apply(this.audio, args);
            } catch (e) {}
        };

        const nextBulletIds = new Set();
        const shootingOwners = new Set(); // Track owners who have new bullets this frame
        if (Array.isArray(state.bullets)) {
            for (const bullet of state.bullets) {
                if (!bullet || !bullet.id) continue;
                nextBulletIds.add(bullet.id);
                if (!initializing && !this._previousBulletIds.has(bullet.id)) {
                    // Collect owner IDs who are shooting new bullets
                    if (bullet.ownerId) {
                        shootingOwners.add(bullet.ownerId);
                    }
                }
            }
        }
        this._previousBulletIds.clear();
        nextBulletIds.forEach(id => this._previousBulletIds.add(id));

        // Play gun shot sound once per owner who shot
        for (const ownerId of shootingOwners) {
            callAudio('playGunShot');
        }

        const nextExplosionIds = new Set();
        if (Array.isArray(state.explosions)) {
            for (const explosion of state.explosions) {
                if (!explosion || !explosion.id) continue;
                nextExplosionIds.add(explosion.id);
                if (!initializing && !this._previousExplosionIds.has(explosion.id)) {
                    callAudio('playExplosion');
                }
            }
        }
        this._previousExplosionIds.clear();
        nextExplosionIds.forEach(id => this._previousExplosionIds.add(id));

        const currentFighterIds = new Set();
        if (Array.isArray(state.fighters)) {
            for (const fighterState of state.fighters) {
                if (!fighterState || !fighterState.id) continue;
                const fighterId = fighterState.id;
                currentFighterIds.add(fighterId);

                const health = Number.isFinite(fighterState.health) ? fighterState.health : null;
                const prevHealth = this._previousFighterHealths.has(fighterId)
                    ? this._previousFighterHealths.get(fighterId)
                    : null;

                if (!initializing && health !== null && prevHealth !== null && health < prevHealth) {
                    callAudio('playHit');
                }

                if (health !== null) {
                    this._previousFighterHealths.set(fighterId, health);
                } else {
                    this._previousFighterHealths.delete(fighterId);
                }

                const dashActive = !!fighterState.dashActive;
                const prevDash = this._previousFighterDashActive.has(fighterId)
                    ? this._previousFighterDashActive.get(fighterId)
                    : false;
                if (!initializing && dashActive && !prevDash) {
                    const duration = Number.isFinite(fighterState.dashDuration) ? fighterState.dashDuration : undefined;
                    let speedMult = 1.0;
                    if (Number.isFinite(fighterState.dashSpeed) && Number.isFinite(fighterState.speed) && fighterState.speed > 0) {
                        speedMult = fighterState.dashSpeed / fighterState.speed;
                    } else if (Number.isFinite(fighterState.dashSpeedMult)) {
                        speedMult = fighterState.dashSpeedMult;
                    }
                    if (!Number.isFinite(speedMult) || speedMult <= 0) {
                        speedMult = 1.0;
                    }
                    callAudio('playDashWoosh', duration, speedMult);
                }
                this._previousFighterDashActive.set(fighterId, dashActive);
            }
        }

        for (const storedId of Array.from(this._previousFighterHealths.keys())) {
            if (!currentFighterIds.has(storedId)) {
                this._previousFighterHealths.delete(storedId);
            }
        }
        for (const storedId of Array.from(this._previousFighterDashActive.keys())) {
            if (!currentFighterIds.has(storedId)) {
                this._previousFighterDashActive.delete(storedId);
            }
        }

        this._audioStateInitialized = true;
    }

    _now() {
        if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
            return performance.now();
        }
        return Date.now();
    }

    _lerp(a, b, t) {
        return a + (b - a) * t;
    }

    _syncRosterFromState(fighterStates) {
        if (!Array.isArray(fighterStates)) return;

        const seenIds = new Set();

        for (const fighterData of fighterStates) {
            if (!fighterData || !fighterData.id) continue;
            seenIds.add(fighterData.id);

            let fighter = this.roster.getFighterById(fighterData.id);
            if (!fighter) {
                fighter = this._createFighterFromState(fighterData);
            }
        }

        // Remove fighters that no longer exist on host (e.g., disconnected joiners)
        const fighters = this.roster.getAllFighters();
        for (const fighter of fighters) {
            if (!seenIds.has(fighter.id)) {
                this.roster.clearSlot(fighter.slotIndex);
            }
        }

        if (this.modeManager) {
            this.modeManager.onRosterChanged();
            this._lastModeFlagsDigest = null;
            this._lastModeSettingsDigest = null;
            this._lastModeDescription = null;
            this._lastModeKey = null;
            this._syncModeUIState({ suppressRender: true });
        }

        if (this.setupUI) {
            this.setupUI.render();
        }
    }

    _createFighterFromState(data) {
        if (!data) return null;

        const slotIndex = typeof data.slotIndex === 'number' ? data.slotIndex : 0;
        const metadata = Object.assign({}, data.metadata || {});

        let joinerIndex = typeof metadata.joinerIndex === 'number' ? metadata.joinerIndex : null;
        if (joinerIndex === null && !data.isBot && slotIndex > 0) {
            joinerIndex = slotIndex - 1;
            metadata.joinerIndex = joinerIndex;
        }

        const isLocalJoiner = (this.network.role === 'joiner' && typeof joinerIndex === 'number' && joinerIndex === this.network.joinerIndex);

        if (isLocalJoiner) {
            metadata.remote = false;
            // Preserve local joiner's current name if they already have one
            const existingLocal = this.roster.getLocalFighter();
            if (existingLocal && existingLocal.name && existingLocal.name !== data.name) {
                // Keep the existing name (from context menu rename)
                data.name = existingLocal.name;
            }
        }

        const options = {
            forceId: data.id,
            isLocalOverride: isLocalJoiner,
            isBotOverride: !!data.isBot,
            colorOverride: data.color,
            position: { x: data.x, y: data.y },
            metadataOverrides: isLocalJoiner ? metadata : Object.assign({}, metadata, { remote: true })
        };

        const type = data.isBot ? 'bot' : 'human';
        const fighter = this.roster.assignSlot(slotIndex, type, data.name, {}, options);
        if (fighter) {
            this._applyFighterState(fighter, data);
        }
        return fighter;
    }

    _applyFighterState(fighter, data, options = {}) {
        if (!fighter || !data) return;
        const opts = options || {};
        const deferPosition = !!opts.deferPosition;
        const now = typeof opts.now === 'number' ? opts.now : this._now();
        const previousX = Number.isFinite(fighter.x) ? fighter.x : (Number.isFinite(data.x) ? data.x : fighter.x);
        const previousY = Number.isFinite(fighter.y) ? fighter.y : (Number.isFinite(data.y) ? data.y : fighter.y);
        const hadNetworkInit = !!fighter._networkInitialized;
        
        // Track death transition for blood particle creation (joiner only)
        const wasAlive = fighter.alive;
        const wasDying = fighter.dying;
        
        // Always accept name updates from network to ensure consistency
        // Local changes are sent back to host via display name change messages
        if (data.name) {
            fighter.name = data.name;
        }
        
        if (data.color) fighter.color = data.color;

        const slotIndex = typeof data.slotIndex === 'number' ? data.slotIndex : fighter.slotIndex;
        if (typeof slotIndex === 'number') {
            fighter.slotIndex = slotIndex;
        }

        const metadataFromState = Object.assign({}, data.metadata || {});
        let joinerIndex = (typeof metadataFromState.joinerIndex === 'number') ? metadataFromState.joinerIndex : null;
        if (joinerIndex === null && !data.isBot && typeof slotIndex === 'number' && slotIndex > 0) {
            joinerIndex = slotIndex - 1;
        }
        metadataFromState.joinerIndex = joinerIndex;

        fighter.isBot = !!data.isBot;

        const isNetworked = this.isMultiplayer && this.network && this.network.role;
        if (isNetworked) {
            const isJoiner = this.network.role === 'joiner';
            const isLocalJoiner = isJoiner && this.network.joinerIndex !== null && joinerIndex === this.network.joinerIndex;
            const isHostLocal = !isJoiner && typeof slotIndex === 'number' && slotIndex === 0 && !fighter.isBot;

            fighter.isLocal = isLocalJoiner || isHostLocal;

            if (typeof slotIndex === 'number' && slotIndex === 0 && isJoiner) {
                // Host slot should never be treated as local on a joiner client
                fighter.isLocal = false;
            }

            const shouldBeRemote = isJoiner ? !fighter.isLocal : (!fighter.isLocal && !fighter.isBot);
            metadataFromState.remote = shouldBeRemote;
        }

        fighter.metadata = Object.assign({}, fighter.metadata || {}, metadataFromState);

        // Skip state serializer if this is the local fighter - preserve input state
        if (!fighter.isLocal) {
            const excludedKeys = new Set(['metadata', 'cards', 'isBot', 'slotIndex', 'name', 'color', 'keys', 'mouseX', 'mouseY', 'shootRequested', 'dashRequested', 'isLocal']);
            const cloneSource = {};
            for (const key in data) {
                if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
                if (excludedKeys.has(key)) continue;
                cloneSource[key] = data[key];
            }

            StateSerializer.applyState(fighter, cloneSource);
        } else {
            // For local fighter, update everything except input fields
            const excludedKeys = new Set(['metadata', 'cards', 'isBot', 'slotIndex', 'name', 'color', 'keys', 'mouseX', 'mouseY', 'shootRequested', 'dashRequested', 'isLocal']);
            const cloneSource = {};
            for (const key in data) {
                if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
                if (excludedKeys.has(key)) continue;
                cloneSource[key] = data[key];
            }

            StateSerializer.applyState(fighter, cloneSource);
        }

        const targetX = Number.isFinite(fighter.x) ? fighter.x : previousX;
        const targetY = Number.isFinite(fighter.y) ? fighter.y : previousY;

        if (deferPosition && hadNetworkInit && Number.isFinite(previousX) && Number.isFinite(previousY)) {
            fighter._networkStartX = previousX;
            fighter._networkStartY = previousY;
            fighter._networkTargetX = Number.isFinite(targetX) ? targetX : previousX;
            fighter._networkTargetY = Number.isFinite(targetY) ? targetY : previousY;
            fighter._networkBlendStartMs = now;
            fighter._networkBlendDurationMs = this._snapshotInterpolationDelay;
            fighter._networkLerpActive = true;
            fighter._networkInitialized = true;
            fighter.x = fighter._networkStartX;
            fighter.y = fighter._networkStartY;
        } else {
            const resolvedX = Number.isFinite(targetX) ? targetX : Number.isFinite(previousX) ? previousX : 0;
            const resolvedY = Number.isFinite(targetY) ? targetY : Number.isFinite(previousY) ? previousY : 0;
            fighter.x = resolvedX;
            fighter.y = resolvedY;
            fighter._networkStartX = resolvedX;
            fighter._networkStartY = resolvedY;
            fighter._networkTargetX = resolvedX;
            fighter._networkTargetY = resolvedY;
            fighter._networkBlendStartMs = now;
            fighter._networkBlendDurationMs = 0;
            fighter._networkLerpActive = false;
            fighter._networkInitialized = true;
        }

        if (Array.isArray(data.cards)) {
            fighter.cards = data.cards.slice();
        }

        fighter.isBot = !!data.isBot;
        
        // If fighter just started dying, create blood particles based on local setting
        if (wasAlive && !wasDying && fighter.dying && this.network.role === 'joiner') {
            // Estimate damage source from velocity direction
            let sourceX = fighter.x;
            let sourceY = fighter.y;
            if (fighter.deathVelocityX !== 0 || fighter.deathVelocityY !== 0) {
                const angle = Math.atan2(fighter.deathVelocityY, fighter.deathVelocityX);
                const distance = 30; // Estimate source position
                sourceX = fighter.x - Math.cos(angle) * distance;
                sourceY = fighter.y - Math.sin(angle) * distance;
            }
            
            // Create blood particles using local setting
            fighter._createBloodParticles(fighter.lastDamageAmount || 18, sourceX, sourceY);
        }
    }
    
    _applyRoundReset(data) {
        // Joiner receives round reset data from host
        if (this.network.role !== 'joiner') return;
        
        // Reset entities
        this.bullets = [];
        this.explosions = [];
        this.firestorms = [];
        this.infestedChunks = [];
        this.looseChunks = [];
        this.healers = [];
        this.impactLines = [];
        this._updateFirestormAudio();
        
        if (data && typeof data.mapBorder === 'boolean') {
            this.mapBorderEnabled = data.mapBorder;
            const borderToggle = document.getElementById('map-border');
            if (borderToggle) {
                borderToggle.checked = this.mapBorderEnabled;
            }
        }

        if (data && typeof data.worldModInterval === 'number' && Number.isFinite(data.worldModInterval)) {
            this.match.worldModInterval = data.worldModInterval;
            const slider = document.getElementById('world-modifier-interval');
            if (slider) {
                slider.value = String(Math.max(1, Math.min(10, Math.round(data.worldModInterval))));
                if (typeof slider.oninput === 'function') {
                    slider.oninput();
                } else {
                    const label = document.getElementById('world-modifier-value');
                    if (label) label.textContent = slider.value;
                }
            }
        }

        if (data && typeof data.roundsToWin === 'number' && Number.isFinite(data.roundsToWin)) {
            const roundsValue = Math.min(Math.max(data.roundsToWin, 1), 50);
            this.match.roundsToWin = roundsValue;
            const roundsInput = document.getElementById('rounds-to-win');
            if (roundsInput) {
                roundsInput.value = String(roundsValue);
            }
            // Save to localStorage on joiner as well
            try {
                localStorage.setItem('shape_shot_rounds', String(roundsValue));
            } catch (e) {
                console.warn('[Game] Failed to save rounds to localStorage on joiner:', e);
            }
        }

        if (data && typeof data.chooseCardOnStart === 'boolean') {
            const enabled = data.chooseCardOnStart;
            this.chooseCardOnStart = enabled;
            const checkbox = document.getElementById('choose-card-on-start');
            if (checkbox) {
                checkbox.checked = enabled;
            }
            try {
                localStorage.setItem('shape_shot_choose_card_start', enabled ? '1' : '0');
            } catch (e) {
                console.warn('[Game] Failed to save choose-card-on-start on joiner:', e);
            }
        }

        // Apply obstacles
        if (data.obstacles) {
            this.obstacles = data.obstacles.map(o => {
                if (o && o.chunks) {
                    return Obstacle.fromState(o);
                }
                return new Obstacle(o.x, o.y, o.w, o.h);
            });
        }
        
        // Apply fighter positions
        if (data.fighters) {
            for (let fighterData of data.fighters) {
                const fighter = this.roster.getFighterById(fighterData.id);
                if (fighter) {
                    fighter.reset(fighterData.x, fighterData.y);
                }
            }
        }

        if (this.modeManager) {
            this.modeManager.onRoundReset();
        }

        this._clearJoinerSmoothing();
    }

    _updateFirestormAudio() {
        const hasActive = this.firestorms.some(fs => !fs.done);
        if (hasActive) {
            if (!this.firestormAudioActive) {
                this.audio.startFirestormBurning();
                this.audio.playBurning(5.0);
                this.firestormAudioActive = true;
            } else {
                this.audio.startFirestormBurning();
            }
        } else if (this.firestormAudioActive) {
            this.audio.stopFirestormBurning();
            this.firestormAudioActive = false;
        }
    }
    
    _triggerSpontaneousExplosion(chunk) {
        // Create explosion
        const cx = chunk.x + chunk.w/2;
        const cy = chunk.y + chunk.h/2;
        this.explosions.push(new Explosion(cx, cy, 50, "#ff6b35", 12, null, false));
        this.audio.playSoftPoof();
        
        // Affect adjacent chunks
        for (let o2 of this.obstacles) {
            for (let c2 of o2.chunks) {
                if (c2.destroyed || c2 === chunk) continue;
                const dx = Math.abs((chunk.x + chunk.w/2) - (c2.x + c2.w/2));
                const dy = Math.abs((chunk.y + chunk.h/2) - (c2.y + c2.h/2));
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < Math.max(chunk.w, chunk.h) * 1.5) { // adjacent if close
                    if (Math.random() < 0.5) {
                        c2.burning = { time: 0, duration: 2.5 + Math.random() * 1.5, power: 1, nextTick: 0.44 + Math.random() * 0.22 };
                    }
                }
            }
        }
        
        // Apply burning to fighters within explosion radius (50% chance)
        for (let fighter of this.roster.getAllFighters()) {
            if (!fighter.alive) continue;
            const dist = Math.hypot(cx - fighter.x, cy - fighter.y);
            if (dist < 50 + fighter.radius) {
                if (Math.random() < 0.5) {
                    fighter.burning = { time: 0, duration: 2.5 + Math.random() * 1.5, nextTick: 0.44 + Math.random() * 0.22 };
                }
            }
        }
        
        // Remove the glow
        delete chunk.spontaneousGlow;
    }
}

// Export to window
if (typeof window !== 'undefined') {
    window.Game = Game;
}
