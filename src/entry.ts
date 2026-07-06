import { type AudioRuntime, createAudioRuntime } from "@/src/audio/audio_runtime.ts";
import { createGameSession, type GameSession } from "@/src/ecs/session.ts";
import { type GameCommand, type PlayerCommand, relativeMoveDirectionOffset } from "@/src/game/commands.ts";
import { directionDelta, normalizeDirection } from "@/src/grid/direction.ts";
import { presentationView } from "@/src/game/presentation.ts";
import { SplitMix32 } from "@/src/game/rng.ts";
import type { EnemyIdleSoundSource, SoundEmitterSnapshot } from "@/src/game/sound.ts";
import {
  createGameModel,
  type GameEffect,
  type GameModel,
  type GameTransitionEvent,
  transition,
} from "@/src/game/transition.ts";
import { setupInput } from "@/src/input/input.ts";
import type { CanvasPointerInput } from "@/src/input/pointer.ts";
import { getMap, START_MAP_NAME } from "@/src/map/maps.ts";
import { configureCanvasDpi, DEFAULT_GAME_CANVAS_SIZE, type GameCanvasSize } from "@/src/render/canvas.ts";
import { dialogueOptionSlotAt } from "@/src/render/dialogue.ts";
import { createFirstPersonRenderer, type FirstPersonRenderer } from "@/src/render/first_person.ts";
import { preloadGameAssets, renderGameFrame } from "@/src/render/game.ts";
import { verbMenuTargetAt } from "@/src/render/verb_menu.ts";

export interface GameSpec {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  seed: number;
  startMapName?: string;
  window: Window;
}

export function startGame(spec: GameSpec): Disposable {
  const controller = new AbortController();
  const game = new Game(spec, controller);
  game.start();
  return game;
}

class Game implements Disposable {
  private readonly spec: GameSpec;
  private readonly controller: AbortController;
  private readonly audio: AudioRuntime;
  private readonly firstPersonRenderer: FirstPersonRenderer;
  private readonly rng: SplitMix32;
  private readonly soundEmitters: SoundEmitterSnapshot[] = [];
  private readonly enemyIdleSources: EnemyIdleSoundSource[] = [];
  private model: GameModel;
  private canvasController: Disposable;
  private canvasSize: GameCanvasSize = DEFAULT_GAME_CANVAS_SIZE;
  private inputController?: Disposable;
  private session?: GameSession;
  private started = false;
  private animationFrameId?: number;
  private readonly runAnimationFrame = (nowMs: number): void => {
    this.animationFrameId = undefined;
    this.updateAndRender(nowMs);
  };
  private readonly renderLoadedAssets = (): void => {
    if (this.started) this.updateAndRenderNow();
  };

  constructor(spec: GameSpec, controller: AbortController) {
    this.spec = spec;
    this.controller = controller;
    this.model = createGameModel(spec.startMapName ?? START_MAP_NAME, { showIntro: spec.startMapName === undefined });
    this.audio = createAudioRuntime(spec.window);
    this.firstPersonRenderer = createFirstPersonRenderer();
    this.rng = new SplitMix32(spec.seed);
    this.canvasController = configureCanvasDpi(
      spec.window,
      spec.canvas,
      spec.ctx,
      (size) => this.resize(size),
    );
  }

  start(): void {
    this.started = true;
    this.apply({ type: "start", nowMs: performance.now() });
  }

  resize(size: GameCanvasSize): void {
    this.canvasSize = size;
    if (this.started) {
      this.updateAndRenderNow();
    }
  }

  private updateAndRenderNow(): void {
    if (!this.started || this.controller.signal.aborted) return;
    this.cancelPendingFrame();
    this.updateAndRender(performance.now());
  }

  private updateAndRender(nowMs: number): void {
    if (!this.started || this.controller.signal.aborted) return;
    const tickResult = this.tickSession(nowMs);
    this.updateAudioListener();
    const presentation = presentationView(this.model.presentation, nowMs);
    const renderResult = renderGameFrame({
      ctx: this.spec.ctx,
      canvasSize: this.canvasSize,
      session: this.session,
      mode: this.model.mode,
      presentation,
      viewMode: this.model.viewMode,
      firstPersonRenderer: this.firstPersonRenderer,
      nowMs,
      onAssetLoad: this.renderLoadedAssets,
    });
    this.setFrameNeeded(tickResult.needsFrame || presentation.needsFrame || renderResult.needsFrame);
  }

