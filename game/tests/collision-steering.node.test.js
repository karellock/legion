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
  const peon = {
    id: nextId++,
    side,
    x,
    y,
    size,
    health: 100,
    target,
    velocityX: velocityX ?? (side === 'left' ? 50 : -50),
    isAlive() { return this.health > 0; },
  };
  return peon;
}

function makeGrid() {
  return createSpatialHashGrid({ cellSize: 32 });
}

function makeSteering(grid, opts = {}) {
  return createCollisionSteering(grid, opts);
}

// ─── resolveCollisions: no overlap ever ────────────────────────────────

runTest('same-side overlapping peons are pushed apart (Y only)', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid, { iterations: 3 });
  const path = createStraightLanePath(0, 800, 300);
  const a = makePeon('left', 200, 200);
  const b = makePeon('left', 200, 200);
  cs.rebuildGrid([a, b]);
  cs.resolveCollisions([a, b], path);
  // Should have separated along Y only (nx ≈ 0)
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const minDist = a.size * cs.config.collisionRadiusScale * 2;
  assert(dy >= minDist * 0.9, `should separate on Y: dy=${dy.toFixed(2)}`);
  // X should be almost unchanged (straight lane = Y-only separation)
  assert(dx < 1, `X should not change: dx=${dx.toFixed(4)}`);
});

runTest('opposite-side overlapping peons are pushed apart (Y only)', () => {
  // User wants NO visual overlap at all.
  const grid = makeGrid();
  const cs   = makeSteering(grid, { iterations: 3 });
  const path = createStraightLanePath(0, 800, 300);
  const a = makePeon('left',  200, 200);
  const b = makePeon('right', 200, 200);
  cs.rebuildGrid([a, b]);
  cs.resolveCollisions([a, b], path);
  const dy = Math.abs(a.y - b.y);
  const minDist = a.size * cs.config.collisionRadiusScale * 2;
  assert(dy >= minDist * 0.9, `opposite-side should separate on Y: dy=${dy.toFixed(2)}`);
});

runTest('separation is along Y axis only (straight lane)', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid, { iterations: 3 });
  const path = createStraightLanePath(0, 800, 300);
  // Place peons at same x, different y — separation should be pure Y
  const a = makePeon('left', 200, 200);
  const b = makePeon('left', 200, 210); // slightly offset in y
  const xBefore = [a.x, b.x];
  cs.rebuildGrid([a, b]);
  cs.resolveCollisions([a, b], path);
  // X positions should be unchanged (separation normal is pure Y)
  assertClose(a.x, xBefore[0], 'a.x should not change', 0.01);
  assertClose(b.x, xBefore[1], 'b.x should not change', 0.01);
});

runTest('peons far apart are not moved', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid);
  const path = createStraightLanePath(0, 800, 300);
  const a = makePeon('left', 100, 200);
  const b = makePeon('left', 400, 200);
  const ax0 = a.x, bx0 = b.x, ay0 = a.y, by0 = b.y;
  cs.rebuildGrid([a, b]);
  cs.resolveCollisions([a, b], path);
  assertClose(a.x, ax0, 'peon a x should not change', 0.001);
  assertClose(a.y, ay0, 'peon a y should not change', 0.001);
  assertClose(b.x, bx0, 'peon b x should not change', 0.001);
  assertClose(b.y, by0, 'peon b y should not change', 0.001);
});

runTest('three same-side peons all separate (Y only)', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid, { iterations: 5 });
  const path = createStraightLanePath(0, 800, 300);
  const peons = [
    makePeon('left', 200, 200),
    makePeon('left', 200, 200),
    makePeon('left', 200, 200),
  ];
  cs.rebuildGrid(peons);
  cs.resolveCollisions(peons, path);
  const minDist = peons[0].size * cs.config.collisionRadiusScale * 2;
  for (let i = 0; i < peons.length; i++) {
    for (let j = i + 1; j < peons.length; j++) {
      const dy = Math.abs(peons[i].y - peons[j].y);
      assert(dy >= minDist * 0.9, `peons ${i},${j}: dy=${dy.toFixed(2)} < minDist=${minDist.toFixed(2)}`);
    }
  }
});

runTest('dead peons are not pushed', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid);
  const path = createStraightLanePath(0, 800, 300);
  const alive = makePeon('left', 200, 200);
  const dead  = makePeon('left', 200, 200);
  dead.health = 0;
  const dx0 = dead.x, dy0 = dead.y;
  cs.rebuildGrid([alive, dead]);
  cs.resolveCollisions([alive, dead], path);
  assertClose(dead.x, dx0, 'dead peon x should not change', 0.001);
  assertClose(dead.y, dy0, 'dead peon y should not change', 0.001);
});

