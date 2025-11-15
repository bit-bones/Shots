/**
 * CardSystem - Manages PowerUps and World Modifiers
 */

const HEALER_SPAWN_RADIUS = 26; // Slightly larger than healer body to give clearance
const HEALER_SPAWN_CLEARANCE = 8; // Minimum gap from obstacles/units
const HEALER_FIGHTER_BUFFER = 14; // Extra spacing from fighters (matches original)
const HEALER_HEALER_BUFFER = 18; // Keep healers from stacking
const HEALER_SPAWN_SEARCH_TRIES = 80;
const HEALER_SPAWN_GRID_STEP = 70;

class CardSystem {
    constructor(game) {
        this.game = game;
        this.powerupsEnabled = true;
        this.worldModsEnabled = true;
        this.activeMods = [];
        this.usedWorldMods = {};
        this.audioManager = null;
        
        // Card deck management - track which cards are enabled
        this.enabledPowerups = new Set();
        this.enabledWorldMods = new Set();
        
        // Initialize all cards as enabled
        if (typeof POWERUPS !== 'undefined') {
            POWERUPS.forEach(card => this.enabledPowerups.add(card.name));
        }
        if (typeof WORLD_MODIFIERS !== 'undefined') {
            WORLD_MODIFIERS.forEach(card => this.enabledWorldMods.add(card.name));
        }
        
        // Card selection state
        this.pendingPowerup = null; // { fighter, choices, callback }
        this.pendingWorldMod = null; // { choices, callback }
        
        // World modifier state
        this.infestationActive = false;
        this.infestationTimer = 0;
        this.infestationInterval = 3.5; // Base interval, will be reduced with more cards
        this.infestationCardsPulled = 0;
        
        this.spontaneousActive = false;
        this.spontaneousTimer = 0;
        this.spontaneousInterval = 4.0;
        this.spontaneousCardsPulled = 0;
        
        this.dynamicActive = false;
        this.dynamicTimer = 0;
        this.dynamicInterval = 3.0;
        this.dynamicSpawnNext = true;
        
        this.firestormActive = false;
        this.firestormTimer = 0;
        this.firestormInterval = 6.0; // Base interval, will be reduced with more cards
        
        // Firestorm pre-spawn state
        this.firestormPreSpawnPos = null;
        this.firestormPreSpawnTimer = 0;
        this.firestormPreSpawnDelay = 2.0;
        
        this.healersActive = false;
        this.healersSpawned = false;
        this.healersCardsPulled = 0;
        this.healerRespawnTimer = 0;
        this.healerRespawnDelay = 0;
        this.healerPendingRespawn = false;
        this.healerPreSpawnPos = null;
        this.healerNextSpawnPos = null;
        this.healerTelegraphDuration = 1.1; // Seconds of pre-spawn warning
        
        // Track how many Firestorm cards have been pulled
        this.firestormCardsPulled = 0;
    }
    
    // Card Management Methods
    
    /**
     * Toggle a powerup card's enabled state
     * @param {string} cardName - Name of the powerup card
     * @param {boolean} enabled - Whether the card should be enabled
     */
    togglePowerup(cardName, enabled) {
        if (enabled) {
            this.enabledPowerups.add(cardName);
        } else {
            this.enabledPowerups.delete(cardName);
        }
    }
    
    /**
     * Toggle a world modifier card's enabled state
     * @param {string} cardName - Name of the world modifier card
     * @param {boolean} enabled - Whether the card should be enabled
     */
    toggleWorldMod(cardName, enabled) {
        if (enabled) {
            this.enabledWorldMods.add(cardName);
        } else {
            this.enabledWorldMods.delete(cardName);
        }
    }
    
    /**
     * Check if a powerup card is enabled
     * @param {string} cardName - Name of the powerup card
     * @returns {boolean} Whether the card is enabled
     */
    isPowerupEnabled(cardName) {
        return this.enabledPowerups.has(cardName);
    }
    
    /**
     * Check if a world modifier card is enabled
     * @param {string} cardName - Name of the world modifier card
     * @returns {boolean} Whether the card is enabled
     */
    isWorldModEnabled(cardName) {
        return this.enabledWorldMods.has(cardName);
    }
    
    // Card Offering Methods
    
