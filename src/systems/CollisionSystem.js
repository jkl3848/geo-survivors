export class CollisionSystem {
  constructor(spatialHash) {
    this.hash = spatialHash;
    this._neighbors = [];
  }

  rebuild(enemyList, xpList) {
    this.hash.clear();
    for (let i = 0; i < enemyList.length; i++) {
      const e = enemyList[i];
      if (e.active) this.hash.insert(e);
    }
    for (let i = 0; i < xpList.length; i++) {
      const o = xpList[i];
      if (o.active) this.hash.insert(o);
    }
  }

  circleOverlap(ax, ay, ar, bx, by, br) {
    const dx = ax - bx;
    const dy = ay - by;
    const r = ar + br;
    return dx * dx + dy * dy <= r * r;
  }

  checkProjectileHits(projectile, enemies) {
    if (!projectile.active) return null;

    const nearby = this.hash.queryRadius(projectile.x, projectile.y, projectile.radius + 20);
    for (const entity of nearby) {
      if (!entity.active || !entity.maxHp) continue;
      if (projectile.hitIds.has(entity)) continue;

      if (this.circleOverlap(projectile.x, projectile.y, projectile.radius, entity.x, entity.y, entity.radius)) {
        return entity;
      }
    }
    return null;
  }

  checkPlayerEnemyCollisions(player, enemies) {
    const hits = [];
    const queryRadius = Math.max(player.radius, player.displayWidth, player.displayHeight) + 20;
    const nearby = this.hash.queryRadius(player.x, player.y, queryRadius);
    for (const entity of nearby) {
      if (!entity.active || !entity.maxHp) continue;
      if (this.circleOverlap(player.x, player.y, player.radius, entity.x, entity.y, entity.radius)) {
        hits.push(entity);
      }
    }
    return hits;
  }

  checkXPickups(player, xpOrbs) {
    const collected = [];
    const nearby = this.hash.queryRadius(player.x, player.y, player.pickupRadius);
    for (const orb of nearby) {
      if (!orb.active || orb.maxHp) continue;
      if (this.circleOverlap(player.x, player.y, player.pickupRadius, orb.x, orb.y, orb.radius)) {
        collected.push(orb);
      }
    }
    return collected;
  }
}
