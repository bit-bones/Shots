// Minimal WebSocket server for multiplayer relay
// Run with: node server.js
const WebSocket = require('ws');
const PORT = process.env.PORT || 3001;
const wss = new WebSocket.Server({ port: PORT });

// Map session codes to arrays of sockets
const sessions = {};

function makeSessionCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

wss.on('connection', function connection(ws) {
    let session = null;
    let role = null; // 'host' or 'joiner'

    ws.on('message', function incoming(message) {
        let msg;
        try { msg = JSON.parse(message); } catch (e) { return; }
        if (msg.type === 'host') {
            // Host requests a new session
            session = msg.code || makeSessionCode();
            role = 'host';
            if (!sessions[session]) sessions[session] = [];
            sessions[session][0] = ws;
            ws.send(JSON.stringify({ type: 'hosted', code: session }));
        } else if (msg.type === 'join') {
            // Joiner requests to join a session
            session = msg.code;
            role = 'joiner';
            if (!sessions[session]) sessions[session] = [];
            sessions[session][1] = ws;
            ws.send(JSON.stringify({ type: 'joined', code: session }));
            // Notify host someone joined
            if (sessions[session][0]) {
                sessions[session][0].send(JSON.stringify({ type: 'peer-joined' }));
            }
        } else if (msg.type === 'relay' && session && sessions[session]) {
            // Relay game data to the other peer
            const idx = role === 'host' ? 1 : 0;
            const peer = sessions[session][idx];
            if (peer && peer.readyState === WebSocket.OPEN) {
                peer.send(JSON.stringify({ type: 'relay', data: msg.data }));
            }
        }
    });

    ws.on('close', function() {
        if (session && sessions[session]) {
            if (role === 'host') sessions[session][0] = null;
            if (role === 'joiner') sessions[session][1] = null;
            // Clean up if both gone
            if (!sessions[session][0] && !sessions[session][1]) {
                delete sessions[session];
            }
        }
    });
});

console.log('WebSocket server running on port', PORT);