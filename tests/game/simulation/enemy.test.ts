import { enemyArchetypeAuthoringKey, EnemyArchetypeCode } from "@/src/game/content/enemies.ts";
import { readComponent, writeComponent } from "@/src/game/simulation/components.ts";
import { createEnemy, createPlayer } from "@/src/game/simulation/prefabs.ts";
import { createRuntime } from "@/src/game/simulation/runtime.ts";
import { isPlayerDefeated, prepareEnemyHearing, runEnemyActorTurn } from "@/src/game/simulation/turn/enemy.ts";
import { DisplayName } from "@/src/game/content/names.ts";
import { type CardinalDirection, Direction } from "@/src/game/world/direction.ts";
import { createGameMap } from "@/src/game/world/map.ts";
import { DEFAULT_BARS_TERRAIN_ID } from "@/src/game/world/terrain_palette.ts";
import { flatTestMap } from "@/tests/game/simulation/helpers.ts";
import { assertEquals } from "@std/assert";
import type { Entity } from "turn-based-engine/ecs";

Deno.test("alert enemies pursue through the engine pathfinder", () => {
  const runtime = createRuntime(flatTestMap(7, 3));
  const player = createPlayer(runtime, { x: 1, y: 1, dir: Direction.East });
  const enemy = spawnEnemy(runtime, EnemyArchetypeCode.NetworkNeophyte, 5, 1, Direction.West);
  const events = runtime.pathfinder.batch(() => runEnemyActorTurn({ runtime, player, random: () => 0 }, enemy));
  assertEquals(events[0], { type: "enemyAlerted", entity: enemy });
  assertEquals(runtime.crawler.entityPosition(enemy), { x: 4, y: 1 });
  runtime.crawler.assertInvariants();
});

Deno.test("heard noise produces investigation without omniscient player pursuit", () => {
  const runtime = createRuntime(flatTestMap(8, 3));
  const player = createPlayer(runtime, { x: 1, y: 1, dir: Direction.East });
  const enemy = spawnEnemy(runtime, EnemyArchetypeCode.MeleeDog, 6, 1, Direction.East);
  const noises = [{ x: 4, y: 1, radius: 6 }] as const;
  const hearing = prepareEnemyHearing(runtime, noises);
  const events = runtime.pathfinder.batch(() =>
    runEnemyActorTurn({
      runtime,
      player,
      random: () => 0,
      hearing,
      blocksSight: () => true,
    }, enemy)
  );
  assertEquals(events, [{ type: "enemyInvestigating", entity: enemy }]);
  assertEquals(runtime.crawler.entityPosition(enemy), { x: 5, y: 1 });
});

Deno.test("hearing chooses the nearest audible source", () => {
  const runtime = createRuntime(flatTestMap(7, 5));
  const player = createPlayer(runtime, { x: 6, y: 4, dir: Direction.West });
  const enemy = spawnEnemy(runtime, EnemyArchetypeCode.NetworkNeophyte, 3, 2, Direction.East);

  runPhase(
    runtime,
    player,
    [
      { x: 0, y: 2, radius: 6 },
      { x: 3, y: 4, radius: 6 },
    ],
    () => 0,
    () => true,
  );

  assertEquals(runtime.crawler.entityPosition(enemy), { x: 3, y: 3 });
});

Deno.test("equidistant noises deterministically prefer their input order", () => {
  const runtime = createRuntime(flatTestMap(7, 5));
  const player = createPlayer(runtime, { x: 6, y: 4, dir: Direction.West });
  const enemy = spawnEnemy(runtime, EnemyArchetypeCode.NetworkNeophyte, 3, 2, Direction.East);

  runPhase(
    runtime,
    player,
    [
      { x: 1, y: 2, radius: 2 },
      { x: 3, y: 0, radius: 6 },
    ],
    () => 0,
    () => true,
  );

  assertEquals(runtime.crawler.entityPosition(enemy), { x: 2, y: 2 });
});

