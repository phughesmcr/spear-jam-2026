import { directionDelta } from "@/src/map/direction.ts";
import { Door, Facing, GridPos, Locked } from "@/src/ecs/components.ts";
import { doorRenderQuery, keyQuery, npcRenderQuery } from "@/src/ecs/queries.ts";
import type { GameSession } from "@/src/ecs/session.ts";
import type { GameMode } from "@/src/game/state.ts";
import { mapDimensions, terrainAt } from "@/src/map/map.ts";
import type { GameMap } from "@/src/map/map.ts";
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
const DOOR_COLOR = "#9a6a3a";
const LOCKED_DOOR_COLOR = "#b14b4b";
const KEY_COLOR = "#f4d35e";
const EXIT_COLOR = "#4ea1ff";
const PLAYER_RADIUS_RATIO = 0.34;
const PLAYER_BASE_WIDTH_RATIO = 0.75;
const NPC_RADIUS_RATIO = 0.28;
const OVERLAY_COLOR = "rgba(0, 0, 0, 0.6)";
const OVERLAY_TITLE_COLOR = "#f3f4f6";
const OVERLAY_SUBTITLE_COLOR = "#c9d1d9";

export function renderGameFrame(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  session?: GameSession,
  mode: GameMode = { type: "loading" },
): void {
  ctx.fillStyle = EMPTY_COLOR;
  ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
  if (session) {
    const { map, player } = session;
    const metrics = renderMap(ctx, canvasSize, map);
    renderExits(ctx, map, metrics);
    renderKeys(ctx, session, metrics);
    renderDoors(ctx, session, metrics);
    renderNpcs(ctx, session, metrics);
    const position = player.getPosition();
    const facing = player.getFacing();
    renderPlayer(ctx, position.x, position.y, facing.dir, metrics);
  }

  switch (mode.type) {
    case "loading":
      renderOverlay(ctx, canvasSize, "LOADING");
      return;
    case "paused":
      renderOverlay(ctx, canvasSize, "PAUSED", "P to resume");
      return;
    case "menu":
      renderOverlay(ctx, canvasSize, "MENU", "Esc to resume");
      return;
    case "intermission":
      renderOverlay(ctx, canvasSize, "INTERMISSION", mode.message);
      return;
    case "error":
      renderOverlay(ctx, canvasSize, "LOAD FAILED", mode.message);
      return;
    case "playing":
      return;
  }
}

function renderOverlay(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  title: string,
  subtitle?: string,
): void {
  const centerX = canvasSize.width / 2;
  const centerY = canvasSize.height / 2;
  const titleSize = Math.min(42, Math.max(24, Math.floor(canvasSize.width * 0.08)));
  const subtitleSize = Math.min(24, Math.max(14, Math.floor(canvasSize.width * 0.04)));

  ctx.save();
  ctx.fillStyle = OVERLAY_COLOR;
  ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${titleSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillStyle = OVERLAY_TITLE_COLOR;
  ctx.fillText(title, centerX, centerY - subtitleSize);

  if (subtitle) {
    ctx.font = `400 ${subtitleSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillStyle = OVERLAY_SUBTITLE_COLOR;
    ctx.fillText(subtitle, centerX, centerY + titleSize * 0.75);
  }
  ctx.restore();
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

function renderExits(ctx: CanvasRenderingContext2D, map: GameMap, metrics: MapRenderMetrics): void {
  for (const entity of map.entities) {
    if (entity.prefab === "exit") {
      renderExit(ctx, entity.x, entity.y, metrics);
    }
  }
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

function renderKeys(ctx: CanvasRenderingContext2D, session: GameSession, metrics: MapRenderMetrics): void {
  for (const entity of session.world.entities.query(keyQuery)) {
    const position = session.world.components.getEntityData(GridPos, entity);
    renderKey(ctx, position.x, position.y, metrics);
  }
}

function renderKey(ctx: CanvasRenderingContext2D, x: number, y: number, metrics: MapRenderMetrics): void {
  const { offsetX, offsetY, tileSize } = metrics;
  const centerX = offsetX + x * tileSize + tileSize / 2;
  const centerY = offsetY + y * tileSize + tileSize / 2;
  const radius = tileSize * 0.18;

  ctx.fillStyle = KEY_COLOR;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - radius);
  ctx.lineTo(centerX + radius, centerY);
  ctx.lineTo(centerX, centerY + radius);
  ctx.lineTo(centerX - radius, centerY);
  ctx.closePath();
  ctx.fill();
}

function renderDoors(ctx: CanvasRenderingContext2D, session: GameSession, metrics: MapRenderMetrics): void {
  for (const entity of session.world.entities.query(doorRenderQuery)) {
    const position = session.world.components.getEntityData(GridPos, entity);
    const door = session.world.components.getEntityData(Door, entity);
    const locked = session.world.components.entityHas(Locked, entity);
    renderDoor(ctx, position.x, position.y, door.open === 1, locked, metrics);
  }
}

function renderDoor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  open: boolean,
  locked: boolean,
  metrics: MapRenderMetrics,
): void {
  if (open) return;

  const { offsetX, offsetY, tileSize } = metrics;
  const tileX = offsetX + x * tileSize;
  const tileY = offsetY + y * tileSize;
  const inset = Math.max(2, tileSize * 0.18);
  const width = tileSize - inset * 2;
  const height = tileSize - inset * 2;

  ctx.fillStyle = locked ? LOCKED_DOOR_COLOR : DOOR_COLOR;
  ctx.fillRect(tileX + inset, tileY + inset, width, height);
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
