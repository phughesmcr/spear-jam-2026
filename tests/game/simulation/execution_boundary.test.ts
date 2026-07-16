import { DisplayName } from "@/src/game/content/names.ts";
import type { PlayerCommand } from "@/src/game/model/commands.ts";
import { SPRITE_WALK_MS, writeComponent } from "@/src/game/simulation/components.ts";
import { createSessionProjection } from "@/src/game/presentation/session_projection.ts";
import { Direction } from "@/src/game/world/direction.ts";
import {
  createGameSession,
  createPlayer,
  createRuntime,
  flatTestMap,
  type GameRuntime,
} from "@/tests/game/simulation/helpers.ts";
import { assertEquals, assertNotEquals, assertThrows } from "@std/assert";

Deno.test("failed turn restores authoritative state and RNG without leaking core facts", () => {
  const runtime = createRuntime(flatTestMap(4));
  const player = createPlayer(runtime, { x: 0, y: 0, dir: Direction.East });
  const before = authoritativeState(runtime);
  const publishedFacts: unknown[] = [];

  assertThrows(
    () => {
      const result = runtime.simulation.executeTurn(({ dispatch, mutation, random }) => {
        dispatch({ type: "move", entity: player, direction: "forward" });
        writeComponent(mutation, player, "Health", { current: 1 });
        mutation.spawnCrawler({ x: 3, y: 0 });
        random.nextFloat();
        throw new Error("reject authoritative turn");
      });
      publishedFacts.push(...result.coreEvents);
    },
    Error,
    "reject authoritative turn",
  );

  assertEquals(authoritativeState(runtime), before);
  assertEquals(runtime.simulation.ecs.storage.Health.get(player, "current"), 10);
  assertEquals(publishedFacts, []);
  assertEquals(runtime.simulation.executeTurn(() => undefined).coreEvents, []);
  runtime.simulation.crawler.assertInvariants();
});

Deno.test("equal-seed Spear command transcripts are deterministic", () => {
  const first = runCommandTranscript(0.25);
  const replay = runCommandTranscript(0.25);

  assertEquals(replay, first);
  assertEquals(first.results.some((result) => result.events.length > 0), true);
});

Deno.test("presentation projection ticking cannot mutate authoritative simulation", () => {
  const runtime = createRuntime(flatTestMap(4));
  const player = createPlayer(runtime, { x: 0, y: 0, dir: Direction.East });
  const turn = runtime.simulation.executeTurn(({ dispatch }) =>
    dispatch({ type: "move", entity: player, direction: "forward" })
  );
  const beforePresentation = authoritativeState(runtime);
  const projection = createSessionProjection();

  projection.consume(player, turn.coreEvents, [], 100);
  assertEquals(projection.advance(100), false);
  assertEquals(projection.advance(100 + SPRITE_WALK_MS), false);

  assertEquals(authoritativeState(runtime), beforePresentation);
  assertEquals(runtime.simulation.crawler.entityPosition(player), { x: 1, y: 0 });
  runtime.simulation.crawler.assertInvariants();
});

Deno.test("normal map loads continue RNG while retries restore level-entry RNG", () => {
  const level = combatLevel();
  const continuedSession = createGameSession(level, 123, { now: () => 100 });
  continuedSession.handlePlayerCommand({ type: "attack" });
  continuedSession.loadMap(level);
  const continued = continuedSession.handlePlayerCommand({ type: "attack" });

  const reset = createGameSession(level, 123, { now: () => 100 })
    .handlePlayerCommand({ type: "attack" });
  assertNotEquals(continued.events, reset.events);

  const retriedSession = createGameSession(level, 123, { now: () => 100 });
  const firstAttempt = retriedSession.handlePlayerCommand({ type: "attack" });
  retriedSession.retryMap(level);
  const retry = retriedSession.handlePlayerCommand({ type: "attack" });
  assertEquals(retry, firstAttempt);
});

function runCommandTranscript(seedUnit: number) {
  const session = createGameSession(
    flatTestMap(5, 3, [
      { prefab: "player", x: 1, y: 1, dir: Direction.East },
      {
        prefab: "enemy",
        x: 2,
        y: 1,
        dir: Direction.West,
        displayName: DisplayName.DigitalDog,
        archetype: "meleeDog",
        health: 4,
      },
    ]),
    () => seedUnit,
    { now: () => 100 },
  );
  const commands = [
    { type: "attack" },
    { type: "wait" },
  ] as const satisfies readonly PlayerCommand[];
  return {
    results: commands.map((command) => session.handlePlayerCommand(command)),
    playerPosition: session.getPlayerPosition(),
    playerFacing: session.getPlayerFacing(),
    playerStatus: session.getPlayerStatus(),
  };
}

function combatLevel() {
  return flatTestMap(5, 3, [
    { prefab: "player", x: 1, y: 1, dir: Direction.East },
    {
      prefab: "enemy",
      x: 2,
      y: 1,
      dir: Direction.West,
      displayName: DisplayName.DigitalDog,
      archetype: "meleeDog",
      health: 20,
    },
  ]);
}

function authoritativeState(runtime: GameRuntime) {
  return {
    snapshot: runtime.simulation.snapshot(),
    rng: runtime.simulation.randomSnapshot(),
    entities: runtime.simulation.crawler.entities().map((entity) => ({
      entity,
      stableId: runtime.simulation.crawler.entityStableId(entity),
      position: runtime.simulation.crawler.entityPosition(entity),
      facing: runtime.simulation.crawler.entityFacing(entity),
      blockMask: runtime.simulation.crawler.entityBlockMask(entity),
      alive: runtime.simulation.ecs.isEntityAlive(entity),
    })),
  };
}
