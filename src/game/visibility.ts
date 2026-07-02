import { directionDelta } from "@/src/grid/direction.ts";
import type { CardinalDirection, GridPoint } from "@/src/grid/direction.ts";

export interface TileVisibility {
  isVisible(x: number, y: number): boolean;
  isExplored(x: number, y: number): boolean;
}

export type VisibilityOptions = {
  readonly radius: number;
  readonly facing?: CardinalDirection;
  readonly blocksSight: (x: number, y: number) => boolean;
};

export class VisibilityMap implements TileVisibility {
  private readonly width: number;
  private readonly height: number;
  private readonly visibleTiles: Uint8Array;
  private readonly exploredTiles: Uint8Array;

  constructor(dimensions: { readonly width: number; readonly height: number }) {
    this.width = dimensions.width;
    this.height = dimensions.height;
    this.visibleTiles = new Uint8Array(this.width * this.height);
    this.exploredTiles = new Uint8Array(this.width * this.height);
  }

  revealFrom(origin: GridPoint, options: VisibilityOptions): void {
    this.visibleTiles.fill(0);

    const originIndex = this.tileIndex(origin.x, origin.y);
    if (originIndex === undefined) return;

    const radius = Math.max(0, Math.floor(options.radius));
    const radiusSquared = radius * radius;
    const minX = Math.max(0, origin.x - radius);
    const maxX = Math.min(this.width - 1, origin.x + radius);
    const minY = Math.max(0, origin.y - radius);
    const maxY = Math.min(this.height - 1, origin.y + radius);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const target = { x, y };
        if (distanceSquared(origin, target) > radiusSquared) continue;
        if (options.facing !== undefined && !isWithinFacingCone(origin, target, options.facing)) continue;
        if (!hasLineOfSight(origin, target, options.blocksSight)) continue;
        this.reveal(x, y);
      }
    }
  }

  isVisible(x: number, y: number): boolean {
    const index = this.tileIndex(x, y);
    return index !== undefined && this.visibleTiles[index] === 1;
  }

  isExplored(x: number, y: number): boolean {
    const index = this.tileIndex(x, y);
    return index !== undefined && this.exploredTiles[index] === 1;
  }

  private reveal(x: number, y: number): void {
    const index = this.tileIndex(x, y);
    if (index === undefined) return;

    this.visibleTiles[index] = 1;
    this.exploredTiles[index] = 1;
  }

  private tileIndex(x: number, y: number): number | undefined {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return undefined;
    return y * this.width + x;
  }
}

function hasLineOfSight(
  origin: GridPoint,
  target: GridPoint,
  blocksSight: (x: number, y: number) => boolean,
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

function distanceSquared(a: GridPoint, b: GridPoint): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
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
