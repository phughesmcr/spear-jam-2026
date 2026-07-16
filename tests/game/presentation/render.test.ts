import type { FrameRenderSession } from "@/src/game/presentation/session_view.ts";
import type { GameMode, PlayerStatusSnapshot } from "@/src/game/model/state.ts";
import { DisplayName } from "@/src/game/content/names.ts";
import { Direction } from "turn-based-engine/crawler";
import { createGameMap } from "@/src/game/world/map.ts";
import type { FirstPersonRenderer } from "@/src/game/presentation/first_person/renderer.ts";
import { renderGameFrame } from "@/src/game/presentation/render.ts";
import { invalidateIntermissionCaches } from "@/src/game/presentation/ui/intermission.ts";
import { createGameRenderScratch } from "@/src/game/presentation/frame_scratch.ts";
import { assert, assertEquals } from "@std/assert";
import { SHIPPED_GAME } from "@/src/game/content/shipped.ts";
import { createPresentationAssetView } from "@/src/game/presentation/asset_view.ts";
import { createFirstPersonAssets } from "@/src/game/presentation/first_person/assets/mod.ts";

const FULL_CANVAS = { width: 720, height: 1280 };
const TEST_ASSETS = createPresentationAssetView(createFirstPersonAssets().view);

Deno.test("renderGameFrame draws a visible first-person vignette over the play area", () => {
  withFakeOffscreenCanvas((): void => {
    const ctx = new FakeGameContext();

    const result = renderWithScratch({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      canvasSize: FULL_CANVAS,
      session: fakeSession(),
      mode: { type: "playing" },
      firstPersonRenderer: fakeFirstPersonRenderer(),
    });
    assertEquals(result, { needsFrame: false });

    assertEquals(ctx.drawImages.length, 1);
    assertEquals(ctx.drawImages[0], { x: 0, y: 0, width: 720, height: 1280 });

    const gradient = FakeOffscreenCanvas.lastContext?.gradients[0];
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
  });
});

