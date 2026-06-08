export class XPOrb {
  constructor() {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.value = 5;
    this.radius = 5;
    this.lifetime = 30;
  }

  init(x, y, value) {
    this.active = true;
    this.x = x;
    this.y = y;
    this.value = value;
    this.radius = 5;
    this.lifetime = 30;
  }

  reset() {
    this.active = false;
  }

  update(dt) {
    if (!this.active) return;
    this.lifetime -= dt;
    if (this.lifetime <= 0) {
      this.active = false;
    }
  }
}
