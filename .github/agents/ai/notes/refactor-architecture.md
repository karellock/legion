# Refactor Architecture & Module Organization

**Last Updated**: April 12, 2026  

---

## Module Organization

The game was refactored from a 2196-line monolith into 13 focused modules. This document helps agents understand where code lives and how to navigate the codebase.

### Core Game Modules (game/js/)

**Deterministic Simulation** (no RNG, no physics bumping)
- `simulation.js` - Core combat, targeting, spawning, economy, telemetry

**Game Loop & Orchestration**
- `game.js` - Bootstrap, init sequence, game loop tick delta, module wiring (407 lines)
- `game-render.js` - Canvas rendering, animations, HUD pipeline (564 lines)
- `game-controls.js` - HUD wiring, settings UI, dev tool controls, upgrade buttons (816 lines)
- `game-selection.js` - Click-to-inspect entity panel, selection state (123 lines)
- `game-match-ui.js` - Match end/restart state machine (153 lines)

**Game Logic Helpers** (deterministic, testable)
- `game-bot-core.js` - Bot strategy decisions (8 types), upgrade purchase cadence
- `game-settings.js` - Settings persistence (localStorage), lowest-value defaults, reset logic
- `game-debug-api.js` - window.legionDebug tunneling (tuning, telemetry, decision log)
- `game-battle-test.js` - Battle simulator orchestration (UI + logic)

**Session Handoff** (tournament ↔ main game)
- `game-session-core.js` - URL payload encoding/decoding, session ID generation

**Tournament** (pure helpers + orchestration)
- `tournament-core.js` - Strategy catalog, map profiles, ranking, leaderboard (pure, shared)
- `tournament.js` - Tournament page orchestration, history persistence

### Test Modules (game/tests/)

- `simulation.node.test.js` - Deterministic regression tests (63 tests)
- `game.bot.core.node.test.js` - Bot strategy tests (6 tests)
- `game.battle.test.node.test.js` - Battle test orchestration (1 test)
- `game.session.core.node.test.js` - Session payload tests (4 tests)
- `tournament.core.node.test.js` - Tournament helper tests (7 tests)
- `simulation.test.js` - Browser-based tests (7 tests)
- `run-all-node-tests.js` - Test runner (all node tests)

**Total: 94 deterministic tests, all passing, zero flake.**

---

## Module Patterns

### Dual Export (CommonJS + Browser)
All modules follow this pattern:
```javascript
(function(globalScope) {
  function createXyz(options) { ... }
  
  const api = { createXyz };
  
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;  // Node.js require()
  }
  
  if (globalScope) {
    globalScope.LegionXyz = api;  // Browser window.LegionXyz
  }
})(typeof window !== 'undefined' ? window : globalThis);
```

**Usage:**
- Node: `const { createXyz } = require('./game-xyz.js')`
- Browser: `const mod = window.LegionXyz; mod.createXyz(...)`

### Dependency Injection
Modules accept options object for testability:
```javascript
const api = createGameRender({
  ctx,           // Canvas 2D context
  baseCanvasWidth,
  baseCanvasHeight,
  turnSmoothing
});
```

This enables:
- Easy mocking in tests
- Clear API contracts
- Separation of instance vs. factory

### Testable Seams
Each module has deterministic, pure-function core logic:
- `game-bot-core.js`: `getUpgradeTypeForStrategy(strategy, snapshot)` → pure
- `tournament-core.js`: `buildLeaderboardRows(runs)` → pure
- `game-session-core.js`: `createSession(payload)` → pure

---

## Key Files by Concern

### Adding a New Bot Strategy
1. Add strategy object to `tournament-core.js` STRATEGIES array
2. Add decision logic case in `game-bot-core.js` getUpgradeTypeForStrategy()
3. Add tests in `game/tests/game.bot.core.node.test.js`
4. UI selector will auto-include it from STRATEGIES catalog

**Example: "cheapest-first" bot**
- Selects whichever upgrade type has lowest next cost
- Added in Pass 2 (commit bbef7a2)
- Tests: game.bot.core.node.test.js lines ~60-75

