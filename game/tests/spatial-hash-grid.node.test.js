const { createSpatialHashGrid } = require('../js/spatial-hash-grid.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertClose(a, b, message, eps = 0.0001) {
  if (Math.abs(a - b) > eps) throw new Error(`${message} — expected ${b}, got ${a}`);
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

function makeEntity(id, x, y, size = 6) {
  return { id, x, y, size };
}

// ─── Construction ─────────────────────────────────────────────────────────────

runTest('createSpatialHashGrid throws for non-positive cellSize', () => {
  let threw = false;
  try { createSpatialHashGrid({ cellSize: 0 }); } catch { threw = true; }
  assert(threw, 'should throw for cellSize=0');
});

runTest('empty grid query returns empty array', () => {
  const grid = createSpatialHashGrid({ cellSize: 40 });
  const results = grid.query(200, 200, 50);
  assert(results.length === 0, 'empty grid should return nothing');
});

// ─── Insert and query ─────────────────────────────────────────────────────────

runTest('inserted entity is found by query', () => {
  const grid = createSpatialHashGrid({ cellSize: 40 });
  const e = makeEntity(1, 200, 200);
  grid.insert(e);
  const results = grid.query(200, 200, 10);
  assert(results.length === 1 && results[0].id === 1, 'should find the entity');
});

runTest('entity outside query radius is not returned', () => {
  const grid = createSpatialHashGrid({ cellSize: 40 });
  grid.insert(makeEntity(1, 200, 200));
  grid.insert(makeEntity(2, 400, 200)); // far away
  const results = grid.query(200, 200, 10);
  assert(results.length === 1, `should only find entity 1, found ${results.length}`);
});

runTest('multiple entities in range are all returned', () => {
  const grid = createSpatialHashGrid({ cellSize: 40 });
  grid.insert(makeEntity(1, 200, 200));
  grid.insert(makeEntity(2, 205, 200));
  grid.insert(makeEntity(3, 210, 200));
  grid.insert(makeEntity(4, 500, 200)); // out of range
  const results = grid.query(205, 200, 20);
  assert(results.length === 3, `expected 3, got ${results.length}`);
});

// ─── Deterministic ordering ───────────────────────────────────────────────────

runTest('query results are sorted by entity id ascending', () => {
  const grid = createSpatialHashGrid({ cellSize: 40 });
  // Insert in reverse id order
  grid.insert(makeEntity(5, 200, 200));
  grid.insert(makeEntity(2, 201, 200));
  grid.insert(makeEntity(8, 202, 200));
  grid.insert(makeEntity(1, 203, 200));
  const results = grid.query(201, 200, 20);
  const ids = results.map(e => e.id);
  assert(
    ids[0] === 1 && ids[1] === 2 && ids[2] === 5 && ids[3] === 8,
    `ids should be [1,2,5,8], got [${ids}]`
  );
});

runTest('query is deterministic across multiple calls with same state', () => {
  const grid = createSpatialHashGrid({ cellSize: 40 });
  grid.insert(makeEntity(3, 200, 200));
  grid.insert(makeEntity(1, 205, 200));
  grid.insert(makeEntity(2, 210, 200));
  const r1 = grid.query(205, 200, 20).map(e => e.id).join(',');
  const r2 = grid.query(205, 200, 20).map(e => e.id).join(',');
  assert(r1 === r2, `results should be identical: ${r1} vs ${r2}`);
});

// ─── Remove ───────────────────────────────────────────────────────────────────

runTest('removed entity is no longer returned by query', () => {
  const grid = createSpatialHashGrid({ cellSize: 40 });
  const e = makeEntity(1, 200, 200);
  grid.insert(e);
  grid.remove(e);
  const results = grid.query(200, 200, 10);
  assert(results.length === 0, 'removed entity should not appear');
});

runTest('removing non-existent entity does not throw', () => {
  const grid = createSpatialHashGrid({ cellSize: 40 });
  grid.remove(makeEntity(99, 200, 200)); // never inserted
  assert(true, 'should not throw');
});

runTest('removing one entity does not affect others', () => {
  const grid = createSpatialHashGrid({ cellSize: 40 });
  const e1 = makeEntity(1, 200, 200);
  const e2 = makeEntity(2, 202, 200);
  grid.insert(e1);
  grid.insert(e2);
  grid.remove(e1);
  const results = grid.query(200, 200, 20);
  assert(results.length === 1 && results[0].id === 2, 'only e2 should remain');
});

// ─── Clear ────────────────────────────────────────────────────────────────────

runTest('clear empties the grid', () => {
  const grid = createSpatialHashGrid({ cellSize: 40 });
  grid.insert(makeEntity(1, 200, 200));
  grid.insert(makeEntity(2, 205, 200));
  grid.clear();
  assert(grid.query(200, 200, 50).length === 0, 'grid should be empty after clear');
  assert(grid.cellCount() === 0, 'cellCount should be 0 after clear');
});

runTest('entities can be re-inserted after clear', () => {
  const grid = createSpatialHashGrid({ cellSize: 40 });
  const e = makeEntity(1, 200, 200);
  grid.insert(e);
  grid.clear();
  grid.insert(e);
  assert(grid.query(200, 200, 10).length === 1, 'entity should be findable after re-insert');
});

// ─── Entity spanning multiple cells ──────────────────────────────────────────

runTest('large entity spanning cell boundary is findable from either side', () => {
  // cellSize=40, so cell boundary at x=40,80,120... Entity at x=120, size=30
  // overlaps cells 2 (x=80..120) and 3 (x=120..160)
  const grid = createSpatialHashGrid({ cellSize: 40 });
  grid.insert(makeEntity(1, 120, 200, 30));
  // Query from left side of entity
  const left = grid.query(95, 200, 5);
  // Query from right side of entity
  const right = grid.query(145, 200, 5);
  assert(left.length === 1 && left[0].id === 1, 'should find entity from left cell query');
  assert(right.length === 1 && right[0].id === 1, 'should find entity from right cell query');
});

// ─── Edge: same position entities ────────────────────────────────────────────

runTest('two entities at same position are both found', () => {
  const grid = createSpatialHashGrid({ cellSize: 40 });
  grid.insert(makeEntity(1, 200, 200));
  grid.insert(makeEntity(2, 200, 200));
  const results = grid.query(200, 200, 1);
  assert(results.length === 2, `expected 2, got ${results.length}`);
});

// ─── cellCount ────────────────────────────────────────────────────────────────

runTest('cellCount increases after inserts and resets after clear', () => {
  const grid = createSpatialHashGrid({ cellSize: 40 });
  assert(grid.cellCount() === 0, 'starts empty');
  grid.insert(makeEntity(1, 200, 200));
  assert(grid.cellCount() > 0, 'has cells after insert');
  grid.clear();
  assert(grid.cellCount() === 0, 'resets after clear');
});
