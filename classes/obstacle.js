;(function(root) {
	const globalObj = root || (typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));

    // --- Obstacle Class ---
	class Obstacle {
		constructor(x, y, w, h) {
			this.x = x;
			this.y = y;
			this.w = w;
			this.h = h;
			this.chunkGrid = 6;
			this.chunks = [];
			this.generateChunks();
			this.destroyed = false;
		}

		generateChunks() {
			this.chunks = [];
			const grid = this.chunkGrid;
			const chunkW = this.w / grid;
			const chunkH = this.h / grid;
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

		draw(ctx) {
			ctx.save();
			for (const c of this.chunks) {
				if (c.destroyed && !c.flying) continue;
				ctx.globalAlpha = c.alpha;
				ctx.fillStyle = "#3d4351";
				ctx.fillRect(c.x, c.y, c.w, c.h);
				if (c.burning && !c.destroyed) {
					ctx.globalAlpha = 0.38 + 0.22 * Math.sin(Date.now() / 80);
					ctx.beginPath();
					ctx.arc(c.x + c.w / 2, c.y + c.h / 2, Math.max(c.w, c.h) * 0.38, 0, Math.PI * 2);
					ctx.fillStyle = '#ffb347';
					ctx.fill();
					ctx.globalAlpha = 1;
				}
			}
			ctx.globalAlpha = 1;
			ctx.restore();
		}

		update(dt) {
			for (const c of this.chunks) {
				if (c.flying) {
					c.x += c.vx * dt;
					c.y += c.vy * dt;
					c.vy += 320 * dt;
					c.alpha -= 1.5 * dt;
					if (c.alpha <= 0) c.flying = false;
				}
			}
		}

		circleCollide(cx, cy, cr) {
			for (const c of this.chunks) {
				if (c.destroyed) continue;
				const closestX = clamp(cx, c.x, c.x + c.w);
				const closestY = clamp(cy, c.y, c.y + c.h);
				const distX = cx - closestX;
				const distY = cy - closestY;
				if ((distX * distX + distY * distY) < cr * cr) return true;
			}
			return false;
		}

		chipChunksAt(x, y, radius, power = 1, obliterate = false, explosion = false) {
			const hits = [];
			for (const c of this.chunks) {
				if (c.destroyed) continue;
				const closestX = clamp(x, c.x, c.x + c.w);
				const closestY = clamp(y, c.y, c.y + c.h);
				const distX = x - closestX;
				const distY = y - closestY;
				if ((distX * distX + distY * distY) < radius * radius) {
					hits.push({ c, closestX, closestY, dist2: distX * distX + distY * distY });
				}
			}
			if (hits.length === 0) return false;

			const totalPower = power * (explosion ? 1.25 : 1.0);
			const weights = hits.map(h => 1 + Math.max(0, (radius * radius - h.dist2) / (radius * radius)));
			const weightSum = weights.reduce((s, v) => s + v, 0);
			let chipped = false;
			const updates = [];

			for (let i = 0; i < hits.length; ++i) {
				const h = hits[i];
				const c = h.c;
				const alloc = (totalPower * weights[i]) / weightSum;
				c.hp = (typeof c.hp === 'number') ? c.hp - alloc : 1.0 - alloc;
				if (c.hp <= 0) {
					const ang = Math.atan2(c.y + c.h / 2 - y, c.x + c.w / 2 - x) + (Math.random() - 0.5) * 0.6;
					const v = 160 * (explosion ? 2.5 : 1) + Math.random() * (explosion ? 240 : 120) * (1 + power * 0.4);
					c.vx = Math.cos(ang) * v;
					c.vy = Math.sin(ang) * v - (explosion ? 220 : 100);
					c.flying = true;
					c.destroyed = true;
					c.alpha = 1;
					chipped = true;
				} else {
					c.alpha = Math.max(0.35, Math.min(1, c.hp));
					chipped = true;
				}

				try {
					const ci = this.chunks.indexOf(c);
					updates.push({
						i: ci,
						destroyed: !!c.destroyed,
						flying: !!c.flying,
						vx: c.vx || 0,
						vy: c.vy || 0,
						alpha: c.alpha || 1,
						x: c.x,
						y: c.y
					});
				} catch (e) {}
			}

			this.destroyed = this.chunks.every(c => c.destroyed);

			if (updates.length > 0) {
				try {
					const globalObstacles = globalObj.obstacles;
					const obsIdx = Array.isArray(globalObstacles) ? globalObstacles.indexOf(this) : -1;
					if (obsIdx !== -1 && typeof globalObj.createSyncedChunkUpdate === 'function') {
						globalObj.createSyncedChunkUpdate(obsIdx, updates);
					}
				} catch (e) {}
			}

			return chipped;
		}
	}

	globalObj.Obstacle = Obstacle;
	try {
		if (typeof module !== 'undefined' && module.exports) {
			module.exports = Obstacle;
		}
	} catch (e) {}
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
