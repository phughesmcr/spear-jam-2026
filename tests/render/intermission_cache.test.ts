import { assertEquals } from "@std/assert";
import { invalidateIntermissionCaches, renderIntermission } from "@/src/render/intermission.ts";
import { createRenderSpy } from "@/src/render/render_scratch.ts";

const FULL_CANVAS = { width: 720, height: 1280 };

Deno.test("renderIntermission reuses cached background across warm frames", () => {
  withFakeOffscreenCanvas(() => {
    invalidateIntermissionCaches();
    const ctx = new FakeIntermissionContext();
    const mode = {
      type: "intermission" as const,
      pages: ["The first breach is open."],
      pageIndex: 0,
      prompt: "Continue",
      background: "system" as const,
      completion: { type: "loadMap" as const, mapName: "next" },
      revealStartedAtMs: 0,
      revealed: true,
    };

    renderIntermission(ctx as unknown as CanvasRenderingContext2D, FULL_CANVAS, mode, 0, createRenderSpy());
    renderIntermission(ctx as unknown as CanvasRenderingContext2D, FULL_CANVAS, mode, 16, createRenderSpy());

    assertEquals(ctx.drawImageCalls, 2);
    assertEquals(FakeOffscreenCanvas.createCount, 1);
  });
});

function withFakeOffscreenCanvas(run: () => void): void {
  const original = globalThis.OffscreenCanvas;
  FakeOffscreenCanvas.createCount = 0;
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

class FakeOffscreenContext {
  fillStyle = "";
  createLinearGradient(): CanvasGradient {
    return { addColorStop() {} } as CanvasGradient;
  }
  fillRect(): void {}
}

class FakeOffscreenCanvas {
  static createCount = 0;
  readonly width: number;
  readonly height: number;
  private readonly context = new FakeOffscreenContext();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    FakeOffscreenCanvas.createCount++;
  }

  getContext(): FakeOffscreenContext {
    return this.context;
  }
}

class FakeIntermissionContext {
  drawImageCalls = 0;

  save(): void {}
  restore(): void {}
  fillText(): void {}
  stroke(): void {}
  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  rect(): void {}
  clip(): void {}

  measureText(text: string): TextMetrics {
    return { width: text.length * 8 } as TextMetrics;
  }

  drawImage(image: { width: number; height: number }): void {
    this.drawImageCalls++;
    void image;
  }
}
