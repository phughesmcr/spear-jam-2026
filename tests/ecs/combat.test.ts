import type { Entity, World } from "@phughesmcr/miski";
import { AttackPattern, AttackTargetMode, Facing, GridPos } from "@/src/ecs/components.ts";
import type { AttackSchema } from "@/src/ecs/components.ts";
import { attackTargets, resolveAttack } from "@/src/ecs/combat.ts";
import { createWorld } from "@/src/ecs/world.ts";

const BASE_ATTACK: AttackSchema = {
  minDamage: 1,
  maxDamage: 1,
  range: 1,
  requiresFacing: 1,
  attackBonus: 0,
  critThreshold: 20,
  critMultiplier: 2,
  pattern: AttackPattern.Line,
  targets: AttackTargetMode.First,
};

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
    () => false,
    entityAt([
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
      requiresFacing: 0,
      pattern: AttackPattern.Adjacent,
      targets: AttackTargetMode.All,
    },
    () => false,
    entityAt([
      { x: 5, y: 4, entity: northTarget },
      { x: 6, y: 5, entity: eastTarget },
      { x: 6, y: 6, entity: diagonalTarget },
    ]),
    () => true,
  );

  assertEquals(targets, [northTarget, eastTarget]);
});

function sequenceRandom(values: readonly number[]): () => number {
  let index = 0;
  return () => values[index++] ?? values[values.length - 1] ?? 0;
}

function createEntity(world: World): Entity {
  const entity = world.entities.create();
  if (entity === undefined) throw new Error("Failed to create test entity");
  return entity;
}

function entityAt(positions: readonly { readonly x: number; readonly y: number; readonly entity: Entity }[]) {
  return (x: number, y: number): Entity | undefined => {
    return positions.find((position) => position.x === x && position.y === y)?.entity;
  };
}

function assertEquals<T>(actual: T, expected: T): void {
  if (!Object.is(actual, expected) && JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}
