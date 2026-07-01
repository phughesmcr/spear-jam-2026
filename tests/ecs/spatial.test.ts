import { Blocking, Door, Facing, GridPos, Interactable, Key } from "@/src/ecs/components.ts";
import { Player } from "@/src/ecs/player.ts";
import { SpatialIndex } from "@/src/ecs/spatial.ts";
import { createWorld } from "@/src/ecs/world.ts";
import { LockId } from "@/src/map/map.ts";
import { assertEquals, createEntity, flatTestMap } from "@/tests/ecs/helpers.ts";

Deno.test("SpatialIndex indexes blocking entities, keys, faced entities, and exits", async () => {
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
  world.components.addToEntity(Key, key, { lockId: LockId.Door1 });
  world.refresh();

  const spatial = new SpatialIndex(world, TEST_MAP);

  assertEquals(spatial.blockingEntityAt(2, 1), door);
  assertEquals(spatial.positionBlocks(2, 1), true);
  assertEquals(spatial.keyAt(3, 1), key);
  assertEquals(spatial.exitAt(4, 1), { prefab: "exit", x: 4, y: 1, goto: "next" });
  assertEquals(spatial.facedEntity(new Player(world, player)), door);
});

Deno.test("SpatialIndex keeps its index current when entities move or are removed", async () => {
  const world = await createWorld();
  const actor = createEntity(world);
  const key = createEntity(world);

  world.components.addToEntity(GridPos, actor, { x: 1, y: 1 });
  world.components.addToEntity(Blocking, actor);
  world.components.addToEntity(GridPos, key, { x: 2, y: 1 });
  world.components.addToEntity(Key, key, { lockId: LockId.Door1 });
  world.refresh();

  const spatial = new SpatialIndex(world, TEST_MAP);

  spatial.moveEntity(actor, { x: 2, y: 1 });
  assertEquals(spatial.blockingEntityAt(1, 1), undefined);
  assertEquals(spatial.blockingEntityAt(2, 1), actor);
  assertEquals(world.components.getEntityData(GridPos, actor), { x: 2, y: 1 });

  spatial.removeEntity(key);
  assertEquals(world.entities.isActive(key), false);
  assertEquals(spatial.keyAt(2, 1), undefined);
});

Deno.test("SpatialIndex movement is the single writer for occupancy", async () => {
  const world = await createWorld();
  const actor = createEntity(world);

  world.components.addToEntity(GridPos, actor, { x: 1, y: 1 });
  world.components.addToEntity(Blocking, actor);
  world.refresh();

  const spatial = new SpatialIndex(world, flatTestMap(4, 2));

  world.components.setEntityData(GridPos, actor, { x: 2, y: 1 });
  spatial.moveEntity(actor, { x: 3, y: 1 });

  assertEquals(spatial.blockingEntityAt(1, 1), undefined);
  assertEquals(spatial.blockingEntityAt(2, 1), undefined);
  assertEquals(spatial.blockingEntityAt(3, 1), actor);
  assertEquals(world.components.getEntityData(GridPos, actor), { x: 3, y: 1 });
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

const TEST_MAP = flatTestMap(5, 2, [{ prefab: "exit", x: 4, y: 1, goto: "next" }]);
