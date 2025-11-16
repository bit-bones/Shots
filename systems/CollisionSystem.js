/**
 * CollisionSystem - Handles all collision detection
 */
class CollisionSystem {
    constructor() {
        this.audioManager = null;
        this.impactCallback = null;
    }

    setAudioManager(audioManager) {
        this.audioManager = audioManager;
    }

    setImpactCallback(callback) {
        this.impactCallback = (typeof callback === 'function') ? callback : null;
    }

    _computeObstacleCollision(bullet, obstacle) {
        if (!bullet || !obstacle) {
            return { collided: false };
        }

        const closestX = clamp(bullet.x, obstacle.x, obstacle.x + obstacle.w);
        const closestY = clamp(bullet.y, obstacle.y, obstacle.y + obstacle.h);
        const dx = bullet.x - closestX;
        const dy = bullet.y - closestY;
        const distSq = dx * dx + dy * dy;
        const radiusSq = bullet.radius * bullet.radius;

        if (distSq > radiusSq) {
            return { collided: false };
        }

        let nx = 0;
        let ny = 0;
        let penetration = 0;

        const dist = Math.sqrt(Math.max(0, distSq));
        if (dist > 0.0001) {
            nx = dx / dist;
            ny = dy / dist;
            penetration = bullet.radius - dist;
        } else {
            const toLeft = bullet.x - obstacle.x;
            const toRight = (obstacle.x + obstacle.w) - bullet.x;
            const toTop = bullet.y - obstacle.y;
            const toBottom = (obstacle.y + obstacle.h) - bullet.y;
            let min = toLeft;
            let dir = 'left';
            if (toRight < min) { min = toRight; dir = 'right'; }
            if (toTop < min) { min = toTop; dir = 'top'; }
            if (toBottom < min) { min = toBottom; dir = 'bottom'; }

            switch (dir) {
                case 'left':
                    nx = -1; ny = 0; break;
                case 'right':
                    nx = 1; ny = 0; break;
                case 'top':
                    nx = 0; ny = -1; break;
                default:
                    nx = 0; ny = 1; break;
            }

            penetration = bullet.radius - Math.max(0, min);
        }

        if (!Number.isFinite(penetration) || penetration < 0) {
            penetration = bullet.radius * 0.25;
        }

        return {
            collided: true,
            closestX,
            closestY,
            nx,
            ny,
            penetration: Math.max(0, penetration)
        };
    }

    _pushBulletForward(bullet, distance) {
        if (!bullet) return;
        const dirX = Math.cos(bullet.angle);
        const dirY = Math.sin(bullet.angle);
        const step = Math.max(0.5, typeof distance === 'number' && Number.isFinite(distance) ? distance : bullet.radius + 2);
        bullet.x += dirX * step;
        bullet.y += dirY * step;
        bullet.prevX = bullet.x;
        bullet.prevY = bullet.y;
    }

    _advanceBulletThroughObstacle(bullet, collision) {
        if (!bullet) return;
        const extra = (collision && Number.isFinite(collision.penetration) ? collision.penetration : 0) + bullet.radius * 0.6 + 2;
        this._pushBulletForward(bullet, extra);
    }

    _tryRicochet(bullet, collision) {
        if (!bullet || (bullet.bouncesLeft | 0) <= 0 || !collision || !collision.collided) {
            return false;
        }

        const nx = Number.isFinite(collision.nx) ? collision.nx : 0;
        const ny = Number.isFinite(collision.ny) ? collision.ny : 0;
        const vx = Math.cos(bullet.angle);
        const vy = Math.sin(bullet.angle);
        const dot = vx * nx + vy * ny;
        const rx = vx - 2 * dot * nx;
        const ry = vy - 2 * dot * ny;
        bullet.angle = Math.atan2(ry, rx);

        const separation = Math.max(0.5, (collision.penetration || 0) + bullet.radius * 0.15 + 0.75);
        bullet.x += nx * separation;
        bullet.y += ny * separation;
        bullet.prevX = bullet.x;
        bullet.prevY = bullet.y;

        bullet.bouncesLeft = Math.max(0, (bullet.bouncesLeft | 0) - 1);
        if (bullet.shotController) {
            bullet.playerControlActive = false;
        }

        return true;
    }

