import { type Entity, System, type World } from "@phughesmcr/miski";
import {
  AttackFacingRequirement,
  AwarenessState,
  EnemyArchetype,
  enemyArchetypeFor,
  IDLE_AWARENESS,
} from "@/src/ecs/components.ts";
import type {
  EnemyAwarenessPartitions,
  EnemyAwarenessSchema,
  FacingPartitions,
  GridPosPartitions,
} from "@/src/ecs/components.ts";
import { attackEntity, attackTargets, entityAttack } from "@/src/ecs/combat.ts";
import type { Player } from "@/src/ecs/player.ts";
import { enemyTurnQuery } from "@/src/ecs/queries.ts";
import type { SpatialAccess, SpatialLookup, SpatialMutations } from "@/src/ecs/spatial.ts";
import type { GameEvent } from "@/src/game/events.ts";
import { canHearNoise, canSeePoint } from "@/src/game/perception.ts";
import type { BlocksSight, NoiseStimulus } from "@/src/game/perception.ts";
import type { RandomSource } from "@/src/game/rng.ts";
import { CARDINAL_DELTAS, Direction, manhattanDistance } from "@/src/grid/direction.ts";
import type { CardinalDirection, GridDelta, GridPoint } from "@/src/grid/direction.ts";

const DEFAULT_ENEMY_SIGHT_RADIUS = 6;
const MAX_INVESTIGATION_TURNS = 6;

export type EnemyTurnContext = {
  readonly world: World;
  readonly player: Player;
  readonly spatial: SpatialAccess;
  readonly random: RandomSource;
  readonly noises?: readonly NoiseStimulus[];
  readonly blocksSight?: BlocksSight;
};

export type EnemyTurnSystem = (context: EnemyTurnContext) => readonly GameEvent[];

type EnemyActorContext = {
  readonly context: EnemyTurnContext;
  readonly entity: Entity;
  readonly gridPos: GridPosPartitions;
  readonly facing: FacingPartitions;
  readonly enemyAwareness: EnemyAwarenessPartitions;
};

type EnemyAlertStrategy = (actor: EnemyActorContext) => readonly GameEvent[];
type EnemyInvestigationStrategy = (actor: EnemyActorContext, target: GridPoint) => readonly GameEvent[];

type EnemyBehaviorPlan = {
  readonly alert: EnemyAlertStrategy;
  readonly investigate: EnemyInvestigationStrategy;
};

const DEFAULT_BEHAVIOR_PLAN: EnemyBehaviorPlan = {
  alert: attackThenPursueOneStep,
  investigate: investigateOneStep,
};

const BEHAVIOR_PLANS: Readonly<Record<EnemyArchetype, EnemyBehaviorPlan>> = {
  [EnemyArchetype.MeleeDog]: {
    alert: pounceThenBite,
    investigate: investigateTwoSteps,
  },
  [EnemyArchetype.Gunslinger]: {
    alert: skirmishAtRange,
    investigate: investigateOneStep,
  },
  [EnemyArchetype.NetworkNeophyte]: DEFAULT_BEHAVIOR_PLAN,
  [EnemyArchetype.SystemSentinel]: {
    alert: holdAndWatchPlayer,
    investigate: watchInvestigationTarget,
  },
  [EnemyArchetype.AgenticAcolyte]: DEFAULT_BEHAVIOR_PLAN,
};

export const enemyTurnSystem = new System({
  name: "enemyTurnSystem",
  query: enemyTurnQuery,
  callback: (components, enemies, context: EnemyTurnContext): readonly GameEvent[] => {
    const gridPos = components.gridPos.partitions;
    const facing = components.facing.partitions;
    const enemyAwareness = components.enemyAwareness.partitions;
    const indices = enemies.indices;
    const count = enemies.count;
    const events: GameEvent[] = [];

    for (let i = 0; i < count; i++) {
      events.push(...advanceEnemyTurn(context, indices[i]!, gridPos, facing, enemyAwareness));
    }
    return events;
  },
});

function advanceEnemyTurn(
  context: EnemyTurnContext,
  entity: Entity,
  gridPos: GridPosPartitions,
  facing: FacingPartitions,
  enemyAwareness: EnemyAwarenessPartitions,
): readonly GameEvent[] {
  const { world } = context;
  if (!world.entities.isActive(entity)) return [];

  const actor = { context, entity, gridPos, facing, enemyAwareness };
  const awareness = updateEnemyAwareness(actor);
  return selectEnemyAction(actor, awareness);
}

function selectEnemyAction(actor: EnemyActorContext, awareness: AwarenessResult): readonly GameEvent[] {
  switch (awareness.state) {
    case AwarenessState.Idle:
      return [];
    case AwarenessState.Alert:
      return behaviorPlanFor(actor.context.world, actor.entity).alert(actor);
    case AwarenessState.Investigating:
      return behaviorPlanFor(actor.context.world, actor.entity).investigate(actor, awareness.position);
  }
}

