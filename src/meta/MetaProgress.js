const SAVE_KEY = 'geo-survivors-save';
const LEGACY_KEY = 'geo-survivors-unlocks';

const LEGACY_ACHIEVEMENTS = {
  crimson: 'survive_3_min',
  emerald: 'survive_5_min',
  violet: 'survive_8_min',
  obsidian: 'reach_level_10',
  gold: 'win',
};

function emptyRecords() {
  return {
    runs: 0,
    wins: 0,
    hardWins: 0,
    bestTime: 0,
    bestLevel: 0,
    totalKills: 0,
    bossKills: 0,
  };
}

export function packGrid(grid) {
  const bytes = new Uint8Array(Math.ceil(grid.length / 8));
  for (let i = 0; i < grid.length; i++) {
    if (grid[i]) bytes[i >> 3] |= 1 << (i & 7);
  }
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function unpackGrid(encoded, length) {
  const binary = atob(encoded);
  const grid = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    const byte = binary.charCodeAt(i >> 3);
    if (Number.isNaN(byte)) return null;
    grid[i] = (byte >> (i & 7)) & 1;
  }
  return grid;
}

export class MetaProgress {
  constructor(metaConfig, colorsConfig) {
    this.config = metaConfig;
    this.colors = colorsConfig?.colors || [];
    this._runCommitted = false;
    this._summaryProvider = null;
    this._onPageHide = () => {
      const summary = this._summaryProvider?.();
      if (summary) this.commitRun(summary);
    };
    this._onPageShow = () => {
      try {
        const pending = navigator.storage?.persist?.();
        if (pending?.catch) pending.catch(() => {});
      } catch {
        // Persistence is a hint; the save still lives in localStorage.
      }
    };
    this.save = this._load();
    this._save();
    window.addEventListener('pagehide', this._onPageHide);
    this._onPageShow();
  }

  destroy() {
    window.removeEventListener('pagehide', this._onPageHide);
    this._summaryProvider = null;
  }

  setRunSummaryProvider(provider) {
    this._summaryProvider = provider;
  }

  beginRun() {
    this._runCommitted = false;
  }

  _blank() {
    return {
      version: 1,
      colors: this.colors.filter((color) => color.unlockedByDefault).map((color) => color.id),
      achievements: {},
      shards: 0,
      purchases: {},
      difficultyUnlocked: ['normal'],
      selectedDifficulty: 'normal',
      records: emptyRecords(),
      lastShape: null,
    };
  }

