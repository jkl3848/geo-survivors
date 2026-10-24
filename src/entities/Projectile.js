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
    this.color = "#ecf0f1";
    this.ricochetLeft = 0;
    this.critFlash = 0;
    this.procDepth = 0;
    this.canProc = true;
    this.source = "projectile";
    this.allowCrit = true;
    this.zapTimer = 0;
  }

  init(x, y, angle, speed, damage, radius, pierce, extra = {}) {
    this.active = true;
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.damage = damage;
    this.radius = radius;
    this.pierceLeft = pierce;
    this.lifetime = extra.lifetime ?? 3;
    this.color = extra.color || "#ecf0f1";
    this.ricochetLeft = extra.ricochet || 0;
    this.critFlash = 0;
    this.procDepth = extra.procDepth || 0;
    this.canProc = extra.canProc !== false;
    this.source = extra.source || "projectile";
    this.allowCrit = extra.allowCrit !== false;
    this.zapTimer = Math.random() * 0.25;
    this.hitIds.clear();
  }

  reset() {
    this.active = false;
    this.hitIds.clear();
    this.critFlash = 0;
    this.ricochetLeft = 0;
    this.source = "projectile";
  }

  update(dt, worldW, worldH) {
    if (!this.active) return;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.lifetime -= dt;
    if (this.critFlash > 0) this.critFlash = Math.max(0, this.critFlash - dt);
    wrapPosition(this, worldW, worldH);
    if (this.lifetime <= 0) {
      this.active = false;
    }
  }
}
