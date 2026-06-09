import { getRarityStyle } from '../config/upgradeRarity.js';

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
        enemy.rotation || 0,
      );
    }
  }

  drawBossHealthBar(boss, width) {
    if (!boss?.active) return;

    const barW = Math.min(400, width * 0.6);
    const barH = 14;
    const x = (width - barW) / 2;
    const y = 56;
    const hpPct = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;

    const names = {
      boss_square: 'BARRAGE SQUARE',
      boss_octagon: 'SAW OCTAGON',
    };
    const name = names[boss.typeId] || 'BOSS';

    this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
    this.ctx.fillRect(x - 4, y - 18, barW + 8, barH + 26);

    this.ctx.fillStyle = '#ecf0f1';
    this.ctx.font = 'bold 11px Courier New';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(name, width / 2, y - 4);

    this.ctx.fillStyle = '#333';
    this.ctx.fillRect(x, y, barW, barH);
    this.ctx.fillStyle = boss.typeId === 'boss_octagon' ? '#e74c3c' : '#1abc9c';
    this.ctx.fillRect(x, y, barW * hpPct, barH);
    this.ctx.strokeStyle = '#555';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x, y, barW, barH);
    this.ctx.textAlign = 'left';
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

  _drawShape(x, y, radius, shape, color, outline, rotation = 0) {
    const cx = Math.round(x);
    const cy = Math.round(y);
    const r = radius;

    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.rotate(rotation);
    this.ctx.translate(-cx, -cy);

    this.ctx.fillStyle = color;
    this.ctx.strokeStyle = outline;
    this.ctx.lineWidth = 2;

    this.ctx.beginPath();
    if (shape === 'circle') {
      this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
    } else if (shape === 'square' || shape === 'boss_square') {
      this.ctx.rect(cx - r, cy - r, r * 2, r * 2);
    } else if (shape === 'triangle') {
      this.ctx.moveTo(cx, cy - r);
      this.ctx.lineTo(cx + r, cy + r);
      this.ctx.lineTo(cx - r, cy + r);
      this.ctx.closePath();
    } else if (shape === 'hexagon') {
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        if (i === 0) this.ctx.moveTo(px, py);
        else this.ctx.lineTo(px, py);
      }
      this.ctx.closePath();
    } else if (shape === 'octagon') {
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI / 4) * i - Math.PI / 2;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        if (i === 0) this.ctx.moveTo(px, py);
        else this.ctx.lineTo(px, py);
      }
      this.ctx.closePath();
    }
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.restore();
  }

  drawUpgradeOverlay(choices, width, height, playerStacks = {}, isSpecialRoll = false, isBossDrop = false) {
    this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
    this.ctx.fillRect(0, 0, width, height);

    const title = isBossDrop ? 'BOSS REWARD!' : (isSpecialRoll ? 'SPECIAL UPGRADE!' : 'LEVEL UP!');
    this.ctx.fillStyle = isBossDrop ? '#f1c40f' : (isSpecialRoll ? '#e74c3c' : '#5dade2');
    this.ctx.font = 'bold 24px Courier New';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(title, width / 2, height / 2 - 110);

    const cardW = 200;
    const cardH = 130;
    const gap = 20;
    const totalW = choices.length * cardW + (choices.length - 1) * gap;
    const startX = (width - totalW) / 2;
    const cardY = height / 2 - 45;

    choices.forEach((choice, i) => {
      const style = getRarityStyle(choice.rarity || 1);
      const cx = startX + i * (cardW + gap);
      const stacks = playerStacks[choice.id] || 0;

      this.ctx.fillStyle = style.bg;
      this.ctx.fillRect(cx, cardY, cardW, cardH);
      this.ctx.strokeStyle = style.border;
      this.ctx.lineWidth = 3;
      this.ctx.strokeRect(cx, cardY, cardW, cardH);

      this.ctx.fillStyle = style.text;
      this.ctx.font = 'bold 14px Courier New';
      this.ctx.fillText(choice.name, cx + cardW / 2, cardY + 28);
      this.ctx.font = '10px Courier New';
      this.ctx.fillStyle = style.border;
      this.ctx.fillText(style.label, cx + cardW / 2, cardY + 44);
      this.ctx.font = '12px Courier New';
      this.ctx.fillStyle = '#ccc';
      this.ctx.fillText(choice.description, cx + cardW / 2, cardY + 68);
      if (stacks > 0) {
        this.ctx.fillStyle = style.border;
        this.ctx.font = 'bold 11px Courier New';
        this.ctx.fillText(`Owned: x${stacks}`, cx + cardW / 2, cardY + 100);
      }
    });

    this.ctx.fillStyle = '#666';
    this.ctx.font = '12px Courier New';
    this.ctx.fillText('Click a card to choose', width / 2, cardY + cardH + 30);
    this.ctx.textAlign = 'left';
  }

  drawPauseOverlay(player, levelSystem, width, height) {
    this.ctx.fillStyle = 'rgba(0,0,0,0.75)';
    this.ctx.fillRect(0, 0, width, height);

    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#5dade2';
    ctx.font = 'bold 28px Courier New';
    ctx.fillText('PAUSED', width / 2, 50);

    const colW = Math.min(320, width * 0.4);
    const leftX = width / 2 - colW - 20;
    const rightX = width / 2 + 20;
    const startY = 80;

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ecf0f1';
    ctx.font = 'bold 14px Courier New';
    ctx.fillText('STATS', leftX, startY);

    const stats = [
      ['HP', `${Math.ceil(player.hp)} / ${Math.ceil(player.maxHp)}`],
      ['Attack', player.getStat('attack').toFixed(1)],
      ['Defense', player.getStat('defense').toFixed(1)],
      ['Regen', `${player.getStat('healthRegen').toFixed(2)}/s`],
      ['Speed', player.getStat('speed').toFixed(0)],
      ['Atk Speed', `${player.getStat('attackSpeed').toFixed(2)}/s`],
      ['Pierce', String(player.pierce)],
      ['Pickup Rng', player.pickupRadius.toFixed(0)],
      ['Bullet Size', player.projectileRadius.toFixed(1)],
    ];

    ctx.font = '12px Courier New';
    let y = startY + 24;
    for (const [label, value] of stats) {
      ctx.fillStyle = '#888';
      ctx.fillText(label, leftX, y);
      ctx.fillStyle = '#ecf0f1';
      ctx.fillText(value, leftX + 110, y);
      y += 20;
    }

    ctx.fillStyle = '#ecf0f1';
    ctx.font = 'bold 14px Courier New';
    ctx.fillText('UPGRADES', rightX, startY);

    const equipped = levelSystem.getEquippedUpgrades();
    y = startY + 24;
    ctx.font = '12px Courier New';

    if (equipped.length === 0) {
      ctx.fillStyle = '#666';
      ctx.fillText('None yet', rightX, y);
    } else {
      for (const { upgrade, stacks } of equipped) {
        const style = getRarityStyle(upgrade.rarity || 1);
        ctx.fillStyle = style.border;
        ctx.fillText(`${upgrade.name} x${stacks}`, rightX, y);
        ctx.fillStyle = '#666';
        ctx.font = '10px Courier New';
        ctx.fillText(upgrade.description, rightX, y + 14);
        ctx.font = '12px Courier New';
        y += 32;
      }
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#666';
    ctx.font = '12px Courier New';
    ctx.fillText('Press ESC to resume', width / 2, height - 30);
    ctx.textAlign = 'left';
  }

  drawGameOver(won, timeSurvived, level, width, height, newUnlocks = []) {
    this.ctx.fillStyle = 'rgba(0,0,0,0.75)';
    this.ctx.fillRect(0, 0, width, height);

    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = won ? '#2ecc71' : '#e74c3c';
    this.ctx.font = 'bold 36px Courier New';
    this.ctx.fillText(won ? 'VICTORY!' : 'GAME OVER', width / 2, height / 2 - 40);

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
