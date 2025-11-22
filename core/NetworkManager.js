/**
 * NetworkManager - Handles all multiplayer networking (2-4 players)
 * Host is authoritative - handles game state, collisions, eliminations
 * Clients send inputs only and receive state updates
 */
class NetworkManager {
    constructor() {
        this.role = null; // 'host' or 'joiner'
        this.sessionCode = null;
        this.joinerIndex = null; // 0-3 for joiners
    this.joinerName = null;
        this.connected = false;
        this.ws = null;
        // Determine server URL in this order:
        // 1. `window.SERVER_URL` if explicitly provided by the page (recommended for deployments)
        //    but ignore unreplaced placeholders like "{{SERVER_URL}}"
        // 2. `?ws=` query parameter (convenient per-deploy override)
        // 3. Construct from `window.location` (useful when server is co-hosted with frontend)
        // 4. Fallback to localhost for local development
        if (typeof window !== 'undefined') {
            let resolved = null;

            // Candidate from the injected config file
            try {
                const candidate = (typeof window.SERVER_URL === 'string') ? window.SERVER_URL.trim() : '';
                const isPlaceholder = !!candidate && /\{\{\s*SERVER_URL\s*\}\}/.test(candidate);
                if (candidate && !isPlaceholder) {
                    resolved = candidate;
                }
            } catch (e) {
                // ignore
            }

            // If not resolved yet, try query param 'ws'
            if (!resolved) {
                try {
                    const params = new URLSearchParams(window.location.search || '');
                    const wsParam = params.get('ws') || params.get('SERVER_URL') || '';
                    if (wsParam && wsParam.trim()) {
                        resolved = wsParam.trim();
                    }
                } catch (e) {
                    // ignore
                }
            }

            // If still not resolved, derive from location
            if (!resolved && window.location) {
                const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const host = window.location.hostname || 'localhost';
                const port = window.location.port ? (':' + window.location.port) : '';
                resolved = `${proto}//${host}${port}`;
            }

            // Normalize resolved value: if it lacks ws scheme, try to prepend same-origin scheme
            if (typeof resolved === 'string' && resolved.length > 0) {
                const lower = resolved.toLowerCase();
                if (lower.startsWith('ws://') || lower.startsWith('wss://')) {
                    this.serverUrl = resolved;
                } else if (lower.startsWith('//')) {
                    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                    this.serverUrl = proto + resolved;
                } else if (/^[a-z0-9.-]+(:[0-9]+)?/i.test(resolved)) {
                    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                    this.serverUrl = `${proto}//${resolved}`;
                } else {
                    // Last resort: use as-is (may be relative, browser will resolve)
                    this.serverUrl = resolved;
                }
            } else {
                this.serverUrl = 'ws://localhost:3001';
            }
        } else {
            this.serverUrl = 'ws://localhost:3001';
        }
        
        // Joiners (host only)
        this.joiners = []; // Array of {index, name, connected}
        this.maxJoiners = 3; // Host + 3 joiners = 4 players max
        // Config discovery state
        this._wsConfigResolved = false;
        this._wsConfigPromise = null;
        
        // Callbacks
        this.onHosted = null;
        this.onJoined = null;
        this.onPeerJoined = null;
        this.onPeerLeft = null;
        this.onHostLeft = null;
        this.onStateUpdate = null;
        this.onInputReceived = null;
        this.onCardOffer = null;
    this.onCardApply = null;
    this.onCardSelect = null;
        this.onCardHover = null;
        this.onReadyState = null;
        this.onError = null;
        this.onRoundReset = null;
        this.onDisplayNameChangeRequest = null;
    this.onCursorUpdateRequest = null;
        this.onRoundsUpdate = null;
        this.onStartCardSetting = null;
        this.onSetupUpdate = null;
        this.onSetupSyncRequest = null;
        
    // Client input throttling
    this.pendingInput = null;
        this.lastInputTime = 0;
        this.inputSendInterval = 1000 / 30; // 30hz input send rate
    }

    _maybeResolveFromConfig() {
        if (this._wsConfigResolved) return Promise.resolve();
        if (this._wsConfigPromise) return this._wsConfigPromise;

        const attempt = async () => {
            this._wsConfigResolved = false;
            try {
                if (typeof window === 'undefined') return;

                // Try known config paths
                const candidates = ['/ws-config.json', '/.well-known/shots-ws.json'];
                for (const path of candidates) {
                    try {
                        const resp = await fetch(path, { cache: 'no-store' });
                        if (!resp || resp.status >= 400) continue;
                        const json = await resp.json();
                        if (json && json.ws && typeof json.ws === 'string' && json.ws.trim()) {
                            this.serverUrl = json.ws.trim();
                            break;
                        }
                    } catch (e) {
                        // ignore individual fetch errors
                    }
                }
            } finally {
                this._wsConfigResolved = true;
            }
        };

        this._wsConfigPromise = attempt();
        return this._wsConfigPromise;
    }

