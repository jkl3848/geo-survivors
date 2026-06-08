export class CombatSystem {
  constructor(statsConfig) {
    this.statsConfig = statsConfig;
  }

  calcPlayerDamage(attack) {
    return Math.max(this.statsConfig.damageFormula.minDamage, attack);
  }

  calcEnemyDamage(enemyAttack, playerDefense) {
    const reduction = playerDefense / (playerDefense + this.statsConfig.damageFormula.defenseDivisor);
    return Math.max(
      this.statsConfig.damageFormula.minDamage,
      enemyAttack * (1 - reduction),
    );
  }
}
