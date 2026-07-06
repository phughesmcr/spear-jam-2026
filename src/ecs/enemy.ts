import { type Entity, System, type World } from "@phughesmcr/miski";
import {
  AttackFacingRequirement,
  AwarenessState,
  enemyArchetypeFor,
  type EnemyAwarenessPartitions,
  type EnemyAwarenessSchema,
  type FacingPartitions,
  GridPos,
  type GridPosPartitions,
  Health,
  IDLE_AWARENESS,
} from "@/src/ecs/components.ts";
import { attackEntity, attackTargets, type DefeatEffectWriter, entityAttack } from "@/src/ecs/combat.ts";
import { DEFAULT_ENEMY_BEHAVIOR_POLICY, type EnemyBehaviorPolicy, enemyCatalogEntry } from "@/src/ecs/enemy_catalog.ts";
import { enemyTurnQuery } from "@/src/ecs/queries.ts";
import type { SpatialAccess, SpatialDistanceField, SpatialLookup, SpatialMutations } from "@/src/ecs/spatial.ts";
import type { GameEvent } from "@/src/game/events.ts";
import { type BlocksSight, canHearNoise, canSeePoint, type NoiseStimulus } from "@/src/game/perception.ts";
import type { RandomSource } from "@/src/game/rng.ts";
import {
  CARDINAL_DELTAS,
  type CardinalDirection,
  Direction,
  type GridDelta,
  type GridPoint,
  manhattanDistance,
} from "@/src/grid/direction.ts";

const DEFAULT_ENEMY_SIGHT_RADIUS = 6;
const MAX_INVESTIGATION_TURNS = 6;

export type EnemyTurnContext = {
  readonly world: World;
  readonly player: Entity;
  readonly spatial: EnemySpatialAccess;
  readonly random: RandomSource;
  readonly noises?: readonly NoiseStimulus[];
  readonly blocksSight?: BlocksSight;
  readonly writeDefeatEffect?: DefeatEffectWriter;
};

type EnemySpatialAccess = SpatialAccess & {
  nextStepToward(start: GridPoint, target: GridPoint): GridPoint | undefined;
  distanceFieldTo?(target: GridPoint): SpatialDistanceField;
};

export type EnemyTurnSystem = (context: EnemyTurnContext) => readonly GameEvent[];

type EnemyActorContext = {
  readonly context: EnemyTurnContext;
  readonly entity: Entity;
  readonly gridPos: GridPosPartitions;
  readonly facing: FacingPartitions;
  readonly enemyAwareness: EnemyAwarenessPartitions;
  readonly markers: EnemyMutationMarkers;
};
type EnemyTurnComponents = typeof enemyTurnQuery["$inferComponents"];
type EnemyMutationMarkers = Pick<EnemyTurnComponents, "facing" | "enemyAwareness">;

export const enemyTurnSystem = new System({
  name: "enemyTurnSystem",
  query: enemyTurnQuery,
  callback: (components, enemies, context: EnemyTurnContext): readonly GameEvent[] => {
    const gridPos = components.gridPos.partitions;
    const facing = components.facing.partitions;
    const enemyAwareness = components.enemyAwareness.partitions;
    const markers = { facing: components.facing, enemyAwareness: components.enemyAwareness };
    const indices = enemies.indices;
    const count = enemies.count;
    const phaseContext = { ...context, spatial: phasePathingSpatial(context.spatial) };
    const events: GameEvent[] = [];

    for (let i = 0; i < count; i++) {
      if (isPlayerDefeated(phaseContext)) break;
      events.push(...advanceEnemyTurn(phaseContext, indices[i]!, gridPos, facing, enemyAwareness, markers));
    }
    return events;
  },
});

function phasePathingSpatial(spatial: EnemySpatialAccess): EnemySpatialAccess {
  if (spatial.distanceFieldTo === undefined) return spatial;

  const fields = new Map<string, SpatialDistanceField>();
  return {
    tileBlocks: (x, y) => spatial.tileBlocks(x, y),
    tileBlocksSight: (x, y) => spatial.tileBlocksSight(x, y),
    tileBlocksAttacks: (x, y) => spatial.tileBlocksAttacks(x, y),
    blockingEntityAt: (x, y) => spatial.blockingEntityAt(x, y),
    positionBlocks: (x, y) => spatial.positionBlocks(x, y),
    moveEntity: (entity, to) => spatial.moveEntity(entity, to),
    removeEntity: (entity) => spatial.removeEntity(entity),
    setBlocking: (entity, blocking) => spatial.setBlocking(entity, blocking),
    nextStepToward(start, target) {
      const key = `${target.x},${target.y}`;
      let field = fields.get(key);
      if (field === undefined) {
        field = spatial.distanceFieldTo!(target);
        fields.set(key, field);
      }
      return field.nextStepFrom(start);
    },
    distanceFieldTo: (target) => spatial.distanceFieldTo!(target),
  };
}

