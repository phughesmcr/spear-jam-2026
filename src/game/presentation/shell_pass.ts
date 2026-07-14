import type { AudioSettings } from "@/src/game/model/audio_settings.ts";
import type { GameCanvasSize } from "@/src/game/presentation/canvas_size.ts";
import type { GameFrameResult, RenderSpy } from "@/src/game/presentation/frame_scratch.ts";
import type { ShellMode } from "@/src/game/presentation/mode_policy.ts";
import { renderIntermission } from "@/src/game/presentation/ui/intermission.ts";
import { renderSettings } from "@/src/game/presentation/ui/settings.ts";
import { renderStatusOverlay } from "@/src/game/presentation/ui/status_overlay.ts";
import { renderTitle } from "@/src/game/presentation/ui/title.ts";

export function renderShellPass(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  mode: ShellMode,
  audio: AudioSettings,
  interactiveFps: number,
  nowMs: number,
  spy: RenderSpy,
): GameFrameResult {
  switch (mode.type) {
    case "title":
      renderTitle(ctx, canvasSize, mode.intent, nowMs, mode.hoverButton, spy);
      return { needsFrame: true, ambientOnly: false };
    case "settings":
      renderSettings(ctx, canvasSize, { audio, interactiveFps }, nowMs);
      return { needsFrame: true, ambientOnly: false };
    case "loading": {
      const subtitle = mode.total > 0 ? `${mode.loaded}/${mode.total}` : undefined;
      renderStatusOverlay(ctx, canvasSize, "LOADING", subtitle);
      return { needsFrame: false };
    }
    case "intermission":
      renderIntermission(ctx, canvasSize, mode, nowMs, spy);
      return { needsFrame: true, ambientOnly: false };
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}
