import type { GameCanvasSize } from "@/src/render/canvas.ts";
import type { TileVisibility } from "@/src/game/visibility.ts";
import { mapDimensions, terrainAt } from "@/src/map/map.ts";
import type { GameMap } from "@/src/map/map.ts";

export interface MapRenderMetrics {
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly tileSize: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

const MIN_TILE_SIZE = 8;
const FLOOR_COLOR = "#232832";
const WALL_COLOR = "#5a5f68";
const GRID_LINE_COLOR = "#151922";
const EXPLORED_FLOOR_COLOR = "#151922";
const EXPLORED_WALL_COLOR = "#353a44";
const EXPLORED_GRID_LINE_COLOR = "#0c0f15";
const UNEXPLORED_COLOR = "#05070b";

export function renderMap(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  map: GameMap,
  visibility?: TileVisibility,
): MapRenderMetrics {
  const metrics = mapRenderMetrics(canvasSize, map);
  for (let y = 0; y < metrics.mapHeight; y++) {
    for (let x = 0; x < metrics.mapWidth; x++) {
      renderTile(ctx, map, x, y, metrics, visibility);
    }
  }
  return metrics;
}

function mapRenderMetrics(canvasSize: GameCanvasSize, map: GameMap): MapRenderMetrics {
  const { width: mapWidth, height: mapHeight } = mapDimensions(map);
  const tileSize = Math.max(
    MIN_TILE_SIZE,
    Math.floor(Math.min(canvasSize.width / (mapWidth + 2), canvasSize.height / (mapHeight + 2))),
  );
  return {
    mapWidth,
    mapHeight,
    tileSize,
    offsetX: Math.floor((canvasSize.width - mapWidth * tileSize) / 2),
    offsetY: Math.floor((canvasSize.height - mapHeight * tileSize) / 2),
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
  ctx.fillStyle = tileColor(terrain === undefined || terrain.blocking === true, visible);
  ctx.fillRect(tileX, tileY, tileSize, tileSize);
  ctx.strokeStyle = visible ? GRID_LINE_COLOR : EXPLORED_GRID_LINE_COLOR;
  ctx.strokeRect(tileX + 0.5, tileY + 0.5, tileSize - 1, tileSize - 1);
}

function tileColor(blocking: boolean, visible: boolean): string {
  if (visible) return blocking ? WALL_COLOR : FLOOR_COLOR;
  return blocking ? EXPLORED_WALL_COLOR : EXPLORED_FLOOR_COLOR;
}
