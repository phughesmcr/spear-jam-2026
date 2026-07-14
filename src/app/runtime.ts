import type { TrackId } from "@/src/game/content/audio/music.ts";
import type { VoiceId } from "@/src/game/content/dialogue/voices.ts";
import type { AudioRuntime } from "@/src/engine/audio/mod.ts";
import type { AudioSettings } from "@/src/game/model/audio_settings.ts";
import {
  audioCuesFor,
  audioEmittersFor,
  audioTrackFor,
  audioVoiceFor,
  idleAudioSourcesFor,
  listenerPoseFor,
} from "@/src/game/presentation/audio.ts";
import { fillPresentationView } from "@/src/game/model/presentation_state.ts";
import {
  AMBIENT_FPS,
  clampInteractiveFps,
  DEFAULT_INTERACTIVE_FPS,
  frameMsForFps,
} from "@/src/game/model/render_settings.ts";
import type { RuntimeSession } from "@/src/game/presentation/session_view.ts";
import type { EnemyIdleSoundSource, SoundCue, SoundEmitterSnapshot } from "@/src/game/model/sound.ts";
import type { GameModel } from "@/src/game/model/transition/mod.ts";
import { DEFAULT_GAME_CANVAS_SIZE, type GameCanvasSize } from "@/src/game/presentation/canvas_size.ts";
import { createFirstPersonRenderer, type FirstPersonRenderer } from "@/src/game/presentation/first_person/renderer.ts";
import {
  preloadGameAssets,
  warmDeferredAssets,
  warmMapAssets,
  warmShellAssets,
} from "@/src/game/presentation/preload.ts";
import { renderGameFrame } from "@/src/game/presentation/render.ts";
import { createGameRenderScratch } from "@/src/game/presentation/frame_scratch.ts";
import { createWebAudioRuntime } from "@/src/platform/web/audio/runtime.ts";

/** Cap ambient-only animation (sky/bob/flicker) to match light rebuild rate. */
const AMBIENT_FRAME_MS = frameMsForFps(AMBIENT_FPS);

export type GameRuntimeLoopSpec = {
  readonly host: Window;
  readonly document: Document;
  readonly ctx: CanvasRenderingContext2D;
  readonly signal: AbortSignal;
  readonly getModel: () => GameModel;
  readonly getSession: () => RuntimeSession | undefined;
  readonly onError: (error: unknown) => void;
  readonly dependencies?: GameRuntimeLoopDependencies;
  readonly onLoadingProgress?: (loaded: number, total: number) => void;
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
  preloadAssets(mapName: string): Promise<void>;
  warmShellAssets(): void;
  warmMapAssets(mapName: string): void;
  warmDeferredAssets(mapName: string): void;
  resetFirstPerson(): void;
  bumpFirstPerson(dx: number, dy: number, nowMs: number): void;
  unlockAudio(): Promise<void>;
  setAudioVolumes(volumes: AudioSettings): void;
  updateAudioListener(): void;
  playCues(cues: readonly SoundCue[]): void;
  stopSounds(): void;
  setDialogueVoice(voice: VoiceId | undefined): void;
  syncAudioWorld(): void;
  playMusic(trackId: TrackId): void;
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
    this.audio = spec.dependencies?.audio ?? createWebAudioRuntime(spec.host);
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

  async preloadAssets(mapName: string): Promise<void> {
    await preloadGameAssets(this.spec.document, this.firstPersonRenderer, {
      mapName,
      onAssetLoad: this.renderLoadedAssets,
      onProgress: (progress) => this.spec.onLoadingProgress?.(progress.loaded, progress.total),
    });
  }

  warmShellAssets(): void {
    warmShellAssets(
      this.spec.document,
      this.spec.onError,
      this.renderLoadedAssets,
    );
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
    this.audio.playCues(audioCuesFor(cues));
  }

  stopSounds(): void {
    this.audio.stopSounds();
  }

  setDialogueVoice(voice: VoiceId | undefined): void {
    this.audio.setVoice(voice === undefined ? undefined : audioVoiceFor(voice));
  }

  syncAudioWorld(): void {
    const session = this.spec.getSession();
    this.soundEmitters.length = 0;
    this.enemyIdleSources.length = 0;
    if (session !== undefined) {
      session.forEachSoundEmitter((emitter) => this.soundEmitters.push({ ...emitter }));
      session.forEachEnemyIdleSoundSource((source) => this.enemyIdleSources.push({ ...source }));
    }
    this.audio.syncAmbientEmitters(audioEmittersFor(this.soundEmitters));
    this.audio.syncIdleSources(idleAudioSourcesFor(this.enemyIdleSources));
  }

  playMusic(trackId: TrackId): void {
    this.audio.playMusic(audioTrackFor(trackId));
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
    });
    this.lastRenderMs = nowMs;
    this.wantsFrame = tickResult.needsFrame || this.renderScratch.presentation.needsFrame || renderResult.needsFrame;
    this.ambientOnly = this.wantsFrame && !tickResult.needsFrame && !this.renderScratch.presentation.needsFrame &&
      renderResult.ambientOnly === true;
    this.setFrameNeeded(this.wantsFrame);
  }

  private updateAudioListenerFor(session: RuntimeSession | undefined): void {
    if (session === undefined) return;
    this.audio.updateListener(listenerPoseFor(session.getPlayerPosition(), session.getPlayerFacing().dir));
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
