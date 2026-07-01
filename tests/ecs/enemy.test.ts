import { assertEquals } from "@std/assert";
import { Blocking, Enemy, Facing, GridPos, TurnTaker } from "@/src/ecs/components.ts";
import { enemyTurnSystem } from "@/src/ecs/enemy.ts";
import { Player } from "@/src/ecs/player.ts";
import { SpatialIndex } from "@/src/ecs/spatial.ts";
import { createWorld } from "@/src/ecs/world.ts";
import { createEntity, flatTestMap } from "@/tests/ecs/helpers.ts";

Deno.test("enemyTurnSystem moves enemies without an attack component", async () => {
  const world = await createWorld();
  const playerEntity = createEntity(world);
  const enemy = createEntity(world);

  world.components.addToEntity(GridPos, playerEntity, { x: 4, y: 1 });
  world.components.addToEntity(Facing, playerEntity, { dir: 3 });

  world.components.addToEntity(GridPos, enemy, { x: 1, y: 1 });
  world.components.addToEntity(Facing, enemy, { dir: 0 });
  world.components.addToEntity(Blocking, enemy);
  world.components.addToEntity(Enemy, enemy);
  world.components.addToEntity(TurnTaker, enemy);
  world.refresh();

  const runEnemyTurn = world.systems.create(enemyTurnSystem);
  const spatial = new SpatialIndex(world, TEST_MAP);
  runEnemyTurn({
    world,
    player: new Player(world, playerEntity),
    spatial,
    random: () => 0,
  });

  assertEquals(world.components.getEntityData(GridPos, enemy), { x: 2, y: 1 });
  assertEquals(world.components.getEntityData(Facing, enemy), { dir: 1 });
  assertEquals(spatial.blockingEntityAt(1, 1), undefined);
  assertEquals(spatial.blockingEntityAt(2, 1), enemy);
});

const TEST_MAP = flatTestMap(5, 2);
