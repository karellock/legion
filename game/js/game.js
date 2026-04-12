const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const sessionCore = window.LegionGameSessionCore;
const sessionEntry = sessionCore?.loadSessionPayloadFromSearch(window.location.search) || null;
const initialSessionPayload = sessionEntry?.payload || null;
const initialMapConfig = sessionCore?.normalizeMapConfig(initialSessionPayload?.mapConfig || {}) || {
  length: canvas.width,
  laneInset: 100,
  baseHp: 2000,
  enableTowers: true,
};

canvas.width = Math.round(initialMapConfig.length || canvas.width);
canvas.height = 600;

const simulation = window.createSimulation({
  width: canvas.width,
  height: canvas.height,
  laneInset: initialMapConfig.laneInset,
  baseHp: initialMapConfig.baseHp,
  enableTowers: initialMapConfig.enableTowers,
  structureDamageGraceSeconds: Number(initialSessionPayload?.settingsSnapshot?.structureGraceSeconds ?? 20),
  baseDamageGraceSeconds: Number(initialSessionPayload?.settingsSnapshot?.baseGraceSeconds ?? 45),
});
const { constants, layout, state } = simulation;
const GAME_VERSION = '0.0.2';
const SETTINGS_KEY = 'legion-dev-settings';
const SETTINGS_DEFAULTS_KEY = `legion-dev-settings-defaults-${GAME_VERSION}`;
const BASE_SETTINGS = {
  spawnPadding: 15,
  spawnSlotCount: 7,
  spawnIntervalSeconds: 6,
  peonSpeed: 25,
  peonHp: 100,
  peonDamage: 9,
  peonAttackRate: 1,
  towerHp: 700,
  baseHp: 2000,
  towerDamagePerMinute: 1.2,
  baseDamagePerMinute: 1.5,
  towerDamage: 30,
  baseDamage: 30,
  towerAttackRate: 0.5,
  baseAttackRate: 0.4,
  structureGraceSeconds: 20,
  baseGraceSeconds: 45,
  upgradeDamageBaseCost: 20,
  upgradeDamageCostGrowth: 1.9,
  upgradeDamageCostFormula: 'linear',
  upgradeHealthBaseCost: 5,
  upgradeHealthCostGrowth: 1.75,
  upgradeHealthCostFormula: 'linear',
  upgradeSpawnBaseCost: 500,
  upgradeSpawnCostGrowth: 1.55,
  upgradeSpawnCostFormula: 'exp',
  killBountyGold: 10,
  baseGoldPerSecond: 0,
  shrineGoldPerSecond: 0,
};
const BASE_CANVAS_WIDTH = canvas.width;
const BASE_CANVAS_HEIGHT = canvas.height;
const TURN_SMOOTHING = 0.22;
const debugFlags = {
  showVisionRanges: false,
  showDamageNumbers: false,
};
const damageNumberEffects = [];
const DAMAGE_NUMBER_MAX_AGE = 50;
const upgradeButtons = [];
const upgradeSummaryEls = {
  left: null,
  right: null,
};
const botStrategy = {
  left: 'none',
  right: 'none',
};
const botCore = window.LegionGameBotCore;
const gameRender = window.LegionGameRender;
const gameControls = window.LegionGameControls;
const gameSelection = window.LegionGameSelection;
const gameMatchUi = window.LegionGameMatchUi;
const gameBattleTest = window.LegionGameBattleTest;
const gameSettings = window.LegionGameSettings;
let timeScale = 1;
let selectionInfoEl = null;
let isMatchPaused = false;
let suppressEndPauseUntilRestart = false;
const activeSessionId = sessionEntry?.sessionId || null;

