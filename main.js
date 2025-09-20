// --- World Modifier Card UI ---
function showWorldModifierCards() {
    cardState.active = true;
    let div = document.getElementById('card-choices');
    div.innerHTML = '';
    // Only show modifiers not already picked
    let available = WORLD_MODIFIERS.filter(m => !usedWorldModifiers[m.name]);
    // If less than 3 available, allow repeats but effect will be disabled
    let pool = available.length >= 3 ? available : WORLD_MODIFIERS;
    let choices = randomChoice(pool, 3);
    // Side-by-side layout
    const cardWidth = 220;
    const cardHeight = 260;
    for (let i = 0; i < choices.length; ++i) {
        let opt = choices[i];
        let card = document.createElement('div');
        card.className = "card card-uniform world-modifier";
        card.innerHTML = `<b>${opt.name}</b><br><small>${opt.desc}</small>`;
        card.style.position = 'absolute';
        card.style.left = `calc(50% + ${(i-1)*cardWidth*1.1}px)`;
        card.style.top = '50%';
        card.style.width = cardWidth + 'px';
        card.style.height = cardHeight + 'px';
    card.style.transform = 'translate(-50%, -50%)';
        card.onclick = () => {
            Array.from(div.children).forEach(c => c.classList.remove('selected', 'centered'));
            card.classList.add('selected', 'centered');
            setTimeout(() => {
                // Check if already picked and handle accordingly
                if (usedWorldModifiers[opt.name]) {
                    // Second pick: either disable or apply special logic
                    if (opt.name === "Dynamic") {
                        // Dynamic has special toggle logic
                        opt.effect();
                    } else {
                        // For other modifiers, disable them
                        if (opt.name === "Infestation") {
                            infestationActive = false;
                        } else if (opt.name === "Spontaneous") {
                            spontaneousActive = false;
                        }
                        // Remove from active modifiers
                        activeWorldModifiers = activeWorldModifiers.filter(m => m !== opt.name);
                    }
                } else {
                    // First pick: apply effect and mark as used
                    opt.effect();
                    usedWorldModifiers[opt.name] = true;
                    activeWorldModifiers.push(opt.name);
                }
                div.style.display = "none";
                div.innerHTML = '';
                div.removeAttribute('style');
                div.classList.remove('card-bg-visible');
                cardState.active = false;
                waitingForCard = false;
            }, 220);
        };
        div.appendChild(card);
    }
    div.style.display = "flex";
    div.style.position = 'absolute';
    div.style.left = '50%';
    div.style.top = '50%';
    div.style.transform = 'translate(-50%, -50%)';
    div.style.height = '320px';
    div.style.width = '900px';
}
// --- Restart Game ---
function restartGame() {
    // Reset scores
    if (typeof player !== 'undefined' && player) player.resetStats();
    if (typeof enemy !== 'undefined' && enemy) enemy.resetStats();
    updateCardsUI();
    // Show setup overlay
    showSetupOverlay();
}

// --- Sound Effects ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
// Volume settings (0.0 - 1.0)
let masterVolume = 1.0;
let musicVolume = 1.0; // reserved if you add music
let sfxVolume = 1.0;
// Per-effect multipliers (0.0 - 1.0)
let shotVolume = 1.0;
let explosionVolume = 1.0;
let ricochetVolume = 1.0;
let hitVolume = 1.0;
let dashVolume = 1.0;
// Load saved volumes from localStorage if present
try {
    const vs = JSON.parse(localStorage.getItem('shape_shot_volumes') || '{}');
    if (vs && typeof vs.master === 'number') masterVolume = vs.master;
    if (vs && typeof vs.music === 'number') musicVolume = vs.music;
    if (vs && typeof vs.sfx === 'number') sfxVolume = vs.sfx;
    if (vs && typeof vs.shot === 'number') shotVolume = vs.shot;
    if (vs && typeof vs.explosion === 'number') explosionVolume = vs.explosion;
    if (vs && typeof vs.ricochet === 'number') ricochetVolume = vs.ricochet;
    if (vs && typeof vs.hit === 'number') hitVolume = vs.hit;
    if (vs && typeof vs.dash === 'number') dashVolume = vs.dash;
} catch (e) {}
function playGunShot() {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.value = 380;
    g.gain.value = 0.05 * masterVolume * sfxVolume * shotVolume;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.frequency.linearRampToValueAtTime(180, audioCtx.currentTime + 0.09);
    g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.11);
    o.stop(audioCtx.currentTime + 0.12);
}
function playExplosion() {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'triangle';
    o.frequency.value = 80;
    g.gain.value = 0.40 * masterVolume * sfxVolume * explosionVolume;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.frequency.linearRampToValueAtTime(30, audioCtx.currentTime + 0.18);
    g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.22);
    o.stop(audioCtx.currentTime + 0.23);
}
function playHit() {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = 220;
    g.gain.value = 0.13 * masterVolume * sfxVolume * hitVolume;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.frequency.linearRampToValueAtTime(110, audioCtx.currentTime + 0.08);
    g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.09);
    o.stop(audioCtx.currentTime + 0.1);
}
function playRicochet() {
    // subtle short 'dink' sound for ricochet/deflect
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'triangle';
    o.frequency.value = 980; // high-pitched dink
    g.gain.value = 0.03 * masterVolume * sfxVolume * ricochetVolume;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    // quick pitch drop and fade
    o.frequency.linearRampToValueAtTime(640, audioCtx.currentTime + 0.04);
    g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.06);
    o.stop(audioCtx.currentTime + 0.07);
}
function playDashWoosh(duration = 0.28, speedMult = 1.0) {
    try {
        // duration: seconds, speedMult: multiplier affecting pitch
        const now = audioCtx.currentTime;
        const dur = Math.max(0.06, Math.min(duration, 1.4));
        // Two-layer woosh: low rumble + high whoosh
    const low = audioCtx.createOscillator();
    const lowGain = audioCtx.createGain();
    low.type = 'sine';
    // slightly lower base frequency for a rounder rumble
    low.frequency.value = 80 * Math.max(0.55, speedMult);
    lowGain.gain.value = 0.06 * masterVolume * sfxVolume * dashVolume;
        low.connect(lowGain).connect(audioCtx.destination);
        low.start(now);
    low.frequency.linearRampToValueAtTime(40 * Math.max(0.55, speedMult), now + dur * 0.9);
    lowGain.gain.linearRampToValueAtTime(0.0, now + dur);
        low.stop(now + dur + 0.02);

    const high = audioCtx.createOscillator();
    const highGain = audioCtx.createGain();
    high.type = 'sawtooth';
    // keep high component but reduce base so it's less piercing
    high.frequency.value = 250 * Math.max(0.65, speedMult);
    highGain.gain.value = 0.05 * masterVolume * sfxVolume * dashVolume;
        high.connect(highGain).connect(audioCtx.destination);
        high.start(now);
        // pitch sweep downward for a pleasant woosh
    high.frequency.exponentialRampToValueAtTime(Math.max(120, 320 * Math.max(0.55, speedMult)), now + dur * 0.9);
    highGain.gain.setValueAtTime(highGain.gain.value, now);
    highGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        high.stop(now + dur + 0.02);
    } catch (e) { /* ignore audio errors */ }
}
let OBSTACLE_COUNT = 8;
let OBSTACLE_MIN_SIZE = 70, OBSTACLE_MAX_SIZE = 170;

// Dynamic & map border settings (controlled via UI)
let DYNAMIC_MODE = false;
let DYNAMIC_RATE = 3.0; // seconds between spawn/despawn events
let dynamicTimer = 0;
let dynamicSpawnNext = true;
let MAP_BORDER = false; // when true, border blocks bullets (ricochet only if bullet has bounces)


// --- World Modifiers System ---
const WORLD_MODIFIERS = [
    {
        name: "Infestation",
        desc: "Chunks will randomly become alive and aggressive.",
        effect: function() {
            infestationActive = true;
            infestationTimer = 0;
        },
        picked: false
    },
    {
        name: "Spontaneous",
        desc: "Obstacles combust Spontaneously.",
        effect: function() {
            spontaneousActive = true;
            spontaneousTimer = 0;
        },
        picked: false
    },
    {
        name: "Dynamic",
        desc: "Toggles dynamic on at fastest setting.",
        effect: function() {
            if (!dynamicModifierActive) {
                // First time: save current settings and turn on dynamic
                dynamicPreviousMode = DYNAMIC_MODE;
                dynamicPreviousRate = DYNAMIC_RATE;
                DYNAMIC_MODE = true;
                DYNAMIC_RATE = 0.5; // fastest setting
                dynamicModifierActive = true;
                dynamicTimer = 0; // reset timer
                dynamicSpawnNext = true;
            } else {
                // Second time: revert to previous settings
                DYNAMIC_MODE = dynamicPreviousMode;
                DYNAMIC_RATE = dynamicPreviousRate;
                dynamicModifierActive = false;
                dynamicTimer = 0;
            }
        },
        picked: false
    },
    // --- FIRESTORM MODIFIER ---
    {
        name: "Firestorm",
        desc: "Storms of fire appear randomly around the map.",
        effect: function() {
            firestormActive = true;
            firestormTimer = 0;
            firestormNextTime = 2 + Math.random() * 4; // short delay before first storm
        },
        picked: false
    }
    // Add more world modifiers here
];
// Apply a world modifier by name with proper first/second-pick semantics
function applyWorldModifierByName(name) {
    const mod = WORLD_MODIFIERS.find(m => m.name === name);
    if (!mod) return;
    if (usedWorldModifiers[name]) {
        // Second pick: either disable or apply special logic
        if (name === 'Dynamic') {
            // Dynamic toggles back to previous settings via effect()
            if (typeof mod.effect === 'function') mod.effect();
        } else {
            // For other modifiers, disable them (turn off flags and remove from active)
            if (name === 'Infestation') {
                infestationActive = false;
            } else if (name === 'Spontaneous') {
                spontaneousActive = false;
            } else if (name === 'Firestorm') {
                firestormActive = false;
                firestormInstance = null;
                firestormTimer = 0;
            }
            activeWorldModifiers = activeWorldModifiers.filter(m => m !== name);
            usedWorldModifiers[name] = false;
        }
    } else {
        // First pick: apply effect and mark as used
        if (typeof mod.effect === 'function') mod.effect();
        usedWorldModifiers[name] = true;
        if (!activeWorldModifiers.includes(name)) activeWorldModifiers.push(name);
    }
}
// --- Firestorm State ---
let firestormActive = false;
let firestormTimer = 0;
let firestormNextTime = 0;
let firestormInstance = null; // holds the current firestorm object

let worldModifierRoundInterval = 3; // default, can be set in setup
let roundsSinceLastModifier = 0;
let activeWorldModifiers = [];
let usedWorldModifiers = {};

// Infestation tracking
let infestationActive = false;
let infestationTimer = 0;
let infestedChunks = [];

// Spontaneous explosion tracking
let spontaneousActive = false;
let spontaneousTimer = 0;

// Dynamic modifier tracking
let dynamicModifierActive = false;
let dynamicPreviousMode = false;
let dynamicPreviousRate = 3.0;

// --- InfestedChunk Class ---
class InfestedChunk {
    constructor(chunk, obstacle) {
        this.x = chunk.x;
        this.y = chunk.y;
        this.w = chunk.w;
        this.h = chunk.h;
        this.vx = 0;
        this.vy = 0;
        this.speed = 80 + Math.random() * 40; // 80-120 speed
        this.hp = (typeof chunk.hp === 'number') ? chunk.hp : 1.0;
        this.damage = 12;
        this.alpha = 1;
        this.particleTimer = 0;
        this.particles = [];
        this.seekTarget = null;
        this.active = true;
        // Mark original chunk as destroyed
        chunk.destroyed = true;
        chunk.flying = true;
        chunk.alpha = 0;
    }

    chipAt(x, y, radius, power = 1, obliterate = false, explosion = false) {
        // Like obstacle chunk, but only one chunk
        let centerX = this.x + this.w/2;
        let centerY = this.y + this.h/2;
        let dist2 = (x - centerX) * (x - centerX) + (y - centerY) * (y - centerY);
        if (dist2 < radius * radius) {
            let alloc = power;
            this.hp -= alloc;
            if (this.hp <= 0) {
                this.active = false;
                // Visual effect
                explosions.push(new Explosion(centerX, centerY, 25, "#8f4f8f", 0, null, false));
            } else {
                this.alpha = Math.max(0.35, Math.min(1, this.hp));
            }
            return true;
        }
        return false;
    }

    update(dt, players) {
        if (!this.active) return;

        // Find nearest player to target
        let nearestPlayer = null;
        let nearestDist = Infinity;
        for (let p of players) {
            if (p.health <= 0) continue;
            let d = dist(this.x + this.w/2, this.y + this.h/2, p.x, p.y);
            if (d < nearestDist) {
                nearestDist = d;
                nearestPlayer = p;
            }
        }

        // AI: seek toward nearest player
        if (nearestPlayer) {
            let centerX = this.x + this.w/2;
            let centerY = this.y + this.h/2;
            let dx = nearestPlayer.x - centerX;
            let dy = nearestPlayer.y - centerY;
            let dist = Math.hypot(dx, dy);
            if (dist > 0) {
                this.vx = (dx / dist) * this.speed;
                this.vy = (dy / dist) * this.speed;
            }
        }

        // Move
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Check collision with players
        for (let p of players) {
            if (p.health <= 0) continue;
            let centerX = this.x + this.w/2;
            let centerY = this.y + this.h/2;
            if (dist(centerX, centerY, p.x, p.y) < this.w/2 + p.radius) {
                p.takeDamage(this.damage);
                this.active = false;
                // Create small explosion effect
                explosions.push(new Explosion(
                    centerX, centerY,
                    25, "#8f4f8f", 0, null, false
                ));
                break;
            }
        }

        // Generate particles
        this.particleTimer += dt;
        if (this.particleTimer > 0.1) {
            this.particleTimer = 0;
            let centerX = this.x + this.w/2;
            let centerY = this.y + this.h/2;
            this.particles.push({
                x: centerX + (Math.random() - 0.5) * this.w,
                y: centerY + (Math.random() - 0.5) * this.h,
                vx: (Math.random() - 0.5) * 30,
                vy: (Math.random() - 0.5) * 30 - 20,
                life: 0.8 + Math.random() * 0.4,
                maxLife: 0.8 + Math.random() * 0.4
            });
        }

        // Update particles
        for (let p of this.particles) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 40 * dt; // gravity
            p.life -= dt;
        }
        this.particles = this.particles.filter(p => p.life > 0);

        // Remove if off screen
        if (this.x < -50 || this.x > CANVAS_W + 50 || this.y < -50 || this.y > CANVAS_H + 50) {
            this.active = false;
        }
    }

    draw(ctx) {
        if (!this.active) return;

        ctx.save();
        // Draw the chunk with infested color
        ctx.fillStyle = "#8f4f8f"; // purple-ish infested color
        ctx.globalAlpha = this.alpha;
        ctx.fillRect(this.x, this.y, this.w, this.h);

        // Draw particles
        for (let p of this.particles) {
            let alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha * 0.7;
            ctx.fillStyle = "#bf7fbf";
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.globalAlpha = 1;
        ctx.restore();
    }
}

// --- Constants ---
const CANVAS_W = 1300, CANVAS_H = 650;
const PLAYER_RADIUS = 19;
const ENEMY_RADIUS = 19;
const BULLET_RADIUS = 7;
const BULLET_SPEED = 420;
const SHOOT_INTERVAL = 1.2; // seconds
const PLAYER_SPEED = 220;
const ENEMY_SPEED = 170;
const HEALTH_MAX = 100;
const BULLET_DAMAGE = 18;
const EXPLOSION_BASE_RADIUS = 57;
const EXPLOSION_PARTICLES = 28;
const EXPLOSION_PARTICLE_BASE = 48;

// --- Dash Base Stats ---
const DASH_BASE_SPEED_MULT = 2.0; // base dash speed multiplier
const DASH_BASE_DIST = 110;       // base dash distance in px
const DASH_BASE_COOLDOWN = 1.1;   // seconds

const POWERUPS = [
    { name: "Bullet Speed+", desc: "Bullets travel faster.", effect: p => p.bulletSpeed *= 1.2 },
    { name: "Bullet Size+", desc: "Bullets are bigger.", effect: p => p.bulletRadius *= 1.35 },
    { name: "Bullet Dmg+", desc: "Bullets deal more damage.", effect: p => p.bulletDamage += 6 },
    { name: "Move Speed+", desc: "You move faster.", effect: p => p.speed *= 1.18 },
    { name: "Attack Speed+", desc: "Fire more quickly.", effect: p => p.shootInterval *= 0.8 },
    { name: "Heal on Kill", desc: "Restore 25 HP on kill.", effect: p => p.healOnKill = true },
    { name: "Spread+", desc: "Each stack adds one extra projectile.", effect: p => p.spread = (p.spread || 0) + 1 },
    { name: "Piercing Bullet", desc: "Bullets pass through obstacles.", effect: p => p.pierce = true },
    { name: "Dash+", desc: "Dash is faster and goes farther!", effect: p => { p.dashPower = (p.dashPower || 1) + 1; }},
    { name: "Big Shot", desc: "Your next shot after dashing is larger but slower. Dash cooldown +25% per stack.", effect: p => p.bigShotStacks = (p.bigShotStacks||0) + 1 },
    { name: "Ramming", desc: "Deal damage to anyone/anything you dash into. Dash cooldown +25% per stack.", effect: p => { p.ram = true; p.ramStacks = (p.ramStacks||0) + 1 } },
    { name: "Deflect", desc: "Bullets ricochet off you while dashing. Each stack increases deflections per dash.", effect: p => { p.deflect = true; p.deflectStacks = (p.deflectStacks||0) + 1 } },
    { name: "Obliterator", desc: "Bullets destroy more obstacle chunks. Each stack increases destruction.", effect: p => { p.obliterator = true; p.obliteratorStacks = (p.obliteratorStacks||0) + 1 } },
    { name: "Ricochet", desc: "Bullets bounce off obstacles and map borders. Each stack adds +1 bounce.", effect: p => p.ricochet = (p.ricochet|0) + 1 },
    { name: "Explosive Shots", desc: "Bullets explode on impact, damaging in a radius!", effect: p => p.explosive = true }
];

