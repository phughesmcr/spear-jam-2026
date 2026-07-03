import { EnemyArchetype } from "@/src/ecs/enemy_catalog.ts";
import { DrawableKind } from "@/src/ecs/drawables.ts";
import type { DrawableEntity } from "@/src/ecs/drawables.ts";
import type { GameSession } from "@/src/ecs/session.ts";
import { directionDelta } from "@/src/grid/direction.ts";
import { KeyColor } from "@/src/map/map.ts";
import type { KeyColor as KeyColorType } from "@/src/map/map.ts";
import type { ItemIcon } from "@/src/game/items.ts";
import type { MapRenderMetrics } from "@/src/render/map.ts";
import { monoFont } from "@/src/render/text.ts";

type Point = { readonly x: number; readonly y: number };
type Triangle = readonly [Point, Point, Point];
type EnemySymbol = { readonly color: string; readonly symbol: string };

const ACTOR_STROKE_COLOR = "#101217";
const PLAYER_COLOR = "#f0c84b";
const NPC_COLOR = "#59d39b";
const ENEMY_COLOR = "#df4f45";
const DOG_COLOR = "#ef4444";
const GUNSLINGER_COLOR = "#38bdf8";
const NETWORK_NEOPHYTE_COLOR = "#34d399";
const SYSTEM_SENTINEL_COLOR = "#f59e0b";
const AGENTIC_ACOLYTE_COLOR = "#a78bfa";
const ENEMY_SYMBOL_COLOR = "#101217";
const ENEMY_HP_BACK = "#111827";
const ENEMY_HP_HEALTHY = "#22c55e";
const ENEMY_HP_WARN = "#facc15";
const ENEMY_HP_DANGER = "#ef4444";
const DOOR_COLOR = "#9a6a3a";
const LOCKED_DOOR_COLOR = "#b14b4b";
const UPLINK_CODE_COLOR = "#7dd3fc";
const UPLINK_TERMINAL_COLOR = "#22c55e";
const UPLINK_TERMINAL_SCREEN = "#0f172a";
const WEAPON_PICKUP_COLOR = "#c084fc";
const WEAPON_PICKUP_TEXT = "#101217";
const ITEM_TEXT = "#101217";
const KEY_COLORS: Record<KeyColorType, string> = {
  [KeyColor.Red]: "#df4f45",
  [KeyColor.Blue]: "#4f8df7",
  [KeyColor.Yellow]: "#f4d35e",
};
const ENEMY_SYMBOLS: Readonly<Record<EnemyArchetype, EnemySymbol>> = {
  [EnemyArchetype.MeleeDog]: { color: DOG_COLOR, symbol: "D" },
  [EnemyArchetype.Gunslinger]: { color: GUNSLINGER_COLOR, symbol: "G" },
  [EnemyArchetype.NetworkNeophyte]: { color: NETWORK_NEOPHYTE_COLOR, symbol: "N" },
  [EnemyArchetype.SystemSentinel]: { color: SYSTEM_SENTINEL_COLOR, symbol: "S" },
  [EnemyArchetype.AgenticAcolyte]: { color: AGENTIC_ACOLYTE_COLOR, symbol: "A" },
};
const PLAYER_RADIUS_RATIO = 0.34;
const PLAYER_BASE_WIDTH_RATIO = 0.75;
const NPC_RADIUS_RATIO = 0.28;

