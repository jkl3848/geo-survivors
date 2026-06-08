export class SpatialHash {
  constructor(cellSize = 32) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this._queryBuffer = [];
  }

  clear() {
    this.cells.clear();
  }

  _key(cx, cy) {
    return `${cx},${cy}`;
  }

  _cellCoords(x, y) {
    return [
      Math.floor(x / this.cellSize),
      Math.floor(y / this.cellSize),
    ];
  }

  insert(entity) {
    const [cx, cy] = this._cellCoords(entity.x, entity.y);
    const key = this._key(cx, cy);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = [];
      this.cells.set(key, cell);
    }
    cell.push(entity);
    entity._hashCx = cx;
    entity._hashCy = cy;
  }

  queryRadius(x, y, radius) {
    this._queryBuffer.length = 0;
    const r = Math.ceil(radius / this.cellSize);
    const [cx, cy] = this._cellCoords(x, y);
    const rSq = radius * radius;

    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const cell = this.cells.get(this._key(cx + dx, cy + dy));
        if (!cell) continue;
        for (let i = 0; i < cell.length; i++) {
          const e = cell[i];
          const ddx = e.x - x;
          const ddy = e.y - y;
          if (ddx * ddx + ddy * ddy <= rSq) {
            this._queryBuffer.push(e);
          }
        }
      }
    }
    return this._queryBuffer;
  }

  queryPoint(x, y) {
    const [cx, cy] = this._cellCoords(x, y);
    return this.cells.get(this._key(cx, cy)) || [];
  }
}
