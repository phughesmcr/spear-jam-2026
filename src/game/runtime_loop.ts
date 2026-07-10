import { type AudioRuntime, createAudioRuntime } from "@/src/audio/audio_runtime.ts";
import type { AudioSettings } from "@/src/game/audio_settings.ts";
import { fillPresentationView } from "@/src/game/presentation.ts";
import {
  AMBIENT_FPS,
  clampInteractiveFps,
  DEFAULT_INTERACTIVE_FPS,
  frameMsForFps,
} from "@/src/game/render_settings.ts";
import type { RuntimeSession } from "@/src/game/session_ports.ts";
import type { EnemyIdleSoundSource, SoundCue, SoundEmitterSnapshot } from "@/src/game/sound.ts";
import type { GameModel } from "@/src/game/transition.ts";
import { DEFAULT_GAME_CANVAS_SIZE, type GameCanvasSize } from "@/src/render/canvas.ts";
import { createFirstPersonRenderer, type FirstPersonRenderer } from "@/src/render/first_person.ts";
import { preloadGameAssets, renderGameFrame } from "@/src/render/game.ts";
import { createGameRenderScratch } from "@/src/render/render_scratch.ts";

/** Cap ambient-only animation (sky/bob/flicker) to match light rebuild rate. */
const AMBIENT_FRAME_MS = frameMsForFps(AMBIENT_FPS);

export type GameRuntimeLoopSpec = {
  readonly host: Window;
  readonly document: Document;
  readonly ctx: CanvasRenderingContext2D;
  readonly signal: AbortSignal;
  readonly getModel: () => GameModel;
  readonly getSession: () => RuntimeSession | undefined;
  readonly dependencies?: GameRuntimeLoopDependencies;
};

export type GameRuntimeLoopDependencies = {
  readonly audio?: AudioRuntime;
  readonly firstPersonRenderer?: FirstPersonRenderer;
};

export interface GameRuntimeLoop extends Disposable {
  readonly canvasSize: GameCanvasSize;
  start(): void;
  resize(size: GameCanvasSize): void;
  renderNow(): void;
  preloadAssets(): Promise<void>;
  resetFirstPerson(): void;
  bumpFirstPerson(dx: number, dy: number, nowMs: number): void;
  unlockAudio(): Promise<void>;
  setAudioVolumes(volumes: AudioSettings): void;
  updateAudioListener(): void;
  playCues(cues: readonly SoundCue[]): void;
  syncAudioWorld(): void;
  startMusic(): void;
}

export function createGameRuntimeLoop(spec: GameRuntimeLoopSpec): GameRuntimeLoop {
  return new RuntimeLoop(spec);
}

class RuntimeLoop implements GameRuntimeLoop {
  private readonly spec: GameRuntimeLoopSpec;
  private readonly audio: AudioRuntime;
  private readonly firstPersonRenderer: FirstPersonRenderer;
  private readonly renderScratch = createGameRenderScratch();
  private readonly soundEmitters: SoundEmitterSnapshot[] = [];
  private readonly enemyIdleSources: EnemyIdleSoundSource[] = [];
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
    // Skip work until the frame budget elapses. Negative elapsed means the
    // RAF clock and renderNow()'s performance.now() disagree (tests) — render.
    if (elapsed >= 0 && elapsed < budgetMs) {
      if (this.wantsFrame) this.requestNextFrame();
      return;
    }
    this.updateAndRender(nowMs);
  };
  private readonly renderLoadedAssets = (): void => {
    if (this.started) this.renderNow();
  };

  constructor(spec: GameRuntimeLoopSpec) {
    this.spec = spec;
    this.audio = spec.dependencies?.audio ?? createAudioRuntime(spec.host);
    this.firstPersonRenderer = spec.dependencies?.firstPersonRenderer ?? createFirstPersonRenderer();
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

  async preloadAssets(): Promise<void> {
    await preloadGameAssets(this.spec.document, this.firstPersonRenderer, this.renderLoadedAssets);
  }

  resetFirstPerson(): void {
    this.firstPersonRenderer.reset();
  }

  bumpFirstPerson(dx: number, dy: number, nowMs: number): void {
    this.firstPersonRenderer.bump(dx, dy, nowMs);
  }

  unlockAudio(): Promise<void> {
    return this.audio.unlock();
  }

  setAudioVolumes(volumes: AudioSettings): void {
    this.audio.setVolumes(volumes);
  }

  updateAudioListener(): void {
    this.updateAudioListenerFor(this.spec.getSession());
  }

  playCues(cues: readonly SoundCue[]): void {
    this.audio.playCues(cues);
  }

  syncAudioWorld(): void {
    const session = this.spec.getSession();
    this.soundEmitters.length = 0;
    this.enemyIdleSources.length = 0;
    if (session !== undefined) {
      session.forEachSoundEmitter((emitter) => this.soundEmitters.push({ ...emitter }));
      session.forEachEnemyIdleSoundSource((source) => this.enemyIdleSources.push({ ...source }));
    }
    this.audio.syncAmbientEmitters(this.soundEmitters);
    this.audio.syncEnemyIdleSources(this.enemyIdleSources);
  }

  startMusic(): void {
    this.audio.startMusic();
  }

  [Symbol.dispose](): void {
    this.cancelPendingFrame();
    this.audio[Symbol.dispose]();
  }

  private updateAndRender(nowMs: number): void {
    if (!this.started || this.spec.signal.aborted) return;

    const model = this.spec.getModel();
    this.interactiveFrameMs = frameMsForFps(clampInteractiveFps(model.interactiveFps));
    const session = this.spec.getSession();
    const tickResult = tickSession(session, model.mode.type, nowMs);
    this.updateAudioListenerFor(session);
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
      onAssetLoad: this.renderLoadedAssets,
    });
    this.lastRenderMs = nowMs;
    this.wantsFrame = tickResult.needsFrame || this.renderScratch.presentation.needsFrame || renderResult.needsFrame;
    this.ambientOnly = this.wantsFrame && !tickResult.needsFrame && !this.renderScratch.presentation.needsFrame &&
      renderResult.ambientOnly === true;
    this.setFrameNeeded(this.wantsFrame);
  }

  private updateAudioListenerFor(session: RuntimeSession | undefined): void {
    if (session === undefined) return;
    this.audio.updateListener(session.getPlayerPosition(), session.getPlayerFacing().dir);
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

function tickSession(
  session: RuntimeSession | undefined,
  modeType: GameModel["mode"]["type"],
  nowMs: number,
): { readonly needsFrame: boolean } {
  if (session === undefined) return { needsFrame: false };
  if (modeType !== "playing" && modeType !== "verbMenu") return { needsFrame: false };
  return session.tick(nowMs);
}
