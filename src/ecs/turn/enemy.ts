import {
  DEFAULT_ENEMY_BEHAVIOR_POLICY,
  DEFAULT_ENEMY_SENSES,
  type EnemyBehaviorPolicy,
  enemyCatalogEntry,
  type EnemySenses,
} from "@/src/content/enemies.ts";
import {
  AwarenessState,
  enemyArchetypeFor,
  IDLE_AWARENESS,
  readComponent,
  requireComponent,
  writeComponent,
} from "@/src/ecs/components.ts";
import { type ActorIntent, playerPosition, resolveIntent, type TurnContext } from "@/src/ecs/turn/actions.ts";
import type { GameEvent } from "@/src/game/events.ts";
import { type BlocksSight, canSeePoint, type NoiseStimulus } from "@/src/game/perception.ts";
import type { CardinalDirection, GridPoint } from "@/src/grid/direction.ts";
import { TerrainBlock } from "turn-based-engine/crawler";
import type { Entity } from "turn-based-engine/ecs";

const MAX_INVESTIGATION_TURNS = 5;

export type EnemyTurnContext = TurnContext & {
  readonly hearing?: EnemyHearing;
  readonly blocksSight?: BlocksSight;
};

export type EnemyHearing = {
  readonly field: TurnContext["runtime"]["hearingField"];
  readonly sources: readonly NoiseStimulus[];
};

export function prepareEnemyHearing(
  runtime: TurnContext["runtime"],
  noises: readonly NoiseStimulus[],
): EnemyHearing {
  const radii = noises.map((noise) => Math.max(0, Math.floor(noise.radius)));
  const sharedStrength = radii.reduce((maximum, radius) => Math.max(maximum, radius), 0);
  runtime.hearingField.rebuild(
    noises.map((noise, index) => ({
      x: noise.x,
      y: noise.y,
      radius: radii[index]!,
      strength: sharedStrength,
    })),
    { distanceMetric: "manhattan" },
  );
  return { field: runtime.hearingField, sources: noises };
}

type AwarenessResult =
  | { readonly state: typeof AwarenessState.Idle }
  | { readonly state: typeof AwarenessState.Alert; readonly position: GridPoint }
  | { readonly state: typeof AwarenessState.Investigating; readonly position: GridPoint };

export function runEnemyActorTurn(context: EnemyTurnContext, enemy: Entity): readonly GameEvent[] {
  if (!context.runtime.game.isEntityAlive(enemy)) return [];

  const { awareness, events: awarenessEvents } = updateEnemyAwareness(context, enemy);
  const events: GameEvent[] = [...awarenessEvents];
  for (const intent of enemyIntentsForAwareness(context, enemy, awareness)) {
    if (isPlayerDefeated(context)) break;

    const resolution = resolveIntent(context, intent);
    events.push(...resolution.events);
    if (intent.type === "attack" && resolution.acted === true) break;
    if (intent.type === "move" && intent.stopAfterActing === true && resolution.acted === true) break;
    if (intent.type === "move" && intent.stopAfterBlocked === true && resolution.acted !== true) break;
  }
  return events;
}

export function enemyIntentsForActor(context: EnemyTurnContext, enemy: Entity): readonly ActorIntent[] {
  if (!context.runtime.game.isEntityAlive(enemy)) return [];
  const { awareness } = updateEnemyAwareness(context, enemy);
  return enemyIntentsForAwareness(context, enemy, awareness);
}

