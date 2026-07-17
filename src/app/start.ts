import { setupInput } from "@/src/app/input.ts";
import { type AudioRuntime, createAudioRuntime } from "@/src/app/audio_runtime.ts";
import { createGameExecution, type GameExecution } from "@/src/app/game_execution.ts";
import { createPresentationRuntime, type PresentationRuntime } from "@/src/app/presentation_runtime.ts";
import {
  createPresentationAssetIdleScheduler,
  createPresentationAssets,
  type PresentationAssets,
} from "@/src/app/presentation_assets.ts";
import type { PointerInput } from "turn-based-web-engine/input";
import type { GameCommand } from "@/src/game/model/commands.ts";
import { SHIPPED_GAME } from "@/src/game/content/shipped.ts";
import { firstPersonTouchGesturesEnabled, routePointerInput } from "@/src/game/presentation/input_routing.ts";
import { DEFAULT_GAME_CANVAS_SIZE } from "@/src/game/presentation/canvas_size.ts";
import {
  createGameModel,
  createGameTransition,
  type GameModel,
  type GameTransitionEvent,
} from "@/src/game/model/transition/mod.ts";
import { canvasSizeController } from "turn-based-web-engine/canvas";

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
  private readonly assets: PresentationAssets;
  private readonly presentation: PresentationRuntime;
  private readonly audio: AudioRuntime;
  private readonly execution: GameExecution;
  private model: GameModel;
  private readonly transition: ReturnType<typeof createGameTransition>;
  private canvasController: Disposable;
  private inputController?: Disposable;

  constructor(spec: GameSpec, controller: AbortController) {
    this.spec = spec;
    this.controller = controller;
    const fullBoot = spec.startMapName === undefined;
    this.transition = createGameTransition(SHIPPED_GAME.dialogue);
    this.model = createGameModel(spec.startMapName ?? SHIPPED_GAME.levels.start.map.name, {
      showTitle: fullBoot,
      showIntro: fullBoot,
    });
    const executionRef: { current?: GameExecution } = {};
    const presentationRef: { current?: PresentationRuntime } = {};
    const getSession = () => executionRef.current?.getSession();
    this.assets = createPresentationAssets({
      document: spec.canvas.ownerDocument,
      content: SHIPPED_GAME.presentation,
      simulationContent: SHIPPED_GAME.simulation,
      idle: createPresentationAssetIdleScheduler(spec.host),
      onAssetChange: () => presentationRef.current?.renderNow(),
    });
    this.presentation = createPresentationRuntime({
      content: SHIPPED_GAME.presentation,
      simulationContent: SHIPPED_GAME.simulation,
      assets: this.assets.view(),
      host: spec.host,
      ctx: spec.ctx,
      signal: controller.signal,
      getModel: () => this.model,
      getSession,
      tickSession: (modeType, nowMs) => executionRef.current?.tick(modeType, nowMs) ?? NO_FRAME,
    });
    presentationRef.current = this.presentation;
    this.audio = createAudioRuntime({
      content: SHIPPED_GAME.audio,
      host: spec.host,
      getSession,
    });
    executionRef.current = createGameExecution({
      sessionContent: SHIPPED_GAME,
      host: spec.host,
      signal: controller.signal,
      seed: spec.seed,
      cheat: spec.cheat,
      assets: this.assets,
      presentation: this.presentation,
      audio: this.audio,
      getModel: () => this.model,
      apply: (event) => this.apply(event),
      ensureInput: () => this.ensureInput(),
      onError: (error) => this.handleLoadError(error),
      onDiagnostic: (error) => this.reportAssetDiagnostic(error),
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
    void this.assets.prepare({ kind: "shell" }, { urgency: "idle" }).catch((error) => {
      this.reportAssetDiagnostic(error);
    });
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

  private reportAssetDiagnostic(error: unknown): void {
    if (this.controller.signal.aborted) return;
    console.warn("Presentation asset preparation failed.", error);
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
    const next = this.transition(this.model, event);
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
    this.assets[Symbol.dispose]();
    this.presentation[Symbol.dispose]();
    this.audio[Symbol.dispose]();
    this.canvasController?.[Symbol.dispose]();
  }
}
