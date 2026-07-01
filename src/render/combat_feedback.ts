import type { CombatFeedback, CombatFeedbackTone } from "@/src/game/combat_feedback.ts";
import type { MapRenderMetrics } from "@/src/render/map.ts";

const MAX_FEEDBACK = 4;
const FEEDBACK_FONT_SIZE = 13;
const FEEDBACK_PADDING_X = 8;
const FEEDBACK_HEIGHT = 20;
const FEEDBACK_GAP = 6;
const FEEDBACK_BACKGROUND = "rgba(0, 0, 0, 0.55)";
const FEEDBACK_TEXT: Record<CombatFeedbackTone, string> = {
  hit: "#fde68a",
  crit: "#f97316",
  miss: "#cbd5e1",
  hurt: "#fca5a5",
  defeat: "#a7f3d0",
};

export function renderCombatFeedback(
  ctx: CanvasRenderingContext2D,
  metrics: MapRenderMetrics,
  feedback: readonly CombatFeedback[],
): void {
  if (feedback.length === 0) return;

  const entries = feedback.slice(-MAX_FEEDBACK);
  const mapLeft = metrics.offsetX;
  const mapRight = metrics.offsetX + metrics.mapWidth * metrics.tileSize;
  const y = metrics.offsetY + metrics.mapHeight * metrics.tileSize + FEEDBACK_GAP;

  ctx.save();
  ctx.font = `700 ${FEEDBACK_FONT_SIZE}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let x = mapLeft;
  for (const entry of entries) {
    const width = Math.ceil(ctx.measureText(entry.text).width + FEEDBACK_PADDING_X * 2);
    if (x + width > mapRight) break;

    ctx.fillStyle = FEEDBACK_BACKGROUND;
    ctx.fillRect(x, y, width, FEEDBACK_HEIGHT);
    ctx.fillStyle = FEEDBACK_TEXT[entry.tone];
    ctx.fillText(entry.text, x + width / 2, y + FEEDBACK_HEIGHT / 2 + 0.5);
    x += width + FEEDBACK_GAP;
  }

  ctx.restore();
}
