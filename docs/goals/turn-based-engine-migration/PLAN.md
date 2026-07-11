# Replace the Game Simulation with `turn-based-engine` Implementation Plan

**Intent:** Replace Miski and the game-owned spatial, visibility, and pathfinding implementations with the local
`turn-based-engine` repository while preserving the finished game's player-visible behavior.
**Current Behavior:** `GameSession` owns a Miski `World`, global component instances, a game-specific `SpatialIndex`, a
game-specific `VisibilityMap`, and a turn transaction that mutates all four. Rendering and audio read that state through
session visitor ports.
**Expected Outcome:** `turn-based-engine` is the sole owner of entity lifecycle, grid position, facing, blocking,
visibility/exploration, stable IDs, validated movement, and distance-field pathfinding. Spear continues to own combat,
turn-cost policy, AI decisions, progression, story, presentation, authored maps, rendering, and audio.
**Target-Perspective Output:** The executing agent performs and records a browser smoke in which a player can complete
the representative campaign flow in first-person or top-down view with the same movement, doors, pickups, combat,
enemy behavior, dialogue, audio, map transitions, retry, and reset behavior. The developer reviews the captured
screenshots or observed-state notes and sees no dependency on which ECS implementation is underneath.
**Truth Owner:** `CrawlerSession` owns crawler state; `CrawlerGame` owns Spear's custom numeric/tag components;
`GridPathfinder` owns cached distance fields; `GameSession` owns game policy and orchestration; `GameMap` remains the
authored and presentation map.
**Contract Boundary:** The application continues to consume `RuntimeSession` from `src/game/session_ports.ts`.
Rendering and audio receive visitor snapshots and must not import `CrawlerSession` or `CrawlerGame`.
**Cutover:** Direct, in-place replacement on one migration branch. There is no feature flag, compatibility facade,
dual runtime, or legacy mode. Intermediate work may temporarily be incomplete, but the branch is not mergeable until
the deletion and evidence gates pass.
**Displaced Path:** Miski `World`/components/systems/queries, `SpatialIndex`, game-owned `VisibilityMap`/LOS, manual
visibility refresh flags, and map-scoped entity clearing are deleted rather than retained or deprecated.
**Value Density:** One reusable engine replaces four overlapping infrastructure owners while leaving the distinctive
game rules and presentation intact.
**Acceptance Evidence:** Full automated checks and browser production build; engine invariants after representative
mutations; deterministic session scenarios for doors, combat, AI, story, and lifecycle; and a browser smoke run showing
both views and a complete representative gameplay sequence.
**Evidence Lane:** Automated contract/unit/integration tests first, full repository checks second, browser smoke and
captured screenshots/notes last. If browser evidence cannot be captured, report "implemented but unproven."
**Kill Criteria:** No Miski dependency/imports, no `SpatialIndex`, no game-owned `VisibilityMap`, no global ECS component
objects, no direct mutation of crawler core storage, no retained entity handles across map runtimes, and no alternate
simulation path.
**Architecture Slice:** `GameMap -> crawler map adapter -> GameRuntime -> GameSession -> RuntimeSession visitors ->
render/audio`; commands flow back through `GameSession -> turn transaction -> CrawlerSession/CrawlerGame`.
**Plan Review Gate:** Requires PRE review before execution.

## Greenfield decisions

- Backward compatibility is not required. Do not preserve Miski-shaped APIs or old snapshot schemas.
- Do not publish, version, vendor, or create a workspace package for `turn-based-engine`. Both repositories are local
  experiments. Use a direct sibling-repository import mapping and verify it through the production browser build.
- Do not introduce feature flags, adapters that imitate Miski, parallel session implementations, or deprecated aliases.
- Keep Spear's existing `RandomSource` and roll sequence during this migration. Engine-owned RNG/save integration is a
  separate decision and is not required to replace ECS/spatial ownership.
- Internal entity handles may change across map loads. Only stable IDs and copied durable component values may cross a
  runtime boundary.
- Player-visible behavior is the compatibility target; internal types, entity numbers, file layouts, and test fixtures
  may change freely.

## Ownership and contracts