const appEl = document.getElementById('app');
const hudToggleBtn = document.getElementById('hudToggleBtn');
const settingsManager = gameSettings?.createGameSettings({
  simulation,
  constants,
  baseSettings: BASE_SETTINGS,
  initialSessionPayload,
  settingsKey: SETTINGS_KEY,
  settingsDefaultsKey: SETTINGS_DEFAULTS_KEY,
  storage: window.localStorage,
});
const renderer = gameRender?.createGameRenderer({
  ctx,
  baseCanvasWidth: BASE_CANVAS_WIDTH,
  baseCanvasHeight: BASE_CANVAS_HEIGHT,
  turnSmoothing: TURN_SMOOTHING,
});
const controls = gameControls?.createGameControls({
  simulation,
  constants,
  layout,
  state,
  appEl,
  hudToggleBtn,
  activeSessionId,
  settingsKey: SETTINGS_KEY,
  settingsDefaultsKey: SETTINGS_DEFAULTS_KEY,
  debugFlags,
  botStrategy,
  storage: window.localStorage,
  fitTableToWindow,
  buildSettingsPayloadFromConstants: () => settingsManager?.buildSettingsPayloadFromConstants(),
  getSavedOrDefaultSettings: () => settingsManager?.getSavedOrDefaultSettings(),
  getTimeScale: () => timeScale,
  setTimeScale: value => {
    timeScale = value;
  },
});
const selection = gameSelection?.createGameSelection({
  canvas,
  baseCanvasWidth: BASE_CANVAS_WIDTH,
  baseCanvasHeight: BASE_CANVAS_HEIGHT,
  state,
  getSelectionInfoEl: () => selectionInfoEl,
});
const matchUi = gameMatchUi?.createGameMatchUi({
  state,
  constants,
  simulation,
  getTickDelta: () => tickDelta,
  setTickDelta: value => {
    tickDelta = value;
  },
  getIsMatchPaused: () => isMatchPaused,
  setIsMatchPaused: value => {
    isMatchPaused = value;
  },
  getSuppressEndPauseUntilRestart: () => suppressEndPauseUntilRestart,
  setSuppressEndPauseUntilRestart: value => {
    suppressEndPauseUntilRestart = value;
  },
  clearSelection: () => selection?.clearSelection(),
  updateUpgradeHud,
  updateBalanceConfigHud,
  updateSelectionHud,
});
const battleTest = gameBattleTest?.createGameBattleTest({
  constants,
  createSimulation: window.createSimulation,
  buildMatchConfig: () => ({
    simOptions: {
      width: BASE_CANVAS_WIDTH,
      height: BASE_CANVAS_HEIGHT,
      towerAttackRate: constants.TOWER_ATTACK_RATE,
      towerDamage: constants.TOWER_DAMAGE,
      towerHp: constants.TOWER_HP,
      baseAttackRate: constants.BASE_ATTACK_RATE,
      baseDamage: constants.BASE_DAMAGE,
      baseHp: constants.BASE_HP,
      upgradeDamageBaseCost: constants.UPGRADE_DAMAGE_BASE_COST,
      upgradeHealthBaseCost: constants.UPGRADE_HEALTH_BASE_COST,
      upgradeSpawnBaseCost: constants.UPGRADE_SPAWN_BASE_COST,
      upgradeDamageCostGrowth: constants.UPGRADE_DAMAGE_COST_GROWTH,
      upgradeHealthCostGrowth: constants.UPGRADE_HEALTH_COST_GROWTH,
      upgradeSpawnCostGrowth: constants.UPGRADE_SPAWN_COST_GROWTH,
      upgradeDamageCostFormula: constants.UPGRADE_DAMAGE_COST_FORMULA,
      upgradeHealthCostFormula: constants.UPGRADE_HEALTH_COST_FORMULA,
      upgradeSpawnCostFormula: constants.UPGRADE_SPAWN_COST_FORMULA,
      structureDamageGraceSeconds: constants.STRUCTURE_DAMAGE_GRACE_TICKS / constants.TICK_RATE,
      baseDamageGraceSeconds: constants.BASE_DAMAGE_GRACE_TICKS / constants.TICK_RATE,
      towerDamagePerMinute: constants.TOWER_DAMAGE_PER_MINUTE,
      baseDamagePerMinute: constants.BASE_DAMAGE_PER_MINUTE,
      spawnIntervalSeconds: constants.SPAWN_INTERVAL_TICKS / constants.TICK_RATE,
      peonSpeed: constants.PEON_SPEED,
      peonHp: constants.PEON_HP,
      peonDamage: constants.PEON_DAMAGE,
      peonAttackRate: constants.PEON_ATTACK_RATE,
      spawnCount: constants.SPAWN_COUNT,
      baseGoldPerSecond: constants.BASE_GOLD_PER_SECOND,
      shrineGoldPerSecond: constants.SHRINE_GOLD_PER_SECOND,
    },
    economyOptions: {
      killBountyGold: constants.KILL_BOUNTY_GOLD,
      baseGoldPerSecond: constants.BASE_GOLD_PER_SECOND,
      shrineGoldPerSecond: constants.SHRINE_GOLD_PER_SECOND,
    },
    spawnLayout: {
      padding: constants.SPAWN_SLOT_PADDING,
      slotCount: constants.SPAWN_SLOT_COUNT,
    },
  }),
  getUpgradeTypeForStrategy: (strategy, snapshot) => botCore?.getUpgradeTypeForStrategy
    ? botCore.getUpgradeTypeForStrategy(strategy, snapshot)
    : null,
  documentRef: document,
  setTimeoutFn: callback => window.setTimeout(callback, 10),
});


