import { enemyArchetypeAuthoringKey, EnemyArchetypeCode } from "@/src/content/enemies.ts";
import type { AttackSchema, HealthSchema } from "@/src/ecs/components.ts";
import {
  AttackPattern,
  AttackTargetMode,
  Defense,
  EnemyAwareness,
  GridPos,
  Health,
  IDLE_AWARENESS,
  TurnTaker,
} from "@/src/ecs/components.ts";
import { createEnemy, createNpc, createPlayer } from "@/src/ecs/prefabs.ts";
import { applyItemPickupToPlayer } from "@/src/ecs/progression.ts";
import { SpatialIndex } from "@/src/ecs/spatial.ts";
import { runTurnTransaction } from "@/src/ecs/turn/transaction.ts";
import { createWorld } from "@/src/ecs/world.ts";
import { attackPatternAuthoringKey, attackTargetModeAuthoringKey, type AuthoringAttackDef } from "@/src/game/attack.ts";
import type { PlayerCommand } from "@/src/game/commands.ts";
import { DisplayName } from "@/src/game/names.ts";
import { Direction } from "@/src/grid/direction.ts";
import type { GameMap } from "@/src/map/map.ts";
import { flatTestMap } from "@/tests/ecs/helpers.ts";
import type { Entity, World } from "@phughesmcr/miski";
import { assertEquals } from "@std/assert";

Deno.test("consumed player action commits before enemies decide", async () => {
  const world = await createWorld();
  const player = spawnPlayer(world, { x: 1, y: 1, dir: Direction.East });
  const enemy = spawnEnemy(world, {
    x: 4,
    y: 1,
    dir: Direction.West,
    displayName: DisplayName.NetworkNeophyte,
    archetype: EnemyArchetypeCode.NetworkNeophyte,
    attack: MELEE_ATTACK,
  });
  world.refresh();

  const result = runTransaction(world, player, { type: "move", direction: "forward" }, flatTestMap(6, 3));

  assertEquals(result.cost, "turn");
  assertEquals(world.components.getEntityData(GridPos, player), { x: 2, y: 1 });
  // Skirmish retreat from the committed player tile (distance 2) — idle distance 3 would advance.
  assertEquals(world.components.getEntityData(GridPos, enemy), { x: 5, y: 1 });
});

Deno.test("free player action does not run enemies", async () => {
  const world = await createWorld();
  const player = spawnPlayer(world, { x: 1, y: 1, dir: Direction.East });
  const enemy = spawnEnemy(world, {
    x: 3,
    y: 1,
    dir: Direction.West,
    displayName: DisplayName.NetworkNeophyte,
    archetype: EnemyArchetypeCode.NetworkNeophyte,
    attack: MELEE_ATTACK,
  });
  world.refresh();

  const result = runTransaction(world, player, { type: "turn", direction: "right" }, flatTestMap(5, 3));

  assertEquals(result.cost, "free");
  assertEquals(result.refreshVisibility, true);
  assertEquals(world.components.getEntityData(GridPos, enemy), { x: 3, y: 1 });
});

Deno.test("usable player attack consumes turn on hit, miss, and no target", async () => {
  const hitWorld = await createWorld();
  const hitPlayer = spawnPlayer(hitWorld, { x: 1, y: 1, dir: Direction.East });
  spawnEnemy(hitWorld, {
    x: 2,
    y: 1,
    dir: Direction.West,
    displayName: DisplayName.DigitalDog,
    archetype: EnemyArchetypeCode.MeleeDog,
    attack: MELEE_ATTACK,
  });
  hitWorld.refresh();
  assertEquals(runTransaction(hitWorld, hitPlayer, { type: "attack" }).cost, "turn");

  const missWorld = await createWorld();
  const missPlayer = spawnPlayer(missWorld, { x: 1, y: 1, dir: Direction.East });
  const target = spawnEnemy(missWorld, {
    x: 2,
    y: 1,
    dir: Direction.West,
    displayName: DisplayName.DigitalDog,
    archetype: EnemyArchetypeCode.MeleeDog,
    attack: MELEE_ATTACK,
  });
  missWorld.components.setEntityData(Defense, target, { hitDc: 30 });
  missWorld.refresh();
  const miss = runTransaction(missWorld, missPlayer, { type: "attack" }, flatTestMap(4, 3), () => 0);
  assertEquals(miss.cost, "turn");
  assertEquals(miss.events[0]?.type, "attackMissed");

  const noTargetWorld = await createWorld();
  const noTargetPlayer = spawnPlayer(noTargetWorld, { x: 1, y: 1, dir: Direction.East });
  noTargetWorld.refresh();
  const noTarget = runTransaction(noTargetWorld, noTargetPlayer, { type: "attack" });
  assertEquals(noTarget.cost, "turn");
  assertEquals(noTarget.events.map((event) => event.type), ["attackMissed"]);
});

Deno.test("noAmmo is free", async () => {
  const world = await createWorld();
  const player = spawnPlayer(world, { x: 1, y: 1, dir: Direction.East });
  applyItemPickupToPlayer(world, player, { type: "weapon", entity: 99 as Entity, slot: 2 });
  world.refresh();

  runTransaction(world, player, { type: "selectWeapon", slot: 2 });
  const result = runTransaction(world, player, { type: "attack" });

  assertEquals(result.cost, "free");
  assertEquals(result.events.map((event) => event.type), ["noAmmo"]);
});

