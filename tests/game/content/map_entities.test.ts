import { assertEquals, assertThrows } from "@std/assert";
import { ENTITY_SCHEMA, type EntityPrefab, prefabBlocksMovement } from "@/src/game/content/map_entities.ts";

Deno.test("native map entities expose only semantic game fields", () => {
  assertEquals(
    ENTITY_SCHEMA.parse({
      prefab: "enemy",
      x: 4,
      y: 5,
      dir: 1,
      attack: { minDamage: 2, maxDamage: 4, pattern: "adjacent", targets: "all" },
    }),
    {
      prefab: "enemy",
      x: 4,
      y: 5,
      dir: 1,
      attack: { minDamage: 2, maxDamage: 4, pattern: "adjacent", targets: "all" },
    },
  );

  assertThrows(
    () =>
      ENTITY_SCHEMA.parse({
        prefab: "enemy",
        x: 4,
        y: 5,
        facing: "east",
        attackMinDamage: 2,
      }),
    Error,
    "Unrecognized keys",
  );
});

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
