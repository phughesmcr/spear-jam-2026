import { setupInput } from "@/src/app/input.ts";
import { type AudioRuntime, createAudioRuntime } from "@/src/app/audio_runtime.ts";
import { createGameExecution, type GameExecution } from "@/src/app/game_execution.ts";
import { createPresentationRuntime, type PresentationRuntime } from "@/src/app/presentation_runtime.ts";
import type { PointerInput } from "@/src/engine/input/mod.ts";
import type { GameCommand } from "@/src/game/model/commands.ts";
import { firstPersonTouchGesturesEnabled, routePointerInput } from "@/src/game/presentation/input_routing.ts";
import { DEFAULT_GAME_CANVAS_SIZE } from "@/src/game/presentation/canvas_size.ts";
import {
  createGameModel,
  type GameModel,
  type GameTransitionEvent,
  transition,
} from "@/src/game/model/transition/mod.ts";
import { CAMPAIGN } from "@/src/game/world/campaign.ts";
import { canvasSizeController } from "@/src/platform/web/canvas.ts";

const NO_FRAME = { needsFrame: false } as const;

export interface GameSpec {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  seed: number;
  startMapName?: string;
  cheat?: boolean;
  host: Window;
}

export interface GameController extends Disposable {
  unlockAudio(): Promise<void>;
}

export function startGame(spec: GameSpec): GameController {
  const controller = new AbortController();
  const game = new Game(spec, controller);
  game.start();
  return game;
}

class Game implements GameController {
  private readonly spec: GameSpec;
  private readonly controller: AbortController;
  private readonly presentation: PresentationRuntime;
  private readonly audio: AudioRuntime;
  private readonly execution: GameExecution;
  private model: GameModel;
  private canvasController: Disposable;
  private inputController?: Disposable;

  constructor(spec: GameSpec, controller: AbortController) {
    this.spec = spec;
    this.controller = controller;
    const fullBoot = spec.startMapName === undefined;
    this.model = createGameModel(spec.startMapName ?? CAMPAIGN.startMap.name, {
      showTitle: fullBoot,
      showIntro: fullBoot,
    });
    const executionRef: { current?: GameExecution } = {};
    const getSession = () => executionRef.current?.getSession();
    this.presentation = createPresentationRuntime({
      host: spec.host,
      document: spec.canvas.ownerDocument,
      ctx: spec.ctx,
      signal: controller.signal,
      getModel: () => this.model,
      getSession,
      tickSession: (modeType, nowMs) => executionRef.current?.tick(modeType, nowMs) ?? NO_FRAME,
      onError: (error) => this.handleLoadError(error),
      onLoadingProgress: (loaded, total) => {
        this.apply({ type: "loadingProgress", loaded, total });
      },
    });
    this.audio = createAudioRuntime({
      host: spec.host,
      getSession,
    });
    executionRef.current = createGameExecution({
      host: spec.host,
      signal: controller.signal,
      seed: spec.seed,
      cheat: spec.cheat,
      presentation: this.presentation,
      audio: this.audio,
      getModel: () => this.model,
      apply: (event) => this.apply(event),
      ensureInput: () => this.ensureInput(),
      onError: (error) => this.handleLoadError(error),
    });
    this.execution = executionRef.current;
    this.canvasController = canvasSizeController(
      spec.host,
      spec.canvas,
      spec.ctx,
      DEFAULT_GAME_CANVAS_SIZE,
      (size) => this.presentation.resize(size),
    );
  }

  start(): void {
    this.presentation.start();
    this.apply({ type: "start", nowMs: performance.now() });
    this.presentation.warmShellAssets();
  }

  unlockAudio(): Promise<void> {
    return this.audio.unlock();
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

  private handlePointerInput(input: PointerInput): void {
    if (input.phase === "down") void this.audio.unlock();

    const route = routePointerInput(this.model, this.presentation.canvasSize, input);
    if (route.type === "command") {
      this.handleGameCommand(route.command);
      return;
    }
    if (route.type === "transition") this.apply(route.event);
  }

  private apply(event: GameTransitionEvent): void {
    const next = transition(this.model, event);
    this.model = next.model;
    this.execution.execute(next.effects);
  }

  private ensureInput(): void {
    this.inputController ??= setupInput(
      this.spec.host,
      this.spec.canvas,
      () => this.presentation.canvasSize,
      (command) => this.handleGameCommand(command),
      (input) => this.handlePointerInput(input),
      () => firstPersonTouchGesturesEnabled(this.model),
    );
  }

  [Symbol.dispose](): void {
    this.controller.abort();
    this.inputController?.[Symbol.dispose]();
    this.execution[Symbol.dispose]();
    this.presentation[Symbol.dispose]();
    this.audio[Symbol.dispose]();
    this.canvasController?.[Symbol.dispose]();
  }
}
