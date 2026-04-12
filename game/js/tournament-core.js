(function(globalScope) {
  const STRATEGIES = [
    { id: 'damage-only', label: 'Damage Only' },
    { id: 'health-only', label: 'Health Only' },
    { id: 'spawn-only', label: 'Spawn Only' },
    { id: 'cheapest-first', label: 'Cheapest First' },
    { id: 'balanced', label: 'Balanced' },
    { id: 'damage-health', label: 'Double Trouble: D + HP' },
    { id: 'damage-spawn', label: 'Double Trouble: D + Spawn' },
    { id: 'health-spawn', label: 'Double Trouble: HP + Spawn' },
  ];

  const MAP_PROFILES = {
    classic: {
      length: 800,
      laneInset: 100,
      baseHp: 2000,
      enableTowers: true,
    },
    'snowball-line': {
      length: 2200,
      laneInset: 40,
      baseHp: 1,
      enableTowers: false,
    },
  };

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

  function clampNumber(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  function buildRoundRobinPairs(strategies) {
    const pairs = [];
    for (let i = 0; i < strategies.length; i++) {
      for (let j = i + 1; j < strategies.length; j++) {
        pairs.push([strategies[i], strategies[j]]);
      }
    }
    return pairs;
  }

  function buildLeaderboardRows(summaryByStrategy) {
    return [...summaryByStrategy.values()].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return b.winRate - a.winRate;
    });
  }

  function computeRunAggregateStats(run) {
    const pairResults = Array.isArray(run.pairResults) ? run.pairResults : [];
    let draws = 0;
    let timeouts = 0;
    let totalTicks = 0;

    for (const pair of pairResults) {
      draws += Number(pair.draws) || 0;
      timeouts += Number(pair.timeouts) || 0;
      totalTicks += Number(pair.totalTicks) || 0;
    }

    const top = Array.isArray(run.leaderboardRows) && run.leaderboardRows.length > 0
      ? run.leaderboardRows[0]
      : null;

    const avgMatchSeconds = run.totalMatches > 0
      ? totalTicks / run.totalMatches / Math.max(1, run.tickRate || 60)
      : 0;

    return {
      draws,
      timeouts,
      totalTicks,
      avgMatchSeconds,
      top,
    };
  }

  const api = {
    STRATEGIES,
    MAP_PROFILES,
    getUpgradeTypeForStrategy,
    clampNumber,
    buildRoundRobinPairs,
    buildLeaderboardRows,
    computeRunAggregateStats,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (globalScope) {
    globalScope.LegionTournamentCore = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
