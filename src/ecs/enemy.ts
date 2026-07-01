import { type Entity, System, type World } from "@phughesmcr/miski";
import { AttackFacingRequirement } from "@/src/ecs/components.ts";
import type { FacingPartitions, GridPosPartitions } from "@/src/ecs/components.ts";
import { attackEntity, attackTargets, entityAttack } from "@/src/ecs/combat.ts";
import type { Player } from "@/src/ecs/player.ts";
import { enemyTurnQuery } from "@/src/ecs/queries.ts";
import type { SpatialLookup } from "@/src/ecs/spatial.ts";
import type { CardinalDirection, GridDelta } from "@/src/grid/direction.ts";

type RandomSource = () => number;

type EnemyTurnComponents = {
  readonly gridPos: { readonly partitions: GridPosPartitions };
  readonly facing: { readonly partitions: FacingPartitions };
};

export type EnemyTurnContext = {
  readonly world: World;
  readonly player: Player;
  readonly spatial: SpatialLookup;
  readonly random: RandomSource;
};

export type EnemyTurnSystem = (context: EnemyTurnContext) => void;

export const enemyTurnSystem = new System({
  name: "enemyTurnSystem",
  query: enemyTurnQuery,
  callback: (components, enemies, context: EnemyTurnContext): void => {
    const enemyComponents = components as unknown as EnemyTurnComponents;
    const gridPos = enemyComponents.gridPos.partitions;
    const facing = enemyComponents.facing.partitions;
    const indices = enemies.indices;
    const count = enemies.count;

    for (let i = 0; i < count; i++) {
      advanceEnemyTurn(context, indices[i]!, gridPos, facing);
    }
  },
});

function advanceEnemyTurn(
  context: EnemyTurnContext,
  entity: Entity,
  gridPos: GridPosPartitions,
  facing: FacingPartitions,
): void {
  const { world, player, spatial, random } = context;
  if (!world.entities.isActive(entity)) return;

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
      for (const target of targets) {
        attackEntity(world, player.getEntity(), entity, target, attack, random);
      }
      return;
    }
  }

  tryMoveEnemyTowardPlayer(
    player,
    entity,
    gridPos,
    facing,
    spatial,
  );
}

function tryMoveEnemyTowardPlayer(
  player: Player,
  entity: Entity,
  gridPos: GridPosPartitions,
  facing: FacingPartitions,
  spatial: SpatialLookup,
): void {
  const playerPosition = player.getPosition();
  const x = gridPos.x[entity]!;
  const y = gridPos.y[entity]!;
  const stepX = Math.sign(playerPosition.x - x);
  const stepY = Math.sign(playerPosition.y - y);
  const candidates = enemyMoveCandidates(
    { dx: stepX, dy: 0 },
    { dx: 0, dy: stepY },
    Math.abs(playerPosition.x - x),
    Math.abs(playerPosition.y - y),
  );

  for (const delta of candidates) {
    const nextX = x + delta.dx;
    const nextY = y + delta.dy;
    if (spatial.positionBlocks(nextX, nextY)) continue;

    gridPos.x[entity] = nextX;
    gridPos.y[entity] = nextY;
    facing.dir[entity] = directionForStep(delta);
    return;
  }

  faceEntityToward(entity, playerPosition, gridPos, facing);
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
  if (delta.dx > 0) return 1;
  if (delta.dx < 0) return 3;
  if (delta.dy > 0) return 2;
  return 0;
}