    setAudioManager(audioManager) {
        this.audioManager = audioManager;
    }
    
    /**
     * Offer powerup cards to a fighter
     * @param {Fighter} fighter - The fighter to offer cards to
     * @param {Function} callback - Called with selected card name
     * @param {FighterAI} ai - Optional AI controller for bot selection
     */
    offerPowerup(fighter, callback, ai = null) {
        if (!this.powerupsEnabled) return null;
        
        // Filter to only enabled cards
        const enabledCards = POWERUPS.filter(card => this.enabledPowerups.has(card.name));
        if (enabledCards.length === 0) return null;
        
        // Offer 5 random powerups from enabled cards
        let choices = randomChoice(enabledCards, Math.min(5, enabledCards.length));
        
        // If bot, auto-select immediately
        if (fighter.isBot && ai) {
            const selectedCard = ai.selectCard(choices);
            if (selectedCard && callback) {
                callback(selectedCard);
            }
            return null;
        }
        
        // Human player - show UI
        this.pendingPowerup = { fighter, choices, callback };
        return choices;
    }

    /**
     * Offer world modifier cards
     * @param {Function} callback - Called with selected modifier name
     */
    offerWorldMod(callback) {
        if (!this.worldModsEnabled) return null;
        
        // Filter to only enabled cards
        const enabledCards = WORLD_MODIFIERS.filter(card => this.enabledWorldMods.has(card.name));
        if (enabledCards.length === 0) return null;
        
        // Filter out already used mods from enabled cards
        let available = enabledCards.filter(m => !this.usedWorldMods[m.name]);
        let pool = available.length >= 3 ? available : enabledCards;
        let choices = randomChoice(pool, Math.min(3, pool.length));
        
        this.pendingWorldMod = { choices, callback };
        return choices;
    }

    /**
     * Apply powerup card selection
     */
    selectPowerup(cardName) {
        if (!this.pendingPowerup) return;
        
        const { fighter, callback } = this.pendingPowerup;
        this.pendingPowerup = null;
        
        if (callback) {
            callback(cardName, fighter);
        }
    }

    /**
     * Apply world modifier card selection
     */
    selectWorldMod(modName) {
        if (!this.pendingWorldMod) return;
        
        const { callback } = this.pendingWorldMod;
        this.pendingWorldMod = null;
        
        if (callback) {
            callback(modName);
        }
    }

    /**
     * Check if card selection is pending
     */
    isSelectionPending() {
        return this.pendingPowerup !== null || this.pendingWorldMod !== null;
    }

    applyWorldMod(modName) {
        this.activeMods.push(modName);
        this.usedWorldMods[modName] = true;
        
        switch (modName) {
            case 'Infestation':
                this.infestationActive = true;
                this.infestationTimer = 0;
                this.infestationCardsPulled++;
                break;
            case 'Spontaneous':
                this.spontaneousActive = true;
                this.spontaneousTimer = 0;
                this.spontaneousCardsPulled++;
                break;
            case 'Dynamic':
                this.dynamicActive = true;
                this.dynamicTimer = 0;
                this.dynamicSpawnNext = true;
                break;
            case 'Firestorm':
                this.firestormActive = true;
                this.firestormTimer = 0;
                this.firestormCardsPulled++;
                break;
            case 'Healers':
                this.healersActive = true;
                this.healersCardsPulled++;
                break;
            default:
                console.warn('[CardSystem] Unknown world modifier:', modName);
        }
    }