// --- Utilities ---
function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b+1)); }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function dist(x1, y1, x2, y2) { return Math.hypot(x2-x1, y2-y1); }
function lerp(a, b, t) { return a + (b - a) * t; }
function randomChoice(arr, n) {
    let cp = [...arr], out = [];
    for(let i = 0; i < n; ++i) out.push(cp.splice(randInt(0, cp.length-1), 1)[0]);
    return out;
}
function getCardByName(name) {
    if (!name || typeof name !== 'string') return null;
    const key = name.trim().toLowerCase();
    return POWERUPS.find(c => c.name && c.name.toLowerCase() === key) || null;
}

// Dash settings helper (extracted so both update() and drawPlayer() can use it)
function getDashSettings(p) {
    let power = Math.max(1, p.dashPower || 1);
    let speedMult = DASH_BASE_SPEED_MULT + 0.33 * (power-1);
    let dist = DASH_BASE_DIST + 38 * (power-1);
    // increase dash cooldown if Big Shot stacks exist (each stack +25%)
    let baseCooldown = Math.max(0.55, DASH_BASE_COOLDOWN - 0.08 * (power-1));
    // Increase dash cooldown for Big Shot and Ramming stacks (each stack +25%)
    let cooldown = baseCooldown * (1 + (p.bigShotStacks || 0) * 0.25 + (p.ramStacks || 0) * 0.25);
    let duration = dist / (p.speed * speedMult);
    return { speedMult, dist, cooldown, duration };
}

// --- Classes ---
class Player {
    constructor(isPlayer, color, x, y) {
        // Basic identity
        this.isPlayer = !!isPlayer;
        this.color = color || (this.isPlayer ? "#65c6ff" : "#ff5a5a");
        // radius depends on player/enemy
        this.radius = this.isPlayer ? PLAYER_RADIUS : ENEMY_RADIUS;
        // position (may be adjusted by positionPlayersSafely later)
        this.x = (typeof x === 'number') ? x : CANVAS_W/2;
        this.y = (typeof y === 'number') ? y : CANVAS_H/2;
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
                this.burning.nextTick = 0.45 + Math.random()*0.2;
            }
            if (this.burning.time > this.burning.duration) {
                this.burning = null;
            }
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
        let baseColor = this.color;
        if (this.damageFlash > 0) {
            let t = Math.min(1, this.damageFlash / 0.25);
            baseColor = this.isPlayer ? "#9af9ff" : "#ffc9c9";
            ctx.shadowColor = "#fff";
            ctx.shadowBlur = 30 * t;
        } else {
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 8;
        }
        ctx.beginPath();
        ctx.arc(this.x + shakeX, this.y + shakeY, this.radius, 0, Math.PI*2);
        ctx.fillStyle = baseColor;
        ctx.globalAlpha = 1;
        ctx.fill();
        ctx.shadowBlur = 0;
        // Draw burning effect
        if (this.burning) {
            ctx.globalAlpha = 0.45 + 0.25*Math.sin(Date.now()/90);
            ctx.beginPath();
            ctx.arc(this.x + shakeX, this.y + shakeY, this.radius+7, 0, Math.PI*2);
            ctx.fillStyle = '#ffb347';
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        ctx.restore();
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
    }
    // Fully reset gameplay-affecting stats (used when starting a fresh game)
    resetStats() {
        this.healthMax = HEALTH_MAX;
        this.health = HEALTH_MAX;
        this.score = 0;
        this.speed = this.isPlayer ? PLAYER_SPEED : ENEMY_SPEED;
        this.bulletSpeed = BULLET_SPEED;
        this.bulletRadius = BULLET_RADIUS;
        this.bulletDamage = BULLET_DAMAGE;
        this.shootInterval = SHOOT_INTERVAL;
        this.timeSinceShot = 0;
        this.target = { x: this.x, y: this.y };
        this.healOnKill = false;
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
        this.cards = [];
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
            let spreadArc = Math.min(Math.PI/3, 0.16 * total); // narrow for small counts, grows with count
            for (let i = 0; i < total; ++i) {
                let t = total === 1 ? 0.5 : i / (total - 1);
                let a = lerp(-spreadArc/2, spreadArc/2, t);
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
    takeDamage(dmg) {
        this.health -= dmg;
        // Visual feedback
        this.shakeTime = 0.20;
        this.shakeMag = 8;
        this.damageFlash = 0.25;
        this.healthbarFlash = 0.45;
        playHit();
    }
    addCard(cardName) {
        // allow duplicate cards so stacking works
        this.cards.push(cardName);
        updateCardsUI();
    }
}

// --- Enemy AI helper: line of sight (simple) ---
function hasLineOfSight(ax, ay, bx, by, obstacles) {
    let steps = 14;
    for (let i = 0; i <= steps; ++i) {
        let t = i / steps;
        let x = lerp(ax, bx, t);
        let y = lerp(ay, by, t);
        for (let o of obstacles) {
            if (o.circleCollide(x, y, 8)) return false;
        }
    }
    return true;
}

class Bullet {
    constructor(owner, x, y, angle) {
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

// Chunked destructible obstacle class:
class Obstacle {
    constructor(x, y, w, h) {
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.chunkGrid = 6;
        this.chunks = [];
        this.generateChunks();
        this.destroyed = false;
    }
    generateChunks() {
        this.chunks = [];
        const grid = this.chunkGrid;
        let chunkW = this.w / grid, chunkH = this.h / grid;
        for(let i=0;i<grid;i++) {
            for(let j=0;j<grid;j++) {
                this.chunks.push({
                    x: this.x + i*chunkW,
                    y: this.y + j*chunkH,
                    w: chunkW,
                    h: chunkH,
                    destroyed: false,
                    hp: 1.0,
                    vx: 0, vy: 0,
                    flying: false,
                    alpha: 1
                });
            }
        }
    }
    draw(ctx) {
        ctx.save();
        for(const c of this.chunks) {
            if (c.destroyed && !c.flying) continue;
            ctx.globalAlpha = c.alpha;
            ctx.fillStyle = "#3d4351";
            ctx.fillRect(c.x, c.y, c.w, c.h);
            // Draw burning effect
            if (c.burning && !c.destroyed) {
                ctx.globalAlpha = 0.38 + 0.22*Math.sin(Date.now()/80);
                ctx.beginPath();
                ctx.arc(c.x + c.w/2, c.y + c.h/2, Math.max(c.w, c.h)*0.38, 0, Math.PI*2);
                ctx.fillStyle = '#ffb347';
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }
    update(dt) {
        for(const c of this.chunks) {
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
        for(const c of this.chunks) {
            if (c.destroyed) continue;
            let closestX = clamp(cx, c.x, c.x+c.w);
            let closestY = clamp(cy, c.y, c.y+c.h);
            let distX = cx - closestX, distY = cy - closestY;
            if ((distX*distX + distY*distY) < cr*cr) return true;
        }
        return false;
    }
    chipChunksAt(x, y, radius, power = 1, obliterate = false, explosion = false) {
        // Distribute total destructive power across chunks within radius.
        // This makes obliterator stacks increase the total power available
        // and larger bullets/explosions hit more chunks but receive a smaller
        // per-chunk allocation unless power is increased.
        let hits = [];
        for(const c of this.chunks) {
            if (c.destroyed) continue;
            let closestX = clamp(x, c.x, c.x+c.w);
            let closestY = clamp(y, c.y, c.y+c.h);
            let distX = x - closestX, distY = y - closestY;
            if ((distX*distX + distY*distY) < radius*radius) {
                hits.push({ c, closestX, closestY, dist2: distX*distX + distY*distY });
            }
        }
        if (hits.length === 0) return false;
        // Total power available; explosion gets a modest multiplier but does not auto-obliterate
        let totalPower = power * (explosion ? 1.25 : 1.0);
        // Optionally weight by proximity (closer chunks get slightly more)
        let weights = hits.map(h => 1 + Math.max(0, (radius*radius - h.dist2) / (radius*radius)));
        let weightSum = weights.reduce((s, v) => s + v, 0);
        let chipped = false;
        for (let i = 0; i < hits.length; ++i) {
            const h = hits[i];
            const c = h.c;
            // allocate damage proportional to weight
            let alloc = (totalPower * weights[i]) / weightSum;
            // subtract from chunk HP
            c.hp = (typeof c.hp === 'number') ? c.hp - alloc : 1.0 - alloc;
            if (c.hp <= 0) {
                let ang = Math.atan2(c.y + c.h/2 - y, c.x + c.w/2 - x) + (Math.random()-0.5)*0.6;
                let v = 160 * (explosion ? 2.5 : 1) + Math.random()*(explosion ? 240 : 120) * (1+power*0.4);
                c.vx = Math.cos(ang) * v;
                c.vy = Math.sin(ang) * v - (explosion ? 220 : 100);
                c.flying = true;
                c.destroyed = true;
                c.alpha = 1;
                chipped = true;
            } else {
                // mark as partially damaged (visual alpha reduction)
                c.alpha = Math.max(0.35, Math.min(1, c.hp));
                chipped = true;
            }
        }
        this.destroyed = this.chunks.every(c => c.destroyed);
        return chipped;
    }
}

// --- Explosion Effect ---
class Explosion {
    constructor(x, y, radius, color, damage, owner, obliterator) {
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
            for (let p of players) {
                if (p !== this.owner && dist(p.x, p.y, this.x, this.y) < this.radius + p.radius) {
                    p.takeDamage(this.damage);
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
        // Damage and ignite players/enemy (main.js logic, untouched)
        const participants = [player].concat(enemyDisabled ? [] : [enemy]);
        for (let p of participants) {
            if (p.health > 0 && dist(p.x, p.y, this.x, this.y) < this.radius + p.radius) {
                if (!p.burning) {
                    p.burning = { time: 0, duration: 3 + Math.random()*1.5 };
                }
            }
        }

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
                            c.burning = { time: 0, duration: 2.5 + Math.random()*1.5 };
                            newIgnitions++;
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
                                    c2.burning = { time: 0, duration: 2 + Math.random() * 1.5 };
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
                                }
                            }
                        }
                    }
                }
                if (playerSpreadChecks > MAX_PLAYER_SPREAD_CHECKS) break;
            }
        }

        // --- Visuals from classes.js ---
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

    // --- Visuals from classes.js ---
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

// --- Game State ---
let canvas, ctx;
let mouse = { x: CANVAS_W/2, y: CANVAS_H/2 };
let keys = {};
let player, enemy, bullets, obstacles;
let enemyCount = 1;
let enemyDisabled = false; // when true, enemy exists but AI/draw are disabled (for 0 enemies option; ignored in MP)
let explosions = [];
let lastTimestamp = 0;
let cardState = { active: false, player: null, callback: null };
let running = false;
let animFrameId = null;
let waitingForCard = false;

// === Host-authoritative networking helpers ===
const NET = {
    role: null, // 'host' | 'joiner'
    connected: false,
    inputSeq: 0,
    lastInputSentAt: 0,
    lastSnapshotSentAt: 0,
    INPUT_HZ: 30,
    SNAPSHOT_HZ: 15,
    remoteInput: { up:false,down:false,left:false,right:false,shoot:false,dash:false,aimX:0,aimY:0,seq:0 },
    shootLatch: false, // joiner-side edge trigger to avoid hold-to-shoot
    bulletCounter: 1,
    setRole(role) { this.role = role; },
    setConnected(c) { this.connected = !!c; },
    now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); },
    // JOINER: package local input and send
    sendInputs() {
        if (!window.ws || window.ws.readyState !== WebSocket.OPEN || this.role !== 'joiner') return;
        const input = this.collectLocalInput();
        this.inputSeq++;
        const payload = { type: 'input', seq: this.inputSeq, input };
        window.ws.send(JSON.stringify({ type: 'relay', data: payload }));
        // prevent sticky shoot: clear flag after sending
        if (input.shoot && player) player.shootQueued = false;
    },
    // HOST: send snapshot to joiner
    sendSnapshot() {
        if (!window.ws || window.ws.readyState !== WebSocket.OPEN || this.role !== 'host') return;
        const snap = this.buildSnapshot();
        const payload = { type: 'snapshot', snap };
        window.ws.send(JSON.stringify({ type: 'relay', data: payload }));
    },
    onFrame(dt) {
        const now = this.now();
        if (this.role === 'joiner' && now - this.lastInputSentAt >= (1000/this.INPUT_HZ)) {
            this.sendInputs();
            this.lastInputSentAt = now;
        }
        if (this.role === 'host' && now - this.lastSnapshotSentAt >= (1000/this.SNAPSHOT_HZ)) {
            this.sendSnapshot();
            this.lastSnapshotSentAt = now;
        }
    },
    // Build minimal snapshot from current authoritative state (host only)
    buildSnapshot() {
        const snap = {
            t: this.now(),
            players: [
                { x: player.x, y: player.y, hp: player.health },
                { x: enemy.x, y: enemy.y, hp: enemy.health }
            ],
            bullets: bullets.map(b => ({ id: b.id, x: b.x, y: b.y, angle: b.angle, speed: b.speed, r: b.radius, dmg: b.damage, bnc: b.bouncesLeft, obl: !!b.obliterator, ex: !!b.explosive }))
        };
        return snap;
    },
    // Apply snapshot on joiner
    applySnapshot(snap) {
        if (!snap) return;
        try {
            const p0 = snap.players[0]; // host
            const p1 = snap.players[1]; // joiner
            if (NET.role === 'joiner') {
                // On joiner: P1 (host) -> enemy (blue), P2 (joiner) -> player (red)
                if (p0) { enemy.x = p0.x; enemy.y = p0.y; enemy.health = p0.hp; }
                if (p1) { player.x = p1.x; player.y = p1.y; player.health = p1.hp; }
            } else {
                // Fallback mapping (not used on host normally)
                if (p0) { player.x = p0.x; player.y = p0.y; player.health = p0.hp; }
                if (p1) { enemy.x = p1.x; enemy.y = p1.y; enemy.health = p1.hp; }
            }
            // bullets: upsert by id, remove missing
            const incoming = new Map();
            for (const sb of snap.bullets || []) incoming.set(sb.id, sb);
            for (let i = bullets.length - 1; i >= 0; i--) {
                const id = bullets[i].id;
                if (!incoming.has(id)) bullets.splice(i, 1);
            }
            const have = new Map(bullets.map(b => [b.id, b]));
            for (const sb of incoming.values()) {
                if (have.has(sb.id)) {
                    const b = have.get(sb.id);
                    b.x = sb.x; b.y = sb.y; b.angle = sb.angle; b.speed = sb.speed;
                    b.radius = sb.r; b.damage = sb.dmg; b.bouncesLeft = sb.bnc;
                    b.obliterator = !!sb.obl; b.explosive = !!sb.ex;
                    b.active = true;
                } else {
                    const owner = player; // visual only; owner doesn’t affect joiner authority
                    const nb = new Bullet(owner, sb.x, sb.y, sb.angle);
                    nb.id = sb.id; nb.speed = sb.speed; nb.radius = sb.r; nb.damage = sb.dmg;
                    nb.bouncesLeft = sb.bnc; nb.obliterator = !!sb.obl; nb.explosive = !!sb.ex;
                    nb.active = true;
                    bullets.push(nb);
                }
            }
        } catch (e) { /* ignore snapshot errors to avoid crashing */ }
    },
    // Assign an id to a newly created bullet (host only)
    tagBullet(b) {
        if (!b.id) b.id = 'b' + (Date.now().toString(36)) + '-' + (this.bulletCounter++);
    },
    // Read local input (joiner). We map to existing variables.
    collectLocalInput() {
        // Edge trigger for shoot: true exactly once when space is pressed
        const shootNow = !!player.shootQueued && !this.shootLatch;
        const out = {
            up: !!keys['w'],
            down: !!keys['s'],
            left: !!keys['a'],
            right: !!keys['d'],
            shoot: shootNow,
            dash: !!(player.dash && keys['shift']),
            aimX: mouse.x,
            aimY: mouse.y
        };
        // Update latch state
        if (!!player.shootQueued) this.shootLatch = true; else this.shootLatch = false;
        return out;
    }
};

// Map a role label ('host'|'joiner') to the correct local entity
function getEntityForRole(role) {
    if (NET.role === 'host') return role === 'host' ? player : enemy;
    if (NET.role === 'joiner') return role === 'host' ? enemy : player;
    return player;
}

// --- Procedural Obstacle Generation ---
function generateObstacles() {
    obstacles = [];
    let tries = 0;
    while (obstacles.length < OBSTACLE_COUNT && tries < 100) {
        tries++;
        let size = rand(OBSTACLE_MIN_SIZE, OBSTACLE_MAX_SIZE);
        let w = size, h = size;
        let x = rand(60, CANVAS_W - w - 60);
        let y = rand(60, CANVAS_H - h - 60);
        let obs = new Obstacle(x, y, w, h);
        let centerX = x + w/2, centerY = y + h/2;
        let safe = true;
        if (typeof player !== 'undefined' && player) {
            let minDist = Math.max(w, h) * 0.6 + player.radius + 12;
            if (dist(centerX, centerY, player.x, player.y) <= minDist) safe = false;
        } else {
            if (dist(centerX, centerY, CANVAS_W/3, CANVAS_H/2) <= 110) safe = false;
        }
        if (!enemyDisabled && typeof enemy !== 'undefined' && enemy) {
            let minDist = Math.max(w, h) * 0.6 + enemy.radius + 12;
            if (dist(centerX, centerY, enemy.x, enemy.y) <= minDist) safe = false;
        } else {
            if (dist(centerX, centerY, 2*CANVAS_W/3, CANVAS_H/2) <= 110) safe = false;
        }
        if (!obstacles.some(o => rectsOverlap(o, obs))) {
        } else safe = false;
        if (safe) obstacles.push(obs);
    }
}

// Serialize/deserialize obstacles for setup sync
function serializeObstacles() {
    return (obstacles||[]).map(o => ({ x:o.x, y:o.y, w:o.w, h:o.h, destroyed: !!o.destroyed }));
}
function deserializeObstacles(arr) {
    obstacles = [];
    for (const s of (arr||[])) {
        const o = new Obstacle(s.x, s.y, s.w, s.h);
        o.destroyed = !!s.destroyed;
        obstacles.push(o);
    }
}

function isCircleClear(cx, cy, cr) {
    if (cx - cr < 0 || cy - cr < 0 || cx + cr > CANVAS_W || cy + cr > CANVAS_H) return false;
    for (let o of obstacles) {
        if (!o) continue;
        if (o.circleCollide(cx, cy, cr)) return false;
    }
    return true;
}

function findNearestClearPosition(x0, y0, cr, opts = {}) {
    const maxRadius = opts.maxRadius || 420;
    const step = opts.step || 12;
    const angleStep = opts.angleStep || 0.6;
    if (isCircleClear(x0, y0, cr)) return { x: x0, y: y0 };
    for (let r = step; r <= maxRadius; r += step) {
        for (let a = 0; a < Math.PI*2; a += angleStep) {
            let nx = x0 + Math.cos(a) * r;
            let ny = y0 + Math.sin(a) * r;
            if (isCircleClear(nx, ny, cr)) return { x: nx, y: ny };
        }
    }
    let candidates = [ {x: x0, y: 60+cr}, {x: x0, y: CANVAS_H-60-cr}, {x: 60+cr, y: y0}, {x: CANVAS_W-60-cr, y: y0}, {x: CANVAS_W/2, y: CANVAS_H/2} ];
    for (let c of candidates) if (isCircleClear(c.x, c.y, cr)) return c;
    return { x: x0, y: y0 };
}

function positionPlayersSafely() {
    const MIN_SEP = 140;
    let pStart = { x: CANVAS_W/3, y: CANVAS_H/2 };
    let eStart = { x: 2*CANVAS_W/3, y: CANVAS_H/2 };
    if (!player) player = new Player(true, "#65c6ff", pStart.x, pStart.y);
    if (!enemy) enemy = new Player(false, "#ff5a5a", eStart.x, eStart.y);
    // If enemyDisabled, mark enemy to skip AI/draw but keep object for compatibility
    if (enemyDisabled) enemy.disabled = true; else enemy.disabled = false;
    let pPos = findNearestClearPosition(pStart.x, pStart.y, player.radius);
    player.x = pPos.x; player.y = pPos.y;
    let ePos = findNearestClearPosition(eStart.x, eStart.y, enemy.radius);
    if (!enemyDisabled && dist(ePos.x, ePos.y, player.x, player.y) < MIN_SEP) {
        let found = false;
        for (let r = 140; r <= 420 && !found; r += 40) {
            for (let a = 0; a < Math.PI*2 && !found; a += 0.5) {
                let nx = eStart.x + Math.cos(a) * r;
                let ny = eStart.y + Math.sin(a) * r;
                if (!isCircleClear(nx, ny, enemy.radius)) continue;
                if (dist(nx, ny, player.x, player.y) >= MIN_SEP) { ePos = {x: nx, y: ny}; found = true; break; }
            }
        }
    }
    if (NET.connected || !enemyDisabled) { enemy.x = ePos.x; enemy.y = ePos.y; }
}
function rectsOverlap(a, b) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x ||
             a.y + a.h < b.y || b.y + b.h < a.y);
}

