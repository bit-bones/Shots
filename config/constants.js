// Game constants
const CANVAS_W = 1300;
const CANVAS_H = 650;
const FIGHTER_RADIUS = 19;
const FIGHTER_RADIUS_SCALE_MIN = 0.65;
const FIGHTER_RADIUS_SCALE_MAX = 1.45;
const FIGHTER_RADIUS_SCALE_POWER = 0.5;
const BULLET_RADIUS = 7;
const BULLET_SPEED = 420;
const SHOOT_INTERVAL = 1.2; // seconds
const FIGHTER_SPEED = 220;
const HEALTH_MAX = 100;
const BULLET_DAMAGE = 18;
const BULLET_RANGE = 1000;
const EXPLOSION_BASE_RADIUS = 57;
const EXPLOSION_PARTICLES = 28;
const EXPLOSION_PARTICLE_BASE = 48;

// Dash Base Stats
const DASH_BASE_SPEED_MULT = 2.0;
const DASH_BASE_DIST = 110;
const DASH_BASE_COOLDOWN = 1.1;

// Obstacle settings
const OBSTACLE_MIN_SIZE = 70;
const OBSTACLE_MAX_SIZE = 170;

// Dash settings
const DASH_DURATION = 0.3;
const DASH_SPEED = 600;
const DASH_DAMAGE = 25;
const DASH_COOLDOWN = 1.1;

// Firestorm damage
const FIRESTORM_DAMAGE = 35;

const BOT_DIFFICULTY_PRESETS = Object.freeze({
    easy: {
        key: 'easy',
        label: 'Easy',
        retargetInterval: 0.12,
        strafePhaseSpeedMin: 0.7,
        strafePhaseSpeedMax: 1.25,
        strafeSwitchMin: 0.85,
        strafeSwitchMax: 2.4,
        strafeAmpMin: 0.24,
        strafeAmpMax: 0.72,
        idealDistance: 255,
        distanceBand: 52,
        shootMinDistance: 150,
        shootMaxDistance: 370,
        shootIntervalScale: 1.18,
        aimJitter: 34,
        aimSmoothing: 0.55,
        dashChance: 0.0012,
        dashDistanceMax: 320,
        dashDistanceMin: 120,
        dashCooldownScale: 1.3,
        lineOfSightTolerance: 0,
        moveNoise: 0.12,
        obstacleAvoidStrength: 0.45
    },
    normal: {
        key: 'normal',
        label: 'Normal',
        retargetInterval: 0,
        strafePhaseSpeedMin: 0.9,
        strafePhaseSpeedMax: 1.7,
        strafeSwitchMin: 0.6,
        strafeSwitchMax: 2.2,
        strafeAmpMin: 0.35,
        strafeAmpMax: 0.9,
        idealDistance: 240,
        distanceBand: 36,
        shootMinDistance: 125,
        shootMaxDistance: 430,
        shootIntervalScale: 1.0,
        aimJitter: 8,
        aimSmoothing: 0.38,
        dashChance: 0.0025,
        dashDistanceMax: 360,
        dashDistanceMin: 130,
        dashCooldownScale: 1.0,
        lineOfSightTolerance: 0,
        moveNoise: 0.06,
        obstacleAvoidStrength: 0.55
    },
    hard: {
        key: 'hard',
        label: 'Hard',
        retargetInterval: 0.05,
        strafePhaseSpeedMin: 1.05,
        strafePhaseSpeedMax: 1.9,
        strafeSwitchMin: 0.45,
        strafeSwitchMax: 1.6,
        strafeAmpMin: 0.42,
        strafeAmpMax: 1.05,
        idealDistance: 228,
        distanceBand: 30,
        shootMinDistance: 110,
        shootMaxDistance: 460,
        shootIntervalScale: 0.88,
        aimJitter: 4,
        aimSmoothing: 0.28,
        dashChance: 0.0038,
        dashDistanceMax: 360,
        dashDistanceMin: 110,
        dashCooldownScale: 0.85,
        lineOfSightTolerance: 18,
        moveNoise: 0.04,
        obstacleAvoidStrength: 0.62
    }
});

const POWERUP_RARITIES = Object.freeze({
    COMMON: 'common',
    UNCOMMON: 'uncommon',
    RARE: 'rare',
    EPIC: 'epic',
    LEGENDARY: 'legendary'
});

