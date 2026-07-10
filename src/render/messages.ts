import type { PresentationViewScratch } from "@/src/game/presentation.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";
import { fitText, monoFont } from "@/src/render/text.ts";

const LOG_MARGIN = 12;
const LOG_FONT_SIZE = 14;
const LOG_LINE_HEIGHT = 18;
const LOG_TEXT = "#f3f4f6";
const LOG_OLDER_TEXT = "#aeb7c2";
const LOG_SHADOW = "rgba(0, 0, 0, 0.86)";
const LOG_MAX_VISIBLE_LINES = 2;

export type MessageLogOptions = {
  readonly maxLines?: number;
};

export function renderMessageLog(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  presentation: PresentationViewScratch,
  options: MessageLogOptions = {},
): void {
  const messageCount = visibleMessageLogCount(presentation.messageCount, options.maxLines ?? LOG_MAX_VISIBLE_LINES);
  if (messageCount === 0) return;

  const maxTextWidth = canvasSize.width - LOG_MARGIN * 2;
  if (maxTextWidth <= 0) return;

  ctx.save();
  ctx.font = monoFont(700, LOG_FONT_SIZE);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  for (let i = 0; i < messageCount; i++) {
    const sourceIndex = presentation.messageCount - 1 - i;
    const lineY = messageLogLineY(i);
    const text = fitText(ctx, presentation.messages[sourceIndex]!, maxTextWidth);
    ctx.fillStyle = LOG_SHADOW;
    ctx.fillText(text, LOG_MARGIN + 1, lineY + 1);
    ctx.fillStyle = messageLogTextColor(i, messageCount);
    ctx.fillText(text, LOG_MARGIN, lineY);
  }

  ctx.restore();
}

function visibleMessageLogCount(messageCount: number, maxLines: number): number {
  if (maxLines <= 0 || messageCount <= 0) return 0;
  return Math.min(messageCount, maxLines);
}

export function visibleMessageLogLines(messages: readonly string[], maxLines?: number): readonly string[] {
  const limit = maxLines ?? LOG_MAX_VISIBLE_LINES;
  if (limit <= 0) return [];
  const lines = messages.slice(-limit);
  lines.reverse();
  return lines;
}

export function messageLogLineY(lineIndex: number): number {
  if (lineIndex <= 0) return LOG_MARGIN + LOG_LINE_HEIGHT / 2 + 2;
  return messageLogLineY(0) + LOG_LINE_HEIGHT * lineIndex;
}

export function messageLogTextColor(lineIndex: number, lineCount: number): string {
  if (lineCount <= 1 || lineIndex === 0) return LOG_TEXT;
  return LOG_OLDER_TEXT;
}
