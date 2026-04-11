const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const simulation = window.createSimulation({
  width: canvas.width,
  height: canvas.height,
  structureDamageGraceSeconds: 120,
  baseDamageGraceSeconds: 300,
});
const { constants, layout, state } = simulation;
const GAME_VERSION = '0.0.1';
const BASE_CANVAS_WIDTH = canvas.width;
const BASE_CANVAS_HEIGHT = canvas.height;
const TURN_SMOOTHING = 0.22;
const debugFlags = {
  showVisionRanges: false,
};
const upgradeButtons = [];
const upgradeSummaryEls = {
  left: null,
  right: null,
};
const botStrategy = {
  left: 'none',
  right: 'none',
};
let timeScale = 1;
let selectedEntityRef = null;
let selectionInfoEl = null;

const appEl = document.getElementById('app');
const hudToggleBtn = document.getElementById('hudToggleBtn');
const smoothedAngles = new WeakMap();


let lastFrameTime = 0;
let tickDelta = 0;

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
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return timeScale;
    }

    timeScale = Math.max(0.25, Math.min(4, parsed));
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
  canvas.style.width = `${Math.floor(BASE_CANVAS_WIDTH * scale)}px`;
  canvas.style.height = `${Math.floor(BASE_CANVAS_HEIGHT * scale)}px`;
}

window.addEventListener('resize', fitTableToWindow);

