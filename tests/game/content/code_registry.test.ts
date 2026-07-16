import { createCodeRegistry } from "@/src/game/content/code_registry.ts";
import { assert, assertEquals } from "@std/assert";

Deno.test("code registries snapshot and freeze their stable id order", () => {
  const ids = ["first", "second"];
  const registry = createCodeRegistry("fixture", ids);

  ids[0] = "second";
  assertEquals(registry.ids, ["first", "second"]);
  assertEquals(registry.decode(1), "first");
  assertEquals(registry.encode("second"), 2);
  assert(Object.isFrozen(registry.ids));
});
