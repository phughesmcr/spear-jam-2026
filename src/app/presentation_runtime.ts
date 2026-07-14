import { fillPresentationView } from "@/src/game/model/presentation_state.ts";
import {
  AMBIENT_FPS,
  clampInteractiveFps,
  DEFAULT_INTERACTIVE_FPS,
  frameMsForFps,
} from "@/src/game/model/render_settings.ts";
import type { GameModel } from "@/src/game/model/transition/mod.ts";
import { DEFAULT_GAME_CANVAS_SIZE, type GameCanvasSize } from "@/src/game/presentation/canvas_size.ts";
import { createFirstPersonRenderer, type FirstPersonRenderer } from "@/src/game/presentation/first_person/renderer.ts";
import { createGameRenderScratch } from "@/src/game/presentation/frame_scratch.ts";
import {
  preloadGameAssets,
  warmDeferredAssets,
  warmMapAssets,
  warmShellAssets,
} from "@/src/game/presentation/preload.ts";
import { renderGameFrame } from "@/src/game/presentation/render.ts";
import type { FrameRenderSession } from "@/src/game/presentation/session_view.ts";

const AMBIENT_FRAME_MS = frameMsForFps(AMBIENT_FPS);

export type PresentationRuntimeSpec = {
  readonly host: Window;
  readonly document: Document;
  readonly ctx: CanvasRenderingContext2D;
  readonly signal: AbortSignal;
  readonly getModel: () => GameModel;
  readonly getSession: () => FrameRenderSession | undefined;
  readonly tickSession: (modeType: GameModel["mode"]["type"], nowMs: number) => { readonly needsFrame: boolean };
  readonly onError: (error: unknown) => void;
  readonly firstPersonRenderer?: FirstPersonRenderer;
  readonly onLoadingProgress?: (loaded: number, total: number) => void;
};

export interface PresentationRuntime extends Disposable {
  readonly canvasSize: GameCanvasSize;
  start(): void;
  resize(size: GameCanvasSize): void;
  renderNow(): void;
  preloadAssets(mapName: string): Promise<void>;
  warmShellAssets(): void;
  warmMapAssets(mapName: string): void;
  warmDeferredAssets(mapName: string): void;
  resetFirstPerson(): void;
  bumpFirstPerson(dx: number, dy: number, nowMs: number): void;
}

export function createPresentationRuntime(spec: PresentationRuntimeSpec): PresentationRuntime {
  return new Runtime(spec);
}

class Runtime implements PresentationRuntime {
  private readonly spec: PresentationRuntimeSpec;
  private readonly firstPersonRenderer: FirstPersonRenderer;
  private readonly renderScratch = createGameRenderScratch();
  private currentCanvasSize: GameCanvasSize = DEFAULT_GAME_CANVAS_SIZE;
  private started = false;
  private animationFrameId?: number;
  private lastRenderMs = Number.NEGATIVE_INFINITY;
  private wantsFrame = false;
  private ambientOnly = false;
  private interactiveFrameMs = frameMsForFps(DEFAULT_INTERACTIVE_FPS);
  private readonly runAnimationFrame = (nowMs: number): void => {
    this.animationFrameId = undefined;
    const elapsed = nowMs - this.lastRenderMs;
    const budgetMs = this.ambientOnly ? AMBIENT_FRAME_MS : this.interactiveFrameMs;
    if (elapsed >= 0 && elapsed < budgetMs) {
      if (this.wantsFrame) this.requestNextFrame();
      return;
    }
    this.updateAndRender(nowMs);
  };
  private readonly renderLoadedAssets = (): void => {
    if (this.started) this.renderNow();
  };

  constructor(spec: PresentationRuntimeSpec) {
    this.spec = spec;
    this.firstPersonRenderer = spec.firstPersonRenderer ?? createFirstPersonRenderer();
  }

  get canvasSize(): GameCanvasSize {
    return this.currentCanvasSize;
  }

  start(): void {
    this.started = true;
  }

  resize(size: GameCanvasSize): void {
    this.currentCanvasSize = size;
    if (this.started) this.renderNow();
  }

  renderNow(): void {
    if (!this.started || this.spec.signal.aborted) return;
    this.cancelPendingFrame();
    this.updateAndRender(performance.now());
  }

  async preloadAssets(mapName: string): Promise<void> {
    await preloadGameAssets(this.spec.document, this.firstPersonRenderer, {
      mapName,
      onAssetLoad: this.renderLoadedAssets,
      onProgress: (progress) => this.spec.onLoadingProgress?.(progress.loaded, progress.total),
    });
  }

  warmShellAssets(): void {
    warmShellAssets(this.spec.document, this.spec.onError, this.renderLoadedAssets);
  }

  warmMapAssets(mapName: string): void {
    warmMapAssets(
      this.spec.document,
      this.firstPersonRenderer,
      mapName,
      this.spec.onError,
      this.renderLoadedAssets,
    );
  }

  warmDeferredAssets(mapName: string): void {
    warmDeferredAssets(
      this.spec.document,
      this.firstPersonRenderer,
      mapName,
      this.spec.onError,
      this.renderLoadedAssets,
    );
  }

  resetFirstPerson(): void {
    this.firstPersonRenderer.reset();
  }

  bumpFirstPerson(dx: number, dy: number, nowMs: number): void {
    this.firstPersonRenderer.bump(dx, dy, nowMs);
  }

  [Symbol.dispose](): void {
    this.cancelPendingFrame();
  }

  private updateAndRender(nowMs: number): void {
    if (!this.started || this.spec.signal.aborted) return;

    const model = this.spec.getModel();
    this.interactiveFrameMs = frameMsForFps(clampInteractiveFps(model.interactiveFps));
    const session = this.spec.getSession();
    const tickResult = this.spec.tickSession(model.mode.type, nowMs);
    fillPresentationView(model.presentation, nowMs, this.renderScratch.presentation);
    const renderResult = renderGameFrame({
      ctx: this.spec.ctx,
      canvasSize: this.currentCanvasSize,
      scratch: this.renderScratch,
      session,
      mode: model.mode,
      presentation: this.renderScratch.presentation,
      viewMode: model.viewMode,
      audio: model.audio,
      interactiveFps: model.interactiveFps,
      firstPersonRenderer: this.firstPersonRenderer,
      nowMs,
    });
    this.lastRenderMs = nowMs;
    this.wantsFrame = tickResult.needsFrame || this.renderScratch.presentation.needsFrame || renderResult.needsFrame;
    this.ambientOnly = this.wantsFrame && !tickResult.needsFrame && !this.renderScratch.presentation.needsFrame &&
      renderResult.ambientOnly === true;
    this.setFrameNeeded(this.wantsFrame);
  }

  private setFrameNeeded(needsFrame: boolean): void {
    if (needsFrame) {
      this.requestNextFrame();
      return;
    }
    this.cancelPendingFrame();
  }

  private requestNextFrame(): void {
    if (this.animationFrameId !== undefined || this.spec.signal.aborted || !this.started) return;
    this.animationFrameId = this.spec.host.requestAnimationFrame(this.runAnimationFrame);
  }

  private cancelPendingFrame(): void {
    if (this.animationFrameId === undefined) return;
    this.spec.host.cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = undefined;
  }
}
