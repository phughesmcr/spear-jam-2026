import { type Entity, System, type World } from "@phughesmcr/miski";
import {
  AttackFacingRequirement,
  EnemyArchetype,
  EnemyArchetypeComponent,
  enemyArchetypeForCode,
} from "@/src/ecs/components.ts";
import type { FacingPartitions, GridPosPartitions } from "@/src/ecs/components.ts";
import { attackEntity, attackTargets, entityAttack } from "@/src/ecs/combat.ts";
import type { Player } from "@/src/ecs/player.ts";
import { enemyTurnQuery } from "@/src/ecs/queries.ts";
import type { SpatialAccess, SpatialLookup, SpatialMutations } from "@/src/ecs/spatial.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { RandomSource } from "@/src/game/rng.ts";
import { Direction } from "@/src/grid/direction.ts";
import type { CardinalDirection, GridDelta } from "@/src/grid/direction.ts";

type EnemyTurnComponents = {
  readonly gridPos: { readonly partitions: GridPosPartitions };
  readonly facing: { readonly partitions: FacingPartitions };
};

const CARDINAL_STEPS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
] as const satisfies readonly GridDelta[];

export type EnemyTurnContext = {
  readonly world: World;
  readonly player: Player;
  readonly spatial: SpatialAccess;
  readonly random: RandomSource;
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

  const archetype = enemyArchetype(world, entity);
  switch (archetype) {
    case EnemyArchetype.MeleeDog:
      return advanceMeleeDogTurn(context, entity, gridPos, facing);
    case EnemyArchetype.Gunslinger:
      return advanceGunslingerTurn(context, entity, gridPos, facing);
    case EnemyArchetype.NetworkNeophyte:
      return advanceNetworkNeophyteTurn(context, entity, gridPos, facing);
    case EnemyArchetype.SystemSentinel:
      return advanceSystemSentinelTurn(context, entity, gridPos, facing);
    case EnemyArchetype.AgenticAcolyte:
      return advanceAgenticAcolyteTurn(context, entity, gridPos, facing);
    case undefined:
      return advanceGenericEnemyTurn(context, entity, gridPos, facing);
  }
}

function advanceGenericEnemyTurn(
  context: EnemyTurnContext,
  entity: Entity,
  gridPos: GridPosPartitions,
  facing: FacingPartitions,
): readonly GameEvent[] {
  const attackEvents = attackPlayerIfPossible(context, entity, gridPos, facing);
  if (attackEvents !== undefined) return attackEvents;

  tryMoveEnemyTowardPlayer(
    context.player,
    entity,
    gridPos,
    facing,
    context.spatial,
  );
  return [];
}

function advanceMeleeDogTurn(
  context: EnemyTurnContext,
  entity: Entity,
  gridPos: GridPosPartitions,
  facing: FacingPartitions,
): readonly GameEvent[] {
  const attackEvents = attackPlayerIfPossible(context, entity, gridPos, facing);
  if (attackEvents !== undefined) return attackEvents;

  for (let step = 0; step < 2; step++) {
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

    const biteEvents = attackPlayerIfPossible(context, entity, gridPos, facing);
    if (biteEvents !== undefined) return biteEvents;
  }

  return [];
}

function advanceNetworkNeophyteTurn(
  context: EnemyTurnContext,
  entity: Entity,
  gridPos: GridPosPartitions,
  facing: FacingPartitions,
): readonly GameEvent[] {
  return advanceGenericEnemyTurn(context, entity, gridPos, facing);
}

function advanceGunslingerTurn(
  context: EnemyTurnContext,
  entity: Entity,
  gridPos: GridPosPartitions,
  facing: FacingPartitions,
): readonly GameEvent[] {
  if (
    distanceToPlayer(context.player, entity, gridPos) <= 1 &&
    tryMoveEnemyAwayFromPlayer(context.player, entity, gridPos, facing, context.spatial)
  ) {
    return [];
  }

  const attackEvents = attackPlayerIfPossible(context, entity, gridPos, facing);
  if (attackEvents !== undefined) return attackEvents;

  tryMoveEnemyTowardPlayer(
    context.player,
    entity,
    gridPos,
    facing,
    context.spatial,
  );
  return [];
}

function advanceSystemSentinelTurn(
  context: EnemyTurnContext,
  entity: Entity,
  gridPos: GridPosPartitions,
  facing: FacingPartitions,
): readonly GameEvent[] {
  const attackEvents = attackPlayerIfPossible(context, entity, gridPos, facing);
  if (attackEvents !== undefined) return attackEvents;

  faceEntityToward(entity, context.player.getPosition(), gridPos, facing);
  return [];
}

function advanceAgenticAcolyteTurn(
  context: EnemyTurnContext,
  entity: Entity,
  gridPos: GridPosPartitions,
  facing: FacingPartitions,
): readonly GameEvent[] {
  const attackEvents = attackPlayerIfPossible(context, entity, gridPos, facing);
  if (attackEvents !== undefined) return attackEvents;

  tryMoveEnemyTowardPlayer(
    context.player,
    entity,
    gridPos,
    facing,
    context.spatial,
  );
  return [];
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
  const playerPosition = player.getPosition();
  const current = entityPosition(entity, gridPos);
  const stepX = Math.sign(playerPosition.x - current.x);
  const stepY = Math.sign(playerPosition.y - current.y);
  const candidates = enemyMoveCandidates(
    { dx: stepX, dy: 0 },
    { dx: 0, dy: stepY },
    Math.abs(playerPosition.x - current.x),
    Math.abs(playerPosition.y - current.y),
  );

  for (const delta of candidates) {
    const nextX = current.x + delta.dx;
    const nextY = current.y + delta.dy;
    if (spatial.positionBlocks(nextX, nextY)) continue;

    spatial.moveEntity(entity, { x: nextX, y: nextY });
    facing.dir[entity] = directionForStep(delta);
    return true;
  }

  faceEntityToward(entity, playerPosition, gridPos, facing);
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

  for (let index = 0; index < CARDINAL_STEPS.length; index++) {
    const delta = CARDINAL_STEPS[index]!;
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

function manhattanDistance(
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function enemyArchetype(world: World, entity: Entity): EnemyArchetype | undefined {
  if (!world.components.entityHas(EnemyArchetypeComponent, entity)) return undefined;

  const archetype = world.components.getEntityData(EnemyArchetypeComponent, entity).archetype;
  return enemyArchetypeForCode(archetype);
}