Deno.test("hearing respects both source and enemy radii", () => {
  const sourceRuntime = createRuntime(flatTestMap(9, 3));
  const sourcePlayer = createPlayer(sourceRuntime, { x: 8, y: 1, dir: Direction.West });
  const sourceLimited = spawnEnemy(sourceRuntime, EnemyArchetypeCode.NetworkNeophyte, 3, 1, Direction.West);
  assertEquals(
    runPhase(
      sourceRuntime,
      sourcePlayer,
      [{ x: 0, y: 1, radius: 2 }],
      () => 0,
      () => true,
    ),
    [],
  );
  assertEquals(sourceRuntime.crawler.entityPosition(sourceLimited), { x: 3, y: 1 });

  const enemyRuntime = createRuntime(flatTestMap(9, 3));
  const enemyPlayer = createPlayer(enemyRuntime, { x: 8, y: 1, dir: Direction.West });
  const enemyLimited = spawnEnemy(enemyRuntime, EnemyArchetypeCode.SystemSentinel, 3, 1, Direction.East);
  assertEquals(
    runPhase(
      enemyRuntime,
      enemyPlayer,
      [{ x: 0, y: 1, radius: 8 }],
      () => 0,
      () => true,
    ),
    [],
  );
  assertEquals(enemyRuntime.crawler.entityPosition(enemyLimited), { x: 3, y: 1 });
});

Deno.test("gunslingers retreat when adjacent", () => {
  const runtime = createRuntime(flatTestMap(6, 3));
  const player = createPlayer(runtime, { x: 2, y: 1, dir: Direction.East });
  const enemy = spawnEnemy(runtime, EnemyArchetypeCode.Gunslinger, 3, 1, Direction.West);
  runtime.pathfinder.batch(() => runEnemyActorTurn({ runtime, player, random: () => 0 }, enemy));
  assertEquals(runtime.crawler.entityPosition(enemy), { x: 4, y: 1 });
  assertEquals(readComponent(runtime.game, player, "Health")?.current, 10);
});

Deno.test("pursuit routes around blocking terrain", () => {
  const map = createGameMap("Route", [
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, DEFAULT_BARS_TERRAIN_ID, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
  ], []);
  const runtime = createRuntime(map);
  const player = createPlayer(runtime, { x: 5, y: 1, dir: Direction.West });
  const enemy = spawnEnemy(runtime, EnemyArchetypeCode.NetworkNeophyte, 1, 1, Direction.East);
  runPhase(runtime, player);
  assertEquals(runtime.crawler.entityPosition(enemy), { x: 1, y: 0 });
  assertEquals(runtime.crawler.entityFacing(enemy), Direction.North);
});

Deno.test("unaware enemies and out-of-range sentinel senses remain idle", () => {
  const runtime = createRuntime(flatTestMap(7, 3));
  const player = createPlayer(runtime, { x: 5, y: 1, dir: Direction.West });
  const unaware = spawnEnemy(runtime, EnemyArchetypeCode.NetworkNeophyte, 1, 1, Direction.West);
  const sentinel = spawnEnemy(runtime, EnemyArchetypeCode.SystemSentinel, 2, 1, Direction.East);
  const events = runPhase(runtime, player, [{ x: 4, y: 2, radius: 1 }]);
  assertEquals(events, []);
  assertEquals(runtime.crawler.entityPosition(unaware), { x: 1, y: 1 });
  assertEquals(runtime.crawler.entityPosition(sentinel), { x: 2, y: 1 });
});

Deno.test("sentinels investigate by watching and facing the dominant axis", () => {
  const runtime = createRuntime(flatTestMap(5, 5));
  const player = createPlayer(runtime, { x: 4, y: 4, dir: Direction.West });
  const sentinel = spawnEnemy(runtime, EnemyArchetypeCode.SystemSentinel, 1, 1, Direction.West);
  const events = runPhase(runtime, player, [{ x: 1, y: 2, radius: 3 }]);
  assertEquals(events, [{ type: "enemyInvestigating", entity: sentinel }]);
  assertEquals(runtime.crawler.entityPosition(sentinel), { x: 1, y: 1 });
  assertEquals(runtime.crawler.entityFacing(sentinel), Direction.South);
});

Deno.test("enemies keep investigating their last known noise position", () => {
  const runtime = createRuntime(flatTestMap(8, 3));
  const player = createPlayer(runtime, { x: 7, y: 1, dir: Direction.West });
  const enemy = spawnEnemy(runtime, EnemyArchetypeCode.NetworkNeophyte, 1, 1, Direction.West);
  runPhase(runtime, player, [{ x: 4, y: 1, radius: 4 }]);
  assertEquals(runtime.crawler.entityPosition(enemy), { x: 2, y: 1 });
  runPhase(runtime, player);
  assertEquals(runtime.crawler.entityPosition(enemy), { x: 3, y: 1 });
});

