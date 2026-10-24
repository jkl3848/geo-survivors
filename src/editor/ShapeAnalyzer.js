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

// Clockwise from north. Tracing walks this order so a filled blob yields one outer loop.
const CONTOUR_DIRS = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

function traceContour(body, width, height) {
  let sx = -1;
  let sy = -1;
  for (let y = 0; y < height && sx < 0; y++) {
    for (let x = 0; x < width; x++) {
      if (body[y * width + x]) {
        sx = x;
        sy = y;
        break;
      }
    }
  }
  if (sx < 0) return [];

  const contour = [{ x: sx, y: sy }];
  let x = sx;
  let y = sy;
  // Entered from the west. The first candidate is the next clockwise neighbor.
  let dir = 7;
  let firstStep = null;

  for (let steps = 0; steps < width * height; steps++) {
    let foundDir = -1;
    let nx = x;
    let ny = y;
    for (let i = 0; i < 8; i++) {
      const d = (dir + i) % 8;
      const tx = x + CONTOUR_DIRS[d][0];
      const ty = y + CONTOUR_DIRS[d][1];
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
      if (!body[ty * width + tx]) continue;
      foundDir = d;
      nx = tx;
      ny = ty;
      break;
    }
    if (foundDir < 0) break;

    // Stop when the start pixel is left toward the same neighbor as the first step.
    if (firstStep === null) {
      firstStep = { x: nx, y: ny };
    } else if (x === sx && y === sy && nx === firstStep.x && ny === firstStep.y) {
      break;
    }

    dir = (foundDir + 5) % 8;
    x = nx;
    y = ny;
    if (x !== sx || y !== sy) contour.push({ x, y });
  }

  return contour;
}

function computeContourLength(contour) {
  let length = 0;
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % contour.length];
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    if (dx && dy) length += Math.SQRT2;
    else if (dx || dy) length += 1;
  }
  return length;
}

function computePointiness(contour, shapeMetrics) {
  const n = contour.length;
  if (n < 8) return 0;

  const maxAngle = ((shapeMetrics.maxAngle ?? 150) * Math.PI) / 180;
  const minAngle = ((shapeMetrics.minAngle ?? 25) * Math.PI) / 180;
  const scale = shapeMetrics.scale ?? 4;
  if (scale <= 0 || maxAngle <= minAngle) return 0;

  let k = Math.max(3, Math.round(n * 0.04));
  if (n < 2 * k + 2) k = Math.floor((n - 2) / 2);
  if (k < 1) return 0;

  let shoelace = 0;
  for (let i = 0; i < n; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % n];
    shoelace += a.x * b.y - b.x * a.y;
  }
  const clockwise = shoelace > 0;

  const sharpness = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const prev = contour[(i - k + n) % n];
    const curr = contour[i];
    const next = contour[(i + k) % n];
    const inx = curr.x - prev.x;
    const iny = curr.y - prev.y;
    const outx = next.x - curr.x;
    const outy = next.y - curr.y;
    const inLen = Math.hypot(inx, iny);
    const outLen = Math.hypot(outx, outy);
    if (inLen < 1e-6 || outLen < 1e-6) continue;

    const cross = inx * outy - iny * outx;
    const convex = clockwise ? cross > 1e-6 : cross < -1e-6;
    if (!convex) continue;

    // Angle between the chords behind and ahead of this point. Straight is pi, a tip is near 0.
    const backx = prev.x - curr.x;
    const backy = prev.y - curr.y;
    const fwdx = next.x - curr.x;
    const fwdy = next.y - curr.y;
    let cos = (backx * fwdx + backy * fwdy) / (inLen * outLen);
    cos = Math.max(-1, Math.min(1, cos));
    const angle = Math.acos(cos);
    if (angle >= maxAngle) continue;
    sharpness[i] = Math.min(1, (maxAngle - angle) / (maxAngle - minAngle));
  }

  let peakSum = 0;
  for (let i = 0; i < n; i++) {
    if (sharpness[i] <= 0) continue;
    let peak = true;
    for (let d = 1; d <= k; d++) {
      const behind = sharpness[(i - d + n) % n];
      const ahead = sharpness[(i + d) % n];
      if (behind > sharpness[i] || ahead > sharpness[i] || behind === sharpness[i]) {
        peak = false;
        break;
      }
    }
    if (peak) peakSum += sharpness[i];
  }

  return 1 - Math.exp(-peakSum / scale);
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
  const contour = traceContour(body, width, height);
  const perimeter = computeContourLength(contour);
  const bounds = computeBounds(body, width, height);
  const shapeMetrics = statsConfig.shapeMetrics || {};

  const compactness = perimeter > 0
    ? (4 * Math.PI * area) / (perimeter * perimeter)
    : 0;
  const circleRef = shapeMetrics.circleRef > 0 ? shapeMetrics.circleRef : 1;
  const roundness = Math.max(0, Math.min(1, compactness / circleRef));
  const pointiness = computePointiness(contour, shapeMetrics);

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
      if (key === metric) modifier += w * pointiness;
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
