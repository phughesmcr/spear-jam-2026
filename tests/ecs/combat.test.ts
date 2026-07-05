import { assertEquals } from "@std/assert";
import type { Entity } from "@phughesmcr/miski";
import {
  AttackFacingRequirement,
  AttackPattern,
  AttackTargetMode,
  Blocking,
  Defense,
  Facing,
  GridPos,
  Health,
  Player as PlayerTag,
} from "@/src/ecs/components.ts";
import type { AttackSchema } from "@/src/ecs/components.ts";
import { attackEntity, attackTargets, playerWeaponSpec, resolveAttack } from "@/src/ecs/combat.ts";
import { createEntityContentStore, entityContent, setEntityContent } from "@/src/ecs/entity_content.ts";
import { DisplayName } from "@/src/game/names.ts";
import { SpatialIndex } from "@/src/ecs/spatial.ts";
import type { SpatialLookup } from "@/src/ecs/spatial.ts";
import { createWorld } from "@/src/ecs/world.ts";
import { createEntity, flatTestMap } from "@/tests/ecs/helpers.ts";

const BASE_ATTACK: AttackSchema = {
  minDamage: 1,
  maxDamage: 1,
  range: 1,
  requiresFacing: AttackFacingRequirement.Required,
  attackBonus: 0,
  critThreshold: 20,
  critMultiplier: 2,
  pattern: AttackPattern.Line,
  targets: AttackTargetMode.First,
};

Deno.test("player weapon specs expose metadata and attack fields from one combat table", () => {
  assertEquals(playerWeaponSpec(1), {
    ...BASE_ATTACK,
    label: "Bit Shifter",
    noiseRadius: 4,
    maxDamage: 2,
    attackBonus: 4,
  });
  assertEquals(playerWeaponSpec(2), {
    ...BASE_ATTACK,
    label: "Pulse Pistol",
    ammo: "pistol",
    noiseRadius: 8,
    minDamage: 2,
    maxDamage: 3,
    range: 2,
    attackBonus: 2,
  });
  assertEquals(playerWeaponSpec(3), {
    ...BASE_ATTACK,
    label: "Current Cannon",
    ammo: "cannon",
    noiseRadius: 8,
    minDamage: 2,
    maxDamage: 4,
    range: 6,
    attackBonus: 1,
  });
});

Deno.test("resolveAttack misses when the d20 total is below defense", () => {
  const outcome = resolveAttack(BASE_ATTACK, 10, sequenceRandom([0]));

  assertEquals(outcome.type, "miss");
  assertEquals(outcome.roll, 1);
  assertEquals(outcome.total, 1);
});

Deno.test("resolveAttack multiplies damage on a critical hit", () => {
  const outcome = resolveAttack(
    { ...BASE_ATTACK, minDamage: 2, maxDamage: 2, critMultiplier: 3 },
    10,
    sequenceRandom([0.999, 0]),
  );

  assertEquals(outcome.type, "hit");
  if (outcome.type !== "hit") return;
  assertEquals(outcome.critical, true);
  assertEquals(outcome.damage, 6);
});

Deno.test("resolveAttack treats a natural 20 as a non-critical auto-hit when below the crit threshold", () => {
  const outcome = resolveAttack(
    { ...BASE_ATTACK, minDamage: 2, maxDamage: 2, critThreshold: 21, critMultiplier: 3 },
    25,
    sequenceRandom([0.999, 0]),
  );

  assertEquals(outcome.type, "hit");
  if (outcome.type !== "hit") return;
  assertEquals(outcome.roll, 20);
  assertEquals(outcome.total, 20);
  assertEquals(outcome.critical, false);
  assertEquals(outcome.damage, 2);
});

Deno.test("attackTargets returns the first entity in a directional line", async () => {
  const world = await createWorld();
  const attacker = createEntity(world);
  const firstTarget = createEntity(world);
  const secondTarget = createEntity(world);

  world.components.addToEntity(GridPos, attacker, { x: 1, y: 1 });
  world.components.addToEntity(Facing, attacker, { dir: 1 });
  world.components.addToEntity(GridPos, firstTarget, { x: 2, y: 1 });
  world.components.addToEntity(GridPos, secondTarget, { x: 3, y: 1 });

  const targets = attackTargets(
    world,
    attacker,
    { ...BASE_ATTACK, range: 3 },
    testSpatial([
      { x: 2, y: 1, entity: firstTarget },
      { x: 3, y: 1, entity: secondTarget },
    ]),
    () => true,
  );

  assertEquals(targets, [firstTarget]);
});