const POWERUP_RARITY_LABELS = Object.freeze({
    [POWERUP_RARITIES.COMMON]: 'Common',
    [POWERUP_RARITIES.UNCOMMON]: 'Uncommon',
    [POWERUP_RARITIES.RARE]: 'Rare',
    [POWERUP_RARITIES.EPIC]: 'Epic',
    [POWERUP_RARITIES.LEGENDARY]: 'Legendary'
});

const POWERUP_RARITY_WEIGHTS = Object.freeze({
    [POWERUP_RARITIES.COMMON]: 52,
    [POWERUP_RARITIES.UNCOMMON]: 26,
    [POWERUP_RARITIES.RARE]: 12,
    [POWERUP_RARITIES.EPIC]: 7,
    [POWERUP_RARITIES.LEGENDARY]: 3
});

const POWERUP_RARITY_COLORS = Object.freeze({
    [POWERUP_RARITIES.COMMON]: '#4a5568',
    [POWERUP_RARITIES.UNCOMMON]: '#3aa374',
    [POWERUP_RARITIES.RARE]: '#5c7cff',
    [POWERUP_RARITIES.EPIC]: '#b276ff',
    [POWERUP_RARITIES.LEGENDARY]: '#ff9f43'
});

const POWERUP_STAT_CONFIG = Object.freeze({
    bulletSpeed: { label: 'Bullet Speed', format: 'percent', higherIsPositive: true },
    bulletDamage: { label: 'Bullet Damage', format: 'percent', higherIsPositive: true },
    bulletRadius: { label: 'Bullet Size', format: 'percent', higherIsPositive: true },
    bulletRange: { label: 'Shot Range', format: 'percent', higherIsPositive: true },
    shootInterval: { label: 'Attack Speed', format: 'percent', higherIsPositive: true },
    speed: { label: 'Move Speed', format: 'percent', higherIsPositive: true },
    healthMax: { label: 'Max Health', format: 'flat', higherIsPositive: true },
    lifeStealPct: { label: 'Life Steal', format: 'percent-of-one', higherIsPositive: true },
    spread: { label: 'Spread Projectiles', format: 'flat', higherIsPositive: true },
    pierceStacks: { label: 'Pierce Limit', format: 'flat', higherIsPositive: true },
    dashRangeMult: { label: 'Dash Distance', format: 'percent', higherIsPositive: true },
    dashSpeedMult: { label: 'Dash Speed', format: 'percent', higherIsPositive: true },
    dashCooldownMult: { label: 'Dash Cooldown', format: 'percent', higherIsPositive: false },
    ricochet: { label: 'Ricochet', format: 'flat', higherIsPositive: true },
    deflectStacks: { label: 'Deflect Charges', format: 'flat', higherIsPositive: true },
    burst: { label: 'Burst Shots', format: 'flat', higherIsPositive: true },
    dashSpeed: { label: 'Dash Speed', format: 'percent', higherIsPositive: true },
    dashDuration: { label: 'Dash Duration', format: 'percent', higherIsPositive: true }
});

function formatPercent(value, precision = 0) {
    return `${value.toFixed(precision)}%`;
}

function computeAttackSpeedLine(effect) {
    if (!effect) return null;

    const label = 'Attack Speed';
    let percentChange = null;

    if (effect.mode === 'mult') {
        const value = Number(effect.value);
        if (!Number.isFinite(value) || value === 0) return null;
        percentChange = (1 / value - 1) * 100;
    } else if (effect.mode === 'add') {
        const value = Number(effect.value);
        if (!Number.isFinite(value)) return null;
        const baseInterval = Number(SHOOT_INTERVAL) || 1;
        percentChange = (-value / baseInterval) * 100;
    } else if (effect.mode === 'set') {
        const value = Number(effect.value);
        if (!Number.isFinite(value) || value <= 0) return null;
        const baseInterval = Number(SHOOT_INTERVAL) || 1;
        percentChange = (baseInterval / value - 1) * 100;
    } else {
        return null;
    }

    if (percentChange === null || !Number.isFinite(percentChange)) {
        return null;
    }

    const precision = effect.precision !== undefined ? effect.precision : 0;
    const formatted = formatPercent(Math.abs(percentChange), precision);
    const sign = percentChange >= 0 ? '+' : '-';
    return {
        text: `${sign}${formatted} ${label}`,
        tone: percentChange >= 0 ? 'positive' : 'negative'
    };
}

