import { createGameSession } from "@/src/ecs/session.ts";
import type { GameSession } from "@/src/ecs/session.ts";
import { isPlayerCommand } from "@/src/game/commands.ts";
import type { GameCommand } from "@/src/game/commands.ts";
import type { PlayerCommand } from "@/src/game/commands.ts";
import type { GameMode } from "@/src/game/state.ts";
import { setupKeyboard } from "@/src/input/input.ts";
import { MAP_1 } from "@/src/map/map_1.ts";
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
  private canvasController: Disposable;
  private canvasSize: GameCanvasSize = DEFAULT_GAME_CANVAS_SIZE;
  private inputController?: Disposable;
  private session?: GameSession;
  private mode: GameMode = { type: "loading" };
  private started = false;

  constructor(spec: GameSpec, controller: AbortController) {
    this.spec = spec;
    this.controller = controller;
    this.canvasController = configureCanvasDpi(spec.window, spec.canvas, spec.ctx, (size) => this.resize(size));
  }

  setCanvasController(canvasController: Disposable): void {
    this.canvasController = canvasController;
  }

  start(): void {
    this.started = true;
    this.render();
    void this.load().catch((error: unknown) => this.handleLoadError(error));
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

  private async load(): Promise<void> {
    const session = await createGameSession(MAP_1);
    if (this.controller.signal.aborted) {
      session[Symbol.dispose]();
      return;
    }

    this.session = session;
    this.mode = { type: "playing" };
    this.inputController = setupKeyboard(this.spec.window, (command) => this.handleGameCommands([command]));
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
      shouldRender ||= result.changedWorld;
    }

    if (shouldRender) {
      this.render();
    }
  }

  [Symbol.dispose](): void {
    this.controller.abort();
    this.inputController?.[Symbol.dispose]();
    this.session?.[Symbol.dispose]();
    this.canvasController?.[Symbol.dispose]();
  }
}
