/**
 * RosterSystem - Manages 2-4 fighter slots (humans and bots)
 * Replaces legacy hardcoded player/enemy system
 */
const BOT_DIFFICULTY_DEFAULT = 'normal';

function resolveBotDifficultyData(key) {
    const presets = (typeof BOT_DIFFICULTY_PRESETS !== 'undefined') ? BOT_DIFFICULTY_PRESETS : null;
    if (presets && key && presets[key]) {
        return presets[key];
    }
    if (presets && presets[BOT_DIFFICULTY_DEFAULT]) {
        return presets[BOT_DIFFICULTY_DEFAULT];
    }
    return {
        key: BOT_DIFFICULTY_DEFAULT,
        label: 'Normal'
    };
}

class RosterSystem {
    constructor() {
        this.slots = new Array(4).fill(null); // Always 4 slots
        this.maxSlots = 4;
        this.fighterColors = ['#65c6ff', '#ff5a5a', '#ffe066', '#2ecc71']; // blue, red, yellow, green (match original)
        this.spawnPoints = [
            { x: CANVAS_W / 3, y: CANVAS_H / 2 },
            { x: 2 * CANVAS_W / 3, y: CANVAS_H / 2 },
            { x: CANVAS_W * 0.25, y: CANVAS_H * 0.75 },
            { x: CANVAS_W * 0.75, y: CANVAS_H * 0.25 }
        ];
        this.nextFighterId = 1;
        this.botDifficultyCache = {};
    }

    // Assign a fighter (human or bot) to a slot
    assignSlot(index, type, name, metadata = {}, options = {}) {
        if (index < 0 || index >= this.maxSlots) return null;

        const {
            forceId,
            isLocalOverride,
            isBotOverride,
            colorOverride,
            position,
            metadataOverrides
        } = options;

        let fighterId;
        if (forceId) {
            fighterId = forceId;
            const match = /^fighter_(\d+)$/.exec(forceId);
            if (match) {
                const numericId = parseInt(match[1], 10);
                if (!isNaN(numericId) && numericId >= this.nextFighterId) {
                    this.nextFighterId = numericId + 1;
                }
            }
        } else {
            fighterId = `fighter_${this.nextFighterId++}`;
        }

        const defaultColor = this.fighterColors[index] || this.fighterColors[0];
        const spawnPoint = position || this.spawnPoints[index] || { x: CANVAS_W / 2, y: CANVAS_H / 2 };
        const effectiveMetadata = Object.assign({}, metadata || {}, metadataOverrides || {});

        const defaultIsLocal = (index === 0 && type === 'human' && !effectiveMetadata.remote);
        const isLocal = typeof isLocalOverride === 'boolean' ? isLocalOverride : defaultIsLocal;
        const isBot = typeof isBotOverride === 'boolean' ? isBotOverride : (type === 'bot');

        if (isBot) {
            const existing = this.slots[index];
            const cachedDifficulty = this.botDifficultyCache[index];
            const requestedDifficulty = effectiveMetadata.botDifficulty
                || (existing && existing.metadata && existing.metadata.botDifficulty)
                || cachedDifficulty;
            const difficultyData = resolveBotDifficultyData(requestedDifficulty);
            effectiveMetadata.botDifficulty = difficultyData.key;
        }

        let fighter = new Fighter({
            id: fighterId,
            slotIndex: index,
            name: name || `${type === 'human' ? 'Player' : 'Bot'} ${index + 1}`,
            color: colorOverride || effectiveMetadata.color || defaultColor,
            isBot: isBot,
            isLocal: isLocal,
            x: spawnPoint.x,
            y: spawnPoint.y
        });

        // Store metadata (placeholder flag, joiner index, etc.)
        fighter.metadata = Object.assign({}, effectiveMetadata);
        if (isBot) {
            const difficultyData = resolveBotDifficultyData(fighter.metadata.botDifficulty);
            fighter.metadata.botDifficulty = difficultyData.key;
            fighter.botDifficulty = difficultyData.key;
        }

        this.slots[index] = fighter;
        return fighter;
    }

    // Clear a slot
    clearSlot(index) {
        if (index >= 0 && index < this.maxSlots) {
            const fighter = this.slots[index];
            if (fighter && fighter.isBot && fighter.metadata && fighter.metadata.botDifficulty) {
                this.botDifficultyCache[index] = fighter.metadata.botDifficulty;
            }
            this.slots[index] = null;
        }
    }

    // Toggle slot state: empty ↔ bot
    toggleSlot(index) {
        if (index < 0 || index >= this.maxSlots) return;
        if (index === 0) return; // Slot 0 is always Player 1 (local)

        const fighter = this.slots[index];

        if (!fighter) {
            this.assignSlot(index, 'bot', `Bot ${index + 1}`, {});
            return;
        }

        // Prevent toggling human-controlled slots
        if (!fighter.isBot) {
            return;
        }

        // Bot → empty
        this.clearSlot(index);
    }

