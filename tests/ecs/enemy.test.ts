import type { Entity, World } from "@phughesmcr/miski";
import { Enemy, Facing, GridPos, TurnTaker } from "@/src/ecs/components.ts";
import { enemyTurnSystem } from "@/src/ecs/enemy.ts";
import { Player } from "@/src/ecs/player.ts";
import type { SpatialLookup } from "@/src/ecs/spatial.ts";
import { createWorld } from "@/src/ecs/world.ts";

Deno.test("enemyTurnSystem moves enemies without an attack component", async () => {
  const world = await createWorld();
  const playerEntity = createEntity(world);
  const enemy = createEntity(world);

  world.components.addToEntity(GridPos, playerEntity, { x: 4, y: 1 });
  world.components.addToEntity(Facing, playerEntity, { dir: 3 });

  world.components.addToEntity(GridPos, enemy, { x: 1, y: 1 });
  world.components.addToEntity(Facing, enemy, { dir: 0 });
  world.components.addToEntity(Enemy, enemy);
  world.components.addToEntity(TurnTaker, enemy);
  world.refresh();

  const runEnemyTurn = world.systems.create(enemyTurnSystem);
  runEnemyTurn({
    world,
    player: new Player(world, playerEntity),
    spatial: openSpatial(),
    random: () => 0,
  });

  assertEquals(world.components.getEntityData(GridPos, enemy), { x: 2, y: 1 });
  assertEquals(world.components.getEntityData(Facing, enemy), { dir: 1 });
});

function createEntity(world: World): Entity {
  const entity = world.entities.create();
  if (entity === undefined) throw new Error("Failed to create test entity");
  return entity;
}

function openSpatial(): SpatialLookup {
  return {
    tileBlocks: () => false,
    blockingEntityAt: () => undefined,
    positionBlocks: () => false,
  };
}

function assertEquals<T>(actual: T, expected: T): void {
  if (!Object.is(actual, expected) && JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}
