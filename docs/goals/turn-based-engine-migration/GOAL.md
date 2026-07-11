# Goal: Replace the Game Simulation with `turn-based-engine`

Use Krypton Execution to execute `docs/goals/turn-based-engine-migration/PLAN.md`.

Core rules:

- Treat `PLAN.md` as the source plan.
- Preserve intent, ownership, contract, cutover, evidence, and kill criteria.
- This is greenfield: replace in place and delete displaced code immediately; do not add compatibility shims, feature
  flags, dual runtimes, deprecated aliases, or backward-compatibility work.
- Keep `GameSession` as game-policy owner and `RuntimeSession` as the render/audio boundary.
- Make `turn-based-engine` the sole owner of entity lifecycle, pose, blocking, FOV/exploration, stable IDs, and
  pathfinding.
- Keep `GameMap` as authored/render truth and derive the engine physics map.
- Keep Spear's current RNG during this migration.
- Use the local sibling engine directly; do not create a package boundary.
- Never use a packed engine entity handle as a typed-array slot.
- Every new simulation path must replace its owner directly, and every displaced path must be deleted before completion.
- Capture acceptance evidence from the player's perspective.
- Say "implemented but unproven" if that evidence cannot be captured.