  private tickSession(nowMs: number): { readonly needsFrame: boolean } {
    if (this.session === undefined) return { needsFrame: false };
    const mode = this.model.mode.type;
    if (mode !== "playing" && mode !== "verbMenu") return { needsFrame: false };
    return this.session.tick(nowMs);
  }

  private setFrameNeeded(needsFrame: boolean): void {
    if (needsFrame) {
      this.requestNextFrame();
      return;
    }
    this.cancelPendingFrame();
  }

  private requestNextFrame(): void {
    if (this.animationFrameId !== undefined || this.controller.signal.aborted || !this.started) return;
    this.animationFrameId = this.spec.window.requestAnimationFrame(this.runAnimationFrame);
  }

  private cancelPendingFrame(): void {
    if (this.animationFrameId === undefined) return;
    this.spec.window.cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = undefined;
  }

  private async loadMap(mapName: string): Promise<void> {
    const map = getMap(mapName);
    let createdSession: GameSession | undefined;
    try {
      await preloadGameAssets(
        this.spec.canvas.ownerDocument,
        this.firstPersonRenderer,
        this.renderLoadedAssets,
      );
      if (this.session === undefined) {
        createdSession = await createGameSession(map, () => this.rng.nextFloat());
      } else {
        this.session.loadMap(map);
      }
    } catch (error) {
      createdSession?.[Symbol.dispose]();
      throw error;
    }
    if (this.controller.signal.aborted) {
      createdSession?.[Symbol.dispose]();
      return;
    }
    if (createdSession !== undefined) this.session = createdSession;
    this.finishMapLoad(mapName);
  }

  private async retryMap(mapName: string): Promise<void> {
    await this.withLoadedAssets(() => {
      const session = this.session;
      if (session === undefined) {
        throw new Error("Cannot retry before the game session exists.");
      }
      session.retryMap(getMap(mapName));
    });
    if (!this.controller.signal.aborted) this.finishMapLoad(mapName);
  }

  private async resetRun(mapName: string): Promise<void> {
    await this.withLoadedAssets(() => {
      const session = this.session;
      if (session === undefined) {
        throw new Error("Cannot reset before the game session exists.");
      }
      session.resetRun(getMap(mapName));
    });
    if (!this.controller.signal.aborted) this.finishMapLoad(mapName);
  }

  private async withLoadedAssets(run: () => void): Promise<void> {
    await preloadGameAssets(
      this.spec.canvas.ownerDocument,
      this.firstPersonRenderer,
      this.renderLoadedAssets,
    );
    if (this.controller.signal.aborted) return;
    run();
  }

  private finishMapLoad(mapName: string): void {
    this.firstPersonRenderer.reset();
    // Position the listener at the new map's player spawn before starting
    // ambient emitters/music so the first loops are spatialized correctly.
    this.updateAudioListener();
    this.syncAudioWorld();
    this.audio.startMusic();
    this.apply({ type: "mapLoaded", mapName });
  }

  private startLoad(mapName: string): void {
    void this.loadMap(mapName).catch((error: unknown) => this.handleLoadError(error));
  }

  private startRetry(mapName: string): void {
    void this.retryMap(mapName).catch((error: unknown) => this.handleLoadError(error));
  }

  private startResetRun(mapName: string): void {
    void this.resetRun(mapName).catch((error: unknown) => this.handleLoadError(error));
  }

