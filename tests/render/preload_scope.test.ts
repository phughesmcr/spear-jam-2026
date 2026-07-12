import { SpriteId } from "@/src/content/sprite_ids.ts";
import { GAME_MAPS, getMap, START_MAP_NAME } from "@/src/map/maps.ts";
import {
  criticalSpriteIdsForMap,
  mapNeedsDialogueAssets,
  mapNeedsSpearRevealAsset,
  spriteIdsForEntity,
} from "@/src/render/preload_scope.ts";
import { assertEquals } from "@std/assert";

Deno.test("spriteIdsForEntity maps authored prefabs to sprite ids", () => {
  assertEquals(spriteIdsForEntity({ prefab: "player", x: 0, y: 0, dir: 0 }), []);
  assertEquals(spriteIdsForEntity({ prefab: "npc", x: 0, y: 0, dir: 0, displayName: "john" }), [
    SpriteId.John,
  ]);
  assertEquals(spriteIdsForEntity({ prefab: "enemy", x: 0, y: 0, dir: 0, archetype: "meleeDog" }), [
    SpriteId.DigitalDog,
  ]);
  assertEquals(spriteIdsForEntity({ prefab: "key", x: 0, y: 0, color: "red" }), [SpriteId.RedKey]);
  assertEquals(spriteIdsForEntity({ prefab: "uplinkCode", x: 0, y: 0 }), [SpriteId.UplinkCode]);
  assertEquals(spriteIdsForEntity({ prefab: "uplinkTerminal", x: 0, y: 0, goto: "victory" }), [
    SpriteId.UplinkTerminal,
  ]);
  assertEquals(spriteIdsForEntity({ prefab: "weaponPickup", x: 0, y: 0, slot: 2 }), [SpriteId.Weapon2]);
  assertEquals(spriteIdsForEntity({ prefab: "item", x: 0, y: 0, item: "healthPatch", amount: 1 }), [
    SpriteId.HealthPatch,
  ]);
  assertEquals(spriteIdsForEntity({ prefab: "decoration", x: 0, y: 0, decoration: "serverPile" }), [
    SpriteId.DecorServerPile,
  ]);
  assertEquals(spriteIdsForEntity({ prefab: "spearPickup", x: 0, y: 0 }), [SpriteId.Spear]);
  assertEquals(spriteIdsForEntity({ prefab: "spearTurret", x: 0, y: 0 }), [
    SpriteId.SpearTurret,
    SpriteId.SpearTurretLoaded,
  ]);
  assertEquals(spriteIdsForEntity({ prefab: "door", x: 0, y: 0, slide: "east" }), []);
  assertEquals(spriteIdsForEntity({ prefab: "light", x: 0, y: 0, color: "#ffffff", radius: 3 }), []);
  assertEquals(
    spriteIdsForEntity({ prefab: "sound", x: 0, y: 0, soundId: "ambientHum", radius: 3 }),
    [],
  );
});

Deno.test("criticalSpriteIdsForMap always includes corpse", () => {
  const ids = criticalSpriteIdsForMap(getMap(START_MAP_NAME));
  assertEquals(ids.has(SpriteId.Corpse), true);
});

Deno.test("criticalSpriteIdsForMap covers every campaign map entity sprite", () => {
  for (const map of GAME_MAPS) {
    const ids = criticalSpriteIdsForMap(map);
    for (const entity of map.entities) {
      for (const spriteId of spriteIdsForEntity(entity)) {
        assertEquals(
          ids.has(spriteId),
          true,
          `${map.name}: missing sprite ${spriteId} for ${entity.prefab}`,
        );
      }
    }
  }
});

Deno.test("mapNeedsDialogueAssets matches NPC presence", () => {
  assertEquals(mapNeedsDialogueAssets(getMap("Boot Sector")), true);
  assertEquals(mapNeedsDialogueAssets(getMap("Data Conduit")), false);
});

Deno.test("mapNeedsSpearRevealAsset matches spear pickup presence", () => {
  assertEquals(mapNeedsSpearRevealAsset(getMap("The Nexus")), true);
  assertEquals(mapNeedsSpearRevealAsset(getMap("Data Conduit")), false);
});
