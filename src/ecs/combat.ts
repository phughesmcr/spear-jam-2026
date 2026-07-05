import type { Entity, World } from "@phughesmcr/miski";
import {
  Attack,
  AttackFacingRequirement,
  AttackPattern,
  type AttackSchema,
  AttackTargetMode,
  Defense,
  DisplayNameComponent,
  Enemy,
  Facing,
  GridPos,
  Health,
  Player as PlayerTag,
  Sprite,
  type SpriteId,
} from "@/src/ecs/components.ts";
import { createDeathEffect } from "@/src/ecs/prefabs.ts";
import type { SpatialAccess, SpatialLookup, SpatialMutations } from "@/src/ecs/spatial.ts";
import { CARDINAL_DELTAS, directionDelta } from "@/src/grid/direction.ts";
import { DEFAULT_ATTACK } from "@/src/game/attack.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { RandomSource } from "@/src/game/rng.ts";
import { displayNameText } from "@/src/game/names.ts";
import type { AmmoKind, CommandSlot } from "@/src/game/state.ts";

type WeaponSpec = AttackSchema & {
  readonly label: string;
  readonly ammo?: AmmoKind;
  readonly noiseRadius: number;
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

const MELEE_ATTACK_NOISE_RADIUS = 4;
const RANGED_ATTACK_NOISE_RADIUS = 8;
const PLAYER_WEAPONS: Readonly<Record<CommandSlot, WeaponSpec>> = {
  1: {
    ...DEFAULT_ATTACK,
    label: "Bit Shifter",
    noiseRadius: MELEE_ATTACK_NOISE_RADIUS,
    maxDamage: 2,
    attackBonus: 4,
  },
  2: {
    ...DEFAULT_ATTACK,
    label: "Pulse Pistol",
    ammo: "pistol",
    noiseRadius: RANGED_ATTACK_NOISE_RADIUS,
    minDamage: 2,
    maxDamage: 3,
    range: 2,
  },
  3: {
    ...DEFAULT_ATTACK,
    label: "Current Cannon",
    ammo: "cannon",
    noiseRadius: RANGED_ATTACK_NOISE_RADIUS,
    minDamage: 2,
    maxDamage: 4,
    range: 6,
    attackBonus: 1,
  },
};

export function weaponLabel(slot: CommandSlot): string {
  return PLAYER_WEAPONS[slot].label;
}

export function weaponAmmoKind(slot: CommandSlot): AmmoKind | undefined {
  return PLAYER_WEAPONS[slot].ammo;
}

export function weaponNoiseRadius(slot: CommandSlot): number {
  return PLAYER_WEAPONS[slot].noiseRadius;
}

export function attackWithSelectedWeapon(
  world: World,
  player: Entity,
  selectedWeapon: CommandSlot,
  spatial: SpatialAccess,
  random: RandomSource,
): readonly GameEvent[] {
  const weapon = PLAYER_WEAPONS[selectedWeapon];
  const targets = attackTargetsForSelectedWeapon(world, player, selectedWeapon, spatial);

  if (targets.length === 0) {
    return [{
      type: "attackMissed",
      actor: player,
      actorName: entityName(world, player),
    }];
  }

  const events: GameEvent[] = [];
  for (const target of targets) {
    events.push(...attackEntity(world, player, target, weapon, random, spatial));
  }
  return events;
}

export function attackTargetsForSelectedWeapon(
  world: World,
  player: Entity,
  selectedWeapon: CommandSlot,
  spatial: SpatialLookup,
): readonly Entity[] {
  return attackTargets(
    world,
    player,
    PLAYER_WEAPONS[selectedWeapon],
    spatial,
    (entity) => world.components.entityHas(Enemy, entity),
  );
}

export function attackEntity(
  world: World,
  attacker: Entity,
  defender: Entity,
  attack: AttackSchema,
  random: RandomSource,
  spatial: SpatialMutations,
): readonly GameEvent[] {
  const health = world.components.readEntityData(Health, defender);
  if (health === undefined) return [];
  if (health.current <= 0) return [];

  const defense = world.components.readEntityData(Defense, defender);
  if (defense === undefined) return [];

  const attackerName = entityName(world, attacker);
  const defenderName = entityName(world, defender);
  const outcome = resolveAttack(attack, defense.hitDc, random);
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

  const nextHealth = Math.max(0, health.current - outcome.damage);
  world.components.setEntityData(Health, defender, { current: nextHealth });
  const events: GameEvent[] = [{
    type: "damageDealt",
    actor: attacker,
    actorName: attackerName,
    target: defender,
    targetName: defenderName,
    roll: outcome.roll,
    total: outcome.total,
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
    const position = world.components.readEntityData(GridPos, defender);
    const sprite = world.components.readEntityData(Sprite, defender);
    if (position !== undefined && sprite !== undefined) createDeathEffect(world, position, sprite.id as SpriteId);
    spatial.removeEntity(defender);
  }
  return events;
}

export function resolveAttack(attack: AttackSchema, hitDc: number, random: RandomSource): AttackOutcome {
  const roll = rollDie(20, random);
  const total = roll + attack.attackBonus;
  const automaticHit = roll === 20;
  const critical = attack.critThreshold > 0 && roll >= attack.critThreshold;

  if (!automaticHit && total < hitDc) {
    return { type: "miss", roll, total };
  }

  const damage = rollDamage(attack, random) * (critical ? attack.critMultiplier : 1);
  return { type: "hit", roll, total, damage, critical };
}

export function entityAttack(world: World, entity: Entity): AttackSchema | undefined {
  const attack = world.components.readEntityData(Attack, entity);
  return attack === undefined ? undefined : toAttackSchema(attack);
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
    if (spatial.tileBlocksAttacks(x, y)) break;

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

  for (const delta of CARDINAL_DELTAS) {
    for (let distance = 1; distance <= attack.range; distance++) {
      const x = position.x + delta.dx * distance;
      const y = position.y + delta.dy * distance;
      if (spatial.tileBlocksAttacks(x, y)) break;

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
  const displayName = world.components.readEntityData(DisplayNameComponent, entity)?.displayName;
  if (displayName !== undefined) return displayNameText(displayName);
  return "Something";
}