function attackThenPursueOneStep(actor: EnemyActorContext): readonly GameEvent[] {
  return attackThenMoveTowardPlayer(actor, 1);
}

function pounceThenBite(actor: EnemyActorContext): readonly GameEvent[] {
  const { context, entity, gridPos, facing } = actor;
  const attackEvents = attackPlayerIfPossible(context, entity, gridPos, facing);
  if (attackEvents !== undefined) return attackEvents;

  for (let step = 0; step < 2; step++) {
    if (!tryMoveEnemyTowardPlayer(context.player, entity, gridPos, facing, context.spatial)) break;

    const stepAttackEvents = attackPlayerIfPossible(context, entity, gridPos, facing);
    if (stepAttackEvents !== undefined) return stepAttackEvents;
  }

  return [];
}

function skirmishAtRange(actor: EnemyActorContext): readonly GameEvent[] {
  const { context, entity, gridPos, facing } = actor;
  if (
    distanceToPlayer(context.player, entity, gridPos) <= 1 &&
    tryMoveEnemyAwayFromPlayer(context.player, entity, gridPos, facing, context.spatial)
  ) {
    return [];
  }

  return attackThenMoveTowardPlayer(actor, 1);
}

function holdAndWatchPlayer(actor: EnemyActorContext): readonly GameEvent[] {
  const { context, entity, gridPos, facing } = actor;
  const attackEvents = attackPlayerIfPossible(context, entity, gridPos, facing);
  if (attackEvents !== undefined) return attackEvents;

  faceEntityToward(entity, context.player.getPosition(), gridPos, facing);
  return [];
}

function attackThenMoveTowardPlayer(actor: EnemyActorContext, steps: number): readonly GameEvent[] {
  const { context, entity, gridPos, facing } = actor;
  const attackEvents = attackPlayerIfPossible(context, entity, gridPos, facing);
  if (attackEvents !== undefined) return attackEvents;

  for (let step = 0; step < steps; step++) {
    if (!tryMoveEnemyTowardPlayer(context.player, entity, gridPos, facing, context.spatial)) break;
  }

  return [];
}

function investigateOneStep(actor: EnemyActorContext, target: GridPoint): readonly GameEvent[] {
  return investigateTarget(actor, target, 1);
}

function investigateTwoSteps(actor: EnemyActorContext, target: GridPoint): readonly GameEvent[] {
  return investigateTarget(actor, target, 2);
}

function watchInvestigationTarget(actor: EnemyActorContext, target: GridPoint): readonly GameEvent[] {
  const { entity, gridPos, facing, enemyAwareness } = actor;
  if (samePosition(entityPosition(entity, gridPos), target)) {
    setEnemyAwareness(entity, enemyAwareness, IDLE_AWARENESS);
    return [];
  }

  faceEntityToward(entity, target, gridPos, facing);
  return [];
}

function investigateTarget(actor: EnemyActorContext, target: GridPoint, steps: number): readonly GameEvent[] {
  const { context, entity, gridPos, facing, enemyAwareness } = actor;
  if (samePosition(entityPosition(entity, gridPos), target)) {
    setEnemyAwareness(entity, enemyAwareness, IDLE_AWARENESS);
    return [];
  }

  for (let step = 0; step < steps; step++) {
    if (!tryMoveEnemyTowardPosition(target, entity, gridPos, facing, context.spatial)) break;
    if (samePosition(entityPosition(entity, gridPos), target)) break;
  }

  return [];
}

function behaviorPlanFor(world: World, entity: Entity): EnemyBehaviorPlan {
  const archetype = enemyArchetypeFor(world, entity);
  return archetype === undefined ? DEFAULT_BEHAVIOR_PLAN : BEHAVIOR_PLANS[archetype];
}

function attackPlayerIfPossible(
  context: EnemyTurnContext,
  entity: Entity,
  gridPos: GridPosPartitions,
  facing: FacingPartitions,
): readonly GameEvent[] | undefined {
  const { world, player, spatial, random } = context;
  const attack = entityAttack(world, entity);
  if (attack !== undefined) {
    if (attack.requiresFacing === AttackFacingRequirement.Required) {
      faceEntityToward(entity, player.getPosition(), gridPos, facing);
    }

    const targets = attackTargets(
      world,
      entity,
      attack,
      spatial,
      (candidate) => candidate === player.getEntity(),
    );
    if (targets.length > 0) {
      const events: GameEvent[] = [];
      for (const target of targets) {
        events.push(...attackEntity(world, entity, target, attack, random, spatial));
      }
      return events;
    }
  }

  return undefined;
}

