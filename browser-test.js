// Save this in the browser console to test the fix
// It will run the simulation for ~30 seconds and download the logs automatically

(async () => {
  console.log('Starting auto-test...');
  
  // Enable decision logging
  window.legionDebug.setDecisionLog(true);
  
  // Run for 30 seconds (1800 ticks)
  const targetTicks = 30 * 60; // 30 seconds at 60 FPS
  const startTick = window.simulation.state.gameTime;
  
  // Tick until we reach target
  while (window.simulation.state.gameTime < startTick + targetTicks) {
    window.simulation.tick();
    
    // Update canvas every 60 ticks
    if ((window.simulation.state.gameTime - startTick) % 60 === 0) {
      const sec = Math.floor((window.simulation.state.gameTime - startTick) / 60);
      const log = window.simulation.getDecisionLog();
      const deaths = log.filter(e => e.event === 'death').length;
      console.log(`${sec}s: ${deaths} death events logged`);
      await new Promise(r => setTimeout(r, 10)); // Yield to allow rendering
    }
  }
  
  console.log('Test complete. Downloading logs...');
  window.downloadRunLogs();
})();
