# AI Workspace

This folder stores AI-related workflow material for the Legion project.

## Structure

- prompts/ - reusable prompt templates
- scripts/ - helper automation notes and scripts
- notes/ - temporary planning and assistant notes

## Rule

Do not place gameplay design here. Keep all game design in GDD.md.
Do not place agent definition files here. Keep agent files in .github/agents/.

## Knowledge Gained

- Use two-phase combat resolution (target first, then apply queued damage) to avoid side-order bias.
- Peon target priority: nearest enemy peon first; fallback to tower, then base.
- Vision gating should control when peons start turning/chasing.
- Keep attack feedback visible but lightweight (tower/base beams + short peon slashes).

## Token-Min Checklist

- Keep prompts short and task-specific.
- Avoid repeating full context if files already encode it.
- Update constants before modifying systems.
