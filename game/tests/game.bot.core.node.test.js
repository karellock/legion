const botCore = require('../js/game-bot-core.js');

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

runTest('getUpgradeTypeForStrategy chooses lowest balanced level', () => {
  const choice = botCore.getUpgradeTypeForStrategy('balanced', {
    damageLevel: 2,
    healthLevel: 0,
    spawnLevel: 1,
  });
  assert(choice === 'health', 'balanced strategy should choose the lowest level track');
});

runTest('dual-track bot strategy decisions are deterministic', () => {
  const damageSpawn = botCore.getUpgradeTypeForStrategy('damage-spawn', {
    damageLevel: 3,
    healthLevel: 0,
    spawnLevel: 1,
  });
  assert(damageSpawn === 'spawn', 'damage-spawn strategy should choose lower between damage and spawn');

  const healthSpawn = botCore.getUpgradeTypeForStrategy('health-spawn', {
    damageLevel: 0,
    healthLevel: 2,
    spawnLevel: 2,
  });
  assert(healthSpawn === 'health', 'health-spawn ties should prefer health by <= rule');
});

runTest('cheapest-first strategy picks lowest next cost with deterministic tie-break', () => {
  const choice = botCore.getUpgradeTypeForStrategy('cheapest-first', {
    damageLevel: 3,
    healthLevel: 1,
    spawnLevel: 0,
    nextDamageCost: 40,
    nextHealthCost: 12,
    nextSpawnCost: 12,
  });

  assert(choice === 'health', 'cheapest-first should pick lowest cost and break ties alphabetically');
});

runTest('nextUpgradeTypeForBot uses simulation snapshot and strategy map', () => {
  const simulation = {
    getUpgradeSnapshot() {
      return {
        left: { damageLevel: 0, healthLevel: 1, spawnLevel: 2, nextDamageCost: 20, nextHealthCost: 10, nextSpawnCost: 30 },
        right: { damageLevel: 3, healthLevel: 2, spawnLevel: 1 },
      };
    },
  };
  const strategy = { left: 'balanced', right: 'damage-spawn' };

  const left = botCore.nextUpgradeTypeForBot(simulation, 'left', strategy);
  const right = botCore.nextUpgradeTypeForBot(simulation, 'right', strategy);

  assert(left === 'damage', 'left bot should pick damage from balanced snapshot');
  assert(right === 'spawn', 'right bot should pick spawn from damage-spawn snapshot');
});

runTest('nextUpgradeTypeForBot supports cheapest-first strategy', () => {
  const simulation = {
    getUpgradeSnapshot() {
      return {
        left: { damageLevel: 0, healthLevel: 0, spawnLevel: 0, nextDamageCost: 15, nextHealthCost: 9, nextSpawnCost: 20 },
        right: { damageLevel: 0, healthLevel: 0, spawnLevel: 0, nextDamageCost: 30, nextHealthCost: 12, nextSpawnCost: 12 },
      };
    },
  };

  const left = botCore.nextUpgradeTypeForBot(simulation, 'left', { left: 'cheapest-first', right: 'none' });
  const right = botCore.nextUpgradeTypeForBot(simulation, 'right', { left: 'none', right: 'cheapest-first' });

  assert(left === 'health', 'left cheapest-first bot should choose the lowest next cost');
  assert(right === 'health', 'right cheapest-first bot should use deterministic tie-breaks');
});

runTest('runBotPurchasesForTick only buys on 1Hz cadence', () => {
  const purchases = [];
  const simulation = {
    getUpgradeSnapshot() {
      return {
        left: { damageLevel: 0, healthLevel: 0, spawnLevel: 0 },
        right: { damageLevel: 0, healthLevel: 1, spawnLevel: 0 },
      };
    },
    buyUpgrade(side, type) {
      purchases.push({ side, type });
    },
  };
  const constants = { TICK_RATE: 60 };
  const botStrategy = { left: 'damage-only', right: 'health-only' };

  botCore.runBotPurchasesForTick({
    simulation,
    state: { gameTime: 59 },
    constants,
    botStrategy,
  });
  assert(purchases.length === 0, 'no purchases should occur between 1Hz cadence ticks');

  botCore.runBotPurchasesForTick({
    simulation,
    state: { gameTime: 60 },
    constants,
    botStrategy,
  });

  assert(purchases.length === 2, 'both sides should buy once on cadence tick');
  assert(purchases[0].side === 'left' && purchases[0].type === 'damage', 'left strategy purchase should match strategy');
  assert(purchases[1].side === 'right' && purchases[1].type === 'health', 'right strategy purchase should match strategy');
});

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
