import { canSeeTile } from "@/src/game/perception.ts";
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

    const originX = origin.x;
    const originY = origin.y;
    const originIndex = this.tileIndex(originX, originY);
    if (originIndex === undefined) return;

    const radius = Math.max(0, Math.floor(options.radius));
    const radiusSquared = radius * radius;
    const minX = Math.max(0, originX - radius);
    const maxX = Math.min(this.width - 1, originX + radius);
    const minY = Math.max(0, originY - radius);
    const maxY = Math.min(this.height - 1, originY + radius);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = originX - x;
        const dy = originY - y;
        if (dx * dx + dy * dy > radiusSquared) continue;
        if (!canSeeTile(originX, originY, x, y, options)) continue;
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
