import { type Entity, System, type World } from "@phughesmcr/miski";
import { directionDelta } from "@/src/grid/direction.ts";
import {
  Door,
  DrawableKind,
  DrawableLayer,
  type DrawablePartitions,
  Facing,
  type GridPosPartitions,
  Locked,
} from "@/src/ecs/components.ts";
import { drawableRenderQuery } from "@/src/ecs/queries.ts";
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

type DrawableRenderSystem = (ctx: CanvasRenderingContext2D, metrics: MapRenderMetrics, world: World) => void;
type DrawableRenderComponents = {
  readonly gridPos: { readonly partitions: GridPosPartitions };
  readonly drawable: { readonly partitions: DrawablePartitions };
};
type DrawableRenderArgs = {
  readonly ctx: CanvasRenderingContext2D;
  readonly world: World;
  readonly entity: Entity;
  readonly x: number;
  readonly y: number;
  readonly metrics: MapRenderMetrics;
};
type DrawableRenderer = (args: DrawableRenderArgs) => void;

const MIN_TILE_SIZE = 8;
const EMPTY_COLOR = "#101217";
const FLOOR_COLOR = "#232832";
const WALL_COLOR = "#5a5f68";
const GRID_LINE_COLOR = "#151922";
const PLAYER_COLOR = "#f0c84b";
const NPC_COLOR = "#59d39b";
const ENEMY_COLOR = "#df4f45";
const DOOR_COLOR = "#9a6a3a";
const LOCKED_DOOR_COLOR = "#b14b4b";
const KEY_COLOR = "#f4d35e";
const EXIT_COLOR = "#4ea1ff";
const PLAYER_RADIUS_RATIO = 0.34;
const PLAYER_BASE_WIDTH_RATIO = 0.75;
const NPC_RADIUS_RATIO = 0.28;
const DRAWABLE_LAYER_ORDER: readonly DrawableLayer[] = [
  DrawableLayer.Item,
  DrawableLayer.Structure,
  DrawableLayer.Npc,
  DrawableLayer.Enemy,
  DrawableLayer.Player,
];
const DRAWABLE_RENDERERS: Readonly<Record<DrawableKind, DrawableRenderer>> = {
  [DrawableKind.Player]: ({ ctx, world, entity, x, y, metrics }) => {
    if (!world.components.entityHas(Facing, entity)) return;
    const { dir } = world.components.getEntityData(Facing, entity);
    renderPlayer(ctx, x, y, dir, metrics);
  },
  [DrawableKind.Npc]: ({ ctx, world, entity, x, y, metrics }) => {
    if (!world.components.entityHas(Facing, entity)) return;
    const { dir } = world.components.getEntityData(Facing, entity);
    renderActor(ctx, x, y, dir, NPC_COLOR, metrics);
  },
  [DrawableKind.Enemy]: ({ ctx, world, entity, x, y, metrics }) => {
    if (!world.components.entityHas(Facing, entity)) return;
    const { dir } = world.components.getEntityData(Facing, entity);
    renderActor(ctx, x, y, dir, ENEMY_COLOR, metrics);
  },
  [DrawableKind.Door]: ({ ctx, world, entity, x, y, metrics }) => {
    if (!world.components.entityHas(Door, entity)) return;
    const door = world.components.getEntityData(Door, entity);
    const locked = world.components.entityHas(Locked, entity);
    renderDoor(ctx, x, y, door.open === 1, locked, metrics);
  },
  [DrawableKind.Key]: ({ ctx, x, y, metrics }) => renderKey(ctx, x, y, metrics),
};
const drawableRenderersByKind = DRAWABLE_RENDERERS as Readonly<Record<number, DrawableRenderer | undefined>>;
const OVERLAY_COLOR = "rgba(0, 0, 0, 0.6)";
const OVERLAY_TITLE_COLOR = "#f3f4f6";
const OVERLAY_SUBTITLE_COLOR = "#c9d1d9";

const drawableRenderSystems = new WeakMap<World, DrawableRenderSystem>();

const drawableRenderSystem = new System({
  name: "drawableRenderSystem",
  query: drawableRenderQuery,
  callback: (
    components,
    entities,
    ctx: CanvasRenderingContext2D,
    metrics: MapRenderMetrics,
    world: World,
  ): void => {
    const renderComponents = components as unknown as DrawableRenderComponents;
    const positionX = renderComponents.gridPos.partitions.x;
    const positionY = renderComponents.gridPos.partitions.y;
    const drawableKind = renderComponents.drawable.partitions.kind;
    const drawableLayer = renderComponents.drawable.partitions.layer;
    const indices = entities.indices;
    const count = entities.count;

    for (const layer of DRAWABLE_LAYER_ORDER) {
      for (let i = 0; i < count; i++) {
        const entity = indices[i]!;
        if (drawableLayer[entity] !== layer) continue;
        const renderer = drawableRenderersByKind[drawableKind[entity]];
        if (renderer === undefined) continue;
        renderer({
          ctx,
          world,
          entity,
          x: positionX[entity],
          y: positionY[entity],
          metrics,
        });
      }
    }
  },
});

export function renderGameFrame(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  session?: GameSession,
  mode: GameMode = { type: "loading" },
): void {
  ctx.fillStyle = EMPTY_COLOR;
  ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
  if (session) {
    const { map } = session;
    const metrics = renderMap(ctx, canvasSize, map);
    renderExits(ctx, map, metrics);
    renderDrawableEntities(ctx, session.world, metrics);
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

function renderDrawableEntities(ctx: CanvasRenderingContext2D, world: World, metrics: MapRenderMetrics): void {
  getDrawableRenderSystem(world)(ctx, metrics, world);
}

function getDrawableRenderSystem(world: World): DrawableRenderSystem {
  const existing = drawableRenderSystems.get(world);
  if (existing !== undefined) return existing;
  const created = world.systems.create(drawableRenderSystem);
  drawableRenderSystems.set(world, created);
  return created;
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

function renderActor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: number,
  color: string,
  metrics: MapRenderMetrics,
): void {
  const { offsetX, offsetY, tileSize } = metrics;
  const centerX = offsetX + x * tileSize + tileSize / 2;
  const centerY = offsetY + y * tileSize + tileSize / 2;
  const radius = tileSize * NPC_RADIUS_RATIO;
  const forward = directionDelta(dir);
  ctx.fillStyle = color;
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
