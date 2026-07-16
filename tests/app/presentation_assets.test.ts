import { createPresentationAssets, type PresentationAssetIdleScheduler } from "@/src/app/presentation_assets.ts";
import { SHIPPED_GAME } from "@/src/game/content/shipped.ts";
import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";

type FakeImageEvent = "load" | "error";

class FakeImage {
  decoding: "async" | "auto" | "sync" = "auto";
  naturalWidth = 400;
  naturalHeight = 200;
  width = 400;
  height = 200;
  src = "";
  private settled = false;
  private readonly listeners: Record<FakeImageEvent, Array<() => void>> = {
    load: [],
    error: [],
  };

  addEventListener(type: FakeImageEvent, listener: () => void): void {
    this.listeners[type].push(listener);
  }

  decode(): Promise<void> {
    return Promise.resolve();
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

  failAll(): void {
    for (const image of this.images) image.dispatch("error");
  }

  loadAll(): void {
    for (const image of this.images) image.dispatch("load");
  }

  failWhere(predicate: (source: string) => boolean): void {
    for (const image of this.images) {
      if (predicate(image.src)) image.dispatch("error");
    }
  }

  imageEnding(path: string): FakeImage {
    const image = this.images.find((candidate) => candidate.src.endsWith(path));
    if (image === undefined) throw new Error(`Missing image ${path}.`);
    return image;
  }
}

class FailingOffscreenCanvas {
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext(contextId: string): object | null {
    if (contextId !== "2d") return null;
    return {
      imageSmoothingEnabled: true,
      clearRect(): void {},
      drawImage(): void {
        throw new Error("raster failed");
      },
    };
  }
}

class FakeIdleScheduler implements PresentationAssetIdleScheduler {
  readonly pending = new Map<number, () => void>();
  readonly cancelled: number[] = [];
  private nextHandle = 1;

  schedule(callback: () => void): unknown {
    const handle = this.nextHandle++;
    this.pending.set(handle, callback);
    return handle;
  }

  cancel(handle: unknown): void {
    const id = handle as number;
    this.cancelled.push(id);
    this.pending.delete(id);
  }

