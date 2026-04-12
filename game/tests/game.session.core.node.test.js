const sessionCore = require('../js/game-session-core.js');

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

runTest('normalizeMapConfig clamps and defaults map settings', () => {
  const map = sessionCore.normalizeMapConfig({
    length: 100000,
    laneInset: -50,
    baseHp: 0,
    enableTowers: false,
  });

  assert(map.length === 6000, 'map length should clamp to max 6000');
  assert(map.laneInset === 10, 'lane inset should clamp to min 10');
  assert(map.baseHp === 1, 'base hp should clamp to min 1');
  assert(map.enableTowers === false, 'enableTowers false should remain false');
});

runTest('createGameSessionFromTournamentRun copies key run data', () => {
  const run = {
    version: '0.0.2',
    timestamp: '2026-04-12T00:00:00.000Z',
    mapConfig: { length: 2200, laneInset: 40, baseHp: 1, enableTowers: false },
    settingsSnapshot: { spawnPadding: 15, spawnSlotCount: 7 },
    selectedStrategies: ['balanced', 'spawn-only'],
    matchesPerSide: 4,
    maxMinutes: 6,
    totalMatches: 24,
  };

  const payload = sessionCore.createGameSessionFromTournamentRun(run);

  assert(payload.source === 'tournament-history', 'session source should identify tournament handoff');
  assert(payload.mapConfig.length === 2200, 'map length should be copied into payload');
  assert(payload.settingsSnapshot.spawnPadding === 15, 'settings snapshot should be preserved');
  assert(payload.selectedStrategies.length === 2, 'selected strategies should be preserved');
  assert(payload.totalMatches === 24, 'total match count should be preserved');
});

runTest('readSessionIdFromSearch parses session query param', () => {
  const sessionId = sessionCore.readSessionIdFromSearch('?foo=bar&session=abc123');
  assert(sessionId === 'abc123', 'session param should be parsed from query string');
});

runTest('buildMainGameUrlForSession encodes session id', () => {
  const url = sessionCore.buildMainGameUrlForSession('session with spaces');
  assert(url === 'index.html?session=session%20with%20spaces', 'session id should be URL-encoded');
});

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
