/**
 * Firestorm - Circular expanding fire zone (matches original game)
 */
class Firestorm {
    constructor(x, y, radius) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.state = 'active'; // 'active' or 'fading'
        this.life = 0;
        this.fadeTime = 1.2; // seconds to fade out
        this.maxLife = 6.5 + Math.random() * 2.5; // how long the firestorm lasts before auto-fading
        this.done = false;
        this.burningEntities = new Set();
        this.id = `firestorm_${Firestorm._nextId++}`;

        // Visuals
        this.time = 0;
        this.duration = this.maxLife;
        this.maxRadius = this.radius;
        this.particles = [];
        this.particleTimer = 0;
    }

    update(dt, obstacles, fighters, healers = [], infestedChunks = []) {
        this.life += dt;
        this.time += dt;

        // If fading, count down fade
        if (this.state === 'fading') {
            this.fadeTime -= dt;
            if (this.fadeTime <= 0) this.done = true;
        } else if (this.life >= this.maxLife) {
            this.state = 'fading';
        }

        // Damage and ignite fighters and healers
        const applyIgniteToEntity = (entity) => {
            if (!entity || entity.health <= 0) return;
            const d = Math.hypot(entity.x - this.x, entity.y - this.y);
            if (d < this.radius + entity.radius) {
                if (!entity.burning) {
                    const duration = 3 + Math.random() * 1.5;
                    entity.burning = { time: 0, duration, nextTick: 0.45 + Math.random() * 0.2 };
                    Firestorm._playBurningSound(duration);
                }
            }
        };

        for (let fighter of fighters) applyIgniteToEntity(fighter);
        for (let healer of healers) applyIgniteToEntity(healer);

        // Damage and ignite infested chunks
        for (let chunk of infestedChunks) {
            if (!chunk.active) continue;
            const cx = chunk.x + chunk.w / 2;
            const cy = chunk.y + chunk.h / 2;
            const d = Math.hypot(cx - this.x, cy - this.y);
            if (d < this.radius + Math.max(chunk.w, chunk.h) / 2) {
                if (!chunk.burning) {
                    const duration = 2.5 + Math.random() * 1.5;
                    chunk.burning = { time: 0, duration, power: 1, nextTick: 0.44 + Math.random() * 0.22 };
                    Firestorm._playBurningSound(duration);
                }
            }
        }

        // Damage and ignite obstacle chunks
        for (let obstacle of obstacles) {
            if (obstacle.destroyed) continue;
            for (let chunk of obstacle.chunks) {
                if (chunk.destroyed) continue;
                const cx = chunk.x + chunk.w / 2;
                const cy = chunk.y + chunk.h / 2;
                const d = Math.hypot(cx - this.x, cy - this.y);
                if (d < this.radius + Math.max(chunk.w, chunk.h) / 2) {
                    if (!chunk.burning) {
                        const duration = 2.5 + Math.random() * 1.5;
                        chunk.burning = { time: 0, duration, power: 1, nextTick: 0.44 + Math.random() * 0.22 };
                        Firestorm._playBurningSound(duration);
                    }
                }
            }
        }

        // Spread burning to nearby chunks
        let spreadChecks = 0;
        let newIgnited = 0;
        const MAX_SPREAD_CHECKS = 1200;
        const MAX_NEW_IGNITED = 10;
        for (let obstacle of obstacles) {
            if (!obstacle || obstacle.destroyed) continue;
            for (let chunk of obstacle.chunks) {
                if (!chunk || !chunk.burning || chunk.burning.time <= 0.5 || chunk.destroyed) continue;
                // Try to ignite nearby chunks
                for (let o2 of obstacles) {
                    if (!o2 || o2.destroyed) continue;
                    for (let c2 of o2.chunks) {
                        if (!c2 || c2.burning || c2.destroyed) continue;
                        spreadChecks++;
                        if (spreadChecks > MAX_SPREAD_CHECKS) break;
                        const d = Math.hypot(
                            chunk.x + chunk.w / 2 - (c2.x + c2.w / 2),
                            chunk.y + chunk.h / 2 - (c2.y + c2.h / 2)
                        );
                        if (d < Math.max(chunk.w, chunk.h) * 1.2) {
                            if (newIgnited < MAX_NEW_IGNITED && Math.random() < 0.08 * dt) {
                                const duration = 2 + Math.random() * 1.5;
                                c2.burning = { time: 0, duration, power: 1, nextTick: 0.44 + Math.random() * 0.22 };
                                Firestorm._playBurningSound(duration);
                                newIgnited++;
                            }
                        }
                    }
                    if (spreadChecks > MAX_SPREAD_CHECKS || newIgnited >= MAX_NEW_IGNITED) break;
                }
                if (spreadChecks > MAX_SPREAD_CHECKS || newIgnited >= MAX_NEW_IGNITED) break;
            }
            if (spreadChecks > MAX_SPREAD_CHECKS || newIgnited >= MAX_NEW_IGNITED) break;
        }

        // Spread burning to fighters if near burning chunk
        let playerSpreadChecks = 0;
        const MAX_PLAYER_SPREAD_CHECKS = 600;
        for (let obstacle of obstacles) {
            if (!obstacle || !obstacle.chunks) continue;
            for (let chunk of obstacle.chunks) {
                if (playerSpreadChecks++ > MAX_PLAYER_SPREAD_CHECKS) break;
                if (chunk && chunk.burning && !chunk.destroyed) {
                        for (let fighter of fighters) {
                        if (!fighter || fighter.health <= 0) continue;
                        const d = Math.hypot(
                            fighter.x - (chunk.x + chunk.w / 2),
                            fighter.y - (chunk.y + chunk.h / 2)
                        );
                        if (d < 32 + fighter.radius) {
                            if (!fighter.burning) {
                                const duration = 2.5 + Math.random() * 1.5;
                                fighter.burning = { time: 0, duration, nextTick: 0.45 + Math.random() * 0.2 };
                                Firestorm._playBurningSound(duration);
                            }
                        }
                    }
                    for (let healer of healers) {
                        if (!healer || healer.health <= 0) continue;
                        const d2 = Math.hypot(
                            healer.x - (chunk.x + chunk.w / 2),
                            healer.y - (chunk.y + chunk.h / 2)
                        );
                        if (d2 < 32 + healer.radius) {
                            if (!healer.burning) {
                                const duration = 2.5 + Math.random() * 1.5;
                                healer.burning = { time: 0, duration, nextTick: 0.45 + Math.random() * 0.2 };
                                Firestorm._playBurningSound(duration);
                            }
                        }
                    }
                }
            }
            if (playerSpreadChecks > MAX_PLAYER_SPREAD_CHECKS) break;
        }

        // Generate fire particles
        this.particleTimer += dt;
        if (this.particleTimer > 0.02) {
            this.particleTimer = 0;
            for (let i = 0; i < 3; i++) {
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * this.maxRadius * 0.8;
                const px = this.x + Math.cos(angle) * distance;
                const py = this.y + Math.sin(angle) * distance;
                this.particles.push({
                    x: px,
                    y: py,
                    vx: (Math.random() - 0.5) * 40,
                    vy: -Math.random() * 80 - 20, // upward
                    life: 0.6 + Math.random() * 0.8,
                    maxLife: 0.6 + Math.random() * 0.8,
                    size: 2 + Math.random() * 3
                });
            }
        }

        // Update particles
        for (let p of this.particles) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 30 * dt; // light gravity
            p.life -= dt;
        }
        this.particles = this.particles.filter(p => p.life > 0);
    }

    draw(ctx) {
        // Fade-out logic for alpha
        let t = this.time / this.duration;
        let alpha = 1;
        if (this.state === 'fading' || t > 0.8) {
            alpha = (this.state === 'fading') ?
                (this.fadeTime / 1.2) :
                ((1 - t) / 0.2);
        }

        const animTime = this.time * 2;
        const outerRadius = this.maxRadius * (0.8 + 0.2 * Math.sin(animTime));
        const innerRadius = outerRadius * 0.4;

        ctx.save();

        // Draw particles first (background)
        for (let p of this.particles) {
            const pa = (p.life / p.maxLife) * alpha * 0.8;
            ctx.globalAlpha = pa;
            const lifeRatio = p.life / p.maxLife;
            if (lifeRatio > 0.6) {
                ctx.fillStyle = '#ffff66'; // bright yellow
            } else if (lifeRatio > 0.3) {
                ctx.fillStyle = '#ffaa00'; // orange
            } else {
                ctx.fillStyle = '#ff3300'; // red
            }
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw outer glow
        ctx.globalAlpha = alpha * 0.3;
        let gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, outerRadius * 1.5);
        gradient.addColorStop(0, '#ff6600');
        gradient.addColorStop(0.5, '#ff3300');
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, outerRadius * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Draw main fire area with animated flicker
        ctx.globalAlpha = alpha * (0.7 + 0.3 * Math.sin(animTime * 4));
        gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, outerRadius);
        gradient.addColorStop(0, '#ffaa00');
        gradient.addColorStop(0.4, '#ff6600');
        gradient.addColorStop(0.8, '#ff3300');
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, outerRadius, 0, Math.PI * 2);
        ctx.fill();

        // Draw hot core
        ctx.globalAlpha = alpha * (0.8 + 0.2 * Math.sin(animTime * 6));
        gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, innerRadius);
        gradient.addColorStop(0, '#ffff66');
        gradient.addColorStop(0.6, '#ffaa00');
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, innerRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