### Adding a New Dev Tool Slider
1. Add constant to `game.js` BASE_SETTINGS
2. Add UI control in `game/index.html` (label + range input + output)
3. Wire event listener in `game-controls.js` setupDevControls()
4. Call simulation.setXyz() method to apply
5. Add test in `simulation.node.test.js`

**Example: Tower HP slider**
- Constant: game.js line ~45 (towerHp)
- HTML: game/index.html dev panel
- Event: game-controls.js
- Simulation: simulation.js setStructureVitalityValues()

### Persisting a Setting Across Refresh
1. Add key to `game-settings.js` LOWEST_SETTINGS object with lowest value
2. Add key to buildSettingsPayloadFromConstants() to query simulation constants
3. Settings automatically persist to localStorage after any change
4. Reset button clears storage and restores version defaults

**Current settings:**
- Spawn: padding, slot count, interval
- Peon: speed, HP, damage, attackRate
- Structure: HP (tower/base), damage, attackRate, grace windows
- Economy: kill bounty, passive income (base/shrine)
- Upgrades: base cost, cost growth, formula per track

### Accessing Telemetry / Decision Log
1. Enable via `window.legionDebug.setDecisionLog(true)` or UI toggle
2. Each `simulation.tick()` records event to decision log
3. Retrieve with `window.legionDebug.getDecisionLog(limit)`
4. Dump/filter with `dumpDecisionLog()`, `dumpDecisionWindow(startSec, endSec)`
5. Summarize with `summarizeWindow(startSec, endSec)`

**Event types:**
- 'tick-summary': end-of-tick state snapshot
- 'spawn': peon wave spawned
- 'attack': peon or structure attacks
- 'target-change': peon retargets
- 'clear-target': target became invalid
- 'upgrade-bought': side purchased upgrade
- 'peon-killed': peon died

---

## Data Flow

### Game Loop
1. **init()** → Load settings from localStorage, setup modules
2. **gameLoop(currentTime)** → Calculate frame delta, accumulate ticks
3. **while tickDelta >= TICK_DURATION:**
   - `simulation.tick()` - Advance combat/economy one tick
   - `runBotPurchasesForTick()` - Bot AI makes purchases (1Hz cadence)
   - `pauseForMatchEndIfNeeded()` - Check end-of-match state
   - Decrement tickDelta
4. **Update HUDs** → Upgrade costs, balance config, selection panel
5. **render()** → Draw canvas, damage popups, entity sprites
6. **requestAnimationFrame()** → Loop

### Settings Persistence
1. **Load**: init() → settingsManager.getSavedSettingsOrLowest()
2. **Query localStorage** for SETTINGS_KEY → parsed JSON
3. If not found → fallback to LOWEST_SETTINGS (all numeric minimums)
4. **Apply** → settingsManager.applyBaseSettings(settings)
5. **On UI change** → Slider input → simulation.setXyz() → controls event listener
6. **Save** → Automatically persisted to localStorage
7. **Reset** → User clicks "Reset to Defaults" button → stored version defaults restored

### Tournament Round-Robin
1. Load map config & strategy list from UI
2. Build pairs: `buildRoundRobinPairs(strategies)` → all unique unordered pairs
3. For each pair:
   - Clone simulation: `createSimulation(mapConfig)`
   - Run match: bots purchase upgrades, peons fight
   - Track winner, record stats
4. Compute aggregates: `computeRunAggregateStats(runs)`
5. Build leaderboard: `buildLeaderboardRows(leaderboardData)` → sorted by points/winRate
6. Save run to history (localStorage `legion-tournament-history-v1`)
7. Can export/import as JSON or load from manifest file

---

## Testing Strategy

