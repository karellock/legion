(function(globalScope) {
  /**
   * CollisionSteering — per-tick collision resolution and steering behaviours.
   *
   * Designed to be called once per tick from simulation.js after movement
   * positions are updated, before the tick summary is logged.
   *
   * Three behaviours compose to form the final movement for each peon:
   *
   *  ADVANCE  — move along the lane path toward the enemy base (or target).
   *             Replaces the old horizontal-only velocityX approach.
   *
   *  SEPARATE — short-range repulsion from nearby neighbours.
   *             Prevents permanent overlap and creates a natural frontline.
   *
   *  SLIDE    — when blocked by friendly units ahead, drift laterally
   *             (perpendicular to path tangent) to find an open lane.
   *
   * All weights are configurable. Resulting force vectors are clamped to
   * peon max speed. The system is deterministic — given the same inputs it
   * always produces the same outputs, as required by the simulation contract.
   */

  // ─── Default tuning constants ──────────────────────────────────────────────
  // These are starting values; they will be tuned during the balance pass.

  const DEFAULT_COLLISION_RADIUS_SCALE = 1.8; // collision radius = size * scale
  const DEFAULT_SEPARATE_STRENGTH      = 120;  // repulsion force magnitude
  const DEFAULT_SEPARATE_RADIUS_SCALE  = 3.5;  // separation radius = size * scale
  const DEFAULT_SLIDE_STRENGTH         = 60;   // lateral sliding force
  const DEFAULT_SLIDE_LOOK_AHEAD       = 18;   // px ahead to check for blockage
  const DEFAULT_ITERATIONS             = 2;    // push-apart passes per tick

  /**
   * Create a collision/steering controller bound to a spatial hash grid.
   *
   * @param {object} grid           - LegionSpatialGrid instance
   * @param {object} [options]      - tuning overrides
   */
  function createCollisionSteering(grid, options = {}) {
    const collisionRadiusScale = options.collisionRadiusScale ?? DEFAULT_COLLISION_RADIUS_SCALE;
    const separateStrength     = options.separateStrength     ?? DEFAULT_SEPARATE_STRENGTH;
    const separateRadiusScale  = options.separateRadiusScale  ?? DEFAULT_SEPARATE_RADIUS_SCALE;
    const slideStrength        = options.slideStrength        ?? DEFAULT_SLIDE_STRENGTH;
    const slideLookAhead       = options.slideLookAhead       ?? DEFAULT_SLIDE_LOOK_AHEAD;
    const iterations           = options.iterations           ?? DEFAULT_ITERATIONS;

    // ── Helpers ──────────────────────────────────────────────────────────────

    function collisionRadius(peon) {
      return peon.size * collisionRadiusScale;
    }

    function separationRadius(peon) {
      return peon.size * separateRadiusScale;
    }

    /**
     * Rebuild the spatial grid from the current peon positions.
     * Call this once before resolveCollisions / applySteeringForces.
     */
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
     * Peons are NOT pushed through structures — structure avoidance is handled
     * separately in applyStructureAvoidance().
     *
     * @param {Peon[]} peons  - living peons only
     */
    function resolveCollisions(peons) {
      for (let pass = 0; pass < iterations; pass++) {
        // Process pairs in deterministic order: sorted by min(id,id) then max.
        // We use the grid to find candidates, then process each pair once.
        const processed = new Set();

        for (const peon of peons) {
          if (!peon.isAlive()) continue;
          const cr = collisionRadius(peon);
          const candidates = grid.query(peon.x, peon.y, cr * 2);

          for (const other of candidates) {
            if (other.id === peon.id) continue;
            if (!other.isAlive()) continue;

            // Canonical pair key — process each pair once per pass.
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

            // When perfectly overlapping use a deterministic fallback direction
            // based on id ordering so the pair always separates the same way.
            let nx, ny;
            if (dist === 0) {
              nx = peon.id < other.id ? 1 : -1;
              ny = 0;
            } else {
              nx = dx / dist;
              ny = dy / dist;
            }

            // Overlap amount
            const overlap = minDist - dist;

            // Push both apart equally (half each).
            const push = overlap * 0.5;
            peon.x  += nx * push;
            peon.y  += ny * push;
            other.x -= nx * push;
            other.y -= ny * push;
          }
        }

        // Rebuild grid after each pass so subsequent passes use updated positions.
        if (pass < iterations - 1) rebuildGrid(peons);
      }
    }

    // ── Structure avoidance ──────────────────────────────────────────────────

    /**
     * Prevent peons from overlapping their own base and tower.
     * Enemy structures are intentionally not blocked — peons attack into them.
     *
     * @param {Peon[]}   peons
     * @param {object[]} structures  - [{x, y, size}] for own-side structures
     */
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
              nx = 1; ny = 0; // push right by default
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

    // ── Steering forces ──────────────────────────────────────────────────────

    /**
     * Compute and apply steering forces for all living peons.
     * Does NOT apply structure-aware structure blocking — that is handled
     * in collision resolution. This is purely the advance/separate/slide
     * influence on free movement.
     *
     * @param {Peon[]}   peons
     * @param {object}   lanePath  - LanePath instance (or null to skip advance)
     * @param {number}   dt        - delta-time in seconds (typically 1/60)
     */
    function applySteeringForces(peons, lanePath, dt) {
      for (const peon of peons) {
        if (!peon.isAlive()) continue;
        if (peon.target) continue; // targeting logic owns movement for attacking peons

        let fx = 0;
        let fy = 0;

        // ── SEPARATE ─────────────────────────────────────────────────────────
        // Repel from nearby peons (both sides) to prevent permanent clumping.
        const sepR = separationRadius(peon);
        const neighbours = grid.query(peon.x, peon.y, sepR);

        for (const nb of neighbours) {
          if (nb.id === peon.id) continue;
          if (!nb.isAlive()) continue;
          const dx = peon.x - nb.x;
          const dy = peon.y - nb.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist === 0 || dist >= sepR) continue;

          // Force magnitude scales with how close we are (stronger when closer).
          const strength = separateStrength * (1 - dist / sepR);
          fx += (dx / dist) * strength;
          fy += (dy / dist) * strength;
        }

        // ── SLIDE ─────────────────────────────────────────────────────────────
        // If blocked directly ahead by a friendly unit, nudge laterally.
        if (lanePath) {
          const proj = lanePath.projectPoint(peon.x, peon.y);
          const forwardDir = peon.side === 'left' ? 1 : -1;
          const lookX = peon.x + proj.tx * slideLookAhead * forwardDir;
          const lookY = peon.y + proj.ty * slideLookAhead * forwardDir;

          const ahead = grid.query(lookX, lookY, peon.size * collisionRadiusScale * 1.5);
          let friendlyBlocking = false;
          for (const nb of ahead) {
            if (nb.id === peon.id) continue;
            if (nb.side !== peon.side) continue; // only friendly blockage triggers slide
            if (!nb.isAlive()) continue;
            friendlyBlocking = true;
            break;
          }

          if (friendlyBlocking) {
            // Perpendicular to path tangent — alternate sign based on id for
            // deterministic even distribution up/down the lane.
            const perpSign = peon.id % 2 === 0 ? 1 : -1;
            // Perpendicular = (-ty, tx) rotated by perpSign
            fx += (-proj.ty) * slideStrength * perpSign;
            fy +=  proj.tx   * slideStrength * perpSign;
          }
        }

        // ── Apply forces ─────────────────────────────────────────────────────
        if (fx !== 0 || fy !== 0) {
          const speed = peon.side === 'left' ? (peon.velocityX || 50) : -(peon.velocityX || -50);
          const maxForce = Math.abs(speed) * 1.5; // cap to avoid teleporting
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

    /**
     * Full per-tick call: rebuild grid, resolve collisions, apply steering.
     * Call this AFTER targeting and attack phases, BEFORE tick summary logging.
     *
     * @param {Peon[]}   peons       - all living peons
     * @param {object}   lanePath    - LanePath instance
     * @param {number}   dt          - seconds per tick (1/60)
     * @param {object[]} [ownStructuresByPeon]  - map side→[structures] for avoidance
     */
    function tick(peons, lanePath, dt, structuresBySide) {
      const living = peons.filter(p => p.isAlive());
      rebuildGrid(living);
      resolveCollisions(living);

      if (structuresBySide) {
        for (const peon of living) {
          const ownStructures = structuresBySide[peon.side] || [];
          if (ownStructures.length > 0) {
            applyStructureAvoidance([peon], ownStructures);
          }
        }
      }

      // Rebuild once more after collision resolution so steering sees updated positions.
      rebuildGrid(living);
      applySteeringForces(living, lanePath, dt);
    }

    return {
      tick,
      rebuildGrid,
      resolveCollisions,
      applyStructureAvoidance,
      applySteeringForces,
      // Expose constants for tests and tuning UI.
      config: {
        collisionRadiusScale,
        separateStrength,
        separateRadiusScale,
        slideStrength,
        slideLookAhead,
        iterations,
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
