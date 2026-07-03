import { assertEquals } from "@std/assert";
import { dialogueLayout, dialoguePanelRect, wrapDialogueText } from "@/src/render/dialogue.ts";

Deno.test("dialoguePanelRect centers a Strife-style panel over the first-person canvas", () => {
  assertEquals(dialoguePanelRect({ width: 720, height: 1280 }), {
    x: 50,
    y: 282,
    width: 620,
    height: 570,
  });
});

Deno.test("dialogueLayout keeps speaker text, portrait, and choices in stacked bands", () => {
  const layout = dialogueLayout({ width: 720, height: 1280 });

  assertEquals(layout.header, { x: 72, y: 290, width: 576, height: 29 });
  assertEquals(layout.message, { x: 72, y: 327, width: 576, height: 97 });
  assertEquals(layout.portrait, { x: 72, y: 434, width: 576, height: 279 });
  assertEquals(layout.choices.map((choice) => ({ slot: choice.slot, label: choice.label, rect: choice.rect })), [
    {
      slot: 1,
      label: "CONTINUE.",
      rect: { x: 72, y: 725, width: 576, height: 31 },
    },
    {
      slot: 2,
      label: "END TRANSMISSION.",
      rect: { x: 72, y: 762, width: 576, height: 31 },
    },
    {
      slot: 3,
      label: "BYE!",
      rect: { x: 72, y: 799, width: 576, height: 31 },
    },
  ]);
});

Deno.test("wrapDialogueText wraps without exceeding the configured line count", () => {
  const ctx = new FakeTextMeasure();

  assertEquals(wrapDialogueText(ctx, "IN A SMALL WORLD WORD TRAVELS FAST", 84, 2), [
    "IN A SMALL",
    "WORLD WORD",
  ]);
});

class FakeTextMeasure {
  measureText(text: string): TextMetrics {
    return { width: text.length * 7 } as TextMetrics;
  }
}
