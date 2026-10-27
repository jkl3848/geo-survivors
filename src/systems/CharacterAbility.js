const COOLDOWN_FLOOR = 0.4;

export class CharacterAbility {
  constructor({
    color,
    player,
    abilitySystem,
    vfx,
    input,
    getEnemies,
    getXpOrbs,
    queryRadius,
    spawnProjectile,
    getAimAngle,
  }) {
    this.def = color?.ability || null;
    this.colorId = color?.id || null;
    this.colorHex = color?.hex || "#5dade2";
    this.player = player;
    this.abilitySystem = abilitySystem;
    this.vfx = vfx;
    this.input = input;
    this.getEnemies = getEnemies;
    this.getXpOrbs = getXpOrbs;
    this.queryRadius = queryRadius;
    this.spawnProjectile = spawnProjectile;
    this.getAimAngle = getAimAngle;

    this.cooldownLeft = 0;
    this.charges = 1;
    this.maxCharges = 1;
    this.active = null;
    this.fx = {};
    this._history = [];
    this._historyAcc = 0;
    this._dashHit = new Set();
    this._barrierHit = new Set();
    this._bloodlust = null;
    this._jackpot = null;
    this._aftershock = null;
  }

  reset() {
    this.cooldownLeft = 0;
    const params = this.getParams();
    this.maxCharges = Math.max(1, Math.round(params.charges || 1));
    this.charges = this.maxCharges;
    this.active = null;
    this.fx = {};
    this._history = [];
    this._historyAcc = 0;
    this._dashHit.clear();
    this._barrierHit.clear();
    this._bloodlust = null;
    this._jackpot = null;
    this._aftershock = null;
    if (this.player) {
      this.player.speedMult = 1;
      this.player.invulnTimer = 0;
      this.player.damageBonus = 0;
      this.player.attackSpeedBonus = 0;
    }
  }

  getParams() {
    const base = this.def?.params || {};
    const mods = this.player?.abilityMods || {};
    const out = { ...base };
    for (const [key, value] of Object.entries(mods)) {
      out[key] = (out[key] || 0) + value;
    }
    const baseCd = this.def?.cooldown || 10;
    out.cooldown = Math.max(baseCd * COOLDOWN_FLOOR, baseCd + (mods.cooldown || 0));
    if (out.hpCost != null) out.hpCost = Math.max(0.02, out.hpCost);
    if (out.charges != null) out.charges = Math.max(1, Math.round(out.charges));
    return out;
  }

  getHudState() {
    if (!this.def) return null;
    const params = this.getParams();
    const maxCharges = Math.max(1, Math.round(params.charges || 1));
    this.maxCharges = maxCharges;
    const ready = this.charges > 0 && this.cooldownLeft <= 0;
    return {
      name: this.def.name,
      id: this.def.id,
      color: this.colorHex,
      cooldown: params.cooldown,
      cooldownLeft: Math.max(0, this.cooldownLeft),
      charges: this.charges,
      maxCharges,
      ready,
      active: !!this.active,
    };
  }

  getXpBonus() {
    return this._jackpot?.xpBonus || 0;
  }

  getHeartache() {
    return this.player?.abilityMods?.heartache
      ? this.getParams().heartache || 0
      : this.getParams().heartache || 0;
  }

  tryActivate() {
    if (!this.def || !this.player?.alive) return false;
    if (this.charges <= 0) return false;

    const handler = HANDLERS[this.def.id];
    if (!handler?.activate) return false;
    const params = this.getParams();
    const ok = handler.activate(this, params);
    if (!ok) return false;

    this.charges = Math.max(0, this.charges - 1);
    if (this.cooldownLeft <= 0) {
      this.cooldownLeft = params.cooldown;
    }
    return true;
  }