function enemyIntentsForAwareness(
  context: EnemyTurnContext,
  enemy: Entity,
  awareness: AwarenessResult,
): readonly ActorIntent[] {
  const behavior = enemyBehaviorPolicyFor(context, enemy);
  const state = awareness.state;
  switch (state) {
    case AwarenessState.Idle:
      return [];
    case AwarenessState.Alert:
      return alertIntentsFor(context, enemy, behavior);
    case AwarenessState.Investigating:
      return investigateIntentsFor(context, enemy, behavior, awareness.position);
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export function isPlayerDefeated(context: Pick<TurnContext, "runtime" | "player">): boolean {
  const health = readComponent(context.runtime.game, context.player, "Health");
  return health !== undefined && health.current <= 0;
}

function alertIntentsFor(
  context: EnemyTurnContext,
  enemy: Entity,
  behavior: EnemyBehaviorPolicy,
): readonly ActorIntent[] {
  switch (behavior.alert.type) {
    case "advance":
      return attackThenMoveTowardPlayer(context, enemy, behavior.alert.steps, behavior.alert.attackAfterMove ?? false);
    case "skirmish":
      return skirmishAtRange(context, enemy, behavior.alert.retreatRange, behavior.alert.advanceSteps);
    case "hold":
      return holdAndWatchPlayer(context, enemy);
    default: {
      const _exhaustive: never = behavior.alert;
      return _exhaustive;
    }
  }
}

function skirmishAtRange(
  context: EnemyTurnContext,
  enemy: Entity,
  retreatRange: number,
  advanceSteps: number,
): readonly ActorIntent[] {
  if (distanceToPlayer(context, enemy) <= retreatRange) {
    return [
      {
        type: "move",
        actor: enemy,
        mode: { type: "awayFrom", target: playerPosition(context) },
        stopAfterActing: true,
      },
      ...attackThenMoveTowardPlayer(context, enemy, advanceSteps),
    ];
  }

  return attackThenMoveTowardPlayer(context, enemy, advanceSteps);
}

function holdAndWatchPlayer(context: EnemyTurnContext, enemy: Entity): readonly ActorIntent[] {
  return [
    { type: "attack", actor: enemy, target: "player" },
    { type: "face", actor: enemy, mode: { type: "toward", target: playerPosition(context) } },
  ];
}

function attackThenMoveTowardPlayer(
  context: EnemyTurnContext,
  enemy: Entity,
  steps: number,
  attackAfterMove = false,
): readonly ActorIntent[] {
  const intents: ActorIntent[] = [{ type: "attack", actor: enemy, target: "player" }];
  for (let step = 0; step < steps; step++) {
    intents.push({
      type: "move",
      actor: enemy,
      mode: { type: "toward", target: playerPosition(context) },
      stopAfterBlocked: true,
    });
    if (attackAfterMove) intents.push({ type: "attack", actor: enemy, target: "player" });
  }
  return intents;
}

function investigateIntentsFor(
  context: EnemyTurnContext,
  enemy: Entity,
  behavior: EnemyBehaviorPolicy,
  target: GridPoint,
): readonly ActorIntent[] {
  switch (behavior.investigate.type) {
    case "move":
      return investigateTarget(context, enemy, target, behavior.investigate.steps);
    case "watch":
      return watchInvestigationTarget(context, enemy, target);
    default: {
      const _exhaustive: never = behavior.investigate;
      return _exhaustive;
    }
  }
}

function watchInvestigationTarget(context: EnemyTurnContext, enemy: Entity, target: GridPoint): readonly ActorIntent[] {
  if (samePosition(entityPosition(context, enemy), target)) {
    setEnemyAwareness(context, enemy, IDLE_AWARENESS);
    return [];
  }

  return [{ type: "face", actor: enemy, mode: { type: "toward", target } }];
}

function investigateTarget(
  context: EnemyTurnContext,
  enemy: Entity,
  target: GridPoint,
  steps: number,
): readonly ActorIntent[] {
  if (samePosition(entityPosition(context, enemy), target)) {
    setEnemyAwareness(context, enemy, IDLE_AWARENESS);
    return [];
  }

  return Array.from({ length: steps }, () => ({
    type: "move",
    actor: enemy,
    mode: { type: "toward", target },
    stopAfterBlocked: true,
  } as const));
}

function enemyBehaviorPolicyFor(context: EnemyTurnContext, enemy: Entity): EnemyBehaviorPolicy {
  const archetype = enemyArchetypeFor(context.runtime.game, enemy);
  return archetype === undefined ? DEFAULT_ENEMY_BEHAVIOR_POLICY : enemyCatalogEntry(archetype).behavior;
}

function enemySensesFor(context: EnemyTurnContext, enemy: Entity): EnemySenses {
  const archetype = enemyArchetypeFor(context.runtime.game, enemy);
  return archetype === undefined ? DEFAULT_ENEMY_SENSES : enemyCatalogEntry(archetype).senses;
}

function distanceToPlayer(context: EnemyTurnContext, enemy: Entity): number {
  const enemyPosition = entityPosition(context, enemy);
  const target = playerPosition(context);
  return Math.abs(enemyPosition.x - target.x) + Math.abs(enemyPosition.y - target.y);
}

function updateEnemyAwareness(
  context: EnemyTurnContext,
  enemy: Entity,
): { readonly awareness: AwarenessResult; readonly events: readonly GameEvent[] } {
  const position = entityPosition(context, enemy);
  const target = playerPosition(context);
  const facing = context.runtime.crawler.entityFacing(enemy) as CardinalDirection;
  const blocksSight = context.blocksSight ?? ((x, y) => context.runtime.crawler.blocksAt(x, y, TerrainBlock.Sight));
  const senses = enemySensesFor(context, enemy);

  if (
    canSeePoint(position, target, {
      radius: senses.sightRadius,
      facing,
      blocksSight,
    })
  ) {
    const awareness = {
      state: AwarenessState.Alert,
      lastKnownX: target.x,
      lastKnownY: target.y,
      turnsSinceSeen: 0,
    } as const;
    return {
      awareness: { state: AwarenessState.Alert, position: target },
      events: setEnemyAwareness(context, enemy, awareness),
    };
  }

  const heardNoise = nearestHeardNoise(context, position, senses.hearingRadius);
  if (heardNoise !== undefined) {
    const awareness = {
      state: AwarenessState.Investigating,
      lastKnownX: heardNoise.x,
      lastKnownY: heardNoise.y,
      turnsSinceSeen: 0,
    } as const;
    return {
      awareness: { state: AwarenessState.Investigating, position: heardNoise },
      events: setEnemyAwareness(context, enemy, awareness),
    };
  }

  const current = requireComponent(context.runtime.game, enemy, "EnemyAwareness");
  if (hasLastKnownPosition(current) && current.state !== AwarenessState.Idle) {
    const lastKnown = { x: current.lastKnownX, y: current.lastKnownY };
    const turnsSinceSeen = current.turnsSinceSeen + 1;
    if (!samePosition(position, lastKnown) && turnsSinceSeen <= MAX_INVESTIGATION_TURNS) {
      return {
        awareness: { state: AwarenessState.Investigating, position: lastKnown },
        events: setEnemyAwareness(context, enemy, {
          state: AwarenessState.Investigating,
          lastKnownX: lastKnown.x,
          lastKnownY: lastKnown.y,
          turnsSinceSeen,
        }),
      };
    }
  }

  return {
    awareness: { state: AwarenessState.Idle },
    events: setEnemyAwareness(context, enemy, IDLE_AWARENESS),
  };
}

function entityPosition(context: EnemyTurnContext, enemy: Entity): GridPoint {
  return context.runtime.crawler.entityPosition(enemy);
}

function nearestHeardNoise(
  context: EnemyTurnContext,
  position: GridPoint,
  hearingRadius: number,
): NoiseStimulus | undefined {
  const hearing = context.hearing;
  if (hearing === undefined) return undefined;
  const sourceIndex = hearing.field.sourceIndexAt(position.x, position.y, "nearest");
  if (sourceIndex === undefined) return undefined;
  const distance = hearing.field.distanceAt(position.x, position.y, "nearest");
  if (distance === undefined || distance > Math.max(0, Math.floor(hearingRadius))) return undefined;
  return hearing.sources[sourceIndex];
}

function setEnemyAwareness(
  context: EnemyTurnContext,
  enemy: Entity,
  awareness: {
    readonly state: AwarenessState;
    readonly lastKnownX: number;
    readonly lastKnownY: number;
    readonly turnsSinceSeen: number;
  },
): readonly GameEvent[] {
  const current = requireComponent(context.runtime.game, enemy, "EnemyAwareness");
  if (
    current.state === awareness.state &&
    current.lastKnownX === awareness.lastKnownX &&
    current.lastKnownY === awareness.lastKnownY &&
    current.turnsSinceSeen === awareness.turnsSinceSeen
  ) {
    return [];
  }

  const events: GameEvent[] = [];
  if (awareness.state === AwarenessState.Alert && current.state !== AwarenessState.Alert) {
    events.push({ type: "enemyAlerted", entity: enemy });
  } else if (
    awareness.state === AwarenessState.Investigating && current.state === AwarenessState.Idle
  ) {
    events.push({ type: "enemyInvestigating", entity: enemy });
  }

  writeComponent(context.runtime.game, enemy, "EnemyAwareness", awareness);
  return events;
}

function hasLastKnownPosition(awareness: { readonly lastKnownX: number; readonly lastKnownY: number }): boolean {
  return awareness.lastKnownX !== IDLE_AWARENESS.lastKnownX &&
    awareness.lastKnownY !== IDLE_AWARENESS.lastKnownY;
}

function samePosition(a: GridPoint, b: GridPoint): boolean {
  return a.x === b.x && a.y === b.y;
}
