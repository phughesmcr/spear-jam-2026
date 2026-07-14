import { createPresentationRuntime } from "@/src/app/presentation_runtime.ts";
import type { FrameRenderSession } from "@/src/game/presentation/session_view.ts";
import type { PlayerStatusSnapshot } from "@/src/game/model/state.ts";
import { createGameModel, type GameModel } from "@/src/game/model/transition/mod.ts";
import { Direction } from "@/src/game/world/direction.ts";
import { START_MAP_NAME } from "@/src/game/world/campaign.ts";
import { createGameMap } from "@/src/game/world/map.ts";
import type { FirstPersonRenderer } from "@/src/game/presentation/first_person/renderer.ts";
import { assertEquals } from "@std/assert";

Deno.test("presentation runtime renderNow cancels a pending RAF before rendering immediately", () => {
  const window = new FakeWindow();
  let model = modelNeedingFrame();
  const runtime = createPresentationRuntime({
    host: window as unknown as Window,
    document: new FakeDocument() as unknown as Document,
    ctx: new FakeContext() as unknown as CanvasRenderingContext2D,
    signal: new AbortController().signal,
    onError: ignoreError,
    getModel: () => model,
    getSession: () => undefined,
    tickSession: noFrameTick,
    firstPersonRenderer: fakeFirstPersonRenderer(),
  });

  runtime.start();
  runtime.renderNow();
  runtime.renderNow();

  assertEquals(window.requestedFrameIds, [1, 2]);
  assertEquals(window.cancelledFrameIds, [1]);
  model = modelWithoutFrame();
  runtime[Symbol.dispose]();
});

Deno.test("presentation runtime RAF callback clears the pending frame before requesting another", () => {
  const window = new FakeWindow();
  const runtime = createPresentationRuntime({
    host: window as unknown as Window,
    document: new FakeDocument() as unknown as Document,
    ctx: new FakeContext() as unknown as CanvasRenderingContext2D,
    signal: new AbortController().signal,
    onError: ignoreError,
    getModel: () => modelNeedingFrame(),
    getSession: () => undefined,
    tickSession: noFrameTick,
    firstPersonRenderer: fakeFirstPersonRenderer(),
  });

  runtime.start();
  runtime.renderNow();
  window.runFrame(1, 32);

  assertEquals(window.requestedFrameIds, [1, 2]);
  assertEquals(window.cancelledFrameIds, []);
  runtime[Symbol.dispose]();
});

Deno.test("presentation runtime RAF skips work until the interactive fps budget elapses", () => {
  const window = new FakeWindow();
  let updateCount = 0;
  const nowMs = 1_000;
  const originalNow = performance.now.bind(performance);
  Object.defineProperty(performance, "now", {
    configurable: true,
    value: () => nowMs,
  });

  try {
    const runtime = createPresentationRuntime({
      host: window as unknown as Window,
      document: new FakeDocument() as unknown as Document,
      ctx: new FakeContext() as unknown as CanvasRenderingContext2D,
      signal: new AbortController().signal,
      onError: ignoreError,
      getModel: () => {
        updateCount++;
        return modelNeedingFrame();
      },
      getSession: () => undefined,
      tickSession: noFrameTick,
      firstPersonRenderer: fakeFirstPersonRenderer(),
    });

    runtime.start();
    runtime.renderNow();
    assertEquals(updateCount, 1);

    // First scheduled RAF is too soon after renderNow — reschedule without rendering.
    window.runFrame(1, nowMs + 1);
    assertEquals(updateCount, 1);
    assertEquals(window.requestedFrameIds, [1, 2]);

    // Past the ~28.6 ms budget — render again.
    window.runFrame(2, nowMs + 40);
    assertEquals(updateCount, 2);
    runtime[Symbol.dispose]();
  } finally {
    Object.defineProperty(performance, "now", {
      configurable: true,
      value: originalNow,
    });
  }
});

Deno.test("presentation runtime RAF uses the model interactiveFps for the interactive budget", () => {
  const window = new FakeWindow();
  let updateCount = 0;
  const nowMs = 1_000;
  const originalNow = performance.now.bind(performance);
  Object.defineProperty(performance, "now", {
    configurable: true,
    value: () => nowMs,
  });

  try {
    const runtime = createPresentationRuntime({
      host: window as unknown as Window,
      document: new FakeDocument() as unknown as Document,
      ctx: new FakeContext() as unknown as CanvasRenderingContext2D,
      signal: new AbortController().signal,
      onError: ignoreError,
      getModel: () => {
        updateCount++;
        return { ...modelNeedingFrame(), interactiveFps: 12 };
      },
      getSession: () => undefined,
      tickSession: noFrameTick,
      firstPersonRenderer: fakeFirstPersonRenderer(),
    });

    runtime.start();
    runtime.renderNow();
    assertEquals(updateCount, 1);

    // Still inside the 12 fps (~83 ms) budget — reschedule without rendering.
    window.runFrame(1, nowMs + 40);
    assertEquals(updateCount, 1);
    assertEquals(window.requestedFrameIds, [1, 2]);

    // Past the 12 fps budget — render again.
    window.runFrame(2, nowMs + 90);
    assertEquals(updateCount, 2);
    runtime[Symbol.dispose]();
  } finally {
    Object.defineProperty(performance, "now", {
      configurable: true,
      value: originalNow,
    });
  }
});

