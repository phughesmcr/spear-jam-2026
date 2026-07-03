/**
 * Canvas presentation for the raycast renderer.
 *
 * Owns the internal framebuffer (a Uint32 view straight over an ImageData
 * buffer, so presenting a frame is a single putImageData plus a single
 * nearest-neighbour upscale drawImage) and reuses it across frames.
 *
 * The framebuffer renders a few extra rows of vertical overscan; head-bob
 * shifts the blitted crop inside that margin instead of touching the
 * projection, so the effect costs nothing in the pixel loops.
 */

import { createFrame, renderFrame } from "@/src/render/raycast/scene.ts";
import type { RaycastAtlas, RaycastCamera, RaycastFrame, RaycastScene } from "@/src/render/raycast/scene.ts";

/** Internal render resolution as a fraction of the logical viewport size. */
const INTERNAL_SCALE = 0.75;

/** Extra internal rows rendered above and below the visible crop. */
const OVERSCAN_ROWS = 6;

export type ViewRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type ViewFrameSize = {
  readonly width: number;
  readonly cropHeight: number;
  readonly height: number;
};

type ViewBuffers = {
  frame: RaycastFrame;
  imageData: ImageData;
  canvas: OffscreenCanvas;
  context: OffscreenCanvasRenderingContext2D;
};

export type RaycastView = {
  render(
    ctx: CanvasRenderingContext2D,
    rect: ViewRect,
    scene: RaycastScene,
    atlas: RaycastAtlas,
    camera: RaycastCamera,
    verticalOffsetFraction?: number,
  ): void;
};

export function internalFrameSize(rect: ViewRect): ViewFrameSize {
  const width = Math.max(2, Math.round(rect.width * INTERNAL_SCALE));
  // Keep the visible internal height even so the horizon splits rows exactly;
  // the overscan margin keeps that parity.
  const cropHeight = Math.max(2, Math.round(rect.height * INTERNAL_SCALE * 0.5) * 2);
  return { width, cropHeight, height: cropHeight + OVERSCAN_ROWS * 2 };
}

export function createRaycastView(): RaycastView {
  let buffers: ViewBuffers | undefined;

  const ensureBuffers = (width: number, height: number, spriteCapacity: number): ViewBuffers | undefined => {
    if (
      buffers !== undefined &&
      buffers.frame.width === width &&
      buffers.frame.height === height &&
      buffers.frame.spriteOrder.length >= spriteCapacity
    ) {
      return buffers;
    }

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (context === null) return undefined;

    const imageData = context.createImageData(width, height);
    const pixels = new Uint32Array(imageData.data.buffer);
    buffers = { frame: createFrame(width, height, pixels, spriteCapacity), imageData, canvas, context };
    return buffers;
  };

  return {
    render(ctx, rect, scene, atlas, camera, verticalOffsetFraction = 0): void {
      const frameSize = internalFrameSize(rect);
      const view = ensureBuffers(frameSize.width, frameSize.height, scene.spriteX.length);
      if (view === undefined) return;

      renderFrame(view.frame, scene, atlas, camera);
      view.context.putImageData(view.imageData, 0, 0);

      let cropTop = OVERSCAN_ROWS - Math.round(verticalOffsetFraction * frameSize.cropHeight);
      if (cropTop < 0) cropTop = 0;
      if (cropTop > OVERSCAN_ROWS * 2) cropTop = OVERSCAN_ROWS * 2;

      const smoothing = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        view.canvas,
        0,
        cropTop,
        frameSize.width,
        frameSize.cropHeight,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
      );
      ctx.imageSmoothingEnabled = smoothing;
    },
  };
}
