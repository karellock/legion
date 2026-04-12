# Legion Game Design Document

## Overview

This document describes the design for the Legion game prototype.

## Implementation Status (April 2026)

### Done

- Deterministic core simulation with no RNG and no physics bumping.
- Core units and structures: Peons, Towers, Main Bases.
- Deterministic targeting baseline:
  - visible enemy peons before structures
  - melee range override
- Deterministic telemetry with downloadable run logs.
- Economy Phase 1:
  - Kill bounty: +10 gold per enemy peon kill.
  - Gold shrine control at map center: +2 gold/sec while one side exclusively controls past-midline pressure.
- Upgrade Phase 1:
  - Spendable gold with deterministic purchase flow.
  - Cost scaling: 50g base, doubling per level for each upgrade track.
  - Implemented tracks: Damage (+5 per level), Health (+50 per level), Spawn Count (+1 per level).
  - On-screen controls for Blue/Red upgrade purchases during manual tests.
- Dev support tooling:
  - Click-to-inspect entity panel for units and structures (HP, damage, range, side, id).
  - Time-scale control (0.25x to 4x) for pacing and balance iteration.
  - Scripted AI spending bots (damage-only, health-only, spawn-only, balanced) for both sides.
  - Tournament Lab with round-robin AI battles, history export/import, and local manifest auto-load for logs.
  - Tournament history stores complete run settings snapshot for auditability.

### Not Done Yet

- Priority now: finish remaining feature work first, then run balancing and match pacing passes.
- Upgrade system and scaling costs:
  - Super Peon unlock
- Super Peon gameplay implementation.

### Postponed

- Time-based spawn interval ramp (3s -> 2s -> 1s by minute milestones).
  - Reason: with current tuning, matches rarely reach minute 5; resume after remaining features are in and pacing/balance passes begin.

## Tech Stack & Architecture

- Environment: Pure HTML5 Canvas and Vanilla JavaScript.
- Dependencies: No external dependencies or game engines.
- Architecture: Keep modules small and deterministic.
  - Main game: `game/index.html` + `game/js/game.js` + `game/js/simulation.js` + `game/js/game-bot-core.js`.
  - Tournament shared pure helpers: `game/js/tournament-core.js`.
  - Tournament UI orchestration/history: `game/js/tournament.js` + `game/tournament.html`.
  - Regression tests: `game/tests/simulation.node.test.js`, `game/tests/game.bot.core.node.test.js`, and `game/tests/tournament.core.node.test.js`.

## Core Game Rules

- No RNG & No Physics Bumping: damage is exact, movement is exact, and units can overlap without getting stuck. This is crucial for mathematical balancing.
- Win Condition: Destroy the enemy's Main Base.
- Combat Targeting: visible enemy peons take priority over structures.
- Melee Override: if an enemy peon is already in attack range, it must be attacked immediately.
- Midline Rule: crossing the midline can relax structure vision/push behavior, but it must not make units ignore visible enemy peons.

## Entities & Baseline Stats

- The Peon (Basic Unit): 100 Max HP, 9 Damage, 1 Attack per second, moderate movement speed.
- The Tower (1 per side): 700 Max HP, 30 Damage (base). Physically blocks the lane. Does not respawn once destroyed.
- The Main Base (1 per side): 2000 Max HP, 10 Damage. Can attack enemies to prevent a single weak unit from winning.
- The Super Peon (Boss Unit): A massive, heavily armored unit unlocked in the late game to break stalemates.

## Spawning Dynamics

- The Global Timer (Speed): Spawn interval is deterministic and configurable (current default 6 seconds for balance iteration profile).
- The Player Upgrade (Volume): Players upgrade the batch size of the spawn.
  - Level 1 = 1 unit per wave.
  - Level 2 = 2 units per wave.

## Economy & Map Control

- Kill Bounty: Earn 10 Gold for every enemy peon killed.
- The Gold Shrine (Map Control): An invisible zone in the exact dead center of the map. Whichever side has units pushed past the 50% line controls it, earning a passive +2 Gold per second.
- Defender's Advantage: If pushed under your own tower, the tower helps kill enemy units, feeding you a massive burst of gold to buy a counter-attack upgrade.

## Upgrades

- Cost Scaling: First upgrade costs 50g. Costs double every level (50g → 100g → 200g → 400g).
- Upgrade Options:
  - Damage: +5 Damage per level.
  - Health: +50 Max HP per level.
  - Spawn Count: +1 unit per spawn wave per level.
  - Super Peon: Fixed extreme cost (e.g., 2000g). High risk/reward.

## UI & Debugging Tools

- Player UI: On-screen buttons to buy upgrades. Clicking a unit shows current stats (HP, Damage).
- Dev Tools: A time-scaling slider or variable to multiply deltaTime (fast-forward or slow-motion) to test late-game balancing quickly.
- Telemetry: keep downloadable deterministic run logs so late-game combat regressions can be inspected by tick.
- AI Opponents: Simple spending bots that auto-buy specific build orders (for example, one bot only buys Health, another only buys Spawn Count) to test against.

> Note: This document contains only game design. Agent definitions and AI workflow materials are stored in `.github/agents/`.