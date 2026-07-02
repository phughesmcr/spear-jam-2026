import { type Entity, System, type World } from "@phughesmcr/miski";
import {
  AttackFacingRequirement,
  AwarenessState,
  EnemyArchetype,
  enemyArchetypeFor,
  EnemyAwareness,
} from "@/src/ecs/components.ts";
import type { EnemyAwarenessSchema, FacingPartitions, GridPosPartitions } from "@/src/ecs/components.ts";
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

type EnemyTurnComponents = {
  readonly gridPos: { readonly partitions: GridPosPartitions };
  readonly facing: { readonly partitions: FacingPartitions };
};

type TurnPolicy = {
  readonly moveSteps: 0 | 1 | 2;
  readonly attackAfterStep: boolean;
  readonly retreatWhenAdjacent: boolean;
};

const DEFAULT_TURN_POLICY: TurnPolicy = {
  moveSteps: 1,
  attackAfterStep: false,
  retreatWhenAdjacent: false,
};
const DEFAULT_ENEMY_SIGHT_RADIUS = 6;
const MAX_INVESTIGATION_TURNS = 6;
const UNKNOWN_LAST_KNOWN_POSITION = -1;

const TURN_POLICIES: Readonly<Record<EnemyArchetype, TurnPolicy>> = {
  [EnemyArchetype.MeleeDog]: {
    moveSteps: 2,
    attackAfterStep: true,
    retreatWhenAdjacent: false,
  },
  [EnemyArchetype.Gunslinger]: {
    moveSteps: 1,
    attackAfterStep: false,
    retreatWhenAdjacent: true,
  },
  [EnemyArchetype.NetworkNeophyte]: {
    moveSteps: 1,
    attackAfterStep: false,
    retreatWhenAdjacent: false,
  },
  [EnemyArchetype.SystemSentinel]: {
    moveSteps: 0,
    attackAfterStep: false,
    retreatWhenAdjacent: false,
  },
  [EnemyArchetype.AgenticAcolyte]: {
    moveSteps: 1,
    attackAfterStep: false,
    retreatWhenAdjacent: false,
  },
};

export type EnemyTurnContext = {
  readonly world: World;
  readonly player: Player;
  readonly spatial: SpatialAccess;
  readonly random: RandomSource;
  readonly noises?: readonly NoiseStimulus[];
  readonly blocksSight?: BlocksSight;
};

export type EnemyTurnSystem = (context: EnemyTurnContext) => readonly GameEvent[];

export const enemyTurnSystem = new System({
  name: "enemyTurnSystem",
  query: enemyTurnQuery,
  callback: (components, enemies, context: EnemyTurnContext): readonly GameEvent[] => {
    // Miski currently loses precise partition types for typed system callbacks.
    const enemyComponents = components as unknown as EnemyTurnComponents;
    const gridPos = enemyComponents.gridPos.partitions;
    const facing = enemyComponents.facing.partitions;
    const indices = enemies.indices;
    const count = enemies.count;
    const events: GameEvent[] = [];

    for (let i = 0; i < count; i++) {
      events.push(...advanceEnemyTurn(context, indices[i]!, gridPos, facing));
    }
    return events;
  },
});

function advanceEnemyTurn(
  context: EnemyTurnContext,
  entity: Entity,
  gridPos: GridPosPartitions,
  facing: FacingPartitions,
): readonly GameEvent[] {
  const { world } = context;
  if (!world.entities.isActive(entity)) return [];

  const awareness = updateEnemyAwareness(context, entity, gridPos, facing);
  if (awareness.state === AwarenessState.Idle) return [];

  const policy = turnPolicyFor(world, entity);
  if (awareness.state === AwarenessState.Investigating) {
    return advanceInvestigatingEnemyTurn(context, entity, gridPos, facing, policy, awareness.position);
  }

  if (
    policy.retreatWhenAdjacent &&
    distanceToPlayer(context.player, entity, gridPos) <= 1 &&
    tryMoveEnemyAwayFromPlayer(context.player, entity, gridPos, facing, context.spatial)
  ) {
    return [];
  }

  const attackEvents = attackPlayerIfPossible(context, entity, gridPos, facing);
  if (attackEvents !== undefined) return attackEvents;

  for (let step = 0; step < policy.moveSteps; step++) {
    if (
      !tryMoveEnemyTowardPlayer(
        context.player,
        entity,
        gridPos,
        facing,
        context.spatial,
      )
    ) {
      break;
    }

    if (policy.attackAfterStep) {
      const stepAttackEvents = attackPlayerIfPossible(context, entity, gridPos, facing);
      if (stepAttackEvents !== undefined) return stepAttackEvents;
    }
  }

  if (policy.moveSteps === 0) {
    faceEntityToward(entity, context.player.getPosition(), gridPos, facing);
  }

  return [];
}