Deno.test("presentation runtime RAF uses a 12 fps budget for ambient-only first-person animation", () => {
  const window = new FakeWindow();
  let updateCount = 0;
  const nowMs = 1_000;
  const originalNow = performance.now.bind(performance);
  Object.defineProperty(performance, "now", {
    configurable: true,
    value: () => nowMs,
  });
  const originalOffscreen = globalThis.OffscreenCanvas;
  Object.defineProperty(globalThis, "OffscreenCanvas", {
    configurable: true,
    writable: true,
    value: FakeOffscreenCanvas as unknown as typeof OffscreenCanvas,
  });

  try {
    const runtime = createPresentationRuntime({
      host: window as unknown as Window,
      document: new FakeDocument() as unknown as Document,
      ctx: new FakeContext() as unknown as CanvasRenderingContext2D,
      signal: new AbortController().signal,
      onError: ignoreError,
      getModel: () => {
        updateCount++;
        return playingModel();
      },
      getSession: () => fakePlayingSession(),
      tickSession: noFrameTick,
      firstPersonRenderer: fakeFirstPersonRenderer({ needsFrame: true, ambientOnly: true }),
    });

    runtime.start();
    runtime.renderNow();
    assertEquals(updateCount, 1);

    // Still inside the ambient ~83 ms budget — reschedule without rendering.
    window.runFrame(1, nowMs + 40);
    assertEquals(updateCount, 1);
    assertEquals(window.requestedFrameIds, [1, 2]);

    // Past the ambient budget — render again.
    window.runFrame(2, nowMs + 90);
    assertEquals(updateCount, 2);
    runtime[Symbol.dispose]();
  } finally {
    Object.defineProperty(performance, "now", {
      configurable: true,
      value: originalNow,
    });
    Object.defineProperty(globalThis, "OffscreenCanvas", {
      configurable: true,
      writable: true,
      value: originalOffscreen,
    });
  }
});

Deno.test("presentation runtime dispose cancels its pending RAF", () => {
  const window = new FakeWindow();
  const runtime = createPresentationRuntime({
    host: window as unknown as Window,
    document: new FakeDocument() as unknown as Document,
    ctx: new FakeContext() as unknown as CanvasRenderingContext2D,
    signal: new AbortController().signal,
    onError: ignoreError,
    getModel: () => modelNeedingFrame(),
    getSession: () => undefined,
    tickSession: noFrameTick,
    firstPersonRenderer: fakeFirstPersonRenderer(),
  });

  runtime.start();
  runtime.renderNow();
  runtime[Symbol.dispose]();

  assertEquals(window.cancelledFrameIds, [1]);
});

Deno.test("presentation runtime forwards a rejected background asset warm to onError exactly once", async () => {
  const failure = new Error("warm failed");
  const errors: unknown[] = [];
  const hadOwnIdleCallback = Object.hasOwn(globalThis, "requestIdleCallback");
  const ownIdleCallback = Object.getOwnPropertyDescriptor(globalThis, "requestIdleCallback");
  Object.defineProperty(globalThis, "requestIdleCallback", {
    configurable: true,
    writable: true,
    value: (callback: () => void): number => {
      callback();
      return 1;
    },
  });

  try {
    const runtime = createPresentationRuntime({
      host: new FakeWindow() as unknown as Window,
      document: new FakeDocument() as unknown as Document,
      ctx: new FakeContext() as unknown as CanvasRenderingContext2D,
      signal: new AbortController().signal,
      onError: (error) => errors.push(error),
      getModel: () => modelWithoutFrame(),
      getSession: () => undefined,
      tickSession: noFrameTick,
      firstPersonRenderer: fakeFirstPersonRenderer({ needsFrame: false }, failure),
    });

    runtime.warmDeferredAssets(START_MAP_NAME);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assertEquals(errors.length, 1);
    assertEquals(errors[0], failure);
    runtime[Symbol.dispose]();
  } finally {
    if (hadOwnIdleCallback && ownIdleCallback !== undefined) {
      Object.defineProperty(globalThis, "requestIdleCallback", ownIdleCallback);
    } else {
      delete (globalThis as { requestIdleCallback?: typeof requestIdleCallback }).requestIdleCallback;
    }
  }
});

function modelNeedingFrame(): GameModel {
  const model = createGameModel("Level 1");
  return {
    ...model,
    presentation: {
      messages: [{ text: "keep drawing", expiresAtMs: Number.POSITIVE_INFINITY }],
      combatFeedback: [],
    },
  };
}