  update(dt) {
    if (!this.def || !this.player?.alive) return;
    const params = this.getParams();
    this.maxCharges = Math.max(1, Math.round(params.charges || 1));

    if (this.def.id === "rewind") this._recordHistory(dt, params);

    if (this.cooldownLeft > 0) {
      this.cooldownLeft -= dt;
      if (this.cooldownLeft <= 0) {
        this.cooldownLeft = 0;
        if (this.charges < this.maxCharges) {
          this.charges = Math.min(this.maxCharges, this.charges + 1);
          if (this.charges < this.maxCharges) {
            this.cooldownLeft = params.cooldown;
          }
        }
      }
    } else if (this.charges < this.maxCharges) {
      this.charges = Math.min(this.maxCharges, this.charges + 1);
      if (this.charges < this.maxCharges) this.cooldownLeft = params.cooldown;
    }

    if (this._bloodlust) {
      this._bloodlust.timeLeft -= dt;
      if (this._bloodlust.timeLeft <= 0) {
        this.player.attackSpeedBonus = 0;
        this.player.damageBonus = 0;
        this._bloodlust = null;
      }
    }

    if (this._jackpot) {
      this._jackpot.timeLeft -= dt;
      if (this._jackpot.timeLeft <= 0) this._jackpot = null;
    }

    if (this._aftershock) {
      this._aftershock.delay -= dt;
      if (this._aftershock.delay <= 0) {
        const a = this._aftershock;
        this._aftershock = null;
        slam(this, a.params, a.damageMul, false);
      }
    }

    const handler = HANDLERS[this.def.id];
    if (this.active && handler?.tick) {
      handler.tick(this, this.active, dt);
      this.active.timeLeft -= dt;
      if (this.active.timeLeft <= 0) {
        handler.end?.(this, this.active);
        this.active = null;
      }
    }
  }

  draw(ctx) {
    if (!this.def) return;
    const handler = HANDLERS[this.def.id];
    handler?.draw?.(this, ctx);
  }

  onEnemyKilled() {
    if (!this._bloodlust?.leech) return;
    const heal = this.player.maxHp * this._bloodlust.leech;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
  }

  _recordHistory(dt, params) {
    this._historyAcc += dt;
    if (this._historyAcc < 0.05) return;
    this._historyAcc = 0;
    this._history.push({
      x: this.player.x,
      y: this.player.y,
      hp: this.player.hp,
      t: performance.now() / 1000,
    });
    const lookback = params.lookback || 3;
    const cutoff = performance.now() / 1000 - lookback - 0.5;
    while (this._history.length && this._history[0].t < cutoff) {
      this._history.shift();
    }
  }

  _attack() {
    return Math.max(1, this.player.getStat("attack"));
  }

  _applyKnockback(enemy, fromX, fromY, force) {
    if (!enemy?.active || force <= 0) return;
    const dx = enemy.x - fromX;
    const dy = enemy.y - fromY;
    const dist = Math.hypot(dx, dy) || 1;
    const scale = enemy.isBoss ? 0.25 : 1;
    enemy.kbVx = (dx / dist) * force * scale;
    enemy.kbVy = (dy / dist) * force * scale;
  }

  _applyStun(enemy, duration) {
    if (!enemy?.active) return;
    let d = duration;
    if (enemy.isBoss) d *= 0.35;
    enemy.status.stun = Math.max(enemy.status.stun || 0, d);
  }

  _applyCharm(enemy, duration) {
    if (!enemy?.active) return;
    let d = duration;
    if (enemy.isBoss) d *= 0.25;
    enemy.status.charm = Math.max(enemy.status.charm || 0, d);
  }
}

function pointInBeam(px, py, ox, oy, angle, length, width) {
  const dx = px - ox;
  const dy = py - oy;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const along = dx * cos + dy * sin;
  if (along < 0 || along > length) return false;
  const across = -dx * sin + dy * cos;
  return Math.abs(across) <= width * 0.5;
}

