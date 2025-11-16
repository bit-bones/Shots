/**
 * LooseChunk - Movable obstacle chunk with physics
 */
class LooseChunk {
    constructor(x, y, w, h, color = "#3d4351") {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.color = color;
        this.vx = 0;
        this.vy = 0;
        this.mass = w * h; // Mass based on size
        this.friction = 0.95; // Air resistance
        this.bounce = 0.7; // Bounce factor
        this.destroyed = false;
        this.flying = false; // For flying animation when destroyed
        this.hp = 1.0;
        this.alpha = 1.0;
        this.id = `loose_chunk_${LooseChunk._nextId++}`;

        // Burning properties
        this.burning = null;
        this.flameParticles = [];

        // Spontaneous glow
        this.spontaneousGlow = null;
    }

    update(dt) {
        if (this.destroyed && !this.flying) return;

        // Handle flying animation when destroyed (like normal chunks)
        if (this.flying) {
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            this.vy += 320 * dt; // gravity only for flying animation
            this.alpha -= 1.5 * dt;
            if (this.alpha <= 0) this.flying = false;
            return;
        }

        // Apply friction (no gravity for normal movement)
        this.vx *= Math.pow(this.friction, dt * 60);
        this.vy *= Math.pow(this.friction, dt * 60);

        // Update position
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Boundary collision
        if (this.x < 0) {
            this.x = 0;
            this.vx = -this.vx * this.bounce;
        } else if (this.x + this.w > CANVAS_W) {
            this.x = CANVAS_W - this.w;
            this.vx = -this.vx * this.bounce;
        }

        if (this.y < 0) {
            this.y = 0;
            this.vy = -this.vy * this.bounce;
        } else if (this.y + this.h > CANVAS_H) {
            this.y = CANVAS_H - this.h;
            this.vy = -this.vy * this.bounce;
        }

        // Update burning
        if (this.burning && !this.destroyed) {
            this.burning.time += dt;
            if (!this.burning.nextTick) this.burning.nextTick = 0;
            this.burning.nextTick -= dt;
            if (this.burning.nextTick <= 0) {
                if (!Array.isArray(this.flameParticles)) this.flameParticles = [];
                if (this.flameParticles.length < 12 && Math.random() < 0.92) {
                    const cx = this.x + this.w/2 + (Math.random() - 0.5) * this.w * 0.6;
                    const cy = this.y + this.h/2 + (Math.random() - 0.5) * this.h * 0.6;
                    this.flameParticles.push({
                        x: cx,
                        y: cy,
                        vx: (Math.random() - 0.5) * 28,
                        vy: -30 + Math.random() * -18,
                        life: 0.55 + Math.random() * 0.7,
                        maxLife: 0.55 + Math.random() * 0.7,
                        r: 2 + Math.random() * 3,
                        hue: 18 + Math.random() * 30
                    });
                }

                this.hp = Math.max(0, (typeof this.hp === 'number') ? this.hp - 0.11 : 1.0 - 0.11);
                this.alpha = Math.max(0.25, Math.min(1, this.hp));

                if (this.hp <= 0 && !this.destroyed) {
                    this.destroyed = true;
                    // Launch in direction away from impact (flying animation)
                    let ang = Math.random() * Math.PI * 2;
                    let v = 80 + Math.random() * 60;
                    this.vx = Math.cos(ang) * v;
                    this.vy = Math.sin(ang) * v - 50;
                    this.flying = true;
                    this.alpha = 1;
                }

                this.burning.nextTick = 0.44 + Math.random()*0.22;
            }

            if (Array.isArray(this.flameParticles) && this.flameParticles.length) {
                for (let fp of this.flameParticles) {
                    fp.x += fp.vx * dt;
                    fp.y += fp.vy * dt;
                    fp.vy += 80 * dt;
                    fp.life -= dt;
                }
                this.flameParticles = this.flameParticles.filter(p => p.life > 0);
            }
        }

        // Update spontaneous glow
        if (this.spontaneousGlow && !this.destroyed) {
            this.spontaneousGlow.time += dt;
        }
    }

    applyForce(fx, fy) {
        // F = ma, but simplified since mass is proportional to size
        const invMass = 1 / Math.max(1, this.mass / 100); // Normalize mass
        this.vx += fx * invMass;
        this.vy += fy * invMass;
    }

    circleCollide(cx, cy, cr) {
        if (this.destroyed && !this.flying) return false;
        let closestX = clamp(cx, this.x, this.x + this.w);
        let closestY = clamp(cy, this.y, this.y + this.h);
        let distX = cx - closestX;
        let distY = cy - closestY;
        return (distX * distX + distY * distY) < cr * cr;
    }