Deno.test("renderGameFrame stops requesting frames while paused", () => {
  const result = renderWithScratch({
    ctx: new FakeGameContext() as unknown as CanvasRenderingContext2D,
    canvasSize: FULL_CANVAS,
    session: fakeSession(),
    mode: { type: "paused" },
    firstPersonRenderer: fakeFirstPersonRenderer(true),
  });
  assertEquals(result, { needsFrame: false });
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
    const result = renderWithScratch({
      ctx: new FakeGameContext() as unknown as CanvasRenderingContext2D,
      canvasSize: FULL_CANVAS,
      session: fakeSession(() => {
        sessionTicks++;
      }),
      mode: { type: "playing" },
      viewMode: "topDown",
      nowMs: 120,
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

Deno.test("renderGameFrame performs no image requests in any asset-bearing presentation path", () => {
  withFakeOffscreenCanvas((): void => {
    const cases: readonly {
      readonly name: string;
      readonly mode: GameMode;
      readonly session?: FrameRenderSession;
      readonly combatFeedback?: boolean;
    }[] = [
      { name: "title", mode: { type: "title", intent: "start" } },
      {
        name: "help",
        mode: { type: "help", returnTo: { kind: "verbMenu", selectedIndex: 0 } },
      },
      {
        name: "portrait dialogue",
        mode: {
          type: "dialogue",
          title: "JOHN",
          message: "The network is listening.",
          choices: [{ label: "CONTINUE." }],
          speaker: DisplayName.John,
        },
      },
      {
        name: "spear dialogue",
        mode: {
          type: "dialogue",
          title: "THE SPEAR",
          message: "Power online.",
          choices: [{ label: "CONTINUE." }],
          art: "spearReveal",
        },
      },
      {
        name: "victory intermission",
        mode: {
          type: "intermission",
          pages: ["The System is gone."],
          pageIndex: 0,
          prompt: "Space to begin again",
          background: "victory",
          completion: { type: "returnToTitle" },
          revealStartedAtMs: 0,
          revealed: true,
        },
      },
      {
        name: "verb menu",
        mode: { type: "verbMenu", selectedIndex: 0 },
      },
      {
        name: "first-person HUD, weapon, and combat feedback",
        mode: { type: "playing" },
        session: fakeSession(),
        combatFeedback: true,
      },
    ];

    for (const testCase of cases) {
      const document = new FakeGameDocument();
      const ctx = new FakeGameContext(document);
      const scratch = createGameRenderScratch();
      if (testCase.combatFeedback === true) {
        scratch.presentation.combatFeedback = [{
          text: "HIT 4",
          tone: "hit",
          side: "player",
          roll: 18,
          total: 22,
        }];
      }

      renderWithScratch({
        ctx: ctx as unknown as CanvasRenderingContext2D,
        canvasSize: FULL_CANVAS,
        scratch,
        mode: testCase.mode,
        session: testCase.session,
        firstPersonRenderer: testCase.session === undefined ? undefined : fakeFirstPersonRenderer(),
      });

      assertEquals(document.images, [], testCase.name);
    }
  });
});

Deno.test("renderGameFrame fades the loaded turret scene to black before victory", () => {
  const ctx = new FakeGameContext();

  const result = renderWithScratch({
    ctx: ctx as unknown as CanvasRenderingContext2D,
    canvasSize: FULL_CANVAS,
    session: fakeSession(),
    mode: {
      type: "victoryTransition",
      fadeStartsAtMs: 1_000,
      completesAtMs: 1_500,
      levelStats: { elapsedMs: 0, moves: 0, monstersKilled: 0, totalMonsters: 0 },
    },
    viewMode: "topDown",
    nowMs: 1_250,
  });

  assertEquals(result, { needsFrame: true, ambientOnly: false });
  assertEquals(ctx.fillRects.at(-1), {
    rect: { x: 0, y: 0, width: 720, height: 1280 },
    fillStyle: "#000000",
    globalAlpha: 0.5,
    globalCompositeOperation: "source-over",
  });
});

Deno.test("renderGameFrame skips the background clear before opaque first-person blit", () => {
  withFakeOffscreenCanvas((): void => {
    const ctx = new FakeGameContext();

    renderWithScratch({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      canvasSize: FULL_CANVAS,
      session: fakeSession(),
      mode: { type: "playing" },
      firstPersonRenderer: fakeFirstPersonRenderer(),
    });

    assertEquals(
      ctx.fillRects.some((call) =>
        call.fillStyle === "#101217" && call.rect.width === 720 && call.rect.height === 1280
      ),
      false,
    );
  });
});

Deno.test("renderGameFrame clears the background for non-opaque modes", () => {
  const ctx = new FakeGameContext();

  renderWithScratch({
    ctx: ctx as unknown as CanvasRenderingContext2D,
    canvasSize: FULL_CANVAS,
    session: fakeSession(),
    mode: { type: "paused" },
    firstPersonRenderer: fakeFirstPersonRenderer(),
  });

  assertEquals(
    ctx.fillRects.some((call) => call.fillStyle === "#101217" && call.rect.width === 720 && call.rect.height === 1280),
    true,
  );
});

Deno.test("renderGameFrame returns first-person renderer frame demand", () => {
  const result = renderWithScratch({
    ctx: new FakeGameContext() as unknown as CanvasRenderingContext2D,
    canvasSize: FULL_CANVAS,
    session: fakeSession(),
    mode: { type: "playing" },
    firstPersonRenderer: fakeFirstPersonRenderer(true),
    nowMs: 240,
  });

  assertEquals(result, { needsFrame: true, ambientOnly: false });
});

Deno.test("renderGameFrame propagates ambient-only first-person frame demand", () => {
  const result = renderWithScratch({
    ctx: new FakeGameContext() as unknown as CanvasRenderingContext2D,
    canvasSize: FULL_CANVAS,
    session: fakeSession(),
    mode: { type: "playing" },
    firstPersonRenderer: fakeFirstPersonRenderer(true, true),
    nowMs: 240,
  });

  assertEquals(result, { needsFrame: true, ambientOnly: true });
});

Deno.test("renderGameFrame skips session rendering for opaque intermission mode", () => {
  withFakeOffscreenCanvas((): void => {
    invalidateIntermissionCaches();
    const scratch = createGameRenderScratch();
    let rendererCalls = 0;
    const renderer: FirstPersonRenderer = {
      ...fakeFirstPersonRenderer(true),
      render: (...args) => {
        rendererCalls++;
        fakeFirstPersonRenderer(true).render(...args);
      },
    };

    renderWithScratch({
      ctx: new FakeGameContext() as unknown as CanvasRenderingContext2D,
      canvasSize: FULL_CANVAS,
      scratch,
      session: fakeSession(),
      mode: {
        type: "intermission",
        pages: ["Signal received."],
        pageIndex: 0,
        prompt: "Continue",
        background: "system",
        completion: { type: "loadMap", mapName: "next" },
        revealStartedAtMs: 0,
        revealed: true,
      },
      firstPersonRenderer: renderer,
    });

    assertEquals(rendererCalls, 0);
    assertEquals(scratch.spy.sessionRenderCount, 0);
    assertEquals(scratch.spy.messageLogRenderCount, 0);
  });
});

function renderWithScratch(
  props: Omit<Parameters<typeof renderGameFrame>[0], "assets" | "scratch"> & {
    assets?: Parameters<typeof renderGameFrame>[0]["assets"];
    scratch?: ReturnType<typeof createGameRenderScratch>;
  },
) {
  const scratch = props.scratch ?? createGameRenderScratch();
  return renderGameFrame({
    assets: TEST_ASSETS,
    content: SHIPPED_GAME.presentation,
    simulationContent: SHIPPED_GAME.simulation,
    ...props,
    scratch,
  });
}

function fakeFirstPersonRenderer(needsFrame = false, ambientOnly = false): FirstPersonRenderer {
  return {
    reset(): void {},
    bump(): void {},
    render: (_ctx, _rect, _session, _nowMs, out) => {
      out.needsFrame = needsFrame;
      out.ambientOnly = needsFrame ? ambientOnly : false;
      out.cameraAngle = 0;
    },
  };
}

function fakeSession(onTick?: () => void): FrameRenderSession & { tick(): { readonly needsFrame: boolean } } {
  return {
    getMap: () =>
      createGameMap("Fake Map", [[1]], [], {
        palette: [{ kind: "floor", id: 1, floor_texture: "floor", ceiling_texture: "ceiling" }],
      }),
    getPlayerStatus: () => playerSnapshot(),
    getVisibility: () => ({ isVisible: () => false, isExplored: () => false }),
    getPlayerPosition: () => ({ x: 0, y: 0 }),
    forEachDrawable: () => {},
    forEachLight: () => {},
    tick: () => {
      onTick?.();
      return { needsFrame: true };
    },
    getPlayerFacing: () => ({ dir: Direction.North }),
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

class FakeOffscreenContext {
  fillStyle: FakeFillStyle = "";
  readonly gradients: FakeCanvasGradient[] = [];

  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): CanvasGradient {
    const gradient = new FakeCanvasGradient([x0, y0, 0, x1, y1, 0]);
    this.gradients.push(gradient);
    return gradient as unknown as CanvasGradient;
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

  fillRect(): void {}
}

class FakeOffscreenCanvas {
  static lastContext: FakeOffscreenContext | undefined;
  readonly width: number;
  readonly height: number;
  private readonly context = new FakeOffscreenContext();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    FakeOffscreenCanvas.lastContext = this.context;
  }

  getContext(contextId: string): FakeOffscreenContext | null {
    return contextId === "2d" ? this.context : null;
  }
}

function withFakeOffscreenCanvas(run: () => void): void {
  const original = globalThis.OffscreenCanvas;
  FakeOffscreenCanvas.lastContext = undefined;
  Object.defineProperty(globalThis, "OffscreenCanvas", {
    configurable: true,
    writable: true,
    value: FakeOffscreenCanvas as unknown as typeof OffscreenCanvas,
  });
  try {
    run();
  } finally {
    Object.defineProperty(globalThis, "OffscreenCanvas", {
      configurable: true,
      writable: true,
      value: original,
    });
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
  shadowBlur = 0;
  shadowColor = "";
  strokeStyle: FakeFillStyle = "";
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";
  readonly gradients: FakeCanvasGradient[] = [];
  readonly fillRects: FakeFillRectCall[] = [];
  readonly drawImages: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[] =
    [];
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

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient {
    const gradient = new FakeCanvasGradient([x0, y0, 0, x1, y1, 0]);
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

  arc(): void {}
  arcTo(): void {}
  beginPath(): void {}
  closePath(): void {}
  clip(): void {}
  drawImage(image: { readonly width: number; readonly height: number }, x: number, y: number): void {
    this.drawImages.push({ x, y, width: image.width, height: image.height });
  }
  ellipse(): void {}
  fill(): void {}
  fillText(): void {}
  lineTo(): void {}
  moveTo(): void {}
  rect(): void {}
  scale(): void {}
  stroke(): void {}
  strokeRect(): void {}
  translate(): void {}

  measureText(text: string): TextMetrics {
    return { width: text.length * 8 } as TextMetrics;
  }
}
