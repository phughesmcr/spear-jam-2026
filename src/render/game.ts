import { directionDelta } from "@/src/map/direction.ts";
import { Facing, GridPos } from "@/src/ecs/components.ts";
import { npcRenderQuery } from "@/src/ecs/queries.ts";
import type { GameSession } from "@/src/ecs/session.ts";
import { mapDimensions, terrainAt } from "@/src/map/map_1.ts";
import type { GameMap } from "@/src/map/map_1.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";

type Point = { readonly x: number; readonly y: number };
type Triangle = readonly [Point, Point, Point];

interface MapRenderMetrics {
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly tileSize: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

const MIN_TILE_SIZE = 8;
const EMPTY_COLOR = "#101217";
const FLOOR_COLOR = "#232832";
const WALL_COLOR = "#5a5f68";
const GRID_LINE_COLOR = "#151922";
const PLAYER_COLOR = "#f0c84b";
const NPC_COLOR = "#59d39b";
const PLAYER_RADIUS_RATIO = 0.34;
const PLAYER_BASE_WIDTH_RATIO = 0.75;
const NPC_RADIUS_RATIO = 0.28;

export function renderGameFrame(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  session?: GameSession,
): void {
  ctx.fillStyle = EMPTY_COLOR;
  ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
  if (!session) return;
  const { map, player } = session;
  const metrics = renderMap(ctx, canvasSize, map);
  renderNpcs(ctx, session, metrics);
  const position = player.getPosition();
  const facing = player.getFacing();
  renderPlayer(ctx, position.x, position.y, facing.dir, metrics);
}

function renderMap(ctx: CanvasRenderingContext2D, canvasSize: GameCanvasSize, map: GameMap): MapRenderMetrics {
  const metrics = mapRenderMetrics(canvasSize, map);
  for (let y = 0; y < metrics.mapHeight; y++) {
    for (let x = 0; x < metrics.mapWidth; x++) {
      renderTile(ctx, map, x, y, metrics);
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
): void {
  const { offsetX, offsetY, tileSize } = metrics;
  const terrain = terrainAt(map, x, y);
  const tileX = offsetX + x * tileSize;
  const tileY = offsetY + y * tileSize;
  ctx.fillStyle = terrain?.blocking === true ? WALL_COLOR : FLOOR_COLOR;
  ctx.fillRect(tileX, tileY, tileSize, tileSize);
  ctx.strokeStyle = GRID_LINE_COLOR;
  ctx.strokeRect(tileX + 0.5, tileY + 0.5, tileSize - 1, tileSize - 1);
}

function renderNpcs(ctx: CanvasRenderingContext2D, session: GameSession, metrics: MapRenderMetrics): void {
  for (const entity of session.world.entities.query(npcRenderQuery)) {
    const position = session.world.components.getEntityData(GridPos, entity);
    const facing = session.world.components.getEntityData(Facing, entity);
    renderNpc(ctx, position.x, position.y, facing.dir, metrics);
  }
}

function renderNpc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: number,
  metrics: MapRenderMetrics,
): void {
  const { offsetX, offsetY, tileSize } = metrics;
  const centerX = offsetX + x * tileSize + tileSize / 2;
  const centerY = offsetY + y * tileSize + tileSize / 2;
  const radius = tileSize * NPC_RADIUS_RATIO;
  const forward = directionDelta(dir);

  ctx.fillStyle = NPC_COLOR;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = EMPTY_COLOR;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(centerX + forward.dx * radius, centerY + forward.dy * radius);
  ctx.stroke();
}

function renderPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: number,
  metrics: MapRenderMetrics,
): void {
  const { offsetX, offsetY, tileSize } = metrics;
  const centerX = offsetX + x * tileSize + tileSize / 2;
  const centerY = offsetY + y * tileSize + tileSize / 2;
  const radius = tileSize * PLAYER_RADIUS_RATIO;
  const [tip, left, right] = playerTriangle(centerX, centerY, radius, dir);
  ctx.fillStyle = PLAYER_COLOR;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.closePath();
  ctx.fill();
}

function playerTriangle(
  centerX: number,
  centerY: number,
  radius: number,
  dir: number,
): Triangle {
  const forward = directionDelta(dir);
  const side = { x: -forward.dy, y: forward.dx };
  const baseCenter = {
    x: centerX - forward.dx * radius,
    y: centerY - forward.dy * radius,
  };
  const baseOffset = radius * PLAYER_BASE_WIDTH_RATIO;
  return [
    { x: centerX + forward.dx * radius, y: centerY + forward.dy * radius },
    { x: baseCenter.x + side.x * baseOffset, y: baseCenter.y + side.y * baseOffset },
    { x: baseCenter.x - side.x * baseOffset, y: baseCenter.y - side.y * baseOffset },
  ];
}