    rectCollide(other) {
        if ((this.destroyed && !this.flying) || (other.destroyed && !other.flying)) return false;
        return !(this.x + this.w < other.x || other.x + other.w < this.x ||
                 this.y + this.h < other.y || other.y + other.h < this.y);
    }

    chipAt(x, y, radius, power, obliterator = false, fireshot = false, fireStacks = 0) {
        if (this.destroyed && !this.flying) return false;

        let closestX = clamp(x, this.x, this.x + this.w);
        let closestY = clamp(y, this.y, this.y + this.h);
        let distX = x - closestX;
        let distY = y - closestY;
        let dist2 = distX * distX + distY * distY;

        if (dist2 >= radius * radius) return false;

        // Apply damage
        this.hp = Math.max(0, (typeof this.hp === 'number') ? this.hp - power : 1.0 - power);
        this.alpha = Math.max(0.25, Math.min(1, this.hp));

        if (this.hp <= 0 && !this.destroyed) {
            this.destroyed = true;
            // Launch in direction away from impact (flying animation like normal chunks)
            let ang = Math.atan2(this.y + this.h/2 - y, this.x + this.w/2 - x) + (Math.random() - 0.5) * 0.6;
            let v = 160 + Math.random() * 120;
            this.vx = Math.cos(ang) * v;
            this.vy = Math.sin(ang) * v - 100;
            this.flying = true;
            this.alpha = 1;
        } else {
            // Apply force from bullet impact
            let force = power * 200; // Increased force multiplier for better pushing
            let ang = Math.atan2(this.y + this.h/2 - y, this.x + this.w/2 - x);
            this.applyForce(Math.cos(ang) * force, Math.sin(ang) * force);

            // Apply fire if applicable
            if (fireshot && fireStacks > 0) {
                this.burning = {
                    time: 0,
                    duration: 1.2 + 1.3 * fireStacks,
                    power: fireStacks
                };
            }
        }

        return true;
    }

    draw(ctx) {
        if (this.destroyed && !this.flying) return;

        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.restore();

        // Draw burning effect
        if (this.burning && !this.destroyed) {
            const cx = this.x + this.w/2;
            const cy = this.y + this.h/2;
            const power = this.burning.power || 1;

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.22 * Math.min(1.6, power);
            const glowR = Math.max(this.w, this.h) * (0.3 + 0.08 * Math.min(2, power));
            const ggrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR * 1.2);
            ggrad.addColorStop(0, 'rgba(255,160,64,0.85)');
            ggrad.addColorStop(0.5, 'rgba(255,120,40,0.45)');
            ggrad.addColorStop(1, 'rgba(120,60,20,0)');
            ctx.fillStyle = ggrad;
            ctx.beginPath();
            ctx.arc(cx, cy, glowR * 1.05, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            if (Array.isArray(this.flameParticles) && this.flameParticles.length) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                for (let fp of this.flameParticles) {
                    const t = Math.max(0, Math.min(1, fp.life / fp.maxLife));
                    ctx.globalAlpha = Math.max(0, 0.72 * t * Math.min(1.2, power));
                    ctx.beginPath();
                    ctx.fillStyle = `hsla(${fp.hue},100%,58%,1)`;
                    ctx.arc(fp.x, fp.y, fp.r * (1.0 + 0.6 * Math.min(1, power)), 0, Math.PI * 2);
                    ctx.fill();

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

        // Draw spontaneous glow
        if (this.spontaneousGlow && !this.destroyed) {
            const cx = this.x + this.w/2;
            const cy = this.y + this.h/2;
            const progress = this.spontaneousGlow.time / this.spontaneousGlow.duration;
            const power = 1;

            const timeBase = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
            const glowPulse = 0.14 * Math.sin(timeBase / (90 - Math.min(40, power * 6)));
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.22 * Math.min(1.6, power) + glowPulse;
            const glowR = Math.max(this.w, this.h) * (0.3 + 0.08 * Math.min(2, power));
            const ggrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR * 1.2);
            ggrad.addColorStop(0, 'rgba(255,160,64,0.85)');
            ggrad.addColorStop(0.5, 'rgba(255,120,40,0.45)');
            ggrad.addColorStop(1, 'rgba(120,60,20,0)');
            ctx.fillStyle = ggrad;
            ctx.beginPath();
            ctx.arc(cx, cy, glowR * 1.05, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    serialize() {
        return StateSerializer.serialize(this);
    }

    static fromState(state) {
        if (!state) return null;
        const chunk = Object.create(LooseChunk.prototype);
        StateSerializer.applyState(chunk, state);
        return chunk;
    }
}

LooseChunk._nextId = 1;

// Export to window
if (typeof window !== 'undefined') {
    window.LooseChunk = LooseChunk;
}