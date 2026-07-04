import { assertEquals, assertThrows } from "@std/assert";
import { TERRAIN_CATALOG } from "@/src/map/terrain_palettes.ts";
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
        lights: [
          { x: 1, y: 0, color: "#66ccff", radius: 4, flickerAmount: 0.2, flickerSpeed: 9 },
        ],
      },
    ],
  });

  assertEquals(loaded.startMapName, "Fixture");
  assertEquals(loaded.gameMaps[0]?.terrain.palette, TERRAIN_CATALOG);
  assertEquals(loaded.gameMaps[0]?.lights, [
    { x: 1, y: 0, color: "#66ccff", radius: 4, flickerAmount: 0.2, flickerSpeed: 9 },
  ]);
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

  assertThrows(
    () =>
      loadGameMapsData({
        startMapName: "Fixture",
        maps: [
          {
            name: "Fixture",
            palette: "boot_sector",
            tiles: [[0]],
            entities: [
              { prefab: "player", x: 0, y: 0, dir: 1, goto: "victory" },
            ],
          },
        ],
      }),
    Error,
    'Unrecognized key: "goto"',
  );
});
