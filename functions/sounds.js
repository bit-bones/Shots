// Centralized sound effect generation helpers.
const audioCtx = window.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
window.audioCtx = audioCtx;

let masterVolume = window.masterVolume ?? 1.0;
let musicVolume = window.musicVolume ?? 1.0;
let sfxVolume = window.sfxVolume ?? 1.0;
let shotVolume = window.shotVolume ?? 1.0;
let explosionVolume = window.explosionVolume ?? 1.0;
let ricochetVolume = window.ricochetVolume ?? 1.0;
let hitVolume = window.hitVolume ?? 1.0;
let impactVolume = window.impactVolume ?? 1.0;
let dashVolume = window.dashVolume ?? 1.0;
let burningVolume = window.burningVolume ?? 1.0;

const MAX_BURNING_SOUNDS = 10;
const activeBurningSounds = [];
let firestormBurningInstance = null;

try {
	const vs = JSON.parse(localStorage.getItem('shape_shot_volumes') || '{}');
	if (vs && typeof vs.master === 'number') masterVolume = vs.master;
	if (vs && typeof vs.music === 'number') musicVolume = vs.music;
	if (vs && typeof vs.sfx === 'number') sfxVolume = vs.sfx;
	if (vs && typeof vs.shot === 'number') shotVolume = vs.shot;
	if (vs && typeof vs.explosion === 'number') explosionVolume = vs.explosion;
	if (vs && typeof vs.ricochet === 'number') ricochetVolume = vs.ricochet;
	if (vs && typeof vs.hit === 'number') hitVolume = vs.hit;
	if (vs && typeof vs.impact === 'number') impactVolume = vs.impact;
	if (vs && typeof vs.dash === 'number') dashVolume = vs.dash;
	if (vs && typeof vs.burning === 'number') burningVolume = vs.burning;
} catch (e) {}

function playGunShot() {
	const o = audioCtx.createOscillator();
	const g = audioCtx.createGain();
	o.type = 'square';
	o.frequency.value = 380;
	g.gain.value = 0.035 * masterVolume * sfxVolume * shotVolume;
	o.connect(g).connect(audioCtx.destination);
	o.start();
	o.frequency.linearRampToValueAtTime(180, audioCtx.currentTime + 0.09);
	g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.11);
	o.stop(audioCtx.currentTime + 0.12);
	try { if (typeof GameEvents !== 'undefined' && GameEvents.emit) GameEvents.emit('sound-effect', { name: 'gunshot' }); } catch (e) {}
}

function playExplosion() {
	const o = audioCtx.createOscillator();
	const g = audioCtx.createGain();
	o.type = 'triangle';
	o.frequency.value = 80;
	g.gain.value = 0.45 * masterVolume * sfxVolume * explosionVolume;
	o.connect(g).connect(audioCtx.destination);
	o.start();
	o.frequency.linearRampToValueAtTime(30, audioCtx.currentTime + 0.18);
	g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.22);
	o.stop(audioCtx.currentTime + 0.23);
	try { if (typeof GameEvents !== 'undefined' && GameEvents.emit) GameEvents.emit('sound-effect', { name: 'explosion' }); } catch (e) {}
}

function playSoftPoof() {
	try {
		const o = audioCtx.createOscillator();
		const g = audioCtx.createGain();
		o.type = 'triangle';
		o.frequency.value = 120;
		g.gain.value = 0.12 * masterVolume * sfxVolume * explosionVolume;
		o.connect(g).connect(audioCtx.destination);
		o.start();
		o.frequency.linearRampToValueAtTime(60, audioCtx.currentTime + 0.12);
		g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.14);
		o.stop(audioCtx.currentTime + 0.15);
	} catch (e) {}
	try { if (typeof GameEvents !== 'undefined' && GameEvents.emit) GameEvents.emit('sound-effect', { name: 'soft-poof' }); } catch (e) {}
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
	try { if (typeof GameEvents !== 'undefined' && GameEvents.emit) GameEvents.emit('sound-effect', { name: 'hit' }); } catch (e) {}
}

function playRicochet() {
	const o = audioCtx.createOscillator();
	const g = audioCtx.createGain();
	o.type = 'triangle';
	o.frequency.value = 980;
	g.gain.value = 0.05 * masterVolume * sfxVolume * ricochetVolume;
	o.connect(g).connect(audioCtx.destination);
	o.start();
	o.frequency.linearRampToValueAtTime(640, audioCtx.currentTime + 0.04);
	g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.06);
	o.stop(audioCtx.currentTime + 0.07);
	try { if (typeof GameEvents !== 'undefined' && GameEvents.emit) GameEvents.emit('sound-effect', { name: 'ricochet' }); } catch (e) {}
}