  private handleLoadError(error: unknown): void {
    if (this.controller.signal.aborted) return;
    console.error("Failed to start game.", error);
    this.apply({
      type: "loadFailed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }

  private handleGameCommand(command: GameCommand): void {
    void this.audio.unlock();
    this.apply({ type: "gameCommand", command, nowMs: performance.now() });
  }

  private handlePointerInput(input: CanvasPointerInput): void {
    if (input.phase === "down") void this.audio.unlock();

    const mode = this.model.mode;
    if (mode.type === "intermission") {
      if (input.phase === "up") {
        this.handleGameCommand({ type: "wait" });
      }
      return;
    }

    if (mode.type === "victory" || mode.type === "defeat") {
      if (input.phase === "up") {
        this.handleGameCommand({ type: "wait" });
      }
      return;
    }

    if (mode.type === "dialogue") {
      this.apply({
        type: "dialoguePointer",
        phase: input.phase,
        optionSlot: dialogueOptionSlotAt(this.canvasSize, mode.choices, input),
      });
      return;
    }

    if (mode.type === "help") {
      if (input.phase === "up") {
        this.handleGameCommand({ type: "wait" });
      }
      return;
    }

    if (mode.type === "playing" && this.model.viewMode === "topDown") {
      if (input.phase === "up") {
        this.handleGameCommand({ type: "toggleView" });
      }
      return;
    }

    this.apply({
      type: "verbPointer",
      phase: input.phase,
      target: verbMenuTargetAt(this.canvasSize, input),
    });
  }

  private handlePlayerCommand(command: PlayerCommand): void {
    if (!this.session) return;

    const nowMs = performance.now();
    const playerEntity = this.session.playerEntity;
    const moveFrom = command.type === "move" ? this.session.getPlayerPosition() : undefined;
    const result = this.session.handlePlayerCommand(command);
    // Refresh the listener pose before spatializing cues so movement, pickup,
    // door and attack sounds are panned from the player's new position/facing.
    this.updateAudioListener();
    this.audio.playCues(result.soundCues ?? []);
    this.syncAudioWorld();
    if (command.type === "move" && moveFrom !== undefined) {
      const position = this.session.getPlayerPosition();
      if (position.x === moveFrom.x && position.y === moveFrom.y) {
        // The move was blocked: play a recoil lunge toward the obstacle.
        const worldDir = normalizeDirection(
          this.session.getPlayerFacing().dir + relativeMoveDirectionOffset(command.direction),
        );
        const delta = directionDelta(worldDir);
        this.firstPersonRenderer.bump(delta.dx, delta.dy, nowMs);
      }
    }
    this.apply({
      type: "playerCommandResult",
      result,
      playerEntity,
      nowMs,
    });
  }

  private apply(event: GameTransitionEvent): void {
    const previousViewMode = this.model.viewMode;
    const next = transition(this.model, event);
    this.model = next.model;
    if (this.model.viewMode !== previousViewMode) {
      this.firstPersonRenderer.reset();
    }
    this.executeEffects(next.effects);
  }

  private executeEffects(effects: readonly GameEffect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case "render":
          this.updateAndRenderNow();
          break;
        case "closeDialogue":
          this.session?.closeDialogue();
          break;
        case "ensureInput":
          this.ensureInput();
          break;
        case "loadMap":
          this.startLoad(effect.mapName);
          break;
        case "retryMap":
          this.startRetry(effect.mapName);
          break;
        case "resetRun":
          this.startResetRun(effect.mapName);
          break;
        case "runPlayerCommand":
          this.handlePlayerCommand(effect.command);
          break;
      }
    }
  }

  private ensureInput(): void {
    this.inputController ??= setupInput(
      this.spec.window,
      this.spec.canvas,
      () => this.canvasSize,
      (command) => this.handleGameCommand(command),
      (input) => this.handlePointerInput(input),
      () => this.model.mode.type === "playing" && this.model.viewMode === "firstPerson",
    );
  }

  private updateAudioListener(): void {
    const session = this.session;
    if (session === undefined) return;
    this.audio.updateListener(session.getPlayerPosition(), session.getPlayerFacing().dir);
  }

  private syncAudioWorld(): void {
    const session = this.session;
    this.soundEmitters.length = 0;
    this.enemyIdleSources.length = 0;
    if (session !== undefined) {
      session.forEachSoundEmitter((emitter) => this.soundEmitters.push({ ...emitter }));
      session.forEachEnemyIdleSoundSource((source) => this.enemyIdleSources.push({ ...source }));
    }
    this.audio.syncAmbientEmitters(this.soundEmitters);
    this.audio.syncEnemyIdleSources(this.enemyIdleSources);
  }

  [Symbol.dispose](): void {
    this.controller.abort();
    this.cancelPendingFrame();
    this.audio[Symbol.dispose]();
    this.inputController?.[Symbol.dispose]();
    this.session?.[Symbol.dispose]();
    this.canvasController?.[Symbol.dispose]();
  }
}
