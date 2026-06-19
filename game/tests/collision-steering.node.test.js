const { createSpatialHashGrid } = require('../js/spatial-hash-grid.js');
const { createLanePath, createStraightLanePath } = require('../js/lane-path.js');
const { createCollisionSteering } = require('../js/collision-steering.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertClose(a, b, message, eps = 0.01) {
  if (Math.abs(a - b) > eps) throw new Error(`${message} — expected ~${b}, got ${a}`);
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

let nextId = 1;
function makePeon(side, x, y, { size = 6, velocityX = null, target = null } = {}) {
  return {
    id: nextId++,
    side,
    x,
    y,
    size,
    isAlive: () => true,
    velocityX: velocityX !== null ? velocityX : (side === 'left' ? 50 : -50),
    target,
    attackRange: 25,
  };
}

function makeGrid() {
  return createSpatialHashGrid(800, 600, 50);
}

function makeSteering(grid, opts = {}) {
  return createCollisionSteering(grid, opts);
}

function makeStructure(x, y, size = 30) {
  return { x, y, size };
}

// ── Collision resolution ─────────────────────────────────────────────

runTest('same-side overlapping peons are pushed apart (Y only)', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid);
  const path = createStraightLanePath(0, 800, 300);
  nextId = 1;
  const a = makePeon('left', 200, 300);
  const b = makePeon('left', 200, 305);
  cs.rebuildGrid([a, b]);
  cs.resolveCollisions([a, b], path);
  assert(Math.abs(a.y - b.y) >= (a.size + b.size) * 1.8 * 0.9, 'peons should be separated along Y');
});

runTest('opposite-side overlapping peons are pushed apart (Y only)', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid);
  const path = createStraightLanePath(0, 800, 300);
  nextId = 1;
  const a = makePeon('left', 200, 300);
  const b = makePeon('right', 200, 305);
  cs.rebuildGrid([a, b]);
  cs.resolveCollisions([a, b], path);
  assert(Math.abs(a.y - b.y) >= (a.size + b.size) * 1.8 * 0.9, 'peons should be separated along Y');
});

runTest('separation is along Y axis only (straight lane)', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid);
  const path = createStraightLanePath(0, 800, 300);
  nextId = 1;
  const a = makePeon('left', 200, 300);
  const b = makePeon('left', 200, 312);
  const x0a = a.x, x0b = b.x;
  cs.rebuildGrid([a, b]);
  cs.resolveCollisions([a, b], path);
  assertClose(a.x, x0a, 'a.x should not change (Y-only separation)', 0.001);
  assertClose(b.x, x0b, 'b.x should not change (Y-only separation)', 0.001);
});

runTest('peons far apart are not moved', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid);
  const path = createStraightLanePath(0, 800, 300);
  nextId = 1;
  const a = makePeon('left', 200, 300);
  const b = makePeon('left', 500, 400);
  const x0a = a.x, y0a = a.y;
  const x0b = b.x, y0b = b.y;
  cs.rebuildGrid([a, b]);
  cs.resolveCollisions([a, b], path);
  assertClose(a.x, x0a, 'a should not move', 0.001);
  assertClose(a.y, y0a, 'a should not move', 0.001);
  assertClose(b.x, x0b, 'b should not move', 0.001);
  assertClose(b.y, y0b, 'b should not move', 0.001);
});

runTest('three same-side peons all separate (Y only)', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid);
  const path = createStraightLanePath(0, 800, 300);
  nextId = 1;
  const a = makePeon('left', 200, 300);
  const b = makePeon('left', 200, 310);
  const c = makePeon('left', 200, 320);
  cs.rebuildGrid([a, b, c]);
  cs.resolveCollisions([a, b, c], path);
  assert(Math.abs(a.y - b.y) >= (a.size + b.size) * 1.8 * 0.9, 'a,b should separate');
  assert(Math.abs(b.y - c.y) >= (b.size + c.size) * 1.8 * 0.9, 'b,c should separate');
});