| Concern | Truth owner after cutover | Contract |
| --- | --- | --- |
| Entity lifecycle | `CrawlerSession` | Every game entity is positioned and uses `spawnCrawler`/`despawnCrawler`. |
| Position and facing | `CrawlerSession` | Read through pose methods/storage; write through commands, `setFacing`, or `teleport`. |
| Movement/sight/effect blocking | `CrawlerSession` block masks | No custom `Blocking` component or runtime terrain flags. |
| Visibility/exploration | `CrawlerSession` | Player has radius `6`, Euclidean metric, and authored facing cone. |
| Custom game state | `CrawlerGame` storage | Numeric schemas and empty tag schemas defined by Spear. |
| Pathfinding | `GridPathfinder` | One batch per enemy phase; live immediate occupancy, phase-stale deeper fields. |
| Turn scheduling | Spear turn transaction | Engine events are factual; Spear decides free versus consumed turns. |
| Combat/AI/story/progression | Spear systems | Use engine pose/spatial APIs and custom component storage. |
| Authored/render map | `GameMap` | Engine `GridMap` is derived physics only and never replaces render/content data. |
| Render/audio boundary | `RuntimeSession` visitor ports | No engine runtime types leak into rendering/audio implementations. |

### Target runtime

Create `src/ecs/runtime.ts` with a plain runtime value, not a `World`-shaped facade:

```text
GameRuntime
├── game: CrawlerGame<GameComponentMap>
├── crawler: CrawlerSession<GameComponentMap>
├── pathfinder: GridPathfinder
└── long-lived query/read-model closures owned by their consuming modules
```

`createRuntime(map)` derives the physics map, registers the custom component schema, creates a Euclidean crawler
session, and creates its pathfinder. It does not own game rules, map transitions, rendering, audio, or RNG policy.

### Critical entity rule

Engine `Entity` values are packed generational handles. Never use an entity handle as a typed-array index. Inside a
query, use the callback's `slot` with `getAt`. Outside a query, use generation-checking `storage.get(entity, field)` and
`storage.set(entity, field, value)`.

## Architecture slice

### Files to create

- `src/map/crawler_map.ts` — pure `GameMap` to engine `GridMap` conversion.
- `src/ecs/runtime.ts` — engine runtime type and construction.
- `tests/map/crawler_map.test.ts` — exact physics-mask conversion evidence.
- `tests/ecs/runtime.test.ts` — component registration, tags, pose, visibility, stable ID, and invariants.

### Files to modify

- Dependency/configuration: `deno.json`; `vite.config.ts` only if an observed build failure requires sibling-source
  allowance.
- ECS ownership: `src/ecs/components.ts`, `prefabs.ts`, `combat.ts`, `interactions.ts`, `progression.ts`, `drawables.ts`,
  `sounds.ts`, `session.ts`, `session/lifecycle.ts`, `session/sprite_animations.ts`, `session/story_actions.ts`, and all
  files under `src/ecs/turn/`.
- Boundary types: `src/game/session_ports.ts` plus files that import Miski `Entity` only for type identity:
  `src/game/combat_feedback.ts`, `events.ts`, `examine.ts`, `messages.ts`, `presentation.ts`, `sound.ts`,
  `sound_cues.ts`, `transition.ts`, and `src/audio/audio_runtime.ts`.
- Perception: `src/game/perception.ts` retains noise/hearing only and delegates sight/effect lines to the engine.
- Visibility: `src/game/visibility.ts` retains only the `TileVisibility` contract, or that contract moves into
  `session_ports.ts` and the file is deleted.
- Lifecycle integration: `src/entry/session_lifecycle.ts` and `src/entry.ts` only where fresh per-map runtimes change
  assumptions.
- Tests under `tests/ecs/`, and affected fixtures under `tests/game/`, `tests/render/`, `tests/audio/`, and
  `tests/entry/`.

### Files to delete at cutover

- `src/ecs/world.ts`
- `src/ecs/spatial.ts`
- `src/ecs/queries.ts`
- The `VisibilityMap` implementation and its implementation-only tests.
- Miski `System`, `Query`, `Component`, partition types, bound-system helpers, and every orphaned import/helper.
- `GridPos`, custom `Facing`, `Blocking`, and `MapScoped` component definitions.
- `@phughesmcr/miski` from `deno.json` after the final source/test import is gone.

### Files to avoid

- `src/render/raycast/**`, raycaster algorithms, UI/islands/input, content/dialogue catalogs, authored maps,
  `compiled_maps.json`, and Tiled compilation. The new runtime must satisfy their existing contracts.
- `/Users/peter/Documents/turn-based-engine/**`. The library is consumed as-is during this migration.
- `vite.config.ts` unless `deno task build` demonstrates an actual sibling-source problem.

## Read and write paths

### Read path

