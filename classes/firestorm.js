;(function(root) {
	const globalObj = root || (typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));

    // --- Firestorm Effect Class ---
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
            // Track what is burning
            this.burningEntities = new Set();

            // --- Visuals state from classes.js version ---
            this.time = 0;
            this.duration = this.maxLife; // for compatibility with classes.js visuals
            this.maxRadius = this.radius;
            this.damageInterval = 0.15; // not used, logic stays in main.js
            this.damageTimer = 0;
            this.damage = 5;
            this.particles = [];
            this.particleTimer = 0;
        }
        update(dt) {
            this.life += dt;
            this.time += dt;
            // If fading, count down fade
            if (this.state === 'fading') {
                this.fadeTime -= dt;
                if (this.fadeTime <= 0) this.done = true;
            } else if (this.life >= this.maxLife) {
                this.state = 'fading';
            }
            
            // Only run game logic (damage/ignition) on host or in single-player (NET.role not 'joiner')
            if (NET.role !== 'joiner') {
                // Damage and ignite players/enemy and any roster-controlled fighters
                const participants = [];
                if (player) participants.push(player);
                if (!enemyDisabled && typeof enemy !== 'undefined' && enemy) participants.push(enemy);
                try {
                    if (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.getFighters === 'function') {
                        const fighters = playerRoster.getFighters({ includeUnassigned: false, includeEntity: true }) || [];
                        for (const f of fighters) {
                            if (!f || !f.entity) continue;
                            // Skip worldmaster placeholders
                            if (f.metadata && f.metadata.isWorldMaster) continue;
                            const ent = f.entity;
                            if (!participants.includes(ent)) participants.push(ent);
                        }
                    }
                } catch (e) {}

                for (let p of participants) {
                    if (!p || p.health <= 0) continue;
                    if (dist(p.x, p.y, this.x, this.y) < this.radius + p.radius) {
                        if (!p.burning) {
                            p.burning = { time: 0, duration: 3 + Math.random()*1.5 };
                            try { playBurning(p.burning.duration); } catch (e) { /* ignore audio errors */ }
                            // Emit roster-aware burning event for joiners: prefer fighterId when available
                            try {
                                if (NET && NET.role === 'host' && NET.connected) {
                                    const payload = { duration: p.burning.duration };
                                    if (p._rosterFighterId) payload.fighterId = p._rosterFighterId;
                                    else if (p.id) payload.entityId = p.id;
                                    try { GameEvents.emit('burning-start', payload); } catch (e) {}
                                }
                            } catch (e) {}
                        }
                    }
                }
            }

            
            // Only run game logic (damage/ignition) on host or in single-player (NET.role not 'joiner')
            if (NET.role !== 'joiner') {
                // Damage and ignite obstacle chunks (limit how many new ignitions per frame)
                if (Array.isArray(obstacles) && obstacles.length > 0) {
                    let newIgnitions = 0;
                    const MAX_NEW_IGNITIONS_PER_FRAME = 12;
                    for (let o of obstacles) {
                        if (!o || o.destroyed) continue;
                        for (let c of o.chunks) {
                            if (!c || c.destroyed) continue;
                            // Center of chunk
                            let cx = c.x + c.w/2, cy = c.y + c.h/2;
                            if (dist(cx, cy, this.x, this.y) < this.radius + Math.max(c.w, c.h)/2) {
                                if (!c.burning && newIgnitions < MAX_NEW_IGNITIONS_PER_FRAME) {
                                    const duration = 2.5 + Math.random()*1.5;
                                        c.burning = { time: 0, duration };
                                        try { playBurning(duration); } catch (e) { /* ignore audio errors */ }
                                    newIgnitions++;
                                    // Relay burning state to joiner so visuals match
                                        try { if (NET && NET.role === 'host' && NET.connected) {
                                            const oi = obstacles.indexOf(o);
                                            const ci = o.chunks.indexOf(c);
                                            if (typeof oi === 'number' && oi >= 0 && typeof ci === 'number' && ci >= 0) {
                                                GameEvents.emit('burning-start', { obstacleIndex: oi, chunkIndex: ci, duration });
                                            }
                                        } } catch (e) {}
                                }
                            }
                            if (newIgnitions >= MAX_NEW_IGNITIONS_PER_FRAME) break;
                        }
                        if (newIgnitions >= MAX_NEW_IGNITIONS_PER_FRAME) break;
                    }
                }

                // Spread burning to nearby chunks (simple neighbor spread)
                if (Array.isArray(obstacles) && obstacles.length > 0) {
                    let spreadChecks = 0;
                    let newIgnited = 0;
                    const MAX_SPREAD_CHECKS = 1200;
                    const MAX_NEW_IGNITED = 10;
                    for (let o of obstacles) {
                        if (!o) continue;
                        for (let c of o.chunks) {
                            if (!c || !c.burning || c.burning.time <= 0.5 || c.destroyed) continue;
                            // Try to ignite nearby chunks
                            for (let o2 of obstacles) {
                                if (!o2) continue;
                                for (let c2 of o2.chunks) {
                                    if (!c2 || c2.burning || c2.destroyed) continue;
                                    spreadChecks++;
                                    if (spreadChecks > MAX_SPREAD_CHECKS) break;
                                    let d = dist(c.x + c.w/2, c.y + c.h/2, c2.x + c2.w/2, c2.y + c2.h/2);
                                    if (d < Math.max(c.w, c.h) * 1.2) {
                                        if (newIgnited < MAX_NEW_IGNITED && Math.random() < 0.08 * dt) {
                                            const duration = 2 + Math.random() * 1.5;
                                            c2.burning = { time: 0, duration };
                                            try { playBurning(duration); } catch (e) { /* ignore audio errors */ }
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
                }
                // Spread burning to players/enemy if near burning chunk (bounded checks per frame)
                if (Array.isArray(obstacles) && obstacles.length > 0) {
                    const participants = [player].concat(enemyDisabled ? [] : [enemy]);
                    let playerSpreadChecks = 0;
                    const MAX_PLAYER_SPREAD_CHECKS = 600;
                    for (let o of obstacles) {
                        if (!o || !o.chunks) continue;
                        for (let c of o.chunks) {
                            if (playerSpreadChecks++ > MAX_PLAYER_SPREAD_CHECKS) break;
                            if (c && c.burning && !c.destroyed) {
                                for (let p of participants) {
                                    if (!p) continue;
                                    if (p.health > 0 && dist(p.x, p.y, c.x + c.w/2, c.y + c.h/2) < 32 + p.radius) {
                                        if (!p.burning) {
                                            p.burning = { time: 0, duration: 2.5 + Math.random()*1.5 };
                                            try { playBurning(p.burning.duration); } catch (e) { /* ignore audio errors */ }
                                        }
                                    }
                                }
                            }
                        }
                        if (playerSpreadChecks > MAX_PLAYER_SPREAD_CHECKS) break;
                    }
                }
            }

            // --- Visuals ---
            this.damageTimer += dt;
            this.particleTimer += dt;
            // Generate fire particles
            if (this.particleTimer > 0.02) {
                this.particleTimer = 0;
                for (let i = 0; i < 3; ++i) {
                    let angle = Math.random() * Math.PI * 2;
                    let distance = Math.random() * this.maxRadius * 0.8;
                    let px = this.x + Math.cos(angle) * distance;
                    let py = this.y + Math.sin(angle) * distance;
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

            // Note: All other logic is untouched from main.js

            // Finish when faded out
            if (this.state === 'fading' && this.fadeTime <= 0) {
                this.done = true;
            }
        }

        // --- Visuals ---
        draw(ctx) {
            // Fade-out logic for alpha
            let t = this.time / this.duration;
            let alpha = 1;
            if (this.state === 'fading' || t > 0.8) {
                alpha = (this.state === 'fading') ?
                    (this.fadeTime / 1.2) :
                    ((1 - t) / 0.2);
            }

            let animTime = this.time * 2;
            let outerRadius = this.maxRadius * (0.8 + 0.2 * Math.sin(animTime));
            let innerRadius = outerRadius * 0.4;

            ctx.save();

            // Draw particles first (background)
            for (let p of this.particles) {
                let pa = (p.life / p.maxLife) * alpha * 0.8;
                ctx.globalAlpha = pa;
                // Color gradient from yellow to red
                let lifeRatio = p.life / p.maxLife;
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

	globalObj.Firestorm = Firestorm;
	try {
		if (typeof module !== 'undefined' && module.exports) {
			module.exports = Firestorm;
		}
	} catch (e) {}
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));