import { configureCanvasDpi } from "@/src/canvas.ts";
import type { GameCanvasSize } from "@/src/canvas.ts";
import { GAME_HEIGHT, GAME_WIDTH } from "@/src/constants.ts";

export interface GameSpec {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  seed: number;
  host: typeof globalThis;
}

export function startGame(spec: GameSpec): Disposable {
  const controller = new AbortController();
  const game = new Game(spec, controller);
  game.start();
  return game;
}

class Game implements Disposable {
  private spec: GameSpec;
  private controller: AbortController;
  private canvasController?: Disposable;
  private canvasSize: GameCanvasSize = { width: GAME_WIDTH, height: GAME_HEIGHT };
  private started = false;

  constructor(spec: GameSpec, controller: AbortController) {
    this.spec = spec;
    this.controller = controller;
    this.canvasController = configureCanvasDpi(spec.host, spec.canvas, spec.ctx, (size) => this.resize(size));
  }

  setCanvasController(canvasController: Disposable): void {
    this.canvasController = canvasController;
  }

  start(): void {
    this.started = true;
    this.render();
  }

  resize(size: GameCanvasSize): void {
    this.canvasSize = size;
    if (this.started) {
      this.render();
    }
  }

  private render(): void {
    this.spec.ctx.fillStyle = "red";
    this.spec.ctx.fillRect(0, 0, this.canvasSize.width, this.canvasSize.height);
  }

  [Symbol.dispose](): void {
    this.controller.abort();
    this.canvasController?.[Symbol.dispose]();
  }
}
