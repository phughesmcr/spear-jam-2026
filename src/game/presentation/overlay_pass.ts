import type { PresentationViewScratch } from "@/src/game/model/presentation_state.ts";
import type { GameCanvasSize } from "@/src/game/presentation/canvas_size.ts";
import type { PresentationUiAssets } from "@/src/game/presentation/asset_view.ts";
import type { GameFrameResult, GameFrameResultScratch, RenderSpy } from "@/src/game/presentation/frame_scratch.ts";
import type { OverlayMode } from "@/src/game/presentation/mode_policy.ts";
import { renderDialogue } from "@/src/game/presentation/ui/dialogue.ts";
import { renderHelp } from "@/src/game/presentation/ui/help.ts";
import { renderMessageLog } from "@/src/game/presentation/ui/messages.ts";
import { renderStatusOverlay } from "@/src/game/presentation/ui/status_overlay.ts";
import { renderVerbMenu } from "@/src/game/presentation/ui/verb_menu.ts";

export function renderOverlayPass(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  assets: PresentationUiAssets,
  mode: OverlayMode,
  presentation: PresentationViewScratch,
  nowMs: number,
  frameResult: GameFrameResultScratch,
  spy: RenderSpy,
): GameFrameResult {
  spy.messageLogRenderCount++;
  renderMessageLog(ctx, canvasSize, presentation);

  switch (mode.type) {
    case "paused":
      renderStatusOverlay(ctx, canvasSize, "PAUSED", "P to resume");
      return { needsFrame: false };
    case "help":
      renderHelp(ctx, canvasSize, assets.help);
      return { needsFrame: false };
    case "dialogue":
      renderDialogue(ctx, canvasSize, assets.dialogue, mode);
      return { needsFrame: false };
    case "defeat":
      renderStatusOverlay(ctx, canvasSize, "DEFEAT", "Space to retry level");
      return { needsFrame: false };
    case "victoryTransition":
      renderVictoryFade(ctx, canvasSize, mode.fadeStartsAtMs, mode.completesAtMs, nowMs);
      return { needsFrame: true, ambientOnly: false };
    case "error":
      renderStatusOverlay(ctx, canvasSize, "LOAD FAILED", mode.message);
      return { needsFrame: false };
    case "verbMenu":
      renderVerbMenu(ctx, canvasSize, assets.verbMenu, mode.selectedIndex, mode.hoverTarget);
      return finalizePlayingFrame(frameResult, presentation);
    case "playing":
      return finalizePlayingFrame(frameResult, presentation);
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

function renderVictoryFade(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  fadeStartsAtMs: number,
  completesAtMs: number,
  nowMs: number,
): void {
  const fadeMs = completesAtMs - fadeStartsAtMs;
  const opacity = Math.max(0, Math.min(1, (nowMs - fadeStartsAtMs) / fadeMs));
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
  ctx.restore();
}

function finalizePlayingFrame(
  frameResult: GameFrameResultScratch,
  presentation: PresentationViewScratch,
): GameFrameResult {
  frameResult.needsFrame ||= presentation.needsFrame;
  if (frameResult.needsFrame && frameResult.ambientOnly && presentation.needsFrame) {
    frameResult.ambientOnly = false;
  }
  return frameResultFromScratch(frameResult);
}

function frameResultFromScratch(frameResult: GameFrameResultScratch): GameFrameResult {
  if (!frameResult.needsFrame) return { needsFrame: false };
  return frameResult.ambientOnly ? { needsFrame: true, ambientOnly: true } : { needsFrame: true, ambientOnly: false };
}
