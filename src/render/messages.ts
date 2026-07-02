import type { GameCanvasSize } from "@/src/render/canvas.ts";
import { fitText, monoFont } from "@/src/render/text.ts";

const LOG_MARGIN = 12;
const LOG_PADDING = 10;
const LOG_WIDTH = 520;
const LOG_FONT_SIZE = 14;
const LOG_LINE_HEIGHT = 18;
const LOG_BACKGROUND = "rgba(0, 0, 0, 0.58)";
const LOG_TEXT = "#f3f4f6";

export function renderMessageLog(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  messages: readonly string[],
): void {
  if (messages.length === 0) return;

  const width = Math.min(LOG_WIDTH, canvasSize.width - LOG_MARGIN * 2);
  if (width <= LOG_PADDING * 2) return;

  const height = messages.length * LOG_LINE_HEIGHT + LOG_PADDING * 2;
  const x = LOG_MARGIN;
  const y = canvasSize.height - height - LOG_MARGIN;

  ctx.save();
  ctx.fillStyle = LOG_BACKGROUND;
  ctx.fillRect(x, y, width, height);
  ctx.font = monoFont(400, LOG_FONT_SIZE);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = LOG_TEXT;

  const maxTextWidth = width - LOG_PADDING * 2;
  for (let i = 0; i < messages.length; i++) {
    const lineY = y + LOG_PADDING + LOG_LINE_HEIGHT * i + LOG_LINE_HEIGHT / 2;
    ctx.fillText(fitText(ctx, messages[i]!, maxTextWidth), x + LOG_PADDING, lineY);
  }

  ctx.restore();
}
