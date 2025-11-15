/**
 * AudioManager - Handles all sound effects for the game
 */
class AudioManager {
    constructor() {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        this.storageKey = 'shape_shot_volumes';

        // Volume settings (0.0 - 1.0)
        this._resetVolumeDefaults();

        // Burning loop management
        this.MAX_BURNING_SOUNDS = 10;
        this.activeBurningSounds = [];
        this.firestormBurningInstance = null;
        
        // Load saved volumes
        this.loadVolumes();
    }

    _resetVolumeDefaults() {
        this.masterVolume = 1.0;
        this.musicVolume = 1.0;
        this.sfxVolume = 1.0;
        this.shotVolume = 1.0;
        this.explosionVolume = 1.0;
        this.ricochetVolume = 1.0;
        this.hitVolume = 1.0;
        this.dashVolume = 1.0;
        this.impactVolume = 1.0;
        this.burningVolume = 1.0;
        this.poofVolume = 1.0;
    }

    _clampVolume(value) {
        if (typeof value !== 'number' || Number.isNaN(value)) return 0;
        return Math.max(0, Math.min(1, value));
    }

    _getEffectsSnapshot() {
        return {
            shot: this.shotVolume,
            explosion: this.explosionVolume,
            ricochet: this.ricochetVolume,
            hit: this.hitVolume,
            dash: this.dashVolume,
            impact: this.impactVolume,
            burning: this.burningVolume,
            poof: this.poofVolume
        };
    }

    _getVolumeSnapshot() {
        return {
            master: this.masterVolume,
            music: this.musicVolume,
            sfx: this.sfxVolume,
            effects: this._getEffectsSnapshot()
        };
    }