function isPlayerDefeated(context: EnemyTurnContext): boolean {
  const health = context.world.components.readEntityData(Health, context.player);
  return health !== undefined && health.current <= 0;
}

function advanceEnemyTurn(
  context: EnemyTurnContext,
  entity: Entity,
  gridPos: GridPosPartitions,
  facing: FacingPartitions,
  enemyAwareness: EnemyAwarenessPartitions,
  markers: EnemyMutationMarkers,
): readonly GameEvent[] {
  const { world } = context;
  if (!world.entities.isActive(entity)) return [];

  const actor = { context, entity, gridPos, facing, enemyAwareness, markers };
  const awareness = updateEnemyAwareness(actor);
  return selectEnemyAction(actor, awareness);
}

function selectEnemyAction(actor: EnemyActorContext, awareness: AwarenessResult): readonly GameEvent[] {
  const behavior = enemyBehaviorPolicyFor(actor.context.world, actor.entity);
  switch (awareness.state) {
    case AwarenessState.Idle:
      return [];
    case AwarenessState.Alert:
      return alertActionFor(actor, behavior);
    case AwarenessState.Investigating:
      return investigateActionFor(actor, behavior, awareness.position);
  }
}

function alertActionFor(actor: EnemyActorContext, behavior: EnemyBehaviorPolicy): readonly GameEvent[] {
  switch (behavior.alert.type) {
    case "advance":
      return attackThenMoveTowardPlayer(actor, behavior.alert.steps, behavior.alert.attackAfterMove ?? false);
    case "skirmish":
      return skirmishAtRange(actor, behavior.alert.retreatRange, behavior.alert.advanceSteps);
    case "hold":
      return holdAndWatchPlayer(actor);
  }
}

function skirmishAtRange(actor: EnemyActorContext, retreatRange: number, advanceSteps: number): readonly GameEvent[] {
  const { context, entity, gridPos, facing, markers } = actor;
  if (
    distanceToPlayer(context, entity, gridPos) <= retreatRange &&
    tryMoveEnemyAwayFromPlayer(context, entity, gridPos, facing, markers, context.spatial)
  ) {
    return [];
  }

  return attackThenMoveTowardPlayer(actor, advanceSteps);
}

function holdAndWatchPlayer(actor: EnemyActorContext): readonly GameEvent[] {
  const { context, entity, gridPos, facing, markers } = actor;
  const attackEvents = attackPlayerIfPossible(context, entity, gridPos, facing, markers);
  if (attackEvents !== undefined) return attackEvents;

  faceEntityToward(entity, playerPosition(context), gridPos, facing, markers);
  return [];
}

function attackThenMoveTowardPlayer(
  actor: EnemyActorContext,
  steps: number,
  attackAfterMove = false,
): readonly GameEvent[] {
  const { context, entity, gridPos, facing, markers } = actor;
  const attackEvents = attackPlayerIfPossible(context, entity, gridPos, facing, markers);
  if (attackEvents !== undefined) return attackEvents;

  for (let step = 0; step < steps; step++) {
    if (!tryMoveEnemyTowardPlayer(context, entity, gridPos, facing, markers)) break;
    if (!attackAfterMove) continue;

    const stepAttackEvents = attackPlayerIfPossible(context, entity, gridPos, facing, markers);
    if (stepAttackEvents !== undefined) return stepAttackEvents;
  }

  return [];
}

function investigateActionFor(
  actor: EnemyActorContext,
  behavior: EnemyBehaviorPolicy,
  target: GridPoint,
): readonly GameEvent[] {
  switch (behavior.investigate.type) {
    case "move":
      return investigateTarget(actor, target, behavior.investigate.steps);
    case "watch":
      return watchInvestigationTarget(actor, target);
  }
}

function watchInvestigationTarget(actor: EnemyActorContext, target: GridPoint): readonly GameEvent[] {
  const { entity, gridPos, facing, enemyAwareness, markers } = actor;
  if (samePosition(entityPosition(entity, gridPos), target)) {
    setEnemyAwareness(entity, enemyAwareness, markers, IDLE_AWARENESS);
    return [];
  }

  faceEntityToward(entity, target, gridPos, facing, markers);
  return [];
}

