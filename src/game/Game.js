import { ObjectPool } from '../core/ObjectPool.js';
import { SpatialHash } from '../core/SpatialHash.js';
import { GameLoop } from './GameLoop.js';
import { Input } from './Input.js';
import { Player } from '../entities/Player.js';
import { Enemy } from '../entities/Enemy.js';
import { Projectile } from '../entities/Projectile.js';
import { XPOrb } from '../entities/XPOrb.js';
import { SpawnSystem } from '../systems/SpawnSystem.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { LevelSystem } from '../systems/LevelSystem.js';
import { Renderer } from '../render/Renderer.js';
import { HUD } from '../render/HUD.js';
import { MusicPlayer } from '../audio/MusicPlayer.js';
import { ColorUnlocks } from '../editor/ColorUnlocks.js';

export class Game {
  constructor(canvas, configs, characterData, onReturnToEditor) {
    this.canvas = canvas;
    this.configs = configs;
    this.characterData = characterData;
    this.onReturnToEditor = onReturnToEditor;

    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.state = 'playing';
    this._won = false;
    this._mutePressed = false;
    this.debug = new URLSearchParams(window.location.search).has('debug');

    this.player = new Player();
    this.input = new Input(canvas);
    this.loop = new GameLoop((dt) => this.update(dt), () => this.render());

    this.enemyPool = new ObjectPool(() => new Enemy(), 64);
    this.projectilePool = new ObjectPool(() => new Projectile(), 32);
    this.xpPool = new ObjectPool(() => new XPOrb(), 64);

    this.spatialHash = new SpatialHash(32);
    this.spawnSystem = new SpawnSystem(configs.spawn, configs.enemies, this.enemyPool);
    this.combatSystem = new CombatSystem(configs.stats);
    this.collisionSystem = new CollisionSystem(this.spatialHash);
    this.levelSystem = new LevelSystem(configs.stats.xp, configs.upgrades);

    this.renderer = null;
    this.hud = null;
    this.music = new MusicPlayer();
    this.colorUnlocks = configs.colors ? new ColorUnlocks(configs.colors) : null;
    this.newUnlocks = [];

    this._onResize = () => this._resize();
    this._onCanvasClick = (e) => this._handleCanvasClick(e);
    this._resize();
    window.addEventListener('resize', this._onResize);
    canvas.addEventListener('click', this._onCanvasClick);
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
    );

    this.enemyPool.releaseAll();
    this.projectilePool.releaseAll();
    this.xpPool.releaseAll();
    this.spawnSystem.reset();
    this.levelSystem.reset();

    this.renderer = new Renderer(this.ctx, width, height);
    this.hud = new HUD(this.ctx, width);

    await this.music.init(this.configs.music);
    this.music.play();

