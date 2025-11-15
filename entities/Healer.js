/**
 * Healer - Wandering healing entity (world modifier)
 */
class Healer {
    static nextId = 1000;

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
        
        // Healing aura
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

        // Death / damage animation state (make healers behave like fighters)
        this.alive = true;
        this.dying = false;
        this.deathTimer = 0;
        this.deathDuration = 1.5;
        this.deathVelocityX = 0;
        this.deathVelocityY = 0;
        this.deathAngularVelocity = 0;
        this.deathRotation = 0;
        this.bloodParticles = [];
        
        // Healing visual effects
        this.healAura = null;
        this.healParticles = [];
        this.healbarFlash = 0;
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
            // Begin death animation similar to fighters
            this.alive = false;
            this.dying = true;
            this.deathTimer = 0;

            // Calculate knockback based on damage dealt
            const knockbackScale = Math.min(amount / 18, 10);
            const baseKnockback = 220;
            const knockbackSpeed = baseKnockback * knockbackScale;

            // If attacker provided and has position, use it, otherwise random
            if (attacker && typeof attacker.x === 'number' && typeof attacker.y === 'number') {
                const angle = Math.atan2(this.y - attacker.y, this.x - attacker.x);
                this.deathVelocityX = Math.cos(angle) * knockbackSpeed;
                this.deathVelocityY = Math.sin(angle) * knockbackSpeed;
            } else {
                const angle = Math.random() * Math.PI * 2;
                this.deathVelocityX = Math.cos(angle) * knockbackSpeed * 0.5;
                this.deathVelocityY = Math.sin(angle) * knockbackSpeed * 0.5;
            }

            this.deathAngularVelocity = (Math.random() - 0.5) * knockbackScale * 8;

