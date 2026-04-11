# Legion

Clean baseline for a deterministic tug-of-war prototype.

## Project layout

- `game/` - playable web prototype (HTML5 Canvas + vanilla JavaScript)
- `game/js/simulation.js` - deterministic combat, targeting, spawning, and telemetry
- `game/js/game.js` - game loop and rendering bootstrap
- `game/tests/simulation.node.test.js` - deterministic simulation regression tests
- `game/style.css` - page and canvas styling
- `GDD.md` - game design source of truth
- `.github/agents/` - agent definitions and AI workflow materials

## Run

Open `game/index.html` in your browser.

## Test

- CI runs `game/tests/simulation.node.test.js` on every pull request to `main`.
- The merge gate currently enforces 95% minimum coverage for lines, functions, branches, and statements.
- Keep tests deterministic. Do not add RNG-based assertions.

## Rules for this repo

- Keep gameplay design in `GDD.md` only.
- Keep agent definitions and AI materials in `.github/agents/`.
- Keep implementation in `game/`.
