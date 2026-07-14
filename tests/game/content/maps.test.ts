import { assertEquals } from "@std/assert";
import { CAMPAIGN_CONTENT } from "@/src/game/content/maps/mod.ts";

Deno.test("native campaign content preserves the shipped campaign", () => {
  const signature = CAMPAIGN_CONTENT.maps.map((map) => ({
    name: map.name,
    width: map.tiles[0]?.length,
    height: map.tiles.length,
    entities: map.entities.length,
  }));

  assertEquals(CAMPAIGN_CONTENT.startMapName, "Boot Sector");
  assertEquals(signature, [
    { name: "Boot Sector", width: 15, height: 18, entities: 59 },
    { name: "Data Conduit", width: 15, height: 13, entities: 35 },
    { name: "Firewall", width: 17, height: 17, entities: 62 },
    { name: "The Nexus", width: 17, height: 17, entities: 50 },
    { name: "Mainframe Core", width: 19, height: 20, entities: 72 },
  ]);
  assertEquals(CAMPAIGN_CONTENT.maps.reduce((count, map) => count + map.entities.length, 0), 278);
});