function setupHudCollapseControls() {
  if (!hudToggleBtn || !appEl) {
    return;
  }

  const syncToggleLabel = () => {
    const isCollapsed = appEl.classList.contains('app--hud-collapsed');
    hudToggleBtn.textContent = isCollapsed ? 'Show' : 'Hide';
    hudToggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
    hudToggleBtn.setAttribute('title', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
    hudToggleBtn.setAttribute('aria-label', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
  };

  hudToggleBtn.addEventListener('click', () => {
    appEl.classList.toggle('app--hud-collapsed');
    syncToggleLabel();
    fitTableToWindow();
    setTimeout(fitTableToWindow, 220);
  });

  syncToggleLabel();
}

function formatUpgradeButtonLabel(type, cost) {
  if (type === 'damage') {
    return `Damage +5 (${cost}g)`;
  }

  if (type === 'health') {
    return `Health +50 (${cost}g)`;
  }

  return `Spawn +1 (${cost}g)`;
}

function setupUpgradeControls() {
  const defs = [
    { id: 'leftUpgradeDamageBtn', side: 'left', type: 'damage' },
    { id: 'leftUpgradeHealthBtn', side: 'left', type: 'health' },
    { id: 'leftUpgradeSpawnBtn', side: 'left', type: 'spawn' },
    { id: 'rightUpgradeDamageBtn', side: 'right', type: 'damage' },
    { id: 'rightUpgradeHealthBtn', side: 'right', type: 'health' },
    { id: 'rightUpgradeSpawnBtn', side: 'right', type: 'spawn' },
  ];

  for (const def of defs) {
    const button = document.getElementById(def.id);
    if (!button) {
      continue;
    }

    button.addEventListener('click', () => {
      simulation.buyUpgrade(def.side, def.type);
      updateUpgradeHud();
    });

    upgradeButtons.push({ ...def, button });
  }

  upgradeSummaryEls.left = document.getElementById('leftUpgradeSummary');
  upgradeSummaryEls.right = document.getElementById('rightUpgradeSummary');
  updateUpgradeHud();
}

function setupDevControls() {
  const timeScaleRange = document.getElementById('timeScaleRange');
  const timeScaleValue = document.getElementById('timeScaleValue');
  const leftBotSelect = document.getElementById('leftBotStrategy');
  const rightBotSelect = document.getElementById('rightBotStrategy');
  selectionInfoEl = document.getElementById('selectionInfo');

  if (timeScaleRange && timeScaleValue) {
    const syncTimeScaleLabel = () => {
      timeScaleValue.textContent = `${timeScale.toFixed(2)}x`;
    };

    timeScaleRange.addEventListener('input', event => {
      const nextScale = Number(event.target.value);
      if (Number.isFinite(nextScale) && nextScale > 0) {
        timeScale = nextScale;
      }
      syncTimeScaleLabel();
    });

    syncTimeScaleLabel();
  }

  if (leftBotSelect) {
    leftBotSelect.addEventListener('change', event => {
      botStrategy.left = event.target.value;
    });
  }

  if (rightBotSelect) {
    rightBotSelect.addEventListener('change', event => {
      botStrategy.right = event.target.value;
    });
  }

  canvas.addEventListener('click', event => {
    selectedEntityRef = pickEntityFromCanvasClick(event);
    updateSelectionHud();
  });
}

function nextUpgradeTypeForBot(side) {
  const strategy = botStrategy[side];
  const snapshot = simulation.getUpgradeSnapshot()[side];

  if (strategy === 'damage-only') {
    return 'damage';
  }

  if (strategy === 'health-only') {
    return 'health';
  }

  if (strategy === 'spawn-only') {
    return 'spawn';
  }

  if (strategy === 'balanced') {
    const levels = [
      { type: 'damage', level: snapshot.damageLevel },
      { type: 'health', level: snapshot.healthLevel },
      { type: 'spawn', level: snapshot.spawnLevel },
    ];

    levels.sort((a, b) => {
      if (a.level !== b.level) {
        return a.level - b.level;
      }

      return a.type.localeCompare(b.type);
    });

    return levels[0].type;
  }

  return null;
}

function runBotPurchasesForTick() {
  // Run bots at 1 Hz to keep behavior readable while still deterministic by tick.
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

function pickEntityFromCanvasClick(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  const candidates = [];

  for (const peon of state.peons) {
    if (!peon.isAlive()) {
      continue;
    }

    const dx = x - peon.x;
    const dy = y - peon.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance <= peon.size + 4) {
      candidates.push({ type: 'peon', entity: peon, distance });
    }
  }

  const towerHitPadding = 6;
  for (const tower of [state.leftTower, state.rightTower]) {
    if (tower.isDestroyed()) {
      continue;
    }

    const halfW = tower.width / 2 + towerHitPadding;
    const halfH = tower.height / 2 + towerHitPadding;
    if (x >= tower.x - halfW && x <= tower.x + halfW && y >= tower.y - halfH && y <= tower.y + halfH) {
      const dx = x - tower.x;
      const dy = y - tower.y;
      candidates.push({ type: 'tower', entity: tower, distance: Math.sqrt(dx * dx + dy * dy) });
    }
  }

  for (const base of [state.leftBase, state.rightBase]) {
    if (base.isDestroyed()) {
      continue;
    }

    const dx = x - base.x;
    const dy = y - base.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance <= base.size + 6) {
      candidates.push({ type: 'base', entity: base, distance });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0];
}

function updateSelectionHud() {
  if (!selectionInfoEl) {
    return;
  }

  if (!selectedEntityRef) {
    selectionInfoEl.textContent = 'Click a unit or structure to inspect stats.';
    return;
  }

  const { type, entity } = selectedEntityRef;
  if (!entity) {
    selectionInfoEl.textContent = 'Selection unavailable.';
    return;
  }

  if (type === 'peon' && !entity.isAlive()) {
    selectionInfoEl.textContent = 'Selected peon died.';
    return;
  }

  if ((type === 'tower' || type === 'base') && entity.isDestroyed()) {
    selectionInfoEl.textContent = `Selected ${type} is destroyed.`;
    return;
  }

  const hp = `${entity.health}/${entity.maxHealth}`;
  const dmg = Number.isFinite(entity.damage) ? entity.damage : '-';
  const range = Number.isFinite(entity.attackRange) ? entity.attackRange : '-';
  const side = entity.side ?? '-';
  const id = Number.isFinite(entity.id) ? entity.id : '-';
  selectionInfoEl.textContent = `${type.toUpperCase()} #${id} | side ${side} | HP ${hp} | DMG ${dmg} | RNG ${range}`;
}

function updateUpgradeHud() {
  const snapshot = simulation.getUpgradeSnapshot();

  if (upgradeSummaryEls.left) {
    upgradeSummaryEls.left.textContent = `Gold ${state.leftGold} | D${snapshot.left.damageLevel} H${snapshot.left.healthLevel} S${snapshot.left.spawnLevel}`;
  }

  if (upgradeSummaryEls.right) {
    upgradeSummaryEls.right.textContent = `Gold ${state.rightGold} | D${snapshot.right.damageLevel} H${snapshot.right.healthLevel} S${snapshot.right.spawnLevel}`;
  }

  for (const entry of upgradeButtons) {
    const sideSnapshot = snapshot[entry.side];
    const costKey = entry.type === 'damage'
      ? 'nextDamageCost'
      : entry.type === 'health'
        ? 'nextHealthCost'
        : 'nextSpawnCost';
    const cost = sideSnapshot[costKey];
    const currentGold = entry.side === 'left' ? state.leftGold : state.rightGold;
    entry.button.textContent = formatUpgradeButtonLabel(entry.type, cost);
    entry.button.disabled = currentGold < cost;
  }
}

function gameLoop(currentTime) {
  if (lastFrameTime === 0) {
    lastFrameTime = currentTime;
  }

  const deltaMs = currentTime - lastFrameTime;
  lastFrameTime = currentTime;
  const cappedDelta = Math.min(deltaMs, 100) * timeScale;
  tickDelta += cappedDelta;

  while (tickDelta >= constants.TICK_DURATION) {
    simulation.tick();
    runBotPurchasesForTick();
    tickDelta -= constants.TICK_DURATION;
  }

  updateUpgradeHud();
  updateSelectionHud();

  render();
  requestAnimationFrame(gameLoop);
}

/**
 * Render the current game state to canvas.
 */
function render() {
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawLane();

  if (debugFlags.showVisionRanges) {
    drawVisionRanges();
  }

  drawBase(state.leftBase);
  drawBase(state.rightBase);
  drawTower(state.leftTower);
  drawTower(state.rightTower);
  drawStructureAttackBeam(state.leftBase);
  drawStructureAttackBeam(state.rightBase);
  drawStructureAttackBeam(state.leftTower);
  drawStructureAttackBeam(state.rightTower);

  for (const peon of state.peons) {
    drawPeon(peon);
  }

  drawSlashEffects();

  drawDebugText();
}

/**
 * Draw the lane area.
 */
function drawLane() {
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(layout.laneLeft, layout.laneTop, layout.laneRight - layout.laneLeft, layout.laneBottom - layout.laneTop);

  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(layout.laneCenter, layout.laneTop);
  ctx.lineTo(layout.laneCenter, layout.laneBottom);
  ctx.stroke();

  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.strokeRect(layout.laneLeft, layout.laneTop, layout.laneRight - layout.laneLeft, layout.laneBottom - layout.laneTop);
}

function drawVisionCircle(entity) {
  if (entity.isDestroyed && entity.isDestroyed()) {
    return;
  }

  if (!entity.isAlive && entity.health <= 0) {
    return;
  }

  const fillColor = entity.side === 'left' ? 'rgba(100, 170, 255, 0.06)' : 'rgba(255, 120, 120, 0.06)';
  const strokeColor = entity.side === 'left' ? 'rgba(100, 170, 255, 0.18)' : 'rgba(255, 120, 120, 0.18)';

  ctx.fillStyle = fillColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(entity.x, entity.y, entity.visionRange, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawVisionRanges() {
  drawVisionCircle(state.leftBase);
  drawVisionCircle(state.rightBase);
  drawVisionCircle(state.leftTower);
  drawVisionCircle(state.rightTower);

  for (const peon of state.peons) {
    drawVisionCircle(peon);
  }
}

function getHitFlashStrength(entity) {
  const remaining = entity.hitFlashTicks || 0;
  const max = Math.max(1, entity.hitFlashMaxTicks || 1);
  const hold = Math.max(0, entity.hitFlashHoldTicks || 0);
  const fadeTicks = Math.max(1, max - hold);

  if (remaining <= 0) {
    return 0;
  }

  if (remaining > fadeTicks) {
    return 1;
  }

  return Math.max(0, Math.min(1, remaining / fadeTicks));
}

function getSidePalette(side, flash = 0) {
  if (side === 'left') {
    return {
      top: `hsl(204, ${88 - flash * 12}%, ${64 + flash * 12}%)`,
      bottom: `hsl(214, ${72 - flash * 10}%, ${36 + flash * 10}%)`,
      border: `hsla(200, 90%, ${86 + flash * 8}%, 0.95)`,
      accent: `hsla(190, 95%, ${84 + flash * 10}%, 0.95)`,
      shadow: `rgba(36, 115, 255, ${0.24 + flash * 0.12})`,
      glow: `rgba(118, 194, 255, ${0.25 + flash * 0.2})`,
    };
  }

  return {
    top: `hsl(10, ${90 - flash * 12}%, ${66 + flash * 12}%)`,
    bottom: `hsl(0, ${76 - flash * 10}%, ${38 + flash * 10}%)`,
    border: `hsla(12, 92%, ${86 + flash * 8}%, 0.95)`,
    accent: `hsla(34, 98%, ${82 + flash * 10}%, 0.95)`,
    shadow: `rgba(255, 84, 84, ${0.24 + flash * 0.12})`,
    glow: `rgba(255, 173, 125, ${0.25 + flash * 0.2})`,
  };
}

function roundedRectPath(x, y, width, height, radius) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

function fillRoundedRect(x, y, width, height, radius, fillStyle) {
  roundedRectPath(x, y, width, height, radius);
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function strokeRoundedRect(x, y, width, height, radius, strokeStyle, lineWidth = 1) {
  roundedRectPath(x, y, width, height, radius);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function createVerticalGradient(x, y, width, height, topColor, bottomColor) {
  const gradient = ctx.createLinearGradient(x, y, x, y + height);
  gradient.addColorStop(0, topColor);
  gradient.addColorStop(1, bottomColor);
  return gradient;
}

function getEntityFacingAngle(entity) {
  if (entity && entity.target && Number.isFinite(entity.target.x) && Number.isFinite(entity.target.y)) {
    return Math.atan2(entity.target.y - entity.y, entity.target.x - entity.x);
  }

  if (entity && Number.isFinite(entity.lastShotX) && Number.isFinite(entity.lastShotY)) {
    return Math.atan2(entity.lastShotY - entity.y, entity.lastShotX - entity.x);
  }

  if (entity && Number.isFinite(entity.velocityX) && entity.velocityX !== 0) {
    return entity.velocityX > 0 ? 0 : Math.PI;
  }

  return entity?.side === 'left' ? 0 : Math.PI;
}

function normalizeRadians(angle) {
  let normalized = angle;
  while (normalized > Math.PI) {
    normalized -= Math.PI * 2;
  }
  while (normalized < -Math.PI) {
    normalized += Math.PI * 2;
  }
  return normalized;
}

function getSmoothedFacingAngle(entity) {
  const desired = getEntityFacingAngle(entity);
  const previous = smoothedAngles.has(entity) ? smoothedAngles.get(entity) : desired;
  const delta = normalizeRadians(desired - previous);
  const next = previous + delta * TURN_SMOOTHING;
  smoothedAngles.set(entity, next);
  return next;
}

/**
 * Draw a base (circle).
 */
function drawBase(base) {
  if (base.isDestroyed()) {
    return;
  }

  const healthPercent = base.health / base.maxHealth;
  const flash = getHitFlashStrength(base);
  const palette = getSidePalette(base.side, flash);
  const shellSize = base.size * 1.55;
  const shellX = base.x - shellSize / 2;
  const shellY = base.y - shellSize / 2;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.beginPath();
  ctx.ellipse(base.x, base.y + base.size * 0.9, base.size * 0.95, base.size * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = 18;
  fillRoundedRect(
    shellX,
    shellY,
    shellSize,
    shellSize,
    14,
    createVerticalGradient(shellX, shellY, shellSize, shellSize, palette.top, palette.bottom)
  );
  ctx.shadowBlur = 0;

  strokeRoundedRect(shellX, shellY, shellSize, shellSize, 14, palette.border, 2);

  fillRoundedRect(shellX + 5, shellY + 5, shellSize - 10, 8, 4, 'rgba(255, 255, 255, 0.18)');
  fillRoundedRect(shellX + 6, shellY + shellSize - 14, shellSize - 12, 8, 4, 'rgba(0, 0, 0, 0.18)');

  const coreRadius = base.size * 0.38;
  const coreGradient = ctx.createRadialGradient(
    base.x - coreRadius * 0.35,
    base.y - coreRadius * 0.35,
    coreRadius * 0.15,
    base.x,
    base.y,
    coreRadius
  );
  coreGradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  coreGradient.addColorStop(0.45, palette.accent);
  coreGradient.addColorStop(1, 'rgba(255, 255, 255, 0.12)');

  ctx.fillStyle = coreGradient;
  ctx.beginPath();
  ctx.arc(base.x, base.y, coreRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(base.x, base.y, coreRadius, 0, Math.PI * 2);
  ctx.stroke();

  const facing = getSmoothedFacingAngle(base);
  ctx.save();
  ctx.translate(base.x, base.y);
  ctx.rotate(facing);
  fillRoundedRect(coreRadius * 0.08, -coreRadius * 0.17, coreRadius * 0.95, coreRadius * 0.34, 3, 'rgba(255, 255, 255, 0.82)');
  ctx.beginPath();
  ctx.moveTo(coreRadius * 1.08, 0);
  ctx.lineTo(coreRadius * 1.38, -coreRadius * 0.21);
  ctx.lineTo(coreRadius * 1.38, coreRadius * 0.21);
  ctx.closePath();
  ctx.fillStyle = palette.accent;
  ctx.fill();
  ctx.restore();

  const barWidth = 60;
  const barHeight = 6;
  ctx.fillStyle = '#333';
  ctx.fillRect(base.x - barWidth / 2, base.y + base.size + 10, barWidth, barHeight);
  ctx.fillStyle = healthPercent > 0.75 ? '#0f0' : healthPercent > 0.5 ? '#ff0' : '#f00';
  ctx.fillRect(base.x - barWidth / 2, base.y + base.size + 10, barWidth * healthPercent, barHeight);

  ctx.fillStyle = '#fff';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${base.health}/${base.maxHealth}`, base.x, base.y + base.size + 30);
  ctx.textAlign = 'left';
}

/**
 * Draw a tower (rectangle).
 */
function drawTower(tower) {
  if (tower.isDestroyed()) {
    return;
  }

  const healthPercent = tower.health / tower.maxHealth;
  const flash = getHitFlashStrength(tower);
  const palette = getSidePalette(tower.side, flash);
  const shellWidth = tower.width + 12;
  const shellHeight = tower.height + 8;
  const shellX = tower.x - shellWidth / 2;
  const shellY = tower.y - shellHeight / 2;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.beginPath();
  ctx.ellipse(tower.x, tower.y + tower.height / 2 + 7, shellWidth * 0.62, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = 14;
  fillRoundedRect(
    shellX,
    shellY,
    shellWidth,
    shellHeight,
    8,
    createVerticalGradient(shellX, shellY, shellWidth, shellHeight, palette.top, palette.bottom)
  );
  ctx.shadowBlur = 0;

  strokeRoundedRect(shellX, shellY, shellWidth, shellHeight, 8, palette.border, 2);
  fillRoundedRect(shellX + 4, shellY + 4, shellWidth - 8, 7, 4, 'rgba(255, 255, 255, 0.18)');
  fillRoundedRect(shellX + 4, tower.y - 4, shellWidth - 8, 8, 4, 'rgba(255, 255, 255, 0.14)');
  fillRoundedRect(shellX + 4, shellY + shellHeight - 11, shellWidth - 8, 7, 4, 'rgba(0, 0, 0, 0.16)');

  const facing = getSmoothedFacingAngle(tower);
  ctx.save();
  ctx.translate(tower.x, tower.y - 4);
  ctx.rotate(facing);
  fillRoundedRect(-5, -6, 10, 12, 4, palette.accent);
  fillRoundedRect(0, -2, 18, 4, 2, 'rgba(255, 255, 255, 0.78)');
  ctx.restore();

  fillRoundedRect(tower.x - 7, tower.y + tower.height / 2 - 10, 14, 8, 3, 'rgba(24, 24, 24, 0.45)');

  const barWidth = 40;
  const barHeight = 4;
  ctx.fillStyle = '#333';
  ctx.fillRect(tower.x - barWidth / 2, tower.y - tower.height / 2 - 10, barWidth, barHeight);
  ctx.fillStyle = healthPercent > 0.75 ? '#0f0' : healthPercent > 0.5 ? '#ff0' : '#f00';
  ctx.fillRect(tower.x - barWidth / 2, tower.y - tower.height / 2 - 10, barWidth * healthPercent, barHeight);
}

/**
 * Draw a peon unit.
 */
function drawPeon(peon) {
  if (!peon.isAlive()) {
    return;
  }

  const healthPercent = peon.health / peon.maxHealth;
  const flash = getHitFlashStrength(peon);
  const palette = getSidePalette(peon.side, flash);
  const bodyWidth = peon.size * 2.25;
  const bodyHeight = peon.size * 1.55;
  const badgeRadius = peon.size * 0.92;
  const facing = getSmoothedFacingAngle(peon);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.beginPath();
  ctx.ellipse(peon.x, peon.y + peon.size + 1.5, peon.size * 0.9, peon.size * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(peon.x, peon.y);
  ctx.rotate(facing);

  const bodyX = -bodyWidth / 2;
  const bodyY = -bodyHeight / 2;

  ctx.shadowColor = palette.glow;
  ctx.shadowBlur = 10;
  fillRoundedRect(
    bodyX,
    bodyY,
    bodyWidth,
    bodyHeight,
    bodyHeight / 2,
    createVerticalGradient(bodyX, bodyY, bodyWidth, bodyHeight, palette.top, palette.bottom)
  );
  ctx.shadowBlur = 0;

  strokeRoundedRect(bodyX, bodyY, bodyWidth, bodyHeight, bodyHeight / 2, palette.border, 1.2);
  fillRoundedRect(bodyX + 1.5, bodyY + 1.5, bodyWidth - 3, 2.6, 1.3, 'rgba(255, 255, 255, 0.26)');

  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.arc(0, 0, badgeRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, badgeRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.84)';
  ctx.beginPath();
  ctx.arc(-badgeRadius * 0.22, -badgeRadius * 0.26, badgeRadius * 0.26, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(20, 28, 36, 0.55)';
  fillRoundedRect(-3.6, 1.4, 7.2, 2.4, 1.2, 'rgba(20, 28, 36, 0.55)');

  ctx.fillStyle = healthPercent > 0.5 ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 235, 140, 0.95)';
  ctx.beginPath();
  ctx.moveTo(peon.size + 0.5, 0);
  ctx.lineTo(peon.size + 4, -2.5);
  ctx.lineTo(peon.size + 4, 2.5);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawStructureAttackBeam(structure) {
  if (structure.shotFlashTicks <= 0 || structure.lastShotX === null || structure.lastShotY === null) {
    return;
  }

  const alpha = Math.min(1, 0.45 + structure.shotFlashTicks * 0.12);

  ctx.strokeStyle = `rgba(255, 90, 90, ${alpha})`;
  ctx.lineWidth = 3.5;
  ctx.shadowColor = `rgba(255, 90, 90, ${Math.min(1, alpha + 0.1)})`;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(structure.x, structure.y);
  ctx.lineTo(structure.lastShotX, structure.lastShotY);
  ctx.stroke();

  // Bright core to make the beam pop on dark backgrounds.
  ctx.strokeStyle = `rgba(255, 220, 220, ${Math.min(1, alpha + 0.15)})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(structure.x, structure.y);
  ctx.lineTo(structure.lastShotX, structure.lastShotY);
  ctx.stroke();

  // Impact spark at target point.
  ctx.fillStyle = `rgba(255, 230, 200, ${Math.min(1, alpha + 0.2)})`;
  ctx.beginPath();
  ctx.arc(structure.lastShotX, structure.lastShotY, 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
}

function drawSlashEffects() {
  for (const slash of state.slashEffects) {
    const alpha = slash.ttl / slash.maxTtl;
    const color = slash.side === 'left'
      ? `rgba(170, 220, 255, ${0.95 * alpha})`
      : `rgba(255, 190, 165, ${0.95 * alpha})`;

    const x1 = slash.fromX;
    const y1 = slash.fromY;
    const x2 = slash.toX;
    const y2 = slash.toY;
    const progress = 1 - alpha;
    const headX = x1 + (x2 - x1) * progress;
    const headY = y1 + (y2 - y1) * progress;

    ctx.strokeStyle = color;
    ctx.lineWidth = 3.2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Bright moving head to show direction from attacker to target.
    ctx.strokeStyle = `rgba(255, 245, 245, ${0.7 * alpha})`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(headX, headY);
    ctx.stroke();

    ctx.fillStyle = `rgba(255, 245, 245, ${0.85 * alpha})`;
    ctx.beginPath();
    ctx.arc(headX, headY, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
  }
}

/**
 * Draw debug text overlay.
 */
function drawDebugText() {
  ctx.fillStyle = '#0f0';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`Tick: ${state.gameTime} (${(state.gameTime / constants.TICK_RATE).toFixed(1)}s)`, 8, 16);
  
  const leftBaseHp = state.leftBase.isDestroyed() ? 'DESTROYED' : state.leftBase.health;
  const rightBaseHp = state.rightBase.isDestroyed() ? 'DESTROYED' : state.rightBase.health;
  const leftPeons = state.peons.filter(peon => peon.side === 'left').length;
  const rightPeons = state.peons.filter(peon => peon.side === 'right').length;
  
  ctx.fillText(`Left Base: ${leftBaseHp} | Tower: ${state.leftTower.isDestroyed() ? 'X' : state.leftTower.health}`, 8, 32);
  ctx.fillText(`Right Base: ${rightBaseHp} | Tower: ${state.rightTower.isDestroyed() ? 'X' : state.rightTower.health}`, 8, 48);
  ctx.fillText(`Peons L/R: ${leftPeons}/${rightPeons} (Total: ${state.peons.length})`, 8, 64);
  ctx.fillText(`Gold L/R: ${state.leftGold}/${state.rightGold} | Shrine: ${state.shrineControl}`, 8, 80);
  ctx.fillText(`Vision: ${debugFlags.showVisionRanges ? 'ON' : 'OFF'} (press V)`, 8, 96);

  // Right-side combat telemetry for balancing/debugging.
  ctx.textAlign = 'right';
  ctx.fillText(`Blue HP lost: ${state.leftHpLost}`, canvas.width - 8, 16);
  ctx.fillText(`Red HP lost: ${state.rightHpLost}`, canvas.width - 8, 32);
  ctx.textAlign = 'left';
}

/**
 * Initialize and start the game.
 */
function init() {
  console.log(`Legion prototype initialized. Version: ${GAME_VERSION}`);
  console.log(`Game loop: ${constants.TICK_RATE} ticks/sec, ${constants.TICK_DURATION.toFixed(2)}ms per tick`);
  simulation.setDecisionLogEnabled(true);
  setupHudCollapseControls();
  setupUpgradeControls();
  setupDevControls();
  fitTableToWindow();
  requestAnimationFrame(gameLoop);
}

init();
