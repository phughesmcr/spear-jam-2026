import { assertEquals, assertThrows } from "@std/assert";
import { Blocking, Door, Facing, GridPos, Interactable, Item, ItemKind } from "@/src/ecs/components.ts";
import { SpatialIndex } from "@/src/ecs/spatial.ts";
import { createWorld } from "@/src/ecs/world.ts";
import { KeyColor, keyColorCode } from "@/src/map/map.ts";
import { createEntity, flatTestMap } from "@/tests/ecs/helpers.ts";

Deno.test("SpatialIndex indexes blocking entities, items, and faced entities", async () => {
  const world = await createWorld();
  const player = createEntity(world);
  const door = createEntity(world);
  const key = createEntity(world);

  world.components.addToEntity(GridPos, player, { x: 1, y: 1 });
  world.components.addToEntity(Facing, player, { dir: 1 });

  world.components.addToEntity(GridPos, door, { x: 2, y: 1 });
  world.components.addToEntity(Door, door, { open: 0 });
  world.components.addToEntity(Interactable, door);
  world.components.addToEntity(Blocking, door);

  world.components.addToEntity(GridPos, key, { x: 3, y: 1 });
  world.components.addToEntity(Item, key, { kind: ItemKind.Key, value: keyColorCode(KeyColor.Red) });
  world.refresh();

  const spatial = new SpatialIndex(world, TEST_MAP);

  assertEquals(spatial.blockingEntityAt(2, 1), door);
  assertEquals(spatial.positionBlocks(2, 1), true);
  assertEquals(spatial.itemAt(3, 1), key);
  assertEquals(spatial.facedEntity({ x: 1, y: 1 }, 1), door);
});

Deno.test("SpatialIndex keeps its index current when entities move or are removed", async () => {
  const world = await createWorld();
  const actor = createEntity(world);
  const key = createEntity(world);

  world.components.addToEntity(GridPos, actor, { x: 1, y: 1 });
  world.components.addToEntity(Blocking, actor);
  world.components.addToEntity(GridPos, key, { x: 2, y: 1 });
  world.components.addToEntity(Item, key, { kind: ItemKind.Key, value: keyColorCode(KeyColor.Red) });
  world.refresh();

  const spatial = new SpatialIndex(world, TEST_MAP);

  spatial.moveEntity(actor, { x: 2, y: 1 });
  assertEquals(spatial.blockingEntityAt(1, 1), undefined);
  assertEquals(spatial.blockingEntityAt(2, 1), actor);
  assertEquals(world.components.getEntityData(GridPos, actor), { x: 2, y: 1 });

  spatial.removeEntity(key);
  assertEquals(world.entities.isActive(key), false);
  assertEquals(spatial.itemAt(2, 1), undefined);
});

Deno.test("SpatialIndex owns occupancy after construction", async () => {
  const world = await createWorld();
  const actor = createEntity(world);

  world.components.addToEntity(GridPos, actor, { x: 1, y: 1 });
  world.components.addToEntity(Blocking, actor);
  world.refresh();

  const spatial = new SpatialIndex(world, TEST_MAP);

  world.components.setEntityData(GridPos, actor, { x: 2, y: 1 });

  assertEquals(spatial.blockingEntityAt(1, 1), actor);
  assertEquals(spatial.blockingEntityAt(2, 1), undefined);
});

Deno.test("SpatialIndex owns removals after construction", async () => {
  const world = await createWorld();
  const player = createEntity(world);
  const key = createEntity(world);

  world.components.addToEntity(GridPos, player, { x: 1, y: 1 });
  world.components.addToEntity(Facing, player, { dir: 1 });
  world.components.addToEntity(GridPos, key, { x: 2, y: 1 });
  world.components.addToEntity(Item, key, { kind: ItemKind.Key, value: keyColorCode(KeyColor.Red) });
  world.refresh();

  const spatial = new SpatialIndex(world, TEST_MAP);

  world.entities.destroy(key);

  assertEquals(spatial.facedEntity({ x: 1, y: 1 }, 1), key);
});

Deno.test("SpatialIndex rejects co-located blocking entities", async () => {
  const world = await createWorld();
  const first = createEntity(world);
  const second = createEntity(world);

  world.components.addToEntity(GridPos, first, { x: 1, y: 1 });
  world.components.addToEntity(Blocking, first);
  world.components.addToEntity(GridPos, second, { x: 1, y: 1 });
  world.components.addToEntity(Blocking, second);
  world.refresh();

  assertThrows(() => new SpatialIndex(world, TEST_MAP), Error, "Duplicate blocking occupancy");
});

Deno.test("SpatialIndex rejects moves to tiles outside the map", async () => {
  const world = await createWorld();
  const actor = createEntity(world);

  world.components.addToEntity(GridPos, actor, { x: 1, y: 1 });
  world.refresh();

  const spatial = new SpatialIndex(world, TEST_MAP);

  assertThrows(() => spatial.moveEntity(actor, { x: -1, y: 1 }), Error, "outside");
  assertThrows(() => spatial.moveEntity(actor, { x: 1, y: 99 }), Error, "outside");
  assertEquals(world.components.getEntityData(GridPos, actor), { x: 1, y: 1 });
});

Deno.test("SpatialIndex rejects moves for entities it never indexed", async () => {
  const world = await createWorld();
  const unpositioned = createEntity(world);
  world.refresh();

  const spatial = new SpatialIndex(world, TEST_MAP);

  assertThrows(() => spatial.moveEntity(unpositioned, { x: 1, y: 1 }), Error, "not indexed");
});

Deno.test("SpatialIndex updates blocking ownership through the gateway", async () => {
  const world = await createWorld();
  const door = createEntity(world);

  world.components.addToEntity(GridPos, door, { x: 2, y: 1 });
  world.components.addToEntity(Blocking, door);
  world.refresh();

  const spatial = new SpatialIndex(world, TEST_MAP);

  spatial.setBlocking(door, false);
  assertEquals(world.components.entityHas(Blocking, door), false);
  assertEquals(spatial.blockingEntityAt(2, 1), undefined);

  spatial.setBlocking(door, true);
  assertEquals(world.components.entityHas(Blocking, door), true);
  assertEquals(spatial.blockingEntityAt(2, 1), door);
});

const TEST_MAP = flatTestMap(5, 2);
