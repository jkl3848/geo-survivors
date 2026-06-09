export class LevelSystem {
  constructor(xpConfig, upgradesConfig) {
    this.xpConfig = xpConfig;
    this.upgradesConfig = upgradesConfig;
    this.level = 1;
    this.xp = 0;
    this.xpToNext = xpConfig.baseToLevel;
    this.pendingUpgrade = false;
    this.upgradeChoices = [];
    this.isSpecialRoll = false;
    this.isBossDrop = false;
    this.playerStacks = {};
  }

  reset() {
    this.level = 1;
    this.xp = 0;
    this.xpToNext = this.xpConfig.baseToLevel;
    this.pendingUpgrade = false;
    this.upgradeChoices = [];
    this.isSpecialRoll = false;
    this.isBossDrop = false;
    this.playerStacks = {};
  }

  _allUpgradePools() {
    const pools = [this.upgradesConfig.pool];
    if (this.upgradesConfig.specialPool?.length) {
      pools.push(this.upgradesConfig.specialPool);
    }
    if (this.upgradesConfig.bossDropPool?.length) {
      pools.push(this.upgradesConfig.bossDropPool);
    }
    return pools.flat();
  }

  _isSpecialLevel() {
    const interval = this.upgradesConfig.specialInterval || 5;
    return this.level > 0 && this.level % interval === 0;
  }

  addXP(amount) {
    this.xp += amount;
    if (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.xpToNext = Math.floor(this.xpConfig.baseToLevel * Math.pow(this.xpConfig.levelGrowth, this.level - 1));
      this.pendingUpgrade = true;
      this.rollUpgrades();
      return true;
    }
    return false;
  }

  rollUpgrades() {
    this.isSpecialRoll = this._isSpecialLevel();
    const pool = this.isSpecialRoll
      ? (this.upgradesConfig.specialPool || [])
      : this.upgradesConfig.pool;

    if (!pool.length) {
      this.isSpecialRoll = false;
      this.rollUpgradesFromPool(this.upgradesConfig.pool);
      return;
    }

    this.rollUpgradesFromPool(pool);
  }

  rollBossDropUpgrades() {
    const pool = this.upgradesConfig.bossDropPool || this.upgradesConfig.specialPool || [];
    this.isSpecialRoll = true;
    this.isBossDrop = true;
    this.rollUpgradesFromPool(pool);
  }

  rollUpgradesFromPool(pool) {
    const available = pool.filter((u) => {
      if (u.maxStacks == null) return true;
      return (this.playerStacks[u.id] || 0) < u.maxStacks;
    });

    const choices = [];
    const used = new Set();
    const count = Math.min(3, available.length);

    while (choices.length < count) {
      const pick = available[Math.floor(Math.random() * available.length)];
      if (!used.has(pick.id)) {
        used.add(pick.id);
        choices.push(pick);
      }
    }

    this.upgradeChoices = choices;
  }

  getEquippedUpgrades() {
    const poolById = {};
    for (const u of this._allUpgradePools()) {
      poolById[u.id] = u;
    }

    const equipped = [];
    for (const [id, stacks] of Object.entries(this.playerStacks)) {
      if (stacks > 0 && poolById[id]) {
        equipped.push({ upgrade: poolById[id], stacks });
      }
    }
    equipped.sort((a, b) => a.upgrade.name.localeCompare(b.upgrade.name));
    return equipped;
  }

  applyUpgrade(choiceIndex, player) {
    const upgrade = this.upgradeChoices[choiceIndex];
    if (!upgrade) return;

    this.playerStacks[upgrade.id] = (this.playerStacks[upgrade.id] || 0) + 1;
    player.applyUpgrade(upgrade, this.upgradesConfig.modifierMode);
    this.pendingUpgrade = false;
    this.isSpecialRoll = false;
    this.isBossDrop = false;
    this.upgradeChoices = [];
  }

  getProgress() {
    return this.xp / this.xpToNext;
  }
}
