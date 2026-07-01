import type { GameCanvasSize } from "@/src/render/canvas.ts";
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
const EXIT_COLOR = "#4ea1ff";

export function renderMap(ctx: CanvasRenderingContext2D, canvasSize: GameCanvasSize, map: GameMap): MapRenderMetrics {
  const metrics = mapRenderMetrics(canvasSize, map);
  for (let y = 0; y < metrics.mapHeight; y++) {
    for (let x = 0; x < metrics.mapWidth; x++) {
      renderTile(ctx, map, x, y, metrics);
    }
  }
  return metrics;
}

export function renderExits(ctx: CanvasRenderingContext2D, map: GameMap, metrics: MapRenderMetrics): void {
  for (const entity of map.entities) {
    if (entity.prefab === "exit") {
      renderExit(ctx, entity.x, entity.y, metrics);
    }
  }
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
): void {
  const { offsetX, offsetY, tileSize } = metrics;
  const terrain = terrainAt(map, x, y);
  const tileX = offsetX + x * tileSize;
  const tileY = offsetY + y * tileSize;
  // Missing terrain blocks movement, so render it as wall to match.
  ctx.fillStyle = terrain === undefined || terrain.blocking === true ? WALL_COLOR : FLOOR_COLOR;
  ctx.fillRect(tileX, tileY, tileSize, tileSize);
  ctx.strokeStyle = GRID_LINE_COLOR;
  ctx.strokeRect(tileX + 0.5, tileY + 0.5, tileSize - 1, tileSize - 1);
}

function renderExit(ctx: CanvasRenderingContext2D, x: number, y: number, metrics: MapRenderMetrics): void {
  const { offsetX, offsetY, tileSize } = metrics;
  const tileX = offsetX + x * tileSize;
  const tileY = offsetY + y * tileSize;
  const inset = Math.max(3, tileSize * 0.22);
  ctx.strokeStyle = EXIT_COLOR;
  ctx.lineWidth = Math.max(2, tileSize * 0.08);
  ctx.strokeRect(tileX + inset, tileY + inset, tileSize - inset * 2, tileSize - inset * 2);
  ctx.lineWidth = 1;
}
