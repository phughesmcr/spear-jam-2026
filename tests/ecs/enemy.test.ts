import { assertEquals } from "@std/assert";
import type { Entity, World } from "@phughesmcr/miski";
import {
  AttackFacingRequirement,
  AttackPattern,
  AttackTargetMode,
  Blocking,
  Enemy,
  EnemyArchetype,
  EnemyAwareness,
  Facing,
  GridPos,
  Health,
  IDLE_AWARENESS,
  TurnTaker,
} from "@/src/ecs/components.ts";
import type { AttackSchema } from "@/src/ecs/components.ts";
import { enemyTurnSystem } from "@/src/ecs/enemy.ts";
import { Player } from "@/src/ecs/player.ts";
import { SpatialIndex } from "@/src/ecs/spatial.ts";
import { createWorld } from "@/src/ecs/world.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { NoiseStimulus } from "@/src/game/perception.ts";
import { DisplayName } from "@/src/game/names.ts";
import { Direction } from "@/src/grid/direction.ts";
import { createEntity, createTestEnemy, createTestPlayer, flatTestMap } from "@/tests/ecs/helpers.ts";

Deno.test("enemyTurnSystem moves enemies without an attack component", async () => {
  const world = await createWorld();
  const playerEntity = createEntity(world);
  const enemy = createEntity(world);

  world.components.addToEntity(GridPos, playerEntity, { x: 4, y: 1 });
  world.components.addToEntity(Facing, playerEntity, { dir: 3 });

  world.components.addToEntity(GridPos, enemy, { x: 1, y: 1 });
  world.components.addToEntity(Facing, enemy, { dir: Direction.East });
  world.components.addToEntity(Blocking, enemy);
  world.components.addToEntity(Enemy, enemy);
  world.components.addToEntity(EnemyAwareness, enemy, IDLE_AWARENESS);
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

Deno.test("enemyTurnSystem leaves unaware enemies idle", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world, {
    x: 4,
    y: 1,
    dir: Direction.West,
    blocking: true,
    tag: true,
    health: { current: 5, max: 5 },
  });
  const enemy = createTestEnemy(world, {
    x: 1,
    y: 1,
    dir: Direction.West,
    displayName: DisplayName.NetworkNeophyte,
    attack: MELEE_ATTACK,
    archetype: EnemyArchetype.NetworkNeophyte,
  });
  world.refresh();

  const events = runEnemyTurn(world, playerEntity, flatTestMap(6, 3));

  assertEquals(world.components.getEntityData(GridPos, enemy), { x: 1, y: 1 });
  assertEquals(world.components.getEntityData(Facing, enemy), { dir: Direction.West });
  assertEquals(events, []);
});

Deno.test("enemyTurnSystem investigates heard noises instead of omniscient player position", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world, {
    x: 4,
    y: 1,
    dir: Direction.West,
    blocking: true,
    tag: true,
    health: { current: 5, max: 5 },
  });
  const enemy = createTestEnemy(world, {
    x: 1,
    y: 1,
    dir: Direction.West,
    displayName: DisplayName.NetworkNeophyte,
    attack: MELEE_ATTACK,
    archetype: EnemyArchetype.NetworkNeophyte,
  });
  world.refresh();

  const events = runEnemyTurn(world, playerEntity, flatTestMap(6, 3), [{ x: 1, y: 2, radius: 2 }]);

  assertEquals(world.components.getEntityData(GridPos, enemy), { x: 1, y: 2 });
  assertEquals(world.components.getEntityData(Facing, enemy), { dir: Direction.South });
  assertEquals(events, []);
});

Deno.test("melee dogs investigate noise with a two-step pounce", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world, {
    x: 5,
    y: 1,
    dir: Direction.West,
    blocking: true,
    tag: true,
    health: { current: 5, max: 5 },
  });
  const dog = createTestEnemy(world, {
    x: 1,
    y: 1,
    dir: Direction.West,
    displayName: DisplayName.DigitalDog,
    attack: MELEE_ATTACK,
    archetype: EnemyArchetype.MeleeDog,
  });
  world.refresh();

  const events = runEnemyTurn(world, playerEntity, flatTestMap(7, 3), [{ x: 3, y: 1, radius: 3 }]);

  assertEquals(world.components.getEntityData(GridPos, dog), { x: 3, y: 1 });
  assertEquals(world.components.getEntityData(Facing, dog), { dir: Direction.East });
  assertEquals(events, []);
});