    // ==================== HOST METHODS ====================
    
    async hostLobby(hostName = 'Player 1', requestedCode = null) {
        await this._maybeResolveFromConfig();
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.serverUrl);
                
                this.ws.onopen = () => {
                    this.ws.send(JSON.stringify({
                        type: 'host',
                        code: requestedCode || '',
                        name: hostName
                    }));
                };
                
                this.ws.onmessage = (event) => {
                    this._handleMessage(JSON.parse(event.data));
                };
                
                this.ws.onerror = (error) => {
                    console.error('[Network] WebSocket error:', error);
                    if (this.onError) this.onError('Connection error');
                    reject(error);
                };
                
                this.ws.onclose = () => {
                    this._handleDisconnect('Connection closed');
                };
                
                // Set up hosted callback
                const originalOnHosted = this.onHosted;
                this.onHosted = (code) => {
                    this.role = 'host';
                    this.sessionCode = code;
                    this.connected = true;
                    this.joiners = [];
                    if (originalOnHosted) originalOnHosted(code);
                    resolve(code);
                };
                
            } catch (error) {
                console.error('[Network] Failed to host lobby:', error);
                reject(error);
            }
        });
    }
    
    broadcastState(snapshot) {
        if (this.role !== 'host' || !this.connected || !snapshot) return;

        const payload = Object.assign({ type: 'state-update' }, snapshot);

        this._send({
            type: 'relay',
            data: payload
        });
    }
    
    broadcastCardOffer(fighterId, choices, slotIndex, joinerIndex, selectionType = 'powerup', fighterColor = null) {
        if (this.role !== 'host' || !this.connected) return;
        
        this._send({
            type: 'relay',
            data: {
                type: 'card-offer',
                fighterId,
                choices: choices.map(c => ({
                    name: c.name,
                    desc: c.desc,
                    rarity: c.rarity || null,
                    rarityLabel: c.rarityLabel || null,
                    rarityColor: c.rarityColor || null,
                    lines: Array.isArray(c.lines) ? c.lines : []
                })),
                slotIndex,
                joinerIndex,
                selectionType,
                fighterColor: fighterColor || null
            }
        });
    }
    
    broadcastCardApply(fighterId, cardName, joinerIndex, selectionType = 'powerup') {
        if (this.role !== 'host' || !this.connected) return;
        
        this._send({
            type: 'relay',
            data: {
                type: 'card-apply',
                fighterId,
                cardName,
                joinerIndex,
                selectionType
            }
        });
    }

    broadcastCardHover(fighterId, cardIndex, joinerIndex, selectionType = 'powerup', originJoinerIndex = null) {
        if (this.role !== 'host' || !this.connected) return;

        this._send({
            type: 'relay',
            data: {
                type: 'card-hover',
                fighterId,
                cardIndex,
                joinerIndex,
                selectionType,
                originJoinerIndex
            }
        });
    }
    
    broadcastRoundReset(obstacleData, fighterPositions, extras = {}) {
        if (this.role !== 'host' || !this.connected) return;
        
        const data = {
            type: 'round-reset',
            obstacles: obstacleData,
            fighters: fighterPositions
        };
        if (typeof extras.mapBorder === 'boolean') {
            data.mapBorder = extras.mapBorder;
        }
        if (typeof extras.worldModInterval === 'number') {
            data.worldModInterval = extras.worldModInterval;
        }
        if (typeof extras.roundsToWin === 'number') {
            data.roundsToWin = extras.roundsToWin;
        }
        if (typeof extras.chooseCardOnStart === 'boolean') {
            data.chooseCardOnStart = extras.chooseCardOnStart;
        }
        if (extras.readyStates && typeof extras.readyStates === 'object') {
            data.readyStates = extras.readyStates;
        }

        this._send({
            type: 'relay',
            data
        });
    }

    broadcastSetupUpdate(payload = {}, targetJoinerIndex = null) {
        if (this.role !== 'host' || !this.connected) return;

        const message = {
            type: 'relay',
            data: {
                type: 'setup-update',
                payload: Object.assign({}, payload)
            }
        };

        if (typeof targetJoinerIndex === 'number') {
            message.data.targetJoinerIndex = targetJoinerIndex;
        }

        this._send(message);
    }

    // ==================== JOINER METHODS ====================
    
    async joinLobby(sessionCode, playerName = 'Player 2') {
        await this._maybeResolveFromConfig();
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.serverUrl);
                
                this.ws.onopen = () => {
                    this.ws.send(JSON.stringify({
                        type: 'join',
                        code: sessionCode.toUpperCase(),
                        name: playerName
                    }));
                };
                
                this.ws.onmessage = (event) => {
                    this._handleMessage(JSON.parse(event.data));
                };
                
                this.ws.onerror = (error) => {
                    console.error('[Network] WebSocket error:', error);
                    if (this.onError) this.onError('Connection error');
                    reject(error);
                };
                
                this.ws.onclose = () => {
                    this._handleDisconnect('Connection closed');
                };
                
                // Set up joined callback
                const originalOnJoined = this.onJoined;
                this.onJoined = (code, joinerIndex) => {
                    this.role = 'joiner';
                    this.sessionCode = code;
                    this.joinerIndex = joinerIndex;
                    this.connected = true;
                    if (originalOnJoined) originalOnJoined(code, joinerIndex);
                    resolve({ code, joinerIndex });
                };
                
            } catch (error) {
                console.error('[Network] Failed to join lobby:', error);
                reject(error);
            }
        });
    }
    
    sendInput(keys, mouseX, mouseY, shootPressed, dashPressed) {
        if (this.role !== 'joiner' || !this.connected) return false;

        const now = Date.now();
        this.pendingInput = {
            type: 'input',
            joinerIndex: this.joinerIndex,
            keys,
            mouseX,
            mouseY,
            shootPressed,
            dashPressed,
            timestamp: now
        };

        if (now - this.lastInputTime < this.inputSendInterval) {
            return false;
        }

        return this._flushPendingInput(now);
    }

    _flushPendingInput(timestamp) {
        if (!this.pendingInput) return false;

        const payload = this.pendingInput;
        const message = {
            type: 'relay',
            data: payload
        };

        const success = this._send(message);
        if (success) {
            this.pendingInput = null;
            this.lastInputTime = typeof timestamp === 'number' ? timestamp : Date.now();
            return true;
        }

        // Keep the payload pending so we can retry on the next tick
        this.pendingInput = payload;
        return false;
    }
    
    sendCardSelection(cardName, fighterId, selectionType = 'powerup') {
        if (!this.connected) return;
        
        this._send({
            type: 'relay',
            data: {
                type: 'card-select',
                joinerIndex: this.joinerIndex,
                cardName,
                fighterId,
                selectionType
            }
        });
    }

    sendCardHover(fighterId, cardIndex, selectionType = 'powerup') {
        if (this.role !== 'joiner' || !this.connected) return;

        this._send({
            type: 'relay',
            data: {
                type: 'card-hover',
                fighterId,
                cardIndex,
                selectionType
            }
        });
    }

    sendDisplayNameChange(fighterId, slotIndex, name) {
        if (this.role !== 'joiner' || !this.connected) return;

        const trimmed = (name || '').toString().trim().slice(0, 32);
        if (!trimmed) return;

        this._send({
            type: 'relay',
            data: {
                type: 'display-name-change',
                joinerIndex: this.joinerIndex,
                fighterId,
                slotIndex,
                name: trimmed
            }
        });
    }

    sendMessage(messageType, data) {
        if (!this.connected) return false;
        
        this._send({
            type: 'relay',
            data: Object.assign({ type: messageType }, data)
        });
        
        return true;
    }

    broadcastReadyStates(states = {}) {
        if (this.role !== 'host' || !this.connected) return;
        this._send({
            type: 'relay',
            data: {
                type: 'ready-state',
                states: Object.assign({}, states)
            }
        });
    }

    sendReadyState(slotIndex, ready) {
        if (this.role !== 'joiner' || !this.connected) return;
        this._send({
            type: 'relay',
            data: {
                type: 'ready-state',
                slotIndex,
                ready: !!ready,
                joinerIndex: this.joinerIndex
            }
        });
    }

    // ==================== COMMON METHODS ====================
    
    disconnect() {
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.onerror = null;
            this.ws.close();
            this.ws = null;
        }
        
        this._handleDisconnect('Disconnected');
    }
    
    _send(message) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
        
        try {
            this.ws.send(JSON.stringify(message));
            return true;
        } catch (error) {
            console.error('[Network] Send error:', error);
            return false;
        }
    }
    
    _handleMessage(message) {
        switch (message.type) {
            case 'hosted':
                this.sessionCode = message.code;
                if (this.onHosted) this.onHosted(message.code);
                console.log('[Network] Hosted session:', message.code);
                break;
                
            case 'joined':
                this.sessionCode = message.code;
                this.joinerIndex = message.joinerIndex;
                this.joinerName = message.name || null;
                if (this.onJoined) this.onJoined(message.code, message.joinerIndex, message.name || null);
                console.log('[Network] Joined session:', message.code, 'as joiner', message.joinerIndex, message.name || '');
                break;
                
            case 'peer-joined':
                if (this.role === 'host') {
                    const joinerInfo = { index: message.joinerIndex, connected: true, name: message.name || null };
                    this.joiners[message.joinerIndex] = joinerInfo;
                }
                if (this.onPeerJoined) this.onPeerJoined(message.joinerIndex, message.name || null);
                console.log('[Network] Peer joined:', message.joinerIndex, message.name || '');
                break;
                
            case 'peer-left':
                if (this.role === 'host') {
                    this.joiners[message.joinerIndex] = null;
                }
                if (this.onPeerLeft) this.onPeerLeft(message.joinerIndex);
                console.log('[Network] Peer left:', message.joinerIndex);
                break;
                
            case 'host-left':
                this._handleDisconnect('Host left');
                if (this.onHostLeft) this.onHostLeft();
                break;
                
            case 'relay':
                this._handleRelayMessage(message.data);
                break;
                
            case 'error':
                console.error('[Network] Server error:', message.message);
                if (this.onError) this.onError(message.message);
                this._handleDisconnect(message.message);
                break;
                
            default:
                console.warn('[Network] Unknown message type:', message.type);
        }
    }
    
    _handleRelayMessage(data) {
        if (!data) return;
        
        switch (data.type) {
            case 'state-update':
                // Joiner receives authoritative state from host
                if (this.role === 'joiner' && this.onStateUpdate) {
                    this.onStateUpdate(data);
                }
                break;
                
            case 'input':
                // Host receives input from joiner
                if (this.role === 'host' && this.onInputReceived) {
                    this.onInputReceived(data.joinerIndex, data);
                }
                break;
                
            case 'card-offer':
                if (this.onCardOffer) {
                    this.onCardOffer(data);
                }
                break;
                
            case 'card-select':
                if (this.role === 'host' && this.onCardSelect) {
                    data.originJoinerIndex = typeof data.joinerIndex === 'number' ? data.joinerIndex : null;
                    this.onCardSelect(data);
                }
                break;
                
            case 'card-apply':
                if (this.onCardApply) {
                    this.onCardApply(data);
                }
                break;

            case 'card-hover':
                if (this.role === 'host') {
                    data.originJoinerIndex = typeof data.joinerIndex === 'number' ? data.joinerIndex : null;
                }
                if (this.onCardHover) {
                    this.onCardHover(data);
                }
                break;

            case 'display-name-change':
                if (this.role === 'host' && this.onDisplayNameChangeRequest) {
                    this.onDisplayNameChangeRequest(data);
                }
                break;

            case 'cursor-update':
                if (this.role === 'host' && this.onCursorUpdateRequest) {
                    this.onCursorUpdateRequest(data);
                }
                break;
                
            case 'round-reset':
                if (this.onRoundReset) {
                    this.onRoundReset(data);
                }
                break;
                
            case 'rounds-update':
                if (this.onRoundsUpdate) {
                    this.onRoundsUpdate(data);
                }
                break;

            case 'ready-state':
                if (this.onReadyState) {
                    this.onReadyState(data);
                }
                break;

            case 'start-card-setting':
                if (this.onStartCardSetting) {
                    this.onStartCardSetting(data);
                }
                break;

            case 'setup-update':
                if (this.onSetupUpdate) {
                    const targetJoinerIndex = (typeof data.targetJoinerIndex === 'number') ? data.targetJoinerIndex : null;
                    this.onSetupUpdate(data.payload || {}, targetJoinerIndex);
                }
                break;

            case 'setup-sync-request':
                if (this.role === 'host' && this.onSetupSyncRequest) {
                    this.onSetupSyncRequest(data);
                }
                break;
                
            default:
                console.warn('[Network] Unknown relay type:', data.type);
        }
    }
    
    _handleDisconnect(reason) {
        console.log('[Network] Disconnected:', reason);
        this.connected = false;
        this.role = null;
        this.sessionCode = null;
        this.joinerIndex = null;
    this.joinerName = null;
        this.joiners = [];
        this.pendingInput = null;
        
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.onerror = null;
            this.ws = null;
        }
    }
}

// Export to window
if (typeof window !== 'undefined') {
    window.NetworkManager = NetworkManager;
}