function computeLineFromEffect(effect) {
    if (!effect) return null;

    if (effect.displayText) {
        return {
            text: effect.displayText,
            tone: effect.tone || 'positive'
        };
    }

    if (effect.type === 'custom') {
        return null;
    }

    if (effect.type === 'flag') {
        const label = effect.label || (POWERUP_STAT_CONFIG[effect.property] && POWERUP_STAT_CONFIG[effect.property].label) || effect.property;
        return {
            text: label,
            tone: effect.tone || 'positive'
        };
    }

    if (effect.type === 'instant') {
        const label = effect.label || (POWERUP_STAT_CONFIG[effect.stat] && POWERUP_STAT_CONFIG[effect.stat].label) || effect.stat;
        const magnitude = effect.mode === 'percent-of-one'
            ? formatPercent(effect.value * 100, effect.precision || 0)
            : `${effect.value > 0 ? '+' : ''}${Math.round(effect.value)}`;
        return {
            text: `${magnitude} ${label}`,
            tone: effect.value >= 0 ? 'positive' : 'negative'
        };
    }

    if (effect.type === 'modify') {
        const meta = POWERUP_STAT_CONFIG[effect.stat] || { label: effect.stat, format: 'percent', higherIsPositive: true };
        if (effect.stat === 'shootInterval') {
            const attackSpeedLine = computeAttackSpeedLine(effect);
            if (attackSpeedLine) {
                return attackSpeedLine;
            }
        }
        let text;
        let tone = 'positive';

        if (effect.mode === 'mult') {
            const percent = (effect.value - 1) * 100;
            const formatted = formatPercent(percent >= 0 ? percent : Math.abs(percent), effect.precision || 0);
            const sign = percent >= 0 ? '+' : '-';
            text = `${sign}${formatted} ${meta.label}`;
            const isPositive = meta.higherIsPositive ? percent > 0 : percent < 0;
            tone = isPositive ? 'positive' : 'negative';
        } else if (effect.mode === 'add') {
            if (meta.format === 'percent-of-one') {
                const amount = effect.value * 100;
                text = `${effect.value >= 0 ? '+' : '-'}${formatPercent(Math.abs(amount), effect.precision || 0)} ${meta.label}`;
                tone = effect.value >= 0 ? 'positive' : 'negative';
            } else {
                const formatted = (effect.precision === undefined ? Math.round(effect.value) : Number(effect.value).toFixed(effect.precision));
                text = `${effect.value >= 0 ? '+' : ''}${formatted} ${meta.label}`;
                tone = effect.value >= 0 ? 'positive' : 'negative';
            }
        } else if (effect.mode === 'set') {
            text = `${meta.label} set to ${effect.value}`;
            tone = effect.value >= 0 ? 'positive' : 'negative';
        }

        return { text, tone };
    }

    return null;
}

function buildPowerupCard(card) {
    const effects = Array.isArray(card.effects) ? card.effects : [];
    const lines = [];
    const normalizedEffects = effects.map((effect) => {
        if (effect.type === 'modify' && effect.mode === 'add' && effect.normalize === 'percent-of-one') {
            return Object.assign({}, effect, { mode: 'add', precision: effect.precision || 0 });
        }
        return effect;
    });

    for (const effect of normalizedEffects) {
        const line = computeLineFromEffect(effect);
        if (line && line.text) {
            lines.push(line);
        }
    }

    return Object.assign({}, card, {
        rarity: card.rarity || POWERUP_RARITIES.COMMON,
        rarityLabel: POWERUP_RARITY_LABELS[card.rarity] || POWERUP_RARITY_LABELS[POWERUP_RARITIES.COMMON],
        rarityColor: POWERUP_RARITY_COLORS[card.rarity] || POWERUP_RARITY_COLORS[POWERUP_RARITIES.COMMON],
        effects: normalizedEffects,
        lines,
        desc: lines.length ? lines.map(line => line.text).join('\n') : (card.desc || card.name)
    });
}