runTest('dead peons are not pushed', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid);
  const path = createStraightLanePath(0, 800, 300);
  nextId = 1;
  const a = makePeon('left', 200, 300);
  const b = makePeon('left', 200, 305);
  b.isAlive = () => false;
  const x0 = b.x, y0 = b.y;
  cs.rebuildGrid([a, b]);
  cs.resolveCollisions([a, b], path);
  assertClose(b.x, x0, 'dead peon should not move', 0.001);
  assertClose(b.y, y0, 'dead peon should not move', 0.001);
});

runTest('collision resolution is deterministic across two runs', () => {
  const run = () => {
    const grid = makeGrid();
    const cs   = makeSteering(grid);
    const path = createStraightLanePath(0, 800, 300);
    nextId = 1;
    const a = makePeon('left', 200, 300);
    const b = makePeon('left', 200, 305);
    cs.rebuildGrid([a, b]);
    cs.resolveCollisions([a, b], path);
    return { ax: a.x, ay: a.y, bx: b.x, by: b.y };
  };
  const r1 = run();
  const r2 = run();
  assert(r1.ax === r2.ax && r1.ay === r2.ay && r1.bx === r2.bx && r1.by === r2.by, 'should be deterministic');
});

// ── Structure avoidance (now part of steering) ─────────────────────

runTest('peon slides laterally when blocked by own structure', () => {
  const grid = makeGrid();
  // slideStrength=25: visibly slower than forward speed (50)
  const cs   = makeSteering(grid, { slideStrength: 25, slideLookAhead: 14 });
  const path = createStraightLanePath(0, 800, 300);
  nextId = 2; // even id → perpSign = +1
  const structure = makeStructure(130, 300, 30);
  nextId = 1;
  const peon = makePeon('left', 100, 300);
  peon.target = null;
  cs.rebuildGrid([peon]);
  const y0 = peon.y;
  // Pass structuresBySide to tick (which calls applySteeringForces)
  cs.tick([peon], path, 1 / 60, { left: [structure], right: [] });
  assert(peon.y !== y0, `peon should have slid laterally, y unchanged at ${y0}`);
});

runTest('peon far from structure is not moved by steering', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid);
  const path = createStraightLanePath(0, 800, 300);
  const structure = makeStructure(130, 300, 30);
  nextId = 1;
  const peon = makePeon('left', 400, 300);
  peon.target = null;
  cs.rebuildGrid([peon]);
  const x0 = peon.x, y0 = peon.y;
  cs.tick([peon], path, 1 / 60, { left: [structure], right: [] });
  assertClose(peon.x, x0, 'x should not change', 0.001);
  assertClose(peon.y, y0, 'y should not change', 0.001);
});

// ── Steering: SLIDE force ───────────────────────────────────────

runTest('slide force moves peon laterally when blocked ahead by friendly', () => {
  const grid = makeGrid();
  // slideStrength=25: visibly slower than forward speed (50)
  const cs   = makeSteering(grid, { slideStrength: 25, slideLookAhead: 14 });
  const path = createStraightLanePath(0, 800, 300);
  nextId = 2; // even id → perpSign = +1
  const blocker = makePeon('left', 220, 300);
  nextId = 1;
  const peon = makePeon('left', 200, 300);
  peon.target = null;
  cs.rebuildGrid([peon, blocker]);
  const y0 = peon.y;
  cs.applySteeringForces([peon], path, 1 / 60, null);
  assert(peon.y !== y0, `peon should have moved laterally, y unchanged at ${y0}`);
});

runTest('slide displacement is smaller than forward walk per tick', () => {
  // Verify slideStrength=25 gives ~0.42 px/tick, walk gives ~0.83 px/tick
  const grid = makeGrid();
  const cs   = makeSteering(grid, { slideStrength: 25, slideLookAhead: 14 });
  const path = createStraightLanePath(0, 800, 300);
  nextId = 2;
  const blocker = makePeon('left', 220, 300);
  nextId = 1;
  const peon = makePeon('left', 200, 300);
  peon.target = null;
  cs.rebuildGrid([peon, blocker]);
  const y0 = peon.y;
  cs.applySteeringForces([peon], path, 1 / 60);
  const slideDelta = Math.abs(peon.y - y0);
  // slideDelta = 25/60 ≈ 0.42; walk per tick = 50/60 ≈ 0.83
  assert(slideDelta < 1.0, `slide (${slideDelta.toFixed(2)} px/tick) should be < forward walk (~0.83)`);
});