function slam(self, params, damageMul = 1, scheduleAftershock = true) {
  const radius = params.radius || 130;
  const damage = self._attack() * (params.damage || 1) * damageMul;
  self.vfx.ring(self.player.x, self.player.y, radius, "#566573");
  const hits = self.queryRadius(self.player.x, self.player.y, radius);
  for (const enemy of hits) {
    if (!enemy.active || !enemy.maxHp || enemy.hp <= 0) continue;
    self._applyKnockback(enemy, self.player.x, self.player.y, params.knockback || 220);
    self._applyStun(enemy, params.stun || 0.6);
    self.abilitySystem.dealDamage(enemy, damage, {
      source: "tremor",
      canProc: false,
      depth: 1,
      allowCrit: false,
    });
  }
  if (scheduleAftershock && (params.aftershock || 0) > 0) {
    self._aftershock = {
      delay: params.aftershockDelay || 0.5,
      params,
      damageMul: params.aftershock,
    };
  }
}

const HANDLERS = {
  barrier: {
    activate(self, params) {
      self.active = {
        timeLeft: params.duration || 2,
        radius: params.radius || 42,
        repelDamage: params.repelDamage || 0,
        knockback: params.knockback || 0,
        tickAcc: 0,
      };
      self._barrierHit.clear();
      self.player.invulnTimer = Math.max(self.player.invulnTimer, params.duration || 2);
      self.vfx.ring(self.player.x, self.player.y, params.radius || 42, self.colorHex);
      return true;
    },
    tick(self, state, dt) {
      self.player.invulnTimer = Math.max(self.player.invulnTimer, state.timeLeft);
      if ((state.repelDamage || 0) <= 0 && (state.knockback || 0) <= 0) return;
      state.tickAcc += dt;
      if (state.tickAcc < 0.1) return;
      state.tickAcc = 0;
      const hits = self.queryRadius(self.player.x, self.player.y, state.radius + 8);
      for (const enemy of hits) {
        if (!enemy.active || !enemy.maxHp || enemy.hp <= 0) continue;
        if (!self._barrierHit.has(enemy)) {
          self._barrierHit.add(enemy);
          if (state.knockback > 0) {
            self._applyKnockback(enemy, self.player.x, self.player.y, state.knockback);
          }
          if (state.repelDamage > 0) {
            self.abilitySystem.dealDamage(enemy, self._attack() * state.repelDamage, {
              source: "barrier",
              canProc: false,
              depth: 1,
              allowCrit: false,
            });
          }
        }
      }
    },
    draw(self, ctx) {
      if (!self.active) return;
      const r = self.active.radius;
      ctx.save();
      ctx.strokeStyle = self.colorHex;
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(performance.now() / 120);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(self.player.x, self.player.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = self.colorHex;
      ctx.fill();
      ctx.restore();
    },
  },

  bloodlust: {
    activate(self, params) {
      const cost = Math.max(1, self.player.hp * (params.hpCost || 0.1));
      if (self.player.hp <= cost + 1) return false;
      self.player.hp = Math.max(1, self.player.hp - cost);
      self._bloodlust = {
        timeLeft: params.duration || 4,
        leech: params.leech || 0,
      };
      self.player.attackSpeedBonus = params.attackSpeedBonus || 0.35;
      self.player.damageBonus = params.damageBonus || 0.2;
      self.vfx.ring(self.player.x, self.player.y, 36, self.colorHex);
      return true;
    },
  },

  overgrowth: {
    activate(self, params) {
      self.active = {
        timeLeft: params.duration || 5,
        x: self.player.x,
        y: self.player.y,
        radius: params.radius || 90,
        healPerSec: params.healPerSec || 0.02,
        slow: params.slow || 0.25,
        thorns: params.thorns || 0,
        tickAcc: 0,
      };
      self.vfx.ring(self.active.x, self.active.y, self.active.radius, self.colorHex);
      return true;
    },
    tick(self, state, dt) {
      state.tickAcc += dt;
      const dx = self.player.x - state.x;
      const dy = self.player.y - state.y;
      if (dx * dx + dy * dy <= state.radius * state.radius) {
        self.player.hp = Math.min(
          self.player.maxHp,
          self.player.hp + self.player.maxHp * state.healPerSec * dt,
        );
      }
      if (state.tickAcc < 0.25) return;
      const step = state.tickAcc;
      state.tickAcc = 0;
      const hits = self.queryRadius(state.x, state.y, state.radius);
      for (const enemy of hits) {
        if (!enemy.active || !enemy.maxHp || enemy.hp <= 0) continue;
        self.abilitySystem._applySlow(enemy, state.slow);
        if (state.thorns > 0) {
          self.abilitySystem.dealDamage(enemy, self._attack() * state.thorns * step, {
            source: "overgrowth",
            canProc: false,
            depth: 1,
            allowCrit: false,
            ignoreDefense: true,
          });
        }
      }
    },
    draw(self, ctx) {
      if (!self.active) return;
      const s = self.active;
      ctx.save();
      ctx.strokeStyle = self.colorHex;
      ctx.fillStyle = self.colorHex;
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    },
  },

  jackpot: {
    activate(self, params) {
      const orbs = self.getXpOrbs?.() || [];
      for (const orb of orbs) {
        if (!orb.active) continue;
        orb.x = self.player.x;
        orb.y = self.player.y;
      }
      self._jackpot = {
        timeLeft: params.duration || 5,
        xpBonus: params.xpBonus || 0.5,
      };
      const coins = Math.round(params.coins || 0);
      if (coins > 0) {
        const damage = self._attack() * (params.coinDamage || 1);
        for (let i = 0; i < coins; i++) {
          const angle = (Math.PI * 2 * i) / coins;
          self.spawnProjectile({
            x: self.player.x,
            y: self.player.y,
            angle,
            speed: 320,
            damage,
            radius: 5,
            pierce: 1,
            lifetime: 0.9,
            color: self.colorHex,
            canProc: false,
            source: "coin",
            allowCrit: false,
            ricochet: 0,
          });
        }
      }
      self.vfx.ring(self.player.x, self.player.y, 60, self.colorHex);
      return true;
    },
  },

  gravity_well: {
    activate(self, params) {
      const angle = self.getAimAngle();
      const dist = 180;
      self.active = {
        timeLeft: params.duration || 2.5,
        x: self.player.x + Math.cos(angle) * dist,
        y: self.player.y + Math.sin(angle) * dist,
        radius: params.radius || 130,
        pull: params.pull || 140,
        damagePerSec: params.damagePerSec || 0.3,
        collapseDamage: params.collapseDamage || 0,
        tickAcc: 0,
      };
      self.vfx.ring(self.active.x, self.active.y, self.active.radius, self.colorHex);
      return true;
    },
    tick(self, state, dt) {
      state.tickAcc += dt;
      const hits = self.queryRadius(state.x, state.y, state.radius);
      for (const enemy of hits) {
        if (!enemy.active || !enemy.maxHp || enemy.hp <= 0) continue;
        const dx = state.x - enemy.x;
        const dy = state.y - enemy.y;
        const dist = Math.hypot(dx, dy) || 1;
        const pullScale = enemy.isBoss ? 0.2 : 1;
        enemy.kbVx = (enemy.kbVx || 0) + (dx / dist) * state.pull * pullScale * dt;
        enemy.kbVy = (enemy.kbVy || 0) + (dy / dist) * state.pull * pullScale * dt;
      }
      if (state.tickAcc < 0.25) return;
      const step = state.tickAcc;
      state.tickAcc = 0;
      for (const enemy of hits) {
        if (!enemy.active || !enemy.maxHp || enemy.hp <= 0) continue;
        self.abilitySystem.dealDamage(enemy, self._attack() * state.damagePerSec * step, {
          source: "gravity_well",
          canProc: false,
          depth: 1,
          allowCrit: false,
        });
      }
    },
    end(self, state) {
      if ((state.collapseDamage || 0) <= 0) return;
      self.vfx.ring(state.x, state.y, state.radius * 0.7, "#d2b4de");
      const hits = self.queryRadius(state.x, state.y, state.radius);
      const damage = self._attack() * state.collapseDamage;
      for (const enemy of hits) {
        if (!enemy.active || !enemy.maxHp || enemy.hp <= 0) continue;
        self.abilitySystem.dealDamage(enemy, damage, {
          source: "collapse",
          canProc: false,
          depth: 1,
          allowCrit: false,
        });
      }
    },
    draw(self, ctx) {
      if (!self.active) return;
      const s = self.active;
      ctx.save();
      ctx.fillStyle = self.colorHex;
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 10 + 4 * Math.sin(performance.now() / 80), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
  },

  tremor: {
    activate(self, params) {
      slam(self, params, 1, true);
      return true;
    },
  },

  phase_dash: {
    activate(self, params) {
      const move = self.input.getMovement();
      let dx = move.x;
      let dy = move.y;
      if (dx === 0 && dy === 0) {
        const angle = self.getAimAngle();
        dx = Math.cos(angle);
        dy = Math.sin(angle);
      } else {
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
      }
      const duration = params.dashDuration || 0.18;
      const distance = params.distance || 150;
      self.active = {
        timeLeft: duration,
        vx: (dx * distance) / duration,
        vy: (dy * distance) / duration,
        dashDamage: params.dashDamage || 0,
      };
      self._dashHit.clear();
      self.player.invulnTimer = Math.max(self.player.invulnTimer, duration);
      return true;
    },
    tick(self, state, dt) {
      self.player.x += state.vx * dt;
      self.player.y += state.vy * dt;
      self.player.invulnTimer = Math.max(self.player.invulnTimer, state.timeLeft);
      if ((state.dashDamage || 0) <= 0) return;
      const hits = self.queryRadius(self.player.x, self.player.y, self.player.radius + 10);
      for (const enemy of hits) {
        if (!enemy.active || !enemy.maxHp || enemy.hp <= 0) continue;
        if (self._dashHit.has(enemy)) continue;
        self._dashHit.add(enemy);
        self.abilitySystem.dealDamage(enemy, self._attack() * state.dashDamage, {
          source: "phase_dash",
          canProc: false,
          depth: 1,
          allowCrit: false,
        });
      }
    },
  },

  sentry: {
    activate(self, params) {
      self.active = {
        timeLeft: params.duration || 6,
        x: self.player.x,
        y: self.player.y,
        fireRate: params.fireRate || 2,
        shots: Math.max(1, Math.round(params.shots || 1)),
        damage: params.damage || 0.5,
        range: params.range || 280,
        smart: (params.smart || 0) > 0,
        fireAcc: 0,
      };
      self.vfx.ring(self.active.x, self.active.y, 24, self.colorHex);
      return true;
    },
    tick(self, state, dt) {
      state.fireAcc += dt;
      const interval = 1 / Math.max(0.5, state.fireRate);
      if (state.fireAcc < interval) return;
      state.fireAcc = 0;
      const target = self.abilitySystem._nearest(state.x, state.y, state.range, new Set());
      if (!target) return;
      const baseAngle = Math.atan2(target.y - state.y, target.x - state.x);
      const damage = self._attack() * state.damage;
      const n = state.shots;
      for (let i = 0; i < n; i++) {
        const spread = n <= 1 ? 0 : (i - (n - 1) / 2) * 0.18;
        self.spawnProjectile({
          x: state.x,
          y: state.y,
          angle: baseAngle + spread,
          speed: 380,
          damage,
          radius: 4,
          pierce: 0,
          lifetime: 1.2,
          color: self.colorHex,
          canProc: state.smart,
          source: "sentry",
          allowCrit: state.smart,
          ricochet: 0,
        });
      }
    },
    draw(self, ctx) {
      if (!self.active) return;
      const s = self.active;
      ctx.save();
      ctx.fillStyle = self.colorHex;
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#111";
      ctx.fillRect(s.x - 3, s.y - 3, 6, 6);
      ctx.restore();
    },
  },

  heartbreak: {
    activate(self, params) {
      const radius = params.radius || 140;
      const duration = params.duration || 2;
      self.vfx.ring(self.player.x, self.player.y, radius, self.colorHex);
      const hits = self.queryRadius(self.player.x, self.player.y, radius);
      for (const enemy of hits) {
        if (!enemy.active || !enemy.maxHp || enemy.hp <= 0) continue;
        self._applyCharm(enemy, duration);
      }
      const heal = params.healOnCast || 0;
      if (heal > 0) {
        self.player.hp = Math.min(self.player.maxHp, self.player.hp + self.player.maxHp * heal);
      }
      return true;
    },
  },

  rewind: {
    activate(self, params) {
      const lookback = params.lookback || 3;
      const now = performance.now() / 1000;
      let best = null;
      let bestDiff = Infinity;
      for (const snap of self._history) {
        const diff = Math.abs(snap.t - (now - lookback));
        if (diff < bestDiff) {
          bestDiff = diff;
          best = snap;
        }
      }
      if (!best) return false;
      const fromX = self.player.x;
      const fromY = self.player.y;
      self.player.x = best.x;
      self.player.y = best.y;
      if (best.hp > self.player.hp) {
        self.player.hp = Math.min(self.player.maxHp, best.hp);
      }
      const paradox = params.paradox || 0;
      if (paradox > 0) {
        self.player.invulnTimer = Math.max(self.player.invulnTimer, paradox);
      }
      const echo = params.echoDamage || 0;
      if (echo > 0) {
        const radius = params.echoRadius || 100;
        self.vfx.ring(fromX, fromY, radius, self.colorHex);
        const hits = self.queryRadius(fromX, fromY, radius);
        const damage = self._attack() * echo;
        for (const enemy of hits) {
          if (!enemy.active || !enemy.maxHp || enemy.hp <= 0) continue;
          self.abilitySystem.dealDamage(enemy, damage, {
            source: "echo",
            canProc: false,
            depth: 1,
            allowCrit: false,
          });
        }
      }
      self.vfx.ring(self.player.x, self.player.y, 40, self.colorHex);
      return true;
    },
  },

  solar_flare: {
    activate(self, params) {
      self.active = {
        timeLeft: (params.windup || 0.4) + (params.duration || 1.2),
        windupLeft: params.windup || 0.4,
        duration: params.duration || 1.2,
        length: params.length || 420,
        width: params.width || 28,
        tickRate: params.tickRate || 0.15,
        damage: params.damage || 0.6,
        sunspot: (params.sunspot || 0) > 0,
        moveSlow: params.moveSlow ?? 0.5,
        angle: self.getAimAngle(),
        tickAcc: 0,
        firing: false,
      };
      self.player.speedMult = params.moveSlow ?? 0.5;
      return true;
    },
    tick(self, state, dt) {
      if (state.windupLeft > 0) {
        state.windupLeft -= dt;
        state.angle = self.getAimAngle();
        if (state.windupLeft > 0) return;
        state.firing = true;
        state.tickAcc = 0;
      }
      self.player.speedMult = state.moveSlow;
      state.tickAcc += dt;
      if (state.tickAcc < state.tickRate) return;
      state.tickAcc = 0;
      const damage = self._attack() * state.damage;
      for (const enemy of self.getEnemies()) {
        if (!enemy.active || !enemy.maxHp || enemy.hp <= 0) continue;
        if (
          !pointInBeam(
            enemy.x,
            enemy.y,
            self.player.x,
            self.player.y,
            state.angle,
            state.length,
            state.width,
          )
        ) {
          continue;
        }
        self.abilitySystem.dealDamage(enemy, damage, {
          source: "solar_flare",
          canProc: false,
          depth: 1,
          allowCrit: false,
        });
        if (state.sunspot) self.abilitySystem._applyBurn(enemy);
      }
    },
    end(self) {
      self.player.speedMult = 1;
    },
    draw(self, ctx) {
      if (!self.active) return;
      const s = self.active;
      const x1 = self.player.x;
      const y1 = self.player.y;
      const x2 = x1 + Math.cos(s.angle) * s.length;
      const y2 = y1 + Math.sin(s.angle) * s.length;
      ctx.save();
      if (!s.firing && s.windupLeft > 0) {
        ctx.strokeStyle = self.colorHex;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (s.firing || s.windupLeft <= 0) {
        ctx.strokeStyle = self.colorHex;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = s.width;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.strokeStyle = "#fff";
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = Math.max(4, s.width * 0.35);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.restore();
    },
  },
};
