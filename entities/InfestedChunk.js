/**
 * InfestedChunk - Animated infested obstacle chunk that seeks and damages fighters
 */
class InfestedChunk {
    static nextId = 1;
    
    constructor(chunk, obstacle, visualOnly = false) {
        this.id = InfestedChunk.nextId++;
        this.x = chunk.x;
        this.y = chunk.y;
        this.w = chunk.w;
        this.h = chunk.h;
        this.visualOnly = !!visualOnly;
        
        // Lifespan: 5-10 seconds (Infinity for visual-only instances)
        this.lifespan = this.visualOnly ? Infinity : (5.0 + Math.random() * 5.0);
        this.age = 0.0;
        
        // Movement
        this.vx = 0;
        this.vy = 0;
        this.speed = 80 + Math.random() * 40; // 80-120 speed
        
        // Combat
        this.hp = (typeof chunk.hp === 'number') ? chunk.hp : 1.0;
        this.damage = 12;
        this.alpha = 1;
        
        // Particles
        this.particleTimer = 0;
        this.particles = [];
        
        // State
        this.seekTarget = null;
        this.active = true;
        
        // Burning state
        this.burning = null; // { time, duration, nextTick, power }
        this.flameParticles = [];
        
        // Mark original chunk as destroyed
        if (!this.visualOnly && chunk) {
            chunk.destroyed = true;
            chunk.flying = true;
            chunk.alpha = 0;
        }
    }

    update(dt, fighters, healers = []) {
        if (!this.active) return;

        // Age and self-destruct if lifespan exceeded (host authoritative)
        if (!this.visualOnly) {
            this.age += dt;
            if (this.age >= this.lifespan) {
                this.active = false;
                return;
            }
        }

        // Find nearest fighter to target
        let nearestFighter = null;
        let nearestDist = Infinity;
        for (let f of fighters) {
            if (!f.alive) continue;
            let d = dist(this.x + this.w/2, this.y + this.h/2, f.x, f.y);
            if (d < nearestDist) {
                nearestDist = d;
                nearestFighter = f;
            }
        }

        // AI: seek toward nearest fighter
        if (nearestFighter) {
            let centerX = this.x + this.w/2;
            let centerY = this.y + this.h/2;
            let dx = nearestFighter.x - centerX;
            let dy = nearestFighter.y - centerY;
            let distance = Math.hypot(dx, dy);
            if (distance > 0) {
                this.vx = (dx / distance) * this.speed;
                this.vy = (dy / distance) * this.speed;
            }
        }

        // Move
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Check collision with fighters and healers (host-authoritative only)
        if (!this.visualOnly) {
            let centerX = this.x + this.w/2;
            let centerY = this.y + this.h/2;
            for (let f of fighters) {
                if (!f.alive) continue;
                if (dist(centerX, centerY, f.x, f.y) < this.w/2 + f.radius) {
                    // Damage fighter
                    f.takeDamage(this.damage);
                    this.active = false;
                    break;
                }
            }
            if (this.active) {
                for (let h of healers) {
                    if (!h.active) continue;
                    if (dist(centerX, centerY, h.x, h.y) < this.w/2 + h.radius) {
                        // Damage healer
                        h.takeDamage(this.damage);
                        this.active = false;
                        break;
                    }
                }
            }
        }

        // Generate particles
        this.particleTimer += dt;
        if (this.particleTimer > 0.1) {
            this.particleTimer = 0;
            let centerX = this.x + this.w/2;
            let centerY = this.y + this.h/2;
            this.particles.push({
                x: centerX + (Math.random() - 0.5) * this.w,
                y: centerY + (Math.random() - 0.5) * this.h,
                vx: (Math.random() - 0.5) * 30,
                vy: (Math.random() - 0.5) * 30 - 20,
                life: 0.8 + Math.random() * 0.4,
                maxLife: 0.8 + Math.random() * 0.4
            });
        }

        // Update particles
        for (let p of this.particles) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 40 * dt; // gravity
            p.life -= dt;
        }
        this.particles = this.particles.filter(p => p.life > 0);

        // Burning logic
        if (this.burning) {
            this.burning.time += dt;
            if (!this.burning.nextTick) this.burning.nextTick = 0;
            this.burning.nextTick -= dt;
            
            if (this.burning.nextTick <= 0) {
                // Spawn flame particle
                if (this.flameParticles.length < 18 && Math.random() < 0.9) {
                    const cx = this.x + this.w/2 + (Math.random() - 0.5) * this.w * 0.6;
                    const cy = this.y + this.h/2 + (Math.random() - 0.5) * this.h * 0.6;
                    this.flameParticles.push({
                        x: cx,
                        y: cy,
                        vx: (Math.random() - 0.5) * 28,
                        vy: -30 + Math.random() * -18,
                        life: 0.45 + Math.random() * 0.6,
                        maxLife: 0.45 + Math.random() * 0.6,
                        r: 2 + Math.random() * 3,
                        hue: 18 + Math.random() * 30
                    });
                }
                
                // Host-authoritative HP reduction
                if (!this.visualOnly) {
                    this.hp -= 0.18 * (this.burning.power || 1);
                    this.alpha = Math.max(0.2, Math.min(1, this.hp));
                    this.burning.nextTick = 0.32 + Math.random() * 0.18;
                    
                    if (this.hp <= 0) {
                        this.active = false;
                        this.burning = null;
                        return;
                    }
                }
            }
            
            if (this.burning.time > this.burning.duration) {
                this.burning = null;
            }
        }

