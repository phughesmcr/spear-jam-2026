import { type AudioSettings, DEFAULT_AUDIO_SETTINGS } from "@/src/game/model/audio_settings.ts";
import type { PresentationViewScratch } from "@/src/game/model/presentation_state.ts";
import { DEFAULT_INTERACTIVE_FPS } from "@/src/game/model/render_settings.ts";
import type { GameMode, ViewMode } from "@/src/game/model/state.ts";
import type { PresentationContent, SimulationContent } from "@/src/game/content/catalog.ts";
import type { PresentationAssetView } from "@/src/game/presentation/asset_view.ts";
import type { GameCanvasSize } from "@/src/game/presentation/canvas_size.ts";
import type { FirstPersonRenderer } from "@/src/game/presentation/first_person/renderer.ts";
import type { GameFrameResult, GameRenderScratch, RenderSpy } from "@/src/game/presentation/frame_scratch.ts";
import { isShellMode, renderLayerPolicy } from "@/src/game/presentation/mode_policy.ts";
import { renderOverlayPass } from "@/src/game/presentation/overlay_pass.ts";
import type { FrameRenderSession } from "@/src/game/presentation/session_view.ts";
import { renderSessionPass } from "@/src/game/presentation/session_pass.ts";
import { renderShellPass } from "@/src/game/presentation/shell_pass.ts";

const BACKGROUND_COLOR = "#101217";

export type { GameFrameResult } from "@/src/game/presentation/frame_scratch.ts";

export type FrameProps = {
  readonly ctx: CanvasRenderingContext2D;
  readonly canvasSize: GameCanvasSize;
  readonly scratch: GameRenderScratch;
  readonly assets: PresentationAssetView;
  readonly session?: FrameRenderSession;
  readonly mode?: GameMode;
  readonly presentation?: PresentationViewScratch;
  readonly viewMode?: ViewMode;
  readonly audio?: AudioSettings;
  readonly interactiveFps?: number;
  readonly firstPersonRenderer?: FirstPersonRenderer;
  readonly content?: PresentationContent;
  readonly simulationContent?: Pick<SimulationContent, "weapon">;
  readonly nowMs?: number;
  readonly spy?: RenderSpy;
};

export function renderGameFrame({
  ctx,
  canvasSize,
  scratch,
  assets,
  session,
  mode = { type: "loading", completed: 0, total: 0 },
  presentation = scratch.presentation,
  viewMode = "firstPerson",
  audio = DEFAULT_AUDIO_SETTINGS,
  interactiveFps = DEFAULT_INTERACTIVE_FPS,
  firstPersonRenderer,
  content,
  simulationContent,
  nowMs = 0,
  spy = scratch.spy,
}: FrameProps): GameFrameResult {
  const policy = renderLayerPolicy(mode, viewMode);
  const frameResult = scratch.frameResult;
  frameResult.needsFrame = false;
  frameResult.ambientOnly = false;

  if (!policy.opaqueFirstPerson) {
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
  }

  if (isShellMode(mode)) {
    return renderShellPass(ctx, canvasSize, assets.ui, mode, audio, interactiveFps, nowMs, spy);
  }

  if (session !== undefined) {
    if (content === undefined || simulationContent === undefined) {
      throw new Error("renderGameFrame requires bound presentation content for sessions.");
    }
    renderSessionPass(
      ctx,
      canvasSize,
      scratch,
      session,
      presentation,
      assets.ui,
      viewMode,
      firstPersonRenderer,
      content,
      simulationContent,
      nowMs,
      frameResult,
      spy,
    );
  }

  return renderOverlayPass(ctx, canvasSize, assets.ui, mode, presentation, nowMs, frameResult, spy);
}
