export function getUpgradeCardLayout(count, width, height) {
  const gap = 16;
  const safeCount = Math.max(count, 1);
  const available = Math.max(240, width - 32);
  let cardW = Math.floor((available - gap * (safeCount - 1)) / safeCount);
  cardW = Math.max(96, Math.min(220, cardW));
  const cardH = 176;
  const totalW = safeCount * cardW + Math.max(0, safeCount - 1) * gap;
  const startX = (width - totalW) / 2;
  const cardY = Math.max(96, height / 2 - 78);
  return { cardW, cardH, gap, startX, cardY };
}

export function upgradeChoiceAt(mx, my, count, width, height) {
  if (count <= 0) return -1;
  const layout = getUpgradeCardLayout(count, width, height);
  for (let i = 0; i < count; i++) {
    const cx = layout.startX + i * (layout.cardW + layout.gap);
    if (
      mx >= cx &&
      mx <= cx + layout.cardW &&
      my >= layout.cardY &&
      my <= layout.cardY + layout.cardH
    ) {
      return i;
    }
  }
  return -1;
}

export function getUpgradeActionLayout(actions, width, cardLayout) {
  const btnW = 150;
  const btnH = 34;
  const gap = 12;
  if (!actions.length) return [];
  const totalW = actions.length * btnW + (actions.length - 1) * gap;
  let x = (width - totalW) / 2;
  const y = cardLayout.cardY + cardLayout.cardH + 52;
  return actions.map((action) => {
    const rect = { ...action, x, y, w: btnW, h: btnH };
    x += btnW + gap;
    return rect;
  });
}

export function upgradeActionAt(mx, my, rects) {
  for (const rect of rects) {
    if (mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h) {
      return rect.id;
    }
  }
  return null;
}