function spawnDynamicObstacle() {
    // Count active (non-destroyed) obstacles
    let activeCount = 0;
    for (let o of obstacles) if (!o.destroyed) activeCount++;

    // If we've already got enough active obstacles, don't spawn more
    if (activeCount >= OBSTACLE_COUNT) return;

    let tries = 0;
    while (tries < 60) {
        tries++;
        let size = rand(OBSTACLE_MIN_SIZE, OBSTACLE_MAX_SIZE);
        let w = size, h = size;
        let x = rand(60, CANVAS_W - w - 60);
        let y = rand(60, CANVAS_H - h - 60);
        let obs = new Obstacle(x, y, w, h);
        let centerX = x + w/2, centerY = y + h/2;
        let safe = true;
        for (let o of obstacles) {
            if (!o) continue;
            if (!o.destroyed && rectsOverlap(o, obs)) { safe = false; break; }
        }
        if (!safe) continue;
    if (dist(centerX, centerY, player.x, player.y) <= 90) safe = false;
    if (!enemyDisabled && dist(centerX, centerY, enemy.x, enemy.y) <= 90) safe = false;
        if (!safe) continue;
        // Prefer to reuse a destroyed slot so array length doesn't grow
        let replaced = false;
        for (let i = 0; i < obstacles.length; i++) {
            if (obstacles[i] && obstacles[i].destroyed) {
                obstacles[i] = obs;
                replaced = true;
                break;
            }
        }
        if (!replaced) obstacles.push(obs);
        break;
    }
}

function despawnDynamicObstacle() {
    if (obstacles.length === 0) return;
    let idx = randInt(0, obstacles.length-1);
    for (let i = 0; i < obstacles.length; i++) {
        let j = (idx + i) % obstacles.length;
        if (!obstacles[j].destroyed) { idx = j; break; }
    }
    let o = obstacles[idx];
    // Animate chunks flying off
    for (const c of o.chunks) {
        if (!c.destroyed) {
            c.destroyed = true;
            c.flying = true;
            c.vx = rand(-140, 140);
            c.vy = rand(-240, -40);
            c.alpha = 1;
        }
    }
    o.destroyed = true;

    // Replace this obstacle after a short delay, ensuring 1:1 ratio
    setTimeout(() => {
        // Try to spawn a replacement obstacle at a safe location. If we fail, retry a few times.
        let spawnTries = 0;
        function tryReplace() {
            spawnTries++;
            let tries = 0;
            while (tries < 120) {
                tries++;
                let size = rand(OBSTACLE_MIN_SIZE, OBSTACLE_MAX_SIZE);
                let w = size, h = size;
                let x = rand(60, CANVAS_W - w - 60);
                let y = rand(60, CANVAS_H - h - 60);
                let newObs = new Obstacle(x, y, w, h);
                let centerX = x + w/2, centerY = y + h/2;
                // Must not overlap any non-destroyed obstacle (ignore the one we're replacing)
                let safe = true;
                for (let k = 0; k < obstacles.length; k++) {
                    if (k === idx) continue;
                    let o2 = obstacles[k];
                    if (!o2) continue;
                    if (!o2.destroyed && rectsOverlap(o2, newObs)) { safe = false; break; }
                }
                if (!safe) continue;
                if (dist(centerX, centerY, player.x, player.y) <= 90) safe = false;
                if (dist(centerX, centerY, enemy.x, enemy.y) <= 90) safe = false;
                if (safe) {
                    // Replace in-place so obstacles.length stays stable
                    obstacles[idx] = newObs;
                    return;
                }
            }
            // If we failed to place, retry a few times with delay
            if (spawnTries < 6) {
                setTimeout(tryReplace, 500 + Math.random()*300);
            } else {
                // As a last resort, attempt to un-destroy one chunk to keep some visual element
                // (do nothing further)
            }
        }
        tryReplace();
    }, 700 + Math.random() * 300);
}

// --- Game Loop ---
function gameLoop(ts) {
    if (!running) return;
    let dt = ((ts - lastTimestamp) || 16) / 1000;
    lastTimestamp = ts;
    if (!cardState.active) update(dt);
    draw();
    animFrameId = requestAnimationFrame(gameLoop);
}

