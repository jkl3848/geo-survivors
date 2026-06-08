import { CharacterEditor } from './editor/CharacterEditor.js';
import { Game } from './game/Game.js';

async function loadConfigs() {
  const [stats, enemies, upgrades, spawn, music, colors] = await Promise.all([
    fetch('/config/stats.json').then((r) => r.json()),
    fetch('/config/enemies.json').then((r) => r.json()),
    fetch('/config/upgrades.json').then((r) => r.json()),
    fetch('/config/spawn.json').then((r) => r.json()),
    fetch('/config/music.json').then((r) => r.json()),
    fetch('/config/colors.json').then((r) => r.json()),
  ]);
  return { stats, enemies, upgrades, spawn, music, colors };
}

class App {
  constructor() {
    this.app = document.getElementById('app');
    this.configs = null;
    this.editor = null;
    this.game = null;
    this.canvas = null;
  }

  async init() {
    this.configs = await loadConfigs();
    this.showEditor();
  }

  showEditor() {
    this._cleanup();

    this.app.innerHTML = '';
    this.editor = new CharacterEditor(this.app, this.configs.stats, this.configs.colors, (characterData) => {
      this.startGame(characterData);
    });
  }

  async startGame(characterData) {
    this._cleanup();

    this.app.innerHTML = '';
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.app.appendChild(this.canvas);

    this.game = new Game(this.canvas, this.configs, characterData, () => {
      this.showEditor();
    });

    await this.game.music.resume();
    await this.game.start();
  }

  _cleanup() {
    if (this.editor) {
      this.editor.destroy();
      this.editor = null;
    }
    if (this.game) {
      this.game.destroy();
      this.game = null;
    }
    this.canvas = null;
  }
}

const app = new App();
app.init();