```text
render/audio
  -> RuntimeSession
  -> GameSession visitor or pose method
  -> CrawlerSession pose/visibility + CrawlerGame custom storage/query
```

- `getVisibility()` returns a stable, allocation-free view delegating to `crawler.isVisibleTo` and
  `crawler.isDiscoveredBy` for the current player/runtime.
- Drawable/light/sound visitors preserve reusable scratch objects, drawable-layer ordering, and optional component
  behavior.
- Query objects are instance-bound. Create them once in the read-model closure bound to the current runtime; replace
  those closures whenever a map runtime is replaced.

### Write path

```text
input
  -> GameSession.handlePlayerCommand
  -> Spear turn transaction and intent policy
  -> CrawlerSession command/mutator + CrawlerGame custom storage
  -> Spear GameEvent/SoundCue/Presentation
```

- Relative player move: resolve secret-door bump first; otherwise dispatch engine `move`. `entityMoved` consumes a
  turn; `movementBlocked` is free. Collect mask-zero items at the destination only after successful movement.
- Player turn: dispatch engine `turn`; Spear continues treating it as free.
- Wait/attack/interact/select/examine: remain Spear policy.
- Enemy pursuit: `beginBatch`, compute `nextStepToward`, convert delta to cardinal direction, dispatch engine `step`,
  and `endBatch` in `finally`.
- Enemy flee: choose a live unblocked adjacent cell and dispatch `step`.
- Story relocation: use `crawler.teleport`; never write position storage.
- Door open/shatter: synchronously update the custom `Door.open` state and call `setBlockMask`.
- Defeat/pickup cleanup: use `despawnCrawler`; corpses/death effects use mask-zero `spawnCrawler`.

## Physics mapping decisions

`src/map/crawler_map.ts` converts row-major Spear tile flags exactly:

| Spear flag | Engine channel |
| --- | --- |
| `BlocksMove` | `TerrainBlock.Movement` |
| `BlocksSight` | `TerrainBlock.Sight` |
| `BlocksAttack` | `TerrainBlock.EffectLine` |

Authored door cells are already required to be non-blocking terrain and between exactly one opposite pair of blocking
tiles. Do not rewrite door terrain in the adapter; assert this contract in tests. `GameMap` remains available to the
renderer for textures, barrier axes, and secret-door appearance.

Entity masks preserve current behavior:

| Entity | Initial block mask |
| --- | --- |
| Player, enemy, NPC, terminal, other currently blocking actor | `Movement` |
| Closed normal/secret door | `Movement | Sight | EffectLine` |
| Closed glass door | `Movement | EffectLine` |
| Open/shattered door | `0` |
| Items, decoration, corpse, death effect, light, sound | `0` |

Line attacks preserve the existing two-stage rule: inspect the `Movement` occupant as the potential target/blocking
actor, and use `EffectLine` for terrain/door occlusion. Do not add `EffectLine` to every actor merely to simplify the
scan; that would conflate target occupancy with environmental occlusion.

## Map lifecycle

The engine map/session is immutable. The outer Spear `GameSession` remains stable for application ports, but replaces
its private `GameRuntime` and player handle.

- Normal load: capture durable player component values, create the destination runtime, spawn the player at the authored
  spawn with an explicit stable player ID, copy durable values, spawn map content, assert uniqueness/invariants, and
  capture the new level-entry checkpoint.
- Retry: create a fresh runtime for the same map using the level-entry checkpoint.
- Reset: create a fresh runtime using default or cheat progression.
- Map completion: transfer values after level completion and transient key/code clearing.
- Never retain an engine entity handle, query, visitor closure, or visibility view bound to the old runtime. Stable ID
  and copied domain values are the only cross-runtime identity/state.
- Clear pending dialogue state at replacement. Existing first-person reset and audio resynchronization remain at the
  entry transition boundary.

## Implementation tasks

### Task 1 — Lock player-visible characterization

**Files:** Existing focused tests in `tests/ecs/`, `tests/entry/`, `tests/render/`, and `tests/game/`; add assertions only
where a listed behavior lacks coverage.

**Allowed scope:** Tests only. Do not add compatibility production code.

**Expected output:** Explicit parity evidence for player pose/free turning, Euclidean facing-cone FOV and exploration,
ordinary/locked/secret/glass doors, item co-location/pickup, line and adjacent attacks, sequential enemy movement,
story teleport, animations, drawable/audio snapshots, map load, retry, reset, and victory.

**Verification:** `deno task check`.

**Acceptance evidence:** A named test protects every behavior above, and the pre-migration baseline is recorded as 450
passing tests.

