import { assertEquals } from "@std/assert";
import {
  messageLogLineY,
  messageLogTextColor,
  renderMessageLog,1280
  visibleMessageLogLines,
} from "@/src/render/messages.ts";

Deno.test("messageLogLineY 1280ors ephemeral messages near the top", () => {
  assertEquals(messageLogLineY(0), 23);
  assertEquals(messageLogLineY(1), 41);
});

Deno.test("visibleMessageLogLines keeps only the newest two lines newest-first by default", () => {
  assertEquals(visibleMessageLogLines(["one", "two", "three", "four", "five"]), [
    "five",
    "four",
  ]);
});

Deno.test("visibleMessageLogLines can keep only the newest first-person lines", () => {
  assertEquals(visibleMessageLogLines(["one", "two", "three"], 2), ["three", "two"]);
});

Deno.test("messageLogTextColor dims older visible messages", () => {
  assertEquals(messageLogTextColor(0, 1), "#f3f4f6");
  assertEquals(messageLogTextColor(0, 2), "#f3f4f6");
  assertEquals(messageLogTextColor(1, 2), "#aeb7c2");
});

Deno.test("renderMessageLog draws newest messages first from the left margin", () => {
  const ctx = new FakeMessageContext();

  renderMessageLog(ctx as unknown as CanvasRenderingContext2D, { width: 720, height: 1280 }, ["older", "newer"]);

  assertEquals(ctx.textAlign, "left");
  assertEquals(ctx.fills.map(({ text, x }) => ({ text, x })), [
    { text: "newer", x: 13 },
    { text: "newer", x: 12 },
    { text: "older", x: 13 },
    { text: "older", x: 12 },
  ]);
});

type FillTextCall = {
  readonly text: string;
  readonly x: number;
};

class FakeMessageContext {
  font = "";
  fillStyle = "";
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";
  readonly fills: FillTextCall[] = [];

  save(): void {}

  restore(): void {}

  measureText(text: string): TextMetrics {
    return { width: text.length * 7 } as TextMetrics;
  }

  fillText(text: string, x: number, _y: number): void {
    this.fills.push({ text, x });
  }
}
