// Utility functions
window.rand = function(a, b) { return a + Math.random() * (b - a); };
window.randInt = function(a, b) { return Math.floor(window.rand(a, b+1)); };
window.clamp = function(x, a, b) { return Math.max(a, Math.min(b, x)); };
window.dist = function(x1, y1, x2, y2) { return Math.hypot(x2-x1, y2-y1); };
window.lerp = function(a, b, t) { return a + (b - a) * t; };
window.lerpAngle = function(a, b, t) {
    let da = b - a;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    return a + da * t;
};
window.randomChoice = function(arr, n) {
    let cp = [...arr], out = [];
    for(let i = 0; i < n; ++i) out.push(cp.splice(window.randInt(0, cp.length-1), 1)[0]);
    return out;
};
window.getCardByName = function(name) {
    if (!name || typeof name !== 'string') return null;
    const key = name.trim().toLowerCase();
    return window.POWERUPS.find(c => c.name && c.name.toLowerCase() === key) || null;
};

// Dash settings helper (extracted so both update() and drawPlayer() can use it)
window.getDashSettings = function(p) {
    const rangeMult = Math.max(0.05, p.dashRangeMult || 1);
    const speedMult = window.DASH_BASE_SPEED_MULT * Math.max(0.05, p.dashSpeedMult || 1);
    const dist = window.DASH_BASE_DIST * rangeMult;
    // base cooldown uses window.DASH_BASE_COOLDOWN; additional stacks modify multiplicatively
    let baseCooldown = Math.max(0.12, window.DASH_BASE_COOLDOWN);
    // Increase dash cooldown for Big Shot stacks (now controlled by dashCooldownMult from the powerup)
    let cooldown = baseCooldown;
    cooldown *= Math.max(0.05, p.dashCooldownMult || 1);
    let duration = dist / (p.speed * speedMult);
    // Warmup should reflect how quickly the dash charges, not the total travel time.
    // Make warmup inversely related to speed multiplier so increasing range
    // (which increases duration) doesn't unintentionally lengthen the warmup.
    // Ensure a sensible lower bound so warmups remain visible.
    const warmup = Math.max(0.06, 0.28 / Math.max(0.01, speedMult));
    return { speedMult, dist, cooldown, duration, warmup };
};

window.isTeledashEnabled = function(p) {
    return !!(p && p.teledash);
};

window.computeTeledashDestination = function(p, dashSet, aim, blockers = {}) {
    if (!p) return { x: 0, y: 0 };
    const origin = p.teledashOrigin || { x: p.x, y: p.y };
    const aimPoint = aim && typeof aim.x === 'number' && typeof aim.y === 'number'
        ? aim
        : (p.teledashLockedAim || { x: origin.x + p.dashDir.x * dashSet.dist, y: origin.y + p.dashDir.y * dashSet.dist });
    let dx = aimPoint.x - origin.x;
    let dy = aimPoint.y - origin.y;
    let len = Math.hypot(dx, dy);
    if (len === 0) {
        dx = p.dashDir.x || 1;
        dy = p.dashDir.y || 0;
        len = Math.hypot(dx, dy) || 1;
    }
    const maxDist = dashSet.dist;
    const scale = Math.min(1, maxDist / len);
    let targetX = origin.x + dx * scale;
    let targetY = origin.y + dy * scale;
    targetX = window.clamp(targetX, p.radius, window.CANVAS_W - p.radius);
    targetY = window.clamp(targetY, p.radius, window.CANVAS_H - p.radius);
    const obstaclesList = blockers.obstacles || obstacles || [];
    const others = blockers.others || [];
    const steps = Math.max(6, Math.ceil(maxDist / Math.max(12, p.radius * 0.8)));
    let finalX = origin.x;
    let finalY = origin.y;

    if (window.isTeleportSpotFree(targetX, targetY, p.radius, obstaclesList, others)) {
        finalX = targetX;
        finalY = targetY;
    } else {
        for (let i = steps - 1; i >= 0; i--) {
            const t = i / steps;
            const px = window.lerp(origin.x, targetX, t);
            const py = window.lerp(origin.y, targetY, t);
            if (window.isTeleportSpotFree(px, py, p.radius, obstaclesList, others)) {
                finalX = px;
                finalY = py;
                break;
            }
        }
    }
    return { x: finalX, y: finalY };
};