Firestorm._nextId = 1;

Firestorm._audioManager = null;

Firestorm.setAudioManager = function(audioManager) {
    Firestorm._audioManager = audioManager;
};

Firestorm._playBurningSound = function(duration) {
    if (Firestorm._audioManager && typeof Firestorm._audioManager.playBurning === 'function') {
        Firestorm._audioManager.playBurning(duration);
    }
};

Firestorm.fromState = function(state) {
    if (!state) return null;
    const firestorm = Object.create(Firestorm.prototype);
    Object.assign(firestorm, state);
    firestorm.burningEntities = new Set();
    firestorm.id = state.id || `firestorm_${Firestorm._nextId++}`;
    return firestorm;
};

Firestorm.prototype.serialize = function(options = {}) {
    return {
        id: this.id,
        x: this.x,
        y: this.y,
        radius: this.radius,
        state: this.state,
        life: this.life,
        fadeTime: this.fadeTime,
        maxLife: this.maxLife,
        done: this.done,
        time: this.time,
        maxRadius: this.maxRadius,
        particles: this.particles.map(p => ({
            x: p.x, y: p.y, vx: p.vx, vy: p.vy,
            life: p.life, maxLife: p.maxLife, size: p.size
        }))
    };
};

// Export to window
if (typeof window !== 'undefined') {
    window.Firestorm = Firestorm;
}
