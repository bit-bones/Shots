/**
 * FighterAI - Bot behavior tuned to match legacy AI with difficulty presets
 */

const DEFAULT_BOT_DIFFICULTY = 'normal';

const FALLBACK_BOT_DIFFICULTY_PRESETS = {
    easy: {
        key: 'easy',
        label: 'Easy',
        retargetInterval: 0.12,
        strafePhaseSpeedMin: 0.7,
        strafePhaseSpeedMax: 1.25,
        strafeSwitchMin: 0.85,
        strafeSwitchMax: 2.4,
        strafeAmpMin: 0.24,
        strafeAmpMax: 0.72,
        idealDistance: 255,
        distanceBand: 52,
        shootMinDistance: 150,
        shootMaxDistance: 370,
        shootIntervalScale: 1.18,
        aimJitter: 34,
        aimSmoothing: 0.55,
        dashChance: 0.0012,
        dashDistanceMax: 320,
        dashDistanceMin: 120,
        dashCooldownScale: 1.3,
        lineOfSightTolerance: 0,
        moveNoise: 0.12,
        obstacleAvoidStrength: 0.45
    },
    normal: {
        key: 'normal',
        label: 'Normal',
        retargetInterval: 0,
        strafePhaseSpeedMin: 0.9,
        strafePhaseSpeedMax: 1.7,
        strafeSwitchMin: 0.6,
        strafeSwitchMax: 2.2,
        strafeAmpMin: 0.35,
        strafeAmpMax: 0.9,
        idealDistance: 240,
        distanceBand: 36,
        shootMinDistance: 125,
        shootMaxDistance: 430,
        shootIntervalScale: 1.0,
        aimJitter: 8,
        aimSmoothing: 0.38,
        dashChance: 0.0025,
        dashDistanceMax: 360,
        dashDistanceMin: 130,
        dashCooldownScale: 1.0,
        lineOfSightTolerance: 0,
        moveNoise: 0.06,
        obstacleAvoidStrength: 0.55
    },
    hard: {
        key: 'hard',
        label: 'Hard',
        retargetInterval: 0.05,
        strafePhaseSpeedMin: 1.05,
        strafePhaseSpeedMax: 1.9,
        strafeSwitchMin: 0.45,
        strafeSwitchMax: 1.6,
        strafeAmpMin: 0.42,
        strafeAmpMax: 1.05,
        idealDistance: 228,
        distanceBand: 30,
        shootMinDistance: 110,
        shootMaxDistance: 460,
        shootIntervalScale: 0.88,
        aimJitter: 4,
        aimSmoothing: 0.28,
        dashChance: 0.0038,
        dashDistanceMax: 360,
        dashDistanceMin: 110,
        dashCooldownScale: 0.85,
        lineOfSightTolerance: 18,
        moveNoise: 0.04,
        obstacleAvoidStrength: 0.62
    }
};

function getDifficultyPresets() {
    if (typeof BOT_DIFFICULTY_PRESETS !== 'undefined') {
        return BOT_DIFFICULTY_PRESETS;
    }
    return FALLBACK_BOT_DIFFICULTY_PRESETS;
}

function resolveDifficultyConfig(key) {
    const presets = getDifficultyPresets();
    if (key && presets && presets[key]) {
        return presets[key];
    }
    return (presets && presets[DEFAULT_BOT_DIFFICULTY]) || FALLBACK_BOT_DIFFICULTY_PRESETS.normal;
}

function randBetween(min, max) {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return min || max || 0;
    if (min === max) return min;
    return min + Math.random() * (max - min);
}

function getTeamId(fighter) {
    if (!fighter || !fighter.metadata) return null;
    return fighter.metadata.teamId || null;
}

