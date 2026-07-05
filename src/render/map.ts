import type { GameCanvasSize } from "@/src/render/canvas.ts";
import type { TileVisibility } from "@/src/game/visibility.ts";
import { type GameMap, mapDimensions, terrainAt } from "@/src/map/map.ts";

export interface MapRenderMetrics {
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly tileSize: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface MapRenderOrigin {
  readonly x: number;
  readonly y: number;
}

const MIN_TILE_SIZE = 8;
const FLOOR_COLOR = "#232832";
const WALL_COLOR = "#5a5f68";
const BARRIER_COLOR = "#2dd4bf";
const GRID_LINE_COLOR = "#151922";
const EXPLORED_FLOOR_COLOR = "#151922";
const EXPLORED_WALL_COLOR = "#353a44";
const EXPLORED_BARRIER_COLOR = "#164e63";
const EXPLORED_GRID_LINE_COLOR = "#0c0f15";
const UNEXPLORED_COLOR = "#05070b";

export function renderMap(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  map: GameMap,
  visibility?: TileVisibility,
  origin: MapRenderOrigin = { x: 0, y: 0 },
): MapRenderMetrics {
  const metrics = mapRenderMetrics(canvasSize, map, origin);
  for (let y = 0; y < metrics.mapHeight; y++) {
    for (let x = 0; x < metrics.mapWidth; x++) {
      renderTile(ctx, map, x, y, metrics, visibility);
    }
  }
  return metrics;
}

function mapRenderMetrics(canvasSize: GameCanvasSize, map: GameMap, origin: MapRenderOrigin): MapRenderMetrics {
  const { width: mapWidth, height: mapHeight } = mapDimensions(map);
  const tileSize = Math.max(
    MIN_TILE_SIZE,
    Math.floor(Math.min(canvasSize.width / (mapWidth + 2), canvasSize.height / (mapHeight + 2))),
  );
  return {
    mapWidth,
    mapHeight,
    tileSize,
    offsetX: origin.x + Math.floor((canvasSize.width - mapWidth * tileSize) / 2),
    offsetY: origin.y + Math.floor((canvasSize.height - mapHeight * tileSize) / 2),
  };
}

function renderTile(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  x: number,
  y: number,
  metrics: MapRenderMetrics,
  visibility: TileVisibility | undefined,
): void {
  const { offsetX, offsetY, tileSize } = metrics;
  const terrain = terrainAt(map, x, y);
  const tileX = offsetX + x * tileSize;
  const tileY = offsetY + y * tileSize;
  if (visibility !== undefined && !visibility.isExplored(x, y)) {
    ctx.fillStyle = UNEXPLORED_COLOR;
    ctx.fillRect(tileX, tileY, tileSize, tileSize);
    return;
  }

  const visible = visibility === undefined || visibility.isVisible(x, y);
  // Missing terrain blocks movement, so render it as wall to match.
  ctx.fillStyle = tileColor(terrain?.kind ?? "wall", visible);
  ctx.fillRect(tileX, tileY, tileSize, tileSize);
  ctx.strokeStyle = visible ? GRID_LINE_COLOR : EXPLORED_GRID_LINE_COLOR;
  ctx.strokeRect(tileX + 0.5, tileY + 0.5, tileSize - 1, tileSize - 1);
}

function tileColor(kind: "barrier" | "floor" | "wall", visible: boolean): string {
  switch (kind) {
    case "barrier":
      return visible ? BARRIER_COLOR : EXPLORED_BARRIER_COLOR;
    case "floor":
      return visible ? FLOOR_COLOR : EXPLORED_FLOOR_COLOR;
    case "wall":
      return visible ? WALL_COLOR : EXPLORED_WALL_COLOR;
  }
}