    // Check bullet vs fighter collisions
    checkBulletFighterCollisions(bullets, fighters, explosions) {
        for (let b of bullets) {
            if (!b.active) continue;
            
            for (let f of fighters) {
                if (!f.alive || f === b.owner) continue;
                if (b.hitFighters && f.id != null && b.hitFighters[f.id]) continue;
                
                if (dist(b.x, b.y, f.x, f.y) < b.radius + f.radius) {
                    // Hit!
                    if (b.hitFighters && f.id != null) {
                        b.hitFighters[f.id] = true;
                    }
                    f._lastAttacker = b.owner; // Set attacker for life steal
                    f.takeDamage(b.damage, 'bullet', b.x, b.y);
                    if (this.audioManager) {
                        this.audioManager.playHit();
                    }

                    if (b.fireshot && typeof f.applyFireShotBurn === 'function') {
                        const stacks = Math.max(1, b.fireshotStacks || (b.owner && b.owner.fireshotStacks) || 1);
                        f.applyFireShotBurn(b.owner, stacks);
                    }
                    
                    // Create explosion if explosive
                    if (b.explosive) {
                        explosions.push(new Explosion(
                            b.x, b.y,
                            EXPLOSION_BASE_RADIUS,
                            b.owner.color,
                            b.damage * 0.5,
                            b.owner,
                            b.obliterator,
                            b.fireshot
                        ));
                        if (this.audioManager) {
                            this.audioManager.playExplosion();
                        }
                    }
                    
                    // Deactivate bullet if not piercing
                    if (!b.pierce) {
                        b.active = false;
                    } else if (b.pierceRemaining > 0) {
                        b.pierceRemaining--;
                        this._pushBulletForward(b, b.radius * 1.2 + 4);
                    } else {
                        b.active = false;
                    }
                    
                    break; // Only hit one fighter per bullet per frame
                }
            }
        }
    }

    // Check bullet vs obstacle collisions
    checkBulletObstacleCollisions(bullets, obstacles, explosions) {
        for (let b of bullets) {
            if (!b.active) continue;

            for (let o of obstacles) {
                if (!o || o.destroyed) continue;

                const collision = this._computeObstacleCollision(b, o);
                if (!collision.collided) continue;

                const ownerStacks = (b.owner && b.owner.obliteratorStacks) ? b.owner.obliteratorStacks : 0;
                const powerMul = 1 + 0.35 * ownerStacks;
                const power = (b.damage / 18) * powerMul;
                const fireStacks = b.fireshot ? Math.max(1, b.fireshotStacks || (b.owner && b.owner.fireshotStacks) || 1) : 0;

                const hit = o.chipChunksAt(b.x, b.y, b.radius * 1.8, power, b.obliterator, false, fireStacks);

                if (b.pierce && b.pierceRemaining > 0) {
                    b.pierceRemaining--;
                    this._advanceBulletThroughObstacle(b, collision);
                    continue;
                }

                if (this._tryRicochet(b, collision)) {
                    if (this.audioManager) {
                        this.audioManager.playRicochet();
                    }
                    break;
                }

                if (b.explosive) {
                    explosions.push(new Explosion(
                        b.x,
                        b.y,
                        EXPLOSION_BASE_RADIUS,
                        b.owner ? b.owner.color : '#ffffff',
                        b.damage * 0.5,
                        b.owner,
                        b.obliterator,
                        b.fireshot
                    ));
                    if (this.audioManager) {
                        this.audioManager.playExplosion();
                    }
                }

                if (this.impactCallback) {
                    const nx = Number.isFinite(collision.nx) ? collision.nx : 0;
                    const ny = Number.isFinite(collision.ny) ? collision.ny : 0;
                    const baseAngle = (nx !== 0 || ny !== 0) ? Math.atan2(ny, nx) : null;
                    this.impactCallback(b.x, b.y, b.damage || 1, b.owner ? b.owner.color : '#ffffff', baseAngle);
                }

                if (this.audioManager) {
                    this.audioManager.playImpact(b.damage || 1);
                }

                b.active = false;
                break;
            }
        }
    }