function tryMoveEnemyTowardPlayer(
  player: Player,
  entity: Entity,
  gridPos: GridPosPartitions,
  facing: FacingPartitions,
  spatial: SpatialLookup & Pick<SpatialMutations, "moveEntity">,
): boolean {
  return tryMoveEnemyTowardPosition(player.getPosition(), entity, gridPos, facing, spatial);
}

function tryMoveEnemyTowardPosition(
  target: GridPoint,
  entity: Entity,
  gridPos: GridPosPartitions,
  facing: FacingPartitions,
  spatial: SpatialLookup & Pick<SpatialMutations, "moveEntity">,
): boolean {
  const current = entityPosition(entity, gridPos);
  const stepX = Math.sign(target.x - current.x);
  const stepY = Math.sign(target.y - current.y);
  const candidates = enemyMoveCandidates(
    { dx: stepX, dy: 0 },
    { dx: 0, dy: stepY },
    Math.abs(target.x - current.x),
    Math.abs(target.y - current.y),
  );

  for (const delta of candidates) {
    const nextX = current.x + delta.dx;
    const nextY = current.y + delta.dy;
    if (spatial.positionBlocks(nextX, nextY)) continue;

    spatial.moveEntity(entity, { x: nextX, y: nextY });
    facing.dir[entity] = directionForStep(delta);
    return true;
  }

  faceEntityToward(entity, target, gridPos, facing);
  return false;
}

function tryMoveEnemyAwayFromPlayer(
  player: Player,
  entity: Entity,
  gridPos: GridPosPartitions,
  facing: FacingPartitions,
  spatial: SpatialLookup & Pick<SpatialMutations, "moveEntity">,
): boolean {
  const playerPosition = player.getPosition();
  const current = entityPosition(entity, gridPos);
  const currentDistance = manhattanDistance(current, playerPosition);
  const awayX = Math.sign(current.x - playerPosition.x);
  const awayY = Math.sign(current.y - playerPosition.y);
  const preferred = enemyMoveCandidates(
    { dx: awayX, dy: 0 },
    { dx: 0, dy: awayY },
    Math.abs(current.x - playerPosition.x),
    Math.abs(current.y - playerPosition.y),
  );
  let best:
    | {
      readonly delta: GridDelta;
      readonly x: number;
      readonly y: number;
      readonly distance: number;
      readonly priority: number;
    }
    | undefined;

  for (let index = 0; index < CARDINAL_DELTAS.length; index++) {
    const delta = CARDINAL_DELTAS[index]!;
    const x = current.x + delta.dx;
    const y = current.y + delta.dy;
    if (spatial.positionBlocks(x, y)) continue;

    const distance = manhattanDistance({ x, y }, playerPosition);
    if (distance <= currentDistance) continue;
    const priority = movePriority(delta, preferred, index);
    if (
      best === undefined ||
      distance > best.distance ||
      (distance === best.distance && priority < best.priority)
    ) {
      best = { delta, x, y, distance, priority };
    }
  }

  if (best === undefined) return false;
  spatial.moveEntity(entity, { x: best.x, y: best.y });
  facing.dir[entity] = directionForStep(best.delta);
  return true;
}

function enemyMoveCandidates(
  horizontal: GridDelta,
  vertical: GridDelta,
  horizontalDistance: number,
  verticalDistance: number,
): readonly GridDelta[] {
  const candidates: GridDelta[] = [];
  if (horizontalDistance >= verticalDistance) {
    if (horizontal.dx !== 0) candidates.push(horizontal);
    if (vertical.dy !== 0) candidates.push(vertical);
  } else {
    if (vertical.dy !== 0) candidates.push(vertical);
    if (horizontal.dx !== 0) candidates.push(horizontal);
  }
  return candidates;
}

function movePriority(delta: GridDelta, preferred: readonly GridDelta[], cardinalIndex: number): number {
  const preferredIndex = preferred.findIndex((candidate) => sameDelta(candidate, delta));
  return preferredIndex === -1 ? preferred.length + cardinalIndex : preferredIndex;
}

function sameDelta(a: GridDelta, b: GridDelta): boolean {
  return a.dx === b.dx && a.dy === b.dy;
}

function faceEntityToward(
  entity: Entity,
  target: { readonly x: number; readonly y: number },
  gridPos: GridPosPartitions,
  facing: FacingPartitions,
): void {
  const delta = {
    dx: Math.sign(target.x - gridPos.x[entity]!),
    dy: Math.sign(target.y - gridPos.y[entity]!),
  };

  if (Math.abs(delta.dx) >= Math.abs(delta.dy) && delta.dx !== 0) {
    facing.dir[entity] = directionForStep({ dx: delta.dx, dy: 0 });
  } else if (delta.dy !== 0) {
    facing.dir[entity] = directionForStep({ dx: 0, dy: delta.dy });
  }
}