function advanceInvestigatingEnemyTurn(
  context: EnemyTurnContext,
  entity: Entity,
  gridPos: GridPosPartitions,
  facing: FacingPartitions,
  policy: TurnPolicy,
  target: GridPoint,
): readonly GameEvent[] {
  if (samePosition(entityPosition(entity, gridPos), target)) {
    setEnemyAwareness(context.world, entity, {
      state: AwarenessState.Idle,
      lastKnownX: UNKNOWN_LAST_KNOWN_POSITION,
      lastKnownY: UNKNOWN_LAST_KNOWN_POSITION,
      turnsSinceSeen: 0,
    });
    return [];
  }

  for (let step = 0; step < policy.moveSteps; step++) {
    if (!tryMoveEnemyTowardPosition(target, entity, gridPos, facing, context.spatial)) break;
    if (samePosition(entityPosition(entity, gridPos), target)) break;
  }

  if (policy.moveSteps === 0) {
    faceEntityToward(entity, target, gridPos, facing);
  }

  return [];
}

function turnPolicyFor(world: World, entity: Entity): TurnPolicy {
  const archetype = enemyArchetypeFor(world, entity);
  return archetype === undefined ? DEFAULT_TURN_POLICY : TURN_POLICIES[archetype];
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

function updateEnemyAwareness(
  context: EnemyTurnContext,
  entity: Entity,
  gridPos: GridPosPartitions,
  facing: FacingPartitions,
): AwarenessResult {
  const position = entityPosition(entity, gridPos);
  const playerPosition = context.player.getPosition();
  const blocksSight = context.blocksSight ?? ((x, y) => context.spatial.tileBlocks(x, y));

  if (
    canSeePoint(position, playerPosition, {
      radius: DEFAULT_ENEMY_SIGHT_RADIUS,
      facing: directionForCode(facing.dir[entity]!),
      blocksSight,
    })
  ) {
    setEnemyAwareness(context.world, entity, {
      state: AwarenessState.Alert,
      lastKnownX: playerPosition.x,
      lastKnownY: playerPosition.y,
      turnsSinceSeen: 0,
    });
    return { state: AwarenessState.Alert, position: playerPosition };
  }

  const heardNoise = nearestHeardNoise(position, context.noises ?? []);
  if (heardNoise !== undefined) {
    setEnemyAwareness(context.world, entity, {
      state: AwarenessState.Investigating,
      lastKnownX: heardNoise.x,
      lastKnownY: heardNoise.y,
      turnsSinceSeen: 0,
    });
    return { state: AwarenessState.Investigating, position: heardNoise };
  }

  const awareness = enemyAwareness(context.world, entity);
  if (hasLastKnownPosition(awareness) && awareness.state !== AwarenessState.Idle) {
    const lastKnown = { x: awareness.lastKnownX, y: awareness.lastKnownY };
    const turnsSinceSeen = awareness.turnsSinceSeen + 1;
    if (!samePosition(position, lastKnown) && turnsSinceSeen <= MAX_INVESTIGATION_TURNS) {
      setEnemyAwareness(context.world, entity, {
        state: AwarenessState.Investigating,
        lastKnownX: lastKnown.x,
        lastKnownY: lastKnown.y,
        turnsSinceSeen,
      });
      return { state: AwarenessState.Investigating, position: lastKnown };
    }
  }

  setEnemyAwareness(context.world, entity, {
    state: AwarenessState.Idle,
    lastKnownX: UNKNOWN_LAST_KNOWN_POSITION,
    lastKnownY: UNKNOWN_LAST_KNOWN_POSITION,
    turnsSinceSeen: 0,
  });
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

function enemyAwareness(world: World, entity: Entity): EnemyAwarenessSchema {
  if (!world.components.entityHas(EnemyAwareness, entity)) {
    setEnemyAwareness(world, entity, {
      state: AwarenessState.Idle,
      lastKnownX: UNKNOWN_LAST_KNOWN_POSITION,
      lastKnownY: UNKNOWN_LAST_KNOWN_POSITION,
      turnsSinceSeen: 0,
    });
  }
  return toEnemyAwarenessSchema(world.components.getEntityData(EnemyAwareness, entity));
}

function setEnemyAwareness(world: World, entity: Entity, awareness: EnemyAwarenessSchema): void {
  if (world.components.entityHas(EnemyAwareness, entity)) {
    world.components.setEntityData(EnemyAwareness, entity, awareness);
    return;
  }
  world.components.addToEntity(EnemyAwareness, entity, awareness);
}

function hasLastKnownPosition(awareness: EnemyAwarenessSchema): boolean {
  return awareness.lastKnownX !== UNKNOWN_LAST_KNOWN_POSITION && awareness.lastKnownY !== UNKNOWN_LAST_KNOWN_POSITION;
}

function samePosition(a: GridPoint, b: GridPoint): boolean {
  return a.x === b.x && a.y === b.y;
}

function directionForCode(value: number): CardinalDirection {
  return value === Direction.North || value === Direction.East || value === Direction.South ||
      value === Direction.West ?
    value :
    Direction.North;
}

function toEnemyAwarenessSchema(awareness: Record<keyof EnemyAwarenessSchema, number>): EnemyAwarenessSchema {
  return {
    state: awarenessStateForCode(awareness.state),
    lastKnownX: awareness.lastKnownX,
    lastKnownY: awareness.lastKnownY,
    turnsSinceSeen: awareness.turnsSinceSeen,
  };
}

function awarenessStateForCode(value: number): AwarenessState {
  switch (value) {
    case AwarenessState.Idle:
    case AwarenessState.Investigating:
    case AwarenessState.Alert:
      return value;
    default:
      return AwarenessState.Idle;
  }
}
