const core = require('../js/tournament-core.js');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name} - ${error.message}`);
    process.exitCode = 1;
  }
}

runTest('tournament core exports strategy and map profile catalogs', () => {
  assert(Array.isArray(core.STRATEGIES), 'STRATEGIES should be exported');
  assert(core.STRATEGIES.length >= 4, 'expected at least four strategies');
  assert(core.MAP_PROFILES && typeof core.MAP_PROFILES === 'object', 'MAP_PROFILES should be exported');
  assert(core.MAP_PROFILES.classic.enableTowers === true, 'classic profile should enable towers');
});

runTest('getUpgradeTypeForStrategy handles balanced and dual-track bots', () => {
  const balanced = core.getUpgradeTypeForStrategy('balanced', {
    damageLevel: 1,
    healthLevel: 0,
    spawnLevel: 2,
  });
  assert(balanced === 'health', 'balanced should pick the lowest level');

  const dual = core.getUpgradeTypeForStrategy('damage-spawn', {
    damageLevel: 3,
    healthLevel: 0,
    spawnLevel: 2,
  });
  assert(dual === 'spawn', 'damage-spawn should pick lower track between damage and spawn');
});

runTest('getUpgradeTypeForStrategy supports cheapest-first bot', () => {
  const cheapest = core.getUpgradeTypeForStrategy('cheapest-first', {
    damageLevel: 0,
    healthLevel: 0,
    spawnLevel: 0,
    nextDamageCost: 30,
    nextHealthCost: 8,
    nextSpawnCost: 8,
  });

  assert(cheapest === 'health', 'cheapest-first should choose the lowest next cost and break ties deterministically');
});

runTest('clampNumber enforces numeric bounds and fallback', () => {
  assert(core.clampNumber('abc', 5, 1, 10) === 5, 'invalid value should return fallback');
  assert(core.clampNumber(0, 5, 1, 10) === 1, 'below minimum should clamp to min');
  assert(core.clampNumber(99, 5, 1, 10) === 10, 'above maximum should clamp to max');
});

runTest('buildRoundRobinPairs returns unique unordered pairs', () => {
  const pairs = core.buildRoundRobinPairs(['a', 'b', 'c']);
  assert(pairs.length === 3, '3 strategies should produce 3 unique pairs');
  const serialized = pairs.map(pair => pair.join('-')).sort().join(',');
  assert(serialized === 'a-b,a-c,b-c', 'round robin pairs should contain all combinations');
});

runTest('buildLeaderboardRows sorts by points then winRate', () => {
  const rows = core.buildLeaderboardRows(new Map([
    ['x', { name: 'x', points: 4, winRate: 0.4 }],
    ['y', { name: 'y', points: 5, winRate: 0.1 }],
    ['z', { name: 'z', points: 4, winRate: 0.7 }],
  ]));

  assert(rows[0].name === 'y', 'highest points should rank first');
  assert(rows[1].name === 'z', 'tie on points should use winRate');
  assert(rows[2].name === 'x', 'lower winRate in tie should rank after higher one');
});

runTest('computeRunAggregateStats summarizes pair results and top strategy', () => {
  const stats = core.computeRunAggregateStats({
    pairResults: [
      { draws: 1, timeouts: 2, totalTicks: 600 },
      { draws: 2, timeouts: 0, totalTicks: 300 },
    ],
    leaderboardRows: [{ name: 'balanced', winRate: 0.75 }],
    totalMatches: 9,
    tickRate: 60,
  });

  assert(stats.draws === 3, 'draw sum should match pair rows');
  assert(stats.timeouts === 2, 'timeout sum should match pair rows');
  assert(stats.totalTicks === 900, 'tick sum should match pair rows');
  assert(stats.avgMatchSeconds === 900 / 9 / 60, 'average match seconds should be derived from totalTicks');
  assert(stats.top && stats.top.name === 'balanced', 'top strategy should come from leaderboard rows');
});

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