function directionForStep(delta: GridDelta): CardinalDirection {
  if (delta.dx > 0) return Direction.East;
  if (delta.dx < 0) return Direction.West;
  if (delta.dy > 0) return Direction.South;
  return Direction.North;
}

function distanceToPlayer(player: Player, entity: Entity, gridPos: GridPosPartitions): number {
  return manhattanDistance(entityPosition(entity, gridPos), player.getPosition());
}

function entityPosition(entity: Entity, gridPos: GridPosPartitions): { readonly x: number; readonly y: number } {
  return {
    x: gridPos.x[entity]!,
    y: gridPos.y[entity]!,
  };
}

type AwarenessResult =
  | { readonly state: typeof AwarenessState.Idle }
  | { readonly state: typeof AwarenessState.Alert; readonly position: GridPoint }
  | { readonly state: typeof AwarenessState.Investigating; readonly position: GridPoint };

function updateEnemyAwareness(actor: EnemyActorContext): AwarenessResult {
  const { context, entity, gridPos, facing, enemyAwareness } = actor;
  const position = entityPosition(entity, gridPos);
  const playerPosition = context.player.getPosition();
  const blocksSight = context.blocksSight ?? ((x, y) => context.spatial.tileBlocks(x, y));

  if (
    canSeePoint(position, playerPosition, {
      radius: DEFAULT_ENEMY_SIGHT_RADIUS,
      facing: facing.dir[entity]! as CardinalDirection,
      blocksSight,
    })
  ) {
    setEnemyAwareness(entity, enemyAwareness, {
      state: AwarenessState.Alert,
      lastKnownX: playerPosition.x,
      lastKnownY: playerPosition.y,
      turnsSinceSeen: 0,
    });
    return { state: AwarenessState.Alert, position: playerPosition };
  }

  const heardNoise = nearestHeardNoise(position, context.noises ?? []);
  if (heardNoise !== undefined) {
    setEnemyAwareness(entity, enemyAwareness, {
      state: AwarenessState.Investigating,
      lastKnownX: heardNoise.x,
      lastKnownY: heardNoise.y,
      turnsSinceSeen: 0,
    });
    return { state: AwarenessState.Investigating, position: heardNoise };
  }

  if (hasLastKnownPosition(entity, enemyAwareness) && enemyAwareness.state[entity]! !== AwarenessState.Idle) {
    const lastKnown = { x: enemyAwareness.lastKnownX[entity]!, y: enemyAwareness.lastKnownY[entity]! };
    const turnsSinceSeen = enemyAwareness.turnsSinceSeen[entity]! + 1;
    if (!samePosition(position, lastKnown) && turnsSinceSeen <= MAX_INVESTIGATION_TURNS) {
      setEnemyAwareness(entity, enemyAwareness, {
        state: AwarenessState.Investigating,
        lastKnownX: lastKnown.x,
        lastKnownY: lastKnown.y,
        turnsSinceSeen,
      });
      return { state: AwarenessState.Investigating, position: lastKnown };
    }
  }

  setEnemyAwareness(entity, enemyAwareness, IDLE_AWARENESS);
  return { state: AwarenessState.Idle };
}

function nearestHeardNoise(position: GridPoint, noises: readonly NoiseStimulus[]): NoiseStimulus | undefined {
  let nearest:
    | {
      readonly noise: NoiseStimulus;
      readonly distance: number;
    }
    | undefined;

  for (const noise of noises) {
    if (!canHearNoise(position, noise)) continue;

    const distance = manhattanDistance(position, noise);
    if (nearest === undefined || distance < nearest.distance) {
      nearest = { noise, distance };
    }
  }

  return nearest?.noise;
}

function setEnemyAwareness(
  entity: Entity,
  enemyAwareness: EnemyAwarenessPartitions,
  awareness: EnemyAwarenessSchema,
): void {
  enemyAwareness.state[entity] = awareness.state;
  enemyAwareness.lastKnownX[entity] = awareness.lastKnownX;
  enemyAwareness.lastKnownY[entity] = awareness.lastKnownY;
  enemyAwareness.turnsSinceSeen[entity] = awareness.turnsSinceSeen;
}

function hasLastKnownPosition(entity: Entity, enemyAwareness: EnemyAwarenessPartitions): boolean {
  return enemyAwareness.lastKnownX[entity]! !== IDLE_AWARENESS.lastKnownX &&
    enemyAwareness.lastKnownY[entity]! !== IDLE_AWARENESS.lastKnownY;
}

function samePosition(a: GridPoint, b: GridPoint): boolean {
  return a.x === b.x && a.y === b.y;
}
