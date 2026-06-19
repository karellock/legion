(function(globalScope) {
  /**
   * CollisionSteering — per-tick collision resolution and steering behaviours.
   *
   * COLLISION RESOLUTION — hard push-apart so peons NEVER overlap.
   *   Separation is always along the lane normal (Y for straight lane),
   *   never along the lane tangent (X). This prevents rear peons from
   *   pushing front peons forward through enemies.
   *   Both same-side and opposite-side pairs are resolved.
   *
   * STEERING (SLIDE) — lateral drift when blocked by friendlies.
   *   slideStrength is tuned so lateral movement is visibly slower than
   *   forward walk speed (no "slide faster than walk" artefact).
   *
   * STRUCTURE AVOIDANCE — keep peons from overlapping own base/tower.
   * LANE BOUNDARIES    — hard clamp on peon.y to prevent void drift.
   *
   * All behaviour is deterministic.
   */

  // ─── Default tuning constants ──────────────────────────────────────────────

  const DEFAULT_COLLISION_RADIUS_SCALE = 1.8;
  // Slide strength: tuned to be visibly slower than forward walk (50/60 ≈ 0.83 px/tick).
  // Was 80 (far too fast), then 25 (still noticeable). Now 5 so lateral
  // drift is subtle — peons mostly walk forward, slide only when truly blocked.
  const DEFAULT_SLIDE_STRENGTH         = 5;
  const DEFAULT_SLIDE_LOOK_AHEAD       = 20;
  const DEFAULT_ITERATIONS             = 3;

  function createCollisionSteering(grid, options = {}) {
    const collisionRadiusScale = options.collisionRadiusScale ?? DEFAULT_COLLISION_RADIUS_SCALE;
    const slideStrength        = options.slideStrength        ?? DEFAULT_SLIDE_STRENGTH;
    const slideLookAhead      = options.slideLookAhead      ?? DEFAULT_SLIDE_LOOK_AHEAD;
    const iterations           = options.iterations           ?? DEFAULT_ITERATIONS;
    const laneMinY            = options.laneMinY            ?? 0;
    const laneMaxY            = options.laneMaxY            ?? 600;

    // ── Helpers ──────────────────────────────────────────────────────────────

    function collisionRadius(peon) {
      return peon.size * collisionRadiusScale;
    }

    function rebuildGrid(peons) {
      grid.clear();
      for (const peon of peons) {
        if (peon.isAlive()) grid.insert(peon);
      }
    }

    /**
     * Compute the separation normal for a pair of peons.
     *
     * For straight lanes (Phase 1): always (0, ±1) — pure Y separation.
     *   This prevents rear peons from pushing front peons forward along X.
     *   When dy === 0 (directly overlapping), uses deterministic ID-based
     *   sign so the pair always separates up/down the same way.
     *
     * For curved lanes (Phase 3): uses the lane-path tangent at the midpoint
     *   to derive the normal (tx, ty) → normal = (-ty, tx).
     *
     * @param {object} a         - first peon
     * @param {object} b         - second peon
     * @param {number} dx        - a.x - b.x
     * @param {number} dy        - a.y - b.y
     * @param {number} dist      - Math.sqrt(dx*dx + dy*dy)
     * @param {object|null} lanePath - LanePath instance, or null for straight-lane shortcut
     * @returns {{ nx: number, ny: number }} — unit normal pointing a→b
     */
    function separationNormal(a, b, dx, dy, dist, lanePath) {
      if (lanePath) {
        // Curved lane: use lane normal at the midpoint.
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const proj = lanePath.projectPoint(midX, midY);
        // Normal = perpendicular to tangent: (-ty, tx)
        // Ensure it points from b→a (same direction as raw dx,dy)
        let nx = -proj.ty;
        let ny =  proj.tx;
        // Flip if it points opposite to dx,dy
        const dot = nx * dx + ny * dy;
        if (dot < 0) { nx = -nx; ny = -ny; }
        const nMag = Math.sqrt(nx * nx + ny * ny) || 1;
        return { nx: nx / nMag, ny: ny / nMag };
      }

      // Straight lane: normal is always ±Y axis.
      // When dy !== 0: normal points in the sign(dy) direction → (0, ±1)
      // When dy === 0: use deterministic ID-based sign
      if (dist === 0) {
        // Exactly overlapping — use ID to assign consistent opposite directions
        const sign = (a.id < b.id) ? 1 : -1;
        return { nx: 0, ny: sign };
      }
      // Normalise to pure Y: keep sign of dy, zero out X
      const signY = dy > 0 ? 1 : (dy < 0 ? -1 : ((a.id < b.id) ? 1 : -1));
      return { nx: 0, ny: signY };
    }

    // ── Collision resolution ─────────────────────────────────────────────────

    /**
     * Push overlapping peons apart along the lane normal only (Y axis for
     * straight lane). Runs passes until no overlaps remain or max 10 passes.
     *
     * Both same-side and opposite-side pairs are resolved (no visual overlap).
     * Separation is always along the lane normal so rear peons cannot push
     * front peons forward through enemies.
     */
    function resolveCollisions(peons, lanePath) {
      const MAX_PASSES = 10;
      for (let pass = 0; pass < MAX_PASSES; pass++) {
        let anyPush = false;
        const processed = new Set();

        for (const peon of peons) {
          if (!peon.isAlive()) continue;
          const cr = collisionRadius(peon);
          const candidates = grid.query(peon.x, peon.y, cr * 2);

          for (const other of candidates) {
            if (other.id === peon.id) continue;
            if (!other.isAlive()) continue;

            const pairKey = peon.id < other.id
              ? `${peon.id}:${other.id}`
              : `${other.id}:${peon.id}`;
            if (processed.has(pairKey)) continue;
            processed.add(pairKey);

            const otherCr = collisionRadius(other);
            const minDist = cr + otherCr;
            const dx = peon.x - other.x;
            const dy = peon.y - other.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist >= minDist) continue;

            const { nx, ny } = separationNormal(peon, other, dx, dy, dist, lanePath);

            const overlap = minDist - dist;
            const pushX = nx * overlap * 0.5;
            const pushY = ny * overlap * 0.5;
            peon.x  += pushX;
            peon.y  += pushY;
            other.x -= pushX;
            other.y -= pushY;
            anyPush = true;
          }
        }

        if (!anyPush) break; // converged — all pairs separated
        if (pass < MAX_PASSES - 1) rebuildGrid(peons);
      }
    }

    // ── Structure avoidance ──────────────────────────────────────────────────

    function applyStructureAvoidance(peons, structures) {
      for (const peon of peons) {
        if (!peon.isAlive()) continue;
        for (const struct of structures) {
          const structR = struct.size || 30;
          const cr = collisionRadius(peon);
          const minDist = structR + cr;
          const dx = peon.x - struct.x;
          const dy = peon.y - struct.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) {
            let nx, ny;
            if (dist === 0) {
              nx = 1; ny = 0;
            } else {
              nx = dx / dist;
              ny = dy / dist;
            }
            peon.x = struct.x + nx * minDist;
            peon.y = struct.y + ny * minDist;
          }
        }
      }
    }

    // ── Steering: SLIDE only ───────────────────────────────────────────────

    function applySteeringForces(peons, lanePath, dt) {
      for (const peon of peons) {
        if (!peon.isAlive()) continue;
        if (peon.target) continue;

        let fx = 0;
        let fy = 0;

        if (lanePath) {
          const proj = lanePath.projectPoint(peon.x, peon.y);
          const forwardDir = peon.side === 'left' ? 1 : -1;
          const lookX = peon.x + proj.tx * slideLookAhead * forwardDir;
          const lookY = peon.y + proj.ty * slideLookAhead * forwardDir;

          const ahead = grid.query(lookX, lookY, peon.size * collisionRadiusScale * 1.5);
          let friendlyBlocking = false;
          for (const nb of ahead) {
            if (nb.id === peon.id) continue;
            if (nb.side !== peon.side) continue;
            if (!nb.isAlive()) continue;
            friendlyBlocking = true;
            break;
          }

          if (friendlyBlocking) {
            const perpSign = peon.id % 2 === 0 ? 1 : -1;
            fx += (-proj.ty) * slideStrength * perpSign;
            fy +=  (proj.tx) * slideStrength * perpSign;
          }
        }

        if (fx !== 0 || fy !== 0) {
          const speed = Math.abs(peon.velocityX || 50);
          const maxForce = speed * 1.5;
          const fMag = Math.sqrt(fx * fx + fy * fy);
          if (fMag > maxForce) {
            fx = (fx / fMag) * maxForce;
            fy = (fy / fMag) * maxForce;
          }
          peon.x += fx * dt;
          peon.y += fy * dt;
        }
      }
    }

    // ── Lane boundary clamping ──────────────────────────────────────────────

    function clampToLaneBounds(peons) {
      for (const peon of peons) {
        if (!peon.isAlive()) continue;
        if (peon.y < laneMinY) peon.y = laneMinY;
        if (peon.y > laneMaxY) peon.y = laneMaxY;
      }
    }

    // ── Full tick ──────────────────────────────────────────────────────────

    function tick(peons, lanePath, dt, structuresBySide) {
      const living = peons.filter(p => p.isAlive());
      rebuildGrid(living);
      resolveCollisions(living, lanePath);

      if (structuresBySide) {
        for (const peon of living) {
          const own = structuresBySide[peon.side] || [];
          if (own.length > 0) {
            applyStructureAvoidance([peon], own);
          }
        }
      }

      rebuildGrid(living);
      applySteeringForces(living, lanePath, dt);

      clampToLaneBounds(living);
    }

    return {
      tick,
      rebuildGrid,
      resolveCollisions,
      applyStructureAvoidance,
      applySteeringForces,
      clampToLaneBounds,
      config: {
        collisionRadiusScale,
        slideStrength,
        slideLookAhead,
        iterations,
        laneMinY,
        laneMaxY,
      },
    };
  }

  const api = { createCollisionSteering };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (globalScope) {
    globalScope.LegionCollisionSteering = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
