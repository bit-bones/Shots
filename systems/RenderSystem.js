/**
 * RenderSystem - Handles all rendering
 */
class RenderSystem {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.showTrails = true;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawBackground() {
        // Background is handled by canvas CSS
    }

    drawMapBorder(enabled) {
        if (!enabled) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = '#3d4550';
        ctx.lineWidth = 6;
        ctx.globalAlpha = 0.55;
        ctx.strokeRect(3, 3, this.canvas.width - 6, this.canvas.height - 6);
        ctx.restore();
    }

    drawObstacles(obstacles) {
        for (let o of obstacles) {
            if (!o.destroyed) {
                o.draw(this.ctx);
            }
        }
    }

    drawFighters(fighters) {
        for (let f of fighters) {
            // Draw alive fighters and dying fighters (during death animation)
            if (f && (f.alive || f.dying || f.isDowned)) {
                f.draw(this.ctx);
            }
        }
    }

    drawBullets(bullets) {
        for (let b of bullets) {
            if (!b.active) continue;
            
            this.ctx.save();
            
            // Draw particle trail (exact match to original)
            if (b.trail && b.trail.length > 1) {
                for (let i = 0; i < b.trail.length - 1; ++i) {
                    const t = b.trail[i];
                    const tnorm = i / Math.max(1, b.trail.length);
                    const alpha = (0.01 + 0.075 * tnorm) * (b.trailAlphaScale || 1);
                    this.ctx.globalAlpha = Math.min(1, alpha);
                    this.ctx.fillStyle = b.owner.color;
                    let size = b.radius * (0.08 + 0.5 * tnorm) * (b.trailSizeScale || 1);
                    const maxTrailSize = b.radius * 1.25;
                    if (size > maxTrailSize) size = maxTrailSize;
                    this.ctx.beginPath();
                    this.ctx.arc(t.x, t.y, size, 0, Math.PI * 2);
                    this.ctx.fill();
                }
            }
            
            // Draw bullet
            this.ctx.globalAlpha = 0.78;
            this.ctx.fillStyle = b.owner.color;
            this.ctx.beginPath();
            this.ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Draw fireshot particles
            if (b.fireshot) {
                for (let i = 0; i < 4; ++i) {
                    let ang = Math.random() * Math.PI * 2;
                    let dist = b.radius * (0.7 + Math.random() * 0.6);
                    let px = b.x + Math.cos(ang) * dist;
                    let py = b.y + Math.sin(ang) * dist;
                    this.ctx.globalAlpha = 0.32 + Math.random() * 0.18;
                    this.ctx.beginPath();
                    this.ctx.arc(px, py, 2.2 + Math.random() * 2.2, 0, Math.PI*2);
                    this.ctx.fillStyle = `rgba(255,${180+Math.floor(Math.random()*60)},40,0.85)`;
                    this.ctx.shadowColor = '#ffb347';
                    this.ctx.shadowBlur = 8;
                    this.ctx.fill();
                    this.ctx.shadowBlur = 0;
                }
                this.ctx.globalAlpha = 0.78;
            }
            
            // Draw explosive glow
            if (b.explosive) {
                this.ctx.globalAlpha = 0.38;
                this.ctx.shadowColor = '#fff';
                this.ctx.shadowBlur = 18;
                this.ctx.beginPath();
                this.ctx.arc(b.x, b.y, b.radius * 1.88, 0, Math.PI * 2);
                this.ctx.fillStyle = '#fff';
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
            }
            this.ctx.restore();
        }
        
        this.ctx.restore();
    }

    drawImpactLines(impactLines) {
        if (!impactLines || !impactLines.length) return;

        for (let i = 0; i < impactLines.length; i += 1) {
            const it = impactLines[i];
            if (!it) continue;

            const life = (typeof it.life === 'number' && it.life > 0.0001) ? it.life : 0.0001;
            const elapsed = Math.max(0, Math.min(it.t || 0, life));
            const prog = elapsed / life;
            const px = (it.x || 0) + (it.vx || 0) * prog * 0.35;
            const py = (it.y || 0) + (it.vy || 0) * prog * 0.35;
            const lx = (it.x || 0) + (it.vx || 0) * (prog * 0.02 + 0.02);
            const ly = (it.y || 0) + (it.vy || 0) * (prog * 0.02 + 0.02);

            this.ctx.save();
            const alpha = (1 - prog) * (it.alphaScale || 1);
            this.ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
            this.ctx.strokeStyle = it.color || '#ffd966';
            this.ctx.lineWidth = it.width || 2;
            this.ctx.beginPath();
            this.ctx.moveTo(px, py);
            this.ctx.lineTo(lx, ly);
            this.ctx.stroke();
            this.ctx.restore();
        }
    }