**Parallel:** No. This is the baseline gate for all later work.

### Task 2 — Add the direct local dependency and physics-map adapter

**Files:** `deno.json`, new `src/map/crawler_map.ts`, new `tests/map/crawler_map.test.ts`; `vite.config.ts` only after an
observed failure.

**Allowed scope:** One direct sibling import mapping; pure map conversion. No ECS/session changes.

**Expected output:** Valid engine `GridMap` with exact dimensions, row order, and blocking channels for floor, wall,
barrier, and out-of-bounds behavior. Door-floor authoring assumptions fail loudly in tests/validation rather than being
silently rewritten.

**Verification:**

```sh
deno test tests/map/crawler_map.test.ts
deno check src/map/crawler_map.ts
deno task build
```

**Acceptance evidence:** The production browser bundle resolves the sibling engine source without packaging work.

**Parallel:** No. It establishes the target dependency and map contract.

### Task 3 — Replace component definitions and create the engine runtime

**Files:** Rewrite `src/ecs/components.ts`; create `src/ecs/runtime.ts` and `tests/ecs/runtime.test.ts`; begin porting
`tests/ecs/helpers.ts` to construct the new runtime.

**Allowed scope:** Component schemas, domain component constants/types, runtime construction, engine invariants. Do not
create a Miski-shaped facade.

**Expected output:** One typed custom component map; engine-owned position/facing/blocking removed; tags represented as
empty schemas; runtime created with capacity `1000`, Euclidean visibility, map ID, and pathfinder. Task 4's player
prefab supplies visibility radius `6`.

**Verification:**

```sh
deno test tests/ecs/runtime.test.ts
deno check src/ecs/components.ts src/ecs/runtime.ts
```

**Acceptance evidence:** A runtime test spawns/query tags and numeric components, reads player pose/FOV, proves stable ID
lookup, and calls `crawler.assertInvariants()`.

**Parallel:** No; depends on Task 2's import mapping and physics-map contract.

### Task 4 — Port entity construction and durable progression

**Files:** `src/ecs/prefabs.ts`, `src/ecs/progression.ts`, `src/ecs/session/lifecycle.ts`,
`src/ecs/session/story_actions.ts`, `tests/ecs/prefabs.test.ts`, `progression.test.ts`, and relevant session lifecycle
fixtures.

**Allowed scope:** Crawler spawn/despawn, custom component values, player checkpoint copying, story target uniqueness.

**Expected output:** Every prefab becomes a crawler entity with the mask table above. Player reset/cheat/durable/transient
state works without Miski. Corpses and effects are mask-zero crawler entities. Story relocations use `teleport`.

**Verification:**

```sh
deno test tests/ecs/prefabs.test.ts tests/ecs/progression.test.ts
deno check src/ecs/prefabs.ts src/ecs/progression.ts src/ecs/session/lifecycle.ts src/ecs/session/story_actions.ts
```

**Acceptance evidence:** Tests assert exact component membership/masks, progression checkpoint round-trip, unique story
targets, teleport invariants, and no entity-handle indexing.

**Parallel:** No; depends on Tasks 2 and 3.

### Task 5 — Port interactions, combat, and spatial write policy

**Files:** `src/ecs/interactions.ts`, `src/ecs/combat.ts`, `src/game/perception.ts`, `tests/ecs/interactions.test.ts`,
`tests/ecs/combat.test.ts`, and affected test helpers.

**Allowed scope:** Game rules using `CrawlerSession` probes/mutators and custom storage. Retain Spear's d20/RNG behavior.

**Expected output:** Door state and masks change together; pickups despawn through crawler lifecycle; attack scans preserve
actor targeting versus environmental `EffectLine`; defeat produces the same events and cleanup.

**Verification:**

```sh
deno test tests/ecs/interactions.test.ts tests/ecs/combat.test.ts
deno check src/ecs/interactions.ts src/ecs/combat.ts src/game/perception.ts
```

**Acceptance evidence:** Normal/locked/secret/glass door tests, hit/miss/critical/defeat tests, line occlusion tests, and
`crawler.assertInvariants()` after open, shatter, pickup, and defeat.

**Parallel:** No; depends on Task 4 and establishes the write contract used by turns.

### Task 6 — Port player/enemy turn resolution and pathfinding

**Files:** `src/ecs/turn/actions.ts`, `enemy.ts`, `player.ts`, `transaction.ts`, `tests/ecs/enemy.test.ts`, and
`tests/ecs/turn_transaction.test.ts`.

