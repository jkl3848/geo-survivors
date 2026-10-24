import { ObjectPool } from "../core/ObjectPool.js";
import { SpatialHash } from "../core/SpatialHash.js";
import { GameLoop } from "./GameLoop.js";
import { Input } from "./Input.js";
import { Player } from "../entities/Player.js";
import { Enemy } from "../entities/Enemy.js";
import { Projectile } from "../entities/Projectile.js";
import { XPOrb } from "../entities/XPOrb.js";
import { SpawnSystem } from "../systems/SpawnSystem.js";
import { CombatSystem } from "../systems/CombatSystem.js";
import { CollisionSystem } from "../systems/CollisionSystem.js";
import { LevelSystem } from "../systems/LevelSystem.js";
import { AbilitySystem } from "../systems/AbilitySystem.js";
import { Renderer } from "../render/Renderer.js";
import { VFX } from "../render/VFX.js";
import { HUD } from "../render/HUD.js";
import { pathColor, dominantPath } from "../config/combatStats.js";
import { getUpgradeActionLayout, getUpgradeCardLayout, upgradeActionAt, upgradeChoiceAt } from "../render/upgradeLayout.js";
import { DevPanel } from "../dev/DevPanel.js";

export class Game {
  constructor(canvas, configs, characterData, onReturnToEditor, music, meta = null) {
    this.canvas = canvas;
    this.configs = configs;
    this.characterData = characterData;
    this.onReturnToEditor = onReturnToEditor;

    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;

    this.state = "playing";
    this._won = false;
    this._mutePressed = false;
    const params = new URLSearchParams(window.location.search);
    this.debug = params.has("debug");
    this.devMode = params.has("dev");

    this.player = new Player();
    this.input = new Input(canvas);
    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.render(),
    );

    this.enemyPool = new ObjectPool(() => new Enemy(), 64);
    this.projectilePool = new ObjectPool(() => new Projectile(), 128);
    this.xpPool = new ObjectPool(() => new XPOrb(), 64);

    this.spatialHash = new SpatialHash(32);
    this.meta = meta;
    this.difficultyId = characterData.difficulty || this.meta?.getSelectedDifficulty() || "normal";
    this.difficulty = this.meta?.getDifficulty(this.difficultyId) || {
      id: "normal",
      name: "Normal",
      hp: 1,
      attack: 1,
      spawnRate: 1,
      shardMultiplier: 1,
    };
    this.spawnSystem = new SpawnSystem(
      configs.spawn,
      configs.enemies,
      this.enemyPool,
      this.difficulty,
    );
    this.combatSystem = new CombatSystem(configs.stats);
    this.collisionSystem = new CollisionSystem(this.spatialHash);
    this.levelSystem = new LevelSystem(configs.stats.xp, configs.upgrades, {
      isUpgradeUnlocked: (upgrade) => this.meta?.isUpgradeUnlocked(upgrade) !== false,
      choiceCount: this.meta?.getPerk("extra_card") > 0 ? 4 : 3,
      rerollsPerRun: this.meta?.getPerk("reroll") || 0,
      skipsPerRun: this.meta?.getPerk("skip") || 0,
      onUpgradeGranted: () => this._reportMeta(),
    });
    this.vfx = new VFX();
    this.abilitySystem = new AbilitySystem({
      player: this.player,
      tuning: configs.stats.combatDefaults || {},
      combatSystem: this.combatSystem,
      vfx: this.vfx,
      getEnemies: () => this.enemyPool.getActive(),
      getProjectiles: () => this.projectilePool.getActive(),
      queryRadius: (x, y, radius) =>
        this.spatialHash.queryRadius(x, y, radius).slice(),
      spawnProjectile: (spec) => this._spawnProjectile(spec),
      onDeath: (enemy) => this._onEnemyDeath(enemy),
    });

