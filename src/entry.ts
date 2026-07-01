import { createGameSession } from "@/src/ecs/session.ts";
import type { GameSession } from "@/src/ecs/session.ts";
import { isPlayerCommand } from "@/src/game/commands.ts";
import type { GameCommand } from "@/src/game/commands.ts";
import type { PlayerCommand } from "@/src/game/commands.ts";
import type { GameMode, PlayerState } from "@/src/game/state.ts";
import { SplitMix32 } from "@/src/game/rng.ts";
import { setupKeyboard } from "@/src/input/input.ts";
import { getMap, START_MAP_NAME } from "@/src/map/maps.ts";
import { configureCanvasDpi, DEFAULT_GAME_CANVAS_SIZE } from "@/src/render/canvas.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";
import { renderGameFrame } from "@/src/render/game.ts";

export interface GameSpec {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  seed: number;
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
  private readonly rng: SplitMix32;
  private canvasController: Disposable;
  private canvasSize: GameCanvasSize = DEFAULT_GAME_CANVAS_SIZE;
  private inputController?: Disposable;
  private session?: GameSession;
  private mode: GameMode = { type: "loading" };
  private started = false;

  constructor(spec: GameSpec, controller: AbortController) {
    this.spec = spec;
    this.controller = controller;
    this.rng = new SplitMix32(spec.seed);
    this.canvasController = configureCanvasDpi(spec.window, spec.canvas, spec.ctx, (size) => this.resize(size));
  }

  start(): void {
    this.started = true;
    this.render();
    void this.loadMap(START_MAP_NAME).catch((error: unknown) => this.handleLoadError(error));
  }

  resize(size: GameCanvasSize): void {
    this.canvasSize = size;
    if (this.started) {
      this.render();
    }
  }

  private render(): void {
    renderGameFrame(this.spec.ctx, this.canvasSize, this.session, this.mode);
  }

  private async loadMap(mapName: string, playerState?: PlayerState): Promise<void> {
    this.mode = { type: "loading" };
    this.render();

    const session = await createGameSession(getMap(mapName), () => this.rng.nextFloat(), playerState);
    if (this.controller.signal.aborted) {
      session[Symbol.dispose]();
      return;
    }

    const previousSession = this.session;
    this.session = session;
    previousSession?.[Symbol.dispose]();
    this.mode = { type: "playing" };
    this.inputController ??= setupKeyboard(this.spec.window, (command) => this.handleGameCommands([command]));
    this.render();
  }

  private handleLoadError(error: unknown): void {
    if (this.controller.signal.aborted) return;
    console.error("Failed to start game.", error);
    this.mode = {
      type: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    };
    this.render();
  }

  private handleGameCommands(commands: readonly GameCommand[]): void {
    for (const command of commands) {
      this.handleGameCommand(command);
    }
  }

  private handleGameCommand(command: GameCommand): void {
    if (this.mode.type === "intermission") {
      this.handleIntermissionCommand(command);
      return;
    }

    if (isPlayerCommand(command)) {
      if (this.mode.type !== "playing") return;
      this.handlePlayerCommands([command]);
      return;
    }

    switch (command.type) {
      case "menu":
        this.toggleMenu();
        this.render();
        return;
      case "pause":
        this.togglePause();
        this.render();
        return;
    }
  }

  private handleIntermissionCommand(command: GameCommand): void {
    if (this.mode.type !== "intermission") return;
    if (command.type !== "wait") return;
    const { goto, playerState } = this.mode;
    void this.loadMap(goto, playerState).catch((error: unknown) => this.handleLoadError(error));
  }

  private toggleMenu(): void {
    switch (this.mode.type) {
      case "playing":
        this.mode = { type: "menu" };
        return;
      case "menu":
        this.mode = { type: "playing" };
        return;
    }
  }

  private togglePause(): void {
    switch (this.mode.type) {
      case "playing":
        this.mode = { type: "paused" };
        return;
      case "paused":
        this.mode = { type: "playing" };
        return;
    }
  }

  private handlePlayerCommands(commands: readonly PlayerCommand[]): void {
    if (!this.session) return;

    let shouldRender = false;
    for (const command of commands) {
      const result = this.session.handlePlayerCommand(command);
      if (result.mapChange) {
        this.enterIntermission(result.mapChange.goto);
        this.render();
        return;
      }
      shouldRender ||= result.changedWorld;
    }

    if (shouldRender) {
      this.render();
    }
  }

  private enterIntermission(goto: string): void {
    if (!this.session) return;
    this.mode = {
      type: "intermission",
      message: `Entering ${goto}. Space to continue.`,
      goto,
      playerState: this.session.getPlayerState(),
    };
  }

  [Symbol.dispose](): void {
    this.controller.abort();
    this.inputController?.[Symbol.dispose]();
    this.session?.[Symbol.dispose]();
    this.canvasController?.[Symbol.dispose]();
  }
}