  _load() {
    const save = this._blank();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) this._merge(save, JSON.parse(raw));
    } catch {
      // Ignore corrupt storage and keep defaults.
    }
    this._ensureDefaults(save);
    this._migrateLegacy(save);
    this._reconcile(save);
    return save;
  }

  _merge(save, parsed) {
    if (!parsed || typeof parsed !== 'object') return;
    if (Array.isArray(parsed.colors)) save.colors = parsed.colors.filter((id) => typeof id === 'string');
    if (parsed.achievements && typeof parsed.achievements === 'object') {
      save.achievements = { ...parsed.achievements };
    }
    if (Number.isFinite(parsed.shards)) save.shards = Math.max(0, parsed.shards);
    if (parsed.purchases && typeof parsed.purchases === 'object') {
      save.purchases = { ...parsed.purchases };
    }
    if (Array.isArray(parsed.difficultyUnlocked)) {
      save.difficultyUnlocked = parsed.difficultyUnlocked.filter((id) => typeof id === 'string');
    }
    if (typeof parsed.selectedDifficulty === 'string') {
      save.selectedDifficulty = parsed.selectedDifficulty;
    }
    if (parsed.records && typeof parsed.records === 'object') {
      const records = emptyRecords();
      for (const key of Object.keys(records)) {
        if (Number.isFinite(parsed.records[key])) records[key] = parsed.records[key];
      }
      save.records = records;
    }
    if (parsed.lastShape && typeof parsed.lastShape.grid === 'string') {
      save.lastShape = {
        grid: parsed.lastShape.grid,
        length: parsed.lastShape.length,
        colorId: parsed.lastShape.colorId || null,
      };
    }
  }

  _ensureDefaults(save) {
    for (const color of this.colors) {
      if (color.unlockedByDefault && !save.colors.includes(color.id)) {
        save.colors.push(color.id);
      }
    }
    if (!save.difficultyUnlocked.includes('normal')) save.difficultyUnlocked.unshift('normal');
    if (!this._difficultyById(save.selectedDifficulty)) save.selectedDifficulty = 'normal';
    if (!save.difficultyUnlocked.includes(save.selectedDifficulty)) {
      save.selectedDifficulty = 'normal';
    }
  }

  _migrateLegacy(save) {
    let legacy = [];
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) legacy = parsed;
    } catch {
      return;
    }

    for (const colorId of legacy) {
      if (typeof colorId !== 'string') continue;
      if (!save.colors.includes(colorId)) save.colors.push(colorId);
      const achievementId = LEGACY_ACHIEVEMENTS[colorId];
      if (!achievementId || save.achievements[achievementId]) continue;
      const achievement = this._achievement(achievementId);
      if (achievement) this._grant(save, achievement, { grantShards: false });
    }
  }

  _reconcile(save) {
    for (const id of Object.keys(save.achievements)) {
      const achievement = this._achievement(id);
      if (achievement) this._grant(save, achievement, { grantShards: false, keepStamp: true });
    }
  }

  _achievement(id) {
    return this.config.achievements.find((achievement) => achievement.id === id) || null;
  }

  _difficultyById(id) {
    return this.config.difficulties.find((difficulty) => difficulty.id === id) || null;
  }

  _grant(save, achievement, options = {}) {
    if (!options.keepStamp || !save.achievements[achievement.id]) {
      save.achievements[achievement.id] = Date.now();
    }
    const reward = achievement.reward || {};
    if (options.grantShards !== false && reward.shards) {
      save.shards += reward.shards;
    }
    for (const colorId of reward.colors || []) {
      if (!save.colors.includes(colorId)) save.colors.push(colorId);
    }
    if (reward.difficulty && !save.difficultyUnlocked.includes(reward.difficulty)) {
      save.difficultyUnlocked.push(reward.difficulty);
    }
  }

  _meets(condition, ctx) {
    if (!condition) return false;
    switch (condition.type) {
      case 'survive':
        return (ctx.elapsed || 0) >= condition.minutes * 60;
      case 'level':
        return (ctx.level || 0) >= condition.level;
      case 'win':
        return !!ctx.ended && !!ctx.won;
      case 'hardWin':
        return !!ctx.ended && !!ctx.won && ctx.difficulty === 'hard';
      case 'bossKill':
        return ctx.bossType === condition.typeId
          || (ctx.bossTypes || []).includes(condition.typeId);
      case 'totalKills':
        return (ctx.totalKills || 0) >= condition.count;
      case 'pathPicks': {
        const tags = condition.tags || ['lightning', 'fire', 'frost', 'gunner'];
        const counts = ctx.tagCounts || {};
        return tags.some((tag) => (counts[tag] || 0) >= condition.count);
      }
      default:
        return false;
    }
  }

  _evaluate(ctx, save = this.save) {
    const earned = [];
    for (const achievement of this.config.achievements) {
      if (save.achievements[achievement.id]) continue;
      if (!this._meets(achievement.condition, ctx)) continue;
      this._grant(save, achievement);
      earned.push(achievement);
    }
    return earned;
  }

  _save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch {
      // Ignore quota and privacy-mode failures.
    }
  }

  onEvent(ctx) {
    const earned = this._evaluate(ctx);
    if (earned.length) this._save();
    return earned;
  }

  commitRun(summary) {
    if (this._runCommitted || !summary) return null;
    this._runCommitted = true;

    const difficulty = this.getDifficulty(summary.difficulty);
    const base = Math.floor((summary.elapsed || 0) / 30)
      + (summary.level || 1)
      + (summary.bossesKilled || 0) * 10
      + (summary.won ? 25 : 0);
    const shardsEarned = Math.max(0, Math.floor(base * (difficulty.shardMultiplier || 1)));

    const records = this.save.records;
    const previousBestTime = records.bestTime;
    const previousBestLevel = records.bestLevel;
    records.runs += 1;
    records.totalKills += summary.kills || 0;
    records.bossKills += summary.bossesKilled || 0;
    if (summary.won) {
      records.wins += 1;
      if (summary.difficulty === 'hard') records.hardWins += 1;
    }
    if ((summary.elapsed || 0) > records.bestTime) records.bestTime = summary.elapsed || 0;
    if ((summary.level || 0) > records.bestLevel) records.bestLevel = summary.level || 0;
    this.save.shards += shardsEarned;

    const achievements = this._evaluate({
      elapsed: summary.elapsed,
      level: summary.level,
      won: !!summary.won,
      ended: true,
      difficulty: summary.difficulty,
      bossType: null,
      bossTypes: summary.bossTypes || [],
      tagCounts: summary.tagCounts || {},
      totalKills: records.totalKills,
    });

    this._save();
    return {
      shardsEarned,
      shards: this.save.shards,
      achievements,
      newBestTime: (summary.elapsed || 0) > previousBestTime && previousBestTime > 0,
      newBestLevel: (summary.level || 0) > previousBestLevel && previousBestLevel > 0,
      difficultyName: difficulty.name,
    };
  }

  isColorUnlocked(colorId) {
    const color = this.colors.find((entry) => entry.id === colorId);
    if (color?.unlockedByDefault) return true;
    return this.save.colors.includes(colorId);
  }

  getUnlockHint(color) {
    if (!color?.unlockAchievement) return 'Locked';
    const achievement = this._achievement(color.unlockAchievement);
    return achievement?.hint || 'Locked';
  }

  isUpgradeUnlocked(upgrade) {
    if (!upgrade?.unlockedBy) return true;
    return !!this.save.achievements[upgrade.unlockedBy];
  }

  getPerk(id) {
    const item = this.config.shop.find((entry) => entry.id === id);
    const level = this.save.purchases[id] || 0;
    if (!item) return level;
    return Math.min(level, item.maxLevel);
  }

  getShopItem(id) {
    return this.config.shop.find((entry) => entry.id === id) || null;
  }

  nextCost(id) {
    const item = this.getShopItem(id);
    if (!item) return null;
    const level = this.getPerk(id);
    if (level >= item.maxLevel) return null;
    return item.costs[level] ?? null;
  }

  buy(itemId) {
    const item = this.getShopItem(itemId);
    if (!item) return { ok: false, reason: 'Unknown item' };
    const level = this.getPerk(itemId);
    if (level >= item.maxLevel) return { ok: false, reason: 'Already maxed' };
    const cost = item.costs[level];
    if (!Number.isFinite(cost) || this.save.shards < cost) {
      return { ok: false, reason: 'Not enough shards' };
    }
    this.save.shards -= cost;
    this.save.purchases[itemId] = level + 1;
    this._save();
    return { ok: true };
  }

  getDifficulty(id) {
    return this._difficultyById(id) || this.config.difficulties[0];
  }

  getSelectedDifficulty() {
    return this.save.selectedDifficulty || 'normal';
  }

  isDifficultyUnlocked(id) {
    if (id === 'normal') return true;
    return this.save.difficultyUnlocked.includes(id);
  }

  setSelectedDifficulty(id) {
    if (!this.isDifficultyUnlocked(id) || !this._difficultyById(id)) return false;
    this.save.selectedDifficulty = id;
    this._save();
    return true;
  }

  getShards() {
    return this.save.shards;
  }

  grantShards(amount) {
    this.save.shards = Math.max(0, this.save.shards + amount);
    this._save();
    return this.save.shards;
  }

  unlockAll() {
    const earned = [];
    for (const achievement of this.config.achievements) {
      if (this.save.achievements[achievement.id]) continue;
      this._grant(this.save, achievement);
      earned.push(achievement);
    }
    this._save();
    return earned;
  }

  reset() {
    this.save = this._blank();
    this._runCommitted = false;
    this._save();
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      // Ignore storage failures.
    }
  }

  saveShape(grid, colorId) {
    this.save.lastShape = {
      grid: packGrid(grid),
      length: grid.length,
      colorId: colorId || null,
    };
    this._save();
  }

  loadShape() {
    const shape = this.save.lastShape;
    if (!shape?.grid || !shape.length) return null;
    try {
      const grid = unpackGrid(shape.grid, shape.length);
      if (!grid) return null;
      return { grid, colorId: shape.colorId || null };
    } catch {
      return null;
    }
  }
}
