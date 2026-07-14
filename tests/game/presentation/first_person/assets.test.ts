import { SpriteId } from "@/src/game/content/sprite_ids.ts";
import { createFirstPersonAssets } from "@/src/game/presentation/first_person/assets/mod.ts";
import { createGameMap } from "@/src/game/world/map.ts";
import { texturePackSlot } from "@/src/game/presentation/first_person/assets/catalog.ts";
import { assert, assertEquals, assertNotStrictEquals, assertRejects, assertStrictEquals } from "@std/assert";

type FakeImageEvent = "load" | "error";
type FakeImageListener = () => void;

class FakeImage {
  decoding: "async" | "auto" | "sync" = "auto";
  naturalWidth = 400;
  naturalHeight = 200;
  width = 400;
  height = 200;
  src = "";
  settled = false;
  private readonly listeners: Record<FakeImageEvent, FakeImageListener[]> = {
    load: [],
    error: [],
  };

  addEventListener(type: FakeImageEvent, listener: FakeImageListener): void {
    this.listeners[type].push(listener);
  }

  dispatch(type: FakeImageEvent): void {
    if (this.settled) return;
    this.settled = true;
    for (const listener of this.listeners[type]) listener();
  }
}

class FakeDocument {
  readonly images: FakeImage[] = [];

  createElement(tagName: string): FakeImage {
    if (tagName !== "img") throw new Error(`Unexpected tag ${tagName}.`);
    const image = new FakeImage();
    this.images.push(image);
    return image;
  }

  imageEnding(path: string): FakeImage {
    const image = this.images.find((candidate) => candidate.src.endsWith(path));
    if (image === undefined) throw new Error(`Missing image ${path}.`);
    return image;
  }
}

type DrawCall = readonly unknown[];

class FakeOffscreenContext {
  imageSmoothingEnabled = true;
  readonly drawCalls: DrawCall[] = [];
  readonly drawError: Error | undefined;

  constructor(drawError: Error | undefined) {
    this.drawError = drawError;
  }

  clearRect(): void {}

  drawImage(...args: unknown[]): void {
    if (this.drawError !== undefined) throw this.drawError;
    this.drawCalls.push(args);
  }

  getImageData(_x: number, _y: number, width: number, height: number): ImageData {
    const imageData = new ImageData(width, height);
    for (let y = 64; y < 112; y++) {
      for (let x = 32; x < 64; x++) {
        imageData.data[(y * width + x) * 4] = 120;
        imageData.data[(y * width + x) * 4 + 3] = 255;
      }
    }
    return imageData;
  }
}

class FakeOffscreenCanvas {
  static drawError: Error | undefined;
  static instances: FakeOffscreenCanvas[] = [];

  readonly width: number;
  readonly height: number;
  readonly context = new FakeOffscreenContext(FakeOffscreenCanvas.drawError);

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    FakeOffscreenCanvas.instances.push(this);
  }

  getContext(contextId: string): FakeOffscreenContext | null {
    return contextId === "2d" ? this.context : null;
  }
}

async function withFakeOffscreenCanvas(run: () => Promise<void>, drawError?: Error): Promise<void> {
  const original = globalThis.OffscreenCanvas;
  FakeOffscreenCanvas.drawError = drawError;
  FakeOffscreenCanvas.instances = [];
  Object.defineProperty(globalThis, "OffscreenCanvas", {
    configurable: true,
    writable: true,
    value: FakeOffscreenCanvas as unknown as typeof OffscreenCanvas,
  });
  try {
    await run();
  } finally {
    Object.defineProperty(globalThis, "OffscreenCanvas", {
      configurable: true,
      writable: true,
      value: original,
    });
  }
}

function defaultMap() {
  return createGameMap("Default Assets", [[1]], [], {
    palette: [{ kind: "floor", id: 1, floor_texture: "floor", ceiling_texture: "ceiling" }],
  });
}

function packedMap() {
  return createGameMap("Packed Assets", [[1]], [], {
    palette: [{ kind: "floor", id: 1, floor_texture: "pack1:0,0", ceiling_texture: "ceiling" }],
  });
}

function failUnsettled(document: FakeDocument): void {
  for (const image of document.images) {
    if (!image.settled) image.dispatch("error");
  }
}

Deno.test("first-person assets expose deterministic allocation-free fallback materials", () => {
  const assets = createFirstPersonAssets();
  const material = assets.materials.sprite(SpriteId.John);

  assert(material !== undefined);
  assertStrictEquals(assets.materials.sprite(SpriteId.John), material);
  assertStrictEquals(assets.materials.directionalSprite(SpriteId.John, "attack", "left"), material);
  assertStrictEquals(assets.materials.deathSprite(SpriteId.John, 3), material);
  assertNotStrictEquals(
    assets.materials.directionalSprite(SpriteId.DigitalDog, "idle", "front"),
    assets.materials.directionalSprite(SpriteId.DigitalDog, "attack", "right"),
  );
  assertEquals(assets.atlas.spriteLightmaps.length, 0);
  assertStrictEquals(
    assets.atlas.planes[assets.materials.floor("pack3:4,3")],
    assets.atlas.planes[assets.materials.floor("floor")],
  );
  assertEquals(assets.materials.wall("pack2:3,2"), texturePackSlot("walls", "pack2:3,2"));
});

