import { createGameSession } from "@/src/ecs/session.ts";
import type { GameSession } from "@/src/ecs/session.ts";
import { isPlayerCommand } from "@/src/game/commands.ts";
import type { GameCommand } from "@/src/game/commands.ts";
import type { PlayerCommand } from "@/src/game/commands.ts";
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
  private menuOpen = false;
  private paused = false;
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
    void this.load();
  }

  resize(size: GameCanvasSize): void {
    this.canvasSize = size;
    if (this.started) {
      this.render();
    }
  }

  private render(): void {
    renderGameFrame(this.spec.ctx, this.canvasSize, this.session);
  }

  private async load(): Promise<void> {
    const session = await createGameSession(MAP_1);
    if (this.controller.signal.aborted) {
      session[Symbol.dispose]();
      return;
    }

    this.session = session;
    this.inputController = setupKeyboard(this.spec.window, (command) => this.handleGameCommands([command]));
    this.render();
  }

  private handleGameCommands(commands: readonly GameCommand[]): void {
    for (const command of commands) {
      this.handleGameCommand(command);
    }
  }

  private handleGameCommand(command: GameCommand): void {
    if (isPlayerCommand(command)) {
      if (this.paused || this.menuOpen) return;
      this.handlePlayerCommands([command]);
      return;
    }

    switch (command.type) {
      case "menu":
        this.menuOpen = !this.menuOpen;
        return;
      case "pause":
        this.paused = !this.paused;
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