function playImpact(damage = 1) {
	try {
		const d = Math.max(0.2, Math.min(6.0, damage));
		const now = audioCtx.currentTime;

		const noiseDur = 0.12;
		const bufLen = Math.floor(audioCtx.sampleRate * noiseDur);
		const noiseBuf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
		const data = noiseBuf.getChannelData(0);
		for (let i = 0; i < bufLen; i++) {
			data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
		}
		const noiseSrc = audioCtx.createBufferSource();
		noiseSrc.buffer = noiseBuf;
		const noiseFilter = audioCtx.createBiquadFilter();
		noiseFilter.type = 'lowpass';
		const pitchFactor = 0.8 / (1 + Math.max(0, d - 1) * 0.12);
		noiseFilter.frequency.value = (1000 + Math.min(2500, 220 * d)) * pitchFactor;
		noiseFilter.Q.value = 0.8;
		const noiseGain = audioCtx.createGain();
		noiseGain.gain.value = 0.03 * masterVolume * sfxVolume * impactVolume * Math.min(3.0, 0.35 + d * 0.36);
		noiseSrc.connect(noiseFilter).connect(noiseGain).connect(audioCtx.destination);
		noiseSrc.start(now);
		noiseSrc.stop(now + noiseDur + 0.02);

		const body = audioCtx.createOscillator();
		const bodyGain = audioCtx.createGain();
		body.type = 'sine';
		body.frequency.value = Math.max(24, (140 / Math.sqrt(d)) * pitchFactor);
		bodyGain.gain.value = 0.0;
		body.connect(bodyGain).connect(audioCtx.destination);
		body.start(now);
		const bodyPeak = 0.20 * masterVolume * sfxVolume * impactVolume * Math.min(2.4, 0.25 + d * 0.28);
		bodyGain.gain.setValueAtTime(0.0001, now);
		bodyGain.gain.linearRampToValueAtTime(bodyPeak, now + 0.01);
		bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
		body.stop(now + 0.38);

		const click = audioCtx.createOscillator();
		const clickGain = audioCtx.createGain();
		click.type = 'triangle';
		click.frequency.value = (1000 + d * 240) * pitchFactor;
		clickGain.gain.value = 0.02 * masterVolume * sfxVolume * impactVolume * Math.min(3.0, 0.5 + d * 0.24);
		click.connect(clickGain).connect(audioCtx.destination);
		click.start(now);
		clickGain.gain.linearRampToValueAtTime(0, now + 0.035);
		click.stop(now + 0.04);
	} catch (e) {}
	try { if (typeof GameEvents !== 'undefined' && GameEvents.emit) GameEvents.emit('sound-effect', { name: 'impact' }); } catch (e) {}
}

function playDashWoosh(duration = 0.28, speedMult = 1.0) {
	try {
		const now = audioCtx.currentTime;
		const dur = Math.max(0.06, Math.min(duration, 1.4));
		const low = audioCtx.createOscillator();
		const lowGain = audioCtx.createGain();
		low.type = 'sine';
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
		high.frequency.value = 250 * Math.max(0.65, speedMult);
		highGain.gain.value = 0.05 * masterVolume * sfxVolume * dashVolume;
		high.connect(highGain).connect(audioCtx.destination);
		high.start(now);
		high.frequency.exponentialRampToValueAtTime(Math.max(120, 320 * Math.max(0.55, speedMult)), now + dur * 0.9);
		highGain.gain.setValueAtTime(highGain.gain.value, now);
		highGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
		high.stop(now + dur + 0.02);
	} catch (e) {}
	try { if (typeof GameEvents !== 'undefined' && GameEvents.emit) GameEvents.emit('sound-effect', { name: 'dash' }); } catch (e) {}
}