// --- Update Logic ---
function update(dt) {
    // --- Multiplayer Sync (host-authoritative) ---
    NET.onFrame(dt);
    const simulateLocally = !NET.connected || NET.role === 'host';
    // --- Burning Damage Over Time ---
    if (player) player.updateBurning(dt);
    if (!enemyDisabled && enemy) enemy.updateBurning(dt);
    if (Array.isArray(obstacles) && obstacles.length > 0) {
        // Cap how many chunk burning updates we do per frame to avoid stalls
        let chunkChecks = 0;
        const MAX_CHUNK_CHECKS_PER_FRAME = 2000;
        for (let o of obstacles) {
            if (!o || !o.chunks) continue;
            for (let c of o.chunks) {
                if (chunkChecks++ > MAX_CHUNK_CHECKS_PER_FRAME) break;
                if (c && c.burning && !c.destroyed) {
                    c.burning.time += dt;
                    if (!c.burning.nextTick) c.burning.nextTick = 0;
                    c.burning.nextTick -= dt;
                    if (c.burning.nextTick <= 0) {
                        // Damage chunk
                        c.hp = (typeof c.hp === 'number') ? c.hp - 0.25 : 1.0 - 0.25;
                        c.alpha = Math.max(0.25, Math.min(1, c.hp));
                        c.burning.nextTick = 0.32 + Math.random()*0.18;
                        if (c.hp <= 0) {
                            c.destroyed = true;
                            c.burning = null;
                        }
                    }
                    if (c.burning && c.burning.time > c.burning.duration) {
                        c.burning = null;
                    }
                }
            }
            if (chunkChecks > MAX_CHUNK_CHECKS_PER_FRAME) break;
        }
    }
    // --- Firestorm World Modifier Logic ---
    if (NET.role !== 'joiner' && firestormActive) {
        firestormTimer += dt;
        if (!firestormInstance && firestormTimer >= firestormNextTime) {
            // Spawn a new firestorm
            firestormTimer = 0;
            firestormNextTime = 10 + Math.random() * 20;
            // Pick a random position (avoid edges)
            let fx = rand(120, CANVAS_W - 120);
            let fy = rand(90, CANVAS_H - 90);
            let fradius = rand(110, 180);
            firestormInstance = new Firestorm(fx, fy, fradius);
        }
        // Update and clean up firestorm instance
        if (firestormInstance) {
            firestormInstance.update(dt);
            if (firestormInstance.done) {
                firestormInstance = null;
            }
        }
    }
// --- Firestorm Effect Class ---
    // World Modifier: Infestation logic
    if (NET.role !== 'joiner' && infestationActive) {
        infestationTimer += dt;
        // Random intervals between 1-10 seconds
        let nextInfestationTime = 1 + Math.random() * 9;
        if (infestationTimer >= nextInfestationTime) {
            infestationTimer = 0;
            // Find a random chunk to infest
            let availableChunks = [];
            for (let o of obstacles) {
                if (o.destroyed) continue;
                for (let c of o.chunks) {
                    if (!c.destroyed && !c.flying) {
                        availableChunks.push({ chunk: c, obstacle: o });
                    }
                }
            }
            if (availableChunks.length > 0) {
                let target = availableChunks[Math.floor(Math.random() * availableChunks.length)];
                let infestedChunk = new InfestedChunk(target.chunk, target.obstacle);
                infestedChunks.push(infestedChunk);
            }
        }
    }

    // World Modifier: Spontaneous explosions
    if (NET.role !== 'joiner' && spontaneousActive) {
        spontaneousTimer += dt;
        // Random intervals between 1-10 seconds
        let nextSpontaneousTime = 1 + Math.random() * 9;
        if (spontaneousTimer >= nextSpontaneousTime) {
            spontaneousTimer = 0;
            // Find a random non-destroyed obstacle
            let availableObstacles = obstacles.filter(o => !o.destroyed);
            if (availableObstacles.length > 0) {
                let targetObstacle = availableObstacles[Math.floor(Math.random() * availableObstacles.length)];
                // Calculate center of obstacle
                let centerX = targetObstacle.x + targetObstacle.w / 2;
                let centerY = targetObstacle.y + targetObstacle.h / 2;
                
                // Create explosion at center
                let explosionRadius = Math.max(targetObstacle.w, targetObstacle.h) * 0.8 + 30;
                let explosionDamage = 25;
                explosions.push(new Explosion(
                    centerX, centerY,
                    explosionRadius,
                    "#ff6b4a", // orange-red color for spontaneous
                    explosionDamage,
                    null, // no owner
                    false // not obliterator
                ));
                
                // Destroy the entire obstacle
                for (let c of targetObstacle.chunks) {
                    if (!c.destroyed) {
                        let ang = Math.atan2(c.y + c.h/2 - centerY, c.x + c.w/2 - centerX) + (Math.random()-0.5)*0.8;
                        let v = 200 + Math.random() * 180;
                        c.vx = Math.cos(ang) * v;
                        c.vy = Math.sin(ang) * v - 150;
                        c.flying = true;
                        c.destroyed = true;
                        c.alpha = 1;
                    }
                }
                targetObstacle.destroyed = true;
                
                playExplosion();
            }
        }
    }

    // Update infested chunks
    for (let ic of infestedChunks) {
        if (ic.active) {
            ic.update(dt, [player].concat(enemyDisabled ? [] : [enemy]));
        }
    }
    infestedChunks = infestedChunks.filter(ic => ic.active);
    if (NET.role !== 'joiner' && DYNAMIC_MODE) {
        dynamicTimer += dt;
        if (dynamicTimer >= DYNAMIC_RATE) {
            dynamicTimer = 0;
            if (dynamicSpawnNext) {
                spawnDynamicObstacle();
            } else {
                despawnDynamicObstacle();
            }
            dynamicSpawnNext = !dynamicSpawnNext;
        }
    }
    let input = { x: 0, y: 0 };
    if (keys['w']) input.y -= 1;
    if (keys['s']) input.y += 1;
    if (keys['a']) input.x -= 1;
    if (keys['d']) input.x += 1;
    // use top-level getDashSettings(p)
    if (simulateLocally && player.dash) {
        if (keys['shift'] && !player.dashActive && player.dashCooldown <= 0) {
            let dashVec = { x: 0, y: 0 };
            if (input.x || input.y) {
                let norm = Math.hypot(input.x, input.y);
                dashVec.x = input.x / norm;
                dashVec.y = input.y / norm;
            } else {
                let dx = mouse.x - player.x, dy = mouse.y - player.y;
                let norm = Math.hypot(dx, dy);
                if (norm > 0) {
                    dashVec.x = dx / norm;
                    dashVec.y = dy / norm;
                } else {
                    dashVec.x = 1; dashVec.y = 0;
                }
            }
            let dashSet = getDashSettings(player);
            player.dashActive = true;
            player.dashDir = dashVec;
            player.dashTime = dashSet.duration;
            player.dashCooldown = dashSet.cooldown;
            // Initialize per-dash deflect allowance
            player.deflectRemaining = (player.deflectStacks || 0);
            // mark next shot as big if player has stacks
            if ((player.bigShotStacks||0) > 0) player.bigShotPending = true;
            // play dash woosh (scale by duration and speed multiplier)
            try { playDashWoosh(player.dashTime, dashSet.speedMult); } catch (e) {}
        }
        if (player.dashActive) {
            let dashSet = getDashSettings(player);
            let dashVx = player.dashDir.x * player.speed * dashSet.speedMult;
            let dashVy = player.dashDir.y * player.speed * dashSet.speedMult;
            let oldX = player.x, oldY = player.y;
            player.x += dashVx * dt;
            player.y += dashVy * dt;
            player.x = clamp(player.x, player.radius, CANVAS_W-player.radius);
            player.y = clamp(player.y, player.radius, CANVAS_H-player.radius);
            let collided = false;
            // First: check collision with the enemy (characters) so ramming hits players/enemies directly in open space
            if (!enemyDisabled && player.ram && dist(player.x, player.y, enemy.x, enemy.y) < player.radius + enemy.radius) {
                let dmg = 18 + (player.ramStacks || 0) * 6; // damage scales per ram stack
                enemy.takeDamage(dmg);
                // revert position and mark collision so dash ends (mirror obstacle behavior)
                player.x = oldX; player.y = oldY;
                collided = true;
            }
            // Also check collision with infested chunks (they behave like destructible enemies)
            if (!collided && player.ram && (player.obliterator || (player.obliteratorStacks || 0) > 0) && infestedChunks && infestedChunks.length) {
                for (let ic of infestedChunks) {
                    if (!ic.active) continue;
                    let centerX = ic.x + ic.w/2, centerY = ic.y + ic.h/2;
                    let thresh = Math.max(ic.w, ic.h) * 0.5 + player.radius;
                    if (dist(player.x, player.y, centerX, centerY) < thresh) {
                        let ramStacks = player.ramStacks || 0;
                        let oblStacks = player.obliteratorStacks || 0;
                        let radiusMul = 1 + 0.22 * ramStacks;
                        let powerMul = 1 + 0.45 * oblStacks;
                        let basePower = 1.6 * (1 + 0.4 * ramStacks);
                        // chip the infested chunk (uses hp and explosion FX)
                        ic.chipAt(player.x, player.y, player.radius * 1.6 * radiusMul, basePower * powerMul, player.obliterator, false);
                        player.x = oldX; player.y = oldY;
                        collided = true;
                        break;
                    }
                }
            }
            // If no character collision, check collision with obstacles and apply ram/obliterator effects
            if (!collided) {
                for (let o of obstacles) {
                    if (o.circleCollide(player.x, player.y, player.radius)) {
                        // If player has ramming, deal damage to obstacle chunks at impact
                        if (player.ram && (player.obliterator || (player.obliteratorStacks || 0) > 0)) {
                            // Compute collision point and chip only if player has obliterator
                            let cx = player.x, cy = player.y;
                            let ramStacks = player.ramStacks || 0;
                            let oblStacks = player.obliteratorStacks || 0;
                            let radiusMul = 1 + 0.22 * ramStacks;
                            let powerMul = 1 + 0.45 * oblStacks;
                            // base power moderately tuned for dash
                            let basePower = 1.6 * (1 + 0.4 * ramStacks);
                            o.chipChunksAt(cx, cy, player.radius * 1.6 * radiusMul, basePower * powerMul, player.obliterator, false);
                        }
                        player.x = oldX;
                        player.y = oldY;
                        collided = true;
                        break;
                    }
                }
            }
            player.dashTime -= dt;
            if (player.dashTime <= 0 || collided) {
                player.dashActive = false;
            }
        } else {
            player.dashCooldown = Math.max(0, player.dashCooldown - dt);
        }
    }
    if (simulateLocally && !enemyDisabled && enemy.dash) {
        if (!enemy.dashActive && Math.random() < 0.003 && enemy.dashCooldown <= 0) {
            let dx = enemy.x - player.x, dy = enemy.y - player.y;
            let norm = Math.hypot(dx, dy);
            let dir = norm > 0 ? { x: dx/norm, y: dy/norm } : { x: 1, y: 0 };
            let dashSet = getDashSettings(enemy);
            enemy.dashActive = true;
            enemy.dashDir = dir;
            enemy.dashTime = dashSet.duration;
            enemy.dashCooldown = dashSet.cooldown;
            // Initialize enemy deflect allowance for this dash
            enemy.deflectRemaining = (enemy.deflectStacks || 0);
            if ((enemy.bigShotStacks||0) > 0) enemy.bigShotPending = true;
            // play dash woosh for enemy
            try { playDashWoosh(enemy.dashTime, dashSet.speedMult); } catch (e) {}
        }
        if (enemy.dashActive) {
            let dashSet = getDashSettings(enemy);
            let dashVx = enemy.dashDir.x * enemy.speed * dashSet.speedMult;
            let dashVy = enemy.dashDir.y * enemy.speed * dashSet.speedMult;
            let oldx = enemy.x, oldy = enemy.y;
            enemy.x += dashVx * dt;
            enemy.y += dashVy * dt;
            enemy.x = clamp(enemy.x, enemy.radius, CANVAS_W-enemy.radius);
            enemy.y = clamp(enemy.y, enemy.radius, CANVAS_H-enemy.radius);
            let collided = false;
            // First: check collision with player directly so enemy dash damages player in open space
            if (enemy.ram && dist(enemy.x, enemy.y, player.x, player.y) < enemy.radius + player.radius) {
                let dmg = 18 + (enemy.ramStacks || 0) * 6;
                player.takeDamage(dmg);
                enemy.x = oldx; enemy.y = oldy;
                collided = true;
            }
            // Also check collision with infested chunks
            if (!collided && enemy.ram && (enemy.obliterator || (enemy.obliteratorStacks || 0) > 0) && infestedChunks && infestedChunks.length) {
                for (let ic of infestedChunks) {
                    if (!ic.active) continue;
                    let centerX = ic.x + ic.w/2, centerY = ic.y + ic.h/2;
                    let thresh = Math.max(ic.w, ic.h) * 0.5 + enemy.radius;
                    if (dist(enemy.x, enemy.y, centerX, centerY) < thresh) {
                        let ramStacks = enemy.ramStacks || 0;
                        let oblStacks = enemy.obliteratorStacks || 0;
                        let radiusMul = 1 + 0.22 * ramStacks;
                        let powerMul = 1 + 0.45 * oblStacks;
                        let basePower = 1.6 * (1 + 0.4 * ramStacks);
                        ic.chipAt(enemy.x, enemy.y, enemy.radius * 1.6 * radiusMul, basePower * powerMul, enemy.obliterator, false);
                        enemy.x = oldx; enemy.y = oldy;
                        collided = true;
                        break;
                    }
                }
            }
            // If no character collision, check collision with obstacles
            if (!collided) {
                for(let o of obstacles) {
                    if(o.circleCollide(enemy.x, enemy.y, enemy.radius)) {
                        // Enemy ramming into obstacles
                        if (enemy.ram && (enemy.obliterator || (enemy.obliteratorStacks || 0) > 0)) {
                            let cx = enemy.x, cy = enemy.y;
                            let ramStacks = enemy.ramStacks || 0;
                            let oblStacks = enemy.obliteratorStacks || 0;
                            let radiusMul = 1 + 0.22 * ramStacks;
                            let powerMul = 1 + 0.45 * oblStacks;
                            let basePower = 1.6 * (1 + 0.4 * ramStacks);
                            o.chipChunksAt(cx, cy, enemy.radius * 1.6 * radiusMul, basePower * powerMul, enemy.obliterator, false);
                        }
                        enemy.x = oldx; enemy.y = oldy;
                        collided = true;
                        break;
                    }
                }
            }
            enemy.dashTime -= dt;
            if (enemy.dashTime <= 0 || collided) {
                enemy.dashActive = false;
            }
        } else {
            enemy.dashCooldown = Math.max(0, enemy.dashCooldown - dt);
        }
    }
    // If joiner, disable local enemy AI and movement (enemy will be driven by snapshots)
    if (NET.role === 'joiner') {
        // Joiner still moves their local player; enemy AI disabled below
    }
    if (simulateLocally && !player.dashActive) {
        if (input.x || input.y) {
            let norm = Math.hypot(input.x, input.y);
            input.x /= norm; input.y /= norm;
            let speed = player.speed;
            let oldX = player.x;
            player.x += input.x * speed * dt;
            player.x = clamp(player.x, player.radius, CANVAS_W-player.radius);
            let collidedX = false;
            for (let o of obstacles) {
                if (o.circleCollide(player.x, player.y, player.radius)) {
                    player.x = oldX;
                    collidedX = true;
                    break;
                }
            }
            let oldY = player.y;
            player.y += input.y * speed * dt;
            player.y = clamp(player.y, player.radius, CANVAS_H-player.radius);
            let collidedY = false;
            for (let o of obstacles) {
                if (o.circleCollide(player.x, player.y, player.radius)) {
                    player.y = oldY;
                    collidedY = true;
                    break;
                }
            }
        }
    }
    if (NET.role === 'host') {
        // Host: drive enemy using remote input from joiner
        let ri = NET.remoteInput || { up:false,down:false,left:false,right:false };
        let vx = (ri.right?1:0) - (ri.left?1:0);
        let vy = (ri.down?1:0) - (ri.up?1:0);
        if (!enemy.dashActive) {
            if (vx || vy) {
                let norm = Math.hypot(vx, vy);
                vx /= norm; vy /= norm;
                let speed = enemy.speed;
                let oldx = enemy.x, oldy = enemy.y;
                enemy.x += vx * speed * dt;
                enemy.y += vy * speed * dt;
                enemy.x = clamp(enemy.x, enemy.radius, CANVAS_W-enemy.radius);
                enemy.y = clamp(enemy.y, enemy.radius, CANVAS_H-enemy.radius);
                for(let o of obstacles) {
                    if(o.circleCollide(enemy.x, enemy.y, enemy.radius)) { enemy.x = oldx; enemy.y = oldy; }
                }
            }
        }
        // Remote shoot/dash intents
        if (ri.dash && enemy.dash && !enemy.dashActive && enemy.dashCooldown <= 0) {
            // trigger dash in the same way as AI, using direction toward aim
            let dx = (ri.aimX||player.x) - enemy.x;
            let dy = (ri.aimY||player.y) - enemy.y;
            let norm = Math.hypot(dx, dy) || 1;
            let dir = { x: dx/norm, y: dy/norm };
            let dashSet = getDashSettings(enemy);
            enemy.dashActive = true; enemy.dashDir = dir; enemy.dashTime = dashSet.duration; enemy.dashCooldown = dashSet.cooldown;
            enemy.deflectRemaining = (enemy.deflectStacks || 0);
            if ((enemy.bigShotStacks||0) > 0) enemy.bigShotPending = true;
            try { playDashWoosh(enemy.dashTime, dashSet.speedMult); } catch (e) {}
        }
        if (ri.shoot) {
            enemy.timeSinceShot += dt; // ensure timer progresses
            if (enemy.timeSinceShot >= enemy.shootInterval) {
                let target = { x: player.x, y: player.y };
                enemy.shootToward(target, bullets);
                // tag bullets with ids (host)
                for (let i = bullets.length-1; i >= 0; i--) {
                    if (bullets[i].owner === enemy && !bullets[i].id) NET.tagBullet(bullets[i]);
                }
                enemy.timeSinceShot = 0;
            }
        }
        // Consume shoot intent once per input message
        NET.remoteInput.shoot = false;
    } else {
        // Joiner: suppress local enemy AI entirely; enemy state comes from snapshots
        // No movement/AI here
    }
    if (simulateLocally) player.timeSinceShot += dt;
    if (simulateLocally && player.shootQueued && player.timeSinceShot >= player.shootInterval) {
        player.shootToward(mouse, bullets);
        // Host assigns bullet ids for player's bullets
        if (NET.role === 'host') {
            for (let i = bullets.length-1; i >= 0; i--) {
                if (bullets[i].owner === player && !bullets[i].id) NET.tagBullet(bullets[i]);
            }
        }
        player.timeSinceShot = 0;
        player.shootQueued = false;
    }
    if (simulateLocally && !enemyDisabled) {
    enemy.timeSinceShot += dt;
    let distToPlayer = dist(enemy.x, enemy.y, player.x, player.y);
    let canSeePlayer = hasLineOfSight(enemy.x, enemy.y, player.x, player.y, obstacles);
        let canShootDespiteBlock = enemy.pierce || enemy.obliterator;
        if (
            enemy.timeSinceShot >= enemy.shootInterval &&
            (canSeePlayer || canShootDespiteBlock) &&
            distToPlayer > 125 && distToPlayer < 430
        ) {
            let target = { x: player.x, y: player.y };
            enemy.shootToward(target, bullets);
            enemy.timeSinceShot = 0;
        }
    }
    for (let b of bullets) if(b.active) b.update(dt);
    for (let o of obstacles) o.update(dt);
    if (simulateLocally) {
        for (let e of explosions) if(!e.done) e.update(dt, obstacles, [player].concat(enemyDisabled ? [] : [enemy]));
        explosions = explosions.filter(e => !e.done);
    }


    // Bullet collision and effects (host only)
    if (simulateLocally) for (let b of bullets) {
        if (!b.active) continue;
        let victim = null;
        if (b.owner === player) {
            victim = enemyDisabled ? null : enemy;
        } else {
            victim = player;
        }
        let hit = false;
        if (victim && dist(b.x, b.y, victim.x, victim.y) < b.radius + victim.radius) {
            // If victim is dashing and has deflect available, reflect the bullet instead of taking damage
            if (victim.dashActive && victim.deflect && (victim.deflectRemaining || 0) > 0) {
                // compute normal from victim center to bullet
                let nx = b.x - victim.x;
                let ny = b.y - victim.y;
                let nlen = Math.hypot(nx, ny) || 0.0001;
                nx /= nlen; ny /= nlen;
                // reflect bullet angle
                let vx = Math.cos(b.angle), vy = Math.sin(b.angle);
                let dot = vx*nx + vy*ny;
                let rx = vx - 2 * dot * nx;
                let ry = vy - 2 * dot * ny;
                b.angle = Math.atan2(ry, rx);
                // nudge out of collision
                b.x += rx * (b.radius * 0.9);
                b.y += ry * (b.radius * 0.9);
                // reassign ownership to the deflector so it can hit original owner
                b.owner = victim;
                // decrement available deflects for this dash
                victim.deflectRemaining = Math.max(0, (victim.deflectRemaining||0) - 1);
                // If bullet had bounces left, consume one (optional) to match ricochet behavior
                if ((b.bouncesLeft|0) > 0) b.bouncesLeft = Math.max(0, b.bouncesLeft - 1);
                // ensure explosive bullets do NOT explode on deflect; keep them active
                b.active = true;
                try { playRicochet(); } catch (e) {}
                hit = true;
            } else {
                if (b.explosive) {
                    triggerExplosion(b, victim.x, victim.y);
                } else {
                    victim.takeDamage(b.damage);
                }
                b.active = false;
                hit = true;
            }
        }
        if (hit) continue;

        // Infested chunk collision
        for (let ic of infestedChunks) {
            if (!ic.active) continue;
            let centerX = ic.x + ic.w/2;
            let centerY = ic.y + ic.h/2;
            let r = Math.max(ic.w, ic.h) * 0.6;
            if (dist(b.x, b.y, centerX, centerY) < b.radius + r) {
                // Only bullets whose owner has obliterator can chip infested chunks
                if (b.obliterator || (b.obliteratorStacks || 0) > 0) {
                    let stacks = b.obliteratorStacks || 0;
                    let radiusMul = 1.22 * (1 + 0.35 * stacks);
                    let powerMul = 1 + 0.45 * stacks;
                    let chipPower = (b.damage/18) * powerMul;
                    let didChip = ic.chipAt(b.x, b.y, b.radius * radiusMul, chipPower, b.obliterator, b.explosive);
                    if (didChip) {
                        if (b.explosive) {
                            triggerExplosion(b, centerX, centerY);
                            b.active = false;
                            break;
                        }
                        if ((b.bouncesLeft|0) > 0) {
                            // reflect bullet
                            let nx = b.x - centerX;
                            let ny = b.y - centerY;
                            let nlen = Math.hypot(nx, ny);
                            if (nlen === 0) {
                                nx = (Math.random() - 0.5) || 0.0001;
                                ny = (Math.random() - 0.5) || 0.0001;
                                nlen = Math.hypot(nx, ny);
                            }
                            nx /= nlen; ny /= nlen;
                            let vx = Math.cos(b.angle), vy = Math.sin(b.angle);
                            let dot = vx*nx + vy*ny;
                            let rx = vx - 2 * dot * nx;
                            let ry = vy - 2 * dot * ny;
                            b.angle = Math.atan2(ry, rx);
                            b.bouncesLeft = Math.max(0, b.bouncesLeft - 1);
                            b.x += rx * (b.radius * 0.9);
                            b.y += ry * (b.radius * 0.9);
                            try { playRicochet(); } catch (e) {}
                            break;
                        } else {
                            b.active = false;
                            break;
                        }
                    }
                }
            }
        }
        if (!b.active) continue;

        for (let o of obstacles) {
            if (o.destroyed) continue;
            if (!b.pierce) {
                if (b.obliterator) {
                    // Scale chip radius and power by obliterator stacks on the bullet (from owner)
                    let stacks = b.obliteratorStacks || 0;
                    // base multiplier: small bump per stack (1 + 0.35*stacks)
                    let radiusMul = 1.22 * (1 + 0.35 * stacks);
                    let powerMul = 1 + 0.45 * stacks;
                    // Find the collided chunk/closest point BEFORE chipping so we can reflect
                    let collidedChunk = null;
                    let closestX = 0, closestY = 0;
                    for (const c of o.chunks) {
                        if (c.destroyed) continue;
                        let cx = clamp(b.x, c.x, c.x + c.w);
                        let cy = clamp(b.y, c.y, c.y + c.h);
                        let dx = b.x - cx, dy = b.y - cy;
                        if ((dx*dx + dy*dy) < b.radius * b.radius) {
                            collidedChunk = c;
                            closestX = cx; closestY = cy;
                            break;
                        }
                    }
                    // If we actually collided with a chunk and this bullet is explosive, explode at impact
                    if (collidedChunk) {
                        if (b.explosive) {
                            triggerExplosion(b, b.x, b.y, o);
                            b.active = false;
                            break;
                        }
                    }
                    let didChip = o.chipChunksAt(b.x, b.y, b.radius * radiusMul, (b.damage/18) * powerMul, true);
                    if (didChip) {
                        // If bullet can still ricochet, perform reflection instead of dying
                        if ((b.bouncesLeft|0) > 0) {
                            // if we have a precomputed collision point, reflect around its normal
                            if (collidedChunk) {
                                let nx = b.x - closestX;
                                let ny = b.y - closestY;
                                let nlen = Math.hypot(nx, ny);
                                if (nlen === 0) {
                                    nx = (Math.random() - 0.5) || 0.0001;
                                    ny = (Math.random() - 0.5) || 0.0001;
                                    nlen = Math.hypot(nx, ny);
                                }
                                nx /= nlen; ny /= nlen;
                                let vx = Math.cos(b.angle), vy = Math.sin(b.angle);
                                let dot = vx*nx + vy*ny;
                                let rx = vx - 2 * dot * nx;
                                let ry = vy - 2 * dot * ny;
                                b.angle = Math.atan2(ry, rx);
                                b.bouncesLeft = Math.max(0, b.bouncesLeft - 1);
                                b.x += rx * (b.radius * 0.9);
                                b.y += ry * (b.radius * 0.9);
                                try { playRicochet(); } catch (e) {}
                                // continue to next obstacle/bullet
                                break;
                            } else {
                                // destroyed chunks prevented finding collision point; try a generic reflection
                                let nx = (Math.random() - 0.5) || 0.0001;
                                let ny = (Math.random() - 0.5) || 0.0001;
                                let nlen = Math.hypot(nx, ny);
                                nx /= nlen; ny /= nlen;
                                let vx = Math.cos(b.angle), vy = Math.sin(b.angle);
                                let dot = vx*nx + vy*ny;
                                let rx = vx - 2 * dot * nx;
                                let ry = vy - 2 * dot * ny;
                                b.angle = Math.atan2(ry, rx);
                                b.bouncesLeft = Math.max(0, b.bouncesLeft - 1);
                                b.x += rx * (b.radius * 0.9);
                                b.y += ry * (b.radius * 0.9);
                                try { playRicochet(); } catch (e) {}
                                break;
                            }
                        } else {
                            // no bounces left -> deactivate
                            b.active = false;
                            break;
                        }
                    }
                } else {
                    // Check collision against chunks so we can compute a surface normal for ricochet
                    let collidedChunk = null;
                    let closestX = 0, closestY = 0;
                    for (const c of o.chunks) {
                        if (c.destroyed) continue;
                        let cx = clamp(b.x, c.x, c.x + c.w);
                        let cy = clamp(b.y, c.y, c.y + c.h);
                        let dx = b.x - cx, dy = b.y - cy;
                        if ((dx*dx + dy*dy) < b.radius * b.radius) {
                            collidedChunk = c;
                            closestX = cx; closestY = cy;
                            break;
                        }
                    }
                    if (collidedChunk) {
                        // Non-obliterator bullets no longer chip chunks; only obliterator-enabled owners can chip
                        if (b.explosive) {
                            triggerExplosion(b, b.x, b.y, o);
                            b.active = false;
                            break;
                        }
                        if ((b.bouncesLeft|0) > 0) {
                            // reflect velocity around surface normal (from collision point to bullet center)
                            let nx = b.x - closestX;
                            let ny = b.y - closestY;
                            let nlen = Math.hypot(nx, ny);
                            if (nlen === 0) {
                                // fallback normal if center exactly on corner
                                nx = (Math.random() - 0.5) || 0.0001;
                                ny = (Math.random() - 0.5) || 0.0001;
                                nlen = Math.hypot(nx, ny);
                            }
                            nx /= nlen; ny /= nlen;
                            let vx = Math.cos(b.angle), vy = Math.sin(b.angle);
                            let dot = vx*nx + vy*ny;
                            let rx = vx - 2 * dot * nx;
                            let ry = vy - 2 * dot * ny;
                            // set new angle and decrement bounce count
                            b.angle = Math.atan2(ry, rx);
                            b.bouncesLeft = Math.max(0, b.bouncesLeft - 1);
                            // nudge bullet out of collision so it doesn't immediately re-collide
                            b.x += rx * (b.radius * 0.9);
                            b.y += ry * (b.radius * 0.9);
                            try { playRicochet(); } catch (e) {}
                            // continue to next bullet (don't deactivate)
                            break;
                        } else {
                            // no bounces left -> behave as before
                            b.active = false;
                            break;
                        }
                    }
                }
            }
        }
    }
    bullets = bullets.filter(b => b.active);

    [player, enemy].forEach(p => {
        if (p.shakeTime > 0) p.shakeTime -= dt;
        if (p.damageFlash > 0) p.damageFlash -= dt;
        if (p.healthbarFlash > 0) p.healthbarFlash -= dt;
    });

    // --- Respawn, health reset, card (host-authoritative) ---
    if (!waitingForCard && NET.connected && NET.role === 'host') {
        const participants = [player, enemy];
        for (let p of participants) {
            if (p.health <= 0) {
                waitingForCard = true;
                const loser = p;
                const loserRole = (loser === player) ? 'host' : 'joiner';
                const winner = (loser === player) ? enemy : player;
                winner.score++;
                if (winner.healOnKill) winner.health = Math.min(winner.health + 25, winner.healthMax);
                bullets = [];
                explosions = [];
                // Rebuild map for next round
                const sel = document.getElementById('saved-maps');
                if (sel && sel.value) {
                    if (sel.value === '__RANDOM__') {
                        const key = pickRandomSavedMapKey();
                        if (key) loadSavedMapByKey(key); else generateObstacles();
                    } else {
                        loadSavedMapByKey(sel.value);
                    }
                } else {
                    generateObstacles();
                }
                positionPlayersSafely();
                // Reset dead entity health
                if (loser === player) player.reset(player.x, player.y); else enemy.reset(enemy.x, enemy.y);
                // Broadcast round-reset (map + scores + positions)
                try {
                    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                        window.ws.send(JSON.stringify({ type:'relay', data: {
                            type:'round-reset',
                            obstacles: serializeObstacles(),
                            hostPos: { x: player.x, y: player.y, hp: player.health },
                            joinerPos: { x: enemy.x, y: enemy.y, hp: enemy.health },
                            scores: { host: (player.score||0), joiner: (enemy.score||0) }
                        }}));
                    }
                } catch (e) {}
                // Decide what selection to show
                roundsSinceLastModifier++;
                if (roundsSinceLastModifier >= worldModifierRoundInterval) {
                    roundsSinceLastModifier = 0;
                    // World modifier offer (3 cards). Chooser: winner by default.
                    const chooserRole = (winner === player) ? 'host' : 'joiner';
                    const pool = WORLD_MODIFIERS;
                    const choices = randomChoice(pool, 3).map(c => c.name);
                    // Show locally for host
                    setTimeout(() => netShowWorldModifierCards(choices, chooserRole), 700);
                    // Broadcast offer
                    try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'mod-offer', choices, chooserRole } })); } catch (e) {}
                } else {
                    // Powerup offer (5 cards) for the loser
                    const choices = randomChoice(POWERUPS, 5).map(c => c.name);
                    const chooserRole = loserRole;
                    setTimeout(() => netShowPowerupCards(choices, chooserRole), 700);
                    try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'card-offer', choices, chooserRole } })); } catch (e) {}
                }
                break;
            }
        }
    }
}

