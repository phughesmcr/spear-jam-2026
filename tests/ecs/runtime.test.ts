import { GAME_COMPONENTS } from "@/src/ecs/components.ts";
import { createRuntime } from "@/src/ecs/runtime.ts";
import { Direction } from "turn-based-engine/crawler";
import { assertEquals } from "@std/assert";
import { flatTestMap } from "@/tests/ecs/helpers.ts";

Deno.test("createRuntime registers custom components and crawler-owned pose, visibility, and identity", () => {
  const runtime = createRuntime(flatTestMap(7, 7));
  const player = runtime.crawler.spawnCrawler({
    x: 3,
    y: 3,
    stableId: 42,
    facing: Direction.North,
    visionRadius: 6,
    components: {
      Player: {},
      Health: { current: 10, max: 10 },
    },
  });

  assertEquals(runtime.crawler.entityPosition(player), { x: 3, y: 3 });
  assertEquals(runtime.crawler.entityFacing(player), Direction.North);
  assertEquals(runtime.crawler.entityForStableId(42), player);
  assertEquals(runtime.crawler.isVisibleTo(player, 5, 1), true);
  assertEquals(runtime.crawler.isVisibleTo(player, 1, 5), false);
  assertEquals(runtime.game.storage.Health.get(player, "current"), 10);

  const query = runtime.game.query(runtime.game.components.Player, runtime.game.components.Health);
  query.forEach((entity, slot) => {
    assertEquals(entity, player);
    assertEquals(runtime.game.storage.Health.getAt(slot, "max"), 10);
  });
  assertEquals(query.count(), 1);
  assertEquals(Object.keys(GAME_COMPONENTS).includes("Position"), false);
  runtime.crawler.assertInvariants();
});
