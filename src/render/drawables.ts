import { spriteAppearance } from "@/src/content/sprites.ts";
import {
  type ActorDrawableEntity,
  type DrawableEntity,
  DrawableKind,
  type SpriteDrawableEntity,
  SpriteId,
} from "@/src/ecs/drawables.ts";
import type { FrameRenderSession } from "@/src/game/session_ports.ts";
import { directionDelta } from "@/src/grid/direction.ts";
import { KeyColor, type KeyColor as KeyColorType } from "@/src/map/map.ts";
import type { MapRenderMetrics } from "@/src/render/map.ts";
import { monoFont } from "@/src/render/text.ts";

const ACTOR_STROKE_COLOR = "#101217";
const ENEMY_SYMBOL_COLOR = "#101217";
const ENEMY_HP_BACK = "#111827";
const ENEMY_HP_HEALTHY = "#22c55e";
const ENEMY_HP_WARN = "#facc15";
const ENEMY_HP_DANGER = "#ef4444";
const DOOR_COLOR = "#9a6a3a";
const LOCKED_DOOR_COLOR = "#b14b4b";
/** Matches the top-down wall fill so an unrevealed secret door reads as a wall. */
const SECRET_DOOR_WALL_COLOR = "#5a5f68";
const UPLINK_TERMINAL_SCREEN = "#0f172a";
const ITEM_TEXT = "#101217";
const KEY_COLORS: Record<KeyColorType, string> = {
  [KeyColor.Red]: "#df4f45",
  [KeyColor.Blue]: "#4f8df7",
  [KeyColor.Yellow]: "#f4d35e",
};
const PLAYER_RADIUS_RATIO = 0.34;
const PLAYER_BASE_WIDTH_RATIO = 0.75;
const NPC_RADIUS_RATIO = 0.28;

