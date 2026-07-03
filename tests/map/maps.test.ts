import { assertEquals, assertThrows } from "@std/assert";
import { BOOT_SECTOR_PALETTE } from "@/src/map/terrain_palettes.ts";
import { loadGameMapsData } from "@/src/map/maps.ts";

Deno.test("loadGameMapsData validates compact compiled map data", () => {
  const loaded = loadGameMapsData({
    startMapName: "Fixture",
    maps: [
      {
        name: "Fixture",
        palette: "boot_sector",
        tiles: [[0, 0, 0]],
        entities: [
          { prefab: "player", x: 0, y: 0, dir: 1 },
          { prefab: "uplinkCode", x: 1, y: 0 },
          { prefab: "uplinkTerminal", x: 2, y: 0, goto: "victory" },
        ],
      },
    ],
  });

  assertEquals(loaded.startMapName, "Fixture");
  assertEquals(loaded.gameMaps[0]?.terrain.palette, BOOT_SECTOR_PALETTE);
});

Deno.test("loadGameMapsData rejects malformed compiled map data", () => {
  assertThrows(
    () =>
      loadGameMapsData({
        startMapName: "Fixture",
        maps: [
          {
            name: "Fixture",
            palette: "missing_palette",
            tiles: [[0]],
            entities: [],
          },
        ],
      }),
    Error,
    "Invalid compiled map data",
  );
});
