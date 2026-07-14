import type { GameCanvasSize } from "@/src/game/presentation/canvas_size.ts";
import type { TileVisibility } from "@/src/game/world/visibility.ts";
import { type GameMap, mapDimensions, terrainAt } from "@/src/game/world/map.ts";

export interface MapRenderMetrics {
  mapWidth: number;
  mapHeight: number;
  tileSize: number;
  offsetX: number;
  offsetY: number;
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
  visibility: TileVisibility | undefined,
  out: MapRenderMetrics,
  originX = 0,
  originY = 0,
): void {
  fillMapRenderMetrics(canvasSize, map, out, originX, originY);
  for (let y = 0; y < out.mapHeight; y++) {
    for (let x = 0; x < out.mapWidth; x++) {
      renderTile(ctx, map, x, y, out, visibility);
    }
  }
}

function fillMapRenderMetrics(
  canvasSize: GameCanvasSize,
  map: GameMap,
  out: MapRenderMetrics,
  originX: number,
  originY: number,
): void {
  const { width: mapWidth, height: mapHeight } = mapDimensions(map);
  const tileSize = Math.max(
    MIN_TILE_SIZE,
    Math.floor(Math.min(canvasSize.width / (mapWidth + 2), canvasSize.height / (mapHeight + 2))),
  );
  out.mapWidth = mapWidth;
  out.mapHeight = mapHeight;
  out.tileSize = tileSize;
  out.offsetX = originX + Math.floor((canvasSize.width - mapWidth * tileSize) / 2);
  out.offsetY = originY + Math.floor((canvasSize.height - mapHeight * tileSize) / 2);
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
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