    _readStoredVolumes(key) {
        if (!key) return null;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                return parsed;
            }
        } catch (e) {
            console.warn('Failed to read volumes for key', key, e);
        }
        return null;
    }

    _applyStoredVolumes(vs) {
        if (!vs) return;
        if (typeof vs.master === 'number') this.masterVolume = this._clampVolume(vs.master);
        if (typeof vs.music === 'number') this.musicVolume = this._clampVolume(vs.music);
        if (typeof vs.sfx === 'number') this.sfxVolume = this._clampVolume(vs.sfx);
        if (typeof vs.shot === 'number') this.shotVolume = this._clampVolume(vs.shot);
        if (typeof vs.explosion === 'number') this.explosionVolume = this._clampVolume(vs.explosion);
        if (typeof vs.ricochet === 'number') this.ricochetVolume = this._clampVolume(vs.ricochet);
        if (typeof vs.hit === 'number') this.hitVolume = this._clampVolume(vs.hit);
        if (typeof vs.dash === 'number') this.dashVolume = this._clampVolume(vs.dash);
        if (typeof vs.impact === 'number') this.impactVolume = this._clampVolume(vs.impact);
        if (typeof vs.burning === 'number') this.burningVolume = this._clampVolume(vs.burning);
        if (typeof vs.poof === 'number') this.poofVolume = this._clampVolume(vs.poof);
    }

    _refreshBurningGains() {
        if (!this.audioCtx) return;
        const now = this.audioCtx.currentTime;
        const baseGain = 0.05 * this.masterVolume * this.sfxVolume * this.burningVolume;

        if (this.firestormBurningInstance && this.firestormBurningInstance.masterGain) {
            try {
                this.firestormBurningInstance.masterGain.gain.cancelScheduledValues(now);
                this.firestormBurningInstance.masterGain.gain.setValueAtTime(baseGain, now);
            } catch (e) {}
        }

        for (const entry of this.activeBurningSounds) {
            if (!entry || !entry.masterGain) continue;
            try {
                entry.masterGain.gain.cancelScheduledValues(now);
                entry.masterGain.gain.setValueAtTime(baseGain, now);
                entry.baseGain = baseGain;
            } catch (e) {}
        }
    }

    setMasterVolume(value) {
        this.masterVolume = this._clampVolume(value);
        this._refreshBurningGains();
        this.saveVolumes();
    }

    setMusicVolume(value) {
        this.musicVolume = this._clampVolume(value);
        this.saveVolumes();
    }

    setSfxVolume(value) {
        this.sfxVolume = this._clampVolume(value);
        this._refreshBurningGains();
        this.saveVolumes();
    }

    setEffectVolume(effect, value) {
        const vol = this._clampVolume(value);
        switch (effect) {
            case 'shot':
                this.shotVolume = vol;
                break;
            case 'explosion':
                this.explosionVolume = vol;
                break;
            case 'ricochet':
                this.ricochetVolume = vol;
                break;
            case 'hit':
                this.hitVolume = vol;
                break;
            case 'dash':
                this.dashVolume = vol;
                break;
            case 'impact':
                this.impactVolume = vol;
                break;
            case 'burning':
                this.burningVolume = vol;
                this._refreshBurningGains();
                break;
            case 'poof':
                this.poofVolume = vol;
                break;
            default:
                break;
        }
        this.saveVolumes();
    }

    loadVolumes(options = {}) {
        const opts = options || {};
        const fallbackKey = typeof opts.fallbackKey === 'string' ? opts.fallbackKey : null;

        this._resetVolumeDefaults();

        let usedFallback = false;
        let stored = this._readStoredVolumes(this.storageKey);
        if (!stored && fallbackKey) {
            stored = this._readStoredVolumes(fallbackKey);
            usedFallback = !!stored;
        }

        if (stored) {
            this._applyStoredVolumes(stored);
        }

        this._refreshBurningGains();

        if (usedFallback) {
            // Persist the fallback values under the new key for future sessions
            this.saveVolumes();
        }

        return this._getVolumeSnapshot();
    }

    saveVolumes() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify({
                master: this.masterVolume,
                music: this.musicVolume,
                sfx: this.sfxVolume,
                shot: this.shotVolume,
                explosion: this.explosionVolume,
                ricochet: this.ricochetVolume,
                hit: this.hitVolume,
                dash: this.dashVolume,
                impact: this.impactVolume,
                burning: this.burningVolume,
                poof: this.poofVolume
            }));
        } catch (e) {
            console.warn('Failed to save volumes for key', this.storageKey, e);
        }
    }

    setStorageKey(key, options = {}) {
        if (!key || typeof key !== 'string') {
            return this._getVolumeSnapshot();
        }
        if (key === this.storageKey) {
            return this._getVolumeSnapshot();
        }

        this.storageKey = key;
        const opts = options || {};
        const fallbackKey = typeof opts.fallbackKey === 'string' ? opts.fallbackKey : null;
        const snapshot = this.loadVolumes({ fallbackKey });
        if (opts.persistImmediately) {
            this.saveVolumes();
        }
        return snapshot;
    }

    playGunShot() {
        const o = this.audioCtx.createOscillator();
        const g = this.audioCtx.createGain();
        o.type = 'square';
        o.frequency.value = 380;
        g.gain.value = 0.05 * this.masterVolume * this.sfxVolume * this.shotVolume;
        o.connect(g).connect(this.audioCtx.destination);
        o.start();
        o.frequency.linearRampToValueAtTime(180, this.audioCtx.currentTime + 0.09);
        g.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.11);
        o.stop(this.audioCtx.currentTime + 0.12);
    }

    playExplosion() {
        const o = this.audioCtx.createOscillator();
        const g = this.audioCtx.createGain();
        o.type = 'triangle';
        o.frequency.value = 80;
        g.gain.value = 0.40 * this.masterVolume * this.sfxVolume * this.explosionVolume;
        o.connect(g).connect(this.audioCtx.destination);
        o.start();
        o.frequency.linearRampToValueAtTime(30, this.audioCtx.currentTime + 0.18);
        g.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.22);
        o.stop(this.audioCtx.currentTime + 0.23);
    }

    playSoftPoof() {
        try {
            const o = this.audioCtx.createOscillator();
            const g = this.audioCtx.createGain();
            o.type = 'triangle';
            o.frequency.value = 120;
            g.gain.value = 0.12 * this.masterVolume * this.sfxVolume * this.poofVolume;
            o.connect(g).connect(this.audioCtx.destination);
            o.start();
            o.frequency.linearRampToValueAtTime(60, this.audioCtx.currentTime + 0.12);
            g.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.14);
            o.stop(this.audioCtx.currentTime + 0.15);
        } catch (e) {
            console.warn('Failed to play soft poof sound:', e);
        }
    }

    playHit() {
        const o = this.audioCtx.createOscillator();
        const g = this.audioCtx.createGain();
        o.type = 'sine';
        o.frequency.value = 220;
        g.gain.value = 0.13 * this.masterVolume * this.sfxVolume * this.hitVolume;
        o.connect(g).connect(this.audioCtx.destination);
        o.start();
        o.frequency.linearRampToValueAtTime(110, this.audioCtx.currentTime + 0.08);
        g.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.09);
        o.stop(this.audioCtx.currentTime + 0.1);
    }

    playRicochet() {
        const o = this.audioCtx.createOscillator();
        const g = this.audioCtx.createGain();
        o.type = 'triangle';
        o.frequency.value = 980;
        g.gain.value = 0.03 * this.masterVolume * this.sfxVolume * this.ricochetVolume;
        o.connect(g).connect(this.audioCtx.destination);
        o.start();
        o.frequency.linearRampToValueAtTime(640, this.audioCtx.currentTime + 0.04);
        g.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.06);
        o.stop(this.audioCtx.currentTime + 0.07);
    }

    playDashWoosh(duration = 0.28, speedMult = 1.0) {
        try {
            const now = this.audioCtx.currentTime;
            const dur = Math.max(0.06, Math.min(duration, 1.4));
            
            // Low rumble
            const low = this.audioCtx.createOscillator();
            const lowGain = this.audioCtx.createGain();
            low.type = 'sine';
            low.frequency.value = 80 * Math.max(0.55, speedMult);
            lowGain.gain.value = 0.06 * this.masterVolume * this.sfxVolume * this.dashVolume;
            low.connect(lowGain).connect(this.audioCtx.destination);
            low.start(now);
            low.frequency.linearRampToValueAtTime(40 * Math.max(0.55, speedMult), now + dur * 0.9);
            lowGain.gain.linearRampToValueAtTime(0.0, now + dur);
            low.stop(now + dur + 0.02);

            // High whoosh
            const high = this.audioCtx.createOscillator();
            const highGain = this.audioCtx.createGain();
            high.type = 'sawtooth';
            high.frequency.value = 250 * Math.max(0.65, speedMult);
            highGain.gain.value = 0.05 * this.masterVolume * this.sfxVolume * this.dashVolume;
            high.connect(highGain).connect(this.audioCtx.destination);
            high.start(now);
            high.frequency.exponentialRampToValueAtTime(Math.max(120, 320 * Math.max(0.55, speedMult)), now + dur * 0.9);
            highGain.gain.setValueAtTime(highGain.gain.value, now);
            highGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
            high.stop(now + dur + 0.02);
        } catch (e) {
            console.warn('Failed to play dash sound:', e);
        }
    }

    playImpact(damage = 1) {
        if (!this.audioCtx) return;
        try {
            const d = Math.max(0.2, Math.min(6.0, damage));
            const now = this.audioCtx.currentTime;

            const noiseDur = 0.12;
            const bufLen = Math.floor(this.audioCtx.sampleRate * noiseDur);
            const noiseBuf = this.audioCtx.createBuffer(1, bufLen, this.audioCtx.sampleRate);
            const data = noiseBuf.getChannelData(0);
            for (let i = 0; i < bufLen; i++) {
                data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
            }
            const noiseSrc = this.audioCtx.createBufferSource();
            noiseSrc.buffer = noiseBuf;
            const noiseFilter = this.audioCtx.createBiquadFilter();
            noiseFilter.type = 'lowpass';
            const pitchFactor = 0.8 / (1 + Math.max(0, d - 1) * 0.12);
            noiseFilter.frequency.value = (1000 + Math.min(2500, 220 * d)) * pitchFactor;
            noiseFilter.Q.value = 0.8;
            const noiseGain = this.audioCtx.createGain();
            noiseGain.gain.value = 0.03 * this.masterVolume * this.sfxVolume * this.impactVolume * Math.min(3.0, 0.35 + d * 0.36);
            noiseSrc.connect(noiseFilter).connect(noiseGain).connect(this.audioCtx.destination);
            noiseSrc.start(now);
            noiseSrc.stop(now + noiseDur + 0.02);

            const body = this.audioCtx.createOscillator();
            const bodyGain = this.audioCtx.createGain();
            body.type = 'sine';
            body.frequency.value = Math.max(24, (140 / Math.sqrt(d)) * pitchFactor);
            bodyGain.gain.value = 0.0;
            body.connect(bodyGain).connect(this.audioCtx.destination);
            body.start(now);
            const bodyPeak = 0.20 * this.masterVolume * this.sfxVolume * this.impactVolume * Math.min(2.4, 0.25 + d * 0.28);
            bodyGain.gain.setValueAtTime(0.0001, now);
            bodyGain.gain.linearRampToValueAtTime(bodyPeak, now + 0.01);
            bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
            body.stop(now + 0.38);

            const click = this.audioCtx.createOscillator();
            const clickGain = this.audioCtx.createGain();
            click.type = 'triangle';
            click.frequency.value = (1000 + d * 240) * pitchFactor;
            clickGain.gain.value = 0.02 * this.masterVolume * this.sfxVolume * this.impactVolume * Math.min(3.0, 0.5 + d * 0.24);
            click.connect(clickGain).connect(this.audioCtx.destination);
            click.start(now);
            clickGain.gain.linearRampToValueAtTime(0, now + 0.035);
            click.stop(now + 0.04);
        } catch (e) {
            console.warn('Failed to play impact sound:', e);
        }
    }

    playBurning(duration = 0.5) {
        if (!this.audioCtx) return;
        try {
            const now = this.audioCtx.currentTime;
            const requested = Math.max(0.1, Math.min(duration, 6.0));
            const loopLen = 0.6;

            const createPinkBuffer = (lenSec) => {
                const len = Math.floor(this.audioCtx.sampleRate * lenSec);
                const buf = this.audioCtx.createBuffer(1, len, this.audioCtx.sampleRate);
                const d = buf.getChannelData(0);
                let b0 = 0, b1 = 0, b2 = 0;
                for (let i = 0; i < len; i++) {
                    const white = Math.random() * 2 - 1;
                    b0 = 0.997 * b0 + white * 0.029;
                    b1 = 0.985 * b1 + white * 0.013;
                    b2 = 0.950 * b2 + white * 0.007;
                    const pink = b0 + b1 + b2 + white * 0.02;
                    d[i] = pink * (0.95 - (i / len) * 0.15);
                }
                return buf;
            };

            const nowActive = this.activeBurningSounds.filter(x => x.stopTime > now);
            if (nowActive.length >= this.MAX_BURNING_SOUNDS) {
                nowActive.sort((a, b) => a.stopTime - b.stopTime);
                const victim = nowActive[0];
                const extra = Math.min(requested, 4.0);
                const newStop = Math.max(victim.stopTime, now) + extra;
                try {
                    victim.masterGain.gain.cancelScheduledValues(now);
                    victim.masterGain.gain.setValueAtTime(victim.baseGain * 0.9, now + 0.01);
                    victim.masterGain.gain.linearRampToValueAtTime(victim.baseGain, now + 0.2 + Math.random() * 0.6);
                    victim.masterGain.gain.setValueAtTime(victim.baseGain, newStop - 0.08);
                    victim.masterGain.gain.linearRampToValueAtTime(0.0, newStop);
                } catch (e) {}
                victim.stopTime = newStop;
                return;
            }

            const bufA = createPinkBuffer(loopLen);
            const bufB = createPinkBuffer(loopLen);

            const filter = this.audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 600;
            filter.Q.value = 0.7;

            const masterGainNode = this.audioCtx.createGain();
            masterGainNode.gain.value = 0.05 * this.masterVolume * this.sfxVolume * this.burningVolume;

            filter.connect(masterGainNode).connect(this.audioCtx.destination);

            const srcA = this.audioCtx.createBufferSource();
            srcA.buffer = bufA;
            srcA.loop = true;
            const srcB = this.audioCtx.createBufferSource();
            srcB.buffer = bufB;
            srcB.loop = true;

            const gainA = this.audioCtx.createGain();
            const gainB = this.audioCtx.createGain();
            gainA.gain.value = 0.9;
            gainB.gain.value = 0.9;

            srcA.connect(gainA).connect(filter);
            srcB.connect(gainB).connect(filter);

            const startA = now + 0.01;
            const jitter = Math.random() * 0.08;
            const startB = now + loopLen / 2 + jitter + 0.01;
            srcA.start(startA);
            srcB.start(startB);

            const scheduleGainAutomation = (gNode, sTime) => {
                const segs = Math.max(3, Math.round(loopLen * 2));
                let t = sTime;
                for (let i = 0; i < segs; i++) {
                    const dur = (loopLen / segs) * (0.9 + Math.random() * 0.3);
                    const val = 0.7 + Math.random() * 0.35;
                    gNode.gain.setValueAtTime(val, t);
                    gNode.gain.linearRampToValueAtTime(0.65 + Math.random() * 0.4, t + dur);
                    t += dur;
                }
                gNode.gain.setValueAtTime(gNode.gain.value, sTime + loopLen + 0.02);
            };

            scheduleGainAutomation(gainA, startA);
            scheduleGainAutomation(gainB, startB);

            const stopTime = now + requested;
            const fade = Math.min(0.6, Math.max(0.12, requested * 0.25));
            try { masterGainNode.gain.cancelScheduledValues(now); } catch (e) {}
            masterGainNode.gain.setValueAtTime(masterGainNode.gain.value, Math.max(now, stopTime - fade));
            masterGainNode.gain.setTargetAtTime(0.00001, Math.max(now, stopTime - fade) + 0.01, 0.06);

            const stopAfter = stopTime + fade + 0.06;
            try { srcA.stop(stopAfter); } catch (e) {}
            try { srcB.stop(stopAfter); } catch (e) {}

            this.activeBurningSounds.push({ masterGain: masterGainNode, stopTime: stopAfter, baseGain: masterGainNode.gain.value });
            setTimeout(() => {
                const cutoff = this.audioCtx.currentTime;
                this.activeBurningSounds = this.activeBurningSounds.filter(entry => entry.stopTime > cutoff);
            }, (requested + fade + 0.8) * 1000);
        } catch (e) {
            console.warn('Failed to play burning sound:', e);
        }
    }

    startFirestormBurning() {
        if (!this.audioCtx || this.firestormBurningInstance) return;
        try {
            const now = this.audioCtx.currentTime;
            const loopLen = 0.6;

            const createPinkBuffer = (lenSec) => {
                const len = Math.floor(this.audioCtx.sampleRate * lenSec);
                const buf = this.audioCtx.createBuffer(1, len, this.audioCtx.sampleRate);
                const d = buf.getChannelData(0);
                let b0 = 0, b1 = 0, b2 = 0;
                for (let i = 0; i < len; i++) {
                    const white = Math.random() * 2 - 1;
                    b0 = 0.997 * b0 + white * 0.029;
                    b1 = 0.985 * b1 + white * 0.013;
                    b2 = 0.950 * b2 + white * 0.007;
                    const pink = b0 + b1 + b2 + white * 0.02;
                    d[i] = pink * (0.95 - (i / len) * 0.15);
                }
                return buf;
            };

            const bufA = createPinkBuffer(loopLen);
            const bufB = createPinkBuffer(loopLen);

            const filter = this.audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 420;
            filter.Q.value = 0.7;

            const masterGainNode = this.audioCtx.createGain();
            masterGainNode.gain.value = 0.05 * this.masterVolume * this.sfxVolume * this.burningVolume;

            filter.connect(masterGainNode).connect(this.audioCtx.destination);

            const srcA = this.audioCtx.createBufferSource();
            srcA.buffer = bufA;
            srcA.loop = true;
            const srcB = this.audioCtx.createBufferSource();
            srcB.buffer = bufB;
            srcB.loop = true;

            const gainA = this.audioCtx.createGain();
            const gainB = this.audioCtx.createGain();
            gainA.gain.value = 0.9;
            gainB.gain.value = 0.9;

            srcA.connect(gainA).connect(filter);
            srcB.connect(gainB).connect(filter);

            const startA = now + 0.01;
            const jitter = Math.random() * 0.08;
            const startB = now + loopLen / 2 + jitter + 0.01;
            srcA.start(startA);
            srcB.start(startB);

            const scheduleGainAutomation = (gNode, sTime) => {
                const segs = Math.max(3, Math.round(loopLen * 2));
                let t = sTime;
                for (let i = 0; i < segs; i++) {
                    const dur = (loopLen / segs) * (0.9 + Math.random() * 0.3);
                    const val = 0.7 + Math.random() * 0.35;
                    gNode.gain.setValueAtTime(val, t);
                    gNode.gain.linearRampToValueAtTime(0.65 + Math.random() * 0.4, t + dur);
                    t += dur;
                }
                gNode.gain.setValueAtTime(gNode.gain.value, sTime + loopLen + 0.02);
            };

            scheduleGainAutomation(gainA, startA);
            scheduleGainAutomation(gainB, startB);

            this.firestormBurningInstance = {
                srcA,
                srcB,
                masterGain: masterGainNode
            };
        } catch (e) {
            console.warn('Failed to start firestorm burning loop:', e);
        }
    }

    stopFirestormBurning() {
        if (!this.audioCtx || !this.firestormBurningInstance) return;
        try {
            const now = this.audioCtx.currentTime;
            const fade = 0.3;
            const stopTime = now + fade;
            this.firestormBurningInstance.masterGain.gain.cancelScheduledValues(now);
            this.firestormBurningInstance.masterGain.gain.setValueAtTime(this.firestormBurningInstance.masterGain.gain.value, now);
            this.firestormBurningInstance.masterGain.gain.setTargetAtTime(0.00001, now + 0.01, 0.06);
            this.firestormBurningInstance.srcA.stop(stopTime);
            this.firestormBurningInstance.srcB.stop(stopTime);
        } catch (e) {
            console.warn('Failed to stop firestorm burning loop:', e);
        }
        this.firestormBurningInstance = null;
    }
}

// Export to window
if (typeof window !== 'undefined') {
    window.AudioManager = AudioManager;
}
