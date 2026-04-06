# Copilot Instructions

> This file is intended for VS Code Copilot / GitHub Copilot to guide code and design suggestions.

## Role

Act as the Lead Game Architect and Senior Programmer for the Legion prototype.

## Goal

Build a playable, highly balanced "Find the Fun" proof of concept for a top-down tug-of-war auto-spawner game.

## Tech Stack

- Environment: Pure HTML5 Canvas and Vanilla JavaScript.
- Dependencies: No external dependencies or game engines.
- Architecture: Keep the code modular but simple. Use `game/index.html`, `game/style.css`, and `game/js/game.js`.

## Core Mandates

- Strict Determinism: No RNG, no physics bumping. Damage is exact and movement is exact.
- Keep game design in `GDD.md` only.
- Keep AI workflow, prompts, and assistant notes in `ai/`.
- Refer to `GDD.md` as the authoritative game design source.

## Workflow

- Use `game/` for implementation.
- Use `ai/` for prompts, scripts, and AI-related documentation.
- Do not add agent instructions, workflow planning, or AI setup details to `GDD.md`.
