/**
 * Explosion - Visual explosion effect with damage
 */
class Explosion {
    constructor(x, y, radius, color, damage, owner, obliterator, isFireshot = false) {
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
        this.obliterator = obliterator;
        this.isFireshot = !!isFireshot;
        this.particles = [];
        this.id = `explosion_${Explosion._nextId++}`;
        
        // Generate particles
        for (let i = 0; i < EXPLOSION_PARTICLES; ++i) {
            let ang = rand(0, Math.PI * 2);
            let speed = rand(EXPLOSION_PARTICLE_BASE * 0.9, EXPLOSION_PARTICLE_BASE * 1.4) * (radius / EXPLOSION_BASE_RADIUS);
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(ang) * speed,
                vy: Math.sin(ang) * speed,
                r: rand(radius * 0.13, radius * 0.28),
                alpha: 1,
                color: color
            });
        }
    }

    update(dt, obstacles, fighters, healers = [], infestedChunks = [], looseChunks = []) {
        this.time += dt;
        const fireStacks = this.isFireshot ? Math.max(1, (this.owner && this.owner.fireshotStacks) || 1) : 0;
        
        // Update particles
        for (let p of this.particles) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.alpha -= 2.5 * dt;
            if (p.alpha < 0) p.alpha = 0;
        }
        
        // Apply damage once
        if (!this.hasDamaged) {
            // Damage fighters
            for (let f of fighters) {
                if (f !== this.owner && dist(f.x, f.y, this.x, this.y) < this.radius + f.radius) {
                    f._lastAttacker = this.owner;
                    f.takeDamage(this.damage, 'explosion', this.x, this.y);
                    f._lastAttacker = null;
                    if (fireStacks > 0 && typeof f.applyFireShotBurn === 'function') {
                        f.applyFireShotBurn(this.owner, fireStacks);
                    }
                }
            }
            if (Array.isArray(healers)) {
                for (let h of healers) {
                    if (!h || !h.active || h.dying) continue;
                    if (dist(h.x, h.y, this.x, this.y) < this.radius + h.radius) {
                        h._lastAttacker = this.owner;
                        h.takeDamage(this.damage, this.owner);
                        h._lastAttacker = null;
                        if (fireStacks > 0 && typeof h.ignite === 'function') {
                            h.ignite(this.owner, fireStacks);
                        }
                    }
                }
            }
            
            // Damage obstacles
            for (let o of obstacles) {
                if (o.destroyed) continue;
                let ownerStacks = (this.owner && this.owner.obliteratorStacks) ? this.owner.obliteratorStacks : 0;
                let powerMul = 1 + 0.35 * ownerStacks;
                let explosionPower = (this.damage / 18) * 0.6 * powerMul;
                o.chipChunksAt(this.x, this.y, this.radius, explosionPower, this.obliterator, true, fireStacks);

                if (this.obliterator && fireStacks > 0 && Array.isArray(o.chunks)) {
                    const burnDuration = 1.2 + 1.3 * fireStacks;
                    let triggeredAudio = false;
                    for (const c of o.chunks) {
                        if (!c || c.destroyed) continue;
                        const cx = c.x + c.w / 2;
                        const cy = c.y + c.h / 2;
                        const dx = cx - this.x;
                        const dy = cy - this.y;
                        if ((dx * dx + dy * dy) <= this.radius * this.radius) {
                            c.burning = {
                                time: 0,
                                duration: burnDuration,
                                power: fireStacks
                            };
                            if (!Array.isArray(c.flameParticles)) c.flameParticles = [];
                            if (!triggeredAudio && typeof Fighter !== 'undefined' && Fighter._audioManager && typeof Fighter._audioManager.playBurning === 'function') {
                                Fighter._audioManager.playBurning(burnDuration);
                                triggeredAudio = true;
                            }
                        }
                    }
                }
            }

            if (this.obliterator && fireStacks > 0 && Array.isArray(infestedChunks)) {
                const burnDuration = 1.2 + 1.3 * fireStacks;
                let infestedAudioPlayed = false;
                for (const chunk of infestedChunks) {
                    if (!chunk || !chunk.active) continue;
                    const cx = chunk.x + chunk.w / 2;
                    const cy = chunk.y + chunk.h / 2;
                    const dx = cx - this.x;
                    const dy = cy - this.y;
                    if ((dx * dx + dy * dy) <= this.radius * this.radius) {
                        chunk.burning = {
                            time: 0,
                            duration: burnDuration,
                            power: fireStacks
                        };
                        if (!infestedAudioPlayed && typeof Fighter !== 'undefined' && Fighter._audioManager && typeof Fighter._audioManager.playBurning === 'function') {
                            Fighter._audioManager.playBurning(burnDuration);
                            infestedAudioPlayed = true;
                        }
                    }
                }
            }

            // Damage loose chunks
            if (Array.isArray(looseChunks)) {
                for (let lc of looseChunks) {
                    if (lc.destroyed) continue;
                    let ownerStacks = (this.owner && this.owner.obliteratorStacks) ? this.owner.obliteratorStacks : 0;
                    let powerMul = 1 + 0.35 * ownerStacks;
                    let explosionPower = (this.damage / 18) * 0.6 * powerMul;
                    lc.chipAt(this.x, this.y, this.radius, explosionPower, this.obliterator, true, fireStacks);

                    if (this.obliterator && fireStacks > 0) {
                        const cx = lc.x + lc.w / 2;
                        const cy = lc.y + lc.h / 2;
                        const dx = cx - this.x;
                        const dy = cy - this.y;
                        if ((dx * dx + dy * dy) <= this.radius * this.radius) {
                            lc.burning = {
                                time: 0,
                                duration: 1.2 + 1.3 * fireStacks,
                                power: fireStacks
                            };
                        }
                    }

                    // Apply extra explosion force if chunk wasn't destroyed
                    if (!lc.destroyed) {
                        const cx = lc.x + lc.w / 2;
                        const cy = lc.y + lc.h / 2;
                        const dx = cx - this.x;
                        const dy = cy - this.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist <= this.radius && dist > 0) {
                            // Extra force for explosions, scales with fighter's bullet damage
                            const bulletDamage = (this.owner && this.owner.bulletDamage) ? this.owner.bulletDamage : 6;
                            const extraForce = explosionPower * (bulletDamage * 2000);
                            const forceX = (dx / dist) * extraForce;
                            const forceY = (dy / dist) * extraForce;
                            lc.applyForce(forceX, forceY);
                        }
                    }
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
        
        // Draw particles
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

Explosion._nextId = 1;

Explosion.fromState = function(state) {
    if (!state) return null;
    const explosion = Object.create(Explosion.prototype);
    explosion.owner = null;
    StateSerializer.applyState(explosion, state, { exclude: ['owner'] });
    explosion.id = state.id || `explosion_${Explosion._nextId++}`;
    return explosion;
};

Explosion.prototype.serialize = function() {
    return StateSerializer.serialize(this, {
        force: true,
        exclude: ['owner']
    });
};

// Export to window
if (typeof window !== 'undefined') {
    window.Explosion = Explosion;
}