    update(dt, obstacles, infestedChunks, firestorms, healers) {
        // Update Infestation
        if (this.infestationActive) {
            this.infestationTimer += dt;
            // Calculate interval based on cards pulled (faster spawning with more cards)
            const baseInterval = 3.5;
            const reductionPerCard = 0.7; // Reduce by 0.7 seconds per additional card
            const minInterval = 1.5; // Minimum interval
            const currentInterval = Math.max(minInterval, baseInterval - (this.infestationCardsPulled - 1) * reductionPerCard);
            
            if (this.infestationTimer >= currentInterval) {
                // Check if we can spawn (limit based on cards pulled)
                const activeInfestedChunks = infestedChunks.filter(c => c.active).length;
                if (activeInfestedChunks < this.infestationCardsPulled) {
                    this.spawnInfestedChunk(obstacles, infestedChunks);
                }
                this.infestationTimer = 0;
            }
        }

        // Update Spontaneous
        if (this.spontaneousActive) {
            this.spontaneousTimer += dt;
            if (this.spontaneousTimer >= this.spontaneousInterval) {
                // Count current glowing chunks
                let glowingCount = 0;
                for (let o of obstacles) {
                    for (let c of o.chunks) {
                        if (c.spontaneousGlow && !c.destroyed) glowingCount++;
                    }
                }
                if (glowingCount < this.spontaneousCardsPulled) {
                    this.spontaneousCombust(obstacles);
                }
                this.spontaneousTimer = 0;
            }
        }

        // Update Dynamic
        if (this.dynamicActive) {
            this.dynamicTimer += dt;
            if (this.dynamicTimer >= this.dynamicInterval) {
                if (this.dynamicSpawnNext) {
                    this.spawnRandomObstacle(obstacles);
                } else {
                    this.removeRandomObstacle(obstacles);
                }
                this.dynamicSpawnNext = !this.dynamicSpawnNext;
                this.dynamicTimer = 0;
            }
        }

        // Update Firestorm
        if (this.firestormActive) {
            if (this.firestormPreSpawnPos) {
                // Handle pre-spawn warning
                this.firestormPreSpawnTimer += dt;
                if (this.firestormPreSpawnTimer >= this.firestormPreSpawnDelay) {
                    // Check if we can spawn (limit based on cards pulled)
                    const activeFirestorms = firestorms.filter(f => !f.done).length;
                    if (activeFirestorms < this.firestormCardsPulled) {
                        // Spawn the actual firestorm
                        firestorms.push(new Firestorm(this.firestormPreSpawnPos.x, this.firestormPreSpawnPos.y, this.firestormPreSpawnPos.radius));
                    }
                    this.firestormPreSpawnPos = null;
                    this.firestormPreSpawnTimer = 0;
                    this.firestormTimer = 0;
                    this.firestormNextTime = 10 + Math.random() * 20;
                }
            } else {
                // Normal firestorm spawning interval
                this.firestormTimer += dt;
                // Calculate interval based on cards pulled (faster spawning with more cards)
                const baseInterval = 12.0;
                const reductionPerCard = 1.0; // Reduce by 1 second per additional card
                const minInterval = 4.0; // Minimum interval
                const currentInterval = Math.max(minInterval, baseInterval - (this.firestormCardsPulled - 1) * reductionPerCard);
                
                if (this.firestormTimer >= currentInterval) {
                    // Check if we can spawn (limit based on cards pulled)
                    const activeFirestorms = firestorms.filter(f => !f.done).length;
                    if (activeFirestorms < this.firestormCardsPulled) {
                        this.spawnFirestorm(firestorms);
                    }
                    this.firestormTimer = 0;
                }
            }
        }
        
        // Update Healers - continuous respawn system like original game
        if (this.healersActive) {
            // Check if we need to start a new respawn cycle
            if (!this.healerPendingRespawn && healers.filter(h => h.active).length < this.healersCardsPulled) {
                this.healerPendingRespawn = true;
                this.setNextHealerRespawnDelay();
            }

            if (this.healerPendingRespawn) {
                this.healerRespawnTimer += dt;

                const timeRemaining = Math.max(0, this.healerRespawnDelay - this.healerRespawnTimer);
                const telegraphWindow = Math.min(this.healerTelegraphDuration, this.healerRespawnDelay * 0.6);

                if (this.healerNextSpawnPos && telegraphWindow > 0 && timeRemaining <= telegraphWindow) {
                    const rawProgress = telegraphWindow > 0 ? 1 - (timeRemaining / telegraphWindow) : 1;
                    const progress = clamp(rawProgress, 0, 1);
                    const eased = 1 - Math.pow(1 - progress, 1.45);
                    this.healerPreSpawnPos = {
                        x: this.healerNextSpawnPos.x,
                        y: this.healerNextSpawnPos.y,
                        radius: HEALER_SPAWN_RADIUS + 12 + eased * 24,
                        progress,
                        timeRemaining
                    };
                } else {
                    this.healerPreSpawnPos = null;
                }

                if (this.healerRespawnTimer >= this.healerRespawnDelay) {
                    const activeHealers = healers.filter(h => h.active).length;
                    if (activeHealers < this.healersCardsPulled) {
                        const spawnTarget = this.healerNextSpawnPos
                            ? { x: this.healerNextSpawnPos.x, y: this.healerNextSpawnPos.y }
                            : null;
                        this.spawnHealerAt(healers, spawnTarget);
                    }
                    this.healerPendingRespawn = false;
                    this.healerRespawnTimer = 0;
                    this.healerPreSpawnPos = null;
                    this.healerNextSpawnPos = null;
                }
            } else {
                this.healerPreSpawnPos = null;
            }
        } else {
            this.healerPendingRespawn = false;
            this.healerPreSpawnPos = null;
            this.healerNextSpawnPos = null;
        }
    }

