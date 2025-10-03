;(function(root) {
    const globalObj = root || (typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));

    // Explosion class: handles visuals, player/healer damage, and (optionally) chunk chipping/ignition.
    class Explosion {
        static nextId = 1;

        constructor(x, y, radius, color, damage, owner, obliterator, isFireshot) {
            this.id = Explosion.nextId++;
            this.x = x;
            this.y = y;
            this.radius = radius;
            this.maxRadius = radius * (1.15 + Math.random() * 0.12);
            this.life = 0.3 + Math.random() * 0.08;
            this.time = 0;
            this.color = color;
            this.damage = damage;
            this.owner = owner;
            this.done = false;
            this.hasDamaged = false;
            this.obliterator = !!obliterator;
            this.isFireshot = !!isFireshot;
            this.particles = [];

            for (let i = 0; i < EXPLOSION_PARTICLES; ++i) {
                let ang = rand(0, Math.PI * 2);
                let speed = rand(EXPLOSION_PARTICLE_BASE * 0.9, EXPLOSION_PARTICLE_BASE * 1.4) * (radius / EXPLOSION_BASE_RADIUS);
                this.particles.push({
                    x: x, y: y,
                    vx: Math.cos(ang) * speed,
                    vy: Math.sin(ang) * speed,
                    r: rand(radius * 0.13, radius * 0.28),
                    alpha: 1,
                    color: color
                });
            }
        }

        update(dt, obstacles, players, applyDamage = true, healers = []) {
            this.time += dt;
            for (let p of this.particles) {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.alpha -= 2.5 * dt;
                if (p.alpha < 0) p.alpha = 0;
            }

            if (!this.hasDamaged) {
                if (applyDamage) {
                    const playerTargets = Array.isArray(players) ? players : [];
                    for (let p of playerTargets) {
                        if (p !== this.owner && dist(p.x, p.y, this.x, this.y) < this.radius + p.radius) {
                            p._lastAttacker = this.owner;
                            p.takeDamage(this.damage);
                            p._lastAttacker = null;
                            if (this.isFireshot) {
                                let stacks = (this.owner && this.owner.fireshotStacks) ? this.owner.fireshotStacks : 1;
                                p.burning = { time: 0, duration: 1.2 + 1.3 * stacks };
                            }
                        }
                    }

                    const healerTargets = Array.isArray(healers) ? healers : [];
                    for (let h of healerTargets) {
                        if (!h || !h.active) continue;
                        if (dist(h.x, h.y, this.x, this.y) < this.radius + h.radius) {
                            if (h._lastAttacker !== this.owner) h._lastAttacker = this.owner;
                            h.takeDamage(this.damage, this.owner || null);
                            if (this.isFireshot) {
                                let stacks = (this.owner && this.owner.fireshotStacks) ? this.owner.fireshotStacks : 1;
                                h.burning = { time: 0, duration: 1.2 + 1.3 * stacks };
                            }
                            h._lastAttacker = null;
                        }
                    }

                    // Only chip/ignite chunks if explosion was created with obliterator=true
                    if (this.obliterator && Array.isArray(obstacles)) {
                        for (let o of obstacles) {
                            if (!o || o.destroyed) continue;
                            let ownerStacks = (this.owner && this.owner.obliteratorStacks) ? this.owner.obliteratorStacks : 0;
                            let powerMul = 1 + 0.75 * ownerStacks;
                            let explosionPower = (this.damage / 18) * 0.9 * powerMul;
                            let fs = (this.owner && this.owner.fireshotStacks) ? this.owner.fireshotStacks : 0;
                            try {
                                o.chipChunksAt(this.x, this.y, this.radius, explosionPower, this.obliterator, true, fs);
                            } catch (e) {}

                            if (fs > 0) {
                                try {
                                    const dur = 1.2 + 1.3 * fs;
                                    for (const c of o.chunks) {
                                        if (!c || c.destroyed) continue;
                                        const cx = c.x + c.w / 2;
                                        const cy = c.y + c.h / 2;
                                        const d2 = (cx - this.x) * (cx - this.x) + (cy - this.y) * (cy - this.y);
                                        if (d2 <= this.radius * this.radius) {
                                            c.burning = { time: 0, duration: dur };
                                            // Emit burning event for joiner sync
                                            try {
                                                const obsIdx = globalObj.obstacles ? globalObj.obstacles.indexOf(o) : -1;
                                                if (obsIdx >= 0 && typeof globalObj.GameEvents !== 'undefined' && globalObj.GameEvents.emit) {
                                                    const ci = o.chunks.indexOf(c);
                                                    if (ci >= 0) globalObj.GameEvents.emit('burning-start', { obstacleIndex: obsIdx, chunkIndex: ci, duration: dur, power: 1 });
                                                }
                                            } catch (e) {}
                                        }
                                    }
                                } catch (e) {}
                            }
                        }

                        // Ignite infested chunks inside radius
                        try {
                            if (Array.isArray(globalObj.infestedChunks)) {
                                const dur2 = 1.2 + 1.3 * ((this.owner && this.owner.fireshotStacks) ? this.owner.fireshotStacks : 0);
                                for (const ic of globalObj.infestedChunks) {
                                    if (!ic || !ic.active) continue;
                                    const cx = ic.x + ic.w / 2;
                                    const cy = ic.y + ic.h / 2;
                                    const d2 = (cx - this.x) * (cx - this.x) + (cy - this.y) * (cy - this.y);
                                    if (d2 <= this.radius * this.radius) {
                                        ic.burning = { time: 0, duration: dur2 };
                                    }
                                }
                            }
                        } catch (e) {}
                    }
                }

                this.hasDamaged = true;
            }

            if (this.time > this.life) this.done = true;
        }

        draw(ctx) {
            let t = this.time / this.life;
            let r = lerp(this.radius * 0.7, this.maxRadius, t);
            let alpha = lerp(0.32, 0, t) + 0.18;
            ctx.save();
            let grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r);
            grad.addColorStop(0, this.color + "cc");
            grad.addColorStop(0.34, this.color + "77");
            grad.addColorStop(1, "#0000");
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.globalAlpha = 1;
            for (let p of this.particles) {
                if (p.alpha <= 0) continue;
                ctx.globalAlpha = p.alpha * 0.63;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.shadowColor = "#fff";
                ctx.shadowBlur = 16;
                ctx.fill();
                ctx.shadowBlur = 0;
            }
            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }

    globalObj.Explosion = Explosion;
    try {
        if (typeof module !== 'undefined' && module.exports) {
            module.exports = Explosion;
        }
    } catch (e) {}
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));