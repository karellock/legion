(function(globalScope) {
  function getUpgradeTypeForStrategy(strategy, snapshot) {
    if (strategy === 'damage-only') return 'damage';
    if (strategy === 'health-only') return 'health';
    if (strategy === 'spawn-only') return 'spawn';
    if (strategy === 'cheapest-first') {
      const costs = [
        { type: 'damage', cost: Number(snapshot.nextDamageCost) },
        { type: 'health', cost: Number(snapshot.nextHealthCost) },
        { type: 'spawn', cost: Number(snapshot.nextSpawnCost) },
      ].filter(entry => Number.isFinite(entry.cost));

      if (costs.length === 0) {
        return null;
      }

      costs.sort((a, b) => {
        if (a.cost !== b.cost) return a.cost - b.cost;
        return a.type.localeCompare(b.type);
      });
      return costs[0].type;
    }

    if (strategy === 'balanced') {
      const levels = [
        { type: 'damage', level: snapshot.damageLevel },
        { type: 'health', level: snapshot.healthLevel },
        { type: 'spawn', level: snapshot.spawnLevel },
      ];
      levels.sort((a, b) => {
        if (a.level !== b.level) return a.level - b.level;
        return a.type.localeCompare(b.type);
      });
      return levels[0].type;
    }

    if (strategy === 'damage-health') return snapshot.damageLevel <= snapshot.healthLevel ? 'damage' : 'health';
    if (strategy === 'damage-spawn') return snapshot.damageLevel <= snapshot.spawnLevel ? 'damage' : 'spawn';
    if (strategy === 'health-spawn') return snapshot.healthLevel <= snapshot.spawnLevel ? 'health' : 'spawn';

    return null;
  }

  function nextUpgradeTypeForBot(simulation, side, botStrategy) {
    const snapshot = simulation.getUpgradeSnapshot()[side];
    return getUpgradeTypeForStrategy(botStrategy[side], snapshot);
  }

  function runBotPurchasesForTick({ simulation, state, constants, botStrategy }) {
    if (state.gameTime % constants.TICK_RATE !== 0) {
      return;
    }

    for (const side of ['left', 'right']) {
      const type = nextUpgradeTypeForBot(simulation, side, botStrategy);
      if (!type) {
        continue;
      }

      simulation.buyUpgrade(side, type);
    }
  }

  const api = {
    getUpgradeTypeForStrategy,
    nextUpgradeTypeForBot,
    runBotPurchasesForTick,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (globalScope) {
    globalScope.LegionGameBotCore = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
