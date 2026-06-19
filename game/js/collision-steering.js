(function(globalScope) {
  // ── Collision + Steering for Lane-Based RTS ─────────────────
  //
  // Exposes:
  //   createCollisionSteering(grid, options?) → { tick, config }
  //
  // Design:
  //   SEPARATE — per-pair lane-normal repulsion (straight lane = Y axis).
  //   STEER    — lateral avoidance when blocked by friendly OR structure.
  //   No separate "structure avoidance" pass — steering handles it.

  // ─── Default tuning constants ──────────────────────────────────

  const DEFAULT_COLLISION_RADIUS_SCALE = 1.8;
  const DEFAULT_SLIDE_STRENGTH         = 25;
  const DEFAULT_SLIDE_LOOK_AHEAD       = 20;
  const DEFAULT_ITERATIONS             = 3;

  function createCollisionSteering(grid, options = {}) {
    const collisionRadiusScale = options.collisionRadiusScale ?? DEFAULT_COLLISION_RADIUS_SCALE;
    const slideStrength        = options.slideStrength        ?? DEFAULT_SLIDE_STRENGTH;
    const slideLookAhead      = options.slideLookAhead      ?? DEFAULT_SLIDE_LOOK_AHEAD;
    const iterations           = options.iterations           ?? DEFAULT_ITERATIONS;
    const laneMinY            = options.laneMinY            ?? 0;
    const laneMaxY            = options.laneMaxY            ?? 600;

    // ── Helpers ──────────────────────────────────────────────────────

    function collisionRadius(peon) {
      return peon.size * collisionRadiusScale;
    }

    function rebuildGrid(peons) {
      grid.clear();
      for (const peon of peons) {
        if (peon.isAlive()) grid.insert(peon);
      }
    }

    // ── Separation normal ─────────────────────────────────────────────────────
    // Returns unit normal pointing from b → a (pushes a away from b).
    // For straight lanes: normal = ±Y axis.

    function separationNormal(a, b, dx, dy, dist) {
      if (dist === 0) {
        const sign = (a.id < b.id) ? 1 : -1;
        return { nx: 0, ny: sign };
      }
      const signY = dy > 0 ? 1 : (dy < 0 ? -1 : ((a.id < b.id) ? 1 : -1));
      return { nx: 0, ny: signY };
    }

    // ── Collision resolution ──────────────────────────────────────────────────
    // Push overlapping peons apart along Y-axis only.

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
            anyPush = true;

            const { nx, ny } = separationNormal(peon, other, dx, dy, dist);
            const overlap = minDist - dist;
            peon.x += nx * overlap / 2;
            peon.y += ny * overlap / 2;
            other.x -= nx * overlap / 2;
            other.y -= ny * overlap / 2;
          }
        }

        if (!anyPush) break;
        if (pass < MAX_PASSES - 1) rebuildGrid(peons);
      }
    }

    // ── Steering: SLIDE (lateral avoidance) ─────────────────────────
    // Slide when blocked ahead by friendly peon OR by own structure.
    // Deterministic direction: peon.id % 2.

    function applySteeringForces(peons, lanePath, dt, structuresBySide) {
      for (const peon of peons) {
        if (!peon.isAlive()) continue;
        if (peon.target) continue;

        let blockedAhead = false;

        // Check for friendly peon blocking ahead.
        if (lanePath) {
          const proj   = lanePath.projectPoint(peon.x, peon.y);
          const fwd    = peon.side === 'left' ? 1 : -1;
          const lookX  = peon.x + proj.tx * slideLookAhead * fwd;
          const lookY  = peon.y + proj.ty * slideLookAhead * fwd;
          const ahead  = grid.query(lookX, lookY, peon.size * collisionRadiusScale * 1.5);
          for (const nb of ahead) {
            if (nb.id === peon.id) continue;
            if (nb.side !== peon.side) continue;
            if (!nb.isAlive()) continue;
            blockedAhead = true;
            break;
          }
        }

        // Check for own structure blocking ahead.
        if (!blockedAhead && structuresBySide) {
          const ownStructures = structuresBySide[peon.side] || [];
          for (const st of ownStructures) {
            const structR = st.size || 30;
            const dx = peon.x - st.x;
            const dy = peon.y - st.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < structR + collisionRadius(peon)) {
              blockedAhead = true;
              break;
            }
          }
        }

        if (!blockedAhead || !lanePath) continue;

        const proj = lanePath.projectPoint(peon.x, peon.y);
        const perpSign = peon.id % 2 === 0 ? 1 : -1;
        let fx = (-proj.ty) * slideStrength * perpSign;
        let fy = ( proj.tx) * slideStrength * perpSign;

        // Clamp slide force to max 1.5× forward speed.
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
      applySteeringForces(living, lanePath, dt, structuresBySide);
      clampToLaneBounds(living);
    }

    // ── Public API ─────────────────────────────────────────────────

    return {
      tick,
      rebuildGrid,
      resolveCollisions,
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
