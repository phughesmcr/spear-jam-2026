import { Blocking, Door, Facing, GridPos, Interactable, Item, ItemKind } from "@/src/ecs/components.ts";
import { createDoor } from "@/src/ecs/prefabs.ts";
import { SpatialIndex } from "@/src/ecs/spatial.ts";
import { createWorld } from "@/src/ecs/world.ts";
import { createGameMap, KeyColor, keyColorCode } from "@/src/map/map.ts";
import { DEFAULT_BARS_TERRAIN_ID, DEFAULT_WALL_TERRAIN_ID } from "@/src/map/terrain_palettes.ts";
import { createEntity, flatTestMap } from "@/tests/ecs/helpers.ts";
import { assertEquals, assertThrows } from "@std/assert";

Deno.test("SpatialIndex indexes blocking, interactable, item, and faced entities", async () => {
  const world = await createWorld();
  const player = createEntity(world);
  const blocker = createEntity(world);
  const door = createEntity(world);
  const key = createEntity(world);

  world.components.addToEntity(GridPos, player, { x: 1, y: 1 });
  world.components.addToEntity(Facing, player, { dir: 1 });

  world.components.addToEntity(GridPos, blocker, { x: 2, y: 1 });
  world.components.addToEntity(Blocking, blocker);

  world.components.addToEntity(GridPos, door, { x: 3, y: 1 });
  world.components.addToEntity(Door, door, { open: 0 });
  world.components.addToEntity(Interactable, door);

  world.components.addToEntity(GridPos, key, { x: 4, y: 1 });
  world.components.addToEntity(Item, key, { kind: ItemKind.Key, value: keyColorCode(KeyColor.Red) });
  world.refresh();

  const spatial = new SpatialIndex(world, TEST_MAP);

  assertEquals(spatial.blockingEntityAt(2, 1), blocker);
  assertEquals(spatial.blockingEntityAt(3, 1), undefined);
  assertEquals(spatial.positionBlocks(2, 1), true);
  assertEquals(spatial.itemAt(4, 1), key);
  assertEquals(spatial.facedEntity({ x: 1, y: 1 }, 1), blocker);
  assertEquals(spatial.facedEntity({ x: 2, y: 1 }, 1), door);
  assertEquals(spatial.facedEntity({ x: 3, y: 1 }, 1), key);
});