// --- Explosion trigger ---
function triggerExplosion(bullet, x, y) {
    let owner = bullet.owner;
    let explosionRadius = EXPLOSION_BASE_RADIUS * (bullet.radius / BULLET_RADIUS) * (1 + bullet.damage/34);
    let explosionDamage = bullet.damage * (1.15 + bullet.radius / BULLET_RADIUS * 0.22);
    let canObliterate = bullet.obliterator;
    if (canObliterate) {
        explosionRadius *= 1.25;
        explosionDamage *= 1.18;
    }
    explosionRadius = Math.min(explosionRadius, 220);
    explosionDamage = Math.max(8, Math.min(explosionDamage, 90));
    explosions.push(new Explosion(
        x, y,
        explosionRadius,
        owner.color,
        explosionDamage,
        owner,
        canObliterate
    ));
    playExplosion();
}

// --- Draw ---
function draw() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (MAP_BORDER) {
        ctx.save();
        ctx.strokeStyle = '#3d4550';
        ctx.lineWidth = 6;
        ctx.globalAlpha = 0.55;
        ctx.strokeRect(3, 3, CANVAS_W-6, CANVAS_H-6);
        ctx.restore();
    }
    for(let o of obstacles) o.draw(ctx);
    for(let b of bullets) {
        ctx.save();
        ctx.globalAlpha = 0.78;
        ctx.fillStyle = b.owner.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI*2);
        ctx.fill();
        if (b.explosive) {
            ctx.globalAlpha = 0.38;
            ctx.shadowColor = "#fff";
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius*1.88, 0, Math.PI*2);
            ctx.fillStyle = "#fff";
            ctx.fill();
            ctx.shadowBlur = 0;
        }
        ctx.restore();
    }
    for(let e of explosions) e.draw(ctx);
    // Draw infested chunks
    for(let ic of infestedChunks) {
        ic.draw(ctx);
    }
    // Draw firestorm
    if (firestormInstance) {
        firestormInstance.draw(ctx);
    }
    if (typeof player !== 'undefined' && player) drawPlayer(player);
    if ((NET.connected || !enemyDisabled) && typeof enemy !== 'undefined' && enemy) drawPlayer(enemy);

    ctx.save();
    ctx.font = "bold 22px sans-serif";
    // Player 1 / Player 2 labels: host is P1, joiner is P2
    const P1 = (NET.role === 'joiner') ? enemy : player;
    const P2 = (NET.role === 'joiner') ? player : enemy;
    ctx.fillStyle = "#65c6ff";
    ctx.fillText("Player 1: " + ((P1 && typeof P1.score === 'number') ? P1.score : '0'), 24, 34);
    ctx.fillStyle = "#ff5a5a";
    if (P2) ctx.fillText("Player 2: " + ((P2 && typeof P2.score === 'number') ? P2.score : '0'), CANVAS_W - 160, 34);
    ctx.restore();

    drawCardsUI();
}

function drawPlayer(p) {
    ctx.save();
    let shakeX = 0, shakeY = 0;
    if (p.shakeTime > 0) {
        let mag = p.shakeMag * (p.shakeTime / 0.18);
        shakeX = rand(-mag, mag);
        shakeY = rand(-mag, mag);
    }
    let baseColor = p.color;
    if (p.damageFlash > 0) {
        let t = Math.min(1, p.damageFlash / 0.25);
        baseColor = p.isPlayer ? "#9af9ff" : "#ffc9c9";
        ctx.shadowColor = "#fff";
        ctx.shadowBlur = 30 * t;
    } else {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.arc(p.x + shakeX, p.y + shakeY, p.radius, 0, Math.PI*2);
    ctx.fillStyle = baseColor;
    ctx.globalAlpha = 0.94;
    ctx.fill();
    let cdFrac = Math.min(1, p.timeSinceShot / p.shootInterval);
    if (cdFrac < 1) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x + shakeX, p.y + shakeY, p.radius + 7, -Math.PI/2, -Math.PI/2 + Math.PI*2*cdFrac, false);
    // Use the player's own color for cooldown ring to match role mapping
    ctx.strokeStyle = p.color;
        ctx.globalAlpha = 0.48;
        ctx.lineWidth = 4.2;
    ctx.shadowColor = p.color;
        ctx.shadowBlur = 2;
        ctx.stroke();
        ctx.restore();
    }

    // Draw dash cooldown only (do not show dash-progress while dashing)
    try {
        let dashSet = getDashSettings(p);
        if ((dashSet.cooldown || 0) > 0 && p.dashCooldown > 0) {
            // readyFrac: 0 = just used (empty arc), 1 = ready (full)
            let readyFrac = 1 - clamp(p.dashCooldown / dashSet.cooldown, 0, 1);
            ctx.save();
            ctx.beginPath();
            ctx.arc(p.x + shakeX, p.y + shakeY, p.radius + 13, -Math.PI/2, -Math.PI/2 + Math.PI*2*readyFrac, false);
            ctx.strokeStyle = '#ffd86b';
            ctx.globalAlpha = 0.62;
            ctx.lineWidth = 3.6;
            ctx.shadowColor = '#ffd86b';
            ctx.shadowBlur = 6;
            ctx.stroke();
            ctx.restore();
        }
    } catch (e) { /* defensive: if something unexpected, ignore dash UI */ }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    let w = 54, h = 10;
    let x = p.x - w/2 + shakeX, y = p.y - p.radius - 18 + shakeY;
    ctx.save();
    if (p.healthbarFlash > 0) {
        let t = Math.min(1, p.healthbarFlash / 0.45);
        ctx.shadowColor = "#fff";
        ctx.shadowBlur = 16 * t;
    }
    ctx.fillStyle = "#222";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#56ff7a";
    ctx.fillRect(x, y, w * clamp(p.health/p.healthMax, 0, 1), h);
    ctx.strokeStyle = "#000";
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
    ctx.restore();
}

// --- Powerup Cards ---
function showPowerupCards(loser) {
    cardState.active = true;
    cardState.player = loser;
    let div = document.getElementById('card-choices');
    div.innerHTML = "";
    let choices = randomChoice(POWERUPS, 5);

    if (loser.isPlayer) {
        div.innerHTML = '';
        const handRadius = 220;
        const cardCount = choices.length;
        const baseAngle = Math.PI / 2;
        const spread = Math.PI / 1.1;
        const cardWidth = 170;
        const cardHeight = 220;
        for(let i = 0; i < cardCount; ++i) {
            let opt = choices[i];
            let card = document.createElement('div');
            card.className = "card card-uniform";
            card.innerHTML = `<b>${opt.name}</b><br><small>${opt.desc}</small>`;
            // Flip the fan direction so cards lay like a hand: invert angle step and rotation, and flip vertical offset
            let theta = baseAngle - (i - (cardCount-1)/2) * (spread/(cardCount-1));
            let x = Math.cos(theta) * handRadius;
            let y = Math.sin(theta) * handRadius;
            let rot = (Math.PI/2 - theta) * 28;
            card.style.position = 'absolute';
            card.style.left = `calc(50% + ${x}px)`;
            // use +y so the cards arc the other way (more like a held hand)
            // lower the whole fan so it sits further down the screen
            card.style.bottom = `calc(-10% + ${y}px)`;
            card.style.width = cardWidth + 'px';
            card.style.height = cardHeight + 'px';
            card.style.transform = `translate(-50%, 0) rotate(${rot}deg)`;
            card.onmouseenter = () => {
                Array.from(div.children).forEach(c => c.classList.remove('selected', 'centered'));
                card.classList.add('selected', 'centered');
                card.style.zIndex = 10;
                card.style.transform = 'translate(-50%, -60px) scale(1.18) rotate(0deg)';
                // highlight with loser's color: border, glow, and text
                try {
                    card.style.setProperty('border', '3px solid ' + loser.color, 'important');
                    card.style.setProperty('box-shadow', '0 6px 18px ' + loser.color, 'important');
                    // override CSS .card.centered !important color
                    card.style.setProperty('color', loser.color, 'important');
                    const sm = card.querySelector('small'); if (sm) sm.style.setProperty('color', loser.color, 'important');
                    // inject per-card ::after override for the glow
                    if (!card._accentClass) card._accentClass = 'card-accent-' + Math.floor(Math.random()*1000000);
                    if (!card._accentStyle) {
                        const styleEl = document.createElement('style');
                        styleEl.innerText = `.${card._accentClass}::after{ background: radial-gradient(ellipse at center, ${loser.color}33 0%, #0000 100%) !important; } .${card._accentClass}.centered::after{ background: radial-gradient(ellipse at center, ${loser.color}55 0%, #0000 100%) !important; }`;
                        document.head.appendChild(styleEl);
                        card._accentStyle = styleEl;
                    }
                    card.classList.add(card._accentClass);
                } catch (ex) {}
            };
            card.onmouseleave = () => {
                card.classList.remove('selected', 'centered');
                card.style.zIndex = 1;
                card.style.transform = `translate(-50%, 0) rotate(${rot}deg)`;
                // reset highlight
                try {
                    card.style.removeProperty('border');
                    card.style.removeProperty('box-shadow');
                    card.style.removeProperty('color');
                    const sm = card.querySelector('small'); if (sm) sm.style.removeProperty('color');
                    if (card._accentClass) card.classList.remove(card._accentClass);
                    if (card._accentStyle) { card._accentStyle.remove(); card._accentStyle = null; }
                } catch (ex) {}
            };
            card.onclick = () => {
                Array.from(div.children).forEach(c => c.classList.remove('selected', 'centered'));
                card.classList.add('selected', 'centered');
                try {
                    card.style.setProperty('border', '3px solid ' + loser.color, 'important');
                    card.style.setProperty('box-shadow', '0 6px 18px ' + loser.color, 'important');
                    card.style.setProperty('color', loser.color, 'important');
                    const sm = card.querySelector('small'); if (sm) sm.style.setProperty('color', loser.color, 'important');
                } catch (ex) {}
                setTimeout(() => {
                    opt.effect(loser);
                    loser.addCard(opt.name);
                    // cleanup accent style if present
                    try { if (card._accentStyle) { card._accentStyle.remove(); card._accentStyle = null; } } catch (ex) {}
                    div.style.display = "none";
                    div.innerHTML = '';
                    div.removeAttribute('style');
                    div.classList.remove('card-bg-visible');
                    cardState.active = false;
                    waitingForCard = false;
                }, 220);
            };
            div.appendChild(card);
        }
        div.style.display = "flex";
        div.style.position = 'absolute';
        div.style.left = '50%';
        div.style.top = '50%';
        div.style.transform = 'translate(-50%, -50%)';
        div.style.height = '320px';
        div.style.width = '900px';
    } else {
        div.innerHTML = '';
        const handRadius = 220;
        const cardCount = choices.length;
        const baseAngle = Math.PI / 2;
        const spread = Math.PI / 1.1;
        const cardWidth = 170;
        const cardHeight = 220;
        for(let i = 0; i < cardCount; ++i) {
            let opt = choices[i];
            let card = document.createElement('div');
            card.className = "card card-uniform";
            card.innerHTML = `<b>${opt.name}</b><br><small>${opt.desc}</small>`;
            // Flip the fan direction so cards lay like a hand: invert angle step and rotation, and flip vertical offset
            let theta = baseAngle - (i - (cardCount-1)/2) * (spread/(cardCount-1));
            let x = Math.cos(theta) * handRadius;
            let y = Math.sin(theta) * handRadius;
            let rot = (Math.PI/2 - theta) * 28;
            card.style.position = 'absolute';
            card.style.left = `calc(50% + ${x}px)`;
            // use +y so the cards arc the other way (more like a held hand)
            // match player's custom offset (-10%) so enemy cards appear in the same place
            card.style.bottom = `calc(-10% + ${y}px)`;
            card.style.width = cardWidth + 'px';
            card.style.height = cardHeight + 'px';
            card.style.transform = `translate(-50%, 0) rotate(${rot}deg)`;
            // add hover highlight so it matches player behavior if visible briefly
            card.onmouseenter = () => {
                try {
                    card.style.setProperty('border', '3px solid ' + loser.color, 'important');
                    card.style.setProperty('box-shadow', '0 6px 18px ' + loser.color, 'important');
                    card.style.setProperty('color', loser.color, 'important');
                    const sm = card.querySelector('small'); if (sm) sm.style.setProperty('color', loser.color, 'important');
                    if (!card._accentClass) card._accentClass = 'card-accent-' + Math.floor(Math.random()*1000000);
                    if (!card._accentStyle) {
                        const styleEl = document.createElement('style');
                        styleEl.innerText = `.${card._accentClass}::after{ background: radial-gradient(ellipse at center, ${loser.color}33 0%, #0000 100%) !important; } .${card._accentClass}.centered::after{ background: radial-gradient(ellipse at center, ${loser.color}55 0%, #0000 100%) !important; }`;
                        document.head.appendChild(styleEl);
                        card._accentStyle = styleEl;
                    }
                    card.classList.add(card._accentClass);
                } catch (ex) {}
            };
            card.onmouseleave = () => {
                try {
                    card.style.removeProperty('border');
                    card.style.removeProperty('box-shadow');
                    card.style.removeProperty('color');
                    const sm = card.querySelector('small'); if (sm) sm.style.removeProperty('color');
                    if (card._accentClass) card.classList.remove(card._accentClass);
                    if (card._accentStyle) { card._accentStyle.remove(); card._accentStyle = null; }
                } catch (ex) {}
            };
            div.appendChild(card);
        }
        div.style.display = "flex";
        div.style.position = 'absolute';
        div.style.left = '50%';
        div.style.top = '50%';
        div.style.transform = 'translate(-50%, -50%)';
        div.style.height = '320px';
        div.style.width = '900px';
        setTimeout(() => {
            let idx = randInt(0, choices.length-1);
            let card = div.childNodes[idx];
            card.classList.add('selected', 'centered');
            card.style.zIndex = 10;
            card.style.transform = 'translate(-50%, -60px) scale(1.18) rotate(0deg)';
            // highlight using loser's color (border, glow, text, and ::after)
            try {
                card.style.setProperty('border', '3px solid ' + loser.color, 'important');
                card.style.setProperty('box-shadow', '0 6px 18px ' + loser.color, 'important');
                card.style.setProperty('color', loser.color, 'important');
                const sm = card.querySelector('small'); if (sm) sm.style.setProperty('color', loser.color, 'important');
                if (!card._accentClass) card._accentClass = 'card-accent-' + Math.floor(Math.random()*1000000);
                if (!card._accentStyle) {
                    const styleEl = document.createElement('style');
                    styleEl.innerText = `.${card._accentClass}::after{ background: radial-gradient(ellipse at center, ${loser.color}33 0%, #0000 100%) !important; } .${card._accentClass}.centered::after{ background: radial-gradient(ellipse at center, ${loser.color}55 0%, #0000 100%) !important; }`;
                    document.head.appendChild(styleEl);
                    card._accentStyle = styleEl;
                }
                card.classList.add(card._accentClass);
            } catch (ex) {}
            setTimeout(() => {
                let pickedCard = choices[idx];
                pickedCard.effect(loser);
                loser.addCard(pickedCard.name);
                div.style.display = "none";
                div.innerHTML = '';
                div.removeAttribute('style');
                cardState.active = false;
                waitingForCard = false;
            }, 700);
        }, 1100);
    }
}