const RAW_POWERUPS = [
    {
        name: 'Shot Controller',
        rarity: POWERUP_RARITIES.LEGENDARY,
        effects: [
            { type: 'flag', property: 'shotController', value: true, displayText: 'Shots follow your cursor', tone: 'positive' }
        ]
    },
    {
        name: 'Sniper',
        rarity: POWERUP_RARITIES.RARE,
        effects: [
            { type: 'modify', stat: 'bulletSpeed', mode: 'mult', value: 1.75 },
            { type: 'modify', stat: 'bulletDamage', mode: 'mult', value: 1.75 },
            { type: 'modify', stat: 'bulletRadius', mode: 'mult', value: 0.75 },
            { type: 'modify', stat: 'shootInterval', mode: 'mult', value: 1.75 }
        ]
    },
    {
        name: 'Shot Speed',
        rarity: POWERUP_RARITIES.COMMON,
        effects: [
            { type: 'modify', stat: 'bulletSpeed', mode: 'mult', value: 1.15 }
        ]
    },
    {
        name: 'Shot Size',
        rarity: POWERUP_RARITIES.COMMON,
        effects: [
            { type: 'modify', stat: 'bulletRadius', mode: 'mult', value: 1.35 }
        ]
    },
    {
        name: 'Shot Range',
        rarity: POWERUP_RARITIES.COMMON,
        effects: [
            { type: 'modify', stat: 'bulletRange', mode: 'mult', value: 1.15 }
        ]
    },
    {
        name: 'Shot Damage',
        rarity: POWERUP_RARITIES.UNCOMMON,
        effects: [
            { type: 'modify', stat: 'bulletDamage', mode: 'mult', value: 1.25 },
            { type: 'modify', stat: 'shootInterval', mode: 'mult', value: 1.15 }
        ]
    },
    {
        name: 'Move Speed',
        rarity: POWERUP_RARITIES.COMMON,
        effects: [
            { type: 'modify', stat: 'speed', mode: 'mult', value: 1.15 }
        ]
    },
    {
        name: 'Attack Speed',
        rarity: POWERUP_RARITIES.UNCOMMON,
        effects: [
            { type: 'modify', stat: 'shootInterval', mode: 'mult', value: 0.8 },
            { type: 'modify', stat: 'bulletDamage', mode: 'mult', value: 0.9 }
        ]
    },
    {
        name: 'Life Steal',
        rarity: POWERUP_RARITIES.RARE,
        effects: [
            { type: 'modify', stat: 'lifeStealPct', mode: 'add', value: 0.3, precision: 0 }
        ]
    },
    {
        name: 'Spread Shot',
        rarity: POWERUP_RARITIES.UNCOMMON,
        effects: [
            { type: 'modify', stat: 'spread', mode: 'add', value: 1, precision: 0 },
            { type: 'modify', stat: 'bulletDamage', mode: 'mult', value: 0.75 }
        ]
    },
    {
        name: 'Piercing Shot',
        rarity: POWERUP_RARITIES.RARE,
        effects: [
            { type: 'flag', property: 'pierce', value: true, displayText: 'Bullets pierce obstacles', tone: 'positive' },
            { type: 'modify', stat: 'pierceStacks', mode: 'add', value: 1, precision: 0 },
            { type: 'modify', stat: 'shootInterval', mode: 'mult', value: 1.25 }
        ]
    },
    {
        name: 'Dash+',
        rarity: POWERUP_RARITIES.UNCOMMON,
        effects: [
            { type: 'modify', stat: 'dashRangeMult', mode: 'mult', value: 1.18 },
            { type: 'modify', stat: 'dashSpeedMult', mode: 'mult', value: 1.12 }
        ]
    },
    {
        name: 'Big Shot',
        rarity: POWERUP_RARITIES.RARE,
        effects: [
            { type: 'custom', action: 'bigShot', displayText: 'Dash empowers next shot', tone: 'positive' },
            { type: 'modify', stat: 'dashCooldownMult', mode: 'mult', value: 1.25 }
        ]
    },
    {
        name: 'Ram',
        rarity: POWERUP_RARITIES.RARE,
        effects: [
            { type: 'custom', action: 'ram', displayText: 'Dash deals impact damage', tone: 'positive' },
            { type: 'modify', stat: 'dashCooldownMult', mode: 'mult', value: 1.25 }
        ]
    },
    {
        name: 'Deflect',
        rarity: POWERUP_RARITIES.UNCOMMON,
        effects: [
            { type: 'custom', action: 'deflect', displayText: '+1 Deflect Charge', tone: 'positive' }
        ]
    },
    {
        name: 'Obliterator',
        rarity: POWERUP_RARITIES.RARE,
        effects: [
            { type: 'custom', action: 'obliterator', displayText: 'Obstacle damage greatly increased', tone: 'positive' }
        ]
    },
    {
        name: 'Ricochet',
        rarity: POWERUP_RARITIES.UNCOMMON,
        effects: [
            { type: 'modify', stat: 'ricochet', mode: 'add', value: 1, precision: 0 }
        ]
    },
    {
        name: 'Explosive Shots',
        rarity: POWERUP_RARITIES.RARE,
        effects: [
            { type: 'flag', property: 'explosive', value: true, displayText: 'Shots explode on impact', tone: 'positive' },
            { type: 'modify', stat: 'shootInterval', mode: 'mult', value: 2.0 }
        ]
    },
    {
        name: 'Gunner',
        rarity: POWERUP_RARITIES.RARE,
        effects: [
            { type: 'modify', stat: 'shootInterval', mode: 'mult', value: 0.50 },
            { type: 'modify', stat: 'speed', mode: 'mult', value: 0.70 }
        ]
    },
    {
        name: 'Health Up',
        rarity: POWERUP_RARITIES.COMMON,
        effects: [
            { type: 'custom', action: 'increaseHealthMax', amount: 15, displayText: '+15 Max Health', tone: 'positive' }
        ]
    },
    {
        name: 'Lightweight',
        rarity: POWERUP_RARITIES.RARE,
        effects: [
            { type: 'custom', action: 'adjustHealth', amount: -15, displayText: '-15 Max Health', tone: 'negative' },
            { type: 'modify', stat: 'speed', mode: 'mult', value: 1.5 },
            { type: 'modify', stat: 'dashSpeedMult', mode: 'mult', value: 1.5 }
        ]
    },
    {
        name: 'Fire Shot',
        rarity: POWERUP_RARITIES.RARE,
        effects: [
            { type: 'flag', property: 'fireshot', value: true, displayText: 'Shots apply burn damage', tone: 'positive' },
            { type: 'modify', stat: 'shootInterval', mode: 'mult', value: 2.0 },
            { type: 'modify', stat: 'bulletDamage', mode: 'mult', value: 0.75 }
        ]
    },
    {
        name: 'Burst Shot',
        rarity: POWERUP_RARITIES.UNCOMMON,
        effects: [
            { type: 'modify', stat: 'burst', mode: 'add', value: 1, precision: 0 },
            { type: 'modify', stat: 'bulletDamage', mode: 'mult', value: 0.75 },
            { type: 'modify', stat: 'shootInterval', mode: 'mult', value: 1.25 }
        ]
    },
    {
        name: 'Teledash',
        rarity: POWERUP_RARITIES.LEGENDARY,
        effects: [
            { type: 'custom', action: 'teledash', displayText: 'Dash teleports to cursor', tone: 'positive' },
            { type: 'modify', stat: 'dashRangeMult', mode: 'mult', value: 1.5 },
            { type: 'modify', stat: 'dashCooldownMult', mode: 'mult', value: 1.3 },
            { type: 'modify', stat: 'dashSpeedMult', mode: 'mult', value: 0.75 }
        ]
    },
    {
        name: 'Aim Bot',
        rarity: POWERUP_RARITIES.LEGENDARY,
        effects: [
            { type: 'custom', action: 'aimbot', displayText: 'Shots auto-target nearest enemy', tone: 'positive' }
        ]
    },
    {
        name: 'Deathwish',
        rarity: POWERUP_RARITIES.LEGENDARY,
        effects: [
            { type: 'custom', action: 'deathwish', displayText: 'Set health to 1, triple damage, huge speed', tone: 'neutral' }
        ]
    },
    {
        name: 'Max Health',
        rarity: POWERUP_RARITIES.UNCOMMON,
        effects: [
            { type: 'custom', action: 'increaseHealthMax', amount: 30, displayText: '+30 Max Health', tone: 'positive' }
        ]
    },
    {
        name: 'Shot-Gun',
        rarity: POWERUP_RARITIES.LEGENDARY,
        effects: [
            { type: 'modify', stat: 'spread', mode: 'add', value: 6, precision: 0 },
            { type: 'modify', stat: 'bulletSpeed', mode: 'mult', value: 2.0 },
            { type: 'modify', stat: 'shootInterval', mode: 'mult', value: 2.0 },
            { type: 'modify', stat: 'bulletRadius', mode: 'mult', value: 0.8, precision: 0 },
            { type: 'modify', stat: 'bulletRange', mode: 'mult', value: 0.5, precision: 0 }
        ]
    },
];

