import { type AudioSettings, DEFAULT_AUDIO_SETTINGS } from "@/src/game/model/audio_settings.ts";
import type { PresentationViewScratch } from "@/src/game/model/presentation_state.ts";
import { DEFAULT_INTERACTIVE_FPS } from "@/src/game/model/render_settings.ts";
import type { FrameRenderSession } from "@/src/game/presentation/session_view.ts";
import type { GameMode, ViewMode } from "@/src/game/model/state.ts";
import { playerWeaponSpec } from "@/src/game/content/weapons.ts";
import { getMap } from "@/src/game/world/campaign.ts";
import type { GameCanvasSize } from "@/src/game/presentation/canvas_size.ts";
import {
  preloadCombatFeedbackAssets,
  renderCombatFeedback,
  renderFirstPersonCombatFeedback,
} from "@/src/game/presentation/ui/combat_feedback.ts";
import { preloadDialogueAssets, preloadSpearRevealAsset, renderDialogue } from "@/src/game/presentation/ui/dialogue.ts";
import { renderDrawableEntities } from "@/src/game/presentation/top_down/drawables.ts";
import type { FirstPersonFrameScratch, FirstPersonRenderer } from "@/src/game/presentation/first_person/renderer.ts";
import { preloadHelpAssets, renderHelp } from "@/src/game/presentation/ui/help.ts";
import { preloadHudAssets, renderFirstPersonHud, renderHud } from "@/src/game/presentation/ui/hud.ts";
import { preloadIntermissionAssets, renderIntermission } from "@/src/game/presentation/ui/intermission.ts";
import { renderMap } from "@/src/game/presentation/top_down/map.ts";
import { renderMessageLog } from "@/src/game/presentation/ui/messages.ts";
import { renderLayerPolicy } from "@/src/game/presentation/mode_policy.ts";
import {
  criticalSpriteIdsForMap,
  mapNeedsDialogueAssets,
  mapNeedsSpearRevealAsset,
} from "@/src/game/presentation/preload.ts";
import type { GameFrameResultScratch, GameRenderScratch, RenderSpy } from "@/src/game/presentation/frame_scratch.ts";
import { renderSettings } from "@/src/game/presentation/ui/settings.ts";
import { monoFont } from "@/src/game/presentation/ui/text.ts";
import { preloadTitleAssets, renderTitle } from "@/src/game/presentation/ui/title.ts";
import { preloadVerbMenuAssets, renderVerbMenu } from "@/src/game/presentation/ui/verb_menu.ts";
import { preloadWeaponHudAssets, renderWeaponHud } from "@/src/game/presentation/ui/weapon_hud.ts";

const BACKGROUND_COLOR = "#101217";
const OVERLAY_COLOR = "rgba(0, 0, 0, 0.6)";
const OVERLAY_TITLE_COLOR = "#f3f4f6";
const OVERLAY_SUBTITLE_COLOR = "#c9d1d9";
export type GameFrameResult = {
  readonly needsFrame: boolean;
  /** True when the only continuous demand is ambient first-person animation. */
  readonly ambientOnly?: boolean;
};

export type FrameProps = {
  readonly ctx: CanvasRenderingContext2D;
  readonly canvasSize: GameCanvasSize;
  readonly scratch: GameRenderScratch;
  readonly session?: FrameRenderSession;
  readonly mode?: GameMode;
  readonly presentation?: PresentationViewScratch;
  readonly viewMode?: ViewMode;
  readonly audio?: AudioSettings;
  readonly interactiveFps?: number;
  readonly firstPersonRenderer?: FirstPersonRenderer;
  readonly nowMs?: number;
  readonly spy?: RenderSpy;
};

type VignetteCache = {
  width: number;
  height: number;
  canvas: OffscreenCanvas;
  ctor: typeof OffscreenCanvas;
};

let vignetteCache: VignetteCache | undefined;

export type PreloadProgress = {
  readonly loaded: number;
  readonly total: number;
};

export type PreloadGameAssetsOptions = {
  readonly mapName: string;
  readonly onProgress?: (progress: PreloadProgress) => void;
  readonly onAssetLoad?: () => void;
};

export async function preloadGameAssets(
  document: Document,
  firstPersonRenderer: FirstPersonRenderer,
  options: PreloadGameAssetsOptions,
): Promise<void> {
  const map = getMap(options.mapName);
  const spriteIds = criticalSpriteIdsForMap(map);
  const jobs: Array<(onAssetLoad?: () => void) => Promise<void>> = [
    (onAssetLoad) => firstPersonRenderer.preloadMapAssets(document, map, spriteIds, onAssetLoad),
    (onAssetLoad) => preloadVerbMenuAssets(document, onAssetLoad),
    (onAssetLoad) => preloadWeaponHudAssets(document, onAssetLoad),
    (onAssetLoad) => preloadHudAssets(document, onAssetLoad),
    (onAssetLoad) => preloadCombatFeedbackAssets(document, onAssetLoad),
  ];
  if (mapNeedsDialogueAssets(map)) {
    jobs.push((onAssetLoad) => preloadDialogueAssets(document, onAssetLoad));
  }
  if (mapNeedsSpearRevealAsset(map)) {
    jobs.push((onAssetLoad) => preloadSpearRevealAsset(document, onAssetLoad));
  }

  // Approximate progress by job completion; image-level callbacks still drive re-renders.
  let completed = 0;
  const total = jobs.length;
  const report = (): void => {
    options.onProgress?.({ loaded: completed, total });
  };
  report();

  await Promise.all(jobs.map(async (job) => {
    await job(options.onAssetLoad);
    completed += 1;
    report();
  }));
}

