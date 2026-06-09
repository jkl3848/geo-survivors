export const RARITY_STYLES = {
  1: { border: '#9e9e9e', bg: '#2a2a2a', text: '#cccccc', label: 'Common' },
  2: { border: '#2ecc71', bg: '#1a3328', text: '#a8e6c0', label: 'Uncommon' },
  3: { border: '#3498db', bg: '#1a2a3a', text: '#aed6f1', label: 'Rare' },
  4: { border: '#9b59b6', bg: '#2a1a33', text: '#d7bde2', label: 'Epic' },
  5: { border: '#f1c40f', bg: '#3a331a', text: '#f9e79f', label: 'Legendary' },
  6: { border: '#e74c3c', bg: '#331a1a', text: '#f5b7b1', label: 'Special' },
};

export function getRarityStyle(rarity) {
  return RARITY_STYLES[rarity] || RARITY_STYLES[1];
}
