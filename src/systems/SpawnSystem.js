import { lerp } from '../core/Vec2.js';

export class SpawnSystem {
  constructor(spawnConfig, enemyDefs, enemyPool) {
    this.config = spawnConfig;
    this.enemyDefs = enemyDefs;
    this.enemyPool = enemyPool;
    this.spawnTimer = 0;
    this.elapsed = 0;
    this.enemyLevel = 0;
    this._weightTotal = 0;
    this._weightEntries = [];

    for (const [id, weight] of Object.entries(spawnConfig.enemyWeights)) {
      this._weightEntries.push({ id, weight });
      this._weightTotal += weight;
    }
  }

  reset() {
    this.spawnTimer = 0;
    this.elapsed = 0;
    this.enemyLevel = 0;
  }

  getEnemyLevel() {
    return this.enemyLevel;
  }

  getTimeRemaining() {
    return Math.max(0, this.config.durationSeconds - this.elapsed);
  }

  getProgress() {
    return Math.min(1, this.elapsed / this.config.durationSeconds);
  }

  isComplete() {
    return this.elapsed >= this.config.durationSeconds;
  }

  _pickEnemyType() {
    let roll = Math.random() * this._weightTotal;
    for (const entry of this._weightEntries) {
      roll -= entry.weight;
      if (roll <= 0) return this.enemyDefs[entry.id];
    }
    return this.enemyDefs[this._weightEntries[0].id];
  }

  _spawnPosition(worldW, worldH) {
    const pad = this.config.spawnPadding;
    const edge = Math.floor(Math.random() * 4);
    switch (edge) {
      case 0: return { x: Math.random() * worldW, y: -pad };
      case 1: return { x: worldW + pad, y: Math.random() * worldH };
      case 2: return { x: Math.random() * worldW, y: worldH + pad };
      default: return { x: -pad, y: Math.random() * worldH };
    }
  }

  update(dt, worldW, worldH) {
    this.elapsed += dt;
    this.enemyLevel = Math.floor(this.elapsed / this.config.enemyLevel.everySeconds);

    const progress = this.getProgress();
    const interval = lerp(
      this.config.spawnInterval.start,
      this.config.spawnInterval.end,
      progress,
    );

    this.spawnTimer -= dt;
    while (this.spawnTimer <= 0) {
      this.spawnTimer += interval;
      this._trySpawn(worldW, worldH);
    }
  }

  _trySpawn(worldW, worldH) {
    const active = this.enemyPool.getActive();
    if (active.length >= this.config.maxEnemies) {
      let oldest = active[0];
      for (const e of active) {
        if (e.spawnTime < oldest.spawnTime) oldest = e;
      }
      oldest.reset();
      this.enemyPool.release(oldest);
    }

    const typeDef = this._pickEnemyType();
    const pos = this._spawnPosition(worldW, worldH);
    const levelScale = this.enemyLevel * this.config.enemyLevel.statScalePerLevel;

    const enemy = this.enemyPool.acquire();
    enemy.init(typeDef, pos.x, pos.y, levelScale, this.elapsed);
  }
}