let lastFrameTime = 0;
let tickDelta = 0;
let renderScaleX = 1;
let renderScaleY = 1;

window.legionDebug = {
  toggleVisionRanges() {
    debugFlags.showVisionRanges = !debugFlags.showVisionRanges;
    return debugFlags.showVisionRanges;
  },
  setShowVisionRanges(value) {
    debugFlags.showVisionRanges = Boolean(value);
    return debugFlags.showVisionRanges;
  },
  getFlags() {
    return { ...debugFlags };
  },
  setTimeScale(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return timeScale;
    }

    timeScale = Math.max(0, Math.min(4, parsed));
    return timeScale;
  },
  getTimeScale() {
    return timeScale;
  },
  setBotStrategy(side, strategy) {
    if ((side !== 'left' && side !== 'right') || !strategy) {
      return false;
    }

    botStrategy[side] = strategy;
    return true;
  },
  getBotStrategy() {
    return { ...botStrategy };
  },
  setSpawnLayout(padding, slotCount) {
    const result = simulation.setSpawnLayout({ padding, slotCount });
    updateBalanceConfigHud();
    return result;
  },
  setSpawnTiming(spawnIntervalSeconds) {
    const result = simulation.setSpawnTiming({ spawnIntervalSeconds });
    updateBalanceConfigHud();
    return result;
  },
  setPeonValues(peonSpeed, peonHp, peonDamage, peonAttackRate) {
    const result = simulation.setPeonValues({ peonSpeed, peonHp, peonDamage, peonAttackRate });
    updateUpgradeHud();
    updateBalanceConfigHud();
    return result;
  },
  setStructureDamageScaling(towerDamagePerMinute, baseDamagePerMinute) {
    const result = simulation.setStructureDamageScaling({
      towerDamagePerMinute,
      baseDamagePerMinute,
    });
    updateBalanceConfigHud();
    return result;
  },
  setStructureCombatValues(towerDamage, baseDamage, towerAttackRate, baseAttackRate) {
    const result = simulation.setStructureCombatValues({
      towerDamage,
      baseDamage,
      towerAttackRate,
      baseAttackRate,
    });
    updateUpgradeHud();
    updateBalanceConfigHud();
    return result;
  },
  setStructureVitalityValues(towerHp, baseHp) {
    const result = simulation.setStructureVitalityValues({ towerHp, baseHp });
    updateBalanceConfigHud();
    updateSelectionHud();
    return result;
  },
  setProtectionWindows(structureDamageGraceSeconds, baseDamageGraceSeconds) {
    const result = simulation.setProtectionWindows({
      structureDamageGraceSeconds,
      baseDamageGraceSeconds,
    });
    updateBalanceConfigHud();
    return result;
  },
  setEconomyValues(...args) {
    const payload = typeof args[0] === 'object' && args[0] !== null
      ? args[0]
      : {
          killBountyGold: args[0],
          baseGoldPerSecond: args[1],
          shrineGoldPerSecond: args[2],
          upgradeBaseCost: args[3],
          upgradeCostGrowth: args[4],
          upgradeDamageBaseCost: args[5],
          upgradeDamageCostGrowth: args[6],
          upgradeHealthBaseCost: args[7],
          upgradeHealthCostGrowth: args[8],
          upgradeSpawnBaseCost: args[9],
          upgradeSpawnCostGrowth: args[10],
          upgradeDamageCostFormula: args[11],
          upgradeHealthCostFormula: args[12],
          upgradeSpawnCostFormula: args[13],
        };
    const result = simulation.setEconomyValues(payload);
    updateUpgradeHud();
    updateBalanceConfigHud();
    return result;
  },
  getSpawnLayout() {
    return {
      padding: constants.SPAWN_SLOT_PADDING,
      slotCount: constants.SPAWN_SLOT_COUNT,
      slots: layout.spawnSlots.slice(),
    };
  },
  setDecisionLog(value) {
    simulation.setDecisionLogEnabled(Boolean(value));
    return Boolean(value);
  },
  clearDecisionLog() {
    simulation.clearDecisionLog();
    return true;
  },
  getDecisionLog(limit) {
    return simulation.getDecisionLog(limit);
  },
  dumpDecisionLog(limit = 150) {
    const rows = simulation.getDecisionLog(limit);
    console.table(rows);
    return rows.length;
  },
  dumpDecisionWindow(startSec, endSec, eventType = null) {
    const startTick = Math.floor(startSec * constants.TICK_RATE);
    const endTick = Math.floor(endSec * constants.TICK_RATE);
    const rows = simulation
      .getDecisionLog()
      .filter(entry => entry.tick >= startTick && entry.tick <= endTick)
      .filter(entry => (eventType ? entry.event === eventType : true));
    console.table(rows);
    return rows.length;
  },
  summarizeWindow(startSec, endSec) {
    const startTick = Math.floor(startSec * constants.TICK_RATE);
    const endTick = Math.floor(endSec * constants.TICK_RATE);
    const rows = simulation
      .getDecisionLog()
      .filter(entry => entry.event === 'tick-summary')
      .filter(entry => entry.tick >= startTick && entry.tick <= endTick);

    if (rows.length === 0) {
      return null;
    }

    const first = rows[0];
    const last = rows[rows.length - 1];
    const result = {
      startTick: first.tick,
      endTick: last.tick,
      startLeftPeons: first.leftPeons,
      startRightPeons: first.rightPeons,
      endLeftPeons: last.leftPeons,
      endRightPeons: last.rightPeons,
      leftHpLostDelta: last.leftHpLost - first.leftHpLost,
      rightHpLostDelta: last.rightHpLost - first.rightHpLost,
      leftGoldDelta: (last.leftGold ?? state.leftGold) - (first.leftGold ?? state.leftGold),
      rightGoldDelta: (last.rightGold ?? state.rightGold) - (first.rightGold ?? state.rightGold),
      shrineControl: last.shrineControl ?? state.shrineControl,
    };

    console.table([result]);
    return result;
  },
};

