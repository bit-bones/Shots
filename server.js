// Minimal WebSocket server for multiplayer relay (2-4 players)
// Run with: node server.js
const http = require('http');
const WebSocket = require('ws');
const PORT = process.env.PORT || 3001;
const MAX_JOINERS = 3; // Host + 3 joiners = 4 players max

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Shots multiplayer relay running');
});

const wss = new WebSocket.Server({ server });

const sessions = new Map();

function makeSessionCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function normalizeCode(code) {
    return (code || '').toString().trim().toUpperCase();
}

function getOrCreateSession(code) {
    const normalized = normalizeCode(code);
    if (!sessions.has(normalized)) {
        sessions.set(normalized, {
            code: normalized,
            host: null,
            joiners: new Array(MAX_JOINERS).fill(null)
        });
    }
    return sessions.get(normalized);
}

function deleteSession(code) {
    const normalized = normalizeCode(code);
    sessions.delete(normalized);
}

function cleanSession(session) {
    if (!session) return;
    const hasHost = !!(session.host && session.host.readyState === WebSocket.OPEN);
    const hasJoiners = session.joiners.some(entry => entry && entry.ws && entry.ws.readyState === WebSocket.OPEN);
    if (!hasHost && !hasJoiners) {
        sessions.delete(session.code);
    }
}

function safeSend(ws, payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
        ws.send(JSON.stringify(payload));
    } catch (err) {
        /* swallow send errors */
    }
}

function broadcastToJoiners(session, payload, exceptWs) {
    if (!session) return;
    session.joiners.forEach((entry) => {
        if (!entry || !entry.ws || entry.ws === exceptWs) return;
        safeSend(entry.ws, payload);
    });
}

wss.on('connection', function connection(ws) {
    ws.sessionCode = null;
    ws.role = null;
    ws.joinerIndex = null;

    ws.on('message', function incoming(message) {
        let msg;
        try { msg = JSON.parse(message); } catch (e) { return; }

        if (msg.type === 'host') {
            const requestedCode = normalizeCode(msg.code) || makeSessionCode();
            const session = getOrCreateSession(requestedCode);
            if (session.host && session.host !== ws && session.host.readyState === WebSocket.OPEN) {
                try { session.host.close(); } catch (_) {}
            }
            session.host = ws;
            ws.role = 'host';
            ws.sessionCode = session.code;
            ws.joinerIndex = null;
            safeSend(ws, { type: 'hosted', code: session.code, maxPlayers: MAX_JOINERS + 1 });
            // Inform the host about any joiners already connected
            session.joiners.forEach((entry, idx) => {
                if (entry && entry.ws && entry.ws.readyState === WebSocket.OPEN) {
                    safeSend(ws, { type: 'peer-joined', joinerIndex: idx, name: entry.name || null });
                }
            });
        } else if (msg.type === 'join') {
            const code = normalizeCode(msg.code);
            if (!sessions.has(code)) {
                safeSend(ws, { type: 'error', message: 'Session not found.' });
                return;
            }
            const session = sessions.get(code);
            if (!session.host || session.host.readyState !== WebSocket.OPEN) {
                safeSend(ws, { type: 'error', message: 'Host is not connected.' });
                return;
            }
            let slot = -1;
            for (let i = 0; i < session.joiners.length; i++) {
                const entry = session.joiners[i];
                if (!entry || !entry.ws || entry.ws.readyState !== WebSocket.OPEN) {
                    slot = i;
                    break;
                }
            }
            if (slot === -1) {
                safeSend(ws, { type: 'error', message: 'Session is full.' });
                return;
            }
            const joinerName = (msg.name && String(msg.name).trim()) || `Player ${slot + 2}`;
            session.joiners[slot] = { ws, index: slot, name: joinerName };
            ws.role = 'joiner';
            ws.sessionCode = session.code;
            ws.joinerIndex = slot;
            safeSend(ws, { type: 'joined', code: session.code, joinerIndex: slot, name: joinerName, maxPlayers: MAX_JOINERS + 1 });
            safeSend(session.host, { type: 'peer-joined', joinerIndex: slot, name: joinerName });
            // Let other joiners know someone new arrived
            broadcastToJoiners(session, { type: 'peer-joined', joinerIndex: slot, name: joinerName }, ws);
        } else if (msg.type === 'relay' && ws.sessionCode && sessions.has(ws.sessionCode)) {
            const session = sessions.get(ws.sessionCode);
            if (ws.role === 'host') {
                broadcastToJoiners(session, { type: 'relay', data: msg.data }, ws);
            } else if (ws.role === 'joiner') {
                if (session.host && session.host.readyState === WebSocket.OPEN) {
                    let payload = msg.data;
                    if (payload && typeof payload === 'object' && typeof payload.joinerIndex === 'undefined') {
                        payload = Object.assign({}, payload, { joinerIndex: ws.joinerIndex });
                    }
                    safeSend(session.host, { type: 'relay', data: payload, joinerIndex: ws.joinerIndex });
                }
            }
        }
    });

    ws.on('close', function() {
        const code = ws.sessionCode;
        if (!code || !sessions.has(code)) return;
        const session = sessions.get(code);
        if (ws.role === 'host') {
            session.host = null;
            broadcastToJoiners(session, { type: 'host-left' }, null);
            session.joiners.forEach((entry) => {
                if (entry && entry.ws && entry.ws.readyState === WebSocket.OPEN) {
                    try { entry.ws.close(); } catch (_) {}
                }
            });
            deleteSession(code);
        } else if (ws.role === 'joiner') {
            const idx = ws.joinerIndex;
            if (typeof idx === 'number' && idx >= 0 && idx < session.joiners.length) {
                session.joiners[idx] = null;
                if (session.host && session.host.readyState === WebSocket.OPEN) {
                    safeSend(session.host, { type: 'peer-left', joinerIndex: idx });
                }
                broadcastToJoiners(session, { type: 'peer-left', joinerIndex: idx }, ws);
            }
            cleanSession(session);
        }
    });
});

// Bind to 0.0.0.0 explicitly to ensure both IPv4 and IPv6 reachability inside containers
server.listen(PORT, '0.0.0.0', () => {
    console.log('WebSocket server running on port', PORT);
});