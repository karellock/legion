(function(globalScope) {
  /**
   * SpatialHashGrid — O(1) amortised neighbour queries for large unit counts.
   *
   * Divides the world into a grid of cells. Each entity is stored in the
   * cell(s) it overlaps. Querying a radius returns all entities in the
   * candidate cells, which are then distance-filtered by the caller.
   *
   * Determinism guarantee: query results are sorted by entity id (ascending)
   * so iteration order is identical regardless of insertion order.
   *
   * Usage:
   *   const grid = createSpatialHashGrid({ cellSize: 40 });
   *   grid.insert(entity);          // entity must have .id, .x, .y, .size
   *   grid.query(x, y, radius);     // returns array of entities, sorted by id
   *   grid.remove(entity);
   *   grid.clear();                 // call once per tick before re-inserting
   */
  function createSpatialHashGrid({ cellSize = 40 } = {}) {
    if (cellSize <= 0) throw new Error('cellSize must be positive');

    // Map from "col,row" string key → Set of entities.
    const cells = new Map();

    // Map from entity.id → array of cell keys it occupies.
    // Used for O(1) removal.
    const entityCells = new Map();

    function cellKey(col, row) {
      return `${col},${row}`;
    }

    function worldToCell(coord) {
      return Math.floor(coord / cellSize);
    }

    /**
     * Insert an entity into the grid.
     * The entity is placed into every cell its bounding box overlaps.
     * Assumes entity has: { id, x, y, size }  (size = collision radius).
     */
    function insert(entity) {
      const r = entity.size || 0;
      const minCol = worldToCell(entity.x - r);
      const maxCol = worldToCell(entity.x + r);
      const minRow = worldToCell(entity.y - r);
      const maxRow = worldToCell(entity.y + r);

      const keys = [];
      for (let col = minCol; col <= maxCol; col++) {
        for (let row = minRow; row <= maxRow; row++) {
          const key = cellKey(col, row);
          let cell = cells.get(key);
          if (!cell) {
            cell = new Set();
            cells.set(key, cell);
          }
          cell.add(entity);
          keys.push(key);
        }
      }
      entityCells.set(entity.id, keys);
    }

    /**
     * Remove an entity from the grid.
     */
    function remove(entity) {
      const keys = entityCells.get(entity.id);
      if (!keys) return;
      for (const key of keys) {
        const cell = cells.get(key);
        if (cell) {
          cell.delete(entity);
          if (cell.size === 0) cells.delete(key);
        }
      }
      entityCells.delete(entity.id);
    }

    /**
     * Query all entities within `radius` of (qx, qy).
     * Returns an array sorted ascending by entity.id for determinism.
     * The caller is responsible for distance-filtering if they need an
     * exact circle (this returns the candidate rectangle of cells).
     */
    function query(qx, qy, radius) {
      const minCol = worldToCell(qx - radius);
      const maxCol = worldToCell(qx + radius);
      const minRow = worldToCell(qy - radius);
      const maxRow = worldToCell(qy + radius);

      // Collect unique candidates into a Map keyed by id.
      const seen = new Map();
      for (let col = minCol; col <= maxCol; col++) {
        for (let row = minRow; row <= maxRow; row++) {
          const cell = cells.get(cellKey(col, row));
          if (!cell) continue;
          for (const entity of cell) {
            if (!seen.has(entity.id)) {
              seen.set(entity.id, entity);
            }
          }
        }
      }

      // Sort by id for deterministic order.
      return Array.from(seen.values()).sort((a, b) => a.id - b.id);
    }

    /**
     * Clear the entire grid. Call once per tick before re-inserting.
     */
    function clear() {
      cells.clear();
      entityCells.clear();
    }

    /**
     * Return the number of occupied cells (useful for debugging/perf).
     */
    function cellCount() {
      return cells.size;
    }

    return { insert, remove, query, clear, cellCount };
  }

  const api = { createSpatialHashGrid };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (globalScope) {
    globalScope.LegionSpatialGrid = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
