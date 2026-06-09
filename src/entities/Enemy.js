import { wrapPosition } from '../core/Vec2.js';

export class Enemy {
  constructor() {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.hp = 0;
    this.maxHp = 0;
    this.attack = 0;
    this.defense = 0;
    this.speed = 0;
    this.radius = 10;
    this.typeId = '';
    this.color = '#fff';
    this.outline = '#000';
    this.shape = 'circle';
    this.xpValue = 5;
    this.spawnTime = 0;
    this.hitFlash = 0;
    this.behavior = 'chase';
    this.isBoss = false;
    this.rotation = 0;
    this.vx = 0;
    this.vy = 0;
    this.bossPhase = '';
    this.bossPhaseTimer = 0;
    this.spinSpeed = 0;
    this.dashVx = 0;
    this.dashVy = 0;
    this.dashSpeed = 0;
    this.dashTargetX = 0;
    this.dashTargetY = 0;
    this.shootTimer = 0;
    this.shootInterval = 2;
    this.launched = false;
  }

  init(typeDef, x, y, levelScale, spawnTime, options = {}) {
    this.active = true;
    this.x = x;
    this.y = y;
    this.typeId = typeDef.id;
    this.color = typeDef.color;
    this.outline = typeDef.outline;
    this.shape = typeDef.shape || typeDef.id;
    this.xpValue = typeDef.xpValue;
    this.spawnTime = spawnTime;
    this.behavior = typeDef.behavior || 'chase';
    this.isBoss = typeDef.isBoss || options.isBoss || false;
    this.rotation = 0;
    this.vx = 0;
    this.vy = 0;
    this.launched = options.launched || false;
    this.bossPhase = '';
    this.bossPhaseTimer = 0;
    this.spinSpeed = 0;
    this.dashVx = 0;
    this.dashVy = 0;

    const enemyLevel = options.enemyLevel ?? 0;
    const sizeSpread = 0.1 + enemyLevel * 0.04;
    const sizeFactor = options.sizeFactor ?? (1 + (Math.random() * 2 - 1) * sizeSpread);

    this.radius = typeDef.radius * sizeFactor;
    this.sizeFactor = sizeFactor;

    const bs = typeDef.baseStats;
    const scale = 1 + levelScale;
    const hpScale = sizeFactor * sizeFactor;
    this.maxHp = (options.hpOverride ?? bs.hp * scale * hpScale);
    this.hp = this.maxHp;
    this.attack = bs.attack * scale;
    this.defense = bs.defense * scale;
    this.speed = (options.speedOverride ?? bs.speed / sizeFactor);

    if (this.launched && options.launchAngle != null) {
      const launchSpeed = options.launchSpeed ?? this.speed;
      this.vx = Math.cos(options.launchAngle) * launchSpeed;
      this.vy = Math.sin(options.launchAngle) * launchSpeed;
      this.speed = launchSpeed;
    }

    if (this.behavior === 'boss_square') {
      this.shootTimer = 1;
      this.shootInterval = 2;
    } else if (this.behavior === 'boss_octagon') {
      this.bossPhase = 'spin';
      this.bossPhaseTimer = 3;
      this.spinSpeed = 6;
      this.dashSpeed = 420;
    }
  }

  reset() {
    this.active = false;
    this.hitFlash = 0;
    this.isBoss = false;
    this.launched = false;
    this.behavior = 'chase';
    this.rotation = 0;
    this.bossPhase = '';
  }

  update(dt, playerX, playerY, worldW, worldH, context = {}) {
    if (!this.active) return;

    if (this.launched) {
      this._updateLaunched(dt, worldW, worldH);
    } else if (this.behavior === 'boss_square') {
      this._updateBossSquare(dt, playerX, playerY, worldW, worldH, context);
    } else if (this.behavior === 'boss_octagon') {
      this._updateBossOctagon(dt, playerX, playerY, worldW, worldH);
    } else {
      this._updateChase(dt, playerX, playerY, worldW, worldH);
    }

    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
    }
  }

  _updateChase(dt, playerX, playerY, worldW, worldH) {
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) {
      this.x += (dx / dist) * this.speed * dt;
      this.y += (dy / dist) * this.speed * dt;
    }
    wrapPosition(this, worldW, worldH);
  }

  _updateLaunched(dt, worldW, worldH) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (
      this.x - this.radius < 0
      || this.x + this.radius > worldW
      || this.y - this.radius < 0
      || this.y + this.radius > worldH
    ) {
      this.active = false;
    }
  }

  _updateBossSquare(dt, playerX, playerY, worldW, worldH, context) {
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) {
      this.x += (dx / dist) * this.speed * 0.4 * dt;
      this.y += (dy / dist) * this.speed * 0.4 * dt;
    }
    wrapPosition(this, worldW, worldH);

    this.shootTimer -= dt;
    if (this.shootTimer <= 0) {
      this.shootTimer = this.shootInterval;
      context.spawnSystem?.spawnBossMinions(this.x, this.y, this.radius);
    }
  }

  _updateBossOctagon(dt, playerX, playerY, worldW, worldH) {
    this.rotation += this.spinSpeed * dt;

    if (this.bossPhase === 'spin') {
      this.bossPhaseTimer -= dt;
      if (this.bossPhaseTimer <= 0) {
        this.bossPhase = 'pause';
        this.bossPhaseTimer = 0.8;
        this.dashTargetX = playerX;
        this.dashTargetY = playerY;
        this.spinSpeed = 14;
      }
    } else if (this.bossPhase === 'pause') {
      this.bossPhaseTimer -= dt;
      if (this.bossPhaseTimer <= 0) {
        this.bossPhase = 'dash';
        const dx = this.dashTargetX - this.x;
        const dy = this.dashTargetY - this.y;
        const dist = Math.hypot(dx, dy) || 1;
        this.dashVx = (dx / dist) * this.dashSpeed;
        this.dashVy = (dy / dist) * this.dashSpeed;
        this.spinSpeed = 22;
      }
    } else if (this.bossPhase === 'dash') {
      this.x += this.dashVx * dt;
      this.y += this.dashVy * dt;

      const margin = this.radius * 2;
      if (
        this.x < -margin || this.x > worldW + margin
        || this.y < -margin || this.y > worldH + margin
      ) {
        this._repositionFromEdge(worldW, worldH);
        this.bossPhase = 'spin';
        this.bossPhaseTimer = 3;
        this.spinSpeed = 6;
      }
    }
  }

  _repositionFromEdge(worldW, worldH) {
    const pad = 60;
    const edge = Math.floor(Math.random() * 4);
    switch (edge) {
      case 0:
        this.x = Math.random() * worldW;
        this.y = -pad;
        break;
      case 1:
        this.x = worldW + pad;
        this.y = Math.random() * worldH;
        break;
      case 2:
        this.x = Math.random() * worldW;
        this.y = worldH + pad;
        break;
      default:
        this.x = -pad;
        this.y = Math.random() * worldH;
        break;
    }
  }

  takeDamage(amount) {
    const actual = Math.max(1, amount - this.defense * 0.5);
    this.hp -= actual;
    this.hitFlash = 0.12;
    return this.hp <= 0;
  }
}
