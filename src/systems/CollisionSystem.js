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

  resolveEnemyOverlaps(enemies, passes = 2) {
    for (let pass = 0; pass < passes; pass++) {
      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (!enemy.active || enemy.isBoss || enemy.launched) continue;

        const nearby = this.hash.queryRadius(enemy.x, enemy.y, enemy.radius * 2.5);
        for (const other of nearby) {
          if (!other.active || other === enemy || other.isBoss || other.launched) continue;

          const dx = enemy.x - other.x;
          const dy = enemy.y - other.y;
          let distSq = dx * dx + dy * dy;
          const minDist = enemy.radius + other.radius;

          if (distSq === 0) {
            enemy.x += (Math.random() - 0.5) * 2;
            enemy.y += (Math.random() - 0.5) * 2;
            continue;
          }

          if (distSq >= minDist * minDist) continue;

          const dist = Math.sqrt(distSq);
          const overlap = (minDist - dist) * 0.5;
          const nx = dx / dist;
          const ny = dy / dist;
          enemy.x += nx * overlap;
          enemy.y += ny * overlap;
          other.x -= nx * overlap;
          other.y -= ny * overlap;
        }
      }
    }
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