// Networked selection helpers (host composes choices and sends; clients display based on chooserRole)
function netShowPowerupCards(choiceNames, chooserRole) {
    // chooserRole: 'host' or 'joiner'
    const isMe = (chooserRole === NET.role);
    const loser = (chooserRole === 'host') ? player : enemy; // chooser is the loser of the round
    // Build fake POWERUPS array subset
    const choices = choiceNames.map(n => getCardByName(n)).filter(Boolean);
    if (!isMe) {
        // Show read-only choices (no click), highlight selection will be applied when host broadcasts pick
        cardState.active = true;
        const div = document.getElementById('card-choices');
        div.innerHTML = '';
        const handRadius = 220, cardWidth = 170, cardHeight = 220;
        const baseAngle = Math.PI / 2, spread = Math.PI / 1.1;
        for (let i = 0; i < choices.length; ++i) {
            const opt = choices[i];
            const card = document.createElement('div');
            card.className = 'card card-uniform';
            card.innerHTML = `<b>${opt.name}</b><br><small>${opt.desc}</small>`;
            const theta = baseAngle - (i - (choices.length-1)/2) * (spread/(choices.length-1));
            const x = Math.cos(theta) * handRadius;
            const y = Math.sin(theta) * handRadius;
            const rot = (Math.PI/2 - theta) * 28;
            Object.assign(card.style, { position:'absolute', left:`calc(50% + ${x}px)`, bottom:`calc(-10% + ${y}px)`, width:cardWidth+'px', height:cardHeight+'px', transform:`translate(-50%, 0) rotate(${rot}deg)` });
            div.appendChild(card);
        }
        Object.assign(div.style, { display:'flex', position:'absolute', left:'50%', top:'50%', transform:'translate(-50%, -50%)', height:'320px', width:'900px' });
        div.classList.add('card-bg-visible');
        return;
    }
    // Let the chooser pick and report back to host
    // Reuse existing showPowerupCards but override choices
    cardState.active = true;
    const div = document.getElementById('card-choices');
    div.innerHTML = '';
    const handRadius = 220, cardWidth = 170, cardHeight = 220; const baseAngle = Math.PI/2, spread = Math.PI/1.1;
    for (let i = 0; i < choices.length; ++i) {
        const opt = choices[i];
        const card = document.createElement('div');
        card.className = 'card card-uniform';
        card.innerHTML = `<b>${opt.name}</b><br><small>${opt.desc}</small>`;
        const theta = baseAngle - (i - (choices.length-1)/2) * (spread/(choices.length-1));
        const x = Math.cos(theta) * handRadius;
        const y = Math.sin(theta) * handRadius;
        const rot = (Math.PI/2 - theta) * 28;
        Object.assign(card.style, { position:'absolute', left:`calc(50% + ${x}px)`, bottom:`calc(-10% + ${y}px)`, width:cardWidth+'px', height:cardHeight+'px', transform:`translate(-50%, 0) rotate(${rot}deg)` });
        card.onclick = () => {
            if (NET.role === 'host' && chooserRole === 'host') {
                // Host is chooser: apply immediately and broadcast final apply
                try { opt.effect(loser); loser.addCard(opt.name); } catch (e) {}
                try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'card-apply', pickerRole: chooserRole, card: opt.name } })); } catch (e) {}
                div.style.display = 'none'; div.innerHTML = ''; div.classList.remove('card-bg-visible');
                cardState.active = false; waitingForCard = false;
            } else {
                // Joiner is chooser: send pick to host and wait for card-apply
                try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'card-pick', pickerRole: chooserRole, card: opt.name } })); } catch (e) {}
                // Optional: hide UI while waiting
                div.style.display = 'none'; div.innerHTML = ''; div.classList.remove('card-bg-visible');
                // keep waitingForCard true until apply arrives
            }
        };
        div.appendChild(card);
    }
    Object.assign(div.style, { display:'flex', position:'absolute', left:'50%', top:'50%', transform:'translate(-50%, -50%)', height:'320px', width:'900px' });
    div.classList.add('card-bg-visible');
}

function netShowWorldModifierCards(choiceNames, chooserRole) {
    const isMe = (chooserRole === NET.role);
    const choices = choiceNames.map(n => WORLD_MODIFIERS.find(m => m.name === n)).filter(Boolean);
    if (!isMe) {
        // Read-only preview for the non-chooser
        const div = document.getElementById('card-choices');
        div.innerHTML = '';
        const cardWidth = 220, cardHeight = 260;
        for (let i = 0; i < choices.length; ++i) {
            const opt = choices[i];
            const card = document.createElement('div');
            card.className = 'card card-uniform world-modifier';
            card.innerHTML = `<b>${opt.name}</b><br><small>${opt.desc}</small>`;
            Object.assign(card.style, { position:'absolute', left:`calc(50% + ${(i-1)*cardWidth*1.1}px)`, top:'50%', width: cardWidth+'px', height: cardHeight+'px', transform:'translate(-50%, -50%)' });
            div.appendChild(card);
        }
        Object.assign(div.style, { display:'flex', position:'absolute', left:'50%', top:'50%', transform:'translate(-50%, -50%)', height:'320px', width:'900px' });
        div.classList.add('card-bg-visible');
        return;
    }
    // Chooser can click; broadcast pick
    const div = document.getElementById('card-choices');
    div.innerHTML = '';
    const cardWidth = 220, cardHeight = 260;
    for (let i = 0; i < choices.length; ++i) {
        const opt = choices[i];
        const card = document.createElement('div');
        card.className = 'card card-uniform world-modifier';
        card.innerHTML = `<b>${opt.name}</b><br><small>${opt.desc}</small>`;
        Object.assign(card.style, { position:'absolute', left:`calc(50% + ${(i-1)*cardWidth*1.1}px)`, top:'50%', width: cardWidth+'px', height: cardHeight+'px', transform:'translate(-50%, -50%)' });
        card.onclick = () => {
            if (NET.role === 'host' && chooserRole === 'host') {
                // Host chooser applies immediately and broadcasts apply
                try { applyWorldModifierByName(opt.name); } catch (e) {}
                try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'mod-apply', name: opt.name } })); } catch (e) {}
                div.style.display = 'none'; div.innerHTML = ''; div.classList.remove('card-bg-visible');
                cardState.active = false; waitingForCard = false;
            } else {
                // Joiner chooser sends pick to host and waits for apply
                try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'mod-pick', name: opt.name } })); } catch (e) {}
                div.style.display = 'none'; div.innerHTML = ''; div.classList.remove('card-bg-visible');
                // keep waitingForCard until mod-apply arrives
            }
        };
        div.appendChild(card);
    }
    Object.assign(div.style, { display:'flex', position:'absolute', left:'50%', top:'50%', transform:'translate(-50%, -50%)', height:'320px', width:'900px' });
    div.classList.add('card-bg-visible');
}

// --- Cards UI ---
function updateCardsUI() {
    let cardsDiv = document.getElementById('cards-ui');
    if (!cardsDiv) return;
    function cardHtml(cardName, count) {
        let card = getCardByName(cardName);
        let suffix = count > 1 ? ` <small style="opacity:0.85; margin-left:6px;">x${count}</small>` : '';
        return `<span class="card-badge" title="${card ? card.desc : ""}">${cardName}${suffix}</span>`;
    }

    function buildHtmlForList(cards) {
        if (!cards || cards.length === 0) return '<span class="card-badge none">None</span>';
        // count occurrences
        let counts = {};
        for (let c of cards) counts[c] = (counts[c] || 0) + 1;
        let out = [];
        for (let name of Object.keys(counts)) out.push(cardHtml(name, counts[name]));
        return out.join('');
    }

    const P1 = (NET.role === 'joiner') ? enemy : player;
    const P2 = (NET.role === 'joiner') ? player : enemy;
    const p1Cards = (P1 && Array.isArray(P1.cards)) ? P1.cards : [];
    const p2Cards = (P2 && Array.isArray(P2.cards)) ? P2.cards : [];
    cardsDiv.innerHTML =
        `<div class="cards-list"><span style="color:#65c6ff;font-weight:bold;">Player 1 Cards:</span> ${buildHtmlForList(p1Cards)}</div>` +
        `<div class="cards-list" style="margin-top:7px;"><span style="color:#ff5a5a;font-weight:bold;">Player 2 Cards:</span> ${buildHtmlForList(p2Cards)}</div>`;
}
function drawCardsUI() {
    updateCardsUI();
}

// --- Setup Overlay Logic ---
function setupOverlayInit() {
    // --- Multiplayer WebSocket logic ---
    // Make networking vars global so update() can access them reliably
    window.ws = null;
    window.wsRole = null; // 'host' or 'joiner'
    window.wsSession = null;
    window.remotePlayerState = { x: 0, y: 0, shoot: false, dash: false };
    window.lastSentAction = {};
    // Configurable server URL: prefer ?ws=, otherwise try same origin, fallback to localhost
    const paramWs = new URLSearchParams(window.location.search).get('ws');
    const defaultWs = (location.protocol === 'https:' ? 'wss://' : 'ws://') + (location.hostname || 'localhost') + ':3001';
    window.MULTIPLAYER_WS_URL = paramWs || defaultWs;

    window.sendAction = function(action) {
        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify({ type: 'relay', data: action }));
        }
    };

    function handleGameMessage(data) {
        // Update remote player state
        if (typeof data.x === 'number' && typeof data.y === 'number') {
            remotePlayerState.x = data.x;
            remotePlayerState.y = data.y;
        }
        if (data.shoot) remotePlayerState.shoot = true;
        if (data.dash) remotePlayerState.dash = true;
    }

    // Patch ws.onmessage to use handleGameMessage
    function patchWsOnMessage() {
        if (!window.ws) return;
        window.ws.onmessage = function(event) {
            let msg;
            try { msg = JSON.parse(event.data); } catch (e) { return; }
            if (msg.type === 'hosted') {
                if (mpSessionCode) mpSessionCode.value = msg.code;
            } else if (msg.type === 'joined') {
                hideMpModal();
                alert('Joined session: ' + msg.code);
            } else if (msg.type === 'peer-joined') {
                hideMpModal();
                alert('A player has joined your session!');
            } else if (msg.type === 'relay') {
                // New routing: input from joiner to host, snapshots from host to joiner
                const data = msg.data;
                if (data && data.type === 'input' && NET.role === 'host') {
                    NET.remoteInput = { ...(data.input||{}), seq: data.seq };
                } else if (data && data.type === 'snapshot' && NET.role === 'joiner') {
                    NET.applySnapshot(data.snap);
                } else if (data && data.type === 'setup' && NET.role === 'joiner') {
                    // Update the joiner's setup UI live
                    applyIncomingSetup(data.data);
                } else if (data && data.type === 'round-start') {
                    // Sync obstacles and critical flags before starting
                    if (NET.role === 'joiner') {
                        // apply settings
                        try {
                            DYNAMIC_MODE = !!data.dynamic;
                            DYNAMIC_RATE = parseFloat(data.dynamicRate);
                            MAP_BORDER = !!data.mapBorder;
                            worldModifierRoundInterval = parseInt(data.worldModInterval||3);
                            // build obstacles
                            deserializeObstacles(data.obstacles||[]);
                        } catch (e) {}
                        // Close any lingering card UI
                        const div = document.getElementById('card-choices');
                        if (div) { div.style.display='none'; div.innerHTML=''; div.classList.remove('card-bg-visible'); }
                        cardState.active = false; waitingForCard = false;
                    }
                } else if (data && data.type === 'round-reset') {
                    // Host reset after death: sync map, positions, and scores
                    try {
                        if (NET.role === 'joiner') {
                            deserializeObstacles(data.obstacles||[]);
                            if (data.hostPos) { enemy.x = data.hostPos.x; enemy.y = data.hostPos.y; enemy.health = data.hostPos.hp; }
                            if (data.joinerPos) { player.x = data.joinerPos.x; player.y = data.joinerPos.y; player.health = data.joinerPos.hp; }
                            if (data.scores) {
                                // P1 (host) shows on joiner as enemy; P2 (joiner) shows as player
                                enemy.score = data.scores.host|0;
                                player.score = data.scores.joiner|0;
                            }
                            bullets = []; explosions = []; infestedChunks = [];
                        } else {
                            // host already applied locally in update()
                        }
                        updateCardsUI();
                        // Close any lingering card UI
                        const div = document.getElementById('card-choices');
                        if (div) { div.style.display='none'; div.innerHTML=''; div.classList.remove('card-bg-visible'); }
                        cardState.active = false; waitingForCard = false;
                    } catch (e) {}
                } else if (data && data.type === 'card-offer') {
                    waitingForCard = true;
                    setTimeout(() => netShowPowerupCards(data.choices||[], data.chooserRole), 200);
                } else if (data && data.type === 'mod-offer') {
                    waitingForCard = true;
                    setTimeout(() => netShowWorldModifierCards(data.choices||[], data.chooserRole), 200);
                } else if (data && data.type === 'card-pick') {
                    // Only host should authoritatively apply then broadcast
                    if (NET.role === 'host') {
                        const target = getEntityForRole(data.pickerRole);
                        const card = getCardByName(data.card);
                        if (target && card) {
                            try { card.effect(target); target.addCard(card.name); } catch (e) {}
                            // Broadcast applied so both sides finalize and close UIs
                            try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'card-apply', pickerRole: data.pickerRole, card: card.name } })); } catch (e) {}
                        }
                    }
                } else if (data && data.type === 'card-apply') {
                    // Apply on non-host clients (host already applied during pick)
                    if (NET.role !== 'host') {
                        const target = getEntityForRole(data.pickerRole);
                        const card = getCardByName(data.card);
                        if (target && card) {
                            try { card.effect(target); target.addCard(card.name); } catch (e) {}
                        }
                    }
                    const div = document.getElementById('card-choices');
                    if (div) { div.style.display='none'; div.innerHTML=''; div.classList.remove('card-bg-visible'); }
                    cardState.active = false; waitingForCard = false;
                } else if (data && data.type === 'mod-pick') {
                    // Only host should authoritatively apply then broadcast
                    if (NET.role === 'host') {
                        const name = data.name;
                        applyWorldModifierByName(name);
                        try { if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify({ type:'relay', data:{ type:'mod-apply', name } })); } catch (e) {}
                    }
                } else if (data && data.type === 'mod-apply') {
                    // Apply on non-host clients (host already applied)
                    if (NET.role !== 'host') applyWorldModifierByName(data.name);
                    const div = document.getElementById('card-choices');
                    if (div) { div.style.display='none'; div.innerHTML=''; div.classList.remove('card-bg-visible'); }
                    cardState.active = false; waitingForCard = false;
                } else {
                    // fallback to previous handler if any simple sync message comes through
                    handleGameMessage(data);
                }
            }
        };
    }

    // Patch after each connect
    let oldConnectWebSocket = null;
    if (typeof connectWebSocket === 'function') oldConnectWebSocket = connectWebSocket;
    // Helper to normalize user input: allow full invite URLs or plain codes
    function normalizeJoinCode(input) {
        if (!input) return '';
        const trimmed = input.trim();
        try {
            // If it's a URL, parse the ?join param
            const url = new URL(trimmed);
            const fromParam = url.searchParams.get('join');
            if (fromParam) return fromParam.trim().toUpperCase();
        } catch (e) { /* not a URL */ }
        // Otherwise just strip non-alphanumerics and uppercase
        return trimmed.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    }

    connectWebSocket = function(role, code) {
        if (oldConnectWebSocket) oldConnectWebSocket(role, code);
        else {
            if (window.ws && window.ws.readyState === WebSocket.OPEN) window.ws.close();
            window.wsRole = role;
            window.wsSession = normalizeJoinCode(code);
            try {
                window.ws = new WebSocket(window.MULTIPLAYER_WS_URL);
            } catch (e) {
                alert('Could not open WebSocket: ' + e.message);
                return;
            }
            window.ws.onopen = function() {
                if (role === 'host') {
                    window.ws.send(JSON.stringify({ type: 'host', code: window.wsSession }));
                } else if (role === 'joiner') {
                    window.ws.send(JSON.stringify({ type: 'join', code: window.wsSession }));
                }
                // Set NET role and mark connected; enforce consistent colors (host=blue, joiner=red)
                NET.setRole(role);
                NET.setConnected(true);
                if (role === 'host') {
                    if (player) player.color = '#65c6ff';
                    if (enemy) enemy.color = '#ff5a5a';
                } else {
                    if (player) player.color = '#ff5a5a';
                    if (enemy) enemy.color = '#65c6ff';
                }
            };
            patchWsOnMessage();
            window.ws.onclose = function() {
                // only show error if we were trying to connect/join
                if (mpJoinSection && mpJoinSection.style.display !== 'none') {
                    alert('Disconnected from server. Please verify the host is running and reachable.');
                }
                NET.setConnected(false);
            };
            window.ws.onerror = function() {
                if (mpJoinSection && mpJoinSection.style.display !== 'none') {
                    alert('WebSocket error. Is the server URL correct? ' + window.MULTIPLAYER_WS_URL);
                }
                NET.setConnected(false);
            };
        }
        setTimeout(patchWsOnMessage, 200);
    };
    const overlay = document.getElementById('setup-overlay');
    const densitySlider = document.getElementById('obstacle-density');
    const densityValue = document.getElementById('density-value');
    const sizeSlider = document.getElementById('obstacle-size');
    const sizeValue = document.getElementById('size-value');
    const dynamicCheckbox = document.getElementById('dynamic-mode');
    const dynamicRateRow = document.getElementById('dynamic-rate-row');
    const dynamicRateSlider = document.getElementById('dynamic-rate');
    const dynamicRateValue = document.getElementById('dynamic-rate-value');
    const mapBorderCheckbox = document.getElementById('map-border');
    const worldModifierSlider = document.getElementById('world-modifier-interval');
    const worldModifierValue = document.getElementById('world-modifier-value');
    
    densitySlider.oninput = () => { densityValue.textContent = densitySlider.value; };
    sizeSlider.oninput = () => { sizeValue.textContent = sizeSlider.value; };
    dynamicCheckbox.onchange = () => {
        dynamicRateRow.style.display = dynamicCheckbox.checked ? 'flex' : 'none';
    };
    dynamicRateSlider.oninput = () => {
        dynamicRateValue.textContent = parseFloat(dynamicRateSlider.value).toFixed(2);
    };
    worldModifierSlider.oninput = () => {
        worldModifierValue.textContent = worldModifierSlider.value;
    };
    document.getElementById('start-btn').onclick = () => {
        OBSTACLE_COUNT = parseInt(densitySlider.value);
        let size = parseInt(sizeSlider.value);
        OBSTACLE_MIN_SIZE = Math.round(size * 0.6);
        OBSTACLE_MAX_SIZE = size;
        DYNAMIC_MODE = !!dynamicCheckbox.checked;
        DYNAMIC_RATE = parseFloat(dynamicRateSlider.value);
        MAP_BORDER = !!mapBorderCheckbox.checked;
        worldModifierRoundInterval = parseInt(worldModifierSlider.value);
        // Read enemy count selection (0-3)
        const enemySelect = document.getElementById('enemy-count');
        if (enemySelect) {
            enemyCount = parseInt(enemySelect.value) || 0;
            enemyDisabled = (enemyCount <= 0);
        } else {
            enemyCount = 1;
            enemyDisabled = false;
        }
        overlay.style.display = "none";
        // If a saved map is selected, load it into obstacles before starting
        const sel = document.getElementById('saved-maps');
        if (sel && sel.value) {
            if (sel.value === '__RANDOM__') {
                const key = pickRandomSavedMapKey();
                if (key) loadSavedMapByKey(key);
                else generateObstacles();
            } else {
                // load the selected key
                loadSavedMapByKey(sel.value);
            }
        } else if (NET.role === 'host' && NET.connected) {
            // Deterministically generate on host only, then broadcast to joiner
            generateObstacles();
        }
        // If host, broadcast round-start with obstacles and flags
        if (NET.role === 'host' && NET.connected && window.ws && window.ws.readyState === WebSocket.OPEN) {
            const msg = {
                type: 'round-start',
                obstacles: serializeObstacles(),
                dynamic: DYNAMIC_MODE,
                dynamicRate: DYNAMIC_RATE,
                mapBorder: MAP_BORDER,
                worldModInterval: worldModifierRoundInterval
            };
            window.ws.send(JSON.stringify({ type: 'relay', data: msg }));
        }
        startGame();
    };

    // Multiplayer UI wiring
    const hostBtn = document.getElementById('host-btn');
    const joinBtn = document.getElementById('join-btn');
    const mpModal = document.getElementById('multiplayer-modal');
    const mpHostSection = document.getElementById('mp-host-section');
    const mpJoinSection = document.getElementById('mp-join-section');
    const mpCancel = document.getElementById('mp-cancel');
    const mpSessionCode = document.getElementById('mp-session-code');
    const mpCopyLink = document.getElementById('mp-copy-link');
    const mpJoinCode = document.getElementById('mp-join-code');
    const mpJoinConfirm = document.getElementById('mp-join-confirm');

    function hideMpModal() {
        if (mpModal) mpModal.style.display = 'none';
        if (mpHostSection) mpHostSection.style.display = 'none';
        if (mpJoinSection) mpJoinSection.style.display = 'none';
    }

    if (hostBtn) hostBtn.onclick = () => {
        if (mpModal && mpHostSection) {
            mpModal.style.display = 'flex';
            mpHostSection.style.display = 'flex';
            mpJoinSection.style.display = 'none';
            // Generate a session code (simple random 6-char alphanumeric)
            const code = Math.random().toString(36).substr(2, 6).toUpperCase();
            if (mpSessionCode) mpSessionCode.value = code;
            connectWebSocket('host', code);
        }
    };
    if (joinBtn) joinBtn.onclick = () => {
        if (mpModal && mpJoinSection) {
            mpModal.style.display = 'flex';
            mpHostSection.style.display = 'none';
            mpJoinSection.style.display = 'flex';
            if (mpJoinCode) {
                mpJoinCode.value = '';
                setTimeout(() => mpJoinCode.focus(), 100);
            }
        }
    };
    // Allow pressing Enter in join code input
    if (mpJoinCode) {
        mpJoinCode.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                if (mpJoinCode.value) {
                    connectWebSocket('joiner', mpJoinCode.value.trim().toUpperCase());
                }
            }
        });
    }
    // Auto-join if ?join=CODE in URL
    const urlParams = new URLSearchParams(window.location.search);
    const joinCodeFromUrl = urlParams.get('join');
    if (joinCodeFromUrl) {
        if (mpModal && mpJoinSection) {
            mpModal.style.display = 'flex';
            mpHostSection.style.display = 'none';
            mpJoinSection.style.display = 'flex';
            if (mpJoinCode) {
                mpJoinCode.value = joinCodeFromUrl.trim().toUpperCase();
                setTimeout(() => mpJoinCode.focus(), 100);
            }
        }
    }
    if (mpCancel) mpCancel.onclick = hideMpModal;
    // Escape key closes modal
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && mpModal && mpModal.style.display !== 'none') {
            hideMpModal();
        }
    });
    // Copy link button
    if (mpCopyLink) mpCopyLink.onclick = function() {
        if (mpSessionCode) {
            const url = window.location.origin + window.location.pathname + '?join=' + mpSessionCode.value;
            navigator.clipboard.writeText(url);
            mpCopyLink.innerText = 'Copied!';
            setTimeout(() => { mpCopyLink.innerText = 'Copy Link'; }, 1200);
        }
    };
    // Join confirm button (placeholder, to be wired to WebSocket logic)
    if (mpJoinConfirm) mpJoinConfirm.onclick = function() {
        if (mpJoinCode && mpJoinCode.value) {
            connectWebSocket('joiner', mpJoinCode.value);
        }
    };

    // Host broadcasts setup changes (sliders/toggles) to joiner
    function broadcastSetup() {
        if (NET.role !== 'host' || !window.ws || window.ws.readyState !== WebSocket.OPEN) return;
        const setup = {
            type: 'setup',
            data: {
                density: parseInt(densitySlider.value),
                size: parseInt(sizeSlider.value),
                dynamic: !!dynamicCheckbox.checked,
                dynamicRate: parseFloat(dynamicRateSlider.value),
                mapBorder: !!mapBorderCheckbox.checked,
                worldModInterval: parseInt(worldModifierSlider.value)
            }
        };
        window.ws.send(JSON.stringify({ type: 'relay', data: setup }));
    }
    [densitySlider,sizeSlider,dynamicCheckbox,dynamicRateSlider,mapBorderCheckbox,worldModifierSlider].forEach(el => {
        if (el) el.addEventListener('input', () => broadcastSetup());
        if (el) el.addEventListener('change', () => broadcastSetup());
    });

    // Apply incoming setup and preview UI for the joiner
    function applyIncomingSetup(s) {
        try {
            densitySlider.value = s.density; densityValue.textContent = densitySlider.value;
            sizeSlider.value = s.size; sizeValue.textContent = sizeSlider.value;
            dynamicCheckbox.checked = !!s.dynamic; dynamicRateRow.style.display = s.dynamic ? 'flex' : 'none';
            dynamicRateSlider.value = s.dynamicRate.toFixed(2); dynamicRateValue.textContent = parseFloat(dynamicRateSlider.value).toFixed(2);
            mapBorderCheckbox.checked = !!s.mapBorder;
            worldModifierSlider.value = s.worldModInterval; worldModifierValue.textContent = worldModifierSlider.value;
        } catch (e) {}
    }
}

