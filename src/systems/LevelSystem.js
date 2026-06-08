export class LevelSystem {
  constructor(xpConfig, upgradesConfig) {
    this.xpConfig = xpConfig;
    this.upgradesConfig = upgradesConfig;
    this.level = 1;
    this.xp = 0;
    this.xpToNext = xpConfig.baseToLevel;
    this.pendingUpgrade = false;
    this.upgradeChoices = [];
    this.playerStacks = {};
  }

  reset() {
    this.level = 1;
    this.xp = 0;
    this.xpToNext = this.xpConfig.baseToLevel;
    this.pendingUpgrade = false;
    this.upgradeChoices = [];
    this.playerStacks = {};
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
    const pool = this.upgradesConfig.pool;
    const available = pool.filter((u) => {
      const stacks = this.playerStacks[u.id] || 0;
      return stacks < u.maxStacks;
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

  applyUpgrade(choiceIndex, player) {
    const upgrade = this.upgradeChoices[choiceIndex];
    if (!upgrade) return;

    this.playerStacks[upgrade.id] = (this.playerStacks[upgrade.id] || 0) + 1;
    player.applyUpgrade(upgrade, this.upgradesConfig.modifierMode);
    this.pendingUpgrade = false;
    this.upgradeChoices = [];
  }

  getProgress() {
    return this.xp / this.xpToNext;
  }
}