### All Tests Are Deterministic
- No `Math.random()` in deterministic simulation core logic (`simulation.js`)
- No timing assumptions (tests don't sleep/wait)
- All peon targeting tie-breaks use entity ID
- Test output is reproducible every time

### Running Tests Locally
```bash
node game/tests/run-all-node-tests.js   # All 94 tests
node game/tests/simulation.node.test.js # Just simulation (63 tests)
```

### CI Coverage Gate
```bash
npx c8 --check-coverage --lines 95 --functions 95 --branches 95 --statements 95 \
  node game/tests/simulation.node.test.js
```
Enforces 95% coverage on simulation.js lines, functions, branches, statements.

### Adding a New Test
1. Create new test file or add to existing
2. Use pattern: `test('description', () => { ... })`
3. Call assertion functions (must not throw)
4. Export test list: `module.exports = { testName: () => { ... } }`
5. Add to `run-all-node-tests.js` require list
6. Run `node game/tests/run-all-node-tests.js` to verify

---

## Common Patterns to Follow

✅ **Deterministic Tie-Breaks**
- When multiple entities are equally valid (same distance, same HP), use ID
- Example: `findNearestEnemyPeon()` sorts by distance, then by ID

✅ **Settings Constants**
- Define in BASE_SETTINGS in game.js
- Query from simulation.constants in buildSettingsPayloadFromConstants()
- Persist to localStorage automatically
- Add to LOWEST_SETTINGS for reset behavior

✅ **Bot Strategies**
- Add to tournament-core.js STRATEGIES array with { id, label }
- Add case in game-bot-core.js getUpgradeTypeForStrategy()
- Test with game.bot.core.node.test.js
- Will auto-appear in UI and tournament selectors

✅ **Debug API Methods**
- Add to game-debug-api.js createGameDebugApi()
- Accept options for simulation, constants, state, HUD update functions
- Call simulation.setXyz() to apply changes
- Return result for inspection
- Accessible as `window.legionDebug.methodName(args)`

✅ **Modifying Simulation**
- Keep logic in simulation.js (deterministic, pure)
- Export setXyz() methods for runtime tuning
- Add regression tests in simulation.node.test.js
- Document in GDD.md before implementing

---

## Architecture Principles

1. **Deterministic First**: Simulation core uses no RNG, exact math, reproducible outcomes
2. **Small Modules**: Each file has single clear responsibility
3. **Testable Seams**: Pure functions at module boundaries
4. **Shared Helpers**: Tournament and main game use same bot/session logic
5. **Browser + Node**: All modules work both environments
6. **Long-Term Maintainability**: Clarity > token count

---

## Query Guide for Agents

**"Where is X?"**
- Simulation core logic → `simulation.js`
- Rendering code → `game-render.js`
- HUD/UI control wiring → `game-controls.js`
- Bot AI decisions → `game-bot-core.js`
- Settings persistence → `game-settings.js`
- Debug/telemetry API → `game-debug-api.js`
- Tournament pure helpers → `tournament-core.js`
- Game loop bootstrap → `game.js`
- Entity selection/inspection → `game-selection.js`
- Match end/restart state → `game-match-ui.js`
- URL session handoff → `game-session-core.js`
- Battle test runner → `game-battle-test.js`
- Tournament page UI → `tournament.js`

**"How do I add Y?"**
- New bot strategy → Modify tournament-core.js + game-bot-core.js + add test
- New dev slider → Add to game.js BASE_SETTINGS, game-controls.js, game/index.html
- New upgrade stat → Add simulation.js constant, settings.js, GDD.md, test
- New debug API method → Modify game-debug-api.js createGameDebugApi()
- New telemetry event → Add to simulation.js decision log + query methods

**"What tests exist for Z?"**
- Core simulation → simulation.node.test.js (63 tests)
- Bot strategies → game.bot.core.node.test.js (6 tests)
- Session handoff → game.session.core.node.test.js (4 tests)
- Tournament ranking → tournament.core.node.test.js (7 tests)
- Battle orchestration → game.battle.test.node.test.js (1 test)
- Browser rendering → simulation.test.js (7 tests)

---

## References

- **Game Design**: See GDD.md (all gameplay rules, tuning, feature status)
- **Agent Instructions**: See .github/agents/legion-game-architect.agent.md
- **CI Automation**: See .github/workflows/ci-tests.yml
- **Module Tests**: See game/tests/run-all-node-tests.js for test runner
- **Coverage Gate**: 95% minimum on simulation.js (lines, functions, branches, statements)