    // Get slot descriptor for UI rendering
    describeSlot(index) {
        const fighter = this.slots[index];
        
        if (!fighter) {
            return {
                fighter: null,
                classes: ['empty'],
                body: 'Empty seat',
                subtext: 'Click to add AI bot',
                bodyColor: '#8b96aa'
            };
        }

        if (fighter.isBot) {
            const difficultyData = resolveBotDifficultyData(fighter.metadata && fighter.metadata.botDifficulty);
            const diffLabel = difficultyData.label || 'Normal';
            return {
                fighter: fighter,
                classes: ['bot'],
                body: fighter.name,
                subtext: `AI opponent • ${diffLabel}`,
                bodyColor: fighter.color || this.fighterColors[index]
            };
        }

        // Local player (slot 0)
        const isRemote = fighter.metadata && fighter.metadata.remote;
        const subtext = fighter.isLocal && !isRemote
            ? 'Controlled here'
            : 'Connected player';

        return {
            fighter: fighter,
            classes: isRemote ? ['human', 'remote'] : ['human'],
            body: fighter.name,
            subtext,
            bodyColor: fighter.color || this.fighterColors[index]
        };
    }

    // Get fighter color for rendering
    getRosterFighterColor(index, fighter) {
        if (!fighter) return this.fighterColors[index];
        return fighter.color || this.fighterColors[index];
    }

    clearAllSlots() {
        this.slots = new Array(4).fill(null);
        this.botDifficultyCache = {};
    }

    getSlot(index) {
        return this.slots[index] || null;
    }

    getAllFighters() {
        return this.slots.filter(f => f !== null && f !== undefined);
    }

    getAliveFighters() {
        return this.getAllFighters().filter(f => f.alive);
    }

    getLocalFighter() {
        return this.getAllFighters().find(f => f.isLocal) || null;
    }

    getBotFighters() {
        return this.getAllFighters().filter(f => f.isBot);
    }

    eliminateFighter(fighterId) {
        let fighter = this.getAllFighters().find(f => f.id === fighterId);
        if (fighter) {
            fighter.eliminated = true;
            fighter.alive = false;
        }
    }

    resetFighters() {
        for (let i = 0; i < this.slots.length; ++i) {
            let fighter = this.slots[i];
            if (fighter) {
                let spawn = this.spawnPoints[i];
                fighter.reset(spawn.x, spawn.y);
            }
        }
    }

    getSlotCount() {
        return this.getAllFighters().length;
    }

    isEmpty() {
        return this.getSlotCount() === 0;
    }

    isFull() {
        return this.getSlotCount() >= this.maxSlots;
    }

    // Initialize default setup: Player 1 in slot 0, Bot 1 in slot 1
    initializeDefaults() {
        this.clearAllSlots();
        this.assignSlot(0, 'human', 'Player 1', {});
        this.assignSlot(1, 'bot', 'Bot 1', {});
    }

    // Get fighter by ID
    getFighterById(id) {
        return this.getAllFighters().find(f => f.id === id) || null;
    }

    updateFighter(fighterId, updates = {}) {
        if (!fighterId || !updates) return null;
        const fighter = this.getFighterById(fighterId);
        if (!fighter) return null;

        if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
            const name = typeof updates.name === 'string' ? updates.name : '';
            if (name.trim().length > 0) {
                fighter.name = name.trim().slice(0, 32);
            }
        }

        if (Object.prototype.hasOwnProperty.call(updates, 'color')) {
            const color = updates.color;
            if (typeof color === 'string' && color.trim().length > 0) {
                fighter.color = color.trim();
            }
        }

        if (Object.prototype.hasOwnProperty.call(updates, 'isBot')) {
            fighter.isBot = !!updates.isBot;
        }

        if (Object.prototype.hasOwnProperty.call(updates, 'isLocal')) {
            fighter.isLocal = !!updates.isLocal;
        }

        if (updates.metadata && typeof updates.metadata === 'object') {
            fighter.metadata = Object.assign({}, fighter.metadata || {}, updates.metadata);
            if (fighter.isBot) {
                const diffData = resolveBotDifficultyData(fighter.metadata.botDifficulty);
                fighter.metadata.botDifficulty = diffData.key;
                fighter.botDifficulty = diffData.key;
            }
        }

        return fighter;
    }

    // Get fighter by joiner index (for multiplayer)
    getFighterByJoinerIndex(joinerIndex) {
        // Joiner index 0 = slot 1, joiner 1 = slot 2, etc.
        const slotIndex = joinerIndex + 1;
        return this.slots[slotIndex] || null;
    }

    // Assign a networked joiner to a slot
    assignJoiner(joinerIndex, joinerName) {
        const slotIndex = joinerIndex + 1; // Joiner 0 → slot 1, etc.
        if (slotIndex < 0 || slotIndex >= this.maxSlots) return null;
        
        return this.assignSlot(slotIndex, 'human', joinerName, { 
            remote: true, 
            joinerIndex: joinerIndex 
        });
    }

    // Clear a joiner from roster
    clearJoiner(joinerIndex) {
        const slotIndex = joinerIndex + 1;
        this.clearSlot(slotIndex);
    }
}

// Export to window
if (typeof window !== 'undefined') {
    window.RosterSystem = RosterSystem;
}