function investigateTarget(actor: EnemyActorContext, target: GridPoint, steps: number): readonly GameEvent[] {
  const { context, entity, gridPos, facing, enemyAwareness, markers } = actor;
  if (samePosition(entityPosition(entity, gridPos), target)) {
    setEnemyAwareness(entity, enemyAwareness, markers, IDLE_AWARENESS);
    return [];
  }

  for (let step = 0; step < steps; step++) {
    if (!tryMoveEnemyTowardPosition(context, target, entity, gridPos, facing, markers)) break;
    if (samePosition(entityPosition(entity, gridPos), target)) break;
  }

  return [];
}

function enemyBehaviorPolicyFor(world: World, entity: Entity): EnemyBehaviorPolicy {
  const archetype = enemyArchetypeFor(world, entity);
  return archetype === undefined ? DEFAULT_ENEMY_BEHAVIOR_POLICY : enemyCatalogEntry(archetype).behavior;
}

function attackPlayerIfPossible(
  context: EnemyTurnContext,
  entity: Entity,
  gridPos: GridPosPartitions,
  facing: FacingPartitions,
  markers: EnemyMutationMarkers,
): readonly GameEvent[] | undefined {
  const { world, player, spatial, random } = context;
  const attack = entityAttack(world, entity);
  if (attack !== undefined) {
    if (attack.requiresFacing === AttackFacingRequirement.Required) {
      faceEntityToward(entity, playerPosition(context), gridPos, facing, markers);
    }

    const targets = attackTargets(
      world,
      entity,
      attack,
      spatial,
      (candidate) => candidate === player,
    );
    if (targets.length > 0) {
      const events: GameEvent[] = [];
      for (const target of targets) {
        events.push(...attackEntity(world, entity, target, attack, random, spatial, context.writeDefeatEffect));
      }
      return events;
    }
  }

  return undefined;
}

function tryMoveEnemyTowardPlayer(
  context: EnemyTurnContext,
  entity: Entity,
  gridPos: GridPosPartitions,
  facing: FacingPartitions,
  markers: EnemyMutationMarkers,
): boolean {
  return tryMoveEnemyTowardPosition(context, playerPosition(context), entity, gridPos, facing, markers);
}

function tryMoveEnemyTowardPosition(
  context: EnemyTurnContext,
  target: GridPoint,
  entity: Entity,
  gridPos: GridPosPartitions,
  facing: FacingPartitions,
  markers: EnemyMutationMarkers,
): boolean {
  const current = entityPosition(entity, gridPos);
  const next = context.spatial.nextStepToward(current, target);
  if (next !== undefined) {
    context.spatial.moveEntity(entity, next);
    setFacingDirection(
      entity,
      facing,
      markers,
      directionForStep({
        dx: next.x - current.x,
        dy: next.y - current.y,
      }),
    );
    return true;
  }

  faceEntityToward(entity, target, gridPos, facing, markers);
  return false;
}

function tryMoveEnemyAwayFromPlayer(
  context: EnemyTurnContext,
  entity: Entity,
  gridPos: GridPosPartitions,
  facing: FacingPartitions,
  markers: EnemyMutationMarkers,
  spatial: SpatialLookup & Pick<SpatialMutations, "moveEntity">,
): boolean {
  const playerPosition = playerPositionFor(context);
  const current = entityPosition(entity, gridPos);
  const currentDistance = manhattanDistance(current, playerPosition);
  const awayX = Math.sign(current.x - playerPosition.x);
  const awayY = Math.sign(current.y - playerPosition.y);
  const horizontalDistance = Math.abs(current.x - playerPosition.x);
  const verticalDistance = Math.abs(current.y - playerPosition.y);
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
    const priority = movePriority(delta, awayX, awayY, horizontalDistance, verticalDistance, index);
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
  setFacingDirection(entity, facing, markers, directionForStep(best.delta));
  return true;
}

function movePriority(
  delta: GridDelta,
  preferredDx: number,
  preferredDy: number,
  horizontalDistance: number,
  verticalDistance: number,
  cardinalIndex: number,
): number {
  const horizontalPreferred = preferredDx !== 0 && delta.dx === preferredDx && delta.dy === 0;
  const verticalPreferred = preferredDy !== 0 && delta.dy === preferredDy && delta.dx === 0;
  if (horizontalDistance >= verticalDistance) {
    if (horizontalPreferred) return 0;
    if (verticalPreferred) return preferredDx === 0 ? 0 : 1;
    return (preferredDx === 0 || preferredDy === 0 ? 1 : 2) + cardinalIndex;
  }
  if (verticalPreferred) return 0;
  if (horizontalPreferred) return preferredDy === 0 ? 0 : 1;
  return (preferredDx === 0 || preferredDy === 0 ? 1 : 2) + cardinalIndex;
}

