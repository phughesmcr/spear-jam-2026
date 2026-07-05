import { type CardinalDirection, directionDelta, type GridPoint } from "@/src/grid/direction.ts";

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
  return canSeeTile(origin.x, origin.y, target.x, target.y, sight);
}

export function canSeeTile(
  originX: number,
  originY: number,
  targetX: number,
  targetY: number,
  sight: SightSpec,
): boolean {
  const radius = Math.max(0, Math.floor(sight.radius));
  const dx = originX - targetX;
  const dy = originY - targetY;
  if (dx * dx + dy * dy > radius * radius) return false;
  if (sight.facing !== undefined && !isWithinFacingCone(originX, originY, targetX, targetY, sight.facing)) {
    return false;
  }
  return hasLineOfSight(originX, originY, targetX, targetY, sight.blocksSight);
}

export function canHearNoise(listener: GridPoint, noise: NoiseStimulus): boolean {
  return canHearNoiseAt(listener.x, listener.y, noise.x, noise.y, noise.radius);
}

export function canHearNoiseAt(
  listenerX: number,
  listenerY: number,
  noiseX: number,
  noiseY: number,
  radius: number,
): boolean {
  return Math.abs(listenerX - noiseX) + Math.abs(listenerY - noiseY) <= Math.max(0, Math.floor(radius));
}

function hasLineOfSight(
  originX: number,
  originY: number,
  targetX: number,
  targetY: number,
  blocksSight: BlocksSight,
): boolean {
  let x = originX;
  let y = originY;
  const dx = targetX - originX;
  const dy = targetY - originY;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const width = Math.abs(dx);
  const height = Math.abs(dy);
  let traversedX = 0;
  let traversedY = 0;

  while (traversedX < width || traversedY < height) {
    const decision = (1 + 2 * traversedX) * height - (1 + 2 * traversedY) * width;

    if (decision === 0) {
      if (blocksSight(x + stepX, y) || blocksSight(x, y + stepY)) return false;
      x += stepX;
      y += stepY;
      traversedX++;
      traversedY++;
    } else if (decision < 0) {
      x += stepX;
      traversedX++;
    } else {
      y += stepY;
      traversedY++;
    }

    if (x === targetX && y === targetY) return true;
    if (blocksSight(x, y)) return false;
  }

  return true;
}

function isWithinFacingCone(
  originX: number,
  originY: number,
  targetX: number,
  targetY: number,
  facing: CardinalDirection,
): boolean {
  const forward = directionDelta(facing);
  const sideDx = -forward.dy;
  const sideDy = forward.dx;
  const dx = targetX - originX;
  const dy = targetY - originY;
  const forwardDistance = dx * forward.dx + dy * forward.dy;
  const sideDistance = dx * sideDx + dy * sideDy;

  return forwardDistance >= 0 && Math.abs(sideDistance) <= forwardDistance;
}
