import type { GameCanvasSize } from "@/src/render/canvas.ts";

const OVERLAY_COLOR = "rgba(0, 0, 0, 0.6)";
const OVERLAY_TITLE_COLOR = "#f3f4f6";
const OVERLAY_SUBTITLE_COLOR = "#c9d1d9";

export function renderOverlay(
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