Deno.test("system sentinels investigate noise by watching without moving", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world, {
    x: 5,
    y: 1,
    dir: Direction.West,
    blocking: true,
    tag: true,
    health: { current: 5, max: 5 },
  });
  const sentinel = createTestEnemy(world, {
    x: 1,
    y: 1,
    dir: Direction.West,
    displayName: DisplayName.SystemSentinel,
    attack: MELEE_ATTACK,
    archetype: EnemyArchetype.SystemSentinel,
  });
  world.refresh();

  const events = runEnemyTurn(world, playerEntity, flatTestMap(7, 3), [{ x: 3, y: 1, radius: 3 }]);

  assertEquals(world.components.getEntityData(GridPos, sentinel), { x: 1, y: 1 });
  assertEquals(world.components.getEntityData(Facing, sentinel), { dir: Direction.East });
  assertEquals(events, []);
});

Deno.test("enemyTurnSystem keeps investigating the last known position after noise stops", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world, {
    x: 5,
    y: 1,
    dir: Direction.West,
    blocking: true,
    tag: true,
    health: { current: 5, max: 5 },
  });
  const enemy = createTestEnemy(world, {
    x: 1,
    y: 1,
    dir: Direction.West,
    displayName: DisplayName.NetworkNeophyte,
    attack: MELEE_ATTACK,
    archetype: EnemyArchetype.NetworkNeophyte,
  });
  world.refresh();

  const runTurn = world.systems.create(enemyTurnSystem);
  const spatial = new SpatialIndex(world, flatTestMap(7, 3));

  runTurn({
    world,
    player: new Player(world, playerEntity),
    spatial,
    random: () => 0,
    noises: [{ x: 4, y: 1, radius: 4 }],
  });
  assertEquals(world.components.getEntityData(GridPos, enemy), { x: 2, y: 1 });

  runTurn({
    world,
    player: new Player(world, playerEntity),
    spatial,
    random: () => 0,
  });
  assertEquals(world.components.getEntityData(GridPos, enemy), { x: 3, y: 1 });
  assertEquals(world.components.getEntityData(Facing, enemy), { dir: Direction.East });
});

Deno.test("melee dogs close two tiles and bite when they reach the player", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world, {
    x: 4,
    y: 1,
    dir: 3,
    blocking: true,
    tag: true,
    health: { current: 5, max: 5 },
  });
  const dog = createTestEnemy(world, {
    x: 1,
    y: 1,
    dir: 1,
    displayName: DisplayName.DigitalDog,
    attack: MELEE_ATTACK,
    archetype: EnemyArchetype.MeleeDog,
  });
  world.refresh();

  const events = world.systems.create(enemyTurnSystem)({
    world,
    player: new Player(world, playerEntity),
    spatial: new SpatialIndex(world, flatTestMap(6, 3)),
    random: () => 0,
  });

  assertEquals(world.components.getEntityData(GridPos, dog), { x: 3, y: 1 });
  assertEquals(world.components.getEntityData(Facing, dog), { dir: 1 });
  assertEquals(world.components.getEntityData(Health, playerEntity), { current: 4, max: 5 });
  assertEquals(events.map((event) => event.type), ["damageDealt"]);
});

Deno.test("gunslingers shoot from range instead of closing", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world, {
    x: 4,
    y: 1,
    dir: 3,
    blocking: true,
    tag: true,
    health: { current: 5, max: 5 },
  });
  const gunslinger = createTestEnemy(world, {
    x: 1,
    y: 1,
    dir: Direction.East,
    displayName: DisplayName.GigabitGunslinger,
    attack: { ...MELEE_ATTACK, range: 4 },
    archetype: EnemyArchetype.Gunslinger,
  });
  world.refresh();

  const events = world.systems.create(enemyTurnSystem)({
    world,
    player: new Player(world, playerEntity),
    spatial: new SpatialIndex(world, flatTestMap(6, 3)),
    random: () => 0,
  });

  assertEquals(world.components.getEntityData(GridPos, gunslinger), { x: 1, y: 1 });
  assertEquals(world.components.getEntityData(Facing, gunslinger), { dir: 1 });
  assertEquals(world.components.getEntityData(Health, playerEntity), { current: 4, max: 5 });
  assertEquals(events.map((event) => event.type), ["damageDealt"]);
});

Deno.test("gunslingers back away when adjacent", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world, {
    x: 3,
    y: 1,
    dir: 3,
    blocking: true,
    tag: true,
    health: { current: 5, max: 5 },
  });
  const gunslinger = createTestEnemy(world, {
    x: 2,
    y: 1,
    dir: 1,
    displayName: DisplayName.GigabitGunslinger,
    attack: { ...MELEE_ATTACK, range: 4 },
    archetype: EnemyArchetype.Gunslinger,
  });
  world.refresh();

  const events = world.systems.create(enemyTurnSystem)({
    world,
    player: new Player(world, playerEntity),
    spatial: new SpatialIndex(world, flatTestMap(6, 3)),
    random: () => 0,
  });

  assertEquals(world.components.getEntityData(GridPos, gunslinger), { x: 1, y: 1 });
  assertEquals(world.components.getEntityData(Facing, gunslinger), { dir: 3 });
  assertEquals(world.components.getEntityData(Health, playerEntity), { current: 5, max: 5 });
  assertEquals(events, []);
});

