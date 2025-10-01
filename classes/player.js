;(function(root) {
	const globalObj = root || (typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));

    // --- Player Class ---
	class Player {
		static nextId = 1;

		constructor(isPlayer, color, x, y) {
			// Assign IDs based on network role to ensure consistency
			// Host player always gets ID 1, joiner player always gets ID 2
			if (typeof NET !== 'undefined' && NET && NET.role === 'host') {
				this.id = isPlayer ? 1 : 2; // host player=1, joiner player=2
			} else if (typeof NET !== 'undefined' && NET && NET.role === 'joiner') {
				this.id = isPlayer ? 2 : 1; // joiner player=2, host player=1
			} else {
				// Single player or no network - use sequential IDs
				this.id = Player.nextId++;
			}
			// Basic identity
			this.isPlayer = !!isPlayer;
			this.color = color || (this.isPlayer ? "#65c6ff" : "#ff5a5a");
			// All characters get same radius
			this.radius = PLAYER_RADIUS;
			// position (may be adjusted by positionPlayersSafely later)
			this.x = (typeof x === 'number') ? x : CANVAS_W / 2;
			this.y = (typeof y === 'number') ? y : CANVAS_H / 2;
			// placeholder properties that resetStats will set more completely
			this.cards = [];
			this.burning = null;
			this.disabled = false;
			// Initialize gameplay stats
			this.resetStats();
		}

		updateBurning(dt) {
			if (this.burning) {
				this.burning.time += dt;
				if (!this.burning.nextTick) this.burning.nextTick = 0;
				this.burning.nextTick -= dt;
				if (this.burning.nextTick <= 0) {
					this.takeDamage(7);
					this.burning.nextTick = 0.45 + Math.random() * 0.2;
				}
				if (this.burning.time > this.burning.duration) {
					this.burning = null;
				}
				// Spawn flame particles while burning (cap to keep performance)
				if (!this.flameParticles) this.flameParticles = [];
				if (this.flameParticles.length < 14 && Math.random() < 0.9) {
					// add a slight jitter so particles don't stack exactly when stationary
					const jx = (Math.random() - 0.5) * 6;
					const jy = (Math.random() - 0.5) * 6;
					this.flameParticles.push({
						x: this.x + (Math.random() - 0.5) * this.radius * 1.2 + jx,
						y: this.y + (Math.random() - 0.5) * this.radius * 1.2 + jy,
						vx: (Math.random() - 0.5) * 18,
						vy: -30 + Math.random() * -10,
						life: 0.5 + Math.random() * 0.6,
						maxLife: 0.5 + Math.random() * 0.6,
						r: 2 + Math.random() * 3,
						// narrower hue range biased toward red/orange (approx 10-32)
						hue: 10 + Math.random() * 22
					});
				}
			} else {
				// gentle decay when not burning
				if (this.flameParticles) {
					for (let p of this.flameParticles) p.life -= dt * 1.2;
				}
			}
			// Update flame particles
			if (this.flameParticles) {
				for (let p of this.flameParticles) {
					p.x += p.vx * dt;
					p.y += p.vy * dt;
					p.vy += 80 * dt; // slight gravity so flames rise then fall
					p.life -= dt;
				}
				this.flameParticles = this.flameParticles.filter(p => p.life > 0);
			}
		}

		draw(ctx) {
			ctx.save();
			let shakeX = 0, shakeY = 0;
			if (this.shakeTime > 0) {
				let mag = this.shakeMag * (this.shakeTime / 0.18);
				shakeX = rand(-mag, mag);
				shakeY = rand(-mag, mag);
			}
			const drawX = this.x + shakeX;
			const drawY = this.y + shakeY;
			const timeBase = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
			let baseColor = this.color;
			if (this.damageFlash > 0) {
				let t = Math.min(1, this.damageFlash / 0.25);
				if (this.burning) {
					// Fire-damage highlight: warm orange/red tint
					baseColor = this.isPlayer ? "#ffd9b3" : "#ffd0c0";
					ctx.shadowColor = "rgba(255,130,40,0.95)";
					ctx.shadowBlur = 30 * t;
				} else {
					baseColor = this.isPlayer ? "#9af9ff" : "#ffc9c9";
					ctx.shadowColor = "#fff";
					ctx.shadowBlur = 30 * t;
				}
			} else {
				ctx.shadowColor = this.color;
				ctx.shadowBlur = 8;
			}
			// Healing aura (drawn beneath the player)
			if (this.healAura) {
				const t = Math.min(1, this.healAura.time / this.healAura.duration);
				const easedT = 1 - Math.pow(1 - t, 1.6);
				const auraRadius = lerp(this.radius * 1.35, this.healAura.maxRadius, easedT);
				const intensity = Math.min(1.5, (this.healAura.intensity || 0.8));
				const baseAlpha = 0.26 + 0.45 * (1 - t);
				const pulse = 0.14 * Math.sin((t * 3.1 + timeBase / 210) * Math.PI);
				const alpha = Math.max(0, Math.min(0.8, (baseAlpha + pulse) * intensity * 0.75));
				const gradient = ctx.createRadialGradient(drawX, drawY, this.radius * 0.2, drawX, drawY, auraRadius);
				gradient.addColorStop(0, `rgba(190,255,210,${0.62 * intensity})`);
				gradient.addColorStop(0.45, `rgba(120,245,185,${0.42 * intensity})`);
				gradient.addColorStop(1, 'rgba(60,180,120,0)');
				ctx.save();
				ctx.globalCompositeOperation = 'lighter';
				ctx.globalAlpha = alpha;
				ctx.beginPath();
				ctx.fillStyle = gradient;
				ctx.arc(drawX, drawY, auraRadius, 0, Math.PI * 2);
				ctx.fill();
				// Draw a bright rim
				ctx.globalAlpha = Math.max(0, 0.28 * (1 - t) * intensity);
				ctx.lineWidth = 3.0 + this.radius * 0.22;
				ctx.strokeStyle = `rgba(195,255,215,${0.48 * (1 - t)})`;
				ctx.beginPath();
				const rimRadius = auraRadius * (0.88 + 0.06 * Math.sin(timeBase / 120));
				ctx.arc(drawX, drawY, rimRadius, 0, Math.PI * 2);
				ctx.stroke();
				ctx.restore();
			}
			ctx.beginPath();
			ctx.arc(drawX, drawY, this.radius, 0, Math.PI * 2);
			ctx.fillStyle = baseColor;
			ctx.globalAlpha = 1;
			ctx.fill();
			ctx.shadowBlur = 0;
			// Draw burning effect
			if (this.burning) {
				ctx.globalAlpha = 0.6 + 0.25 * Math.sin(Date.now() / 90);
				// soft orange glow beneath the player
				ctx.beginPath();
				ctx.arc(drawX, drawY + 4, this.radius + 10, 0, Math.PI * 2);
				ctx.fillStyle = 'rgba(255,140,40,0.18)';
				ctx.fill();
				ctx.globalAlpha = 1;
			}
			// Draw flame particles for burning visuals
			if (this.flameParticles && this.flameParticles.length) {
				// use additive blending for flames so overlapping particles don't create dark spots
				ctx.save();
				ctx.globalCompositeOperation = 'lighter';
				for (let fp of this.flameParticles) {
					const t = Math.max(0, Math.min(1, fp.life / fp.maxLife));
					// particle core (reduced alpha so multiples don't darken)
					ctx.globalAlpha = Math.max(0, 0.7 * t);
					ctx.beginPath();
					ctx.fillStyle = `hsla(${fp.hue},100%,58%,1)`;
					ctx.arc(fp.x, fp.y, fp.r, 0, Math.PI * 2);
					ctx.fill();
					// soft outer glow (lowered alphas)
					const grad = ctx.createRadialGradient(fp.x, fp.y, 0, fp.x, fp.y, fp.r * 4);
					grad.addColorStop(0, `hsla(${fp.hue},100%,66%,${0.72 * t})`);
					grad.addColorStop(0.5, `hsla(${fp.hue + 12},100%,48%,${0.34 * t})`);
					grad.addColorStop(1, `hsla(${fp.hue + 12},100%,48%,0)`);
					ctx.beginPath();
					ctx.fillStyle = grad;
					ctx.arc(fp.x, fp.y, fp.r * 4, 0, Math.PI * 2);
					ctx.fill();
				}
				ctx.restore();
				ctx.globalAlpha = 1;
			}
			// Healing particles (drawn above player body)
			if (this.healParticles && this.healParticles.length) {
				ctx.save();
				ctx.globalCompositeOperation = 'lighter';
				for (let hp of this.healParticles) {
					const t = Math.max(0, Math.min(1, hp.life / hp.maxLife));
					const eased = Math.pow(t, 0.65);
					const radius = lerp(hp.baseRadius, hp.targetRadius, eased) + Math.sin((hp.life * hp.waveFreq) + hp.waveOffset) * hp.waveAmp;
					const px = drawX + Math.cos(hp.angle) * radius + hp.driftX;
					const py = drawY + Math.sin(hp.angle) * radius + hp.driftY;
					const fade = Math.max(0, 1 - t);
					const alpha = Math.max(0, Math.min(0.9, (0.55 + 0.22 * hp.burst) * fade));
					ctx.globalAlpha = alpha;
					const grad = ctx.createRadialGradient(px, py, 0, px, py, hp.size * 3.0);
					grad.addColorStop(0, 'rgba(200,255,210,0.78)');
					grad.addColorStop(0.45, 'rgba(130,245,185,0.44)');
					// use transparent green-ish color matching the heal particle gradient to avoid black fringe
					grad.addColorStop(1, 'rgba(130,245,185,0)');
					ctx.beginPath();
					ctx.fillStyle = grad;
					const scale = 0.88 + 0.18 * Math.sin((timeBase / 150) + hp.phase);
					ctx.arc(px, py, Math.max(1.2, hp.size * scale * 0.8), 0, Math.PI * 2);
					ctx.fill();
				}
				ctx.restore();
			}
			// Green healbar flash for life steal
			if (this.healbarFlash > 0) {
				let t = Math.min(1, this.healbarFlash / 0.7);
				ctx.save();
				ctx.globalAlpha = 0.18 * t;
				ctx.fillStyle = '#6cff6c';
				ctx.fillRect(drawX - 32, drawY - 38, 64, 12);
				ctx.restore();
			}
			ctx.restore();
		}

		update(dt) {
			if (this.healAura) {
				this.healAura.time += dt;
				if (this.healAura.time >= this.healAura.duration) {
					this.healAura = null;
				}
			}
			if (this.healParticles && this.healParticles.length) {
				for (let hp of this.healParticles) {
					hp.life += dt;
					hp.angle += hp.spin * dt;
					hp.driftX += hp.driftVX * dt;
					hp.driftY += hp.driftVY * dt;
					hp.driftVX *= (1 - 1.8 * dt);
					hp.driftVY *= (1 - 1.2 * dt);
				}
				this.healParticles = this.healParticles.filter(hp => hp.life < hp.maxLife);
			}
			// Green healbar flash
			if (this.healbarFlash > 0) this.healbarFlash -= dt;
		}

		reset(x, y) {
			this.x = x;
			this.y = y;
			this.health = this.healthMax;
			this.timeSinceShot = 0;
			this.dashCooldown = 0;
			this.dashActive = false;
			this.dashTime = 0;
			this.shakeTime = 0;
			this.shakeMag = 0;
			this.damageFlash = 0;
			this.healthbarFlash = 0;
			this.healbarFlash = 0;
			this.healParticles = [];
			this.healAura = null;
		}

		// Fully reset gameplay-affecting stats (used when starting a fresh game)
		resetStats() {
			this.healthMax = HEALTH_MAX;
			this.health = HEALTH_MAX;
			this.score = 0;
			// All characters (host, joiner, AI) get same base stats
			this.speed = PLAYER_SPEED;
			this.bulletSpeed = BULLET_SPEED;
			this.bulletRadius = BULLET_RADIUS;
			this.bulletDamage = BULLET_DAMAGE;
			this.shootInterval = SHOOT_INTERVAL;
			this.timeSinceShot = 0;
			this.target = { x: this.x, y: this.y };
			this.healOnKill = false;
			this.lifeStealPct = 0;
			this.doubleShot = false;
			this.pierce = false;
			this.dash = true;
			this.dashCooldown = 0;
			this.dashActive = false;
			this.dashDir = { x: 0, y: 0 };
			this.dashTime = 0;
			this.dashPower = 1;
			this.ricochet = 0;
			this.bigShotStacks = 0;
			this.bigShotPending = false;
			this.obliterator = false;
			this.obliteratorStacks = 0;
			this.explosive = false;
			this.shakeTime = 0;
			this.shakeMag = 0;
			this.damageFlash = 0;
			this.healthbarFlash = 0;
			this.healbarFlash = 0;
			this.healParticles = [];
			this.healAura = null;
			this.cards = [];
			// Developer/testing flag: invincibility (toggled via dev console)
			this.invincible = false;
			this.flameParticles = [];
		}

		shootToward(target, bullets) {
			let angle = Math.atan2(target.y - this.y, target.x - this.x);
			// number of projectiles: base 1 + spread (additional per Spread+ card)
			let total = 1 + (this.spread || 0);
			// Big Shot modifiers apply to the next shot after dashing
			let bigStacks = (this.bigShotStacks || 0);
			let applyBig = this.bigShotPending && bigStacks > 0;
			// size multiplier: 1 + stacks (1 stack -> x2), speed multiplier: 0.5 ^ stacks
			let sizeMult = applyBig ? (1 + bigStacks) : 1;
			let speedMult = applyBig ? Math.pow(0.5, bigStacks) : 1;
			if (total <= 1) {
				let b = new Bullet(this, this.x, this.y, angle);
				if (applyBig) { b.radius *= sizeMult; b.speed *= speedMult; }
				b.justFired = true; // mark for multiplayer sync
				bullets.push(b);
			} else {
				// spread symmetrically around aim angle
				let spreadArc = Math.min(Math.PI / 3, 0.16 * total); // narrow for small counts, grows with count
				for (let i = 0; i < total; ++i) {
					let t = total === 1 ? 0.5 : i / (total - 1);
					let a = lerp(-spreadArc / 2, spreadArc / 2, t);
					let b = new Bullet(this, this.x, this.y, angle + a);
					if (applyBig) { b.radius *= sizeMult; b.speed *= speedMult; }
					b.justFired = true; // mark for multiplayer sync
					bullets.push(b);
				}
			}
			// clear pending after firing the modified shot
			if (applyBig) this.bigShotPending = false;
			playGunShot();
		}

		triggerHealingEffect(amount, opts = {}) {
			if (!amount || amount <= 0) return;
			const heal = amount;
			// Visual cap so very large heals still look reasonable
			const VISUAL_HEAL_CAP = 48; // heals above this still heal normally but visuals cap
			const visualHeal = Math.min(heal, VISUAL_HEAL_CAP);
			const duration = clamp(0.7 + visualHeal * 0.035, 0.8, 2.2);
			const intensity = Math.min(1.4, (opts.intensityOverride || 0) + 0.5 + visualHeal / 36);
			this.healbarFlash = Math.max(this.healbarFlash || 0, 0.7 + Math.min(visualHeal, 28) * 0.006);
			this.healAura = {
				time: 0,
				duration,
				maxRadius: this.radius * (1.6 + Math.min(visualHeal, 60) * 0.018),
				intensity
			};
			if (!this.healParticles) this.healParticles = [];
			const particleCount = Math.min(84, Math.max(12, Math.round(12 + visualHeal * 1.1)));
			for (let i = 0; i < particleCount; ++i) {
				if (this.healParticles.length > 120) this.healParticles.shift();
				this.healParticles.push(this._createHealingParticle(duration, intensity));
			}
			if (!opts.skipSync) {
				try { typeof createSyncedHealingEffect === 'function' && createSyncedHealingEffect(this, heal, intensity); } catch (e) {}
			}
		}

		_createHealingParticle(duration, intensity) {
			const spinDir = Math.random() > 0.5 ? 1 : -1;
			const burst = Math.random() * 0.65 + intensity * 0.15;
			return {
				angle: Math.random() * Math.PI * 2,
				baseRadius: this.radius * (0.45 + Math.random() * 0.55),
				targetRadius: this.radius * (1.25 + Math.random() * 1.1 + intensity * 0.4),
				life: 0,
				maxLife: duration * (0.55 + Math.random() * 0.65),
				spin: spinDir * (0.8 + Math.random() * 1.3),
				size: 3.4 + Math.random() * 4.2,
				burst,
				phase: Math.random() * Math.PI * 2,
				waveOffset: Math.random() * Math.PI * 2,
				waveFreq: 6 + Math.random() * 4,
				waveAmp: this.radius * (0.08 + Math.random() * 0.12),
				driftX: 0,
				driftY: 0,
				driftVX: (Math.random() - 0.5) * 24,
				driftVY: (Math.random() - 0.5) * 18
			};
		}

		takeDamage(dmg) {
			// Respect invincibility toggle (dev command)
			if (this.invincible) {
				// Small visual feedback that damage was blocked
				this.shakeTime = 0.08;
				this.damageFlash = 0.12;
				return;
			}
			this.health -= dmg;
			// Life Steal: if the attacker has lifeStealPct, heal them for a percent of damage dealt
			if (this._lastAttacker && this._lastAttacker.lifeStealPct > 0 && dmg > 0) {
				const healAmt = Math.round(dmg * this._lastAttacker.lifeStealPct);
				if (healAmt > 0) {
					this._lastAttacker.health = Math.min(this._lastAttacker.health + healAmt, this._lastAttacker.healthMax || 100);
					this._lastAttacker.triggerHealingEffect(healAmt);
				}
			}
			// Visual feedback
			this.shakeTime = 0.20;
			this.shakeMag = 8;
			this.damageFlash = 0.25;
			this.healthbarFlash = 0.45;
			playHit();
			// If host in multiplayer, inform joiner to play hit animation for this role
			// Use new sync helper for damage flash
			try { createSyncedDamageFlash && createSyncedDamageFlash(this, dmg, !!this.burning); } catch (e) {}
		}

		// Apply visual-only damage flash (used by joiner when processing network events)
		applyDamageFlash(damage, isBurning) {
			// Visual feedback only: do not modify health here
			this.shakeTime = 0.20;
			this.shakeMag = 8;
			this.damageFlash = 0.25;
			this.healthbarFlash = 0.45;
			if (isBurning && !this.burning) {
				// show a brief burning indicator without applying damage logic
				this.burning = { time: 0, duration: 2.0 };
			}
			try { playHit(); } catch (e) { /* ignore audio errors */ }
		}

		addCard(cardName) {
			// allow duplicate cards so stacking works
			this.cards.push(cardName);
			try { updateCardsUI && updateCardsUI(); } catch (e) {}
		}
	}

	globalObj.Player = Player;
	try {
		if (typeof module !== 'undefined' && module.exports) {
			module.exports = Player;
		}
	} catch (e) {}
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
