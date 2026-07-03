import { createGameSession as createRealGameSession, type GameSession } from "@/src/ecs/session.ts";
import { relativeMoveDirectionOffset } from "@/src/game/commands.ts";
import type { GameCommand } from "@/src/game/commands.ts";
import type { PlayerCommand, PlayerCommandResult } from "@/src/game/commands.ts";
import { directionDelta, normalizeDirection } from "@/src/grid/direction.ts";
import type { CombatFeedback } from "@/src/game/combat_feedback.ts";
import { SplitMix32 } from "@/src/game/rng.ts";
import { createGameModel, transition } from "@/src/game/transition.ts";
import type { GameEffect, GameModel, GameTransitionEvent } from "@/src/game/transition.ts";
import type { GameMode, PlayerState, ViewMode } from "@/src/game/state.ts";
import { setupInput as setupRealInput } from "@/src/input/input.ts";
import type { CanvasPointerInput } from "@/src/input/pointer.ts";
import { getMap as getRealMap, START_MAP_NAME } from "@/src/map/maps.ts";
import { configureCanvasDpi as configureRealCanvasDpi, DEFAULT_GAME_CANVAS_SIZE } from "@/src/render/canvas.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";
import { bumpFirstPersonView } from "@/src/render/first_person.ts";
import {
  preloadGameAssets as preloadRealGameAssets,
  renderGameFrame as renderRealGameFrame,
} from "@/src/render/game.ts";
import { verbMenuHotspotIndexAt } from "@/src/render/verb_menu.ts";

interface GameSessionHandle extends Disposable {
  readonly map: GameSession["map"];
  readonly player: Pick<GameSession["player"], "getEntity" | "getPosition" | "getFacing">;
  getPlayerState(): PlayerState;
  handlePlayerCommand(command: PlayerCommand): PlayerCommandResult;
}

type GameSessionFactory = (
  map: Parameters<typeof createRealGameSession>[0],
  random: Parameters<typeof createRealGameSession>[1],
  playerState?: Parameters<typeof createRealGameSession>[2],
) => Promise<GameSessionHandle>;

type GameFrameRenderer = (
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  session: GameSessionHandle | undefined,
  mode: GameMode,
  messages: readonly string[],
  combatFeedback: readonly CombatFeedback[],
  viewMode: ViewMode,
  onAssetLoad?: () => void,
) => void;

export interface GameRuntime {
  readonly configureCanvasDpi: typeof configureRealCanvasDpi;
  readonly createGameSession: GameSessionFactory;
  readonly getMap: typeof getRealMap;
  readonly preloadGameAssets: typeof preloadRealGameAssets;
  readonly renderGameFrame: GameFrameRenderer;
  readonly setupInput: typeof setupRealInput;
}

export interface GameSpec {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  seed: number;
  window: Window;
  runtime?: GameRuntime;
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
  private readonly runtime: GameRuntime;
  private readonly rng: SplitMix32;
  private model: GameModel = createGameModel(START_MAP_NAME);
  private canvasController: Disposable;
  private canvasSize: GameCanvasSize = DEFAULT_GAME_CANVAS_SIZE;
  private inputController?: Disposable;
  private session?: GameSessionHandle;
  private started = false;
  private readonly renderLoadedAssets = (): void => {
    if (this.started) this.render();
  };

  constructor(spec: GameSpec, controller: AbortController) {
    this.spec = spec;
    this.controller = controller;
    this.runtime = spec.runtime ?? gameRuntime();
    this.rng = new SplitMix32(spec.seed);
    this.canvasController = this.runtime.configureCanvasDpi(
      spec.window,
      spec.canvas,
      spec.ctx,
      (size) => this.resize(size),
    );
  }

  start(): void {
    this.started = true;
    this.apply({ type: "start" });
  }

  resize(size: GameCanvasSize): void {
    this.canvasSize = size;
    if (this.started) {
      this.render();
    }
  }

  private render(): void {
    this.runtime.renderGameFrame(
      this.spec.ctx,
      this.canvasSize,
      this.session,
      this.model.mode,
      this.model.recentMessages,
      this.model.combatFeedback,
      this.model.viewMode,
      this.renderLoadedAssets,
    );
  }

