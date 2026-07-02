import { assertEquals, assertThrows } from "@std/assert";
import { VERBS, verbToCommand } from "@/src/game/verbs.ts";

Deno.test("verbToCommand returns the selected verb command", () => {
  assertEquals(verbToCommand(VERBS.findIndex((verb) => verb.id === "examine")), { type: "examine" });
});

Deno.test("verbToCommand rejects invalid verb indexes", () => {
  assertThrows(() => verbToCommand(-1), RangeError);
  assertThrows(() => verbToCommand(VERBS.length), RangeError);
});
