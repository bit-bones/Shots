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

		chipChunksAt(x, y, radius, power = 1, obliterate = false, explosion = false, fireshotStacks = 0) {
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
				// Set burning before applying damage, so even destroyed chunks can burn
				if (fireshotStacks && fireshotStacks > 0) {
					c.burning = { time: 0, duration: 1.2 + 1.3 * fireshotStacks };
					try { playBurning(1.2 + 1.3 * fireshotStacks); } catch (e) { /* ignore audio errors */ }
					// Emit burning event for joiner sync
					try {
						const obsIdx = globalObj.obstacles ? globalObj.obstacles.indexOf(this) : -1;
						if (obsIdx >= 0 && typeof globalObj.GameEvents !== 'undefined' && globalObj.GameEvents.emit) {
							const ci = this.chunks.indexOf(c);
							if (ci >= 0) globalObj.GameEvents.emit('burning-start', { obstacleIndex: obsIdx, chunkIndex: ci, duration: 1.2 + 1.3 * fireshotStacks, power: 1 });
						}
					} catch (e) {}
				}
				// If both fireshot and obliterator are active, ignite nearby chunks as well
				if (obliterate && fireshotStacks > 0) {
					for (const c2 of this.chunks) {
						if (c2 === c || c2.destroyed || c2.burning) continue;
						const d = Math.hypot(c.x + c.w/2 - c2.x - c2.w/2, c.y + c.h/2 - c2.y - c2.h/2);
						const maxDist = Math.max(c.w, c.h) * 1.6;
						if (d <= maxDist) {
							// Randomize dissipation
							const dissipation = 0.5 + Math.random() * 0.45;
							const newPower = Math.max(0.18, 1 * dissipation);
							// Scale duration with fireshotStacks, similar to main chunk
							const stackScale = 1.2 + 1.3 * fireshotStacks;
							// Ensure minimum duration is always visible, even at 1 stack
							const minVisible = 1.2 + 0.7 * fireshotStacks;
							const newDur = Math.max(minVisible, stackScale * (0.8 + 0.5 * fireshotStacks) * (0.7 + Math.random() * 0.6) * (0.7 + dissipation * 0.6));
							c2.burning = { time: 0, duration: newDur, power: newPower, nextTick: 0 };
							c2.flameParticles = c2.flameParticles || [];
							try { playBurning(newDur); } catch (e) { /* ignore audio errors */ }
							try {
								const obsIdx2 = globalObj.obstacles ? globalObj.obstacles.indexOf(this) : -1;
								if (obsIdx2 >= 0 && typeof globalObj.GameEvents !== 'undefined' && globalObj.GameEvents.emit) {
									const ci2 = this.chunks.indexOf(c2);
									if (ci2 >= 0) globalObj.GameEvents.emit('burning-start', { obstacleIndex: obsIdx2, chunkIndex: ci2, duration: newDur, power: newPower });
								}
							} catch (e) {}
						}
					}
				}
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
					const update = {
						i: ci,
						destroyed: !!c.destroyed,
						flying: !!c.flying,
						vx: c.vx || 0,
						vy: c.vy || 0,
						alpha: c.alpha || 1,
						x: c.x,
						y: c.y
					};
					// Include burning state if present
					if (c.burning) {
						update.burning = { time: c.burning.time, duration: c.burning.duration, power: c.burning.power || 1 };
					}
					updates.push(update);
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