runTest('peons with a target set are not moved by steering', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid);
  const path = createStraightLanePath(0, 800, 300);
  nextId = 1;
  const peon = makePeon('left', 200, 300);
  peon.target = { x: 400, y: 300 };
  const x0 = peon.x, y0 = peon.y;
  cs.applySteeringForces([peon], path, 1 / 60, null);
  assertClose(peon.x, x0, 'x should not change when target set', 0.001);
  assertClose(peon.y, y0, 'y should not change when target set', 0.001);
});

// ── Lane boundary clamping ──────────────────────────────────────

runTest('clampToLaneBounds clamps peon above lane top', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid, { laneMinY: 50, laneMaxY: 550 });
  const peon = makePeon('left', 200, 10);
  cs.clampToLaneBounds([peon]);
  assertClose(peon.y, 50, 'peon.y should be clamped to laneMinY=50');
});

runTest('clampToLaneBounds clamps peon below lane bottom', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid, { laneMinY: 50, laneMaxY: 550 });
  const peon = makePeon('left', 200, 600);
  cs.clampToLaneBounds([peon]);
  assertClose(peon.y, 550, 'peon.y should be clamped to laneMaxY=550');
});

runTest('clampToLaneBounds does not move peon inside lane', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid, { laneMinY: 50, laneMaxY: 550 });
  const peon = makePeon('left', 200, 300);
  const y0 = peon.y;
  cs.clampToLaneBounds([peon]);
  assertClose(peon.y, y0, 'peon.y should not change', 0.001);
});

// ── Full tick ────────────────────────────────────────────────

runTest('full tick clamps peons to lane boundaries', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid, { laneMinY: 50, laneMaxY: 550 });
  const path = createStraightLanePath(100, 700, 300);
  const peon = makePeon('left', 200, 10);
  cs.tick([peon], path, 1 / 60, null);
  assert(peon.y >= 50, `peon.y=${peon.y} should be >= laneMinY=50`);
  assert(peon.y <= 550, `peon.y=${peon.y} should be <= laneMaxY=550`);
});

runTest('full tick does not throw and leaves peons alive', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid);
  const path = createStraightLanePath(0, 800, 300);
  nextId = 1;
  const peons = [makePeon('left', 200, 300), makePeon('right', 600, 300)];
  cs.tick(peons, path, 1 / 60, null);
  assert(peons[0].isAlive(), 'left peon should be alive');
  assert(peons[1].isAlive(), 'right peon should be alive');
});

runTest('full tick is deterministic', () => {
  const run = () => {
    const grid = makeGrid();
    const cs   = makeSteering(grid);
    const path = createStraightLanePath(0, 800, 300);
    nextId = 1;
    const peons = [makePeon('left', 200, 300), makePeon('right', 600, 300)];
    cs.tick(peons, path, 1 / 60, null);
    return { lx: peons[0].x, ly: peons[0].y, rx: peons[1].x, ry: peons[1].y };
  };
  const r1 = run();
  const r2 = run();
  assert(r1.lx === r2.lx && r1.ly === r2.ly && r1.rx === r2.rx && r1.ry === r2.ry, 'should be deterministic');
});

runTest('no peons overlap after full tick', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid);
  const path = createStraightLanePath(0, 800, 300);
  nextId = 1;
  const peons = [
    makePeon('left', 200, 300),
    makePeon('left', 200, 305),
    makePeon('right', 600, 300),
  ];
  cs.tick(peons, path, 1 / 60, null);
  for (let i = 0; i < peons.length; i++) {
    for (let j = i + 1; j < peons.length; j++) {
      const dx = peons[i].x - peons[j].x;
      const dy = peons[i].y - peons[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = (peons[i].size + peons[j].size) * 1.8;
      assert(dist >= minDist * 0.99, `peons ${i},${j} overlap: dist=${dist.toFixed(2)} min=${minDist.toFixed(2)}`);
    }
  }
});
