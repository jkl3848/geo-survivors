export class AbilitySystem {
  constructor({
    player,
    tuning,
    combatSystem,
    vfx,
    getEnemies,
    getProjectiles,
    queryRadius,
    spawnProjectile,
    onDeath,
  }) {
    this.player = player;
    this.tuning = tuning || {};
    this.combatSystem = combatSystem;
    this.vfx = vfx;
    this.getEnemies = getEnemies;
    this.getProjectiles = getProjectiles;
    this.queryRadius = queryRadius;
    this.spawnProjectile = spawnProjectile;
    this.onDeath = onDeath;
    this.timers = {};
    this._auraAcc = 0;
    this._auraVfx = 0;
  }

  reset() {
    this.timers = {};
    this._auraAcc = 0;
    this._auraVfx = 0;
  }

  _attack() {
    return Math.max(1, this.player.getStat("attack"));
  }

  _rollCount(chance, cap) {
    let count = 0;
    let left = chance;
    while (left > 0 && count < cap) {
      if (Math.random() < Math.min(1, left)) count++;
      left -= 1;
    }
    return count;
  }

  buildVolley(angle) {
    const combat = this.player.combat;
    const angles = [];
    const base = this.tuning.fanSpacing || 0.32;
    const min = this.tuning.fanSpacingMin || 0.07;

    const fan = (count, center) => {
      const n = Math.max(0, Math.round(count));
      if (n <= 0) return;
      const step = n <= 1 ? 0 : Math.max(min, base / Math.sqrt(n));
      const spread = combat.shotSpread || 0;
      for (let i = 0; i < n; i++) {
        let shot = center + step * (i - (n - 1) / 2);
        if (spread > 0) shot += (Math.random() - 0.5) * spread;
        angles.push(shot);
      }
    };

    fan(Math.max(1, combat.forwardShots || 1), angle);
    fan(combat.rearShots || 0, angle + Math.PI);
    fan(combat.sideShots || 0, angle + Math.PI / 2);
    fan(combat.sideShots || 0, angle - Math.PI / 2);
    return angles;
  }

  update(dt) {
    this._tickStatus(dt);
    this._tickAura(dt);
    this._tickBall(dt);
    this._tickEffect("storm", dt, (spec) => this._storm(spec));
    this._tickEffect("thunderstorm", dt, (spec) => this._storm(spec));
    this._tickEffect("meteor", dt, (spec) => this._meteor(spec));
    this._tickEffect("nova", dt, (spec) => this._nova(spec));
  }

  _tickEffect(name, dt, fn) {
    const spec = this.player.getSpecial(name);
    if (!spec) return;
    if (this.timers[name] == null) {
      this.timers[name] = Math.min(0.8, (spec.interval || 2) * 0.35);
    }
    this.timers[name] -= dt;
    if (this.timers[name] > 0) return;
    this.timers[name] = Math.max(0.4, spec.interval || 2);
    fn(spec);
  }

  _tickStatus(dt) {
    const enemies = this.getEnemies().slice();
    for (const enemy of enemies) {
      if (!enemy.active || !enemy.status) continue;
      const status = enemy.status;
      if (status.freeze > 0) status.freeze = Math.max(0, status.freeze - dt);
      if (status.slow > 0) status.slow = Math.max(0, status.slow - dt);
      if (status.shock > 0) status.shock = Math.max(0, status.shock - dt);
      if (status.stun > 0) status.stun = Math.max(0, status.stun - dt);
      if (status.charm > 0) status.charm = Math.max(0, status.charm - dt);
      if (status.slow <= 0) status.slowAmount = 0;

      const burn = status.burn;
      if (!burn) continue;
      burn.timeLeft -= dt;
      burn.acc += dt;
      if (burn.acc >= 0.25) {
        const step = burn.acc;
        burn.acc = 0;
        this.dealDamage(enemy, burn.dps * step, {
          source: "burn",
          canProc: false,
          ignoreDefense: true,
          allowCrit: false,
          depth: 0,
        });
      }
      if (enemy.status?.burn && burn.timeLeft <= 0) enemy.status.burn = null;
    }
  }

  _tickAura(dt) {
    const aura = this.player.getSpecial("aura");
    if (!aura) return;
    this._auraAcc += dt;
    this._auraVfx += dt;
    if (this._auraVfx >= 0.8) {
      this._auraVfx = 0;
      this.vfx.ring(
        this.player.x,
        this.player.y,
        aura.radius || 110,
        "#aed6f1",
      );
    }
    if (this._auraAcc < 0.25) return;
    this._auraAcc = 0;
    const hits = this.queryRadius(
      this.player.x,
      this.player.y,
      aura.radius || 110,
    );
    for (const enemy of hits) {
      if (!enemy.active || !enemy.maxHp) continue;
      this._applySlow(enemy, aura.slow);
    }
  }

  _tickBall(dt) {
    const spec = this.player.getSpecial("ball_lightning");
    if (!spec) return;
    const interval = Math.max(0.15, spec.interval || 0.4);
    const radius = spec.radius || 48;
    const damage = this._attack() * (spec.damage || 0.3);
    for (const proj of this.getProjectiles()) {
      if (!proj.active || proj.source !== "projectile") continue;
      proj.zapTimer -= dt;
      if (proj.zapTimer > 0) continue;
      proj.zapTimer = interval;
      const hits = this.queryRadius(proj.x, proj.y, radius);
      let zapped = 0;
      for (const enemy of hits) {
        if (!enemy.active || !enemy.maxHp || enemy.hp <= 0) continue;
        this.vfx.arc(proj.x, proj.y, enemy.x, enemy.y, "#f9e79f");
        this.dealDamage(enemy, damage, {
          source: "zap",
          canProc: false,
          depth: 1,
          allowCrit: false,
        });
        zapped++;
        if (zapped >= 2) break;
      }
    }
  }

  _storm(spec) {
    const enemies = this.getEnemies().filter((e) => e.active && e.maxHp && e.hp > 0);
    if (!enemies.length) return;
    const range = spec.range || 320;
    const px = this.player.x;
    const py = this.player.y;
    const rangeSq = range * range;
    const inRange = enemies.filter((e) => {
      const dx = e.x - px;
      const dy = e.y - py;
      return dx * dx + dy * dy <= rangeSq;
    });
    const pool = inRange.length ? inRange : enemies;
    const bolts = Math.max(1, Math.round(spec.bolts || 1));
    const damage = this._attack() * (spec.damage || 1);
    for (let i = 0; i < bolts; i++) {
      const target = pool[Math.floor(Math.random() * pool.length)];
      if (!target?.active || target.hp <= 0) continue;
      this.vfx.arc(px, py, target.x, target.y, "#f4d03f");
      this.dealDamage(target, damage, {
        source: "storm",
        canProc: true,
        depth: 0,
      });
    }
  }

  _meteor(spec) {
    const radius = spec.radius || 96;
    const target = this._densest(radius);
    if (!target) return;
    this.vfx.ring(target.x, target.y, radius, "#e74c3c");
    const damage = this._attack() * (spec.damage || 2.2);
    const hits = this.queryRadius(target.x, target.y, radius);
    for (const enemy of hits) {
      if (!enemy.active || !enemy.maxHp || enemy.hp <= 0) continue;
      this._applyBurn(enemy);
      this.dealDamage(enemy, damage, {
        source: "meteor",
        canProc: false,
        depth: 1,
        allowCrit: false,
      });
    }
  }

  _nova(spec) {
    const radius = spec.radius || 140;
    this.vfx.ring(this.player.x, this.player.y, radius, "#d4e6f1");
    const hits = this.queryRadius(this.player.x, this.player.y, radius);
    const damage = spec.damage ? this._attack() * spec.damage : 0;
    for (const enemy of hits) {
      if (!enemy.active || !enemy.maxHp || enemy.hp <= 0) continue;
      this._applyFreeze(enemy, spec.freeze || 1.2);
      this._applySlow(enemy);
      if (damage > 0) {
        this.dealDamage(enemy, damage, {
          source: "nova",
          canProc: true,
          depth: 0,
        });
      }
    }
  }

  _densest(radius) {
    const enemies = this.getEnemies().filter((e) => e.active && e.maxHp && e.hp > 0);
    if (!enemies.length) return null;
    const step = Math.max(1, Math.ceil(enemies.length / 24));
    let best = enemies[0];
    let bestCount = -1;
    for (let i = 0; i < enemies.length; i += step) {
      const enemy = enemies[i];
      const count = this.queryRadius(enemy.x, enemy.y, radius).length;
      if (count > bestCount) {
        bestCount = count;
        best = enemy;
      }
    }
    return best;
  }

  dealDamage(enemy, amount, ctx = {}) {
    if (!enemy?.active || enemy.hp <= 0 || amount <= 0) return false;

    const depth = ctx.depth || 0;
    const maxDepth = this.tuning.maxProcDepth ?? 3;
    const combat = this.player.combat;
    let damage = amount;
    let isCrit = false;

    if (this.player.damageBonus > 0) {
      damage *= 1 + this.player.damageBonus;
    }
    if (ctx.allowCrit !== false && Math.random() < (combat.critChance || 0)) {
      isCrit = true;
      damage *= combat.critMultiplier || 1.5;
    }
    if ((enemy.status?.shock || 0) > 0) {
      damage *= 1 + (combat.shockBonus || 0);
    }
    if ((enemy.status?.freeze || 0) > 0 && combat.shatterBonus > 0) {
      damage *= 1 + combat.shatterBonus;
    }
    if ((enemy.status?.charm || 0) > 0) {
      const heartache = this.player.abilityMods?.heartache || 0;
      if (heartache > 0) damage *= 1 + heartache;
    }
    if (
      combat.thermalShock > 0 &&
      enemy.status?.burn &&
      (enemy.status?.freeze || 0) > 0
    ) {
      damage *= 1 + (this.tuning.thermalShockBonus ?? 0.75);
    }
    if (!ctx.ignoreDefense) {
      const defense = enemy.defense || 0;
      const k = this.tuning.defenseK || 90;
      damage *= 1 - defense / (defense + k);
    }

    const minDamage = this.combatSystem?.statsConfig?.damageFormula?.minDamage ?? 1;
    damage = Math.max(minDamage, damage);

    if (isCrit) {
      if (ctx.projectile) ctx.projectile.critFlash = 0.14;
      this.vfx.number(
        enemy.x,
        enemy.y - enemy.radius,
        Math.round(damage),
        "#f7dc6f",
      );
    }

    const killed = enemy.takeDamage(damage);
    const canProc = ctx.canProc !== false && depth < maxDepth;
    if (canProc && enemy.active) this.onHit(enemy, amount, ctx);
    if (killed && enemy.active && depth < maxDepth) this.onKill(enemy, ctx);
    if (killed && enemy.active) this.onDeath(enemy);
    return killed;
  }

  onHit(enemy, baseDamage, ctx) {
    if (!enemy?.active) return;
    const combat = this.player.combat;
    const depth = ctx.depth || 0;

    const chains = this._rollCount(combat.chainChance || 0, 3);
    for (let i = 0; i < chains; i++) {
      this._chain(enemy, baseDamage, depth);
    }
    if ((combat.burnChance || 0) > 0 && Math.random() < Math.min(1, combat.burnChance)) {
      this._applyBurn(enemy);
    }
    if ((combat.slowChance || 0) > 0 && Math.random() < Math.min(1, combat.slowChance)) {
      this._applySlow(enemy);
    }
    if ((combat.freezeChance || 0) > 0 && Math.random() < Math.min(1, combat.freezeChance)) {
      this._applyFreeze(enemy);
    }
    if (
      ctx.source === "projectile" &&
      (combat.napalm || 0) > 0 &&
      Math.random() < Math.min(1, combat.napalm)
    ) {
      this._explode(
        enemy.x,
        enemy.y,
        this._attack() * (combat.explosionDamage || 0),
        depth,
        (combat.burnSpread || 0) > 0,
      );
    }
  }

  onKill(enemy, ctx) {
    const combat = this.player.combat;
    const depth = ctx.depth || 0;
    const burning = !!enemy.status?.burn;
    const frozen = (enemy.status?.freeze || 0) > 0;

    if (
      burning &&
      (combat.explodeChance || 0) > 0 &&
      Math.random() < Math.min(1, combat.explodeChance)
    ) {
      this._explode(
        enemy.x,
        enemy.y,
        this._attack() * (combat.explosionDamage || 0),
        depth,
        (combat.burnSpread || 0) > 0,
      );
    }
    if (
      frozen &&
      (combat.shatterShards || 0) > 0 &&
      Math.random() < Math.min(1, combat.shatterShards)
    ) {
      this._spawnShards(enemy.x, enemy.y, depth);
    }
  }

  onPlayerHit(damageTaken, touching) {
    const combat = this.player.combat;
    if ((combat.glacialArmor || 0) > 0) {
      for (const enemy of touching) {
        if (enemy.active) this._applySlow(enemy);
      }
      this.vfx.ring(this.player.x, this.player.y, this.player.radius + 14, "#85c1e9");
    }
    if ((combat.retaliationRadius || 0) > 0 && damageTaken > 0) {
      const radius = combat.retaliationRadius;
      this.vfx.ring(this.player.x, this.player.y, radius, "#e74c3c");
      const damage = damageTaken * (combat.retaliationDamage || 1);
      const hits = this.queryRadius(this.player.x, this.player.y, radius);
      for (const enemy of hits) {
        if (!enemy.active || !enemy.maxHp || enemy.hp <= 0) continue;
        this.dealDamage(enemy, damage, {
          source: "retaliation",
          canProc: false,
          depth: 1,
          allowCrit: false,
        });
      }
    }
  }

  redirectProjectile(proj) {
    const range = this.tuning.ricochetRange || 250;
    const next = this._nearest(proj.x, proj.y, range, proj.hitIds);
    if (!next) return false;
    const dx = next.x - proj.x;
    const dy = next.y - proj.y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = Math.hypot(proj.vx, proj.vy) || 1;
    proj.vx = (dx / dist) * speed;
    proj.vy = (dy / dist) * speed;
    this.vfx.arc(proj.x, proj.y, next.x, next.y, proj.color || "#ecf0f1");
    return true;
  }

  _chain(from, baseDamage, depth) {
    const jumps = Math.round(this.player.combat.chainJumps || 0);
    if (jumps <= 0 || !from?.active) return;
    const range = this.tuning.chainRange || 150;
    const frac = this.player.combat.chainDamage || 0.45;
    let current = from;
    const seen = new Set([from]);
    let damage = baseDamage * frac;
    for (let i = 0; i < jumps; i++) {
      const next = this._nearest(current.x, current.y, range, seen);
      if (!next) break;
      seen.add(next);
      this.vfx.arc(current.x, current.y, next.x, next.y, "#f4d03f");
      if ((this.player.combat.shockOnChain || 0) > 0) this._applyShock(next);
      if ((this.player.combat.plasma || 0) > 0) this._applyBurn(next);
      this.dealDamage(next, damage, {
        source: "chain",
        canProc: false,
        depth: depth + 1,
        allowCrit: false,
      });
      damage *= 0.8;
      current = next;
    }
  }

  _explode(x, y, damage, depth, spreadBurn) {
    if (damage <= 0) return;
    const radius = this.tuning.explosionRadius || 74;
    this.vfx.ring(x, y, radius, "#e67e22");
    const hits = this.queryRadius(x, y, radius);
    const spread = this.player.combat.burnSpread || 0;
    for (const enemy of hits) {
      if (!enemy.active || !enemy.maxHp || enemy.hp <= 0) continue;
      if (spreadBurn && spread > 0 && Math.random() < Math.min(1, spread)) {
        this._applyBurn(enemy);
      }
      this.dealDamage(enemy, damage, {
        source: "explosion",
        canProc: false,
        depth: depth + 1,
        allowCrit: false,
      });
    }
  }

  _spawnShards(x, y, depth) {
    const count = this.tuning.shardCount || 5;
    const damage = this._attack() * (this.tuning.shardDamage || 0.28);
    this.vfx.shards(x, y);
    const canProc = (this.player.combat.staticShards || 0) > 0;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
      this.spawnProjectile({
        x,
        y,
        angle,
        speed: this.tuning.shardSpeed || 260,
        damage,
        radius: 3,
        pierce: 1,
        lifetime: this.tuning.shardLifetime || 0.85,
        color: "#d4e6f1",
        canProc,
        procDepth: depth + 1,
        source: "shard",
        allowCrit: false,
        ricochet: 0,
      });
    }
  }

  _nearest(x, y, range, seen) {
    const hits = this.queryRadius(x, y, range);
    let best = null;
    let bestDist = Infinity;
    for (const enemy of hits) {
      if (!enemy.active || !enemy.maxHp || enemy.hp <= 0 || seen.has(enemy)) continue;
      const dx = enemy.x - x;
      const dy = enemy.y - y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = enemy;
      }
    }
    return best;
  }

  _applyBurn(enemy) {
    if (!enemy?.active || enemy.hp <= 0) return;
    const dps = this._attack() * Math.max(0, this.player.combat.burnDps || 0);
    if (dps <= 0) return;
    const duration = Math.max(0.5, this.player.combat.burnDuration || 2.5);
    const prev = enemy.status.burn;
    if (!prev) {
      enemy.status.burn = { dps, timeLeft: duration, acc: 0 };
    } else {
      prev.dps = Math.max(prev.dps, dps);
      prev.timeLeft = Math.max(prev.timeLeft, duration);
    }
  }

  _applySlow(enemy, amountOverride) {
    if (!enemy?.active || enemy.hp <= 0) return;
    let amount =
      amountOverride != null ? amountOverride : this.player.combat.slowAmount || 0.25;
    amount = Math.min(0.8, amount);
    if (enemy.isBoss) amount = Math.min(amount, this.tuning.bossSlowCap ?? 0.3);
    const duration = Math.max(0.4, this.player.combat.slowDuration || 1.6);
    enemy.status.slow = Math.max(enemy.status.slow, duration);
    enemy.status.slowAmount = Math.max(enemy.status.slowAmount || 0, amount);
  }

  _applyFreeze(enemy, durationOverride) {
    if (!enemy?.active || enemy.hp <= 0) return;
    let duration =
      durationOverride != null
        ? durationOverride
        : this.player.combat.freezeDuration || 1.2;
    if (enemy.isBoss) duration *= this.tuning.bossFreezeScale ?? 0.35;
    enemy.status.freeze = Math.max(enemy.status.freeze, duration);
  }

  _applyShock(enemy) {
    if (!enemy?.active || enemy.hp <= 0) return;
    const duration = this.player.combat.shockDuration || 3.5;
    enemy.status.shock = Math.max(enemy.status.shock, duration);
  }
}