class FighterAI {
    constructor(fighter, options = {}) {
        this.fighter = fighter;
        this.target = null;
        this._targetTimer = 0;
        this._strafePhase = Math.random() * Math.PI * 2;
        this._strafeSwitchTimer = 0;
        this._dashDelayTimer = 0;
        this._lineOfSightHold = 0;
        this._aimX = fighter.x;
        this._aimY = fighter.y;

        this.fighter.keys = {};

        const initialDifficulty = options.difficulty || (fighter && fighter.metadata && fighter.metadata.botDifficulty) || DEFAULT_BOT_DIFFICULTY;
        this.setDifficulty(initialDifficulty, { silent: true });
    }

    setDifficulty(difficultyKey, options = {}) {
        const config = resolveDifficultyConfig(difficultyKey);
        this.difficultyKey = config.key;
        this.config = config;

        this._resetStrafeState(options.silent === true);

        if (this.fighter) {
            if (!this.fighter.metadata) {
                this.fighter.metadata = {};
            }
            this.fighter.metadata.botDifficulty = this.difficultyKey;
            this.fighter.botDifficulty = this.difficultyKey;
        }
    }

    update(dt, fighters, obstacles) {
        const fighter = this.fighter;
        if (!fighter || !fighter.alive) {
            this._clearInputs();
            return;
        }

        const config = this.config || resolveDifficultyConfig(this.difficultyKey);
        if (!config) {
            this._clearInputs();
            return;
        }

        const obstacleList = Array.isArray(obstacles) ? obstacles : [];
        const fighterList = Array.isArray(fighters) ? fighters : [];

        this._updateTarget(dt, fighterList);

        const myTeamId = getTeamId(fighter);
        const targetTeamId = getTeamId(this.target);
        if (!this.target || !this.target.alive || (myTeamId && targetTeamId && myTeamId === targetTeamId)) {
            this._clearInputs();
            return;
        }

        const dx = this.target.x - fighter.x;
        const dy = this.target.y - fighter.y;
        const distance = Math.hypot(dx, dy) || 1;

        this._updateMovement(dt, dx, dy, distance, obstacleList);
        this._updateAim(dt, distance);

        fighter.shootRequested = this._shouldShoot(dt, distance, obstacleList);
        fighter.dashRequested = this._shouldDash(dt, distance);

        fighter.mouseX = this._aimX;
        fighter.mouseY = this._aimY;

        if (typeof fighter.updateCursorAim === 'function') {
            fighter.updateCursorAim(this._aimX, this._aimY);
        }
    }

    _updateTarget(dt, fighters) {
        const config = this.config;
        if (!config) return;

        const myTeamId = getTeamId(this.fighter);
        const targetTeamId = getTeamId(this.target);
        const needsRefresh = !this.target
            || !this.target.alive
            || (myTeamId && targetTeamId && myTeamId === targetTeamId);
        if (config.retargetInterval && config.retargetInterval > 0) {
            this._targetTimer -= dt;
            if (this._targetTimer <= 0 || needsRefresh) {
                this.target = this._findTarget(fighters);
                this._targetTimer = config.retargetInterval;
            }
        } else {
            this.target = this._findTarget(fighters);
        }
    }

    _findTarget(fighters) {
        if (!Array.isArray(fighters) || fighters.length === 0) return null;
        let closest = null;
        let closestDist = Infinity;
        const myTeamId = getTeamId(this.fighter);
        for (const candidate of fighters) {
            if (!candidate || candidate === this.fighter || !candidate.alive) continue;
            const candidateTeamId = getTeamId(candidate);
            if (myTeamId && candidateTeamId && myTeamId === candidateTeamId) continue;
            const d = dist(this.fighter.x, this.fighter.y, candidate.x, candidate.y);
            if (d < closestDist) {
                closest = candidate;
                closestDist = d;
            }
        }
        return closest;
    }

