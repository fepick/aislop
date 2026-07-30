# Wrestling Simulation Project Instructions

## General

- Use HTML, CSS, and vanilla JavaScript only.
- Do not add external libraries unless explicitly requested.
- Keep all asset paths relative.
- Support static hosting, including GitHub Pages subpaths.
- Do not modify files outside the requested scope.
- Before changing code, inspect relevant files and explain the plan briefly.
- Keep game rules, AI, rendering, simulation, and UI separated.
- Do not make rendering affect simulation results.
- Do not use `Math.random()` in combat or AI logic.
- Use a seed-based RNG for reproducible simulation results.
- Record `rulesVersion` and `aiProfileVersion` in simulation results.

## TODO Workflow

- Before planning or implementing, read `docs/todo.md` in read-only mode.
- Follow its priority and approval rules.
- Never edit `docs/todo.md` unless the user explicitly asks for that file to be changed.

## Simulation

- Use a fixed simulation timestep of 1 / 60 seconds.
- Rendering may use requestAnimationFrame and should target at least 30 FPS.
- Do not make simulation behavior depend on render FPS.
- Spectator mode and headless simulation mode must share combat rules and AI logic.
- Preserve a 16:9 logical resolution of 1920 x 1080.
- Maintain aspect ratio on desktop and landscape mobile devices.

## Scope Control

- Do not implement features marked as future work unless explicitly requested.
- Preparation screens, stat allocation UI, multiplayer, sound, and announcer systems are future work.
- When requirements are ambiguous, ask or record the ambiguity instead of inventing a permanent rule.

## Documentation

- Update README.md when run commands, asset conventions, or controls change.
- Store approved design decisions in docs/decisions/.
- Store generated implementation plans in docs/plans/.
