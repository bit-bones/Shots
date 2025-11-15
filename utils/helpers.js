// Helper functions

/**
 * Calculate dash settings based on fighter or cards array
 * @param {Object|Array} fighterOrCards - Fighter instance or cards array
 * @returns {Object} Dash settings (speedMult, dist, cooldown, duration, ramDamage)
 */
function getDashSettings(fighterOrCards) {
    const fighter = Array.isArray(fighterOrCards)
        ? { cards: fighterOrCards }
        : fighterOrCards;

    const speed = fighter && typeof fighter.speed === 'number' ? fighter.speed : FIGHTER_SPEED;
    const rangeMult = fighter && typeof fighter.dashRangeMult === 'number' ? fighter.dashRangeMult : 1;
    const speedMult = fighter && typeof fighter.dashSpeedMult === 'number' ? fighter.dashSpeedMult : 1;
    const cooldownMult = fighter && typeof fighter.dashCooldownMult === 'number' ? fighter.dashCooldownMult : 1;
    const ramStacks = fighter && typeof fighter.ramStacks === 'number' ? fighter.ramStacks : 0;

    const effectiveSpeedMult = DASH_BASE_SPEED_MULT * speedMult;
    const distance = DASH_BASE_DIST * rangeMult;
    const cooldown = Math.max(0.35, DASH_BASE_COOLDOWN * cooldownMult);
    const dashSpeed = speed * effectiveSpeedMult;
    const duration = distance / Math.max(1, dashSpeed);
    const ramDamage = ramStacks > 0 ? 18 + ramStacks * 6 : 0;

    return {
        speedMult: effectiveSpeedMult,
        dist: distance,
        cooldown,
        duration,
        ramDamage
    };
}

function isTeledashEnabled(fighter) {
    return !!(fighter && fighter.teledash);
}

function isTeleportSpotFree(x, y, radius, obstacles = [], others = [], infestedChunks = [], self = null) {
    if (x < radius || y < radius || x > CANVAS_W - radius || y > CANVAS_H - radius) return false;

    for (const obstacle of obstacles) {
        if (!obstacle || obstacle.destroyed) continue;
        if (typeof obstacle.circleCollide === 'function' && obstacle.circleCollide(x, y, radius)) {
            return false;
        }
    }

    if (Array.isArray(infestedChunks)) {
        for (const chunk of infestedChunks) {
            if (!chunk || !chunk.active) continue;
            const cx = chunk.x + chunk.w / 2;
            const cy = chunk.y + chunk.h / 2;
            const threshold = Math.max(chunk.w, chunk.h) * 0.5 + radius;
            if (dist(x, y, cx, cy) < threshold) {
                return false;
            }
        }
    }

    for (const other of others) {
        if (!other || other === null || other === undefined) continue;
        if (self && other === self) continue;
        if (typeof other.x !== 'number' || typeof other.y !== 'number') continue;
        const otherRadius = typeof other.radius === 'number' ? other.radius : 0;
        if (dist(x, y, other.x, other.y) < radius + otherRadius) {
            return false;
        }
    }

    return true;
}

function computeTeledashDestination(fighter, dashSettings, aimPoint, context = {}) {
    if (!fighter) {
        return { x: 0, y: 0 };
    }

    const origin = fighter.teledashOrigin || { x: fighter.x, y: fighter.y };
    const aim = (aimPoint && typeof aimPoint.x === 'number' && typeof aimPoint.y === 'number')
        ? aimPoint
        : { x: origin.x + Math.cos(fighter.dashAngle || 0) * (dashSettings ? dashSettings.dist : fighter.radius), y: origin.y + Math.sin(fighter.dashAngle || 0) * (dashSettings ? dashSettings.dist : fighter.radius) };

    let dx = aim.x - origin.x;
    let dy = aim.y - origin.y;
    let len = Math.hypot(dx, dy);
    if (!len || len === 0) {
        dx = Math.cos(fighter.dashAngle || 0);
        dy = Math.sin(fighter.dashAngle || 0);
        len = Math.hypot(dx, dy) || 1;
    }

    const maxDist = dashSettings ? dashSettings.dist : DASH_BASE_DIST;
    const scale = Math.min(1, maxDist / len);
    const targetX = clamp(origin.x + dx * scale, fighter.radius, CANVAS_W - fighter.radius);
    const targetY = clamp(origin.y + dy * scale, fighter.radius, CANVAS_H - fighter.radius);

    const obstacles = Array.isArray(context.obstacles) ? context.obstacles : [];
    const others = Array.isArray(context.others) ? context.others : [];
    const infestedList = Array.isArray(context.infestedChunks) ? context.infestedChunks : [];

    if (isTeleportSpotFree(targetX, targetY, fighter.radius, obstacles, others, infestedList, fighter)) {
        return { x: targetX, y: targetY };
    }

    const steps = Math.max(6, Math.ceil(maxDist / Math.max(12, fighter.radius * 0.8)));
    let fallbackX = origin.x;
    let fallbackY = origin.y;
    for (let i = steps - 1; i >= 0; i--) {
        const t = i / steps;
        const candidateX = lerp(origin.x, targetX, t);
        const candidateY = lerp(origin.y, targetY, t);
        if (isTeleportSpotFree(candidateX, candidateY, fighter.radius, obstacles, others, infestedList, fighter)) {
            fallbackX = candidateX;
            fallbackY = candidateY;
            break;
        }
    }

    return { x: fallbackX, y: fallbackY };
}

/**
 * Check if there's line of sight between two entities
 * @param {Object} from - Start entity (with x, y properties)
 * @param {Object} to - End entity (with x, y properties)
 * @param {Array} obstacles - Array of obstacles
 * @returns {boolean} True if line of sight exists
 */
function hasLineOfSight(from, to, obstacles) {
    if (!obstacles || obstacles.length === 0) return true;
    
    let steps = 14;
    for (let i = 0; i <= steps; ++i) {
        let t = i / steps;
        let x = lerp(from.x, to.x, t);
        let y = lerp(from.y, to.y, t);
        for (let o of obstacles) {
            if (o.destroyed) continue;
            if (o.circleCollide(x, y, 8)) return false;
        }
    }
    return true;
}

// Export to window
if (typeof window !== 'undefined') {
    window.getDashSettings = getDashSettings;
    window.hasLineOfSight = hasLineOfSight;
    window.isTeledashEnabled = isTeledashEnabled;
    window.isTeleportSpotFree = isTeleportSpotFree;
    window.computeTeledashDestination = computeTeledashDestination;
}
