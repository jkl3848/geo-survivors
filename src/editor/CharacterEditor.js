import {
  analyzeShape,
  createPixelArtCanvas,
  processShape,
} from './ShapeAnalyzer.js';
import { MetaMenu } from '../meta/MetaMenu.js';

const GRID_SIZE = 128;
const DISPLAY_SCALE = 3;
const BRUSH_RADIUS = 1;

export class CharacterEditor {
  constructor(container, statsConfig, colorsConfig, meta, upgradesConfig, onPlay) {
    this.statsConfig = statsConfig;
    this.onPlay = onPlay;
    this.meta = meta;
    this.upgradesConfig = upgradesConfig;
    this.colors = colorsConfig.colors;
    this.selectedColor = this.colors.find((c) => this.meta.isColorUnlocked(c.id)) || this.colors[0];

    this.grid = new Uint8Array(GRID_SIZE * GRID_SIZE);
    const savedShape = this.meta.loadShape();
    if (savedShape?.grid?.length === this.grid.length) {
      this.grid.set(savedShape.grid);
    }
    if (savedShape?.colorId && this.meta.isColorUnlocked(savedShape.colorId)) {
      this.selectedColor = this.colors.find((color) => color.id === savedShape.colorId) || this.selectedColor;
    }
    this.metaMenu = new MetaMenu({
      meta: this.meta,
      colors: this.colors,
      upgrades: this.upgradesConfig,
      onChange: (reason) => this._onMetaChange(reason),
    });
    this.drawing = false;
    this.erasing = false;
    this.lastCell = null;
    this._statsDirty = false;

    this.root = document.createElement('div');
    this.root.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:16px;padding:20px;max-height:100%;overflow:auto;';

    const title = document.createElement('h1');
    title.textContent = 'GEO SURVIVORS';
    title.style.cssText = 'font-size:28px;letter-spacing:4px;color:#5dade2;margin-bottom:4px;';
    this.root.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.textContent = 'Draw your shape — stats depend on your geometry';
    subtitle.style.cssText = 'color:#888;font-size:13px;margin-bottom:8px;';
    this.root.appendChild(subtitle);

    const metaRow = document.createElement('div');
    metaRow.style.cssText = 'display:flex;gap:12px;align-items:center;';
    this.shardLabel = document.createElement('span');
    this.shardLabel.style.cssText = 'color:#f1c40f;font-size:13px;min-width:96px;';
    metaRow.appendChild(this.shardLabel);
    const upgradesBtn = this._makeButton('Upgrades', '#1a5276');
    upgradesBtn.style.padding = '8px 14px';
    upgradesBtn.style.fontSize = '12px';
    upgradesBtn.addEventListener('click', () => this.metaMenu.open('shop'));
    metaRow.appendChild(upgradesBtn);
    const recordsBtn = this._makeButton('Records', '#1a5276');
    recordsBtn.style.padding = '8px 14px';
    recordsBtn.style.fontSize = '12px';
    recordsBtn.addEventListener('click', () => this.metaMenu.open('records'));
    metaRow.appendChild(recordsBtn);
    this.root.appendChild(metaRow);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:24px;align-items:flex-start;';

    this.canvas = document.createElement('canvas');
    this.canvas.width = GRID_SIZE * DISPLAY_SCALE;
    this.canvas.height = GRID_SIZE * DISPLAY_SCALE;
    this.canvas.style.cssText = 'border:2px solid #333;cursor:crosshair;background:#111;image-rendering:pixelated;touch-action:none;';
    row.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    const side = document.createElement('div');
    side.style.cssText = 'width:220px;display:flex;flex-direction:column;gap:16px;';

    this.statsPanel = document.createElement('div');
    this.statsPanel.style.cssText = 'font-size:13px;line-height:1.8;';
    side.appendChild(this.statsPanel);

    const colorSection = document.createElement('div');
    colorSection.innerHTML = '<p style="color:#5dade2;font-weight:bold;margin-bottom:8px">COLOR</p>';
    this.colorGrid = document.createElement('div');
    this.colorGrid.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
    colorSection.appendChild(this.colorGrid);
    this.colorHint = document.createElement('p');
    this.colorHint.style.cssText = 'color:#888;font-size:10px;margin-top:6px;min-height:36px;max-width:280px;line-height:1.35;';
    colorSection.appendChild(this.colorHint);
    side.appendChild(colorSection);

    this.difficultyRow = document.createElement('div');
    side.appendChild(this.difficultyRow);

    row.appendChild(side);
    this.root.appendChild(row);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:12px;';

    const clearBtn = this._makeButton('Clear', '#555');
    clearBtn.addEventListener('click', () => this.clear());
    btnRow.appendChild(clearBtn);

    this.playBtn = this._makeButton('Play', '#2ecc71');
    this.playBtn.addEventListener('click', () => this._tryPlay());
    btnRow.appendChild(this.playBtn);

    this.root.appendChild(btnRow);

    this.msgEl = document.createElement('p');
    this.msgEl.style.cssText = 'color:#e74c3c;font-size:12px;min-height:18px;';
    this.root.appendChild(this.msgEl);

    const hint = document.createElement('p');
    hint.textContent = 'Left-click/drag: paint | Right-click/drag: erase | Shape auto-fills on release';
    hint.style.cssText = 'color:#666;font-size:11px;';
    this.root.appendChild(hint);

    container.appendChild(this.root);

    this._bindPointerEvents();
    this._buildColorPicker();
    this._renderDifficulty();
    this._updateShardLabel();
    this._redraw();
    this._updateStats();
  }

