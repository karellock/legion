# Legion — Game Design Document

Version: 2.0 (June 2026)  
Status: Phase 1 — Collision & Movement Foundation (in progress)

---

## 1. Vision

**Legion** is a deterministic tug-of-war RTS where two sides spawn waves of small peons that march down a lane, fight, and try to destroy the enemy base. There is **no RNG** and **no physics bumping** — every battle with the same inputs produces the same result. This makes the game fully analyzable, balanceable, and suitable for AI research.

The intended player experience:
- Watch a frontline emerge naturally from collision and combat
- Manage a single resource (gold) to upgrade your army
- Adapt your strategy as the battle evolves
- Eventually scale to thousands of peons per side in epic push-pull battles

### Future vision (Phase 3+)
- S-curve and branching lane maps (multiple paths to the enemy base)
- Crossroads where peon flow can be redirected
- Million-peon battles with GPU-accelerated rendering

---

## 2. Current State (June 2026)

### Done (committed on `feat/colision`)
- Deterministic core simulation (60-tick loop, no RNG)
- Core entities: Peon, Tower, Main Base
- Deterministic targeting: visible enemy peons > structures; melee override
- Economy Phase 1: kill bounty (10g), shrine control (disabled by default)
- Upgrade Phase 1: Damage (+5/level), Health (+50/level), Spawn Count (+1/level); cost doubling (50→100→200→400)
- Dev tools: entity inspect panel, time-scale slider, AI spending bots, tournament lab, telemetry export
- **Phase 1 foundation (in progress):**
  - Lane path spine (`lane-path.js`) — waypoint-based, supports straight and multi-segment paths
  - Spatial hash grid (`spatial-hash-grid.js`) — O(n) neighbour queries
  - Collision & steering (`collision-steering.js`) — Y-axis separation only (prevents push-through), slide steering, lane boundary clamping

### Known Issues
- **Snowball problem:** A small early advantage compounds because all peons deal damage simultaneously. Collision (Phase 1) is the intended fix — only front-row peons can fight.
- **Shrine income disabled:** Needs rebalancing after collision is proven.
- **No S-curve maps yet:** Straight lane only. Path architecture is in place; curves are a Phase 2/3 visual + balance task.

---

## 3. Roadmap

### Phase 1: Collision & Movement Foundation (v0.1.0)
**Goal:** Prevent peon overlap, form a natural frontline, fix the snowball problem at the mechanical level.

- [x] Define lane as a waypoint path spine (`lane-path.js`)
- [x] Implement spatial hash grid for efficient neighbour queries (`spatial-hash-grid.js`)
- [x] Collision detection and resolution (`collision-steering.js`)
  - Y-axis separation only (no push-through bug)
  - Both same-side and opposite-side pairs collide (no visual overlap)
  - Converges iteratively until no overlaps remain
- [x] Steering behaviours: ADVANCE (toward target/along path), SLIDE (lateral drift when blocked)
- [x] Lane boundary clamping (peons cannot drift into void)
- [ ] Validate frontline emergence (manual testing + telemetry)
- [ ] Performance baseline (target: 60 FPS with 500 peons/side)
- [ ] Post-collision rebalance pass (tune peon HP/damage for new frontline meta)
- [ ] Measure snowball improvement (A/B test: pre-collision vs post-collision win-rate variance)
- [ ] Update GDD & tests, tag `v0.1.0`

### Phase 2: Strategy Game — Anti-Snowball Balance (v0.2.0)
**Goal:** Make the game strategically deep. A behind player must have a realistic comeback path.

- Comeback mechanics:
  - Defender's advantage (tower damage bonus when base is threatened)
  - Bounty scaling (higher bounties for killing expensive enemy peons)
- Economy rebalance:
  - Re-enable shrine income with collision-aware tuning
  - Consider periodic spawn interval ramp (3s→2s→1s by minute milestones)
- Super Peon unlock (boss unit, high gold cost, breaks stalemates)
- UI polish: upgrade panel, gold income indicators, wave countdown

### Phase 3: Vision & Epic Battles (v0.3.0)
**Goal:** Support thousands of peons, add map variety, create spectacle.

- S-curve lane maps (path-based movement already supports this)
- Crossroads / branching paths (multiple routes to enemy base)
- Mass unit scaling:
  - Batch rendering (Canvas `drawImage` with off-screen buffer)
  - Web Worker simulation (off main-thread)
  - LOD system (collapse far-away peons into heatmap blobs)
- Tournament mode: 8-player bracket, spectator view, replay export

---

## 4. Core Design Rules

| Rule | Rationale |
|---|---|
| No RNG | Deterministic = analyzable = balanceable. Also enables perfect replay. |
| No physics bumping | Peons overlap in old design; new design uses collision separation. Movement is exact. |
| Collision on Y-axis only | Prevents rear peons pushing front peons through enemies. Frontline emerges naturally. |
| Visible enemy peons > structures | Encourages frontline combat over tower rushing. |
| Melee override | If an enemy is in attack range, it must be attacked (no stutter-stepping). |
| Midline rule | Crossing the midline can relax structure vision, but must not make units ignore visible enemies. |
| Deterministic telemetry | Every tick is logged. Late-game regressions can be inspected by tick. |

---

## 5. Entities & Stats

