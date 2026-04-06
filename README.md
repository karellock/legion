# Legion

Clean baseline for a deterministic tug-of-war prototype.

## Project layout

- `game/` - playable web prototype (HTML5 Canvas + vanilla JavaScript)
- `game/js/game.js` - game loop and rendering bootstrap
- `game/style.css` - page and canvas styling
- `GDD.md` - game design source of truth
- `.github/agents/` - agent definitions and AI workflow materials

## Run

Open `game/index.html` in your browser.

## Rules for this repo

- Keep gameplay design in `GDD.md` only.
- Keep agent definitions and AI materials in `.github/agents/`.
- Keep implementation in `game/`.

## AI Workflow (Token-Min)

- Default to small, surgical edits instead of broad refactors.
- Keep simulation logic in `game/js/simulation.js` and rendering/UI in `game/js/game.js`.
- For balance changes, edit constants first; avoid changing unrelated systems.
- Keep prompts and notes concise under `.github/agents/ai/`.