            // Create blood particles
            this._createBloodParticles(amount, attacker && attacker.x, attacker && attacker.y);
        }
    }

    _createBloodParticles(damage, sourceX, sourceY) {
        // Scale particle count by damage (similar to fighters)
        const baseCount = 6;
        const damageScale = Math.min(damage / 18, 5);
        const particleCount = Math.floor(baseCount * damageScale);

        let sprayAngle = 0;
        if (typeof sourceX === 'number' && typeof sourceY === 'number') {
            sprayAngle = Math.atan2(this.y - sourceY, this.x - sourceX);
        }

        for (let i = 0; i < particleCount; i++) {
            const spread = Math.PI * 0.9;
            const angle = sprayAngle + (Math.random() - 0.5) * spread;
            const speed = 60 + Math.random() * 100 * damageScale;

            this.bloodParticles.push({
                x: this.x + (Math.random() - 0.5) * this.radius,
                y: this.y + (Math.random() - 0.5) * this.radius,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 40,
                life: 0.4 + Math.random() * 0.5,
                maxLife: 0.4 + Math.random() * 0.5,
                size: 1.6 + Math.random() * 2.8,
                color: Math.random() > 0.5 ? '#c41e1e' : '#8b0000'
            });
        }
    }

    ignite(attacker = null, stacks = 1) {
        const power = Math.max(1, stacks || 1);
        const duration = 1.2 + 1.3 * power;
        this.burning = {
            time: 0,
            duration,
            nextTick: 0.45 + Math.random() * 0.2,
            power
        };
        if (!Array.isArray(this.flameParticles)) this.flameParticles = [];
        this._lastAttacker = attacker || this._lastAttacker;
        if (typeof Fighter !== 'undefined' && Fighter._audioManager && typeof Fighter._audioManager.playBurning === 'function') {
            Fighter._audioManager.playBurning(duration);
        }
    }

    applyHealingAura(fighters, dt) {
        this._healTimer += dt;
        if (this._healTimer < this.healTickRate) return;
        this._healTimer = 0;
        
        const targets = new Set(fighters);
        targets.add(this);
        
        for (let target of targets) {
            if (!target) continue;
            if (target.health <= 0 || target.health >= target.healthMax) continue;
            
            const d = dist(this.x, this.y, target.x, target.y);
            if (d <= this.healRadius) {
                const prev = target.health;
                target.health = Math.min(target.health + this.healPerTick, target.healthMax);
                const healed = target.health - prev;
                
                if (healed > 0) {
                    target.triggerHealingEffect(healed);
                }
            }
        }
    }

    triggerHealingEffect(amount) {
        if (!amount || amount <= 0) return;
        
        const VISUAL_HEAL_CAP = 48;
        const visualHeal = Math.min(amount, VISUAL_HEAL_CAP);
        const duration = Math.max(0.8, Math.min(2.2, 0.7 + visualHeal * 0.035));
        const intensity = Math.min(1.4, 0.5 + visualHeal / 36);
        
        this.healbarFlash = Math.max(this.healbarFlash || 0, 0.7 + Math.min(visualHeal, 28) * 0.006);
        this.healAura = {
            time: 0,
            duration,
            maxRadius: this.radius * (1.6 + Math.min(visualHeal, 60) * 0.018),
            intensity
        };
        
        if (!this.healParticles) this.healParticles = [];
        const particleCount = Math.min(64, Math.max(8, Math.round(8 + visualHeal * 0.9)));
        
        for (let i = 0; i < particleCount; i++) {
            if (this.healParticles.length > 120) this.healParticles.shift();
            this.healParticles.push(this._createHealingParticle(duration, intensity));
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
            hue: 120 + Math.random() * 28,
            driftX: 0,
            driftY: 0,
            driftVX: (Math.random() - 0.5) * 8,
            driftVY: (Math.random() - 0.5) * 8
        };
    }

    updateBurning(dt) {
        if (!this.burning && (!this.flameParticles || !this.flameParticles.length)) return;
        
        if (this.burning) {
            this.burning.time += dt;
            if (!this.burning.nextTick) this.burning.nextTick = 0.45 + Math.random() * 0.2;
            
            this.burning.nextTick -= dt;
            if (this.burning.nextTick <= 0) {
                this.takeDamage(7, this._lastAttacker);
                this.burning.nextTick = 0.45 + Math.random() * 0.2;
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

    update(dt, fighters, obstacles) {
        // If dying, advance death animation (keep healer present until finished)
        if (this.dying) {
            this.deathTimer += dt;

            // Apply death velocity with friction
            const friction = 0.92;
            this.deathVelocityX *= friction;
            this.deathVelocityY *= friction;
            this.x += this.deathVelocityX * dt;
            this.y += this.deathVelocityY * dt;

            // Apply rotation
            this.deathRotation += this.deathAngularVelocity * dt;
            this.deathAngularVelocity *= 0.95;

            // Update blood particles
            if (this.bloodParticles) {
                for (let p of this.bloodParticles) {
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                    p.vy += 400 * dt; // gravity
                    p.vx *= 0.98;
                    p.life -= dt;
                }
                this.bloodParticles = this.bloodParticles.filter(p => p.life > 0);
            }

            // Continue updating burning/flame particles while dying
            this.updateBurning(dt);

            // End death animation
            if (this.deathTimer >= this.deathDuration) {
                this.dying = false;
                this.active = false;
            }
            return;
        }

        if (!this.active) return;

        if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt);
        if (this.shakeTime > 0) this.shakeTime = Math.max(0, this.shakeTime - dt);
        if (this.healbarFlash > 0) this.healbarFlash = Math.max(0, this.healbarFlash - dt);

        this.updateBurning(dt);
        
        // Wander logic
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
                const oldX = this.x, oldY = this.y;
                
                // Move X
                this.x += vx * dt;
                this.x = clamp(this.x, this.radius, CANVAS_W - this.radius);
                
                let collidedX = false;
                for (let o of obstacles) {
                    if (o.destroyed) continue;
                    if (o.circleCollide(this.x, this.y, this.radius)) {
                        this.x = oldX;
                        collidedX = true;
                        break;
                    }
                }
                
                // Move Y
                this.y += vy * dt;
                this.y = clamp(this.y, this.radius, CANVAS_H - this.radius);
                
                let collidedY = false;
                for (let o of obstacles) {
                    if (o.destroyed) continue;
                    if (o.circleCollide(this.x, this.y, this.radius)) {
                        this.y = oldY;
                        collidedY = true;
                        break;
                    }
                }
                
                if (collidedX || collidedY) {
                    this.targetPos = null;
                    this.wanderTimer = 0.2 + Math.random() * 1.0;
                }
            } else {
                this.targetPos = null;
            }
        }
        
        // Healing aura
        this.applyHealingAura(fighters, dt);
        
        // Update healing visuals
        if (this.healAura) {
            this.healAura.time += dt;
            if (this.healAura.time >= this.healAura.duration) this.healAura = null;
        }
        
        if (this.healParticles && this.healParticles.length) {
            for (let hp of this.healParticles) {
                hp.life += dt;
                hp.angle += (hp.spin || 0) * dt;
                hp.driftX += (hp.driftVX || 0) * dt;
                hp.driftY += (hp.driftVY || 0) * dt;
            }
            this.healParticles = this.healParticles.filter(hp => hp.life < hp.maxLife);
        }
    }

    draw(ctx) {
        if (!this.active) return;

        ctx.save();
        // Death animation: fade out and apply rotation if dying
        if (this.dying) {
            const fadeProgress = Math.min(1, this.deathTimer / this.deathDuration);
            ctx.globalAlpha = 1 - fadeProgress * 0.7; // fade to 30%
            if (this.deathRotation !== 0) {
                ctx.translate(this.x, this.y);
                ctx.rotate(this.deathRotation);
                ctx.translate(-this.x, -this.y);
            }
        }
        
        // Draw healing aura background
        const grad = ctx.createRadialGradient(this.x, this.y, this.radius * 0.6, this.x, this.y, this.healRadius);
        grad.addColorStop(0, 'rgba(76,255,122,0.35)');
        grad.addColorStop(1, 'rgba(76,255,122,0)');
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.healRadius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.globalAlpha = 1;
        // Outline
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#1f7a4a';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.healRadius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Shake effect
        const shakeX = (this.shakeTime > 0) ? (Math.random() - 0.5) * this.shakeMag : 0;
        const shakeY = (this.shakeTime > 0) ? (Math.random() - 0.5) * this.shakeMag : 0;
        
        // Draw triggered heal aura (visual effect)
        if (this.healAura) {
            const t = Math.min(1, this.healAura.time / this.healAura.duration);
            const easedT = 1 - Math.pow(1 - t, 1.6);
            const auraRadius = lerp(this.radius * 1.35, this.healAura.maxRadius, easedT);
            const intensity = Math.min(1.5, (this.healAura.intensity || 0.8));
            const baseAlpha = 0.26 + 0.45 * (1 - t);
            const pulse = 0.14 * Math.sin((t * 3.1 + Date.now() / 210) * Math.PI);
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
        
        // Draw healer body
        ctx.beginPath();
        ctx.arc(this.x + shakeX, this.y + shakeY, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        
        // Draw flame particles if burning
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

        // Draw blood particles (if any)
        if (this.bloodParticles && this.bloodParticles.length > 0) {
            ctx.save();
            for (let p of this.bloodParticles) {
                const t = Math.max(0, Math.min(1, p.life / p.maxLife));
                ctx.globalAlpha = t * 0.9;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
        
        // Draw healing particles
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
                const scale = 0.88 + 0.18 * Math.sin(Date.now() / 150 + (hp.phase || 0));
                ctx.arc(px, py, Math.max(1.2, hp.size * scale * 0.8), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
        
        // Damage flash
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

// Export to window
Healer.prototype.serialize = function() {
    return StateSerializer.serialize(this, {
        force: true,
        exclude: ['_lastAttacker']
    });
};

Healer.fromState = function(data) {
    if (!data) return null;

    const x = typeof data.x === 'number' ? data.x : 0;
    const y = typeof data.y === 'number' ? data.y : 0;
    const healer = new Healer(x, y);

    if (typeof data.id === 'number') {
        healer.id = data.id;
        if (typeof Healer.nextId === 'number') {
            Healer.nextId = Math.max(Healer.nextId, data.id + 1);
        }
    }

    // Copy primitive and simple structured state
    healer.radius = typeof data.radius === 'number' ? data.radius : healer.radius;
    healer.color = typeof data.color === 'string' ? data.color : healer.color;
    healer.healthMax = typeof data.healthMax === 'number' ? data.healthMax : healer.healthMax;
    healer.health = typeof data.health === 'number' ? data.health : healer.health;
    healer.speed = typeof data.speed === 'number' ? data.speed : healer.speed;
    healer.wanderDir = typeof data.wanderDir === 'number' ? data.wanderDir : healer.wanderDir;
    healer.wanderTimer = typeof data.wanderTimer === 'number' ? data.wanderTimer : healer.wanderTimer;
    healer.targetPos = data.targetPos ? { x: data.targetPos.x, y: data.targetPos.y } : null;
    healer.healRadius = typeof data.healRadius === 'number' ? data.healRadius : healer.healRadius;
    healer.healPerTick = typeof data.healPerTick === 'number' ? data.healPerTick : healer.healPerTick;
    healer.healTickRate = typeof data.healTickRate === 'number' ? data.healTickRate : healer.healTickRate;
    healer._healTimer = typeof data._healTimer === 'number' ? data._healTimer : healer._healTimer;
    healer.active = typeof data.active === 'boolean' ? data.active : healer.active;
    healer.damageFlash = typeof data.damageFlash === 'number' ? data.damageFlash : healer.damageFlash;
    healer.shakeTime = typeof data.shakeTime === 'number' ? data.shakeTime : healer.shakeTime;
    healer.shakeMag = typeof data.shakeMag === 'number' ? data.shakeMag : healer.shakeMag;
    healer.alive = typeof data.alive === 'boolean' ? data.alive : healer.alive;
    healer.dying = typeof data.dying === 'boolean' ? data.dying : healer.dying;
    healer.deathTimer = typeof data.deathTimer === 'number' ? data.deathTimer : healer.deathTimer;
    healer.deathDuration = typeof data.deathDuration === 'number' ? data.deathDuration : healer.deathDuration;
    healer.deathVelocityX = typeof data.deathVelocityX === 'number' ? data.deathVelocityX : healer.deathVelocityX;
    healer.deathVelocityY = typeof data.deathVelocityY === 'number' ? data.deathVelocityY : healer.deathVelocityY;
    healer.deathAngularVelocity = typeof data.deathAngularVelocity === 'number' ? data.deathAngularVelocity : healer.deathAngularVelocity;
    healer.deathRotation = typeof data.deathRotation === 'number' ? data.deathRotation : healer.deathRotation;
    healer.healbarFlash = typeof data.healbarFlash === 'number' ? data.healbarFlash : healer.healbarFlash;

    healer.healAura = data.healAura ? StateSerializer.cloneValue(data.healAura) : null;
    healer.healParticles = Array.isArray(data.healParticles) ? data.healParticles.map(p => Object.assign({}, p)) : [];
    healer.flameParticles = Array.isArray(data.flameParticles) ? data.flameParticles.map(p => Object.assign({}, p)) : [];
    healer.bloodParticles = Array.isArray(data.bloodParticles) ? data.bloodParticles.map(p => Object.assign({}, p)) : [];

    healer.burning = data.burning ? StateSerializer.cloneValue(data.burning) : null;
    healer._lastAttacker = null;

    return healer;
};

if (typeof window !== 'undefined') {
    window.Healer = Healer;
}