**Allowed scope:** Intent resolution, cost mapping, live spatial probes, engine commands/mutators, enemy batch lifecycle.
Do not move game policy into the engine.

**Expected output:** Player relative move and turn preserve free/consumed semantics; enemy actors use absolute `step` and
engine pathfinding; later enemies see live immediate occupancy while reusing phase fields; enemy phase still stops on
player defeat.

**Verification:**

```sh
deno test tests/ecs/enemy.test.ts tests/ecs/turn_transaction.test.ts
deno check src/ecs/turn/actions.ts src/ecs/turn/enemy.ts src/ecs/turn/player.ts src/ecs/turn/transaction.ts
```

**Acceptance evidence:** Deterministic actor order, route-around, investigate, flee, pounce, ranged attack, blocked move,
free turn, wait, and defeat-stop tests pass; batches always end through `finally`; invariants pass after a complete phase.

**Parallel:** No; depends on Task 5.

### Task 7 — Port renderer/audio read models and animations

**Files:** `src/ecs/drawables.ts`, `src/ecs/sounds.ts`, `src/ecs/session/sprite_animations.ts`,
`src/game/session_ports.ts`, Entity type-only consumers listed in the architecture slice, and affected render/audio/game
tests.

**Allowed scope:** Read models, visitor scratch, optional-component membership, entity type identity, animation custom
components. Do not change raycasting or visual layout.

**Expected output:** Long-lived engine queries use query `slot`; optional values use membership checks; visitor objects
remain reused; layer ordering and animation/health/door/light/sound snapshots remain unchanged.

**Verification:**

```sh
deno test tests/render/drawables.test.ts tests/render/first_person.test.ts tests/audio/audio_runtime.test.ts
deno check src/ecs/drawables.ts src/ecs/sounds.ts src/ecs/session/sprite_animations.ts src/game/session_ports.ts
```

**Acceptance evidence:** Focused read-model fixtures construct `GameRuntime` directly and existing renderer/audio
expectations pass without changes to raycaster algorithms. A review confirms no packed entity handle is used as a
storage index and no per-frame allocation is introduced in hot loops. Runtime-loop integration is intentionally gated
by Task 8 after `GameSession` is replaced.

**Parallel:** No; run after Tasks 4–6 so the component/runtime contracts it reads are stable.

### Task 8 — Replace `GameSession` and map lifecycle in place

**Files:** `src/ecs/session.ts`, `src/entry/session_lifecycle.ts`, `src/entry.ts`, `tests/ecs/session.test.ts`, and
`tests/entry/session_lifecycle.test.ts`.

**Allowed scope:** Outer orchestration, fresh runtime replacement, stable visibility view, visitor rebinding, checkpoint
transfer, audio/render transition coordination. No second session implementation.

**Expected output:** The existing application-facing `GameSession` owns the current engine runtime, replaces it for
load/retry/reset, never retains old handles/queries, and continues satisfying `RuntimeSession`.

**Verification:**

```sh
deno test tests/ecs/session.test.ts tests/entry/session_lifecycle.test.ts tests/game/runtime_loop.test.ts
deno check src/ecs/session.ts src/entry/session_lifecycle.ts src/entry.ts
```

**Acceptance evidence:** Session and runtime-loop tests prove durable state and story flags survive normal loads,
transient/map entities do not, retry restores the entry checkpoint, reset restores defaults/cheat state, metadata is
replaced, render/audio integration reads the replaced `GameSession`, and the current runtime passes invariants after
each lifecycle operation.

**Parallel:** No; this is the integration point for Tasks 4–7.

### Task 9 — Delete displaced infrastructure and close the cutover

**Files:** Delete `src/ecs/world.ts`, `spatial.ts`, `queries.ts`, obsolete visibility implementation/tests, and every
orphan; update `deno.json`; remove dead imports/types/helpers across `src/` and `tests/`.

**Allowed scope:** Deletion and direct fallout only. Do not refactor unrelated renderer/UI/content code.

**Expected output:** Engine runtime is the only entity/spatial/FOV path and Miski is absent.

**Verification:**

```sh
rg -n '@phughesmcr/miski|SpatialIndex|VisibilityMap|new Query|world\.' src tests
rg -n '\bGridPos\b|\bBlocking\b|\bMapScoped\b' src/ecs
deno task check
deno task build
```

The first two commands must produce no legacy hits; review any legitimate textual collision explicitly rather than
weakening the gate.

