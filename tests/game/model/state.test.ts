import { assertEquals, assertThrows } from "@std/assert";
import { commandSlotForCode } from "@/src/game/model/state.ts";

Deno.test("commandSlotForCode validates command slot values", () => {
  assertEquals(commandSlotForCode(1), 1);
  assertEquals(commandSlotForCode(3), 3);
  assertThrows(() => commandSlotForCode(99), Error, "Unknown weapon slot");
});
