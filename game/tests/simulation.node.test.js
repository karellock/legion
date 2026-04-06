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

runTest('left side has +5 peon HP bonus', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', 200, 200);
  const rightPeon = simulation.addPeon('right', 600, 200);

  assert(leftPeon.health === 105, 'left peon should start at 105 HP');
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

runTest('after crossing midline peons hunt enemies on attacker side first', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', simulation.layout.laneCenter + 5, simulation.state.rightTower.y);
  const rightPeon = simulation.addPeon('right', leftPeon.x + 8, leftPeon.y);
  makeReady(leftPeon);
  makeReady(rightPeon);

  simulation.tick();

  assert(leftPeon.target === rightPeon, 'left peon should hunt enemy peon on attacker side after crossing midline');
  assert(rightPeon.health < 100, 'hunted enemy peon should take damage');
});

runTest('after crossing midline peons target structure when no attacker-side enemies remain', () => {
  const simulation = createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', simulation.state.rightTower.x - 12, simulation.state.rightTower.y);
  // Enemy exists but on defender side, so should not block tower push.
  simulation.addPeon('right', simulation.layout.laneCenter - 50, simulation.state.rightTower.y);
  makeReady(leftPeon);

  const towerBefore = simulation.state.rightTower.health;
  simulation.tick();

  assert(leftPeon.target === simulation.state.rightTower, 'left peon should target right tower when attacker side is clear');
  assert(simulation.state.rightTower.health < towerBefore, 'tower should take damage when no attacker-side enemies exist');
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

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