    this.state = 'playing';
    this.loop.setPaused(false);
    this.loop.start();
  }

  _pickUpgrade(index) {
    this.levelSystem.applyUpgrade(index, this.player);
    this.state = 'playing';
    this.loop.setPaused(false);
    this.music.playSfx('C5', 0.15);
  }

  _handleCanvasClick(e) {
    if (this.state !== 'upgrade') return;

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    const choice = this._getUpgradeClickChoiceAt(mx, my);
    if (choice !== -1) {
      this._pickUpgrade(choice);
    }
  }

  _getUpgradeClickChoiceAt(mx, my) {
    const choices = this.levelSystem.upgradeChoices;
    const { width, height } = this.canvas;
    const cardW = 200;
    const cardH = 120;
    const gap = 20;
    const totalW = choices.length * cardW + (choices.length - 1) * gap;
    const startX = (width - totalW) / 2;
    const cardY = height / 2 - 40;

    for (let i = 0; i < choices.length; i++) {
      const cx = startX + i * (cardW + gap);
      if (mx >= cx && mx <= cx + cardW && my >= cardY && my <= cardY + cardH) {
        return i;
      }
    }
    return -1;
  }

  _checkUnlocks() {
    if (!this.colorUnlocks) return;
    this.newUnlocks = this.colorUnlocks.checkRunUnlocks({
      won: this._won,
      elapsed: this.spawnSystem.elapsed,
      level: this.levelSystem.level,
    });
  }

  _resize() {
    const app = document.getElementById('app');
    this.canvas.width = app.clientWidth;
    this.canvas.height = app.clientHeight;
    if (this.renderer) {
      this.renderer.width = this.canvas.width;
      this.renderer.height = this.canvas.height;
      this.hud.width = this.canvas.width;
    }
  }

  update(dt) {
    if (this.state === 'gameover') {
      if (this.input.isKeyDown('r')) {
        this.destroy();
        this.onReturnToEditor();
      }
      return;
    }

    if (this.state === 'upgrade') {
      return;
    }

    if (this.input.isKeyDown('m')) {
      if (!this._mutePressed) {
        this.music.toggleMute();
        this._mutePressed = true;
      }
    } else {
      this._mutePressed = false;
    }

    if (!this.player.alive) {
      this.state = 'gameover';
      this._won = false;
      this.music.stop();
      this._checkUnlocks();
      return;
    }

    if (this.spawnSystem.isComplete()) {
      this.state = 'gameover';
      this._won = true;
      this.music.stop();
      this._checkUnlocks();
      return;
    }

    this.player.update(dt, this.input, this.canvas.width, this.canvas.height);
    this.spawnSystem.update(dt, this.canvas.width, this.canvas.height);

    if (this.player.canFire()) {
      const angle = this.input.getAimAngle(this.player.x, this.player.y);
      const proj = this.projectilePool.acquire();
      proj.init(
        this.player.x,
        this.player.y,
        angle,
        this.configs.stats.player.projectileSpeed,
        this.combatSystem.calcPlayerDamage(this.player.getStat('attack')),
        this.player.projectileRadius,
        this.player.pierce,
      );
      this.player.resetFireCooldown();
    }

    const enemies = this.enemyPool.getActive();
    for (const enemy of enemies) {
      if (enemy.active) {
        enemy.update(dt, this.player.x, this.player.y, this.canvas.width, this.canvas.height);
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

    for (const proj of projectiles) {
      if (!proj.active) continue;
      const hit = this.collisionSystem.checkProjectileHits(proj, enemies);
      if (hit) {
        proj.hitIds.add(hit);
        const killed = hit.takeDamage(proj.damage);
        if (killed) {
          this.music.playSfx('G4', 0.05, 'triangle');
          hit.reset();
          this.enemyPool.release(hit);
          const orb = this.xpPool.acquire();
          orb.init(hit.x, hit.y, hit.xpValue);
        }
        if (proj.pierceLeft > 0) {
          proj.pierceLeft--;
        } else {
          proj.reset();
          this.projectilePool.release(proj);
        }
      }
    }

    if (this.player.contactCooldown <= 0) {
      const touching = this.collisionSystem.checkPlayerEnemyCollisions(this.player, enemies);
      if (touching.length > 0) {
        let totalDmg = 0;
        for (const enemy of touching) {
          totalDmg += this.combatSystem.calcEnemyDamage(enemy.attack, this.player.getStat('defense'));
        }
        this.player.takeDamage(totalDmg);
        this.player.contactCooldown = this.configs.stats.player.contactCooldown;
      }
    }

    const collected = this.collisionSystem.checkXPickups(this.player, xpOrbs);
    for (const orb of collected) {
      const leveled = this.levelSystem.addXP(orb.value);
      orb.reset();
      this.xpPool.release(orb);
      if (leveled) {
        this.state = 'upgrade';
        this.loop.setPaused(true);
        this.music.playSfx('C5', 0.2);
      }
    }

    this._cleanupPools();
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

    this.hud.draw(
      this.player,
      this.spawnSystem.getTimeRemaining(),
      this.spawnSystem.getEnemyLevel(),
      this.levelSystem,
    );

    if (this.state === 'upgrade') {
      this.renderer.drawUpgradeOverlay(this.levelSystem.upgradeChoices, width, height);
    }

    if (this.state === 'gameover') {
      this.renderer.drawGameOver(
        this._won,
        this.spawnSystem.elapsed,
        this.levelSystem.level,
        width,
        height,
        this.newUnlocks,
      );
    }

    if (this.debug) {
      let activeEnemies = 0;
      for (let i = 0; i < enemies.length; i++) {
        if (enemies[i].active) activeEnemies++;
      }
      this.renderer.drawDebug(this.loop.fps, activeEnemies, height);
    }
  }

  destroy() {
    this.loop.stop();
    this.input.destroy();
    this.music.destroy();
    window.removeEventListener('resize', this._onResize);
    this.canvas.removeEventListener('click', this._onCanvasClick);
  }
}