    spawnInfestedChunk(obstacles, infestedChunks) {
        let validObstacles = obstacles.filter(o => !o.destroyed && o.chunks.some(c => !c.destroyed));
        if (validObstacles.length === 0) return;
        
        let obstacle = validObstacles[randInt(0, validObstacles.length - 1)];
        let validChunks = obstacle.chunks.filter(c => !c.destroyed);
        if (validChunks.length === 0) return;
        
        let chunk = validChunks[randInt(0, validChunks.length - 1)];
        let infestedChunk = new InfestedChunk(chunk, obstacle, false);
        infestedChunks.push(infestedChunk);
        
        // Original chunk is marked as destroyed in InfestedChunk constructor
    }

    spontaneousCombust(obstacles) {
        let validObstacles = obstacles.filter(o => !o.destroyed);
        if (validObstacles.length === 0) return;
        
        let obstacle = validObstacles[randInt(0, validObstacles.length - 1)];
        let validChunks = obstacle.chunks.filter(c => !c.destroyed);
        if (validChunks.length === 0) return;
        
        let chunk = validChunks[randInt(0, validChunks.length - 1)];
        // Set spontaneous glow instead of direct burning
        const glowDuration = 20.0 + Math.random() * 20.0; // 20-40 seconds glow
        chunk.spontaneousGlow = { time: 0, duration: glowDuration };
    }

    spawnRandomObstacle(obstacles) {
        // Get current obstacle settings from UI (same as Game.js generateObstacles)
        const densitySlider = document.getElementById('obstacle-density');
        const sizeSlider = document.getElementById('obstacle-size');
        const obstacleSize = sizeSlider ? parseInt(sizeSlider.value, 10) : 110;

        // Size determines min/max range: center around the slider value
        const sizeRange = obstacleSize * 0.4; // 40% variance
        const minSize = Math.max(40, obstacleSize - sizeRange);
        const maxSize = Math.min(200, obstacleSize + sizeRange);

        // Get game state for collision checking
        const gameState = this.game.getGameState();
        const fighters = gameState.fighters || [];

        let tries = 0;
        while (tries < 50) { // Reasonable limit for Dynamic spawning
            tries++;

            // Generate square obstacle (same w and h)
            let size = rand(minSize, maxSize);
            let w = size, h = size;
            let x = rand(60, CANVAS_W - w - 60);
            let y = rand(60, CANVAS_H - h - 60);

            let obs = new Obstacle(x, y, w, h);
            let centerX = x + w / 2;
            let centerY = y + h / 2;
            let safe = true;

            // Check distance from fighters (same logic as Game.js)
            for (let f of fighters) {
                let minDist = Math.max(w, h) * 0.6 + f.radius + 12;
                if (dist(centerX, centerY, f.x, f.y) <= minDist) {
                    safe = false;
                    break;
                }
            }

            // Check overlap with existing obstacles (same logic as Game.js)
            if (safe) {
                for (let o of obstacles) {
                    if (this.game.rectsOverlap(obs, o)) {
                        safe = false;
                        break;
                    }
                }
            }

            if (safe) {
                obstacles.push(obs);
                return obs;
            }
        }

        console.warn('[CardSystem] Failed to spawn Dynamic obstacle after 50 tries');
        return null;
    }

