import type { GameSession } from "@/src/ecs/session.ts";
import type { PlayerState } from "@/src/game/state.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";
import { monoFont } from "@/src/render/text.ts";

const HUD_MARGIN = 12;
const HUD_PADDING_X = 10;
const HUD_PADDING_Y = 7;
const HUD_SEGMENT_GAP = 10;
const HUD_LINE_HEIGHT = 16;
const HUD_ROW_GAP = 3;
const HUD_FONT_SIZE = 13;
const HUD_BACKGROUND = "rgba(4, 7, 12, 0.43)";
const HUD_BORDER = "rgba(125, 211, 252, 0.32)";
const HUD_TEXT = "#f3f4f6";
const HUD_MUTED = "#aeb7c2";
const HUD_ACCENT = "#f0c84b";
const HUD_DANGER = "#df4f45";
const HUD_WARNING = "#fde68a";
const HUD_GOOD = "#7dd3fc";
const HUD_RED_KEY = "#ef4444";
const HUD_BLUE_KEY = "#60a5fa";
const HUD_YELLOW_KEY = "#facc15";
const HUD_KEY_NONE = "#475569";
const SWATCH_SIZE = 8;

export function renderHud(ctx: CanvasRenderingContext2D, canvasSize: GameCanvasSize, session: GameSession): void {
  const playerState = session.getPlayerState();
  const rows = hudRows(session.map.name, playerState);
  ctx.save();
  ctx.font = monoFont(700, HUD_FONT_SIZE);

  let width = HUD_PADDING_X * 2;
  for (const row of rows) {
    width = Math.max(width, Math.ceil(rowWidth(ctx, row) + HUD_PADDING_X * 2));
  }
  width = Math.min(width, canvasSize.width - HUD_MARGIN * 2);
  if (width <= HUD_PADDING_X * 2) {
    ctx.restore();
    return;
  }

  const height = rows.length * HUD_LINE_HEIGHT + (rows.length - 1) * HUD_ROW_GAP + HUD_PADDING_Y * 2;
  const x = HUD_MARGIN;
  const y = 0;

  ctx.fillStyle = HUD_BACKGROUND;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = HUD_BORDER;
  ctx.fillRect(x, y, 3, height);
  ctx.strokeStyle = HUD_BORDER;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]!;
    const lineY = y + HUD_PADDING_Y + rowIndex * (HUD_LINE_HEIGHT + HUD_ROW_GAP) + HUD_LINE_HEIGHT / 2;
    drawHudRow(ctx, row, x + HUD_PADDING_X, lineY, width - HUD_PADDING_X * 2);
  }

  ctx.restore();
}

type HudSegment = {
  readonly text: string;
  readonly color: string;
  readonly swatch?: string;
};

type HudRow = readonly HudSegment[];

function hudRows(mapName: string, playerState: PlayerState): readonly HudRow[] {
  const health = playerState.health;
  const ammo = playerState.ammo;
  const progress = playerState.progress;
  const codeText = playerState.hasUplinkCode ? "CODE OK" : "CODE -";

  return [
    [
      { text: mapName, color: HUD_ACCENT },
      { text: `HP ${health.current}/${health.max}`, color: healthColor(health.current, health.max) },
      { text: `W${playerState.selectedWeapon}`, color: HUD_TEXT },
      { text: `P${ammo.pistol}`, color: ammo.pistol === 0 ? HUD_MUTED : HUD_GOOD },
      { text: `C${ammo.cannon}`, color: ammo.cannon === 0 ? HUD_MUTED : HUD_GOOD },
      ...keySegments(playerState.heldKeys),
    ],
    [
      { text: `CR ${progress.credits}`, color: progress.credits === 0 ? HUD_MUTED : HUD_TEXT },
      { text: `SC ${progress.score}`, color: progress.score === 0 ? HUD_MUTED : HUD_TEXT },
      { text: `XP ${progress.xp}`, color: progress.xp === 0 ? HUD_MUTED : HUD_TEXT },
      { text: codeText, color: playerState.hasUplinkCode ? HUD_GOOD : HUD_MUTED },
    ],
  ];
}

function healthColor(current: number, max: number): string {
  if (current <= Math.ceil(max * 0.3)) return HUD_DANGER;
  if (current <= Math.ceil(max * 0.6)) return HUD_WARNING;
  return HUD_TEXT;
}

function keySegments(keys: readonly string[]): readonly HudSegment[] {
  if (keys.length === 0) return [{ text: "KEY", color: HUD_MUTED, swatch: HUD_KEY_NONE }];
  return [
    { text: "KEY", color: HUD_MUTED },
    ...keys.map((key): HudSegment => ({ text: "", color: HUD_TEXT, swatch: keyColor(key) })),
  ];
}

function keyColor(key: string): string {
  switch (key) {
    case "red":
      return HUD_RED_KEY;
    case "blue":
      return HUD_BLUE_KEY;
    case "yellow":
      return HUD_YELLOW_KEY;
    default:
      return HUD_KEY_NONE;
  }
}

function rowWidth(ctx: CanvasRenderingContext2D, row: HudRow): number {
  let width = 0;
  for (let i = 0; i < row.length; i++) {
    if (i > 0) width += HUD_SEGMENT_GAP;
    width += segmentWidth(ctx, row[i]!);
  }
  return width;
}

function segmentWidth(ctx: CanvasRenderingContext2D, segment: HudSegment): number {
  const textWidth = segment.text === "" ? 0 : ctx.measureText(segment.text).width;
  return textWidth + (segment.swatch === undefined ? 0 : SWATCH_SIZE + (segment.text === "" ? 0 : 5));
}

function drawHudRow(
  ctx: CanvasRenderingContext2D,
  row: HudRow,
  x: number,
  y: number,
  maxWidth: number,
): void {
  let cursor = x;
  const right = x + maxWidth;
  for (let i = 0; i < row.length; i++) {
    if (i > 0) cursor += HUD_SEGMENT_GAP;
    const segment = row[i]!;
    if (cursor >= right) return;

    ctx.fillStyle = segment.color;
    if (segment.text !== "") {
      ctx.fillText(segment.text, cursor, y);
      cursor += ctx.measureText(segment.text).width;
    }

    if (segment.swatch !== undefined) {
      if (segment.text !== "") cursor += 5;
      ctx.fillStyle = segment.swatch;
      ctx.fillRect(cursor, y - SWATCH_SIZE / 2, SWATCH_SIZE, SWATCH_SIZE);
      cursor += SWATCH_SIZE;
    }
  }
}
