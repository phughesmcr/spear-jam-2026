import { assertEquals, assertStrictEquals } from "@std/assert";
import {
  createImageAsset,
  type ImageAssetResult,
  imageForAsset,
  preloadImageAsset,
  preloadImageAssets,
} from "@/src/engine/canvas/mod.ts";

type FakeImageEvent = "load" | "error";
type FakeImageListener = () => void;

class FakeImage {
  decoding: "async" | "auto" | "sync" = "auto";
  src = "";
  decodeResult: Promise<void> = Promise.resolve();
  private readonly listeners: Record<FakeImageEvent, FakeImageListener[]> = {
    load: [],
    error: [],
  };

  addEventListener(type: FakeImageEvent, listener: FakeImageListener): void {
    this.listeners[type].push(listener);
  }

  decode(): Promise<void> {
    return this.decodeResult;
  }

  dispatch(type: FakeImageEvent): void {
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
}

Deno.test("imageForAsset is a pure read of explicit image state", () => {
  const document = new FakeDocument();
  const asset = createImageAsset("sprite.png");

  assertEquals(imageForAsset(asset), undefined);
  assertEquals(document.images.length, 0);
  assertEquals(asset.state, { type: "idle" });
});

Deno.test("preloadImageAsset exposes a ready image only after load and decode", async () => {
  const document = new FakeDocument();
  const asset = createImageAsset("sprite.png");
  const results: ImageAssetResult[] = [];

  const preload = preloadImageAsset(
    document as unknown as Document,
    asset,
    (result) => results.push(result),
  );

  const image = document.images[0]!;
  assertEquals(asset.state.type, "loading");
  assertEquals(imageForAsset(asset), undefined);
  assertEquals(image.decoding, "async");
  assertEquals(image.src, "sprite.png");

  image.dispatch("load");
  const result = await preload;

  assertEquals(result.kind, "ready");
  assertStrictEquals(result.kind === "ready" ? result.image : undefined, image);
  assertEquals(results, [result]);
  assertEquals(asset.state.type, "ready");
  assertStrictEquals(imageForAsset(asset), image as unknown as HTMLImageElement);
});

Deno.test("preloadImageAsset reports load unavailability for caller fallbacks", async () => {
  const document = new FakeDocument();
  const asset = createImageAsset("missing.png");
  const results: ImageAssetResult[] = [];

  const preload = preloadImageAsset(
    document as unknown as Document,
    asset,
    (result) => results.push(result),
  );
  document.images[0]!.dispatch("error");
  document.images[0]!.dispatch("error");
  const result = await preload;

  assertEquals(result, {
    kind: "unavailable",
    issue: { source: "missing.png", stage: "load" },
  });
  assertEquals(results, [result]);
  assertEquals(asset.state, {
    type: "unavailable",
    issue: { source: "missing.png", stage: "load" },
  });
  assertEquals(imageForAsset(asset), undefined);
  assertEquals(document.images.length, 1);
});

Deno.test("preloadImageAsset distinguishes decode unavailability", async () => {
  const document = new FakeDocument();
  const asset = createImageAsset("invalid.png");
  const decodeFailure = new DOMException("Invalid image data", "EncodingError");

  const preload = preloadImageAsset(document as unknown as Document, asset);
  document.images[0]!.decodeResult = Promise.reject(decodeFailure);
  document.images[0]!.dispatch("load");

  assertEquals(await preload, {
    kind: "unavailable",
    issue: { source: "invalid.png", stage: "decode" },
  });
  assertEquals(asset.state, {
    type: "unavailable",
    issue: { source: "invalid.png", stage: "decode" },
  });
});

Deno.test("concurrent preloadImageAsset subscribers share I/O and each receive the result once", async () => {
  const document = new FakeDocument();
  const asset = createImageAsset("shared.png");
  const firstResults: ImageAssetResult[] = [];
  const secondResults: ImageAssetResult[] = [];

  const first = preloadImageAsset(
    document as unknown as Document,
    asset,
    (result) => firstResults.push(result),
  );
  const second = preloadImageAsset(
    document as unknown as Document,
    asset,
    (result) => secondResults.push(result),
  );

  assertEquals(document.images.length, 1);
  document.images[0]!.dispatch("load");
  document.images[0]!.dispatch("load");
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assertStrictEquals(firstResult, secondResult);
  assertEquals(firstResults, [firstResult]);
  assertEquals(secondResults, [firstResult]);
});

Deno.test("terminal preloadImageAsset calls reuse readiness without new I/O", async () => {
  const document = new FakeDocument();
  const asset = createImageAsset("cached.png");

  const first = preloadImageAsset(document as unknown as Document, asset);
  document.images[0]!.dispatch("load");
  const firstResult = await first;
  const terminalResults: ImageAssetResult[] = [];

  const secondResult = await preloadImageAsset(
    document as unknown as Document,
    asset,
    (result) => terminalResults.push(result),
  );

  assertEquals(document.images.length, 1);
  assertEquals(secondResult, firstResult);
  assertEquals(terminalResults, [secondResult]);
});

Deno.test("preloadImageAssets returns ordered ready and unavailable results", async () => {
  const document = new FakeDocument();
  const first = createImageAsset("first.png");
  const second = createImageAsset("second.png");
  const settled: ImageAssetResult[] = [];

  const preload = preloadImageAssets(
    document as unknown as Document,
    [first, second],
    (result) => settled.push(result),
  );

  assertEquals(document.images.length, 2);
  document.images[1]!.dispatch("error");
  document.images[0]!.dispatch("load");
  const results = await preload;

  assertEquals(results.map((result) => result.kind), ["ready", "unavailable"]);
  assertEquals(settled.map((result) => result.kind), ["unavailable", "ready"]);
});
