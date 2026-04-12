const { createSimulation } = require('./game/js/simulation.js');

/**
 * Basic test harness for Legion game logic
 * Tests peon behavior, attacks, deaths, and game mechanics
 */

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    testsFailed++;
  } else {
    console.log(`✓ ${message}`);
    testsPassed++;
  }
}

function describe(name, fn) {
  console.log(`\n📋 ${name}`);
  fn();
}

describe('Death Event Logging', () => {
  const sim = createSimulation({ width: 800, height: 600 });
  sim.setDecisionLogEnabled(true);
  
  // Damage a peon to death
  const leftPeon = sim.addPeon('left', 100, 300, { health: 10, maxHealth: 10 });
  const leftPeonsBeforeKill = sim.state.peons.filter(p => p.side === 'left').length;
  
  // Kill it by reducing health
  leftPeon.takeDamage(15);
  
  // Run tick to trigger cleanup
  sim.tick();
  sim.tick();
  
  const log = sim.getDecisionLog();
  const deathEvents = log.filter(e => e.event === 'death');
  const leftPeonsAfterKill = sim.state.peons.filter(p => p.side === 'left').length;
  
  assert(leftPeonsAfterKill < leftPeonsBeforeKill, 'Dead peon removed from state');
  assert(deathEvents.length > 0, 'Death event logged for killed peon');
  assert(deathEvents[0].killedBy === 'damage', 'Death event has correct kill reason');
});

describe('Blue Peon Attack Logic', () => {
  const sim = createSimulation({ width: 800, height: 600 });
  sim.setDecisionLogEnabled(true);
  
  // Create blue and red peons close together
  const bluePeon = sim.addPeon('left', 150, 300, { 
    health: 100, 
    maxHealth: 100,
    x: 150,  // blue starting position
    ticksSinceLastAttack: 60  // ready to attack
  });
  
  const redPeon = sim.addPeon('right', 160, 300, { 
    health: 100, 
    maxHealth: 100,
    x: 160   // very close (within attack range of 16)
  });
  
  const initialRedHealth = redPeon.health;
  
  // Run a few ticks to let the peon find target and attack
  for (let i = 0; i < 80; i++) {
    sim.tick();
  }
  
  const log = sim.getDecisionLog();
  const blueAttacks = log.filter(e => e.event === 'attack' && e.side === 'left').length;
  const finalRedHealth = sim.state.peons.find(p => p.id === redPeon.id)?.health ?? initialRedHealth;
  
  assert(blueAttacks > 0, 'Blue peon should attack when target is in range');
  assert(finalRedHealth < initialRedHealth, 'Red peon should take damage from blue attacks');
});

describe('Tick Summary Peon Count', () => {
  const sim = createSimulation({ width: 800, height: 600 });
  sim.setDecisionLogEnabled(true);
  
  // Clear existing peons and create controlled count
  sim.clearPeons();
  sim.addPeon('left', 150, 300);
  sim.addPeon('left', 160, 310);
  sim.addPeon('right', 650, 300);
  
  // Run ticks to generate tick-summaries
  for (let i = 0; i < 10; i++) {
    sim.tick();
  }
  
  const log = sim.getDecisionLog();
  const summaries = log.filter(e => e.event === 'tick-summary');
  
  assert(summaries.length > 0, 'Tick summaries are logged');
  
  const firstSummary = summaries[0];
  assert(firstSummary.leftPeons !== undefined, 'Tick summary includes leftPeons count');
  assert(firstSummary.rightPeons !== undefined, 'Tick summary includes rightPeons count');
});

describe('Attack Cooldown Reset', () => {
  const sim = createSimulation({ width: 800, height: 600 });
  
  const peon = sim.addPeon('left', 150, 300, { ticksSinceLastAttack: 100 });
  const initialCooldown = peon.ticksSinceLastAttack;
  
  assert(peon.canAttack(), 'Peon with enough cooldown can attack');
  
  peon.resetAttackCooldown();
  assert(peon.ticksSinceLastAttack === 0, 'Attack cooldown reset to 0');
  assert(!peon.canAttack(), 'Peon cannot attack immediately after reset');
  
  peon.update();
  assert(peon.ticksSinceLastAttack === 1, 'Cooldown increments after update');
});

describe('Peon Damage and Death', () => {
  const sim = createSimulation({ width: 800, height: 600 });
  
  const peon = sim.addPeon('right', 650, 300, { health: 50, maxHealth: 100 });
  const initialHealth = peon.health;
  
  peon.takeDamage(15);
  assert(peon.health === initialHealth - 15, 'Peon takes correct damage amount');
  assert(peon.isAlive(), 'Peon is alive after partial damage');
  
  peon.takeDamage(100);
  assert(peon.health === 0, 'Peon health cannot go below 0');
  assert(!peon.isAlive(), 'Peon is dead after lethal damage');
});

// Summary
console.log(`\n${'='.repeat(50)}`);
console.log(`Tests passed: ${testsPassed}`);
console.log(`Tests failed: ${testsFailed}`);
console.log(`Total: ${testsPassed + testsFailed}`);

if (testsFailed > 0) {
  process.exit(1);
}
