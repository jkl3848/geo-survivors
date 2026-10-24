export function getUpgradeCardLayout(count, width, height) {
  const cardW = 220;
  const cardH = 176;
  const gap = 16;
  const totalW = count * cardW + Math.max(0, count - 1) * gap;
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