**Acceptance evidence:** Full checks pass, browser bundle succeeds against sibling engine source, the diff contains no
deprecated path, and all changed lines trace to the migration or dead-code deletion.

**Parallel:** No; final kill gate.

### Task 10 — Capture target-perspective acceptance evidence

**Files:** No production changes. Record evidence in the execution report or a plan-local `EVIDENCE.md` if the execution
workflow creates one.

**Allowed scope:** Run and inspect only; fix discovered migration defects through their owning task/file.

**Expected output:** One representative browser session demonstrates:

1. Start authored map in first-person and top-down views.
2. Turn freely; move successfully; bump blocked terrain.
3. Pick up an item and see HUD/audio feedback.
4. Open a normal or locked door; reveal a secret door; shatter glass.
5. Alert an enemy through sight/noise; observe pursuit/pathing and combat.
6. Attack through valid/blocked lines; defeat an enemy; observe animation/corpse.
7. Trigger dialogue/story relocation.
8. Activate a terminal and load another map.
9. Exercise defeat/retry and victory/reset.
10. Confirm ambient and enemy idle audio resynchronize after map replacement.

**Verification:** `deno task dev` for the smoke session, then one final `deno task check && deno task build`.

**Acceptance evidence:** The executing agent records screenshots or concise observed-state notes for both views and the
lifecycle transition, with no browser console errors. The developer reviews that evidence. If it cannot be captured,
the final status is "implemented but unproven."

**Parallel:** No; final user-perspective gate.

## Plan-level risks and mitigations

| Risk | Consequence | Mitigation/evidence |
| --- | --- | --- |
| Packed entity used as slot | Silent component corruption after slot reuse | `slot`/`getAt` in queries, `get` elsewhere; slot-reuse and review tests. |
| Optional query semantics differ | Missing doors, animations, health, or audio | Explicit membership checks and unchanged visitor snapshot tests. |
| Old runtime closure survives map load | Reads/mutates discarded map | Rebind visitors/queries on replacement; lifecycle tests across two maps. |
| Door custom state diverges from mask | Visual/physics mismatch | One synchronous mutation function and invariant tests after open/shatter. |
| Actor occupancy conflated with effect occlusion | Shots stop before valid targets | Preserve two-stage Movement occupant + EffectLine environment scan. |
| Engine auto-FOV plus old refresh policy | Duplicate work or stale ownership | Delete refresh flags/manual visibility owner when turn writes move. |
| Direct sibling import fails in Vite | Development works but production build fails | Build in Task 2; change Vite only on observed evidence. |
| Entity handle reuse leaks presentation/audio state | Stale tween or loop appears after map load | Existing first-person reset/audio sync; cross-map render/audio tests and smoke. |
| RNG changes accidentally | Combat/replay behavior drifts | Keep Spear `RandomSource`; RNG migration is a non-goal. |
| Temporary incomplete branch is mistaken for mergeable | Broken mainline or duplicate paths | Direct cutover branch; only Tasks 9–10 satisfy merge/complete gate. |

## Final acceptance checklist

- [x] `CrawlerSession` is the sole entity, pose, blocking, visibility, and stable-ID owner.
- [x] `CrawlerGame` is the sole custom component storage owner.
- [x] `GameSession` alone maps engine facts to Spear turn/game policy.
- [x] `GameMap` remains render/content truth and `GridMap` remains derived physics truth.
- [x] All map transitions create a fresh runtime and transfer only durable values/stable identity.
- [x] Render/audio remain behind `RuntimeSession` and allocate no new hot-loop objects.
- [x] Doors, pickups, combat, enemy AI, story, animations, and lifecycle parity tests pass.
- [x] Engine invariants pass after representative mutations and complete enemy phases.
- [x] Miski, `SpatialIndex`, static queries, custom core components, and `VisibilityMap` are deleted.
- [x] `deno task check` and `deno task build` pass.
- [x] Browser acceptance evidence is captured, with incomplete campaign scenarios explicitly labeled implemented but
      unproven in `EVIDENCE.md`.

## Non-goals

- Publishing, versioning, vendoring, or creating a package/workspace boundary for `turn-based-engine`.
- New gameplay, content, UI, rendering, audio, combat, AI, or map-authoring features.
- Save UI or adopting engine snapshots as the campaign save format.
- Replacing Spear's RNG or changing authored roll sequences.
- Optimizing beyond current hot-loop and benchmark requirements.
- Modifying `turn-based-engine` unless execution discovers a new demonstrated blocker and the user separately authorizes it.
