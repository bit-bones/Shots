function draw() {
	ctx.clearRect(0, 0, window.CANVAS_W, CANVAS_H);
	if (MAP_BORDER) {
		ctx.save();
		ctx.strokeStyle = '#3d4550';
		ctx.lineWidth = 6;
		ctx.globalAlpha = 0.55;
		ctx.strokeRect(3, 3, window.CANVAS_W-6, CANVAS_H-6);
		ctx.restore();
	}
	for (let o of obstacles) o.draw(ctx);
	if (healerPendingRespawn && healerPreSpawnPos) {
		const remaining = Math.max(0, (healerRespawnDelay || 0) - healerRespawnTimer);
		if (remaining <= 2) {
			const now = performance.now();
			const pulse = 0.8 + 0.2 * Math.sin(now / 250);
			ctx.save();
			ctx.globalCompositeOperation = 'lighter';
			const radius = 56 + 10 * Math.sin(now / 300);
			const grad = ctx.createRadialGradient(healerPreSpawnPos.x, healerPreSpawnPos.y, 8, healerPreSpawnPos.x, healerPreSpawnPos.y, radius);
			grad.addColorStop(0, `rgba(76,255,122,${0.42 * pulse})`);
			grad.addColorStop(0.7, `rgba(76,255,122,${0.16 * pulse})`);
			grad.addColorStop(1, 'rgba(76,255,122,0)');
			ctx.fillStyle = grad;
			ctx.beginPath();
			ctx.arc(healerPreSpawnPos.x, healerPreSpawnPos.y, radius, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}
	}
	if (firestormPreSpawnPos) {
		const now = performance.now();
		const pulse = 0.8 + 0.2 * Math.sin(now / 200);
		ctx.save();
		ctx.globalCompositeOperation = 'lighter';
		const radius = firestormPreSpawnPos.radius * 0.6 + 16 * Math.sin(now / 280);
		const grad = ctx.createRadialGradient(firestormPreSpawnPos.x, firestormPreSpawnPos.y, 12, firestormPreSpawnPos.x, firestormPreSpawnPos.y, radius);
		grad.addColorStop(0, `rgba(255,100,50,${0.45 * pulse})`);
		grad.addColorStop(0.6, `rgba(255,150,80,${0.18 * pulse})`);
		grad.addColorStop(1, 'rgba(255,100,50,0)');
		ctx.fillStyle = grad;
		ctx.beginPath();
		ctx.arc(firestormPreSpawnPos.x, firestormPreSpawnPos.y, radius, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}
	if (healersActive) {
		for (const healer of healers) {
			if (!healer || !healer.active) continue;
			healer.draw(ctx);
		}
	}
	for (let b of bullets) {
		ctx.save();
		if (b.trail && b.trail.length > 1) {
			for (let i = 0; i < b.trail.length - 1; ++i) {
				const t = b.trail[i];
				const tnorm = i / Math.max(1, b.trail.length);
				const alpha = (0.01 + 0.075 * tnorm) * (b.trailAlphaScale || 1);
				ctx.globalAlpha = Math.min(1, alpha);
				ctx.fillStyle = b.owner.color;
				let size = b.radius * (0.08 + 0.5 * tnorm) * (b.trailSizeScale || 1);
				const maxTrailSize = b.radius * 1.25;
				if (size > maxTrailSize) size = maxTrailSize;
				ctx.beginPath();
				ctx.arc(t.x, t.y, size, 0, Math.PI * 2);
				ctx.fill();
			}
		}
		ctx.globalAlpha = 0.78;
		ctx.fillStyle = b.owner.color;
		ctx.beginPath();
		ctx.arc(b.x, b.y, b.radius, 0, Math.PI*2);
		ctx.fill();
		if (b.fireshot) {
			for (let i = 0; i < 4; ++i) {
				let ang = Math.random() * Math.PI * 2;
				let dist = b.radius * (0.7 + Math.random() * 0.6);
				let px = b.x + Math.cos(ang) * dist;
				let py = b.y + Math.sin(ang) * dist;
				ctx.globalAlpha = 0.32 + Math.random() * 0.18;
				ctx.beginPath();
				ctx.arc(px, py, 2.2 + Math.random() * 2.2, 0, Math.PI*2);
				ctx.fillStyle = `rgba(255,${180+Math.floor(Math.random()*60)},40,0.85)`;
				ctx.shadowColor = '#ffb347';
				ctx.shadowBlur = 8;
				ctx.fill();
				ctx.shadowBlur = 0;
			}
			ctx.globalAlpha = 0.78;
		}
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
	if (impactLines && impactLines.length) {
		for (let i = impactLines.length - 1; i >= 0; --i) {
			const it = impactLines[i];
			it.t += 1/60;
			if (it.t >= it.life) { impactLines.splice(i, 1); continue; }
			const prog = it.t / it.life;
			const px = it.x + it.vx * prog * 0.35;
			const py = it.y + it.vy * prog * 0.35;
			const lx = it.x + it.vx * (prog * 0.02 + 0.02);
			const ly = it.y + it.vy * (prog * 0.02 + 0.02);
			ctx.save();
			ctx.globalAlpha = (1 - prog) * (it.alphaScale || 1);
			ctx.strokeStyle = it.color || '#ffd966';
			ctx.lineWidth = it.width || 2;
			ctx.beginPath();
			ctx.moveTo(px, py);
			ctx.lineTo(lx, ly);
			ctx.stroke();
			ctx.restore();
		}
	}
	for (let e of explosions) e.draw(ctx);
	for (let ic of infestedChunks) {
		ic.draw(ctx);
	}
	if (firestormInstance) {
		firestormInstance.draw(ctx);
	}
	const enemySuppressedNow = isEnemySuppressedForGameplay();
	const playerIsActive = isEntityActive(player);
	const enemyIsActive = isEntityActive(enemy);
	if (typeof player !== 'undefined' && player) {
		const hostIsWMNow_A = NET.connected && worldMasterEnabled && ((((worldMasterPlayerIndex|0) === 0)) || (NET.role === 'host' && window.localPlayerIndex === -1));
		const hidePlayerBlue = hostIsWMNow_A && worldMasterEnabled && enemySuppressedNow && (NET.role === 'host');
		if (!hidePlayerBlue && playerIsActive) drawPlayer(player);
	}
	const hostIsWM = NET.connected && worldMasterEnabled && (worldMasterPlayerIndex === 0);
	const joinerIsWM = NET.connected && worldMasterEnabled && (worldMasterPlayerIndex === 1);
	const hideBlueChar = hostIsWM && enemySuppressedNow;
	const hideRedChar = joinerIsWM && enemySuppressedNow;
	if (!((NET.role === 'host' && hideRedChar) || (NET.role === 'joiner' && hideBlueChar))) {
		if (typeof enemy !== 'undefined' && enemy && enemyIsActive) drawPlayer(enemy);
	}
	try {
		if (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.getFighters === 'function') {
			const fighters = playerRoster.getFighters({ includeUnassigned: false, includeEntity: true }) || [];
			for (const f of fighters) {
				if (!f || !f.entity) continue;
				const ent = f.entity;
				if (ent === player || ent === enemy) continue;
				if (f.metadata && f.metadata.isWorldMaster) continue;
				if (f.isAlive === false) continue;
				if (!isEntityActive(ent)) continue;
				try { drawPlayer(ent); } catch (e) {}
			}
		}
	} catch (e) {}

	function drawMatchScoreboard() {
		try {
			ctx.save();
			ctx.font = "bold 22px sans-serif";
			const useRoster = (typeof playerRoster !== 'undefined' && playerRoster && typeof playerRoster.getSlots === 'function');
			if (!useRoster) {
				const pName = (player && (player.displayName || NET.myName)) || (NET.myName || 'Player 1');
				const eName = (enemy && (enemy.displayName)) || (NET.peerName || 'Shot bot');
				ctx.fillStyle = "#65c6ff";
				ctx.fillText(pName + ": " + ((player && typeof player.score === 'number') ? player.score : '0'), 24, 34);
				ctx.fillStyle = "#ff5a5a";
				if (enemy) ctx.fillText(eName + ": " + ((enemy && typeof enemy.score === 'number') ? enemy.score : '0'), window.CANVAS_W - 220, 34);
				ctx.restore();
				return;
			}

			const slots = playerRoster.getSlots({ includeDetails: true }) || [];
			const positions = [
				{ x: 24, y: 34, align: 'left' },
				{ x: window.CANVAS_W - 220, y: 34, align: 'right' },
				{ x: 24, y: window.CANVAS_H - 12, align: 'left' },
				{ x: window.CANVAS_W - 220, y: window.CANVAS_H - 12, align: 'right' }
			];

			for (let i = 0; i < Math.min(4, slots.length); ++i) {
				const slot = slots[i] || {};
				const fighter = slot.fighter || null;
				if (!fighter) continue;
				if (fighter.metadata && fighter.metadata.isWorldMaster) continue;
				const pos = positions[i];
				const name = fighter.displayName || fighter.name || (`Slot ${i+1}`);
				const score = (typeof fighter.score === 'number') ? fighter.score : 0;
				const color = (typeof getRosterFighterColor === 'function') ? (getRosterFighterColor(i, fighter) || '#fff') : '#fff';
				ctx.fillStyle = color;
				if (pos.align === 'right') {
					ctx.textAlign = 'right';
					ctx.fillText(name + ": " + score, pos.x, pos.y);
					ctx.textAlign = 'left';
				} else {
					ctx.textAlign = 'left';
					ctx.fillText(name + ": " + score, pos.x, pos.y);
				}
			}
			ctx.restore();
		} catch (err) {
			try { ctx.restore(); } catch (e) {}
		}
	}

	drawMatchScoreboard();
	drawCardsUI();
}

function drawPlayer(p) {
	try {
		if (p && typeof p.draw === 'function') {
			p.draw(ctx);
		}
	} catch (e) {}

	ctx.save();
	let shakeX = 0, shakeY = 0;
	if (p.shakeTime > 0) {
		let mag = p.shakeMag * (p.shakeTime / 0.18);
		shakeX = rand(-mag, mag);
		shakeY = rand(-mag, mag);
	}
	let cdFrac = Math.min(1, p.timeSinceShot / p.shootInterval);
	if (cdFrac < 1) {
		ctx.save();
		ctx.beginPath();
		ctx.arc(p.x + shakeX, p.y + shakeY, p.radius + 7, -Math.PI/2, -Math.PI/2 + Math.PI*2*cdFrac, false);
		ctx.strokeStyle = p.color;
		ctx.globalAlpha = 0.48;
		ctx.lineWidth = 4.2;
		ctx.shadowColor = p.color;
		ctx.shadowBlur = 2;
		ctx.stroke();
		ctx.globalAlpha = 1;
		ctx.shadowBlur = 0;
		ctx.beginPath();
		ctx.arc(p.x + shakeX, p.y + shakeY, p.radius + 7, -Math.PI/2, -Math.PI/2 + Math.PI*2*cdFrac, false);
		ctx.strokeStyle = "#222";
		ctx.lineWidth = 2.5;
		ctx.stroke();
		ctx.restore();
	}

	try {
		let dashSet = getDashSettings(p);
		let ringFrac = null;
		let ringColor = '#ffd86b';
		let ringGlow = '#ffd86b';
		let ringAlpha = 0.62;
		const isTele = isTeledashEnabled(p);
		if (isTele && p.teledashWarmupActive && (dashSet.warmup || 0) > 0) {
			const warmupTotal = Math.max(0.001, p.teledashWarmupTime || dashSet.warmup || 0);
			ringFrac = clamp((p.teledashWarmupElapsed || 0) / warmupTotal, 0, 1);
			ringColor = 'rgba(200,220,255,0.9)';
			ringGlow = 'rgba(200,220,255,0.9)';
			ringAlpha = 0.62;
		} else if ((dashSet.cooldown || 0) > 0 && p.dashCooldown > 0) {
			const maxCd = (typeof p.dashCooldownMax === 'number' && p.dashCooldownMax > 0) ? p.dashCooldownMax : dashSet.cooldown;
			ringFrac = 1 - clamp(p.dashCooldown / maxCd, 0, 1);
		}
		if (ringFrac !== null && ringFrac > 0) {
			ctx.save();
			ctx.beginPath();
			ctx.arc(p.x + shakeX, p.y + shakeY, p.radius + 13, -Math.PI/2, -Math.PI/2 + Math.PI*2*ringFrac, false);
			ctx.strokeStyle = ringColor;
			ctx.globalAlpha = ringAlpha;
			ctx.lineWidth = 3.6;
			ctx.shadowColor = ringGlow;
			ctx.shadowBlur = ringColor === '#6ecbff' ? 7 : 6;
			ctx.stroke();
			ctx.restore();
		}
	} catch (e) {}
	ctx.globalAlpha = 1;
	ctx.shadowBlur = 0;
	ctx.strokeStyle = "#222";
	ctx.lineWidth = 2.5;
	ctx.stroke();
	const healthBarBaseW = 54;
	let w = Math.max(18, healthBarBaseW * Math.sqrt((p.healthMax || window.HEALTH_MAX) / window.HEALTH_MAX));
	let h = 10;
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

window.draw = draw;
window.drawPlayer = drawPlayer;