/** Non-blocking warm of shell art shared by every boot path. */
export function warmShellAssets(
  document: Document,
  onError: (error: unknown) => void,
  onAssetLoad?: () => void,
): void {
  scheduleIdle(
    async () => {
      await Promise.all([
        preloadTitleAssets(document, onAssetLoad),
        preloadHelpAssets(document, onAssetLoad),
      ]);
    },
    onError,
  );
}

/** Non-blocking warm of map-critical assets. */
export function warmMapAssets(
  document: Document,
  firstPersonRenderer: FirstPersonRenderer,
  mapName: string,
  onError: (error: unknown) => void,
  onAssetLoad?: () => void,
): void {
  scheduleIdle(
    async () => {
      await preloadGameAssets(document, firstPersonRenderer, { mapName, onAssetLoad });
    },
    onError,
  );
}

/** After playing starts, warm deferred first-person sprites and ending art. */
export function warmDeferredAssets(
  document: Document,
  firstPersonRenderer: FirstPersonRenderer,
  mapName: string,
  onError: (error: unknown) => void,
  onAssetLoad?: () => void,
): void {
  scheduleIdle(
    async () => {
      const map = getMap(mapName);
      const jobs = [
        firstPersonRenderer.warmRemainingAssets(document, onAssetLoad),
        preloadIntermissionAssets(document, onAssetLoad),
      ];
      if (!mapNeedsDialogueAssets(map)) jobs.push(preloadDialogueAssets(document, onAssetLoad));
      if (!mapNeedsSpearRevealAsset(map)) jobs.push(preloadSpearRevealAsset(document, onAssetLoad));
      await Promise.all(jobs);
    },
    onError,
  );
}

function scheduleIdle(work: () => Promise<void>, onError: (error: unknown) => void): void {
  const run = (): void => {
    void work().catch(onError);
  };
  const ric = globalThis.requestIdleCallback as ((cb: () => void) => number) | undefined;
  if (typeof ric === "function") {
    ric(run);
    return;
  }
  globalThis.setTimeout(run, 0);
}

