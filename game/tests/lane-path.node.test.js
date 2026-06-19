const { createLanePath, createStraightLanePath } = require('../js/lane-path.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertClose(a, b, message, eps = 0.0001) {
  if (Math.abs(a - b) > eps) {
    throw new Error(`${message} — expected ${b}, got ${a}`);
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

// ─── createLanePath validation ────────────────────────────────────────────────

runTest('createLanePath throws with fewer than 2 waypoints', () => {
  let threw = false;
  try { createLanePath([{ x: 0, y: 0 }]); } catch { threw = true; }
  assert(threw, 'should throw');
});

runTest('createLanePath throws with empty array', () => {
  let threw = false;
  try { createLanePath([]); } catch { threw = true; }
  assert(threw, 'should throw');
});

// ─── Straight horizontal path ─────────────────────────────────────────────────

runTest('straight path totalLength equals horizontal span', () => {
  const path = createStraightLanePath(100, 700, 300);
  assertClose(path.totalLength, 600, 'totalLength');
});

runTest('sample(0) returns start of path', () => {
  const path = createStraightLanePath(100, 700, 300);
  const pt = path.sample(0);
  assertClose(pt.x, 100, 'x at dist=0');
  assertClose(pt.y, 300, 'y at dist=0');
});

runTest('sample(totalLength) returns end of path', () => {
  const path = createStraightLanePath(100, 700, 300);
  const pt = path.sample(path.totalLength);
  assertClose(pt.x, 700, 'x at end');
  assertClose(pt.y, 300, 'y at end');
});

runTest('sample(midpoint) returns center of straight path', () => {
  const path = createStraightLanePath(100, 700, 300);
  const pt = path.sample(300);
  assertClose(pt.x, 400, 'x at midpoint');
  assertClose(pt.y, 300, 'y at midpoint');
});

runTest('straight path tangent points right (tx=1, ty=0)', () => {
  const path = createStraightLanePath(100, 700, 300);
  const pt = path.sample(150);
  assertClose(pt.tx, 1, 'tx should be 1 for rightward path');
  assertClose(pt.ty, 0, 'ty should be 0 for horizontal path');
});

runTest('sample clamps negative distance to start', () => {
  const path = createStraightLanePath(100, 700, 300);
  const pt = path.sample(-50);
  assertClose(pt.x, 100, 'clamped to start x');
});

runTest('sample clamps beyond totalLength to end', () => {
  const path = createStraightLanePath(100, 700, 300);
  const pt = path.sample(9999);
  assertClose(pt.x, 700, 'clamped to end x');
});

// ─── projectPoint ─────────────────────────────────────────────────────────────

runTest('projectPoint on path returns exact dist for on-path point', () => {
  const path = createStraightLanePath(100, 700, 300);
  const result = path.projectPoint(400, 300); // exact midpoint
  assertClose(result.dist, 300, 'dist should be 300 for midpoint x=400');
  assertClose(result.x, 400, 'projected x');
  assertClose(result.y, 300, 'projected y');
});

runTest('projectPoint off-path projects onto nearest point', () => {
  const path = createStraightLanePath(100, 700, 300);
  // Point above the path at x=400
  const result = path.projectPoint(400, 100);
  assertClose(result.dist, 300, 'dist still 300 (same x position)');
  assertClose(result.x, 400, 'projected x stays same');
  assertClose(result.y, 300, 'projected y snaps to path');
});

runTest('projectPoint clamps to start for point before path', () => {
  const path = createStraightLanePath(100, 700, 300);
  const result = path.projectPoint(50, 300);
  assertClose(result.dist, 0, 'dist should be 0');
  assertClose(result.x, 100, 'clamped to start');
});

runTest('projectPoint clamps to end for point after path', () => {
  const path = createStraightLanePath(100, 700, 300);
  const result = path.projectPoint(800, 300);
  assertClose(result.dist, 600, 'dist should be totalLength');
  assertClose(result.x, 700, 'clamped to end');
});

// ─── Multi-segment path (angled, like future S-curve segments) ────────────────

runTest('two-segment L-shaped path has correct totalLength', () => {
  // 0,0 → 300,0 → 300,400  (right then down)
  const path = createLanePath([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 400 }]);
  assertClose(path.totalLength, 700, 'totalLength = 300 + 400');
});

runTest('two-segment path sample at first segment midpoint', () => {
  const path = createLanePath([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 400 }]);
  const pt = path.sample(150);
  assertClose(pt.x, 150, 'x at dist=150 on first segment');
  assertClose(pt.y, 0, 'y at dist=150 on first segment');
  assertClose(pt.tx, 1, 'tx=1 on rightward segment');
  assertClose(pt.ty, 0, 'ty=0 on rightward segment');
});

runTest('two-segment path sample at second segment midpoint', () => {
  const path = createLanePath([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 400 }]);
  const pt = path.sample(300 + 200); // 200 into second segment
  assertClose(pt.x, 300, 'x stays at 300 on second segment');
  assertClose(pt.y, 200, 'y at 200 into vertical segment');
  assertClose(pt.tx, 0, 'tx=0 on downward segment');
  assertClose(pt.ty, 1, 'ty=1 on downward segment');
});

runTest('two-segment path projectPoint finds correct segment', () => {
  const path = createLanePath([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 400 }]);
  // Point is (350, 50) — closest point on the L-path is (300, 50) on segment 2.
  // dist = 300 (segment 1 length) + 50 (50 units into segment 2) = 350.
  const result = path.projectPoint(350, 50);
  assertClose(result.dist, 350, 'dist=350 (corner + 50 into vertical segment)');
  assertClose(result.x, 300, 'projected x=300 (on the vertical segment)');
  assertClose(result.y, 50, 'projected y=50');
});

// ─── Determinism ──────────────────────────────────────────────────────────────

runTest('sample is deterministic across multiple calls', () => {
  const path = createStraightLanePath(100, 700, 300);
  const pt1 = path.sample(150);
  const pt2 = path.sample(150);
  assert(pt1.x === pt2.x && pt1.y === pt2.y, 'identical inputs must produce identical outputs');
});

runTest('projectPoint is deterministic', () => {
  const path = createStraightLanePath(100, 700, 300);
  const r1 = path.projectPoint(350, 250);
  const r2 = path.projectPoint(350, 250);
  assert(r1.dist === r2.dist && r1.x === r2.x, 'projectPoint must be deterministic');
});