Deno.test("SpatialIndex reads static movement, sight, and attack flags", async () => {
  const world = await createWorld();
  const spatial = new SpatialIndex(
    world,
    createGameMap("Static Flags", [[0, DEFAULT_WALL_TERRAIN_ID, DEFAULT_BARS_TERRAIN_ID]], []),
  );

  assertEquals(spatial.tileBlocks(0, 0), false);
  assertEquals(spatial.tileBlocksSight(0, 0), false);
  assertEquals(spatial.tileBlocksAttacks(0, 0), false);
  assertEquals(spatial.tileBlocks(1, 0), true);
  assertEquals(spatial.tileBlocksSight(1, 0), true);
  assertEquals(spatial.tileBlocksAttacks(1, 0), true);
  assertEquals(spatial.tileBlocks(2, 0), true);
  assertEquals(spatial.tileBlocksSight(2, 0), false);
  assertEquals(spatial.tileBlocksAttacks(2, 0), true);
  assertEquals(spatial.tileBlocks(-1, 0), true);
  assertEquals(spatial.tileBlocksSight(3, 0), true);
  assertEquals(spatial.tileBlocksAttacks(3, 0), true);
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

Deno.test("SpatialIndex withFreshOccupancy refreshes once for nested queries", async () => {
  const world = await createWorld();
  const near = createEntity(world);
  const far = createEntity(world);

  world.components.addToEntity(GridPos, near, { x: 2, y: 1 });
  world.components.addToEntity(Blocking, near);
  world.components.addToEntity(GridPos, far, { x: 3, y: 1 });
  world.components.addToEntity(Blocking, far);
  world.refresh();

  const spatial = new SpatialIndex(world, TEST_MAP);
  const seen = spatial.withFreshOccupancy(() => [
    spatial.blockingEntityAt(2, 1),
    spatial.blockingEntityAt(3, 1),
  ]);
  assertEquals(seen, [near, far]);

  // Direct ECS mutation mid-hold must not be visible until the hold ends.
  const held = spatial.withFreshOccupancy(() => {
    world.components.setEntityData(GridPos, far, { x: 4, y: 1 });
    return spatial.blockingEntityAt(3, 1);
  });
  assertEquals(held, far);
  assertEquals(spatial.blockingEntityAt(4, 1), far);
  assertEquals(spatial.blockingEntityAt(3, 1), undefined);
});

Deno.test("SpatialIndex leaves occupancy unchanged when a move is rejected", async () => {
  const world = await createWorld();
  const actor = createEntity(world);
  const blocker = createEntity(world);

  world.components.addToEntity(GridPos, actor, { x: 1, y: 1 });
  world.components.addToEntity(Blocking, actor);
  world.components.addToEntity(GridPos, blocker, { x: 2, y: 1 });
  world.components.addToEntity(Blocking, blocker);
  world.refresh();

  const spatial = new SpatialIndex(world, TEST_MAP);

  assertThrows(() => spatial.moveEntity(actor, { x: 2, y: 1 }), Error, "Duplicate blocking occupancy");
  assertEquals(world.components.getEntityData(GridPos, actor), { x: 1, y: 1 });
  assertEquals(spatial.blockingEntityAt(1, 1), actor);
  assertEquals(spatial.blockingEntityAt(2, 1), blocker);
});

Deno.test("SpatialIndex reflects direct ECS position changes after construction", async () => {
  const world = await createWorld();
  const actor = createEntity(world);

  world.components.addToEntity(GridPos, actor, { x: 1, y: 1 });
  world.components.addToEntity(Blocking, actor);
  world.refresh();

  const spatial = new SpatialIndex(world, TEST_MAP);

  world.components.setEntityData(GridPos, actor, { x: 2, y: 1 });

  assertEquals(spatial.blockingEntityAt(1, 1), undefined);
  assertEquals(spatial.blockingEntityAt(2, 1), actor);
});

Deno.test("SpatialIndex reflects direct entity destruction after construction", async () => {
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

  assertEquals(spatial.facedEntity({ x: 1, y: 1 }, 1), undefined);
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

Deno.test("SpatialIndex rejects moves to flag-blocked terrain", async () => {
  const world = await createWorld();
  const actor = createEntity(world);

  world.components.addToEntity(GridPos, actor, { x: 1, y: 1 });
  world.components.addToEntity(Blocking, actor);
  world.refresh();

  const spatial = new SpatialIndex(
    world,
    createGameMap("Blocked Terrain", [
      [0, 0, 0],
      [0, 0, DEFAULT_WALL_TERRAIN_ID],
      [0, 0, 0],
    ], []),
  );

  assertThrows(() => spatial.moveEntity(actor, { x: 2, y: 1 }), Error, "blocked tile");
  assertEquals(world.components.getEntityData(GridPos, actor), { x: 1, y: 1 });
  assertEquals(spatial.blockingEntityAt(1, 1), actor);
  assertEquals(spatial.blockingEntityAt(2, 1), undefined);
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
  const blocker = createEntity(world);

  world.components.addToEntity(GridPos, blocker, { x: 2, y: 1 });
  world.components.addToEntity(Blocking, blocker);
  world.refresh();

  const spatial = new SpatialIndex(world, TEST_MAP);

  spatial.setBlocking(blocker, false);
  assertEquals(world.components.entityHas(Blocking, blocker), false);
  assertEquals(spatial.blockingEntityAt(2, 1), undefined);

  spatial.setBlocking(blocker, true);
  assertEquals(world.components.entityHas(Blocking, blocker), true);
  assertEquals(spatial.blockingEntityAt(2, 1), blocker);
});

Deno.test("SpatialIndex initializes closed door runtime flags without blocking occupancy", async () => {
  const world = await createWorld();
  const door = createEntity(world);

  world.components.addToEntity(GridPos, door, { x: 2, y: 1 });
  world.components.addToEntity(Door, door, { open: 0 });
  world.components.addToEntity(Interactable, door);
  world.refresh();

  const spatial = new SpatialIndex(world, TEST_MAP);

  assertEquals(spatial.blockingEntityAt(2, 1), undefined);
  assertEquals(spatial.facedEntity({ x: 1, y: 1 }, 1), door);
  assertEquals(spatial.tileBlocks(2, 1), true);
  assertEquals(spatial.tileBlocksSight(2, 1), true);
  assertEquals(spatial.tileBlocksAttacks(2, 1), true);
  assertEquals(spatial.positionBlocks(2, 1), true);
});

Deno.test("SpatialIndex setDoorOpen toggles runtime flags and keeps doors targetable", async () => {
  const world = await createWorld();
  const door = createEntity(world);

  world.components.addToEntity(GridPos, door, { x: 2, y: 1 });
  world.components.addToEntity(Door, door, { open: 0, slide: 5, openMs: 123 });
  world.components.addToEntity(Interactable, door);
  world.refresh();

  const spatial = new SpatialIndex(world, TEST_MAP);

  spatial.setDoorOpen(door, true);

  assertEquals(world.components.getEntityData(Door, door), { open: 1, slide: 5, openMs: 123 });
  assertEquals(spatial.tileBlocks(2, 1), false);
  assertEquals(spatial.tileBlocksSight(2, 1), false);
  assertEquals(spatial.tileBlocksAttacks(2, 1), false);
  assertEquals(spatial.positionBlocks(2, 1), false);
  assertEquals(spatial.facedEntity({ x: 1, y: 1 }, 1), door);

  spatial.setDoorOpen(door, false);

  assertEquals(world.components.getEntityData(Door, door), { open: 0, slide: 5, openMs: 123 });
  assertEquals(spatial.tileBlocks(2, 1), true);
  assertEquals(spatial.tileBlocksSight(2, 1), true);
  assertEquals(spatial.tileBlocksAttacks(2, 1), true);
  assertEquals(spatial.facedEntity({ x: 1, y: 1 }, 1), door);
});

Deno.test("SpatialIndex glass doors block move and attacks but not sight", async () => {
  const world = await createWorld();
  const door = createDoor(world, { x: 2, y: 1, glass: true });
  world.refresh();

  const spatial = new SpatialIndex(world, TEST_MAP);

  assertEquals(spatial.tileBlocks(2, 1), true);
  assertEquals(spatial.tileBlocksSight(2, 1), false);
  assertEquals(spatial.tileBlocksAttacks(2, 1), true);

  spatial.setDoorOpen(door, true);

  assertEquals(spatial.tileBlocks(2, 1), false);
  assertEquals(spatial.tileBlocksSight(2, 1), false);
  assertEquals(spatial.tileBlocksAttacks(2, 1), false);
});

Deno.test("SpatialIndex pathing routes multiple starts around the same blocker", async () => {
  const world = await createWorld();
  const actor = createEntity(world);
  const blocker = createEntity(world);

  world.components.addToEntity(GridPos, actor, { x: 1, y: 1 });
  world.components.addToEntity(Blocking, actor);
  world.components.addToEntity(GridPos, blocker, { x: 2, y: 1 });
  world.components.addToEntity(Blocking, blocker);
  world.refresh();

  const spatial = new SpatialIndex(world, flatTestMap(5, 3));
  spatial.beginEnemyPathingPhase();
  try {
    assertEquals(spatial.nextStepToward({ x: 1, y: 1 }, { x: 4, y: 1 }), { x: 1, y: 0 });
    assertEquals(spatial.nextStepToward({ x: 1, y: 2 }, { x: 4, y: 1 }), { x: 2, y: 2 });
  } finally {
    spatial.endEnemyPathingPhase();
  }
});

const TEST_MAP = flatTestMap(5, 2);
