import { readComponent } from "@/src/ecs/components.ts";
import { collectItemAt, interactWithEntity } from "@/src/ecs/interactions.ts";
import { createDoor, createKey, createPlayer } from "@/src/ecs/prefabs.ts";
import { createRuntime } from "@/src/ecs/runtime.ts";
import { Direction } from "@/src/grid/direction.ts";
import { KeyColor } from "@/src/map/map.ts";
import { flatTestMap } from "@/tests/ecs/helpers.ts";
import { assertEquals } from "@std/assert";
import { TerrainBlock } from "turn-based-engine/crawler";

Deno.test("normal and locked doors change custom state and crawler masks together", () => {
  const runtime = createRuntime(flatTestMap(5, 3));
  const normal = createDoor(runtime, { x: 1, y: 1 });
  const locked = createDoor(runtime, { x: 2, y: 1, locked: true, color: KeyColor.Red });

  assertEquals(interactWithEntity(runtime, normal, new Set(), false), {
    type: "consumeTurn",
    events: [{ type: "doorOpened", entity: normal }],
  });
  assertEquals(readComponent(runtime.game, normal, "Door")?.open, 1);
  assertEquals(runtime.crawler.entityBlockMask(normal), 0);
  assertEquals(interactWithEntity(runtime, locked, new Set(), false).events, [{ type: "doorLocked", entity: locked }]);
  assertEquals(interactWithEntity(runtime, locked, new Set([KeyColor.Red]), false).type, "consumeTurn");
  assertEquals(runtime.crawler.entityBlockMask(locked), 0);
  runtime.crawler.assertInvariants();
});

Deno.test("glass doors reject open without changing their effect-line mask", () => {
  const runtime = createRuntime(flatTestMap());
  const glass = createDoor(runtime, { x: 1, y: 0, glass: true });
  assertEquals(interactWithEntity(runtime, glass, new Set(), false).events, [{
    type: "doorCannotOpen",
    entity: glass,
  }]);
  assertEquals(runtime.crawler.entityBlockMask(glass), TerrainBlock.Movement | TerrainBlock.EffectLine);
});

Deno.test("items coexist with a movement occupant and despawn through crawler lifecycle", () => {
  const runtime = createRuntime(flatTestMap(3, 3));
  const player = createPlayer(runtime, { x: 1, y: 1, dir: Direction.North });
  const key = createKey(runtime, { x: 1, y: 1, color: KeyColor.Red });
  assertEquals(runtime.crawler.entityAt(1, 1, TerrainBlock.Movement), player);
  assertEquals(collectItemAt(runtime, 1, 1), { type: "key", entity: key, color: KeyColor.Red });
  assertEquals(runtime.game.isEntityAlive(key), false);
  runtime.crawler.assertInvariants();
});
