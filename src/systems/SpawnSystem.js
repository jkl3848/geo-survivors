import { lerp } from '../core/Vec2.js';

export class SpawnSystem {
  constructor(spawnConfig, enemyDefs, enemyPool) {
    this.config = spawnConfig;
    this.enemyDefs = enemyDefs;
    this.enemyPool = enemyPool;
    this.spawnTimer = 0;
    this.elapsed = 0;
    this.enemyLevel = 0;
    this.timerComplete = false;
    this.finalBossSpawned = false;
    this._spawnedBosses = new Set();
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
    this.timerComplete = false;
    this.finalBossSpawned = false;
    this._spawnedBosses = new Set();
  }

  getEnemyLevel() {
    return this.enemyLevel;
  }

  getTimeRemaining() {
    if (this.timerComplete) return 0;
    return Math.max(0, this.config.durationSeconds - this.elapsed);
  }

  getProgress() {
    return Math.min(1, this.elapsed / this.config.durationSeconds);
  }

  isComplete() {
    return this.elapsed >= this.config.durationSeconds;
  }

  isTimerComplete() {
    return this.timerComplete;
  }

  getFinalBossId() {
    return this.config.finalBossId || 'boss_octagon';
  }

  _pickEnemyType() {
    const available = this._weightEntries.filter((entry) => {
      const def = this.enemyDefs[entry.id];
      return !def.minEnemyLevel || this.enemyLevel >= def.minEnemyLevel;
    });
    if (available.length === 0) return this.enemyDefs[this._weightEntries[0].id];

    let total = 0;
    for (const entry of available) total += entry.weight;

    let roll = Math.random() * total;
    for (const entry of available) {
      roll -= entry.weight;
      if (roll <= 0) return this.enemyDefs[entry.id];
    }
    return this.enemyDefs[available[0].id];
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

  _bossSpawnPosition(worldW, worldH) {
    return { x: worldW / 2, y: -50 };
  }

  update(dt, worldW, worldH) {
    this.elapsed += dt;
    this.enemyLevel = Math.floor(this.elapsed / this.config.enemyLevel.everySeconds);

    this._checkBossSpawns(worldW, worldH);

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

  _checkBossSpawns(worldW, worldH) {
    const schedule = this.config.bossSchedule || [];
    for (const entry of schedule) {
      const key = `${entry.typeId}_${entry.atSeconds}`;
      if (this._spawnedBosses.has(key)) continue;
      if (this.elapsed >= entry.atSeconds) {
        this.spawnBoss(entry.typeId, worldW, worldH);
        this._spawnedBosses.add(key);
      }
    }

    if (!this.finalBossSpawned && this.elapsed >= this.config.durationSeconds) {
      this.timerComplete = true;
      this.spawnBoss(this.getFinalBossId(), worldW, worldH);
      this.finalBossSpawned = true;
    }
  }

  _overlapsAny(x, y, radius, active) {
    for (const e of active) {
      if (!e.active) continue;
      const dx = x - e.x;
      const dy = y - e.y;
      const minDist = radius + e.radius;
      if (dx * dx + dy * dy < minDist * minDist) return true;
    }
    return false;
  }

  _findClearPosition(x, y, radius, worldW, worldH, active) {
    if (!this._overlapsAny(x, y, radius, active)) return { x, y };

    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const offset = radius * 2 * (attempt + 1);
      const nx = x + Math.cos(angle) * offset;
      const ny = y + Math.sin(angle) * offset;
      if (!this._overlapsAny(nx, ny, radius, active)) return { x: nx, y: ny };
    }
    return null;
  }

  _evictOldest(active) {
    let oldest = null;
    for (const e of active) {
      if (!e.active || e.isBoss) continue;
      if (!oldest || e.spawnTime < oldest.spawnTime) oldest = e;
    }
    if (!oldest) return;
    oldest.reset();
    this.enemyPool.release(oldest);
  }

  _spawnEnemy(typeDef, x, y, levelScale, options = {}) {
    const active = this.enemyPool.getActive();
    if (active.length >= this.config.maxEnemies && !options.isBoss) {
      this._evictOldest(active);
    }

    const enemy = this.enemyPool.acquire();
    enemy.init(typeDef, x, y, levelScale, this.elapsed, {
      enemyLevel: this.enemyLevel,
      isBoss: typeDef.isBoss || options.isBoss,
      ...options,
    });
    return enemy;
  }

  _trySpawn(worldW, worldH) {
    const typeDef = this._pickEnemyType();
    const pos = this._spawnPosition(worldW, worldH);
    const levelScale = this.enemyLevel * this.config.enemyLevel.statScalePerLevel;
    const active = this.enemyPool.getActive();
    const clearPos = this._findClearPosition(pos.x, pos.y, typeDef.radius, worldW, worldH, active);
    if (!clearPos) return;

    this._spawnEnemy(typeDef, clearPos.x, clearPos.y, levelScale);
  }

  spawnBoss(typeId, worldW, worldH) {
    const typeDef = this.enemyDefs[typeId];
    if (!typeDef) return null;

    const pos = this._bossSpawnPosition(worldW, worldH);
    const levelScale = this.enemyLevel * this.config.enemyLevel.statScalePerLevel;
    const active = this.enemyPool.getActive();
    const clearPos = this._findClearPosition(pos.x, pos.y, typeDef.radius, worldW, worldH, active)
      || pos;

    return this._spawnEnemy(typeDef, clearPos.x, clearPos.y, levelScale, {
      sizeFactor: 1,
      isBoss: true,
    });
  }

  spawnBossMinions(x, y, bossRadius) {
    const triangleDef = this.enemyDefs.triangle;
    if (!triangleDef) return;

    const count = 10;
    const spawnDist = bossRadius * 0.6;
    const levelScale = 0;
    const active = this.enemyPool.getActive();

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i;
      const sx = x + Math.cos(angle) * spawnDist;
      const sy = y + Math.sin(angle) * spawnDist;
      const minionRadius = triangleDef.radius * 0.55;
      const clearPos = this._findClearPosition(sx, sy, minionRadius, 0, 0, active);
      if (!clearPos) continue;

      this._spawnEnemy(triangleDef, clearPos.x, clearPos.y, levelScale, {
        sizeFactor: 0.55,
        launched: true,
        launchAngle: angle,
        launchSpeed: 240,
        hpOverride: 12,
        speedOverride: 240,
      });
    }
  }

  spawnTriangleBurst(x, y) {
    const triangleDef = this.enemyDefs.triangle;
    if (!triangleDef) return;

    const count = 6;
    const dist = 22;
    const levelScale = 0;
    const active = this.enemyPool.getActive();

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i;
      const sx = x + Math.cos(angle) * dist;
      const sy = y + Math.sin(angle) * dist;
      const clearPos = this._findClearPosition(sx, sy, triangleDef.radius * 0.75, 0, 0, active);
      if (!clearPos) continue;

      this._spawnEnemy(triangleDef, clearPos.x, clearPos.y, levelScale, { sizeFactor: 0.75 });
    }
  }
}
