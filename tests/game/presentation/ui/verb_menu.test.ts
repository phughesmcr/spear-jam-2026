import { assertEquals } from "@std/assert";
import { VERBS } from "@/src/game/model/verbs.ts";
import {
  renderVerbMenu,
  verbMenuButtonRects,
  verbMenuSpriteRect,
  verbMenuTargetAt,
} from "@/src/game/presentation/ui/verb_menu.ts";

const SELECTED_VERB_BACKGROUND = "rgba(34, 211, 238, 0.22)";

Deno.test("verbMenuSpriteRect presents the sprite full width on portrait canvases", () => {
  assertEquals(verbMenuSpriteRect({ width: 720, height: 1280 }), {
    x: 0,
    y: 280,
    size: 720,
  });
});

Deno.test("verbMenuTargetAt maps body parts to verbs", () => {
  const canvasSize = { width: 720, height: 1280 };
  const rect = verbMenuSpriteRect(canvasSize);

  const verbAt = (x: number, y: number): string | undefined => {
    const target = verbMenuTargetAt(canvasSize, {
      x: rect.x + x * rect.size,
      y: rect.y + y * rect.size,
    });
    return target?.kind === "verb" ? VERBS[target.verbIndex]?.label : undefined;
  };

  assertEquals(verbAt(0.86, 0.39), "ATTACK");
  assertEquals(verbAt(0.17, 0.44), "USE");
  assertEquals(verbAt(0.53, 0.57), "OPEN");
  assertEquals(verbAt(0.5, 0.27), "EXAMINE");
  assertEquals(verbAt(0.5, 0.37), "TALK");
  assertEquals(verbAt(0.5, -0.1), undefined);
});

Deno.test("verbMenuTargetAt maps visible verb labels to verbs", () => {
  const canvasSize = { width: 720, height: 1280 };
  const rect = verbMenuSpriteRect(canvasSize);

  const verbAt = (x: number, y: number): string | undefined => {
    const target = verbMenuTargetAt(canvasSize, {
      x: rect.x + x * rect.size,
      y: rect.y + y * rect.size,
    });
    return target?.kind === "verb" ? VERBS[target.verbIndex]?.label : undefined;
  };

  assertEquals(verbAt(0.1, 0.28), "USE");
  assertEquals(verbAt(0.4, 0.14), "EXAMINE");
  assertEquals(verbAt(0.46, 0.72), "OPEN");
});

Deno.test("verbMenuTargetAt maps menu buttons to controls and weapon slots", () => {
  const canvasSize = { width: 720, height: 1280 };
  const rects = verbMenuButtonRects(canvasSize);

  assertEquals(rects.map((rect) => ({ label: rect.label, target: rect.target })), [
    { label: "CLOSE", target: { kind: "control", control: "close" } },
    { label: "WAIT", target: { kind: "control", control: "wait" } },
    { label: "MAP", target: { kind: "control", control: "toggleView" } },
    { label: "HELP", target: { kind: "control", control: "help" } },
    { label: "BLADE", target: { kind: "weapon", slot: 1 } },
    { label: "GUN", target: { kind: "weapon", slot: 2 } },
    { label: "CANNON", target: { kind: "weapon", slot: 3 } },
  ]);
  assertEquals(rects[0], {
    label: "CLOSE",
    target: { kind: "control", control: "close" },
    x: 590,
    y: 18,
    width: 112,
    height: 49,
  });
  assertEquals(
    rects.map((rect) =>
      verbMenuTargetAt(canvasSize, {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
      })
    ),
    [
      { kind: "control", control: "close" },
      { kind: "control", control: "wait" },
      { kind: "control", control: "toggleView" },
      { kind: "control", control: "help" },
      { kind: "weapon", slot: 1 },
      { kind: "weapon", slot: 2 },
      { kind: "weapon", slot: 3 },
    ],
  );
});

Deno.test("renderVerbMenu does not highlight a verb without a hover target", () => {
  const ctx = new FakeVerbMenuContext();

  renderVerbMenu(ctx as unknown as CanvasRenderingContext2D, { width: 720, height: 1280 }, 0);

  assertEquals(ctx.fillRects.some((call) => call.fillStyle === SELECTED_VERB_BACKGROUND), false);
});

Deno.test("renderVerbMenu highlights the hovered verb in the text fallback menu", () => {
  const ctx = new FakeVerbMenuContext();

  renderVerbMenu(ctx as unknown as CanvasRenderingContext2D, { width: 720, height: 1280 }, 0, {
    kind: "verb",
    verbIndex: 0,
  });

  assertEquals(ctx.fillRects.some((call) => call.fillStyle === SELECTED_VERB_BACKGROUND), true);
});

type FakeFillRectCall = {
  readonly fillStyle: string | CanvasGradient | CanvasPattern;
};

class FakeVerbMenuImage {
  decoding: "async" | "auto" | "sync" = "auto";
  src = "";

  addEventListener(): void {}
}

class FakeVerbMenuDocument {
  createElement(tagName: string): FakeVerbMenuImage {
    if (tagName !== "img") throw new Error(`Unexpected tag ${tagName}.`);
    return new FakeVerbMenuImage();
  }
}

class FakeVerbMenuContext {
  readonly canvas = { ownerDocument: new FakeVerbMenuDocument() };
  fillStyle: string | CanvasGradient | CanvasPattern = "";
  font = "";
  lineWidth = 1;
  strokeStyle: string | CanvasGradient | CanvasPattern = "";
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";
  readonly fillRects: FakeFillRectCall[] = [];

  save(): void {}

  restore(): void {}

  fillRect(_x: number, _y: number, _width: number, _height: number): void {
    this.fillRects.push({ fillStyle: this.fillStyle });
  }

  strokeRect(): void {}

  fillText(): void {}

  measureText(text: string): TextMetrics {
    return { width: text.length * 8 } as TextMetrics;
  }
}
