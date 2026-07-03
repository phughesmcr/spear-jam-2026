import { assertEquals } from "@std/assert";
import { dialogueLayout, dialogueOptionSlotAt, dialoguePanelRect, wrapDialogueText } from "@/src/render/dialogue.ts";

const CANVAS = { width: 720, height: 1280 };

Deno.test("dialoguePanelRect centers a Strife-style panel over the first-person canvas", () => {
  assertEquals(dialoguePanelRect(CANVAS), {
    x: 50,
    y: 282,
    width: 620,
    height: 570,
  });
});

Deno.test("dialogueLayout keeps speaker text, portrait, and choices in stacked bands", () => {
  const layout = dialogueLayout(CANVAS);

  assertEquals(layout.header, { x: 72, y: 290, width: 576, height: 29 });
  assertEquals(layout.message, { x: 72, y: 327, width: 576, height: 97 });
  assertEquals(layout.portrait, { x: 72, y: 434, width: 576, height: 240 });
  assertEquals(layout.choices.map((choice) => ({ slot: choice.slot, label: choice.label, rect: choice.rect })), [
    {
      slot: 1,
      label: "CONTINUE.",
      rect: { x: 72, y: 686, width: 576, height: 44 },
    },
    {
      slot: 2,
      label: "END TRANSMISSION.",
      rect: { x: 72, y: 736, width: 576, height: 44 },
    },
    {
      slot: 3,
      label: "BYE!",
      rect: { x: 72, y: 786, width: 576, height: 44 },
    },
  ]);
});

Deno.test("dialogueOptionSlotAt maps pointer hits to 44px dialogue buttons", () => {
  assertEquals(dialogueOptionSlotAt(CANVAS, { x: 100, y: 700 }), 1);
  assertEquals(dialogueOptionSlotAt(CANVAS, { x: 100, y: 750 }), 2);
  assertEquals(dialogueOptionSlotAt(CANVAS, { x: 100, y: 800 }), 3);
  assertEquals(dialogueOptionSlotAt(CANVAS, { x: 100, y: 733 }), undefined);
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
