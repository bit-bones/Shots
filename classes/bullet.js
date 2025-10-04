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
            this.pierce = owner.pierce || false;
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
        }
        update(dt) {
            // If Shot Controller is active and playerControlActive, steer toward cursor
            if (this.shotController && this.playerControlActive && this.isLocalPlayerBullet && typeof window !== 'undefined' && window.mouse) {
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
            this.x += Math.cos(this.angle) * this.speed * dt;
            this.y += Math.sin(this.angle) * this.speed * dt;
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