Deno.test("required loading selects map sources and compiles lightmaps after their colour crop", async () => {
  await withFakeOffscreenCanvas(async () => {
    const assets = createFirstPersonAssets();
    const document = new FakeDocument();
    const planeSlot = assets.materials.floor("pack1:0,0");
    const planeFallback = assets.atlas.planes[planeSlot];
    const john = assets.materials.sprite(SpriteId.John)!;
    const spriteFallback = assets.atlas.sprites[john.slot];
    let callbackCount = 0;
    const preload = assets.preloadRequired(
      document as unknown as Document,
      packedMap(),
      new Set([SpriteId.John]),
      () => callbackCount++,
    );

    assert(document.images.some((image) => image.src.endsWith("/textures/pack1.png")));
    assert(!document.images.some((image) => image.src.endsWith("/textures/pack2.png")));
    assert(document.images.some((image) => image.src.endsWith("/sprites/john.png")));
    assert(!document.images.some((image) => image.src.endsWith("/sprites/digital_dog.png")));

    document.imageEnding("/sprites/john_lightmap.png").dispatch("load");
    await Promise.resolve();
    assertEquals(assets.atlas.spriteLightmaps[john.slot], undefined);

    document.imageEnding("/textures/pack1.png").dispatch("load");
    await Promise.resolve();
    assertNotStrictEquals(assets.atlas.planes[planeSlot], planeFallback);

    document.imageEnding("/sprites/john.png").dispatch("load");
    await Promise.resolve();
    assertNotStrictEquals(assets.atlas.sprites[john.slot], spriteFallback);
    assert(assets.atlas.spriteLightmaps[john.slot] !== undefined);
    assert(john.aspect > 1);

    const drawCalls = FakeOffscreenCanvas.instances[0]!.context.drawCalls;
    assertEquals(drawCalls.at(-1)!.slice(1, 5), drawCalls.at(-2)!.slice(1, 5));
    assert(callbackCount >= 2);

    failUnsettled(document);
    await preload;
  });
});

Deno.test("map target registration compiles a texture-pack source warmed earlier", async () => {
  await withFakeOffscreenCanvas(async () => {
    const assets = createFirstPersonAssets();
    const document = new FakeDocument();
    const slot = assets.materials.floor("pack1:0,0");
    const fallback = assets.atlas.planes[slot];
    const warm = assets.warmRemaining(document as unknown as Document);

    document.imageEnding("/textures/pack1.png").dispatch("load");
    await Promise.resolve();
    assertStrictEquals(assets.atlas.planes[slot], fallback);

    let callbackCount = 0;
    const preload = assets.preloadRequired(
      document as unknown as Document,
      packedMap(),
      new Set(),
      () => callbackCount++,
    );
    assertNotStrictEquals(assets.atlas.planes[slot], fallback);
    assertEquals(callbackCount, 1);

    failUnsettled(document);
    await Promise.all([warm, preload]);
  });
});

Deno.test("shared sprite URLs load once and repeated preloads are idempotent", async () => {
  const assets = createFirstPersonAssets();
  const document = new FakeDocument();
  const spriteIds = new Set([SpriteId.RedKey, SpriteId.BlueKey]);
  const first = assets.preloadRequired(document as unknown as Document, defaultMap(), spriteIds);

  assertEquals(
    document.images.filter((image) => image.src.endsWith("/sprites/key_lightmap.png")).length,
    1,
  );
  failUnsettled(document);
  await first;
  const imageCount = document.images.length;

  await assets.preloadRequired(document as unknown as Document, defaultMap(), spriteIds);
  assertEquals(document.images.length, imageCount);
});

Deno.test("normal image failures settle on fallbacks while raster failures reject", async () => {
  const failedAssets = createFirstPersonAssets();
  const failedDocument = new FakeDocument();
  const john = failedAssets.materials.sprite(SpriteId.John)!;
  const fallback = failedAssets.atlas.sprites[john.slot];
  const failed = failedAssets.preloadRequired(
    failedDocument as unknown as Document,
    defaultMap(),
    new Set([SpriteId.John]),
  );
  failUnsettled(failedDocument);
  await failed;
  assertStrictEquals(failedAssets.atlas.sprites[john.slot], fallback);
  assertEquals(failedAssets.atlas.spriteLightmaps[john.slot], undefined);

  const rasterError = new Error("raster failed");
  await withFakeOffscreenCanvas(async () => {
    const assets = createFirstPersonAssets();
    const document = new FakeDocument();
    const preload = assets.preloadRequired(document as unknown as Document, defaultMap(), new Set());
    document.images[0]!.dispatch("load");
    failUnsettled(document);
    await assertRejects(() => preload, Error, rasterError.message);
  }, rasterError);
});
