# Turn-based engine migration evidence

## Automated acceptance

- Pre-migration characterization baseline: `deno task check` — 450 passed, 0 failed.
- Post-migration full gate: `deno task check` — 405 passed, 0 failed. The lower count is the intentional deletion of
  the displaced `SpatialIndex` and `VisibilityMap` implementation suites and replacement of Miski-shaped unit fixtures
  with engine-native invariant and behavior tests.
- Production bundle: `deno task build` — client and SSR builds passed while resolving the sibling engine source through
  `turn-based-engine/crawler` and `turn-based-engine/ecs`; no Vite configuration change was required.
- Cutover searches found no Miski imports/dependency, `SpatialIndex`, `VisibilityMap`, global queries, `GridPos`,
  `Blocking`, or `MapScoped` simulation paths.
- Focused engine-native tests cover physics-mask conversion, stable IDs, pose/FOV, custom component tags/storage,
  exact prefab masks, item co-location, door state/mask synchronization, effect-line combat, defeat cleanup, enemy
  pursuit/investigation/fleeing, phase-stale pathfields with live immediate occupancy, free turns, fresh map runtimes,
  retry/reset, story relocation, animation/corpse lifecycle, render visitors, and audio visitors.

## Browser smoke — 2026-07-11

Executed against `http://127.0.0.1:5173/` using the development bundle:

1. Cleared the launch gate, title screen, and authored intro into `Boot Sector`.
2. Observed the initial map rendered in first-person with the expected compass, weapon, health HUD, textured terrain,
   and discovered corridor.
3. Toggled to top-down view and observed the player marker, authored entities, current visibility, explored cells, and
   status panel.
4. Turned right without consuming an enemy phase, attempted a blocked forward step into a wall, then turned north and
   completed a successful forward step. The first-person camera/compass and top-down discovery updated accordingly.
5. Loaded `The Nexus` directly with the supported `?map=The%20Nexus&cheat` smoke URL. Both first-person and top-down
   views rendered the later authored map, and the status panel showed the cheat durable loadout on the fresh runtime.
6. Browser console inspection after both sessions reported no warnings or errors.

The browser smoke proves the real rendering/input bundle and fresh later-map construction. Door, pickup, dialogue,
combat, enemy phase, terminal transition, defeat/retry, and victory/reset behavior are covered by deterministic
application-level `GameSession` tests rather than a complete manual campaign playthrough. Under Task 10's evidence
rule, those scenarios remain **implemented but unproven through a representative end-to-end browser campaign**.
