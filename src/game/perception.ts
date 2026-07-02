import { directionDelta, manhattanDistance } from "@/src/grid/direction.ts";
import type { CardinalDirection, GridPoint } from "@/src/grid/direction.ts";

export type BlocksSight = (x: number, y: number) => boolean;

export type SightSpec = {
  readonly radius: number;
  readonly facing?: CardinalDirection;
  readonly blocksSight: BlocksSight;
};

export type NoiseStimulus = GridPoint & {
  readonly radius: number;
};

export function canSeePoint(origin: GridPoint, target: GridPoint, sight: SightSpec): boolean {
  const radius = Math.max(0, Math.floor(sight.radius));
  if (distanceSquared(origin, target) > radius * radius) return false;
  if (sight.facing !== undefined && !isWithinFacingCone(origin, target, sight.facing)) return false;
  return hasLineOfSight(origin, target, sight.blocksSight);
}

export function canHearNoise(listener: GridPoint, noise: NoiseStimulus): boolean {
  return manhattanDistance(listener, noise) <= Math.max(0, Math.floor(noise.radius));
}

function hasLineOfSight(
  origin: GridPoint,
  target: GridPoint,
  blocksSight: BlocksSight,
): boolean {
  let x = origin.x;
  let y = origin.y;
  const dx = Math.abs(target.x - origin.x);
  const sx = origin.x < target.x ? 1 : -1;
  const dy = -Math.abs(target.y - origin.y);
  const sy = origin.y < target.y ? 1 : -1;
  let error = dx + dy;

  while (true) {
    if (x === target.x && y === target.y) return true;
    if ((x !== origin.x || y !== origin.y) && blocksSight(x, y)) return false;

    const doubledError = error * 2;
    if (doubledError >= dy) {
      error += dy;
      x += sx;
    }
    if (doubledError <= dx) {
      error += dx;
      y += sy;
    }
  }
}

function isWithinFacingCone(origin: GridPoint, target: GridPoint, facing: CardinalDirection): boolean {
  const forward = directionDelta(facing);
  const side = { dx: -forward.dy, dy: forward.dx };
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const forwardDistance = dx * forward.dx + dy * forward.dy;
  const sideDistance = dx * side.dx + dy * side.dy;

  return forwardDistance >= 0 && Math.abs(sideDistance) <= forwardDistance;
}

function distanceSquared(a: GridPoint, b: GridPoint): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}
