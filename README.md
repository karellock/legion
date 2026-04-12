# Legion

Clean baseline for a deterministic tug-of-war prototype.

## Project layout

- `game/` - playable web prototype (HTML5 Canvas + vanilla JavaScript)
- `game/js/simulation.js` - deterministic combat, targeting, spawning, and telemetry
- `game/js/game.js` - game loop and rendering bootstrap
- `game/js/game-bot-core.js` - shared deterministic bot strategy helpers for game loop orchestration
- `game/js/tournament-core.js` - shared pure tournament helpers (strategies, map profiles, ranking/aggregate helpers)
- `game/js/tournament.js` - tournament page orchestration, rendering, and history persistence
- `game/tests/simulation.node.test.js` - deterministic simulation regression tests
- `game/tests/game.bot.core.node.test.js` - deterministic tests for extracted game bot helper logic
- `game/tests/tournament.core.node.test.js` - deterministic tests for tournament core helper logic
- `game/tests/run-all-node-tests.js` - convenience runner for all node-based tests
- `game/style.css` - page and canvas styling
- `GDD.md` - game design source of truth
- `.github/agents/` - agent definitions and AI workflow materials

## Run

Open `game/index.html` in your browser.
Open `game/tournament.html` for round-robin AI tournament testing.

Tournament history notes:
- The tournament page saves run history in browser local storage (`legion-tournament-history-v1`).
- You can export/import run JSON files from the tournament History section.
- Optional local folder auto-load uses `logs/tournament-history-manifest.json` with `{ "files": ["file1.json", "subdir/file2.json"] }` and attempts to fetch each file from `logs/`.

## Test

- CI runs `game/tests/simulation.node.test.js` on every pull request to `main`.
- CI also runs `game/tests/tournament.core.node.test.js`.
- CI also runs extracted helper tests via `game/tests/run-all-node-tests.js`.
- The merge gate currently enforces 95% minimum coverage for lines, functions, branches, and statements.
- Keep tests deterministic. Do not add RNG-based assertions.
- Local full node test run: `node game/tests/run-all-node-tests.js`.

## Rules for this repo

- Keep gameplay design in `GDD.md` only.
- Keep agent definitions and AI materials in `.github/agents/`.
- Keep implementation in `game/`.