runTest('collision resolution is deterministic across two runs', () => {
  function runOnce(startId) {
    nextId = startId;
    const grid = makeGrid();
    const cs = makeSteering(grid, { iterations: 3 });
    const path = createStraightLanePath(0, 800, 300);
    const peons = [
      makePeon('left', 200, 200),
      makePeon('left', 201, 200),
      makePeon('left', 199, 201),
    ];
    cs.rebuildGrid(peons);
    cs.resolveCollisions(peons, path);
    return peons.map(p => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join('|');
  }
  const r1 = runOnce(1000);
  const r2 = runOnce(1000);
  assert(r1 === r2, `not deterministic:\n  run1: ${r1}\n  run2: ${r2}`);
});

// ─── Structure avoidance ──────────────────────────────────────────────

runTest('peon overlapping own base is pushed away', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid);
  const peon = makePeon('left', 100, 300);
  const base = { x: 100, y: 300, size: 30 };
  cs.applyStructureAvoidance([peon], [base]);
  const dx = peon.x - base.x;
  const dy = peon.y - base.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = base.size + peon.size * cs.config.collisionRadiusScale;
  assert(dist >= minDist * 0.99, `peon should be outside base`);
});

runTest('peon far from structure is not moved by avoidance', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid);
  const peon = makePeon('left', 400, 300);
  const base = { x: 100, y: 300, size: 30 };
  const x0 = peon.x, y0 = peon.y;
  cs.applyStructureAvoidance([peon], [base]);
  assertClose(peon.x, x0, 'x should not change', 0.001);
  assertClose(peon.y, y0, 'y should not change', 0.001);
});

// ─── Steering: SLIDE force ─────────────────────────────────────────

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
  cs.applySteeringForces([peon], path, 1 / 60);
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
  const peon = makePeon('left', 200, 200);
  peon.target = { x: 400, y: 200 };
  const nb = makePeon('right', 202, 200);
  cs.rebuildGrid([peon, nb]);
  const x0 = peon.x, y0 = peon.y;
  cs.applySteeringForces([peon], null, 1 / 60);
  assertClose(peon.x, x0, 'peon.x should not change', 0.001);
  assertClose(peon.y, y0, 'peon.y should not change', 0.001);
});

// ─── Lane boundary clamping ──────────────────────────────────────────

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

runTest('full tick clamps peons to lane boundaries', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid, { laneMinY: 50, laneMaxY: 550 });
  const path = createStraightLanePath(100, 700, 300);
  const peon = makePeon('left', 200, 10);
  cs.tick([peon], path, 1 / 60, null);
  assert(peon.y >= 50, `peon.y=${peon.y} should be >= laneMinY=50`);
  assert(peon.y <= 550, `peon.y=${peon.y} should be <= laneMaxY=550`);
});

// ─── Full tick integration ────────────────────────────────────────────

runTest('full tick does not throw and leaves peons alive', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid);
  const path = createStraightLanePath(100, 700, 300);
  const peons = [
    makePeon('left',  200, 300),
    makePeon('right', 500, 300),
    makePeon('left',  200, 305),
  ];
  cs.tick(peons, path, 1 / 60, null);
  for (const p of peons) {
    assert(p.isAlive(), 'all peons should still be alive after tick');
    assert(Number.isFinite(p.x) && Number.isFinite(p.y), `peon ${p.id} has NaN position`);
  }
});

runTest('full tick is deterministic', () => {
  function runOnce(startId) {
    nextId = startId;
    const grid = makeGrid();
    const cs   = makeSteering(grid);
    const path = createStraightLanePath(100, 700, 300);
    const peons = [
      makePeon('left',  200, 300),
      makePeon('right', 210, 300),
      makePeon('left',  205, 305),
    ];
    cs.tick(peons, path, 1 / 60, null);
    return peons.map(p => `${p.x.toFixed(5)},${p.y.toFixed(5)}`).join('|');
  }
  const r1 = runOnce(500);
  const r2 = runOnce(500);
  assert(r1 === r2, `full tick not deterministic:\n  ${r1}\n  ${r2}`);
});

runTest('no peons overlap after full tick', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid);
  const path = createStraightLanePath(100, 700, 300);
  const peons = [
    makePeon('left',  200, 300),
    makePeon('right', 210, 300),
    makePeon('left',  205, 305),
    makePeon('right', 215, 302),
  ];
  cs.tick(peons, path, 1 / 60, null);
  const minDist = peons[0].size * cs.config.collisionRadiusScale * 2;
  for (let i = 0; i < peons.length; i++) {
    for (let j = i + 1; j < peons.length; j++) {
      const dx = peons[i].x - peons[j].x;
      const dy = peons[i].y - peons[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      assert(dist >= minDist * 0.95, `peons ${i},${j} overlap: dist=${dist.toFixed(2)} < ${minDist.toFixed(2)}`);
    }
  }
});