function modelWithoutFrame(): GameModel {
  return createGameModel("Level 1");
}

function playingModel(): GameModel {
  const model = createGameModel("Level 1");
  return {
    ...model,
    mode: { type: "playing" },
  };
}

function fakeFirstPersonRenderer(
  result: { readonly needsFrame: boolean; readonly ambientOnly?: boolean } = { needsFrame: false },
  warmError?: unknown,
): FirstPersonRenderer {
  return {
    preloadMapAssets() {
      return Promise.resolve();
    },
    warmRemainingAssets() {
      return warmError === undefined ? Promise.resolve() : Promise.reject(warmError);
    },
    reset() {},
    bump() {},
    render(_ctx, _rect, _session, _nowMs, out) {
      out.needsFrame = result.needsFrame;
      out.ambientOnly = result.ambientOnly === true;
      out.cameraAngle = 0;
    },
  };
}

function ignoreError(_error: unknown): void {}

function noFrameTick(): { readonly needsFrame: false } {
  return { needsFrame: false };
}

function fakePlayingSession(): FrameRenderSession {
  return {
    getPlayerPosition: () => ({ x: 0, y: 0 }),
    getPlayerFacing: () => ({ dir: Direction.East }),
    getMap: () =>
      createGameMap("Fake Map", [[1]], [], {
        palette: [{ kind: "floor", id: 1, floor_texture: "floor", ceiling_texture: "ceiling" }],
      }),
    getPlayerStatus: () => playerSnapshot(),
    getVisibility: () => ({ isVisible: () => false, isExplored: () => false }),
    forEachDrawable() {},
    forEachLight() {},
  };
}

function playerSnapshot(): PlayerStatusSnapshot {
  return {
    heldKeys: [],
    selectedWeapon: 1,
    unlockedWeapons: [1],
    ammo: { pistol: 0, cannon: 0 },
    health: { current: 10, max: 10 },
    hasUplinkCode: false,
    hasSpear: false,
    progress: {
      credits: 0,
      score: 0,
      xp: 0,
      levelCredits: 0,
    },
  };
}

class FakeWindow {
  readonly requestedFrameIds: number[] = [];
  readonly cancelledFrameIds: number[] = [];
  private nextFrameId = 1;
  private readonly callbacks = new Map<number, FrameRequestCallback>();

  requestAnimationFrame(callback: FrameRequestCallback): number {
    const id = this.nextFrameId++;
    this.requestedFrameIds.push(id);
    this.callbacks.set(id, callback);
    return id;
  }

  cancelAnimationFrame(id: number): void {
    this.cancelledFrameIds.push(id);
    this.callbacks.delete(id);
  }

  runFrame(id: number, nowMs: number): void {
    const callback = this.callbacks.get(id);
    if (callback === undefined) throw new Error(`No RAF callback for id ${id}.`);
    this.callbacks.delete(id);
    callback(nowMs);
  }
}

class FakeDocument {
  createElement(tagName: string): FakeImage {
    if (tagName !== "img") throw new Error(`Unexpected element ${tagName}.`);
    return new FakeImage();
  }
}

class FakeImage {
  decoding: "async" | "auto" | "sync" = "auto";
  src = "";
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  addEventListener(): void {}
  decode(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeOffscreenContext {
  fillStyle: string | CanvasGradient | CanvasPattern = "";

  createRadialGradient(): CanvasGradient {
    return {
      addColorStop() {},
    } as unknown as CanvasGradient;
  }

  fillRect(): void {}
}

class FakeOffscreenCanvas {
  readonly width: number;
  readonly height: number;
  private readonly context = new FakeOffscreenContext();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext(contextId: string): FakeOffscreenContext | null {
    return contextId === "2d" ? this.context : null;
  }
}

class FakeContext {
  readonly canvas = { ownerDocument: new FakeDocument() };
  fillStyle: string | CanvasGradient | CanvasPattern = "";
  font = "";
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = "source-over";
  imageSmoothingEnabled = true;
  lineCap: CanvasLineCap = "butt";
  lineWidth = 1;
  strokeStyle: string | CanvasGradient | CanvasPattern = "";
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";

  beginPath(): void {}
  closePath(): void {}
  clip(): void {}
  createRadialGradient(): CanvasGradient {
    return {
      addColorStop() {},
    } as unknown as CanvasGradient;
  }
  drawImage(): void {}
  ellipse(): void {}
  fill(): void {}
  fillRect(): void {}
  fillText(): void {}
  lineTo(): void {}
  moveTo(): void {}
  rect(): void {}
  restore(): void {}
  save(): void {}
  stroke(): void {}
  strokeRect(): void {}

  measureText(text: string): TextMetrics {
    return { width: text.length * 8 } as TextMetrics;
  }
}
