import type { Entity, World } from "@phughesmcr/miski";
import { Attack, AttackPattern, AttackTargetMode, Enemy, Facing, GridPos, Health, Npc } from "@/src/ecs/components.ts";
import type { AttackSchema } from "@/src/ecs/components.ts";
import type { Player } from "@/src/ecs/player.ts";
import { directionDelta } from "@/src/grid/direction.ts";
import type { CardinalDirection } from "@/src/grid/direction.ts";
import type { CommandSlot } from "@/src/game/state.ts";
import { displayNameText } from "@/src/ecs/names.ts";

type WeaponSpec = AttackSchema & {
  readonly label: string;
};

type TileBlocks = (x: number, y: number) => boolean;
type BlockingEntityAt = (x: number, y: number) => Entity | undefined;
type EntityPredicate = (entity: Entity) => boolean;
type RandomSource = () => number;

export type AttackOutcome =
  | { readonly type: "miss"; readonly roll: number; readonly total: number }
  | {
    readonly type: "hit";
    readonly roll: number;
    readonly total: number;
    readonly damage: number;
    readonly critical: boolean;
  };

export const DEFAULT_SELECTED_WEAPON: CommandSlot = 1;

const DEFAULT_DEFENSE = 10;
const CARDINAL_DIRECTIONS = [0, 1, 2, 3] as const satisfies readonly CardinalDirection[];

const PLAYER_WEAPONS: Readonly<Record<CommandSlot, WeaponSpec>> = {
  1: {
    label: "Melee",
    minDamage: 1,
    maxDamage: 2,
    range: 1,
    requiresFacing: 1,
    attackBonus: 4,
    critThreshold: 20,
    critMultiplier: 2,
    pattern: AttackPattern.Line,
    targets: AttackTargetMode.First,
  },
  2: {
    label: "Pistol",
    minDamage: 2,
    maxDamage: 3,
    range: 2,
    requiresFacing: 1,
    attackBonus: 2,
    critThreshold: 20,
    critMultiplier: 2,
    pattern: AttackPattern.Line,
    targets: AttackTargetMode.First,
  },
  3: {
    label: "Long-range",
    minDamage: 2,
    maxDamage: 4,
    range: 6,
    requiresFacing: 1,
    attackBonus: 1,
    critThreshold: 20,
    critMultiplier: 2,
    pattern: AttackPattern.Line,
    targets: AttackTargetMode.First,
  },
};

export function weaponLabel(slot: CommandSlot): string {
  return PLAYER_WEAPONS[slot].label;
}

export function attackWithSelectedWeapon(
  world: World,
  player: Player,
  selectedWeapon: CommandSlot,
  tileBlocks: TileBlocks,
  blockingEntityAt: BlockingEntityAt,
  random: RandomSource,
): void {
  const weapon = PLAYER_WEAPONS[selectedWeapon];
  const targets = attackTargets(
    world,
    player.getEntity(),
    weapon,
    tileBlocks,
    blockingEntityAt,
    (entity) => world.components.entityHas(Enemy, entity),
  );

  if (targets.length === 0) {
    console.log(`${weapon.label} attack missed.`);
    return;
  }

  for (const target of targets) {
    attackEntity(world, player.getEntity(), player.getEntity(), target, weapon, random);
  }
}

export function attackEntity(
  world: World,
  playerEntity: Entity,
  attacker: Entity,
  defender: Entity,
  attack: AttackSchema,
  random: RandomSource,
): void {
  if (!world.entities.isActive(defender)) return;
  if (!world.components.entityHas(Health, defender)) return;

  const outcome = resolveAttack(attack, random);
  if (outcome.type === "miss") {
    console.log(
      `${entityName(world, playerEntity, attacker)} missed ${
        entityName(world, playerEntity, defender)
      } (${outcome.roll}+${attack.attackBonus}).`,
    );
    return;
  }

  const health = world.components.getEntityData(Health, defender);
  const nextHealth = Math.max(0, health.current - outcome.damage);
  world.components.setEntityData(Health, defender, { current: nextHealth, max: health.max });
  console.log(
    `${entityName(world, playerEntity, attacker)} hit ${
      entityName(world, playerEntity, defender)
    } for ${outcome.damage}${outcome.critical ? " critical" : ""}.`,
  );

  if (nextHealth > 0) return;

  if (defender === playerEntity) {
    console.log("You are defeated.");
    return;
  }

  console.log(`${entityName(world, playerEntity, defender)} is defeated.`);
  world.entities.destroy(defender);
}