    // Check fighter vs obstacle collisions
    checkFighterObstacleCollisions(fighters, obstacles) {
        for (let f of fighters) {
            if (!f.alive) continue;
            
            for (let o of obstacles) {
                if (o.destroyed) continue;
                
                if (o.circleCollide(f.x, f.y, f.radius)) {
                    // Push fighter out of obstacle
                    let obstacleCenter = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
                    let angle = Math.atan2(f.y - obstacleCenter.y, f.x - obstacleCenter.x);
                    
                    // Find closest edge
                    let closestX = clamp(f.x, o.x, o.x + o.w);
                    let closestY = clamp(f.y, o.y, o.y + o.h);
                    let distToEdge = dist(f.x, f.y, closestX, closestY);
                    let overlap = f.radius - distToEdge;
                    
                    if (overlap > 0) {
                        f.x += Math.cos(angle) * (overlap + 1);
                        f.y += Math.sin(angle) * (overlap + 1);
                        
                        // Keep in bounds
                        f.x = clamp(f.x, f.radius, CANVAS_W - f.radius);
                        f.y = clamp(f.y, f.radius, CANVAS_H - f.radius);
                    }
                    
                    // Ram damage if dashing
                    if (f.dashActive && f.ramActive) {
                        let ramDamage = getDashSettings(f).ramDamage || 0;
                        if (ramDamage > 0) {
                            o.chipChunksAt(f.x, f.y, f.radius * 2, ramDamage / 18, false, false);
                        }
                    }
                }
            }
        }
    }

    // Check dash collisions (fighter vs fighter)
    checkDashCollisions(fighters, obstacles = []) {
        for (let f of fighters) {
            if (!f.alive || !f.dashActive) continue;
            
            for (let other of fighters) {
                if (!other.alive || other === f) continue;
                
                if (dist(f.x, f.y, other.x, other.y) < f.radius + other.radius) {
                    // Collision!
                    const dashSettings = getDashSettings(f);
                    const ramDamage = dashSettings.ramDamage || 0;

                    if (ramDamage > 0 && f.ramActive && typeof f._applyRamImpact === 'function') {
                        f._applyRamImpact([other], dashSettings, f.dashAngle || 0, { obstacles });
                        f.ramActive = false;
                        f.dashActive = false;
                        f.dashDistanceRemaining = 0;
                    } else {
                        // Push apart
                        const angle = Math.atan2(other.y - f.y, other.x - f.x);
                        const overlap = (f.radius + other.radius) - dist(f.x, f.y, other.x, other.y);
                        other.x += Math.cos(angle) * overlap;
                        other.y += Math.sin(angle) * overlap;
                        // Keep in bounds
                        other.x = clamp(other.x, other.radius, CANVAS_W - other.radius);
                        other.y = clamp(other.y, other.radius, CANVAS_H - other.radius);
                        f.dashActive = false;
                        f.dashDistanceRemaining = 0;
                        f.ramActive = false;
                    }
                }
            }
        }
    }

