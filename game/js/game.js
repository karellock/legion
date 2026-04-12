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
let timeScale = 1;
let selectionInfoEl = null;
let matchResultPanelEl = null;
let matchResultTitleEl = null;
let matchResultSummaryEl = null;
let matchResultStatsEl = null;
let isMatchPaused = false;
let suppressEndPauseUntilRestart = false;
const activeSessionId = sessionEntry?.sessionId || null;

const appEl = document.getElementById('app');
const hudToggleBtn = document.getElementById('hudToggleBtn');
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
  buildSettingsPayloadFromConstants,
  getSavedOrDefaultSettings,
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


let lastFrameTime = 0;
let tickDelta = 0;
let renderScaleX = 1;
let renderScaleY = 1;

function buildSettingsPayloadFromConstants() {
  return {
    spawnPadding: constants.SPAWN_SLOT_PADDING,
    spawnSlotCount: constants.SPAWN_SLOT_COUNT,
    spawnIntervalSeconds: constants.SPAWN_INTERVAL_TICKS / constants.TICK_RATE,
    peonSpeed: constants.PEON_SPEED,
    peonHp: constants.PEON_HP,
    peonDamage: constants.PEON_DAMAGE,
    peonAttackRate: constants.PEON_ATTACK_RATE,
    towerDamagePerMinute: constants.TOWER_DAMAGE_PER_MINUTE,
    baseDamagePerMinute: constants.BASE_DAMAGE_PER_MINUTE,
    towerDamage: constants.TOWER_DAMAGE,
    baseDamage: constants.BASE_DAMAGE,
    towerAttackRate: constants.TOWER_ATTACK_RATE,
    baseAttackRate: constants.BASE_ATTACK_RATE,
    structureGraceSeconds: constants.STRUCTURE_DAMAGE_GRACE_TICKS / constants.TICK_RATE,
    baseGraceSeconds: constants.BASE_DAMAGE_GRACE_TICKS / constants.TICK_RATE,
    upgradeDamageBaseCost: constants.UPGRADE_DAMAGE_BASE_COST,
    upgradeDamageCostGrowth: constants.UPGRADE_DAMAGE_COST_GROWTH,
    upgradeDamageCostFormula: constants.UPGRADE_DAMAGE_COST_FORMULA,
    upgradeHealthBaseCost: constants.UPGRADE_HEALTH_BASE_COST,
    upgradeHealthCostGrowth: constants.UPGRADE_HEALTH_COST_GROWTH,
    upgradeHealthCostFormula: constants.UPGRADE_HEALTH_COST_FORMULA,
    upgradeSpawnBaseCost: constants.UPGRADE_SPAWN_BASE_COST,
    upgradeSpawnCostGrowth: constants.UPGRADE_SPAWN_COST_GROWTH,
    upgradeSpawnCostFormula: constants.UPGRADE_SPAWN_COST_FORMULA,
    killBountyGold: constants.KILL_BOUNTY_GOLD,
    shrineGoldPerSecond: constants.SHRINE_GOLD_PER_SECOND,
  };
}

