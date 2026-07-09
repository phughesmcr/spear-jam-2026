/**
 * Canvas presentation for the raycast renderer.
 *
 * Owns an ImageData-backed Uint32 framebuffer (raycast writes pixels in place)
 * and an OffscreenCanvas sized to the visible crop. Presenting a frame is a
 * dirty-rect putImageData of only the visible rows, then a nearest-neighbour
 * upscale drawImage onto the game canvas.
 *
 * The framebuffer renders a few extra rows of vertical overscan; head-bob
 * shifts which crop is uploaded instead of touching the projection, so the
 * effect costs nothing in the pixel loops.
 */

import {
  createFrame,
  type RaycastAtlas,
  type RaycastCamera,
  type RaycastFrame,
  type RaycastScene,
  renderFrame,
} from "@/src/render/raycast/scene.ts";

/** Internal render resolution as a fraction of the logical viewport size. */
const INTERNAL_SCALE = 0.5;

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
    nowMs?: number,
    healthBarMaxDistance?: number,
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

  const ensureBuffers = (
    width: number,
    height: number,
    cropHeight: number,
    spriteCapacity: number,
  ): ViewBuffers | undefined => {
    if (
      buffers !== undefined &&
      buffers.frame.width === width &&
      buffers.frame.height === height &&
      buffers.canvas.height === cropHeight &&
      buffers.frame.spriteOrder.length >= spriteCapacity
    ) {
      return buffers;
    }

    // Opaque present target sized to the visible crop only — overscan rows stay
    // in ImageData and are never uploaded.
    const canvas = new OffscreenCanvas(width, cropHeight);
    const context = canvas.getContext("2d", { alpha: false });
    if (context === null) return undefined;

    const imageData = new ImageData(width, height);
    const pixels = new Uint32Array(imageData.data.buffer);
    buffers = { frame: createFrame(width, height, pixels, spriteCapacity), imageData, canvas, context };
    return buffers;
  };

  return {
    render(ctx, rect, scene, atlas, camera, verticalOffsetFraction = 0, nowMs = 0, healthBarMaxDistance = 0): void {
      const frameSize = internalFrameSize(rect);
      const view = ensureBuffers(
        frameSize.width,
        frameSize.height,
        frameSize.cropHeight,
        scene.spriteX.length,
      );
      if (view === undefined) return;

      renderFrame(view.frame, scene, atlas, camera, nowMs, healthBarMaxDistance);

      let cropTop = OVERSCAN_ROWS - Math.round(verticalOffsetFraction * frameSize.cropHeight);
      if (cropTop < 0) cropTop = 0;
      if (cropTop > OVERSCAN_ROWS * 2) cropTop = OVERSCAN_ROWS * 2;

      // Upload only the visible crop: ImageData y=cropTop maps to canvas y=0.
      view.context.putImageData(
        view.imageData,
        0,
        -cropTop,
        0,
        cropTop,
        frameSize.width,
        frameSize.cropHeight,
      );

      const smoothing = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        view.canvas,
        0,
        0,
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
