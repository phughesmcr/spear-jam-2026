import type { GameCanvasSize } from "@/src/render/canvas.ts";
import { drawTitleButton, type TitleButtonRect, type TitlePoint } from "@/src/render/title.ts";
import { monoFont } from "@/src/render/text.ts";

const SETTINGS_BACKGROUND = "rgba(0, 0, 0, 0.92)";
const SETTINGS_TITLE_COLOR = "#eafff4";
const SETTINGS_BODY_COLOR = "#9fd4b8";
const BACK_BUTTON_LABEL = "BACK";
const BACK_BUTTON_WIDTH_RATIO = 0.34;
const BACK_BUTTON_WIDTH_MIN = 140;
const BACK_BUTTON_WIDTH_MAX = 220;
const BACK_BUTTON_HEIGHT_RATIO = 0.075;
const BACK_BUTTON_HEIGHT_MIN = 44;
const BACK_BUTTON_HEIGHT_MAX = 56;

export function settingsBackButtonRect(canvasSize: GameCanvasSize): TitleButtonRect {
  const width = Math.min(
    BACK_BUTTON_WIDTH_MAX,
    Math.max(BACK_BUTTON_WIDTH_MIN, Math.round(canvasSize.width * BACK_BUTTON_WIDTH_RATIO)),
  );
  const height = Math.min(
    BACK_BUTTON_HEIGHT_MAX,
    Math.max(BACK_BUTTON_HEIGHT_MIN, Math.round(canvasSize.height * BACK_BUTTON_HEIGHT_RATIO)),
  );
  return {
    x: Math.round((canvasSize.width - width) / 2),
    y: Math.round(canvasSize.height * 0.78 - height / 2),
    width,
    height,
  };
}

export function settingsBackButtonHit(canvasSize: GameCanvasSize, point: TitlePoint): boolean {
  const rect = settingsBackButtonRect(canvasSize);
  return point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y &&
    point.y < rect.y + rect.height;
}

export function renderSettings(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  nowMs = 0,
): void {
  const backButton = settingsBackButtonRect(canvasSize);
  const titleSize = Math.min(36, Math.max(22, Math.round(canvasSize.width * 0.07)));
  const bodySize = Math.min(18, Math.max(12, Math.round(canvasSize.width * 0.035)));
  const centerX = canvasSize.width / 2;
  const centerY = canvasSize.height / 2;

  ctx.save();
  ctx.fillStyle = SETTINGS_BACKGROUND;
  ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

  ctx.font = monoFont(700, titleSize);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = SETTINGS_TITLE_COLOR;
  ctx.fillText("SETTINGS", centerX, centerY - bodySize * 2.2);

  ctx.font = monoFont(400, bodySize);
  ctx.fillStyle = SETTINGS_BODY_COLOR;
  ctx.fillText("Nothing to configure yet.", centerX, centerY - bodySize * 0.2);

  drawTitleButton(ctx, backButton, BACK_BUTTON_LABEL, nowMs);
  ctx.restore();
}