Deno.test("network neophytes use standard one-step pursuit", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world, {
    x: 4,
    y: 1,
    dir: 3,
    blocking: true,
    tag: true,
    health: { current: 5, max: 5 },
  });
  const neophyte = createTestEnemy(world, {
    x: 1,
    y: 1,
    dir: Direction.East,
    displayName: DisplayName.NetworkNeophyte,
    attack: MELEE_ATTACK,
    archetype: EnemyArchetype.NetworkNeophyte,
  });
  world.refresh();

  const events = world.systems.create(enemyTurnSystem)({
    world,
    player: new Player(world, playerEntity),
    spatial: new SpatialIndex(world, flatTestMap(6, 3)),
    random: () => 0,
  });

  assertEquals(world.components.getEntityData(GridPos, neophyte), { x: 2, y: 1 });
  assertEquals(world.components.getEntityData(Facing, neophyte), { dir: 1 });
  assertEquals(world.components.getEntityData(Health, playerEntity), { current: 5, max: 5 });
  assertEquals(events, []);
});

Deno.test("system sentinels hold position and face the player when out of range", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world, {
    x: 4,
    y: 1,
    dir: 3,
    blocking: true,
    tag: true,
    health: { current: 5, max: 5 },
  });
  const sentinel = createTestEnemy(world, {
    x: 1,
    y: 1,
    dir: Direction.East,
    displayName: DisplayName.SystemSentinel,
    attack: MELEE_ATTACK,
    archetype: EnemyArchetype.SystemSentinel,
  });
  world.refresh();

  const events = world.systems.create(enemyTurnSystem)({
    world,
    player: new Player(world, playerEntity),
    spatial: new SpatialIndex(world, flatTestMap(6, 3)),
    random: () => 0,
  });

  assertEquals(world.components.getEntityData(GridPos, sentinel), { x: 1, y: 1 });
  assertEquals(world.components.getEntityData(Facing, sentinel), { dir: 1 });
  assertEquals(world.components.getEntityData(Health, playerEntity), { current: 5, max: 5 });
  assertEquals(events, []);
});

Deno.test("agentic acolytes attack nearby cardinal targets without facing first", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world, {
    x: 3,
    y: 1,
    dir: 3,
    blocking: true,
    tag: true,
    health: { current: 5, max: 5 },
  });
  const acolyte = createTestEnemy(world, {
    x: 1,
    y: 1,
    dir: Direction.East,
    displayName: DisplayName.AgenticAcolyte,
    attack: {
      ...MELEE_ATTACK,
      range: 2,
      requiresFacing: AttackFacingRequirement.None,
      pattern: AttackPattern.Adjacent,
      targets: AttackTargetMode.All,
    },
    archetype: EnemyArchetype.AgenticAcolyte,
  });
  world.refresh();

  const events = world.systems.create(enemyTurnSystem)({
    world,
    player: new Player(world, playerEntity),
    spatial: new SpatialIndex(world, flatTestMap(6, 3)),
    random: () => 0,
  });

  assertEquals(world.components.getEntityData(GridPos, acolyte), { x: 1, y: 1 });
  assertEquals(world.components.getEntityData(Facing, acolyte), { dir: Direction.East });
  assertEquals(world.components.getEntityData(Health, playerEntity), { current: 4, max: 5 });
  assertEquals(events.map((event) => event.type), ["damageDealt"]);
});

function runEnemyTurn(
  world: World,
  playerEntity: Entity,
  map = TEST_MAP,
  noises: readonly NoiseStimulus[] = [],
): readonly GameEvent[] {
  return world.systems.create(enemyTurnSystem)({
    world,
    player: new Player(world, playerEntity),
    spatial: new SpatialIndex(world, map),
    random: () => 0,
    noises,
  });
}

const TEST_MAP = flatTestMap(5, 2);

const MELEE_ATTACK: AttackSchema = {
  minDamage: 1,
  maxDamage: 1,
  range: 1,
  requiresFacing: AttackFacingRequirement.Required,
  attackBonus: 20,
  critThreshold: 21,
  critMultiplier: 2,
  pattern: AttackPattern.Line,
  targets: AttackTargetMode.First,
};
