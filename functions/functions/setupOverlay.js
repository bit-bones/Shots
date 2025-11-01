function setupOverlayInit() {
    // --- Multiplayer WebSocket logic ---
    // Make networking vars global so update() can access them reliably
    window.ws = null;
    window.wsRole = null; // 'host' or 'joiner'
    window.wsSession = null;
    window.remotePlayerState = { x: 0, y: 0, shoot: false, dash: false };
    window.lastSentAction = {};
    // Configurable server URL: prefer ?ws=, otherwise try same origin, fallback to localhost
    const paramWs = new URLSearchParams(window.location.search).get('ws');
    const isSecure = location.protocol === 'https:';
    const host = location.hostname || 'localhost';
    let portSegment = '';
    if (isSecure) {
        if (location.port && location.port !== '443') {
            portSegment = ':' + location.port;
        }
    } else {
        if (location.port) {
            portSegment = ':' + location.port;
        } else {
            portSegment = ':3001';
        }
    }
    const defaultWs = (isSecure ? 'wss://' : 'ws://') + host + portSegment;
    window.MULTIPLAYER_WS_URL = paramWs || defaultWs;

    window.sendAction = function(action) {
        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify({ type: 'relay', data: action }));
        }
    };

    function handleGameMessage(data) {
        // --- WorldMaster network protocol extension ---
        if (data && data.type === 'worldmaster-card-toggle') {
            // Sync card deck enable/disable states
            // Example: { type: 'worldmaster-card-toggle', cardType: 'mod'|'powerup', name, enabled }
            if (window.gameWorldMaster && typeof window.gameWorldMaster.syncCardDecksFromNet === 'function') {
                window.gameWorldMaster.syncCardDecksFromNet(data);
            }
            return;
        }
        if (data && data.type === 'worldmaster-control') {
            // Sync which effect is being manually controlled
            // Example: { type: 'worldmaster-control', effectName }
            if (window.gameWorldMaster && typeof window.gameWorldMaster.syncControlStateFromNet === 'function') {
                window.gameWorldMaster.syncControlStateFromNet(data);
            }
            return;
        }
        if (data && data.type === 'worldmaster-action') {
            // Sync manual effect activations (click locations)
            // Example: { type: 'worldmaster-action', effectName, x, y }
            // If a WM instance exists locally (e.g., on the WM client), use its handler first.
            // In cases where the stub exists but no instance is present (host not WM), fall back to host execution.
            let handledByWM = false;
            if (window.gameWorldMaster && typeof window.gameWorldMaster.syncActionFromNet === 'function') {
                const hadInstance = !!window.gameWorldMasterInstance;
                window.gameWorldMaster.syncActionFromNet(data);
                handledByWM = !!window.gameWorldMasterInstance && !window.gameWorldMasterInstance.isLocal;
                // Note: when host is not WM, there is no instance, so handledByWM remains false
            }
            if (!handledByWM) {
                try {
                    if (NET && NET.role === 'host') {
                        const eff = (data.effectName || '').toString();
                        const x = Number(data.x), y = Number(data.y);
                        // Execute based on effect
                        if (eff === 'Firestorm') {
                            try {
                                // Increase manual/manual-triggered Firestorm default radius from 140 to 200
                                firestormInstance = new Firestorm(x, y, 200);
                                firestormActive = true; firestormTimer = 0;
                                // Emit actual radius value (was incorrectly hardcoded to 140)
                                GameEvents.emit('firestorm-spawn', { x, y, radius: 200 });
                            } catch (e) {}
                        } else if (eff === 'Spontaneous') {
                            // Find obstacle at x,y and create explosion
                            try {
                                for (let oi = 0; oi < (obstacles||[]).length; oi++) {
                                    const o = obstacles[oi];
                                    if (!o || o.destroyed) continue;
                                    const inBox = (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h);
                                    const cx = o.x + o.w/2, cy = o.y + o.h/2;
                                    const near = Math.hypot(x - cx, y - cy) <= Math.max(o.w, o.h) * 0.8;
                                    if (inBox || near) {
                                        const cx = o.x + o.w/2, cy = o.y + o.h/2;
                                        const r = Math.max(o.w, o.h) * 1.0 + 50;
                                        const dmg = 36;
                                        explosions.push(new Explosion(cx, cy, r, '#ff6b4a', dmg, null, false));
                                        for (const c of o.chunks) { if (!c.destroyed) { const ang = Math.atan2(c.y + c.h/2 - cy, c.x + c.w/2 - cx) + (Math.random()-0.5)*0.8; const v = 200 + Math.random()*180; c.vx = Math.cos(ang)*v; c.flying = true; c.destroyed = true; c.alpha = 1; } }
                                        o.destroyed = true;
                                        try { createSyncedChunkUpdate(oi, o.chunks.map((cc, idx) => ({ i: idx, destroyed: !!cc.destroyed, flying: !!cc.flying, vx: cc.vx||0, vy: cc.vy||0, alpha: cc.alpha||1, x: cc.x, y: cc.y }))); } catch (e) {}
                                        try { createSyncedExplosion(cx, cy, r, '#ff6b4a', dmg, null); } catch (e) {}
                                        try { playExplosion(); } catch (e) {}
                                        break;
                                    }
                                }
                            } catch (e) {}
                        } else if (eff === 'Infestation') {
                            try {
                                for (let oi = 0; oi < (obstacles||[]).length; oi++) {
                                    const obs = obstacles[oi];
                                    if (!obs || !obs.chunks) continue;
                                    for (let ci = 0; ci < obs.chunks.length; ci++) {
                                        const c = obs.chunks[ci];
                                        if (!c || c.destroyed) continue;
                                        if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
                                            // Enforce max active infested chunks
                                            try {
                                                const activeCount = (infestedChunks || []).filter(ic => ic && ic.active).length;
                                                if (activeCount < 10) {
                                                    const inf = new InfestedChunk(c, obs);
                                                    infestedChunks.push(inf);
                                                }
                                            } catch (e) {
                                                const inf = new InfestedChunk(c, obs);
                                                infestedChunks.push(inf);
                                            }
                                            try {
                                                if (typeof inf !== 'undefined' && inf) {
                                                    GameEvents.emit('infestation-spawn', { obstacleIndex: oi, chunkIndex: ci, id: inf.id, x: inf.x, y: inf.y, w: inf.w, h: inf.h, hp: inf.hp });
                                                }
                                            } catch (e) {}
                                            oi = obstacles.length; break;
                                        }
                                    }
                                }
                            } catch (e) {}
                        } else if (eff === 'Dynamic' || eff === 'Dynamic-Spawn' || eff === 'Dynamic-Despawn') {
                            // Equal in/out behavior: keep total live obstacles constant
                            try {
                                const enemySuppressed = isEnemySuppressedForGameplay();
                                // Destroy helper
                                const destroyIdx = (idx) => {
                                    const o = obstacles[idx]; if (!o || o.destroyed) return false;
                                    for (const c of o.chunks) { if (!c.destroyed) { c.destroyed = true; c.flying = true; c.vx = rand(-140,140); c.vy = rand(-240,-40); c.alpha = 1; } }
                                    o.destroyed = true; try { GameEvents.emit('dynamic-despawn', { obstacleIndex: idx }); } catch (e) {}
                                    return true;
                                };
                                // Create helper
                                const makeAt = (px, py) => {
                                    // Try multiple attempts to find a non-overlapping location near px,py
                                    for (let attempt = 0; attempt < 40; attempt++) {
                                        const size = rand(OBSTACLE_MIN_SIZE, OBSTACLE_MAX_SIZE);
                                        const w = size, h = size;
                                        // jitter around desired px,py a bit
                                        const jitterX = px + rand(-40, 40);
                                        const jitterY = py + rand(-40, 40);
                                        let nx = Math.max(60, Math.min(window.CANVAS_W - 60 - w, jitterX - w/2));
                                        let ny = Math.max(60, Math.min(CANVAS_H - 60 - h, jitterY - h/2));
                                        const candidate = new Obstacle(nx, ny, w, h);
                                        const centerX = nx + w/2, centerY = ny + h/2;
                                        let safe = true;
                                        for (let k = 0; k < obstacles.length; k++) {
                                            const o2 = obstacles[k];
                                            if (!o2) continue;
                                            if (!o2.destroyed && rectsOverlap(o2, candidate)) { safe = false; break; }
                                        }
                                        if (!safe) continue;
                                        if (dist(centerX, centerY, player.x, player.y) <= 90) safe = false;
                                        if (!enemySuppressed && dist(centerX, centerY, enemy.x, enemy.y) <= 90) safe = false;
                                        if (!safe) continue;
                                        return candidate;
                                    }
                                    // Failed to find safe spot
                                    return null;
                                };
                                // Find clicked obstacle
                                let clicked = -1;
                                for (let oi = 0; oi < (obstacles||[]).length; oi++) {
                                    const o = obstacles[oi]; if (!o || o.destroyed) continue;
                                    if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) { clicked = oi; break; }
                                }
                                if (clicked >= 0) {
                                    // Remove clicked (mark chunks flying) and append a new obstacle elsewhere so flying chunks remain visible
                                    destroyIdx(clicked);
                                    const newObs = makeAt(rand(80, window.CANVAS_W-80), rand(80, CANVAS_H-80));
                                    if (newObs) {
                                        obstacles.push(newObs);
                                        try { GameEvents.emit('dynamic-spawn', { obstacleIndex: obstacles.indexOf(newObs), obstacle: { x: newObs.x, y: newObs.y, w: newObs.w, h: newObs.h } }); } catch (e) {}
                                    }
                                } else {
                                    // Empty space: spawn at click, remove a random live obstacle (mark destroyed but keep it for visuals)
                                    const liveIdx = obstacles.map((o,i)=>(!o||o.destroyed)?-1:i).filter(i=>i>=0);
                                    if (liveIdx.length > 0) {
                                        const remIdx = liveIdx[Math.floor(Math.random()*liveIdx.length)];
                                        const newObs = makeAt(x, y);
                                        if (newObs) {
                                            destroyIdx(remIdx);
                                            obstacles.push(newObs);
                                            try { GameEvents.emit('dynamic-spawn', { obstacleIndex: obstacles.indexOf(newObs), obstacle: { x: newObs.x, y: newObs.y, w: newObs.w, h: newObs.h } }); } catch (e) {}
                                        }
                                    }
                                }
                            } catch (e) {}
                        }
                    }
                } catch (e) { console.warn('Failed to execute WM action on host fallback', e); }
            }
            return;
        }
        // Remote focus from WM chooser hover (visual only)
        if (data && data.type === 'mod-focus') {
            try {
                const idx = (typeof data.idx === 'number') ? data.idx : -1;
                const div = document.getElementById('card-choices');
                if (!div) return;
                // Record forced focus on the div so clearAll respects it
                div._forceFocus = idx >= 0 ? idx : -1;
                // Clear existing hover highlights except the forced one
                for (let c of div.childNodes) {
                    try {
                        const ci = Array.prototype.indexOf.call(div.childNodes, c);
                        if (div._forceFocus >= 0 && ci === div._forceFocus) continue;
                        c.style.removeProperty('border');
                        c.style.removeProperty('box-shadow');
                        c.style.removeProperty('color');
                        const sm = c.querySelector('small'); if (sm) sm.style.removeProperty('color');
                        const hb = c.querySelector('b'); if (hb) hb.style.removeProperty('color');
                        if (c._accentClass) c.classList.remove(c._accentClass);
                        if (c._accentStyle) { c._accentStyle.remove(); c._accentStyle = null; }
                        c.style.transform = 'none';
                        c.style.zIndex = 1;
                    } catch (e) {}
                }
                if (idx >= 0 && div.childNodes[idx]) {
                    const card = div.childNodes[idx];
                    try {
                        const accent = '#a06cc7';
                        const textColor = '#b48be6';
                        card.style.transform = 'scale(1.13)';
                        card.style.zIndex = 10;
                        card.style.setProperty('border', `3px solid ${accent}`, 'important');
                        card.style.setProperty('box-shadow', `0 6px 18px ${accent}`, 'important');
                        card.style.setProperty('color', textColor, 'important');
                        const sm = card.querySelector('small'); if (sm) sm.style.setProperty('color', textColor, 'important');
                        const hb = card.querySelector('b'); if (hb) hb.style.setProperty('color', textColor, 'important');
                        if (!card._accentClass) card._accentClass = 'card-accent-' + Math.floor(Math.random()*1000000);
                        if (!card._accentStyle) {
                            const styleEl = document.createElement('style');
                            styleEl.innerText = `.${card._accentClass}::after{ background: radial-gradient(ellipse at center, ${accent}33 0%, #0000 100%) !important; } .${card._accentClass}.centered::after{ background: radial-gradient(ellipse at center, ${accent}55 0%, #0000 100%) !important; }`;
                            document.head.appendChild(styleEl);
                            card._accentStyle = styleEl;
                        }
                        card.classList.add(card._accentClass);
                    } catch (e) {}
                }
            } catch (e) {}
            return;
        }
        // Update remote player state
        if (typeof data.x === 'number' && typeof data.y === 'number') {
            remotePlayerState.x = data.x;
            remotePlayerState.y = data.y;
        }
        if (data.shoot) remotePlayerState.shoot = true;
        if (data.dash) remotePlayerState.dash = true;
    }

    // Patch ws.onmessage to use handleGameMessage
    function patchWsOnMessage() {
        if (!window.ws) return;
        window.ws.onmessage = function(event) {
            let msg;
            try { msg = JSON.parse(event.data); } catch (e) { return; }
            if (msg.type === 'error') {
                const message = (msg && msg.message) ? msg.message : 'An error occurred while communicating with the server.';
                alert(message);
                return;
            }
            if (msg.type === 'hosted') {
                if (mpSessionCode) mpSessionCode.value = msg.code;
                if (typeof setMpSessionDisplay === 'function') setMpSessionDisplay(msg.code);
                window.wsSession = msg.code;
                if (!NET.hostName) NET.hostName = NET.myName || 'Host';
                try {
                    if (typeof setLobbyPlayers === 'function') {
                        setLobbyPlayers(NET.myName || 'Player 1', NET.getJoinerName(0) || NET.peerName || 'Player 2');
                    }
                } catch (e) {}
                try { if (typeof updateCardsUI === 'function') updateCardsUI(); } catch (e) {}
                try { updateWorldMasterSetupUI(); } catch (e) {}
            } else if (msg.type === 'joined') {
                hideMpModal();
                alert('Joined session: ' + msg.code);
                window.wsSession = msg.code;
                if (mpSessionCode) mpSessionCode.value = msg.code;
                if (typeof setMpSessionDisplay === 'function') setMpSessionDisplay(msg.code);
                const idx = (typeof msg.joinerIndex === 'number' && msg.joinerIndex >= 0) ? msg.joinerIndex : null;
                NET.joinerIndex = idx;
                if (idx !== null) {
                    const localName = NET.pendingName || NET.myName || '';
                    if (localName) {
                        NET.updateJoinerName(idx, localName, { control: 'local' });
                    }
                }
                if (NET.pendingName) {
                    NET.myName = NET.pendingName;
                    NET.pendingName = '';
                }
                sendLocalDisplayName();
                try {
                    if (typeof setLobbyPlayers === 'function') {
                        const hostLabel = NET.hostName || NET.peerName || 'Host';
                        setLobbyPlayers(hostLabel, NET.myName || 'Player 2');
                    }
                } catch (e) {}
                try { if (typeof updateCardsUI === 'function') updateCardsUI(); } catch (e) {}
                try { updateWorldMasterSetupUI(); } catch (e) {}
                try { renderRosterUI(); } catch (e) {}
            } else if (msg.type === 'peer-joined') {
                hideMpModal();
                const idx = (typeof msg.joinerIndex === 'number' && msg.joinerIndex >= 0) ? msg.joinerIndex : 0;
                if (NET.role === 'host') {
                    alert('A player has joined your session!' + (Number.isInteger(idx) ? ` (Slot ${idx + 2})` : ''));
                    const existingName = NET.getJoinerName(idx);
                    const placeholder = existingName || `Joiner ${idx + 1}`;
                    NET.updateJoinerName(idx, placeholder, { control: 'remote' });
                    assignRemoteJoinerToRoster(idx, placeholder, { isPending: true });
                    sendLocalDisplayName();
                    try { broadcastRosterSnapshot(); } catch (e) {}
                } else {
                    if (idx !== NET.joinerIndex) {
                        const existingName = NET.getJoinerName(idx);
                        NET.updateJoinerName(idx, existingName || `Joiner ${idx + 1}`, { control: 'remote' });
                    }
                }
                try {
                    if (typeof setLobbyPlayers === 'function') {
                        const hostLabel = NET.role === 'host' ? (NET.myName || 'Host') : (NET.hostName || NET.peerName || 'Host');
                        const joinerLabel = NET.role === 'host' ? (NET.getJoinerName(0) || NET.peerName || 'Joiner') : (NET.myName || 'Player 2');
                        setLobbyPlayers(hostLabel, joinerLabel);
                    }
                } catch (e) {}
                try { if (typeof updateCardsUI === 'function') updateCardsUI(); } catch (e) {}
                try { updateWorldMasterSetupUI(); } catch (e) {}
                try { renderRosterUI(); } catch (e) {}
            } else if (msg.type === 'peer-left') {
                const idx = (typeof msg.joinerIndex === 'number' && msg.joinerIndex >= 0) ? msg.joinerIndex : null;
                if (idx !== null) {
                    if (NET.role === 'host') {
                        try { clearRemoteJoinerFromRoster(idx); } catch (e) {}
                        try { broadcastRosterSnapshot(); } catch (e) {}
                    }
                    NET.removeJoiner(idx);
                }
                try {
                    if (typeof setLobbyPlayers === 'function') {
                        const hostLabel = NET.role === 'host' ? (NET.myName || 'Host') : (NET.hostName || NET.peerName || 'Host');
                        const joinerLabel = NET.role === 'host' ? (NET.getJoinerName(0) || NET.peerName || 'Joiner') : (NET.myName || 'Player 2');
                        setLobbyPlayers(hostLabel, joinerLabel);
                    }
                } catch (e) {}
                try { if (typeof updateCardsUI === 'function') updateCardsUI(); } catch (e) {}
                try { updateWorldMasterSetupUI(); } catch (e) {}
                try { renderRosterUI(); } catch (e) {}
            } else if (msg.type === 'host-left') {
                if (NET.role === 'joiner') {
                    alert('Host left the session. You have been disconnected.');
                    NET.handleDisconnect('Host left the session');
                }
            } else if (msg.type === 'relay') {
                // New routing: input from joiner to host, snapshots from host to joiner
                const data = msg.data;
                try { /* removed debug relay tap logging */ } catch (e) {}
                // Unified event system: handle game-event
                if (data && data.type === 'game-event' && data.event) {
                    if (typeof GameEvents !== 'undefined' && typeof GameEvents.processEvent === 'function') {
                        GameEvents.processEvent(data.event);
                    }
                    return;
                }
                if (data && data.type === 'input' && NET.role === 'host') {
                    const jIdx = (typeof data.joinerIndex === 'number' && data.joinerIndex >= 0) ? data.joinerIndex : 0;
                    NET.remoteInputs[jIdx] = { ...(data.input||{}), seq: data.seq };
                    try { console.log('[HOST] Received input from joiner', jIdx, 'seq', data.seq, 'input', data.input); } catch (e) {}
                    NET.lastInputAtMap[jIdx] = NET.now();
                    // Queue one-shot actions per joiner
                    if (data.input && data.input.shoot) NET.remoteShootQueuedMap[jIdx] = true;
                    if (data.input && data.input.dash) {
                        NET.remoteDashReqSeqMap[jIdx] = data.seq || ((NET.remoteDashReqSeqMap[jIdx]||0) + 1);
                    }
                } else if (data && data.type === 'snapshot' && NET.role === 'joiner') {
                    NET.applySnapshot(data.snap);
                } else if (data && data.type === 'set-name') {
                    const rawName = (data.name || '').toString();
                    const name = rawName.slice(0, 32);
                    const joinerIdx = (typeof data.joinerIndex === 'number' && data.joinerIndex >= 0) ? data.joinerIndex : null;
                    if (data.role === 'host') {
                        NET.hostName = name || 'Host';
                        NET.peerName = NET.hostName;
                        if (NET.role === 'host') {
                            try { broadcastRosterSnapshot(); } catch (e) {}
                        }
                    } else if (data.role === 'joiner') {
                        if (joinerIdx !== null) {
                            NET.updateJoinerName(joinerIdx, name || `Joiner ${joinerIdx + 1}`, { control: 'remote' });
                            if (NET.role === 'host') {
                                assignRemoteJoinerToRoster(joinerIdx, name || `Joiner ${joinerIdx + 1}`);
                                try { broadcastRosterSnapshot(); } catch (e) {}
                            }
                            if (NET.role === 'joiner' && joinerIdx === NET.joinerIndex) {
                                NET.myName = name || NET.myName;
                            }
                        }
                    } else {
                        if (NET.role === 'host') {
                            const idx = joinerIdx === null ? 0 : joinerIdx;
                            NET.updateJoinerName(idx, name || `Joiner ${idx + 1}`, { control: 'remote' });
                            if (NET.role === 'host') {
                                try { broadcastRosterSnapshot(); } catch (e) {}
                            }
                        } else {
                            NET.hostName = name || NET.hostName;
                            NET.peerName = name || NET.peerName;
                            if (NET.role === 'host') {
                                try { broadcastRosterSnapshot(); } catch (e) {}
                            }
                        }
                    }
                    try {
                        if (typeof setLobbyPlayers === 'function') {
                            const hostLabel = NET.role === 'host' ? (NET.myName || 'Host') : (NET.hostName || 'Host');
                            const joinerLabel = NET.role === 'host' ? (NET.getJoinerName(0) || NET.peerName || 'Joiner') : (NET.myName || 'Player 2');
                            setLobbyPlayers(hostLabel, joinerLabel);
                        }
                    } catch (e) {}
                    try { updateCardsUI(); } catch (e) {}
                    try { updateWorldMasterSetupUI(); } catch (e) {}
                    try { renderRosterUI(); } catch (e) {}
                } else if (data && data.type === 'roster-sync' && data.roster) {
                    const rosterData = data.roster;
                    if (NET.role === 'joiner' && playerRoster && typeof playerRoster.importSerializable === 'function') {
                        try {
                            playerRoster.importSerializable(rosterData, { preserveExternalIds: true });
                        } catch (e) {}
                        try {
                            if (Array.isArray(rosterData.fighters)) {
                                rosterData.fighters.forEach((fighter) => {
                                    if (!fighter) return;
                                    const meta = fighter.metadata || {};
                                    if (typeof meta.joinerIndex === 'number') {
                                        NET.updateJoinerName(meta.joinerIndex, fighter.name || `Joiner ${meta.joinerIndex + 1}`, meta);
                                    }
                                    if (meta.isHost) {
                                        NET.hostName = fighter.name || NET.hostName;
                                        NET.peerName = NET.hostName;
                                    }
                                });
                            }
                        } catch (e) {}
                        try { renderRosterUI(); } catch (e) {}
                        try { updateWorldMasterSetupUI(); } catch (e) {}
                        try {
                            if (typeof setLobbyPlayers === 'function') {
                                const hostLabel = NET.hostName || 'Host';
                                const joinerLabel = (typeof NET.joinerIndex === 'number')
                                    ? (NET.getJoinerName(NET.joinerIndex) || NET.myName || 'Player 2')
                                    : (NET.myName || 'Player 2');
                                setLobbyPlayers(hostLabel, joinerLabel);
                            }
                        } catch (e) {}
                    }
                } else if (data && data.type === 'setup' && NET.role === 'joiner') {
                    // Update the joiner's setup UI live
                    applyIncomingSetup(data.data);
                } else if (data && data.type === 'rounds-update') {
                    // Host sent the rounds-to-win value; apply on joiner so UI and logic match
                    try {
                        const r = parseInt(data.rounds);
                        if (NET.role === 'joiner' && typeof r === 'number' && !isNaN(r) && r > 0) {
                            ROUNDS_TO_WIN = r;
                            try { const roundsInput = document.getElementById('rounds-to-win'); if (roundsInput) roundsInput.value = ROUNDS_TO_WIN; } catch (e) {}
                            try { localStorage.setItem('shape_shot_rounds', String(ROUNDS_TO_WIN)); } catch (e) {}
                        }
                    } catch (e) {}
                } else if (data && data.type === 'round-start') {
                    // Sync obstacles and critical flags before starting
                    if (NET.role === 'joiner') {
                        // If host included player names, store them for HUD
                        try {
                            if (data.names) {
                                NET.peerName = data.names && data.names.p0 ? data.names.p0 : NET.peerName;
                                // our own name may be included too
                                NET.myName = data.names && data.names.p1 ? data.names.p1 : NET.myName;
                                try { updateCardsUI(); } catch (e) {}
                                try { if (typeof setLobbyPlayers === 'function') setLobbyPlayers(NET.peerName || 'Player 1', NET.myName || 'Player 2'); } catch (e) {}
                            }
                        } catch (e) {}
                        // apply settings
                        try {
                            DYNAMIC_MODE = !!data.dynamic;
                            DYNAMIC_RATE = parseFloat(data.dynamicRate);
                            MAP_BORDER = !!data.mapBorder;
                            worldModifierRoundInterval = parseInt(data.worldModInterval||3);
                            // build obstacles
                            deserializeObstacles(data.obstacles||[]);
                        } catch (e) {}
                        // Clear any transient world-mod entities so client visuals reset with the map
                        try { infestedChunks = []; firestormInstance = null; firestormTimer = 0; spontaneousTimer = 0; infestationTimer = 0; } catch (e) {}
                        // Close any lingering card UI
                        const div = document.getElementById('card-choices');
                        if (div) { div.style.display='none'; div.innerHTML=''; div.classList.remove('card-bg-visible'); }
                        cardState.active = false; waitingForCard = false;
                        hideWaitingOverlay();
                        startGame();
                    }
                } else if (data && data.type === 'player-ready') {
                    if (NET.role === 'host') {
                        const idx = (typeof data.joinerIndex === 'number' && data.joinerIndex >= 0) ? data.joinerIndex : 0;
                        readyPlayers.add(`joiner${idx}`);
                        maybeStartRoundIfReady();
                    }
                } else if (data && data.type === 'round-reset') {
                    // Host reset after death: sync map, positions, and scores
                    try {
                        if (NET.role === 'joiner') {
                            deserializeObstacles(data.obstacles||[]);
                            if (data.hostPos) { enemy.x = data.hostPos.x; enemy.y = data.hostPos.y; enemy.health = data.hostPos.hp; }
                            if (data.joinerPos) { player.x = data.joinerPos.x; player.y = data.joinerPos.y; player.health = data.joinerPos.hp; }
                            if (data.scores) {
                                // P1 (host) shows on joiner as enemy; P2 (joiner) shows as player
                                enemy.score = data.scores.host|0;
                                player.score = data.scores.joiner|0;
                            }
                            if (data.rosterScores && Array.isArray(data.rosterScores)) {
                                try {
                                    if (playerRoster && typeof playerRoster.setScore === 'function') {
                                        for (const rs of data.rosterScores) {
                                            if (rs && rs.id && typeof rs.score === 'number') {
                                                playerRoster.setScore(rs.id, rs.score);
                                            }
                                        }
                                    }
                                } catch (err) {}
                            }
                            bullets = []; explosions = []; infestedChunks = [];
                            // reset transient world-mod entities on joiner after round-reset
                            try { firestormInstance = null; firestormTimer = 0; spontaneousTimer = 0; infestationTimer = 0; } catch (e) {}
                            // Ensure any local burning states are cleared so DoT doesn't carry over
                            try {
                                if (player && player.burning) player.burning = null;
                                if (enemy && enemy.burning) enemy.burning = null;
                                if (Array.isArray(obstacles)) {
                                    for (let oi = 0; oi < obstacles.length; oi++) {
                                        const obs = obstacles[oi];
                                        if (!obs || !obs.chunks) continue;
                                        for (let ci = 0; ci < obs.chunks.length; ci++) {
                                            const chunk = obs.chunks[ci];
                                            if (chunk && chunk.burning) chunk.burning = null;
                                        }
                                    }
                                }
                                try { if (typeof burningEntities !== 'undefined') burningEntities = new Set(); } catch (e) {}
                            } catch (e) {}
                        } else {
                            // host already applied locally in update()
                        }
                        updateCardsUI();
                        // Close any lingering card UI
                        const div = document.getElementById('card-choices');
                        if (div) { div.style.display='none'; div.innerHTML=''; div.classList.remove('card-bg-visible'); }
                        cardState.active = false; waitingForCard = false;
                    } catch (e) {}
                } else if (data && data.type === 'score-update') {
                    try {
                        if (NET.role === 'joiner' && playerRoster && typeof playerRoster.setScore === 'function' && data.fighterId && typeof data.score === 'number') {
                            playerRoster.setScore(data.fighterId, data.score);
                        }
                    } catch (err) {}
                } else if (data && data.type === 'card-offer') {
                    // Host offered powerup choices to a role: show the UI on clients (unless match has ended)
                    if (!matchOver) {
                        try { waitingForCard = true; } catch (e) {}
                        const offeredFighterId = data && data.fighterId != null ? String(data.fighterId) : null;
                        const offeredSlotIndex = (data && typeof data.slotIndex === 'number') ? data.slotIndex : null;
                        const offeredJoinerIndex = (typeof coerceJoinerIndex === 'function')
                            ? coerceJoinerIndex(data ? data.joinerIndex : null)
                            : ((data && Number.isInteger(data.joinerIndex)) ? data.joinerIndex : null);
                        try {
                            window._lastOfferedChoices = {
                                choices: data.choices || [],
                                chooserRole: data.chooserRole,
                                fighterId: offeredFighterId,
                                slotIndex: offeredSlotIndex,
                                joinerIndex: offeredJoinerIndex
                            };
                        } catch (e) {}
                        setTimeout(() => netShowPowerupCards(data.choices || [], data.chooserRole, {
                            fighterId: offeredFighterId,
                            slotIndex: offeredSlotIndex,
                            joinerIndex: offeredJoinerIndex
                        }), 200);
                    }
                } else if (data && data.type === 'mod-offer') {
                    if (!matchOver) {
                        try { waitingForCard = true; } catch (e) {}
                        const finalIdx = (typeof data.finalIdx === 'number') ? data.finalIdx : undefined;
                        const manual = !!data.manual;
                        setTimeout(() => netShowWorldModifierCards(data.choices||[], data.chooserRole, finalIdx, { manual }), 200);
                    }
                } else if (data && data.type === 'card-pick') {
                    // Joiner sent a pick: auto-accept and apply silently on host
                    if (NET.role === 'host') {
                        const pending = {
                            kind: 'card',
                            pickerRole: data.pickerRole,
                            cardName: data.card,
                            fighterId: (data && data.fighterId != null) ? String(data.fighterId) : null,
                            slotIndex: (data && typeof data.slotIndex === 'number') ? data.slotIndex : null,
                            joinerIndex: (typeof coerceJoinerIndex === 'function') ? coerceJoinerIndex(data ? data.joinerIndex : null) : ((data && Number.isInteger(data.joinerIndex)) ? data.joinerIndex : null)
                        };
                        applyHostPendingConfirm(pending);
                    } else {
                        // ignore (only host handles picks)
                    }
                } else if (data && data.type === 'mod-pick') {
                    // Joiner sent a world-mod pick: auto-accept and apply silently on host
                    if (NET.role === 'host') {
                        const pending = { kind: 'mod', chooserRole: data.chooserRole || data.pickerRole, name: data.name };
                        applyHostPendingConfirm(pending);
                    }
                } else if (data && data.type === 'card-apply') {
                    // Apply on non-host clients (host already applied during pick)
                    try {
                        if (NET.role !== 'host') {
                            let target = null;
                            if (data.fighterId != null) {
                                target = getEntityForFighterId(data.fighterId);
                            }
                            if (!target) {
                                target = getEntityForRole(data.pickerRole);
                            }
                            const card = data.card ? getCardByName(data.card) : null;
                            if (target && card) {
                                try { card.effect(target); target.addCard(card.name); } catch (e) {}
                            }
                            const accentColor = target && target.color ? target.color : null;
                            const highlightRemoteSelection = () => {
                                const div = document.getElementById('card-choices');
                                if (!div || !div.childNodes || !div.childNodes.length) return false;
                                const targetName = (typeof data.card === 'string') ? data.card : '';
                                let matchIdx = -1;
                                try {
                                    const lastOffer = window._lastOfferedChoices;
                                    if (lastOffer && Array.isArray(lastOffer.choices)) {
                                        matchIdx = lastOffer.choices.findIndex(choiceName => {
                                            if (!choiceName) return false;
                                            if (typeof choiceName === 'string') return choiceName === targetName;
                                            if (choiceName && typeof choiceName.name === 'string') return choiceName.name === targetName;
                                            return false;
                                        });
                                    }
                                } catch (err) { matchIdx = -1; }
                                if (matchIdx < 0) {
                                    for (let i = 0; i < div.childNodes.length; ++i) {
                                        const child = div.childNodes[i];
                                        const label = child && child.querySelector ? child.querySelector('b') : null;
                                        if (label && label.textContent && label.textContent.trim() === targetName) {
                                            matchIdx = i;
                                            break;
                                        }
                                    }
                                }
                                if (matchIdx < 0 || !div.childNodes[matchIdx]) return false;
                                const cardEl = div.childNodes[matchIdx];
                                try {
                                    Array.from(div.childNodes).forEach((child, idx) => {
                                        if (idx === matchIdx) return;
                                        child.classList.remove('selected', 'centered');
                                        child.style.zIndex = 1;
                                        if (child._origTransform) child.style.transform = child._origTransform;
                                        try {
                                            child.style.removeProperty('border');
                                            child.style.removeProperty('box-shadow');
                                            child.style.removeProperty('color');
                                            const sm = child.querySelector('small'); if (sm) sm.style.removeProperty('color');
                                            if (child._accentClass) child.classList.remove(child._accentClass);
                                            if (child._accentStyle) { child._accentStyle.remove(); child._accentStyle = null; }
                                        } catch (err) {}
                                    });
                                } catch (err) {}
                                if (!cardEl._origTransform) cardEl._origTransform = cardEl.style.transform;
                                cardEl.classList.add('selected', 'centered');
                                cardEl.style.zIndex = 10;
                                cardEl.style.transform = 'translate(-50%, -60px) scale(1.18) rotate(0deg)';
                                const accent = accentColor || '#65c6ff';
                                try {
                                    cardEl.style.setProperty('border', '3px solid ' + accent, 'important');
                                    cardEl.style.setProperty('box-shadow', '0 6px 18px ' + accent, 'important');
                                    cardEl.style.setProperty('color', accent, 'important');
                                    const sm = cardEl.querySelector('small'); if (sm) sm.style.setProperty('color', accent, 'important');
                                    if (!cardEl._accentClass) cardEl._accentClass = 'card-accent-' + Math.floor(Math.random()*1000000);
                                    if (!cardEl._accentStyle) {
                                        const styleEl = document.createElement('style');
                                        styleEl.innerText = `.${cardEl._accentClass}::after{ background: radial-gradient(ellipse at center, ${accent}33 0%, #0000 100%) !important; } .${cardEl._accentClass}.centered::after{ background: radial-gradient(ellipse at center, ${accent}55 0%, #0000 100%) !important; }`;
                                        document.head.appendChild(styleEl);
                                        cardEl._accentStyle = styleEl;
                                    }
                                    cardEl.classList.add(cardEl._accentClass);
                                } catch (err) {}
                                return true;
                            };
                            const finalizeCardUI = () => {
                                try {
                                    const div = document.getElementById('card-choices');
                                    if (div) {
                                        Array.from(div.childNodes || []).forEach(child => {
                                            try {
                                                if (child && child._accentStyle) { child._accentStyle.remove(); child._accentStyle = null; }
                                            } catch (err) {}
                                        });
                                        div.style.display = 'none';
                                        div.innerHTML = '';
                                        div.classList.remove('card-bg-visible');
                                    }
                                } catch (err) {}
                                try { cardState.active = false; waitingForCard = false; } catch (err) {}
                            };
                            const mirrored = highlightRemoteSelection();
                            if (mirrored) {
                                setTimeout(finalizeCardUI, 650);
                            } else {
                                finalizeCardUI();
                            }
                            return;
                        }
                    } catch (e) {}
                    // Host already closed UI; ensure any other clients still clear state
                    try {
                        const div = document.getElementById('card-choices');
                        if (div) { div.style.display = 'none'; div.innerHTML = ''; div.classList.remove('card-bg-visible'); }
                    } catch (e) {}
                    try { cardState.active = false; waitingForCard = false; } catch (e) {}
                } else if (data && data.type === 'card-hover') {
                    // Mirror hover state for non-chooser clients
                    try {
                        const chooserRole = data.chooserRole;
                        const idx = typeof data.idx === 'number' ? data.idx : -1;
                        const div = document.getElementById('card-choices');
                        if (div && div.childNodes && div.childNodes.length > 0) {
                            // Remove existing highlights
                            for (let n = 0; n < div.childNodes.length; ++n) {
                                const c = div.childNodes[n];
                                c.classList.remove('selected', 'centered');
                                c.style.zIndex = 1;
                                // reset transform if stored
                                try { c.style.transform = c._origTransform || c.style.transform; } catch (e) {}
                                try {
                                    c.style.removeProperty('border');
                                    c.style.removeProperty('box-shadow');
                                    c.style.removeProperty('color');
                                    const sm = c.querySelector('small'); if (sm) sm.style.removeProperty('color');
                                    const hb = c.querySelector('b'); if (hb) hb.style.removeProperty('color');
                                    if (c._accentClass) c.classList.remove(c._accentClass);
                                    if (c._accentStyle) { c._accentStyle.remove(); c._accentStyle = null; }
                                } catch (e) {}
                            }
                            if (idx >= 0 && idx < div.childNodes.length) {
                                const card = div.childNodes[idx];
                                // chooserRole color mapping: map role to the correct local entity
                                const chooserEntity = getEntityForRole(chooserRole);
                                const color = chooserEntity && chooserEntity.color ? chooserEntity.color : null;
                                try {
                                    card.classList.add('selected', 'centered');
                                    card.style.zIndex = 10;
                                    // store original transform if not present
                                    if (!card._origTransform) card._origTransform = card.style.transform;
                                    card.style.transform = 'translate(-50%, -60px) scale(1.18) rotate(0deg)';
                                    if (color) {
                                        card.style.setProperty('border', '3px solid ' + color, 'important');
                                        card.style.setProperty('box-shadow', '0 6px 18px ' + color, 'important');
                                        card.style.setProperty('color', color, 'important');
                                        const sm = card.querySelector('small'); if (sm) sm.style.setProperty('color', color, 'important');
                                        if (!card._accentClass) card._accentClass = 'card-accent-' + Math.floor(Math.random()*1000000);
                                        if (!card._accentStyle) {
                                            const styleEl = document.createElement('style');
                                            styleEl.innerText = `.${card._accentClass}::after{ background: radial-gradient(ellipse at center, ${color}33 0%, #0000 100%) !important; } .${card._accentClass}.centered::after{ background: radial-gradient(ellipse at center, ${color}55 0%, #0000 100%) !important; }`;
                                            document.head.appendChild(styleEl);
                                            card._accentStyle = styleEl;
                                        }
                                        card.classList.add(card._accentClass);
                                    }
                                } catch (e) {}
                            }
                        }
                    } catch (e) {}
                } else if (data && data.type === 'hit-anim') {
                    // Visual-only: play damage flash/shake for targetRole on joiner
                    try {
                        if (NET.role !== 'host') {
                            const tgt = getEntityForRole(data.targetRole);
                            if (tgt) {
                                tgt.shakeTime = 0.20; tgt.shakeMag = 8; tgt.damageFlash = 0.25; try { playHit(); } catch(e) {}
                            }
                        }
                    } catch (e) {}
                } else if (data && data.type === 'firestorm-spawn') {
                    // Visual-only: spawn firestorm on joiner
                    try {
                        if (NET.role !== 'host') {
                            firestormInstance = new Firestorm(data.x, data.y, data.radius);
                            firestormActive = true;
                            if (firestormTimeout) { clearTimeout(firestormTimeout); }
                            firestormTimeout = setTimeout(() => {
                                firestormActive = false;
                                firestormInstance = null;
                                firestormTimeout = null;
                            }, 10000);
                        }
                    } catch (e) {}
                } else if (data && data.type === 'firestorm-remove') {
                    // Visual-only: remove firestorm on joiner
                    try {
                        if (NET.role !== 'host') {
                            firestormInstance = null;
                        }
                    } catch (e) {}
                } else if (data && data.type === 'infestation-spawn') {
                    // Visual-only: spawn infested chunk on joiner
                    try {
                        if (NET.role !== 'host') {
                            const oi = data.obstacleIndex, ci = data.chunkIndex;
                            if (typeof oi === 'number' && typeof ci === 'number' && obstacles[oi] && obstacles[oi].chunks[ci]) {
                                try {
                                    const activeCount = (infestedChunks || []).filter(ic => ic && ic.active).length;
                                    if (activeCount < 10) {
                                        // avoid duplicates by id if provided
                                        if (typeof data.id !== 'undefined' && (infestedChunks || []).some(ic => ic && ic.id === data.id)) return;
                                        let infestedChunk = new InfestedChunk(obstacles[oi].chunks[ci], obstacles[oi]);
                                        infestedChunk.id = data.id || infestedChunk.id;
                                        infestedChunks.push(infestedChunk);
                                    }
                                } catch (e) {
                                    let infestedChunk = new InfestedChunk(obstacles[oi].chunks[ci], obstacles[oi]);
                                    infestedChunk.id = data.id || infestedChunk.id;
                                    infestedChunks.push(infestedChunk);
                                }
                            }
                        }
                    } catch (e) {}
                // Visual-only: play damage flash/shake for targetRole on joiner
                } else if (data && data.type === 'hit-anim') {
                    try {
                        if (NET.role !== 'host') {
                            const tgt = getEntityForRole(data.targetRole);
                            if (tgt) {
                                tgt.shakeTime = 0.20; tgt.shakeMag = 8; tgt.damageFlash = 0.25; try { playHit(); } catch(e) {}
                            }
                        }
                    } catch (e) {}
                        } else if (data && data.type === 'explosion') {
                            // Visual-only explosion sent from host: recreate locally on joiner
                            try {
                                if (NET.role !== 'host') {
                                    const ex = new Explosion(data.x, data.y, data.radius || window.EXPLOSION_BASE_RADIUS, data.color || '#ffffff', data.damage || 0, null, !!data.obl);
                                    explosions.push(ex);
                                    try { playExplosion(); } catch (e) {}
                                }
                            } catch (e) {}
                    } else if (data && data.type === 'chunks-update') {
                        // Visual-only chunk updates from host: apply to local obstacles if possible
                        try {
                            if (NET.role !== 'host') {
                                const idx = data.obstacleIndex;
                                if (typeof idx === 'number' && obstacles && obstacles[idx]) {
                                    const obs = obstacles[idx];
                                    const updates = data.updates || [];
                                    for (const u of updates) {
                                        const ci = u.i;
                                        if (typeof ci !== 'number' || !obs.chunks || !obs.chunks[ci]) continue;
                                        const cc = obs.chunks[ci];
                                            cc.destroyed = !!u.destroyed;
                                            cc.flying = !!u.flying;
                                            cc.vx = u.vx || 0; cc.vy = u.vy || 0; cc.alpha = (typeof u.alpha === 'number') ? u.alpha : cc.alpha;
                                            // Burning field: if provided, set burning timer/duration; otherwise preserve existing
                                            if (u.burning) {
                                                cc.burning = { time: 0, duration: u.burning.duration };
                                            }
                                        // position sync if provided
                                        if (typeof u.x === 'number') cc.x = u.x; if (typeof u.y === 'number') cc.y = u.y;
                                    }
                                    // Recompute obstacle destroyed state in case all chunks are removed
                                    try {
                                        obs.destroyed = obs.chunks.every(c => !!c.destroyed);
                                    } catch (e) {}
                                }
                            }
                        } catch (e) {}
                } else if (data && data.type === 'mod-pick') {
                    // Only host should authoritatively apply then broadcast
                    if (NET.role === 'host') {
                        const name = data.name;
                        applyWorldModifierByName(name);
                        // Close host UI and clear waiting state immediately
                        try {
                            const div = document.getElementById('card-choices');
                            if (div) { div.style.display = 'none'; div.innerHTML = ''; div.classList.remove('card-bg-visible'); }
                        } catch (e) {}
                        try { cardState.active = false; waitingForCard = false; } catch (e) {}
                        try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'mod-apply', name } })); } catch (e) {}
                    }
                } else if (data && data.type === 'mod-apply') {
                    // Apply on non-host clients (host already applied)
                    if (NET.role !== 'host') applyWorldModifierByName(data.name);
                    const div = document.getElementById('card-choices');
                    if (div) { div.style.display='none'; div.innerHTML=''; div.classList.remove('card-bg-visible'); }
                    cardState.active = false; waitingForCard = false;
                } else if (data && data.type === 'match-end') {
                    // Show victory modal on clients
                    try { if (NET.role !== 'host') showVictoryModal(data.winner || 'Opponent', false); } catch (e) {}
                } else if (data && data.type === 'match-restart') {
                    // Host requested a restart for all clients
                    try { hideVictoryModal(); restartGame(); } catch (e) {}
                } else if (data && data.type === 'victory-vote') {
                    // Peer sent their vote
                    try {
                        const peerRole = data.role;
                        const choice = data.choice;
                        window._victoryVotes[peerRole] = choice;
                        updateVictoryModalStatus();
                        checkVictoryVotes();
                    } catch (e) {}
                } else if (data && data.type === 'victory-continue') {
                    // Host confirmed continue action
                    try {
                        hideVictoryModal();
                        window._victoryRoundsLeft = 3;
                        window._victoryRoundsActive = true;
                    } catch (e) {}
                } else if (data && data.type === 'card-decline') {
                    // Host declined the joiner's pick; clear waiting state and log
                    try { waitingForCard = false; cardState.active = false; } catch (e) {}
                    try { logDev('[CARD FLOW] Host declined the pick.'); } catch (e) {}
                    // Optionally, if we stored last offered choices, re-open UI for the chooser
                    try {
                        if (window._lastOfferedChoices && Array.isArray(window._lastOfferedChoices.choices) && window._lastOfferedChoices.chooserRole === NET.role) {
                            // reopen the choices for the chooser
                            setTimeout(() => netShowPowerupCards(
                                window._lastOfferedChoices.choices,
                                window._lastOfferedChoices.chooserRole,
                                {
                                    fighterId: window._lastOfferedChoices.fighterId,
                                    slotIndex: window._lastOfferedChoices.slotIndex,
                                    joinerIndex: window._lastOfferedChoices.joinerIndex
                                }
                            ), 250);
                        }
                    } catch (e) {}
                } else {
                    // fallback to previous handler if any simple sync message comes through
                    handleGameMessage(data);
                }
            }
        };
    }

    // Host confirm overlay helpers
    function showHostConfirmOverlay(text) {
        try {
            const overlay = document.getElementById('host-confirm-overlay');
            const txt = document.getElementById('host-confirm-text');
            if (txt) txt.innerText = text || 'Remote player selected an option';
            if (overlay) overlay.style.display = 'block';
        } catch (e) {}
    }
    function hideHostConfirmOverlay() {
        try { const overlay = document.getElementById('host-confirm-overlay'); if (overlay) overlay.style.display = 'none'; } catch (e) {}
        try { window._pendingHostConfirm = null; } catch (e) {}
    }

    // Apply a pending host confirmation immediately (same logic as clicking the host Accept button)
    function applyHostPendingConfirm(pending) {
        try {
            if (!pending) return;
            if (pending.kind === 'card') {
                const pendingFighterId = (pending && pending.fighterId != null) ? String(pending.fighterId) : null;
                let target = null;
                if (pendingFighterId) {
                    try { target = getEntityForFighterId(pendingFighterId); } catch (e) { target = null; }
                }
                if (!target) {
                    target = getEntityForRole(pending.pickerRole);
                }
                const card = getCardByName(pending.cardName);
                if (target && card) {
                    try { card.effect(target); target.addCard(card.name); } catch (e) {}
                }
                let fighterRecord = null;
                if (pendingFighterId && playerRoster && typeof playerRoster.getFighterById === 'function') {
                    try { fighterRecord = playerRoster.getFighterById(pendingFighterId, { includeEntity: true }) || null; } catch (e) {}
                }
                if (!fighterRecord && target) {
                    try { fighterRecord = getFighterRecordForEntity(target); } catch (e) { fighterRecord = null; }
                }
                const expectedJoinerIndex = (() => {
                    if (roundFlowState && Number.isInteger(roundFlowState.awaitingCardJoinerIndex)) {
                        return roundFlowState.awaitingCardJoinerIndex;
                    }
                    if (fighterRecord && fighterRecord.metadata && Number.isInteger(fighterRecord.metadata.joinerIndex)) {
                        return fighterRecord.metadata.joinerIndex;
                    }
                    return null;
                })();
                if (Number.isInteger(expectedJoinerIndex) && pending && Number.isInteger(pending.joinerIndex) && pending.joinerIndex !== expectedJoinerIndex) {
                    try { console.warn('[CARD FLOW] Ignoring card pick from joiner index', pending.joinerIndex, 'expected', expectedJoinerIndex); } catch (e) {}
                    return;
                }
                const fighterIdForBroadcast = pendingFighterId || (fighterRecord && fighterRecord.id != null ? String(fighterRecord.id) : null);
                const slotIndexForBroadcast = (pending && typeof pending.slotIndex === 'number')
                    ? pending.slotIndex
                    : (fighterRecord && typeof fighterRecord.slotIndex === 'number' ? fighterRecord.slotIndex : null);
                const joinerIndexForBroadcast = (() => {
                    if (pending && Number.isInteger(pending.joinerIndex)) return pending.joinerIndex;
                    if (fighterRecord && fighterRecord.metadata && Number.isInteger(fighterRecord.metadata.joinerIndex)) {
                        return fighterRecord.metadata.joinerIndex;
                    }
                    if (typeof resolveJoinerIndexForSlot === 'function' && typeof slotIndexForBroadcast === 'number') {
                        const idx = resolveJoinerIndexForSlot(slotIndexForBroadcast);
                        if (Number.isInteger(idx)) return idx;
                    }
                    if (typeof resolveJoinerIndexForEntity === 'function' && target) {
                        const idx = resolveJoinerIndexForEntity(target);
                        if (Number.isInteger(idx)) return idx;
                    }
                    return null;
                })();
                // Broadcast applied so clients close UI
                try {
                    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                        const payload = { type:'card-apply', pickerRole: pending.pickerRole, card: pending.cardName };
                        if (fighterIdForBroadcast != null) payload.fighterId = fighterIdForBroadcast;
                        if (typeof slotIndexForBroadcast === 'number') payload.slotIndex = slotIndexForBroadcast;
                        if (Number.isInteger(joinerIndexForBroadcast)) payload.joinerIndex = joinerIndexForBroadcast;
                        window.ws.send(JSON.stringify({ type:'relay', data: payload }));
                    }
                } catch (e) {}
                // Advance local round state as host (same as if notifyPowerupSelectionComplete had run)
                try {
                    // Use the applied target entity so selection completes for this loser
                    try { notifyPowerupSelectionComplete(target, pending.cardName); } catch (e) {}
                } catch (e) {}
                // Ensure host UI closes as well
                try { const div = document.getElementById('card-choices'); if (div) { div.style.display='none'; div.innerHTML=''; div.classList.remove('card-bg-visible'); } } catch (e) {}
                // If there was a pending world modifier offer queued for this round, show it now on host and broadcast to joiner
                try {
                    if (window._pendingWorldModOffer) {
                        const offer = window._pendingWorldModOffer;
                        window._pendingWorldModOffer = null;
                        try { roundFlowState.pendingWorldModOffer = null; } catch (e) {}
                        try { waitingForCard = true; } catch (e) {}
                        try { netShowWorldModifierCards(offer.choices, offer.chooserRole, offer.finalIdx, offer); } catch (e) {}
                        try {
                            if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'mod-offer', choices: offer.choices, chooserRole: offer.chooserRole, finalIdx: offer.finalIdx, manual: !!offer.manual } }));
                        } catch (e) {}
                    }
                } catch (e) {}
                // Advance local round state to avoid stalling (same behavior as when client-side selection completes)
                try {
                    try { notifyPowerupSelectionComplete(target, pending.cardName); } catch (e) {}
                } catch (e) {}
            } else if (pending.kind === 'mod') {
                const name = pending.name;
                try { applyWorldModifierByName(name); } catch (e) {}
                try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'mod-apply', name } })); } catch (e) {}
            }
            try { cardState.active = false; waitingForCard = false; } catch (e) {}
            try { window._pendingHostConfirm = null; } catch (e) {}
        } catch (err) { console.warn('applyHostPendingConfirm error', err); }
    }

    // Wire host confirm buttons (accept/decline)
    try {
        const accept = document.getElementById('host-confirm-accept');
        const decline = document.getElementById('host-confirm-decline');
        if (accept) accept.addEventListener('click', () => {
            const pending = window._pendingHostConfirm;
            hideHostConfirmOverlay();
            if (!pending) return;
            if (pending.kind === 'card') {
                const pendingFighterId = (pending && pending.fighterId != null) ? String(pending.fighterId) : null;
                let target = null;
                if (pendingFighterId) {
                    try { target = getEntityForFighterId(pendingFighterId); } catch (e) { target = null; }
                }
                if (!target) {
                    target = getEntityForRole(pending.pickerRole);
                }
                const card = getCardByName(pending.cardName);
                if (target && card) {
                    try { card.effect(target); target.addCard(card.name); } catch (e) {}
                }
                let fighterRecord = null;
                if (pendingFighterId && playerRoster && typeof playerRoster.getFighterById === 'function') {
                    try { fighterRecord = playerRoster.getFighterById(pendingFighterId, { includeEntity: true }) || null; } catch (e) {}
                }
                if (!fighterRecord && target) {
                    try { fighterRecord = getFighterRecordForEntity(target); } catch (e) { fighterRecord = null; }
                }
                const expectedJoinerIndex = (() => {
                    if (roundFlowState && Number.isInteger(roundFlowState.awaitingCardJoinerIndex)) {
                        return roundFlowState.awaitingCardJoinerIndex;
                    }
                    if (fighterRecord && fighterRecord.metadata && Number.isInteger(fighterRecord.metadata.joinerIndex)) {
                        return fighterRecord.metadata.joinerIndex;
                    }
                    return null;
                })();
                if (Number.isInteger(expectedJoinerIndex) && pending && Number.isInteger(pending.joinerIndex) && pending.joinerIndex !== expectedJoinerIndex) {
                    try { console.warn('[CARD FLOW] Host declined card pick due to joiner index mismatch', pending.joinerIndex, 'expected', expectedJoinerIndex); } catch (e) {}
                    return;
                }
                const fighterIdForBroadcast = pendingFighterId || (fighterRecord && fighterRecord.id != null ? String(fighterRecord.id) : null);
                const slotIndexForBroadcast = (pending && typeof pending.slotIndex === 'number')
                    ? pending.slotIndex
                    : (fighterRecord && typeof fighterRecord.slotIndex === 'number' ? fighterRecord.slotIndex : null);
                const joinerIndexForBroadcast = (() => {
                    if (pending && Number.isInteger(pending.joinerIndex)) return pending.joinerIndex;
                    if (fighterRecord && fighterRecord.metadata && Number.isInteger(fighterRecord.metadata.joinerIndex)) {
                        return fighterRecord.metadata.joinerIndex;
                    }
                    if (typeof resolveJoinerIndexForSlot === 'function' && typeof slotIndexForBroadcast === 'number') {
                        const idx = resolveJoinerIndexForSlot(slotIndexForBroadcast);
                        if (Number.isInteger(idx)) return idx;
                    }
                    if (typeof resolveJoinerIndexForEntity === 'function' && target) {
                        const idx = resolveJoinerIndexForEntity(target);
                        if (Number.isInteger(idx)) return idx;
                    }
                    return null;
                })();
                // Broadcast applied so clients close UI
                try {
                    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                        const payload = { type:'card-apply', pickerRole: pending.pickerRole, card: pending.cardName };
                        if (fighterIdForBroadcast != null) payload.fighterId = fighterIdForBroadcast;
                        if (typeof slotIndexForBroadcast === 'number') payload.slotIndex = slotIndexForBroadcast;
                        if (Number.isInteger(joinerIndexForBroadcast)) payload.joinerIndex = joinerIndexForBroadcast;
                        window.ws.send(JSON.stringify({ type:'relay', data: payload }));
                    }
                } catch (e) {}
                // Ensure host UI closes as well
                try { const div = document.getElementById('card-choices'); if (div) { div.style.display='none'; div.innerHTML=''; div.classList.remove('card-bg-visible'); } } catch (e) {}
                // If there was a pending world modifier offer queued for this round, show it now on host and broadcast to joiner
                try {
                    if (window._pendingWorldModOffer) {
                        const offer = window._pendingWorldModOffer;
                        window._pendingWorldModOffer = null;
                        try { roundFlowState.pendingWorldModOffer = null; } catch (e) {}
                        try { waitingForCard = true; } catch (e) {}
                        try { netShowWorldModifierCards(offer.choices, offer.chooserRole, offer.finalIdx, offer); } catch (e) {}
                        try {
                            if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'mod-offer', choices: offer.choices, chooserRole: offer.chooserRole, finalIdx: offer.finalIdx, manual: !!offer.manual } }));
                        } catch (e) {}
                    }
                } catch (e) {}
            } else if (pending.kind === 'mod') {
                const name = pending.name;
                try { applyWorldModifierByName(name); } catch (e) {}
                try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'mod-apply', name } })); } catch (e) {}
            }
            try { cardState.active = false; waitingForCard = false; } catch (e) {}
            window._pendingHostConfirm = null;
        });
        if (decline) decline.addEventListener('click', () => {
            const pending = window._pendingHostConfirm;
            hideHostConfirmOverlay();
            if (!pending) return;
            // Notify joiner the pick was declined so they can resume (optional)
            try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'card-decline', pickerRole: pending.pickerRole, kind: pending.kind, name: pending.cardName || pending.name } })); } catch (e) {}
            try { cardState.active = false; waitingForCard = false; } catch (e) {}
            window._pendingHostConfirm = null;
        });
    } catch (e) {}

    // Additional incoming visual-only messages handled for joiners
    // We'll add these handlers in the same onmessage processing above by observing data.type 'hit-anim' and 'chunks-update'

    // Reconnect button helper: create DOM element if missing and show/hide
    function ensureReconnectButton() {
        let btn = document.getElementById('mp-reconnect-btn');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'mp-reconnect-btn';
            btn.innerText = 'Reconnect';
            btn.style.position = 'fixed';
            btn.style.right = '18px';
            btn.style.bottom = '18px';
            btn.style.zIndex = 9999;
            btn.style.padding = '10px 14px';
            btn.style.background = '#2f8bff';
            btn.style.color = '#fff';
            btn.style.border = 'none';
            btn.style.borderRadius = '8px';
            btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.35)';
            btn.style.display = 'none';
            btn.onclick = function() {
                // Try reconnect using previously selected session/role
                if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                    btn.style.display = 'none';
                    return;
                }
                const role = window.wsRole || NET.role || 'host';
                const code = window.wsSession || (document.getElementById('mp-session-code') ? document.getElementById('mp-session-code').value : '') || '';
                connectWebSocket(role, code);
                btn.innerText = 'Reconnecting...';
                setTimeout(() => { btn.innerText = 'Reconnect'; }, 4000);
            };
            document.body.appendChild(btn);
        }
        return btn;
    }

    function showReconnectButton() { const b = ensureReconnectButton(); b.style.display = 'block'; }
    function hideReconnectButton() { const b = ensureReconnectButton(); b.style.display = 'none'; b.innerText = 'Reconnect'; }

    // Patch after each connect
    let oldConnectWebSocket = null;
    if (typeof connectWebSocket === 'function') oldConnectWebSocket = connectWebSocket;
    // Helper to normalize user input: allow full invite URLs or plain codes
    function normalizeJoinCode(input) {
        if (!input) return '';
        const trimmed = input.trim();
        try {
            // If it's a URL, parse the ?join param
            const url = new URL(trimmed);
            const fromParam = url.searchParams.get('join');
            if (fromParam) return fromParam.trim().toUpperCase();
        } catch (e) { /* not a URL */ }
        // Otherwise just strip non-alphanumerics and uppercase
        return trimmed.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    }

    connectWebSocket = function(role, code) {
        if (oldConnectWebSocket) oldConnectWebSocket(role, code);
        else {
            if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.close();
            NET.resetSessionState();
            NET.setConnected(false);
            window.wsRole = role;
            window.wsSession = normalizeJoinCode(code);
            try {
                window.ws = new WebSocket(window.MULTIPLAYER_WS_URL);
            } catch (e) {
                alert('Could not open WebSocket: ' + e.message);
                return;
            }
            window.ws.onopen = function() {
                if (role === 'host') {
                    window.ws.send(JSON.stringify({ type: 'host', code: window.wsSession }));
                } else if (role === 'joiner') {
                    window.ws.send(JSON.stringify({ type: 'join', code: window.wsSession }));
                }
                NET.setRole(role);
                NET.setConnected(true);
                NET.joinerIndex = null;
                try { hideReconnectButton(); } catch (e) {}
                let myName = '';
                try {
                    const nameInput = document.getElementById('display-name');
                    myName = nameInput ? (nameInput.value || nameInput.placeholder || '') : '';
                } catch (e) { myName = ''; }
                if (myName) {
                    try { NET.myName = myName.toString().slice(0, 32); } catch (e) { NET.myName = myName; }
                    try { localStorage.setItem('shape_shot_display_name', NET.myName); } catch (e) {}
                } else {
                    NET.myName = myName || '';
                }
                if (role === 'host') {
                    NET.hostName = NET.myName || 'Host';
                    sendLocalDisplayName();
                } else {
                    NET.pendingName = NET.myName || '';
                }
                try {
                    if (typeof setLobbyPlayers === 'function') {
                        const hostLabel = NET.role === 'host' ? (NET.myName || 'Host') : (NET.hostName || NET.peerName || 'Host');
                        const joinerLabel = NET.role === 'host' ? (NET.getJoinerName(0) || '') : (NET.myName || '');
                        setLobbyPlayers(hostLabel, joinerLabel);
                    }
                } catch (e) {}
                try { if (typeof updateCardsUI === 'function') updateCardsUI(); } catch (e) {}
                if (role === 'host') {
                    if (player) player.color = HOST_PLAYER_COLOR;
                    if (enemy) enemy.color = getJoinerColor(0);
                } else {
                    const myJoinerIdx = Number.isInteger(NET.joinerIndex) ? NET.joinerIndex : 0;
                    if (player) player.color = getJoinerColor(myJoinerIdx);
                    if (enemy) enemy.color = HOST_PLAYER_COLOR;
                }
            };
            patchWsOnMessage();
            window.ws.onclose = function() {
                NET.handleDisconnect('Socket closed');
                try { if (typeof setMpSessionDisplay === 'function') setMpSessionDisplay(''); } catch (e) {}
            };
            window.ws.onerror = function() {
                NET.handleDisconnect('Socket error');
                try { if (typeof setMpSessionDisplay === 'function') setMpSessionDisplay(''); } catch (e) {}
            };
        }
        setTimeout(patchWsOnMessage, 200);
    };
    const overlay = document.getElementById('setup-overlay');
    const setupWrapper = document.getElementById('setup-wrapper');

    function showSetupUI() {
        if (!rosterUIBound) {
            try { bindRosterUI(); } catch (e) {}
        }
        if (setupWrapper) setupWrapper.style.display = 'flex';
        if (overlay) overlay.style.display = 'flex';
        try { ensureRosterDefaults(); } catch (e) {}
        try { renderRosterUI(); } catch (e) {}
    }

    function hideSetupUI() {
        if (overlay) overlay.style.display = 'none';
        if (setupWrapper) setupWrapper.style.display = 'none';
    }
    const densitySlider = document.getElementById('obstacle-density');
    const densityValue = document.getElementById('density-value');
    const sizeSlider = document.getElementById('obstacle-size');
    const sizeValue = document.getElementById('size-value');
    const dynamicCheckbox = document.getElementById('dynamic-mode');
    const dynamicRateRow = document.getElementById('dynamic-rate-row');
    const dynamicRateSlider = document.getElementById('dynamic-rate');
    const dynamicRateValue = document.getElementById('dynamic-rate-value');
    const mapBorderCheckbox = document.getElementById('map-border');
    // Ensure map border is checked by default on load
    if (mapBorderCheckbox) mapBorderCheckbox.checked = true;
    // The world modifier interval slider was moved into the World Master modal.
    // We'll attempt to find it in the modal when needed; keep references null for now.
    let worldModifierSlider = document.getElementById('world-modifier-interval') || null;
    let worldModifierValue = document.getElementById('world-modifier-value') || null;
    const roundsInput = document.getElementById('rounds-to-win');
    const managePowerupsBtn = document.getElementById('setup-manage-powerups');
    const manageWorldModsBtn = document.getElementById('setup-manage-mods');
    const setupEnableWorldMods = document.getElementById('setup-enable-worldmods');
    const setupEnablePowerups = document.getElementById('setup-enable-powerups');

    function getSetupDeckUI() {
        const controller = ensureGlobalDeckController();
        if (!controller) return null;
        if (window.gameWorldMasterInstance && window.gameWorldMasterInstance.ui) {
            try { controller.attachWorldMaster(window.gameWorldMasterInstance); } catch (e) {}
            return window.gameWorldMasterInstance.ui;
        }
        if (controller.ui && controller.uiSource === 'global') {
            if (controller.uiAdapter) {
                controller.uiAdapter.minWorldMods = controller.minWorldMods;
                controller.uiAdapter.minPowerups = controller.minPowerups;
            }
            return controller.ui;
        }
        if (typeof WorldMasterUI !== 'function') return null;
        const adapter = {
            minWorldMods: controller.minWorldMods,
            minPowerups: controller.minPowerups,
            availableWorldMods: controller.availableWorldMods,
            availablePowerups: controller.availablePowerups,
            autoPick: true,
            aiSelfPickPowerups: true,
            toggleWorldMod: (name, enabled) => controller.toggleWorldMod(name, enabled, {}),
            togglePowerup: (name, enabled) => controller.togglePowerup(name, enabled, {})
        };
        controller.uiAdapter = adapter;
        controller.ui = new WorldMasterUI(adapter, { attachPanel: false, attachCooldownDisplay: false, activeModsPolling: false });
        controller.uiSource = 'global';
        return controller.ui;
    }

    if (managePowerupsBtn) {
        managePowerupsBtn.onclick = () => {
            if (typeof window.setupAllowPowerups !== 'undefined' && window.setupAllowPowerups === false) return;
            const ui = getSetupDeckUI();
            if (ui && typeof ui.showPowerupDeck === 'function') ui.showPowerupDeck();
        };
    }
    if (manageWorldModsBtn) {
        manageWorldModsBtn.onclick = () => {
            if (typeof window.setupAllowWorldMods !== 'undefined' && window.setupAllowWorldMods === false) return;
            const ui = getSetupDeckUI();
            if (ui && typeof ui.showWorldModDeck === 'function') ui.showWorldModDeck();
        };
    }
    // Initialize global flags for setup-enabled features (default true)
    try {
        window.setupAllowWorldMods = !(setupEnableWorldMods && setupEnableWorldMods.type === 'checkbox' && setupEnableWorldMods.checked === false);
    } catch (e) { window.setupAllowWorldMods = true; }
    try {
        window.setupAllowPowerups = !(setupEnablePowerups && setupEnablePowerups.type === 'checkbox' && setupEnablePowerups.checked === false);
    } catch (e) { window.setupAllowPowerups = true; }
    // Reflect initial disabled state on the manage buttons
    try {
        const modsBtn = document.getElementById('setup-manage-mods');
        const pupsBtn = document.getElementById('setup-manage-powerups');
        if (modsBtn) {
            if (!window.setupAllowWorldMods) modsBtn.classList.add('disabled'); else modsBtn.classList.remove('disabled');
        }
        if (pupsBtn) {
            if (!window.setupAllowPowerups) pupsBtn.classList.add('disabled'); else pupsBtn.classList.remove('disabled');
        }
    } catch (e) {}
    if (setupEnableWorldMods) setupEnableWorldMods.onchange = () => {
        window.setupAllowWorldMods = !!setupEnableWorldMods.checked;
        try { const modsBtn = document.getElementById('setup-manage-mods'); if (modsBtn) { if (!window.setupAllowWorldMods) modsBtn.classList.add('disabled'); else modsBtn.classList.remove('disabled'); } } catch (e) {}
    };
    if (setupEnablePowerups) setupEnablePowerups.onchange = () => {
        window.setupAllowPowerups = !!setupEnablePowerups.checked;
        try { const pupsBtn = document.getElementById('setup-manage-powerups'); if (pupsBtn) { if (!window.setupAllowPowerups) pupsBtn.classList.add('disabled'); else pupsBtn.classList.remove('disabled'); } } catch (e) {}
    };
    
    densitySlider.oninput = () => { densityValue.textContent = densitySlider.value; };
    sizeSlider.oninput = () => { sizeValue.textContent = sizeSlider.value; };
    dynamicCheckbox.onchange = () => {
        dynamicRateRow.style.display = dynamicCheckbox.checked ? 'flex' : 'none';
    };
    dynamicRateSlider.oninput = () => {
        dynamicRateValue.textContent = parseFloat(dynamicRateSlider.value).toFixed(2);
    };
    // If the setup slider exists (fallback), wire its display update. Otherwise, the modal will handle showing the value.
    try {
        if (worldModifierSlider && worldModifierValue) {
            worldModifierSlider.oninput = () => { worldModifierValue.textContent = worldModifierSlider.value; };
        }
    } catch (e) {}
    // If host edits rounds input live, broadcast the change so joiner UI stays in sync
    try {
        if (roundsInput) {
            roundsInput.onchange = roundsInput.oninput = function() {
                try {
                    const v = parseInt(roundsInput.value);
                    if (NET.role === 'host' && NET.connected && window.ws && window.ws.readyState === WebSocket.OPEN && typeof v === 'number' && !isNaN(v) && v > 0) {
                        window.ws.send(JSON.stringify({ type: 'relay', data: { type: 'rounds-update', rounds: v } }));
                    }
                } catch (e) {}
            };
        }
    } catch (e) {}
    document.getElementById('start-btn').onclick = () => {
        OBSTACLE_COUNT = parseInt(densitySlider.value);
        let size = parseInt(sizeSlider.value);
        OBSTACLE_MIN_SIZE = Math.round(size * 0.6);
        OBSTACLE_MAX_SIZE = size;
        DYNAMIC_MODE = !!dynamicCheckbox.checked;
        DYNAMIC_RATE = parseFloat(dynamicRateSlider.value);
        MAP_BORDER = !!mapBorderCheckbox.checked;
        // Read world modifier interval from the modal slider if present, otherwise use the setup slider fallback
        try {
            const modalSlider = document.getElementById('wm-world-mod-interval');
            if (modalSlider && modalSlider.type === 'range') {
                worldModifierRoundInterval = parseInt(modalSlider.value);
            } else if (worldModifierSlider) {
                worldModifierRoundInterval = parseInt(worldModifierSlider.value);
            }
        } catch (e) {}
        // Read rounds-to-win setting
        try {
            const roundsInput = document.getElementById('rounds-to-win');
            const v = roundsInput ? parseInt(roundsInput.value) : NaN;
            if (typeof v === 'number' && !isNaN(v) && v > 0) ROUNDS_TO_WIN = v; else ROUNDS_TO_WIN = 10;
    } catch (e) { ROUNDS_TO_WIN = 10; }
        try { localStorage.setItem('shape_shot_rounds', String(ROUNDS_TO_WIN)); } catch (e) {}
        // If we're host, inform joiner of the chosen rounds so they stay in sync
        try {
            if (NET.role === 'host' && NET.connected && window.ws && window.ws.readyState === WebSocket.OPEN) {
                window.ws.send(JSON.stringify({ type: 'relay', data: { type: 'rounds-update', rounds: ROUNDS_TO_WIN } }));
            }
        } catch (e) {}
        // Read enemy AI checkbox (on/off)
        try {
            const enemyAiCheckbox = document.getElementById('enemy-ai');
            if (enemyAiCheckbox) {
                const enabled = !!enemyAiCheckbox.checked;
                enemyCount = enabled ? 1 : 0;
                enemyDisabled = !enabled;
            } else {
                enemyCount = 1;
                enemyDisabled = false;
            }
        } catch (e) { enemyCount = 1; enemyDisabled = false; }
    hideSetupUI();
        // Save chosen display name and populate NET.myName
        try {
            const nameInput = document.getElementById('display-name');
            const myName = nameInput ? (nameInput.value || nameInput.placeholder || '') : '';
            if (myName) {
                NET.myName = myName.toString().slice(0,32);
                try { localStorage.setItem('shape_shot_display_name', NET.myName); } catch (e) {}
                try { updateCardsUI(); } catch (e) {}
            }
        } catch (e) {}
        // If we're a joiner, inform host of our chosen name (in case we connected earlier)
        try {
            if (NET.role === 'joiner' && window.ws && window.ws.readyState === WebSocket.OPEN && NET.myName) {
                window.ws.send(JSON.stringify({ type: 'relay', data: { type: 'set-name', name: NET.myName } }));
            }
        } catch (e) {}
        // If a saved map is selected, load it into obstacles before starting
        const sel = document.getElementById('saved-maps');
        if (sel && sel.value) {
            if (sel.value === '__RANDOM__') {
                const key = pickRandomSavedMapKey();
                if (key) loadSavedMapByKey(key);
                else generateObstacles();
            } else {
                // load the selected key
                loadSavedMapByKey(sel.value);
            }
        } else if (NET.role === 'host' && NET.connected) {
            // Deterministically generate on host only, then broadcast to joiner
            generateObstacles();
        }
        // Before starting, assign players/AI and configure WorldMaster mode
        try { assignPlayersAndAI(); } catch (e) { console.warn('assignPlayersAndAI failed', e); }
        if (!NET.connected) {
            startGame();
            return;
        }
        let roundStartPayload = null;
        if (NET.role === 'host') {
            roundStartPayload = {
                type: 'round-start',
                obstacles: serializeObstacles(),
                names: {
                    p0: (NET.myName || (player && player.displayName) || 'Player 1'),
                    p1: (NET.peerName || (enemy && enemy.displayName) || 'Player 2')
                },
                dynamic: DYNAMIC_MODE,
                dynamicRate: DYNAMIC_RATE,
                mapBorder: MAP_BORDER,
                worldModInterval: worldModifierRoundInterval
            };
        }
        handleLocalReadyForStart(roundStartPayload);
        return;
    };

    // Multiplayer UI wiring
    const hostBtn = document.getElementById('host-btn');
    const joinBtn = document.getElementById('join-btn');
    const mpModal = document.getElementById('multiplayer-modal');
    const mpHostSection = document.getElementById('mp-host-section');
    const mpJoinSection = document.getElementById('mp-join-section');
    const mpCancel = document.getElementById('mp-cancel');
    const mpSessionCode = document.getElementById('mp-session-code');
    const mpSessionRow = document.getElementById('mp-session-row');
    const mpSessionLabel = document.getElementById('mp-session-label');
    const mpCopyLink = document.getElementById('mp-copy-link');
    const mpJoinCode = document.getElementById('mp-join-code');
    const mpJoinConfirm = document.getElementById('mp-join-confirm');
    const lobbyPlayersRow = document.getElementById('lobby-players');
    const lobbyHostName = document.getElementById('lobby-host-name');
    const lobbyJoinerName = document.getElementById('lobby-joiner-name');

    function hideMpModal() {
        if (mpModal) mpModal.style.display = 'none';
        if (mpHostSection) mpHostSection.style.display = 'none';
        if (mpJoinSection) mpJoinSection.style.display = 'none';
    }

    if (hostBtn) hostBtn.onclick = () => {
        if (mpModal && mpHostSection) {
            mpModal.style.display = 'flex';
            mpHostSection.style.display = 'flex';
            mpJoinSection.style.display = 'none';
            // Load last invite code from localStorage, or generate new
            let code = '';
            try {
                code = localStorage.getItem('shape_shot_invite_code') || '';
            } catch (e) { code = ''; }
            if (!code || code.length < 4) {
                code = Math.random().toString(36).substr(2, 6).toUpperCase();
            }
            if (mpSessionCode) mpSessionCode.value = code;
            if (mpSessionRow && mpSessionLabel) {
                mpSessionLabel.textContent = code;
                mpSessionRow.style.display = 'block';
            }
            // show lobby players area while waiting
            try { if (lobbyPlayersRow) lobbyPlayersRow.style.display = 'block'; } catch (e) {}
            // Always use the current value in the input (in case user edits before clicking Host)
            let finalCode = mpSessionCode && mpSessionCode.value ? mpSessionCode.value.trim().toUpperCase() : code;
            try { localStorage.setItem('shape_shot_invite_code', finalCode); } catch (e) {}
            connectWebSocket('host', finalCode);
        }
    // Persist invite code when edited
    if (mpSessionCode) {
        // Update session display on Enter
        mpSessionCode.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                const code = mpSessionCode.value.trim().toUpperCase();
                setMpSessionDisplay(code);
            }
        });
        mpSessionCode.addEventListener('input', function() {
            try {
                // Enforce max length 10
                if (mpSessionCode.value.length > 10) {
                    mpSessionCode.value = mpSessionCode.value.slice(0, 10);
                }
                localStorage.setItem('shape_shot_invite_code', mpSessionCode.value.trim().toUpperCase());
                // Live update session display as you type
                setMpSessionDisplay(mpSessionCode.value.trim().toUpperCase());
            } catch (e) {}
        });
    }
    };
    if (joinBtn) joinBtn.onclick = () => {
        if (mpModal && mpJoinSection) {
            mpModal.style.display = 'flex';
            mpHostSection.style.display = 'none';
            mpJoinSection.style.display = 'flex';
            if (mpJoinCode) {
                mpJoinCode.value = '';
                setTimeout(() => mpJoinCode.focus(), 100);
            }
        }
    };
    // Allow pressing Enter in join code input
    if (mpJoinCode) {
        mpJoinCode.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                if (mpJoinCode.value) {
                    connectWebSocket('joiner', mpJoinCode.value.trim().toUpperCase());
                }
            }
        });
    }
    // Auto-join if ?join=CODE in URL
    const urlParams = new URLSearchParams(window.location.search);
    const joinCodeFromUrl = urlParams.get('join');
    if (joinCodeFromUrl) {
        if (mpModal && mpJoinSection) {
            mpModal.style.display = 'flex';
            mpHostSection.style.display = 'none';
            mpJoinSection.style.display = 'flex';
            if (mpJoinCode) {
                mpJoinCode.value = joinCodeFromUrl.trim().toUpperCase();
                setTimeout(() => mpJoinCode.focus(), 100);
            }
        }
    }
    if (mpCancel) mpCancel.onclick = function() {
        hideMpModal();
        // Update session display with current code
        if (mpSessionCode) {
            const code = mpSessionCode.value.trim().toUpperCase();
            setMpSessionDisplay(code);
        }
    };
    // Escape key closes modal
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && mpModal && mpModal.style.display !== 'none') {
            hideMpModal();
        }
    });
    // Copy link button
    if (mpCopyLink) mpCopyLink.onclick = function() {
        if (mpSessionCode) {
            const code = mpSessionCode.value.trim();
            navigator.clipboard.writeText(code);
            mpCopyLink.innerText = 'Copied!';
            setTimeout(() => { mpCopyLink.innerText = 'Copy Link'; }, 1200);
        }
    };

    // Roster copy button (small inline copy next to session label)
    const mpSessionCopy = document.getElementById('mp-session-copy');
    if (mpSessionCopy) {
        mpSessionCopy.addEventListener('click', function() {
            try {
                const code = (mpSessionCode && mpSessionCode.value) ? mpSessionCode.value.trim() : (mpSessionLabel ? mpSessionLabel.textContent.trim() : '');
                if (!code) return;
                navigator.clipboard.writeText(code).then(() => {
                    // show success state
                    mpSessionCopy.classList.add('copied');
                    const old = mpSessionCopy.innerText;
                    mpSessionCopy.innerText = '✓';
                    setTimeout(() => {
                        mpSessionCopy.classList.remove('copied');
                        mpSessionCopy.innerText = old;
                    }, 1000);
                }).catch(() => {
                    // fallback quick text change
                    mpSessionCopy.innerText = 'Copied';
                    setTimeout(() => { mpSessionCopy.innerText = 'Copy'; }, 1000);
                });
            } catch (e) {}
        });
    }
    // Join confirm button (placeholder, to be wired to WebSocket logic)
    if (mpJoinConfirm) mpJoinConfirm.onclick = function() {
        if (mpJoinCode && mpJoinCode.value) {
            connectWebSocket('joiner', mpJoinCode.value);
        }
    };

    // Paste button: paste clipboard text into join code input
    const mpPasteBtn = document.getElementById('mp-paste');
    if (mpPasteBtn) {
        mpPasteBtn.addEventListener('click', async function() {
            try {
                if (navigator.clipboard && navigator.clipboard.readText) {
                    const txt = await navigator.clipboard.readText();
                    if (mpJoinCode) {
                        // Extract potential code from URL or raw text
                        let code = txt.trim();
                        // If it's a URL with ?join=CODE, extract
                        try {
                            const u = new URL(code);
                            const p = new URLSearchParams(u.search);
                            const j = p.get('join');
                            if (j) code = j;
                        } catch (e) { /* not a URL, ignore */ }
                        mpJoinCode.value = code.toUpperCase();
                        mpJoinCode.focus();
                        mpJoinCode.select();
                    }
                } else {
                    // Fallback: prompt paste
                    const txt = prompt('Paste invite code or link here:');
                    if (txt && mpJoinCode) {
                        mpJoinCode.value = txt.trim().toUpperCase();
                        mpJoinCode.focus();
                        mpJoinCode.select();
                    }
                }
            } catch (err) {
                // Graceful fallback on permission denied / error
                const txt = prompt('Paste invite code or link here:');
                if (txt && mpJoinCode) {
                    mpJoinCode.value = txt.trim().toUpperCase();
                    mpJoinCode.focus();
                    mpJoinCode.select();
                }
            }
        });
    }

    // Helper to set or clear session display when code changes
    function setMpSessionDisplay(code) {
        if (mpSessionRow && mpSessionLabel) {
            if (code && code.length) {
                mpSessionLabel.textContent = code;
                mpSessionRow.style.display = 'block';
            } else {
                mpSessionLabel.textContent = '';
                mpSessionRow.style.display = 'none';
            }
        }
    }

    // Update lobby players row with names (safe helper)
    function setLobbyPlayers(hostName, joinerName) {
        try {
            if (lobbyPlayersRow) lobbyPlayersRow.style.display = 'block';
            const defaultHost = (NET.role === 'host') ? (NET.myName || 'Player 1') : (NET.hostName || NET.peerName || 'Player 1');
            const defaultJoiner = (NET.role === 'host') ? (NET.getJoinerName(0) || NET.peerName || 'Player 2') : (NET.myName || 'Player 2');
            if (lobbyHostName) lobbyHostName.textContent = hostName || defaultHost;
            if (lobbyJoinerName) lobbyJoinerName.textContent = joinerName || defaultJoiner;
        } catch (e) {}
    }

    // Host broadcasts setup changes (sliders/toggles) to joiner
    function broadcastSetup() {
        if (NET.role !== 'host' || !window.ws || window.ws.readyState !== WebSocket.OPEN) return;
        const setup = {
            type: 'setup',
            data: {
                density: parseInt(densitySlider.value),
                size: parseInt(sizeSlider.value),
                dynamic: !!dynamicCheckbox.checked,
                dynamicRate: parseFloat(dynamicRateSlider.value),
                mapBorder: !!mapBorderCheckbox.checked,
                worldModInterval: worldModifierSlider ? parseInt(worldModifierSlider.value) : worldModifierRoundInterval,
                // Include WorldMaster mode fields
                wmEnabled: !!worldMasterEnabled,
                wmPlayerIndex: (typeof worldMasterPlayerIndex === 'number' ? worldMasterPlayerIndex : null),
                // Also include Enemy AI toggle so joiner can mirror blue AI presence when host is WM
                enemyAI: (function(){ try { const el = document.getElementById('enemy-ai'); return !!(el && el.checked); } catch(e) { return true; } })()
            }
        };
        try {
            if (playerRoster && typeof playerRoster.toSerializable === 'function') {
                setup.data.roster = playerRoster.toSerializable({ includeEntity: false });
            }
        } catch (e) {}
        window.ws.send(JSON.stringify({ type: 'relay', data: setup }));
    }
    // Also broadcast when Enemy AI is toggled; update local flags so UI can reflect immediately
    try {
        const enemyAiToggle = document.getElementById('enemy-ai');
        const onAiChange = () => {
            try {
                const enabled = !!enemyAiToggle.checked;
                enemyCount = enabled ? 1 : 0;
                enemyDisabled = !enabled;
            } catch (e) {}
            try { updateCardsUI(); } catch (e) {}
            try { broadcastSetup(); } catch (e) {}
        };
        if (enemyAiToggle) {
            enemyAiToggle.addEventListener('input', onAiChange);
            enemyAiToggle.addEventListener('change', onAiChange);
        }
    } catch (e) { /* non-fatal */ }
    [densitySlider,sizeSlider,dynamicCheckbox,dynamicRateSlider,mapBorderCheckbox,worldModifierSlider].forEach(el => {
        if (el) el.addEventListener('input', () => broadcastSetup());
        if (el) el.addEventListener('change', () => broadcastSetup());
    });

    // Apply incoming setup and preview UI for the joiner
    function applyIncomingSetup(s) {
        try {
            densitySlider.value = s.density; densityValue.textContent = densitySlider.value;
            sizeSlider.value = s.size; sizeValue.textContent = sizeSlider.value;
            dynamicCheckbox.checked = !!s.dynamic; dynamicRateRow.style.display = s.dynamic ? 'flex' : 'none';
            dynamicRateSlider.value = s.dynamicRate.toFixed(2); dynamicRateValue.textContent = parseFloat(dynamicRateSlider.value).toFixed(2);
            mapBorderCheckbox.checked = !!s.mapBorder;
            worldModifierSlider.value = s.worldModInterval; worldModifierValue.textContent = worldModifierSlider.value;
            // Mirror Enemy AI toggle from host so UI and game logic align (used for host-is-WM 2p behavior)
            if (typeof s.enemyAI !== 'undefined') {
                try {
                    const enemyAiCheckbox = document.getElementById('enemy-ai');
                    if (enemyAiCheckbox) enemyAiCheckbox.checked = !!s.enemyAI;
                    enemyCount = s.enemyAI ? 1 : 0;
                    enemyDisabled = !s.enemyAI;
                } catch (e) { /* non-fatal */ }
            }
            // Apply WorldMaster settings from host
            if (typeof s.wmEnabled !== 'undefined') worldMasterEnabled = !!s.wmEnabled;
            if (typeof s.wmPlayerIndex !== 'undefined') worldMasterPlayerIndex = (s.wmPlayerIndex === null ? null : s.wmPlayerIndex|0);
            try { updateWorldMasterSetupUI(); } catch (e) {}
            // Re-assign local roles and configure WM instance/UI as needed
            try { assignPlayersAndAI(); } catch (e) {}
            // Apply roster snapshot from host so joiner sees accurate seating
            if (s.roster && playerRoster && typeof playerRoster.importSerializable === 'function') {
                try { playerRoster.importSerializable(s.roster, { preserveExternalIds: true }); renderRosterUI(); } catch (err) {}
            }
            // Refresh cards UI so labels/rows reflect the new setup immediately on joiner
            try { updateCardsUI(); } catch (e) {}
        } catch (e) {}
    }

    // Helper so radios can broadcast WM changes
    window.broadcastSetupWM = function() {
        try { broadcastSetup(); } catch (e) {}
    };

    // Expose UI helpers globally for other modules
    window.showSetupUI = showSetupUI;
    window.hideSetupUI = hideSetupUI;
    window.setMpSessionDisplay = setMpSessionDisplay;
    window.setLobbyPlayers = setLobbyPlayers;
    window.broadcastSetup = broadcastSetup;
    window.applyIncomingSetup = applyIncomingSetup;
}


window.setupOverlayInit = setupOverlayInit;