    _updateMovement(dt, dx, dy, distance, obstacles) {
        const fighter = this.fighter;
        const config = this.config;
        if (!fighter || !config) return;

        this._strafePhase += dt * randBetween(config.strafePhaseSpeedMin, config.strafePhaseSpeedMax);
        this._strafeSwitchTimer -= dt;
        if (this._strafeSwitchTimer <= 0) {
            this._strafeSwitchTimer = Math.max(0.2, randBetween(config.strafeSwitchMin, config.strafeSwitchMax));
            this._strafePhase += Math.PI;
        }

        const rx = dx / distance;
        const ry = dy / distance;

        let radial = 0;
        if (distance > config.idealDistance + config.distanceBand) {
            radial = 1;
        } else if (distance < config.idealDistance - config.distanceBand) {
            radial = -1;
        }

        const strafeDir = Math.sign(Math.sin(this._strafePhase)) || 1;
        const perpX = -ry * strafeDir;
        const perpY = rx * strafeDir;

        const distFactor = Math.max(0, 1 - Math.abs(distance - config.idealDistance) / config.idealDistance);
        const strafeAmp = lerp(config.strafeAmpMin, config.strafeAmpMax, distFactor);

        let moveX = radial * rx + perpX * strafeAmp;
        let moveY = radial * ry + perpY * strafeAmp;

        if (config.moveNoise) {
            moveX += (Math.random() - 0.5) * config.moveNoise;
            moveY += (Math.random() - 0.5) * config.moveNoise;
        }

        const avoidStrength = config.obstacleAvoidStrength || 0;
        if (avoidStrength > 0 && Array.isArray(obstacles)) {
            for (const obstacle of obstacles) {
                if (!obstacle || obstacle.destroyed) continue;
                const ox = obstacle.x + obstacle.w / 2;
                const oy = obstacle.y + obstacle.h / 2;
                const distToObstacle = dist(fighter.x, fighter.y, ox, oy);
                if (!Number.isFinite(distToObstacle) || distToObstacle <= 1) continue;
                const avoidRadius = Math.max(110, config.idealDistance * 0.45);
                if (distToObstacle < avoidRadius) {
                    const strength = (avoidRadius - distToObstacle) / avoidRadius;
                    moveX -= ((ox - fighter.x) / distToObstacle) * strength * avoidStrength;
                    moveY -= ((oy - fighter.y) / distToObstacle) * strength * avoidStrength;
                }
            }
        }

        const mag = Math.hypot(moveX, moveY);
        if (mag > 0.0001) {
            moveX /= mag;
            moveY /= mag;
        }

        fighter.keys = {
            w: moveY < -0.28,
            s: moveY > 0.28,
            a: moveX < -0.28,
            d: moveX > 0.28
        };
    }

    _updateAim(dt, distance) {
        const config = this.config;
        const target = this.target;
        if (!target || !config) return;

        const jitter = config.aimJitter || 0;
        const jitterX = jitter ? (Math.random() - 0.5) * jitter : 0;
        const jitterY = jitter ? (Math.random() - 0.5) * jitter : 0;

        const newAimX = target.x + jitterX;
        const newAimY = target.y + jitterY;

        if (!Number.isFinite(this._aimX) || !Number.isFinite(this._aimY)) {
            this._aimX = newAimX;
            this._aimY = newAimY;
            return;
        }

        const smoothing = Math.max(0, Math.min(0.95, config.aimSmoothing || 0));
        const blend = 1 - Math.pow(smoothing, Math.max(0, dt * 60));
        this._aimX = lerp(this._aimX, newAimX, blend);
        this._aimY = lerp(this._aimY, newAimY, blend);
    }