export function renderDrawableEntities(
  ctx: CanvasRenderingContext2D,
  session: GameSession,
  metrics: MapRenderMetrics,
): void {
  session.forEachDrawable((drawable) => {
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
      renderEnemy(ctx, drawable.x, drawable.y, drawable.dir, drawable.enemyArchetype, drawable.health, metrics);
      return;
    case DrawableKind.Door:
      renderDoor(ctx, drawable.x, drawable.y, drawable.open, drawable.locked, drawable.color, metrics);
      return;
    case DrawableKind.UplinkTerminal:
      renderUplinkTerminal(ctx, drawable.x, drawable.y, metrics);
      return;
    case DrawableKind.Item:
      renderItem(ctx, drawable.x, drawable.y, drawable.icon, metrics);
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
  const { tileSize } = metrics;
  const center = tileCenter(metrics, x, y);
  const radius = tileSize * 0.18;
  ctx.fillStyle = KEY_COLORS[color];
  ctx.beginPath();
  ctx.moveTo(center.x, center.y - radius);
  ctx.lineTo(center.x + radius, center.y);
  ctx.lineTo(center.x, center.y + radius);
  ctx.lineTo(center.x - radius, center.y);
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

function renderUplinkCode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  metrics: MapRenderMetrics,
): void {
  const { tileSize } = metrics;
  const center = tileCenter(metrics, x, y);
  const width = tileSize * 0.46;
  const height = tileSize * 0.28;
  const notch = Math.max(2, tileSize * 0.08);

  ctx.fillStyle = UPLINK_CODE_COLOR;
  ctx.fillRect(center.x - width / 2, center.y - height / 2, width, height);
  ctx.fillStyle = ACTOR_STROKE_COLOR;
  ctx.fillRect(center.x + width / 2 - notch, center.y - height / 4, notch, height / 2);
}

function renderUplinkTerminal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  metrics: MapRenderMetrics,
): void {
  const { offsetX, offsetY, tileSize } = metrics;
  const center = tileCenter(metrics, x, y);
  const tileX = offsetX + x * tileSize;
  const tileY = offsetY + y * tileSize;
  const inset = Math.max(3, tileSize * 0.16);
  const width = tileSize - inset * 2;
  const height = tileSize - inset * 2;
  const screenInset = Math.max(2, tileSize * 0.1);

  ctx.fillStyle = UPLINK_TERMINAL_COLOR;
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
  ctx.moveTo(center.x, tileY + inset);
  ctx.lineTo(center.x, tileY + inset / 2);
  ctx.moveTo(center.x, tileY + inset / 2);
  ctx.lineTo(center.x - inset, tileY);
  ctx.moveTo(center.x, tileY + inset / 2);
  ctx.lineTo(center.x + inset, tileY);
  ctx.stroke();
}

function renderWeaponPickup(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  slot: number,
  metrics: MapRenderMetrics,
): void {
  const { tileSize } = metrics;
  const center = tileCenter(metrics, x, y);
  const radius = tileSize * 0.22;

  ctx.fillStyle = WEAPON_PICKUP_COLOR;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = WEAPON_PICKUP_TEXT;
  ctx.font = monoFont(700, Math.max(8, Math.floor(tileSize * 0.32)));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(slot), center.x, center.y + 0.5);
}

function renderItem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  icon: ItemIcon,
  metrics: MapRenderMetrics,
): void {
  switch (icon.type) {
    case "badge":
      renderBadge(ctx, x, y, icon.color, icon.label, metrics);
      return;
    case "key":
      renderKey(ctx, x, y, icon.color, metrics);
      return;
    case "uplinkCode":
      renderUplinkCode(ctx, x, y, metrics);
      return;
    case "weapon":
      renderWeaponPickup(ctx, x, y, icon.slot, metrics);
      return;
  }
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
  const center = tileCenter(metrics, x, y);
  const radius = tileSize * 0.2;

  ctx.fillStyle = color;
  ctx.fillRect(center.x - radius, center.y - radius, radius * 2, radius * 2);
  ctx.fillStyle = ITEM_TEXT;
  ctx.font = monoFont(700, Math.max(8, Math.floor(tileSize * 0.28)));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, center.x, center.y + 0.5);
}

function renderEnemy(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: number,
  archetype: EnemyArchetype | undefined,
  health: { readonly current: number; readonly max: number } | undefined,
  metrics: MapRenderMetrics,
): void {
  if (archetype === undefined) {
    renderActor(ctx, x, y, dir, ENEMY_COLOR, metrics);
  } else {
    const enemySymbol = ENEMY_SYMBOLS[archetype];
    renderActorSymbol(ctx, x, y, dir, enemySymbol.color, enemySymbol.symbol, metrics);
  }
  renderEnemyHealth(ctx, x, y, health, metrics);
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
  const center = tileCenter(metrics, x, y);
  const topY = offsetY + y * tileSize + Math.max(2, tileSize * 0.08);
  const leftX = center.x - barWidth / 2;

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

function renderActor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: number,
  color: string,
  metrics: MapRenderMetrics,
): void {
  renderActorSymbol(ctx, x, y, dir, color, undefined, metrics);
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
  const center = tileCenter(metrics, x, y);
  const radius = tileSize * NPC_RADIUS_RATIO;
  const forward = directionDelta(dir);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ACTOR_STROKE_COLOR;
  ctx.beginPath();
  ctx.moveTo(center.x, center.y);
  ctx.lineTo(center.x + forward.dx * radius, center.y + forward.dy * radius);
  ctx.stroke();
  if (symbol === undefined) return;

  ctx.fillStyle = ENEMY_SYMBOL_COLOR;
  ctx.font = monoFont(700, Math.max(8, Math.floor(tileSize * 0.25)));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(symbol, center.x, center.y + 0.5);
}

function renderPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: number,
  metrics: MapRenderMetrics,
): void {
  const { tileSize } = metrics;
  const center = tileCenter(metrics, x, y);
  const radius = tileSize * PLAYER_RADIUS_RATIO;
  const [tip, left, right] = playerTriangle(center.x, center.y, radius, dir);
  ctx.fillStyle = PLAYER_COLOR;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.closePath();
  ctx.fill();
}

function tileCenter(metrics: MapRenderMetrics, x: number, y: number): Point {
  return {
    x: metrics.offsetX + x * metrics.tileSize + metrics.tileSize / 2,
    y: metrics.offsetY + y * metrics.tileSize + metrics.tileSize / 2,
  };
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
