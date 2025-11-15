/**
 * Obstacle - Destructible chunked obstacle
 */
class Obstacle {
    constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.chunkGrid = 6;
        this.chunks = [];
        this.destroyed = false;
        this.id = `obstacle_${Obstacle._nextId++}`;
        this.generateChunks();
    }

    generateChunks() {
        this.chunks = [];
        const grid = this.chunkGrid;
        let chunkW = this.w / grid;
        let chunkH = this.h / grid;
        
        for (let i = 0; i < grid; i++) {
            for (let j = 0; j < grid; j++) {
                this.chunks.push({
                    x: this.x + i * chunkW,
                    y: this.y + j * chunkH,
                    w: chunkW,
                    h: chunkH,
                    destroyed: false,
                    hp: 1.0,
                    vx: 0,
                    vy: 0,
                    flying: false,
                    alpha: 1
                });
            }
        }
    }

    update(dt) {
        for (const c of this.chunks) {
            if (c.flying) {
                c.x += c.vx * dt;
                c.y += c.vy * dt;
                c.vy += 320 * dt; // gravity
                c.alpha -= 1.5 * dt;
                if (c.alpha <= 0) c.flying = false;
            }
            
            // Update burning chunks (matches original game)
            if (c.burning && !c.destroyed) {
                c.burning.time += dt;
                if (!c.burning.nextTick) c.burning.nextTick = 0;
                c.burning.nextTick -= dt;
                if (c.burning.nextTick <= 0) {
                    // Visual particle spawn/timer update
                    if (!Array.isArray(c.flameParticles)) c.flameParticles = [];
                    if (c.flameParticles.length < 18 && Math.random() < 0.92) {
                        const cx = c.x + c.w/2 + (Math.random() - 0.5) * c.w * 0.6;
                        const cy = c.y + c.h/2 + (Math.random() - 0.5) * c.h * 0.6;
                        c.flameParticles.push({ 
                            x: cx, 
                            y: cy, 
                            vx: (Math.random() - 0.5) * 28, 
                            vy: -30 + Math.random() * -18, 
                            life: 0.55 + Math.random() * 0.7, 
                            maxLife: 0.55 + Math.random() * 0.7, 
                            r: 2 + Math.random() * 3, 
                            hue: 18 + Math.random() * 30 
                        });
                    }
                    
                    // Apply damage to chunk HP (matches original)
                    c.hp = (typeof c.hp === 'number') ? c.hp - 0.11 : 1.0 - 0.11;
                    c.alpha = Math.max(0.25, Math.min(1, c.hp));
                    
                    // Check if chunk should be destroyed
                    if (c.hp <= 0 && !c.destroyed) {
                        // Make chunk fly away when destroyed by fire
                        const ang = Math.random() * Math.PI * 2;
                        const v = 80 + Math.random() * 60;
                        c.vx = Math.cos(ang) * v;
                        c.vy = Math.sin(ang) * v - 50;
                        c.flying = true;
                        c.destroyed = true;
                        c.alpha = 1;
                    }
                    
                    // Advance the nextTick for visuals
                    c.burning.nextTick = 0.44 + Math.random()*0.22;
                }
                
                // Update any chunk flame particles
                if (Array.isArray(c.flameParticles) && c.flameParticles.length) {
                    for (let fp of c.flameParticles) {
                        fp.x += fp.vx * dt;
                        fp.y += fp.vy * dt;
                        fp.vy += 80 * dt;
                        fp.life -= dt;
                    }
                    c.flameParticles = c.flameParticles.filter(p => p.life > 0);
                }
            }

            // Update spontaneous glow
            if (c.spontaneousGlow && !c.destroyed) {
                c.spontaneousGlow.time += dt;
            }
        }
        
        // Check if entire obstacle is destroyed
        this.destroyed = this.chunks.every(c => c.destroyed);
    }

    draw(ctx) {
        ctx.save();
        for (const c of this.chunks) {
            if (c.destroyed && !c.flying) continue;
            ctx.globalAlpha = c.alpha;
            ctx.fillStyle = "#3d4351";
            ctx.fillRect(c.x, c.y, c.w, c.h);
            
            // Draw burning effect (matches original game)
            if (c.burning && !c.destroyed) {
                const cx = c.x + c.w/2;
                const cy = c.y + c.h/2;
                const power = (c.burning && c.burning.power) ? c.burning.power : 1;
                // soft pulsating glow (subtle, similar to player)
                const timeBase = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
                const glowPulse = 0.14 * Math.sin(timeBase / (90 - Math.min(40, power * 6)));
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.22 * Math.min(1.6, power) + glowPulse;
                const glowR = Math.max(c.w, c.h) * (0.3 + 0.08 * Math.min(2, power));
                const ggrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR * 1.2);
                ggrad.addColorStop(0, 'rgba(255,160,64,0.85)');
                ggrad.addColorStop(0.5, 'rgba(255,120,40,0.45)');
                ggrad.addColorStop(1, 'rgba(120,60,20,0)');
                ctx.fillStyle = ggrad;
                ctx.beginPath();
                ctx.arc(cx, cy, glowR * 1.05, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                // draw per-chunk flame particles using player-like style
                if (Array.isArray(c.flameParticles) && c.flameParticles.length) {
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    for (let fp of c.flameParticles) {
                        const t = Math.max(0, Math.min(1, fp.life / fp.maxLife));
                        // particle core
                        ctx.globalAlpha = Math.max(0, 0.72 * t * Math.min(1.2, power));
                        ctx.beginPath();
                        ctx.fillStyle = `hsla(${fp.hue},100%,58%,1)`;
                        ctx.arc(fp.x, fp.y, fp.r * (1.0 + 0.6 * Math.min(1, power)), 0, Math.PI * 2);
                        ctx.fill();
                        // soft outer glow
                        const grad = ctx.createRadialGradient(fp.x, fp.y, 0, fp.x, fp.y, fp.r * 5);
                        grad.addColorStop(0, `hsla(${fp.hue},100%,66%,${0.72 * t * Math.min(1.0, power)})`);
                        grad.addColorStop(0.5, `hsla(${fp.hue + 12},100%,48%,${0.34 * t * Math.min(1.0, power)})`);
                        grad.addColorStop(1, `hsla(${fp.hue + 12},100%,48%,0)`);
                        ctx.beginPath();
                        ctx.fillStyle = grad;
                        ctx.arc(fp.x, fp.y, fp.r * 5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.restore();
                }
            }

            // Draw spontaneous glow effect
            if (c.spontaneousGlow && !c.destroyed) {
                const cx = c.x + c.w/2;
                const cy = c.y + c.h/2;
                const progress = c.spontaneousGlow.time / c.spontaneousGlow.duration;
                const power = 1; // Fixed power for spontaneous
                const timeBase = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
                const glowPulse = 0.14 * Math.sin(timeBase / (90 - Math.min(40, power * 6)));
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.22 * Math.min(1.6, power) + glowPulse;
                const glowR = Math.max(c.w, c.h) * (0.3 + 0.08 * Math.min(2, power));
                const ggrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR * 1.2);
                ggrad.addColorStop(0, 'rgba(255,160,64,0.85)');
                ggrad.addColorStop(0.5, 'rgba(255,120,40,0.45)');
                ggrad.addColorStop(1, 'rgba(120,60,20,0)');
                ctx.fillStyle = ggrad;
                ctx.beginPath();
                ctx.arc(cx, cy, glowR * 1.05, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    circleCollide(cx, cy, cr) {
        for (const c of this.chunks) {
            if (c.destroyed) continue;
            let closestX = clamp(cx, c.x, c.x + c.w);
            let closestY = clamp(cy, c.y, c.y + c.h);
            let distX = cx - closestX;
            let distY = cy - closestY;
            if ((distX * distX + distY * distY) < cr * cr) return true;
        }
        return false;
    }

    chipChunksAt(x, y, radius, power = 1, obliterate = false, explosion = false, fireshotStacks = 0) {
        let hits = [];
        for (const c of this.chunks) {
            if (c.destroyed) continue;
            let closestX = clamp(x, c.x, c.x + c.w);
            let closestY = clamp(y, c.y, c.y + c.h);
            let distX = x - closestX;
            let distY = y - closestY;
            let dist2 = distX * distX + distY * distY;
            if (dist2 < radius * radius) {
                hits.push({ c, closestX, closestY, dist2 });
            }
        }
        
        if (hits.length === 0) return false;
        
        let totalPower = power * (explosion ? 1.25 : 1.0);
        let weights = hits.map(h => 1 + Math.max(0, (radius * radius - h.dist2) / (radius * radius)));
        let weightSum = weights.reduce((s, v) => s + v, 0);
        let chipped = false;
        
        for (let i = 0; i < hits.length; ++i) {
            const h = hits[i];
            const c = h.c;
            let alloc = (totalPower * weights[i]) / weightSum;
            c.hp = (typeof c.hp === 'number') ? c.hp - alloc : 1.0 - alloc;
            
            if (c.hp <= 0) {
                let ang = Math.atan2(c.y + c.h / 2 - y, c.x + c.w / 2 - x) + (Math.random() - 0.5) * 0.6;
                let v = 160 * (explosion ? 2.5 : 1) + Math.random() * (explosion ? 240 : 120) * (1 + power * 0.4);
                c.vx = Math.cos(ang) * v;
                c.vy = Math.sin(ang) * v - (explosion ? 220 : 100);
                c.flying = true;
                c.destroyed = true;
                c.alpha = 1;
                chipped = true;
            } else {
                c.alpha = Math.max(0.35, Math.min(1, c.hp));
                chipped = true;
                if (fireshotStacks && fireshotStacks > 0) {
                    const powerLevel = Math.max(1, fireshotStacks);
                    c.burning = {
                        time: 0,
                        duration: 1.2 + 1.3 * powerLevel,
                        power: powerLevel
                    };
                    if (!Array.isArray(c.flameParticles)) c.flameParticles = [];
                    if (typeof Fighter !== 'undefined' && Fighter._audioManager && typeof Fighter._audioManager.playBurning === 'function') {
                        Fighter._audioManager.playBurning(c.burning.duration);
                    }
                }
            }
        }
        
        this.destroyed = this.chunks.every(c => c.destroyed);
        return chipped;
    }
}

Obstacle._nextId = 1;

Obstacle.fromState = function(state) {
    if (!state) return null;
    const obstacle = Object.create(Obstacle.prototype);
    obstacle.chunks = [];
    StateSerializer.applyState(obstacle, state);
    obstacle.id = state.id || `obstacle_${Obstacle._nextId++}`;
    return obstacle;
};

Obstacle.prototype.serialize = function() {
    return StateSerializer.serialize(this, { force: true });
};

// Export to window
if (typeof window !== 'undefined') {
    window.Obstacle = Obstacle;
}
