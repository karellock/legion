(function(globalScope) {
  /**
   * LanePath — defines the lane as an ordered list of waypoints.
   *
   * For Phase 1 this is always a straight line (left base → right base),
   * but the API is designed so S-curves and branching paths can be swapped
   * in later by supplying different waypoint data — movement logic never
   * needs to change.
   *
   * Coordinate convention: waypoints are {x, y} in canvas pixels.
   * "Along the path" means increasing waypoint index for the LEFT side
   * (moving right) and decreasing waypoint index for the RIGHT side.
   */

  /**
   * Build a LanePath from an array of {x, y} waypoints.
   * Requires at least two waypoints.
   */
  function createLanePath(waypoints) {
    if (!Array.isArray(waypoints) || waypoints.length < 2) {
      throw new Error('LanePath requires at least 2 waypoints');
    }

    // Pre-compute segment lengths and cumulative distances.
    const segments = [];
    let totalLength = 0;

    for (let i = 0; i < waypoints.length - 1; i++) {
      const a = waypoints[i];
      const b = waypoints[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      segments.push({
        ax: a.x, ay: a.y,
        bx: b.x, by: b.y,
        dx, dy, length,
        startDist: totalLength,
      });
      totalLength += length;
    }

    /**
     * Given a distance along the path [0, totalLength], return
     * { x, y, tx, ty } where (tx, ty) is the unit tangent pointing
     * in the LEFT-side forward direction (increasing distance).
     */
    function sample(dist) {
      const clamped = Math.max(0, Math.min(totalLength, dist));

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const localDist = clamped - seg.startDist;

        // Last segment: use its end point if we've gone past all segments.
        const isLastSegment = i === segments.length - 1;
        const segEnd = seg.startDist + seg.length;

        if (localDist <= seg.length || isLastSegment) {
          const t = seg.length > 0 ? Math.min(1, localDist / seg.length) : 1;
          return {
            x: seg.ax + seg.dx * t,
            y: seg.ay + seg.dy * t,
            tx: seg.length > 0 ? seg.dx / seg.length : 1,
            ty: seg.length > 0 ? seg.dy / seg.length : 0,
          };
        }
      }

      // Fallback: end of path.
      const last = segments[segments.length - 1];
      return {
        x: last.bx,
        y: last.by,
        tx: last.length > 0 ? last.dx / last.length : 1,
        ty: last.length > 0 ? last.dy / last.length : 0,
      };
    }

    /**
     * Find the closest point on the path to a given world position.
     * Returns { dist, x, y, tx, ty } where dist is how far along the
     * path (0 = start, totalLength = end).
     *
     * Used to project a unit back onto the path after steering forces
     * have moved it off-axis.
     */
    function projectPoint(px, py) {
      let bestDist = Infinity;
      let bestAlongPath = 0;

      for (const seg of segments) {
        if (seg.length === 0) continue;

        // Parameter t of the closest point on this segment [0, 1].
        const t = Math.max(0, Math.min(1,
          ((px - seg.ax) * seg.dx + (py - seg.ay) * seg.dy) / (seg.length * seg.length)
        ));
        const cx = seg.ax + seg.dx * t;
        const cy = seg.ay + seg.dy * t;
        const ddx = px - cx;
        const ddy = py - cy;
        const d = Math.sqrt(ddx * ddx + ddy * ddy);

        if (d < bestDist) {
          bestDist = d;
          bestAlongPath = seg.startDist + t * seg.length;
        }
      }

      return {
        dist: bestAlongPath,
        ...sample(bestAlongPath),
      };
    }

    /**
     * Advance a position along the path by `step` units (for a LEFT-side unit).
     * RIGHT-side units pass a negative step.
     * Returns the new { x, y, tx, ty }.
     */
    function advance(currentDist, step) {
      return sample(currentDist + step);
    }

    /**
     * Build a straight-line LanePath from (x0,y0) to (x1,y1).
     * Convenience wrapper used for the Phase 1 single-lane layout.
     */
    return {
      waypoints,
      segments,
      totalLength,
      sample,
      projectPoint,
      advance,
    };
  }

  /**
   * Build the default straight-line path for the classic single-lane map.
   * Left base X and right base X are the lane endpoints; y is the vertical
   * centre of the canvas.
   */
  function createStraightLanePath(leftX, rightX, centerY) {
    return createLanePath([
      { x: leftX, y: centerY },
      { x: rightX, y: centerY },
    ]);
  }

  const api = {
    createLanePath,
    createStraightLanePath,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (globalScope) {
    globalScope.LegionLanePath = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
