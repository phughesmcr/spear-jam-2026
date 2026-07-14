import { assert, assertEquals } from "@std/assert";
import { createImageAsset, imageForAsset, preloadImageAsset, preloadImageAssets } from "@/src/engine/canvas/mod.ts";

type FakeImageEvent = "load" | "error";
type FakeImageListener = () => void;

class FakeImage {
  decoding: "async" | "auto" | "sync" = "auto";
  src = "";
  private readonly listeners: Record<FakeImageEvent, FakeImageListener[]> = {
    load: [],
    error: [],
  };

  addEventListener(type: FakeImageEvent, listener: FakeImageListener): void {
    this.listeners[type].push(listener);
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

Deno.test("imageForAsset is a pure read that cannot start an image request", () => {
  const document = new FakeDocument();
  const asset = createImageAsset("sprite.png");

  assertEquals(imageForAsset(asset), undefined);
  assertEquals(document.images.length, 0);
  assertEquals(asset.loaded, false);
  assertEquals(asset.failed, false);
});

Deno.test("imageForAsset exposes the asset image after explicit preload", async () => {
  const document = new FakeDocument();
  const asset = createImageAsset("sprite.png");
  let callbackCount = 0;

  assertEquals(imageForAsset(asset), undefined);
  const preload = preloadImageAsset(
    document as unknown as Document,
    asset,
    () => callbackCount++,
  );

  const image = document.images[0]!;
  assertEquals(document.images.length, 1);
  assertEquals(image.decoding, "async");
  assertEquals(image.src, "sprite.png");

  image.dispatch("load");
  await preload;

  assertEquals(callbackCount, 1);
  assertEquals(asset.loaded, true);
  assertEquals(asset.failed, false);
  assert(imageForAsset(asset) === (image as unknown as HTMLImageElement));
});

Deno.test("imageForAsset leaves failed assets to caller fallbacks", async () => {
  const document = new FakeDocument();
  const asset = createImageAsset("missing.png");
  let callbackCount = 0;

  const preload = preloadImageAsset(
    document as unknown as Document,
    asset,
    () => callbackCount++,
  );
  document.images[0]!.dispatch("error");
  await preload;

  assertEquals(callbackCount, 1);
  assertEquals(asset.loaded, false);
  assertEquals(asset.failed, true);
  assertEquals(imageForAsset(asset), undefined);
  assertEquals(document.images.length, 1);
  assertEquals(callbackCount, 1);
});

Deno.test("preloadImageAssets waits for loaded and failed assets", async () => {
  const document = new FakeDocument();
  const first = createImageAsset("first.png");
  const second = createImageAsset("second.png");
  let callbackCount = 0;

  const preload = preloadImageAssets(document as unknown as Document, [first, second], () => callbackCount++);

  assertEquals(document.images.length, 2);
  document.images[0]!.dispatch("load");
  document.images[1]!.dispatch("error");
  await preload;

  assertEquals(first.loaded, true);
  assertEquals(first.failed, false);
  assertEquals(second.loaded, false);
  assertEquals(second.failed, true);
  assertEquals(callbackCount, 2);
});
