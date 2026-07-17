import { createImageTextureBaker, type ImageTextureBakeOptions } from "@/src/engine/raycast/image_texture_baker.ts";
import { SPRITE_ALPHA_CUTOFF, TEX_SHIFT, TEX_SIZE } from "@/src/engine/raycast/textures.ts";
import { assert, assertEquals, assertThrows } from "@std/assert";

type DrawCall = readonly [
  image: CanvasImageSource,
  sourceX: number,
  sourceY: number,
  sourceWidth: number,
  sourceHeight: number,
  destinationX: number,
  destinationY: number,
  destinationWidth: number,
  destinationHeight: number,
];

type FakeCanvasBehavior = {
  readonly pixels?: (width: number, height: number) => ImageData;
  readonly contextAvailable?: boolean;
  readonly drawError?: Error;
};

class FakeContext {
  imageSmoothingEnabled = false;
  readonly drawCalls: DrawCall[] = [];
  clearCount = 0;
  private readonly behavior: FakeCanvasBehavior;

  constructor(behavior: FakeCanvasBehavior) {
    this.behavior = behavior;
  }

  clearRect(_x: number, _y: number, _width: number, _height: number): void {
    this.clearCount++;
  }

  drawImage(...args: DrawCall): void {
    if (this.behavior.drawError !== undefined) throw this.behavior.drawError;
    this.drawCalls.push(args);
  }

  getImageData(_x: number, _y: number, width: number, height: number): ImageData {
    return this.behavior.pixels?.(width, height) ?? opaqueImageData(width, height);
  }
}

class FakeCanvas {
  static behavior: FakeCanvasBehavior = {};
  static instances: FakeCanvas[] = [];

  readonly context = new FakeContext(FakeCanvas.behavior);
  readonly width: number;
  readonly height: number;
  getContextCount = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    FakeCanvas.instances.push(this);
  }

  getContext(contextId: string): FakeContext | null {
    this.getContextCount++;
    if (contextId !== "2d" || FakeCanvas.behavior.contextAvailable === false) return null;
    return this.context;
  }
}

function opaqueImageData(width: number, height: number): ImageData {
  const imageData = new ImageData(width, height);
  for (let index = 3; index < imageData.data.length; index += 4) {
    imageData.data[index] = 255;
  }
  return imageData;
}

function imageDataWithOpaqueBounds(width: number, height: number): ImageData {
  const imageData = new ImageData(width, height);
  imageData.data[(10 * width + 10) * 4 + 3] = SPRITE_ALPHA_CUTOFF - 1;
  for (let y = 64; y < 112; y++) {
    for (let x = 32; x < 64; x++) {
      imageData.data[(y * width + x) * 4] = 120;
      imageData.data[(y * width + x) * 4 + 3] = SPRITE_ALPHA_CUTOFF;
    }
  }
  return imageData;
}

function stripedImageData(width: number, height: number): ImageData {
  const imageData = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      imageData.data[index] = x < width / 2 ? 100 : 200;
      imageData.data[index + 1] = 80;
      imageData.data[index + 2] = 40;
      imageData.data[index + 3] = 255;
    }
  }
  return imageData;
}

function fakeImage(width: number, height: number): HTMLImageElement {
  return {
    naturalWidth: width,
    naturalHeight: height,
    width,
    height,
  } as HTMLImageElement;
}

function withFakeCanvas(
  behavior: FakeCanvasBehavior,
  run: (canvas: typeof FakeCanvas) => void,
): void {
  const original = globalThis.OffscreenCanvas;
  FakeCanvas.behavior = behavior;
  FakeCanvas.instances = [];
  Object.defineProperty(globalThis, "OffscreenCanvas", {
    configurable: true,
    writable: true,
    value: FakeCanvas as unknown as typeof OffscreenCanvas,
  });
  try {
    run(FakeCanvas);
  } finally {
    Object.defineProperty(globalThis, "OffscreenCanvas", {
      configurable: true,
      writable: true,
      value: original,
    });
  }
}

function bake(
  options: ImageTextureBakeOptions,
  behavior: FakeCanvasBehavior = {},
): ReturnType<ReturnType<typeof createImageTextureBaker>["bake"]> {
  let result: ReturnType<ReturnType<typeof createImageTextureBaker>["bake"]> | undefined;
  withFakeCanvas(behavior, () => {
    result = createImageTextureBaker().bake(fakeImage(400, 200), options);
  });
  return result!;
}

function texelBytes(texels: Uint32Array, index: number): readonly number[] {
  return [...new Uint8Array(texels.buffer, index * 4, 4)];
}

