import {
  type BakedTexture,
  bakeTexture,
  SPRITE_ALPHA_CUTOFF,
  TEX_SIZE,
  type TexelSource,
} from "@/src/engine/raycast/textures.ts";

export type SourceFrame = readonly [
  x: number,
  y: number,
  width: number,
  height: number,
];

export type ContentCrop = {
  readonly left: number;
  readonly top: number;
  readonly size: number;
};

export type ImageCropPolicy =
  | { readonly kind: "none" }
  | {
    readonly kind: "measure_opaque_square";
    /** Margin on each side, normalized to the selected frame. */
    readonly margin: number;
  }
  | {
    readonly kind: "reuse";
    readonly crop: ContentCrop;
  };

export type ImageTextureBakeOptions = {
  readonly frame?: SourceFrame;
  readonly crop: ImageCropPolicy;
  readonly transpose?: boolean;
  readonly tint?: readonly [number, number, number];
};

export type ImageTextureBakeResult = {
  readonly texture: BakedTexture;
  readonly crop?: ContentCrop;
  readonly sourceAspect: number;
};

export interface ImageTextureBaker {
  bake(
    image: HTMLImageElement,
    options: ImageTextureBakeOptions,
  ): ImageTextureBakeResult;
}

type BakerState = {
  context: OffscreenCanvasRenderingContext2D | undefined;
};

type SourceRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

type OpaqueBounds = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

export function createImageTextureBaker(): ImageTextureBaker {
  const state: BakerState = { context: undefined };
  return {
    bake(image, options): ImageTextureBakeResult {
      return bakeImageTexture(state, image, options);
    },
  };
}

function bakeImageTexture(
  state: BakerState,
  image: HTMLImageElement,
  options: ImageTextureBakeOptions,
): ImageTextureBakeResult {
  const frameRect = sourceRect(image, options.frame);
  const sourceAspect = frameRect.width > 0 && frameRect.height > 0 ? frameRect.width / frameRect.height : 1;

  let crop: ContentCrop | undefined;
  let source: TexelSource;
  switch (options.crop.kind) {
    case "none":
      source = rasterize(state, image, frameRect, undefined);
      break;
    case "reuse":
      crop = options.crop.crop;
      source = rasterize(state, image, frameRect, crop);
      break;
    case "measure_opaque_square": {
      const uncropped = rasterize(state, image, frameRect, undefined);
      crop = measureOpaqueSquare(uncropped, options.crop.margin);
      source = crop === undefined ? uncropped : rasterize(state, image, frameRect, crop);
      break;
    }
  }

  return {
    texture: bakeTexture(source, {
      ...(options.transpose === undefined ? {} : { transpose: options.transpose }),
      ...(options.tint === undefined ? {} : { tint: options.tint }),
    }),
    ...(crop === undefined ? {} : { crop }),
    sourceAspect,
  };
}

function sourceRect(image: HTMLImageElement, frame: SourceFrame | undefined): SourceRect {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  return {
    x: (frame?.[0] ?? 0) * imageWidth,
    y: (frame?.[1] ?? 0) * imageHeight,
    width: (frame?.[2] ?? 1) * imageWidth,
    height: (frame?.[3] ?? 1) * imageHeight,
  };
}

function rasterize(
  state: BakerState,
  image: HTMLImageElement,
  frame: SourceRect,
  crop: ContentCrop | undefined,
): TexelSource {
  const context = rasterContext(state);
  const sourceX = frame.x + (crop?.left ?? 0) * frame.width;
  const sourceY = frame.y + (crop?.top ?? 0) * frame.height;
  const cropSize = crop?.size ?? 1;
  const sourceWidth = cropSize * frame.width;
  const sourceHeight = cropSize * frame.height;

  context.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
  context.imageSmoothingEnabled = true;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    TEX_SIZE,
    TEX_SIZE,
  );
  return context.getImageData(0, 0, TEX_SIZE, TEX_SIZE);
}

function rasterContext(state: BakerState): OffscreenCanvasRenderingContext2D {
  if (state.context !== undefined) return state.context;

  const Canvas = globalThis.OffscreenCanvas;
  if (typeof Canvas !== "function") {
    throw new Error("OffscreenCanvas is unavailable.");
  }
  const canvas = new Canvas(TEX_SIZE, TEX_SIZE);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) {
    throw new Error("OffscreenCanvas 2D context is unavailable.");
  }
  state.context = context;
  return context;
}

function measureOpaqueSquare(source: TexelSource, margin: number): ContentCrop | undefined {
  const bounds = opaqueBounds(source);
  if (bounds === undefined) return undefined;

  const width = (bounds.right - bounds.left + 1) / source.width;
  const height = (bounds.bottom - bounds.top + 1) / source.height;
  const size = Math.min(1, Math.max(width, height) + Math.max(0, margin) * 2);
  const centerX = (bounds.left + bounds.right + 1) / (source.width * 2);
  const bottom = (bounds.bottom + 1) / source.height;
  const left = clamp(centerX - size / 2, 0, 1 - size);
  const top = clamp(bottom + Math.max(0, margin) - size, 0, 1 - size);
  return { left, top, size };
}

function opaqueBounds(source: TexelSource): OpaqueBounds | undefined {
  let left = source.width;
  let top = source.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      if (source.data[(y * source.width + x) * 4 + 3]! < SPRITE_ALPHA_CUTOFF) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return right < 0 ? undefined : { left, top, right, bottom };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
