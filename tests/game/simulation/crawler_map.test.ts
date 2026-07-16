import { assertEquals } from "@std/assert";
import { mapBlocks, TerrainBlock } from "turn-based-engine/crawler";
import { createCrawlerMap } from "@/src/game/simulation/crawler_map.ts";
import { BarrierTexture, createGameMap } from "@/src/game/world/map.ts";
import { DEFAULT_BARS_TERRAIN_ID, DEFAULT_WALL_TERRAIN_ID } from "@/src/game/world/terrain_palette.ts";

Deno.test("createCrawlerMap preserves row order and maps every terrain blocking channel", () => {
  const source = createGameMap("Physics", [
    [0, DEFAULT_WALL_TERRAIN_ID],
    [DEFAULT_BARS_TERRAIN_ID, 0],
  ], []);

  const map = createCrawlerMap(source);

  assertEquals(map.width, 2);
  assertEquals(map.height, 2);
  assertEquals(map.terrain, [
    0,
    TerrainBlock.Movement | TerrainBlock.Sight | TerrainBlock.EffectLine,
    TerrainBlock.Movement | TerrainBlock.EffectLine,
    0,
  ]);
  assertEquals(mapBlocks(map, -1, 0, TerrainBlock.Movement), true);
  assertEquals(mapBlocks(map, 2, 0, TerrainBlock.Sight), true);
});

Deno.test("createCrawlerMap derives channels from tile flags rather than terrain kind", () => {
  const source = createGameMap("Custom Barrier", [[7]], [], {
    palette: [{
      kind: "barrier",
      id: 7,
      barrier_texture: BarrierTexture.Glass,
      floor_texture: "floor",
      ceiling_texture: "ceiling",
    }],
  });

  assertEquals(
    createCrawlerMap(source).terrain,
    [TerrainBlock.Movement | TerrainBlock.EffectLine],
  );
});
