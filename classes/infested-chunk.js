;(function(root) {
	const globalObj = root || (typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));

    // --- InfestedChunk Class ---
    class InfestedChunk {
        static nextId = 1;
        constructor(chunk, obstacle) {
            this.id = InfestedChunk.nextId++;
            this.x = chunk.x;
            this.y = chunk.y;
            this.w = chunk.w;
            this.h = chunk.h;
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
            // Mark original chunk as destroyed
            chunk.destroyed = true;
            chunk.flying = true;
            chunk.alpha = 0;
            // Notify joiners about this visual chunk change
            for (let oi = 0; oi < obstacles.length; oi++) {
                const obs = obstacles[oi];
                if (!obs || !obs.chunks) continue;
                for (let ci = 0; ci < obs.chunks.length; ci++) {
                    const cc = obs.chunks[ci];
                    if (cc === chunk) {
                        const updates = [{ i: ci, destroyed: true, flying: true, vx: cc.vx||0, vy: cc.vy||0, alpha: cc.alpha||0, x: cc.x, y: cc.y }];
                        createSyncedChunkUpdate(oi, updates);
                        // Emit infestation spawn so joiner can create infested visuals
                        try { GameEvents.emit('infestation-spawn', { id: this.id, x: this.x, y: this.y, w: this.w, h: this.h, hp: this.hp }); } catch (e) {}
                        return;
                    }
                }
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

            // Check collision with players
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
                    break;
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

            // Draw particles
            for (let p of this.particles) {
                let alpha = p.life / p.maxLife;
                ctx.globalAlpha = alpha * 0.7;
                ctx.fillStyle = "#bf7fbf";
                ctx.beginPath();
                ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
                ctx.fill();
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