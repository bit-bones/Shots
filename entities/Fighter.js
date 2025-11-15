/**
 * Fighter - Unified player character for humans and bots
 * Replaces legacy Player class - supports 2-4 fighters in multiplayer
 */
class Fighter {
    constructor(config) {
        // Identity
        this.id = config.id;
        this.slotIndex = config.slotIndex;
        this.name = config.name || `Fighter ${this.slotIndex + 1}`;
        this.color = config.color || '#fff';
        this.isBot = config.isBot || false;
        this.isLocal = config.isLocal || false; // true for keyboard-controlled
        
        // Position & physics
        this.x = config.x || CANVAS_W / 2;
        this.y = config.y || CANVAS_H / 2;
        this.radius = FIGHTER_RADIUS;
        this.speed = FIGHTER_SPEED;
        
        // Combat stats
        this.health = HEALTH_MAX;
        this.healthMax = HEALTH_MAX;
        this.score = 0;
        
        // Weapon stats (modified by powerups)
        this.bulletSpeed = BULLET_SPEED;
        this.bulletDamage = BULLET_DAMAGE;
        this.bulletRadius = BULLET_RADIUS;
        this.bulletRange = BULLET_RANGE;
        this.shootInterval = SHOOT_INTERVAL;
        this.timeSinceShot = 0; // Changed to count up like original
        
        // Abilities
        this.cards = [];
        this.dash = true;
        this.dashCooldown = 0;
        this.dashDuration = DASH_DURATION;
        this.dashSpeed = DASH_SPEED;
        this.dashDamage = DASH_DAMAGE;
        this.dashRangeMult = 1;
        this.dashSpeedMult = 1;
        this.dashCooldownMult = 1;
        this.dashCooldownMax = DASH_COOLDOWN;
        this.teledash = false;
        this.teledashStacks = 0;
        this.dashDistanceBase = DASH_BASE_DIST;
        this.dashDistanceRemaining = 0;
        this.teledashRingTimer = 0;
        this.teledashRingDuration = 0.35;
        this.teledashRingX = this.x;
        this.teledashRingY = this.y;
        this.teledashRingRadius = 0;
        
        // Powerup properties
        this.pierce = false;
        this.pierceStacks = 0;
        this.explosive = false;
        this.obliterator = false;
        this.obliteratorStacks = 0;
        this.ricochet = 0;
        this.deflectRemaining = 0;
        this.deflectStacks = 0;
        this.deflect = false;
        this.bigShot = false;
        this.bigShotPending = false;
        this.bigShotSizeMult = 2;
        this.bigShotSpeedMult = 0.5;
        this.ramActive = false;
        this.ramStacks = 0;
        this.ram = false;
        this.aimBotActive = false;
        this.deathwishActive = false;
        this.lifeStealPct = 0; // Life steal percentage
        this.spread = 0;
        this.burst = 0;
        this.shotController = false;
        this.fireshot = false;
        this.fireshotStacks = 0;

        // Aim tracking
        this.cursorAimX = this.x;
        this.cursorAimY = this.y;
        this.aimX = this.x;
        this.aimY = this.y;
        
        // State
        this.alive = true;
        this.dashActive = false;
        this.dashAngle = 0;
        this.dashDir = { x: 1, y: 0 };
        this.burning = null; // { damage, interval, timer, duration }
        this.flameParticles = [];
        this.eliminated = false;
        this._lastMoveDirX = 0;
        this._lastMoveDirY = 0;
        
        // Damage animation properties (exact match to original)
        this.shakeTime = 0;
        this.shakeMag = 0;
        this.damageFlash = 0;
        this.healthbarFlash = 0;
        
        // Healing animation properties (exact match to original)
        this.healAura = null; // { time, duration, maxRadius, intensity }
        this.healParticles = []; // Array of healing particle objects
        this.healbarFlash = 0; // Green flash for life steal
        
        // Death animation properties
        this.dying = false;
        this.deathTimer = 0;
        this.deathDuration = 1.5; // Total death animation duration
        this.deathVelocityX = 0;
        this.deathVelocityY = 0;
        this.deathAngularVelocity = 0;
        this.deathRotation = 0;
        this.lastDamageAmount = 0;
        this.bloodParticles = []; // Blood particles for death animation
        
        // Combat tracking
        this._lastAttacker = null; // For life steal

        this._refreshDashStats();

        Object.defineProperty(this, '_burstQueue', {
            value: [],
            writable: true,
            enumerable: false
        });
        Object.defineProperty(this, '_pendingBurstBullets', {
            value: [],
            writable: true,
            enumerable: false
        });
        Object.defineProperty(this, '_pendingGunshotBursts', {
            value: 0,
            writable: true,
            enumerable: false
        });
        
        // Downed state (team modes)
        this.isDowned = false;
        this.downedTimer = 0;
        this.downedDuration = 0;
        this.reviveProgress = 0;
        this.reviveTimeRequired = 0;
        this.reviveSource = null;
        this.downedSettings = null;
        this.downedHealthPercent = 0;
        
    }

