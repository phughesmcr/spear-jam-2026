import type { Entity, World } from "@phughesmcr/miski";
import {
  Attack,
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
import type { SpatialAccess, SpatialLookup, SpatialMutations } from "@/src/ecs/spatial.ts";
import { CARDINAL_DELTAS, directionDelta } from "@/src/grid/direction.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { RandomSource } from "@/src/game/rng.ts";
import { displayNameForCode, displayNameText } from "@/src/game/names.ts";
import type { CommandSlot } from "@/src/game/state.ts";
import { playerWeaponSpec } from "@/src/game/weapons.ts";

export type DefeatEffect = {
  readonly x: number;
  readonly y: number;
  readonly sprite: SpriteId;
};

export type DefeatEffectWriter = (effect: DefeatEffect) => void;

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

export function attackWithSelectedWeapon(
  world: World,
  player: Entity,
  selectedWeapon: CommandSlot,
  spatial: SpatialAccess,
  random: RandomSource,
  writeDefeatEffect?: DefeatEffectWriter,
): readonly GameEvent[] {
  const weapon = playerWeaponSpec(selectedWeapon);
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
    events.push(...attackEntity(world, player, target, weapon, random, spatial, writeDefeatEffect));
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
    playerWeaponSpec(selectedWeapon),
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
  writeDefeatEffect?: DefeatEffectWriter,
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
    if (position !== undefined && sprite !== undefined) {
      writeDefeatEffect?.({ x: position.x, y: position.y, sprite: sprite.id as SpriteId });
    }
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
  // Typed-array storage yields plain numbers; spawn writes only AttackDef codes.
  return world.components.readEntityData(Attack, entity) as AttackSchema | undefined;
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

function entityName(world: World, entity: Entity): string {
  if (world.components.entityHas(PlayerTag, entity)) return "You";
  const displayNameCode = world.components.readEntityData(DisplayNameComponent, entity)?.displayName;
  if (displayNameCode !== undefined) return displayNameText(displayNameForCode(displayNameCode));
  return "Something";
}
