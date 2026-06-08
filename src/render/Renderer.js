export class Renderer {
  constructor(ctx, width, height) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    ctx.imageSmoothingEnabled = false;
  }

  clear() {
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  drawXPOrbs(orbs) {
    for (const orb of orbs) {
      if (!orb.active) continue;
      const x = Math.round(orb.x);
      const y = Math.round(orb.y);
      this.ctx.fillStyle = '#f1c40f';
      this.ctx.fillRect(x - 3, y - 3, 6, 6);
      this.ctx.fillStyle = '#f39c12';
      this.ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }

  drawEnemies(enemies) {
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const flashing = enemy.hitFlash > 0;
      this._drawShape(
        enemy.x, enemy.y, enemy.radius, enemy.shape,
        flashing ? '#ffffff' : enemy.color,
        flashing ? '#ff6b6b' : enemy.outline,
      );
    }
  }

  drawProjectiles(projectiles) {
    for (const p of projectiles) {
      if (!p.active) continue;
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      const r = Math.round(p.radius);
      this.ctx.fillStyle = '#ecf0f1';
      this.ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  drawPlayer(player) {
    if (!player.alive) return;
    const x = Math.round(player.x);
    const y = Math.round(player.y);

    if (player.pixelArt && player.bodyBounds) {
      const b = player.bodyBounds;
      const dw = Math.round(player.displayWidth);
      const dh = Math.round(player.displayHeight);
      const drawX = x - dw / 2;
      const drawY = y - dh / 2;

      this.ctx.drawImage(
        player.pixelArt,
        b.minX, b.minY, b.width, b.height,
        drawX, drawY, dw, dh,
      );

      if (player.hitFlash > 0) {
        const alpha = (player.hitFlash / (player.hitFlashDuration || 0.15)) * 0.75;
        this.ctx.save();
        this.ctx.globalAlpha = alpha;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(drawX, drawY, dw, dh);
        this.ctx.restore();
      }
    } else {
      const flashing = player.hitFlash > 0;
      this.ctx.fillStyle = flashing ? '#ffffff' : (player.color || '#5dade2');
      this.ctx.beginPath();
      this.ctx.arc(x, y, player.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  _drawShape(x, y, radius, shape, color, outline) {
    const cx = Math.round(x);
    const cy = Math.round(y);
    const r = radius;

    this.ctx.fillStyle = color;
    this.ctx.strokeStyle = outline;
    this.ctx.lineWidth = 2;

    this.ctx.beginPath();
    if (shape === 'circle') {
      this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
    } else if (shape === 'square') {
      this.ctx.rect(cx - r, cy - r, r * 2, r * 2);
    } else if (shape === 'triangle') {
      this.ctx.moveTo(cx, cy - r);
      this.ctx.lineTo(cx + r, cy + r);
      this.ctx.lineTo(cx - r, cy + r);
      this.ctx.closePath();
    }
    this.ctx.fill();
    this.ctx.stroke();
  }

  drawUpgradeOverlay(choices, width, height) {
    this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
    this.ctx.fillRect(0, 0, width, height);

    this.ctx.fillStyle = '#5dade2';
    this.ctx.font = 'bold 24px Courier New';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('LEVEL UP!', width / 2, height / 2 - 100);

    const cardW = 200;
    const cardH = 120;
    const gap = 20;
    const totalW = choices.length * cardW + (choices.length - 1) * gap;
    const startX = (width - totalW) / 2;
    const cardY = height / 2 - 40;

    choices.forEach((choice, i) => {
      const cx = startX + i * (cardW + gap);
      this.ctx.fillStyle = '#2c3e50';
      this.ctx.fillRect(cx, cardY, cardW, cardH);
      this.ctx.strokeStyle = '#5dade2';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(cx, cardY, cardW, cardH);

      this.ctx.fillStyle = '#ecf0f1';
      this.ctx.font = 'bold 14px Courier New';
      this.ctx.fillText(choice.name, cx + cardW / 2, cardY + 30);
      this.ctx.font = '12px Courier New';
      this.ctx.fillStyle = '#aaa';
      this.ctx.fillText(choice.description, cx + cardW / 2, cardY + 60);
    });

    this.ctx.fillStyle = '#666';
    this.ctx.font = '12px Courier New';
    this.ctx.fillText('Click a card to choose', width / 2, cardY + cardH + 30);
    this.ctx.textAlign = 'left';
  }

  drawGameOver(won, timeSurvived, level, width, height, newUnlocks = []) {
    this.ctx.fillStyle = 'rgba(0,0,0,0.75)';
    this.ctx.fillRect(0, 0, width, height);

    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = won ? '#2ecc71' : '#e74c3c';
    this.ctx.font = 'bold 36px Courier New';
    this.ctx.fillText(won ? 'YOU SURVIVED!' : 'GAME OVER', width / 2, height / 2 - 40);

    const mins = Math.floor(timeSurvived / 60);
    const secs = Math.floor(timeSurvived % 60);
    this.ctx.fillStyle = '#ecf0f1';
    this.ctx.font = '18px Courier New';
    this.ctx.fillText(`Time: ${mins}:${secs.toString().padStart(2, '0')}`, width / 2, height / 2);
    this.ctx.fillText(`Level reached: ${level}`, width / 2, height / 2 + 30);

    let extraY = height / 2 + 70;
    if (newUnlocks.length > 0) {
      this.ctx.fillStyle = '#f1c40f';
      this.ctx.font = '13px Courier New';
      this.ctx.fillText(`Unlocked: ${newUnlocks.map((c) => c.name).join(', ')}`, width / 2, extraY);
      extraY += 24;
    }

    this.ctx.fillStyle = '#5dade2';
    this.ctx.font = '14px Courier New';
    this.ctx.fillText('Press R to retry', width / 2, extraY);
    this.ctx.textAlign = 'left';
  }

  drawDebug(fps, enemyCount, width) {
    this.ctx.fillStyle = '#0f0';
    this.ctx.font = '12px Courier New';
    this.ctx.fillText(`FPS: ${fps}  Enemies: ${enemyCount}`, 10, height - 10);
  }
}