function showSetupOverlay() {
    document.getElementById('setup-overlay').style.display = "flex";
    stopGame();
}

// --- Input ---
window.addEventListener('mousemove', e => {
    if(!canvas) return;
    let rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
});
window.addEventListener('keydown', e => {
    // Ignore game keybinds if typing in dev console input
    const devInput = document.getElementById('dev-console-input');
    if (document.activeElement === devInput) return;
    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ' || e.code === 'Space') {
        if (!player.shootQueued) player.shootQueued = true;
    }
});
window.addEventListener('keyup', e => {
    // Ignore game keybinds if typing in dev console input
    const devInput = document.getElementById('dev-console-input');
    if (document.activeElement === devInput) return;
    keys[e.key.toLowerCase()] = false;
    if (e.key.toLowerCase() === 'r') {
        restartGame();
    }
});

// --- Game Start/Restart ---
function startGame() {
    bullets = [];
    explosions = [];
    // Reset world modifier states
    infestationActive = false;
    infestationTimer = 0;
    infestedChunks = [];
    spontaneousActive = false;
    spontaneousTimer = 0;
    dynamicModifierActive = false;
    roundsSinceLastModifier = 0;
    activeWorldModifiers = [];
    usedWorldModifiers = {};
    // If obstacles were pre-populated (for example, from the Map Editor), keep them.
    // Otherwise generate procedural obstacles as before.
    if (!obstacles || obstacles.length === 0) {
        generateObstacles();
    } else {
        // Ensure loaded obstacles are marked as active and chunks initialized correctly
        for (let o of obstacles) {
            if (!o) continue;
            o.destroyed = o.destroyed || false;
            if (Array.isArray(o.chunks)) {
                for (const c of o.chunks) {
                    c.destroyed = c.destroyed || false;
                    c.flying = c.flying || false;
                    c.alpha = (typeof c.alpha === 'number') ? c.alpha : 1;
                    c.hp = (typeof c.hp === 'number') ? c.hp : 1.0;
                }
            }
        }
    }
    positionPlayersSafely();
    // Ensure enemy existence and disabled flag according to selection
    if (!enemy) enemy = new Player(false, "#ff5a5a", CANVAS_W*0.66, CANVAS_H/2);
    enemyDisabled = (enemyCount <= 0);
    lastTimestamp = 0;
    cardState = { active: false, player: null, callback: null };
    waitingForCard = false;
    running = true;
    cancelAnimationFrame(animFrameId);
    animFrameId = requestAnimationFrame(gameLoop);
    updateCardsUI();
}

function stopGame() {
    running = false;
    cancelAnimationFrame(animFrameId);
}

// --- Init ---
canvas = document.getElementById('game');
ctx = canvas.getContext('2d');
setupOverlayInit();
document.getElementById('card-choices').style.display = 'none';
updateCardsUI();

// --- Options modal wiring ---
function saveVolumesToStorage() {
    try {
        localStorage.setItem('shape_shot_volumes', JSON.stringify({ master: masterVolume, music: musicVolume, sfx: sfxVolume, shot: shotVolume, explosion: explosionVolume, ricochet: ricochetVolume, hit: hitVolume, dash: dashVolume }));
    } catch (e) {}
}

function applyVolumeSlidersToUI() {
    const m = document.getElementById('master-vol');
    const mu = document.getElementById('music-vol');
    const s = document.getElementById('sfx-vol');
    const mv = document.getElementById('master-vol-val');
    const muv = document.getElementById('music-vol-val');
    const sv = document.getElementById('sfx-vol-val');
    if (m) { m.value = Math.round(masterVolume * 100); if (mv) mv.innerText = m.value; }
    if (mu) { mu.value = Math.round(musicVolume * 100); if (muv) muv.innerText = mu.value; }
    if (s) { s.value = Math.round(sfxVolume * 100); if (sv) sv.innerText = s.value; }
    // per-effect
    const sh = document.getElementById('shot-vol');
    const shv = document.getElementById('shot-vol-val');
    const ex = document.getElementById('explosion-vol');
    const exv = document.getElementById('explosion-vol-val');
    const ric = document.getElementById('ricochet-vol');
    const ricv = document.getElementById('ricochet-vol-val');
    const hi = document.getElementById('hit-vol');
    const hiv = document.getElementById('hit-vol-val');
    const da = document.getElementById('dash-vol');
    const dav = document.getElementById('dash-vol-val');
    if (sh) { sh.value = Math.round(shotVolume * 100); if (shv) shv.innerText = sh.value; }
    if (ex) { ex.value = Math.round(explosionVolume * 100); if (exv) exv.innerText = ex.value; }
    if (ric) { ric.value = Math.round(ricochetVolume * 100); if (ricv) ricv.innerText = ric.value; }
    if (hi) { hi.value = Math.round(hitVolume * 100); if (hiv) hiv.innerText = hi.value; }
    if (da) { da.value = Math.round(dashVolume * 100); if (dav) dav.innerText = da.value; }
}

document.addEventListener('DOMContentLoaded', function() {
    const openBtn = document.getElementById('open-options-btn');
    const optionsModal = document.getElementById('options-overlay');
    const backBtn = document.getElementById('options-back-btn');
    const masterSlider = document.getElementById('master-vol');
    const musicSlider = document.getElementById('music-vol');
    const sfxSlider = document.getElementById('sfx-vol');
    const masterVal = document.getElementById('master-vol-val');
    const musicVal = document.getElementById('music-vol-val');
    const sfxVal = document.getElementById('sfx-vol-val');

    if (openBtn && optionsModal) {
        openBtn.addEventListener('click', function() {
            // show options modal and hide setup overlay
            const setup = document.getElementById('setup-overlay');
            if (setup) setup.style.display = 'none';
            optionsModal.style.display = 'block';
            applyVolumeSlidersToUI();
        });
    }
    if (backBtn && optionsModal) {
        backBtn.addEventListener('click', function() {
            optionsModal.style.display = 'none';
            const setup = document.getElementById('setup-overlay');
            if (setup) setup.style.display = 'flex';
            saveVolumesToStorage();
        });
    }

    function updateMaster(val) { masterVolume = val / 100; if (masterVal) masterVal.innerText = Math.round(val); }
    function updateMusic(val) { musicVolume = val / 100; if (musicVal) musicVal.innerText = Math.round(val); }
    function updateSfx(val) { sfxVolume = val / 100; if (sfxVal) sfxVal.innerText = Math.round(val); }
    function updateShot(val) { shotVolume = val / 100; const el = document.getElementById('shot-vol-val'); if (el) el.innerText = Math.round(val); }
    function updateExplosion(val) { explosionVolume = val / 100; const el = document.getElementById('explosion-vol-val'); if (el) el.innerText = Math.round(val); }
    function updateRicochet(val) { ricochetVolume = val / 100; const el = document.getElementById('ricochet-vol-val'); if (el) el.innerText = Math.round(val); }
    function updateHit(val) { hitVolume = val / 100; const el = document.getElementById('hit-vol-val'); if (el) el.innerText = Math.round(val); }
    function updateDash(val) { dashVolume = val / 100; const el = document.getElementById('dash-vol-val'); if (el) el.innerText = Math.round(val); }

    if (masterSlider) masterSlider.addEventListener('input', e => updateMaster(e.target.value));
    if (musicSlider) musicSlider.addEventListener('input', e => updateMusic(e.target.value));
    if (sfxSlider) sfxSlider.addEventListener('input', e => updateSfx(e.target.value));
    // per-effect
    const shotSlider = document.getElementById('shot-vol');
    const explosionSlider = document.getElementById('explosion-vol');
    const ricochetSlider = document.getElementById('ricochet-vol');
    const hitSlider = document.getElementById('hit-vol');
    if (shotSlider) shotSlider.addEventListener('input', e => updateShot(e.target.value));
    if (explosionSlider) explosionSlider.addEventListener('input', e => updateExplosion(e.target.value));
    if (ricochetSlider) ricochetSlider.addEventListener('input', e => updateRicochet(e.target.value));
    if (hitSlider) hitSlider.addEventListener('input', e => updateHit(e.target.value));
    const dashSlider = document.getElementById('dash-vol');
    if (dashSlider) dashSlider.addEventListener('input', e => updateDash(e.target.value));

    // initialize displayed slider values
    applyVolumeSlidersToUI();

    // Wire preview buttons for SFX (subtle small buttons next to sliders)
    try {
        const btnShot = document.getElementById('preview-shot');
        const btnExpl = document.getElementById('preview-explosion');
        const btnRic = document.getElementById('preview-ricochet');
        const btnHit = document.getElementById('preview-hit');
        const btnDash = document.getElementById('preview-dash');
        if (btnShot) btnShot.addEventListener('click', (e) => { e.stopPropagation(); try { playGunShot(); } catch (ex) {} });
        if (btnExpl) btnExpl.addEventListener('click', (e) => { e.stopPropagation(); try { playExplosion(); } catch (ex) {} });
        if (btnRic) btnRic.addEventListener('click', (e) => { e.stopPropagation(); try { playRicochet(); } catch (ex) {} });
        if (btnHit) btnHit.addEventListener('click', (e) => { e.stopPropagation(); try { playHit(); } catch (ex) {} });
        if (btnDash) btnDash.addEventListener('click', (e) => { e.stopPropagation(); try { playDashWoosh(0.28, 1.0); } catch (ex) {} });
    } catch (e) { /* ignore if elements missing */ }

    // Inject subtle CSS for preview buttons to keep them visually light
    try {
        const style = document.createElement('style');
        style.innerText = `.sfx-preview{ background:#123033; color:#7fe0d6; border:1px solid #0e2a2b; border-radius:6px; font-size:12px; padding:2px 6px; cursor:pointer; box-shadow:0 1px 0 #0007; } .sfx-preview:hover{ background:#165a57; }`;
        document.head.appendChild(style);
    } catch (e) {}
});

