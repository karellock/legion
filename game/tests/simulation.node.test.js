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

runTest('peons spawn with symmetric HP on both sides', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', 200, 200);
  const rightPeon = simulation.addPeon('right', 600, 200);

  assert(leftPeon.health === 100, 'left peon should start at 100 HP');
  assert(rightPeon.health === 100, 'right peon should start at 100 HP');
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
  simulation.tick();
  assert(simulation.state.rightTower.health === 490, 'tower should take structure hit when lane is empty');

  const rightPeon = simulation.addPeon('right', leftPeon.x + 10, leftPeon.y);
  makeReady(leftPeon);
  simulation.tick();

  assert(leftPeon.target === rightPeon, 'left peon should switch to enemy peon target');
  assert(simulation.state.rightTower.health === 490, 'tower damage should stop once enemy peon appears');
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
  const rightWeak = simulation.addPeon('right', 400, 200, { health: 10, maxHealth: 10 });
  const rightStrong = simulation.addPeon('right', 404, 200, { health: 100, maxHealth: 100 });
  makeReady(leftA);
  makeReady(leftB);

  simulation.tick();

  assert(!rightWeak.isAlive(), 'weak target should be killed');
  assert(rightStrong.health === 90, 'second hit should be redirected to another in-range target');
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

runTest('buyUpgrade rejects purchase when side lacks enough gold', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const result = simulation.buyUpgrade('left', 'damage');

  assert(result.ok === false, 'purchase should fail when gold is insufficient');
  assert(result.reason === 'insufficient-gold', 'failure reason should be insufficient gold');
  assert(simulation.state.leftUpgrades.damageLevel === 0, 'damage level should remain unchanged after failed purchase');
});

runTest('upgrade costs double each level and spend gold deterministically', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  simulation.state.leftGold = 200;
  const first = simulation.buyUpgrade('left', 'damage');
  const second = simulation.buyUpgrade('left', 'damage');

  assert(first.ok === true, 'first upgrade purchase should succeed');
  assert(second.ok === true, 'second upgrade purchase should succeed');
  assert(first.cost === 50, 'first upgrade cost should be base cost 50');
  assert(second.cost === 100, 'second upgrade cost should double to 100');
  assert(simulation.state.leftGold === 50, 'gold should be reduced by cumulative costs (150 total)');
  assert(simulation.state.leftUpgrades.damageLevel === 2, 'damage upgrade level should increment per purchase');
});

runTest('health and damage upgrades affect newly spawned peons', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  simulation.state.leftGold = 200;
  simulation.buyUpgrade('left', 'health');
  simulation.buyUpgrade('left', 'damage');

  const upgradedPeon = simulation.addPeon('left', 200, 200);

  assert(upgradedPeon.maxHealth === 150, 'left peon max health should include +50 from one health upgrade');
  assert(upgradedPeon.health === 150, 'left peon current health should start at upgraded max health');
  assert(upgradedPeon.damage === 15, 'left peon damage should include +5 from one damage upgrade');
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
});

runTest('chooseMeleeAttackTarget uses id tie-break for equally good kill candidates', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const left = simulation.addPeon('left', 100, 100);
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
