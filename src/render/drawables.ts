import type { World } from "@phughesmcr/miski";
import { DrawableKind, forEachDrawableEntity } from "@/src/ecs/drawables.ts";
import type { DrawableEntity } from "@/src/ecs/drawables.ts";
import { directionDelta } from "@/src/grid/direction.ts";
import { KeyColor } from "@/src/map/map.ts";
import type { KeyColor as KeyColorType } from "@/src/map/map.ts";
import type { MapRenderMetrics } from "@/src/render/map.ts";

type Point = { readonly x: number; readonly y: number };
type Triangle = readonly [Point, Point, Point];

const ACTOR_STROKE_COLOR = "#101217";
const PLAYER_COLOR = "#f0c84b";
const NPC_COLOR = "#59d39b";
const ENEMY_COLOR = "#df4f45";
const DOOR_COLOR = "#9a6a3a";
const LOCKED_DOOR_COLOR = "#b14b4b";
const KEY_COLORS: Record<KeyColorType, string> = {
  [KeyColor.Red]: "#df4f45",
  [KeyColor.Blue]: "#4f8df7",
  [KeyColor.Yellow]: "#f4d35e",
};
const PLAYER_RADIUS_RATIO = 0.34;
const PLAYER_BASE_WIDTH_RATIO = 0.75;
const NPC_RADIUS_RATIO = 0.28;

export function renderDrawableEntities(ctx: CanvasRenderingContext2D, world: World, metrics: MapRenderMetrics): void {
  forEachDrawableEntity(world, (drawable) => {
    renderDrawableEntity(ctx, drawable, metrics);
  });
}

function renderDrawableEntity(
  ctx: CanvasRenderingContext2D,
  drawable: DrawableEntity,
  metrics: MapRenderMetrics,
): void {
  switch (drawable.kind) {
    case DrawableKind.Player:
      renderPlayer(ctx, drawable.x, drawable.y, drawable.dir, metrics);
      return;
    case DrawableKind.Npc:
      renderActor(ctx, drawable.x, drawable.y, drawable.dir, NPC_COLOR, metrics);
      return;
    case DrawableKind.Enemy:
      renderActor(ctx, drawable.x, drawable.y, drawable.dir, ENEMY_COLOR, metrics);
      return;
    case DrawableKind.Door:
      renderDoor(ctx, drawable.x, drawable.y, drawable.open, drawable.locked, drawable.color, metrics);
      return;
    case DrawableKind.Key:
      renderKey(ctx, drawable.x, drawable.y, drawable.color, metrics);
      return;
  }
}

function renderKey(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: KeyColorType,
  metrics: MapRenderMetrics,
): void {
  const { offsetX, offsetY, tileSize } = metrics;
  const centerX = offsetX + x * tileSize + tileSize / 2;
  const centerY = offsetY + y * tileSize + tileSize / 2;
  const radius = tileSize * 0.18;
  ctx.fillStyle = KEY_COLORS[color];
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
  color: KeyColorType | undefined,
  metrics: MapRenderMetrics,
): void {
  if (open) return;
  const { offsetX, offsetY, tileSize } = metrics;
  const tileX = offsetX + x * tileSize;
  const tileY = offsetY + y * tileSize;
  const inset = Math.max(2, tileSize * 0.18);
  const width = tileSize - inset * 2;
  const height = tileSize - inset * 2;
  let fillColor = DOOR_COLOR;
  if (locked) fillColor = color === undefined ? LOCKED_DOOR_COLOR : KEY_COLORS[color];
  ctx.fillStyle = fillColor;
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
