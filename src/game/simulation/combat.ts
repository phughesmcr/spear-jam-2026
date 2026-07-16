import type { SpriteId } from "@/src/game/content/sprite_ids.ts";
import {
  AttackPattern,
  type AttackSchema,
  AttackTargetMode,
  type GameComponentMap,
  hasComponent,
  readComponent,
  writeComponent,
} from "@/src/game/simulation/components.ts";
import type { GameRuntime } from "@/src/game/simulation/runtime.ts";
import type { GameEvent } from "@/src/game/model/events.ts";
import type { CommandSlot } from "@/src/game/model/state.ts";
import { Direction } from "turn-based-engine/crawler";
import { type CrawlerMutation, TerrainBlock } from "turn-based-engine/crawler";
import type { Entity } from "turn-based-engine/ecs";
import type { SimulationRandom } from "turn-based-engine/simulation";

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
  mutation: CrawlerMutation<GameComponentMap>,
  random: SimulationRandom,
): readonly GameEvent[] {
  const weapon = runtime.content.simulation.weapon(selectedWeapon);
  const targets = attackTargets(
    runtime,
    player,
    weapon,
    (entity) => hasComponent(runtime.simulation.ecs, entity, "Enemy"),
  );
  if (targets.length === 0) return [{ type: "attackMissed", actor: player, actorName: entityName(runtime, player) }];
  const events: GameEvent[] = [];
  for (const target of targets) {
    events.push(...attackEntity(runtime, player, target, weapon, mutation, random));
  }
  return events;
}

export function attackEntity(
  runtime: GameRuntime,
  attacker: Entity,
  defender: Entity,
  attack: AttackSchema,
  mutation: CrawlerMutation<GameComponentMap>,
  random: SimulationRandom,
): readonly GameEvent[] {
  const health = readComponent(runtime.simulation.ecs, defender, "Health");
  const defense = readComponent(runtime.simulation.ecs, defender, "Defense");
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
  writeComponent(mutation, defender, "Health", { current: nextHealth });
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
  const position = runtime.simulation.crawler.entityPosition(defender);
  const stableId = runtime.simulation.crawler.entityStableId(defender);
  const sprite = readComponent(runtime.simulation.ecs, defender, "Sprite")?.id as SpriteId | undefined;
  events.push({
    type: "entityDefeated",
    actor: attacker,
    entity: defender,
    entityName: defenderName,
    stableId,
    position,
    ...(sprite === undefined ? {} : { sprite }),
  });
  if (!hasComponent(runtime.simulation.ecs, defender, "Player")) {
    mutation.despawnCrawler(defender);
  }
  return events;
}

export function resolveAttack(attack: AttackSchema, hitDc: number, random: SimulationRandom): AttackOutcome {
  const roll = random.nextInt(1, 20);
  const total = roll + attack.attackBonus;
  const critical = attack.critThreshold > 0 && roll >= attack.critThreshold;
  if (roll !== 20 && total < hitDc) return { type: "miss", roll, total };
  const damage =
    random.nextInt(Math.min(attack.minDamage, attack.maxDamage), Math.max(attack.minDamage, attack.maxDamage)) *
    (critical ? attack.critMultiplier : 1);
  return { type: "hit", roll, total, damage, critical };
}

export function entityAttack(runtime: GameRuntime, entity: Entity): AttackSchema | undefined {
  return readComponent(runtime.simulation.ecs, entity, "Attack") as AttackSchema | undefined;
}

export function attackTargets(
  runtime: GameRuntime,
  attacker: Entity,
  attack: AttackSchema,
  isTarget: EntityPredicate,
): readonly Entity[] {
  if (!runtime.simulation.ecs.isEntityAlive(attacker)) return [];
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
  const facing = runtime.simulation.crawler.entityFacing(attacker);
  if (facing === undefined) return [];
  const targets: Entity[] = [];
  const position = runtime.simulation.crawler.entityPosition(attacker);
  runtime.simulation.crawler.scanCardinal({
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
  const position = runtime.simulation.crawler.entityPosition(attacker);
  for (const direction of CARDINAL_DIRECTIONS) {
    runtime.simulation.crawler.scanCardinal({
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

function entityName(runtime: GameRuntime, entity: Entity): string {
  if (hasComponent(runtime.simulation.ecs, entity, "Player")) return "You";
  const code = readComponent(runtime.simulation.ecs, entity, "DisplayName")?.displayName;
  return code === undefined ? "Something" : runtime.content.simulation.displayNameForCode(code).text;
}