export function renderDrawableEntities(
  ctx: CanvasRenderingContext2D,
  session: FrameRenderSession,
  metrics: MapRenderMetrics,
): void {
  const visibility = session.getVisibility();
  session.forEachDrawable((drawable) => {
    if (drawable.kind !== DrawableKind.Player && !visibility.isVisible(drawable.x, drawable.y)) return;
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
    case DrawableKind.Actor:
      renderActorDrawable(ctx, drawable, metrics);
      return;
    case DrawableKind.Door:
      renderDoor(ctx, drawable.x, drawable.y, drawable.open, drawable.locked, drawable.secret, drawable.color, metrics);
      return;
    case DrawableKind.Sprite:
      renderSpriteDrawable(ctx, drawable, metrics);
      return;
  }
}

function renderActorDrawable(
  ctx: CanvasRenderingContext2D,
  drawable: ActorDrawableEntity,
  metrics: MapRenderMetrics,
): void {
  const appearance = spriteAppearance(drawable.spriteId);
  renderActorSymbol(
    ctx,
    drawable.x,
    drawable.y,
    drawable.dir,
    appearance.topDownColor,
    appearance.topDownSymbol,
    metrics,
  );
  renderEnemyHealth(ctx, drawable.x, drawable.y, drawable.health, metrics);
}

function renderSpriteDrawable(
  ctx: CanvasRenderingContext2D,
  drawable: SpriteDrawableEntity,
  metrics: MapRenderMetrics,
): void {
  const appearance = spriteAppearance(drawable.spriteId);
  switch (appearance.topDownShape) {
    case "actor":
      renderActorSymbol(ctx, drawable.x, drawable.y, 0, appearance.topDownColor, appearance.topDownSymbol, metrics);
      return;
    case "badge":
      renderBadge(ctx, drawable.x, drawable.y, appearance.topDownColor, appearance.topDownSymbol ?? "", metrics);
      return;
    case "corpse":
      renderCorpse(ctx, drawable.x, drawable.y, appearance.topDownColor, metrics);
      return;
    case "key":
      renderKey(ctx, drawable.x, drawable.y, appearance.topDownColor, metrics);
      return;
    case "none":
      return;
    case "player":
      return;
    case "terminal":
      renderUplinkTerminal(ctx, drawable.x, drawable.y, appearance.topDownColor, metrics);
      return;
    case "uplinkCode":
      renderUplinkCode(ctx, drawable.x, drawable.y, appearance.topDownColor, metrics);
      return;
    case "weapon":
      renderWeaponPickup(ctx, drawable.x, drawable.y, appearance.topDownColor, appearance.topDownSymbol ?? "", metrics);
      return;
    default: {
      const _exhaustive: never = appearance.topDownShape;
      return _exhaustive;
    }
  }
}

function renderKey(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  metrics: MapRenderMetrics,
): void {
  const { tileSize } = metrics;
  const centerX = tileCenterX(metrics, x);
  const centerY = tileCenterY(metrics, y);
  const radius = tileSize * 0.18;
  ctx.fillStyle = color;
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
  secret: boolean,
  color: KeyColorType | undefined,
  metrics: MapRenderMetrics,
): void {
  if (open) return;
  const { offsetX, offsetY, tileSize } = metrics;
  const tileX = offsetX + x * tileSize;
  const tileY = offsetY + y * tileSize;
  // An unrevealed secret door fills the whole tile so it blends into the walls.
  if (secret) {
    ctx.fillStyle = SECRET_DOOR_WALL_COLOR;
    ctx.fillRect(tileX, tileY, tileSize, tileSize);
    return;
  }
  const inset = Math.max(2, tileSize * 0.18);
  const width = tileSize - inset * 2;
  const height = tileSize - inset * 2;
  let fillColor = DOOR_COLOR;
  if (locked) fillColor = color === undefined ? LOCKED_DOOR_COLOR : KEY_COLORS[color];
  ctx.fillStyle = fillColor;
  ctx.fillRect(tileX + inset, tileY + inset, width, height);
}

function renderUplinkCode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  metrics: MapRenderMetrics,
): void {
  const { tileSize } = metrics;
  const centerX = tileCenterX(metrics, x);
  const centerY = tileCenterY(metrics, y);
  const width = tileSize * 0.46;
  const height = tileSize * 0.28;
  const notch = Math.max(2, tileSize * 0.08);

  ctx.fillStyle = color;
  ctx.fillRect(centerX - width / 2, centerY - height / 2, width, height);
  ctx.fillStyle = ACTOR_STROKE_COLOR;
  ctx.fillRect(centerX + width / 2 - notch, centerY - height / 4, notch, height / 2);
}

function renderUplinkTerminal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  metrics: MapRenderMetrics,
): void {
  const { offsetX, offsetY, tileSize } = metrics;
  const centerX = tileCenterX(metrics, x);
  const tileX = offsetX + x * tileSize;
  const tileY = offsetY + y * tileSize;
  const inset = Math.max(3, tileSize * 0.16);
  const width = tileSize - inset * 2;
  const height = tileSize - inset * 2;
  const screenInset = Math.max(2, tileSize * 0.1);

  ctx.fillStyle = color;
  ctx.fillRect(tileX + inset, tileY + inset, width, height);
  ctx.fillStyle = UPLINK_TERMINAL_SCREEN;
  ctx.fillRect(
    tileX + inset + screenInset,
    tileY + inset + screenInset,
    width - screenInset * 2,
    height * 0.42,
  );
  ctx.strokeStyle = UPLINK_TERMINAL_SCREEN;
  ctx.beginPath();
  ctx.moveTo(centerX, tileY + inset);
  ctx.lineTo(centerX, tileY + inset / 2);
  ctx.moveTo(centerX, tileY + inset / 2);
  ctx.lineTo(centerX - inset, tileY);
  ctx.moveTo(centerX, tileY + inset / 2);
  ctx.lineTo(centerX + inset, tileY);
  ctx.stroke();
}

function renderWeaponPickup(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  label: string,
  metrics: MapRenderMetrics,
): void {
  const { tileSize } = metrics;
  const centerX = tileCenterX(metrics, x);
  const centerY = tileCenterY(metrics, y);
  const radius = tileSize * 0.22;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = ITEM_TEXT;
  ctx.font = monoFont(700, Math.max(8, Math.floor(tileSize * 0.32)));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, centerX, centerY + 0.5);
}

function renderBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  label: string,
  metrics: MapRenderMetrics,
): void {
  const { tileSize } = metrics;
  const centerX = tileCenterX(metrics, x);
  const centerY = tileCenterY(metrics, y);
  const radius = tileSize * 0.2;

  ctx.fillStyle = color;
  ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
  ctx.fillStyle = ITEM_TEXT;
  ctx.font = monoFont(700, Math.max(8, Math.floor(tileSize * 0.28)));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, centerX, centerY + 0.5);
}

function renderCorpse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  metrics: MapRenderMetrics,
): void {
  const { tileSize } = metrics;
  const centerX = tileCenterX(metrics, x);
  const centerY = tileCenterY(metrics, y);
  const radius = tileSize * 0.22;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, radius * 1.2, radius * 0.72, -0.45, 0, Math.PI * 2);
  ctx.fill();
}

function renderEnemyHealth(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  health: { readonly current: number; readonly max: number } | undefined,
  metrics: MapRenderMetrics,
): void {
  if (health === undefined || health.max <= 0) return;

  const { offsetY, tileSize } = metrics;
  const ratio = Math.max(0, Math.min(1, health.current / health.max));
  const barWidth = tileSize * 0.52;
  const barHeight = Math.max(3, Math.floor(tileSize * 0.08));
  const centerX = tileCenterX(metrics, x);
  const topY = offsetY + y * tileSize + Math.max(2, tileSize * 0.08);
  const leftX = centerX - barWidth / 2;

  ctx.fillStyle = ENEMY_HP_BACK;
  ctx.fillRect(leftX, topY, barWidth, barHeight);
  if (ratio > 0) {
    ctx.fillStyle = enemyHealthColor(ratio);
    ctx.fillRect(leftX, topY, Math.max(1, barWidth * ratio), barHeight);
  }
}

function enemyHealthColor(ratio: number): string {
  if (ratio <= 0.34) return ENEMY_HP_DANGER;
  if (ratio <= 0.67) return ENEMY_HP_WARN;
  return ENEMY_HP_HEALTHY;
}

function renderActorSymbol(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: number,
  color: string,
  symbol: string | undefined,
  metrics: MapRenderMetrics,
): void {
  const { tileSize } = metrics;
  const centerX = tileCenterX(metrics, x);
  const centerY = tileCenterY(metrics, y);
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
  if (symbol === undefined) return;

  ctx.fillStyle = ENEMY_SYMBOL_COLOR;
  ctx.font = monoFont(700, Math.max(8, Math.floor(tileSize * 0.25)));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(symbol, centerX, centerY + 0.5);
}

function renderPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: number,
  metrics: MapRenderMetrics,
): void {
  const { tileSize } = metrics;
  const centerX = tileCenterX(metrics, x);
  const centerY = tileCenterY(metrics, y);
  const radius = tileSize * PLAYER_RADIUS_RATIO;
  const forward = directionDelta(dir);
  const sideX = -forward.dy;
  const sideY = forward.dx;
  const baseCenterX = centerX - forward.dx * radius;
  const baseCenterY = centerY - forward.dy * radius;
  const baseOffset = radius * PLAYER_BASE_WIDTH_RATIO;

  ctx.fillStyle = spriteAppearance(SpriteId.Player).topDownColor;
  ctx.beginPath();
  ctx.moveTo(centerX + forward.dx * radius, centerY + forward.dy * radius);
  ctx.lineTo(baseCenterX + sideX * baseOffset, baseCenterY + sideY * baseOffset);
  ctx.lineTo(baseCenterX - sideX * baseOffset, baseCenterY - sideY * baseOffset);
  ctx.closePath();
  ctx.fill();
}

function tileCenterX(metrics: MapRenderMetrics, x: number): number {
  return metrics.offsetX + x * metrics.tileSize + metrics.tileSize / 2;
}

function tileCenterY(metrics: MapRenderMetrics, y: number): number {
  return metrics.offsetY + y * metrics.tileSize + metrics.tileSize / 2;
}