Deno.test("image texture baker applies normalized frames and reports the uncropped aspect", () => {
  withFakeCanvas({}, (canvasType) => {
    const result = createImageTextureBaker().bake(fakeImage(400, 200), {
      frame: [0.25, 0.1, 0.5, 0.5],
      crop: { kind: "none" },
    });

    assertEquals(result.sourceAspect, 2);
    assertEquals(result.crop, undefined);
    assertEquals(canvasType.instances.length, 1);
    assertEquals(canvasType.instances[0]!.context.drawCalls[0]!.slice(1), [
      100,
      20,
      200,
      100,
      0,
      0,
      TEX_SIZE,
      TEX_SIZE,
    ]);
  });
});

Deno.test("image texture baker measures a normalized bottom-anchored square crop", () => {
  withFakeCanvas({ pixels: imageDataWithOpaqueBounds }, (canvasType) => {
    const result = createImageTextureBaker().bake(fakeImage(400, 200), {
      frame: [0.25, 0, 0.5, 1],
      crop: { kind: "measure_opaque_square", margin: 0.0625 },
    });

    assertEquals(result.crop, { left: 0.125, top: 0.4375, size: 0.5 });
    assertEquals(result.sourceAspect, 1);
    assertEquals(canvasType.instances[0]!.context.drawCalls.length, 2);
    assertEquals(canvasType.instances[0]!.context.drawCalls[1]!.slice(1), [
      125,
      87.5,
      100,
      100,
      0,
      0,
      TEX_SIZE,
      TEX_SIZE,
    ]);
  });
});

Deno.test("image texture baker reuses a supplied crop, canvas, and context", () => {
  withFakeCanvas({ pixels: stripedImageData }, (canvasType) => {
    const baker = createImageTextureBaker();
    const crop = { left: 0.1, top: 0.2, size: 0.5 } as const;
    const first = baker.bake(fakeImage(400, 200), {
      crop: { kind: "reuse", crop },
      transpose: true,
      tint: [0.5, 1, 1],
    });
    baker.bake(fakeImage(200, 200), { crop: { kind: "none" } });

    assertEquals(first.crop, crop);
    assertEquals(canvasType.instances.length, 1);
    assertEquals(canvasType.instances[0]!.getContextCount, 1);
    assertEquals(canvasType.instances[0]!.context.clearCount, 2);
    assertEquals(canvasType.instances[0]!.context.drawCalls[0]!.slice(1), [
      40,
      40,
      200,
      100,
      0,
      0,
      TEX_SIZE,
      TEX_SIZE,
    ]);
    assertEquals(texelBytes(first.texture.mips[0]!.texels, 0), [50, 80, 40, 255]);
    assertEquals(
      texelBytes(first.texture.mips[0]!.texels, (TEX_SIZE - 1) << TEX_SHIFT),
      [100, 80, 40, 255],
    );
  });
});

Deno.test("image texture baker leaves transparent frames uncropped", () => {
  const result = bake(
    { crop: { kind: "measure_opaque_square", margin: 0.05 } },
    { pixels: (width, height) => new ImageData(width, height) },
  );

  assertEquals(result.crop, undefined);
});

Deno.test("image texture baker clamps an oversized measured crop inside the frame", () => {
  const result = bake(
    { crop: { kind: "measure_opaque_square", margin: 0.25 } },
    { pixels: opaqueImageData },
  );

  assertEquals(result.crop, { left: 0, top: 0, size: 1 });
});

Deno.test("image texture baker throws when OffscreenCanvas is unavailable", () => {
  const original = globalThis.OffscreenCanvas;
  Object.defineProperty(globalThis, "OffscreenCanvas", {
    configurable: true,
    writable: true,
    value: undefined,
  });
  try {
    assertThrows(
      () => createImageTextureBaker().bake(fakeImage(10, 10), { crop: { kind: "none" } }),
      Error,
      "OffscreenCanvas",
    );
  } finally {
    Object.defineProperty(globalThis, "OffscreenCanvas", {
      configurable: true,
      writable: true,
      value: original,
    });
  }
});

Deno.test("image texture baker throws when no raster context is available", () => {
  withFakeCanvas({ contextAvailable: false }, () => {
    assertThrows(
      () => createImageTextureBaker().bake(fakeImage(10, 10), { crop: { kind: "none" } }),
      Error,
      "2D context",
    );
  });
});

Deno.test("image texture baker propagates raster failures", () => {
  const failure = new Error("draw failed");
  withFakeCanvas({ drawError: failure }, () => {
    const error = assertThrows(() => createImageTextureBaker().bake(fakeImage(10, 10), { crop: { kind: "none" } }));
    assert(error === failure);
  });
});