    // Check bullet vs healer collisions
    checkBulletHealerCollisions(bullets, healers, explosions) {
        if (!Array.isArray(healers)) return;
        for (let b of bullets) {
            if (!b.active) continue;

            for (let h of healers) {
                if (!h.active || h.dying) continue;
                if (b.owner === h) continue;

                if (dist(b.x, b.y, h.x, h.y) < b.radius + h.radius) {
                    // Hit healer
                    h._lastAttacker = b.owner;
                    h.takeDamage(b.damage, b.owner);
                    if (this.audioManager) this.audioManager.playHit();

                    if (b.fireshot && typeof h.ignite === 'function') {
                        const stacks = Math.max(1, b.fireshotStacks || (b.owner && b.owner.fireshotStacks) || 1);
                        h.ignite(b.owner, stacks);
                    }

                    if (b.explosive) {
                        explosions.push(new Explosion(
                            b.x, b.y,
                            EXPLOSION_BASE_RADIUS,
                            b.owner ? b.owner.color : '#ffffff',
                            b.damage * 0.5,
                            b.owner,
                            b.obliterator,
                            b.fireshot
                        ));
                        if (this.audioManager) this.audioManager.playExplosion();
                    }

                    if (!b.pierce) {
                        b.active = false;
                    } else if (b.pierceRemaining > 0) {
                        b.pierceRemaining--;
                        this._pushBulletForward(b, b.radius * 1.1 + 4);
                    } else {
                        b.active = false;
                    }
                    break;
                }
            }
        }
    }

    // Check bullet vs infested chunk collisions
    checkBulletInfestedCollisions(bullets, infestedChunks, explosions) {
        for (let b of bullets) {
            if (!b.active) continue;
            
            for (let chunk of infestedChunks) {
                if (!chunk.active) continue;
                
                let ownerStacks = (b.owner && b.owner.obliteratorStacks) ? b.owner.obliteratorStacks : 0;
                let powerMul = 1 + 0.35 * ownerStacks;
                let power = (b.damage / 18) * powerMul;
                
                const fireStacks = b.fireshot ? Math.max(1, b.fireshotStacks || (b.owner && b.owner.fireshotStacks) || 1) : 0;
                let hit = chunk.chipAt(b.x, b.y, b.radius * 1.8, power, b.obliterator, false, fireStacks);
                
                if (hit) {
                    // Create explosion for infested chunk hit
                    explosions.push(new Explosion(
                        b.x, b.y,
                        EXPLOSION_BASE_RADIUS * 0.6, // Smaller explosion for chunk hits
                        "#8f4f8f", // Purple color for infested chunks
                        b.damage * 0.3,
                        b.owner,
                        b.obliterator,
                        b.fireshot
                    ));
                    if (this.audioManager) {
                        this.audioManager.playSoftPoof();
                    }

                    // Create explosion if explosive
                    if (b.explosive) {
                        explosions.push(new Explosion(
                            b.x, b.y,
                            EXPLOSION_BASE_RADIUS,
                            b.owner.color,
                            b.damage * 0.5,
                            b.owner,
                            b.obliterator,
                            b.fireshot
                        ));
                        if (this.audioManager) {
                            this.audioManager.playExplosion();
                        }
                    }
                    
                    // Deactivate bullet if not piercing
                    if (!b.pierce) {
                        b.active = false;
                        break;
                    }
                    if (b.pierceRemaining > 0) {
                        b.pierceRemaining--;
                        this._pushBulletForward(b, b.radius * 1.1 + 4);
                        continue;
                    }
                    b.active = false;
                    break;
                }
            }
        }
    }

    // Check bullet vs loose chunk collisions
    checkBulletLooseChunkCollisions(bullets, looseChunks, explosions) {
        for (let b of bullets) {
            if (!b.active) continue;
            
            for (let chunk of looseChunks) {
                if (chunk.destroyed) continue;
                
                let ownerStacks = (b.owner && b.owner.obliteratorStacks) ? b.owner.obliteratorStacks : 0;
                let powerMul = 1 + 0.35 * ownerStacks;
                let power = (b.damage / 18) * powerMul;
                
                const fireStacks = b.fireshot ? Math.max(1, b.fireshotStacks || (b.owner && b.owner.fireshotStacks) || 1) : 0;
                let hit = chunk.chipAt(b.x, b.y, b.radius * 1.8, power, b.obliterator, false, fireStacks);
                
                if (hit) {
                    // Create explosion if explosive
                    if (b.explosive) {
                        explosions.push(new Explosion(
                            b.x, b.y,
                            EXPLOSION_BASE_RADIUS,
                            b.owner.color,
                            b.damage * 0.5,
                            b.owner,
                            b.obliterator,
                            b.fireshot
                        ));
                        if (this.audioManager) {
                            this.audioManager.playExplosion();
                        }
                    }
                    
                    // Deactivate bullet if not piercing
                    if (!b.pierce) {
                        b.active = false;
                        break;
                    }
                    if (b.pierceRemaining > 0) {
                        b.pierceRemaining--;
                        this._pushBulletForward(b, b.radius * 1.1 + 4);
                        continue;
                    }
                    b.active = false;
                    break;
                }
            }
        }
    }

