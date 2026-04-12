const { createSimulation } = require('../js/simulation.js');
const fs = require('fs');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runTest(name, callback) {
  try {
    callback();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name} - ${error.message}`);
    process.exitCode = 1;
  }
}

function advanceTicks(simulation, count) {
  for (let index = 0; index < count; index++) {
    simulation.tick();
  }
}

function makeReady(unit) {
  unit.ticksSinceLastAttack = unit.attackCooldown;
}

function disableAutoSpawns(simulation) {
  simulation.state.leftSpawnTimer = Number.MAX_SAFE_INTEGER;
  simulation.state.rightSpawnTimer = Number.MAX_SAFE_INTEGER;
}

runTest('spawn slots cycle deterministically around tower lane', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  for (let index = 0; index < simulation.layout.spawnSlots.length + 1; index++) {
    simulation.spawnUnits('left');
  }

  const ys = simulation.state.peons.map(peon => peon.y);
  assert(ys[0] === simulation.layout.spawnSlots[0], 'first peon should use first configured slot');
  assert(ys[1] !== ys[0], 'second peon should spawn on a different line for variety');
  assert(ys[simulation.layout.spawnSlots.length] === simulation.layout.spawnSlots[0], 'spawn slots should wrap to first slot');
});

runTest('spawn layout can be updated at runtime', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const beforeTop = simulation.layout.spawnSlots[0];
  const beforeBottom = simulation.layout.spawnSlots[simulation.layout.spawnSlots.length - 1];

  const result = simulation.setSpawnLayout({ padding: 30, slotCount: 9 });

  assert(result.slotCount === 9, 'spawn slot count should update to requested value');
  assert(simulation.layout.spawnSlots.length === 9, 'layout spawn slots should reflect updated slot count');
  assert(simulation.layout.spawnSlots[0] > beforeTop, 'top spawn slot should move inward with positive padding');
  assert(simulation.layout.spawnSlots[simulation.layout.spawnSlots.length - 1] < beforeBottom,
    'bottom spawn slot should move inward with positive padding');

  simulation.spawnUnits('left');
  const spawnedYs = simulation.state.peons.map(peon => peon.y);
  assert(spawnedYs.every(y => y >= simulation.layout.spawnSlots[0] && y <= simulation.layout.spawnSlots[simulation.layout.spawnSlots.length - 1]),
    'spawned peons should stay within updated spawn slot range');
});

runTest('spawn space 0 collapses all spawn slots to lane center', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const result = simulation.setSpawnLayout({ padding: 0, slotCount: 7 });
  const laneCenterY = (simulation.layout.laneTop + simulation.layout.laneBottom) / 2;

  assert(result.slots.length === 7, 'slot count should stay configurable when spawn space is zero');
  assert(result.slots.every(y => y === laneCenterY), 'all spawn slots should collapse to lane center when spawn space is zero');
});

runTest('structure damage scaling can be updated at runtime', () => {
  const simulation = createSimulation({
    towerDamagePerMinute: 1.2,
    baseDamagePerMinute: 0.6,
  });

  const beforeTowerPerMinute = simulation.constants.TOWER_DAMAGE_PER_MINUTE;
  const beforeBasePerMinute = simulation.constants.BASE_DAMAGE_PER_MINUTE;

  const result = simulation.setStructureDamageScaling({
    towerDamagePerMinute: 3.5,
    baseDamagePerMinute: 2.1,
  });

  assert(beforeTowerPerMinute !== result.towerDamagePerMinute, 'tower per-minute scaling should change');
  assert(beforeBasePerMinute !== result.baseDamagePerMinute, 'base per-minute scaling should change');
  assert(simulation.constants.TOWER_DAMAGE_PER_MINUTE === 3.5, 'tower per-minute scaling should update in constants');
  assert(simulation.constants.BASE_DAMAGE_PER_MINUTE === 2.1, 'base per-minute scaling should update in constants');

  advanceTicks(simulation, simulation.constants.TICK_RATE * 120);
  assert(simulation.state.leftTower.damage > simulation.constants.TOWER_DAMAGE,
    'tower live damage should scale up over time after runtime update');
  assert(simulation.state.leftBase.damage > simulation.constants.BASE_DAMAGE,
    'base live damage should scale up over time after runtime update');
});

runTest('economy values can be updated at runtime', () => {
  const simulation = createSimulation();

  const result = simulation.setEconomyValues({
    upgradeBaseCost: 35,
    killBountyGold: 14,
    baseGoldPerSecond: 3,
    shrineGoldPerSecond: 5,
    upgradeCostGrowth: 1.25,
  });

  assert(result.upgradeBaseCost === 35, 'upgrade base cost should update at runtime');
  assert(result.killBountyGold === 14, 'kill bounty gold should update at runtime');
  assert(result.baseGoldPerSecond === 3, 'base gold income should update at runtime');
  assert(result.shrineGoldPerSecond === 5, 'shrine gold income should update at runtime');
  assert(result.upgradeCostGrowth === 1.25, 'upgrade cost growth should update at runtime');
  assert(simulation.constants.UPGRADE_BASE_COST === 35, 'upgrade base cost constant should be updated');
  assert(simulation.constants.KILL_BOUNTY_GOLD === 14, 'kill bounty constant should be updated');
  assert(simulation.constants.BASE_GOLD_PER_SECOND === 3, 'base passive income constant should be updated');
  assert(simulation.constants.SHRINE_GOLD_PER_SECOND === 5, 'shrine income constant should be updated');
  assert(simulation.constants.UPGRADE_COST_GROWTH === 1.25, 'upgrade cost growth constant should be updated');
  assert(simulation.getUpgradeSnapshot().left.nextDamageCost === 35, 'next upgrade cost should reflect updated base cost');
});

runTest('per-upgrade base cost and growth can be updated independently', () => {
  const simulation = createSimulation();

  const result = simulation.setEconomyValues({
    upgradeDamageBaseCost: 22,
    upgradeDamageCostGrowth: 1.3,
    upgradeHealthBaseCost: 30,
    upgradeHealthCostGrowth: 1.15,
    upgradeSpawnBaseCost: 40,
    upgradeSpawnCostGrowth: 1.5,
  });

  assert(result.upgradeDamageBaseCost === 22, 'damage base cost should update independently');
  assert(result.upgradeDamageCostGrowth === 1.3, 'damage growth should update independently');
  assert(result.upgradeHealthBaseCost === 30, 'health base cost should update independently');
  assert(result.upgradeHealthCostGrowth === 1.15, 'health growth should update independently');
  assert(result.upgradeSpawnBaseCost === 40, 'spawn base cost should update independently');
  assert(result.upgradeSpawnCostGrowth === 1.5, 'spawn growth should update independently');

  const snapshot = simulation.getUpgradeSnapshot();
  assert(snapshot.left.nextDamageCost === 22, 'damage next cost should use damage base cost');
  assert(snapshot.left.nextHealthCost === 30, 'health next cost should use health base cost');
  assert(snapshot.left.nextSpawnCost === 40, 'spawn next cost should use spawn base cost');

  simulation.state.leftGold = 500;
  simulation.buyUpgrade('left', 'damage');
  simulation.buyUpgrade('left', 'health');
  simulation.buyUpgrade('left', 'spawn');

  const afterOneEach = simulation.getUpgradeSnapshot().left;
  assert(afterOneEach.nextDamageCost === Math.round(22 * 1.3), 'damage level 2 cost should use damage growth');
  assert(afterOneEach.nextHealthCost === Math.round(30 * 1.15), 'health level 2 cost should use health growth');
  assert(afterOneEach.nextSpawnCost === Math.round(40 * 1.5), 'spawn level 2 cost should use spawn growth');
});

runTest('damage and health upgrade cost formulas support linear and hybrid modes', () => {
  const simulation = createSimulation();

  simulation.setEconomyValues({
    upgradeDamageBaseCost: 20,
    upgradeDamageCostGrowth: 1.5,
    upgradeDamageCostFormula: 'linear',
    upgradeHealthBaseCost: 30,
    upgradeHealthCostGrowth: 1.4,
    upgradeHealthCostFormula: 'hybrid',
  });

  simulation.state.leftGold = 10000;

  const d1 = simulation.buyUpgrade('left', 'damage');
  const d2 = simulation.buyUpgrade('left', 'damage');
  const d3 = simulation.buyUpgrade('left', 'damage');

  assert(d1.cost === 20, 'linear damage level 1 should cost base value');
  assert(d2.cost === 30, 'linear damage level 2 should add a fixed growth step');
  assert(d3.cost === 40, 'linear damage level 3 should keep same delta');

  const h1 = simulation.buyUpgrade('left', 'health');
  const h2 = simulation.buyUpgrade('left', 'health');

  const healthLinearL2 = 30 * (1 + (1.4 - 1) * 1);
  const healthExpL2 = 30 * (1.4 ** 1);
  const healthHybridL2 = Math.round((healthLinearL2 + healthExpL2) / 2);

  assert(h1.cost === 30, 'hybrid health level 1 should equal base value');
  assert(h2.cost === healthHybridL2, 'hybrid health level 2 should average linear and exponential costs');
});

runTest('spawn upgrade cost formula can be updated at runtime', () => {
  const simulation = createSimulation();

  const result = simulation.setEconomyValues({
    upgradeSpawnBaseCost: 40,
    upgradeSpawnCostGrowth: 1.25,
    upgradeSpawnCostFormula: 'linear',
  });

  assert(result.upgradeSpawnCostFormula === 'linear', 'spawn cost formula should update at runtime');
  assert(simulation.getUpgradeSnapshot().left.nextSpawnCost === 40, 'first spawn upgrade should still use updated base cost');
});

runTest('structure combat values can be updated at runtime', () => {
  const simulation = createSimulation();

  const result = simulation.setStructureCombatValues({
    towerDamage: 31,
    baseDamage: 18,
    towerAttackRate: 0.8,
    baseAttackRate: 0.6,
  });

  assert(result.towerDamage === 31, 'tower base damage should update at runtime');
  assert(result.baseDamage === 18, 'base base damage should update at runtime');
  assert(result.towerAttackRate === 0.8, 'tower fire rate should update at runtime');
  assert(result.baseAttackRate === 0.6, 'base fire rate should update at runtime');
  assert(simulation.state.leftTower.attackCooldown === simulation.constants.TICK_RATE / 0.8,
    'tower cooldown should be recalculated from new fire rate');
  assert(simulation.state.leftBase.attackCooldown === simulation.constants.TICK_RATE / 0.6,
    'base cooldown should be recalculated from new fire rate');
});

runTest('structure HP values can be updated at runtime', () => {
  const simulation = createSimulation({ towerHp: 700, baseHp: 2000 });

  simulation.state.leftTower.takeDamage(350);
  simulation.state.leftBase.takeDamage(1000);

  const result = simulation.setStructureVitalityValues({ towerHp: 900, baseHp: 2500 });

  assert(result.towerHp === 900, 'tower hp should update at runtime');
  assert(result.baseHp === 2500, 'base hp should update at runtime');
  assert(simulation.constants.TOWER_HP === 900, 'tower hp constant should update');
  assert(simulation.constants.BASE_HP === 2500, 'base hp constant should update');
  assert(simulation.state.leftTower.maxHealth === 900, 'tower max hp should update on active state');
  assert(simulation.state.leftBase.maxHealth === 2500, 'base max hp should update on active state');
  assert(simulation.state.leftTower.health === 450, 'tower current hp should preserve damage ratio');
  assert(simulation.state.leftBase.health === 1250, 'base current hp should preserve damage ratio');
});

runTest('structure HP updates allow zero towers and clamp base hp minimum', () => {
  const simulation = createSimulation({ towerHp: 700, baseHp: 2000 });

  const result = simulation.setStructureVitalityValues({ towerHp: 0, baseHp: 0 });

  assert(result.towerHp === 0, 'tower hp should allow disabling towers at runtime');
  assert(result.baseHp === 1, 'base hp should clamp to minimum 1 at runtime');
  assert(simulation.state.leftTower.health === 0, 'tower health should drop to zero when tower hp is disabled');
  assert(simulation.state.rightTower.health === 0, 'right tower health should drop to zero when tower hp is disabled');
  assert(simulation.state.leftBase.health === 1, 'base health should clamp to minimum 1');
  assert(simulation.state.rightBase.health === 1, 'right base health should clamp to minimum 1');
});

runTest('structure HP updates can target towers or bases independently', () => {
  const simulation = createSimulation({ towerHp: 700, baseHp: 2000 });

  simulation.setStructureVitalityValues({ towerHp: 850 });
  assert(simulation.constants.TOWER_HP === 850, 'tower hp should update when only tower hp is provided');
  assert(simulation.constants.BASE_HP === 2000, 'base hp should stay unchanged when not provided');

  simulation.setStructureVitalityValues({ baseHp: 2300 });
  assert(simulation.constants.TOWER_HP === 850, 'tower hp should stay unchanged when only base hp is provided');
  assert(simulation.constants.BASE_HP === 2300, 'base hp should update when only base hp is provided');
});

runTest('disabled towers start with zero health even when tower hp is configured', () => {
  const simulation = createSimulation({ enableTowers: false, towerHp: 900 });

  assert(simulation.state.leftTower.health === 0, 'left tower should start disabled when towers are off');
  assert(simulation.state.rightTower.health === 0, 'right tower should start disabled when towers are off');
  assert(simulation.state.leftTower.maxHealth === 900, 'tower max hp should still reflect configured tower hp');
});

runTest('protection windows can be updated at runtime', () => {
  const simulation = createSimulation();

  const result = simulation.setProtectionWindows({
    structureDamageGraceSeconds: 33,
    baseDamageGraceSeconds: 77,
  });

  assert(result.structureDamageGraceSeconds === 33, 'tower grace seconds should update at runtime');
  assert(result.baseDamageGraceSeconds === 77, 'base grace seconds should update at runtime');
  assert(simulation.constants.STRUCTURE_DAMAGE_GRACE_TICKS === simulation.constants.TICK_RATE * 33,
    'tower grace ticks should match updated seconds');
  assert(simulation.constants.BASE_DAMAGE_GRACE_TICKS === simulation.constants.TICK_RATE * 77,
    'base grace ticks should match updated seconds');
});

runTest('peons spawn with symmetric HP on both sides', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', 200, 200);
  const rightPeon = simulation.addPeon('right', 600, 200);

  assert(leftPeon.health === 100, 'left peon should start at 100 HP');
  assert(rightPeon.health === 100, 'right peon should start at 100 HP');
});

runTest('upgrade tuning uses smaller cheaper increments', () => {
  const simulation = createSimulation();

  assert(simulation.constants.UPGRADE_DAMAGE_PER_LEVEL === 1, 'damage upgrade should add 1 damage per level');
  assert(simulation.constants.UPGRADE_HEALTH_PER_LEVEL === 5, 'health upgrade should add 5 hp per level');
  assert(simulation.constants.UPGRADE_BASE_COST === 20, 'base upgrade cost should be reduced to 20 gold');
  assert(simulation.getUpgradeSnapshot().left.nextDamageCost === 20, 'first damage upgrade should cost 20 gold');
  assert(simulation.getUpgradeSnapshot().left.nextHealthCost === 20, 'first health upgrade should cost 20 gold');
});

runTest('peons prioritize enemy peons over towers', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', simulation.state.rightTower.x - 12, simulation.state.rightTower.y);
  const rightPeon = simulation.addPeon('right', leftPeon.x + 10, leftPeon.y);
  makeReady(leftPeon);
  makeReady(rightPeon);

  const towerHealthBefore = simulation.state.rightTower.health;
  simulation.tick();

  assert(simulation.state.rightTower.health === towerHealthBefore, 'tower should not take damage while enemy peon is near');
  assert(leftPeon.target === rightPeon, 'left peon should target enemy peon first');
});

runTest('fresh peons can attack immediately on contact', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', 390, 200);
  const rightPeon = simulation.addPeon('right', 400, 200);
  const leftHealthBefore = leftPeon.health;
  const rightHealthBefore = rightPeon.health;

  simulation.tick();

  assert(leftPeon.health < leftHealthBefore, 'left peon should take melee damage on first contact tick');
  assert(rightPeon.health < rightHealthBefore, 'right peon should take melee damage on first contact tick');
});

runTest('symmetric mirrored skirmish stays even before structures matter', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftX = simulation.layout.laneLeft + 20;
  const rightX = simulation.layout.laneRight - 20;
  const slots = simulation.layout.spawnSlots;

  simulation.addPeon('left', leftX, slots[2]);
  simulation.addPeon('right', rightX, slots[2]);
  simulation.addPeon('left', leftX, slots[3]);
  simulation.addPeon('right', rightX, slots[3]);
  simulation.addPeon('left', leftX, slots[4]);
  simulation.addPeon('right', rightX, slots[4]);

  advanceTicks(simulation, 700);

  const leftCount = simulation.state.peons.filter(peon => peon.side === 'left').length;
  const rightCount = simulation.state.peons.filter(peon => peon.side === 'right').length;
  assert(simulation.state.leftHpLost === simulation.state.rightHpLost, 'mirrored skirmish should keep hp loss symmetric');
  assert(leftCount === rightCount, 'mirrored skirmish should keep surviving peon counts symmetric');
});

runTest('peons clear dead targets and continue moving', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', 300, 300);
  const rightPeon = simulation.addPeon('right', 310, 300, { health: 1, maxHealth: 1 });
  makeReady(leftPeon);

  simulation.tick();
  const xAfterKill = leftPeon.x;

  // No enemies in sight; peon should not remain stuck on dead target.
  simulation.tick();
  assert(leftPeon.x > xAfterKill, 'left peon should continue moving after target dies');
});

runTest('peons retarget from structure to enemy peon', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', simulation.state.rightTower.x - 12, simulation.state.rightTower.y);
  makeReady(leftPeon);
  const expectedTowerAfterFirstHit = simulation.state.rightTower.maxHealth - leftPeon.damage;
  simulation.tick();
  assert(simulation.state.rightTower.health === expectedTowerAfterFirstHit, 'tower should take structure hit when lane is empty');

  const rightPeon = simulation.addPeon('right', leftPeon.x + 10, leftPeon.y);
  makeReady(leftPeon);
  simulation.tick();

  assert(leftPeon.target === rightPeon, 'left peon should switch to enemy peon target');
  assert(simulation.state.rightTower.health === expectedTowerAfterFirstHit, 'tower damage should stop once enemy peon appears');
});

runTest('crossed-midline peon drops structure target for visible enemy before melee range', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', simulation.layout.laneCenter + 30, simulation.state.rightTower.y);
  leftPeon.target = simulation.state.rightTower;

  // Visible, but not yet in melee range.
  const rightPeon = simulation.addPeon('right', leftPeon.x + 40, leftPeon.y);

  simulation.tick();

  assert(leftPeon.target === rightPeon, 'crossed-midline peon should retarget from structure to a visible enemy peon before melee range');
});

runTest('after crossing midline peons still prioritize visible enemy peons', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', simulation.layout.laneCenter + 5, simulation.state.rightTower.y);
  const rightPeon = simulation.addPeon('right', leftPeon.x + 8, leftPeon.y);
  makeReady(leftPeon);
  makeReady(rightPeon);

  simulation.tick();

  assert(leftPeon.target === rightPeon, 'left peon should prioritize visible enemy peons after crossing midline');
  assert(rightPeon.health < 100, 'hunted enemy peon should take damage');
});

runTest('after crossing midline peons target structure when no visible enemies remain', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', simulation.state.rightTower.x - 12, simulation.state.rightTower.y);
  // Enemy exists but is outside vision, so structure remains the desired target.
  simulation.addPeon('right', simulation.layout.laneCenter - 50, simulation.state.rightTower.y);
  makeReady(leftPeon);

  const towerBefore = simulation.state.rightTower.health;
  simulation.tick();

  assert(leftPeon.target === simulation.state.rightTower, 'left peon should target right tower when no visible enemies exist');
  assert(simulation.state.rightTower.health < towerBefore, 'tower should take damage when no visible enemies exist');
});

runTest('after crossing midline peons ignore visible trailing enemies in favor of forward push', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', simulation.layout.laneCenter + 20, simulation.state.rightTower.y);
  const rightPeon = simulation.addPeon('right', simulation.layout.laneCenter - 40, simulation.state.rightTower.y);

  simulation.tick();

  assert(leftPeon.target === simulation.state.rightTower, 'crossed-midline peon should ignore a visible trailing enemy and keep pushing the structure');
});

runTest('after crossing midline peons do not turn back for enemies behind them', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', simulation.layout.laneCenter + 40, simulation.state.rightTower.y);
  const rightPeon = simulation.addPeon('right', leftPeon.x - 40, leftPeon.y);

  simulation.tick();

  assert(leftPeon.target === simulation.state.rightTower, 'crossed-midline peon should keep pushing forward instead of turning back for a trailing enemy');
});

runTest('crossed-midline peon still attacks nearby enemy peon', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', simulation.layout.laneCenter + 20, simulation.state.rightTower.y);
  const rightPeon = simulation.addPeon('right', leftPeon.x + 8, leftPeon.y);
  makeReady(leftPeon);
  makeReady(rightPeon);

  const rightTowerBefore = simulation.state.rightTower.health;
  const rightPeonBefore = rightPeon.health;
  simulation.tick();

  assert(leftPeon.target === rightPeon, 'left peon should switch to nearby enemy peon');
  assert(rightPeon.health < rightPeonBefore, 'nearby enemy peon should take damage');
  assert(simulation.state.rightTower.health === rightTowerBefore, 'tower should not take damage when nearby peon threat exists');
});

runTest('peon target remains stable with multiple visible enemies', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', 350, 250);
  const rightA = simulation.addPeon('right', 360, 250);
  const rightB = simulation.addPeon('right', 362, 252);
  makeReady(leftPeon);

  simulation.tick();
  const firstTarget = leftPeon.target;
  assert(firstTarget === rightA || firstTarget === rightB, 'left peon should acquire one visible enemy target');

  simulation.tick();
  assert(leftPeon.target === firstTarget, 'left peon should keep the same valid target instead of jitter-switching');
});

runTest('melee attackers avoid lethal overkill when another target is available', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftA = simulation.addPeon('left', 390, 200);
  const leftB = simulation.addPeon('left', 392, 200);
  const rightWeak = simulation.addPeon('right', 400, 200, { health: 9, maxHealth: 9 });
  const rightStrong = simulation.addPeon('right', 404, 200, { health: 100, maxHealth: 100 });
  makeReady(leftA);
  makeReady(leftB);

  simulation.tick();

  assert(!rightWeak.isAlive(), 'weak target should be killed');
  assert(rightStrong.health === 91, 'second hit should be redirected to another in-range target');
});

runTest('slash effects are created and expire', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', 390, 200);
  const rightPeon = simulation.addPeon('right', 400, 200);
  makeReady(leftPeon);
  makeReady(rightPeon);

  simulation.tick();
  assert(simulation.state.slashEffects.length >= 2, 'expected slash effects on both melee hits');

  advanceTicks(simulation, 12);
  assert(simulation.state.slashEffects.length === 0, 'slash effects should expire after ttl');
});

runTest('hp lost telemetry counts actual damage after clamp', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', 390, 200);
  simulation.addPeon('right', 400, 200, { health: 5, maxHealth: 5 });
  makeReady(leftPeon);

  simulation.tick();

  assert(simulation.state.rightHpLost === 5, 'hp lost should reflect actual health removed, not raw outgoing damage');
});

runTest('peon kill awards deterministic bounty gold to killer side', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', 390, 200);
  simulation.addPeon('right', 400, 200, { health: 1, maxHealth: 1 });
  makeReady(leftPeon);

  simulation.tick();

  assert(simulation.state.leftGold === simulation.constants.KILL_BOUNTY_GOLD, 'left side should get bounty after killing a right peon');
  assert(simulation.state.rightGold === 0, 'right side should not gain gold from dying unit');
});

runTest('zero kill bounty does not change gold when a peon dies', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);
  simulation.setEconomyValues({ killBountyGold: 0 });

  const leftPeon = simulation.addPeon('left', 390, 200);
  simulation.addPeon('right', 400, 200, { health: 1, maxHealth: 1 });
  makeReady(leftPeon);

  simulation.tick();

  assert(simulation.state.leftGold === 0, 'left side should gain no gold when kill bounty is zero');
  assert(simulation.state.leftTotalGold === 0, 'total gold should also stay unchanged when awarded amount is zero');
});

runTest('gold shrine grants passive income only when one side controls midline push', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  simulation.addPeon('left', simulation.layout.laneCenter + 30, simulation.layout.spawnSlots[3]);

  advanceTicks(simulation, simulation.constants.TICK_RATE);

  assert(simulation.state.shrineControl === 'left', 'left side should control shrine when only left has units past midline');
  assert(simulation.state.leftGold === simulation.constants.SHRINE_GOLD_PER_SECOND, 'left should gain one second of shrine gold');
  assert(simulation.state.rightGold === 0, 'right should gain no shrine gold while left controls');

  simulation.addPeon('right', simulation.layout.laneCenter - 30, simulation.layout.spawnSlots[3]);
  advanceTicks(simulation, simulation.constants.TICK_RATE * 2);

  assert(simulation.state.shrineControl === 'neutral', 'shrine should become neutral when both sides have map control');
  assert(simulation.state.leftGold === simulation.constants.SHRINE_GOLD_PER_SECOND, 'left shrine income should stop when control is contested');
  assert(simulation.state.rightGold === 0, 'right should not gain shrine income during neutral control');
});

runTest('base passive income grants equal gold to both sides each second', () => {
  const simulation = createSimulation({ baseGoldPerSecond: 3, shrineGoldPerSecond: 0 });
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  advanceTicks(simulation, simulation.constants.TICK_RATE * 3);

  assert(simulation.state.leftGold === 9, 'left should gain passive base income every second');
  assert(simulation.state.rightGold === 9, 'right should gain passive base income every second');
  assert(simulation.state.leftTotalGold === 9, 'left total gold should track passive base income');
  assert(simulation.state.rightTotalGold === 9, 'right total gold should track passive base income');
});

runTest('base passive income does nothing when configured to zero', () => {
  const simulation = createSimulation({ baseGoldPerSecond: 0, shrineGoldPerSecond: 0 });
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  advanceTicks(simulation, simulation.constants.TICK_RATE * 3);

  assert(simulation.state.leftGold === 0, 'left should gain no passive income when base gold is zero');
  assert(simulation.state.rightGold === 0, 'right should gain no passive income when base gold is zero');
});

runTest('buyUpgrade rejects purchase when side lacks enough gold', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const result = simulation.buyUpgrade('left', 'damage');

  assert(result.ok === false, 'purchase should fail when gold is insufficient');
  assert(result.reason === 'insufficient-gold', 'failure reason should be insufficient gold');
  assert(simulation.state.leftUpgrades.damageLevel === 0, 'damage level should remain unchanged after failed purchase');
});

runTest('buyUpgrade allows zero-cost upgrades without spending gold', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);
  simulation.setEconomyValues({ upgradeDamageBaseCost: 0 });

  const result = simulation.buyUpgrade('left', 'damage');

  assert(result.ok === true, 'zero-cost upgrade should succeed');
  assert(result.cost === 0, 'zero-cost upgrade should spend zero gold');
  assert(simulation.state.leftGold === 0, 'gold should remain unchanged for zero-cost upgrade');
  assert(simulation.state.leftUpgrades.damageLevel === 1, 'upgrade level should still increase for zero-cost upgrade');
});

runTest('buyUpgrade rejects invalid side', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const result = simulation.buyUpgrade('center', 'damage');

  assert(result.ok === false, 'purchase should fail for invalid side');
  assert(result.reason === 'invalid-side', 'failure reason should flag invalid side');
});

runTest('buyUpgrade rejects unknown upgrade type', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const result = simulation.buyUpgrade('left', 'range');

  assert(result.ok === false, 'purchase should fail for unknown upgrade type');
  assert(result.reason === 'invalid-upgrade-type', 'failure reason should flag invalid upgrade type');
});

runTest('upgrade costs grow by configurable multiplier and spend gold deterministically', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const firstExpected = Math.round(
    simulation.constants.UPGRADE_BASE_COST
      * simulation.constants.UPGRADE_DAMAGE_COST_MULTIPLIER
      * (simulation.constants.UPGRADE_COST_GROWTH ** 0)
  );
  const secondExpected = Math.round(
    simulation.constants.UPGRADE_BASE_COST
      * simulation.constants.UPGRADE_DAMAGE_COST_MULTIPLIER
      * (simulation.constants.UPGRADE_COST_GROWTH ** 1)
  );

  simulation.state.leftGold = firstExpected + secondExpected + 50;
  const first = simulation.buyUpgrade('left', 'damage');
  const second = simulation.buyUpgrade('left', 'damage');

  assert(first.ok === true, 'first upgrade purchase should succeed');
  assert(second.ok === true, 'second upgrade purchase should succeed');
  assert(first.cost === firstExpected, 'first damage upgrade cost should include configured damage multiplier');
  assert(second.cost === secondExpected, 'second upgrade cost should follow configured growth multiplier');
  assert(simulation.state.leftGold === 50, 'gold should be reduced by cumulative costs');
  assert(simulation.state.leftUpgrades.damageLevel === 2, 'damage upgrade level should increment per purchase');
});

runTest('health and damage upgrades affect newly spawned peons', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  simulation.state.leftGold = 300;
  simulation.buyUpgrade('left', 'health');
  simulation.buyUpgrade('left', 'damage');

  const upgradedPeon = simulation.addPeon('left', 200, 200);

  const expectedHealth = simulation.constants.PEON_HP + simulation.constants.UPGRADE_HEALTH_PER_LEVEL;
  const expectedDamage = simulation.constants.PEON_DAMAGE + simulation.constants.UPGRADE_DAMAGE_PER_LEVEL;

  assert(upgradedPeon.maxHealth === expectedHealth, 'left peon max health should include one health upgrade');
  assert(upgradedPeon.health === expectedHealth, 'left peon current health should start at upgraded max health');
  assert(upgradedPeon.damage === expectedDamage, 'left peon damage should include one damage upgrade');
});

runTest('single early health vs damage upgrade causes no structure damage in first 2 minutes', () => {
  const simulation = createSimulation({
    structureDamageGraceSeconds: 120,
    baseDamageGraceSeconds: 300,
  });
  simulation.initEntities();

  // Fund only one early upgrade for each side to model opening choices.
  simulation.state.leftGold = 200;
  simulation.state.rightGold = 200;
  const leftBuy = simulation.buyUpgrade('left', 'health');
  const rightBuy = simulation.buyUpgrade('right', 'damage');

  assert(leftBuy.ok === true, 'left should be able to buy one opening health upgrade');
  assert(rightBuy.ok === true, 'right should be able to buy one opening damage upgrade');

  const initialLeftTowerHp = simulation.state.leftTower.health;
  const initialRightTowerHp = simulation.state.rightTower.health;
  const initialLeftBaseHp = simulation.state.leftBase.health;
  const initialRightBaseHp = simulation.state.rightBase.health;

  // Run for 2 minutes of simulated time.
  advanceTicks(simulation, simulation.constants.TICK_RATE * 120);

  assert(simulation.state.leftTower.health === initialLeftTowerHp, 'left tower should take no damage in first 2 minutes for hp-vs-dmg opening');
  assert(simulation.state.rightTower.health === initialRightTowerHp, 'right tower should take no damage in first 2 minutes for hp-vs-dmg opening');
  assert(simulation.state.leftBase.health === initialLeftBaseHp, 'left base should take no damage in first 2 minutes for hp-vs-dmg opening');
  assert(simulation.state.rightBase.health === initialRightBaseHp, 'right base should take no damage in first 2 minutes for hp-vs-dmg opening');
});

runTest('single early health vs damage upgrade reaches towers by 5 minutes but not bases', () => {
  const simulation = createSimulation({
    structureDamageGraceSeconds: 120,
    baseDamageGraceSeconds: 300,
  });
  simulation.initEntities();

  simulation.state.leftGold = 200;
  simulation.state.rightGold = 200;
  const leftBuy = simulation.buyUpgrade('left', 'health');
  const rightBuy = simulation.buyUpgrade('right', 'damage');

  assert(leftBuy.ok === true, 'left should be able to buy one opening health upgrade');
  assert(rightBuy.ok === true, 'right should be able to buy one opening damage upgrade');

  const initialLeftTowerHp = simulation.state.leftTower.health;
  const initialRightTowerHp = simulation.state.rightTower.health;
  const initialLeftBaseHp = simulation.state.leftBase.health;
  const initialRightBaseHp = simulation.state.rightBase.health;

  // Run for 5 minutes of simulated time.
  advanceTicks(simulation, simulation.constants.TICK_RATE * 300);

  const someTowerDamaged = simulation.state.leftTower.health < initialLeftTowerHp
    || simulation.state.rightTower.health < initialRightTowerHp;
  assert(someTowerDamaged, 'at least one tower should have taken damage by 5 minutes in hp-vs-dmg opening');
  assert(simulation.state.leftBase.health === initialLeftBaseHp, 'left base should still be untouched at 5 minutes in hp-vs-dmg opening');
  assert(simulation.state.rightBase.health === initialRightBaseHp, 'right base should still be untouched at 5 minutes in hp-vs-dmg opening');
});

runTest('hp-vs-dmg scenario stays bounded with 30s checkpoints and no base damage by 5 minutes', () => {
  const simulation = createSimulation({
    structureDamageGraceSeconds: 120,
    baseDamageGraceSeconds: 300,
  });
  simulation.initEntities();
  simulation.setDecisionLogEnabled(true);

  simulation.state.leftGold = 200;
  simulation.state.rightGold = 200;
  const leftBuy = simulation.buyUpgrade('left', 'health');
  const rightBuy = simulation.buyUpgrade('right', 'damage');

  assert(leftBuy.ok === true, 'left opening health upgrade purchase should succeed');
  assert(rightBuy.ok === true, 'right opening damage upgrade purchase should succeed');

  const checkpoints = [];
  const checkpointStep = simulation.constants.TICK_RATE * 30;
  const totalTicks = simulation.constants.TICK_RATE * 300;

  for (let tick = checkpointStep; tick <= totalTicks; tick += checkpointStep) {
    advanceTicks(simulation, checkpointStep);
    checkpoints.push({
      second: tick / simulation.constants.TICK_RATE,
      leftTower: simulation.state.leftTower.health,
      rightTower: simulation.state.rightTower.health,
      leftBase: simulation.state.leftBase.health,
      rightBase: simulation.state.rightBase.health,
      leftHpLost: simulation.state.leftHpLost,
      rightHpLost: simulation.state.rightHpLost,
    });
  }

  const at120 = checkpoints.find(row => row.second === 120);
  assert(Boolean(at120), 'expected a 120-second checkpoint in hp-vs-dmg scenario');
  assert(at120.leftTower === simulation.state.leftTower.maxHealth,
    `left tower should be untouched at 120s (actual: ${at120.leftTower})`);
  assert(at120.rightTower === simulation.state.rightTower.maxHealth,
    `right tower should be untouched at 120s (actual: ${at120.rightTower})`);

  const at300 = checkpoints.find(row => row.second === 300);
  assert(Boolean(at300), 'expected a 300-second checkpoint in hp-vs-dmg scenario');
  const someTowerDamaged = at300.leftTower < simulation.state.leftTower.maxHealth
    || at300.rightTower < simulation.state.rightTower.maxHealth;
  assert(someTowerDamaged,
    `expected at least one damaged tower at 300s (L:${at300.leftTower}, R:${at300.rightTower})`);
  assert(at300.leftBase === simulation.state.leftBase.maxHealth,
    `left base should be untouched at 300s (actual: ${at300.leftBase})`);
  assert(at300.rightBase === simulation.state.rightBase.maxHealth,
    `right base should be untouched at 300s (actual: ${at300.rightBase})`);

  const damageSideLead = at300.leftHpLost - at300.rightHpLost;
  assert(damageSideLead >= 0,
    `damage-upgraded side should not underperform by 300s (leftHpLost=${at300.leftHpLost}, rightHpLost=${at300.rightHpLost})`);
});

runTest('spawn upgrade increases spawned wave size for that side only', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  simulation.state.leftGold = 100;
  simulation.buyUpgrade('left', 'spawn');

  simulation.spawnUnits('left');
  simulation.spawnUnits('right');

  const leftCount = simulation.state.peons.filter(peon => peon.side === 'left').length;
  const rightCount = simulation.state.peons.filter(peon => peon.side === 'right').length;
  assert(leftCount === simulation.constants.SPAWN_COUNT + 1, 'left side wave size should increase by one after spawn upgrade');
  assert(rightCount === simulation.constants.SPAWN_COUNT, 'right side wave size should remain base count without upgrade');
});

runTest('tick summary reflects end-of-tick hp loss after attacks are applied', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);
  simulation.setDecisionLogEnabled(true);

  const leftPeon = simulation.addPeon('left', 390, 200);
  const rightPeon = simulation.addPeon('right', 400, 200);
  makeReady(leftPeon);
  makeReady(rightPeon);

  simulation.tick();

  const lastSummary = simulation.getDecisionLog().filter(entry => entry.event === 'tick-summary').at(-1);
  assert(lastSummary.leftHpLost === simulation.state.leftHpLost, 'tick summary should match end-of-tick left hp lost');
  assert(lastSummary.rightHpLost === simulation.state.rightHpLost, 'tick summary should match end-of-tick right hp lost');
  assert(lastSummary.leftGold === simulation.state.leftGold, 'tick summary should include current left gold');
  assert(lastSummary.rightGold === simulation.state.rightGold, 'tick summary should include current right gold');
  assert(lastSummary.shrineControl === simulation.state.shrineControl, 'tick summary should include shrine control owner');
  assert(lastSummary.leftDamageLevel === simulation.state.leftUpgrades.damageLevel, 'tick summary should include left damage level');
  assert(lastSummary.leftHealthLevel === simulation.state.leftUpgrades.healthLevel, 'tick summary should include left health level');
  assert(lastSummary.leftSpawnLevel === simulation.state.leftUpgrades.spawnLevel, 'tick summary should include left spawn level');
  assert(lastSummary.rightDamageLevel === simulation.state.rightUpgrades.damageLevel, 'tick summary should include right damage level');
  assert(lastSummary.rightHealthLevel === simulation.state.rightUpgrades.healthLevel, 'tick summary should include right health level');
  assert(lastSummary.rightSpawnLevel === simulation.state.rightUpgrades.spawnLevel, 'tick summary should include right spawn level');
});

runTest('decision log respects max entry cap', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  simulation.state.decisionLogMaxEntries = 5;
  simulation.setDecisionLogEnabled(true);
  advanceTicks(simulation, 10);

  assert(simulation.getDecisionLog().length === 5, 'decision log should retain only the most recent entries up to cap');
});

runTest('decision log can be cleared and limited', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  simulation.setDecisionLogEnabled(true);
  advanceTicks(simulation, 8);
  const lastThree = simulation.getDecisionLog(3);
  assert(lastThree.length === 3, 'expected limited decision log slice');

  simulation.clearDecisionLog();
  assert(simulation.getDecisionLog().length === 0, 'decision log should be empty after clear');
});

runTest('right peon targets left structure when lane is clear', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const rightPeon = simulation.addPeon('right', simulation.state.leftTower.x + 12, simulation.state.leftTower.y);
  makeReady(rightPeon);
  const leftTowerBefore = simulation.state.leftTower.health;

  simulation.tick();

  assert(rightPeon.target === simulation.state.leftTower, 'right peon should target left tower in clear lane');
  assert(simulation.state.leftTower.health < leftTowerBefore, 'left tower should take damage from right peon');
});

runTest('tower and base record shot flashes and clear after ttl', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const rightNearLeftTower = simulation.addPeon('right', simulation.state.leftTower.x + 20, simulation.state.leftTower.y);
  const rightNearLeftBase = simulation.addPeon('right', simulation.state.leftBase.x + 30, simulation.state.leftBase.y);
  makeReady(rightNearLeftTower);
  makeReady(rightNearLeftBase);
  simulation.state.leftTower.ticksSinceLastAttack = simulation.state.leftTower.attackCooldown;
  simulation.state.leftBase.ticksSinceLastAttack = simulation.state.leftBase.attackCooldown;

  simulation.tick();

  assert(simulation.state.leftTower.lastShotTarget, 'left tower should record a recent shot');
  assert(simulation.state.leftBase.lastShotTarget, 'left base should record a recent shot');
  assert(simulation.state.leftTower.shotFlashTicks > 0, 'left tower flash ttl should be active');
  assert(simulation.state.leftBase.shotFlashTicks > 0, 'left base flash ttl should be active');

  simulation.clearPeons();
  advanceTicks(simulation, 5);

  assert(simulation.state.leftTower.lastShotTarget === null, 'tower shot target should clear when flash expires');
  assert(simulation.state.leftBase.lastShotTarget === null, 'base shot target should clear when flash expires');
});

runTest('tower and base damage scale up over time and improve defensive hit strength', () => {
  const simulation = createSimulation({
    towerDamagePerMinute: 2,
    baseDamagePerMinute: 1,
  });
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const earlyTowerDamage = simulation.state.leftTower.damage;
  const earlyBaseDamage = simulation.state.leftBase.damage;

  advanceTicks(simulation, simulation.constants.TICK_RATE * 180);

  const lateTowerDamage = simulation.state.leftTower.damage;
  const lateBaseDamage = simulation.state.leftBase.damage;
  assert(lateTowerDamage > earlyTowerDamage, 'tower damage should increase with elapsed game time');
  assert(lateBaseDamage > earlyBaseDamage, 'base damage should increase with elapsed game time');

  // Compare practical impact: same target should lose more hp from a late-game shot.
  const earlySim = createSimulation({
    towerDamagePerMinute: 2,
    baseDamagePerMinute: 1,
  });
  earlySim.clearPeons();
  disableAutoSpawns(earlySim);
  const earlyTarget = earlySim.addPeon('right', earlySim.state.leftTower.x + 20, earlySim.state.leftTower.y, { health: 200, maxHealth: 200 });
  earlySim.state.leftTower.ticksSinceLastAttack = earlySim.state.leftTower.attackCooldown;
  const earlyHpBefore = earlyTarget.health;
  earlySim.tick();
  const earlyHit = earlyHpBefore - earlyTarget.health;

  const lateSim = createSimulation({
    towerDamagePerMinute: 2,
    baseDamagePerMinute: 1,
  });
  lateSim.clearPeons();
  disableAutoSpawns(lateSim);
  advanceTicks(lateSim, lateSim.constants.TICK_RATE * 300);
  const lateTarget = lateSim.addPeon('right', lateSim.state.leftTower.x + 20, lateSim.state.leftTower.y, { health: 200, maxHealth: 200 });
  lateSim.state.leftTower.ticksSinceLastAttack = lateSim.state.leftTower.attackCooldown;
  const lateHpBefore = lateTarget.health;
  lateSim.tick();
  const lateHit = lateHpBefore - lateTarget.health;

  assert(lateHit > earlyHit, `late-game tower hit should be stronger than early hit (early=${earlyHit}, late=${lateHit})`);
});

runTest('tick removes invalid or out-of-lane peons', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const alivePeon = simulation.addPeon('left', 200, 200);
  simulation.addPeon('left', Number.NaN, 200);
  simulation.addPeon('left', 200, Number.POSITIVE_INFINITY);
  simulation.addPeon('left', simulation.layout.laneRight + 200, 200);
  simulation.addPeon('left', 200, simulation.layout.laneBottom + 100);
  simulation.addPeon('right', 300, 200, { health: 0, maxHealth: 100 });

  simulation.tick();

  assert(simulation.state.peons.length === 1, 'only one valid peon should remain after filtering');
  assert(simulation.state.peons[0] === alivePeon, 'remaining peon should be the valid one');
});

runTest('initial tick auto-spawns both sides when timers expire', () => {
  const simulation = createSimulation();
  simulation.clearPeons();

  simulation.state.leftSpawnTimer = 0;
  simulation.state.rightSpawnTimer = 0;
  simulation.tick();

  const leftCount = simulation.state.peons.filter(peon => peon.side === 'left').length;
  const rightCount = simulation.state.peons.filter(peon => peon.side === 'right').length;
  assert(leftCount === simulation.constants.SPAWN_COUNT, 'left side should auto-spawn when timer expires');
  assert(rightCount === simulation.constants.SPAWN_COUNT, 'right side should auto-spawn when timer expires');
  assert(simulation.state.leftSpawnTimer === simulation.constants.SPAWN_INTERVAL_TICKS, 'left spawn timer should reset');
  assert(simulation.state.rightSpawnTimer === simulation.constants.SPAWN_INTERVAL_TICKS, 'right spawn timer should reset');
});

runTest('clear-target decision log event is emitted when target becomes invalid and no fallback exists', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', 300, 100);
  const deadRight = simulation.addPeon('right', 310, 100, { health: 0, maxHealth: 100 });
  leftPeon.target = deadRight;
  simulation.setDecisionLogEnabled(true);

  simulation.tick();

  const events = simulation.getDecisionLog();
  const clearEvent = events.find(entry => entry.event === 'clear-target' && entry.peonId === leftPeon.id);
  assert(Boolean(clearEvent), 'expected clear-target event when stale target is dropped');
});

runTest('right tower and right base can fire when left peons are in range', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  simulation.addPeon('left', simulation.state.rightTower.x - 20, simulation.state.rightTower.y);
  simulation.addPeon('left', simulation.state.rightBase.x - 30, simulation.state.rightBase.y);
  simulation.state.rightTower.ticksSinceLastAttack = simulation.state.rightTower.attackCooldown;
  simulation.state.rightBase.ticksSinceLastAttack = simulation.state.rightBase.attackCooldown;

  simulation.tick();

  assert(Boolean(simulation.state.rightTower.lastShotTarget), 'right tower should record shot target');
  assert(Boolean(simulation.state.rightBase.lastShotTarget), 'right base should record shot target');
});

runTest('simulation attaches createSimulation to window when evaluated in browser-like context', () => {
  const simulationSource = fs.readFileSync(require.resolve('../js/simulation.js'), 'utf8');
  const context = {
    window: {},
    console,
  };

  vm.createContext(context);
  vm.runInContext(simulationSource, context);

  assert(typeof context.window.createSimulation === 'function', 'window.createSimulation should be defined in browser-like context');
});

runTest('simulation attaches createSimulation to global window when required in Node with window defined', () => {
  const simulationPath = require.resolve('../js/simulation.js');
  const previousWindow = global.window;

  global.window = {};
  delete require.cache[simulationPath];
  require('../js/simulation.js');

  assert(typeof global.window.createSimulation === 'function', 'window export branch should attach createSimulation');

  if (typeof previousWindow === 'undefined') {
    delete global.window;
  } else {
    global.window = previousWindow;
  }
  delete require.cache[simulationPath];
  require('../js/simulation.js');
});

runTest('chooseMeleeAttackTarget returns null when no enemies are in melee range', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const left = simulation.addPeon('left', 100, 100);
  const farEnemy = simulation.addPeon('right', 300, 100);
  const chosen = simulation.testHooks.chooseMeleeAttackTarget(left, farEnemy, [farEnemy], new Map());

  assert(chosen === null, 'expected null when no enemy is in attack range');
});

runTest('chooseMeleeAttackTarget keeps preferred target when still valid and in range', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const left = simulation.addPeon('left', 100, 100);
  const preferred = simulation.addPeon('right', 105, 100, { health: 40, maxHealth: 100 });
  const other = simulation.addPeon('right', 106, 100, { health: 5, maxHealth: 100 });

  const chosen = simulation.testHooks.chooseMeleeAttackTarget(left, preferred, [preferred, other], new Map());
  assert(chosen === preferred, 'preferred in-range target should be kept while it still has remaining health');
});

runTest('chooseMeleeAttackTarget keeps preferred when alternatives are already fully planned', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const left = simulation.addPeon('left', 100, 100);
  const preferred = simulation.addPeon('right', 105, 100, { health: 6, maxHealth: 100 });
  const other = simulation.addPeon('right', 106, 100, { health: 6, maxHealth: 100 });
  const plannedDamage = new Map([[other, 6]]);

  const chosen = simulation.testHooks.chooseMeleeAttackTarget(left, preferred, [preferred, other], plannedDamage);
  assert(chosen === preferred, 'preferred target should be kept when other in-range target is no longer viable');
});

runTest('chooseMeleeAttackTarget kill-candidate sort prefers lower remaining hp', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const left = simulation.addPeon('left', 100, 100);
  const lowHp = simulation.addPeon('right', 105, 100, { health: 6, maxHealth: 100 });
  const highHp = simulation.addPeon('right', 107, 100, { health: 9, maxHealth: 100 });

  const chosen = simulation.testHooks.chooseMeleeAttackTarget(left, null, [lowHp, highHp], new Map());
  assert(chosen === lowHp, 'lowest executable kill hp should win among kill candidates');
});

runTest('chooseMeleeAttackTarget kill-candidate tie uses distance as secondary sort', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const left = simulation.addPeon('left', 100, 100, { damage: 10 });
  const fartherKill = simulation.addPeon('right', 109, 100, { health: 10, maxHealth: 100 });
  const nearerKill = simulation.addPeon('right', 105, 100, { health: 10, maxHealth: 100 });

  const chosen = simulation.testHooks.chooseMeleeAttackTarget(left, null, [fartherKill, nearerKill], new Map());
  assert(chosen === nearerKill, 'when kill candidates have equal remaining hp, the nearer target should be chosen');
});

runTest('chooseMeleeAttackTarget non-kill sort and fallback path are covered', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const left = simulation.addPeon('left', 100, 100);
  const e1 = simulation.addPeon('right', 110, 100, { health: 30, maxHealth: 100 });
  const e2 = simulation.addPeon('right', 111, 100, { health: 30, maxHealth: 100 });
  const e3 = simulation.addPeon('right', 112, 100, { health: 30, maxHealth: 100 });

  const normal = simulation.testHooks.chooseMeleeAttackTarget(left, null, [e1, e2, e3], new Map());
  assert([e1, e2, e3].includes(normal), 'non-kill candidate sort should return one close candidate');

  const fullyPlanned = new Map([[e1, 100], [e2, 100], [e3, 100]]);
  const fallback = simulation.testHooks.chooseMeleeAttackTarget(left, null, [e1, e2, e3], fullyPlanned);
  assert([e1, e2, e3].includes(fallback), 'fallback should still return an in-range candidate when all remaining hp <= 0');

  const partiallyPlanned = new Map([[e1, 1], [e2, 1], [e3, 1]]);
  const positiveRemainingFallback = simulation.testHooks.chooseMeleeAttackTarget(left, null, [e1, e2, e3], partiallyPlanned);
  assert([e1, e2, e3].includes(positiveRemainingFallback), 'fallback should return an in-range candidate when remaining hp is still positive');
});

runTest('chooseMeleeAttackTarget uses id tie-break for equally good kill candidates', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const left = simulation.addPeon('left', 100, 100, { damage: 10 });
  const earlier = simulation.addPeon('right', 106, 100, { health: 10, maxHealth: 100 });
  const later = simulation.addPeon('right', 106, 100, { health: 10, maxHealth: 100 });

  const chosen = simulation.testHooks.chooseMeleeAttackTarget(left, null, [later, earlier], new Map());
  assert(chosen === earlier, 'equal kill candidates should fall back to lower id');
});

runTest('chooseMeleeAttackTarget uses id tie-break for equally good non-kill candidates', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const left = simulation.addPeon('left', 100, 100);
  const earlier = simulation.addPeon('right', 110, 100, { health: 30, maxHealth: 100 });
  const later = simulation.addPeon('right', 110, 100, { health: 30, maxHealth: 100 });

  const chosen = simulation.testHooks.chooseMeleeAttackTarget(left, null, [later, earlier], new Map());
  assert(chosen === earlier, 'equal non-kill candidates should fall back to lower id');
});

runTest('isTargetAttackable handles null and plain objects', () => {
  const simulation = createSimulation();
  const hooks = simulation.testHooks;

  assert(hooks.isTargetAttackable(null) === false, 'null target should not be attackable');
  assert(hooks.isTargetAttackable({ side: 'right' }) === true, 'plain object without life state should be treated as attackable');
});

runTest('entityType covers null, tower, peon, and base variants', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);
  const hooks = simulation.testHooks;

  const leftPeon = simulation.addPeon('left', 200, 200);

  assert(hooks.entityType(null) === null, 'null should map to null entity type');
  assert(hooks.entityType(simulation.state.leftTower) === 'tower', 'tower should map to tower entity type');
  assert(hooks.entityType(leftPeon) === 'peon', 'peon should map to peon entity type');
  assert(hooks.entityType(simulation.state.leftBase) === 'base', 'base should map to base entity type');
});

runTest('findNearestEnemyPeon skips dead enemies and uses id tie-break on equal distance', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);
  const hooks = simulation.testHooks;

  const left = simulation.addPeon('left', 100, 100);
  const deadEnemy = simulation.addPeon('right', 104, 100, { health: 0, maxHealth: 100 });
  const tieA = simulation.addPeon('right', 110, 100);
  const tieB = simulation.addPeon('right', 90, 100);

  const chosen = hooks.findNearestEnemyPeon(left, [deadEnemy, tieB, tieA], 30);
  const expected = tieA.id < tieB.id ? tieA : tieB;
  assert(chosen === expected, 'nearest selection should ignore dead units and use lower id for equal-distance ties');
});

runTest('findStructureTargetForPeon falls back from tower to base on both sides', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const left = simulation.addPeon('left', simulation.state.rightTower.x - 20, simulation.state.rightTower.y);
  const right = simulation.addPeon('right', simulation.state.leftTower.x + 20, simulation.state.leftTower.y);
  simulation.state.rightTower.health = 0;
  simulation.state.leftTower.health = 0;

  const leftTarget = simulation.testHooks.findStructureTargetForPeon(left, true);
  const rightTarget = simulation.testHooks.findStructureTargetForPeon(right, true);
  assert(leftTarget === simulation.state.rightBase, 'left peon should target right base when right tower is destroyed');
  assert(rightTarget === simulation.state.leftBase, 'right peon should target left base when left tower is destroyed');
});

runTest('findStructureTargetForPeon returns null when both enemy structures are destroyed', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const left = simulation.addPeon('left', simulation.layout.laneCenter, simulation.layout.laneCenter);
  simulation.state.rightTower.health = 0;
  simulation.state.rightBase.health = 0;

  const target = simulation.testHooks.findStructureTargetForPeon(left, true);
  assert(target === null, 'no enemy structure should be targeted when both are destroyed');
});

runTest('findDesiredTargetForPeon prefers visible enemies and otherwise falls back to structures', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const left = simulation.addPeon('left', simulation.layout.laneCenter + 20, simulation.state.rightTower.y);
  const visibleRight = simulation.addPeon('right', left.x + 20, left.y);

  const withEnemy = simulation.testHooks.findDesiredTargetForPeon(left, [visibleRight]);
  assert(withEnemy.visibleEnemyTarget === visibleRight, 'visible enemy should be reported by the helper');
  assert(withEnemy.desiredTarget === visibleRight, 'visible enemy should outrank structures');

  simulation.clearPeons();
  const soloLeft = simulation.addPeon('left', simulation.state.rightTower.x - 12, simulation.state.rightTower.y);
  const withoutEnemy = simulation.testHooks.findDesiredTargetForPeon(soloLeft, []);
  assert(withoutEnemy.desiredTarget === simulation.state.rightTower, 'structure should be the fallback target when no enemy is visible');
});

runTest('queueAttack ignores null targets', () => {
  const simulation = createSimulation();
  const queue = [];

  simulation.testHooks.queueAttack(queue, null, 10, 'left');

  assert(queue.length === 0, 'queueAttack should not enqueue a null target');
});

runTest('right peons use chooseMeleeAttackTarget symmetrically', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);
  simulation.setDecisionLogEnabled(true);

  const right = simulation.addPeon('right', 400, 300);
  const leftTarget = simulation.addPeon('left', 393, 300);
  makeReady(right);

  simulation.tick();

  const log = simulation.getDecisionLog();
  const attack = log.find(entry => entry.event === 'attack' && entry.peonId === right.id);
  assert(Boolean(attack), 'right peon should attack when a left peon is in melee range');
});

runTest('left peon attacks without waiting when target is in range', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);
  simulation.setDecisionLogEnabled(true);

  const left = simulation.addPeon('left', 300, 300);
  const rightTarget = simulation.addPeon('right', 307, 300);
  makeReady(left);

  simulation.tick();

  const log = simulation.getDecisionLog();
  const attack = log.find(entry => entry.event === 'attack' && entry.peonId === left.id);
  assert(Boolean(attack), 'left peon should attack immediately when target is in range');
});

runTest('peon attacks enemy in melee range even when strategy target is a structure', () => {
  // Regression: peons that crossed midline could get stuck targeting a structure while an
  // enemy peon was standing right next to them. Melee range must always override structure push.
  const mid = 400;
  const simulation = createSimulation({ width: mid * 2, height: 600 });
  simulation.clearPeons();
  disableAutoSpawns(simulation);
  simulation.setDecisionLogEnabled(true);

  const left = simulation.addPeon('left', mid + 5, 300);
  const right = simulation.addPeon('right', mid - 5, 300); // 10 units apart, within attackRange (16)

  // Point left peon at the (far) right tower to simulate the stuck-on-structure case
  left.target = simulation.state.rightTower;
  makeReady(left);
  makeReady(right);

  simulation.tick();

  const log = simulation.getDecisionLog();
  const leftAttack = log.find(entry => entry.event === 'attack' && entry.side === 'left');
  const rightAttack = log.find(entry => entry.event === 'attack' && entry.side === 'right');
  assert(Boolean(leftAttack), 'left peon should attack the right peon in melee range, not stand still targeting structure');
  assert(Boolean(rightAttack), 'right peon should attack the left peon in melee range');
});

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
