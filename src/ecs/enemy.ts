import type { Entity, World } from "@phughesmcr/miski";
import { Enemy, Facing, GridPos } from "@/src/ecs/components.ts";
import { attackDamage, attackEntity } from "@/src/ecs/combat.ts";
import type { Player } from "@/src/ecs/player.ts";
import { nonPlayerTurnTakerQuery } from "@/src/ecs/queries.ts";
import type { CardinalDirection, GridDelta } from "@/src/grid/direction.ts";

type PositionBlocks = (x: number, y: number) => boolean;

export function advanceEnemyTurns(world: World, player: Player, positionBlocks: PositionBlocks): void {
  for (const entity of world.entities.query(nonPlayerTurnTakerQuery)) {
    advanceEnemyTurn(world, player, entity, positionBlocks);
  }
}

function advanceEnemyTurn(world: World, player: Player, entity: Entity, positionBlocks: PositionBlocks): void {
  if (!world.entities.isActive(entity)) return;
  if (!world.components.entityHas(Enemy, entity)) return;

  if (isAdjacentToPlayer(world, player, entity)) {
    faceEntityToward(world, entity, player.getPosition());
    attackEntity(world, player.getEntity(), entity, player.getEntity(), attackDamage(world, entity));
    return;
  }

  tryMoveEnemyTowardPlayer(world, player, entity, positionBlocks);
}

function isAdjacentToPlayer(world: World, player: Player, entity: Entity): boolean {
  const position = world.components.getEntityData(GridPos, entity);
  const playerPosition = player.getPosition();
  return Math.abs(position.x - playerPosition.x) + Math.abs(position.y - playerPosition.y) === 1;
}

function tryMoveEnemyTowardPlayer(world: World, player: Player, entity: Entity, positionBlocks: PositionBlocks): void {
  const position = world.components.getEntityData(GridPos, entity);
  const playerPosition = player.getPosition();
  const stepX = Math.sign(playerPosition.x - position.x);
  const stepY = Math.sign(playerPosition.y - position.y);
  const candidates = enemyMoveCandidates(
    { dx: stepX, dy: 0 },
    { dx: 0, dy: stepY },
    Math.abs(playerPosition.x - position.x),
    Math.abs(playerPosition.y - position.y),
  );

  for (const delta of candidates) {
    const next = { x: position.x + delta.dx, y: position.y + delta.dy };
    if (positionBlocks(next.x, next.y)) continue;

    world.components.setEntityData(GridPos, entity, next);
    world.components.setEntityData(Facing, entity, { dir: directionForStep(delta) });
    return;
  }

  faceEntityToward(world, entity, playerPosition);
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

function faceEntityToward(world: World, entity: Entity, target: { readonly x: number; readonly y: number }): void {
  const position = world.components.getEntityData(GridPos, entity);
  const delta = {
    dx: Math.sign(target.x - position.x),
    dy: Math.sign(target.y - position.y),
  };

  if (Math.abs(delta.dx) >= Math.abs(delta.dy) && delta.dx !== 0) {
    world.components.setEntityData(Facing, entity, { dir: directionForStep({ dx: delta.dx, dy: 0 }) });
  } else if (delta.dy !== 0) {
    world.components.setEntityData(Facing, entity, { dir: directionForStep({ dx: 0, dy: delta.dy }) });
  }
}

function directionForStep(delta: GridDelta): CardinalDirection {
  if (delta.dx > 0) return 1;
  if (delta.dx < 0) return 3;
  if (delta.dy > 0) return 2;
  return 0;
}