Deno.test("attackTargets stops line attacks at attack-blocking terrain", async () => {
  const world = await createWorld();
  const attacker = createEntity(world);
  const target = createEntity(world);

  world.components.addToEntity(GridPos, attacker, { x: 1, y: 1 });
  world.components.addToEntity(Facing, attacker, { dir: 1 });
  world.components.addToEntity(GridPos, target, { x: 3, y: 1 });

  const targets = attackTargets(
    world,
    attacker,
    { ...BASE_ATTACK, range: 3 },
    testSpatial([{ x: 3, y: 1, entity: target }], {
      tileBlocksAttacks: (x, y) => x === 2 && y === 1,
    }),
    () => true,
  );

  assertEquals(targets, []);
});

Deno.test("attackTargets can hit all cardinal adjacent targets without facing", async () => {
  const world = await createWorld();
  const attacker = createEntity(world);
  const northTarget = createEntity(world);
  const eastTarget = createEntity(world);
  const diagonalTarget = createEntity(world);

  world.components.addToEntity(GridPos, attacker, { x: 5, y: 5 });
  world.components.addToEntity(GridPos, northTarget, { x: 5, y: 4 });
  world.components.addToEntity(GridPos, eastTarget, { x: 6, y: 5 });
  world.components.addToEntity(GridPos, diagonalTarget, { x: 6, y: 6 });

  const targets = attackTargets(
    world,
    attacker,
    {
      ...BASE_ATTACK,
      requiresFacing: AttackFacingRequirement.None,
      pattern: AttackPattern.Adjacent,
      targets: AttackTargetMode.All,
    },
    testSpatial([
      { x: 5, y: 4, entity: northTarget },
      { x: 6, y: 5, entity: eastTarget },
      { x: 6, y: 6, entity: diagonalTarget },
    ]),
    () => true,
  );

  assertEquals(targets, [northTarget, eastTarget]);
});

Deno.test("attackEntity emits damage events and updates health", async () => {
  const world = await createWorld();
  const contentStore = createEntityContentStore();
  const player = createEntity(world);
  const defender = createEntity(world);

  world.components.addToEntity(GridPos, player, { x: 1, y: 1 });
  world.components.addToEntity(PlayerTag, player);
  world.components.addToEntity(GridPos, defender, { x: 2, y: 1 });
  setEntityContent(contentStore, defender, { displayName: DisplayName.DigitalDog });
  world.components.addToEntity(Health, defender, { current: 3, max: 3 });
  world.components.addToEntity(Defense, defender, { hitDc: 10 });
  world.refresh();

  const events = attackEntity(
    world,
    contentStore,
    player,
    defender,
    { ...BASE_ATTACK, minDamage: 1, maxDamage: 1, attackBonus: 20 },
    sequenceRandom([0, 0]),
    new SpatialIndex(world, TEST_MAP),
  );

  assertEquals(events, [
    {
      type: "damageDealt",
      actor: player,
      actorName: "You",
      target: defender,
      targetName: "Digital Dog",
      roll: 1,
      total: 21,
      amount: 1,
      critical: false,
    },
  ]);
  assertEquals(world.components.getEntityData(Health, defender), { current: 2, max: 3 });
});

Deno.test("attackEntity resolves attacks against the defender hit DC", async () => {
  const world = await createWorld();
  const contentStore = createEntityContentStore();
  const attacker = createEntity(world);
  const defender = createEntity(world);

  world.components.addToEntity(GridPos, attacker, { x: 1, y: 1 });
  world.components.addToEntity(GridPos, defender, { x: 2, y: 1 });
  setEntityContent(contentStore, defender, { displayName: DisplayName.DigitalDog });
  world.components.addToEntity(Health, defender, { current: 3, max: 3 });
  world.components.addToEntity(Defense, defender, { hitDc: 15 });
  world.refresh();

  const events = attackEntity(
    world,
    contentStore,
    attacker,
    defender,
    { ...BASE_ATTACK, attackBonus: 4 },
    sequenceRandom([0.45, 0]),
    new SpatialIndex(world, TEST_MAP),
  );

  assertEquals(events, [
    {
      type: "attackMissed",
      actor: attacker,
      actorName: "Something",
      target: defender,
      targetName: "Digital Dog",
      roll: 10,
      total: 14,
    },
  ]);
  assertEquals(world.components.getEntityData(Health, defender), { current: 3, max: 3 });
});