    removeRandomObstacle(obstacles) {
        let validObstacles = obstacles.filter(o => !o.destroyed);
        if (validObstacles.length === 0) return;
        
        let obstacle = validObstacles[randInt(0, validObstacles.length - 1)];
        
        // Animate chunks flying off (like original game)
        for (const c of obstacle.chunks) {
            if (!c.destroyed) {
                c.destroyed = true;
                c.flying = true;
                c.vx = rand(-140, 140);
                c.vy = rand(-240, -40);
                c.alpha = 1;
            }
        }
        obstacle.destroyed = true;
        
        // Replace this obstacle after a short delay, ensuring 1:1 ratio (like original game)
        setTimeout(() => {
            this.spawnRandomObstacle(obstacles);
        }, 700 + Math.random() * 300);
    }

    spawnFirestorm(firestorms) {
        // Set pre-spawn warning position
        const x = rand(150, CANVAS_W - 150);
        const y = rand(150, CANVAS_H - 150);
        const radius = rand(140, 260);
        this.firestormPreSpawnPos = { x, y, radius };
        this.firestormPreSpawnTimer = 0;
    }
    
    spawnHealers(healers) {
        // Spawn 2-3 healers at random locations
        const count = 2 + Math.round(Math.random());
        
        for (let i = 0; i < count; i++) {
            const x = rand(100, CANVAS_W - 100);
            const y = rand(100, CANVAS_H - 100);
            healers.push(new Healer(x, y));
        }
    }

    setNextHealerRespawnDelay() {
        // Calculate delay based on cards pulled (faster respawn with more cards)
        const baseDelay = 7.5; // Base delay of 7.5 seconds
        const reductionPerCard = 1.5; // Reduce by 1.5 seconds per additional card
        const minDelay = 3.0; // Minimum delay
        const currentDelay = Math.max(minDelay, baseDelay - (this.healersCardsPulled - 1) * reductionPerCard);
        
        // Add some randomness (±25%)
        const randomFactor = 0.75 + Math.random() * 0.5;
        this.healerRespawnDelay = currentDelay * randomFactor;
        this.healerRespawnTimer = 0;
        this.healerPreSpawnPos = null;

        const spawnRadius = HEALER_SPAWN_RADIUS;
        const candidate = this._findHealerSpawnLocation(spawnRadius);
        const safePos = candidate || { x: CANVAS_W / 2, y: CANVAS_H / 2 };
        this.healerNextSpawnPos = { x: safePos.x, y: safePos.y };
    }

    randomHealerPosition() {
        const margin = Math.max(140, HEALER_SPAWN_RADIUS + 110);
        return {
            x: rand(margin, CANVAS_W - margin),
            y: rand(margin, CANVAS_H - margin)
        };
    }

    spawnHealerAt(healers, pos) {
        const spawnRadius = HEALER_SPAWN_RADIUS;
        let target = null;

        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
            if (this.isHealerSpawnClear(pos.x, pos.y, spawnRadius)) {
                target = { x: pos.x, y: pos.y };
            } else {
                target = this._findHealerSpawnLocation(spawnRadius, { fallbackNear: pos });
            }
        }

        if (!target) {
            target = this._findHealerSpawnLocation(spawnRadius);
        }

        if (!target) {
            target = { x: CANVAS_W / 2, y: CANVAS_H / 2 };
        }