function faceEntityToward(
  entity: Entity,
  target: { readonly x: number; readonly y: number },
  gridPos: GridPosPartitions,
  facing: FacingPartitions,
  markers: EnemyMutationMarkers,
): void {
  const dx = target.x - gridPos.x[entity]!;
  const dy = target.y - gridPos.y[entity]!;
  const delta = {
    dx: Math.sign(dx),
    dy: Math.sign(dy),
  };

  if (Math.abs(dx) >= Math.abs(dy) && delta.dx !== 0) {
    setFacingDirection(entity, facing, markers, directionForStep({ dx: delta.dx, dy: 0 }));
  } else if (delta.dy !== 0) {
    setFacingDirection(entity, facing, markers, directionForStep({ dx: 0, dy: delta.dy }));
  }
}

function setFacingDirection(
  entity: Entity,
  facing: FacingPartitions,
  markers: EnemyMutationMarkers,
  dir: CardinalDirection,
): void {
  if (facing.dir[entity] === dir) return;
  facing.dir[entity] = dir;
  markers.facing.markChanged(entity);
}

function directionForStep(delta: GridDelta): CardinalDirection {
  if (delta.dx > 0) return Direction.East;
  if (delta.dx < 0) return Direction.West;
  if (delta.dy > 0) return Direction.South;
  return Direction.North;
}

function distanceToPlayer(context: EnemyTurnContext, entity: Entity, gridPos: GridPosPartitions): number {
  return manhattanDistance(entityPosition(entity, gridPos), playerPosition(context));
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
  const playerPosition = playerPositionFor(context);
  const blocksSight = context.blocksSight ?? ((x, y) => context.spatial.tileBlocksSight(x, y));

  if (
    canSeePoint(position, playerPosition, {
      radius: DEFAULT_ENEMY_SIGHT_RADIUS,
      facing: facing.dir[entity]! as CardinalDirection,
      blocksSight,
    })
  ) {
    setEnemyAwareness(entity, enemyAwareness, actor.markers, {
      state: AwarenessState.Alert,
      lastKnownX: playerPosition.x,
      lastKnownY: playerPosition.y,
      turnsSinceSeen: 0,
    });
    return { state: AwarenessState.Alert, position: playerPosition };
  }

  const heardNoise = nearestHeardNoise(position, context.noises ?? []);
  if (heardNoise !== undefined) {
    setEnemyAwareness(entity, enemyAwareness, actor.markers, {
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
      setEnemyAwareness(entity, enemyAwareness, actor.markers, {
        state: AwarenessState.Investigating,
        lastKnownX: lastKnown.x,
        lastKnownY: lastKnown.y,
        turnsSinceSeen,
      });
      return { state: AwarenessState.Investigating, position: lastKnown };
    }
  }

  setEnemyAwareness(entity, enemyAwareness, actor.markers, IDLE_AWARENESS);
  return { state: AwarenessState.Idle };
}

function playerPosition(context: EnemyTurnContext): GridPoint {
  return playerPositionFor(context);
}

function playerPositionFor(context: EnemyTurnContext): GridPoint {
  return context.world.components.getEntityData(GridPos, context.player);
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
  markers: EnemyMutationMarkers,
  awareness: EnemyAwarenessSchema,
): void {
  if (
    enemyAwareness.state[entity] === awareness.state &&
    enemyAwareness.lastKnownX[entity] === awareness.lastKnownX &&
    enemyAwareness.lastKnownY[entity] === awareness.lastKnownY &&
    enemyAwareness.turnsSinceSeen[entity] === awareness.turnsSinceSeen
  ) {
    return;
  }

  enemyAwareness.state[entity] = awareness.state;
  enemyAwareness.lastKnownX[entity] = awareness.lastKnownX;
  enemyAwareness.lastKnownY[entity] = awareness.lastKnownY;
  enemyAwareness.turnsSinceSeen[entity] = awareness.turnsSinceSeen;
  markers.enemyAwareness.markChanged(entity);
}

function hasLastKnownPosition(entity: Entity, enemyAwareness: EnemyAwarenessPartitions): boolean {
  return enemyAwareness.lastKnownX[entity]! !== IDLE_AWARENESS.lastKnownX &&
    enemyAwareness.lastKnownY[entity]! !== IDLE_AWARENESS.lastKnownY;
}

function samePosition(a: GridPoint, b: GridPoint): boolean {
  return a.x === b.x && a.y === b.y;
}
