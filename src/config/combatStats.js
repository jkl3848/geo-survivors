export const PATHS = ["lightning", "fire", "frost", "gunner"];

export const PATH_COLORS = {
  lightning: "#f4d03f",
  fire: "#e67e22",
  frost: "#7ec8e3",
  gunner: "#ecf0f1",
};

export const PLAYER_COMBAT_KEYS = [
  "critChance",
  "critMultiplier",
  "chainChance",
  "chainJumps",
  "chainDamage",
  "burnChance",
  "burnDps",
  "burnDuration",
  "explodeChance",
  "explosionDamage",
  "burnSpread",
  "napalm",
  "slowChance",
  "slowAmount",
  "slowDuration",
  "freezeChance",
  "freezeDuration",
  "shatterBonus",
  "shatterShards",
  "shockOnChain",
  "shockBonus",
  "shockDuration",
  "forwardShots",
  "rearShots",
  "sideShots",
  "shotSpread",
  "ricochet",
  "projectileSpeed",
  "glacialArmor",
  "plasma",
  "thermalShock",
  "staticShards",
  "retaliationRadius",
  "retaliationDamage",
];

const PERCENT_STATS = new Set([
  "critChance",
  "chainChance",
  "chainDamage",
  "burnChance",
  "burnDps",
  "explodeChance",
  "explosionDamage",
  "burnSpread",
  "napalm",
  "slowChance",
  "slowAmount",
  "freezeChance",
  "shatterBonus",
  "shatterShards",
  "shockBonus",
  "projectileSpeed",
  "retaliationDamage",
  "slow",
  "damage",
  "hpCost",
  "attackSpeedBonus",
  "damageBonus",
  "leech",
  "healPerSec",
  "thorns",
  "xpBonus",
  "coinDamage",
  "damagePerSec",
  "collapseDamage",
  "aftershock",
  "dashDamage",
  "heartache",
  "healOnCast",
  "echoDamage",
  "sunspot",
  "smart",
  "moveSlow",
  "repelDamage",
]);

const SECONDS_STATS = new Set([
  "burnDuration",
  "slowDuration",
  "freezeDuration",
  "shockDuration",
  "interval",
  "freeze",
  "cooldown",
  "duration",
  "stun",
  "lookback",
  "windup",
  "paradox",
  "aftershockDelay",
  "dashDuration",
]);

export const COMBAT_LABELS = {
  critChance: "Crit chance",
  critMultiplier: "Crit damage",
  chainChance: "Chain chance",
  chainJumps: "Chain jumps",
  chainDamage: "Chain damage",
  burnChance: "Burn chance",
  burnDps: "Burn damage",
  burnDuration: "Burn time",
  explodeChance: "Death blast",
  explosionDamage: "Blast damage",
  burnSpread: "Burn spread",
  napalm: "Napalm",
  slowChance: "Slow chance",
  slowAmount: "Slow strength",
  slowDuration: "Slow time",
  freezeChance: "Freeze chance",
  freezeDuration: "Freeze time",
  shatterBonus: "Shatter bonus",
  shatterShards: "Ice shards",
  shockOnChain: "Shock chains",
  shockBonus: "Shock bonus",
  shockDuration: "Shock time",
  forwardShots: "Forward shots",
  rearShots: "Rear shots",
  sideShots: "Side shots",
  shotSpread: "Spread",
  ricochet: "Ricochet",
  projectileSpeed: "Bullet speed",
  glacialArmor: "Glacial armor",
  plasma: "Plasma",
  thermalShock: "Thermal shock",
  staticShards: "Static shards",
  retaliationRadius: "Retaliation range",
  retaliationDamage: "Retaliation damage",
  attack: "Attack",
  defense: "Defense",
  hp: "Max HP",
  speed: "Speed",
  attackSpeed: "Attack speed",
  pierce: "Pierce",
  pickupRadius: "Pickup range",
  projectileRadius: "Bullet size",
  xpGain: "XP gain",
  healthRegen: "Regen",
  bolts: "Bolts",
  interval: "Interval",
  damage: "Strike damage",
  radius: "Radius",
  range: "Range",
  freeze: "Nova freeze",
  slow: "Aura slow",
  cooldown: "Cooldown",
  duration: "Duration",
  charges: "Charges",
  stun: "Stun",
  pull: "Pull",
  knockback: "Knockback",
  repelDamage: "Repel damage",
  hpCost: "HP cost",
  attackSpeedBonus: "Atk speed bonus",
  damageBonus: "Damage bonus",
  leech: "Leech",
  healPerSec: "Heal/sec",
  thorns: "Thorns",
  xpBonus: "XP bonus",
  coins: "Coins",
  coinDamage: "Coin damage",
  damagePerSec: "DPS",
  collapseDamage: "Collapse",
  aftershock: "Aftershock",
  distance: "Dash distance",
  dashDamage: "Dash damage",
  fireRate: "Fire rate",
  shots: "Shots",
  smart: "Smart rounds",
  heartache: "Heartache",
  healOnCast: "Cast heal",
  lookback: "Lookback",
  echoDamage: "Echo damage",
  echoRadius: "Echo radius",
  paradox: "Paradox",
  windup: "Windup",
  length: "Beam length",
  width: "Beam width",
  tickRate: "Tick rate",
  sunspot: "Sunspot",
  moveSlow: "Move slow",
};

export function pathColor(tag) {
  return PATH_COLORS[tag] || "#ecf0f1";
}

export function dominantPath(tagCounts) {
  let best = null;
  let bestN = 0;
  if (!tagCounts) return null;
  for (const tag of Object.keys(tagCounts)) {
    if (!PATH_COLORS[tag]) continue;
    const n = tagCounts[tag] || 0;
    if (n > bestN) {
      best = tag;
      bestN = n;
    }
  }
  return best;
}

export function formatCombatValue(key, value) {
  if (!Number.isFinite(value)) return "0";
  if (key === "shotSpread") {
    return `${Math.round((value * 180) / Math.PI)}°`;
  }
  if (key === "critMultiplier") return `${value.toFixed(2)}x`;
  if (PERCENT_STATS.has(key)) return `${Math.round(value * 100)}%`;
  if (SECONDS_STATS.has(key)) return `${value.toFixed(1)}s`;
  if (Math.abs(value - Math.round(value)) < 0.05) return String(Math.round(value));
  return value.toFixed(1);
}

export function emptyCombat(defaults = {}) {
  const combat = {};
  for (const key of PLAYER_COMBAT_KEYS) {
    combat[key] = defaults[key] || 0;
  }
  return combat;
}
