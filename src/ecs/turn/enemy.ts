import {
  AwarenessState,
  enemyArchetypeFor,
  EnemyAwareness,
  Facing,
  GridPos,
  Health,
  IDLE_AWARENESS,
} from "@/src/ecs/components.ts";
import {
  DEFAULT_ENEMY_BEHAVIOR_POLICY,
  DEFAULT_ENEMY_SENSES,
  type EnemyBehaviorPolicy,
  enemyCatalogEntry,
  type EnemySenses,
} from "@/src/ecs/enemy_catalog.ts";
import { type ActorIntent, playerPosition, resolveIntent, type TurnContext } from "@/src/ecs/turn/actions.ts";
import type { GameEvent } from "@/src/game/events.ts";
import { type BlocksSight, canHearNoise, canSeePoint, type NoiseStimulus } from "@/src/game/perception.ts";
import type { CardinalDirection, GridPoint } from "@/src/grid/direction.ts";
import type { Entity } from "@phughesmcr/miski";

const MAX_INVESTIGATION_TURNS = 5;

export type EnemyTurnContext = TurnContext & {
  readonly noises?: readonly NoiseStimulus[];
  readonly blocksSight?: BlocksSight;
};

type AwarenessResult =
  | { readonly state: typeof AwarenessState.Idle }
  | { readonly state: typeof AwarenessState.Alert; readonly position: GridPoint }
  | { readonly state: typeof AwarenessState.Investigating; readonly position: GridPoint };

export function runEnemyActorTurn(context: EnemyTurnContext, enemy: Entity): readonly GameEvent[] {
  if (!context.world.entities.isActive(enemy)) return [];

  const events: GameEvent[] = [];
  for (const intent of enemyIntentsForActor(context, enemy)) {
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
  if (!context.world.entities.isActive(enemy)) return [];

  const awareness = updateEnemyAwareness(context, enemy);
  const behavior = enemyBehaviorPolicyFor(context, enemy);
  switch (awareness.state) {
    case AwarenessState.Idle:
      return [];
    case AwarenessState.Alert:
      return alertIntentsFor(context, enemy, behavior);
    case AwarenessState.Investigating:
      return investigateIntentsFor(context, enemy, behavior, awareness.position);
  }
}

export function isPlayerDefeated(context: Pick<TurnContext, "world" | "player">): boolean {
  const health = context.world.components.readEntityData(Health, context.player);
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
  const archetype = enemyArchetypeFor(context.world, enemy);
  return archetype === undefined ? DEFAULT_ENEMY_BEHAVIOR_POLICY : enemyCatalogEntry(archetype).behavior;
}

function enemySensesFor(context: EnemyTurnContext, enemy: Entity): EnemySenses {
  const archetype = enemyArchetypeFor(context.world, enemy);
  return archetype === undefined ? DEFAULT_ENEMY_SENSES : enemyCatalogEntry(archetype).senses;
}

function distanceToPlayer(context: EnemyTurnContext, enemy: Entity): number {
  const enemyPosition = entityPosition(context, enemy);
  const target = playerPosition(context);
  return Math.abs(enemyPosition.x - target.x) + Math.abs(enemyPosition.y - target.y);
}

function updateEnemyAwareness(context: EnemyTurnContext, enemy: Entity): AwarenessResult {
  const position = entityPosition(context, enemy);
  const target = playerPosition(context);
  const facing = context.world.components.getEntityData(Facing, enemy).dir as CardinalDirection;
  const blocksSight = context.blocksSight ?? ((x, y) => context.spatial.tileBlocksSight(x, y));
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
    setEnemyAwareness(context, enemy, awareness);
    return { state: AwarenessState.Alert, position: target };
  }

  const heardNoise = nearestHeardNoise(position, context.noises ?? [], senses.hearingRadius);
  if (heardNoise !== undefined) {
    const awareness = {
      state: AwarenessState.Investigating,
      lastKnownX: heardNoise.x,
      lastKnownY: heardNoise.y,
      turnsSinceSeen: 0,
    } as const;
    setEnemyAwareness(context, enemy, awareness);
    return { state: AwarenessState.Investigating, position: heardNoise };
  }

  const current = context.world.components.getEntityData(EnemyAwareness, enemy);
  if (hasLastKnownPosition(current) && current.state !== AwarenessState.Idle) {
    const lastKnown = { x: current.lastKnownX, y: current.lastKnownY };
    const turnsSinceSeen = current.turnsSinceSeen + 1;
    if (!samePosition(position, lastKnown) && turnsSinceSeen <= MAX_INVESTIGATION_TURNS) {
      setEnemyAwareness(context, enemy, {
        state: AwarenessState.Investigating,
        lastKnownX: lastKnown.x,
        lastKnownY: lastKnown.y,
        turnsSinceSeen,
      });
      return { state: AwarenessState.Investigating, position: lastKnown };
    }
  }

  setEnemyAwareness(context, enemy, IDLE_AWARENESS);
  return { state: AwarenessState.Idle };
}

function entityPosition(context: EnemyTurnContext, enemy: Entity): GridPoint {
  return context.world.components.getEntityData(GridPos, enemy);
}

function nearestHeardNoise(
  position: GridPoint,
  noises: readonly NoiseStimulus[],
  hearingRadius: number,
): NoiseStimulus | undefined {
  let nearest:
    | {
      readonly noise: NoiseStimulus;
      readonly distance: number;
    }
    | undefined;

  for (const noise of noises) {
    const audibleRadius = Math.min(noise.radius, hearingRadius);
    if (!canHearNoise(position, { x: noise.x, y: noise.y, radius: audibleRadius })) continue;

    const distance = Math.abs(position.x - noise.x) + Math.abs(position.y - noise.y);
    if (nearest === undefined || distance < nearest.distance) {
      nearest = { noise, distance };
    }
  }

  return nearest?.noise;
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
): void {
  const current = context.world.components.getEntityData(EnemyAwareness, enemy);
  if (
    current.state === awareness.state &&
    current.lastKnownX === awareness.lastKnownX &&
    current.lastKnownY === awareness.lastKnownY &&
    current.turnsSinceSeen === awareness.turnsSinceSeen
  ) {
    return;
  }

  context.world.components.setEntityData(EnemyAwareness, enemy, awareness);
}

function hasLastKnownPosition(awareness: { readonly lastKnownX: number; readonly lastKnownY: number }): boolean {
  return awareness.lastKnownX !== IDLE_AWARENESS.lastKnownX &&
    awareness.lastKnownY !== IDLE_AWARENESS.lastKnownY;
}

function samePosition(a: GridPoint, b: GridPoint): boolean {
  return a.x === b.x && a.y === b.y;
}