    _shouldShoot(dt, distance, obstacles) {
        const fighter = this.fighter;
        const target = this.target;
        const config = this.config;
        if (!fighter || !target || !config) return false;

        const inRange = distance > config.shootMinDistance && distance < config.shootMaxDistance;
        if (!inRange) return false;

        const canBypassBlock = fighter.pierce || fighter.obliterator;
        let hasSight = hasLineOfSight(fighter, target, obstacles || []);

        if (!hasSight && config.lineOfSightTolerance > 0) {
            const tolerance = Math.max(0, config.lineOfSightTolerance);
            const dirX = target.x - fighter.x;
            const dirY = target.y - fighter.y;
            const len = Math.hypot(dirX, dirY) || 1;
            const sample = {
                x: fighter.x + (dirX / len) * Math.max(0, len - tolerance),
                y: fighter.y + (dirY / len) * Math.max(0, len - tolerance)
            };
            hasSight = hasLineOfSight(fighter, sample, obstacles || []);
            if (hasSight) {
                this._lineOfSightHold = 0.14;
            }
        } else if (hasSight && config.lineOfSightTolerance > 0) {
            this._lineOfSightHold = 0.12;
        } else if (!hasSight) {
            this._lineOfSightHold = 0;
        }

        if (!hasSight && this._lineOfSightHold > 0) {
            this._lineOfSightHold = Math.max(0, this._lineOfSightHold - dt);
            hasSight = this._lineOfSightHold > 0;
        }

        if (!hasSight && !canBypassBlock) {
            return false;
        }

        const intervalScale = Math.max(0.1, config.shootIntervalScale || 1);
        const requiredInterval = fighter.shootInterval * intervalScale;
        return fighter.timeSinceShot >= requiredInterval;
    }

    _shouldDash(dt, distance) {
        const fighter = this.fighter;
        const config = this.config;
        if (!fighter || !config) return false;

        if (!fighter.dash || fighter.dashActive) return false;

        if (this._dashDelayTimer > 0) {
            this._dashDelayTimer -= dt;
            return false;
        }

        const scale = config.dashCooldownScale || 1;
        let cooldownReady = fighter.dashCooldown <= 0;
        if (scale < 1 && Number.isFinite(fighter.dashCooldownMax)) {
            const threshold = Math.max(0, fighter.dashCooldownMax * (1 - scale));
            cooldownReady = fighter.dashCooldown <= threshold;
        }

        if (!cooldownReady) {
            return false;
        }

        const withinRange = distance >= (config.dashDistanceMin || 0) && distance <= (config.dashDistanceMax || Infinity);
        if (!withinRange) {
            return false;
        }

        const chance = Math.max(0, Math.min(0.25, config.dashChance || 0));
        if (chance <= 0) return false;

        if (Math.random() < chance) {
            if (scale > 1) {
                this._dashDelayTimer = (scale - 1) * 0.9;
            } else {
                this._dashDelayTimer = 0.15;
            }
            return true;
        }

        return false;
    }

    _clearInputs() {
        if (this.fighter) {
            this.fighter.keys = { w: false, s: false, a: false, d: false };
            this.fighter.shootRequested = false;
            this.fighter.dashRequested = false;
        }
    }

    _resetStrafeState(preservePhase = false) {
        if (!preservePhase) {
            this._strafePhase = Math.random() * Math.PI * 2;
        }
        const config = this.config || resolveDifficultyConfig(this.difficultyKey);
        if (config) {
            this._strafeSwitchTimer = randBetween(config.strafeSwitchMin, config.strafeSwitchMax);
        } else {
            this._strafeSwitchTimer = 1.2;
        }
    }

    /**
     * Bot card selection - picks randomly (matches original behavior)
     */
    selectCard(availableCards) {
        if (!availableCards || availableCards.length === 0) return null;
        return availableCards[Math.floor(Math.random() * availableCards.length)].name;
    }

    /**
     * Bot world modifier selection - picks randomly (matches original behavior)
     */
    selectWorldModifier(availableModifiers) {
        if (!availableModifiers || availableModifiers.length === 0) return null;
        return availableModifiers[Math.floor(Math.random() * availableModifiers.length)].name;
    }
}

// Export to window
if (typeof window !== 'undefined') {
    window.FighterAI = FighterAI;
}
