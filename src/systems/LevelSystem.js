import { getRarityWeight } from "../config/upgradeRarity.js";
import {
  COMBAT_LABELS,
  formatCombatValue,
} from "../config/combatStats.js";

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
    this.tagCounts = {};
    this.combatTotals = {};
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
    this.tagCounts = {};
    this.combatTotals = {};
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
    let pool = this.isSpecialRoll
      ? (this.upgradesConfig.specialPool || [])
      : this.upgradesConfig.pool;

    if (!this._eligible(pool).length) {
      this.isSpecialRoll = false;
      pool = this.upgradesConfig.pool;
    }

    this.rollUpgradesFromPool(pool);
  }

  rollBossDropUpgrades() {
    const pool = this._uniquePool([
      ...(this.upgradesConfig.bossDropPool || []),
      ...(this.upgradesConfig.specialPool || []),
    ]);
    this.isSpecialRoll = true;
    this.isBossDrop = true;
    this.rollUpgradesFromPool(pool);
  }

  _uniquePool(pool) {
    const seen = new Set();
    const unique = [];
    for (const upgrade of pool) {
      if (seen.has(upgrade.id)) continue;
      seen.add(upgrade.id);
      unique.push(upgrade);
    }
    return unique;
  }

  _meetsRequires(upgrade) {
    const req = upgrade.requires;
    if (!req) return true;

    if (req.upgrades) {
      for (const id of req.upgrades) {
        if (!(this.playerStacks[id] > 0)) return false;
      }
    }
    if (req.combat) {
      for (const [key, min] of Object.entries(req.combat)) {
        if ((this.combatTotals[key] || 0) < min) return false;
      }
    }
    if (req.anyCombat) {
      let matched = false;
      for (const [key, min] of Object.entries(req.anyCombat)) {
        if ((this.combatTotals[key] || 0) >= min) matched = true;
      }
      if (!matched) return false;
    }
    if (req.tags) {
      for (const [tag, min] of Object.entries(req.tags)) {
        if ((this.tagCounts[tag] || 0) < min) return false;
      }
    }
    return true;
  }

  _eligible(pool) {
    const underCap = this._uniquePool(pool).filter((upgrade) => {
      if (upgrade.maxStacks == null) return true;
      return (this.playerStacks[upgrade.id] || 0) < upgrade.maxStacks;
    });
    const ready = underCap.filter((upgrade) => this._meetsRequires(upgrade));
    return ready.length > 0 ? ready : underCap;
  }

  _upgradeWeight(upgrade) {
    const base = getRarityWeight(upgrade.rarity);
    const affinity = this.upgradesConfig.pathAffinity;
    if (!affinity || !upgrade.tags?.length) return base;
    let shared = 0;
    for (const tag of upgrade.tags) shared += this.tagCounts[tag] || 0;
    const bonus = Math.min(
      affinity.maxBonus ?? 3,
      (affinity.bonusPerPick || 0) * shared,
    );
    return base * (1 + bonus);
  }

  _pickWeightedUpgrade(candidates) {
    if (candidates.length === 0) return null;

    let total = 0;
    for (const upgrade of candidates) total += this._upgradeWeight(upgrade);

    let roll = Math.random() * total;
    for (const upgrade of candidates) {
      roll -= this._upgradeWeight(upgrade);
      if (roll <= 0) return upgrade;
    }

    return candidates[candidates.length - 1];
  }

  rollUpgradesFromPool(pool) {
    const available = this._eligible(pool);

    const choices = [];
    const used = new Set();
    const count = Math.min(3, available.length);

    while (choices.length < count) {
      const candidates = available.filter((u) => !used.has(u.id));
      const pick = this._pickWeightedUpgrade(candidates);
      if (!pick) break;
      used.add(pick.id);
      choices.push(pick);
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

    this._grantUpgrade(upgrade, player);
    this.pendingUpgrade = false;
    this.isSpecialRoll = false;
    this.isBossDrop = false;
    this.upgradeChoices = [];
  }

  getAllUpgrades() {
    return this._allUpgradePools();
  }

  applyUpgradeById(id, player) {
    const upgrade = this._allUpgradePools().find((u) => u.id === id);
    if (!upgrade) return false;
    if (
      upgrade.maxStacks != null &&
      (this.playerStacks[id] || 0) >= upgrade.maxStacks
    ) {
      return false;
    }
    this._grantUpgrade(upgrade, player);
    return true;
  }

  forceLevelUp() {
    return this.addXP(this.xpToNext - this.xp);
  }

  _grantUpgrade(upgrade, player) {
    this.playerStacks[upgrade.id] = (this.playerStacks[upgrade.id] || 0) + 1;
    if (upgrade.tags) {
      for (const tag of upgrade.tags) {
        this.tagCounts[tag] = (this.tagCounts[tag] || 0) + 1;
      }
    }
    if (upgrade.combat) {
      for (const [key, value] of Object.entries(upgrade.combat)) {
        this.combatTotals[key] = (this.combatTotals[key] || 0) + value;
      }
    }
    player.applyUpgrade(upgrade, this.upgradesConfig.modifierMode);
  }

  grantRandom(tag, count, player) {
    const pool = this._allUpgradePools().filter((upgrade) => {
      if (tag === "core") return !upgrade.tags?.length;
      return upgrade.tags?.includes(tag);
    });
    let applied = 0;
    for (let i = 0; i < count; i++) {
      const pick = this._pickWeightedUpgrade(this._eligible(pool));
      if (!pick) break;
      this._grantUpgrade(pick, player);
      applied++;
    }
    return applied;
  }

  previewLines(upgrade, player) {
    const lines = [];
    const owned = this.playerStacks[upgrade.id] || 0;
    if (owned > 0) lines.push(`Owned x${owned} -> x${owned + 1}`);

    if (upgrade.combat && player?.combat) {
      for (const [key, value] of Object.entries(upgrade.combat)) {
        const current = player.combat[key] || 0;
        lines.push(
          `${COMBAT_LABELS[key] || key} ${formatCombatValue(key, current)} -> ${formatCombatValue(key, current + value)}`,
        );
      }
    }

    if (upgrade.effect) {
      const params = upgrade.params || {};
      const perStack = upgrade.perStack || {};
      const keys = [...new Set([...Object.keys(params), ...Object.keys(perStack)])];
      for (const key of keys) {
        if (typeof params[key] !== "number" && typeof perStack[key] !== "number") continue;
        const base = typeof params[key] === "number" ? params[key] : 0;
        const extra = perStack[key] || 0;
        const current = owned > 0 ? base + extra * (owned - 1) : 0;
        const next = base + extra * Math.max(owned, 0);
        const label = COMBAT_LABELS[key] || key;
        if (owned > 0) {
          lines.push(
            `${label} ${formatCombatValue(key, current)} -> ${formatCombatValue(key, next)}`,
          );
        } else {
          lines.push(`${label} ${formatCombatValue(key, base)}`);
        }
      }
    }

    if (upgrade.modifiers && player && upgrade.modifierMode !== "instant") {
      const mode = upgrade.modifierMode || this.upgradesConfig.modifierMode;
      for (const [key, value] of Object.entries(upgrade.modifiers)) {
        if (key === "healPercent" || key === "pierce") continue;
        let current = 0;
        if (key === "pickupRadius") current = player.pickupRadius;
        else if (key === "projectileRadius") current = player.projectileRadius;
        else current = player.getStat(key);
        const next = mode === "additive" ? current + value : current * (1 + value);
        lines.push(
          `${COMBAT_LABELS[key] || key} ${formatCombatValue(key, current)} -> ${formatCombatValue(key, next)}`,
        );
      }
      if (upgrade.modifiers.pierce != null) {
        const current = player.pierce || 0;
        const next = current + upgrade.modifiers.pierce;
        lines.push(`Pierce ${current} -> ${next}`);
      }
    }

    return lines.slice(0, 4);
  }

  getBuildSummary(player) {
    const lines = [];
    const names = {
      lightning: "Lightning",
      fire: "Fire",
      frost: "Frost",
      gunner: "Gunner",
    };
    const parts = [];
    for (const tag of Object.keys(names)) {
      const count = this.tagCounts[tag] || 0;
      if (count > 0) parts.push(`${names[tag]} x${count}`);
    }
    if (parts.length) lines.push(parts.join("   "));
    else lines.push("No path yet");

    const combat = player?.combat || {};
    lines.push(
      `Crit ${formatCombatValue("critChance", combat.critChance || 0)} · ${formatCombatValue("critMultiplier", combat.critMultiplier || 1)}`,
    );
    const volley = [`${Math.round(combat.forwardShots || 1)} fwd`];
    if (combat.rearShots > 0) volley.push(`${Math.round(combat.rearShots)} rear`);
    if (combat.sideShots > 0) volley.push(`${Math.round(combat.sideShots)} side`);
    lines.push(`Volley ${volley.join(" / ")}`);
    if ((combat.chainChance || 0) > 0) {
      lines.push(
        `Chain ${formatCombatValue("chainChance", combat.chainChance)} · ${Math.round(combat.chainJumps || 0)} jumps`,
      );
    }
    if ((combat.burnChance || 0) > 0) {
      lines.push(
        `Burn ${formatCombatValue("burnChance", combat.burnChance || 0)} · ${formatCombatValue("burnDps", combat.burnDps || 0)}`,
      );
    }
    if ((combat.slowChance || 0) > 0 || player?.hasSpecial?.("aura")) {
      lines.push(
        `Slow ${formatCombatValue("slowChance", combat.slowChance || 0)} · ${formatCombatValue("slowAmount", combat.slowAmount || 0)}`,
      );
    }
    if ((combat.freezeChance || 0) > 0 || player?.hasSpecial?.("nova")) {
      lines.push(
        `Freeze ${formatCombatValue("freezeChance", combat.freezeChance || 0)} · ${formatCombatValue("freezeDuration", combat.freezeDuration || 0)}`,
      );
    }
    if ((player?.pierce || 0) > 0 || (combat.ricochet || 0) > 0) {
      lines.push(`Pierce ${player.pierce || 0} · Bounce ${Math.round(combat.ricochet || 0)}`);
    }
    return lines;
  }

  getProgress() {
    return this.xp / this.xpToNext;
  }
}
