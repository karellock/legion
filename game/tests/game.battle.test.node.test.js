const battleTest = require('../js/game-battle-test.js');

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

runTest('runBattleTests applies config and buys upgrades on 1Hz cadence', () => {
  const createdSims = [];
  const chooserCalls = [];

  const result = battleTest.runBattleTests({
    buildMatchConfig() {
      return {
        simOptions: { width: 800 },
        economyOptions: { killBountyGold: 7, baseGoldPerSecond: 2, shrineGoldPerSecond: 1 },
        spawnLayout: { padding: 10, slotCount: 5 },
      };
    },
    constants: { TICK_RATE: 60 },
    createSimulation() {
      const purchases = [];
      let tickCount = 0;
      const sim = {
        constants: { TICK_RATE: 60 },
        state: {
          leftBase: { isDestroyed: () => false },
          rightBase: { isDestroyed: () => tickCount >= 60 },
        },
        setEconomyValues(value) {
          sim.economy = value;
        },
        setSpawnLayout(value) {
          sim.spawnLayout = value;
        },
        getUpgradeSnapshot() {
          return {
            left: { nextDamageCost: 10, nextHealthCost: 6, nextSpawnCost: 20 },
            right: { nextDamageCost: 9, nextHealthCost: 12, nextSpawnCost: 30 },
          };
        },
        buyUpgrade(side, type) {
          purchases.push({ side, type });
        },
        tick() {
          tickCount += 1;
        },
        get purchases() {
          return purchases;
        },
      };
      createdSims.push(sim);
      return sim;
    },
    getUpgradeTypeForStrategy(strategy, snapshot) {
      chooserCalls.push({ strategy, snapshot });
      return strategy === 'cheapest-first'
        ? (snapshot.nextHealthCost <= snapshot.nextDamageCost && snapshot.nextHealthCost <= snapshot.nextSpawnCost ? 'health' : 'damage')
        : 'damage';
    },
    leftStrategy: 'cheapest-first',
    rightStrategy: 'damage-only',
    matchCount: 1,
  });

  assert(createdSims.length === 1, 'one simulation should be created per match');
  assert(createdSims[0].economy.killBountyGold === 7, 'battle tests should apply economy overrides to each sim');
  assert(createdSims[0].spawnLayout.slotCount === 5, 'battle tests should apply spawn layout overrides to each sim');
  assert(chooserCalls.length === 2, 'both sides should choose an upgrade on the 1Hz purchase tick');
  assert(createdSims[0].purchases.length === 2, 'both sides should buy once before the match ends');
  assert(createdSims[0].purchases[0].side === 'left' && createdSims[0].purchases[0].type === 'health', 'left side should buy the chooser-selected upgrade');
  assert(createdSims[0].purchases[1].side === 'right' && createdSims[0].purchases[1].type === 'damage', 'right side should buy the chooser-selected upgrade');
  assert(result.leftWins === 1, 'destroying the right base should count as a blue win');
  assert(result.totalTicks === 60, 'total ticks should include the winning tick');
});

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}