;(function(root) {
	const globalObj = root || (typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));

    // --- Healer Class ---
    class Healer {
        static nextId = 1000; // Use 1000+ range to avoid collision with player IDs (1,2)

        constructor(x, y) {
            this.id = Healer.nextId++;
            this.x = x;
            this.y = y;
            this.radius = 22;
            this.color = '#4CFF7A';
            this.healthMax = 95;
            this.health = this.healthMax;
            this.speed = 80;
            this.wanderDir = Math.random() * Math.PI * 2;
            this.wanderTimer = 0;
            this.targetPos = null;
            // Slightly larger aura and slower tick rate for gentler healing
            this.healRadius = 160;
            this.healPerTick = 5;
            this.healTickRate = 0.7;
            this._healTimer = 0;
            this.active = true;
            this.damageFlash = 0;
            this.shakeTime = 0;
            this.shakeMag = 0;
            this._lastAttacker = null;
            this.burning = null;
            this.flameParticles = [];
        }

        reset(x, y) {
            this.x = x;
            this.y = y;
            this.health = this.healthMax;
            this.active = true;
            this.wanderDir = Math.random() * Math.PI * 2;
            this.wanderTimer = 0;
            this.targetPos = null;
            this._healTimer = 0;
            this.damageFlash = 0;
            this.shakeTime = 0;
            this.shakeMag = 0;
            this.burning = null;
            this.flameParticles = [];
        }

        takeDamage(amount, attacker = null) {
            if (!this.active) return;
            if (amount <= 0) return;
            this.health -= amount;
            this.damageFlash = 0.35;
            this.shakeTime = 0.22;
            this.shakeMag = 10;
            this._lastAttacker = attacker;
            if (this.health <= 0) {
                this.health = 0;
                this.active = false;
                this._lastAttacker = null;
                this.burning = null;
                this.flameParticles = [];
                try { if (typeof createSyncedDamageFlash === 'function') createSyncedDamageFlash(this, amount, false); } catch (e) {}
            } else {
                try { if (typeof createSyncedDamageFlash === 'function') createSyncedDamageFlash(this, amount, false); } catch (e) {}
            }
        }

        applyDamageFlash(amount, isBurning = false) {
            this.damageFlash = 0.35;
            this.shakeTime = 0.22;
            this.shakeMag = 10;
            if (isBurning && !this.burning) {
                this.burning = { time: 0, duration: 0.6, nextTick: 0.45 };
            }
        }

        applyHealingAura(players, dt) {
            this._healTimer += dt;
            if (this._healTimer < this.healTickRate) return;
            this._healTimer = 0;
            const targets = new Set();
            if (Array.isArray(players)) {
                for (const ent of players) {
                    if (ent) targets.add(ent);
                }
            }
            targets.add(this);
            for (let p of targets) {
                if (!p) continue;
                if (p.health <= 0 || p.health >= p.healthMax) continue;
                const d = dist(this.x, this.y, p.x, p.y);
                if (d <= this.healRadius) {
                    const prev = p.health;
                    p.health = Math.min(p.health + this.healPerTick, p.healthMax);
                    const healed = p.health - prev;
                    if (healed > 0) {
                        if (typeof p.triggerHealingEffect === 'function') {
                            // let players show their existing healing animation
                            p.triggerHealingEffect(healed, { intensityOverride: 0.6 });
                        } else if (p === this) {
                            // Healer self-heal: use its own animation helper
                            try { this.triggerHealingEffect(healed, { intensityOverride: 0.6 }); } catch (e) {}
                        }
                    }
                }
            }
        }

        // Show healing visuals and optionally sync to joiner (similar to Player.triggerHealingEffect)
        triggerHealingEffect(amount, opts = {}) {
            if (!amount || amount <= 0) return;
            const heal = amount;
            const VISUAL_HEAL_CAP = 48;
            const visualHeal = Math.min(heal, VISUAL_HEAL_CAP);
            const duration = Math.max(0.8, Math.min(2.2, 0.7 + visualHeal * 0.035));
            const intensity = Math.min(1.4, (opts.intensityOverride || 0) + 0.5 + visualHeal / 36);
            this.healbarFlash = Math.max(this.healbarFlash || 0, 0.7 + Math.min(visualHeal, 28) * 0.006);
            this.healAura = {
                time: 0,
                duration,
                maxRadius: this.radius * (1.6 + Math.min(visualHeal, 60) * 0.018),
                intensity
            };
            if (!this.healParticles) this.healParticles = [];
            const particleCount = Math.min(64, Math.max(8, Math.round(8 + visualHeal * 0.9)));
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
            const burst = Math.random() * 0.5 + intensity * 0.12;
            return {
                angle: Math.random() * Math.PI * 2,
                baseRadius: this.radius * (0.45 + Math.random() * 0.55),
                targetRadius: this.radius * (1.25 + Math.random() * 1.1 + intensity * 0.4),
                life: 0,
                maxLife: duration * (0.55 + Math.random() * 0.65),
                spin: spinDir * (0.8 + Math.random() * 1.3),
                size: 2.6 + Math.random() * 3.6,
                burst,
                phase: Math.random() * Math.PI * 2,
                waveOffset: Math.random() * Math.PI * 2,
                hue: 120 + Math.random() * 28
            };
        }

        updateBurning(dt, applyDamage = true) {
            if (!this.burning && (!this.flameParticles || !this.flameParticles.length)) return;
            if (this.burning) {
                this.burning.time += dt;
                if (!this.burning.nextTick) this.burning.nextTick = 0.45 + Math.random() * 0.2;
                if (applyDamage) {
                    this.burning.nextTick -= dt;
                    if (this.burning.nextTick <= 0) {
                        this.takeDamage(7, this._lastAttacker);
                        this.burning.nextTick = 0.45 + Math.random() * 0.2;
                    }
                }
                if (this.burning.time > this.burning.duration) {
                    this.burning = null;
                }
                if (!this.flameParticles) this.flameParticles = [];
                if (this.flameParticles.length < 14 && Math.random() < 0.9) {
                    const jitterX = (Math.random() - 0.5) * 6;
                    const jitterY = (Math.random() - 0.5) * 6;
                    this.flameParticles.push({
                        x: this.x + (Math.random() - 0.5) * this.radius * 1.3 + jitterX,
                        y: this.y + (Math.random() - 0.5) * this.radius * 1.3 + jitterY,
                        vx: (Math.random() - 0.5) * 18,
                        vy: -32 + Math.random() * -12,
                        life: 0.5 + Math.random() * 0.6,
                        maxLife: 0.5 + Math.random() * 0.6,
                        r: 2 + Math.random() * 3,
                        hue: 12 + Math.random() * 26
                    });
                }
            } else if (this.flameParticles) {
                for (let p of this.flameParticles) p.life -= dt * 1.1;
            }
            if (this.flameParticles) {
                for (let p of this.flameParticles) {
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                    p.vy += 78 * dt;
                    p.life -= dt;
                }
                this.flameParticles = this.flameParticles.filter(p => p.life > 0);
            }
        }

        update(dt, players, options = {}) {
            if (!this.active) return;
            if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt);
            if (this.shakeTime > 0) this.shakeTime = Math.max(0, this.shakeTime - dt);

            const applyGameLogic = options.applyGameLogic !== false;
            this.updateBurning(dt, applyGameLogic);

            // Wander logic: pick a random direction every few seconds
            if (applyGameLogic) {
                this.wanderTimer -= dt;
                if (this.wanderTimer <= 0 || !this.targetPos) {
                    this.wanderTimer = 1.5 + Math.random() * 2.5;
                    const nx = this.x + Math.cos(this.wanderDir) * 280 + (Math.random() - 0.5) * 180;
                    const ny = this.y + Math.sin(this.wanderDir) * 280 + (Math.random() - 0.5) * 180;
                    this.targetPos = {
                        x: clamp(nx, this.radius, CANVAS_W - this.radius),
                        y: clamp(ny, this.radius, CANVAS_H - this.radius)
                    };
                    this.wanderDir = Math.atan2(this.targetPos.y - this.y, this.targetPos.x - this.x) + (Math.random() - 0.5) * 0.8;
                }

                if (this.targetPos) {
                    const dx = this.targetPos.x - this.x;
                    const dy = this.targetPos.y - this.y;
                    const distTo = Math.hypot(dx, dy);
                    if (distTo > 6) {
                        const vx = (dx / distTo) * this.speed;
                        const vy = (dy / distTo) * this.speed;
                        // Axis-separate movement so we can resolve obstacle collisions like players
                        const oldX = this.x, oldY = this.y;
                        // move X, clamp to bounds
                        this.x += vx * dt;
                        this.x = Math.max(this.radius, Math.min((typeof CANVAS_W !== 'undefined' ? CANVAS_W : 1300) - this.radius, this.x));
                        let collidedX = false;
                        try {
                            if (Array.isArray(obstacles)) {
                                for (let o of obstacles) {
                                    if (o && typeof o.circleCollide === 'function' && o.circleCollide(this.x, this.y, this.radius)) {
                                        this.x = oldX;
                                        collidedX = true;
                                        break;
                                    }
                                }
                            }
                        } catch (e) {}
                        // move Y, clamp to bounds
                        this.y += vy * dt;
                        this.y = Math.max(this.radius, Math.min((typeof CANVAS_H !== 'undefined' ? CANVAS_H : 650) - this.radius, this.y));
                        let collidedY = false;
                        try {
                            if (Array.isArray(obstacles)) {
                                for (let o of obstacles) {
                                    if (o && typeof o.circleCollide === 'function' && o.circleCollide(this.x, this.y, this.radius)) {
                                        this.y = oldY;
                                        collidedY = true;
                                        break;
                                    }
                                }
                            }
                        } catch (e) {}
                        // If collided on either axis, pick a new random target to avoid hugging obstacles
                        if (collidedX || collidedY) {
                            this.targetPos = null;
                            this.wanderTimer = 0.2 + Math.random() * 1.0; // small pause before next direction
                        }
                    } else {
                        this.targetPos = null;
                    }
                }

                // Healing aura
                this.applyHealingAura(players || [], dt);
            }

            // Tick healing visuals (always run on both host and joiner so animations play)
            if (this.healAura) {
                this.healAura.time += dt;
                if (this.healAura.time >= this.healAura.duration) this.healAura = null;
            }
            if (this.healParticles && this.healParticles.length) {
                for (let hp of this.healParticles) {
                    hp.life += dt;
                    hp.angle += (hp.spin || 0) * dt;
                    // small radial drift so particles separate a bit
                    if (typeof hp.driftX === 'undefined') { hp.driftX = 0; hp.driftY = 0; hp.driftVX = (Math.random()-0.5)*8; hp.driftVY = (Math.random()-0.5)*8; }
                    hp.driftX += (hp.driftVX || 0) * dt;
                    hp.driftY += (hp.driftVY || 0) * dt;
                }
                this.healParticles = this.healParticles.filter(hp => hp.life < hp.maxLife);
            }
        }

        draw(ctx) {
            if (!this.active) return;

            ctx.save();
            // Draw healing aura
            const grad = ctx.createRadialGradient(this.x, this.y, this.radius * 0.6, this.x, this.y, this.healRadius);
            grad.addColorStop(0, 'rgba(76,255,122,0.55)');
            grad.addColorStop(1, 'rgba(76,255,122,0)');
            ctx.fillStyle = grad;
            ctx.globalAlpha = 0.85;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.healRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.globalAlpha = 1;
            // Outline
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#2bd96b';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.healRadius, 0, Math.PI * 2);
            ctx.stroke();

            // Draw healer body
            const shakeX = (this.shakeTime > 0) ? (Math.random() - 0.5) * this.shakeMag : 0;
            const shakeY = (this.shakeTime > 0) ? (Math.random() - 0.5) * this.shakeMag : 0;
            // Draw any triggered heal aura (visual effect) beneath the body
            if (this.healAura) {
                const t = Math.min(1, this.healAura.time / this.healAura.duration);
                const easedT = 1 - Math.pow(1 - t, 1.6);
                const auraRadius = lerp(this.radius * 1.35, this.healAura.maxRadius, easedT);
                const intensity = Math.min(1.5, (this.healAura.intensity || 0.8));
                const baseAlpha = 0.26 + 0.45 * (1 - t);
                const pulse = 0.14 * Math.sin((t * 3.1 + (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 210) * Math.PI);
                const alpha = Math.max(0, Math.min(0.8, (baseAlpha + pulse) * intensity * 0.75));
                const gradient = ctx.createRadialGradient(this.x + shakeX, this.y + shakeY, this.radius * 0.2, this.x + shakeX, this.y + shakeY, auraRadius);
                gradient.addColorStop(0, `rgba(190,255,210,${0.62 * intensity})`);
                gradient.addColorStop(0.45, `rgba(120,245,185,${0.42 * intensity})`);
                gradient.addColorStop(1, 'rgba(60,180,120,0)');
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha;
                ctx.beginPath();
                ctx.fillStyle = gradient;
                ctx.arc(this.x + shakeX, this.y + shakeY, auraRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            ctx.beginPath();
            ctx.arc(this.x + shakeX, this.y + shakeY, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();

            if (this.flameParticles && this.flameParticles.length) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                for (let p of this.flameParticles) {
                    const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
                    ctx.globalAlpha = alpha * 0.85;
                    ctx.fillStyle = `hsl(${p.hue}, 92%, 62%)`;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }

            // Healing particles (draw above the healer body)
            if (this.healParticles && this.healParticles.length) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                for (let hp of this.healParticles) {
                    const t = Math.max(0, Math.min(1, hp.life / hp.maxLife));
                    const eased = Math.pow(t, 0.65);
                    const radius = lerp(hp.baseRadius, hp.targetRadius, eased);
                    const px = this.x + Math.cos(hp.angle) * radius + (hp.driftX || 0);
                    const py = this.y + Math.sin(hp.angle) * radius + (hp.driftY || 0);
                    const fade = Math.max(0, 1 - t);
                    const alpha = Math.max(0, Math.min(0.9, (0.55 + 0.22 * (hp.burst || 0)) * fade));
                    ctx.globalAlpha = alpha;
                    const grad = ctx.createRadialGradient(px, py, 0, px, py, hp.size * 3.0);
                    grad.addColorStop(0, 'rgba(200,255,210,0.78)');
                    grad.addColorStop(0.45, 'rgba(130,245,185,0.44)');
                    grad.addColorStop(1, 'rgba(130,245,185,0)');
                    ctx.beginPath();
                    ctx.fillStyle = grad;
                    const scale = 0.88 + 0.18 * Math.sin(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) / 150 + (hp.phase || 0));
                    ctx.arc(px, py, Math.max(1.2, hp.size * scale * 0.8), 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }

            if (this.damageFlash > 0) {
                ctx.globalAlpha = Math.min(1, this.damageFlash * 2.2);
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(this.x + shakeX, this.y + shakeY, this.radius + 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            // Health bar
            const barWidth = 48;
            const barHeight = 6;
            const barX = this.x - barWidth / 2;
            const barY = this.y - this.radius - 14;
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            ctx.fillStyle = '#3cff88';
            const hpRatio = this.health / this.healthMax;
            ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barWidth, barHeight);

            ctx.restore();
        }
    }

	globalObj.Healer = Healer;
	try {
		if (typeof module !== 'undefined' && module.exports) {
			module.exports = Healer;
		}
	} catch (e) {}
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