Deno.test("melee dogs pounce and attack after closing two tiles", () => {
  const runtime = createRuntime(flatTestMap(6, 3));
  const player = createPlayer(runtime, { x: 4, y: 1, dir: Direction.West });
  const dog = spawnEnemy(runtime, EnemyArchetypeCode.MeleeDog, 1, 1, Direction.East);
  const events = runPhase(runtime, player, [], () => 0.999);
  assertEquals(runtime.crawler.entityPosition(dog), { x: 3, y: 1 });
  assertEquals(events.map((event) => event.type), ["enemyAlerted", "damageDealt"]);
});

Deno.test("gunslingers shoot from range while sentinels hold position", () => {
  const runtime = createRuntime(flatTestMap(8, 3));
  const player = createPlayer(runtime, { x: 5, y: 1, dir: Direction.West });
  const gunslinger = spawnEnemy(runtime, EnemyArchetypeCode.Gunslinger, 2, 1, Direction.East);
  const sentinel = spawnEnemy(runtime, EnemyArchetypeCode.SystemSentinel, 1, 2, Direction.East);
  const events = runPhase(runtime, player, [], () => 0.999);
  assertEquals(runtime.crawler.entityPosition(gunslinger), { x: 2, y: 1 });
  assertEquals(runtime.crawler.entityPosition(sentinel), { x: 1, y: 2 });
  assertEquals(events.some((event) => event.type === "damageDealt" && event.actor === gunslinger), true);
});

Deno.test("player defeat stops later enemies in the same phase", () => {
  const runtime = createRuntime(flatTestMap(7, 3));
  const player = createPlayer(runtime, { x: 2, y: 1, dir: Direction.West });
  writeComponent(runtime.game, player, "Health", { current: 1, max: 1 });
  spawnEnemy(runtime, EnemyArchetypeCode.MeleeDog, 1, 1, Direction.East);
  const later = spawnEnemy(runtime, EnemyArchetypeCode.NetworkNeophyte, 5, 1, Direction.West);
  runPhase(runtime, player, [], () => 0.999);
  assertEquals(readComponent(runtime.game, player, "Health")?.current, 0);
  assertEquals(runtime.crawler.entityPosition(later), { x: 5, y: 1 });
});

Deno.test("agentic acolytes attack nearby cardinal targets without turning first", () => {
  const runtime = createRuntime(flatTestMap(6, 3));
  const player = createPlayer(runtime, { x: 3, y: 1, dir: Direction.West });
  const acolyte = spawnEnemy(runtime, EnemyArchetypeCode.AgenticAcolyte, 1, 1, Direction.East);
  const events = runPhase(runtime, player, [], () => 0.999);
  assertEquals(runtime.crawler.entityPosition(acolyte), { x: 1, y: 1 });
  assertEquals(events.map((event) => event.type), ["enemyAlerted", "damageDealt"]);
});

function runPhase(
  runtime: ReturnType<typeof createRuntime>,
  player: Entity,
  noises: readonly { readonly x: number; readonly y: number; readonly radius: number }[] = [],
  random = () => 0,
  blocksSight?: () => boolean,
) {
  const hearing = prepareEnemyHearing(runtime, noises);
  const context = { runtime, player, hearing, random, blocksSight };
  const events = [] as ReturnType<typeof runEnemyActorTurn>[number][];
  const enemies: Entity[] = [];
  runtime.game.query(runtime.game.components.Enemy, runtime.game.components.TurnTaker).forEach((entity) => {
    enemies.push(entity);
  });
  runtime.pathfinder.batch(() => {
    for (const enemy of enemies) {
      if (isPlayerDefeated(context)) break;
      events.push(...runEnemyActorTurn(context, enemy));
    }
  });
  return events;
}

function spawnEnemy(
  runtime: ReturnType<typeof createRuntime>,
  archetype: EnemyArchetypeCode,
  x: number,
  y: number,
  dir: CardinalDirection,
) {
  return createEnemy(runtime, {
    x,
    y,
    dir,
    archetype: enemyArchetypeAuthoringKey(archetype),
    displayName: displayNameFor(archetype),
  });
}

function displayNameFor(archetype: EnemyArchetypeCode): DisplayName {
  switch (archetype) {
    case EnemyArchetypeCode.MeleeDog:
      return DisplayName.DigitalDog;
    case EnemyArchetypeCode.Gunslinger:
      return DisplayName.GigabitGunslinger;
    case EnemyArchetypeCode.AgenticAcolyte:
      return DisplayName.AgenticAcolyte;
    default:
      return DisplayName.NetworkNeophyte;
  }
}
