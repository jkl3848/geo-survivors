import { getRarityStyle } from '../config/upgradeRarity.js';
import { getUpgradeCardLayout } from './upgradeLayout.js';

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
      if (!flashing) this._drawStatus(enemy);
    }
  }

  _drawStatus(enemy) {
    const status = enemy.status;
    if (!status) return;
    const x = Math.round(enemy.x);
    const y = Math.round(enemy.y);
    const r = enemy.radius;

    if (status.burn) {
      this.ctx.save();
      this.ctx.globalAlpha = 0.35 + 0.2 * Math.sin(Date.now() / 90);
      this.ctx.fillStyle = '#e67e22';
      this.ctx.beginPath();
      this.ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    if (status.slow > 0) {
      this.ctx.save();
      this.ctx.globalAlpha = 0.28;
      this.ctx.fillStyle = '#5dade2';
      this.ctx.beginPath();
      this.ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    if (status.freeze > 0) {
      this.ctx.save();
      this.ctx.strokeStyle = '#d6eaf8';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(x, y, r + 3, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.restore();
    }

    if (status.shock > 0) {
      this.ctx.save();
      this.ctx.strokeStyle = '#f7dc6f';
      this.ctx.lineWidth = 1;
      const flick = Math.floor(Date.now() / 40) % 4;
      for (let i = 0; i < 3; i++) {
        const angle = flick + i * 2.1;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * (r * 0.6));
        this.ctx.stroke();
      }
      this.ctx.restore();
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
      const r = Math.max(2, Math.round(p.radius * (p.critFlash > 0 ? 1.75 : 1)));
      this.ctx.fillStyle = '#111';
      this.ctx.fillRect(x - r - 1, y - r - 1, r * 2 + 2, r * 2 + 2);
      this.ctx.fillStyle = p.critFlash > 0 ? '#ffffff' : (p.color || '#ecf0f1');
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

  _wrapTextLines(text, maxWidth) {
    const words = String(text).split(' ');
    const lines = [];
    let line = '';

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      if (this.ctx.measureText(testLine).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    }

    if (line) lines.push(line);
    return lines;
  }

  _drawWrappedText(text, x, y, maxWidth, lineHeight) {
    const lines = this._wrapTextLines(text, maxWidth);
    for (let i = 0; i < lines.length; i++) {
      this.ctx.fillText(lines[i], x, y + i * lineHeight);
    }
    return lines.length;
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

  drawUpgradeOverlay(choices, width, height, playerStacks = {}, isSpecialRoll = false, isBossDrop = false, previewFor = null) {
    this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
    this.ctx.fillRect(0, 0, width, height);

    const layout = getUpgradeCardLayout(choices.length, width, height);
    const { cardW, cardH, gap, startX, cardY } = layout;

    const title = isBossDrop ? 'BOSS REWARD!' : (isSpecialRoll ? 'SPECIAL UPGRADE!' : 'LEVEL UP!');
    this.ctx.fillStyle = isBossDrop ? '#f1c40f' : (isSpecialRoll ? '#e74c3c' : '#5dade2');
    this.ctx.font = 'bold 24px Courier New';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(title, width / 2, cardY - 28);

    choices.forEach((choice, i) => {
      const style = getRarityStyle(choice.rarity || 1);
      const cx = startX + i * (cardW + gap);

      this.ctx.fillStyle = style.bg;
      this.ctx.fillRect(cx, cardY, cardW, cardH);
      this.ctx.strokeStyle = style.border;
      this.ctx.lineWidth = 3;
      this.ctx.strokeRect(cx, cardY, cardW, cardH);

      const textPad = 12;
      const textMaxW = cardW - textPad * 2;
      const centerX = cx + cardW / 2;

      this.ctx.fillStyle = style.text;
      this.ctx.font = 'bold 14px Courier New';
      const nameLines = this._drawWrappedText(choice.name, centerX, cardY + 22, textMaxW, 16);
      this.ctx.font = '10px Courier New';
      this.ctx.fillStyle = style.border;
      this.ctx.fillText(style.label, centerX, cardY + 22 + nameLines * 16 + 8);
      this.ctx.font = '12px Courier New';
      this.ctx.fillStyle = '#ccc';
      const descY = cardY + 22 + nameLines * 16 + 24;
      const descLines = this._drawWrappedText(choice.description, centerX, descY, textMaxW, 14);
      const previews = previewFor ? previewFor(choice) : [];
      let previewY = descY + descLines * 14 + 8;
      this.ctx.font = '10px Courier New';
      this.ctx.fillStyle = style.text;
      for (const line of previews) {
        if (previewY > cardY + cardH - 10) break;
        this.ctx.fillText(line, centerX, previewY);
        previewY += 12;
      }
      if (!previews.length && (playerStacks[choice.id] || 0) > 0) {
        this.ctx.fillStyle = style.border;
        this.ctx.font = 'bold 11px Courier New';
        this.ctx.fillText(`Owned: x${playerStacks[choice.id]}`, centerX, previewY);
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

    const build = levelSystem.getBuildSummary?.(player) || [];
    if (build.length) {
      y += 8;
      ctx.fillStyle = '#ecf0f1';
      ctx.font = 'bold 14px Courier New';
      ctx.fillText('BUILD', leftX, y);
      y += 20;
      ctx.font = '12px Courier New';
      for (const line of build) {
        ctx.fillStyle = '#aed6f1';
        const lineCount = this._drawWrappedText(line, leftX, y, colW, 14);
        y += lineCount * 14 + 4;
      }
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
        const descLines = this._drawWrappedText(upgrade.description, rightX, y + 14, colW, 12);
        ctx.font = '12px Courier New';
        y += 14 + descLines * 12 + 10;
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

  drawDebug(fps, enemyCount, height) {
    this.ctx.fillStyle = '#0f0';
    this.ctx.font = '12px Courier New';
    this.ctx.fillText(`FPS: ${fps}  Enemies: ${enemyCount}`, 10, height - 10);
  }

  drawDevHint(height) {
    this.ctx.fillStyle = '#5dade2';
    this.ctx.font = '12px Courier New';
    this.ctx.fillText('DEV: press ` to open panel', 10, height - 10);
  }
}
