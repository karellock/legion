const { createSimulation } = require('./game/js/simulation.js');

// Create simulation with logging enabled
const simulation = createSimulation({ width: 800, height: 600 });
const { constants, state } = simulation;

// Enable decision log
const decisionLog = [];
simulation.setDecisionLogEnabled?.(true);

// Run simulation for ~40 seconds (2400 ticks at 60 FPS)
const ticksToRun = 40 * constants.TICK_RATE;

console.log(`Starting simulation for ${ticksToRun} ticks...`);

for (let i = 0; i < ticksToRun; i++) {
  simulation.tick();
  
  if (i % constants.TICK_RATE === 0) {
    const sec = Math.floor(i / constants.TICK_RATE);
    const log = simulation.getDecisionLog();
    const peonsLeft = state.peons.filter(p => p.side === 'left').length;
    const peonsRight = state.peons.filter(p => p.side === 'right').length;
    console.log(`Tick ${i} (${sec}s): ${peonsLeft}L vs ${peonsRight}R, events: ${log.length}`);
  }
}

// Generate output
const finalLog = simulation.getDecisionLog();
const payload = {
  timestamp: new Date().toISOString(),
  version: '0.0.1-test',
  tickRate: constants.TICK_RATE,
  currentTick: state.gameTime,
  leftHpLost: state.leftHpLost,
  rightHpLost: state.rightHpLost,
  leftPeons: state.peons.filter(peon => peon.side === 'left').length,
  rightPeons: state.peons.filter(peon => peon.side === 'right').length,
  entries: finalLog,
};

const fs = require('fs');
const logPath = `./logs/legion-run-log-${Date.now()}.json`;
fs.mkdirSync('./logs', { recursive: true });
fs.writeFileSync(logPath, JSON.stringify(payload, null, 2));

console.log(`\nLog saved to: ${logPath}`);
console.log(`Total events: ${finalLog.length}`);
console.log(`Death events: ${finalLog.filter(e => e.event === 'death').length}`);
