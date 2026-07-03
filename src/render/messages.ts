import type { GameCanvasSize } from "@/src/render/canvas.ts";
import { fitText, monoFont } from "@/src/render/text.ts";

const LOG_MARGIN = 12;
const LOG_PADDING_X = 12;
const LOG_PADDING_Y = 5;
const LOG_FONT_SIZE = 13;
const LOG_LINE_HEIGHT = 16;
const LOG_BACKGROUND = "rgba(3, 6, 10, 0.66)";
const LOG_BORDER = "rgba(148, 163, 184, 0.28)";
const LOG_TEXT = "#f3f4f6";
const MAX_VISIBLE_LOG_LINES = 4;

export function renderMessageLog(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  messages: readonly string[],
  bandTop?: number,
): void {
  if (messages.length === 0) return;
  const visibleMessages = visibleMessageLogLines(messages);

  const width = canvasSize.width - LOG_MARGIN * 2;
  if (width <= LOG_PADDING_X * 2) return;

  const height = visibleMessages.length * LOG_LINE_HEIGHT + LOG_PADDING_Y * 2;
  const x = LOG_MARGIN;
  const y = messageLogY(canvasSize.height, height, bandTop);

  ctx.save();
  ctx.fillStyle = LOG_BACKGROUND;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = LOG_BORDER;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  ctx.font = monoFont(400, LOG_FONT_SIZE);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = LOG_TEXT;

  const maxTextWidth = width - LOG_PADDING_X * 2;
  for (let i = 0; i < visibleMessages.length; i++) {
    const lineY = y + LOG_PADDING_Y + LOG_LINE_HEIGHT * i + LOG_LINE_HEIGHT / 2;
    ctx.fillText(fitText(ctx, visibleMessages[i]!, maxTextWidth), x + LOG_PADDING_X, lineY);
  }

  ctx.restore();
}

export function visibleMessageLogLines(messages: readonly string[]): readonly string[] {
  return messages.slice(-MAX_VISIBLE_LOG_LINES);
}

export function messageLogY(canvasHeight: number, logHeight: number, bandTop?: number): number {
  if (bandTop === undefined) return canvasHeight - logHeight - LOG_MARGIN;

  const bandHeight = canvasHeight - bandTop;
  if (bandHeight <= logHeight) return bandTop;
  return bandTop + Math.floor((bandHeight - logHeight) / 2);
}
