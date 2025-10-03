// Game constants
window.CANVAS_W = 1300;
window.CANVAS_H = 650;
window.PLAYER_RADIUS = 19;
window.ENEMY_RADIUS = 19;
window.BULLET_RADIUS = 7;
window.BULLET_SPEED = 420;
window.SHOOT_INTERVAL = 1.2; // seconds
window.PLAYER_SPEED = 220;
window.ENEMY_SPEED = 170;
window.HEALTH_MAX = 100;
window.BULLET_DAMAGE = 18;
window.EXPLOSION_BASE_RADIUS = 57;
window.EXPLOSION_PARTICLES = 28;
window.EXPLOSION_PARTICLE_BASE = 48;
window.DASH_BASE_SPEED_MULT = 2.0; // base dash speed multiplier
window.DASH_BASE_DIST = 110;       // base dash distance in px
window.DASH_BASE_COOLDOWN = 1.1;   // seconds

// World Modifiers
window.WORLD_MODIFIERS = [
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
        desc: "Toggles dynamic mode on at 3.0s, or off if already on.",
        effect: function() {
            if (!DYNAMIC_MODE) {
                DYNAMIC_MODE = true;
                DYNAMIC_RATE = 3.0;
                dynamicTimer = 0;
                dynamicSpawnNext = true;
            } else {
                DYNAMIC_MODE = false;
                dynamicTimer = 0;
            }
        },
        picked: false
    },
    {
        name: "Firestorm",
        desc: "Storms of fire appear randomly around the map.",
        effect: function() {
            firestormActive = true;
            firestormTimer = 0;
            firestormNextTime = 3 + Math.random() * 4; // short delay before first storm
        },
        picked: false
    },
    {
        name: "Healers",
        desc: "Neutral healers roam the map.",
        effect: function() {
            healersActive = true;
            clearHealers();
            healerPendingRespawn = true;
            healerRespawnTimer = 0;
            setNextHealerRespawnDelay();
            if (!activeWorldModifiers.includes("Healers")) activeWorldModifiers.push("Healers");
        },
        picked: false
    }
];

// Powerups
window.POWERUPS = [
    { name: "Shot Controller", desc: "Shots follow your cursor.", effect: p => { p.shotController = true; } },
    { name: "Sniper", desc: "Shot speed/damage greatly increased, reduced shot size and attack speed.", effect: p => { p.bulletSpeed *= 1.65; p.bulletDamage *= 1.65; p.bulletRadius *= 0.7; p.shootInterval *= 1.5; } },
    { name: "Shot Speed+", desc: "Shots travel faster.", effect: p => p.bulletSpeed *= 1.08 },
    { name: "Shot Size+", desc: "Shots are bigger.", effect: p => p.bulletRadius *= 1.35 },
    { name: "Shot Dmg+", desc: "Shots deal more damage. Attack speed is reduced.", effect: p => { p.bulletDamage += 6; p.shootInterval *= 1.15; } },
    { name: "Move Speed+", desc: "You move faster.", effect: p => p.speed *= 1.08 },
    { name: "Attack Speed+", desc: "Reduces shot cooldown.", effect: p => p.shootInterval *= 0.85 },
    { name: "Life Steal", desc: "Heal for 30% of damage you deal.", effect: p => p.lifeStealPct = (p.lifeStealPct||0) + 0.3 },
    { name: "Spread+", desc: "+1 projectile per shot.", effect: p => p.spread = (p.spread || 0) + 1 },
    { name: "Piercing Shot", desc: "Shots pass through obstacles. Attack speed is reduced.", effect: p => { p.pierce = true; p.shootInterval *= 1.25; } },
    { name: "Dash+", desc: "Dash is faster and goes farther.", effect: p => { p.dashRangeMult = (p.dashRangeMult || 1) * 1.18; p.dashSpeedMult = (p.dashSpeedMult || 1) * 1.12; }},
    { name: "Big Shot", desc: "Your next shot after dashing is larger but slower. Dash cooldown +25%.", effect: p => { p.bigShot = true; p.bigShotSizeMult = (p.bigShotSizeMult || 2); p.bigShotSpeedMult = (p.bigShotSpeedMult || 0.5); p.dashCooldownMult = (p.dashCooldownMult || 1) * 1.25; } },
    { name: "Ram", desc: "Deal damage and knockback to anyone/anything you dash into. Dash cooldown +25%.", effect: p => { p.ram = true; p.ramStacks = (p.ramStacks||0) + 1; p.dashCooldownMult = (p.dashCooldownMult || 1) * 1.25; } },
    { name: "Deflect", desc: "Dashing deflects shots.", effect: p => { p.deflect = true; p.deflectStacks = (p.deflectStacks||0) + 1 } },
    { name: "Obliterator", desc: "Shots destroy more obstacle chunks. Each stack increases destruction.", effect: p => { p.obliterator = true; p.obliteratorStacks = (p.obliteratorStacks||0) + 1 } },
    { name: "Ricochet", desc: "+1 shot ricochet.", effect: p => p.ricochet = (p.ricochet|0) + 1 },
    { name: "Explosive Shots", desc: "Shots explode on impact. Attack speed is reduced.", effect: p => { p.explosive = true; p.explosiveStacks = (p.explosiveStacks||0) + 1; p.shootInterval *= 1.25; } },
    { name: "Gunner", desc: "Fire extremely quickly, but move slower.", effect: p => { p.shootInterval *= 0.65; p.speed *= 0.8; } },
    { name: "Health+", desc: "Max health increased by 10 per stack.", effect: p => { p.healthMax = (p.healthMax || window.HEALTH_MAX) + 10; } },
    { name: "Lightweight", desc: "Dash and move speed increased. Max health -10.", effect: p => { p.healthMax = (p.healthMax || window.HEALTH_MAX) - 10; p.speed *= 1.20; p.dashSpeedMult = (p.dashSpeedMult || 1) * 1.12; } },
    { name: "Fire Shot", desc: "Shots apply fire damage. Attack speed is greatly reduced.", effect: p => { p.fireshot = true; p.fireshotStacks = (p.fireshotStacks||0) + 1; p.shootInterval *= 1.5; } },
    { name: "Burst+", desc: "+1 Burst Shot.", effect: p => { p.burst = (p.burst||0) + 1; } },
    { name: "Teledash", desc: "Dash teleports towards your cursor. Range +50%, Speed -25%, Cooldown +30%.", effect: p => {
    p.teledash = true;
    p.teledashStacks = (p.teledashStacks || 0) + 1;
    p.dashRangeMult = (p.dashRangeMult || 1) * 1.5;
    p.dashCooldownMult = (p.dashCooldownMult || 1) * 1.3;
    p.dashSpeedMult = (p.dashSpeedMult || 1) * 0.75;
}},
];