        const h = new Healer(target.x, target.y);
        healers.push(h);
        return h;
    }

    isHealerSpawnClear(x, y, radius = HEALER_SPAWN_RADIUS) {
        if (typeof x !== 'number' || typeof y !== 'number') return false;
        if (x < radius || x > CANVAS_W - radius || y < radius || y > CANVAS_H - radius) return false;
        const clearance = this._measureHealerClearance(x, y, radius);
        return clearance >= HEALER_SPAWN_CLEARANCE;
    }

    _measureHealerClearance(x, y, radius = HEALER_SPAWN_RADIUS) {
        if (typeof x !== 'number' || typeof y !== 'number') return -Infinity;

        let minClear = Math.min(
            x - radius,
            CANVAS_W - radius - x,
            y - radius,
            CANVAS_H - radius - y
        );

        const obstacles = Array.isArray(this.game.obstacles) ? this.game.obstacles : null;
        if (obstacles) {
            for (const obstacle of obstacles) {
                if (!obstacle || !Array.isArray(obstacle.chunks)) continue;
                for (const chunk of obstacle.chunks) {
                    if (!chunk || chunk.destroyed) continue;
                    const closestX = clamp(x, chunk.x, chunk.x + chunk.w);
                    const closestY = clamp(y, chunk.y, chunk.y + chunk.h);
                    const dx = x - closestX;
                    const dy = y - closestY;
                    const dist = Math.sqrt(dx * dx + dy * dy) - radius;
                    if (dist < minClear) {
                        minClear = dist;
                        if (minClear <= -HEALER_SPAWN_CLEARANCE) return minClear;
                    }
                }
            }
        }

        const fighters = (this.game && this.game.roster && typeof this.game.roster.getAllFighters === 'function')
            ? this.game.roster.getAllFighters()
            : [];
        for (const fighter of fighters) {
            if (!fighter || (!fighter.alive && !fighter.dying)) continue;
            const buffer = (fighter.radius || 24) + HEALER_FIGHTER_BUFFER;
            const dist = Math.hypot(x - fighter.x, y - fighter.y) - (radius + buffer);
            if (dist < minClear) {
                minClear = dist;
                if (minClear <= -HEALER_SPAWN_CLEARANCE) return minClear;
            }
        }

        const healers = Array.isArray(this.game.healers) ? this.game.healers : [];
        for (const healer of healers) {
            if (!healer || !healer.active) continue;
            const buffer = healer.radius + HEALER_HEALER_BUFFER;
            const dist = Math.hypot(x - healer.x, y - healer.y) - (radius + buffer);
            if (dist < minClear) {
                minClear = dist;
                if (minClear <= -HEALER_SPAWN_CLEARANCE) return minClear;
            }
        }

        return minClear;
    }

    _findHealerSpawnLocation(radius = HEALER_SPAWN_RADIUS, options = {}) {
        let bestCandidate = null;
        let bestClearance = -Infinity;
        const tries = options.maxTries || HEALER_SPAWN_SEARCH_TRIES;

        for (let i = 0; i < tries; i++) {
            const attempt = options.fallbackNear
                ? this._jitterAroundPosition(options.fallbackNear, radius)
                : this.randomHealerPosition();
            const clearance = this._measureHealerClearance(attempt.x, attempt.y, radius);
            if (clearance >= HEALER_SPAWN_CLEARANCE) {
                return attempt;
            }
            if (clearance > bestClearance) {
                bestClearance = clearance;
                bestCandidate = attempt;
            }
        }

        for (let gx = radius + 50; gx <= CANVAS_W - radius - 50; gx += HEALER_SPAWN_GRID_STEP) {
            for (let gy = radius + 50; gy <= CANVAS_H - radius - 50; gy += HEALER_SPAWN_GRID_STEP) {
                const clearance = this._measureHealerClearance(gx, gy, radius);
                if (clearance >= HEALER_SPAWN_CLEARANCE) {
                    return { x: gx, y: gy };
                }
                if (clearance > bestClearance) {
                    bestClearance = clearance;
                    bestCandidate = { x: gx, y: gy };
                }
            }
        }

        return bestCandidate;
    }

    _jitterAroundPosition(pos, radius = HEALER_SPAWN_RADIUS) {
        const jitter = 110;
        const x = clamp(pos.x + rand(-jitter, jitter), radius, CANVAS_W - radius);
        const y = clamp(pos.y + rand(-jitter, jitter), radius, CANVAS_H - radius);
        return { x, y };
    }

    reset() {
        this.activeMods = [];
        this.usedWorldMods = {};
        this.infestationActive = false;
        this.infestationCardsPulled = 0;
        this.spontaneousActive = false;
        this.spontaneousCardsPulled = 0;
        this.dynamicActive = false;
        this.firestormActive = false;
        this.firestormPreSpawnPos = null;
        this.firestormPreSpawnTimer = 0;
        this.firestormCardsPulled = 0;
        this.healersActive = false;
        this.healersSpawned = false;
        this.healersCardsPulled = 0;
        this.healerRespawnTimer = 0;
        this.healerRespawnDelay = 0;
        this.healerPendingRespawn = false;
        this.healerPreSpawnPos = null;
        this.healerNextSpawnPos = null;
        this.healerTelegraphDuration = 1.1;
    }
}

// Export to window
if (typeof window !== 'undefined') {
    window.CardSystem = CardSystem;
}