        // Update flame particles
        for (let fp of this.flameParticles) {
            fp.x += fp.vx * dt;
            fp.y += fp.vy * dt;
            fp.vy += 80 * dt;
            fp.life -= dt;
        }
        this.flameParticles = this.flameParticles.filter(p => p.life > 0);

        // Remove if off screen
        if (this.x < -50 || this.x > CANVAS_W + 50 || this.y < -50 || this.y > CANVAS_H + 50) {
            this.active = false;
        }
    }

    chipAt(x, y, radius, power = 1, obliterate = false, explosion = false, fireshotStacks = 0) {
        // Damage from bullets/explosions
        let centerX = this.x + this.w/2;
        let centerY = this.y + this.h/2;
        let dist2 = (x - centerX) * (x - centerX) + (y - centerY) * (y - centerY);
        
        if (dist2 < radius * radius) {
            this.hp -= power;
            
            if (this.hp <= 0) {
                this.active = false;
            } else {
                this.alpha = Math.max(0.35, Math.min(1, this.hp));
                if (fireshotStacks && fireshotStacks > 0) {
                    const powerLevel = Math.max(1, fireshotStacks);
                    this.burning = {
                        time: 0,
                        duration: 1.2 + 1.3 * powerLevel,
                        power: powerLevel
                    };
                    if (typeof Fighter !== 'undefined' && Fighter._audioManager && typeof Fighter._audioManager.playBurning === 'function') {
                        Fighter._audioManager.playBurning(this.burning.duration);
                    }
                }
            }
            return true;
        }
        return false;
    }

    draw(ctx) {
        if (!this.active) return;

        ctx.save();
        
        // Draw the chunk with infested color
        ctx.fillStyle = "#8f4f8f"; // purple-ish infested color
        ctx.globalAlpha = this.alpha;
        ctx.fillRect(this.x, this.y, this.w, this.h);

        // Burning visual: glow and particles
        if (this.burning) {
            const bp = this.burning.power || 1;
            const cx = this.x + this.w/2;
            const cy = this.y + this.h/2;
            
            // Soft glow
            ctx.globalAlpha = 0.18 * Math.min(1.6, bp) + 0.22 * Math.sin(Date.now() / (120 - Math.min(60, bp*6)));
            ctx.fillStyle = '#ff9a55';
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(this.w, this.h) * (0.45 + 0.06 * bp), 0, Math.PI * 2);
            ctx.fill();
            
            // Core ember
            ctx.globalAlpha = 0.9 * Math.min(1, bp);
            ctx.fillStyle = '#ffdd99';
            ctx.beginPath();
            ctx.arc(cx, cy - 2, Math.max(3, Math.min(10, bp * 4)), 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw particles
        for (let p of this.particles) {
            let alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha * 0.7;
            ctx.fillStyle = "#bf7fbf";
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Draw flame particles on top
        if (this.flameParticles.length > 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            for (let fp of this.flameParticles) {
                const t = Math.max(0, Math.min(1, fp.life / fp.maxLife));
                ctx.globalAlpha = t * 0.86;
                const grad = ctx.createRadialGradient(fp.x, fp.y, 0, fp.x, fp.y, fp.r * 4);
                grad.addColorStop(0, `hsla(${fp.hue},100%,66%,${Math.min(1, 0.74 * t)})`);
                grad.addColorStop(0.5, `hsla(${fp.hue + 12},100%,48%,${Math.min(1, 0.36 * t)})`);
                grad.addColorStop(1, `hsla(${fp.hue + 12},100%,48%,0)`);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(fp.x, fp.y, fp.r * 4, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        ctx.globalAlpha = 1;
        ctx.restore();
    }
}

InfestedChunk.fromState = function(state) {
    if (!state) return null;
    const chunk = Object.create(InfestedChunk.prototype);
    StateSerializer.applyState(chunk, state);
    chunk.id = state.id || InfestedChunk.nextId++;
    // Ensure particles arrays exist
    chunk.particles = chunk.particles || [];
    chunk.flameParticles = chunk.flameParticles || [];
    return chunk;
};

InfestedChunk.prototype.serialize = function() {
    return StateSerializer.serialize(this, { 
        force: true,
        exclude: ['particles', 'flameParticles'] // Don't sync particles (visual only)
    });
};

// Export to window
if (typeof window !== 'undefined') {
    window.InfestedChunk = InfestedChunk;
}