  _persistShape() {
    this.meta.saveShape(this.grid, this.selectedColor?.id);
  }

  _updateShardLabel() {
    this.shardLabel.textContent = `${this.meta.getShards()} shards`;
  }

  _onMetaChange(reason) {
    if (reason === 'reset') {
      this.grid.fill(0);
      this.selectedColor = this.colors.find((color) => this.meta.isColorUnlocked(color.id)) || this.colors[0];
      this.msgEl.textContent = '';
      this._redraw();
      this._updateStats();
    }
    this._buildColorPicker();
    this._renderDifficulty();
    this._updateShardLabel();
  }

  _renderDifficulty() {
    this.difficultyRow.innerHTML = '';
    const unlocked = this.meta.config.difficulties.filter((difficulty) => (
      this.meta.isDifficultyUnlocked(difficulty.id)
    ));
    if (unlocked.length < 2) return;

    this.difficultyRow.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    const label = document.createElement('p');
    label.textContent = 'DIFFICULTY';
    label.style.cssText = 'color:#5dade2;font-weight:bold;margin:0;';
    this.difficultyRow.appendChild(label);

    const buttons = document.createElement('div');
    buttons.style.cssText = 'display:flex;gap:6px;';
    const selected = this.meta.getSelectedDifficulty();
    for (const difficulty of unlocked) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = difficulty.name;
      const active = difficulty.id === selected;
      button.style.cssText = [
        'padding:6px 10px',
        'font-family:inherit',
        'font-size:11px',
        'cursor:pointer',
        `border:1px solid ${active ? '#f1c40f' : '#444'}`,
        `background:${active ? '#3d3208' : '#1a1a2e'}`,
        `color:${active ? '#f1c40f' : '#ccc'}`,
      ].join(';');
      button.addEventListener('click', () => {
        this.meta.setSelectedDifficulty(difficulty.id);
        this._renderDifficulty();
      });
      buttons.appendChild(button);
    }
    this.difficultyRow.appendChild(buttons);
  }

  _bindPointerEvents() {
    const onDown = (e) => {
      e.preventDefault();
      const cell = this._cellFromEvent(e);
      if (!cell) return;
      this.drawing = e.button === 0;
      this.erasing = e.button === 2;
      this.lastCell = cell;
      this._paintAt(cell.x, cell.y, this.drawing);
    };

    const onMove = (e) => {
      if (!this.drawing && !this.erasing) return;
      e.preventDefault();
      const cell = this._cellFromEvent(e);
      if (!cell) return;
      if (this.lastCell) {
        this._drawLine(this.lastCell.x, this.lastCell.y, cell.x, cell.y, this.drawing);
      } else {
        this._paintAt(cell.x, cell.y, this.drawing);
      }
      this.lastCell = cell;
    };

    const onUp = () => {
      if (this.drawing || this.erasing) {
        this._finalizeShape();
      }
      this.drawing = false;
      this.erasing = false;
      this.lastCell = null;
    };

    this.canvas.addEventListener('mousedown', onDown);
    this.canvas.addEventListener('mousemove', onMove);
    this.canvas.addEventListener('mouseup', onUp);
    this.canvas.addEventListener('mouseleave', onUp);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        e.button = 0;
        onDown(e);
        this.canvas.setPointerCapture(e.pointerId);
      }
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') onMove(e);
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') {
        onUp();
        this.canvas.releasePointerCapture(e.pointerId);
      }
    });
  }

  _buildColorPicker() {
    this.colorGrid.innerHTML = '';
    for (const color of this.colors) {
      const unlocked = this.meta.isColorUnlocked(color.id);
      const swatch = document.createElement('button');
      swatch.title = unlocked ? color.name : `${color.name} — ${this.meta.getUnlockHint(color)}`;
      swatch.style.cssText = `
        width:28px;height:28px;border:2px solid ${this.selectedColor?.id === color.id ? '#fff' : '#444'};
        background:${color.hex};cursor:${unlocked ? 'pointer' : 'not-allowed'};
        opacity:${unlocked ? '1' : '0.35'};padding:0;
      `;
      if (unlocked) {
        swatch.addEventListener('click', () => {
          this.selectedColor = color;
          this._persistShape();
          this._buildColorPicker();
          this._redraw();
          this._updateStats();
        });
      }
      this.colorGrid.appendChild(swatch);
    }
    this._updateColorHint();
  }

  _updateColorHint() {
    const c = this.selectedColor;
    if (!c) return;
    const ability = c.ability;
    if (ability) {
      this.colorHint.textContent = `${c.name}: ${ability.name} — ${ability.description}`;
    } else {
      this.colorHint.textContent = `${c.name}: No special ability`;
    }
  }

  _makeButton(text, color) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `padding:10px 28px;font-family:inherit;font-size:14px;border:none;cursor:pointer;background:${color};color:#fff;letter-spacing:1px;`;
    return btn;
  }

  _cellFromEvent(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / DISPLAY_SCALE);
    const y = Math.floor((e.clientY - rect.top) / DISPLAY_SCALE);
    if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) return null;
    return { x, y };
  }

  _drawLine(x0, y0, x1, y1, on) {
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let changed = false;
    while (true) {
      if (this._paintAt(x0, y0, on, false)) changed = true;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    if (changed) {
      this._redraw();
      this._scheduleStatsUpdate();
    }
  }

  _paintAt(cx, cy, on, redraw = true) {
    const val = on ? 1 : 0;
    let changed = false;
    for (let dy = -BRUSH_RADIUS; dy <= BRUSH_RADIUS; dy++) {
      for (let dx = -BRUSH_RADIUS; dx <= BRUSH_RADIUS; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) continue;
        const idx = y * GRID_SIZE + x;
        if (this.grid[idx] !== val) {
          this.grid[idx] = val;
          changed = true;
        }
      }
    }
    if (changed && redraw) {
      this._redraw();
      this._scheduleStatsUpdate();
    }
    return changed;
  }

  _scheduleStatsUpdate() {
    if (this._statsDirty) return;
    this._statsDirty = true;
    requestAnimationFrame(() => {
      this._statsDirty = false;
      this._updateStats();
    });
  }

  _finalizeShape() {
    const processed = processShape(this.grid, GRID_SIZE, GRID_SIZE);
    this.grid.set(processed);
    this._persistShape();
    this._redraw();
    this._updateStats();
  }

  clear() {
    this.grid.fill(0);
    this.msgEl.textContent = '';
    this._persistShape();
    this._redraw();
    this._updateStats();
  }

  _redraw() {
    this.ctx.fillStyle = '#111';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const color = this.selectedColor?.hex || '#5dade2';
    this.ctx.fillStyle = color;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (this.grid[y * GRID_SIZE + x]) {
          this.ctx.fillRect(x * DISPLAY_SCALE, y * DISPLAY_SCALE, DISPLAY_SCALE, DISPLAY_SCALE);
        }
      }
    }

    this.ctx.strokeStyle = '#222';
    this.ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_SIZE; i += 16) {
      const p = i * DISPLAY_SCALE;
      this.ctx.beginPath();
      this.ctx.moveTo(p, 0);
      this.ctx.lineTo(p, this.canvas.height);
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.moveTo(0, p);
      this.ctx.lineTo(this.canvas.width, p);
      this.ctx.stroke();
    }
  }

  _getAnalysis() {
    const body = processShape(this.grid, GRID_SIZE, GRID_SIZE);
    let hasPixel = false;
    for (let i = 0; i < body.length; i++) {
      if (body[i]) {
        hasPixel = true;
        break;
      }
    }
    if (!hasPixel) return null;
    return analyzeShape(body, GRID_SIZE, GRID_SIZE, this.statsConfig);
  }

  _updateStats() {
    const analysis = this._getAnalysis();
    if (!analysis) {
      this.statsPanel.innerHTML = '<p style="color:#666">Draw a shape to see stats</p>';
      this._analysis = null;
      return;
    }

    this._analysis = analysis;
    const s = analysis.stats;
    const m = analysis.metrics;
    this.statsPanel.innerHTML = `
      <p style="color:#5dade2;margin-bottom:8px;font-weight:bold">STATS</p>
      <div>Attack: <span style="color:#e74c3c">${s.attack.toFixed(1)}</span></div>
      <div>Defense: <span style="color:#2ecc71">${s.defense.toFixed(1)}</span></div>
      <div>HP: <span style="color:#f39c12">${s.hp.toFixed(0)}</span></div>
      <div>Regen: <span style="color:#9b59b6">${s.healthRegen.toFixed(2)}/s</span></div>
      <div>Speed: <span style="color:#3498db">${s.speed.toFixed(0)}</span></div>
      <div>Atk Speed: <span style="color:#e67e22">${s.attackSpeed.toFixed(2)}/s</span></div>
      <hr style="border-color:#333;margin:10px 0">
      <p style="color:#888;font-size:11px">Area: ${m.area}px</p>
      <p style="color:#888;font-size:11px">Roundness: ${(m.roundness * 100).toFixed(0)}%</p>
      <p style="color:#888;font-size:11px">Pointiness: ${(m.pointiness * 100).toFixed(0)}%</p>
      ${!analysis.valid ? '<p style="color:#e74c3c;margin-top:8px">Shape too small!</p>' : ''}
    `;
  }

  _tryPlay() {
    this._finalizeShape();

    const analysis = this._getAnalysis();
    if (!analysis) {
      this.msgEl.textContent = 'Draw a shape first!';
      return;
    }

    if (!analysis.valid) {
      this.msgEl.textContent = `Shape needs at least ${this.statsConfig.limits.minBodyPixels} pixels!`;
      return;
    }

    const color = this.selectedColor?.hex || '#5dade2';
    const pixelArt = createPixelArtCanvas(analysis.body, GRID_SIZE, GRID_SIZE, color);
    this.onPlay({
      stats: analysis.stats,
      body: analysis.body,
      bounds: analysis.metrics.bounds,
      pixelArt,
      color,
      colorId: this.selectedColor?.id,
      difficulty: this.meta.getSelectedDifficulty(),
    });
  }

  destroy() {
    this.metaMenu.close();
    this.root.remove();
  }
}
