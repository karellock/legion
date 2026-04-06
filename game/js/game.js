const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const simulation = window.createSimulation({ width: canvas.width, height: canvas.height });
const { constants, layout, state } = simulation;
const GAME_VERSION = '0.0.1';
const BASE_CANVAS_WIDTH = canvas.width;
const BASE_CANVAS_HEIGHT = canvas.height;
const debugFlags = {
  showVisionRanges: false,
};

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
};

window.addEventListener('keydown', event => {
  if (event.key.toLowerCase() === 'v') {
    debugFlags.showVisionRanges = !debugFlags.showVisionRanges;
  }
});

function fitTableToWindow() {
  const hud = document.getElementById('hud');
  const horizontalPadding = 24; // app padding + border breathing room
  const verticalPadding = 24;
  const hudHeight = hud ? hud.offsetHeight : 0;
  const availableWidth = Math.max(200, window.innerWidth - horizontalPadding);
  const availableHeight = Math.max(150, window.innerHeight - hudHeight - verticalPadding);

  const scale = Math.min(availableWidth / BASE_CANVAS_WIDTH, availableHeight / BASE_CANVAS_HEIGHT);
  canvas.style.width = `${Math.floor(BASE_CANVAS_WIDTH * scale)}px`;
  canvas.style.height = `${Math.floor(BASE_CANVAS_HEIGHT * scale)}px`;
}

window.addEventListener('resize', fitTableToWindow);

function gameLoop(currentTime) {
  if (lastFrameTime === 0) {
    lastFrameTime = currentTime;
  }

  const deltaMs = currentTime - lastFrameTime;
  lastFrameTime = currentTime;
  const cappedDelta = Math.min(deltaMs, 100);
  tickDelta += cappedDelta;

  while (tickDelta >= constants.TICK_DURATION) {
    simulation.tick();
    tickDelta -= constants.TICK_DURATION;
  }

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

/**
 * Draw a base (circle).
 */
function drawBase(base) {
  if (base.isDestroyed()) {
    return;
  }

  const healthPercent = base.health / base.maxHealth;
  const hue = base.side === 'left' ? 200 : 0;

  ctx.fillStyle = `hsl(${hue}, 100%, ${30 + healthPercent * 40}%)`;
  ctx.beginPath();
  ctx.arc(base.x, base.y, base.size, 0, Math.PI * 2);
  ctx.fill();

  const barWidth = 60;
  const barHeight = 6;
  ctx.fillStyle = '#333';
  ctx.fillRect(base.x - barWidth / 2, base.y + base.size + 10, barWidth, barHeight);
  ctx.fillStyle = healthPercent > 0.5 ? '#0f0' : healthPercent > 0.25 ? '#ff0' : '#f00';
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
  const hue = tower.side === 'left' ? 200 : 0;

  ctx.fillStyle = `hsl(${hue}, 100%, ${30 + healthPercent * 40}%)`;
  ctx.fillRect(
    tower.x - tower.width / 2,
    tower.y - tower.height / 2,
    tower.width,
    tower.height
  );

  const barWidth = 40;
  const barHeight = 4;
  ctx.fillStyle = '#333';
  ctx.fillRect(tower.x - barWidth / 2, tower.y - tower.height / 2 - 10, barWidth, barHeight);
  ctx.fillStyle = healthPercent > 0.5 ? '#0f0' : healthPercent > 0.25 ? '#ff0' : '#f00';
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
  const hue = peon.side === 'left' ? 200 : 0;

  ctx.fillStyle = `hsl(${hue}, 100%, ${50 + healthPercent * 30}%)`;
  ctx.beginPath();
  ctx.arc(peon.x, peon.y, peon.size, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = healthPercent < 0.5 ? '#ff0' : '#fff';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawStructureAttackBeam(structure) {
  if (!structure.lastShotTarget || structure.shotFlashTicks <= 0) {
    return;
  }

  if (typeof structure.lastShotTarget.isAlive === 'function' && !structure.lastShotTarget.isAlive()) {
    return;
  }

  const alpha = Math.min(1, 0.45 + structure.shotFlashTicks * 0.12);

  ctx.strokeStyle = `rgba(255, 90, 90, ${alpha})`;
  ctx.lineWidth = 3.5;
  ctx.shadowColor = `rgba(255, 90, 90, ${Math.min(1, alpha + 0.1)})`;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(structure.x, structure.y);
  ctx.lineTo(structure.lastShotTarget.x, structure.lastShotTarget.y);
  ctx.stroke();

  // Bright core to make the beam pop on dark backgrounds.
  ctx.strokeStyle = `rgba(255, 220, 220, ${Math.min(1, alpha + 0.15)})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(structure.x, structure.y);
  ctx.lineTo(structure.lastShotTarget.x, structure.lastShotTarget.y);
  ctx.stroke();

  // Impact spark at target point.
  ctx.fillStyle = `rgba(255, 230, 200, ${Math.min(1, alpha + 0.2)})`;
  ctx.beginPath();
  ctx.arc(structure.lastShotTarget.x, structure.lastShotTarget.y, 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
}

function drawSlashEffects() {
  for (const slash of state.slashEffects) {
    const alpha = slash.ttl / slash.maxTtl;
    const color = slash.side === 'left'
      ? `rgba(170, 220, 255, ${0.95 * alpha})`
      : `rgba(255, 190, 165, ${0.95 * alpha})`;

    const length = 13;
    const dx = Math.cos(slash.angle + Math.PI / 2) * length;
    const dy = Math.sin(slash.angle + Math.PI / 2) * length;

    ctx.strokeStyle = color;
    ctx.lineWidth = 3.2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(slash.x - dx, slash.y - dy);
    ctx.lineTo(slash.x + dx, slash.y + dy);
    ctx.stroke();

    // Crisp inner edge for readability.
    ctx.strokeStyle = `rgba(255, 245, 245, ${0.7 * alpha})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(slash.x - dx * 0.75, slash.y - dy * 0.75);
    ctx.lineTo(slash.x + dx * 0.75, slash.y + dy * 0.75);
    ctx.stroke();

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
  
  ctx.fillText(`Left Base: ${leftBaseHp} | Tower: ${state.leftTower.isDestroyed() ? 'X' : state.leftTower.health}`, 8, 32);
  ctx.fillText(`Right Base: ${rightBaseHp} | Tower: ${state.rightTower.isDestroyed() ? 'X' : state.rightTower.health}`, 8, 48);
  ctx.fillText(`Peons: ${state.peons.length}`, 8, 64);
  ctx.fillText(`Vision: ${debugFlags.showVisionRanges ? 'ON' : 'OFF'} (press V)`, 8, 80);
}

/**
 * Initialize and start the game.
 */
function init() {
  console.log(`Legion prototype initialized. Version: ${GAME_VERSION}`);
  console.log(`Game loop: ${constants.TICK_RATE} ticks/sec, ${constants.TICK_DURATION.toFixed(2)}ms per tick`);
  fitTableToWindow();
  requestAnimationFrame(gameLoop);
}

init();
