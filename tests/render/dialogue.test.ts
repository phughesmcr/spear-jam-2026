import { assertEquals } from "@std/assert";
import {
  dialogueLayout,
  dialogueOptionSlotAt,
  dialoguePanelRect,
  spearRevealLayout,
  wrapDialogueText,
} from "@/src/render/dialogue.ts";

const CANVAS = { width: 720, height: 1280 };
const THREE_CHOICES = [{ label: "CONTINUE." }, { label: "END TRANSMISSION." }, { label: "BYE!" }];

Deno.test("dialoguePanelRect centers a Strife-style panel over the first-person canvas", () => {
  assertEquals(dialoguePanelRect(CANVAS), {
    x: 50,
    y: 282,
    width: 620,
    height: 570,
  });
});

Deno.test("dialogueLayout stacks the portrait above speaker text and choices", () => {
  const layout = dialogueLayout(CANVAS, THREE_CHOICES);

  assertEquals(layout.portrait, { x: 72, y: 304, width: 576, height: 226 });
  assertEquals(layout.header, { x: 72, y: 540, width: 576, height: 29 });
  assertEquals(layout.message, { x: 72, y: 577, width: 576, height: 97 });
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

Deno.test("dialogueLayout keeps the portrait and bands fixed regardless of choice count", () => {
  const layout = dialogueLayout(CANVAS, [{ label: "GOT IT." }]);

  // Same portrait, header, and message as the three-choice layout: only the drawn choices differ.
  assertEquals(layout.portrait, { x: 72, y: 304, width: 576, height: 226 });
  assertEquals(layout.header, { x: 72, y: 540, width: 576, height: 29 });
  assertEquals(layout.message, { x: 72, y: 577, width: 576, height: 97 });
  assertEquals(layout.choices.map((choice) => ({ slot: choice.slot, label: choice.label, rect: choice.rect })), [
    {
      slot: 1,
      label: "GOT IT.",
      rect: { x: 72, y: 686, width: 576, height: 44 },
    },
  ]);
});

Deno.test("dialogueOptionSlotAt maps pointer hits to 44px dialogue buttons", () => {
  assertEquals(dialogueOptionSlotAt(CANVAS, THREE_CHOICES, { x: 100, y: 700 }), 1);
  assertEquals(dialogueOptionSlotAt(CANVAS, THREE_CHOICES, { x: 100, y: 750 }), 2);
  assertEquals(dialogueOptionSlotAt(CANVAS, THREE_CHOICES, { x: 100, y: 800 }), 3);
  assertEquals(dialogueOptionSlotAt(CANVAS, THREE_CHOICES, { x: 100, y: 733 }), undefined);
});

Deno.test("dialogueOptionSlotAt ignores rows that have no choice", () => {
  const oneChoice = [{ label: "GOT IT." }];

  // The single choice keeps slot 1's fixed position; the empty slots below are dead space.
  assertEquals(dialogueOptionSlotAt(CANVAS, oneChoice, { x: 100, y: 700 }), 1);
  assertEquals(dialogueOptionSlotAt(CANVAS, oneChoice, { x: 100, y: 750 }), undefined);
  assertEquals(dialogueOptionSlotAt(CANVAS, oneChoice, { x: 100, y: 800 }), undefined);
});

Deno.test("spear reveal keeps the landscape art intact and places choices below it", () => {
  const layout = spearRevealLayout(CANVAS, THREE_CHOICES.slice(0, 2));

  assertEquals(layout.image, { x: 16, y: 282, width: 688, height: 459 });
  assertEquals(layout.caption, { x: 78, y: 649, width: 564, height: 69 });
  assertEquals(layout.choices.map((choice) => choice.rect), [
    { x: 16, y: 749, width: 688, height: 44 },
    { x: 16, y: 799, width: 688, height: 44 },
  ]);
});

Deno.test("dialogueOptionSlotAt uses reveal choice positions for spear dialogue", () => {
  assertEquals(dialogueOptionSlotAt(CANVAS, THREE_CHOICES.slice(0, 2), { x: 100, y: 760 }, "spearReveal"), 1);
  assertEquals(dialogueOptionSlotAt(CANVAS, THREE_CHOICES.slice(0, 2), { x: 100, y: 810 }, "spearReveal"), 2);
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