// --- Map Editor Support ---
function mapEditorInit() {
    const modal = document.getElementById('map-editor-modal');
    const openBtn = document.getElementById('open-map-editor');
    const canvasEl = document.getElementById('map-editor-canvas');
    const ctxEl = canvasEl.getContext('2d');
    const sizeRange = document.getElementById('editor-size');
    const sizeVal = document.getElementById('editor-size-val');
    const placeBtn = document.getElementById('editor-place');
    const eraseBtn = document.getElementById('editor-erase');
    const saveBtn = document.getElementById('editor-save');
    const clearBtn = document.getElementById('editor-clear');
    const closeBtn = document.getElementById('editor-close');
    const nameInput = document.getElementById('editor-map-name');
    const savedSelect = document.getElementById('saved-maps');
    const gridSnapCheckbox = document.getElementById('editor-grid-snap');

    let mode = 'place';
    let editorSquares = []; // {x,y,w,h}
    let gridSnap = !!(gridSnapCheckbox && gridSnapCheckbox.checked);
    let preview = null; // {x,y,w,h}

    function drawEditor() {
        ctxEl.clearRect(0,0,canvasEl.width, canvasEl.height);
        // background grid
        ctxEl.fillStyle = '#2a2f36';
        ctxEl.fillRect(0,0,canvasEl.width, canvasEl.height);
        ctxEl.strokeStyle = '#374047'; ctxEl.lineWidth = 1;
        for (let x=0;x<canvasEl.width;x+=20) { ctxEl.beginPath(); ctxEl.moveTo(x,0); ctxEl.lineTo(x,canvasEl.height); ctxEl.stroke(); }
        for (let y=0;y<canvasEl.height;y+=20) { ctxEl.beginPath(); ctxEl.moveTo(0,y); ctxEl.lineTo(canvasEl.width,y); ctxEl.stroke(); }
        // draw squares
        ctxEl.fillStyle = '#3d4351';
        for (let s of editorSquares) {
            ctxEl.globalAlpha = 1;
            ctxEl.fillRect(s.x, s.y, s.w, s.h);
            // chunk grid overlay
            ctxEl.strokeStyle = '#2f343b';
            ctxEl.strokeRect(s.x, s.y, s.w, s.h);
        }
        // draw preview silhouette (snapping guide)
        if (preview) {
            ctxEl.save();
            ctxEl.globalAlpha = 0.48;
            ctxEl.fillStyle = '#65c6ff';
            ctxEl.fillRect(preview.x, preview.y, preview.w, preview.h);
            ctxEl.globalAlpha = 0.18;
            ctxEl.strokeStyle = '#ffffff';
            ctxEl.strokeRect(preview.x, preview.y, preview.w, preview.h);
            ctxEl.restore();
        }
        ctxEl.globalAlpha = 1;
    }

    function toEditorCoords(evt) {
        const rect = canvasEl.getBoundingClientRect();
        const x = (evt.clientX - rect.left) * (canvasEl.width/rect.width);
        const y = (evt.clientY - rect.top) * (canvasEl.height/rect.height);
        return {x,y};
    }

    canvasEl.addEventListener('click', (e) => {
        const p = toEditorCoords(e);
        const s = parseInt(sizeRange.value,10);
        let x = Math.round(p.x - s/2), y = Math.round(p.y - s/2);
        if (gridSnap) {
            // snap to 20px editor grid
            x = Math.round(x / 20) * 20;
            y = Math.round(y / 20) * 20;
        }
        if (mode === 'place') {
            editorSquares.push({x, y, w: s, h: s});
        } else {
            // erase if click inside
            for (let i = editorSquares.length-1; i >= 0; --i) {
                const sq = editorSquares[i];
                if (p.x >= sq.x && p.x <= sq.x + sq.w && p.y >= sq.y && p.y <= sq.y + sq.h) {
                    editorSquares.splice(i,1);
                    break;
                }
            }
        }
        drawEditor();
    });

    // Update preview position on mouse move for placement silhouette
    canvasEl.addEventListener('mousemove', (e) => {
        const p = toEditorCoords(e);
        const s = parseInt(sizeRange.value,10);
        let x = Math.round(p.x - s/2), y = Math.round(p.y - s/2);
        if (gridSnap) {
            x = Math.round(x / 20) * 20;
            y = Math.round(y / 20) * 20;
        }
        preview = { x, y, w: s, h: s };
        drawEditor();
    });

    // Toggle grid snap when checkbox changes
    if (gridSnapCheckbox) {
        gridSnapCheckbox.addEventListener('change', () => {
            gridSnap = !!gridSnapCheckbox.checked;
        });
    }

    sizeRange.addEventListener('input', () => { sizeVal.textContent = sizeRange.value; });
    placeBtn.addEventListener('click', () => { mode='place'; placeBtn.disabled=true; eraseBtn.disabled=false; });
    eraseBtn.addEventListener('click', () => { mode='erase'; placeBtn.disabled=false; eraseBtn.disabled=true; });
    clearBtn.addEventListener('click', () => { editorSquares = []; drawEditor(); });
    closeBtn.addEventListener('click', () => { modal.style.display='none'; });

    function saveMap() {
        const nm = (nameInput.value || 'map-' + Date.now()).trim();
        const stored = JSON.parse(localStorage.getItem('shape_shot_maps' ) || '{}');
        stored[nm] = { squares: editorSquares, width: canvasEl.width, height: canvasEl.height };
        localStorage.setItem('shape_shot_maps', JSON.stringify(stored));
        populateSavedMaps();
        alert('Map saved: ' + nm);
    }
    saveBtn.addEventListener('click', saveMap);

    function populateSavedMaps() {
        const stored = JSON.parse(localStorage.getItem('shape_shot_maps' ) || '{}');
        const sel = document.getElementById('saved-maps');
        if (!sel) return;
        // Add a Random option that will pick a saved map each round
        let keys = Object.keys(stored || {});
        let options = ['<option value="">(none)</option>'];
        if (keys.length > 0) options.push('<option value="__RANDOM__">Random</option>');
        options = options.concat(keys.map(k => `<option value="${k}">${k}</option>`));
        sel.innerHTML = options.join('');
    }
    populateSavedMaps();

    openBtn.addEventListener('click', () => {
        const stored = JSON.parse(localStorage.getItem('shape_shot_maps' ) || '{}');
        // load first map into editor if available
        modal.style.display = 'flex';
        editorSquares = [];
        drawEditor();
    });

    // When a saved map is selected in setup overlay, load it later on startGame
    window.getSelectedSavedMap = function() {
        const sel = document.getElementById('saved-maps');
        if (!sel) return null;
        const key = sel.value;
        if (!key) return null;
        const stored = JSON.parse(localStorage.getItem('shape_shot_maps' ) || '{}');
        // If Random option selected, caller should detect it by checking the select value
        return stored[key] || null;
    };
}

mapEditorInit();

// Helper: load a saved map by its storage key into obstacles (scales to game canvas)
function loadSavedMapByKey(key) {
    const stored = JSON.parse(localStorage.getItem('shape_shot_maps' ) || '{}');
    if (!stored[key]) return false;
    const selectedMap = stored[key];
    obstacles = [];
    const editorW = selectedMap.width || 780;
    const editorH = selectedMap.height || 420;
    const scaleX = CANVAS_W / editorW;
    const scaleY = CANVAS_H / editorH;
    for (const s of selectedMap.squares || []) {
        const x = s.x * scaleX;
        const y = s.y * scaleY;
        const w = s.w * scaleX;
        const h = s.h * scaleY;
        obstacles.push(new Obstacle(x, y, w, h));
    }
    OBSTACLE_COUNT = Math.max(obstacles.length, OBSTACLE_COUNT);
    return true;
}

// Helper: pick a random saved map key (or null)
function pickRandomSavedMapKey() {
    const stored = JSON.parse(localStorage.getItem('shape_shot_maps' ) || '{}');
    const keys = Object.keys(stored || {});
    if (!keys || keys.length === 0) return null;
    return keys[Math.floor(Math.random() * keys.length)];
}

// Delete saved map handler (setup UI delete button)
const deleteSavedBtn = document.getElementById('delete-saved-map');
if (deleteSavedBtn) {
    deleteSavedBtn.addEventListener('click', () => {
        const sel = document.getElementById('saved-maps');
        if (!sel) return alert('No saved maps selector found.');
        const key = sel.value;
        if (!key) return alert('No map selected to delete.');
        if (!confirm('Delete saved map: ' + key + '? This cannot be undone.')) return;
        const stored = JSON.parse(localStorage.getItem('shape_shot_maps') || '{}');
        if (stored[key]) {
            delete stored[key];
            localStorage.setItem('shape_shot_maps', JSON.stringify(stored));
            // Try to remove the option immediately from the select for instant UI feedback
            const selEl = document.getElementById('saved-maps');
            if (selEl) {
                for (let i = selEl.options.length - 1; i >= 0; --i) {
                    if (selEl.options[i].value === key) {
                        selEl.remove(i);
                    }
                }
                // Reset selection to none
                selEl.value = '';
                try { selEl.dispatchEvent(new Event('change')); } catch (e) {}
            }
            // Ensure populateSavedMaps keeps things consistent
            try { populateSavedMaps(); } catch (e) {}
            alert('Deleted map: ' + key);
        } else {
            alert('Map not found: ' + key);
        }
    });
}



// --- Dev Console (fixed, always visible, global references) ---
const devLog = document.getElementById('dev-console-log');
const devInput = document.getElementById('dev-console-input');
const devForm = document.getElementById('dev-console-form');

// Toggle visibility helper: add/remove a hidden class on the fixed console
const devConsoleFixed = document.getElementById('dev-console-fixed');
if (devConsoleFixed) {
    // ensure the class exists in style (minimal inline fallback)
    if (!document.getElementById('dev-console-hidden-style')) {
        const s = document.createElement('style');
        s.id = 'dev-console-hidden-style';
        s.innerText = '#dev-console-fixed.hidden { display: none !important; }';
        document.head.appendChild(s);
    }
    // Start hidden by default
    if (!devConsoleFixed.classList.contains('hidden')) devConsoleFixed.classList.add('hidden');
}

// Key handler: toggle console with '/' unless the input is focused
window.addEventListener('keydown', (e) => {
    // Ignore when modifier keys are used (so Ctrl+/ etc don't conflict)
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    // Always allow Escape to close the console even if the input is focused
    if (e.key === 'Escape' || e.key === 'Esc') {
        if (devConsoleFixed && !devConsoleFixed.classList.contains('hidden')) {
            devConsoleFixed.classList.add('hidden');
            try { if (devInput && document.activeElement === devInput) devInput.blur(); } catch (ex) {}
            e.preventDefault();
            e.stopPropagation();
            return;
        }
    }
    // If the dev input exists and is focused, do nothing for other keys
    if (devInput && document.activeElement === devInput) return;
    // Check for '/' key (both main slash and numpad)
    if (e.key === '/' || e.key === 'Slash') {
        if (!devConsoleFixed) return;
        // Prevent the key from doing other actions in the game
        e.preventDefault();
        e.stopPropagation();
        devConsoleFixed.classList.toggle('hidden');
        // If showing the console, focus the input
        if (!devConsoleFixed.classList.contains('hidden')) {
            if (devInput) devInput.focus();
        }
    }
    // Close console on Escape key from anywhere
    if (e.key === 'Escape' || e.key === 'Esc') {
        if (!devConsoleFixed) return;
        if (!devConsoleFixed.classList.contains('hidden')) {
            devConsoleFixed.classList.add('hidden');
            // if the input had focus, blur it so game keys resume
            try { if (devInput && document.activeElement === devInput) devInput.blur(); } catch (ex) {}
        }
    }
});
let devLogLines = [];
function logDev(msg) {
    const time = new Date().toLocaleTimeString();
    devLogLines.push(`[${time}] ${msg}`);
    if (devLogLines.length > 200) devLogLines.shift();
    devLog.innerText = devLogLines.join('\n');
    devLog.scrollTop = devLog.scrollHeight;
}
devForm.addEventListener('submit', function(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const val = devInput.value.trim();
    if (!val) return false;
    logDev('> ' + val);
    if (val.startsWith('//')) {
        let cmd = val.slice(2).trim();
        // Special commands handled by the dev console
        if (cmd.toLowerCase() === 'cards') {
            for (const c of POWERUPS) logDev('//' + c.name);
            devInput.value = '';
            return false;
        }
        if (cmd.toLowerCase() === 'mods') {
            for (const m of WORLD_MODIFIERS) logDev('//' + m.name);
            devInput.value = '';
            return false;
        }
        if (cmd.toLowerCase() === 'ref' || cmd.toLowerCase() === 'refresh') {
            bullets = [];
            explosions = [];
            generateObstacles();
            positionPlayersSafely();
            waitingForCard = false;
            logDev('Map refreshed (obstacles regenerated, players repositioned).');
            devInput.value = '';
            return false;
        }
        let count = 1;
        let name = cmd;
        if (cmd.includes('/x')) {
            let parts = cmd.split('/x');
            name = parts[0].trim();
            let n = parseInt(parts[1], 10);
            if (!isNaN(n) && n > 0) count = n;
        }
        // Try world modifier first
        let mod = WORLD_MODIFIERS.find(m => m.name.toLowerCase() === name.toLowerCase());
        if (mod) {
            if (typeof mod.effect === 'function') {
                mod.effect();
                usedWorldModifiers[mod.name] = !usedWorldModifiers[mod.name]; // toggle for testing
                if (usedWorldModifiers[mod.name]) {
                    if (!activeWorldModifiers.includes(mod.name)) activeWorldModifiers.push(mod.name);
                    logDev(`World modifier "${mod.name}" enabled.`);
                } else {
                    activeWorldModifiers = activeWorldModifiers.filter(n => n !== mod.name);
                    logDev(`World modifier "${mod.name}" disabled.`);
                }
            } else {
                logDev(`World modifier "${mod.name}" has no effect function.`);
            }
            devInput.value = '';
            return false;
        }
        // Then try powerup card
        let card = getCardByName(name);
        if (card) {
            if (typeof player !== 'undefined' && player && typeof player.addCard === 'function' && typeof card.effect === 'function') {
                for (let i = 0; i < count; ++i) {
                    player.addCard(card.name);
                    card.effect(player);
                }
                if (typeof updateCardsUI === 'function') updateCardsUI();
                logDev(`Granted ${count}x "${card.name}" to player.`);
            } else {
                try {
                    logDev('DIAG: player=' + (typeof player) + ', playerTruthy=' + (!!player) + ', addCard=' + (player && typeof player.addCard) + ', updateCardsUI=' + (typeof updateCardsUI) + ', cardEffect=' + (typeof card.effect));
                } catch (ex) {
                    logDev('DIAG: error reading diagnostic info: ' + ex.message);
                }
                logDev('Player or updateCardsUI not ready. Try after game starts.');
            }
            devInput.value = '';
            return false;
        }
        logDev(`Card or world modifier not found: "${name}"`);
    } else {
        logDev('Unknown command.');
    }
    devInput.value = '';
    return false;
});
// Initial log message
logDev('Dev console ready. //cards //mods //ref');

// Also handle Enter directly on the input to be extra-reliable
devInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const val = devInput.value.trim();
        if (!val) return;
        logDev('> ' + val);
        if (val.startsWith('//')) {
            let cmd = val.slice(2).trim();
            if (cmd.toLowerCase() === 'cards') {
                for (const c of POWERUPS) logDev('//' + c.name);
                devInput.value = '';
                return;
            }
            if (cmd.toLowerCase() === 'mods') {
                for (const m of WORLD_MODIFIERS) logDev('//' + m.name);
                devInput.value = '';
                return;
            }
            if (cmd.toLowerCase() === 'ref' || cmd.toLowerCase() === 'refresh') {
                bullets = [];
                explosions = [];
                generateObstacles();
                positionPlayersSafely();
                waitingForCard = false;
                logDev('Map refreshed (obstacles regenerated, players repositioned).');
                devInput.value = '';
                return;
            }
            let count = 1;
            let name = cmd;
            if (cmd.includes('/x')) {
                let parts = cmd.split('/x');
                name = parts[0].trim();
                let n = parseInt(parts[1], 10);
                if (!isNaN(n) && n > 0) count = n;
            }
            // Try world modifier first
            let mod = WORLD_MODIFIERS.find(m => m.name.toLowerCase() === name.toLowerCase());
            if (mod) {
                if (typeof mod.effect === 'function') {
                    mod.effect();
                    usedWorldModifiers[mod.name] = !usedWorldModifiers[mod.name];
                    if (usedWorldModifiers[mod.name]) {
                        if (!activeWorldModifiers.includes(mod.name)) activeWorldModifiers.push(mod.name);
                        logDev(`World modifier "${mod.name}" enabled.`);
                    } else {
                        activeWorldModifiers = activeWorldModifiers.filter(n => n !== mod.name);
                        logDev(`World modifier "${mod.name}" disabled.`);
                    }
                } else {
                    logDev(`World modifier "${mod.name}" has no effect function.`);
                }
                devInput.value = '';
                return;
            }
            // Then try powerup card
            let card = getCardByName(name);
            if (card) {
                if (typeof player !== 'undefined' && player && typeof player.addCard === 'function' && typeof card.effect === 'function') {
                    for (let i = 0; i < count; ++i) {
                        player.addCard(card.name);
                        card.effect(player);
                    }
                    if (typeof updateCardsUI === 'function') updateCardsUI();
                    logDev(`Granted ${count}x "${card.name}" to player.`);
                } else {
                    try {
                        logDev('DIAG: player=' + (typeof player) + ', playerTruthy=' + (!!player) + ', addCard=' + (player && typeof player.addCard) + ', updateCardsUI=' + (typeof updateCardsUI) + ', cardEffect=' + (typeof card.effect));
                    } catch (ex) {
                        logDev('DIAG: error reading diagnostic info: ' + ex.message);
                    }
                    logDev('Player or updateCardsUI not ready. Try after game starts.');
                }
                devInput.value = '';
                return;
            }
            logDev(`Card or world modifier not found: "${name}"`);
        } else {
            logDev('Unknown command. Use //Card Name, //ModName, or //mods');
        }
        devInput.value = '';
    }
});