  private async loadMap(mapName: string, playerState?: PlayerState): Promise<void> {
    const [session] = await Promise.all([
      this.runtime.createGameSession(this.runtime.getMap(mapName), () => this.rng.nextFloat(), playerState),
      this.runtime.preloadGameAssets(this.spec.canvas.ownerDocument, this.renderLoadedAssets),
    ]);
    if (this.controller.signal.aborted) {
      session[Symbol.dispose]();
      return;
    }

    const previousSession = this.session;
    this.session = session;
    previousSession?.[Symbol.dispose]();
    this.apply({ type: "mapLoaded", mapName, playerState });
  }

  private startLoad(mapName: string, playerState?: PlayerState): void {
    void this.loadMap(mapName, playerState).catch((error: unknown) => this.handleLoadError(error));
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
    this.apply({ type: "gameCommand", command });
  }

  private handlePointerInput(input: CanvasPointerInput): void {
    this.apply({
      type: "verbPointer",
      phase: input.phase,
      hotspotIndex: verbMenuHotspotIndexAt(this.canvasSize, input),
    });
  }

  private handlePlayerCommand(command: PlayerCommand): void {
    if (!this.session) return;

    const moveFrom = command.type === "move" ? this.session.player.getPosition() : undefined;
    const result = this.session.handlePlayerCommand(command);
    if (command.type === "move" && moveFrom !== undefined) {
      const position = this.session.player.getPosition();
      if (position.x === moveFrom.x && position.y === moveFrom.y) {
        // The move was blocked: play a recoil lunge toward the obstacle.
        const worldDir = normalizeDirection(
          this.session.player.getFacing().dir + relativeMoveDirectionOffset(command.direction),
        );
        const delta = directionDelta(worldDir);
        bumpFirstPersonView(delta.dx, delta.dy);
      }
    }
    this.apply({
      type: "playerCommandResult",
      result,
      playerEntity: this.session.player.getEntity(),
      playerState: this.session.getPlayerState(),
    });
  }

  private apply(event: GameTransitionEvent): void {
    const next = transition(this.model, event);
    this.model = next.model;
    this.executeEffects(next.effects);
  }

  private executeEffects(effects: readonly GameEffect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case "render":
          this.render();
          break;
        case "ensureInput":
          this.ensureInput();
          break;
        case "loadMap":
          this.startLoad(effect.mapName, effect.playerState);
          break;
        case "runPlayerCommand":
          this.handlePlayerCommand(effect.command);
          break;
      }
    }
  }

  private ensureInput(): void {
    this.inputController ??= this.runtime.setupInput(
      this.spec.window,
      this.spec.canvas,
      () => this.canvasSize,
      (command) => this.handleGameCommand(command),
      (input) => this.handlePointerInput(input),
      () => this.model.mode.type === "playing",
    );
  }

  [Symbol.dispose](): void {
    this.controller.abort();
    this.inputController?.[Symbol.dispose]();
    this.session?.[Symbol.dispose]();
    this.canvasController?.[Symbol.dispose]();
  }
}

function gameRuntime(): GameRuntime {
  return {
    configureCanvasDpi: configureRealCanvasDpi,
    createGameSession: createRuntimeGameSession,
    getMap: getRealMap,
    preloadGameAssets: preloadRealGameAssets,
    renderGameFrame: renderRuntimeGameFrame,
    setupInput: setupRealInput,
  };
}

function createRuntimeGameSession(
  map: Parameters<typeof createRealGameSession>[0],
  random: Parameters<typeof createRealGameSession>[1],
  playerState?: Parameters<typeof createRealGameSession>[2],
): Promise<GameSessionHandle> {
  return createRealGameSession(map, random, playerState);
}

function renderRuntimeGameFrame(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  session: GameSessionHandle | undefined,
  mode: GameMode,
  messages: readonly string[],
  combatFeedback: readonly CombatFeedback[],
  viewMode: ViewMode,
  onAssetLoad?: () => void,
): void {
  renderRealGameFrame(
    ctx,
    canvasSize,
    session as GameSession | undefined,
    mode,
    messages,
    combatFeedback,
    viewMode,
    onAssetLoad,
  );
}
