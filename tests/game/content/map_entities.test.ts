import { assertEquals } from "@std/assert";
import { type EntityPrefab, prefabBlocksMovement } from "@/src/game/content/map_entities.ts";

Deno.test("native map entity kinds own their movement-blocking trait", () => {
  assertEquals(
    ([
      "player",
      "npc",
      "enemy",
      "door",
      "key",
      "uplinkCode",
      "uplinkTerminal",
      "weaponPickup",
      "item",
      "decoration",
      "light",
      "sound",
      "spearPickup",
      "spearTurret",
    ] satisfies readonly EntityPrefab[]).filter(prefabBlocksMovement),
    ["player", "npc", "enemy", "door", "uplinkTerminal", "spearTurret"],
  );
});