function parseStoredSettings(rawValue) {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function ensureVersionDefaultsSaved() {
  if (localStorage.getItem(SETTINGS_DEFAULTS_KEY)) {
    return;
  }

  const savedSettings = parseStoredSettings(localStorage.getItem(SETTINGS_KEY));
  const defaults = savedSettings || buildSettingsPayloadFromConstants();
  localStorage.setItem(SETTINGS_DEFAULTS_KEY, JSON.stringify(defaults));
}

function getSavedOrDefaultSettings() {
  const savedSettings = parseStoredSettings(localStorage.getItem(SETTINGS_KEY));
  if (savedSettings) {
    return savedSettings;
  }

  return parseStoredSettings(localStorage.getItem(SETTINGS_DEFAULTS_KEY));
}

function applyBaseSettings(settings = BASE_SETTINGS) {
  simulation.setSpawnLayout({
    padding: settings.spawnPadding,
    slotCount: settings.spawnSlotCount,
  });
  simulation.setSpawnTiming({
    spawnIntervalSeconds: settings.spawnIntervalSeconds,
  });
  simulation.setPeonValues({
    peonSpeed: settings.peonSpeed,
    peonHp: settings.peonHp,
    peonDamage: settings.peonDamage,
    peonAttackRate: settings.peonAttackRate,
  });
  simulation.setStructureDamageScaling({
    towerDamagePerMinute: settings.towerDamagePerMinute,
    baseDamagePerMinute: settings.baseDamagePerMinute,
  });
  simulation.setStructureCombatValues({
    towerDamage: settings.towerDamage,
    baseDamage: settings.baseDamage,
    towerAttackRate: settings.towerAttackRate,
    baseAttackRate: settings.baseAttackRate,
  });
  simulation.setProtectionWindows({
    structureDamageGraceSeconds: settings.structureGraceSeconds,
    baseDamageGraceSeconds: settings.baseGraceSeconds,
  });
  simulation.setEconomyValues({
    upgradeDamageBaseCost: settings.upgradeDamageBaseCost,
    upgradeDamageCostGrowth: settings.upgradeDamageCostGrowth,
    upgradeDamageCostFormula: settings.upgradeDamageCostFormula,
    upgradeHealthBaseCost: settings.upgradeHealthBaseCost,
    upgradeHealthCostGrowth: settings.upgradeHealthCostGrowth,
    upgradeHealthCostFormula: settings.upgradeHealthCostFormula,
    upgradeSpawnBaseCost: settings.upgradeSpawnBaseCost,
    upgradeSpawnCostGrowth: settings.upgradeSpawnCostGrowth,
    upgradeSpawnCostFormula: settings.upgradeSpawnCostFormula,
    killBountyGold: settings.killBountyGold,
    shrineGoldPerSecond: settings.shrineGoldPerSecond,
  });
}

function shouldApplySessionSettings() {
  return Boolean(initialSessionPayload && initialSessionPayload.settingsSnapshot && typeof initialSessionPayload.settingsSnapshot === 'object');
}

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
          shrineGoldPerSecond: args[1],
          upgradeBaseCost: args[2],
          upgradeCostGrowth: args[3],
          upgradeDamageBaseCost: args[4],
          upgradeDamageCostGrowth: args[5],
          upgradeHealthBaseCost: args[6],
          upgradeHealthCostGrowth: args[7],
          upgradeSpawnBaseCost: args[8],
          upgradeSpawnCostGrowth: args[9],
          upgradeDamageCostFormula: args[10],
          upgradeHealthCostFormula: args[11],
          upgradeSpawnCostFormula: args[12],
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

function getMatchOutcome() {
  const leftDestroyed = state.leftBase?.isDestroyed();
  const rightDestroyed = state.rightBase?.isDestroyed();

  if (!leftDestroyed && !rightDestroyed) {
    return null;
  }

  if (leftDestroyed && rightDestroyed) {
    return { winner: 'draw' };
  }

  return {
    winner: leftDestroyed ? 'right' : 'left',
  };
}

function formatTimeFromTick(gameTick) {
  const totalSeconds = Math.floor(gameTick / constants.TICK_RATE);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function renderMatchResultPanel(outcome) {
  if (!matchResultPanelEl || !matchResultTitleEl || !matchResultSummaryEl || !matchResultStatsEl || !outcome) {
    return;
  }

  if (outcome.winner === 'draw') {
    matchResultTitleEl.textContent = 'Match Paused: Draw';
    matchResultSummaryEl.textContent = 'Both bases were destroyed.';
  } else {
    const winnerName = outcome.winner === 'left' ? 'Blue' : 'Red';
    matchResultTitleEl.textContent = `Match Paused: ${winnerName} Wins`;
    matchResultSummaryEl.textContent = `${winnerName} destroyed the enemy base.`;
  }

  const upgradeSnapshot = simulation.getUpgradeSnapshot();
  const leftPeons = state.peons.filter(peon => peon.side === 'left' && peon.isAlive()).length;
  const rightPeons = state.peons.filter(peon => peon.side === 'right' && peon.isAlive()).length;

  matchResultStatsEl.innerHTML = [
    `<strong>Time:</strong> ${formatTimeFromTick(state.gameTime)}`,
    `<strong>Base HP:</strong> Blue ${Math.max(0, state.leftBase.health)} / Red ${Math.max(0, state.rightBase.health)}`,
    `<strong>Tower HP:</strong> Blue ${Math.max(0, state.leftTower.health)} / Red ${Math.max(0, state.rightTower.health)}`,
    `<strong>HP Lost:</strong> Blue ${state.leftHpLost} / Red ${state.rightHpLost}`,
    `<strong>Gold:</strong> Blue ${state.leftGold} / Red ${state.rightGold}`,
    `<strong>Total Gold Earned:</strong> Blue ${state.leftTotalGold} / Red ${state.rightTotalGold}`,
    `<strong>Alive Peons:</strong> Blue ${leftPeons} / Red ${rightPeons}`,
    `<strong>Upgrades:</strong> Blue D${upgradeSnapshot.left.damageLevel} H${upgradeSnapshot.left.healthLevel} S${upgradeSnapshot.left.spawnLevel} | Red D${upgradeSnapshot.right.damageLevel} H${upgradeSnapshot.right.healthLevel} S${upgradeSnapshot.right.spawnLevel}`,
  ].join('<br>');

  matchResultPanelEl.hidden = false;
}

function pauseForMatchEndIfNeeded() {
  if (suppressEndPauseUntilRestart || isMatchPaused) {
    return;
  }

  const outcome = getMatchOutcome();
  if (!outcome) {
    return;
  }

  isMatchPaused = true;
  renderMatchResultPanel(outcome);
}

function restartMatch() {
  simulation.initEntities();
  tickDelta = 0;
  isMatchPaused = false;
  suppressEndPauseUntilRestart = false;
  selection?.clearSelection();
  if (matchResultPanelEl) {
    matchResultPanelEl.hidden = true;
  }
  updateUpgradeHud();
  updateBalanceConfigHud();
  updateSelectionHud();
}

function continueAfterMatchEnd() {
  isMatchPaused = false;
  suppressEndPauseUntilRestart = true;
  if (matchResultPanelEl) {
    matchResultPanelEl.hidden = true;
  }
}

function setupMatchControls() {
  const restartMatchButton = document.getElementById('restartMatchBtn');
  const continueAfterEndButton = document.getElementById('continueAfterEndBtn');
  const restartAfterEndButton = document.getElementById('restartAfterEndBtn');
  matchResultPanelEl = document.getElementById('matchResultPanel');
  matchResultTitleEl = document.getElementById('matchResultTitle');
  matchResultSummaryEl = document.getElementById('matchResultSummary');
  matchResultStatsEl = document.getElementById('matchResultStats');

  if (restartMatchButton) {
    restartMatchButton.addEventListener('click', restartMatch);
  }

  if (continueAfterEndButton) {
    continueAfterEndButton.addEventListener('click', continueAfterMatchEnd);
  }

  if (restartAfterEndButton) {
    restartAfterEndButton.addEventListener('click', restartMatch);
  }
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

function getUpgradeTypeForStrategy(strategy, snapshot) {
  if (botCore?.getUpgradeTypeForStrategy) {
    return botCore.getUpgradeTypeForStrategy(strategy, snapshot);
  }

  if (strategy === 'damage-only') return 'damage';
  if (strategy === 'health-only') return 'health';
  if (strategy === 'spawn-only') return 'spawn';

  if (strategy === 'balanced') {
    const levels = [
      { type: 'damage', level: snapshot.damageLevel },
      { type: 'health', level: snapshot.healthLevel },
      { type: 'spawn', level: snapshot.spawnLevel },
    ];
    levels.sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return a.type.localeCompare(b.type);
    });
    return levels[0].type;
  }

  if (strategy === 'damage-health') return snapshot.damageLevel <= snapshot.healthLevel ? 'damage' : 'health';
  if (strategy === 'damage-spawn') return snapshot.damageLevel <= snapshot.spawnLevel ? 'damage' : 'spawn';
  if (strategy === 'health-spawn') return snapshot.healthLevel <= snapshot.spawnLevel ? 'health' : 'spawn';

  return null;
}

function nextUpgradeTypeForBot(side) {
  if (botCore?.nextUpgradeTypeForBot) {
    return botCore.nextUpgradeTypeForBot(simulation, side, botStrategy);
  }

  const snapshot = simulation.getUpgradeSnapshot()[side];
  return getUpgradeTypeForStrategy(botStrategy[side], snapshot);
}

function runBotPurchasesForTick() {
  if (botCore?.runBotPurchasesForTick) {
    botCore.runBotPurchasesForTick({ simulation, state, constants, botStrategy });
    return;
  }

  if (state.gameTime % constants.TICK_RATE !== 0) {
    return;
  }

  for (const side of ['left', 'right']) {
    const type = nextUpgradeTypeForBot(side);
    if (!type) {
      continue;
    }

    simulation.buyUpgrade(side, type);
  }
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

function getCurrentSimOptions() {
  return {
    width: BASE_CANVAS_WIDTH,
    height: BASE_CANVAS_HEIGHT,
    towerAttackRate: constants.TOWER_ATTACK_RATE,
    towerDamage: constants.TOWER_DAMAGE,
    baseAttackRate: constants.BASE_ATTACK_RATE,
    baseDamage: constants.BASE_DAMAGE,
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
  };
}

function runBattleTests({ leftStrategy, rightStrategy, matchCount }) {
  const opts = getCurrentSimOptions();
  const maxTicksPerMatch = constants.TICK_RATE * 60 * 10;
  let leftWins = 0;
  let rightWins = 0;
  let draws = 0;
  let timeouts = 0;
  let totalTicks = 0;

  for (let m = 0; m < matchCount; m++) {
    const sim = createSimulation(opts);
    sim.setEconomyValues({
      killBountyGold: constants.KILL_BOUNTY_GOLD,
      shrineGoldPerSecond: constants.SHRINE_GOLD_PER_SECOND,
    });
    sim.setSpawnLayout({
      padding: constants.SPAWN_SLOT_PADDING,
      slotCount: constants.SPAWN_SLOT_COUNT,
    });

    const { state: s, constants: c, getUpgradeSnapshot, buyUpgrade, tick } = sim;
    let ended = false;

    for (let t = 1; t <= maxTicksPerMatch; t++) {
      tick();

      if (t % c.TICK_RATE === 0) {
        for (const side of ['left', 'right']) {
          const strategy = side === 'left' ? leftStrategy : rightStrategy;
          const type = getUpgradeTypeForStrategy(strategy, getUpgradeSnapshot()[side]);
          if (type) {
            buyUpgrade(side, type);
          }
        }
      }

      if (s.leftBase.isDestroyed() || s.rightBase.isDestroyed()) {
        totalTicks += t;
        if (s.leftBase.isDestroyed() && s.rightBase.isDestroyed()) {
          draws++;
        } else if (s.leftBase.isDestroyed()) {
          rightWins++;
        } else {
          leftWins++;
        }
        ended = true;
        break;
      }
    }

    if (!ended) {
      timeouts++;
      totalTicks += maxTicksPerMatch;
    }
  }

  return { leftWins, rightWins, draws, timeouts, matchCount, totalTicks };
}

function setupBattleTestPanel() {
  const runBtn = document.getElementById('runBattleTestBtn');
  const testLeftStrategyEl = document.getElementById('testLeftStrategy');
  const testRightStrategyEl = document.getElementById('testRightStrategy');
  const testMatchCountEl = document.getElementById('testMatchCount');
  const testResultsEl = document.getElementById('battleTestResults');

  if (!runBtn || !testResultsEl) {
    return;
  }

  runBtn.addEventListener('click', () => {
    const leftStrategy = testLeftStrategyEl ? testLeftStrategyEl.value : 'none';
    const rightStrategy = testRightStrategyEl ? testRightStrategyEl.value : 'none';
    const matchCount = Math.max(1, Math.min(100, Number(testMatchCountEl?.value ?? 30)));

    runBtn.disabled = true;
    runBtn.textContent = 'Running…';

    setTimeout(() => {
      const r = runBattleTests({ leftStrategy, rightStrategy, matchCount });
      const avgSeconds = (r.totalTicks / r.matchCount / constants.TICK_RATE).toFixed(1);
      const pct = n => `${((n / r.matchCount) * 100).toFixed(0)}%`;
      const timeoutNote = r.timeouts > 0 ? ` (${r.timeouts} timeout)` : '';

      testResultsEl.innerHTML = [
        `<strong>${r.matchCount} matches — ${leftStrategy} vs ${rightStrategy}</strong>`,
        `Blue wins: ${r.leftWins} (${pct(r.leftWins)})`,
        `Red  wins: ${r.rightWins} (${pct(r.rightWins)})`,
        `Draws: ${r.draws} (${pct(r.draws)})${timeoutNote}`,
        `Avg match: ${avgSeconds}s`,
      ].join('<br>');

      runBtn.disabled = false;
      runBtn.textContent = 'Run Tests';
    }, 10);
  });
}

/**
 * Initialize and start the game.
 */
function init() {
  console.log(`Legion prototype initialized. Version: ${GAME_VERSION}`);
  console.log(`Game loop: ${constants.TICK_RATE} ticks/sec, ${constants.TICK_DURATION.toFixed(2)}ms per tick`);
  if (shouldApplySessionSettings()) {
    ensureVersionDefaultsSaved();
    applyBaseSettings(initialSessionPayload.settingsSnapshot);
    console.log(`Loaded session payload: ${activeSessionId}`);
  } else {
    applyBaseSettings();
    ensureVersionDefaultsSaved();
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
  setupBattleTestPanel();
  fitTableToWindow();
  requestAnimationFrame(gameLoop);
}

init();
