# Legion Game Design Document

## Overview

This document describes the design for the Legion game prototype.

## Tech Stack & Architecture

- Environment: Pure HTML5 Canvas and Vanilla JavaScript.
- Dependencies: No external dependencies or game engines.
- Architecture: Keep the code modular but simple. The game entry should live under `game/index.html`, with `game/style.css` for layout and `game/js/game.js` for the main loop.

## Core Game Rules

- No RNG & No Physics Bumping: damage is exact, movement is exact, and units can overlap without getting stuck. This is crucial for mathematical balancing.
- Win Condition: Destroy the enemy's Main Base.
- Combat Targeting: visible enemy peons take priority over structures.
- Melee Override: if an enemy peon is already in attack range, it must be attacked immediately.
- Midline Rule: crossing the midline can relax structure vision/push behavior, but it must not make units ignore visible enemy peons.

## Entities & Baseline Stats

- The Peon (Basic Unit): 100 Max HP, 10 Damage, 1 Attack per second, moderate movement speed.
- The Tower (1 per side): 500 Max HP, 20 Damage. Physically blocks the lane. Does not respawn once destroyed.
- The Main Base (1 per side): 2000 Max HP, 10 Damage. Can attack enemies to prevent a single weak unit from winning.
- The Super Peon (Boss Unit): A massive, heavily armored unit unlocked in the late game to break stalemates.

## Spawning Dynamics

- The Global Timer (Speed): The game clock controls how often waves spawn.
  - Minute 1 = every 3 seconds.
  - Minute 5 = every 2 seconds.
  - Minute 10 = every 1 second.
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