### Peon (Basic Unit)
- 100 HP, 9 Damage, 1 attack/second, speed 25 px/s
- Spawned in waves (configurable interval + batch size)
- Collision radius: `size * 1.8` = 10.8 px

### Tower (1 per side)
- 700 HP, 30 base Damage, attacks every 0.5s
- Physically blocks lane (peons cannot walk through)
- Does not respawn once destroyed
- Damage scales +1.2/min (configurable)

### Main Base (1 per side)
- 2000 HP, 10 Damage, attacks every 0.4s
- Can attack enemies (prevents single weak peon from winning)
- Damage scales +1.5/min (configurable)
- Grace period: 45s (base), 20s (tower) — structure deals 0 damage until grace expires

### Super Peon (Boss — Phase 2)
- Massive, heavily armoured
- High gold cost (2000g+)
- Intended to break stalemates

---

## 6. Economy

### Gold Sources
- **Kill bounty:** +10 gold per enemy peon killed
- **Shrine control:** +2 gold/sec while exclusively controlling past-midline (disabled by default, Phase 2)
- **Defender's advantage:** (Phase 2) — killing enemy peons under your tower gives bonus gold

### Gold Sinks
- **Upgrades:** Damage, Health, Spawn Count, Super Peon

### Upgrade Cost Scaling
- Damage: base 50g, doubles each level (50 → 100 → 200 → 400)
- Health: base 50g, doubles each level
- Spawn Count: base 500g, exponential formula
- Super Peon: fixed extreme cost (e.g., 2000g)

---

## 7. Technical Architecture

### Modules (deterministic core)
| File | Responsibility |
|---|---|
| `simulation.js` | 60-tick loop, spawn, combat resolution, structure grace, upgrade cost formulas |
| `lane-path.js` | Waypoint path spine, `sample(dist)`, `projectPoint(x,y)`, `advance(x,y,dist)` |
| `spatial-hash-grid.js` | O(n) neighbour queries for collision |
| `collision-steering.js` | Collision resolution (Y-axis only), SLIDE steering, lane boundary clamping |
| `game-bot-core.js` | AI spending strategies (damage-only, health-only, spawn-only, balanced, cheapest-first) |
| `tournament-core.js` | Round-robin pairings, leaderboard, aggregate stats |

### Rendering (non-deterministic, visual only)
| File | Responsibility |
|---|---|
| `game-render.js` | Canvas rendering pipeline, entity drawing, UI overlays |
| `game.js` | Main game loop, input handling, settings wiring |
| `game-controls.js` | Upgrade purchase UI, dev tool controls |
| `game-settings.js` | Settings persistence (localStorage), preset configurations |

### Deterministic Contract
- `lane-path.js`, `spatial-hash-grid.js`, `collision-steering.js`, `simulation.js`, `tournament-core.js`, `game-bot-core.js` must be deterministic.
- Rendering modules (`game-render.js`, etc.) are allowed to be non-deterministic (e.g., floating-point in Canvas).
- Telemetry logs every tick from the deterministic core only.

---

## 8. Testing & Quality

### Test Stack
- **Runner:** `run-all-node-tests.js` (plain Node.js, no framework)
- **Helpers:** `runTest(name, fn)`, `assert(condition, message)`
- **Deterministic tests:** Every PR must pass all deterministic tests (no flaky tests)

### Current Test Coverage
- `lane-path.node.test.js` — 19 tests (path creation, sampling, projection, determinism)
- `spatial-hash-grid.node.test.js` — 15 tests (insert, query, remove, clear, determinism)
- `collision-steering.node.test.js` — 20 tests (collision, steering, boundaries, determinism, no-overlap guarantee)
- `simulation.node.test.js` — combat resolution, upgrade costs, telemetry
- `game.bot.core.node.test.js` — bot strategy selection, purchase cadence
- `tournament.core.node.test.js` — pairings, leaderboard, aggregate stats
- `game.session.core.node.test.js` — session creation, URL encoding

**Total: 68 tests, all passing.**

### Test Command
```bash
cd /c/git/legion && node game/tests/run-all-node-tests.js
```

---

## 9. Git Workflow

- **Branch strategy:** All work via feature branches + pull requests. Direct push to `main` should fail.
- **Current branch:** `feat/colision` (Phase 1 work)
- **Commit convention:** `feat:`, `fix:`, `refactor:`, `test:` prefixes
- **Tagging:** Each phase milestone gets a version tag (`v0.1.0`, `v0.2.0`, etc.)

---

## 10. Open Questions

- [ ] Should spawn interval ramp (3s→1s) be re-enabled in Phase 2? Currently postponed because matches rarely reach minute 5.
- [ ] Should shrine income scale with number of peons in shrine zone (not just binary control)?
- [ ] Super Peon: what exactly should its stats be? (HP, damage, special ability?)
- [ ] S-curve maps: how does collision interact with curved paths? (Y-axis separation may need to become path-normal separation — code already supports this.)
- [ ] Performance target for Phase 1: is 500 peons/side @ 60 FPS achievable on mid-range hardware?

---

## 11. Changelog

| Date | Version | Changes |
|---|---|---|
| Apr 2026 | 1.0 | Initial GDD (short version) |
| Jun 2026 | 2.0 | Rewritten for Phase 1. Added vision, roadmap, architecture, testing, open questions. |

---

> **Note:** Agent definitions and AI workflow materials are stored in `.github/agents/`. This document is the single source of truth for game design.
