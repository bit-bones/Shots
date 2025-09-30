;(function(root) {
	const globalObj = root || (typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));

    // --- Bullet Class ---
    class Bullet {
        static nextId = 1;
        constructor(owner, x, y, angle) {
            this.id = Bullet.nextId++;
            this.owner = owner;
            this.x = x;
            this.y = y;
            this.radius = owner.bulletRadius;
            this.speed = owner.bulletSpeed;
            this.angle = angle;
            this.damage = owner.bulletDamage;
            this.pierce = owner.pierce || false;
            this.obliterator = owner.obliterator || false;
            this.obliteratorStacks = owner.obliteratorStacks || 0;
            this.explosive = owner.explosive || false;
            this.bouncesLeft = owner.ricochet || 0;
            this.active = true;
            // Stable ID for host-authoritative snapshots (assigned on host when fired)
            this.id = null;
        }
        update(dt) {
            this.x += Math.cos(this.angle) * this.speed * dt;
            this.y += Math.sin(this.angle) * this.speed * dt;
            if (MAP_BORDER) {
                if (this.x - this.radius < 0) {
                    if ((this.bouncesLeft|0) > 0) {
                        this.bouncesLeft = Math.max(0, this.bouncesLeft - 1);
                        this.x = this.radius + 2;
                        this.angle = Math.PI - this.angle;
                            try { playRicochet(); } catch (e) {}
                    } else this.active = false;
                }
                if (this.x + this.radius > CANVAS_W) {
                    if ((this.bouncesLeft|0) > 0) {
                        this.bouncesLeft = Math.max(0, this.bouncesLeft - 1);
                        this.x = CANVAS_W - this.radius - 2;
                        this.angle = Math.PI - this.angle;
                            try { playRicochet(); } catch (e) {}
                    } else this.active = false;
                }
                if (this.y - this.radius < 0) {
                    if ((this.bouncesLeft|0) > 0) {
                        this.bouncesLeft = Math.max(0, this.bouncesLeft - 1);
                        this.y = this.radius + 2;
                        this.angle = -this.angle;
                            try { playRicochet(); } catch (e) {}
                    } else this.active = false;
                }
                if (this.y + this.radius > CANVAS_H) {
                    if ((this.bouncesLeft|0) > 0) {
                        this.bouncesLeft = Math.max(0, this.bouncesLeft - 1);
                        this.y = CANVAS_H - this.radius - 2;
                        this.angle = -this.angle;
                            try { playRicochet(); } catch (e) {}
                    } else this.active = false;
                }
            } else {
                if(this.x < -30 || this.x > CANVAS_W+30 || this.y < -30 || this.y > CANVAS_H+30) this.active = false;
            }
        }
    }

	globalObj.Bullet = Bullet;
	try {
		if (typeof module !== 'undefined' && module.exports) {
			module.exports = Bullet;
		}
	} catch (e) {}
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));