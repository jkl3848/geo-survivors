export class HUD {
  constructor(ctx, width) {
    this.ctx = ctx;
    this.width = width;
    this.barHeight = 48;
  }

  draw(player, timeRemaining, enemyLevel, levelSystem, timerComplete = false, abilityHud = null) {
    const ctx = this.ctx;
    const w = this.width;

    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, w, this.barHeight);

    const hpPct = player.maxHp > 0 ? player.hp / player.maxHp : 0;
    const hpBarW = 160;
    const hpBarH = 14;
    const hpX = 12;
    const hpY = 10;

    ctx.fillStyle = "#333";
    ctx.fillRect(hpX, hpY, hpBarW, hpBarH);
    ctx.fillStyle = hpPct > 0.3 ? "#2ecc71" : "#e74c3c";
    ctx.fillRect(hpX, hpY, hpBarW * hpPct, hpBarH);
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 1;
    ctx.strokeRect(hpX, hpY, hpBarW, hpBarH);

    ctx.fillStyle = "#ecf0f1";
    ctx.font = "11px Courier New";
    ctx.fillText(
      `HP ${Math.ceil(player.hp)}/${Math.ceil(player.maxHp)}`,
      hpX,
      hpY + hpBarH + 12,
    );

    ctx.font = "bold 16px Courier New";
    ctx.fillStyle = timerComplete ? "#e74c3c" : "#5dade2";
    ctx.textAlign = "center";
    if (timerComplete) {
      ctx.fillText("FINAL BOSS", w / 2, 22);
    } else {
      const mins = Math.floor(timeRemaining / 60);
      const secs = Math.floor(timeRemaining % 60);
      ctx.fillText(`${mins}:${secs.toString().padStart(2, "0")}`, w / 2, 22);
    }

    ctx.font = "11px Courier New";
    ctx.fillStyle = "#888";
    ctx.fillText(`Enemy Level ${enemyLevel + 1}`, w / 2, 38);
    ctx.textAlign = "left";

    const lvlX = w - 200;
    const xpPct = levelSystem.getProgress();
    ctx.fillStyle = "#ecf0f1";
    ctx.font = "11px Courier New";
    ctx.fillText(`Level ${levelSystem.level}`, lvlX, 16);

    const xpBarW = 180;
    const xpBarH = 10;
    const xpY = 24;
    ctx.fillStyle = "#333";
    ctx.fillRect(lvlX, xpY, xpBarW, xpBarH);
    ctx.fillStyle = "#9b59b6";
    ctx.fillRect(lvlX, xpY, xpBarW * xpPct, xpBarH);
    ctx.strokeStyle = "#555";
    ctx.strokeRect(lvlX, xpY, xpBarW, xpBarH);

    ctx.fillStyle = "#aaa";
    ctx.font = "10px Courier New";
    ctx.fillText(
      `XP ${levelSystem.xp}/${levelSystem.xpToNext}`,
      lvlX,
      xpY + xpBarH + 12,
    );

    if (abilityHud) this._drawAbility(abilityHud, w);
  }

  _drawAbility(ability, canvasWidth) {
    const ctx = this.ctx;
    const boxW = 160;
    const boxH = 46;
    const x = Math.round((canvasWidth - boxW) / 2);
    const y = this.barHeight + 10;
    const ready = ability.ready;
    const flash = ready && Math.floor(performance.now() / 350) % 2 === 0;

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x, y, boxW, boxH);
    ctx.strokeStyle = flash ? "#fff" : (ability.color || "#5dade2");
    ctx.lineWidth = ready ? 2 : 1;
    ctx.strokeRect(x, y, boxW, boxH);

    ctx.fillStyle = ability.color || "#5dade2";
    ctx.font = "bold 12px Courier New";
    ctx.textAlign = "left";
    ctx.fillText(ability.name, x + 8, y + 16);

    ctx.fillStyle = "#888";
    ctx.font = "10px Courier New";
    ctx.fillText("SPACE", x + 8, y + 38);

    if (ability.maxCharges > 1) {
      const pipY = y + 22;
      for (let i = 0; i < ability.maxCharges; i++) {
        const px = x + 58 + i * 14;
        ctx.fillStyle = i < ability.charges ? (ability.color || "#5dade2") : "#333";
        ctx.fillRect(px, pipY, 10, 10);
        ctx.strokeStyle = "#555";
        ctx.strokeRect(px, pipY, 10, 10);
      }
      if (!ready && ability.cooldownLeft > 0) {
        ctx.fillStyle = "#aaa";
        ctx.font = "9px Courier New";
        ctx.fillText(`${ability.cooldownLeft.toFixed(1)}s`, x + 58, y + 40);
      }
    } else {
      const barX = x + 58;
      const barW = 94;
      const barH = 10;
      const barY = y + 24;
      const pct =
        ability.cooldown > 0
          ? 1 - Math.min(1, ability.cooldownLeft / ability.cooldown)
          : 1;
      ctx.fillStyle = "#333";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = ready ? (ability.color || "#5dade2") : "#7f8c8d";
      ctx.fillRect(barX, barY, barW * (ready ? 1 : pct), barH);
      ctx.strokeStyle = "#555";
      ctx.strokeRect(barX, barY, barW, barH);
      if (!ready && ability.cooldownLeft > 0) {
        ctx.fillStyle = "#ecf0f1";
        ctx.font = "9px Courier New";
        ctx.textAlign = "center";
        ctx.fillText(ability.cooldownLeft.toFixed(1), barX + barW / 2, barY + 8);
        ctx.textAlign = "left";
      }
    }
  }

  drawToasts(toasts) {
    if (!toasts?.length) return;
    const ctx = this.ctx;
    ctx.textAlign = "center";
    ctx.font = "bold 14px Courier New";
    let toastY = this.barHeight + 22;
    for (const toast of toasts) {
      ctx.fillStyle = "#f1c40f";
      ctx.fillText(toast.text, this.width / 2, toastY);
      toastY += 18;
    }
    ctx.textAlign = "left";
  }
}
