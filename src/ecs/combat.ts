import type { Entity, World } from "@phughesmcr/miski";
import {
  Attack,
  AttackFacingRequirement,
  AttackPattern,
  AttackTargetMode,
  DisplayNameComponent,
  Enemy,
  Facing,
  GridPos,
  Health,
  Player as PlayerTag,
} from "@/src/ecs/components.ts";
import type { AttackSchema } from "@/src/ecs/components.ts";
import type { Player } from "@/src/ecs/player.ts";
import type { SpatialAccess, SpatialLookup, SpatialMutations } from "@/src/ecs/spatial.ts";
import { Direction, directionDelta } from "@/src/grid/direction.ts";
import type { CardinalDirection } from "@/src/grid/direction.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { RandomSource } from "@/src/game/rng.ts";
import { displayNameText } from "@/src/game/names.ts";
import type { AmmoKind, CommandSlot } from "@/src/game/state.ts";

type WeaponSpec = AttackSchema & {
  readonly label: string;
  readonly ammo?: AmmoKind;
};

type EntityPredicate = (entity: Entity) => boolean;

export type AttackOutcome =
  | { readonly type: "miss"; readonly roll: number; readonly total: number }
  | {
    readonly type: "hit";
    readonly roll: number;
    readonly total: number;
    readonly damage: number;
    readonly critical: boolean;
  };

const DEFAULT_DEFENSE = 10;
const CARDINAL_DIRECTIONS = [
  Direction.North,
  Direction.East,
  Direction.South,
  Direction.West,
] as const satisfies readonly CardinalDirection[];

const PLAYER_WEAPONS: Readonly<Record<CommandSlot, WeaponSpec>> = {
  1: {
    label: "Melee",
    minDamage: 1,
    maxDamage: 2,
    range: 1,
    requiresFacing: AttackFacingRequirement.Required,
    attackBonus: 4,
    critThreshold: 20,
    critMultiplier: 2,
    pattern: AttackPattern.Line,
    targets: AttackTargetMode.First,
  },
  2: {
    label: "Pistol",
    ammo: "pistol",
    minDamage: 2,
    maxDamage: 3,
    range: 2,
    requiresFacing: AttackFacingRequirement.Required,
    attackBonus: 2,
    critThreshold: 20,
    critMultiplier: 2,
    pattern: AttackPattern.Line,
    targets: AttackTargetMode.First,
  },
  3: {
    label: "Current Cannon",
    ammo: "cannon",
    minDamage: 2,
    maxDamage: 4,
    range: 6,
    requiresFacing: AttackFacingRequirement.Required,
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

export function weaponAmmoKind(slot: CommandSlot): AmmoKind | undefined {
  return PLAYER_WEAPONS[slot].ammo;
}

export function attackWithSelectedWeapon(
  world: World,
  player: Player,
  selectedWeapon: CommandSlot,
  spatial: SpatialAccess,
  random: RandomSource,
): readonly GameEvent[] {
  const weapon = PLAYER_WEAPONS[selectedWeapon];
  const targets = attackTargets(
    world,
    player.getEntity(),
    weapon,
    spatial,
    (entity) => world.components.entityHas(Enemy, entity),
  );

  if (targets.length === 0) {
    return [{
      type: "attackMissed",
      actor: player.getEntity(),
      actorName: entityName(world, player.getEntity()),
    }];
  }

  const events: GameEvent[] = [];
  for (const target of targets) {
    events.push(...attackEntity(world, player.getEntity(), target, weapon, random, spatial));
  }
  return events;
}

export function attackEntity(
  world: World,
  attacker: Entity,
  defender: Entity,
  attack: AttackSchema,
  random: RandomSource,
  spatial: SpatialMutations,
): readonly GameEvent[] {
  if (!world.entities.isActive(defender)) return [];
  if (!world.components.entityHas(Health, defender)) return [];

  const attackerName = entityName(world, attacker);
  const defenderName = entityName(world, defender);
  const outcome = resolveAttack(attack, random);
  if (outcome.type === "miss") {
    return [{
      type: "attackMissed",
      actor: attacker,
      actorName: attackerName,
      target: defender,
      targetName: defenderName,
      roll: outcome.roll,
      total: outcome.total,
    }];
  }

  const health = world.components.getEntityData(Health, defender);
  const nextHealth = Math.max(0, health.current - outcome.damage);
  world.components.setEntityData(Health, defender, { current: nextHealth, max: health.max });
  const events: GameEvent[] = [{
    type: "damageDealt",
    actor: attacker,
    actorName: attackerName,
    target: defender,
    targetName: defenderName,
    amount: outcome.damage,
    critical: outcome.critical,
  }];

  if (nextHealth > 0) return events;

  events.push({
    type: "entityDefeated",
    actor: attacker,
    entity: defender,
    entityName: defenderName,
  });
  // The player entity survives defeat so the session can report the loss;
  // everything else is removed from play immediately.
  if (!world.components.entityHas(PlayerTag, defender)) {
    spatial.removeEntity(defender);
  }
  return events;
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
  spatial: SpatialLookup,
  isTarget: EntityPredicate,
): readonly Entity[] {
  if (!world.components.entityHas(GridPos, attacker)) return [];

  switch (attack.pattern) {
    case AttackPattern.Line:
      return lineAttackTargets(world, attacker, attack, spatial, isTarget);
    case AttackPattern.Adjacent:
      return adjacentAttackTargets(world, attacker, attack, spatial, isTarget);
  }
}

function lineAttackTargets(
  world: World,
  attacker: Entity,
  attack: AttackSchema,
  spatial: SpatialLookup,
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
    if (spatial.tileBlocks(x, y)) break;

    const entity = spatial.blockingEntityAt(x, y);
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
  spatial: SpatialLookup,
  isTarget: EntityPredicate,
): readonly Entity[] {
  const targets: Entity[] = [];
  const position = world.components.getEntityData(GridPos, attacker);

  for (const dir of CARDINAL_DIRECTIONS) {
    const delta = directionDelta(dir);
    for (let distance = 1; distance <= attack.range; distance++) {
      const x = position.x + delta.dx * distance;
      const y = position.y + delta.dy * distance;
      if (spatial.tileBlocks(x, y)) break;

      const entity = spatial.blockingEntityAt(x, y);
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
    requiresFacing: toAttackFacingRequirement(attack.requiresFacing),
    pattern: toAttackPattern(attack.pattern),
    targets: toAttackTargetMode(attack.targets),
  };
}

function toAttackFacingRequirement(value: number): AttackFacingRequirement {
  switch (value) {
    case AttackFacingRequirement.None:
    case AttackFacingRequirement.Required:
      return value;
    default:
      throw new Error(`Unknown attack facing requirement: ${value}`);
  }
}

function toAttackPattern(value: number): AttackPattern {
  switch (value) {
    case AttackPattern.Line:
    case AttackPattern.Adjacent:
      return value;
    default:
      throw new Error(`Unknown attack pattern: ${value}`);
  }
}

function toAttackTargetMode(value: number): AttackTargetMode {
  switch (value) {
    case AttackTargetMode.First:
    case AttackTargetMode.All:
      return value;
    default:
      throw new Error(`Unknown attack target mode: ${value}`);
  }
}

function entityName(world: World, entity: Entity): string {
  if (world.components.entityHas(PlayerTag, entity)) return "You";
  if (world.components.entityHas(DisplayNameComponent, entity)) {
    return displayNameText(world.components.getEntityData(DisplayNameComponent, entity).displayName);
  }
  return "Something";
}
