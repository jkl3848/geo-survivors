export class HUD {
  constructor(ctx, width) {
    this.ctx = ctx;
    this.width = width;
    this.barHeight = 48;
  }

  draw(player, timeRemaining, enemyLevel, levelSystem) {
    const ctx = this.ctx;
    const w = this.width;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, w, this.barHeight);

    const hpPct = player.maxHp > 0 ? player.hp / player.maxHp : 0;
    const hpBarW = 160;
    const hpBarH = 14;
    const hpX = 12;
    const hpY = 10;

    ctx.fillStyle = '#333';
    ctx.fillRect(hpX, hpY, hpBarW, hpBarH);
    ctx.fillStyle = hpPct > 0.3 ? '#2ecc71' : '#e74c3c';
    ctx.fillRect(hpX, hpY, hpBarW * hpPct, hpBarH);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(hpX, hpY, hpBarW, hpBarH);

    ctx.fillStyle = '#ecf0f1';
    ctx.font = '11px Courier New';
    ctx.fillText(`HP ${Math.ceil(player.hp)}/${Math.ceil(player.maxHp)}`, hpX, hpY + hpBarH + 12);

    const mins = Math.floor(timeRemaining / 60);
    const secs = Math.floor(timeRemaining % 60);
    ctx.font = 'bold 16px Courier New';
    ctx.fillStyle = '#5dade2';
    ctx.textAlign = 'center';
    ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, w / 2, 22);

    ctx.font = '11px Courier New';
    ctx.fillStyle = '#888';
    ctx.fillText(`Enemy Lv ${enemyLevel}`, w / 2, 38);
    ctx.textAlign = 'left';

    const lvlX = w - 200;
    const xpPct = levelSystem.getProgress();
    ctx.fillStyle = '#ecf0f1';
    ctx.font = '11px Courier New';
    ctx.fillText(`Lv ${levelSystem.level}`, lvlX, 16);

    const xpBarW = 180;
    const xpBarH = 10;
    const xpY = 24;
    ctx.fillStyle = '#333';
    ctx.fillRect(lvlX, xpY, xpBarW, xpBarH);
    ctx.fillStyle = '#9b59b6';
    ctx.fillRect(lvlX, xpY, xpBarW * xpPct, xpBarH);
    ctx.strokeStyle = '#555';
    ctx.strokeRect(lvlX, xpY, xpBarW, xpBarH);

    ctx.fillStyle = '#aaa';
    ctx.font = '10px Courier New';
    ctx.fillText(`XP ${levelSystem.xp}/${levelSystem.xpToNext}`, lvlX, xpY + xpBarH + 12);
  }
}
