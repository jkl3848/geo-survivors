const PITCH_FREQ = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25,
};

export { PITCH_FREQ };

export function findMainBody(grid, width, height) {
  const visited = new Uint8Array(width * height);
  let bestComponent = null;
  let bestSize = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!grid[idx] || visited[idx]) continue;

      const component = [];
      const stack = [idx];
      visited[idx] = 1;

      while (stack.length > 0) {
        const ci = stack.pop();
        component.push(ci);
        const cx = ci % width;
        const cy = Math.floor(ci / width);

        const neighbors = [
          [cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (grid[ni] && !visited[ni]) {
            visited[ni] = 1;
            stack.push(ni);
          }
        }
      }

      if (component.length > bestSize) {
        bestSize = component.length;
        bestComponent = component;
      }
    }
  }

  if (!bestComponent) return null;

  const body = new Uint8Array(width * height);
  for (const idx of bestComponent) {
    body[idx] = 1;
  }
  return body;
}

function computePerimeter(body, width, height) {
  let perimeter = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!body[idx]) continue;

      let isEdge = false;
      const neighbors = [
        [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
      ];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || !body[ny * width + nx]) {
          isEdge = true;
          break;
        }
      }
      if (isEdge) perimeter++;
    }
  }
  return perimeter;
}

function computeBounds(body, width, height) {
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (body[y * width + x]) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function analyzeShape(body, width, height, statsConfig) {
  const area = body.reduce((sum, v) => sum + v, 0);
  const perimeter = computePerimeter(body, width, height);
  const bounds = computeBounds(body, width, height);

  const roundness = perimeter > 0
    ? Math.min(1, (4 * Math.PI * area) / (perimeter * perimeter))
    : 0;
  const pointiness = perimeter > 0
    ? Math.min(1, (perimeter * perimeter) / (4 * Math.PI * area) - 1)
    : 0;

  const maxArea = statsConfig.limits.maxArea;
  const areaNorm = Math.min(1, area / maxArea);

  const metrics = { area, areaNorm, roundness, pointiness, bounds, perimeter };

  const base = statsConfig.baseStats;
  const weights = statsConfig.shapeWeights;
  const stats = {};

  for (const key of Object.keys(base)) {
    let modifier = 0;
    for (const [metric, w] of Object.entries(weights.area || {})) {
      if (key === metric) modifier += w * areaNorm;
    }
    for (const [metric, w] of Object.entries(weights.roundness || {})) {
      if (key === metric) modifier += w * roundness;
    }
    for (const [metric, w] of Object.entries(weights.pointiness || {})) {
      if (key === metric) modifier += w * Math.max(0, pointiness);
    }
    stats[key] = base[key] * (1 + modifier);
  }

  return { stats, metrics, body, valid: area >= statsConfig.limits.minBodyPixels };
}

export function fillInteriorHoles(body, width, height) {
  const outside = new Uint8Array(width * height);
  const queue = [];

  const trySeed = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (body[idx] || outside[idx]) return;
    outside[idx] = 1;
    queue.push(idx);
  };

  for (let x = 0; x < width; x++) {
    trySeed(x, 0);
    trySeed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    trySeed(0, y);
    trySeed(width - 1, y);
  }

  while (queue.length > 0) {
    const idx = queue.shift();
    const x = idx % width;
    const y = Math.floor(idx / width);
    const neighbors = [
      [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (!body[ni] && !outside[ni]) {
        outside[ni] = 1;
        queue.push(ni);
      }
    }
  }

  const filled = new Uint8Array(width * height);
  for (let i = 0; i < body.length; i++) {
    filled[i] = (body[i] || !outside[i]) ? 1 : 0;
  }
  return filled;
}

export function processShape(grid, width, height) {
  const main = findMainBody(grid, width, height);
  if (!main) return new Uint8Array(width * height);

  const filled = fillInteriorHoles(main, width, height);
  const result = findMainBody(filled, width, height);
  return result || filled;
}

export function applyColorTraits(stats, traits) {
  const result = { ...stats };
  for (const [key, value] of Object.entries(traits || {})) {
    if (result[key] !== undefined) {
      result[key] *= (1 + value);
    }
  }
  return result;
}

export function createPixelArtCanvas(body, width, height, color = '#5dade2') {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (body[y * width + x]) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  return canvas;
}
