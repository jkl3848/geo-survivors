import { wrapPosition } from '../core/Vec2.js';

export class Projectile {
  constructor() {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.radius = 4;
    this.damage = 10;
    this.pierceLeft = 0;
    this.lifetime = 3;
    this.hitIds = new Set();
  }

  init(x, y, angle, speed, damage, radius, pierce) {
    this.active = true;
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.damage = damage;
    this.radius = radius;
    this.pierceLeft = pierce;
    this.lifetime = 3;
    this.hitIds.clear();
  }

  reset() {
    this.active = false;
    this.hitIds.clear();
  }

  update(dt, worldW, worldH) {
    if (!this.active) return;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.lifetime -= dt;
    wrapPosition(this, worldW, worldH);
    if (this.lifetime <= 0) {
      this.active = false;
    }
  }
}