Deno.test("enemy actor order is deterministic and later enemies see earlier changes", async () => {
  const world = await createWorld();
  const player = spawnPlayer(world, { x: 3, y: 1, dir: Direction.West, health: { current: 5, max: 5 } });
  const first = spawnEnemy(world, {
    x: 1,
    y: 1,
    dir: Direction.East,
    displayName: DisplayName.GigabitGunslinger,
    archetype: EnemyArchetypeCode.Gunslinger,
    attack: MELEE_ATTACK,
  });
  const second = spawnEnemy(world, {
    x: 5,
    y: 1,
    dir: Direction.West,
    displayName: DisplayName.GigabitGunslinger,
    archetype: EnemyArchetypeCode.Gunslinger,
    attack: MELEE_ATTACK,
  });
  world.refresh();

  const result = runTransaction(world, player, { type: "wait" }, flatTestMap(7, 3));

  assertEquals(result.cost, "turn");
  assertEquals(world.components.getEntityData(GridPos, first), { x: 2, y: 1 });
  assertEquals(world.components.getEntityData(GridPos, second), { x: 4, y: 1 });
  assertEquals(result.events, []);
});

Deno.test("enemy phase stops immediately after player defeat", async () => {
  const world = await createWorld();
  const player = spawnPlayer(world, { x: 2, y: 1, dir: Direction.West, health: { current: 1, max: 1 } });
  const killer = spawnEnemy(world, {
    x: 1,
    y: 1,
    dir: Direction.East,
    displayName: DisplayName.DigitalDog,
    archetype: EnemyArchetypeCode.MeleeDog,
    attack: MELEE_ATTACK,
  });
  const later = spawnEnemy(world, {
    x: 4,
    y: 1,
    dir: Direction.West,
    displayName: DisplayName.NetworkNeophyte,
    archetype: EnemyArchetypeCode.NetworkNeophyte,
    attack: MELEE_ATTACK,
  });
  world.refresh();

  const result = runTransaction(world, player, { type: "wait" }, flatTestMap(6, 3));

  assertEquals(result.outcome, "defeat");
  assertEquals(result.events.map((event) => event.type), ["damageDealt", "entityDefeated"]);
  assertEquals(result.events[0]?.type === "damageDealt" ? result.events[0].actor : undefined, killer);
  assertEquals(world.components.getEntityData(GridPos, later), { x: 4, y: 1 });
});

Deno.test("NPCs are not turn actors", async () => {
  const world = await createWorld();
  const player = createPlayer(world, { x: 1, y: 1, dir: Direction.East });
  const npc = createNpc(world, { x: 2, y: 1, dir: Direction.West, displayName: DisplayName.John });
  const enemy = createEnemy(world, { x: 3, y: 1, dir: Direction.West, displayName: DisplayName.NetworkNeophyte });

  assertEquals(world.components.entityHas(TurnTaker, player), true);
  assertEquals(world.components.entityHas(TurnTaker, enemy), true);
  assertEquals(world.components.entityHas(TurnTaker, npc), false);
});

function runTransaction(
  world: World,
  player: Entity,
  command: PlayerCommand,
  map: GameMap = flatTestMap(5, 3),
  random = () => 0.999,
) {
  return runTurnTransaction({
    world,
    player,
    spatial: new SpatialIndex(world, map),
    random,
  }, command);
}

type SpawnPlayerOptions = {
  readonly x: number;
  readonly y: number;
  readonly dir: number;
  readonly health?: HealthSchema;
};

function spawnPlayer(world: World, opts: SpawnPlayerOptions): Entity {
  const entity = createPlayer(world, {
    x: opts.x,
    y: opts.y,
    dir: opts.dir,
  });
  if (opts.health !== undefined) world.components.setEntityData(Health, entity, opts.health);
  return entity;
}

type SpawnEnemyOptions = {
  readonly x: number;
  readonly y: number;
  readonly dir: number;
  readonly displayName: DisplayName;
  readonly archetype: EnemyArchetypeCode;
  readonly attack: Partial<AttackSchema>;
};

function spawnEnemy(world: World, opts: SpawnEnemyOptions): Entity {
  const entity = createEnemy(world, {
    x: opts.x,
    y: opts.y,
    dir: opts.dir,
    displayName: opts.displayName,
    archetype: enemyArchetypeAuthoringKey(opts.archetype),
    attack: attackPrefabFor(opts.attack),
  });
  world.components.addToEntity(EnemyAwareness, entity, IDLE_AWARENESS);
  return entity;
}

function attackPrefabFor(attack: Partial<AttackSchema>): AuthoringAttackDef {
  return {
    ...attack,
    pattern: attack.pattern === undefined ? undefined : attackPatternAuthoringKey(attack.pattern),
    targets: attack.targets === undefined ? undefined : attackTargetModeAuthoringKey(attack.targets),
  };
}

const MELEE_ATTACK: AttackSchema = {
  minDamage: 1,
  maxDamage: 1,
  range: 1,
  attackBonus: 20,
  critThreshold: 21,
  critMultiplier: 2,
  pattern: AttackPattern.Line,
  targets: AttackTargetMode.First,
};
