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

function disableAutoSpawns(simulation) {
  simulation.state.leftSpawnTimer = Number.MAX_SAFE_INTEGER;
  simulation.state.rightSpawnTimer = Number.MAX_SAFE_INTEGER;
}

runTest('spawn slots cycle deterministically around tower lane', () => {
  const simulation = window.createSimulation();
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

runTest('peons spawn with symmetric baseline hp', () => {
  const simulation = window.createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', 200, 200);
  const rightPeon = simulation.addPeon('right', 600, 200);

  assert(leftPeon.health === 100, 'left peon should start at 100 HP');
  assert(rightPeon.health === 100, 'right peon should start at 100 HP');
  assert(leftPeon.maxHealth === rightPeon.maxHealth, 'both sides should start with equal max hp');
});

runTest('upgrades use smaller +1 damage and +5 health steps', () => {
  const simulation = window.createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  simulation.state.leftGold = 100;
  const damageBuy = simulation.buyUpgrade('left', 'damage');
  const healthBuy = simulation.buyUpgrade('left', 'health');
  const upgradedPeon = simulation.addPeon('left', 200, 200);

  assert(damageBuy.cost === 20, 'first damage upgrade should cost 20 gold');
  assert(healthBuy.cost === 20, 'first health upgrade should cost 20 gold');
  assert(upgradedPeon.damage === 11, 'one damage upgrade should add 1 damage');
  assert(upgradedPeon.maxHealth === 105, 'one health upgrade should add 5 max hp');
});

runTest('peons prioritize enemy peons over towers', () => {
  const simulation = window.createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

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
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', simulation.state.rightTower.x - 12, simulation.state.rightTower.y);
  makeReady(leftPeon);
  simulation.tick();
  assert(
    simulation.state.rightTower.health === simulation.state.rightTower.maxHealth - leftPeon.damage,
    'tower should take initial structure damage when lane is clear'
  );

  const rightPeon = simulation.addPeon('right', leftPeon.x + 10, leftPeon.y, { ticksSinceLastAttack: 0 });
  makeReady(leftPeon);
  simulation.tick();

  assert(leftPeon.target === rightPeon, 'left peon should retarget to the new enemy peon');
  assert(
    simulation.state.rightTower.health === simulation.state.rightTower.maxHealth - leftPeon.damage,
    'tower should stop taking damage once an enemy peon appears'
  );
});

runTest('after crossing midline peons hunt enemies on attacker side first', () => {
  const simulation = window.createSimulation();
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
  const simulation = window.createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', simulation.state.rightTower.x - 12, simulation.state.rightTower.y);
  simulation.addPeon('right', simulation.layout.laneCenter - 50, simulation.state.rightTower.y);
  makeReady(leftPeon);

  const towerBefore = simulation.state.rightTower.health;
  simulation.tick();

  assert(leftPeon.target === simulation.state.rightTower, 'left peon should target right tower when attacker side is clear');
  assert(simulation.state.rightTower.health < towerBefore, 'tower should take damage when no attacker-side enemies exist');
});

runTest('simultaneous melee kills both peons in equal trade', () => {
  const simulation = window.createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

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
  disableAutoSpawns(simulation);

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
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', 390, 200);
  const rightPeon = simulation.addPeon('right', 400, 200);
  makeReady(leftPeon);
  makeReady(rightPeon);

  simulation.tick();
  assert(simulation.state.slashEffects.length > 0, 'expected slash effect to exist after hit tick');

  advanceTicks(simulation, 12);
  assert(simulation.state.slashEffects.length === 0, 'slash effects should clear after ttl');
});

runTest('hp lost telemetry counts actual damage after clamp', () => {
  const simulation = window.createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  const leftPeon = simulation.addPeon('left', 390, 200);
  simulation.addPeon('right', 400, 200, { health: 5, maxHealth: 5 });
  makeReady(leftPeon);

  simulation.tick();

  assert(simulation.state.rightHpLost === 5, 'hp lost should reflect actual health removed, not raw outgoing damage');
});

runTest('decision log respects max entry cap', () => {
  const simulation = window.createSimulation();
  simulation.clearPeons();
  disableAutoSpawns(simulation);

  simulation.state.decisionLogMaxEntries = 5;
  simulation.setDecisionLogEnabled(true);
  advanceTicks(simulation, 10);

  assert(simulation.getDecisionLog().length === 5, 'decision log should retain only latest entries up to cap');
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