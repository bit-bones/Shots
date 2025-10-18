;(function(root) {
	const globalObj = root || (typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));

    // --- Bullet Class ---
    class Bullet {
        static nextId = 1;
        constructor(owner, x, y, angle) {
            this.id = Bullet.nextId++;
            this.owner = owner;
            this.x = x;
            this.y = y;
            this.radius = owner.bulletRadius;
            this.speed = owner.bulletSpeed;
            this.angle = angle;
            this.damage = owner.bulletDamage;
            // Max travel distance in pixels (can be modified by powerups on owner)
            this.range = (typeof owner.bulletRange === 'number') ? owner.bulletRange : (typeof window !== 'undefined' && typeof window.BULLET_RANGE === 'number' ? window.BULLET_RANGE : 1200);
            this.distanceTraveled = 0;
            this.pierce = owner.pierce || false;
            this.pierceStacks = owner.pierceStacks || 0;
            this.pierceLimit = this.pierce ? (30 + this.pierceStacks) : 0;
            this.obliterator = owner.obliterator || false;
            this.obliteratorStacks = owner.obliteratorStacks || 0;
            this.explosive = owner.explosive || false;
            // Carry explosive stacks so explosions can scale per-stack
            this.explosiveStacks = owner.explosiveStacks || 0;
            this.bouncesLeft = owner.ricochet || 0;
            this.active = true;
            // Fireshot support
            this.fireshot = owner.fireshot || false;
            this.fireshotStacks = owner.fireshotStacks || 0;
            // Shot Controller support
            this.shotController = owner.shotController || false;
            this.playerControlActive = this.shotController ? true : false;
            // Delay (seconds) before shot-controller homing begins so spread formation is visible
            this.homingDelay = (typeof owner.shotControllerHomingDelay === 'number') ? owner.shotControllerHomingDelay : 0.12;
            this.isLocalPlayerBullet = false; // Set by main.js based on network role
            // Stable ID for host-authoritative snapshots (assigned on host when fired)
            this.id = null;
            // Trailing effect: store previous positions
            this.trail = [];
            // Trail length and visibility: length primarily based on speed but now also increases with damage.
            // Keep values clamped so extremely fast or high-damage bullets don't create huge trails.
            const speedBased = Math.round(this.speed / 85); // slightly stronger speed influence (smaller divisor => longer)
            const damageBased = Math.round(Math.min(6, (this.damage || 0) * 0.6)); // modest contribution from damage, capped
            this.trailMax = Math.max(2, Math.min(18, speedBased + damageBased));
            // Trail size: keep a small base but scale more strongly with damage for intensity effects
            this.trailSizeScale = Math.max(0.08, Math.min(4.0, 0.10 + (this.damage || 0) * 0.09));
            // Trail alpha: very faint by default, scale with damage but slightly reduced sensitivity
            this.trailAlphaScale = Math.max(0.02, Math.min(3.0, 0.03 + (this.damage || 0) * 0.06));
        }
        update(dt) {
            // If Shot Controller is active and playerControlActive, steer toward cursor.
            // Allow steering in single-player (NET not connected) even if isLocalPlayerBullet
            // wasn't explicitly set. In multiplayer, require the bullet to be flagged
            // as local (`isLocalPlayerBullet`) to avoid joiner simulating host bullets.
            const netAvailable = (typeof NET !== 'undefined' && NET && NET.connected);
            const allowLocalSteer = !netAvailable || this.isLocalPlayerBullet;
            if (this.shotController && this.playerControlActive && allowLocalSteer && typeof window !== 'undefined' && window.mouse) {
                // Count down homing delay first so bullets maintain initial spread for a short time
                if (this.homingDelay > 0) {
                    this.homingDelay -= dt;
                } else {
                let dx = window.mouse.x - this.x;
                let dy = window.mouse.y - this.y;
                let distToCursor = Math.hypot(dx, dy);
                if (distToCursor > 2) {
                    let steerAngle = Math.atan2(dy, dx);
                    // Smoothly steer toward cursor (limit turn rate for control)
                    let turnRate = 0.13; // radians per frame
                    let da = steerAngle - this.angle;
                    // Wrap angle to [-PI, PI]
                    while (da > Math.PI) da -= 2 * Math.PI;
                    while (da < -Math.PI) da += 2 * Math.PI;
                    if (Math.abs(da) > turnRate) {
                        this.angle += turnRate * Math.sign(da);
                    } else {
                        this.angle = steerAngle;
                    }
                }
                }
            }
            const dx = Math.cos(this.angle) * this.speed * dt;
            const dy = Math.sin(this.angle) * this.speed * dt;
            this.x += dx;
            this.y += dy;
            // Store trail positions
            this.trail.push({x: this.x, y: this.y});
            if (this.trail.length > this.trailMax) this.trail.shift();
            // Track traveled distance and expire when exceeding range
            this.distanceTraveled += Math.hypot(dx, dy);
                if (typeof this.range === 'number' && this.distanceTraveled >= this.range) {
                    // bullets expire when they reach max range (do not explode automatically)
                    this.active = false;
                    return;
                }
                // If pierce limit reached, and bullet is inside obstacle, expire silently
                if (this.pierce && typeof this.pierceLimit === 'number' && this.pierceLimit <= 0 && this.insideObstacle) {
                    // No explosion, impact, or sound
                    this.active = false;
                    return;
                }
            if (MAP_BORDER) {
                let bounced = false;
                if (this.x - this.radius < 0) {
                    if ((this.bouncesLeft|0) > 0) {
                        this.bouncesLeft = Math.max(0, this.bouncesLeft - 1);
                        this.x = this.radius + 2;
                        this.angle = Math.PI - this.angle;
                        bounced = true;
                        try { playRicochet(); } catch (e) {}
                    } else {
                        if (this.explosive) {
                            try { if (typeof triggerExplosion === 'function') triggerExplosion(this, this.radius + 2, this.y); } catch (e) {}
                        }
                        try {
                            if (typeof globalObj.createImpactLines === 'function') {
                                // normal for left wall points to the right (1,0)
                                globalObj.createImpactLines(this.x, this.y, this.damage || 1, (this.owner && this.owner.color) ? this.owner.color : '#ffffff', 0);
                                try { if (typeof globalObj.playImpact === 'function') globalObj.playImpact(this.damage || 1); } catch (e) {}
                                try { if (typeof globalObj.createSyncedImpact === 'function' && typeof NET !== 'undefined' && NET && NET.role === 'host') globalObj.createSyncedImpact(this.x, this.y, this.damage || 1, (this.owner && this.owner.color) ? this.owner.color : '#ffffff', 0); } catch (e) {}
                            }
                        } catch (e) {}
                        this.active = false;
                    }
                }
                if (this.x + this.radius > CANVAS_W) {
                    if ((this.bouncesLeft|0) > 0) {
                        this.bouncesLeft = Math.max(0, this.bouncesLeft - 1);
                        this.x = CANVAS_W - this.radius - 2;
                        this.angle = Math.PI - this.angle;
                        bounced = true;
                        try { playRicochet(); } catch (e) {}
                    } else {
                        if (this.explosive) {
                            try { if (typeof triggerExplosion === 'function') triggerExplosion(this, CANVAS_W - this.radius - 2, this.y); } catch (e) {}
                        }
                        try {
                            if (typeof globalObj.createImpactLines === 'function') {
                                // normal for right wall points to the left (-1,0)
                                globalObj.createImpactLines(this.x, this.y, this.damage || 1, (this.owner && this.owner.color) ? this.owner.color : '#ffffff', Math.PI);
                                try { if (typeof globalObj.playImpact === 'function') globalObj.playImpact(this.damage || 1); } catch (e) {}
                                try { if (typeof globalObj.createSyncedImpact === 'function' && typeof NET !== 'undefined' && NET && NET.role === 'host') globalObj.createSyncedImpact(this.x, this.y, this.damage || 1, (this.owner && this.owner.color) ? this.owner.color : '#ffffff', Math.PI); } catch (e) {}
                            }
                        } catch (e) {}
                        this.active = false;
                    }
                }
                if (this.y - this.radius < 0) {
                    if ((this.bouncesLeft|0) > 0) {
                        this.bouncesLeft = Math.max(0, this.bouncesLeft - 1);
                        this.y = this.radius + 2;
                        this.angle = -this.angle;
                        bounced = true;
                        try { playRicochet(); } catch (e) {}
                    } else {
                        if (this.explosive) {
                            try { if (typeof triggerExplosion === 'function') triggerExplosion(this, this.x, this.radius + 2); } catch (e) {}
                        }
                        try {
                            if (typeof globalObj.createImpactLines === 'function') {
                                // normal for top wall points down (0,1)
                                globalObj.createImpactLines(this.x, this.y, this.damage || 1, (this.owner && this.owner.color) ? this.owner.color : '#ffffff', Math.PI/2);
                                try { if (typeof globalObj.playImpact === 'function') globalObj.playImpact(this.damage || 1); } catch (e) {}
                                try { if (typeof globalObj.createSyncedImpact === 'function' && typeof NET !== 'undefined' && NET && NET.role === 'host') globalObj.createSyncedImpact(this.x, this.y, this.damage || 1, (this.owner && this.owner.color) ? this.owner.color : '#ffffff', Math.PI/2); } catch (e) {}
                            }
                        } catch (e) {}
                        this.active = false;
                    }
                }
                if (this.y + this.radius > CANVAS_H) {
                    if ((this.bouncesLeft|0) > 0) {
                        this.bouncesLeft = Math.max(0, this.bouncesLeft - 1);
                        this.y = CANVAS_H - this.radius - 2;
                        this.angle = -this.angle;
                        bounced = true;
                        try { playRicochet(); } catch (e) {}
                    } else {
                        if (this.explosive) {
                            try { if (typeof triggerExplosion === 'function') triggerExplosion(this, this.x, CANVAS_H - this.radius - 2); } catch (e) {}
                        }
                        try {
                            if (typeof globalObj.createImpactLines === 'function') {
                                // normal for bottom wall points up (0,-1)
                                globalObj.createImpactLines(this.x, this.y, this.damage || 1, (this.owner && this.owner.color) ? this.owner.color : '#ffffff', -Math.PI/2);
                                try { if (typeof globalObj.playImpact === 'function') globalObj.playImpact(this.damage || 1); } catch (e) {}
                                try { if (typeof globalObj.createSyncedImpact === 'function' && typeof NET !== 'undefined' && NET && NET.role === 'host') globalObj.createSyncedImpact(this.x, this.y, this.damage || 1, (this.owner && this.owner.color) ? this.owner.color : '#ffffff', -Math.PI/2); } catch (e) {}
                            }
                        } catch (e) {}
                        this.active = false;
                    }
                }
                // If ricochet occurred and Shot Controller is active, disable player control after first bounce
                if (bounced && this.shotController && this.playerControlActive) {
                    this.playerControlActive = false;
                }
                // Defensive: if bouncesLeft < (owner.ricochet || 0), disable control (covers all bounce cases)
                if (this.shotController && this.owner.ricochet && this.bouncesLeft < (this.owner.ricochet || 0)) {
                    this.playerControlActive = false;
                }
            } else {
                if(this.x < -30 || this.x > CANVAS_W+30 || this.y < -30 || this.y > CANVAS_H+30) this.active = false;
            }
        }
    }

	globalObj.Bullet = Bullet;
	try {
		if (typeof module !== 'undefined' && module.exports) {
			module.exports = Bullet;
		}
	} catch (e) {}
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));