    update(dt) {
        // Update death animation
        if (this.dying) {
            this.deathTimer += dt;
            
            // End death animation after duration
            if (this.deathTimer >= this.deathDuration) {
                this.dying = false;
                return;
            }
            
            // Apply death velocity with friction
            const friction = 0.92;
            this.deathVelocityX *= friction;
            this.deathVelocityY *= friction;
            this.x += this.deathVelocityX * dt;
            this.y += this.deathVelocityY * dt;
            
            // Apply rotation
            this.deathRotation += this.deathAngularVelocity * dt;
            this.deathAngularVelocity *= 0.95;
            
            // Keep in bounds during death
            this.x = clamp(this.x, this.radius, CANVAS_W - this.radius);
            this.y = clamp(this.y, this.radius, CANVAS_H - this.radius);
            
            // Update blood particles
            if (this.bloodParticles) {
                for (let p of this.bloodParticles) {
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                    p.vy += 400 * dt; // Gravity
                    p.vx *= 0.98; // Air resistance
                    p.life -= dt;
                }
                this.bloodParticles = this.bloodParticles.filter(p => p.life > 0);
            }
            
            // Continue updating flame particles if burning during death
            if (this.flameParticles) {
                for (let p of this.flameParticles) {
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                    p.vy += 80 * dt;
                    p.life -= dt;
                }
                this.flameParticles = this.flameParticles.filter(p => p.life > 0);
            }
            
            this._updateBurstQueue(dt);
            return;
        }
        
        if (this.isDowned) {
            this._updateDowned(dt);
            return;
        }

        if (!this.alive) {
            this._updateBurstQueue(dt);
            return;
        }
        
        if (this.teledashRingTimer > 0) {
            this.teledashRingTimer = Math.max(0, this.teledashRingTimer - dt);
        }

        // Update timers
        this.timeSinceShot += dt;
        if (this.dashCooldown > 0) {
            this.dashCooldown -= dt;
            if (this.dashCooldown < 0) this.dashCooldown = 0;
        }
        
        // Update damage animation timers (exact match to original)
        if (this.shakeTime > 0) this.shakeTime -= dt;
        if (this.damageFlash > 0) this.damageFlash -= dt;
        if (this.healthbarFlash > 0) this.healthbarFlash -= dt;
        
        // Update healing animation timers
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
        // Update green healbar flash
        if (this.healbarFlash > 0) this.healbarFlash -= dt;
        
        // Update dash
        if (this.dashActive) {
            this.dashDuration -= dt;
            if (this.dashDuration <= 0 || this.dashDistanceRemaining <= 0) {
                this.dashActive = false;
                this.ramActive = false;
                this.dashDistanceRemaining = 0;
            } else {
                const step = this.dashSpeed * dt;
                this.dashDistanceRemaining = Math.max(0, this.dashDistanceRemaining - step);
                this.x += Math.cos(this.dashAngle) * step;
                this.y += Math.sin(this.dashAngle) * step;
                
                // Keep in bounds
                this.x = clamp(this.x, this.radius, CANVAS_W - this.radius);
                this.y = clamp(this.y, this.radius, CANVAS_H - this.radius);
            }
        }
        
        // Update burning effect (matches original game)
        if (this.burning) {
            this.burning.time += dt;
            if (!this.burning.nextTick) this.burning.nextTick = 0;
            this.burning.nextTick -= dt;
            if (this.burning.nextTick <= 0) {
                this.takeDamage(7, 'burning');
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
        
        this._updateBurstQueue(dt);
    }

    move(keys, dt, obstacles = []) {
        if (!this.alive || this.dashActive) {
            return;
        }

        const inputX = (keys && (keys.d || keys.D || keys.ArrowRight) ? 1 : 0)
            - (keys && (keys.a || keys.A || keys.ArrowLeft) ? 1 : 0);
        const inputY = (keys && (keys.s || keys.S || keys.ArrowDown) ? 1 : 0)
            - (keys && (keys.w || keys.W || keys.ArrowUp) ? 1 : 0);

        if (inputX === 0 && inputY === 0) {
            this._lastMoveDirX = 0;
            this._lastMoveDirY = 0;
            return;
        }

        let dirX = inputX;
        let dirY = inputY;
        const dirMag = Math.hypot(dirX, dirY);
        if (dirMag > 0) {
            dirX /= dirMag;
            dirY /= dirMag;
        }

        const obstaclesList = Array.isArray(obstacles) ? obstacles : [];
        const deltaX = dirX * this.speed * dt;
        const deltaY = dirY * this.speed * dt;

        const startX = this.x;
        const startY = this.y;

        const targetX = startX + deltaX;
        const targetY = startY + deltaY;

        if (!this._collidesAt(targetX, startY, obstaclesList)) {
            this.x = targetX;
        }

        if (!this._collidesAt(this.x, targetY, obstaclesList)) {
            this.y = targetY;
        }

        const movedX = this.x - startX;
        const movedY = this.y - startY;
        const movedMag = Math.hypot(movedX, movedY);

        if (movedMag > 0.0001) {
            this._lastMoveDirX = movedX / movedMag;
            this._lastMoveDirY = movedY / movedMag;
        } else if (dirMag > 0) {
            this._lastMoveDirX = dirX;
            this._lastMoveDirY = dirY;
        } else {
            this._lastMoveDirX = 0;
            this._lastMoveDirY = 0;
        }
    }

    _collidesAt(x, y, obstacles) {
        if (x < this.radius || x > CANVAS_W - this.radius) return true;
        if (y < this.radius || y > CANVAS_H - this.radius) return true;
        if (!obstacles || obstacles.length === 0) return false;
        for (const obstacle of obstacles) {
            if (!obstacle || obstacle.destroyed) continue;
            if (typeof obstacle.circleCollide === 'function' && obstacle.circleCollide(x, y, this.radius)) {
                return true;
            }
        }
        return false;
    }

    updateCursorAim(x, y) {
        if (typeof x === 'number') this.cursorAimX = x;
        if (typeof y === 'number') this.cursorAimY = y;
    }

    setShotAim(x, y) {
        if (typeof x === 'number') this.aimX = x;
        if (typeof y === 'number') this.aimY = y;
    }

    getCursorAim() {
        return {
            x: typeof this.cursorAimX === 'number' ? this.cursorAimX : this.x,
            y: typeof this.cursorAimY === 'number' ? this.cursorAimY : this.y
        };
    }

    getShotAim() {
        return {
            x: typeof this.aimX === 'number' ? this.aimX : this.x,
            y: typeof this.aimY === 'number' ? this.aimY : this.y
        };
    }

    shoot(targetX, targetY) {
        if (!this.alive || this.timeSinceShot < this.shootInterval || this.dashActive) return null;

        this.setShotAim(targetX, targetY);

        const baseAngle = Math.atan2(targetY - this.y, targetX - this.x);
        const spreadCount = Math.max(0, this.spread | 0);
        const projectileCount = Math.max(1, 1 + spreadCount);
        const spreadStep = projectileCount > 1 ? 0.12 : 0;
        const angleOffsets = [];
        for (let i = 0; i < projectileCount; i++) {
            const offset = (i - (projectileCount - 1) / 2) * spreadStep;
            angleOffsets.push(baseAngle + offset);
        }

        const burstCount = Math.max(0, this.burst | 0) + 1;
        const volleyDelayBase = projectileCount > 1 ? 0.18 : 0.08;
        const applyBigShot = this.bigShot && this.bigShotPending;
        const sizeMult = applyBigShot ? (this.bigShotSizeMult || 2) : 1;
        const speedMult = applyBigShot ? (this.bigShotSpeedMult || 0.5) : 1;
        const burstOffsets = [];
        for (let i = 0; i < burstCount; i++) {
            burstOffsets.push(burstCount > 1 ? (i - (burstCount - 1) / 2) * 0.025 : 0);
        }

        const bullets = [];
        const initialOffset = burstOffsets.length ? burstOffsets[0] : 0;
        for (const offsetAngle of angleOffsets) {
            const bullet = new Bullet(this, this.x, this.y, offsetAngle + initialOffset);
            bullet.justFired = true;
            if (applyBigShot) {
                bullet.radius *= sizeMult;
                bullet.speed *= speedMult;
            }
            bullets.push(bullet);
        }

        if (burstCount > 1) {
            for (let i = 1; i < burstCount; i++) {
                this._enqueueBurstVolley({
                    delay: volleyDelayBase * i,
                    angles: angleOffsets,
                    burstOffset: burstOffsets[i] || 0,
                    applyBigShot,
                    sizeMult,
                    speedMult
                });
            }
        }

        if (applyBigShot) {
            this.bigShotPending = false;
        }

        this.timeSinceShot = 0;
        return bullets;
    }

    _enqueueBurstVolley(config = {}) {
        if (!this._burstQueue) return;
        const angles = Array.isArray(config.angles) ? config.angles.slice() : [];
        if (!angles.length) return;
        this._burstQueue.push({
            delay: Math.max(0, Number.isFinite(config.delay) ? config.delay : 0),
            angles,
            burstOffset: Number.isFinite(config.burstOffset) ? config.burstOffset : 0,
            applyBigShot: !!config.applyBigShot,
            sizeMult: Number.isFinite(config.sizeMult) ? config.sizeMult : 1,
            speedMult: Number.isFinite(config.speedMult) ? config.speedMult : 1
        });
    }

    _spawnBurstVolley(entry) {
        if (!entry || !Array.isArray(entry.angles) || !entry.angles.length) return;
        const burstOffset = Number.isFinite(entry.burstOffset) ? entry.burstOffset : 0;
        const spawned = [];
        for (const angle of entry.angles) {
            const bullet = new Bullet(this, this.x, this.y, angle + burstOffset);
            bullet.justFired = true;
            if (entry.applyBigShot) {
                bullet.radius *= entry.sizeMult;
                bullet.speed *= entry.speedMult;
            }
            spawned.push(bullet);
        }
        if (spawned.length) {
            this._pendingBurstBullets.push(...spawned);
            this._pendingGunshotBursts = (this._pendingGunshotBursts || 0) + 1;
        }
    }

    _updateBurstQueue(dt) {
        if (!this._burstQueue || this._burstQueue.length === 0) return;
        const remaining = [];
        for (let i = 0; i < this._burstQueue.length; i++) {
            const entry = this._burstQueue[i];
            entry.delay -= dt;
            if (entry.delay <= 0) {
                this._spawnBurstVolley(entry);
            } else {
                remaining.push(entry);
            }
        }
        this._burstQueue.length = 0;
        if (remaining.length) {
            Array.prototype.push.apply(this._burstQueue, remaining);
        }
    }

    drainPendingBurstBullets() {
        if (!this._pendingBurstBullets || this._pendingBurstBullets.length === 0) return [];
        return this._pendingBurstBullets.splice(0, this._pendingBurstBullets.length);
    }

    consumePendingGunshotBursts() {
        const count = this._pendingGunshotBursts || 0;
        this._pendingGunshotBursts = 0;
        return count;
    }

    applyFireShotBurn(attacker = null, stacksOverride = null) {
        const stacksFromAttacker = attacker && typeof attacker.fireshotStacks === 'number' ? attacker.fireshotStacks : null;
        const stacks = Math.max(1, stacksOverride != null ? stacksOverride : (stacksFromAttacker != null ? stacksFromAttacker : 1));
        const duration = 1.2 + 1.3 * stacks;
        this.burning = {
            time: 0,
            duration,
            power: stacks
        };
        if (!Array.isArray(this.flameParticles)) this.flameParticles = [];
        this._lastAttacker = attacker || this._lastAttacker;
        if (Fighter._audioManager && typeof Fighter._audioManager.playBurning === 'function') {
            Fighter._audioManager.playBurning(duration);
        }
    }

    startDash(targetX, targetY, context = {}) {
        if (!this.alive || !this.dash || this.dashCooldown > 0 || this.dashActive) return false;

        const dashSettings = getDashSettings(this);
        const moveMag = Math.hypot(this._lastMoveDirX, this._lastMoveDirY);
        const dashDirX = moveMag >= 0.18 ? this._lastMoveDirX / moveMag : null;
        const dashDirY = moveMag >= 0.18 ? this._lastMoveDirY / moveMag : null;
        const aimX = Number.isFinite(targetX) ? targetX : (Number.isFinite(this.cursorAimX) ? this.cursorAimX : this.x);
        const aimY = Number.isFinite(targetY) ? targetY : (Number.isFinite(this.cursorAimY) ? this.cursorAimY : this.y);
        const teledashActive = isTeledashEnabled(this);
        const maxDist = dashSettings.dist;

        let dashTargetX;
        let dashTargetY;

        if (teledashActive) {
            dashTargetX = aimX;
            dashTargetY = aimY;
        } else if (dashDirX != null && dashDirY != null) {
            dashTargetX = this.x + dashDirX * maxDist;
            dashTargetY = this.y + dashDirY * maxDist;
        } else {
            dashTargetX = aimX;
            dashTargetY = aimY;
        }

        const dx = dashTargetX - this.x;
        const dy = dashTargetY - this.y;
        let angle = Math.atan2(dy, dx);
        if (!Number.isFinite(angle)) {
            angle = this.dashAngle || 0;
        }
        this.dashAngle = angle;
        if (!this.dashDir) {
            this.dashDir = { x: Math.cos(this.dashAngle), y: Math.sin(this.dashAngle) };
        } else {
            this.dashDir.x = Math.cos(this.dashAngle);
            this.dashDir.y = Math.sin(this.dashAngle);
        }

        const distanceToTarget = Math.hypot(dx, dy);
        const travelDist = distanceToTarget > 0 ? Math.min(distanceToTarget, maxDist) : maxDist;

        if (teledashActive) {
            const others = Array.isArray(context.fighters)
                ? context.fighters.filter(f => f && f !== this)
                : [];
            const teleportContext = {
                obstacles: context.obstacles || [],
                others,
                infestedChunks: context.infestedChunks || []
            };
            const originX = this.x;
            const originY = this.y;
            this._activateTeledashRing(originX, originY, dashSettings);
            const destination = computeTeledashDestination(this, dashSettings, { x: aimX, y: aimY }, teleportContext);

            this.x = clamp(destination.x, this.radius, CANVAS_W - this.radius);
            this.y = clamp(destination.y, this.radius, CANVAS_H - this.radius);
            this.dashCooldown = dashSettings.cooldown;
            this.dashCooldownMax = dashSettings.cooldown;
            this.dashActive = false;
            this.dashDistanceRemaining = 0;
            this.dashDuration = 0;
            this.ramActive = this.ramStacks > 0;
            this.deflectRemaining = this.deflectStacks || 0;
            if (this.bigShot) {
                this.bigShotPending = true;
            }

            const traveled = Math.hypot(this.x - originX, this.y - originY);
            if (this.ramActive && traveled > 1 && teleportContext.others.length > 0) {
                const travelAngle = Math.atan2(this.y - originY, this.x - originX) || angle;
                this._applyRamImpact(teleportContext.others, dashSettings, travelAngle, { obstacles: teleportContext.obstacles });
            }
            this.ramActive = false;

            return true;
        }

        if (travelDist <= 0) {
            this.dashActive = false;
            this.ramActive = false;
            return false;
        }

        this.dashActive = true;
        this.dashDuration = Math.max(0.0001, dashSettings.duration);
        this.dashCooldown = dashSettings.cooldown;
        this.dashCooldownMax = dashSettings.cooldown;
        this.dashDistanceRemaining = travelDist;
        this.dashSpeed = travelDist / this.dashDuration;

        if (this.bigShot) {
            this.bigShotPending = true;
        }
        this.ramActive = this.ramStacks > 0;
        this.deflectRemaining = this.deflectStacks || 0;

        return true;
    }

    takeDamage(amount, source, damageSourceX, damageSourceY) {
        if ((!this.alive && !this.isDowned) || this.dying) return;
        
        // Deflect check
        if (this.deflectRemaining > 0) {
            this.deflectRemaining--;
            return;
        }
        
        if (this.isDowned) {
            this._handleDownedDamage(amount, source, damageSourceX, damageSourceY);
            return;
        }

        this.lastDamageAmount = amount;
        this.health -= amount;
        
        // Life Steal: if the attacker has lifeStealPct, heal them for a percent of damage dealt
        if (this._lastAttacker && this._lastAttacker.lifeStealPct > 0 && amount > 0) {
            const healAmt = Math.round(amount * this._lastAttacker.lifeStealPct);
            if (healAmt > 0) {
                this._lastAttacker.health = Math.min(this._lastAttacker.health + healAmt, this._lastAttacker.healthMax);
                this._lastAttacker.triggerHealingEffect(healAmt);
            }
        }
        
        if (this.health <= 0) {
            if (Fighter._deathInterceptor) {
                const intercepted = Fighter._deathInterceptor({
                    fighter: this,
                    amount,
                    source,
                    damageSourceX,
                    damageSourceY
                });
                if (intercepted) {
                    return;
                }
            }
            this._enterDeathState(amount, damageSourceX, damageSourceY);
        }

        if (Fighter._audioManager && source === 'burning' && amount > 0) {
            try {
                Fighter._audioManager.playHit();
            } catch (e) {}
        }
        
        // Damage animation (exact match to original)
        this.shakeTime = 0.20;
        this.shakeMag = 8;
        this.damageFlash = 0.25;
        this.healthbarFlash = 0.45;
    }

    _activateTeledashRing(originX, originY, dashSettings) {
        if (!dashSettings) return;
        this.teledashRingX = originX;
        this.teledashRingY = originY;
        this.teledashRingRadius = Math.max(this.radius, dashSettings.dist || 0);
        this.teledashRingTimer = this.teledashRingDuration;
    }

    _shouldRenderTeledashRing() {
        if (!this.teledash || this.teledashRingTimer <= 0) return false;
        if (this.metadata && this.metadata.remote) return false;
        return !!this.isLocal;
    }

    _drawTeledashRing(ctx) {
        if (!this._shouldRenderTeledashRing()) return;
        const t = clamp(1 - (this.teledashRingTimer / Math.max(0.0001, this.teledashRingDuration)), 0, 1);
        const baseAlpha = 0.22 * (1 - t);
        const glowAlpha = 0.1 * (1 - t);
        const ringRadius = Math.max(this.teledashRingRadius || 0, this.radius + 12);

        ctx.save();
        ctx.globalAlpha = baseAlpha;
        ctx.lineWidth = Math.max(2.4, this.radius * 0.22);
        ctx.strokeStyle = 'rgba(200,220,255,0.9)';
        ctx.beginPath();
        ctx.arc(this.teledashRingX, this.teledashRingY, ringRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = glowAlpha;
        ctx.lineWidth = Math.max(1.4, this.radius * 0.16);
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath();
        ctx.arc(this.teledashRingX, this.teledashRingY, ringRadius + Math.max(6, this.radius * 0.3), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    heal(amount) {
        if (amount <= 0) return;
        const oldHealth = this.health;
        this.health = Math.min(this.healthMax, this.health + amount);
        const actualHeal = this.health - oldHealth;
        if (actualHeal > 0) {
            this.triggerHealingEffect(actualHeal);
        }
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

    _createBloodParticles(damage, sourceX, sourceY) {
        // Check if blood effects are enabled
        const bloodEnabled = localStorage.getItem('shape_shot_blood_effects') === 'true';
        if (!bloodEnabled) return;
        
        // Scale particle count by damage (18 damage = ~10 particles, 100+ damage = 50+ particles)
        const baseCount = 10;
        const damageScale = Math.min(damage / 18, 5); // Cap at 5x
        const particleCount = Math.floor(baseCount * damageScale);
        
        // Calculate general spray direction (away from source)
        let sprayAngle = 0;
        if (sourceX !== undefined && sourceY !== undefined) {
            sprayAngle = Math.atan2(this.y - sourceY, this.x - sourceX);
        }
        
        for (let i = 0; i < particleCount; i++) {
            // Spread particles in a cone away from damage source
            const spread = Math.PI * 0.8; // 144 degree cone
            const angle = sprayAngle + (Math.random() - 0.5) * spread;
            const speed = 80 + Math.random() * 120 * damageScale;
            
            this.bloodParticles.push({
                x: this.x + (Math.random() - 0.5) * this.radius,
                y: this.y + (Math.random() - 0.5) * this.radius,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 50, // Initial upward velocity
                life: 0.4 + Math.random() * 0.4,
                maxLife: 0.4 + Math.random() * 0.4,
                size: 2 + Math.random() * 3,
                // Vary red tones
                color: Math.random() > 0.5 ? '#c41e1e' : '#8b0000'
            });
        }
    }

    applyCard(cardName) {
        this.cards.push(cardName);

        const cardDef = (typeof POWERUP_LOOKUP !== 'undefined') ? POWERUP_LOOKUP[cardName] : null;
        if (!cardDef) {
            console.warn('[Fighter] Unknown powerup:', cardName);
            return;
        }

        const ensureNumber = (value, fallback) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

        for (const effect of cardDef.effects) {
            if (!effect) continue;

            switch (effect.type) {
                case 'modify': {
                    const stat = effect.stat;
                    const mode = effect.mode;
                    if (!stat || !mode) break;
                    let current = ensureNumber(this[stat], stat === 'dashRangeMult' || stat === 'dashSpeedMult' || stat === 'dashCooldownMult' ? 1 : 0);

                    if (mode === 'mult') {
                        current = ensureNumber(this[stat], current === 0 ? 1 : current);
                        this[stat] = current * effect.value;
                    } else if (mode === 'add') {
                        this[stat] = current + effect.value;
                    } else if (mode === 'set') {
                        this[stat] = effect.value;
                    }

                    if (stat === 'pierceStacks' && this[stat] > 0) {
                        this.pierce = true;
                    }

                    break;
                }

                case 'flag': {
                    const prop = effect.property;
                    if (!prop) break;
                    const flagValue = !!effect.value;
                    this[prop] = flagValue;
                    if (prop === 'explosive') this.explosive = flagValue;
                    if (prop === 'shotController') this.shotController = flagValue;
                    if (prop === 'fireshot') {
                        this.fireshot = flagValue;
                        this.fireshotStacks = flagValue ? (this.fireshotStacks || 0) + 1 : 0;
                    }
                    break;
                }

                case 'instant': {
                    if (effect.stat === 'heal') {
                        this.heal(effect.value || 0);
                    }
                    break;
                }

                case 'custom': {
                    switch (effect.action) {
                        case 'bigShot':
                            this.bigShot = true;
                            this.bigShotPending = false;
                            break;
                        case 'ram':
                            this.ram = true;
                            this.ramStacks = (this.ramStacks || 0) + 1;
                            break;
                        case 'deflect':
                            this.deflect = true;
                            this.deflectStacks = (this.deflectStacks || 0) + 1;
                            this.deflectRemaining += 3;
                            break;
                        case 'obliterator':
                            this.obliterator = true;
                            this.obliteratorStacks = (this.obliteratorStacks || 0) + 1;
                            break;
                        case 'teledash':
                            this.teledash = true;
                            this.teledashStacks = (this.teledashStacks || 0) + 1;
                            break;
                        case 'aimbot':
                            this.aimBotActive = true;
                            break;
                        case 'deathwish':
                            this.deathwishActive = true;
                            this.healthMax = 1;
                            this.health = 1;
                            this.bulletDamage *= 3;
                            this.speed *= 1.5;
                            break;
                        case 'increaseHealthMax': {
                            const amount = effect.amount || 0;
                            this.healthMax += amount;
                            this.health = Math.min(this.healthMax, this.health + amount);
                            break;
                        }
                        case 'adjustHealth': {
                            const amount = effect.amount || 0;
                            this.healthMax += amount;
                            if (this.healthMax < 1) this.healthMax = 1;
                            this.health = Math.min(this.healthMax, Math.max(1, this.health + amount));
                            break;
                        }
                        default:
                            break;
                    }
                    break;
                }

                default:
                    break;
            }
        }

        this._refreshDashStats();

        this.isDowned = false;
        this.downedTimer = 0;
        this.downedDuration = 0;
        this.reviveProgress = 0;
        this.reviveTimeRequired = 0;
        this.reviveSource = null;
        this.downedSettings = null;
        this.downedHealthPercent = 0;
    }

    reset(x, y) {
        this.x = x;
        this.y = y;
        this.health = this.healthMax;
        this.alive = true;
        this.dashActive = false;
        this.dashCooldown = 0;
        this.dashDuration = DASH_DURATION;
        if (this.dashDir) {
            this.dashDir.x = 1;
            this.dashDir.y = 0;
        } else {
            this.dashDir = { x: 1, y: 0 };
        }
        this.timeSinceShot = this.shootInterval; // Start ready to shoot
        this.burning = null;
        this.eliminated = false;
        this.bigShotPending = false;
        this.ramActive = false;
        this.deflectRemaining = 0;
        this.cursorAimX = this.x;
        this.cursorAimY = this.y;
        this.aimX = this.x;
        this.aimY = this.y;
        
        // Reset damage animation properties
        this.shakeTime = 0;
        this.shakeMag = 0;
        this.damageFlash = 0;
        this.healthbarFlash = 0;
        
        // Reset healing animation properties
        this.healAura = null;
        this.healParticles = [];
        this.healbarFlash = 0;
        
        // Reset death animation properties
        this.dying = false;
        this.deathTimer = 0;
        this.deathVelocityX = 0;
        this.deathVelocityY = 0;
        this.deathAngularVelocity = 0;
        this.deathRotation = 0;
        this.lastDamageAmount = 0;
        this.bloodParticles = [];

        this.flameParticles = [];
        if (this._burstQueue) this._burstQueue.length = 0;
        if (this._pendingBurstBullets) this._pendingBurstBullets.length = 0;
        this._pendingGunshotBursts = 0;

        this._refreshDashStats();
    }

    _applyRamImpact(fighters, dashSettings, angle, options = {}) {
        if (!this.ram || !dashSettings || !Array.isArray(fighters)) return;
        const ramDamage = dashSettings.ramDamage || 0;
        if (ramDamage <= 0) return;

        const cos = Math.cos(angle || 0);
        const sin = Math.sin(angle || 0);
        const knockbackDist = 60 + (this.ramStacks || 0) * 40;
        const stepSize = Math.max(6, this.radius * 0.6);
        const steps = Math.max(1, Math.ceil(knockbackDist / stepSize));
        const obstacles = Array.isArray(options.obstacles) ? options.obstacles : [];

        for (const other of fighters) {
            if (!other || other === this || !other.alive) continue;
            if (dist(this.x, this.y, other.x, other.y) >= this.radius + other.radius) continue;

            other._lastAttacker = this;
            other.takeDamage(ramDamage, 'dash', this.x - cos * this.radius, this.y - sin * this.radius);
            other._lastAttacker = null;

            let newX = other.x;
            let newY = other.y;
            for (let i = 0; i < steps; i++) {
                const candidateX = newX + cos * stepSize;
                const candidateY = newY + sin * stepSize;
                let blocked = false;
                for (const obstacle of obstacles) {
                    if (!obstacle || obstacle.destroyed) continue;
                    if (typeof obstacle.circleCollide === 'function' && obstacle.circleCollide(candidateX, candidateY, other.radius)) {
                        blocked = true;
                        break;
                    }
                }
                if (blocked) break;
                newX = candidateX;
                newY = candidateY;
            }

            other.x = clamp(newX, other.radius, CANVAS_W - other.radius);
            other.y = clamp(newY, other.radius, CANVAS_H - other.radius);
        }
    }

    _refreshDashStats() {
        const dashSettings = getDashSettings(this);
        this.dashCooldownMax = dashSettings.cooldown;
        this.dashDistanceBase = dashSettings.dist;
    }

    draw(ctx) {
        this._drawTeledashRing(ctx);

        // Don't draw if completely dead (not dying, just dead)
        if (!this.alive && !this.dying && !this.isDowned) return;
        
        ctx.save();
        
        // Death animation: fade out and apply rotation
        if (this.dying) {
            const fadeProgress = Math.min(1, this.deathTimer / this.deathDuration);
            ctx.globalAlpha = 1 - fadeProgress * 0.7; // Fade to 30% opacity
            
            // Apply rotation around fighter center
            if (this.deathRotation !== 0) {
                ctx.translate(this.x, this.y);
                ctx.rotate(this.deathRotation);
                ctx.translate(-this.x, -this.y);
            }
        }
        
        // Damage animation: shake effect (exact match to original)
        let shakeX = 0, shakeY = 0;
        if (this.shakeTime > 0) {
            let mag = this.shakeMag * (this.shakeTime / 0.18);
            shakeX = rand(-mag, mag);
            shakeY = rand(-mag, mag);
        }
        
        // Define draw position (fighter position + shake offset)
        const drawX = this.x + shakeX;
        const drawY = this.y + shakeY;
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        
        // Damage animation: flash effect (exact match to original)
        const isDowned = this.isDowned && !this.dying;
        let baseColor = this.color;
        if (this.damageFlash > 0) {
            let t = Math.min(1, this.damageFlash / 0.25);
            // Only show white flash for non-primary colors (green/yellow etc)
            // Primary colors (blue/red) keep their tint
            const isPrimary = (this.color === '#65c6ff' || this.color === '#ff5a5a');
            if (!isPrimary) {
                baseColor = '#fff';
                ctx.shadowColor = '#fff';
                ctx.shadowBlur = 30 * t;
            } else {
                // For primary colors, use lighter tint
                const isBlueish = this.color === '#65c6ff';
                if (this.burning) {
                    baseColor = isBlueish ? "#ffd9b3" : "#ffd0c0";
                    ctx.shadowColor = "rgba(255,130,40,0.95)";
                    ctx.shadowBlur = 30 * t;
                } else {
                    baseColor = isBlueish ? "#9af9ff" : "#ffc9c9";
                    ctx.shadowColor = "#fff";
                    ctx.shadowBlur = 30 * t;
                }
            }
        } else {
            // Normal shadow
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 8;
        }
        
        // Draw fighter body
        ctx.beginPath();
        ctx.arc(this.x + shakeX, this.y + shakeY, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = baseColor;
        ctx.globalAlpha = 0.94;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        if (isDowned) {
            const baseGlow = 0.28 + 0.09 * Math.sin(now / 210);

            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = '#ffd86b';
            ctx.globalAlpha = baseGlow;
            ctx.lineWidth = 4.2;
            ctx.arc(this.x + shakeX, this.y + shakeY, this.radius + 5.5, 0, Math.PI * 2);
            ctx.stroke();

            const progress = (this.reviveTimeRequired > 0)
                ? clamp(this.reviveProgress / this.reviveTimeRequired, 0, 1)
                : 0;
            if (progress > 0) {
                ctx.beginPath();
                ctx.globalAlpha = Math.min(1, Math.max(baseGlow + 0.15, 0.55));
                ctx.lineCap = 'round';
                ctx.lineWidth = 4.6;
                ctx.arc(this.x + shakeX, this.y + shakeY, this.radius + 5.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress, false);
                ctx.stroke();
            }
            ctx.restore();

            const bob = Math.sin(now / 320) * 3;
            const indicatorRadius = Math.max(11, this.radius * 0.42);
            const indicatorX = this.x + shakeX;
            const indicatorY = this.y + shakeY - this.radius - 26 + bob;

            ctx.save();
            ctx.globalAlpha = 0.88;
            ctx.beginPath();
            ctx.fillStyle = 'rgba(24, 28, 35, 0.92)';
            ctx.arc(indicatorX, indicatorY, indicatorRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.lineWidth = 1.6;
            ctx.strokeStyle = 'rgba(255, 216, 107, 0.65)';
            ctx.stroke();

            const pulse = 0.78 + 0.18 * Math.sin(now / 180);
            ctx.globalAlpha = Math.max(0.4, Math.min(1, pulse));
            ctx.fillStyle = '#ffd86b';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('E', indicatorX, indicatorY + 0.5);
            ctx.restore();
        }
        
        // Draw cooldown / downed state rings
        const drawBaseRing = (radiusOffset, fraction, options = {}) => {
            if (!Number.isFinite(fraction) || fraction <= 0) return;
            const {
                strokeStyle = this.color,
                glowColor = strokeStyle,
                glowAlpha = 0.5,
                lineWidth = 4.2,
                darkStroke = true,
                darkStrokeColor = '#222',
                darkStrokeWidth = 2.5
            } = options;
            ctx.save();
            ctx.beginPath();
            ctx.arc(this.x + shakeX, this.y + shakeY, this.radius + radiusOffset, -Math.PI/2, -Math.PI/2 + Math.PI*2*fraction, false);
            ctx.strokeStyle = strokeStyle;
            ctx.globalAlpha = glowAlpha;
            ctx.lineWidth = lineWidth;
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = (options.shadowBlur != null) ? options.shadowBlur : 5;
            ctx.stroke();

            if (darkStroke) {
                ctx.globalAlpha = 1;
                ctx.shadowBlur = 0;
                ctx.beginPath();
                ctx.arc(this.x + shakeX, this.y + shakeY, this.radius + radiusOffset, -Math.PI/2, -Math.PI/2 + Math.PI*2*fraction, false);
                ctx.strokeStyle = darkStrokeColor;
                ctx.lineWidth = darkStrokeWidth;
                ctx.stroke();
            }
            ctx.restore();
        };

        if (!isDowned) {
            const cdFrac = Math.min(1, this.timeSinceShot / this.shootInterval);
            if (cdFrac < 1) {
                drawBaseRing(7, cdFrac, { glowAlpha: 0.48 });
            }

            try {
                let dashSet = { cooldown: DASH_COOLDOWN };
                let ringFrac = null;
                if ((dashSet.cooldown || 0) > 0 && this.dashCooldown > 0) {
                    const maxCd = (typeof this.dashCooldownMax === 'number' && this.dashCooldownMax > 0) ? this.dashCooldownMax : dashSet.cooldown;
                    ringFrac = 1 - clamp(this.dashCooldown / maxCd, 0, 1);
                }
                if (ringFrac !== null && ringFrac > 0) {
                    drawBaseRing(13, ringFrac, {
                        strokeStyle: '#ffd86b',
                        glowColor: '#ffd86b',
                        glowAlpha: 0.62,
                        lineWidth: 3.6,
                        shadowBlur: 6
                    });
                }
            } catch (e) {}
        } else {
            // Downed state: repurpose rings for bleedout and revive progress
            const bleedDuration = Math.max(0.01, this.downedDuration || (this.downedSettings && this.downedSettings.bleedOutDuration) || 0);
            const bleedTimer = this.downedTimer || 0;
            const bleedFrac = clamp(bleedTimer / bleedDuration, 0, 1);
            const remainingFrac = 1 - bleedFrac;
            if (remainingFrac > 0) {
                drawBaseRing(7, remainingFrac, {
                    strokeStyle: '#ff4f4f',
                    glowColor: '#ff6b6b',
                    glowAlpha: 0.6,
                    lineWidth: 4.4,
                    shadowBlur: 7
                });
            }

            const reviveTime = Math.max(0, this.reviveTimeRequired || (this.downedSettings && this.downedSettings.reviveTime) || 0);
            const reviveProgress = (reviveTime > 0) ? clamp(this.reviveProgress / reviveTime, 0, 1) : 0;
            if (reviveProgress > 0) {
                drawBaseRing(13, reviveProgress, {
                    strokeStyle: '#4ddbb3',
                    glowColor: '#24cfa2',
                    glowAlpha: 0.8,
                    lineWidth: 4.1,
                    shadowBlur: 7
                });
            }
        }
        
        // Draw blood particles (if enabled)
        if (this.bloodParticles && this.bloodParticles.length > 0) {
            ctx.save();
            for (let p of this.bloodParticles) {
                const t = p.life / p.maxLife;
                ctx.globalAlpha = t * 0.8;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
        
        // Draw burning effect (matches original - glow beneath player)
        if (this.burning) {
            ctx.globalAlpha = 0.6 + 0.25 * Math.sin(Date.now() / 90);
        }
        
        // Healing aura (drawn beneath the player)
        if (this.healAura) {
            const t = Math.min(1, this.healAura.time / this.healAura.duration);
            const easedT = 1 - Math.pow(1 - t, 1.6);
            const auraRadius = lerp(this.radius * 1.35, this.healAura.maxRadius, easedT);
            const intensity = Math.min(1.5, (this.healAura.intensity || 0.8));
            const baseAlpha = 0.26 + 0.45 * (1 - t);
            const pulse = 0.14 * Math.sin((t * 3.1 + Date.now() / 210) * Math.PI);
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
            ctx.strokeStyle = `rgba(195,255,215,${0.48 * (1 - t)}`;
            ctx.beginPath();
            const rimRadius = auraRadius * (0.88 + 0.06 * Math.sin(Date.now() / 120));
            ctx.arc(drawX, drawY, rimRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        
        // Draw flame particles for burning visuals (matches original)
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
                grad.addColorStop(1, 'rgba(130,245,185,0)');
                ctx.beginPath();
                ctx.fillStyle = grad;
                const scale = 0.88 + 0.18 * Math.sin((Date.now() / 150) + hp.phase);
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
            // Health bar scaling
            const healthBarBaseLen = 64;
            const healthBarLen = healthBarBaseLen * (this.healthMax / HEALTH_MAX) ** 0.5;
            ctx.fillRect(drawX - healthBarLen/2, drawY - 38, healthBarLen, 12);
            ctx.restore();
        }
        
        if (!isDowned) {
            const healthBarBaseW = 54;
            let w = Math.max(18, healthBarBaseW * Math.sqrt((this.healthMax || HEALTH_MAX) / HEALTH_MAX));
            let h = 10;
            let x = this.x - w/2 + shakeX, y = this.y - this.radius - 18 + shakeY;

            ctx.save();
            if (this.healthbarFlash > 0) {
                let t = Math.min(1, this.healthbarFlash / 0.45);
                ctx.shadowColor = "#fff";
                ctx.shadowBlur = 16 * t;
            }
            ctx.fillStyle = "#222";
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = "#56ff7a";
            ctx.fillRect(x, y, w * clamp(this.health/this.healthMax, 0, 1), h);
            ctx.strokeStyle = "#000";
            ctx.strokeRect(x, y, w, h);
            ctx.restore();
        }
        
        ctx.restore();
    }

    _updateDowned(dt) {
        this.downedTimer += dt;
        if (this.reviveProgress > 0 && (!this.reviveSource || !this.reviveSource.alive)) {
            this.reviveSource = null;
            this.reviveProgress = Math.max(0, this.reviveProgress - dt * 0.75);
        }
        this._updateBurstQueue(dt);
    }

    _handleDownedDamage(amount, source, damageSourceX, damageSourceY) {
        this.lastDamageAmount = amount;
        if (!this.downedSettings) {
            this._enterDeathState(amount, damageSourceX, damageSourceY);
            return;
        }
        // Additional damage while downed accelerates bleed out
        const bleed = Math.max(0, amount / Math.max(1, this.healthMax));
        this.downedTimer += bleed;
        if (amount >= this.healthMax * 0.5) {
            this._enterDeathState(amount, damageSourceX, damageSourceY);
        }
    }

    _enterDeathState(amount, damageSourceX, damageSourceY) {
        this.isDowned = false;
        this.downedSettings = null;
        this.reviveProgress = 0;
        this.reviveSource = null;
        this.reviveTimeRequired = 0;
        this.downedTimer = 0;
        this.downedDuration = 0;
        this.downedHealthPercent = 0;

        this.health = 0;
        this.alive = false;
        this.dying = true;
        this.deathTimer = 0;

        const knockbackScale = Math.min(amount / 18, 10);
        const baseKnockback = 250;
        const knockbackSpeed = baseKnockback * knockbackScale;

        if (damageSourceX !== undefined && damageSourceY !== undefined) {
            const angle = Math.atan2(this.y - damageSourceY, this.x - damageSourceX);
            this.deathVelocityX = Math.cos(angle) * knockbackSpeed;
            this.deathVelocityY = Math.sin(angle) * knockbackSpeed;
        } else {
            const angle = Math.random() * Math.PI * 2;
            this.deathVelocityX = Math.cos(angle) * knockbackSpeed * 0.5;
            this.deathVelocityY = Math.sin(angle) * knockbackSpeed * 0.5;
        }

        this.deathAngularVelocity = (Math.random() - 0.5) * knockbackScale * 8;
        this._createBloodParticles(amount, damageSourceX, damageSourceY);
    }

    enterDownedState(settings = {}) {
        const revivePercent = typeof settings.reviveHealthPercent === 'number'
            ? clamp(settings.reviveHealthPercent, 0.05, 1)
            : 0.5;
        this.isDowned = true;
        this.alive = false;
        this.dying = false;
        this.health = 0;
        this.downedTimer = 0;
        this.downedDuration = typeof settings.bleedOutDuration === 'number' ? settings.bleedOutDuration : 10;
        this.reviveProgress = 0;
        this.reviveTimeRequired = typeof settings.reviveTime === 'number' ? settings.reviveTime : 3;
        this.reviveSource = null;
        this.downedSettings = {
            bleedOutDuration: this.downedDuration,
            reviveTime: this.reviveTimeRequired,
            reviveHealthPercent: revivePercent
        };
        this.downedHealthPercent = revivePercent;
        this.deathTimer = 0;
        this.deathVelocityX = 0;
        this.deathVelocityY = 0;
        this.deathAngularVelocity = 0;
        this.deathRotation = 0;
        this.bloodParticles = [];
        this.shakeTime = 0;
        this.damageFlash = 0;
        this.healthbarFlash = 0;
    }

    exitDownedState(healthPercentOverride = null) {
        const percent = healthPercentOverride != null ? clamp(healthPercentOverride, 0.05, 1) : (this.downedHealthPercent || 0.5);
        this.isDowned = false;
        this.downedSettings = null;
        this.reviveProgress = 0;
        this.reviveSource = null;
        this.reviveTimeRequired = 0;
        this.downedTimer = 0;
        this.downedDuration = 0;
        this.downedHealthPercent = 0;
        this.alive = true;
        this.dying = false;
        this.health = Math.max(1, Math.round(this.healthMax * percent));
        this.timeSinceShot = this.shootInterval;
    }

    forceEliminate(options = {}) {
        const amount = typeof options.amount === 'number' ? options.amount : Math.max(18, this.lastDamageAmount || 18);
        this._enterDeathState(amount, options.sourceX, options.sourceY);
    }
}

Fighter._audioManager = null;
Fighter._deathInterceptor = null;

Fighter.setAudioManager = function(audioManager) {
    Fighter._audioManager = audioManager;
};

Fighter.setDeathInterceptor = function(handler) {
    Fighter._deathInterceptor = typeof handler === 'function' ? handler : null;
};

Fighter.prototype.serialize = function() {
    return StateSerializer.serialize(this, {
        force: true,
        exclude: ['keys', 'mouseX', 'mouseY', 'shootRequested', 'dashRequested', 'bloodParticles', '_lastAttacker']
    });
};

// Export to window
if (typeof window !== 'undefined') {
    window.Fighter = Fighter;
}
