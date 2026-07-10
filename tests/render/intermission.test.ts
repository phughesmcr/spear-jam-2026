import { assertEquals } from "@std/assert";
import { promptAlpha, wrapIntermissionText } from "@/src/render/intermission.ts";

Deno.test("wrapIntermissionText wraps intro copy inside the text column", () => {
  const ctx = new FakeTextContext();

  assertEquals(wrapIntermissionText(ctx, "The first breach is open.", 84, 3), [
    "The first",
    "breach is",
    "open.",
  ]);
});

Deno.test("wrapIntermissionText preserves authored line breaks", () => {
  const ctx = new FakeTextContext();

  assertEquals(wrapIntermissionText(ctx, "The year is 2060.\nYou refused.", 180, 4), [
    "The year is 2060.",
    "You refused.",
  ]);
});

Deno.test("promptAlpha blinks the bottom intermission prompt", () => {
  assertEquals(promptAlpha(0), 1);
  assertEquals(promptAlpha(500), 0.24);
  assertEquals(promptAlpha(760), 1);
});

class FakeTextContext {
  font = "";

  measureText(text: string): TextMetrics {
    return { width: text.length * 8 } as TextMetrics;
  }
}
