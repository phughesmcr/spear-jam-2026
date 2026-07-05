import { assert, assertEquals } from "@std/assert";
import type { PlayerStateSnapshot } from "@/src/ecs/progression.ts";
import type { GameSession } from "@/src/ecs/session.ts";
import { Direction } from "@/src/grid/direction.ts";
import { createGameMap } from "@/src/map/map.ts";
import { renderGameFrame } from "@/src/render/game.ts";
import type { FirstPersonRenderer } from "@/src/render/first_person.ts";

const FULL_CANVAS = { width: 720, height: 1280 };

Deno.test("renderGameFrame draws a visible first-person vignette over the play area", () => {
  const ctx = new FakeGameContext();

  renderGameFrame(
    ctx as unknown as CanvasRenderingContext2D,
    FULL_CANVAS,
    fakeSession(),
    { type: "playing" },
    [],
    [],
    "firstPerson",
    "idle",
    fakeFirstPersonRenderer(),
  );

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

Deno.test("renderGameFrame schedules top-down repaint while ECS sprite animations are active", () => {
  const callbacks: FrameRequestCallback[] = [];
  const hadOwnRaf = Object.hasOwn(globalThis, "requestAnimationFrame");
  const ownRaf = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame");
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    writable: true,
    value: (callback: FrameRequestCallback): number => {
      callbacks.push(callback);
      return callbacks.length;
    },
  });

  let repaints = 0;
  try {
    renderGameFrame(
      new FakeGameContext() as unknown as CanvasRenderingContext2D,
      FULL_CANVAS,
      fakeSession(true),
      { type: "playing" },
      [],
      [],
      "topDown",
      "idle",
      undefined,
      {},
      () => {
        repaints++;
      },
    );

    assertEquals(callbacks.length, 1);
    callbacks[0]?.(0);
    assertEquals(repaints, 1);
  } finally {
    if (hadOwnRaf && ownRaf !== undefined) {
      Object.defineProperty(globalThis, "requestAnimationFrame", ownRaf);
    } else {
      delete (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame;
    }
  }
});

function fakeFirstPersonRenderer(): FirstPersonRenderer {
  return {
    preloadAssets: () => Promise.resolve(),
    sceneForMap(): never {
      throw new Error("Unexpected sceneForMap call.");
    },
    reset(): void {},
    bump(): void {},
    render(): void {},
  };
}

function fakeSession(spriteAnimationsActive = false): GameSession {
  return {
    map: createGameMap("Fake Map", [[1]], [], {
      palette: [{ kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" }],
    }),
    getPlayerState: () => playerSnapshot(),
    getVisibility: () => undefined,
    forEachDrawable: () => {},
    targetMarkerTone: () => undefined,
    advanceSpriteAnimations: () => spriteAnimationsActive,
    getPlayerFacing: () => ({ dir: Direction.North }),
  } as unknown as GameSession;
}

function playerSnapshot(): PlayerStateSnapshot {
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
    turnEffects: [],
    storyFlags: [],
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
  createElement(tagName: string): FakeGameImage {
    if (tagName !== "img") throw new Error(`Unexpected tag ${tagName}.`);
    return new FakeGameImage();
  }
}

class FakeGameContext {
  readonly canvas = { ownerDocument: new FakeGameDocument() };
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
