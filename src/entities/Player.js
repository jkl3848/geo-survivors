import { wrapPosition } from "../core/Vec2.js";

export class Player {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.stats = {};
    this.radius = 16;
    this.pickupRadius = 24;
    this.projectileRadius = 4;
    this.pierce = 0;
    this.contactCooldown = 0;
    this.fireCooldown = 0;
    this.upgradeStacks = {};
    this.specialAbilities = {};
    this.pixelArt = null;
    this.bodyBounds = null;
    this.color = "#5dade2";
    this.displayWidth = 16;
    this.displayHeight = 16;
    this.hitFlash = 0;
    this.hitFlashDuration = 0.15;
    this.alive = true;
  }

  init(x, y, baseStats, pixelArt, bodyBounds, playerConfig, color = "#5dade2") {
    this.x = x;
    this.y = y;
    this.stats = { ...baseStats };
    this.maxHp = baseStats.hp;
    this.hp = baseStats.hp;
    this.pixelArt = pixelArt;
    this.bodyBounds = bodyBounds;
    this.color = color;
    this.hitFlashDuration = playerConfig.hitFlashDuration || 0.15;
    this.hitFlash = 0;

    const maxDim = Math.max(bodyBounds.width, bodyBounds.height, 1);
    const minSize = playerConfig.minDisplaySize || 14;
    const maxSize = playerConfig.maxDisplaySize || 22;
    const targetSize = Math.min(maxSize, Math.max(minSize, maxDim * 0.45));
    const scale = targetSize / maxDim;
    this.displayWidth = bodyBounds.width * scale;
    this.displayHeight = bodyBounds.height * scale;
    this.radius = Math.max(this.displayWidth, this.displayHeight) / 2;
    this.pickupRadius = playerConfig.pickupRadius;
    this.projectileRadius = playerConfig.projectileRadius;
    this.pierce = 0;
    this.contactCooldown = 0;
    this.fireCooldown = 0;
    this.upgradeStacks = {};
    this.specialAbilities = {};
    this.alive = true;
  }

  hasSpecial(effect) {
    return (this.specialAbilities[effect]?.stacks || 0) > 0;
  }

  getSpecial(effect) {
    return this.specialAbilities[effect] || null;
  }

  applyUpgrade(upgrade, modifierMode) {
    if (upgrade.effect) {
      this._applySpecialUpgrade(upgrade);
      return;
    }

    const stacks = (this.upgradeStacks[upgrade.id] || 0) + 1;
    this.upgradeStacks[upgrade.id] = stacks;

    if (modifierMode === "instant" || upgrade.modifierMode === "instant") {
      if (upgrade.modifiers.healPercent) {
        this.hp = Math.min(
          this.maxHp,
          this.hp + this.maxHp * upgrade.modifiers.healPercent,
        );
      }
      return;
    }

    const mode = upgrade.modifierMode || modifierMode;
    for (const [key, value] of Object.entries(upgrade.modifiers)) {
      if (key === "pickupRadius") {
        this.pickupRadius *= 1 + value;
      } else if (key === "projectileRadius") {
        this.projectileRadius *= 1 + value;
      } else if (key === "pierce") {
        this.pierce += value;
      } else if (key === "hp") {
        const oldMax = this.maxHp;
        this.stats.hp =
          (this.stats.hp || 0) * (mode === "additive" ? 1 + value : 1 + value);
        this.maxHp = this.stats.hp;
        this.hp += this.maxHp - oldMax;
      } else if (this.stats[key] !== undefined) {
        if (mode === "additive") {
          this.stats[key] += value;
        } else {
          this.stats[key] *= 1 + value;
        }
      }
    }
  }

  _applySpecialUpgrade(upgrade) {
    const stacks = (this.upgradeStacks[upgrade.id] || 0) + 1;
    this.upgradeStacks[upgrade.id] = stacks;

    const effect = upgrade.effect;
    if (!this.specialAbilities[effect]) {
      this.specialAbilities[effect] = { stacks: 0, ...(upgrade.params || {}) };
    }
    this.specialAbilities[effect].stacks = stacks;
  }

  getStat(name) {
    return this.stats[name] ?? 0;
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.hp -= amount;
    this.hitFlash = this.hitFlashDuration;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  update(dt, input, worldW, worldH) {
    if (!this.alive) return;

    const move = input.getMovement();
    const speed = this.getStat("speed");
    this.x += move.x * speed * dt;
    this.y += move.y * speed * dt;
    wrapPosition(this, worldW, worldH);

    const regen = this.getStat("healthRegen");
    if (regen > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + regen * dt);
    }

    if (this.contactCooldown > 0) {
      this.contactCooldown -= dt;
    }

    if (this.fireCooldown > 0) {
      this.fireCooldown -= dt;
    }

    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
    }
  }

  canFire() {
    return this.alive && this.fireCooldown <= 0;
  }

  resetFireCooldown() {
    const rate = this.getStat("attackSpeed");
    this.fireCooldown = rate > 0 ? 1 / rate : 1;
  }
}