    // Check fighter vs loose chunk collisions
    checkFighterLooseChunkCollisions(fighters, looseChunks) {
        for (let f of fighters) {
            if (!f.alive) continue;
            
            for (let chunk of looseChunks) {
                if (chunk.destroyed) continue;
                
                if (chunk.circleCollide(f.x, f.y, f.radius)) {
                    // Push chunk away from fighter
                    let angle = Math.atan2(chunk.y + chunk.h/2 - f.y, chunk.x + chunk.w/2 - f.x);
                    let overlap = f.radius + Math.max(chunk.w, chunk.h)/2 - dist(f.x, f.y, chunk.x + chunk.w/2, chunk.y + chunk.h/2);
                    
                    if (overlap > 0) {
                        let pushForce = overlap * 200; // Adjust force as needed
                        chunk.applyForce(Math.cos(angle) * pushForce, Math.sin(angle) * pushForce);
                    }
                }
            }
        }
    }

    // Check loose chunk vs loose chunk collisions
    checkLooseChunkLooseChunkCollisions(looseChunks) {
        for (let i = 0; i < looseChunks.length; i++) {
            for (let j = i + 1; j < looseChunks.length; j++) {
                let chunk1 = looseChunks[i];
                let chunk2 = looseChunks[j];
                
                if (chunk1.destroyed || chunk2.destroyed) continue;
                
                if (chunk1.rectCollide(chunk2)) {
                    // Resolve collision by pushing them apart
                    let dx = (chunk2.x + chunk2.w/2) - (chunk1.x + chunk1.w/2);
                    let dy = (chunk2.y + chunk2.h/2) - (chunk1.y + chunk1.h/2);
                    let dist = Math.sqrt(dx * dx + dy * dy);
                    
                    if (dist > 0) {
                        let overlap = (Math.max(chunk1.w, chunk1.h) + Math.max(chunk2.w, chunk2.h)) / 2 - dist;
                        if (overlap > 0) {
                            let nx = dx / dist;
                            let ny = dy / dist;
                            let pushForce = overlap * 100; // Adjust force
                            
                            chunk1.applyForce(-nx * pushForce, -ny * pushForce);
                            chunk2.applyForce(nx * pushForce, ny * pushForce);
                        }
                    }
                }
            }
        }
    }

    // Check loose chunk vs obstacle collisions
    checkLooseChunkObstacleCollisions(looseChunks, obstacles) {
        for (let chunk of looseChunks) {
            if (chunk.destroyed) continue;
            
            for (let obstacle of obstacles) {
                if (obstacle.destroyed) continue;
                
                if (chunk.rectCollide(obstacle)) {
                    // Resolve collision by pushing chunk away from obstacle
                    let chunkCenterX = chunk.x + chunk.w/2;
                    let chunkCenterY = chunk.y + chunk.h/2;
                    let obstacleCenterX = obstacle.x + obstacle.w/2;
                    let obstacleCenterY = obstacle.y + obstacle.h/2;
                    
                    let dx = chunkCenterX - obstacleCenterX;
                    let dy = chunkCenterY - obstacleCenterY;
                    let dist = Math.sqrt(dx * dx + dy * dy);
                    
                    if (dist > 0) {
                        let nx = dx / dist;
                        let ny = dy / dist;
                        
                        // Calculate overlap
                        let closestX = clamp(chunkCenterX, obstacle.x, obstacle.x + obstacle.w);
                        let closestY = clamp(chunkCenterY, obstacle.y, obstacle.y + obstacle.h);
                        let distToEdge = Math.sqrt((chunkCenterX - closestX) ** 2 + (chunkCenterY - closestY) ** 2);
                        let chunkRadius = Math.max(chunk.w, chunk.h) / 2;
                        let overlap = chunkRadius - distToEdge;
                        
                        if (overlap > 0) {
                            let pushForce = overlap * 200; // Stronger force for obstacles
                            chunk.applyForce(nx * pushForce, ny * pushForce);
                        }
                    }
                }
            }
        }
    }

