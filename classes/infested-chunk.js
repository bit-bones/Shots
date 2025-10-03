;(function(root) {
	const globalObj = root || (typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));

    // --- InfestedChunk Class ---
    class InfestedChunk {
        static nextId = 1;
        constructor(chunk, obstacle, visualOnly = false) {
            this.id = InfestedChunk.nextId++;
            this.x = chunk.x;
            this.y = chunk.y;
            this.w = chunk.w;
            this.h = chunk.h;
            this.visualOnly = !!visualOnly;
            // Lifespan handling: host determines lifespan; joiner visual-only instances do not auto-expire
            this.lifespan = this.visualOnly ? Infinity : (5.0 + Math.random() * 5.0); // seconds (5-10) for host, Infinity for visual-only
            this.age = 0.0;
            this.vx = 0;
            this.vy = 0;
            this.speed = 80 + Math.random() * 40; // 80-120 speed
            this.hp = (typeof chunk.hp === 'number') ? chunk.hp : 1.0;
            this.damage = 12;
            this.alpha = 1;
            this.particleTimer = 0;
            this.particles = [];
            this.seekTarget = null;
            this.active = true;
            this.burning = null; // { time, duration, nextTick, power }
            this.flameParticles = [];
            this.visualOnly = !!visualOnly;
            // Mark original chunk as destroyed
            if (!this.visualOnly) {
                // authoritative host-side: mark original chunk as destroyed and notify joiners
                try {
                    chunk.destroyed = true;
                    chunk.flying = true;
                    chunk.alpha = 0;
                } catch (e) {}
                try {
                    for (let oi = 0; oi < obstacles.length; oi++) {
                        const obs = obstacles[oi];
                        if (!obs || !obs.chunks) continue;
                        for (let ci = 0; ci < obs.chunks.length; ci++) {
                            const cc = obs.chunks[ci];
                            if (cc === chunk) {
                                const updates = [{ i: ci, destroyed: true, flying: true, vx: cc.vx||0, vy: cc.vy||0, alpha: cc.alpha||0, x: cc.x, y: cc.y }];
                                try { createSyncedChunkUpdate(oi, updates); } catch (e) {}
                                // Do not emit infestation-spawn here; host spawn sites are authoritative and will emit.
                                return;
                            }
                        }
                    }
                } catch (e) {}
            }
        }

        chipAt(x, y, radius, power = 1, obliterate = false, explosion = false) {
            // Like obstacle chunk, but only one chunk
            let centerX = this.x + this.w/2;
            let centerY = this.y + this.h/2;
            let dist2 = (x - centerX) * (x - centerX) + (y - centerY) * (y - centerY);
            if (dist2 < radius * radius) {
                let alloc = power;
                this.hp -= alloc;
                if (this.hp <= 0) {
                    this.active = false;
                    // Visual effect
                    explosions.push(new Explosion(centerX, centerY, 25, "#8f4f8f", 0, null, false));
                    // If host, notify joiner that this infested chunk died so they can remove the visual
                    try { if (typeof NET !== 'undefined' && NET.role === 'host' && NET.connected && typeof GameEvents !== 'undefined') { GameEvents.emit('infestation-die', { id: this.id, x: centerX, y: centerY }); } } catch (e) {}
                    // Relay visual-only chunk destruction (try to map back to obstacle/chunk index)
                    for (let oi = 0; oi < obstacles.length; oi++) {
                        const obs = obstacles[oi];
                        if (!obs || !obs.chunks) continue;
                        for (let ci = 0; ci < obs.chunks.length; ci++) {
                            const cc = obs.chunks[ci];
                            if (cc && cc.x === this.x && cc.y === this.y && cc.w === this.w && cc.h === this.h) {
                                const updates = [{ i: ci, destroyed: true, flying: !!cc.flying, vx: cc.vx||0, vy: cc.vy||0, alpha: cc.alpha||1, x: cc.x, y: cc.y }];
                                createSyncedChunkUpdate(oi, updates);
                                return;
                            }
                        }
                    }
                } else {
                    this.alpha = Math.max(0.35, Math.min(1, this.hp));
                }
                return true;
            }
            return false;
        }

        update(dt, players) {
            if (!this.active) return;

            // Age and self-destruct if lifespan exceeded (host authoritative)
            try {
                if (!this.visualOnly) {
                    this.age += dt;
                    if (this.age >= (typeof this.lifespan === 'number' ? this.lifespan : 10.0)) {
                        this.active = false;
                        try {
                            // play local poof/explosion visual
                            const centerX = this.x + this.w/2;
                            const centerY = this.y + this.h/2;
                            try { explosions.push(new Explosion(centerX, centerY, 25, "#8f4f8f", 0, null, false)); } catch (e) {}
                            try { if (typeof playSoftPoof === 'function') playSoftPoof(); } catch (e) {}
                            // If host, emit event so joiner can play the visual too
                            try { if (typeof NET !== 'undefined' && NET.role === 'host' && NET.connected && typeof GameEvents !== 'undefined') { GameEvents.emit('infestation-die', { id: this.id, x: centerX, y: centerY }); } } catch (e) {}
                        } catch (e) {}
                        return;
                    }
                }
            } catch (e) {}

            // Find nearest player to target
            let nearestPlayer = null;
            let nearestDist = Infinity;
            for (let p of players) {
                if (p.health <= 0) continue;
                let d = dist(this.x + this.w/2, this.y + this.h/2, p.x, p.y);
                if (d < nearestDist) {
                    nearestDist = d;
                    nearestPlayer = p;
                }
            }

            // AI: seek toward nearest player
            if (nearestPlayer) {
                let centerX = this.x + this.w/2;
                let centerY = this.y + this.h/2;
                let dx = nearestPlayer.x - centerX;
                let dy = nearestPlayer.y - centerY;
                let dist = Math.hypot(dx, dy);
                if (dist > 0) {
                    this.vx = (dx / dist) * this.speed;
                    this.vy = (dy / dist) * this.speed;
                }
            }

            // Move
            this.x += this.vx * dt;
            this.y += this.vy * dt;

            // Check collision with players (host-authoritative)
            if (!this.visualOnly) {
                for (let p of players) {
                    if (p.health <= 0) continue;
                    let centerX = this.x + this.w/2;
                    let centerY = this.y + this.h/2;
                    if (dist(centerX, centerY, p.x, p.y) < this.w/2 + p.radius) {
                        p._lastAttacker = null;
                        if (this.owner) p._lastAttacker = this.owner;
                        p.takeDamage(this.damage);
                        p._lastAttacker = null;
                        this.active = false;
                        // Create small explosion effect
                        explosions.push(new Explosion(
                            centerX, centerY,
                            25, "#8f4f8f", 0, null, false
                        ));
                        try { if (typeof NET !== 'undefined' && NET.role === 'host' && NET.connected && typeof GameEvents !== 'undefined') { GameEvents.emit('infestation-die', { id: this.id, x: centerX, y: centerY }); } } catch (e) {}
                        break;
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

            // Burning logic for infested chunk (visuals only here; host handles spread via main.js/firestorm)
            if (this.burning) {
                this.burning.time += dt;
                if (!this.burning.nextTick) this.burning.nextTick = 0;
                this.burning.nextTick -= dt;
                if (this.burning.nextTick <= 0) {
                    // spawn flame particle (both host and joiner for visuals)
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
                    // Host-authoritative HP reduction and death
                    if (typeof NET !== 'undefined' && NET.role !== 'joiner') {
                        this.hp = (typeof this.hp === 'number') ? this.hp - (0.18 * (this.burning.power || 1)) : 1.0 - 0.18;
                        this.alpha = Math.max(0.2, Math.min(1, this.hp));
                        this.burning.nextTick = 0.32 + Math.random() * 0.18;
                        if (this.hp <= 0) {
                            this.active = false;
                            this.burning = null;
                            try { explosions.push(new Explosion(this.x + this.w/2, this.y + this.h/2, 22, '#8f4f8f', 0, null, false)); } catch (e) {}
                            try { if (typeof NET !== 'undefined' && NET.role === 'host' && NET.connected && typeof GameEvents !== 'undefined') { GameEvents.emit('infestation-die', { id: this.id, x: this.x + this.w/2, y: this.y + this.h/2 }); } } catch (e) {}
                        }
                    }
                }
                if (this.burning && this.burning.time > this.burning.duration) {
                    this.burning = null;
                }
            }

            // Update flame particles
            if (this.flameParticles && this.flameParticles.length) {
                for (let fp of this.flameParticles) {
                    fp.x += fp.vx * dt;
                    fp.y += fp.vy * dt;
                    fp.vy += 80 * dt;
                    fp.life -= dt;
                }
                this.flameParticles = this.flameParticles.filter(p => p.life > 0);
            }

            // Remove if off screen
            if (this.x < -50 || this.x > CANVAS_W + 50 || this.y < -50 || this.y > CANVAS_H + 50) {
                this.active = false;
            }
        }

        draw(ctx) {
            if (!this.active) return;

            ctx.save();
            // Draw the chunk with infested color
            ctx.fillStyle = "#8f4f8f"; // purple-ish infested color
            ctx.globalAlpha = this.alpha;
            ctx.fillRect(this.x, this.y, this.w, this.h);

            // Burning visual: glow and particles (stronger when burning.power higher)
            if (this.burning) {
                const bp = this.burning.power || 1;
                const cx = this.x + this.w/2;
                const cy = this.y + this.h/2;
                // soft glow
                ctx.globalAlpha = 0.18 * Math.min(1.6, bp) + 0.22 * Math.sin(Date.now() / (120 - Math.min(60, bp*6)));
                ctx.fillStyle = '#ff9a55';
                ctx.beginPath();
                ctx.arc(cx, cy, Math.max(this.w, this.h) * (0.45 + 0.06 * bp), 0, Math.PI * 2);
                ctx.fill();
                // core ember
                ctx.globalAlpha = 0.9 * Math.min(1, bp);
                ctx.fillStyle = '#ffdd99';
                ctx.beginPath();
                ctx.arc(cx, cy - 2, Math.max(3, Math.min(10, bp * 4)), 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
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
            
            // draw flame particles on top
            if (this.flameParticles && this.flameParticles.length) {
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

	globalObj.InfestedChunk = InfestedChunk;
	try {
		if (typeof module !== 'undefined' && module.exports) {
			module.exports = InfestedChunk;
		}
	} catch (e) {}
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));