const POWERUPS = RAW_POWERUPS.map(buildPowerupCard);
const POWERUP_LOOKUP = POWERUPS.reduce((acc, card) => {
    acc[card.name] = card;
    return acc;
}, {});

// World Modifier cards
const WORLD_MODIFIERS = [
    { name: "Infestation", desc: "Chunks become alive and aggressive." },
    { name: "Spontaneous", desc: "Chunks combust spontaneously." },
    { name: "Dynamic", desc: "Obstacles spawn and despawn randomly." },
    { name: "Firestorm", desc: "Storms of fire appear around the map." },
    { name: "Healers", desc: "Wandering healers that restore health." },
    { name: "Clutter", desc: "Loosens obstacle chunks." }
];

// Cursor style options
const CURSOR_STYLES = [
    { value: "reticle", label: "Reticle (default)" },
    { value: "crosshair", label: "Crosshair" },
    { value: "dot", label: "Dot" },
    { value: "bigdot", label: "Big Dot" },
    { value: "scope", label: "Scope" },
    { value: "none", label: "None (system)" }
];

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.CANVAS_W = CANVAS_W;
    window.CANVAS_H = CANVAS_H;
    window.FIGHTER_RADIUS = FIGHTER_RADIUS;
    window.FIGHTER_RADIUS_SCALE_MIN = FIGHTER_RADIUS_SCALE_MIN;
    window.FIGHTER_RADIUS_SCALE_MAX = FIGHTER_RADIUS_SCALE_MAX;
    window.FIGHTER_RADIUS_SCALE_POWER = FIGHTER_RADIUS_SCALE_POWER;
    window.BULLET_RADIUS = BULLET_RADIUS;
    window.BULLET_SPEED = BULLET_SPEED;
    window.SHOOT_INTERVAL = SHOOT_INTERVAL;
    window.FIGHTER_SPEED = FIGHTER_SPEED;
    window.HEALTH_MAX = HEALTH_MAX;
    window.BULLET_DAMAGE = BULLET_DAMAGE;
    window.BULLET_RANGE = BULLET_RANGE;
    window.EXPLOSION_BASE_RADIUS = EXPLOSION_BASE_RADIUS;
    window.EXPLOSION_PARTICLES = EXPLOSION_PARTICLES;
    window.EXPLOSION_PARTICLE_BASE = EXPLOSION_PARTICLE_BASE;
    window.DASH_BASE_SPEED_MULT = DASH_BASE_SPEED_MULT;
    window.DASH_BASE_DIST = DASH_BASE_DIST;
    window.DASH_BASE_COOLDOWN = DASH_BASE_COOLDOWN;
    window.OBSTACLE_MIN_SIZE = OBSTACLE_MIN_SIZE;
    window.OBSTACLE_MAX_SIZE = OBSTACLE_MAX_SIZE;
    window.DASH_DURATION = DASH_DURATION;
    window.DASH_SPEED = DASH_SPEED;
    window.DASH_DAMAGE = DASH_DAMAGE;
    window.DASH_COOLDOWN = DASH_COOLDOWN;
    window.FIRESTORM_DAMAGE = FIRESTORM_DAMAGE;
    window.BOT_DIFFICULTY_PRESETS = BOT_DIFFICULTY_PRESETS;
    window.POWERUPS = POWERUPS;
    window.POWERUP_LOOKUP = POWERUP_LOOKUP;
    window.POWERUP_RARITIES = POWERUP_RARITIES;
    window.POWERUP_RARITY_WEIGHTS = POWERUP_RARITY_WEIGHTS;
    window.POWERUP_RARITY_LABELS = POWERUP_RARITY_LABELS;
    window.POWERUP_RARITY_COLORS = POWERUP_RARITY_COLORS;
    window.POWERUP_STAT_CONFIG = POWERUP_STAT_CONFIG;
    window.WORLD_MODIFIERS = WORLD_MODIFIERS;
    window.CURSOR_STYLES = CURSOR_STYLES;
}
