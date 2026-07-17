import type { CanvasSize } from "turn-based-web-engine/canvas";

export type GameCanvasSize = CanvasSize;

export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1280;
export const DEFAULT_GAME_CANVAS_SIZE: GameCanvasSize = { width: GAME_WIDTH, height: GAME_HEIGHT };