  run(handle: number): void {
    const callback = this.pending.get(handle);
    if (callback === undefined) return;
    this.pending.delete(handle);
    callback();
  }
}

function createTestAssets(
  document: FakeDocument,
  idle: FakeIdleScheduler,
  onAssetChange?: () => void,
) {
  return createPresentationAssets({
    document: document as unknown as Document,
    content: SHIPPED_GAME.presentation,
    simulationContent: SHIPPED_GAME.simulation,
    idle,
    onAssetChange,
  });
}

async function flushSettlement(): Promise<void> {
  for (let turn = 0; turn < 8; turn++) await Promise.resolve();
}

async function withFailingOffscreenCanvas(run: () => Promise<void>): Promise<void> {
  const original = globalThis.OffscreenCanvas;
  Object.defineProperty(globalThis, "OffscreenCanvas", {
    configurable: true,
    writable: true,
    value: FailingOffscreenCanvas as unknown as typeof OffscreenCanvas,
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

Deno.test("presentation assets coalesce an idle request and promote it for a blocking caller", async () => {
  const document = new FakeDocument();
  const idle = new FakeIdleScheduler();
  const assets = createTestAssets(document, idle);
  const warmProgress: Array<readonly [number, number]> = [];
  const blockingProgress: Array<readonly [number, number]> = [];

  const warm = assets.prepare(
    { kind: "shell" },
    {
      urgency: "idle",
      onProgress: ({ completed, total }) => warmProgress.push([completed, total]),
    },
  );
  assertEquals(idle.pending.size, 1);
  assertEquals(document.images.length, 0);

  const blocking = assets.prepare(
    { kind: "shell" },
    {
      urgency: "blocking",
      onProgress: ({ completed, total }) => blockingProgress.push([completed, total]),
    },
  );
  assertEquals(idle.pending.size, 0);
  assertEquals(idle.cancelled, [1]);
  assertEquals(document.images.length, 2);

  document.failAll();
  const [warmResult, blockingResult] = await Promise.all([warm, blocking]);

  assertStrictEquals(warmResult, blockingResult);
  assertEquals(warmResult.kind, "degraded");
  assertEquals(warmProgress.at(0)?.[0], 0);
  assertEquals(warmProgress.at(-1)?.[0], warmProgress.at(-1)?.[1]);
  assertEquals(blockingProgress.at(0), warmProgress.at(0));
  assertEquals(blockingProgress.at(-1), warmProgress.at(-1));
});

Deno.test("presentation asset caller abort detaches without cancelling shared work", async () => {
  const document = new FakeDocument();
  const assets = createTestAssets(document, new FakeIdleScheduler());
  const controller = new AbortController();
  const abortedProgress: number[] = [];
  const aborted = assets.prepare(
    { kind: "shell" },
    {
      urgency: "blocking",
      signal: controller.signal,
      onProgress: ({ completed }) => abortedProgress.push(completed),
    },
  );
  const joined = assets.prepare({ kind: "shell" }, { urgency: "blocking" });

  controller.abort(new Error("superseded"));
  await assertRejects(() => aborted, Error, "superseded");
  const progressAtAbort = abortedProgress.length;

  document.failAll();
  assertEquals((await joined).kind, "degraded");
  assertEquals(abortedProgress.length, progressAtAbort);
});

Deno.test("presentation asset caller abort suppresses late view-change notifications", async () => {
  const document = new FakeDocument();
  const controller = new AbortController();
  let assetChanges = 0;
  const assets = createTestAssets(document, new FakeIdleScheduler(), () => assetChanges++);
  const request = assets.prepare(
    { kind: "shell" },
    { urgency: "blocking", signal: controller.signal },
  );

  controller.abort();
  await assertRejects(() => request, DOMException, "aborted");
  document.loadAll();
  await flushSettlement();

  assertEquals(assetChanges, 0);
});

Deno.test("presentation asset change callback failure does not fail preparation", async () => {
  const originalError = console.error;
  const callbackErrors: unknown[][] = [];
  console.error = (...values: unknown[]) => callbackErrors.push(values);
  try {
    const document = new FakeDocument();
    const assets = createTestAssets(document, new FakeIdleScheduler(), () => {
      throw new Error("render failed");
    });
    const request = assets.prepare({ kind: "shell" }, { urgency: "blocking" });

    document.loadAll();
    assertEquals((await request).kind, "ready");
    assertEquals(callbackErrors.length, 2);
  } finally {
    console.error = originalError;
  }
});

Deno.test("presentation assets key critical and deferred records separately by level identity", async () => {
  const document = new FakeDocument();
  const idle = new FakeIdleScheduler();
  const assets = createTestAssets(document, idle);
  const level = SHIPPED_GAME.levels.start;
  const critical = assets.prepare({ kind: "level", level }, { urgency: "idle" });
  const joinedCritical = assets.prepare({ kind: "level", level }, { urgency: "idle" });
  const deferred = assets.prepare({ kind: "deferred", level }, { urgency: "idle" });

  assertEquals(idle.pending.size, 2);
  assets[Symbol.dispose]();
  await Promise.all([
    assertRejects(() => critical, DOMException, "Presentation assets disposed"),
    assertRejects(() => joinedCritical, DOMException, "Presentation assets disposed"),
    assertRejects(() => deferred, DOMException, "Presentation assets disposed"),
  ]);
});

Deno.test("presentation asset late subscribers receive the current monotonic progress snapshot", async () => {
  const document = new FakeDocument();
  const assets = createTestAssets(document, new FakeIdleScheduler());
  const progress: Array<readonly [number, number]> = [];
  const request = { kind: "level", level: SHIPPED_GAME.levels.start } as const;
  const first = assets.prepare(request, {
    urgency: "blocking",
    onProgress: ({ completed, total }) => progress.push([completed, total]),
  });

  document.failWhere((source) => !source.includes("/ui/"));
  await flushSettlement();
  assertEquals(progress.at(-1), [1, 2]);

  const lateProgress: Array<readonly [number, number]> = [];
  const joined = assets.prepare(request, {
    urgency: "blocking",
    onProgress: ({ completed, total }) => lateProgress.push([completed, total]),
  });
  assertEquals(lateProgress, [[1, 2]]);

  document.failWhere((source) => source.includes("/ui/"));
  await Promise.all([first, joined]);
  assertEquals(progress.at(-1), [2, 2]);
  assertEquals(lateProgress.at(-1), [2, 2]);
});

Deno.test("presentation asset disposal cancels idle handles and suppresses late callbacks", async () => {
  const document = new FakeDocument();
  const idle = new FakeIdleScheduler();
  let assetChanges = 0;
  const assets = createTestAssets(document, idle, () => assetChanges++);
  const shell = assets.prepare({ kind: "shell" }, { urgency: "idle" });
  const level = assets.prepare(
    { kind: "level", level: SHIPPED_GAME.levels.start },
    { urgency: "idle" },
  );

  assertEquals(idle.pending.size, 2);
  assets[Symbol.dispose]();
  assertEquals(idle.cancelled, [1, 2]);
  await Promise.all([
    assertRejects(() => shell, DOMException, "Presentation assets disposed"),
    assertRejects(() => level, DOMException, "Presentation assets disposed"),
  ]);

  idle.run(1);
  idle.run(2);
  await flushSettlement();
  assertEquals(document.images.length, 0);
  assertEquals(assetChanges, 0);
});

Deno.test("presentation asset disposal detaches in-flight work and suppresses ready-image callbacks", async () => {
  const document = new FakeDocument();
  let assetChanges = 0;
  const assets = createTestAssets(document, new FakeIdleScheduler(), () => assetChanges++);
  const shell = assets.prepare({ kind: "shell" }, { urgency: "blocking" });

  assets[Symbol.dispose]();
  await assertRejects(() => shell, DOMException, "Presentation assets disposed");
  for (const image of document.images) image.dispatch("load");
  await flushSettlement();

  assertEquals(assetChanges, 0);
});

Deno.test("presentation assets memoize terminal results and report terminal progress immediately", async () => {
  const document = new FakeDocument();
  const assets = createTestAssets(document, new FakeIdleScheduler());
  const first = assets.prepare({ kind: "shell" }, { urgency: "blocking" });
  document.failAll();
  const firstResult = await first;
  const imageCount = document.images.length;
  const progress: Array<readonly [number, number]> = [];

  const secondResult = await assets.prepare(
    { kind: "shell" },
    {
      urgency: "blocking",
      onProgress: ({ completed, total }) => progress.push([completed, total]),
    },
  );

  assertStrictEquals(secondResult, firstResult);
  assertEquals(document.images.length, imageCount);
  assertEquals(progress.length, 1);
  assertEquals(progress[0]?.[0], progress[0]?.[1]);
});

Deno.test("presentation assets reject and memoize first-person bake failures", async () => {
  await withFailingOffscreenCanvas(async () => {
    const document = new FakeDocument();
    const assets = createTestAssets(document, new FakeIdleScheduler());
    const request = { kind: "level", level: SHIPPED_GAME.levels.start } as const;
    const first = assets.prepare(request, { urgency: "blocking" });

    document.imageEnding("/textures/wall.png").dispatch("load");
    document.failAll();
    await assertRejects(() => first, Error, "raster failed");
    const imageCount = document.images.length;

    await assertRejects(
      () => assets.prepare(request, { urgency: "blocking" }),
      Error,
      "raster failed",
    );
    assertEquals(document.images.length, imageCount);
  });
});