export function renderGameFrame({
  ctx,
  canvasSize,
  scratch,
  session,
  mode = { type: "loading", loaded: 0, total: 0 },
  presentation = scratch.presentation,
  viewMode = "firstPerson",
  audio = DEFAULT_AUDIO_SETTINGS,
  interactiveFps = DEFAULT_INTERACTIVE_FPS,
  firstPersonRenderer,
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

  if (session !== undefined && policy.renderSession) {
    spy.sessionRenderCount++;
    renderSessionFrame({
      ctx,
      canvasSize,
      scratch,
      session,
      presentation,
      viewMode,
      firstPersonRenderer,
      firstPersonFrame: scratch.firstPersonFrame,
      nowMs,
      frameResult,
    });
  }

  if (policy.renderMessageLog) {
    spy.messageLogRenderCount++;
    renderMessageLog(ctx, canvasSize, presentation);
  }

  switch (mode.type) {
    case "title":
      renderTitle(ctx, canvasSize, mode.intent, nowMs, mode.hoverButton, spy);
      frameResult.needsFrame = true;
      return frameResultFromScratch(frameResult);
    case "settings":
      renderSettings(ctx, canvasSize, { audio, interactiveFps }, nowMs);
      frameResult.needsFrame = true;
      return frameResultFromScratch(frameResult);
    case "loading": {
      const subtitle = mode.total > 0 ? `${mode.loaded}/${mode.total}` : undefined;
      renderOverlay(ctx, canvasSize, "LOADING", subtitle);
      return { needsFrame: false };
    }
    case "paused":
      renderOverlay(ctx, canvasSize, "PAUSED", "P to resume");
      return { needsFrame: false };
    case "help":
      renderHelp(ctx, canvasSize);
      return { needsFrame: false };
    case "dialogue":
      renderDialogue(ctx, canvasSize, mode);
      return { needsFrame: false };
    case "intermission":
      renderIntermission(ctx, canvasSize, mode, nowMs, spy);
      frameResult.needsFrame = true;
      return frameResultFromScratch(frameResult);
    case "defeat":
      renderOverlay(ctx, canvasSize, "DEFEAT", "Space to retry level");
      return { needsFrame: false };
    case "victoryTransition":
      renderVictoryFade(ctx, canvasSize, mode.fadeStartsAtMs, mode.completesAtMs, nowMs);
      frameResult.needsFrame = true;
      frameResult.ambientOnly = false;
      return frameResultFromScratch(frameResult);
    case "error":
      renderOverlay(ctx, canvasSize, "LOAD FAILED", mode.message);
      return { needsFrame: false };
    case "verbMenu":
      renderVerbMenu(ctx, canvasSize, mode.selectedIndex, mode.hoverTarget);
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

function renderSessionFrame(input: {
  readonly ctx: CanvasRenderingContext2D;
  readonly canvasSize: GameCanvasSize;
  readonly scratch: GameRenderScratch;
  readonly session: FrameRenderSession;
  readonly presentation: PresentationViewScratch;
  readonly viewMode: ViewMode;
  readonly firstPersonRenderer?: FirstPersonRenderer;
  readonly firstPersonFrame?: FirstPersonFrameScratch;
  readonly nowMs: number;
  readonly frameResult: GameFrameResultScratch;
}): void {
  const {
    ctx,
    canvasSize,
    scratch,
    session,
    presentation,
    viewMode,
    firstPersonRenderer,
    firstPersonFrame,
    nowMs,
    frameResult,
  } = input;
  const map = session.getMap();
  if (viewMode === "firstPerson") {
    if (firstPersonRenderer === undefined || firstPersonFrame === undefined) {
      throw new Error("renderGameFrame requires a first-person renderer and frame scratch for first-person sessions.");
    }
    const playRect = scratch.playRect;
    playRect.x = 0;
    playRect.y = 0;
    playRect.width = canvasSize.width;
    playRect.height = canvasSize.height;
    const playerStatus = session.getPlayerStatus();
    firstPersonRenderer.render(
      ctx,
      playRect,
      session,
      nowMs,
      firstPersonFrame,
      playerWeaponSpec(playerStatus.selectedWeapon).range,
    );
    frameResult.needsFrame ||= firstPersonFrame.needsFrame;
    frameResult.ambientOnly = firstPersonFrame.ambientOnly;
    renderFirstPersonVignette(ctx, playRect);
    renderWeaponHud(ctx, canvasSize, playerStatus.selectedWeapon, presentation.weaponHudPhase);
    renderFirstPersonHud(
      ctx,
      canvasSize,
      playerStatus,
      { showKeys: presentation.showKeys, compassAngle: firstPersonFrame.cameraAngle },
    );
    renderFirstPersonCombatFeedback(ctx, canvasSize, presentation.combatFeedback);
    return;
  }

  renderMap(ctx, canvasSize, map, session.getVisibility(), scratch.mapMetrics);
  renderDrawableEntities(ctx, session, scratch.mapMetrics);
  renderCombatFeedback(ctx, scratch.mapMetrics, presentation.combatFeedback);
  renderHud(ctx, canvasSize, session);
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

function renderOverlay(
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
  ctx.font = monoFont(700, titleSize);
  ctx.fillStyle = OVERLAY_TITLE_COLOR;
  ctx.fillText(title, centerX, centerY - subtitleSize);

  if (subtitle) {
    ctx.font = monoFont(400, subtitleSize);
    ctx.fillStyle = OVERLAY_SUBTITLE_COLOR;
    ctx.fillText(subtitle, centerX, centerY + titleSize * 0.75);
  }
  ctx.restore();
}

function renderFirstPersonVignette(
  ctx: CanvasRenderingContext2D,
  rect: { readonly width: number; readonly height: number; readonly x: number; readonly y: number },
): void {
  const canvas = vignetteCanvasFor(rect.width, rect.height);
  if (canvas === undefined) {
    paintVignette(ctx, 0, 0, rect.width, rect.height);
    return;
  }
  ctx.drawImage(canvas, rect.x, rect.y);
}

function vignetteCanvasFor(width: number, height: number): OffscreenCanvas | undefined {
  const ctor = globalThis.OffscreenCanvas;
  if (
    vignetteCache !== undefined &&
    vignetteCache.width === width &&
    vignetteCache.height === height &&
    vignetteCache.ctor === ctor
  ) {
    return vignetteCache.canvas;
  }
  const canvas = new ctor(width, height);
  const context = canvas.getContext("2d");
  if (context === null) return undefined;
  paintVignette(context, 0, 0, width, height);
  vignetteCache = { width, height, canvas, ctor };
  return canvas;
}

function paintVignette(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const centerX = x + width / 2;
  const centerY = y + height * 0.54;
  const cornerRadius = Math.hypot(width / 2, Math.max(centerY - y, y + height - centerY));
  const innerRadius = Math.min(width, height) * 0.28;
  const gradient = ctx.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, cornerRadius);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(0.42, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(0.72, "rgba(0, 0, 0, 0.32)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.78)");
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, width, height);
}