Deno.test("attackEntity emits defeat events and removes defeated non-player entities from spatial lookup", async () => {
  const world = await createWorld();
  const contentStore = createEntityContentStore();
  const player = createEntity(world);
  const defender = createEntity(world);

  world.components.addToEntity(GridPos, player, { x: 1, y: 1 });
  world.components.addToEntity(PlayerTag, player);
  world.components.addToEntity(GridPos, defender, { x: 2, y: 1 });
  world.components.addToEntity(Blocking, defender);
  setEntityContent(contentStore, defender, { displayName: DisplayName.DigitalDog });
  world.components.addToEntity(Health, defender, { current: 1, max: 1 });
  world.components.addToEntity(Defense, defender, { hitDc: 10 });
  world.refresh();

  const spatial = new SpatialIndex(world, TEST_MAP);
  const events = attackEntity(
    world,
    contentStore,
    player,
    defender,
    { ...BASE_ATTACK, minDamage: 1, maxDamage: 1, attackBonus: 20 },
    sequenceRandom([0, 0]),
    spatial,
  );

  assertEquals(events, [
    {
      type: "damageDealt",
      actor: player,
      actorName: "You",
      target: defender,
      targetName: "Digital Dog",
      roll: 1,
      total: 21,
      amount: 1,
      critical: false,
    },
    {
      type: "entityDefeated",
      actor: player,
      entity: defender,
      entityName: "Digital Dog",
    },
  ]);
  assertEquals(world.entities.isActive(defender), false);
  assertEquals(spatial.blockingEntityAt(2, 1), undefined);
  assertEquals(entityContent(contentStore, defender), undefined);
});

Deno.test("attackEntity emits player defeat without removing the player entity", async () => {
  const world = await createWorld();
  const contentStore = createEntityContentStore();
  const player = createEntity(world);
  const attacker = createEntity(world);

  world.components.addToEntity(GridPos, player, { x: 1, y: 1 });
  world.components.addToEntity(PlayerTag, player);
  world.components.addToEntity(Health, player, { current: 1, max: 1 });
  world.components.addToEntity(Defense, player, { hitDc: 10 });
  world.components.addToEntity(GridPos, attacker, { x: 2, y: 1 });
  setEntityContent(contentStore, attacker, { displayName: DisplayName.DigitalDog });
  world.refresh();

  const events = attackEntity(
    world,
    contentStore,
    attacker,
    player,
    { ...BASE_ATTACK, minDamage: 1, maxDamage: 1, attackBonus: 20 },
    sequenceRandom([0, 0]),
    new SpatialIndex(world, TEST_MAP),
  );

  assertEquals(events, [
    {
      type: "damageDealt",
      actor: attacker,
      actorName: "Digital Dog",
      target: player,
      targetName: "You",
      roll: 1,
      total: 21,
      amount: 1,
      critical: false,
    },
    {
      type: "entityDefeated",
      actor: attacker,
      entity: player,
      entityName: "You",
    },
  ]);
  assertEquals(world.entities.isActive(player), true);
});

Deno.test("attackEntity no-ops against already defeated defenders", async () => {
  const world = await createWorld();
  const contentStore = createEntityContentStore();
  const player = createEntity(world);
  const attacker = createEntity(world);
  let randomCalls = 0;

  world.components.addToEntity(GridPos, player, { x: 1, y: 1 });
  world.components.addToEntity(PlayerTag, player);
  world.components.addToEntity(Health, player, { current: 0, max: 1 });
  world.components.addToEntity(GridPos, attacker, { x: 2, y: 1 });
  setEntityContent(contentStore, attacker, { displayName: DisplayName.DigitalDog });
  world.refresh();

  const events = attackEntity(
    world,
    contentStore,
    attacker,
    player,
    { ...BASE_ATTACK, minDamage: 1, maxDamage: 1, attackBonus: 20 },
    () => {
      randomCalls++;
      return 0;
    },
    new SpatialIndex(world, TEST_MAP),
  );

  assertEquals(events, []);
  assertEquals(randomCalls, 0);
  assertEquals(world.components.getEntityData(Health, player), { current: 0, max: 1 });
  assertEquals(world.entities.isActive(player), true);
});

function sequenceRandom(values: readonly number[]): () => number {
  let index = 0;
  return () => values[index++] ?? values[values.length - 1] ?? 0;
}

function entityAt(positions: readonly { readonly x: number; readonly y: number; readonly entity: Entity }[]) {
  return (x: number, y: number): Entity | undefined => {
    return positions.find((position) => position.x === x && position.y === y)?.entity;
  };
}

function testSpatial(
  positions: readonly { readonly x: number; readonly y: number; readonly entity: Entity }[],
  overrides: {
    readonly tileBlocks?: (x: number, y: number) => boolean;
    readonly tileBlocksSight?: (x: number, y: number) => boolean;
    readonly tileBlocksAttacks?: (x: number, y: number) => boolean;
  } = {},
): SpatialLookup {
  const blockingEntityAt = entityAt(positions);
  const tileBlocks = overrides.tileBlocks ?? (() => false);
  const tileBlocksAttacks = overrides.tileBlocksAttacks ?? tileBlocks;
  return {
    tileBlocks,
    tileBlocksSight: overrides.tileBlocksSight ?? tileBlocks,
    tileBlocksAttacks,
    blockingEntityAt,
    positionBlocks: (x, y) => tileBlocks(x, y) || blockingEntityAt(x, y) !== undefined,
  };
}

const TEST_MAP = flatTestMap(3, 2);