export function resolveAttack(attack: AttackSchema, random: RandomSource): AttackOutcome {
  const roll = rollDie(20, random);
  const total = roll + attack.attackBonus;
  const critical = attack.critThreshold > 0 && roll >= attack.critThreshold;

  if (!critical && total < DEFAULT_DEFENSE) {
    return { type: "miss", roll, total };
  }

  const damage = rollDamage(attack, random) * (critical ? attack.critMultiplier : 1);
  return { type: "hit", roll, total, damage, critical };
}

export function entityAttack(world: World, entity: Entity): AttackSchema | undefined {
  if (!world.components.entityHas(Attack, entity)) return undefined;
  return toAttackSchema(world.components.getEntityData(Attack, entity));
}

export function attackTargets(
  world: World,
  attacker: Entity,
  attack: AttackSchema,
  tileBlocks: TileBlocks,
  blockingEntityAt: BlockingEntityAt,
  isTarget: EntityPredicate,
): readonly Entity[] {
  if (!world.components.entityHas(GridPos, attacker)) return [];

  switch (attack.pattern) {
    case AttackPattern.Line:
      return lineAttackTargets(world, attacker, attack, tileBlocks, blockingEntityAt, isTarget);
    case AttackPattern.Adjacent:
      return adjacentAttackTargets(world, attacker, attack, tileBlocks, blockingEntityAt, isTarget);
  }
}

function lineAttackTargets(
  world: World,
  attacker: Entity,
  attack: AttackSchema,
  tileBlocks: TileBlocks,
  blockingEntityAt: BlockingEntityAt,
  isTarget: EntityPredicate,
): readonly Entity[] {
  if (!world.components.entityHas(Facing, attacker)) return [];

  const targets: Entity[] = [];
  const position = world.components.getEntityData(GridPos, attacker);
  const facing = world.components.getEntityData(Facing, attacker);
  const delta = directionDelta(facing.dir);

  for (let distance = 1; distance <= attack.range; distance++) {
    const x = position.x + delta.dx * distance;
    const y = position.y + delta.dy * distance;
    if (tileBlocks(x, y)) break;

    const entity = blockingEntityAt(x, y);
    if (entity === undefined || entity === attacker) continue;

    if (isTarget(entity)) {
      targets.push(entity);
      if (attack.targets === AttackTargetMode.First) break;
      continue;
    }

    break;
  }

  return targets;
}

function adjacentAttackTargets(
  world: World,
  attacker: Entity,
  attack: AttackSchema,
  tileBlocks: TileBlocks,
  blockingEntityAt: BlockingEntityAt,
  isTarget: EntityPredicate,
): readonly Entity[] {
  const targets: Entity[] = [];
  const position = world.components.getEntityData(GridPos, attacker);

  for (const dir of CARDINAL_DIRECTIONS) {
    const delta = directionDelta(dir);
    for (let distance = 1; distance <= attack.range; distance++) {
      const x = position.x + delta.dx * distance;
      const y = position.y + delta.dy * distance;
      if (tileBlocks(x, y)) break;

      const entity = blockingEntityAt(x, y);
      if (entity === undefined || entity === attacker) continue;
      if (!isTarget(entity)) break;

      targets.push(entity);
      if (attack.targets === AttackTargetMode.First) return targets;
    }
  }

  return targets;
}

function rollDamage(attack: AttackSchema, random: RandomSource): number {
  const minDamage = Math.min(attack.minDamage, attack.maxDamage);
  const maxDamage = Math.max(attack.minDamage, attack.maxDamage);
  return randomInt(minDamage, maxDamage, random);
}

function rollDie(sides: number, random: RandomSource): number {
  return randomInt(1, sides, random);
}

function randomInt(min: number, max: number, random: RandomSource): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function toAttackSchema(attack: Record<keyof AttackSchema, number>): AttackSchema {
  return {
    ...attack,
    pattern: attack.pattern as AttackSchema["pattern"],
    targets: attack.targets as AttackSchema["targets"],
  };
}

function entityName(world: World, playerEntity: Entity, entity: Entity): string {
  if (entity === playerEntity) return "You";
  if (world.components.entityHas(Npc, entity)) {
    return displayNameText(world.components.getEntityData(Npc, entity).displayName);
  }
  return "Something";
}
