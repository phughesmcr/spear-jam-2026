import type { SpriteId } from "@/src/game/content/sprite_ids.ts";
import {
  AttackPattern,
  type AttackSchema,
  AttackTargetMode,
  hasComponent,
  readComponent,
  writeComponent,
} from "@/src/game/simulation/components.ts";
import type { GameRuntime } from "@/src/game/simulation/runtime.ts";
import type { GameEvent } from "@/src/game/model/events.ts";
import type { RandomSource } from "@/src/engine/random.ts";
import type { CommandSlot } from "@/src/game/model/state.ts";
import { Direction } from "@/src/game/world/direction.ts";
import { TerrainBlock } from "turn-based-engine/crawler";
import type { Entity } from "turn-based-engine/ecs";

export type DefeatEffect = { readonly x: number; readonly y: number; readonly sprite: SpriteId };
export type DefeatEffectWriter = (effect: DefeatEffect) => void;
type EntityPredicate = (entity: Entity) => boolean;
const CARDINAL_DIRECTIONS = [Direction.North, Direction.East, Direction.South, Direction.West] as const;
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
  runtime: GameRuntime,
  player: Entity,
  selectedWeapon: CommandSlot,
  random: RandomSource,
  writeDefeatEffect?: DefeatEffectWriter,
): readonly GameEvent[] {
  const weapon = runtime.content.simulation.weapon(selectedWeapon);
  const targets = attackTargets(runtime, player, weapon, (entity) => hasComponent(runtime.game, entity, "Enemy"));
  if (targets.length === 0) return [{ type: "attackMissed", actor: player, actorName: entityName(runtime, player) }];
  const events: GameEvent[] = [];
  for (const target of targets) {
    events.push(...attackEntity(runtime, player, target, weapon, random, writeDefeatEffect));
  }
  return events;
}

export function attackEntity(
  runtime: GameRuntime,
  attacker: Entity,
  defender: Entity,
  attack: AttackSchema,
  random: RandomSource,
  writeDefeatEffect?: DefeatEffectWriter,
): readonly GameEvent[] {
  const health = readComponent(runtime.game, defender, "Health");
  const defense = readComponent(runtime.game, defender, "Defense");
  if (health === undefined || health.current <= 0 || defense === undefined) return [];
  const attackerName = entityName(runtime, attacker);
  const defenderName = entityName(runtime, defender);
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
  writeComponent(runtime.game, defender, "Health", { current: nextHealth });
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
  events.push({ type: "entityDefeated", actor: attacker, entity: defender, entityName: defenderName });
  if (!hasComponent(runtime.game, defender, "Player")) {
    const position = runtime.crawler.entityPosition(defender);
    const sprite = readComponent(runtime.game, defender, "Sprite");
    if (sprite !== undefined) writeDefeatEffect?.({ ...position, sprite: sprite.id as SpriteId });
    runtime.crawler.despawnCrawler(defender);
  }
  return events;
}

export function resolveAttack(attack: AttackSchema, hitDc: number, random: RandomSource): AttackOutcome {
  const roll = randomInt(1, 20, random);
  const total = roll + attack.attackBonus;
  const critical = attack.critThreshold > 0 && roll >= attack.critThreshold;
  if (roll !== 20 && total < hitDc) return { type: "miss", roll, total };
  const damage =
    randomInt(Math.min(attack.minDamage, attack.maxDamage), Math.max(attack.minDamage, attack.maxDamage), random) *
    (critical ? attack.critMultiplier : 1);
  return { type: "hit", roll, total, damage, critical };
}

export function entityAttack(runtime: GameRuntime, entity: Entity): AttackSchema | undefined {
  return readComponent(runtime.game, entity, "Attack") as AttackSchema | undefined;
}

export function attackTargets(
  runtime: GameRuntime,
  attacker: Entity,
  attack: AttackSchema,
  isTarget: EntityPredicate,
): readonly Entity[] {
  if (!runtime.game.isEntityAlive(attacker)) return [];
  return attack.pattern === AttackPattern.Line ?
    lineAttackTargets(runtime, attacker, attack, isTarget) :
    adjacentAttackTargets(runtime, attacker, attack, isTarget);
}

function lineAttackTargets(
  runtime: GameRuntime,
  attacker: Entity,
  attack: AttackSchema,
  isTarget: EntityPredicate,
): readonly Entity[] {
  const facing = runtime.crawler.entityFacing(attacker);
  if (facing === undefined) return [];
  const targets: Entity[] = [];
  const position = runtime.crawler.entityPosition(attacker);
  runtime.crawler.scanCardinal({
    origin: position,
    direction: facing,
    maxDistance: attack.range,
    occupantBlock: TerrainBlock.Movement,
    blockingBlock: TerrainBlock.EffectLine,
  }, (_x, _y, _distance, occupant) => {
    if (occupant === undefined || occupant === attacker) return;
    if (!isTarget(occupant)) return "stop";
    targets.push(occupant);
    if (attack.targets === AttackTargetMode.First) return "stop";
  });
  return targets;
}

function adjacentAttackTargets(
  runtime: GameRuntime,
  attacker: Entity,
  attack: AttackSchema,
  isTarget: EntityPredicate,
): readonly Entity[] {
  const targets: Entity[] = [];
  const position = runtime.crawler.entityPosition(attacker);
  for (const direction of CARDINAL_DIRECTIONS) {
    runtime.crawler.scanCardinal({
      origin: position,
      direction,
      maxDistance: attack.range,
      occupantBlock: TerrainBlock.Movement,
      blockingBlock: TerrainBlock.EffectLine,
    }, (_x, _y, _distance, occupant) => {
      if (occupant === undefined || occupant === attacker) return;
      if (!isTarget(occupant)) return "stop";
      targets.push(occupant);
      if (attack.targets === AttackTargetMode.First) return "stop";
    });
    if (attack.targets === AttackTargetMode.First && targets.length > 0) return targets;
  }
  return targets;
}

function randomInt(min: number, max: number, random: RandomSource): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function entityName(runtime: GameRuntime, entity: Entity): string {
  if (hasComponent(runtime.game, entity, "Player")) return "You";
  const code = readComponent(runtime.game, entity, "DisplayName")?.displayName;
  return code === undefined ? "Something" : runtime.content.simulation.displayNameForCode(code).text;
}
