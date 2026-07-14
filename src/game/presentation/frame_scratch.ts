import type { PresentationViewScratch } from "@/src/game/model/presentation_state.ts";
import { createPresentationViewScratch } from "@/src/game/model/presentation_state.ts";
import type { FirstPersonFrameScratch } from "@/src/game/presentation/first_person/renderer.ts";
import type { MapRenderMetrics } from "@/src/game/presentation/top_down/map.ts";

export type GamePlayRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GameFrameResultScratch = {
  needsFrame: boolean;
  ambientOnly: boolean;
};

export type GameFrameResult = {
  readonly needsFrame: boolean;
  /** True when the only continuous demand is ambient first-person animation. */
  readonly ambientOnly?: boolean;
};

export type RenderSpy = {
  sessionRenderCount: number;
  messageLogRenderCount: number;
};

export type GameRenderScratch = {
  readonly frameResult: GameFrameResultScratch;
  readonly presentation: PresentationViewScratch;
  readonly mapMetrics: MapRenderMetrics;
  readonly playRect: GamePlayRect;
  readonly firstPersonFrame: FirstPersonFrameScratch;
  readonly spy: RenderSpy;
  canvasWidth: number;
  canvasHeight: number;
};

export function createRenderSpy(): RenderSpy {
  return {
    sessionRenderCount: 0,
    messageLogRenderCount: 0,
  };
}

export function createGameRenderScratch(): GameRenderScratch {
  return {
    frameResult: { needsFrame: false, ambientOnly: false },
    presentation: createPresentationViewScratch(),
    mapMetrics: {
      mapWidth: 0,
      mapHeight: 0,
      tileSize: 0,
      offsetX: 0,
      offsetY: 0,
    },
    playRect: { x: 0, y: 0, width: 0, height: 0 },
    firstPersonFrame: { needsFrame: false, ambientOnly: false, cameraAngle: 0 },
    spy: createRenderSpy(),
    canvasWidth: 0,
    canvasHeight: 0,
  };
}
