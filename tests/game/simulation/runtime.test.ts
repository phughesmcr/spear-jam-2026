import { GAME_COMPONENTS, type GameComponentMap } from "@/src/game/simulation/components.ts";
import { createCrawlerMap } from "@/src/game/simulation/crawler_map.ts";
import type { MapMaterialization } from "@/src/game/simulation/map_materialization.ts";
import { createRuntime } from "@/src/game/simulation/runtime.ts";
import { flatTestMap, TEST_SESSION_CONTENT } from "@/tests/game/simulation/helpers.ts";
import { assertEquals } from "@std/assert";
import { type CrawlerSpawnSpec, Direction } from "turn-based-engine/crawler";

Deno.test("createRuntime initializes the full batch with crawler-owned pose, visibility, and identity", () => {
  const playerSpec: CrawlerSpawnSpec<GameComponentMap> = {
    x: 3,
    y: 3,
    stableId: 42,
    facing: Direction.North,
    visionRadius: 6,
    components: {
      Player: {},
      Health: { current: 10, max: 10 },
    },
  };
  const interactableSpec: CrawlerSpawnSpec<GameComponentMap> = {
    x: 4,
    y: 3,
    stableId: 77,
    components: { Interactable: {} },
  };
  const map = flatTestMap(7, 7);
  const materialization: MapMaterialization = {
    mapId: map.name,
    map: createCrawlerMap(map),
    entities: [playerSpec, interactableSpec],
    playerStableId: 42,
  };
  const runtime = createRuntime(materialization, TEST_SESSION_CONTENT, 0);
  const player = runtime.simulation.crawler.entityForStableId(materialization.playerStableId);
  const interactable = runtime.simulation.crawler.entityForStableId(77);

  if (player === undefined) throw new Error("Expected the initial player batch entity.");
  if (interactable === undefined) throw new Error("Expected the complete initial entity batch.");

  assertEquals(runtime.simulation.crawler.entityPosition(player), { x: 3, y: 3 });
  assertEquals(runtime.simulation.crawler.entityFacing(player), Direction.North);
  assertEquals(runtime.simulation.crawler.entityPosition(interactable), { x: 4, y: 3 });
  assertEquals(runtime.simulation.crawler.entityForStableId(42), player);
  assertEquals(runtime.simulation.crawler.isVisibleTo(player, 5, 1), true);
  assertEquals(runtime.simulation.crawler.isVisibleTo(player, 1, 5), false);
  assertEquals(runtime.simulation.ecs.storage.Health.get(player, "current"), 10);

  const query = runtime.simulation.ecs.query(
    runtime.simulation.ecs.components.Player,
    runtime.simulation.ecs.components.Health,
  );
  query.forEach((entity, slot) => {
    assertEquals(entity, player);
    assertEquals(runtime.simulation.ecs.storage.Health.getAt(slot, "max"), 10);
  });
  assertEquals(query.count(), 1);
  assertEquals(Object.keys(GAME_COMPONENTS).includes("Position"), false);
  runtime.simulation.crawler.assertInvariants();
});