    this.renderer = null;
    this.hud = null;
    this.music = music;
    this.runResult = null;
    this.toasts = [];
    this._runAchievements = [];
    this._runKills = 0;
    this._runBossKills = 0;
    this._bossTypes = [];
    this._reportedMinute = 0;
    this._reportedLevel = 1;
    this._runStarted = false;
    this.devPanel = null;
    this.meta?.setRunSummaryProvider(() => {
      if (!this._runStarted) return null;
      return this._runSummary(this.state === "gameover" ? this._won : false);
    });

    this._onResize = () => this._resize();
    this._onCanvasClick = (e) => this._handleCanvasClick(e);
    this._onPauseKey = (e) => this._handlePauseKey(e);
    this._resize();
    window.addEventListener("resize", this._onResize);
    window.addEventListener("keydown", this._onPauseKey);
    canvas.addEventListener("click", this._onCanvasClick);
  }

  _handlePauseKey(e) {
    if (this.devMode && e.key === "`") {
      if (this.state === "playing" || this.state === "paused") {
        this._toggleDevPanel();
        e.preventDefault();
      } else if (this.state === "dev") {
        this._closeDevPanel();
        e.preventDefault();
      }
      return;
    }

    if (e.key !== "Escape") return;

    if (this.state === "dev") {
      this._closeDevPanel();
      e.preventDefault();
      return;
    }

    if (this.state === "playing") {
      this.state = "paused";
      this.loop.setPaused(true);
      e.preventDefault();
    } else if (this.state === "paused") {
      this.state = "playing";
      this.loop.setPaused(false);
      e.preventDefault();
    }
  }

  _toggleDevPanel() {
    if (this.state === "dev") {
      this._closeDevPanel();
    } else {
      this._openDevPanel();
    }
  }

  _openDevPanel() {
    if (!this.devPanel) return;
    this.state = "dev";
    this.loop.setPaused(true);
    this.devPanel.show();
  }

  _closeDevPanel() {
    if (!this.devPanel) return;
    this.devPanel.hide();
    this.state = "playing";
    this.loop.setPaused(false);
  }

  async start() {
    const { width, height } = this.canvas;
    const pc = this.configs.stats.player;

    this.player.init(
      width / 2,
      height / 2,
      this.characterData.stats,
      this.characterData.pixelArt,
      this.characterData.bounds,
      pc,
      this.characterData.color,
      this.configs.stats.combatDefaults || {},
    );

    this.enemyPool.releaseAll();
    this.projectilePool.releaseAll();
    this.xpPool.releaseAll();
    this.spawnSystem.reset();
    this.levelSystem.reset();
    this.abilitySystem.reset();
    this.vfx.clear();

    this.renderer = new Renderer(this.ctx, width, height);
    this.hud = new HUD(this.ctx, width);

    if (this.devMode) {
      const app = document.getElementById("app");
      this.devPanel = new DevPanel({
        container: app,
        getState: () => ({
          upgrades: this.levelSystem.getAllUpgrades(),
          playerStacks: this.levelSystem.playerStacks,
          tagCounts: this.levelSystem.tagCounts,
          combat: this.player.combat,
          buildSummary: this.levelSystem.getBuildSummary(this.player),
          enemyLevel: this.spawnSystem.getEnemyLevel() + 1,
          elapsed: this.spawnSystem.elapsed,
          shards: this.meta?.getShards() ?? 0,
        }),
        actions: {
          applyUpgrade: (id) =>
            this.levelSystem.applyUpgradeById(id, this.player),
          grantRandom: (tag, count) =>
            this.levelSystem.grantRandom(tag, count, this.player),
          setEnemyLevel: (level) => this.spawnSystem.setEnemyLevel(level),
          spawnBoss: (typeId) =>
            this.spawnSystem.spawnBoss(typeId, width, height),
          forceLevelUp: () => {
            const leveled = this.levelSystem.forceLevelUp();
            if (leveled) {
              this._closeDevPanel();
              this.state = "upgrade";
              this.loop.setPaused(true);
              this.music.playSfx("C5", 0.2);
            }
          },
          healFull: () => {
            this.player.hp = this.player.maxHp;
          },
          grantShards: () => this.meta?.grantShards(100),
          unlockAll: () => this.meta?.unlockAll().length || 0,
          resetSave: () => {
            if (window.confirm("Erase all saved progress?")) this.meta?.reset();
          },
          killAllEnemies: () => {
            for (const enemy of [...this.enemyPool.getActive()]) {
              if (enemy.active) this._onEnemyDeath(enemy);
            }
          },
        },
      });
      window.__game = this;
    }

    this.music.playTrack("main");
    this._runStarted = true;
    this.meta?.beginRun();

    this.state = "playing";
    this.loop.setPaused(false);
    this.loop.start();
  }

  _pickUpgrade(index) {
    this.levelSystem.applyUpgrade(index, this.player);
    this.state = "playing";
    this.loop.setPaused(false);
    this.music.playSfx("C5", 0.15);
  }

  _handleCanvasClick(e) {
    if (this.state !== "upgrade") return;

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    const { width, height } = this.canvas;
    const layout = getUpgradeCardLayout(
      this.levelSystem.upgradeChoices.length,
      width,
      height,
    );
    const actionId = upgradeActionAt(
      mx,
      my,
      getUpgradeActionLayout(this._upgradeActions(), width, layout),
    );
    if (actionId === "reroll") {
      if (this.levelSystem.reroll()) this.music.playSfx("C5", 0.1);
      return;
    }
    if (actionId === "skip") {
      if (this.levelSystem.skip(this.player)) {
        this.state = "playing";
        this.loop.setPaused(false);
        this.music.playSfx("C5", 0.1);
      }
      return;
    }

    const choice = this._getUpgradeClickChoiceAt(mx, my);
    if (choice !== -1) {
      this._pickUpgrade(choice);
    }
  }

  _getUpgradeClickChoiceAt(mx, my) {
    const { width, height } = this.canvas;
    return upgradeChoiceAt(
      mx,
      my,
      this.levelSystem.upgradeChoices.length,
      width,
      height,
    );
  }

  _upgradeActions() {
    const actions = [];
    if (this.levelSystem.rerollsPerRun > 0) {
      actions.push({
        id: "reroll",
        label: `Reroll (${this.levelSystem.rerollsLeft})`,
        enabled: this.levelSystem.rerollsLeft > 0,
      });
    }
    if (this.levelSystem.skipsPerRun > 0) {
      actions.push({
        id: "skip",
        label: `Skip (${this.levelSystem.skipsLeft})`,
        enabled: this.levelSystem.skipsLeft > 0,
      });
    }
    return actions;
  }

  _tickToasts(dt) {
    for (const toast of this.toasts) toast.ttl -= dt;
    if (this.toasts.some((toast) => toast.ttl <= 0)) {
      this.toasts = this.toasts.filter((toast) => toast.ttl > 0);
    }
  }

  _runSummary(won = this._won) {
    return {
      elapsed: this.spawnSystem.elapsed,
      level: this.levelSystem.level,
      won: !!won,
      difficulty: this.difficultyId,
      kills: this._runKills,
      bossesKilled: this._runBossKills,
      bossTypes: [...this._bossTypes],
      tagCounts: { ...this.levelSystem.tagCounts },
    };
  }

  _metaCtx(extra = {}) {
    return {
      elapsed: this.spawnSystem.elapsed,
      level: this.levelSystem.level,
      won: this._won,
      ended: false,
      difficulty: this.difficultyId,
      bossType: extra.bossType || null,
      bossTypes: this._bossTypes,
      tagCounts: this.levelSystem.tagCounts,
      totalKills: (this.meta?.save.records.totalKills || 0) + this._runKills,
    };
  }

  _noteAchievements(earned) {
    for (const achievement of earned) {
      if (this._runAchievements.some((entry) => entry.id === achievement.id)) continue;
      this._runAchievements.push(achievement);
      this.toasts.push({ text: `Achievement: ${achievement.name}`, ttl: 2.5 });
    }
  }

  _reportMeta(extra = {}) {
    if (!this.meta) return;
    this._noteAchievements(this.meta.onEvent(this._metaCtx(extra)));
  }

  _reportProgressMarkers() {
    const minute = Math.floor(this.spawnSystem.elapsed / 60);
    const level = this.levelSystem.level;
    if (minute <= this._reportedMinute && level <= this._reportedLevel) return;
    this._reportedMinute = Math.max(this._reportedMinute, minute);
    this._reportedLevel = Math.max(this._reportedLevel, level);
    this._reportMeta();
  }

  _finishRun(won) {
    this.state = "gameover";
    this._won = won;
    this.music.stop();
    const result = this.meta?.commitRun(this._runSummary(won)) || null;
    const seen = new Set(this._runAchievements.map((achievement) => achievement.id));
    const extra = (result?.achievements || []).filter((achievement) => !seen.has(achievement.id));
    this.runResult = {
      shardsEarned: result?.shardsEarned || 0,
      achievements: [...this._runAchievements, ...extra],
      newBestTime: !!result?.newBestTime,
      newBestLevel: !!result?.newBestLevel,
      difficultyName: result?.difficultyName || this.difficulty.name,
    };
  }

  _resize() {
    const app = document.getElementById("app");
    this.canvas.width = app.clientWidth;
    this.canvas.height = app.clientHeight;
    if (this.renderer) {
      this.renderer.width = this.canvas.width;
      this.renderer.height = this.canvas.height;
      this.hud.width = this.canvas.width;
    }
  }

  update(dt) {
    this._tickToasts(dt);

    if (this.state === "gameover") {
      if (this.input.isKeyDown("r")) {
        this.destroy();
        this.onReturnToEditor();
      }
      return;
    }

    if (this.state === "upgrade") {
      return;
    }

    if (this.state === "dev") {
      return;
    }

    if (this.state === "paused") {
      return;
    }

    if (this.input.isKeyDown("m")) {
      if (!this._mutePressed) {
        this.music.toggleMute();
        this._mutePressed = true;
      }
    } else {
      this._mutePressed = false;
    }

    if (!this.player.alive) {
      this._finishRun(false);
      return;
    }

    this.vfx.update(dt);
    this.player.update(dt, this.input, this.canvas.width, this.canvas.height);
    this.spawnSystem.update(dt, this.canvas.width, this.canvas.height);
    this._reportProgressMarkers();

    const wantedTrack = this._getActiveBoss() ? "boss" : "main";
    if (this.music.currentTrackName !== wantedTrack) {
      this.music.playTrack(wantedTrack);
    }

    if (this.player.canFire()) {
      const angle = this.input.getAimAngle(this.player.x, this.player.y);
      this._firePlayerProjectiles(angle);
      this.player.resetFireCooldown();
    }

    const enemies = this.enemyPool.getActive();
    const updateContext = { spawnSystem: this.spawnSystem };
    for (const enemy of enemies) {
      if (enemy.active) {
        enemy.update(
          dt,
          this.player.x,
          this.player.y,
          this.canvas.width,
          this.canvas.height,
          updateContext,
        );
      }
    }

    const projectiles = this.projectilePool.getActive();
    for (const proj of projectiles) {
      if (proj.active) proj.update(dt, this.canvas.width, this.canvas.height);
    }

    const xpOrbs = this.xpPool.getActive();
    for (const orb of xpOrbs) {
      if (orb.active) orb.update(dt);
    }

    this.collisionSystem.rebuild(enemies, xpOrbs);
    this.collisionSystem.resolveEnemyOverlaps(enemies);
    this.collisionSystem.rebuild(enemies, xpOrbs);
    this.abilitySystem.update(dt);
    this.collisionSystem.rebuild(
      this.enemyPool.getActive(),
      this.xpPool.getActive(),
    );

    for (const proj of [...this.projectilePool.getActive()]) {
      if (!proj.active) continue;
      const hit = this.collisionSystem.checkProjectileHits(
        proj,
        this.enemyPool.getActive(),
      );
      if (!hit) continue;
      proj.hitIds.add(hit);
      this.abilitySystem.dealDamage(hit, proj.damage, {
        source: proj.source || "projectile",
        projectile: proj,
        canProc: proj.canProc !== false,
        depth: proj.procDepth || 0,
        allowCrit: proj.allowCrit !== false,
      });
      if (!proj.active) continue;
      if (proj.pierceLeft > 0) {
        proj.pierceLeft--;
      } else if (
        proj.ricochetLeft > 0 &&
        this.abilitySystem.redirectProjectile(proj)
      ) {
        proj.ricochetLeft--;
      } else {
        proj.reset();
        this.projectilePool.release(proj);
      }
    }

    if (this.player.contactCooldown <= 0) {
      const touching = this.collisionSystem.checkPlayerEnemyCollisions(
        this.player,
        enemies,
      );
      if (touching.length > 0) {
        let totalDmg = 0;
        for (const enemy of touching) {
          totalDmg += this.combatSystem.calcEnemyDamage(
            enemy.attack,
            this.player.getStat("defense"),
          );
        }
        this.player.takeDamage(totalDmg);
        this.abilitySystem.onPlayerHit(totalDmg, touching);
        this.player.contactCooldown = this.configs.stats.player.contactCooldown;
      }
    }

    const collected = this.collisionSystem.checkXPickups(this.player, xpOrbs);
    for (const orb of collected) {
      const leveled = this.levelSystem.addXP(
        Math.round(orb.value * this.player.getStat("xpGain")),
      );
      orb.reset();
      this.xpPool.release(orb);
      if (leveled) {
        this.state = "upgrade";
        this.loop.setPaused(true);
        this.music.playSfx("C5", 0.2);
      }
    }

    this._cleanupPools();

    if (
      this.spawnSystem.isTimerComplete() &&
      !this._hasActiveBoss(this.spawnSystem.getFinalBossId())
    ) {
      this._finishRun(true);
    }
  }

  _hasActiveBoss(typeId) {
    for (const enemy of this.enemyPool.getActive()) {
      if (enemy.active && enemy.isBoss && enemy.typeId === typeId) return true;
    }
    return false;
  }

  _getActiveBoss() {
    for (const enemy of this.enemyPool.getActive()) {
      if (enemy.active && enemy.isBoss) return enemy;
    }
    return null;
  }

  _firePlayerProjectiles(angle) {
    const angles = this.abilitySystem.buildVolley(angle);
    const damage = this.combatSystem.calcPlayerDamage(
      this.player.getStat("attack"),
    );
    const speed =
      this.configs.stats.player.projectileSpeed *
      (1 + (this.player.combat.projectileSpeed || 0));
    const color = pathColor(dominantPath(this.levelSystem.tagCounts));

    for (const fireAngle of angles) {
      this._spawnProjectile({
        x: this.player.x + Math.cos(fireAngle) * 8,
        y: this.player.y + Math.sin(fireAngle) * 8,
        angle: fireAngle,
        speed,
        damage,
        radius: this.player.projectileRadius,
        pierce: this.player.pierce,
        color,
        ricochet: this.player.combat.ricochet || 0,
        source: "projectile",
      });
    }
  }

  _spawnProjectile(spec) {
    const proj = this.projectilePool.acquire();
    proj.init(
      spec.x,
      spec.y,
      spec.angle,
      spec.speed,
      spec.damage,
      spec.radius ?? this.player.projectileRadius,
      spec.pierce ?? 0,
      spec,
    );
    return proj;
  }

  _onEnemyDeath(enemy) {
    const deathX = enemy.x;
    const deathY = enemy.y;
    const deathXp = enemy.xpValue;
    const wasBoss = enemy.isBoss;
    const bossType = wasBoss ? enemy.typeId : null;
    this._runKills += 1;
    if (wasBoss) {
      this._runBossKills += 1;
      this._bossTypes.push(enemy.typeId);
    }
    this._reportMeta(bossType ? { bossType } : {});
    const wasHexagon = enemy.typeId === "hexagon";
    const wasBossSquare = enemy.typeId === "boss_square";
    const wasFinalBoss = enemy.typeId === this.spawnSystem.getFinalBossId();

    this.music.playSfx(
      wasFinalBoss ? "C4" : "G4",
      wasFinalBoss ? 0.2 : 0.05,
      "triangle",
    );
    enemy.reset();
    this.enemyPool.release(enemy);

    if (wasHexagon) {
      this.spawnSystem.spawnTriangleBurst(deathX, deathY);
    }

    if (wasBossSquare) {
      this.levelSystem.rollBossDropUpgrades();
      this.state = "upgrade";
      this.loop.setPaused(true);
    }

    const orbCount = wasFinalBoss ? 5 : wasBossSquare ? 3 : 1;
    for (let i = 0; i < orbCount; i++) {
      const angle = ((Math.PI * 2) / orbCount) * i;
      const offset = orbCount > 1 ? 20 : 0;
      const orb = this.xpPool.acquire();
      orb.init(
        deathX + Math.cos(angle) * offset,
        deathY + Math.sin(angle) * offset,
        Math.floor(deathXp / orbCount),
      );
    }
  }

  _cleanupPools() {
    for (const proj of [...this.projectilePool.getActive()]) {
      if (!proj.active) this.projectilePool.release(proj);
    }
    for (const enemy of [...this.enemyPool.getActive()]) {
      if (!enemy.active) this.enemyPool.release(enemy);
    }
    for (const orb of [...this.xpPool.getActive()]) {
      if (!orb.active) this.xpPool.release(orb);
    }
  }

  render() {
    if (!this.renderer) return;

    const { width, height } = this.canvas;
    this.renderer.clear();

    const enemies = this.enemyPool.getActive();
    const projectiles = this.projectilePool.getActive();
    const xpOrbs = this.xpPool.getActive();

    this.renderer.drawXPOrbs(xpOrbs);
    this.renderer.drawEnemies(enemies);
    this.renderer.drawProjectiles(projectiles);
    this.renderer.drawPlayer(this.player);
    this.vfx.draw(this.ctx);

    this.hud.draw(
      this.player,
      this.spawnSystem.getTimeRemaining(),
      this.spawnSystem.getEnemyLevel(),
      this.levelSystem,
      this.spawnSystem.isTimerComplete(),
    );

    const activeBoss = this._getActiveBoss();
    if (activeBoss) {
      this.renderer.drawBossHealthBar(activeBoss, width);
    }

    if (this.state === "upgrade") {
      this.renderer.drawUpgradeOverlay(
        this.levelSystem.upgradeChoices,
        width,
        height,
        this.levelSystem.playerStacks,
        this.levelSystem.isSpecialRoll,
        this.levelSystem.isBossDrop,
        (choice) => this.levelSystem.previewLines(choice, this.player),
        this._upgradeActions(),
      );
    }

    if (this.state === "paused") {
      this.renderer.drawPauseOverlay(
        this.player,
        this.levelSystem,
        width,
        height,
      );
    }

    if (this.state === "gameover") {
      this.renderer.drawGameOver(
        this._won,
        this.spawnSystem.elapsed,
        this.levelSystem.level,
        width,
        height,
        this.runResult,
      );
    }

    if (this.debug) {
      let activeEnemies = 0;
      for (let i = 0; i < enemies.length; i++) {
        if (enemies[i].active) activeEnemies++;
      }
      this.renderer.drawDebug(this.loop.fps, activeEnemies, height);
    }

    if (this.devMode && this.state !== "dev") {
      this.renderer.drawDevHint(height);
    }

    this.hud.drawToasts(this.toasts);
  }

  destroy() {
    this.meta?.setRunSummaryProvider(null);
    this.loop.stop();
    this.input.destroy();
    this.music.stop();
    if (this.devPanel) {
      this.devPanel.destroy();
      this.devPanel = null;
    }
    if (window.__game === this) {
      delete window.__game;
    }
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("keydown", this._onPauseKey);
    this.canvas.removeEventListener("click", this._onCanvasClick);
  }
}
