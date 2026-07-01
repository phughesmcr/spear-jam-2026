import { type Entity, type World } from "@phughesmcr/miski";
import { Door, DrawableKind, Facing, Locked } from "@/src/ecs/components.ts";
import { forEachDrawableEntity } from "@/src/ecs/drawables.ts";
import { directionDelta } from "@/src/grid/direction.ts";
import type { MapRenderMetrics } from "@/src/render/map.ts";

type Point = { readonly x: number; readonly y: number };
type Triangle = readonly [Point, Point, Point];

type DrawableRenderArgs = {
  readonly ctx: CanvasRenderingContext2D;
  readonly world: World;
  readonly entity: Entity;
  readonly x: number;
  readonly y: number;
  readonly metrics: MapRenderMetrics;
};
type DrawableRenderer = (args: DrawableRenderArgs) => void;

const ACTOR_STROKE_COLOR = "#101217";
const PLAYER_COLOR = "#f0c84b";
const NPC_COLOR = "#59d39b";
const ENEMY_COLOR = "#df4f45";
const DOOR_COLOR = "#9a6a3a";
const LOCKED_DOOR_COLOR = "#b14b4b";
const KEY_COLOR = "#f4d35e";
const PLAYER_RADIUS_RATIO = 0.34;
const PLAYER_BASE_WIDTH_RATIO = 0.75;
const NPC_RADIUS_RATIO = 0.28;
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

export function renderDrawableEntities(ctx: CanvasRenderingContext2D, world: World, metrics: MapRenderMetrics): void {
  forEachDrawableEntity(world, ({ entity, kind, x, y }) => {
    const renderer = drawableRenderersByKind[kind];
    if (renderer === undefined) return;
    renderer({ ctx, world, entity, x, y, metrics });
  });
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
  ctx.strokeStyle = ACTOR_STROKE_COLOR;
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