    // Check bullet vs border collisions
    checkBulletBorderCollisions(bullets, explosions) {
        for (let b of bullets) {
            if (!b.active) continue;

            let hit = false;
            let nx = 0, ny = 0;
            let penetration = b.radius * 0.25;

            if (b.x - b.radius < 0) {
                hit = true;
                nx = 1;
                ny = 0;
                penetration = b.radius - b.x;
            } else if (b.x + b.radius > CANVAS_W) {
                hit = true;
                nx = -1;
                ny = 0;
                penetration = b.radius - (CANVAS_W - b.x);
            } else if (b.y - b.radius < 0) {
                hit = true;
                nx = 0;
                ny = 1;
                penetration = b.radius - b.y;
            } else if (b.y + b.radius > CANVAS_H) {
                hit = true;
                nx = 0;
                ny = -1;
                penetration = b.radius - (CANVAS_H - b.y);
            }

            if (hit) {
                const collision = { collided: true, nx, ny, penetration: Math.max(0, penetration) };

                if (this._tryRicochet(b, collision)) {
                    if (this.audioManager) {
                        this.audioManager.playRicochet();
                    }
                    continue;
                }

                if (b.explosive) {
                    explosions.push(new Explosion(
                        b.x, b.y,
                        EXPLOSION_BASE_RADIUS,
                        b.owner ? b.owner.color : '#ffffff',
                        b.damage * 0.5,
                        b.owner,
                        b.obliterator,
                        b.fireshot
                    ));
                    if (this.audioManager) {
                        this.audioManager.playExplosion();
                    }
                }

                if (this.impactCallback) {
                    const baseAngle = Math.atan2(ny, nx);
                    this.impactCallback(b.x, b.y, b.damage || 1, b.owner ? b.owner.color : '#ffffff', baseAngle);
                }

                if (this.audioManager) {
                    this.audioManager.playImpact(b.damage || 1);
                }

                b.active = false;
            }
        }
    }

    // Update all collisions
    update(bullets, fighters, obstacles, explosions, healers = [], infestedChunks = [], looseChunks = []) {
        this.checkBulletFighterCollisions(bullets, fighters, explosions);
        this.checkBulletObstacleCollisions(bullets, obstacles, explosions);
        this.checkBulletBorderCollisions(bullets, explosions);
        this.checkFighterObstacleCollisions(fighters, obstacles);
        this.checkDashCollisions(fighters, obstacles);

        // Check bullet vs healer collisions if present
        if (healers && healers.length > 0) {
            this.checkBulletHealerCollisions(bullets, healers, explosions);
        }
        
        // Check infested chunk collisions if present
        if (infestedChunks && infestedChunks.length > 0) {
            this.checkBulletInfestedCollisions(bullets, infestedChunks, explosions);
        }
        
        // Check loose chunk collisions if present
        if (looseChunks && looseChunks.length > 0) {
            this.checkBulletLooseChunkCollisions(bullets, looseChunks, explosions);
            this.checkFighterLooseChunkCollisions(fighters, looseChunks);
            this.checkLooseChunkLooseChunkCollisions(looseChunks);
            this.checkLooseChunkObstacleCollisions(looseChunks, obstacles);
        }
    }
}

// Export to window
if (typeof window !== 'undefined') {
    window.CollisionSystem = CollisionSystem;
}