function downloadRunLogs() {
  const upgrades = simulation.getUpgradeSnapshot();
  const payload = {
    timestamp: new Date().toISOString(),
    version: GAME_VERSION,
    tickRate: constants.TICK_RATE,
    currentTick: state.gameTime,
    leftHpLost: state.leftHpLost,
    rightHpLost: state.rightHpLost,
    leftGold: state.leftGold,
    rightGold: state.rightGold,
    shrineControl: state.shrineControl,
    leftUpgrades: upgrades.left,
    rightUpgrades: upgrades.right,
    leftPeons: state.peons.filter(peon => peon.side === 'left').length,
    rightPeons: state.peons.filter(peon => peon.side === 'right').length,
    entries: simulation.getDecisionLog(),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `legion-run-log-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const downloadLogsButton = document.getElementById('downloadLogsBtn');
if (downloadLogsButton) {
  downloadLogsButton.addEventListener('click', downloadRunLogs);
}

const openTournamentButton = document.getElementById('openTournamentBtn');
if (openTournamentButton) {
  openTournamentButton.addEventListener('click', () => {
    window.location.href = 'tournament.html';
  });
}

function pauseForMatchEndIfNeeded() {
  matchUi?.pauseForMatchEndIfNeeded();
}

function restartMatch() {
  matchUi?.restartMatch();
}

function continueAfterMatchEnd() {
  matchUi?.continueAfterMatchEnd();
}

function setupMatchControls() {
  matchUi?.setupMatchControls();
}

window.addEventListener('keydown', event => {
  if (event.key.toLowerCase() === 'v') {
    debugFlags.showVisionRanges = !debugFlags.showVisionRanges;
  }
});

function fitTableToWindow() {
  const tableWrap = document.getElementById('tableWrap');
  if (!tableWrap) {
    return;
  }

  const bounds = tableWrap.getBoundingClientRect();
  const availableWidth = Math.max(200, bounds.width - 16);
  const availableHeight = Math.max(150, bounds.height - 16);

  const scale = Math.min(availableWidth / BASE_CANVAS_WIDTH, availableHeight / BASE_CANVAS_HEIGHT);
  const displayWidth = Math.max(1, Math.floor(BASE_CANVAS_WIDTH * scale));
  const displayHeight = Math.max(1, Math.floor(BASE_CANVAS_HEIGHT * scale));
  const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
  const backingWidth = Math.max(1, Math.round(displayWidth * devicePixelRatio));
  const backingHeight = Math.max(1, Math.round(displayHeight * devicePixelRatio));

  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;

  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }

  renderScaleX = backingWidth / BASE_CANVAS_WIDTH;
  renderScaleY = backingHeight / BASE_CANVAS_HEIGHT;
}

window.addEventListener('resize', fitTableToWindow);

function setupHudCollapseControls() {
  controls?.setupHudCollapseControls();
}

function setupUpgradeControls() {
  controls?.setupUpgradeControls();
}

function updateBalanceConfigHud() {
  controls?.updateBalanceConfigHud();
}

function setupDevControls() {
  controls?.setupDevControls();
}

function runBotPurchasesForTick() {
  botCore?.runBotPurchasesForTick({ simulation, state, constants, botStrategy });
}

function updateSelectionHud() {
  selection?.updateSelectionHud();
}

function updateUpgradeHud() {
  controls?.updateUpgradeHud();
}

function gameLoop(currentTime) {
  if (lastFrameTime === 0) {
    lastFrameTime = currentTime;
  }

  const deltaMs = currentTime - lastFrameTime;
  lastFrameTime = currentTime;
  const cappedDelta = Math.min(deltaMs, 100) * timeScale;
  tickDelta += cappedDelta;

  while (!isMatchPaused && tickDelta >= constants.TICK_DURATION) {
    simulation.tick();
    if (debugFlags.showDamageNumbers) {
      for (const popup of state.damagePopups) {
        damageNumberEffects.push({
          x: popup.x + (Math.random() - 0.5) * 8,
          y: popup.y,
          value: popup.amount,
          targetSide: popup.targetSide,
          age: 0,
        });
      }
    }
    runBotPurchasesForTick();
    pauseForMatchEndIfNeeded();
    tickDelta -= constants.TICK_DURATION;
  }

  updateUpgradeHud();
  updateBalanceConfigHud();
  updateSelectionHud();

  render();
  requestAnimationFrame(gameLoop);
}

/**
 * Render the current game state to canvas.
 */
function render() {
  if (!renderer) {
    return;
  }
  renderer.renderFrame({
    renderScaleX,
    renderScaleY,
    layout,
    state,
    constants,
    debugFlags,
    damageNumberEffects,
    timeScale,
    isMatchPaused,
  });
}

/**
 * Initialize and start the game.
 */
function init() {
  console.log(`Legion prototype initialized. Version: ${GAME_VERSION}`);
  console.log(`Game loop: ${constants.TICK_RATE} ticks/sec, ${constants.TICK_DURATION.toFixed(2)}ms per tick`);
  if (settingsManager?.shouldApplySessionSettings()) {
    settingsManager.ensureVersionDefaultsSaved();
    settingsManager.applyBaseSettings(initialSessionPayload.settingsSnapshot);
    console.log(`Loaded session payload: ${activeSessionId}`);
  } else {
    settingsManager?.applyBaseSettings();
    settingsManager?.ensureVersionDefaultsSaved();
  }
  simulation.setDecisionLogEnabled(true);
  selectionInfoEl = document.getElementById('selectionInfo');
  canvas.addEventListener('click', event => {
    selection?.handleCanvasClick(event);
  });
  setupHudCollapseControls();
  setupMatchControls();
  setupUpgradeControls();
  setupDevControls();
  battleTest?.setupBattleTestPanel();
  fitTableToWindow();
  requestAnimationFrame(gameLoop);
}

init();