window.isTeleportSpotFree = function(x, y, radius, obstaclesList, others) {
    if (x < radius || x > window.CANVAS_W - radius || y < radius || y > window.CANVAS_H - radius) return false;
    if (Array.isArray(obstaclesList)) {
        for (let o of obstaclesList) {
            if (o && typeof o.circleCollide === 'function' && o.circleCollide(x, y, radius)) return false;
        }
    }
    if (Array.isArray(infestedChunks) && infestedChunks.length) {
        for (let ic of infestedChunks) {
            if (!ic || !ic.active) continue;
            const cx = ic.x + ic.w / 2;
            const cy = ic.y + ic.h / 2;
            const thresh = Math.max(ic.w, ic.h) * 0.5 + radius;
            if (window.dist(x, y, cx, cy) < thresh) return false;
        }
    }
    if (Array.isArray(others)) {
        for (let i = 0; i < others.length; i++) {
            const other = others[i];
            if (!other || other === null) continue;
            if (window.dist(x, y, other.x, other.y) < radius + (other.radius || 0)) return false;
        }
    }
    return true;
};

window.isCircleClear = function(cx, cy, cr) {
    if (cx - cr < 0 || cy - cr < 0 || cx + cr > window.CANVAS_W || cy + cr > window.CANVAS_H) return false;
    for (let o of obstacles) {
        if (!o) continue;
        if (o.circleCollide(cx, cy, cr)) return false;
    }
    return true;
};

window.findNearestClearPosition = function(x0, y0, cr, opts = {}) {
    const maxRadius = opts.maxRadius || 420;
    const step = opts.step || 12;
    const angleStep = opts.angleStep || 0.6;
    if (window.isCircleClear(x0, y0, cr)) return { x: x0, y: y0 };
    for (let r = step; r <= maxRadius; r += step) {
        for (let a = 0; a < Math.PI*2; a += angleStep) {
            let nx = x0 + Math.cos(a) * r;
            let ny = y0 + Math.sin(a) * r;
            if (window.isCircleClear(nx, ny, cr)) return { x: nx, y: ny };
        }
    }
    let candidates = [ {x: x0, y: 60+cr}, {x: x0, y: window.CANVAS_H-60-cr}, {x: 60+cr, y: y0}, {x: window.CANVAS_W-60-cr, y: y0}, {x: window.CANVAS_W/2, y: window.CANVAS_H/2} ];
    for (let c of candidates) if (window.isCircleClear(c.x, c.y, cr)) return c;
    return { x: x0, y: y0 };
};

window.positionPlayersSafely = function() {
    const MIN_SEP = 140;
    let pStart = { x: window.CANVAS_W/3, y: window.CANVAS_H/2 };
    let eStart = { x: 2*window.CANVAS_W/3, y: window.CANVAS_H/2 };
    // If single-player WorldMaster mode with 2 AI, ensure blue AI (player object) spawns on left half
    // and red AI (enemy object) spawns on right half, with good separation and away from corners.
    const isSingleWM2AI = (() => {
        try { return (window.localPlayerIndex === -1 && window.aiCount === 2 && !NET.connected); } catch (e) { return false; }
    })();
    if (isSingleWM2AI) {
        pStart = { x: Math.max(120, window.CANVAS_W * 0.25), y: window.CANVAS_H/2 };
        eStart = { x: Math.min(window.CANVAS_W - 120, window.CANVAS_W * 0.75), y: window.CANVAS_H/2 };
    }
    if (!player) player = new Player(true, (typeof HOST_PLAYER_COLOR !== 'undefined' ? HOST_PLAYER_COLOR : "#65c6ff"), pStart.x, pStart.y);
    if (!enemy) enemy = new Player(false, (typeof getJoinerColor === 'function' ? getJoinerColor(0) : "#ff5a5a"), eStart.x, eStart.y);
    // If enemyDisabled, mark enemy to skip AI/draw but keep object for compatibility
    if (enemyDisabled) enemy.disabled = true; else enemy.disabled = false;
    let pPos = window.findNearestClearPosition(pStart.x, pStart.y, player.radius);
    player.x = pPos.x; player.y = pPos.y;
    let ePos = window.findNearestClearPosition(eStart.x, eStart.y, enemy.radius);
    if (!enemyDisabled && window.dist(ePos.x, ePos.y, player.x, player.y) < MIN_SEP) {
        // Try to find an alternative on the same side first; if WM2AI mode, bias search away horizontally
        let found = false;
        const maxR = 420;
        for (let r = 140; r <= maxR && !found; r += 40) {
            for (let a = 0; a < Math.PI*2 && !found; a += 0.5) {
                let nx = eStart.x + Math.cos(a) * r;
                let ny = eStart.y + Math.sin(a) * r;
                if (!window.isCircleClear(nx, ny, enemy.radius)) continue;
                if (window.dist(nx, ny, player.x, player.y) >= MIN_SEP) {
                    ePos = { x: nx, y: ny };
                    found = true;
                }
            }
        }
    }
    enemy.x = ePos.x; enemy.y = ePos.y;
};