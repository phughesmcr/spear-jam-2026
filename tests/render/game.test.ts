import { assert, assertEquals } from "@std/assert";
import type { PlayerStatusSnapshot } from "@/src/ecs/progression.ts";
import type { GameSession } from "@/src/ecs/session.ts";
import { Direction } from "@/src/grid/direction.ts";
import { createGameMap } from "@/src/map/map.ts";
import { renderGameFrame } from "@/src/render/game.ts";
import type { FirstPersonRenderer } from "@/src/render/first_person.ts";

const FULL_CANVAS = { width: 720, height: 1280 };

Deno.test("renderGameFrame draws a visible first-person vignette over the play area", () => {
  const ctx = new FakeGameContext();

  const result = renderGameFrame({
    ctx: ctx as unknown as CanvasRenderingContext2D,
    canvasSize: FULL_CANVAS,
    session: fakeSession(),
    mode: { type: "playing" },
    firstPersonRenderer: fakeFirstPersonRenderer(),
  });
  assertEquals(result, { needsFrame: false });

  const gradient = ctx.gradients[0];
  assert(gradient !== undefined);
  assertEquals(gradient.colorStops, [
    { offset: 0, color: "rgba(0, 0, 0, 0)" },
    { offset: 0.42, color: "rgba(0, 0, 0, 0)" },
    { offset: 0.72, color: "rgba(0, 0, 0, 0.32)" },
    { offset: 1, color: "rgba(0, 0, 0, 0.78)" },
  ]);

  const [, , innerRadius, , , outerRadius] = gradient.args;
  assertEquals(innerRadius, 201.60000000000002);
  assert(outerRadius > 779 && outerRadius < 780);

  const vignetteFill = ctx.fillRects.find((call) => call.fillStyle === gradient);
  assert(vignetteFill !== undefined);
  assertEquals(vignetteFill.rect, { x: 0, y: 0, width: 720, height: 1280 });
  assertEquals(vignetteFill.globalAlpha, 1);
  assertEquals(vignetteFill.globalCompositeOperation, "source-over");
});

Deno.test("renderGameFrame does not schedule RAF or tick the session in top-down mode", () => {
  let scheduledFrames = 0;
  let sessionTicks = 0;
  const hadOwnRaf = Object.hasOwn(globalThis, "requestAnimationFrame");
  const ownRaf = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame");
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    writable: true,
    value: (_callback: FrameRequestCallback): number => {
      scheduledFrames++;
      return scheduledFrames;
    },
  });

  try {
    const result = renderGameFrame({
      ctx: new FakeGameContext() as unknown as CanvasRenderingContext2D,
      canvasSize: FULL_CANVAS,
      session: fakeSession(() => {
        sessionTicks++;
      }),
      mode: { type: "playing" },
      viewMode: "topDown",
      nowMs: 120,
      onAssetLoad: () => {},
    });

    assertEquals(result, { needsFrame: false });
    assertEquals(scheduledFrames, 0);
    assertEquals(sessionTicks, 0);
  } finally {
    if (hadOwnRaf && ownRaf !== undefined) {
      Object.defineProperty(globalThis, "requestAnimationFrame", ownRaf);
    } else {
      delete (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame;
    }
  }
});

Deno.test("renderGameFrame requests the help image in help mode", () => {
  const document = new FakeGameDocument();
  const ctx = new FakeGameContext(document);

  const result = renderGameFrame({
    ctx: ctx as unknown as CanvasRenderingContext2D,
    canvasSize: FULL_CANVAS,
    mode: { type: "help", selectedIndex: 0 },
  });

  assertEquals(result, { needsFrame: false });
  assert(document.images.some((image) => image.src.endsWith("/assets/game/help.png")));
});

Deno.test("renderGameFrame returns first-person renderer frame demand", () => {
  const result = renderGameFrame({
    ctx: new FakeGameContext() as unknown as CanvasRenderingContext2D,
    canvasSize: FULL_CANVAS,
    session: fakeSession(),
    mode: { type: "playing" },
    firstPersonRenderer: fakeFirstPersonRenderer(true),
    nowMs: 240,
  });

  assertEquals(result, { needsFrame: true });
});

function fakeFirstPersonRenderer(needsFrame = false): FirstPersonRenderer {
  return {
    preloadAssets: () => Promise.resolve(),
    sceneForMap(): never {
      throw new Error("Unexpected sceneForMap call.");
    },
    reset(): void {},
    bump(): void {},
    render: () => ({ needsFrame }),
  };
}

