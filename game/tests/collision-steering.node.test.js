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

// Minimal peon factory matching what simulation.js provides.
let nextId = 1;
function makePeon(side, x, y, { size = 6, velocityX = null } = {}) {
  return {
    id: nextId++,
    side,
    x,
    y,
    size,
    health: 100,
    target: null,
    velocityX: velocityX ?? (side === 'left' ? 50 : -50),
    isAlive() { return this.health > 0; },
  };
}

function makeGrid() {
  return createSpatialHashGrid({ cellSize: 32 });
}

function makeSteering(grid, opts = {}) {
  return createCollisionSteering(grid, opts);
}

// ─── resolveCollisions: basic separation ─────────────────────────────────────

runTest('two overlapping peons are pushed apart', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid, { iterations: 3 });
  // Place two peons at literally the same spot.
  const a = makePeon('left',  200, 200);
  const b = makePeon('right', 200, 200);
  cs.rebuildGrid([a, b]);
  cs.resolveCollisions([a, b]);
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = a.size * cs.config.collisionRadiusScale * 2;
  assert(dist >= minDist * 0.98, `dist ${dist.toFixed(2)} should be >= minDist ${minDist.toFixed(2)}`);
});

runTest('peons that are already far apart are not moved', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid);
  const a = makePeon('left',  100, 200);
  const b = makePeon('left',  400, 200);
  const ax0 = a.x, bx0 = b.x;
  cs.rebuildGrid([a, b]);
  cs.resolveCollisions([a, b]);
  assertClose(a.x, ax0, 'peon a should not move', 0.001);
  assertClose(b.x, bx0, 'peon b should not move', 0.001);
});

runTest('three peons in a pile all separate', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid, { iterations: 5 });
  const peons = [
    makePeon('left',  200, 200),
    makePeon('right', 200, 200),
    makePeon('left',  200, 200),
  ];
  cs.rebuildGrid(peons);
  cs.resolveCollisions(peons);
  const minDist = peons[0].size * cs.config.collisionRadiusScale * 2;
  for (let i = 0; i < peons.length; i++) {
    for (let j = i + 1; j < peons.length; j++) {
      const dx = peons[i].x - peons[j].x;
      const dy = peons[i].y - peons[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      assert(dist >= minDist * 0.9, `peons ${i} and ${j}: dist ${dist.toFixed(2)} < minDist ${minDist.toFixed(2)}`);
    }
  }
});

runTest('dead peons are not pushed', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid);
  const alive = makePeon('left', 200, 200);
  const dead  = makePeon('left', 200, 200);
  dead.health = 0;
  const dx0 = dead.x, dy0 = dead.y;
  cs.rebuildGrid([alive, dead]);
  cs.resolveCollisions([alive, dead]);
  // Dead peon was never inserted into grid so was never pushed.
  assertClose(dead.x, dx0, 'dead peon x should not change', 0.001);
  assertClose(dead.y, dy0, 'dead peon y should not change', 0.001);
});

// ─── Determinism ─────────────────────────────────────────────────────────────

runTest('collision resolution is deterministic across two runs', () => {
  function runOnce(startId) {
    nextId = startId;
    const grid = makeGrid();
    const cs = makeSteering(grid, { iterations: 3 });
    const peons = [
      makePeon('left',  200, 200),
      makePeon('right', 201, 200),
      makePeon('left',  199, 201),
    ];
    cs.rebuildGrid(peons);
    cs.resolveCollisions(peons);
    return peons.map(p => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join('|');
  }
  const r1 = runOnce(1000);
  const r2 = runOnce(1000);
  assert(r1 === r2, `not deterministic:\n  run1: ${r1}\n  run2: ${r2}`);
});

// ─── Structure avoidance ──────────────────────────────────────────────────────

runTest('peon overlapping own base is pushed away', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid);
  const peon = makePeon('left', 100, 300); // placed at base position
  const base = { x: 100, y: 300, size: 30 };
  cs.applyStructureAvoidance([peon], [base]);
  const dx = peon.x - base.x;
  const dy = peon.y - base.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = base.size + peon.size * cs.config.collisionRadiusScale;
  assert(dist >= minDist * 0.99, `peon should be outside base: dist=${dist.toFixed(2)}, min=${minDist.toFixed(2)}`);
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

// ─── Steering: SEPARATE force ────────────────────────────────────────────────

runTest('separate force pushes free-moving peon away from neighbour', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid, { separateStrength: 200 });
  const peon = makePeon('left', 200, 200);
  const nb   = makePeon('right', 202, 200); // very close
  nb.target = {}; // nb is attacking — stays put
  peon.target = null; // peon is free to move
  cs.rebuildGrid([peon, nb]);
  const x0 = peon.x;
  cs.applySteeringForces([peon], null, 1 / 60);
  // peon should have moved left (away from nb)
  assert(peon.x < x0, `peon.x=${peon.x.toFixed(3)} should be < ${x0} (moved away from neighbour)`);
});

runTest('peons with a target set are not moved by steering', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid);
  const peon = makePeon('left', 200, 200);
  peon.target = { x: 400, y: 200 }; // busy attacking
  const nb = makePeon('right', 202, 200);
  cs.rebuildGrid([peon, nb]);
  const x0 = peon.x, y0 = peon.y;
  cs.applySteeringForces([peon], null, 1 / 60);
  assertClose(peon.x, x0, 'peon.x should not change', 0.001);
  assertClose(peon.y, y0, 'peon.y should not change', 0.001);
});

// ─── Steering: SLIDE force ────────────────────────────────────────────────────

runTest('slide force moves peon laterally when blocked ahead by friendly', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid, { slideStrength: 200, slideLookAhead: 14 });
  const path = createStraightLanePath(0, 800, 300);
  // Peon moving right, blocked directly ahead by a friendly.
  nextId = 2; // even id → perpSign = +1 → should move down (positive y)
  const blocker = makePeon('left', 220, 300); // friendly, directly ahead
  nextId = 1;
  const peon = makePeon('left', 200, 300);
  peon.target = null;
  cs.rebuildGrid([peon, blocker]);
  const y0 = peon.y;
  cs.applySteeringForces([peon], path, 1 / 60);
  // Peon id=1 is odd → perpSign = -1 → should move up (negative y offset)
  assert(peon.y !== y0, `peon should have moved laterally, y unchanged at ${y0}`);
});

// ─── Full tick integration ────────────────────────────────────────────────────

runTest('full tick does not throw and leaves peons alive', () => {
  const grid = makeGrid();
  const cs   = makeSteering(grid);
  const path = createStraightLanePath(100, 700, 300);
  const peons = [
    makePeon('left',  200, 300),
    makePeon('right', 500, 300),
    makePeon('left',  200, 305),
  ];
  const dt = 1 / 60;
  cs.tick(peons, path, dt, null);
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
