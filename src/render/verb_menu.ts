import { VERBS } from "@/src/game/verbs.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";

const PANEL_MARGIN = 12;
const PANEL_WIDTH = 148;
const PANEL_PADDING = 10;
const TITLE_HEIGHT = 22;
const ITEM_HEIGHT = 28;
const PANEL_BACKGROUND = "rgba(6, 8, 13, 0.82)";
const PANEL_BORDER = "rgba(148, 163, 184, 0.65)";
const SELECTED_BACKGROUND = "rgba(34, 211, 238, 0.22)";
const SELECTED_BORDER = "#22d3ee";
const TEXT_COLOR = "#f8fafc";
const MUTED_TEXT_COLOR = "#94a3b8";

export function renderVerbMenu(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  selectedIndex: number,
): void {
  const width = Math.min(PANEL_WIDTH, canvasSize.width - PANEL_MARGIN * 2);
  const height = PANEL_PADDING * 2 + TITLE_HEIGHT + VERBS.length * ITEM_HEIGHT;
  const x = canvasSize.width - width - PANEL_MARGIN;
  const y = Math.max(PANEL_MARGIN, Math.round((canvasSize.height - height) * 0.36));

  ctx.save();
  ctx.fillStyle = PANEL_BACKGROUND;
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);

  ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = MUTED_TEXT_COLOR;
  ctx.fillText("VERB", x + PANEL_PADDING, y + PANEL_PADDING + TITLE_HEIGHT / 2);

  ctx.font = "700 14px ui-monospace, SFMono-Regular, Menlo, monospace";
  for (let i = 0; i < VERBS.length; i++) {
    const itemY = y + PANEL_PADDING + TITLE_HEIGHT + i * ITEM_HEIGHT;
    const selected = i === selectedIndex;
    if (selected) {
      ctx.fillStyle = SELECTED_BACKGROUND;
      ctx.strokeStyle = SELECTED_BORDER;
      ctx.fillRect(x + PANEL_PADDING - 4, itemY + 3, width - PANEL_PADDING * 2 + 8, ITEM_HEIGHT - 6);
      ctx.strokeRect(x + PANEL_PADDING - 3.5, itemY + 3.5, width - PANEL_PADDING * 2 + 7, ITEM_HEIGHT - 7);
    }

    ctx.fillStyle = selected ? TEXT_COLOR : MUTED_TEXT_COLOR;
    ctx.fillText(VERBS[i]!.label, x + PANEL_PADDING, itemY + ITEM_HEIGHT / 2);
  }

  ctx.restore();
}
