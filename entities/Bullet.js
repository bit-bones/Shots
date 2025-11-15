/**
 * Bullet - Projectile entity
 */
class Bullet {
    constructor(owner, x, y, angle) {
        this.owner = owner;
        this.x = x;
        this.y = y;
        this.radius = owner.bulletRadius;
        this.speed = owner.bulletSpeed;
        this.angle = angle;
        this.damage = owner.bulletDamage;
        this.pierce = owner.pierce || false;
        this.pierceRemaining = Math.max(0, owner.pierceStacks || 0);
        this.obliterator = owner.obliterator || false;
        this.obliteratorStacks = owner.obliteratorStacks || 0;
        this.explosive = owner.explosive || false;
        this.fireshot = owner.fireshot || false;
        this.fireshotStacks = owner.fireshotStacks || 0;
        this.bouncesLeft = owner.ricochet || 0;
        this.active = true;
        this.id = `bullet_${Bullet._nextId++}`;
        this.maxDistance = owner.bulletRange || BULLET_RANGE;
        this.distanceTraveled = 0;
        this.shotController = !!owner.shotController;
        this.playerControlActive = this.shotController;
        this.homingDelay = this.shotController ? (typeof owner.shotControllerHomingDelay === 'number' ? owner.shotControllerHomingDelay : 0.12) : 0;
        this.justFired = false;
        this.prevX = x;
        this.prevY = y;

        const speedBased = Math.round(this.speed / 85);
        const damageBased = Math.round(Math.min(6, (this.damage || 0) * 0.6));
        this.trailMax = Math.max(2, Math.min(18, speedBased + damageBased));
        this.trail = [];
        this.trailAlphaScale = Math.max(0.02, Math.min(3.0, 0.03 + (this.damage || 0) * 0.06));
        this.trailSizeScale = Math.max(0.08, Math.min(4.0, 0.10 + (this.damage || 0) * 0.09));

        Object.defineProperty(this, 'hitFighters', {
            value: Object.create(null),
            enumerable: false,
            writable: true,
            configurable: false
        });
    }

    update(dt, mapBorder) {
        this.prevX = this.x;
        this.prevY = this.y;

        if (this.shotController && this.playerControlActive) {
            if (!this.owner || !this.owner.alive) {
                this.playerControlActive = false;
            } else if (this.homingDelay > 0) {
                this.homingDelay -= dt;
            } else {
                const aim = this._resolveShotControllerTarget();
                if (aim) {
                    const dx = aim.x - this.x;
                    const dy = aim.y - this.y;
                    const distToAim = Math.hypot(dx, dy);
                    if (distToAim > 2) {
                        let steerAngle = Math.atan2(dy, dx);
                        let da = steerAngle - this.angle;
                        while (da > Math.PI) da -= Math.PI * 2;
                        while (da < -Math.PI) da += Math.PI * 2;
                        const turnRate = 0.13;
                        if (Math.abs(da) > turnRate) {
                            this.angle += turnRate * Math.sign(da);
                        } else {
                            this.angle = steerAngle;
                        }
                    }
                }
            }
        }

        const step = this.speed * dt;
        this.x += Math.cos(this.angle) * step;
        this.y += Math.sin(this.angle) * step;
        this.distanceTraveled += step;
        if (this.distanceTraveled >= this.maxDistance) {
            this.active = false;
        }

        if (this.trail) {
            this.trail.push({ x: this.x, y: this.y });
            if (this.trail.length > (this.trailMax || 0)) {
                this.trail.shift();
            }
        }

        let bounced = false;

        if (mapBorder) {
            // Bounce off borders if ricochet is available
            if (this.x - this.radius < 0) {
                if ((this.bouncesLeft | 0) > 0) {
                    this.bouncesLeft = Math.max(0, this.bouncesLeft - 1);
                    this.x = this.radius + 2;
                    this.angle = Math.PI - this.angle;
                    bounced = true;
                } else {
                    this.active = false;
                }
            }
            if (this.x + this.radius > CANVAS_W) {
                if ((this.bouncesLeft | 0) > 0) {
                    this.bouncesLeft = Math.max(0, this.bouncesLeft - 1);
                    this.x = CANVAS_W - this.radius - 2;
                    this.angle = Math.PI - this.angle;
                    bounced = true;
                } else {
                    this.active = false;
                }
            }
            if (this.y - this.radius < 0) {
                if ((this.bouncesLeft | 0) > 0) {
                    this.bouncesLeft = Math.max(0, this.bouncesLeft - 1);
                    this.y = this.radius + 2;
                    this.angle = -this.angle;
                    bounced = true;
                } else {
                    this.active = false;
                }
            }
            if (this.y + this.radius > CANVAS_H) {
                if ((this.bouncesLeft | 0) > 0) {
                    this.bouncesLeft = Math.max(0, this.bouncesLeft - 1);
                    this.y = CANVAS_H - this.radius - 2;
                    this.angle = -this.angle;
                    bounced = true;
                } else {
                    this.active = false;
                }
            }

            if (bounced) {
                this.prevX = this.x;
                this.prevY = this.y;
            }
        } else {
            // Off-screen deactivation
            if (this.x < -30 || this.x > CANVAS_W + 30 || this.y < -30 || this.y > CANVAS_H + 30) {
                this.active = false;
            }
        }

        if (this.shotController && this.playerControlActive) {
            const originalRicochet = this.owner ? (this.owner.ricochet || 0) : 0;
            if (this.bouncesLeft < originalRicochet) {
                this.playerControlActive = false;
            }
        }

        return bounced;
    }

    draw(ctx) {
        ctx.save();
        ctx.fillStyle = this.owner.color || '#fff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

Bullet._nextId = 1;

Bullet.fromState = function(state, owner) {
    if (!state) return null;

    const bullet = Object.create(Bullet.prototype);
    bullet.owner = owner || (state.ownerColor ? { color: state.ownerColor } : null);
    StateSerializer.applyState(bullet, state, { exclude: ['ownerId', 'ownerColor'] });
    if (!bullet.owner && state.ownerColor) {
        bullet.owner = { color: state.ownerColor };
    }
    bullet.id = state.id || `bullet_${Bullet._nextId++}`;

    if (!bullet.hitFighters || typeof bullet.hitFighters !== 'object') {
        Object.defineProperty(bullet, 'hitFighters', {
            value: Object.create(null),
            enumerable: false,
            writable: true,
            configurable: false
        });
    }
    return bullet;
};

Bullet.prototype.serialize = function() {
    return StateSerializer.serialize(this, {
        force: true,
        exclude: ['owner'],
        augment: {
            ownerId: this.owner && this.owner.id ? this.owner.id : null,
            ownerColor: this.owner && this.owner.color ? this.owner.color : '#ffffff'
        }
    });
};

Bullet.prototype._resolveShotControllerTarget = function() {
    if (!this.owner) return null;
    if (this.owner.aimBotActive && typeof this.owner.getShotAim === 'function') {
        const shotAim = this.owner.getShotAim();
        if (shotAim && typeof shotAim.x === 'number' && typeof shotAim.y === 'number') {
            return shotAim;
        }
    }
    if (typeof this.owner.getCursorAim === 'function') {
        return this.owner.getCursorAim();
    }
    if (typeof this.owner.aimX === 'number' && typeof this.owner.aimY === 'number') {
        return { x: this.owner.aimX, y: this.owner.aimY };
    }
    return null;
};

// Export to window
if (typeof window !== 'undefined') {
    window.Bullet = Bullet;
}
