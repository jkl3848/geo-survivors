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
  }

  init(typeDef, x, y, levelScale, spawnTime) {
    this.active = true;
    this.x = x;
    this.y = y;
    this.typeId = typeDef.id;
    this.color = typeDef.color;
    this.outline = typeDef.outline;
    this.shape = typeDef.id;
    this.radius = typeDef.radius;
    this.xpValue = typeDef.xpValue;
    this.spawnTime = spawnTime;

    const bs = typeDef.baseStats;
    const scale = 1 + levelScale;
    this.maxHp = bs.hp * scale;
    this.hp = this.maxHp;
    this.attack = bs.attack * scale;
    this.defense = bs.defense * scale;
    this.speed = bs.speed;
  }

  reset() {
    this.active = false;
    this.hitFlash = 0;
  }

  update(dt, playerX, playerY, worldW, worldH) {
    if (!this.active) return;

    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) {
      this.x += (dx / dist) * this.speed * dt;
      this.y += (dy / dist) * this.speed * dt;
    }
    wrapPosition(this, worldW, worldH);

    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
    }
  }

  takeDamage(amount) {
    const actual = Math.max(1, amount - this.defense * 0.5);
    this.hp -= actual;
    this.hitFlash = 0.12;
    return this.hp <= 0;
  }
}
