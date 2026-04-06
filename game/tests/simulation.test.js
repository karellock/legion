const resultsElement = document.getElementById('results');
const results = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function logResult(name, passed, detail = '') {
  const line = document.createElement('div');
  line.className = passed ? 'pass' : 'fail';
  line.textContent = `${passed ? 'PASS' : 'FAIL'}: ${name}${detail ? ` - ${detail}` : ''}`;
  resultsElement.appendChild(line);
  results.push({ name, passed, detail });
}

function runTest(name, callback) {
  try {
    callback();
    logResult(name, true);
  } catch (error) {
    logResult(name, false, error.message);
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

runTest('spawn slots cycle deterministically around tower lane', () => {
  const simulation = window.createSimulation();
  simulation.clearPeons();

  for (let index = 0; index < simulation.layout.spawnSlots.length + 1; index++) {
    simulation.spawnUnits('left');
  }

  const ys = simulation.state.peons.map(peon => peon.y);
  assert(ys[0] === simulation.layout.spawnSlots[0], 'first peon should use first configured slot');
  assert(ys[1] !== ys[0], 'second peon should spawn on a different line for variety');
  assert(ys[simulation.layout.spawnSlots.length] === simulation.layout.spawnSlots[0], 'spawn slots should wrap to first slot');
});

runTest('left side has +5 peon HP bonus', () => {
  const simulation = window.createSimulation();
  simulation.clearPeons();

  const leftPeon = simulation.addPeon('left', 200, 200);
  const rightPeon = simulation.addPeon('right', 600, 200);

  assert(leftPeon.health === 105, 'left peon should start at 105 HP');
  assert(rightPeon.health === 100, 'right peon should start at 100 HP');
  assert(leftPeon.maxHealth === rightPeon.maxHealth + 5, 'left peon max HP should be 5 higher');
});

runTest('peons prioritize enemy peons over towers', () => {
  const simulation = window.createSimulation();
  simulation.clearPeons();

  const leftPeon = simulation.addPeon('left', simulation.state.rightTower.x - 12, simulation.state.rightTower.y);
  const rightPeon = simulation.addPeon('right', leftPeon.x + 10, leftPeon.y);
  makeReady(leftPeon);
  makeReady(rightPeon);

  const towerHealthBefore = simulation.state.rightTower.health;
  simulation.tick();

  assert(simulation.state.rightTower.health === towerHealthBefore, 'tower should not take damage while enemy peon is in melee range');
  assert(leftPeon.target === rightPeon, 'left peon should target enemy peon first');
});

runTest('peons drop structure targets when an enemy peon appears', () => {
  const simulation = window.createSimulation();
  simulation.clearPeons();

  const leftPeon = simulation.addPeon('left', simulation.state.rightTower.x - 12, simulation.state.rightTower.y);
  makeReady(leftPeon);
  simulation.tick();
  assert(simulation.state.rightTower.health === 490, 'tower should take initial structure damage when lane is clear');

  const rightPeon = simulation.addPeon('right', leftPeon.x + 10, leftPeon.y, { ticksSinceLastAttack: 0 });
  makeReady(leftPeon);
  simulation.tick();

  assert(leftPeon.target === rightPeon, 'left peon should retarget to the new enemy peon');
  assert(simulation.state.rightTower.health === 490, 'tower should stop taking damage once an enemy peon appears');
});

runTest('simultaneous melee kills both peons in equal trade', () => {
  const simulation = window.createSimulation();
  simulation.clearPeons();

  const leftPeon = simulation.addPeon('left', 390, 200, { health: 10, maxHealth: 10 });
  const rightPeon = simulation.addPeon('right', 400, 200, { health: 10, maxHealth: 10 });
  makeReady(leftPeon);
  makeReady(rightPeon);

  simulation.tick();

  assert(simulation.state.peons.length === 0, 'both peons should die in the same tick');
});

runTest('slash effects are emitted for peon attacks', () => {
  const simulation = window.createSimulation();
  simulation.clearPeons();

  const leftPeon = simulation.addPeon('left', 390, 200);
  const rightPeon = simulation.addPeon('right', 400, 200);
  makeReady(leftPeon);
  makeReady(rightPeon);

  simulation.tick();

  assert(simulation.state.slashEffects.length >= 2, 'expected slash effects for both melee hits');
});

runTest('slash effects expire after their ttl', () => {
  const simulation = window.createSimulation();
  simulation.clearPeons();

  const leftPeon = simulation.addPeon('left', 390, 200);
  const rightPeon = simulation.addPeon('right', 400, 200);
  makeReady(leftPeon);
  makeReady(rightPeon);

  simulation.tick();
  assert(simulation.state.slashEffects.length > 0, 'expected slash effect to exist after hit tick');

  advanceTicks(simulation, 12);
  assert(simulation.state.slashEffects.length === 0, 'slash effects should clear after ttl');
});

runTest('symmetric simulation keeps both sides even over time', () => {
  const simulation = window.createSimulation();
  advanceTicks(simulation, 2400);

  assert(simulation.state.leftBase.health === simulation.state.rightBase.health, 'bases should have equal health in symmetric simulation');
  assert(simulation.state.leftTower.health === simulation.state.rightTower.health, 'towers should have equal health in symmetric simulation');
});

const passedCount = results.filter(result => result.passed).length;
const summary = document.createElement('div');
summary.style.marginTop = '16px';
summary.textContent = `Summary: ${passedCount}/${results.length} tests passed`;
resultsElement.appendChild(summary);