function fakeSession(onTick?: () => void): GameSession {
  return {
    map: createGameMap("Fake Map", [[1]], [], {
      palette: [{ kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" }],
    }),
    getPlayerStatus: () => playerSnapshot(),
    getVisibility: () => undefined,
    forEachDrawable: () => {},
    targetMarkerTone: () => undefined,
    tick: () => {
      onTick?.();
      return { needsFrame: true };
    },
    getPlayerFacing: () => ({ dir: Direction.North }),
  } as unknown as GameSession;
}

function playerSnapshot(): PlayerStatusSnapshot {
  return {
    heldKeys: [],
    selectedWeapon: 1,
    unlockedWeapons: [1],
    ammo: { pistol: 0, cannon: 0 },
    health: { current: 10, max: 10 },
    hasUplinkCode: false,
    progress: {
      credits: 0,
      score: 0,
      xp: 0,
      levelCredits: 0,
    },
  };
}

type FakeFillStyle = string | CanvasGradient | CanvasPattern;

type FakeFillRectCall = {
  readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly fillStyle: FakeFillStyle;
  readonly globalAlpha: number;
  readonly globalCompositeOperation: GlobalCompositeOperation;
};

class FakeCanvasGradient {
  readonly colorStops: { readonly offset: number; readonly color: string }[] = [];
  readonly args: readonly [number, number, number, number, number, number];

  constructor(args: readonly [number, number, number, number, number, number]) {
    this.args = args;
  }

  addColorStop(offset: number, color: string): void {
    this.colorStops.push({ offset, color });
  }
}

class FakeGameImage {
  decoding: "async" | "auto" | "sync" = "auto";
  src = "";
  width = 1;
  height = 1;
  naturalWidth = 1;
  naturalHeight = 1;

  addEventListener(): void {}
}

class FakeGameDocument {
  readonly images: FakeGameImage[] = [];

  createElement(tagName: string): FakeGameImage {
    if (tagName !== "img") throw new Error(`Unexpected tag ${tagName}.`);
    const image = new FakeGameImage();
    this.images.push(image);
    return image;
  }
}

class FakeGameContext {
  readonly canvas: { readonly ownerDocument: FakeGameDocument };
  fillStyle: FakeFillStyle = "";
  font = "";
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = "source-over";
  imageSmoothingEnabled = true;
  lineCap: CanvasLineCap = "butt";
  lineWidth = 1;
  strokeStyle: FakeFillStyle = "";
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";
  readonly gradients: FakeCanvasGradient[] = [];
  readonly fillRects: FakeFillRectCall[] = [];
  private readonly stack: {
    readonly fillStyle: FakeFillStyle;
    readonly globalAlpha: number;
    readonly globalCompositeOperation: GlobalCompositeOperation;
    readonly imageSmoothingEnabled: boolean;
  }[] = [];

  constructor(document = new FakeGameDocument()) {
    this.canvas = { ownerDocument: document };
  }

  save(): void {
    this.stack.push({
      fillStyle: this.fillStyle,
      globalAlpha: this.globalAlpha,
      globalCompositeOperation: this.globalCompositeOperation,
      imageSmoothingEnabled: this.imageSmoothingEnabled,
    });
  }

  restore(): void {
    const state = this.stack.pop();
    if (state === undefined) return;
    this.fillStyle = state.fillStyle;
    this.globalAlpha = state.globalAlpha;
    this.globalCompositeOperation = state.globalCompositeOperation;
    this.imageSmoothingEnabled = state.imageSmoothingEnabled;
  }

  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): CanvasGradient {
    const gradient = new FakeCanvasGradient([x0, y0, r0, x1, y1, r1]);
    this.gradients.push(gradient);
    return gradient as unknown as CanvasGradient;
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    this.fillRects.push({
      rect: { x, y, width, height },
      fillStyle: this.fillStyle,
      globalAlpha: this.globalAlpha,
      globalCompositeOperation: this.globalCompositeOperation,
    });
  }

  beginPath(): void {}
  closePath(): void {}
  clip(): void {}
  drawImage(): void {}
  ellipse(): void {}
  fill(): void {}
  fillText(): void {}
  lineTo(): void {}
  moveTo(): void {}
  rect(): void {}
  stroke(): void {}
  strokeRect(): void {}

  measureText(text: string): TextMetrics {
    return { width: text.length * 8 } as TextMetrics;
  }
}
