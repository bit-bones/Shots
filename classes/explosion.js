;(function(root) {
	const globalObj = root || (typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));

    // --- Explosion Effect ---
    class Explosion {
        static nextId = 1;
        constructor(x, y, radius, color, damage, owner, obliterator) {
            this.id = Explosion.nextId++;
            this.x = x;
            this.y = y;
            this.radius = radius;
            this.maxRadius = radius * (1.15 + Math.random()*0.12);
            this.life = 0.3 + Math.random()*0.08;
            this.time = 0;
            this.color = color;
            this.damage = damage;
            this.owner = owner;
            this.done = false;
            this.hasDamaged = false;
            this.obliterator = obliterator;
            this.particles = [];
            for (let i = 0; i < EXPLOSION_PARTICLES; ++i) {
                let ang = rand(0, Math.PI*2);
                let speed = rand(EXPLOSION_PARTICLE_BASE*0.9, EXPLOSION_PARTICLE_BASE*1.4) * (radius/EXPLOSION_BASE_RADIUS);
                this.particles.push({
                    x: x, y: y,
                    vx: Math.cos(ang) * speed,
                    vy: Math.sin(ang) * speed,
                    r: rand(radius*0.13, radius*0.28),
                    alpha: 1,
                    color: color
                });
            }
        }
        update(dt, obstacles, players) {
            this.time += dt;
            for (let p of this.particles) {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.alpha -= 2.5 * dt;
                if (p.alpha < 0) p.alpha = 0;
            }
            if (!this.hasDamaged) {
                // applyDamage controls whether this explosion should affect game state (host only)
                if (arguments.length >= 4 ? arguments[3] : true) {
                    for (let p of players) {
                        if (p !== this.owner && dist(p.x, p.y, this.x, this.y) < this.radius + p.radius) {
                            p._lastAttacker = this.owner;
                            p.takeDamage(this.damage);
                            p._lastAttacker = null;
                        }
                    }
                    for (let o of obstacles) {
                        if (o.destroyed) continue;
                        // Explosion power scales with owner's obliterator stacks but is modest by default
                        let ownerStacks = (this.owner && this.owner.obliteratorStacks) ? this.owner.obliteratorStacks : 0;
                        let powerMul = 1 + 0.35 * ownerStacks; // each stack increases explosion power
                        let explosionPower = (this.damage/18) * 0.6 * powerMul; // base reduced to 0.6
                        o.chipChunksAt(this.x, this.y, this.radius, explosionPower, this.obliterator, true);
                    }
                }
                this.hasDamaged = true;
            }
            if (this.time > this.life) this.done = true;
        }
        draw(ctx) {
            let t = this.time / this.life;
            let r = lerp(this.radius*0.7, this.maxRadius, t);
            let alpha = lerp(0.32, 0, t) + 0.18;
            ctx.save();
            let grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r);
            grad.addColorStop(0, this.color+"cc");
            grad.addColorStop(0.34, this.color+"77");
            grad.addColorStop(1, "#0000");
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(this.x, this.y, r, 0, Math.PI*2);
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.globalAlpha = 1;
            for (let p of this.particles) {
                if (p.alpha <= 0) continue;
                ctx.globalAlpha = p.alpha * 0.63;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
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