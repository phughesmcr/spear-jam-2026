import { assertEquals } from "@std/assert";
import type { Entity } from "@phughesmcr/miski";
import {
  AttackFacingRequirement,
  AttackPattern,
  AttackTargetMode,
  Blocking,
  DisplayNameComponent,
  Facing,
  GridPos,
  Health,
  Player as PlayerTag,
} from "@/src/ecs/components.ts";
import type { AttackSchema } from "@/src/ecs/components.ts";
import {
  attackEntity,
  attackTargets,
  resolveAttack,
  weaponAmmoKind,
  weaponLabel,
  weaponNoiseRadius,
} from "@/src/ecs/combat.ts";
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

Deno.test("weapon metadata exposes labels, ammo, and attack noise from the combat table", () => {
  assertEquals(weaponLabel(1), "Bit Shifter");
  assertEquals(weaponAmmoKind(1), undefined);
  assertEquals(weaponNoiseRadius(1), 4);

  assertEquals(weaponLabel(2), "Pulse Pistol");
  assertEquals(weaponAmmoKind(2), "pistol");
  assertEquals(weaponNoiseRadius(2), 8);

  assertEquals(weaponLabel(3), "Current Cannon");
  assertEquals(weaponAmmoKind(3), "cannon");
  assertEquals(weaponNoiseRadius(3), 8);
});

Deno.test("resolveAttack misses when the d20 total is below defense", () => {
  const outcome = resolveAttack(BASE_ATTACK, sequenceRandom([0]));

  assertEquals(outcome.type, "miss");
  assertEquals(outcome.roll, 1);
  assertEquals(outcome.total, 1);
});

Deno.test("resolveAttack multiplies damage on a critical hit", () => {
  const outcome = resolveAttack(
    { ...BASE_ATTACK, minDamage: 2, maxDamage: 2, critMultiplier: 3 },
    sequenceRandom([0.999, 0]),
  );

  assertEquals(outcome.type, "hit");
  if (outcome.type !== "hit") return;
  assertEquals(outcome.critical, true);
  assertEquals(outcome.damage, 6);
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
  const player = createEntity(world);
  const defender = createEntity(world);

  world.components.addToEntity(GridPos, player, { x: 1, y: 1 });
  world.components.addToEntity(PlayerTag, player);
  world.components.addToEntity(GridPos, defender, { x: 2, y: 1 });
  world.components.addToEntity(DisplayNameComponent, defender, { displayName: DisplayName.Imp });
  world.components.addToEntity(Health, defender, { current: 3, max: 3 });
  world.refresh();

  const events = attackEntity(
    world,
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
      targetName: "Imp",
      amount: 1,
      critical: false,
    },
  ]);
  assertEquals(world.components.getEntityData(Health, defender), { current: 2, max: 3 });
});

Deno.test("attackEntity emits defeat events and removes defeated non-player entities from spatial lookup", async () => {
  const world = await createWorld();
  const player = createEntity(world);
  const defender = createEntity(world);

  world.components.addToEntity(GridPos, player, { x: 1, y: 1 });
  world.components.addToEntity(PlayerTag, player);
  world.components.addToEntity(GridPos, defender, { x: 2, y: 1 });
  world.components.addToEntity(Blocking, defender);
  world.components.addToEntity(DisplayNameComponent, defender, { displayName: DisplayName.Imp });
  world.components.addToEntity(Health, defender, { current: 1, max: 1 });
  world.refresh();

  const spatial = new SpatialIndex(world, TEST_MAP);
  const events = attackEntity(
    world,
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
      targetName: "Imp",
      amount: 1,
      critical: false,
    },
    {
      type: "entityDefeated",
      actor: player,
      entity: defender,
      entityName: "Imp",
    },
  ]);
  assertEquals(world.entities.isActive(defender), false);
  assertEquals(spatial.blockingEntityAt(2, 1), undefined);
});

Deno.test("attackEntity emits player defeat without removing the player entity", async () => {
  const world = await createWorld();
  const player = createEntity(world);
  const attacker = createEntity(world);

  world.components.addToEntity(GridPos, player, { x: 1, y: 1 });
  world.components.addToEntity(PlayerTag, player);
  world.components.addToEntity(Health, player, { current: 1, max: 1 });
  world.components.addToEntity(GridPos, attacker, { x: 2, y: 1 });
  world.components.addToEntity(DisplayNameComponent, attacker, { displayName: DisplayName.Imp });
  world.refresh();

  const events = attackEntity(
    world,
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
      actorName: "Imp",
      target: player,
      targetName: "You",
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
  tileBlocks: (x: number, y: number) => boolean = () => false,
): SpatialLookup {
  const blockingEntityAt = entityAt(positions);
  return {
    tileBlocks,
    blockingEntityAt,
    positionBlocks: (x, y) => tileBlocks(x, y) || blockingEntityAt(x, y) !== undefined,
  };
}

const TEST_MAP = flatTestMap(3, 2);
