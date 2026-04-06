# Legion

Clean baseline for a deterministic tug-of-war prototype.

## Project layout

- `game/` - playable web prototype (HTML5 Canvas + vanilla JavaScript)
- `game/js/game.js` - game loop and rendering bootstrap
- `game/style.css` - page and canvas styling
- `GDD.md` - game design source of truth
- `.github/agents/` - agent definitions used by VS Code agent selection
- `ai/` - AI workflow notes, prompts, and helper docs

## Run

Open `game/index.html` in your browser.

## Rules for this repo

- Keep gameplay design in `GDD.md` only.
- Keep agent definition files in `.github/agents/`.
- Keep AI workflow notes and prompts in `ai/`.
- Keep implementation in `game/`.