    drawExplosions(explosions) {
        for (let e of explosions) {
            if (!e.done) {
                e.draw(this.ctx);
            }
        }
    }

    drawFirestorms(firestorms) {
        for (let f of firestorms) {
            if (!f.done) {
                f.draw(this.ctx);
            }
        }
    }

    drawFirestormPreSpawn(cardSystem) {
        if (!cardSystem.firestormPreSpawnPos) return;
        
        const now = performance.now();
        const pulse = 0.8 + 0.2 * Math.sin(now / 200);
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'lighter';
        const radius = cardSystem.firestormPreSpawnPos.radius * 0.6 + 16 * Math.sin(now / 280);
        const grad = this.ctx.createRadialGradient(
            cardSystem.firestormPreSpawnPos.x, 
            cardSystem.firestormPreSpawnPos.y, 
            12, 
            cardSystem.firestormPreSpawnPos.x, 
            cardSystem.firestormPreSpawnPos.y, 
            radius
        );
        grad.addColorStop(0, `rgba(255,100,50,${0.45 * pulse})`);
        grad.addColorStop(0.6, `rgba(255,150,80,${0.18 * pulse})`);
        grad.addColorStop(1, 'rgba(255,100,50,0)');
        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.arc(cardSystem.firestormPreSpawnPos.x, cardSystem.firestormPreSpawnPos.y, radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
    }

    drawHealerPreSpawn(cardSystem) {
        const telegraph = cardSystem.healerPreSpawnPos;
        if (!telegraph || typeof telegraph.x !== 'number' || typeof telegraph.y !== 'number') return;

        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const rawProgress = typeof telegraph.progress === 'number' ? telegraph.progress : 0;
        const progress = Math.max(0, Math.min(1, rawProgress));
        const eased = 1 - Math.pow(1 - progress, 1.45);

        const baseRadius = telegraph.radius || 44;
        const pulse = 0.78 + 0.22 * Math.sin(now / 180);
        const outerRadius = Math.max(38, baseRadius * (0.9 + 0.18 * pulse));
        const innerRadius = Math.max(18, baseRadius * 0.42);
        const alpha = 0.58 + 0.34 * eased;

        this.ctx.save();
        this.ctx.globalCompositeOperation = 'lighter';

        const grad = this.ctx.createRadialGradient(
            telegraph.x,
            telegraph.y,
            innerRadius * 0.45,
            telegraph.x,
            telegraph.y,
            outerRadius
        );
        grad.addColorStop(0, `rgba(150,255,195,${0.62 * alpha})`);
        grad.addColorStop(0.48, `rgba(110,230,170,${0.38 * alpha})`);
        grad.addColorStop(1, 'rgba(90,200,150,0)');

        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.arc(telegraph.x, telegraph.y, outerRadius, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.restore();
    }

    drawInfestedChunks(infestedChunks) {
        for (let chunk of infestedChunks) {
            if (!chunk.destroyed || chunk.flying) {
                chunk.draw(this.ctx);
            }
        }
    }

    drawLooseChunks(looseChunks) {
        for (let chunk of looseChunks) {
            if (!chunk.destroyed || chunk.flying) {
                chunk.draw(this.ctx);
            }
        }
    }
    
    drawHealers(healers) {
        for (let healer of healers) {
            if (healer.active) {
                healer.draw(this.ctx);
            }
        }
    }

    drawScoreboard(fighters, overrideEntries = null) {
        this.ctx.save();
        this.ctx.font = 'bold 22px sans-serif';

        // Define positions for all 4 corners
        const positions = [
            { x: 15, y: 34, align: 'left' },                    // Top-left
            { x: CANVAS_W - 50, y: 34, align: 'right' },       // Top-right
            { x: 15, y: CANVAS_H - 12, align: 'left' },         // Bottom-left
            { x: CANVAS_W - 50, y: CANVAS_H - 12, align: 'right' } // Bottom-right
        ];

        const entries = (Array.isArray(overrideEntries) && overrideEntries.length)
            ? overrideEntries
            : fighters.map((fighter, index) => {
                if (!fighter) return null;
                return {
                    id: fighter.id,
                    label: fighter.name || `Slot ${index + 1}`,
                    color: fighter.color,
                    score: typeof fighter.score === 'number' ? fighter.score : 0,
                    slotIndex: index
                };
            }).filter(Boolean);

        for (let i = 0; i < Math.min(positions.length, entries.length); i++) {
            const entry = entries[i];
            const pos = positions[i];
            this.ctx.fillStyle = entry.color || '#fff';
            this.ctx.textAlign = pos.align;
            const label = entry.label || `Slot ${((entry.slotIndex ?? i) + 1)}`;
            const scoreValue = typeof entry.score === 'number' ? entry.score : 0;
            this.ctx.fillText(`${label}: ${scoreValue}`, pos.x, pos.y);
        }

        this.ctx.restore();
    }

    drawRoundInfo(roundNum, totalRounds) {
        this.ctx.save();
        this.ctx.font = 'bold 22px sans-serif';
        this.ctx.textAlign = 'right';
        this.ctx.fillStyle = '#fff';
        this.ctx.fillText(`Round ${roundNum} / ${totalRounds}`, CANVAS_W - 24, CANVAS_H - 24);
        this.ctx.restore();
    }

    drawCardBadges(fighter, x, y) {
        if (!fighter.cards || fighter.cards.length === 0) return;
        
        this.ctx.save();
        this.ctx.font = 'bold 10px Arial';
        this.ctx.textAlign = 'center';
        
        let badgeX = x;
        for (let card of fighter.cards) {
            // Draw badge background
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(badgeX, y, 60, 20);
            
            // Draw badge border
            this.ctx.strokeStyle = fighter.color;
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(badgeX, y, 60, 20);
            
            // Draw card name (abbreviated)
            this.ctx.fillStyle = '#fff';
            let abbrev = card.substring(0, 8);
            this.ctx.fillText(abbrev, badgeX + 30, y + 14);
            
            badgeX += 65;
        }
        
        this.ctx.restore();
    }

    drawWorldModBadges(activeMods) {
        if (!activeMods || activeMods.length === 0) return;
        
        this.ctx.save();
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'center';
        
        let badgeY = CANVAS_H - 40;
        let badgeX = CANVAS_W / 2 - (activeMods.length * 110) / 2;
        
        for (let mod of activeMods) {
            // Draw badge background
            this.ctx.fillStyle = 'rgba(100, 50, 150, 0.8)';
            this.ctx.fillRect(badgeX, badgeY, 100, 30);
            
            // Draw badge border
            this.ctx.strokeStyle = '#d946ef';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(badgeX, badgeY, 100, 30);
            
            // Draw mod name
            this.ctx.fillStyle = '#fff';
            this.ctx.fillText(mod, badgeX + 50, badgeY + 20);
            
            badgeX += 110;
        }
        
        this.ctx.restore();
    }

    drawVictoryScreen(winner, allFighters) {
        this.ctx.save();
        
        // Darken screen
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        
        // Draw winner
        this.ctx.font = 'bold 48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = winner.color;
        this.ctx.fillText(`${winner.name} WINS!`, CANVAS_W / 2, CANVAS_H / 2 - 50);
        
        // Draw final scores
        this.ctx.font = 'bold 24px Arial';
        let y = CANVAS_H / 2 + 20;
        for (let f of allFighters) {
            this.ctx.fillStyle = f.color;
            this.ctx.fillText(`${f.name}: ${f.score}`, CANVAS_W / 2, y);
            y += 35;
        }
        
        // Draw restart prompt
        this.ctx.font = '20px Arial';
        this.ctx.fillStyle = '#aaa';
        this.ctx.fillText('Press ENTER to restart', CANVAS_W / 2, CANVAS_H - 50);
        
        this.ctx.restore();
    }

    render(gameState) {
        this.clear();
        this.drawBackground();
        
        if (gameState.obstacles) this.drawObstacles(gameState.obstacles);
        if (gameState.infestedChunks) this.drawInfestedChunks(gameState.infestedChunks);
        if (gameState.looseChunks) this.drawLooseChunks(gameState.looseChunks);
        if (gameState.firestorms) this.drawFirestorms(gameState.firestorms);
        if (gameState.cardSystem) {
            this.drawFirestormPreSpawn(gameState.cardSystem);
            this.drawHealerPreSpawn(gameState.cardSystem);
        }
        if (gameState.healers) this.drawHealers(gameState.healers);
        if (gameState.bullets) this.drawBullets(gameState.bullets);
        if (gameState.impactLines) this.drawImpactLines(gameState.impactLines);
        if (gameState.fighters) this.drawFighters(gameState.fighters);
        if (gameState.explosions) this.drawExplosions(gameState.explosions);

        if (gameState.mapBorder) {
            this.drawMapBorder(true);
        }
        
        if (gameState.fighters && gameState.showScoreboard) {
            this.drawScoreboard(gameState.fighters, gameState.scoreboardEntries || null);
        }
        
        // World modifier badges are rendered in the DOM (bottom bar).
        // Removed canvas rendering to avoid duplicate badge display.
        
        if (gameState.winner) {
            this.drawVictoryScreen(gameState.winner, gameState.fighters);
        }
    }
}

// Export to window
if (typeof window !== 'undefined') {
    window.RenderSystem = RenderSystem;
}
