const { createSimulation } = require('../js/simulation.js');

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

runTest('spawn slots cycle top to bottom deterministically', () => {
  const simulation = createSimulation();
  simulation.clearPeons();

  for (let index = 0; index < simulation.layout.spawnSlots.length + 1; index++) {
    simulation.spawnUnits('left');
  }

  const ys = simulation.state.peons.map(peon => peon.y);
  assert(ys[0] === simulation.layout.spawnSlots[0], 'first peon should use top slot');
  assert(ys[1] > ys[0], 'second peon should spawn lower than first');
  assert(ys[simulation.layout.spawnSlots.length] === simulation.layout.spawnSlots[0], 'spawn slots should wrap to top');
});

runTest('left side has +5 peon HP bonus', () => {
  const simulation = createSimulation();
  simulation.clearPeons();

  const leftPeon = simulation.addPeon('left', 200, 200);
  const rightPeon = simulation.addPeon('right', 600, 200);

  assert(leftPeon.health === 105, 'left peon should start at 105 HP');
  assert(rightPeon.health === 100, 'right peon should start at 100 HP');
});

runTest('peons prioritize enemy peons over towers', () => {
  const simulation = createSimulation();
  simulation.clearPeons();

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

runTest('after crossing midline peons prioritize enemy structure', () => {
  const simulation = createSimulation();
  simulation.clearPeons();

  const leftPeon = simulation.addPeon('left', simulation.layout.laneCenter + 5, simulation.state.rightTower.y);
  const rightPeon = simulation.addPeon('right', leftPeon.x + 200, leftPeon.y);
  makeReady(leftPeon);
  makeReady(rightPeon);

  simulation.tick();

  assert(leftPeon.target === simulation.state.rightTower, 'left peon should target right tower after crossing midline');
  assert(simulation.state.rightTower.health < 500, 'right tower should take damage from crossed-midline peon');
});

runTest('crossed-midline peon still attacks nearby enemy peon', () => {
  const simulation = createSimulation();
  simulation.clearPeons();

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

runTest('slash effects are created and expire', () => {
  const simulation = createSimulation();
  simulation.clearPeons();

  const leftPeon = simulation.addPeon('left', 390, 200);
  const rightPeon = simulation.addPeon('right', 400, 200);
  makeReady(leftPeon);
  makeReady(rightPeon);

  simulation.tick();
  assert(simulation.state.slashEffects.length >= 2, 'expected slash effects on both melee hits');

  advanceTicks(simulation, 12);
  assert(simulation.state.slashEffects.length === 0, 'slash effects should expire after ttl');
});

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
