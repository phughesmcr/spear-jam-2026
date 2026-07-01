import type { GameSession } from "@/src/ecs/session.ts";
import type { GameMode } from "@/src/game/state.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";
import { renderDrawableEntities } from "@/src/render/drawables.ts";
import { renderExits, renderMap } from "@/src/render/map.ts";
import { renderMessageLog } from "@/src/render/messages.ts";
import { renderOverlay } from "@/src/render/overlay.ts";

const BACKGROUND_COLOR = "#101217";

export function renderGameFrame(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  session?: GameSession,
  mode: GameMode = { type: "loading" },
  messages: readonly string[] = [],
): void {
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
  if (session) {
    const { map } = session;
    const metrics = renderMap(ctx, canvasSize, map);
    renderExits(ctx, map, metrics);
    renderDrawableEntities(ctx, session.world, metrics);
  }
  renderMessageLog(ctx, canvasSize, messages);
  switch (mode.type) {
    case "loading":
      renderOverlay(ctx, canvasSize, "LOADING");
      return;
    case "paused":
      renderOverlay(ctx, canvasSize, "PAUSED", "P to resume");
      return;
    case "menu":
      renderOverlay(ctx, canvasSize, "MENU", "Esc to resume");
      return;
    case "dialogue":
      renderOverlay(ctx, canvasSize, mode.title, mode.message);
      return;
    case "intermission":
      renderOverlay(ctx, canvasSize, "INTERMISSION", mode.message);
      return;
    case "victory":
      renderOverlay(ctx, canvasSize, "VICTORY", "Space to play again");
      return;
    case "defeat":
      renderOverlay(ctx, canvasSize, "DEFEAT", "Space to try again");
      return;
    case "error":
      renderOverlay(ctx, canvasSize, "LOAD FAILED", mode.message);
      return;
    case "playing":
      return;
  }
}
