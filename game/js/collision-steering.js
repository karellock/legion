(function(globalScope) {
  /**
   * CollisionSteering — per-tick collision resolution and steering behaviours.
   *
   * Designed to be called once per tick from simulation.js after movement
   * positions are updated, before the tick summary is logged.
   *
   * Two behaviours compose to form the final movement for each peon:
   *
   *  COLLISION RESOLUTION — hard push-apart so peons cannot overlap.
   *             Pairs where one peon is actively attacking the other are
   *             SKIPPED so attackers stay in range and deal damage.
   *
   *  SLIDE    — when blocked by friendly units ahead, drift laterally
   *             (perpendicular to path tangent) to find an open lane.
   *
   * STRUCTURE AVOIDANCE — keep peons from overlapping their own base/tower.
   *
   * LANE BOUNDARIES — hard clamp on peon.y to prevent drifting into the void.
   *
   * All weights are configurable. The system is deterministic.
   */

  // ─── Default tuning constants ──────────────────────────────────────────────

  const DEFAULT_COLLISION_RADIUS_SCALE = 1.8;
  const DEFAULT_SLIDE_STRENGTH         = 80;
  const DEFAULT_SLIDE_LOOK_AHEAD       = 20;
  const DEFAULT_ITERATIONS             = 3;

  /**
   * Create a collision/steering controller bound to a spatial hash grid.
   *
   * @param {object} grid           - LegionSpatialGrid instance
   * @param {object} [options]      - tuning overrides
   * @param {number} [options.laneMinY]
   * @param {number} [options.laneMaxY]  - hard y-boundary clamp
   */
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

    function isAttacking(a, b) {
      // Returns true if peon a is currently attacking peon b.
      // a.target is set to the entity a is trying to attack.
      return a.target === b;
    }

    function rebuildGrid(peons) {
      grid.clear();
      for (const peon of peons) {
        if (peon.isAlive()) grid.insert(peon);
      }
    }

    // ── Collision resolution ─────────────────────────────────────────────────

    /**
     * Push overlapping peons apart.
     * Runs `iterations` passes so deeply overlapping clusters separate cleanly.
     *
     * IMPORTANT: pairs where one peon is attacking the other are SKIPPED.
     * This keeps attackers in attack range so they actually deal damage.
     */
    function resolveCollisions(peons) {
      for (let pass = 0; pass < iterations; pass++) {
        const processed = new Set();

        for (const peon of peons) {
          if (!peon.isAlive()) continue;
          const cr = collisionRadius(peon);
          const candidates = grid.query(peon.x, peon.y, cr * 2);

          for (const other of candidates) {
            if (other.id === peon.id) continue;
            if (!other.isAlive()) continue;

            // Skip attacker-target pairs — they must stay in range to deal damage.
            if (isAttacking(peon, other) || isAttacking(other, peon)) {
              continue;
            }

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

            let nx, ny;
            if (dist === 0) {
              nx = peon.id < other.id ? 1 : -1;
              ny = 0;
            } else {
              nx = dx / dist;
              ny = dy / dist;
            }

            const overlap = minDist - dist;
            const push = overlap * 0.5;
            peon.x  += nx * push;
            peon.y  += ny * push;
            other.x -= nx * push;
            other.y -= ny * push;
          }
        }

        if (pass < iterations - 1) rebuildGrid(peons);
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

    /**
     * Apply lateral slide steering for peons not currently in combat.
     * When blocked directly ahead by a friendly unit, drift perpendicular
     * to the lane path so the peon finds an open lane.
     */
    function applySteeringForces(peons, lanePath, dt) {
      for (const peon of peons) {
        if (!peon.isAlive()) continue;
        // Peons with an active target are in combat — targeting/movement owns them.
        if (peon.target) continue;

        let fx = 0;
        let fy = 0;

        // ── SLIDE ───────────────────────────────────────────────────────────
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
      resolveCollisions(living);

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

      // Hard lane boundary clamp — must run after all movement/steering.
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
