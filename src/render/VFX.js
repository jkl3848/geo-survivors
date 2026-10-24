export class VFX {
  constructor() {
    this.items = [];
  }

  clear() {
    this.items.length = 0;
  }

  _push(item) {
    this.items.push(item);
    if (this.items.length > 160) {
      this.items.splice(0, this.items.length - 160);
    }
  }

  arc(x1, y1, x2, y2, color = "#f4d03f") {
    const segs = [];
    const steps = 4;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      segs.push({
        x: x1 + (x2 - x1) * t + (Math.random() - 0.5) * 18,
        y: y1 + (y2 - y1) * t + (Math.random() - 0.5) * 18,
      });
    }
    this._push({
      type: "arc",
      x1,
      y1,
      x2,
      y2,
      segs,
      color,
      life: 0.14,
      age: 0,
    });
  }

  ring(x, y, radius, color) {
    this._push({ type: "ring", x, y, radius, color, life: 0.32, age: 0 });
  }

  shards(x, y, color = "#d6eaf8") {
    this._push({ type: "burst", x, y, color, life: 0.28, age: 0 });
  }

  number(x, y, text, color) {
    if (this.items.length > 90) return;
    this._push({
      type: "num",
      x: x + (Math.random() - 0.5) * 10,
      y,
      text: String(text),
      color,
      life: 0.5,
      age: 0,
    });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      this.items[i].age += dt;
      if (this.items[i].age >= this.items[i].life) this.items.splice(i, 1);
    }
  }

  draw(ctx) {
    for (const item of this.items) {
      const t = item.age / item.life;
      const alpha = 1 - t;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      if (item.type === "arc") {
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(item.x1, item.y1);
        for (const p of item.segs) ctx.lineTo(p.x, p.y);
        ctx.lineTo(item.x2, item.y2);
        ctx.stroke();
      } else if (item.type === "ring") {
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(item.x, item.y, item.radius * (0.45 + t * 0.7), 0, Math.PI * 2);
        ctx.stroke();
      } else if (item.type === "burst") {
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI * 2 * i) / 6;
          const dist = 8 + t * 22;
          ctx.beginPath();
          ctx.moveTo(item.x, item.y);
          ctx.lineTo(
            item.x + Math.cos(angle) * dist,
            item.y + Math.sin(angle) * dist,
          );
          ctx.stroke();
        }
      } else if (item.type === "num") {
        ctx.fillStyle = item.color;
        ctx.font = "bold 12px Courier New";
        ctx.textAlign = "center";
        ctx.fillText(item.text, item.x, item.y - t * 18);
        ctx.textAlign = "left";
      }
      ctx.restore();
    }
  }
}
