import { assertEquals, assertThrows } from "@std/assert";
import { DialogueTreeId, dialogueTreeText, validateDialogueTrees } from "@/src/dialogue/dialogue.ts";

Deno.test("dialogueTreeText returns authored dialogue lines", () => {
  assertEquals(dialogueTreeText(DialogueTreeId.JohnIntro), "Stay sharp.");
});

Deno.test("dialogueTreeText rejects unknown dialogue ids", () => {
  assertThrows(() => dialogueTreeText(255), Error, "Unknown dialogue tree id: 255");
});

Deno.test("validateDialogueTrees rejects missing mapped dialogue content", () => {
  assertThrows(
    () => validateDialogueTrees({}, { [DialogueTreeId.JohnIntro]: "john_intro" }),
    Error,
    'Missing dialogue tree "john_intro".',
  );
});

Deno.test("validateDialogueTrees rejects empty dialogue lines", () => {
  assertThrows(
    () => validateDialogueTrees({ john_intro: { lines: [] } }, { [DialogueTreeId.JohnIntro]: "john_intro" }),
    Error,
    'Dialogue tree "john_intro" must have at least one line.',
  );
});
