// GameEventSystem.js
// Centralized event-driven sync system for multiplayer game

class GameEventManager {
    constructor() {
        this.events = []; // Store recent events for debugging
        this.maxEvents = 100; // Limit event history
        this.isHost = false;
        this.connected = false;
    }

    // Main method to emit events - automatically syncs if host
    emit(eventType, data) {
        const event = {
            id: `${eventType}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            type: eventType,
            data,
            timestamp: Date.now()
        };
        this.events.push(event);
        if (this.events.length > this.maxEvents) {
            this.events.shift();
        }
    // (debug removed)
        if (this.isHost && this.connected) {
            this.syncEvent(event);
        } else {
            // (debug removed)
        }
        return event;
    }

    // Send event to joiner via WebSocket
    syncEvent(event) {
        try {
            if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                // (debug removed)
                window.ws.send(JSON.stringify({ type: 'relay', data: { type: 'game-event', event } }));
            } else {
                // (warn removed to reduce noise)
            }
        } catch (e) {
            // Handle errors gracefully
            if (window.console) console.warn('GameEventManager syncEvent error:', e);
        }
    }

    // Process incoming events on joiner
    processEvent(event) {
    // (debug removed)
        switch (event.type) {
            case 'explosion':
                if (typeof applyExplosionEvent === 'function') applyExplosionEvent(event.data);
                break;
            case 'damage-flash':
                if (typeof applyDamageFlashEvent === 'function') applyDamageFlashEvent(event.data);
                break;
            case 'healing-effect':
                if (typeof applyHealingEffectEvent === 'function') applyHealingEffectEvent(event.data);
                break;
            case 'chunk-update':
                if (typeof applyChunkUpdateEvent === 'function') applyChunkUpdateEvent(event.data);
                break;
            case 'infestation-spawn':
                if (typeof applyInfestationSpawnEvent === 'function') applyInfestationSpawnEvent(event.data);
                break;
            case 'firestorm-spawn':
                if (typeof applyFirestormSpawnEvent === 'function') applyFirestormSpawnEvent(event.data);
                break;
            case 'burning-start':
                if (typeof applyBurningStartEvent === 'function') applyBurningStartEvent(event.data);
                break;
            case 'burning-stop':
                if (typeof applyBurningStopEvent === 'function') applyBurningStopEvent(event.data);
                break;
            case 'dynamic-spawn':
                if (typeof applyDynamicSpawnEvent === 'function') applyDynamicSpawnEvent(event.data);
                break;
            case 'dynamic-despawn':
                if (typeof applyDynamicDespawnEvent === 'function') applyDynamicDespawnEvent(event.data);
                break;
            case 'particle-spawn':
                if (typeof applyParticleEvent === 'function') applyParticleEvent(event.data);
                break;
            case 'sound-effect':
                if (typeof applySoundEffectEvent === 'function') applySoundEffectEvent(event.data);
                break;
            default:
                if (window.console) console.warn('Unknown game event type:', event.type, event);
        }
    }

    // Update connection status
    setNetworkState(isHost, connected) {
        this.isHost = isHost;
        this.connected = connected;
    }
}

// Create global instance
const GameEvents = new GameEventManager();

// Export for use in other modules if needed (for module systems)
try {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { GameEventManager, GameEvents };
    }
} catch (e) {}
