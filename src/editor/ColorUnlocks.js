const STORAGE_KEY = 'geo-survivors-unlocks';

export class ColorUnlocks {
  constructor(colorsConfig) {
    this.colors = colorsConfig.colors;
    this.unlocked = new Set();
    this._load();
  }

  _load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      for (const id of saved) this.unlocked.add(id);
    } catch {
      // ignore corrupt storage
    }
    for (const color of this.colors) {
      if (color.unlockedByDefault) this.unlocked.add(color.id);
    }
  }

  _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.unlocked]));
  }

  isUnlocked(colorId) {
    return this.unlocked.has(colorId);
  }

  unlock(colorId) {
    if (!this.unlocked.has(colorId)) {
      this.unlocked.add(colorId);
      this._save();
    }
  }

  checkRunUnlocks({ won, elapsed, level }) {
    const mins = elapsed / 60;
    const toUnlock = [];

    for (const color of this.colors) {
      if (this.isUnlocked(color.id)) continue;
      const cond = color.unlockCondition;
      if (!cond) continue;

      let earned = false;
      if (cond === 'win' && won) earned = true;
      else if (cond === 'survive_3_min' && mins >= 3) earned = true;
      else if (cond === 'survive_5_min' && mins >= 5) earned = true;
      else if (cond === 'survive_8_min' && mins >= 8) earned = true;
      else if (cond === 'reach_level_10' && level >= 10) earned = true;

      if (earned) toUnlock.push(color);
    }

    for (const color of toUnlock) {
      this.unlock(color.id);
    }
    return toUnlock;
  }

  getUnlockHint(color) {
    const hints = {
      win: 'Survive 10 minutes',
      survive_3_min: 'Survive 3 minutes',
      survive_5_min: 'Survive 5 minutes',
      survive_8_min: 'Survive 8 minutes',
      reach_level_10: 'Reach level 10',
    };
    return hints[color.unlockCondition] || 'Locked';
  }
}