function playBurning(duration = 0.5) {
	try {
		const now = audioCtx.currentTime;
		const requested = Math.max(0.1, Math.min(duration, 6.0));
		const loopLen = 0.6;

		function createPinkBuffer(lenSec) {
			const len = Math.floor(audioCtx.sampleRate * lenSec);
			const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
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
		}

		const bufA = createPinkBuffer(loopLen);
		const bufB = createPinkBuffer(loopLen);

		const filter = audioCtx.createBiquadFilter();
		filter.type = 'lowpass';
		filter.frequency.value = 600;
		filter.Q.value = 0.7;

		const masterGainNode = audioCtx.createGain();
		masterGainNode.gain.value = 0.05 * masterVolume * sfxVolume * burningVolume;

		filter.connect(masterGainNode).connect(audioCtx.destination);

		const nowActive = activeBurningSounds.filter(x => x.stopTime > now);
		if (nowActive.length >= MAX_BURNING_SOUNDS) {
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

		const srcA = audioCtx.createBufferSource();
		srcA.buffer = bufA;
		srcA.loop = true;
		const srcB = audioCtx.createBufferSource();
		srcB.buffer = bufB;
		srcB.loop = true;

		const gainA = audioCtx.createGain();
		const gainB = audioCtx.createGain();
		gainA.gain.value = 0.9;
		gainB.gain.value = 0.9;

		srcA.connect(gainA).connect(filter);
		srcB.connect(gainB).connect(filter);

		const startA = now + 0.01;
		const jitter = Math.random() * 0.08;
		const startB = now + loopLen / 2 + jitter + 0.01;
		srcA.start(startA);
		srcB.start(startB);

		function scheduleGainAutomation(gNode, sTime) {
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
		}

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

		activeBurningSounds.push({ masterGain: masterGainNode, stopTime: stopAfter, baseGain: masterGainNode.gain.value });
		setTimeout(() => {
			for (let i = activeBurningSounds.length - 1; i >= 0; --i) {
				if (activeBurningSounds[i].stopTime <= audioCtx.currentTime) activeBurningSounds.splice(i, 1);
			}
		}, (requested + fade + 0.8) * 1000);
	} catch (e) {}
	try { if (typeof GameEvents !== 'undefined' && GameEvents.emit) GameEvents.emit('sound-effect', { name: 'burning' }); } catch (e) {}
}

function startFirestormBurning() {
	if (firestormBurningInstance) return;
	try {
		const now = audioCtx.currentTime;
		const loopLen = 0.6;

		function createPinkBuffer(lenSec) {
			const len = Math.floor(audioCtx.sampleRate * lenSec);
			const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
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
		}

		const bufA = createPinkBuffer(loopLen);
		const bufB = createPinkBuffer(loopLen);

		const filter = audioCtx.createBiquadFilter();
		filter.type = 'lowpass';
		filter.frequency.value = 420;
		filter.Q.value = 0.7;

		const masterGainNode = audioCtx.createGain();
		masterGainNode.gain.value = 0.05 * masterVolume * sfxVolume * burningVolume;

		filter.connect(masterGainNode).connect(audioCtx.destination);

		const srcA = audioCtx.createBufferSource();
		srcA.buffer = bufA;
		srcA.loop = true;
		const srcB = audioCtx.createBufferSource();
		srcB.buffer = bufB;
		srcB.loop = true;

		const gainA = audioCtx.createGain();
		const gainB = audioCtx.createGain();
		gainA.gain.value = 0.9;
		gainB.gain.value = 0.9;

		srcA.connect(gainA).connect(filter);
		srcB.connect(gainB).connect(filter);

		const startA = now + 0.01;
		const jitter = Math.random() * 0.08;
		const startB = now + loopLen / 2 + jitter + 0.01;
		srcA.start(startA);
		srcB.start(startB);

		function scheduleGainAutomation(gNode, sTime) {
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
		}

		scheduleGainAutomation(gainA, startA);
		scheduleGainAutomation(gainB, startB);

		firestormBurningInstance = { srcA, srcB, masterGain: masterGainNode, startTime: now };
	} catch (e) {}
}

function stopFirestormBurning() {
	if (!firestormBurningInstance) return;
	try {
		const now = audioCtx.currentTime;
		const fade = 0.3;
		const stopTime = now + fade;
		firestormBurningInstance.masterGain.gain.cancelScheduledValues(now);
		firestormBurningInstance.masterGain.gain.setValueAtTime(firestormBurningInstance.masterGain.gain.value, now);
		firestormBurningInstance.masterGain.gain.setTargetAtTime(0.00001, now + 0.01, 0.06);
		firestormBurningInstance.srcA.stop(stopTime);
		firestormBurningInstance.srcB.stop(stopTime);
	} catch (e) {}
	firestormBurningInstance = null;
}

Object.defineProperty(window, 'masterVolume', {
	get() { return masterVolume; },
	set(value) { masterVolume = value; },
	configurable: true
});
Object.defineProperty(window, 'musicVolume', {
	get() { return musicVolume; },
	set(value) { musicVolume = value; },
	configurable: true
});
Object.defineProperty(window, 'sfxVolume', {
	get() { return sfxVolume; },
	set(value) { sfxVolume = value; },
	configurable: true
});
Object.defineProperty(window, 'shotVolume', {
	get() { return shotVolume; },
	set(value) { shotVolume = value; },
	configurable: true
});
Object.defineProperty(window, 'explosionVolume', {
	get() { return explosionVolume; },
	set(value) { explosionVolume = value; },
	configurable: true
});
Object.defineProperty(window, 'ricochetVolume', {
	get() { return ricochetVolume; },
	set(value) { ricochetVolume = value; },
	configurable: true
});
Object.defineProperty(window, 'hitVolume', {
	get() { return hitVolume; },
	set(value) { hitVolume = value; },
	configurable: true
});
Object.defineProperty(window, 'impactVolume', {
	get() { return impactVolume; },
	set(value) { impactVolume = value; },
	configurable: true
});
Object.defineProperty(window, 'dashVolume', {
	get() { return dashVolume; },
	set(value) { dashVolume = value; },
	configurable: true
});
Object.defineProperty(window, 'burningVolume', {
	get() { return burningVolume; },
	set(value) { burningVolume = value; },
	configurable: true
});

window.playGunShot = playGunShot;
window.playExplosion = playExplosion;
window.playSoftPoof = playSoftPoof;
window.playHit = playHit;
window.playRicochet = playRicochet;
window.playImpact = playImpact;
window.playDashWoosh = playDashWoosh;
window.playBurning = playBurning;
window.startFirestormBurning = startFirestormBurning;
window.stopFirestormBurning = stopFirestormBurning;

